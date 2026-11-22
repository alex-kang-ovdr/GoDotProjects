// Direct Korean EasyPay Adapter: TossPay (토스페이 직가맹 API v2 — https://pay.toss.im).
// Distinct from Toss Payments PG (toss.mjs / api.tosspayments.com).
// Official endpoints:
// - POST https://pay.toss.im/api/v2/payments (returns payToken + checkoutPage)
// - POST https://pay.toss.im/api/v2/execute  (approves payToken when autoExecute=false)
// - POST https://pay.toss.im/api/v2/refunds  (full or partial refund by payToken)

import { createHmac } from 'node:crypto';
import { ApiError, equal, safeString } from '../../security.mjs';

const TOSSPAY_API_BASE = 'https://pay.toss.im';
const WEBHOOK_TOLERANCE_MS = 5 * 60_000;
const FETCH_TIMEOUT_MS = 12_000;

export function signTossPayWebhook({ rawBody, timestampMs, secret }) {
  const mac = createHmac('sha256', String(secret))
    .update(`${timestampMs}.${rawBody}`)
    .digest('hex');
  return {
    'x-tosspay-timestamp': String(timestampMs),
    'x-tosspay-signature': `sha256=${mac}`
  };
}

function buildAbsoluteReturnUrl(returnUrl, baseOrigin, params) {
  const fallbackOrigin = safeString(baseOrigin, 256) ? baseOrigin : 'http://localhost:8080';
  let base;
  try {
    base = new URL(fallbackOrigin);
  } catch {
    base = new URL('http://localhost:8080');
  }
  let url;
  try {
    url = new URL(returnUrl || '/?view=wallet', base);
  } catch {
    url = new URL('/?view=wallet', base);
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.origin !== base.origin) {
    throw new ApiError(400, 'INVALID_RETURN_URL');
  }
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  return url.toString();
}

