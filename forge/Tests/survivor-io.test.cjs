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

test('survivor-io template bundles assets and passes Godot 4.7 headless simulation tests', {
  skip: engine.available ? false : engine.error || 'Godot unavailable',
}, t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'playforge-survivor-io-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const store = new PlatformStore(root, path.join(temp, 'store'));
  const template = store.getTemplate('survivor-io');
  assert.equal(template.dimension, '2d');
  assert.ok(template.assetPaths.includes('fonts/survivor-ui.txt'));

  const projectDir = path.join(temp, 'project');
  const { files } = store.createProject({ name: '탕탕특공대 Probe', template: 'survivor-io', mode: 'ready' });
  for (const [rel, content] of Object.entries(files)) {
    const out = path.join(projectDir, rel);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, content);
  }
  fs.copyFileSync(
    path.join(root, 'Templates/survivor-io/tests/survivor_io_test.gd'),
    path.join(projectDir, 'survivor_io_test.gd')
  );

  const evidence = path.join(root, 'Saved/Tests/survivor-io');
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
      env, encoding: 'utf8', timeout: 60000, windowsHide: true,
    });
    const log = (res.stdout || '') + (res.stderr || '');
    fs.writeFileSync(path.join(evidence, `survivor-io-${label}.log`), log);
    assert.ifError(res.error);
    assert.equal(res.status, 0, log);
    assert.doesNotMatch(log, /SCRIPT ERROR:|Parse Error:|Assertion failed|ASSERTION FAILED:/);
    return log;
  }
  run(['--editor', '--import'], 'import');
  const out = run(['--script', 'res://survivor_io_test.gd'], 'sim');
  assert.match(out, /SURVIVOR_IO_OK/);
});

test('survivor-io exports to Godot Web and runs cleanly in Chrome (desktop & mobile portrait)', {
  timeout: 300000,
  skip: engine.available ? false : engine.error || 'Godot unavailable',
}, async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'playforge-survivor-web-'));
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
    body: JSON.stringify({ name: '탕탕특공대 Web QA', template: 'survivor-io', mode: 'ready' }),
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

  const evidence = path.join(root, 'Saved/Tests/survivor-io');
  fs.mkdirSync(evidence, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 540, height: 960 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => {
    if (/SCRIPT ERROR:|Parse Error|Failed loading resource/i.test(m.text())) errors.push(m.text());
  });

  await page.goto(base + build.previewUrl, { waitUntil: 'domcontentloaded' });
  const canvas = page.locator('canvas').first();
  await canvas.waitFor({ state: 'visible', timeout: 90000 });
  await page.locator('#status').waitFor({ state: 'hidden', timeout: 60000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 1500));
  const menuShot = await page.screenshot({ path: path.join(evidence, 'survivor-io-menu.png') });

  // Focus canvas and press Space to launch run, then move with D + Space dash + E skill.
  await canvas.click({ position: { x: 270, y: 860 } });
  await page.keyboard.press('Space');
  await new Promise(r => setTimeout(r, 600));
  await page.keyboard.down('KeyD');
  await new Promise(r => setTimeout(r, 1200));
  await page.keyboard.up('KeyD');
  await page.keyboard.press('KeyE');
  await new Promise(r => setTimeout(r, 1200));
  const playShot = await page.screenshot({ path: path.join(evidence, 'survivor-io-play.png') });

  assert.ok(!menuShot.equals(playShot), 'Gameplay screen should visibly differ from menu screen');
  assert.deepEqual(errors, [], `Runtime errors: ${errors.join('\n')}`);
});
