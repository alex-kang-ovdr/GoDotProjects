// Deterministic Mock PG Provider for local development, sandbox previews, and automated tests.
// Implements the uniform BillingProviderAdapter contract used by all real PSPs.

import { createHmac } from 'node:crypto';
import { ApiError, equal, uid } from '../../security.mjs';

const DEFAULT_WEBHOOK_WINDOW_MS = 5 * 60 * 1000;

export function signMockWebhook({ rawBody, timestampMs, secret }) {
  const payload = `${timestampMs}.${rawBody}`;
  const sig = createHmac('sha256', String(secret)).update(payload).digest('hex');
  return {
    'x-billing-timestamp': String(timestampMs),
    'x-billing-signature': `sha256=${sig}`
  };
}

export function createMockProvider({ webhookSecret = 'dev-mock-webhook-secret', now = Date.now } = {}) {
  return {
    name: 'mock',
    mode: 'mock',
    supportsGooglePayInstantFlow: true,

    async createCheckoutSession({ order, returnUrl = '/?view=billing', paymentMethodHint = 'card' }) {
      const providerPaymentId = `mock_pay_${order.id}`;
      const sep = returnUrl.includes('?') ? '&' : '?';
      return {
        provider: 'mock',
        mode: 'mock',
        providerPaymentId,
        checkoutUrl: `${returnUrl}${sep}mockOrder=${encodeURIComponent(order.id)}&mockPay=${encodeURIComponent(providerPaymentId)}`,
        paymentMethodHint,
        sandboxNote: 'Local Mock PG — no real charge is made'
      };
    },

    async verifyPayment({ order, providerPaymentId, amountMinor }) {
      const expected = `mock_pay_${order.id}`;
      if (!providerPaymentId || providerPaymentId !== expected) {
        throw new ApiError(422, 'PAYMENT_VERIFICATION_FAILED', 'Mock payment ID mismatch');
      }
      if (amountMinor !== undefined && amountMinor !== order.amount_minor) {
        throw new ApiError(422, 'PAYMENT_AMOUNT_MISMATCH', 'Confirmed amount differs from order amount');
      }
      return {
        verified: true,
        providerPaymentId: expected,
        amountMinor: order.amount_minor,
        currency: order.currency
      };
    },

    verifyWebhookSignature({ rawBody, headers }) {
      const tsHeader = headers['x-billing-timestamp'];
      const sigHeader = headers['x-billing-signature'];
      if (!tsHeader || !sigHeader) {
        throw new ApiError(401, 'WEBHOOK_SIGNATURE_MISSING');
      }
      const ts = Number(tsHeader);
      if (!Number.isFinite(ts) || Math.abs(now() - ts) > DEFAULT_WEBHOOK_WINDOW_MS) {
        throw new ApiError(401, 'WEBHOOK_TIMESTAMP_EXPIRED');
      }
      const expected = `sha256=${createHmac('sha256', String(webhookSecret)).update(`${tsHeader}.${rawBody}`).digest('hex')}`;
      if (!equal(String(sigHeader), expected)) {
        throw new ApiError(401, 'WEBHOOK_SIGNATURE_INVALID');
      }
      return true;
    },

    parseWebhookEvent(payload) {
      if (!payload || typeof payload !== 'object') throw new ApiError(400, 'WEBHOOK_BODY_INVALID');
      const type = String(payload.eventType || '').toLowerCase();
      if (!['payment', 'refund', 'chargeback', 'user_validation'].includes(type)) {
        throw new ApiError(400, 'WEBHOOK_EVENT_UNSUPPORTED');
      }
      return {
        externalEventId: String(payload.eventId || `mock_evt_${uid()}`),
        eventType: type,
        orderId: payload.orderId ? String(payload.orderId) : null,
        principalId: payload.principalId ? String(payload.principalId) : null,
        providerPaymentId: payload.providerPaymentId ? String(payload.providerPaymentId) : null,
        amountMinor: Number.isSafeInteger(payload.amountMinor) ? payload.amountMinor : null,
        currency: payload.currency ? String(payload.currency).toUpperCase() : null,
        reason: payload.reason ? String(payload.reason) : `mock_${type}`
      };
    },

    async refundPayment({ order, amountMinor, reason }) {
      return {
        ok: true,
        providerRefundId: `mock_ref_${order.id}_${now()}`,
        amountMinor: amountMinor ?? order.amount_minor,
        reason
      };
    }
  };
}
