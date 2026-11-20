import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server/app.mjs';
import { createCreatorReview } from '../server/creator-review.mjs';
import { openDatabase } from '../server/db.mjs';
import { createHubForge, forgeAccountKey } from '../server/forge-account.mjs';
import { createForgeGateway, createLocalForgeGateway, createRemoteForgeGateway } from '../server/forge-gateway.mjs';
import { ApiError, uid } from '../server/security.mjs';
import { createForgeProxy } from '../tools/forge-proxy.mjs';

const require = createRequire(import.meta.url);
const { createServer: createForgeServer } = require('../../forge/server.cjs');
const { createInternalApi } = require('../../forge/Tools/internal-api.cjs');
const { zipFiles } = require('../../forge/Tools/export-godot-project.cjs');

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SECRET = 'internal-forge-gateway-secret-0123456789abcdef';
const PREV_SECRET = 'previous-forge-gateway-secret-0123456789abcdef';
const CSRF = 'gateway-csrf-token';
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

const listen = server => new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => resolve(server.address().port));
});
const closeServer = server => new Promise(resolve => {
  if (!server) return resolve();
  server.closeAllConnections?.();
  server.close(() => resolve());
});

test('S4 gateway configuration enforces HTTPS for non-loopback and strong shared secrets', () => {
  assert.throws(
    () => createRemoteForgeGateway({ config: { enabled: true, baseUrl: 'http://forge.internal', internalSecret: SECRET } }),
    err => err.status === 503 && err.code === 'FORGE_HTTPS_REQUIRED'
  );
  assert.throws(
    () => createRemoteForgeGateway({ config: { enabled: true, baseUrl: 'https://forge.internal', internalSecret: 'too-short' } }),
    err => err.status === 503 && err.code === 'FORGE_INTERNAL_SECRET_REQUIRED'
  );
  assert.throws(
    () => createRemoteForgeGateway({ config: { enabled: true, baseUrl: 'https://user:pw@forge.internal', internalSecret: SECRET } }),
    err => err.status === 503 && err.code === 'FORGE_CONFIGURATION_REQUIRED'
  );
  assert.throws(
    () => createForgeGateway({ config: { mode: 'invalid-mode' } }),
    err => err.status === 503 && err.code === 'INVALID_FORGE_GATEWAY_MODE'
  );
  const gw = createRemoteForgeGateway({ config: { enabled: true, baseUrl: 'https://forge.internal', internalSecret: SECRET } });
  assert.equal(gw.mode, 'remote');
  gw.close();
});

