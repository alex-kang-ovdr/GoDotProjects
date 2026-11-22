// Hub-Agent SQLite Schema (Additive, PRAGMA user_version = 1 preserved).
// Implements 3-stage AI metering aligned with HUB_BILLING_PLAN.md §2.1:
// 1) User BYOK / Local AI -> 0 quota, 0 PlayCoin
// 2) Plan Included Quota  -> Free (1-time trial tokens) / Pro (weekly resetting tokens) -> 0 PlayCoin
// 3) Overage              -> Deducts PlayCoin proportional to overage weighted tokens via Track A Zero-Sum Ledger

import { ensureBillingSchema } from '../billing/schema.mjs';

export const HUB_AGENT_FEATURES = new Set([
  'hub_chat',
  'forge_chat',
  'modeling_3d',
  'project_porting'
]);

export const HUB_AGENT_AUTH_MODES = new Set([
  'hub_managed',
  'user_byok'
]);

export const DEFAULT_AGENT_POLICY = Object.freeze({
  id: 'default',
  defaultProvider: 'gemini-oauth',
  defaultModel: 'gemini-3.5-flash',
  tokensPerCoin: 2000,
  inputWeightBps: 10000,      // 1.0x
  cachedWeightBps: 2500,      // 0.25x
  outputWeightBps: 40000,     // 4.0x (output + thinking tokens)
  proMultiplierBps: 40000,    // 4.0x for *-pro* models
  minCoinsPerCall: 1,
  freeTrialTokens: 50000,     // Free tier 1-time trial allowance (weighted tokens)
  proWeeklyTokens: 500000,    // Pro subscription weekly allowance (weighted tokens, resets Mon 00:00 KST)
  maxHoldCoins: 25
});

export function ensureHubAgentSchema(db, now = Date.now) {
  ensureBillingSchema(db);

  db.exec(`
    CREATE TABLE IF NOT EXISTS hub_agent_settings (
      id TEXT PRIMARY KEY CHECK(id = 'default'),
      default_provider TEXT NOT NULL CHECK(default_provider IN ('gemini-oauth', 'gemini-apikey')),
      default_model TEXT NOT NULL,
      tokens_per_coin INTEGER NOT NULL CHECK(tokens_per_coin >= 100 AND tokens_per_coin <= 1000000),
      input_weight_bps INTEGER NOT NULL CHECK(input_weight_bps >= 100 AND input_weight_bps <= 200000),
      cached_weight_bps INTEGER NOT NULL CHECK(cached_weight_bps >= 0 AND cached_weight_bps <= 200000),
      output_weight_bps INTEGER NOT NULL CHECK(output_weight_bps >= 100 AND output_weight_bps <= 400000),
      pro_multiplier_bps INTEGER NOT NULL CHECK(pro_multiplier_bps >= 10000 AND pro_multiplier_bps <= 200000),
      min_coins_per_call INTEGER NOT NULL CHECK(min_coins_per_call >= 1 AND min_coins_per_call <= 100),
      free_trial_tokens INTEGER NOT NULL CHECK(free_trial_tokens >= 0 AND free_trial_tokens <= 50000000),
      pro_weekly_tokens INTEGER NOT NULL CHECK(pro_weekly_tokens >= 0 AND pro_weekly_tokens <= 500000000),
      max_hold_coins INTEGER NOT NULL CHECK(max_hold_coins >= 1 AND max_hold_coins <= 500),
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS hub_agent_quotas (
      principal_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      free_trial_used INTEGER NOT NULL DEFAULT 0 CHECK(free_trial_used >= 0),
      pro_week_key TEXT NOT NULL DEFAULT '',
      pro_week_used INTEGER NOT NULL DEFAULT 0 CHECK(pro_week_used >= 0),
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS hub_agent_usage_logs (
      id TEXT PRIMARY KEY,
      principal_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      feature TEXT NOT NULL CHECK(feature IN ('hub_chat', 'forge_chat', 'modeling_3d', 'project_porting')),
      auth_mode TEXT NOT NULL CHECK(auth_mode IN ('hub_managed', 'user_byok')),
      plan_tier TEXT NOT NULL CHECK(plan_tier IN ('free', 'pro')),
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL CHECK(input_tokens >= 0),
      cached_tokens INTEGER NOT NULL CHECK(cached_tokens >= 0),
      output_tokens INTEGER NOT NULL CHECK(output_tokens >= 0),
      thinking_tokens INTEGER NOT NULL CHECK(thinking_tokens >= 0),
      total_tokens INTEGER NOT NULL CHECK(total_tokens >= 0),
      weighted_tokens INTEGER NOT NULL CHECK(weighted_tokens >= 0),
      quota_tokens_used INTEGER NOT NULL CHECK(quota_tokens_used >= 0),
      overage_tokens INTEGER NOT NULL CHECK(overage_tokens >= 0),
      charged_coins INTEGER NOT NULL CHECK(charged_coins >= 0),
      hold_id TEXT,
      usage_record_id TEXT,
      journal_entry_id TEXT,
      status TEXT NOT NULL CHECK(status IN ('SUCCEEDED', 'FAILED')),
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_hub_agent_usage_principal ON hub_agent_usage_logs(principal_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_hub_agent_usage_feature ON hub_agent_usage_logs(feature, created_at DESC);
  `);

  const stamp = now();
  db.prepare(`
    INSERT OR IGNORE INTO hub_agent_settings (
      id, default_provider, default_model, tokens_per_coin,
      input_weight_bps, cached_weight_bps, output_weight_bps, pro_multiplier_bps,
      min_coins_per_call, free_trial_tokens, pro_weekly_tokens, max_hold_coins, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    DEFAULT_AGENT_POLICY.id,
    DEFAULT_AGENT_POLICY.defaultProvider,
    DEFAULT_AGENT_POLICY.defaultModel,
    DEFAULT_AGENT_POLICY.tokensPerCoin,
    DEFAULT_AGENT_POLICY.inputWeightBps,
    DEFAULT_AGENT_POLICY.cachedWeightBps,
    DEFAULT_AGENT_POLICY.outputWeightBps,
    DEFAULT_AGENT_POLICY.proMultiplierBps,
    DEFAULT_AGENT_POLICY.minCoinsPerCall,
    DEFAULT_AGENT_POLICY.freeTrialTokens,
    DEFAULT_AGENT_POLICY.proWeeklyTokens,
    DEFAULT_AGENT_POLICY.maxHoldCoins,
    stamp
  );
}
