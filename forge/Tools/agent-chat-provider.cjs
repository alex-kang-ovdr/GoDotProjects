'use strict';

const { createClaudeRequest, readClaudeMessage } = require('./agent-chat-claude.cjs');
const { createCodexProvider } = require('./agent-chat-codex.cjs');
const { CONNECTIONS, createCompatibleRequest, readCompatibleMessage } = require('./agent-chat-openai.cjs');

const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434/api/chat';
const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-5-5';
const CHAT_PATH = '/api/agent-chat';
const PROVIDERS_PATH = CHAT_PATH + '/providers';
const CONNECT_PATH = PROVIDERS_PATH + '/connect';
const DISCONNECT_PATH = PROVIDERS_PATH + '/disconnect';
const PROVIDERS = ['ollama', 'claude-console', 'chatgpt-connect', ...Object.keys(CONNECTIONS)];
const MAX_BODY_BYTES = 256 * 1024;
const MAX_MESSAGES = 64;
const MAX_TOOLS = 24;
const MAX_IN_FLIGHT = 2;
const BODY_TIMEOUT_MS = 5000;
const PROVIDER_TIMEOUT_MS = 60000;
const MESSAGE_ROLES = new Set(['system', 'user', 'assistant', 'tool']);
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

function readOllamaConfiguration(env, modelOverride) {
  const model = modelOverride ?? readModel(env.PLAYFORGE_AGENT_MODEL);
  if (!model) return null;
  let url;
  try {
    url = new URL(env.PLAYFORGE_OLLAMA_URL?.trim() || DEFAULT_OLLAMA_URL);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || !isLoopbackHost(url.hostname) ||
      url.username || url.password || url.hash || url.search) return null;
  // Resolve an explicitly local Ollama endpoint without depending on DNS.
  if (url.hostname === 'localhost') url.hostname = '127.0.0.1';
  return { model, url };
}

function errorWithStatus(status, message) {
  return Object.assign(new Error(message), { status });
}

function readRequest(request) {
  if (Number(request.headers['content-length']) > MAX_BODY_BYTES) {
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
      if (bytes > MAX_BODY_BYTES) finish(errorWithStatus(413, 'Agent chat request is too large.'));
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
  return { role: message.role, content: message.content, tool_calls: message.tool_calls ?? [] };
}

function createAgentChatProvider({
  env = process.env, timeoutMs = PROVIDER_TIMEOUT_MS, fetchProvider = fetch, codex = createCodexProvider({ env }),
} = {}) {
  let inFlight = 0;
  let modifying = false;
  let ollamaModel;
  let ollamaModels = [];
  let chatgptModel = readModel(env.PLAYFORGE_CODEX_MODEL);
  let probeCodex = false;
  let codexModels = [];
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

  async function status() {
    const ollama = readOllamaConfiguration(env, ollamaModel);
    let auth = 'disconnected';
    if (probeCodex || codex.hasProfile?.()) {
      try {
        const account = await codex.account();
        if (account.connected) {
          auth = 'connected';
          if (!codexModels.length && codex.listModels) codexModels = await codex.listModels().catch(() => []);
        }
        else if (account.pending) auth = 'pending';
      } catch {
        auth = 'unavailable';
      }
    }
    return { providers: [
      { id: 'ollama', label: 'Ollama', configured: Boolean(ollama), model: ollama?.model ?? '',
        auth: ollama ? 'connected' : 'disconnected', detail: 'Local Ollama model.', models: ollamaModels },
      { id: 'claude-console', label: 'Claude Console', configured: Boolean(claude), model: claude?.model ?? claudeModel,
        auth: claude ? 'connected' : 'disconnected', detail: 'Claude Console API key.', models: claude?.models ?? [] },
      { id: 'chatgpt-connect', label: 'ChatGPT Connect', configured: auth === 'connected', model: chatgptModel,
        auth, detail: 'ChatGPT account through the official Codex CLI.', models: codexModels },
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
      const model = readModel(body.model);
      if (connect && body.model && !model) throw errorWithStatus(400, 'Provide a valid model name.');
      switch (body.provider) {
        case 'ollama': {
          const configured = readOllamaConfiguration(env, model);
          if (connect && !configured) {
            throw errorWithStatus(400, 'Enter an Ollama model name and use a loopback Ollama URL.');
          }
          ollamaModel = connect ? model : '';
          ollamaModels = [];
          if (connect) {
            try {
              const catalog = await fetchProvider(new URL('/api/tags', configured.url), {
                signal: AbortSignal.any([signal, AbortSignal.timeout(1500)]), redirect: 'error',
              });
              const data = await readProviderBody(catalog, 'Ollama');
              if (Array.isArray(data.models)) {
                ollamaModels = data.models.map(item => readModel(item?.name)).filter(Boolean).slice(0, 100);
              }
            } catch {
              // A server can expose chat without the optional model catalog.
            }
          }
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
            codexModels = [];
            chatgptModel = '';
            probeCodex = false;
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
      return { ...(await status()), ...(connectUrl ? { connect_url: connectUrl } : {}) };
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
      const bytes = await readRequest(request);
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
      const configured = provider === 'ollama' ? readOllamaConfiguration(env, ollamaModel)
        : provider === 'claude-console' ? claude : compatible[provider];
      if (provider === 'ollama' && !configured) return fail(503, 'Configure PLAYFORGE_AGENT_MODEL and a loopback Ollama URL on the server.');
      if (provider === 'claude-console' && !configured) return fail(503, 'Connect Claude Console first.');
      if (CONNECTIONS[provider] && !configured) return fail(503, `Connect ${CONNECTIONS[provider].label} first.`);
      const conversation = parseMessages(body);
      const label = CONNECTIONS[provider]?.label ??
        { ollama: 'The local Ollama model', 'claude-console': 'Claude Console', 'chatgpt-connect': 'ChatGPT Connect' }[provider];
      try {
        let upstreamMessage;
        if (provider === 'chatgpt-connect') {
          probeCodex = true;
          upstreamMessage = await codex.chat(conversation, chatgptModel, signal);
        } else {
          const upstream = CONNECTIONS[provider] ? createCompatibleRequest(provider, configured, conversation)
            : provider === 'claude-console' ? createClaudeRequest(configured, conversation)
              : { url: configured.url, body: { model: configured.model, ...conversation, stream: false } };
          const result = await fetchProvider(upstream.url, {
            method: 'POST', redirect: 'error', signal,
            headers: { 'content-type': 'application/json; charset=utf-8', accept: 'application/json', ...upstream.headers },
            body: JSON.stringify(upstream.body),
          });
          const data = await readProviderBody(result, label);
          upstreamMessage = CONNECTIONS[provider] ? readCompatibleMessage(data, provider)
            : provider === 'claude-console' ? readClaudeMessage(data) : data?.message;
        }
        const message = readProviderMessage(upstreamMessage, label);
        if (!response.destroyed) json(200, { message });
      } catch (error) {
        if (timeout.aborted) fail(504, `${label} timed out.`);
        else fail(error.status || 502, error.status ? error.message : `${label} could not respond.`);
      }
    } catch (error) {
      fail(error.status || 400, error.status ? error.message : 'Invalid agent chat request.');
    } finally {
      response.off('close', onClose);
      inFlight -= 1;
    }
  }
  handleAgentChat.close = () => codex.close();
  return handleAgentChat;
}

function isAgentChatRoute(url) {
  return [CHAT_PATH, PROVIDERS_PATH, CONNECT_PATH, DISCONNECT_PATH].includes(url);
}

module.exports = { createAgentChatProvider, isAgentChatRoute, handleAgentChat: createAgentChatProvider() };
