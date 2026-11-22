'use strict';

const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const { validateMeshRecipe, validatePlacement, sanitizeAssetName } = require('./engine-adapter.cjs');
const { planFromPrompt } = require('./prompt-planner.cjs');

let pendingGeminiOAuth = null;

function resolveGeminiAccountPaths(env = process.env) {
  const base = env.LOCALAPPDATA || env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  const privateDir = path.join(base, 'PlayForge', 'agent-chat');
  const accountDir = path.join(privateDir, 'gemini-account');
  const geminiConfigDir = path.join(accountDir, '.gemini');
  const workingDir = path.join(privateDir, 'scratch');
  return {
    accountDir,
    geminiConfigDir,
    workingDir,
    credsPath: path.join(geminiConfigDir, 'oauth_creds.json'),
    settingsPath: path.join(geminiConfigDir, 'settings.json'),
  };
}

function findManagedGeminiCli(env = process.env) {
  if (env.PLAYFORGE_GEMINI_EXECUTABLE && fs.existsSync(env.PLAYFORGE_GEMINI_EXECUTABLE)) {
    return { command: env.PLAYFORGE_GEMINI_EXECUTABLE, prefixArgs: [] };
  }
  const managed = path.resolve(__dirname, '..', '..', 'Saved', 'Tools', 'gemini-cli', 'node_modules', '@google', 'gemini-cli', 'bundle', 'gemini.js');
  if (fs.existsSync(managed)) {
    return { command: process.execPath, prefixArgs: [managed] };
  }
  return null;
}

function hasGeminiOAuthCreds(env = process.env) {
  const { credsPath } = resolveGeminiAccountPaths(env);
  if (!fs.existsSync(credsPath)) return false;
  try {
    const parsed = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
    return Boolean(parsed && (parsed.refresh_token || parsed.access_token));
  } catch {
    return false;
  }
}

