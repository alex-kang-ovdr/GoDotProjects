import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../server/db.mjs';
import { createBackup } from '../tools/backup.mjs';
import { restoreData } from '../tools/restore-data.mjs';
import { ensureBillingSchema, BILLING_UNIT, MAX_BONUS_BPS } from '../server/billing/schema.mjs';
import { withIdempotency } from '../server/billing/idempotency.mjs';
import {
  seedDefaultCatalogAndPolicies,
  listCatalogOffers,
  quoteSkuOffer,
  resolveAuthoritativeChannel,
  upsertBonusRule,
  calculateBonusCoins
} from '../server/billing/policy.mjs';
import {
  getWallet,
  creditPurchase,
  activateGiftCardLiability,
  creditPromo,
  spendCoins,
  reserveHold,
  settleHold,
  releaseHold,
  clawbackOrder,
  postJournalEntry,
  verifyLedgerIntegrity,
  SYS_ACCOUNTS
} from '../server/billing/ledger.mjs';
import { assertCanPurchase, setSpendingLimit } from '../server/billing/compliance.mjs';
import {
  createPaymentRouter,
  DEFAULT_STAGE1_ROUTES,
  STAGE2_HYBRID_ROUTES,
  STAGE3_MULTI_PSP_ROUTES
} from '../server/billing/router.mjs';

const DAY_MS = 86400000;

function createFixture(t, { clockStart = Date.UTC(2026, 10, 21, 3, 0, 0) } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-billing-m0-'));
  const dataDir = path.join(root, 'data');
  let clock = clockStart;
  const now = () => clock;
  const advance = ms => { clock += ms; };

  const db = openDatabase(dataDir);
  ensureBillingSchema(db);
  seedDefaultCatalogAndPolicies(db, now);

  // Seed sample users: adult (established), adult_new (1 day old), guest, creator
  const insertUser = db.prepare('INSERT INTO users(id, kind, display_name, created_at) VALUES(?,?,?,?)');
  insertUser.run('user-adult', 'registered', 'Adult Player', clock - 30 * DAY_MS);
  insertUser.run('user-new', 'registered', 'New Player', clock - 1 * DAY_MS);
  insertUser.run('user-minor', 'registered', 'Teen Player', clock - 30 * DAY_MS);
  insertUser.run('user-child', 'registered', 'Child Player', clock - 30 * DAY_MS);
  insertUser.run('user-guest', 'guest', null, clock - 1 * DAY_MS);
  insertUser.run('user-creator', 'registered', 'Game Creator', clock - 60 * DAY_MS);

  const handles = [db];
  t.after(() => {
    for (const h of handles) {
      try { h.close(); } catch {}
    }
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  });

  function insertPaidOrder({
    id,
    principalId = 'user-adult',
    channel = 'web_browser',
    provider = 'xsolla',
    skuId = 'playhub.coin.t4',
    currency = 'KRW',
    amountMinor = 14000,
    baseCoins = 1000,
    bonusCoins = 250,
    bonusBps = 2500,
    paidAt = now()
  }) {
    db.prepare(`
      INSERT INTO billing_orders(
        id, principal_id, channel, provider, sku_id, currency, amount_minor,
        base_coins, bonus_coins, bonus_bps, state, provider_payment_id,
        idempotency_key, first_spent_at, paid_at, created_at, updated_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,'PAID',?,?,NULL,?,?,?)
    `).run(
      id, principalId, channel, provider, skuId, currency, amountMinor,
      baseCoins, bonusCoins, bonusBps, `pay-${id}`, `idem-order-${id}`,
      paidAt, paidAt, paidAt
    );
    return creditPurchase(db, {
      principalId,
      orderId: id,
      provider,
      baseCoins,
      bonusCoins,
      idempotencyKey: `credit-${id}`,
      isGiftCardRedeem: channel === 'gift_card_direct' || channel === 'gift_card_retail',
      now
    });
  }

  return { root, dataDir, db, handles, now, advance, insertPaidOrder };
}

