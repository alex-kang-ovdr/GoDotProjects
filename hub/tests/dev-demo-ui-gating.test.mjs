import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build, isDevDemoBuildMode } from '../tools/build.mjs';
import { createApp } from '../server/app.mjs';
import { createStaticServer } from '../tools/dev.mjs';

const require = createRequire(import.meta.url);
const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const HUB_ROOT = path.resolve(TESTS_DIR, '..');
const PLATFORM_ROOT = path.resolve(HUB_ROOT, '..');
const FORGE_ROOT = path.join(PLATFORM_ROOT, 'forge');

function findChrome() {
  for (const candidate of [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium'
  ].filter(Boolean)) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

function listenServer(server, host = '127.0.0.1', port = 0) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve(server.address());
    });
  });
}

async function withChromeCdp(t, url, fn) {
  const chrome = findChrome();
  assert.ok(chrome, 'Chrome executable is required');
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-devgate-cdp-'));
  const proc = spawn(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=0',
    `--user-data-dir=${profileDir}`,
    url
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  proc.stderr.on('data', d => { stderr += d.toString('utf8'); });
  t.after(async () => {
    try { proc.stderr?.destroy(); } catch {}
    try { proc.kill(); } catch {}
    try { proc.unref(); } catch {}
    await delay(200);
    try { fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 80 }); } catch {}
  });

  let wsUrl = '';
  for (let i = 0; i < 60; i++) {
    const m = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
    if (m) { wsUrl = m[1]; break; }
    await delay(100);
  }
  assert.ok(wsUrl, 'Chrome DevTools should start');
  const debugOrigin = wsUrl.replace(/^ws:/, 'http:').replace(/\/devtools\/browser\/.*$/, '');
  let pageTarget = null;
  for (let i = 0; i < 40; i++) {
    const targets = await (await fetch(`${debugOrigin}/json/list`)).json();
    pageTarget = targets.find(item => item.type === 'page' && item.webSocketDebuggerUrl);
    if (pageTarget) break;
    await delay(100);
  }
  assert.ok(pageTarget, 'Page target should exist');

  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  let nextId = 1;
  const pending = new Map();
  ws.addEventListener('message', e => {
    const msg = JSON.parse(String(e.data));
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evalJs = async expression => {
    const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text || 'CDP eval error');
    }
    return res.result?.value;
  };
  try {
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Page.navigate', { url });
    await delay(850);
    return await fn({ send, evalJs });
  } finally {
    ws.close();
  }
}

test('PlayHub build() includes dev-demo-ui.js ONLY in dev/debug/test builds and strips it in prod/release builds', t => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-build-modes-'));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  for (const mode of ['dev', 'debug', 'test']) {
    assert.equal(isDevDemoBuildMode(mode), true);
    const out = path.join(tmpDir, `dist-${mode}`);
    const report = build({ root: HUB_ROOT, buildMode: mode, outputDir: out });
    assert.equal(report.buildMode, mode);
    assert.equal(report.includeDevDemoUi, true);
    assert.equal(fs.existsSync(path.join(out, 'user', 'dev-demo-ui.js')), true, `${mode} build must include dev-demo-ui.js`);
    const html = fs.readFileSync(path.join(out, 'user', 'index.html'), 'utf8');
    assert.match(html, /dev-demo-ui\.js/, `${mode} build index.html must load dev-demo-ui.js`);
    const cfg = fs.readFileSync(path.join(out, 'user', 'config.js'), 'utf8');
    assert.match(cfg, /"includeDevDemoUi":true/);
  }

  for (const mode of ['prod', 'release']) {
    assert.equal(isDevDemoBuildMode(mode), false);
    const out = path.join(tmpDir, `dist-${mode}`);
    const report = build({ root: HUB_ROOT, buildMode: mode, outputDir: out });
    assert.equal(report.buildMode, mode);
    assert.equal(report.includeDevDemoUi, false);
    assert.equal(fs.existsSync(path.join(out, 'user', 'dev-demo-ui.js')), false, `${mode} build MUST exclude dev-demo-ui.js`);
    const html = fs.readFileSync(path.join(out, 'user', 'index.html'), 'utf8');
    assert.doesNotMatch(html, /dev-demo-ui\.js/, `${mode} build index.html MUST strip dev-demo-ui.js`);
    const cfg = fs.readFileSync(path.join(out, 'user', 'config.js'), 'utf8');
    assert.match(cfg, /"includeDevDemoUi":false/);
  }
});

