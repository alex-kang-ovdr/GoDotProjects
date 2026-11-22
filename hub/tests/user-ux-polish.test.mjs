import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server/app.mjs';
import { createStaticServer } from '../tools/dev.mjs';

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const HUB_ROOT = path.resolve(TESTS_DIR, '..');
const PLATFORM_ROOT = path.resolve(HUB_ROOT, '..');
const DIST_USER = path.join(HUB_ROOT, 'dist', 'user');

function listenServer(server, host = '127.0.0.1', port = 0) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve(server.address());
    });
  });
}

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

async function withChromeCdp(t, url, fn, { width = 1280, height = 900, mobile = false } = {}) {
  const chrome = findChrome();
  assert.ok(chrome, 'Chrome executable is required for UX E2E test');
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-ux-cdp-'));
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
  proc.stderr.on('data', chunk => { stderr += chunk.toString('utf8'); });

  t.after(async () => {
    try { proc.stderr?.destroy(); } catch {}
    try { proc.kill(); } catch {}
    try { proc.unref(); } catch {}
    await delay(200);
    try { fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 80 }); } catch {}
  });

  let wsUrl = '';
  for (let i = 0; i < 60; i++) {
    const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
    if (match) { wsUrl = match[1]; break; }
    await delay(100);
  }
  assert.ok(wsUrl, 'Chrome DevTools endpoint should start');

  const debugOrigin = wsUrl.replace(/^ws:/, 'http:').replace(/\/devtools\/browser\/.*$/, '');
  let pageTarget = null;
  for (let i = 0; i < 40; i++) {
    const targets = await (await fetch(`${debugOrigin}/json/list`)).json();
    pageTarget = targets.find(item => item.type === 'page' && item.webSocketDebuggerUrl);
    if (pageTarget) break;
    await delay(100);
  }
  assert.ok(pageTarget, 'Chrome page target should exist');

  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  ws.addEventListener('message', event => {
    const msg = JSON.parse(String(event.data));
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
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: mobile ? 2 : 1,
      mobile
    });
    await send('Page.navigate', { url });
    await delay(900);
    return await fn({ send, evalJs });
  } finally {
    ws.close();
  }
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

