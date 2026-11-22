// HTTP Router for PlayHub Shorts (/api/shorts/* and /api/admin/shorts/*).
import fs from 'node:fs';
import { ApiError, json, readJson } from '../security.mjs';
import { createShortsService } from './service.mjs';
import { getPlaygroundPlansPayload } from './playground-presets.mjs';

async function readBinaryBody(req, limit = 40 * 1024 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new ApiError(413, 'BODY_TOO_LARGE', '업로드 영상은 최대 40MB까지 허용됩니다.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function streamMediaFile(req, res, { filePath, contentType, isPublic, sha256 }) {
  const stat = fs.statSync(filePath);
  const total = stat.size;
  const etag = sha256 ? `"${sha256.slice(0, 24)}"` : `W/"${total}-${Math.trunc(stat.mtimeMs)}"`;

  res.setHeader('Content-Type', contentType);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('ETag', etag);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', isPublic ? 'public, max-age=300' : 'private, no-store');

  if (req.headers['if-none-match'] === etag && !req.headers.range) {
    res.writeHead(304);
    res.end();
    return;
  }

  const rangeHeader = typeof req.headers.range === 'string' ? req.headers.range.trim() : '';
  if (rangeHeader) {
    const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
    if (!match || (!match[1] && !match[2])) {
      res.writeHead(416, { 'Content-Range': `bytes */${total}` });
      res.end();
      return;
    }
    let start;
    let end;
    if (!match[1]) {
      const suffix = Number(match[2]);
      start = Math.max(0, total - suffix);
      end = total - 1;
    } else {
      start = Number(match[1]);
      end = match[2] ? Math.min(total - 1, Number(match[2])) : total - 1;
    }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= total || end < start) {
      res.writeHead(416, { 'Content-Range': `bytes */${total}` });
      res.end();
      return;
    }
    const chunkLength = end - start + 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Content-Length': chunkLength
    });
    if (req.method === 'HEAD') { res.end(); return; }
    const stream = fs.createReadStream(filePath, { start, end });
    stream.on('error', () => res.destroy());
    stream.pipe(res);
    return;
  }

  res.writeHead(200, { 'Content-Length': total });
  if (req.method === 'HEAD') { res.end(); return; }
  const stream = fs.createReadStream(filePath);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

