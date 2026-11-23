// HTTP Router for Hub-Billing (M1 + M2 + M3 + M4). Mounted from app.mjs only when billing is enabled.
// Public routes: /api/billing/* (registered account + CSRF on mutations; signed webhooks & S2S usage use dedicated secrets)
// Admin routes:  /api/admin/billing/* (loopback admin listener, authenticated admin session + CSRF enforced by app.mjs)

import { ApiError, equal, json, readJson, assertId, uid } from '../security.mjs';
import {
  createPaymentRouter,
  DEFAULT_STAGE1_ROUTES,
  STAGE2_HYBRID_ROUTES,
  STAGE3_MULTI_PSP_ROUTES
} from './router.mjs';
import { createMockProvider } from './providers/mock.mjs';
import { createXsollaProvider } from './providers/xsolla.mjs';
import { createTossProvider } from './providers/toss.mjs';
import { createKakaoPayProvider } from './providers/kakaopay.mjs';
import { createNaverPayProvider } from './providers/naverpay.mjs';
import { createTossPayProvider } from './providers/tosspay.mjs';
import { createStripeGpayProvider } from './providers/stripe-gpay.mjs';
import { createStripeConnectProvider } from './providers/stripe-connect.mjs';
import { createBillingService } from './service.mjs';
import { listActiveEntitlements } from './direct-commerce.mjs';

const TEST_KEY_PREFIXES = ['test_ck_', 'test_sk_', 'pk_test_', 'sk_test_', 'rk_test_'];

function hasTestKeyPrefix(value) {
  return typeof value === 'string' && value.length > 0 && TEST_KEY_PREFIXES.some(prefix => value.startsWith(prefix));
}

const disabled = {
  enabled: false,
  publicRoute: async () => false,
  adminRoute: async () => false,
  service: null
};

