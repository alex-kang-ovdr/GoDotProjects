import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, CARDS } from '../dist/js/engine.js';
import { applyCheat, inspectTarget } from '../dist/js/debug.js';
import { BattleHistory } from '../dist/js/history.js';

const DT = 1 / 60;
const practice = (seed = 901, rulesVersion = 3) => new Game({ practice: true, seed, rulesVersion }).start();
const snapshot = game => game.exportSnapshot();

function advance(game, seconds) {
  for (let i = 0; i < Math.round(seconds / DT); i++) game.update(DT);
}

function spawn(game, team, cardId, x = 240, y = team === 'player' ? 420 : 220) {
  const hand = game.state.hands[team], queue = game.state.queues[team];
  if (!hand.includes(cardId)) {
    const queued = queue.indexOf(cardId);
    assert.ok(queued >= 0);
    [hand[0], queue[queued]] = [queue[queued], hand[0]];
  }
  assert.equal(applyCheat(game, { type: 'fill-elixir', team }).ok, true);
  const before = new Set(game.state.units.map(unit => unit.id));
  assert.equal(game.playCard(team, hand.indexOf(cardId), x, y).ok, true);
  return game.state.units.filter(unit => !before.has(unit.id));
}

const validActions = [
  { type: 'fill-elixir', team: 'both' },
  { type: 'heal-towers', team: 'enemy' },
  { type: 'clear-units', team: 'player' },
  { type: 'heal-target', id: 'enemy-left' },
  { type: 'damage-target', id: 'enemy-left', amount: 50 },
  { type: 'remove-target', id: 'enemy-left' },
  { type: 'stun-target', id: 'enemy-left' },
  { type: 'ready-target', id: 'enemy-left' },
];

test('every cheat rejects real normal games, training, replay and finished states without mutation', () => {
  const normal = new Game({ seed: 902 }).start();
  const training = practice(903), replay = practice(904), finished = practice(905);
  finished.concede('player');
  for (const [game, options] of [[normal, {}], [training, { training: true }], [replay, { replay: true }],
    [training, { training: {} }], [replay, { replay: {} }], [finished, {}]]) {
    const before = snapshot(game);
    for (const action of validActions) assert.equal(applyCheat(game, action, options).ok, false);
    assert.deepEqual(snapshot(game), before);
  }
  assert.equal(applyCheat({ practice: true, state: normal.state }, validActions[0]).ok, false);
  assert.equal(applyCheat(null, validActions[0]).ok, false);
  const sandbox = practice(906), before = snapshot(sandbox);
  assert.equal(applyCheat(sandbox, validActions[0], null).ok, false);
  assert.equal(applyCheat(sandbox, validActions[0], []).ok, false);
  assert.deepEqual(snapshot(sandbox), before);
});

test('invalid actions, target IDs and numeric bounds fail before any counter, log or state changes', () => {
  const game = practice(907);
  game.pause();
  const invalid = [null, [], {}, { type: 'missing' }, { type: 'fill-elixir' },
    { type: 'fill-elixir', team: 'draw' }, { type: 'heal-towers', team: null }, { type: 'clear-units', team: 1 }];
  for (const type of ['heal-target', 'damage-target', 'remove-target', 'stun-target', 'ready-target']) {
    invalid.push({ type, id: '__proto__', amount: 10 }, { type, id: null, amount: 10 });
  }
  for (const amount of [undefined, null, 0, -1, Infinity, NaN, 100001, '50']) invalid.push({ type: 'damage-target', id: 'enemy-left', amount });
  for (const duration of [null, 0, -1, Infinity, NaN, 10.01, '3']) invalid.push({ type: 'stun-target', id: 'enemy-left', duration });
  const before = snapshot(game);
  for (const action of invalid) assert.equal(applyCheat(game, action).ok, false);
  assert.deepEqual(snapshot(game), before);

  const normal = new Game({ seed: 908 }).start(), normalBefore = snapshot(normal);
  assert.equal(normal.applyPracticeEffect('enemy-left', { damage: 50 }).ok, false);
  assert.deepEqual(snapshot(normal), normalBefore, 'engine practice adapter also protects normal combat');
  for (const effect of [null, [], {}, { damage: -1 }, { damage: Infinity }, { damage: 100001 }, { stunDuration: 11 }]) {
    assert.equal(game.applyPracticeEffect('enemy-left', effect).ok, false);
  }
  assert.deepEqual(snapshot(game), before);
});