function renderOAuthCallbackHtml(payload) {
  const safeJson = JSON.stringify(payload).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
  const title = payload.ok ? 'Google OAuth 연결 완료' : 'Google OAuth 연결 실패';
  const desc = payload.ok
    ? `${payload.email || 'Google 계정'} 연결이 완료되었습니다. 이 창은 자동으로 닫힙니다.`
    : (payload.message || 'OAuth 인증을 완료하지 못했습니다.');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#faf8ff;color:#1a1b20;font:14px/1.6 system-ui,sans-serif}
.box{max-width:400px;padding:24px;border-radius:16px;background:#fff;border:1px solid #dfe1f4;text-align:center;box-shadow:0 12px 32px rgba(15,23,42,.08)}
h1{margin:0 0 8px;font-size:18px}p{margin:0;color:#434654}</style></head>
<body><div class="box"><h1>${title}</h1><p>${desc.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))}</p></div>
<script>try{if(window.opener){window.opener.postMessage(${safeJson},window.location.origin);}}catch{}setTimeout(function(){try{window.close();}catch{}},700);</script>
</body></html>`;
}

export function createShorts({
  config,
  db,
  rootDir,
  platformRoot = null,
  catalogOptions = {},
  sessionFor,
  requireSession,
  promote,
  assertNotPlatformSanctioned = () => {},
  now = Date.now,
  audit = () => {},
  rate = () => {},
  env = process.env,
  fetchImpl = globalThis.fetch,
  customRenderers = null
}) {
  const service = createShortsService({
    db,
    config,
    rootDir,
    platformRoot,
    catalogOptions,
    now,
    audit,
    env,
    fetchImpl,
    customRenderers
  });

  function requireRegisteredCreator(req) {
    const s = requireSession(req, 'public');
    if (!s.principal_id) {
      throw new ApiError(403, 'REGISTERED_ACCOUNT_REQUIRED', '쇼츠 생성 및 등록은 PlayHub 계정 로그인이 필요합니다.');
    }
    assertNotPlatformSanctioned(s.principal_id);
    const user = db.prepare('SELECT id, kind, display_name FROM users WHERE id=?').get(s.principal_id);
    if (!user || user.kind !== 'registered') {
      throw new ApiError(403, 'REGISTERED_ACCOUNT_REQUIRED', '쇼츠 생성 및 등록은 PlayHub 계정 로그인이 필요합니다.');
    }
    return { session: s, user };
  }

  async function publicRoute(req, res, url) {
    const p = url.pathname;
    if (p !== '/api/shorts' && !p.startsWith('/api/shorts/')) return false;

    const currentSession = sessionFor(req, 'public');
    const viewerPrincipalId = currentSession?.principal_id || null;

    if (p === '/api/shorts/config' && req.method === 'GET') {
      json(res, 200, service.getConfig(viewerPrincipalId));
      return true;
    }

    if (p === '/api/shorts/playground-plans' && req.method === 'GET') {
      if (!service.experimentalEnabled) {
        throw new ApiError(404, 'EXPERIMENTAL_DISABLED', '실험 기능은 로컬 또는 개발(dev) 빌드에서만 사용할 수 있습니다.');
      }
      json(res, 200, getPlaygroundPlansPayload());
      return true;
    }

    if (p === '/api/shorts/ai-auth/status' && req.method === 'GET') {
      const { user } = requireRegisteredCreator(req);
      const status = await service.personalAiAuth.getStatus(user.id, {
        allowLocalGcloud: service.experimentalEnabled
      });
      json(res, 200, status);
      return true;
    }

    if (p === '/api/shorts/ai-auth/google/start' && req.method === 'POST') {
      const { user } = requireRegisteredCreator(req);
      rate(`shorts-aiauth:${user.id}`, 15, 60000);
      const body = await readJson(req, 8192);
      const fwdProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
      const fwdHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
      const inferredOrigin = fwdProto && fwdHost ? `${fwdProto}://${fwdHost}` : `${url.protocol}//${url.host}`;
      const origin = String(req.headers.origin || inferredOrigin || config.userBaseUrl).replace(/\/+$/, '');
      const redirectUri = `${origin}/api/shorts/ai-auth/google/callback`;
      const started = service.personalAiAuth.startGoogleOAuth({
        principalId: user.id,
        redirectUri,
        vertexProject: body?.vertexProject || '',
        vertexLocation: body?.vertexLocation || 'us-central1',
        clientId: body?.clientId || '',
        clientSecret: body?.clientSecret || ''
      });
      json(res, 200, started);
      return true;
    }

    if (p === '/api/shorts/ai-auth/google/callback' && req.method === 'GET') {
      const result = await service.personalAiAuth.handleGoogleOAuthCallback({
        code: url.searchParams.get('code') || '',
        state: url.searchParams.get('state') || '',
        error: url.searchParams.get('error') || ''
      });
      const html = renderOAuthCallbackHtml({
        source: 'playhub-shorts-oauth',
        ok: Boolean(result.ok),
        email: result.email || null,
        errorCode: result.errorCode || null,
        message: result.message || null
      });
      res.writeHead(result.ok ? 200 : 400, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      res.end(html);
      return true;
    }

    if (p === '/api/shorts/ai-auth/google/connect' && req.method === 'POST') {
      const { user } = requireRegisteredCreator(req);
      rate(`shorts-aiauth:${user.id}`, 20, 60000);
      const body = await readJson(req, 16384);
      const status = await service.personalAiAuth.connectManualOrGcloud({
        principalId: user.id,
        mode: body?.mode || 'gemini-key',
        vertexProject: body?.vertexProject || '',
        vertexLocation: body?.vertexLocation || 'us-central1',
        accessToken: body?.accessToken || '',
        geminiApiKey: body?.geminiApiKey || '',
        allowLocalGcloud: service.experimentalEnabled
      });
      json(res, 200, status);
      return true;
    }

    if (p === '/api/shorts/ai-auth/disconnect' && req.method === 'POST') {
      const { user } = requireRegisteredCreator(req);
      await readJson(req, 4096);
      json(res, 200, service.personalAiAuth.disconnect(user.id));
      return true;
    }

    if (p === '/api/shorts/games-summary' && req.method === 'GET') {
      json(res, 200, service.getGamesSummary());
      return true;
    }

    if (p === '/api/shorts' && req.method === 'GET') {
      const result = service.listPublicFeed({
        gameId: url.searchParams.get('gameId') || null,
        genre: url.searchParams.get('genre') || null,
        format: url.searchParams.get('format') || null,
        creatorId: url.searchParams.get('creatorId') || null,
        sort: url.searchParams.get('sort') || 'latest',
        limit: url.searchParams.get('limit') || '20',
        offset: url.searchParams.get('offset') || '0',
        viewerPrincipalId
      });
      json(res, 200, result);
      return true;
    }

    const byGame = p.match(/^\/api\/shorts\/by-game\/([a-z][a-z0-9]*(?:-[a-z0-9]+)*)$/);
    if (byGame && req.method === 'GET') {
      json(res, 200, service.listByGame(byGame[1], { viewerPrincipalId }));
      return true;
    }

    if (p === '/api/shorts/creator/games' && req.method === 'GET') {
      const { user } = requireRegisteredCreator(req);
      json(res, 200, service.listCreatorBindableGames(user.id));
      return true;
    }

    if (p === '/api/shorts/creator/mine' && req.method === 'GET') {
      const { user } = requireRegisteredCreator(req);
      json(res, 200, service.listCreatorMine(user.id));
      return true;
    }

    if (p === '/api/shorts/storyboard' && req.method === 'POST') {
      const s = requireSession(req, 'public');
      rate(`shorts-sb:${s.id_hash}`, 60, 60000);
      const body = await readJson(req, 32768);
      const storyboard = service.composeStoryboardForRequest(body || {});
      json(res, 200, { ok: true, storyboard });
      return true;
    }

    if (p === '/api/shorts/dev-grant' && req.method === 'POST') {
      const { user } = requireRegisteredCreator(req);
      rate(`shorts-devgrant:${user.id}`, 10, 60000);
      const body = await readJson(req, 4096);
      json(res, 200, service.grantDevPlayCoins({ principalId: user.id, coins: body?.coins }));
      return true;
    }

    if (p === '/api/shorts/generate' && req.method === 'POST') {
      const { user } = requireRegisteredCreator(req);
      rate(`shorts-gen:${user.id}`, 15, 60000);
      // Allow up to 16 MB JSON payload for up to 3 base64 keyframe screenshots
      const body = await readJson(req, 16 * 1024 * 1024);
      const idempotencyKey = req.headers['idempotency-key'] || body?.idempotencyKey || null;
      const sync = body?.sync === true || url.searchParams.get('sync') === '1';
      const outcome = await service.startGeneration({
        creatorId: user.id,
        creatorName: user.display_name || 'PlayForge 크리에이터',
        body,
        idempotencyKey,
        sync
      });
      json(res, outcome.statusCode, outcome.body);
      return true;
    }

    if (p === '/api/shorts/import' && req.method === 'POST') {
      const { user } = requireRegisteredCreator(req);
      rate(`shorts-import:${user.id}`, 15, 60000);
      const contentType = String(req.headers['content-type'] || '').toLowerCase();
      let videoBuffer;
      let meta = {};
      if (contentType.startsWith('video/mp4') || contentType.startsWith('video/webm') || contentType.startsWith('application/octet-stream')) {
        videoBuffer = await readBinaryBody(req, 40 * 1024 * 1024);
        meta = {
          gameId: url.searchParams.get('gameId') || undefined,
          projectId: url.searchParams.get('projectId') || undefined,
          title: url.searchParams.get('title') || undefined,
          caption: url.searchParams.get('caption') || undefined,
          hashtags: url.searchParams.get('hashtags') || undefined,
          prompt: url.searchParams.get('prompt') || undefined
        };
      } else {
        const body = await readJson(req, 56 * 1024 * 1024);
        const rawB64 = String(body?.videoBase64 || '').replace(/^data:video\/[a-z0-9.+-]+;base64,/i, '').replace(/\s+/g, '');
        if (!rawB64) throw new ApiError(422, 'VIDEO_REQUIRED', '업로드할 영상 데이터가 비어 있습니다.');
        videoBuffer = Buffer.from(rawB64, 'base64');
        meta = body || {};
      }
      const result = await service.importFlowVideo({
        creatorId: user.id,
        creatorName: user.display_name || 'PlayForge 크리에이터',
        videoBuffer,
        meta
      });
      json(res, 201, result);
      return true;
    }

    if (p === '/api/shorts/shortform' && req.method === 'POST') {
      const { user } = requireRegisteredCreator(req);
      rate(`shorts-sf:${user.id}`, 15, 60000);
      const body = await readJson(req, 56 * 1024 * 1024);
      const sync = body?.sync === true || url.searchParams.get('sync') === '1';
      const outcome = await service.createShortformFromMedia({
        creatorId: user.id,
        creatorName: user.display_name || 'PlayForge 크리에이터',
        body,
        sync
      });
      json(res, outcome.statusCode, outcome.body);
      return true;
    }

    const slideMatch = p.match(/^\/api\/shorts\/(sh_[a-f0-9]{16})\/slide\/([0-5])$/);
    if (slideMatch && ['GET', 'HEAD'].includes(req.method)) {
      const resolved = service.resolveSlideFile(slideMatch[1], Number(slideMatch[2]), { viewerPrincipalId });
      streamMediaFile(req, res, resolved);
      return true;
    }

    const mediaMatch = p.match(/^\/api\/shorts\/(sh_[a-f0-9]{16})\/(video|poster)$/);
    if (mediaMatch && ['GET', 'HEAD'].includes(req.method)) {
      const resolved = service.resolveMediaFile(mediaMatch[1], mediaMatch[2], { viewerPrincipalId });
      streamMediaFile(req, res, resolved);
      return true;
    }

    const publishMatch = p.match(/^\/api\/shorts\/(sh_[a-f0-9]{16})\/publish$/);
    if (publishMatch && req.method === 'POST') {
      const { user } = requireRegisteredCreator(req);
      rate(`shorts-pub:${user.id}`, 30, 60000);
      const body = await readJson(req, 16384);
      json(res, 200, service.publishShort({ shortId: publishMatch[1], creatorId: user.id, body }));
      return true;
    }

    const likeMatch = p.match(/^\/api\/shorts\/(sh_[a-f0-9]{16})\/like$/);
    if (likeMatch && req.method === 'POST') {
      const s = requireSession(req, 'public');
      rate(`shorts-like:${s.id_hash}`, 60, 60000);
      await readJson(req, 4096);
      const principal = promote(s, req, res);
      assertNotPlatformSanctioned(principal.principal_id);
      json(res, 200, service.toggleLike({ shortId: likeMatch[1], principalId: principal.principal_id }));
      return true;
    }

    const viewMatch = p.match(/^\/api\/shorts\/(sh_[a-f0-9]{16})\/view$/);
    if (viewMatch && req.method === 'POST') {
      const s = requireSession(req, 'public');
      rate(`shorts-view:${s.id_hash}`, 120, 60000);
      await readJson(req, 4096);
      const viewerKey = s.principal_id ? `u:${s.principal_id}` : `s:${s.id_hash}`;
      json(res, 200, service.recordView({ shortId: viewMatch[1], viewerKey }));
      return true;
    }

    const itemMatch = p.match(/^\/api\/shorts\/(sh_[a-f0-9]{16})$/);
    if (itemMatch) {
      if (req.method === 'GET') {
        json(res, 200, service.getShort(itemMatch[1], { viewerPrincipalId }));
        return true;
      }
      if (req.method === 'PATCH') {
        const { user } = requireRegisteredCreator(req);
        rate(`shorts-upd:${user.id}`, 30, 60000);
        const body = await readJson(req, 16384);
        json(res, 200, service.updateShort({ shortId: itemMatch[1], creatorId: user.id, body }));
        return true;
      }
      if (req.method === 'DELETE') {
        const { user } = requireRegisteredCreator(req);
        rate(`shorts-del:${user.id}`, 30, 60000);
        json(res, 200, service.deleteShort({ shortId: itemMatch[1], creatorId: user.id }));
        return true;
      }
    }

    return false;
  }

  async function adminRoute(req, res, url) {
    const p = url.pathname;
    if (p !== '/api/admin/shorts' && !p.startsWith('/api/admin/shorts/')) return false;

    if (p === '/api/admin/shorts' && req.method === 'GET') {
      json(res, 200, service.listAllForAdmin({
        limit: url.searchParams.get('limit') || '60',
        offset: url.searchParams.get('offset') || '0'
      }));
      return true;
    }

    const itemMatch = p.match(/^\/api\/admin\/shorts\/(sh_[a-f0-9]{16})$/);
    if (itemMatch && req.method === 'PATCH') {
      const body = await readJson(req, 16384);
      json(res, 200, service.updateShort({ shortId: itemMatch[1], creatorId: 'admin', body, isAdmin: true }));
      return true;
    }
    if (itemMatch && req.method === 'DELETE') {
      json(res, 200, service.deleteShort({ shortId: itemMatch[1], creatorId: 'admin', isAdmin: true }));
      return true;
    }

    return false;
  }

  return {
    publicRoute,
    adminRoute,
    service,
    close: () => service.close()
  };
}
