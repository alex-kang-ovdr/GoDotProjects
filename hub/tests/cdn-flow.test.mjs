// End-to-end PlayHub-CDN M1 flow against the local S3 emulator (real HTTP, real SigV4 checks).
// Result class: PASS_LOCAL — R2-specific behavior (CORS on the real bucket, Content-Length enforcement,
// response-* overrides) still needs the provider contract test in docs/cdn/M1_IMPLEMENTATION.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, scryptSync } from 'node:crypto';
import { createApp } from '../server/app.mjs';
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-cdn-'));
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
  return { app, db: app.db, clock, s3: app.cdn.localS3, port: pub.port, adminPort: admin.port, adminClient: new Client(admin.port, adminOrigin) };
}

/** A visitor whose Hub session is bound to a registered Google identity (as after OIDC login). */
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

/** save-plan -> direct PUT of every requested upload -> complete -> commit. */
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

async function adminGc(f) {
  // Fresh admin session each time: tests move the clock forward by days.
  const a = new Client(f.adminPort, adminOrigin);
  assert.equal((await a.call('/api/admin/session')).status, 200);
  assert.equal((await a.call('/api/admin/login', { method: 'POST', body: { username: 'admin', password } })).status, 200);
  const r = await a.call('/api/admin/cdn/gc', { method: 'POST', body: {} });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data.report;
}

test('disabled CDN registers no routes and creates no tables', async t => {
  const f = await fixture(t, { enabled: false });
  const client = new Client(f.port, userOrigin);
  const r = await client.call('/api/cdn/me/storage');
  assert.notEqual(r.status, 200);
  assert.equal(r.data.usedBytes, undefined);
  assert.equal(f.app.cdn.enabled, false);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name LIKE 'cdn_%'").get().n, 0);
});

