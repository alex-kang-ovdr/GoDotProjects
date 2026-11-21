// Server-authoritative PlayCoin catalog & up-to-25% channel bonus engine.
// Clients can NEVER dictate bonus rates or override mobile store zero-bonus rules.

import { ApiError, safeString } from '../security.mjs';
import { BILLING_UNIT, MAX_BONUS_BPS } from './schema.mjs';
import { runAtomic } from './idempotency.mjs';

export const BONUS_ELIGIBLE_CHANNELS = new Set([
  'web_browser',
  'pc_desktop',
  'gift_card_direct',
  'gift_card_retail'
]);

export const ZERO_BONUS_CHANNELS = new Set([
  'aos_google_play',
  'ios_app_store'
]);

export const ALL_CHANNELS = new Set([
  ...BONUS_ELIGIBLE_CHANNELS,
  ...ZERO_BONUS_CHANNELS
]);

// Official 8 PlayCoin package tiers (KRW VAT-inclusive, USD gross).
export const DEFAULT_SKUS = [
  // KRW tiers (1 PlayCoin ≈ ₩14)
  { skuId: 'playhub.coin.t1', currency: 'KRW', titleL10nKey: 'billing.sku.t1', amountMinor: 1500, baseCoins: 100, sortOrder: 10 },
  { skuId: 'playhub.coin.t2', currency: 'KRW', titleL10nKey: 'billing.sku.t2', amountMinor: 4500, baseCoins: 300, sortOrder: 20 },
  { skuId: 'playhub.coin.t3', currency: 'KRW', titleL10nKey: 'billing.sku.t3', amountMinor: 7000, baseCoins: 500, sortOrder: 30 },
  { skuId: 'playhub.coin.t4', currency: 'KRW', titleL10nKey: 'billing.sku.t4', amountMinor: 14000, baseCoins: 1000, sortOrder: 40 },
  { skuId: 'playhub.coin.t5', currency: 'KRW', titleL10nKey: 'billing.sku.t5', amountMinor: 28000, baseCoins: 2000, sortOrder: 50 },
  { skuId: 'playhub.coin.t6', currency: 'KRW', titleL10nKey: 'billing.sku.t6', amountMinor: 70000, baseCoins: 5000, sortOrder: 60 },
  { skuId: 'playhub.coin.t7', currency: 'KRW', titleL10nKey: 'billing.sku.t7', amountMinor: 140000, baseCoins: 10000, sortOrder: 70 },
  { skuId: 'playhub.coin.t8', currency: 'KRW', titleL10nKey: 'billing.sku.t8', amountMinor: 280000, baseCoins: 20000, sortOrder: 80 },
  // USD tiers (amountMinor in cents, 1 PlayCoin ≈ USD 0.01)
  { skuId: 'playhub.coin.t1', currency: 'USD', titleL10nKey: 'billing.sku.t1', amountMinor: 99, baseCoins: 100, sortOrder: 10 },
  { skuId: 'playhub.coin.t2', currency: 'USD', titleL10nKey: 'billing.sku.t2', amountMinor: 299, baseCoins: 300, sortOrder: 20 },
  { skuId: 'playhub.coin.t3', currency: 'USD', titleL10nKey: 'billing.sku.t3', amountMinor: 499, baseCoins: 500, sortOrder: 30 },
  { skuId: 'playhub.coin.t4', currency: 'USD', titleL10nKey: 'billing.sku.t4', amountMinor: 999, baseCoins: 1000, sortOrder: 40 },
  { skuId: 'playhub.coin.t5', currency: 'USD', titleL10nKey: 'billing.sku.t5', amountMinor: 1999, baseCoins: 2000, sortOrder: 50 },
  { skuId: 'playhub.coin.t6', currency: 'USD', titleL10nKey: 'billing.sku.t6', amountMinor: 4999, baseCoins: 5000, sortOrder: 60 },
  { skuId: 'playhub.coin.t7', currency: 'USD', titleL10nKey: 'billing.sku.t7', amountMinor: 9999, baseCoins: 10000, sortOrder: 70 },
  { skuId: 'playhub.coin.t8', currency: 'USD', titleL10nKey: 'billing.sku.t8', amountMinor: 19999, baseCoins: 20000, sortOrder: 80 }
];

