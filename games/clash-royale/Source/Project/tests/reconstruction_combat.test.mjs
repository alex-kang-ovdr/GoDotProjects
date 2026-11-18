import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, CARDS, DEFAULT_DECK, selectSpellTargets } from '../dist/js/engine.js';
import { BattleAI } from '../dist/js/ai.js';

const STEP = 1 / 60;
const PROFILE = 'reconstructed-v4-lv11';
const DECK = ['minion_giant', 'vines', 'phalanx', 'knight', 'archers', 'bomber', 'fireball', 'zap'];
const copy = value => structuredClone(value);
const close = (actual, expected, label = 'value') => assert.ok(Math.abs(actual - expected) < 1e-6,
  `${label}: ${actual} != ${expected}`);
const success = result => { assert.equal(result?.ok, true, result?.reason); return result; };
function advance(game, seconds) {
  for (let tick = 0; tick < Math.round(seconds / STEP); tick++) game.update(STEP);
}
function fixture(options = {}) {
  const game = new Game({ seed: 4501, rulesVersion: 5, dataProfile: PROFILE, deck: DECK, enemyDeck: DECK,
    developerMode: true, practice: true, ...options }).start();
  success(game.setDeveloperCheats({ infiniteElixir: { player: true, enemy: true }, freePlacement: true }));
  for (const tower of game.state.towers) tower.active = false;
  return game;
}
function spawn(game, team, id, x = 240, y = team === 'player' ? 420 : 220) {
  const before = new Set(game.state.units.map(unit => unit.id));
  const result = success(game.spawnDeveloperCard(team, id, x, y));
  return { result, units: game.state.units.filter(unit => !before.has(unit.id)) };
}
function equip(game, team, id) {
  const hand = game.state.hands[team], queue = game.state.queues[team];
  if (!hand.includes(id)) {
    const at = queue.indexOf(id); assert.ok(at >= 0);
    [hand[0], queue[at]] = [queue[at], hand[0]];
  }
  return hand.indexOf(id);
}
function rejectedWithoutChange(game, action) {
  const before = game.exportSnapshot();
  assert.equal(action()?.ok, false);
  assert.deepEqual(game.exportSnapshot(), before);
}

test('new matches fix a research profile while legacy rules retain their original cards and serialization shape', () => {
  const game = new Game({ seed: 1 });
  assert.equal(game.rulesVersion, 5);
  assert.equal(game.dataProfile, PROFILE);
  assert.equal(game.getCard('bomber').damage, 212);
  assert.equal(game.getCard('fireball').crownDamage, 159);
  assert.equal(game.getCard('arrows').crownDamage, 75);
  assert.equal(game.getCard('zap').crownDamage, 48);
  assert.equal(game.getCard('spear_goblins').attackInterval, 1.6);
  assert.equal(game.getCard('poison').totalCrownDamage, 168);
  assert.equal(game.getCard('minion_giant').damage, 153);
  assert.equal(game.getCard('minion_giant').attackInterval, 1.7);
  assert.equal(game.exportReplay().config.dataProfile, PROFILE);
  assert.equal(Game.fromSnapshot(game.exportSnapshot()).dataProfile, PROFILE);
  const prototype = new Game({ seed: 1, dataProfile: 'prototype-v4' });
  for (const id of Object.keys(CARDS)) assert.deepEqual(prototype.getCard(id), CARDS[id]);
  assert.equal(prototype.getCard('minion_giant').damage, 135);
  for (const rulesVersion of [2, 3, 4]) {
    const legacy = new Game({ seed: 1, rulesVersion });
    assert.equal(legacy.getCard('bomber').damage, 165);
    assert.equal(legacy.getCard('poison').totalCrownDamage, 80);
    assert.equal(legacy.getCard('minion_giant'), null);
    assert.equal(legacy.getCard('vines'), null);
    assert.equal(legacy.exportSnapshot().config.dataProfile, undefined);
    assert.ok(legacy.state.towers.every(tower => tower.groundedRemaining === undefined));
    assert.deepEqual(Game.fromSnapshot(legacy.exportSnapshot()).exportSnapshot(), legacy.exportSnapshot());
    assert.throws(() => new Game({ rulesVersion, dataProfile: PROFILE }));
    assert.throws(() => new Game({ rulesVersion, deck: DEFAULT_DECK.map(id => id === 'giant' ? 'minion_giant' : id) }));
  }
  for (const dataProfile of ['unknown', 'constructor', {}, 5]) assert.throws(() => new Game({ dataProfile }));
  const missing = game.exportSnapshot(); delete missing.config.dataProfile;
  assert.throws(() => Game.fromSnapshot(missing));
});