test('elixir fill affects only selected resources and never creates spend, card or damage statistics', () => {
  const game = practice(909);
  game.state.elixir.player = 1.25; game.state.elixir.enemy = 2.5;
  game.pause();
  const expected = snapshot(game);
  const first = applyCheat(game, { type: 'fill-elixir', team: 'player' });
  assert.deepEqual(first.affectedTeams, ['player']);
  expected.state.elixir.player = 10;
  assert.deepEqual(snapshot(game), expected);
  const both = applyCheat(game, { type: 'fill-elixir', team: 'both' });
  assert.deepEqual(both.affectedTeams, ['enemy']);
  expected.state.elixir.enemy = 10;
  assert.deepEqual(snapshot(game), expected);
  assert.deepEqual(applyCheat(game, { type: 'fill-elixir', team: 'both' }).affectedTeams, []);
  assert.deepEqual(snapshot(game), expected);
});

test('healing restores only living selected HP without reviving towers or resetting building lifetime', () => {
  const game = practice(910);
  const [cannon] = spawn(game, 'player', 'cannon');
  advance(game, .5);
  game.pause();
  applyCheat(game, { type: 'damage-target', id: 'enemy-left', amount: 100 });
  applyCheat(game, { type: 'damage-target', id: 'enemy-king', amount: 50 });
  applyCheat(game, { type: 'damage-target', id: 'player-left', amount: 25 });
  applyCheat(game, { type: 'remove-target', id: 'enemy-right' });
  applyCheat(game, { type: 'damage-target', id: cannon.id, amount: 250 });
  const before = snapshot(game), life = cannon.lifetime;
  const result = applyCheat(game, { type: 'heal-towers', team: 'enemy' });
  assert.deepEqual(result.affectedIds, ['enemy-left', 'enemy-king']);
  const dead = game.state.towers.find(t => t.id === 'enemy-right');
  assert.equal(dead.hp, 0); assert.equal(dead.destroyed, true);
  assert.equal(game.state.towers.find(t => t.id === 'player-left').hp, 1825);
  assert.equal(game.state.towers.find(t => t.id === 'enemy-king').active, true, 'healing does not deactivate an awakened king');
  assert.equal(applyCheat(game, { type: 'heal-target', id: cannon.id }).ok, true);
  assert.equal(cannon.hp, cannon.maxHp);
  assert.equal(cannon.lifetime, life);
  assert.deepEqual(game.state.stats, before.state.stats);
  assert.equal(game.state.time, before.state.time);
  assert.equal(game.state.tick, before.state.tick);
  assert.equal(game.state.running, false);
  const healed = snapshot(game);
  for (const type of ['heal-target', 'remove-target', 'stun-target', 'ready-target']) {
    assert.equal(applyCheat(game, { type, id: dead.id }).ok, false);
  }
  assert.deepEqual(snapshot(game), healed);
});