// Official default bonus rules (up to +25% = 2500 bps on web, PC, and gift cards).
export const DEFAULT_BONUS_RULES = [
  // Web Browser (+10% t1, +15% t2, +20% t3, +25% t4..t8)
  { id: 'rule.web.t1', channel: 'web_browser', skuId: 'playhub.coin.t1', currency: null, minAmountMinor: 0, bonusBps: 1000 },
  { id: 'rule.web.t2', channel: 'web_browser', skuId: 'playhub.coin.t2', currency: null, minAmountMinor: 0, bonusBps: 1500 },
  { id: 'rule.web.t3', channel: 'web_browser', skuId: 'playhub.coin.t3', currency: null, minAmountMinor: 0, bonusBps: 2000 },
  { id: 'rule.web.default', channel: 'web_browser', skuId: null, currency: null, minAmountMinor: 0, bonusBps: 2500 },

  // PC Desktop / PlayForge (identical up-to-25% schedule)
  { id: 'rule.pc.t1', channel: 'pc_desktop', skuId: 'playhub.coin.t1', currency: null, minAmountMinor: 0, bonusBps: 1000 },
  { id: 'rule.pc.t2', channel: 'pc_desktop', skuId: 'playhub.coin.t2', currency: null, minAmountMinor: 0, bonusBps: 1500 },
  { id: 'rule.pc.t3', channel: 'pc_desktop', skuId: 'playhub.coin.t3', currency: null, minAmountMinor: 0, bonusBps: 2000 },
  { id: 'rule.pc.default', channel: 'pc_desktop', skuId: null, currency: null, minAmountMinor: 0, bonusBps: 2500 },

  // Direct Digital Gift Cards (+20% under ₩30k/$25, +25% at or above)
  { id: 'rule.gc_direct.krw.low', channel: 'gift_card_direct', skuId: null, currency: 'KRW', minAmountMinor: 0, bonusBps: 2000 },
  { id: 'rule.gc_direct.krw.high', channel: 'gift_card_direct', skuId: null, currency: 'KRW', minAmountMinor: 30000, bonusBps: 2500 },
  { id: 'rule.gc_direct.usd.low', channel: 'gift_card_direct', skuId: null, currency: 'USD', minAmountMinor: 0, bonusBps: 2000 },
  { id: 'rule.gc_direct.usd.high', channel: 'gift_card_direct', skuId: null, currency: 'USD', minAmountMinor: 2500, bonusBps: 2500 },

  // Retail Partner Gift Cards (+15% low, +20% high — margin safe up to 10%+ partner fee)
  { id: 'rule.gc_retail.krw.low', channel: 'gift_card_retail', skuId: null, currency: 'KRW', minAmountMinor: 0, bonusBps: 1500 },
  { id: 'rule.gc_retail.krw.high', channel: 'gift_card_retail', skuId: null, currency: 'KRW', minAmountMinor: 30000, bonusBps: 2000 },
  { id: 'rule.gc_retail.usd.low', channel: 'gift_card_retail', skuId: null, currency: 'USD', minAmountMinor: 0, bonusBps: 1500 },
  { id: 'rule.gc_retail.usd.high', channel: 'gift_card_retail', skuId: null, currency: 'USD', minAmountMinor: 2500, bonusBps: 2000 },

  // Mobile IAP: strictly 0%
  { id: 'rule.aos.default', channel: 'aos_google_play', skuId: null, currency: null, minAmountMinor: 0, bonusBps: 0 },
  { id: 'rule.ios.default', channel: 'ios_app_store', skuId: null, currency: null, minAmountMinor: 0, bonusBps: 0 }
];

