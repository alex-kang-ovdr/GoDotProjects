import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server/app.mjs';

const hubRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function extractCookie(res) {
  const raw = res.headers.getSetCookie?.() || [];
  return raw.map(c => c.split(';', 1)[0]).join('; ');
}

test('Hub GamerQA integrates Web, Desktop, Android, and Godot Templates (18) and persists QA runs', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-gamerqa-hub-'));
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
  }, { rootDir: hubRoot });

  const ports = await app.listen();
  t.after(async () => {
    await app.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const base = `http://127.0.0.1:${ports.public.port}`;
  const origin = 'http://127.0.0.1:8080';

  // 1. Target catalog lists all 4 platforms
  const targetsRes = await fetch(`${base}/api/qa/targets`);
  assert.equal(targetsRes.status, 200);
  const targets = await targetsRes.json();
  assert.ok(targets.summary.web >= 20, `expected >=20 web games, got ${targets.summary.web}`);
  assert.equal(targets.summary.desktop, 2);
  assert.equal(targets.summary.android, 2);
  assert.ok(targets.summary['godot-templates'] >= 18, `expected >=18 godot templates, got ${targets.summary['godot-templates']}`);

  // 2. Obtain isolated QA session
  const sessRes = await fetch(`${base}/api/session`, { headers: { Origin: origin } });
  assert.equal(sessRes.status, 200);
  let cookie = extractCookie(sessRes);
  const sessBody = await sessRes.json();
  let csrf = sessBody.csrfToken;

  const qaRes = await fetch(`${base}/api/qa/session`, {
    method: 'POST',
    headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
    body: '{}',
  });
  assert.equal(qaRes.status, 201);
  cookie = extractCookie(qaRes) || cookie;
  const qaBody = await qaRes.json();
  csrf = qaBody.csrfToken;

  // 3. Run full multi-platform QA batch
  const runRes = await fetch(`${base}/api/qa/runs`, {
    method: 'POST',
    headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
    body: JSON.stringify({ platform: 'all' }),
  });
  assert.equal(runRes.status, 201);
  const runBody = await runRes.json();
  assert.equal(runBody.ok, true);
  assert.equal(runBody.summary.failed, 0);
  assert.equal(runBody.summary.total, targets.summary.totalTargets);
  assert.ok(runBody.summary.avgScore >= 95);

  // 4. Verify persisted runs and platform stats
  const listRes = await fetch(`${base}/api/qa/runs?limit=100`);
  assert.equal(listRes.status, 200);
  const listBody = await listRes.json();
  assert.equal(listBody.totalRuns, targets.summary.totalTargets);
  for (const p of ['web', 'desktop', 'android', 'godot-templates']) {
    assert.ok(listBody.byPlatform[p].total > 0, `platform ${p} should have runs`);
    assert.equal(listBody.byPlatform[p].passRate, 100);
  }

  // 5. Reject invalid platform
  const badRes = await fetch(`${base}/api/qa/runs`, {
    method: 'POST',
    headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
    body: JSON.stringify({ platform: 'invalid-os' }),
  });
  assert.equal(badRes.status, 422);
});
