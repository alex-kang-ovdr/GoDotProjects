import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { randomBytes, scryptSync } from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server/app.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const chromePath = process.env.PLAYHUB_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

function makeCreds(password) {
  const salt = randomBytes(16).toString('hex');
  return { salt, passwordHash: scryptSync(password, salt, 64).toString('hex') };
}

test('admin Store 6th tab (?tab=store) renders summary, review queue, kill-switch, audit trail, and fits mobile', { skip: !fs.existsSync(chromePath), timeout: 60000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-store-browser-'));
  const dataDir = path.join(dir, 'data');
  const creds = makeCreds('AdminPassphrase!2026');
  const exceptions = [];

  let adminApiPort = 0;
  const staticServer = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/config.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      res.end(`window.PLAYHUB_ADMIN_CONFIG={apiBaseUrl:'http://127.0.0.1:${adminApiPort}',mode:'local-iis-poc'};\n`);
      return;
    }
    const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const filename = path.resolve(root, 'web/admin', rel);
    if (!filename.startsWith(path.resolve(root, 'web/admin') + path.sep) || !fs.existsSync(filename)) {
      res.writeHead(404); res.end(); return;
    }
    const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' }[path.extname(filename)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(fs.readFileSync(filename));
  });
  await new Promise(resolve => staticServer.listen(0, '127.0.0.1', resolve));
  const adminSiteOrigin = `http://127.0.0.1:${staticServer.address().port}`;

  const app = createApp({
    dataDir,
    publicPort: 0,
    adminPort: 0,
    publicHost: '127.0.0.1',
    adminHost: '127.0.0.1',
    userBaseUrl: 'http://localhost:8080',
    adminBaseUrl: adminSiteOrigin,
    userOrigins: ['http://localhost:8080'],
    adminOrigins: [adminSiteOrigin],
    admin: { username: 'admin', passwordHash: creds.passwordHash, salt: creds.salt, localAutoLogin: false }
  });
  const listened = await app.listen();
  adminApiPort = listened.admin.port;

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-store-chrome-'));
  const chrome = spawn(chromePath, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let socket;
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    let port;
    for (let i = 0; i < 100; i++) {
      try {
        const value = Number(fs.readFileSync(portFile, 'utf8').split('\n')[0]);
        if (Number.isInteger(value) && value > 0 && value <= 65535) { port = value; break; }
      } catch (error) {
        if (!['ENOENT', 'EBUSY', 'EACCES'].includes(error.code)) throw error;
      }
      await delay(100);
    }
    assert.ok(port, 'Chrome DevTools port was not ready');
    const page = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    let serial = 0;
    const pending = new Map();
    socket.addEventListener('message', event => {
      const m = JSON.parse(event.data);
      if (m.method === 'Runtime.exceptionThrown') exceptions.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
      if (pending.has(m.id)) { const [resolve, reject] = pending.get(m.id); pending.delete(m.id); m.error ? reject(new Error(m.error.message)) : resolve(m.result); }
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++serial; pending.set(id, [resolve, reject]); socket.send(JSON.stringify({ id, method, params })); });
    const evaluate = async expression => {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const until = async expression => {
      for (let i = 0; i < 120; i++) {
        if (await evaluate(expression)) return;
        await delay(50);
      }
      throw new Error('Browser condition timed out: ' + expression);
    };

    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1080, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: adminSiteOrigin + '/?tab=store' });
    await until("document.readyState==='complete' && !document.querySelector('#login-panel').hidden");

    // Sign in directly onto ?tab=store
    await evaluate("document.querySelector('#username').value='admin'; document.querySelector('#password').value='AdminPassphrase!2026'; document.querySelector('#login-form').requestSubmit();");
    await until(`
      !document.querySelector('#dashboard').hidden &&
      document.querySelector('#store-overview-panel')?.hidden === false &&
      document.querySelector('[data-testid="admin-tab-store"]')?.classList.contains('active') &&
      document.querySelectorAll('[data-testid="store-summary-metrics"] .metric').length === 4 &&
      document.querySelectorAll('[data-testid="store-submission-btn"]').length >= 3 &&
      document.querySelectorAll('[data-testid="store-pkg-row"]').length === 5
    `);

    // Capture full-height ?tab=store screenshot before mutations (shows summary + review queue + kill-switch table)
    const fullHeight = await evaluate('Math.min(Math.max(1080, document.documentElement.scrollHeight), 2400)');
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: fullHeight, deviceScaleFactor: 1, mobile: false });
    await delay(100);
    const shotTarget = process.env.PLAYHUB_STORE_SCREENSHOT || path.join(root, 'reports', 'store-browser', 'wave2-admin-store-tab.png');
    fs.mkdirSync(path.dirname(shotTarget), { recursive: true });
    fs.writeFileSync(shotTarget, Buffer.from((await send('Page.captureScreenshot')).data, 'base64'));
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1080, deviceScaleFactor: 1, mobile: false });

    // 1. Editorial submission review (verify no artifact fields, then approve)
    await evaluate("document.querySelector('[data-submission-id=\"sub-store-checklist-100\"]').click()");
    await until("document.querySelector('[data-testid=\"store-submission-detail\"]').textContent.includes('release_kind = editorial')");
    await evaluate("document.querySelector('[data-testid=\"store-review-note\"]').value='에디토리얼 가이드 검수 완료'; document.querySelector('[data-testid=\"store-decision-approve\"]').click()");
    await until("document.querySelector('#notice').textContent.includes('승인') && document.querySelectorAll('[data-testid=\"store-pkg-row\"]').length === 6");

    // 2. Package submission review (request_changes / hold)
    await evaluate("document.querySelector('[data-submission-id=\"sub-fortress-130\"]').click()");
    await until("document.querySelector('[data-testid=\"store-submission-detail\"]').textContent.includes('Lowpoly Fortress Siege Kit v1.3.0')");
    await evaluate("document.querySelector('[data-testid=\"store-review-note\"]').value='콜라이더 경계 확인 요청'; document.querySelector('[data-testid=\"store-decision-request-changes\"]').click()");
    await until("document.querySelector('#notice').textContent.includes('보류')");

    // 3. Package submission reject
    await evaluate("document.querySelector('[data-submission-id=\"sub-navmesh-grid-110\"]').click()");
    await until("document.querySelector('[data-testid=\"store-submission-detail\"]').textContent.includes('NavMesh Tactical Grid Addon')");
    await evaluate("document.querySelector('[data-testid=\"store-review-note\"]').value='테스트 거절 사유'; document.querySelector('[data-testid=\"store-decision-reject\"]').click()");
    await until("document.querySelector('#notice').textContent.includes('거절')");

    // 4. Kill-switch (Yank) toggle on published package
    await evaluate("document.querySelector('[data-package-slug=\"lowpoly-fortress-pack\"] [data-testid=\"store-pkg-killswitch\"]').click()");
    await until("document.querySelector('[data-package-slug=\"lowpoly-fortress-pack\"]').textContent.includes('yanked')");

    // 5. Sub-views navigation (submissions & packages)
    await evaluate("document.querySelector('[data-testid=\"subnav-store-submissions\"]').click()");
    await until("document.querySelector('#store-submissions-panel')?.hidden === false");
    await evaluate("document.querySelector('[data-testid=\"subnav-store-packages\"]').click()");
    await until("document.querySelector('#store-packages-panel')?.hidden === false && document.querySelector('#store-packages-panel').textContent.includes('store_package_yanked')");

    // 6. Audit tab with domain=store filter
    await evaluate("document.querySelector('[data-testid=\"admin-tab-system\"]').click()");
    await until("!document.querySelector('#system-overview-panel').hidden");
    await evaluate("document.querySelector('[data-testid=\"subnav-system-audit\"]').click()");
    await until("!document.querySelector('#audit').hidden");
    await evaluate("document.querySelector('#audit-domain').value='store'; document.querySelector('#audit-filters').requestSubmit();");
    await until("document.querySelector('#audit-list').textContent.includes('store_package_yanked')");

    // 7. Mobile 390px layout overflow check on ?tab=store
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await evaluate("document.querySelector('[data-testid=\"admin-tab-store\"]').click()");
    await until("document.querySelector('#store-overview-panel')?.hidden === false");
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'Store admin mobile view must fit 390px viewport');

    assert.deepEqual(exceptions, []);
  } finally {
    socket?.close();
    staticServer.closeAllConnections();
    await new Promise(resolve => staticServer.close(resolve));
    await app.close();
    await new Promise(resolve => { chrome.once('exit', resolve); if (chrome.exitCode !== null || !chrome.kill()) resolve(); });
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
  }
});
