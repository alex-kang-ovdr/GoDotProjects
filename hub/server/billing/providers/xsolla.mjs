// Xsolla Pay Station (Merchant of Record) adapter for Track A 1P PlayCoin billing.
// Keeps PlayHub as 100% SSOT for SKUs, up-to-25% bonus calculation, and Double-Entry ledger
// by passing exact checkout amount/currency and custom_parameters (order_id) to Pay Station.
// Supports Google Pay Instant Flow out of the box (isGooglePayInstantFlowEnabled).

import { createHash, createHmac } from 'node:crypto';
import { ApiError, equal } from '../../security.mjs';

const ZERO_DECIMAL_CURRENCIES = new Set(['KRW', 'JPY', 'VND', 'CLP', 'IDR']);

export function minorToMajorAmount(amountMinor, currency) {
  const curr = String(currency || 'USD').toUpperCase();
  return ZERO_DECIMAL_CURRENCIES.has(curr) ? amountMinor : Number((amountMinor / 100).toFixed(2));
}

export function majorToMinorAmount(amountMajor, currency) {
  const curr = String(currency || 'USD').toUpperCase();
  const num = Number(amountMajor);
  if (!Number.isFinite(num) || num < 0) return null;
  return ZERO_DECIMAL_CURRENCIES.has(curr) ? Math.round(num) : Math.round(num * 100);
}

export function signXsollaSha1(rawBody, webhookSecret) {
  return `Signature ${createHash('sha1').update(`${rawBody}${webhookSecret}`).digest('hex')}`;
}

