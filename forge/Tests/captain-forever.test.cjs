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

test('captain-forever single-player template passes Godot 4.7 headless gameplay simulation', {
  skip: engine.available ? false : engine.error || 'Godot unavailable',
}, t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'playforge-captain-sp-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const store = new PlatformStore(root, path.join(temp, 'store'));
  const template = store.getTemplate('captain-forever');
  assert.equal(template.dimension, '2d');
  assert.ok(template.assetPaths.includes('assets/fonts/captain-ui.txt'));
  assert.ok(template.assetPaths.includes('data/part_tuning_runtime.txt'));

  const projectDir = path.join(temp, 'project');
  const { files } = store.createProject({ name: 'Captain Forever Probe', template: 'captain-forever', mode: 'ready' });
  for (const [rel, content] of Object.entries(files)) {
    const out = path.join(projectDir, rel);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, content);
  }
  fs.copyFileSync(
    path.join(root, 'Templates/captain-forever/tests/captain_forever_test.gd'),
    path.join(projectDir, 'captain_forever_test.gd')
  );

  const evidence = path.join(root, 'Saved/Tests/captain-forever');
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
    fs.writeFileSync(path.join(evidence, `captain-forever-${label}.log`), log);
    assert.ifError(res.error);
    assert.equal(res.status, 0, log);
    assert.doesNotMatch(log, /SCRIPT ERROR:|Parse Error:|Assertion failed|ASSERTION FAILED:/);
    return log;
  }
  run(['--editor', '--import'], 'import');
  const out = run(['--script', 'res://captain_forever_test.gd'], 'sim');
  assert.match(out, /CAPTAIN_FOREVER_SP_OK/);
});

test('captain-forever exports to Godot Web and renders upgraded sci-fi visuals & gameplay in Chrome', {
  timeout: 300000,
  skip: engine.available ? false : engine.error || 'Godot unavailable',
}, async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'playforge-captain-sp-web-'));
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

  const created = await (await fetch(`${base}/api/platform/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Captain Forever Web QA', template: 'captain-forever', mode: 'ready' }),
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

  const evidence = path.join(root, 'Saved/Tests/captain-forever');
  fs.mkdirSync(evidence, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => {
    if (/SCRIPT ERROR:|Parse Error|Failed loading resource/i.test(m.text())) errors.push(m.text());
  });

  await page.goto(base + build.previewUrl, { waitUntil: 'domcontentloaded' });
  const canvas = page.locator('canvas').first();
  await canvas.waitFor({ state: 'visible', timeout: 90000 });
  await page.locator('#status').waitFor({ state: 'hidden', timeout: 60000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 2000));
  const flightShot = await page.screenshot({ path: path.join(evidence, 'captain-forever-flight.png') });

  // Focus canvas, trigger Quick-Attach (C), Overdrive (B), Thrust (W) + Strafe (E) + Fire (Space), and click Radar Minimap!
  await canvas.click({ position: { x: 640, y: 360 } });
  await page.keyboard.press('KeyC');
  await new Promise(r => setTimeout(r, 300));
  await page.keyboard.press('KeyB');
  await page.keyboard.down('KeyW');
  await page.keyboard.down('KeyE');
  await page.keyboard.down('Space');
  await new Promise(r => setTimeout(r, 1100));
  await page.keyboard.up('Space');
  await page.keyboard.up('KeyE');
  await page.keyboard.up('KeyW');
  const combatShot = await page.screenshot({ path: path.join(evidence, 'captain-forever-combat.png') });

  // Click tactical radar minimap (top-right) to test click-to-navigate
  await canvas.click({ position: { x: 1205, y: 125 } });
  await new Promise(r => setTimeout(r, 700));
  await page.screenshot({ path: path.join(evidence, 'captain-forever-radar-nav.png') });

  assert.ok(flightShot.length > 25000, 'Initial flight screenshot looks unexpectedly empty');
  assert.ok(!flightShot.equals(combatShot), 'Combat + Overdrive + Quick-Attach frame should visibly differ');
  assert.deepEqual(errors, [], `Runtime errors: ${errors.join('\n')}`);
});
