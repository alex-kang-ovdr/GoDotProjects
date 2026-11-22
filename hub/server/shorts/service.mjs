// PlayHub Shorts Orchestration Service
// Integrates Track A PlayCoin Hold/Capture ledger, Google Flow / Veo & FFmpeg Director engines,
// verified game ownership checks, media storage, and Hub Shorts feed / detail registration.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ApiError, safeString, uid } from '../security.mjs';
import { readCatalog } from '../catalog.mjs';
import { transaction } from '../db.mjs';
import {
  getWallet,
  reserveHold,
  settleHold,
  releaseHold,
  creditPromo
} from '../billing/ledger.mjs';
import {
  resolveVerifiedGameOwner,
  isVerifiedGameOwner
} from '../billing/direct-commerce.mjs';
import { ensureShortsSchema, readShortsIdempotency, writeShortsIdempotency } from './schema.mjs';
import {
  SHORTS_ENGINE_MAP,
  STYLE_PRESET_MAP,
  CAMERA_MOTION_MAP,
  buildPublicEngineCatalog,
  detectFfmpegBinary,
  detectVeoConfig,
  renderModeForEngine,
  isNonVideoEngine
} from './engines.mjs';
import { composeShortsStoryboard, normalizeHashtags } from './storyboard.mjs';
import { getPlaygroundPlanByGameId } from './playground-presets.mjs';
import {
  renderMotionShortsWithFfmpeg,
  renderUploadedVideoToShortform,
  decodeDataUrlImage,
  validateVideoBuffer,
  extractPosterFromVideo,
  probeVideoFile,
  buildFallbackPosterSvg
} from './providers/ffmpeg-adapter.mjs';
import { generateShortsWithVeo } from './providers/veo-adapter.mjs';
import { createPersonalAiAuthStore } from './ai-auth.mjs';

const SHORT_ID_RE = /^sh_[a-f0-9]{16}$/;
const GAME_ID_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const PROJECT_ID_RE = /^[a-f0-9]{24}$/;
const MAX_VIDEO_UPLOAD_BYTES = 40 * 1024 * 1024; // 40 MB
const MAX_CONCURRENCY = 2;

function newShortId() {
  return 'sh_' + crypto.randomBytes(8).toString('hex');
}

function cleanText(value, maxLen, fallback = '') {
  const s = String(value ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLen);
  return s || fallback;
}

function insideDir(baseDir, targetPath) {
  const rel = path.relative(baseDir, targetPath);
  return rel !== '' && rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel);
}

function writeAtomic(filePath, bufferOrString) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, bufferOrString);
  fs.renameSync(tmp, filePath);
}

function localizeValue(val) {
  if (typeof val === 'string') return val;
  if (val && typeof val === 'object') return val.ko || val.en || '';
  return '';
}

function dayBucketKst(stamp) {
  return new Date(stamp + 9 * 3600000).toISOString().slice(0, 10);
}

function parseNarrationLines(rawText, durationSec = 8) {
  const lines = String(rawText ?? '')
    .split(/\r?\n/)
    .map(l => l.replace(/\s+/g, ' ').trim().slice(0, 44))
    .filter(Boolean)
    .slice(0, 8);
  if (!lines.length) return null;
  const dur = Math.max(3, Math.min(15, Number(durationSec) || 8));
  const step = dur / lines.length;
  return lines.map((text, idx) => ({
    startSec: Number((idx * step).toFixed(2)),
    endSec: Number(((idx + 1) * step).toFixed(2)),
    text,
    emphasize: text.slice(0, 14)
  }));
}

