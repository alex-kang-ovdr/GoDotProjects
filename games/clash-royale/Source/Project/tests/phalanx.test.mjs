import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Game, CARDS, DEFAULT_DECK } from '../dist/js/engine.js';
import { BattleAI } from '../dist/js/ai.js';
import { ReplayPlayer, summarizeBattle } from '../dist/js/session.js';

const STEP = 1 / 60;
const DECK = DEFAULT_DECK.map(id => id === 'knight' ? 'phalanx' : id);
const clone = value => JSON.parse(JSON.stringify(value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function advance(game, seconds, observe) {
  for (let i = 0; i < Math.round(seconds / STEP); i++) { game.update(STEP); observe?.(game); }
}
function quiet(game) { for (const tower of game.state.towers) tower.active = false; }
// Explicit scenario setup: keep a valid eight-card cycle while positioning a
// desired card in hand. Replay tests below use untouched seeded opening hands.
function equip(game, team, id) {
  const hand = game.state.hands[team], queue = game.state.queues[team];
  if (!hand.includes(id)) {
    const index = queue.indexOf(id);
    assert.ok(index >= 0, `${id} must belong to the original deck`);
    [hand[0], queue[index]] = [queue[index], hand[0]];
  }
  game.state.elixir[team] = 10;
  return hand.indexOf(id);
}
function cast(game, team = 'player', x = 120, y = team === 'player' ? 440 : 200) {
  const result = game.playCard(team, equip(game, team, 'phalanx'), x, y);
  assert.equal(result.ok, true, result.reason);
  return result.groupId;
}
function fixture(options = {}) {
  const game = new Game({ deck: DECK, enemyDeck: DECK, seed: 12, rulesVersion: 3, ...options }).start();
  quiet(game);
  return game;
}
function dryBody(unit) {
  assert.ok(Number.isFinite(unit.x) && Number.isFinite(unit.y));
  assert.ok(unit.x >= unit.radius && unit.x <= 480 - unit.radius);
  assert.ok(unit.y >= unit.radius && unit.y <= 640 - unit.radius);
  if (unit.y > 300 - unit.radius + 1e-7 && unit.y < 340 + unit.radius - 1e-7) {
    assert.ok(Math.min(Math.abs(unit.x - 120), Math.abs(unit.x - 360)) + unit.radius <= 27 + 1e-6,
      `a soldier touches water at ${unit.x},${unit.y}`);
  }
}
function rejectedWithoutMutation(game, action) {
  const before = game.exportSnapshot();
  assert.equal(action().ok, false);
  assert.deepEqual(game.exportSnapshot(), before);
}

test('one paid phalanx cast creates exactly six members bound to its deck, command and detached preview', () => {
  const game = fixture();
  const index = equip(game, 'player', 'phalanx');
  const before = game.exportSnapshot();
  const preview = game.previewDeployment('player', 'phalanx', 240, 340);
  assert.equal(preview.ok, true);
  assert.deepEqual(game.exportSnapshot(), before);
  const next = game.state.queues.player[0];
  const result = game.playCard('player', index, 240, 340);
  assert.equal(result.ok, true);
  assert.equal(game.state.elixir.player, 5);
  assert.equal(game.state.hands.player[index], next);
  assert.equal(game.state.queues.player.at(-1), 'phalanx');
  assert.equal(game.state.stats.player.cardsPlayed, 1);
  assert.equal(game.state.units.length, 6);
  assert.deepEqual(game.state.units.map(({ x, y, radius, flying }) => ({ x, y, radius, flying })), preview.positions);
  assert.equal(game.state.formations.length, 1);
  assert.equal(game.commands[0].groupId, result.groupId);
  assert.ok(game.state.units.every(u => u.formationGroupId === result.groupId && u.formationState === 'forming'));
  const view = game.getAbilities('player');
  view[0].memberIds.length = 0; view[0].cost = -1;
  assert.equal(game.getAbilities('player')[0].memberIds.length, 6);
  assert.equal(game.getAbilities('player')[0].cost, 1);
  assert.deepEqual(game.getAbilities('invalid'), []);
  const retry = equip(game, 'player', 'phalanx');
  rejectedWithoutMutation(game, () => game.playCard('player', retry, 240, 200));
});

test('both teams preserve a 3-by-2 formation while crossing a bridge with whole-body river constraints', () => {
  for (const team of ['player', 'enemy']) {
    const game = fixture(), id = cast(game, team, 120, team === 'player' ? 420 : 220);
    let crossed = false, held = 0;
    advance(game, 8, () => {
      const group = game.state.formations.find(g => g.id === id);
      for (const unit of game.state.units) dryBody(unit);
      if (group.mode === 'guard') {
        const slots = game._formationSlots(group);
        assert.ok(slots.every(slot => distance(slot, game.state.units.find(u => u.id === slot.id)) < 1));
        assert.equal(game.getAbilities(team)[0].protected, true);
        held++;
      }
      crossed ||= game.state.units.every(u => team === 'player' ? u.y + u.radius < 300 : u.y - u.radius > 340);
    });
    assert.ok(held > 300);
    assert.equal(crossed, true);
  }
});

test('a rear-deployed formation detours around its own tower and reaches the opposite bank', () => {
  for (const team of ['player', 'enemy']) {
    const game = fixture(); cast(game, team, 120, team === 'player' ? 550 : 90);
    let crossed = false;
    advance(game, 25, () => {
      for (const u of game.state.units) dryBody(u);
      crossed ||= game.state.units.length === 6 && game.state.units.every(u => team === 'player' ? u.y + u.radius < 300 : u.y - u.radius > 340);
    });
    assert.equal(crossed, true, `${team} must escape its own tower`);
  }
});

test('a blocked bridge diverts the whole formation without entering the river or stalling at the building', () => {
  const game = fixture();
  assert.equal(game.playCard('player', equip(game, 'player', 'cannon'), 120, 350).ok, true);
  cast(game, 'player', 120, 440);
  let crossed = false;
  advance(game, 29, () => {
    for (const u of game.state.units.filter(u => u.cardId === 'phalanx')) {
      dryBody(u);
      crossed ||= u.y > 300 && u.y < 340 && Math.abs(u.x - 360) < 27;
    }
  });
  assert.equal(crossed, true, 'at least one member must take the unblocked bridge before the cannon expires');
});

test('guard defense reduces real single and simultaneous area damage, while stun or a broken formation removes it', () => {
  const game = fixture(); cast(game); advance(game, 2);
  const members = game.state.units;
  assert.ok(members.every(u => u.formationProtected));
  game._damage(members[0], 100, 'enemy');
  assert.equal(members[0].hp, 275);
  assert.equal(game.state.stats.enemy.damageDealt, 65);
  const ability = game.getAbilities('player')[0];
  const before = members.map(u => u.hp);
  game._areaDamage('enemy', ability.x, ability.y, 80, 100, 'all', null, 22, { stunDuration: .5 });
  assert.deepEqual(members.map((u, i) => before[i] - u.hp), [65, 65, 65, 65, 65, 65],
    'the first knockback/stun must not alter other members of the same impact');
  assert.equal(game.getAbilities('player')[0].protected, false);
  const hp = members[0].hp;
  game._damage(members[0], 100, 'enemy');
  assert.equal(hp - members[0].hp, 100);
  advance(game, 4);
  assert.equal(game.getAbilities('player')[0].protected, true, 'surviving soldiers actually reunite after impact');
});

test('guard protection needs at least three survivors and recovers only after survivors reform', () => {
  const game = fixture(); cast(game); advance(game, 2);
  const first = game.state.units[0];
  game._damage(first, first.hp, 'enemy', true); game._resolveDeaths();
  assert.equal(game.state.units.length, 5);
  assert.equal(game.getAbilities('player')[0].protected, false);
  advance(game, 2);
  assert.equal(game.getAbilities('player')[0].protected, true);
  for (const u of game.state.units.slice(0, 3)) game._damage(u, u.hp, 'enemy', true);
  game._resolveDeaths(); advance(game, 2);
  assert.equal(game.getAbilities('player')[0].aliveCount, 2);
  assert.equal(game.getAbilities('player')[0].protected, false);
});

test('a front soldier displaced behind its rear rank reforms through deterministic slot exchange instead of blocking the squad forever', () => {
  for (const team of ['player', 'enemy']) {
    const game = fixture(), id = cast(game, team); advance(game, 2);
    const group = game.state.formations.find(g => g.id === id);
    const displaced = game._entity(group.memberIds[1]);
    displaced.x = group.x - 8;
    displaced.y = group.y + (team === 'player' ? 31 : -31);
    group.mode = 'regroup'; group.settleTime = 0;
    const startY = group.y;
    advance(game, 4, () => game.state.units.forEach(dryBody));
    assert.equal(game.getAbilities(team)[0].protected, true);
    assert.ok(team === 'player' ? group.y < startY - 10 : group.y > startY + 10);
    assert.equal(new Set(group.memberIds).size, 6);
    assert.equal(game.state.units.length, 6);
  }
});

test('ability guards reject deployment, pause, training, foreign, invalid, empty-resource and dead-squad actions atomically', () => {
  const game = fixture(), id = cast(game);
  rejectedWithoutMutation(game, () => game.activateAbility('player', id));
  advance(game, 2);
  rejectedWithoutMutation(game, () => game.activateAbility('enemy', id));
  rejectedWithoutMutation(game, () => game.activateAbility('player', 'g99999'));
  rejectedWithoutMutation(game, () => game.activateAbility('spectator', id));
  game.pause(); rejectedWithoutMutation(game, () => game.activateAbility('player', id));
  game.resume(); game.state.elixir.player = .99;
  rejectedWithoutMutation(game, () => game.activateAbility('player', id));
  game.state.elixir.player = 5;
  for (const u of game.state.units) u.stunRemaining = 1;
  rejectedWithoutMutation(game, () => game.activateAbility('player', id));
  for (const u of game.state.units) u.hp = 0;
  game.update(STEP);
  assert.deepEqual(game.getAbilities('player'), []);
  rejectedWithoutMutation(game, () => game.activateAbility('player', id));
  const training = fixture({ practice: true, abilityMode: 'training' }), trainingId = cast(training);
  advance(training, 2);
  rejectedWithoutMutation(training, () => training.activateAbility('player', trainingId));
  const restored = Game.fromSnapshot(training.exportSnapshot()).start();
  rejectedWithoutMutation(restored, () => restored.activateAbility('player', trainingId));
});

test('charge spends one elixir, releases the formation, moves faster, then regroups without refreshing hit or stun clocks', () => {
  const game = fixture(), id = cast(game); advance(game, 2);
  const baseline = Game.fromSnapshot(game.exportSnapshot()).start();
  const elixir = game.state.elixir.player, cards = game.state.stats.player.cardsPlayed;
  game.state.units[0].attackCooldown = .71;
  game.state.units[0].stunRemaining = .2;
  assert.equal(game.activateAbility('player', id).ok, true);
  assert.equal(game.state.elixir.player, elixir - 1);
  assert.equal(game.state.stats.player.cardsPlayed, cards);
  assert.equal(game.state.stats.player.elixirSpent, 6);
  assert.equal(game.state.units[0].attackCooldown, .71);
  assert.equal(game.state.units[0].stunRemaining, .2);
  assert.ok(game.state.units.every(u => u.speed === 68 && !u.formationProtected && u.formationState === 'charge'));
  const hp = game.state.units[1].hp; game._damage(game.state.units[1], 100, 'enemy');
  assert.equal(hp - game.state.units[1].hp, 100);
  advance(game, 2); advance(baseline, 2);
  const mean = g => g.state.units.reduce((sum, u) => sum + u.y, 0) / g.state.units.length;
  assert.ok(mean(baseline) - mean(game) > 45, 'charge changes actual world progress, not only an icon');
  advance(game, 3);
  assert.equal(game.getAbilities('player')[0].chargeRemaining, 0);
  assert.equal(game.getAbilities('player')[0].mode, 'regroup');
  advance(game, 6);
  assert.equal(game.getAbilities('player')[0].mode, 'guard');
  assert.equal(game.getAbilities('player')[0].protected, true);
});

test('each squad has independent cooldown and its timers stop during pause', () => {
  const game = fixture(), first = cast(game, 'player', 120, 600), second = cast(game, 'player', 360, 600);
  advance(game, 2);
  assert.equal(game.activateAbility('player', first).ok, true);
  assert.equal(game.getAbilities('player').find(a => a.groupId === second).ready, true);
  assert.equal(game.activateAbility('player', second).ok, true);
  rejectedWithoutMutation(game, () => game.activateAbility('player', first));
  advance(game, 5);
  assert.ok(game.getAbilities('player').every(a => Math.abs(a.cooldownRemaining - 9) < 1e-6));
  game.pause(); const before = game.exportSnapshot(); advance(game, 20);
  assert.deepEqual(game.exportSnapshot(), before);
  game.resume(); advance(game, 8.9);
  rejectedWithoutMutation(game, () => game.activateAbility('player', first));
  advance(game, .1);
  assert.equal(game.getAbilities('player').find(a => a.groupId === first).ready, true);
});

test('snapshots during charge and regroup reproduce the exact future and reject malformed squad bindings', () => {
  const game = fixture(), id = cast(game, 'player', 240, 450); advance(game, 2);
  game.activateAbility('player', id); advance(game, 1.2);
  const saved = game.exportSnapshot();
  const restored = Game.fromSnapshot(saved).start();
  advance(game, 3.8); advance(restored, 3.8);
  assert.deepEqual(restored.exportSnapshot(), game.exportSnapshot());
  assert.equal(game.getAbilities('player')[0].mode, 'regroup');
  const regrouped = Game.fromSnapshot(game.exportSnapshot()).start();
  advance(game, 6); advance(regrouped, 6);
  assert.deepEqual(regrouped.exportSnapshot(), game.exportSnapshot());
  for (const corrupt of [
    s => { s.state.formations[0].memberIds[0] = 'missing'; },
    s => { s.state.formations[0].cooldownRemaining = 15; },
    s => { s.state.formations[0].spawnCommandIndex = 1; },
    s => { s.state.formations[0].id = 'g99999'; },
    s => { s.state.units[0].formationSlot = 5; },
    s => { s.commands.at(-1).groupId = 'g99999'; },
    s => { delete s.state.formations; },
  ]) { const invalid = clone(saved); corrupt(invalid); assert.throws(() => Game.fromSnapshot(invalid)); }
});

test('ability commands replay whole snapshots exactly, retain final-boundary concession and cannot be injected by viewers', () => {
  const game = new Game({ deck: DECK, seed: 12, rulesVersion: 3 }).start();
  const castResult = game.playCard('player', game.state.hands.player.indexOf('phalanx'), 240, 450);
  assert.equal(castResult.ok, true);
  advance(game, 3.5);
  assert.equal(game.activateAbility('player', castResult.groupId).ok, true);
  const replay = new ReplayPlayer(game.exportReplay());
  replay.seek(2);
  rejectedWithoutMutation(replay.game, () => replay.game.activateAbility('player', castResult.groupId));
  while (!replay.done) replay.step();
  assert.deepEqual(replay.game.exportSnapshot(), game.exportSnapshot(), 'an accepted command at the current final tick is retained');
  game.concede('player');
  const final = new ReplayPlayer(game.exportReplay());
  while (!final.done) final.step();
  assert.deepEqual(final.game.exportSnapshot(), game.exportSnapshot());
  const report = summarizeBattle(game);
  assert.equal(report.cards, 1); assert.equal(report.abilities, 1);
  assert.equal(report.elixirSpent, 6); assert.equal(report.abilityElixirSpent, 1); assert.equal(report.averageCost, 5);
  assert.deepEqual(report.byCard, [{ id: 'phalanx', count: 1, spent: 5 }]);
});

test('malformed, foreign, early and repeated replay ability commands fail explicitly', () => {
  const game = new Game({ deck: DECK, seed: 12, rulesVersion: 3 }).start();
  const { groupId } = game.playCard('player', game.state.hands.player.indexOf('phalanx'), 240, 450);
  advance(game, 3.5); game.activateAbility('player', groupId);
  const record = game.exportReplay();
  for (const alter of [
    r => { r.commands[1].team = 'enemy'; },
    r => { r.commands[1].groupId = 'g99999'; },
    r => { r.commands[1].abilityId = 'unknown'; },
    r => { r.commands[0].groupId = 'g99999'; },
    r => { r.commands[1].tick = 0; },
    r => { r.commands.push({ ...r.commands[1] }); },
  ]) {
    const invalid = clone(record); alter(invalid);
    assert.throws(() => { const replay = new ReplayPlayer(invalid); while (!replay.done) replay.step(); });
  }
});

function ownInformation(game, payments) {
  return {
    seed: game.seed, height: game.height,
    get state() {
      const s = game.state;
      return { ...s, hands: { enemy: s.hands.enemy, get player() { throw new Error('opponent hand is hidden'); } },
        elixir: { enemy: s.elixir.enemy, get player() { throw new Error('opponent elixir is hidden'); } } };
    },
    canDeploy: (...args) => game.canDeploy(...args),
    playCard: (...args) => game.playCard(...args),
    getAbilities(team) { assert.equal(team, 'enemy'); return game.getAbilities(team); },
    activateAbility(team, id) {
      assert.equal(team, 'enemy');
      const before = game.state.elixir.enemy, result = game.activateAbility(team, id);
      assert.equal(result.ok, true); assert.equal(game.state.elixir.enemy, before - 1);
      payments.push({ tick: game.state.tick, id }); return result;
    },
  };
}

test('AI pays for useful squad charges using only visible information and resumes/replays an identical future', () => {
  const game = new Game({ enemyDeck: DECK, seed: 1, rulesVersion: 3 }).start(), payments = [];
  assert.equal(game.playCard('enemy', game.state.hands.enemy.indexOf('phalanx'), 120, 220).ok, true);
  const ai = new BattleAI(ownInformation(game, payments), { difficulty: 'hard', seed: 9 });
  for (let i = 0; i < 600; i++) { ai.update(STEP); game.update(STEP); }
  assert.ok(payments.length > 0, 'this scenario must exercise a real AI ability, not only card deployment');
  const malformedAI = ai.exportSnapshot();
  malformedAI.lastDecision = { time: game.state.time, cardId: 'phalanx', intent: 'charge', x: 120, y: 220, groupId: {} };
  assert.throws(() => BattleAI.fromSnapshot(game, malformedAI));
  const restored = Game.fromSnapshot(game.exportSnapshot()).start();
  const otherAI = BattleAI.fromSnapshot(ownInformation(restored, []), ai.exportSnapshot());
  for (let i = 0; i < 1200; i++) { ai.update(STEP); game.update(STEP); otherAI.update(STEP); restored.update(STEP); }
  assert.deepEqual(otherAI.exportSnapshot(), ai.exportSnapshot());
  assert.deepEqual(restored.exportSnapshot(), game.exportSnapshot());
  const replay = new ReplayPlayer(game.exportReplay()); while (!replay.done) replay.step();
  assert.deepEqual(replay.game.exportSnapshot(), game.exportSnapshot());
  assert.ok(game.state.elixir.enemy >= 0 && game.state.elixir.enemy <= 10);
});

test('rules 2 reject the new card and pre-feature rules 2/3 snapshots retain their exact serialized shape and combat result', () => {
  assert.throws(() => new Game({ deck: DECK, rulesVersion: 2 }));
  const hashes = { 2: 'f4d5a11f6648d066ded781bede43fc50b88f92a64c189fd031a5df5d11e730a4',
    3: 'deea0da7bfcf5eab96ecf880d0680d677941312a68b7f3aba1a122405562635a' };
  for (const rulesVersion of [2, 3]) {
    const game = new Game({ seed: 79123, rulesVersion }).start();
    for (let tick = 0; tick < 1800; tick++) {
      if (tick % 73 === 0) for (const team of ['player', 'enemy']) {
        for (let i = 0; i < 4; i++) {
          const c = CARDS[game.state.hands[team][i]];
          const y = c.type === 'spell' ? team === 'player' ? 150 : 490 : team === 'player' ? 410 : 230;
          if (game.playCard(team, i, tick % 146 === 0 ? 120 : 360, y).ok) break;
        }
      }
      game.update(STEP);
    }
    const snapshot = game.exportSnapshot();
    assert.equal(Object.hasOwn(snapshot.state, 'formations'), false);
    assert.equal(Object.hasOwn(snapshot.config, 'abilityMode'), false);
    assert.equal(createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'), hashes[rulesVersion],
      'fingerprint captured from the shipped engine before adding phalanx');
  }
});

test('explicit practice HP removal still deletes a protected member without advancing time', () => {
  const game = fixture({ practice: true }); cast(game); advance(game, 2);
  const unit = game.state.units[0], tick = game.state.tick;
  assert.equal(unit.formationProtected, true);
  const result = game.applyPracticeEffect(unit.id, { damage: unit.hp });
  assert.equal(result.actualDamage, 340);
  assert.equal(game.state.tick, tick);
  assert.equal(game.state.units.length, 5);
  assert.equal(game.getAbilities('player')[0].aliveCount, 5);
  advance(game, 2); game.pause();
  assert.equal(game.getAbilities('player')[0].protected, true);
  const survivor = game.state.units[0];
  game.applyPracticeEffect(survivor.id, { stunDuration: 1 });
  assert.ok(game.state.units.every(u => u.formationProtected === false), 'a paused debug stun immediately updates the real shield indicator');
});

test('rules 4 are the default: a 70-percent shield cannot attack in forming, guard or regroup and attacks only during charge', () => {
  assert.equal(new Game({ seed: 1 }).rulesVersion, 4);
  assert.equal(CARDS.phalanx.damageReduction, .70);
  assert.equal(new Game({ rulesVersion: 3 }).getCard('phalanx').damageReduction, .35);
  for (const mode of ['forming', 'guard', 'regroup']) {
    const game = fixture({ rulesVersion: 4 }), id = cast(game); advance(game, 2);
    const group = game.state.formations[0];
    assert.equal(game.playCard('enemy', equip(game, 'enemy', 'giant'), 240, 220).ok, true);
    const target = game.state.units.find(u => u.cardId === 'giant');
    Object.assign(target, { x: group.x, y: group.y - 38, hp: 10000, maxHp: 10000, deployRemaining: 0, active: true, stunRemaining: 60 });
    group.mode = mode; group.settleTime = 0;
    advance(game, 2);
    assert.equal(game.state.stats.player.damageDealt, 0, `${mode} must not execute an attack`);
    assert.equal(target.hp, 10000);
    assert.equal(game.getAbilities('player')[0].protected, true);
    const member = game._entity(group.memberIds[0]), oldHp = member.hp;
    game._damage(member, 100, 'enemy');
    assert.ok(Math.abs(oldHp - member.hp - 30) < 1e-6);
    assert.equal(game.activateAbility('player', id).ok, true);
    const chargeHp = member.hp; game._damage(member, 100, 'enemy');
    assert.equal(chargeHp - member.hp, 100);
    advance(game, 1);
    assert.ok(game.state.stats.player.damageDealt > 0, 'the same in-range target is attacked after charging');
    advance(game, 4.1);
    const dealtAtEnd = game.state.stats.player.damageDealt;
    assert.equal(game.getAbilities('player')[0].chargeRemaining, 0);
    advance(game, 2);
    assert.equal(game.state.stats.player.damageDealt, dealtAtEnd, 'attacks stop when charge ends');
  }
});

test('rules-4 formation snapshots and paid ability replay reproduce the complete future', () => {
  const game = new Game({ deck: DECK, seed: 12, rulesVersion: 4 }).start();
  const { groupId } = game.playCard('player', game.state.hands.player.indexOf('phalanx'), 120, 420);
  advance(game, 3.5); assert.equal(game.activateAbility('player', groupId).ok, true); advance(game, 1);
  const saved = Game.fromSnapshot(game.exportSnapshot()).start();
  advance(game, 10); advance(saved, 10);
  assert.deepEqual(saved.exportSnapshot(), game.exportSnapshot());
  const replay = new ReplayPlayer(game.exportReplay()); while (!replay.done) replay.step();
  assert.deepEqual(replay.game.exportSnapshot(), game.exportSnapshot());
});

test('rules-3 phalanx guard damage and charge match exact snapshots captured before rules 4', () => {
  const hashes = ['6d3bdbdeb0af1208c2cc0d43cd690fa6d0ed6e73bd16abab77a1a6877113851a',
    'cd992696ce7d2ee3d5a390d9541c45607460d6a4907914d1b42a510999902e94'];
  for (const charge of [false, true]) {
    const game = new Game({ deck: DECK, seed: 12, rulesVersion: 3 }).start();
    const { groupId } = game.playCard('player', game.state.hands.player.indexOf('phalanx'), 120, 420);
    for (let tick = 0; tick < 1800 && game.state.running; tick++) {
      if (charge && tick === 210) game.activateAbility('player', groupId);
      if (tick % 170 === 0) for (let index = 0; index < 4; index++) {
        const c = CARDS[game.state.hands.enemy[index]];
        if (game.playCard('enemy', index, 120, c.type === 'spell' ? 420 : 220).ok) break;
      }
      game.update(STEP);
    }
    assert.equal(createHash('sha256').update(JSON.stringify(game.exportSnapshot())).digest('hex'), hashes[Number(charge)]);
    const replay = new ReplayPlayer(game.exportReplay()); while (!replay.done) replay.step();
    assert.deepEqual(replay.game.exportSnapshot(), game.exportSnapshot());
  }
});

test('developer phalanx tuning preserves charge and cooldown progress, supports future-only changes and remains isolated in a snapshot', () => {
  const game = new Game({ seed: 15, practice: true, developerMode: true }).start(); quiet(game);
  game.setDeveloperCheats({ infiniteElixir: { player: true } });
  const { groupId } = game.spawnDeveloperCard('player', 'phalanx', 120, 590);
  advance(game, 2); game.activateAbility('player', groupId); advance(game, 1);
  game.pause();
  const before = game.getAbilities('player')[0], group = game.state.formations[0];
  const tick = game.state.tick;
  assert.equal(game.setCardBalance('phalanx', { speed: 30, chargeSpeed: 90, abilityDuration: 10, abilityCooldown: 28 }, { team: 'player' }).ok, true);
  const after = game.getAbilities('player')[0];
  assert.equal(game.state.tick, tick); assert.equal(game.state.running, false);
  assert.ok(Math.abs(after.chargeRemaining / 10 - before.chargeRemaining / 5) < 1e-7);
  assert.ok(Math.abs(after.cooldownRemaining / 28 - before.cooldownRemaining / 14) < 1e-7);
  assert.ok(game.state.units.every(u => u.speed === 90));
  assert.equal(game.getCard('phalanx', 'enemy').chargeSpeed, 68);
  const applied = clone(group.balanceStats);
  assert.equal(game.setCardBalance('phalanx', { chargeSpeed: 120, abilityDuration: 2 }, { team: 'player', applyExisting: false }).ok, true);
  assert.equal(game.getCard('phalanx').chargeSpeed, 120);
  assert.deepEqual(group.balanceStats, applied);
  assert.equal(game.getAbilities('player')[0].duration, 10);
  const restored = Game.fromSnapshot(game.exportSnapshot());
  assert.deepEqual(restored.exportSnapshot(), game.exportSnapshot());
  game.resume(); restored.resume(); advance(game, 3); advance(restored, 3);
  assert.deepEqual(restored.exportSnapshot(), game.exportSnapshot());
  assert.ok(game.state.units.every(u => u.speed === 90), 'future-only tuning cannot change an existing charge on the next tick');
});