test('catalog & bonus policy: web/PC up to +25%, mobile IAP strictly 0%, 25% hard cap enforced', t => {
  const { db, now } = createFixture(t);

  const webKrw = listCatalogOffers(db, { currency: 'KRW', channel: 'web_browser', now });
  assert.equal(webKrw.unit, BILLING_UNIT);
  assert.equal(webKrw.maxBonusBps, MAX_BONUS_BPS);
  assert.equal(webKrw.items.length, 8);

  const t1 = webKrw.items.find(i => i.skuId === 'playhub.coin.t1');
  const t4 = webKrw.items.find(i => i.skuId === 'playhub.coin.t4');
  const t8 = webKrw.items.find(i => i.skuId === 'playhub.coin.t8');
  assert.deepEqual([t1.baseCoins, t1.bonusCoins, t1.totalCoins, t1.bonusBps], [100, 10, 110, 1000]);
  assert.deepEqual([t4.baseCoins, t4.bonusCoins, t4.totalCoins, t4.bonusBps], [1000, 250, 1250, 2500]);
  assert.deepEqual([t8.baseCoins, t8.bonusCoins, t8.totalCoins, t8.bonusBps], [20000, 5000, 25000, 2500]);

  // PC desktop matches web_browser bonus
  const pcOffer = quoteSkuOffer(db, { skuId: 'playhub.coin.t4', currency: 'USD', channel: 'pc_desktop', now });
  assert.equal(pcOffer.totalCoins, 1250);
  assert.equal(pcOffer.bonusBps, 2500);

  // Mobile IAP is ALWAYS 0% bonus, and server channel attribution ignores spoofed hints
  assert.equal(resolveAuthoritativeChannel({ provider: 'google_play', clientChannelHint: 'web_browser' }), 'aos_google_play');
  assert.equal(resolveAuthoritativeChannel({ provider: 'apple_iap', clientChannelHint: 'pc_desktop' }), 'ios_app_store');
  assert.equal(resolveAuthoritativeChannel({ provider: 'xsolla', clientChannelHint: 'pc_desktop' }), 'pc_desktop');
  assert.equal(resolveAuthoritativeChannel({ provider: 'xsolla', clientChannelHint: 'gift_card_direct' }), 'web_browser');

  const aosOffer = quoteSkuOffer(db, { skuId: 'playhub.coin.t4', currency: 'KRW', channel: 'aos_google_play', now });
  assert.equal(aosOffer.bonusBps, 0);
  assert.equal(aosOffer.bonusCoins, 0);
  assert.equal(aosOffer.totalCoins, 1000);

  // 25% hard cap enforced both in code AND SQL CHECK constraint
  assert.throws(() => calculateBonusCoins(1000, 2501), e => e.code === 'BONUS_CAP_EXCEEDED');
  assert.throws(
    () => upsertBonusRule(db, { id: 'bad.cap', channel: 'web_browser', bonusBps: 2501 }, now),
    e => e.code === 'BONUS_CAP_EXCEEDED'
  );
  assert.throws(
    () => upsertBonusRule(db, { id: 'bad.aos', channel: 'aos_google_play', bonusBps: 500 }, now),
    e => e.code === 'CHANNEL_BONUS_FORBIDDEN'
  );
  assert.throws(
    () => db.prepare(
      "INSERT INTO billing_channel_bonus_rules(id, channel, min_amount_minor, bonus_bps, active, updated_at) VALUES('sql-bad','web_browser',0,3000,1,?)"
    ).run(now()),
    /CHECK constraint failed/
  );
});

