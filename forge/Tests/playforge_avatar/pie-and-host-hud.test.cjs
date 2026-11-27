'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const { createServer } = require('../../server.cjs');

const forgeRoot = path.resolve(__dirname, '../..');
const worktreeRoot = path.resolve(forgeRoot, '..');
const evidenceDir = path.join(forgeRoot, 'Saved', 'Tests', 'avatar-on-off-comparison');

test('1. PlayForge Web Editor PIE ON/OFF toggle persists & switches buildProfile between playhub-publish and standard-godot', {
  timeout: 90000,
}, async (t) => {
  fs.mkdirSync(evidenceDir, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-pie-toggle-'));
  const server = createServer({
    hubAuth: false,
    workspace: path.join(tmp, 'studio'),
    platformWorkspace: path.join(tmp, 'platform'),
    buildDirectory: path.join(tmp, 'builds'),
  });
  let browser;
  t.after(async () => {
    await browser?.close();
    await new Promise((resolve) => {
      if (!server.listening) return resolve();
      server.once('close', resolve);
      server.shutdown();
    });
    fs.rmSync(tmp, { recursive: true, force: true });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const created = await fetch(`${base}/api/platform/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'PIE Toggle Check', template: 'tappy-chicken' }),
  }).then((r) => r.json());
  const pid = created.project.id;

  browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`${base}/OfficialGodot/editor.html?project=${pid}`, { waitUntil: 'domcontentloaded', timeout: 60000 });

  const toggle = page.locator('#pie-avatar-toggle');
  await toggle.waitFor({ state: 'visible', timeout: 30000 });
  // Experimental feature default: OFF
  assert.equal(await toggle.getAttribute('data-pie-avatar'), 'off');
  assert.equal(await page.evaluate(() => window.__playforgeGetPieAvatarEnabled && window.__playforgeGetPieAvatarEnabled()), false);
  await page.screenshot({ path: path.join(evidenceDir, 'editor-pie-toggle-OFF.png'), clip: { x: 0, y: 0, width: 1280, height: 96 } });

  await toggle.click();
  await new Promise((r) => setTimeout(r, 250));
  assert.equal(await toggle.getAttribute('data-pie-avatar'), 'on');
  assert.equal(await page.evaluate(() => window.__playforgeGetPieAvatarEnabled && window.__playforgeGetPieAvatarEnabled()), true);
  await page.screenshot({ path: path.join(evidenceDir, 'editor-pie-toggle-ON.png'), clip: { x: 0, y: 0, width: 1280, height: 96 } });

  // Reloading preserves per-project PIE ON state via sessionStorage
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await toggle.waitFor({ state: 'visible', timeout: 30000 });
  assert.equal(await toggle.getAttribute('data-pie-avatar'), 'on');
  assert.equal(await page.evaluate(() => window.__playforgeGetPieAvatarEnabled && window.__playforgeGetPieAvatarEnabled()), true);

  // Explicit query ?pieAvatar=off overrides cleanly
  await page.goto(`${base}/OfficialGodot/editor.html?project=${pid}&pieAvatar=off`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await toggle.waitFor({ state: 'visible', timeout: 30000 });
  assert.equal(await toggle.getAttribute('data-pie-avatar'), 'off');
  assert.equal(await page.evaluate(() => window.__playforgeGetPieAvatarEnabled && window.__playforgeGetPieAvatarEnabled()), false);

  // Default POST /api/platform-builds/:id (omitting includePlatformAvatar) must default avatarIncluded=false (experimental OFF)
  const { BuildQueue } = require('../../Tools/build-queue.cjs');
  const q = new BuildQueue(forgeRoot, path.join(tmp, 'q-check'));
  q.pump = async () => {};
  const defaultJob = q.enqueue({ id: pid, revision: 1, files: [{ path: 'project.godot', content: '[application]\n' }] });
  const optInJob = q.enqueue({ id: pid, revision: 1, includePlatformAvatar: true, files: [{ path: 'project.godot', content: '[application]\n' }] });
  assert.equal(defaultJob.buildProfile, 'playhub-publish');
  assert.equal(defaultJob.avatarIncluded, false, 'Default PlayHub build must have avatarIncluded=false (experimental OFF)');
  assert.equal(optInJob.avatarIncluded, true, 'Explicit includePlatformAvatar=true must set avatarIncluded=true');
  assert.notEqual(defaultJob.id, optInJob.id, 'OFF and ON jobs for same revision must not collide in BuildQueue cache');
  q.close();

  assert.deepEqual(errs, [], `Editor PIE toggle errors: ${errs.join('\n')}`);
});

test('2. PlayHub Outer Host Top-Left .platform-core-bar enforces max 30s temporary hide, auto-restore, and 0.2s/s recharge via MessageChannel bridge', {
  timeout: 90000,
}, async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-host-hud-'));
  const dataDir = path.join(tmp, 'data');
  const webRoot = path.join(tmp, 'user');
  fs.mkdirSync(path.join(webRoot, 'catalog'), { recursive: true });
  fs.mkdirSync(path.join(webRoot, 'games/hud-bridge-demo'), { recursive: true });
  fs.cpSync(path.join(worktreeRoot, 'hub/web/user'), webRoot, { recursive: true });
  if (fs.existsSync(path.join(worktreeRoot, 'hub/shared'))) {
    fs.cpSync(path.join(worktreeRoot, 'hub/shared'), path.join(webRoot, 'shared'), { recursive: true });
  }
  if (fs.existsSync(path.join(worktreeRoot, 'hub/shared/locale.js'))) {
    fs.copyFileSync(path.join(worktreeRoot, 'hub/shared/locale.js'), path.join(webRoot, 'locale.js'));
  }
  fs.writeFileSync(path.join(webRoot, 'locale-data.js'), 'window.PLAYHUB_LOCALE_DATA = window.PLAYHUB_LOCALE_DATA || {};\n');
  fs.copyFileSync(path.join(forgeRoot, 'Tools/playhub-godot-shell.js'), path.join(webRoot, 'games/hud-bridge-demo/playhub-godot-shell.js'));
  fs.writeFileSync(
    path.join(webRoot, 'catalog/games.json'),
    JSON.stringify({ schemaVersion: 1, entries: [{ id: 'hud-bridge-demo', path: 'games/hud-bridge-demo', enabled: true }] }),
  );
  fs.writeFileSync(
    path.join(webRoot, 'games/hud-bridge-demo/game.manifest.json'),
    JSON.stringify({
      id: 'hud-bridge-demo',
      slug: 'hud-bridge-demo',
      entry: 'index.html',
      title: { ko: 'HUD 브리지 테스트', en: 'HUD Bridge Test' },
      summary: { ko: '좌상단 허브 바 숨김 규칙 테스트', en: 'Top-left hub bar temporary hide rules test.' },
      instructions: { ko: '테스트', en: 'Test' },
      tags: ['3d', 'godot'],
      media: { cover: 'cover.svg', screenshots: [] },
    }),
  );
  fs.writeFileSync(
    path.join(webRoot, 'games/hud-bridge-demo/cover.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><rect width="320" height="180" fill="#142c25"/></svg>',
  );
  fs.writeFileSync(
    path.join(webRoot, 'games/hud-bridge-demo/index.html'),
    '<!doctype html><html><body><script src="./playhub-godot-shell.js"></script><div id="ready">HUD Bridge Sandbox</div></body></html>',
  );

  const { createApp } = await import(pathToFileURL(path.join(worktreeRoot, 'hub/server/app.mjs')).href);
  const { createStaticServer } = await import(pathToFileURL(path.join(worktreeRoot, 'hub/tools/dev.mjs')).href);

  const freePort = () => new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const p = srv.address().port;
      srv.close(() => resolve(p));
    });
  });
  const userPort = await freePort();
  const apiPort = await freePort();
  const adminPort = await freePort();

  const trustedProxySecret = crypto.randomBytes(32).toString('hex');
  const salt = 'b'.repeat(32);
  fs.writeFileSync(path.join(webRoot, 'config.js'), `window.PLAYHUB_CONFIG = { apiPort: ${userPort}, apiBaseUrl: '', mode: 'test' };\n`);
  const apiApp = createApp({
    publicHost: '127.0.0.1',
    publicPort: apiPort,
    adminHost: '127.0.0.1',
    adminPort,
    dataDir,
    userOrigins: [`http://127.0.0.1:${userPort}`, `http://localhost:${userPort}`],
    adminOrigins: [`http://127.0.0.1:${adminPort}`],
    userBaseUrl: `http://127.0.0.1:${userPort}`,
    publicBaseUrl: `http://127.0.0.1:${userPort}`,
    secureCookies: false,
    admin: { username: 'admin', salt, passwordHash: crypto.scryptSync('test-pass', salt, 64).toString('hex') },
  }, { rootDir: webRoot, platformRoot: worktreeRoot, trustedProxySecret });

  let staticServer;
  let browser;
  t.after(async () => {
    await browser?.close();
    if (staticServer?.listening) {
      await new Promise((resolve) => {
        staticServer.once('close', resolve);
        staticServer.close();
      });
    }
    await apiApp.close?.();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  await apiApp.listen();
  staticServer = createStaticServer(webRoot, { apiPort, trustedProxySecret, trustProxy: true });
  await new Promise((resolve, reject) => {
    staticServer.once('error', reject);
    staticServer.listen(userPort, '127.0.0.1', resolve);
  });

  browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  // 0. Default (experimental OFF): top-left .platform-core-bar and Avatar nav link must NOT be shown
  await page.goto(`http://127.0.0.1:${userPort}/?game=hud-bridge-demo`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  assert.equal(await page.locator('a[data-nav-view="avatar"]').isHidden(), true, 'Avatar nav link must be hidden by default (experimental OFF)');
  const playBtnDefault = page.locator('#play-button, [data-testid="launch-game"]').first();
  await playBtnDefault.waitFor({ state: 'visible', timeout: 15000 });
  await playBtnDefault.click();
  await page.frameLocator('iframe').first().locator('#ready').waitFor({ state: 'visible', timeout: 15000 });
  assert.equal(await page.locator('[data-testid="platform-core-bar"]').count(), 0, 'Top-left .platform-core-bar must NOT mount by default when experimental UI is OFF');

  // 1. Experimental ON (?platformUi=on): top-left .platform-core-bar mounts and enforces 30s hide / auto-restore / 0.2s/s recharge
  await page.goto(`http://127.0.0.1:${userPort}/?game=hud-bridge-demo&platformUi=on`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const playBtn = page.locator('#play-button, [data-testid="launch-game"]').first();
  await playBtn.waitFor({ state: 'visible', timeout: 15000 });
  await playBtn.click();

  const coreBar = page.locator('[data-testid="platform-core-bar"]');
  await coreBar.waitFor({ state: 'visible', timeout: 15000 });

  // Wait for sandboxed iframe to connect MessageChannel
  const gameFrame = page.frameLocator('iframe').first();
  await gameFrame.locator('#ready').waitFor({ state: 'visible', timeout: 15000 });
  const iframeHandle = await page.locator('iframe').first().elementHandle();
  const frame = await iframeHandle.contentFrame();
  assert.ok(frame, 'Missing embedded game iframe');

  await frame.evaluate(async () => {
    await window.PlayHubBridge.connect();
  });

  // 1. Cap at 30s when requesting 999s + bar hidden
  const capRes = await frame.evaluate(async () => window.PlayHubBridge.requestTemporaryHudHide(999));
  assert.equal(capRes.ok, true);
  assert.equal(capRes.hidden, true);
  assert.ok(capRes.remainingSeconds <= 30.0 && capRes.remainingSeconds >= 29.0, `Expected <=30s cap, got ${capRes.remainingSeconds}`);
  assert.equal(await coreBar.isHidden(), true, 'Top-left .platform-core-bar must hide during authorized temp hide');

  // 2. Early end restores immediately
  const endRes = await frame.evaluate(async () => window.PlayHubBridge.endTemporaryHudHide());
  assert.equal(endRes.hidden, false);
  assert.equal(await coreBar.isVisible(), true, 'Top-left .platform-core-bar must restore immediately on endTemporaryHudHide');

  // 3. Auto-restore after 0.8s expiry
  const shortRes = await frame.evaluate(async () => window.PlayHubBridge.requestTemporaryHudHide(0.8));
  assert.equal(shortRes.ok, true);
  assert.equal(await coreBar.isHidden(), true);
  await new Promise((r) => setTimeout(r, 1150));
  const afterExp = await frame.evaluate(async () => window.PlayHubBridge.getHudHideState());
  assert.equal(afterExp.hidden, false, 'Top-left .platform-core-bar must auto-restore when timer expires');
  assert.equal(await coreBar.isVisible(), true);
  assert.ok(afterExp.budgetSeconds <= 29.4 && afterExp.budgetSeconds >= 28.5, `Unexpected budget after 0.8s hide: ${afterExp.budgetSeconds}`);

  // 4. Recharge at 0.2 s/s while visible over 2.0s (~0.40s)
  const beforeRec = afterExp.budgetSeconds;
  await new Promise((r) => setTimeout(r, 2000));
  const afterRec = await frame.evaluate(async () => window.PlayHubBridge.getHudHideState());
  const delta = afterRec.budgetSeconds - beforeRec;
  assert.ok(delta >= 0.25 && delta <= 0.55, `Expected ~0.40s recharge over 2.0s at 0.2s/s, got ${delta}`);
});
