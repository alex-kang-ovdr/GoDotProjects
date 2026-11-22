/**
 * D1 Personalized Game Catalog Ranker & Contextual Bandit (Pure Node 24 ESM, zero external deps).
 * - Checks user_age_compliance: CHILD_PROTECTED receives strictly non-personalized age-safe default order
 *   (mode: 'non_personalized_child_safe', PIPA / child protection compliance).
 * - Otherwise combines user history (play_sessions + wishlist_items), rolling game engagement
 *   (events: active_play_60s, game_card_click, game_impression), online bandit rewards (rec_serve_log),
 *   and UCB1 exploration bonus with a hard exploration floor (epsilon >= 0.05).
 * - Persists action propensity into rec_serve_log for Doubly-Robust Off-Policy Evaluation (OPE).
 */
import { createHash } from 'node:crypto';
import { uid } from '../security.mjs';
import { transaction } from '../db.mjs';
import { canPlayAgeRating } from '../mobile/age-gate.mjs';
import { ensureGrowthSchema } from '../growth/schema.mjs';

export const MIN_EXPLORATION_EPSILON = 0.05;
const DEFAULT_EPSILON = 0.10;
const UCB_ALPHA = 0.55;
const ENGAGEMENT_WINDOW_MS = 14 * 86400000;
const HISTORY_WINDOW_MS = 30 * 86400000;

function tableExists(db, name) {
  try {
    return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
  } catch {
    return false;
  }
}

function getAgeCompliance(db, principalId) {
  if (!principalId || !tableExists(db, 'user_age_compliance')) return null;
  try {
    return db.prepare(
      'SELECT age_tier, parental_consent_status FROM user_age_compliance WHERE principal_id=?'
    ).get(principalId) || null;
  } catch {
    return null;
  }
}

function deterministicUnitFloat(seed) {
  const hash = createHash('sha256').update(seed).digest();
  return hash.readUInt32BE(0) / 0x100000000;
}

function loadUserHistory(db, { principalId, subjectId, cutoffMs }) {
  const playedMsByGame = new Map();
  const wishlistedGames = new Set();

  if (tableExists(db, 'play_sessions') && (principalId || subjectId)) {
    const rows = principalId
      ? db.prepare(`
          SELECT game_id, SUM(COALESCE(active_ms, 0)) AS total_ms, COUNT(*) AS sessions
          FROM play_sessions
          WHERE (principal_id = ? OR subject_id = ?) AND started_at >= ?
          GROUP BY game_id
        `).all(principalId, subjectId || '', cutoffMs)
      : db.prepare(`
          SELECT game_id, SUM(COALESCE(active_ms, 0)) AS total_ms, COUNT(*) AS sessions
          FROM play_sessions
          WHERE subject_id = ? AND started_at >= ?
          GROUP BY game_id
        `).all(subjectId, cutoffMs);
    for (const r of rows) {
      playedMsByGame.set(r.game_id, {
        activeMs: Number(r.total_ms || 0),
        sessions: Number(r.sessions || 0)
      });
    }
  }

  if (principalId && tableExists(db, 'wishlist_items')) {
    const rows = db.prepare('SELECT game_id FROM wishlist_items WHERE principal_id=?').all(principalId);
    for (const r of rows) wishlistedGames.add(r.game_id);
  }

  return { playedMsByGame, wishlistedGames };
}

