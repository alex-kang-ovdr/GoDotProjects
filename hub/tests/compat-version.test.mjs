import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes, scryptSync } from 'node:crypto';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { createApp } from '../server/app.mjs';
import { inspectDatabase } from '../tools/restore-data.mjs';

function makeAdminCreds(password) {
  const salt = randomBytes(16).toString('hex');
  return { salt, passwordHash: scryptSync(password, salt, 64).toString('hex') };
}

async function callHandler(handler, route, { method = 'GET', origin = 'http://localhost:8080', cookie = '', csrf = '', body } = {}) {
  const req = new PassThrough();
  req.method = method;
  req.url = route;
  req.socket = { remoteAddress: '127.0.0.1' };
  req.headers = {
    host: '127.0.0.1:8090',
    ...(origin ? { origin } : {}),
    ...(cookie ? { cookie } : {}),
    ...(csrf ? { 'x-csrf-token': csrf } : {}),
    ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
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
    },
  };
  const done = handler(req, res);
  if (body !== undefined) req.end(JSON.stringify(body));
  else req.end();
  await done;
  const setCookies = headers['set-cookie']
    ? (Array.isArray(headers['set-cookie']) ? headers['set-cookie'] : [headers['set-cookie']])
    : [];
  const nextCookie = setCookies.map(c => c.split(';')[0]).join('; ');
  return {
    status: res.statusCode,
    headers,
    cookie: nextCookie || cookie,
    data: rawBody ? JSON.parse(rawBody) : null,
  };
}

function makeTestConfig(dataDir, adminCreds) {
  return {
    dataDir,
    userOrigins: ['http://localhost:8080'],
    adminOrigins: ['http://127.0.0.1:8081'],
    userBaseUrl: 'http://localhost:8080',
    publicBaseUrl: 'http://localhost:8080',
    adminBaseUrl: 'http://127.0.0.1:8081',
    admin: {
      username: 'opsadmin',
      ...adminCreds,
      localAutoLogin: false,
    },
  };
}

async function loginAdmin(app, password) {
  const s = await callHandler(app.adminHandler, '/api/admin/session', { origin: 'http://127.0.0.1:8081' });
  const login = await callHandler(app.adminHandler, '/api/admin/login', {
    method: 'POST',
    origin: 'http://127.0.0.1:8081',
    cookie: s.cookie,
    csrf: s.data.csrfToken,
    body: { username: 'opsadmin', password },
  });
  assert.equal(login.status, 200);
  return { cookie: login.cookie, csrf: login.data.csrfToken };
}

