import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHmac, randomBytes } from 'node:crypto';
import { DatabaseSync, backup } from 'node:sqlite';
import { assertNoLinks, regularFile, hashFile } from './backup.mjs';

export const SANITIZER_VERSION = '1.1.0';

/**
 * Fail-Closed Schema Allowlist for PlayHub SQLite snapshots.
 * Any table or column not listed here causes sanitization to abort immediately
 * so newly added PII fields can never leak silently from live to dev/local.
 */
export const SCHEMA_ALLOWLIST = Object.freeze({
  users: ['id', 'kind', 'display_name', 'created_at'],
  identities: ['provider', 'subject', 'user_id'],
  sessions: ['id_hash', 'kind', 'principal_id', 'analytics_subject', 'csrf', 'admin_authenticated', 'admin_username', 'created_at', 'expires_at', 'traffic_type', 'qa_run_id'],
  play_sessions: ['id', 'session_hash', 'principal_id', 'subject_id', 'game_id', 'build_id', 'started_at', 'ready_at', 'last_heartbeat_at', 'last_sequence', 'active_ms', 'paused', 'ended_at', 'expires_at', 'traffic_type', 'qa_run_id'],
  save_slots: ['principal_id', 'game_id', 'slot', 'schema_version', 'revision', 'payload', 'updated_at'],
  save_slot_versions: ['principal_id', 'game_id', 'slot', 'last_revision'],
  save_idempotency: ['principal_id', 'game_id', 'slot', 'request_key', 'request_hash', 'response_json', 'created_at'],
  wishlist_items: ['principal_id', 'game_id', 'added_at'],
  user_preferences: ['principal_id', 'locale', 'updated_at'],
  community_items: ['id', 'game_id', 'author_id', 'kind', 'title', 'body', 'status', 'hidden', 'created_at', 'updated_at'],
  community_votes: ['item_id', 'principal_id', 'created_at'],
  community_reports: ['item_id', 'principal_id', 'reason', 'created_at'],
  oauth_states: ['state_hash', 'session_hash', 'guest_id', 'source_subject', 'nonce', 'verifier', 'return_to', 'expires_at', 'used_at'],
  merge_requests: ['id', 'source_user', 'target_user', 'source_subject', 'target_subject', 'status', 'expires_at', 'result_json'],
  save_backups: ['id', 'merge_id', 'principal_id', 'game_id', 'slot', 'schema_version', 'revision', 'payload', 'created_at', 'reason'],
  analytics_links: ['source_subject', 'target_subject', 'created_at'],
  events: ['id', 'fingerprint', 'name', 'subject_id', 'visit_id', 'play_session_id', 'game_id', 'impression_id', 'occurred_at', 'received_at', 'properties', 'source', 'traffic_type', 'qa_run_id'],
  game_overrides: ['game_id', 'enabled', 'updated_at'],
  errors: ['id', 'code', 'message', 'game_id', 'created_at', 'traffic_type', 'qa_run_id'],
  audit: ['id', 'action', 'target', 'detail', 'created_at'],
  creator_submissions: ['id', 'owner_key', 'owner_id', 'project_id', 'release_id', 'release_revision', 'release_label', 'title', 'description', 'status', 'revision', 'review_note', 'created_at', 'updated_at', 'submitted_at', 'decided_at', 'game_slug', 'visibility', 'deploy_mode', 'artifact_sha256', 'manifest_json', 'package_validation', 'publication_status', 'published_game_id'],
  qa_runs: ['id', 'submission_id', 'target_type', 'target_id', 'release_revision', 'policy_version', 'qa_status', 'score', 'report_path', 'summary_json', 'started_at', 'finished_at'],
  submission_checklists: ['submission_id', 'submission_revision', 'checklist_version', 'items_json', 'updated_by', 'updated_at'],
  l10n_keys: ['key', 'namespace', 'source_text', 'source_hash', 'context_id', 'description', 'max_chars', 'placeholders_json', 'code_refs_json', 'unused_since', 'revision', 'updated_at'],
  l10n_translations: ['key', 'locale', 'value', 'status', 'ai_provider', 'ai_model', 'lint_json', 'updated_by', 'updated_at'],
  l10n_glossary: ['id', 'term_ko', 'term_en', 'is_dnt', 'context_tags_json', 'translations_json', 'forbidden_json', 'notes', 'updated_at'],
  l10n_prompts: ['id', 'name', 'context_id', 'system_prompt', 'rules_json', 'disambiguation_json', 'updated_at'],
  l10n_media_slots: ['slot_key', 'description', 'alt_text_key', 'width', 'height', 'max_bytes', 'allowed_formats_json', 'updated_at'],
  l10n_media_assets: ['slot_key', 'locale', 'filename', 'mime_type', 'bytes', 'sha256', 'updated_by', 'updated_at'],
  l10n_releases: ['version', 'tag', 'sha256', 'key_count', 'media_count', 'coverage_json', 'bundle_json', 'notes', 'is_active', 'created_by', 'created_at'],
  hub_publications: ['game_id', 'host_slug', 'owner_key', 'owner_id', 'project_id', 'active_release_id', 'active_submission_id', 'visibility', 'deploy_mode', 'status', 'unpublished_by', 'artifact_sha256', 'artifact_base_url', 'manifest_json', 'deploy_profile_json', 'cas_version', 'published_at', 'updated_at'],
  hub_publication_history: ['id', 'game_id', 'from_release_id', 'to_release_id', 'action', 'actor_id', 'reason', 'cas_version', 'created_at', 'manifest_json', 'deploy_profile_json', 'artifact_sha256'],
  hub_publish_idempotency: ['idempotency_key', 'scope', 'request_hash', 'response_json', 'created_at'],
  mobile_tokens: ['id_hash', 'principal_id', 'family_id', 'rotated_from', 'revoked_at', 'expires_at', 'created_at'],
  user_age_compliance: ['principal_id', 'region_code', 'age_tier', 'parental_consent_status', 'parental_consent_at', 'kyc_verified_at', 'updated_at'],
  parental_consent_logs: ['id', 'principal_id', 'guardian_contact_hash', 'method', 'status', 'created_at'],
  cdn_storage: ['owner', 'plan', 'used_bytes', 'reserved_bytes', 'updated_at'],
  cdn_projects: ['id', 'owner', 'host_slug', 'name', 'head_commit_id', 'created_at', 'updated_at', 'trashed_at'],
  cdn_blobs: ['id', 'owner', 'kind', 'sha256', 'bytes', 'object_key', 'state', 'ref_count', 'lease_until', 'created_at', 'state_at'],
  cdn_save_plans: ['id', 'project_id', 'owner', 'base_commit_id', 'files_json', 'state', 'reserved_bytes', 'expires_at', 'created_at'],
  cdn_uploads: ['id', 'plan_id', 'owner', 'path', 'sha256', 'bytes', 'quarantine_key', 'state', 'reserved_bytes', 'blob_id', 'error_code', 'created_at', 'updated_at'],
  cdn_commits: ['id', 'project_id', 'parent_id', 'manifest_blob_id', 'manifest_sha256', 'file_count', 'total_bytes', 'author', 'message', 'restored_from', 'created_at', 'pruned_at'],
  cdn_pins: ['commit_id', 'owner', 'reason', 'created_at'],
  cdn_idempotency: ['owner', 'key', 'scope', 'status', 'response_json', 'created_at'],
  // Avatar (5 tables)
  avatar_wallets: ['principal_id', 'paid_balance', 'bonus_balance', 'promo_balance', 'updated_at'],
  avatar_wallet_ledger: ['id', 'principal_id', 'delta_paid', 'delta_bonus', 'delta_promo', 'kind', 'ref_id', 'idempotency_key', 'created_at'],
  avatar_inventory: ['principal_id', 'item_id', 'category', 'acquired_via', 'price_paid', 'acquired_at'],
  avatar_loadouts: ['principal_id', 'skin_id', 'attachments_json', 'emote_wheel_json', 'revision', 'updated_at'],
  avatar_purchase_idempotency: ['principal_id', 'idempotency_key', 'request_hash', 'response_json', 'created_at'],
  // EOS SSOT (12 tables)
  leaderboard_boards: ['game_id', 'board_key', 'sort_order', 'score_mode', 'reset_period', 'max_score_bound', 'min_play_ms', 'guest_visible', 'enabled', 'created_at', 'updated_at'],
  leaderboard_entries: ['game_id', 'board_key', 'period_key', 'principal_id', 'score', 'sort_score', 'tie_breaker_ms', 'metadata_json', 'submission_count', 'source', 'traffic_type', 'qa_run_id', 'excluded', 'exclude_reason', 'achieved_at', 'updated_at'],
  leaderboard_submissions: ['id', 'game_id', 'board_key', 'period_key', 'principal_id', 'play_session_id', 'request_key', 'request_hash', 'raw_score', 'accepted', 'reject_reason', 'response_json', 'source', 'traffic_type', 'qa_run_id', 'created_at'],
  user_sanctions: ['id', 'principal_id', 'scope', 'action', 'reason', 'evidence_json', 'active', 'expires_at', 'created_by', 'created_at', 'revoked_at', 'revoked_by', 'eos_target_puid', 'eos_sync_status', 'eos_synced_at'],
  stat_definitions: ['game_id', 'stat_key', 'agg_mode', 'min_value', 'max_value', 'max_delta', 'enabled', 'created_at', 'updated_at'],
  player_stats: ['game_id', 'stat_key', 'principal_id', 'value', 'update_count', 'traffic_type', 'qa_run_id', 'updated_at'],
  achievement_definitions: ['game_id', 'achievement_key', 'title', 'description', 'stat_key', 'threshold', 'hidden', 'points', 'enabled', 'created_at', 'updated_at'],
  player_achievements: ['game_id', 'achievement_key', 'principal_id', 'unlocked_at', 'progress_value', 'source', 'traffic_type', 'qa_run_id', 'eos_sync_status', 'eos_synced_at'],
  progression_idempotency: ['game_id', 'principal_id', 'request_key', 'request_hash', 'response_json', 'created_at'],
  datastore_quotas: ['game_id', 'max_keys', 'max_value_bytes', 'max_total_bytes', 'default_lease_ms', 'max_lease_ms', 'enabled', 'updated_at'],
  datastore_entries: ['game_id', 'scope', 'entry_key', 'owner_principal_id', 'revision', 'value_json', 'bytes', 'etag', 'fencing_token', 'lock_holder', 'lock_expires_at', 'updated_by', 'created_at', 'updated_at'],
  datastore_versions: ['id', 'game_id', 'scope', 'entry_key', 'revision', 'value_json', 'bytes', 'reason', 'updated_by', 'created_at'],
  // Hub-Billing (20 tables)
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
  billing_creator_connections: ['principal_id', 'provider', 'connected_account_id', 'onboarding_status', 'charges_enabled', 'payouts_enabled', 'country_code', 'platform_fee_bps', 'updated_at'],
  billing_creator_products: ['id', 'creator_id', 'game_id', 'product_key', 'kind', 'title', 'currency', 'amount_minor', 'allowed_regions_json', 'allowed_platforms_json', 'age_rating', 'status', 'created_at', 'updated_at'],
  billing_direct_orders: ['id', 'buyer_id', 'creator_id', 'product_id', 'game_id', 'platform', 'provider', 'connected_account_id', 'provider_charge_id', 'payment_intent_id', 'charge_id', 'currency', 'amount_minor', 'platform_fee_minor', 'state', 'idempotency_key', 'paid_at', 'created_at', 'updated_at'],
  billing_entitlements: ['id', 'buyer_id', 'creator_id', 'game_id', 'product_id', 'product_key', 'direct_order_id', 'state', 'granted_at', 'expires_at', 'revoked_at', 'revoke_reason', 'updated_at'],
  // Multi-platform IAP & Shared Wallet (7 tables)
  iap_products: ['sku', 'platform', 'store_product_id', 'kind', 'game_id', 'coin_amount', 'entitlement_key', 'active'],
  iap_transactions: ['id', 'principal_id', 'platform', 'environment', 'sku', 'store_tx_id', 'original_tx_id', 'state', 'raw_receipt_hash', 'created_at', 'updated_at'],
  iap_webhook_events: ['id', 'platform', 'event_uuid', 'event_type', 'payload_hash', 'processed_at'],
  player_wallet_accounts: ['principal_id', 'balance', 'clawback_deficit', 'updated_at'],
  player_wallet_buckets: ['id', 'principal_id', 'source_platform', 'currency_kind', 'wallet_scope', 'source_tx_id', 'granted_amount', 'remaining_amount', 'created_at'],
  player_wallet_ledger: ['id', 'principal_id', 'bucket_id', 'delta', 'balance_after', 'reason', 'ref_id', 'idempotency_key', 'created_at'],
  player_entitlements: ['id', 'principal_id', 'game_id', 'item_id', 'source_tx_id', 'expires_at', 'revoked_at', 'created_at'],
  // Social & Cross-play Co-Entry (11 tables)
  user_profiles: ['principal_id', 'handle', 'avatar_color', 'bio', 'privacy_level', 'updated_at'],
  social_friendships: ['requester_id', 'addressee_id', 'status', 'created_at', 'updated_at'],
  social_blocks: ['blocker_id', 'blocked_id', 'created_at'],
  social_presence: ['principal_id', 'status', 'game_id', 'game_title', 'room_code', 'joinable', 'updated_at'],
  social_parties: ['id', 'leader_id', 'title', 'target_game_id', 'room_code', 'max_members', 'created_at', 'updated_at'],
  social_party_members: ['party_id', 'principal_id', 'role', 'ready_state', 'joined_at'],
  social_messages: ['id', 'channel_type', 'channel_key', 'sender_id', 'body', 'is_quick_message', 'created_at'],
  social_leaderboards: ['game_id', 'board_id', 'principal_id', 'score', 'period_key', 'updated_at'],
  social_reports: ['id', 'reporter_id', 'target_type', 'target_id', 'reason', 'created_at'],
  social_party_launches: ['launch_id', 'party_id', 'game_id', 'room_code', 'match_room_id', 'launched_by', 'status', 'created_at'],
  social_party_launch_acks: ['launch_id', 'principal_id', 'platform', 'state', 'updated_at'],
  // Hub-SSO email credentials (sensitive: dropped unconditionally)
  email_credentials: ['user_id', 'email', 'password_hash', 'salt', 'failed_attempts', 'locked_until', 'created_at', 'updated_at']
});

