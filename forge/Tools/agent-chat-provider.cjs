'use strict';

const { createClaudeRequest, readClaudeMessage } = require('./agent-chat-claude.cjs');
const { createClaudeCliProvider } = require('./agent-chat-claude-cli.cjs');
const { createCodexProvider } = require('./agent-chat-codex.cjs');
const { createGeminiCliProvider } = require('./agent-chat-gemini-cli.cjs');
const { CONNECTIONS, createCompatibleRequest, readCompatibleMessage } = require('./agent-chat-openai.cjs');
const { totalmem } = require('node:os');

const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434/api/chat';
const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-5-5';
const CHAT_PATH = '/api/agent-chat';
const PROVIDERS_PATH = CHAT_PATH + '/providers';
const CONNECT_PATH = PROVIDERS_PATH + '/connect';
const DISCONNECT_PATH = PROVIDERS_PATH + '/disconnect';
const PROVIDERS = ['ollama', 'claude-console', 'chatgpt-connect', 'claude-connect', 'gemini-connect', ...Object.keys(CONNECTIONS)];
const MAX_BODY_BYTES = 256 * 1024;
const MAX_IMAGE_BYTES = 512 * 1024;
const MAX_IMAGES = 2;
const MAX_IMAGE_BASE64_BYTES = Math.ceil(MAX_IMAGE_BYTES / 3) * 4;
const MAX_CHAT_BYTES = MAX_BODY_BYTES + MAX_IMAGES * MAX_IMAGE_BASE64_BYTES;
const MAX_MESSAGES = 64;
const MAX_TOOLS = 24;
const MAX_IN_FLIGHT = 2;
const BODY_TIMEOUT_MS = 5000;
const PROVIDER_TIMEOUT_MS = 180000;
const OLLAMA_CATALOG_TIMEOUT_MS = 1500;
const OLLAMA_CATALOG_TTL_MS = 4000;
const OLLAMA_RECOMMENDED_MODEL = 'qwen3:4b';
const GIB = 1024 ** 3;
const MESSAGE_ROLES = new Set(['system', 'user', 'assistant', 'tool']);
const CODEX_EFFORTS = new Set(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra']);
const CODEX_TIERS = new Set(['default', 'fast']);
const PROXY_HEADERS = ['forwarded', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'x-real-ip', 'cf-connecting-ip'];

function isLoopbackHost(hostname) {
  return ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
}

function isLocalRequest(request) {
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress)) return false;
  if (PROXY_HEADERS.some(name => request.headers[name] != null)) return false;
  const host = request.headers.host;
  if (typeof host !== 'string' || !/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i.test(host)) return false;
  let target;
  try {
    target = new URL(`${request.socket.encrypted ? 'https' : 'http'}://${host}`);
  } catch {
    return false;
  }
  return !['cross-site', 'same-site'].includes(request.headers['sec-fetch-site']) &&
    (request.headers.origin == null || request.headers.origin === target.origin);
}

function readModel(value) {
  if (typeof value !== 'string') return '';
  const model = value.trim();
  return model && model.length <= 128 && !/[\x00-\x1f\x7f]/.test(model) ? model : '';
}

function readOllamaUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || !isLoopbackHost(url.hostname) ||
      url.username || url.password || url.hash || url.search) return null;
  // Resolve an explicitly local Ollama endpoint without depending on DNS.
  if (url.hostname === 'localhost') url.hostname = '127.0.0.1';
  return url;
}

function readOllamaConfiguration(env, modelOverride, urlOverride) {
  const model = modelOverride ?? readModel(env.PLAYFORGE_AGENT_MODEL);
  const url = model && (urlOverride ?? readOllamaUrl(env.PLAYFORGE_OLLAMA_URL?.trim() || DEFAULT_OLLAMA_URL));
  return url ? { model, url } : null;
}

function errorWithStatus(status, message) {
  return Object.assign(new Error(message), { status });
}