export function calculateBonusCoins(baseCoins, bonusBps) {
  if (!Number.isSafeInteger(baseCoins) || baseCoins <= 0) {
    throw new ApiError(422, 'BASE_COINS_INVALID');
  }
  if (!Number.isSafeInteger(bonusBps) || bonusBps < 0 || bonusBps > MAX_BONUS_BPS) {
    throw new ApiError(422, 'BONUS_CAP_EXCEEDED', `bonusBps must be between 0 and ${MAX_BONUS_BPS}`);
  }
  return Math.round((baseCoins * bonusBps) / 10000);
}

// Server-authoritative channel attribution: provider always wins over client hints.
export function resolveAuthoritativeChannel({ provider, clientChannelHint = 'web_browser' }) {
  if (!safeString(provider, 64)) throw new ApiError(400, 'PROVIDER_REQUIRED');
  const p = provider.toLowerCase();
  if (p === 'google_play' || p === 'google_iap') return 'aos_google_play';
  if (p === 'apple_iap' || p === 'apple_store') return 'ios_app_store';
  if (p === 'giftcard_direct') return 'gift_card_direct';
  if (p === 'giftcard_retail') return 'gift_card_retail';
  if (['xsolla', 'toss', 'portone', 'stripe', 'stripe_gpay', 'adyen', 'mock'].includes(p)) {
    return clientChannelHint === 'pc_desktop' ? 'pc_desktop' : 'web_browser';
  }
  throw new ApiError(400, 'PROVIDER_UNSUPPORTED');
}

export function seedDefaultCatalogAndPolicies(db, now = Date.now) {
  const stamp = now();
  runAtomic(db, () => {
    const insertSku = db.prepare(`
      INSERT OR IGNORE INTO billing_catalog_skus(sku_id, currency, title_l10n_key, amount_minor, base_coins, sort_order, active, updated_at)
      VALUES(?,?,?,?,?,?,1,?)
    `);
    for (const s of DEFAULT_SKUS) {
      insertSku.run(s.skuId, s.currency, s.titleL10nKey, s.amountMinor, s.baseCoins, s.sortOrder, stamp);
    }

    const insertRule = db.prepare(`
      INSERT OR IGNORE INTO billing_channel_bonus_rules(id, channel, sku_id, currency, min_amount_minor, bonus_bps, active, starts_at, ends_at, updated_at)
      VALUES(?,?,?,?,?,?,1,NULL,NULL,?)
    `);
    for (const r of DEFAULT_BONUS_RULES) {
      insertRule.run(r.id, r.channel, r.skuId, r.currency, r.minAmountMinor, r.bonusBps, stamp);
    }
  });
}

export function upsertBonusRule(db, rule, now = Date.now) {
  if (!rule || !ALL_CHANNELS.has(rule.channel)) throw new ApiError(422, 'CHANNEL_INVALID');
  if (!safeString(rule.id, 96)) throw new ApiError(422, 'RULE_ID_INVALID');
  if (!Number.isSafeInteger(rule.bonusBps) || rule.bonusBps < 0 || rule.bonusBps > MAX_BONUS_BPS) {
    throw new ApiError(422, 'BONUS_CAP_EXCEEDED', `bonusBps cannot exceed ${MAX_BONUS_BPS} (25%)`);
  }
  if (ZERO_BONUS_CHANNELS.has(rule.channel) && rule.bonusBps !== 0) {
    throw new ApiError(422, 'CHANNEL_BONUS_FORBIDDEN', `${rule.channel} must remain at 0 bps`);
  }
  const minAmountMinor = rule.minAmountMinor ?? 0;
  if (!Number.isSafeInteger(minAmountMinor) || minAmountMinor < 0) {
    throw new ApiError(422, 'MIN_AMOUNT_INVALID');
  }
  const active = rule.active === false || rule.active === 0 ? 0 : 1;
  const stamp = now();
  db.prepare(`
    INSERT INTO billing_channel_bonus_rules(id, channel, sku_id, currency, min_amount_minor, bonus_bps, active, starts_at, ends_at, updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      channel=excluded.channel,
      sku_id=excluded.sku_id,
      currency=excluded.currency,
      min_amount_minor=excluded.min_amount_minor,
      bonus_bps=excluded.bonus_bps,
      active=excluded.active,
      starts_at=excluded.starts_at,
      ends_at=excluded.ends_at,
      updated_at=excluded.updated_at
  `).run(
    rule.id,
    rule.channel,
    rule.skuId || null,
    rule.currency ? String(rule.currency).toUpperCase() : null,
    minAmountMinor,
    rule.bonusBps,
    active,
    rule.startsAt ?? null,
    rule.endsAt ?? null,
    stamp
  );
  return db.prepare('SELECT * FROM billing_channel_bonus_rules WHERE id=?').get(rule.id);
}

