import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scryptSync } from 'node:crypto';
import { createApp } from '../server/app.mjs';
import { PUBLIC_COOKIE, ADMIN_COOKIE, digest, uid } from '../server/security.mjs';
import { ensureMobileSchema } from '../server/mobile/schema.mjs';
import { ensureBillingSchema } from '../server/billing/schema.mjs';
import { ensureSocialSchema } from '../server/social/schema.mjs';
import { ensureAdGameSchema } from '../server/adgame/schema.mjs';
import { ensureShortsSchema } from '../server/shorts/schema.mjs';
import { inspectDatabase } from '../tools/restore-data.mjs';
import { sanitizeSnapshot } from '../tools/sanitize-snapshot.mjs';
import {
  ALLOWED_CONSENT_PURPOSES,
  getConsents,
  setConsents,
  canUseForMlTraining
} from '../server/trust/consent.mjs';
import { executeAccountDeletion } from '../server/trust/dsar.mjs';
import {
  evaluateRisk,
  submitAppeal,
  resolveReview
} from '../server/trust/risk-engine.mjs';
import {
  recordShaderTelemetry,
  rankShaderPrewarmPriorities,
  recordMmoRoomTelemetry,
  forecastWarmPoolDemand
} from '../server/trust/infra-ml.mjs';
import {
  DDA_MIN_MULTIPLIER,
  DDA_MAX_MULTIPLIER,
  DDA_NEUTRAL_MULTIPLIER,
  computeEthicalDdaProfile
} from '../server/trust/ethical-dda.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HUB_ROOT = path.resolve(__dirname, '..');
const ADMIN_SALT = '0123456789abcdef0123456789abcdef';
const ADMIN_PASSWORD = 'trust-admin-password-2026';
const ADMIN_HASH = scryptSync(ADMIN_PASSWORD, ADMIN_SALT, 64).toString('hex');

