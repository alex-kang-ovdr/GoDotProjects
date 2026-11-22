// Direct Korean EasyPay Adapter: NaverPay Payment API v2.2 + JS SDK v1.
// Official endpoints:
// - Client SDK: https://nsp.pay.naver.com/sdk/js/naverpay.min.js (Naver.Pay.create -> oPay.open)
// - Approve:    POST https://dev-pub.apis.naver.com/{partnerId}/naverpay/payments/v2.2/apply/payment
//               (live: https://apis.naver.com/{partnerId}/naverpay/payments/v2.2/apply/payment)
// - Cancel:     POST https://dev-pub.apis.naver.com/{partnerId}/naverpay/payments/v1/cancel
// Auth headers: X-Naver-Client-Id, X-Naver-Client-Secret, X-NaverPay-Chain-Id (group merchants), X-NaverPay-Idempotency-Key

import { createHmac } from 'node:crypto';
import { ApiError, equal, safeString } from '../../security.mjs';

const NAVERPAY_SANDBOX_API_BASE = 'https://dev-pub.apis.naver.com';
const NAVERPAY_LIVE_API_BASE = 'https://apis.naver.com';
const NAVERPAY_SDK_URL = 'https://nsp.pay.naver.com/sdk/js/naverpay.min.js';
const WEBHOOK_TOLERANCE_MS = 5 * 60_000;
const FETCH_TIMEOUT_MS = 12_000;

