// CDN tables live beside the hub schema without bumping PRAGMA user_version (see docs/cdn/M1_IMPLEMENTATION.md).
// Only additive CREATE ... IF NOT EXISTS statements; every query used by the service is plain SQL that
// also runs on D1 (conditional UPDATE + changes() checks instead of SELECT-then-UPDATE).
export function ensureCdnSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cdn_storage(
      owner TEXT PRIMARY KEY,
      plan TEXT NOT NULL DEFAULT 'free' CHECK(plan IN ('free','pro')),
      used_bytes INTEGER NOT NULL DEFAULT 0 CHECK(used_bytes >= 0),
      reserved_bytes INTEGER NOT NULL DEFAULT 0 CHECK(reserved_bytes >= 0),
      updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS cdn_projects(
      id TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      host_slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      head_commit_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS cdn_projects_by_owner ON cdn_projects(owner, updated_at);
    CREATE TABLE IF NOT EXISTS cdn_blobs(
      id TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('file','manifest')),
      sha256 TEXT NOT NULL,
      bytes INTEGER NOT NULL CHECK(bytes >= 0),
      object_key TEXT NOT NULL UNIQUE,
      state TEXT NOT NULL CHECK(state IN ('PENDING','ABANDONED','LIVE','DELETING','DELETED')),
      ref_count INTEGER NOT NULL DEFAULT 0 CHECK(ref_count >= 0),
      lease_until INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      state_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS cdn_blobs_reuse ON cdn_blobs(owner, kind, sha256, bytes, state);
    CREATE INDEX IF NOT EXISTS cdn_blobs_gc ON cdn_blobs(state, ref_count, lease_until);
    CREATE TABLE IF NOT EXISTS cdn_save_plans(
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES cdn_projects(id),
      owner TEXT NOT NULL,
      base_commit_id TEXT,
      files_json TEXT NOT NULL,
      state TEXT NOT NULL CHECK(state IN ('OPEN','COMMITTED','EXPIRED','CANCELLED')),
      reserved_bytes INTEGER NOT NULL DEFAULT 0 CHECK(reserved_bytes >= 0),
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS cdn_plans_expiry ON cdn_save_plans(state, expires_at);
    CREATE TABLE IF NOT EXISTS cdn_uploads(
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL REFERENCES cdn_save_plans(id),
      owner TEXT NOT NULL,
      path TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      bytes INTEGER NOT NULL,
      quarantine_key TEXT NOT NULL UNIQUE,
      state TEXT NOT NULL CHECK(state IN ('UPLOADING','VERIFYING','VERIFIED','FAILED','EXPIRED','CANCELLED')),
      reserved_bytes INTEGER NOT NULL DEFAULT 0 CHECK(reserved_bytes >= 0),
      blob_id TEXT,
      error_code TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS cdn_uploads_by_plan ON cdn_uploads(plan_id);
    CREATE TABLE IF NOT EXISTS cdn_commits(
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES cdn_projects(id),
      parent_id TEXT,
      manifest_blob_id TEXT NOT NULL REFERENCES cdn_blobs(id),
      manifest_sha256 TEXT NOT NULL,
      file_count INTEGER NOT NULL,
      total_bytes INTEGER NOT NULL,
      author TEXT NOT NULL,
      message TEXT NOT NULL DEFAULT '',
      restored_from TEXT,
      created_at INTEGER NOT NULL,
      pruned_at INTEGER);
    CREATE INDEX IF NOT EXISTS cdn_commits_by_project ON cdn_commits(project_id, created_at);
    CREATE TABLE IF NOT EXISTS cdn_pins(
      commit_id TEXT NOT NULL REFERENCES cdn_commits(id),
      owner TEXT NOT NULL,
      reason TEXT NOT NULL CHECK(reason IN ('user')),
      created_at INTEGER NOT NULL,
      PRIMARY KEY(commit_id, reason));
    CREATE TABLE IF NOT EXISTS cdn_idempotency(
      owner TEXT NOT NULL,
      key TEXT NOT NULL,
      scope TEXT NOT NULL,
      status INTEGER NOT NULL,
      response_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY(owner, key));
  `);
}
