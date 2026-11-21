// Lightweight Payment Orchestrator (Airbnb / Uber / Lyft adapter & failover pattern).
// Routes checkouts by currency/country/channel/paymentMethod across configured PSP
// adapters and fails over cleanly when a provider circuit opens.

import { ApiError } from '../security.mjs';

export const DEFAULT_STAGE1_ROUTES = [
  { id: 'mobile_aos', match: { channel: 'aos_google_play' }, providers: ['google_play'] },
  { id: 'mobile_ios', match: { channel: 'ios_app_store' }, providers: ['apple_iap'] },
  { id: 'web_default', match: {}, providers: ['xsolla'] }
];

export const STAGE2_HYBRID_ROUTES = [
  { id: 'mobile_aos', match: { channel: 'aos_google_play' }, providers: ['google_play'] },
  { id: 'mobile_ios', match: { channel: 'ios_app_store' }, providers: ['apple_iap'] },
  { id: 'krw_local', match: { currency: 'KRW' }, providers: ['toss', 'xsolla'] },
  { id: 'global_default', match: {}, providers: ['xsolla'] }
];

export const STAGE3_MULTI_PSP_ROUTES = [
  { id: 'mobile_aos', match: { channel: 'aos_google_play' }, providers: ['google_play'] },
  { id: 'mobile_ios', match: { channel: 'ios_app_store' }, providers: ['apple_iap'] },
  { id: 'krw_local', match: { currency: 'KRW' }, providers: ['toss', 'xsolla'] },
  { id: 'global_gpay', match: { paymentMethodHint: 'google_pay' }, providers: ['stripe_gpay', 'xsolla'] },
  { id: 'global_major_cards', match: { currencies: ['USD', 'EUR', 'GBP', 'JPY'] }, providers: ['stripe_gpay', 'xsolla'] },
  { id: 'global_default', match: {}, providers: ['xsolla'] }
];

function matchesRule(rule, ctx) {
  const m = rule.match || {};
  if (m.channel && m.channel !== ctx.channel) return false;
  if (m.currency && m.currency !== ctx.currency) return false;
  if (Array.isArray(m.currencies) && !m.currencies.includes(ctx.currency)) return false;
  if (m.country && m.country !== ctx.country) return false;
  if (m.paymentMethodHint && m.paymentMethodHint !== ctx.paymentMethodHint) return false;
  return true;
}

export function createPaymentRouter({
  enabledProviders = ['xsolla'],
  routes = DEFAULT_STAGE1_ROUTES,
  failureThreshold = 3,
  cooldownMs = 60000,
  now = Date.now
} = {}) {
  const enabled = new Set(enabledProviders);
  const health = new Map();

  function getState(provider) {
    let s = health.get(provider);
    if (!s) {
      s = { consecutiveFailures: 0, openUntil: 0, lastError: null };
      health.set(provider, s);
    }
    return s;
  }

  function isHealthy(provider) {
    const s = getState(provider);
    if (s.openUntil <= now()) {
      return true;
    }
    return false;
  }

  function recordFailure(provider, errorCode = 'PROVIDER_ERROR') {
    const s = getState(provider);
    s.consecutiveFailures += 1;
    s.lastError = errorCode;
    if (s.consecutiveFailures >= failureThreshold) {
      s.openUntil = now() + cooldownMs;
    }
  }

  function recordSuccess(provider) {
    const s = getState(provider);
    s.consecutiveFailures = 0;
    s.openUntil = 0;
    s.lastError = null;
  }

  function selectProvider({ currency = 'KRW', country = null, channel = 'web_browser', paymentMethodHint = null, preferredProvider = null } = {}) {
    const ctx = {
      currency: String(currency).toUpperCase(),
      country: country ? String(country).toUpperCase() : null,
      channel,
      paymentMethodHint: paymentMethodHint ? String(paymentMethodHint).toLowerCase() : null
    };

    if (preferredProvider) {
      if (!enabled.has(preferredProvider)) {
        throw new ApiError(400, 'PROVIDER_UNAVAILABLE', `Provider ${preferredProvider} is not enabled`);
      }
      if (!isHealthy(preferredProvider)) {
        throw new ApiError(503, 'PROVIDER_CIRCUIT_OPEN', `Provider ${preferredProvider} is temporarily unavailable`);
      }
      return { provider: preferredProvider, routeId: 'explicit', failoverUsed: false };
    }

    for (const rule of routes) {
      if (!matchesRule(rule, ctx)) continue;
      const candidates = rule.providers.filter(p => enabled.has(p));
      if (!candidates.length) continue;

      const primary = candidates[0];
      if (isHealthy(primary)) {
        return { provider: primary, routeId: rule.id, failoverUsed: false };
      }
      for (let i = 1; i < candidates.length; i += 1) {
        if (isHealthy(candidates[i])) {
          return { provider: candidates[i], routeId: rule.id, failoverUsed: true, skippedPrimary: primary };
        }
      }
      throw new ApiError(503, 'ALL_PROVIDERS_UNAVAILABLE', `All providers in route ${rule.id} are circuit-open`);
    }

    throw new ApiError(503, 'NO_MATCHING_PAYMENT_ROUTE');
  }

  function healthSnapshot() {
    const stamp = now();
    const out = {};
    for (const p of enabled) {
      const s = getState(p);
      out[p] = {
        healthy: s.openUntil <= stamp,
        consecutiveFailures: s.consecutiveFailures,
        openUntil: s.openUntil > stamp ? s.openUntil : null,
        lastError: s.lastError
      };
    }
    return out;
  }

  return { selectProvider, recordFailure, recordSuccess, isHealthy, healthSnapshot };
}