test('save, version, manifest, dedup and download round-trip through direct transfer', async t => {
  const f = await fixture(t);
  const alice = await googleUser(f, 'alice');
  const project = await newProject(alice);
  assert.match(project.hostSlug, /^p[a-z2-7]{16}$/);
  const a = file('src/main.gd', 'extends Node\n'), b = file('assets/readme.txt', 'hello'), dup = file('assets/copy.txt', 'hello');
  const first = await save(alice, project.id, [a, b, dup]);
  assert.equal(first.plan.uploads.length, 2, 'identical content inside one save uploads once');
  assert.equal(first.commit.status, 201);
  const c1 = first.commit.data.commit;
  assert.equal(c1.isHead, true);
  assert.equal(c1.fileCount, 3);

  // Unchanged files are reused across saves: only the edited file is uploaded.
  const a2 = file('src/main.gd', 'extends Node2D\n');
  const second = await save(alice, project.id, [a2, b, dup], { expectedHead: c1.id });
  assert.deepEqual(second.plan.files.map(x => x.action).sort(), ['reuse', 'reuse', 'upload']);
  const c2 = second.commit.data.commit;
  assert.equal(c2.parentId, c1.id);

  // Saving the same tree again is a no-op.
  const again = await save(alice, project.id, [a2, b, dup], { expectedHead: c2.id });
  assert.equal(again.plan.uploads.length, 0);
  assert.equal(again.commit.status, 200);
  assert.equal(again.commit.data.unchanged, true);

  const versions = await alice.call(`/api/cdn/projects/${project.id}/versions`);
  assert.deepEqual(versions.data.versions.map(v => v.id), [c2.id, c1.id]);
  const manifest = await alice.call(`/api/cdn/projects/${project.id}/commits/${c1.id}/manifest`);
  assert.deepEqual(manifest.data.files.map(x => [x.path, x.sha256]), [['assets/copy.txt', dup.sha256], ['assets/readme.txt', b.sha256], ['src/main.gd', a.sha256]]);
  assert.equal(JSON.stringify(manifest.data).includes('blobId'), false, 'internal blob IDs stay server-side');

  const dl = await alice.call(`/api/cdn/projects/${project.id}/downloads`, { method: 'POST', body: { commitId: c1.id, path: 'src/main.gd' } });
  assert.equal(dl.status, 200);
  const signed = new URL(dl.data.get.url);
  assert.equal(signed.searchParams.get('response-content-disposition'), 'attachment; filename="main.gd"');
  const fetched = await fetch(dl.data.get.url);
  assert.equal(fetched.headers.get('content-disposition'), 'attachment; filename="main.gd"');
  assert.equal(fetched.headers.get('content-type'), 'application/octet-stream');
  assert.equal(await fetched.text(), 'extends Node\n');

  // Ledger: unique blobs (3 contents) + 2 distinct manifests, no reservations left behind.
  const storage = (await alice.call('/api/cdn/me/storage')).data;
  const blobBytes = f.db.prepare("SELECT SUM(bytes) AS n FROM cdn_blobs WHERE owner=? AND state='LIVE'").get(alice.owner).n;
  assert.equal(storage.usedBytes, blobBytes);
  assert.equal(storage.reservedBytes, 0);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM cdn_blobs WHERE kind='manifest'").get().n, 2);
  // Quarantine is emptied after promotion; clients never get a URL for a final key.
  assert.deepEqual(f.s3.keys('ugc-quarantine-dev'), []);
  for (const u of [...first.plan.uploads, ...second.plan.uploads]) assert.match(new URL(u.put.url).pathname, /^\/ugc-quarantine-dev\/q\//);
  // Signed query strings never reach audit rows.
  const audit = f.db.prepare('SELECT detail FROM audit').all().map(r => r.detail).join('\n');
  assert.equal(/X-Amz-Signature/i.test(audit), false);
});

test('verification rejects content that differs from the declared hash or size', async t => {
  const f = await fixture(t);
  const alice = await googleUser(f, 'alice');
  const project = await newProject(alice);
  const declared = file('a.txt', 'abcde');
  const plan = await alice.call(`/api/cdn/projects/${project.id}/save-plans`, { method: 'POST', body: { files: [{ path: 'a.txt', sha256: declared.sha256, bytes: 5 }] } });
  const upload = plan.data.uploads[0];
  assert.equal((await alice.call('/api/cdn/me/storage')).data.reservedBytes, 5);
  // Wrong length is refused by the signature (content-length is a signed header).
  assert.equal((await put(upload, Buffer.from('abcdef'))).status, 403);
  // Same length, different bytes: accepted by storage, rejected by verification.
  assert.equal((await put(upload, Buffer.from('zzzzz'))).status, 200);
  const done = await alice.call(`/api/cdn/uploads/${upload.uploadId}/complete`, { method: 'POST', body: {} });
  assert.equal(done.status, 422);
  assert.equal(done.data.error.code, 'OBJECT_VALIDATION_FAILED');
  assert.equal((await alice.call(`/api/cdn/uploads/${upload.uploadId}`)).data.state, 'FAILED');
  assert.equal((await alice.call('/api/cdn/me/storage')).data.reservedBytes, 0, 'failed upload returns its reservation');
  assert.deepEqual(f.s3.keys('ugc-quarantine-dev'), []);
  const commit = await alice.call(`/api/cdn/projects/${project.id}/commits`, { method: 'POST', body: { planId: plan.data.planId, expectedHead: null } });
  assert.equal(commit.status, 409);
  assert.equal(commit.data.error.code, 'UPLOADS_INCOMPLETE');
  // Completing before anything arrived is a retryable 409, not a failure.
  const plan2 = await alice.call(`/api/cdn/projects/${project.id}/save-plans`, { method: 'POST', body: { files: [{ path: 'b.txt', sha256: sha('x'), bytes: 1 }] } });
  const early = await alice.call(`/api/cdn/uploads/${plan2.data.uploads[0].uploadId}/complete`, { method: 'POST', body: {} });
  assert.equal(early.data.error.code, 'UPLOAD_NOT_RECEIVED');
  assert.equal((await alice.call(`/api/cdn/uploads/${plan2.data.uploads[0].uploadId}`)).data.state, 'UPLOADING');
});

test('limits: file size, plan quota, path validation', async t => {
  const f = await fixture(t, { maxFileBytes: 2048 });
  const alice = await googleUser(f, 'alice');
  const project = await newProject(alice);
  const plan = files => alice.call(`/api/cdn/projects/${project.id}/save-plans`, { method: 'POST', body: { files } });
  assert.equal((await plan([{ path: 'big.bin', sha256: sha('x'), bytes: 2049 }])).data.error.code, 'FILE_TOO_LARGE');
  for (const bad of ['../x', '/abs', 'a\\b', 'a//b', 'a/./b', '']) assert.equal((await plan([{ path: bad, sha256: sha('x'), bytes: 1 }])).data.error.code, 'INVALID_FILES', bad);
  assert.equal((await plan([{ path: 'a', sha256: sha('x'), bytes: 1 }, { path: 'a', sha256: sha('y'), bytes: 1 }])).data.error.code, 'DUPLICATE_PATH');
  // Free limit is 4096 bytes in this fixture: two 2048-byte uploads fit, a third byte does not.
  assert.equal((await plan([{ path: 'a', sha256: sha('a'), bytes: 2048 }, { path: 'b', sha256: sha('b'), bytes: 2048 }])).status, 201);
  const over = await plan([{ path: 'c', sha256: sha('c'), bytes: 1 }]);
  assert.equal(over.status, 422);
  assert.equal(over.data.error.code, 'STORAGE_LIMIT_EXCEEDED');
  assert.equal(over.data.error.storage.reservedBytes, 4096);
  // An administrator upgrade raises the limit without touching data.
  assert.equal((await f.adminClient.call('/api/admin/session')).status, 200);
  assert.equal((await f.adminClient.call('/api/admin/login', { method: 'POST', body: { username: 'admin', password } })).status, 200);
  f.adminClient.loggedIn = true;
  assert.equal((await f.adminClient.call('/api/admin/cdn/plan', { method: 'POST', body: { owner: alice.owner, plan: 'pro' } })).status, 200);
  assert.equal((await plan([{ path: 'c', sha256: sha('c'), bytes: 1 }])).status, 201);
});

test('optimistic head: concurrent saves from the same parent produce exactly one commit', async t => {
  const f = await fixture(t);
  const alice = await googleUser(f, 'alice');
  const project = await newProject(alice);
  const base = (await save(alice, project.id, [file('a.txt', 'base')])).commit.data.commit;
  const plans = [];
  for (const text of ['left', 'right']) {
    const x = file('a.txt', text);
    const p = await alice.call(`/api/cdn/projects/${project.id}/save-plans`, { method: 'POST', body: { baseCommitId: base.id, files: [{ path: x.path, sha256: x.sha256, bytes: x.bytes }] } });
    await put(p.data.uploads[0], x.content);
    await alice.call(`/api/cdn/uploads/${p.data.uploads[0].uploadId}/complete`, { method: 'POST', body: {} });
    plans.push(p.data.planId);
  }
  const results = await Promise.all(plans.map(planId => alice.call(`/api/cdn/projects/${project.id}/commits`, { method: 'POST', body: { planId, expectedHead: base.id } })));
  assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
  const loser = results.find(r => r.status === 409);
  assert.equal(loser.data.error.code, 'PROJECT_HEAD_CHANGED');
  assert.equal(loser.data.error.headCommitId, results.find(r => r.status === 201).data.commit.id);
  // A stale base is refused already at save-plan time.
  const stale = await alice.call(`/api/cdn/projects/${project.id}/save-plans`, { method: 'POST', body: { baseCommitId: base.id, files: [] } });
  assert.equal(stale.data.error.code, 'PROJECT_HEAD_CHANGED');
});

test('idempotent commit replays the first response', async t => {
  const f = await fixture(t);
  const alice = await googleUser(f, 'alice');
  const project = await newProject(alice);
  const x = file('a.txt', 'one');
  const p = await alice.call(`/api/cdn/projects/${project.id}/save-plans`, { method: 'POST', body: { files: [{ path: x.path, sha256: x.sha256, bytes: x.bytes }] } });
  await put(p.data.uploads[0], x.content);
  await alice.call(`/api/cdn/uploads/${p.data.uploads[0].uploadId}/complete`, { method: 'POST', body: {} });
  const headers = { 'Idempotency-Key': 'save-0001-abcdef' };
  const one = await alice.call(`/api/cdn/projects/${project.id}/commits`, { method: 'POST', body: { planId: p.data.planId, expectedHead: null }, headers });
  const two = await alice.call(`/api/cdn/projects/${project.id}/commits`, { method: 'POST', body: { planId: p.data.planId, expectedHead: null }, headers });
  assert.equal(one.status, 201);
  assert.deepEqual(two, one);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM cdn_commits').get().n, 1);
});

test('expired upload URLs are refused and can be renewed while the save is open', async t => {
  const f = await fixture(t, { uploadUrlTtlSec: 60 });
  const alice = await googleUser(f, 'alice');
  const project = await newProject(alice);
  const x = file('a.txt', 'later');
  const p = await alice.call(`/api/cdn/projects/${project.id}/save-plans`, { method: 'POST', body: { files: [{ path: x.path, sha256: x.sha256, bytes: x.bytes }] } });
  f.clock.skew += 61_000;
  assert.equal((await put(p.data.uploads[0], x.content)).status, 403);
  const renewed = await alice.call(`/api/cdn/uploads/${p.data.uploads[0].uploadId}/renew`, { method: 'POST', body: {} });
  assert.equal(renewed.status, 200);
  assert.equal((await put(renewed.data, x.content)).status, 200);
  assert.equal((await alice.call(`/api/cdn/uploads/${p.data.uploads[0].uploadId}/complete`, { method: 'POST', body: {} })).data.state, 'VERIFIED');
});

test('restore creates a new commit; pins and the head survive retention GC', async t => {
  const f = await fixture(t, { retentionDays: 1, retentionCount: 1 });
  const alice = await googleUser(f, 'alice');
  const project = await newProject(alice);
  let head = null;
  const commits = [];
  for (const text of ['v1', 'v2', 'v3', 'v4']) {
    const c = (await save(alice, project.id, [file('a.txt', text)], { expectedHead: head })).commit.data.commit;
    commits.push(c); head = c.id;
  }
  assert.equal((await alice.call(`/api/cdn/projects/${project.id}/versions/${commits[0].id}/pin`, { method: 'POST', body: {} })).status, 200);
  const restored = await alice.call(`/api/cdn/projects/${project.id}/versions/${commits[1].id}/restore`, { method: 'POST', body: { expectedHead: head } });
  assert.equal(restored.status, 201);
  assert.equal(restored.data.commit.restoredFrom, commits[1].id);
  assert.equal(restored.data.commit.parentId, head);
  head = restored.data.commit.id;
  const v2Manifest = await alice.call(`/api/cdn/projects/${project.id}/commits/${head}/manifest`);
  assert.equal(v2Manifest.data.files[0].sha256, sha('v2'));

  f.clock.skew += 2 * DAY;
  const report = await adminGc(f);
  assert.equal(report.commitsPruned, 3, 'v2, v3, v4 are old and outside the newest 1; v1 is pinned, head is kept');
  const remaining = (await alice.call(`/api/cdn/projects/${project.id}/versions`)).data.versions;
  assert.deepEqual(remaining.map(v => v.id).sort(), [commits[0].id, head].sort());
  assert.equal((await alice.call(`/api/cdn/projects/${project.id}/commits/${commits[2].id}/manifest`)).status, 410);
  // v3 and v4 contents are no longer referenced: their blobs are deleted and refunded. v2 lives on in head.
  const live = f.db.prepare("SELECT sha256 FROM cdn_blobs WHERE kind='file' AND state='LIVE'").all().map(r => r.sha256).sort();
  assert.deepEqual(live, [sha('v1'), sha('v2')].sort());
  const storage = (await alice.call('/api/cdn/me/storage')).data;
  assert.equal(storage.usedBytes, f.db.prepare("SELECT SUM(bytes) AS n FROM cdn_blobs WHERE state='LIVE'").get().n);
  // Downloads of surviving versions still work after GC.
  const dl = await alice.call(`/api/cdn/projects/${project.id}/downloads`, { method: 'POST', body: { commitId: commits[0].id, path: 'a.txt' } });
  assert.equal(await (await fetch(dl.data.get.url)).text(), 'v1');
  // Unpin + GC then drops v1 too.
  await alice.call(`/api/cdn/projects/${project.id}/versions/${commits[0].id}/pin`, { method: 'DELETE' });
  assert.equal((await adminGc(f)).commitsPruned, 1);
});

test('GC never deletes a blob a save-plan leased, and a blob being deleted cannot be referenced', async t => {
  const f = await fixture(t);
  const alice = await googleUser(f, 'alice');
  const project = await newProject(alice);
  const x = file('a.txt', 'shared');
  // Upload + verify, but never commit: blob is LIVE, unreferenced, leased until the plan expires.
  const p1 = await alice.call(`/api/cdn/projects/${project.id}/save-plans`, { method: 'POST', body: { files: [{ path: x.path, sha256: x.sha256, bytes: x.bytes }] } });
  await put(p1.data.uploads[0], x.content);
  await alice.call(`/api/cdn/uploads/${p1.data.uploads[0].uploadId}/complete`, { method: 'POST', body: {} });
  assert.equal((await adminGc(f)).blobsDeleted, 0, 'lease protects the verified upload');

  // A second save reuses it (renewing the lease); GC after the first plan expires still keeps it.
  f.clock.skew += 23 * 60 * 60 * 1000;
  const p2 = await alice.call(`/api/cdn/projects/${project.id}/save-plans`, { method: 'POST', body: { files: [{ path: x.path, sha256: x.sha256, bytes: x.bytes }] } });
  assert.equal(p2.data.files[0].action, 'reuse');
  f.clock.skew += 2 * 60 * 60 * 1000;
  const r = await adminGc(f);
  assert.equal(r.plansExpired, 1);
  assert.equal(r.blobsDeleted, 0);

  // Simulate GC having claimed the blob between plan and commit: the commit must refuse it.
  const blobId = f.db.prepare("SELECT id FROM cdn_blobs WHERE kind='file'").get().id;
  f.db.prepare("UPDATE cdn_blobs SET state='DELETING' WHERE id=?").run(blobId);
  const blocked = await alice.call(`/api/cdn/projects/${project.id}/commits`, { method: 'POST', body: { planId: p2.data.planId, expectedHead: null } });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.data.error.code, 'BLOB_UNAVAILABLE');
  assert.equal(f.db.prepare('SELECT head_commit_id FROM cdn_projects').get().head_commit_id, null, 'failed commit leaves no partial state');
  assert.equal(f.db.prepare('SELECT ref_count FROM cdn_blobs WHERE id=?').get(blobId).ref_count, 0);

  // GC finishes the delete; a fresh save of the same content uploads a new blob instead of reusing.
  f.clock.skew += 2 * DAY;
  const finish = await adminGc(f);
  assert.equal(finish.blobsDeleted >= 1, true);
  assert.equal(f.s3.exists('ugc-projects-dev', `b/${alice.owner}/${blobId}`), false);
  const p3 = await alice.call(`/api/cdn/projects/${project.id}/save-plans`, { method: 'POST', body: { files: [{ path: x.path, sha256: x.sha256, bytes: x.bytes }] } });
  assert.equal(p3.data.files[0].action, 'upload');
  const storage = (await alice.call('/api/cdn/me/storage')).data;
  assert.equal(storage.usedBytes, 0);
  assert.equal(storage.reservedBytes, x.bytes);
});