test('Hub /api/version, /api/compat/check, and /api/admin/release-policy support live optional<->force toggling and persistence', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-compat-test-'));
  const dataDir = path.join(tmp, 'data');
  const adminCreds = makeAdminCreds('StrongPass123!');
  const env = {
    PLAYHUB_CHANNEL: 'live',
    PLAYHUB_BUILD_NUM: '42',
    PLAYHUB_DAILY_SEQ: '10',
    PLAYHUB_BUILD_DATE: '2026-11-20T16:32:00Z',
    PLAYHUB_BRANCH: 'PlayHub-Platform',
    PLAYHUB_COMMIT: '13c70ba',
    PLAYHUB_ENGINE_ABI: 'godot-4.7',
    PLAYHUB_ENGINE_API_REV: '2',
    PLAYHUB_MIN_ENGINE_API_REV: '2',
    PLAYHUB_NET_PROTOCOL: '1.2',
    PLAYHUB_GAMEPLAY_HASH: 'rules-v2',
    PLAYHUB_UPDATE_POLICY: 'optional',
  };
  let clockMs = Date.parse('2026-11-21T02:00:00Z');
  let app = createApp(makeTestConfig(dataDir, adminCreds), { env, clock: () => clockMs });

  try {
    // 1. /api/health and /api/version expose buildId & buildCode on public and admin
    const health = await callHandler(app.publicHandler, '/api/health');
    assert.equal(health.status, 200);
    assert.equal(health.data.buildId, 'hub-v0.3.0-20261121-0132-playhub-platform-g13c70ba-b42');
    assert.equal(health.data.buildCode, 2026112110);

    const verPublic = await callHandler(app.publicHandler, '/api/version');
    assert.equal(verPublic.status, 200);
    assert.equal(verPublic.data.buildInfo.buildCode, 2026112110);
    assert.equal(verPublic.data.releasePolicy.targets.aos.updatePolicy, 'optional');

    const verAdmin = await callHandler(app.adminHandler, '/api/version', { origin: 'http://127.0.0.1:8081' });
    assert.equal(verAdmin.status, 200);
    assert.equal(verAdmin.data.buildInfo.buildId, health.data.buildId);

    // 2. Public listener blocks /api/admin/release-policy (404)
    const publicAdminBlocked = await callHandler(app.publicHandler, '/api/admin/release-policy');
    assert.equal(publicAdminBlocked.status, 404);

    // 3. Under default optional policy, older AOS build (native client with no Origin) gets COMPAT_ALLOW_SOFT_UPDATE (200)
    const softCheck = await callHandler(app.publicHandler, '/api/compat/check', {
      method: 'POST',
      origin: '',
      body: {
        target: 'aos',
        buildCode: 2026112105,
        engineAbi: 'godot-4.7',
        engineApiRev: 2,
        netProtocol: '1.2',
        gameplayHash: 'rules-v2',
      },
    });
    assert.equal(softCheck.status, 200);
    assert.equal(softCheck.headers['x-playhub-compat-decision'], 'COMPAT_ALLOW_SOFT_UPDATE');
    assert.equal(softCheck.data.decision, 'COMPAT_ALLOW_SOFT_UPDATE');
    assert.equal(softCheck.data.reason, 'COMPAT_REASON_POLICY_OPTIONAL_UPDATE');

    // Disallowed browser Origin is still blocked with 403
    const evilOrigin = await callHandler(app.publicHandler, '/api/compat/check', {
      method: 'POST',
      origin: 'https://evil.example',
      body: { target: 'hub', buildCode: 2026112110 },
    });
    assert.equal(evilOrigin.status, 403);

    // 4. Hard technical mismatch still returns 426 even under optional policy
    const abiMismatch = await callHandler(app.publicHandler, '/api/compat/check', {
      method: 'POST',
      body: { target: 'aos', buildCode: 2026112110, engineAbi: 'godot-4.6' },
    });
    assert.equal(abiMismatch.status, 426);
    assert.equal(abiMismatch.data.decision, 'COMPAT_BLOCK_FORCE_UPDATE');
    assert.equal(abiMismatch.data.reason, 'COMPAT_REASON_ENGINE_ABI_MISMATCH');

    // 5. Unauthenticated admin release-policy call rejected with 401
    const unauth = await callHandler(app.adminHandler, '/api/admin/release-policy', { origin: 'http://127.0.0.1:8081' });
    assert.equal(unauth.status, 401);

    // 6. Admin switches AOS to force and adds legacy drain pool (live without restart)
    const auth = await loginAdmin(app, 'StrongPass123!');
    const noCsrf = await callHandler(app.adminHandler, '/api/admin/release-policy', {
      method: 'POST',
      origin: 'http://127.0.0.1:8081',
      cookie: auth.cookie,
      body: { targets: { aos: { updatePolicy: 'force' } } },
    });
    assert.equal(noCsrf.status, 403);

    const updated = await callHandler(app.adminHandler, '/api/admin/release-policy', {
      method: 'POST',
      origin: 'http://127.0.0.1:8081',
      cookie: auth.cookie,
      csrf: auth.csrf,
      body: {
        targets: {
          aos: {
            updatePolicy: 'force',
            graceMinutes: 10,
            storeUrl: 'https://play.google.com/store/apps/details?id=com.playhub.app',
            notice: '긴급 보안 패치',
          },
          ios: { updatePolicy: 'optional' },
        },
        activePools: [
          {
            poolId: 'drain-v1',
            gameplayHash: 'rules-v1',
            endpoint: 'wss://drain-v1.playhub.example/ws',
            expiresAtUtc: '2026-11-21T04:00:00Z',
          },
        ],
      },
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.data.policy.revision, 2);
    assert.equal(updated.data.policy.targets.aos.updatePolicy, 'force');

    // 7. Immediately after live update, AOS older build is blocked (426), iOS stays soft (200), legacy gameplay routes to drain pool
    const aosBlocked = await callHandler(app.publicHandler, '/api/compat/check', {
      method: 'POST',
      body: {
        target: 'aos',
        buildCode: 2026112105,
        engineAbi: 'godot-4.7',
        engineApiRev: 2,
        netProtocol: '1.2',
        gameplayHash: 'rules-v2',
      },
    });
    assert.equal(aosBlocked.status, 426);
    assert.equal(aosBlocked.data.decision, 'COMPAT_BLOCK_FORCE_UPDATE');
    assert.equal(aosBlocked.data.reason, 'COMPAT_REASON_POLICY_FORCE_UPDATE');

    const iosStillSoft = await callHandler(app.publicHandler, '/api/compat/check', {
      method: 'POST',
      body: {
        target: 'ios',
        buildCode: 2026112105,
        engineAbi: 'godot-4.7',
        engineApiRev: 2,
        netProtocol: '1.2',
        gameplayHash: 'rules-v2',
      },
    });
    assert.equal(iosStillSoft.status, 200);
    assert.equal(iosStillSoft.data.decision, 'COMPAT_ALLOW_SOFT_UPDATE');

    const legacyPool = await callHandler(app.publicHandler, '/api/compat/check', {
      method: 'POST',
      body: {
        target: 'ios',
        buildCode: 2026112110,
        engineAbi: 'godot-4.7',
        engineApiRev: 2,
        netProtocol: '1.2',
        gameplayHash: 'rules-v1',
      },
    });
    assert.equal(legacyPool.status, 200);
    assert.equal(legacyPool.data.decision, 'COMPAT_ROUTE_LEGACY_POOL');
    assert.equal(legacyPool.data.targetPool.poolId, 'drain-v1');

    // 8. Audit entry recorded & SQLite backup whitelist stays 100% compatible
    const auditRow = app.db.prepare("SELECT * FROM audit WHERE action='system_release_policy_update' ORDER BY created_at DESC LIMIT 1").get();
    assert.ok(auditRow);
    const auditDetail = JSON.parse(auditRow.detail);
    assert.equal(auditDetail.revision, 2);
    assert.deepEqual(auditDetail.forceTargets, ['aos']);

    await app.close();

    // Verify restore-data.mjs inspectDatabase accepts platform.sqlite without unexpected tables
    const inspected = inspectDatabase(path.join(dataDir, 'platform.sqlite'));
    assert.ok(inspected);

    // 9. Restart app and confirm persisted release-policy.json is loaded
    app = createApp(makeTestConfig(dataDir, adminCreds), { env, clock: () => clockMs });
    const afterRestart = await callHandler(app.publicHandler, '/api/compat/check', {
      method: 'POST',
      body: { target: 'aos', buildCode: 2026112105, engineAbi: 'godot-4.7', engineApiRev: 2, netProtocol: '1.2', gameplayHash: 'rules-v2' },
    });
    assert.equal(afterRestart.status, 426);
    assert.equal(afterRestart.data.reason, 'COMPAT_REASON_POLICY_FORCE_UPDATE');
  } finally {
    await app.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
