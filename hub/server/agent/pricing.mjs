// Token Quota & PlayCoin Overage Pricing Engine (Hub-Agent).
// 3-Stage Waterfall:
// 1. User BYOK (connected personal account): 0 quota used, 0 PlayCoin charged
// 2. Plan Included Quota:
//    - Free tier: 1-time trial allowance (`freeTrialTokens`, default 50,000 weighted tokens)
//    - Pro tier:  Weekly resetting allowance (`proWeeklyTokens`, default 500,000 weighted tokens, resets Mon 00:00 KST)
// 3. Overage: weighted tokens exceeding plan quota deduct PlayCoins (`ceil(overage / tokensPerCoin)`, min 1)

import { ApiError } from '../security.mjs';
import { DEFAULT_AGENT_POLICY } from './schema.mjs';

const KST_OFFSET_MS = 9 * 3600_000;
const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

export function currentKstWeekWindow(stamp = Date.now()) {
  const kstMs = stamp + KST_OFFSET_MS;
  const kstDate = new Date(kstMs);
  // UTC day on shifted timestamp gives KST day-of-week: 0=Sun, 1=Mon, ..., 6=Sat
  const dayOfWeek = kstDate.getUTCDay();
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  const mondayStartKstMs = Date.UTC(
    kstDate.getUTCFullYear(),
    kstDate.getUTCMonth(),
    kstDate.getUTCDate() - daysSinceMonday,
    0, 0, 0, 0
  );
  const weekStartUtcMs = mondayStartKstMs - KST_OFFSET_MS;
  const nextResetUtcMs = weekStartUtcMs + WEEK_MS;

  // ISO week number on KST Monday
  const thursdayKst = new Date(mondayStartKstMs + 3 * DAY_MS);
  const isoYear = thursdayKst.getUTCFullYear();
  const jan4 = Date.UTC(isoYear, 0, 4);
  const jan4Monday = jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * DAY_MS;
  const weekNo = Math.floor((mondayStartKstMs - jan4Monday) / WEEK_MS) + 1;
  const weekKey = `${isoYear}-W${String(weekNo).padStart(2, '0')}`;

  return {
    weekKey,
    weekStartAt: new Date(weekStartUtcMs).toISOString(),
    nextResetAt: new Date(nextResetUtcMs).toISOString(),
    nextResetMs: nextResetUtcMs
  };
}

export function isProModel(model = '') {
  return /(?:^|[-_/.])(?:pro|opus|ultra)(?:$|[-_/.0-9])/i.test(String(model || ''));
}

export function normalizeTokenUsage(raw = {}) {
  const inputTokens = Math.max(0, Math.trunc(Number(raw.inputTokens ?? raw.input ?? 0) || 0));
  const cachedTokens = Math.max(0, Math.trunc(Number(raw.cachedTokens ?? raw.cached ?? 0) || 0));
  const outputTokens = Math.max(0, Math.trunc(Number(raw.outputTokens ?? raw.output ?? 0) || 0));
  const thinkingTokens = Math.max(0, Math.trunc(Number(raw.thinkingTokens ?? raw.thoughts ?? 0) || 0));
  const explicitTotal = Math.max(0, Math.trunc(Number(raw.totalTokens ?? raw.total ?? 0) || 0));
  const computedTotal = inputTokens + cachedTokens + outputTokens + thinkingTokens;
  return {
    inputTokens,
    cachedTokens,
    outputTokens,
    thinkingTokens,
    totalTokens: Math.max(explicitTotal, computedTotal)
  };
}