test('S3 Forge internal API enforces secret, rotation, Origin block, accountKey format, basePath isolation and idempotency', async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-internal-api-'));
  const forgeStorage = path.join(temp, 'forge-storage');
  const accountsDir = path.join(forgeStorage, 'accounts');
  const buildDir = path.join(temp, 'forge-builds');

  // 1. Fail-closed when no secret is configured on Forge.
  const unconfigured = createInternalApi({ root: REPO_ROOT, directory: forgeStorage, internalSecret: '' });
  const unconfiguredServer = http.createServer(async (req, res) => {
    if (!await unconfigured.handle(req, res)) res.writeHead(404).end();
  });
  const unconfiguredPort = await listen(unconfiguredServer);

  // 2. Real Forge server with basePath: '/forge' and internal API enabled.
  const forgeServer = createForgeServer({
    publicOrigin: 'http://127.0.0.1:18080',
    basePath: '/forge',
    buildDirectory: buildDir,
    hubAuth: {
      verifyUrl: 'http://127.0.0.1:9/internal/session/verify',
      internalSecret: SECRET,
      accountsDirectory: accountsDir,
      studioDirectory: path.join(forgeStorage, 'studios'),
    },
    internalApi: {
      directory: forgeStorage,
      internalSecret: SECRET,
      previousInternalSecret: PREV_SECRET,
    },
  });
  const forgePort = await listen(forgeServer);

  // 3. Hub proxy (/forge/*) in front of Forge.
  const proxy = createForgeProxy({ upstream: `http://127.0.0.1:${forgePort}`, basePath: '/forge' });
  const proxyServer = http.createServer((req, res) => {
    if (proxy.matches(new URL(req.url, 'http://localhost').pathname)) return proxy.handle(req, res);
    res.writeHead(404).end();
  });
  const proxyPort = await listen(proxyServer);

  t.after(async () => {
    proxy.close();
    await closeServer(proxyServer);
    forgeServer.shutdown();
    await closeServer(unconfiguredServer);
    unconfigured.close();
    fs.rmSync(temp, { recursive: true, force: true });
  });

  const aliceKey = forgeAccountKey({ iss: 'https://accounts.google.com', sub: 'alice-internal-test' });
  const base = `http://127.0.0.1:${forgePort}`;

  // Fail-closed without configured secret.
  const disabledRes = await fetch(`http://127.0.0.1:${unconfiguredPort}/internal/v1/admin/snapshot`);
  assert.equal(disabledRes.status, 503);
  assert.equal((await disabledRes.json()).error, 'INTERNAL_API_DISABLED');

  // Public /forge/internal/* is blocked at both proxy and Forge basePath handler (404).
  const viaProxy = await fetch(`http://127.0.0.1:${proxyPort}/forge/internal/v1/admin/snapshot`, {
    headers: { 'X-PlayHub-Internal-Secret': SECRET },
  });
  assert.equal(viaProxy.status, 404);
  const viaBasePath = await fetch(`${base}/forge/internal/v1/admin/snapshot`, {
    headers: { 'X-PlayHub-Internal-Secret': SECRET },
  });
  assert.equal(viaBasePath.status, 404);

  // Missing or wrong secret -> 403 INTERNAL_SECRET_INVALID.
  assert.equal((await fetch(`${base}/internal/v1/admin/snapshot`)).status, 403);
  const wrongSecret = await fetch(`${base}/internal/v1/admin/snapshot`, {
    headers: { 'X-PlayHub-Internal-Secret': 'wrong-secret' },
  });
  assert.equal(wrongSecret.status, 403);
  assert.equal((await wrongSecret.json()).error, 'INTERNAL_SECRET_INVALID');

  // Previous secret is accepted during rotation window.
  const prevSecretRes = await fetch(`${base}/internal/v1/admin/snapshot`, {
    headers: { 'X-PlayHub-Internal-Secret': PREV_SECRET },
  });
  assert.equal(prevSecretRes.status, 200);

  // Browser Origin header is rejected even with valid secret.
  const withOrigin = await fetch(`${base}/internal/v1/admin/snapshot`, {
    headers: { 'X-PlayHub-Internal-Secret': SECRET, Origin: 'http://127.0.0.1:18080' },
  });
  assert.equal(withOrigin.status, 403);
  assert.equal((await withOrigin.json()).error, 'ORIGIN_NOT_ALLOWED');

  // Invalid accountKey format is rejected with 400.
  for (const badKey of ['not-hex', 'a'.repeat(63), 'A'.repeat(64)]) {
    const res = await fetch(`${base}/internal/v1/accounts/${badKey}/platform/projects`, {
      headers: { 'X-PlayHub-Internal-Secret': SECRET },
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, 'INVALID_ACCOUNT_KEY');
  }

  // Idempotency-Key: same key + same body replays 201 without creating a duplicate project; different body -> 409.
  const createUrl = `${base}/internal/v1/accounts/${aliceKey}/platform/projects`;
  const firstCreate = await fetch(createUrl, {
    method: 'POST',
    headers: {
      'X-PlayHub-Internal-Secret': SECRET,
      'Content-Type': 'application/json',
      'Idempotency-Key': 'idem-create-project-1',
    },
    body: JSON.stringify({ name: 'Idempotent Game', template: 'blank3d' }),
  });
  assert.equal(firstCreate.status, 201);
  const firstData = await firstCreate.json();

  const replayCreate = await fetch(createUrl, {
    method: 'POST',
    headers: {
      'X-PlayHub-Internal-Secret': SECRET,
      'Content-Type': 'application/json',
      'Idempotency-Key': 'idem-create-project-1',
    },
    body: JSON.stringify({ name: 'Idempotent Game', template: 'blank3d' }),
  });
  assert.equal(replayCreate.status, 201);
  assert.equal(replayCreate.headers.get('x-idempotent-replay'), 'true');
  const replayData = await replayCreate.json();
  assert.equal(replayData.project.id, firstData.project.id);

  const conflictCreate = await fetch(createUrl, {
    method: 'POST',
    headers: {
      'X-PlayHub-Internal-Secret': SECRET,
      'Content-Type': 'application/json',
      'Idempotency-Key': 'idem-create-project-1',
    },
    body: JSON.stringify({ name: 'Different Payload', template: 'blank3d' }),
  });
  assert.equal(conflictCreate.status, 409);
  assert.equal((await conflictCreate.json()).error, 'IDEMPOTENCY_KEY_CONFLICT');

  const listRes = await fetch(createUrl, {
    headers: { 'X-PlayHub-Internal-Secret': SECRET },
  });
  assert.equal((await listRes.json()).projects.length, 1);
});

