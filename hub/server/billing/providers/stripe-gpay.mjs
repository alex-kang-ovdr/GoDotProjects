// Stage 3 Global PG + Google Pay Web (`pay.js`) Adapter: Stripe (Track A 1P PlayCoin Billing).
// Delivers direct global card & Google Pay Web one-tap checkout (0% Google fee, ~2.9%+$0.30 Stripe fee),
// preserving full +25% web/PC PlayCoin bonus economics at global scale.
// Falls back cleanly to Xsolla via router.mjs circuit breaker on outage.

import { ApiError, safeString } from '../../security.mjs';
import { verifyStripeWebhookSignature } from './stripe-connect.mjs';
import { minorToMajorAmount } from './xsolla.mjs';

const STRIPE_API_BASE = 'https://api.stripe.com';

function encodeForm(params) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) sp.append(k, String(v));
  }
  return sp.toString();
}

export function createStripeGpayProvider({
  publishableKey = '',
  secretKey = '',
  webhookSecret = '',
  merchantName = 'PlayHub',
  googlePayEnvironment = 'TEST', // 'TEST' | 'PRODUCTION'
  apiBaseUrl = STRIPE_API_BASE,
  fetchImpl = globalThis.fetch,
  now = Date.now
} = {}) {
  const configured = Boolean(publishableKey && secretKey);

  async function stripeRequest(endpoint, { method = 'POST', body = {}, idempotencyKey = null } = {}) {
    if (!configured) {
      throw new ApiError(503, 'STRIPE_GPAY_NOT_CONFIGURED', 'Stripe publishableKey/secretKey are not configured');
    }
    const headers = {
      Authorization: `Bearer ${secretKey}`
    };
    if (method !== 'GET') headers['Content-Type'] = 'application/x-www-form-urlencoded';
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

    let response;
    try {
      response = await fetchImpl(`${apiBaseUrl.replace(/\/$/, '')}${endpoint}`, {
        method,
        headers,
        body: method === 'GET' ? undefined : encodeForm(body)
      });
    } catch (err) {
      throw new ApiError(502, 'STRIPE_GPAY_NETWORK_ERROR', err.message || 'Failed to reach Stripe API');
    }

    const text = await response.text();
    let parsed = null;
    try { parsed = text ? JSON.parse(text) : null; } catch {}
    if (!response.ok) {
      const status = response.status >= 500 ? 502 : 422;
      throw new ApiError(status, parsed?.error?.code || 'STRIPE_GPAY_API_ERROR', parsed?.error?.message || `Stripe API HTTP ${response.status}`);
    }
    return parsed;
  }

  function buildGooglePayWebConfig(order) {
    const currency = String(order.currency).toUpperCase();
    const major = minorToMajorAmount(order.amount_minor, currency);
    const totalPrice = currency === 'KRW' || currency === 'JPY'
      ? String(Math.round(major))
      : major.toFixed(2);

    return {
      environment: googlePayEnvironment,
      googleFeePercent: 0,
      apiVersion: 2,
      apiVersionMinor: 0,
      merchantInfo: { merchantName },
      allowedPaymentMethods: [
        {
          type: 'CARD',
          parameters: {
            allowedAuthMethods: ['PAN_ONLY', 'CRYPTOGRAM_3DS'],
            allowedCardNetworks: ['VISA', 'MASTERCARD', 'AMEX', 'JCB']
          },
          tokenizationSpecification: {
            type: 'PAYMENT_GATEWAY',
            parameters: {
              gateway: 'stripe',
              'stripe:version': '2024-06-20',
              'stripe:publishableKey': publishableKey
            }
          }
        }
      ],
      transactionInfo: {
        totalPriceStatus: 'FINAL',
        totalPrice,
        currencyCode: currency
      }
    };
  }

  return {
    name: 'stripe_gpay',
    mode: googlePayEnvironment === 'PRODUCTION' ? 'live' : 'sandbox',
    googlePayEnvironment,
    configured,
    persistsTokenAtCheckout: true,
    supportsGooglePayWeb: true,

    async createCheckoutSession({ order, returnUrl, paymentMethodHint }) {
      const pi = await stripeRequest('/v1/payment_intents', {
        idempotencyKey: `pi-create:${order.id}`,
        body: {
          amount: order.amount_minor,
          currency: String(order.currency).toLowerCase(),
          'automatic_payment_methods[enabled]': 'true',
          description: `PlayCoin ${order.base_coins + order.bonus_coins} (${order.base_coins} + ${order.bonus_coins} bonus)`,
          'metadata[order_id]': order.id,
          'metadata[principal_id]': order.principal_id,
          'metadata[sku_id]': order.sku_id,
          'metadata[channel]': order.channel,
          'metadata[payment_method_hint]': paymentMethodHint || 'google_pay'
        }
      });

      return {
        provider: 'stripe_gpay',
        mode: googlePayEnvironment === 'PRODUCTION' ? 'live' : 'sandbox',
        publishableKey,
        clientSecret: pi.client_secret,
        providerPaymentId: pi.id,
        returnUrl: returnUrl || '/?view=billing',
        googlePayConfig: buildGooglePayWebConfig(order)
      };
    },

    async verifyPayment({ order, providerPaymentId }) {
      if (order.provider_payment_id && providerPaymentId && providerPaymentId !== order.provider_payment_id) {
        throw new ApiError(422, 'STRIPE_PAYMENT_INTENT_MISMATCH', 'PaymentIntent does not match order');
      }
      const piId = order.provider_payment_id || providerPaymentId;
      if (!safeString(piId, 200)) {
        throw new ApiError(422, 'STRIPE_PAYMENT_INTENT_REQUIRED');
      }

      const pi = await stripeRequest(`/v1/payment_intents/${encodeURIComponent(piId)}`, { method: 'GET' });
      if (order.provider_payment_id && pi.id !== order.provider_payment_id) {
        throw new ApiError(422, 'STRIPE_PAYMENT_INTENT_MISMATCH');
      }
      if (!pi.metadata?.order_id || pi.metadata.order_id !== order.id) {
        throw new ApiError(422, 'STRIPE_ORDER_ID_MISMATCH');
      }
      if (!pi.metadata?.principal_id || pi.metadata.principal_id !== order.principal_id) {
        throw new ApiError(403, 'STRIPE_PRINCIPAL_MISMATCH');
      }
      if (String(pi.currency || '').toUpperCase() !== String(order.currency).toUpperCase()) {
        throw new ApiError(422, 'STRIPE_CURRENCY_MISMATCH');
      }
      if (pi.status !== 'succeeded') {
        return {
          verified: false,
          pendingWebhook: true,
          providerPaymentId: pi.id,
          amountMinor: pi.amount_received || pi.amount,
          currency: String(pi.currency || order.currency).toUpperCase()
        };
      }
      if (Number(pi.amount_received) !== order.amount_minor) {
        throw new ApiError(422, 'STRIPE_AMOUNT_MISMATCH');
      }

      return {
        verified: true,
        pendingWebhook: false,
        providerPaymentId: pi.id,
        amountMinor: Number(pi.amount_received),
        currency: String(pi.currency).toUpperCase()
      };
    },

    verifyWebhookSignature({ rawBody, headers }) {
      if (!safeString(webhookSecret, 256)) {
        throw new ApiError(503, 'STRIPE_GPAY_WEBHOOK_SECRET_NOT_CONFIGURED');
      }
      const signatureHeader = headers['stripe-signature'] || headers['Stripe-Signature'] || '';
      verifyStripeWebhookSignature({
        rawBody,
        signatureHeader,
        secret: webhookSecret,
        now
      });
      return true;
    },

    parseWebhookEvent(payload) {
      if (!payload || typeof payload !== 'object' || !safeString(payload.type, 120) || !safeString(payload.id, 160)) {
        throw new ApiError(400, 'WEBHOOK_PAYLOAD_INVALID');
      }
      const obj = payload.data?.object || {};
      const orderId = obj.metadata?.order_id ? String(obj.metadata.order_id) : null;
      const principalId = obj.metadata?.principal_id ? String(obj.metadata.principal_id) : null;
      const currency = obj.currency ? String(obj.currency).toUpperCase() : null;

      if (payload.type === 'payment_intent.succeeded') {
        if (!safeString(obj.id, 200)) {
          throw new ApiError(400, 'STRIPE_PAYMENT_INTENT_ID_MISSING');
        }
        if (obj.status !== 'succeeded') {
          throw new ApiError(422, 'STRIPE_PAYMENT_NOT_SUCCEEDED');
        }
        if (!Number.isSafeInteger(obj.amount_received)) {
          throw new ApiError(422, 'STRIPE_AMOUNT_RECEIVED_INVALID');
        }
        return {
          externalEventId: `stripe_${payload.id}`,
          eventType: 'payment',
          orderId,
          principalId,
          providerPaymentId: String(obj.id),
          amountMinor: obj.amount_received,
          currency,
          reason: 'stripe_payment_succeeded'
        };
      }

      if (payload.type === 'charge.refunded') {
        return {
          externalEventId: `stripe_${payload.id}`,
          eventType: 'refund',
          orderId,
          principalId,
          providerPaymentId: obj.payment_intent ? String(obj.payment_intent) : (obj.id ? String(obj.id) : null),
          amountMinor: Number.isSafeInteger(obj.amount_refunded) ? obj.amount_refunded : null,
          currency,
          reason: obj.refunds?.data?.[0]?.reason || 'stripe_refund'
        };
      }

      if (payload.type === 'charge.dispute.created') {
        return {
          externalEventId: `stripe_${payload.id}`,
          eventType: 'chargeback',
          orderId,
          principalId,
          providerPaymentId: obj.payment_intent ? String(obj.payment_intent) : null,
          amountMinor: Number.isSafeInteger(obj.amount) ? obj.amount : null,
          currency,
          reason: obj.reason || 'stripe_dispute'
        };
      }

      throw new ApiError(400, 'STRIPE_WEBHOOK_EVENT_UNSUPPORTED', `Unsupported Stripe event: ${payload.type}`);
    },

    async refundPayment({ order, amountMinor, reason }) {
      if (!order.provider_payment_id) {
        throw new ApiError(409, 'PROVIDER_TRANSACTION_MISSING');
      }
      const refund = await stripeRequest('/v1/refunds', {
        idempotencyKey: `stripe-ref:${order.id}:${amountMinor}`,
        body: {
          payment_intent: order.provider_payment_id,
          amount: amountMinor,
          reason: 'requested_by_customer',
          'metadata[playhub_reason]': reason || 'customer_7d_withdrawal'
        }
      });
      return { ok: true, providerRefundId: refund.id };
    }
  };
}
