'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PlatformStore } = require('../Tools/platform-store.cjs');
const { NativeRuntime } = require('../Tools/native-runtime.cjs');

const forgeRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(forgeRoot, '..');
const templateDir = path.join(forgeRoot, 'Templates', 'dont-starve-together');
const engine = NativeRuntime.availability(forgeRoot);

test('DST Godot template exposes valid PlayForge metadata and ready/guided project files', t => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'playforge-dst-store-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 }));
  const store = new PlatformStore(forgeRoot, tmp);
  const tpl = store.getTemplate('dont-starve-together');
  assert.equal(tpl.id, 'dont-starve-together');
  assert.equal(tpl.dimension, '3d');
  assert.ok(tpl.assetPaths.includes('assets/icon.svg'));
  assert.ok(tpl.assetPaths.includes('data/dst_tuning.json'));

  const ready = store.createProject({ name: 'DST Ready', template: 'dont-starve-together', mode: 'ready' });
  assert.match(ready.files['scenes/main.tscn'], /type="Node3D"/);
  assert.ok(ready.files['scripts/dst_database.gd']);
  assert.ok(ready.files['scripts/dst_world_sim.gd']);
  assert.ok(ready.files['scripts/dst_camera.gd']);
  assert.ok(ready.files['scripts/dst_renderer.gd']);
  assert.ok(ready.files['scripts/dst_hud.gd']);
  assert.ok(ready.files['scripts/main.gd']);

  const guided = store.createProject({ name: 'DST Guided', template: 'dont-starve-together', mode: 'guided' });
  assert.match(guided.files['scenes/main.tscn'], /Node3D/);
  assert.equal(Object.keys(guided.files).filter(f => f.endsWith('.gd')).length, 0);
});

test('DST static catalog JSON contains verified full counts from local installation', () => {
  const catalogPath = path.join(repoRoot, 'references', 'dont-starve-together', 'data', 'dst_catalog.json');
  assert.ok(fs.existsSync(catalogPath), 'dst_catalog.json must exist');
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  assert.equal(catalog.meta.appid, '322330');
  assert.ok(catalog.counts.prefabs >= 1600);
  assert.ok(catalog.counts.components >= 800);
  assert.ok(catalog.counts.recipes >= 950);
  assert.equal(catalog.counts.characters, 19);
  assert.equal(catalog.counts.skilltree_characters, 12);
  assert.equal(catalog.counts.foods_warly, 11);
  assert.equal(catalog.counts.farm_crops, 14);
  assert.equal(catalog.counts.wx78_modules, 23);
});

test('DST Godot 4.7.2 restoration passes QA-01~QA-10 formulas, 3-day simulation, and main scene checks', {
  skip: engine.available ? false : engine.error || 'Godot editor unavailable',
}, t => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'playforge-dst-run-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 }));
  const env = {
    ...process.env,
    APPDATA: tmp,
    LOCALAPPDATA: tmp,
    HOME: tmp,
    XDG_DATA_HOME: tmp,
    XDG_CONFIG_HOME: tmp,
    XDG_CACHE_HOME: tmp,
  };

  const imp = spawnSync(engine.executable, ['--headless', '--editor', '--path', templateDir, '--import', '--quit'], {
    env, encoding: 'utf8', timeout: 60000, windowsHide: true,
  });
  assert.ifError(imp.error);
  assert.equal(imp.status, 0, `import failed:\n${imp.stdout}\n${imp.stderr}`);

  const run = spawnSync(engine.executable, ['--headless', '--path', templateDir, '--script', 'tests/dst_restore_tests.gd'], {
    env, encoding: 'utf8', timeout: 60000, windowsHide: true,
  });
  const out = (run.stdout || '') + (run.stderr || '');
  assert.ifError(run.error);
  assert.equal(run.status, 0, `dst_restore_tests failed:\n${out}`);
  assert.doesNotMatch(out, /SCRIPT ERROR:|Parse Error:/, `script error:\n${out}`);

  const m = /DST_TEST_RESULT\s+(\{.*\})/.exec(out);
  assert.ok(m, `Missing DST_TEST_RESULT:\n${out}`);
  const summary = JSON.parse(m[1]);
  assert.equal(summary.failed, 0, out);
  assert.ok(summary.passed >= 24, `expected >= 24 checks, got ${summary.passed}\n${out}`);
});
