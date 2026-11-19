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
import { uid } from '../server/security.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const chromePath = process.env.PLAYHUB_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

function makeCreds(password) {
  const salt = randomBytes(16).toString('hex');
  return { salt, passwordHash: scryptSync(password, salt, 64).toString('hex') };
}

test('admin 4-tab console UI renders System, Hub, Forge, QA views, checklist, backup, and mobile cleanly', { skip: !fs.existsSync(chromePath), timeout: 60000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-admin-browser-'));
  const dataDir = path.join(dir, 'data');
  const creds = makeCreds('AdminPassphrase!2026');
  const exceptions = [];

  // Static admin site server
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

  // Seed one pending submission and one QA run for rich visual & functional testing
  const ownerId = uid();
  const submissionId = '22222222-3333-4444-8555-666666666666';
  const now = Date.now();
  app.db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(ownerId, 'registered', 'Demo Creator', now);
  app.db.prepare(`INSERT INTO creator_submissions
    (id,owner_key,owner_id,project_id,release_id,release_revision,release_label,title,description,status,revision,created_at,updated_at,submitted_at)
    VALUES(?,?,?,?,?,?,?,?,?,'in_review',1,?,?,?)`)
    .run(submissionId, 'owner-key', ownerId, 'a'.repeat(24), 'b'.repeat(24), 3, 'v1.0-rc1', 'Fortress Arena Demo', 'Godot 기반 멀티플레이 테스트 제출본입니다.', now, now, now);
  app.db.prepare(`INSERT INTO qa_runs(id,submission_id,target_type,target_id,release_revision,policy_version,qa_status,score,report_path,summary_json,started_at,finished_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(uid(), submissionId, 'submission', 'fortress-arena-demo', 3, 'v1', 'warned', 91, 'artifacts/gamerqa/demo/report.json', '{}', now, now);

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-admin-chrome-'));
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
      if (m.method === 'Runtime.exceptionThrown') exceptions.push(m.params.exceptionDetails.text);
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
      const outDir = path.join(root, 'reports', 'admin-browser');
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, name), Buffer.from((await send('Page.captureScreenshot')).data, 'base64'));
    };

    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1380, height: 900, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: adminSiteOrigin + '/' });
    await until("document.readyState==='complete' && !document.querySelector('#login-panel').hidden");

    // Sign in
    await evaluate("document.querySelector('#username').value='admin'; document.querySelector('#password').value='AdminPassphrase!2026'; document.querySelector('#login-form').requestSubmit();");
    await until("!document.querySelector('#dashboard').hidden && document.querySelectorAll('#overview .metric').length === 6 && document.querySelectorAll('#hub-action-queue .action-card').length === 4");
    await snap('admin-hub-dashboard.png');

    // Hub > Submissions (split-pane + checklist save)
    await evaluate("document.querySelector('[data-testid=\"subnav-hub-submissions\"]').click()");
    await until("document.querySelector('#review-detail-pane').textContent.includes('Fortress Arena Demo') && document.querySelectorAll('#review-detail-pane input[type=checkbox]').length === 5");
    await evaluate("document.querySelectorAll('#review-detail-pane input[type=checkbox]')[0].checked = true; document.querySelector('#review-detail-pane .checklist-box form').requestSubmit();");
    await until("document.querySelector('#review-detail-pane').textContent.includes('저장 완료')");
    await snap('admin-hub-submissions.png');

    // System > Overview & Backups (trigger online backup)
    await evaluate("document.querySelector('[data-testid=\"admin-tab-system\"]').click()");
    await until("!document.querySelector('#system-overview-panel').hidden && document.querySelector('#system-overview-panel').textContent.includes('ONLINE')");
    await snap('admin-system-overview.png');

    await evaluate("document.querySelector('[data-testid=\"subnav-system-backups\"]').click()");
    await until("!!document.querySelector('[data-testid=\"create-backup-btn\"]')");
    await evaluate("document.querySelector('[data-testid=\"create-backup-btn\"]').click()");
    await until("document.querySelector('#system-backups-panel').textContent.includes('무결성 OK')");

    // Forge > Overview & Projects
    await evaluate("document.querySelector('[data-testid=\"admin-tab-forge\"]').click()");
    await until("!document.querySelector('#forge-overview-panel').hidden && document.querySelector('#forge-overview-panel').textContent.includes('PlayForge')");
    await snap('admin-forge-overview.png');

    await evaluate("document.querySelector('[data-testid=\"subnav-forge-projects\"]').click()");
    await until("document.querySelector('#forge-projects-panel').textContent.includes('Tappy Chicken')");

    // QA > Overview & QA Metrics Sandbox (Demo disables game toggle)
    await evaluate("document.querySelector('[data-testid=\"admin-tab-qa\"]').click()");
    await until("!document.querySelector('#qa-overview-panel').hidden && document.querySelector('#qa-overview-panel').textContent.includes('품질 자동화')");
    await snap('admin-qa-overview.png');

    await evaluate("document.querySelector('[data-testid=\"subnav-qa-metrics\"]').click()");
    await until("!document.querySelector('#qa-dataset-bar').hidden");
    await evaluate("document.querySelector('#demo').click()");
    await until("!document.querySelector('#demo-banner').hidden && document.querySelectorAll('#games-body button[data-testid=\"game-visibility-toggle\"]:disabled').length >= 8");

    // Legacy hash redirect (#audit -> ?tab=system&view=audit)
    await send('Page.navigate', { url: adminSiteOrigin + '/#audit' });
    await until("document.readyState==='complete' && document.querySelector('#audit')?.hidden === false && location.search.includes('tab=system') && location.search.includes('view=audit') && document.querySelector('#audit-list')?.textContent.includes('system_backup_created')");

    // Mobile layout overflow check (390x844)
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await evaluate("document.querySelector('[data-testid=\"admin-tab-hub\"]').click()");
    await until("!document.querySelector('#overview').hidden");
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'admin mobile view must fit 390px viewport');
    await snap('admin-mobile.png');

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