async function startFixedGeminiOAuth(env = process.env) {
  const resolved = findManagedGeminiCli(env);
  if (!resolved) {
    const err = new Error('관리형 Gemini CLI 번들이 설치되어 있지 않습니다.');
    err.status = 502;
    throw err;
  }
  const paths = resolveGeminiAccountPaths(env);
  fs.mkdirSync(paths.geminiConfigDir, { recursive: true });
  fs.mkdirSync(paths.workingDir, { recursive: true });
  let settings = {};
  try {
    if (fs.existsSync(paths.settingsPath)) settings = JSON.parse(fs.readFileSync(paths.settingsPath, 'utf8'));
  } catch { settings = {}; }
  if (settings?.security?.auth?.selectedType !== 'oauth-personal') {
    settings = {
      ...settings,
      security: { ...(settings.security || {}), auth: { ...(settings.security?.auth || {}), selectedType: 'oauth-personal' } },
    };
    fs.writeFileSync(paths.settingsPath, JSON.stringify(settings, null, 2), 'utf8');
  }
  if (hasGeminiOAuthCreds(env)) {
    return { alreadyConnected: true, browserOpened: false, connectUrl: '' };
  }
  if (pendingGeminiOAuth && !pendingGeminiOAuth.child.killed && pendingGeminiOAuth.child.exitCode === null) {
    return { alreadyConnected: false, browserOpened: true, connectUrl: pendingGeminiOAuth.url || '' };
  }

  const childEnv = {
    ...env,
    GEMINI_CLI_HOME: paths.accountDir,
    GEMINI_TELEMETRY_ENABLED: 'false',
  };
  const child = spawn(resolved.command, [
    ...resolved.prefixArgs,
    '-p', 'Reply with OK',
    '-o', 'json',
    '--approval-mode', 'plan',
    '--skip-trust',
  ], {
    cwd: paths.workingDir,
    env: childEnv,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });

  const entry = { child, url: '', consented: false };
  pendingGeminiOAuth = entry;

  // Keep OAuth callback server alive up to 3 minutes for user login
  const killTimer = setTimeout(() => {
    try { child.kill(); } catch { /* ignore */ }
    if (pendingGeminiOAuth === entry) pendingGeminiOAuth = null;
  }, 180000);
  killTimer.unref();

  return await new Promise((resolve, reject) => {
    let buf = '';
    let settled = false;
    const finish = (err, val) => {
      if (settled) return;
      settled = true;
      clearTimeout(waitTimer);
      if (err) reject(err);
      else resolve(val);
    };
    const waitTimer = setTimeout(() => finish(null, { alreadyConnected: false, browserOpened: entry.consented, connectUrl: entry.url }), 12000);
    const onData = chunk => {
      const text = chunk.toString('utf8');
      buf += text;
      // Wait for the REAL [Y/n] prompt before writing 'y\n' (fixes 600ms premature stdin race)
      if (!entry.consented && /do you want to continue|\[y\/n\]/i.test(buf)) {
        entry.consented = true;
        try { child.stdin.write('y\n'); } catch { /* ignore */ }
        setTimeout(() => finish(null, { alreadyConnected: false, browserOpened: true, connectUrl: entry.url }), 1800);
      }
      const m = buf.match(/https:\/\/accounts\.google\.com\/[^\s"'<>]+/);
      if (m && !entry.url) {
        entry.url = m[0].replace(/[.,);]+$/, '');
        finish(null, { alreadyConnected: false, browserOpened: true, connectUrl: entry.url });
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('error', err => {
      clearTimeout(killTimer);
      if (pendingGeminiOAuth === entry) pendingGeminiOAuth = null;
      finish(err);
    });
    child.once('close', () => {
      clearTimeout(killTimer);
      if (pendingGeminiOAuth === entry) pendingGeminiOAuth = null;
      finish(null, { alreadyConnected: hasGeminiOAuthCreds(env), browserOpened: entry.consented, connectUrl: entry.url });
    });
  });
}

const SYSTEM_PROMPT = `You are a Senior 3D Technical Artist for PlayForge (Headless Blender + Web Godot).
Your job is to translate a user's natural language 3D asset request into a rich, accurate, well-proportioned declarative JSON 3D blueprint ("MeshRecipe v1") that Blender will assemble and export as glTF 2.0 (.glb).

STRICT OUTPUT RULES:
- Respond with ONLY ONE valid JSON object. No markdown fences, no commentary before or after.
- Use "archetype": "custom" and design the object using 16 to 48 well-connected 3D parts in "parts" so the silhouette and colors are immediately recognizable!
- Coordinate system (Blender Z-up, meters):
  * +X = right, -X = left (use symmetric pairs for arms, legs, eyes, wheels, wings!)
  * -Y = FRONT (facing the viewer/camera), +Y = back
  * +Z = UP, Z = 0 is the ground plane (feet/base should sit near Z = 0)
- Allowed part shapes: "box", "cylinder", "cone", "sphere", "icosphere", "torus", "capsule", "wedge"
- Every part object schema:
  {
    "name": "ChestPlate",
    "shape": "box",
    "position": [x, y, z],
    "rotationDeg": [rx, ry, rz],
    "scale": [sx, sy, sz],
    "topRadiusRatio": 1.0,
    "color": "#a81818",
    "metallic": 0.85,
    "roughness": 0.24,
    "emissionStrength": 0.0,
    "bevel": 0.015,
    "smooth": true,
    "segments": 16
  }
- Shape scale conventions:
  * "box", "wedge": scale = [widthX, depthY, heightZ]
  * "cylinder": bottom diameter = scale[0], top diameter = scale[0] * topRadiusRatio, height = scale[2] (default vertical along Z; rotate X=90 to point along Y)
  * "cone": base diameter = scale[0], height = scale[2]
  * "sphere", "icosphere": diameters = [scale[0], scale[1], scale[2]]
  * "capsule": diameter = min(scale[0], scale[1]), total height = scale[2]
  * "torus": outer diameter = scale[0], tube thickness ~ scale[2] * 0.18
- Make sure parts physically touch/overlap slightly so nothing floats awkwardly (unless intentionally floating like magic rings).
- Use realistic PBR values (metallic 0.8-0.95 & roughness 0.18-0.32 for painted armor/gold/steel; emissionStrength 2.0-4.0 for glowing eyes, arc reactors, visors, thrusters, magic cores).

Required top-level JSON fields:
{
  "name": "AsciiPascalName",
  "summary": "한 줄 한국어 설계 요약",
  "archetype": "custom",
  "style": "stylized",
  "dimensions": { "width": 1.0, "depth": 0.6, "height": 1.85 },
  "palette": { "primary": "#b81d24", "secondary": "#e5b82e", "accent": "#38e8ff" },
  "parts": [ ... ]
}`;

function invokeAgentChatProvider(agentChatProvider, method, urlPath, bodyObj = null) {
  return new Promise((resolve, reject) => {
    if (typeof agentChatProvider !== 'function') {
      return reject(Object.assign(new Error('Agent chat provider is unavailable'), { status: 503 }));
    }
    const rawBody = bodyObj ? Buffer.from(JSON.stringify(bodyObj), 'utf8') : null;
    const req = rawBody ? Readable.from([rawBody]) : Readable.from([]);
    req.method = method;
    req.url = urlPath;
    req.socket = { remoteAddress: '127.0.0.1', encrypted: false };
    req.headers = {
      host: '127.0.0.1',
      ...(rawBody ? { 'content-type': 'application/json', 'content-length': String(rawBody.length) } : {}),
    };
    req.complete = true;

    const res = new EventEmitter();
    res.destroyed = false;
    res.writableEnded = false;
    res.headers = {};
    res.setHeader = (k, v) => { res.headers[String(k).toLowerCase()] = v; };
    let statusCode = 200;
    const chunks = [];
    res.writeHead = (code, hdrs) => {
      statusCode = code;
      if (hdrs) Object.assign(res.headers, hdrs);
    };
    res.flushHeaders = () => {};
    res.write = chunk => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), 'utf8'));
      return true;
    };
    res.end = chunk => {
      if (chunk) res.write(chunk);
      res.writableEnded = true;
      const text = Buffer.concat(chunks).toString('utf8');
      let json = null;
      try { json = JSON.parse(text); } catch { /* ignore */ }
      resolve({ statusCode, json, text });
    };

    const replyJson = (code, payload) => {
      statusCode = code;
      res.writableEnded = true;
      resolve({ statusCode: code, json: payload, text: JSON.stringify(payload) });
    };

    Promise.resolve(agentChatProvider(req, res, replyJson)).catch(reject);
  });
}

