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
    ...(process.platform === 'linux' ? ['--no-sandbox', '--disable-dev-shm-usage'] : []),
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=0',
    `--user-data-dir=${profileDir}`,
    'about:blank'
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
  for (let i = 0; i < 300; i++) {
    const m = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
    if (m) { wsUrl = m[1]; break; }
    await delay(100);
  }
  assert.ok(wsUrl, `Chrome DevTools should start (${stderr.trim().slice(0, 200)})`);
  const debugOrigin = wsUrl.replace(/^ws:/, 'http:').replace(/\/devtools\/browser\/.*$/, '');
  let pageTarget = null;
  for (let i = 0; i < 150; i++) {
    try {
      const targets = await (await fetch(`${debugOrigin}/json/list`)).json();
      pageTarget = targets.find(item => item.type === 'page' && item.webSocketDebuggerUrl);
      if (pageTarget) break;
    } catch {}
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
  let loadResolvers = [];
  ws.addEventListener('message', e => {
    const msg = JSON.parse(String(e.data));
    if (msg.method === 'Page.loadEventFired') {
      const list = loadResolvers;
      loadResolvers = [];
      for (const resolve of list) resolve();
    }
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
  const waitForLoad = (timeoutMs = 20000) => new Promise(resolve => {
    const timer = setTimeout(resolve, timeoutMs);
    loadResolvers.push(() => { clearTimeout(timer); resolve(); });
  });
  const evalJs = async expression => {
    const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text || 'CDP eval error');
    }
    return res.result?.value;
  };
  const expectedOrigin = new URL(url).origin;
  const waitForOriginComplete = async () => {
    for (let i = 0; i < 150; i++) {
      try {
        const ready = await evalJs(`location.origin === ${JSON.stringify(expectedOrigin)} && document.readyState === 'complete'`);
        if (ready === true) return;
      } catch {}
      await delay(100);
    }
    throw new Error(`Timed out waiting for ${expectedOrigin} to reach readyState=complete`);
  };
  const reloadAndWait = async () => {
    const loaded = waitForLoad();
    await send('Page.reload', { ignoreCache: true });
    await loaded;
    await waitForOriginComplete();
  };
  try {
    await send('Page.enable');
    await send('Runtime.enable');
    const loaded = waitForLoad();
    await send('Page.navigate', { url });
    await loaded;
    await waitForOriginComplete();
    return await fn({ send, evalJs, waitForLoad, reloadAndWait });
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

test('PlayHub prod build exposes zero Test/Demo UI even if localStorage is manually set; debug build persists toggle across F5', { timeout: 240000 }, async t => {
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
  await withChromeCdp(t, `${prodUrl}/?view=billing`, async ({ evalJs, reloadAndWait }) => {
    await evalJs(`localStorage.setItem('playhub.dev.testDemoUi', '1');`);
    await reloadAndWait();
    const state = await evalJs(`(async () => {
      for (let i = 0; i < 100; i++) {
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

  // 2) Debug build: ZERO user-facing "데모 OFF" pills/cards; experimental UI stays OFF by default
  //    and is controlled via Admin (?devDemoUi=1 / PlayHubDevDemoUI API) with F5 persistence.
  const debugUrl = await launchMode('debug');
  await withChromeCdp(t, `${debugUrl}/?view=account`, async ({ evalJs, reloadAndWait }) => {
    const waitDevApi = `(async () => {
      for (let i = 0; i < 100; i++) {
        if (document.readyState === 'complete' && window.PlayHubDevDemoUI) break;
        await new Promise(r => setTimeout(r, 100));
      }
      return {
        mode: window.PlayHubDevDemoUI?.getBuildMode?.(),
        enabled: window.PlayHubDevDemoUI?.isEnabled?.(),
        hasNavToggle: Boolean(document.getElementById('dev-demo-nav-toggle')),
        hasCard: Boolean(document.getElementById('dev-demo-settings-card')),
        avatarNavHidden: Boolean(document.querySelector('a[data-nav-view="avatar"]')?.hidden)
      };
    })()`;
    const initial = await evalJs(waitDevApi);
    assert.equal(initial.mode, 'debug');
    assert.equal(initial.enabled, false, 'Debug build must default to OFF');
    assert.equal(initial.hasNavToggle, false, 'PlayHub user header must NOT render 데모 OFF button (Admin owns 실험기능 보기)');
    assert.equal(initial.hasCard, false, 'PlayHub user account page must NOT render 데모 UI card');
    assert.equal(initial.avatarNavHidden, true, 'Avatar nav link must be hidden by default when experimental features are OFF');

    // Enable via Admin launch/API -> F5 reload -> verify ON persists without rendering user-facing 데모 buttons
    await evalJs(`window.PlayHubDevDemoUI.setEnabled(true);`);
    await delay(100);
    await reloadAndWait();
    const afterF5On = await evalJs(waitDevApi);
    assert.equal(afterF5On.enabled, true, 'Admin-enabled experimental setting ON must persist after F5 reload');
    assert.equal(afterF5On.hasNavToggle, false);
    assert.equal(afterF5On.hasCard, false);
    assert.equal(afterF5On.avatarNavHidden, false, 'Avatar nav link must be visible when experimental features are ON');

    // Disable -> F5 reload -> verify OFF persists
    await evalJs(`window.PlayHubDevDemoUI.setEnabled(false);`);
    await delay(100);
    await reloadAndWait();
    const afterF5Off = await evalJs(waitDevApi);
    assert.equal(afterF5Off.enabled, false, 'Setting OFF must persist after F5 reload');
    assert.equal(afterF5Off.avatarNavHidden, true, 'Avatar nav link must hide again when experimental features are OFF');
  });
});

test('PlayForge includes Test/Demo UI ONLY in dev/debug/test builds, hides by default, toggles ON with F5 persistence, and excludes in prod', { timeout: 240000 }, async t => {
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
  const prodShowcaseBtn = prodHtml.match(/<button\b[^>]*data-filter="showcase"[^>]*>/i);
  assert.ok(prodShowcaseBtn, 'Prod PlayForge HTML must keep showcase ("제작과정 보기") as a production user feature');
  assert.doesNotMatch(prodShowcaseBtn[0], /data-dev-demo-ui|\bhidden\b/i, 'Prod showcase button must NEVER be gated or hidden as dev/demo UI');
  const prodEditorHtml = await (await fetch(`${prodForge}/OfficialGodot/editor.html`)).text();
  assert.doesNotMatch(prodEditorHtml, /dev-demo-ui\.js/, 'Prod PlayForge editor.html must strip dev-demo-ui.js');

  // 2) Test build: /OfficialGodot/dev-demo-ui.js -> 200, default OFF, toggle ON + F5 reload persists ON
  const testForge = await startForge('test');
  const testSession = await (await fetch(`${testForge}/api/session`)).json();
  assert.equal(testSession.buildMode, 'test');
  assert.equal(testSession.devDemoUiIncluded, true);
  const testScriptRes = await fetch(`${testForge}/OfficialGodot/dev-demo-ui.js`);
  assert.equal(testScriptRes.status, 200, 'Test build PlayForge must serve dev-demo-ui.js');

  await withChromeCdp(t, `${testForge}/OfficialGodot/`, async ({ evalJs, reloadAndWait }) => {
    const before = await evalJs(`({
      mode: window.PlayForgeDevDemoUI?.getBuildMode?.(),
      enabled: window.PlayForgeDevDemoUI?.isEnabled?.(),
      htmlHidden: document.documentElement.hidden,
      hasTopToggle: Boolean(document.getElementById('forge-dev-demo-toggle')),
      hasSidebarPanel: Boolean(document.getElementById('forge-dev-demo-panel')),
      hasEditorToggle: Boolean(document.getElementById('forge-editor-dev-demo-toggle')),
      showcaseVisible: (() => {
        const btn = document.querySelector('button[data-filter="showcase"]');
        return Boolean(btn && !btn.hidden && !btn.hasAttribute('data-dev-demo-ui'));
      })(),
      visibleDemoCount: [...document.body.querySelectorAll('[data-dev-demo-ui]')].filter(el => !el.hidden).length,
      totalDemoCount: document.body.querySelectorAll('[data-dev-demo-ui]').length
    })`);
    assert.equal(before.mode, 'test');
    assert.equal(before.enabled, false, 'PlayForge test build must default to OFF');
    assert.equal(before.htmlHidden, false, '<html> root must never be hidden when dev-demo UI is OFF');
    assert.equal(before.hasTopToggle, false, 'PlayForge topbar must NOT render 데모 OFF button');
    assert.equal(before.hasSidebarPanel, false, 'PlayForge sidebar must NOT render 데모 card');
    assert.equal(before.hasEditorToggle, false, 'PlayForge editor must NOT render 데모 OFF button');
    assert.equal(before.showcaseVisible, true, '제작과정 보기(showcase)는 완성된 정식 사용자 기능이므로 dev-demo OFF에서도 항상 표시되어야 합니다');
    assert.ok(before.totalDemoCount >= 2, 'PlayForge should have gated test/demo UI controls');
    assert.equal(before.visibleDemoCount, 0, 'All PlayForge test/demo UI must be hidden when OFF');

    // Enable via Admin launch/API -> verify visible -> F5 reload -> verify STILL ON & visible!
    await evalJs(`window.PlayForgeDevDemoUI.setEnabled(true);`);
    await delay(100);
    await reloadAndWait();

    const afterF5 = await evalJs(`({
      enabled: window.PlayForgeDevDemoUI?.isEnabled?.(),
      hasTopToggle: Boolean(document.getElementById('forge-dev-demo-toggle')),
      visibleDemoCount: [...document.body.querySelectorAll('[data-dev-demo-ui]')].filter(el => !el.hidden).length
    })`);
    assert.equal(afterF5.enabled, true, 'PlayForge setting ON must persist across F5 reload');
    assert.equal(afterF5.hasTopToggle, false, 'PlayForge must still NOT inject 데모 toggle buttons');
    assert.ok(afterF5.visibleDemoCount >= 2, 'PlayForge test/demo UI must remain visible after F5 reload');
  });
});
