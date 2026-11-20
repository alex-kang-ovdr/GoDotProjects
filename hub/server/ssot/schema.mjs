// PlayHub SSOT tables (Leaderboard + User Sanctions Master) live beside the hub schema
// without bumping PRAGMA user_version. Every statement is additive plain SQL (no views,
// triggers, or virtual tables) so local SQLite, restore-data.mjs verification, and future
// Turso/libSQL Step 2 DbPort migration work identically.
export function ensureSsotSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS leaderboard_boards(
      game_id TEXT NOT NULL,
      board_key TEXT NOT NULL,
      sort_order TEXT NOT NULL DEFAULT 'desc' CHECK(sort_order IN ('desc','asc')),
      score_mode TEXT NOT NULL DEFAULT 'best' CHECK(score_mode IN ('best','sum','latest')),
      reset_period TEXT NOT NULL DEFAULT 'all' CHECK(reset_period IN ('all','daily','weekly','monthly')),
      max_score_bound REAL,
      min_play_ms INTEGER NOT NULL DEFAULT 0 CHECK(min_play_ms >= 0),
      guest_visible INTEGER NOT NULL DEFAULT 1 CHECK(guest_visible IN (0,1)),
      enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(game_id, board_key)
    );
    CREATE TABLE IF NOT EXISTS leaderboard_entries(
      game_id TEXT NOT NULL,
      board_key TEXT NOT NULL,
      period_key TEXT NOT NULL,
      principal_id TEXT NOT NULL REFERENCES users(id),
      score REAL NOT NULL,
      sort_score REAL NOT NULL,
      tie_breaker_ms INTEGER NOT NULL DEFAULT 0,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      submission_count INTEGER NOT NULL DEFAULT 1 CHECK(submission_count >= 1),
      source TEXT NOT NULL DEFAULT 'client' CHECK(source IN ('client','server')),
      traffic_type TEXT NOT NULL DEFAULT 'live' CHECK(traffic_type IN ('live','qa')),
      qa_run_id TEXT,
      excluded INTEGER NOT NULL DEFAULT 0 CHECK(excluded IN (0,1)),
      exclude_reason TEXT,
      achieved_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(game_id, board_key, period_key, principal_id)
    );
    CREATE INDEX IF NOT EXISTS leaderboard_entries_rank
      ON leaderboard_entries(game_id, board_key, period_key, traffic_type, excluded, sort_score DESC, tie_breaker_ms ASC, achieved_at ASC, principal_id ASC);
    CREATE INDEX IF NOT EXISTS leaderboard_entries_principal
      ON leaderboard_entries(principal_id);
    CREATE TABLE IF NOT EXISTS leaderboard_submissions(
      id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL,
      board_key TEXT NOT NULL,
      period_key TEXT NOT NULL,
      principal_id TEXT NOT NULL REFERENCES users(id),
      play_session_id TEXT,
      request_key TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      raw_score REAL NOT NULL,
      accepted INTEGER NOT NULL CHECK(accepted IN (0,1)),
      reject_reason TEXT,
      response_json TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'client' CHECK(source IN ('client','server')),
      traffic_type TEXT NOT NULL DEFAULT 'live' CHECK(traffic_type IN ('live','qa')),
      qa_run_id TEXT,
      created_at INTEGER NOT NULL,
      UNIQUE(game_id, board_key, principal_id, request_key)
    );
    CREATE INDEX IF NOT EXISTS leaderboard_submissions_game_date
      ON leaderboard_submissions(game_id, board_key, created_at DESC);
    CREATE INDEX IF NOT EXISTS leaderboard_submissions_principal
      ON leaderboard_submissions(principal_id);
    CREATE TABLE IF NOT EXISTS user_sanctions(
      id TEXT PRIMARY KEY,
      principal_id TEXT NOT NULL REFERENCES users(id),
      scope TEXT NOT NULL CHECK(scope IN ('all','leaderboard','community','voice','multiplayer')),
      action TEXT NOT NULL CHECK(action IN ('exclude','mute','ban')),
      reason TEXT NOT NULL,
      evidence_json TEXT NOT NULL DEFAULT '{}',
      active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
      expires_at INTEGER,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      revoked_at INTEGER,
      revoked_by TEXT,
      eos_target_puid TEXT,
      eos_sync_status TEXT NOT NULL DEFAULT 'not_applicable' CHECK(eos_sync_status IN ('not_applicable','pending','synced','failed')),
      eos_synced_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS user_sanctions_active
      ON user_sanctions(principal_id, active, scope, expires_at);
    CREATE INDEX IF NOT EXISTS user_sanctions_eos_sync
      ON user_sanctions(eos_sync_status, created_at);
  `);
}
