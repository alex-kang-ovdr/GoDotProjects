export const AVATAR_OPTIONAL_TABLES = Object.freeze({
  avatar_wallets: ['principal_id', 'paid_balance', 'bonus_balance', 'promo_balance', 'updated_at'],
  avatar_wallet_ledger: ['id', 'principal_id', 'delta_paid', 'delta_bonus', 'delta_promo', 'kind', 'ref_id', 'idempotency_key', 'created_at'],
  avatar_inventory: ['principal_id', 'item_id', 'category', 'acquired_via', 'price_paid', 'acquired_at'],
  avatar_loadouts: ['principal_id', 'skin_id', 'attachments_json', 'emote_wheel_json', 'revision', 'updated_at'],
  avatar_purchase_idempotency: ['principal_id', 'idempotency_key', 'request_hash', 'response_json', 'created_at'],
});

export function ensureAvatarSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS avatar_wallets(
      principal_id TEXT PRIMARY KEY REFERENCES users(id),
      paid_balance INTEGER NOT NULL DEFAULT 0 CHECK(paid_balance >= 0),
      bonus_balance INTEGER NOT NULL DEFAULT 0 CHECK(bonus_balance >= 0),
      promo_balance INTEGER NOT NULL DEFAULT 0 CHECK(promo_balance >= 0),
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS avatar_wallet_ledger(
      id TEXT PRIMARY KEY,
      principal_id TEXT NOT NULL REFERENCES users(id),
      delta_paid INTEGER NOT NULL,
      delta_bonus INTEGER NOT NULL,
      delta_promo INTEGER NOT NULL,
      kind TEXT NOT NULL,
      ref_id TEXT,
      idempotency_key TEXT UNIQUE,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS avatar_wallet_ledger_principal ON avatar_wallet_ledger(principal_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS avatar_inventory(
      principal_id TEXT NOT NULL REFERENCES users(id),
      item_id TEXT NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('skin', 'attachment', 'emote')),
      acquired_via TEXT NOT NULL,
      price_paid INTEGER NOT NULL DEFAULT 0 CHECK(price_paid >= 0),
      acquired_at INTEGER NOT NULL,
      PRIMARY KEY(principal_id, item_id)
    );
    CREATE INDEX IF NOT EXISTS avatar_inventory_principal ON avatar_inventory(principal_id, category);
    CREATE TABLE IF NOT EXISTS avatar_loadouts(
      principal_id TEXT PRIMARY KEY REFERENCES users(id),
      skin_id TEXT NOT NULL,
      attachments_json TEXT NOT NULL,
      emote_wheel_json TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS avatar_purchase_idempotency(
      principal_id TEXT NOT NULL REFERENCES users(id),
      idempotency_key TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      response_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY(principal_id, idempotency_key)
    );
  `);
}