test('S3 & S4 contract parity: local and remote ForgeGateway behave identically across project, build, release, review, archive and admin snapshot', async t => {
  for (const mode of ['local', 'remote']) {
    await t.test(`gateway mode: ${mode}`, async t => {
      const temp = fs.mkdtempSync(path.join(os.tmpdir(), `forge-gw-${mode}-`));
      // In remote mode, Hub and Forge have completely separate directories (zero disk sharing).
      const forgePrivateDir = path.join(temp, 'forge-private');
      const forgeAccountsDir = path.join(forgePrivateDir, 'accounts');
      let remoteServer = null;
      let baseUrl = null;

      let driveMeta = null;
      let driveRemoteBytes = null;
      const driveFetch = async (url, options = {}) => {
        const u = new URL(url);
        if (u.hostname === 'oauth2.googleapis.com') {
          return Response.json({ access_token: 'drive-token', expires_in: 3600, token_type: 'Bearer' });
        }
        if (u.pathname.endsWith('/generateIds')) {
          return Response.json({ ids: ['driveFileId001'] });
        }
        if (u.pathname === '/upload/drive/v3/files' && options.method === 'POST') {
          if (typeof options.body === 'string') {
            driveMeta = JSON.parse(options.body);
            return new Response(null, { status: 200, headers: { location: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=zip1' } });
          }
          const raw = Buffer.from(options.body).toString('utf8');
          const parts = raw.split(/\r\n--pf_[a-f0-9]+(?:\r\n|--\r\n)/);
          driveMeta = JSON.parse(parts[0].split('\r\n\r\n')[1]);
          driveRemoteBytes = Buffer.from(parts[1].split('\r\n\r\n')[1]);
          return Response.json({ id: 'driveFileId001' });
        }
        if (options.method === 'PUT') {
          driveRemoteBytes = Buffer.from(options.body);
          return Response.json({ id: 'driveFileId001' });
        }
        if (u.searchParams.get('alt') === 'media') {
          return new Response(driveRemoteBytes);
        }
        return Response.json({ ...driveMeta, id: 'driveFileId001', size: String(driveRemoteBytes.length), trashed: false });
      };

      const driveEnv = {
        PLAYHUB_DRIVE_CLIENT_ID: 'cid',
        PLAYHUB_DRIVE_CLIENT_SECRET: 'csec',
        PLAYHUB_DRIVE_REFRESH_TOKEN: 'rtok',
      };

      if (mode === 'remote') {
        remoteServer = createForgeServer({
          publicOrigin: 'https://playhub.remote.test',
          buildDirectory: path.join(temp, 'forge-queue-builds'),
          hubAuth: {
            verifyUrl: 'http://127.0.0.1:9/internal/session/verify',
            internalSecret: SECRET,
            accountsDirectory: forgeAccountsDir,
            studioDirectory: path.join(forgePrivateDir, 'studios'),
          },
          internalApi: {
            directory: forgePrivateDir,
            internalSecret: SECRET,
            useDirectoryBuilds: true,
            builds: { enabled: true },
            drive: { enabled: true, folderId: 'snapshotsFolder', packageFolderId: 'packagesFolder' },
            packages: { enabled: true },
            env: driveEnv,
            fetchImpl: driveFetch,
          },
        });
        const port = await listen(remoteServer);
        baseUrl = `http://127.0.0.1:${port}`;
      }

      const gateway = createForgeGateway({
        config: mode === 'local'
          ? {
              mode: 'local',
              enabled: true,
              directory: forgePrivateDir,
              builds: { enabled: true },
              drive: { enabled: true, folderId: 'snapshotsFolder', packageFolderId: 'packagesFolder' },
              packages: { enabled: true },
            }
          : {
              mode: 'remote',
              enabled: true,
              baseUrl,
              internalSecret: SECRET,
            },
        root: REPO_ROOT,
        env: driveEnv,
        fetchImpl: mode === 'local' ? driveFetch : globalThis.fetch,
      });
      assert.equal(gateway.mode, mode);

      const db = openDatabase(path.join(temp, 'hub-db'));
      let stamp = 1780000000000;
      const now = () => ++stamp;
      for (const [id, name] of [['alice', 'Alice'], ['bob', 'Bob'], ['guest', null]]) {
        db.prepare('INSERT INTO users VALUES (?,?,?,?)').run(id, id === 'guest' ? 'guest' : 'registered', name, now());
      }
      for (const id of ['alice', 'bob']) {
        db.prepare('INSERT INTO identities VALUES (?,?,?)').run('google', `sub-${id}`, id);
      }
      const sessions = new Map([
        ['alice', { kind: 'public', principal_id: 'alice', traffic_type: 'live', id_hash: 'h-alice', csrf: CSRF }],
        ['bob', { kind: 'public', principal_id: 'bob', traffic_type: 'live', id_hash: 'h-bob', csrf: CSRF }],
        ['guest', { kind: 'public', principal_id: 'guest', traffic_type: 'live', id_hash: 'h-guest', csrf: CSRF }],
        ['admin', { kind: 'admin', admin_authenticated: true, admin_username: 'admin', id_hash: 'h-admin', csrf: CSRF }],
      ]);
      const requireSession = (req, kind, adminRequired) => {
        const s = sessions.get(req.headers.cookie);
        if (!s || s.kind !== kind) throw new ApiError(401, 'SESSION_REQUIRED');
        if (adminRequired && !s.admin_authenticated) throw new ApiError(401, 'ADMIN_LOGIN_REQUIRED');
        if (req.method !== 'GET' && req.headers['x-csrf-token'] !== s.csrf) throw new ApiError(403, 'CSRF_INVALID');
        return s;
      };
      const audit = (action, target, detail) => db.prepare('INSERT INTO audit VALUES (?,?,?,?,?)')
        .run(uid(), action, target, JSON.stringify(detail), now());

      const hubForge = createHubForge({ config: { enabled: true }, db, requireSession, gateway });
      const review = createCreatorReview({ config: { enabled: true }, db, requireSession, now, audit, forgeGateway: gateway });

      const hubServer = http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://localhost');
        try {
          if (await review.publicRoute(req, res, url)) return;
          if (await review.adminRoute(req, res, url)) return;
          if (await hubForge.handle(req, res, url)) return;
          res.writeHead(404).end();
        } catch (err) {
          const status = err instanceof ApiError ? err.status : 500;
          const code = err instanceof ApiError ? err.code : 'INTERNAL_ERROR';
          res.writeHead(status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { code } }));
        }
      });
      const hubPort = await listen(hubServer);

      t.after(async () => {
        hubForge.close();
        gateway.close();
        await closeServer(hubServer);
        remoteServer?.shutdown();
        db.close();
        fs.rmSync(temp, { recursive: true, force: true });
      });

      const call = async (who, route, method = 'GET', body) => {
        const res = await fetch(`http://127.0.0.1:${hubPort}${route}`, {
          method,
          headers: {
            cookie: who,
            ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
            ...(method !== 'GET' ? { 'x-csrf-token': CSRF } : {}),
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        return { status: res.status, body: await res.json().catch(() => null) };
      };

      // 1. Create project & update file through Hub's /api/platform/*
      const created = await call('alice', '/api/platform/projects', 'POST', { name: 'Gateway Parity Game', template: 'blank3d' });
      assert.equal(created.status, 201);
      const projectId = created.body.project.id;

      const updated = await call('alice', `/api/platform/projects/${projectId}`, 'PUT', {
        baseRevision: 1,
        files: [{ path: 'README.md', content: '# Parity Test' }],
      });
      assert.equal(updated.status, 200);
      assert.equal(updated.body.revision, 2);

      // 2. Cross-account isolation on /api/platform/*
      assert.equal((await call('bob', `/api/platform/projects/${projectId}`)).status, 404);
      assert.deepEqual(await call('bob', `/api/platform/projects/${projectId}/builds`, 'POST', {}), {
        status: 404,
        body: { error: 'ACCESS_DENIED' },
      });

      // 3. P0 execution allowlist blocks build execution when account is not allowlisted
      assert.deepEqual(await call('alice', `/api/platform/projects/${projectId}/builds`, 'POST', {}), {
        status: 403,
        body: { error: 'ACCESS_DENIED' },
      });

      // 4. Seed a verified build artifact for revision 2 on Forge's storage and publish a release
      const aliceKey = forgeAccountKey({ iss: 'https://accounts.google.com', sub: 'sub-alice' });
      const buildId = '1122334455667788';
      const zipBytes = zipFiles([
        ['index.html', Buffer.from('<!doctype html><html><body>Parity Build</body></html>')],
        ['index.wasm', Buffer.from('wasm-bytes')],
        ['index.pck', Buffer.from('pck-bytes')],
      ]);
      const projectJson = JSON.parse(fs.readFileSync(path.join(forgeAccountsDir, aliceKey, 'projects', projectId, 'project.json'), 'utf8'));
      const rev2Files = Object.entries(projectJson.history.find(h => h.revision === 2).files)
        .sort(([a], [b]) => a.localeCompare(b, 'en'))
        .map(([p, content]) => ({ path: p, content }));
      const buildOutDir = path.join(forgePrivateDir, 'builds', aliceKey, buildId, 'output');
      fs.mkdirSync(buildOutDir, { recursive: true });
      fs.writeFileSync(path.join(buildOutDir, 'PlayForge-Web.zip'), zipBytes);
      fs.writeFileSync(path.join(forgePrivateDir, 'builds', aliceKey, buildId, 'result.json'), JSON.stringify({
        id: buildId,
        projectId,
        revision: 2,
        ownerKey: aliceKey,
        target: 'web',
        status: 'succeeded',
        files: ['index.html', 'PlayForge-Web.zip'],
        sourceHash: sha256(JSON.stringify(rev2Files)),
        artifactSha256: sha256(zipBytes),
      }));

      const buildStatus = await call('alice', `/api/platform/projects/${projectId}/builds/${buildId}`);
      assert.equal(buildStatus.status, 200);
      assert.equal(buildStatus.body.build.buildId, buildId);
      assert.equal(buildStatus.body.build.status, 'succeeded');

      const releaseRes = await call('alice', `/api/platform/projects/${projectId}/releases`, 'POST', {
        revision: 2,
        buildId,
        label: 'v1.0-parity',
      });
      assert.equal(releaseRes.status, 201);
      const releaseId = releaseRes.body.release.id;

      // 5. Creator submission review pins the release via gateway.getRelease()
      const bobSub = await call('bob', '/api/creator/submissions', 'POST', {
        projectId, releaseId, title: 'Spoof', description: 'Spoof',
      });
      assert.equal(bobSub.status, 404);
      assert.equal(bobSub.body.error.code, 'RELEASE_NOT_FOUND');

      const draftSub = await call('alice', '/api/creator/submissions', 'POST', {
        projectId, releaseId, title: 'Parity Game', description: 'Verified via gateway',
      });
      assert.equal(draftSub.status, 201);
      assert.equal(draftSub.body.submission.releaseRevision, 2);
      const subId = draftSub.body.submission.id;

      const submitted = await call('alice', `/api/creator/submissions/${subId}/submit`, 'POST', {
        revision: draftSub.body.submission.revision,
      });
      assert.equal(submitted.status, 200);
      assert.equal(submitted.body.submission.status, 'in_review');

      const approved = await call('admin', `/api/admin/submissions/${subId}/decision`, 'POST', {
        revision: submitted.body.submission.revision,
        decision: 'approved',
      });
      assert.equal(approved.status, 200);
      assert.equal(approved.body.submission.status, 'approved');

      // 6. Deployment ZIP archive & status work identically through gateway
      const deployed = await call('alice', `/api/platform/projects/${projectId}/deployments/${releaseId}`, 'POST', {});
      assert.equal(deployed.status, 200);
      assert.equal(deployed.body.cloudVerified, true);
      assert.equal(deployed.body.artifactType, 'deployment-zip');

      const deployStat = await call('alice', `/api/platform/projects/${projectId}/deployments/${releaseId}`);
      assert.equal(deployStat.status, 200);
      assert.equal(deployStat.body.state, 'committed');

      // 7. Admin snapshot returns templates, projects (with truncated ownerKeyPrefix), builds and driveSync
      const snapshot = await gateway.adminSnapshot();
      assert.ok(snapshot.templates.length >= 4);
      assert.equal(snapshot.projects.length, 1);
      assert.equal(snapshot.projects[0].projectId, projectId);
      assert.equal(snapshot.projects[0].ownerKeyPrefix, aliceKey.slice(0, 12));
      assert.equal(snapshot.projects[0].ownerKeyPrefix.length, 12);
      assert.equal(snapshot.projects[0].revision, 2);
      assert.equal(snapshot.projects[0].releaseCount, 1);
      assert.equal(snapshot.driveSync.deployments.committed, 1);
    });
  }
});

test('S4 fault tolerance: when remote Forge is down, Hub fails closed (503) on Forge routes while Hub catalog/health stay up', async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-forge-fault-'));
  const siteRoot = path.join(temp, 'hub-root');
  const gameDir = path.join(siteRoot, 'games', 'fixture-game');
  fs.mkdirSync(gameDir, { recursive: true });
  fs.mkdirSync(path.join(siteRoot, 'catalog'), { recursive: true });
  fs.writeFileSync(path.join(gameDir, 'game.manifest.json'), JSON.stringify({ id: 'fixture-game', entry: 'index.html', title: 'Fixture' }));
  fs.writeFileSync(path.join(siteRoot, 'catalog', 'games.json'), JSON.stringify({
    schemaVersion: 1,
    entries: [{ id: 'fixture-game', path: 'games/fixture-game', enabled: true }],
  }));

  const app = createApp({
    dataDir: path.join(temp, 'data'),
    publicPort: 0,
    adminPort: 0,
    secureCookies: true,
    userBaseUrl: 'https://playhub.fault.test',
    adminBaseUrl: 'http://127.0.0.1:8081',
    userOrigins: ['https://playhub.fault.test'],
    adminOrigins: ['http://127.0.0.1:8081'],
    forge: {
      enabled: true,
      mode: 'remote',
      baseUrl: 'http://127.0.0.1:1',
      internalSecret: SECRET,
      timeoutMs: 400,
    },
  }, { rootDir: siteRoot, platformRoot: REPO_ROOT, env: {} });

  t.after(async () => {
    await app.close();
    fs.rmSync(temp, { recursive: true, force: true });
  });

  // Seed a registered Google user session in Hub DB.
  const userId = uid();
  const stamp = Date.now();
  const token = 'fault-session-token';
  const tokenHash = sha256(token);
  app.db.prepare('INSERT INTO users VALUES (?,?,?,?)').run(userId, 'registered', 'Alice', stamp);
  app.db.prepare('INSERT INTO identities VALUES (?,?,?)').run('google', 'google-sub-alice', userId);
  app.db.prepare(`INSERT INTO sessions
    (id_hash,kind,principal_id,analytics_subject,csrf,admin_authenticated,admin_username,created_at,expires_at,traffic_type,qa_run_id)
    VALUES (?,?,?,?,?,0,NULL,?,?,?,NULL)`)
    .run(tokenHash, 'public', userId, `u:${userId}`, CSRF, stamp, stamp + 3600000, 'live');

  async function invoke(handler, route, { method = 'GET', cookie = `poc_public_session=${token}`, body } = {}) {
    const req = new PassThrough();
    req.method = method;
    req.url = route;
    req.socket = { remoteAddress: '127.0.0.1' };
    req.headers = {
      host: 'playhub.fault.test',
      origin: 'https://playhub.fault.test',
      cookie,
      ...(method !== 'GET' ? { 'x-csrf-token': CSRF } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    };
    let raw = '';
    const res = {
      statusCode: 200,
      setHeader() {},
      getHeader() {},
      removeHeader() {},
      writeHead(code) { this.statusCode = code; },
      end(chunk) { if (chunk) raw += String(chunk); },
    };
    const p = handler(req, res);
    if (body !== undefined) req.end(JSON.stringify(body));
    else req.end();
    await p;
    return { status: res.statusCode, data: raw ? JSON.parse(raw) : null };
  }

  // Forge-dependent endpoints fail closed with 503 SERVICE_UNAVAILABLE.
  const platformRes = await invoke(app.publicHandler, '/api/platform/projects');
  assert.equal(platformRes.status, 503);
  assert.equal(platformRes.data.error, 'SERVICE_UNAVAILABLE');

  const submissionRes = await invoke(app.publicHandler, '/api/creator/submissions', {
    method: 'POST',
    body: { projectId: 'a'.repeat(24), releaseId: 'b'.repeat(24), title: 'Game', description: 'Desc' },
  });
  assert.equal(submissionRes.status, 503);
  assert.equal(submissionRes.data.error.code, 'SERVICE_UNAVAILABLE');

  // Hub's own health and catalog endpoints remain healthy (200).
  const healthRes = await invoke(app.publicHandler, '/api/health');
  assert.equal(healthRes.status, 200);
  assert.equal(healthRes.data.ok, true);

  const gamesRes = await invoke(app.publicHandler, '/api/games');
  assert.equal(gamesRes.status, 200);
  assert.equal(gamesRes.data.games.length, 1);
  assert.equal(gamesRes.data.games[0].id, 'fixture-game');
});
