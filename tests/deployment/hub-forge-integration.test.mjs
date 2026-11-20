import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, generateKeyPairSync, randomUUID, scryptSync, sign } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createApp } from '../../hub/server/app.mjs';
import { createStaticServer } from '../../hub/tools/dev.mjs';
import { createForgeProxy } from '../../hub/tools/forge-proxy.mjs';

const require = createRequire(import.meta.url);
const { createServer: createForgeServer } = require('../../forge/server.cjs');
const { PlatformStore } = require('../../forge/Tools/platform-store.cjs');
const { WebSocket } = require('../../forge/node_modules/ws');

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const INTERNAL_SECRET = 'test-internal-forge-secret-0123456789abcdef';
const ADMIN_PASSWORD = 'Integration-admin-password-42!';

function listen(server, host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, host, () => {
      server.off('error', reject);
      resolve(server.address().port);
    });
  });
}

function closeServer(server) {
  return new Promise(resolve => {
    if (!server?.listening) return resolve();
    server.once('close', resolve);
    server.closeAllConnections?.();
    if (typeof server.shutdown === 'function') server.shutdown();
    else server.close();
  });
}

function parseSetCookies(response) {
  return response.headers.getSetCookie().map(line => {
    const parts = line.split(';').map(part => part.trim());
    const eq = parts[0].indexOf('=');
    const attrs = {};
    for (const part of parts.slice(1)) {
      const idx = part.indexOf('=');
      if (idx > 0) attrs[part.slice(0, idx).toLowerCase()] = part.slice(idx + 1);
      else attrs[part.toLowerCase()] = true;
    }
    return { name: parts[0].slice(0, eq), value: parts[0].slice(eq + 1), attrs, raw: line };
  });
}

class BrowserJar {
  constructor(hubApiBase, siteBase) {
    this.hubApiBase = hubApiBase;
    this.siteBase = siteBase;
    this.origin = new URL(siteBase).origin;
    this.cookies = new Map(); // `${name}@${path}` -> { name, value, path }
    this.csrf = null;
  }

  store(response) {
    const parsed = parseSetCookies(response);
    for (const item of parsed) {
      const cookiePath = item.attrs.path || '/';
      const key = `${item.name}@${cookiePath}`;
      if (item.attrs['max-age'] === '0' || item.value === '') this.cookies.delete(key);
      else this.cookies.set(key, { name: item.name, value: item.value, path: cookiePath });
    }
    return parsed;
  }

  cookieHeaderFor(pathname) {
    const matched = [];
    for (const item of this.cookies.values()) {
      if (item.path === '/' || pathname === item.path || pathname.startsWith(item.path + '/')) {
        matched.push(`${item.name}=${item.value}`);
      }
    }
    return matched.join('; ');
  }

  async fetchAt(base, route, { method = 'GET', body, headers = {}, csrf = true, origin = this.origin, redirect = 'manual' } = {}) {
    const url = new URL(route, base);
    const h = { ...headers };
    if (origin !== null && !('Origin' in h)) h.Origin = origin;
    if (!('Cookie' in h)) {
      const cookieHeader = this.cookieHeaderFor(url.pathname);
      if (cookieHeader) h.Cookie = cookieHeader;
    }
    if (body !== undefined && !('Content-Type' in h)) h['Content-Type'] = 'application/json';
    if (csrf && this.csrf && !['GET', 'HEAD'].includes(method) && !('X-CSRF-Token' in h)) {
      h['X-CSRF-Token'] = this.csrf;
    }
    const response = await fetch(url, {
      method,
      headers: h,
      body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
      redirect,
    });
    const setCookies = this.store(response);
    const text = await response.text();
    let data = text;
    try { data = JSON.parse(text); } catch {}
    if (data && typeof data === 'object' && typeof data.csrfToken === 'string') this.csrf = data.csrfToken;
    return { status: response.status, headers: response.headers, setCookies, data, text };
  }

