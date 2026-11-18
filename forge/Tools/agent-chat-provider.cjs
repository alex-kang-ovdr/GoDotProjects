'use strict';

const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434/api/chat';
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
  return request.headers.origin == null || request.headers.origin === target.origin;
}

function readConfiguration(env) {
  const model = env.PLAYFORGE_AGENT_MODEL?.trim();
  if (!model || model.length > 128 || /[\x00-\x1f\x7f]/.test(model)) return null;
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

async function readProviderMessage(response) {
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw errorWithStatus(502, 'The local Ollama model could not respond.');
  }
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) throw errorWithStatus(502, 'The local Ollama response is too large.');
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const { message } = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, bytes)));
  if (!isObject(message) || typeof message.role !== 'string' || typeof message.content !== 'string' ||
      (message.tool_calls != null && !validToolCalls(message.tool_calls))) {
    throw errorWithStatus(502, 'The local Ollama model returned an invalid message.');
  }
  return { role: message.role, content: message.content, tool_calls: message.tool_calls ?? [] };
}

function createAgentChatProvider({ env = process.env, timeoutMs = PROVIDER_TIMEOUT_MS } = {}) {
  let inFlight = 0;
  return async function handleAgentChat(request, response, json) {
    const fail = (status, error) => {
      request.resume();
      if (!response.destroyed) json(status, { error });
    };
    if (!isLocalRequest(request)) return fail(403, 'Agent chat is available from the local editor only.');
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST');
      return fail(405, 'Agent chat requires POST.');
    }
    if (request.headers['content-type']?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
      return fail(415, 'Agent chat requires JSON.');
    }
    const configured = readConfiguration(env);
    if (!configured) return fail(503, 'Configure PLAYFORGE_AGENT_MODEL and a loopback Ollama URL on the server.');
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
      const conversation = parseMessages(body);
      const timeout = AbortSignal.timeout(timeoutMs);
      try {
        const upstream = await fetch(configured.url, {
          method: 'POST', redirect: 'error', signal: AbortSignal.any([timeout, disconnect.signal]),
          headers: { 'content-type': 'application/json; charset=utf-8', accept: 'application/json' },
          body: JSON.stringify({ model: configured.model, ...conversation, stream: false }),
        });
        const message = await readProviderMessage(upstream);
        if (!response.destroyed) json(200, { message });
      } catch (error) {
        if (timeout.aborted) fail(504, 'The local Ollama model timed out.');
        else fail(error.status || 502, error.status ? error.message : 'Could not reach the local Ollama model.');
      }
    } catch (error) {
      fail(error.status || 400, error.status ? error.message : 'Invalid agent chat request.');
    } finally {
      response.off('close', onClose);
      inFlight -= 1;
    }
  };
}

module.exports = { createAgentChatProvider, handleAgentChat: createAgentChatProvider() };
