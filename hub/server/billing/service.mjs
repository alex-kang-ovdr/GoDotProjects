// PlayHub Billing Orchestration Service (M1 + M2: Track A 1P Checkout, Webhooks,
// 7-day Withdrawal, Subscriptions, Gift Cards + Brute-Force Protection,
// UsageMetering + Hold/Capture, Ledger Queries, and Track B Entitlement reads).

import { ApiError, digest, safeString, uid } from '../security.mjs';
import { ensureBillingSchema, BILLING_UNIT } from './schema.mjs';
import { withIdempotency, runAtomic } from './idempotency.mjs';
import {
  seedDefaultCatalogAndPolicies,
  listCatalogOffers,
  quoteSkuOffer,
  resolveAuthoritativeChannel
} from './policy.mjs';
import {
  getWallet,
  creditPurchase,
  clawbackOrder,
  reserveHold,
  releaseHold,
  verifyLedgerIntegrity
} from './ledger.mjs';
import { assertCanPurchase, resolveSpendingPolicy, kstMonthStartMs, kstDayStartMs } from './compliance.mjs';
import {
  PLAN_QUOTAS,
  getSubscription,
  upsertSubscription,
  recordMeteredUsage,
  summarizeUsage
} from './subscriptions.mjs';
import {
  createGiftCardBruteForceGuard,
  issueGiftCardBatch,
  activateGiftCardBatch,
  voidGiftCardBatch,
  voidGiftCardBySerial,
  listGiftCardBatches,
  previewGiftCard,
  redeemGiftCard
} from './giftcards.mjs';
import { listActiveEntitlements } from './direct-commerce.mjs';

const SEVEN_DAYS_MS = 7 * 86400000;
const THIRTY_DAYS_MS = 30 * 86400000;
const KST_OFFSET_MS = 9 * 3600000;

function currentKstPeriodKey(stamp) {
  return new Date(stamp + KST_OFFSET_MS).toISOString().slice(0, 7);
}

