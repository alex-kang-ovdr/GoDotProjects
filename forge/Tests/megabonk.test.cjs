'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PlatformStore } = require('../Tools/platform-store.cjs');
const { NativeRuntime } = require('../Tools/native-runtime.cjs');

const root = path.resolve(__dirname, '..');
const templateDir = path.join(root, 'Templates', 'megabonk');
const engine = NativeRuntime.availability(root);

test('Megabonk template exposes valid PlayForge metadata, assets, and ready/guided project files', t => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'playforge-megabonk-store-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 }));
  const store = new PlatformStore(root, tmp);
  const tpl = store.getTemplate('megabonk');
  assert.equal(tpl.id, 'megabonk');
  assert.equal(tpl.dimension, '3d');
  assert.ok(tpl.assetPaths.includes('data/catalog.json'));
  assert.ok(tpl.assetPaths.includes('assets/existing_models.json'));
  assert.ok(tpl.assetPaths.includes('assets/fonts/megabonk-ui.txt'));
  assert.ok(tpl.assetPaths.length >= 60);

  const ready = store.createProject({ name: 'Megabonk Ready', template: 'megabonk', mode: 'ready' });
  assert.match(ready.files['scenes/main.tscn'], /type="Node3D"/);
  assert.ok(ready.files['scripts/simulation.gd']);
  assert.ok(ready.files['scripts/world_renderer.gd']);
  assert.ok(ready.files['scripts/main.gd']);

  const guided = store.createProject({ name: 'Megabonk Guided', template: 'megabonk', mode: 'guided' });
  assert.match(guided.files['scenes/main.tscn'], /Node3D/);
  assert.equal(Object.keys(guided.files).filter(f => f.endsWith('.gd')).length, 0);
});

test('Megabonk native Godot 4.7.2 port passes parity, renderer, and UI scene checks', {
  skip: engine.available ? false : engine.error || 'Godot editor unavailable',
}, t => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'playforge-megabonk-run-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 }));
  const env = {
    ...process.env,
    MEGABONK_TEST_DATA: tmp,
    APPDATA: tmp,
    LOCALAPPDATA: tmp,
    HOME: tmp,
    XDG_DATA_HOME: tmp,
    XDG_CONFIG_HOME: tmp,
    XDG_CACHE_HOME: tmp,
  };

  function runGodot(args, label, timeout = 90000) {
    const res = spawnSync(engine.executable, ['--headless', '--path', templateDir, ...args], {
      env,
      encoding: 'utf8',
      timeout,
      windowsHide: true,
    });
    const out = (res.stdout || '') + (res.stderr || '');
    assert.ifError(res.error);
    assert.equal(res.status, 0, `${label} failed:\n${out}`);
    assert.doesNotMatch(out, /SCRIPT ERROR:|Parse Error:/, `${label} script error:\n${out}`);
    return out;
  }

  runGodot(['--editor', '--import', '--quit'], 'import');

  const portOut = runGodot(['--script', 'tests/port_tests.gd'], 'port_tests');
  const portMatch = /PORT_TEST_RESULT\s+(\{.*\})/.exec(portOut);
  assert.ok(portMatch, `Missing PORT_TEST_RESULT:\n${portOut}`);
  const portJson = JSON.parse(portMatch[1]);
  assert.equal(portJson.failed, 0);
  assert.equal(portJson.passed, 202);

  const rendOut = runGodot(['--script', 'tests/renderer_native.gd'], 'renderer_native');
  const rendMatch = /(\{"failures":.*\})/.exec(rendOut);
  assert.ok(rendMatch, `Missing renderer result:\n${rendOut}`);
  const rendJson = JSON.parse(rendMatch[1]);
  assert.equal(rendJson.failures.length, 0);
  assert.equal(rendJson.renderer_checks, 13);

  const uiOut = runGodot(['--fixed-fps', '60', '--script', 'tests/ui_scene_tests.gd'], 'ui_scene_tests');
  const uiMatch = /UI_TEST_RESULT\s+(\{.*\})/.exec(uiOut);
  assert.ok(uiMatch, `Missing UI_TEST_RESULT:\n${uiOut}`);
  const uiJson = JSON.parse(uiMatch[1]);
  assert.equal(uiJson.failed, 0);
  assert.equal(uiJson.passed, 32);
});