async function createTrustHarness(t) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-trust-test-'));
  const dataDir = path.join(tmpDir, 'data');
  const fixtureRoot = path.join(tmpDir, 'hub-root');
  fs.mkdirSync(path.join(fixtureRoot, 'catalog'), { recursive: true });
  fs.mkdirSync(path.join(fixtureRoot, 'games', 'survivor-arena-g2'), { recursive: true });
  fs.mkdirSync(path.join(fixtureRoot, 'games', 'mature-noir-18'), { recursive: true });
  fs.writeFileSync(
    path.join(fixtureRoot, 'catalog', 'games.json'),
    JSON.stringify({
      schemaVersion: 1,
      entries: [
        { id: 'survivor-arena-g2', path: 'games/survivor-arena-g2', enabled: true },
        { id: 'mature-noir-18', path: 'games/mature-noir-18', enabled: true }
      ]
    })
  );
  fs.writeFileSync(
    path.join(fixtureRoot, 'games', 'survivor-arena-g2', 'game.manifest.json'),
    JSON.stringify({
      schemaVersion: 1,
      id: 'survivor-arena-g2',
      entry: 'index.html',
      version: '1.2.0',
      title: { ko: '서바이버 아레나' },
      summary: { ko: '테스트 게임' },
      instructions: { ko: '이동 및 생존' },
      tags: ['action'],
      controls: ['keyboard'],
      save: { schemaVersion: 1 },
      media: { cover: 'assets/cover.svg' }
    })
  );
  fs.writeFileSync(
    path.join(fixtureRoot, 'games', 'mature-noir-18', 'game.manifest.json'),
    JSON.stringify({
      schemaVersion: 1,
      id: 'mature-noir-18',
      entry: 'index.html',
      version: '1.0.0',
      ageRating: '18+',
      title: { ko: '성인 누아르' },
      summary: { ko: '18세 이용가 테스트 게임' },
      instructions: { ko: '조사' },
      tags: ['noir', '18+'],
      controls: ['keyboard'],
      save: { schemaVersion: 1 },
      media: { cover: 'assets/cover.svg' }
    })
  );

  let clock = Date.UTC(2026, 10, 22, 6, 0, 0);
  const now = () => clock;
  const advance = ms => { clock += ms; };

  const app = createApp(
    {
      dataDir,
      publicHost: '127.0.0.1',
      publicPort: 0,
      adminHost: '127.0.0.1',
      adminPort: 0,
      userBaseUrl: 'http://127.0.0.1:8090',
      userOrigins: ['http://127.0.0.1:8090'],
      adminOrigins: ['http://127.0.0.1:8091'],
      secureCookies: false,
      admin: {
        username: 'trust-admin',
        salt: ADMIN_SALT,
        passwordHash: ADMIN_HASH
      },
      billing: { enabled: true, allowMockProvider: true },
      mobile: { enabled: true, jwtSecret: 'trust-mobile-jwt-secret-0123456789abcdef' }
    },
    { rootDir: fixtureRoot, clock: now }
  );

  ensureMobileSchema(app.db);
  ensureBillingSchema(app.db);
  ensureSocialSchema(app.db);
  ensureAdGameSchema(app.db);
  ensureShortsSchema(app.db);

  const ports = await app.listen();
  const publicBase = `http://127.0.0.1:${ports.public.port}`;
  const adminBase = `http://127.0.0.1:${ports.admin.port}`;
  const userOrigin = 'http://127.0.0.1:8090';
  const adminOrigin = 'http://127.0.0.1:8091';

  t.after(async () => {
    await app.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function createRegisteredUserSession(userId, displayName, ageTier = null) {
    const stamp = now();
    app.db.prepare('INSERT INTO users(id, kind, display_name, created_at) VALUES(?, ?, ?, ?)')
      .run(userId, 'registered', displayName, stamp - 86400000);
    app.db.prepare('INSERT INTO identities(provider, subject, user_id) VALUES(?, ?, ?)')
      .run('google', `sub-${userId}`, userId);
    if (ageTier) {
      app.db.prepare(
        'INSERT INTO user_age_compliance(principal_id, region_code, age_tier, parental_consent_status, updated_at) VALUES(?, ?, ?, ?, ?)'
      ).run(userId, 'KR', ageTier, 'not_required', stamp);
    }
    const rawToken = `tok_${uid()}`;
    const csrf = `csrf_${uid()}`;
    const analyticsSubject = `a:${uid()}`;
    app.db.prepare(`
      INSERT INTO sessions(id_hash, kind, principal_id, analytics_subject, csrf, admin_authenticated, admin_username, created_at, expires_at, traffic_type, qa_run_id)
      VALUES(?, 'public', ?, ?, ?, 0, NULL, ?, ?, 'live', NULL)
    `).run(digest(rawToken), userId, analyticsSubject, csrf, stamp, stamp + 30 * 86400000);

    return {
      userId,
      rawToken,
      csrf,
      analyticsSubject,
      cookie: `${PUBLIC_COOKIE}=${rawToken}`
    };
  }

  function createAdminSession() {
    const stamp = now();
    const rawToken = `admtok_${uid()}`;
    const csrf = `admcsrf_${uid()}`;
    app.db.prepare(`
      INSERT INTO sessions(id_hash, kind, principal_id, analytics_subject, csrf, admin_authenticated, admin_username, created_at, expires_at, traffic_type, qa_run_id)
      VALUES(?, 'admin', NULL, ?, ?, 1, 'trust-admin', ?, ?, 'live', NULL)
    `).run(digest(rawToken), `a:${uid()}`, csrf, stamp, stamp + 8 * 3600000);

    return {
      rawToken,
      csrf,
      cookie: `${ADMIN_COOKIE}=${rawToken}`
    };
  }

  return {
    app,
    db: app.db,
    tmpDir,
    dataDir,
    now,
    advance,
    publicBase,
    adminBase,
    userOrigin,
    adminOrigin,
    createRegisteredUserSession,
    createAdminSession
  };
}

// ---------------------------------------------------------------------------
// 1. Phase 0: Granular Consent, CHILD_PROTECTED Hard Block & Web Age Guard
// ---------------------------------------------------------------------------
test('Phase 0 Consent: adult opt-in/opt-out, CHILD_PROTECTED hard block, and non-breaking web play-session 18+ guard', async t => {
  const h = await createTrustHarness(t);

  const adult = h.createRegisteredUserSession('user-adult-1', '성인 게이머', 'ADULT');
  const child = h.createRegisteredUserSession('user-child-1', '어린이 게이머', 'CHILD_PROTECTED');
  const teen = h.createRegisteredUserSession('user-teen-1', '청소년 게이머', 'TEEN_MINOR');
  const legacyNoCompliance = h.createRegisteredUserSession('user-legacy-1', '기존 웹 유저', null);

  // Adult defaults: all false
  const initialRes = await fetch(`${h.publicBase}/api/me/consents`, {
    headers: { Cookie: adult.cookie }
  });
  assert.equal(initialRes.status, 200);
  const initialBody = await initialRes.json();
  assert.equal(initialBody.ageTier, 'ADULT');
  assert.equal(initialBody.isAgeRestricted, false);
  for (const purpose of ALLOWED_CONSENT_PURPOSES) {
    assert.equal(initialBody.purposes[purpose].granted, false);
  }
  assert.equal(canUseForMlTraining(h.db, adult.userId, 'ai_training_play').allowed, false);

  // Adult grants analytics, personalization, ai_training_play via PUT + CSRF
  const putAdult = await fetch(`${h.publicBase}/api/me/consents`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Origin: h.userOrigin,
      Cookie: adult.cookie,
      'X-CSRF-Token': adult.csrf
    },
    body: JSON.stringify({
      purposes: {
        analytics: true,
        personalization: true,
        ai_training_play: true
      },
      policyVersion: '2026-11-v2',
      source: 'web_settings'
    })
  });
  assert.equal(putAdult.status, 200);
  const putAdultBody = await putAdult.json();
  assert.equal(putAdultBody.purposes.analytics.granted, true);
  assert.equal(putAdultBody.purposes.personalization.granted, true);
  assert.equal(putAdultBody.purposes.ai_training_play.granted, true);
  assert.equal(putAdultBody.purposes.ai_training_play.policyVersion, '2026-11-v2');

  const mlAllowed = canUseForMlTraining(h.db, adult.userId, 'ai_training_play');
  assert.equal(mlAllowed.allowed, true);
  assert.equal(mlAllowed.reason, 'CONSENT_GRANTED');

  // CHILD_PROTECTED hard-blocked from personalization / ai_training_* / marketing_*
  const childBlockedRes = await fetch(`${h.publicBase}/api/me/consents`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Origin: h.userOrigin,
      Cookie: child.cookie,
      'X-CSRF-Token': child.csrf
    },
    body: JSON.stringify({
      purposes: {
        personalization: true,
        ai_training_play: true
      }
    })
  });
  assert.equal(childBlockedRes.status, 403);
  const childBlockedBody = await childBlockedRes.json();
  assert.equal(childBlockedBody.error.code, 'CONSENT_AGE_RESTRICTED');
  assert.deepEqual(
    childBlockedBody.error.blockedPurposes.sort(),
    ['ai_training_play', 'personalization']
  );

  // CHILD_PROTECTED can still opt into basic analytics, and ML training remains hard-blocked
  const childAnalyticsRes = await fetch(`${h.publicBase}/api/me/consents`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Origin: h.userOrigin,
      Cookie: child.cookie,
      'X-CSRF-Token': child.csrf
    },
    body: JSON.stringify({ purposes: { analytics: true } })
  });
  assert.equal(childAnalyticsRes.status, 200);
  const childMl = canUseForMlTraining(h.db, child.userId, 'ai_training_play');
  assert.equal(childMl.allowed, false);
  assert.equal(childMl.reason, 'AGE_RESTRICTED');

  // TEEN_MINOR also blocked on marketing / ai_training
  assert.throws(
    () => setConsents(h.db, teen.userId, { marketing_push: true, ai_training_creator: true }, { now: h.now }),
    err => err.status === 403 && err.code === 'CONSENT_AGE_RESTRICTED'
  );

  // Missing compliance record when childRestricted=true is also hard-blocked
  assert.throws(
    () => setConsents(h.db, legacyNoCompliance.userId, { ai_training_play: true }, { childRestricted: true, now: h.now }),
    err => err.status === 403 && err.code === 'CONSENT_AGE_RESTRICTED'
  );

  // Non-breaking web POST /api/play-sessions guard:
  // CHILD_PROTECTED blocked from 18+ game on web POST /api/play-sessions
  const blockedPlay = await fetch(`${h.publicBase}/api/play-sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: h.userOrigin,
      Cookie: child.cookie,
      'X-CSRF-Token': child.csrf
    },
    body: JSON.stringify({ gameId: 'mature-noir-18' })
  });
  assert.equal(blockedPlay.status, 403);
  const blockedPlayBody = await blockedPlay.json();
  assert.equal(blockedPlayBody.error.code, 'AGE_RATING_RESTRICTED');

  // CHILD_PROTECTED is still allowed to play an ALL-rated game
  const allowedChildPlay = await fetch(`${h.publicBase}/api/play-sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: h.userOrigin,
      Cookie: child.cookie,
      'X-CSRF-Token': child.csrf
    },
    body: JSON.stringify({ gameId: 'survivor-arena-g2' })
  });
  assert.equal(allowedChildPlay.status, 201);

  // Legacy user with NO user_age_compliance record is NOT broken
  const legacyPlay = await fetch(`${h.publicBase}/api/play-sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: h.userOrigin,
      Cookie: legacyNoCompliance.cookie,
      'X-CSRF-Token': legacyNoCompliance.csrf
    },
    body: JSON.stringify({ gameId: 'mature-noir-18' })
  });
  assert.equal(legacyPlay.status, 201);
});

// ---------------------------------------------------------------------------
// 2. Phase 0: Atomic DELETE /api/account (DSAR — FK & Statutory 5yr Safe)
// ---------------------------------------------------------------------------
test('Phase 0 DSAR: precondition blocks on debt_coins/active subscription, then clean atomic purge + tombstone with zero FK errors', async t => {
  const h = await createTrustHarness(t);
  const stamp = h.now();
  const user = h.createRegisteredUserSession('user-dsar-1', '홍길동 실명', 'ADULT');

  // Populate rich relational graph under PRAGMA foreign_keys=ON
  h.db.prepare('INSERT INTO email_credentials(user_id, email, password_hash, salt, failed_attempts, locked_until, created_at, updated_at) VALUES(?,?,?,?,0,NULL,?,?)')
    .run(user.userId, 'hong@example.com', 'hash123', 'salt123', stamp, stamp);
  h.db.prepare('INSERT INTO mobile_tokens(id_hash, principal_id, family_id, expires_at, created_at) VALUES(?,?,?,?,?)')
    .run('mob_tok_hash_1', user.userId, 'fam_1', stamp + 86400000, stamp);
  h.db.prepare('INSERT INTO user_preferences(principal_id, locale, updated_at) VALUES(?,?,?)')
    .run(user.userId, 'ko', stamp);
  h.db.prepare('INSERT INTO save_slots(principal_id, game_id, slot, schema_version, revision, payload, updated_at) VALUES(?,?,?,?,?,?,?)')
    .run(user.userId, 'survivor-arena-g2', 'main', 1, 2, '{"wave":9}', stamp);
  h.db.prepare('INSERT INTO save_slot_versions(principal_id, game_id, slot, last_revision) VALUES(?,?,?,?)')
    .run(user.userId, 'survivor-arena-g2', 'main', 2);
  setConsents(h.db, user.userId, { analytics: true, ai_training_play: true }, { now: h.now });

  // Social + Community + Shorts + PlaySession + Events + AdGame + DataStore + Leaderboard
  h.db.prepare('INSERT INTO user_profiles(principal_id, handle, avatar_color, bio, privacy_level, updated_at) VALUES(?,?,?,?,?,?)')
    .run(user.userId, 'Hong#1234', '#00B06F', '개인 소개글', 'public', stamp);
  h.db.prepare("INSERT INTO social_messages(id, channel_type, channel_key, sender_id, body, is_quick_message, created_at) VALUES(?, 'dm', 'dm:1', ?, '안녕하세요 개인메시지', 0, ?)")
    .run('msg-1', user.userId, stamp);
  h.db.prepare("INSERT INTO community_items(id, game_id, author_id, kind, title, body, status, hidden, created_at, updated_at) VALUES(?, 'survivor-arena-g2', ?, 'comment', '내 리뷰 제목', '내 리뷰 본문', 'open', 0, ?, ?)")
    .run('comm-1', user.userId, stamp, stamp);
  h.db.prepare(`
    INSERT INTO shorts_videos(id, creator_id, creator_name, title, caption, engine_id, resolved_engine_id, status, visibility, created_at, updated_at)
    VALUES('short-1', ?, '홍길동 실명', '게임 쇼츠', '내 캡션', 'veo', 'veo', 'published', 'public', ?, ?)
  `).run(user.userId, stamp, stamp);
  h.db.prepare(`
    INSERT INTO play_sessions(id, session_hash, principal_id, subject_id, game_id, build_id, started_at, expires_at)
    VALUES('ps-dsar-1', ?, ?, ?, 'survivor-arena-g2', '1.0', ?, ?)
  `).run(digest(user.rawToken), user.userId, user.analyticsSubject, stamp, stamp + 3600000);
  h.db.prepare(`
    INSERT INTO events(id, fingerprint, name, subject_id, visit_id, play_session_id, game_id, occurred_at, received_at, properties, source)
    VALUES('ev-dsar-1', 'fp1', 'play_click', ?, 'visit-1', 'ps-dsar-1', 'survivor-arena-g2', ?, ?, '{}', 'portal')
  `).run(user.analyticsSubject, stamp, stamp);
  h.db.prepare(`
    INSERT INTO ad_handoff_tokens(token_hash, short_code, session_id, campaign_id, partner_id, target_game_id, status, claimed_user_id, claimed_device_hash, expires_at, created_at)
    VALUES('th1', 'SC001', 's1', 'c1', 'p1', 'survivor-arena-g2', 'claimed', ?, 'devhash1', ?, ?)
  `).run(user.userId, stamp + 86400000, stamp);
  h.db.prepare(`
    INSERT INTO ad_attributions(id, user_id, partner_id, campaign_id, handoff_token_hash, payout_status, created_at)
    VALUES('attr-1', ?, 'p1', 'c1', 'th1', 'pending', ?)
  `).run(user.userId, stamp);
  h.db.prepare(`
    INSERT INTO datastore_entries(game_id, scope, entry_key, owner_principal_id, revision, value_json, bytes, etag, updated_by, created_at, updated_at)
    VALUES('survivor-arena-g2', 'player', 'profile', ?, 1, '{}', 2, 'e1', ?, ?, ?)
  `).run(user.userId, user.userId, stamp, stamp);
  h.db.prepare(`
    INSERT INTO leaderboard_entries(game_id, board_key, period_key, principal_id, score, sort_score, achieved_at, updated_at)
    VALUES('survivor-arena-g2', 'main', 'all', ?, 5000, 5000, ?, ?)
  `).run(user.userId, stamp, stamp);

  // Statutory 5-year billing order + wallet with debt_coins > 0 + active sanction (anti-ban-evasion)
  h.db.prepare(`
    INSERT INTO billing_orders(id, principal_id, channel, provider, sku_id, currency, amount_minor, base_coins, bonus_coins, bonus_bps, state, idempotency_key, paid_at, created_at, updated_at)
    VALUES('ord-stat-1', ?, 'web_browser', 'mock', 'pc_1000', 'KRW', 11000, 1000, 250, 2500, 'PAID', 'idem-ord-1', ?, ?, ?)
  `).run(user.userId, stamp, stamp, stamp);
  h.db.prepare(`
    INSERT INTO billing_wallet_accounts(principal_id, paid_balance, bonus_balance, promo_balance, reserved_coins, debt_coins, updated_at)
    VALUES(?, 1000, 250, 0, 0, 500, ?)
  `).run(user.userId, stamp);
  h.db.prepare(`
    INSERT INTO user_sanctions(id, principal_id, scope, action, reason, created_by, created_at)
    VALUES('sanc-1', ?, 'leaderboard', 'exclude', 'anti-ban-evasion test record', 'admin', ?)
  `).run(user.userId, stamp);

  // Step 1: Must block with 409 ACCOUNT_DELETE_PRECONDITION_FAILED while debt_coins > 0
  const blockedDel = await fetch(`${h.publicBase}/api/account`, {
    method: 'DELETE',
    headers: {
      Origin: h.userOrigin,
      Cookie: user.cookie,
      'X-CSRF-Token': user.csrf
    }
  });
  assert.equal(blockedDel.status, 409);
  const blockedDelBody = await blockedDel.json();
  assert.equal(blockedDelBody.error.code, 'ACCOUNT_DELETE_PRECONDITION_FAILED');
  assert.ok(blockedDelBody.error.blockers.some(b => b.code === 'DEBT_COINS_OUTSTANDING'));

  // Clear debt_coins, then verify active subscription ALSO blocks
  h.db.prepare('UPDATE billing_wallet_accounts SET debt_coins=0 WHERE principal_id=?').run(user.userId);
  h.db.prepare(`
    INSERT INTO billing_subscriptions(id, principal_id, plan_tier, status, provider, current_period_start, current_period_end, created_at, updated_at)
    VALUES('sub-1', ?, 'pro', 'ACTIVE', 'mock', ?, ?, ?, ?)
  `).run(user.userId, stamp, stamp + 30 * 86400000, stamp, stamp);

  assert.throws(
    () => executeAccountDeletion(h.db, user.userId, { now: h.now }),
    err => err.status === 409 && err.code === 'ACCOUNT_DELETE_PRECONDITION_FAILED' &&
      err.extra.blockers.some(b => b.code === 'ACTIVE_SUBSCRIPTION')
  );

  // Cancel subscription so account is now eligible for deletion
  h.db.prepare("UPDATE billing_subscriptions SET status='CANCELED' WHERE id='sub-1'").run();

  // Step 2: Execute DELETE /api/account via HTTP
  const delRes = await fetch(`${h.publicBase}/api/account`, {
    method: 'DELETE',
    headers: {
      Origin: h.userOrigin,
      Cookie: user.cookie,
      'X-CSRF-Token': user.csrf
    }
  });
  assert.equal(delRes.status, 200);
  const setCookieHeader = delRes.headers.get('set-cookie') || '';
  assert.match(setCookieHeader, /Max-Age=0/);
  const delBody = await delRes.json();
  assert.equal(delBody.ok, true);
  assert.equal(delBody.status, 'deleted');

  // Verify tombstoned users row (zero PII)
  const tomb = h.db.prepare('SELECT id, kind, display_name FROM users WHERE id=?').get(user.userId);
  assert.equal(tomb.kind, 'deleted');
  assert.equal(tomb.display_name, null);

  // Verify hard-purged PII/auth/saves/consents/leaderboard
  assert.equal(h.db.prepare('SELECT COUNT(*) n FROM sessions WHERE principal_id=?').get(user.userId).n, 0);
  assert.equal(h.db.prepare('SELECT COUNT(*) n FROM mobile_tokens WHERE principal_id=?').get(user.userId).n, 0);
  assert.equal(h.db.prepare('SELECT COUNT(*) n FROM identities WHERE user_id=?').get(user.userId).n, 0);
  assert.equal(h.db.prepare('SELECT COUNT(*) n FROM email_credentials WHERE user_id=?').get(user.userId).n, 0);
  assert.equal(h.db.prepare('SELECT COUNT(*) n FROM save_slots WHERE principal_id=?').get(user.userId).n, 0);
  assert.equal(h.db.prepare('SELECT COUNT(*) n FROM user_consents WHERE principal_id=?').get(user.userId).n, 0);
  assert.equal(h.db.prepare('SELECT COUNT(*) n FROM user_profiles WHERE principal_id=?').get(user.userId).n, 0);
  assert.equal(h.db.prepare('SELECT COUNT(*) n FROM leaderboard_entries WHERE principal_id=?').get(user.userId).n, 0);

  // Verify anonymized / redacted content
  assert.equal(h.db.prepare("SELECT body FROM social_messages WHERE id='msg-1'").get().body, '[deleted]');
  const comm = h.db.prepare("SELECT title, body, hidden FROM community_items WHERE id='comm-1'").get();
  assert.equal(comm.title, '[deleted]');
  assert.equal(comm.body, '[deleted]');
  assert.equal(comm.hidden, 1);
  const sv = h.db.prepare("SELECT creator_id, creator_name FROM shorts_videos WHERE id='short-1'").get();
  assert.notEqual(sv.creator_id, user.userId);
  assert.equal(sv.creator_name, '[deleted]');
  const ps = h.db.prepare("SELECT principal_id, subject_id FROM play_sessions WHERE id='ps-dsar-1'").get();
  assert.notEqual(ps.principal_id, user.userId);
  const handoff = h.db.prepare("SELECT claimed_user_id, claimed_device_hash FROM ad_handoff_tokens WHERE token_hash='th1'").get();
  assert.equal(handoff.claimed_user_id, null);
  assert.equal(handoff.claimed_device_hash, null);
  const ds = h.db.prepare("SELECT owner_principal_id FROM datastore_entries WHERE entry_key='profile'").get();
  assert.equal(ds.owner_principal_id, null);

  // Verify statutory 5-year billing_orders & anti-ban-evasion user_sanctions PRESERVED intact
  assert.equal(h.db.prepare("SELECT COUNT(*) n FROM billing_orders WHERE id='ord-stat-1'").get().n, 1);
  assert.equal(h.db.prepare("SELECT COUNT(*) n FROM user_sanctions WHERE id='sanc-1'").get().n, 1);

  // Verify ZERO SQLite foreign-key violations under PRAGMA foreign_keys=ON!
  const fkViolations = h.db.prepare('PRAGMA foreign_key_check').all();
  assert.equal(fkViolations.length, 0);
});

// ---------------------------------------------------------------------------
// 3. N5 Server-Authoritative Risk ML + PIPA Art. 37-2 PENDING_REVIEW HITL
// ---------------------------------------------------------------------------
test('N5 Risk ML: leaderboard velocity, CPA active_ms mismatch, Track B >0.75% chargeback -> PENDING_REVIEW (zero auto-ban), appeal & admin resolve', async t => {
  const h = await createTrustHarness(t);
  const player = h.createRegisteredUserSession('user-risk-1', '플레이어1', 'ADULT');
  const creator = h.createRegisteredUserSession('user-creator-1', '창작자1', 'ADULT');
  const admin = h.createAdminSession();

  const sanctionsBefore = h.db.prepare('SELECT COUNT(*) n FROM user_sanctions').get().n;

  // (a) Leaderboard extreme score velocity + macro rhythm -> PENDING_REVIEW
  const lbRisk = evaluateRisk(h.db, {
    domain: 'leaderboard',
    entityType: 'leaderboard_submission',
    entityId: 'sub-cheat-1',
    principalId: player.userId,
    features: {
      score: 999999,
      activeMs: 5000,
      minPlayMs: 15000,
      expectedMaxScorePerSec: 100,
      boardZScore: 8.5,
      heartbeatIntervalCv: 0.004
    },
    now: h.now
  });
  assert.ok(lbRisk.riskScore >= 0.7);
  assert.equal(lbRisk.decision, 'PENDING_REVIEW');
  assert.equal(lbRisk.autoBanned, false);
  assert.ok(lbRisk.reviewId);
  assert.ok(lbRisk.topFactors.length >= 2);
  assert.match(lbRisk.explanationKo, /제37조의2/);

  // (b) AdGame CPA server active_ms mismatch + duplicate device claim -> PENDING_REVIEW
  const cpaRisk = evaluateRisk(h.db, {
    domain: 'cpa',
    entityType: 'ad_attribution',
    entityId: 'attr-fraud-1',
    principalId: player.userId,
    features: {
      claimedPlayMs: 45000,
      serverActiveMs: 1200,
      priorDeviceClaim: true,
      clickToClaimMs: 1100
    },
    now: h.now
  });
  assert.ok(cpaRisk.riskScore >= 0.7);
  assert.equal(cpaRisk.decision, 'PENDING_REVIEW');
  assert.equal(cpaRisk.autoBanned, false);
  assert.ok(cpaRisk.topFactors.some(f => f.feature === 'active_ms_mismatch'));

  // (c) Track B Stripe Connect > 0.75% chargeback rate spike -> PENDING_REVIEW
  const trackBRisk = evaluateRisk(h.db, {
    domain: 'billing_b',
    entityType: 'creator_connection',
    entityId: 'acct_connect_1',
    principalId: creator.userId,
    features: {
      paidOrders30d: 100,
      chargebacks30d: 2, // 2.0% > 0.75% Stripe Connect threshold
      refundRate30d: 0.14
    },
    now: h.now
  });
  assert.ok(trackBRisk.riskScore >= 0.7);
  assert.equal(trackBRisk.decision, 'PENDING_REVIEW');
  assert.equal(trackBRisk.autoBanned, false);
  assert.ok(trackBRisk.topFactors.some(f => f.feature === 'stripe_connect_chargeback_rate_30d'));

  // (d) Low-risk normal submission -> ALLOW (not queued)
  const cleanRisk = evaluateRisk(h.db, {
    domain: 'leaderboard',
    entityType: 'leaderboard_submission',
    entityId: 'sub-clean-1',
    principalId: player.userId,
    features: { score: 800, activeMs: 45000, minPlayMs: 10000, expectedMaxScorePerSec: 100, boardZScore: 1.1 },
    now: h.now
  });
  assert.equal(cleanRisk.decision, 'ALLOW');
  assert.equal(cleanRisk.reviewId, null);

  // PIPA Art. 37-2 invariant: ZERO automated sanctions created!
  const sanctionsAfter = h.db.prepare('SELECT COUNT(*) n FROM user_sanctions').get().n;
  assert.equal(sanctionsAfter, sanctionsBefore);

  // User reads their PENDING_REVIEW explanation via GET /api/me/risk-reviews
  const myReviewsRes = await fetch(`${h.publicBase}/api/me/risk-reviews`, {
    headers: { Cookie: player.cookie }
  });
  assert.equal(myReviewsRes.status, 200);
  const myReviewsBody = await myReviewsRes.json();
  assert.equal(myReviewsBody.reviews.length, 2);
  assert.equal(myReviewsBody.reviews[0].status, 'PENDING_REVIEW');

  // User submits appeal via POST /api/me/risk-reviews/:id/appeal
  const appealRes = await fetch(`${h.publicBase}/api/me/risk-reviews/${lbRisk.reviewId}/appeal`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: h.userOrigin,
      Cookie: player.cookie,
      'X-CSRF-Token': player.csrf
    },
    body: JSON.stringify({
      appealText: '네트워크 지연 후 재연결되어 점수가 한 번에 반영되었습니다. 정상 플레이입니다.'
    })
  });
  assert.equal(appealRes.status, 200);
  const appealBody = await appealRes.json();
  assert.equal(appealBody.review.status, 'APPEALED');
  assert.match(appealBody.review.userAppealText, /정상 플레이/);

  // Admin lists queue via GET /api/admin/risk/reviews
  const adminListRes = await fetch(`${h.adminBase}/api/admin/risk/reviews?status=APPEALED`, {
    headers: { Cookie: admin.cookie }
  });
  assert.equal(adminListRes.status, 200);
  const adminListBody = await adminListRes.json();
  assert.equal(adminListBody.reviews.length, 1);
  assert.equal(adminListBody.reviews[0].id, lbRisk.reviewId);

  // Admin resolves appeal as APPROVED via POST /api/admin/risk/reviews/:id/resolve
  const resolveRes = await fetch(`${h.adminBase}/api/admin/risk/reviews/${lbRisk.reviewId}/resolve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: h.adminOrigin,
      Cookie: admin.cookie,
      'X-CSRF-Token': admin.csrf
    },
    body: JSON.stringify({
      resolution: 'APPROVED',
      note: '리플레이 로그 확인 결과 정상 플레이로 판정'
    })
  });
  assert.equal(resolveRes.status, 200);
  const resolveBody = await resolveRes.json();
  assert.equal(resolveBody.review.status, 'APPROVED');
  assert.equal(resolveBody.review.assignedTo, 'trust-admin');

  // Admin resolves Track B review as CONFIRMED_FRAUD
  const resolvedFraud = resolveReview(h.db, {
    reviewId: trackBRisk.reviewId,
    adminUser: 'trust-admin',
    resolution: 'CONFIRMED_FRAUD',
    note: '차지백 2% 초과 확인 — 상품 일시 중단 권고',
    now: h.now
  });
  assert.equal(resolvedFraud.status, 'CONFIRMED_FRAUD');
});

