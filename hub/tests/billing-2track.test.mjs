import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../server/db.mjs';
import { createBackup } from '../tools/backup.mjs';
import { restoreData } from '../tools/restore-data.mjs';
import { ensureBillingSchema, BILLING_OPTIONAL_TABLES } from '../server/billing/schema.mjs';
import { seedDefaultCatalogAndPolicies } from '../server/billing/policy.mjs';
import { creditPurchase, reserveHold, getWallet, verifyLedgerIntegrity } from '../server/billing/ledger.mjs';
import {
  PLAN_QUOTAS,
  getSubscription,
  upsertSubscription,
  recordMeteredUsage,
  summarizeUsage
} from '../server/billing/subscriptions.mjs';
import {
  upsertCreatorConnection,
  createCreatorProduct,
  createDirectOrder,
  confirmDirectOrderPayment,
  revokeDirectOrderEntitlement,
  listActiveEntitlements,
  suspendCreatorProduct,
  suspendCreatorConnection
} from '../server/billing/direct-commerce.mjs';

const DAY_MS = 86400000;

function createFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-billing-2track-'));
  const dataDir = path.join(root, 'data');
  let clock = Date.UTC(2026, 10, 21, 3, 0, 0);
  const now = () => clock;
  const advance = ms => { clock += ms; };

  const db = openDatabase(dataDir);
  ensureBillingSchema(db);
  seedDefaultCatalogAndPolicies(db, now);

  const insertUser = db.prepare('INSERT INTO users(id, kind, display_name, created_at) VALUES(?,?,?,?)');
  insertUser.run('creator-1', 'registered', 'Indie Studio', clock - 60 * DAY_MS);
  insertUser.run('player-1', 'registered', 'Web Gamer', clock - 30 * DAY_MS);
  insertUser.run('player-guest', 'guest', null, clock - 1 * DAY_MS);

  // Seed hub_publications table (matching restore-data.mjs OPTIONAL_TABLES schema) for Track B game ownership verification
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
  const seedGameOwner = (gameId, ownerId = 'creator-1') => {
    db.prepare(`
      INSERT OR REPLACE INTO hub_publications(
        game_id, host_slug, owner_key, owner_id, project_id, active_release_id, active_submission_id,
        visibility, deploy_mode, status, artifact_sha256, artifact_base_url, manifest_json,
        deploy_profile_json, cas_version, published_at, updated_at
      ) VALUES(?,?,?,?,?,?,NULL,'public','singleplay','published','deadbeef','/play-ugc/test','{}','{}',1,?,?)
    `).run(gameId, `slug-${gameId}`, `owner-key-${ownerId}`, ownerId, `proj-${gameId}`, `rel-${gameId}`, clock, clock);
  };
  seedGameOwner('survivor-arena-g2', 'creator-1');
  seedGameOwner('test-game', 'creator-1');

  t.after(() => {
    try { db.close(); } catch {}
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  });

  return { root, dataDir, db, now, advance, seedGameOwner };
}

test('Track A SubscriptionService: Free vs Pro capacity quotas and canceled period-end grace', t => {
  const { db, now, advance } = createFixture(t);

  // Default user is on Free plan: 100MB workspace, 3 projects, 50MB deploy
  const freeSub = getSubscription(db, 'creator-1', now);
  assert.equal(freeSub.effectivePlan, 'free');
  assert.equal(freeSub.quotas.workspaceBytes, 100 * 1024 * 1024);
  assert.equal(freeSub.quotas.maxProjects, 3);
  assert.equal(freeSub.quotas.deployBytes, 50 * 1024 * 1024);

  // Upgrade to Pro: 1GB workspace, unlimited projects, 100MB deploy
  const start = now();
  const end = start + 30 * DAY_MS;
  const proSub = upsertSubscription(db, {
    principalId: 'creator-1',
    planTier: 'pro',
    status: 'ACTIVE',
    provider: 'stripe',
    providerSubscriptionId: 'sub_pro_001',
    currentPeriodStart: start,
    currentPeriodEnd: end,
    now
  });
  assert.equal(proSub.effectivePlan, 'pro');
  assert.deepEqual(proSub.quotas, PLAN_QUOTAS.pro);
  assert.equal(proSub.quotas.workspaceBytes, 1024 * 1024 * 1024);
  assert.equal(proSub.quotas.maxProjects, null);
  assert.equal(proSub.quotas.deployBytes, 100 * 1024 * 1024);

  // Canceled mid-period retains Pro until currentPeriodEnd, then drops to Free
  upsertSubscription(db, {
    principalId: 'creator-1',
    planTier: 'pro',
    status: 'CANCELED',
    provider: 'stripe',
    providerSubscriptionId: 'sub_pro_001',
    currentPeriodStart: start,
    currentPeriodEnd: end,
    cancelAtPeriodEnd: true,
    now
  });
  advance(10 * DAY_MS);
  assert.equal(getSubscription(db, 'creator-1', now).effectivePlan, 'pro');
  advance(25 * DAY_MS);
  assert.equal(getSubscription(db, 'creator-1', now).effectivePlan, 'free');
});