function loadRollingEngagement(db, cutoffMs) {
  const stats = new Map();
  const ensure = (gameId) => {
    if (!stats.has(gameId)) {
      stats.set(gameId, { impressions: 0, clicks: 0, active60s: 0, rewardCount: 0, rewardSum: 0 });
    }
    return stats.get(gameId);
  };

  if (tableExists(db, 'events')) {
    const rows = db.prepare(`
      SELECT game_id, name, COUNT(*) AS cnt
      FROM events
      WHERE game_id IS NOT NULL
        AND traffic_type = 'live'
        AND received_at >= ?
        AND name IN ('game_impression', 'game_card_click', 'active_play_60s')
      GROUP BY game_id, name
    `).all(cutoffMs);
    for (const r of rows) {
      const s = ensure(r.game_id);
      if (r.name === 'game_impression') s.impressions += Number(r.cnt || 0);
      else if (r.name === 'game_card_click') s.clicks += Number(r.cnt || 0);
      else if (r.name === 'active_play_60s') s.active60s += Number(r.cnt || 0);
    }
  }

  if (tableExists(db, 'rec_serve_log')) {
    const rows = db.prepare(`
      SELECT game_id, COUNT(reward) AS reward_cnt, COALESCE(SUM(reward), 0) AS reward_sum
      FROM rec_serve_log
      WHERE reward IS NOT NULL AND served_at >= ?
      GROUP BY game_id
    `).all(cutoffMs);
    for (const r of rows) {
      const s = ensure(r.game_id);
      s.rewardCount += Number(r.reward_cnt || 0);
      s.rewardSum += Number(r.reward_sum || 0);
    }
  }

  return stats;
}

function persistServeLog(db, rows) {
  if (!rows.length) return;
  const stmt = db.prepare(`
    INSERT INTO rec_serve_log(
      id, subject_id, principal_id, placement_id, mode,
      experiment_id, variant_id, game_id, slot_index,
      score, propensity, reward, impression_id, served_at, rewarded_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,NULL,NULL,?,NULL)
  `);
  transaction(db, () => {
    for (const r of rows) {
      stmt.run(
        r.id, r.subjectId, r.principalId, r.placementId, r.mode,
        r.experimentId, r.variantId, r.gameId, r.slotIndex,
        r.score, r.propensity, r.servedAt
      );
    }
  });
}

