// Additive 2-Track PlayHub Billing schema (20 tables).
// - Track A (16 tables): PlayHub 1P revenue — PlayCoin (3-Bucket: paid/bonus/promo),
//   up-to-25% channel bonus hard cap, Double-Entry Zero-Sum ledger, Orpheus idempotency,
//   Hold/Capture, Free/Pro subscriptions, UsageMetering, GiftCards, Refunds, Compliance.
// - Track B (4 tables): Creator Direct Commerce (0% platform fee enforced in SQL CHECK,
//   no creator funds held/settled by PlayHub, no creator secret keys stored, EntitlementService).
//
// Lives beside hub/server/db.mjs without bumping PRAGMA user_version (must stay 1).
// Plain tables only (no views, triggers, or virtual tables) for restore-data.mjs & Turso.

export const BILLING_UNIT = 'PLAYCOIN';
export const MAX_BONUS_BPS = 2500; // Hard cap: +25.00%

export const BILLING_OPTIONAL_TABLES = {
  // Track A (1P PlayHub Billing & Shared Core)
  billing_catalog_skus: ['sku_id', 'currency', 'title_l10n_key', 'amount_minor', 'base_coins', 'sort_order', 'active', 'updated_at'],
  billing_channel_bonus_rules: ['id', 'channel', 'sku_id', 'currency', 'min_amount_minor', 'bonus_bps', 'active', 'starts_at', 'ends_at', 'updated_at'],
  billing_idempotency: ['scope', 'idempotency_key', 'principal_id', 'request_hash', 'status_code', 'response_json', 'created_at'],
  billing_orders: ['id', 'principal_id', 'channel', 'provider', 'sku_id', 'currency', 'amount_minor', 'base_coins', 'bonus_coins', 'bonus_bps', 'state', 'provider_payment_id', 'idempotency_key', 'first_spent_at', 'paid_at', 'created_at', 'updated_at'],
  billing_payment_events: ['id', 'provider', 'external_event_id', 'order_id', 'event_type', 'payload_sha256', 'status', 'received_at', 'processed_at'],
  billing_wallet_accounts: ['principal_id', 'paid_balance', 'bonus_balance', 'promo_balance', 'reserved_coins', 'debt_coins', 'frozen_reason', 'frozen_at', 'updated_at'],
  billing_wallet_lots: ['id', 'principal_id', 'parent_order_id', 'bucket', 'initial_coins', 'remaining_coins', 'expires_at', 'created_at'],
  billing_wallet_holds: ['id', 'principal_id', 'amount_coins', 'settled_coins', 'sink_type', 'sink_ref_id', 'state', 'idempotency_key', 'expires_at', 'created_at', 'updated_at'],
  billing_journal_entries: ['id', 'event_type', 'order_id', 'sink_type', 'sink_ref_id', 'idempotency_key', 'metadata_json', 'created_at'],
  billing_journal_lines: ['id', 'entry_id', 'account_code', 'signed_coins', 'lot_id', 'created_at'],
  billing_giftcard_batches: ['id', 'channel', 'partner_name', 'currency', 'face_value_minor', 'base_coins', 'bonus_bps', 'quantity', 'state', 'expires_at', 'created_by', 'created_at'],
  billing_giftcards: ['id', 'batch_id', 'serial_no', 'pin_hash', 'pin_hint', 'currency', 'face_value_minor', 'state', 'activated_at', 'redeemed_by', 'redeemed_at', 'redeemed_order_id', 'expires_at'],
  billing_refunds: ['id', 'order_id', 'principal_id', 'kind', 'refund_amount_minor', 'clawback_paid_coins', 'clawback_bonus_coins', 'debt_added_coins', 'provider_refund_id', 'status', 'reason', 'actor_id', 'created_at', 'completed_at'],
  billing_spending_limits: ['principal_id', 'age_tier', 'monthly_cap_minor', 'daily_cap_minor', 'guardian_approved', 'updated_by', 'updated_at'],
  billing_subscriptions: ['id', 'principal_id', 'plan_tier', 'status', 'provider', 'provider_subscription_id', 'current_period_start', 'current_period_end', 'cancel_at_period_end', 'created_at', 'updated_at'],
  billing_usage_records: ['id', 'principal_id', 'metric_type', 'resource_ref_id', 'quantity', 'billable_coins', 'hold_id', 'journal_entry_id', 'period_key', 'idempotency_key', 'created_at'],
  // Track B (Creator Direct Commerce — 0% Platform Fee, Entitlement-Only)
  billing_creator_connections: ['principal_id', 'provider', 'connected_account_id', 'onboarding_status', 'charges_enabled', 'payouts_enabled', 'country_code', 'platform_fee_bps', 'updated_at'],
  billing_creator_products: ['id', 'creator_id', 'game_id', 'product_key', 'kind', 'title', 'currency', 'amount_minor', 'allowed_regions_json', 'allowed_platforms_json', 'age_rating', 'status', 'created_at', 'updated_at'],
  billing_direct_orders: ['id', 'buyer_id', 'creator_id', 'product_id', 'game_id', 'platform', 'provider', 'connected_account_id', 'provider_charge_id', 'payment_intent_id', 'charge_id', 'currency', 'amount_minor', 'platform_fee_minor', 'state', 'idempotency_key', 'paid_at', 'created_at', 'updated_at'],
  billing_entitlements: ['id', 'buyer_id', 'creator_id', 'game_id', 'product_id', 'product_key', 'direct_order_id', 'state', 'granted_at', 'expires_at', 'revoked_at', 'revoke_reason', 'updated_at']
};

