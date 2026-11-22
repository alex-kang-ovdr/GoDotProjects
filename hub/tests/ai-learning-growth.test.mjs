import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scryptSync } from 'node:crypto';
import { createApp } from '../server/app.mjs';
import { openDatabase } from '../server/db.mjs';
import { ensureMobileSchema } from '../server/mobile/schema.mjs';
import { ensureBillingSchema } from '../server/billing/schema.mjs';
import { creditPromo } from '../server/billing/ledger.mjs';
import { ensureAdGameSchema } from '../server/adgame/schema.mjs';
import { ensureShortsSchema } from '../server/shorts/schema.mjs';
import { ensureGrowthSchema } from '../server/growth/schema.mjs';
import { createExperiment, assignVariant, checkSrm, computeCupedLift } from '../server/growth/experiments.mjs';
import { evaluateGrowthOfferGuard, assertGrowthOfferGuard, checkStorePolicyCopy } from '../server/growth/budget-guard.mjs';
import { runGrowthAnalystL0, listGrowthRuns } from '../server/growth/analyst-l0.mjs';
import { rankCatalogGames, recordBanditReward, MIN_EXPLORATION_EPSILON } from '../server/recs/ranker.mjs';
import { validateDemoBundle } from '../../tools/adgame/validate-demo-bundle.mjs';
import { analyzeDistillationPlan, distillDemoBundle } from '../../tools/adgame/distill-demo-bundle.mjs';
import { inspectDatabase } from '../tools/restore-data.mjs';
import { sanitizeSnapshot } from '../tools/sanitize-snapshot.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

async function reqJson(baseUrl, pathname, { method = 'GET', headers = {}, body = null, cookie = '' } = {}) {
  const reqHeaders = { ...headers };
  if (cookie) reqHeaders.Cookie = cookie;
  if (body !== null) reqHeaders['Content-Type'] = 'application/json';
  const res = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: reqHeaders,
    body: body !== null ? JSON.stringify(body) : undefined
  });
  const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text, setCookies };
}

