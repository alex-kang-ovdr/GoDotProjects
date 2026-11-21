// End-to-end tests for Forge-Publish Phase A:
// Forge release + validated Web ZIP -> Hub preview/submission -> Admin approve & publish ->
// Composite catalog + isolated /play-ugc/ serving -> CAS v2 update -> 1s rollback -> Kill-Switch -> Remote gateway package stream.
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
import { forgeAccountKey } from '../server/forge-account.mjs';
import { createRemoteForgeGateway } from '../server/forge-gateway.mjs';
import { ADMIN_COOKIE, PUBLIC_COOKIE, digest, uid } from '../server/security.mjs';

const require = createRequire(import.meta.url);
const { PlatformStore } = require('../../forge/Tools/platform-store.cjs');
const { zipFiles } = require('../../forge/Tools/export-godot-project.cjs');
const { createInternalApi } = require('../../forge/Tools/internal-api.cjs');
const { buildReleaseManifest } = require('../../forge/Tools/release-manifest.cjs');

const HUB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(HUB_ROOT, '..');
const SHELL_JS = fs.readFileSync(path.join(REPO_ROOT, 'forge/Tools/playhub-godot-shell.js'), 'utf8');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

async function invoke(handler, { method = 'GET', url = '/', headers = {}, body = null } = {}) {
  const req = new PassThrough();
  req.method = method;
  req.url = url;
  req.headers = { host: '127.0.0.1', ...headers };
  req.socket = { remoteAddress: '127.0.0.1' };
  const chunks = [];
  const resHeaders = {};
  let resolveDone;
  const done = new Promise(resolve => { resolveDone = resolve; });
  const res = new PassThrough();
  res.statusCode = 200;
  res.writeHead = (code, hdrs = {}) => {
    res.statusCode = code;
    for (const [k, v] of Object.entries(hdrs)) resHeaders[k.toLowerCase()] = v;
    return res;
  };
  res.setHeader = (k, v) => { resHeaders[k.toLowerCase()] = v; };
  res.getHeader = k => resHeaders[k.toLowerCase()];
  res.removeHeader = k => { delete resHeaders[k.toLowerCase()]; };
  res.on('data', chunk => chunks.push(Buffer.from(chunk)));
  res.on('end', () => resolveDone());

  const promise = handler(req, res);
  if (body !== null && body !== undefined) {
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    if (!req.headers['content-type']) req.headers['content-type'] = 'application/json';
    req.headers['content-length'] = String(buf.length);
    req.end(buf);
  } else {
    req.end();
  }
  await Promise.all([promise, done]);
  const raw = Buffer.concat(chunks);
  let json = null;
  try { json = JSON.parse(raw.toString('utf8')); } catch {}
  return { status: res.statusCode, headers: resHeaders, buffer: raw, text: raw.toString('utf8'), json };
}