test('Orpheus idempotency: replays safely, rejects payload conflicts, rolls back errors without poisoning', t => {
  const { db, now } = createFixture(t);
  let calls = 0;

  const first = withIdempotency({
    db,
    scope: 'billing.order.create',
    key: 'idem-001',
    principalId: 'user-adult',
    requestPayload: { skuId: 'playhub.coin.t4', currency: 'KRW' },
    now,
    fn: () => {
      calls += 1;
      return { status: 201, body: { orderId: 'ord-1', totalCoins: 1250 } };
    }
  });
  assert.equal(first.replayed, false);
  assert.equal(first.status, 201);
  assert.equal(calls, 1);

  // Exact replay with different key order in JSON object still matches canonical hash
  const second = withIdempotency({
    db,
    scope: 'billing.order.create',
    key: 'idem-001',
    principalId: 'user-adult',
    requestPayload: { currency: 'KRW', skuId: 'playhub.coin.t4' },
    now,
    fn: () => {
      calls += 1;
      return { status: 201, body: { orderId: 'ord-2' } };
    }
  });
  assert.equal(second.replayed, true);
  assert.deepEqual(second.body, { orderId: 'ord-1', totalCoins: 1250 });
  assert.equal(calls, 1);

  // Conflicting payload on same key throws 409
  assert.throws(
    () => withIdempotency({
      db,
      scope: 'billing.order.create',
      key: 'idem-001',
      principalId: 'user-adult',
      requestPayload: { skuId: 'playhub.coin.t5', currency: 'KRW' },
      now,
      fn: () => ({ status: 201, body: {} })
    }),
    e => e.status === 409 && e.code === 'IDEMPOTENCY_KEY_CONFLICT'
  );

  // Failed execution rolls back cleanly so retry with same key succeeds
  assert.throws(
    () => withIdempotency({
      db,
      scope: 'billing.order.create',
      key: 'idem-transient',
      principalId: 'user-adult',
      requestPayload: { skuId: 'playhub.coin.t1' },
      now,
      fn: () => { throw new Error('transient failure'); }
    }),
    /transient failure/
  );
  const recovered = withIdempotency({
    db,
    scope: 'billing.order.create',
    key: 'idem-transient',
    principalId: 'user-adult',
    requestPayload: { skuId: 'playhub.coin.t1' },
    now,
    fn: () => ({ status: 201, body: { recovered: true } })
  });
  assert.equal(recovered.replayed, false);
  assert.equal(recovered.body.recovered, true);
});