export function rankCatalogGames(db, games, {
  subjectId = 'anon',
  principalId = null,
  placementId = 'home_grid',
  now = Date.now,
  epsilon = DEFAULT_EPSILON,
  experimentId = null,
  variantId = null,
  logServe = true
} = {}) {
  ensureGrowthSchema(db);
  const stamp = now();
  const safeSubject = String(subjectId || 'anon').slice(0, 160);
  const safePlacement = String(placementId || 'home_grid').slice(0, 64);
  const candidateList = Array.isArray(games) ? games : [];

  // 1. Child Protection Hard Gate (PIPA / COPPA non-personalized age-safe default)
  const compliance = getAgeCompliance(db, principalId);
  if (compliance?.age_tier === 'CHILD_PROTECTED') {
    const safeGames = candidateList.filter(g =>
      canPlayAgeRating('CHILD_PROTECTED', g.ageRating || 'ALL', compliance.parental_consent_status)
    );
    const serveRows = [];
    const ranked = safeGames.map((game, idx) => {
      const serveId = uid();
      serveRows.push({
        id: serveId,
        subjectId: safeSubject,
        principalId: principalId || null,
        placementId: safePlacement,
        mode: 'non_personalized_child_safe',
        experimentId: experimentId || null,
        variantId: variantId || null,
        gameId: game.id,
        slotIndex: idx,
        score: 0,
        propensity: 1.0,
        servedAt: stamp
      });
      return {
        ...game,
        placementId: safePlacement,
        slotIndex: idx,
        creativeId: `${safePlacement}:${game.id}:child_safe`,
        propensity: 1.0,
        recServeId: serveId
      };
    });

    if (logServe && serveRows.length > 0) {
      persistServeLog(db, serveRows);
    }

    return {
      games: ranked,
      ranking: {
        mode: 'non_personalized_child_safe',
        personalized: false,
        placementId: safePlacement,
        epsilon: 0,
        explored: false,
        ageTier: 'CHILD_PROTECTED',
        experimentId: experimentId || null,
        variantId: variantId || null,
        serveCount: serveRows.length
      }
    };
  }

  // 2. Personalized Scoring + UCB1 Contextual Bandit with Exploration Floor (epsilon >= 0.05)
  const effectiveEpsilon = Math.max(
    MIN_EXPLORATION_EPSILON,
    Math.min(0.5, Number.isFinite(epsilon) ? epsilon : DEFAULT_EPSILON)
  );

  const { playedMsByGame, wishlistedGames } = loadUserHistory(db, {
    principalId,
    subjectId: safeSubject,
    cutoffMs: stamp - HISTORY_WINDOW_MS
  });
  const engagementByGame = loadRollingEngagement(db, stamp - ENGAGEMENT_WINDOW_MS);

  // Build user tag affinity profile from played & wishlisted games
  const tagWeights = new Map();
  let maxTagWeight = 0;
  for (const g of candidateList) {
    const play = playedMsByGame.get(g.id);
    const wished = wishlistedGames.has(g.id);
    if (!play && !wished) continue;
    const weight = (wished ? 1.5 : 0) + (play ? Math.min(3.0, 0.5 + Math.log1p(play.activeMs / 60000)) : 0);
    const tags = Array.isArray(g.tags) && g.tags.length ? g.tags : (g.genre ? [g.genre] : []);
    for (const tag of tags) {
      const next = (tagWeights.get(tag) || 0) + weight;
      tagWeights.set(tag, next);
      if (next > maxTagWeight) maxTagWeight = next;
    }
  }

  let totalPulls = 0;
  for (const g of candidateList) {
    const e = engagementByGame.get(g.id);
    if (e) totalPulls += e.impressions + e.rewardCount;
  }
  const logTotal = Math.log(Math.max(2, totalPulls + 1));

  const scored = candidateList.map((game, origIdx) => {
    const e = engagementByGame.get(game.id) || { impressions: 0, clicks: 0, active60s: 0, rewardCount: 0, rewardSum: 0 };
    const ctr = (e.clicks + 1) / (e.impressions + 5);
    const active60Rate = (e.active60s + 0.5) / (Math.max(e.clicks, e.impressions * 0.25) + 4);
    const engagementScore = 0.4 * ctr + 0.6 * Math.min(1, active60Rate);
    const banditMean = e.rewardCount > 0
      ? (e.rewardSum + engagementScore * 2) / (e.rewardCount + 2)
      : engagementScore;

    // User affinity (tags + wishlist + play history)
    const tags = Array.isArray(game.tags) && game.tags.length ? game.tags : (game.genre ? [game.genre] : []);
    let tagAffinity = 0;
    if (maxTagWeight > 0 && tags.length > 0) {
      let sum = 0;
      for (const tag of tags) sum += (tagWeights.get(tag) || 0) / maxTagWeight;
      tagAffinity = Math.min(1, sum / tags.length);
    }
    const wishlistBoost = wishlistedGames.has(game.id) ? 0.35 : 0;
    const playHistory = playedMsByGame.get(game.id);
    const playBoost = playHistory ? Math.min(0.25, 0.08 * Math.log1p(playHistory.activeMs / 60000)) : 0;
    const userAffinity = Math.min(1, 0.65 * tagAffinity + wishlistBoost + playBoost);

    // UCB1 exploration bonus
    const pulls = e.impressions + e.rewardCount;
    const ucbBonus = UCB_ALPHA * Math.sqrt(logTotal / (pulls + 1));

    const score = 0.45 * banditMean + 0.35 * userAffinity + ucbBonus;
    return { game, origIdx, score, ucbBonus, pulls, userAffinity, banditMean };
  });

  // Compute softmax + epsilon-floor propensities for Doubly-Robust OPE
  const k = scored.length;
  const maxScore = k > 0 ? Math.max(...scored.map(s => s.score)) : 0;
  const temp = 0.25;
  const expScores = scored.map(s => Math.exp((s.score - maxScore) / temp));
  const expSum = expScores.reduce((a, b) => a + b, 0) || 1;
  for (let i = 0; i < k; i++) {
    const pSoftmax = expScores[i] / expSum;
    scored[i].propensity = (1 - effectiveEpsilon) * pSoftmax + (effectiveEpsilon / k);
  }

  // Primary sort by score descending (tie-break by catalog order)
  scored.sort((a, b) => b.score - a.score || a.origIdx - b.origIdx);

  // Epsilon exploration trigger on slot 0 (deterministic per subject/placement/minute bucket)
  let explored = false;
  if (k > 1) {
    const minuteBucket = Math.floor(stamp / 60000);
    const draw = deterministicUnitFloat(`${safeSubject}:${safePlacement}:${minuteBucket}:explore`);
    if (draw < effectiveEpsilon) {
      // Promote an under-explored candidate (highest UCB bonus outside slot 0)
      let bestExploreIdx = 1;
      for (let i = 2; i < k; i++) {
        if (scored[i].ucbBonus > scored[bestExploreIdx].ucbBonus) bestExploreIdx = i;
      }
      const [promoted] = scored.splice(bestExploreIdx, 1);
      scored.unshift(promoted);
      explored = true;
    }
  }

  const serveRows = [];
  const ranked = scored.map((entry, idx) => {
    const serveId = uid();
    const roundedScore = Number(entry.score.toFixed(6));
    const roundedPropensity = Number(entry.propensity.toFixed(6));
    serveRows.push({
      id: serveId,
      subjectId: safeSubject,
      principalId: principalId || null,
      placementId: safePlacement,
      mode: 'bandit_ucb1',
      experimentId: experimentId || null,
      variantId: variantId || null,
      gameId: entry.game.id,
      slotIndex: idx,
      score: roundedScore,
      propensity: roundedPropensity,
      servedAt: stamp
    });
    return {
      ...entry.game,
      placementId: safePlacement,
      slotIndex: idx,
      creativeId: `${safePlacement}:${entry.game.id}:v1`,
      rankingScore: roundedScore,
      propensity: roundedPropensity,
      recServeId: serveId
    };
  });

  if (logServe && serveRows.length > 0) {
    persistServeLog(db, serveRows);
  }

  return {
    games: ranked,
    ranking: {
      mode: 'bandit_ucb1',
      personalized: true,
      placementId: safePlacement,
      epsilon: effectiveEpsilon,
      explored,
      ageTier: compliance?.age_tier || 'UNKNOWN',
      experimentId: experimentId || null,
      variantId: variantId || null,
      serveCount: serveRows.length
    }
  };
}

