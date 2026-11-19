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

test('admin L10N tab renders all 7 sub-views, edits keys, runs gather & AI mock, publishes release, and fits mobile', { skip: !fs.existsSync(chromePath), timeout: 60000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-l10n-browser-'));
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
    dataDir, publicPort: 0, adminPort: 0, publicHost: '127.0.0.1', adminHost: '127.0.0.1',
    userBaseUrl: 'http://localhost:8080',
    adminBaseUrl: adminSiteOrigin,
    userOrigins: ['http://localhost:8080'],
    adminOrigins: [adminSiteOrigin],
    admin: { username: 'admin', passwordHash: creds.passwordHash, salt: creds.salt, localAutoLogin: false }
  });
  const listened = await app.listen();
  adminApiPort = listened.admin.port;

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-l10n-chrome-'));
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
    const snap = async name => {
      const outDir = path.join(root, 'reports', 'l10n-browser');
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, name), Buffer.from((await send('Page.captureScreenshot')).data, 'base64'));
    };

    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1380, height: 900, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: adminSiteOrigin + '/' });
    await until("document.readyState==='complete' && !document.querySelector('#login-panel').hidden");
    await evaluate("document.querySelector('#username').value='admin'; document.querySelector('#password').value='AdminPassphrase!2026'; document.querySelector('#login-form').requestSubmit();");
    await until("!document.querySelector('#dashboard').hidden");

    // 1. Open L10N tab -> Overview
    await evaluate("document.querySelector('[data-testid=\"admin-tab-l10n\"]').click()");
    await until("document.querySelector('#l10n-overview-panel')?.hidden === false && document.querySelectorAll('#l10n-overview-panel .l10n-coverage-grid .funnel-item').length === 7");
    await snap('l10n-overview.png');

    // 2. Strings table
    await evaluate("document.querySelector('[data-testid=\"subnav-l10n-strings\"]').click()");
    await until("document.querySelector('#l10n-strings-panel')?.hidden === false && document.querySelectorAll('#l10n-strings-panel .l10n-key-btn').length > 0");
    await snap('l10n-strings.png');

    // 3. Gather dry-run
    await evaluate("document.querySelector('[data-testid=\"subnav-l10n-gather\"]').click()");
    await until("!!document.querySelector('[data-testid=\"l10n-gather-dry\"]')");
    await evaluate("document.querySelector('[data-testid=\"l10n-gather-dry\"]').click()");
    await until("document.querySelector('#l10n-gather-panel').textContent.includes('미리보기')");

    // 4. AI Translation & Context Prompts
    await evaluate("document.querySelector('[data-testid=\"subnav-l10n-ai\"]').click()");
    await until("!!document.querySelector('[data-testid=\"l10n-ai-run\"]')");
    await evaluate("document.querySelector('[data-testid=\"l10n-ai-run\"]').click()");
    await until("document.querySelector('#l10n-ai-panel').textContent.includes('mock-context-v1')");
    await snap('l10n-ai.png');

    // 5. Glossary
    await evaluate("document.querySelector('[data-testid=\"subnav-l10n-glossary\"]').click()");
    await until("document.querySelector('#l10n-glossary-panel').textContent.includes('PlayHub')");

    // 6. Media Matrix
    await evaluate("document.querySelector('[data-testid=\"subnav-l10n-media\"]').click()");
    await until("document.querySelector('#l10n-media-panel').textContent.includes('img.portal.hero_banner')");
    await snap('l10n-media.png');

    // 7. Releases -> Publish l10n-v1
    await evaluate("document.querySelector('[data-testid=\"subnav-l10n-releases\"]').click()");
    await until("!!document.querySelector('[data-testid=\"l10n-publish-release\"]')");
    await evaluate("document.querySelector('[data-testid=\"l10n-publish-release\"]').click()");
    await until("document.querySelector('#l10n-releases-panel').textContent.includes('l10n-v1')");

    // Mobile 390px overflow check
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await evaluate("document.querySelector('[data-testid=\"subnav-l10n-overview\"]').click()");
    await until("document.querySelector('#l10n-overview-panel')?.hidden === false");
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'L10N mobile view must fit 390px viewport');

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
