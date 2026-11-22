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
  detectVeoConfig
} from './engines.mjs';
import { composeShortsStoryboard, normalizeHashtags } from './storyboard.mjs';
import {
  renderMotionShortsWithFfmpeg,
  validateVideoBuffer,
  extractPosterFromVideo,
  probeVideoFile,
  buildFallbackPosterSvg
} from './providers/ffmpeg-adapter.mjs';
import { generateShortsWithVeo } from './providers/veo-adapter.mjs';

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

  const allowDevCatalogBinding = config.secureCookies !== true && config.shorts?.allowDevCatalogBinding !== false;
  const allowDevGrant = config.secureCookies !== true && config.shorts?.allowDevGrant !== false;

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

  function getConfig() {
    return {
      ...buildPublicEngineCatalog({ env, config }),
      allowDevCatalogBinding,
      allowDevGrant,
      maxVideoUploadBytes: MAX_VIDEO_UPLOAD_BYTES
    };
  }

  function composeStoryboardForRequest({ gameId, title, prompt, stylePreset, cameraMotion, hookText, ctaText, durationSec, keyframeCount }) {
    const { byId } = catalogMap();
    const game = gameId && GAME_ID_RE.test(gameId) ? byId.get(gameId) || null : null;
    return composeShortsStoryboard({
      game,
      title,
      prompt,
      stylePreset,
      cameraMotion,
      hookText,
      ctaText,
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

      if (requestedEngine.provider === 'google-veo') {
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
            config,
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
      } else if (requestedEngine.provider === 'ffmpeg-motion') {
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
        resolvedEngineId = 'forge-motion-ffmpeg';
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
      const videoRelPath = `${shortId}/${path.basename(renderResult.videoPath)}`;
      const posterRelPath = posterFilename ? `${shortId}/${posterFilename}` : null;
      const stamp = now();

      db.prepare(`
        UPDATE shorts_videos
        SET resolved_engine_id=?,
            engine_model=?,
            status='ready',
            progress=100,
            stage_label='쇼츠 생성 완료 · 허브 등록 가능',
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

    const storyboard = composeShortsStoryboard({
      game: boundGame,
      title: body.title,
      prompt: body.prompt,
      stylePreset,
      cameraMotion,
      hookText: body.hookText,
      ctaText: body.ctaText,
      durationSec,
      keyframeCount: keyframes.length
    });

    const title = cleanText(body.title, 80, storyboard.suggestedTitle);
    const caption = cleanText(body.caption, 280, storyboard.suggestedCaption);
    const hashtags = normalizeHashtags(body.hashtags, storyboard.hashtags);
    const prompt = cleanText(body.prompt, 600, '');
    const flowPrompt = cleanText(body.flowPrompt, 1200, storyboard.flowPrompt);
    storyboard.flowPrompt = flowPrompt;

    // Pre-resolve effective quote: if Veo isn't configured & no custom Veo renderer is injected,
    // immediately quote fallback engine (20 PC) when allowFallback=true so creators aren't over-held.
    const veoCfg = detectVeoConfig(env, config);
    const ffmpegCfg = detectFfmpegBinary(env);
    let effectiveEngine = requestedEngine;
    if (requestedEngine.provider === 'google-veo' && !veoCfg.configured && !customRenderers?.veo) {
      if (!allowFallback) {
        throw new ApiError(503, 'VEO_NOT_CONFIGURED', 'Google Flow / Veo API 키가 설정되지 않았습니다. 자동 폴백을 켜거나 Flow 프롬프트 내보내기를 이용해 주세요.');
      }
      if (!ffmpegCfg.available && !customRenderers?.ffmpeg) {
        throw new ApiError(503, 'SHORTS_ENGINE_UNAVAILABLE', '사용 가능한 영상 렌더링 엔진이 없습니다.');
      }
      effectiveEngine = SHORTS_ENGINE_MAP['forge-motion-ffmpeg'];
    } else if (requestedEngine.provider === 'ffmpeg-motion' && !ffmpegCfg.available && !customRenderers?.ffmpeg) {
      throw new ApiError(503, 'FFMPEG_UNAVAILABLE', '서버에 FFmpeg가 설치되어 있지 않습니다.');
    }

    const quotedCoins = effectiveEngine.costCoins;
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

  function publishShort({ shortId, creatorId, body = {}, isAdmin = false }) {
    if (!SHORT_ID_RE.test(shortId)) throw new ApiError(400, 'SHORT_ID_INVALID');
    const row = db.prepare('SELECT * FROM shorts_videos WHERE id=?').get(shortId);
    if (!row || row.status === 'deleted') throw new ApiError(404, 'SHORT_NOT_FOUND');
    if (!isAdmin && row.creator_id !== creatorId) throw new ApiError(403, 'SHORT_OWNERSHIP_FORBIDDEN');
    if (!['ready', 'published', 'unpublished'].includes(row.status) || !row.video_rel_path) {
      throw new ApiError(409, 'SHORT_NOT_READY', '영상 생성이 완료된 뒤 허브에 등록할 수 있습니다.');
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
      if (!row.video_rel_path || !row.game_id) {
        throw new ApiError(409, 'SHORT_NOT_PUBLISHABLE', '게임과 영상이 준비된 쇼츠만 공개할 수 있습니다.');
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

  function listPublicFeed({ gameId = null, genre = null, creatorId = null, sort = 'latest', limit = 20, offset = 0, viewerPrincipalId = null } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 60);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const orderClause = sort === 'popular'
      ? 'like_count DESC, view_count DESC, published_at DESC, created_at DESC'
      : 'published_at DESC, created_at DESC';

    const where = ["status='published'", "visibility='public'", 'video_rel_path IS NOT NULL'];
    const params = [];
    if (gameId && GAME_ID_RE.test(gameId)) {
      where.push('game_id=?');
      params.push(gameId);
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
      WHERE game_id=? AND status='published' AND visibility IN ('public','unlisted') AND video_rel_path IS NOT NULL
      ORDER BY is_primary DESC, published_at DESC, created_at DESC
      LIMIT 12
    `).all(gameId);
    const { byId } = catalogMap();
    const likedSet = likedSetForPrincipal(viewerPrincipalId, rows.map(r => r.id));
    const shorts = rows.map(r => formatShort(r, { byId, likedSet }));
    return {
      gameId,
      primary: shorts.find(s => s.isPrimary) || shorts[0] || null,
      shorts
    };
  }

  function getGamesSummary() {
    const rows = db.prepare(`
      SELECT id, game_id, title, is_primary, poster_rel_path, duration_sec, view_count, like_count, published_at
      FROM shorts_videos
      WHERE game_id IS NOT NULL AND status='published' AND visibility='public' AND video_rel_path IS NOT NULL
      ORDER BY is_primary DESC, published_at DESC, created_at DESC
    `).all();
    const map = {};
    for (const r of rows) {
      if (!map[r.game_id]) {
        map[r.game_id] = {
          gameId: r.game_id,
          count: 0,
          primaryShortId: r.id,
          title: r.title,
          posterUrl: r.poster_rel_path ? `/api/shorts/${r.id}/poster` : null,
          videoUrl: `/api/shorts/${r.id}/video`,
          durationSec: r.duration_sec || 0
        };
      }
      map[r.game_id].count++;
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
    getConfig,
    listCreatorBindableGames,
    composeStoryboardForRequest,
    startGeneration,
    importFlowVideo,
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
    toggleLike,
    recordView,
    grantDevPlayCoins,
    waitForAllJobs,
    close
  };
}
