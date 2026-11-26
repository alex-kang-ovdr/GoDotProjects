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
const templateDir = path.join(root, 'Templates', 'ftl');
const engine = NativeRuntime.availability(root);

test('FTL Godot template exposes valid PlayForge metadata and ready/guided project files', t => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'playforge-ftl-store-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 }));
  const store = new PlatformStore(root, tmp);
  const tpl = store.getTemplate('ftl');
  assert.equal(tpl.id, 'ftl');
  assert.equal(tpl.dimension, '2d');
  assert.ok(tpl.assetPaths.includes('assets/icon.svg'));
  assert.ok(tpl.assetPaths.includes('assets/fonts/ftl-ui.txt'));

  const ready = store.createProject({ name: 'FTL Ready', template: 'ftl', mode: 'ready' });
  assert.match(ready.files['scenes/main.tscn'], /type="Node2D"/);
  assert.ok(ready.files['scripts/ftl_pkg.gd']);
  assert.ok(ready.files['scripts/ftl_database.gd']);
  assert.ok(ready.files['scripts/ftl_ship.gd']);
  assert.ok(ready.files['scripts/ftl_battle_view.gd']);

  const guided = store.createProject({ name: 'FTL Guided', template: 'ftl', mode: 'guided' });
  assert.match(guided.files['scenes/main.tscn'], /Node2D/);
  assert.equal(Object.keys(guided.files).filter(f => f.endsWith('.gd')).length, 0);
});

test('FTL Godot 4.7.2 restoration passes PKG archive, XML database, simulation, and main scene checks', {
  skip: engine.available ? false : engine.error || 'Godot editor unavailable',
}, t => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'playforge-ftl-run-'));
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

  const run = spawnSync(engine.executable, ['--headless', '--path', templateDir, '--script', 'tests/ftl_restore_tests.gd'], {
    env, encoding: 'utf8', timeout: 60000, windowsHide: true,
  });
  const out = (run.stdout || '') + (run.stderr || '');
  assert.ifError(run.error);
  assert.equal(run.status, 0, `ftl_restore_tests failed:\n${out}`);
  assert.doesNotMatch(out, /SCRIPT ERROR:|Parse Error:/, `script error:\n${out}`);

  const m = /FTL_TEST_RESULT\s+(\{.*\})/.exec(out);
  assert.ok(m, `Missing FTL_TEST_RESULT:\n${out}`);
  const summary = JSON.parse(m[1]);
  assert.equal(summary.failed, 0, out);
  assert.ok(summary.passed >= 14, out);
});

test('FTL Web server streams xml-bundle.json and raw PNG/OGG assets from ftl.dat.vanilla cleanly', async t => {
  const { createFtlWebServer, findFtlArchive } = await import('../Templates/ftl/tools/serve-ftl-web.mjs');
  const archive = findFtlArchive();
  if (!archive) {
    t.skip('C:\\Temp\\FTL\\ftl.dat.vanilla not present on this machine');
    return;
  }
  const { server, pkg } = createFtlWebServer({ archivePath: archive });
  t.after(() => new Promise(resolve => server.close(() => resolve())));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  assert.equal(pkg.loaded, true);
  assert.ok(pkg.entries.size >= 3000);

  const bundleRes = await fetch(`${base}/ftl-pkg/xml-bundle.json`);
  assert.equal(bundleRes.status, 200);
  assert.equal(bundleRes.headers.get('content-encoding'), null, 'must not gzip xml-bundle.json for Godot Web HTTPRequest');
  const bundle = await bundleRes.json();
  assert.ok(bundle.entry_count >= 3000);
  assert.ok(bundle.files['data/blueprints.xml']);
  assert.ok(bundle.files['data/kestral.txt']);

  const pngRes = await fetch(`${base}/ftl-pkg/raw/img/ship/kestral_base.png`);
  assert.equal(pngRes.status, 200);
  assert.equal(pngRes.headers.get('content-type'), 'image/png');
  const pngBuf = Buffer.from(await pngRes.arrayBuffer());
  assert.equal(pngBuf.subarray(1, 4).toString('ascii'), 'PNG');

  const oggRes = await fetch(`${base}/ftl-pkg/raw/audio/music/bp_MUS_CivilEXPLORE.ogg`);
  assert.equal(oggRes.status, 200);
  assert.equal(oggRes.headers.get('content-type'), 'audio/ogg');
  const oggBuf = Buffer.from(await oggRes.arrayBuffer());
  assert.equal(oggBuf.subarray(0, 4).toString('ascii'), 'OggS');
});
