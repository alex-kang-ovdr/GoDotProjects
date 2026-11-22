/**
 * Flywheel 1 Growth & Recommendation Engine SQLite Schema (4 additive tables).
 * Preserves PRAGMA user_version = 1 (plain tables + indexes only; no views/triggers/virtual tables).
 * Keep in sync with:
 * - hub/tools/restore-data.mjs (OPTIONAL_TABLES)
 * - hub/tools/sanitize-snapshot.mjs (SCHEMA_ALLOWLIST + DROP_TABLES)
 */
export const GROWTH_OPTIONAL_TABLES = Object.freeze({
  growth_experiments: [
    'id', 'name', 'hypothesis', 'placement_id', 'status',
    'variants_json', 'weights_json', 'metric_primary', 'guardrails_json',
    'created_by', 'started_at', 'ended_at', 'created_at', 'updated_at'
  ],
  growth_experiment_assignments: [
    'experiment_id', 'subject_id', 'variant_id', 'bucket', 'context_hash', 'assigned_at'
  ],
  growth_agent_runs: [
    'id', 'level', 'trigger_source', 'status',
    'summary_json', 'hypotheses_json', 'actions_json', 'created_by', 'created_at'
  ],
  rec_serve_log: [
    'id', 'subject_id', 'principal_id', 'placement_id', 'mode',
    'experiment_id', 'variant_id', 'game_id', 'slot_index',
    'score', 'propensity', 'reward', 'impression_id', 'served_at', 'rewarded_at'
  ]
});

export function ensureGrowthSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS growth_experiments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      hypothesis TEXT NOT NULL DEFAULT '',
      placement_id TEXT NOT NULL DEFAULT 'home_grid',
      status TEXT NOT NULL DEFAULT 'running'
        CHECK(status IN ('draft','running','paused','completed','rolled_back')),
      variants_json TEXT NOT NULL,
      weights_json TEXT NOT NULL,
      metric_primary TEXT NOT NULL DEFAULT 'active_play_60s_rate',
      guardrails_json TEXT NOT NULL DEFAULT '{}',
      created_by TEXT,
      started_at INTEGER,
      ended_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_growth_exp_status
      ON growth_experiments(status, placement_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS growth_experiment_assignments (
      experiment_id TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      variant_id TEXT NOT NULL,
      bucket INTEGER NOT NULL CHECK(bucket >= 0 AND bucket < 10000),
      context_hash TEXT NOT NULL DEFAULT '',
      assigned_at INTEGER NOT NULL,
      PRIMARY KEY (experiment_id, subject_id)
    );

    CREATE INDEX IF NOT EXISTS idx_growth_assign_exp_var
      ON growth_experiment_assignments(experiment_id, variant_id, assigned_at DESC);

    CREATE TABLE IF NOT EXISTS growth_agent_runs (
      id TEXT PRIMARY KEY,
      level TEXT NOT NULL DEFAULT 'L0' CHECK(level IN ('L0','L1','L2','L3')),
      trigger_source TEXT NOT NULL DEFAULT 'manual',
      status TEXT NOT NULL DEFAULT 'completed' CHECK(status IN ('running','completed','failed')),
      summary_json TEXT NOT NULL DEFAULT '{}',
      hypotheses_json TEXT NOT NULL DEFAULT '[]',
      actions_json TEXT NOT NULL DEFAULT '[]',
      created_by TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_growth_runs_level
      ON growth_agent_runs(level, created_at DESC);

    CREATE TABLE IF NOT EXISTS rec_serve_log (
      id TEXT PRIMARY KEY,
      subject_id TEXT NOT NULL,
      principal_id TEXT,
      placement_id TEXT NOT NULL,
      mode TEXT NOT NULL,
      experiment_id TEXT,
      variant_id TEXT,
      game_id TEXT NOT NULL,
      slot_index INTEGER NOT NULL CHECK(slot_index >= 0),
      score REAL NOT NULL DEFAULT 0,
      propensity REAL NOT NULL DEFAULT 1,
      reward REAL,
      impression_id TEXT,
      served_at INTEGER NOT NULL,
      rewarded_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_rec_serve_subject
      ON rec_serve_log(subject_id, placement_id, served_at DESC);

    CREATE INDEX IF NOT EXISTS idx_rec_serve_game
      ON rec_serve_log(game_id, served_at DESC);

    CREATE INDEX IF NOT EXISTS idx_rec_serve_impression
      ON rec_serve_log(impression_id);
  `);
}