test('abandoned PENDING writes are cleaned without touching quota', async t => {
  const f = await fixture(t);
  const alice = await googleUser(f, 'alice');
  const project = await newProject(alice);
  const x = file('a.txt', 'crash');
  const p = await alice.call(`/api/cdn/projects/${project.id}/save-plans`, { method: 'POST', body: { files: [{ path: x.path, sha256: x.sha256, bytes: x.bytes }] } });
  await put(p.data.uploads[0], x.content);
  // Storage fails while promoting: the upload is handed back for retry and nothing is charged.
  f.s3.faults.failNext = { method: 'PUT', status: 500 };
  const failed = await alice.call(`/api/cdn/uploads/${p.data.uploads[0].uploadId}/complete`, { method: 'POST', body: {} });
  assert.equal(failed.status, 503);
  assert.equal((await alice.call(`/api/cdn/uploads/${p.data.uploads[0].uploadId}`)).data.state, 'UPLOADING');
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM cdn_blobs WHERE state='PENDING'").get().n, 1);
  const before = (await alice.call('/api/cdn/me/storage')).data;
  const report = await adminGc(f);
  assert.equal(report.pendingCleaned, 1);
  const after = (await alice.call('/api/cdn/me/storage')).data;
  assert.deepEqual([after.usedBytes, after.reservedBytes], [before.usedBytes, before.reservedBytes]);
  // Retrying the completion succeeds.
  assert.equal((await alice.call(`/api/cdn/uploads/${p.data.uploads[0].uploadId}/complete`, { method: 'POST', body: {} })).data.state, 'VERIFIED');
});