test('Track A UsageMetering: free-quota 0-coin tracking, Hold/Capture server settle, and direct AI spend', t => {
  const { db, now } = createFixture(t);

  // Credit 1,250 PlayCoin (1,000 paid + 250 bonus) via web purchase
  db.prepare(`
    INSERT INTO billing_orders(
      id, principal_id, channel, provider, sku_id, currency, amount_minor,
      base_coins, bonus_coins, bonus_bps, state, provider_payment_id,
      idempotency_key, first_spent_at, paid_at, created_at, updated_at
    ) VALUES('ord-c1','creator-1','web_browser','xsolla','playhub.coin.t4','KRW',14000,1000,250,2500,'PAID','pay-c1','idem-c1',NULL,?,?,?)
  `).run(now(), now(), now());
  creditPurchase(db, {
    principalId: 'creator-1',
    orderId: 'ord-c1',
    provider: 'xsolla',
    baseCoins: 1000,
    bonusCoins: 250,
    idempotencyKey: 'credit-c1',
    now
  });

  // 1. Within included Free/Pro storage quota -> 0 billable coins, no wallet mutation
  const freeUsage = recordMeteredUsage(db, {
    principalId: 'creator-1',
    metricType: 'storage_bytes',
    resourceRefId: 'proj-alpha',
    quantity: 20 * 1024 * 1024,
    billableCoins: 0,
    periodKey: '2026-11',
    idempotencyKey: 'meter-free-1',
    now
  });
  assert.equal(freeUsage.billableCoins, 0);
  assert.equal(freeUsage.journalEntryId, null);

  // 2. Multiplayer server metering via Hold -> Settle (reserve 24, settle 12, release 12)
  const hold = reserveHold(db, {
    principalId: 'creator-1',
    amountCoins: 24,
    sinkType: 'infra_server',
    sinkRefId: 'mo-inst-99',
    idempotencyKey: 'hold-mo-99',
    now
  });
  const srvUsage = recordMeteredUsage(db, {
    principalId: 'creator-1',
    metricType: 'server_minutes',
    resourceRefId: 'mo-inst-99',
    quantity: 60,
    billableCoins: 12,
    holdId: hold.hold.id,
    periodKey: '2026-11',
    idempotencyKey: 'meter-mo-99',
    now
  });
  assert.equal(srvUsage.replayed, false);
  assert.ok(srvUsage.journalEntryId);
  assert.equal(srvUsage.wallet.reserved, 0);
  assert.equal(srvUsage.wallet.bonus, 238);

  // Replay same usage idempotencyKey -> no double charge
  const replay = recordMeteredUsage(db, {
    principalId: 'creator-1',
    metricType: 'server_minutes',
    resourceRefId: 'mo-inst-99',
    quantity: 60,
    billableCoins: 12,
    holdId: hold.hold.id,
    periodKey: '2026-11',
    idempotencyKey: 'meter-mo-99',
    now
  });
  assert.equal(replay.replayed, true);
  assert.equal(getWallet(db, 'creator-1', now).bonus, 238);

  // 3. AI overage direct spend (50 PlayCoin)
  recordMeteredUsage(db, {
    principalId: 'creator-1',
    metricType: 'ai_units',
    resourceRefId: 'ai-session-7',
    quantity: 500,
    billableCoins: 50,
    periodKey: '2026-11',
    idempotencyKey: 'meter-ai-7',
    now
  });

  const summary = summarizeUsage(db, { principalId: 'creator-1', periodKey: '2026-11' });
  assert.equal(summary.byMetric.server_minutes.totalCoins, 12);
  assert.equal(summary.byMetric.ai_units.totalCoins, 50);
  assert.equal(summary.byMetric.storage_bytes.totalCoins, 0);
  assert.equal(verifyLedgerIntegrity(db).ok, true);
});