test('Double-entry Zero-Sum ledger, spend waterfall, expiry, and 1P platform revenue recognition', t => {
  const { db, now, advance, insertPaidOrder } = createFixture(t);

  // Reject imbalanced journal entries directly
  assert.throws(
    () => postJournalEntry(db, {
      eventType: 'admin_adjust',
      idempotencyKey: 'bad-journal',
      lines: [
        { accountCode: SYS_ACCOUNTS.ADMIN_ADJUST, signedCoins: -100 },
        { accountCode: 'user:user-adult:promo', signedCoins: 99 }
      ],
      now
    }),
    e => e.code === 'JOURNAL_NOT_ZERO_SUM'
  );

  // 1. Gift card liability activation -> redeem (+25% bonus)
  activateGiftCardLiability(db, {
    batchId: 'batch-1',
    partnerName: 'direct',
    totalBaseCoins: 1000,
    idempotencyKey: 'gc-act-1',
    now
  });
  insertPaidOrder({
    id: 'ord-gc-1',
    channel: 'gift_card_direct',
    provider: 'giftcard_direct',
    amountMinor: 14000,
    baseCoins: 1000,
    bonusCoins: 250,
    bonusBps: 2500
  });

  // 2. Grant two promo lots: one expires in 1 day, one in 10 days
  creditPromo(db, { principalId: 'user-adult', coins: 50, expiresAt: now() + 1 * DAY_MS, reason: 'short', idempotencyKey: 'promo-1', now });
  creditPromo(db, { principalId: 'user-adult', coins: 80, expiresAt: now() + 10 * DAY_MS, reason: 'long', idempotencyKey: 'promo-2', now });

  // Advance 2 days -> short promo (50) should auto-expire on spend
  advance(2 * DAY_MS);

  // 3. Spend 400 PlayCoin on 1P usage: waterfall takes 80 promo -> 250 bonus -> 70 paid, 100% platform revenue
  const spent = spendCoins(db, {
    principalId: 'user-adult',
    amountCoins: 400,
    sinkType: 'usage_ai_units',
    sinkRefId: 'ai-batch-01',
    idempotencyKey: 'spend-1',
    now
  });
  assert.deepEqual(spent.deductedByBucket, { promo: 80, bonus: 250, paid: 70 });
  assert.equal(spent.platformCoins, 400);
  assert.equal(spent.wallet.promo, 0);
  assert.equal(spent.wallet.bonus, 0);
  assert.equal(spent.wallet.paid, 930);
  assert.equal('earned' in spent.wallet, false, 'Track A 3-bucket wallet must not hold creator earned proceeds');

  // 4. Infra server spend with allowBonusForInfra=false must skip bonus bucket
  insertPaidOrder({ id: 'ord-web-2', baseCoins: 200, bonusCoins: 50, bonusBps: 2500 });
  const infraSpend = spendCoins(db, {
    principalId: 'user-adult',
    amountCoins: 100,
    sinkType: 'infra_server',
    sinkRefId: 'srv-1',
    allowBonusForInfra: false,
    idempotencyKey: 'spend-infra-1',
    now
  });
  assert.deepEqual(infraSpend.deductedByBucket, { promo: 0, bonus: 0, paid: 100 });
  assert.equal(infraSpend.wallet.bonus, 50);

  const audit = verifyLedgerIntegrity(db);
  assert.equal(audit.ok, true, JSON.stringify(audit));
  assert.equal(audit.globalSum, 0);
});

test('Anti-Bonus-Stripping: 7-day withdrawal succeeds unused, blocked once even 1 bonus coin is spent', t => {
  const { db, now, advance, insertPaidOrder } = createFixture(t);

  // Order A: unused within 7 days -> full withdrawal reclaims paid + bonus
  insertPaidOrder({ id: 'ord-unused', baseCoins: 1000, bonusCoins: 250, bonusBps: 2500 });
  advance(3 * DAY_MS);
  const wd = clawbackOrder(db, {
    orderId: 'ord-unused',
    kind: 'withdrawal_7d',
    reason: 'customer_7d_withdrawal',
    actorId: 'user-adult',
    idempotencyKey: 'wd-unused',
    now
  });
  assert.equal(wd.refund.clawback_paid_coins, 1000);
  assert.equal(wd.refund.clawback_bonus_coins, 250);
  assert.equal(wd.wallet.paid, 0);
  assert.equal(wd.wallet.bonus, 0);
  assert.equal(db.prepare('SELECT state FROM billing_orders WHERE id=?').get('ord-unused').state, 'REFUNDED');

  // Order B: user spends ONLY 1 bonus PlayCoin -> first_spent_at stamped -> 7d withdrawal MUST fail
  insertPaidOrder({ id: 'ord-bonus-stripped', baseCoins: 1000, bonusCoins: 250, bonusBps: 2500 });
  const tinySpend = spendCoins(db, {
    principalId: 'user-adult',
    amountCoins: 1,
    sinkType: 'avatar_item',
    sinkRefId: 'sticker-1',
    idempotencyKey: 'spend-1-bonus',
    now
  });
  assert.deepEqual(tinySpend.deductedByBucket, { promo: 0, bonus: 1, paid: 0 });
  const orderRow = db.prepare('SELECT first_spent_at FROM billing_orders WHERE id=?').get('ord-bonus-stripped');
  assert.ok(orderRow.first_spent_at !== null, 'first_spent_at must be stamped even if only bonus was spent');

  assert.throws(
    () => clawbackOrder(db, {
      orderId: 'ord-bonus-stripped',
      kind: 'withdrawal_7d',
      reason: 'attempt_bonus_stripping',
      actorId: 'user-adult',
      idempotencyKey: 'wd-stripped',
      now
    }),
    e => e.status === 409 && e.code === 'WITHDRAWAL_ORDER_ALREADY_SPENT'
  );

  // Order C: untouched but older than 7 days -> 7d withdrawal rejected
  insertPaidOrder({ id: 'ord-old', baseCoins: 500, bonusCoins: 100, bonusBps: 2000 });
  advance(8 * DAY_MS);
  assert.throws(
    () => clawbackOrder(db, {
      orderId: 'ord-old',
      kind: 'withdrawal_7d',
      reason: 'too_late',
      actorId: 'user-adult',
      idempotencyKey: 'wd-old',
      now
    }),
    e => e.status === 422 && e.code === 'WITHDRAWAL_WINDOW_EXPIRED'
  );

  const audit = verifyLedgerIntegrity(db);
  assert.equal(audit.ok, true, JSON.stringify(audit));
});

