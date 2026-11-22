import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.mjs';
import { signTossWebhook } from '../server/billing/providers/toss.mjs';
import { signStripeWebhook } from '../server/billing/providers/stripe-connect.mjs';
import { spendCoins, verifyLedgerIntegrity } from '../server/billing/ledger.mjs';

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-billing-m4-'));
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

async function startMultiPgApp(t, { billing, billingFetch }) {
  const { root, dataDir } = makeRoot();
  let nowVal = Date.UTC(2026, 10, 21, 7, 0, 0);
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
  }, { rootDir: root, clock: now, billingFetch });

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

  async function signInUser() {
    const s = await req(`${pubBase}/api/session`, { headers: { Origin: origin } });
    const c1 = `poc_public_session=${parseSetCookie(s.res, 'poc_public_session')}`;
    const r = await req(`${pubBase}/api/billing/demo-signin`, {
      method: 'POST',
      cookie: c1,
      csrf: s.body.csrfToken,
      headers: { Origin: origin },
      body: {}
    });
    assert.equal(r.status, 200);
    const cookie = `poc_public_session=${parseSetCookie(r.res, 'poc_public_session')}`;
    const w = await req(`${pubBase}/api/billing/wallet`, { cookie, headers: { Origin: origin } });
    return { cookie, csrf: r.body.csrfToken, principalId: w.body.wallet.principalId };
  }

  async function signInAdmin() {
    const admSess = await req(`${admBase}/api/admin/session`, { headers: { Origin: adminOrigin } });
    const admCookie = `poc_admin_session=${parseSetCookie(admSess.res, 'poc_admin_session')}`;
    const localUrl = app.issueLocalAdminLoginUrl();
    const localToken = new URL(localUrl).hash.split('#playhub-local-admin=')[1];
    const login = await req(`${admBase}/api/admin/local-login`, {
      method: 'POST',
      cookie: admCookie,
      csrf: admSess.body.csrfToken,
      headers: { Origin: adminOrigin },
      body: { token: localToken }
    });
    assert.equal(login.status, 200);
    return {
      cookie: `poc_admin_session=${parseSetCookie(login.res, 'poc_admin_session')}`,
      csrf: login.body.csrfToken
    };
  }

  return { app, pubBase, admBase, origin, adminOrigin, req, signInUser, signInAdmin, now, advance };
}

