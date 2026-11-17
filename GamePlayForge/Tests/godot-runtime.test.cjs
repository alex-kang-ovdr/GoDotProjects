'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { NativeRuntime } = require('../Tools/native-runtime.cjs');

const root = path.resolve(__dirname, '..');
const gameDir = path.join(root, 'Projects', 'TappyChicken');
const source = fs.readFileSync(path.join(gameDir, 'Scripts', 'Game.gd'), 'utf8');
const settings = JSON.parse(fs.readFileSync(path.join(gameDir, 'Gameplay.settings.json'), 'utf8'));
const availability = NativeRuntime.availability(root);
const skipReason = availability.available ? false : availability.error || 'Godot project is not available';
const options = { headless: true, startupTimeoutMs: 10000, timeoutMs: 3000 };

test('Godot bridge metadata, sessions, queue, lifecycle, and realtime clock', { skip: skipReason }, async t => {
  const first = new NativeRuntime(root, undefined, options);
  const second = new NativeRuntime(root, undefined, options);
  let queueRuntime;
  let lifecycleRuntime;
  let realtimeRuntime;
  t.after(async () => {
    await Promise.all([first, second, queueRuntime, lifecycleRuntime, realtimeRuntime].filter(Boolean).map(runtime => runtime.close()));
  });

  const loadedFirst = await first.request({ op: 'load', source, settings: { ...settings, seed: 111 } });
  assert.equal(loadedFirst.ok, true, JSON.stringify(loadedFirst) + first.diagnostics);
  const loadedSecond = await second.request({ op: 'load', source, settings: { ...settings, seed: 222 } });
  assert.equal(loadedSecond.ok, true, JSON.stringify(loadedSecond) + second.diagnostics);
  for (const response of [loadedFirst, loadedSecond]) {
    assert.equal(response.runtime, 'PlayForge Godot / GDScript');
    assert.equal(response.engine?.name, 'Godot');
    assert.equal(typeof response.engine?.version, 'string');
    assert.equal(typeof response.engine?.renderer, 'string');
    assert.equal(response.engine?.clock, 'manual');
    assert.ok(Number.isInteger(response.engine?.nodes) && response.engine.nodes > 0);
  }
  assert.equal(loadedFirst.state.seed, 111);
  assert.equal(loadedSecond.state.seed, 222);
  const error = await first.request({ op: 'unknown' });
  assert.equal(error.ok, false);
  const recovered = await first.request({ op: 'snapshot' });
  assert.equal(recovered.ok, true);
  assert.equal(recovered.state.seed, 111);
  await first.close();
  assert.equal(first.closed, true);
  assert.equal(loadedSecond.state.seed, 222, 'The independent session remains loaded');
  await second.close();

  queueRuntime = new NativeRuntime(root, undefined, options);
  const burst = await Promise.all(Array.from({ length: 12 }, () => queueRuntime.request({ op: 'snapshot' })
    .then(response => ({ response }), error => ({ error }))));
  const rejected = burst.filter(result => result.error);
  assert.equal(rejected.length, 2, 'Only ten commands may wait for the Godot bridge');
  assert.ok(rejected.every(result => /queued/i.test(result.error.message)));
  await queueRuntime.close();
  queueRuntime = null;

  lifecycleRuntime = new NativeRuntime(root, undefined, options);
  const initial = await lifecycleRuntime.request({ op: 'load', source, settings });
  assert.equal(initial.ok, true, JSON.stringify(initial) + lifecycleRuntime.diagnostics);
  const stopped = await lifecycleRuntime.request({ op: 'stop' });
  assert.equal(stopped.ok, true);
  assert.equal(stopped.state, null);
  const afterStop = await lifecycleRuntime.request({ op: 'snapshot' });
  assert.equal(afterStop.ok, false);
  const reloaded = await lifecycleRuntime.request({ op: 'load', source, settings: { ...settings, seed: 987 } });
  assert.equal(reloaded.ok, true);
  assert.equal(reloaded.state.seed, 987);
  await lifecycleRuntime.close();
  await lifecycleRuntime.closedPromise;
  assert.equal(lifecycleRuntime.closed, true);
  await assert.rejects(lifecycleRuntime.request({ op: 'snapshot' }), /stopped/i);
  lifecycleRuntime = null;

  realtimeRuntime = new NativeRuntime(root, undefined, { ...options, realtime: true });
  const realtimeLoaded = await realtimeRuntime.request({ op: 'load', source, settings });
  assert.equal(realtimeLoaded.ok, true);
  assert.equal(realtimeLoaded.engine?.clock, 'realtime');
  const started = await realtimeRuntime.request({ op: 'input', action: 'flap' });
  assert.equal(started.ok, true);
  await new Promise(resolve => setTimeout(resolve, 350));
  const snapshot = await realtimeRuntime.request({ op: 'snapshot' });
  assert.equal(snapshot.ok, true);
  assert.ok(snapshot.state.elapsed > started.state.elapsed, `Expected realtime elapsed to advance from ${started.state.elapsed}`);
  await realtimeRuntime.close();
  realtimeRuntime = null;
});