test('Chargeback after spending books debt, freezes account, blocks further purchases/spends, preserves Zero-Sum', t => {
  const { db, now, insertPaidOrder } = createFixture(t);
  insertPaidOrder({ id: 'ord-cb', baseCoins: 1000, bonusCoins: 250, bonusBps: 2500 });

  // User spends 1,000 PlayCoin before filing fraudulent chargeback (250 paid left)
  spendCoins(db, {
    principalId: 'user-adult',
    amountCoins: 1000,
    sinkType: 'ingame_item',
    sinkRefId: 'loot-1',
    idempotencyKey: 'spend-before-cb',
    now
  });

  const cb = clawbackOrder(db, {
    orderId: 'ord-cb',
    kind: 'chargeback',
    reason: 'xsolla_dispute_fraud',
    actorId: 'webhook:xsolla',
    idempotencyKey: 'cb-ord-cb',
    now
  });
  assert.equal(cb.refund.clawback_paid_coins, 250);
  assert.equal(cb.refund.clawback_bonus_coins, 0);
  assert.equal(cb.refund.debt_added_coins, 1000);
  assert.equal(cb.wallet.paid, 0);
  assert.equal(cb.wallet.debt, 1000);
  assert.equal(cb.wallet.frozen, true);
  assert.equal(cb.wallet.frozenReason, 'CHARGEBACK_DISPUTE');

  // Frozen account cannot purchase or spend
  assert.throws(
    () => assertCanPurchase(db, { principalId: 'user-adult', amountMinor: 1500, currency: 'KRW', now }),
    e => e.status === 403 && e.code === 'BILLING_ACCOUNT_FROZEN'
  );
  assert.throws(
    () => spendCoins(db, { principalId: 'user-adult', amountCoins: 1, sinkType: 'ingame_item', sinkRefId: 'x', idempotencyKey: 'after-cb', now }),
    e => e.status === 403 && e.code === 'BILLING_ACCOUNT_FROZEN'
  );

  const audit = verifyLedgerIntegrity(db);
  assert.equal(audit.ok, true, JSON.stringify(audit));
});