function readRequest(request, maxBytes = MAX_BODY_BYTES) {
  if (Number(request.headers['content-length']) > maxBytes) {
    return Promise.reject(errorWithStatus(413, 'Agent chat request is too large.'));
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    const timer = setTimeout(() => finish(errorWithStatus(408, 'Agent chat request timed out.')), BODY_TIMEOUT_MS);
    const onError = () => finish(errorWithStatus(400, 'Agent chat request could not be read.'));
    const onClose = () => { if (!request.complete) onError(); };
    const onData = chunk => {
      bytes += chunk.length;
      if (bytes > maxBytes) finish(errorWithStatus(413, 'Agent chat request is too large.'));
      else chunks.push(chunk);
    };
    const onEnd = () => finish();
    function finish(error) {
      clearTimeout(timer);
      request.off('data', onData).off('end', onEnd).off('error', onError).off('close', onClose);
      if (error) reject(error);
      else resolve(Buffer.concat(chunks, bytes));
    }
    request.on('data', onData).once('end', onEnd).once('error', onError).once('close', onClose);
  });
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validFunctionName(name) {
  return typeof name === 'string' && name.length > 0 && name.length <= 96 && !/[\x00-\x1f\x7f]/.test(name);
}

function validToolCalls(calls) {
  return Array.isArray(calls) && calls.length <= MAX_TOOLS && calls.every(call =>
    isObject(call) && isObject(call.function) && validFunctionName(call.function.name) && isObject(call.function.arguments));
}

function parseMessages(body) {
  const { messages, tools = [] } = body || {};
  if (!isObject(body) || !Array.isArray(messages) || !messages.length || messages.length > MAX_MESSAGES ||
      !Array.isArray(tools) || tools.length > MAX_TOOLS) {
    throw errorWithStatus(400, 'Agent chat requires a bounded messages array and optional tools array.');
  }
  if (tools.some(tool => !isObject(tool) || tool.type !== 'function' || !isObject(tool.function) ||
      !validFunctionName(tool.function.name) || (tool.function.parameters != null && !isObject(tool.function.parameters)))) {
    throw errorWithStatus(400, 'Agent chat tool definitions must use the Ollama function schema.');
  }
  const history = messages.map(message => {
    if (!isObject(message) || !MESSAGE_ROLES.has(message.role) ||
        (message.tool_calls != null && !validToolCalls(message.tool_calls)) ||
        (message.tool_name != null && !validFunctionName(message.tool_name))) {
      throw errorWithStatus(400, 'Agent chat contains an invalid message.');
    }
    const content = message.content ?? (message.tool_calls?.length ? '' : null);
    if (typeof content !== 'string') throw errorWithStatus(400, 'Agent chat message content must be text.');
    return {
      role: message.role, content,
      ...(message.tool_calls != null ? { tool_calls: message.tool_calls } : {}),
      ...(message.tool_name != null ? { tool_name: message.tool_name } : {}),
    };
  });
  return { messages: history, tools };
}

async function readProviderBody(response, label) {
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    if (response.status === 401 || response.status === 403) {
      throw errorWithStatus(502, `${label} did not accept the configured credentials.`);
    }
    throw errorWithStatus(502, `${label} could not respond.`);
  }
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) throw errorWithStatus(502, `${label} returned a response that is too large.`);
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, bytes)));
}

function readProviderMessage(message, label) {
  if (!isObject(message) || typeof message.role !== 'string' || typeof message.content !== 'string' ||
      (message.tool_calls != null && !validToolCalls(message.tool_calls))) {
    throw errorWithStatus(502, `${label} returned an invalid message.`);
  }
  const normalized = { role: message.role, content: message.content, tool_calls: message.tool_calls ?? [] };
  if (Buffer.byteLength(JSON.stringify(normalized)) > MAX_BODY_BYTES) {
    throw errorWithStatus(502, `${label} returned a response that is too large.`);
  }
  return normalized;
}

function readTurnOptions(body, provider) {
  const { model, reasoning_effort: effort, service_tier: serviceTier } = body;
  if (model !== undefined && (typeof model !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(model))) {
    throw errorWithStatus(400, 'Provide a valid model ID for this turn.');
  }
  if (effort !== undefined || serviceTier !== undefined) {
    if (serviceTier !== undefined && provider !== 'chatgpt-connect') {
      throw errorWithStatus(400, 'Fast speed is available with ChatGPT Connect.');
    }
    if (effort !== undefined && !['chatgpt-connect', 'claude-connect'].includes(provider)) {
      throw errorWithStatus(400, 'Reasoning effort is available with ChatGPT Connect or Claude Connect.');
    }
    if (effort !== undefined && (typeof effort !== 'string' || !/^[a-z][a-z0-9_-]{0,31}$/.test(effort))) {
      throw errorWithStatus(400, 'Select a supported reasoning effort.');
    }
    if (serviceTier !== undefined && !CODEX_TIERS.has(serviceTier)) throw errorWithStatus(400, 'Select default or fast speed.');
  }
  return { model, effort, serviceTier };
}