test('PlayHub prod build exposes zero Test/Demo UI even if localStorage is manually set; debug build persists toggle across F5', async t => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-prod-vs-debug-'));
  const cleanups = [];
  t.after(async () => {
    for (const fn of cleanups.reverse()) {
      try { await fn(); } catch {}
    }
    try { fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {}
  });

  async function launchMode(mode) {
    const out = path.join(tmpDir, `dist-${mode}`);
    build({ root: HUB_ROOT, buildMode: mode, outputDir: out });
    const userDir = path.join(out, 'user');
    const userPort = await reservePort();
    const userBaseUrl = `http://127.0.0.1:${userPort}`;
    const trustedProxySecret = randomBytes(32).toString('hex');
    const hubApp = createApp({
      dataDir: path.join(tmpDir, `data-${mode}`),
      publicHost: '127.0.0.1',
      adminHost: '127.0.0.1',
      publicPort: 0,
      adminPort: 0,
      userBaseUrl,
      adminBaseUrl: 'http://127.0.0.1:0',
      userOrigins: [userBaseUrl],
      adminOrigins: ['http://127.0.0.1:0'],
      secureCookies: false,
      billing: { enabled: true, allowMockProvider: true, allowDemoAccount: true }
    }, { rootDir: userDir, platformRoot: PLATFORM_ROOT, trustedProxySecret });
    const addrs = await hubApp.listen();
    fs.writeFileSync(
      path.join(userDir, 'config.js'),
      `window.PLAYHUB_CONFIG=${JSON.stringify({ apiPort: addrs.public.port, apiBaseUrl: '', sameOriginApi: true, buildMode: mode, includeDevDemoUi: isDevDemoBuildMode(mode), mode: 'local-iis-poc' })};\n`
    );
    const userServer = createStaticServer(userDir, { apiPort: addrs.public.port, trustedProxySecret, trustProxy: true });
    await listenServer(userServer, '127.0.0.1', userPort);
    cleanups.push(async () => {
      await new Promise(resolve => { userServer.close(resolve); userServer.closeAllConnections(); });
      await hubApp.close();
    });
    return userBaseUrl;
  }

  // 1) Prod build: even with localStorage forced to '1', zero Dev toggle & zero Demo UI
  const prodUrl = await launchMode('prod');
  await withChromeCdp(t, `${prodUrl}/?view=billing`, async ({ send, evalJs }) => {
    await evalJs(`localStorage.setItem('playhub.dev.testDemoUi', '1');`);
    await send('Page.reload', { ignoreCache: true });
    await delay(900);
    const state = await evalJs(`(async () => {
      for (let i = 0; i < 40; i++) {
        if (document.querySelector('[data-buy-sku]')) break;
        await new Promise(r => setTimeout(r, 100));
      }
      return {
        hasApi: Boolean(window.PlayHubDevDemoUI),
        hasNavToggle: Boolean(document.getElementById('dev-demo-nav-toggle')),
        hasSettingsCard: Boolean(document.getElementById('dev-demo-settings-card')),
        hasShopDemoBtn: Boolean(document.getElementById('billing-demo-signin'))
      };
    })()`);
    assert.equal(state.hasApi, false, 'Prod build must not load PlayHubDevDemoUI');
    assert.equal(state.hasNavToggle, false, 'Prod build must not render Dev nav toggle');
    assert.equal(state.hasSettingsCard, false, 'Prod build must not render Dev settings card');
    assert.equal(state.hasShopDemoBtn, false, 'Prod build must never show demo sign-in button');
  });

  // 2) Debug build: Account page toggle ON -> F5 reload -> persists ON; toggle OFF -> F5 -> persists OFF
  const debugUrl = await launchMode('debug');
  await withChromeCdp(t, `${debugUrl}/?view=account`, async ({ send, evalJs }) => {
    const initial = await evalJs(`({
      mode: window.PlayHubDevDemoUI?.getBuildMode?.(),
      enabled: window.PlayHubDevDemoUI?.isEnabled?.(),
      hasCard: Boolean(document.getElementById('dev-demo-settings-card')),
      checked: Boolean(document.getElementById('dev-demo-ui-toggle')?.checked)
    })`);
    assert.equal(initial.mode, 'debug');
    assert.equal(initial.enabled, false, 'Debug build must default to OFF');
    assert.equal(initial.hasCard, true, 'Debug build must show Dev settings card in Account');
    assert.equal(initial.checked, false);

    // Toggle ON in Account settings -> F5 reload -> verify ON persists
    await evalJs(`document.getElementById('dev-demo-ui-toggle').click();`);
    await delay(150);
    await send('Page.reload', { ignoreCache: true });
    await delay(800);
    const afterF5On = await evalJs(`({
      enabled: window.PlayHubDevDemoUI?.isEnabled?.(),
      checked: Boolean(document.getElementById('dev-demo-ui-toggle')?.checked),
      navText: document.getElementById('dev-demo-nav-toggle')?.textContent || ''
    })`);
    assert.equal(afterF5On.enabled, true, 'Setting ON must persist after F5 reload');
    assert.equal(afterF5On.checked, true);
    assert.match(afterF5On.navText, /DEBUG.*ON/);

    // Toggle OFF -> F5 reload -> verify OFF persists
    await evalJs(`document.getElementById('dev-demo-ui-toggle').click();`);
    await delay(150);
    await send('Page.reload', { ignoreCache: true });
    await delay(800);
    const afterF5Off = await evalJs(`({
      enabled: window.PlayHubDevDemoUI?.isEnabled?.(),
      checked: Boolean(document.getElementById('dev-demo-ui-toggle')?.checked)
    })`);
    assert.equal(afterF5Off.enabled, false, 'Setting OFF must persist after F5 reload');
    assert.equal(afterF5Off.checked, false);
  });
});

