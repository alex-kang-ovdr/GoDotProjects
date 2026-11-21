import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.mjs';
import { signMockWebhook } from '../server/billing/providers/mock.mjs';
import { signXsollaSha1 } from '../server/billing/providers/xsolla.mjs';
import { spendCoins, verifyLedgerIntegrity } from '../server/billing/ledger.mjs';

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-billing-http-'));
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(path.join(root, 'catalog'));
  fs.mkdirSync(path.join(root, 'games', 'test-game'), { recursive: true });
  fs.writeFileSync(path.join(root, 'catalog', 'games.json'), JSON.stringify({
    schemaVersion: 1,
    entries: [{ id: 'test-game', path: 'games/test-game', enabled: true }]
  }));
  fs.writeFileSync(path.join(root, 'games', 'test-game', 'game.manifest.json'), JSON.stringify({
    schemaVersion: 1, id: 'test-game', slug: 'test-game', entry: 'index.html', version: '0.1.0',
    title: { ko: '테스트 게임', en: 'Test Game' }, summary: { ko: '테스트', en: 'Test' },
    instructions: { ko: '테스트', en: 'Test' }, tags: ['puzzle'], controls: ['keyboard'],
    save: { schemaVersion: 1 }, media: { cover: 'assets/cover.svg' }
  }));
  return { root, dataDir };
}

function parseSetCookie(res, name) {
  const raw = res.headers.getSetCookie?.() || [];
  for (const line of raw) {
    const first = line.split(';')[0];
    const eq = first.indexOf('=');
    if (eq > 0 && first.slice(0, eq).trim() === name) return first.slice(eq + 1).trim();
  }
  return null;
}