// ---------------------------------------------------------------------------
// 4. N7 Shader HitchImpactScore Ranking & Warm Pool ML Forecaster
// ---------------------------------------------------------------------------
test('N7 Infra ML: Shader HitchImpactScore (6651ms cold vs 963ms warm) ranking & Warm Pool forecast with party launch spike and burn-rate tier', async t => {
  const h = await createTrustHarness(t);
  const admin = h.createAdminSession();

  // Desktop client posts shader telemetry WITHOUT browser Origin header (native host)
  const postTelemetry = async payload => {
    const res = await fetch(`${h.publicBase}/api/desktop/telemetry/shader`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    assert.equal(res.status, 201);
    return res.json();
  };

  // survivor-arena-g2: 963ms warm baseline vs 6651ms cold start (3 cold sessions, avg 4 hitches >=100ms)
  await postTelemetry({
    gameId: 'survivor-arena-g2',
    gameVersion: '1.2.0',
    engineVersion: '4.7.0',
    renderer: 'vulkan',
    gpuVendor: 'NVIDIA',
    gpuName: 'RTX 4060',
    driverVersion: '566.14',
    coldStart: false,
    firstFrameMs: 963,
    hitch100ms: 0
  });
  for (let i = 0; i < 3; i++) {
    await postTelemetry({
      gameId: 'survivor-arena-g2',
      gameVersion: '1.2.0',
      engineVersion: '4.7.0',
      renderer: 'vulkan',
      gpuVendor: 'NVIDIA',
      gpuName: 'RTX 4060',
      driverVersion: '566.14',
      coldStart: true,
      firstFrameMs: 6651,
      hitch50ms: 9,
      hitch100ms: 4
    });
  }

  // Lower-impact game: 900ms warm vs 1500ms cold (1 session, 0 hitches)
  recordShaderTelemetry(h.db, {
    gameId: 'light-puzzle',
    gameVersion: '1.0.0',
    engineVersion: '4.7.0',
    renderer: 'vulkan',
    gpuVendor: 'AMD',
    gpuName: 'RX 7600',
    driverVersion: '24.10.1',
    coldStart: false,
    firstFrameMs: 900,
    hitch100ms: 0
  }, { now: h.now });
  recordShaderTelemetry(h.db, {
    gameId: 'light-puzzle',
    gameVersion: '1.0.0',
    engineVersion: '4.7.0',
    renderer: 'vulkan',
    gpuVendor: 'AMD',
    gpuName: 'RX 7600',
    driverVersion: '24.10.1',
    coldStart: true,
    firstFrameMs: 1500,
    hitch100ms: 0
  }, { now: h.now });

  // Query admin shader priorities
  const prioRes = await fetch(`${h.adminBase}/api/admin/infra/shader-priorities?days=7&limit=10`, {
    headers: { Cookie: admin.cookie }
  });
  assert.equal(prioRes.status, 200);
  const prioBody = await prioRes.json();
  assert.equal(prioBody.items.length, 2);
  const top = prioBody.items[0];
  assert.equal(top.gameId, 'survivor-arena-g2');
  assert.equal(top.p50WarmFirstFrameMs, 963);
  assert.equal(top.p95ColdMinusWarmMs, 5688);
  assert.equal(top.coldSessions, 3);
  assert.equal(top.avgHitch100ms, 4);
  // (6651 - 963) * 3 * (1 + 4) = 5688 * 3 * 5 = 85320
  assert.equal(top.hitchImpactScore, 85320);
  assert.ok(top.hitchImpactScore > prioBody.items[1].hitchImpactScore);

  // Warm Pool ML forecast with mmo_room_telemetry + social_party_launches leading spike
  recordMmoRoomTelemetry(h.db, {
    roomId: 'room-1',
    gameId: 'forge-tappy-chicken-mmo',
    onlineCount: 10,
    botCount: 4,
    rttP50Ms: 28,
    rttP95Ms: 65,
    eventsReceivedDelta: 420,
    sampledAt: h.now() - 120000
  }, { now: h.now });
  recordMmoRoomTelemetry(h.db, {
    roomId: 'room-1',
    gameId: 'forge-tappy-chicken-mmo',
    onlineCount: 22,
    botCount: 2,
    rttP50Ms: 31,
    rttP95Ms: 74,
    eventsReceivedDelta: 980,
    sampledAt: h.now() - 30000
  }, { now: h.now });

  const forecast = forecastWarmPoolDemand(h.db, {
    gameId: 'forge-tappy-chicken-mmo',
    activePartyLaunches: 5, // leading spike (+20 expected players)
    currentBurnRatePerHour: 24,
    remainingPoints: 60,
    now: h.now
  });
  assert.equal(forecast.prewarmPckRecommended, true);
  assert.ok(forecast.recommendedWarmNodes >= 4);
  assert.ok(forecast.projectedBurnRatePerHour > 24);
  assert.ok(forecast.projectedRunwayHours <= 2);
  assert.equal(forecast.burnAlertTier, 'CRITICAL');

  const healthyForecast = forecastWarmPoolDemand(h.db, {
    gameId: 'forge-tappy-chicken-mmo',
    recentRoomSamples: [{ onlineCount: 8 }],
    activePartyLaunches: 0,
    currentBurnRatePerHour: 6,
    remainingPoints: 1000,
    now: h.now
  });
  assert.equal(healthyForecast.burnAlertTier, 'OK');
  assert.ok(healthyForecast.projectedRunwayHours > 72);
});

// ---------------------------------------------------------------------------
// 5. N8 Isolated Ethical DDA: clamping [0.75, 1.25], opt-out 1.0, & static isolation
// ---------------------------------------------------------------------------
test('N8 Ethical DDA: hard clamping [0.75, 1.25], opt-out/toggle neutral 1.0, HTTP endpoint & ZERO billing/iap/wallet imports', async t => {
  const h = await createTrustHarness(t);

  // Extreme high performance -> clamped at 1.25
  const high = computeEthicalDdaProfile({
    recentWinRate: 1.0,
    consecutiveLosses: 0,
    avgSessionMs: 600000,
    optIn: true,
    playerToggleEnabled: true
  });
  assert.equal(high.active, true);
  assert.ok(high.difficultyMultiplier <= DDA_MAX_MULTIPLIER);
  assert.ok(high.difficultyMultiplier >= 1.2);

  // Extreme losing streak -> clamped at 0.75
  const low = computeEthicalDdaProfile({
    recentWinRate: 0.0,
    consecutiveLosses: 10,
    avgSessionMs: 25000,
    optIn: true,
    playerToggleEnabled: true
  });
  assert.equal(low.active, true);
  assert.equal(low.difficultyMultiplier, DDA_MIN_MULTIPLIER);
  assert.equal(low.assistHintLevel, 2);

  // Opt-out -> exact neutral 1.0
  const optedOut = computeEthicalDdaProfile({
    recentWinRate: 0.1,
    consecutiveLosses: 8,
    optIn: false,
    playerToggleEnabled: true
  });
  assert.equal(optedOut.active, false);
  assert.equal(optedOut.difficultyMultiplier, DDA_NEUTRAL_MULTIPLIER);
  assert.equal(optedOut.enemySpeedMultiplier, DDA_NEUTRAL_MULTIPLIER);
  assert.equal(optedOut.spawnRateMultiplier, DDA_NEUTRAL_MULTIPLIER);

  // Player toggle OFF -> exact neutral 1.0
  const toggleOff = computeEthicalDdaProfile({
    recentWinRate: 0.95,
    consecutiveLosses: 0,
    optIn: true,
    playerToggleEnabled: false
  });
  assert.equal(toggleOff.active, false);
  assert.equal(toggleOff.difficultyMultiplier, DDA_NEUTRAL_MULTIPLIER);

  // HTTP POST /api/dda/profile
  const httpRes = await fetch(`${h.publicBase}/api/dda/profile`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: h.userOrigin
    },
    body: JSON.stringify({
      recentWinRate: 0.15,
      consecutiveLosses: 4,
      avgSessionMs: 45000,
      optIn: true,
      playerToggleEnabled: true
    })
  });
  assert.equal(httpRes.status, 200);
  const httpBody = await httpRes.json();
  assert.equal(httpBody.profile.active, true);
  assert.ok(httpBody.profile.difficultyMultiplier >= DDA_MIN_MULTIPLIER);
  assert.ok(httpBody.profile.difficultyMultiplier < 1.0);

  // Static architectural isolation check: ethical-dda.mjs MUST have ZERO imports referencing billing/iap/wallet/db
  const ddaSource = fs.readFileSync(path.resolve(HUB_ROOT, 'server/trust/ethical-dda.mjs'), 'utf8');
  assert.equal(/\bimport\b/m.test(ddaSource), false, 'ethical-dda.mjs must be completely dependency-free (zero imports)');
  assert.equal(/\b(billing|iap|wallet|avatar)\b/i.test(ddaSource), false, 'ethical-dda.mjs must have zero references to billing/iap/wallet/avatar');
});

