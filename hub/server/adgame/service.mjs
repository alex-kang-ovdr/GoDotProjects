import { randomBytes } from 'node:crypto';
import { transaction } from '../db.mjs';
import { ApiError, digest, safeString, uid } from '../security.mjs';
import { ensureAdGameSchema } from './schema.mjs';

const HANDOFF_TTL_MS = 24 * 60 * 60 * 1000;
const SHORT_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const ALLOWED_FUNNEL_EVENTS = new Set([
  'impression',
  'loaded',
  'first_input',
  'milestone',
  'demo_complete',
  'cta_click',
  'store_redirect',
  'app_open',
  'handoff_claimed',
  'full_game_start',
  'qualified_play'
]);

export const ALLOWED_CTA_MODES = new Set([
  'install_direct',
  'web_first_then_install',
  'soft_banner',
  'content_only',
  'partner_contained'
]);

export const ALLOWED_INSTALL_CHANNELS = new Set([
  'aos_referrer',
  'ios_ul',
  'short_code',
  'web_fallback',
  'poc_app_sim'
]);

const DEFAULT_PARTNERS = [
  {
    id: 'karrot',
    name: '당근마켓 (허브 연계 배너형)',
    adapterType: 'karrot',
    ctaMode: 'install_direct',
    revshareBps: 1200,
    cpaKrw: 1500
  },
  {
    id: 'karrot-soft',
    name: '당근마켓 (소프트 배너·기록보존형)',
    adapterType: 'karrot',
    ctaMode: 'soft_banner',
    revshareBps: 1500,
    cpaKrw: 1000
  },
  {
    id: 'karrot-content',
    name: '당근마켓 (순수 콘텐츠 공급형)',
    adapterType: 'karrot',
    ctaMode: 'content_only',
    revshareBps: 5000,
    cpaKrw: 0
  },
  {
    id: 'toss',
    name: '토스 앱인토스 (순수 컨텐츠 제공형)',
    adapterType: 'toss',
    ctaMode: 'content_only',
    revshareBps: 5500,
    cpaKrw: 0
  },
  {
    id: 'toss-soft',
    name: '토스 앱인토스 (브랜드 코드 연동형)',
    adapterType: 'toss',
    ctaMode: 'partner_contained',
    revshareBps: 5000,
    cpaKrw: 0
  },
  {
    id: 'kakao',
    name: '카카오톡 (더보기 AD · 허브 연계 배너형)',
    adapterType: 'kakao',
    ctaMode: 'install_direct',
    revshareBps: 1200,
    cpaKrw: 1500
  },
  {
    id: 'kakao-content',
    name: '카카오톡 게임탭 (순수 컨텐츠 제공형)',
    adapterType: 'kakao',
    ctaMode: 'content_only',
    revshareBps: 5000,
    cpaKrw: 0
  }
];

