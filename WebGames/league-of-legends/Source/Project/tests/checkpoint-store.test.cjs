'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { Game } = require('../dist/game.js');
const Checkpoint = require('../dist/checkpoint.js');

function storage(initial = null) {
  let value = initial;
  return {
    writes: 0, removals: 0, denyWrite: false,
    getItem(key) { assert.equal(key, Checkpoint.KEY); return value; },
    setItem(key, data) {
      assert.equal(key, Checkpoint.KEY);
      if (this.denyWrite) throw new Error('Quota exceeded');
      value = data; this.writes++;
    },
    removeItem(key) { assert.equal(key, Checkpoint.KEY); value = null; this.removals++; },
    raw() { return value; }
  };
}

function activeGame() {
  const game = new Game({ hero: 'mage', seed: 123, difficulty: 'normal' });
  game.start();
  for (let i = 0; i < 30; i++) game.step(1 / 60);
  return game;
}

function saved() {
  const target = storage();
  const game = activeGame();
  const result = Checkpoint.write(target, game, { speed: 2 }, 1794657600000);
  assert.equal(result.ok, true, result.reason);
  return { target, game, checkpoint: result.checkpoint };
}

test('checkpoint exposes the same browser/CommonJS API without requiring a DOM', () => {
  assert.equal(Checkpoint.KEY, 'nexus-front-checkpoint');
  assert.equal(Checkpoint.SCHEMA, 1);
  assert.equal(Checkpoint.MAX_BYTES, 2097152);
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../dist/checkpoint.js'), 'utf8'), context);
  for (const method of ['read', 'write', 'remove', 'restore']) assert.equal(typeof context.NexusCheckpoint[method], 'function');
  assert.equal(context.NexusCheckpoint.read().status, 'unavailable');
  assert.equal(context.NexusCheckpoint.read({ getItem() { return null; } }).status, 'empty');
});

test('one active match round-trips with exact time, hero state and paused restoration', () => {
  const { target, game, checkpoint } = saved();
  assert.equal(target.writes, 1);
  assert.equal(checkpoint.version, 1);
  assert.equal(checkpoint.savedAt, 1794657600000);
  const result = Checkpoint.read(target);
  assert.equal(result.status, 'ready', result.reason);
  const resumed = Checkpoint.restore(result.checkpoint);
  assert.equal(resumed.ok, true, resumed.reason);
  assert.equal(resumed.game.time, game.time);
  assert.equal(resumed.game.player.hero, game.player.hero);
  assert.equal(resumed.game.player.hp, game.player.hp);
  assert.equal(resumed.game.player.mana, game.player.mana);
  assert.equal(resumed.game.paused, true);
  assert.equal(resumed.game.started, true);
  assert.equal(resumed.game.over, false);
  assert.equal(resumed.ui.speed, 1.5);
  const time = resumed.game.time;
  resumed.game.step(1);
  assert.equal(resumed.game.time, time, 'A restored match must not advance before explicit resume');
});

test('journey metadata preserves only six boolean milestones, bounded origin and supported speed', () => {
  const game = activeGame(), target = storage();
  const result = Checkpoint.write(target, game, {
    speed: 9, secret: 'discard', journey: {
      version: 1, origin: { x: 560, y: 1040, extra: 42 },
      completed: { equipment: true, move: true, skill: 'true', cs: 1, growth: false, structure: true, fake: true },
      fake: 'discard'
    }
  }, 1000);
  assert.equal(result.ok, true, result.reason);
  assert.deepEqual(result.checkpoint.ui, {
    speed: 1, journey: { version: 1, origin: { x: 560, y: 1040 }, completed: {
      equipment: true, move: true, skill: false, cs: false, growth: false, structure: true
    } }
  });
  const invalidOrigin = Checkpoint.write(target, game, {
    speed: 2, journey: { version: 1, origin: { x: -1, y: Infinity }, completed: { move: true } }
  }, 1001);
  assert.equal(invalidOrigin.ok, true);
  assert.deepEqual(invalidOrigin.checkpoint.ui, { speed: 1.5 });
});

test('written/read/restored nested state does not retain caller or live game aliases', () => {
  const { target, game, checkpoint } = saved();
  const originalHp = game.player.hp;
  const savedPlayer = checkpoint.state.state.entities.find(entity => entity.id === 'player');
  savedPlayer.hp = 1;
  assert.equal(game.player.hp, originalHp);
  const firstRead = Checkpoint.read(target);
  const secondRead = Checkpoint.read(target);
  firstRead.checkpoint.state.state.entities.find(entity => entity.id === 'player').hp = 2;
  assert.equal(secondRead.checkpoint.state.state.entities.find(entity => entity.id === 'player').hp, originalHp);
  const resumed = Checkpoint.restore(secondRead.checkpoint);
  resumed.game.player.hp = 3;
  assert.equal(secondRead.checkpoint.state.state.entities.find(entity => entity.id === 'player').hp, originalHp);
});

test('denied/quota writes leave the prior valid slot intact and never report success', () => {
  const { target, game } = saved();
  const before = target.raw();
  target.denyWrite = true;
  game.step(1);
  const result = Checkpoint.write(target, game, {}, 2000);
  assert.equal(result.ok, false);
  assert.ok(result.reason);
  assert.equal(target.raw(), before);
  assert.equal(target.removals, 0);
  assert.equal(target.writes, 1);
  assert.equal(Checkpoint.read(target).status, 'ready');
});

