'use strict';
// PlayForge Shorts Pipeline HTTP Handler (/api/shorts/*)
// Provides standalone Forge local rendering (Google Flow/Veo + FFmpeg 9:16 Director)
// and storyboard/prompt export, reusing the canonical Hub-Shorts engine modules (SSOT).
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const JOB_ID_RE = /^fj_[a-f0-9]{16}$/;
const MAX_JOBS = 40;

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function readJsonBody(req, maxBytes = 16 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let failed = false;
    req.on('data', chunk => {
      if (failed) return;
      size += chunk.length;
      if (size > maxBytes) {
        failed = true;
        chunks.length = 0;
        reject(Object.assign(new Error('Request body too large'), { status: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    req.once('end', () => {
      if (failed) return;
      try {
        const raw = Buffer.concat(chunks).toString('utf8').trim();
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(Object.assign(new Error('Invalid JSON payload'), { status: 400 }));
      }
    });
    req.once('error', reject);
  });
}

function streamFileWithRange(req, res, filePath, contentType) {
  const stat = fs.statSync(filePath);
  const total = stat.size;
  res.setHeader('Content-Type', contentType);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  const range = typeof req.headers.range === 'string' ? req.headers.range.trim() : '';
  if (range) {
    const m = range.match(/^bytes=(\d*)-(\d*)$/);
    if (!m || (!m[1] && !m[2])) {
      res.writeHead(416, { 'Content-Range': `bytes */${total}` });
      return res.end();
    }
    const start = m[1] ? Number(m[1]) : Math.max(0, total - Number(m[2]));
    const end = m[1] ? (m[2] ? Math.min(total - 1, Number(m[2])) : total - 1) : total - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= total || end < start) {
      res.writeHead(416, { 'Content-Range': `bytes */${total}` });
      return res.end();
    }
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Content-Length': end - start + 1
    });
    if (req.method === 'HEAD') return res.end();
    const stream = fs.createReadStream(filePath, { start, end });
    stream.on('error', () => res.destroy());
    stream.pipe(res);
    return;
  }

  res.writeHead(200, { 'Content-Length': total });
  if (req.method === 'HEAD') return res.end();
  const stream = fs.createReadStream(filePath);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

function createShortsPipelineHandler(forgeRoot, options = {}) {
  const env = options.env || process.env;
  const repoRoot = path.resolve(forgeRoot, '..');
  const storageDir = options.storageDir
    ? path.resolve(options.storageDir)
    : path.join(forgeRoot, 'Saved', 'Shorts');
  fs.mkdirSync(storageDir, { recursive: true });

  const jobs = new Map();
  let modulesPromise = null;

  function loadCoreModules() {
    if (!modulesPromise) {
      const hubShortsRoot = path.join(repoRoot, 'hub', 'server', 'shorts');
      modulesPromise = Promise.all([
        import(pathToFileURL(path.join(hubShortsRoot, 'engines.mjs')).href),
        import(pathToFileURL(path.join(hubShortsRoot, 'storyboard.mjs')).href),
        import(pathToFileURL(path.join(hubShortsRoot, 'providers', 'ffmpeg-adapter.mjs')).href),
        import(pathToFileURL(path.join(hubShortsRoot, 'providers', 'veo-adapter.mjs')).href),
        import(pathToFileURL(path.join(hubShortsRoot, 'playground-presets.mjs')).href)
      ]).then(([engines, storyboard, ffmpeg, veo, playground]) => ({ engines, storyboard, ffmpeg, veo, playground }));
    }
    return modulesPromise;
  }

  function trimOldJobs() {
    if (jobs.size <= MAX_JOBS) return;
    const keys = [...jobs.keys()];
    while (keys.length > MAX_JOBS) {
      const oldId = keys.shift();
      jobs.delete(oldId);
      const oldDir = path.join(storageDir, oldId);
      try { fs.rmSync(oldDir, { recursive: true, force: true }); } catch {}
    }
  }

  function publicJobView(job) {
    return {
      id: job.id,
      projectId: job.projectId || null,
      title: job.title,
      engineId: job.engineId,
      resolvedEngineId: job.resolvedEngineId,
      engineModel: job.engineModel,
      status: job.status,
      progress: job.progress,
      stageLabel: job.stageLabel,
      errorCode: job.errorCode || null,
      errorMessage: job.errorMessage || null,
      storyboard: job.storyboard,
      videoUrl: job.videoPath ? `/api/shorts/jobs/${job.id}/video` : null,
      posterUrl: job.posterPath ? `/api/shorts/jobs/${job.id}/poster` : null,
      bytes: job.bytes || 0,
      durationSec: job.durationSec || 0,
      width: job.width || 720,
      height: job.height || 1280,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt
    };
  }

  async function runJob(job, payload, mods) {
    const { engines, ffmpeg, veo } = mods;
    const dir = path.join(storageDir, job.id);
    fs.mkdirSync(dir, { recursive: true });
    const outVideo = path.join(dir, 'video.mp4');
    const outPoster = path.join(dir, 'poster.jpg');
    const onProgress = (pct, label) => {
      job.status = 'rendering';
      job.progress = pct;
      job.stageLabel = label;
      job.updatedAt = new Date().toISOString();
    };

    try {
      const requested = engines.SHORTS_ENGINE_MAP[job.engineId] || engines.SHORTS_ENGINE_MAP['forge-motion-ffmpeg'];
      const keyframes = Array.isArray(payload.keyframes)
        ? payload.keyframes.slice(0, 3).filter(k => k && typeof k.dataUrl === 'string' && k.dataUrl.startsWith('data:image/'))
        : [];
      let result;
      if (requested.provider === 'google-veo') {
        const veoCfg = engines.detectVeoConfig(env, {});
        if (veoCfg.configured) {
          result = await veo.generateShortsWithVeo({
            engineId: requested.id,
            storyboard: job.storyboard,
            keyframes,
            durationSec: job.storyboard.durationSec,
            outputVideoPath: outVideo,
            outputPosterPath: outPoster,
            onProgress,
            env
          });
          job.resolvedEngineId = requested.id;
        } else if (payload.allowFallback !== false) {
          job.resolvedEngineId = 'forge-motion-ffmpeg';
          onProgress(20, 'Veo API 미설정 → PlayForge Motion Director 로컬 프리뷰로 전환');
          result = await ffmpeg.renderMotionShortsWithFfmpeg({
            storyboard: job.storyboard,
            keyframes,
            stylePreset: job.storyboard.stylePreset,
            cameraMotion: job.storyboard.cameraMotion,
            durationSec: job.storyboard.durationSec,
            outputVideoPath: outVideo,
            outputPosterPath: outPoster,
            onProgress,
            env
          });
        } else {
          throw Object.assign(new Error('Veo API 키가 설정되지 않았습니다.'), { code: 'VEO_NOT_CONFIGURED' });
        }
      } else {
        job.resolvedEngineId = 'forge-motion-ffmpeg';
        result = await ffmpeg.renderMotionShortsWithFfmpeg({
          storyboard: job.storyboard,
          keyframes,
          stylePreset: job.storyboard.stylePreset,
          cameraMotion: job.storyboard.cameraMotion,
          durationSec: job.storyboard.durationSec,
          outputVideoPath: outVideo,
          outputPosterPath: outPoster,
          onProgress,
          env
        });
      }

      job.status = 'ready';
      job.progress = 100;
      job.stageLabel = '로컬 쇼츠 프리뷰 렌더링 완료';
      job.videoPath = result.videoPath;
      job.posterPath = result.posterPath;
      job.bytes = result.bytes;
      job.durationSec = result.durationSec;
      job.width = result.width;
      job.height = result.height;
      job.engineModel = result.model || job.engineModel;
      job.updatedAt = new Date().toISOString();
    } catch (error) {
      job.status = 'failed';
      job.progress = 0;
      job.stageLabel = '생성 실패';
      job.errorCode = error?.code || 'FORGE_SHORTS_FAILED';
      job.errorMessage = error?.message || '쇼츠 생성에 실패했습니다.';
      job.updatedAt = new Date().toISOString();
    }
  }

  return async function handleShortsRoute(req, res, parsedUrl) {
    const routePath = parsedUrl.pathname;
    if (routePath !== '/api/shorts' && !routePath.startsWith('/api/shorts/')) return false;

    const mods = await loadCoreModules();

    if (routePath === '/api/shorts/config' && req.method === 'GET') {
      sendJson(res, 200, {
        ok: true,
        mode: 'forge-local',
        ...mods.engines.buildPublicEngineCatalog({ env })
      });
      return true;
    }

    if (routePath === '/api/shorts/playground-plans' && req.method === 'GET') {
      sendJson(res, 200, mods.playground.getPlaygroundPlansPayload());
      return true;
    }

    if (routePath === '/api/shorts/storyboard' && req.method === 'POST') {
      try {
        const body = await readJsonBody(req, 64 * 1024);
        const sb = mods.storyboard.composeShortsStoryboard({
          game: body.game || { title: { ko: body.title || 'PlayForge 프로젝트' }, description: { ko: body.description || '' }, tags: body.tags || ['arcade'], controls: body.controls || ['keyboard', 'mouse'] },
          title: body.title,
          prompt: body.prompt,
          stylePreset: body.stylePreset,
          cameraMotion: body.cameraMotion,
          hookText: body.hookText,
          ctaText: body.ctaText,
          durationSec: body.durationSec,
          keyframeCount: Number(body.keyframeCount) || 0
        });
        sendJson(res, 200, { ok: true, storyboard: sb });
      } catch (err) {
        sendJson(res, err.status || 400, { ok: false, error: err.message });
      }
      return true;
    }

    if (routePath === '/api/shorts/jobs' && req.method === 'GET') {
      const list = [...jobs.values()].reverse().map(publicJobView);
      sendJson(res, 200, { ok: true, jobs: list });
      return true;
    }

    if (routePath === '/api/shorts/jobs' && req.method === 'POST') {
      try {
        const body = await readJsonBody(req, 16 * 1024 * 1024);
        const engineId = typeof body.engineId === 'string' && mods.engines.SHORTS_ENGINE_MAP[body.engineId]
          ? body.engineId
          : 'forge-motion-ffmpeg';
        const sb = mods.storyboard.composeShortsStoryboard({
          game: body.game || { title: { ko: body.title || 'PlayForge 프로젝트' }, description: { ko: body.description || '' }, tags: body.tags || ['arcade'], controls: body.controls || ['keyboard', 'mouse'] },
          title: body.title,
          prompt: body.prompt,
          stylePreset: body.stylePreset,
          cameraMotion: body.cameraMotion,
          hookText: body.hookText,
          ctaText: body.ctaText,
          durationSec: body.durationSec,
          keyframeCount: Array.isArray(body.keyframes) ? body.keyframes.length : 0
        });
        if (typeof body.flowPrompt === 'string' && body.flowPrompt.trim()) {
          sb.flowPrompt = body.flowPrompt.trim().slice(0, 1200);
        }
        const id = 'fj_' + crypto.randomBytes(8).toString('hex');
        const stamp = new Date().toISOString();
        const job = {
          id,
          projectId: typeof body.projectId === 'string' ? body.projectId : null,
          title: String(body.title || sb.suggestedTitle).slice(0, 80),
          engineId,
          resolvedEngineId: engineId,
          engineModel: mods.engines.SHORTS_ENGINE_MAP[engineId]?.model || '',
          status: 'queued',
          progress: 5,
          stageLabel: '로컬 렌더링 준비 중',
          storyboard: sb,
          videoPath: null,
          posterPath: null,
          bytes: 0,
          durationSec: sb.durationSec,
          width: 720,
          height: 1280,
          createdAt: stamp,
          updatedAt: stamp
        };
        jobs.set(id, job);
        trimOldJobs();

        const runPromise = runJob(job, body, mods);
        if (body.sync === true || parsedUrl.searchParams.get('sync') === '1') {
          await runPromise;
          sendJson(res, job.status === 'failed' ? 500 : 201, { ok: job.status !== 'failed', job: publicJobView(job) });
        } else {
          sendJson(res, 202, { ok: true, job: publicJobView(job) });
        }
      } catch (err) {
        sendJson(res, err.status || 400, { ok: false, error: err.message });
      }
      return true;
    }

    const mediaMatch = routePath.match(/^\/api\/shorts\/jobs\/(fj_[a-f0-9]{16})\/(video|poster)$/);
    if (mediaMatch && ['GET', 'HEAD'].includes(req.method)) {
      const job = jobs.get(mediaMatch[1]);
      if (!job) { sendJson(res, 404, { ok: false, error: 'Job not found' }); return true; }
      const target = mediaMatch[2] === 'poster' ? job.posterPath : job.videoPath;
      if (!target || !fs.existsSync(target)) { sendJson(res, 404, { ok: false, error: 'Media not ready' }); return true; }
      const ext = path.extname(target).toLowerCase();
      const ct = mediaMatch[2] === 'poster'
        ? (ext === '.svg' ? 'image/svg+xml' : 'image/jpeg')
        : (ext === '.webm' ? 'video/webm' : 'video/mp4');
      streamFileWithRange(req, res, target, ct);
      return true;
    }

    const jobMatch = routePath.match(/^\/api\/shorts\/jobs\/(fj_[a-f0-9]{16})$/);
    if (jobMatch && req.method === 'GET') {
      const job = jobs.get(jobMatch[1]);
      if (!job) { sendJson(res, 404, { ok: false, error: 'Job not found' }); return true; }
      sendJson(res, 200, { ok: true, job: publicJobView(job) });
      return true;
    }

    return false;
  };
}

module.exports = { createShortsPipelineHandler };
