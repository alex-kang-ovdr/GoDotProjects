// Hub-mounted Dedicated Server JoinTicket & SessionLease Control Plane integration test.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.mjs';

const INTERNAL_SECRET = 'test-internal-ds-secret-at-least-32-chars!!';

function makeApp(dataDir) {
  return createApp({
    dataDir,
    publicHost: '127.0.0.1',
    publicPort: 0,
    adminHost: '127.0.0.1',
    adminPort: 0,
    userBaseUrl: 'http://127.0.0.1:8090',
    userOrigins: ['http://127.0.0.1:8090'],
    adminBaseUrl: 'http://127.0.0.1:8091',
    adminOrigins: ['http://127.0.0.1:8091'],
    datastore: { internalSecret: INTERNAL_SECRET },
  });
}

async function reqJson(base, method, p, { headers = {}, body } = {}) {
  const res = await fetch(`${base}${p}`, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  return { status: res.status, headers: res.headers, data };
}

test('Hub DS Control Plane: internal auth guard, session-bound player JoinTicket, key rotation, lease fencing, zero secret leak', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-ds-cp-'));
  const keyringFile = path.join(tmpDir, 'broker', 'keyring.json');
  const app = makeApp(path.join(tmpDir, 'data'));
  const { public: pubAddr, admin: admAddr } = await app.listen();
  const pubBase = `http://127.0.0.1:${pubAddr.port}`;
  const admBase = `http://127.0.0.1:${admAddr.port}`;
  const internalHeaders = { 'x-playhub-internal-secret': INTERNAL_SECRET };

  try {
    // 1) Internal endpoint rejects missing/wrong secret and is unreachable on public port
    const unauth = await reqJson(admBase, 'POST', '/internal/v1/multiplayer/ds/sessions', { body: { sessionId: 's1' } });
    assert.equal(unauth.status, 403);
    const pubBlocked = await reqJson(pubBase, 'POST', '/internal/v1/multiplayer/ds/sessions', { headers: internalHeaders, body: { sessionId: 's1' } });
    assert.equal(pubBlocked.status, 404);

    // 2) Establish real Hub guest player session & obtain principal_id
    const sessRes = await reqJson(pubBase, 'GET', '/api/session');
    assert.equal(sessRes.status, 200);
    const setCookie = sessRes.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
    const csrf = sessRes.data.csrfToken;
    const playerHeaders = {
      origin: 'http://127.0.0.1:8090',
      cookie: setCookie,
      'x-csrf-token': csrf,
    };
    // Trigger promotion by reading/updating preferences or directly calling join-ticket after reserving.
    const prefRes = await reqJson(pubBase, 'PUT', '/api/preferences', { headers: playerHeaders, body: { locale: 'ko' } });
    assert.equal(prefRes.status, 200);
    const dbRow = app.db.prepare("SELECT principal_id FROM sessions WHERE kind='public'").get();
    assert.ok(dbRow && dbRow.principal_id, 'guest session should have principal_id');
    const principalId = dbRow.principal_id;

    // 3) Internal control plane creates DS session and reserves slot 0 for the real Hub principal
    const created = await reqJson(admBase, 'POST', '/internal/v1/multiplayer/ds/sessions', {
      headers: internalHeaders,
      body: { sessionId: 'hub-sess-1', instanceId: 'hub-ds-1', maxPlayers: 3, keyringFile },
    });
    assert.equal(created.status, 201);
    assert.equal(fs.existsSync(keyringFile), true);
    assert.ok(!JSON.stringify(created.data).includes('keys'), 'HTTP response must not expose keyring secrets');

    const reserved = await reqJson(admBase, 'POST', '/internal/v1/multiplayer/ds/sessions/hub-sess-1/reserve', {
      headers: internalHeaders,
      body: { userId: principalId, slot: 0 },
    });
    assert.equal(reserved.status, 201);

    // 4) Player calls public JoinTicket API — even if body tries to spoof another userId, Hub binds to principalId
    const ticketRes = await reqJson(pubBase, 'POST', '/api/multiplayer/ds/sessions/hub-sess-1/join-ticket', {
      headers: playerHeaders,
      body: { userId: 'spoofed-other-user' },
    });
    assert.equal(ticketRes.status, 200);
    assert.equal(ticketRes.data.claims.userId, principalId);
    assert.equal(ticketRes.data.claims.slot, 0);
    assert.equal(ticketRes.data.claims.kid, 'k1');
    assert.equal(ticketRes.data.ticket.split('.').length, 2);

    // 5) Public health exposes metadata only (0 secrets)
    const health = await reqJson(pubBase, 'GET', '/api/multiplayer/ds/sessions/hub-sess-1/health');
    assert.equal(health.status, 200);
    assert.equal(health.data.session.sessionId, 'hub-sess-1');
    assert.ok(!JSON.stringify(health.data).includes('secret'));

    // 6) Internal key rotation updates broker keyring & retires k1
    const rot = await reqJson(admBase, 'POST', '/internal/v1/multiplayer/ds/sessions/hub-sess-1/keys/rotate', {
      headers: internalHeaders,
      body: { retirePrevious: true },
    });
    assert.equal(rot.status, 200);
    assert.equal(rot.data.activeKid, 'k2');
    assert.deepEqual(rot.data.retired, ['k1']);
    const kr = JSON.parse(fs.readFileSync(keyringFile, 'utf8'));
    assert.equal(kr.activeKid, 'k2');
    assert.equal(Object.keys(kr.keys).length, 1);

    // 7) Resume ticket issues with rotated key k2 and new nonce
    const resumeRes = await reqJson(pubBase, 'POST', '/api/multiplayer/ds/sessions/hub-sess-1/resume', {
      headers: playerHeaders,
      body: {},
    });
    assert.equal(resumeRes.status, 200);
    assert.equal(resumeRes.data.claims.kid, 'k2');
    assert.equal(resumeRes.data.claims.resume, true);
    assert.notEqual(resumeRes.data.ticket, ticketRes.data.ticket);

    // 8) Lease fencing & idempotent result commit
    const renew = await reqJson(admBase, 'POST', '/internal/v1/multiplayer/ds/sessions/hub-sess-1/lease/renew', {
      headers: internalHeaders,
      body: { leaseEpoch: 1, bumpEpoch: true },
    });
    assert.equal(renew.status, 200);
    assert.equal(renew.data.leaseEpoch, 2);

    const stale = await reqJson(admBase, 'POST', '/internal/v1/multiplayer/ds/sessions/hub-sess-1/results', {
      headers: internalHeaders,
      body: { leaseEpoch: 1, resultRevision: 1, resultHash: 'abc' },
    });
    assert.equal(stale.status, 409);

    const committed = await reqJson(admBase, 'POST', '/internal/v1/multiplayer/ds/sessions/hub-sess-1/results', {
      headers: internalHeaders,
      body: { leaseEpoch: 2, resultRevision: 1, resultHash: 'abc' },
    });
    assert.equal(committed.status, 201);
    assert.equal(committed.data.duplicate, false);
  } finally {
    await app.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
