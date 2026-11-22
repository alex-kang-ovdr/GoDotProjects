/**
 * Deterministic L0 Growth Analyst (Pure Node 24 ESM, zero external deps).
 * Scans real liveMetrics(), ad_funnel_events, and shorts_videos to detect funnel
 * bottlenecks and hidden gems, scores hypotheses by ICE, and persists runs to growth_agent_runs.
 */
import { uid } from '../security.mjs';
import { ensureGrowthSchema } from './schema.mjs';

function tableExists(db, name) {
  try {
    return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
  } catch {
    return false;
  }
}

function iceScore(impact, confidence, ease) {
  return Number(((impact * confidence * ease) / 10).toFixed(1));
}

function readAdFunnelStats(db, providedFunnel) {
  if (providedFunnel && typeof providedFunnel === 'object') {
    const counts = providedFunnel.counts || {};
    return {
      source: 'provided',
      demoComplete: Number(counts.demo_complete || 0),
      ctaClick: Number(counts.cta_click || 0),
      handoffClaimed: Number(counts.handoff_claimed || 0),
      qualifiedPlay: Number(counts.qualified_play || 0),
      byCampaign: Array.isArray(providedFunnel.byCampaign) ? providedFunnel.byCampaign : []
    };
  }
  if (!tableExists(db, 'ad_funnel_events')) {
    return { source: 'unavailable', demoComplete: 0, ctaClick: 0, handoffClaimed: 0, qualifiedPlay: 0, byCampaign: [] };
  }

  const rows = db.prepare(
    'SELECT event_type, COUNT(*) AS cnt FROM ad_funnel_events GROUP BY event_type'
  ).all();
  const counts = Object.fromEntries(rows.map(r => [r.event_type, Number(r.cnt || 0)]));

  const byCampaignRows = db.prepare(`
    SELECT campaign_id AS campaignId,
      SUM(CASE WHEN event_type='demo_complete' THEN 1 ELSE 0 END) AS demoComplete,
      SUM(CASE WHEN event_type='cta_click' THEN 1 ELSE 0 END) AS ctaClick
    FROM ad_funnel_events
    GROUP BY campaign_id
  `).all();

  return {
    source: 'db',
    demoComplete: counts.demo_complete || 0,
    ctaClick: counts.cta_click || 0,
    handoffClaimed: counts.handoff_claimed || 0,
    qualifiedPlay: counts.qualified_play || 0,
    byCampaign: byCampaignRows.map(r => ({
      campaignId: r.campaignId,
      demoComplete: Number(r.demoComplete || 0),
      ctaClick: Number(r.ctaClick || 0)
    }))
  };
}

function readShortsCountByGame(db) {
  const map = new Map();
  if (!tableExists(db, 'shorts_videos')) return map;
  const rows = db.prepare(`
    SELECT game_id, COUNT(*) AS cnt
    FROM shorts_videos
    WHERE game_id IS NOT NULL
      AND status = 'ready'
      AND visibility = 'public'
    GROUP BY game_id
  `).all();
  for (const r of rows) map.set(r.game_id, Number(r.cnt || 0));
  return map;
}