export function readAgentPolicy(db) {
  const row = db.prepare("SELECT * FROM hub_agent_settings WHERE id = 'default'").get();
  if (!row) return { ...DEFAULT_AGENT_POLICY, updatedAt: Date.now() };
  return {
    id: row.id,
    defaultProvider: row.default_provider,
    defaultModel: row.default_model,
    tokensPerCoin: row.tokens_per_coin,
    inputWeightBps: row.input_weight_bps,
    cachedWeightBps: row.cached_weight_bps,
    outputWeightBps: row.output_weight_bps,
    proMultiplierBps: row.pro_multiplier_bps,
    minCoinsPerCall: row.min_coins_per_call,
    freeTrialTokens: row.free_trial_tokens,
    proWeeklyTokens: row.pro_weekly_tokens,
    maxHoldCoins: row.max_hold_coins,
    updatedAt: row.updated_at
  };
}

export function updateAgentPolicy(db, patch = {}, now = Date.now) {
  const current = readAgentPolicy(db);
  const next = {
    defaultProvider: patch.defaultProvider !== undefined ? String(patch.defaultProvider).trim() : current.defaultProvider,
    defaultModel: patch.defaultModel !== undefined ? String(patch.defaultModel).trim() : current.defaultModel,
    tokensPerCoin: patch.tokensPerCoin !== undefined ? Number(patch.tokensPerCoin) : current.tokensPerCoin,
    inputWeightBps: patch.inputWeightBps !== undefined ? Number(patch.inputWeightBps) : current.inputWeightBps,
    cachedWeightBps: patch.cachedWeightBps !== undefined ? Number(patch.cachedWeightBps) : current.cachedWeightBps,
    outputWeightBps: patch.outputWeightBps !== undefined ? Number(patch.outputWeightBps) : current.outputWeightBps,
    proMultiplierBps: patch.proMultiplierBps !== undefined ? Number(patch.proMultiplierBps) : current.proMultiplierBps,
    minCoinsPerCall: patch.minCoinsPerCall !== undefined ? Number(patch.minCoinsPerCall) : current.minCoinsPerCall,
    freeTrialTokens: patch.freeTrialTokens !== undefined ? Number(patch.freeTrialTokens) : current.freeTrialTokens,
    proWeeklyTokens: patch.proWeeklyTokens !== undefined ? Number(patch.proWeeklyTokens) : current.proWeeklyTokens,
    maxHoldCoins: patch.maxHoldCoins !== undefined ? Number(patch.maxHoldCoins) : current.maxHoldCoins
  };

  if (!['gemini-oauth', 'gemini-apikey'].includes(next.defaultProvider)) {
    throw new ApiError(422, 'INVALID_DEFAULT_PROVIDER', 'defaultProvider must be gemini-oauth or gemini-apikey');
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{1,95}$/.test(next.defaultModel)) {
    throw new ApiError(422, 'INVALID_DEFAULT_MODEL', '유효한 Gemini 모델 ID를 입력해 주세요.');
  }
  if (!Number.isSafeInteger(next.tokensPerCoin) || next.tokensPerCoin < 100 || next.tokensPerCoin > 1_000_000) {
    throw new ApiError(422, 'INVALID_TOKENS_PER_COIN', 'tokensPerCoin must be an integer between 100 and 1,000,000');
  }
  if (!Number.isSafeInteger(next.inputWeightBps) || next.inputWeightBps < 100 || next.inputWeightBps > 200_000) {
    throw new ApiError(422, 'INVALID_INPUT_WEIGHT');
  }
  if (!Number.isSafeInteger(next.cachedWeightBps) || next.cachedWeightBps < 0 || next.cachedWeightBps > 200_000) {
    throw new ApiError(422, 'INVALID_CACHED_WEIGHT');
  }
  if (!Number.isSafeInteger(next.outputWeightBps) || next.outputWeightBps < 100 || next.outputWeightBps > 400_000) {
    throw new ApiError(422, 'INVALID_OUTPUT_WEIGHT');
  }
  if (!Number.isSafeInteger(next.proMultiplierBps) || next.proMultiplierBps < 10_000 || next.proMultiplierBps > 200_000) {
    throw new ApiError(422, 'INVALID_PRO_MULTIPLIER');
  }
  if (!Number.isSafeInteger(next.minCoinsPerCall) || next.minCoinsPerCall < 1 || next.minCoinsPerCall > 100) {
    throw new ApiError(422, 'INVALID_MIN_COINS');
  }
  if (!Number.isSafeInteger(next.freeTrialTokens) || next.freeTrialTokens < 0 || next.freeTrialTokens > 50_000_000) {
    throw new ApiError(422, 'INVALID_FREE_TRIAL_TOKENS');
  }
  if (!Number.isSafeInteger(next.proWeeklyTokens) || next.proWeeklyTokens < 0 || next.proWeeklyTokens > 500_000_000) {
    throw new ApiError(422, 'INVALID_PRO_WEEKLY_TOKENS');
  }
  if (!Number.isSafeInteger(next.maxHoldCoins) || next.maxHoldCoins < next.minCoinsPerCall || next.maxHoldCoins > 500) {
    throw new ApiError(422, 'INVALID_MAX_HOLD_COINS');
  }

  db.prepare(`
    UPDATE hub_agent_settings
    SET default_provider = ?,
        default_model = ?,
        tokens_per_coin = ?,
        input_weight_bps = ?,
        cached_weight_bps = ?,
        output_weight_bps = ?,
        pro_multiplier_bps = ?,
        min_coins_per_call = ?,
        free_trial_tokens = ?,
        pro_weekly_tokens = ?,
        max_hold_coins = ?,
        updated_at = ?
    WHERE id = 'default'
  `).run(
    next.defaultProvider,
    next.defaultModel,
    next.tokensPerCoin,
    next.inputWeightBps,
    next.cachedWeightBps,
    next.outputWeightBps,
    next.proMultiplierBps,
    next.minCoinsPerCall,
    next.freeTrialTokens,
    next.proWeeklyTokens,
    next.maxHoldCoins,
    now()
  );

  return readAgentPolicy(db);
}