const IMAGE_SIGNATURES = {
  'image/png': bytes => bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  'image/jpeg': bytes => bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255,
  'image/webp': bytes => bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP',
};

function readImages(images, provider) {
  if (images === undefined) return [];
  if (!Array.isArray(images) || images.length > MAX_IMAGES) {
    throw errorWithStatus(400, 'Attach up to two images.');
  }
  if (images.length && provider !== 'chatgpt-connect') {
    throw errorWithStatus(400, 'Image attachments are available with ChatGPT Connect.');
  }
  return images.map(image => {
    if (!isObject(image) || Object.keys(image).length !== 2 || typeof image.mime !== 'string' ||
        !Object.hasOwn(IMAGE_SIGNATURES, image.mime) ||
        typeof image.data !== 'string' || !image.data.length) {
      throw errorWithStatus(400, 'Use a PNG, JPEG, or WebP image attachment.');
    }
    if (image.data.length > MAX_IMAGE_BASE64_BYTES) throw errorWithStatus(413, 'Each image must be at most 512 KiB.');
    const bytes = Buffer.from(image.data, 'base64');
    if (bytes.length > MAX_IMAGE_BYTES) throw errorWithStatus(413, 'Each image must be at most 512 KiB.');
    if (bytes.toString('base64') !== image.data || !IMAGE_SIGNATURES[image.mime](bytes)) {
      throw errorWithStatus(400, 'The image data does not match its attachment format.');
    }
    return { mime: image.mime, data: image.data };
  });
}

function createChatStream(response) {
  let started = false;
  let blocked = false;
  let bytes = 0;
  let pending = [];

  function start() {
    if (started || response.destroyed) return;
    started = true;
    response.writeHead(200, {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    });
    response.flushHeaders();
    response.on('drain', drain);
  }

  function drain() {
    const frames = pending;
    pending = [];
    blocked = false;
    for (const frame of frames) push(frame);
  }

  function push(frame) {
    if (response.destroyed) return;
    if (blocked) pending.push(frame);
    else blocked = !response.write(frame);
  }

  function delta(text) {
    if (response.destroyed) return true;
    const frame = JSON.stringify({ type: 'delta', text }) + '\n';
    bytes += Buffer.byteLength(frame);
    if (bytes > MAX_BODY_BYTES) return false;
    start();
    push(frame);
    return true;
  }

  function finish(frame) {
    response.off('drain', drain);
    if (response.destroyed) return;
    start();
    response.end(pending.join('') + JSON.stringify(frame) + '\n');
    pending = [];
    response.off('drain', drain);
  }

  return { start, delta, finish, get started() { return started; } };
}

