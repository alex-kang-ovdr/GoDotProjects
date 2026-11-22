// Hub-Shorts SQLite Schema & Idempotency Helpers (Additive Schema-1, no triggers/views).
import { ApiError, digest, safeString } from '../security.mjs';
import { ensureBillingSchema } from '../billing/schema.mjs';

export function ensureShortsSchema(db) {
  ensureBillingSchema(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS shorts_videos (
      id TEXT PRIMARY KEY,
      creator_id TEXT NOT NULL,
      creator_name TEXT NOT NULL,
      game_id TEXT,
      project_id TEXT,
      title TEXT NOT NULL,
      caption TEXT NOT NULL DEFAULT '',
      hashtags_json TEXT NOT NULL DEFAULT '[]',
      prompt TEXT NOT NULL DEFAULT '',
      flow_prompt TEXT NOT NULL DEFAULT '',
      style_preset TEXT NOT NULL DEFAULT 'cinematic',
      camera_motion TEXT NOT NULL DEFAULT 'dynamic-zoom',
      storyboard_json TEXT NOT NULL DEFAULT '{}',
      engine_id TEXT NOT NULL,
      resolved_engine_id TEXT NOT NULL,
      engine_model TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      visibility TEXT NOT NULL DEFAULT 'draft',
      is_primary INTEGER NOT NULL DEFAULT 0,
      progress INTEGER NOT NULL DEFAULT 0,
      stage_label TEXT NOT NULL DEFAULT '',
      error_code TEXT,
      error_message TEXT,
      video_rel_path TEXT,
      poster_rel_path TEXT,
      mime_type TEXT NOT NULL DEFAULT 'video/mp4',
      bytes INTEGER NOT NULL DEFAULT 0,
      sha256 TEXT NOT NULL DEFAULT '',
      duration_sec REAL NOT NULL DEFAULT 0,
      width INTEGER NOT NULL DEFAULT 720,
      height INTEGER NOT NULL DEFAULT 1280,
      aspect_ratio TEXT NOT NULL DEFAULT '9:16',
      quoted_coins INTEGER NOT NULL DEFAULT 0,
      charged_coins INTEGER NOT NULL DEFAULT 0,
      billing_hold_id TEXT,
      billing_journal_entry_id TEXT,
      view_count INTEGER NOT NULL DEFAULT 0,
      like_count INTEGER NOT NULL DEFAULT 0,
      published_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_shorts_videos_public
      ON shorts_videos(status, visibility, published_at DESC, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_shorts_videos_game
      ON shorts_videos(game_id, status, visibility, is_primary DESC, published_at DESC);

    CREATE INDEX IF NOT EXISTS idx_shorts_videos_creator
      ON shorts_videos(creator_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS shorts_likes (
      short_id TEXT NOT NULL,
      principal_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (short_id, principal_id)
    );

    CREATE INDEX IF NOT EXISTS idx_shorts_likes_principal
      ON shorts_likes(principal_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS shorts_views (
      short_id TEXT NOT NULL,
      viewer_key TEXT NOT NULL,
      day_bucket TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (short_id, viewer_key, day_bucket)
    );

    CREATE TABLE IF NOT EXISTS shorts_idempotency (
      scope TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      principal_id TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      response_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (scope, idempotency_key, principal_id)
    );
  `);
}

export function readShortsIdempotency(db, { scope, idempotencyKey, principalId, requestBody }) {
  if (!safeString(idempotencyKey, 128)) return null;
  const reqHash = digest(JSON.stringify(requestBody ?? {}));
  const row = db.prepare(
    'SELECT request_hash, status_code, response_json FROM shorts_idempotency WHERE scope=? AND idempotency_key=? AND principal_id=?'
  ).get(scope, idempotencyKey, principalId);
  if (!row) return { hit: false, requestHash: reqHash };
  if (row.request_hash !== reqHash) {
    throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', '동일한 Idempotency-Key로 다른 요청이 전송되었습니다.');
  }
  return {
    hit: true,
    statusCode: row.status_code,
    body: JSON.parse(row.response_json),
    requestHash: reqHash
  };
}

export function writeShortsIdempotency(db, {
  scope,
  idempotencyKey,
  principalId,
  requestHash,
  statusCode,
  body,
  now = Date.now
}) {
  if (!safeString(idempotencyKey, 128)) return;
  db.prepare(`
    INSERT OR IGNORE INTO shorts_idempotency(
      scope, idempotency_key, principal_id, request_hash, status_code, response_json, created_at
    ) VALUES(?,?,?,?,?,?,?)
  `).run(scope, idempotencyKey, principalId, requestHash, statusCode, JSON.stringify(body), now());
}
