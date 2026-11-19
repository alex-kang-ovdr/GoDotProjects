'use strict';

const { spawn } = require('node:child_process');
const { existsSync, mkdirSync, readdirSync, rmSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const AUTH_STATUS_TIMEOUT_MS = 6000;
const LOGIN_URL_TIMEOUT_MS = 7000;
const DEFAULT_CLAUDE_CLI_MODEL = 'claude-sonnet-5-5';
const CLAUDE_CLI_MODELS = [
  'claude-sonnet-5-5',
  'claude-opus-5-5',
  'claude-sonnet-4-6',
  'claude-opus-4-6',
  'claude-haiku-4-5',
];
const CLAUDE_CLI_EFFORTS = ['low', 'medium', 'high', 'max'];
const ALLOWED_AUTH_HOSTS = new Set(['claude.com', 'claude.ai', 'console.anthropic.com', 'platform.claude.com']);
const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['content', 'tool_calls'],
  properties: {
    content: { type: 'string' },
    tool_calls: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'arguments_json'],
        properties: {
          name: { type: 'string' },
          arguments_json: { type: 'string' },
        },
      },
    },
  },
};

function compareVersionsDesc(a, b) {
  const pa = a.split(/[^0-9]+/).filter(Boolean).map(Number);
  const pb = b.split(/[^0-9]+/).filter(Boolean).map(Number);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const diff = (pb[i] || 0) - (pa[i] || 0);
    if (diff !== 0) return diff;
  }
  return b.localeCompare(a);
}

function findClaudeExecutable(env = process.env) {
  if (env.PLAYFORGE_CLAUDE_EXECUTABLE) return env.PLAYFORGE_CLAUDE_EXECUTABLE;
  if (process.platform !== 'win32') return 'claude';

  const searchPath = Object.entries(env).find(([key]) => key.toLowerCase() === 'path')?.[1] ?? '';
  for (const entry of searchPath.split(path.delimiter)) {
    const directory = entry.trim().replace(/^"(.*)"$/, '$1');
    if (!path.isAbsolute(directory)) continue;
    for (const candidate of ['claude.exe', 'claude.cmd']) {
      const executable = path.join(directory, candidate);
      if (existsSync(executable)) return executable;
    }
  }

  const appData = Object.entries(env).find(([key]) => key.toLowerCase() === 'appdata')?.[1];
  if (appData && path.isAbsolute(appData)) {
    const claudeCodeDir = path.join(appData, 'Claude', 'claude-code');
    if (existsSync(claudeCodeDir)) {
      const versions = readdirSync(claudeCodeDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name)
        .sort(compareVersionsDesc);
      for (const version of versions) {
        const versionDir = path.join(claudeCodeDir, version);
        const direct = path.join(versionDir, 'claude.exe');
        if (existsSync(direct)) return direct;
        for (const sub of readdirSync(versionDir, { withFileTypes: true })) {
          if (!sub.isDirectory()) continue;
          const nested = path.join(versionDir, sub.name, 'claude.exe');
          if (existsSync(nested)) return nested;
        }
      }
    }
  }

  const userProfile = Object.entries(env).find(([key]) => key.toLowerCase() === 'userprofile')?.[1] || os.homedir();
  if (userProfile && path.isAbsolute(userProfile)) {
    const localBin = path.join(userProfile, '.local', 'bin', 'claude.exe');
    if (existsSync(localBin)) return localBin;

    const vscodeExt = path.join(userProfile, '.vscode', 'extensions');
    if (existsSync(vscodeExt)) {
      const matches = readdirSync(vscodeExt, { withFileTypes: true })
        .filter(d => d.isDirectory() && d.name.startsWith('anthropic.claude-code-'))
        .map(d => d.name)
        .sort(compareVersionsDesc);
      for (const ext of matches) {
        const nativeBin = path.join(vscodeExt, ext, 'resources', 'native-binary', 'claude.exe');
        if (existsSync(nativeBin)) return nativeBin;
      }
    }
  }

  return 'claude';
}

function buildIsolatedEnv(env, accountDir) {
  const childEnv = Object.fromEntries(Object.entries(env).filter(([key]) =>
    /^(path|pathext|systemroot|windir|userprofile|home|localappdata|appdata|temp|tmp|lang|lc_.*|comspec|programfiles.*|systemdrive)$/i.test(key)));
  childEnv.CLAUDE_CONFIG_DIR = accountDir;
  return childEnv;
}