const DEFAULT_CAMPAIGNS = [
  {
    id: 'karrot-iron-tide',
    partnerId: 'karrot',
    demoGameId: 'world-of-warships',
    targetGameId: 'world-of-warships',
    forgeTargetGameId: null,
    titleKo: '아이언 타이드',
    subtitleKo: 'IRON TIDE · 해전 전술 포격전',
    genreKo: '해전 전술',
    badgeText: '무설치 · 1초 시작',
    bundleKb: 1510,
    demoDurationSec: 45,
    rewardType: 'starter_pack',
    rewardPayload: {
      label: '구축함 스타터 스킨 + 150 PlayCoin',
      coins: 150,
      itemId: 'iron_tide_destroyer_starter'
    },
    ageRating: 'ALL',
    sortOrder: 10
  },
  {
    id: 'karrot-besiege',
    partnerId: 'karrot',
    demoGameId: 'besiege',
    targetGameId: 'besiege',
    forgeTargetGameId: 'forge-iron-wood',
    titleKo: '비 시즈',
    subtitleKo: 'IRONWOOD · 물리 공성 공방',
    genreKo: '물리 공성',
    badgeText: '잠실4동 공성 챌린지',
    bundleKb: 4552,
    demoDurationSec: 45,
    rewardType: 'starter_pack',
    rewardPayload: {
      label: '황금 투석기 부품 + 150 PlayCoin',
      coins: 150,
      itemId: 'besiege_golden_catapult'
    },
    ageRating: 'ALL',
    sortOrder: 20
  },
  {
    id: 'karrot-nexus-front',
    partnerId: 'karrot',
    demoGameId: 'league-of-legends',
    targetGameId: 'league-of-legends',
    forgeTargetGameId: null,
    titleKo: '넥서스전선',
    subtitleKo: 'NEXUS FRONT · 3레인 전략 MOBA',
    genreKo: '전략 MOBA',
    badgeText: '우리동네 인기 1위',
    bundleKb: 6368,
    demoDurationSec: 45,
    rewardType: 'starter_pack',
    rewardPayload: {
      label: '넥서스 선봉대 칭호 + 200 PlayCoin',
      coins: 200,
      itemId: 'nexus_vanguard_badge'
    },
    ageRating: '12+',
    sortOrder: 30
  },
  {
    id: 'karrot-clash-royale',
    partnerId: 'karrot',
    demoGameId: 'clash-royale',
    targetGameId: 'clash-royale',
    forgeTargetGameId: null,
    titleKo: '클래시 로얄',
    subtitleKo: '크라운폴 아레나 · 2레인 카드대전',
    genreKo: '카드 전략',
    badgeText: '🔥 연승 도전 중',
    bundleKb: 2018,
    demoDurationSec: 45,
    rewardType: 'starter_pack',
    rewardPayload: {
      label: '왕관 스타터 상자 + 150 PlayCoin',
      coins: 150,
      itemId: 'crownfall_starter_chest'
    },
    ageRating: 'ALL',
    sortOrder: 40
  },
  {
    id: 'karrot-survivor-io',
    partnerId: 'karrot',
    demoGameId: 'survivor-io',
    targetGameId: 'survivor-io',
    forgeTargetGameId: 'forge-survivor-io',
    titleKo: '탕탕특공대',
    subtitleKo: '서바이버 아레나 · 1분 무쌍 생존',
    genreKo: '서바이벌 액션',
    badgeText: '🔥 128명 플레이 중',
    bundleKb: 734,
    demoDurationSec: 45,
    rewardType: 'starter_pack',
    rewardPayload: {
      label: '플라즈마 블레이드 + 200 PlayCoin',
      coins: 200,
      itemId: 'survivor_plasma_blade'
    },
    ageRating: 'ALL',
    sortOrder: 50
  }
];

