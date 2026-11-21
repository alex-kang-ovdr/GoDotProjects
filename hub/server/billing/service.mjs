// PlayHub Billing Orchestration Service (M1: Track A 1P Checkout, Webhooks,
// 7-day Withdrawal, Subscriptions, Ledger Queries, and Track B Entitlement reads).

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
  verifyLedgerIntegrity
} from './ledger.mjs';
import { assertCanPurchase, resolveSpendingPolicy, kstMonthStartMs, kstDayStartMs } from './compliance.mjs';
import { PLAN_QUOTAS, getSubscription, upsertSubscription, summarizeUsage } from './subscriptions.mjs';
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
      WHERE principal_id=? AND currency='KRW' AND state IN ('PAID','PENDING') AND created_at >= ?
    `).get(principalId, monthStart).total;

    const dailyUsedKrw = db.prepare(`
      SELECT COALESCE(SUM(amount_minor), 0) AS total
      FROM billing_orders
      WHERE principal_id=? AND currency='KRW' AND state IN ('PAID','PENDING') AND created_at >= ?
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

    const usage = summarizeUsage(db, { principalId, periodKey: currentKstPeriodKey(stamp) });

    return {
      unit: BILLING_UNIT,
      billingMode: defaultProviderMode,
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

    // Server-authoritative channel & offer calculation (never trust client bonus claims).
    const authoritativeChannel = resolveAuthoritativeChannel({ provider: providerName, clientChannelHint: channelHint });
    const offer = quoteSkuOffer(db, { skuId, currency: curr, channel: authoritativeChannel, now });

    // Create DB order idempotently before calling external PG.
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

    // Xsolla user_validation pre-check before payment execution.
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

    return {
      ok: integrity.ok,
      unit: BILLING_UNIT,
      billingMode: defaultProviderMode,
      integrity,
      routerHealth: router.healthSnapshot(),
      ordersByState: orders,
      activeProCount,
      activeEntitlementCount
    };
  }

  return {
    getCatalog,
    getAccountSummary,
    getLedgerHistory,
    createCheckoutOrder,
    confirmOrderPayment,
    handleWebhook,
    withdrawUnusedOrder,
    activateProSubscription,
    cancelProSubscription,
    getAdminStatus
  };
}