async function startBillingApp(t, { billing = { enabled: true, allowMockProvider: true, allowDemoAccount: true, mockWebhookSecret: 'test-mock-secret' }, billingFetch = null, clock = null } = {}) {
  const { root, dataDir } = makeRoot();
  let nowVal = clock ?? Date.UTC(2026, 10, 21, 4, 0, 0);
  const now = () => nowVal;
  const advance = ms => { nowVal += ms; };

  const app = createApp({
    dataDir,
    publicHost: '127.0.0.1',
    publicPort: 0,
    adminHost: '127.0.0.1',
    adminPort: 0,
    userOrigins: ['http://127.0.0.1:8080'],
    adminOrigins: ['http://127.0.0.1:8081'],
    userBaseUrl: 'http://127.0.0.1:8080',
    adminBaseUrl: 'http://127.0.0.1:8081',
    admin: { localAutoLogin: true },
    billing
  }, { rootDir: root, clock: now, billingFetch: billingFetch || undefined });

  const addrs = await app.listen();
  t.after(async () => {
    await app.close();
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  const pubBase = `http://127.0.0.1:${addrs.public.port}`;
  const admBase = `http://127.0.0.1:${addrs.admin.port}`;
  const origin = 'http://127.0.0.1:8080';
  const adminOrigin = 'http://127.0.0.1:8081';

  async function req(url, { method = 'GET', cookie = '', csrf = '', headers = {}, body } = {}) {
    const h = { ...headers };
    if (cookie) h.Cookie = cookie;
    if (csrf) h['X-CSRF-Token'] = csrf;
    if (body !== undefined && !h['Content-Type']) h['Content-Type'] = 'application/json';
    const r = await fetch(url, {
      method,
      headers: h,
      body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body))
    });
    const text = await r.text();
    let jsonBody = null;
    try { jsonBody = text ? JSON.parse(text) : null; } catch {}
    return { status: r.status, res: r, body: jsonBody, raw: text };
  }

  async function newSessionCookie() {
    const r = await req(`${pubBase}/api/session`, { headers: { Origin: origin } });
    const token = parseSetCookie(r.res, 'poc_public_session');
    return { cookie: `poc_public_session=${token}`, csrf: r.body.csrfToken };
  }

  async function signInDemo() {
    const s = await newSessionCookie();
    const r = await req(`${pubBase}/api/billing/demo-signin`, {
      method: 'POST',
      cookie: s.cookie,
      csrf: s.csrf,
      headers: { Origin: origin },
      body: {}
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const token = parseSetCookie(r.res, 'poc_public_session');
    return { cookie: `poc_public_session=${token}`, csrf: r.body.csrfToken };
  }

  return { app, pubBase, admBase, origin, adminOrigin, req, newSessionCookie, signInDemo, now, advance };
}

test('feature flag isolation: billing routes stay 404 when config.billing.enabled is not true', async t => {
  const ctx = await startBillingApp(t, { billing: { enabled: false } });
  const sess = await ctx.newSessionCookie();
  const r = await ctx.req(`${ctx.pubBase}/api/billing/catalog`, { cookie: sess.cookie, headers: { Origin: ctx.origin } });
  assert.equal(r.status, 404);
});

test('public catalog, auth guards, mock checkout, confirm+webhook exactly-once, and 7-day withdrawal E2E', async t => {
  const ctx = await startBillingApp(t);

  // 1. Public catalog: web_browser gets +25% on t4, aos_google_play gets 0%
  const catWeb = await ctx.req(`${ctx.pubBase}/api/billing/catalog?currency=KRW&channel=web_browser`, { headers: { Origin: ctx.origin } });
  assert.equal(catWeb.status, 200);
  const t4 = catWeb.body.items.find(i => i.skuId === 'playhub.coin.t4');
  assert.deepEqual([t4.baseCoins, t4.bonusCoins, t4.totalCoins, t4.bonusBps], [1000, 250, 1250, 2500]);
  assert.equal(catWeb.body.creatorDirectPolicy.platformFeePercent, 0);

  const catAos = await ctx.req(`${ctx.pubBase}/api/billing/catalog?currency=KRW&channel=aos_google_play`, { headers: { Origin: ctx.origin } });
  assert.equal(catAos.body.items.find(i => i.skuId === 'playhub.coin.t4').bonusCoins, 0);

  // 2. Guest / anonymous blocked from purchasing
  const anon = await ctx.newSessionCookie();
  const blocked = await ctx.req(`${ctx.pubBase}/api/billing/orders`, {
    method: 'POST',
    cookie: anon.cookie,
    csrf: anon.csrf,
    headers: { Origin: ctx.origin, 'Idempotency-Key': 'anon-ord-1' },
    body: { skuId: 'playhub.coin.t4', currency: 'KRW', agreedTermsVersion: 'v2.0' }
  });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.error.code, 'REGISTERED_ACCOUNT_REQUIRED');

  // 3. Registered demo user signs in; missing terms consent rejected
  const user = await ctx.signInDemo();
  const noTerms = await ctx.req(`${ctx.pubBase}/api/billing/orders`, {
    method: 'POST',
    cookie: user.cookie,
    csrf: user.csrf,
    headers: { Origin: ctx.origin, 'Idempotency-Key': 'ord-no-terms' },
    body: { skuId: 'playhub.coin.t4', currency: 'KRW' }
  });
  assert.equal(noTerms.status, 422);
  assert.equal(noTerms.body.error.code, 'TERMS_CONSENT_REQUIRED');

  // 4. Create order -> confirm -> signed webhook replay = EXACTLY-ONCE credit
  const created = await ctx.req(`${ctx.pubBase}/api/billing/orders`, {
    method: 'POST',
    cookie: user.cookie,
    csrf: user.csrf,
    headers: { Origin: ctx.origin, 'Idempotency-Key': 'ord-e2e-1' },
    body: { skuId: 'playhub.coin.t4', currency: 'KRW', channelHint: 'web_browser', agreedTermsVersion: 'v2.0' }
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.order.totalCoins, 1250);

  const confirmed = await ctx.req(`${ctx.pubBase}/api/billing/orders/${created.body.order.id}/confirm`, {
    method: 'POST',
    cookie: user.cookie,
    csrf: user.csrf,
    headers: { Origin: ctx.origin },
    body: { providerPaymentId: created.body.checkout.providerPaymentId, amountMinor: 14000 }
  });
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.body.duplicate, false);
  assert.equal(confirmed.body.wallet.paid, 1000);
  assert.equal(confirmed.body.wallet.bonus, 250);
  assert.equal(confirmed.body.wallet.available, 1250);

  // Forged webhook signature rejected (401); browser Origin on webhook rejected (403)
  const whPayload = JSON.stringify({
    eventId: 'evt-mock-1',
    eventType: 'payment',
    orderId: created.body.order.id,
    providerPaymentId: created.body.checkout.providerPaymentId,
    amountMinor: 14000,
    currency: 'KRW'
  });
  const badOrigin = await ctx.req(`${ctx.pubBase}/api/billing/webhooks/mock`, {
    method: 'POST',
    headers: { Origin: ctx.origin, ...signMockWebhook({ rawBody: whPayload, timestampMs: ctx.now(), secret: 'test-mock-secret' }) },
    body: whPayload
  });
  assert.equal(badOrigin.status, 403);

  const badSig = await ctx.req(`${ctx.pubBase}/api/billing/webhooks/mock`, {
    method: 'POST',
    headers: { 'x-billing-timestamp': String(ctx.now()), 'x-billing-signature': 'sha256=deadbeef' },
    body: whPayload
  });
  assert.equal(badSig.status, 401);

  // Valid signed webhook arrives AFTER client confirm -> MUST NOT double-credit
  const goodWh = await ctx.req(`${ctx.pubBase}/api/billing/webhooks/mock`, {
    method: 'POST',
    headers: signMockWebhook({ rawBody: whPayload, timestampMs: ctx.now(), secret: 'test-mock-secret' }),
    body: whPayload
  });
  assert.equal(goodWh.status, 200);
  assert.equal(goodWh.body.result.duplicate, true);

  const walletAfterWh = await ctx.req(`${ctx.pubBase}/api/billing/wallet`, {
    cookie: user.cookie,
    headers: { Origin: ctx.origin }
  });
  assert.equal(walletAfterWh.body.wallet.available, 1250);
  assert.equal(walletAfterWh.body.orders[0].withdrawalEligible, true);

  // 5. 7-day unused withdrawal over HTTP reclaims both paid (1000) and bonus (250)
  const wd = await ctx.req(`${ctx.pubBase}/api/billing/orders/${created.body.order.id}/withdraw`, {
    method: 'POST',
    cookie: user.cookie,
    csrf: user.csrf,
    headers: { Origin: ctx.origin, 'Idempotency-Key': 'wd-e2e-1' },
    body: { reason: 'customer_7d_withdrawal' }
  });
  assert.equal(wd.status, 200, JSON.stringify(wd.body));
  assert.equal(wd.body.wallet.paid, 0);
  assert.equal(wd.body.wallet.bonus, 0);
  assert.equal(wd.body.wallet.available, 0);

  // 6. Pro subscription activate & cancel over HTTP
  const proOn = await ctx.req(`${ctx.pubBase}/api/billing/subscriptions/pro`, {
    method: 'POST',
    cookie: user.cookie,
    csrf: user.csrf,
    headers: { Origin: ctx.origin, 'Idempotency-Key': 'pro-e2e-1' },
    body: {}
  });
  assert.equal(proOn.status, 200);
  assert.equal(proOn.body.subscription.effectivePlan, 'pro');

  const proCancel = await ctx.req(`${ctx.pubBase}/api/billing/subscriptions/cancel`, {
    method: 'POST',
    cookie: user.cookie,
    csrf: user.csrf,
    headers: { Origin: ctx.origin },
    body: {}
  });
  assert.equal(proCancel.status, 200);
  assert.equal(proCancel.body.subscription.status, 'CANCELED');
  assert.equal(proCancel.body.subscription.effectivePlan, 'pro');

  // 7. Admin status endpoint blocked on public port, accessible on admin loopback
  const pubAdmin = await ctx.req(`${ctx.pubBase}/api/admin/billing/status`, { headers: { Origin: ctx.origin } });
  assert.equal(pubAdmin.status, 404);

  const admSess = await ctx.req(`${ctx.admBase}/api/admin/session`, { headers: { Origin: ctx.adminOrigin } });
  const admCookie = `poc_admin_session=${parseSetCookie(admSess.res, 'poc_admin_session')}`;
  const localUrl = ctx.app.issueLocalAdminLoginUrl();
  const localToken = new URL(localUrl).hash.split('#playhub-local-admin=')[1];
  const admLogin = await ctx.req(`${ctx.admBase}/api/admin/local-login`, {
    method: 'POST',
    cookie: admCookie,
    csrf: admSess.body.csrfToken,
    headers: { Origin: ctx.adminOrigin },
    body: { token: localToken }
  });
  assert.equal(admLogin.status, 200);
  const authedAdmCookie = `poc_admin_session=${parseSetCookie(admLogin.res, 'poc_admin_session')}`;
  const admStatus = await ctx.req(`${ctx.admBase}/api/admin/billing/status`, {
    cookie: authedAdmCookie,
    headers: { Origin: ctx.adminOrigin }
  });
  assert.equal(admStatus.status, 200);
  assert.equal(admStatus.body.ok, true);
  assert.equal(admStatus.body.integrity.globalSum, 0);
});

test('Xsolla Pay Station (Google Pay Instant Flow) token creation & SHA-1 signed webhooks (user_validation, payment, dispute)', async t => {
  const xsollaCalls = [];
  const fakeXsollaFetch = async (url, init) => {
    xsollaCalls.push({ url, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ token: 'xsolla_tok_sandbox_123' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  const xsollaSecret = 'xsolla-webhook-secret-xyz';
  const ctx = await startBillingApp(t, {
    billing: {
      enabled: true,
      allowMockProvider: false,
      allowDemoAccount: true,
      xsolla: {
        merchantId: '99001',
        projectId: '44002',
        apiKey: 'xsolla-api-key',
        webhookSecret: xsollaSecret,
        sandbox: true
      }
    },
    billingFetch: fakeXsollaFetch
  });

  const user = await ctx.signInDemo();
  const walletInit = await ctx.req(`${ctx.pubBase}/api/billing/wallet`, { cookie: user.cookie, headers: { Origin: ctx.origin } });
  const principalId = walletInit.body.wallet.principalId;

  // 1. Create USD order -> routes to Xsolla with Google Pay Instant Flow enabled
  const created = await ctx.req(`${ctx.pubBase}/api/billing/orders`, {
    method: 'POST',
    cookie: user.cookie,
    csrf: user.csrf,
    headers: { Origin: ctx.origin, 'Idempotency-Key': 'xsolla-ord-1' },
    body: {
      skuId: 'playhub.coin.t4',
      currency: 'USD',
      channelHint: 'web_browser',
      paymentMethodHint: 'google_pay',
      agreedTermsVersion: 'v2.0'
    }
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.route.provider, 'xsolla');
  assert.equal(created.body.checkout.googlePayInstantFlow, true);
  assert.ok(created.body.checkout.checkoutUrl.includes('xsolla_tok_sandbox_123'));
  assert.equal(xsollaCalls.length, 1);
  assert.equal(xsollaCalls[0].body.purchase.checkout.amount, 9.99);
  assert.equal(xsollaCalls[0].body.settings.ui.components.google_pay.instant_flow, true);
  assert.equal(xsollaCalls[0].body.custom_parameters.order_id, created.body.order.id);

  // 2. Xsolla user_validation webhook -> 204
  const uvRaw = JSON.stringify({ notification_type: 'user_validation', user: { id: principalId } });
  const uvRes = await ctx.req(`${ctx.pubBase}/api/billing/webhooks/xsolla`, {
    method: 'POST',
    headers: { Authorization: signXsollaSha1(uvRaw, xsollaSecret) },
    body: uvRaw
  });
  assert.equal(uvRes.status, 204);

  // 3. Xsolla payment webhook -> credits 1,000 paid + 250 bonus
  const payRaw = JSON.stringify({
    notification_type: 'payment',
    user: { id: principalId },
    transaction: { id: 888101, external_id: created.body.order.id },
    purchase: { total: { currency: 'USD', amount: 9.99 } },
    custom_parameters: { order_id: created.body.order.id }
  });
  const payRes = await ctx.req(`${ctx.pubBase}/api/billing/webhooks/xsolla`, {
    method: 'POST',
    headers: { Authorization: signXsollaSha1(payRaw, xsollaSecret) },
    body: payRaw
  });
  assert.equal(payRes.status, 200, JSON.stringify(payRes.body));
  assert.equal(payRes.body.result.wallet.paid, 1000);
  assert.equal(payRes.body.result.wallet.bonus, 250);

  // 4. Spend 500 PlayCoin, then Xsolla dispute webhook arrives -> clawback + debt + freeze
  spendCoins(ctx.app.db, {
    principalId,
    amountCoins: 500,
    sinkType: 'usage_ai_units',
    sinkRefId: 'ai-xsolla-1',
    idempotencyKey: 'spend-xsolla-1',
    now: ctx.now
  });

  const dispRaw = JSON.stringify({
    notification_type: 'dispute',
    user: { id: principalId },
    transaction: { id: 888101, external_id: created.body.order.id },
    dispute: { id: 'disp-1', reason: 'fraud_chargeback' },
    custom_parameters: { order_id: created.body.order.id }
  });
  const dispRes = await ctx.req(`${ctx.pubBase}/api/billing/webhooks/xsolla`, {
    method: 'POST',
    headers: { Authorization: signXsollaSha1(dispRaw, xsollaSecret) },
    body: dispRaw
  });
  assert.equal(dispRes.status, 200, JSON.stringify(dispRes.body));
  assert.equal(dispRes.body.result.wallet.frozen, true);
  assert.equal(dispRes.body.result.wallet.debt, 500);
  assert.equal(verifyLedgerIntegrity(ctx.app.db).ok, true);

  // Subsequent user_validation webhook now rejects frozen account
  const uvFrozen = await ctx.req(`${ctx.pubBase}/api/billing/webhooks/xsolla`, {
    method: 'POST',
    headers: { Authorization: signXsollaSha1(uvRaw, xsollaSecret) },
    body: uvRaw
  });
  assert.equal(uvFrozen.status, 400);
});