// High-risk auth, session, token, sensitive payment, giftcard PIN, moderation evidence,
// idempotency, and operational log tables wiped unconditionally (child-before-parent FK order).
export const DROP_TABLES = Object.freeze([
  'sessions',
  'oauth_states',
  'mobile_tokens',
  'audit',
  'save_idempotency',
  'hub_publish_idempotency',
  'cdn_idempotency',
  'merge_requests',
  // Avatar payment ledger & idempotency
  'avatar_wallet_ledger',
  'avatar_purchase_idempotency',
  // EOS SSOT sensitive moderation details, EOS PUIDs, raw submissions & idempotency
  'user_sanctions',
  'leaderboard_submissions',
  'progression_idempotency',
  // Billing sensitive live orders, giftcard PIN hashes, Stripe Connect IDs, refunds, ledgers & idempotency
  'billing_entitlements',
  'billing_direct_orders',
  'billing_creator_connections',
  'billing_usage_records',
  'billing_journal_lines',
  'billing_journal_entries',
  'billing_giftcards',
  'billing_giftcard_batches',
  'billing_refunds',
  'billing_wallet_lots',
  'billing_wallet_holds',
  'billing_wallet_accounts',
  'billing_orders',
  'billing_payment_events',
  'billing_subscriptions',
  'billing_idempotency',
  // IAP / Shared Wallet live receipts, webhooks, ledger & balances
  'player_wallet_ledger',
  'player_wallet_buckets',
  'player_wallet_accounts',
  'player_entitlements',
  'iap_transactions',
  'iap_webhook_events',
  // Social private messages, reports, presence, transient parties & co-entry launch tokens
  'social_messages',
  'social_reports',
  'social_presence',
  'social_party_launch_acks',
  'social_party_launches',
  'social_party_members',
  'social_parties',
  // Hub-SSO email credentials (emails + password hashes)
  'email_credentials'
]);

