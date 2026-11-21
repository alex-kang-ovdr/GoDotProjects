import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import vm from 'node:vm';
import { randomBytes, scryptSync } from 'node:crypto';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { createApp } from '../server/app.mjs';
import { DEVOPS_PREVIEW_START_TIMEOUT_MS, DEVOPS_PREVIEW_STOP_TIMEOUT_MS } from '../server/admin-console.mjs';

function makeAdminCreds(password) {
  const salt = randomBytes(16).toString('hex');
  return { salt, passwordHash: scryptSync(password, salt, 64).toString('hex') };
}

const adminContractsCtx = vm.createContext({ module: { exports: {} } });
vm.runInContext(fs.readFileSync(new URL('../web/admin/contracts.js', import.meta.url), 'utf8'), adminContractsCtx);
const Contracts = adminContractsCtx.module.exports;

async function callHandler(handler, route, { method = 'GET', origin = 'http://127.0.0.1:8081', cookie = '', csrf = '', body } = {}) {
  const req = new PassThrough();
  req.method = method;
  req.url = route;
  req.socket = { remoteAddress: '127.0.0.1' };
  req.headers = {
    host: '127.0.0.1:8091',
    ...(origin ? { origin } : {}),
    ...(cookie ? { cookie } : {}),
    ...(csrf ? { 'x-csrf-token': csrf } : {}),
    ...(body !== undefined ? { 'content-type': 'application/json' } : {})
  };
  const headers = {};
  let rawBody = '';
  const res = {
    statusCode: 200,
    headersSent: false,
    setHeader(name, value) { headers[name.toLowerCase()] = value; },
    getHeader(name) { return headers[name.toLowerCase()]; },
    removeHeader(name) { delete headers[name.toLowerCase()]; },
    writeHead(code, map = {}) {
      this.statusCode = code;
      for (const [k, v] of Object.entries(map)) headers[k.toLowerCase()] = v;
      this.headersSent = true;
    },
    end(chunk) {
      if (chunk) rawBody += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
      this.headersSent = true;
    }
  };
  const done = handler(req, res);
  if (body !== undefined) req.end(JSON.stringify(body));
  else req.end();
  await done;
  const setCookies = headers['set-cookie'] ? (Array.isArray(headers['set-cookie']) ? headers['set-cookie'] : [headers['set-cookie']]) : [];
  const nextCookie = setCookies.map(c => c.split(';')[0]).join('; ');
  return { status: res.statusCode, headers, cookie: nextCookie || cookie, data: rawBody ? JSON.parse(rawBody) : null };
}

test('admin routing resolves ?tab=system&view=devops without altering primary 6 tabs', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(Contracts.ADMIN_TABS.map(t => t.id))), ['system', 'hub', 'forge', 'qa', 'l10n', 'store']);
  assert.deepEqual(JSON.parse(JSON.stringify(Contracts.resolveAdminRoute('?tab=system&view=devops', ''))), {
    tab: 'system',
    view: 'devops',
    fromLegacyHash: false
  });
});