async function startBillingHub(t) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-ux-polish-'));
  const liveUserDir = path.join(tmpDir, 'user-dist');
  fs.cpSync(DIST_USER, liveUserDir, { recursive: true });
  const userPort = await reservePort();
  const userBaseUrl = `http://127.0.0.1:${userPort}`;
  const trustedProxySecret = randomBytes(32).toString('hex');

  const hubApp = createApp({
    dataDir: path.join(tmpDir, 'hub-data'),
    publicHost: '127.0.0.1',
    adminHost: '127.0.0.1',
    publicPort: 0,
    adminPort: 0,
    userBaseUrl,
    adminBaseUrl: 'http://127.0.0.1:0',
    userOrigins: [userBaseUrl],
    adminOrigins: ['http://127.0.0.1:0'],
    secureCookies: false,
    billing: {
      enabled: true,
      allowMockProvider: true,
      allowDemoAccount: true
    }
  }, {
    rootDir: liveUserDir,
    platformRoot: PLATFORM_ROOT,
    trustedProxySecret
  });
  const addrs = await hubApp.listen();
  fs.writeFileSync(
    path.join(liveUserDir, 'config.js'),
    `window.PLAYHUB_CONFIG=${JSON.stringify({ apiPort: addrs.public.port, apiBaseUrl: '', sameOriginApi: true, buildMode: 'dev', includeDevDemoUi: true, mode: 'local-iis-poc' })};\n`
  );

  const userServer = createStaticServer(liveUserDir, {
    apiPort: addrs.public.port,
    trustedProxySecret,
    trustProxy: true
  });
  await listenServer(userServer, '127.0.0.1', userPort);

  t.after(async () => {
    await new Promise(resolve => { userServer.close(resolve); userServer.closeAllConnections(); });
    await hubApp.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  return { userBaseUrl };
}

test('PlayCoin top-up dialog opens cleanly in Billing Shop (default demo OFF -> toggle ON + F5) & Avatar Shop', async t => {
  const { userBaseUrl } = await startBillingHub(t);

  await withChromeCdp(t, `${userBaseUrl}/?view=billing`, async ({ send, evalJs }) => {
    // 1) Default OFF in dev build: dialog opens cleanly, demo sign-in button hidden until Dev setting is ON
    const defaultOff = await evalJs(`(async () => {
      for (let i = 0; i < 40; i++) {
        if (document.querySelector('[data-buy-sku]')) break;
        await new Promise(r => setTimeout(r, 100));
      }
      const hasShopDemoBefore = Boolean(document.getElementById('billing-demo-signin'));
      document.querySelector('[data-buy-sku]')?.click();
      await new Promise(r => setTimeout(r, 150));
      const dlg = document.getElementById('billing-checkout-dialog');
      const hasDialogDemoBefore = Boolean(document.getElementById('billing-dialog-demo-signin'));
      if (dlg?.open) dlg.close();
      return {
        dialogOpenedWhenOff: Boolean(dlg),
        hasShopDemoBefore,
        hasDialogDemoBefore,
        hasDevToggle: Boolean(document.getElementById('dev-demo-nav-toggle'))
      };
    })()`);

    assert.equal(defaultOff.dialogOpenedWhenOff, true, 'Checkout dialog must open even when Test/Demo UI is OFF');
    assert.equal(defaultOff.hasShopDemoBefore, false, 'Demo sign-in button must be hidden by default (OFF)');
    assert.equal(defaultOff.hasDialogDemoBefore, false, 'In-dialog demo button must be hidden by default (OFF)');
    assert.equal(defaultOff.hasDevToggle, true, 'Dev build must render Dev Demo UI toggle');

    // 2) Turn ON via Dev toggle and F5 reload -> persists ON and shows demo UI
    await evalJs(`document.getElementById('dev-demo-nav-toggle').click();`);
    await delay(200);
    await send('Page.reload', { ignoreCache: true });
    await delay(900);

    const initial = await evalJs(`(async () => {
      for (let i = 0; i < 40; i++) {
        if (document.querySelector('[data-buy-sku]')) break;
        await new Promise(r => setTimeout(r, 100));
      }
      const btn = document.querySelector('[data-buy-sku]');
      if (!btn) return { found: false, text: document.body.innerText.slice(0, 300) };
      btn.click();
      await new Promise(r => setTimeout(r, 150));
      const dlg = document.getElementById('billing-checkout-dialog');
      const demoBtn = document.getElementById('billing-dialog-demo-signin');
      return {
        found: true,
        dialogOpen: Boolean(dlg && dlg.open),
        hasDemoBtn: Boolean(demoBtn),
        dialogText: dlg ? dlg.innerText : ''
      };
    })()`);

    assert.equal(initial.found, true, `Expected SKU buy button on billing shop: ${initial.text || ''}`);
    assert.equal(initial.dialogOpen, true, 'Clicking 구매하기 must open #billing-checkout-dialog even when unauthenticated');
    assert.equal(initial.hasDemoBtn, true, 'After turning Dev Demo UI ON + F5 reload, demo sign-in CTA must appear');

    // Click demo sign-in inside the dialog -> should seamlessly transition to payment method selector & complete order
    const checkout = await evalJs(`(async () => {
      document.getElementById('billing-dialog-demo-signin').click();
      for (let i = 0; i < 40; i++) {
        if (document.getElementById('billing-create-order')) break;
        await new Promise(r => setTimeout(r, 100));
      }
      const submitBtn = document.getElementById('billing-create-order');
      const agree = document.getElementById('billing-agree-terms');
      if (!submitBtn || !agree) return { transitioned: false };
      agree.click();
      submitBtn.click();
      for (let i = 0; i < 40; i++) {
        if (document.getElementById('billing-confirm-mock')) break;
        await new Promise(r => setTimeout(r, 100));
      }
      const confirmBtn = document.getElementById('billing-confirm-mock');
      if (!confirmBtn) return { transitioned: true, orderCreated: false };
      confirmBtn.click();
      for (let i = 0; i < 40; i++) {
        const dlg = document.getElementById('billing-checkout-dialog');
        if (!dlg || !dlg.open) break;
        await new Promise(r => setTimeout(r, 100));
      }
      for (let i = 0; i < 40; i++) {
        const val = document.getElementById('billing-balance-value')?.textContent || '';
        if (/[1-9]/.test(val)) break;
        await new Promise(r => setTimeout(r, 100));
      }
      const pillText = document.getElementById('billing-balance-value')?.textContent || '';
      return {
        transitioned: true,
        orderCreated: true,
        dialogClosed: !document.getElementById('billing-checkout-dialog')?.open,
        pillText
      };
    })()`);

    assert.equal(checkout.transitioned, true, 'Demo sign-in inside dialog should transition directly to payment selector');
    assert.equal(checkout.orderCreated, true, 'Submitting order should open sandbox approval step');
    assert.equal(checkout.dialogClosed, true, 'Confirming sandbox order should close checkout dialog');
    assert.match(checkout.pillText, /[1-9]/, `Expected PlayCoin balance credited in header pill, got "${checkout.pillText}"`);
  });

  // Verify Avatar Shop top-up dialog opens cleanly (default OFF hides instant test packs, ON shows packs)
  await withChromeCdp(t, `${userBaseUrl}/?view=avatar`, async ({ evalJs }) => {
    const avatarOff = await evalJs(`(async () => {
      for (let i = 0; i < 40; i++) {
        if (document.getElementById('avatar-topup-open')) break;
        await new Promise(r => setTimeout(r, 100));
      }
      const openBtn = document.getElementById('avatar-topup-open');
      if (!openBtn) return { hasBtn: false };
      openBtn.click();
      await new Promise(r => setTimeout(r, 200));
      const dlg = document.getElementById('avatar-topup-dialog');
      const packsOff = dlg ? dlg.querySelectorAll('[data-topup-pack]').length : 0;
      if (dlg?.open) dlg.close();
      return {
        hasBtn: true,
        dialogOpen: Boolean(dlg),
        packsOff
      };
    })()`);
    assert.equal(avatarOff.hasBtn, true, 'Avatar shop should render PlayCoin top-up button');
    assert.equal(avatarOff.packsOff, 0, 'Instant dev test top-up packs must be hidden when Dev Demo UI is OFF');

    const avatarOn = await evalJs(`(async () => {
      document.getElementById('dev-demo-nav-toggle').click();
      await new Promise(r => setTimeout(r, 300));
      document.getElementById('avatar-topup-open').click();
      await new Promise(r => setTimeout(r, 250));
      const dlg = document.getElementById('avatar-topup-dialog');
      const packs = dlg ? dlg.querySelectorAll('[data-topup-pack]').length : 0;
      return {
        dialogOpen: Boolean(dlg && (dlg.open || dlg.hasAttribute('open'))),
        packCount: packs
      };
    })()`);

    assert.equal(avatarOn.dialogOpen, true, 'Clicking avatar PlayCoin 충전 must open #avatar-topup-dialog');
    assert.ok(avatarOn.packCount >= 1, `Expected at least 1 top-up pack when Dev Demo UI is ON, got ${avatarOn.packCount}`);
  });
});

test('Unified 3-tier error handling: general -> Toast, input -> Inline, fatal -> Modal or Full-Page', async t => {
  const { userBaseUrl } = await startBillingHub(t);

  await withChromeCdp(t, `${userBaseUrl}/`, async ({ evalJs }) => {
    const result = await evalJs(`(async () => {
      for (let i = 0; i < 40; i++) {
        if (window.PlayHubErrorUI) break;
        await new Promise(r => setTimeout(r, 100));
      }
      const ui = window.PlayHubErrorUI;
      if (!ui) return { ready: false };

      // 1) General error -> bottom Toast
      const generalMode = ui.report(Object.assign(new Error('일시적인 서버 오류'), { status: 500, code: 'INTERNAL' }));
      const toastEl = document.getElementById('toast');
      const toastState = {
        mode: generalMode,
        visible: !toastEl.hidden,
        tone: toastEl.dataset.tone,
        role: toastEl.getAttribute('role'),
        text: toastEl.textContent
      };

      // 2) Input error (400/422) with inlineEl -> Inline Message
      const inlineBox = document.createElement('p');
      inlineBox.className = 'inline-error';
      inlineBox.hidden = true;
      document.body.appendChild(inlineBox);
      const inputMode = ui.report(Object.assign(new Error('PIN 형식이 올바르지 않습니다.'), { status: 400, code: 'INVALID_PIN' }), { inlineEl: inlineBox });
      const inlineState = {
        mode: inputMode,
        visible: !inlineBox.hidden,
        role: inlineBox.getAttribute('role'),
        text: inlineBox.textContent
      };
      inlineBox.remove();

      // 3a) Fatal error without fatalRoot -> Modal (#fatal-error-dialog)
      const modalMode = ui.report(Object.assign(new Error('계정 이용이 제한되었습니다.'), { status: 403, code: 'USER_SANCTIONED' }));
      const dlg = document.getElementById('fatal-error-dialog');
      const modalState = {
        mode: modalMode,
        open: Boolean(dlg && dlg.open),
        message: document.getElementById('fatal-error-message')?.textContent || '',
        code: document.getElementById('fatal-error-code')?.textContent || ''
      };
      if (dlg?.open) dlg.close();

      // 3b) Fatal error with fatalRoot -> Full-Page error view
      const pageHost = document.createElement('div');
      document.body.appendChild(pageHost);
      const pageMode = ui.report(Object.assign(new Error('필수 카탈로그 스키마가 호환되지 않습니다.'), { code: 'SCHEMA_INCOMPATIBLE' }), { fatalRoot: pageHost });
      const fatalPageEl = pageHost.querySelector('[data-testid="fatal-error-page"]');
      const pageState = {
        mode: pageMode,
        rendered: Boolean(fatalPageEl),
        text: fatalPageEl?.textContent || ''
      };
      pageHost.remove();

      return { ready: true, toastState, inlineState, modalState, pageState };
    })()`);

    assert.equal(result.ready, true, 'window.PlayHubErrorUI should be exposed');

    assert.equal(result.toastState.mode, 'toast');
    assert.equal(result.toastState.visible, true);
    assert.equal(result.toastState.tone, 'error');
    assert.equal(result.toastState.role, 'alert');
    assert.match(result.toastState.text, /일시적인 서버 오류/);

    assert.equal(result.inlineState.mode, 'inline');
    assert.equal(result.inlineState.visible, true);
    assert.equal(result.inlineState.role, 'alert');
    assert.match(result.inlineState.text, /PIN 형식이 올바르지 않습니다/);

    assert.equal(result.modalState.mode, 'modal');
    assert.equal(result.modalState.open, true);
    assert.match(result.modalState.message, /계정 이용이 제한되었습니다/);
    assert.match(result.modalState.code, /USER_SANCTIONED/);

    assert.equal(result.pageState.mode, 'page');
    assert.equal(result.pageState.rendered, true);
    assert.match(result.pageState.text, /SCHEMA_INCOMPATIBLE/);
  });
});
