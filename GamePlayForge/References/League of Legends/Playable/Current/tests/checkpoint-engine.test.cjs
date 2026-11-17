'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Game, MAP } = require('../dist/game.js');

const DT = 1 / 60;
const json = value => JSON.parse(JSON.stringify(value));
function create(hero = 'mage') { const game = new Game({ hero, seed: 321 }); game.start(); return game; }
function advance(game, seconds) { for (let i = 0; i < Math.ceil(seconds / DT); i++) game.step(DT); }
function restoreRunning(game) { return Game.fromState(json(game.exportState()), { paused: false, clearInput: false }); }
function compareContinuation(original, restored, seconds) {
  assert.deepEqual(restored.exportState(), original.exportState(), 'Restoration preserves every serialized rule state');
  for (let i = 0; i < Math.ceil(seconds / DT); i++) { original.step(DT); restored.step(DT); }
  assert.deepEqual(restored.exportState(), original.exportState(), 'The same simulation steps produce the same complete state');
}

function combatCheckpoint() {
  const game = create('ranger');
  advance(game, 17.9);
  game.gainXp(game.player, 1000);
  game.autoAllocateSkills();
  Object.assign(game.player, { x: 800, y: 800, alive: true, hp: game.player.maxHp, autoAttack: false });
  // The first natural wave may have only a few survivors by 17.9 seconds.
  // Spawn real minions for this controlled piercing fixture; the scheduled
  // 18-second wave still remains pending and is crossed by the comparison.
  game._spawnWave();
  const targets = game.entities.filter(entity => entity.type === 'minion' && entity.team === 1 && entity.alive).slice(0, 3);
  assert.equal(targets.length, 3);
  targets.forEach((target, i) => Object.assign(target, { x: 860 + i * 45, y: 800, stunnedUntil: 1000 }));
  game._rebuildIndex();
  assert.equal(game.cast('q', 1050, 800).ok, true);
  assert.equal(game.cast('r', 950, 800).ok, true);
  game.step(DT);
  return game;
}

test('JSON checkpoints preserve piercing hit history, delayed area hits, wave spawns and RNG exactly', () => {
  const game = combatCheckpoint();
  const arrow = game.projectiles.find(projectile => projectile.sourceId === 'player' && !projectile.homing);
  assert.ok(arrow && arrow.hitIds.size === 1, 'The arrow has already hit one target and must not hit it again after restoration');
  assert.equal(game._pending.filter(action => action.sourceId === 'player').length, 6);
  const waveBefore = game.waveNumber;
  const restored = restoreRunning(game);
  const restoredArrow = restored.projectiles.find(projectile => projectile.id === arrow.id);
  assert.ok(restoredArrow.hitIds instanceof Set);
  assert.equal(restoredArrow.source, restored.player, 'Attack ownership uses the restored live entity, not a detached duplicate');
  assert.equal(restored._pending.find(action => action.sourceId === 'player').source, restored.player);
  compareContinuation(game, restored, 4);
  assert.ok(game.waveNumber > waveBefore, 'The comparison crosses a real wave boundary');
  assert.equal(game._pending.some(action => action.sourceId === 'player'), false, 'All six saved delayed impacts resolve');
});

test('restoring pauses by default, releases held movement and retains deliberate click or attack movement', () => {
  for (const command of ['commandMove', 'commandAttackMove']) {
    const game = create();
    assert.equal(game[command](900, 800).ok, true);
    const restored = Game.fromState(json(game.exportState()));
    assert.equal(restored.paused, true);
    assert.deepEqual(restored._input, { x: 0, y: 0 });
    assert.deepEqual(restored._moveDestination, game._moveDestination);
    assert.deepEqual(restored._attackMoveDestination, game._attackMoveDestination);
    restored.step(1);
    assert.equal(restored.time, game.time, 'A restored game cannot progress before the player chooses to resume');
  }
  const game = create();
  game.setInputVector(1, 0);
  assert.deepEqual(Game.fromState(json(game.exportState()))._input, { x: 0, y: 0 });
  assert.deepEqual(restoreRunning(game)._input, { x: 1, y: 0 });
});

