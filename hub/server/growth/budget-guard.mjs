/**
 * Flywheel 1 Growth Budget & Policy Guardrail Engine.
 * Enforces hard compliance & financial caps:
 * 1. age_tier === 'ADULT' hard block (fails closed on CHILD_PROTECTED, TEEN_MINOR, UNKNOWN, missing row)
 * 2. bonusBps <= 2500 (+25% max cap)
 * 3. 0% bonus on mobile IAP channels ('aos_google_play', 'ios_app_store')
 * 4. Daily promo coin cap against billing_journal_lines ('sys:contra:promo_grant')
 * 5. Mobile store-policy copy filter (blocks external web-bonus steering phrases on mobile surfaces)
 */
import { ApiError } from '../security.mjs';

export const MAX_BONUS_BPS = 2500;
export const DEFAULT_DAILY_PROMO_CAP_COINS = 50000;
export const PROMO_CONTRA_ACCOUNT = 'sys:contra:promo_grant';
export const MOBILE_IAP_CHANNELS = Object.freeze(new Set(['aos_google_play', 'ios_app_store']));
export const MOBILE_COPY_CHANNELS = Object.freeze(
  new Set(['aos_google_play', 'ios_app_store', 'mobile_push', 'mobile_inapp', 'android', 'ios'])
);

const KST_OFFSET_MS = 9 * 3600000;
const DAY_MS = 86400000;