test('paused damage activates kings and tower removals use normal crowns, destruction totals and victory', () => {
  const game = practice(911);
  advance(game, .25); game.pause();
  const before = snapshot(game);
  const hit = applyCheat(game, { type: 'damage-target', id: 'enemy-king', amount: 123.5 });
  assert.equal(hit.actualDamage, 123.5);
  const king = game.state.towers.find(t => t.id === 'enemy-king');
  assert.equal(king.hp, king.maxHp - 123.5);
  assert.equal(king.active, true);
  assert.equal(game.state.stats.player.damageDealt, 123.5);
  assert.equal(game.state.running, false);
  assert.deepEqual(game.state.towers.filter(t => t.id !== king.id), before.state.towers.filter(t => t.id !== king.id));

  const princess = applyCheat(game, { type: 'remove-target', id: 'enemy-left' });
  assert.equal(princess.actualDamage, 1850);
  assert.equal(game.state.crowns.player, 1);
  assert.equal(game.state.stats.player.towersDestroyed, 1);
  const removed = snapshot(game);
  assert.equal(applyCheat(game, { type: 'remove-target', id: 'enemy-left' }).ok, false);
  assert.deepEqual(snapshot(game), removed);

  const fatal = applyCheat(game, { type: 'damage-target', id: king.id, amount: 100000 });
  assert.equal(fatal.actualDamage, king.maxHp - 123.5, 'overkill only credits remaining real HP');
  assert.equal(game.state.winner, 'player');
  assert.equal(game.state.reason, 'king');
  assert.equal(game.state.phase, 'finished');
  assert.equal(game.state.crowns.player, 3);
  assert.equal(game.state.stats.player.towersDestroyed, 2);
  assert.equal(game.state.stats.player.damageDealt, 1850 + king.maxHp);
  assert.equal(game.state.stats.player.cardsPlayed, 0);
  assert.equal(game.state.stats.player.elixirSpent, 0);
  assert.equal(game.state.time, before.state.time);
  assert.equal(game.state.tick, before.state.tick);
  assert.deepEqual(game.commands, before.commands);
  const history = new BattleHistory();
  assert.equal(history.add(game, { id: 'cheated-practice', opponentId: 'bran' }), false);
  assert.deepEqual(history.list(), [], 'a debug victory cannot enter normal completed-match records');
  assert.doesNotThrow(() => Game.fromSnapshot(snapshot(game)));
});

test('removing a player king or an overtime princess resolves the correct opposing winner without a tick', () => {
  const ownKing = practice(912), before = ownKing.state.tick;
  applyCheat(ownKing, { type: 'remove-target', id: 'player-king' });
  assert.equal(ownKing.state.winner, 'enemy');
  assert.equal(ownKing.state.crowns.enemy, 3);
  assert.equal(ownKing.state.stats.enemy.towersDestroyed, 1);
  assert.equal(ownKing.state.running, false);
  assert.equal(ownKing.state.tick, before);

  const overtime = practice(913);
  overtime.state.time = 180; overtime.state.phase = 'overtime'; overtime.pause();
  assert.equal(applyCheat(overtime, { type: 'remove-target', id: 'enemy-right' }).ok, true);
  assert.equal(overtime.state.winner, 'player');
  assert.equal(overtime.state.reason, 'suddenDeath');
  assert.equal(overtime.state.time, 180);
  assert.equal(overtime.state.tick, 0);
});

test('unit clearing filters teams, handles groups and buildings, and leaves resources and towers intact', () => {
  const game = practice(914);
  const goblins = spawn(game, 'player', 'goblins', 190, 420);
  const [cannon] = spawn(game, 'player', 'cannon', 270, 420);
  const [enemy] = spawn(game, 'enemy', 'knight');
  game.pause();
  const before = snapshot(game), total = goblins.reduce((sum, u) => sum + u.hp, 0) + cannon.hp;
  const result = applyCheat(game, { type: 'clear-units', team: 'player' });
  assert.deepEqual(result.affectedIds, [...goblins.map(u => u.id), cannon.id]);
  assert.equal(result.actualDamage, total);
  assert.deepEqual(game.state.units, [enemy]);
  assert.equal(game.state.stats.enemy.damageDealt, before.state.stats.enemy.damageDealt + total);
  assert.equal(game.state.stats.player.damageDealt, before.state.stats.player.damageDealt);
  for (const key of ['elixir', 'hands', 'queues', 'crowns', 'towers', 'projectiles', 'areas']) {
    assert.deepEqual(game.state[key], before.state[key], key);
  }
  assert.deepEqual(game.commands, before.commands);
  assert.equal(game.state.time, before.state.time);
  assert.equal(game.state.tick, before.state.tick);
  assert.equal(game.state.running, false);
  const enemyHp = enemy.hp;
  assert.equal(applyCheat(game, { type: 'clear-units', team: 'both' }).actualDamage, enemyHp);
  assert.deepEqual(game.state.units, []);
  const empty = snapshot(game);
  assert.deepEqual(applyCheat(game, { type: 'clear-units', team: 'both' }).affectedIds, []);
  assert.deepEqual(snapshot(game), empty);
});

