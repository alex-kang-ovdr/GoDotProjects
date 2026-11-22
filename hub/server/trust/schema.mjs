// Flywheel 3 [Trust, Quality & Margin Defense Engine] additive SQLite schema (5 tables).
// Strictly preserves PRAGMA user_version = 1 with plain CREATE TABLE IF NOT EXISTS only
// (no views, triggers, or virtual tables) for restore-data.mjs & Turso/libSQL compatibility.
// Keep in sync with hub/tools/restore-data.mjs (OPTIONAL_TABLES)
// and hub/tools/sanitize-snapshot.mjs (SCHEMA_ALLOWLIST + DROP_TABLES).

export const TRUST_OPTIONAL_TABLES = Object.freeze({
  user_consents: ['principal_id', 'purpose', 'granted', 'policy_version', 'source', 'updated_at'],
  risk_assessments: [
    'id', 'domain', 'entity_type', 'entity_id', 'principal_id', 'model_version',
    'risk_score', 'decision', 'top_factors_json', 'feature_snapshot_json', 'created_at'
  ],
  risk_review_queue: [
    'id', 'assessment_id', 'domain', 'principal_id', 'target_ref', 'status',
    'assigned_to', 'resolution_note', 'explanation_ko', 'user_appeal_text',
    'sla_due_at', 'resolved_at', 'created_at'
  ],
  desktop_shader_telemetry: [
    'id', 'game_id', 'game_version', 'engine_version', 'renderer',
    'gpu_vendor', 'gpu_name', 'driver_version', 'cold_start', 'first_frame_ms',
    'frame_p95_ms', 'frame_p99_ms', 'max_frame_ms', 'hitch_50ms', 'hitch_100ms',
    'pipeline_counts_json', 'created_at'
  ],
  mmo_room_telemetry: [
    'id', 'room_id', 'game_id', 'is_party', 'online_count', 'bot_count',
    'rtt_p50_ms', 'rtt_p95_ms', 'events_received_delta', 'sampled_at'
  ]
});

export function ensureTrustSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_consents (
      principal_id TEXT NOT NULL REFERENCES users(id),
      purpose TEXT NOT NULL CHECK(purpose IN (
        'analytics',
        'personalization',
        'ai_training_play',
        'ai_training_creator',
        'marketing_push',
        'marketing_email'
      )),
      granted INTEGER NOT NULL DEFAULT 0 CHECK(granted IN (0, 1)),
      policy_version TEXT NOT NULL DEFAULT '2026-11-v1',
      source TEXT NOT NULL DEFAULT 'web',
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (principal_id, purpose)
    );
    CREATE INDEX IF NOT EXISTS idx_user_consents_purpose ON user_consents(purpose, granted);

    CREATE TABLE IF NOT EXISTS risk_assessments (
      id TEXT PRIMARY KEY,
      domain TEXT NOT NULL CHECK(domain IN ('leaderboard', 'cpa', 'billing_a', 'billing_b', 'mmo')),
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      principal_id TEXT,
      model_version TEXT NOT NULL,
      risk_score REAL NOT NULL CHECK(risk_score >= 0 AND risk_score <= 1),
      decision TEXT NOT NULL CHECK(decision IN ('ALLOW', 'FLAG', 'PENDING_REVIEW')),
      top_factors_json TEXT NOT NULL DEFAULT '[]',
      feature_snapshot_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_risk_assessments_principal ON risk_assessments(principal_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_risk_assessments_domain ON risk_assessments(domain, decision, created_at DESC);

    CREATE TABLE IF NOT EXISTS risk_review_queue (
      id TEXT PRIMARY KEY,
      assessment_id TEXT NOT NULL REFERENCES risk_assessments(id),
      domain TEXT NOT NULL CHECK(domain IN ('leaderboard', 'cpa', 'billing_a', 'billing_b', 'mmo')),
      principal_id TEXT,
      target_ref TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING_REVIEW'
        CHECK(status IN ('PENDING_REVIEW', 'APPEALED', 'APPROVED', 'CONFIRMED_FRAUD')),
      assigned_to TEXT,
      resolution_note TEXT,
      explanation_ko TEXT NOT NULL,
      user_appeal_text TEXT,
      sla_due_at INTEGER NOT NULL,
      resolved_at INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_risk_review_status ON risk_review_queue(status, sla_due_at ASC);
    CREATE INDEX IF NOT EXISTS idx_risk_review_principal ON risk_review_queue(principal_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS desktop_shader_telemetry (
      id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL,
      game_version TEXT NOT NULL,
      engine_version TEXT NOT NULL,
      renderer TEXT NOT NULL,
      gpu_vendor TEXT NOT NULL,
      gpu_name TEXT NOT NULL,
      driver_version TEXT NOT NULL,
      cold_start INTEGER NOT NULL CHECK(cold_start IN (0, 1)),
      first_frame_ms REAL NOT NULL CHECK(first_frame_ms >= 0),
      frame_p95_ms REAL NOT NULL DEFAULT 0 CHECK(frame_p95_ms >= 0),
      frame_p99_ms REAL NOT NULL DEFAULT 0 CHECK(frame_p99_ms >= 0),
      max_frame_ms REAL NOT NULL DEFAULT 0 CHECK(max_frame_ms >= 0),
      hitch_50ms INTEGER NOT NULL DEFAULT 0 CHECK(hitch_50ms >= 0),
      hitch_100ms INTEGER NOT NULL DEFAULT 0 CHECK(hitch_100ms >= 0),
      pipeline_counts_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_shader_telemetry_group
      ON desktop_shader_telemetry(game_id, engine_version, renderer, gpu_vendor, gpu_name, driver_version, created_at DESC);

    CREATE TABLE IF NOT EXISTS mmo_room_telemetry (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      game_id TEXT NOT NULL,
      is_party INTEGER NOT NULL DEFAULT 0 CHECK(is_party IN (0, 1)),
      online_count INTEGER NOT NULL DEFAULT 0 CHECK(online_count >= 0),
      bot_count INTEGER NOT NULL DEFAULT 0 CHECK(bot_count >= 0),
      rtt_p50_ms REAL NOT NULL DEFAULT 0 CHECK(rtt_p50_ms >= 0),
      rtt_p95_ms REAL NOT NULL DEFAULT 0 CHECK(rtt_p95_ms >= 0),
      events_received_delta INTEGER NOT NULL DEFAULT 0 CHECK(events_received_delta >= 0),
      sampled_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_mmo_room_telemetry_game ON mmo_room_telemetry(game_id, sampled_at DESC);
  `);
}