function extractJsonObject(text) {
  const raw = String(text || '').trim();
  if (!raw) throw new Error('AI 모델이 빈 응답을 반환했습니다.');

  // 1. Direct JSON parse
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch { /* continue */ }

  // 2. Fenced code block ```json ... ```
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    try {
      const parsed = JSON.parse(fenceMatch[1].trim());
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch { /* continue */ }
  }

  // 3. Outermost { ... } slice
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first >= 0 && last > first) {
    const sliced = raw.slice(first, last + 1);
    const parsed = JSON.parse(sliced);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  }

  throw new Error('AI 모델 응답에서 유효한 MeshRecipe JSON을 추출하지 못했습니다.');
}

async function listAiModels(agentChatProvider) {
  const providers = [];
  let recommended = { provider: 'heuristic', model: 'offline-v1' };

  if (typeof agentChatProvider === 'function') {
    try {
      const res = await invokeAgentChatProvider(agentChatProvider, 'GET', '/api/agent-chat/providers');
      if (res.statusCode === 200 && Array.isArray(res.json?.providers)) {
        for (const p of res.json.providers) {
          const models = Array.isArray(p.models) && p.models.length
            ? p.models
            : (p.model ? [p.model] : []);
          const entry = {
            id: p.id,
            label: p.label || p.id,
            configured: Boolean(p.configured),
            auth: p.auth || (p.configured ? 'connected' : 'disconnected'),
            defaultModel: p.default_model || p.model || models[0] || '',
            models,
            detail: p.detail || '',
          };
          providers.push(entry);
        }
        // Pick best connected provider as default recommendation (prefer claude-connect or chatgpt-connect)
        const priority = ['claude-connect', 'chatgpt-connect', 'gemini-connect', 'claude-console', 'openai-api', 'gemini', 'ollama', 'zai-coding-plan'];
        for (const pref of priority) {
          const hit = providers.find(p => p.id === pref && p.configured && p.defaultModel);
          if (hit) {
            recommended = { provider: hit.id, model: hit.defaultModel };
            break;
          }
        }
      }
    } catch {
      // Ignore provider discovery error and fall back to heuristic
    }
  }

  providers.push({
    id: 'heuristic',
    label: '로컬 규칙 플래너 (오프라인 · 즉시)',
    configured: true,
    auth: 'builtin',
    defaultModel: 'offline-v1',
    models: ['offline-v1'],
    detail: 'LLM 호출 없이 내장 3D 아키타입과 규칙으로 즉시 생성합니다.',
  });

  return {
    ok: true,
    recommended,
    providers,
  };
}