function seedSession(db, { kind = 'public', userId = null, googleSub = null, adminUsername = null, csrf = 'test-csrf-token' } = {}) {
  const stamp = Date.now();
  const token = crypto.randomBytes(16).toString('hex');
  if (kind === 'public' && googleSub) {
    userId = userId || uid();
    db.prepare('INSERT INTO users(id,kind,display_name,created_at) VALUES(?,?,?,?)').run(userId, 'registered', 'Creator Test', stamp);
    db.prepare('INSERT INTO identities(provider,subject,user_id) VALUES(?,?,?)').run('google', googleSub, userId);
  }
  db.prepare(`INSERT INTO sessions(id_hash,kind,principal_id,analytics_subject,csrf,admin_authenticated,admin_username,created_at,expires_at,traffic_type,qa_run_id)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
    .run(digest(token), kind, userId, `a:${uid()}`, csrf, kind === 'admin' ? 1 : 0, adminUsername, stamp, stamp + 3600000, 'live', null);
  const cookieName = kind === 'admin' ? ADMIN_COOKIE : PUBLIC_COOKIE;
  return {
    token,
    userId,
    csrf,
    cookie: `${cookieName}=${token}`,
    accountKey: googleSub ? forgeAccountKey({ iss: 'https://accounts.google.com', sub: googleSub }) : null
  };
}

function createFakeVerifiedBuild(forgeDir, accountKey, project, htmlBody = '<h1>Version 1</h1>') {
  const buildId = crypto.randomBytes(8).toString('hex');
  const sortedFiles = Object.entries(project.files)
    .sort(([a], [b]) => a.localeCompare(b, 'en'))
    .map(([filePath, content]) => ({ path: filePath, content }));
  const sourceHash = sha256(JSON.stringify(sortedFiles));
  const indexHtml = `<!doctype html><html><head><script src="playhub-godot-shell.js"></script></head><body>${htmlBody}</body></html>`;
  const zipBuffer = zipFiles([
    ['index.html', Buffer.from(indexHtml, 'utf8')],
    ['playhub-godot-shell.js', Buffer.from(SHELL_JS, 'utf8')],
    ['game.txt', Buffer.from('ok', 'utf8')]
  ]);
  const artifactSha256 = sha256(zipBuffer);
  const buildFolder = path.join(forgeDir, 'builds', accountKey, buildId);
  fs.mkdirSync(path.join(buildFolder, 'output'), { recursive: true });
  fs.writeFileSync(path.join(buildFolder, 'output', 'PlayForge-Web.zip'), zipBuffer);
  const job = {
    id: buildId,
    buildId,
    target: 'web',
    revision: project.revision,
    sourceHash,
    projectId: project.id,
    ownerKey: accountKey,
    status: 'succeeded',
    createdAt: new Date().toISOString(),
    files: ['index.html', 'playhub-godot-shell.js', 'game.txt', 'PlayForge-Web.zip'],
    previewUrl: `/api/builds/${buildId}/files/index.html`,
    downloadUrl: `/api/builds/${buildId}/files/PlayForge-Web.zip`,
    artifactSha256,
    bytes: zipBuffer.length
  };
  fs.writeFileSync(path.join(buildFolder, 'result.json'), JSON.stringify(job, null, 2));
  return { buildId, artifactSha256, sourceHash, zipBuffer, job };
}

test('Forge-Publish E2E: preview -> submit -> verify -> approve & publish -> catalog -> play-session -> update -> 1s rollback -> kill-switch', async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ugc-publish-e2e-'));
  const dataDir = path.join(temp, 'hub-data');
  const forgeDir = path.join(temp, 'forge-data');
  const fixtureRoot = path.join(temp, 'hub-root');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(forgeDir, { recursive: true });
  fs.mkdirSync(path.join(fixtureRoot, 'catalog'), { recursive: true });
  fs.mkdirSync(path.join(fixtureRoot, 'games', 'brick-breaker'), { recursive: true });
  fs.writeFileSync(path.join(fixtureRoot, 'catalog', 'games.json'), JSON.stringify({
    schemaVersion: 1,
    entries: [{ id: 'brick-breaker', path: 'games/brick-breaker', enabled: true }]
  }));
  fs.writeFileSync(path.join(fixtureRoot, 'games', 'brick-breaker', 'game.manifest.json'), JSON.stringify({
    schemaVersion: 1,
    id: 'brick-breaker',
    slug: 'brick-breaker',
    title: { ko: '벽돌깨기', en: 'Brick Breaker' },
    summary: { ko: '클래식 벽돌깨기', en: 'Classic brick breaker' },
    instructions: { ko: '마우스로 패들을 이동하세요.', en: 'Move paddle with mouse.' },
    entry: 'index.html',
    version: '1.0.0',
    tags: ['arcade'],
    controls: ['mouse'],
    viewport: { width: 1280, height: 720, orientation: 'landscape', resize: 'fit' },
    capabilities: { webgl: false, wasm: false, workers: false, fullscreen: true, pointerLock: false, externalNetwork: [] },
    save: { enabled: true, schemaVersion: 1, maxSlots: 1 },
    seo: { title: 'Brick Breaker', description: 'Brick Breaker', indexable: true },
    media: { cover: 'assets/cover.svg', screenshots: [] }
  }));

  const app = createApp({
    dataDir,
    secureCookies: true,
    userOrigins: ['https://playhub.local'],
    adminOrigins: ['https://admin.playhub.local'],
    userBaseUrl: 'https://playhub.local',
    forge: { enabled: true, mode: 'local', directory: forgeDir, builds: { enabled: true } }
  }, { rootDir: fixtureRoot, platformRoot: REPO_ROOT });
  t.after(async () => {
    await app.close();
    fs.rmSync(temp, { recursive: true, force: true });
  });

  const creator = seedSession(app.db, { kind: 'public', googleSub: 'creator-sub-001', csrf: 'creator-csrf-1' });
  const otherCreator = seedSession(app.db, { kind: 'public', googleSub: 'creator-sub-002', csrf: 'creator-csrf-2' });
  const admin = seedSession(app.db, { kind: 'admin', adminUsername: 'ops-admin', csrf: 'admin-csrf-1' });

  const creatorHeaders = { origin: 'https://playhub.local', cookie: creator.cookie, 'x-csrf-token': creator.csrf };
  const adminHeaders = { origin: 'https://admin.playhub.local', cookie: admin.cookie, 'x-csrf-token': admin.csrf };

  // 1. Create a Forge project + verified Web build + Release v1 with releaseManifest
  const store = new PlatformStore(REPO_ROOT, path.join(forgeDir, 'accounts', creator.accountKey));
  const project = store.createProject({ name: 'Cosmic Jumper', template: 'blank3d' });
  const buildV1 = createFakeVerifiedBuild(forgeDir, creator.accountKey, project, '<h1>Cosmic Jumper v1</h1>');
  const manifestV1 = buildReleaseManifest({
    projectId: project.id,
    projectName: project.name,
    sourceRevision: project.revision,
    sourceHash: buildV1.sourceHash,
    build: buildV1.job,
    visibility: 'public',
    deployProfile: { deployMode: 'singleplay' },
    gameMetadata: {
      slug: 'cosmic-jumper',
      title: { ko: '코스믹 점퍼', en: 'Cosmic Jumper' },
      summary: { ko: '우주 점프 아케이드', en: 'Space jump arcade' },
      tags: ['arcade', 'action']
    }
  });
  const releaseV1 = await store.createRelease(project.id, {
    revision: project.revision,
    label: 'v1.0.0',
    build: buildV1.job,
    visibility: 'public',
    deployProfile: manifestV1.deployProfile,
    gameMetadata: manifestV1.gameMetadata,
    releaseManifest: manifestV1
  });

  // 2. Unlisted preview: unpacks into /play-ugc/ without appearing in public /api/games
  const previewRes = await invoke(app.publicHandler, {
    method: 'POST',
    url: '/api/creator/publications/preview',
    headers: creatorHeaders,
    body: {
      projectId: project.id,
      releaseId: releaseV1.id,
      visibility: 'unlisted',
      gameSlug: 'cosmic-jumper',
      title: '코스믹 점퍼'
    }
  });
  assert.equal(previewRes.status, 201);
  assert.match(previewRes.json.previewUrl, /^\/play-ugc\/p[a-z2-7]{16}\/[a-f0-9]{24}\/index\.html$/);

  const previewHtml = await invoke(app.publicHandler, { method: 'GET', url: previewRes.json.previewUrl });
  assert.equal(previewHtml.status, 200);
  assert.match(previewHtml.text, /Cosmic Jumper v1/);
  assert.equal(previewHtml.headers['x-content-type-options'], 'nosniff');
  assert.equal(previewHtml.headers['content-security-policy'], "frame-ancestors 'self'");
  assert.equal(previewHtml.headers['set-cookie'], undefined);

  const catalogBefore = await invoke(app.publicHandler, { method: 'GET', url: '/api/games' });
  assert.equal(catalogBefore.status, 200);
  assert.equal(catalogBefore.json.games.some(g => g.id === 'cosmic-jumper'), false);

  // 3. Submit to PlayHub review -> packageValidation automatically becomes 'verified'
  const createSub = await invoke(app.publicHandler, {
    method: 'POST',
    url: '/api/creator/submissions',
    headers: creatorHeaders,
    body: {
      projectId: project.id,
      releaseId: releaseV1.id,
      title: '코스믹 점퍼',
      description: '우주 점프 아케이드 게임입니다.',
      gameSlug: 'cosmic-jumper',
      visibility: 'public',
      deployMode: 'singleplay'
    }
  });
  assert.equal(createSub.status, 201);
  assert.equal(createSub.json.submission.packageValidation, 'verified');
  assert.equal(createSub.json.submission.artifactSha256, buildV1.artifactSha256);

  const subId = createSub.json.submission.id;
  const submitRes = await invoke(app.publicHandler, {
    method: 'POST',
    url: `/api/creator/submissions/${subId}/submit`,
    headers: creatorHeaders,
    body: { revision: createSub.json.submission.revision }
  });
  assert.equal(submitRes.status, 200);
  assert.equal(submitRes.json.submission.status, 'in_review');

  // 4. Admin 1-click approve & publish + Idempotency-Key check
  const pubRes = await invoke(app.adminHandler, {
    method: 'POST',
    url: `/api/admin/submissions/${subId}/publish`,
    headers: { ...adminHeaders, 'idempotency-key': 'pub-key-v1' },
    body: { revision: submitRes.json.submission.revision, approveIfInReview: true, note: '검수 완료' }
  });
  assert.equal(pubRes.status, 200);
  assert.equal(pubRes.json.publication.gameId, 'cosmic-jumper');
  assert.equal(pubRes.json.publication.status, 'published');
  assert.equal(pubRes.json.publication.visibility, 'public');
  assert.equal(pubRes.json.publication.activeReleaseId, releaseV1.id);

  // Replay with same idempotency key returns identical response
  const pubReplay = await invoke(app.adminHandler, {
    method: 'POST',
    url: `/api/admin/submissions/${subId}/publish`,
    headers: { ...adminHeaders, 'idempotency-key': 'pub-key-v1' },
    body: { revision: submitRes.json.submission.revision, approveIfInReview: true, note: '검수 완료' }
  });
  assert.equal(pubReplay.status, 200);
  assert.equal(pubReplay.headers['x-idempotent-replay'], 'true');

  // Mismatched body with same idempotency key -> 409
  const pubConflict = await invoke(app.adminHandler, {
    method: 'POST',
    url: `/api/admin/submissions/${subId}/publish`,
    headers: { ...adminHeaders, 'idempotency-key': 'pub-key-v1' },
    body: { revision: 99, approveIfInReview: true }
  });
  assert.equal(pubConflict.status, 409);

  // 5. Public catalog now includes 'cosmic-jumper' and play-session returns isolated entryUrl
  const catalogLive = await invoke(app.publicHandler, { method: 'GET', url: '/api/games' });
  const liveGame = catalogLive.json.games.find(g => g.id === 'cosmic-jumper');
  assert.ok(liveGame);
  assert.equal(liveGame.source, 'ugc');
  assert.equal(liveGame.entryUrl, pubRes.json.publication.entryUrl);

  const playSession = await invoke(app.publicHandler, {
    method: 'POST',
    url: '/api/play-sessions',
    headers: creatorHeaders,
    body: { gameId: 'cosmic-jumper' }
  });
  assert.equal(playSession.status, 201);
  assert.equal(playSession.json.entryUrl, pubRes.json.publication.entryUrl);

  const shellRes = await invoke(app.publicHandler, {
    method: 'GET',
    url: `${pubRes.json.publication.artifactBaseUrl}playhub-godot-shell.js`
  });
  assert.equal(shellRes.status, 200);
  assert.match(shellRes.text, /playhub:connect/);

  // 6. Release v2 update -> Admin publish -> 1-second rollback back to v1
  const updatedProj = await store.updateFile(project.id, {
    path: 'README.txt',
    content: 'v2 content',
    baseRevision: project.revision
  });
  const buildV2 = createFakeVerifiedBuild(forgeDir, creator.accountKey, updatedProj, '<h1>Cosmic Jumper v2</h1>');
  const releaseV2 = await store.createRelease(project.id, {
    revision: updatedProj.revision,
    label: 'v2.0.0',
    build: buildV2.job,
    visibility: 'public'
  });

  const sub2 = await invoke(app.publicHandler, {
    method: 'POST',
    url: '/api/creator/submissions',
    headers: creatorHeaders,
    body: {
      projectId: project.id,
      releaseId: releaseV2.id,
      title: '코스믹 점퍼 v2',
      description: '업데이트 버전',
      gameSlug: 'cosmic-jumper'
    }
  });
  const sub2Id = sub2.json.submission.id;
  const sub2Req = await invoke(app.publicHandler, {
    method: 'POST',
    url: `/api/creator/submissions/${sub2Id}/submit`,
    headers: creatorHeaders,
    body: { revision: sub2.json.submission.revision }
  });
  const pubV2 = await invoke(app.adminHandler, {
    method: 'POST',
    url: `/api/admin/submissions/${sub2Id}/publish`,
    headers: adminHeaders,
    body: {
      revision: sub2Req.json.submission.revision,
      approveIfInReview: true,
      expectedCasVersion: pubRes.json.publication.casVersion
    }
  });
  assert.equal(pubV2.status, 200);
  assert.equal(pubV2.json.publication.activeReleaseId, releaseV2.id);
  assert.equal(pubV2.json.publication.casVersion, pubRes.json.publication.casVersion + 1);

  const v2Html = await invoke(app.publicHandler, { method: 'GET', url: pubV2.json.publication.entryUrl });
  assert.match(v2Html.text, /Cosmic Jumper v2/);

  // 1-second CAS rollback to v1
  const rollbackRes = await invoke(app.adminHandler, {
    method: 'POST',
    url: '/api/admin/publications/cosmic-jumper/rollback',
    headers: adminHeaders,
    body: {
      toReleaseId: releaseV1.id,
      expectedCasVersion: pubV2.json.publication.casVersion,
      reason: 'v2 regression'
    }
  });
  assert.equal(rollbackRes.status, 200);
  assert.equal(rollbackRes.json.publication.activeReleaseId, releaseV1.id);

  const rolledBackHtml = await invoke(app.publicHandler, { method: 'GET', url: rollbackRes.json.publication.entryUrl });
  assert.match(rolledBackHtml.text, /Cosmic Jumper v1/);

  // 7. Static catalog ID reservation & foreign slug hijack protection
  const staticFirstId = catalogLive.json.games.find(g => g.source !== 'ugc')?.id;
  if (staticFirstId) {
    const hijackStatic = await invoke(app.publicHandler, {
      method: 'POST',
      url: '/api/creator/publications/preview',
      headers: creatorHeaders,
      body: { projectId: project.id, releaseId: releaseV1.id, visibility: 'unlisted', gameSlug: staticFirstId }
    });
    assert.equal(hijackStatic.status, 409);
    assert.equal(hijackStatic.json.error.code, 'GAME_SLUG_RESERVED');
  }

  const otherStore = new PlatformStore(REPO_ROOT, path.join(forgeDir, 'accounts', otherCreator.accountKey));
  const otherProj = otherStore.createProject({ name: 'Copycat', template: 'blank3d' });
  const otherBuild = createFakeVerifiedBuild(forgeDir, otherCreator.accountKey, otherProj, '<h1>Copycat</h1>');
  const otherRel = await otherStore.createRelease(otherProj.id, { revision: otherProj.revision, label: 'v1', build: otherBuild.job });
  const hijackOther = await invoke(app.publicHandler, {
    method: 'POST',
    url: '/api/creator/publications/preview',
    headers: { origin: 'https://playhub.local', cookie: otherCreator.cookie, 'x-csrf-token': otherCreator.csrf },
    body: { projectId: otherProj.id, releaseId: otherRel.id, visibility: 'unlisted', gameSlug: 'cosmic-jumper' }
  });
  assert.equal(hijackOther.status, 409);
  assert.equal(hijackOther.json.error.code, 'GAME_SLUG_TAKEN');

  // 8. Instant Admin Kill-Switch (suspended) blocks catalog, play-sessions, and direct /play-ugc/ serving
  const killRes = await invoke(app.adminHandler, {
    method: 'POST',
    url: '/api/admin/publications/cosmic-jumper/status',
    headers: adminHeaders,
    body: { status: 'suspended', expectedCasVersion: rollbackRes.json.publication.casVersion, reason: 'policy violation' }
  });
  assert.equal(killRes.status, 200);
  assert.equal(killRes.json.publication.status, 'suspended');

  const afterKillCatalog = await invoke(app.publicHandler, { method: 'GET', url: '/api/games' });
  assert.equal(afterKillCatalog.json.games.some(g => g.id === 'cosmic-jumper'), false);

  const afterKillAsset = await invoke(app.publicHandler, { method: 'GET', url: rollbackRes.json.publication.entryUrl });
  assert.equal(afterKillAsset.status, 403);
  assert.equal(afterKillAsset.json.error.code, 'GAME_SUSPENDED');
});

test('Remote ForgeGateway getReleasePackage streams verified ZIP + SHA-256 over /internal/v1', async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-pkg-'));
  const forgeStorage = path.join(temp, 'forge-storage');
  const secret = 'remote-package-test-secret-0123456789abcdef';
  const accountKey = forgeAccountKey({ iss: 'https://accounts.google.com', sub: 'remote-creator-1' });

  const store = new PlatformStore(REPO_ROOT, path.join(forgeStorage, 'accounts', accountKey));
  const project = store.createProject({ name: 'Remote Game', template: 'blank3d' });
  const built = createFakeVerifiedBuild(forgeStorage, accountKey, project, '<h1>Remote Build</h1>');
  const release = await store.createRelease(project.id, { revision: project.revision, label: 'r1', build: built.job });

  const internalApi = createInternalApi({ root: REPO_ROOT, directory: forgeStorage, internalSecret: secret });
  const server = http.createServer(async (req, res) => {
    if (!await internalApi.handle(req, res)) res.writeHead(404).end();
  });
  const port = await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
  const gw = createRemoteForgeGateway({
    config: { enabled: true, baseUrl: `http://127.0.0.1:${port}`, internalSecret: secret }
  });
  t.after(async () => {
    gw.close();
    internalApi.close();
    await new Promise(resolve => { server.closeAllConnections?.(); server.close(resolve); });
    fs.rmSync(temp, { recursive: true, force: true });
  });

  const pkg = await gw.getReleasePackage(accountKey, project.id, release.id);
  assert.equal(pkg.sha256, built.artifactSha256);
  assert.equal(pkg.buildId, built.buildId);
  assert.equal(Buffer.compare(pkg.buffer, built.zipBuffer), 0);
});