test('research values precede live per-team overrides and reset returns to the active profile', () => {
  const game = fixture();
  success(game.setCardBalance('bomber', { damage: 345 }, { team: 'both' }));
  assert.equal(game.getCard('bomber', 'player').damage, 345);
  assert.equal(game.getCard('bomber', 'enemy').damage, 345);
  success(game.resetCardBalance('bomber', 'player'));
  assert.equal(game.getCard('bomber', 'player').damage, 212);
  assert.equal(game.getCard('bomber', 'enemy').damage, 345);
  assert.equal(CARDS.bomber.damage, 165);
  assert.equal(new Game({ seed: 2 }).getCard('bomber').damage, 212);
  assert.equal(Game.fromSnapshot(game.exportSnapshot()).getCard('bomber', 'enemy').damage, 345);
});

test('Vines selects current HP, then distance, then stable ID, caps at three and includes crown towers', () => {
  const entity = (id, hp, x, y, extra = {}) => ({ id, hp, maxHp: hp, x, y, team: 'enemy', radius: 10,
    flying: false, isBuilding: false, kind: 'troop', ...extra });
  const bodies = [entity('high', 1000, 200, 200), entity('near-z', 800, 190, 200),
    entity('near-a', 800, 210, 200), entity('far', 800, 270, 200),
    entity('damaged-tank', 700, 200, 205, { maxHp: 5000 }),
    entity('tower', 900, 235, 200, { isBuilding: true, kind: 'tower' }),
    entity('ally', 10000, 200, 200, { team: 'player' }), entity('outside', 20000, 400, 400),
    entity('dead', 0, 200, 200)];
  const before = copy(bodies);
  const select = values => selectSpellTargets(values, 'player', CARDS.vines, 200, 200).map(u => u.id);
  assert.deepEqual(select(bodies), ['high', 'tower', 'near-a']);
  assert.deepEqual(select([...bodies].reverse()), ['high', 'tower', 'near-a']);
  assert.deepEqual(select(bodies.filter(u => u.id !== 'tower')), ['high', 'near-a', 'near-z']);
  assert.deepEqual(bodies, before, 'preview selection must not sort or mutate live entity arrays');
});

test('Vines preview and actual cast share three targets, with final selection made after the cast delay', () => {
  const game = fixture();
  const tank = spawn(game, 'enemy', 'giant', 210, 210).units[0];
  const flyer = spawn(game, 'enemy', 'minion_giant', 270, 210).units[0];
  const knight = spawn(game, 'enemy', 'knight', 230, 260).units[0];
  const archers = spawn(game, 'enemy', 'archers', 275, 265).units;
  const before = game.exportSnapshot();
  const preview = game.previewDeployment('player', 'vines', 240, 235);
  assert.deepEqual(preview.affectedTargets.map(t => t.id), [tank.id, flyer.id, knight.id]);
  assert.deepEqual(game.exportSnapshot(), before);
  spawn(game, 'player', 'vines', 240, 235);
  game._updateSpells(.1);
  assert.equal(flyer.groundedRemaining, 0, 'the initial target preview must not apply a status');
  tank.hp = 40; knight.x = 430;
  const finalPreview = game.previewDeployment('player', 'vines', 240, 235).affectedTargets.map(t => t.id);
  assert.deepEqual(new Set(finalPreview), new Set([flyer.id, ...archers.map(u => u.id)]));
  const hp = new Map(game.state.units.map(u => [u.id, u.hp]));
  game._updateSpells(.25);
  const effect = game.state.effects.find(e => e.type === 'spell' && e.cardId === 'vines');
  assert.deepEqual(effect.selectedTargets.map(t => t.id), finalPreview);
  assert.deepEqual(game.getSpellResolutions().at(-1).hits.map(hit => hit.id), finalPreview);
  for (const unit of game.state.units) close(unit.hp, hp.get(unit.id) - (finalPreview.includes(unit.id) ? 90 : 0));
  assert.equal(flyer.groundedRemaining, 2);
  assert.ok(archers.every(u => u.stunRemaining === 2 && u.groundedRemaining === 0));
  assert.equal(tank.stunRemaining, 0);
});

