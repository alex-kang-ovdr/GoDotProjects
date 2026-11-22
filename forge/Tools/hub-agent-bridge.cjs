'use strict';

// PlayForge <-> PlayHub Built-in Agent Bridge (Hub-Agent).
// Routes Forge AI Chat, 3D Modeling (Blender Studio), and Project Porting through
// PlayHub's Built-in Gemini Agent (with Free Trial / Pro Weekly Quota + PlayCoin Overage)
// whenever a user has NOT connected their own personal AI account/API key.
// When a user connects their own API key in their session, 0 PlayCoins are deducted.

const { AsyncLocalStorage } = require('node:async_hooks');
const { Readable } = require('node:stream');
const { createClaudeRequest, readClaudeMessage } = require('./agent-chat-claude.cjs');
const { CONNECTIONS, createCompatibleRequest, readCompatibleMessage } = require('./agent-chat-openai.cjs');
const { planWithAi } = require('./blender-pipeline/llm-planner.cjs');

const BYOK_PROVIDERS = new Set(['claude-console', 'openai-api', 'gemini', 'zai-coding-plan']);
const ALL_PROVIDER_IDS = [
  'ollama',
  'claude-console',
  'chatgpt-connect',
  'claude-connect',
  'gemini-connect',
  ...Object.keys(CONNECTIONS)
];
const USER_SESSION_TTL_MS = 12 * 3600_000;
const MAX_USER_SESSIONS = 500;
const MAX_BODY_BYTES = 2 * 1024 * 1024;

function readBodyBuffer(req, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', chunk => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buf.length;
      if (total > maxBytes) {
        reject(Object.assign(new Error('Request payload is too large.'), { status: 413 }));
        req.destroy();
      } else {
        chunks.push(buf);
      }
    });
    req.once('end', () => resolve(Buffer.concat(chunks, total)));
    req.once('error', reject);
  });
}

async function readBodyJson(req, maxBytes = MAX_BODY_BYTES) {
  const buf = await readBodyBuffer(req, maxBytes);
  if (!buf.length) return {};
  try {
    return JSON.parse(buf.toString('utf8'));
  } catch {
    throw Object.assign(new Error('Invalid JSON request body.'), { status: 400 });
  }
}

function resolveHubInternalBase({ hubAuthConfig = null, env = process.env } = {}) {
  const explicit = hubAuthConfig?.hubAgentBaseUrl || env.PLAYHUB_HUB_AGENT_URL || '';
  if (explicit) return String(explicit).replace(/\/+$/, '');
  const verifyUrl = hubAuthConfig?.verifyUrl || env.PLAYHUB_SESSION_VERIFY_URL || '';
  if (verifyUrl) {
    try {
      return new URL(verifyUrl).origin;
    } catch {}
  }
  return '';
}

function resolveInternalSecret({ hubAuthConfig = null, env = process.env } = {}) {
  return String(
    hubAuthConfig?.internalSecret ||
    env.PLAYHUB_FORGE_INTERNAL_SECRET ||
    env.PLAYHUB_DATASTORE_INTERNAL_SECRET ||
    ''
  );
}

function formatBillingFooter(billing) {
  if (!billing || billing.authMode === 'user_byok') return '';
  const tu = billing.tokenUsage || {};
  const charged = Number(billing.chargedCoins || 0);
  if (charged > 0) {
    return `\n\n---\n🪙 PlayCoin ${charged} 차감 (토큰 ${Number(tu.totalTokens || 0).toLocaleString()} · 잔액 ${Number(billing.wallet?.available ?? 0).toLocaleString()} PlayCoin)`;
  }
  if (Number(tu.quotaTokensUsed || 0) > 0) {
    const label = billing.planTier === 'pro' ? 'Pro 주간 포함 한도' : 'Free 체험 한도';
    return `\n\n---\n✨ ${label} 적용 · 0 PlayCoin 차감 (남은 한도 ${Number(billing.quota?.remainingTokens ?? 0).toLocaleString()} 가중 토큰)`;
  }
  return '';
}

