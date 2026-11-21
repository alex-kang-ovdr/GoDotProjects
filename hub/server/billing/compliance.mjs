// Compliance & spending limit guard shared across Web, PC, and GiftCard redemption.
// Enforces: registered Google account (no guest purchases), age-tier rules,
// guardian approval for CHILD_PROTECTED, and KST monthly/daily spending caps.

import { ApiError } from '../security.mjs';
import { ensureWallet } from './ledger.mjs';

const DAY_MS = 86400000;
const KST_OFFSET_MS = 9 * 3600000;

export const DEFAULT_CAPS_KRW = {
  CHILD_PROTECTED: { monthly: 0, guardianMaxMonthly: 70000, daily: 70000 },
  TEEN_MINOR: { monthly: 70000, guardianMaxMonthly: 300000, daily: 70000 },
  ADULT_NEW_7D: { monthly: 300000, daily: 150000 },
  ADULT: { monthly: 2000000, daily: 500000 }
};

export function kstMonthStartMs(stamp) {
  const kst = new Date(stamp + KST_OFFSET_MS);
  const startUtc = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), 1, 0, 0, 0, 0);
  return startUtc - KST_OFFSET_MS;
}

export function kstDayStartMs(stamp) {
  const kst = new Date(stamp + KST_OFFSET_MS);
  const startUtc = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate(), 0, 0, 0, 0);
  return startUtc - KST_OFFSET_MS;
}

export function setSpendingLimit(db, {
  principalId,
  ageTier,
  monthlyCapMinor,
  dailyCapMinor,
  guardianApproved = false,
  updatedBy = 'system',
  now = Date.now
}) {
  if (!['CHILD_PROTECTED', 'TEEN_MINOR', 'ADULT'].includes(ageTier)) {
    throw new ApiError(422, 'AGE_TIER_INVALID');
  }
  if (!Number.isSafeInteger(monthlyCapMinor) || monthlyCapMinor < 0 || !Number.isSafeInteger(dailyCapMinor) || dailyCapMinor < 0) {
    throw new ApiError(422, 'CAP_INVALID');
  }
  const stamp = now();
  db.prepare(`
    INSERT INTO billing_spending_limits(principal_id, age_tier, monthly_cap_minor, daily_cap_minor, guardian_approved, updated_by, updated_at)
    VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(principal_id) DO UPDATE SET
      age_tier=excluded.age_tier,
      monthly_cap_minor=excluded.monthly_cap_minor,
      daily_cap_minor=excluded.daily_cap_minor,
      guardian_approved=excluded.guardian_approved,
      updated_by=excluded.updated_by,
      updated_at=excluded.updated_at
  `).run(principalId, ageTier, monthlyCapMinor, dailyCapMinor, guardianApproved ? 1 : 0, updatedBy, stamp);
  return db.prepare('SELECT * FROM billing_spending_limits WHERE principal_id=?').get(principalId);
}

export function resolveSpendingPolicy(db, principalId, now = Date.now) {
  const user = db.prepare('SELECT id, kind, created_at FROM users WHERE id=?').get(principalId);
  if (!user) throw new ApiError(404, 'USER_NOT_FOUND');

  const configured = db.prepare('SELECT * FROM billing_spending_limits WHERE principal_id=?').get(principalId);
  if (configured) {
    return {
      user,
      ageTier: configured.age_tier,
      monthlyCapMinor: configured.monthly_cap_minor,
      dailyCapMinor: configured.daily_cap_minor,
      guardianApproved: configured.guardian_approved === 1
    };
  }

  const isNewAccount = (now() - user.created_at) < 7 * DAY_MS;
  const defaults = isNewAccount ? DEFAULT_CAPS_KRW.ADULT_NEW_7D : DEFAULT_CAPS_KRW.ADULT;
  return {
    user,
    ageTier: 'ADULT',
    monthlyCapMinor: defaults.monthly,
    dailyCapMinor: defaults.daily,
    guardianApproved: true
  };
}

export function assertCanPurchase(db, { principalId, amountMinor, currency = 'KRW', now = Date.now }) {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new ApiError(422, 'AMOUNT_INVALID');
  }
  const policy = resolveSpendingPolicy(db, principalId, now);

  // Guest accounts are never allowed to purchase paid PlayCoin (device/cookie loss risk).
  if (policy.user.kind !== 'registered') {
    throw new ApiError(403, 'REGISTERED_ACCOUNT_REQUIRED', 'Google account login is required before purchasing PlayCoin');
  }

  const wallet = ensureWallet(db, principalId, now);
  if (wallet.frozen_reason) {
    throw new ApiError(403, 'BILLING_ACCOUNT_FROZEN', wallet.frozen_reason);
  }
  if (wallet.debt_coins > 0) {
    throw new ApiError(403, 'BILLING_DEBT_OUTSTANDING', 'Account has outstanding chargeback debt');
  }

  if (policy.ageTier === 'CHILD_PROTECTED' && !policy.guardianApproved) {
    throw new ApiError(403, 'GUARDIAN_CONSENT_REQUIRED', 'Guardian consent is required for child accounts');
  }

  const stamp = now();
  const monthStart = kstMonthStartMs(stamp);
  const dayStart = kstDayStartMs(stamp);
  const curr = String(currency).toUpperCase();

  const monthlyUsed = db.prepare(`
    SELECT COALESCE(SUM(amount_minor), 0) AS total
    FROM billing_orders
    WHERE principal_id=? AND currency=? AND state IN ('PAID','PENDING') AND created_at >= ?
  `).get(principalId, curr, monthStart).total;

  const dailyUsed = db.prepare(`
    SELECT COALESCE(SUM(amount_minor), 0) AS total
    FROM billing_orders
    WHERE principal_id=? AND currency=? AND state IN ('PAID','PENDING') AND created_at >= ?
  `).get(principalId, curr, dayStart).total;

  if (monthlyUsed + amountMinor > policy.monthlyCapMinor) {
    throw new ApiError(422, 'MONTHLY_SPENDING_LIMIT_EXCEEDED', 'Monthly spending limit exceeded', {
      ageTier: policy.ageTier,
      monthlyCapMinor: policy.monthlyCapMinor,
      monthlyUsedMinor: monthlyUsed,
      remainingMinor: Math.max(0, policy.monthlyCapMinor - monthlyUsed)
    });
  }

  if (dailyUsed + amountMinor > policy.dailyCapMinor) {
    throw new ApiError(422, 'DAILY_SPENDING_LIMIT_EXCEEDED', 'Daily spending limit exceeded', {
      ageTier: policy.ageTier,
      dailyCapMinor: policy.dailyCapMinor,
      dailyUsedMinor: dailyUsed,
      remainingMinor: Math.max(0, policy.dailyCapMinor - dailyUsed)
    });
  }

  return {
    allowed: true,
    ageTier: policy.ageTier,
    monthlyCapMinor: policy.monthlyCapMinor,
    monthlyUsedMinor: monthlyUsed,
    dailyCapMinor: policy.dailyCapMinor,
    dailyUsedMinor: dailyUsed
  };
}