export function createTossPayProvider({
  apiKey = '',
  webhookSecret = '',
  resultCallbackUrl = '',
  sandbox = true,
  apiBaseUrl = TOSSPAY_API_BASE,
  publicBaseUrl = '',
  fetchImpl = globalThis.fetch,
  now = Date.now
} = {}) {
  const configured = Boolean(safeString(apiKey, 256));

  return {
    name: 'tosspay',
    mode: sandbox ? 'sandbox' : 'live',
    configured,
    persistsTokenAtCheckout: true,
    supportedCurrencies: ['KRW'],

    async createCheckoutSession({ order, returnUrl, requestOrigin }) {
      if (!configured) {
        throw new ApiError(503, 'TOSSPAY_NOT_CONFIGURED', 'TossPay apiKey is not configured');
      }
      if (String(order.currency).toUpperCase() !== 'KRW') {
        throw new ApiError(422, 'TOSSPAY_KRW_ONLY', 'TossPay adapter only supports KRW orders');
      }

      const origin = requestOrigin || publicBaseUrl || 'http://localhost:8080';
      const retUrl = buildAbsoluteReturnUrl(returnUrl, origin, {
        payProvider: 'tosspay',
        payStatus: 'success',
        orderId: order.id
      });
      const retCancelUrl = buildAbsoluteReturnUrl(returnUrl, origin, {
        payProvider: 'tosspay',
        payStatus: 'cancel',
        orderId: order.id
      });
      const callbackUrl = safeString(resultCallbackUrl, 512)
        ? resultCallbackUrl
        : new URL('/api/billing/webhooks/tosspay', origin).toString();

      const totalCoins = order.base_coins + order.bonus_coins;
      const productDesc = `PlayCoin ${totalCoins.toLocaleString('ko-KR')} (${order.base_coins} + ${order.bonus_coins} 보너스)`;
      const endpoint = `${apiBaseUrl.replace(/\/$/, '')}/api/v2/payments`;

      let response;
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          body: JSON.stringify({
            orderNo: order.id,
            amount: order.amount_minor,
            amountTaxFree: 0,
            productDesc: productDesc.slice(0, 255),
            apiKey,
            autoExecute: false,
            resultCallback: callbackUrl,
            callbackVersion: 'V2',
            retUrl,
            retCancelUrl
          })
        });
      } catch (err) {
        throw new ApiError(502, 'TOSSPAY_NETWORK_ERROR', err.message || 'Failed to reach TossPay create API');
      }

      const data = await response.json().catch(() => ({}));
      if (!response.ok || Number(data.code) !== 0 || !safeString(data.payToken, 200) || !safeString(data.checkoutPage, 512)) {
        const status = response.status >= 500 ? 502 : 422;
        throw new ApiError(
          status,
          data.errorCode ? `TOSSPAY_${data.errorCode}` : 'TOSSPAY_CREATE_FAILED',
          data.msg || `TossPay payment creation failed (${response.status})`
        );
      }

      return {
        provider: 'tosspay',
        mode: sandbox ? 'sandbox' : 'live',
        checkoutType: 'redirect',
        easyPayProvider: 'TOSSPAY',
        orderId: order.id,
        amount: order.amount_minor,
        currency: 'KRW',
        providerPaymentId: String(data.payToken),
        checkoutUrl: String(data.checkoutPage),
        retUrl,
        retCancelUrl
      };
    },

    async verifyPayment({ order, providerPaymentId }) {
      if (!configured) {
        throw new ApiError(503, 'TOSSPAY_NOT_CONFIGURED');
      }
      const storedToken = safeString(order.provider_payment_id, 200) ? order.provider_payment_id : '';
      const providedToken = safeString(providerPaymentId, 200) ? providerPaymentId : '';
      if (storedToken && providedToken && storedToken !== providedToken) {
        throw new ApiError(422, 'TOSSPAY_TOKEN_MISMATCH', 'Provided TossPay payToken does not match order payToken');
      }
      const payToken = storedToken || providedToken;
      if (!payToken) {
        throw new ApiError(422, 'TOSSPAY_TOKEN_REQUIRED', 'TossPay payToken is required to execute payment');
      }

      const endpoint = `${apiBaseUrl.replace(/\/$/, '')}/api/v2/execute`;
      let response;
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          body: JSON.stringify({
            apiKey,
            payToken,
            orderNo: order.id
          })
        });
      } catch (err) {
        throw new ApiError(502, 'TOSSPAY_NETWORK_ERROR', err.message || 'Failed to reach TossPay execute API');
      }

      const data = await response.json().catch(() => ({}));
      if (!response.ok || Number(data.code) !== 0) {
        const status = response.status >= 500 ? 502 : 422;
        throw new ApiError(
          status,
          data.errorCode ? `TOSSPAY_${data.errorCode}` : 'TOSSPAY_EXECUTE_FAILED',
          data.msg || `TossPay execute failed (${response.status})`
        );
      }

      // Zero Client Trust: strictly verify orderNo, amount, and PAY_COMPLETE status.
      if (String(data.orderNo || '') !== order.id) {
        throw new ApiError(422, 'TOSSPAY_ORDER_ID_MISMATCH');
      }
      const paidAmount = Number(data.amount);
      if (!Number.isSafeInteger(paidAmount) || paidAmount !== order.amount_minor) {
        throw new ApiError(422, 'TOSSPAY_AMOUNT_MISMATCH');
      }
      const status = String(data.status || 'PAY_COMPLETE').toUpperCase();
      if (status !== 'PAY_COMPLETE') {
        return {
          verified: false,
          pendingWebhook: true,
          providerPaymentId: payToken,
          amountMinor: paidAmount,
          currency: 'KRW'
        };
      }

      return {
        verified: true,
        pendingWebhook: false,
        providerPaymentId: payToken,
        providerTransactionId: data.transactionId ? String(data.transactionId) : null,
        amountMinor: paidAmount,
        currency: 'KRW'
      };
    },

    verifyWebhookSignature({ rawBody, headers }) {
      if (!safeString(webhookSecret, 256)) {
        throw new ApiError(503, 'TOSSPAY_WEBHOOK_SECRET_MISSING');
      }
      const tsHeader = headers['x-tosspay-timestamp'];
      const sigHeader = headers['x-tosspay-signature'];
      if (typeof tsHeader !== 'string' || !tsHeader.trim() || typeof sigHeader !== 'string' || !sigHeader.trim()) {
        throw new ApiError(401, 'WEBHOOK_SIGNATURE_MISSING');
      }
      const ts = Number(tsHeader);
      if (!Number.isFinite(ts) || Math.abs(now() - ts) > WEBHOOK_TOLERANCE_MS) {
        throw new ApiError(401, 'WEBHOOK_TIMESTAMP_OUT_OF_RANGE');
      }
      const expected = `sha256=${createHmac('sha256', String(webhookSecret)).update(`${tsHeader}.${rawBody}`).digest('hex')}`;
      if (!equal(sigHeader.trim(), expected)) {
        throw new ApiError(401, 'WEBHOOK_SIGNATURE_INVALID');
      }
      return true;
    },

    parseWebhookEvent(payload) {
      if (!payload || typeof payload !== 'object') {
        throw new ApiError(400, 'WEBHOOK_BODY_INVALID');
      }
      const status = String(payload.status || '').toUpperCase();
      const payToken = payload.payToken ? String(payload.payToken) : null;
      const orderId = payload.orderNo ? String(payload.orderNo) : null;
      const amount = Number(payload.amount ?? payload.discountedAmount);
      const externalEventId = payload.transactionId
        ? `tosspay_${payload.transactionId}_${status}`
        : `tosspay_${payToken || orderId}_${status}`;

      if (status === 'PAY_COMPLETE') {
        return {
          externalEventId,
          eventType: 'payment',
          orderId,
          providerPaymentId: payToken,
          amountMinor: Number.isSafeInteger(amount) ? amount : null,
          currency: 'KRW',
          reason: 'tosspay_pay_complete'
        };
      }

      if (status === 'REFUND_SUCCESS') {
        return {
          externalEventId,
          eventType: 'refund',
          orderId,
          providerPaymentId: payToken,
          amountMinor: Number.isSafeInteger(amount) ? amount : null,
          currency: 'KRW',
          reason: payload.reason || 'tosspay_refund_success'
        };
      }

      throw new ApiError(400, 'TOSSPAY_WEBHOOK_EVENT_UNSUPPORTED', `Unsupported TossPay event: ${status}`);
    },

    async refundPayment({ order, amountMinor, reason }) {
      if (!configured) {
        throw new ApiError(503, 'TOSSPAY_NOT_CONFIGURED');
      }
      if (!order.provider_payment_id) {
        throw new ApiError(409, 'PROVIDER_TRANSACTION_MISSING');
      }

      const refundNo = `ref_${order.id.slice(0, 20)}_${amountMinor}`;
      const endpoint = `${apiBaseUrl.replace(/\/$/, '')}/api/v2/refunds`;

      let response;
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          body: JSON.stringify({
            apiKey,
            payToken: order.provider_payment_id,
            refundNo,
            amount: amountMinor,
            amountTaxFree: 0,
            reason: String(reason || 'customer_7d_withdrawal').slice(0, 255)
          })
        });
      } catch (err) {
        throw new ApiError(502, 'TOSSPAY_NETWORK_ERROR', err.message || 'Failed to reach TossPay refund API');
      }

      const data = await response.json().catch(() => ({}));
      if (!response.ok || Number(data.code) !== 0) {
        throw new ApiError(
          502,
          data.errorCode ? `TOSSPAY_${data.errorCode}` : 'TOSSPAY_REFUND_FAILED',
          data.msg || `TossPay refund failed (${response.status})`
        );
      }

      return {
        ok: true,
        providerRefundId: data.refundNo ? String(data.refundNo) : refundNo
      };
    }
  };
}
