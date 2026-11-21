import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../server/db.mjs';
import { createBilling } from '../server/billing/routes.mjs';
import { createBillingService } from '../server/billing/service.mjs';
import { createPaymentRouter, DEFAULT_STAGE1_ROUTES } from '../server/billing/router.mjs';
import { createMockProvider, signMockWebhook } from '../server/billing/providers/mock.mjs';
import { createXsollaProvider, signXsollaSha1 } from '../server/billing/providers/xsolla.mjs';
import { createStripeConnectProvider, signStripeWebhook } from '../server/billing/providers/stripe-connect.mjs';
import {
  creditPurchase,
  spendCoins,
  reserveHold,
  settleHold,
  releaseHold,
  clawbackOrder,
  getWallet,
  verifyLedgerIntegrity
} from '../server/billing/ledger.mjs';
import {
  assertCanPurchase,
  setSpendingLimit,
  convertToKrwMinor,
  CREATED_ORDER_WINDOW_MS
} from '../server/billing/compliance.mjs';
import {
  createGiftCardBruteForceGuard,
  issueGiftCardBatch,
  previewGiftCard,
  redeemGiftCard
} from '../server/billing/giftcards.mjs';
import {
  upsertCreatorConnection,
  createCreatorProduct,
  listCreatorProducts,
  listActiveEntitlements
} from '../server/billing/direct-commerce.mjs';

const DAY_MS = 86400000;

