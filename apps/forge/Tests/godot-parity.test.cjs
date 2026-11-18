'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { NativeRuntime } = require('../Tools/native-runtime.cjs');

const ROOT = path.resolve(__dirname, '..');
const POC = path.join(ROOT, 'References', 'PlayForgeStudio', 'v18', 'TappyChicken', 'index.html');
const GAME = path.join(ROOT, 'Projects', 'TappyChicken', 'Scripts', 'Game.gd');
const runtimeAvailability = NativeRuntime.availability(ROOT);
const skipReason = runtimeAvailability.available ? false : runtimeAvailability.error || 'Godot project is not available';

test('GDScript Tappy Chicken matches preserved Studio JS PoC through the Godot runtime', { skip: skipReason }, async t => {
  const source = fs.readFileSync(GAME, 'utf8');
  const html = fs.readFileSync(POC, 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/i)?.[1];
  assert.ok(script, 'Original Studio Tappy Chicken HTML must contain its inline JS PoC');
  const marker = 'reset();requestAnimationFrame(loop)';
  assert.ok(script.includes(marker), 'Original JS PoC hook point changed; update this parity harness intentionally');
  const injected = `window.__tappyTest = {
    reset: () => reset(),
    flap: () => jump(),
    togglePause: () => togglePause(),
    update: dt => update(dt),
    chooseDifficulty: name => { difficulty = name; document.getElementById('difficulty').value = name; },
    snapshot: () => ({
      state, score, best, elapsed, seed, difficulty,
      bird: { x: bird.x, y: bird.y, vy: bird.vy, r: bird.r, angle: bird.angle },
      pipes: obstacles.map(p => ({ x: p.x, top: p.top, bottom: p.bottom, passed: p.passed })),
      settings: { gravity, flap: -flap, speed: config().speed, gap: config().gap,
        interval: config().interval, pipeWidth, seed: Number(overrides.seed) || 12345, difficulty, best },
      world: { width: W, height: H, ground }
    })
  };
  reset();requestAnimationFrame(loop)`;
  const sourceWithProbe = script.replace(marker, injected);
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      id, value: id === 'difficulty' ? 'normal' : '', checked: false, textContent: '',
      onclick: null, onchange: null, listeners: {},
      addEventListener(type, callback) { this.listeners[type] = callback; },
      getContext() { return context2d; },
    });
    return elements.get(id);
  };
  const context2d = new Proxy({}, {
    get(target, key) {
      if (!(key in target)) target[key] = key === 'createLinearGradient'
        ? () => ({ addColorStop() {} }) : () => {};
      return target[key];
    },
    set(target, key, value) { target[key] = value; return true; },
  });
  const listeners = {};
  const parent = { postMessage() {} };
  const window = { parent, addEventListener(type, callback) { listeners[type] = callback; } };
  let storedBest = 0;
  const localStorage = { getItem() { return String(storedBest); }, setItem(_key, value) { storedBest = value; } };
  const document = { getElementById: element };
  const sandbox = {
    window, parent, document, localStorage, Math, Number, Object, Array, String,
    JSON, Date, console,
    requestAnimationFrame() { return 1; },
  };
  const makePoc = best => {
    storedBest = best || 0;
    vm.runInNewContext(sourceWithProbe, sandbox, { filename: POC, timeout: 1000 });
    const game = window.__tappyTest;
    return {
      ...game,
      configure(settings) {
        listeners.message({ source: parent, data: { source: 'playforge-editor', action: 'settingsRestart', value: settings } });
      },
    };
  };

  const runtime = new NativeRuntime(ROOT, undefined, { headless: true });
  t.after(() => runtime.close());
  const request = async payload => {
    const response = await runtime.request(payload);
    if (!response.ok) throw new Error(response.error || 'Godot runtime request failed');
    return response.state;
  };

  function compare(actual, expected, label) {
    assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), `${label}: Snapshot fields`);
    const visit = (a, e, at) => {
      if (typeof e === 'number') {
        assert.equal(typeof a, 'number', `${label}: ${at} must be numeric`);
        assert.ok(Math.abs(a - e) <= 1e-6, `${label}: ${at} expected ${e}, got ${a}`);
      } else if (Array.isArray(e)) {
        assert.equal(a.length, e.length, `${label}: ${at} length`);
        e.forEach((value, index) => visit(a[index], value, `${at}[${index}]`));
      } else if (e && typeof e === 'object') {
        assert.deepEqual(Object.keys(a).sort(), Object.keys(e).sort(), `${label}: ${at} fields`);
        for (const key of Object.keys(e)) visit(a[key], e[key], `${at}.${key}`);
      } else assert.equal(a, e, `${label}: ${at}`);
    };
    visit(actual, expected, 'snapshot');
  }

  let probe;
  let commandIndex = 0;
  const reset = async settings => {
    probe = makePoc(settings?.best || 0);
    if (settings?.difficulty) probe.chooseDifficulty(settings.difficulty);
    probe.configure(settings || {});
    const expected = probe.snapshot();
    const payload = commandIndex === 0
      ? { op: 'load', source, settings }
      : { op: 'settings', settings };
    compare(await request(payload), expected, `reset ${commandIndex++}`);
  };
  const input = async action => {
    if (action === 'flap') probe.flap();
    else if (action === 'restart') probe.reset();
    else if (action === 'pause' || action === 'resume') probe.togglePause();
    compare(await request({ op: 'input', action }), probe.snapshot(), `input ${commandIndex++} (${action})`);
  };
  const update = async dt => {
    probe.update(dt);
    compare(await request({ op: 'step', dt }), probe.snapshot(), `step ${commandIndex++}`);
  };

  // Seeded physics, pipe creation, pause/resume, and restart state.
  await reset({ difficulty: 'normal', seed: 12345, best: 0 });
  await input('flap');
  let s;
  for (let i = 0; i < 30; i++) {
    if (i > 0 && i % 16 === 0) await input('flap');
    await update(0.04);
    s = probe.snapshot();
  }
  assert.ok(s.pipes.length > 0, 'Seeded run should spawn a pipe');
  await input('pause');
  const beforePause = probe.snapshot().bird;
  await update(0.04);
  assert.deepEqual(probe.snapshot().bird, beforePause, 'Paused updates must freeze bird physics');
  await input('resume');
  await update(0.04);
  assert.equal(probe.snapshot().state, 'playing');
  await input('restart');
  assert.equal(probe.snapshot().state, 'ready');
  assert.equal(probe.snapshot().score, 0);
  assert.equal(probe.snapshot().seed, 12345);

  // Difficulty presets and explicit values appear in the public Snapshot contract.
  for (const [difficulty, speed, gap, interval] of [
    ['easy', 125, 212, 1.9], ['normal', 170, 174, 1.55], ['hard', 225, 145, 1.32],
  ]) {
    await reset({ difficulty, gravity: 1050, flap: 345, speed, gap, interval,
      pipeWidth: 78, seed: 54321, best: 7 });
    const settings = probe.snapshot().settings;
    assert.equal(settings.difficulty, difficulty);
    assert.equal(settings.speed, speed);
    assert.equal(settings.gap, gap);
    assert.equal(settings.interval, interval);
  }

  // Seed 698 keeps several wide-gap pipes safely aligned while the first is passed.
  await reset({ difficulty: 'normal', gravity: 1050, flap: 345, speed: 40,
    gap: 350, interval: 4, pipeWidth: 25, seed: 698, best: 0 });
  await input('flap');
  for (let i = 0; i < 300; i++) {
    if (i > 0 && i % 16 === 0) await input('flap');
    await update(0.04);
  }
  s = probe.snapshot();
  assert.ok(s.score >= 1, `Expected at least one cleared pipe; got ${s.score}`);
  for (let i = 0; i < 60 && probe.snapshot().state === 'playing'; i++) await update(0.04);
  s = probe.snapshot();
  assert.equal(s.state, 'over', 'Unassisted fall after scoring must end the run');
  assert.equal(s.best, s.score, 'Best score must be updated when the run ends');
  await input('flap');
  assert.equal(probe.snapshot().state, 'playing');
  assert.equal(probe.snapshot().score, 0);
  assert.equal(probe.snapshot().best, s.best);

  // Ground collision and retry transition.
  await reset({ difficulty: 'hard', gravity: 3000, flap: 345, speed: 225,
    gap: 145, interval: 1.32, pipeWidth: 78, seed: 12345, best: 4 });
  await input('flap');
  for (let i = 0; i < 30 && probe.snapshot().state !== 'over'; i++) await update(0.04);
  s = probe.snapshot();
  assert.equal(s.state, 'over', 'Uninterrupted fall must hit the ground');
  assert.equal(s.best, 4);
  await input('flap');
  assert.equal(probe.snapshot().state, 'playing', 'Flap after game over starts a fresh attempt');
  assert.equal(probe.snapshot().score, 0);
});