export function ensureBillingSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS billing_catalog_skus(
      sku_id TEXT NOT NULL,
      currency TEXT NOT NULL,
      title_l10n_key TEXT NOT NULL,
      amount_minor INTEGER NOT NULL CHECK(amount_minor > 0),
      base_coins INTEGER NOT NULL CHECK(base_coins > 0),
      sort_order INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(sku_id, currency)
    );
    CREATE INDEX IF NOT EXISTS billing_catalog_active ON billing_catalog_skus(currency, active, sort_order);

    CREATE TABLE IF NOT EXISTS billing_channel_bonus_rules(
      id TEXT PRIMARY KEY,
      channel TEXT NOT NULL CHECK(channel IN ('web_browser','pc_desktop','gift_card_direct','gift_card_retail','aos_google_play','ios_app_store')),
      sku_id TEXT,
      currency TEXT,
      min_amount_minor INTEGER NOT NULL DEFAULT 0 CHECK(min_amount_minor >= 0),
      bonus_bps INTEGER NOT NULL CHECK(bonus_bps >= 0 AND bonus_bps <= 2500),
      active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
      starts_at INTEGER,
      ends_at INTEGER,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS billing_bonus_lookup ON billing_channel_bonus_rules(channel, active, sku_id, currency);

    CREATE TABLE IF NOT EXISTS billing_idempotency(
      scope TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      principal_id TEXT,
      request_hash TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      response_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY(scope, idempotency_key)
    );
    CREATE INDEX IF NOT EXISTS billing_idempotency_created ON billing_idempotency(created_at);

    CREATE TABLE IF NOT EXISTS billing_orders(
      id TEXT PRIMARY KEY,
      principal_id TEXT NOT NULL REFERENCES users(id),
      channel TEXT NOT NULL CHECK(channel IN ('web_browser','pc_desktop','gift_card_direct','gift_card_retail','aos_google_play','ios_app_store')),
      provider TEXT NOT NULL,
      sku_id TEXT NOT NULL,
      currency TEXT NOT NULL,
      amount_minor INTEGER NOT NULL CHECK(amount_minor >= 0),
      base_coins INTEGER NOT NULL CHECK(base_coins > 0),
      bonus_coins INTEGER NOT NULL DEFAULT 0 CHECK(bonus_coins >= 0),
      bonus_bps INTEGER NOT NULL DEFAULT 0 CHECK(bonus_bps >= 0 AND bonus_bps <= 2500),
      state TEXT NOT NULL CHECK(state IN ('CREATED','PENDING','PAID','REFUND_PENDING','FAILED','CANCELLED','REFUNDED','CHARGEBACK')),
      provider_payment_id TEXT UNIQUE,
      idempotency_key TEXT NOT NULL UNIQUE,
      first_spent_at INTEGER,
      paid_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS billing_orders_principal ON billing_orders(principal_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS billing_orders_state ON billing_orders(state, paid_at);

    CREATE TABLE IF NOT EXISTS billing_payment_events(
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      external_event_id TEXT NOT NULL UNIQUE,
      order_id TEXT,
      event_type TEXT NOT NULL,
      payload_sha256 TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('RECEIVED','PROCESSED','IGNORED','FAILED')),
      received_at INTEGER NOT NULL,
      processed_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS billing_payment_events_order ON billing_payment_events(order_id, received_at);

    -- Track A 1P PlayCoin Wallet (3-Bucket: paid, bonus, promo).
    -- PlayHub never holds creator sales proceeds, so no earned payout bucket exists.
    CREATE TABLE IF NOT EXISTS billing_wallet_accounts(
      principal_id TEXT PRIMARY KEY REFERENCES users(id),
      paid_balance INTEGER NOT NULL DEFAULT 0 CHECK(paid_balance >= 0),
      bonus_balance INTEGER NOT NULL DEFAULT 0 CHECK(bonus_balance >= 0),
      promo_balance INTEGER NOT NULL DEFAULT 0 CHECK(promo_balance >= 0),
      reserved_coins INTEGER NOT NULL DEFAULT 0 CHECK(reserved_coins >= 0),
      debt_coins INTEGER NOT NULL DEFAULT 0 CHECK(debt_coins >= 0),
      frozen_reason TEXT,
      frozen_at INTEGER,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS billing_wallet_lots(
      id TEXT PRIMARY KEY,
      principal_id TEXT NOT NULL REFERENCES users(id),
      parent_order_id TEXT REFERENCES billing_orders(id),
      bucket TEXT NOT NULL CHECK(bucket IN ('paid','bonus','promo')),
      initial_coins INTEGER NOT NULL CHECK(initial_coins > 0),
      remaining_coins INTEGER NOT NULL CHECK(remaining_coins >= 0 AND remaining_coins <= initial_coins),
      expires_at INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS billing_lots_fifo ON billing_wallet_lots(principal_id, bucket, remaining_coins, expires_at, created_at);
    CREATE INDEX IF NOT EXISTS billing_lots_order ON billing_wallet_lots(parent_order_id);

    CREATE TABLE IF NOT EXISTS billing_wallet_holds(
      id TEXT PRIMARY KEY,
      principal_id TEXT NOT NULL REFERENCES users(id),
      amount_coins INTEGER NOT NULL CHECK(amount_coins > 0),
      settled_coins INTEGER NOT NULL DEFAULT 0 CHECK(settled_coins >= 0 AND settled_coins <= amount_coins),
      sink_type TEXT NOT NULL,
      sink_ref_id TEXT NOT NULL,
      state TEXT NOT NULL CHECK(state IN ('HELD','SETTLED','RELEASED')),
      idempotency_key TEXT NOT NULL UNIQUE,
      expires_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS billing_holds_principal ON billing_wallet_holds(principal_id, state);

    CREATE TABLE IF NOT EXISTS billing_journal_entries(
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL CHECK(event_type IN (
        'topup','channel_bonus','giftcard_activate','giftcard_redeem','promo_grant',
        'spend','reserve','settle','release','refund_clawback','chargeback_clawback',
        'expire','admin_adjust'
      )),
      order_id TEXT REFERENCES billing_orders(id),
      sink_type TEXT,
      sink_ref_id TEXT,
      idempotency_key TEXT NOT NULL UNIQUE,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS billing_journal_entries_order ON billing_journal_entries(order_id, created_at);

    CREATE TABLE IF NOT EXISTS billing_journal_lines(
      id TEXT PRIMARY KEY,
      entry_id TEXT NOT NULL REFERENCES billing_journal_entries(id),
      account_code TEXT NOT NULL,
      signed_coins INTEGER NOT NULL CHECK(signed_coins != 0),
      lot_id TEXT REFERENCES billing_wallet_lots(id),
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS billing_journal_lines_entry ON billing_journal_lines(entry_id);
    CREATE INDEX IF NOT EXISTS billing_journal_lines_account ON billing_journal_lines(account_code, created_at DESC);

    CREATE TABLE IF NOT EXISTS billing_giftcard_batches(
      id TEXT PRIMARY KEY,
      channel TEXT NOT NULL CHECK(channel IN ('gift_card_direct','gift_card_retail')),
      partner_name TEXT NOT NULL,
      currency TEXT NOT NULL,
      face_value_minor INTEGER NOT NULL CHECK(face_value_minor > 0),
      base_coins INTEGER NOT NULL CHECK(base_coins > 0),
      bonus_bps INTEGER NOT NULL CHECK(bonus_bps >= 0 AND bonus_bps <= 2500),
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      state TEXT NOT NULL CHECK(state IN ('DRAFT','ISSUED','ACTIVE','CLOSED','VOIDED')),
      expires_at INTEGER,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS billing_giftcards(
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL REFERENCES billing_giftcard_batches(id),
      serial_no TEXT NOT NULL UNIQUE,
      pin_hash TEXT NOT NULL UNIQUE,
      pin_hint TEXT NOT NULL,
      currency TEXT NOT NULL,
      face_value_minor INTEGER NOT NULL CHECK(face_value_minor > 0),
      state TEXT NOT NULL CHECK(state IN ('ISSUED','ACTIVE','REDEEMED','VOIDED','EXPIRED')),
      activated_at INTEGER,
      redeemed_by TEXT REFERENCES users(id),
      redeemed_at INTEGER,
      redeemed_order_id TEXT REFERENCES billing_orders(id),
      expires_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS billing_giftcards_batch ON billing_giftcards(batch_id, state);

    CREATE TABLE IF NOT EXISTS billing_refunds(
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES billing_orders(id),
      principal_id TEXT NOT NULL REFERENCES users(id),
      kind TEXT NOT NULL CHECK(kind IN ('withdrawal_7d','balance_refund','minor_cancel','cs_exception','chargeback')),
      refund_amount_minor INTEGER NOT NULL CHECK(refund_amount_minor >= 0),
      clawback_paid_coins INTEGER NOT NULL DEFAULT 0 CHECK(clawback_paid_coins >= 0),
      clawback_bonus_coins INTEGER NOT NULL DEFAULT 0 CHECK(clawback_bonus_coins >= 0),
      debt_added_coins INTEGER NOT NULL DEFAULT 0 CHECK(debt_added_coins >= 0),
      provider_refund_id TEXT,
      status TEXT NOT NULL CHECK(status IN ('PENDING','COMPLETED','FAILED')),
      reason TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      completed_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS billing_refunds_order ON billing_refunds(order_id);
    CREATE INDEX IF NOT EXISTS billing_refunds_principal ON billing_refunds(principal_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS billing_spending_limits(
      principal_id TEXT PRIMARY KEY REFERENCES users(id),
      age_tier TEXT NOT NULL CHECK(age_tier IN ('CHILD_PROTECTED','TEEN_MINOR','ADULT')),
      monthly_cap_minor INTEGER NOT NULL CHECK(monthly_cap_minor >= 0),
      daily_cap_minor INTEGER NOT NULL CHECK(daily_cap_minor >= 0),
      guardian_approved INTEGER NOT NULL DEFAULT 0 CHECK(guardian_approved IN (0,1)),
      updated_by TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- Track A: Free / Pro Subscriptions (SubscriptionService)
    CREATE TABLE IF NOT EXISTS billing_subscriptions(
      id TEXT PRIMARY KEY,
      principal_id TEXT NOT NULL UNIQUE REFERENCES users(id),
      plan_tier TEXT NOT NULL CHECK(plan_tier IN ('free','pro')),
      status TEXT NOT NULL CHECK(status IN ('ACTIVE','PAST_DUE','CANCELED','EXPIRED')),
      provider TEXT NOT NULL,
      provider_subscription_id TEXT UNIQUE,
      current_period_start INTEGER NOT NULL,
      current_period_end INTEGER NOT NULL,
      cancel_at_period_end INTEGER NOT NULL DEFAULT 0 CHECK(cancel_at_period_end IN (0,1)),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS billing_subscriptions_status ON billing_subscriptions(status, current_period_end);

    -- Track A: Usage Metering (storage, deploy, server, egress, AI)
    CREATE TABLE IF NOT EXISTS billing_usage_records(
      id TEXT PRIMARY KEY,
      principal_id TEXT NOT NULL REFERENCES users(id),
      metric_type TEXT NOT NULL CHECK(metric_type IN ('storage_bytes','deploy_bytes','server_minutes','egress_bytes','ai_units')),
      resource_ref_id TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      billable_coins INTEGER NOT NULL DEFAULT 0 CHECK(billable_coins >= 0),
      hold_id TEXT REFERENCES billing_wallet_holds(id),
      journal_entry_id TEXT REFERENCES billing_journal_entries(id),
      period_key TEXT NOT NULL,
      idempotency_key TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS billing_usage_principal_period ON billing_usage_records(principal_id, period_key, metric_type);

    -- Track B: Creator Direct Commerce (0% platform fee, no secret keys stored)
    CREATE TABLE IF NOT EXISTS billing_creator_connections(
      principal_id TEXT PRIMARY KEY REFERENCES users(id),
      provider TEXT NOT NULL CHECK(provider IN ('stripe_connect','mor_partner')),
      connected_account_id TEXT NOT NULL UNIQUE,
      onboarding_status TEXT NOT NULL CHECK(onboarding_status IN ('NOT_CONNECTED','PENDING','ACTIVE','RESTRICTED','SUSPENDED')),
      charges_enabled INTEGER NOT NULL DEFAULT 0 CHECK(charges_enabled IN (0,1)),
      payouts_enabled INTEGER NOT NULL DEFAULT 0 CHECK(payouts_enabled IN (0,1)),
      country_code TEXT NOT NULL,
      platform_fee_bps INTEGER NOT NULL DEFAULT 0 CHECK(platform_fee_bps = 0),
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS billing_creator_products(
      id TEXT PRIMARY KEY,
      creator_id TEXT NOT NULL REFERENCES users(id),
      game_id TEXT NOT NULL,
      product_key TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('game_access','consumable','durable','pass')),
      title TEXT NOT NULL,
      currency TEXT NOT NULL,
      amount_minor INTEGER NOT NULL CHECK(amount_minor > 0),
      allowed_regions_json TEXT NOT NULL DEFAULT '["*"]',
      allowed_platforms_json TEXT NOT NULL DEFAULT '["web"]',
      age_rating TEXT NOT NULL DEFAULT 'ALL' CHECK(age_rating IN ('ALL','12+','15+','18+')),
      status TEXT NOT NULL CHECK(status IN ('DRAFT','ACTIVE','SUSPENDED','ARCHIVED')),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(game_id, product_key)
    );
    CREATE INDEX IF NOT EXISTS billing_creator_products_game ON billing_creator_products(game_id, status);
    CREATE UNIQUE INDEX IF NOT EXISTS billing_creator_products_game_key ON billing_creator_products(game_id, product_key);

    CREATE TABLE IF NOT EXISTS billing_direct_orders(
      id TEXT PRIMARY KEY,
      buyer_id TEXT NOT NULL REFERENCES users(id),
      creator_id TEXT NOT NULL REFERENCES users(id),
      product_id TEXT NOT NULL REFERENCES billing_creator_products(id),
      game_id TEXT NOT NULL,
      platform TEXT NOT NULL CHECK(platform IN ('web','windows','android','ios','google_tv','apple_tv','samsung_tv')),
      provider TEXT NOT NULL CHECK(provider IN ('stripe_connect','mor_partner')),
      connected_account_id TEXT NOT NULL,
      provider_charge_id TEXT UNIQUE,
      payment_intent_id TEXT,
      charge_id TEXT,
      currency TEXT NOT NULL,
      amount_minor INTEGER NOT NULL CHECK(amount_minor > 0),
      platform_fee_minor INTEGER NOT NULL DEFAULT 0 CHECK(platform_fee_minor = 0),
      state TEXT NOT NULL CHECK(state IN ('CREATED','PAID','REFUNDED','CHARGEBACK','FAILED','CANCELED')),
      idempotency_key TEXT NOT NULL UNIQUE,
      paid_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS billing_direct_orders_buyer ON billing_direct_orders(buyer_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS billing_direct_orders_creator ON billing_direct_orders(creator_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS billing_entitlements(
      id TEXT PRIMARY KEY,
      buyer_id TEXT NOT NULL REFERENCES users(id),
      creator_id TEXT NOT NULL REFERENCES users(id),
      game_id TEXT NOT NULL,
      product_id TEXT NOT NULL REFERENCES billing_creator_products(id),
      product_key TEXT NOT NULL,
      direct_order_id TEXT NOT NULL UNIQUE REFERENCES billing_direct_orders(id),
      state TEXT NOT NULL CHECK(state IN ('ACTIVE','CONSUMED','REVOKED')),
      granted_at INTEGER NOT NULL,
      expires_at INTEGER,
      revoked_at INTEGER,
      revoke_reason TEXT,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS billing_entitlements_buyer_game ON billing_entitlements(buyer_id, game_id, state);
  `);

  // Backward-compatible additive migrations for existing SQLite databases.
  const directOrderCols = new Set(db.prepare('PRAGMA table_info(billing_direct_orders)').all().map(c => c.name));
  if (!directOrderCols.has('payment_intent_id')) {
    db.exec('ALTER TABLE billing_direct_orders ADD COLUMN payment_intent_id TEXT');
  }
  if (!directOrderCols.has('charge_id')) {
    db.exec('ALTER TABLE billing_direct_orders ADD COLUMN charge_id TEXT');
  }
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS billing_direct_orders_pi
      ON billing_direct_orders(payment_intent_id) WHERE payment_intent_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS billing_direct_orders_ch
      ON billing_direct_orders(charge_id) WHERE charge_id IS NOT NULL;
  `);
}