// ---------------------------------------------------------------------------
// 6. Schema Compatibility: PRAGMA user_version=1, restore-data & sanitize-snapshot
// ---------------------------------------------------------------------------
test('Schema compatibility: PRAGMA user_version=1 preserved and restore-data + sanitize-snapshot pass with all 5 trust tables populated', async t => {
  const h = await createTrustHarness(t);
  const u = h.createRegisteredUserSession('user-snap-1', '스냅샷 유저', 'ADULT');

  setConsents(h.db, u.userId, { analytics: true, personalization: true }, { now: h.now });
  evaluateRisk(h.db, {
    domain: 'cpa',
    entityType: 'ad_attribution',
    entityId: 'attr-snap-1',
    principalId: u.userId,
    features: { claimedPlayMs: 30000, serverActiveMs: 500, priorDeviceClaim: true },
    now: h.now
  });
  recordShaderTelemetry(h.db, {
    gameId: 'survivor-arena-g2',
    gameVersion: '1.0',
    engineVersion: '4.7',
    renderer: 'vulkan',
    gpuVendor: 'NVIDIA',
    gpuName: 'RTX 4070',
    driverVersion: '566.03',
    coldStart: true,
    firstFrameMs: 4200,
    hitch100ms: 2
  }, { now: h.now });
  recordMmoRoomTelemetry(h.db, {
    roomId: 'room-snap-1',
    gameId: 'forge-tappy-chicken-mmo',
    onlineCount: 5,
    botCount: 1
  }, { now: h.now });

  // PRAGMA user_version must strictly remain 1
  assert.equal(h.db.prepare('PRAGMA user_version').get().user_version, 1);

  const liveDbPath = path.join(h.dataDir, 'platform.sqlite');
  const outPath = path.join(h.tmpDir, 'sanitized-trust.sqlite');

  const report = await sanitizeSnapshot({
    from: liveDbPath,
    out: outPath,
    sourceEnv: 'live',
    targetEnv: 'dev',
    salt: 'trust-sanitize-test-salt',
    now: h.now
  });
  assert.equal(report.ok, true);
  assert.equal(report.integrity, 'ok');
  assert.equal(report.foreignKeys, 'ok');
  assert.ok(report.stats.droppedTables.includes('user_consents'));
  assert.ok(report.stats.droppedTables.includes('risk_assessments'));
  assert.ok(report.stats.droppedTables.includes('risk_review_queue'));

  const inspected = inspectDatabase(outPath);
  assert.equal(inspected.databaseUserVersion, 1);
  assert.equal(inspected.integrity, 'ok');
  assert.equal(inspected.foreignKeys, 'ok');
});
