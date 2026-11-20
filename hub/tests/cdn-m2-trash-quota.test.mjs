// PlayHub-CDN M2 tests: project trash (soft-delete, restore, GC purge) and plan downgrade over-quota policy.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, scryptSync } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../server/app.mjs';
import { ensureCdnSchema } from '../server/cdn/schema.mjs';
import { resolveCdnSettings } from '../server/cdn/routes.mjs';
import { digest } from '../server/security.mjs';

const userOrigin = 'http://127.0.0.1:8080';
const adminOrigin = 'http://127.0.0.1:8081';
const password = 'isolated-test-password';
const DAY = 24 * 60 * 60 * 1000;
const sha = value => createHash('sha256').update(value).digest('hex');
const file = (p, text) => ({ path: p, content: Buffer.from(text), sha256: sha(text), bytes: Buffer.byteLength(text) });

class Client {
  constructor(port, origin) { this.port = port; this.origin = origin; this.jar = new Map(); this.csrf = null; }
  async call(target, { method = 'GET', body, csrf = true, headers = {} } = {}) {
    const h = { Origin: this.origin, ...headers };
    if (this.jar.size) h.Cookie = [...this.jar.values()].join('; ');
    if (body !== undefined) h['Content-Type'] = 'application/json';
    if (csrf && this.csrf && method !== 'GET') h['X-CSRF-Token'] = this.csrf;
    const response = await fetch(`http://127.0.0.1:${this.port}${target}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const value of response.headers.getSetCookie()) { const token = value.split(';')[0]; this.jar.set(token.split('=')[0], token); }
    const data = await response.json();
    if (data.csrfToken) this.csrf = data.csrfToken;
    return { status: response.status, data };
  }
}

async function fixture(t, cdnOverrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-cdn-m2-'));
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(path.join(root, 'catalog'));
  fs.writeFileSync(path.join(root, 'catalog/games.json'), JSON.stringify({ schemaVersion: 1, entries: [] }));
  const salt = 'a'.repeat(32);
  const config = {
    publicHost: '127.0.0.1', publicPort: 0, adminHost: '127.0.0.1', adminPort: 0,
    userOrigins: [userOrigin], adminOrigins: [adminOrigin], userBaseUrl: userOrigin, dataDir,
    admin: { username: 'admin', salt, passwordHash: scryptSync(password, salt, 64).toString('hex') },
    cdn: { enabled: true, provider: 'local', buckets: { quarantine: 'ugc-quarantine-dev', projects: 'ugc-projects-dev' }, plans: { free: 4096, pro: 1_000_000 }, gcGraceMs: 0, ...cdnOverrides },
  };
  const clock = { skew: 0 };
  const app = createApp(config, { rootDir: root, clock: () => Date.now() + clock.skew, env: {} });
  t.after(async () => { await app.close(); fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); });
  const { public: pub, admin } = await app.listen();
  if (app.cdn.enabled) await app.cdn.ready;
  return { app, db: app.db, clock, s3: app.cdn.localS3, port: pub.port, adminPort: admin.port };
}

async function googleUser(f, subject) {
  const client = new Client(f.port, userOrigin);
  assert.equal((await client.call('/api/session')).status, 200);
  const token = [...client.jar.values()].find(v => v.startsWith('poc_public_session=')).split('=')[1];
  const userId = `user-${subject}`;
  f.db.prepare("INSERT INTO users(id,kind,display_name,created_at) VALUES(?,'registered',?,?)").run(userId, subject, Date.now());
  f.db.prepare("INSERT INTO identities(provider,subject,user_id) VALUES('google',?,?)").run(subject, userId);
  f.db.prepare('UPDATE sessions SET principal_id=? WHERE id_hash=?').run(userId, digest(decodeURIComponent(token)));
  client.owner = sha('https://accounts.google.com\0' + subject);
  return client;
}

async function put(upload, content) {
  return fetch(upload.put.url, { method: 'PUT', headers: { 'content-type': upload.put.headers['content-type'] }, body: content });
}

async function save(client, projectId, files, { expectedHead = null, message = 'save' } = {}) {
  const plan = await client.call(`/api/cdn/projects/${projectId}/save-plans`, { method: 'POST', body: { baseCommitId: expectedHead, files: files.map(({ path: p, sha256, bytes }) => ({ path: p, sha256, bytes })) } });
  assert.equal(plan.status, 201, JSON.stringify(plan.data));
  for (const upload of plan.data.uploads) {
    const content = files.find(f => f.sha256 === upload.sha256).content;
    assert.equal((await put(upload, content)).status, 200);
    const done = await client.call(`/api/cdn/uploads/${upload.uploadId}/complete`, { method: 'POST', body: {} });
    assert.equal(done.status, 200, JSON.stringify(done.data));
    assert.equal(done.data.state, 'VERIFIED');
  }
  const commit = await client.call(`/api/cdn/projects/${projectId}/commits`, { method: 'POST', body: { planId: plan.data.planId, expectedHead, message } });
  return { plan: plan.data, commit };
}

async function newProject(client, name = 'My Game') {
  const r = await client.call('/api/cdn/projects', { method: 'POST', body: { name } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data.project;
}

async function adminSession(f) {
  const a = new Client(f.adminPort, adminOrigin);
  assert.equal((await a.call('/api/admin/session')).status, 200);
  assert.equal((await a.call('/api/admin/login', { method: 'POST', body: { username: 'admin', password } })).status, 200);
  return a;
}

async function adminGc(f) {
  const a = await adminSession(f);
  const r = await a.call('/api/admin/cdn/gc', { method: 'POST', body: {} });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data.report;
}

async function adminSetPlan(f, owner, plan) {
  const a = await adminSession(f);
  const r = await a.call('/api/admin/cdn/plan', { method: 'POST', body: { owner, plan } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data;
}

test('schema migration: ensureCdnSchema adds trashed_at to M1 cdn_projects without bumping user_version', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-cdn-mig-'));
  const db = new DatabaseSync(path.join(dir, 'legacy.sqlite'));
  t.after(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); });
  db.exec(`
    PRAGMA user_version=1;
    CREATE TABLE cdn_projects(
      id TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      host_slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      head_commit_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL);
    INSERT INTO cdn_projects VALUES('proj-1', 'owner-1', 'pabcdefghijklmnop', 'Legacy', NULL, 100, 100);
  `);
  ensureCdnSchema(db);
  ensureCdnSchema(db);
  const cols = db.prepare('PRAGMA table_info(cdn_projects)').all().map(c => c.name);
  assert.equal(cols.includes('trashed_at'), true);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 1);
  const row = db.prepare('SELECT id, trashed_at FROM cdn_projects WHERE id=?').get('proj-1');
  assert.deepEqual({ ...row }, { id: 'proj-1', trashed_at: null });
});

test('project soft-delete hides project from active list, blocks save-plans/commits/restore/uploads, and restores cleanly', async t => {
  const f = await fixture(t);
  const alice = await googleUser(f, 'alice');
  const p1 = await newProject(alice, 'Alpha');
  const p2 = await newProject(alice, 'Beta');
  assert.equal(p1.trashedAt, null);

  const v1 = (await save(alice, p1.id, [file('main.gd', 'v1')])).commit.data.commit;
  const v2 = (await save(alice, p1.id, [file('main.gd', 'v2')], { expectedHead: v1.id })).commit.data.commit;

  // Prepare an open save-plan before trashing so we can verify POST /commits and uploads are blocked once trashed.
  const openFile = file('main.gd', 'v3-pending');
  const pendingPlan = await alice.call(`/api/cdn/projects/${p1.id}/save-plans`, {
    method: 'POST',
    body: { baseCommitId: v2.id, files: [{ path: openFile.path, sha256: openFile.sha256, bytes: openFile.bytes }] },
  });
  assert.equal(pendingPlan.status, 201);
  const pendingUpload = pendingPlan.data.uploads[0];
  assert.equal((await put(pendingUpload, openFile.content)).status, 200);

  // Soft-delete p1.
  const del = await alice.call(`/api/cdn/projects/${p1.id}`, { method: 'DELETE' });
  assert.equal(del.status, 200);
  assert.ok(del.data.project.trashedAt);

  // Active list excludes p1; trashedProjects and ?trashed=1 include p1.
  const activeList = await alice.call('/api/cdn/projects');
  assert.deepEqual(activeList.data.projects.map(p => p.id), [p2.id]);
  assert.deepEqual(activeList.data.trashedProjects.map(p => p.id), [p1.id]);

  const trashedQuery = await alice.call('/api/cdn/projects?trashed=1');
  assert.deepEqual(trashedQuery.data.projects.map(p => p.id), [p1.id]);

  const allQuery = await alice.call('/api/cdn/projects?trashed=all');
  assert.deepEqual(allQuery.data.projects.map(p => p.id).sort(), [p1.id, p2.id].sort());

  const storage = await alice.call('/api/cdn/me/storage');
  assert.equal(storage.data.projects, 1);
  assert.equal(storage.data.trashedProjects, 1);

  // While trashed, save-plans, commits, version restore, pin, upload renew/complete are blocked with 409 PROJECT_TRASHED.
  const blockedPlan = await alice.call(`/api/cdn/projects/${p1.id}/save-plans`, { method: 'POST', body: { baseCommitId: v2.id, files: [] } });
  assert.equal(blockedPlan.status, 409);
  assert.equal(blockedPlan.data.error.code, 'PROJECT_TRASHED');

  const blockedCommit = await alice.call(`/api/cdn/projects/${p1.id}/commits`, { method: 'POST', body: { planId: pendingPlan.data.planId, expectedHead: v2.id } });
  assert.equal(blockedCommit.status, 409);
  assert.equal(blockedCommit.data.error.code, 'PROJECT_TRASHED');

  const blockedVersionRestore = await alice.call(`/api/cdn/projects/${p1.id}/versions/${v1.id}/restore`, { method: 'POST', body: { expectedHead: v2.id } });
  assert.equal(blockedVersionRestore.status, 409);
  assert.equal(blockedVersionRestore.data.error.code, 'PROJECT_TRASHED');

  const blockedPin = await alice.call(`/api/cdn/projects/${p1.id}/versions/${v1.id}/pin`, { method: 'POST', body: {} });
  assert.equal(blockedPin.status, 409);
  assert.equal(blockedPin.data.error.code, 'PROJECT_TRASHED');

  const blockedRenew = await alice.call(`/api/cdn/uploads/${pendingUpload.uploadId}/renew`, { method: 'POST', body: {} });
  assert.equal(blockedRenew.status, 409);
  assert.equal(blockedRenew.data.error.code, 'PROJECT_TRASHED');

  const blockedComplete = await alice.call(`/api/cdn/uploads/${pendingUpload.uploadId}/complete`, { method: 'POST', body: {} });
  assert.equal(blockedComplete.status, 409);
  assert.equal(blockedComplete.data.error.code, 'PROJECT_TRASHED');

  // Existing versions and downloads stay readable while in trash.
  assert.equal((await alice.call(`/api/cdn/projects/${p1.id}/versions`)).status, 200);
  const dl = await alice.call(`/api/cdn/projects/${p1.id}/downloads`, { method: 'POST', body: { commitId: v1.id, path: 'main.gd' } });
  assert.equal(dl.status, 200);
  assert.equal(await (await fetch(dl.data.get.url)).text(), 'v1');

  // Restore p1 from trash (works both with and without JSON body).
  const restored = await alice.call(`/api/cdn/projects/${p1.id}/restore`, { method: 'POST' });
  assert.equal(restored.status, 200);
  assert.equal(restored.data.project.trashedAt, null);

  const afterList = await alice.call('/api/cdn/projects');
  assert.deepEqual(afterList.data.projects.map(p => p.id).sort(), [p1.id, p2.id].sort());
  assert.deepEqual(afterList.data.trashedProjects, []);

  // After restore, the pending upload can be completed and committed, and version restore works again.
  assert.equal((await alice.call(`/api/cdn/uploads/${pendingUpload.uploadId}/complete`, { method: 'POST', body: {} })).data.state, 'VERIFIED');
  const v3 = await alice.call(`/api/cdn/projects/${p1.id}/commits`, { method: 'POST', body: { planId: pendingPlan.data.planId, expectedHead: v2.id } });
  assert.equal(v3.status, 201);
  const v4 = await alice.call(`/api/cdn/projects/${p1.id}/versions/${v1.id}/restore`, { method: 'POST', body: { expectedHead: v3.data.commit.id } });
  assert.equal(v4.status, 201);
  assert.equal(v4.data.commit.restoredFrom, v1.id);
});

test('trash ownership, CSRF enforcement, invalid query/ID handling, and idempotent trash/restore', async t => {
  const f = await fixture(t);
  const alice = await googleUser(f, 'alice');
  const bob = await googleUser(f, 'bob');
  const p = await newProject(alice, 'Protected');

  // Owner isolation & CSRF.
  assert.equal((await bob.call(`/api/cdn/projects/${p.id}`, { method: 'DELETE' })).status, 404);
  assert.equal((await bob.call(`/api/cdn/projects/${p.id}/restore`, { method: 'POST', body: {} })).status, 404);
  assert.equal((await alice.call(`/api/cdn/projects/${p.id}`, { method: 'DELETE', csrf: false })).status, 403);
  assert.equal((await alice.call('/api/cdn/projects?trashed=invalid')).status, 400);
  assert.equal((await alice.call('/api/cdn/projects/bad!id', { method: 'DELETE' })).status, 400);

  // Double DELETE keeps the original trashedAt timestamp.
  const firstDel = await alice.call(`/api/cdn/projects/${p.id}`, { method: 'DELETE' });
  assert.equal(firstDel.status, 200);
  f.clock.skew += 10_000;
  const secondDel = await alice.call(`/api/cdn/projects/${p.id}`, { method: 'DELETE' });
  assert.equal(secondDel.status, 200);
  assert.equal(secondDel.data.project.trashedAt, firstDel.data.project.trashedAt);

  // Idempotent restore with JSON body.
  const r1 = await alice.call(`/api/cdn/projects/${p.id}/restore`, { method: 'POST', body: {} });
  assert.equal(r1.status, 200);
  assert.equal(r1.data.project.trashedAt, null);
  const r2 = await alice.call(`/api/cdn/projects/${p.id}/restore`, { method: 'POST', body: {} });
  assert.equal(r2.status, 200);
  assert.equal(r2.data.project.trashedAt, null);
});

test('GC preserves head/pinned commits during trash window, then permanently purges after trashRetentionDays and refunds unreferenced blobs', async t => {
  const f = await fixture(t, { retentionDays: 1, retentionCount: 1, trashRetentionDays: 30 });
  const alice = await googleUser(f, 'alice');
  const pTrash = await newProject(alice, 'ToPurge');
  const pKeep = await newProject(alice, 'SharedKeep');

  const shared = file('shared.txt', 'shared-content-across-projects');
  const u1 = file('unique.txt', 'unique-v1');
  const u2 = file('unique.txt', 'unique-v2-old-unpinned');
  const u3 = file('unique.txt', 'unique-v3-head');

  const c1 = (await save(alice, pTrash.id, [shared, u1])).commit.data.commit;
  const c2 = (await save(alice, pTrash.id, [shared, u2], { expectedHead: c1.id })).commit.data.commit;
  const c3 = (await save(alice, pTrash.id, [shared, u3], { expectedHead: c2.id })).commit.data.commit;
  assert.equal((await alice.call(`/api/cdn/projects/${pTrash.id}/versions/${c1.id}/pin`, { method: 'POST', body: {} })).status, 200);

  // Active project shares `shared.txt`.
  await save(alice, pKeep.id, [shared]);

  // Trash pTrash at t = 0.
  assert.equal((await alice.call(`/api/cdn/projects/${pTrash.id}`, { method: 'DELETE' })).status, 200);
  const usedBefore = (await alice.call('/api/cdn/me/storage')).data.usedBytes;

  // At 5 days (< 30d trashRetentionDays), GC prunes old unpinned c2 but keeps pTrash, pinned c1, and head c3.
  f.clock.skew += 5 * DAY;
  const midGc = await adminGc(f);
  assert.equal(midGc.projectsPurged, 0);
  assert.equal(midGc.commitsPruned, 1);
  const midVersions = (await alice.call(`/api/cdn/projects/${pTrash.id}/versions`)).data.versions;
  assert.deepEqual(midVersions.map(v => v.id).sort(), [c1.id, c3.id].sort());

  // At 29 days (< 30d), pTrash is still restorable / not purged.
  f.clock.skew += 24 * DAY;
  const almostGc = await adminGc(f);
  assert.equal(almostGc.projectsPurged, 0);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM cdn_projects WHERE id=?').get(pTrash.id).n, 1);

  // At 31 days (> 30d), GC permanently purges pTrash (including pinned c1 and head c3), sweeps unreferenced blobs, and keeps shared blob for pKeep.
  f.clock.skew += 2 * DAY;
  const purgeGc = await adminGc(f);
  assert.equal(purgeGc.projectsPurged, 1);
  assert.equal(purgeGc.commitsPruned, 2);
  assert.equal(purgeGc.blobsDeleted >= 3, true, 'unique v1/v3 blobs and pTrash manifests are deleted');
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM cdn_projects WHERE id=?').get(pTrash.id).n, 0);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM cdn_commits WHERE project_id=?').get(pTrash.id).n, 0);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM cdn_pins WHERE commit_id=?').get(c1.id).n, 0);

  // Cannot restore after permanent purge.
  const lateRestore = await alice.call(`/api/cdn/projects/${pTrash.id}/restore`, { method: 'POST', body: {} });
  assert.equal(lateRestore.status, 404);
  assert.equal(lateRestore.data.error.code, 'PROJECT_NOT_FOUND');

  // Shared blob remains LIVE (ref_count=1) and downloadable on pKeep; quota was refunded for pTrash's unique blobs.
  const sharedBlob = f.db.prepare("SELECT state, ref_count FROM cdn_blobs WHERE owner=? AND sha256=? AND kind='file'").get(alice.owner, shared.sha256);
  assert.deepEqual({ ...sharedBlob }, { state: 'LIVE', ref_count: 1 });
  const keepDl = await alice.call(`/api/cdn/projects/${pKeep.id}/downloads`, { method: 'POST', body: { path: 'shared.txt' } });
  assert.equal(keepDl.status, 200);
  assert.equal(await (await fetch(keepDl.data.get.url)).text(), shared.content.toString());

  const storageAfter = (await alice.call('/api/cdn/me/storage')).data;
  const liveSum = f.db.prepare("SELECT COALESCE(SUM(bytes),0) AS n FROM cdn_blobs WHERE owner=? AND state='LIVE'").get(alice.owner).n;
  assert.equal(storageAfter.usedBytes, liveSum);
  assert.equal(storageAfter.usedBytes < usedBefore, true);
  assert.equal(storageAfter.trashedProjects, 0);
  assert.equal(storageAfter.projects, 1);
});

test('GC purge cleans open save plans and releases reservations when trashed project expires before saveSessionTtlSec', async t => {
  const f = await fixture(t, { trashRetentionDays: 1, saveSessionTtlSec: 3 * 24 * 60 * 60 });
  const alice = await googleUser(f, 'alice');
  const p = await newProject(alice, 'ShortTrash');
  const pending = file('a.bin', 'x'.repeat(500));
  const plan = await alice.call(`/api/cdn/projects/${p.id}/save-plans`, {
    method: 'POST',
    body: { files: [{ path: pending.path, sha256: pending.sha256, bytes: pending.bytes }] },
  });
  assert.equal(plan.status, 201);
  assert.equal((await put(plan.data.uploads[0], pending.content)).status, 200);
  assert.equal((await alice.call('/api/cdn/me/storage')).data.reservedBytes, 500);

  assert.equal((await alice.call(`/api/cdn/projects/${p.id}`, { method: 'DELETE' })).status, 200);
  f.clock.skew += 2 * DAY;
  const report = await adminGc(f);
  assert.equal(report.projectsPurged, 1);
  assert.equal(report.plansExpired, 0, 'save plan had 3d TTL so purgeTrashedProjects handled cleanup directly');
  assert.equal(report.quarantineDeleted, 1);
  assert.equal((await alice.call('/api/cdn/me/storage')).data.reservedBytes, 0);
  assert.deepEqual(f.s3.keys('ugc-quarantine-dev'), []);
});

test('plan downgrade over-quota blocks save-plans and commits with 403 QUOTA_EXCEEDED while allowing reads, downloads, and trash deletion until GC refunds quota', async t => {
  const f = await fixture(t, { plans: { free: 4096, pro: 1_000_000 }, trashRetentionDays: 30 });
  const alice = await googleUser(f, 'alice');
  await adminSetPlan(f, alice.owner, 'pro');

  const p1 = await newProject(alice, 'BigProject');
  const p2 = await newProject(alice, 'SecondProject');

  const big = file('assets/level.dat', 'A'.repeat(3500));
  const small = file('src/game.gd', 'extends Node\n');
  const c1 = (await save(alice, p1.id, [big])).commit.data.commit;
  const c2 = (await save(alice, p2.id, [small])).commit.data.commit;

  // Create & verify a save-plan on p2 BEFORE downgrade so we can also verify POST /commits after downgrade.
  const nextSmall = file('src/extra.gd', 'var x = 1\n');
  const prePlan = await alice.call(`/api/cdn/projects/${p2.id}/save-plans`, {
    method: 'POST',
    body: { baseCommitId: c2.id, files: [small, nextSmall].map(({ path: p, sha256, bytes }) => ({ path: p, sha256, bytes })) },
  });
  assert.equal(prePlan.status, 201);
  assert.equal((await put(prePlan.data.uploads[0], nextSmall.content)).status, 200);
  assert.equal((await alice.call(`/api/cdn/uploads/${prePlan.data.uploads[0].uploadId}/complete`, { method: 'POST', body: {} })).status, 200);

  // Admin downgrades Alice to free (limit 4096). Total usedBytes > 4096 => overQuota === true.
  const downgraded = await adminSetPlan(f, alice.owner, 'free');
  assert.equal(downgraded.storage.overQuota, true);

  const st = (await alice.call('/api/cdn/me/storage')).data;
  assert.equal(st.plan, 'free');
  assert.equal(st.limitBytes, 4096);
  assert.equal(st.usedBytes > 4096, true);
  assert.equal(st.availableBytes, 0);
  assert.equal(st.overQuota, true);
  assert.equal(st.trashedProjects, 0);

  // New save-plans (both new bytes and zero/reused bytes) are rejected with 403 QUOTA_EXCEEDED.
  const blockedNewPlan = await alice.call(`/api/cdn/projects/${p2.id}/save-plans`, {
    method: 'POST',
    body: { baseCommitId: c2.id, files: [{ path: 'new.txt', sha256: sha('hello'), bytes: 5 }] },
  });
  assert.equal(blockedNewPlan.status, 403);
  assert.equal(blockedNewPlan.data.error.code, 'QUOTA_EXCEEDED');
  assert.equal(blockedNewPlan.data.error.storage.overQuota, true);

  const blockedZeroPlan = await alice.call(`/api/cdn/projects/${p2.id}/save-plans`, {
    method: 'POST',
    body: { baseCommitId: c2.id, files: [] },
  });
  assert.equal(blockedZeroPlan.status, 403);
  assert.equal(blockedZeroPlan.data.error.code, 'QUOTA_EXCEEDED');

  // Pre-existing open plan commit is also rejected with 403 QUOTA_EXCEEDED.
  const blockedCommit = await alice.call(`/api/cdn/projects/${p2.id}/commits`, {
    method: 'POST',
    body: { planId: prePlan.data.planId, expectedHead: c2.id },
  });
  assert.equal(blockedCommit.status, 403);
  assert.equal(blockedCommit.data.error.code, 'QUOTA_EXCEEDED');

  // Existing versions, manifest, and downloads remain fully accessible while over quota.
  const versions = await alice.call(`/api/cdn/projects/${p1.id}/versions`);
  assert.equal(versions.status, 200);
  const manifest = await alice.call(`/api/cdn/projects/${p1.id}/commits/${c1.id}/manifest`);
  assert.equal(manifest.status, 200);
  const dl = await alice.call(`/api/cdn/projects/${p1.id}/downloads`, { method: 'POST', body: { commitId: c1.id, path: 'assets/level.dat' } });
  assert.equal(dl.status, 200);
  assert.equal(await (await fetch(dl.data.get.url)).text(), 'A'.repeat(3500));

  // Soft-deleting p1 is allowed while over quota.
  const del = await alice.call(`/api/cdn/projects/${p1.id}`, { method: 'DELETE' });
  assert.equal(del.status, 200);
  const stTrashed = (await alice.call('/api/cdn/me/storage')).data;
  assert.equal(stTrashed.projects, 1);
  assert.equal(stTrashed.trashedProjects, 1);
  assert.equal(stTrashed.overQuota, true, 'soft-delete retains blobs until trashRetentionDays elapses');

  // After trashRetentionDays + GC, p1 is purged, quota is refunded below 4096, and uploads work again.
  f.clock.skew += 31 * DAY;
  const gcReport = await adminGc(f);
  assert.equal(gcReport.projectsPurged, 1);
  const stAfter = (await alice.call('/api/cdn/me/storage')).data;
  assert.equal(stAfter.usedBytes < 4096, true);
  assert.equal(stAfter.overQuota, false);
  assert.equal(stAfter.trashedProjects, 0);

  const resumed = await save(alice, p2.id, [small, file('src/ok.gd', 'var ok = true\n')], { expectedHead: c2.id });
  assert.equal(resumed.commit.status, 201);
});

test('overQuota boundary: exact limitBytes is not overQuota, upgrading clears overQuota, and admin status counts trashed projects', async t => {
  const f = await fixture(t, { plans: { free: 4096, pro: 1_000_000 } });
  const alice = await googleUser(f, 'alice');
  const p = await newProject(alice, 'Boundary');
  const a = file('a.bin', 'B'.repeat(2048));
  const c1 = (await save(alice, p.id, [a])).commit.data.commit;
  const used = (await alice.call('/api/cdn/me/storage')).data.usedBytes;
  // Set free limit dynamically? No, reserve up to exact boundary or test usedBytes === limitBytes via quota table adjustment.
  // Upgrade to pro, upload more, downgrade so usedBytes > freeLimit, then check restore from trash + admin status + upgrade clearing overQuota.
  await adminSetPlan(f, alice.owner, 'pro');
  const b = file('b.bin', 'C'.repeat(3000));
  await save(alice, p.id, [a, b], { expectedHead: c1.id });
  await adminSetPlan(f, alice.owner, 'free');

  assert.equal((await alice.call('/api/cdn/me/storage')).data.overQuota, true);
  assert.equal((await alice.call(`/api/cdn/projects/${p.id}`, { method: 'DELETE' })).status, 200);

  const admin = await adminSession(f);
  const status = await admin.call('/api/admin/cdn/status');
  assert.equal(status.status, 200);
  assert.deepEqual(status.data.projects, { active: 0, trashed: 1 });

  // Restoring from trash while overQuota is allowed (does not add new bytes), while uploads remain blocked until upgrade or purge.
  const restored = await alice.call(`/api/cdn/projects/${p.id}/restore`, { method: 'POST', body: {} });
  assert.equal(restored.status, 200);
  assert.equal(restored.data.project.trashedAt, null);
  const headId = restored.data.project.headCommitId;
  assert.equal((await alice.call(`/api/cdn/projects/${p.id}/save-plans`, { method: 'POST', body: { baseCommitId: headId, files: [] } })).status, 403);

  // Re-upgrading to pro clears overQuota immediately and resumes uploads.
  const up = await adminSetPlan(f, alice.owner, 'pro');
  assert.equal(up.storage.overQuota, false);
  assert.equal((await alice.call('/api/cdn/me/storage')).data.overQuota, false);
  assert.equal((await alice.call(`/api/cdn/projects/${p.id}/save-plans`, { method: 'POST', body: { baseCommitId: headId, files: [] } })).status, 201);

  // Exact limit boundary (usedBytes === limitBytes) -> overQuota === false, extra byte gets 422 STORAGE_LIMIT_EXCEEDED (not 403 QUOTA_EXCEEDED).
  assert.equal(used < 4096, true);
  f.db.prepare('UPDATE cdn_storage SET used_bytes=4096, plan=? WHERE owner=?').run('free', alice.owner);
  const exact = (await alice.call('/api/cdn/me/storage')).data;
  assert.equal(exact.overQuota, false);
  const extra = await alice.call(`/api/cdn/projects/${p.id}/save-plans`, {
    method: 'POST',
    body: { baseCommitId: restored.data.project.headCommitId, files: [{ path: 'one.txt', sha256: sha('1'), bytes: 1 }] },
  });
  assert.equal(extra.status, 422);
  assert.equal(extra.data.error.code, 'STORAGE_LIMIT_EXCEEDED');
});

test('resolveCdnSettings validates trashRetentionDays', () => {
  assert.equal(resolveCdnSettings({}).trashRetentionDays, 30);
  assert.equal(resolveCdnSettings({ trashRetentionDays: 7 }).trashRetentionDays, 7);
  assert.throws(() => resolveCdnSettings({ trashRetentionDays: 0 }), /trashRetentionDays/);
  assert.throws(() => resolveCdnSettings({ trashRetentionDays: -1 }), /trashRetentionDays/);
});