async function readRawBody(req, limit = 256 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new ApiError(413, 'BODY_TOO_LARGE');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function createBilling({
  config,
  db,
  sessionFor,
  requireSession,
  newSession,
  revokeSession,
  now = Date.now,
  audit = () => {},
  rate = () => {},
  rateLimitIp = req => req.socket?.remoteAddress || 'unknown',
  env = process.env,
  fetchImpl = globalThis.fetch
}) {
  const billingCfg = config.billing || {};
  const enabled = billingCfg.enabled === true || env.PLAYHUB_BILLING_ENABLED === '1';
  if (!enabled) return disabled;

  const allowMockProvider = billingCfg.allowMockProvider === true || env.PLAYHUB_BILLING_ALLOW_MOCK === '1';
  const allowDemoAccount = billingCfg.allowDemoAccount === true || env.PLAYHUB_BILLING_ALLOW_DEMO_ACCOUNT === '1';
  const giftcardPepper = billingCfg.giftcardPepper || env.PLAYHUB_BILLING_GIFTCARD_PEPPER || '';
  const internalSecret = billingCfg.internalSecret || env.PLAYHUB_BILLING_INTERNAL_SECRET || '';
  const mockWebhookSecret = billingCfg.mockWebhookSecret || env.PLAYHUB_BILLING_MOCK_WEBHOOK_SECRET || '';
  const stripeSecretKey = billingCfg.stripeConnect?.secretKey || env.PLAYHUB_BILLING_STRIPE_CONNECT_SECRET_KEY || '';
  const stripeWebhookSecret = billingCfg.stripeConnect?.webhookSecret || env.PLAYHUB_BILLING_STRIPE_CONNECT_WEBHOOK_SECRET || '';
  const explicitAllowMockDirect = billingCfg.stripeConnect?.allowMockDirect !== undefined
    ? billingCfg.stripeConnect.allowMockDirect === true
    : (env.PLAYHUB_BILLING_ALLOW_MOCK_DIRECT === '1' ? true : undefined);
  const allowMockDirect = explicitAllowMockDirect !== undefined
    ? explicitAllowMockDirect
    : (allowMockProvider && !stripeSecretKey);

  if (config.secureCookies === true) {
    if (allowMockProvider) {
      throw new Error('billing.allowMockProvider cannot be enabled with secureCookies in production');
    }
    if (allowDemoAccount) {
      throw new Error('billing.allowDemoAccount cannot be enabled with secureCookies in production');
    }
    if (allowMockDirect) {
      throw new Error('billing.stripeConnect.allowMockDirect cannot be enabled with secureCookies in production');
    }
    if (mockWebhookSecret === 'dev-mock-webhook-secret') {
      throw new Error('billing.mockWebhookSecret cannot use default dev secret with secureCookies in production');
    }
    if (giftcardPepper && giftcardPepper.length < 32) {
      throw new Error('billing.giftcardPepper must be at least 32 characters when configured in production');
    }
  }

  const providers = {};
  const enabledProviders = [];

  const xsollaApiKey = billingCfg.xsolla?.apiKey || env.PLAYHUB_BILLING_XSOLLA_API_KEY || '';
  const xsollaWebhookSecret = billingCfg.xsolla?.webhookSecret || env.PLAYHUB_BILLING_XSOLLA_WEBHOOK_SECRET || '';
  const xsollaSandbox = billingCfg.xsolla?.sandbox !== false;
  const xsolla = createXsollaProvider({
    merchantId: billingCfg.xsolla?.merchantId || env.PLAYHUB_BILLING_XSOLLA_MERCHANT_ID || '',
    projectId: billingCfg.xsolla?.projectId || env.PLAYHUB_BILLING_XSOLLA_PROJECT_ID || '',
    apiKey: xsollaApiKey,
    webhookSecret: xsollaWebhookSecret,
    sandbox: xsollaSandbox,
    apiBaseUrl: billingCfg.xsolla?.apiBaseUrl || 'https://api.xsolla.com',
    fetchImpl
  });
  if (xsolla.configured) {
    providers.xsolla = xsolla;
    enabledProviders.push('xsolla');
  }

  const tossClientKey = billingCfg.toss?.clientKey || env.PLAYHUB_BILLING_TOSS_CLIENT_KEY || '';
  const tossSecretKey = billingCfg.toss?.secretKey || env.PLAYHUB_BILLING_TOSS_SECRET_KEY || '';
  const tossWebhookSecret = billingCfg.toss?.webhookSecret || env.PLAYHUB_BILLING_TOSS_WEBHOOK_SECRET || '';
  const tossSandbox = billingCfg.toss?.sandbox !== false;
  const toss = createTossProvider({
    clientKey: tossClientKey,
    secretKey: tossSecretKey,
    webhookSecret: tossWebhookSecret,
    sandbox: tossSandbox,
    apiBaseUrl: billingCfg.toss?.apiBaseUrl || 'https://api.tosspayments.com',
    publicBaseUrl: config.userBaseUrl || '',
    fetchImpl,
    now
  });
  if (toss.configured) {
    providers.toss = toss;
    enabledProviders.push('toss');
  }

  const kakaopaySecretKey = billingCfg.kakaopay?.secretKey || env.PLAYHUB_BILLING_KAKAOPAY_SECRET_KEY || '';
  const kakaopaySandbox = billingCfg.kakaopay?.sandbox !== false;
  const kakaopay = createKakaoPayProvider({
    secretKey: kakaopaySecretKey,
    cid: billingCfg.kakaopay?.cid || env.PLAYHUB_BILLING_KAKAOPAY_CID || '',
    webhookSecret: billingCfg.kakaopay?.webhookSecret || env.PLAYHUB_BILLING_KAKAOPAY_WEBHOOK_SECRET || '',
    sandbox: kakaopaySandbox,
    apiBaseUrl: billingCfg.kakaopay?.apiBaseUrl || 'https://open-api.kakaopay.com',
    publicBaseUrl: config.userBaseUrl || '',
    fetchImpl,
    now
  });
  if (kakaopay.configured) {
    providers.kakaopay = kakaopay;
    enabledProviders.push('kakaopay');
  }

  const naverpayClientSecret = billingCfg.naverpay?.clientSecret || env.PLAYHUB_BILLING_NAVERPAY_CLIENT_SECRET || '';
  const naverpaySandbox = billingCfg.naverpay?.sandbox !== false;
  const naverpay = createNaverPayProvider({
    clientId: billingCfg.naverpay?.clientId || env.PLAYHUB_BILLING_NAVERPAY_CLIENT_ID || '',
    clientSecret: naverpayClientSecret,
    partnerId: billingCfg.naverpay?.partnerId || env.PLAYHUB_BILLING_NAVERPAY_PARTNER_ID || '',
    chainId: billingCfg.naverpay?.chainId || env.PLAYHUB_BILLING_NAVERPAY_CHAIN_ID || '',
    webhookSecret: billingCfg.naverpay?.webhookSecret || env.PLAYHUB_BILLING_NAVERPAY_WEBHOOK_SECRET || '',
    sandbox: naverpaySandbox,
    apiBaseUrl: billingCfg.naverpay?.apiBaseUrl || '',
    publicBaseUrl: config.userBaseUrl || '',
    fetchImpl,
    now
  });
  if (naverpay.configured) {
    providers.naverpay = naverpay;
    enabledProviders.push('naverpay');
  }

  const tosspayApiKey = billingCfg.tosspay?.apiKey || env.PLAYHUB_BILLING_TOSSPAY_API_KEY || '';
  const tosspaySandbox = billingCfg.tosspay?.sandbox !== false;
  const tosspay = createTossPayProvider({
    apiKey: tosspayApiKey,
    webhookSecret: billingCfg.tosspay?.webhookSecret || env.PLAYHUB_BILLING_TOSSPAY_WEBHOOK_SECRET || '',
    resultCallbackUrl: billingCfg.tosspay?.resultCallbackUrl || env.PLAYHUB_BILLING_TOSSPAY_CALLBACK_URL || '',
    sandbox: tosspaySandbox,
    apiBaseUrl: billingCfg.tosspay?.apiBaseUrl || 'https://pay.toss.im',
    publicBaseUrl: config.userBaseUrl || '',
    fetchImpl,
    now
  });
  if (tosspay.configured) {
    providers.tosspay = tosspay;
    enabledProviders.push('tosspay');
  }

  const stripeGpayPublishableKey = billingCfg.stripeGpay?.publishableKey || env.PLAYHUB_BILLING_STRIPE_GPAY_PUBLISHABLE_KEY || '';
  const stripeGpaySecretKey = billingCfg.stripeGpay?.secretKey || env.PLAYHUB_BILLING_STRIPE_GPAY_SECRET_KEY || '';
  const stripeGpayWebhookSecret = billingCfg.stripeGpay?.webhookSecret || env.PLAYHUB_BILLING_STRIPE_GPAY_WEBHOOK_SECRET || '';
  const stripeGpayEnv = billingCfg.stripeGpay?.googlePayEnvironment || (billingCfg.stripeGpay?.sandbox === false ? 'PRODUCTION' : 'TEST');
  const stripeGpay = createStripeGpayProvider({
    publishableKey: stripeGpayPublishableKey,
    secretKey: stripeGpaySecretKey,
    webhookSecret: stripeGpayWebhookSecret,
    merchantName: billingCfg.stripeGpay?.merchantName || 'PlayHub',
    googlePayEnvironment: stripeGpayEnv,
    apiBaseUrl: billingCfg.stripeGpay?.apiBaseUrl || 'https://api.stripe.com',
    fetchImpl,
    now
  });
  if (stripeGpay.configured) {
    providers.stripe_gpay = stripeGpay;
    enabledProviders.push('stripe_gpay');
  }

  if (config.secureCookies === true) {
    for (const [name, adapter] of Object.entries(providers)) {
      if (adapter.mode === 'sandbox') {
        throw new Error(`billing.${name}.sandbox cannot be enabled with secureCookies in production`);
      }
    }
    if (xsolla.configured && hasTestKeyPrefix(xsollaApiKey)) {
      throw new Error('billing.xsolla cannot use test keys with secureCookies in production');
    }
    if (toss.configured) {
      if (hasTestKeyPrefix(tossClientKey) || hasTestKeyPrefix(tossSecretKey)) {
        throw new Error('billing.toss cannot use test keys (test_ck_/test_sk_) with secureCookies in production');
      }
      if (!tossWebhookSecret || tossWebhookSecret === tossSecretKey) {
        throw new Error('billing.toss.webhookSecret must be configured independently from secretKey with secureCookies in production');
      }
    }
    if (kakaopay.configured && hasTestKeyPrefix(kakaopaySecretKey)) {
      throw new Error('billing.kakaopay cannot use test keys with secureCookies in production');
    }
    if (naverpay.configured && hasTestKeyPrefix(naverpayClientSecret)) {
      throw new Error('billing.naverpay cannot use test keys with secureCookies in production');
    }
    if (tosspay.configured && hasTestKeyPrefix(tosspayApiKey)) {
      throw new Error('billing.tosspay cannot use test keys with secureCookies in production');
    }
    if (stripeGpay.configured) {
      if (stripeGpayEnv !== 'PRODUCTION' || billingCfg.stripeGpay?.sandbox === true) {
        throw new Error('billing.stripeGpay must set googlePayEnvironment=PRODUCTION (sandbox=false) with secureCookies in production');
      }
      if (hasTestKeyPrefix(stripeGpayPublishableKey) || hasTestKeyPrefix(stripeGpaySecretKey)) {
        throw new Error('billing.stripeGpay cannot use test keys (pk_test_/sk_test_/rk_test_) with secureCookies in production');
      }
      if (!stripeGpayWebhookSecret || stripeGpayWebhookSecret === stripeGpaySecretKey) {
        throw new Error('billing.stripeGpay.webhookSecret must be configured independently from secretKey with secureCookies in production');
      }
    }
    if (stripeSecretKey) {
      if (hasTestKeyPrefix(stripeSecretKey)) {
        throw new Error('billing.stripeConnect cannot use test keys (sk_test_/rk_test_) with secureCookies in production');
      }
      if (!stripeWebhookSecret || stripeWebhookSecret === stripeSecretKey) {
        throw new Error('billing.stripeConnect.webhookSecret must be configured independently from secretKey with secureCookies in production');
      }
      if (stripeGpay.configured && stripeGpayWebhookSecret === stripeWebhookSecret) {
        throw new Error('billing.stripeGpay.webhookSecret and billing.stripeConnect.webhookSecret must be distinct with secureCookies in production');
      }
    }
  }

  const hasKoreaDirectProvider = Boolean(kakaopay.configured || naverpay.configured || tosspay.configured);
  const hasRealProvider = Boolean(xsolla.configured || toss.configured || stripeGpay.configured || hasKoreaDirectProvider);
  if (allowMockProvider && !hasRealProvider) {
    providers.mock = createMockProvider({
      webhookSecret: mockWebhookSecret || 'dev-mock-webhook-secret',
      now
    });
    enabledProviders.push('mock');
  }

  const resolvedStage = billingCfg.routingStage || (
    enabledProviders.includes('stripe_gpay') ? 'stage3'
      : (enabledProviders.includes('toss') || hasKoreaDirectProvider) ? 'stage2'
        : enabledProviders.includes('xsolla') ? 'stage1'
          : (allowMockProvider ? 'mock' : 'unavailable')
  );
  const stageRouteMap = {
    stage1: DEFAULT_STAGE1_ROUTES,
    stage2: STAGE2_HYBRID_ROUTES,
    stage3: STAGE3_MULTI_PSP_ROUTES,
    mock: [{ id: 'mock_default', match: {}, providers: ['mock'] }],
    unavailable: []
  };
  const routes = billingCfg.routes || stageRouteMap[resolvedStage] || DEFAULT_STAGE1_ROUTES;

  const router = createPaymentRouter({
    enabledProviders,
    routes,
    failureThreshold: billingCfg.circuitBreakerFailureThreshold || 3,
    cooldownMs: billingCfg.circuitBreakerCooldownMs || 60000,
    now
  });

  const stripeConnect = createStripeConnectProvider({
    platformSecretKey: stripeSecretKey,
    webhookSecret: stripeWebhookSecret,
    apiBaseUrl: billingCfg.stripeConnect?.apiBaseUrl || 'https://api.stripe.com',
    allowMockDirect,
    fetchImpl,
    now
  });

  const service = createBillingService({
    db,
    providers,
    stripeConnect,
    router,
    config: { ...billingCfg, allowMockProvider, allowDemoAccount, giftcardPepper, routingStage: resolvedStage, enabledProviders },
    now,
    audit
  });

  function requireRegisteredUser(req) {
    const s = requireSession(req, 'public');
    if (!s.principal_id) throw new ApiError(403, 'REGISTERED_ACCOUNT_REQUIRED', 'Google account login is required');
    const user = db.prepare('SELECT id, kind, display_name FROM users WHERE id=?').get(s.principal_id);
    if (!user || user.kind !== 'registered') {
      throw new ApiError(403, 'REGISTERED_ACCOUNT_REQUIRED', 'Google account login is required');
    }
    return { session: s, user };
  }

  function requireInternalBillingSecret(req) {
    if (req.headers.origin !== undefined) {
      throw new ApiError(403, 'S2S_ORIGIN_FORBIDDEN', 'Internal metering endpoints cannot be called from a browser origin');
    }
    if (!internalSecret || internalSecret.length < 16) {
      throw new ApiError(503, 'INTERNAL_BILLING_SECRET_NOT_CONFIGURED');
    }
    const provided = req.headers['x-playhub-billing-secret'];
    if (!equal(provided, internalSecret)) {
      throw new ApiError(401, 'INTERNAL_BILLING_AUTH_REQUIRED');
    }
  }

  const idemKey = req => req.headers['idempotency-key'] || null;

  async function publicRoute(req, res, url) {
    const p = url.pathname;
    if (!p.startsWith('/api/billing/')) return false;

    // 1. Server-to-server signed PG webhooks (CSRF & browser Origin exempt; verified via signature)
    if (p === '/api/billing/webhooks/stripe-connect' && req.method === 'POST') {
      if (req.headers.origin !== undefined) throw new ApiError(403, 'WEBHOOK_ORIGIN_FORBIDDEN');
      const rawBody = await readRawBody(req, 256 * 1024);
      const outcome = service.handleStripeConnectWebhook({ rawBody, headers: req.headers });
      json(res, outcome.status, outcome.body);
      return true;
    }

    const wh = p.match(/^\/api\/billing\/webhooks\/([a-zA-Z0-9_-]+)$/);
    if (wh && req.method === 'POST') {
      if (req.headers.origin !== undefined) throw new ApiError(403, 'WEBHOOK_ORIGIN_FORBIDDEN');
      const rawBody = await readRawBody(req, 256 * 1024);
      const outcome = service.handleWebhook({
        providerName: wh[1].toLowerCase(),
        rawBody,
        headers: req.headers
      });
      if (outcome.status === 204) {
        res.statusCode = 204;
        res.end();
      } else {
        json(res, outcome.status, outcome.body);
      }
      return true;
    }

    // 2. Server-to-server UsageMetering & Hold/Capture API (PlayForge / Multiplayer / AI workers)
    if (p === '/api/billing/usage/holds' && req.method === 'POST') {
      requireInternalBillingSecret(req);
      const body = await readJson(req, 8192);
      const result = service.createUsageHold({
        principalId: body.principalId,
        amountCoins: body.amountCoins,
        sinkType: body.sinkType || 'infra_server',
        sinkRefId: body.sinkRefId,
        idempotencyKey: idemKey(req) || body.idempotencyKey,
        expiresAt: body.expiresAt ?? null
      });
      json(res, result.duplicate ? 200 : 201, result);
      return true;
    }

    const holdReleaseMatch = p.match(/^\/api\/billing\/usage\/holds\/([^/]+)\/release$/);
    if (holdReleaseMatch && req.method === 'POST') {
      requireInternalBillingSecret(req);
      const body = await readJson(req, 4096);
      const result = service.releaseUsageHold({
        holdId: assertId(holdReleaseMatch[1]),
        idempotencyKey: idemKey(req) || body.idempotencyKey || `release:${holdReleaseMatch[1]}`
      });
      json(res, 200, result);
      return true;
    }

    if (p === '/api/billing/usage' && req.method === 'POST') {
      requireInternalBillingSecret(req);
      const body = await readJson(req, 8192);
      const result = service.recordUsage({
        principalId: body.principalId,
        metricType: body.metricType,
        resourceRefId: body.resourceRefId,
        quantity: body.quantity,
        billableCoins: body.billableCoins ?? 0,
        holdId: body.holdId || null,
        allowBonusForInfra: body.allowBonusForInfra !== false,
        periodKey: body.periodKey || null,
        idempotencyKey: idemKey(req) || body.idempotencyKey
      });
      json(res, result.replayed ? 200 : 201, result);
      return true;
    }

    // 3. Public catalog (browsable before login)
    if (p === '/api/billing/catalog' && req.method === 'GET') {
      const currency = (url.searchParams.get('currency') || 'KRW').toUpperCase();
      const channel = url.searchParams.get('channel') || 'web_browser';
      json(res, 200, service.getCatalog({ currency, channel }));
      return true;
    }

    // 4. Opt-in dev/sandbox isolated demo account sign-in (only when allowDemoAccount=true)
    if (p === '/api/billing/demo-signin' && req.method === 'POST') {
      if (!allowDemoAccount) throw new ApiError(404, 'NOT_FOUND');
      const old = requireSession(req, 'public');
      rate(`billing-demo-signin:${old.id_hash}`, 20, 60000);
      await readJson(req, 4096);
      const stamp = now();
      const userId = uid();
      db.prepare('INSERT INTO users(id, kind, display_name, created_at) VALUES(?,?,?,?)')
        .run(userId, 'registered', 'PlayHub 데모 창작자', stamp - 30 * 86400000);
      revokeSession(old);
      const next = newSession(res, 'public', userId, `u:${userId}`);
      audit('billing.demo_signin', userId, { mode: 'sandbox' });
      json(res, 200, {
        kind: 'registered',
        displayName: 'PlayHub 데모 창작자',
        csrfToken: next.csrf
      });
      return true;
    }

    // 5. Wallet summary (returns authenticated:false gracefully for guests/anonymous)
    if (p === '/api/billing/wallet' && req.method === 'GET') {
      const s = sessionFor(req, 'public');
      const user = s?.principal_id && db.prepare('SELECT id, kind, display_name FROM users WHERE id=?').get(s.principal_id);
      if (!user || user.kind !== 'registered') {
        json(res, 200, {
          authenticated: false,
          kind: user?.kind || 'anonymous',
          billingMode: resolvedStage,
          allowDemoAccount
        });
        return true;
      }
      json(res, 200, { authenticated: true, displayName: user.display_name, ...service.getAccountSummary(user.id) });
      return true;
    }

    // 6. User usage summary & quotas (registered user)
    if (p === '/api/billing/usage' && req.method === 'GET') {
      const { user } = requireRegisteredUser(req);
      const periodKey = url.searchParams.get('period') || null;
      const limit = url.searchParams.get('limit') || '30';
      json(res, 200, service.getUsageDetails(user.id, { periodKey, limit }));
      return true;
    }

    // Opt-in sandbox demo usage trigger (tests FIFO waterfall + Hold/Capture + Anti-Bonus-Stripping in UI)
    if (p === '/api/billing/usage/demo-consume' && req.method === 'POST') {
      if (!allowDemoAccount) throw new ApiError(404, 'NOT_FOUND');
      const { user } = requireRegisteredUser(req);
      rate(`billing-demo-usage:${user.id}`, 30, 60000);
      const body = await readJson(req, 4096);
      const result = service.runDemoUsageConsume({
        principalId: user.id,
        mode: body.mode || 'ai_direct',
        idempotencyKey: idemKey(req) || `demo-use-${uid()}`
      });
      json(res, 200, result);
      return true;
    }

    // 7. Ledger history (registered user)
    if (p === '/api/billing/ledger' && req.method === 'GET') {
      const { user } = requireRegisteredUser(req);
      const limit = url.searchParams.get('limit') || '30';
      json(res, 200, service.getLedgerHistory(user.id, { limit }));
      return true;
    }

    // 8. Active entitlements (Track B query)
    if (p === '/api/billing/entitlements' && req.method === 'GET') {
      const { user } = requireRegisteredUser(req);
      const gameId = url.searchParams.get('gameId') || null;
      const items = listActiveEntitlements(db, { buyerId: user.id, gameId, now });
      json(res, 200, { entitlements: items });
      return true;
    }

    // 9. Gift card preview, atomic redemption & opt-in sandbox demo issue (M2)
    if (p === '/api/billing/giftcards/preview' && req.method === 'POST') {
      const { user } = requireRegisteredUser(req);
      const clientIp = rateLimitIp(req);
      rate(`billing-gc-preview:${clientIp}`, 30, 60000);
      const body = await readJson(req, 4096);
      const result = service.previewGiftCardPin({
        principalId: user.id,
        pin: body.pin,
        clientIp
      });
      json(res, 200, result);
      return true;
    }

    if (p === '/api/billing/giftcards/redeem' && req.method === 'POST') {
      const { user } = requireRegisteredUser(req);
      const clientIp = rateLimitIp(req);
      rate(`billing-gc-redeem:${clientIp}`, 20, 60000);
      const body = await readJson(req, 4096);
      const result = service.redeemGiftCardPin({
        principalId: user.id,
        pin: body.pin,
        idempotencyKey: idemKey(req),
        clientIp
      });
      json(res, 200, result);
      return true;
    }

    if (p === '/api/billing/giftcards/demo-issue' && req.method === 'POST') {
      if (!allowDemoAccount) throw new ApiError(404, 'NOT_FOUND');
      const { user } = requireRegisteredUser(req);
      rate(`billing-gc-demo:${user.id}`, 20, 60000);
      const body = await readJson(req, 4096);
      const result = service.issueDemoGiftCard({
        principalId: user.id,
        channel: body.channel || 'gift_card_direct'
      });
      json(res, 201, result);
      return true;
    }

    // 10. Create 1P checkout order
    if (p === '/api/billing/orders' && req.method === 'POST') {
      const { user } = requireRegisteredUser(req);
      rate(`billing-order:${user.id}`, 30, 60000);
      const body = await readJson(req, 8192);
      const rawOrigin = typeof req.headers.origin === 'string' ? req.headers.origin.trim() : '';
      const allowedOrigins = Array.isArray(config.userOrigins) ? config.userOrigins : [];
      const requestOrigin = rawOrigin && rawOrigin.startsWith('http') && (!allowedOrigins.length || allowedOrigins.includes(rawOrigin))
        ? rawOrigin
        : (config.userBaseUrl || '');
      const result = await service.createCheckoutOrder({
        principalId: user.id,
        skuId: body.skuId,
        currency: body.currency || 'KRW',
        channelHint: body.channelHint || 'web_browser',
        paymentMethodHint: body.paymentMethodHint || 'card',
        preferredProvider: body.provider || null,
        agreedTermsVersion: body.agreedTermsVersion,
        returnUrl: body.returnUrl || '/?view=billing',
        requestOrigin,
        idempotencyKey: idemKey(req)
      });
      json(res, result.replayed ? 200 : 201, result);
      return true;
    }

    // 11. Confirm checkout order
    const confirmMatch = p.match(/^\/api\/billing\/orders\/([^/]+)\/confirm$/);
    if (confirmMatch && req.method === 'POST') {
      const { user } = requireRegisteredUser(req);
      rate(`billing-confirm:${user.id}`, 30, 60000);
      const body = await readJson(req, 8192);
      const result = await service.confirmOrderPayment({
        principalId: user.id,
        orderId: assertId(confirmMatch[1]),
        providerPaymentId: body.providerPaymentId,
        pgToken: body.pgToken || body.pg_token || null,
        amountMinor: body.amountMinor
      });
      json(res, 200, result);
      return true;
    }

    // 12. 7-day unused order withdrawal
    const withdrawMatch = p.match(/^\/api\/billing\/orders\/([^/]+)\/withdraw$/);
    if (withdrawMatch && req.method === 'POST') {
      const { user } = requireRegisteredUser(req);
      rate(`billing-withdraw:${user.id}`, 10, 60000);
      const body = await readJson(req, 4096);
      const result = await service.withdrawUnusedOrder({
        principalId: user.id,
        orderId: assertId(withdrawMatch[1]),
        reason: body.reason || 'customer_7d_withdrawal',
        idempotencyKey: idemKey(req) || `withdraw:${withdrawMatch[1]}`
      });
      json(res, 200, result);
      return true;
    }

    // 13. Pro subscription (sandbox/mock)
    if (p === '/api/billing/subscriptions/pro' && req.method === 'POST') {
      const { user } = requireRegisteredUser(req);
      rate(`billing-sub:${user.id}`, 10, 60000);
      await readJson(req, 4096);
      const result = service.activateProSubscription({
        principalId: user.id,
        idempotencyKey: idemKey(req) || `sub-pro:${user.id}:${now()}`
      });
      json(res, 200, result);
      return true;
    }
    if (p === '/api/billing/subscriptions/cancel' && req.method === 'POST') {
      const { user } = requireRegisteredUser(req);
      rate(`billing-sub:${user.id}`, 10, 60000);
      await readJson(req, 4096);
      const result = service.cancelProSubscription({ principalId: user.id });
      json(res, 200, result);
      return true;
    }

    // 14. Track B: Creator Direct Commerce (0% Platform Fee) & Entitlements (M3)
    if (p === '/api/billing/creator/connection' && req.method === 'GET') {
      const { user } = requireRegisteredUser(req);
      json(res, 200, service.getCreatorPaymentConnection(user.id));
      return true;
    }

    if (p === '/api/billing/creator/connection/start' && req.method === 'POST') {
      const { user } = requireRegisteredUser(req);
      rate(`billing-direct-conn:${user.id}`, 15, 60000);
      const body = await readJson(req, 8192);
      const result = await service.startCreatorDirectOnboarding({
        principalId: user.id,
        rawBody: body,
        countryCode: body.countryCode || 'KR',
        returnUrl: body.returnUrl || '/?view=direct',
        refreshUrl: body.refreshUrl || '/?view=direct'
      });
      json(res, 200, result);
      return true;
    }

    if (p === '/api/billing/creator/products' && req.method === 'GET') {
      const gameId = url.searchParams.get('gameId') || null;
      const scope = url.searchParams.get('scope') || (gameId ? 'game' : 'mine');
      if (scope === 'game' && gameId) {
        json(res, 200, service.getCreatorDirectProducts({ gameId, activeOnly: true, verifiedOwnerOnly: true }));
        return true;
      }
      const { user } = requireRegisteredUser(req);
      json(res, 200, service.getCreatorDirectProducts({ creatorId: user.id, gameId, verifiedOwnerOnly: Boolean(gameId) }));
      return true;
    }

    if (p === '/api/billing/creator/products' && req.method === 'POST') {
      const { user } = requireRegisteredUser(req);
      rate(`billing-direct-prod:${user.id}`, 30, 60000);
      const body = await readJson(req, 8192);
      const result = service.createCreatorDirectProduct({ creatorId: user.id, body });
      json(res, 201, result);
      return true;
    }

    const creatorProdMatch = p.match(/^\/api\/billing\/creator\/products\/([^/]+)$/);
    if (creatorProdMatch && req.method === 'PATCH') {
      const { user } = requireRegisteredUser(req);
      rate(`billing-direct-prod:${user.id}`, 30, 60000);
      const body = await readJson(req, 8192);
      const result = service.updateCreatorDirectProduct({
        creatorId: user.id,
        productId: assertId(creatorProdMatch[1]),
        body
      });
      json(res, 200, result);
      return true;
    }

    if (p === '/api/billing/creator/orders' && req.method === 'GET') {
      const { user } = requireRegisteredUser(req);
      const limit = url.searchParams.get('limit') || '50';
      json(res, 200, service.getCreatorDirectOrdersList({ creatorId: user.id, limit }));
      return true;
    }

    if (p === '/api/billing/direct/orders' && req.method === 'POST') {
      const { user } = requireRegisteredUser(req);
      rate(`billing-direct-order:${user.id}`, 30, 60000);
      const body = await readJson(req, 8192);
      const result = await service.createDirectCheckoutOrder({
        buyerId: user.id,
        productId: body.productId,
        platform: body.platform || 'web',
        buyerRegion: body.buyerRegion || null,
        returnUrl: body.returnUrl || '/?view=direct',
        cancelUrl: body.cancelUrl || '/?view=direct',
        idempotencyKey: idemKey(req)
      });
      json(res, result.replayed ? 200 : 201, result);
      return true;
    }

    const directConfirmMatch = p.match(/^\/api\/billing\/direct\/orders\/([^/]+)\/confirm$/);
    if (directConfirmMatch && req.method === 'POST') {
      const { user } = requireRegisteredUser(req);
      rate(`billing-direct-confirm:${user.id}`, 30, 60000);
      const body = await readJson(req, 4096);
      const result = service.confirmMockDirectOrder({
        buyerId: user.id,
        directOrderId: assertId(directConfirmMatch[1]),
        providerChargeId: body.providerChargeId,
        idempotencyKey: idemKey(req)
      });
      json(res, 200, result);
      return true;
    }

    const directSimRefundMatch = p.match(/^\/api\/billing\/direct\/orders\/([^/]+)\/simulate-refund$/);
    if (directSimRefundMatch && req.method === 'POST') {
      if (!allowDemoAccount) throw new ApiError(404, 'NOT_FOUND');
      const { user } = requireRegisteredUser(req);
      rate(`billing-direct-sim:${user.id}`, 20, 60000);
      const body = await readJson(req, 4096);
      const result = service.simulateDemoDirectRefund({
        principalId: user.id,
        directOrderId: assertId(directSimRefundMatch[1]),
        kind: body.kind || 'REFUNDED',
        idempotencyKey: idemKey(req)
      });
      json(res, 200, result);
      return true;
    }

    const consumeEntMatch = p.match(/^\/api\/billing\/entitlements\/([^/]+)\/consume$/);
    if (consumeEntMatch && req.method === 'POST') {
      const { user } = requireRegisteredUser(req);
      rate(`billing-ent-consume:${user.id}`, 30, 60000);
      await readJson(req, 4096);
      const result = service.consumePlayerEntitlement({
        buyerId: user.id,
        entitlementId: assertId(consumeEntMatch[1]),
        idempotencyKey: idemKey(req) || `consume:${consumeEntMatch[1]}`
      });
      json(res, 200, result);
      return true;
    }

    throw new ApiError(404, 'NOT_FOUND');
  }

  async function adminRoute(req, res, url, session) {
    const p = url.pathname;
    if (!p.startsWith('/api/admin/billing/')) return false;
    const actorId = session?.admin_username || 'admin';

    if (p === '/api/admin/billing/status' && req.method === 'GET') {
      json(res, 200, service.getAdminStatus());
      return true;
    }

    if (p === '/api/admin/billing/giftcards/batches' && req.method === 'GET') {
      const limit = url.searchParams.get('limit') || '50';
      json(res, 200, service.listAdminGiftCardBatches({ limit }));
      return true;
    }

    if (p === '/api/admin/billing/giftcards/batches' && req.method === 'POST') {
      const body = await readJson(req, 16384);
      const result = service.createAdminGiftCardBatch({
        channel: body.channel || 'gift_card_direct',
        partnerName: body.partnerName,
        currency: body.currency || 'KRW',
        faceValueMinor: body.faceValueMinor,
        baseCoins: body.baseCoins,
        bonusBps: body.bonusBps ?? 2500,
        quantity: body.quantity ?? 10,
        expiresAt: body.expiresAt ?? null,
        activateImmediately: body.activateImmediately === true,
        actorId
      });
      json(res, 201, result);
      return true;
    }

    const batchActMatch = p.match(/^\/api\/admin\/billing\/giftcards\/batches\/([^/]+)\/activate$/);
    if (batchActMatch && req.method === 'POST') {
      await readJson(req, 4096);
      const result = service.activateAdminGiftCardBatch({
        batchId: assertId(batchActMatch[1]),
        actorId
      });
      json(res, 200, result);
      return true;
    }

    const batchVoidMatch = p.match(/^\/api\/admin\/billing\/giftcards\/batches\/([^/]+)\/void$/);
    if (batchVoidMatch && req.method === 'POST') {
      const body = await readJson(req, 4096);
      const result = service.voidAdminGiftCardBatch({
        batchId: assertId(batchVoidMatch[1]),
        reason: body.reason || 'admin_void',
        actorId
      });
      json(res, 200, result);
      return true;
    }

    const cardVoidMatch = p.match(/^\/api\/admin\/billing\/giftcards\/([^/]+)\/void$/);
    if (cardVoidMatch && req.method === 'POST') {
      const body = await readJson(req, 4096);
      const result = service.voidAdminGiftCardSerial({
        serialNo: assertId(cardVoidMatch[1]),
        reason: body.reason || 'stolen_or_damaged',
        actorId
      });
      json(res, 200, result);
      return true;
    }

    // M3: Daily reconciliation, CS Promo Grant, and Track B RiskControls (loopback admin only)
    if (p === '/api/admin/billing/reconcile' && req.method === 'GET') {
      json(res, 200, service.getAdminReconciliation());
      return true;
    }

    const walletPromoMatch = p.match(/^\/api\/admin\/billing\/wallets\/([^/]+)\/promo$/);
    if (walletPromoMatch && req.method === 'POST') {
      const body = await readJson(req, 4096);
      const result = service.adminGrantPromo({
        principalId: assertId(walletPromoMatch[1]),
        coins: body.coins,
        reason: body.reason,
        expiresAt: body.expiresAt ?? null,
        idempotencyKey: idemKey(req) || `admin-promo:${walletPromoMatch[1]}:${now()}`,
        actorId
      });
      json(res, result.duplicate ? 200 : 201, result);
      return true;
    }

    if (p === '/api/admin/billing/direct/overview' && req.method === 'GET') {
      const limit = url.searchParams.get('limit') || '50';
      json(res, 200, service.getAdminDirectOverview({ limit }));
      return true;
    }

    const suspProdMatch = p.match(/^\/api\/admin\/billing\/direct\/products\/([^/]+)\/(suspend|restore)$/);
    if (suspProdMatch && req.method === 'POST') {
      const body = await readJson(req, 4096);
      const productId = assertId(suspProdMatch[1]);
      const result = suspProdMatch[2] === 'suspend'
        ? service.adminSuspendProduct({ productId, reason: body.reason || 'risk_policy', actorId })
        : service.adminRestoreProduct({ productId, reason: body.reason || 'review_passed', actorId });
      json(res, 200, result);
      return true;
    }

    const suspConnMatch = p.match(/^\/api\/admin\/billing\/direct\/connections\/([^/]+)\/(suspend|restore)$/);
    if (suspConnMatch && req.method === 'POST') {
      const body = await readJson(req, 4096);
      const principalId = assertId(suspConnMatch[1]);
      const result = suspConnMatch[2] === 'suspend'
        ? service.adminSuspendConnection({ principalId, reason: body.reason || 'risk_policy', actorId })
        : service.adminRestoreConnection({ principalId, reason: body.reason || 'review_passed', actorId });
      json(res, 200, result);
      return true;
    }

    throw new ApiError(404, 'NOT_FOUND');
  }

  return { enabled: true, publicRoute, adminRoute, service, router, providers, stripeConnect };
}
