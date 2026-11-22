// Direct Korean EasyPay Adapter: KakaoPay Online Single Payment Open API v1.
// Official endpoints:
// - POST https://open-api.kakaopay.com/online/v1/payment/ready
// - POST https://open-api.kakaopay.com/online/v1/payment/approve
// - POST https://open-api.kakaopay.com/online/v1/payment/cancel
// Auth header: Authorization: SECRET_KEY <DEV_OR_PRD_SECRET_KEY>
// Sandbox CID default: TC0ONETIME

import { createHmac } from 'node:crypto';
import { ApiError, equal, safeString } from '../../security.mjs';

const KAKAOPAY_API_BASE = 'https://open-api.kakaopay.com';
const DEFAULT_SANDBOX_CID = 'TC0ONETIME';
const WEBHOOK_TOLERANCE_MS = 5 * 60_000;
const FETCH_TIMEOUT_MS = 12_000;

export function signKakaoPayWebhook({ rawBody, timestampMs, secret }) {
  const mac = createHmac('sha256', String(secret))
    .update(`${timestampMs}.${rawBody}`)
    .digest('hex');
  return {
    'x-kakaopay-timestamp': String(timestampMs),
    'x-kakaopay-signature': `sha256=${mac}`
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

export function createKakaoPayProvider({
  secretKey = '',
  cid = '',
  webhookSecret = '',
  sandbox = true,
  apiBaseUrl = KAKAOPAY_API_BASE,
  publicBaseUrl = '',
  fetchImpl = globalThis.fetch,
  now = Date.now
} = {}) {
  const effectiveCid = safeString(cid, 64) ? cid : (sandbox ? DEFAULT_SANDBOX_CID : '');
  const configured = Boolean(safeString(secretKey, 256) && effectiveCid);

  function authHeaders() {
    return {
      Authorization: `SECRET_KEY ${secretKey}`,
      'Content-Type': 'application/json'
    };
  }

  return {
    name: 'kakaopay',
    mode: sandbox ? 'sandbox' : 'live',
    configured,
    persistsTokenAtCheckout: true,
    supportedCurrencies: ['KRW'],

    async createCheckoutSession({ order, returnUrl, requestOrigin }) {
      if (!configured) {
        throw new ApiError(503, 'KAKAOPAY_NOT_CONFIGURED', 'KakaoPay secretKey/cid are not configured');
      }
      if (String(order.currency).toUpperCase() !== 'KRW') {
        throw new ApiError(422, 'KAKAOPAY_KRW_ONLY', 'KakaoPay adapter only supports KRW orders');
      }

      const origin = requestOrigin || publicBaseUrl || 'http://localhost:8080';
      const approvalUrl = buildAbsoluteReturnUrl(returnUrl, origin, {
        payProvider: 'kakaopay',
        payStatus: 'success',
        orderId: order.id
      });
      const cancelUrl = buildAbsoluteReturnUrl(returnUrl, origin, {
        payProvider: 'kakaopay',
        payStatus: 'cancel',
        orderId: order.id
      });
      const failUrl = buildAbsoluteReturnUrl(returnUrl, origin, {
        payProvider: 'kakaopay',
        payStatus: 'fail',
        orderId: order.id
      });

      const totalCoins = order.base_coins + order.bonus_coins;
      const itemName = `PlayCoin ${totalCoins.toLocaleString('ko-KR')} (${order.base_coins} + ${order.bonus_coins} 보너스)`;
      const endpoint = `${apiBaseUrl.replace(/\/$/, '')}/online/v1/payment/ready`;

      let response;
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: authHeaders(),
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          body: JSON.stringify({
            cid: effectiveCid,
            partner_order_id: order.id,
            partner_user_id: order.principal_id,
            item_name: itemName.slice(0, 100),
            quantity: 1,
            total_amount: order.amount_minor,
            tax_free_amount: 0,
            approval_url: approvalUrl,
            cancel_url: cancelUrl,
            fail_url: failUrl
          })
        });
      } catch (err) {
        throw new ApiError(502, 'KAKAOPAY_NETWORK_ERROR', err.message || 'Failed to reach KakaoPay API');
      }

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !safeString(data.tid, 200)) {
        const status = response.status >= 500 ? 502 : 422;
        throw new ApiError(
          status,
          data.error_code ? `KAKAOPAY_${data.error_code}` : 'KAKAOPAY_READY_FAILED',
          data.error_message || `KakaoPay ready failed (${response.status})`
        );
      }

      return {
        provider: 'kakaopay',
        mode: sandbox ? 'sandbox' : 'live',
        checkoutType: 'redirect',
        easyPayProvider: 'KAKAOPAY',
        orderId: order.id,
        amount: order.amount_minor,
        currency: 'KRW',
        providerPaymentId: String(data.tid),
        checkoutUrl: data.next_redirect_pc_url || data.next_redirect_mobile_url || null,
        mobileCheckoutUrl: data.next_redirect_mobile_url || data.next_redirect_pc_url || null,
        appCheckoutUrl: data.next_redirect_app_url || null,
        approvalUrl,
        cancelUrl,
        failUrl
      };
    },

    async verifyPayment({ order, providerPaymentId, pgToken }) {
      if (!configured) {
        throw new ApiError(503, 'KAKAOPAY_NOT_CONFIGURED');
      }
      if (!safeString(pgToken, 256)) {
        throw new ApiError(422, 'KAKAOPAY_PG_TOKEN_REQUIRED', 'KakaoPay pg_token is required to approve payment');
      }
      const storedTid = safeString(order.provider_payment_id, 200) ? order.provider_payment_id : '';
      const providedTid = safeString(providerPaymentId, 200) ? providerPaymentId : '';
      if (storedTid && providedTid && storedTid !== providedTid) {
        throw new ApiError(422, 'KAKAOPAY_TID_MISMATCH', 'Provided KakaoPay tid does not match order tid');
      }
      const tid = storedTid || providedTid;
      if (!tid) {
        throw new ApiError(422, 'KAKAOPAY_TID_REQUIRED', 'KakaoPay tid is missing for this order');
      }

      const endpoint = `${apiBaseUrl.replace(/\/$/, '')}/online/v1/payment/approve`;
      let response;
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: authHeaders(),
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          body: JSON.stringify({
            cid: effectiveCid,
            tid,
            partner_order_id: order.id,
            partner_user_id: order.principal_id,
            pg_token: pgToken
          })
        });
      } catch (err) {
        throw new ApiError(502, 'KAKAOPAY_NETWORK_ERROR', err.message || 'Failed to reach KakaoPay approve API');
      }

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const status = response.status >= 500 ? 502 : 422;
        throw new ApiError(
          status,
          data.error_code ? `KAKAOPAY_${data.error_code}` : 'KAKAOPAY_APPROVE_FAILED',
          data.error_message || `KakaoPay approve failed (${response.status})`
        );
      }

      // Zero Client Trust: strictly verify tid, partner_order_id, partner_user_id, and total amount.
      if (String(data.tid || '') !== tid) {
        throw new ApiError(422, 'KAKAOPAY_TID_MISMATCH');
      }
      if (String(data.partner_order_id || '') !== order.id) {
        throw new ApiError(422, 'KAKAOPAY_ORDER_ID_MISMATCH');
      }
      if (String(data.partner_user_id || '') !== order.principal_id) {
        throw new ApiError(422, 'KAKAOPAY_USER_MISMATCH');
      }
      const approvedTotal = Number(data.amount?.total);
      if (!Number.isSafeInteger(approvedTotal) || approvedTotal !== order.amount_minor) {
        throw new ApiError(422, 'KAKAOPAY_AMOUNT_MISMATCH');
      }

      return {
        verified: true,
        pendingWebhook: false,
        providerPaymentId: tid,
        providerApprovalId: data.aid ? String(data.aid) : null,
        amountMinor: approvedTotal,
        currency: 'KRW'
      };
    },

    verifyWebhookSignature({ rawBody, headers }) {
      if (!safeString(webhookSecret, 256)) {
        throw new ApiError(503, 'KAKAOPAY_WEBHOOK_SECRET_MISSING');
      }
      const tsHeader = headers['x-kakaopay-timestamp'];
      const sigHeader = headers['x-kakaopay-signature'];
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
      const status = String(payload.status || payload.eventType || '').toUpperCase();
      const tid = payload.tid ? String(payload.tid) : null;
      const orderId = payload.partner_order_id ? String(payload.partner_order_id) : (payload.orderId ? String(payload.orderId) : null);
      const principalId = payload.partner_user_id ? String(payload.partner_user_id) : null;
      const externalEventId = payload.eventId
        ? `kakaopay_${payload.eventId}`
        : `kakaopay_${payload.aid || tid || orderId}_${status}`;

      if (status === 'SUCCESS_PAYMENT' || status === 'APPROVED' || status === 'PAYMENT') {
        const total = Number(payload.amount?.total ?? payload.total_amount);
        return {
          externalEventId,
          eventType: 'payment',
          orderId,
          principalId,
          providerPaymentId: tid,
          amountMinor: Number.isSafeInteger(total) ? total : null,
          currency: 'KRW',
          reason: 'kakaopay_approved'
        };
      }

      if (status === 'CANCEL_PAYMENT' || status === 'PART_CANCEL_PAYMENT' || status === 'REFUND') {
        const cancelAmount = Number(payload.approved_cancel_amount?.total ?? payload.cancel_amount ?? payload.amount?.total);
        return {
          externalEventId,
          eventType: 'refund',
          orderId,
          principalId,
          providerPaymentId: tid,
          amountMinor: Number.isSafeInteger(cancelAmount) ? cancelAmount : null,
          currency: 'KRW',
          reason: payload.reason || 'kakaopay_canceled'
        };
      }

      throw new ApiError(400, 'KAKAOPAY_WEBHOOK_EVENT_UNSUPPORTED', `Unsupported KakaoPay event: ${status}`);
    },

    async refundPayment({ order, amountMinor, reason }) {
      if (!configured) {
        throw new ApiError(503, 'KAKAOPAY_NOT_CONFIGURED');
      }
      if (!order.provider_payment_id) {
        throw new ApiError(409, 'PROVIDER_TRANSACTION_MISSING');
      }

      const endpoint = `${apiBaseUrl.replace(/\/$/, '')}/online/v1/payment/cancel`;
      let response;
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: authHeaders(),
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          body: JSON.stringify({
            cid: effectiveCid,
            tid: order.provider_payment_id,
            cancel_amount: amountMinor,
            cancel_tax_free_amount: 0,
            payload: reason || 'customer_7d_withdrawal'
          })
        });
      } catch (err) {
        throw new ApiError(502, 'KAKAOPAY_NETWORK_ERROR', err.message || 'Failed to reach KakaoPay cancel API');
      }

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new ApiError(
          502,
          data.error_code ? `KAKAOPAY_${data.error_code}` : 'KAKAOPAY_REFUND_FAILED',
          data.error_message || `KakaoPay cancel failed (${response.status})`
        );
      }
      if (data.status && !['CANCEL_PAYMENT', 'PART_CANCEL_PAYMENT'].includes(String(data.status).toUpperCase())) {
        throw new ApiError(502, 'KAKAOPAY_REFUND_INCOMPLETE', `Unexpected KakaoPay cancel status: ${data.status}`);
      }

      return {
        ok: true,
        providerRefundId: data.aid ? String(data.aid) : `kakaopay_cancel_${order.id}`
      };
    }
  };
}
