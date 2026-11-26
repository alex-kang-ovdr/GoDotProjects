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
const templateDir = path.join(root, 'Templates', 'cosmoteer');
const engine = NativeRuntime.availability(root);

const GODOT_TEST_SCRIPTS = [
  'tests/test_power_range.gd',
  'tests/test_lab_ui.gd',
  'tests/test_ship_design.gd',
  'tests/test_ship_battle.gd',
  'tests/test_shipyard_ui.gd',
  'tests/test_flight.gd',
  'tests/test_flight_ui.gd',
  'tests/test_rocket_network.gd',
  'tests/test_special_propulsion.gd',
  'tests/test_special_propulsion_ui.gd',
  'tests/test_overclock.gd',
  'tests/test_overclock_ui.gd',
  'tests/test_operations.gd',
  'tests/test_operation_combat.gd',
  'tests/test_operations_ui.gd',
  'tests/test_combat_expansion.gd',
  'tests/test_combat_expansion_ui.gd',
  'tests/test_dreadnought_systems.gd',
  'tests/test_prism_flak_symmetry.gd',
  'tests/test_asset_loader.gd',
  'tests/test_restored_rules.gd',
  'tests/test_thermal_and_utilities.gd',
  'tests/test_factories_mines_environment.gd',
];

test('Cosmoteer Godot template exposes valid PlayForge metadata and ready/guided project files', t => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'playforge-cosmoteer-store-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 }));
  const store = new PlatformStore(root, tmp);
  const tpl = store.getTemplate('cosmoteer');
  assert.equal(tpl.id, 'cosmoteer');
  assert.equal(tpl.dimension, '2d');
  assert.ok(tpl.assetPaths.includes('assets/icon.svg'));
  assert.ok(tpl.assetPaths.includes('assets/fonts/cosmoteer-ui.txt'));
  assert.ok(tpl.assetPaths.includes('data/catalog.json'));
  assert.ok(tpl.assetPaths.includes('data/operations.json'));

  const ready = store.createProject({ name: 'Cosmoteer Ready', template: 'cosmoteer', mode: 'ready' });
  assert.match(ready.files['project.godot'], /run\/main_scene="res:\/\/scenes\/main\.tscn"/);
  assert.match(ready.files['scenes/main.tscn'], /type="Node2D"/);
  assert.ok(ready.files['sim/ship_design.gd']);
  assert.ok(ready.files['sim/ship_battle.gd']);
  assert.ok(ready.files['sim/flight_dynamics.gd']);
  assert.ok(ready.files['sim/special_propulsion.gd']);
  assert.ok(ready.files['sim/engine_room.gd']);
  assert.ok(ready.files['sim/operations.gd']);
  assert.ok(ready.files['ui/main.gd']);
  assert.ok(ready.files['ui/shipyard.gd']);

  const guided = store.createProject({ name: 'Cosmoteer Guided', template: 'cosmoteer', mode: 'guided' });
  assert.match(guided.files['scenes/main.tscn'], /Node2D/);
  assert.equal(Object.keys(guided.files).filter(f => f.endsWith('.gd')).length, 0);
  for (const asset of tpl.assetPaths) {
    assert.equal(guided.files[asset], tpl.files[asset], asset);
  }
});

test('Cosmoteer Godot 4.7.2 template passes import and all 15 headless simulation & UI tests', {
  skip: engine.available ? false : engine.error || 'Godot editor unavailable',
}, t => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'playforge-cosmoteer-run-'));
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

  for (const script of GODOT_TEST_SCRIPTS) {
    const run = spawnSync(engine.executable, ['--headless', '--path', templateDir, '--script', script], {
      env, encoding: 'utf8', timeout: 60000, windowsHide: true,
    });
    const out = (run.stdout || '') + (run.stderr || '');
    assert.ifError(run.error);
    assert.equal(run.status, 0, `${script} failed:\n${out}`);
    assert.doesNotMatch(out, /SCRIPT ERROR:|Parse Error:/, `${script} script error:\n${out}`);
  }
});