test('Minion Giant attacks buildings from the air, crosses water directly and ignores displacement but not damage or stun', () => {
  const game = fixture();
  const flyer = spawn(game, 'player', 'minion_giant', 240, 380).units[0];
  const foe = spawn(game, 'enemy', 'knight', 240, 240).units[0];
  const tower = game.state.towers.find(t => t.id === 'enemy-left');
  assert.equal(game._validTarget(flyer, foe), false);
  assert.equal(game._validTarget(flyer, tower), true);
  const hp = foe.hp;
  game._attack(flyer, foe);
  assert.equal(game.state.projectiles.length, 0);
  assert.equal(foe.hp, hp);
  advance(game, 3);
  assert.ok(flyer.y > 300 && flyer.y < 340 && flyer.x > 170 && flyer.x < 300,
    'flight must cross water without detouring to the 120/360 bridges');
  const position = { x: flyer.x, y: flyer.y }, beforeHp = flyer.hp;
  game._areaDamage('enemy', flyer.x - 20, flyer.y, 70, 100, 'all', null, 22, { stunDuration: .5 });
  close(flyer.hp, beforeHp - 100);
  assert.deepEqual({ x: flyer.x, y: flyer.y }, position);
  assert.equal(flyer.stunRemaining, .5);
  assert.equal(flyer.knockbackImmune, true);
  game._attack(flyer, tower);
  assert.equal(game.state.projectiles.at(-1).cardId, 'minion_giant');
  game._updateProjectiles(2);
  assert.equal(tower.hp, tower.maxHp - game.getCard('minion_giant').damage);
  assert.ok(game.state.effects.some(e => e.type === 'hit' && e.cardId === 'minion_giant'));
});

test('grounding enables ground attacks without changing native flight or teleporting an aircraft over the river', () => {
  const game = fixture();
  const flyer = spawn(game, 'enemy', 'minion_giant', 240, 220).units[0];
  flyer.x = 240; flyer.y = 320;
  const groundAttack = { team: 'player', targets: 'ground' };
  assert.equal(game._validTarget(groundAttack, flyer), false);
  const before = flyer.hp;
  game._applyHit(flyer, 20, 'player', 'ground');
  assert.equal(flyer.hp, before);
  spawn(game, 'player', 'vines', flyer.x, flyer.y); game._updateSpells(.35);
  assert.equal(flyer.flying, true);
  assert.equal(game._validTarget(groundAttack, flyer), true);
  game._applyHit(flyer, 20, 'player', 'ground');
  close(flyer.hp, before - 90 - 20);
  const position = { x: flyer.x, y: flyer.y };
  advance(game, 1.9);
  assert.deepEqual({ x: flyer.x, y: flyer.y }, position);
  advance(game, .1);
  assert.ok(flyer.groundedRemaining < 1e-7);
  assert.equal(flyer.flying, true);
  assert.equal(game._validTarget(groundAttack, flyer), false);
  assert.ok(Math.hypot(flyer.x - position.x, flyer.y - position.y) <= flyer.speed * STEP + 1e-6,
    'expiration may resume one flight step, but must not clamp to a river bank');
});

test('a ground projectile can hit grounded aircraft but cannot hit after its flight eligibility returns', () => {
  for (const groundingDuration of [.1, 2]) {
    const game = fixture();
    const cannon = spawn(game, 'player', 'cannon', 240, 420).units[0];
    const flyer = spawn(game, 'enemy', 'minion_giant', 240, 220).units[0];
    success(game.setCardBalance('minion_giant', { speed: 0, damage: 0 }, { team: 'enemy' }));
    game._applyStatus(flyer, { groundingDuration, stunDuration: 2 });
    game._attack(cannon, flyer);
    assert.equal(game.state.projectiles.length, 1);
    const hp = flyer.hp;
    advance(game, .7);
    close(flyer.hp, groundingDuration > 1 ? hp - cannon.damage : hp);
  }
});