function makeFixture(t, {
  stripeSecret = 'sk_test_platform_key',
  stripeWebhookSecret = 'whsec_test_connect',
  xsollaCfg = null,
  allowMockProvider = true,
  allowDemoAccount = true,
  mockRefundImpl = null
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-billing-sec-'));
  const dataDir = path.join(root, 'data');
  let clock = Date.UTC(2026, 10, 21, 5, 0, 0);
  const now = () => clock;
  const advance = ms => { clock += ms; };

  const db = openDatabase(dataDir);
  db.exec(`
    CREATE TABLE IF NOT EXISTS hub_publications (
      game_id TEXT PRIMARY KEY,
      host_slug TEXT NOT NULL UNIQUE,
      owner_key TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      active_release_id TEXT NOT NULL,
      active_submission_id TEXT,
      visibility TEXT NOT NULL CHECK(visibility IN ('private','unlisted','public')),
      deploy_mode TEXT NOT NULL CHECK(deploy_mode IN ('singleplay','mo','mmo')),
      status TEXT NOT NULL CHECK(status IN ('published','unpublished','suspended')),
      artifact_sha256 TEXT NOT NULL,
      artifact_base_url TEXT NOT NULL,
      manifest_json TEXT NOT NULL,
      deploy_profile_json TEXT NOT NULL,
      cas_version INTEGER NOT NULL DEFAULT 1,
      published_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  const insertUser = db.prepare('INSERT INTO users(id, kind, display_name, created_at) VALUES(?,?,?,?)');
  insertUser.run('creator-a', 'registered', 'Creator A', clock - 60 * DAY_MS);
  insertUser.run('attacker-b', 'registered', 'Attacker B', clock - 60 * DAY_MS);
  insertUser.run('buyer-1', 'registered', 'Buyer 1', clock - 30 * DAY_MS);
  insertUser.run('teen-1', 'registered', 'Teen 1', clock - 30 * DAY_MS);

  const seedGameOwner = (gameId, ownerId) => {
    db.prepare(`
      INSERT OR REPLACE INTO hub_publications(
        game_id, host_slug, owner_key, owner_id, project_id, active_release_id, active_submission_id,
        visibility, deploy_mode, status, artifact_sha256, artifact_base_url, manifest_json,
        deploy_profile_json, cas_version, published_at, updated_at
      ) VALUES(?,?,?,?,?,?,NULL,'public','singleplay','published','sha','/play-ugc/x','{}','{}',1,?,?)
    `).run(gameId, `slug-${gameId}`, `owner-key-${ownerId}`, ownerId, `proj-${gameId}`, `rel-${gameId}`, clock, clock);
  };

  const mockSecret = 'test-mock-secret-value';
  const mockProvider = createMockProvider({ webhookSecret: mockSecret, now });
  if (mockRefundImpl) {
    mockProvider.refundPayment = mockRefundImpl;
  }

  const providers = {};
  const enabledProviders = [];
  if (xsollaCfg) {
    providers.xsolla = createXsollaProvider({
      ...xsollaCfg,
      fetchImpl: async () => new Response(JSON.stringify({ token: 'xsolla_tok_sec' }), { status: 200 })
    });
    enabledProviders.push('xsolla');
  }
  if (allowMockProvider) {
    providers.mock = mockProvider;
    enabledProviders.push('mock');
  }

  const router = createPaymentRouter({
    enabledProviders,
    routes: enabledProviders.includes('xsolla')
      ? DEFAULT_STAGE1_ROUTES
      : [{ id: 'mock_default', match: {}, providers: ['mock'] }],
    now
  });

  const stripeConnect = createStripeConnectProvider({
    platformSecretKey: stripeSecret,
    webhookSecret: stripeWebhookSecret,
    allowMockDirect: !stripeSecret,
    fetchImpl: async url => {
      if (url.endsWith('/v1/checkout/sessions')) {
        return new Response(JSON.stringify({
          id: 'cs_sec_1',
          url: 'https://checkout.stripe.com/c/pay/cs_sec_1',
          payment_intent: null
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ id: 'acct_sec_1', url: 'https://connect.stripe.com/setup/e/acct_sec_1' }), { status: 200 });
    },
    now
  });

  const service = createBillingService({
    db,
    providers,
    stripeConnect,
    router,
    config: {
      allowMockProvider,
      allowDemoAccount,
      giftcardPepper: 'test-pepper-32-chars-minimum-length-ok'
    },
    now
  });

  t.after(() => {
    try { db.close(); } catch {}
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  });

  return { db, service, stripeConnect, stripeWebhookSecret, mockSecret, seedGameOwner, now, advance };
}

// 1. [Critical 1a7f061] Stripe Connect webhook security & idempotency & pi_/ch_ matching
test('[Critical 1] Stripe Connect webhook: payment_status=paid required, async_payment_succeeded, Fail-Closed null fields, idempotent multi-webhook, pi_/ch_ lookup', async t => {
  const { db, service, stripeWebhookSecret, seedGameOwner, now } = makeFixture(t);
  seedGameOwner('game-alpha', 'creator-a');
  upsertCreatorConnection(db, {
    principalId: 'creator-a',
    provider: 'stripe_connect',
    connectedAccountId: 'acct_creator_a',
    onboardingStatus: 'ACTIVE',
    chargesEnabled: true,
    payoutsEnabled: true,
    countryCode: 'KR'
  }, now);

  const { product } = service.createCreatorDirectProduct({
    creatorId: 'creator-a',
    body: {
      gameId: 'game-alpha',
      productKey: 'vip_pack',
      kind: 'durable',
      title: 'VIP Pack',
      currency: 'KRW',
      amountMinor: 5000,
      allowedPlatforms: ['web']
    }
  });

  const sendStripeWh = payloadObj => {
    const rawBody = JSON.stringify(payloadObj);
    const sig = signStripeWebhook({ rawBody, timestampSec: Math.floor(now() / 1000), secret: stripeWebhookSecret });
    return service.handleStripeConnectWebhook({ rawBody, headers: { 'stripe-signature': sig } });
  };

  // Order 1: unpaid checkout.session.completed MUST be ignored (no entitlement granted)
  const ord1 = await service.createDirectCheckoutOrder({
    buyerId: 'buyer-1',
    productId: product.id,
    platform: 'web',
    idempotencyKey: 'sc-ord-1'
  });

  const unpaidRes = sendStripeWh({
    id: 'evt_unpaid_1',
    type: 'checkout.session.completed',
    account: 'acct_creator_a',
    data: {
      object: {
        id: 'cs_1',
        payment_status: 'unpaid',
        payment_intent: 'pi_async_1',
        amount_total: 5000,
        currency: 'krw',
        metadata: { direct_order_id: ord1.order.id }
      }
    }
  });
  assert.equal(unpaidRes.status, 200);
  assert.equal(unpaidRes.body.ignored, true);
  assert.equal(listActiveEntitlements(db, { buyerId: 'buyer-1', gameId: 'game-alpha', now }).length, 0);

  // Fail-Closed: missing account / currency / amountMinor MUST be rejected
  assert.throws(
    () => sendStripeWh({
      id: 'evt_null_acct',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_1',
          payment_status: 'paid',
          payment_intent: 'pi_async_1',
          amount_total: 5000,
          currency: 'krw',
          metadata: { direct_order_id: ord1.order.id }
        }
      }
    }),
    e => e.status === 403 && e.code === 'WEBHOOK_ACCOUNT_MISMATCH'
  );
  assert.throws(
    () => sendStripeWh({
      id: 'evt_null_curr',
      type: 'checkout.session.completed',
      account: 'acct_creator_a',
      data: {
        object: {
          id: 'cs_1',
          payment_status: 'paid',
          payment_intent: 'pi_async_1',
          amount_total: 5000,
          metadata: { direct_order_id: ord1.order.id }
        }
      }
    }),
    e => e.status === 422 && e.code === 'WEBHOOK_CURRENCY_MISMATCH'
  );
  assert.throws(
    () => sendStripeWh({
      id: 'evt_null_amt',
      type: 'checkout.session.completed',
      account: 'acct_creator_a',
      data: {
        object: {
          id: 'cs_1',
          payment_status: 'paid',
          payment_intent: 'pi_async_1',
          currency: 'krw',
          metadata: { direct_order_id: ord1.order.id }
        }
      }
    }),
    e => e.status === 422 && e.code === 'WEBHOOK_AMOUNT_MISMATCH'
  );

  // checkout.session.async_payment_succeeded settles Order 1 and grants entitlement
  const asyncPaid = sendStripeWh({
    id: 'evt_async_paid_1',
    type: 'checkout.session.async_payment_succeeded',
    account: 'acct_creator_a',
    data: {
      object: {
        id: 'cs_1',
        payment_status: 'paid',
        payment_intent: 'pi_async_1',
        amount_total: 5000,
        currency: 'krw',
        metadata: { direct_order_id: ord1.order.id }
      }
    }
  });
  assert.equal(asyncPaid.status, 200);
  assert.equal(asyncPaid.body.result.entitlement.state, 'ACTIVE');

  // Subsequent payment_intent.succeeded for the SAME order with latest_charge='ch_async_1'
  // MUST succeed idempotently (200, NO 409 conflict!) and backfill charge_id
  const piFollowup = sendStripeWh({
    id: 'evt_pi_followup_1',
    type: 'payment_intent.succeeded',
    account: 'acct_creator_a',
    data: {
      object: {
        id: 'pi_async_1',
        latest_charge: 'ch_async_1',
        amount_received: 5000,
        currency: 'krw',
        metadata: { direct_order_id: ord1.order.id }
      }
    }
  });
  assert.equal(piFollowup.status, 200);
  assert.equal(piFollowup.body.result.duplicate, true);
  assert.equal(piFollowup.body.result.order.payment_intent_id, 'pi_async_1');
  assert.equal(piFollowup.body.result.order.charge_id, 'ch_async_1');

  // charge.dispute.created with ONLY charge='ch_async_1' (no metadata, no payment_intent) MUST find & revoke!
  const disputeByCharge = sendStripeWh({
    id: 'evt_disp_by_ch_1',
    type: 'charge.dispute.created',
    account: 'acct_creator_a',
    data: {
      object: {
        id: 'dp_1',
        charge: 'ch_async_1',
        reason: 'fraudulent'
      }
    }
  });
  assert.equal(disputeByCharge.status, 200);
  assert.equal(disputeByCharge.body.result.order.state, 'CHARGEBACK');
  assert.equal(disputeByCharge.body.result.entitlement.state, 'REVOKED');
  assert.equal(listActiveEntitlements(db, { buyerId: 'buyer-1', gameId: 'game-alpha', now }).length, 0);

  // Order 2: paid via payment_intent.succeeded, then refunded via charge.refunded using ONLY payment_intent (no metadata)
  const ord2 = await service.createDirectCheckoutOrder({
    buyerId: 'buyer-1',
    productId: product.id,
    platform: 'web',
    idempotencyKey: 'sc-ord-2'
  });
  sendStripeWh({
    id: 'evt_paid_2',
    type: 'payment_intent.succeeded',
    account: 'acct_creator_a',
    data: {
      object: {
        id: 'pi_ord_2',
        latest_charge: 'ch_ord_2',
        amount_received: 5000,
        currency: 'krw',
        metadata: { direct_order_id: ord2.order.id }
      }
    }
  });
  assert.equal(listActiveEntitlements(db, { buyerId: 'buyer-1', gameId: 'game-alpha', now }).length, 1);

  const refundByPi = sendStripeWh({
    id: 'evt_ref_by_pi_2',
    type: 'charge.refunded',
    account: 'acct_creator_a',
    data: {
      object: {
        id: 'ch_different_or_same',
        payment_intent: 'pi_ord_2'
      }
    }
  });
  assert.equal(refundByPi.status, 200);
  assert.equal(refundByPi.body.result.order.state, 'REFUNDED');
  assert.equal(refundByPi.body.result.entitlement.state, 'REVOKED');
  assert.equal(listActiveEntitlements(db, { buyerId: 'buyer-1', gameId: 'game-alpha', now }).length, 0);
});

// 2. [Critical 1a7f061] Track B game ownership & UNIQUE(game_id, product_key) & verified-owner filtering
test('[Critical 2] Track B ownership: blocks non-owner product registration (403), enforces UNIQUE(game_id, product_key), filters rogue products/entitlements', t => {
  const { db, service, seedGameOwner, now } = makeFixture(t);
  seedGameOwner('game-owned-by-a', 'creator-a');

  // Non-owner attacker tries to register a cheap product on creator-a's game -> 403
  assert.throws(
    () => service.createCreatorDirectProduct({
      creatorId: 'attacker-b',
      body: {
        gameId: 'game-owned-by-a',
        productKey: 'vip_pack',
        kind: 'durable',
        title: 'Spoofed 100 KRW VIP',
        currency: 'KRW',
        amountMinor: 100
      }
    }),
    e => e.status === 403 && e.code === 'GAME_OWNERSHIP_FORBIDDEN'
  );

  // Unregistered/unowned game -> 403
  assert.throws(
    () => service.createCreatorDirectProduct({
      creatorId: 'attacker-b',
      body: {
        gameId: 'unowned-game',
        productKey: 'vip_pack',
        kind: 'durable',
        title: 'Unowned Game Item',
        currency: 'KRW',
        amountMinor: 100
      }
    }),
    e => e.status === 403 && e.code === 'GAME_OWNERSHIP_REQUIRED'
  );

  // Real owner succeeds
  const legit = service.createCreatorDirectProduct({
    creatorId: 'creator-a',
    body: {
      gameId: 'game-owned-by-a',
      productKey: 'vip_pack',
      kind: 'durable',
      title: 'Legit VIP',
      currency: 'KRW',
      amountMinor: 9900
    }
  });
  assert.equal(legit.product.creatorId, 'creator-a');

  // Duplicate (game_id, product_key) even by direct SQL from another creator_id MUST fail UNIQUE constraint
  assert.throws(
    () => db.prepare(`
      INSERT INTO billing_creator_products(
        id, creator_id, game_id, product_key, kind, title, currency, amount_minor,
        allowed_regions_json, allowed_platforms_json, age_rating, status, created_at, updated_at
      ) VALUES('rogue-dup','attacker-b','game-owned-by-a','vip_pack','durable','Dup','KRW',100,'["*"]','["web"]','ALL','ACTIVE',?,?)
    `).run(now(), now()),
    /UNIQUE constraint failed/
  );

  // Even if a rogue product & entitlement from a non-owner existed in DB under a different product_key,
  // listCreatorProducts(gameId) and listActiveEntitlements MUST filter them out!
  db.prepare(`
    INSERT INTO billing_creator_products(
      id, creator_id, game_id, product_key, kind, title, currency, amount_minor,
      allowed_regions_json, allowed_platforms_json, age_rating, status, created_at, updated_at
    ) VALUES('rogue-prod','attacker-b','game-owned-by-a','rogue_key','durable','Rogue','KRW',100,'["*"]','["web"]','ALL','ACTIVE',?,?)
  `).run(now(), now());
  db.prepare(`
    INSERT INTO billing_direct_orders(
      id, buyer_id, creator_id, product_id, game_id, platform, provider, connected_account_id,
      provider_charge_id, currency, amount_minor, platform_fee_minor, state, idempotency_key, paid_at, created_at, updated_at
    ) VALUES('rogue-ord','attacker-b','attacker-b','rogue-prod','game-owned-by-a','web','stripe_connect','acct_attacker','ch_rogue','KRW',100,0,'PAID','idem-rogue',?,?,?)
  `).run(now(), now(), now());
  db.prepare(`
    INSERT INTO billing_entitlements(
      id, buyer_id, creator_id, game_id, product_id, product_key, direct_order_id,
      state, granted_at, expires_at, revoked_at, revoke_reason, updated_at
    ) VALUES('rogue-ent','attacker-b','attacker-b','game-owned-by-a','rogue-prod','rogue_key','rogue-ord','ACTIVE',?,NULL,NULL,NULL,?)
  `).run(now(), now());

  const publicProducts = listCreatorProducts(db, { gameId: 'game-owned-by-a', activeOnly: true });
  assert.equal(publicProducts.length, 1);
  assert.equal(publicProducts[0].creator_id, 'creator-a');

  const activeEnts = listActiveEntitlements(db, { buyerId: 'attacker-b', gameId: 'game-owned-by-a', now });
  assert.equal(activeEnts.length, 0);
});

// 3. [Critical 997b479] 7-day withdrawal TOCTOU lock (REFUND_PENDING) + spend/hold lock + PG failure recovery
test('[Critical 3] 7-day withdrawal TOCTOU: REFUND_PENDING blocks concurrent withdrawal & coin spend/hold, safely recovers on PG error', async t => {
  let refundCalls = 0;
  let shouldFailPg = false;
  let resolveRefund;
  let refundStarted;
  const refundStartedPromise = new Promise(r => { refundStarted = r; });

  const { db, service, now } = makeFixture(t, {
    mockRefundImpl: async ({ order }) => {
      refundCalls += 1;
      if (shouldFailPg) {
        throw new Error('PG_TEMPORARY_TIMEOUT');
      }
      refundStarted();
      await new Promise(r => { resolveRefund = r; });
      return { ok: true, providerRefundId: `mock_ref_${order.id}_${refundCalls}` };
    }
  });

  // Create & confirm order (1000 paid + 250 bonus)
  const created = await service.createCheckoutOrder({
    principalId: 'buyer-1',
    skuId: 'playhub.coin.t4',
    currency: 'KRW',
    agreedTermsVersion: 'v2.0',
    idempotencyKey: 'toctou-ord-1'
  });
  await service.confirmOrderPayment({
    principalId: 'buyer-1',
    orderId: created.order.id,
    providerPaymentId: created.checkout.providerPaymentId,
    amountMinor: 14000
  });

  // 1) PG refund failure MUST safely restore state from REFUND_PENDING back to PAID
  shouldFailPg = true;
  await assert.rejects(
    () => service.withdrawUnusedOrder({
      principalId: 'buyer-1',
      orderId: created.order.id,
      idempotencyKey: 'wd-fail-1'
    }),
    /PG_TEMPORARY_TIMEOUT/
  );
  assert.equal(db.prepare('SELECT state FROM billing_orders WHERE id=?').get(created.order.id).state, 'PAID');
  assert.equal(getWallet(db, 'buyer-1', now).available, 1250);

  // 2) Start real withdrawal and pause mid-flight inside adapter.refundPayment()
  shouldFailPg = false;
  const inflight = service.withdrawUnusedOrder({
    principalId: 'buyer-1',
    orderId: created.order.id,
    idempotencyKey: 'wd-live-1'
  });
  await refundStartedPromise;

  // Order is now atomically locked in REFUND_PENDING
  assert.equal(db.prepare('SELECT state FROM billing_orders WHERE id=?').get(created.order.id).state, 'REFUND_PENDING');
  assert.equal(getWallet(db, 'buyer-1', now).available, 0);

  // Concurrent second withdrawal is blocked with 409 WITHDRAWAL_IN_PROGRESS without calling PG again
  await assert.rejects(
    () => service.withdrawUnusedOrder({
      principalId: 'buyer-1',
      orderId: created.order.id,
      idempotencyKey: 'wd-live-2'
    }),
    e => e.status === 409 && e.code === 'WITHDRAWAL_IN_PROGRESS'
  );

  // Concurrent spendCoins & reserveHold against REFUND_PENDING order lots MUST be blocked!
  assert.throws(
    () => spendCoins(db, {
      principalId: 'buyer-1',
      amountCoins: 10,
      sinkType: 'usage_ai_units',
      sinkRefId: 'race-ai',
      idempotencyKey: 'race-spend-1',
      now
    }),
    e => e.status === 422 && e.code === 'INSUFFICIENT_PLAYCOIN'
  );
  assert.throws(
    () => reserveHold(db, {
      principalId: 'buyer-1',
      amountCoins: 10,
      sinkType: 'infra_server',
      sinkRefId: 'race-srv',
      idempotencyKey: 'race-hold-1',
      now
    }),
    e => e.status === 422 && e.code === 'INSUFFICIENT_PLAYCOIN'
  );

  // Complete PG refund -> clawback finalizes to REFUNDED; PG was called only once for the live attempt
  resolveRefund();
  const outcome = await inflight;
  assert.equal(refundCalls, 2); // 1 failed + 1 succeeded
  assert.equal(outcome.wallet.paid, 0);
  assert.equal(outcome.wallet.bonus, 0);
  assert.equal(db.prepare('SELECT state FROM billing_orders WHERE id=?').get(created.order.id).state, 'REFUNDED');
  assert.equal(verifyLedgerIntegrity(db).ok, true);
});

// 4. [Critical d208f05] Gift card preview MUST NOT reset brute-force counter + DB persistence
test('[Critical 4] Gift card brute-force: previewGiftCard does not reset failure counter and lockout persists in DB', t => {
  const { db, now } = makeFixture(t);
  const pepper = 'test-pepper-32-chars-minimum-length-ok';
  const guard1 = createGiftCardBruteForceGuard({ db, maxFailures: 5, windowMs: 15 * 60_000, lockMs: 15 * 60_000, now });

  const issued = issueGiftCardBatch(db, {
    channel: 'gift_card_direct',
    partnerName: 'playhub',
    currency: 'KRW',
    faceValueMinor: 14000,
    baseCoins: 1000,
    bonusBps: 2500,
    quantity: 1,
    activateImmediately: true,
    pepper,
    now
  });
  const validPin = issued.oneTimePins[0].pin;

  // 4 invalid guesses
  for (let i = 0; i < 4; i++) {
    assert.throws(
      () => previewGiftCard(db, {
        principalId: 'buyer-1',
        pin: `AAAA-BBBB-CCCC-000${i}`,
        pepper,
        bruteForceGuard: guard1,
        clientIp: '203.0.113.10',
        now
      }),
      e => e.status === 404
    );
  }

  // Valid preview succeeds (200) but MUST NOT reset failure counter!
  const previewOk = previewGiftCard(db, {
    principalId: 'buyer-1',
    pin: validPin,
    pepper,
    bruteForceGuard: guard1,
    clientIp: '203.0.113.10',
    now
  });
  assert.equal(previewOk.totalCoins, 1250);

  // 5th invalid guess MUST immediately trigger 429 lockout
  assert.throws(
    () => previewGiftCard(db, {
      principalId: 'buyer-1',
      pin: 'AAAA-BBBB-CCCC-9999',
      pepper,
      bruteForceGuard: guard1,
      clientIp: '203.0.113.10',
      now
    }),
    e => e.status === 429 && e.code === 'GIFTCARD_BRUTEFORCE_LOCKED'
  );

  // Simulate server restart with a brand new guard instance backed by the same DB -> still locked!
  const guardAfterRestart = createGiftCardBruteForceGuard({ db, maxFailures: 5, windowMs: 15 * 60_000, lockMs: 15 * 60_000, now });
  assert.throws(
    () => redeemGiftCard(db, {
      principalId: 'buyer-1',
      pin: validPin,
      idempotencyKey: 'gc-after-restart',
      pepper,
      bruteForceGuard: guardAfterRestart,
      clientIp: '203.0.113.10',
      now
    }),
    e => e.status === 429 && e.code === 'GIFTCARD_BRUTEFORCE_LOCKED'
  );
});

// 5. [High f1aedd5] ledger.mjs: clawbackOrder rejects withdrawal_7d with active Hold + changes!==1 rollback
test('[High 5] Ledger: withdrawal_7d blocked by active Hold (409) and wallet UPDATE changes!==1 rolls back cleanly', t => {
  const { db, now } = makeFixture(t);

  // Seed paid order (1000 paid + 250 bonus)
  db.prepare(`
    INSERT INTO billing_orders(
      id, principal_id, channel, provider, sku_id, currency, amount_minor,
      base_coins, bonus_coins, bonus_bps, state, provider_payment_id,
      idempotency_key, first_spent_at, paid_at, created_at, updated_at
    ) VALUES('ord-h5','buyer-1','web_browser','mock','playhub.coin.t4','KRW',14000,1000,250,2500,'PAID','pay-h5','idem-h5',NULL,?,?,?)
  `).run(now(), now(), now());
  creditPurchase(db, {
    principalId: 'buyer-1',
    orderId: 'ord-h5',
    provider: 'mock',
    baseCoins: 1000,
    bonusCoins: 250,
    idempotencyKey: 'cred-h5',
    now
  });

  // Reserve a hold of 200 coins
  const hold = reserveHold(db, {
    principalId: 'buyer-1',
    amountCoins: 200,
    sinkType: 'infra_server',
    sinkRefId: 'room-h5',
    idempotencyKey: 'hold-h5',
    now
  });

  // withdrawal_7d MUST be rejected with 409 while hold is active!
  assert.throws(
    () => clawbackOrder(db, {
      orderId: 'ord-h5',
      kind: 'withdrawal_7d',
      reason: 'try_free_infra',
      actorId: 'buyer-1',
      idempotencyKey: 'wd-h5-blocked',
      now
    }),
    e => e.status === 409 && e.code === 'WITHDRAWAL_BLOCKED_BY_ACTIVE_HOLD'
  );

  // Simulate corrupted reserved_coins < hold.amount_coins -> releaseHold & settleHold(0) MUST throw 409 and rollback!
  db.prepare('UPDATE billing_wallet_accounts SET reserved_coins=50 WHERE principal_id=?').run('buyer-1');
  assert.throws(
    () => releaseHold(db, { holdId: hold.hold.id, now }),
    e => e.status === 409 && e.code === 'WALLET_RESERVE_SYNC_ERROR'
  );
  // Hold must STILL be HELD (rolled back!)
  assert.equal(db.prepare('SELECT state FROM billing_wallet_holds WHERE id=?').get(hold.hold.id).state, 'HELD');

  assert.throws(
    () => settleHold(db, { holdId: hold.hold.id, actualCoins: 0, idempotencyKey: 'settle-zero-fail', now }),
    e => e.status === 409 && e.code === 'WALLET_RESERVE_SYNC_ERROR'
  );
  assert.equal(db.prepare('SELECT state FROM billing_wallet_holds WHERE id=?').get(hold.hold.id).state, 'HELD');

  // Restore reserved_coins=200, release hold, then withdrawal_7d succeeds!
  db.prepare('UPDATE billing_wallet_accounts SET reserved_coins=200 WHERE principal_id=?').run('buyer-1');
  releaseHold(db, { holdId: hold.hold.id, now });

  // Simulate paid_balance desync -> clawbackOrder MUST throw 409 and roll back lot/order mutations!
  db.prepare('UPDATE billing_wallet_accounts SET paid_balance=100 WHERE principal_id=?').run('buyer-1');
  assert.throws(
    () => clawbackOrder(db, {
      orderId: 'ord-h5',
      kind: 'withdrawal_7d',
      reason: 'desync_test',
      actorId: 'buyer-1',
      idempotencyKey: 'wd-h5-desync',
      now
    }),
    e => e.status === 409 && e.code === 'WALLET_CLAWBACK_SYNC_ERROR'
  );
  assert.equal(db.prepare('SELECT state FROM billing_orders WHERE id=?').get('ord-h5').state, 'PAID');

  // Restore paid_balance=1000 -> withdrawal_7d succeeds cleanly
  db.prepare('UPDATE billing_wallet_accounts SET paid_balance=1000 WHERE principal_id=?').run('buyer-1');
  const wdOk = clawbackOrder(db, {
    orderId: 'ord-h5',
    kind: 'withdrawal_7d',
    reason: 'legit_withdrawal',
    actorId: 'buyer-1',
    idempotencyKey: 'wd-h5-ok',
    now
  });
  assert.equal(wdOk.wallet.paid, 0);
  assert.equal(wdOk.wallet.bonus, 0);
  assert.equal(verifyLedgerIntegrity(db).ok, true);
});

// 6. [High f1aedd5] compliance.mjs & service.mjs: USD->KRW unified cap, recent CREATED included, settle re-check, giftcard consistency
test('[High 6] Compliance: FX-unified KRW caps block USD bypass, count recent CREATED orders, re-verify at settlement, include giftcards consistently', async t => {
  const { db, service, now, advance } = makeFixture(t);

  // Teen monthly & daily cap = ₩70,000
  setSpendingLimit(db, {
    principalId: 'teen-1',
    ageTier: 'TEEN_MINOR',
    monthlyCapMinor: 70000,
    dailyCapMinor: 70000,
    guardianApproved: true,
    now
  });

  // 1) USD $49.99 (4999 cents ≈ ₩72,486) MUST be blocked (cannot bypass ₩70,000 cap with USD cents!)
  assert.ok(convertToKrwMinor(4999, 'USD') > 70000);
  assert.throws(
    () => assertCanPurchase(db, { principalId: 'teen-1', amountMinor: 4999, currency: 'USD', now }),
    e => e.status === 422 && e.code === 'MONTHLY_SPENDING_LIMIT_EXCEEDED'
  );

  // 2) Creating a ₩70,000 CREATED order reserves cap within CREATED_ORDER_WINDOW_MS (blocks concurrent 2nd order)
  const ord1 = await service.createCheckoutOrder({
    principalId: 'teen-1',
    skuId: 'playhub.coin.t6', // ₩70,000
    currency: 'KRW',
    agreedTermsVersion: 'v2.0',
    idempotencyKey: 'teen-ord-1'
  });
  await assert.rejects(
    () => service.createCheckoutOrder({
      principalId: 'teen-1',
      skuId: 'playhub.coin.t1', // ₩1,500
      currency: 'KRW',
      agreedTermsVersion: 'v2.0',
      idempotencyKey: 'teen-ord-2'
    }),
    e => e.status === 422 && e.code === 'MONTHLY_SPENDING_LIMIT_EXCEEDED'
  );

  // Account summary reflects the exact same unified KRW usage (₩70,000)
  const summaryWithCreated = service.getAccountSummary('teen-1');
  assert.equal(summaryWithCreated.limits.monthlyUsedMinor, 70000);
  assert.equal(summaryWithCreated.limits.dailyUsedMinor, 70000);

  // 3) Advance past CREATED window -> Order 2 ($19.99 USD ≈ ₩28,986) + Order 3 (₩28,000 KRW) allowed,
  //    then trying to confirm stale Order 1 (₩70,000) MUST fail re-validation at settlement time!
  advance(CREATED_ORDER_WINDOW_MS + 60_000);
  const ord2 = await service.createCheckoutOrder({
    principalId: 'teen-1',
    skuId: 'playhub.coin.t5', // $19.99 USD -> ~₩28,986
    currency: 'USD',
    agreedTermsVersion: 'v2.0',
    idempotencyKey: 'teen-ord-usd'
  });
  await service.confirmOrderPayment({
    principalId: 'teen-1',
    orderId: ord2.order.id,
    providerPaymentId: ord2.checkout.providerPaymentId,
    amountMinor: 1999
  });

  await assert.rejects(
    () => service.confirmOrderPayment({
      principalId: 'teen-1',
      orderId: ord1.order.id,
      providerPaymentId: ord1.checkout.providerPaymentId,
      amountMinor: 70000
    }),
    e => e.status === 422 && e.code === 'MONTHLY_SPENDING_LIMIT_EXCEEDED'
  );

  // 4) Gift card redemption obeys the same unified cap & is reflected consistently in getAccountSummary
  const pepper = 'test-pepper-32-chars-minimum-length-ok';
  const gcBatch = issueGiftCardBatch(db, {
    channel: 'gift_card_direct',
    partnerName: 'playhub',
    currency: 'KRW',
    faceValueMinor: 50000, // ₩50,000 + ~₩28,986 USD > ₩70,000 cap -> MUST be blocked
    baseCoins: 3500,
    bonusBps: 2000,
    quantity: 1,
    activateImmediately: true,
    pepper,
    now
  });
  assert.throws(
    () => service.redeemGiftCardPin({
      principalId: 'teen-1',
      pin: gcBatch.oneTimePins[0].pin,
      idempotencyKey: 'teen-gc-overcap'
    }),
    e => e.status === 422 && e.code === 'MONTHLY_SPENDING_LIMIT_EXCEEDED'
  );

  const gcSmall = issueGiftCardBatch(db, {
    channel: 'gift_card_direct',
    partnerName: 'playhub',
    currency: 'KRW',
    faceValueMinor: 14000,
    baseCoins: 1000,
    bonusBps: 2500,
    quantity: 1,
    activateImmediately: true,
    pepper,
    now
  });
  service.redeemGiftCardPin({
    principalId: 'teen-1',
    pin: gcSmall.oneTimePins[0].pin,
    idempotencyKey: 'teen-gc-ok'
  });

  const summaryAfter = service.getAccountSummary('teen-1');
  const expectedKrw = convertToKrwMinor(1999, 'USD') + 14000;
  assert.equal(summaryAfter.limits.monthlyUsedMinor, expectedKrw);
  assert.equal(summaryAfter.limits.dailyUsedMinor, expectedKrw);
});

// 7. [High 997b479] Production fail-closed guards (routes.mjs & service.mjs)
test('[High 7] Production guards: secureCookies rejects demo/mock/mockDirect/default-secret; Xsolla rejects mock; live Stripe rejects confirmMockDirectOrder', async t => {
  const { db, now } = makeFixture(t);
  const dummyDeps = {
    db,
    sessionFor: () => null,
    requireSession: () => { throw new Error('unauth'); },
    newSession: () => {},
    revokeSession: () => {},
    now,
    env: {}
  };

  // secureCookies=true MUST reject allowMockProvider, allowDemoAccount, allowMockDirect, and default dev-mock-webhook-secret
  assert.throws(
    () => createBilling({ ...dummyDeps, config: { secureCookies: true, billing: { enabled: true, allowMockProvider: true } } }),
    /allowMockProvider/
  );
  assert.throws(
    () => createBilling({ ...dummyDeps, config: { secureCookies: true, billing: { enabled: true, allowDemoAccount: true } } }),
    /allowDemoAccount/
  );
  assert.throws(
    () => createBilling({ ...dummyDeps, config: { secureCookies: true, billing: { enabled: true, stripeConnect: { allowMockDirect: true } } } }),
    /allowMockDirect/
  );
  assert.throws(
    () => createBilling({ ...dummyDeps, config: { secureCookies: true, billing: { enabled: true, mockWebhookSecret: 'dev-mock-webhook-secret' } } }),
    /mockWebhookSecret/
  );

  // When Xsolla is configured (even if allowMockProvider=true in non-prod), provider='mock' is rejected
  const xsollaBilling = createBilling({
    ...dummyDeps,
    config: {
      secureCookies: false,
      billing: {
        enabled: true,
        allowMockProvider: true,
        xsolla: {
          merchantId: '1001',
          projectId: '2002',
          apiKey: 'xsolla-key',
          webhookSecret: 'xsolla-secret'
        }
      }
    }
  });
  assert.equal(xsollaBilling.providers.mock, undefined);
  await assert.rejects(
    () => xsollaBilling.service.createCheckoutOrder({
      principalId: 'buyer-1',
      skuId: 'playhub.coin.t4',
      currency: 'KRW',
      preferredProvider: 'mock',
      agreedTermsVersion: 'v2.0',
      idempotencyKey: 'xsolla-forbid-mock'
    }),
    e => e.status === 403 && e.code === 'MOCK_PROVIDER_FORBIDDEN'
  );

  // Live Stripe Connect configured + allowMockProvider=true MUST still block confirmMockDirectOrder (403)
  const fx = makeFixture(t, { stripeSecret: 'sk_live_or_test_real', allowMockProvider: true });
  fx.seedGameOwner('game-live', 'creator-a');
  upsertCreatorConnection(fx.db, {
    principalId: 'creator-a',
    provider: 'stripe_connect',
    connectedAccountId: 'acct_live_1',
    onboardingStatus: 'ACTIVE',
    chargesEnabled: true,
    payoutsEnabled: true,
    countryCode: 'KR'
  }, fx.now);
  const { product } = fx.service.createCreatorDirectProduct({
    creatorId: 'creator-a',
    body: { gameId: 'game-live', productKey: 'live_item', kind: 'durable', title: 'Live Item', currency: 'KRW', amountMinor: 4900 }
  });
  const liveOrder = await fx.service.createDirectCheckoutOrder({
    buyerId: 'buyer-1',
    productId: product.id,
    platform: 'web',
    idempotencyKey: 'live-direct-1'
  });
  assert.throws(
    () => fx.service.confirmMockDirectOrder({
      buyerId: 'buyer-1',
      directOrderId: liveOrder.order.id,
      providerChargeId: `ch_direct_mock_${liveOrder.order.id}`
    }),
    e => e.status === 403 && e.code === 'MOCK_DIRECT_CONFIRM_DISABLED'
  );
});

// 8. [High 997b479] Track A webhook provider/principal/amount/currency Fail-Closed & Xsolla missing tx ID -> 400
test('[High 8] Track A webhooks: rejects cross-provider (403), wrong principal (403), null currency/amount (422), and Xsolla missing tx ID (400)', async t => {
  const xsollaSecret = 'xsolla-sec-wh';
  const { service, mockSecret, now } = makeFixture(t, {
    allowMockProvider: true,
    xsollaCfg: {
      merchantId: '1001',
      projectId: '2002',
      apiKey: 'xsolla-api',
      webhookSecret: xsollaSecret,
      sandbox: true
    }
  });

  // Create an Xsolla order for buyer-1
  const xOrder = await service.createCheckoutOrder({
    principalId: 'buyer-1',
    skuId: 'playhub.coin.t4',
    currency: 'USD',
    agreedTermsVersion: 'v2.0',
    idempotencyKey: 'tracka-xsolla-1'
  });
  assert.equal(xOrder.order.provider, 'xsolla');

  // 1) Cross-provider injection: mock webhook targeting xsolla order -> 403 WEBHOOK_PROVIDER_MISMATCH
  const mockInjectedBody = JSON.stringify({
    eventId: 'evt-cross-1',
    eventType: 'payment',
    orderId: xOrder.order.id,
    principalId: 'buyer-1',
    providerPaymentId: 'mock_pay_fake',
    amountMinor: 999,
    currency: 'USD'
  });
  assert.throws(
    () => service.handleWebhook({
      providerName: 'mock',
      rawBody: mockInjectedBody,
      headers: signMockWebhook({ rawBody: mockInjectedBody, timestampMs: now(), secret: mockSecret })
    }),
    e => e.status === 403 && e.code === 'WEBHOOK_PROVIDER_MISMATCH'
  );

  // 2) Wrong principalId in Xsolla webhook -> 403 WEBHOOK_PRINCIPAL_MISMATCH
  const wrongPrincipalBody = JSON.stringify({
    notification_type: 'payment',
    user: { id: 'attacker-b' },
    transaction: { id: 70001, external_id: xOrder.order.id },
    purchase: { total: { currency: 'USD', amount: 9.99 } },
    custom_parameters: { order_id: xOrder.order.id }
  });
  assert.throws(
    () => service.handleWebhook({
      providerName: 'xsolla',
      rawBody: wrongPrincipalBody,
      headers: { authorization: signXsollaSha1(wrongPrincipalBody, xsollaSecret) }
    }),
    e => e.status === 403 && e.code === 'WEBHOOK_PRINCIPAL_MISMATCH'
  );

  // 3) Null currency or null amountMinor on payment webhook -> 422 Fail-Closed
  const nullCurrencyBody = JSON.stringify({
    notification_type: 'payment',
    user: { id: 'buyer-1' },
    transaction: { id: 70002, external_id: xOrder.order.id },
    purchase: { total: { amount: 9.99 } },
    custom_parameters: { order_id: xOrder.order.id }
  });
  assert.throws(
    () => service.handleWebhook({
      providerName: 'xsolla',
      rawBody: nullCurrencyBody,
      headers: { authorization: signXsollaSha1(nullCurrencyBody, xsollaSecret) }
    }),
    e => e.status === 422 && e.code === 'WEBHOOK_CURRENCY_MISMATCH'
  );

  const nullAmountBody = JSON.stringify({
    notification_type: 'payment',
    user: { id: 'buyer-1' },
    transaction: { id: 70003, external_id: xOrder.order.id },
    purchase: { total: { currency: 'USD' } },
    custom_parameters: { order_id: xOrder.order.id }
  });
  assert.throws(
    () => service.handleWebhook({
      providerName: 'xsolla',
      rawBody: nullAmountBody,
      headers: { authorization: signXsollaSha1(nullAmountBody, xsollaSecret) }
    }),
    e => e.status === 422 && e.code === 'WEBHOOK_AMOUNT_MISMATCH'
  );

  // 4) Xsolla webhooks missing required transaction ID -> 400 XSOLLA_TRANSACTION_ID_MISSING
  for (const badPayload of [
    { notification_type: 'payment', user: { id: 'buyer-1' }, custom_parameters: { order_id: xOrder.order.id }, purchase: { total: { currency: 'USD', amount: 9.99 } } },
    { notification_type: 'refund', user: { id: 'buyer-1' }, custom_parameters: { order_id: xOrder.order.id } },
    { notification_type: 'dispute', user: { id: 'buyer-1' }, custom_parameters: { order_id: xOrder.order.id } }
  ]) {
    const rawBody = JSON.stringify(badPayload);
    assert.throws(
      () => service.handleWebhook({
        providerName: 'xsolla',
        rawBody,
        headers: { authorization: signXsollaSha1(rawBody, xsollaSecret) }
      }),
      e => e.status === 400 && e.code === 'XSOLLA_TRANSACTION_ID_MISSING'
    );
  }
});