test('storage read failure and localStorage property denial are reported without throwing', () => {
  assert.equal(Checkpoint.read({ getItem() { throw new Error('denied'); } }).status, 'unavailable');
  const context = vm.createContext({});
  vm.runInContext('Object.defineProperty(globalThis,"localStorage",{get(){throw new Error("denied")}})', context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../dist/checkpoint.js'), 'utf8'), context);
  assert.equal(context.NexusCheckpoint.read().status, 'unavailable');
  assert.equal(context.NexusCheckpoint.remove().ok, false);
  assert.equal(Checkpoint.write(null, activeGame()).ok, false);
});

test('empty, malformed JSON and unsupported wrapper/engine versions are distinguished', () => {
  assert.equal(Checkpoint.read(storage()).status, 'empty');
  for (const raw of ['', '{', '[]', 'null', '{}']) assert.equal(Checkpoint.read(storage(raw)).status, 'invalid');
  const { checkpoint } = saved();
  for (const changed of [
    { ...checkpoint, version: 2 }, { ...checkpoint, savedAt: -1 }, { ...checkpoint, savedAt: 'today' },
    { ...checkpoint, state: { ...checkpoint.state, version: 2 } },
    { ...checkpoint, state: { ...checkpoint.state, engineVersion: 8 } }
  ]) assert.equal(Checkpoint.read(storage(JSON.stringify(changed))).status, 'invalid');
});

test('read validates full engine state before offering a ready continuation', () => {
  const { checkpoint } = saved();
  checkpoint.state.state.entities = [];
  const target = storage(JSON.stringify(checkpoint));
  const result = Checkpoint.read(target);
  assert.equal(result.status, 'invalid');
  assert.ok(result.reason);
  assert.equal(target.removals, 0, 'Invalid data is not silently destroyed by a read');
  assert.equal(Checkpoint.restore(checkpoint).ok, false);
});

test('UTF-8 byte limit rejects oversized valid JSON even when character count is below 2 MiB', () => {
  const { checkpoint } = saved();
  const raw = JSON.stringify({ ...checkpoint, padding: '한'.repeat(710000) });
  assert.ok(raw.length < Checkpoint.MAX_BYTES);
  assert.ok(Buffer.byteLength(raw, 'utf8') > Checkpoint.MAX_BYTES);
  assert.equal(Checkpoint.read(storage(raw)).status, 'invalid');
  assert.equal(Checkpoint.restore({ ...checkpoint, padding: '한'.repeat(710000) }).ok, false);
});

test('new and completed games never replace an existing saved match', () => {
  const { target, game } = saved();
  const before = target.raw();
  assert.equal(Checkpoint.write(target, new Game({ seed: 42 })).ok, false);
  game.surrender();
  assert.equal(Checkpoint.write(target, game).ok, false);
  assert.equal(target.raw(), before);
  assert.equal(target.writes, 1);
});

test('invalid timestamps and exporting errors preserve the existing slot', () => {
  const { target, game } = saved();
  const before = target.raw();
  for (const now of [NaN, Infinity, -1, '2026-11-14', 8640000000000001]) {
    assert.equal(Checkpoint.write(target, game, {}, now).ok, false);
  }
  const badGame = { started: true, over: false, exportState() { throw new Error('invalid live state'); } };
  assert.equal(Checkpoint.write(target, badGame).ok, false);
  assert.equal(target.raw(), before);
});

test('restore revalidates mutated read results and rejects circular inputs safely', () => {
  const { checkpoint } = saved();
  checkpoint.state.state.time = -1;
  assert.equal(Checkpoint.restore(checkpoint).ok, false);
  const circular = { version: 1 };
  circular.state = circular;
  assert.equal(Checkpoint.restore(circular).ok, false);
  assert.equal(Checkpoint.restore(undefined).ok, false);
});

test('remove clears one slot and accurately reports storage deletion failures', () => {
  const { target } = saved();
  assert.equal(Checkpoint.remove(target).ok, true);
  assert.equal(target.removals, 1);
  assert.equal(Checkpoint.read(target).status, 'empty');
  assert.equal(Checkpoint.remove(target).ok, true, 'Removing an already empty slot is safe');
  const failed = Checkpoint.remove({ removeItem() { throw new Error('denied'); } });
  assert.equal(failed.ok, false);
  assert.ok(failed.reason);
});

test('every eight-second autosave during a natural full match remains resumable', t => {
  const game = new Game({ hero: 'mage', difficulty: 'normal', seed: 7 });
  const target = storage();
  game.start();
  let nextSave = 8, samples = 0, deaths = 0;
  while (!game.over && game.time < 720) {
    game.step(1 / 60);
    if (!game.over && game.time >= nextSave) {
      const written = Checkpoint.write(target, game, { speed: 1 }, samples * 8000);
      assert.equal(written.ok, true, `write at ${game.time}: ${written.reason}`);
      const loaded = Checkpoint.read(target);
      assert.equal(loaded.status, 'ready', `read at ${game.time}: ${loaded.reason}`);
      const restored = Checkpoint.restore(loaded.checkpoint);
      assert.equal(restored.ok, true, `restore at ${game.time}: ${restored.reason}`);
      assert.equal(restored.game.time, game.time);
      assert.equal(restored.game.player.alive, game.player.alive);
      assert.deepEqual(restored.game.teamKills, game.teamKills);
      deaths = Math.max(deaths, game.player.deaths);
      samples++; nextSave += 8;
    }
  }
  assert.equal(game.over, true, 'The real match must reach its normal end');
  assert.equal(game.endReason, 'nexus');
  assert.ok(samples >= 20, `Observed only ${samples} autosave points`);
  assert.ok(deaths > 0, 'The sampled lifecycle must include player death/respawn');
  const last = target.raw();
  assert.equal(Checkpoint.write(target, game).ok, false);
  assert.equal(target.raw(), last, 'A terminal write must preserve the prior active slot for the app to explicitly clear');
  t.diagnostic(`seed 7: ${samples} accepted checkpoints; nexus end at ${game.time.toFixed(2)} seconds; player deaths ${game.player.deaths}`);
});
