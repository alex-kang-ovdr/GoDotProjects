// Track A: SubscriptionService (Free / Pro plans) and UsageMetering
// (workspace storage, deploy quota, multiplayer server minutes, egress, AI usage).

import { ApiError, uid, safeString } from '../security.mjs';
import { runAtomic, withIdempotency } from './idempotency.mjs';
import { spendCoins, settleHold } from './ledger.mjs';

const MIB = 1024 * 1024;
const GIB = 1024 * MIB;
const METRIC_TYPES = new Set(['storage_bytes', 'deploy_bytes', 'server_minutes', 'egress_bytes', 'ai_units']);
const SUB_STATUSES = new Set(['ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED']);

// Official Free / Pro capacity policy (HUB_BILLING_PLAN.md §2.1).
export const PLAN_QUOTAS = {
  free: {
    planTier: 'free',
    workspaceBytes: 100 * MIB,
    maxProjects: 3,
    deployBytes: 50 * MIB,
    aiMode: 'initial_trial_credits',
    multiplayerMode: 'free_nano_quota'
  },
  pro: {
    planTier: 'pro',
    workspaceBytes: 1 * GIB,
    maxProjects: null, // unlimited
    deployBytes: 100 * MIB,
    aiMode: 'weekly_usage_limit',
    multiplayerMode: 'unlimited_ccu_payg'
  }
};

export function getSubscription(db, principalId, now = Date.now) {
  if (!safeString(principalId, 128)) throw new ApiError(400, 'PRINCIPAL_REQUIRED');
  const row = db.prepare('SELECT * FROM billing_subscriptions WHERE principal_id=?').get(principalId);
  const stamp = now();
  if (!row) {
    return {
      principalId,
      planTier: 'free',
      effectivePlan: 'free',
      status: 'ACTIVE',
      provider: 'internal',
      providerSubscriptionId: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      quotas: PLAN_QUOTAS.free
    };
  }

  const proActive = row.plan_tier === 'pro' &&
    (row.status === 'ACTIVE' || (row.status === 'CANCELED' && row.current_period_end > stamp));
  const effectivePlan = proActive ? 'pro' : 'free';

  return {
    id: row.id,
    principalId: row.principal_id,
    planTier: row.plan_tier,
    effectivePlan,
    status: row.status,
    provider: row.provider,
    providerSubscriptionId: row.provider_subscription_id,
    currentPeriodStart: row.current_period_start,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end === 1,
    quotas: PLAN_QUOTAS[effectivePlan]
  };
}