export const DEFAULT_PRESERVE_PREFIXES = Object.freeze(['local_', 'dev_', 'qa_']);

export class SanitizeError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function hmacHex(salt, domain, value, length = 16) {
  return createHmac('sha256', salt).update(`${domain}:${String(value ?? '')}`).digest('hex').slice(0, length);
}

function pseudonymizeNonNullColumn(db, tables, tableColumns, table, col, hmacSalt, domain, prefix) {
  if (!tables.has(table) || !tableColumns.get(table)?.includes(col)) return 0;
  const rows = db.prepare(`SELECT rowid AS _rid, ${col} AS val FROM ${table} WHERE ${col} IS NOT NULL AND ${col} != ''`).all();
  if (!rows.length) return 0;
  const upd = db.prepare(`UPDATE ${table} SET ${col} = ? WHERE rowid = ?`);
  let count = 0;
  for (const r of rows) {
    upd.run(`${prefix}${hmacHex(hmacSalt, domain, r.val, 16)}`, r._rid);
    count++;
  }
  return count;
}

function validateAllowlist(db) {
  const objects = db.prepare("SELECT type, name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'").all();
  for (const obj of objects) {
    if (obj.type === 'trigger' || obj.type === 'view' || /\bCREATE\s+VIRTUAL\s+TABLE\b/i.test(obj.sql || '')) {
      throw new SanitizeError('SANITIZE_FORBIDDEN_OBJECT', `Forbidden SQLite schema object: ${obj.type} ${obj.name}`);
    }
  }
  const tables = new Set(objects.filter(o => o.type === 'table').map(o => o.name));
  const tableColumns = new Map();
  for (const table of tables) {
    const allowedCols = SCHEMA_ALLOWLIST[table];
    if (!allowedCols) {
      throw new SanitizeError(
        'SANITIZE_UNKNOWN_TABLE',
        `Unregistered table '${table}' blocked by Fail-Closed Allowlist. Classify its PII policy before cloning.`
      );
    }
    const allowedSet = new Set(allowedCols);
    const actualCols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
    for (const col of actualCols) {
      if (!allowedSet.has(col)) {
        throw new SanitizeError(
          'SANITIZE_UNKNOWN_COLUMN',
          `Unregistered column '${table}.${col}' blocked by Fail-Closed Allowlist. Classify its PII policy before cloning.`
        );
      }
    }
    tableColumns.set(table, actualCols);
  }
  return { tables, tableColumns };
}

