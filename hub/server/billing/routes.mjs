// HTTP Router for Hub-Billing. Mounted from app.mjs only when billing is enabled.
// Public routes: /api/billing/* (registered account + CSRF on mutations; signed webhooks exempt from CSRF)
// Admin routes:  /api/admin/billing/* (loopback admin listener, admin session enforced by app.mjs)

import { ApiError, json, readJson, assertId, uid } from '../security.mjs';
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
  env = process.env,
  fetchImpl = globalThis.fetch
}) {
  const billingCfg = config.billing || {};
  const enabled = billingCfg.enabled === true || env.PLAYHUB_BILLING_ENABLED === '1';
  if (!enabled) return disabled;

  const allowMockProvider = billingCfg.allowMockProvider === true || env.PLAYHUB_BILLING_ALLOW_MOCK === '1';
  const allowDemoAccount = billingCfg.allowDemoAccount === true || env.PLAYHUB_BILLING_ALLOW_DEMO_ACCOUNT === '1';

  if (allowMockProvider && config.secureCookies === true && billingCfg.allowMockWithSecureCookies !== true) {
    throw new Error('billing.allowMockProvider cannot be enabled with secureCookies in production');
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
    config: { ...billingCfg, allowMockProvider, allowDemoAccount },
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

    // 2. Public catalog (browsable before login)
    if (p === '/api/billing/catalog' && req.method === 'GET') {
      const currency = (url.searchParams.get('currency') || 'KRW').toUpperCase();
      const channel = url.searchParams.get('channel') || 'web_browser';
      json(res, 200, service.getCatalog({ currency, channel }));
      return true;
    }

    // 3. Opt-in dev/sandbox isolated demo account sign-in (only when allowDemoAccount=true)
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

    // 4. Wallet summary (returns authenticated:false gracefully for guests/anonymous)
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

    // 5. Ledger history (registered user)
    if (p === '/api/billing/ledger' && req.method === 'GET') {
      const { user } = requireRegisteredUser(req);
      const limit = url.searchParams.get('limit') || '30';
      json(res, 200, service.getLedgerHistory(user.id, { limit }));
      return true;
    }

    // 6. Active entitlements (Track B query)
    if (p === '/api/billing/entitlements' && req.method === 'GET') {
      const { user } = requireRegisteredUser(req);
      const gameId = url.searchParams.get('gameId') || null;
      const items = listActiveEntitlements(db, { buyerId: user.id, gameId, now });
      json(res, 200, { entitlements: items });
      return true;
    }

    // 7. Create 1P checkout order
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

    // 8. Confirm checkout order
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

    // 9. 7-day unused order withdrawal
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

    // 10. Pro subscription (sandbox/mock in M1)
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

  async function adminRoute(req, res, url) {
    const p = url.pathname;
    if (!p.startsWith('/api/admin/billing/')) return false;
    if (p === '/api/admin/billing/status' && req.method === 'GET') {
      json(res, 200, service.getAdminStatus());
      return true;
    }
    throw new ApiError(404, 'NOT_FOUND');
  }

  return { enabled: true, publicRoute, adminRoute, service, router, providers };
}