export function upsertSubscription(db, {
  principalId,
  planTier,
  status,
  provider,
  providerSubscriptionId = null,
  currentPeriodStart,
  currentPeriodEnd,
  cancelAtPeriodEnd = false,
  now = Date.now
}) {
  if (!PLAN_QUOTAS[planTier]) throw new ApiError(422, 'PLAN_TIER_INVALID');
  if (!SUB_STATUSES.has(status)) throw new ApiError(422, 'SUBSCRIPTION_STATUS_INVALID');
  if (!safeString(provider, 64)) throw new ApiError(422, 'PROVIDER_REQUIRED');
  if (!Number.isSafeInteger(currentPeriodStart) || !Number.isSafeInteger(currentPeriodEnd) || currentPeriodEnd <= currentPeriodStart) {
    throw new ApiError(422, 'SUBSCRIPTION_PERIOD_INVALID');
  }

  return runAtomic(db, () => {
    const stamp = now();
    const existing = db.prepare('SELECT id FROM billing_subscriptions WHERE principal_id=?').get(principalId);
    if (existing) {
      db.prepare(`
        UPDATE billing_subscriptions
        SET plan_tier=?, status=?, provider=?, provider_subscription_id=?,
            current_period_start=?, current_period_end=?, cancel_at_period_end=?, updated_at=?
        WHERE principal_id=?
      `).run(
        planTier, status, provider, providerSubscriptionId,
        currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd ? 1 : 0, stamp,
        principalId
      );
    } else {
      db.prepare(`
        INSERT INTO billing_subscriptions(
          id, principal_id, plan_tier, status, provider, provider_subscription_id,
          current_period_start, current_period_end, cancel_at_period_end, created_at, updated_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        uid(), principalId, planTier, status, provider, providerSubscriptionId,
        currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd ? 1 : 0, stamp, stamp
      );
    }
    return getSubscription(db, principalId, now);
  });
}

// Atomically records metered usage and settles billable PlayCoin via Hold/Capture or direct spend.
export function recordMeteredUsage(db, {
  principalId,
  metricType,
  resourceRefId,
  quantity,
  billableCoins = 0,
  holdId = null,
  allowBonusForInfra = true,
  periodKey,
  idempotencyKey,
  now = Date.now
}) {
  if (!METRIC_TYPES.has(metricType)) throw new ApiError(422, 'METRIC_TYPE_INVALID');
  if (!safeString(resourceRefId, 160)) throw new ApiError(422, 'RESOURCE_REF_REQUIRED');
  if (!safeString(periodKey, 32)) throw new ApiError(422, 'PERIOD_KEY_REQUIRED');
  if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new ApiError(422, 'USAGE_QUANTITY_INVALID');
  if (!Number.isSafeInteger(billableCoins) || billableCoins < 0) throw new ApiError(422, 'BILLABLE_COINS_INVALID');

  const outcome = withIdempotency({
    db,
    scope: 'billing.usage.meter',
    key: idempotencyKey,
    principalId,
    requestPayload: { metricType, resourceRefId, quantity, billableCoins, holdId, periodKey },
    now,
    fn: () => {
      let journalEntryId = null;
      let wallet = null;

      if (holdId) {
        const settled = settleHold(db, {
          holdId,
          actualCoins: billableCoins,
          idempotencyKey: `usage-settle:${idempotencyKey}`,
          allowBonusForInfra,
          now
        });
        journalEntryId = settled.entryId || null;
        wallet = settled.wallet;
      } else if (billableCoins > 0) {
        const sinkType = metricType === 'server_minutes' || metricType === 'egress_bytes'
          ? 'infra_server'
          : `usage_${metricType}`;
        const spent = spendCoins(db, {
          principalId,
          amountCoins: billableCoins,
          sinkType,
          sinkRefId: resourceRefId,
          idempotencyKey: `usage-spend:${idempotencyKey}`,
          allowBonusForInfra,
          now
        });
        journalEntryId = spent.entryId;
        wallet = spent.wallet;
      }

      const usageId = uid();
      const stamp = now();
      db.prepare(`
        INSERT INTO billing_usage_records(
          id, principal_id, metric_type, resource_ref_id, quantity,
          billable_coins, hold_id, journal_entry_id, period_key, idempotency_key, created_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        usageId, principalId, metricType, resourceRefId, quantity,
        billableCoins, holdId, journalEntryId, periodKey, idempotencyKey, stamp
      );

      return {
        status: 201,
        body: {
          usageId,
          metricType,
          quantity,
          billableCoins,
          holdId,
          journalEntryId,
          periodKey,
          wallet
        }
      };
    }
  });

  return { replayed: outcome.replayed, ...outcome.body };
}

export function summarizeUsage(db, { principalId, periodKey }) {
  const rows = db.prepare(`
    SELECT metric_type, SUM(quantity) AS total_quantity, SUM(billable_coins) AS total_coins, COUNT(*) AS record_count
    FROM billing_usage_records
    WHERE principal_id=? AND period_key=?
    GROUP BY metric_type
  `).all(principalId, periodKey);

  const byMetric = {};
  for (const r of rows) {
    byMetric[r.metric_type] = {
      totalQuantity: r.total_quantity,
      totalCoins: r.total_coins,
      recordCount: r.record_count
    };
  }
  return { principalId, periodKey, byMetric };
}