/**
 * Online Bandit reward feedback helper: attaches observed reward (e.g. click=+0.2,
 * active10s=+0.5, active60s=+1.0) to the matching rec_serve_log entry.
 */
export function recordBanditReward(db, {
  subjectId,
  gameId,
  impressionId = null,
  serveId = null,
  reward,
  now = Date.now
} = {}) {
  ensureGrowthSchema(db);
  if (!Number.isFinite(reward) || reward < 0) {
    throw new Error('Bandit reward must be a non-negative finite number.');
  }
  const stamp = now();
  let target = null;

  if (serveId) {
    target = db.prepare('SELECT id, reward FROM rec_serve_log WHERE id=?').get(serveId);
  }
  if (!target && impressionId) {
    target = db.prepare('SELECT id, reward FROM rec_serve_log WHERE impression_id=? ORDER BY served_at DESC LIMIT 1').get(impressionId);
  }
  if (!target && subjectId && gameId) {
    target = db.prepare(`
      SELECT id, reward FROM rec_serve_log
      WHERE subject_id = ? AND game_id = ? AND served_at >= ?
      ORDER BY served_at DESC LIMIT 1
    `).get(subjectId, gameId, stamp - 86400000);
  }

  if (!target) {
    return { updated: false, serveId: null, gameId: gameId || null, totalReward: null };
  }

  const nextReward = Number((Number(target.reward || 0) + reward).toFixed(6));
  db.prepare(`
    UPDATE rec_serve_log
    SET reward = ?,
        impression_id = COALESCE(impression_id, ?),
        rewarded_at = ?
    WHERE id = ?
  `).run(nextReward, impressionId || null, stamp, target.id);

  return {
    updated: true,
    serveId: target.id,
    gameId: gameId || null,
    totalReward: nextReward,
    rewardedAt: new Date(stamp).toISOString()
  };
}
