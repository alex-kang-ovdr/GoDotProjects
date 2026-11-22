import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scryptSync } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server/app.mjs';

const hubRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function extractCookie(res) {
  const raw = res.headers.getSetCookie?.() || [];
  return raw.map(c => c.split(';', 1)[0]).join('; ');
}

test('GamerQA is admin-only, hidden from public Hub, and admin link is shown only when authorized', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-gamerqa-admin-'));
  const salt = 'b'.repeat(32);
  const password = 'admin-gamerqa-test-pass';
  const app = createApp({
    publicHost: '127.0.0.1',
    publicPort: 0,
    adminHost: '127.0.0.1',
    adminPort: 0,
    userOrigins: ['http://127.0.0.1:8080'],
    adminOrigins: ['http://127.0.0.1:8081'],
    userBaseUrl: 'http://127.0.0.1:8080',
    publicBaseUrl: 'http://127.0.0.1:8080',
    adminBaseUrl: 'http://127.0.0.1:8081',
    secureCookies: false,
    dataDir: path.join(tmp, 'data'),
    mobile: { enabled: true },
    admin: {
      username: 'qa-admin',
      salt,
      passwordHash: scryptSync(password, salt, 64).toString('hex'),
      allowedEmails: ['boss@example.com'],
    },
  }, { rootDir: hubRoot });

  const ports = await app.listen();
  t.after(async () => {
    await app.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const pubBase = `http://127.0.0.1:${ports.public.port}`;
  const admBase = `http://127.0.0.1:${ports.admin.port}`;
  const userOrigin = 'http://127.0.0.1:8080';
  const adminOrigin = 'http://127.0.0.1:8081';

  // 1. Public Hub must NOT expose GamerQA endpoints
  const pubTargets = await fetch(`${pubBase}/api/qa/targets`);
  assert.notEqual(pubTargets.status, 200);
  const pubAdminTargets = await fetch(`${pubBase}/api/admin/gamerqa/targets`);
  assert.equal(pubAdminTargets.status, 404);

  // 2. Anonymous & regular email users do NOT get admin link
  const anonRes = await fetch(`${pubBase}/api/session`, { headers: { Origin: userOrigin } });
  const anonCookie = extractCookie(anonRes);
  const anon = await anonRes.json();
  assert.equal(anon.isAdmin, false);
  assert.equal(anon.adminUrl, null);

  const regUserRes = await fetch(`${pubBase}/api/auth/email/register`, {
    method: 'POST',
    headers: { Origin: userOrigin, Cookie: anonCookie, 'Content-Type': 'application/json', 'X-CSRF-Token': anon.csrfToken },
    body: JSON.stringify({ email: 'player@example.com', password: 'UserPass!1234', displayName: 'Player' }),
  });
  assert.equal(regUserRes.status, 201);
  const userCookie = extractCookie(regUserRes);
  const userSess = await (await fetch(`${pubBase}/api/session`, { headers: { Origin: userOrigin, Cookie: userCookie } })).json();
  assert.equal(userSess.isAdmin, false);
  assert.equal(userSess.adminUrl, null);

  // 3. Authorized admin email user DOES receive admin link
  const anon2Res = await fetch(`${pubBase}/api/session`, { headers: { Origin: userOrigin } });
  const anon2Cookie = extractCookie(anon2Res);
  const anon2 = await anon2Res.json();
  const regAdminEmailRes = await fetch(`${pubBase}/api/auth/email/register`, {
    method: 'POST',
    headers: { Origin: userOrigin, Cookie: anon2Cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': anon2.csrfToken },
    body: JSON.stringify({ email: 'boss@example.com', password: 'AdminPass!1234', displayName: 'Boss' }),
  });
  assert.equal(regAdminEmailRes.status, 201);
  const bossCookie = extractCookie(regAdminEmailRes);
  const bossSess = await (await fetch(`${pubBase}/api/session`, { headers: { Origin: userOrigin, Cookie: bossCookie } })).json();
  assert.equal(bossSess.isAdmin, true);
  assert.equal(bossSess.adminUrl, 'http://127.0.0.1:8081');

  // 4. Unauthenticated admin GamerQA API returns 401
  const unauthAdm = await fetch(`${admBase}/api/admin/gamerqa/targets`);
  assert.equal(unauthAdm.status, 401);

  // 5. Authenticate to Admin API and run 4-platform GamerQA
  const admSessRes = await fetch(`${admBase}/api/admin/session`, { headers: { Origin: adminOrigin } });
  let admCookie = extractCookie(admSessRes);
  let admCsrf = (await admSessRes.json()).csrfToken;
  const loginRes = await fetch(`${admBase}/api/admin/login`, {
    method: 'POST',
    headers: { Origin: adminOrigin, Cookie: admCookie, 'Content-Type': 'application/json', 'X-CSRF-Token': admCsrf },
    body: JSON.stringify({ username: 'qa-admin', password }),
  });
  assert.equal(loginRes.status, 200);
  admCookie = extractCookie(loginRes) || admCookie;
  admCsrf = (await loginRes.json()).csrfToken;

  const targetsRes = await fetch(`${admBase}/api/admin/gamerqa/targets`, {
    headers: { Origin: adminOrigin, Cookie: admCookie },
  });
  assert.equal(targetsRes.status, 200);
  const targets = await targetsRes.json();
  assert.ok(targets.summary.web >= 20);
  assert.equal(targets.summary.desktop, 2);
  assert.equal(targets.summary.android, 2);
  assert.ok(targets.summary['godot-templates'] >= 18);

  const runRes = await fetch(`${admBase}/api/admin/gamerqa/runs`, {
    method: 'POST',
    headers: { Origin: adminOrigin, Cookie: admCookie, 'Content-Type': 'application/json', 'X-CSRF-Token': admCsrf },
    body: JSON.stringify({ platform: 'all' }),
  });
  assert.equal(runRes.status, 201);
  const runBody = await runRes.json();
  assert.equal(runBody.ok, true);
  assert.equal(runBody.summary.failed, 0);
  assert.equal(runBody.summary.total, targets.summary.totalTargets);

  const runsList = await (await fetch(`${admBase}/api/admin/gamerqa/runs?limit=100`, {
    headers: { Origin: adminOrigin, Cookie: admCookie },
  })).json();
  assert.equal(runsList.totalRuns, targets.summary.totalTargets);
  for (const p of ['web', 'desktop', 'android', 'godot-templates']) {
    assert.equal(runsList.byPlatform[p].passRate, 100);
  }
});
