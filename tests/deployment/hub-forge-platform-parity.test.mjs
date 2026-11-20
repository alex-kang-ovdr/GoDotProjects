// S0 characterization: Hub (createHubForge) and Forge (hubAuth mode) both serve /api/platform/*
// over the same accounts directory. These tests pin the CURRENT differences so the ForgeGateway
// work (docs/architecture/hub-forge-internal-api-design.md) can change them deliberately.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createHubForge, forgeAccountKey } from '../../hub/server/forge-account.mjs';

const require = createRequire(import.meta.url);
const { createServer: createForgeServer } = require('../../forge/server.cjs');
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ORIGIN = 'https://playhub.test';
const CSRF = 'parity-csrf';

const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const close = server => new Promise(resolve => server.close(() => resolve()));

async function fixture(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-forge-parity-'));
  const privateDir = path.join(temp, 'private');
  const accountsDir = path.join(privateDir, 'accounts');
  const identity = { iss: 'https://accounts.google.com', sub: 'alice' };
  const key = forgeAccountKey(identity);

  // Hub side: same wiring as app.mjs, with a minimal session/db stand-in (see hub/tests/forge-account.test.mjs).
  const db = { prepare() { return { get() { return { kind: 'registered' }; }, all() { return [{ subject: 'alice' }]; } }; } };
  const requireSession = req => {
    if (req.headers.cookie !== 'alice') throw Object.assign(new Error(), { status: 401 });
    if (req.method !== 'GET' && req.headers['x-csrf-token'] !== CSRF) throw Object.assign(new Error(), { status: 403 });
    return { principal_id: 'alice' };
  };
  const hub = createHubForge({ config: { enabled: true, directory: privateDir }, db, requireSession, root: REPO_ROOT });
  const hubServer = http.createServer(async (req, res) => {
    if (!await hub.handle(req, res, new URL(req.url, 'http://localhost'))) res.writeHead(404).end();
  });

  // Forge side: real server in Hub-auth mode; the Hub verify call is stubbed to approve "alice".
  const fetchImpl = async () => ({
    status: 200,
    json: async () => ({ authenticated: true, userId: 'alice', accountKey: key, identity, csrfToken: CSRF }),
  });
  const forgeServer = createForgeServer({
    publicOrigin: ORIGIN,
    buildDirectory: path.join(temp, 'forge-builds'),
    hubAuth: {
      verifyUrl: 'http://127.0.0.1:9/internal/session/verify',
      accountsDirectory: accountsDir,
      studioDirectory: path.join(privateDir, 'studios'),
      fetchImpl,
    },
  });

  const hubPort = await listen(hubServer);
  const forgePort = await listen(forgeServer);
  t.after(async () => {
    hub.close();
    await close(hubServer);
    forgeServer.closeAllConnections?.();
    await close(forgeServer);
    fs.rmSync(temp, { recursive: true, force: true });
  });

  const call = base => async (route, method = 'GET', body) => {
    const response = await fetch(base + route, {
      method,
      headers: { cookie: 'alice', origin: ORIGIN, 'content-type': 'application/json', 'x-csrf-token': CSRF },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data = null;
    try { data = await response.json(); } catch {}
    return { status: response.status, body: data };
  };
  const hubBase = `http://127.0.0.1:${hubPort}`, forgeBase = `http://127.0.0.1:${forgePort}`;
  return { key, accountsDir, hubBase, forgeBase, hub: call(hubBase), forge: call(forgeBase) };
}

test('S0: Hub and Forge /api/platform/* share data but differ in routes and errors', async t => {
  const f = await fixture(t);

  await t.test('a project created through Hub is visible through Forge (shared accounts directory)', async () => {
    const created = await f.hub('/api/platform/projects', 'POST', { name: 'parity' });
    assert.equal(created.status, 201);
    const id = created.body.project.id;
    assert.ok(fs.existsSync(path.join(f.accountsDir, f.key, 'projects', id, 'project.json')));
    const viaForge = await f.forge(`/api/platform/projects/${id}`);
    assert.equal(viaForge.status, 200);
    assert.equal(viaForge.body.project.id, id);
    f.projectId = id;
  });

  await t.test('Hub-only routes (builds, cloud) do not exist on Forge', async () => {
    const id = f.projectId;
    for (const route of [`/api/platform/projects/${id}/builds`, `/api/platform/projects/${id}/cloud`]) {
      const hub = await f.hub(route, 'POST', {});
      const forge = await f.forge(route, 'POST', {});
      assert.equal(hub.status, 503, `Hub ${route}: feature disabled in this fixture`);
      assert.notEqual(forge.status, 503, `Forge ${route}: route is not implemented`);
      assert.notEqual(forge.status, 200);
      assert.notEqual(forge.status, 202);
    }
  });

  await t.test('core platform-api errors are identical because both run the same createPlatformApi', async () => {
    const missing = '/api/platform/projects/' + 'f'.repeat(24);
    const hub = await f.hub(missing);
    const forge = await f.forge(missing);
    assert.equal(hub.status, 404);
    assert.deepEqual(hub, forge);
  });

  await t.test('authentication failures differ: Hub collapses to ACCESS_DENIED, Forge returns its own login payload', async () => {
    const anonymous = base => fetch(base, { headers: { origin: ORIGIN } }).then(async r => ({ status: r.status, body: await r.json().catch(() => null) }));
    const hub = await anonymous(f.hubBase + '/api/platform/projects');
    const forge = await anonymous(f.forgeBase + '/api/platform/projects');
    assert.equal(hub.status, 401);
    assert.deepEqual(hub.body, { error: 'ACCESS_DENIED' });
    assert.equal(forge.status, 401);
    assert.notDeepEqual(forge.body, hub.body);
  });
});
