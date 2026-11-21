import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.mjs';
import { verifyLedgerIntegrity, SYS_ACCOUNTS } from '../server/billing/ledger.mjs';

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-billing-m2-'));
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

async function startM2App(t, { billingOverrides = {} } = {}) {
  const { root, dataDir } = makeRoot();
  let nowVal = Date.UTC(2026, 10, 21, 5, 0, 0);
  const now = () => nowVal;
  const advance = ms => { nowVal += ms; };
  const internalSecret = 'test-internal-billing-secret-32chars-ok';
  const giftcardPepper = 'test-giftcard-hmac-pepper-32chars-minimum';

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
      giftcardPepper,
      internalSecret,
      ...billingOverrides
    }
  }, { rootDir: root, clock: now });

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

  async function signInDemo() {
    const s = await req(`${pubBase}/api/session`, { headers: { Origin: origin } });
    const cookie = `poc_public_session=${parseSetCookie(s.res, 'poc_public_session')}`;
    const r = await req(`${pubBase}/api/billing/demo-signin`, {
      method: 'POST',
      cookie,
      csrf: s.body.csrfToken,
      headers: { Origin: origin },
      body: {}
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const nextCookie = `poc_public_session=${parseSetCookie(r.res, 'poc_public_session')}`;
    const wallet = await req(`${pubBase}/api/billing/wallet`, { cookie: nextCookie, headers: { Origin: origin } });
    return { cookie: nextCookie, csrf: r.body.csrfToken, principalId: wallet.body.wallet.principalId };
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
    assert.equal(login.status, 200, JSON.stringify(login.body));
    return {
      cookie: `poc_admin_session=${parseSetCookie(login.res, 'poc_admin_session')}`,
      csrf: login.body.csrfToken
    };
  }

  return { app, pubBase, admBase, origin, adminOrigin, internalSecret, req, signInDemo, signInAdmin, now, advance };
}

test('Gift card batch issuance (HMAC zero plaintext, <=25% cap), activation liability, preview, atomic redeem & void reversal', async t => {
  const ctx = await startM2App(t);
  const admin = await ctx.signInAdmin();
  const user = await ctx.signInDemo();

  // 1. Bonus hard cap >25% rejected on batch issuance
  const overCap = await ctx.req(`${ctx.admBase}/api/admin/billing/giftcards/batches`, {
    method: 'POST',
    cookie: admin.cookie,
    csrf: admin.csrf,
    headers: { Origin: ctx.adminOrigin },
    body: {
      channel: 'gift_card_direct',
      partnerName: 'playhub_store',
      currency: 'KRW',
      faceValueMinor: 14000,
      baseCoins: 1000,
      bonusBps: 2600,
      quantity: 2
    }
  });
  assert.equal(overCap.status, 422);
  assert.equal(overCap.body.error.code, 'BONUS_BPS_EXCEEDS_25_PERCENT_CAP');

  // 2. Issue 3 unactivated direct gift cards (+25% -> 1000 + 250 = 1250 PlayCoin)
  const issued = await ctx.req(`${ctx.admBase}/api/admin/billing/giftcards/batches`, {
    method: 'POST',
    cookie: admin.cookie,
    csrf: admin.csrf,
    headers: { Origin: ctx.adminOrigin },
    body: {
      channel: 'gift_card_direct',
      partnerName: 'playhub_store',
      currency: 'KRW',
      faceValueMinor: 14000,
      baseCoins: 1000,
      bonusBps: 2500,
      quantity: 3,
      activateImmediately: false
    }
  });
  assert.equal(issued.status, 201, JSON.stringify(issued.body));
  assert.equal(issued.body.oneTimePins.length, 3);
  assert.ok(issued.body.csv.includes(issued.body.oneTimePins[0].pin));

  const [card1, card2, card3] = issued.body.oneTimePins;
  const batchId = issued.body.batch.id;

  // 3. Verify ZERO plaintext PIN is stored anywhere in billing_giftcards
  const dbRows = ctx.app.db.prepare('SELECT * FROM billing_giftcards WHERE batch_id=?').all(batchId);
  assert.equal(dbRows.length, 3);
  const rawDbDump = JSON.stringify(dbRows);
  for (const c of issued.body.oneTimePins) {
    assert.ok(!rawDbDump.includes(c.pin), 'Formatted plaintext PIN must never be stored in DB');
    assert.ok(!rawDbDump.includes(c.pin.replace(/-/g, '')), 'Stripped plaintext PIN must never be stored in DB');
  }

  // 4. Unactivated card cannot be previewed or redeemed
  const preUnact = await ctx.req(`${ctx.pubBase}/api/billing/giftcards/preview`, {
    method: 'POST',
    cookie: user.cookie,
    csrf: user.csrf,
    headers: { Origin: ctx.origin },
    body: { pin: card1.pin }
  });
  assert.equal(preUnact.status, 404);
  assert.equal(preUnact.body.error.code, 'GIFTCARD_INVALID_OR_UNAVAILABLE');

  // 5. Admin activates batch -> books +3,000 PlayCoin in sys:liability:gc_unredeemed
  const act = await ctx.req(`${ctx.admBase}/api/admin/billing/giftcards/batches/${batchId}/activate`, {
    method: 'POST',
    cookie: admin.cookie,
    csrf: admin.csrf,
    headers: { Origin: ctx.adminOrigin },
    body: {}
  });
  assert.equal(act.status, 200, JSON.stringify(act.body));
  assert.equal(act.body.activatedCount, 3);
  assert.ok(act.body.liabilityEntryId);
  assert.equal(verifyLedgerIntegrity(ctx.app.db).ok, true);

  const gcLiabilityAfterAct = ctx.app.db.prepare(
    'SELECT COALESCE(SUM(signed_coins), 0) AS bal FROM billing_journal_lines WHERE account_code=?'
  ).get(SYS_ACCOUNTS.GC_UNREDEEMED).bal;
  assert.equal(gcLiabilityAfterAct, 3000);

  // 6. Preview active card #1 (accepts lowercase / spaces / no hyphens)
  const preview = await ctx.req(`${ctx.pubBase}/api/billing/giftcards/preview`, {
    method: 'POST',
    cookie: user.cookie,
    csrf: user.csrf,
    headers: { Origin: ctx.origin },
    body: { pin: card1.pin.toLowerCase().replace(/-/g, ' ') }
  });
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  assert.equal(preview.body.baseCoins, 1000);
  assert.equal(preview.body.bonusCoins, 250);
  assert.equal(preview.body.totalCoins, 1250);
  assert.equal(preview.body.bonusPercent, 25);

  // 7. Atomic redemption + idempotent replay + duplicate rejection
  const redeem1 = await ctx.req(`${ctx.pubBase}/api/billing/giftcards/redeem`, {
    method: 'POST',
    cookie: user.cookie,
    csrf: user.csrf,
    headers: { Origin: ctx.origin, 'Idempotency-Key': 'gc-idem-1' },
    body: { pin: card1.pin }
  });
  assert.equal(redeem1.status, 200, JSON.stringify(redeem1.body));
  assert.equal(redeem1.body.replayed, false);
  assert.equal(redeem1.body.wallet.paid, 1000);
  assert.equal(redeem1.body.wallet.bonus, 250);
  assert.equal(redeem1.body.wallet.available, 1250);

  // Exact same Idempotency-Key -> safe replay, no double credit
  const redeemReplay = await ctx.req(`${ctx.pubBase}/api/billing/giftcards/redeem`, {
    method: 'POST',
    cookie: user.cookie,
    csrf: user.csrf,
    headers: { Origin: ctx.origin, 'Idempotency-Key': 'gc-idem-1' },
    body: { pin: card1.pin }
  });
  assert.equal(redeemReplay.status, 200);
  assert.equal(redeemReplay.body.replayed, true);
  assert.equal(redeemReplay.body.wallet.available, 1250);

  // New Idempotency-Key on already redeemed card -> 409
  const redeemAgain = await ctx.req(`${ctx.pubBase}/api/billing/giftcards/redeem`, {
    method: 'POST',
    cookie: user.cookie,
    csrf: user.csrf,
    headers: { Origin: ctx.origin, 'Idempotency-Key': 'gc-idem-2' },
    body: { pin: card1.pin }
  });
  assert.equal(redeemAgain.status, 409);
  assert.equal(redeemAgain.body.error.code, 'GIFTCARD_ALREADY_REDEEMED');

  // Gift card order cannot trigger PG 7-day auto-withdrawal
  const gcWithdraw = await ctx.req(`${ctx.pubBase}/api/billing/orders/${redeem1.body.orderId}/withdraw`, {
    method: 'POST',
    cookie: user.cookie,
    csrf: user.csrf,
    headers: { Origin: ctx.origin, 'Idempotency-Key': 'gc-wd-1' },
    body: {}
  });
  assert.equal(gcWithdraw.status, 409);
  assert.equal(gcWithdraw.body.error.code, 'GIFTCARD_ORDER_NOT_AUTO_WITHDRAWABLE');

  // 8. Admin voids single stolen card #2 by serial -> reverses 1,000 liability
  const voidOne = await ctx.req(`${ctx.admBase}/api/admin/billing/giftcards/${card2.serialNo}/void`, {
    method: 'POST',
    cookie: admin.cookie,
    csrf: admin.csrf,
    headers: { Origin: ctx.adminOrigin },
    body: { reason: 'reported_stolen' }
  });
  assert.equal(voidOne.status, 200, JSON.stringify(voidOne.body));
  assert.equal(voidOne.body.state, 'VOIDED');
  assert.ok(voidOne.body.reversalEntryId);

  // 9. Admin voids remaining batch -> voids card #3, preserves redeemed card #1, liability returns to 0
  const voidBatch = await ctx.req(`${ctx.admBase}/api/admin/billing/giftcards/batches/${batchId}/void`, {
    method: 'POST',
    cookie: admin.cookie,
    csrf: admin.csrf,
    headers: { Origin: ctx.adminOrigin },
    body: { reason: 'batch_recall' }
  });
  assert.equal(voidBatch.status, 200);
  assert.equal(voidBatch.body.voidedCount, 1);

  const gcLiabilityEnd = ctx.app.db.prepare(
    'SELECT COALESCE(SUM(signed_coins), 0) AS bal FROM billing_journal_lines WHERE account_code=?'
  ).get(SYS_ACCOUNTS.GC_UNREDEEMED).bal;
  assert.equal(gcLiabilityEnd, 0, 'All activated gift card liability accounted for (1 redeemed + 2 voided)');
  assert.equal(verifyLedgerIntegrity(ctx.app.db).ok, true);

  // Batch listing reflects exact counts: 1 REDEEMED, 2 VOIDED
  const listRes = await ctx.req(`${ctx.admBase}/api/admin/billing/giftcards/batches`, {
    cookie: admin.cookie,
    headers: { Origin: ctx.adminOrigin }
  });
  assert.equal(listRes.status, 200);
  const found = listRes.body.batches.find(b => b.id === batchId);
  assert.equal(found.counts.REDEEMED, 1);
  assert.equal(found.counts.VOIDED, 2);
});

test('Gift card brute-force guard locks account & IP after 5 invalid PIN attempts and unlocks after 15 minutes', async t => {
  const ctx = await startM2App(t);
  const user1 = await ctx.signInDemo();
  const user2 = await ctx.signInDemo();

  // Issue a valid active demo gift card first
  const demoCard = await ctx.req(`${ctx.pubBase}/api/billing/giftcards/demo-issue`, {
    method: 'POST',
    cookie: user1.cookie,
    csrf: user1.csrf,
    headers: { Origin: ctx.origin },
    body: { channel: 'gift_card_direct' }
  });
  assert.equal(demoCard.status, 201);
  const validPin = demoCard.body.card.pin;

  // 4 bad attempts -> 404
  for (let i = 0; i < 4; i++) {
    const r = await ctx.req(`${ctx.pubBase}/api/billing/giftcards/preview`, {
      method: 'POST',
      cookie: user1.cookie,
      csrf: user1.csrf,
      headers: { Origin: ctx.origin },
      body: { pin: `AAAA-BBBB-CCCC-000${i}` }
    });
    assert.equal(r.status, 404);
  }

  // 5th bad attempt triggers 429 lockout
  const fifth = await ctx.req(`${ctx.pubBase}/api/billing/giftcards/preview`, {
    method: 'POST',
    cookie: user1.cookie,
    csrf: user1.csrf,
    headers: { Origin: ctx.origin },
    body: { pin: 'AAAA-BBBB-CCCC-9999' }
  });
  assert.equal(fifth.status, 429);
  assert.equal(fifth.body.error.code, 'GIFTCARD_BRUTEFORCE_LOCKED');

  // Even a valid PIN is blocked while locked (both user1 and user2 sharing loopback IP)
  const blockedValid = await ctx.req(`${ctx.pubBase}/api/billing/giftcards/preview`, {
    method: 'POST',
    cookie: user1.cookie,
    csrf: user1.csrf,
    headers: { Origin: ctx.origin },
    body: { pin: validPin }
  });
  assert.equal(blockedValid.status, 429);

  const blockedSameIp = await ctx.req(`${ctx.pubBase}/api/billing/giftcards/preview`, {
    method: 'POST',
    cookie: user2.cookie,
    csrf: user2.csrf,
    headers: { Origin: ctx.origin },
    body: { pin: validPin }
  });
  assert.equal(blockedSameIp.status, 429);

  // Advance clock 15 minutes + 1 second -> lockout expires and valid PIN succeeds
  ctx.advance(15 * 60_000 + 1000);
  const unlocked = await ctx.req(`${ctx.pubBase}/api/billing/giftcards/preview`, {
    method: 'POST',
    cookie: user1.cookie,
    csrf: user1.csrf,
    headers: { Origin: ctx.origin },
    body: { pin: validPin }
  });
  assert.equal(unlocked.status, 200, JSON.stringify(unlocked.body));
  assert.equal(unlocked.body.totalCoins, 1250);
});

test('Track A UsageMetering & Hold/Capture S2S HTTP API, user usage view, and Anti-Bonus-Stripping E2E', async t => {
  const ctx = await startM2App(t);
  const admin = await ctx.signInAdmin();
  const user = await ctx.signInDemo();

  // Top up 1,000 paid + 250 bonus = 1,250 PlayCoin via mock order
  const ord = await ctx.req(`${ctx.pubBase}/api/billing/orders`, {
    method: 'POST',
    cookie: user.cookie,
    csrf: user.csrf,
    headers: { Origin: ctx.origin, 'Idempotency-Key': 'm2-topup-1' },
    body: { skuId: 'playhub.coin.t4', currency: 'KRW', agreedTermsVersion: 'v2.0' }
  });
  assert.equal(ord.status, 201);
  const conf = await ctx.req(`${ctx.pubBase}/api/billing/orders/${ord.body.order.id}/confirm`, {
    method: 'POST',
    cookie: user.cookie,
    csrf: user.csrf,
    headers: { Origin: ctx.origin },
    body: { providerPaymentId: ord.body.checkout.providerPaymentId, amountMinor: 14000 }
  });
  assert.equal(conf.status, 200);
  assert.equal(conf.body.wallet.available, 1250);

  // 1. Browser Origin or bad internal secret blocked on S2S usage endpoints
  const browserOrigin = await ctx.req(`${ctx.pubBase}/api/billing/usage`, {
    method: 'POST',
    headers: { Origin: ctx.origin, 'X-PlayHub-Billing-Secret': ctx.internalSecret },
    body: { principalId: user.principalId, metricType: 'ai_units', resourceRefId: 'r1', quantity: 10, billableCoins: 0 }
  });
  assert.equal(browserOrigin.status, 403);
  assert.equal(browserOrigin.body.error.code, 'S2S_ORIGIN_FORBIDDEN');

  const badSecret = await ctx.req(`${ctx.pubBase}/api/billing/usage`, {
    method: 'POST',
    headers: { 'X-PlayHub-Billing-Secret': 'wrong-secret' },
    body: { principalId: user.principalId, metricType: 'ai_units', resourceRefId: 'r1', quantity: 10, billableCoins: 0 }
  });
  assert.equal(badSecret.status, 401);

  // 2. Free-tier storage tracking (0 billable coins)
  const freeStorage = await ctx.req(`${ctx.pubBase}/api/billing/usage`, {
    method: 'POST',
    headers: { 'X-PlayHub-Billing-Secret': ctx.internalSecret, 'Idempotency-Key': 'use-stor-1' },
    body: {
      principalId: user.principalId,
      metricType: 'storage_bytes',
      resourceRefId: 'proj-alpha',
      quantity: 20 * 1024 * 1024,
      billableCoins: 0
    }
  });
  assert.equal(freeStorage.status, 201, JSON.stringify(freeStorage.body));

  // 3. Uber Hold/Capture: Reserve 100 -> Settle 40 -> 60 automatically released; FIFO consumes bonus first
  const hold1 = await ctx.req(`${ctx.pubBase}/api/billing/usage/holds`, {
    method: 'POST',
    headers: { 'X-PlayHub-Billing-Secret': ctx.internalSecret, 'Idempotency-Key': 'hold-srv-1' },
    body: {
      principalId: user.principalId,
      amountCoins: 100,
      sinkType: 'infra_server',
      sinkRefId: 'room-42'
    }
  });
  assert.equal(hold1.status, 201, JSON.stringify(hold1.body));
  assert.equal(hold1.body.wallet.reserved, 100);
  assert.equal(hold1.body.wallet.available, 1150);

  const settled = await ctx.req(`${ctx.pubBase}/api/billing/usage`, {
    method: 'POST',
    headers: { 'X-PlayHub-Billing-Secret': ctx.internalSecret, 'Idempotency-Key': 'settle-srv-1' },
    body: {
      principalId: user.principalId,
      metricType: 'server_minutes',
      resourceRefId: 'room-42',
      quantity: 12,
      billableCoins: 40,
      holdId: hold1.body.hold.id
    }
  });
  assert.equal(settled.status, 201, JSON.stringify(settled.body));
  assert.equal(settled.body.wallet.reserved, 0);
  assert.equal(settled.body.wallet.bonus, 210);
  assert.equal(settled.body.wallet.paid, 1000);
  assert.equal(settled.body.wallet.available, 1210);

  // 4. Hold -> full Release (room failed to boot)
  const hold2 = await ctx.req(`${ctx.pubBase}/api/billing/usage/holds`, {
    method: 'POST',
    headers: { 'X-PlayHub-Billing-Secret': ctx.internalSecret, 'Idempotency-Key': 'hold-srv-2' },
    body: { principalId: user.principalId, amountCoins: 50, sinkType: 'infra_server', sinkRefId: 'room-fail' }
  });
  assert.equal(hold2.status, 201);
  assert.equal(hold2.body.wallet.reserved, 50);

  const released = await ctx.req(`${ctx.pubBase}/api/billing/usage/holds/${hold2.body.hold.id}/release`, {
    method: 'POST',
    headers: { 'X-PlayHub-Billing-Secret': ctx.internalSecret, 'Idempotency-Key': 'rel-srv-2' },
    body: {}
  });
  assert.equal(released.status, 200);
  assert.equal(released.body.wallet.reserved, 0);
  assert.equal(released.body.wallet.available, 1210);

  // 5. Direct AI overage spend + idempotent replay
  const aiSpend = await ctx.req(`${ctx.pubBase}/api/billing/usage`, {
    method: 'POST',
    headers: { 'X-PlayHub-Billing-Secret': ctx.internalSecret, 'Idempotency-Key': 'use-ai-1' },
    body: {
      principalId: user.principalId,
      metricType: 'ai_units',
      resourceRefId: 'gen-7',
      quantity: 200,
      billableCoins: 30
    }
  });
  assert.equal(aiSpend.status, 201);
  assert.equal(aiSpend.body.wallet.available, 1180);

  const aiReplay = await ctx.req(`${ctx.pubBase}/api/billing/usage`, {
    method: 'POST',
    headers: { 'X-PlayHub-Billing-Secret': ctx.internalSecret, 'Idempotency-Key': 'use-ai-1' },
    body: {
      principalId: user.principalId,
      metricType: 'ai_units',
      resourceRefId: 'gen-7',
      quantity: 200,
      billableCoins: 30
    }
  });
  assert.equal(aiReplay.status, 200);
  assert.equal(aiReplay.body.replayed, true);
  assert.equal(aiReplay.body.wallet.available, 1180);

  // 6. Anti-Bonus-Stripping verified over HTTP: only bonus was spent, yet order withdrawal is now blocked
  const blockedWd = await ctx.req(`${ctx.pubBase}/api/billing/orders/${ord.body.order.id}/withdraw`, {
    method: 'POST',
    cookie: user.cookie,
    csrf: user.csrf,
    headers: { Origin: ctx.origin, 'Idempotency-Key': 'wd-blocked-after-usage' },
    body: {}
  });
  assert.equal(blockedWd.status, 409);
  assert.equal(blockedWd.body.error.code, 'WITHDRAWAL_ORDER_ALREADY_SPENT');

  // 7. User usage endpoint & loopback admin status report exact usage + Zero-Sum integrity
  const userUsage = await ctx.req(`${ctx.pubBase}/api/billing/usage`, {
    cookie: user.cookie,
    headers: { Origin: ctx.origin }
  });
  assert.equal(userUsage.status, 200);
  assert.equal(userUsage.body.byMetric.server_minutes.totalQuantity, 12);
  assert.equal(userUsage.body.byMetric.server_minutes.totalCoins, 40);
  assert.equal(userUsage.body.byMetric.ai_units.totalQuantity, 200);
  assert.equal(userUsage.body.byMetric.ai_units.totalCoins, 30);
  assert.equal(userUsage.body.records.length, 3);

  const admStatus = await ctx.req(`${ctx.admBase}/api/admin/billing/status`, {
    cookie: admin.cookie,
    headers: { Origin: ctx.adminOrigin }
  });
  assert.equal(admStatus.status, 200);
  assert.equal(admStatus.body.ok, true);
  assert.equal(admStatus.body.integrity.globalSum, 0);
  assert.ok(admStatus.body.usageByMetric.some(m => m.metric_type === 'server_minutes' && m.total_coins === 40));
});