function adaptAgentChatAddonFiles(files = {}) {
  const patched = { ...files };
  if (typeof patched['chat_settings.gd'] === 'string') {
    patched['chat_settings.gd'] = patched['chat_settings.gd']
      .replace(
        'var provider := "ollama"',
        'var provider := "gemini-connect"'
      )
      .replace(
        `endpoint = str(JavaScriptBridge.eval("['localhost','127.0.0.1','[::1]'].includes(location.hostname) ? location.origin + (window.__playforgeBasePath || '') + '/api/agent-chat' : ''", true))`,
        `endpoint = str(JavaScriptBridge.eval("location.origin + (window.__playforgeBasePath || '') + '/api/agent-chat'", true))`
      );
  }
  if (typeof patched['chat_stream.gd'] === 'string') {
    patched['chat_stream.gd'] = patched['chat_stream.gd'].replace(
      'const URL_PATTERN := "^https?://(localhost|127[.]0[.]0[.]1|\\\\[::1\\\\])(?::([0-9]{1,5}))?(/[^\\\\s#]*)$"',
      'const URL_PATTERN := "^https?://([A-Za-z0-9._-]+|\\\\[[0-9a-fA-F:]+\\\\])(?::([0-9]{1,5}))?(/[^\\\\s#]*)$"'
    );
  }
  return patched;
}

