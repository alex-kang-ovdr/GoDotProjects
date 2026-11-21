'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { chromium } = require('@playwright/test');

const { PlatformStore } = require('../Tools/platform-store.cjs');
const { NativeRuntime } = require('../Tools/native-runtime.cjs');
const { createServer } = require('../server.cjs');

const root = path.resolve(__dirname, '..');
const engine = NativeRuntime.availability(root);

test('voxel-frontier 3D template passes Godot 4.7 headless simulation, chunk rebuild, save/load, and dungeon regen', {
  skip: engine.available ? false : engine.error || 'Godot unavailable',
}, t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'playforge-voxel-frontier-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const store = new PlatformStore(root, path.join(temp, 'store'));
  const template = store.getTemplate('voxel-frontier');
  assert.equal(template.dimension, '3d');
  assert.ok(template.assetPaths.includes('scripts/log_material.gdshader'));
  assert.ok(Object.keys(template.files).every(f => !f.endsWith('.glb')), 'Template must stay pure text without binary GLBs');

  const projectDir = path.join(temp, 'project');
  const { files } = store.createProject({ name: 'Voxel Frontier Probe', template: 'voxel-frontier', mode: 'ready' });
  for (const [rel, content] of Object.entries(files)) {
    const out = path.join(projectDir, rel);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, content);
  }
  fs.copyFileSync(
    path.join(root, 'Templates/voxel-frontier/tests/voxel_frontier_test.gd'),
    path.join(projectDir, 'voxel_frontier_test.gd')
  );

  const evidence = path.join(root, 'Saved/Tests/voxel-frontier');
  fs.mkdirSync(evidence, { recursive: true });
  const env = {
    ...process.env,
    APPDATA: temp,
    LOCALAPPDATA: temp,
    HOME: temp,
    XDG_DATA_HOME: temp,
    XDG_CONFIG_HOME: temp,
    XDG_CACHE_HOME: temp,
  };
  function run(args, label) {
    const res = spawnSync(engine.executable, ['--headless', '--path', projectDir, ...args], {
      env, encoding: 'utf8', timeout: 90000, windowsHide: true,
    });
    const log = (res.stdout || '') + (res.stderr || '');
    fs.writeFileSync(path.join(evidence, `voxel-frontier-${label}.log`), log);
    assert.ifError(res.error);
    assert.equal(res.status, 0, log);
    assert.doesNotMatch(log, /SCRIPT ERROR:|Parse Error:|Assertion failed|ASSERTION FAILED:/);
    return log;
  }
  run(['--editor', '--import'], 'import');
  const out = run(['--script', 'res://voxel_frontier_test.gd'], 'sim');
  assert.match(out, /VOXEL_FRONTIER_OK/);
});

test('voxel-frontier exports to Godot Web (single-threaded WebGL2) and renders cleanly in Chrome', {
  timeout: 300000,
  skip: engine.available ? false : engine.error || 'Godot unavailable',
}, async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'playforge-voxel-web-'));
  const server = createServer({
    workspace: path.join(temp, 'workspace'),
    platformWorkspace: path.join(temp, 'platform'),
    buildDirectory: path.join(temp, 'builds'),
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => {
      if (!server.listening) return resolve();
      server.once('close', resolve);
      server.shutdown();
    });
    fs.rmSync(temp, { recursive: true, force: true });
  });

  const created = await (await fetch(base + '/api/platform/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Voxel Frontier Web QA', template: 'voxel-frontier', mode: 'ready' }),
  })).json();
  const projectId = created.project.id;

  const queued = await (await fetch(`${base}/api/platform-builds/${projectId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ revision: created.revision }),
  })).json();
  let build = queued.build;
  const deadline = Date.now() + 240000;
  while (['queued', 'running'].includes(build.status) && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 800));
    build = (await (await fetch(`${base}/api/builds/${build.id}`)).json()).build;
  }
  assert.equal(build.status, 'succeeded', build.error || build.log);

  const evidence = path.join(root, 'Saved/Tests/voxel-frontier');
  fs.mkdirSync(evidence, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  const consoleLines = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => {
    consoleLines.push(`[${m.type()}] ${m.text()}`);
    if (/SCRIPT ERROR:|Parse Error|Failed loading resource|Worker could not start|Thread::start|cannot start thread/i.test(m.text())) {
      errors.push(m.text());
    }
  });

  await page.goto(base + build.previewUrl, { waitUntil: 'domcontentloaded' });
  const canvas = page.locator('canvas').first();
  await canvas.waitFor({ state: 'visible', timeout: 90000 });
  await page.locator('#status').waitFor({ state: 'hidden', timeout: 60000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 2500));
  const initialShot = await page.screenshot({ path: path.join(evidence, 'voxel-frontier-initial.png') });

  // Open world generation panel (Tab), switch to Dungeon, regenerate (G) to test Web single-threaded fallback!
  await canvas.click({ position: { x: 640, y: 360 } });
  await new Promise(r => setTimeout(r, 400));
  await page.keyboard.press('Tab');
  await new Promise(r => setTimeout(r, 500));
  await page.keyboard.press('ArrowRight');
  await new Promise(r => setTimeout(r, 200));
  await page.keyboard.press('KeyG');
  await new Promise(r => setTimeout(r, 2500));
  await page.keyboard.press('Escape');
  await new Promise(r => setTimeout(r, 600));
  const regenShot = await page.screenshot({ path: path.join(evidence, 'voxel-frontier-dungeon.png') });
  fs.writeFileSync(path.join(evidence, 'voxel-frontier-web.log'), consoleLines.join('\n') + '\n');

  assert.ok(initialShot.length > 20000, 'Initial 3D screenshot looks unexpectedly blank');
  assert.ok(!initialShot.equals(regenShot), 'Dungeon regeneration screen should visibly differ from Overworld screen');
  assert.deepEqual(errors, [], `Runtime errors: ${errors.join('\n')}`);
});
