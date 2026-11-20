import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { randomBytes, scryptSync } from 'node:crypto';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { createApp } from '../server/app.mjs';

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
});