test('Uber Hold/Capture & two-connection concurrency: cannot double-reserve the last PlayCoin', t => {
  const { db, dataDir, handles, now, insertPaidOrder } = createFixture(t);
  insertPaidOrder({ id: 'ord-hold', baseCoins: 100, bonusCoins: 0, bonusBps: 0 });

  const other = new DatabaseSync(path.join(dataDir, 'platform.sqlite'));
  other.exec('PRAGMA busy_timeout=5000');
  handles.unshift(other);

  // Two connections race to reserve 70 PlayCoin each out of 100 available
  const results = [];
  for (const [conn, idx] of [[db, 1], [other, 2]]) {
    try {
      const r = reserveHold(conn, {
        principalId: 'user-adult',
        amountCoins: 70,
        sinkType: 'infra_server',
        sinkRefId: `inst-${idx}`,
        idempotencyKey: `hold-race-${idx}`,
        now
      });
      results.push({ ok: true, holdId: r.hold.id });
    } catch (e) {
      results.push({ ok: false, code: e.code });
    }
  }
  assert.equal(results.filter(r => r.ok).length, 1);
  assert.equal(results.filter(r => !r.ok && r.code === 'INSUFFICIENT_PLAYCOIN').length, 1);

  const winningHoldId = results.find(r => r.ok).holdId;
  assert.equal(getWallet(db, 'user-adult', now).reserved, 70);
  assert.equal(getWallet(db, 'user-adult', now).available, 30);

  // Settle only 42 of 70 reserved -> 28 released automatically
  const settled = settleHold(db, { holdId: winningHoldId, actualCoins: 42, idempotencyKey: 'settle-1', now });
  assert.equal(settled.spentCoins, 42);
  assert.equal(settled.releasedCoins, 28);
  assert.equal(settled.wallet.reserved, 0);
  assert.equal(settled.wallet.paid, 58);
  assert.equal(settled.wallet.available, 58);

  // Reserve and release
  const h2 = reserveHold(db, { principalId: 'user-adult', amountCoins: 50, sinkType: 'infra_server', sinkRefId: 'inst-rel', idempotencyKey: 'hold-rel', now });
  const rel = releaseHold(db, { holdId: h2.hold.id, now });
  assert.equal(rel.wallet.reserved, 0);
  assert.equal(rel.wallet.available, 58);

  const audit = verifyLedgerIntegrity(db);
  assert.equal(audit.ok, true, JSON.stringify(audit));
});

test('Compliance guard: blocks guests, enforces child guardian consent and teen/new-adult caps', t => {
  const { db, now, insertPaidOrder } = createFixture(t);

  // Guest blocked
  assert.throws(
    () => assertCanPurchase(db, { principalId: 'user-guest', amountMinor: 1500, currency: 'KRW', now }),
    e => e.status === 403 && e.code === 'REGISTERED_ACCOUNT_REQUIRED'
  );

  // Child blocked until guardian approved
  setSpendingLimit(db, {
    principalId: 'user-child',
    ageTier: 'CHILD_PROTECTED',
    monthlyCapMinor: 70000,
    dailyCapMinor: 70000,
    guardianApproved: false,
    now
  });
  assert.throws(
    () => assertCanPurchase(db, { principalId: 'user-child', amountMinor: 1500, currency: 'KRW', now }),
    e => e.status === 403 && e.code === 'GUARDIAN_CONSENT_REQUIRED'
  );

  // Teen monthly cap ₩70,000
  setSpendingLimit(db, {
    principalId: 'user-minor',
    ageTier: 'TEEN_MINOR',
    monthlyCapMinor: 70000,
    dailyCapMinor: 70000,
    guardianApproved: true,
    now
  });
  insertPaidOrder({ id: 'ord-teen-1', principalId: 'user-minor', amountMinor: 56000, baseCoins: 4000, bonusCoins: 1000 });
  assert.equal(assertCanPurchase(db, { principalId: 'user-minor', amountMinor: 14000, currency: 'KRW', now }).allowed, true);
  assert.throws(
    () => assertCanPurchase(db, { principalId: 'user-minor', amountMinor: 14001, currency: 'KRW', now }),
    e => e.status === 422 && e.code === 'MONTHLY_SPENDING_LIMIT_EXCEEDED'
  );

  // New adult (<7d) daily cap ₩150,000
  assert.throws(
    () => assertCanPurchase(db, { principalId: 'user-new', amountMinor: 280000, currency: 'KRW', now }),
    e => e.status === 422 && e.code === 'DAILY_SPENDING_LIMIT_EXCEEDED'
  );
});