const MOBILE_STEERING_PATTERNS = [
  { id: 'kr_web_recharge_steering', regex: /웹(?:사이트|브라우저|스토어|페이지)?\s*(?:에서|으로)[^\n.!?]{0,24}(?:충전|결제|구매|보너스|할인|저렴|싸게)/i },
  { id: 'kr_external_payment_steering', regex: /외부\s*(?:웹|링크|스토어|결제|충전)[^\n.!?]{0,20}(?:결제|충전|보너스|할인|\+25%)/i },
  { id: 'kr_browser_bonus_steering', regex: /브라우저\s*(?:에서|로)[^\n.!?]{0,20}(?:결제|충전|보너스)/i },
  { id: 'kr_web_bonus_percent', regex: /(?:웹|pc)\s*(?:결제|충전)?\s*(?:\+?\s*(?:1\d|2[0-5])\s*%|보너스)/i },
  { id: 'en_web_store_steering', regex: /\b(?:buy|top[- ]?up|purchase|recharge|pay|checkout)\s+(?:on|via|at)\s+(?:the\s+)?(?:web|website|browser)\b/i },
  { id: 'en_cheaper_on_web', regex: /\b(?:cheaper|save\s+\d+%|extra\s+bonus|\+\s*25%)\s+(?:on|via)\s+(?:the\s+)?(?:web|web\s*store|browser)\b/i },
  { id: 'en_web_bonus_offer', regex: /\bweb\s*(?:store|shop|checkout|top[- ]?up)\s*(?:bonus|discount|\+\s*\d+%)/i },
  { id: 'external_billing_url', regex: /https?:\/\/[^\s"'<>]+\/(?:billing|checkout|topup|webstore)/i }
];

function tableExists(db, tableName) {
  try {
    return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(tableName));
  } catch {
    return false;
  }
}

export function kstDayStartMs(nowMs) {
  const kstDateStr = new Date(Number(nowMs) + KST_OFFSET_MS).toISOString().slice(0, 10);
  return Date.parse(`${kstDateStr}T00:00:00+09:00`);
}

export function checkAgePolicy(db, principalId) {
  if (!principalId || typeof principalId !== 'string') {
    return {
      allowed: false,
      ageTier: 'UNKNOWN',
      code: 'GROWTH_AGE_POLICY_BLOCKED',
      status: 403,
      message: 'Adult age verification is required (principal missing).'
    };
  }
  if (!tableExists(db, 'user_age_compliance')) {
    return {
      allowed: false,
      ageTier: 'UNKNOWN',
      code: 'GROWTH_AGE_POLICY_BLOCKED',
      status: 403,
      message: 'Age compliance table unavailable; failing closed.'
    };
  }
  const row = db.prepare(
    'SELECT age_tier, parental_consent_status FROM user_age_compliance WHERE principal_id=?'
  ).get(principalId);
  const ageTier = row?.age_tier || 'UNKNOWN';
  if (ageTier !== 'ADULT') {
    return {
      allowed: false,
      ageTier,
      parentalConsentStatus: row?.parental_consent_status || 'not_required',
      code: 'GROWTH_AGE_POLICY_BLOCKED',
      status: 403,
      message: `Growth promotional offer blocked for age_tier=${ageTier}; only ADULT is permitted.`
    };
  }
  return {
    allowed: true,
    ageTier: 'ADULT',
    parentalConsentStatus: row?.parental_consent_status || 'not_required',
    code: null,
    status: 200,
    message: null
  };
}

export function checkStorePolicyCopy(copyText, { channel = 'web_browser' } = {}) {
  const normalizedChannel = String(channel || 'web_browser').trim().toLowerCase();
  const text = String(copyText || '');
  if (!text || !MOBILE_COPY_CHANNELS.has(normalizedChannel)) {
    return { allowed: true, channel: normalizedChannel, violations: [] };
  }
  const violations = [];
  for (const rule of MOBILE_STEERING_PATTERNS) {
    const match = text.match(rule.regex);
    if (match) {
      violations.push({ ruleId: rule.id, matched: match[0] });
    }
  }
  return {
    allowed: violations.length === 0,
    channel: normalizedChannel,
    violations
  };
}

export function getDailyPromoSpentCoins(db, { now = Date.now } = {}) {
  if (!tableExists(db, 'billing_journal_lines')) return 0;
  const startMs = kstDayStartMs(now());
  const endMs = startMs + DAY_MS;
  const row = db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN signed_coins < 0 THEN -signed_coins ELSE 0 END), 0) AS total
    FROM billing_journal_lines
    WHERE account_code = ?
      AND created_at >= ?
      AND created_at < ?
  `).get(PROMO_CONTRA_ACCOUNT, startMs, endMs);
  return Number(row?.total || 0);
}

export function evaluateGrowthOfferGuard(db, input = {}, options = {}) {
  const now = options.now || Date.now;
  const principalId = input.principalId ?? null;
  const channel = String(input.channel || 'web_browser').trim().toLowerCase();
  const bonusBps = Number(input.bonusBps ?? 0);
  const promoCoins = Number(input.promoCoins ?? 0);
  const copyText = String(input.copyText ?? '');
  const dailyPromoCapCoins = Number.isFinite(input.dailyPromoCapCoins)
    ? input.dailyPromoCapCoins
    : (Number.isFinite(options.dailyPromoCapCoins) ? options.dailyPromoCapCoins : DEFAULT_DAILY_PROMO_CAP_COINS);

  const violations = [];

  // 1. Hard age_tier === 'ADULT' check (fails closed)
  const ageCheck = checkAgePolicy(db, principalId);
  if (!ageCheck.allowed) {
    violations.push({
      code: ageCheck.code,
      status: ageCheck.status,
      message: ageCheck.message
    });
  }

  // 2. Bonus BPS range & +25% (2500 bps) hard cap
  if (!Number.isFinite(bonusBps) || bonusBps < 0 || bonusBps > MAX_BONUS_BPS) {
    violations.push({
      code: 'GROWTH_BONUS_CAP_EXCEEDED',
      status: 422,
      message: `bonusBps=${bonusBps} exceeds hard cap [0, ${MAX_BONUS_BPS}].`
    });
  }

  // 3. Mobile IAP channel 0% bonus rule
  if (MOBILE_IAP_CHANNELS.has(channel) && bonusBps > 0) {
    violations.push({
      code: 'GROWTH_MOBILE_IAP_BONUS_FORBIDDEN',
      status: 403,
      message: `Channel '${channel}' requires 0% bonus (received bonusBps=${bonusBps}).`
    });
  }

  // 4. Daily promo coin cap against sys:contra:promo_grant
  const dailyPromoSpent = getDailyPromoSpentCoins(db, { now });
  if (!Number.isFinite(promoCoins) || promoCoins < 0) {
    violations.push({
      code: 'GROWTH_PROMO_COINS_INVALID',
      status: 422,
      message: `promoCoins must be >= 0 (received ${promoCoins}).`
    });
  } else if (promoCoins > 0 && dailyPromoSpent + promoCoins > dailyPromoCapCoins) {
    violations.push({
      code: 'GROWTH_DAILY_PROMO_CAP_EXCEEDED',
      status: 409,
      message: `Daily promo cap exceeded: spent ${dailyPromoSpent} + requested ${promoCoins} > cap ${dailyPromoCapCoins}.`
    });
  }

  // 5. Mobile store-policy copy filter
  const copyCheck = checkStorePolicyCopy(copyText, { channel });
  if (!copyCheck.allowed) {
    violations.push({
      code: 'GROWTH_STORE_POLICY_COPY_BLOCKED',
      status: 403,
      message: `Mobile store policy violation on channel '${channel}': external web payment/bonus steering detected.`,
      matches: copyCheck.violations
    });
  }

  return {
    allowed: violations.length === 0,
    violations,
    details: {
      ageTier: ageCheck.ageTier,
      channel,
      bonusBps,
      promoCoins,
      dailyPromoSpent,
      dailyPromoCapCoins,
      remainingPromoCoins: Math.max(0, dailyPromoCapCoins - dailyPromoSpent)
    }
  };
}

export function assertGrowthOfferGuard(db, input = {}, options = {}) {
  const result = evaluateGrowthOfferGuard(db, input, options);
  if (!result.allowed) {
    const primary = result.violations[0];
    throw new ApiError(primary.status || 403, primary.code, primary.message, {
      violations: result.violations,
      details: result.details
    });
  }
  return result;
}