async function planWithAi(input = {}, { agentChatProvider = null } = {}) {
  // If user directly supplied a structured recipe, validate without LLM
  if (input.recipe && typeof input.recipe === 'object') {
    const base = planFromPrompt(input);
    return {
      ...base,
      ai: { provider: 'direct-recipe', model: 'structured', usedLlm: false },
    };
  }

  const prompt = String(input.prompt || '').trim();
  if (!prompt) {
    const err = new Error('자연어 프롬프트(prompt) 또는 MeshRecipe(recipe)가 필요합니다.');
    err.status = 400;
    throw err;
  }

  const requestedProvider = String(input.aiProvider || 'auto').trim();
  const requestedModel = String(input.aiModel || '').trim();

  if (requestedProvider === 'heuristic') {
    const base = planFromPrompt(input);
    return {
      ...base,
      ai: { provider: 'heuristic', model: 'offline-v1', usedLlm: false },
    };
  }

  const catalog = await listAiModels(agentChatProvider);
  let targetProvider = requestedProvider;
  let targetModel = requestedModel;

  if (!targetProvider || targetProvider === 'auto') {
    targetProvider = catalog.recommended.provider;
    targetModel = requestedModel || catalog.recommended.model;
  } else {
    const found = catalog.providers.find(p => p.id === targetProvider);
    if (!found) {
      const err = new Error(`지원하지 않는 AI 공급자입니다: ${targetProvider}`);
      err.status = 400;
      throw err;
    }
    if (!found.configured) {
      const err = new Error(`선택한 AI 공급자(${found.label})가 아직 연결되어 있지 않습니다. 연결된 모델을 선택하거나 로컬 규칙 플래너를 사용해 주세요.`);
      err.status = 503;
      throw err;
    }
    if (!targetModel) targetModel = found.defaultModel;
  }

  if (targetProvider === 'heuristic' || !agentChatProvider) {
    const base = planFromPrompt(input);
    return {
      ...base,
      ai: {
        provider: 'heuristic',
        model: 'offline-v1',
        usedLlm: false,
        note: '연결된 LLM 모델이 없어 로컬 규칙 플래너를 사용했습니다.',
      },
    };
  }

  // Extract baseline placement hints from natural language (x=..., z=...)
  const placementBaseline = planFromPrompt({ prompt, placement: input.placement }).placement;

  const userPrompt = [
    `Create a detailed 3D MeshRecipe v1 JSON for the following request:`,
    `Request: "${prompt}"`,
    input.name ? `Preferred asset name: ${input.name}` : '',
    `Remember: return ONLY valid JSON with "archetype": "custom" and 16-48 detailed parts so the 3D model accurately looks like "${prompt}".`,
  ].filter(Boolean).join('\n');

  const chatBody = {
    provider: targetProvider,
    model: targetModel || undefined,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
  };

  try {
    const res = await invokeAgentChatProvider(agentChatProvider, 'POST', '/api/agent-chat', chatBody);
    if (res.statusCode !== 200 || !res.json?.message?.content) {
      const errMsg = res.json?.error || `AI 모델(${targetProvider}/${targetModel}) 호출 실패 (HTTP ${res.statusCode})`;
      throw Object.assign(new Error(errMsg), { status: res.statusCode >= 400 ? res.statusCode : 502 });
    }

    const rawObj = extractJsonObject(res.json.message.content);
    const mergedRaw = {
      ...rawObj,
      schemaVersion: 1,
      name: sanitizeAssetName(input.name || rawObj.name || 'AiGenerated3D', 'AiGenerated3D'),
      archetype: Array.isArray(rawObj.parts) && rawObj.parts.length > 0 ? 'custom' : (rawObj.archetype || 'custom'),
    };
    const recipe = validateMeshRecipe(mergedRaw);
    const placement = validatePlacement(input.placement || placementBaseline);

    const summary = typeof rawObj.summary === 'string' && rawObj.summary.trim()
      ? rawObj.summary.trim().slice(0, 200)
      : `${recipe.name} (${recipe.parts.length}개 커스텀 3D 파트 · ${recipe.style})`;

    const plan = {
      planner: `llm:${targetProvider}:${targetModel}`,
      prompt,
      summary,
      steps: [
        `1. AI 모델(${targetProvider} / ${targetModel})이 '${prompt}'의 3D 구조 설계 (${recipe.parts.length}개 파트 MeshRecipe v1)`,
        `2. 서버 JSON 스키마·치수·재질 검증 및 request.json 생성 (임의 파이썬 코드 실행 없음)`,
        `3. 무수정 공식 Headless Blender 독립 프로세스로 3D 메시 조립·PBR 적용·원점 정규화`,
        `4. glTF 2.0 (.glb) 바이너리 헤더·SHA-256 무결성 검증 및 에셋 저장`,
        `5. WebGL 프리뷰 및 Web Godot 에디터 씬 좌표 (${placement.position.join(', ')}) 자동 배치`,
      ],
    };

    return {
      plan,
      recipe,
      placement,
      ai: {
        provider: targetProvider,
        model: targetModel,
        usedLlm: true,
        partCount: recipe.parts.length,
      },
    };
  } catch (err) {
    // If user explicitly picked a specific LLM provider, surface error clearly instead of silently making a crate!
    if (requestedProvider && requestedProvider !== 'auto') {
      throw err;
    }
    // In auto mode, fall back gracefully AND report exact warning
    const fallback = planFromPrompt(input);
    fallback.plan.steps.unshift(`⚠️ AI 모델(${targetProvider}/${targetModel}) 호출 실패로 로컬 플래너로 대체: ${err.message}`);
    return {
      ...fallback,
      ai: {
        provider: 'heuristic-fallback',
        model: 'offline-v1',
        usedLlm: false,
        fallbackFrom: `${targetProvider}/${targetModel}`,
        warning: err.message,
      },
    };
  }
}