function mergeCookies(prev, setCookies) {
  const map = new Map();
  for (const part of String(prev || '').split(';').map(s => s.trim()).filter(Boolean)) {
    const idx = part.indexOf('=');
    if (idx > 0) map.set(part.slice(0, idx), part.slice(idx + 1));
  }
  for (const sc of setCookies || []) {
    const first = sc.split(';')[0].trim();
    const idx = first.indexOf('=');
    if (idx > 0) {
      const k = first.slice(0, idx);
      const v = first.slice(idx + 1);
      if (v === '') map.delete(k);
      else map.set(k, v);
    }
  }
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

test('N3 validateDemoBundle & distillDemoBundle on real survivor-io, besiege, and league-of-legends bundles', () => {
  const survivorDir = path.join(REPO_ROOT, 'games', 'survivor-io', 'Web');
  const besiegeDir = path.join(REPO_ROOT, 'games', 'besiege', 'Web');
  const lolDir = path.join(REPO_ROOT, 'games', 'league-of-legends', 'Web');

  // 1. survivor-io passes out of the box (<= 2MB raw, <= 1.5MB gzip, 0 external network calls)
  const survivorReport = validateDemoBundle(survivorDir);
  assert.equal(survivorReport.pass, true);
  assert.equal(survivorReport.checks.rawSize.pass, true);
  assert.equal(survivorReport.checks.gzipSize.pass, true);
  assert.equal(survivorReport.checks.noExternalNetwork.pass, true);
  assert.ok(survivorReport.totalRawBytes < 2 * 1024 * 1024);

  // 2. besiege fails raw > 2MB with exact culprit breakdown, and distillation shrinks it to PASS (< 2MB) + PlayHubDemo hook
  const besiegeReport = validateDemoBundle(besiegeDir);
  assert.equal(besiegeReport.pass, false);
  assert.equal(besiegeReport.checks.rawSize.pass, false);
  assert.ok(besiegeReport.totalRawBytes > 4 * 1024 * 1024);
  const besiegeCulprits = besiegeReport.topCulprits.map(c => c.path);
  assert.ok(besiegeCulprits.includes('vendor/three.core.js'));
  assert.ok(besiegeCulprits.includes('vendor/playhub-dictionary.js'));

  const besiegePlan = analyzeDistillationPlan(besiegeDir);
  assert.ok(besiegePlan.estimatedSavedBytes > 3 * 1024 * 1024);
  assert.ok(besiegePlan.actions.some(a => a.type === 'prune_dictionary'));
  assert.ok(besiegePlan.actions.some(a => a.type === 'prune_unreferenced_vendor_js' && a.file === 'vendor/three.core.js'));

  const tmpOut = makeTempDir('playhub-n3-distill-');
  try {
    const besiegeOut = path.join(tmpOut, 'besiege-demo');
    const besiegeDistilled = distillDemoBundle(besiegeDir, besiegeOut, { dryRun: false });
    assert.equal(besiegeDistilled.dryRun, false);
    assert.ok(besiegeDistilled.actualSavedBytes > 3 * 1024 * 1024);
    assert.equal(besiegeDistilled.validationAfter.pass, true);
    assert.equal(besiegeDistilled.validationAfter.checks.demoSdkHook.present, true);
    assert.equal(besiegeDistilled.validationAfter.checks.demoSdkHook.hasPostMessageBridge, true);
    assert.ok(besiegeDistilled.afterRawBytes < 1.5 * 1024 * 1024);

    // 3. league-of-legends fails raw > 2MB and gzip > 1.5MB, detects nexus-front-offline.html, and distills under 2MB
    const lolReport = validateDemoBundle(lolDir);
    assert.equal(lolReport.pass, false);
    assert.equal(lolReport.checks.rawSize.pass, false);
    assert.equal(lolReport.checks.gzipSize.pass, false);
    assert.ok(lolReport.topCulprits.some(c => c.path === 'nexus-front-offline.html'));

    const lolPlan = analyzeDistillationPlan(lolDir);
    assert.ok(lolPlan.actions.some(a => a.type === 'remove_duplicate_offline_html' && a.file === 'nexus-front-offline.html'));
    assert.ok(lolPlan.actions.some(a => a.type === 'prune_dictionary'));

    const lolOut = path.join(tmpOut, 'lol-demo');
    const lolDistilled = distillDemoBundle(lolDir, lolOut, { dryRun: false });
    assert.ok(lolDistilled.actualSavedBytes > 4 * 1024 * 1024);
    assert.equal(lolDistilled.validationAfter.pass, true);
    assert.equal(lolDistilled.validationAfter.checks.demoSdkHook.present, true);

    // 4. Forbidden external http(s):// script & fetch detection
    const badDir = path.join(tmpOut, 'bad-external');
    fs.mkdirSync(badDir, { recursive: true });
    fs.writeFileSync(
      path.join(badDir, 'index.html'),
      '<!doctype html><html><head><script src="https://cdn.example.com/lib.js"></script></head><body><script>fetch("https://api.example.com/ping");</script></body></html>'
    );
    const badReport = validateDemoBundle(badDir);
    assert.equal(badReport.pass, false);
    assert.equal(badReport.checks.noExternalNetwork.pass, false);
    assert.equal(badReport.checks.noExternalNetwork.count, 2);
  } finally {
    fs.rmSync(tmpOut, { recursive: true, force: true });
  }
});

test('Growth experiments: deterministic SHA-256 bucketing, Chi-Square SRM detector, and CUPED variance reduction', () => {
  const dir = makeTempDir('playhub-growth-exp-');
  const db = openDatabase(dir);
  try {
    ensureGrowthSchema(db);
    const exp = createExperiment(db, {
      id: 'exp_home_bandit_v1',
      name: 'Home Bandit Ranking v1',
      placementId: 'home_grid',
      variants: [
        { id: 'control', label: 'Default Order' },
        { id: 'treatment', label: 'UCB1 Bandit' }
      ],
      weights: [50, 50],
      status: 'running'
    });
    assert.equal(exp.id, 'exp_home_bandit_v1');

    // Determinism & stickiness
    const a1 = assignVariant(db, { experimentId: exp.id, subjectId: 'subj_alpha', contextHash: 'ctx1' });
    const a2 = assignVariant(db, { experimentId: exp.id, subjectId: 'subj_alpha', contextHash: 'ctx2' });
    assert.equal(a1.variantId, a2.variantId);
    assert.equal(a1.bucket, a2.bucket);
    assert.equal(a1.sticky, false);
    assert.equal(a2.sticky, true);

    // Balanced distribution across 300 subjects should NOT trigger SRM
    const counts = { control: 0, treatment: 0 };
    for (let i = 0; i < 300; i++) {
      const assigned = assignVariant(db, { experimentId: exp.id, subjectId: `user_${i}` });
      counts[assigned.variantId]++;
    }
    const liveSrm = checkSrm(counts, { control: 50, treatment: 50 });
    assert.equal(liveSrm.srmDetected, false);
    assert.ok(liveSrm.pValue > 0.001);

    // Skewed counts MUST trigger SRM (p < 0.001)
    const badSrm = checkSrm([650, 350], [50, 50]);
    assert.equal(badSrm.srmDetected, true);
    assert.ok(badSrm.pValue < 0.001);
    assert.ok(badSrm.chiSquare > 80);

    // CUPED variance reduction with strongly correlated pre/post covariates
    const controlPairs = [];
    const treatmentPairs = [];
    for (let i = 0; i < 60; i++) {
      const pre = 10 + (i % 15) * 8; // high baseline spread (10..122)
      const noise = ((i * 7) % 5) - 2; // small residual noise (-2..2)
      controlPairs.push([pre, pre + noise]);
      treatmentPairs.push([pre, pre + 5.0 + noise]); // +5.0 true treatment lift
    }
    const cupedRes = computeCupedLift(controlPairs, treatmentPairs);
    assert.ok(cupedRes.correlation > 0.95);
    assert.ok(cupedRes.varianceReductionPct > 90, `Expected >90% variance reduction, got ${cupedRes.varianceReductionPct}%`);
    assert.ok(Math.abs(cupedRes.cuped.lift - 5.0) < 0.5);
    assert.ok(Math.abs(cupedRes.cuped.zScore) > Math.abs(cupedRes.raw.zScore) * 3);
    assert.equal(cupedRes.cuped.significant, true);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Growth budget-guard enforces ADULT-only age tier, <=2500 bps cap, 0% mobile IAP bonus, daily promo cap, and mobile store-policy copy filter', () => {
  const dir = makeTempDir('playhub-growth-guard-');
  const db = openDatabase(dir);
  const nowMs = Date.UTC(2026, 10, 22, 6, 0, 0);
  try {
    ensureMobileSchema(db);
    ensureBillingSchema(db);

    db.prepare('INSERT INTO users(id, kind, display_name, created_at) VALUES(?,?,?,?)').run('u_child', 'registered', 'Child', nowMs);
    db.prepare('INSERT INTO users(id, kind, display_name, created_at) VALUES(?,?,?,?)').run('u_teen', 'registered', 'Teen', nowMs);
    db.prepare('INSERT INTO users(id, kind, display_name, created_at) VALUES(?,?,?,?)').run('u_adult', 'registered', 'Adult', nowMs);

    db.prepare('INSERT INTO user_age_compliance(principal_id, region_code, age_tier, parental_consent_status, updated_at) VALUES(?,?,?,?,?)')
      .run('u_child', 'KR', 'CHILD_PROTECTED', 'verified', nowMs);
    db.prepare('INSERT INTO user_age_compliance(principal_id, region_code, age_tier, parental_consent_status, updated_at) VALUES(?,?,?,?,?)')
      .run('u_teen', 'KR', 'TEEN_MINOR', 'not_required', nowMs);
    db.prepare('INSERT INTO user_age_compliance(principal_id, region_code, age_tier, parental_consent_status, updated_at) VALUES(?,?,?,?,?)')
      .run('u_adult', 'KR', 'ADULT', 'not_required', nowMs);

    // 1. CHILD_PROTECTED / TEEN_MINOR / unknown principal hard blocked
    const childRes = evaluateGrowthOfferGuard(db, { principalId: 'u_child', channel: 'web_browser', bonusBps: 1000 }, { now: () => nowMs });
    assert.equal(childRes.allowed, false);
    assert.equal(childRes.violations[0].code, 'GROWTH_AGE_POLICY_BLOCKED');

    const teenRes = evaluateGrowthOfferGuard(db, { principalId: 'u_teen', channel: 'web_browser', bonusBps: 1000 }, { now: () => nowMs });
    assert.equal(teenRes.allowed, false);
    assert.equal(teenRes.violations[0].code, 'GROWTH_AGE_POLICY_BLOCKED');

    const missingRes = evaluateGrowthOfferGuard(db, { principalId: 'u_unknown', channel: 'web_browser', bonusBps: 0 }, { now: () => nowMs });
    assert.equal(missingRes.allowed, false);
    assert.equal(missingRes.violations[0].code, 'GROWTH_AGE_POLICY_BLOCKED');

    // 2. ADULT on web_browser up to 2500 bps allowed; 2501 blocked
    const adultOk = assertGrowthOfferGuard(db, {
      principalId: 'u_adult',
      channel: 'web_browser',
      bonusBps: 2500,
      promoCoins: 200,
      copyText: '웹에서 충전 시 +25% 보너스!'
    }, { now: () => nowMs });
    assert.equal(adultOk.allowed, true);

    assert.throws(
      () => assertGrowthOfferGuard(db, { principalId: 'u_adult', channel: 'web_browser', bonusBps: 2501 }, { now: () => nowMs }),
      err => err.code === 'GROWTH_BONUS_CAP_EXCEEDED'
    );

    // 3. Mobile IAP channels MUST be 0% bonus
    for (const ch of ['aos_google_play', 'ios_app_store']) {
      const blocked = evaluateGrowthOfferGuard(db, { principalId: 'u_adult', channel: ch, bonusBps: 500 }, { now: () => nowMs });
      assert.equal(blocked.allowed, false);
      assert.ok(blocked.violations.some(v => v.code === 'GROWTH_MOBILE_IAP_BONUS_FORBIDDEN'));

      const zeroOk = evaluateGrowthOfferGuard(db, { principalId: 'u_adult', channel: ch, bonusBps: 0, copyText: '새 시즌 오픈!' }, { now: () => nowMs });
      assert.equal(zeroOk.allowed, true);
    }

    // 4. Mobile store-policy copy filter blocks external web steering phrases
    const krSteer = checkStorePolicyCopy('지금 웹에서 충전하면 +25% 보너스 지급!', { channel: 'mobile_push' });
    assert.equal(krSteer.allowed, false);
    assert.ok(krSteer.violations.length >= 1);

    const enSteer = checkStorePolicyCopy('Buy on the web for cheaper PlayCoin bundles!', { channel: 'ios_app_store' });
    assert.equal(enSteer.allowed, false);

    const safeMobile = checkStorePolicyCopy('신규 보스 레이드가 열렸습니다! 지금 도전하세요.', { channel: 'mobile_inapp' });
    assert.equal(safeMobile.allowed, true);

    // 5. Daily promo coin cap against sys:contra:promo_grant in billing_journal_lines
    creditPromo(db, {
      principalId: 'u_adult',
      coins: 45000,
      reason: 'growth_campaign_test',
      idempotencyKey: 'promo:cap:test:1',
      now: () => nowMs
    });
    const overCap = evaluateGrowthOfferGuard(db, {
      principalId: 'u_adult',
      channel: 'web_browser',
      promoCoins: 6000,
      dailyPromoCapCoins: 50000
    }, { now: () => nowMs });
    assert.equal(overCap.allowed, false);
    assert.ok(overCap.violations.some(v => v.code === 'GROWTH_DAILY_PROMO_CAP_EXCEEDED'));
    assert.equal(overCap.details.dailyPromoSpent, 45000);
    assert.equal(overCap.details.remainingPromoCoins, 5000);

    const underCap = evaluateGrowthOfferGuard(db, {
      principalId: 'u_adult',
      channel: 'web_browser',
      promoCoins: 5000,
      dailyPromoCapCoins: 50000
    }, { now: () => nowMs });
    assert.equal(underCap.allowed, true);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('L0 Growth Analyst detects load P90, low active60s, AdGame CTA drop, and zero-shorts hidden gems and persists runs', () => {
  const dir = makeTempDir('playhub-growth-l0-');
  const db = openDatabase(dir);
  const nowMs = Date.UTC(2026, 10, 22, 6, 0, 0);
  try {
    ensureGrowthSchema(db);
    ensureAdGameSchema(db);
    ensureShortsSchema(db);

    // Seed ad_funnel_events: 10 demo_complete, only 1 cta_click (10% < 30% threshold)
    for (let i = 0; i < 10; i++) {
      db.prepare('INSERT INTO ad_funnel_events(id, session_id, campaign_id, partner_id, event_type, meta_json, created_at) VALUES(?,?,?,?,?,?,?)')
        .run(`ev_dc_${i}`, `s_${i}`, 'camp_besiege', 'karrot', 'demo_complete', '{}', nowMs - 1000);
    }
    db.prepare('INSERT INTO ad_funnel_events(id, session_id, campaign_id, partner_id, event_type, meta_json, created_at) VALUES(?,?,?,?,?,?,?)')
      .run('ev_cta_1', 's_0', 'camp_besiege', 'karrot', 'cta_click', '{}', nowMs - 500);

    const mockMetrics = {
      summary: { playSessions: 120, loadP90Seconds: 5.4, impressions: 500, clicks: 20, ctr: 0.04 },
      funnel: { started: 120, ready: 100, active10s: 80, active60s: 30, active60sRate: 0.25 },
      games: [
        {
          id: 'besiege',
          title: 'Besiege',
          plays: 60,
          loadP90Seconds: 5.4,
          averageActiveSeconds: 25,
          d1NewRate: 0.12,
          funnel: { started: 60, ready: 45, active10s: 30, active60s: 12, active60sRate: 0.20 }
        },
        {
          id: 'survivor-io',
          title: 'Survivor Arena',
          plays: 40,
          loadP90Seconds: 1.4,
          averageActiveSeconds: 110,
          d1NewRate: 0.38,
          funnel: { started: 40, ready: 39, active10s: 36, active60s: 26, active60sRate: 0.65 }
        }
      ]
    };

    const run = runGrowthAnalystL0(db, { metrics: mockMetrics, triggerSource: 'unit_test', createdBy: 'tester', now: () => nowMs });
    assert.equal(run.level, 'L0');
    assert.equal(run.status, 'completed');
    const bottlenecks = new Set(run.hypotheses.map(h => h.bottleneck));
    assert.ok(bottlenecks.has('high_load_p90'));
    assert.ok(bottlenecks.has('low_play_to_active60s'));
    assert.ok(bottlenecks.has('adgame_demo_to_cta_drop'));
    assert.ok(bottlenecks.has('zero_shorts_hidden_gem'));
    // Verify ICE descending sort
    for (let i = 1; i < run.hypotheses.length; i++) {
      assert.ok(run.hypotheses[i - 1].iceScore >= run.hypotheses[i].iceScore);
    }

    const persisted = listGrowthRuns(db, { level: 'L0' });
    assert.equal(persisted.length, 1);
    assert.equal(persisted[0].id, run.id);
    assert.equal(persisted[0].hypotheses.length, run.hypotheses.length);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('D1 Contextual Bandit ranker: child-safe non-personalized fallback, personalized UCB1 ranking, propensity logging, and online reward update', () => {
  const dir = makeTempDir('playhub-recs-d1-');
  const db = openDatabase(dir);
  const nowMs = Date.UTC(2026, 10, 22, 6, 0, 0);
  try {
    ensureMobileSchema(db);
    ensureGrowthSchema(db);

    db.prepare('INSERT INTO users(id, kind, display_name, created_at) VALUES(?,?,?,?)').run('u_child', 'registered', 'Kid', nowMs);
    db.prepare('INSERT INTO users(id, kind, display_name, created_at) VALUES(?,?,?,?)').run('u_adult', 'registered', 'Adult', nowMs);
    db.prepare('INSERT INTO user_age_compliance(principal_id, region_code, age_tier, parental_consent_status, updated_at) VALUES(?,?,?,?,?)')
      .run('u_child', 'KR', 'CHILD_PROTECTED', 'not_required', nowMs);
    db.prepare('INSERT INTO user_age_compliance(principal_id, region_code, age_tier, parental_consent_status, updated_at) VALUES(?,?,?,?,?)')
      .run('u_adult', 'KR', 'ADULT', 'not_required', nowMs);

    const catalog = [
      { id: 'game-puzzle', title: 'Puzzle', genre: 'puzzle', tags: ['puzzle'], ageRating: 'ALL' },
      { id: 'game-action', title: 'Action', genre: 'action', tags: ['action'], ageRating: 'ALL' },
      { id: 'game-mature', title: 'Mature', genre: 'action', tags: ['action'], ageRating: '18+' },
      { id: 'game-strategy', title: 'Strategy', genre: 'strategy', tags: ['strategy'], ageRating: 'ALL' }
    ];

    // Seed heavy child history toward game-strategy; child ranker MUST IGNORE it and stay non-personalized + age-safe!
    db.prepare('INSERT INTO wishlist_items(principal_id, game_id, added_at) VALUES(?,?,?)').run('u_child', 'game-strategy', nowMs - 1000);
    const childRanked = rankCatalogGames(db, catalog, {
      subjectId: 'subj_child',
      principalId: 'u_child',
      placementId: 'home_grid',
      now: () => nowMs
    });
    assert.equal(childRanked.ranking.mode, 'non_personalized_child_safe');
    assert.equal(childRanked.ranking.personalized, false);
    assert.deepEqual(childRanked.games.map(g => g.id), ['game-puzzle', 'game-action', 'game-strategy']);
    assert.equal(childRanked.games[0].slotIndex, 0);
    assert.equal(childRanked.games[0].propensity, 1.0);

    // Seed adult affinity for 'strategy' + strong engagement on game-strategy, plus weak engagement on others
    db.prepare('INSERT INTO wishlist_items(principal_id, game_id, added_at) VALUES(?,?,?)').run('u_adult', 'game-strategy', nowMs - 1000);
    db.prepare('INSERT INTO play_sessions(id, session_hash, principal_id, subject_id, game_id, build_id, started_at, active_ms, expires_at, traffic_type) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run('ps_1', 'h1', 'u_adult', 'subj_adult', 'game-strategy', 'b1', nowMs - 50000, 300000, nowMs + 3600000, 'live');

    for (let i = 0; i < 20; i++) {
      db.prepare("INSERT INTO events(id, fingerprint, name, subject_id, visit_id, game_id, occurred_at, received_at, properties, source, traffic_type) VALUES(?,?,?,?,?,?,?,?,?,'portal','live')")
        .run(`imp_p_${i}`, `fp_p_${i}`, 'game_impression', `v_${i}`, 'vis', 'game-puzzle', nowMs - 2000, nowMs - 2000, '{}');
      db.prepare("INSERT INTO events(id, fingerprint, name, subject_id, visit_id, game_id, occurred_at, received_at, properties, source, traffic_type) VALUES(?,?,?,?,?,?,?,?,?,'portal','live')")
        .run(`imp_a_${i}`, `fp_a_${i}`, 'game_impression', `v_${i}`, 'vis', 'game-action', nowMs - 2000, nowMs - 2000, '{}');
      db.prepare("INSERT INTO events(id, fingerprint, name, subject_id, visit_id, game_id, occurred_at, received_at, properties, source, traffic_type) VALUES(?,?,?,?,?,?,?,?,?,'portal','live')")
        .run(`imp_m_${i}`, `fp_m_${i}`, 'game_impression', `v_${i}`, 'vis', 'game-mature', nowMs - 2000, nowMs - 2000, '{}');
    }
    for (let i = 0; i < 12; i++) {
      db.prepare("INSERT INTO events(id, fingerprint, name, subject_id, visit_id, game_id, occurred_at, received_at, properties, source, traffic_type) VALUES(?,?,?,?,?,?,?,?,?,'sdk','live')")
        .run(`act_s_${i}`, `fp_s_${i}`, 'active_play_60s', `v_${i}`, 'vis', 'game-strategy', nowMs - 1500, nowMs - 1500, '{}');
    }

    // Even if caller passes epsilon = 0.001, ranker MUST enforce exploration floor >= 0.05
    const adultRanked = rankCatalogGames(db, catalog, {
      subjectId: 'subj_adult',
      principalId: 'u_adult',
      placementId: 'home_grid',
      epsilon: 0.001,
      now: () => nowMs
    });
    assert.equal(adultRanked.ranking.mode, 'bandit_ucb1');
    assert.equal(adultRanked.ranking.personalized, true);
    assert.ok(adultRanked.ranking.epsilon >= MIN_EXPLORATION_EPSILON);
    assert.equal(adultRanked.games[0].id, 'game-strategy');
    for (const g of adultRanked.games) {
      assert.ok(g.propensity >= MIN_EXPLORATION_EPSILON / catalog.length - 1e-6);
      assert.equal(g.placementId, 'home_grid');
      assert.ok(g.creativeId.startsWith('home_grid:'));
    }

    // Online reward update persists to rec_serve_log
    const rewardRes = recordBanditReward(db, {
      subjectId: 'subj_adult',
      gameId: 'game-strategy',
      impressionId: 'imp_xyz_1',
      reward: 1.0,
      now: () => nowMs + 5000
    });
    assert.equal(rewardRes.updated, true);
    assert.equal(rewardRes.totalReward, 1.0);
    const logged = db.prepare('SELECT reward, propensity, impression_id FROM rec_serve_log WHERE id=?').get(rewardRes.serveId);
    assert.equal(logged.reward, 1.0);
    assert.equal(logged.impression_id, 'imp_xyz_1');
    assert.ok(logged.propensity > 0);
  } finally {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('HTTP E2E: POST /api/events preserves placement_id/slot_index/creative_id, GET /api/games?placement=home_grid ranks, Growth APIs & backup/sanitize gates pass', async () => {
  const workDir = makeTempDir('playhub-growth-http-');
  const outDir = makeTempDir('playhub-growth-sanitize-');
  const dataDir = path.join(workDir, 'data');
  fs.mkdirSync(path.join(workDir, 'catalog'), { recursive: true });
  fs.mkdirSync(path.join(workDir, 'games'), { recursive: true });
  const fixtureGames = [
    { id: 'alpha-arena', title: 'Alpha Arena', tags: ['action'] },
    { id: 'beta-puzzle', title: 'Beta Puzzle', tags: ['puzzle'] },
    { id: 'gamma-siege', title: 'Gamma Siege', tags: ['strategy'] }
  ];
  fs.writeFileSync(
    path.join(workDir, 'catalog', 'games.json'),
    JSON.stringify({ schemaVersion: 1, entries: fixtureGames.map(g => ({ id: g.id, path: `games/${g.id}`, enabled: true })) })
  );
  for (const g of fixtureGames) {
    fs.mkdirSync(path.join(workDir, 'games', g.id), { recursive: true });
    fs.writeFileSync(
      path.join(workDir, 'games', g.id, 'game.manifest.json'),
      JSON.stringify({
        schemaVersion: 1,
        id: g.id,
        entry: 'index.html',
        version: '0.1.0',
        title: { ko: g.title },
        summary: { ko: g.title },
        instructions: { ko: 'play' },
        tags: g.tags,
        controls: ['keyboard'],
        save: { schemaVersion: 1 },
        media: { cover: 'assets/cover.svg' }
      })
    );
  }

  const adminSalt = '0123456789abcdef0123456789abcdef';
  const adminPass = 'TestAdmin!2026';
  const adminHash = scryptSync(adminPass, adminSalt, 64).toString('hex');

  const app = createApp(
    {
      dataDir,
      publicHost: '127.0.0.1',
      publicPort: 0,
      adminHost: '127.0.0.1',
      adminPort: 0,
      userBaseUrl: 'http://127.0.0.1:18190',
      userOrigins: ['http://127.0.0.1:18190'],
      adminOrigins: ['http://127.0.0.1:18191'],
      admin: { username: 'admin', salt: adminSalt, passwordHash: adminHash }
    },
    { rootDir: workDir }
  );

  const addresses = await app.listen();
  const pubUrl = `http://127.0.0.1:${addresses.public.port}`;
  const adminUrl = `http://127.0.0.1:${addresses.admin.port}`;

  try {
    // 1. PRAGMA user_version must stay 1
    assert.equal(app.db.prepare('PRAGMA user_version').get().user_version, 1);

    // 2. Public session + default GET /api/games (no placement param -> unchanged shape)
    const sessRes = await reqJson(pubUrl, '/api/session');
    assert.equal(sessRes.status, 200);
    const pubCookie = mergeCookies('', sessRes.setCookies);
    const pubCsrf = sessRes.json.csrfToken;

    const defaultGames = await reqJson(pubUrl, '/api/games', { cookie: pubCookie });
    assert.equal(defaultGames.status, 200);
    assert.ok(Array.isArray(defaultGames.json.games) && defaultGames.json.games.length > 0);
    assert.equal(defaultGames.json.ranking, undefined);

    // 3. Ranked GET /api/games?placement=home_grid
    const rankedGames = await reqJson(pubUrl, '/api/games?placement=home_grid', { cookie: pubCookie });
    assert.equal(rankedGames.status, 200);
    assert.equal(rankedGames.json.ranking.mode, 'bandit_ucb1');
    assert.equal(rankedGames.json.ranking.placementId, 'home_grid');
    assert.ok(rankedGames.json.ranking.epsilon >= 0.05);
    assert.equal(rankedGames.json.games[0].slotIndex, 0);
    assert.equal(rankedGames.json.games[0].placementId, 'home_grid');
    assert.ok(typeof rankedGames.json.games[0].creativeId === 'string');
    assert.ok(rankedGames.json.games[0].propensity > 0);

    // Verify rec_serve_log rows written
    const serveCount = app.db.prepare('SELECT COUNT(*) AS n FROM rec_serve_log').get().n;
    assert.equal(serveCount, rankedGames.json.games.length);

    // 4. POST /api/events preserves top-level placement_id, creative_id, slot_index inside properties
    const sampleGameId = rankedGames.json.games[0].id;
    const impId = 'imp_slot_test_1';
    const evRes = await reqJson(pubUrl, '/api/events', {
      method: 'POST',
      cookie: pubCookie,
      headers: { Origin: 'http://127.0.0.1:18190', 'X-CSRF-Token': pubCsrf },
      body: {
        events: [
          {
            event_id: 'ev_imp_slot_1',
            event_name: 'game_impression',
            game_id: sampleGameId,
            impression_id: impId,
            placement_id: 'home_grid',
            creative_id: `home_grid:${sampleGameId}:v1`,
            slot_index: 2,
            properties: { visible_fraction: 0.9, visible_duration_ms: 1200, document_visible: true }
          },
          {
            event_id: 'ev_clk_slot_1',
            event_name: 'game_card_click',
            game_id: sampleGameId,
            impression_id: impId,
            placement_id: 'home_grid',
            creative_id: `home_grid:${sampleGameId}:v1`,
            slot_index: 2,
            properties: { viewability_met: true }
          }
        ]
      }
    });
    assert.equal(evRes.status, 202);
    assert.deepEqual(evRes.json.accepted, ['ev_imp_slot_1', 'ev_clk_slot_1']);

    const storedImp = JSON.parse(app.db.prepare('SELECT properties FROM events WHERE id=?').get('ev_imp_slot_1').properties);
    assert.equal(storedImp._placement_id, 'home_grid');
    assert.equal(storedImp._creative_id, `home_grid:${sampleGameId}:v1`);
    assert.equal(storedImp._slot_index, 2);

    const storedClk = JSON.parse(app.db.prepare('SELECT properties FROM events WHERE id=?').get('ev_clk_slot_1').properties);
    assert.equal(storedClk._placement_id, 'home_grid');
    assert.equal(storedClk._slot_index, 2);

    // 5. Admin login + Growth Admin routes + Public experiment assignment
    const admSess = await reqJson(adminUrl, '/api/admin/session');
    let admCookie = mergeCookies('', admSess.setCookies);
    const admLogin = await reqJson(adminUrl, '/api/admin/login', {
      method: 'POST',
      cookie: admCookie,
      headers: { Origin: 'http://127.0.0.1:18191', 'X-CSRF-Token': admSess.json.csrfToken },
      body: { username: 'admin', password: adminPass }
    });
    assert.equal(admLogin.status, 200);
    admCookie = mergeCookies(admCookie, admLogin.setCookies);
    const admCsrf = admLogin.json.csrfToken;

    const createExpRes = await reqJson(adminUrl, '/api/admin/growth/experiments', {
      method: 'POST',
      cookie: admCookie,
      headers: { Origin: 'http://127.0.0.1:18191', 'X-CSRF-Token': admCsrf },
      body: {
        id: 'exp_hero_cta',
        name: 'Hero CTA Copy Test',
        placementId: 'home_grid',
        variants: [{ id: 'control' }, { id: 'fast_play' }],
        weights: [50, 50]
      }
    });
    assert.equal(createExpRes.status, 201);
    assert.equal(createExpRes.json.experiment.id, 'exp_hero_cta');

    // Public read-only assignment route
    const assignRes = await reqJson(pubUrl, '/api/experiments/assign?experimentId=exp_hero_cta', { cookie: pubCookie });
    assert.equal(assignRes.status, 200);
    assert.equal(assignRes.json.experimentId, 'exp_hero_cta');
    assert.ok(['control', 'fast_play'].includes(assignRes.json.variantId));

    const listExpRes = await reqJson(adminUrl, '/api/admin/growth/experiments', { cookie: admCookie });
    assert.equal(listExpRes.status, 200);
    assert.equal(listExpRes.json.experiments.length, 1);
    assert.equal(listExpRes.json.experiments[0].totalAssignments, 1);

    // L0 Analyst run via Admin API
    const l0Res = await reqJson(adminUrl, '/api/admin/growth/analyze-l0', {
      method: 'POST',
      cookie: admCookie,
      headers: { Origin: 'http://127.0.0.1:18191', 'X-CSRF-Token': admCsrf },
      body: { triggerSource: 'e2e_test' }
    });
    assert.equal(l0Res.status, 201);
    assert.equal(l0Res.json.run.level, 'L0');

    const runsRes = await reqJson(adminUrl, '/api/admin/growth/runs', { cookie: admCookie });
    assert.equal(runsRes.status, 200);
    assert.equal(runsRes.json.runs.length, 1);
    assert.equal(runsRes.json.runs[0].id, l0Res.json.run.id);
  } finally {
    await app.close();
  }

  // 6. Verify restore-data.mjs inspectDatabase AND sanitize-snapshot.mjs pass with all 4 new tables populated!
  try {
    const dbPath = path.join(dataDir, 'platform.sqlite');
    const inspected = inspectDatabase(dbPath);
    assert.equal(inspected.integrity, 'ok');
    assert.equal(inspected.databaseUserVersion, 1);

    const sanitizedPath = path.join(outDir, 'sanitized-growth.sqlite');
    const sanReport = await sanitizeSnapshot({
      from: dbPath,
      out: sanitizedPath,
      sourceEnv: 'live',
      targetEnv: 'dev',
      salt: 'growth-test-salt'
    });
    assert.equal(sanReport.ok, true);
    assert.ok(sanReport.stats.droppedTables.includes('growth_experiment_assignments'));
    assert.ok(sanReport.stats.droppedTables.includes('rec_serve_log'));
    assert.ok(sanReport.stats.droppedTables.includes('growth_agent_runs'));
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});
