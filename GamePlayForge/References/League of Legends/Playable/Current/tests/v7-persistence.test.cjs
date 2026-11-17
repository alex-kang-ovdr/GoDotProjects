'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Game, MAP } = require('../dist/game.js');
const Checkpoint = require('../dist/checkpoint.js');
const Coach = require('../dist/coach.js');
const History = require('../dist/history.js');
const legacy4 = require('./fixtures/v4-checkpoint.json');
const legacy5 = require('./fixtures/v5-checkpoint.json');
// Generated from the actual pre-v7 Git HEAD game and navigation modules,
// after a ranger match ran for 16 seconds. This is not a relabelled v7 save.
const legacy6 = require('./fixtures/v6-checkpoint.json');

function storage(initial = null) {
  let raw = initial;
  return {
    getItem() { return raw; },
    setItem(key, value) { raw = value; },
    raw() { return raw; }
  };
}

function active(mapScale = 1) {
  const game = new Game({ mapScale, hero: 'mage', seed: 714 });
  game.start();
  return game;
}

test('every selectable map and speed survives saving, reading and paused restoration', () => {
  for (const mapScale of [1, 1.5, 2]) for (const speed of [0.5, 0.75, 1, 1.5]) {
    const game = active(mapScale), target = storage();
    const journey = Coach.read(game).journey;
    const saved = Checkpoint.write(target, game, { speed, journey }, 1794816000000);
    assert.equal(saved.ok, true, `${mapScale}x map / ${speed}x speed: ${saved.reason}`);
    const loaded = Checkpoint.read(target);
    assert.equal(loaded.status, 'ready', loaded.reason);
    const restored = Checkpoint.restore(loaded.checkpoint);
    assert.equal(restored.ok, true, restored.reason);
    assert.equal(restored.game.mapScale, mapScale);
    assert.equal(restored.game.map.width, 1600 * mapScale);
    assert.equal(restored.game.map.height, 1600 * mapScale);
    assert.equal(restored.ui.speed, speed);
    assert.deepEqual(restored.ui.journey, journey);
    assert.equal(restored.game.paused, true);
    const time = restored.game.time;
    restored.game.step(1 / 60);
    assert.equal(restored.game.time, time, 'Restoring settings does not unpause the match');
  }
});

test('journey metadata accepts large-map coordinates and remains bounded by the saved map', () => {
  for (const mapScale of [1.5, 2]) {
    const game = active(mapScale), target = storage();
    const origin = { x: game.map.width - 30, y: game.map.height - 30 };
    const journey = { version: 1, origin, completed: { equipment: true, move: true } };
    const written = Checkpoint.write(target, game, { speed: 0.75, journey }, 100);
    assert.equal(written.ok, true, written.reason);
    assert.deepEqual(Checkpoint.restore(Checkpoint.read(target).checkpoint).ui.journey.origin, origin);
    const invalid = Checkpoint.write(target, game, { speed: 0.75,
      journey: { ...journey, origin: { x: game.map.width + 1, y: 100 } } }, 101);
    assert.equal(invalid.ok, true);
    assert.equal(Object.hasOwn(invalid.checkpoint.ui, 'journey'), false);
  }
  const game = active(1), target = storage();
  const result = Checkpoint.write(target, game, { speed: 1, mapScale: 2,
    journey: { version: 1, origin: { x: 3100, y: 3100 }, completed: {} } }, 102);
  assert.equal(result.ok, true);
  assert.deepEqual(result.checkpoint.ui, { speed: 1 }, 'Untrusted UI metadata cannot enlarge world bounds');
});

test('authentic v4, v5 and v6 matches migrate to the base map and replace retired 2x speed', () => {
  for (const legacy of [legacy4, legacy5, legacy6]) {
    assert.equal(legacy.ui.speed, 2, 'Fixture retains its original speed');
    const target = storage(JSON.stringify(legacy));
    const loaded = Checkpoint.read(target);
    assert.equal(loaded.status, 'ready', loaded.reason);
    const restored = Checkpoint.restore(loaded.checkpoint);
    assert.equal(restored.ok, true, restored.reason);
    assert.equal(restored.game.mapScale, 1);
    assert.equal(restored.game.map.width, 1600);
    assert.equal(restored.ui.speed, 1.5);
    assert.deepEqual(restored.ui.journey, legacy.ui.journey);
    const saved = Checkpoint.write(target, restored.game, restored.ui, legacy.savedAt + 1);
    assert.equal(saved.ok, true, saved.reason);
    assert.equal(saved.checkpoint.state.engineVersion, 7);
    assert.equal(saved.checkpoint.state.state.mapScale, 1);
    assert.equal(JSON.parse(target.raw()).ui.speed, 1.5);
  }
});