function createHubAgentBridge({
  hubAuthConfig = null,
  env = process.env,
  fetchImpl = globalThis.fetch
} = {}) {
  const hubBase = resolveHubInternalBase({ hubAuthConfig, env });
  const internalSecret = resolveInternalSecret({ hubAuthConfig, env });
  const authStorage = new AsyncLocalStorage();
  const userByokStore = new Map();

  function enabled() {
    return Boolean(hubBase && internalSecret);
  }

  function runWithAuth(auth, extra, fn) {
    if (typeof extra === 'function') {
      return authStorage.run({ auth, feature: 'forge_chat' }, extra);
    }
    return authStorage.run({ auth, ...(extra || {}) }, fn);
  }

  function getUserMap(principalId) {
    if (!principalId) return new Map();
    const now = Date.now();
    let entry = userByokStore.get(principalId);
    if (!entry || entry.expiresAt <= now) {
      entry = { byok: new Map(), expiresAt: now + USER_SESSION_TTL_MS };
      userByokStore.set(principalId, entry);
      if (userByokStore.size > MAX_USER_SESSIONS) {
        const oldest = userByokStore.keys().next().value;
        if (oldest !== principalId) userByokStore.delete(oldest);
      }
    } else {
      entry.expiresAt = now + USER_SESSION_TTL_MS;
    }
    return entry.byok;
  }

  function findFirstUserByok(principalId) {
    const map = getUserMap(principalId);
    for (const [providerId, cfg] of map.entries()) {
      if (cfg?.apiKey) return { providerId, ...cfg };
    }
    return null;
  }

  async function callHubInternal(pathname, body) {
    if (!enabled()) {
      throw Object.assign(new Error('PlayHub 내장 에이전트 연결이 설정되지 않았습니다.'), { status: 503 });
    }
    const res = await fetchImpl(`${hubBase}${pathname}`, {
      method: 'POST',
      redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        'X-PlayHub-Internal-Secret': internalSecret
      },
      body: JSON.stringify(body || {})
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message || data?.error || `Hub Agent 요청 실패 (${res.status})`;
      const err = new Error(msg);
      err.status = res.status;
      err.code = data?.error?.code || 'HUB_AGENT_ERROR';
      err.details = data?.error || data;
      throw err;
    }
    return data;
  }

  async function resolveEffectiveAuth(req, auth) {
    if (auth?.userId) return auth;
    const rawCookie = typeof req?.headers?.cookie === 'string' ? req.headers.cookie : '';
    if (!rawCookie || !enabled()) return auth;
    try {
      const resolved = await callHubInternal('/internal/v1/hub-agent/resolve-session', { cookie: rawCookie });
      if (resolved?.authenticated && resolved.userId) {
        return {
          authenticated: true,
          userId: resolved.userId,
          displayName: resolved.displayName || null
        };
      }
    } catch {}
    return auth;
  }

  async function buildProvidersStatus(principalId) {
    let hubStatus = {
      available: false,
      defaultModel: 'gemini-3.5-flash',
      models: ['gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-2.5-pro'],
      planTier: 'free',
      wallet: { available: 0 },
      quota: { remainingTokens: 0 }
    };
    if (enabled() && principalId) {
      try {
        hubStatus = await callHubInternal('/internal/v1/hub-agent/status', { principalId });
      } catch {
        // leave available=false if Hub internal endpoint unreachable
      }
    }

    const userMap = getUserMap(principalId);
    const quotaDesc = hubStatus.planTier === 'pro'
      ? `Pro 주간 잔여 ${Number(hubStatus.quota?.remainingTokens || 0).toLocaleString()} 토큰`
      : `Free 체험 잔여 ${Number(hubStatus.quota?.remainingTokens || 0).toLocaleString()} 토큰`;
    const coinDesc = `보유 ${Number(hubStatus.wallet?.available || 0).toLocaleString()} PlayCoin`;

    return ALL_PROVIDER_IDS.map(id => {
      if (id === 'gemini-connect') {
        return {
          id: 'gemini-connect',
          label: 'PlayHub 내장 Gemini',
          configured: Boolean(hubStatus.available),
          auth: hubStatus.available ? 'connected' : 'unavailable',
          model: hubStatus.defaultModel || 'gemini-3.5-flash',
          default_model: hubStatus.defaultModel || 'gemini-3.5-flash',
          models: Array.isArray(hubStatus.models) && hubStatus.models.length
            ? hubStatus.models
            : ['gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-2.5-pro'],
          detail: hubStatus.available
            ? `PlayHub 내장 에이전트 (${quotaDesc} · ${coinDesc} · 한도 초과분만 PlayCoin 차감)`
            : '운영자가 아직 Hub 내장 Gemini를 연결하지 않았습니다. 본인 API 키를 연동해 사용할 수 있습니다.'
        };
      }

      if (BYOK_PROVIDERS.has(id)) {
        const saved = userMap.get(id);
        const def = id === 'claude-console'
          ? { label: 'Claude API (본인 키 · 무과금)', defaultModel: 'claude-sonnet-5-5', models: ['claude-sonnet-5-5', 'claude-opus-4-6'] }
          : {
              label: `${CONNECTIONS[id]?.label || id} (본인 키 · 무과금)`,
              defaultModel: CONNECTIONS[id]?.defaultModel || '',
              models: CONNECTIONS[id]?.models || []
            };
        return {
          id,
          label: def.label,
          configured: Boolean(saved?.apiKey),
          auth: saved?.apiKey ? 'connected' : 'disconnected',
          model: saved?.model || def.defaultModel,
          default_model: def.defaultModel,
          models: def.models,
          detail: saved?.apiKey
            ? '본인 계정 API 키 연동됨 · PlayCoin 차감 없음 (0 코인)'
            : '본인 API 키 연결 시 PlayCoin 차감 없이 무제한 이용 가능'
        };
      }

      return {
        id,
        label: id,
        configured: false,
        auth: 'unavailable',
        models: [],
        detail: '웹 허브 환경에서는 PlayHub 내장 Gemini 또는 본인 API 키 연결을 사용하세요.'
      };
    });
  }

  async function executeUserByokChat(byokEntry, { messages, tools = [], model = '' }) {
    const providerId = byokEntry.providerId;
    const chosenModel = model || byokEntry.model;

    if (providerId === 'claude-console') {
      const reqSpec = createClaudeRequest(
        {
          key: byokEntry.apiKey,
          workspace: byokEntry.workspace || '',
          model: chosenModel || 'claude-sonnet-5-5'
        },
        { messages, tools }
      );
      const res = await fetchImpl(reqSpec.url, {
        method: 'POST',
        redirect: 'error',
        headers: { 'content-type': 'application/json', ...reqSpec.headers },
        body: JSON.stringify(reqSpec.body)
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw Object.assign(new Error(body?.error?.message || `Claude API HTTP ${res.status}`), { status: 502 });
      }
      return readClaudeMessage(body);
    }

    const reqSpec = createCompatibleRequest(
      providerId,
      {
        key: byokEntry.apiKey,
        model: chosenModel || CONNECTIONS[providerId]?.defaultModel || 'gpt-5.4-mini'
      },
      { messages, tools }
    );
    const res = await fetchImpl(reqSpec.url, {
      method: 'POST',
      redirect: 'error',
      headers: { 'content-type': 'application/json', ...reqSpec.headers },
      body: JSON.stringify(reqSpec.body)
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw Object.assign(new Error(body?.error?.message || `${providerId} HTTP ${res.status}`), { status: 502 });
    }
    return readCompatibleMessage(body, providerId);
  }

  async function handleAgentChatRoute(req, res, replyJson, authOverride = null) {
    const ctx = authStorage.getStore() || {};
    const auth = await resolveEffectiveAuth(req, authOverride || ctx.auth || null);
    const principalId = auth?.userId || null;
    const feature = ctx.feature || 'forge_chat';
    const appendFooter = ctx.appendBillingFooter === true;

    const rawUrl = String(req.url || '');
    const pathname = rawUrl.split('?')[0];

    if (!principalId) {
      return replyJson(401, { error: 'PlayHub 로그인이 필요합니다.' });
    }

    if (pathname === '/api/agent-chat/providers' && req.method === 'GET') {
      const providers = await buildProvidersStatus(principalId);
      return replyJson(200, { providers });
    }

    if (pathname === '/api/agent-chat/providers/connect' && req.method === 'POST') {
      try {
        const body = await readBodyJson(req, 64 * 1024);
        const provider = String(body.provider || '').trim();
        if (provider === 'gemini-connect') {
          const providers = await buildProvidersStatus(principalId);
          return replyJson(200, { providers });
        }
        if (!BYOK_PROVIDERS.has(provider)) {
          return replyJson(400, { error: '웹 PlayHub 모드에서는 본인 API 키 공급자(Claude API, OpenAI API, Gemini API, z.ai)만 직접 연결할 수 있습니다. 미연결 시 PlayHub 내장 Gemini가 자동 사용됩니다.' });
        }
        const apiKey = String(body.api_key || '').trim();
        if (!apiKey || apiKey.length < 10) {
          return replyJson(400, { error: '유효한 API 키를 입력해 주세요.' });
        }
        const defaultModel = provider === 'claude-console'
          ? 'claude-sonnet-5-5'
          : (CONNECTIONS[provider]?.defaultModel || '');
        const chosenModel = typeof body.model === 'string' && body.model.trim() ? body.model.trim() : defaultModel;
        getUserMap(principalId).set(provider, {
          apiKey,
          model: chosenModel,
          workspace: typeof body.workspace === 'string' ? body.workspace.trim() : ''
        });
        const providers = await buildProvidersStatus(principalId);
        return replyJson(200, { providers });
      } catch (err) {
        return replyJson(err.status || 400, { error: err.message });
      }
    }

    if (pathname === '/api/agent-chat/providers/disconnect' && req.method === 'POST') {
      try {
        const body = await readBodyJson(req, 32 * 1024);
        const provider = String(body.provider || '').trim();
        if (BYOK_PROVIDERS.has(provider)) {
          getUserMap(principalId).delete(provider);
        }
        const providers = await buildProvidersStatus(principalId);
        return replyJson(200, { providers });
      } catch (err) {
        return replyJson(err.status || 400, { error: err.message });
      }
    }

    if (pathname === '/api/agent-chat' && req.method === 'POST') {
      let body;
      try {
        body = await readBodyJson(req, MAX_BODY_BYTES);
      } catch (err) {
        return replyJson(err.status || 400, { error: err.message });
      }

      const requestedProvider = String(body.provider || 'gemini-connect').trim();
      const userMap = getUserMap(principalId);
      const userByok = BYOK_PROVIDERS.has(requestedProvider) && userMap.has(requestedProvider)
        ? { providerId: requestedProvider, ...userMap.get(requestedProvider) }
        : null;

      const messages = Array.isArray(body.messages) ? body.messages : [];
      const tools = Array.isArray(body.tools) ? body.tools : [];
      const requestedModel = typeof body.model === 'string' ? body.model.trim() : '';
      const wantsStream = body.stream === true;

      // Path A: User connected their own personal API key -> 0 PlayCoin deducted!
      if (userByok) {
        try {
          const message = await executeUserByokChat(userByok, {
            messages,
            tools,
            model: requestedModel
          });
          if (wantsStream) {
            res.writeHead(200, {
              'Content-Type': 'application/x-ndjson; charset=utf-8',
              'Cache-Control': 'no-store'
            });
            if (message.content) res.write(JSON.stringify({ type: 'delta', text: message.content }) + '\n');
            res.write(JSON.stringify({
              type: 'final',
              message,
              billing: { authMode: 'user_byok', chargedCoins: 0 }
            }) + '\n');
            res.end();
            return;
          }
          return replyJson(200, {
            message,
            billing: { authMode: 'user_byok', chargedCoins: 0 }
          });
        } catch (err) {
          return replyJson(err.status || 502, { error: err.message });
        }
      }

      // Path B: User has NOT connected their own account -> Route to PlayHub Built-in Gemini + Quota/PlayCoin metering!
      const effectiveModel = requestedProvider === 'gemini-connect' ? requestedModel : '';
      if (wantsStream && tools.length === 0) {
        try {
          const upstream = await fetchImpl(`${hubBase}/internal/v1/hub-agent/chat`, {
            method: 'POST',
            redirect: 'error',
            headers: {
              'Content-Type': 'application/json',
              'X-PlayHub-Internal-Secret': internalSecret
            },
            body: JSON.stringify({
              principalId,
              feature,
              messages,
              tools: [],
              model: effectiveModel,
              stream: true
            })
          });

          if (!upstream.ok) {
            const errData = await upstream.json().catch(() => ({}));
            return replyJson(upstream.status, {
              error: errData?.error?.message || errData?.error || `PlayHub 내장 에이전트 오류 (${upstream.status})`,
              code: errData?.error?.code
            });
          }

          res.writeHead(200, {
            'Content-Type': 'application/x-ndjson; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Accel-Buffering': 'no'
          });

          const decoder = new TextDecoder();
          let buf = '';
          for await (const chunk of upstream.body) {
            buf += decoder.decode(chunk, { stream: true });
            for (let nl = buf.indexOf('\n'); nl !== -1; nl = buf.indexOf('\n')) {
              const line = buf.slice(0, nl).trim();
              buf = buf.slice(nl + 1);
              if (!line) continue;
              try {
                const frame = JSON.parse(line);
                if (frame.type === 'final' && appendFooter && frame.message && frame.billing) {
                  const trimmed = String(frame.message.content || '').trim();
                  const looksLikePureJson = trimmed.startsWith('{') && trimmed.endsWith('}');
                  const footer = looksLikePureJson ? '' : formatBillingFooter(frame.billing);
                  if (footer) {
                    res.write(JSON.stringify({ type: 'delta', text: footer }) + '\n');
                    frame.message.content = String(frame.message.content || '') + footer;
                  }
                }
                res.write(JSON.stringify(frame) + '\n');
              } catch {
                res.write(line + '\n');
              }
            }
          }
          res.end();
          return;
        } catch (err) {
          if (!res.headersSent) {
            return replyJson(err.status || 502, { error: err.message });
          }
          res.end();
          return;
        }
      }

      try {
        const out = await callHubInternal('/internal/v1/hub-agent/chat', {
          principalId,
          feature,
          messages,
          tools,
          model: effectiveModel,
          stream: false
        });
        const message = out.message || { role: 'assistant', content: '', tool_calls: [] };
        const trimmedContent = String(message.content || '').trim();
        const looksLikePureJson = trimmedContent.startsWith('{') && trimmedContent.endsWith('}');
        if (appendFooter && !looksLikePureJson && (!Array.isArray(message.tool_calls) || message.tool_calls.length === 0)) {
          message.content = String(message.content || '') + formatBillingFooter(out.billing);
        }
        if (wantsStream) {
          res.writeHead(200, {
            'Content-Type': 'application/x-ndjson; charset=utf-8',
            'Cache-Control': 'no-store'
          });
          if (message.content) res.write(JSON.stringify({ type: 'delta', text: message.content }) + '\n');
          res.write(JSON.stringify({
            type: 'final',
            message,
            tokenUsage: out.tokenUsage,
            billing: out.billing
          }) + '\n');
          res.end();
          return;
        }
        return replyJson(200, {
          message,
          tokenUsage: out.tokenUsage,
          billing: out.billing
        });
      } catch (err) {
        return replyJson(err.status || 502, {
          error: err.message,
          code: err.code
        });
      }
    }

    return replyJson(404, { error: 'Unknown agent-chat endpoint' });
  }

  // Internal function passed as `agentChatProvider` to `createBlenderPipelineHandler`
  function internalAgentChatProvider(req, res, replyJson) {
    return handleAgentChatRoute(req, res, replyJson);
  }

  // Handles `/api/blender/*` safely with per-user auth context & pre-queue AI MeshRecipe billing
  async function handleBlenderWithHubAgent(req, res, parsedUrl, rawAuth, blenderPipeline, replyJson) {
    const auth = await resolveEffectiveAuth(req, rawAuth);
    const pathname = parsedUrl.pathname;

    // Allow per-user BYOK connection from Blender Studio in Hub mode (without host loopback restriction)
    if (pathname === '/api/blender/models/connect' && req.method === 'POST') {
      if (!auth?.userId) {
        return replyJson(401, { ok: false, error: 'PlayHub 로그인이 필요합니다.' });
      }
      const body = await readBodyJson(req, 64 * 1024);
      const provider = String(body.provider || '').trim();
      if (provider && provider !== 'gemini-connect' && BYOK_PROVIDERS.has(provider)) {
        const apiKey = String(body.api_key || '').trim();
        if (!apiKey || apiKey.length < 10) {
          return replyJson(400, { ok: false, error: '유효한 API 키를 입력해 주세요.' });
        }
        const defaultModel = provider === 'claude-console' ? 'claude-sonnet-5-5' : (CONNECTIONS[provider]?.defaultModel || '');
        getUserMap(auth.userId).set(provider, {
          apiKey,
          model: typeof body.model === 'string' && body.model.trim() ? body.model.trim() : defaultModel
        });
      }
      return await runWithAuth(auth, { feature: 'modeling_3d', appendBillingFooter: false }, async () => {
        const fakeReq = Readable.from([]);
        fakeReq.method = 'GET';
        fakeReq.url = '/api/blender/models';
        fakeReq.headers = req.headers;
        fakeReq.socket = req.socket;
        return await blenderPipeline(fakeReq, res, new URL('/api/blender/models', 'http://127.0.0.1'));
      });
    }

    // Pre-resolve AI MeshRecipe v1 for `POST /api/blender/jobs` inside this user's auth scope
    // so background Blender queue never mixes AsyncLocalStorage across users AND 402 insufficient PlayCoin fails immediately!
    if (pathname === '/api/blender/jobs' && req.method === 'POST') {
      const body = await readBodyJson(req, 512 * 1024);
      const aiProvider = String(body.aiProvider || 'auto').trim();
      let enrichedBody = body;

      if (!body.recipe && body.prompt && aiProvider !== 'heuristic') {
        if (!auth?.userId) {
          return replyJson(401, { ok: false, error: 'PlayHub 로그인이 필요합니다.' });
        }
        try {
          const planned = await runWithAuth(auth, { feature: 'modeling_3d', appendBillingFooter: false }, () =>
            planWithAi(
              { ...body, aiProvider: aiProvider === 'auto' ? (findFirstUserByok(auth.userId)?.providerId || 'gemini-connect') : aiProvider },
              { agentChatProvider: internalAgentChatProvider }
            )
          );
          enrichedBody = {
            ...body,
            recipe: planned.recipe,
            plan: planned.plan,
            placement: body.placement || planned.placement,
            ai: planned.ai
          };
        } catch (err) {
          return replyJson(err.status || 502, {
            ok: false,
            error: err.message,
            code: err.code
          });
        }
      }

      const rawBytes = Buffer.from(JSON.stringify(enrichedBody), 'utf8');
      const replayReq = Readable.from([rawBytes]);
      replayReq.method = 'POST';
      replayReq.url = req.url;
      replayReq.headers = { ...req.headers, 'content-type': 'application/json', 'content-length': String(rawBytes.length) };
      replayReq.socket = req.socket;
      return await runWithAuth(auth, { feature: 'modeling_3d', appendBillingFooter: false }, () =>
        blenderPipeline(replayReq, res, parsedUrl)
      );
    }

    return await runWithAuth(auth, { feature: 'modeling_3d', appendBillingFooter: false }, () =>
      blenderPipeline(req, res, parsedUrl)
    );
  }

  // Handles `/api/porting/*` (Roblox / Unity / Unreal -> Godot 4.7.2 AI Project Porting)
  async function handlePortingRoute(req, res, parsedUrl, rawAuth, { getPlatformStore } = {}, replyJson) {
    const auth = await resolveEffectiveAuth(req, rawAuth);
    const pathname = parsedUrl.pathname;
    const principalId = auth?.userId || null;
    if (!principalId) {
      return replyJson(401, { ok: false, error: 'PlayHub 로그인이 필요합니다.' });
    }

    if (pathname === '/api/porting/status' && req.method === 'GET') {
      const userByok = findFirstUserByok(principalId);
      let hubStatus = null;
      if (enabled()) {
        try {
          hubStatus = await callHubInternal('/internal/v1/hub-agent/status', { principalId });
        } catch {}
      }
      return replyJson(200, {
        ok: true,
        hubAgentAvailable: Boolean(hubStatus?.available),
        userByokConnected: Boolean(userByok),
        userByokProvider: userByok?.providerId || null,
        planTier: hubStatus?.planTier || 'free',
        wallet: hubStatus?.wallet || null,
        quota: hubStatus?.quota || null,
        pricing: hubStatus?.pricing || null
      });
    }

    if (pathname === '/api/porting/convert' && req.method === 'POST') {
      try {
        const body = await readBodyJson(req, MAX_BODY_BYTES);
        const sourceEngine = String(body.sourceEngine || '').toLowerCase();
        const projectName = String(body.projectName || 'PortedGodotGame').trim().slice(0, 80);

        const sessionByok = findFirstUserByok(principalId);
        let ported;

        // If user connected their own BYOK key (or passed explicit byok), run without PlayCoin deduction via Hub's BYOK path or Hub Managed
        if (body.byok?.apiKey || sessionByok) {
          const byokPayload = body.byok?.apiKey
            ? body.byok
            : {
                provider: sessionByok.providerId === 'claude-console' ? 'anthropic'
                  : (sessionByok.providerId === 'openai-api' ? 'openai' : 'gemini'),
                apiKey: sessionByok.apiKey,
                model: sessionByok.model
              };
          // Forward to Hub public/internal or run via Hub porting with byok if supported;
          // let's pass byok cleanly or execute local prompt if user used zai-coding-plan:
          if (sessionByok?.providerId === 'zai-coding-plan' && !body.byok?.apiKey) {
            const msg = await executeUserByokChat(sessionByok, {
              messages: [
                {
                  role: 'system',
                  content: `Port this ${sourceEngine} source to Godot 4.7.2 JSON: {"projectName":"...","summary":"...","files":[{"path":"project.godot","content":"..."},{"path":"scenes/main.tscn","content":"..."},{"path":"scripts/main.gd","content":"..."}],"parityNotes":[],"manualFollowUps":[]}`
                },
                { role: 'user', content: String(body.sourceCode || JSON.stringify(body.files || [])) }
              ]
            });
            const jsonMatch = String(msg.content || '').match(/\{[\s\S]*\}/);
            const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { files: [] };
            ported = {
              projectName,
              sourceEngine,
              summary: parsed.summary || `${sourceEngine} -> Godot 4.7.2 변환 완료 (본인 키 · 0 PlayCoin)`,
              files: Array.isArray(parsed.files) ? parsed.files : [],
              parityNotes: parsed.parityNotes || [],
              manualFollowUps: parsed.manualFollowUps || [],
              detectedMappings: [],
              billing: { authMode: 'user_byok', chargedCoins: 0 }
            };
          } else {
            // Use Hub internal porting or BYOK
            ported = await callHubInternal('/internal/v1/hub-agent/porting', {
              principalId,
              sourceEngine,
              projectName,
              files: body.files || [],
              sourceCode: body.sourceCode || '',
              instructions: body.instructions || '',
              model: body.model || '',
              byok: byokPayload
            });
          }
        } else {
          ported = await callHubInternal('/internal/v1/hub-agent/porting', {
            principalId,
            sourceEngine,
            projectName,
            files: body.files || [],
            sourceCode: body.sourceCode || '',
            instructions: body.instructions || '',
            model: body.model || ''
          });
        }

        let savedProject = null;
        if (typeof getPlatformStore === 'function' && (body.createNewProject === true || body.applyToProjectId)) {
          const store = getPlatformStore();
          if (store) {
            if (body.applyToProjectId && /^[a-f0-9]{24}$/.test(body.applyToProjectId)) {
              const cur = store.getProject(body.applyToProjectId);
              const mergedMap = new Map(Object.entries(cur.files || {}));
              for (const item of ported.files || []) {
                if (item?.path && typeof item.content === 'string') mergedMap.set(item.path, item.content);
              }
              const mergedFiles = [...mergedMap.entries()].map(([filePath, content]) => ({ path: filePath, content }));
              savedProject = await store.updateFiles(cur.id, {
                files: mergedFiles,
                baseRevision: cur.revision,
                clientId: 'hub-agent-porting'
              });
            } else if (body.createNewProject === true) {
              const created = await store.createProject({ name: ported.projectName || projectName, template: 'blank3d' });
              savedProject = await store.updateFiles(created.id, {
                files: ported.files,
                baseRevision: created.revision,
                clientId: 'hub-agent-porting'
              });
            }
          }
        }

        return replyJson(200, {
          ok: true,
          ...ported,
          savedProject: savedProject ? { id: savedProject.id, name: savedProject.name, revision: savedProject.revision } : null
        });
      } catch (err) {
        return replyJson(err.status || 502, {
          ok: false,
          error: err.message,
          code: err.code
        });
      }
    }

    return replyJson(404, { ok: false, error: 'Not found' });
  }

  return {
    enabled,
    runWithAuth,
    handleAgentChatRoute: (req, res, replyJson, auth) =>
      runWithAuth(auth, { feature: 'forge_chat', appendBillingFooter: true }, () =>
        handleAgentChatRoute(req, res, replyJson, auth)
      ),
    internalAgentChatProvider,
    handleBlenderWithHubAgent,
    handlePortingRoute,
    adaptAgentChatAddonFiles
  };
}

module.exports = {
  createHubAgentBridge,
  adaptAgentChatAddonFiles
};
