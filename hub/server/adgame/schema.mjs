/**
 * Hub-AdGame SQLite schema (6 additive tables).
 * Keep in sync with hub/tools/restore-data.mjs (OPTIONAL_TABLES)
 * and hub/tools/sanitize-snapshot.mjs (SCHEMA_ALLOWLIST).
 */
export function ensureAdGameSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ad_partners (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      adapter_type TEXT NOT NULL DEFAULT 'web',
      cta_mode TEXT NOT NULL DEFAULT 'install_direct',
      revshare_bps INTEGER NOT NULL DEFAULT 1200,
      cpa_krw INTEGER NOT NULL DEFAULT 1500,
      allowed_origins_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ad_campaigns (
      id TEXT PRIMARY KEY,
      partner_id TEXT NOT NULL,
      demo_game_id TEXT NOT NULL,
      target_game_id TEXT NOT NULL,
      forge_target_game_id TEXT,
      title_ko TEXT NOT NULL,
      subtitle_ko TEXT NOT NULL,
      genre_ko TEXT NOT NULL,
      badge_text TEXT NOT NULL DEFAULT '',
      bundle_kb INTEGER NOT NULL DEFAULT 0,
      demo_duration_sec INTEGER NOT NULL DEFAULT 45,
      reward_type TEXT NOT NULL DEFAULT 'starter_pack',
      reward_payload_json TEXT NOT NULL DEFAULT '{}',
      age_rating TEXT NOT NULL DEFAULT 'ALL',
      region_mode TEXT NOT NULL DEFAULT 'neighborhood',
      sort_order INTEGER NOT NULL DEFAULT 100,
      status TEXT NOT NULL DEFAULT 'active',
      starts_at INTEGER NOT NULL,
      ends_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS ad_demo_sessions (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      partner_id TEXT NOT NULL,
      demo_game_id TEXT NOT NULL,
      target_game_id TEXT NOT NULL,
      region_tag TEXT NOT NULL DEFAULT '잠실4동',
      user_agent_family TEXT NOT NULL DEFAULT 'unknown',
      started_at INTEGER NOT NULL,
      play_ms INTEGER NOT NULL DEFAULT 0,
      best_score INTEGER NOT NULL DEFAULT 0,
      stage_reached INTEGER NOT NULL DEFAULT 1,
      completed_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS ad_handoff_tokens (
      token_hash TEXT PRIMARY KEY,
      short_code TEXT NOT NULL UNIQUE,
      session_id TEXT NOT NULL,
      campaign_id TEXT NOT NULL,
      partner_id TEXT NOT NULL,
      target_game_id TEXT NOT NULL,
      region_tag TEXT NOT NULL DEFAULT '잠실4동',
      snapshot_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'issued',
      claimed_user_id TEXT,
      claimed_device_hash TEXT,
      expires_at INTEGER NOT NULL,
      claimed_at INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ad_funnel_events (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      campaign_id TEXT NOT NULL,
      partner_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      meta_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ad_attributions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      partner_id TEXT NOT NULL,
      campaign_id TEXT NOT NULL,
      handoff_token_hash TEXT NOT NULL UNIQUE,
      install_channel TEXT NOT NULL DEFAULT 'web_fallback',
      qualified_at INTEGER,
      payout_status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_ad_campaigns_partner ON ad_campaigns(partner_id, status, sort_order);
    CREATE INDEX IF NOT EXISTS idx_ad_sessions_campaign ON ad_demo_sessions(campaign_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ad_handoff_short_code ON ad_handoff_tokens(short_code);
    CREATE INDEX IF NOT EXISTS idx_ad_handoff_expires ON ad_handoff_tokens(expires_at);
    CREATE INDEX IF NOT EXISTS idx_ad_funnel_campaign_type ON ad_funnel_events(campaign_id, event_type, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ad_funnel_session ON ad_funnel_events(session_id, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_ad_attributions_partner ON ad_attributions(partner_id, created_at DESC);
  `);
}