function extractAuthUrl(text) {
  const matches = text.match(/https:\/\/[^\s"'<>]+/g) ?? [];
  for (const raw of matches) {
    const cleaned = raw.replace(/[.,);]+$/, '');
    try {
      const url = new URL(cleaned);
      if (url.protocol === 'https:' && !url.username && !url.password && !url.port && ALLOWED_AUTH_HOSTS.has(url.hostname)) {
        return url.href;
      }
    } catch {
      // Ignore malformed URLs.
    }
  }
  return '';
}

function formatConversationPrompt(conversation) {
  const lines = [];
  for (const msg of conversation.messages) {
    if (msg.role === 'system') continue;
    const roleLabel = msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : `Tool (${msg.tool_name || 'result'})`;
    lines.push(`${roleLabel}:\n${msg.content}`);
    if (Array.isArray(msg.tool_calls) && msg.tool_calls.length) {
      lines.push(`Tool Calls: ${JSON.stringify(msg.tool_calls)}`);
    }
  }
  if (conversation.tools?.length) {
    lines.push('\nAvailable tools (propose via tool_calls array with arguments_json as JSON string):');
    lines.push(JSON.stringify(conversation.tools));
  }
  return lines.join('\n\n');
}

function createClaudeCliProvider({ env = process.env, spawnCommand = spawn } = {}) {
  const base = env.LOCALAPPDATA || env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  const privateDir = path.join(base, 'PlayForge', 'agent-chat');
  const accountDir = path.join(privateDir, 'claude-account');
  const workingDir = path.join(privateDir, 'scratch');
  let pendingLogin = null;

  function ensureDirs() {
    mkdirSync(accountDir, { recursive: true, mode: 0o700 });
    mkdirSync(workingDir, { recursive: true, mode: 0o700 });
  }

  function runCommand(args, { timeoutMs = AUTH_STATUS_TIMEOUT_MS, input = '' } = {}) {
    ensureDirs();
    return new Promise((resolve, reject) => {
      const child = spawnCommand(findClaudeExecutable(env), args, {
        cwd: workingDir,
        env: buildIsolatedEnv(env, accountDir),
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
      let stdout = '';
      let stderr = '';
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          child.kill();
          reject(new Error('Claude CLI request timed out.'));
        }
      }, timeoutMs);
      child.stdout.on('data', chunk => { stdout += chunk.toString('utf8'); });
      child.stderr.on('data', chunk => { stderr += chunk.toString('utf8'); });
      child.once('error', error => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(error);
        }
      });
      child.once('close', code => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve({ code, stdout, stderr });
        }
      });
      if (input) child.stdin.end(input, 'utf8');
      else child.stdin.end();
    });
  }

  async function account() {
    try {
      const { stdout } = await runCommand(['auth', 'status'], { timeoutMs: AUTH_STATUS_TIMEOUT_MS });
      const parsed = JSON.parse(stdout.trim());
      if (parsed?.loggedIn) {
        if (pendingLogin) {
          try { pendingLogin.child.kill(); } catch { /* ignore */ }
          pendingLogin = null;
        }
        return { connected: true, pending: false, email: parsed.email || '' };
      }
      return { connected: false, pending: Boolean(pendingLogin) };
    } catch {
      if (pendingLogin) return { connected: false, pending: true };
      throw new Error('Claude CLI is unavailable.');
    }
  }

  async function connect({ code } = {}) {
    if (code && pendingLogin) {
      try {
        pendingLogin.child.stdin.write(String(code).trim() + '\n');
      } catch {
        // Process may already have closed stdin.
      }
      await new Promise(resolve => setTimeout(resolve, 1200));
      return pendingLogin?.url || undefined;
    }

    ensureDirs();
    try {
      if ((await account()).connected) return undefined;
    } catch {
      // Check below when spawning login.
    }

    if (pendingLogin) return pendingLogin.url || undefined;

    const child = spawnCommand(findClaudeExecutable(env), ['auth', 'login', '--claudeai'], {
      cwd: workingDir,
      env: buildIsolatedEnv(env, accountDir),
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    const entry = { child, url: '' };
    pendingLogin = entry;

    return await new Promise((resolve, reject) => {
      let buffer = '';
      let settled = false;
      const done = (err, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (err) reject(err);
        else resolve(value);
      };
      const timer = setTimeout(() => done(null, entry.url || undefined), LOGIN_URL_TIMEOUT_MS);
      const onChunk = chunk => {
        buffer += chunk.toString('utf8');
        const found = extractAuthUrl(buffer);
        if (found && !entry.url) {
          entry.url = found;
          done(null, found);
        }
      };
      child.stdout.on('data', onChunk);
      child.stderr.on('data', onChunk);
      child.once('error', error => {
        if (pendingLogin === entry) pendingLogin = null;
        done(error);
      });
      child.once('close', () => {
        if (pendingLogin === entry) pendingLogin = null;
        done(null, entry.url || undefined);
      });
    });
  }

  async function disconnect() {
    if (pendingLogin) {
      try { pendingLogin.child.kill(); } catch { /* ignore */ }
      pendingLogin = null;
    }
    try {
      await runCommand(['auth', 'logout'], { timeoutMs: AUTH_STATUS_TIMEOUT_MS });
    } catch {
      // Fall through and clean isolated credential files.
    }
    for (const file of ['.credentials.json', '.claude.json']) {
      try { rmSync(path.join(accountDir, file), { force: true }); } catch { /* ignore */ }
    }
  }

  function listModels() {
    return {
      models: [...CLAUDE_CLI_MODELS],
      defaultModel: DEFAULT_CLAUDE_CLI_MODEL,
      reasoningEfforts: Object.fromEntries(CLAUDE_CLI_MODELS.map(model => [model, [...CLAUDE_CLI_EFFORTS]])),
    };
  }

  async function chat(conversation, model, signal, { effort, onStart, onDelta } = {}) {
    ensureDirs();
    if (!hasProfile()) {
      throw Object.assign(new Error('Connect a Claude account first.'), { status: 503 });
    }
    const systemPrompt = conversation.messages
      .filter(m => m.role === 'system')
      .map(m => m.content)
      .join('\n\n');
    const prompt = formatConversationPrompt(conversation);
    const hasTools = Boolean(conversation.tools?.length);

    const args = [
      '-p',
      '--output-format', hasTools ? 'json' : 'stream-json',
      '--tools', '',
      '--no-session-persistence',
      '--model', model || DEFAULT_CLAUDE_CLI_MODEL,
    ];
    if (!hasTools) args.push('--verbose', '--include-partial-messages');
    if (effort && CLAUDE_CLI_EFFORTS.includes(effort)) args.push('--effort', effort);
    if (systemPrompt) args.push('--system-prompt', systemPrompt);
    if (hasTools) args.push('--json-schema', JSON.stringify(OUTPUT_SCHEMA));

    return await new Promise((resolve, reject) => {
      const child = spawnCommand(findClaudeExecutable(env), args, {
        cwd: workingDir,
        env: buildIsolatedEnv(env, accountDir),
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';
      let buffer = '';
      let streamedText = '';
      let resultFrame = null;
      let settled = false;

      const finish = (err, data) => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener('abort', onAbort);
        if (err) reject(err);
        else resolve(data);
      };

      const onAbort = () => {
        try { child.kill(); } catch { /* ignore */ }
        finish(Object.assign(new Error('Claude request was cancelled.'), { status: 499 }));
      };
      if (signal?.aborted) return onAbort();
      signal?.addEventListener('abort', onAbort, { once: true });

      onStart?.();

      child.stderr.on('data', chunk => { stderr += chunk.toString('utf8'); });
      child.stdout.on('data', chunk => {
        const text = chunk.toString('utf8');
        if (hasTools) {
          stdout += text;
          return;
        }
        buffer += text;
        for (let nl = buffer.indexOf('\n'); nl !== -1; nl = buffer.indexOf('\n')) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          try {
            const frame = JSON.parse(line);
            if (frame.type === 'stream_event' && frame.event?.type === 'content_block_delta' &&
                frame.event?.delta?.type === 'text_delta' && typeof frame.event.delta.text === 'string') {
              streamedText += frame.event.delta.text;
              onDelta?.(frame.event.delta.text);
            } else if (frame.type === 'result') {
              resultFrame = frame;
            }
          } catch {
            // Ignore non-JSON lines.
          }
        }
      });

      child.once('error', error => finish(Object.assign(new Error(error.message || 'Could not start Claude CLI.'), { status: 502 })));
      child.once('close', code => {
        if (settled) return;
        if (hasTools) {
          try {
            const parsed = JSON.parse(stdout.trim());
            if (parsed.is_error) return finish(Object.assign(new Error(parsed.result || 'Claude returned an error.'), { status: 502 }));
            const structured = parsed.structured_output || (typeof parsed.result === 'string' ? JSON.parse(parsed.result) : null);
            if (structured && typeof structured.content === 'string') {
              return finish(null, {
                role: 'assistant',
                content: structured.content,
                tool_calls: (structured.tool_calls ?? []).map(call => ({
                  function: { name: call.name, arguments: JSON.parse(call.arguments_json) },
                })),
              });
            }
            return finish(null, { role: 'assistant', content: String(parsed.result || ''), tool_calls: [] });
          } catch {
            return finish(Object.assign(new Error(stderr.trim() || 'Claude did not return a valid response.'), { status: 502 }));
          }
        }
        if (resultFrame?.is_error) {
          return finish(Object.assign(new Error(resultFrame.result || 'Claude returned an error.'), { status: 502 }));
        }
        const content = streamedText || (typeof resultFrame?.result === 'string' ? resultFrame.result : '');
        if (code !== 0 && !content) {
          return finish(Object.assign(new Error(stderr.trim() || 'Claude CLI could not respond.'), { status: 502 }));
        }
        return finish(null, { role: 'assistant', content, tool_calls: [] });
      });

      child.stdin.end(prompt, 'utf8');
    });
  }

  function hasProfile() {
    return existsSync(path.join(accountDir, '.credentials.json'));
  }

  function close() {
    if (pendingLogin) {
      try { pendingLogin.child.kill(); } catch { /* ignore */ }
      pendingLogin = null;
    }
  }

  return {
    account,
    connect,
    disconnect,
    chat,
    listModels,
    hasProfile,
    close,
    isInstalled: () => {
      const exe = findClaudeExecutable(env);
      return exe !== 'claude' ? existsSync(exe) : true;
    },
  };
}

module.exports = { createClaudeCliProvider, findClaudeExecutable };
