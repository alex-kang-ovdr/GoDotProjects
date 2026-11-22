import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes, scryptSync } from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server/app.mjs';
import { createStaticServer } from '../tools/dev.mjs';
import { createStoreProxy } from '../tools/store-proxy.mjs';
import { createStoreApp } from '../../store/server/store-api.mjs';
import { loadMergedCatalog } from '../../store/server/index.mjs';

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const HUB_ROOT = path.resolve(TESTS_DIR, '..');
const PLATFORM_ROOT = path.resolve(HUB_ROOT, '..');
const DIST_USER = path.join(HUB_ROOT, 'dist', 'user');

function makeAdminCreds(password) {
  const salt = randomBytes(16).toString('hex');
  return { salt, passwordHash: scryptSync(password, salt, 64).toString('hex') };
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

async function startIntegratedHub(t, { startStore = true, internalSecret = 'hub-store-integration-secret-32chars!' } = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-store-hub-e2e-'));
  const hubDataDir = path.join(tmpDir, 'hub-data');
  const storeDataDir = path.join(tmpDir, 'store-data');
  const creds = makeAdminCreds('AdminPassphrase!2026');

  let storeApp = null;
  let storePort = 65199;
  if (startStore) {
    const catalog = loadMergedCatalog();
    storeApp = createStoreApp({
      dataDir: storeDataDir,
      catalog,
      internalSecret,
      allowMockSession: false
    });
    const storeAddr = await storeApp.listen(0, '127.0.0.1');
    storePort = storeAddr.port;
  }

  const hubApp = createApp({
    dataDir: hubDataDir,
    publicHost: '127.0.0.1',
    adminHost: '127.0.0.1',
    publicPort: 0,
    adminPort: 0,
    userBaseUrl: 'http://127.0.0.1:0',
    adminBaseUrl: 'http://127.0.0.1:0',
    userOrigins: ['http://127.0.0.1:0'],
    adminOrigins: ['http://127.0.0.1:0'],
    secureCookies: false,
    admin: { username: 'admin', passwordHash: creds.passwordHash, salt: creds.salt, localAutoLogin: false }
  }, {
    rootDir: DIST_USER,
    platformRoot: PLATFORM_ROOT
  });
  const hubAddrs = await hubApp.listen();

  const storeProxy = createStoreProxy({
    upstream: `http://127.0.0.1:${storePort}`,
    allowedOrigins: [],
    resolveSessionIdentity: req => hubApp.resolveStoreIdentity(req),
    internalSecret
  });

  const userServer = createStaticServer(DIST_USER, {
    storeProxy,
    apiPort: hubAddrs.public.port
  });
  const userAddr = await listenServer(userServer, '127.0.0.1', 0);
  const userBaseUrl = `http://127.0.0.1:${userAddr.port}`;
  const adminApiUrl = `http://127.0.0.1:${hubAddrs.admin.port}`;

  t.after(async () => {
    await new Promise(resolve => { userServer.close(resolve); userServer.closeAllConnections(); });
    await hubApp.close();
    if (storeApp) await storeApp.close();
    fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  return { userBaseUrl, adminApiUrl, hubApp, storeApp, storePort };
}

test('Hub /store/ proxy mounts 4,592-asset Store, forwards verified Hub SSO sessions, and strips spoofed headers', async t => {
  const { userBaseUrl, hubApp } = await startIntegratedHub(t);

  // 1. /store redirects cleanly to /store/ and serves Stitch Asset Store HTML
  const redirRes = await fetch(`${userBaseUrl}/store`, { redirect: 'manual' });
  assert.equal(redirRes.status, 308);
  assert.equal(redirRes.headers.get('location'), '/store/');

  const htmlRes = await fetch(`${userBaseUrl}/store/`);
  assert.equal(htmlRes.status, 200);
  const html = await htmlRes.text();
  assert.match(html, /PlayForge Asset Store/);
  assert.match(html, /id="hub-home-link"/);

  // 2. /api/store/catalog through Hub returns the full merged catalog (11,800+ assets)
  const expectedTotal = loadMergedCatalog().length;
  const catRes = await fetch(`${userBaseUrl}/api/store/catalog?limit=12`);
  assert.equal(catRes.status, 200);
  const catData = await catRes.json();
  assert.equal(catData.catalog_total, expectedTotal);
  assert.ok(catData.catalog_total >= 11800);
  assert.equal(catData.items.length, 12);
  assert.ok(catData.licenses.includes('CC0-1.0'));
  assert.ok(catData.licenses.includes('MIT'));
  assert.ok(catData.licenses.includes('CC-BY-3.0'));
  assert.ok(catData.licenses.includes('OFL-1.1'));

  // 3. Spoofed client SSO headers are stripped by storeProxy (falls back to local_default without valid Hub cookie)
  const spoofRes = await fetch(`${userBaseUrl}/api/store/session`, {
    headers: {
      'x-playhub-user': 'victim@playhub.local',
      'x-playhub-account-key': 'a'.repeat(64),
      'x-playhub-internal-secret': 'hub-store-integration-secret-32chars!',
      'x-store-mock-user': 'attacker@playhub.local'
    }
  });
  assert.equal(spoofRes.status, 200);
  const spoofData = await spoofRes.json();
  assert.equal(spoofData.account.auth_mode, 'local_default');
  assert.notEqual(spoofData.account.account_label, 'victim@playhub.local');

  // 4. Disallowed external Origin is rejected at proxy boundary (403 ORIGIN_DENIED)
  const badOriginRes = await fetch(`${userBaseUrl}/api/store/catalog`, {
    headers: { Origin: 'https://evil.example' }
  });
  assert.equal(badOriginRes.status, 403);
  assert.equal((await badOriginRes.json()).error.code, 'ORIGIN_DENIED');

  // 5. Real Hub sessions (User A vs User B) get isolated Hub SSO Store libraries automatically!
  const createHubSession = async (displayName) => {
    const sessRes = await fetch(`${userBaseUrl}/api/session`);
    const cookie = sessRes.headers.get('set-cookie').split(';')[0];
    const sessJson = await sessRes.json();
    // Promote session to a guest principal by creating a user directly via DB (simulating logged-in Hub user)
    const token = decodeURIComponent(cookie.split('=')[1]);
    const row = hubApp.db.prepare('SELECT id_hash FROM sessions WHERE csrf=?').get(sessJson.csrfToken);
    const userId = `u_${randomBytes(8).toString('hex')}`;
    hubApp.db.prepare("INSERT INTO users(id, kind, display_name, created_at) VALUES(?,?,?,?)").run(userId, 'registered', displayName, Date.now());
    hubApp.db.prepare('UPDATE sessions SET principal_id=? WHERE id_hash=?').run(userId, row.id_hash);
    assert.ok(token);
    return cookie;
  };

  const aliceCookie = await createHubSession('alice-creator@playhub.local');
  const bobCookie = await createHubSession('bob-creator@playhub.local');

  const aliceSess = await (await fetch(`${userBaseUrl}/api/store/session`, { headers: { Cookie: aliceCookie } })).json();
  assert.equal(aliceSess.account.auth_mode, 'hub_sso_header');
  assert.equal(aliceSess.account.account_label, 'alice-creator@playhub.local');

  const bobSess = await (await fetch(`${userBaseUrl}/api/store/session`, { headers: { Cookie: bobCookie } })).json();
  assert.equal(bobSess.account.auth_mode, 'hub_sso_header');
  assert.equal(bobSess.account.account_label, 'bob-creator@playhub.local');
  assert.notEqual(aliceSess.account.account_key, bobSess.account.account_key);

  // Alice saves kaykit-adventurers-cc0; Bob's library stays empty
  const aliceSave = await fetch(`${userBaseUrl}/api/store/my-assets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: aliceCookie, Origin: userBaseUrl },
    body: JSON.stringify({ slug: 'kaykit-adventurers-cc0', action: 'save' })
  });
  assert.equal(aliceSave.status, 200);
  const aliceSaved = await aliceSave.json();
  assert.equal(aliceSaved.count, 1);
  assert.equal(aliceSaved.entries[0].slug, 'kaykit-adventurers-cc0');

  const bobLib = await (await fetch(`${userBaseUrl}/api/store/my-assets`, { headers: { Cookie: bobCookie } })).json();
  assert.equal(bobLib.count, 0);
});

test('Hub stays 100% healthy when Store upstream is down (outage isolation) and Admin reports liveCatalog 4,592', async t => {
  const { userBaseUrl, adminApiUrl } = await startIntegratedHub(t, { startStore: false });

  // Store endpoint returns clean 502 STORE_UNAVAILABLE
  const storeDown = await fetch(`${userBaseUrl}/api/store/catalog`);
  assert.equal(storeDown.status, 502);
  assert.equal((await storeDown.json()).error.code, 'STORE_UNAVAILABLE');

  // PlayHub Portal & Game API remain completely unaffected
  const hubHome = await fetch(`${userBaseUrl}/`);
  assert.equal(hubHome.status, 200);
  const homeHtml = await hubHome.text();
  assert.match(homeHtml, /data-testid="nav-store"/);

  const hubHealth = await fetch(`${userBaseUrl}/api/health`);
  assert.equal(hubHealth.status, 200);
  assert.equal((await hubHealth.json()).ok, true);

  // Admin Store overview reports liveCatalog (4,592) while preserving 5-item seeded moderation DB
  const initRes = await fetch(`${adminApiUrl}/api/admin/session`);
  const initCookie = initRes.headers.get('set-cookie').split(';')[0];
  const initJson = await initRes.json();
  const loginRes = await fetch(`${adminApiUrl}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: initCookie, 'X-CSRF-Token': initJson.csrfToken, Origin: 'http://127.0.0.1:0' },
    body: JSON.stringify({ username: 'admin', password: 'AdminPassphrase!2026' })
  });
  assert.equal(loginRes.status, 200);
  const adminCookie = loginRes.headers.get('set-cookie').split(';')[0];
  const ovRes = await fetch(`${adminApiUrl}/api/admin/store/overview`, { headers: { Cookie: adminCookie } });
  assert.equal(ovRes.status, 200);
  const ov = await ovRes.json();
  assert.equal(ov.summary.totalPackages, 5);
  assert.equal(ov.contractPolicy.hubCatalogIsolated, true);
  assert.equal(ov.liveCatalog.available, true);
  assert.equal(ov.liveCatalog.totalEntries, loadMergedCatalog().length);
});

const chromePath = process.env.PLAYHUB_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

test('Real Chrome CDP navigates PlayHub Home -> Create -> /store/ (4,592 assets) -> back to PLAY HUB', {
  skip: !fs.existsSync(chromePath),
  timeout: 60000
}, async t => {
  const { userBaseUrl } = await startIntegratedHub(t);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-store-cdp-'));
  const chrome = spawn(
    chromePath,
    ['--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'],
    { windowsHide: true, stdio: 'ignore' }
  );
  let socket;
  const exceptions = [];
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    let port;
    for (let i = 0; i < 100; i += 1) {
      try {
        const value = Number(fs.readFileSync(portFile, 'utf8').split('\n')[0]);
        if (Number.isInteger(value) && value > 0) { port = value; break; }
      } catch {}
      await delay(100);
    }
    assert.ok(port, 'Chrome debugging port should be ready');

    const page = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { socket.addEventListener('open', res, { once: true }); socket.addEventListener('error', rej, { once: true }); });
    let serial = 0;
    const pending = new Map();
    socket.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.method === 'Runtime.exceptionThrown') exceptions.push(msg.params.exceptionDetails.text);
      if (pending.has(msg.id)) {
        const [resolve, reject] = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      }
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++serial;
      pending.set(id, [resolve, reject]);
      socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async (expression) => {
      const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (res.exceptionDetails) throw new Error(res.exceptionDetails.text);
      return res.result.value;
    };
    const until = async (expression) => {
      for (let i = 0; i < 100; i += 1) {
        if (await evaluate(expression)) return;
        await delay(50);
      }
      throw new Error(`Condition timed out: ${expression}`);
    };

    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false });

    // 1. Open PlayHub Home on Desktop and confirm separated Genre Hub & Creator Hub above Library
    await send('Page.navigate', { url: `${userBaseUrl}/` });
    await until("!!document.querySelector('[data-testid=\"nav-store\"]') && !!document.querySelector('[data-testid=\"creator-hub-section\"]') && !!document.querySelector('[data-testid=\"home-store-tile\"]')");

    // 1b. Switch to Mobile viewport (390x844) and verify Creator Hub is separated from Genre Hub and sits directly above Full Game Library
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await delay(150);
    const mobileOrder = await evaluate(`(() => {
      const top = document.querySelector('.home-sec-top')?.getBoundingClientRect();
      const genre = document.querySelector('.home-sec-hubs')?.getBoundingClientRect();
      const cont = document.querySelector('.home-sec-continue')?.getBoundingClientRect();
      const creator = document.querySelector('.home-sec-creator')?.getBoundingClientRect();
      const lib = document.querySelector('.home-sec-library')?.getBoundingClientRect();
      return {
        topY: top?.top ?? -1,
        genreY: genre?.top ?? -1,
        continueY: cont?.top ?? -1,
        creatorY: creator?.top ?? -1,
        creatorBottom: creator?.bottom ?? -1,
        libraryY: lib?.top ?? -1,
        genreContainsStore: !!document.querySelector('.home-sec-hubs [data-testid="home-store-tile"]'),
        creatorContainsStore: !!document.querySelector('.home-sec-creator [data-testid="home-store-tile"]'),
        creatorContainsForge: !!document.querySelector('.home-sec-creator [data-testid="home-forge-tile"]')
      };
    })()`);
    assert.equal(mobileOrder.genreContainsStore, false, 'Genre Hub must NOT contain Creator Hub tiles');
    assert.equal(mobileOrder.creatorContainsStore, true, 'Creator Hub must contain Asset Store tile');
    assert.equal(mobileOrder.creatorContainsForge, true, 'Creator Hub must contain PlayForge tile');
    assert.ok(mobileOrder.topY < mobileOrder.genreY, 'TOP 4 must be above Genre Hub on mobile');
    assert.ok(mobileOrder.genreY < mobileOrder.continueY, 'Genre Hub must be above Continue on mobile');
    assert.ok(mobileOrder.continueY < mobileOrder.creatorY, 'Continue must be above Creator Hub on mobile');
    assert.ok(mobileOrder.creatorBottom <= mobileOrder.libraryY + 1, 'Creator Hub must sit directly above Full Game Library on mobile');

    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false });

    // 2. Navigate to Create view and confirm Asset Store card
    await send('Page.navigate', { url: `${userBaseUrl}/?view=create` });
    await until("!!document.querySelector('[data-testid=\"creator-store-link\"]')");

    // 3. Navigate into /store/ on the SAME PlayHub origin
    await send('Page.navigate', { url: `${userBaseUrl}/store/` });
    await until("document.querySelector('#connection-badge')?.dataset.mode === 'live' && document.querySelectorAll('#catalog-list .card').length === 24");
    const resultsText = await evaluate("document.querySelector('#results-count')?.textContent");
    assert.match(resultsText, new RegExp(loadMergedCatalog().length.toLocaleString('en-US').replace(/,/g, ',')));
    const hubLinkVisible = await evaluate("!document.querySelector('#hub-home-link')?.hidden && document.querySelector('#hub-home-link')?.getAttribute('href') === '/'");
    assert.equal(hubLinkVisible, true);

    // Save a package via Hub same-origin /api/store/my-assets
    await evaluate("document.querySelector('[data-action=\"toggle-library\"][data-id=\"lowpoly-fortress-pack\"]').click()");
    await until("document.querySelector('#library-count')?.textContent === '1'");

    // Mobile 390px Store view must have zero horizontal overflow (no right gutter / sideways pan)
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await delay(200);
    const mobileStoreOverflow = await evaluate(`({
      vw: window.innerWidth,
      docScrollW: document.documentElement.scrollWidth,
      bodyScrollW: document.body.scrollWidth
    })`);
    assert.equal(mobileStoreOverflow.vw, 390, 'Mobile Store viewport width must remain 390px');
    assert.ok(mobileStoreOverflow.docScrollW <= 390, `Mobile Store must have zero horizontal overflow, got ${mobileStoreOverflow.docScrollW}px`);

    assert.deepEqual(exceptions, []);
  } finally {
    socket?.close();
    await new Promise((resolve) => {
      chrome.once('exit', resolve);
      if (chrome.exitCode !== null || !chrome.kill()) resolve();
    });
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