export function createShortsService({
  db,
  config = {},
  rootDir,
  platformRoot = null,
  catalogOptions = {},
  now = Date.now,
  audit = () => {},
  env = process.env,
  fetchImpl = globalThis.fetch,
  customRenderers = null
}) {
  ensureShortsSchema(db);

  const mediaRoot = path.resolve(config.dataDir, 'shorts-media');
  fs.mkdirSync(mediaRoot, { recursive: true });

  const envModeRaw = String(env.PLAYHUB_ENV || env.NODE_ENV || '').trim().toLowerCase();
  const isLiveBuild = config.secureCookies === true || ['live', 'prod', 'production'].includes(envModeRaw);
  const experimentalEnabled = config.shorts?.experimental !== undefined
    ? Boolean(config.shorts.experimental)
    : !isLiveBuild;
  const allowDevCatalogBinding = experimentalEnabled && config.shorts?.allowDevCatalogBinding !== false;
  const allowDevGrant = experimentalEnabled && config.shorts?.allowDevGrant !== false;
  const personalAiAuth = createPersonalAiAuthStore({ env, config, fetchImpl, now });

  const activeJobs = new Map(); // shortId -> Promise
  const pendingQueue = [];
  let runningCount = 0;
  let closed = false;

  function catalogMap() {
    const games = readCatalog(rootDir, db, catalogOptions);
    const byId = new Map();
    for (const g of games) byId.set(g.id, g);
    return { games, byId };
  }

  function findCoverRasterOnDisk(gameId, gameObj) {
    if (!gameId || !GAME_ID_RE.test(gameId)) return null;
    const candidates = [];
    const rawCover = typeof gameObj?.coverUrl === 'string' ? gameObj.coverUrl : '';
    const relFromGames = rawCover.startsWith(`/games/${gameId}/`) ? rawCover.slice(`/games/${gameId}/`.length) : '';
    const bases = [
      path.resolve(rootDir, 'games', gameId),
      ...(platformRoot ? [path.resolve(platformRoot, 'games', gameId, 'Web')] : [])
    ];
    for (const base of bases) {
      if (relFromGames && /\.(png|jpe?g|webp)$/i.test(relFromGames)) {
        candidates.push(path.resolve(base, relFromGames));
      }
      candidates.push(
        path.resolve(base, 'assets/cover-v2.png'),
        path.resolve(base, 'assets/cover.png'),
        path.resolve(base, 'assets/cover.jpg'),
        path.resolve(base, 'assets/cover.webp')
      );
    }
    for (const file of candidates) {
      try {
        if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
      } catch {}
    }
    return null;
  }

  function resolveCreatorOwnerKeys(creatorId) {
    const keys = new Set();
    try {
      const rows = db.prepare("SELECT subject FROM identities WHERE provider='google' AND user_id=?").all(creatorId);
      for (const row of rows) {
        if (row.subject) {
          keys.add(crypto.createHash('sha256').update(`https://accounts.google.com\0${row.subject}`).digest('hex'));
        }
      }
    } catch {}
    return keys;
  }

  function assertCanBindGame({ creatorId, gameId, isAdmin = false }) {
    if (!gameId) return { game: null, ownership: 'unlinked' };
    if (!GAME_ID_RE.test(gameId)) {
      throw new ApiError(422, 'GAME_ID_INVALID', '유효한 게임 ID 형식이 아닙니다.');
    }
    const { byId } = catalogMap();
    const game = byId.get(gameId) || null;
    if (isAdmin) {
      if (!game) throw new ApiError(404, 'GAME_NOT_FOUND', '대상 게임을 찾을 수 없습니다.');
      return { game, ownership: 'admin' };
    }
    const verifiedOwner = resolveVerifiedGameOwner(db, gameId);
    if (verifiedOwner) {
      if (!isVerifiedGameOwner(db, { creatorId, gameId })) {
        throw new ApiError(403, 'GAME_OWNERSHIP_FORBIDDEN', '다른 창작자가 소유한 게임에는 소개 영상을 등록할 수 없습니다.');
      }
      return { game, ownership: 'ugc_owner' };
    }
    // Also check creator's own draft/in_review submissions matching game_slug
    try {
      const cols = new Set(db.prepare('PRAGMA table_info(creator_submissions)').all().map(c => c.name));
      if (cols.has('game_slug')) {
        const sub = db.prepare(
          'SELECT owner_id, owner_key FROM creator_submissions WHERE game_slug=? ORDER BY updated_at DESC LIMIT 1'
        ).get(gameId);
        if (sub) {
          const ownerKeys = resolveCreatorOwnerKeys(creatorId);
          const owns = sub.owner_id === creatorId || (sub.owner_key && ownerKeys.has(sub.owner_key));
          if (!owns) {
            throw new ApiError(403, 'GAME_OWNERSHIP_FORBIDDEN', '다른 창작자의 게임 슬러그입니다.');
          }
          return { game, ownership: 'creator_submission' };
        }
      }
    } catch (err) {
      if (err instanceof ApiError) throw err;
    }

    if (!game) {
      throw new ApiError(404, 'GAME_NOT_FOUND', '등록할 게임을 허브 카탈로그에서 찾을 수 없습니다.');
    }
    if (!allowDevCatalogBinding) {
      throw new ApiError(
        403,
        'GAME_OWNERSHIP_REQUIRED',
        '본인이 소유하고 배포한 PlayHub 게임에만 소개 쇼츠를 등록할 수 있습니다.'
      );
    }
    return { game, ownership: 'dev_catalog' };
  }

  function listCreatorBindableGames(creatorId) {
    const { games, byId } = catalogMap();
    const ownerKeys = resolveCreatorOwnerKeys(creatorId);
    const items = [];
    const seen = new Set();

    // 1. Creator's published UGC games
    try {
      const pubs = db.prepare(
        'SELECT game_id, project_id, status, visibility, manifest_json, published_at FROM hub_publications ORDER BY updated_at DESC'
      ).all();
      for (const pub of pubs) {
        const owns = isVerifiedGameOwner(db, { creatorId, gameId: pub.game_id });
        if (!owns) continue;
        const catalogGame = byId.get(pub.game_id);
        let manifest = null;
        try { manifest = JSON.parse(pub.manifest_json); } catch {}
        items.push({
          gameId: pub.game_id,
          projectId: pub.project_id || null,
          title: localizeValue(catalogGame?.title) || localizeValue(manifest?.title) || pub.game_id,
          description: localizeValue(catalogGame?.description) || localizeValue(manifest?.summary) || '',
          tags: catalogGame?.tags || manifest?.tags || ['arcade'],
          controls: catalogGame?.controls || manifest?.controls || ['keyboard', 'mouse'],
          coverUrl: catalogGame?.coverUrl || '',
          ownership: 'ugc_owner',
          ownershipLabel: '내 퍼블리시 게임',
          status: pub.status,
          visibility: pub.visibility
        });
        seen.add(pub.game_id);
      }
    } catch {}

    // 2. Creator's submissions (draft / in_review / approved)
    try {
      const cols = new Set(db.prepare('PRAGMA table_info(creator_submissions)').all().map(c => c.name));
      const slugCol = cols.has('published_game_id') ? 'published_game_id, game_slug,' : '';
      const subs = db.prepare(
        `SELECT id, owner_id, owner_key, project_id, title, description, status, ${slugCol} updated_at FROM creator_submissions ORDER BY updated_at DESC LIMIT 50`
      ).all();
      for (const sub of subs) {
        const owns = sub.owner_id === creatorId || (sub.owner_key && ownerKeys.has(sub.owner_key));
        if (!owns) continue;
        const gid = sub.published_game_id || sub.game_slug || null;
        if (!gid || seen.has(gid)) continue;
        const catalogGame = byId.get(gid);
        items.push({
          gameId: gid,
          projectId: sub.project_id || null,
          title: sub.title || localizeValue(catalogGame?.title) || gid,
          description: sub.description || localizeValue(catalogGame?.description) || '',
          tags: catalogGame?.tags || ['arcade'],
          controls: catalogGame?.controls || ['keyboard', 'mouse'],
          coverUrl: catalogGame?.coverUrl || '',
          ownership: 'creator_submission',
          ownershipLabel: '내 제출 게임',
          status: sub.status,
          visibility: 'draft'
        });
        seen.add(gid);
      }
    } catch {}

    // 3. Static built-in catalog games (dev/sandbox mode only)
    if (allowDevCatalogBinding) {
      for (const g of games) {
        if (!g.enabled || g.source === 'ugc' || seen.has(g.id)) continue;
        items.push({
          gameId: g.id,
          projectId: null,
          title: localizeValue(g.title) || g.id,
          description: localizeValue(g.description) || '',
          tags: Array.isArray(g.tags) ? g.tags : [],
          controls: Array.isArray(g.controls) ? g.controls : [],
          coverUrl: g.coverUrl || `/games/${g.id}/assets/cover.svg`,
          ownership: 'dev_catalog',
          ownershipLabel: '허브 카탈로그 (로컬 등록 지원)',
          status: 'published',
          visibility: 'public'
        });
        seen.add(g.id);
      }
    }

    return {
      games: items,
      allowDevCatalogBinding,
      allowDevGrant,
      wallet: getWallet(db, creatorId, now)
    };
  }

  function formatShort(row, { byId = null, likedSet = null } = {}) {
    const game = row.game_id && byId ? byId.get(row.game_id) : null;
    let hashtags = [];
    let storyboard = null;
    try { hashtags = JSON.parse(row.hashtags_json || '[]'); } catch {}
    try { storyboard = JSON.parse(row.storyboard_json || '{}'); } catch {}
    const engineMeta = SHORTS_ENGINE_MAP[row.engine_id] || null;
    const resolvedMeta = SHORTS_ENGINE_MAP[row.resolved_engine_id] || engineMeta;
    const renderMode = storyboard?.renderMode || renderModeForEngine(row.resolved_engine_id || row.engine_id);
    const hasVideo = Boolean(row.video_rel_path);
    const hasPoster = Boolean(row.poster_rel_path);

    return {
      id: row.id,
      creatorId: row.creator_id,
      creatorName: row.creator_name,
      gameId: row.game_id || null,
      projectId: row.project_id || null,
      title: row.title,
      caption: row.caption || '',
      hashtags: Array.isArray(hashtags) ? hashtags : [],
      prompt: row.prompt || '',
      flowPrompt: row.flow_prompt || '',
      stylePreset: row.style_preset,
      cameraMotion: row.camera_motion,
      storyboard,
      renderMode,
      hasVideoFile: hasVideo,
      topHeadline: storyboard?.topHeadline || null,
      narration: Array.isArray(storyboard?.narration) ? storyboard.narration : [],
      bestComment: storyboard?.bestComment || null,
      carouselTitle: storyboard?.carouselTitle || row.title,
      carouselSlides: Array.isArray(storyboard?.carouselSlides) ? storyboard.carouselSlides : [],
      motionSpec: storyboard?.motionSpec || null,
      engineId: row.engine_id,
      engineName: engineMeta?.name || row.engine_id,
      resolvedEngineId: row.resolved_engine_id,
      resolvedEngineName: resolvedMeta?.shortName || resolvedMeta?.name || row.resolved_engine_id,
      engineModel: row.engine_model || '',
      fallbackUsed: row.resolved_engine_id !== row.engine_id,
      status: row.status,
      visibility: row.visibility,
      isPrimary: row.is_primary === 1,
      progress: row.progress,
      stageLabel: row.stage_label || '',
      errorCode: row.error_code || null,
      errorMessage: row.error_message || null,
      videoUrl: hasVideo ? `/api/shorts/${row.id}/video` : null,
      posterUrl: hasPoster ? `/api/shorts/${row.id}/poster` : null,
      mimeType: row.mime_type || 'video/mp4',
      bytes: row.bytes || 0,
      sha256: row.sha256 || '',
      durationSec: row.duration_sec || 0,
      width: row.width || 720,
      height: row.height || 1280,
      aspectRatio: row.aspect_ratio || '9:16',
      quotedCoins: row.quoted_coins || 0,
      chargedCoins: row.charged_coins || 0,
      billingHoldId: row.billing_hold_id || null,
      billingJournalEntryId: row.billing_journal_entry_id || null,
      viewCount: row.view_count || 0,
      likeCount: row.like_count || 0,
      liked: likedSet ? likedSet.has(row.id) : false,
      game: game ? {
        id: game.id,
        title: localizeValue(game.title) || game.id,
        description: localizeValue(game.description) || '',
        coverUrl: game.coverUrl || `/games/${game.id}/assets/cover.svg`,
        tags: Array.isArray(game.tags) ? game.tags : [],
        controls: Array.isArray(game.controls) ? game.controls : [],
        playUrl: `/play/${game.id}/`
      } : (row.game_id ? {
        id: row.game_id,
        title: row.game_id,
        description: '',
        coverUrl: `/games/${row.game_id}/assets/cover.svg`,
        tags: [],
        controls: [],
        playUrl: `/play/${row.game_id}/`
      } : null),
      publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString()
    };
  }

  function likedSetForPrincipal(principalId, shortIds) {
    const out = new Set();
    if (!principalId || !shortIds.length) return out;
    const placeholders = shortIds.map(() => '?').join(',');
    const rows = db.prepare(
      `SELECT short_id FROM shorts_likes WHERE principal_id=? AND short_id IN (${placeholders})`
    ).all(principalId, ...shortIds);
    for (const r of rows) out.add(r.short_id);
    return out;
  }

  function getConfig(viewerPrincipalId = null) {
    const personal = viewerPrincipalId ? personalAiAuth.getCredentials(viewerPrincipalId) : null;
    const personalConfigured = Boolean(
      personal && (personal.geminiApiKey || (personal.vertexProject && personal.vertexAccessToken))
    );
    const base = buildPublicEngineCatalog({ env, config });
    return {
      ...base,
      veoConfigured: base.veoConfigured || personalConfigured,
      veoMode: personalConfigured ? `personal-${personal.mode}` : base.veoMode,
      personalVeoConnected: personalConfigured,
      experimentalEnabled,
      buildMode: experimentalEnabled ? 'dev' : 'live',
      allowDevCatalogBinding,
      allowDevGrant,
      maxVideoUploadBytes: MAX_VIDEO_UPLOAD_BYTES
    };
  }

  function composeStoryboardForRequest({
    gameId,
    title,
    prompt,
    stylePreset,
    cameraMotion,
    hookText,
    ctaText,
    topHeadline,
    narration,
    bestComment,
    carouselTitle,
    carouselSlides,
    durationSec,
    keyframeCount
  }) {
    const { byId } = catalogMap();
    const game = gameId && GAME_ID_RE.test(gameId) ? byId.get(gameId) || null : null;
    const preset = gameId ? getPlaygroundPlanByGameId(gameId) : null;
    return composeShortsStoryboard({
      game,
      title: title || preset?.titleKo,
      prompt: prompt || preset?.playgroundConcept,
      stylePreset: stylePreset || preset?.stylePreset || 'google-playground',
      cameraMotion: cameraMotion || preset?.cameraMotion || 'dynamic-zoom',
      hookText: hookText || preset?.hookText,
      ctaText: ctaText || preset?.ctaText,
      topHeadline: topHeadline || preset?.topHeadline || null,
      narration: narration || preset?.narration || null,
      bestComment: bestComment || preset?.bestComment || null,
      carouselTitle: carouselTitle || preset?.carouselTitle || '',
      carouselSlides: carouselSlides || preset?.carouselSlides || null,
      durationSec,
      keyframeCount
    });
  }

  function updateJobProgress(shortId, progress, stageLabel, status = 'rendering') {
    if (closed) return;
    try {
      db.prepare(`
        UPDATE shorts_videos
        SET status=?, progress=?, stage_label=?, updated_at=?
        WHERE id=? AND status IN ('queued','rendering')
      `).run(status, Math.max(0, Math.min(100, Math.round(progress))), String(stageLabel || ''), now(), shortId);
    } catch {}
  }

  async function executeRenderJob(jobCtx) {
    const {
      shortId,
      creatorId,
      requestedEngine,
      allowFallback,
      storyboard,
      keyframes,
      stylePreset,
      cameraMotion,
      durationSec,
      holdId,
      quotedCoins
    } = jobCtx;

    const shortDir = path.join(mediaRoot, shortId);
    fs.mkdirSync(shortDir, { recursive: true });
    const outputVideoPath = path.join(shortDir, 'video.mp4');
    const outputPosterPath = path.join(shortDir, 'poster.jpg');

    const onProgress = (pct, label) => updateJobProgress(shortId, pct, label, 'rendering');
    let resolvedEngineId = requestedEngine.id;
    let renderResult = null;

    try {
      updateJobProgress(shortId, 12, `${requestedEngine.shortName} 파이프라인 초기화 중`, 'rendering');

      if (requestedEngine.provider === 'motion-graphic' || requestedEngine.provider === 'carousel-images') {
        const isCarousel = requestedEngine.provider === 'carousel-images';
        onProgress(35, isCarousel ? '유튜브형 4컷 가로 이미지 카드 구성 중' : '무영상 웹툰 모션그래픽·나래이션 자막 구성 중');

        // Save crisp poster image from first supplied keyframe/cover (zero video file!)
        let posterFilename = null;
        const firstKf = Array.isArray(keyframes) ? keyframes[0] : null;
        if (firstKf?.filePath && fs.existsSync(firstKf.filePath)) {
          const ext = path.extname(firstKf.filePath).toLowerCase();
          if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
            posterFilename = `poster${ext === '.jpeg' ? '.jpg' : ext}`;
            fs.copyFileSync(firstKf.filePath, path.join(shortDir, posterFilename));
          }
        } else if (firstKf?.dataUrl) {
          const decoded = decodeDataUrlImage(firstKf.dataUrl);
          if (decoded) {
            posterFilename = `poster${decoded.ext}`;
            fs.writeFileSync(path.join(shortDir, posterFilename), decoded.buffer);
          }
        }
        if (!posterFilename) {
          posterFilename = 'poster.svg';
          fs.writeFileSync(
            path.join(shortDir, posterFilename),
            buildFallbackPosterSvg({
              title: storyboard?.gameTitle,
              genreLabel: storyboard?.genreLabel,
              hookText: storyboard?.hookText,
              accent: storyboard?.accent || '#4285F4'
            }),
            'utf8'
          );
        }

        const specJson = JSON.stringify(storyboard || {});
        const specBuf = Buffer.from(specJson, 'utf8');
        resolvedEngineId = requestedEngine.id;
        onProgress(85, isCarousel ? '4컷 가로 스크롤 메타데이터 확정 중' : '모션그래픽 타임라인·TTS 대본 확정 중');

        renderResult = {
          videoPath: null,
          posterPath: path.join(shortDir, posterFilename),
          mimeType: isCarousel
            ? 'application/vnd.playhub.shorts-carousel+json'
            : 'application/vnd.playhub.shorts-motion+json',
          bytes: specBuf.length,
          sha256: crypto.createHash('sha256').update(specBuf).digest('hex'),
          durationSec: durationSec || 8,
          width: requestedEngine.width || 720,
          height: requestedEngine.height || 1280,
          aspectRatio: requestedEngine.aspectRatio || '9:16',
          model: requestedEngine.model
        };
      } else if (requestedEngine.provider === 'google-veo') {
        const veoRenderer = customRenderers?.veo || generateShortsWithVeo;
        try {
          renderResult = await veoRenderer({
            engineId: requestedEngine.id,
            storyboard,
            keyframes,
            durationSec,
            outputVideoPath,
            outputPosterPath,
            onProgress,
            env,
            config: jobCtx.veoConfigOverride || config,
            fetchImpl
          });
          resolvedEngineId = requestedEngine.id;
        } catch (veoErr) {
          const canFallback = allowFallback && (customRenderers?.ffmpeg || detectFfmpegBinary(env).available);
          if (!canFallback) throw veoErr;
          resolvedEngineId = 'forge-motion-ffmpeg';
          onProgress(24, 'Veo 미연동/오류 감지 → PlayForge Motion 엔진으로 자동 전환 (20 PC 정산)');
          const ffRenderer = customRenderers?.ffmpeg || renderMotionShortsWithFfmpeg;
          renderResult = await ffRenderer({
            storyboard,
            keyframes,
            stylePreset,
            cameraMotion,
            durationSec,
            outputVideoPath,
            outputPosterPath,
            onProgress,
            env
          });
        }
      } else if (requestedEngine.provider === 'ffmpeg-motion' || requestedEngine.provider === 'image-shortform') {
        const ffRenderer = customRenderers?.ffmpeg || renderMotionShortsWithFfmpeg;
        renderResult = await ffRenderer({
          storyboard,
          keyframes,
          stylePreset,
          cameraMotion,
          durationSec,
          outputVideoPath,
          outputPosterPath,
          onProgress,
          env
        });
        resolvedEngineId = requestedEngine.id;
      } else if (requestedEngine.provider === 'video-shortform') {
        const vidRenderer = customRenderers?.videoShortform || renderUploadedVideoToShortform;
        try {
          renderResult = await vidRenderer({
            inputVideoPath: jobCtx.sourceVideoPath,
            storyboard,
            framingMode: jobCtx.framingMode || 'fit-blur',
            trimStartSec: jobCtx.trimStartSec || 0,
            durationSec,
            includeTts: jobCtx.includeTts !== false,
            keepOriginalAudio: jobCtx.keepOriginalAudio !== false,
            outputVideoPath,
            outputPosterPath,
            onProgress,
            env
          });
          resolvedEngineId = 'creator-video-shortform';
        } finally {
          if (jobCtx.sourceVideoPath) {
            try { fs.rmSync(jobCtx.sourceVideoPath, { force: true }); } catch {}
          }
        }
      } else {
        throw Object.assign(new Error('지원하지 않는 쇼츠 생성 엔진입니다.'), { code: 'ENGINE_UNSUPPORTED' });
      }

      const resolvedEngine = SHORTS_ENGINE_MAP[resolvedEngineId] || requestedEngine;
      const actualCoins = Math.min(quotedCoins, resolvedEngine.costCoins);
      let journalEntryId = null;

      if (holdId && quotedCoins > 0) {
        const settled = settleHold(db, {
          holdId,
          actualCoins,
          idempotencyKey: `shorts:settle:${shortId}`,
          now
        });
        journalEntryId = settled.entryId || null;
      }

      const posterFilename = renderResult.posterPath ? path.basename(renderResult.posterPath) : null;
      const videoRelPath = renderResult.videoPath ? `${shortId}/${path.basename(renderResult.videoPath)}` : null;
      const posterRelPath = posterFilename ? `${shortId}/${posterFilename}` : null;
      const stamp = now();
      const stageDone = resolvedEngine.provider === 'carousel-images'
        ? '가로 4컷 카드 생성 완료 · 허브 등록 가능'
        : resolvedEngine.provider === 'motion-graphic'
          ? '모션그래픽(무영상) 생성 완료 · 허브 등록 가능'
          : '쇼츠 생성 완료 · 허브 등록 가능';

      db.prepare(`
        UPDATE shorts_videos
        SET resolved_engine_id=?,
            engine_model=?,
            status='ready',
            progress=100,
            stage_label=?,
            error_code=NULL,
            error_message=NULL,
            video_rel_path=?,
            poster_rel_path=?,
            mime_type=?,
            bytes=?,
            sha256=?,
            duration_sec=?,
            width=?,
            height=?,
            aspect_ratio=?,
            charged_coins=?,
            billing_journal_entry_id=?,
            updated_at=?
        WHERE id=?
      `).run(
        resolvedEngineId,
        renderResult.model || resolvedEngine.model,
        stageDone,
        videoRelPath,
        posterRelPath,
        renderResult.mimeType || 'video/mp4',
        renderResult.bytes || 0,
        renderResult.sha256 || '',
        renderResult.durationSec || durationSec,
        renderResult.width || 720,
        renderResult.height || 1280,
        renderResult.aspectRatio || '9:16',
        actualCoins,
        journalEntryId,
        stamp,
        shortId
      );

      audit('shorts.generate_completed', shortId, {
        creatorId,
        requestedEngine: requestedEngine.id,
        resolvedEngineId,
        quotedCoins,
        chargedCoins: actualCoins,
        bytes: renderResult.bytes || 0
      });
    } catch (error) {
      // Automatically release held PlayCoins on failure — zero coin loss!
      if (holdId) {
        try {
          releaseHold(db, { holdId, now });
        } catch {}
      }
      const code = String(error?.code || 'SHORTS_RENDER_FAILED').slice(0, 64);
      const message = String(error?.message || '쇼츠 영상 생성에 실패했습니다. 예약된 PlayCoin이 자동 반환되었습니다.').slice(0, 280);
      try {
        db.prepare(`
          UPDATE shorts_videos
          SET status='failed',
              progress=0,
              stage_label='생성 실패 · PlayCoin 반환 완료',
              error_code=?,
              error_message=?,
              charged_coins=0,
              updated_at=?
          WHERE id=?
        `).run(code, message, now(), shortId);
      } catch {}
      try { fs.rmSync(shortDir, { recursive: true, force: true }); } catch {}
      audit('shorts.generate_failed', shortId, { creatorId, code, holdReleased: Boolean(holdId) });
    }
  }

  function pumpQueue() {
    if (closed) return;
    while (runningCount < MAX_CONCURRENCY && pendingQueue.length > 0) {
      const next = pendingQueue.shift();
      runningCount++;
      const promise = executeRenderJob(next.ctx)
        .finally(() => {
          runningCount--;
          activeJobs.delete(next.ctx.shortId);
          next.resolve();
          pumpQueue();
        });
      activeJobs.set(next.ctx.shortId, promise);
    }
  }

  function enqueueRenderJob(ctx) {
    let resolveDone;
    const donePromise = new Promise(resolve => { resolveDone = resolve; });
    pendingQueue.push({ ctx, resolve: resolveDone });
    pumpQueue();
    return donePromise;
  }

  async function startGeneration({
    creatorId,
    creatorName,
    body = {},
    idempotencyKey = null,
    sync = false
  }) {
    const engineId = safeString(body.engineId, 64) ? String(body.engineId).trim() : 'forge-motion-ffmpeg';
    const requestedEngine = SHORTS_ENGINE_MAP[engineId];
    if (!requestedEngine || requestedEngine.provider === 'direct-import') {
      throw new ApiError(422, 'ENGINE_INVALID', '유효한 AI 쇼츠 생성 엔진을 선택해 주세요.');
    }

    const gameId = body.gameId ? String(body.gameId).trim() : null;
    const projectId = body.projectId && PROJECT_ID_RE.test(String(body.projectId).trim())
      ? String(body.projectId).trim()
      : null;

    let boundGame = null;
    if (gameId) {
      const check = assertCanBindGame({ creatorId, gameId });
      boundGame = check.game;
    }

    const stylePreset = STYLE_PRESET_MAP[body.stylePreset] ? body.stylePreset : 'cinematic';
    const cameraMotion = CAMERA_MOTION_MAP[body.cameraMotion] ? body.cameraMotion : 'dynamic-zoom';
    const durationSec = Math.max(5, Math.min(12, Math.round(Number(body.durationSec) || requestedEngine.durationSec || 8)));
    const allowFallback = body.allowFallback !== false;

    const rawKeyframes = Array.isArray(body.keyframes) ? body.keyframes.slice(0, 3) : [];
    const keyframes = rawKeyframes
      .filter(k => k && typeof k.dataUrl === 'string' && k.dataUrl.startsWith('data:image/'))
      .map(k => ({ dataUrl: k.dataUrl, label: cleanText(k.label, 40) }));

    // Auto-resolve raster game cover from disk if creator supplied no keyframes
    if (!keyframes.length && gameId) {
      const coverPath = findCoverRasterOnDisk(gameId, boundGame);
      if (coverPath) keyframes.push({ filePath: coverPath, label: 'game-cover' });
    }

    const preset = gameId ? getPlaygroundPlanByGameId(gameId) : null;
    const storyboard = composeShortsStoryboard({
      game: boundGame,
      title: body.title || preset?.titleKo,
      prompt: body.prompt || preset?.playgroundConcept,
      stylePreset,
      cameraMotion,
      hookText: body.hookText || preset?.hookText,
      ctaText: body.ctaText || preset?.ctaText,
      topHeadline: body.topHeadline || preset?.topHeadline || null,
      narration: body.narration || preset?.narration || null,
      bestComment: body.bestComment || preset?.bestComment || null,
      carouselTitle: body.carouselTitle || preset?.carouselTitle || '',
      carouselSlides: body.carouselSlides || preset?.carouselSlides || null,
      durationSec,
      keyframeCount: keyframes.length
    });

    const title = cleanText(body.title, 80, storyboard.suggestedTitle);
    const caption = cleanText(body.caption, 280, storyboard.suggestedCaption);
    const hashtags = normalizeHashtags(body.hashtags, storyboard.hashtags);
    const prompt = cleanText(body.prompt, 600, '');
    const flowPrompt = cleanText(body.flowPrompt, 1200, storyboard.flowPrompt);
    storyboard.flowPrompt = flowPrompt;

    // Check creator's personal OAuth / BYOK Veo credentials first (0 PC when using own subscription/account!)
    const personalCreds = personalAiAuth.getCredentials(creatorId);
    const hasPersonalVeo = Boolean(
      personalCreds && (personalCreds.geminiApiKey || (personalCreds.vertexProject && personalCreds.vertexAccessToken))
    );
    const veoConfigOverride = hasPersonalVeo
      ? {
          ...config,
          shorts: {
            ...(config.shorts || {}),
            geminiApiKey: personalCreds.geminiApiKey || '',
            vertexProject: personalCreds.vertexProject || '',
            vertexLocation: personalCreds.vertexLocation || 'us-central1',
            vertexAccessToken: personalCreds.vertexAccessToken || ''
          }
        }
      : null;

    // Pre-resolve effective quote: if Veo isn't configured & no custom Veo renderer is injected,
    // immediately quote fallback engine (20 PC) when allowFallback=true so creators aren't over-held.
    const veoCfg = detectVeoConfig(env, veoConfigOverride || config);
    const ffmpegCfg = detectFfmpegBinary(env);
    let effectiveEngine = requestedEngine;
    if (requestedEngine.provider === 'google-veo' && !veoCfg.configured && !customRenderers?.veo) {
      if (!allowFallback) {
        throw new ApiError(503, 'VEO_NOT_CONFIGURED', 'Google Flow / Veo API 키가 설정되지 않았습니다. 개인 AI OAuth를 연결하거나 자동 폴백을 이용해 주세요.');
      }
      if (!ffmpegCfg.available && !customRenderers?.ffmpeg) {
        throw new ApiError(503, 'SHORTS_ENGINE_UNAVAILABLE', '사용 가능한 영상 렌더링 엔진이 없습니다.');
      }
      effectiveEngine = SHORTS_ENGINE_MAP['forge-motion-ffmpeg'];
    } else if (requestedEngine.provider === 'ffmpeg-motion' && !ffmpegCfg.available && !customRenderers?.ffmpeg) {
      throw new ApiError(503, 'FFMPEG_UNAVAILABLE', '서버에 FFmpeg가 설치되어 있지 않습니다.');
    }

    storyboard.renderMode = effectiveEngine.renderMode || 'generative-video';
    storyboard.motionSpec = {
      coverUrl: boundGame?.coverUrl || preset?.coverUrl || (gameId ? `/games/${gameId}/assets/platform-cover.png` : null),
      accent: storyboard.accent || '#4285F4',
      cameraMotion,
      stylePreset,
      durationSec
    };

    const usingPersonalVeo = effectiveEngine.provider === 'google-veo' && hasPersonalVeo;
    const quotedCoins = usingPersonalVeo ? 0 : effectiveEngine.costCoins;
    const idemKey = safeString(idempotencyKey, 128) ? idempotencyKey.trim() : null;
    const idemBodySignature = {
      engineId: requestedEngine.id,
      effectiveEngineId: effectiveEngine.id,
      gameId,
      projectId,
      title,
      prompt,
      stylePreset,
      cameraMotion,
      durationSec
    };

    const prep = transaction(db, () => {
      if (idemKey) {
        const hit = readShortsIdempotency(db, {
          scope: 'shorts.generate',
          idempotencyKey: idemKey,
          principalId: creatorId,
          requestBody: idemBodySignature
        });
        if (hit?.hit) return { replayed: true, statusCode: hit.statusCode, body: hit.body };
      }

      const shortId = newShortId();
      let hold = null;
      let wallet = getWallet(db, creatorId, now);

      if (quotedCoins > 0) {
        const reserved = reserveHold(db, {
          principalId: creatorId,
          amountCoins: quotedCoins,
          sinkType: 'ai_shorts_generation',
          sinkRefId: shortId,
          idempotencyKey: idemKey ? `shorts:hold:${creatorId}:${idemKey}` : `shorts:hold:${shortId}`,
          ttlMs: 15 * 60000,
          now
        });
        hold = reserved.hold;
        wallet = reserved.wallet;
      }

      const stamp = now();
      db.prepare(`
        INSERT INTO shorts_videos(
          id, creator_id, creator_name, game_id, project_id, title, caption, hashtags_json,
          prompt, flow_prompt, style_preset, camera_motion, storyboard_json,
          engine_id, resolved_engine_id, engine_model, status, visibility, is_primary,
          progress, stage_label, quoted_coins, charged_coins, billing_hold_id,
          created_at, updated_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'queued','draft',0,5,?,?,0,?,?,?)
      `).run(
        shortId,
        creatorId,
        cleanText(creatorName, 80, 'PlayForge 크리에이터'),
        gameId,
        projectId,
        title,
        caption,
        JSON.stringify(hashtags),
        prompt,
        flowPrompt,
        stylePreset,
        cameraMotion,
        JSON.stringify(storyboard),
        requestedEngine.id,
        effectiveEngine.id,
        effectiveEngine.model,
        quotedCoins > 0 ? `${quotedCoins} PlayCoin 예약 완료 · 생성 대기 중` : '생성 대기 중',
        quotedCoins,
        hold?.id || null,
        stamp,
        stamp
      );

      const row = db.prepare('SELECT * FROM shorts_videos WHERE id=?').get(shortId);
      const { byId } = catalogMap();
      const responsePayload = {
        ok: true,
        short: formatShort(row, { byId }),
        wallet,
        hold: hold ? { id: hold.id, amountCoins: hold.amount_coins, state: hold.state } : null
      };

      if (idemKey) {
        writeShortsIdempotency(db, {
          scope: 'shorts.generate',
          idempotencyKey: idemKey,
          principalId: creatorId,
          requestHash: readShortsIdempotency(db, {
            scope: 'shorts.generate',
            idempotencyKey: idemKey,
            principalId: creatorId,
            requestBody: idemBodySignature
          }).requestHash,
          statusCode: 202,
          body: responsePayload,
          now
        });
      }

      audit('shorts.generate_started', shortId, {
        creatorId,
        gameId,
        requestedEngine: requestedEngine.id,
        effectiveEngine: effectiveEngine.id,
        quotedCoins,
        holdId: hold?.id || null
      });

      return {
        replayed: false,
        shortId,
        holdId: hold?.id || null,
        responsePayload
      };
    });

    if (prep.replayed) {
      return { statusCode: 200, body: { ...prep.body, replayed: true } };
    }

    const donePromise = enqueueRenderJob({
      shortId: prep.shortId,
      creatorId,
      requestedEngine: effectiveEngine,
      allowFallback,
      storyboard,
      keyframes,
      stylePreset,
      cameraMotion,
      durationSec,
      veoConfigOverride,
      holdId: prep.holdId,
      quotedCoins
    });

    if (sync) {
      await donePromise;
      const latest = db.prepare('SELECT * FROM shorts_videos WHERE id=?').get(prep.shortId);
      const { byId } = catalogMap();
      return {
        statusCode: latest?.status === 'failed' ? 500 : 201,
        body: {
          ok: latest?.status !== 'failed',
          short: latest ? formatShort(latest, { byId }) : prep.responsePayload.short,
          wallet: getWallet(db, creatorId, now)
        }
      };
    }

    return { statusCode: 202, body: prep.responsePayload };
  }

  async function importFlowVideo({
    creatorId,
    creatorName,
    videoBuffer,
    meta = {}
  }) {
    if (!Buffer.isBuffer(videoBuffer) || videoBuffer.length === 0) {
      throw new ApiError(422, 'VIDEO_REQUIRED', '업로드할 MP4 또는 WebM 영상 파일이 필요합니다.');
    }
    if (videoBuffer.length > MAX_VIDEO_UPLOAD_BYTES) {
      throw new ApiError(413, 'VIDEO_TOO_LARGE', '쇼츠 영상은 최대 40MB까지 업로드할 수 있습니다.');
    }
    const validation = validateVideoBuffer(videoBuffer);
    if (!validation.valid) {
      throw new ApiError(422, validation.reason, '유효한 MP4 또는 WebM 영상 파일만 등록할 수 있습니다.');
    }

    const gameId = meta.gameId ? String(meta.gameId).trim() : null;
    const projectId = meta.projectId && PROJECT_ID_RE.test(String(meta.projectId).trim())
      ? String(meta.projectId).trim()
      : null;
    let boundGame = null;
    if (gameId) {
      boundGame = assertCanBindGame({ creatorId, gameId }).game;
    }

    const shortId = newShortId();
    const shortDir = path.join(mediaRoot, shortId);
    fs.mkdirSync(shortDir, { recursive: true });
    const videoFilename = 'video' + validation.ext;
    const videoPath = path.join(shortDir, videoFilename);
    const posterJpgPath = path.join(shortDir, 'poster.jpg');

    writeAtomic(videoPath, videoBuffer);

    const extracted = await extractPosterFromVideo(videoPath, posterJpgPath, env);
    let posterRelPath = `${shortId}/poster.jpg`;
    const gameTitle = cleanText(meta.title, 80, localizeValue(boundGame?.title) || 'Google Flow 게임 쇼츠');
    if (!extracted) {
      const svgPath = path.join(shortDir, 'poster.svg');
      writeAtomic(svgPath, buildFallbackPosterSvg({
        title: gameTitle,
        genreLabel: 'Google Flow',
        hookText: cleanText(meta.caption, 42, 'PlayHub 게임 소개 쇼츠')
      }));
      posterRelPath = `${shortId}/poster.svg`;
    }

    const probed = await probeVideoFile(videoPath, env);
    const caption = cleanText(meta.caption, 280, '');
    const hashtags = normalizeHashtags(meta.hashtags, ['GoogleFlow']);
    const flowPrompt = cleanText(meta.flowPrompt || meta.prompt, 1200, '');
    const stamp = now();

    db.prepare(`
      INSERT INTO shorts_videos(
        id, creator_id, creator_name, game_id, project_id, title, caption, hashtags_json,
        prompt, flow_prompt, style_preset, camera_motion, storyboard_json,
        engine_id, resolved_engine_id, engine_model, status, visibility, is_primary,
        progress, stage_label, video_rel_path, poster_rel_path, mime_type, bytes, sha256,
        duration_sec, width, height, aspect_ratio, quoted_coins, charged_coins,
        created_at, updated_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'flow-import','flow-import','google-flow-web-upload','ready','draft',0,100,'Google Flow 영상 가져오기 완료',?,?,?,?,?,?,?,?,?,0,0,?,?)
    `).run(
      shortId,
      creatorId,
      cleanText(creatorName, 80, 'PlayForge 크리에이터'),
      gameId,
      projectId,
      gameTitle,
      caption,
      JSON.stringify(hashtags),
      cleanText(meta.prompt, 600, ''),
      flowPrompt,
      STYLE_PRESET_MAP[meta.stylePreset] ? meta.stylePreset : 'cinematic',
      CAMERA_MOTION_MAP[meta.cameraMotion] ? meta.cameraMotion : 'dynamic-zoom',
      JSON.stringify({ source: 'google-flow-import' }),
      `${shortId}/${videoFilename}`,
      posterRelPath,
      validation.mimeType,
      validation.bytes,
      validation.sha256,
      probed.durationSec || 8,
      probed.width || 720,
      probed.height || 1280,
      probed.width && probed.height && probed.width > probed.height ? '16:9' : '9:16',
      stamp,
      stamp
    );

    audit('shorts.import_completed', shortId, { creatorId, gameId, bytes: validation.bytes, mimeType: validation.mimeType });
    const row = db.prepare('SELECT * FROM shorts_videos WHERE id=?').get(shortId);
    const { byId } = catalogMap();
    return { ok: true, short: formatShort(row, { byId }), wallet: getWallet(db, creatorId, now) };
  }

  /**
   * Direct Creator Media Short-Form Pipeline (0 PC):
   * Turns creator-recorded video (MP4/WebM) OR creator-uploaded screenshots (1..6 images)
   * into a finished 9:16 Short-Form (with 2-line headline, yellow narration subtitles, Korean TTS)
   * or into a 0MB Motion Graphic / YouTube Horizontal N-Cut Image Carousel.
   */
  async function createShortformFromMedia({
    creatorId,
    creatorName,
    body = {},
    sync = false
  }) {
    const mediaKind = body.mediaKind === 'images' ? 'images' : 'video';
    const gameId = body.gameId ? String(body.gameId).trim() : null;
    const projectId = body.projectId && PROJECT_ID_RE.test(String(body.projectId).trim())
      ? String(body.projectId).trim()
      : null;

    let boundGame = null;
    if (gameId) {
      boundGame = assertCanBindGame({ creatorId, gameId }).game;
    }

    const preset = gameId ? getPlaygroundPlanByGameId(gameId) : null;
    const stylePreset = STYLE_PRESET_MAP[body.stylePreset] ? body.stylePreset : 'google-playground';
    const cameraMotion = CAMERA_MOTION_MAP[body.cameraMotion] ? body.cameraMotion : 'dynamic-zoom';
    const durationSec = Math.max(3, Math.min(15, Math.round(Number(body.durationSec) || 8)));
    const parsedNarration = Array.isArray(body.narration) && body.narration.length
      ? body.narration
      : parseNarrationLines(body.narrationLines, durationSec);

    const topHeadline = (body.topHeadline && (body.topHeadline.line1 || body.topHeadline.line2))
      ? body.topHeadline
      : (body.headlineLine1 || body.headlineLine2
        ? { line1: body.headlineLine1, line2: body.headlineLine2 }
        : (preset?.topHeadline || null));

    const shortId = newShortId();
    const shortDir = path.join(mediaRoot, shortId);
    fs.mkdirSync(shortDir, { recursive: true });
    const stamp = now();

    if (mediaKind === 'video') {
      const ffmpegCfg = detectFfmpegBinary(env);
      if (!ffmpegCfg.available && !customRenderers?.videoShortform) {
        fs.rmSync(shortDir, { recursive: true, force: true });
        throw new ApiError(503, 'FFMPEG_UNAVAILABLE', '서버에 FFmpeg가 설치되어 있지 않아 촬영 영상 숏폼화를 실행할 수 없습니다.');
      }

      const rawB64 = String(body.videoBase64 || '').replace(/^data:video\/[a-z0-9.+-]+;base64,/i, '').replace(/\s+/g, '');
      if (!rawB64) {
        fs.rmSync(shortDir, { recursive: true, force: true });
        throw new ApiError(422, 'VIDEO_REQUIRED', '숏폼화할 MP4 또는 WebM 촬영 영상을 업로드해 주세요.');
      }
      const videoBuffer = Buffer.from(rawB64, 'base64');
      if (videoBuffer.length > MAX_VIDEO_UPLOAD_BYTES) {
        fs.rmSync(shortDir, { recursive: true, force: true });
        throw new ApiError(413, 'VIDEO_TOO_LARGE', '촬영 영상은 최대 40MB까지 업로드할 수 있습니다.');
      }
      const validation = validateVideoBuffer(videoBuffer);
      if (!validation.valid) {
        fs.rmSync(shortDir, { recursive: true, force: true });
        throw new ApiError(422, validation.reason, '유효한 MP4 또는 WebM 영상 파일만 숏폼화할 수 있습니다.');
      }

      const sourceVideoPath = path.join(shortDir, `source${validation.ext}`);
      writeAtomic(sourceVideoPath, videoBuffer);

      const storyboard = composeShortsStoryboard({
        game: boundGame,
        title: body.title || preset?.titleKo,
        prompt: body.prompt || body.caption || preset?.playgroundConcept,
        stylePreset,
        cameraMotion,
        hookText: body.hookText || parsedNarration?.[0]?.text || preset?.hookText,
        ctaText: body.ctaText || preset?.ctaText,
        topHeadline,
        narration: parsedNarration || preset?.narration || null,
        bestComment: body.bestComment || preset?.bestComment || null,
        durationSec,
        keyframeCount: 0
      });
      storyboard.renderMode = 'generative-video';
      storyboard.sourceKind = 'creator-video';

      const title = cleanText(body.title, 80, `${storyboard.gameTitle} · 직접 촬영 숏폼`);
      const caption = cleanText(body.caption, 280, storyboard.suggestedCaption);
      const hashtags = normalizeHashtags(body.hashtags, [...storyboard.hashtags, '직접촬영', '숏폼편집']);
      const framingMode = body.framingMode === 'crop-fill' ? 'crop-fill' : 'fit-blur';
      const trimStartSec = Math.max(0, Number(body.trimStartSec) || 0);
      const includeTts = body.includeTts !== false;
      const keepOriginalAudio = body.keepOriginalAudio !== false;

      db.prepare(`
        INSERT INTO shorts_videos(
          id, creator_id, creator_name, game_id, project_id, title, caption, hashtags_json,
          prompt, flow_prompt, style_preset, camera_motion, storyboard_json,
          engine_id, resolved_engine_id, engine_model, status, visibility, is_primary,
          progress, stage_label, quoted_coins, charged_coins,
          created_at, updated_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'creator-video-shortform','creator-video-shortform','ffmpeg-creator-video-shortform-v1','queued','draft',0,10,'촬영 영상 자막·나래이션 합성 대기 중',0,0,?,?)
      `).run(
        shortId,
        creatorId,
        cleanText(creatorName, 80, 'PlayForge 크리에이터'),
        gameId,
        projectId,
        title,
        caption,
        JSON.stringify(hashtags),
        cleanText(body.prompt, 600, ''),
        storyboard.flowPrompt,
        stylePreset,
        cameraMotion,
        JSON.stringify(storyboard),
        stamp,
        stamp
      );

      audit('shorts.shortform_video_started', shortId, { creatorId, gameId, framingMode, includeTts, keepOriginalAudio, bytes: validation.bytes });

      const donePromise = enqueueRenderJob({
        shortId,
        creatorId,
        requestedEngine: SHORTS_ENGINE_MAP['creator-video-shortform'],
        allowFallback: false,
        storyboard,
        keyframes: [],
        sourceVideoPath,
        framingMode,
        trimStartSec,
        includeTts,
        keepOriginalAudio,
        stylePreset,
        cameraMotion,
        durationSec,
        holdId: null,
        quotedCoins: 0
      });

      if (sync) {
        await donePromise;
        const latest = db.prepare('SELECT * FROM shorts_videos WHERE id=?').get(shortId);
        const { byId } = catalogMap();
        return {
          statusCode: latest?.status === 'failed' ? 500 : 201,
          body: { ok: latest?.status !== 'failed', short: formatShort(latest, { byId }), wallet: getWallet(db, creatorId, now) }
        };
      }
      const row = db.prepare('SELECT * FROM shorts_videos WHERE id=?').get(shortId);
      const { byId } = catalogMap();
      return { statusCode: 202, body: { ok: true, short: formatShort(row, { byId }), wallet: getWallet(db, creatorId, now) } };
    }

    // mediaKind === 'images': Creator uploads 1..6 screenshots -> MP4 / Motion Graphic / YouTube N-Cut Carousel!
    const rawImages = Array.isArray(body.images) ? body.images.slice(0, 6) : [];
    const savedSlides = [];
    for (let i = 0; i < rawImages.length; i++) {
      const item = rawImages[i];
      const dataUrl = typeof item === 'string' ? item : item?.dataUrl;
      const decoded = decodeDataUrlImage(dataUrl);
      if (!decoded) continue;
      const filename = `slide_${savedSlides.length}${decoded.ext}`;
      const filePath = path.join(shortDir, filename);
      writeAtomic(filePath, decoded.buffer);
      savedSlides.push({
        index: savedSlides.length,
        filename,
        filePath,
        ext: decoded.ext,
        url: `/api/shorts/${shortId}/slide/${savedSlides.length}`,
        badge: typeof item === 'object' ? cleanText(item.badge, 24) : '',
        headline: typeof item === 'object' ? cleanText(item.headline, 44) : '',
        caption: typeof item === 'object' ? cleanText(item.caption, 64) : '',
        narration: typeof item === 'object' ? cleanText(item.narration, 60) : ''
      });
    }
    if (!savedSlides.length) {
      fs.rmSync(shortDir, { recursive: true, force: true });
      throw new ApiError(422, 'IMAGES_REQUIRED', '숏폼화할 PNG/JPG/WebP 이미지를 1장 이상 업로드해 주세요.');
    }

    // Copy first image as poster
    const posterFilename = `poster${savedSlides[0].ext}`;
    fs.copyFileSync(savedSlides[0].filePath, path.join(shortDir, posterFilename));
    const posterRelPath = `${shortId}/${posterFilename}`;

    const outputFormat = ['motion-graphic', 'carousel-images', 'generative-video'].includes(body.outputFormat)
      ? body.outputFormat
      : 'generative-video';

    const accents = ['#4285F4', '#EA4335', '#FBBC04', '#34A853', '#7C3AED', '#00B8D9'];
    const customSlides = savedSlides.map((sl, i) => ({
      index: i + 1,
      badge: sl.badge || `${i + 1}/${savedSlides.length} · 컷 ${i + 1}`,
      headline: sl.headline || parsedNarration?.[i]?.text || (i === savedSlides.length - 1 ? (body.ctaText || 'PlayHub에서 바로 플레이 ▶') : `${boundGame ? localizeValue(boundGame.title) : (body.title || '내 게임')} 하이라이트 ${i + 1}`),
      caption: sl.caption || (body.caption ? cleanText(body.caption, 56) : '직접 촬영한 플레이 스크린샷 숏폼'),
      narration: sl.narration || parsedNarration?.[i]?.text || sl.headline || `컷 ${i + 1} 장면입니다.`,
      imageUrl: sl.url,
      zoomOrigin: '50% 50%',
      cropScale: 1.0,
      filterCss: 'contrast(1.04) saturate(1.08)',
      accent: accents[i % accents.length]
    }));

    const storyboard = composeShortsStoryboard({
      game: boundGame,
      title: body.title || preset?.titleKo,
      prompt: body.prompt || body.caption || preset?.playgroundConcept,
      stylePreset,
      cameraMotion,
      hookText: body.hookText || parsedNarration?.[0]?.text || customSlides[0]?.headline,
      ctaText: body.ctaText || preset?.ctaText,
      topHeadline,
      narration: parsedNarration || customSlides.map((sl, idx) => ({
        startSec: Number(((idx * durationSec) / customSlides.length).toFixed(2)),
        endSec: Number((((idx + 1) * durationSec) / customSlides.length).toFixed(2)),
        text: sl.narration
      })),
      bestComment: body.bestComment || preset?.bestComment || null,
      carouselTitle: body.carouselTitle || body.title || preset?.carouselTitle || `${boundGame ? localizeValue(boundGame.title) : '내 게임'} ${savedSlides.length}컷 하이라이트`,
      carouselSlides: customSlides,
      durationSec,
      keyframeCount: savedSlides.length
    });
    storyboard.renderMode = outputFormat;
    storyboard.sourceKind = 'creator-images';
    storyboard.motionSpec = {
      coverUrl: savedSlides[0].url,
      frameUrls: savedSlides.map(sl => sl.url),
      accent: storyboard.accent || '#4285F4',
      cameraMotion,
      stylePreset,
      durationSec
    };

    const title = cleanText(body.title, 80, outputFormat === 'carousel-images' ? storyboard.carouselTitle : `${storyboard.gameTitle} · 내 이미지 숏폼`);
    const caption = cleanText(body.caption, 280, storyboard.suggestedCaption);
    const hashtags = normalizeHashtags(body.hashtags, [...storyboard.hashtags, '내스크린샷', '숏폼편집']);

    // Instant completion for non-video outputs (motion-graphic / carousel-images)
    if (outputFormat === 'motion-graphic' || outputFormat === 'carousel-images') {
      const resolvedId = outputFormat === 'carousel-images' ? 'youtube-carousel-web' : 'motion-graphic-web';
      const resolvedEng = SHORTS_ENGINE_MAP[resolvedId];
      const specBuf = Buffer.from(JSON.stringify(storyboard), 'utf8');
      const mime = outputFormat === 'carousel-images'
        ? 'application/vnd.playhub.shorts-carousel+json'
        : 'application/vnd.playhub.shorts-motion+json';
      const stageLabel = outputFormat === 'carousel-images'
        ? `내 이미지 ${savedSlides.length}컷 가로 스크롤 카드 완성 · 허브 등록 가능`
        : `내 이미지 ${savedSlides.length}장 무영상 모션그래픽 완성 · 허브 등록 가능`;

      db.prepare(`
        INSERT INTO shorts_videos(
          id, creator_id, creator_name, game_id, project_id, title, caption, hashtags_json,
          prompt, flow_prompt, style_preset, camera_motion, storyboard_json,
          engine_id, resolved_engine_id, engine_model, status, visibility, is_primary,
          progress, stage_label, video_rel_path, poster_rel_path, mime_type, bytes, sha256,
          duration_sec, width, height, aspect_ratio, quoted_coins, charged_coins,
          created_at, updated_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'creator-images-shortform',?,?,'ready','draft',0,100,?,NULL,?,?,?,?,?,?,?,?,0,0,?,?)
      `).run(
        shortId,
        creatorId,
        cleanText(creatorName, 80, 'PlayForge 크리에이터'),
        gameId,
        projectId,
        title,
        caption,
        JSON.stringify(hashtags),
        cleanText(body.prompt, 600, ''),
        storyboard.flowPrompt,
        stylePreset,
        cameraMotion,
        JSON.stringify(storyboard),
        resolvedId,
        resolvedEng.model,
        stageLabel,
        posterRelPath,
        mime,
        specBuf.length,
        crypto.createHash('sha256').update(specBuf).digest('hex'),
        durationSec,
        resolvedEng.width,
        resolvedEng.height,
        resolvedEng.aspectRatio,
        stamp,
        stamp
      );

      audit('shorts.shortform_images_completed', shortId, { creatorId, gameId, outputFormat, slideCount: savedSlides.length });
      const row = db.prepare('SELECT * FROM shorts_videos WHERE id=?').get(shortId);
      const { byId } = catalogMap();
      return { statusCode: 201, body: { ok: true, short: formatShort(row, { byId }), wallet: getWallet(db, creatorId, now) } };
    }

    // outputFormat === 'generative-video': Render real 9:16 MP4 slideshow + yellow subtitles + Korean TTS!
    const ffmpegCfg = detectFfmpegBinary(env);
    if (!ffmpegCfg.available && !customRenderers?.ffmpeg) {
      fs.rmSync(shortDir, { recursive: true, force: true });
      throw new ApiError(503, 'FFMPEG_UNAVAILABLE', '서버에 FFmpeg가 설치되어 있지 않아 MP4 합성을 실행할 수 없습니다. 무영상 모션그래픽 또는 가로 4컷을 선택해 주세요.');
    }

    db.prepare(`
      INSERT INTO shorts_videos(
        id, creator_id, creator_name, game_id, project_id, title, caption, hashtags_json,
        prompt, flow_prompt, style_preset, camera_motion, storyboard_json,
        engine_id, resolved_engine_id, engine_model, status, visibility, is_primary,
        progress, stage_label, quoted_coins, charged_coins,
        created_at, updated_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'creator-images-shortform','creator-images-shortform','ffmpeg-creator-images-shortform-v1','queued','draft',0,10,'내 이미지 9:16 MP4 + 나래이션 합성 대기 중',0,0,?,?)
    `).run(
      shortId,
      creatorId,
      cleanText(creatorName, 80, 'PlayForge 크리에이터'),
      gameId,
      projectId,
      title,
      caption,
      JSON.stringify(hashtags),
      cleanText(body.prompt, 600, ''),
      storyboard.flowPrompt,
      stylePreset,
      cameraMotion,
      JSON.stringify(storyboard),
      stamp,
      stamp
    );

    audit('shorts.shortform_images_mp4_started', shortId, { creatorId, gameId, slideCount: savedSlides.length });

    const donePromise = enqueueRenderJob({
      shortId,
      creatorId,
      requestedEngine: SHORTS_ENGINE_MAP['creator-images-shortform'],
      allowFallback: false,
      storyboard,
      keyframes: savedSlides.map(sl => ({ filePath: sl.filePath, label: sl.badge })),
      stylePreset,
      cameraMotion,
      durationSec,
      holdId: null,
      quotedCoins: 0
    });

    if (sync) {
      await donePromise;
      const latest = db.prepare('SELECT * FROM shorts_videos WHERE id=?').get(shortId);
      const { byId } = catalogMap();
      return {
        statusCode: latest?.status === 'failed' ? 500 : 201,
        body: { ok: latest?.status !== 'failed', short: formatShort(latest, { byId }), wallet: getWallet(db, creatorId, now) }
      };
    }
    const row = db.prepare('SELECT * FROM shorts_videos WHERE id=?').get(shortId);
    const { byId } = catalogMap();
    return { statusCode: 202, body: { ok: true, short: formatShort(row, { byId }), wallet: getWallet(db, creatorId, now) } };
  }

  function publishShort({ shortId, creatorId, body = {}, isAdmin = false }) {
    if (!SHORT_ID_RE.test(shortId)) throw new ApiError(400, 'SHORT_ID_INVALID');
    const row = db.prepare('SELECT * FROM shorts_videos WHERE id=?').get(shortId);
    if (!row || row.status === 'deleted') throw new ApiError(404, 'SHORT_NOT_FOUND');
    if (!isAdmin && row.creator_id !== creatorId) throw new ApiError(403, 'SHORT_OWNERSHIP_FORBIDDEN');
    const playable = Boolean(row.video_rel_path) || isNonVideoEngine(row.resolved_engine_id || row.engine_id);
    if (!['ready', 'published', 'unpublished'].includes(row.status) || !playable) {
      throw new ApiError(409, 'SHORT_NOT_READY', '쇼츠 생성이 완료된 뒤 허브에 등록할 수 있습니다.');
    }

    const targetGameId = body.gameId ? String(body.gameId).trim() : row.game_id;
    if (!targetGameId) {
      throw new ApiError(422, 'GAME_ID_REQUIRED', '소개 영상을 등록할 내 게임을 선택해 주세요.');
    }
    assertCanBindGame({ creatorId, gameId: targetGameId, isAdmin });

    const title = body.title !== undefined ? cleanText(body.title, 80, row.title) : row.title;
    const caption = body.caption !== undefined ? cleanText(body.caption, 280, '') : row.caption;
    const hashtags = body.hashtags !== undefined
      ? normalizeHashtags(body.hashtags, [])
      : (() => { try { return JSON.parse(row.hashtags_json || '[]'); } catch { return []; } })();
    const visibility = ['public', 'unlisted'].includes(body.visibility) ? body.visibility : 'public';
    const makePrimary = body.isPrimary !== false; // default true on first publish unless explicitly false
    const stamp = now();

    transaction(db, () => {
      if (makePrimary) {
        db.prepare('UPDATE shorts_videos SET is_primary=0, updated_at=? WHERE game_id=? AND id!=?').run(stamp, targetGameId, shortId);
      }
      db.prepare(`
        UPDATE shorts_videos
        SET game_id=?, title=?, caption=?, hashtags_json=?, status='published', visibility=?,
            is_primary=?, published_at=COALESCE(published_at, ?), updated_at=?
        WHERE id=?
      `).run(targetGameId, title, caption, JSON.stringify(hashtags), visibility, makePrimary ? 1 : 0, stamp, stamp, shortId);
    });

    audit('shorts.published', shortId, { creatorId, gameId: targetGameId, visibility, isPrimary: makePrimary });
    const updated = db.prepare('SELECT * FROM shorts_videos WHERE id=?').get(shortId);
    const { byId } = catalogMap();
    return { ok: true, short: formatShort(updated, { byId }) };
  }

  function updateShort({ shortId, creatorId, body = {}, isAdmin = false }) {
    if (!SHORT_ID_RE.test(shortId)) throw new ApiError(400, 'SHORT_ID_INVALID');
    const row = db.prepare('SELECT * FROM shorts_videos WHERE id=?').get(shortId);
    if (!row || row.status === 'deleted') throw new ApiError(404, 'SHORT_NOT_FOUND');
    if (!isAdmin && row.creator_id !== creatorId) throw new ApiError(403, 'SHORT_OWNERSHIP_FORBIDDEN');

    const nextTitle = body.title !== undefined ? cleanText(body.title, 80, row.title) : row.title;
    const nextCaption = body.caption !== undefined ? cleanText(body.caption, 280, '') : row.caption;
    const nextHashtags = body.hashtags !== undefined
      ? JSON.stringify(normalizeHashtags(body.hashtags, []))
      : row.hashtags_json;
    let nextStatus = row.status;
    let nextVisibility = row.visibility;
    if (body.status === 'unpublished') {
      nextStatus = 'unpublished';
      nextVisibility = 'draft';
    } else if (body.status === 'published') {
      const playable = Boolean(row.video_rel_path) || isNonVideoEngine(row.resolved_engine_id || row.engine_id);
      if (!playable || !row.game_id) {
        throw new ApiError(409, 'SHORT_NOT_PUBLISHABLE', '게임과 쇼츠 데이터가 준비된 항목만 공개할 수 있습니다.');
      }
      assertCanBindGame({ creatorId, gameId: row.game_id, isAdmin });
      nextStatus = 'published';
      nextVisibility = ['public', 'unlisted'].includes(body.visibility) ? body.visibility : 'public';
    } else if (body.visibility && ['public', 'unlisted', 'draft'].includes(body.visibility) && nextStatus === 'published') {
      nextVisibility = body.visibility === 'draft' ? 'unlisted' : body.visibility;
    }

    const setPrimary = body.isPrimary === true;
    const clearPrimary = body.isPrimary === false;
    const stamp = now();

    transaction(db, () => {
      if (setPrimary && row.game_id) {
        db.prepare('UPDATE shorts_videos SET is_primary=0, updated_at=? WHERE game_id=? AND id!=?').run(stamp, row.game_id, shortId);
      }
      db.prepare(`
        UPDATE shorts_videos
        SET title=?, caption=?, hashtags_json=?, status=?, visibility=?,
            is_primary=?, published_at=CASE WHEN ?='published' THEN COALESCE(published_at, ?) ELSE published_at END,
            updated_at=?
        WHERE id=?
      `).run(
        nextTitle,
        nextCaption,
        nextHashtags,
        nextStatus,
        nextVisibility,
        setPrimary ? 1 : (clearPrimary ? 0 : row.is_primary),
        nextStatus,
        stamp,
        stamp,
        shortId
      );
    });

    audit('shorts.updated', shortId, { creatorId, isAdmin, status: nextStatus, isPrimary: setPrimary ? true : row.is_primary === 1 });
    const updated = db.prepare('SELECT * FROM shorts_videos WHERE id=?').get(shortId);
    const { byId } = catalogMap();
    return { ok: true, short: formatShort(updated, { byId }) };
  }

  function deleteShort({ shortId, creatorId, isAdmin = false }) {
    if (!SHORT_ID_RE.test(shortId)) throw new ApiError(400, 'SHORT_ID_INVALID');
    const row = db.prepare('SELECT * FROM shorts_videos WHERE id=?').get(shortId);
    if (!row || row.status === 'deleted') throw new ApiError(404, 'SHORT_NOT_FOUND');
    if (!isAdmin && row.creator_id !== creatorId) throw new ApiError(403, 'SHORT_OWNERSHIP_FORBIDDEN');

    if (row.billing_hold_id && ['queued', 'rendering'].includes(row.status)) {
      try { releaseHold(db, { holdId: row.billing_hold_id, now }); } catch {}
    }

    db.prepare(`
      UPDATE shorts_videos
      SET status='deleted', visibility='draft', is_primary=0, video_rel_path=NULL, poster_rel_path=NULL, updated_at=?
      WHERE id=?
    `).run(now(), shortId);

    const shortDir = path.join(mediaRoot, shortId);
    if (insideDir(mediaRoot, shortDir)) {
      try { fs.rmSync(shortDir, { recursive: true, force: true }); } catch {}
    }
    audit('shorts.deleted', shortId, { creatorId, isAdmin });
    return { ok: true, deletedId: shortId };
  }

  function listPublicFeed({ gameId = null, genre = null, format = null, creatorId = null, sort = 'latest', limit = 20, offset = 0, viewerPrincipalId = null } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 60);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const orderClause = sort === 'popular'
      ? 'like_count DESC, view_count DESC, published_at DESC, created_at DESC'
      : 'published_at DESC, created_at DESC';

    const where = [
      "status='published'",
      "visibility='public'",
      "(video_rel_path IS NOT NULL OR resolved_engine_id IN ('motion-graphic-web','youtube-carousel-web'))"
    ];
    const params = [];
    if (gameId && GAME_ID_RE.test(gameId)) {
      where.push('game_id=?');
      params.push(gameId);
    }
    if (format === 'motion-graphic') {
      where.push("resolved_engine_id='motion-graphic-web'");
    } else if (format === 'carousel-images') {
      where.push("resolved_engine_id='youtube-carousel-web'");
    } else if (format === 'generative-video') {
      where.push("video_rel_path IS NOT NULL AND resolved_engine_id NOT IN ('motion-graphic-web','youtube-carousel-web')");
    }
    if (creatorId) {
      where.push('creator_id=?');
      params.push(creatorId);
    }

    const rows = db.prepare(`
      SELECT * FROM shorts_videos
      WHERE ${where.join(' AND ')}
      ORDER BY ${orderClause}
      LIMIT ? OFFSET ?
    `).all(...params, safeLimit + 1, safeOffset);

    const { byId } = catalogMap();
    let filtered = rows;
    if (genre && genre !== 'all') {
      filtered = rows.filter(r => {
        const g = r.game_id ? byId.get(r.game_id) : null;
        return Array.isArray(g?.tags) && g.tags.includes(genre);
      });
    }

    const hasMore = filtered.length > safeLimit;
    const page = filtered.slice(0, safeLimit);
    const likedSet = likedSetForPrincipal(viewerPrincipalId, page.map(r => r.id));
    return {
      shorts: page.map(r => formatShort(r, { byId, likedSet })),
      hasMore
    };
  }

  function listByGame(gameId, { viewerPrincipalId = null } = {}) {
    if (!GAME_ID_RE.test(gameId)) throw new ApiError(400, 'GAME_ID_INVALID');
    const rows = db.prepare(`
      SELECT * FROM shorts_videos
      WHERE game_id=? AND status='published' AND visibility IN ('public','unlisted')
        AND (video_rel_path IS NOT NULL OR resolved_engine_id IN ('motion-graphic-web','youtube-carousel-web'))
      ORDER BY is_primary DESC, published_at DESC, created_at DESC
      LIMIT 18
    `).all(gameId);
    const { byId } = catalogMap();
    const likedSet = likedSetForPrincipal(viewerPrincipalId, rows.map(r => r.id));
    const shorts = rows.map(r => formatShort(r, { byId, likedSet }));
    const byFormat = {
      'motion-graphic': shorts.find(s => s.renderMode === 'motion-graphic') || null,
      'generative-video': shorts.find(s => s.renderMode === 'generative-video') || null,
      'carousel-images': shorts.find(s => s.renderMode === 'carousel-images') || null
    };
    return {
      gameId,
      primary: shorts.find(s => s.isPrimary) || shorts[0] || null,
      byFormat,
      shorts
    };
  }

  function getGamesSummary() {
    const rows = db.prepare(`
      SELECT id, game_id, title, is_primary, video_rel_path, poster_rel_path, resolved_engine_id, duration_sec, view_count, like_count, published_at
      FROM shorts_videos
      WHERE game_id IS NOT NULL AND status='published' AND visibility='public'
        AND (video_rel_path IS NOT NULL OR resolved_engine_id IN ('motion-graphic-web','youtube-carousel-web'))
      ORDER BY is_primary DESC, published_at DESC, created_at DESC
    `).all();
    const map = {};
    for (const r of rows) {
      const fmt = renderModeForEngine(r.resolved_engine_id);
      if (!map[r.game_id]) {
        map[r.game_id] = {
          gameId: r.game_id,
          count: 0,
          formats: [],
          primaryShortId: r.id,
          primaryRenderMode: fmt,
          title: r.title,
          posterUrl: r.poster_rel_path ? `/api/shorts/${r.id}/poster` : null,
          videoUrl: r.video_rel_path ? `/api/shorts/${r.id}/video` : null,
          durationSec: r.duration_sec || 0
        };
      }
      map[r.game_id].count++;
      if (!map[r.game_id].formats.includes(fmt)) map[r.game_id].formats.push(fmt);
    }
    return { games: map };
  }

  function listCreatorMine(creatorId) {
    const rows = db.prepare(`
      SELECT * FROM shorts_videos
      WHERE creator_id=? AND status != 'deleted'
      ORDER BY created_at DESC
      LIMIT 60
    `).all(creatorId);
    const { byId } = catalogMap();
    const likedSet = likedSetForPrincipal(creatorId, rows.map(r => r.id));
    return {
      shorts: rows.map(r => formatShort(r, { byId, likedSet })),
      wallet: getWallet(db, creatorId, now)
    };
  }

  function listAllForAdmin({ limit = 60, offset = 0 } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 60, 1), 100);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const rows = db.prepare(`
      SELECT * FROM shorts_videos
      WHERE status != 'deleted'
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(safeLimit, safeOffset);
    const { byId } = catalogMap();
    return { shorts: rows.map(r => formatShort(r, { byId })) };
  }

  function getShort(shortId, { viewerPrincipalId = null, isAdmin = false } = {}) {
    if (!SHORT_ID_RE.test(shortId)) throw new ApiError(400, 'SHORT_ID_INVALID');
    const row = db.prepare('SELECT * FROM shorts_videos WHERE id=?').get(shortId);
    if (!row || row.status === 'deleted') throw new ApiError(404, 'SHORT_NOT_FOUND');
    const isPublic = row.status === 'published' && ['public', 'unlisted'].includes(row.visibility);
    const isOwner = Boolean(viewerPrincipalId && row.creator_id === viewerPrincipalId);
    if (!isPublic && !isOwner && !isAdmin) {
      throw new ApiError(404, 'SHORT_NOT_FOUND');
    }
    const { byId } = catalogMap();
    const likedSet = likedSetForPrincipal(viewerPrincipalId, [row.id]);
    return { short: formatShort(row, { byId, likedSet }) };
  }

  function resolveMediaFile(shortId, kind, { viewerPrincipalId = null, isAdmin = false } = {}) {
    if (!SHORT_ID_RE.test(shortId)) throw new ApiError(400, 'SHORT_ID_INVALID');
    const row = db.prepare('SELECT * FROM shorts_videos WHERE id=?').get(shortId);
    if (!row || row.status === 'deleted') throw new ApiError(404, 'SHORT_NOT_FOUND');
    const isPublic = row.status === 'published' && ['public', 'unlisted'].includes(row.visibility);
    const isOwner = Boolean(viewerPrincipalId && row.creator_id === viewerPrincipalId);
    if (!isPublic && !isOwner && !isAdmin) throw new ApiError(404, 'SHORT_NOT_FOUND');

    const rel = kind === 'poster' ? row.poster_rel_path : row.video_rel_path;
    if (!rel) throw new ApiError(404, 'MEDIA_NOT_FOUND');
    const fullPath = path.resolve(mediaRoot, rel);
    if (!insideDir(mediaRoot, fullPath) || !fs.existsSync(fullPath)) {
      throw new ApiError(404, 'MEDIA_NOT_FOUND');
    }
    const ext = path.extname(fullPath).toLowerCase();
    const contentType = kind === 'poster'
      ? (ext === '.svg' ? 'image/svg+xml' : ext === '.png' ? 'image/png' : 'image/jpeg')
      : (row.mime_type || (ext === '.webm' ? 'video/webm' : 'video/mp4'));
    return {
      filePath: fullPath,
      contentType,
      isPublic,
      sha256: row.sha256 || ''
    };
  }

  function resolveSlideFile(shortId, slideIndex, { viewerPrincipalId = null, isAdmin = false } = {}) {
    if (!SHORT_ID_RE.test(shortId)) throw new ApiError(400, 'SHORT_ID_INVALID');
    const idx = Number(slideIndex);
    if (!Number.isInteger(idx) || idx < 0 || idx > 5) throw new ApiError(400, 'SLIDE_INDEX_INVALID');
    const row = db.prepare('SELECT * FROM shorts_videos WHERE id=?').get(shortId);
    if (!row || row.status === 'deleted') throw new ApiError(404, 'SHORT_NOT_FOUND');
    const isPublic = row.status === 'published' && ['public', 'unlisted'].includes(row.visibility);
    const isOwner = Boolean(viewerPrincipalId && row.creator_id === viewerPrincipalId);
    if (!isPublic && !isOwner && !isAdmin) throw new ApiError(404, 'SHORT_NOT_FOUND');

    for (const ext of ['.png', '.jpg', '.webp']) {
      const fullPath = path.resolve(mediaRoot, shortId, `slide_${idx}${ext}`);
      if (insideDir(mediaRoot, fullPath) && fs.existsSync(fullPath)) {
        const contentType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
        return { filePath: fullPath, contentType, isPublic, sha256: '' };
      }
    }
    throw new ApiError(404, 'SLIDE_NOT_FOUND');
  }

  function toggleLike({ shortId, principalId }) {
    if (!SHORT_ID_RE.test(shortId)) throw new ApiError(400, 'SHORT_ID_INVALID');
    const row = db.prepare("SELECT id, status, visibility, like_count FROM shorts_videos WHERE id=?").get(shortId);
    if (!row || row.status !== 'published' || !['public', 'unlisted'].includes(row.visibility)) {
      throw new ApiError(404, 'SHORT_NOT_FOUND');
    }
    return transaction(db, () => {
      const existing = db.prepare('SELECT 1 FROM shorts_likes WHERE short_id=? AND principal_id=?').get(shortId, principalId);
      let liked;
      if (existing) {
        db.prepare('DELETE FROM shorts_likes WHERE short_id=? AND principal_id=?').run(shortId, principalId);
        db.prepare('UPDATE shorts_videos SET like_count = MAX(0, like_count - 1) WHERE id=?').run(shortId);
        liked = false;
      } else {
        db.prepare('INSERT INTO shorts_likes(short_id, principal_id, created_at) VALUES(?,?,?)').run(shortId, principalId, now());
        db.prepare('UPDATE shorts_videos SET like_count = like_count + 1 WHERE id=?').run(shortId);
        liked = true;
      }
      const updated = db.prepare('SELECT like_count FROM shorts_videos WHERE id=?').get(shortId);
      return { ok: true, shortId, liked, likeCount: updated.like_count };
    });
  }

  function recordView({ shortId, viewerKey }) {
    if (!SHORT_ID_RE.test(shortId)) throw new ApiError(400, 'SHORT_ID_INVALID');
    const row = db.prepare("SELECT id, status, visibility, view_count FROM shorts_videos WHERE id=?").get(shortId);
    if (!row || row.status !== 'published' || !['public', 'unlisted'].includes(row.visibility)) {
      throw new ApiError(404, 'SHORT_NOT_FOUND');
    }
    const stamp = now();
    const bucket = dayBucketKst(stamp);
    return transaction(db, () => {
      const inserted = db.prepare(
        'INSERT OR IGNORE INTO shorts_views(short_id, viewer_key, day_bucket, created_at) VALUES(?,?,?,?)'
      ).run(shortId, String(viewerKey || 'anon').slice(0, 128), bucket, stamp);
      if (inserted.changes === 1) {
        db.prepare('UPDATE shorts_videos SET view_count = view_count + 1 WHERE id=?').run(shortId);
      }
      const updated = db.prepare('SELECT view_count FROM shorts_videos WHERE id=?').get(shortId);
      return { ok: true, shortId, counted: inserted.changes === 1, viewCount: updated.view_count };
    });
  }

  function grantDevPlayCoins({ principalId, coins = 300 }) {
    if (!allowDevGrant) throw new ApiError(404, 'NOT_FOUND');
    const amount = Math.min(Math.max(Number(coins) || 300, 10), 1000);
    const result = creditPromo(db, {
      principalId,
      coins: amount,
      reason: 'shorts_studio_dev_grant',
      idempotencyKey: `shorts:devgrant:${principalId}:${uid()}`,
      expiresAt: now() + 30 * 86400000,
      now
    });
    audit('shorts.dev_grant', principalId, { coins: amount });
    return { ok: true, grantedCoins: amount, wallet: result.wallet };
  }

  async function waitForAllJobs() {
    while (activeJobs.size > 0 || pendingQueue.length > 0) {
      await Promise.allSettled([...activeJobs.values()]);
    }
  }

  function close() {
    closed = true;
    pendingQueue.length = 0;
  }

  return {
    experimentalEnabled,
    personalAiAuth,
    getConfig,
    listCreatorBindableGames,
    composeStoryboardForRequest,
    startGeneration,
    importFlowVideo,
    createShortformFromMedia,
    publishShort,
    updateShort,
    deleteShort,
    listPublicFeed,
    listByGame,
    getGamesSummary,
    listCreatorMine,
    listAllForAdmin,
    getShort,
    resolveMediaFile,
    resolveSlideFile,
    toggleLike,
    recordView,
    grantDevPlayCoins,
    waitForAllJobs,
    close
  };
}
