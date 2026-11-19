'use strict';

const { spawn, spawnSync } = require('node:child_process');
const { existsSync, mkdirSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MAX_FRAME_BYTES = 2 * 1024 * 1024;
const AUTH_TIMEOUT_MS = 5000;
const INTERRUPT_TIMEOUT_MS = 750;
const OUTPUT_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['content', 'tool_calls'],
  properties: {
    content: { type: 'string' },
    tool_calls: { type: 'array', items: {
      type: 'object', additionalProperties: false, required: ['name', 'arguments_json'],
      properties: { name: { type: 'string' }, arguments_json: { type: 'string' } },
    } },
  },
};

function findCodexExecutable(env) {
  if (env.PLAYFORGE_CODEX_EXECUTABLE) return env.PLAYFORGE_CODEX_EXECUTABLE;
  if (process.platform !== 'win32') return 'codex';

  const searchPath = Object.entries(env).find(([key]) => key.toLowerCase() === 'path')?.[1] ?? '';
  for (const entry of searchPath.split(path.delimiter)) {
    const directory = entry.trim().replace(/^"(.*)"$/, '$1');
    if (!path.isAbsolute(directory)) continue;
    const executable = path.join(directory, 'codex.exe');
    if (existsSync(executable)) return executable;
  }

  // Explorer's registered PATH can omit the Codex desktop package resources.
  const systemRoot = Object.entries(env).find(([key]) => key.toLowerCase() === 'systemroot')?.[1];
  if (!systemRoot || !path.isAbsolute(systemRoot)) return 'codex';
  const powershell = path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const packages = spawnSync(powershell, [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
    "Get-AppxPackage -Name 'OpenAI.Codex' | Sort-Object {[version]$_.Version} -Descending | Select-Object -ExpandProperty InstallLocation",
  ], { encoding: 'utf8', timeout: 3500, windowsHide: true, maxBuffer: 16384 });
  if (packages.status === 0) {
    for (const entry of packages.stdout.split(/\r?\n/)) {
      const directory = entry.trim();
      if (!path.isAbsolute(directory)) continue;
      const executable = path.join(directory, 'app', 'resources', 'codex.exe');
      if (existsSync(executable)) return executable;
    }
  }
  return 'codex';
}

