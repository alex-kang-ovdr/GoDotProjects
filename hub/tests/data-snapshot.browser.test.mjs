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

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const HUB_ROOT = path.resolve(TESTS_DIR, '..');
const PLATFORM_ROOT = path.resolve(HUB_ROOT, '..');
const DIST_USER = path.join(HUB_ROOT, 'dist', 'user');
const DIST_ADMIN = path.join(HUB_ROOT, 'dist', 'admin');

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

const chromePath = process.env.PLAYHUB_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

test('Admin Backups UI renders Data Migration Snapshot panel with skip/overwrite options and works in Chrome CDP', {
  skip: !fs.existsSync(chromePath),
  timeout: 60000
}, async t => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-snap-ui-'));
  const dataDir = path.join(tmpDir, 'data');
  const creds = makeAdminCreds('SnapshotAdmin!2026');

  const adminUiServer = createStaticServer(DIST_ADMIN);
  const uiAddr = await listenServer(adminUiServer, '127.0.0.1', 0);
  const adminUiOrigin = `http://127.0.0.1:${uiAddr.port}`;

  const app = createApp({
    dataDir,
    publicHost: '127.0.0.1',
    adminHost: '127.0.0.1',
    publicPort: 0,
    adminPort: 0,
    userBaseUrl: 'http://127.0.0.1:18130',
    adminBaseUrl: adminUiOrigin,
    userOrigins: ['http://127.0.0.1:18130'],
    adminOrigins: [adminUiOrigin],
    secureCookies: false,
    admin: { username: 'admin', passwordHash: creds.passwordHash, salt: creds.salt, localAutoLogin: true }
  }, {
    rootDir: DIST_USER,
    platformRoot: PLATFORM_ROOT,
    env: { ...process.env, PLAYHUB_CHANNEL: 'dev' }
  });
  const addrs = await app.listen();

  const proxyAdminServer = createStaticServer(DIST_ADMIN, { apiPort: addrs.admin.port });
  // Note: admin UI calls apiPort directly via config.js; test via localAutoLogin URL!
  await new Promise(resolve => { proxyAdminServer.close(resolve); });

  // Serve a temp admin dir whose config.js points to addrs.admin.port
  const tempAdminDir = path.join(tmpDir, 'admin-web');
  fs.cpSync(DIST_ADMIN, tempAdminDir, { recursive: true });
  fs.writeFileSync(path.join(tempAdminDir, 'config.js'), `window.PLAYHUB_ADMIN_CONFIG=${JSON.stringify({ apiPort: addrs.admin.port, apiBaseUrl: '', mode: 'local-iis-poc' })};\n`);
  const servedAdmin = createStaticServer(tempAdminDir);
  const servedAddr = await listenServer(servedAdmin, '127.0.0.1', 0);

  // Re-close first unused server
  await new Promise(resolve => { adminUiServer.close(resolve); });
  // Allow served origin by restarting app with exact adminBaseUrl/adminOrigins
  await app.close();
  const servedOrigin = `http://127.0.0.1:${servedAddr.port}`;
  const app2 = createApp({
    dataDir,
    publicHost: '127.0.0.1',
    adminHost: '127.0.0.1',
    publicPort: 0,
    adminPort: 0,
    userBaseUrl: 'http://127.0.0.1:18130',
    adminBaseUrl: servedOrigin,
    userOrigins: ['http://127.0.0.1:18130'],
    adminOrigins: [servedOrigin],
    secureCookies: false,
    admin: { username: 'admin', passwordHash: creds.passwordHash, salt: creds.salt, localAutoLogin: false }
  }, {
    rootDir: DIST_USER,
    platformRoot: PLATFORM_ROOT,
    env: { ...process.env, PLAYHUB_CHANNEL: 'dev' }
  });
  const addrs2 = await app2.listen();
  fs.writeFileSync(path.join(tempAdminDir, 'config.js'), `window.PLAYHUB_ADMIN_CONFIG=${JSON.stringify({ apiPort: addrs2.admin.port, apiBaseUrl: '', mode: 'local-iis-poc' })};\n`);

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-snap-cdp-'));
  const chrome = spawn(
    chromePath,
    ['--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'],
    { windowsHide: true, stdio: 'ignore' }
  );
  let socket;
  const exceptions = [];

  t.after(async () => {
    socket?.close();
    try { chrome.kill(); } catch {}
    await new Promise(resolve => { servedAdmin.close(resolve); servedAdmin.closeAllConnections(); });
    await app2.close();
    await delay(150);
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  const portFile = path.join(profile, 'DevToolsActivePort');
  let port;
  for (let i = 0; i < 100; i += 1) {
    try {
      const value = Number(fs.readFileSync(portFile, 'utf8').split('\n')[0]);
      if (Number.isInteger(value) && value > 0) { port = value; break; }
    } catch {}
    await delay(100);
  }
  assert.ok(port);

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
    for (let i = 0; i < 120; i += 1) {
      if (await evaluate(expression)) return;
      await delay(50);
    }
    throw new Error(`Condition timed out: ${expression}`);
  };

  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1080, deviceScaleFactor: 1, mobile: false });

  // Open Admin login page, sign in via UI form, then verify ?tab=system&view=backups
  await send('Page.navigate', { url: `${servedOrigin}/?tab=system&view=backups` });
  await until("!document.querySelector('#login-panel')?.hidden && !!document.querySelector('#password')");
  await evaluate(`(() => {
    document.querySelector('#username').value = 'admin';
    document.querySelector('#password').value = 'SnapshotAdmin!2026';
    document.querySelector('#login-form button[type="submit"]').click();
  })()`);
  await until("!document.querySelector('#dashboard')?.hidden && !!document.querySelector('[data-testid=\"snapshot-export-btn\"]') && !!document.querySelector('[data-testid=\"conflict-overwrite\"]')");
  await delay(300);

  const uiState = await evaluate(`({
    exportBtn: !!document.querySelector('[data-testid="snapshot-export-btn"]'),
    fileInput: !!document.querySelector('[data-testid="snapshot-file-input"]'),
    skipChecked: document.querySelector('[data-testid="conflict-skip"]')?.checked,
    overwritePresent: !!document.querySelector('[data-testid="conflict-overwrite"]'),
    dryRunBtn: !!document.querySelector('[data-testid="snapshot-dryrun-btn"]'),
    importBtn: !!document.querySelector('[data-testid="snapshot-import-btn"]'),
    domainCount: document.querySelectorAll('[data-testid^="snapshot-domain-"]').length
  })`);
  assert.equal(uiState.exportBtn, true);
  assert.equal(uiState.fileInput, true);
  assert.equal(uiState.skipChecked, true);
  assert.equal(uiState.overwritePresent, true);
  assert.equal(uiState.dryRunBtn, true);
  assert.equal(uiState.importBtn, true);
  assert.equal(uiState.domainCount, 7);

  if (process.env.PLAYHUB_SNAPSHOT_UI_SHOT) {
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(process.env.PLAYHUB_SNAPSHOT_UI_SHOT, Buffer.from(shot.data, 'base64'));
  }

  assert.deepEqual(exceptions, []);
});