test('PlayForge includes Test/Demo UI ONLY in dev/debug/test builds, hides by default, toggles ON with F5 persistence, and excludes in prod', async t => {
  const { createServer } = require(path.join(FORGE_ROOT, 'server.cjs'));

  async function startForge(buildMode) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `playforge-mode-${buildMode}-`));
    const srv = createServer({
      buildMode,
      platformWorkspace: path.join(tmp, 'workspace'),
      hubAuth: false
    });
    const addr = await listenServer(srv, '127.0.0.1', 0);
    t.after(async () => {
      try { srv.shutdown?.(); } catch {}
      await new Promise(resolve => {
        if (!srv.listening) return resolve();
        srv.close(resolve);
        srv.closeAllConnections?.();
      });
      try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 80 }); } catch {}
    });
    return `http://127.0.0.1:${addr.port}`;
  }

  // 1) Prod build: /OfficialGodot/dev-demo-ui.js -> 404, HTML stripped, /api/session -> devDemoUiIncluded: false
  const prodForge = await startForge('prod');
  const prodSession = await (await fetch(`${prodForge}/api/session`)).json();
  assert.equal(prodSession.buildMode, 'prod');
  assert.equal(prodSession.devDemoUiIncluded, false);
  const prodScriptRes = await fetch(`${prodForge}/OfficialGodot/dev-demo-ui.js`);
  assert.equal(prodScriptRes.status, 404, 'Prod PlayForge must NOT serve dev-demo-ui.js');
  const prodHtml = await (await fetch(`${prodForge}/OfficialGodot/`)).text();
  assert.doesNotMatch(prodHtml, /dev-demo-ui\.js/, 'Prod PlayForge HTML must strip dev-demo-ui.js');
  const prodEditorHtml = await (await fetch(`${prodForge}/OfficialGodot/editor.html`)).text();
  assert.doesNotMatch(prodEditorHtml, /dev-demo-ui\.js/, 'Prod PlayForge editor.html must strip dev-demo-ui.js');

  // 2) Test build: /OfficialGodot/dev-demo-ui.js -> 200, default OFF, toggle ON + F5 reload persists ON
  const testForge = await startForge('test');
  const testSession = await (await fetch(`${testForge}/api/session`)).json();
  assert.equal(testSession.buildMode, 'test');
  assert.equal(testSession.devDemoUiIncluded, true);
  const testScriptRes = await fetch(`${testForge}/OfficialGodot/dev-demo-ui.js`);
  assert.equal(testScriptRes.status, 200, 'Test build PlayForge must serve dev-demo-ui.js');

  await withChromeCdp(t, `${testForge}/OfficialGodot/`, async ({ send, evalJs }) => {
    const before = await evalJs(`({
      mode: window.PlayForgeDevDemoUI?.getBuildMode?.(),
      enabled: window.PlayForgeDevDemoUI?.isEnabled?.(),
      htmlHidden: document.documentElement.hidden,
      hasToggle: Boolean(document.getElementById('forge-dev-demo-toggle')),
      visibleDemoCount: [...document.body.querySelectorAll('[data-dev-demo-ui]')].filter(el => !el.hidden).length,
      totalDemoCount: document.body.querySelectorAll('[data-dev-demo-ui]').length
    })`);
    assert.equal(before.mode, 'test');
    assert.equal(before.enabled, false, 'PlayForge test build must default to OFF');
    assert.equal(before.htmlHidden, false, '<html> root must never be hidden when dev-demo UI is OFF');
    assert.equal(before.hasToggle, true);
    assert.ok(before.totalDemoCount >= 2, 'PlayForge should have gated test/demo UI controls');
    assert.equal(before.visibleDemoCount, 0, 'All PlayForge test/demo UI must be hidden when OFF');

    // Toggle ON -> verify visible -> F5 reload -> verify STILL ON & visible!
    await evalJs(`document.getElementById('forge-dev-demo-toggle').click();`);
    await delay(150);
    await send('Page.reload', { ignoreCache: true });
    await delay(850);

    const afterF5 = await evalJs(`({
      enabled: window.PlayForgeDevDemoUI?.isEnabled?.(),
      visibleDemoCount: [...document.body.querySelectorAll('[data-dev-demo-ui]')].filter(el => !el.hidden).length,
      toggleText: document.getElementById('forge-dev-demo-toggle')?.textContent || ''
    })`);
    assert.equal(afterF5.enabled, true, 'PlayForge setting ON must persist across F5 reload');
    assert.ok(afterF5.visibleDemoCount >= 2, 'PlayForge test/demo UI must remain visible after F5 reload');
    assert.match(afterF5.toggleText, /TEST.*ON/);
  });
});