test('unsupported speed metadata falls back safely without changing valid engine state', () => {
  const game = active(1.5), target = storage();
  for (const speed of ['0.75', '2', 0, -1, 3, Infinity, NaN, null]) {
    const saved = Checkpoint.write(target, game, { speed }, 500);
    assert.equal(saved.ok, true, saved.reason);
    const restored = Checkpoint.restore(Checkpoint.read(target).checkpoint);
    assert.equal(restored.ok, true);
    assert.equal(restored.ui.speed, 1);
    assert.equal(restored.game.mapScale, 1.5);
  }
  assert.deepEqual(Checkpoint.SPEEDS, [0.5, 0.75, 1, 1.5]);
  assert.equal(Object.isFrozen(Checkpoint.SPEEDS), true);
  assert.equal(Checkpoint.normalizeSpeed(2), 1.5);
});

test('tampered map scale and out-of-map actors are rejected on both read and restore', () => {
  const target = storage(), game = active(2);
  const saved = Checkpoint.write(target, game, { speed: 1.5 }, 900);
  assert.equal(saved.ok, true, saved.reason);
  for (const mutate of [
    value => { value.state.state.mapScale = 4; },
    value => { value.state.state.mapScale = '2'; },
    value => { delete value.state.state.mapScale; },
    value => { value.state.state.entities.find(e => e.id === 'player').x = 3201; },
    value => { value.state.engineVersion = 8; }
  ]) {
    const bad = JSON.parse(target.raw()); mutate(bad);
    assert.equal(Checkpoint.read(storage(JSON.stringify(bad))).status, 'invalid');
    assert.equal(Checkpoint.restore(bad).ok, false);
  }
});

test('an invalid export cannot replace the previous map-and-speed checkpoint', () => {
  const target = storage(), game = active(1.5);
  assert.equal(Checkpoint.write(target, game, { speed: 0.75 }, 1000).ok, true);
  const previous = target.raw(), exported = game.exportState();
  exported.state.mapScale = 99;
  game.exportState = () => exported;
  assert.equal(Checkpoint.write(target, game, { speed: 1.5 }, 1001).ok, false);
  assert.equal(target.raw(), previous);
  const restored = Checkpoint.restore(Checkpoint.read(target).checkpoint);
  assert.equal(restored.game.mapScale, 1.5);
  assert.equal(restored.ui.speed, 0.75);
});

test('coach retains large-map journey origin and detects movement instead of resetting progress', () => {
  for (const mapScale of [1.5, 2]) {
    const game = active(mapScale);
    const origin = { x: game.map.width - 170, y: game.map.height - 140 };
    const journey = { version: 1, origin, completed: { equipment: true } };
    game.player.x = origin.x + 120; game.player.y = origin.y;
    const result = Coach.read(game, journey);
    assert.deepEqual(result.journey.origin, origin);
    assert.equal(result.journey.completed.move, true);
    assert.equal(result.journey.completed.equipment, true);
  }
});

test('coach shopping and observed base threats follow the selected map base', () => {
  for (const mapScale of [1.5, 2]) {
    const game = active(mapScale);
    game.player.inventory = ['focus']; game.player.gold = 1000;
    Object.assign(game.player, game.map.bases[0]);
    assert.equal(Coach.recommend(game).atShop, true);
    assert.equal(Coach.recommend(game).canBuy, true);
    Object.assign(game.player, MAP.bases[0]);
    assert.equal(Coach.recommend(game).atShop, false);

    game.player.gold = 0;
    const enemy = game.entities.find(e => e.type === 'hero' && e.team === 1);
    game.isVisible = entity => entity === enemy || entity.team === 0;
    Object.assign(enemy, game.map.bases[0]);
    assert.equal(Coach.read(game).advice.id, 'defend');
    Object.assign(enemy, MAP.bases[0]);
    assert.notEqual(Coach.read(game).advice.id, 'defend');
  }
});

test('match history records selected map size while old and malformed sizes use the base map', () => {
  for (const mapScale of [1, 1.5, 2]) {
    const game = active(mapScale), target = storage();
    game.over = true; game.winner = 0; game.endReason = 'nexus';
    const record = History.makeRecord(game, '2026-11-16T12:00:00Z');
    assert.equal(record.mapScale, mapScale);
    assert.equal(History.append(target, record).persisted, true);
    assert.equal(History.read(target)[0].mapScale, mapScale);
  }
  const record = { id: 'legacy', winner: 0, time: 100, hero: 'mage' };
  for (const mapScale of [undefined, '2', 3, null]) {
    assert.equal(History.read(storage(JSON.stringify([{ ...record, mapScale }])))[0].mapScale, 1);
  }
});
