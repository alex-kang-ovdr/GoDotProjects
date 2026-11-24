'use strict';
// Regression: behind Firebase Hosting (https://playhub-dev-2611.web.app/forge/...) only the
// `__session` cookie reaches Cloud Run. The Forge guest fallback used `playhub_forge_guest`
// only, so each request became a fresh guest and project creation failed with CSRF_INVALID.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('../server.cjs');

const ORIGIN = 'https://playhub-dev-2611.web.app';

function onlyFirebaseForwardedCookie(setCookie) {
  // Simulate Firebase Hosting: drop every cookie except `__session`.
  const pairs = setCookie.map(line => line.split(';')[0]);
  return pairs.filter(pair => pair.startsWith('__session=')).join('; ');
}

test('guest identity and CSRF token survive when only the __session cookie is forwarded', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-guest-session-'));
  const server = createServer({
    workspace: path.join(root, 'workspace'),
    publicOrigin: ORIGIN,
    allowGuest: true,
    hubAuth: {
      verifyUrl: 'http://127.0.0.1:9/internal/session/verify',
      internalSecret: 'a'.repeat(40),
      accountsDirectory: path.join(root, 'accounts'),
      studioDirectory: path.join(root, 'studios'),
      fetchImpl: async () => new Response(JSON.stringify({ authenticated: false, error: 'SESSION_REQUIRED' }), { status: 401 }),
    },
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.shutdown?.(); server.close?.(); fs.rmSync(root, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;

  const first = await fetch(`${base}/api/session`, { headers: { Origin: ORIGIN } });
  assert.equal(first.status, 200);
  const firstBody = await first.json();
  assert.equal(firstBody.guest, true);
  const setCookie = first.headers.getSetCookie();
  assert.ok(setCookie.some(line => line.startsWith('playhub_forge_guest=')), 'legacy guest cookie kept');
  const forwarded = onlyFirebaseForwardedCookie(setCookie);
  assert.match(forwarded, /^__session=[A-Za-z0-9_-]{8,}$/);

  const second = await fetch(`${base}/api/session`, { headers: { Origin: ORIGIN, Cookie: forwarded } });
  const secondBody = await second.json();
  assert.equal(secondBody.accountKey, firstBody.accountKey, 'same guest across requests');
  assert.equal(secondBody.csrfToken, firstBody.csrfToken);
  assert.deepEqual(second.headers.getSetCookie(), [], 'no new guest cookie when __session is present');

  const create = await fetch(`${base}/api/platform/projects`, {
    method: 'POST',
    headers: { Origin: ORIGIN, Cookie: forwarded, 'Content-Type': 'application/json', 'X-CSRF-Token': secondBody.csrfToken },
    body: '{}',
  });
  const createBody = await create.json();
  assert.notEqual(createBody.error, 'CSRF_INVALID');
  assert.equal(create.status, 400, JSON.stringify(createBody));
});