export function signNaverPayWebhook({ rawBody, timestampMs, secret }) {
  const mac = createHmac('sha256', String(secret))
    .update(`${timestampMs}.${rawBody}`)
    .digest('hex');
  return {
    'x-naverpay-timestamp': String(timestampMs),
    'x-naverpay-signature': `sha256=${mac}`
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

export function createNaverPayProvider({
  clientId = '',
  clientSecret = '',
  partnerId = '',
  chainId = '',
  webhookSecret = '',
  sandbox = true,
  apiBaseUrl = '',
  sdkUrl = NAVERPAY_SDK_URL,
  publicBaseUrl = '',
  fetchImpl = globalThis.fetch,
  now = Date.now
} = {}) {
  const effectiveApiBase = (apiBaseUrl || (sandbox ? NAVERPAY_SANDBOX_API_BASE : NAVERPAY_LIVE_API_BASE)).replace(/\/$/, '');
  const configured = Boolean(
    safeString(clientId, 128) &&
    safeString(clientSecret, 256) &&
    safeString(partnerId, 128)
  );

  function authHeaders(idempotencyKey) {
    const h = {
      'X-Naver-Client-Id': clientId,
      'X-Naver-Client-Secret': clientSecret,
      'Content-Type': 'application/x-www-form-urlencoded'
    };
    if (safeString(chainId, 128)) {
      h['X-NaverPay-Chain-Id'] = chainId;
    }
    if (idempotencyKey) {
      h['X-NaverPay-Idempotency-Key'] = idempotencyKey;
    }
    return h;
  }

  return {
    name: 'naverpay',
    mode: sandbox ? 'sandbox' : 'live',
    configured,
    supportedCurrencies: ['KRW'],

    async createCheckoutSession({ order, returnUrl, requestOrigin }) {
      if (!configured) {
        throw new ApiError(503, 'NAVERPAY_NOT_CONFIGURED', 'NaverPay clientId/clientSecret/partnerId are not configured');
      }
      if (String(order.currency).toUpperCase() !== 'KRW') {
        throw new ApiError(422, 'NAVERPAY_KRW_ONLY', 'NaverPay adapter only supports KRW orders');
      }

      const origin = requestOrigin || publicBaseUrl || 'http://localhost:8080';
      const callbackUrl = buildAbsoluteReturnUrl(returnUrl, origin, {
        payProvider: 'naverpay',
        orderId: order.id
      });
      const totalCoins = order.base_coins + order.bonus_coins;
      const productName = `PlayCoin ${totalCoins.toLocaleString('ko-KR')} (${order.base_coins} + ${order.bonus_coins} 보너스)`;

      // NaverPay Payment JS SDK launches directly from the top-level window and returns paymentId to returnUrl.
      return {
        provider: 'naverpay',
        mode: sandbox ? 'sandbox' : 'live',
        checkoutType: 'naverpay_sdk',
        easyPayProvider: 'NAVERPAY',
        sdkUrl,
        sdkMode: sandbox ? 'development' : 'production',
        clientId,
        chainId: safeString(chainId, 128) ? chainId : null,
        merchantPayKey: order.id,
        merchantUserKey: order.principal_id,
        productName: productName.slice(0, 128),
        productCount: 1,
        totalPayAmount: order.amount_minor,
        taxScopeAmount: order.amount_minor,
        taxExScopeAmount: 0,
        currency: 'KRW',
        returnUrl: callbackUrl,
        productItems: [
          {
            categoryType: 'ETC',
            categoryId: 'ETC',
            uid: order.sku_id,
            name: productName.slice(0, 128),
            count: 1
          }
        ],
        providerPaymentId: null
      };
    },

    async verifyPayment({ order, providerPaymentId }) {
      if (!configured) {
        throw new ApiError(503, 'NAVERPAY_NOT_CONFIGURED');
      }
      const paymentId = safeString(providerPaymentId, 200) ? providerPaymentId : '';
      if (!paymentId) {
        throw new ApiError(422, 'NAVERPAY_PAYMENT_ID_REQUIRED', 'NaverPay paymentId is required to apply payment');
      }

      const endpoint = `${effectiveApiBase}/${encodeURIComponent(partnerId)}/naverpay/payments/v2.2/apply/payment`;
      const formBody = new URLSearchParams({ paymentId }).toString();

      let response;
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: authHeaders(`naverpay-apply:${order.id}`),
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          body: formBody
        });
      } catch (err) {
        throw new ApiError(502, 'NAVERPAY_NETWORK_ERROR', err.message || 'Failed to reach NaverPay apply API');
      }

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const status = response.status >= 500 ? 502 : 422;
        throw new ApiError(status, data.code || 'NAVERPAY_APPLY_FAILED', data.message || `NaverPay apply failed (${response.status})`);
      }

      if (data.code !== 'Success') {
        throw new ApiError(422, `NAVERPAY_${data.code || 'APPLY_FAILED'}`, data.message || 'NaverPay payment approval failed');
      }

      const detail = data.body?.detail || {};
      const respPaymentId = String(detail.paymentId || data.body?.paymentId || '');
      if (respPaymentId !== paymentId) {
        throw new ApiError(422, 'NAVERPAY_PAYMENT_ID_MISMATCH');
      }
      if (String(detail.merchantPayKey || '') !== order.id) {
        throw new ApiError(422, 'NAVERPAY_ORDER_ID_MISMATCH');
      }
      const paidAmount = Number(detail.totalPayAmount);
      if (!Number.isSafeInteger(paidAmount) || paidAmount !== order.amount_minor) {
        throw new ApiError(422, 'NAVERPAY_AMOUNT_MISMATCH');
      }
      if (detail.admissionState && String(detail.admissionState).toUpperCase() !== 'SUCCESS') {
        return {
          verified: false,
          pendingWebhook: true,
          providerPaymentId: paymentId,
          amountMinor: paidAmount,
          currency: 'KRW'
        };
      }

      return {
        verified: true,
        pendingWebhook: false,
        providerPaymentId: paymentId,
        amountMinor: paidAmount,
        currency: 'KRW'
      };
    },

    verifyWebhookSignature({ rawBody, headers }) {
      if (!safeString(webhookSecret, 256)) {
        throw new ApiError(503, 'NAVERPAY_WEBHOOK_SECRET_MISSING');
      }
      const tsHeader = headers['x-naverpay-timestamp'];
      const sigHeader = headers['x-naverpay-signature'];
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
      const detail = payload.body?.detail || payload.detail || payload;
      const state = String(payload.eventType || detail.admissionState || payload.status || '').toUpperCase();
      const paymentId = detail.paymentId ? String(detail.paymentId) : null;
      const orderId = detail.merchantPayKey ? String(detail.merchantPayKey) : (payload.orderId ? String(payload.orderId) : null);
      const amount = Number(detail.totalPayAmount ?? payload.cancelAmount);
      const externalEventId = payload.eventId
        ? `naverpay_${payload.eventId}`
        : `naverpay_${paymentId || orderId}_${state}`;

      if (state === 'SUCCESS' || state === 'PAYMENT_APPROVED' || state === 'PAYMENT') {
        return {
          externalEventId,
          eventType: 'payment',
          orderId,
          providerPaymentId: paymentId,
          amountMinor: Number.isSafeInteger(amount) ? amount : null,
          currency: 'KRW',
          reason: 'naverpay_success'
        };
      }

      if (state === 'CANCELED' || state === 'CANCEL' || state === 'REFUND') {
        return {
          externalEventId,
          eventType: 'refund',
          orderId,
          providerPaymentId: paymentId,
          amountMinor: Number.isSafeInteger(amount) ? amount : null,
          currency: 'KRW',
          reason: detail.cancelReason || payload.reason || 'naverpay_canceled'
        };
      }

      throw new ApiError(400, 'NAVERPAY_WEBHOOK_EVENT_UNSUPPORTED', `Unsupported NaverPay event: ${state}`);
    },

    async refundPayment({ order, amountMinor, reason }) {
      if (!configured) {
        throw new ApiError(503, 'NAVERPAY_NOT_CONFIGURED');
      }
      if (!order.provider_payment_id) {
        throw new ApiError(409, 'PROVIDER_TRANSACTION_MISSING');
      }

      const endpoint = `${effectiveApiBase}/${encodeURIComponent(partnerId)}/naverpay/payments/v1/cancel`;
      const formBody = new URLSearchParams({
        paymentId: order.provider_payment_id,
        cancelAmount: String(amountMinor),
        taxScopeAmount: String(amountMinor),
        taxExScopeAmount: '0',
        cancelReason: String(reason || 'customer_7d_withdrawal').slice(0, 256),
        cancelRequester: '1'
      }).toString();

      let response;
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: authHeaders(`naverpay-cancel:${order.id}:${amountMinor}`),
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          body: formBody
        });
      } catch (err) {
        throw new ApiError(502, 'NAVERPAY_NETWORK_ERROR', err.message || 'Failed to reach NaverPay cancel API');
      }

      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.code !== 'Success') {
        // CancelNotComplete must be treated as retryable 502 so REFUND_PENDING unlocks cleanly.
        const errCode = data.code === 'CancelNotComplete' ? 'NAVERPAY_CANCEL_NOT_COMPLETE' : (data.code || 'NAVERPAY_REFUND_FAILED');
        throw new ApiError(502, errCode, data.message || `NaverPay cancel failed (${response.status})`);
      }

      return {
        ok: true,
        providerRefundId: data.body?.payHistId ? String(data.body.payHistId) : `naverpay_cancel_${order.id}`
      };
    }
  };
}