test('admin devops endpoints serve overview, enforce ref/port/CSRF security, and log audit events', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-admin-devops-'));
  const dataDir = path.join(dir, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const password = 'DevOps-Admin-Pass-2026!';
  const creds = makeAdminCreds(password);
  const platformRoot = path.resolve(new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
  const app = createApp(
    {
      publicPort: 18990,
      adminPort: 18991,
      publicHost: '127.0.0.1',
      adminHost: '127.0.0.1',
      userOrigins: ['http://127.0.0.1:18980'],
      adminOrigins: ['http://127.0.0.1:8081'],
      userBaseUrl: 'http://127.0.0.1:18980',
      adminBaseUrl: 'http://127.0.0.1:8081',
      publicBaseUrl: 'http://127.0.0.1:18990',
      dataDir,
      secureCookies: false,
      admin: { username: 'admin', ...creds, localAutoLogin: false }
    },
    { rootDir: path.join(platformRoot, 'hub'), platformRoot }
  );
  t.after(async () => {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  // Unauthenticated access must be blocked
  assert.equal((await callHandler(app.adminHandler, '/api/admin/devops/overview')).status, 401);
  assert.equal((await callHandler(app.publicHandler, '/api/admin/devops/overview', { origin: 'http://127.0.0.1:18980' })).status, 404);

  // Admin login (fetch initial session/CSRF first)
  const init = await callHandler(app.adminHandler, '/api/admin/session');
  const login = await callHandler(app.adminHandler, '/api/admin/login', {
    method: 'POST',
    cookie: init.cookie,
    csrf: init.data.csrfToken,
    body: { username: 'admin', password }
  });
  assert.equal(login.status, 200);
  const auth = { cookie: login.cookie, csrf: login.data.csrfToken };

  // 1. Overview returns git refs, briefing, builds, previews
  const ov = await callHandler(app.adminHandler, '/api/admin/devops/overview', auth);
  assert.equal(ov.status, 200);
  assert.ok(Array.isArray(ov.data.refs.branches) && ov.data.refs.branches.length > 0);
  assert.ok(Array.isArray(ov.data.refs.commits) && ov.data.refs.commits.length > 0);
  assert.ok(typeof ov.data.briefing.verdict === 'string');

  // 2. Manual plan rejects unsafe refs & reserved default ports & missing CSRF
  const noCsrf = await callHandler(app.adminHandler, '/api/admin/devops/manual-plan', {
    method: 'POST',
    cookie: auth.cookie,
    body: { ref: 'HEAD', buildTarget: 'local', testTarget: 'local-preview' }
  });
  assert.equal(noCsrf.status, 403);

  const badRef = await callHandler(app.adminHandler, '/api/admin/devops/manual-plan', {
    method: 'POST',
    ...auth,
    body: { ref: '--evil;whoami', buildTarget: 'local', testTarget: 'local-preview' }
  });
  assert.equal(badRef.status, 400);

  const badPort = await callHandler(app.adminHandler, '/api/admin/devops/manual-plan', {
    method: 'POST',
    ...auth,
    body: { ref: 'HEAD', buildTarget: 'local', testTarget: 'local-preview', localBasePort: 8080 }
  });
  assert.equal(badPort.status, 400);

  // 3. Valid manual plan for Dev server tag preview (rev-<sha>, 0% traffic)
  const devTag = await callHandler(app.adminHandler, '/api/admin/devops/manual-plan', {
    method: 'POST',
    ...auth,
    body: { ref: 'HEAD', buildTarget: 'cloudbuild', testTarget: 'dev-tag', localBasePort: 18280 }
  });
  assert.equal(devTag.status, 200);
  assert.equal(devTag.data.plan.devDeployment.trafficPercent, 0);
  assert.match(devTag.data.plan.previewUrl, /^https:\/\/rev-[a-f0-9]{7}---playhub-hub-/);

  // 4. Audit trail recorded the manual trigger under system domain
  const auditRes = await callHandler(app.adminHandler, '/api/admin/audit?domain=system', auth);
  assert.equal(auditRes.status, 200);
  assert.ok(auditRes.data.audit.some(a => a.action === 'system_devops_manual_plan'));

  // 5. noWorktree option must be rejected by the admin preview API
  const rejectNoWorktreeTrue = await callHandler(app.adminHandler, '/api/admin/devops/preview/start', {
    method: 'POST',
    ...auth,
    body: { ref: 'HEAD', basePort: 18380, noWorktree: true }
  });
  assert.equal(rejectNoWorktreeTrue.status, 400);
  assert.equal(rejectNoWorktreeTrue.data.error.code, 'NO_WORKTREE_NOT_ALLOWED');

  const rejectNoWorktreeFalse = await callHandler(app.adminHandler, '/api/admin/devops/preview/start', {
    method: 'POST',
    ...auth,
    body: { ref: 'HEAD', basePort: 18380, noWorktree: false }
  });
  assert.equal(rejectNoWorktreeFalse.status, 400);
  assert.equal(rejectNoWorktreeFalse.data.error.code, 'NO_WORKTREE_NOT_ALLOWED');
});

test('admin devops preview start runs asynchronously via spawn with jobId/status polling, headroom timeout, and non-blocking stop', async t => {
  assert.ok(DEVOPS_PREVIEW_START_TIMEOUT_MS >= 240000, 'outer preview start timeout must exceed local-preview 180s build timeout');
  assert.ok(DEVOPS_PREVIEW_STOP_TIMEOUT_MS >= 60000, 'outer preview stop timeout must have sufficient headroom');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-admin-devops-async-'));
  const dataDir = path.join(dir, 'data');
  const fakeRepo = path.join(dir, 'fake-repo');
  const devopsDir = path.join(fakeRepo, 'tools', 'devops');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(devopsDir, { recursive: true });

  // Initialize a minimal git repository with one commit for ref resolution
  execFileSync('git', ['init', fakeRepo], { stdio: 'ignore', windowsHide: true });
  execFileSync('git', ['-C', fakeRepo, 'config', 'user.email', 'test@playhub.local'], { stdio: 'ignore', windowsHide: true });
  execFileSync('git', ['-C', fakeRepo, 'config', 'user.name', 'PlayHub Test'], { stdio: 'ignore', windowsHide: true });
  fs.writeFileSync(path.join(fakeRepo, 'README.md'), 'fake devops repo\n', 'utf8');
  execFileSync('git', ['-C', fakeRepo, 'add', 'README.md'], { stdio: 'ignore', windowsHide: true });
  execFileSync('git', ['-C', fakeRepo, 'commit', '-m', 'init'], { stdio: 'ignore', windowsHide: true });

  // Mock tools/devops/local-preview.mjs supporting slow start, timeout trigger, and stop/cleanup
  const mockPreviewScript = `
import { setTimeout as delay } from 'node:timers/promises';
const args = process.argv.slice(2);
const subcmd = args[0];
const getArg = name => {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : null;
};
if (args.includes('--no-worktree')) {
  process.stderr.write('unexpected --no-worktree flag');
  process.exit(2);
}
if (subcmd === 'start') {
  const port = Number(getArg('--port') || 18280);
  const ref = getArg('--ref') || 'HEAD';
  if (port === 18600) {
    await delay(5000);
    process.exit(0);
  }
  await delay(300);
  process.stdout.write(JSON.stringify({
    runId: 'preview-mock-' + ref.slice(0, 7),
    ref,
    shortCommit: ref.slice(0, 7),
    urls: { user: 'http://127.0.0.1:' + port + '/' },
    argsSeen: args
  }));
  process.exit(0);
}
if (subcmd === 'cleanup' || subcmd === 'stop') {
  const runId = getArg('--run-id');
  await delay(60);
  process.stdout.write(JSON.stringify({ runId, stopped: true, cleaned: subcmd === 'cleanup' }));
  process.exit(0);
}
process.exit(1);
`;
  fs.writeFileSync(path.join(devopsDir, 'local-preview.mjs'), mockPreviewScript, 'utf8');

  const password = 'DevOps-Async-Pass-2026!';
  const creds = makeAdminCreds(password);
  const platformRootReal = path.resolve(new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
  const app = createApp(
    {
      publicPort: 18992,
      adminPort: 18993,
      publicHost: '127.0.0.1',
      adminHost: '127.0.0.1',
      userOrigins: ['http://127.0.0.1:18982'],
      adminOrigins: ['http://127.0.0.1:8081'],
      userBaseUrl: 'http://127.0.0.1:18982',
      adminBaseUrl: 'http://127.0.0.1:8081',
      publicBaseUrl: 'http://127.0.0.1:18992',
      dataDir,
      secureCookies: false,
      devopsPreviewStartTimeoutMs: 700,
      admin: { username: 'admin', ...creds, localAutoLogin: false }
    },
    { rootDir: path.join(platformRootReal, 'hub'), platformRoot: fakeRepo }
  );
  t.after(async () => {
    await app.close();
    await delay(100);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const init = await callHandler(app.adminHandler, '/api/admin/session');
  const login = await callHandler(app.adminHandler, '/api/admin/login', {
    method: 'POST',
    cookie: init.cookie,
    csrf: init.data.csrfToken,
    body: { username: 'admin', password }
  });
  assert.equal(login.status, 200);
  const auth = { cookie: login.cookie, csrf: login.data.csrfToken };

  // Start preview returns 202 immediately with jobId before 300ms child finishes
  const t0 = Date.now();
  const started = await callHandler(app.adminHandler, '/api/admin/devops/preview/start', {
    method: 'POST',
    ...auth,
    body: { ref: 'HEAD', basePort: 18420 }
  });
  const elapsedMs = Date.now() - t0;
  assert.equal(started.status, 202);
  assert.ok(started.data.jobId && started.data.jobId.startsWith('pvjob-'));
  assert.equal(started.data.status, 'running');
  assert.equal(started.data.statusUrl, `/api/admin/devops/preview/jobs/${started.data.jobId}`);
  assert.ok(elapsedMs < 250, `start endpoint must return immediately without blocking event loop (took ${elapsedMs}ms)`);

  // Event loop stays responsive while preview job is running
  const healthDuringJob = await callHandler(app.publicHandler, '/api/health', { origin: 'http://127.0.0.1:18982' });
  assert.equal(healthDuringJob.status, 200);

  // Overlapping port start while running must return 409
  const busyPort = await callHandler(app.adminHandler, '/api/admin/devops/preview/start', {
    method: 'POST',
    ...auth,
    body: { ref: 'HEAD', basePort: 18420 }
  });
  assert.equal(busyPort.status, 409);
  assert.equal(busyPort.data.error.code, 'PREVIEW_JOB_PORT_BUSY');

  // Poll job status until completion
  let finalJob = null;
  for (let i = 0; i < 30; i++) {
    const polled = await callHandler(app.adminHandler, started.data.statusUrl, auth);
    assert.equal(polled.status, 200);
    if (polled.data.job.status !== 'running') {
      finalJob = polled.data.job;
      break;
    }
    await delay(50);
  }
  assert.ok(finalJob, 'preview start job should complete');
  assert.equal(finalJob.status, 'succeeded');
  assert.equal(finalJob.preview.urls.user, 'http://127.0.0.1:18420/');
  assert.equal(finalJob.preview.argsSeen.includes('--no-worktree'), false);

  // Unknown jobId returns 404
  const missingJob = await callHandler(app.adminHandler, '/api/admin/devops/preview/jobs/pvjob-missing', auth);
  assert.equal(missingJob.status, 404);

  // Jobs list and overview include the completed job
  const jobsList = await callHandler(app.adminHandler, '/api/admin/devops/preview/jobs', auth);
  assert.equal(jobsList.status, 200);
  assert.ok(jobsList.data.jobs.some(j => j.jobId === started.data.jobId && j.status === 'succeeded'));

  // Async stop works without blocking
  const stopped = await callHandler(app.adminHandler, '/api/admin/devops/preview/stop', {
    method: 'POST',
    ...auth,
    body: { runId: finalJob.preview.runId, cleanup: true }
  });
  assert.equal(stopped.status, 200);
  assert.equal(stopped.data.result.stopped, true);
  assert.equal(stopped.data.result.cleaned, true);

  // Outer timeout enforces timed_out state on hung child process
  const slowStart = await callHandler(app.adminHandler, '/api/admin/devops/preview/start', {
    method: 'POST',
    ...auth,
    body: { ref: 'HEAD', basePort: 18600 }
  });
  assert.equal(slowStart.status, 202);
  let timedOutJob = null;
  for (let i = 0; i < 30; i++) {
    const polled = await callHandler(app.adminHandler, slowStart.data.statusUrl, auth);
    if (polled.data.job.status !== 'running') {
      timedOutJob = polled.data.job;
      break;
    }
    await delay(80);
  }
  assert.ok(timedOutJob, 'slow preview job should time out');
  assert.equal(timedOutJob.status, 'timed_out');
  assert.equal(timedOutJob.error.code, 'PREVIEW_START_TIMEOUT');
});
