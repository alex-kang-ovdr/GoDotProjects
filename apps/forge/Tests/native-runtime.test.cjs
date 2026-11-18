'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { NativeRuntime } = require('../Tools/native-runtime.cjs');

const root = path.resolve(__dirname, '..');
const gameDir = path.join(root, 'Projects', 'TappyChicken');
const gameSource = fs.readFileSync(path.join(gameDir, 'Scripts', 'Game.gd'), 'utf8');
const gameSettings = JSON.parse(fs.readFileSync(path.join(gameDir, 'Gameplay.settings.json'), 'utf8'));
const runtimeAvailability = NativeRuntime.availability(root);
const skipReason = runtimeAvailability.available ? false : runtimeAvailability.error || 'Godot project is not available';

test('Godot GDScript host validates source and runtime command boundaries', { skip: skipReason }, async t => {
  const runtime = new NativeRuntime(root, undefined, { headless: true, startupTimeoutMs: 10000, timeoutMs: 3000 });
  t.after(() => runtime.close());

  const beforeLoad = await runtime.request({ op: 'snapshot' });
  assert.equal(beforeLoad.ok, false);
  assert.match(beforeLoad.error, /no GDScript game/i);

  const syntax = await runtime.request({ op: 'load', source: 'extends RefCounted\nfunc reset(:\n' });
  assert.equal(syntax.ok, false);
  assert.match(syntax.error, /could not compile/i);
  const missingContract = await runtime.request({ op: 'load', source: 'extends RefCounted\nfunc reset(_settings):\n\tpass\n' });
  assert.equal(missingContract.ok, false);
  assert.match(missingContract.error, /Game\.(input|update|snapshot) is not defined/);

  const loaded = await runtime.request({ op: 'load', source: gameSource, settings: gameSettings });
  assert.equal(loaded.ok, true);
  assert.equal(loaded.runtime, 'PlayForge Godot / GDScript');
  assert.equal(loaded.state.state, 'ready');
  assert.equal(loaded.engine?.name, 'Godot');
  assert.equal(loaded.engine?.clock, 'manual');

  const malformed = await runtime.request({ op: 'input', action: 17 });
  assert.equal(malformed.ok, false);
  assert.match(malformed.error, /action/);
  const invalidStep = await runtime.request({ op: 'step', dt: 1.5 });
  assert.equal(invalidStep.ok, false);
  assert.match(invalidStep.error, /dt/);
  const unsupported = await runtime.request({ op: 'unknown' });
  assert.equal(unsupported.ok, false);

  const start = await runtime.request({ op: 'input', action: 'flap' });
  assert.equal(start.ok, true);
  assert.equal(start.state.state, 'playing');
  const stepped = await runtime.request({ op: 'step', dt: 0.04 });
  assert.equal(stepped.ok, true);
  assert.ok(Math.abs(stepped.state.elapsed - 0.04) < 1e-9);
  const settings = await runtime.request({ op: 'settings', settings: { ...gameSettings, seed: 54321 } });
  assert.equal(settings.ok, true);
  assert.equal(settings.state.seed, 54321);

  const invalidSnapshotSource = [
    'extends RefCounted',
    'func reset(_settings): pass',
    'func input(_action): pass',
    'func update(_dt): pass',
    'func snapshot(): return {"not_json": Callable(self, "snapshot")}',
  ].join('\n');
  const invalidSnapshot = await runtime.request({ op: 'load', source: invalidSnapshotSource });
  assert.equal(invalidSnapshot.ok, false);
  assert.match(invalidSnapshot.error, /JSON-compatible/i);

  const malformedPresentationSource = [
    'extends RefCounted',
    'func reset(_settings): pass',
    'func input(_action): pass',
    'func update(_dt): pass',
    'func snapshot(): return {"bird": 1, "world": {}, "pipes": [], "settings": {}}',
  ].join('\n');
  const malformedPresentation = await runtime.request({ op: 'load', source: malformedPresentationSource });
  assert.equal(malformedPresentation.ok, false);
  assert.match(malformedPresentation.error, /presentation/i);

  const oversizedSnapshotSource = [
    'extends RefCounted',
    'func reset(_settings): pass',
    'func input(_action): pass',
    'func update(_dt): pass',
    'func snapshot(): return {"payload": "x".repeat(4 * 1024 * 1024 + 1)}',
  ].join('\n');
  const oversizedSnapshot = await runtime.request({ op: 'load', source: oversizedSnapshotSource });
  assert.equal(oversizedSnapshot.ok, false);
  assert.match(oversizedSnapshot.error, /4 MiB|serialization/i);

  const recovered = await runtime.request({ op: 'load', source: gameSource, settings: gameSettings });
  assert.equal(recovered.ok, true);
  const stopped = await runtime.request({ op: 'stop' });
  assert.equal(stopped.ok, true);
  assert.equal(stopped.state, null);
  const afterStop = await runtime.request({ op: 'snapshot' });
  assert.equal(afterStop.ok, false);
  const reloaded = await runtime.request({ op: 'load', source: gameSource, settings: gameSettings });
  assert.equal(reloaded.ok, true);
  const closeStarted = Date.now();
  await runtime.close();
  await runtime.closedPromise;
  assert.ok(Date.now() - closeStarted < 5000, 'Stopping the runtime process must return promptly');
  assert.equal(runtime.closed, true);
});