test('Track B Creator Direct Commerce: 0% platform fee, zero secret keys, mobile/TV fail-closed, Entitlement grant/revoke without touching PlayHub wallet', t => {
  const { db, now } = createFixture(t);

  // 1. Creator secret keys MUST be rejected
  assert.throws(
    () => upsertCreatorConnection(db, {
      principalId: 'creator-1',
      provider: 'stripe_connect',
      connectedAccountId: 'acct_creator_001',
      onboardingStatus: 'ACTIVE',
      chargesEnabled: true,
      countryCode: 'US',
      secretKey: 'sk_live_forbidden'
    }, now),
    e => e.status === 400 && e.code === 'CREATOR_SECRET_KEY_FORBIDDEN'
  );

  // 2. Non-zero platform fee MUST be rejected in both service & SQL CHECK
  assert.throws(
    () => upsertCreatorConnection(db, {
      principalId: 'creator-1',
      provider: 'stripe_connect',
      connectedAccountId: 'acct_creator_001',
      onboardingStatus: 'ACTIVE',
      chargesEnabled: true,
      countryCode: 'US',
      platformFeeBps: 500
    }, now),
    e => e.code === 'PLATFORM_FEE_MUST_BE_ZERO'
  );
  assert.throws(
    () => db.prepare(`
      INSERT INTO billing_creator_connections(principal_id, provider, connected_account_id, onboarding_status, charges_enabled, payouts_enabled, country_code, platform_fee_bps, updated_at)
      VALUES('creator-1','stripe_connect','acct_bad','ACTIVE',1,1,'US',100,?)
    `).run(now()),
    /CHECK constraint failed/
  );

  // Valid 0%-fee connection & product
  const conn = upsertCreatorConnection(db, {
    principalId: 'creator-1',
    provider: 'stripe_connect',
    connectedAccountId: 'acct_creator_001',
    onboardingStatus: 'ACTIVE',
    chargesEnabled: true,
    payoutsEnabled: true,
    countryCode: 'US'
  }, now);
  assert.equal(conn.platform_fee_bps, 0);

  const product = createCreatorProduct(db, {
    creatorId: 'creator-1',
    gameId: 'survivor-arena-g2',
    productKey: 'starter-pack',
    kind: 'durable',
    title: 'Starter Hero Pack',
    currency: 'USD',
    amountMinor: 499,
    allowedRegions: ['US', 'KR'],
    allowedPlatforms: ['web', 'android'],
    ageRating: 'ALL',
    now
  });

  // 3. Mobile & TV platforms MUST fail closed until P3 enabled
  for (const blockedPlatform of ['android', 'ios', 'google_tv', 'apple_tv', 'samsung_tv']) {
    assert.throws(
      () => createDirectOrder(db, {
        buyerId: 'player-1',
        productId: product.id,
        platform: blockedPlatform,
        idempotencyKey: `direct-blocked-${blockedPlatform}`,
        now
      }),
      e => e.status === 403 && e.code === 'PLATFORM_PAID_SALES_DISABLED'
    );
  }

  // Guest buyer blocked (cannot reliably hold entitlements)
  assert.throws(
    () => createDirectOrder(db, {
      buyerId: 'player-guest',
      productId: product.id,
      platform: 'web',
      idempotencyKey: 'direct-guest',
      now
    }),
    e => e.status === 403 && e.code === 'REGISTERED_ACCOUNT_REQUIRED'
  );

  // 4. Web direct order succeeds with applicationFeeAmount === 0
  const created = createDirectOrder(db, {
    buyerId: 'player-1',
    productId: product.id,
    platform: 'web',
    buyerRegion: 'KR',
    idempotencyKey: 'direct-ord-1',
    now
  });
  assert.equal(created.order.platform_fee_minor, 0);
  assert.equal(created.directChargeSpec.applicationFeeAmount, 0);
  assert.equal(created.directChargeSpec.connectedAccountId, 'acct_creator_001');

  // 5. Verified payment webhook grants Entitlement WITHOUT touching PlayHub PlayCoin ledger/wallets
  const confirmed = confirmDirectOrderPayment(db, {
    directOrderId: created.order.id,
    providerChargeId: 'ch_direct_001',
    idempotencyKey: 'confirm-direct-1',
    now
  });
  assert.equal(confirmed.entitlement.state, 'ACTIVE');
  assert.equal(confirmed.entitlement.product_key, 'starter-pack');
  assert.equal(listActiveEntitlements(db, { buyerId: 'player-1', gameId: 'survivor-arena-g2', now }).length, 1);

  // Verify PlayHub wallet & journal remained completely untouched (PlayHub never holds creator funds)
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM billing_journal_entries').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM billing_wallet_accounts').get().n, 0);

  // 6. Refund webhook immediately revokes Entitlement
  const revoked = revokeDirectOrderEntitlement(db, {
    directOrderId: created.order.id,
    orderState: 'REFUNDED',
    reason: 'creator_stripe_refund',
    idempotencyKey: 'revoke-direct-1',
    now
  });
  assert.equal(revoked.order.state, 'REFUNDED');
  assert.equal(revoked.entitlement.state, 'REVOKED');
  assert.equal(listActiveEntitlements(db, { buyerId: 'player-1', gameId: 'survivor-arena-g2', now }).length, 0);

  // 7. RiskControls: suspending product or connection blocks new direct orders immediately
  suspendCreatorProduct(db, { productId: product.id, now });
  assert.throws(
    () => createDirectOrder(db, {
      buyerId: 'player-1',
      productId: product.id,
      platform: 'web',
      idempotencyKey: 'direct-after-suspend-prod',
      now
    }),
    e => e.status === 403 && e.code === 'PRODUCT_NOT_AVAILABLE'
  );

  const product2 = createCreatorProduct(db, {
    creatorId: 'creator-1',
    gameId: 'survivor-arena-g2',
    productKey: 'vip-pass',
    kind: 'pass',
    title: 'VIP Pass',
    currency: 'USD',
    amountMinor: 999,
    now
  });
  suspendCreatorConnection(db, { principalId: 'creator-1', now });
  assert.throws(
    () => createDirectOrder(db, {
      buyerId: 'player-1',
      productId: product2.id,
      platform: 'web',
      idempotencyKey: 'direct-after-suspend-conn',
      now
    }),
    e => e.status === 403 && e.code === 'CREATOR_PAYMENTS_NOT_ACTIVE'
  );
});

