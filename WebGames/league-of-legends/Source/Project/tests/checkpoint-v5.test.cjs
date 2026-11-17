'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Game } = require('../dist/game.js');
const Checkpoint = require('../dist/checkpoint.js');
const legacy = require('./fixtures/v4-checkpoint.json');

// Captured by the exact v4 game/navigation sources at commit
// c80555f4237b1c90ef3e38f69a9726310626b851. This is not a v5 export
// with a relabelled version: it contains a bought starter, deliberate move,
// already-hit piercing arrow, six pending R impacts and the next wave at 18s.
const clone = value => JSON.parse(JSON.stringify(value));
const DT = 1 / 60;
function storage(initial = null) {
  let raw = initial;
  return {
    writes: 0, removals: 0,
    getItem(key) { assert.equal(key, Checkpoint.KEY); return raw; },
    setItem(key, value) { assert.equal(key, Checkpoint.KEY); raw = value; this.writes++; },
    removeItem(key) { assert.equal(key, Checkpoint.KEY); raw = null; this.removals++; },
    raw() { return raw; }
  };
}

test('an authentic v4 slot reads and restores paused with resources and deliberate movement intact', () => {
  assert.equal(legacy.state.engineVersion, 4);
  assert.equal(Object.hasOwn(legacy.state.state, '_focusTargetId'), false);
  const target = storage(JSON.stringify(legacy));
  const read = Checkpoint.read(target);
  assert.equal(read.status, 'ready', read.reason);
  const result = Checkpoint.restore(read.checkpoint);
  assert.equal(result.ok, true, result.reason);
  const game = result.game;
  const player = legacy.state.state.entities.find(entity => entity.id === 'player');
  assert.equal(game.paused, true);
  assert.equal(game.time, legacy.state.state.time);
  for (const field of ['hero', 'level', 'hp', 'mana', 'gold', 'xp']) assert.equal(game.player[field], player[field], field);
  for (const field of ['inventory', 'skillRanks', 'cd']) assert.deepEqual(game.player[field], player[field], field);
  assert.deepEqual(game._input, { x: 0, y: 0 });
  assert.deepEqual(game._moveDestination, legacy.state.state._moveDestination);
  assert.deepEqual(result.ui, { ...legacy.ui, speed: 1.5 });
  assert.equal(game.getFocusTarget(), null);
  const upgraded = game.exportState();
  assert.equal(upgraded.engineVersion, 7);
  assert.equal(upgraded.state._focusTargetId, null);
  assert.equal(target.writes, 0, 'Reading or restoring must not replace the old slot before a successful save');
  assert.equal(target.removals, 0);
});

test('v4 projectile ownership and pending effects survive migration and identical current-engine continuation', () => {
  const game = Game.fromState(clone(legacy.state), { paused: false, clearInput: false });
  const arrow = game.projectiles.find(shot => shot.sourceId === 'player' && !shot.homing);
  assert.ok(arrow && arrow.hitIds instanceof Set && arrow.hitIds.size === 1);
  assert.equal(arrow.source, game.player);
  assert.equal(game._pending.filter(action => action.source === game.player).length, 6);
  const waveBefore = game.waveNumber;
  const copy = Game.fromState(clone(game.exportState()), { paused: false, clearInput: false });
  assert.deepEqual(copy.exportState(), game.exportState());
  for (let i = 0; i < 240; i++) { game.step(DT); copy.step(DT); }
  assert.deepEqual(copy.exportState(), game.exportState(), 'Migrating once or saving/restoring the current engine yields identical future state');
  assert.ok(game.waveNumber > waveBefore, 'The migrated game crosses the scheduled wave boundary');
  assert.equal(game._pending.some(action => action.sourceId === 'player'), false, 'Saved arrow rain fully resolves');
  assert.ok(game.time > legacy.state.state.time + 3.9);
});

test('the next successful save upgrades the old slot to the current engine without losing journey metadata', () => {
  const target = storage(JSON.stringify(legacy));
  const restored = Checkpoint.restore(Checkpoint.read(target).checkpoint);
  assert.equal(restored.ok, true, restored.reason);
  const saved = Checkpoint.write(target, restored.game, restored.ui, legacy.savedAt + 1000);
  assert.equal(saved.ok, true, saved.reason);
  assert.equal(target.writes, 1);
  assert.equal(target.removals, 0);
  const upgraded = JSON.parse(target.raw());
  assert.equal(upgraded.version, 1);
  assert.equal(upgraded.state.engineVersion, 7);
  assert.deepEqual(upgraded.ui, { ...legacy.ui, speed: 1.5 });
  assert.equal(Checkpoint.read(target).status, 'ready');
  assert.equal(Checkpoint.restore(upgraded).ok, true);
});

test('future or corrupt legacy slots are rejected without rewriting or deleting the stored bytes', () => {
  for (const mutate of [
    value => { value.state.engineVersion = 8; },
    value => { value.state.engineVersion = '4'; },
    value => { value.state.state._pending[0].sourceId = 'missing-hero'; },
    value => { value.state.state.entities.find(entity => entity.id === 'player').inventory = ['missing-item']; }
  ]) {
    const invalid = clone(legacy);
    mutate(invalid);
    const raw = JSON.stringify(invalid), target = storage(raw);
    assert.equal(Checkpoint.read(target).status, 'invalid');
    assert.equal(Checkpoint.restore(invalid).ok, false);
    assert.equal(target.raw(), raw);
    assert.equal(target.writes, 0);
    assert.equal(target.removals, 0);
  }
  const target = storage(JSON.stringify(legacy));
  const raw = target.raw();
  const invalidExporter = { started: true, over: false, exportState() {
    return { ...clone(legacy.state), engineVersion: 8 };
  } };
  assert.equal(Checkpoint.write(target, invalidExporter).ok, false);
  assert.equal(target.raw(), raw, 'Unsupported export must not overwrite the existing v4 slot');
  assert.equal(target.writes, 0);
});