export function createXsollaProvider({
  merchantId,
  projectId,
  apiKey,
  webhookSecret,
  sandbox = true,
  apiBaseUrl = 'https://api.xsolla.com',
  payStationBaseUrl = sandbox ? 'https://sandbox-secure.xsolla.com/paystation4/' : 'https://secure.xsolla.com/paystation4/',
  fetchImpl = globalThis.fetch
} = {}) {
  const configured = Boolean(merchantId && projectId && apiKey && webhookSecret);

  function authHeader() {
    return `Basic ${Buffer.from(`${merchantId}:${apiKey}`).toString('base64')}`;
  }

  return {
    name: 'xsolla',
    mode: sandbox ? 'sandbox' : 'live',
    configured,
    supportsGooglePayInstantFlow: true,

    async createCheckoutSession({ order, userDisplayName, returnUrl, paymentMethodHint }) {
      if (!configured) {
        throw new ApiError(503, 'XSOLLA_NOT_CONFIGURED', 'Xsolla merchant/project credentials are not configured');
      }
      const endpoint = `${apiBaseUrl.replace(/\/$/, '')}/merchant/v2/merchants/${encodeURIComponent(merchantId)}/token`;
      const body = {
        user: {
          id: { value: order.principal_id },
          name: { value: userDisplayName || 'PlayHub User' }
        },
        settings: {
          project_id: Number(projectId),
          mode: sandbox ? 'sandbox' : undefined,
          return_url: returnUrl,
          currency: order.currency,
          ui: {
            desktop: { virtual_item_list: { hidden: true } },
            components: {
              google_pay: { instant_flow: true }
            }
          }
        },
        purchase: {
          checkout: {
            currency: order.currency,
            amount: minorToMajorAmount(order.amount_minor, order.currency)
          },
          description: {
            value: `PlayCoin ${order.base_coins + order.bonus_coins} (${order.base_coins} + ${order.bonus_coins} bonus)`
          }
        },
        custom_parameters: {
          order_id: order.id,
          sku_id: order.sku_id,
          channel: order.channel,
          payment_method_hint: paymentMethodHint || 'auto'
        }
      };

      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          Authorization: authHeader(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.token) {
        throw new ApiError(502, 'XSOLLA_TOKEN_FAILED', data.errorMessage || `Xsolla token creation failed (${response.status})`);
      }

      const sep = payStationBaseUrl.includes('?') ? '&' : '?';
      return {
        provider: 'xsolla',
        mode: sandbox ? 'sandbox' : 'live',
        token: data.token,
        providerPaymentId: null, // populated by Xsolla payment webhook transaction.id
        checkoutUrl: `${payStationBaseUrl}${sep}token=${encodeURIComponent(data.token)}`,
        googlePayInstantFlow: true
      };
    },

    async verifyPayment({ order }) {
      // Xsolla settlement is authoritative via signed webhooks; client confirm checks current DB state.
      return {
        verified: order.state === 'PAID',
        pendingWebhook: order.state !== 'PAID',
        providerPaymentId: order.provider_payment_id || null,
        amountMinor: order.amount_minor,
        currency: order.currency
      };
    },

    verifyWebhookSignature({ rawBody, headers }) {
      if (!webhookSecret) throw new ApiError(503, 'XSOLLA_WEBHOOK_SECRET_MISSING');
      const auth = headers['authorization'];
      const hmacSig = headers['x-xsolla-signature'];
      if (auth) {
        const expectedSha1 = signXsollaSha1(rawBody, webhookSecret);
        if (equal(String(auth), expectedSha1)) return true;
      }
      if (hmacSig) {
        const expectedHmac = `sha256=${createHmac('sha256', String(webhookSecret)).update(rawBody).digest('hex')}`;
        if (equal(String(hmacSig), expectedHmac)) return true;
      }
      throw new ApiError(401, 'WEBHOOK_SIGNATURE_INVALID');
    },

    parseWebhookEvent(payload) {
      if (!payload || typeof payload !== 'object') throw new ApiError(400, 'WEBHOOK_BODY_INVALID');
      const nt = String(payload.notification_type || '').toLowerCase();
      const custom = payload.custom_parameters || {};
      const tx = payload.transaction || {};
      const total = payload.purchase?.total || payload.payment_details?.payment || {};
      const currency = total.currency ? String(total.currency).toUpperCase() : null;
      const amountMinor = total.amount !== undefined && currency ? majorToMinorAmount(total.amount, currency) : null;

      if (nt === 'user_validation') {
        return {
          externalEventId: `xsolla_uv_${payload.user?.id || 'unknown'}`,
          eventType: 'user_validation',
          principalId: payload.user?.id ? String(payload.user.id) : null,
          orderId: null,
          providerPaymentId: null,
          amountMinor: null,
          currency: null,
          reason: 'user_validation'
        };
      }

      if (nt === 'payment' || nt === 'order_paid') {
        return {
          externalEventId: `xsolla_pay_${tx.id || payload.order?.id}`,
          eventType: 'payment',
          orderId: custom.order_id ? String(custom.order_id) : (tx.external_id ? String(tx.external_id) : null),
          principalId: payload.user?.id ? String(payload.user.id) : null,
          providerPaymentId: tx.id ? `xsolla_${tx.id}` : null,
          amountMinor,
          currency,
          reason: 'xsolla_payment'
        };
      }

      if (nt === 'refund' || nt === 'order_canceled') {
        const reasonText = String(payload.refund_details?.reason || '').toLowerCase();
        const isDispute = reasonText.includes('chargeback') || reasonText.includes('fraud') || reasonText.includes('dispute');
        return {
          externalEventId: `xsolla_ref_${tx.id || payload.order?.id}_${nt}`,
          eventType: isDispute ? 'chargeback' : 'refund',
          orderId: custom.order_id ? String(custom.order_id) : (tx.external_id ? String(tx.external_id) : null),
          principalId: payload.user?.id ? String(payload.user.id) : null,
          providerPaymentId: tx.id ? `xsolla_${tx.id}` : null,
          amountMinor,
          currency,
          reason: payload.refund_details?.reason || `xsolla_${nt}`
        };
      }

      if (nt === 'dispute') {
        return {
          externalEventId: `xsolla_disp_${tx.id || payload.dispute?.id}`,
          eventType: 'chargeback',
          orderId: custom.order_id ? String(custom.order_id) : (tx.external_id ? String(tx.external_id) : null),
          principalId: payload.user?.id ? String(payload.user.id) : null,
          providerPaymentId: tx.id ? `xsolla_${tx.id}` : null,
          amountMinor,
          currency,
          reason: payload.dispute?.reason || 'xsolla_dispute'
        };
      }

      throw new ApiError(400, 'XSOLLA_NOTIFICATION_UNSUPPORTED', `Unsupported notification_type: ${nt}`);
    },

    async refundPayment({ order, reason }) {
      if (!configured) {
        throw new ApiError(503, 'XSOLLA_NOT_CONFIGURED');
      }
      const rawTxId = String(order.provider_payment_id || '').replace(/^xsolla_/, '');
      if (!rawTxId) throw new ApiError(409, 'PROVIDER_TRANSACTION_MISSING');
      const endpoint = `${apiBaseUrl.replace(/\/$/, '')}/merchant/v2/projects/${encodeURIComponent(projectId)}/transactions/${encodeURIComponent(rawTxId)}/refund`;
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          Authorization: authHeader(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ reason: reason || 'customer_withdrawal_7d' })
      });
      if (!response.ok) {
        throw new ApiError(502, 'XSOLLA_REFUND_FAILED', `Xsolla refund API failed (${response.status})`);
      }
      return { ok: true, providerRefundId: `xsolla_ref_${rawTxId}` };
    }
  };
}