test('All 20 billing_* tables (Track A + Track B) pass backup & restore-data.mjs integrity checks', async t => {
  const { root, dataDir, db, now } = createFixture(t);
  assert.equal(Object.keys(BILLING_OPTIONAL_TABLES).length, 20);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 1);

  upsertCreatorConnection(db, {
    principalId: 'creator-1',
    provider: 'stripe_connect',
    connectedAccountId: 'acct_bkp_1',
    onboardingStatus: 'ACTIVE',
    chargesEnabled: true,
    payoutsEnabled: true,
    countryCode: 'US'
  }, now);
  const prod = createCreatorProduct(db, {
    creatorId: 'creator-1',
    gameId: 'test-game',
    productKey: 'dlc-1',
    kind: 'durable',
    title: 'DLC 1',
    currency: 'USD',
    amountMinor: 299,
    now
  });
  const dord = createDirectOrder(db, {
    buyerId: 'player-1',
    productId: prod.id,
    platform: 'web',
    idempotencyKey: 'bkp-dord-1',
    now
  });
  confirmDirectOrderPayment(db, {
    directOrderId: dord.order.id,
    providerChargeId: 'ch_bkp_1',
    idempotencyKey: 'bkp-confirm-1',
    now
  });

  const configPath = path.join(root, 'private.json');
  const backupPath = path.join(root, 'backups', 'billing-2track.sqlite');
  fs.writeFileSync(configPath, JSON.stringify({
    dataDir,
    publicPort: 18992,
    adminPort: 18993,
    publicHost: '127.0.0.1',
    adminHost: '127.0.0.1',
    userOrigins: ['http://127.0.0.1:8080'],
    adminOrigins: ['http://127.0.0.1:8081'],
    userBaseUrl: 'http://127.0.0.1:8080',
    publicBaseUrl: 'http://127.0.0.1:18992',
    adminBaseUrl: 'http://127.0.0.1:8081',
    google: {}
  }));

  const report = await createBackup({ configPath, out: backupPath });
  assert.equal(report.databaseUserVersion, 1);

  const verify = await restoreData({ configPath, from: backupPath });
  assert.equal(verify.ok, true, JSON.stringify(verify));
  assert.equal(verify.mode, 'verify');
});