test('Stage 2 Hybrid Routing: KRW -> Toss Payments (confirm + signed webhook + 7d cancel) and USD -> Xsolla', async t => {
  const calls = [];
  const tossWebhookSecret = 'toss_wh_secret_stage2';
  const fakeFetch = async (url, init) => {
    calls.push({ url, method: init.method || 'GET', headers: init.headers, body: init.body });
    if (url.includes('tosspayments.com/v1/payments/confirm')) {
      const parsed = JSON.parse(init.body);
      return new Response(JSON.stringify({
        paymentKey: parsed.paymentKey,
        orderId: parsed.orderId,
        status: 'DONE',
        totalAmount: parsed.amount
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.includes('tosspayments.com/v1/payments/') && url.endsWith('/cancel')) {
      return new Response(JSON.stringify({
        status: 'CANCELED',
        cancels: [{ transactionKey: 'toss_cancel_tx_99', cancelAmount: 14000 }]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.includes('api.xsolla.com')) {
      return new Response(JSON.stringify({ token: 'xsolla_tok_stage2_usd' }), { status: 200 });
    }
    return new Response('{}', { status: 404 });
  };

  const ctx = await startMultiPgApp(t, {
    billing: {
      enabled: true,
      allowMockProvider: false,
      allowDemoAccount: true,
      routingStage: 'stage2',
      toss: {
        clientKey: 'test_ck_playhub_public',
        secretKey: 'test_sk_playhub_secret',
        webhookSecret: tossWebhookSecret,
        sandbox: true
      },
      xsolla: {
        merchantId: '99001',
        projectId: '44002',
        apiKey: 'xsolla-key',
        webhookSecret: 'xsolla-wh',
        sandbox: true
      }
    },
    billingFetch: fakeFetch
  });

  const user = await ctx.signInUser();

  // Catalog reports Stage 2 + toss/xsolla enabled
  const cat = await ctx.req(`${ctx.pubBase}/api/billing/catalog?currency=KRW`, { headers: { Origin: ctx.origin } });
  assert.equal(cat.status, 200);
  assert.equal(cat.body.routingStage, 'stage2');
  assert.ok(cat.body.enabledProviders.includes('toss'));
  assert.ok(cat.body.enabledProviders.includes('xsolla'));

  // 1. KRW order routes to Toss Payments (never exposes secretKey)
  const krwOrd = await ctx.req(`${ctx.pubBase}/api/billing/orders`, {
    method: 'POST',
    cookie: user.cookie,
    csrf: user.csrf,
    headers: { Origin: ctx.origin, 'Idempotency-Key': 'stage2-krw-1' },
    body: { skuId: 'playhub.coin.t4', currency: 'KRW', paymentMethodHint: 'kakaopay', agreedTermsVersion: 'v2.0' }
  });
  assert.equal(krwOrd.status, 201, JSON.stringify(krwOrd.body));
  assert.equal(krwOrd.body.route.provider, 'toss');
  assert.equal(krwOrd.body.route.routeId, 'krw_local');
  assert.equal(krwOrd.body.checkout.clientKey, 'test_ck_playhub_public');
  assert.equal(krwOrd.body.checkout.easyPayProvider, 'KAKAOPAY');
  assert.ok(!JSON.stringify(krwOrd.body).includes('test_sk_playhub_secret'), 'Toss secret key must never leak to client');

  // 2. Client confirm calls Toss /v1/payments/confirm and credits 1,000 + 250 = 1,250 PlayCoin
  const conf = await ctx.req(`${ctx.pubBase}/api/billing/orders/${krwOrd.body.order.id}/confirm`, {
    method: 'POST',
    cookie: user.cookie,
    csrf: user.csrf,
    headers: { Origin: ctx.origin },
    body: { providerPaymentId: 'tgen_paykey_1001' }
  });
  assert.equal(conf.status, 200, JSON.stringify(conf.body));
  assert.equal(conf.body.wallet.paid, 1000);
  assert.equal(conf.body.wallet.bonus, 250);
  assert.equal(conf.body.wallet.available, 1250);

  // 3. Toss signed webhook arrives after confirm -> Exactly-Once (duplicate: true); forged signature rejected (401)
  const txTime = new Date(ctx.now()).toISOString();
  const tossWhBody = JSON.stringify({
    eventType: 'PAYMENT_STATUS_CHANGED',
    transmissionId: 'tx_toss_001',
    data: {
      paymentKey: 'tgen_paykey_1001',
      orderId: krwOrd.body.order.id,
      status: 'DONE',
      totalAmount: 14000
    }
  });
  const badTossWh = await ctx.req(`${ctx.pubBase}/api/billing/webhooks/toss`, {
    method: 'POST',
    headers: {
      'tosspayments-webhook-transmission-time': txTime,
      'tosspayments-webhook-signature': 'v1:forged=='
    },
    body: tossWhBody
  });
  assert.equal(badTossWh.status, 401);

  const okTossWh = await ctx.req(`${ctx.pubBase}/api/billing/webhooks/toss`, {
    method: 'POST',
    headers: {
      'tosspayments-webhook-transmission-time': txTime,
      'tosspayments-webhook-signature': signTossWebhook({ rawBody: tossWhBody, transmissionTime: txTime, secret: tossWebhookSecret })
    },
    body: tossWhBody
  });
  assert.equal(okTossWh.status, 200, JSON.stringify(okTossWh.body));
  assert.equal(okTossWh.body.result.duplicate, true);

  // 4. 7-day unused withdrawal calls Toss /cancel API and reclaims paid + bonus
  const wd = await ctx.req(`${ctx.pubBase}/api/billing/orders/${krwOrd.body.order.id}/withdraw`, {
    method: 'POST',
    cookie: user.cookie,
    csrf: user.csrf,
    headers: { Origin: ctx.origin, 'Idempotency-Key': 'stage2-wd-1' },
    body: { reason: 'customer_7d_withdrawal' }
  });
  assert.equal(wd.status, 200, JSON.stringify(wd.body));
  assert.equal(wd.body.wallet.available, 0);
  assert.ok(calls.some(c => c.url.includes('/v1/payments/tgen_paykey_1001/cancel')));
  assert.equal(verifyLedgerIntegrity(ctx.app.db).ok, true);

  // 5. USD order in Stage 2 routes to Xsolla
  const usdOrd = await ctx.req(`${ctx.pubBase}/api/billing/orders`, {
    method: 'POST',
    cookie: user.cookie,
    csrf: user.csrf,
    headers: { Origin: ctx.origin, 'Idempotency-Key': 'stage2-usd-1' },
    body: { skuId: 'playhub.coin.t4', currency: 'USD', agreedTermsVersion: 'v2.0' }
  });
  assert.equal(usdOrd.status, 201);
  assert.equal(usdOrd.body.route.provider, 'xsolla');
  assert.equal(usdOrd.body.route.routeId, 'global_default');
});

test('Stage 3 Multi-PSP Routing (Stripe + Google Pay Web 0% fee) & Circuit-Breaker Auto-Failover to Xsolla', async t => {
  const stripeWhSecret = 'whsec_stage3_stripe_gpay';
  let stripeOutage = false;
  let tossOutage = false;
  let stripePiSeq = 0;

  const fakeFetch = async (url, init) => {
    if (url.includes('api.stripe.com/v1/payment_intents')) {
      if (stripeOutage) {
        return new Response(JSON.stringify({ error: { code: 'api_error', message: 'Stripe temporarily down' } }), { status: 503 });
      }
      stripePiSeq += 1;
      const piId = `pi_stage3_gpay_${stripePiSeq}`;
      return new Response(JSON.stringify({
        id: piId,
        client_secret: `${piId}_secret_abc`,
        status: 'requires_payment_method'
      }), { status: 200 });
    }
    if (url.includes('tosspayments.com/v1/payments/confirm')) {
      if (tossOutage) {
        return new Response(JSON.stringify({ code: 'INTERNAL_SERVER_ERROR', message: 'Toss gateway timeout' }), { status: 503 });
      }
      const parsed = JSON.parse(init.body);
      return new Response(JSON.stringify({
        paymentKey: parsed.paymentKey,
        orderId: parsed.orderId,
        status: 'DONE',
        totalAmount: parsed.amount
      }), { status: 200 });
    }
    if (url.includes('api.xsolla.com')) {
      return new Response(JSON.stringify({ token: 'xsolla_tok_failover_ok' }), { status: 200 });
    }
    return new Response('{}', { status: 404 });
  };

  const ctx = await startMultiPgApp(t, {
    billing: {
      enabled: true,
      allowMockProvider: false,
      allowDemoAccount: true,
      routingStage: 'stage3',
      circuitBreakerFailureThreshold: 2,
      circuitBreakerCooldownMs: 60000,
      toss: {
        clientKey: 'test_ck_stage3',
        secretKey: 'test_sk_stage3',
        webhookSecret: 'toss_wh_stage3',
        sandbox: true
      },
      stripeGpay: {
        publishableKey: 'pk_test_playhub_gpay',
        secretKey: 'sk_test_playhub_gpay',
        webhookSecret: stripeWhSecret,
        googlePayEnvironment: 'TEST'
      },
      xsolla: {
        merchantId: '99001',
        projectId: '44002',
        apiKey: 'xsolla-key',
        webhookSecret: 'xsolla-wh',
        sandbox: true
      }
    },
    billingFetch: fakeFetch
  });

  const user = await ctx.signInUser();
  const admin = await ctx.signInAdmin();
  const nowSec = Math.floor(ctx.now() / 1000);

  // 1. USD + Google Pay routes to stripe_gpay with Google Pay Web 0% fee config
  const gpayOrd = await ctx.req(`${ctx.pubBase}/api/billing/orders`, {
    method: 'POST',
    cookie: user.cookie,
    csrf: user.csrf,
    headers: { Origin: ctx.origin, 'Idempotency-Key': 'stage3-gpay-1' },
    body: {
      skuId: 'playhub.coin.t4',
      currency: 'USD',
      paymentMethodHint: 'google_pay',
      agreedTermsVersion: 'v2.0'
    }
  });
  assert.equal(gpayOrd.status, 201, JSON.stringify(gpayOrd.body));
  assert.equal(gpayOrd.body.route.provider, 'stripe_gpay');
  assert.equal(gpayOrd.body.route.routeId, 'global_gpay');
  assert.equal(gpayOrd.body.checkout.googlePayConfig.googleFeePercent, 0);
  assert.equal(gpayOrd.body.checkout.googlePayConfig.transactionInfo.totalPrice, '9.99');
  assert.equal(gpayOrd.body.checkout.googlePayConfig.transactionInfo.currencyCode, 'USD');

  // 2. Signed Stripe webhook payment_intent.succeeded credits 1,250 PlayCoin
  const piEvt = JSON.stringify({
    id: 'evt_sgpay_paid_1',
    type: 'payment_intent.succeeded',
    data: {
      object: {
        id: 'pi_stage3_gpay_1',
        status: 'succeeded',
        amount_received: 999,
        currency: 'usd',
        metadata: { order_id: gpayOrd.body.order.id, principal_id: user.principalId }
      }
    }
  });
  const piWh = await ctx.req(`${ctx.pubBase}/api/billing/webhooks/stripe_gpay`, {
    method: 'POST',
    headers: { 'Stripe-Signature': signStripeWebhook({ rawBody: piEvt, timestampSec: nowSec, secret: stripeWhSecret }) },
    body: piEvt
  });
  assert.equal(piWh.status, 200, JSON.stringify(piWh.body));
  assert.equal(piWh.body.result.wallet.available, 1250);

  // Spend 400 PlayCoin, then dispute webhook freezes account with 400 debt
  spendCoins(ctx.app.db, {
    principalId: user.principalId,
    amountCoins: 400,
    sinkType: 'usage_ai_units',
    sinkRefId: 'ai-s3-1',
    idempotencyKey: 'spend-s3-1',
    now: ctx.now
  });
  const dispEvt = JSON.stringify({
    id: 'evt_sgpay_disp_1',
    type: 'charge.dispute.created',
    data: { object: { id: 'dp_s3_1', payment_intent: 'pi_stage3_gpay_1', amount: 999, currency: 'usd', reason: 'fraudulent', metadata: { order_id: gpayOrd.body.order.id } } }
  });
  const dispWh = await ctx.req(`${ctx.pubBase}/api/billing/webhooks/stripe_gpay`, {
    method: 'POST',
    headers: { 'Stripe-Signature': signStripeWebhook({ rawBody: dispEvt, timestampSec: nowSec, secret: stripeWhSecret }) },
    body: dispEvt
  });
  assert.equal(dispWh.status, 200);
  assert.equal(dispWh.body.result.wallet.frozen, true);
  assert.equal(dispWh.body.result.wallet.debt, 400);

  // 3. Circuit-breaker automatic failover: simulate Stripe 503 outage (2 failures -> circuit opens -> 3rd fails over to Xsolla)
  const freshUser = await ctx.signInUser();
  stripeOutage = true;

  const f1 = await ctx.req(`${ctx.pubBase}/api/billing/orders`, {
    method: 'POST',
    cookie: freshUser.cookie,
    csrf: freshUser.csrf,
    headers: { Origin: ctx.origin, 'Idempotency-Key': 's3-fail-1' },
    body: { skuId: 'playhub.coin.t4', currency: 'USD', paymentMethodHint: 'google_pay', agreedTermsVersion: 'v2.0' }
  });
  assert.equal(f1.status, 502);

  const f2 = await ctx.req(`${ctx.pubBase}/api/billing/orders`, {
    method: 'POST',
    cookie: freshUser.cookie,
    csrf: freshUser.csrf,
    headers: { Origin: ctx.origin, 'Idempotency-Key': 's3-fail-2' },
    body: { skuId: 'playhub.coin.t4', currency: 'USD', paymentMethodHint: 'google_pay', agreedTermsVersion: 'v2.0' }
  });
  assert.equal(f2.status, 502);

  // 3rd attempt automatically bypasses circuit-open stripe_gpay and routes to Xsolla!
  const failoverUsd = await ctx.req(`${ctx.pubBase}/api/billing/orders`, {
    method: 'POST',
    cookie: freshUser.cookie,
    csrf: freshUser.csrf,
    headers: { Origin: ctx.origin, 'Idempotency-Key': 's3-failover-usd' },
    body: { skuId: 'playhub.coin.t4', currency: 'USD', paymentMethodHint: 'google_pay', agreedTermsVersion: 'v2.0' }
  });
  assert.equal(failoverUsd.status, 201, JSON.stringify(failoverUsd.body));
  assert.equal(failoverUsd.body.route.provider, 'xsolla');
  assert.equal(failoverUsd.body.route.failoverUsed, true);
  assert.equal(failoverUsd.body.route.skippedPrimary, 'stripe_gpay');
  assert.equal(failoverUsd.body.checkout.googlePayInstantFlow, true);

  // 4. Toss confirm 503 outage (2 failures -> circuit opens -> next KRW order automatically fails over to Xsolla!)
  tossOutage = true;
  const kOrd1 = await ctx.req(`${ctx.pubBase}/api/billing/orders`, {
    method: 'POST',
    cookie: freshUser.cookie,
    csrf: freshUser.csrf,
    headers: { Origin: ctx.origin, 'Idempotency-Key': 's3-toss-fail-1' },
    body: { skuId: 'playhub.coin.t2', currency: 'KRW', agreedTermsVersion: 'v2.0' }
  });
  assert.equal(kOrd1.body.route.provider, 'toss');

  const kConf1 = await ctx.req(`${ctx.pubBase}/api/billing/orders/${kOrd1.body.order.id}/confirm`, {
    method: 'POST', cookie: freshUser.cookie, csrf: freshUser.csrf, headers: { Origin: ctx.origin }, body: { providerPaymentId: 'pk_1' }
  });
  assert.equal(kConf1.status, 502);
  const kConf2 = await ctx.req(`${ctx.pubBase}/api/billing/orders/${kOrd1.body.order.id}/confirm`, {
    method: 'POST', cookie: freshUser.cookie, csrf: freshUser.csrf, headers: { Origin: ctx.origin }, body: { providerPaymentId: 'pk_1' }
  });
  assert.equal(kConf2.status, 502);

  // Next KRW order automatically routes to Xsolla!
  const failoverKrw = await ctx.req(`${ctx.pubBase}/api/billing/orders`, {
    method: 'POST',
    cookie: freshUser.cookie,
    csrf: freshUser.csrf,
    headers: { Origin: ctx.origin, 'Idempotency-Key': 's3-failover-krw' },
    body: { skuId: 'playhub.coin.t2', currency: 'KRW', agreedTermsVersion: 'v2.0' }
  });
  assert.equal(failoverKrw.status, 201, JSON.stringify(failoverKrw.body));
  assert.equal(failoverKrw.body.route.provider, 'xsolla');
  assert.equal(failoverKrw.body.route.failoverUsed, true);
  assert.equal(failoverKrw.body.route.skippedPrimary, 'toss');

  // Admin status exposes circuit-breaker health snapshot
  const admStatus = await ctx.req(`${ctx.admBase}/api/admin/billing/status`, {
    cookie: admin.cookie,
    headers: { Origin: ctx.adminOrigin }
  });
  assert.equal(admStatus.status, 200);
  assert.equal(admStatus.body.routerHealth.stripe_gpay.healthy, false);
  assert.equal(admStatus.body.routerHealth.toss.healthy, false);
  assert.equal(admStatus.body.routerHealth.xsolla.healthy, true);

  // 5. After cooldown (60s) & provider recovery, USD Google Pay automatically returns to stripe_gpay
  stripeOutage = false;
  ctx.advance(61_000);
  const recovered = await ctx.req(`${ctx.pubBase}/api/billing/orders`, {
    method: 'POST',
    cookie: freshUser.cookie,
    csrf: freshUser.csrf,
    headers: { Origin: ctx.origin, 'Idempotency-Key': 's3-recovered-gpay' },
    body: { skuId: 'playhub.coin.t4', currency: 'USD', paymentMethodHint: 'google_pay', agreedTermsVersion: 'v2.0' }
  });
  assert.equal(recovered.status, 201);
  assert.equal(recovered.body.route.provider, 'stripe_gpay');
  assert.equal(recovered.body.route.failoverUsed, false);
  assert.equal(verifyLedgerIntegrity(ctx.app.db).ok, true);
});