function createAgentChatProvider({
  env = process.env, timeoutMs = PROVIDER_TIMEOUT_MS, fetchProvider = fetch, codex = createCodexProvider({ env }),
  claudeCli = createClaudeCliProvider({ env }), geminiCli = createGeminiCliProvider({ env }),
  fetchOllamaCatalog = fetch, totalMemoryBytes = totalmem(),
} = {}) {
  let inFlight = 0;
  let modifying = false;
  let ollamaModel;
  let ollamaManualUrl;
  let ollamaCatalog;
  let chatgptModel = readModel(env.PLAYFORGE_CODEX_MODEL);
  let probeCodex = false;
  let codexCatalog;
  let claudeCliModel = readModel(env.PLAYFORGE_CLAUDE_CLI_MODEL);
  let probeClaudeCli = false;
  let geminiCliModel = readModel(env.PLAYFORGE_GEMINI_CLI_MODEL);
  let probeGeminiCli = false;
  const claudeModel = readModel(env.PLAYFORGE_CLAUDE_MODEL) || DEFAULT_CLAUDE_MODEL;
  let claude = env.ANTHROPIC_API_KEY ? {
    model: claudeModel, key: env.ANTHROPIC_API_KEY, workspace: env.ANTHROPIC_WORKSPACE_ID,
  } : null;
  const compatible = Object.fromEntries(Object.entries(CONNECTIONS).map(([id, settings]) => [
    id, env[settings.keyEnv] ? {
      model: readModel(env[settings.modelEnv]) || settings.defaultModel, key: env[settings.keyEnv], models: settings.models ?? [],
    } : null,
  ]));

  async function modelsAt(url, headers, signal, label, pattern) {
    const response = await fetchProvider(url, { headers, signal, redirect: 'error' });
    if (!response.ok) {
      await response.body?.cancel();
      throw errorWithStatus(400, `${label} could not verify the API key.`);
    }
    const data = await readProviderBody(response, label);
    if (!Array.isArray(data?.data)) throw errorWithStatus(502, `${label} did not return a model list.`);
    return data.data.map(item => readModel(item?.id)).filter(model => model && pattern.test(model)).slice(0, 100);
  }

  function currentOllamaUrl() {
    return ollamaManualUrl ?? readOllamaUrl(env.PLAYFORGE_OLLAMA_URL?.trim() || DEFAULT_OLLAMA_URL);
  }

  async function fetchInstalledOllamaModels(base) {
    const signal = AbortSignal.timeout(OLLAMA_CATALOG_TIMEOUT_MS);
    const response = await fetchOllamaCatalog(new URL('/api/tags', base), { signal, redirect: 'error' });
    const { models } = await readProviderBody(response, 'Ollama');
    if (!Array.isArray(models)) return { available: false, details: [] };
    const details = new Map();
    for (const entry of models) {
      if (details.size >= 100) break;
      const name = readModel(entry?.name) || readModel(entry?.model);
      if (!name || details.has(name)) continue;
      const size = Number.isSafeInteger(entry.size) && entry.size > 0 ? entry.size : null;
      // Allow 20% for runtime overhead plus 2 GiB for the OS and chat context.
      // Compare physical RAM because Ollama can fall back to CPU inference.
      const minimumMemory = size === null ? null : Math.ceil(size * 1.2 + 2 * GIB);
      details.set(name, {
        name, recommended: false, below_minimum: minimumMemory !== null && minimumMemory > totalMemoryBytes,
        size_bytes: size, minimum_memory_bytes: minimumMemory,
      });
    }
    const preferred = details.get(OLLAMA_RECOMMENDED_MODEL);
    if (preferred?.size_bytes != null && !preferred.below_minimum) {
      try {
        const infoResponse = await fetchOllamaCatalog(new URL('/api/show', base), {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: preferred.name }),
          signal, redirect: 'error',
        });
        const info = await readProviderBody(infoResponse, 'Ollama');
        preferred.recommended = Array.isArray(info?.capabilities) && info.capabilities.includes('tools');
      } catch {
        // A service can expose installed models without capability metadata.
      }
    }
    return { available: true, details: [...details.values()] };
  }

  function installedOllamaModels(base) {
    if (!base) return Promise.resolve({ available: false, details: [] });
    if (ollamaCatalog?.origin !== base.origin) {
      ollamaCatalog = { origin: base.origin, expiresAt: 0, details: [], available: false };
    }
    const catalog = ollamaCatalog;
    if (Date.now() < catalog.expiresAt) return Promise.resolve(catalog);
    catalog.refresh ??= fetchInstalledOllamaModels(base).catch(() => ({ available: false, details: [] })).then(result => {
      Object.assign(catalog, result, { expiresAt: Date.now() + OLLAMA_CATALOG_TTL_MS, refresh: undefined });
      return catalog;
    });
    return catalog.refresh;
  }

  async function status() {
    const ollamaUrl = currentOllamaUrl();
    const ollama = readOllamaConfiguration(env, ollamaModel, ollamaUrl);
    const installed = installedOllamaModels(ollamaUrl);
    let auth = 'disconnected';
    if (probeCodex || codex.hasProfile?.()) {
      try {
        const account = await codex.account();
        if (account.connected) {
          auth = 'connected';
          if (!codexCatalog && codex.listModels) codexCatalog = await codex.listModels().catch(() => undefined);
        }
        else if (account.pending) auth = 'pending';
      } catch {
        auth = 'unavailable';
      }
    }
    let claudeCliAuth = 'disconnected';
    let claudeCliEmail = '';
    if (probeClaudeCli || claudeCli.hasProfile?.()) {
      try {
        const account = await claudeCli.account();
        if (account.connected) {
          claudeCliAuth = 'connected';
          claudeCliEmail = account.email || '';
        } else if (account.pending) claudeCliAuth = 'pending';
      } catch {
        claudeCliAuth = 'unavailable';
      }
    }
    const claudeCliCatalog = claudeCli.listModels ? claudeCli.listModels() : { models: [], defaultModel: '', reasoningEfforts: {} };

    let geminiCliAuth = 'disconnected';
    let geminiCliEmail = '';
    if (probeGeminiCli || geminiCli.hasProfile?.()) {
      try {
        const account = await geminiCli.account();
        if (account.connected) {
          geminiCliAuth = 'connected';
          geminiCliEmail = account.email || '';
        } else if (account.pending) geminiCliAuth = 'pending';
      } catch {
        geminiCliAuth = 'unavailable';
      }
    }
    const geminiCliCatalog = geminiCli.listModels ? geminiCli.listModels() : { models: [], defaultModel: '', reasoningEfforts: {} };

    const { available, details: modelDetails } = await installed;
    return { providers: [
      { id: 'ollama', label: 'Ollama', configured: Boolean(ollama), model: ollama?.model ?? '',
        auth: ollama ? 'connected' : 'disconnected', detail: 'Local Ollama model.',
        available, url: ollamaUrl?.origin ?? '',
        models: modelDetails.map(item => item.name), model_details: modelDetails },
      { id: 'claude-console', label: 'Claude API', configured: Boolean(claude), model: claude?.model ?? claudeModel,
        auth: claude ? 'connected' : 'disconnected', detail: 'Claude Console API key.', models: claude?.models ?? [] },
      { id: 'chatgpt-connect', label: 'ChatGPT', configured: auth === 'connected',
        model: chatgptModel || codexCatalog?.defaultModel || '', default_model: codexCatalog?.defaultModel ?? '',
        auth, streaming: true, detail: 'ChatGPT account through the official Codex CLI.', models: codexCatalog?.models ?? [],
        reasoning_efforts: codexCatalog?.reasoningEfforts ?? {} },
      { id: 'claude-connect', label: 'Claude', configured: claudeCliAuth === 'connected',
        model: claudeCliModel || claudeCliCatalog.defaultModel || '', default_model: claudeCliCatalog.defaultModel || '',
        auth: claudeCliAuth, streaming: true, email: claudeCliEmail,
        detail: 'Claude account through browser OAuth (Claude Code CLI).',
        models: claudeCliCatalog.models ?? [], reasoning_efforts: claudeCliCatalog.reasoningEfforts ?? {} },
      { id: 'gemini-connect', label: 'Gemini', configured: geminiCliAuth === 'connected',
        model: geminiCliModel || geminiCliCatalog.defaultModel || '', default_model: geminiCliCatalog.defaultModel || '',
        auth: geminiCliAuth, streaming: true, email: geminiCliEmail,
        detail: 'Google account through browser OAuth (Gemini CLI).',
        models: geminiCliCatalog.models ?? [], reasoning_efforts: geminiCliCatalog.reasoningEfforts ?? {} },
      ...Object.entries(CONNECTIONS).map(([id, settings]) => ({
        id, label: settings.label, detail: settings.detail, configured: Boolean(compatible[id]),
        model: compatible[id]?.model ?? settings.defaultModel, models: compatible[id]?.models ?? settings.models ?? [],
        auth: compatible[id] ? 'connected' : 'disconnected',
      })),
    ] };
  }

  async function changeProvider(body, connect, signal) {
    if (!isObject(body) || !PROVIDERS.includes(body.provider)) {
      throw errorWithStatus(400, 'Select an available agent chat provider.');
    }
    if (modifying) throw errorWithStatus(409, 'Another provider connection is being updated.');
    modifying = true;
    try {
      let connectUrl;
      let browserOpened = false;
      const model = readModel(body.model);
      if (connect && body.model && !model) throw errorWithStatus(400, 'Provide a valid model name.');
      switch (body.provider) {
        case 'ollama': {
          let manualUrl = ollamaManualUrl;
          if (connect && body.url !== undefined) {
            if (typeof body.url !== 'string') throw errorWithStatus(400, 'Enter a loopback Ollama URL.');
            const value = body.url.trim();
            manualUrl = value ? readOllamaUrl(value) : undefined;
            if (value && (!manualUrl || !['/', '/api/chat'].includes(manualUrl.pathname))) {
              throw errorWithStatus(400, 'Enter a loopback Ollama URL with no path, or with /api/chat.');
            }
            if (manualUrl) manualUrl.pathname = '/api/chat';
          }
          const endpoint = manualUrl ?? readOllamaUrl(env.PLAYFORGE_OLLAMA_URL?.trim() || DEFAULT_OLLAMA_URL);
          if (connect && (!endpoint || (!model && body.url === undefined))) {
            throw errorWithStatus(400, 'Enter an Ollama model name and use a loopback Ollama URL.');
          }
          ollamaManualUrl = manualUrl;
          if (!connect || model) ollamaModel = connect ? model : '';
          break;
        }
        case 'claude-console':
          if (connect) {
            const key = typeof body.api_key === 'string' && body.api_key.trim() ? body.api_key.trim() : claude?.key;
            if (!key || !/^sk-ant-[A-Za-z0-9_-]{8,200}$/.test(key)) {
              throw errorWithStatus(400, 'Enter a Claude Console API key.');
            }
            const workspace = typeof body.workspace === 'string' ? body.workspace.trim() : claude?.workspace;
            if ((body.workspace != null && typeof body.workspace !== 'string') ||
                (workspace && !/^wrkspc_[A-Za-z0-9]{1,100}$/.test(workspace))) {
              throw errorWithStatus(400, 'Enter a valid Claude workspace ID.');
            }
            const candidate = { key, model: model || claude?.model || claudeModel, workspace };
            const { headers } = createClaudeRequest(candidate, { messages: [], tools: [] });
            const response = await fetchProvider(`https://api.anthropic.com/v1/models/${encodeURIComponent(candidate.model)}`, {
              headers, signal, redirect: 'error',
            });
            await response.body?.cancel();
            if (!response.ok) throw errorWithStatus(400, 'Claude Console could not verify the key, workspace, and model.');
            candidate.models = await modelsAt('https://api.anthropic.com/v1/models?limit=100', headers, signal,
              'Claude Console', /^claude-/).catch(() => []);
            claude = candidate;
          } else {
            claude = null;
          }
          break;
        case 'chatgpt-connect':
          probeCodex = true;
          if (connect) {
            try {
              connectUrl = await codex.connect();
            } catch {
              throw errorWithStatus(502, 'Could not start ChatGPT sign-in. Verify the official Codex CLI is available.');
            }
            chatgptModel = model || readModel(env.PLAYFORGE_CODEX_MODEL);
          } else {
            await codex.disconnect();
            codexCatalog = undefined;
            chatgptModel = '';
            probeCodex = false;
          }
          break;
        case 'claude-connect':
          probeClaudeCli = true;
          if (connect) {
            try {
              const code = typeof body.code === 'string' && body.code.trim() ? body.code.trim() : undefined;
              connectUrl = await claudeCli.connect({ code });
              browserOpened = !code;
            } catch {
              throw errorWithStatus(502, 'Could not start Claude browser sign-in. Verify Claude Code CLI is installed.');
            }
            if (model) claudeCliModel = model;
          } else {
            await claudeCli.disconnect();
            claudeCliModel = '';
            probeClaudeCli = false;
          }
          break;
        case 'gemini-connect':
          probeGeminiCli = true;
          if (connect) {
            try {
              connectUrl = await geminiCli.connect();
              browserOpened = true;
            } catch {
              throw errorWithStatus(502, 'Could not start Gemini browser sign-in. Verify Gemini CLI is installed.');
            }
            if (model) geminiCliModel = model;
          } else {
            await geminiCli.disconnect();
            geminiCliModel = '';
            probeGeminiCli = false;
          }
          break;
        default: {
          const { provider } = body;
          const settings = CONNECTIONS[provider];
          if (!connect) {
            compatible[provider] = null;
            break;
          }
          const previous = compatible[provider];
          const key = typeof body.api_key === 'string' && body.api_key.trim() ? body.api_key.trim() : previous?.key;
          if (!key || !(settings.keyPattern ?? /^[A-Za-z0-9_-]{8,250}$/).test(key)) {
            throw errorWithStatus(400, `Enter a valid ${settings.label} API key.`);
          }
          const models = settings.models ?? await modelsAt(`${settings.base}/models`,
            { authorization: `Bearer ${key}` }, signal, settings.label, settings.modelPattern);
          const selected = model || previous?.model || (models.includes(settings.defaultModel) ? settings.defaultModel : models[0]);
          if (!selected || !models.includes(selected)) throw errorWithStatus(400, `Choose a model available to this ${settings.label} account.`);
          compatible[provider] = { model: selected, key, models };
        }
      }
      return {
        ...(await status()),
        ...(connectUrl ? { connect_url: connectUrl } : {}),
        ...(browserOpened ? { browser_opened: true } : {}),
      };
    } finally {
      modifying = false;
    }
  }

  async function handleAgentChat(request, response, replyJson) {
    const json = replyJson ?? ((statusCode, payload) => {
      response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(payload));
    });
    const fail = (status, error) => {
      request.resume();
      if (!response.destroyed) json(status, { error });
    };
    if (!isLocalRequest(request)) return fail(403, 'Agent chat is available from the local editor only.');
    const expectedMethod = request.url === PROVIDERS_PATH ? 'GET' : 'POST';
    if (request.method !== expectedMethod) {
      response.setHeader('Allow', expectedMethod);
      return fail(405, `Agent chat requires ${expectedMethod}.`);
    }
    if (request.url === PROVIDERS_PATH) return json(200, await status());
    if (request.headers['content-type']?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
      return fail(415, 'Agent chat requires JSON.');
    }
    if (inFlight >= MAX_IN_FLIGHT) return fail(429, 'The local agent chat is busy.');
    inFlight += 1;
    const disconnect = new AbortController();
    const onClose = () => disconnect.abort();
    response.once('close', onClose);
    try {
      const bytes = await readRequest(request, request.url === CHAT_PATH ? MAX_CHAT_BYTES : MAX_BODY_BYTES);
      let body;
      try {
        body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      } catch {
        throw errorWithStatus(400, 'Agent chat request is not valid UTF-8 JSON.');
      }
      const timeout = AbortSignal.timeout(timeoutMs);
      const signal = AbortSignal.any([timeout, disconnect.signal]);
      if (request.url === CONNECT_PATH || request.url === DISCONNECT_PATH) {
        try {
          const settings = await changeProvider(body, request.url === CONNECT_PATH, signal);
          if (!response.destroyed) json(200, settings);
        } catch (error) {
          if (timeout.aborted) return fail(504, 'Agent chat provider connection timed out.');
          fail(error.status || 502, error.status ? error.message : 'Could not update the agent chat provider connection.');
        }
        return;
      }
      const provider = body?.provider ?? 'ollama';
      if (!PROVIDERS.includes(provider)) return fail(400, 'Select an available agent chat provider.');
      const images = readImages(body?.images, provider);
      if (bytes.length - images.reduce((size, image) => size + image.data.length, 0) > MAX_BODY_BYTES) {
        return fail(413, 'Agent chat request is too large.');
      }
      const configured = provider === 'ollama' ? readOllamaConfiguration(env, ollamaModel, ollamaManualUrl)
        : provider === 'claude-console' ? claude : compatible[provider];
      if (provider === 'ollama' && !configured) return fail(503, 'Configure PLAYFORGE_AGENT_MODEL and a loopback Ollama URL on the server.');
      if (provider === 'claude-console' && !configured) return fail(503, 'Connect Claude Console first.');
      if (CONNECTIONS[provider] && !configured) return fail(503, `Connect ${CONNECTIONS[provider].label} first.`);
      const conversation = parseMessages(body);
      const { model, effort, serviceTier } = readTurnOptions(body, provider);
      const claudeCliCatalog = claudeCli.listModels ? claudeCli.listModels() : { models: [], defaultModel: '', reasoningEfforts: {} };
      const geminiCliCatalog = geminiCli.listModels ? geminiCli.listModels() : { models: [], defaultModel: '', reasoningEfforts: {} };
      const catalog = provider === 'chatgpt-connect' ? codexCatalog?.models
        : provider === 'claude-connect' ? claudeCliCatalog.models
          : provider === 'gemini-connect' ? geminiCliCatalog.models
            : provider === 'ollama' ? ollamaCatalog?.details.map(item => item.name) : configured?.models;
      const configuredModel = provider === 'chatgpt-connect' ? chatgptModel || codexCatalog?.defaultModel
        : provider === 'claude-connect' ? claudeCliModel || claudeCliCatalog.defaultModel
          : provider === 'gemini-connect' ? geminiCliModel || geminiCliCatalog.defaultModel
            : configured?.model;
      if (model && model !== configuredModel && catalog?.length && !catalog.includes(model)) {
        return fail(400, 'Select a model available to this provider.');
      }
      const modelEfforts = provider === 'claude-connect'
        ? claudeCliCatalog.reasoningEfforts?.[model || configuredModel]
        : codexCatalog?.reasoningEfforts?.[model || configuredModel];
      if (effort && !(modelEfforts?.length ? modelEfforts.includes(effort) : CODEX_EFFORTS.has(effort))) {
        return fail(400, 'Select a reasoning effort supported by this model.');
      }
      const label = CONNECTIONS[provider]?.label ??
        {
          ollama: 'The local Ollama model',
          'claude-console': 'Claude API',
          'chatgpt-connect': 'ChatGPT Connect',
          'claude-connect': 'Claude',
          'gemini-connect': 'Gemini',
        }[provider];
      const stream = ['chatgpt-connect', 'claude-connect', 'gemini-connect'].includes(provider) && body.stream === true
        ? createChatStream(response) : null;
      const streamHandlers = stream ? {
        onStart: stream.start,
        onDelta: text => {
          if (!streamOverflow && !stream.delta(text)) {
            streamOverflow = true;
            disconnect.abort();
          }
        },
      } : {};
      let streamOverflow = false;
      try {
        let upstreamMessage;
        if (provider === 'chatgpt-connect') {
          probeCodex = true;
          upstreamMessage = await codex.chat(conversation, model || configuredModel, signal, {
            effort, serviceTier, images, ...streamHandlers,
          });
        } else if (provider === 'claude-connect') {
          probeClaudeCli = true;
          upstreamMessage = await claudeCli.chat(conversation, model || configuredModel, signal, {
            effort, ...streamHandlers,
          });
        } else if (provider === 'gemini-connect') {
          probeGeminiCli = true;
          upstreamMessage = await geminiCli.chat(conversation, model || configuredModel, signal, {
            ...streamHandlers,
          });
        } else {
          const turnConfig = { ...configured, model: model || configuredModel };
          const upstream = CONNECTIONS[provider] ? createCompatibleRequest(provider, turnConfig, conversation)
            : provider === 'claude-console' ? createClaudeRequest(turnConfig, conversation)
              : { url: turnConfig.url, body: { model: turnConfig.model, ...conversation, stream: false } };
          const result = await fetchProvider(upstream.url, {
            method: 'POST', redirect: 'error', signal,
            headers: { 'content-type': 'application/json; charset=utf-8', accept: 'application/json', ...upstream.headers },
            body: JSON.stringify(upstream.body),
          });
          const data = await readProviderBody(result, label);
          upstreamMessage = CONNECTIONS[provider] ? readCompatibleMessage(data, provider)
            : provider === 'claude-console' ? readClaudeMessage(data) : data?.message;
        }
        if (streamOverflow) throw new Error('Agent chat stream exceeded its limit.');
        const message = readProviderMessage(upstreamMessage, label);
        if (stream) stream.finish({ type: 'final', message });
        else if (!response.destroyed) json(200, { message });
      } catch (error) {
        const status = timeout.aborted ? 504 : error.status || 502;
        const message = streamOverflow ? 'Agent chat response is too large.'
          : timeout.aborted ? `${label} timed out.`
            : error.status ? error.message : `${label} could not respond.`;
        if (stream?.started) stream.finish({ type: 'error', error: message });
        else fail(status, message);
      }
    } catch (error) {
      fail(error.status || 400, error.status ? error.message : 'Invalid agent chat request.');
    } finally {
      response.off('close', onClose);
      inFlight -= 1;
    }
  }
  handleAgentChat.close = () => {
    codex.close();
    claudeCli.close?.();
    geminiCli.close?.();
  };
  return handleAgentChat;
}

function isAgentChatRoute(url) {
  return [CHAT_PATH, PROVIDERS_PATH, CONNECT_PATH, DISCONNECT_PATH].includes(url);
}

module.exports = { createAgentChatProvider, isAgentChatRoute, handleAgentChat: createAgentChatProvider() };