export function getQuotaSnapshot(db, { principalId, planTier = 'free', policy = DEFAULT_AGENT_POLICY, now = Date.now }) {
  const stamp = now();
  const week = currentKstWeekWindow(stamp);
  db.prepare(`
    INSERT OR IGNORE INTO hub_agent_quotas(principal_id, free_trial_used, pro_week_key, pro_week_used, updated_at)
    VALUES (?, 0, ?, 0, ?)
  `).run(principalId, week.weekKey, stamp);

  let row = db.prepare('SELECT * FROM hub_agent_quotas WHERE principal_id = ?').get(principalId);
  if (row.pro_week_key !== week.weekKey) {
    db.prepare('UPDATE hub_agent_quotas SET pro_week_key = ?, pro_week_used = 0, updated_at = ? WHERE principal_id = ?')
      .run(week.weekKey, stamp, principalId);
    row = db.prepare('SELECT * FROM hub_agent_quotas WHERE principal_id = ?').get(principalId);
  }

  const isPro = planTier === 'pro';
  const limitTokens = isPro ? policy.proWeeklyTokens : policy.freeTrialTokens;
  const usedTokens = isPro ? row.pro_week_used : row.free_trial_used;
  const remainingTokens = Math.max(0, limitTokens - usedTokens);

  return {
    planTier: isPro ? 'pro' : 'free',
    quotaKind: isPro ? 'pro_weekly' : 'free_trial',
    weekKey: isPro ? week.weekKey : null,
    nextResetAt: isPro ? week.nextResetAt : null,
    limitTokens,
    usedTokens,
    remainingTokens,
    freeTrialLimit: policy.freeTrialTokens,
    freeTrialUsed: row.free_trial_used,
    freeTrialRemaining: Math.max(0, policy.freeTrialTokens - row.free_trial_used),
    proWeeklyLimit: policy.proWeeklyTokens,
    proWeeklyUsed: row.pro_week_used,
    proWeeklyRemaining: Math.max(0, policy.proWeeklyTokens - row.pro_week_used)
  };
}