test('stun and readiness work while paused, preserve HP and lifetime, and never wake an undamaged king', () => {
  const game = practice(915);
  const [cannon] = spawn(game, 'player', 'cannon');
  game.pause();
  const before = snapshot(game), life = cannon.lifetime;
  assert.equal(applyCheat(game, { type: 'stun-target', id: cannon.id }).ok, true);
  assert.equal(cannon.stunRemaining, 3);
  assert.equal(applyCheat(game, { type: 'stun-target', id: cannon.id, duration: 10 }).ok, true);
  assert.equal(cannon.stunRemaining, 10);
  cannon.frostRemaining = 1; cannon.slowRemaining = 1; cannon.slowFactor = .8;
  assert.equal(applyCheat(game, { type: 'ready-target', id: cannon.id }).ok, true);
  assert.equal(cannon.deployRemaining, 0);
  assert.equal(cannon.active, true);
  assert.equal(cannon.attackCooldown, 0);
  for (const key of ['stunRemaining', 'frostRemaining', 'slowRemaining']) assert.equal(cannon[key], 0);
  assert.equal(cannon.slowFactor, 1);
  assert.equal(cannon.hp, cannon.maxHp);
  assert.equal(cannon.lifetime, life);
  const king = game.state.towers.find(t => t.id === 'player-king');
  applyCheat(game, { type: 'stun-target', id: king.id, duration: .25 });
  applyCheat(game, { type: 'ready-target', id: king.id });
  assert.equal(king.active, false);
  assert.equal(king.stunRemaining, 0);
  assert.equal(king.attackCooldown, 0);
  assert.deepEqual(game.state.stats, before.state.stats);
  assert.deepEqual(game.state.elixir, before.state.elixir);
  assert.deepEqual(game.commands, before.commands);
  assert.equal(game.state.running, false);
  assert.equal(game.state.time, before.state.time);
  assert.equal(game.state.tick, before.state.tick);
});

test('practice snapshots preserve debug edits and resume identical future combat in both rulesets', () => {
  for (const rulesVersion of [2, 3]) {
    const game = practice(916, rulesVersion);
    const [giant] = spawn(game, 'player', 'giant', 120, 550);
    applyCheat(game, { type: 'ready-target', id: giant.id });
    applyCheat(game, { type: 'damage-target', id: giant.id, amount: 80 });
    applyCheat(game, { type: 'stun-target', id: giant.id, duration: .5 });
    game.pause();
    applyCheat(game, { type: 'fill-elixir', team: 'both' });
    const saved = snapshot(game), restored = Game.fromSnapshot(saved);
    assert.equal(restored.practice, true);
    assert.equal(restored.state.running, false);
    assert.deepEqual(snapshot(restored), saved);
    game.resume(); restored.resume();
    const position = [giant.x, giant.y];
    advance(game, .2); advance(restored, .2);
    assert.deepEqual([giant.x, giant.y], position, 'the applied stun actually prevents movement');
    for (const g of [game, restored]) applyCheat(g, { type: 'ready-target', id: giant.id });
    advance(game, 1); advance(restored, 1);
    assert.ok(Math.hypot(giant.x - position[0], giant.y - position[1]) > 0);
    assert.deepEqual(snapshot(restored), snapshot(game));
  }
});

test('target inspection works in ordinary games and returns detached live entity and card data', () => {
  const game = practice(917);
  const [unit] = spawn(game, 'player', 'knight');
  const before = snapshot(game), inspected = inspectTarget(game, unit.id);
  assert.equal(inspected.entity.id, unit.id);
  assert.equal(inspected.card.id, 'knight');
  for (const key of ['hp', 'maxHp', 'x', 'y', 'range', 'damage', 'attackInterval', 'attackCooldown', 'speed', 'targetId']) {
    assert.deepEqual(inspected.entity[key], unit[key]);
  }
  inspected.entity.hp = 0; inspected.entity.targetId = 'fake'; inspected.card.damage = 99999;
  assert.deepEqual(snapshot(game), before);
  assert.equal(CARDS.knight.damage, 145);
  const normal = new Game({ seed: 918 });
  const tower = inspectTarget(normal, 'player-king');
  assert.equal(tower.entity.type, 'king'); assert.equal(tower.card, null);
  assert.equal(inspectTarget(normal, 'missing'), null);
  assert.equal(inspectTarget({}, 'player-king'), null);
  applyCheat(game, { type: 'remove-target', id: unit.id });
  assert.equal(inspectTarget(game, unit.id), null);
});