test('a dead minion already cleaned from the world remains the owner of its in-flight attack', () => {
  const game = create();
  const source = game.entities.find(entity => entity.type === 'minion' && entity.team === 0 && entity.kind === 'ranged');
  const target = game.entities.find(entity => entity.type === 'minion' && entity.team === 1);
  Object.assign(source, { x: 760, y: 800, attackCooldown: 0 });
  Object.assign(target, { x: 920, y: 800, stunnedUntil: 1000 });
  game._rebuildIndex();
  assert.equal(game._attack(source, target), true);
  game.damage(source, 1e6, target, 'true');
  // The ordinary cleanup can remove a corpse before its 2.2-second projectile
  // expires. Reproduce that removal without discarding the live projectile.
  game.entities = game.entities.filter(entity => entity !== source);
  game._rebuildIndex();
  const checkpoint = json(game.exportState());
  assert.equal(checkpoint.sources.length, 1);
  assert.equal(checkpoint.sources[0].id, source.id);
  const restored = Game.fromState(checkpoint, { paused: false, clearInput: false });
  assert.equal(restored.entities.some(entity => entity.id === source.id), false);
  assert.equal(restored.projectiles[0].source.id, source.id);
  assert.equal(restored.projectiles[0].source.alive, false);
  compareContinuation(game, restored, 0.5);
});

test('a checkpoint resumes the remaining recall channel and the active team order', () => {
  const game = create();
  assert.equal(game.recall().ok, true);
  advance(game, 1.2);
  assert.ok(game.player.recallLeft > 0 && game.player.recallLeft < 4);
  assert.equal(game.setTeamOrder('push').ok, true);
  const restored = restoreRunning(game);
  compareContinuation(game, restored, 3.1);
  assert.equal(game.player.recallLeft, 0);
  assert.ok(Math.hypot(game.player.x - MAP.bases[0].x, game.player.y - MAP.bases[0].y) < 190);
  assert.equal(restored.order.type, 'push');
});

test('death timer, actual damage recap and eventual respawn survive JSON restoration', () => {
  const game = create();
  const enemy = game.entities.find(entity => entity.type === 'hero' && entity.team === 1);
  game.damage(game.player, 50, enemy, 'magic');
  game.damage(game.player, 1e6, enemy, 'physical');
  assert.equal(game.player.alive, false);
  const recap = game.getDeathRecap();
  assert.ok(recap && recap.totalDamage > 0);
  const restored = restoreRunning(game);
  assert.deepEqual(restored.getDeathRecap(), recap);
  compareContinuation(game, restored, game.player.respawnIn + 0.2);
  assert.equal(restored.player.alive, true);
  assert.deepEqual(restored.getDeathRecap(), recap, 'The last recap remains available after respawn');
});

test('a pending neutral hazard restores its fixed target and applies the same future impact', () => {
  const game = create();
  const dragon = game.entities.find(entity => entity.id === 'dragon');
  game.time = 45;
  Object.assign(dragon, { alive: true, inCombat: true, targetId: 'player', attackCooldown: 100, nextHazardAt: 100 });
  Object.assign(game.player, { x: dragon.homeX - 100, y: dragon.homeY, autoAttack: false });
  game._rebuildIndex();
  game._startMonsterHazard(dragon, game.player);
  const savedHazard = game.getHazards()[0];
  assert.ok(savedHazard);
  const restored = restoreRunning(game);
  assert.deepEqual(restored.getHazards(), game.getHazards());
  const hpBefore = game.player.hp;
  compareContinuation(game, restored, 1.2);
  assert.ok(game.player.hp < hpBefore, 'The pending impact was retained, not dropped');
  assert.equal(restored._hazards.some(hazard => hazard.id === savedHazard.id), false);
});

test('exported and imported data are detached from mutable game objects', () => {
  const game = create();
  const original = game.exportState();
  original.state.entities.find(entity => entity.id === 'player').gold = 999999;
  assert.equal(game.player.gold, 600);
  const saved = json(game.exportState());
  const restored = Game.fromState(saved);
  saved.state.entities.find(entity => entity.id === 'player').hp = 1;
  saved.state.teamBuffs[0].dragonStacks = 4;
  assert.equal(restored.player.hp, game.player.hp);
  assert.equal(restored.teamBuffs[0].dragonStacks, 0);
  restored.player.inventory.push('boots');
  assert.equal(game.player.inventory.length, 0);
});