export function computeWeightedTokens({ usage, model = '', policy = DEFAULT_AGENT_POLICY }) {
  const norm = normalizeTokenUsage(usage);
  const pro = isProModel(model);
  const tierMultiplierBps = pro ? policy.proMultiplierBps : 10000;
  const inputWeighted = (norm.inputTokens * policy.inputWeightBps) / 10000;
  const cachedWeighted = (norm.cachedTokens * policy.cachedWeightBps) / 10000;
  const outputWeighted = ((norm.outputTokens + norm.thinkingTokens) * policy.outputWeightBps) / 10000;
  const weightedTokens = Math.ceil(((inputWeighted + cachedWeighted + outputWeighted) * tierMultiplierBps) / 10000);
  return {
    ...norm,
    modelTier: pro ? 'pro' : 'flash',
    tierMultiplier: tierMultiplierBps / 10000,
    weightedTokens
  };
}

export function computeTokenSettlement({
  usage,
  model = '',
  policy = DEFAULT_AGENT_POLICY,
  authMode = 'hub_managed',
  remainingQuotaTokens = 0
}) {
  const base = computeWeightedTokens({ usage, model, policy });
  if (authMode === 'user_byok') {
    return {
      ...base,
      tokensPerCoin: policy.tokensPerCoin,
      quotaTokensUsed: 0,
      overageTokens: 0,
      chargedCoins: 0
    };
  }

  const safeRemainingQuota = Math.max(0, Math.trunc(Number(remainingQuotaTokens) || 0));
  const quotaTokensUsed = Math.min(safeRemainingQuota, base.weightedTokens);
  const overageTokens = Math.max(0, base.weightedTokens - quotaTokensUsed);

  let chargedCoins = 0;
  if (overageTokens > 0) {
    const rawCoins = Math.ceil(overageTokens / policy.tokensPerCoin);
    chargedCoins = Math.max(policy.minCoinsPerCall, rawCoins);
  } else if (base.totalTokens === 0 && safeRemainingQuota === 0) {
    chargedCoins = policy.minCoinsPerCall;
  }

  return {
    ...base,
    tokensPerCoin: policy.tokensPerCoin,
    quotaTokensUsed,
    overageTokens,
    chargedCoins
  };
}

export function estimatePreCallBudget({
  promptChars = 0,
  feature = 'hub_chat',
  model = '',
  policy = DEFAULT_AGENT_POLICY,
  remainingQuotaTokens = 0,
  availableCoins = 0
}) {
  const estInputTokens = Math.max(120, Math.ceil(Math.max(0, Number(promptChars) || 0) / 3));
  const estOutputTokens = feature === 'project_porting'
    ? 2800
    : feature === 'modeling_3d'
      ? 2200
      : 1000;
  const est = computeTokenSettlement({
    usage: { inputTokens: estInputTokens, outputTokens: estOutputTokens },
    model,
    policy,
    authMode: 'hub_managed',
    remainingQuotaTokens
  });

  // If the user still has included Free Trial or Pro Weekly quota:
  // - No hold is needed when remainingQuotaTokens covers the expected call!
  // - Even if remainingQuotaTokens is smaller than worst-case output, if availableCoins === 0,
  //   let them use their remaining included quota (tail absorbed up to quota boundary).
  if (est.overageTokens === 0) {
    return { allowed: true, holdCoins: 0, coveredByQuota: true };
  }
  if (remainingQuotaTokens > 0 && availableCoins === 0) {
    return { allowed: true, holdCoins: 0, coveredByQuota: true };
  }

  const minNeeded = policy.minCoinsPerCall;
  if (availableCoins < minNeeded) {
    return {
      allowed: false,
      holdCoins: 0,
      coveredByQuota: false,
      requiredCoins: Math.max(minNeeded, est.chargedCoins)
    };
  }

  const desiredHold = Math.min(policy.maxHoldCoins, Math.max(minNeeded, est.chargedCoins + 2));
  const holdCoins = Math.min(availableCoins, desiredHold);
  return {
    allowed: true,
    holdCoins,
    coveredByQuota: false
  };
}
