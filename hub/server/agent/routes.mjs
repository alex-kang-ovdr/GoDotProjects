// HTTP Router for Hub-Agent:
// - Public User API:   /api/hub-agent/* (registered user session + CSRF)
// - Internal S2S API:  /internal/v1/hub-agent/* (loopback + X-PlayHub-Internal-Secret, used by PlayForge)
// - Loopback Admin API:/api/admin/hub-agent/* (authenticated admin session + CSRF)

import { ApiError, PUBLIC_COOKIE, FORGE_COOKIE, cookies, digest, json, readJson } from '../security.mjs';
import { hasActiveSanction } from '../ssot/sanctions.mjs';
import { createHubGeminiProvider } from './gemini-provider.mjs';
import { createHubAgentService } from './service.mjs';

export function createHubAgent({
  config,
  db,
  platformRoot = '',
  sessionFor,
  requireSession,
  verifyInternalAccess,
  now = Date.now,
  audit = () => {},
  rate = () => {},
  env = process.env,
  fetchImpl = globalThis.fetch,
  geminiProvider: injectedProvider = null
}) {
  const geminiProvider = injectedProvider || createHubGeminiProvider({
    dataDir: config.dataDir,
    platformRoot,
    env,
    fetchImpl
  });

  const service = createHubAgentService({
    db,
    geminiProvider,
    now,
    audit
  });

  async function publicRoute(req, res, url) {
    const p = url.pathname;
    if (!p.startsWith('/api/hub-agent/')) return false;

    if (p === '/api/hub-agent/status' && req.method === 'GET') {
      const s = sessionFor(req, 'public');
      json(res, 200, service.getPublicStatus(s?.principal_id || null));
      return true;
    }

    const glbMatch = p.match(/^\/api\/hub-agent\/modeling\/([a-z0-9_]{6,48})\/model\.glb$/i);
    if (glbMatch && req.method === 'GET') {
      const s = requireSession(req, 'public');
      const asset = service.getGlbAsset(glbMatch[1], s.principal_id);
      if (!asset) throw new ApiError(404, 'GLB_ASSET_NOT_FOUND');
      res.writeHead(200, {
        'Content-Type': 'model/gltf-binary',
        'Content-Length': asset.glbBuffer.length,
        'Content-Disposition': `attachment; filename="${asset.filename}"`,
        'Cache-Control': 'private, no-store'
      });
      res.end(asset.glbBuffer);
      return true;
    }

    const s = requireSession(req, 'public');

    if (p === '/api/hub-agent/usage' && req.method === 'GET') {
      const limit = Number(url.searchParams.get('limit') || 30);
      json(res, 200, service.getUserUsageLogs(s.principal_id, { limit }));
      return true;
    }

    if (p === '/api/hub-agent/chat' && req.method === 'POST') {
      rate(`hubagent-chat:${s.id_hash}`, 45, 60_000);
      const body = await readJson(req, 256 * 1024);
      const out = await service.chat({
        principalId: s.principal_id,
        feature: 'hub_chat',
        messages: body.messages,
        tools: body.tools || [],
        model: body.model || '',
        systemPrompt: body.systemPrompt || '',
        byok: body.byok || null
      });
      json(res, 200, out);
      return true;
    }

    if (p === '/api/hub-agent/modeling' && req.method === 'POST') {
      rate(`hubagent-model:${s.id_hash}`, 20, 60_000);
      const body = await readJson(req, 128 * 1024);
      const out = await service.generate3dModel({
        principalId: s.principal_id,
        prompt: body.prompt,
        style: body.style || 'stylized',
        name: body.name || '',
        model: body.model || '',
        byok: body.byok || null
      });
      json(res, 201, out);
      return true;
    }

    if (p === '/api/hub-agent/porting' && req.method === 'POST') {
      rate(`hubagent-port:${s.id_hash}`, 15, 60_000);
      const body = await readJson(req, 512 * 1024);
      const out = await service.portProject({
        principalId: s.principal_id,
        sourceEngine: body.sourceEngine,
        projectName: body.projectName || '',
        files: body.files || [],
        sourceCode: body.sourceCode || '',
        instructions: body.instructions || '',
        model: body.model || '',
        byok: body.byok || null
      });
      json(res, 200, out);
      return true;
    }

    throw new ApiError(404, 'NOT_FOUND');
  }

  async function internalRoute(req, res, url) {
    const p = url.pathname;
    if (!p.startsWith('/internal/v1/hub-agent/')) return false;

    verifyInternalAccess(req, res);

    if (p === '/internal/v1/hub-agent/resolve-session' && req.method === 'POST') {
      const body = await readJson(req, 16 * 1024);
      const rawCookie = typeof body.cookie === 'string' && body.cookie.length <= 8192 ? body.cookie : '';
      const parsed = cookies({ headers: { cookie: rawCookie } });
      const token = parsed[FORGE_COOKIE] || parsed[PUBLIC_COOKIE];
      if (!token) {
        json(res, 200, { authenticated: false });
        return true;
      }
      const s = db.prepare("SELECT * FROM sessions WHERE id_hash = ? AND kind = 'public'").get(digest(token));
      if (!s || !s.principal_id || s.expires_at <= now()) {
        json(res, 200, { authenticated: false });
        return true;
      }
      if (hasActiveSanction(db, s.principal_id, ['all'], now())) {
        json(res, 403, { authenticated: false, error: 'USER_SANCTIONED' });
        return true;
      }
      const user = db.prepare('SELECT id, kind, display_name FROM users WHERE id = ?').get(s.principal_id);
      if (!user || user.kind !== 'registered') {
        json(res, 200, { authenticated: false });
        return true;
      }
      json(res, 200, {
        authenticated: true,
        userId: user.id,
        displayName: user.display_name || null
      });
      return true;
    }

    if (p === '/internal/v1/hub-agent/status' && req.method === 'POST') {
      const body = await readJson(req, 16 * 1024);
      json(res, 200, service.getPublicStatus(body.principalId || null));
      return true;
    }

    if (p === '/internal/v1/hub-agent/chat' && req.method === 'POST') {
      const body = await readJson(req, 512 * 1024);
      const feature = body.feature === 'modeling_3d' ? 'modeling_3d' : 'forge_chat';

      if (body.stream === true) {
        let headersWritten = false;
        const ensureStreamStarted = () => {
          if (headersWritten || res.destroyed) return;
          headersWritten = true;
          res.writeHead(200, {
            'Content-Type': 'application/x-ndjson; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Accel-Buffering': 'no'
          });
        };
        const writeFrame = frame => {
          ensureStreamStarted();
          if (!res.destroyed) res.write(JSON.stringify(frame) + '\n');
        };
        try {
          const out = await service.chat({
            principalId: body.principalId,
            feature,
            messages: body.messages,
            tools: body.tools || [],
            model: body.model || '',
            systemPrompt: body.systemPrompt || '',
            stream: true,
            onDelta: deltaText => writeFrame({ type: 'delta', text: deltaText })
          });
          writeFrame({
            type: 'final',
            message: out.message,
            tokenUsage: out.tokenUsage,
            billing: out.billing
          });
          res.end();
        } catch (err) {
          if (!headersWritten) throw err;
          writeFrame({
            type: 'error',
            code: err.code || 'SERVER_ERROR',
            error: err.message || 'AI 응답 처리 중 오류가 발생했습니다.'
          });
          res.end();
        }
        return true;
      }

      const out = await service.chat({
        principalId: body.principalId,
        feature,
        messages: body.messages,
        tools: body.tools || [],
        model: body.model || '',
        systemPrompt: body.systemPrompt || '',
        stream: false
      });
      json(res, 200, out);
      return true;
    }

    if (p === '/internal/v1/hub-agent/modeling' && req.method === 'POST') {
      const body = await readJson(req, 256 * 1024);
      const out = await service.generate3dModel({
        principalId: body.principalId,
        prompt: body.prompt,
        style: body.style || 'stylized',
        name: body.name || '',
        model: body.model || ''
      });
      json(res, 201, out);
      return true;
    }

    if (p === '/internal/v1/hub-agent/porting' && req.method === 'POST') {
      const body = await readJson(req, 512 * 1024);
      const out = await service.portProject({
        principalId: body.principalId,
        sourceEngine: body.sourceEngine,
        projectName: body.projectName || '',
        files: body.files || [],
        sourceCode: body.sourceCode || '',
        instructions: body.instructions || '',
        model: body.model || '',
        byok: body.byok || null
      });
      json(res, 200, out);
      return true;
    }

    throw new ApiError(404, 'NOT_FOUND');
  }

  async function adminRoute(req, res, url, adminSession) {
    const p = url.pathname;
    if (!p.startsWith('/api/admin/hub-agent/')) return false;
    const actor = adminSession?.admin_username || 'admin';

    if (p === '/api/admin/hub-agent/status' && req.method === 'GET') {
      json(res, 200, service.getAdminOverview());
      return true;
    }

    if (p === '/api/admin/hub-agent/connect/oauth' && req.method === 'POST') {
      const body = await readJson(req, 8192);
      const out = await service.adminConnectOAuth({
        openBrowser: body.openBrowser !== false,
        actor
      });
      json(res, 200, out);
      return true;
    }

    if (p === '/api/admin/hub-agent/connect/apikey' && req.method === 'POST') {
      const body = await readJson(req, 16 * 1024);
      const out = service.adminConnectApiKey({
        apiKey: body.apiKey,
        defaultModel: body.defaultModel,
        actor
      });
      json(res, 200, out);
      return true;
    }

    if (p === '/api/admin/hub-agent/disconnect' && req.method === 'POST') {
      const body = await readJson(req, 8192);
      const out = service.adminDisconnect({
        target: body.target || 'all',
        actor
      });
      json(res, 200, out);
      return true;
    }

    if (p === '/api/admin/hub-agent/policy' && req.method === 'PUT') {
      const body = await readJson(req, 16 * 1024);
      const out = service.adminUpdatePolicy(body, { actor });
      json(res, 200, out);
      return true;
    }

    if (p === '/api/admin/hub-agent/test' && req.method === 'POST') {
      const body = await readJson(req, 16 * 1024);
      const out = await service.adminSmokeTest({
        prompt: body.prompt,
        model: body.model || ''
      });
      json(res, 200, out);
      return true;
    }

    throw new ApiError(404, 'NOT_FOUND');
  }

  return {
    service,
    publicRoute,
    internalRoute,
    adminRoute,
    close: () => service.close()
  };
}