  hubApi(route, options) { return this.fetchAt(this.hubApiBase, route, options); }
  site(route, options) { return this.fetchAt(this.siteBase, route, options); }
}

function openWs(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { headers });
    let settled = false;
    ws.once('open', () => { settled = true; resolve({ ok: true, ws }); });
    ws.once('unexpected-response', (_req, res) => {
      if (settled) return;
      settled = true;
      res.resume();
      ws.terminate();
      resolve({ ok: false, status: res.statusCode });
    });
    ws.once('error', error => {
      if (settled) return;
      settled = true;
      resolve({ ok: false, error: error.message });
    });
  });
}

async function createIntegrationFixture(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-forge-c-option-'));
  const siteRoot = path.join(temp, 'site');
  const dataDir = path.join(temp, 'hub-data');
  const privateDir = path.join(temp, 'private-forge');
  const accountsDir = path.join(privateDir, 'accounts');
  const studiosDir = path.join(privateDir, 'studios');
  const buildDir = path.join(privateDir, 'builds');

  fs.mkdirSync(path.join(siteRoot, 'catalog'), { recursive: true });
  fs.mkdirSync(path.join(siteRoot, 'games/test-puzzle'), { recursive: true });
  fs.mkdirSync(path.join(siteRoot, 'PlayForge'), { recursive: true });
  fs.writeFileSync(path.join(siteRoot, 'index.html'), '<!doctype html><html><body>PlayHub Home</body></html>');
  fs.writeFileSync(path.join(siteRoot, 'games/test-puzzle/index.html'), '<!doctype html><html><body>Game</body></html>');
  fs.writeFileSync(path.join(siteRoot, 'games/test-puzzle/game.manifest.json'), JSON.stringify({
    schemaVersion: 1, id: 'test-puzzle', entry: 'index.html', version: '0.1.0',
    title: { ko: '테스트 퍼즐' }, summary: { ko: '요약' }, instructions: { ko: '설명' },
    tags: ['puzzle'], controls: ['keyboard'], save: { schemaVersion: 1 }, media: { cover: 'assets/cover.svg' },
  }));
  fs.writeFileSync(path.join(siteRoot, 'catalog/games.json'), JSON.stringify({
    schemaVersion: 1, entries: [{ id: 'test-puzzle', path: 'games/test-puzzle', enabled: true }],
  }));

  // Mock Google OIDC RSA keys and authorization code store.
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'hub-forge-key', alg: 'RS256', use: 'sig' };
  const codes = new Map();
  let nowMs = Date.parse('2026-11-19T05:00:00Z');

  const fakeFetch = async (url, init = {}) => {
    if (url === 'https://www.googleapis.com/oauth2/v3/certs') return Response.json({ keys: [jwk] });
    if (url === 'https://oauth2.googleapis.com/token') {
      const params = init.body;
      const record = codes.get(params.get('code'));
      if (!record) return Response.json({ error: 'invalid_grant' }, { status: 400 });
      assert.equal(createHash('sha256').update(params.get('code_verifier')).digest('base64url'), record.challenge);
      const sec = Math.floor(nowMs / 1000);
      const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'hub-forge-key' })).toString('base64url');
      const claims = {
        iss: 'https://accounts.google.com', aud: 'test-google-client',
        sub: record.sub, name: record.name, iat: sec, exp: sec + 3600, nonce: record.nonce,
      };
      const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
      const signature = sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), privateKey).toString('base64url');
      return Response.json({ id_token: `${header}.${payload}.${signature}` });
    }
    throw new Error('Unexpected fetch URL: ' + url);
  };

  // Start Hub static server first on an ephemeral port so we know exact userOrigin.
  let forgeProxy = null;
  const openSockets = [];
  const userSiteServer = createStaticServer(siteRoot, {
    forgeProxy: {
      matches: p => forgeProxy ? forgeProxy.matches(p) : false,
      handle: (req, res) => forgeProxy.handle(req, res),
      upgrade: (req, socket, head) => forgeProxy.upgrade(req, socket, head),
      close: () => forgeProxy?.close(),
    },
  });
  const userPort = await listen(userSiteServer);
  const siteOrigin = `http://127.0.0.1:${userPort}`;

  const salt = '0123456789abcdef0123456789abcdef';
  const app = createApp({
    publicHost: '127.0.0.1', publicPort: 0,
    adminHost: '127.0.0.1', adminPort: 0,
    userOrigins: [siteOrigin],
    adminOrigins: ['http://127.0.0.1:18131'],
    userBaseUrl: siteOrigin,
    publicBaseUrl: siteOrigin,
    adminBaseUrl: 'http://127.0.0.1:18131',
    dataDir,
    secureCookies: false,
    google: {
      clientId: 'test-google-client',
      clientSecret: 'test-google-secret',
      redirectUri: 'http://127.0.0.1:8090/api/auth/google/callback',
    },
    forge: { enabled: false, internalSecret: INTERNAL_SECRET },
    admin: { username: 'admin', salt, passwordHash: scryptSync(ADMIN_PASSWORD, salt, 64).toString('hex') },
  }, { rootDir: siteRoot, platformRoot: REPO_ROOT, clock: () => nowMs, fetch: fakeFetch, env: {} });

  const addresses = await app.listen();
  const hubPublicBase = `http://127.0.0.1:${addresses.public.port}`;
  const hubAdminBase = `http://127.0.0.1:${addresses.admin.port}`;
  const verifyUrl = `${hubAdminBase}/internal/session/verify`;

  const forgeServer = createForgeServer({
    publicOrigin: siteOrigin,
    basePath: '/forge',
    buildDirectory: buildDir,
    hubAccountUrl: '/?view=account',
    hubAuth: {
      verifyUrl,
      internalSecret: INTERNAL_SECRET,
      accountsDirectory: accountsDir,
      studioDirectory: studiosDir,
      loginUrl: '/?view=account',
    },
  });
  const forgePort = await listen(forgeServer);
  forgeProxy = createForgeProxy({ upstream: `http://127.0.0.1:${forgePort}`, basePath: '/forge' });

  t.after(async () => {
    for (const ws of openSockets) {
      try { ws.terminate(); } catch {}
    }
    forgeProxy?.close();
    await closeServer(userSiteServer);
    await closeServer(forgeServer);
    await app.close();
    fs.rmSync(temp, { recursive: true, force: true });
  });

  async function loginGoogle(jar, { sub, name }) {
    await jar.hubApi('/api/session');
    const start = await jar.hubApi(`/api/auth/google/start?returnTo=${encodeURIComponent(siteOrigin + '/?view=create')}`);
    assert.equal(start.status, 302, JSON.stringify(start.data));
    const authUrl = new URL(start.headers.get('location'));
    const code = 'code-' + randomUUID();
    codes.set(code, {
      sub,
      name,
      nonce: authUrl.searchParams.get('nonce'),
      challenge: authUrl.searchParams.get('code_challenge'),
    });
    const callback = await jar.hubApi(`/api/auth/google/callback?state=${encodeURIComponent(authUrl.searchParams.get('state'))}&code=${encodeURIComponent(code)}`);
    assert.equal(callback.status, 302, JSON.stringify(callback.data));
    assert.match(callback.headers.get('location') || '', /auth=success/);
    return callback;
  }

  return {
    temp, siteOrigin, hubPublicBase, hubAdminBase, verifyUrl, forgePort,
    accountsDir, buildDir, app, forgeServer, userSiteServer, openSockets,
    newBrowser: () => new BrowserJar(hubPublicBase, siteOrigin),
    loginGoogle,
  };
}

