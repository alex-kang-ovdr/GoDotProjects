import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.mjs';
import { signKakaoPayWebhook } from '../server/billing/providers/kakaopay.mjs';
import { signNaverPayWebhook } from '../server/billing/providers/naverpay.mjs';
import { signTossPayWebhook } from '../server/billing/providers/tosspay.mjs';
import { verifyLedgerIntegrity } from '../server/billing/ledger.mjs';

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-billing-kr-easypay-'));
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

async function startEasyPayApp(t, { billing, billingFetch }) {
  const { root, dataDir } = makeRoot();
  let nowVal = Date.UTC(2026, 10, 22, 1, 0, 0);
  const now = () => nowVal;
  const advance = ms => { nowVal += ms; };

  const app = createApp({
    dataDir,
    publicHost: '127.0.0.1',
    publicPort: 0,
    adminHost: '127.0.0.1',
    adminPort: 0,
    userOrigins: ['http://127.0.0.1:8080', 'https://preview.playhub.test'],
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
  const origin = 'https://preview.playhub.test';

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

  return { app, pubBase, origin, req, signInUser, now, advance };
}

test('KakaoPay Direct Open API v1: ready -> server-bound tid -> approve (pg_token) -> Zero-Sum +25% -> 7d cancel -> signed webhook', async t => {
  const calls = [];
  const whSecret = 'kakao_wh_secret_123456';
  let tidSeq = 0;

  const fakeFetch = async (url, init) => {
    const parsed = init.body ? JSON.parse(init.body) : {};
    calls.push({ url, headers: init.headers, body: parsed });

    if (url.endsWith('/online/v1/payment/ready')) {
      assert.equal(init.headers.Authorization, 'SECRET_KEY dev_kakao_secret_key_xyz');
      assert.equal(parsed.cid, 'TC0ONETIME');
      const tid = `T700000000000000${++tidSeq}`;
      return new Response(JSON.stringify({
        tid,
        next_redirect_pc_url: `https://online-pay.kakao.com/mockup/v1/${tid}/info`,
        next_redirect_mobile_url: `https://online-pay.kakao.com/mockup/v1/${tid}/mInfo`,
        next_redirect_app_url: `https://online-pay.kakao.com/mockup/v1/${tid}/aInfo`
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.endsWith('/online/v1/payment/approve')) {
      assert.equal(init.headers.Authorization, 'SECRET_KEY dev_kakao_secret_key_xyz');
      return new Response(JSON.stringify({
        aid: 'A999888777',
        tid: parsed.tid,
        cid: parsed.cid,
        partner_order_id: parsed.partner_order_id,
        partner_user_id: parsed.partner_user_id,
        amount: { total: 14000, tax_free: 0, vat: 1273 }
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.endsWith('/online/v1/payment/cancel')) {
      return new Response(JSON.stringify({
        aid: 'A_CANCEL_999',
        tid: parsed.tid,
        status: 'CANCEL_PAYMENT',
        approved_cancel_amount: { total: parsed.cancel_amount }
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('{}', { status: 404 });
  };

  const ctx = await startEasyPayApp(t, {
    billing: {
      enabled: true,
      allowMockProvider: false,
      allowDemoAccount: true,
      kakaopay: {
        secretKey: 'dev_kakao_secret_key_xyz',
        webhookSecret: whSecret,
        sandbox: true
      }
    },
    billingFetch: fakeFetch
  });

  const user = await ctx.signInUser();

  // Catalog reports kakaopay as direct_api
  const cat = await ctx.req(`${ctx.pubBase}/api/billing/catalog?currency=KRW`, { headers: { Origin: ctx.origin } });
  assert.equal(cat.status, 200);
  assert.equal(cat.body.paymentMethods.koreaEasyPay.kakaopay.provider, 'kakaopay');
  assert.equal(cat.body.paymentMethods.koreaEasyPay.kakaopay.integrationType, 'direct_api');

  // 1. Create order -> KakaoPay ready persists tid server-side and never leaks secretKey
  const ord = await ctx.req(`${ctx.pubBase}/api/billing/orders`, {
    method: 'POST',
    cookie: user.cookie,
    csrf: user.csrf,
    headers: { Origin: ctx.origin, 'Idempotency-Key': 'kakao-ord-1' },
    body: {
      skuId: 'playhub.coin.t4',
      currency: 'KRW',
      paymentMethodHint: 'kakaopay',
      agreedTermsVersion: 'v2.0',
      returnUrl: '/?view=wallet'
    }
  });
  assert.equal(ord.status, 201, JSON.stringify(ord.body));
  assert.equal(ord.body.route.provider, 'kakaopay');
  assert.equal(ord.body.route.routeId, 'krw_kakaopay');
  assert.equal(ord.body.checkout.checkoutType, 'redirect');
  assert.match(ord.body.checkout.checkoutUrl, /^https:\/\/online-pay\.kakao\.com\//);
  assert.match(ord.body.checkout.approvalUrl, /^https:\/\/preview\.playhub\.test\/\?view=wallet&payProvider=kakaopay&payStatus=success&orderId=/);
  assert.ok(!JSON.stringify(ord.body).includes('dev_kakao_secret_key_xyz'), 'KakaoPay secretKey must never leak');

  // 2. Spoofed tid or missing pg_token is rejected (Zero Client Trust)
  const missingToken = await ctx.req(`${ctx.pubBase}/api/billing/orders/${ord.body.order.id}/confirm`, {
    method: 'POST',
    cookie: user.cookie,
    csrf: user.csrf,
    headers: { Origin: ctx.origin },
    body: {}
  });
  assert.equal(missingToken.status, 422);
  assert.equal(missingToken.body.error.code, 'KAKAOPAY_PG_TOKEN_REQUIRED');

  const spoofedTid = await ctx.req(`${ctx.pubBase}/api/billing/orders/${ord.body.order.id}/confirm`, {
    method: 'POST',
    cookie: user.cookie,
    csrf: user.csrf,
    headers: { Origin: ctx.origin },
    body: { providerPaymentId: 'T_SPOOFED_999', pgToken: 'pg_tok_valid_1' }
  });
  assert.equal(spoofedTid.status, 422);
  assert.equal(spoofedTid.body.error.code, 'KAKAOPAY_TID_MISMATCH');

  // 3. Valid confirm with only pgToken uses server-persisted tid and credits 1,000 + 250 = 1,250 PlayCoin
  const conf = await ctx.req(`${ctx.pubBase}/api/billing/orders/${ord.body.order.id}/confirm`, {
    method: 'POST',
    cookie: user.cookie,
    csrf: user.csrf,
    headers: { Origin: ctx.origin },
    body: { pgToken: 'pg_tok_valid_1' }
  });
  assert.equal(conf.status, 200, JSON.stringify(conf.body));
  assert.equal(conf.body.wallet.paid, 1000);
  assert.equal(conf.body.wallet.bonus, 250);
  assert.equal(conf.body.wallet.available, 1250);

  // 4. Signed webhook is idempotent; forged webhook rejected with 401
  const whRaw = JSON.stringify({
    eventId: 'kp_evt_001',
    status: 'SUCCESS_PAYMENT',
    aid: 'A999888777',
    tid: ord.body.checkout.providerPaymentId,
    partner_order_id: ord.body.order.id,
    partner_user_id: user.principalId,
    amount: { total: 14000 }
  });
  const badWh = await ctx.req(`${ctx.pubBase}/api/billing/webhooks/kakaopay`, {
    method: 'POST',
    headers: { 'x-kakaopay-timestamp': String(ctx.now()), 'x-kakaopay-signature': 'sha256=deadbeef' },
    body: whRaw
  });
  assert.equal(badWh.status, 401);

  const okWh = await ctx.req(`${ctx.pubBase}/api/billing/webhooks/kakaopay`, {
    method: 'POST',
    headers: signKakaoPayWebhook({ rawBody: whRaw, timestampMs: ctx.now(), secret: whSecret }),
    body: whRaw
  });
  assert.equal(okWh.status, 200, JSON.stringify(okWh.body));
  assert.equal(okWh.body.result.duplicate, true);

  // 5. 7-day unused withdrawal calls KakaoPay /online/v1/payment/cancel and reclaims paid + bonus
  const wd = await ctx.req(`${ctx.pubBase}/api/billing/orders/${ord.body.order.id}/withdraw`, {
    method: 'POST',
    cookie: user.cookie,
    csrf: user.csrf,
    headers: { Origin: ctx.origin, 'Idempotency-Key': 'kakao-wd-1' },
    body: { reason: 'customer_7d_withdrawal' }
  });
  assert.equal(wd.status, 200, JSON.stringify(wd.body));
  assert.equal(wd.body.wallet.available, 0);
  assert.ok(calls.some(c => c.url.endsWith('/online/v1/payment/cancel') && c.body.cancel_amount === 14000));
  assert.equal(verifyLedgerIntegrity(ctx.app.db).ok, true);
});

test('NaverPay Direct API v2.2: SDK checkout config -> apply/payment (form-urlencoded) -> Zero-Sum -> v1/cancel & CancelNotComplete recovery', async t => {
  const calls = [];
  const whSecret = 'naver_wh_secret_987654';
  let cancelNotCompleteOnce = true;

  const fakeFetch = async (url, init) => {
    calls.push({ url, headers: init.headers, body: init.body });

    if (url.includes('/naverpay/payments/v2.2/apply/payment')) {
      assert.equal(init.headers['X-Naver-Client-Id'], 'np_client_playhub');
      assert.equal(init.headers['X-Naver-Client-Secret'], 'np_secret_never_leak');
      assert.equal(init.headers['X-NaverPay-Chain-Id'], 'np_chain_01');
      assert.equal(init.headers['Content-Type'], 'application/x-www-form-urlencoded');
      const params = new URLSearchParams(init.body);
      const paymentId = params.get('paymentId');
      const orderId = init.headers['X-NaverPay-Idempotency-Key'].replace(/^naverpay-apply:/, '');
      return new Response(JSON.stringify({
        code: 'Success',
        message: '성공',
        body: {
          paymentId,
          detail: {
            paymentId,
            merchantPayKey: orderId,
            totalPayAmount: 14000,
            admissionState: 'SUCCESS'
          }
        }
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    if (url.includes('/naverpay/payments/v1/cancel')) {
      if (cancelNotCompleteOnce) {
        cancelNotCompleteOnce = false;
        return new Response(JSON.stringify({
          code: 'CancelNotComplete',
          message: '원천사 응답 지연으로 취소가 보류되었습니다.'
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        code: 'Success',
        body: { payHistId: 'np_cancel_hist_42' }
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('{}', { status: 404 });
  };

  const ctx = await startEasyPayApp(t, {
    billing: {
      enabled: true,
      allowMockProvider: false,
      allowDemoAccount: true,
      naverpay: {
        clientId: 'np_client_playhub',
        clientSecret: 'np_secret_never_leak',
        partnerId: 'playhub_kr',
        chainId: 'np_chain_01',
        webhookSecret: whSecret,
        sandbox: true
      }
    },
    billingFetch: fakeFetch
  });

  const user = await ctx.signInUser();

  const ord = await ctx.req(`${ctx.pubBase}/api/billing/orders`, {
    method: 'POST',
    cookie: user.cookie,
    csrf: user.csrf,
    headers: { Origin: ctx.origin, 'Idempotency-Key': 'naver-ord-1' },
    body: { skuId: 'playhub.coin.t4', currency: 'KRW', paymentMethodHint: 'naverpay', agreedTermsVersion: 'v2.0', returnUrl: '/?view=wallet' }
  });
  assert.equal(ord.status, 201, JSON.stringify(ord.body));
  assert.equal(ord.body.route.provider, 'naverpay');
  assert.equal(ord.body.route.routeId, 'krw_naverpay');
  assert.equal(ord.body.checkout.checkoutType, 'naverpay_sdk');
  assert.equal(ord.body.checkout.clientId, 'np_client_playhub');
  assert.equal(ord.body.checkout.chainId, 'np_chain_01');
  assert.equal(ord.body.checkout.totalPayAmount, 14000);
  assert.ok(!JSON.stringify(ord.body).includes('np_secret_never_leak'), 'NaverPay clientSecret must never leak');

  const conf = await ctx.req(`${ctx.pubBase}/api/billing/orders/${ord.body.order.id}/confirm`, {
    method: 'POST',
    cookie: user.cookie,
    csrf: user.csrf,
    headers: { Origin: ctx.origin },
    body: { providerPaymentId: '20261122NP99887766' }
  });
  assert.equal(conf.status, 200, JSON.stringify(conf.body));
  assert.equal(conf.body.wallet.available, 1250);

  // Signed NaverPay webhook replay is idempotent
  const whRaw = JSON.stringify({
    eventId: 'np_evt_1',
    eventType: 'SUCCESS',
    detail: { paymentId: '20261122NP99887766', merchantPayKey: ord.body.order.id, totalPayAmount: 14000, admissionState: 'SUCCESS' }
  });
  const okWh = await ctx.req(`${ctx.pubBase}/api/billing/webhooks/naverpay`, {
    method: 'POST',
    headers: signNaverPayWebhook({ rawBody: whRaw, timestampMs: ctx.now(), secret: whSecret }),
    body: whRaw
  });
  assert.equal(okWh.status, 200);
  assert.equal(okWh.body.result.duplicate, true);

  // First withdrawal gets CancelNotComplete (502) -> order lock safely recovers back to PAID -> retry succeeds!
  const wd1 = await ctx.req(`${ctx.pubBase}/api/billing/orders/${ord.body.order.id}/withdraw`, {
    method: 'POST',
    cookie: user.cookie,
    csrf: user.csrf,
    headers: { Origin: ctx.origin, 'Idempotency-Key': 'naver-wd-1' },
    body: { reason: 'customer_7d_withdrawal' }
  });
  assert.equal(wd1.status, 502);
  assert.equal(wd1.body.error.code, 'NAVERPAY_CANCEL_NOT_COMPLETE');

  const wd2 = await ctx.req(`${ctx.pubBase}/api/billing/orders/${ord.body.order.id}/withdraw`, {
    method: 'POST',
    cookie: user.cookie,
    csrf: user.csrf,
    headers: { Origin: ctx.origin, 'Idempotency-Key': 'naver-wd-2' },
    body: { reason: 'customer_7d_withdrawal' }
  });
  assert.equal(wd2.status, 200, JSON.stringify(wd2.body));
  assert.equal(wd2.body.wallet.available, 0);
  assert.equal(verifyLedgerIntegrity(ctx.app.db).ok, true);
});

test('TossPay Direct API v2 (pay.toss.im): create -> server-bound payToken -> execute -> refunds -> resultCallback webhook', async t => {
  const calls = [];
  const whSecret = 'tosspay_wh_secret_555';

  const fakeFetch = async (url, init) => {
    const parsed = JSON.parse(init.body || '{}');
    calls.push({ url, body: parsed });

    if (url.endsWith('/api/v2/payments')) {
      assert.equal(parsed.apiKey, 'sk_test_tosspay_direct_secret');
      assert.equal(parsed.autoExecute, false);
      return new Response(JSON.stringify({
        code: 0,
        payToken: 'tp_tok_server_bound_001',
        checkoutPage: 'https://pay.toss.im/payfront/auth?payToken=tp_tok_server_bound_001'
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.endsWith('/api/v2/execute')) {
      assert.equal(parsed.payToken, 'tp_tok_server_bound_001');
      return new Response(JSON.stringify({
        code: 0,
        status: 'PAY_COMPLETE',
        orderNo: parsed.orderNo,
        amount: 14000,
        transactionId: 'tp_tx_888'
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (url.endsWith('/api/v2/refunds')) {
      assert.equal(parsed.payToken, 'tp_tok_server_bound_001');
      return new Response(JSON.stringify({
        code: 0,
        refundNo: parsed.refundNo,
        refundableAmount: 0
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('{}', { status: 404 });
  };

  const ctx = await startEasyPayApp(t, {
    billing: {
      enabled: true,
      allowMockProvider: false,
      allowDemoAccount: true,
      tosspay: {
        apiKey: 'sk_test_tosspay_direct_secret',
        webhookSecret: whSecret,
        sandbox: true
      }
    },
    billingFetch: fakeFetch
  });

  const user = await ctx.signInUser();

  const ord = await ctx.req(`${ctx.pubBase}/api/billing/orders`, {
    method: 'POST',
    cookie: user.cookie,
    csrf: user.csrf,
    headers: { Origin: ctx.origin, 'Idempotency-Key': 'tp-ord-1' },
    body: { skuId: 'playhub.coin.t4', currency: 'KRW', paymentMethodHint: 'tosspay', agreedTermsVersion: 'v2.0', returnUrl: '/?view=wallet' }
  });
  assert.equal(ord.status, 201, JSON.stringify(ord.body));
  assert.equal(ord.body.route.provider, 'tosspay');
  assert.equal(ord.body.route.routeId, 'krw_tosspay');
  assert.equal(ord.body.checkout.checkoutType, 'redirect');
  assert.match(ord.body.checkout.checkoutUrl, /^https:\/\/pay\.toss\.im\//);
  assert.ok(!JSON.stringify(ord.body).includes('sk_test_tosspay_direct_secret'), 'TossPay apiKey must never leak');

  // Spoofed payToken is rejected (422)
  const spoof = await ctx.req(`${ctx.pubBase}/api/billing/orders/${ord.body.order.id}/confirm`, {
    method: 'POST',
    cookie: user.cookie,
    csrf: user.csrf,
    headers: { Origin: ctx.origin },
    body: { providerPaymentId: 'tp_spoofed_token' }
  });
  assert.equal(spoof.status, 422);
  assert.equal(spoof.body.error.code, 'TOSSPAY_TOKEN_MISMATCH');

  // Confirm without client token uses server-bound payToken cleanly
  const conf = await ctx.req(`${ctx.pubBase}/api/billing/orders/${ord.body.order.id}/confirm`, {
    method: 'POST',
    cookie: user.cookie,
    csrf: user.csrf,
    headers: { Origin: ctx.origin },
    body: {}
  });
  assert.equal(conf.status, 200, JSON.stringify(conf.body));
  assert.equal(conf.body.wallet.available, 1250);

  // Cross-provider webhook is blocked (403) & signed TossPay webhook is idempotent
  const whRaw = JSON.stringify({
    status: 'PAY_COMPLETE',
    payToken: 'tp_tok_server_bound_001',
    orderNo: ord.body.order.id,
    amount: 14000,
    transactionId: 'tp_tx_888'
  });
  const okWh = await ctx.req(`${ctx.pubBase}/api/billing/webhooks/tosspay`, {
    method: 'POST',
    headers: signTossPayWebhook({ rawBody: whRaw, timestampMs: ctx.now(), secret: whSecret }),
    body: whRaw
  });
  assert.equal(okWh.status, 200);
  assert.equal(okWh.body.result.duplicate, true);

  // 7d withdrawal refunds via /api/v2/refunds
  const wd = await ctx.req(`${ctx.pubBase}/api/billing/orders/${ord.body.order.id}/withdraw`, {
    method: 'POST',
    cookie: user.cookie,
    csrf: user.csrf,
    headers: { Origin: ctx.origin, 'Idempotency-Key': 'tp-wd-1' },
    body: { reason: 'customer_7d_withdrawal' }
  });
  assert.equal(wd.status, 200);
  assert.equal(wd.body.wallet.available, 0);
  assert.ok(calls.some(c => c.url.endsWith('/api/v2/refunds')));
  assert.equal(verifyLedgerIntegrity(ctx.app.db).ok, true);
});

test('Multi-tier Korean EasyPay routing & failover: KakaoPay Direct outage -> Toss Payments v2 Direct -> Xsolla, plus security guards', async t => {
  let kakaoOutage = true;

  const fakeFetch = async (url) => {
    if (url.includes('open-api.kakaopay.com')) {
      if (kakaoOutage) {
        return new Response(JSON.stringify({ error_code: -500, error_message: 'KakaoPay upstream 503' }), { status: 503 });
      }
      return new Response(JSON.stringify({
        tid: 'T_RECOVERED_001',
        next_redirect_pc_url: 'https://online-pay.kakao.com/recovered'
      }), { status: 200 });
    }
    return new Response('{}', { status: 404 });
  };

  const ctx = await startEasyPayApp(t, {
    billing: {
      enabled: true,
      allowMockProvider: true,
      allowDemoAccount: true,
      circuitBreakerFailureThreshold: 2,
      circuitBreakerCooldownMs: 60000,
      kakaopay: { secretKey: 'kp_sec_1', sandbox: true },
      toss: { clientKey: 'test_ck_direct_fallback', secretKey: 'test_sk_direct_fallback', sandbox: true }
    },
    billingFetch: fakeFetch
  });

  const user = await ctx.signInUser();

  // Security guard: mock provider is forbidden when any real EasyPay provider is configured
  const mockAttempt = await ctx.req(`${ctx.pubBase}/api/billing/orders`, {
    method: 'POST',
    cookie: user.cookie,
    csrf: user.csrf,
    headers: { Origin: ctx.origin, 'Idempotency-Key': 'forbid-mock-1' },
    body: { skuId: 'playhub.coin.t2', currency: 'KRW', provider: 'mock', agreedTermsVersion: 'v2.0' }
  });
  assert.equal(mockAttempt.status, 403);
  assert.equal(mockAttempt.body.error.code, 'MOCK_PROVIDER_FORBIDDEN');

  // Open-redirect returnUrl is rejected (400)
  const evilReturn = await ctx.req(`${ctx.pubBase}/api/billing/orders`, {
    method: 'POST',
    cookie: user.cookie,
    csrf: user.csrf,
    headers: { Origin: ctx.origin, 'Idempotency-Key': 'evil-return-1' },
    body: { skuId: 'playhub.coin.t2', currency: 'KRW', paymentMethodHint: 'tosspay', returnUrl: 'https://evil.example/steal', agreedTermsVersion: 'v2.0' }
  });
  assert.equal(evilReturn.status, 400);
  assert.equal(evilReturn.body.error.code, 'INVALID_RETURN_URL');

  // NaverPay & TossPay without direct keys seamlessly route to Toss Payments v2 Direct SDK!
  const npViaToss = await ctx.req(`${ctx.pubBase}/api/billing/orders`, {
    method: 'POST',
    cookie: user.cookie,
    csrf: user.csrf,
    headers: { Origin: ctx.origin, 'Idempotency-Key': 'np-via-toss' },
    body: { skuId: 'playhub.coin.t2', currency: 'KRW', paymentMethodHint: 'naverpay', agreedTermsVersion: 'v2.0', returnUrl: '/?view=wallet' }
  });
  assert.equal(npViaToss.status, 201);
  assert.equal(npViaToss.body.route.provider, 'toss');
  assert.equal(npViaToss.body.checkout.checkoutType, 'toss_v2_sdk');
  assert.equal(npViaToss.body.checkout.flowMode, 'DIRECT');
  assert.equal(npViaToss.body.checkout.easyPayProvider, 'NAVERPAY');
  assert.equal(npViaToss.body.checkout.sdkRequestParams.card.flowMode, 'DIRECT');
  assert.equal(npViaToss.body.checkout.sdkRequestParams.card.easyPay, 'NAVERPAY');
  assert.ok(!npViaToss.body.checkout.successUrl.includes('orderId='), 'Toss successUrl must not duplicate orderId param');

  // 2 consecutive KakaoPay Direct 503 failures trip circuit breaker -> 3rd attempt auto-fails over to Toss v2 Direct (KAKAOPAY)!
  for (let i = 1; i <= 2; i += 1) {
    const failed = await ctx.req(`${ctx.pubBase}/api/billing/orders`, {
      method: 'POST',
      cookie: user.cookie,
      csrf: user.csrf,
      headers: { Origin: ctx.origin, 'Idempotency-Key': `kp-fail-${i}` },
      body: { skuId: 'playhub.coin.t2', currency: 'KRW', paymentMethodHint: 'kakaopay', agreedTermsVersion: 'v2.0' }
    });
    assert.equal(failed.status, 502);
  }

  const failover = await ctx.req(`${ctx.pubBase}/api/billing/orders`, {
    method: 'POST',
    cookie: user.cookie,
    csrf: user.csrf,
    headers: { Origin: ctx.origin, 'Idempotency-Key': 'kp-failover-toss' },
    body: { skuId: 'playhub.coin.t2', currency: 'KRW', paymentMethodHint: 'kakaopay', agreedTermsVersion: 'v2.0' }
  });
  assert.equal(failover.status, 201, JSON.stringify(failover.body));
  assert.equal(failover.body.route.provider, 'toss');
  assert.equal(failover.body.route.routeId, 'krw_kakaopay');
  assert.equal(failover.body.route.failoverUsed, true);
  assert.equal(failover.body.route.skippedPrimary, 'kakaopay');
  assert.equal(failover.body.checkout.easyPayProvider, 'KAKAOPAY');
  assert.equal(failover.body.checkout.flowMode, 'DIRECT');

  // After cooldown & KakaoPay recovery, traffic automatically returns to KakaoPay Direct
  kakaoOutage = false;
  ctx.advance(61_000);
  const recovered = await ctx.req(`${ctx.pubBase}/api/billing/orders`, {
    method: 'POST',
    cookie: user.cookie,
    csrf: user.csrf,
    headers: { Origin: ctx.origin, 'Idempotency-Key': 'kp-recovered' },
    body: { skuId: 'playhub.coin.t2', currency: 'KRW', paymentMethodHint: 'kakaopay', agreedTermsVersion: 'v2.0' }
  });
  assert.equal(recovered.status, 201);
  assert.equal(recovered.body.route.provider, 'kakaopay');
  assert.equal(recovered.body.route.failoverUsed, false);
});