test('mid-grounding, airborne projectiles and pending targeted spells restore deterministically', () => {
  const game = fixture();
  const own = spawn(game, 'player', 'minion_giant', 200, 410).units[0];
  const foe = spawn(game, 'enemy', 'minion_giant', 260, 210).units[0];
  spawn(game, 'player', 'vines', foe.x, foe.y); game._updateSpells(.35);
  game._attack(own, game.state.towers.find(t => t.id === 'enemy-left'));
  spawn(game, 'enemy', 'vines', own.x, own.y);
  const snapshot = game.exportSnapshot(), restored = Game.fromSnapshot(snapshot).resume();
  assert.ok(snapshot.state.units.some(u => u.groundedRemaining > 0));
  assert.ok(snapshot.state.projectiles.length > 0 && snapshot.pendingSpells.length > 0);
  assert.equal(restored.getCard('minion_giant').damage, 153);
  advance(game, 3); advance(restored, 3);
  assert.deepEqual(restored.exportSnapshot(), game.exportSnapshot());
  for (const corrupt of [
    value => { value.state.units[0].groundedRemaining = -1; },
    value => { value.state.units[0].flying = false; },
    value => { value.state.units[0].knockbackImmune = false; },
    value => { value.state.effects.find(e => e.selectedTargets).selectedTargets[0].x = NaN; },
  ]) {
    const changed = copy(snapshot); corrupt(changed);
    assert.throws(() => Game.fromSnapshot(changed));
  }
});

test('target-count and status tuning affect new casts while already scheduled Vines retain their values', () => {
  const game = fixture();
  const flyer = spawn(game, 'enemy', 'minion_giant', 240, 220).units[0];
  spawn(game, 'enemy', 'knight', 200, 220);
  spawn(game, 'enemy', 'goblins', 275, 255);
  success(game.setCardBalance('vines', { maxTargets: 1, stunDuration: .5, groundingDuration: 1 }, { team: 'both' }));
  spawn(game, 'player', 'vines', 240, 235);
  success(game.setCardBalance('vines', { maxTargets: 4, stunDuration: 3, groundingDuration: 4 }, { team: 'both' }));
  const restored = Game.fromSnapshot(game.exportSnapshot());
  game._updateSpells(.35); restored._updateSpells(.35);
  assert.equal(game.state.effects.find(e => e.selectedTargets).selectedTargets.length, 1);
  assert.equal(flyer.stunRemaining, .5); assert.equal(flyer.groundedRemaining, 1);
  assert.deepEqual(restored.state.units, game.state.units);
  spawn(game, 'player', 'vines', 240, 235); game._updateSpells(.35);
  assert.equal(game.state.effects.filter(e => e.selectedTargets).at(-1).selectedTargets.length, 4);
  assert.equal(flyer.stunRemaining, 3); assert.equal(flyer.groundedRemaining, 4);
  assert.equal(game.getCard('vines', 'enemy').maxTargets, 4);
  for (const patch of [{ maxTargets: 0 }, { maxTargets: 9 }, { maxTargets: 2.5 }, { groundingDuration: -1 }, { stunDuration: 11 }]) {
    rejectedWithoutChange(game, () => game.setCardBalance('vines', patch, { team: 'both' }));
  }
});

test('both teams keep ordinary card rotation and paid statistics with new cards under infinite elixir', () => {
  const game = fixture();
  for (const [team, id, x, y] of [['player', 'minion_giant', 230, 420], ['enemy', 'vines', 230, 420]]) {
    const index = equip(game, team, id), next = game.state.queues[team][0];
    success(game.playCard(team, index, x, y));
    assert.equal(game.state.elixir[team], 10);
    assert.equal(game.state.hands[team][index], next);
    assert.equal(game.state.queues[team].at(-1), id);
    assert.equal(game.state.stats[team].cardsPlayed, 1);
    assert.equal(game.state.stats[team].elixirSpent, 4);
  }
  advance(game, 1);
  assert.deepEqual(game.state.elixir, { player: 10, enemy: 10 });
  assert.equal(Game.fromSnapshot(game.exportSnapshot()).getDeveloperState().cheats.infiniteElixir.enemy, true);
});

test('the rules-5 512-body cap rejects ordinary and developer deployments without changing resources, queues or commands', () => {
  const game = fixture();
  const source = spawn(game, 'player', 'knight', 210, 420).units[0];
  while (game.state.units.length < 512) game.state.units.push({ ...copy(source), id: `capacity-${game.state.units.length}` });
  for (const team of ['player', 'enemy']) {
    const index = equip(game, team, 'minion_giant');
    rejectedWithoutChange(game, () => game.playCard(team, index, 360, team === 'player' ? 420 : 220));
    for (const id of ['knight', 'goblins', 'cannon', 'phalanx', 'minion_giant']) {
      rejectedWithoutChange(game, () => game.spawnDeveloperCard(team, id, 360, team === 'player' ? 420 : 220));
    }
  }
  assert.equal(game.canDeploy('player', 'vines', 240, 220).ok, true, 'spells do not add bodies');
});

