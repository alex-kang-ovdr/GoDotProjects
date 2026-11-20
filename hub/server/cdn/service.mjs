// PlayHub-CDN M1 storage service: immutable blobs + manifest objects + DB commits on R2-compatible storage.
//
// Concurrency rules (see docs/cdn/M1_IMPLEMENTATION.md):
//  * Every DB decision runs in one synchronous transaction() (BEGIN IMMEDIATE); no awaits inside.
//  * Object writes happen outside transactions and are announced first as PENDING blob rows, so a crash
//    between "object written" and "DB updated" leaves something GC can find without listing buckets.
//  * A blob can gain a reference only while state='LIVE' (conditional UPDATE). GC can move it to
//    DELETING only while ref_count=0 and its lease has expired. The two can therefore never both win.
import { createHash, randomBytes } from 'node:crypto';
import { ApiError, uid } from '../security.mjs';
import { transaction } from '../db.mjs';

const SHA256 = /^[a-f0-9]{64}$/;
const sha256Hex = bytes => createHash('sha256').update(bytes).digest('hex');
const iso = ms => new Date(ms).toISOString();
const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';

function hostSlug() {
  const bytes = randomBytes(10); let bits = 0, value = 0, out = '';
  for (const byte of bytes) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { out += BASE32[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  return 'p' + out;
}

export function validatePath(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 512) return false;
  if (value.startsWith('/') || value.includes('\\') || /[\x00-\x1f\x7f]/.test(value)) return false;
  return value.split('/').every(segment => segment && segment !== '.' && segment !== '..' && segment.trim() === segment);
}

/** Canonical manifest: fixed key order, files sorted by path (code-unit order). */
export function buildManifest(projectId, files) {
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const treeSha256 = sha256Hex(JSON.stringify(sorted.map(f => [f.path, f.sha256, f.bytes])));
  const manifest = { schemaVersion: 2, projectId, treeSha256, files: sorted.map(f => ({ path: f.path, sha256: f.sha256, bytes: f.bytes, blobId: f.blobId })) };
  const bytes = Buffer.from(JSON.stringify(manifest), 'utf8');
  return { manifest, bytes, sha256: sha256Hex(bytes), treeSha256 };
}

export function createCdnService({ db, store, quota, now, audit = () => {}, settings }) {
  const s = settings;
  const tx = fn => transaction(db, fn);

  // ---------- views ----------
  const projectView = p => ({
    id: p.id, name: p.name, hostSlug: p.host_slug, headCommitId: p.head_commit_id || null,
    createdAt: iso(p.created_at), updatedAt: iso(p.updated_at), trashedAt: p.trashed_at ? iso(p.trashed_at) : null,
  });
  function commitView(c, head, pinned) {
    return { id: c.id, parentId: c.parent_id || null, message: c.message, fileCount: c.file_count, totalBytes: c.total_bytes, restoredFrom: c.restored_from || null, createdAt: iso(c.created_at), isHead: c.id === head, pinned: Boolean(pinned) };
  }
  const isPinned = id => Boolean(db.prepare('SELECT 1 FROM cdn_pins WHERE commit_id=?').get(id));

  // ---------- lookups ----------
  function projectFor(owner, id) {
    const p = db.prepare('SELECT * FROM cdn_projects WHERE id=? AND owner=?').get(id, owner);
    if (!p) throw new ApiError(404, 'PROJECT_NOT_FOUND');
    return p;
  }
  function assertNotTrashed(project) {
    if (project.trashed_at !== null && project.trashed_at !== undefined) {
      throw new ApiError(409, 'PROJECT_TRASHED', 'PROJECT_TRASHED', { trashedAt: iso(project.trashed_at) });
    }
  }
  function assertNotOverQuota(owner) {
    const q = quota.snapshot(owner);
    if (q.usedBytes > q.limitBytes) {
      throw new ApiError(403, 'QUOTA_EXCEEDED', 'QUOTA_EXCEEDED', { storage: { ...q, overQuota: true } });
    }
  }
  function commitFor(project, commitId) {
    const c = db.prepare('SELECT * FROM cdn_commits WHERE id=? AND project_id=?').get(commitId, project.id);
    if (!c) throw new ApiError(404, 'VERSION_NOT_FOUND');
    if (c.pruned_at) throw new ApiError(410, 'VERSION_NO_LONGER_AVAILABLE');
    return c;
  }
  function assertHead(project, expectedHead) {
    const row = db.prepare('SELECT head_commit_id, trashed_at FROM cdn_projects WHERE id=?').get(project.id);
    if (!row) throw new ApiError(404, 'PROJECT_NOT_FOUND');
    assertNotTrashed(row);
    const current = row.head_commit_id || null;
    if ((expectedHead ?? null) !== current) throw new ApiError(409, 'PROJECT_HEAD_CHANGED', 'PROJECT_HEAD_CHANGED', { headCommitId: current });
  }
  async function readManifest(commit) {
    const blob = db.prepare('SELECT * FROM cdn_blobs WHERE id=?').get(commit.manifest_blob_id);
    if (!blob || blob.state !== 'LIVE') throw new ApiError(410, 'VERSION_NO_LONGER_AVAILABLE');
    const result = await store.read('projects', blob.object_key, s.maxManifestBytes);
    if (!result || result.tooLarge || sha256Hex(result.bytes) !== blob.sha256) throw new ApiError(503, 'STORAGE_INTEGRITY_ERROR');
    return JSON.parse(result.bytes.toString('utf8'));
  }
  function idempotent(owner, key, scope) {
    if (!key) return null;
    if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(key)) throw new ApiError(400, 'INVALID_IDEMPOTENCY_KEY');
    const row = db.prepare('SELECT * FROM cdn_idempotency WHERE owner=? AND key=?').get(owner, key);
    if (!row) return null;
    if (row.scope !== scope) throw new ApiError(422, 'IDEMPOTENCY_KEY_REUSED');
    return { status: row.status, body: JSON.parse(row.response_json) };
  }
  function remember(owner, key, scope, status, body) {
    if (key) db.prepare('INSERT INTO cdn_idempotency(owner,key,scope,status,response_json,created_at) VALUES(?,?,?,?,?,?)').run(owner, key, scope, status, JSON.stringify(body), now());
  }
  function reusableBlob(owner, kind, sha256, bytes) {
    return db.prepare("SELECT id FROM cdn_blobs WHERE owner=? AND kind=? AND sha256=? AND bytes=? AND state='LIVE' ORDER BY created_at LIMIT 1").get(owner, kind, sha256, bytes);
  }
  function leaseBlob(id, until) {
    return db.prepare("UPDATE cdn_blobs SET lease_until=MAX(lease_until,?) WHERE id=? AND state='LIVE'").run(until, id).changes === 1;
  }
  function addReference(owner, blobId) {
    const r = db.prepare("UPDATE cdn_blobs SET ref_count=ref_count+1 WHERE id=? AND owner=? AND state='LIVE'").run(blobId, owner);
    if (r.changes !== 1) throw new ApiError(409, 'BLOB_UNAVAILABLE', 'BLOB_UNAVAILABLE', { blobId });
  }
  function presignUpload(upload) {
    const put = store.presignPut('quarantine', upload.quarantine_key, { contentLength: upload.bytes, expiresIn: s.uploadUrlTtlSec });
    return { uploadId: upload.id, sha256: upload.sha256, bytes: upload.bytes, put, urlExpiresAt: iso(now() + s.uploadUrlTtlSec * 1000) };
  }

  // ---------- storage + projects ----------
  function storage(owner) {
    const q = quota.snapshot(owner);
    const counts = db.prepare(`SELECT
      COALESCE(SUM(CASE WHEN trashed_at IS NULL THEN 1 ELSE 0 END), 0) AS projects,
      COALESCE(SUM(CASE WHEN trashed_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS trashedProjects
      FROM cdn_projects WHERE owner=?`).get(owner);
    const pins = db.prepare('SELECT COUNT(*) AS n FROM cdn_pins WHERE owner=?').get(owner).n;
    return {
      ...q,
      availableBytes: Math.max(0, q.limitBytes - q.usedBytes - q.reservedBytes),
      overQuota: q.usedBytes > q.limitBytes,
      projects: counts.projects,
      trashedProjects: counts.trashedProjects,
      pins,
      maxPins: s.maxPins,
    };
  }

  function createProject(owner, { name }) {
    const clean = typeof name === 'string' ? name.trim() : '';
    if (!clean || clean.length > 80 || /[\x00-\x1f\x7f]/.test(clean)) throw new ApiError(400, 'INVALID_NAME');
    const count = db.prepare('SELECT COUNT(*) AS n FROM cdn_projects WHERE owner=?').get(owner).n;
    if (count >= s.maxProjects) throw new ApiError(422, 'PROJECT_LIMIT_EXCEEDED');
    quota.snapshot(owner);
    const id = uid(), stamp = now();
    db.prepare('INSERT INTO cdn_projects(id,owner,host_slug,name,head_commit_id,created_at,updated_at) VALUES(?,?,?,?,NULL,?,?)').run(id, owner, hostSlug(), clean, stamp, stamp);
    return projectView(projectFor(owner, id));
  }

  function listProjects(owner, filter = 'active') {
    const active = db.prepare('SELECT * FROM cdn_projects WHERE owner=? AND trashed_at IS NULL ORDER BY updated_at DESC').all(owner).map(projectView);
    const trashed = db.prepare('SELECT * FROM cdn_projects WHERE owner=? AND trashed_at IS NOT NULL ORDER BY trashed_at DESC, updated_at DESC').all(owner).map(projectView);
    if (filter === 'only') return { projects: trashed, trashedProjects: trashed };
    if (filter === 'all') {
      const all = db.prepare('SELECT * FROM cdn_projects WHERE owner=? ORDER BY updated_at DESC').all(owner).map(projectView);
      return { projects: all, trashedProjects: trashed };
    }
    return { projects: active, trashedProjects: trashed };
  }

  function trashProject(owner, projectId) {
    const updated = tx(() => {
      const p = projectFor(owner, projectId);
      if (p.trashed_at !== null && p.trashed_at !== undefined) return { project: p, changed: false };
      const stamp = now();
      db.prepare('UPDATE cdn_projects SET trashed_at=?, updated_at=? WHERE id=? AND owner=? AND trashed_at IS NULL').run(stamp, stamp, p.id, owner);
      return { project: projectFor(owner, p.id), changed: true };
    });
    if (updated.changed) audit('cdn_project_trashed', updated.project.id, { owner });
    return projectView(updated.project);
  }

  function restoreProject(owner, projectId) {
    const updated = tx(() => {
      const p = projectFor(owner, projectId);
      if (p.trashed_at === null || p.trashed_at === undefined) return { project: p, changed: false };
      const stamp = now();
      db.prepare('UPDATE cdn_projects SET trashed_at=NULL, updated_at=? WHERE id=? AND owner=? AND trashed_at IS NOT NULL').run(stamp, p.id, owner);
      return { project: projectFor(owner, p.id), changed: true };
    });
    if (updated.changed) audit('cdn_project_restored', updated.project.id, { owner });
    return projectView(updated.project);
  }

  // ---------- save plan ----------
  function createSavePlan(owner, projectId, body) {
    const project = projectFor(owner, projectId);
    assertNotTrashed(project);
    assertNotOverQuota(owner);
    const files = body.files;
    if (!Array.isArray(files) || files.length > s.maxFilesPerSave) throw new ApiError(400, 'INVALID_FILES');
    const seen = new Set();
    for (const f of files) {
      if (!f || typeof f !== 'object' || !validatePath(f.path) || !SHA256.test(f.sha256 || '') || !Number.isSafeInteger(f.bytes) || f.bytes < 0) throw new ApiError(400, 'INVALID_FILES');
      if (f.bytes > s.maxFileBytes) throw new ApiError(422, 'FILE_TOO_LARGE', 'FILE_TOO_LARGE', { path: f.path, maxFileBytes: s.maxFileBytes });
      if (seen.has(f.path)) throw new ApiError(400, 'DUPLICATE_PATH');
      seen.add(f.path);
    }
    const planId = uid(), stamp = now(), expiresAt = stamp + s.saveSessionTtlSec * 1000;
    const result = tx(() => {
      assertHead(project, body.baseCommitId);
      assertNotOverQuota(owner);
      const entries = [], uploads = new Map();
      for (const f of files) {
        const key = `${f.sha256}:${f.bytes}`;
        if (!uploads.has(key)) {
          const reuse = reusableBlob(owner, 'file', f.sha256, f.bytes);
          if (reuse && leaseBlob(reuse.id, expiresAt)) { entries.push({ path: f.path, sha256: f.sha256, bytes: f.bytes, blobId: reuse.id, uploadId: null }); continue; }
          uploads.set(key, { id: uid(), sha256: f.sha256, bytes: f.bytes });
        }
        entries.push({ path: f.path, sha256: f.sha256, bytes: f.bytes, blobId: null, uploadId: uploads.get(key).id });
      }
      const reserved = [...uploads.values()].reduce((n, u) => n + u.bytes, 0);
      quota.reserve(owner, reserved);
      db.prepare("INSERT INTO cdn_save_plans(id,project_id,owner,base_commit_id,files_json,state,reserved_bytes,expires_at,created_at) VALUES(?,?,?,?,?,'OPEN',?,?,?)")
        .run(planId, project.id, owner, project.head_commit_id || null, JSON.stringify(entries), reserved, expiresAt, stamp);
      const insert = db.prepare("INSERT INTO cdn_uploads(id,plan_id,owner,path,sha256,bytes,quarantine_key,state,reserved_bytes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'UPLOADING',?,?,?)");
      const rows = [];
      for (const u of uploads.values()) {
        const path = entries.find(e => e.uploadId === u.id).path;
        const row = { id: u.id, plan_id: planId, sha256: u.sha256, bytes: u.bytes, quarantine_key: `q/${owner}/${u.id}` };
        insert.run(u.id, planId, owner, path, u.sha256, u.bytes, row.quarantine_key, u.bytes, stamp, stamp);
        rows.push(row);
      }
      return { entries, rows, reserved };
    });
    return {
      planId, baseCommitId: project.head_commit_id || null, expiresAt: iso(expiresAt), reservedBytes: result.reserved,
      files: result.entries.map(e => ({ path: e.path, action: e.blobId ? 'reuse' : 'upload', uploadId: e.uploadId })),
      uploads: result.rows.map(presignUpload),
    };
  }

  function uploadFor(owner, uploadId) {
    const u = db.prepare('SELECT * FROM cdn_uploads WHERE id=? AND owner=?').get(uploadId, owner);
    if (!u) throw new ApiError(404, 'UPLOAD_NOT_FOUND');
    return u;
  }
  const uploadView = u => ({ uploadId: u.id, planId: u.plan_id, path: u.path, sha256: u.sha256, bytes: u.bytes, state: u.state, errorCode: u.error_code || null });
  function openPlan(planId) {
    const plan = db.prepare('SELECT * FROM cdn_save_plans WHERE id=?').get(planId);
    if (!plan || plan.state !== 'OPEN') throw new ApiError(409, 'SAVE_PLAN_CLOSED');
    if (plan.expires_at <= now()) throw new ApiError(410, 'SAVE_PLAN_EXPIRED');
    const project = db.prepare('SELECT trashed_at FROM cdn_projects WHERE id=?').get(plan.project_id);
    if (!project) throw new ApiError(404, 'PROJECT_NOT_FOUND');
    assertNotTrashed(project);
    return plan;
  }

  function renewUpload(owner, uploadId) {
    const u = uploadFor(owner, uploadId);
    if (u.state !== 'UPLOADING') throw new ApiError(409, 'UPLOAD_NOT_ACTIVE', 'UPLOAD_NOT_ACTIVE', { state: u.state });
    openPlan(u.plan_id);
    return presignUpload(u);
  }

  function getUpload(owner, uploadId) { return uploadView(uploadFor(owner, uploadId)); }

  async function completeUpload(owner, uploadId) {
    const u = uploadFor(owner, uploadId);
    if (u.state === 'VERIFIED') return uploadView(u);
    if (u.state !== 'UPLOADING') throw new ApiError(409, u.state === 'VERIFYING' ? 'UPLOAD_RECONCILING' : 'UPLOAD_NOT_ACTIVE', undefined, { state: u.state });
    const plan = openPlan(u.plan_id);
    const claimed = db.prepare("UPDATE cdn_uploads SET state='VERIFYING', updated_at=? WHERE id=? AND state='UPLOADING'").run(now(), u.id);
    if (claimed.changes !== 1) throw new ApiError(409, 'UPLOAD_RECONCILING');
    const backToUploading = () => db.prepare("UPDATE cdn_uploads SET state='UPLOADING', updated_at=? WHERE id=? AND state='VERIFYING'").run(now(), u.id);
    const fail = code => {
      tx(() => {
        const r = db.prepare("UPDATE cdn_uploads SET state='FAILED', error_code=?, reserved_bytes=0, updated_at=? WHERE id=? AND state='VERIFYING'").run(code, now(), u.id);
        if (r.changes === 1) { quota.release(owner, u.reserved_bytes); db.prepare('UPDATE cdn_save_plans SET reserved_bytes=MAX(0,reserved_bytes-?) WHERE id=?').run(u.reserved_bytes, u.plan_id); }
      });
    };
    let object;
    try { object = await store.read('quarantine', u.quarantine_key, u.bytes); } catch (error) { backToUploading(); throw error; }
    if (!object) { backToUploading(); throw new ApiError(409, 'UPLOAD_NOT_RECEIVED'); }
    if (object.tooLarge || object.bytes.length !== u.bytes || sha256Hex(object.bytes) !== u.sha256) {
      fail('CONTENT_MISMATCH');
      await store.delete('quarantine', u.quarantine_key).catch(() => {});
      throw new ApiError(422, 'OBJECT_VALIDATION_FAILED', 'OBJECT_VALIDATION_FAILED', { path: u.path });
    }
    // Another upload of the same content may have been promoted meanwhile: reuse it instead.
    let settledByReuse;
    try {
      settledByReuse = tx(() => {
        openPlan(u.plan_id);
        const reuse = reusableBlob(owner, 'file', u.sha256, u.bytes);
        if (!reuse || !leaseBlob(reuse.id, plan.expires_at)) return false;
        const upd = db.prepare("UPDATE cdn_uploads SET state='VERIFIED', blob_id=?, reserved_bytes=0, updated_at=? WHERE id=? AND state='VERIFYING'").run(reuse.id, now(), u.id);
        if (upd.changes !== 1) throw new ApiError(409, 'UPLOAD_RECONCILING');
        quota.release(owner, u.reserved_bytes);
        db.prepare('UPDATE cdn_save_plans SET reserved_bytes=MAX(0,reserved_bytes-?) WHERE id=?').run(u.reserved_bytes, u.plan_id);
        return true;
      });
    } catch (error) { backToUploading(); throw error; }
    if (!settledByReuse) {
      const blobId = uid(), key = `b/${owner}/${blobId}`, stamp = now();
      db.prepare("INSERT INTO cdn_blobs(id,owner,kind,sha256,bytes,object_key,state,ref_count,lease_until,created_at,state_at) VALUES(?,?,'file',?,?,?,'PENDING',0,?,?,?)")
        .run(blobId, owner, u.sha256, u.bytes, key, plan.expires_at, stamp, stamp);
      // Write exactly the bytes we verified to a key the client can never write to.
      try { await store.put('projects', key, object.bytes); } catch (error) { backToUploading(); throw error; }
      try {
        tx(() => {
          openPlan(u.plan_id);
          const live = db.prepare("UPDATE cdn_blobs SET state='LIVE', state_at=? WHERE id=? AND state='PENDING'").run(now(), blobId);
          if (live.changes !== 1) throw new ApiError(409, 'UPLOAD_RECONCILING');
          const upd = db.prepare("UPDATE cdn_uploads SET state='VERIFIED', blob_id=?, reserved_bytes=0, updated_at=? WHERE id=? AND state='VERIFYING'").run(blobId, now(), u.id);
          if (upd.changes !== 1) throw new ApiError(409, 'UPLOAD_RECONCILING');
          quota.settle(owner, u.reserved_bytes, u.bytes);
          db.prepare('UPDATE cdn_save_plans SET reserved_bytes=MAX(0,reserved_bytes-?) WHERE id=?').run(u.reserved_bytes, u.plan_id);
        });
      } catch (error) { backToUploading(); throw error; }
    }
    await store.delete('quarantine', u.quarantine_key).catch(() => {});
    return uploadView(uploadFor(owner, uploadId));
  }

  // ---------- commits ----------
  async function writeManifest(owner, projectId, files) {
    const built = buildManifest(projectId, files);
    if (built.bytes.length > s.maxManifestBytes) throw new ApiError(422, 'MANIFEST_TOO_LARGE');
    const existing = reusableBlob(owner, 'manifest', built.sha256, built.bytes.length);
    if (existing) return { ...built, blobId: existing.id, isNew: false };
    const blobId = uid(), key = `m/${owner}/${blobId}.json`, stamp = now();
    db.prepare("INSERT INTO cdn_blobs(id,owner,kind,sha256,bytes,object_key,state,ref_count,lease_until,created_at,state_at) VALUES(?,?,'manifest',?,?,?,'PENDING',0,0,?,?)")
      .run(blobId, owner, built.sha256, built.bytes.length, key, stamp, stamp);
    await store.put('projects', key, built.bytes, 'application/json');
    return { ...built, blobId, isNew: true };
  }

  /** Inside a transaction: make the manifest LIVE (charging quota once) and reference every blob. */
  function referenceTree(owner, written, files) {
    if (written.isNew) {
      const live = db.prepare("UPDATE cdn_blobs SET state='LIVE', state_at=? WHERE id=? AND state='PENDING'").run(now(), written.blobId);
      if (live.changes !== 1) throw new ApiError(409, 'BLOB_UNAVAILABLE');
      quota.charge(owner, written.bytes.length);
    }
    for (const blobId of new Set([written.blobId, ...files.map(f => f.blobId)])) addReference(owner, blobId);
  }

  function insertCommit(project, owner, written, files, { message = '', restoredFrom = null }) {
    const id = uid(), stamp = now();
    const total = files.reduce((n, f) => n + f.bytes, 0);
    db.prepare('INSERT INTO cdn_commits(id,project_id,parent_id,manifest_blob_id,manifest_sha256,file_count,total_bytes,author,message,restored_from,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
      .run(id, project.id, db.prepare('SELECT head_commit_id FROM cdn_projects WHERE id=?').get(project.id).head_commit_id, written.blobId, written.sha256, files.length, total, owner, message, restoredFrom, stamp);
    db.prepare('UPDATE cdn_projects SET head_commit_id=?, updated_at=? WHERE id=?').run(id, stamp, project.id);
    return db.prepare('SELECT * FROM cdn_commits WHERE id=?').get(id);
  }

  function headTree(project) {
    const head = db.prepare('SELECT c.* FROM cdn_projects p JOIN cdn_commits c ON c.id=p.head_commit_id WHERE p.id=?').get(project.id);
    return head || null;
  }

  async function commit(owner, projectId, body, idempotencyKey) {
    const replay = idempotent(owner, idempotencyKey, `commit:${projectId}`);
    if (replay) return replay;
    const project = projectFor(owner, projectId);
    assertNotTrashed(project);
    assertNotOverQuota(owner);
    const message = typeof body.message === 'string' ? body.message.trim().slice(0, 500) : '';
    const plan = db.prepare('SELECT * FROM cdn_save_plans WHERE id=? AND owner=? AND project_id=?').get(body.planId, owner, project.id);
    if (!plan) throw new ApiError(404, 'SAVE_PLAN_NOT_FOUND');
    openPlan(plan.id);
    const entries = JSON.parse(plan.files_json);
    const pending = [];
    const files = entries.map(e => {
      if (e.blobId) return e;
      const u = db.prepare('SELECT state, blob_id FROM cdn_uploads WHERE id=?').get(e.uploadId);
      if (u.state !== 'VERIFIED') pending.push(e.path);
      return { ...e, blobId: u.blob_id };
    });
    if (pending.length) throw new ApiError(409, 'UPLOADS_INCOMPLETE', 'UPLOADS_INCOMPLETE', { pending: pending.slice(0, 50) });
    const head = headTree(project);
    const written = await writeManifest(owner, project.id, files);
    const response = tx(() => {
      assertHead(project, body.expectedHead);
      assertNotOverQuota(owner);
      const closed = db.prepare("UPDATE cdn_save_plans SET state='COMMITTED', reserved_bytes=0 WHERE id=? AND state='OPEN'").run(plan.id);
      if (closed.changes !== 1) throw new ApiError(409, 'SAVE_PLAN_CLOSED');
      // All uploads are VERIFIED here, so this is normally 0; it only guards against ledger drift.
      quota.release(owner, db.prepare('SELECT COALESCE(SUM(reserved_bytes),0) AS n FROM cdn_uploads WHERE plan_id=?').get(plan.id).n);
      db.prepare('UPDATE cdn_uploads SET reserved_bytes=0 WHERE plan_id=?').run(plan.id);
      if (head && head.manifest_sha256 === written.sha256) {
        const out = { unchanged: true, commit: commitView(head, head.id, isPinned(head.id)) };
        remember(owner, idempotencyKey, `commit:${projectId}`, 200, out);
        return { status: 200, body: out };
      }
      referenceTree(owner, written, files);
      const c = insertCommit(project, owner, written, files, { message });
      const out = { unchanged: false, commit: commitView(c, c.id, false) };
      remember(owner, idempotencyKey, `commit:${projectId}`, 201, out);
      return { status: 201, body: out };
    });
    return response;
  }

  function listVersions(owner, projectId) {
    const project = projectFor(owner, projectId);
    const rows = db.prepare('SELECT c.*, EXISTS(SELECT 1 FROM cdn_pins p WHERE p.commit_id=c.id) AS pinned FROM cdn_commits c WHERE c.project_id=? AND c.pruned_at IS NULL ORDER BY c.created_at DESC, c.rowid DESC').all(project.id);
    return { project: projectView(project), versions: rows.map(c => commitView(c, project.head_commit_id, c.pinned)) };
  }

  async function getManifest(owner, projectId, commitId) {
    const project = projectFor(owner, projectId);
    const c = commitFor(project, commitId);
    const manifest = await readManifest(c);
    return { commitId: c.id, treeSha256: manifest.treeSha256, files: manifest.files.map(f => ({ path: f.path, sha256: f.sha256, bytes: f.bytes })) };
  }

  async function restore(owner, projectId, commitId, body, idempotencyKey) {
    const scope = `restore:${projectId}:${commitId}`;
    const replay = idempotent(owner, idempotencyKey, scope);
    if (replay) return replay;
    const project = projectFor(owner, projectId);
    assertNotTrashed(project);
    const source = commitFor(project, commitId);
    const manifest = await readManifest(source);
    const written = { blobId: source.manifest_blob_id, sha256: source.manifest_sha256, isNew: false };
    return tx(() => {
      assertHead(project, body.expectedHead);
      const head = headTree(project);
      if (head && head.manifest_sha256 === source.manifest_sha256) {
        const out = { unchanged: true, commit: commitView(head, head.id, isPinned(head.id)) };
        remember(owner, idempotencyKey, scope, 200, out);
        return { status: 200, body: out };
      }
      referenceTree(owner, written, manifest.files);
      const c = insertCommit(project, owner, written, manifest.files, { message: `restore ${source.id}`, restoredFrom: source.id });
      audit('cdn_restore', project.id, { from: source.id, to: c.id });
      const out = { unchanged: false, commit: commitView(c, c.id, false) };
      remember(owner, idempotencyKey, scope, 201, out);
      return { status: 201, body: out };
    });
  }

  function pin(owner, projectId, commitId) {
    const project = projectFor(owner, projectId);
    assertNotTrashed(project);
    const c = commitFor(project, commitId);
    return tx(() => {
      assertNotTrashed(projectFor(owner, projectId));
      if (isPinned(c.id)) return { pinned: true, commitId: c.id };
      const count = db.prepare('SELECT COUNT(*) AS n FROM cdn_pins WHERE owner=?').get(owner).n;
      if (count >= s.maxPins) throw new ApiError(422, 'PIN_LIMIT_EXCEEDED', 'PIN_LIMIT_EXCEEDED', { maxPins: s.maxPins });
      db.prepare("INSERT INTO cdn_pins(commit_id,owner,reason,created_at) VALUES(?,?,'user',?)").run(c.id, owner, now());
      return { pinned: true, commitId: c.id };
    });
  }

  function unpin(owner, projectId, commitId) {
    const project = projectFor(owner, projectId);
    const c = commitFor(project, commitId);
    db.prepare("DELETE FROM cdn_pins WHERE commit_id=? AND reason='user'").run(c.id);
    return { pinned: false, commitId: c.id };
  }

  async function download(owner, projectId, body) {
    const project = projectFor(owner, projectId);
    const commitId = body.commitId || project.head_commit_id;
    if (!commitId) throw new ApiError(404, 'VERSION_NOT_FOUND');
    if (!validatePath(body.path)) throw new ApiError(400, 'INVALID_PATH');
    const c = commitFor(project, commitId);
    const manifest = await readManifest(c);
    const file = manifest.files.find(f => f.path === body.path);
    if (!file) throw new ApiError(404, 'FILE_NOT_FOUND');
    const blob = db.prepare("SELECT * FROM cdn_blobs WHERE id=? AND owner=? AND state='LIVE'").get(file.blobId, owner);
    if (!blob) throw new ApiError(410, 'VERSION_NO_LONGER_AVAILABLE');
    const get = store.presignGet('projects', blob.object_key, { expiresIn: s.downloadUrlTtlSec, filename: body.path.split('/').pop() });
    return { commitId: c.id, path: file.path, bytes: file.bytes, sha256: file.sha256, get, urlExpiresAt: iso(now() + s.downloadUrlTtlSec * 1000) };
  }

  return {
    storage, createProject, listProjects, trashProject, restoreProject,
    createSavePlan, renewUpload, getUpload, completeUpload,
    commit, listVersions, getManifest, restore, pin, unpin, download, readManifest,
  };
}
