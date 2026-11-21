// Stage 2 Korean KRW PG Adapter: Toss Payments (Track A 1P PlayCoin Billing).
// Routes domestic KRW web/PC payments (~3.3% fee, KakaoPay/NaverPay/TossPay/Korean cards)
// while keeping PlayHub as 100% SSOT for SKUs, up-to-25% bonus, and Double-Entry ledger.
// Falls back to Xsolla automatically via router.mjs circuit breaker on outage.

import { createHmac } from 'node:crypto';
import { ApiError, equal, safeString } from '../../security.mjs';

const TOSS_API_BASE = 'https://api.tosspayments.com';
const WEBHOOK_TOLERANCE_MS = 5 * 60_000;

export function signTossWebhook({ rawBody, transmissionTime, secret }) {
  const mac = createHmac('sha256', String(secret))
    .update(`${rawBody}:${transmissionTime}`)
    .digest('base64');
  return `v1:${mac}`;
}

export function createTossProvider({
  clientKey = '',
  secretKey = '',
  webhookSecret = '',
  sandbox = true,
  apiBaseUrl = TOSS_API_BASE,
  fetchImpl = globalThis.fetch,
  now = Date.now
} = {}) {
  const configured = Boolean(clientKey && secretKey);

  function authHeader() {
    // Toss Payments Basic Auth encodes "<secretKey>:" in Base64.
    return `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`;
  }

  function mapPaymentMethod(hint) {
    const h = String(hint || '').toLowerCase();
    if (h === 'kakaopay') return { method: 'CARD', easyPay: 'KAKAOPAY' };
    if (h === 'naverpay') return { method: 'CARD', easyPay: 'NAVERPAY' };
    if (h === 'tosspay') return { method: 'CARD', easyPay: 'TOSSPAY' };
    if (h === 'bank_transfer') return { method: 'TRANSFER', easyPay: null };
    return { method: 'CARD', easyPay: null };
  }

  return {
    name: 'toss',
    mode: sandbox ? 'sandbox' : 'live',
    configured,
    supportedCurrencies: ['KRW'],

    async createCheckoutSession({ order, userDisplayName, returnUrl, paymentMethodHint }) {
      if (!configured) {
        throw new ApiError(503, 'TOSS_NOT_CONFIGURED', 'Toss Payments clientKey/secretKey are not configured');
      }
      if (String(order.currency).toUpperCase() !== 'KRW') {
        throw new ApiError(422, 'TOSS_KRW_ONLY', 'Toss Payments adapter only supports KRW orders');
      }

      const methodSpec = mapPaymentMethod(paymentMethodHint);
      const sep = String(returnUrl || '/?view=billing').includes('?') ? '&' : '?';
      const baseReturn = returnUrl || '/?view=billing';

      return {
        provider: 'toss',
        mode: sandbox ? 'sandbox' : 'live',
        clientKey,
        orderId: order.id,
        orderName: `PlayCoin ${(order.base_coins + order.bonus_coins).toLocaleString('ko-KR')} (${order.base_coins} + ${order.bonus_coins} 보너스)`,
        amount: order.amount_minor,
        currency: 'KRW',
        customerKey: order.principal_id,
        customerName: userDisplayName || 'PlayHub User',
        method: methodSpec.method,
        easyPayProvider: methodSpec.easyPay,
        successUrl: `${baseReturn}${sep}tossStatus=success&orderId=${encodeURIComponent(order.id)}`,
        failUrl: `${baseReturn}${sep}tossStatus=fail&orderId=${encodeURIComponent(order.id)}`,
        providerPaymentId: null
      };
    },

    async verifyPayment({ order, providerPaymentId }) {
      if (!configured) {
        throw new ApiError(503, 'TOSS_NOT_CONFIGURED');
      }
      if (!safeString(providerPaymentId, 200)) {
        throw new ApiError(422, 'TOSS_PAYMENT_KEY_REQUIRED', 'Toss paymentKey is required to confirm payment');
      }

      const endpoint = `${apiBaseUrl.replace(/\/$/, '')}/v1/payments/confirm`;
      let response;
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            Authorization: authHeader(),
            'Content-Type': 'application/json',
            'Idempotency-Key': `toss-confirm:${order.id}`
          },
          body: JSON.stringify({
            paymentKey: providerPaymentId,
            orderId: order.id,
            amount: order.amount_minor
          })
        });
      } catch (err) {
        throw new ApiError(502, 'TOSS_NETWORK_ERROR', err.message || 'Failed to reach Toss Payments API');
      }

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const status = response.status >= 500 ? 502 : 422;
        throw new ApiError(status, data.code || 'TOSS_CONFIRM_FAILED', data.message || `Toss confirm failed (${response.status})`);
      }

      // Zero Client Trust: strictly verify server response matches orderId, KRW amount, and DONE status.
      if (data.orderId !== order.id) {
        throw new ApiError(422, 'TOSS_ORDER_ID_MISMATCH');
      }
      if (Number(data.totalAmount) !== order.amount_minor) {
        throw new ApiError(422, 'TOSS_AMOUNT_MISMATCH');
      }
      if (data.status !== 'DONE') {
        return {
          verified: false,
          pendingWebhook: true,
          providerPaymentId: data.paymentKey || providerPaymentId,
          amountMinor: Number(data.totalAmount),
          currency: 'KRW'
        };
      }

      return {
        verified: true,
        pendingWebhook: false,
        providerPaymentId: data.paymentKey || providerPaymentId,
        amountMinor: Number(data.totalAmount),
        currency: 'KRW'
      };
    },

    verifyWebhookSignature({ rawBody, headers }) {
      const secret = webhookSecret || secretKey;
      if (!safeString(secret, 256)) {
        throw new ApiError(503, 'TOSS_WEBHOOK_SECRET_MISSING');
      }
      const sigHeader = headers['tosspayments-webhook-signature'];
      const transmissionTime = headers['tosspayments-webhook-transmission-time'];
      if (typeof sigHeader !== 'string' || !sigHeader.trim() || typeof transmissionTime !== 'string' || !transmissionTime.trim()) {
        throw new ApiError(401, 'WEBHOOK_SIGNATURE_MISSING');
      }

      const parsedTime = Date.parse(transmissionTime);
      if (Number.isNaN(parsedTime) || Math.abs(now() - parsedTime) > WEBHOOK_TOLERANCE_MS) {
        throw new ApiError(401, 'WEBHOOK_TIMESTAMP_OUT_OF_RANGE');
      }

      const expected = signTossWebhook({ rawBody, transmissionTime, secret });
      const candidates = sigHeader.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
      const matched = candidates.some(candidate => equal(candidate, expected));
      if (!matched) {
        throw new ApiError(401, 'WEBHOOK_SIGNATURE_INVALID');
      }
      return true;
    },

    parseWebhookEvent(payload) {
      if (!payload || typeof payload !== 'object') {
        throw new ApiError(400, 'WEBHOOK_BODY_INVALID');
      }
      const eventTypeRaw = String(payload.eventType || '');
      const data = payload.data || {};
      const paymentKey = data.paymentKey ? String(data.paymentKey) : null;
      const orderId = data.orderId ? String(data.orderId) : null;
      const status = String(data.status || '').toUpperCase();
      const amountMinor = Number.isSafeInteger(data.totalAmount) ? data.totalAmount : null;
      const externalEventId = payload.transmissionId
        ? `toss_${payload.transmissionId}`
        : `toss_${paymentKey || orderId}_${status}`;

      if (eventTypeRaw === 'PAYMENT_STATUS_CHANGED' && status === 'DONE') {
        return {
          externalEventId,
          eventType: 'payment',
          orderId,
          providerPaymentId: paymentKey,
          amountMinor,
          currency: 'KRW',
          reason: 'toss_payment_done'
        };
      }

      if (eventTypeRaw === 'PAYMENT_STATUS_CHANGED' && (status === 'CANCELED' || status === 'PARTIAL_CANCELED')) {
        const lastCancel = Array.isArray(data.cancels) && data.cancels.length
          ? data.cancels[data.cancels.length - 1]
          : null;
        return {
          externalEventId,
          eventType: 'refund',
          orderId,
          providerPaymentId: paymentKey,
          amountMinor: Number.isSafeInteger(lastCancel?.cancelAmount) ? lastCancel.cancelAmount : amountMinor,
          currency: 'KRW',
          reason: lastCancel?.cancelReason || 'toss_payment_canceled'
        };
      }

      throw new ApiError(400, 'TOSS_WEBHOOK_EVENT_UNSUPPORTED', `Unsupported Toss event: ${eventTypeRaw}/${status}`);
    },

    async refundPayment({ order, amountMinor, reason }) {
      if (!configured) {
        throw new ApiError(503, 'TOSS_NOT_CONFIGURED');
      }
      if (!order.provider_payment_id) {
        throw new ApiError(409, 'PROVIDER_TRANSACTION_MISSING');
      }
      const endpoint = `${apiBaseUrl.replace(/\/$/, '')}/v1/payments/${encodeURIComponent(order.provider_payment_id)}/cancel`;
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          Authorization: authHeader(),
          'Content-Type': 'application/json',
          'Idempotency-Key': `toss-cancel:${order.id}:${amountMinor}`
        },
        body: JSON.stringify({
          cancelReason: reason || 'customer_7d_withdrawal',
          cancelAmount: amountMinor
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new ApiError(502, data.code || 'TOSS_REFUND_FAILED', data.message || `Toss cancel failed (${response.status})`);
      }
      const txKey = data.cancels?.[data.cancels.length - 1]?.transactionKey || `toss_cancel_${order.id}`;
      return { ok: true, providerRefundId: txKey };
    }
  };
}