test('owner-only access, Google login required, CSRF enforced', async t => {
  const f = await fixture(t);
  const alice = await googleUser(f, 'alice'), bob = await googleUser(f, 'bob');
  const project = await newProject(alice);
  const c = (await save(alice, project.id, [file('a.txt', 'secret')])).commit.data.commit;
  for (const [method, target, body] of [
    ['GET', `/api/cdn/projects/${project.id}/versions`],
    ['GET', `/api/cdn/projects/${project.id}/commits/${c.id}/manifest`],
    ['POST', `/api/cdn/projects/${project.id}/downloads`, { path: 'a.txt' }],
    ['POST', `/api/cdn/projects/${project.id}/save-plans`, { files: [] }],
    ['POST', `/api/cdn/projects/${project.id}/versions/${c.id}/restore`, { expectedHead: c.id }],
  ]) {
    const r = await bob.call(target, { method, body });
    assert.equal(r.status, 404, `${method} ${target}`);
    assert.equal(r.data.error.code, 'PROJECT_NOT_FOUND');
  }
  assert.deepEqual((await bob.call('/api/cdn/projects')).data.projects, []);
  const guest = new Client(f.port, userOrigin);
  await guest.call('/api/session');
  assert.equal((await guest.call('/api/cdn/me/storage')).data.error.code, 'GOOGLE_LOGIN_REQUIRED');
  assert.equal((await alice.call('/api/cdn/projects', { method: 'POST', body: { name: 'x' }, csrf: false })).status, 403);
  // The public listener never serves the admin CDN surface.
  assert.equal((await alice.call('/api/admin/cdn/status')).status, 404);
});

