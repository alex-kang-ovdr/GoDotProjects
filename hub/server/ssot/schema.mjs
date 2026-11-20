// PlayHub SSOT tables (Phase 1: Leaderboard + User Sanctions Master;
// Phase 2: Player Stats/Achievements + Server-Authoritative MMO DataStore)
// live beside the hub schema without bumping PRAGMA user_version. Every statement is
// additive plain SQL (no views, triggers, or virtual tables) so local SQLite,
// restore-data.mjs verification, and future Turso/libSQL Step 2 DbPort migration work identically.
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

    CREATE TABLE IF NOT EXISTS stat_definitions(
      game_id TEXT NOT NULL,
      stat_key TEXT NOT NULL,
      agg_mode TEXT NOT NULL DEFAULT 'sum' CHECK(agg_mode IN ('sum','max','min','latest')),
      min_value REAL,
      max_value REAL,
      max_delta REAL,
      enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(game_id, stat_key)
    );
    CREATE TABLE IF NOT EXISTS player_stats(
      game_id TEXT NOT NULL,
      stat_key TEXT NOT NULL,
      principal_id TEXT NOT NULL REFERENCES users(id),
      value REAL NOT NULL,
      update_count INTEGER NOT NULL DEFAULT 1 CHECK(update_count >= 1),
      traffic_type TEXT NOT NULL DEFAULT 'live' CHECK(traffic_type IN ('live','qa')),
      qa_run_id TEXT,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(game_id, stat_key, principal_id)
    );
    CREATE INDEX IF NOT EXISTS player_stats_principal
      ON player_stats(principal_id);
    CREATE TABLE IF NOT EXISTS achievement_definitions(
      game_id TEXT NOT NULL,
      achievement_key TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      stat_key TEXT,
      threshold REAL,
      hidden INTEGER NOT NULL DEFAULT 0 CHECK(hidden IN (0,1)),
      points INTEGER NOT NULL DEFAULT 0 CHECK(points >= 0),
      enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(game_id, achievement_key)
    );
    CREATE TABLE IF NOT EXISTS player_achievements(
      game_id TEXT NOT NULL,
      achievement_key TEXT NOT NULL,
      principal_id TEXT NOT NULL REFERENCES users(id),
      unlocked_at INTEGER NOT NULL,
      progress_value REAL,
      source TEXT NOT NULL DEFAULT 'client' CHECK(source IN ('client','server','stat_auto')),
      traffic_type TEXT NOT NULL DEFAULT 'live' CHECK(traffic_type IN ('live','qa')),
      qa_run_id TEXT,
      eos_sync_status TEXT NOT NULL DEFAULT 'not_applicable' CHECK(eos_sync_status IN ('not_applicable','pending','synced','failed')),
      eos_synced_at INTEGER,
      PRIMARY KEY(game_id, achievement_key, principal_id)
    );
    CREATE INDEX IF NOT EXISTS player_achievements_principal
      ON player_achievements(principal_id);
    CREATE TABLE IF NOT EXISTS progression_idempotency(
      game_id TEXT NOT NULL,
      principal_id TEXT NOT NULL REFERENCES users(id),
      request_key TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      response_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY(game_id, principal_id, request_key)
    );

    CREATE TABLE IF NOT EXISTS datastore_quotas(
      game_id TEXT PRIMARY KEY,
      max_keys INTEGER NOT NULL DEFAULT 10000 CHECK(max_keys >= 1),
      max_value_bytes INTEGER NOT NULL DEFAULT 262144 CHECK(max_value_bytes >= 64),
      max_total_bytes INTEGER NOT NULL DEFAULT 67108864 CHECK(max_total_bytes >= 1024),
      default_lease_ms INTEGER NOT NULL DEFAULT 30000 CHECK(default_lease_ms >= 1000),
      max_lease_ms INTEGER NOT NULL DEFAULT 120000 CHECK(max_lease_ms >= 1000),
      enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS datastore_entries(
      game_id TEXT NOT NULL,
      scope TEXT NOT NULL,
      entry_key TEXT NOT NULL,
      owner_principal_id TEXT REFERENCES users(id),
      revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
      value_json TEXT NOT NULL,
      bytes INTEGER NOT NULL CHECK(bytes >= 0),
      etag TEXT NOT NULL,
      fencing_token INTEGER NOT NULL DEFAULT 0 CHECK(fencing_token >= 0),
      lock_holder TEXT,
      lock_expires_at INTEGER,
      updated_by TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(game_id, scope, entry_key)
    );
    CREATE INDEX IF NOT EXISTS datastore_entries_game_scope
      ON datastore_entries(game_id, scope, updated_at DESC);
    CREATE INDEX IF NOT EXISTS datastore_entries_owner
      ON datastore_entries(owner_principal_id);
    CREATE TABLE IF NOT EXISTS datastore_versions(
      id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL,
      scope TEXT NOT NULL,
      entry_key TEXT NOT NULL,
      revision INTEGER NOT NULL,
      value_json TEXT NOT NULL,
      bytes INTEGER NOT NULL,
      reason TEXT NOT NULL DEFAULT 'write',
      updated_by TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS datastore_versions_key
      ON datastore_versions(game_id, scope, entry_key, revision DESC);
  `);
}
