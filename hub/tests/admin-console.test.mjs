import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { randomBytes, scryptSync } from 'node:crypto';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { createApp } from '../server/app.mjs';
import { uid } from '../server/security.mjs';
import { inspectDatabase } from '../tools/restore-data.mjs';

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

const plain = value => JSON.parse(JSON.stringify(value));

test('admin 4-tab routing contracts resolve tabs, views, legacy hashes, and qaRunId filters', () => {
  assert.deepEqual(plain(Contracts.ADMIN_TABS.map(t => t.id)), ['system', 'hub', 'forge', 'qa', 'l10n']);
  assert.deepEqual(plain(Contracts.resolveAdminRoute('', '')), { tab: 'hub', view: 'dashboard', fromLegacyHash: false });
  assert.deepEqual(plain(Contracts.resolveAdminRoute('?tab=forge&view=builds', '')), { tab: 'forge', view: 'builds', fromLegacyHash: false });
  assert.deepEqual(plain(Contracts.resolveAdminRoute('?tab=unknown&view=nope', '')), { tab: 'hub', view: 'dashboard', fromLegacyHash: false });
  assert.deepEqual(plain(Contracts.resolveAdminRoute('?tab=qa&view=invalid', '')), { tab: 'qa', view: 'overview', fromLegacyHash: false });
  assert.deepEqual(plain(Contracts.resolveAdminRoute('', '#submissions')), { tab: 'hub', view: 'submissions', fromLegacyHash: true });
  assert.deepEqual(plain(Contracts.resolveAdminRoute('', '#errors')), { tab: 'system', view: 'errors', fromLegacyHash: true });
  assert.deepEqual(plain(Contracts.resolveAdminRoute('', '#audit')), { tab: 'system', view: 'audit', fromLegacyHash: true });
  assert.deepEqual(plain(Contracts.resolveAdminRoute('', '#retention')), { tab: 'hub', view: 'analytics', fromLegacyHash: true });

  assert.equal(Contracts.metricsQuery('qa', { qaRunId: 'run-2026-11-19_01' }), 'dataset=qa&qaRunId=run-2026-11-19_01');
  assert.equal(Contracts.metricsQuery('live', { qaRunId: 'run-2026-11-19_01' }), 'dataset=live');
  assert.throws(() => Contracts.metricsQuery('qa', { qaRunId: '../bad/run' }));
});