export function createBillingService({
  db,
  providers,
  router,
  config = {},
  now = Date.now,
  audit = () => {}
}) {
  ensureBillingSchema(db);
  seedDefaultCatalogAndPolicies(db, now);

  const allowMockProvider = config.allowMockProvider === true;
  const allowDemoAccount = config.allowDemoAccount === true;
  const defaultProviderMode = allowMockProvider && !providers.xsolla?.configured ? 'mock' : 'xsolla';
  const giftcardPepper = config.giftcardPepper || (allowMockProvider ? 'dev-playhub-giftcard-pepper-local-only' : '');
  const bruteForceGuard = createGiftCardBruteForceGuard({
    maxFailures: config.giftcardMaxFailures || 5,
    windowMs: config.giftcardWindowMs || 15 * 60_000,
    lockMs: config.giftcardLockMs || 15 * 60_000,
    now
  });

  function requireGiftcardPepper() {
    if (!safeString(giftcardPepper, 256)) {
      throw new ApiError(500, 'GIFTCARD_PEPPER_NOT_CONFIGURED', 'Gift card HMAC pepper is not configured');
    }
    return giftcardPepper;
  }

  function getProviderAdapter(name) {
    const adapter = providers[name];
    if (!adapter) throw new ApiError(400, 'PROVIDER_UNAVAILABLE', `Provider '${name}' is not configured`);
    return adapter;
  }

  function getCatalog({ currency = 'KRW', channel = 'web_browser' } = {}) {
    const offers = listCatalogOffers(db, { currency, channel, now });
    return {
      ...offers,
      billingMode: defaultProviderMode,
      allowMockProvider,
      allowDemoAccount,
      paymentMethods: {
        koreaLocal: ['card_kr', 'kakaopay', 'naverpay', 'tosspay', 'bank_transfer'],
        global: ['card_global', 'google_pay', 'apple_pay', 'paypal'],
        googlePayNote: 'Google Pay Web (0% Google fee, up to +25% PlayCoin bonus) supports global cards; KRW domestic checkout uses local easy-pay & cards.'
      },
      plans: PLAN_QUOTAS,
      creatorDirectPolicy: {
        platformFeePercent: 0,
        playhubHoldsCreatorFunds: false,
        enabledPlatforms: ['web'],
        mobileTvPolicy: 'free_to_play_first_until_p3'
      }
    };
  }

  function formatOrderRow(row, stamp) {
    const withdrawalEligible = Boolean(
      row.state === 'PAID' &&
      row.provider !== 'giftcard' &&
      row.first_spent_at === null &&
      row.paid_at &&
      (stamp - row.paid_at) <= SEVEN_DAYS_MS
    );
    return {
      id: row.id,
      channel: row.channel,
      provider: row.provider,
      skuId: row.sku_id,
      currency: row.currency,
      amountMinor: row.amount_minor,
      baseCoins: row.base_coins,
      bonusCoins: row.bonus_coins,
      totalCoins: row.base_coins + row.bonus_coins,
      bonusBps: row.bonus_bps,
      bonusPercent: row.bonus_bps / 100,
      state: row.state,
      firstSpentAt: row.first_spent_at ? new Date(row.first_spent_at).toISOString() : null,
      paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : null,
      createdAt: new Date(row.created_at).toISOString(),
      withdrawalEligible
    };
  }

  function getUsageDetails(principalId, { periodKey = null, limit = 30 } = {}) {
    const stamp = now();
    const effectivePeriod = safeString(periodKey, 16) && /^\d{4}-\d{2}$/.test(periodKey)
      ? periodKey
      : currentKstPeriodKey(stamp);
    const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 100);
    const subscription = getSubscription(db, principalId, now);
    const summary = summarizeUsage(db, { principalId, periodKey: effectivePeriod });

    const activeHolds = db.prepare(`
      SELECT id, amount_coins, settled_coins, sink_type, sink_ref_id, state, expires_at, created_at
      FROM billing_wallet_holds
      WHERE principal_id=? AND state='HELD'
      ORDER BY created_at DESC
      LIMIT 20
    `).all(principalId).map(h => ({
      id: h.id,
      amountCoins: h.amount_coins,
      settledCoins: h.settled_coins,
      sinkType: h.sink_type,
      sinkRefId: h.sink_ref_id,
      state: h.state,
      expiresAt: h.expires_at ? new Date(h.expires_at).toISOString() : null,
      createdAt: new Date(h.created_at).toISOString()
    }));

    const records = db.prepare(`
      SELECT id, metric_type, resource_ref_id, quantity, billable_coins, hold_id, journal_entry_id, period_key, created_at
      FROM billing_usage_records
      WHERE principal_id=? AND period_key=?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(principalId, effectivePeriod, safeLimit).map(r => ({
      id: r.id,
      metricType: r.metric_type,
      resourceRefId: r.resource_ref_id,
      quantity: r.quantity,
      billableCoins: r.billable_coins,
      holdId: r.hold_id,
      journalEntryId: r.journal_entry_id,
      periodKey: r.period_key,
      createdAt: new Date(r.created_at).toISOString()
    }));

    return {
      unit: BILLING_UNIT,
      periodKey: effectivePeriod,
      planTier: subscription.effectivePlan,
      quotas: subscription.quotas,
      byMetric: summary.byMetric,
      activeHolds,
      records
    };
  }

  function getAccountSummary(principalId) {
    const stamp = now();
    const wallet = getWallet(db, principalId, now);
    const subscription = getSubscription(db, principalId, now);
    const spendingPolicy = resolveSpendingPolicy(db, principalId, now);
    const monthStart = kstMonthStartMs(stamp);
    const dayStart = kstDayStartMs(stamp);

    const monthlyUsedKrw = db.prepare(`
      SELECT COALESCE(SUM(amount_minor), 0) AS total
      FROM billing_orders
      WHERE principal_id=? AND currency='KRW' AND provider != 'giftcard' AND state IN ('PAID','PENDING') AND created_at >= ?
    `).get(principalId, monthStart).total;

    const dailyUsedKrw = db.prepare(`
      SELECT COALESCE(SUM(amount_minor), 0) AS total
      FROM billing_orders
      WHERE principal_id=? AND currency='KRW' AND provider != 'giftcard' AND state IN ('PAID','PENDING') AND created_at >= ?
    `).get(principalId, dayStart).total;

    const recentOrderRows = db.prepare(`
      SELECT * FROM billing_orders WHERE principal_id=? ORDER BY created_at DESC LIMIT 20
    `).all(principalId);

    const entitlements = listActiveEntitlements(db, { buyerId: principalId, now }).map(e => ({
      id: e.id,
      gameId: e.game_id,
      productKey: e.product_key,
      creatorId: e.creator_id,
      state: e.state,
      grantedAt: new Date(e.granted_at).toISOString(),
      expiresAt: e.expires_at ? new Date(e.expires_at).toISOString() : null
    }));

    const usage = getUsageDetails(principalId, { limit: 15 });

    return {
      unit: BILLING_UNIT,
      billingMode: defaultProviderMode,
      allowDemoAccount,
      wallet,
      subscription,
      limits: {
        ageTier: spendingPolicy.ageTier,
        guardianApproved: spendingPolicy.guardianApproved,
        monthlyCapMinor: spendingPolicy.monthlyCapMinor,
        monthlyUsedMinor: monthlyUsedKrw,
        dailyCapMinor: spendingPolicy.dailyCapMinor,
        dailyUsedMinor: dailyUsedKrw
      },
      orders: recentOrderRows.map(r => formatOrderRow(r, stamp)),
      entitlements,
      usage
    };
  }

  function getLedgerHistory(principalId, { limit = 30 } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 100);
    const rows = db.prepare(`
      SELECT e.id, e.event_type, e.order_id, e.sink_type, e.sink_ref_id, e.metadata_json, e.created_at,
             l.account_code, l.signed_coins, l.lot_id
      FROM billing_journal_lines l
      JOIN billing_journal_entries e ON e.id = l.entry_id
      WHERE l.account_code LIKE ?
      ORDER BY e.created_at DESC, l.id DESC
      LIMIT ?
    `).all(`user:${principalId}:%`, safeLimit);

    return {
      unit: BILLING_UNIT,
      entries: rows.map(r => ({
        entryId: r.id,
        eventType: r.event_type,
        orderId: r.order_id,
        bucket: r.account_code.split(':')[2] || 'unknown',
        deltaCoins: r.signed_coins,
        lotId: r.lot_id,
        sinkType: r.sink_type,
        sinkRefId: r.sink_ref_id,
        metadata: JSON.parse(r.metadata_json || '{}'),
        createdAt: new Date(r.created_at).toISOString()
      }))
    };
  }

  async function createCheckoutOrder({
    principalId,
    skuId,
    currency = 'KRW',
    channelHint = 'web_browser',
    paymentMethodHint = 'card',
    preferredProvider = null,
    agreedTermsVersion,
    returnUrl = '/?view=billing',
    idempotencyKey
  }) {
    if (!safeString(agreedTermsVersion, 64)) {
      throw new ApiError(422, 'TERMS_CONSENT_REQUIRED', 'Pre-checkout withdrawal and bonus terms agreement is required');
    }

    const curr = String(currency || 'KRW').toUpperCase();
    const userRow = db.prepare('SELECT id, kind, display_name FROM users WHERE id=?').get(principalId);
    if (!userRow || userRow.kind !== 'registered') {
      throw new ApiError(403, 'REGISTERED_ACCOUNT_REQUIRED', 'Google account login is required before purchasing PlayCoin');
    }

    const routeDecision = router.selectProvider({
      currency: curr,
      channel: channelHint === 'pc_desktop' ? 'pc_desktop' : 'web_browser',
      paymentMethodHint,
      preferredProvider: preferredProvider || (allowMockProvider && !providers.xsolla?.configured ? 'mock' : null)
    });
    const providerName = routeDecision.provider;
    const providerAdapter = getProviderAdapter(providerName);

    const authoritativeChannel = resolveAuthoritativeChannel({ provider: providerName, clientChannelHint: channelHint });
    const offer = quoteSkuOffer(db, { skuId, currency: curr, channel: authoritativeChannel, now });

    const created = withIdempotency({
      db,
      scope: 'billing.order.create',
      key: idempotencyKey,
      principalId,
      requestPayload: { skuId, currency: curr, channel: authoritativeChannel, provider: providerName, agreedTermsVersion },
      now,
      fn: () => {
        assertCanPurchase(db, { principalId, amountMinor: offer.amountMinor, currency: curr, now });
        const orderId = uid();
        const stamp = now();
        db.prepare(`
          INSERT INTO billing_orders(
            id, principal_id, channel, provider, sku_id, currency, amount_minor,
            base_coins, bonus_coins, bonus_bps, state, provider_payment_id,
            idempotency_key, first_spent_at, paid_at, created_at, updated_at
          ) VALUES(?,?,?,?,?,?,?,?,?,?,'CREATED',NULL,?,NULL,NULL,?,?)
        `).run(
          orderId, principalId, authoritativeChannel, providerName, offer.skuId, offer.currency, offer.amountMinor,
          offer.baseCoins, offer.bonusCoins, offer.bonusBps, idempotencyKey, stamp, stamp
        );
        audit('billing.order.created', orderId, {
          principalId,
          provider: providerName,
          channel: authoritativeChannel,
          skuId: offer.skuId,
          amountMinor: offer.amountMinor,
          currency: offer.currency,
          baseCoins: offer.baseCoins,
          bonusCoins: offer.bonusCoins,
          bonusBps: offer.bonusBps,
          agreedTermsVersion
        });
        return {
          status: 201,
          body: { orderId, provider: providerName, routeId: routeDecision.routeId, failoverUsed: routeDecision.failoverUsed }
        };
      }
    });

    const orderRow = db.prepare('SELECT * FROM billing_orders WHERE id=?').get(created.body.orderId);
    let checkout;
    try {
      checkout = await providerAdapter.createCheckoutSession({
        order: orderRow,
        userDisplayName: userRow.display_name,
        returnUrl,
        paymentMethodHint
      });
      router.recordSuccess(providerName);
    } catch (error) {
      router.recordFailure(providerName, error.code || 'CHECKOUT_ERROR');
      throw error;
    }

    return {
      replayed: created.replayed,
      order: formatOrderRow(orderRow, now()),
      offer,
      checkout,
      route: { provider: providerName, routeId: created.body.routeId, failoverUsed: created.body.failoverUsed }
    };
  }

  function settleOrderPaidInTx({ orderId, providerPaymentId, source }) {
    return runAtomic(db, () => {
      const order = db.prepare('SELECT * FROM billing_orders WHERE id=?').get(orderId);
      if (!order) throw new ApiError(404, 'ORDER_NOT_FOUND');
      if (order.state === 'PAID') {
        return {
          duplicate: true,
          order: formatOrderRow(order, now()),
          wallet: getWallet(db, order.principal_id, now)
        };
      }
      if (!['CREATED', 'PENDING'].includes(order.state)) {
        throw new ApiError(409, 'ORDER_STATE_NOT_PAYABLE', `Order state is ${order.state}`);
      }

      const stamp = now();
      const updated = db.prepare(`
        UPDATE billing_orders
        SET state='PAID', provider_payment_id=COALESCE(provider_payment_id, ?), paid_at=?, updated_at=?
        WHERE id=? AND state IN ('CREATED','PENDING')
      `).run(providerPaymentId || null, stamp, stamp, orderId);

      if (updated.changes !== 1) {
        const latest = db.prepare('SELECT * FROM billing_orders WHERE id=?').get(orderId);
        return {
          duplicate: true,
          order: formatOrderRow(latest, stamp),
          wallet: getWallet(db, order.principal_id, now)
        };
      }

      const credited = creditPurchase(db, {
        principalId: order.principal_id,
        orderId: order.id,
        provider: order.provider,
        baseCoins: order.base_coins,
        bonusCoins: order.bonus_coins,
        idempotencyKey: `order-paid:${order.id}`,
        now
      });

      audit('billing.order.paid', order.id, {
        principalId: order.principal_id,
        provider: order.provider,
        source,
        baseCoins: order.base_coins,
        bonusCoins: order.bonus_coins,
        journalEntryId: credited.entryId
      });

      const paidOrder = db.prepare('SELECT * FROM billing_orders WHERE id=?').get(orderId);
      return {
        duplicate: false,
        order: formatOrderRow(paidOrder, stamp),
        wallet: credited.wallet,
        journalEntryId: credited.entryId
      };
    });
  }

  async function confirmOrderPayment({ principalId, orderId, providerPaymentId, amountMinor }) {
    const order = db.prepare('SELECT * FROM billing_orders WHERE id=?').get(orderId);
    if (!order || order.principal_id !== principalId) {
      throw new ApiError(404, 'ORDER_NOT_FOUND');
    }
    if (order.state === 'PAID') {
      return { duplicate: true, order: formatOrderRow(order, now()), wallet: getWallet(db, principalId, now) };
    }

    const adapter = getProviderAdapter(order.provider);
    const verification = await adapter.verifyPayment({ order, providerPaymentId, amountMinor });
    if (verification.pendingWebhook && !verification.verified) {
      return {
        duplicate: false,
        pendingWebhook: true,
        order: formatOrderRow(order, now()),
        wallet: getWallet(db, principalId, now)
      };
    }

    return settleOrderPaidInTx({
      orderId: order.id,
      providerPaymentId: verification.providerPaymentId || providerPaymentId,
      source: 'client_confirm'
    });
  }

  function handleWebhook({ providerName, rawBody, headers }) {
    const adapter = getProviderAdapter(providerName);
    adapter.verifyWebhookSignature({ rawBody, headers });

    let payload;
    try { payload = JSON.parse(rawBody || '{}'); }
    catch { throw new ApiError(400, 'WEBHOOK_JSON_INVALID'); }

    const evt = adapter.parseWebhookEvent(payload);

    if (evt.eventType === 'user_validation') {
      const user = evt.principalId && db.prepare('SELECT id, kind FROM users WHERE id=?').get(evt.principalId);
      if (!user || user.kind !== 'registered') {
        throw new ApiError(400, 'INVALID_USER', 'Registered PlayHub account not found');
      }
      const wallet = getWallet(db, user.id, now);
      if (wallet.frozen || wallet.debt > 0) {
        throw new ApiError(400, 'INVALID_USER', 'Account is restricted from purchasing');
      }
      return { status: 204, body: null };
    }

    const payloadHash = digest(rawBody);
    const stamp = now();

    return runAtomic(db, () => {
      const existingEvent = db.prepare(
        'SELECT status FROM billing_payment_events WHERE external_event_id=?'
      ).get(evt.externalEventId);
      if (existingEvent && existingEvent.status === 'PROCESSED') {
        return { status: 200, body: { ok: true, duplicate: true, eventId: evt.externalEventId } };
      }

      let order = evt.orderId ? db.prepare('SELECT * FROM billing_orders WHERE id=?').get(evt.orderId) : null;
      if (!order && evt.providerPaymentId) {
        order = db.prepare('SELECT * FROM billing_orders WHERE provider_payment_id=?').get(evt.providerPaymentId);
      }
      if (!order) {
        throw new ApiError(404, 'WEBHOOK_ORDER_NOT_FOUND');
      }

      if (evt.eventType === 'payment') {
        if (evt.currency && evt.currency !== order.currency) {
          throw new ApiError(422, 'WEBHOOK_CURRENCY_MISMATCH');
        }
        if (evt.amountMinor !== null && evt.amountMinor !== order.amount_minor) {
          throw new ApiError(422, 'WEBHOOK_AMOUNT_MISMATCH');
        }
      }

      if (!existingEvent) {
        db.prepare(`
          INSERT INTO billing_payment_events(id, provider, external_event_id, order_id, event_type, payload_sha256, status, received_at, processed_at)
          VALUES(?,?,?,?,?,?,'RECEIVED',?,NULL)
        `).run(uid(), providerName, evt.externalEventId, order.id, evt.eventType, payloadHash, stamp);
      }

      let result;
      if (evt.eventType === 'payment') {
        result = settleOrderPaidInTx({
          orderId: order.id,
          providerPaymentId: evt.providerPaymentId,
          source: `webhook:${providerName}`
        });
      } else if (evt.eventType === 'refund' || evt.eventType === 'chargeback') {
        const kind = evt.eventType === 'chargeback' ? 'chargeback' : 'cs_exception';
        result = clawbackOrder(db, {
          orderId: order.id,
          kind,
          reason: evt.reason || `webhook_${kind}`,
          actorId: `webhook:${providerName}`,
          refundAmountMinor: evt.amountMinor ?? order.amount_minor,
          providerRefundId: evt.externalEventId,
          idempotencyKey: `webhook-clawback:${evt.externalEventId}`,
          now
        });
        audit(`billing.webhook.${kind}`, order.id, { provider: providerName, eventId: evt.externalEventId });
      }

      db.prepare(
        "UPDATE billing_payment_events SET status='PROCESSED', processed_at=? WHERE external_event_id=?"
      ).run(now(), evt.externalEventId);

      return { status: 200, body: { ok: true, duplicate: false, eventId: evt.externalEventId, result } };
    });
  }

  async function withdrawUnusedOrder({ principalId, orderId, reason = 'customer_7d_withdrawal', idempotencyKey }) {
    const order = db.prepare('SELECT * FROM billing_orders WHERE id=?').get(orderId);
    if (!order || order.principal_id !== principalId) {
      throw new ApiError(404, 'ORDER_NOT_FOUND');
    }
    if (order.provider === 'giftcard') {
      throw new ApiError(409, 'GIFTCARD_ORDER_NOT_AUTO_WITHDRAWABLE', 'Redeemed gift card orders cannot use automatic PG withdrawal');
    }
    if (order.state !== 'PAID') {
      throw new ApiError(409, 'ORDER_NOT_REFUNDABLE');
    }
    const stamp = now();
    if (!order.paid_at || (stamp - order.paid_at) > SEVEN_DAYS_MS) {
      throw new ApiError(422, 'WITHDRAWAL_WINDOW_EXPIRED', '7-day withdrawal period has elapsed');
    }
    if (order.first_spent_at !== null) {
      throw new ApiError(409, 'WITHDRAWAL_ORDER_ALREADY_SPENT', 'Order PlayCoin (paid or bonus) has already been used');
    }

    const adapter = getProviderAdapter(order.provider);
    const pgRefund = await adapter.refundPayment({ order, amountMinor: order.amount_minor, reason });

    const outcome = clawbackOrder(db, {
      orderId: order.id,
      kind: 'withdrawal_7d',
      reason,
      actorId: principalId,
      refundAmountMinor: order.amount_minor,
      providerRefundId: pgRefund.providerRefundId,
      idempotencyKey,
      now
    });

    audit('billing.order.withdrawn_7d', order.id, {
      principalId,
      refundId: outcome.refund?.id,
      clawbackPaid: outcome.refund?.clawback_paid_coins,
      clawbackBonus: outcome.refund?.clawback_bonus_coins
    });

    return outcome;
  }

  function activateProSubscription({ principalId, idempotencyKey }) {
    if (!allowMockProvider) {
      throw new ApiError(501, 'SUBSCRIPTION_CHECKOUT_NOT_ENABLED', 'Live subscription checkout requires configured PG');
    }
    const user = db.prepare('SELECT id, kind FROM users WHERE id=?').get(principalId);
    if (!user || user.kind !== 'registered') {
      throw new ApiError(403, 'REGISTERED_ACCOUNT_REQUIRED');
    }
    return withIdempotency({
      db,
      scope: 'billing.subscription.pro',
      key: idempotencyKey,
      principalId,
      requestPayload: { planTier: 'pro' },
      now,
      fn: () => {
        const start = now();
        const sub = upsertSubscription(db, {
          principalId,
          planTier: 'pro',
          status: 'ACTIVE',
          provider: 'mock',
          providerSubscriptionId: `mock_sub_${uid()}`,
          currentPeriodStart: start,
          currentPeriodEnd: start + THIRTY_DAYS_MS,
          cancelAtPeriodEnd: false,
          now
        });
        audit('billing.subscription.activated', principalId, { planTier: 'pro', provider: 'mock' });
        return { status: 200, body: { subscription: sub } };
      }
    }).body;
  }

  function cancelProSubscription({ principalId }) {
    const current = getSubscription(db, principalId, now);
    if (current.planTier !== 'pro' || current.status !== 'ACTIVE') {
      throw new ApiError(409, 'NO_ACTIVE_PRO_SUBSCRIPTION');
    }
    const sub = upsertSubscription(db, {
      principalId,
      planTier: 'pro',
      status: 'CANCELED',
      provider: current.provider,
      providerSubscriptionId: current.providerSubscriptionId,
      currentPeriodStart: current.currentPeriodStart,
      currentPeriodEnd: current.currentPeriodEnd,
      cancelAtPeriodEnd: true,
      now
    });
    audit('billing.subscription.canceled', principalId, { currentPeriodEnd: sub.currentPeriodEnd });
    return { subscription: sub };
  }

  // --- M2: Gift Card User & Admin Operations ---

  function previewGiftCardPin({ principalId, pin, clientIp = null }) {
    return previewGiftCard(db, {
      principalId,
      pin,
      pepper: requireGiftcardPepper(),
      bruteForceGuard,
      clientIp,
      now
    });
  }

  function redeemGiftCardPin({ principalId, pin, idempotencyKey, clientIp = null }) {
    const res = redeemGiftCard(db, {
      principalId,
      pin,
      idempotencyKey,
      pepper: requireGiftcardPepper(),
      bruteForceGuard,
      clientIp,
      now
    });
    if (!res.replayed) {
      audit('billing.giftcard.redeemed', res.giftcard.serialNo, {
        principalId,
        orderId: res.orderId,
        channel: res.giftcard.channel,
        baseCoins: res.giftcard.baseCoins,
        bonusCoins: res.giftcard.bonusCoins
      });
    }
    return res;
  }

  function issueDemoGiftCard({ principalId, channel = 'gift_card_direct' }) {
    if (!allowDemoAccount) throw new ApiError(404, 'NOT_FOUND');
    const isRetail = channel === 'gift_card_retail';
    const issued = issueGiftCardBatch(db, {
      channel: isRetail ? 'gift_card_retail' : 'gift_card_direct',
      partnerName: isRetail ? 'demo_retail_partner' : 'playhub_direct_demo',
      currency: 'KRW',
      faceValueMinor: 14000,
      baseCoins: 1000,
      bonusBps: isRetail ? 2000 : 2500,
      quantity: 1,
      expiresAt: now() + 365 * 86400000,
      createdBy: `demo:${principalId}`,
      activateImmediately: true,
      pepper: requireGiftcardPepper(),
      now
    });
    audit('billing.giftcard.demo_issued', issued.batch.id, { principalId, channel: issued.batch.channel });
    return {
      batchId: issued.batch.id,
      card: issued.oneTimePins[0],
      bonusPercent: issued.batch.bonusPercent
    };
  }

  function createAdminGiftCardBatch({
    channel = 'gift_card_direct',
    partnerName,
    currency = 'KRW',
    faceValueMinor,
    baseCoins,
    bonusBps = 2500,
    quantity = 10,
    expiresAt = null,
    activateImmediately = false,
    actorId = 'admin'
  }) {
    const issued = issueGiftCardBatch(db, {
      channel,
      partnerName,
      currency,
      faceValueMinor,
      baseCoins,
      bonusBps,
      quantity,
      expiresAt,
      createdBy: actorId,
      activateImmediately,
      pepper: requireGiftcardPepper(),
      now
    });
    audit('billing.admin.giftcard_batch_created', issued.batch.id, {
      actorId,
      channel,
      partnerName,
      quantity,
      baseCoins,
      bonusBps,
      activateImmediately
    });
    return issued;
  }

  function activateAdminGiftCardBatch({ batchId, actorId = 'admin' }) {
    const res = activateGiftCardBatch(db, { batchId, actorId, now });
    if (!res.duplicate) {
      audit('billing.admin.giftcard_batch_activated', batchId, { actorId, activatedCount: res.activatedCount });
    }
    return res;
  }

  function voidAdminGiftCardBatch({ batchId, reason = 'admin_void', actorId = 'admin' }) {
    const res = voidGiftCardBatch(db, { batchId, reason, actorId, now });
    audit('billing.admin.giftcard_batch_voided', batchId, { actorId, reason, voidedCount: res.voidedCount });
    return res;
  }

  function voidAdminGiftCardSerial({ serialNo, reason = 'stolen_or_damaged', actorId = 'admin' }) {
    const res = voidGiftCardBySerial(db, { serialNo, reason, actorId, now });
    if (!res.duplicate) {
      audit('billing.admin.giftcard_voided', serialNo, { actorId, reason });
    }
    return res;
  }

  function listAdminGiftCardBatches({ limit = 50 } = {}) {
    return { batches: listGiftCardBatches(db, { limit }) };
  }

  // --- M2: Track A UsageMetering & Hold/Capture Operations ---

  function createUsageHold({
    principalId,
    amountCoins,
    sinkType = 'infra_server',
    sinkRefId,
    idempotencyKey,
    expiresAt = null
  }) {
    const res = reserveHold(db, {
      principalId,
      amountCoins,
      sinkType,
      sinkRefId,
      idempotencyKey,
      expiresAt,
      now
    });
    if (!res.duplicate) {
      audit('billing.usage.hold_created', res.hold.id, { principalId, amountCoins, sinkType, sinkRefId });
    }
    return res;
  }

  function releaseUsageHold({ holdId, idempotencyKey }) {
    const res = releaseHold(db, { holdId, idempotencyKey, now });
    if (!res.duplicate) {
      audit('billing.usage.hold_released', holdId, { principalId: res.hold.principal_id });
    }
    return res;
  }

  function recordUsage({
    principalId,
    metricType,
    resourceRefId,
    quantity,
    billableCoins = 0,
    holdId = null,
    allowBonusForInfra = true,
    periodKey = null,
    idempotencyKey
  }) {
    const effectivePeriod = safeString(periodKey, 16) ? periodKey : currentKstPeriodKey(now());
    const res = recordMeteredUsage(db, {
      principalId,
      metricType,
      resourceRefId,
      quantity,
      billableCoins,
      holdId,
      allowBonusForInfra,
      periodKey: effectivePeriod,
      idempotencyKey,
      now
    });
    if (!res.replayed) {
      audit('billing.usage.recorded', res.usageId, {
        principalId,
        metricType,
        quantity,
        billableCoins,
        holdId,
        periodKey: effectivePeriod
      });
    }
    return res;
  }

  function runDemoUsageConsume({ principalId, mode = 'ai_direct', idempotencyKey }) {
    if (!allowDemoAccount) throw new ApiError(404, 'NOT_FOUND');
    const periodKey = currentKstPeriodKey(now());
    if (mode === 'server_hold_capture') {
      const holdRes = createUsageHold({
        principalId,
        amountCoins: 60,
        sinkType: 'infra_server',
        sinkRefId: `demo-room-${idempotencyKey}`,
        idempotencyKey: `demo-hold:${idempotencyKey}`,
        expiresAt: now() + 3600_000
      });
      const usageRes = recordUsage({
        principalId,
        metricType: 'server_minutes',
        resourceRefId: `demo-room-${idempotencyKey}`,
        quantity: 10,
        billableCoins: 35,
        holdId: holdRes.hold.id,
        periodKey,
        idempotencyKey: `demo-settle:${idempotencyKey}`
      });
      return {
        mode,
        reservedCoins: 60,
        settledCoins: 35,
        releasedCoins: 25,
        usage: usageRes,
        wallet: usageRes.wallet
      };
    }

    const usageRes = recordUsage({
      principalId,
      metricType: 'ai_units',
      resourceRefId: `demo-ai-${idempotencyKey}`,
      quantity: 100,
      billableCoins: 20,
      periodKey,
      idempotencyKey: `demo-ai:${idempotencyKey}`
    });
    return {
      mode: 'ai_direct',
      usage: usageRes,
      wallet: usageRes.wallet
    };
  }

  function getAdminStatus() {
    const integrity = verifyLedgerIntegrity(db);
    const orders = db.prepare(`
      SELECT state, COUNT(*) AS count, COALESCE(SUM(amount_minor), 0) AS total_minor,
             COALESCE(SUM(base_coins), 0) AS base_coins, COALESCE(SUM(bonus_coins), 0) AS bonus_coins
      FROM billing_orders
      GROUP BY state
    `).all();
    const activeProCount = db.prepare(
      "SELECT COUNT(*) AS count FROM billing_subscriptions WHERE plan_tier='pro' AND status='ACTIVE'"
    ).get().count;
    const activeEntitlementCount = db.prepare(
      "SELECT COUNT(*) AS count FROM billing_entitlements WHERE state='ACTIVE'"
    ).get().count;
    const giftcardStats = db.prepare(`
      SELECT state, COUNT(*) AS count
      FROM billing_giftcards
      GROUP BY state
    `).all();
    const usageTotals = db.prepare(`
      SELECT metric_type, COALESCE(SUM(quantity), 0) AS total_quantity, COALESCE(SUM(billable_coins), 0) AS total_coins
      FROM billing_usage_records
      GROUP BY metric_type
    `).all();

    return {
      ok: integrity.ok,
      unit: BILLING_UNIT,
      billingMode: defaultProviderMode,
      integrity,
      routerHealth: router.healthSnapshot(),
      ordersByState: orders,
      activeProCount,
      activeEntitlementCount,
      giftcardsByState: giftcardStats,
      usageByMetric: usageTotals
    };
  }

  return {
    getCatalog,
    getAccountSummary,
    getUsageDetails,
    getLedgerHistory,
    createCheckoutOrder,
    confirmOrderPayment,
    handleWebhook,
    withdrawUnusedOrder,
    activateProSubscription,
    cancelProSubscription,
    // M2 Gift Cards
    previewGiftCardPin,
    redeemGiftCardPin,
    issueDemoGiftCard,
    createAdminGiftCardBatch,
    activateAdminGiftCardBatch,
    voidAdminGiftCardBatch,
    voidAdminGiftCardSerial,
    listAdminGiftCardBatches,
    // M2 UsageMetering & Hold/Capture
    createUsageHold,
    releaseUsageHold,
    recordUsage,
    runDemoUsageConsume,
    // Admin status
    getAdminStatus
  };
}