function hasPrefix(value, prefixes) {
  if (typeof value !== 'string') return false;
  return prefixes.some(p => value.startsWith(p));
}

function upsertRows(destDb, table, columns, rows) {
  if (!rows.length) return 0;
  const colList = columns.join(', ');
  const placeholders = columns.map(() => '?').join(', ');
  const stmt = destDb.prepare(`INSERT OR REPLACE INTO ${table} (${colList}) VALUES (${placeholders})`);
  let count = 0;
  for (const row of rows) {
    stmt.run(...columns.map(c => row[c]));
    count++;
  }
  return count;
}

function preserveLocalAndDevData(destDb, destTables, destColumns, preserveFromPath, preservePrefixes) {
  const preserved = { users: 0, identities: 0, saves: 0, compliance: 0, overrides: 0, publications: 0, submissions: 0 };
  const srcPath = assertNoLinks(preserveFromPath);
  regularFile(srcPath, 'Preserve-from SQLite database');
  const srcDb = new DatabaseSync(srcPath, { readOnly: true, timeout: 5000 });
  try {
    const srcTables = new Set(
      srcDb.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r => r.name)
    );
    const commonCols = (table) => {
      if (!srcTables.has(table) || !destTables.has(table)) return null;
      const sCols = new Set(srcDb.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name));
      return destColumns.get(table).filter(c => sCols.has(c));
    };

    // 1. Preserve local/dev test users and their dependent graph
    const userCols = commonCols('users');
    const keptUserIds = new Set();
    if (userCols) {
      const allSrcUsers = srcDb.prepare(`SELECT ${userCols.join(', ')} FROM users`).all();
      const localUsers = allSrcUsers.filter(u => hasPrefix(u.id, preservePrefixes));
      for (const u of localUsers) keptUserIds.add(u.id);
      preserved.users = upsertRows(destDb, 'users', userCols, localUsers);
    }

    if (keptUserIds.size > 0) {
      const idCols = commonCols('identities');
      if (idCols) {
        const rows = srcDb.prepare(`SELECT ${idCols.join(', ')} FROM identities`).all().filter(r => keptUserIds.has(r.user_id));
        preserved.identities = upsertRows(destDb, 'identities', idCols, rows);
      }
      for (const [tbl, keyField, counter] of [
        ['save_slots', 'principal_id', 'saves'],
        ['save_slot_versions', 'principal_id', null],
        ['wishlist_items', 'principal_id', null],
        ['user_preferences', 'principal_id', null],
        ['user_age_compliance', 'principal_id', 'compliance'],
        ['parental_consent_logs', 'principal_id', null],
        ['user_profiles', 'principal_id', null]
      ]) {
        const cols = commonCols(tbl);
        if (!cols) continue;
        const rows = srcDb.prepare(`SELECT ${cols.join(', ')} FROM ${tbl}`).all().filter(r => keptUserIds.has(r[keyField]));
        const n = upsertRows(destDb, tbl, cols, rows);
        if (counter) preserved[counter] += n;
      }
    }

    // 2. Preserve local/dev-only game overrides, unreleased publications, and creator submissions
    const ovCols = commonCols('game_overrides');
    if (ovCols) {
      const destIds = new Set(destDb.prepare('SELECT game_id FROM game_overrides').all().map(r => r.game_id));
      const rows = srcDb.prepare(`SELECT ${ovCols.join(', ')} FROM game_overrides`).all().filter(r => !destIds.has(r.game_id));
      preserved.overrides = upsertRows(destDb, 'game_overrides', ovCols, rows);
    }

    const pubCols = commonCols('hub_publications');
    if (pubCols) {
      const destIds = new Set(destDb.prepare('SELECT game_id FROM hub_publications').all().map(r => r.game_id));
      const rows = srcDb.prepare(`SELECT ${pubCols.join(', ')} FROM hub_publications`).all().filter(r => !destIds.has(r.game_id));
      preserved.publications = upsertRows(destDb, 'hub_publications', pubCols, rows);
    }

    const subCols = commonCols('creator_submissions');
    if (subCols) {
      const destIds = new Set(destDb.prepare('SELECT id FROM creator_submissions').all().map(r => r.id));
      const rows = srcDb.prepare(`SELECT ${subCols.join(', ')} FROM creator_submissions`).all().filter(r => !destIds.has(r.id));
      preserved.submissions = upsertRows(destDb, 'creator_submissions', subCols, rows);
    }
  } finally {
    srcDb.close();
  }
  return preserved;
}