export function runGrowthAnalystL0(db, {
  metrics,
  adgameFunnel = null,
  triggerSource = 'manual',
  createdBy = 'system',
  now = Date.now
} = {}) {
  ensureGrowthSchema(db);
  const stamp = now();
  const runId = `grun_${uid().replace(/-/g, '').slice(0, 12)}`;

  const summary = metrics?.summary || {};
  const funnel = metrics?.funnel || {};
  const gameMetrics = Array.isArray(metrics?.games) ? metrics.games : [];
  const adStats = readAdFunnelStats(db, adgameFunnel);
  const shortsByGame = readShortsCountByGame(db);

  const hypotheses = [];
  const actions = [];

  // 1. High Load P90 Latency Detector (>= 3.0s)
  const slowGames = gameMetrics.filter(g => g.plays >= 1 && Number.isFinite(g.loadP90Seconds) && g.loadP90Seconds >= 3.0);
  if (slowGames.length > 0 || (Number.isFinite(summary.loadP90Seconds) && summary.loadP90Seconds >= 3.0)) {
    const worst = slowGames.sort((a, b) => b.loadP90Seconds - a.loadP90Seconds)[0] || null;
    const p90 = worst ? worst.loadP90Seconds : summary.loadP90Seconds;
    const impact = p90 >= 5.0 ? 9 : 8;
    const confidence = 9;
    const ease = 7;
    hypotheses.push({
      id: `hyp_load_p90_${worst ? worst.id : 'platform'}`,
      category: 'performance',
      bottleneck: 'high_load_p90',
      targetGameId: worst ? worst.id : null,
      metric: 'loadP90Seconds',
      observedValue: p90,
      threshold: 3.0,
      impact,
      confidence,
      ease,
      iceScore: iceScore(impact, confidence, ease),
      title: worst
        ? `${worst.title || worst.id} 초기 로딩 P90 ${p90}s 초과 — N3 번들 경량화/증류 필요`
        : `플랫폼 초기 로딩 P90 ${p90}s 초과 — 경량 번들 최적화 필요`,
      recommendation: 'Run tools/adgame/distill-demo-bundle.mjs to prune duplicate HTML, dictionary bloat, and unminified vendor JS.'
    });
    actions.push({
      type: 'distill_bundle',
      targetGameId: worst ? worst.id : null,
      suggestedCommand: worst ? `node tools/adgame/distill-demo-bundle.mjs games/${worst.id}/Web` : 'node tools/adgame/validate-demo-bundle.mjs'
    });
  }

  // 2. Low play -> active60s Conversion Detector (< 35%)
  const lowRetentionGames = gameMetrics.filter(g => {
    const rate = g.funnel?.active60sRate;
    return g.plays >= 3 && Number.isFinite(rate) && rate < 0.35;
  });
  const platformActive60 = funnel.active60sRate;
  if (lowRetentionGames.length > 0 || (funnel.started >= 3 && Number.isFinite(platformActive60) && platformActive60 < 0.35)) {
    const worst = lowRetentionGames.sort((a, b) => a.funnel.active60sRate - b.funnel.active60sRate)[0] || null;
    const rate = worst ? worst.funnel.active60sRate : platformActive60;
    const impact = 9;
    const confidence = 8;
    const ease = 6;
    hypotheses.push({
      id: `hyp_active60_${worst ? worst.id : 'platform'}`,
      category: 'engagement',
      bottleneck: 'low_play_to_active60s',
      targetGameId: worst ? worst.id : null,
      metric: 'active60sRate',
      observedValue: Number(rate.toFixed(4)),
      threshold: 0.35,
      impact,
      confidence,
      ease,
      iceScore: iceScore(impact, confidence, ease),
      title: worst
        ? `${worst.title || worst.id} play→active60s 전환율 ${(rate * 100).toFixed(1)}% 저조`
        : `플랫폼 play→active60s 전환율 ${(rate * 100).toFixed(1)}% 저조`,
      recommendation: 'Launch A/B experiment on first-15s onboarding hook and measure active_play_60s with CUPED.'
    });
    actions.push({
      type: 'launch_experiment',
      targetGameId: worst ? worst.id : null,
      metricPrimary: 'active_play_60s_rate'
    });
  }

  // 3. AdGame demo_complete -> cta_click Drop Detector (< 30%)
  const adCtaRate = adStats.demoComplete > 0 ? adStats.ctaClick / adStats.demoComplete : null;
  const leakyCampaigns = adStats.byCampaign.filter(c => c.demoComplete >= 1 && (c.ctaClick / c.demoComplete) < 0.30);
  if ((adCtaRate !== null && adCtaRate < 0.30) || leakyCampaigns.length > 0) {
    const worstCamp = leakyCampaigns.sort((a, b) => (a.ctaClick / a.demoComplete) - (b.ctaClick / b.demoComplete))[0] || null;
    const rate = worstCamp ? (worstCamp.ctaClick / worstCamp.demoComplete) : adCtaRate;
    const impact = 8;
    const confidence = 8;
    const ease = 8;
    hypotheses.push({
      id: `hyp_adgame_cta_${worstCamp ? worstCamp.campaignId : 'all'}`,
      category: 'acquisition',
      bottleneck: 'adgame_demo_to_cta_drop',
      targetCampaignId: worstCamp ? worstCamp.campaignId : null,
      metric: 'adgameCtaRate',
      observedValue: Number(rate.toFixed(4)),
      threshold: 0.30,
      impact,
      confidence,
      ease,
      iceScore: iceScore(impact, confidence, ease),
      title: worstCamp
        ? `AdGame 캠페인(${worstCamp.campaignId}) demo_complete→cta_click 전환 ${(rate * 100).toFixed(1)}% 급락`
        : `AdGame demo_complete→cta_click 전환율 ${(rate * 100).toFixed(1)}% 저조`,
      recommendation: 'Test clearer starter-pack reward CTA copy and immediate PlayHub handoff overlay upon demo completion.'
    });
    actions.push({
      type: 'optimize_adgame_cta',
      targetCampaignId: worstCamp ? worstCamp.campaignId : null
    });
  }

  // 4. Zero-Shorts High-Retention Hidden Gems Detector
  const hiddenGems = gameMetrics.filter(g => {
    const shortCount = shortsByGame.get(g.id) || 0;
    if (shortCount > 0) return false;
    const strongActive60 = g.plays >= 1 && Number.isFinite(g.funnel?.active60sRate) && g.funnel.active60sRate >= 0.40;
    const strongD1 = Number.isFinite(g.d1NewRate) && g.d1NewRate >= 0.25;
    const strongAvgSec = Number.isFinite(g.averageActiveSeconds) && g.averageActiveSeconds >= 60;
    return strongActive60 || strongD1 || strongAvgSec;
  });
  for (const gem of hiddenGems.slice(0, 5)) {
    const impact = 8;
    const confidence = 7;
    const ease = 9;
    hypotheses.push({
      id: `hyp_hidden_gem_${gem.id}`,
      category: 'viral_supply',
      bottleneck: 'zero_shorts_hidden_gem',
      targetGameId: gem.id,
      metric: 'shortsCount',
      observedValue: 0,
      threshold: 1,
      impact,
      confidence,
      ease,
      iceScore: iceScore(impact, confidence, ease),
      title: `숨은 고리텐션 게임 '${gem.title || gem.id}'에 공개 쇼츠 0건 — N6 하이라이트 클립 제작 추천`,
      recommendation: 'Generate a 9:16 gameplay highlight Short to unlock home shelf discovery and viral share traffic.'
    });
    actions.push({
      type: 'create_highlight_short',
      targetGameId: gem.id
    });
  }

  // 5. Low Home Card CTR Detector (optional signal when impressions >= 10 and ctr < 8%)
  if (summary.impressions >= 10 && Number.isFinite(summary.ctr) && summary.ctr < 0.08) {
    const impact = 7;
    const confidence = 7;
    const ease = 8;
    hypotheses.push({
      id: 'hyp_low_home_ctr',
      category: 'discovery',
      bottleneck: 'low_card_ctr',
      targetGameId: null,
      metric: 'ctr',
      observedValue: Number(summary.ctr.toFixed(4)),
      threshold: 0.08,
      impact,
      confidence,
      ease,
      iceScore: iceScore(impact, confidence, ease),
      title: `홈 게임 카드 CTR ${(summary.ctr * 100).toFixed(1)}% 저조 — D1 개인화 Bandit 랭킹 실험 권장`,
      recommendation: 'Enable ?placement=home_grid Contextual Bandit ranking experiment and track slot_index/propensity.'
    });
    actions.push({
      type: 'enable_bandit_experiment',
      placementId: 'home_grid'
    });
  }

  hypotheses.sort((a, b) => b.iceScore - a.iceScore || a.id.localeCompare(b.id));

  const runSummary = {
    gamesAnalyzed: gameMetrics.length,
    playSessions: Number(summary.playSessions || 0),
    loadP90Seconds: summary.loadP90Seconds ?? null,
    active60sRate: funnel.active60sRate ?? null,
    adDemoComplete: adStats.demoComplete,
    adCtaClick: adStats.ctaClick,
    adCtaRate: adCtaRate !== null ? Number(adCtaRate.toFixed(4)) : null,
    hiddenGemsCount: hiddenGems.length,
    hypothesesCount: hypotheses.length,
    topIceScore: hypotheses[0]?.iceScore ?? 0
  };

  db.prepare(`
    INSERT INTO growth_agent_runs(
      id, level, trigger_source, status, summary_json, hypotheses_json, actions_json, created_by, created_at
    ) VALUES(?,?,?,?,?,?,?,?,?)
  `).run(
    runId, 'L0', String(triggerSource || 'manual').slice(0, 64), 'completed',
    JSON.stringify(runSummary), JSON.stringify(hypotheses), JSON.stringify(actions),
    createdBy || 'system', stamp
  );

  return {
    id: runId,
    level: 'L0',
    triggerSource: String(triggerSource || 'manual').slice(0, 64),
    status: 'completed',
    createdBy: createdBy || 'system',
    createdAt: new Date(stamp).toISOString(),
    summary: runSummary,
    hypotheses,
    actions
  };
}

export function listGrowthRuns(db, { level = null, limit = 25 } = {}) {
  ensureGrowthSchema(db);
  const safeLimit = Math.max(1, Math.min(100, Number.isInteger(limit) ? limit : 25));
  const rows = level
    ? db.prepare('SELECT * FROM growth_agent_runs WHERE level=? ORDER BY created_at DESC, id DESC LIMIT ?').all(level, safeLimit)
    : db.prepare('SELECT * FROM growth_agent_runs ORDER BY created_at DESC, id DESC LIMIT ?').all(safeLimit);

  return rows.map(r => ({
    id: r.id,
    level: r.level,
    triggerSource: r.trigger_source,
    status: r.status,
    createdBy: r.created_by || null,
    createdAt: new Date(r.created_at).toISOString(),
    summary: JSON.parse(r.summary_json || '{}'),
    hypotheses: JSON.parse(r.hypotheses_json || '[]'),
    actions: JSON.parse(r.actions_json || '[]')
  }));
}
