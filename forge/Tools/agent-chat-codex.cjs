'use strict';

const { spawn } = require('node:child_process');
const { existsSync, mkdirSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MAX_FRAME_BYTES = 512 * 1024;
const AUTH_TIMEOUT_MS = 5000;
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
    const child = spawnCommand(env.PLAYFORGE_CODEX_EXECUTABLE || 'codex', [
      'app-server', '--listen', 'stdio://',
      '-c', 'forced_login_method="chatgpt"', '-c', 'cli_auth_credentials_store="file"',
      '-c', 'mcp_servers={}', '-c', 'web_search="disabled"',
      '--disable', 'shell_tool', '--disable', 'code_mode', '--disable', 'code_mode_host',
      '--disable', 'apps', '--disable', 'plugins', '--disable', 'view_image', '--disable', 'image_generation',
      '--disable', 'hooks', '--disable', 'skill_search', '--enable', 'skip_host_skill_discovery',
    ], { cwd: workingDir, env: childEnv, stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
    let nextId = 1;
    let remainder = Buffer.alloc(0);
    const pending = new Map();
    const turns = new Map();
    const conn = { ready: null, pendingLogin: null, closing: false, cwd: workingDir,
      request, waitForTurn, close, lastMessages: new Map() };
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
        pending.get(frame.id)?.(frame.error ? new Error('Codex app-server request failed.') : null, frame.result);
      } else if (frame.method === 'account/login/completed' &&
          frame.params?.loginId === conn.pendingLogin?.id) {
        conn.pendingLogin = null;
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
    return (result?.data ?? []).map(item => item.model ?? item.id).filter(model => typeof model === 'string');
  }

  async function chat(conversation, model, signal) {
    const conn = start();
    try {
      await conn.ready;
      if (!(await account()).connected) throw Object.assign(new Error('Connect a ChatGPT account first.'), { status: 503 });
      const { thread } = await conn.request('thread/start', {
        cwd: conn.cwd, approvalPolicy: 'never', sandbox: 'read-only', ephemeral: true,
        developerInstructions: 'You are PlayForge Agent Chat. Review the JSON conversation supplied by Forge. Return the next assistant response as a JSON object matching the schema. The only available actions are proposals using tool names from the supplied definitions. Forge separately decides whether to apply each proposal. For each proposal encode the JSON object of arguments in arguments_json.',
        ...(model ? { model } : {}),
      }, signal);
      const completion = conn.waitForTurn(thread.id, signal);
      completion.catch(() => {});
      try {
        await conn.request('turn/start', {
          threadId: thread.id, input: [{ type: 'text', text: JSON.stringify(conversation), text_elements: [] }],
          sandboxPolicy: { type: 'readOnly', access: {
            type: 'restricted', includePlatformDefaults: false, readableRoots: [conn.cwd],
          } },
          outputSchema: OUTPUT_SCHEMA,
        }, signal);
        const turn = await completion;
        if (turn?.status !== 'completed') throw new Error('Codex turn failed.');
        const output = JSON.parse(conn.lastMessages.get(thread.id));
        return {
          role: 'assistant', content: output.content,
          tool_calls: output.tool_calls.map(call => ({
            function: { name: call.name, arguments: JSON.parse(call.arguments_json) },
          })),
        };
      } finally {
        conn.lastMessages.delete(thread.id);
        conn.request('thread/unsubscribe', { threadId: thread.id }).catch(() => {});
      }
    } catch (error) {
      if (signal.aborted) conn.close();
      throw error;
    }
  }

  return { account, connect, disconnect, chat, listModels,
    hasProfile: () => existsSync(path.join(accountDir, 'auth.json')),
    close: () => connection?.close() };
}

module.exports = { createCodexProvider };
