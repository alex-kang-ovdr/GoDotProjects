// HTTP Router for Hub-Billing (M1 + M2). Mounted from app.mjs only when billing is enabled.
// Public routes: /api/billing/* (registered account + CSRF on mutations; signed webhooks & S2S usage use dedicated secrets)
// Admin routes:  /api/admin/billing/* (loopback admin listener, authenticated admin session + CSRF enforced by app.mjs)

import { ApiError, equal, json, readJson, assertId, uid } from '../security.mjs';
import { createPaymentRouter, DEFAULT_STAGE1_ROUTES } from './router.mjs';
import { createMockProvider } from './providers/mock.mjs';
import { createXsollaProvider } from './providers/xsolla.mjs';
import { createBillingService } from './service.mjs';
import { listActiveEntitlements } from './direct-commerce.mjs';

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

  if (allowMockProvider && config.secureCookies === true && billingCfg.allowMockWithSecureCookies !== true) {
    throw new Error('billing.allowMockProvider cannot be enabled with secureCookies in production');
  }
  if (config.secureCookies === true && giftcardPepper && giftcardPepper.length < 32) {
    throw new Error('billing.giftcardPepper must be at least 32 characters when configured in production');
  }

  const providers = {};
  const enabledProviders = [];

  const xsolla = createXsollaProvider({
    merchantId: billingCfg.xsolla?.merchantId || env.PLAYHUB_BILLING_XSOLLA_MERCHANT_ID || '',
    projectId: billingCfg.xsolla?.projectId || env.PLAYHUB_BILLING_XSOLLA_PROJECT_ID || '',
    apiKey: billingCfg.xsolla?.apiKey || env.PLAYHUB_BILLING_XSOLLA_API_KEY || '',
    webhookSecret: billingCfg.xsolla?.webhookSecret || env.PLAYHUB_BILLING_XSOLLA_WEBHOOK_SECRET || '',
    sandbox: billingCfg.xsolla?.sandbox !== false,
    apiBaseUrl: billingCfg.xsolla?.apiBaseUrl || 'https://api.xsolla.com',
    fetchImpl
  });
  if (xsolla.configured) {
    providers.xsolla = xsolla;
    enabledProviders.push('xsolla');
  }

  if (allowMockProvider) {
    providers.mock = createMockProvider({
      webhookSecret: billingCfg.mockWebhookSecret || env.PLAYHUB_BILLING_MOCK_WEBHOOK_SECRET || 'dev-mock-webhook-secret',
      now
    });
    enabledProviders.push('mock');
  }

  const routes = billingCfg.routes || (enabledProviders.includes('xsolla')
    ? DEFAULT_STAGE1_ROUTES
    : [{ id: 'mock_default', match: {}, providers: ['mock'] }]);

  const router = createPaymentRouter({
    enabledProviders,
    routes,
    now
  });

  const service = createBillingService({
    db,
    providers,
    router,
    config: { ...billingCfg, allowMockProvider, allowDemoAccount, giftcardPepper },
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
          billingMode: allowMockProvider && !xsolla.configured ? 'mock' : 'xsolla',
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
      const result = await service.createCheckoutOrder({
        principalId: user.id,
        skuId: body.skuId,
        currency: body.currency || 'KRW',
        channelHint: body.channelHint || 'web_browser',
        paymentMethodHint: body.paymentMethodHint || 'card',
        preferredProvider: body.provider || null,
        agreedTermsVersion: body.agreedTermsVersion,
        returnUrl: body.returnUrl || '/?view=billing',
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

    throw new ApiError(404, 'NOT_FOUND');
  }

  return { enabled: true, publicRoute, adminRoute, service, router, providers };
}