test('the new profile preserves 70% guarded Phalanx defense, no guard attacks and fast paid charge', () => {
  const game = fixture();
  const squad = spawn(game, 'player', 'phalanx', 120, 440);
  advance(game, 2);
  assert.equal(game.getAbilities('player')[0].protected, true);
  const member = squad.units[0], hp = member.hp;
  game._damage(member, 100, 'enemy'); close(member.hp, hp - 30);
  success(game.setCardBalance('knight', { speed: 0, damage: 0 }, { team: 'enemy' }));
  const group = game.state.formations[0];
  const foe = spawn(game, 'enemy', 'knight', group.x + 58, group.y).units[0];
  const foeHp = foe.hp;
  advance(game, .5); assert.equal(foe.hp, foeHp);
  const spent = game.state.stats.player.elixirSpent;
  success(game.activateAbility('player', squad.result.groupId));
  assert.ok(squad.units.every(u => u.formationState === 'charge' && u.speed === 68 && !u.formationProtected));
  assert.equal(game.state.stats.player.elixirSpent, spent + 1);
  assert.equal(game.state.elixir.player, 10);
  advance(game, .8); assert.ok(foe.hp < foeHp);
});

test('AI does not treat an unselected low-HP tower as a Vines finisher or count an unlimited swarm', () => {
  const game = fixture();
  const tower = game.state.towers.find(t => t.id === 'player-left'); tower.hp = 20;
  const positions = [[80, 450], [120, 430], [160, 450]];
  const blockers = positions.map(([x, y]) => spawn(game, 'player', 'giant', x, y).units[0]);
  const ai = new BattleAI(game, { difficulty: 'hard', seed: 4 });
  const candidates = [];
  ai.spellCandidates(candidates, 0, 'vines', game.getCard('vines', 'enemy'), blockers, [tower], [], [], []);
  assert.equal(candidates.some(c => c.intent === 'finish-tower'), false);
  assert.equal(candidates.length, 0, 'small damage to three healthy tanks has no unlimited AoE value');
  blockers[0].hp = 0;
  ai.spellCandidates(candidates, 0, 'vines', game.getCard('vines', 'enemy'), blockers.slice(1), [tower], [], [], []);
  assert.ok(candidates.some(c => c.intent === 'finish-tower'));
  const minionChoice = [];
  ai.attackCandidates(minionChoice, 0, 'minion_giant', game.getCard('minion_giant', 'enemy'),
    { tank: true, assault: true, ranged: true }, [], [tower], [], 10, [], false);
  assert.ok(minionChoice.some(c => c.intent === 'tank-push'));
});

test('two bodies converging on the same tower-detour corner progress instead of pushing each other indefinitely', () => {
  const game = fixture();
  const goblins = spawn(game, 'enemy', 'goblins', 310, 100).units;
  goblins[2].hp = 0;
  for (const tower of game.state.towers) if (tower.team === 'player' && tower.type === 'princess') tower.hp = 0;
  game._resolveDeaths();
  for (const tower of game.state.towers) tower.active = false;
  const positions = [{ x: 320.62025848961076, y: 111.81348145821191 }, { x: 312.61034187352993, y: 101.73493242591906 }];
  goblins.slice(0, 2).forEach((unit, index) => Object.assign(unit, positions[index], {
    active: true, deployRemaining: 0, attackCooldown: 0, targetId: 'player-king', bridgeX: 360,
    avoidance: { obstacleId: 'enemy-right', targetId: 'player-king',
      points: [{ x: 316, y: 106 }, { x: 316, y: 194 }], stage: 0 }
  }));
  const restored = Game.fromSnapshot(game.exportSnapshot()).resume();
  advance(game, 4); advance(restored, 4);
  assert.ok(goblins.slice(0, 2).every(unit => unit.y > 250), 'both goblins must leave their shared corner and approach the river');
  assert.deepEqual(restored.exportSnapshot(), game.exportSnapshot());
});