async function connectAiProvider(body = {}, { agentChatProvider = null } = {}) {
  if (typeof agentChatProvider !== 'function') {
    const err = new Error('AI 공급자 연결 기능이 이 서버 모드에서는 비활성화되어 있습니다.');
    err.status = 503;
    throw err;
  }
  const provider = String(body.provider || '').trim();
  if (!provider || provider === 'heuristic' || provider === 'auto') {
    const err = new Error('연결할 AI 공급자(예: gemini-connect, gemini, ollama, claude-connect 등)를 지정해 주세요.');
    err.status = 400;
    throw err;
  }

  // Use fixed Gemini CLI OAuth launcher that waits for the actual [Y/n] prompt before confirming
  if (provider === 'gemini-connect') {
    const oauth = await startFixedGeminiOAuth(process.env);
    const catalog = await listAiModels(agentChatProvider);
    return {
      ok: true,
      provider,
      connectUrl: oauth.connectUrl || '',
      browserOpened: Boolean(oauth.browserOpened),
      alreadyConnected: Boolean(oauth.alreadyConnected),
      ...catalog,
    };
  }

  const payload = { provider };
  if (typeof body.model === 'string' && body.model.trim()) payload.model = body.model.trim();
  if (typeof body.api_key === 'string' && body.api_key.trim()) payload.api_key = body.api_key.trim();
  if (typeof body.code === 'string' && body.code.trim()) payload.code = body.code.trim();
  if (provider === 'ollama' && !payload.model) {
    const cur = await listAiModels(agentChatProvider);
    const ol = cur.providers.find(p => p.id === 'ollama');
    if (ol?.models?.[0]) payload.model = ol.models[0];
  }

  const res = await invokeAgentChatProvider(agentChatProvider, 'POST', '/api/agent-chat/providers/connect', payload);
  if (res.statusCode >= 400) {
    const err = new Error(res.json?.error || `공급자 연결 실패 (HTTP ${res.statusCode})`);
    err.status = res.statusCode;
    throw err;
  }
  const catalog = await listAiModels(agentChatProvider);
  return {
    ok: true,
    provider,
    connectUrl: res.json?.connect_url || '',
    browserOpened: Boolean(res.json?.browser_opened),
    ...catalog,
  };
}

module.exports = {
  SYSTEM_PROMPT,
  invokeAgentChatProvider,
  extractJsonObject,
  listAiModels,
  connectAiProvider,
  planWithAi,
};