test('local provider is refused when the hub runs with secure cookies', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-cdn-secure-'));
  try {
    assert.throws(() => createApp({
      publicHost: '127.0.0.1', publicPort: 0, adminHost: '127.0.0.1', adminPort: 0, secureCookies: true,
      userOrigins: ['https://app.example'], adminOrigins: [adminOrigin], userBaseUrl: 'https://app.example', dataDir: path.join(root, 'data'),
      cdn: { enabled: true, provider: 'local', buckets: { quarantine: 'q-bucket', projects: 'p-bucket' } },
    }, { rootDir: root, env: {} }), /development only/);
    assert.throws(() => createApp({
      publicHost: '127.0.0.1', publicPort: 0, adminHost: '127.0.0.1', adminPort: 0,
      userOrigins: [userOrigin], adminOrigins: [adminOrigin], userBaseUrl: userOrigin, dataDir: path.join(root, 'data2'),
      cdn: { enabled: true, provider: 'r2', accountId: 'a'.repeat(32), buckets: { quarantine: 'q-bucket', projects: 'p-bucket' } },
    }, { rootDir: root, env: {} }), /PLAYHUB_R2_ACCESS_KEY_ID/);
  } finally { try { fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* createApp failed after opening SQLite; Windows keeps the handle */ } }
});