/**
 * Creates a sanitized, Fail-Closed Allowlist SQLite snapshot suitable for live -> dev
 * (or dev -> local) replication while optionally preserving existing local/dev test records.
 */
export async function sanitizeSnapshot({
  from,
  out,
  sourceEnv = 'live',
  targetEnv = 'dev',
  salt = null,
  eventsDays = 7,
  targetOrigin = null,
  preserveFrom = null,
  preservePrefixes = DEFAULT_PRESERVE_PREFIXES,
  now = () => Date.now()
}) {
  if (!from || !out) {
    throw new SanitizeError('SANITIZE_ARGS', 'Both --from and --out paths are required.');
  }
  const normalizedTarget = String(targetEnv).trim().toLowerCase();
  if (normalizedTarget === 'live' || normalizedTarget === 'prod' || normalizedTarget === 'production') {
    throw new SanitizeError('SANITIZE_FORBIDDEN_TARGET', 'One-way guardrail: targetEnv cannot be live/production.');
  }
  if (!Number.isFinite(eventsDays) || eventsDays < 0) {
    throw new SanitizeError('SANITIZE_ARGS', 'eventsDays must be a non-negative number.');
  }

  const sourcePath = assertNoLinks(from);
  regularFile(sourcePath, 'Source SQLite database');
  const outPath = assertNoLinks(out);
  const metadataPath = outPath + '.json';
  if (sourcePath === outPath || ['', '-wal', '-shm', '-journal', '.json'].some(s => fs.existsSync(outPath + s))) {
    throw new SanitizeError('SANITIZE_TARGET_EXISTS', 'Choose a new output path; existing files will not be overwritten.');
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true, mode: 0o700 });
  const hmacSalt = salt || randomBytes(32).toString('hex');
  const createdFiles = [];

  try {
    // Online WAL-safe snapshot copy
    const srcDb = new DatabaseSync(sourcePath, { readOnly: true, timeout: 5000 });
    try {
      await backup(srcDb, outPath);
      createdFiles.push(outPath);
    } finally {
      srcDb.close();
    }

    const db = new DatabaseSync(outPath, { timeout: 5000 });
    let stats = {
      droppedTables: [],
      pseudonymizedUsers: 0,
      pseudonymizedIdentities: 0,
      pseudonymizedOwners: 0,
      pseudonymizedActors: 0,
      sanitizedConsentLogs: 0,
      sanitizedPlaySessions: 0,
      closedOpenPlaySessions: 0,
      prunedEvents: 0,
      prunedErrors: 0,
      prunedPlaySessions: 0,
      rewrittenPublications: 0,
      preserved: null
    };
    let dbVersion = 0;

    try {
      db.exec('PRAGMA trusted_schema=OFF; PRAGMA foreign_keys=ON');
      const { tables, tableColumns } = validateAllowlist(db);
      dbVersion = db.prepare('PRAGMA user_version').get().user_version;

      db.exec('BEGIN IMMEDIATE');
      try {
        // 1. Wipe all auth/session/token/audit/idempotency tables unconditionally
        for (const tbl of DROP_TABLES) {
          if (tables.has(tbl)) {
            db.exec(`DELETE FROM ${tbl}`);
            stats.droppedTables.push(tbl);
          }
        }

        // 2. Deterministic HMAC pseudonymization of users.display_name
        if (tables.has('users')) {
          const users = db.prepare('SELECT id, display_name FROM users').all();
          const upd = db.prepare('UPDATE users SET display_name = ? WHERE id = ?');
          for (const u of users) {
            const label = `DevUser_${hmacHex(hmacSalt, 'user_display', u.id, 8)}`;
            upd.run(label, u.id);
            stats.pseudonymizedUsers++;
          }
        }

        // 2b. Pseudonymize user_profiles.handle and clear free-text bio
        if (tables.has('user_profiles')) {
          const profs = db.prepare('SELECT principal_id FROM user_profiles').all();
          const upd = db.prepare("UPDATE user_profiles SET handle = ?, bio = '' WHERE principal_id = ?");
          for (const p of profs) {
            const code = String((parseInt(hmacHex(hmacSalt, 'profile_tag', p.principal_id, 4), 16) % 9000) + 1000);
            const h = `DevUser_${hmacHex(hmacSalt, 'profile_handle', p.principal_id, 6)}#${code}`;
            upd.run(h, p.principal_id);
          }
        }

        // 3. Deterministic HMAC pseudonymization of identities.subject (preserving FK to users.id)
        if (tables.has('identities')) {
          const idents = db.prepare('SELECT provider, subject, user_id FROM identities').all();
          db.exec('DELETE FROM identities');
          const ins = db.prepare('INSERT INTO identities (provider, subject, user_id) VALUES (?, ?, ?)');
          for (const row of idents) {
            const fakeSubject = `devsub_${hmacHex(hmacSalt, `ident:${row.provider}`, row.subject, 16)}`;
            ins.run(row.provider, fakeSubject, row.user_id);
            stats.pseudonymizedIdentities++;
          }
        }

        // 4. Re-hash parental_consent_logs.guardian_contact_hash so live guardian contacts are unlinkable
        if (tables.has('parental_consent_logs')) {
          const logs = db.prepare('SELECT id, guardian_contact_hash FROM parental_consent_logs').all();
          const upd = db.prepare('UPDATE parental_consent_logs SET guardian_contact_hash = ? WHERE id = ?');
          for (const log of logs) {
            upd.run(`sanitized_${hmacHex(hmacSalt, 'guardian', log.guardian_contact_hash, 16)}`, log.id);
            stats.sanitizedConsentLogs++;
          }
        }

        // 5. Prune high-volume telemetry tables to recent N days (or drop all if eventsDays === 0)
        const stamp = now();
        const cutoff = eventsDays === 0 ? Number.MAX_SAFE_INTEGER : stamp - eventsDays * 86400000;
        if (tables.has('events')) {
          stats.prunedEvents = db.prepare('DELETE FROM events WHERE received_at < ?').run(cutoff).changes;
        }
        if (tables.has('errors')) {
          stats.prunedErrors = db.prepare('DELETE FROM errors WHERE created_at < ?').run(cutoff).changes;
        }
        if (tables.has('play_sessions')) {
          stats.prunedPlaySessions = db.prepare('DELETE FROM play_sessions WHERE started_at < ?').run(cutoff).changes;
          const survivingSessions = db.prepare('SELECT id, session_hash, ended_at FROM play_sessions').all();
          const updPs = db.prepare(
            'UPDATE play_sessions SET session_hash = ?, ended_at = COALESCE(ended_at, ?), paused = CASE WHEN ended_at IS NULL THEN 1 ELSE paused END WHERE id = ?'
          );
          for (const ps of survivingSessions) {
            const maskedHash = `sanitized_sess_${hmacHex(hmacSalt, 'play_session_hash', ps.session_hash, 16)}`;
            updPs.run(maskedHash, stamp, ps.id);
            stats.sanitizedPlaySessions++;
            if (ps.ended_at === null || ps.ended_at === undefined) {
              stats.closedOpenPlaySessions++;
            }
          }
        }

        // 5b. Deterministic HMAC pseudonymization of owner_key / cdn owner identifiers
        if (tables.has('cdn_storage')) {
          const storageCols = tableColumns.get('cdn_storage');
          const storageRows = db.prepare(`SELECT ${storageCols.join(', ')} FROM cdn_storage`).all();
          if (storageRows.length > 0) {
            db.exec('DELETE FROM cdn_storage');
            const insStorage = db.prepare(
              `INSERT INTO cdn_storage (${storageCols.join(', ')}) VALUES (${storageCols.map(() => '?').join(', ')})`
            );
            for (const row of storageRows) {
              const vals = storageCols.map(c =>
                c === 'owner' ? `owner_${hmacHex(hmacSalt, 'owner_key', row.owner, 16)}` : row[c]
              );
              insStorage.run(...vals);
              stats.pseudonymizedOwners++;
            }
          }
        }
        for (const [tbl, col] of [
          ['creator_submissions', 'owner_key'],
          ['hub_publications', 'owner_key'],
          ['cdn_projects', 'owner'],
          ['cdn_blobs', 'owner'],
          ['cdn_save_plans', 'owner'],
          ['cdn_uploads', 'owner'],
          ['cdn_pins', 'owner']
        ]) {
          stats.pseudonymizedOwners += pseudonymizeNonNullColumn(
            db, tables, tableColumns, tbl, col, hmacSalt, 'owner_key', 'owner_'
          );
        }

        // 5c. Deterministic HMAC pseudonymization of admin/actor IDs (updated_by, created_by, actor_id, unpublished_by, author)
        for (const [tbl, col] of [
          ['submission_checklists', 'updated_by'],
          ['l10n_translations', 'updated_by'],
          ['l10n_media_assets', 'updated_by'],
          ['l10n_releases', 'created_by'],
          ['hub_publication_history', 'actor_id'],
          ['hub_publications', 'unpublished_by'],
          ['datastore_entries', 'updated_by'],
          ['datastore_versions', 'updated_by'],
          ['billing_spending_limits', 'updated_by'],
          ['cdn_commits', 'author']
        ]) {
          stats.pseudonymizedActors += pseudonymizeNonNullColumn(
            db, tables, tableColumns, tbl, col, hmacSalt, 'actor_id', 'actor_'
          );
        }

        // 5d. Clear stale live lock holders from datastore_entries
        if (tables.has('datastore_entries')) {
          db.exec('UPDATE datastore_entries SET lock_holder = NULL, lock_expires_at = NULL WHERE lock_holder IS NOT NULL OR lock_expires_at IS NOT NULL');
        }

        // 6. Optional targetOrigin rewrite for hub_publications.artifact_base_url
        if (targetOrigin && tables.has('hub_publications')) {
          const cleanOrigin = String(targetOrigin).trim().replace(/\/$/, '');
          const pubs = db.prepare('SELECT game_id, artifact_base_url FROM hub_publications').all();
          const upd = db.prepare('UPDATE hub_publications SET artifact_base_url = ? WHERE game_id = ?');
          for (const pub of pubs) {
            if (typeof pub.artifact_base_url === 'string' && /^https?:\/\//i.test(pub.artifact_base_url)) {
              const parsed = new URL(pub.artifact_base_url);
              upd.run(`${cleanOrigin}${parsed.pathname}`, pub.game_id);
              stats.rewrittenPublications++;
            }
          }
        }

        // 7. Preserve existing local/dev test accounts & unreleased local/dev games if requested
        if (preserveFrom) {
          stats.preserved = preserveLocalAndDevData(db, tables, tableColumns, preserveFrom, preservePrefixes);
        }

        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }

      // Self-contained DELETE journal + integrity + FK verification
      db.exec('PRAGMA journal_mode=DELETE; VACUUM;');
      const integrity = Object.values(db.prepare('PRAGMA integrity_check(1)').get())[0];
      if (integrity !== 'ok') {
        throw new SanitizeError('SANITIZE_INTEGRITY', `Post-sanitize integrity check failed: ${integrity}`);
      }
      if (db.prepare('PRAGMA foreign_key_check').get()) {
        throw new SanitizeError('SANITIZE_FOREIGN_KEYS', 'Post-sanitize foreign key check failed.');
      }
    } finally {
      db.close();
    }

    if (process.platform !== 'win32') fs.chmodSync(outPath, 0o600);
    const sha256 = await hashFile(outPath);
    const bytes = fs.statSync(outPath).size;
    const report = {
      schemaVersion: 1,
      sanitizerVersion: SANITIZER_VERSION,
      ok: true,
      sanitized: true,
      sourceEnv,
      targetEnv: normalizedTarget,
      createdAt: new Date(now()).toISOString(),
      path: outPath,
      bytes,
      sha256,
      integrity: 'ok',
      foreignKeys: 'ok',
      databaseUserVersion: dbVersion,
      snapshotType: 'sqlite-sanitized-clone',
      stats
    };
    fs.writeFileSync(metadataPath, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
    createdFiles.push(metadataPath);
    return report;
  } catch (err) {
    for (const f of [metadataPath, outPath, outPath + '-wal', outPath + '-shm', outPath + '-journal']) {
      try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
    }
    throw err;
  }
}

function parseCliArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--help') return { help: true };
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) throw new SanitizeError('SANITIZE_ARGS', `Missing value for ${flag}`);
    switch (flag) {
      case '--from': opts.from = next; break;
      case '--out': opts.out = next; break;
      case '--source-env': opts.sourceEnv = next; break;
      case '--target-env': opts.targetEnv = next; break;
      case '--salt': opts.salt = next; break;
      case '--events-days': opts.eventsDays = Number(next); break;
      case '--target-origin': opts.targetOrigin = next; break;
      case '--preserve-from': opts.preserveFrom = next; break;
      case '--preserve-prefixes': opts.preservePrefixes = next.split(',').map(s => s.trim()).filter(Boolean); break;
      default: throw new SanitizeError('SANITIZE_ARGS', `Unknown option: ${flag}`);
    }
    i++;
  }
  return opts;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseCliArgs(process.argv.slice(2));
    if (args.help) {
      console.log(
        'Usage: node hub/tools/sanitize-snapshot.mjs --from <live.sqlite> --out <sanitized.sqlite> ' +
        '[--source-env live] [--target-env dev|local] [--events-days 7] [--target-origin https://dev...] ' +
        '[--preserve-from <existing-dev-or-local.sqlite>] [--preserve-prefixes local_,dev_,qa_]'
      );
    } else {
      const report = await sanitizeSnapshot(args);
      console.log(JSON.stringify(report, null, 2));
    }
  } catch (err) {
    console.error(`Sanitize failed [${err.code || 'ERROR'}]: ${err.message}`);
    process.exitCode = 1;
  }
}
