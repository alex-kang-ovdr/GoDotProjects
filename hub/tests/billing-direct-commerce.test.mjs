import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.mjs';
import { signStripeWebhook } from '../server/billing/providers/stripe-connect.mjs';

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-billing-m3-'));
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(path.join(root, 'catalog'));
  fs.mkdirSync(path.join(root, 'games', 'match3-garden'), { recursive: true });
  fs.writeFileSync(path.join(root, 'catalog', 'games.json'), JSON.stringify({
    schemaVersion: 1,
    entries: [{ id: 'match3-garden', path: 'games/match3-garden', enabled: true }]
  }));
  fs.writeFileSync(path.join(root, 'games', 'match3-garden', 'game.manifest.json'), JSON.stringify({
    schemaVersion: 1, id: 'match3-garden', slug: 'match3-garden', entry: 'index.html', version: '0.1.0',
    title: { ko: '매치3 가든', en: 'Match3 Garden' }, summary: { ko: '테스트', en: 'Test' },
    instructions: { ko: '테스트', en: 'Test' }, tags: ['puzzle'], controls: ['mouse'],
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

async function startM3App(t, { stripeSecret = 'sk_test_platform_only', webhookSecret = 'whsec_test_connect_secret', billingFetch = null } = {}) {
  const { root, dataDir } = makeRoot();
  let nowVal = Date.UTC(2026, 10, 21, 6, 0, 0);
  const now = () => nowVal;

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
    billing: {
      enabled: true,
      allowMockProvider: true,
      allowDemoAccount: true,
      stripeConnect: {
        secretKey: stripeSecret,
        webhookSecret,
        allowMockDirect: !stripeSecret
      }
    }
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

  return { app, pubBase, admBase, origin, adminOrigin, webhookSecret, req, signInUser, signInAdmin, now };
}

test('Track B Stripe Connect Direct Charges (0% fee, zero secret keys, mobile/TV fail-closed, signed webhooks & Entitlement lifecycle)', async t => {
  const stripeCalls = [];
  const fakeStripeFetch = async (url, init) => {
    stripeCalls.push({ url, headers: init.headers, body: init.body });
    if (url.endsWith('/v1/accounts')) {
      return new Response(JSON.stringify({ id: 'acct_live_creator_1' }), { status: 200 });
    }
    if (url.endsWith('/v1/account_links')) {
      return new Response(JSON.stringify({ url: 'https://connect.stripe.com/setup/e/acct_live_creator_1/mock' }), { status: 200 });
    }
    if (url.endsWith('/v1/checkout/sessions')) {
      return new Response(JSON.stringify({
        id: 'cs_live_direct_1',
        url: 'https://checkout.stripe.com/c/pay/cs_live_direct_1',
        payment_intent: 'pi_live_direct_1'
      }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: { message: 'unexpected stripe url' } }), { status: 404 });
  };

  const ctx = await startM3App(t, { billingFetch: fakeStripeFetch });
  const creator = await ctx.signInUser();
  const buyer = await ctx.signInUser();
  const nowSec = Math.floor(ctx.now() / 1000);

  // 1. Creator private API secret key submission is strictly rejected (400)
  const badSecretAttempt = await ctx.req(`${ctx.pubBase}/api/billing/creator/connection/start`, {
    method: 'POST',
    cookie: creator.cookie,
    csrf: creator.csrf,
    headers: { Origin: ctx.origin },
    body: { countryCode: 'KR', secretKey: 'sk_live_creator_private_key' }
  });
  assert.equal(badSecretAttempt.status, 400);
  assert.equal(badSecretAttempt.body.error.code, 'CREATOR_SECRET_KEY_FORBIDDEN');

  // Non-zero platformFeeBps rejected (422)
  const badFeeAttempt = await ctx.req(`${ctx.pubBase}/api/billing/creator/connection/start`, {
    method: 'POST',
    cookie: creator.cookie,
    csrf: creator.csrf,
    headers: { Origin: ctx.origin },
    body: { countryCode: 'KR', platformFeeBps: 500 }
  });
  assert.equal(badFeeAttempt.status, 422);
  assert.equal(badFeeAttempt.body.error.code, 'PLATFORM_FEE_MUST_BE_ZERO');

  // 2. Creator starts Stripe Connect OAuth onboarding -> PENDING, 0% fee
  const onboard = await ctx.req(`${ctx.pubBase}/api/billing/creator/connection/start`, {
    method: 'POST',
    cookie: creator.cookie,
    csrf: creator.csrf,
    headers: { Origin: ctx.origin },
    body: { countryCode: 'KR' }
  });
  assert.equal(onboard.status, 200, JSON.stringify(onboard.body));
  assert.equal(onboard.body.connection.connectedAccountId, 'acct_live_creator_1');
  assert.equal(onboard.body.connection.onboardingStatus, 'PENDING');
  assert.equal(onboard.body.connection.platformFeeBps, 0);
  assert.ok(onboard.body.onboardingUrl.startsWith('https://connect.stripe.com/'));

  // 3. Signed Stripe Connect account.updated webhook activates creator connection
  const acctEvt = JSON.stringify({
    id: 'evt_sc_acct_1',
    type: 'account.updated',
    account: 'acct_live_creator_1',
    data: { object: { id: 'acct_live_creator_1', charges_enabled: true, payouts_enabled: true } }
  });
  // Forged signature rejected (401); browser Origin rejected (403)
  const badSig = await ctx.req(`${ctx.pubBase}/api/billing/webhooks/stripe-connect`, {
    method: 'POST',
    headers: { 'Stripe-Signature': `t=${nowSec},v1=0000` },
    body: acctEvt
  });
  assert.equal(badSig.status, 401);

  const badOrigin = await ctx.req(`${ctx.pubBase}/api/billing/webhooks/stripe-connect`, {
    method: 'POST',
    headers: {
      Origin: ctx.origin,
      'Stripe-Signature': signStripeWebhook({ rawBody: acctEvt, timestampSec: nowSec, secret: ctx.webhookSecret })
    },
    body: acctEvt
  });
  assert.equal(badOrigin.status, 403);

  const acctWh = await ctx.req(`${ctx.pubBase}/api/billing/webhooks/stripe-connect`, {
    method: 'POST',
    headers: { 'Stripe-Signature': signStripeWebhook({ rawBody: acctEvt, timestampSec: nowSec, secret: ctx.webhookSecret }) },
    body: acctEvt
  });
  assert.equal(acctWh.status, 200, JSON.stringify(acctWh.body));
  assert.equal(acctWh.body.connection.connected, true);

  // 4. Creator publishes durable & consumable products
  const durableProd = await ctx.req(`${ctx.pubBase}/api/billing/creator/products`, {
    method: 'POST',
    cookie: creator.cookie,
    csrf: creator.csrf,
    headers: { Origin: ctx.origin },
    body: {
      gameId: 'match3-garden',
      productKey: 'golden_skin',
      kind: 'durable',
      title: '골드 가든 스킨',
      currency: 'KRW',
      amountMinor: 4900,
      allowedPlatforms: ['web']
    }
  });
  assert.equal(durableProd.status, 201);

  const consProd = await ctx.req(`${ctx.pubBase}/api/billing/creator/products`, {
    method: 'POST',
    cookie: creator.cookie,
    csrf: creator.csrf,
    headers: { Origin: ctx.origin },
    body: {
      gameId: 'match3-garden',
      productKey: 'energy_potion',
      kind: 'consumable',
      title: '에너지 포션',
      currency: 'KRW',
      amountMinor: 1500,
      allowedPlatforms: ['web']
    }
  });
  assert.equal(consProd.status, 201);

  // 5. Mobile & TV platforms are strictly Fail-Closed (403)
  for (const blockedPlatform of ['android', 'ios', 'google_tv', 'apple_tv', 'samsung_tv']) {
    const blocked = await ctx.req(`${ctx.pubBase}/api/billing/direct/orders`, {
      method: 'POST',
      cookie: buyer.cookie,
      csrf: buyer.csrf,
      headers: { Origin: ctx.origin, 'Idempotency-Key': `mob-${blockedPlatform}` },
      body: { productId: durableProd.body.product.id, platform: blockedPlatform }
    });
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.error.code, 'PLATFORM_PAID_SALES_DISABLED');
  }

  // 6. Web direct order uses Stripe-Account Direct Charge with ZERO application_fee_amount
  const directOrd = await ctx.req(`${ctx.pubBase}/api/billing/direct/orders`, {
    method: 'POST',
    cookie: buyer.cookie,
    csrf: buyer.csrf,
    headers: { Origin: ctx.origin, 'Idempotency-Key': 'direct-web-1' },
    body: { productId: durableProd.body.product.id, platform: 'web' }
  });
  assert.equal(directOrd.status, 201, JSON.stringify(directOrd.body));
  assert.equal(directOrd.body.order.platformFeeMinor, 0);
  assert.equal(directOrd.body.checkout.applicationFeeAmount, 0);

  const checkoutCall = stripeCalls.find(c => c.url.endsWith('/v1/checkout/sessions'));
  assert.equal(checkoutCall.headers['Stripe-Account'], 'acct_live_creator_1');
  assert.ok(!checkoutCall.body.includes('application_fee'), 'Direct Charge must NEVER include application_fee');

  // 7. Signed checkout.session.completed webhook grants ACTIVE entitlement without touching PlayCoin wallet
  const payEvt = JSON.stringify({
    id: 'evt_sc_paid_1',
    type: 'checkout.session.completed',
    account: 'acct_live_creator_1',
    data: {
      object: {
        id: 'cs_live_direct_1',
        payment_intent: 'pi_live_direct_1',
        amount_total: 4900,
        currency: 'krw',
        metadata: { direct_order_id: directOrd.body.order.id }
      }
    }
  });
  const payWh = await ctx.req(`${ctx.pubBase}/api/billing/webhooks/stripe-connect`, {
    method: 'POST',
    headers: { 'Stripe-Signature': signStripeWebhook({ rawBody: payEvt, timestampSec: nowSec, secret: ctx.webhookSecret }) },
    body: payEvt
  });
  assert.equal(payWh.status, 200, JSON.stringify(payWh.body));
  assert.equal(payWh.body.result.entitlement.state, 'ACTIVE');

  // Exact replay returns duplicate: true
  const payWhReplay = await ctx.req(`${ctx.pubBase}/api/billing/webhooks/stripe-connect`, {
    method: 'POST',
    headers: { 'Stripe-Signature': signStripeWebhook({ rawBody: payEvt, timestampSec: nowSec, secret: ctx.webhookSecret }) },
    body: payEvt
  });
  assert.equal(payWhReplay.body.duplicate, true);

  // Buyer PlayCoin wallet stays 0 (Track B never enters Track A cash/wallet ledger!)
  const buyerWallet = await ctx.req(`${ctx.pubBase}/api/billing/wallet`, { cookie: buyer.cookie, headers: { Origin: ctx.origin } });
  assert.equal(buyerWallet.body.wallet.available, 0);

  // Entitlement visible via GET /api/billing/entitlements?gameId=match3-garden; durable rejects consume
  const ents = await ctx.req(`${ctx.pubBase}/api/billing/entitlements?gameId=match3-garden`, {
    cookie: buyer.cookie,
    headers: { Origin: ctx.origin }
  });
  assert.equal(ents.body.entitlements.length, 1);
  const durableEntId = ents.body.entitlements[0].id;

  const badConsume = await ctx.req(`${ctx.pubBase}/api/billing/entitlements/${durableEntId}/consume`, {
    method: 'POST',
    cookie: buyer.cookie,
    csrf: buyer.csrf,
    headers: { Origin: ctx.origin, 'Idempotency-Key': 'consume-dur-1' },
    body: {}
  });
  assert.equal(badConsume.status, 422);
  assert.equal(badConsume.body.error.code, 'ENTITLEMENT_NOT_CONSUMABLE');

  // 8. Signed charge.dispute.created webhook immediately REVOKES entitlement
  const dispEvt = JSON.stringify({
    id: 'evt_sc_disp_1',
    type: 'charge.dispute.created',
    account: 'acct_live_creator_1',
    data: {
      object: {
        id: 'dp_live_1',
        payment_intent: 'pi_live_direct_1',
        reason: 'fraudulent',
        metadata: { direct_order_id: directOrd.body.order.id }
      }
    }
  });
  const dispWh = await ctx.req(`${ctx.pubBase}/api/billing/webhooks/stripe-connect`, {
    method: 'POST',
    headers: { 'Stripe-Signature': signStripeWebhook({ rawBody: dispEvt, timestampSec: nowSec, secret: ctx.webhookSecret }) },
    body: dispEvt
  });
  assert.equal(dispWh.status, 200, JSON.stringify(dispWh.body));
  assert.equal(dispWh.body.result.entitlement.state, 'REVOKED');

  const entsAfter = await ctx.req(`${ctx.pubBase}/api/billing/entitlements?gameId=match3-garden`, {
    cookie: buyer.cookie,
    headers: { Origin: ctx.origin }
  });
  assert.equal(entsAfter.body.entitlements.length, 0);

  // 9. Consumable item purchase -> ACTIVE -> consume -> CONSUMED
  const consOrd = await ctx.req(`${ctx.pubBase}/api/billing/direct/orders`, {
    method: 'POST',
    cookie: buyer.cookie,
    csrf: buyer.csrf,
    headers: { Origin: ctx.origin, 'Idempotency-Key': 'direct-cons-1' },
    body: { productId: consProd.body.product.id, platform: 'web' }
  });
  assert.equal(consOrd.status, 201);
  const consPayEvt = JSON.stringify({
    id: 'evt_sc_paid_2',
    type: 'payment_intent.succeeded',
    account: 'acct_live_creator_1',
    data: { object: { id: 'pi_live_cons_1', amount_received: 1500, currency: 'krw', metadata: { direct_order_id: consOrd.body.order.id } } }
  });
  const consWh = await ctx.req(`${ctx.pubBase}/api/billing/webhooks/stripe-connect`, {
    method: 'POST',
    headers: { 'Stripe-Signature': signStripeWebhook({ rawBody: consPayEvt, timestampSec: nowSec, secret: ctx.webhookSecret }) },
    body: consPayEvt
  });
  assert.equal(consWh.status, 200);
  const consEntId = consWh.body.result.entitlement.id;

  const consumed = await ctx.req(`${ctx.pubBase}/api/billing/entitlements/${consEntId}/consume`, {
    method: 'POST',
    cookie: buyer.cookie,
    csrf: buyer.csrf,
    headers: { Origin: ctx.origin, 'Idempotency-Key': 'consume-potion-1' },
    body: {}
  });
  assert.equal(consumed.status, 200);
  assert.equal(consumed.body.entitlement.state, 'CONSUMED');
});

test('Admin RiskControls (product/connection suspend & restore), CS Promo Grant, and Daily Reconciliation auditor', async t => {
  const ctx = await startM3App(t, { stripeSecret: '' }); // mock direct mode
  const admin = await ctx.signInAdmin();
  const creator = await ctx.signInUser();
  const buyer = await ctx.signInUser();
  const nowSec = Math.floor(ctx.now() / 1000);

  // Setup mock direct connection + product
  const onboard = await ctx.req(`${ctx.pubBase}/api/billing/creator/connection/start`, {
    method: 'POST',
    cookie: creator.cookie,
    csrf: creator.csrf,
    headers: { Origin: ctx.origin },
    body: { countryCode: 'KR' }
  });
  assert.equal(onboard.status, 200);
  const connectedAccountId = onboard.body.connection.connectedAccountId;

  const prod = await ctx.req(`${ctx.pubBase}/api/billing/creator/products`, {
    method: 'POST',
    cookie: creator.cookie,
    csrf: creator.csrf,
    headers: { Origin: ctx.origin },
    body: { gameId: 'match3-garden', productKey: 'risk_item', kind: 'durable', title: '리스크 테스트', currency: 'KRW', amountMinor: 3000 }
  });
  const productId = prod.body.product.id;

  // 1. Admin suspends product -> creator CANNOT self-restore, buyer CANNOT purchase
  const suspProd = await ctx.req(`${ctx.admBase}/api/admin/billing/direct/products/${productId}/suspend`, {
    method: 'POST',
    cookie: admin.cookie,
    csrf: admin.csrf,
    headers: { Origin: ctx.adminOrigin },
    body: { reason: 'fraud_report' }
  });
  assert.equal(suspProd.status, 200);
  assert.equal(suspProd.body.product.status, 'SUSPENDED');

  const creatorSelfRestore = await ctx.req(`${ctx.pubBase}/api/billing/creator/products/${productId}`, {
    method: 'PATCH',
    cookie: creator.cookie,
    csrf: creator.csrf,
    headers: { Origin: ctx.origin },
    body: { status: 'ACTIVE' }
  });
  assert.equal(creatorSelfRestore.status, 403);
  assert.equal(creatorSelfRestore.body.error.code, 'PRODUCT_ADMIN_SUSPENDED');

  const blockedBuy = await ctx.req(`${ctx.pubBase}/api/billing/direct/orders`, {
    method: 'POST',
    cookie: buyer.cookie,
    csrf: buyer.csrf,
    headers: { Origin: ctx.origin, 'Idempotency-Key': 'buy-susp-prod' },
    body: { productId, platform: 'web' }
  });
  assert.equal(blockedBuy.status, 403);

  // Admin restores product -> purchase succeeds
  const restProd = await ctx.req(`${ctx.admBase}/api/admin/billing/direct/products/${productId}/restore`, {
    method: 'POST',
    cookie: admin.cookie,
    csrf: admin.csrf,
    headers: { Origin: ctx.adminOrigin },
    body: { reason: 'verified_safe' }
  });
  assert.equal(restProd.status, 200);

  const okOrd = await ctx.req(`${ctx.pubBase}/api/billing/direct/orders`, {
    method: 'POST',
    cookie: buyer.cookie,
    csrf: buyer.csrf,
    headers: { Origin: ctx.origin, 'Idempotency-Key': 'buy-restored-1' },
    body: { productId, platform: 'web' }
  });
  assert.equal(okOrd.status, 201);
  const okConf = await ctx.req(`${ctx.pubBase}/api/billing/direct/orders/${okOrd.body.order.id}/confirm`, {
    method: 'POST',
    cookie: buyer.cookie,
    csrf: buyer.csrf,
    headers: { Origin: ctx.origin, 'Idempotency-Key': 'conf-restored-1' },
    body: { providerChargeId: okOrd.body.checkout.providerChargeId }
  });
  assert.equal(okConf.status, 200);

  // 2. Admin suspends creator connection -> external Stripe webhook CANNOT un-suspend it!
  const suspConn = await ctx.req(`${ctx.admBase}/api/admin/billing/direct/connections/${creator.principalId}/suspend`, {
    method: 'POST',
    cookie: admin.cookie,
    csrf: admin.csrf,
    headers: { Origin: ctx.adminOrigin },
    body: { reason: 'chargeback_spike' }
  });
  assert.equal(suspConn.status, 200);
  assert.equal(suspConn.body.connection.onboardingStatus, 'SUSPENDED');

  const acctOverwrite = JSON.stringify({
    id: 'evt_sc_try_unsuspend',
    type: 'account.updated',
    account: connectedAccountId,
    data: { object: { id: connectedAccountId, charges_enabled: true, payouts_enabled: true } }
  });
  const whRes = await ctx.req(`${ctx.pubBase}/api/billing/webhooks/stripe-connect`, {
    method: 'POST',
    headers: { 'Stripe-Signature': signStripeWebhook({ rawBody: acctOverwrite, timestampSec: nowSec, secret: ctx.webhookSecret }) },
    body: acctOverwrite
  });
  assert.equal(whRes.status, 200);
  assert.equal(whRes.body.connection.onboardingStatus, 'SUSPENDED');
  assert.equal(whRes.body.connection.chargesEnabled, false);

  // 3. Admin CS Promo PlayCoin Grant
  const promo = await ctx.req(`${ctx.admBase}/api/admin/billing/wallets/${buyer.principalId}/promo`, {
    method: 'POST',
    cookie: admin.cookie,
    csrf: admin.csrf,
    headers: { Origin: ctx.adminOrigin, 'Idempotency-Key': 'cs-promo-1' },
    body: { coins: 150, reason: 'beta_welcome_gift' }
  });
  assert.equal(promo.status, 201, JSON.stringify(promo.body));
  assert.equal(promo.body.wallet.promo, 150);

  // 4. Daily Reconciliation checks ALL Track A + Gift Card Liability + Track B 0% Fee invariants
  const rec = await ctx.req(`${ctx.admBase}/api/admin/billing/reconcile`, {
    cookie: admin.cookie,
    headers: { Origin: ctx.adminOrigin }
  });
  assert.equal(rec.status, 200, JSON.stringify(rec.body));
  assert.equal(rec.body.ok, true);
  assert.equal(rec.body.ledgerIntegrity.ok, true);
  assert.equal(rec.body.ledgerIntegrity.globalSum, 0);
  assert.equal(rec.body.trackAChecks.ok, true);
  assert.equal(rec.body.giftcardLiabilityCheck.ok, true);
  assert.equal(rec.body.trackBChecks.ok, true);
  assert.equal(rec.body.trackBChecks.nonZeroConnFees, 0);
  assert.equal(rec.body.trackBChecks.nonZeroOrderFees, 0);
  assert.equal(rec.body.trackBChecks.directOrderLedgerLeaks, 0);
});