test('only ongoing matches can be exported and an ended state cannot be imported as active', () => {
  const game = new Game();
  assert.throws(() => game.exportState(), /저장된 경기/);
  game.start();
  const checkpoint = json(game.exportState());
  assert.equal(game.surrender().ok, true);
  assert.throws(() => game.exportState(), /저장된 경기/);
  checkpoint.state.over = true;
  assert.throws(() => Game.fromState(checkpoint), /inactive match/);
});

test('corrupt, incompatible or incomplete checkpoint data is rejected without changing an active game', () => {
  const game = combatCheckpoint();
  const before = game.exportState();
  const mutations = [
    data => { data.version = 99; },
    data => { data.engineVersion = 3; },
    data => { data.state.time = NaN; },
    data => { data.state.entities.find(entity => entity.id === 'player').cd.q = null; },
    data => { delete data.state.entities.find(entity => entity.id === 'player').inventory; },
    data => { data.state.entities.find(entity => entity.id === 'player').skillPoints += 1; },
    data => { data.state.entities.push(data.state.entities[0]); },
    data => { data.state.entities = data.state.entities.filter(entity => entity.id !== 'player'); },
    data => { data.state._pending[0].sourceId = 'missing'; },
    data => { data.state._pending[0].kind = 'unknown'; },
    data => { data.state.projectiles.find(projectile => !projectile.homing).hitIds = {}; },
    data => { data.state.projectiles[0].sourceId = 'missing'; },
    data => { data.state._ids = 1; },
    data => { data.state.entities = Array(513).fill(data.state.entities[0]); },
    data => { data.state._input.x = 20; },
    data => { data.state.teamBuffs[0].dragonStacks = 5; }
  ];
  for (const mutate of mutations) {
    const malformed = json(before);
    mutate(malformed);
    assert.throws(() => Game.fromState(malformed), /저장된 경기/, String(mutate));
  }
  assert.deepEqual(game.exportState(), before);
  assert.throws(() => Game.fromState(JSON.parse('{"__proto__":{"polluted":true}}')), /unsafe key/);
  assert.throws(() => Game.fromState(null), /missing checkpoint/);
  assert.equal({}.polluted, undefined);
});

test('starter preparation buys real hero equipment before start without moving the player', () => {
  for (const [hero, item, price, stat] of [['mage', 'focus', 500, 'abilityPower'], ['warrior', 'blade', 420, 'damage'], ['ranger', 'bow', 550, 'attackSpeed']]) {
    const game = new Game({ hero });
    const start = { x: game.player.x, y: game.player.y, stat: game.player[stat] };
    assert.equal(game.buy(item).ok, false, 'The public shop still respects location before a match');
    assert.equal(game.prepareItem(item).ok, true);
    assert.equal(game.player.gold, 600 - price);
    assert.deepEqual(game.player.inventory, [item]);
    assert.ok(game.player[stat] > start.stat);
    assert.deepEqual({ x: game.player.x, y: game.player.y }, { x: start.x, y: start.y });
    game.start();
    assert.deepEqual(game.player.inventory, [item]);
    const before = game.exportState();
    assert.equal(game.prepareItem('boots').ok, false);
    assert.deepEqual(game.exportState(), before, 'Preparation cannot be used as an in-match remote shop');
  }
});

test('starter purchases preserve gold and inventory on failure and use normal atomic recipe costs', () => {
  const game = new Game({ hero: 'warrior' });
  assert.equal(game.prepareItem('blade').ok, true);
  assert.equal(game.player.gold, 180);
  const before = json(game.player);
  assert.equal(game.prepareItem('missing').ok, false);
  assert.equal(game.prepareItem('constructor').ok, false);
  assert.equal(game.prepareItem('__proto__').ok, false);
  assert.equal(game.prepareItem('edge').ok, false);
  assert.deepEqual(game.player, before);
  game.player.gold += 120;
  const combined = game.prepareItem('edge');
  assert.deepEqual(combined.consumedIndices, [0]);
  assert.equal(combined.cost, 300);
  assert.equal(game.player.gold, 0);
  assert.deepEqual(game.player.inventory, ['edge']);
  assert.equal(game.player.damage, 64 + 34);
  game.player.gold = 10000;
  for (let i = 0; i < 5; i++) assert.equal(game.prepareItem('boots').ok, true);
  const full = json(game.player);
  assert.equal(game.prepareItem('heart').ok, false);
  assert.deepEqual(game.player, full);
});