function parseJsonSafe(raw, fallback = {}) {
  try {
    const parsed = JSON.parse(raw || '');
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function classifyUserAgent(ua = '') {
  const s = String(ua || '');
  const isInApp = /KAKAOTALK|Karrot|Daangn|NAVER\(|Toss|Instagram|FBAN|FBAV|Line\//i.test(s);
  if (/Android/i.test(s)) return isInApp ? 'android-inapp' : 'android-web';
  if (/iPhone|iPad|iPod/i.test(s)) return isInApp ? 'ios-inapp' : 'ios-web';
  return 'desktop-web';
}

function generateShortCode(db) {
  for (let attempt = 0; attempt < 16; attempt++) {
    const bytes = randomBytes(6);
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += SHORT_CODE_ALPHABET[bytes[i] % SHORT_CODE_ALPHABET.length];
    }
    const exists = db.prepare('SELECT 1 FROM ad_handoff_tokens WHERE short_code=?').get(code);
    if (!exists) return code;
  }
  throw new ApiError(500, 'SHORT_CODE_GENERATION_FAILED');
}

function sanitizeRegion(region) {
  const s = String(region || '잠실4동').trim().replace(/[<>"'`]/g, '').slice(0, 32);
  return s || '잠실4동';
}

function clampInt(value, min, max, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

export function createAdGameService({ db, now = Date.now, catalogGames = () => [], androidPackage = 'com.playhub.gamedev.live', iosAppStoreUrl = 'https://apps.apple.com/app/playhub/id0000000000', fullHubBaseUrl = '' }) {
  ensureAdGameSchema(db);
  const normalizedFullHubBase = String(fullHubBaseUrl || '').trim().replace(/\/$/, '');

  function seedDefaults() {
    const stamp = now();
    const insertPartner = db.prepare(`
      INSERT OR IGNORE INTO ad_partners(id,name,adapter_type,cta_mode,revshare_bps,cpa_krw,allowed_origins_json,status,created_at)
      VALUES(?,?,?,?,?,?,'[]','active',?)
    `);
    for (const p of DEFAULT_PARTNERS) {
      insertPartner.run(p.id, p.name, p.adapterType, p.ctaMode, p.revshareBps, p.cpaKrw, stamp);
    }

    const insertCampaign = db.prepare(`
      INSERT OR IGNORE INTO ad_campaigns(
        id,partner_id,demo_game_id,target_game_id,forge_target_game_id,
        title_ko,subtitle_ko,genre_ko,badge_text,bundle_kb,demo_duration_sec,
        reward_type,reward_payload_json,age_rating,region_mode,sort_order,status,starts_at,ends_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,'neighborhood',?,'active',?,NULL)
    `);
    for (const c of DEFAULT_CAMPAIGNS) {
      insertCampaign.run(
        c.id, c.partnerId, c.demoGameId, c.targetGameId, c.forgeTargetGameId,
        c.titleKo, c.subtitleKo, c.genreKo, c.badgeText, c.bundleKb, c.demoDurationSec,
        c.rewardType, JSON.stringify(c.rewardPayload), c.ageRating, c.sortOrder, stamp
      );
    }
  }

  seedDefaults();

  function gameMetaById() {
    const map = new Map();
    try {
      for (const g of catalogGames() || []) {
        if (g && g.id) map.set(g.id, g);
      }
    } catch {}
    return map;
  }

  function coverForGame(gameId, metaMap) {
    const g = metaMap.get(gameId);
    const rel = g?.manifest?.media?.cover || g?.media?.cover || g?.cover;
    if (rel && typeof rel === 'string') {
      return rel.startsWith('/') ? rel : `/games/${gameId}/${rel}`;
    }
    return gameId === 'league-of-legends'
      ? `/games/${gameId}/assets/platform-cover.jpg`
      : `/games/${gameId}/assets/platform-cover.png`;
  }

  function listPartners() {
    return db.prepare('SELECT id,name,adapter_type AS adapterType,cta_mode AS ctaMode,revshare_bps AS revshareBps,cpa_krw AS cpaKrw,status FROM ad_partners ORDER BY id').all();
  }

  function listCampaigns({ partnerId } = {}) {
    const metaMap = gameMetaById();
    const rows = partnerId
      ? db.prepare("SELECT * FROM ad_campaigns WHERE status='active' AND (partner_id=? OR partner_id='karrot') ORDER BY sort_order ASC").all(partnerId)
      : db.prepare("SELECT * FROM ad_campaigns WHERE status='active' ORDER BY sort_order ASC").all();

    const partner = partnerId
      ? db.prepare('SELECT * FROM ad_partners WHERE id=?').get(partnerId)
      : db.prepare("SELECT * FROM ad_partners WHERE id='karrot'").get();

    const sessionCounts = new Map(
      db.prepare('SELECT campaign_id, COUNT(*) AS cnt, MAX(best_score) AS top_score FROM ad_demo_sessions GROUP BY campaign_id')
        .all()
        .map(r => [r.campaign_id, { count: Number(r.cnt || 0), topScore: Number(r.top_score || 0) }])
    );

    return {
      fullHubBaseUrl: normalizedFullHubBase || null,
      partner: partner ? {
        id: partner.id,
        name: partner.name,
        adapterType: partner.adapter_type,
        ctaMode: partner.cta_mode,
        revshareBps: partner.revshare_bps,
        cpaKrw: partner.cpa_krw
      } : null,
      partners: listPartners(),
      campaigns: rows.map(row => {
        const stats = sessionCounts.get(row.id) || { count: 0, topScore: 0 };
        const reward = parseJsonSafe(row.reward_payload_json, {});
        const demoCover = coverForGame(row.demo_game_id, metaMap);
        const fullPrefix = normalizedFullHubBase || '';
        return {
          id: row.id,
          partnerId: partner?.id || row.partner_id,
          demoGameId: row.demo_game_id,
          targetGameId: row.target_game_id,
          forgeTargetGameId: normalizedFullHubBase ? null : (row.forge_target_game_id || null),
          titleKo: row.title_ko,
          subtitleKo: row.subtitle_ko,
          genreKo: row.genre_ko,
          badgeText: row.badge_text,
          bundleKb: row.bundle_kb,
          demoDurationSec: row.demo_duration_sec,
          rewardType: row.reward_type,
          reward,
          ageRating: row.age_rating,
          coverUrl: demoCover,
          demoEntryUrl: `/games/${row.demo_game_id}/index.html`,
          fullGameUrl: `${fullPrefix}/play/${row.target_game_id}/`,
          forgeFullGameUrl: (!normalizedFullHubBase && row.forge_target_game_id) ? `/play/${row.forge_target_game_id}/` : null,
          liveStats: {
            sessions: stats.count,
            topScore: stats.topScore
          }
        };
      })
    };
  }

  function startDemoSession({ campaignId, partnerId, regionTag, userAgent }) {
    if (!safeString(campaignId, 80)) throw new ApiError(400, 'CAMPAIGN_ID_REQUIRED');
    const campaign = db.prepare("SELECT * FROM ad_campaigns WHERE id=? AND status='active'").get(campaignId);
    if (!campaign) throw new ApiError(404, 'CAMPAIGN_NOT_FOUND');

    const effectivePartnerId = safeString(partnerId, 64) ? partnerId : campaign.partner_id;
    const partner = db.prepare('SELECT * FROM ad_partners WHERE id=?').get(effectivePartnerId)
      || db.prepare('SELECT * FROM ad_partners WHERE id=?').get(campaign.partner_id);
    if (!partner) throw new ApiError(404, 'PARTNER_NOT_FOUND');

    const stamp = now();
    const sessionId = `ads_${uid()}`;
    const region = sanitizeRegion(regionTag);
    const uaFamily = classifyUserAgent(userAgent);

    transaction(db, () => {
      db.prepare(`
        INSERT INTO ad_demo_sessions(id,campaign_id,partner_id,demo_game_id,target_game_id,region_tag,user_agent_family,started_at,play_ms,best_score,stage_reached,completed_at)
        VALUES(?,?,?,?,?,?,?,?,0,0,1,NULL)
      `).run(sessionId, campaign.id, partner.id, campaign.demo_game_id, campaign.target_game_id, region, uaFamily, stamp);

      db.prepare(`
        INSERT INTO ad_funnel_events(id,session_id,campaign_id,partner_id,event_type,meta_json,created_at)
        VALUES(?,?,?,?,?,?,?)
      `).run(uid(), sessionId, campaign.id, partner.id, 'impression', JSON.stringify({ regionTag: region, uaFamily }), stamp);
    });

    const reward = parseJsonSafe(campaign.reward_payload_json, {});
    return {
      sessionId,
      campaignId: campaign.id,
      partnerId: partner.id,
      partnerName: partner.name,
      ctaMode: partner.cta_mode,
      demoGameId: campaign.demo_game_id,
      targetGameId: campaign.target_game_id,
      forgeTargetGameId: campaign.forge_target_game_id || null,
      titleKo: campaign.title_ko,
      subtitleKo: campaign.subtitle_ko,
      demoEntryUrl: `/games/${campaign.demo_game_id}/index.html`,
      demoDurationSec: campaign.demo_duration_sec,
      regionTag: region,
      userAgentFamily: uaFamily,
      reward,
      startedAt: new Date(stamp).toISOString()
    };
  }

  function recordEvent({ sessionId, campaignId, partnerId, eventType, playMs, score, stage, meta = {} }) {
    if (!ALLOWED_FUNNEL_EVENTS.has(eventType)) throw new ApiError(400, 'INVALID_FUNNEL_EVENT');
    let resolvedCampaignId = campaignId;
    let resolvedPartnerId = partnerId;
    let session = null;

    if (sessionId) {
      session = db.prepare('SELECT * FROM ad_demo_sessions WHERE id=?').get(sessionId);
      if (!session) throw new ApiError(404, 'DEMO_SESSION_NOT_FOUND');
      resolvedCampaignId = session.campaign_id;
      resolvedPartnerId = session.partner_id;
    } else {
      if (!safeString(resolvedCampaignId, 80)) throw new ApiError(400, 'CAMPAIGN_ID_REQUIRED');
      const camp = db.prepare('SELECT * FROM ad_campaigns WHERE id=?').get(resolvedCampaignId);
      if (!camp) throw new ApiError(404, 'CAMPAIGN_NOT_FOUND');
      resolvedPartnerId = safeString(resolvedPartnerId, 64) ? resolvedPartnerId : camp.partner_id;
    }

    const stamp = now();
    const safeMeta = meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : {};
    const nextPlayMs = playMs !== undefined ? clampInt(playMs, 0, 3600000, session?.play_ms || 0) : (session?.play_ms || 0);
    const nextScore = score !== undefined ? clampInt(score, 0, 99999999, session?.best_score || 0) : (session?.best_score || 0);
    const nextStage = stage !== undefined ? clampInt(stage, 1, 999, session?.stage_reached || 1) : (session?.stage_reached || 1);

    transaction(db, () => {
      db.prepare(`
        INSERT INTO ad_funnel_events(id,session_id,campaign_id,partner_id,event_type,meta_json,created_at)
        VALUES(?,?,?,?,?,?,?)
      `).run(uid(), session ? session.id : null, resolvedCampaignId, resolvedPartnerId, eventType, JSON.stringify(safeMeta), stamp);

      if (session) {
        db.prepare(`
          UPDATE ad_demo_sessions
          SET play_ms = MAX(play_ms, ?),
              best_score = MAX(best_score, ?),
              stage_reached = MAX(stage_reached, ?),
              completed_at = CASE WHEN ? = 'demo_complete' THEN COALESCE(completed_at, ?) ELSE completed_at END
          WHERE id = ?
        `).run(nextPlayMs, nextScore, nextStage, eventType, stamp, session.id);
      }
    });

    return { ok: true, eventType, sessionId: session?.id || null, recordedAt: new Date(stamp).toISOString() };
  }

  function buildTransitionLinks({ baseOrigin, handoffToken, shortCode, targetGameId, partnerId, campaignId }) {
    const origin = String(baseOrigin || 'http://127.0.0.1:18280').replace(/\/$/, '');
    const fullOrigin = normalizedFullHubBase || origin;
    const webContinuePath = `/play/${encodeURIComponent(targetGameId)}/?ad_handoff=${encodeURIComponent(handoffToken)}&autolaunch=1`;
    const webContinueUrl = `${fullOrigin}${webContinuePath}`;
    const smartRouterPath = `/ad/go/${encodeURIComponent(shortCode)}`;
    const smartRouterUrl = `${origin}${smartRouterPath}`;
    const universalLinkUrl = `${fullOrigin}/ad/claim/${encodeURIComponent(handoffToken)}?game=${encodeURIComponent(targetGameId)}`;
    const referrerValue = `utm_source=${partnerId}&utm_campaign=${campaignId}&handoff=${handoffToken}&game=${targetGameId}`;
    const playStoreUrl = `https://play.google.com/store/apps/details?id=${encodeURIComponent(androidPackage)}&referrer=${encodeURIComponent(referrerValue)}`;
    const androidIntentUrl = `intent://ad/claim/${encodeURIComponent(handoffToken)}?game=${encodeURIComponent(targetGameId)}#Intent;scheme=playhub;package=${androidPackage};S.browser_fallback_url=${encodeURIComponent(playStoreUrl)};end`;

    return {
      smartRouterPath,
      smartRouterUrl,
      webContinuePath,
      webContinueUrl,
      externalFullHub: Boolean(normalizedFullHubBase),
      universalLinkUrl,
      playStoreUrl,
      androidIntentUrl,
      appStoreUrl: iosAppStoreUrl,
      referrerParam: referrerValue
    };
  }

  function issueHandoffToken({ sessionId, score, stage, playMs, carryOver = {}, targetOverride = null, baseOrigin = '' }) {
    if (!safeString(sessionId, 80)) throw new ApiError(400, 'SESSION_ID_REQUIRED');
    const session = db.prepare('SELECT * FROM ad_demo_sessions WHERE id=?').get(sessionId);
    if (!session) throw new ApiError(404, 'DEMO_SESSION_NOT_FOUND');

    const campaign = db.prepare('SELECT * FROM ad_campaigns WHERE id=?').get(session.campaign_id);
    if (!campaign) throw new ApiError(404, 'CAMPAIGN_NOT_FOUND');
    const partner = db.prepare('SELECT * FROM ad_partners WHERE id=?').get(session.partner_id);

    let targetGameId = campaign.target_game_id;
    if (targetOverride && safeString(targetOverride, 64)) {
      if (targetOverride === campaign.target_game_id || targetOverride === campaign.forge_target_game_id || targetOverride === campaign.demo_game_id) {
        targetGameId = targetOverride;
      } else {
        throw new ApiError(400, 'TARGET_GAME_NOT_ALLOWED');
      }
    }

    const stamp = now();
    const finalScore = clampInt(score, 0, 99999999, Math.max(session.best_score || 0, 1200));
    const finalStage = clampInt(stage, 1, 999, Math.max(session.stage_reached || 1, 1));
    const finalPlayMs = clampInt(playMs, 0, 3600000, Math.max(session.play_ms || 0, 15000));
    const rawToken = `adh_${randomBytes(24).toString('base64url')}`;
    const tokenHash = digest(rawToken);
    const shortCode = generateShortCode(db);
    const expiresAt = stamp + HANDOFF_TTL_MS;
    const reward = parseJsonSafe(campaign.reward_payload_json, {});

    // Compute a realistic local neighborhood percentile from score for motivating handoff UX
    const topPercent = Math.max(1, Math.min(35, Math.round(32 - Math.min(finalScore, 20000) / 700)));

    const snapshot = {
      titleKo: campaign.title_ko,
      subtitleKo: campaign.subtitle_ko,
      demoGameId: campaign.demo_game_id,
      targetGameId,
      partnerId: session.partner_id,
      partnerName: partner?.name || session.partner_id,
      regionTag: session.region_tag,
      score: finalScore,
      stage: finalStage,
      playMs: finalPlayMs,
      topPercent,
      reward,
      carryOver: carryOver && typeof carryOver === 'object' && !Array.isArray(carryOver) ? carryOver : {}
    };

    transaction(db, () => {
      db.prepare(`
        UPDATE ad_demo_sessions
        SET play_ms = MAX(play_ms, ?), best_score = MAX(best_score, ?), stage_reached = MAX(stage_reached, ?), completed_at = COALESCE(completed_at, ?)
        WHERE id = ?
      `).run(finalPlayMs, finalScore, finalStage, stamp, session.id);

      db.prepare(`
        INSERT INTO ad_handoff_tokens(
          token_hash,short_code,session_id,campaign_id,partner_id,target_game_id,
          region_tag,snapshot_json,status,claimed_user_id,claimed_device_hash,expires_at,claimed_at,created_at
        ) VALUES(?,?,?,?,?,?,?,?,'issued',NULL,NULL,?,NULL,?)
      `).run(
        tokenHash, shortCode, session.id, campaign.id, session.partner_id, targetGameId,
        session.region_tag, JSON.stringify(snapshot), expiresAt, stamp
      );

      db.prepare(`
        INSERT INTO ad_funnel_events(id,session_id,campaign_id,partner_id,event_type,meta_json,created_at)
        VALUES(?,?,?,?,?,?,?)
      `).run(uid(), session.id, campaign.id, session.partner_id, 'demo_complete', JSON.stringify({ shortCode, score: finalScore, playMs: finalPlayMs, targetGameId }), stamp);
    });

    const links = buildTransitionLinks({
      baseOrigin,
      handoffToken: rawToken,
      shortCode,
      targetGameId,
      partnerId: session.partner_id,
      campaignId: campaign.id
    });

    return {
      handoffToken: rawToken,
      shortCode,
      sessionId: session.id,
      campaignId: campaign.id,
      targetGameId,
      expiresAt: new Date(expiresAt).toISOString(),
      snapshot,
      links
    };
  }

  function findHandoffRow(tokenOrCode) {
    const raw = String(tokenOrCode || '').trim();
    if (!raw) throw new ApiError(400, 'HANDOFF_TOKEN_REQUIRED');
    if (raw.startsWith('adh_')) {
      return db.prepare('SELECT * FROM ad_handoff_tokens WHERE token_hash=?').get(digest(raw));
    }
    return db.prepare('SELECT * FROM ad_handoff_tokens WHERE short_code=?').get(raw.toUpperCase());
  }

  function previewHandoff(tokenOrCode, baseOrigin = '') {
    const row = findHandoffRow(tokenOrCode);
    if (!row) throw new ApiError(404, 'HANDOFF_NOT_FOUND');
    const stamp = now();
    const expired = row.expires_at <= stamp;
    const snapshot = parseJsonSafe(row.snapshot_json, {});
    return {
      shortCode: row.short_code,
      sessionId: row.session_id,
      campaignId: row.campaign_id,
      partnerId: row.partner_id,
      targetGameId: row.target_game_id,
      regionTag: row.region_tag,
      status: expired && row.status === 'issued' ? 'expired' : row.status,
      expiresAt: new Date(row.expires_at).toISOString(),
      claimedAt: row.claimed_at ? new Date(row.claimed_at).toISOString() : null,
      snapshot,
      links: buildTransitionLinks({
        baseOrigin,
        handoffToken: String(tokenOrCode).startsWith('adh_') ? String(tokenOrCode) : row.short_code,
        shortCode: row.short_code,
        targetGameId: row.target_game_id,
        partnerId: row.partner_id,
        campaignId: row.campaign_id
      })
    };
  }

  function claimHandoffToken({ tokenOrCode, userId = null, deviceId = null, installChannel = 'web_fallback' }) {
    const channel = ALLOWED_INSTALL_CHANNELS.has(installChannel) ? installChannel : 'web_fallback';
    const stamp = now();
    const claimantId = safeString(userId, 128) ? userId : `guest_${uid()}`;
    const deviceHash = safeString(deviceId, 128) ? digest(`adgame-device:${deviceId}`) : digest(`adgame-user:${claimantId}`);

    return transaction(db, () => {
      const row = findHandoffRow(tokenOrCode);
      if (!row) throw new ApiError(404, 'HANDOFF_NOT_FOUND');
      if (row.expires_at <= stamp) {
        db.prepare("UPDATE ad_handoff_tokens SET status='expired' WHERE token_hash=? AND status='issued'").run(row.token_hash);
        throw new ApiError(410, 'HANDOFF_EXPIRED');
      }
      if (row.status !== 'issued') {
        throw new ApiError(409, 'HANDOFF_ALREADY_CLAIMED');
      }

      // Anti-fraud: one starter reward per device per campaign, while still allowing score/game handoff
      const priorDeviceClaim = db.prepare(
        "SELECT 1 FROM ad_handoff_tokens WHERE campaign_id=? AND claimed_device_hash=? AND status='claimed' LIMIT 1"
      ).get(row.campaign_id, deviceHash);
      const rewardGranted = !priorDeviceClaim;

      const updated = db.prepare(`
        UPDATE ad_handoff_tokens
        SET status='claimed', claimed_user_id=?, claimed_device_hash=?, claimed_at=?
        WHERE token_hash=? AND status='issued' AND expires_at>?
      `).run(claimantId, deviceHash, stamp, row.token_hash, stamp);

      if (updated.changes !== 1) throw new ApiError(409, 'HANDOFF_ALREADY_CLAIMED');

      const attributionId = `attr_${uid()}`;
      db.prepare(`
        INSERT INTO ad_attributions(id,user_id,partner_id,campaign_id,handoff_token_hash,install_channel,qualified_at,payout_status,created_at)
        VALUES(?,?,?,?,?,?,NULL,'pending',?)
      `).run(attributionId, claimantId, row.partner_id, row.campaign_id, row.token_hash, channel, stamp);

      db.prepare(`
        INSERT INTO ad_funnel_events(id,session_id,campaign_id,partner_id,event_type,meta_json,created_at)
        VALUES(?,?,?,?,?,?,?)
      `).run(uid(), row.session_id, row.campaign_id, row.partner_id, 'app_open', JSON.stringify({ installChannel: channel }), stamp);

      db.prepare(`
        INSERT INTO ad_funnel_events(id,session_id,campaign_id,partner_id,event_type,meta_json,created_at)
        VALUES(?,?,?,?,?,?,?)
      `).run(uid(), row.session_id, row.campaign_id, row.partner_id, 'handoff_claimed', JSON.stringify({ attributionId, rewardGranted, installChannel: channel }), stamp);

      const snapshot = parseJsonSafe(row.snapshot_json, {});
      return {
        claimed: true,
        attributionId,
        sessionId: row.session_id,
        campaignId: row.campaign_id,
        partnerId: row.partner_id,
        targetGameId: row.target_game_id,
        regionTag: row.region_tag,
        installChannel: channel,
        rewardGranted,
        duplicateDeviceGuard: !rewardGranted,
        snapshot,
        claimedAt: new Date(stamp).toISOString()
      };
    });
  }

  function markQualifiedPlay({ attributionId, playMs = 10000 }) {
    if (!safeString(attributionId, 80)) throw new ApiError(400, 'ATTRIBUTION_ID_REQUIRED');
    const attr = db.prepare('SELECT * FROM ad_attributions WHERE id=?').get(attributionId);
    if (!attr) throw new ApiError(404, 'ATTRIBUTION_NOT_FOUND');

    const safePlayMs = clampInt(playMs, 0, 3600000, 0);
    if (safePlayMs < 5000) throw new ApiError(422, 'INSUFFICIENT_PLAY_DURATION');

    if (attr.qualified_at) {
      return {
        ok: true,
        attributionId: attr.id,
        alreadyQualified: true,
        payoutStatus: attr.payout_status,
        qualifiedAt: new Date(attr.qualified_at).toISOString()
      };
    }

    const stamp = now();
    const tokenRow = db.prepare('SELECT session_id FROM ad_handoff_tokens WHERE token_hash=?').get(attr.handoff_token_hash);

    transaction(db, () => {
      db.prepare("UPDATE ad_attributions SET qualified_at=?, payout_status='qualified' WHERE id=? AND qualified_at IS NULL")
        .run(stamp, attr.id);
      db.prepare(`
        INSERT INTO ad_funnel_events(id,session_id,campaign_id,partner_id,event_type,meta_json,created_at)
        VALUES(?,?,?,?,?,?,?)
      `).run(uid(), tokenRow?.session_id || null, attr.campaign_id, attr.partner_id, 'qualified_play', JSON.stringify({ attributionId: attr.id, playMs: safePlayMs }), stamp);
    });

    return {
      ok: true,
      attributionId: attr.id,
      alreadyQualified: false,
      payoutStatus: 'qualified',
      qualifiedAt: new Date(stamp).toISOString()
    };
  }

  function getFunnelSummary({ partnerId = null, campaignId = null } = {}) {
    const where = [];
    const args = [];
    if (partnerId) { where.push('partner_id=?'); args.push(partnerId); }
    if (campaignId) { where.push('campaign_id=?'); args.push(campaignId); }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const rawCounts = db.prepare(`SELECT event_type, COUNT(*) AS cnt FROM ad_funnel_events ${clause} GROUP BY event_type`).all(...args);
    const counts = {};
    for (const ev of ALLOWED_FUNNEL_EVENTS) counts[ev] = 0;
    for (const r of rawCounts) counts[r.event_type] = Number(r.cnt || 0);

    const byCampaign = db.prepare(`
      SELECT c.id, c.title_ko AS titleKo, c.demo_game_id AS demoGameId, c.target_game_id AS targetGameId,
        (SELECT COUNT(*) FROM ad_demo_sessions s WHERE s.campaign_id=c.id) AS sessions,
        (SELECT COUNT(*) FROM ad_handoff_tokens t WHERE t.campaign_id=c.id) AS handoffsIssued,
        (SELECT COUNT(*) FROM ad_handoff_tokens t WHERE t.campaign_id=c.id AND t.status='claimed') AS handoffsClaimed,
        (SELECT COUNT(*) FROM ad_attributions a WHERE a.campaign_id=c.id AND a.payout_status='qualified') AS qualifiedPlays
      FROM ad_campaigns c
      ORDER BY c.sort_order ASC
    `).all();

    const recentEvents = db.prepare(`
      SELECT id, session_id AS sessionId, campaign_id AS campaignId, partner_id AS partnerId, event_type AS eventType, meta_json AS metaJson, created_at AS createdAt
      FROM ad_funnel_events ${clause}
      ORDER BY created_at DESC LIMIT 25
    `).all(...args).map(r => ({
      ...r,
      meta: parseJsonSafe(r.metaJson, {}),
      createdAt: new Date(r.createdAt).toISOString()
    }));

    const recentAttributions = db.prepare(`
      SELECT a.id, a.partner_id AS partnerId, a.campaign_id AS campaignId, a.install_channel AS installChannel,
             a.payout_status AS payoutStatus, a.qualified_at AS qualifiedAt, a.created_at AS createdAt,
             t.short_code AS shortCode, t.region_tag AS regionTag, t.target_game_id AS targetGameId
      FROM ad_attributions a
      LEFT JOIN ad_handoff_tokens t ON t.token_hash = a.handoff_token_hash
      ORDER BY a.created_at DESC LIMIT 15
    `).all().map(r => ({
      ...r,
      qualifiedAt: r.qualifiedAt ? new Date(r.qualifiedAt).toISOString() : null,
      createdAt: new Date(r.createdAt).toISOString()
    }));

    return {
      counts,
      byCampaign,
      recentEvents,
      recentAttributions
    };
  }

  return {
    listPartners,
    listCampaigns,
    startDemoSession,
    recordEvent,
    issueHandoffToken,
    previewHandoff,
    claimHandoffToken,
    markQualifiedPlay,
    getFunnelSummary
  };
}
