/**
 * PlayHub Android Mobile API schema (independent CREATE TABLE IF NOT EXISTS,
 * preserving hub/server/db.mjs PRAGMA user_version = 1 compatibility).
 */
export function ensureMobileSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS mobile_tokens (
      id_hash TEXT PRIMARY KEY,
      principal_id TEXT NOT NULL REFERENCES users(id),
      family_id TEXT NOT NULL,
      rotated_from TEXT,
      revoked_at INTEGER,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS mobile_tokens_family ON mobile_tokens(family_id);
    CREATE INDEX IF NOT EXISTS mobile_tokens_principal ON mobile_tokens(principal_id);

    CREATE TABLE IF NOT EXISTS user_age_compliance (
      principal_id TEXT PRIMARY KEY REFERENCES users(id),
      region_code TEXT NOT NULL,
      age_tier TEXT NOT NULL CHECK(age_tier IN ('UNKNOWN','CHILD_PROTECTED','TEEN_MINOR','ADULT')),
      parental_consent_status TEXT NOT NULL DEFAULT 'not_required'
        CHECK(parental_consent_status IN ('not_required','pending','verified','revoked')),
      parental_consent_at INTEGER,
      kyc_verified_at INTEGER,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS parental_consent_logs (
      id TEXT PRIMARY KEY,
      principal_id TEXT NOT NULL REFERENCES users(id),
      guardian_contact_hash TEXT NOT NULL,
      method TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending','verified','revoked')),
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS parental_consent_principal ON parental_consent_logs(principal_id, created_at DESC);
  `);
}