test('admin console endpoints cover system, hub, forge, qa, checklist, backup, audit filtering, and never leak secrets', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-admin-console-'));
  const dataDir = path.join(dir, 'data');
  const creds = makeAdminCreds('AdminPassphrase!2026');
  const secretClient = 'SUPER_SECRET_GOOGLE_CLIENT_SECRET_VALUE';
  const secretDrive = 'SUPER_SECRET_DRIVE_REFRESH_TOKEN_VALUE';

  const app = createApp({
    dataDir,
    publicPort: 0,
    adminPort: 0,
    userBaseUrl: 'http://localhost:8080',
    adminBaseUrl: 'http://127.0.0.1:8081',
    userOrigins: ['http://localhost:8080'],
    adminOrigins: ['http://127.0.0.1:8081'],
    google: { clientId: 'test-client-id', clientSecret: secretClient, redirectUri: 'http://localhost:8090/api/auth/google/callback' },
    admin: { username: 'admin', passwordHash: creds.passwordHash, salt: creds.salt, localAutoLogin: false }
  }, {
    env: { ...process.env, PLAYHUB_DRIVE_CLIENT_ID: 'drv-id', PLAYHUB_DRIVE_CLIENT_SECRET: 'drv-sec', PLAYHUB_DRIVE_REFRESH_TOKEN: secretDrive }
  });
  t.after(async () => {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  // Unauthenticated access must be blocked (401) on admin listener and 404 on public listener.
  assert.equal((await callHandler(app.publicHandler, '/api/admin/system/overview', { origin: 'http://localhost:8080' })).status, 404);
  assert.equal((await callHandler(app.adminHandler, '/api/admin/system/overview')).status, 401);

  // Authenticate as admin.
  const init = await callHandler(app.adminHandler, '/api/admin/session');
  const login = await callHandler(app.adminHandler, '/api/admin/login', {
    method: 'POST', cookie: init.cookie, csrf: init.data.csrfToken,
    body: { username: 'admin', password: 'AdminPassphrase!2026' }
  });
  assert.equal(login.status, 200);
  const auth = { cookie: login.cookie, csrf: login.data.csrfToken };

  // 1. System overview & zero secret leakage.
  const sys = await callHandler(app.adminHandler, '/api/admin/system/overview', auth);
  assert.equal(sys.status, 200);
  const serialized = JSON.stringify(sys.data);
  assert.equal(serialized.includes(secretClient), false);
  assert.equal(serialized.includes(secretDrive), false);
  assert.equal(serialized.includes(creds.passwordHash), false);
  assert.equal(serialized.includes(creds.salt), false);
  assert.equal(sys.data.network.adminLoopbackOnly, true);
  assert.equal(sys.data.auth.googleConfigured, true);
  assert.equal(sys.data.features.driveCredentialsConfigured, true);

  // 2. Online backup creation + listing + restore-data schema verification.
  const backupRes = await callHandler(app.adminHandler, '/api/admin/system/backups', { method: 'POST', ...auth, body: {} });
  assert.equal(backupRes.status, 201);
  assert.equal(backupRes.data.backup.integrity, 'ok');
  assert.equal(backupRes.data.backup.foreignKeys, 'ok');
  const backupFile = path.join(dir, 'backups', backupRes.data.backup.filename);
  const inspected = inspectDatabase(backupFile);
  assert.equal(inspected.integrity, 'ok');
  assert.equal(inspected.foreignKeys, 'ok');

  const backupsList = await callHandler(app.adminHandler, '/api/admin/system/backups', auth);
  assert.equal(backupsList.status, 200);
  assert.equal(backupsList.data.backups.length, 1);

  // 3. Hub game detail & users summary.
  const gamesList = await callHandler(app.adminHandler, '/api/admin/games', auth);
  const firstGameId = gamesList.data.games[0].id;
  const gameDetail = await callHandler(app.adminHandler, `/api/admin/games/${firstGameId}`, auth);
  assert.equal(gameDetail.status, 200);
  assert.equal(gameDetail.data.game.id, firstGameId);
  assert.equal(typeof gameDetail.data.game.stats.errors24h, 'number');
  assert.equal((await callHandler(app.adminHandler, '/api/admin/games/no-such-game', auth)).status, 404);

  const usersSummary = await callHandler(app.adminHandler, '/api/admin/hub/users-summary', auth);
  assert.equal(usersSummary.status, 200);
  assert.equal(typeof usersSummary.data.counts.totalUsers, 'number');

  // 4. Submission checklist persistence & revision guard.
  const ownerId = uid();
  const submissionId = '11111111-2222-4333-8444-555555555555';
  const now = Date.now();
  app.db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(ownerId, 'registered', 'Creator', now);
  app.db.prepare(`INSERT INTO creator_submissions
    (id,owner_key,owner_id,project_id,release_id,release_revision,release_label,title,description,status,revision,created_at,updated_at,submitted_at)
    VALUES(?,?,?,?,?,?,?,?,?,'in_review',2,?,?,?)`)
    .run(submissionId, 'owner-key', ownerId, 'a'.repeat(24), 'b'.repeat(24), 1, 'v1', 'Demo Game', 'Desc', now, now, now);

  const initialChecklist = await callHandler(app.adminHandler, `/api/admin/submissions/${submissionId}/checklist`, auth);
  assert.equal(initialChecklist.status, 200);
  assert.equal(initialChecklist.data.checklist.items.length, 5);
  assert.equal(initialChecklist.data.checklist.items.every(i => !i.checked), true);

  const staleSave = await callHandler(app.adminHandler, `/api/admin/submissions/${submissionId}/checklist`, {
    method: 'PUT', ...auth, body: { revision: 1, items: { content_safety: true } }
  });
  assert.equal(staleSave.status, 409);

  const savedChecklist = await callHandler(app.adminHandler, `/api/admin/submissions/${submissionId}/checklist`, {
    method: 'PUT', ...auth, body: { revision: 2, items: { content_safety: true, metadata_match: true } }
  });
  assert.equal(savedChecklist.status, 200);
  assert.equal(savedChecklist.data.checklist.items.find(i => i.id === 'content_safety').checked, true);
  assert.equal(savedChecklist.data.checklist.items.find(i => i.id === 'save_runtime').checked, false);

  // 5. Forge overview inspects official templates.
  const forgeRes = await callHandler(app.adminHandler, '/api/admin/forge/overview', auth);
  assert.equal(forgeRes.status, 200);
  assert.ok(forgeRes.data.templates.length >= 4);
  assert.ok(forgeRes.data.templates.some(tpl => tpl.id === 'tappy-chicken'));

  // 6. QA overview & QA runs recording linked to submission.
  const createdRun = await callHandler(app.adminHandler, '/api/admin/qa/runs', {
    method: 'POST', ...auth,
    body: { submissionId, targetType: 'submission', targetId: 'demo-game', releaseRevision: 1, policyVersion: 'v1', status: 'passed', score: 98 }
  });
  assert.equal(createdRun.status, 201);
  const subRuns = await callHandler(app.adminHandler, `/api/admin/qa/runs?submissionId=${submissionId}`, auth);
  assert.equal(subRuns.status, 200);
  assert.equal(subRuns.data.runs.length, 1);
  assert.equal(subRuns.data.runs[0].status, 'passed');

  const qaRes = await callHandler(app.adminHandler, '/api/admin/qa/overview', auth);
  assert.equal(qaRes.status, 200);
  assert.equal(qaRes.data.qaRuns.length, 1);

  // 7. Summary badges & Audit domain filter.
  const badges = await callHandler(app.adminHandler, '/api/admin/summary/badges', auth);
  assert.equal(badges.status, 200);
  assert.equal(badges.data.hub.pendingSubmissions, 1);
  assert.equal(badges.data.system.backupsCount, 1);
  assert.equal(badges.data.qa.qaRunsCount, 1);

  const qaAudit = await callHandler(app.adminHandler, '/api/admin/audit?domain=qa', auth);
  assert.equal(qaAudit.status, 200);
  assert.equal(qaAudit.data.audit.length, 1);
  assert.equal(qaAudit.data.audit[0].action, 'qa_run_recorded');

  const sysAudit = await callHandler(app.adminHandler, '/api/admin/audit?domain=system', auth);
  assert.equal(sysAudit.status, 200);
  assert.ok(sysAudit.data.audit.some(a => a.action === 'system_backup_created'));
});

test('admin HTML preserves bootstrap ordering and exposes all 4 primary tabs', () => {
  const html = fs.readFileSync(new URL('../web/admin/index.html', import.meta.url), 'utf8');
  assert.ok(html.indexOf('/local-login-bootstrap.js') > 0);
  assert.ok(html.indexOf('/local-login-bootstrap.js') < html.indexOf('/locale.js'));
  for (const tab of ['system', 'hub', 'forge', 'qa']) {
    assert.ok(html.includes(`data-testid="admin-tab-${tab}"`), `missing tab ${tab}`);
  }
});