test('Payment router: Stage 1 Xsolla, Stage 2 KRW Toss + circuit-breaker failover, Stage 3 Google Pay Stripe', t => {
  let clock = 1_000_000;
  const now = () => clock;

  // Stage 1: Xsolla handles all web/PC + Google Pay, Google Play handles AOS
  const r1 = createPaymentRouter({ enabledProviders: ['xsolla', 'google_play'], routes: DEFAULT_STAGE1_ROUTES, now });
  assert.equal(r1.selectProvider({ currency: 'KRW', channel: 'web_browser' }).provider, 'xsolla');
  assert.equal(r1.selectProvider({ currency: 'USD', channel: 'web_browser', paymentMethodHint: 'google_pay' }).provider, 'xsolla');
  assert.equal(r1.selectProvider({ currency: 'KRW', channel: 'aos_google_play' }).provider, 'google_play');

  // Stage 2: KRW -> Toss, failures open circuit -> transparent failover to Xsolla -> recovers after cooldown
  const r2 = createPaymentRouter({
    enabledProviders: ['toss', 'xsolla'],
    routes: STAGE2_HYBRID_ROUTES,
    failureThreshold: 2,
    cooldownMs: 30000,
    now
  });
  assert.deepEqual(r2.selectProvider({ currency: 'KRW' }), { provider: 'toss', routeId: 'krw_local', failoverUsed: false });
  r2.recordFailure('toss', 'TIMEOUT');
  assert.equal(r2.selectProvider({ currency: 'KRW' }).provider, 'toss');
  r2.recordFailure('toss', 'TIMEOUT');
  const failedOver = r2.selectProvider({ currency: 'KRW' });
  assert.equal(failedOver.provider, 'xsolla');
  assert.equal(failedOver.failoverUsed, true);
  assert.equal(failedOver.skippedPrimary, 'toss');

  // After cooldown, Toss is eligible again
  clock += 31000;
  assert.equal(r2.selectProvider({ currency: 'KRW' }).provider, 'toss');

  // Stage 3: Global Google Pay routes to stripe_gpay
  const r3 = createPaymentRouter({ enabledProviders: ['toss', 'stripe_gpay', 'xsolla'], routes: STAGE3_MULTI_PSP_ROUTES, now });
  assert.equal(r3.selectProvider({ currency: 'USD', paymentMethodHint: 'google_pay' }).provider, 'stripe_gpay');
  assert.equal(r3.selectProvider({ currency: 'BRL' }).provider, 'xsolla');
});

test('Backup and restore-data.mjs accept all 20 additive billing_* tables with user_version=1 intact', async t => {
  const { root, dataDir, db, now, insertPaidOrder } = createFixture(t);
  insertPaidOrder({ id: 'ord-bkp', baseCoins: 1000, bonusCoins: 250, bonusBps: 2500 });
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 1);

  const configPath = path.join(root, 'private.json');
  const backupPath = path.join(root, 'backups', 'billing-snapshot.sqlite');
  fs.writeFileSync(configPath, JSON.stringify({
    dataDir,
    publicPort: 18990,
    adminPort: 18991,
    publicHost: '127.0.0.1',
    adminHost: '127.0.0.1',
    userOrigins: ['http://127.0.0.1:8080'],
    adminOrigins: ['http://127.0.0.1:8081'],
    userBaseUrl: 'http://127.0.0.1:8080',
    publicBaseUrl: 'http://127.0.0.1:18990',
    adminBaseUrl: 'http://127.0.0.1:8081',
    google: {}
  }));

  const report = await createBackup({ configPath, out: backupPath });
  assert.equal(report.databaseUserVersion, 1);

  const verify = await restoreData({ configPath, from: backupPath });
  assert.equal(verify.ok, true, JSON.stringify(verify));
  assert.equal(verify.mode, 'verify');
});