test('single-domain Hub+Forge integration enforces Google login, account isolation, logout revocation and path-scoped COOP/COEP', async t => {
  const f = await createIntegrationFixture(t);

  await t.test('path-scoped Cross-Origin Isolation: Hub pages have no COOP/COEP while /forge/* is isolated', async () => {
    const anon = f.newBrowser();
    const home = await anon.site('/');
    assert.equal(home.status, 200);
    assert.equal(home.headers.get('cross-origin-opener-policy'), null);
    assert.equal(home.headers.get('cross-origin-embedder-policy'), null);

    const game = await anon.site('/games/test-puzzle/index.html');
    assert.equal(game.status, 200);
    assert.equal(game.headers.get('cross-origin-opener-policy'), null);
    assert.equal(game.headers.get('cross-origin-embedder-policy'), null);

    const health = await anon.site('/forge/api/health');
    assert.equal(health.status, 200);
    assert.equal(health.data.ok, true);
    assert.equal(health.data.hubAuth, true);
    assert.equal(health.headers.get('cross-origin-opener-policy'), 'same-origin');
    assert.equal(health.headers.get('cross-origin-embedder-policy'), 'require-corp');
    assert.equal(health.headers.get('cross-origin-resource-policy'), 'same-origin');
  });

  await t.test('unauthenticated, guest, QA, admin-cookie and spoofed headers are blocked from /forge/*', async () => {
    const anon = f.newBrowser();

    // Unauthenticated HTML navigation returns 401 login gate while preserving COOP/COEP.
    const editorGate = await anon.site('/forge/OfficialGodot/', { headers: { Accept: 'text/html' } });
    assert.equal(editorGate.status, 401);
    assert.match(editorGate.text, /\?view=account/);
    assert.equal(editorGate.headers.get('cross-origin-opener-policy'), 'same-origin');
    assert.equal(editorGate.headers.get('cross-origin-embedder-policy'), 'require-corp');

    assert.equal((await anon.site('/forge/api/session')).status, 401);
    assert.equal((await anon.site('/forge/api/platform/projects')).status, 401);
    assert.equal((await anon.site('/forge/api/platform/projects', { method: 'POST', body: { name: 'Blocked' } })).status, 401);
    assert.equal((await anon.site('/forge/api/pie', { method: 'POST', body: { sessionId: 'sess-unauth-1', op: 'snapshot' } })).status, 401);

    // Unauthenticated WebSocket upgrade through Hub proxy is rejected with 401.
    const wsUnauth = await openWs(f.siteOrigin.replace('http:', 'ws:') + '/forge/collaboration', { Origin: f.siteOrigin });
    assert.equal(wsUnauth.ok, false);
    assert.equal(wsUnauth.status, 401);

    // Spoofed identity/internal/Bearer headers are rejected (proxy strips X-PlayHub-*/X-Forwarded-*, Forge rejects Authorization).
    const spoofed = await anon.site('/forge/api/platform/projects', {
      headers: {
        Authorization: 'Bearer forged-token',
        'X-PlayHub-User': 'admin',
        'X-PlayHub-Account-Key': 'a'.repeat(64),
        'X-PlayHub-Internal-Secret': INTERNAL_SECRET,
        'X-Forwarded-User': 'alice',
      },
    });
    assert.equal(spoofed.status, 401);

    // Guest Hub session (no Google login) cannot access Forge.
    const guest = f.newBrowser();
    await guest.hubApi('/api/session');
    assert.equal((await guest.hubApi('/api/play-sessions', { method: 'POST', body: { gameId: 'test-puzzle' } })).status, 201);
    assert.equal(guest.cookieHeaderFor('/forge/OfficialGodot/'), '');
    assert.equal((await guest.site('/forge/api/platform/projects')).status, 401);
    // Even if guest manually replays poc_public_session cookie to /forge/*, Hub rejects it as GOOGLE_LOGIN_REQUIRED.
    const guestApiCookie = guest.cookieHeaderFor('/api/session');
    const guestReplay = await guest.site('/forge/api/platform/projects', { headers: { Cookie: guestApiCookie } });
    assert.equal(guestReplay.status, 401);
    assert.equal(guestReplay.data.error, 'GOOGLE_LOGIN_REQUIRED');

    // QA session cannot access Forge.
    const qa = f.newBrowser();
    await qa.hubApi('/api/session');
    assert.equal((await qa.hubApi('/api/qa/session', { method: 'POST', body: {} })).status, 201);
    const qaReplay = await qa.site('/forge/api/platform/projects', { headers: { Cookie: qa.cookieHeaderFor('/api/session') } });
    assert.equal(qaReplay.status, 401);

    // Admin session cookie cannot authenticate against Forge.
    const admin = new BrowserJar(f.hubAdminBase, 'http://127.0.0.1:18131');
    await admin.hubApi('/api/admin/session');
    assert.equal((await admin.hubApi('/api/admin/login', { method: 'POST', body: { username: 'admin', password: ADMIN_PASSWORD } })).status, 200);
    const adminOnForge = await anon.site('/forge/api/platform/projects', { headers: { Cookie: admin.cookieHeaderFor('/api/admin/session') } });
    assert.equal(adminOnForge.status, 401);
  });

  await t.test('legacy PrivateAccount paths redirect to Hub account screen and /internal/session/verify is isolated', async () => {
    const anon = f.newBrowser();
    for (const legacy of ['/forge/PrivateAccount/', '/forge/PrivateAccount/index.html', '/forge/account', '/forge/account/']) {
      const res = await anon.site(legacy);
      assert.equal(res.status, 302, legacy);
      assert.equal(res.headers.get('location'), '/?view=account');
    }

    // Internal verify endpoint is never mounted on publicServer.
    const onPublic = await fetch(`${f.hubPublicBase}/internal/session/verify`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    assert.equal(onPublic.status, 404);

    // Internal verify endpoint rejects browser Origin header and wrong internal secret.
    const withOrigin = await fetch(f.verifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: f.siteOrigin, 'X-PlayHub-Internal-Secret': INTERNAL_SECRET },
      body: JSON.stringify({ cookie: '' }),
    });
    assert.equal(withOrigin.status, 403);

    const wrongSecret = await fetch(f.verifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-PlayHub-Internal-Secret': 'wrong-secret' },
      body: JSON.stringify({ cookie: '' }),
    });
    assert.equal(wrongSecret.status, 403);
  });

  const alice = f.newBrowser();
  const bob = f.newBrowser();
  let aliceProjectId;
  let aliceAccountKey;
  let aliceBuildId;

  await t.test('Hub Google login issues /api + /forge cookies (never /games) and grants CSRF-protected /forge/* access', async () => {
    const callback = await f.loginGoogle(alice, { sub: 'google-alice-001', name: 'Alice' });
    const publicCookie = callback.setCookies.find(c => c.name === 'poc_public_session');
    const forgeCookie = callback.setCookies.find(c => c.name === 'poc_forge_session');
    assert.ok(publicCookie && publicCookie.attrs.path === '/api' && publicCookie.attrs.httponly);
    assert.ok(forgeCookie && forgeCookie.attrs.path === '/forge' && forgeCookie.attrs.httponly);
    assert.equal(alice.cookieHeaderFor('/games/test-puzzle/index.html'), '');

    // /forge base path redirects and static entry points work under /forge/*.
    const slashForge = await alice.site('/forge');
    assert.equal(slashForge.status, 308);
    assert.equal(slashForge.headers.get('location'), '/forge/');

    const slashEditor = await alice.site('/forge/OfficialGodot');
    assert.equal(slashEditor.status, 308);
    assert.equal(slashEditor.headers.get('location'), '/forge/OfficialGodot/');

    for (const route of ['/forge/OfficialGodot/', '/forge/Studio/', '/forge/StudioGodot/', '/forge/Frontends/']) {
      const page = await alice.site(route);
      assert.equal(page.status, 200, route);
      assert.equal(page.headers.get('cross-origin-opener-policy'), 'same-origin');
      assert.equal(page.headers.get('cross-origin-embedder-policy'), 'require-corp');
    }

    const session = await alice.site('/forge/api/session');
    assert.equal(session.status, 200);
    assert.equal(session.data.authenticated, true);
    assert.equal(session.data.displayName, 'Alice');
    assert.match(session.data.accountKey, /^[a-f0-9]{64}$/);
    assert.ok(session.data.csrfToken);
    aliceAccountKey = session.data.accountKey;

    // Writes require Hub CSRF token and allowed Origin.
    assert.equal((await alice.site('/forge/api/platform/projects', { method: 'POST', body: { name: 'No CSRF' }, csrf: false })).status, 403);
    assert.equal((await alice.site('/forge/api/platform/projects', { method: 'POST', body: { name: 'Bad Origin' }, origin: 'https://evil.invalid' })).status, 403);

    const created = await alice.site('/forge/api/platform/projects', { method: 'POST', body: { name: 'Alice Private Game', template: 'blank3d' } });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    aliceProjectId = created.data.project.id;

    // Verify stored under Hub-compatible per-account directory.
    const accountStore = new PlatformStore(path.join(REPO_ROOT, 'forge'), path.join(f.accountsDir, aliceAccountKey));
    assert.equal(accountStore.getProject(aliceProjectId).name, 'Alice Private Game');

    // Studio PUT + Collaboration WebSocket work through /forge/* proxy.
    const initialStudio = await alice.site('/forge/api/project');
    assert.equal(initialStudio.status, 200);
    const updatedSource = initialStudio.data.source + '\n# alice-private-marker\n';
    const savedStudio = await alice.site('/forge/api/editor/source', {
      method: 'PUT',
      body: { source: updatedSource, baseRevision: initialStudio.data.revision },
    });
    assert.equal(savedStudio.status, 200, JSON.stringify(savedStudio.data));

    const wsAlice = await openWs(f.siteOrigin.replace('http:', 'ws:') + '/forge/collaboration', {
      Origin: f.siteOrigin,
      Cookie: alice.cookieHeaderFor('/forge/collaboration'),
    });
    assert.equal(wsAlice.ok, true, JSON.stringify(wsAlice));
    f.openSockets.push(wsAlice.ws);
    const welcomeAlice = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Alice collaboration welcome timeout')), 3000);
      wsAlice.ws.on('message', raw => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'welcome') { clearTimeout(timer); resolve(msg); }
      });
      wsAlice.ws.send(JSON.stringify({ type: 'join', clientId: 'alice-collab-001', name: 'Alice' }));
    });
    assert.match(welcomeAlice.document.source, /# alice-private-marker/);

    // Seed a succeeded build owned by Alice so we can verify build isolation without running Godot export.
    // Release validation checks the canonical source hash and the package hash (OwnedBuildPackages).
    aliceBuildId = 'a1b2c3d4e5f60708';
    const buildOut = path.join(f.buildDir, aliceBuildId, 'output');
    fs.mkdirSync(buildOut, { recursive: true });
    fs.writeFileSync(path.join(buildOut, 'index.html'), '<!doctype html><html><body>Alice Build</body></html>');
    const packageBytes = Buffer.from('alice-build-package-fixture');
    fs.writeFileSync(path.join(buildOut, 'PlayForge-Web.zip'), packageBytes);
    const sourceFiles = Object.entries(accountStore.read(aliceProjectId).history.find(r => r.revision === 1).files)
      .sort(([a], [b]) => a.localeCompare(b, 'en')).map(([filePath, content]) => ({ path: filePath, content }));
    const sha256 = data => createHash('sha256').update(data).digest('hex');
    fs.writeFileSync(path.join(f.buildDir, aliceBuildId, 'result.json'), JSON.stringify({
      id: aliceBuildId, projectId: aliceProjectId, revision: 1, ownerKey: aliceAccountKey,
      target: 'web', status: 'succeeded', files: ['index.html', 'PlayForge-Web.zip'],
      sourceHash: sha256(JSON.stringify(sourceFiles)), artifactSha256: sha256(packageBytes),
      previewUrl: `/api/builds/${aliceBuildId}/files/index.html`,
    }));
    // A build whose source hash does not match the revision is rejected for release.
    const forgedBuildId = 'f0f0f0f0f0f0f0f0';
    fs.mkdirSync(path.join(f.buildDir, forgedBuildId, 'output'), { recursive: true });
    fs.writeFileSync(path.join(f.buildDir, forgedBuildId, 'output', 'PlayForge-Web.zip'), packageBytes);
    fs.writeFileSync(path.join(f.buildDir, forgedBuildId, 'result.json'), JSON.stringify({
      id: forgedBuildId, projectId: aliceProjectId, revision: 1, ownerKey: aliceAccountKey,
      target: 'web', status: 'succeeded', files: ['PlayForge-Web.zip'],
      sourceHash: '0'.repeat(64), artifactSha256: sha256(packageBytes),
    }));
    const forgedRelease = await alice.site(`/forge/api/platform/projects/${aliceProjectId}/releases`, {
      method: 'POST',
      body: { revision: 1, buildId: forgedBuildId, label: 'forged' },
    });
    assert.equal(forgedRelease.status, 409, JSON.stringify(forgedRelease.data));
    const release = await alice.site(`/forge/api/platform/projects/${aliceProjectId}/releases`, {
      method: 'POST',
      body: { revision: 1, buildId: aliceBuildId, label: 'v1' },
    });
    assert.equal(release.status, 201, JSON.stringify(release.data));

    const playRedirect = await alice.site(`/forge/play/${aliceProjectId}`);
    assert.equal(playRedirect.status, 302);
    assert.equal(playRedirect.headers.get('location'), `/forge/api/builds/${aliceBuildId}/files/index.html`);

    const buildFile = await alice.site(`/forge/api/builds/${aliceBuildId}/files/index.html`);
    assert.equal(buildFile.status, 200);
    assert.match(buildFile.text, /Alice Build/);
  });

  await t.test('cross-account isolation blocks Bob from Alice projects, builds, Studio docs, collaboration and runtime sessions', async () => {
    await f.loginGoogle(bob, { sub: 'google-bob-002', name: 'Bob' });
    const bobSession = await bob.site('/forge/api/session');
    assert.equal(bobSession.status, 200);
    assert.notEqual(bobSession.data.accountKey, aliceAccountKey);

    const bobProjects = await bob.site('/forge/api/platform/projects');
    assert.equal(bobProjects.status, 200);
    assert.deepEqual(bobProjects.data.projects, []);

    assert.equal((await bob.site(`/forge/api/platform/projects/${aliceProjectId}`)).status, 404);
    assert.equal((await bob.site(`/forge/api/platform/projects/${aliceProjectId}`, {
      method: 'PUT', body: { baseRevision: 1, files: [] },
    })).status, 404);
    assert.equal((await bob.site(`/forge/api/platform-builds/${aliceProjectId}`, {
      method: 'POST', body: { revision: 1 },
    })).status, 404);
    assert.equal((await bob.site(`/forge/play/${aliceProjectId}`)).status, 404);
    assert.equal((await bob.site(`/forge/api/builds/${aliceBuildId}`)).status, 404);
    assert.equal((await bob.site(`/forge/api/builds/${aliceBuildId}/files/index.html`)).status, 404);

    // Bob cannot see Alice's Studio document via HTTP or WebSocket collaboration.
    const bobStudio = await bob.site('/forge/api/project');
    assert.equal(bobStudio.status, 200);
    assert.doesNotMatch(bobStudio.data.source, /# alice-private-marker/);

    const wsBob = await openWs(f.siteOrigin.replace('http:', 'ws:') + '/forge/collaboration', {
      Origin: f.siteOrigin,
      Cookie: bob.cookieHeaderFor('/forge/collaboration'),
    });
    assert.equal(wsBob.ok, true);
    f.openSockets.push(wsBob.ws);
    const welcomeBob = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Bob collaboration welcome timeout')), 3000);
      wsBob.ws.on('message', raw => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'welcome') { clearTimeout(timer); resolve(msg); }
      });
      wsBob.ws.send(JSON.stringify({ type: 'join', clientId: 'bob-collab-001', name: 'Bob' }));
    });
    assert.doesNotMatch(welcomeBob.document.source, /# alice-private-marker/);

    // P0 execution allowlist: unset in this fixture, so no account may run builds or PIE (fail closed).
    for (const [route, body] of [
      [`/forge/api/platform-builds/${aliceProjectId}`, { revision: 1 }],
      ['/forge/api/builds', { target: 'web', revision: 1 }],
      ['/forge/api/pie', { sessionId: 'alice-pie-session-1', op: 'load', source: 'extends Node', settings: {} }],
    ]) {
      const denied = await alice.site(route, { method: 'POST', body });
      assert.equal(denied.status, 403, `${route}: ${JSON.stringify(denied.data)}`);
      assert.equal(denied.data.error, 'EXECUTION_NOT_ALLOWED');
    }

    // Bob cannot inspect or control a runtime session ID outside Bob's account scope.
    const bobPie = await bob.site('/forge/api/pie', {
      method: 'POST', body: { sessionId: 'alice-pie-session-1', op: 'snapshot' },
    });
    assert.equal(bobPie.status, 409);
  });

  await t.test('Hub logout clears both cookies and immediately revokes Forge HTTP and WebSocket access', async () => {
    const staleForgeCookie = alice.cookieHeaderFor('/forge/OfficialGodot/');
    const staleCsrf = alice.csrf;
    assert.match(staleForgeCookie, /poc_forge_session=/);

    const logout = await alice.hubApi('/api/auth/logout', { method: 'POST', body: {} });
    assert.equal(logout.status, 200);
    const clearedPublic = logout.setCookies.find(c => c.name === 'poc_public_session');
    const clearedForge = logout.setCookies.find(c => c.name === 'poc_forge_session');
    assert.equal(clearedPublic?.attrs.path, '/api');
    assert.equal(clearedPublic?.attrs['max-age'], '0');
    assert.equal(clearedForge?.attrs.path, '/forge');
    assert.equal(clearedForge?.attrs['max-age'], '0');

    // Replaying the old poc_forge_session cookie immediately fails with 401.
    assert.equal((await alice.site('/forge/OfficialGodot/', { headers: { Cookie: staleForgeCookie } })).status, 401);
    assert.equal((await alice.site('/forge/api/session', { headers: { Cookie: staleForgeCookie } })).status, 401);
    assert.equal((await alice.site('/forge/api/platform/projects', { headers: { Cookie: staleForgeCookie } })).status, 401);
    assert.equal((await alice.site('/forge/api/platform/projects', {
      method: 'POST', body: { name: 'After Logout' },
      headers: { Cookie: staleForgeCookie, 'X-CSRF-Token': staleCsrf },
    })).status, 401);

    const wsStale = await openWs(f.siteOrigin.replace('http:', 'ws:') + '/forge/collaboration', {
      Origin: f.siteOrigin,
      Cookie: staleForgeCookie,
    });
    assert.equal(wsStale.ok, false);
    assert.equal(wsStale.status, 401);
  });

  await t.test('Forge fails closed (503) when Hub internal verify endpoint is unreachable', async () => {
    const closedForge = createForgeServer({
      basePath: '/forge',
      hubAuth: { verifyUrl: 'http://127.0.0.1:1/internal/session/verify', timeoutMs: 500 },
    });
    const closedPort = await listen(closedForge);
    t.after(() => closeServer(closedForge));

    const res = await fetch(`http://127.0.0.1:${closedPort}/forge/api/platform/projects`, {
      headers: { Cookie: 'poc_forge_session=some-token' },
    });
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.error, 'AUTH_SERVICE_UNAVAILABLE');
  });
});
