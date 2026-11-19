'use strict';

const { spawn } = require('node:child_process');
const { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const LOGIN_URL_TIMEOUT_MS = 12000;
const DEFAULT_GEMINI_CLI_MODEL = 'gemini-3.5-flash';
const GEMINI_CLI_MODELS = [
  'gemini-3.5-flash',
  'gemini-3.1-pro-preview',
  'gemini-3-pro-preview',
  'gemini-2.5-pro',
  'gemini-3.1-flash-lite',
];
const ALLOWED_AUTH_HOSTS = new Set(['accounts.google.com']);

function findGeminiCommand(env = process.env) {
  if (env.PLAYFORGE_GEMINI_EXECUTABLE) {
    return { command: env.PLAYFORGE_GEMINI_EXECUTABLE, prefixArgs: [] };
  }

  const managedBundle = path.resolve(__dirname, '..', 'Saved', 'Tools', 'gemini-cli', 'node_modules', '@google', 'gemini-cli', 'bundle', 'gemini.js');
  if (existsSync(managedBundle)) {
    return { command: process.execPath, prefixArgs: [managedBundle] };
  }

  const searchPath = Object.entries(env).find(([key]) => key.toLowerCase() === 'path')?.[1] ?? '';
  const candidates = process.platform === 'win32' ? ['gemini.exe', 'gemini.cmd'] : ['gemini'];
  for (const entry of searchPath.split(path.delimiter)) {
    const directory = entry.trim().replace(/^"(.*)"$/, '$1');
    if (!path.isAbsolute(directory)) continue;
    for (const candidate of candidates) {
      const executable = path.join(directory, candidate);
      if (existsSync(executable)) return { command: executable, prefixArgs: [] };
    }
  }

  return null;
}

function buildIsolatedEnv(env, accountDir) {
  const childEnv = Object.fromEntries(Object.entries(env).filter(([key]) =>
    /^(path|pathext|systemroot|windir|userprofile|home|localappdata|appdata|temp|tmp|lang|lc_.*|comspec|programfiles.*|systemdrive)$/i.test(key)));
  childEnv.GEMINI_CLI_HOME = accountDir;
  childEnv.GEMINI_TELEMETRY_ENABLED = 'false';
  return childEnv;
}

function extractGoogleAuthUrl(text) {
  const matches = text.match(/https:\/\/accounts\.google\.com\/[^\s"'<>]+/g) ?? [];
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
  const sections = [];
  const systemText = conversation.messages
    .filter(m => m.role === 'system')
    .map(m => m.content)
    .join('\n\n');
  if (systemText) sections.push(`System instructions:\n${systemText}`);

  for (const msg of conversation.messages) {
    if (msg.role === 'system') continue;
    const roleLabel = msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : `Tool (${msg.tool_name || 'result'})`;
    sections.push(`${roleLabel}:\n${msg.content}`);
    if (Array.isArray(msg.tool_calls) && msg.tool_calls.length) {
      sections.push(`Tool Calls: ${JSON.stringify(msg.tool_calls)}`);
    }
  }

  if (conversation.tools?.length) {
    sections.push(
      'Return ONLY a valid JSON object matching {"content":"<reply>","tool_calls":[{"name":"<tool>","arguments_json":"<json>"}]}. Available tools:\n' +
      JSON.stringify(conversation.tools),
    );
  }
  return sections.join('\n\n');
}

function createGeminiCliProvider({ env = process.env, spawnCommand = spawn } = {}) {
  const base = env.LOCALAPPDATA || env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  const privateDir = path.join(base, 'PlayForge', 'agent-chat');
  const accountDir = path.join(privateDir, 'gemini-account');
  const geminiConfigDir = path.join(accountDir, '.gemini');
  const workingDir = path.join(privateDir, 'scratch');
  const credsPath = path.join(geminiConfigDir, 'oauth_creds.json');
  const accountsPath = path.join(geminiConfigDir, 'google_accounts.json');
  const settingsPath = path.join(geminiConfigDir, 'settings.json');
  let pendingLogin = null;

  function ensureDirs() {
    mkdirSync(geminiConfigDir, { recursive: true, mode: 0o700 });
    mkdirSync(workingDir, { recursive: true, mode: 0o700 });
    let settings = {};
    try {
      if (existsSync(settingsPath)) settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    } catch {
      settings = {};
    }
    if (settings?.security?.auth?.selectedType !== 'oauth-personal') {
      settings = {
        ...settings,
        security: {
          ...(settings.security || {}),
          auth: { ...(settings.security?.auth || {}), selectedType: 'oauth-personal' },
        },
      };
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
    }
  }

  function hasValidCredentials() {
    if (!existsSync(credsPath)) return false;
    try {
      const parsed = JSON.parse(readFileSync(credsPath, 'utf8'));
      return Boolean(parsed && (parsed.refresh_token || parsed.access_token));
    } catch {
      return false;
    }
  }

  function readEmail() {
    try {
      if (!existsSync(accountsPath)) return '';
      const parsed = JSON.parse(readFileSync(accountsPath, 'utf8'));
      return typeof parsed?.active === 'string' ? parsed.active : '';
    } catch {
      return '';
    }
  }

  async function account() {
    if (!findGeminiCommand(env)) {
      throw new Error('Gemini CLI is unavailable.');
    }
    if (hasValidCredentials()) {
      if (pendingLogin) {
        try { pendingLogin.child.kill(); } catch { /* ignore */ }
        pendingLogin = null;
      }
      return { connected: true, pending: false, email: readEmail() };
    }
    return { connected: false, pending: Boolean(pendingLogin) };
  }

  async function connect() {
    const resolved = findGeminiCommand(env);
    if (!resolved) throw new Error('Gemini CLI is not installed.');
    ensureDirs();
    if (hasValidCredentials()) return undefined;
    if (pendingLogin) return pendingLogin.url || undefined;

    const child = spawnCommand(resolved.command, [
      ...resolved.prefixArgs,
      '-p', 'Reply with OK',
      '-o', 'json',
      '--approval-mode', 'plan',
      '--skip-trust',
    ], {
      cwd: workingDir,
      env: buildIsolatedEnv(env, accountDir),
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    const entry = { child, url: '' };
    pendingLogin = entry;

    return await new Promise((resolve, reject) => {
      let buffer = '';
      let consented = false;
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
        const text = chunk.toString('utf8');
        buffer += text;
        if (!consented && /do you want to continue|\[y\/n\]/i.test(buffer)) {
          consented = true;
          try { child.stdin.write('y\n'); } catch { /* ignore */ }
        }
        const found = extractGoogleAuthUrl(buffer);
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
      // Proactively confirm consent in case stdout buffers the prompt.
      setTimeout(() => {
        if (!consented && pendingLogin === entry) {
          consented = true;
          try { child.stdin.write('y\n'); } catch { /* ignore */ }
        }
      }, 600);
    });
  }

  async function disconnect() {
    if (pendingLogin) {
      try { pendingLogin.child.kill(); } catch { /* ignore */ }
      pendingLogin = null;
    }
    for (const file of [credsPath, accountsPath]) {
      try { rmSync(file, { force: true }); } catch { /* ignore */ }
    }
  }

  function listModels() {
    return {
      models: [...GEMINI_CLI_MODELS],
      defaultModel: DEFAULT_GEMINI_CLI_MODEL,
      reasoningEfforts: {},
    };
  }

  async function chat(conversation, model, signal, { onStart, onDelta } = {}) {
    const resolved = findGeminiCommand(env);
    if (!resolved) throw Object.assign(new Error('Gemini CLI is unavailable.'), { status: 502 });
    ensureDirs();
    if (!hasValidCredentials()) {
      throw Object.assign(new Error('Connect a Gemini Google account first.'), { status: 503 });
    }

    const prompt = formatConversationPrompt(conversation);
    const hasTools = Boolean(conversation.tools?.length);
    const args = [
      ...resolved.prefixArgs,
      '-p', 'Respond to the conversation provided on stdin.',
      '-m', model || DEFAULT_GEMINI_CLI_MODEL,
      '-o', hasTools ? 'json' : 'stream-json',
      '--approval-mode', 'plan',
      '--skip-trust',
    ];

    return await new Promise((resolve, reject) => {
      const child = spawnCommand(resolved.command, args, {
        cwd: workingDir,
        env: buildIsolatedEnv(env, accountDir),
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';
      let buffer = '';
      let streamedText = '';
      let lastAssistantText = '';
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
        finish(Object.assign(new Error('Gemini request was cancelled.'), { status: 499 }));
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
          if (!line.startsWith('{')) continue;
          try {
            const frame = JSON.parse(line);
            if (frame.type === 'message' && frame.role === 'assistant' && typeof frame.content === 'string') {
              if (frame.delta) {
                streamedText += frame.content;
                onDelta?.(frame.content);
              } else {
                lastAssistantText = frame.content;
              }
            } else if (frame.type === 'error' && frame.message) {
              stderr += '\n' + frame.message;
            }
          } catch {
            // Ignore non-JSON preamble lines.
          }
        }
      });

      child.once('error', error => finish(Object.assign(new Error(error.message || 'Could not start Gemini CLI.'), { status: 502 })));
      child.once('close', code => {
        if (settled) return;
        if (hasTools) {
          try {
            const startIdx = stdout.indexOf('{');
            const parsed = JSON.parse(startIdx >= 0 ? stdout.slice(startIdx) : stdout);
            const rawReply = typeof parsed.response === 'string' ? parsed.response : String(parsed.content || '');
            const jsonMatch = rawReply.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const structured = JSON.parse(jsonMatch[0]);
              if (typeof structured.content === 'string') {
                return finish(null, {
                  role: 'assistant',
                  content: structured.content,
                  tool_calls: (structured.tool_calls ?? []).map(call => ({
                    function: { name: call.name, arguments: typeof call.arguments_json === 'string' ? JSON.parse(call.arguments_json) : call.arguments_json },
                  })),
                });
              }
            }
            return finish(null, { role: 'assistant', content: rawReply, tool_calls: [] });
          } catch {
            return finish(Object.assign(new Error(stderr.trim() || 'Gemini CLI did not return a valid response.'), { status: 502 }));
          }
        }
        const content = streamedText || lastAssistantText;
        if (code !== 0 && !content) {
          return finish(Object.assign(new Error(stderr.trim() || 'Gemini CLI could not respond.'), { status: 502 }));
        }
        return finish(null, { role: 'assistant', content, tool_calls: [] });
      });

      child.stdin.end(prompt, 'utf8');
    });
  }

  function hasProfile() {
    return hasValidCredentials();
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
    isInstalled: () => Boolean(findGeminiCommand(env)),
  };
}

module.exports = { createGeminiCliProvider, findGeminiCommand };
