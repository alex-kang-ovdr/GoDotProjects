// Track B: Stripe Connect Direct Charges Adapter (0% PlayHub Platform Fee).
//
// Invariants:
// - Creator is the merchant/seller. Direct Charges run on `Stripe-Account: <acct_...>`
//   with ZERO `application_fee_amount` / `application_fee_percent`.
// - PlayHub NEVER collects or stores creator private API secret keys.
// - Webhook signatures are verified with HMAC-SHA256 + timestamp replay tolerance.

import crypto from 'node:crypto';
import { ApiError, equal, safeString } from '../../security.mjs';

const STRIPE_API_BASE = 'https://api.stripe.com';
const WEBHOOK_TOLERANCE_SEC = 300;

export function signStripeWebhook({ rawBody, timestampSec, secret }) {
  const signedPayload = `${timestampSec}.${rawBody}`;
  const sig = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
  return `t=${timestampSec},v1=${sig}`;
}

export function verifyStripeWebhookSignature({ rawBody, signatureHeader, secret, now = Date.now }) {
  if (!safeString(secret, 256)) {
    throw new ApiError(503, 'STRIPE_CONNECT_WEBHOOK_SECRET_NOT_CONFIGURED');
  }
  if (typeof signatureHeader !== 'string' || !signatureHeader.trim()) {
    throw new ApiError(401, 'WEBHOOK_SIGNATURE_MISSING');
  }

  let timestampSec = null;
  const v1Sigs = [];
  for (const part of signatureHeader.split(',')) {
    const [k, v] = part.trim().split('=');
    if (k === 't' && /^\d+$/.test(v || '')) timestampSec = Number(v);
    if (k === 'v1' && v) v1Sigs.push(v);
  }
  if (!timestampSec || !v1Sigs.length) {
    throw new ApiError(401, 'WEBHOOK_SIGNATURE_MALFORMED');
  }

  const nowSec = Math.floor(now() / 1000);
  if (Math.abs(nowSec - timestampSec) > WEBHOOK_TOLERANCE_SEC) {
    throw new ApiError(401, 'WEBHOOK_TIMESTAMP_OUT_OF_RANGE');
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestampSec}.${rawBody}`)
    .digest('hex');

  const matched = v1Sigs.some(sig => equal(sig, expected));
  if (!matched) {
    throw new ApiError(401, 'WEBHOOK_SIGNATURE_INVALID');
  }
  return { timestampSec };
}

function encodeForm(params) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) sp.append(k, String(v));
  }
  return sp.toString();
}

export function createStripeConnectProvider({
  platformSecretKey = '',
  webhookSecret = '',
  apiBaseUrl = STRIPE_API_BASE,
  allowMockDirect = false,
  fetchImpl = globalThis.fetch,
  now = Date.now
} = {}) {
  const configured = Boolean(platformSecretKey);

  async function stripeRequest(endpoint, { method = 'POST', body = {}, stripeAccount = null } = {}) {
    if (!configured) {
      throw new ApiError(503, 'STRIPE_CONNECT_NOT_CONFIGURED', 'Stripe Connect platform secret key is not configured');
    }
    const headers = {
      Authorization: `Bearer ${platformSecretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    };
    if (stripeAccount) headers['Stripe-Account'] = stripeAccount;

    const response = await fetchImpl(`${apiBaseUrl.replace(/\/$/, '')}${endpoint}`, {
      method,
      headers,
      body: method === 'GET' ? undefined : encodeForm(body)
    });
    const text = await response.text();
    let parsed = null;
    try { parsed = text ? JSON.parse(text) : null; } catch {}
    if (!response.ok) {
      throw new ApiError(502, 'STRIPE_CONNECT_API_ERROR', parsed?.error?.message || `Stripe API HTTP ${response.status}`);
    }
    return parsed;
  }

  async function startCreatorOnboarding({ principalId, existingAccountId = null, countryCode = 'KR', returnUrl = '/?view=direct', refreshUrl = '/?view=direct' }) {
    if (!configured) {
      if (!allowMockDirect) {
        throw new ApiError(503, 'STRIPE_CONNECT_NOT_CONFIGURED', 'Stripe Connect onboarding is not configured');
      }
      const short = String(principalId).replace(/[^a-zA-Z0-9]/g, '').slice(0, 12) || 'creator';
      const connectedAccountId = existingAccountId || `acct_demo_${short}`;
      return {
        mode: 'mock',
        connectedAccountId,
        onboardingUrl: null,
        onboardingStatus: 'ACTIVE',
        chargesEnabled: true,
        payoutsEnabled: true,
        platformFeeBps: 0
      };
    }

    let accountId = existingAccountId;
    if (!accountId) {
      const acct = await stripeRequest('/v1/accounts', {
        body: {
          type: 'express',
          country: String(countryCode).toUpperCase(),
          'capabilities[card_payments][requested]': 'true',
          'capabilities[transfers][requested]': 'true',
          'metadata[playhub_creator_id]': principalId
        }
      });
      accountId = acct.id;
    }

    const link = await stripeRequest('/v1/account_links', {
      body: {
        account: accountId,
        type: 'account_onboarding',
        return_url: returnUrl,
        refresh_url: refreshUrl
      }
    });

    return {
      mode: 'live',
      connectedAccountId: accountId,
      onboardingUrl: link.url,
      onboardingStatus: 'PENDING',
      chargesEnabled: false,
      payoutsEnabled: false,
      platformFeeBps: 0
    };
  }

  async function createDirectCheckoutSession({ order, product, connectedAccountId, returnUrl = '/?view=direct', cancelUrl = '/?view=direct' }) {
    if (order.platform_fee_minor !== 0) {
      throw new ApiError(500, 'PLATFORM_FEE_MUST_BE_ZERO', 'Direct charges must always carry 0 platform fee');
    }

    if (!configured) {
      if (!allowMockDirect) {
        throw new ApiError(503, 'STRIPE_CONNECT_NOT_CONFIGURED');
      }
      return {
        mode: 'mock',
        provider: 'stripe_connect',
        connectedAccountId,
        checkoutUrl: null,
        providerSessionId: `cs_direct_mock_${order.id}`,
        providerChargeId: `ch_direct_mock_${order.id}`,
        applicationFeeAmount: 0
      };
    }

    // Direct Charge on the creator's connected account (`Stripe-Account` header).
    // Strictly NO `payment_intent_data[application_fee_amount]` — 0% PlayHub platform fee.
    const session = await stripeRequest('/v1/checkout/sessions', {
      stripeAccount: connectedAccountId,
      body: {
        mode: 'payment',
        success_url: returnUrl,
        cancel_url: cancelUrl,
        'line_items[0][price_data][currency]': String(order.currency).toLowerCase(),
        'line_items[0][price_data][unit_amount]': order.amount_minor,
        'line_items[0][price_data][product_data][name]': product.title,
        'line_items[0][quantity]': 1,
        'metadata[direct_order_id]': order.id,
        'metadata[game_id]': order.game_id,
        'metadata[product_id]': order.product_id,
        'metadata[product_key]': product.product_key,
        'payment_intent_data[metadata][direct_order_id]': order.id,
        'payment_intent_data[metadata][game_id]': order.game_id
      }
    });

    const sessionPi = typeof session.payment_intent === 'string'
      ? session.payment_intent
      : (session.payment_intent?.id || null);

    return {
      mode: 'live',
      provider: 'stripe_connect',
      connectedAccountId,
      checkoutUrl: session.url,
      providerSessionId: session.id,
      paymentIntentId: sessionPi,
      providerChargeId: sessionPi,
      applicationFeeAmount: 0
    };
  }

  function verifyWebhook({ rawBody, headers }) {
    const signatureHeader = headers['stripe-signature'] || headers['Stripe-Signature'] || '';
    return verifyStripeWebhookSignature({
      rawBody,
      signatureHeader,
      secret: webhookSecret,
      now
    });
  }

  function extractStripeId(val) {
    if (typeof val === 'string' && val.trim()) return val.trim();
    if (val && typeof val === 'object' && typeof val.id === 'string' && val.id.trim()) return val.id.trim();
    return null;
  }

  function parseWebhookEvent(payload) {
    if (!payload || typeof payload !== 'object' || !safeString(payload.type, 120)) {
      throw new ApiError(400, 'WEBHOOK_PAYLOAD_INVALID');
    }

    const externalEventId = safeString(payload.id, 160) ? String(payload.id) : null;
    if (!externalEventId) throw new ApiError(400, 'WEBHOOK_EVENT_ID_MISSING');

    const obj = payload.data?.object || {};
    const connectedAccountId = extractStripeId(payload.account) || extractStripeId(obj.account) || null;

    if (payload.type === 'account.updated') {
      const acctId = extractStripeId(obj.id) || connectedAccountId;
      const chargesEnabled = obj.charges_enabled === true;
      const payoutsEnabled = obj.payouts_enabled === true;
      const disabledReason = obj.requirements?.disabled_reason || null;
      const onboardingStatus = disabledReason
        ? 'RESTRICTED'
        : (chargesEnabled ? 'ACTIVE' : 'PENDING');
      return {
        eventType: 'account_updated',
        externalEventId,
        connectedAccountId: acctId,
        chargesEnabled,
        payoutsEnabled,
        onboardingStatus
      };
    }

    if (
      payload.type === 'checkout.session.completed' ||
      payload.type === 'checkout.session.async_payment_succeeded'
    ) {
      if (payload.type === 'checkout.session.completed' && obj.payment_status !== 'paid') {
        return {
          eventType: 'ignored',
          rawType: payload.type,
          reason: 'payment_not_paid',
          externalEventId,
          connectedAccountId
        };
      }
      if (
        payload.type === 'checkout.session.async_payment_succeeded' &&
        obj.payment_status !== undefined &&
        obj.payment_status !== 'paid'
      ) {
        return {
          eventType: 'ignored',
          rawType: payload.type,
          reason: 'payment_not_paid',
          externalEventId,
          connectedAccountId
        };
      }
      const directOrderId = safeString(obj.metadata?.direct_order_id, 128) ? String(obj.metadata.direct_order_id) : null;
      const paymentIntentId = extractStripeId(obj.payment_intent);
      const chargeId = extractStripeId(obj.latest_charge) || extractStripeId(obj.charge);
      const providerChargeId = chargeId || paymentIntentId || extractStripeId(obj.id);
      const amountMinor = Number.isSafeInteger(obj.amount_total)
        ? obj.amount_total
        : (Number.isSafeInteger(obj.amount_received) ? obj.amount_received : (Number.isSafeInteger(obj.amount) ? obj.amount : null));
      const currency = typeof obj.currency === 'string' && obj.currency.trim() ? obj.currency.trim().toUpperCase() : null;
      return {
        eventType: 'direct_payment',
        rawType: payload.type,
        externalEventId,
        directOrderId,
        connectedAccountId,
        paymentIntentId,
        chargeId,
        providerChargeId,
        amountMinor,
        currency
      };
    }

    if (payload.type === 'payment_intent.succeeded') {
      const directOrderId = safeString(obj.metadata?.direct_order_id, 128) ? String(obj.metadata.direct_order_id) : null;
      const paymentIntentId = extractStripeId(obj.id);
      const chargeId = extractStripeId(obj.latest_charge) || extractStripeId(obj.charges?.data?.[0]?.id);
      const providerChargeId = chargeId || paymentIntentId;
      const amountMinor = Number.isSafeInteger(obj.amount_received)
        ? obj.amount_received
        : (Number.isSafeInteger(obj.amount) ? obj.amount : null);
      const currency = typeof obj.currency === 'string' && obj.currency.trim() ? obj.currency.trim().toUpperCase() : null;
      return {
        eventType: 'direct_payment',
        rawType: payload.type,
        externalEventId,
        directOrderId,
        connectedAccountId,
        paymentIntentId,
        chargeId,
        providerChargeId,
        amountMinor,
        currency
      };
    }

    if (payload.type === 'charge.refunded') {
      const directOrderId = safeString(obj.metadata?.direct_order_id, 128) ? String(obj.metadata.direct_order_id) : null;
      const chargeId = extractStripeId(obj.id);
      const paymentIntentId = extractStripeId(obj.payment_intent);
      const providerChargeId = chargeId || paymentIntentId;
      return {
        eventType: 'direct_refund',
        rawType: payload.type,
        externalEventId,
        directOrderId,
        connectedAccountId,
        paymentIntentId,
        chargeId,
        providerChargeId,
        reason: obj.refunds?.data?.[0]?.reason || 'stripe_refund'
      };
    }

    if (payload.type === 'charge.dispute.created') {
      const directOrderId = safeString(obj.metadata?.direct_order_id, 128) ? String(obj.metadata.direct_order_id) : null;
      const chargeId = extractStripeId(obj.charge);
      const paymentIntentId = extractStripeId(obj.payment_intent);
      const providerChargeId = chargeId || paymentIntentId;
      return {
        eventType: 'direct_chargeback',
        rawType: payload.type,
        externalEventId,
        directOrderId,
        connectedAccountId,
        paymentIntentId,
        chargeId,
        providerChargeId,
        reason: obj.reason || 'stripe_dispute'
      };
    }

    return {
      eventType: 'ignored',
      rawType: payload.type,
      externalEventId,
      connectedAccountId
    };
  }

  return {
    name: 'stripe_connect',
    configured,
    allowMockDirect,
    startCreatorOnboarding,
    createDirectCheckoutSession,
    verifyWebhook,
    parseWebhookEvent
  };
}