// The app server sends the structured assistant response as JSON text deltas. The schema
// orders content first, and only that public string should be revealed before validation.
function createContentDecoder() {
  let prefix = '';
  let escape = '';
  let highSurrogate = '';
  let started = false;
  let finished = false;
  return delta => {
    if (finished) return '';
    if (!started) {
      prefix += delta;
      const match = /^\s*\{\s*"content"\s*:\s*"/.exec(prefix);
      if (!match) {
        if (prefix.length > 128) { prefix = ''; finished = true; }
        return '';
      }
      delta = prefix.slice(match[0].length);
      prefix = '';
      started = true;
    }
    let text = highSurrogate;
    highSurrogate = '';
    for (const character of delta) {
      if (escape) {
        escape += character;
        if (escape === '\\u' || (escape.startsWith('\\u') && escape.length < 6)) continue;
        try {
          text += JSON.parse(`"${escape}"`);
        } catch {
          finished = true;
          return '';
        }
        escape = '';
      } else if (character === '\\') {
        escape = '\\';
      } else if (character === '"') {
        finished = true;
        break;
      } else {
        text += character;
      }
    }
    if (!finished && /[\uD800-\uDBFF]$/.test(text)) {
      highSurrogate = text.at(-1);
      text = text.slice(0, -1);
    }
    return text;
  };
}

function createCodexProvider({ env = process.env, spawnCommand = spawn } = {}) {
  const base = env.LOCALAPPDATA || env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  const privateDir = path.join(base, 'PlayForge', 'agent-chat');
  const accountDir = path.join(privateDir, 'codex-account');
  const workingDir = path.join(privateDir, 'scratch');
  let connection;

  function start() {
    if (connection) return connection;
    mkdirSync(accountDir, { recursive: true, mode: 0o700 });
    mkdirSync(workingDir, { recursive: true, mode: 0o700 });
    // Exclude other tools' API keys, user config overrides, and shell variables.
    const childEnv = Object.fromEntries(Object.entries(env).filter(([key]) =>
      /^(path|pathext|systemroot|windir|userprofile|home|localappdata|appdata|temp|tmp|lang|lc_.*)$/i.test(key)));
    childEnv.CODEX_HOME = accountDir;
    const child = spawnCommand(findCodexExecutable(env), [
      'app-server', '--listen', 'stdio://',
      '-c', 'forced_login_method="chatgpt"', '-c', 'cli_auth_credentials_store="file"',
      '-c', 'mcp_servers={}', '-c', 'web_search="disabled"',
      '--disable', 'shell_tool', '--disable', 'unified_exec', '--disable', 'code_mode', '--disable', 'code_mode_host',
      '--disable', 'apps', '--disable', 'plugins', '--disable', 'view_image', '--disable', 'image_generation',
      '--disable', 'browser_use', '--disable', 'computer_use', '--disable', 'multi_agent', '--disable', 'goals',
      '--disable', 'sleep_tool', '--disable', 'tool_suggest',
      '--disable', 'hooks', '--disable', 'skill_search', '--enable', 'skip_host_skill_discovery',
    ], { cwd: workingDir, env: childEnv, stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
    let nextId = 1;
    let remainder = Buffer.alloc(0);
    const pending = new Map();
    const turns = new Map();
    const conn = { ready: null, pendingLogin: null, closing: false, cwd: workingDir,
      request, waitForTurn, close, lastMessages: new Map(), activeTurns: new Map(), streams: new Map() };
    connection = conn;

    function close() {
      if (conn.closing) return;
      conn.closing = true;
      if (connection === conn) connection = undefined;
      child.kill();
      for (const done of [...pending.values(), ...turns.values()]) done(new Error('Codex app-server stopped.'));
    }

    function send(frame) {
      child.stdin.write(JSON.stringify(frame) + '\n');
    }

    function waitFor(map, key, signal) {
      return new Promise((resolve, reject) => {
        const abort = () => finish(new Error('Codex app-server request timed out.'));
        function finish(error, data) {
          map.delete(key);
          signal.removeEventListener('abort', abort);
          if (error) reject(error);
          else resolve(data);
        }
        map.set(key, finish);
        if (signal.aborted || conn.closing) abort();
        else signal.addEventListener('abort', abort, { once: true });
      });
    }

    function request(method, params, signal = AbortSignal.timeout(AUTH_TIMEOUT_MS)) {
      const id = nextId++;
      const result = waitFor(pending, id, signal);
      if (!signal.aborted && !conn.closing) send({ id, method, params });
      return result;
    }

    function waitForTurn(threadId, signal) {
      return waitFor(turns, threadId, signal);
    }

    function onFrame(frame) {
      if (frame.method && frame.id != null) {
        // Codex must never approve execution or request credentials from Forge.
        send({ id: frame.id, error: { code: -32601, message: 'Client request unavailable.' } });
      } else if (frame.id != null) {
        pending.get(frame.id)?.(frame.error ? new Error(frame.error.message || 'Codex app-server request failed.') : null, frame.result);
      } else if (frame.method === 'account/login/completed' &&
          frame.params?.loginId === conn.pendingLogin?.id) {
        conn.pendingLogin = null;
      } else if (frame.method === 'turn/started' && turns.has(frame.params?.threadId)) {
        conn.activeTurns.set(frame.params.threadId, frame.params.turn?.id);
      } else if (frame.method === 'item/agentMessage/delta') {
        const { threadId, itemId, delta } = frame.params ?? {};
        const stream = conn.streams.get(threadId);
        if (stream && typeof delta === 'string' && turns.has(threadId)) {
          if (stream.itemId !== itemId) {
            stream.itemId = itemId;
            stream.decode = createContentDecoder();
          }
          const content = stream.decode(delta);
          if (content) stream.onDelta(content);
        }
      } else if (frame.method === 'turn/completed') {
        turns.get(frame.params?.threadId)?.(null, frame.params?.turn);
      } else if (frame.method === 'item/completed' && frame.params?.item?.type === 'agentMessage' &&
          turns.has(frame.params.threadId)) {
        conn.lastMessages.set(frame.params.threadId, frame.params.item.text);
      }
    }

    child.stdin.on('error', close);
    child.on('error', close);
    child.on('exit', close);
    child.stdout.on('data', chunk => {
      remainder = Buffer.concat([remainder, chunk]);
      let newline;
      try {
        while ((newline = remainder.indexOf(10)) >= 0) {
          if (newline > MAX_FRAME_BYTES) return close();
          const line = remainder.subarray(0, newline);
          remainder = remainder.subarray(newline + 1);
          if (line.length) onFrame(JSON.parse(line.toString('utf8')));
        }
        if (remainder.length > MAX_FRAME_BYTES) close();
      } catch {
        close();
      }
    });
    conn.ready = request('initialize', {
      clientInfo: { name: 'playforge_agent_chat', title: 'PlayForge Agent Chat', version: '1.0.0' },
    }).then(() => send({ method: 'initialized' })).catch(error => { close(); throw error; });
    return conn;
  }

  async function account() {
    const conn = start();
    await conn.ready;
    const result = await conn.request('account/read', { refreshToken: false });
    return { connected: result?.account?.type === 'chatgpt', pending: Boolean(conn.pendingLogin) };
  }

  async function connect() {
    const conn = start();
    await conn.ready;
    if ((await account()).connected) return undefined;
    if (conn.pendingLogin) return conn.pendingLogin.url;
    const login = await conn.request('account/login/start', { type: 'chatgpt' });
    const url = new URL(login?.authUrl);
    if (url.protocol !== 'https:' || !['auth.openai.com', 'chatgpt.com'].includes(url.hostname) ||
        url.username || url.password || url.port) throw new Error('Invalid ChatGPT sign-in link.');
    conn.pendingLogin = { id: login.loginId, url: url.href };
    return url.href;
  }

  async function disconnect() {
    const conn = start();
    await conn.ready;
    if (conn.pendingLogin) {
      await conn.request('account/login/cancel', { loginId: conn.pendingLogin.id });
      conn.pendingLogin = null;
    }
    await conn.request('account/logout', {});
    conn.close();
  }

  async function listModels() {
    const conn = start();
    await conn.ready;
    const result = await conn.request('model/list', { limit: 40, includeHidden: false });
    const entries = (result?.data ?? []).filter(item => typeof (item.model ?? item.id) === 'string');
    return {
      models: entries.map(item => item.model ?? item.id),
      defaultModel: entries.find(item => item.isDefault)?.model ?? entries.find(item => item.isDefault)?.id ?? '',
      reasoningEfforts: Object.fromEntries(entries.map(item => [item.model ?? item.id,
        (item.supportedReasoningEfforts ?? []).map(option => option.reasoningEffort).filter(value => typeof value === 'string'),
      ])),
    };
  }

  async function chat(conversation, model, signal, { effort, serviceTier, images = [], onStart, onDelta } = {}) {
    const conn = start();
    let threadId;
    try {
      await conn.ready;
      if (!(await account()).connected) throw Object.assign(new Error('Connect a ChatGPT account first.'), { status: 503 });
      const { thread } = await conn.request('thread/start', {
        cwd: conn.cwd, approvalPolicy: 'never', sandbox: 'read-only', ephemeral: true,
        developerInstructions: 'You are PlayForge Agent Chat. Review the JSON conversation supplied by Forge. Return the next assistant response as a JSON object matching the schema. The only available actions are proposals using tool names from the supplied definitions. Forge separately decides whether to apply each proposal. For each proposal encode the JSON object of arguments in arguments_json. CRITICAL: Do NOT invoke pf_workspace_apply, pf_asset_pack_import, pf_asset_pack_status, or any tool from the conversation JSON as a native Codex/runtime tool call (calling them natively will fail with "No such tool available"). Ignore any external connectors such as Docs or Slack. You must output tool calls exclusively inside the final JSON response tool_calls array, and emit the requested tool_calls proposal immediately without asking for prior confirmation.',
        ...(model ? { model } : {}),
      }, signal);
      threadId = thread.id;
      const completion = conn.waitForTurn(threadId, signal);
      completion.catch(() => {});
      if (onDelta) conn.streams.set(threadId, { onDelta, decode: createContentDecoder() });
      const started = await conn.request('turn/start', {
        threadId, input: [
          { type: 'text', text: JSON.stringify(conversation), text_elements: [] },
          ...images.map(image => ({ type: 'image', url: `data:${image.mime};base64,${image.data}` })),
        ],
        sandboxPolicy: { type: 'readOnly' },
        ...(effort ? { effort } : {}),
        ...(serviceTier ? { serviceTierForTurn: serviceTier } : {}),
        outputSchema: OUTPUT_SCHEMA,
      }, signal);
      if (started?.turn?.id) conn.activeTurns.set(threadId, started.turn.id);
      onStart?.();
      const turn = await completion;
      if (turn?.status !== 'completed') throw new Error('Codex turn failed.');
      const output = JSON.parse(conn.lastMessages.get(threadId));
      return {
        role: 'assistant', content: output.content,
        tool_calls: output.tool_calls.map(call => ({
          function: { name: call.name, arguments: JSON.parse(call.arguments_json) },
        })),
      };
    } catch (error) {
      if (signal.aborted) {
        const turnId = conn.activeTurns.get(threadId);
        if (turnId) {
          await conn.request('turn/interrupt', { threadId, turnId }, AbortSignal.timeout(INTERRUPT_TIMEOUT_MS))
            .catch(() => conn.close());
        } else {
          conn.close();
        }
      }
      throw error;
    } finally {
      if (threadId) {
        conn.lastMessages.delete(threadId);
        conn.activeTurns.delete(threadId);
        conn.streams.delete(threadId);
        conn.request('thread/unsubscribe', { threadId }).catch(() => {});
      }
    }
  }

  return { account, connect, disconnect, chat, listModels,
    hasProfile: () => existsSync(path.join(accountDir, 'auth.json')),
    close: () => connection?.close() };
}

module.exports = { createCodexProvider };