export function resolveBonusBps(db, { channel, skuId = null, currency = null, amountMinor = 0, now = Date.now }) {
  if (!ALL_CHANNELS.has(channel)) throw new ApiError(400, 'CHANNEL_INVALID');
  // Defense-in-depth: mobile app store channels NEVER receive channel bonus.
  if (ZERO_BONUS_CHANNELS.has(channel)) return 0;

  const stamp = now();
  const curr = currency ? String(currency).toUpperCase() : null;
  const rows = db.prepare(`
    SELECT id, sku_id, currency, min_amount_minor, bonus_bps
    FROM billing_channel_bonus_rules
    WHERE channel=?
      AND active=1
      AND (sku_id IS NULL OR sku_id=?)
      AND (currency IS NULL OR currency=?)
      AND min_amount_minor <= ?
      AND (starts_at IS NULL OR starts_at <= ?)
      AND (ends_at IS NULL OR ends_at > ?)
    ORDER BY
      (CASE WHEN sku_id IS NOT NULL THEN 4 ELSE 0 END) +
      (CASE WHEN currency IS NOT NULL THEN 2 ELSE 0 END) DESC,
      min_amount_minor DESC,
      id ASC
    LIMIT 1
  `).all(channel, skuId, curr, amountMinor, stamp, stamp);

  if (!rows.length) return 0;
  const bps = rows[0].bonus_bps;
  if (!Number.isSafeInteger(bps) || bps < 0 || bps > MAX_BONUS_BPS) {
    throw new ApiError(500, 'BONUS_POLICY_CORRUPT');
  }
  return bps;
}

export function quoteSkuOffer(db, { skuId, currency, channel, now = Date.now }) {
  const curr = String(currency || 'KRW').toUpperCase();
  const sku = db.prepare(
    'SELECT * FROM billing_catalog_skus WHERE sku_id=? AND currency=? AND active=1'
  ).get(skuId, curr);
  if (!sku) throw new ApiError(404, 'SKU_NOT_FOUND');

  const bonusBps = resolveBonusBps(db, {
    channel,
    skuId: sku.sku_id,
    currency: sku.currency,
    amountMinor: sku.amount_minor,
    now
  });
  const bonusCoins = calculateBonusCoins(sku.base_coins, bonusBps);

  return {
    unit: BILLING_UNIT,
    skuId: sku.sku_id,
    titleL10nKey: sku.title_l10n_key,
    currency: sku.currency,
    channel,
    amountMinor: sku.amount_minor,
    baseCoins: sku.base_coins,
    bonusBps,
    bonusPercent: bonusBps / 100,
    bonusCoins,
    totalCoins: sku.base_coins + bonusCoins,
    mobileBaseCoins: sku.base_coins
  };
}

export function listCatalogOffers(db, { currency = 'KRW', channel = 'web_browser', now = Date.now } = {}) {
  if (!ALL_CHANNELS.has(channel)) throw new ApiError(400, 'CHANNEL_INVALID');
  const curr = String(currency).toUpperCase();
  const rows = db.prepare(
    'SELECT sku_id FROM billing_catalog_skus WHERE currency=? AND active=1 ORDER BY sort_order ASC, sku_id ASC'
  ).all(curr);

  return {
    unit: BILLING_UNIT,
    currency: curr,
    channel,
    maxBonusBps: ZERO_BONUS_CHANNELS.has(channel) ? 0 : MAX_BONUS_BPS,
    items: rows.map(row => quoteSkuOffer(db, { skuId: row.sku_id, currency: curr, channel, now }))
  };
}
