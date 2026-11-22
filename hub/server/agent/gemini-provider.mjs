// Hub-Agent Operator Gemini Provider & User BYOK Adapter.
// - Operator Gemini OAuth: dedicated profile under <dataDir>/hub-agent/gemini-account
//   with GEMINI_FORCE_FILE_STORAGE=true (supports Gemini CLI 0.69+ encrypted gemini-credentials.json & oauth_creds.json)
// - Operator Gemini API Key: private file <dataDir>/hub-agent/operator-secrets.json (never stored in SQLite)
// - User BYOK: per-request user API key (gemini / openai / anthropic) -> 0 PlayCoins charged

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { ApiError } from '../security.mjs';
import { normalizeTokenUsage } from './pricing.mjs';

export const GEMINI_SUPPORTED_MODELS = Object.freeze([
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-3.1-pro-preview',
  'gemini-3-pro-preview'
]);

const ALLOWED_GOOGLE_AUTH_HOSTS = new Set(['accounts.google.com']);
const LOGIN_URL_WAIT_MS = 12_000;
const LOGIN_ALIVE_MS = 180_000;

function isPrivateIpv4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b, c] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
  if (a === 192 && b === 168) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true;
  return false;
}

function validateExternalHttpsEndpoint(rawUrl, fallback) {
  const input = String(rawUrl || fallback).trim();
  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    throw new ApiError(400, 'INVALID_BYOK_ENDPOINT', '유효한 HTTPS API 엔드포인트가 아닙니다.');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new ApiError(400, 'INVALID_BYOK_ENDPOINT', 'HTTPS 엔드포인트만 허용됩니다.');
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  if (!host || host === 'localhost' || host === 'metadata' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new ApiError(400, 'INVALID_BYOK_ENDPOINT', '내부 네트워크 주소는 허용되지 않습니다.');
  }
  const ipVer = net.isIP(host);
  if (ipVer === 4 && isPrivateIpv4(host)) throw new ApiError(400, 'INVALID_BYOK_ENDPOINT');
  if (ipVer === 6) throw new ApiError(400, 'INVALID_BYOK_ENDPOINT');
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
}

export function findManagedGeminiCli({ platformRoot = '', env = process.env } = {}) {
  for (const key of ['PLAYHUB_GEMINI_EXECUTABLE', 'PLAYFORGE_GEMINI_EXECUTABLE']) {
    const candidate = env[key];
    if (candidate && fs.existsSync(candidate)) {
      if (candidate.endsWith('.js') || candidate.endsWith('.mjs') || candidate.endsWith('.cjs')) {
        return { command: process.execPath, prefixArgs: [candidate], source: key };
      }
      return { command: candidate, prefixArgs: [], source: key };
    }
  }

  const bundleRel = path.join('forge', 'Saved', 'Tools', 'gemini-cli', 'node_modules', '@google', 'gemini-cli', 'bundle', 'gemini.js');
  const candidateRoots = [];
  if (platformRoot) {
    candidateRoots.push(platformRoot);
    const parentWorktrees = path.dirname(platformRoot);
    for (const sibling of ['Forge-Blender', 'Forge-AgentReplay', 'Forge-AgentChat', 'PlayForge-Main', 'PlayHub-Platform']) {
      candidateRoots.push(path.join(parentWorktrees, sibling));
    }
  }
  const localAppData = env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const sharedBundle = path.join(localAppData, 'PlayHub', 'Tools', 'gemini-cli', 'node_modules', '@google', 'gemini-cli', 'bundle', 'gemini.js');

  for (const root of candidateRoots) {
    const full = path.join(root, bundleRel);
    if (fs.existsSync(full)) {
      return { command: process.execPath, prefixArgs: [full], source: full };
    }
  }
  if (fs.existsSync(sharedBundle)) {
    return { command: process.execPath, prefixArgs: [sharedBundle], source: sharedBundle };
  }

  const searchPath = Object.entries(env).find(([k]) => k.toLowerCase() === 'path')?.[1] || '';
  const names = process.platform === 'win32' ? ['gemini.cmd', 'gemini.exe', 'gemini'] : ['gemini'];
  for (const dir of searchPath.split(path.delimiter)) {
    const cleanDir = dir.trim().replace(/^"(.*)"$/, '$1');
    if (!cleanDir || !path.isAbsolute(cleanDir)) continue;
    for (const name of names) {
      const full = path.join(cleanDir, name);
      if (fs.existsSync(full)) {
        return { command: full, prefixArgs: [], source: full };
      }
    }
  }

  return null;
}

function extractGoogleAuthUrl(text) {
  const matches = String(text || '').match(/https:\/\/accounts\.google\.com\/[^\s"'<>]+/g) || [];
  for (const raw of matches) {
    const cleaned = raw.replace(/[.,);]+$/, '');
    try {
      const u = new URL(cleaned);
      if (u.protocol === 'https:' && !u.username && !u.password && !u.port && ALLOWED_GOOGLE_AUTH_HOSTS.has(u.hostname)) {
        return u.href;
      }
    } catch {
      // ignore malformed URL
    }
  }
  return '';
}

function formatCliConversationPrompt({ messages = [], systemPrompt = '', tools = [], responseMimeType = '' }) {
  const parts = [];
  const sysLines = [];
  if (systemPrompt) sysLines.push(systemPrompt);
  for (const m of messages) {
    if (m.role === 'system' && m.content) sysLines.push(m.content);
  }
  if (sysLines.length) {
    parts.push(`System instructions:\n${sysLines.join('\n\n')}`);
  }
  for (const m of messages) {
    if (m.role === 'system') continue;
    const label = m.role === 'user' ? 'User' : m.role === 'assistant' ? 'Assistant' : `Tool (${m.tool_name || 'result'})`;
    parts.push(`${label}:\n${m.content || ''}`);
    if (Array.isArray(m.tool_calls) && m.tool_calls.length) {
      parts.push(`Tool Calls: ${JSON.stringify(m.tool_calls)}`);
    }
  }
  if (Array.isArray(tools) && tools.length) {
    parts.push(
      'IMPORTANT: Return ONLY a valid JSON object matching {"content":"<reply>","tool_calls":[{"name":"<tool>","arguments_json":"<json>"}]}. Available tools:\n' +
      JSON.stringify(tools)
    );
  } else if (responseMimeType === 'application/json') {
    parts.push('IMPORTANT: Respond with ONLY valid JSON without markdown code fences.');
  }
  return parts.join('\n\n');
}

function parseCliStatsToUsage(stats) {
  if (!stats || typeof stats !== 'object') return null;
  // Format A: -o json -> stats.models[modelName].tokens = { prompt, input, cached, candidates, thoughts, total }
  if (stats.models && typeof stats.models === 'object') {
    let inputTokens = 0;
    let cachedTokens = 0;
    let outputTokens = 0;
    let thinkingTokens = 0;
    let totalTokens = 0;
    for (const modelEntry of Object.values(stats.models)) {
      if (!modelEntry || typeof modelEntry !== 'object') continue;
      if (modelEntry.tokens && typeof modelEntry.tokens === 'object') {
        const t = modelEntry.tokens;
        const prompt = Number(t.prompt || 0);
        const cached = Number(t.cached || 0);
        const input = t.input !== undefined ? Number(t.input || 0) : Math.max(0, prompt - cached);
        const out = Number(t.candidates || 0);
        const total = Number(t.total || 0);
        const thoughts = t.thoughts !== undefined
          ? Number(t.thoughts || 0)
          : Math.max(0, total - (input + cached + out));
        inputTokens += input;
        cachedTokens += cached;
        outputTokens += out;
        thinkingTokens += thoughts;
        totalTokens += Math.max(total, input + cached + out + thoughts);
      } else {
        // StreamStats per-model format: { total_tokens, input_tokens (prompt), output_tokens, cached, input }
        const prompt = Number(modelEntry.input_tokens || 0);
        const cached = Number(modelEntry.cached || 0);
        const input = modelEntry.input !== undefined ? Number(modelEntry.input || 0) : Math.max(0, prompt - cached);
        const out = Number(modelEntry.output_tokens || 0);
        const total = Number(modelEntry.total_tokens || 0);
        const thoughts = Math.max(0, total - (input + cached + out));
        inputTokens += input;
        cachedTokens += cached;
        outputTokens += out;
        thinkingTokens += thoughts;
        totalTokens += Math.max(total, input + cached + out + thoughts);
      }
    }
    if (totalTokens > 0 || inputTokens > 0 || outputTokens > 0) {
      return normalizeTokenUsage({ inputTokens, cachedTokens, outputTokens, thinkingTokens, totalTokens });
    }
  }
  // Format B: -o stream-json top-level stats
  if (stats.total_tokens !== undefined || stats.input_tokens !== undefined) {
    const prompt = Number(stats.input_tokens || 0);
    const cached = Number(stats.cached || 0);
    const input = stats.input !== undefined ? Number(stats.input || 0) : Math.max(0, prompt - cached);
    const out = Number(stats.output_tokens || 0);
    const total = Number(stats.total_tokens || 0);
    const thoughts = Math.max(0, total - (input + cached + out));
    return normalizeTokenUsage({ inputTokens: input, cachedTokens: cached, outputTokens: out, thinkingTokens: thoughts, totalTokens: total });
  }
  return null;
}

function estimateFallbackTokens(promptText, replyText) {
  const inputTokens = Math.max(1, Math.ceil(Buffer.byteLength(String(promptText || ''), 'utf8') / 3.5));
  const outputTokens = Math.max(1, Math.ceil(Buffer.byteLength(String(replyText || ''), 'utf8') / 3.5));
  return normalizeTokenUsage({ inputTokens, cachedTokens: 0, outputTokens, thinkingTokens: 0 });
}

function maskSecret(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (s.length <= 8) return '••••••••';
  return `${s.slice(0, 4)}••••${s.slice(-4)}`;
}

export function createHubGeminiProvider({
  dataDir,
  platformRoot = '',
  env = process.env,
  fetchImpl = globalThis.fetch,
  spawnImpl = spawn
}) {
  const baseDir = path.join(dataDir, 'hub-agent');
  const accountDir = path.join(baseDir, 'gemini-account');
  const geminiConfigDir = path.join(accountDir, '.gemini');
  const scratchDir = path.join(baseDir, 'scratch');
  const secretsFile = path.join(baseDir, 'operator-secrets.json');

  const legacyCredsPath = path.join(geminiConfigDir, 'oauth_creds.json');
  const encryptedCredsPath = path.join(geminiConfigDir, 'gemini-credentials.json');
  const accountsPath = path.join(geminiConfigDir, 'google_accounts.json');
  const settingsPath = path.join(geminiConfigDir, 'settings.json');

  let pendingOAuth = null;

  function ensurePrivateDirs() {
    fs.mkdirSync(geminiConfigDir, { recursive: true, mode: 0o700 });
    fs.mkdirSync(scratchDir, { recursive: true, mode: 0o700 });
    let settings = {};
    try {
      if (fs.existsSync(settingsPath)) settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch {
      settings = {};
    }
    if (settings?.security?.auth?.selectedType !== 'oauth-personal') {
      settings = {
        ...settings,
        security: {
          ...(settings.security || {}),
          auth: { ...(settings.security?.auth || {}), selectedType: 'oauth-personal' }
        }
      };
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), { encoding: 'utf8', mode: 0o600 });
    }
  }

  function buildIsolatedCliEnv() {
    const childEnv = Object.fromEntries(
      Object.entries(env).filter(([k]) =>
        /^(path|pathext|systemroot|windir|userprofile|home|localappdata|appdata|temp|tmp|lang|lc_.*|comspec|programfiles.*|systemdrive|computername|username)$/i.test(k)
      )
    );
    childEnv.GEMINI_CLI_HOME = accountDir;
    childEnv.GEMINI_FORCE_FILE_STORAGE = 'true';
    childEnv.GEMINI_TELEMETRY_ENABLED = 'false';
    return childEnv;
  }

  function readOperatorSecrets() {
    try {
      if (!fs.existsSync(secretsFile)) return {};
      const parsed = JSON.parse(fs.readFileSync(secretsFile, 'utf8'));
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeOperatorSecrets(next) {
    fs.mkdirSync(baseDir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(secretsFile, JSON.stringify(next, null, 2), { encoding: 'utf8', mode: 0o600 });
  }

  function resolveOperatorApiKey() {
    const stored = readOperatorSecrets().geminiApiKey;
    if (typeof stored === 'string' && stored.trim()) return stored.trim();
    const envKey = env.PLAYHUB_GEMINI_API_KEY || env.GEMINI_API_KEY || '';
    return typeof envKey === 'string' ? envKey.trim() : '';
  }

  function readOAuthEmail() {
    try {
      if (!fs.existsSync(accountsPath)) return '';
      const parsed = JSON.parse(fs.readFileSync(accountsPath, 'utf8'));
      if (typeof parsed?.active === 'string' && parsed.active.trim()) return parsed.active.trim();
      if (Array.isArray(parsed?.accounts) && typeof parsed.accounts[0] === 'string') return parsed.accounts[0];
      return '';
    } catch {
      return '';
    }
  }

  function hasOAuthCredentials() {
    try {
      if (fs.existsSync(encryptedCredsPath)) {
        const stat = fs.statSync(encryptedCredsPath);
        if (stat.size > 16) return true;
      }
      if (fs.existsSync(legacyCredsPath)) {
        const parsed = JSON.parse(fs.readFileSync(legacyCredsPath, 'utf8'));
        if (parsed && (parsed.refresh_token || parsed.access_token)) return true;
      }
    } catch {
      // ignore corrupted file
    }
    return false;
  }

  function getConnectionStatus({ preferredProvider = 'gemini-oauth' } = {}) {
    const cli = findManagedGeminiCli({ platformRoot, env });
    const oauthConnected = Boolean(cli && hasOAuthCredentials());
    if (oauthConnected && pendingOAuth) {
      try { pendingOAuth.child.kill(); } catch {}
      pendingOAuth = null;
    }
    const oauthPending = Boolean(pendingOAuth && !pendingOAuth.child.killed && pendingOAuth.child.exitCode === null);
    const apiKey = resolveOperatorApiKey();
    const apiKeyConnected = apiKey.length >= 12;

    let activeMode = null;
    if (preferredProvider === 'gemini-oauth') {
      activeMode = oauthConnected ? 'gemini-oauth' : (apiKeyConnected ? 'gemini-apikey' : null);
    } else {
      activeMode = apiKeyConnected ? 'gemini-apikey' : (oauthConnected ? 'gemini-oauth' : null);
    }

    return {
      ready: Boolean(activeMode),
      activeMode,
      models: [...GEMINI_SUPPORTED_MODELS],
      oauth: {
        cliInstalled: Boolean(cli),
        cliSource: cli?.source || null,
        connected: oauthConnected,
        pending: oauthPending,
        connectUrl: oauthPending ? (pendingOAuth?.url || '') : '',
        email: oauthConnected ? readOAuthEmail() : '',
        profileDir: accountDir
      },
      apiKey: {
        connected: apiKeyConnected,
        maskedKey: maskSecret(apiKey),
        source: readOperatorSecrets().geminiApiKey ? 'admin_saved' : (apiKeyConnected ? 'env' : 'none')
      }
    };
  }

  async function startOAuthConnect({ openBrowser = false } = {}) {
    const cli = findManagedGeminiCli({ platformRoot, env });
    if (!cli) {
      throw new ApiError(503, 'GEMINI_CLI_NOT_AVAILABLE', '관리형 Gemini CLI 번들을 찾을 수 없습니다. Gemini API 키 입력을 사용하거나 CLI 경로를 확인해 주세요.');
    }
    ensurePrivateDirs();
    if (hasOAuthCredentials()) {
      return {
        alreadyConnected: true,
        pending: false,
        connectUrl: '',
        email: readOAuthEmail(),
        status: getConnectionStatus()
      };
    }
    if (pendingOAuth && !pendingOAuth.child.killed && pendingOAuth.child.exitCode === null) {
      return {
        alreadyConnected: false,
        pending: true,
        connectUrl: pendingOAuth.url || '',
        browserOpened: pendingOAuth.consented,
        status: getConnectionStatus()
      };
    }

    const childEnv = buildIsolatedCliEnv();
    if (!openBrowser) {
      childEnv.NO_BROWSER = 'true';
    }
    const child = spawnImpl(cli.command, [
      ...cli.prefixArgs,
      '-p', 'Reply with OK',
      '-o', 'json',
      '--approval-mode', 'plan',
      '--skip-trust'
    ], {
      cwd: scratchDir,
      env: childEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    });

    const entry = { child, url: '', consented: false };
    pendingOAuth = entry;

    const killTimer = setTimeout(() => {
      try { child.kill(); } catch {}
      if (pendingOAuth === entry) pendingOAuth = null;
    }, LOGIN_ALIVE_MS);
    killTimer.unref?.();

    const connectResult = await new Promise((resolve, reject) => {
      let buffer = '';
      let settled = false;
      const done = (err, val) => {
        if (settled) return;
        settled = true;
        clearTimeout(waitTimer);
        if (err) reject(err);
        else resolve(val);
      };
      const waitTimer = setTimeout(() => {
        done(null, { alreadyConnected: hasOAuthCredentials(), connectUrl: entry.url, browserOpened: entry.consented });
      }, LOGIN_URL_WAIT_MS);

      const onData = chunk => {
        const text = chunk.toString('utf8');
        buffer += text;
        if (!entry.consented && /do you want to continue|\[y\/n\]/i.test(buffer)) {
          entry.consented = true;
          try { child.stdin.write('y\n'); } catch {}
        }
        const foundUrl = extractGoogleAuthUrl(buffer);
        if (foundUrl && !entry.url) {
          entry.url = foundUrl;
          done(null, { alreadyConnected: false, connectUrl: foundUrl, browserOpened: openBrowser && entry.consented });
        }
      };

      child.stdout.on('data', onData);
      child.stderr.on('data', onData);
      child.once('error', err => {
        clearTimeout(killTimer);
        if (pendingOAuth === entry) pendingOAuth = null;
        done(new ApiError(502, 'GEMINI_OAUTH_START_FAILED', err.message));
      });
      child.once('close', () => {
        clearTimeout(killTimer);
        if (pendingOAuth === entry) pendingOAuth = null;
        done(null, { alreadyConnected: hasOAuthCredentials(), connectUrl: entry.url, browserOpened: openBrowser && entry.consented });
      });
    });

    return {
      ...connectResult,
      pending: !connectResult.alreadyConnected && Boolean(pendingOAuth),
      status: getConnectionStatus()
    };
  }

  function saveApiKey(rawKey) {
    const key = String(rawKey || '').trim();
    if (!key || key.length < 16 || /\s/.test(key)) {
      throw new ApiError(422, 'INVALID_GEMINI_API_KEY', '유효한 Gemini API 키(AIza...)를 입력해 주세요.');
    }
    const existing = readOperatorSecrets();
    writeOperatorSecrets({
      ...existing,
      geminiApiKey: key,
      updatedAt: new Date().toISOString()
    });
    return getConnectionStatus({ preferredProvider: 'gemini-apikey' });
  }

  function disconnect({ target = 'all' } = {}) {
    if (target === 'all' || target === 'oauth' || target === 'gemini-oauth') {
      if (pendingOAuth) {
        try { pendingOAuth.child.kill(); } catch {}
        pendingOAuth = null;
      }
      for (const file of [encryptedCredsPath, legacyCredsPath, accountsPath]) {
        try { fs.rmSync(file, { force: true }); } catch {}
      }
    }
    if (target === 'all' || target === 'apikey' || target === 'gemini-apikey') {
      const existing = readOperatorSecrets();
      delete existing.geminiApiKey;
      writeOperatorSecrets(existing);
    }
    return getConnectionStatus();
  }

  async function callGeminiRestApi({
    apiKey,
    model,
    messages = [],
    systemPrompt = '',
    tools = [],
    responseMimeType = '',
    maxOutputTokens = 4096,
    temperature = 0.3,
    signal
  }) {
    const chosenModel = model || 'gemini-2.5-flash';
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(chosenModel)}:generateContent`;

    const sysParts = [];
    if (systemPrompt) sysParts.push({ text: systemPrompt });
    const contents = [];
    for (const msg of messages) {
      if (msg.role === 'system') {
        if (msg.content) sysParts.push({ text: msg.content });
        continue;
      }
      const role = msg.role === 'assistant' ? 'model' : 'user';
      const parts = [];
      if (msg.content) {
        parts.push({ text: msg.role === 'tool' ? `[Tool ${msg.tool_name || 'result'}]: ${msg.content}` : msg.content });
      }
      if (Array.isArray(msg.tool_calls)) {
        for (const tc of msg.tool_calls) {
          if (tc?.function?.name) {
            parts.push({
              functionCall: {
                name: tc.function.name,
                args: tc.function.arguments || {}
              }
            });
          }
        }
      }
      if (parts.length) contents.push({ role, parts });
    }
    if (!contents.length) {
      contents.push({ role: 'user', parts: [{ text: 'Hello' }] });
    }

    const functionDeclarations = Array.isArray(tools) && tools.length
      ? tools
          .filter(t => t?.function?.name)
          .map(t => ({
            name: t.function.name,
            description: t.function.description || '',
            ...(t.function.parameters ? { parameters: t.function.parameters } : {})
          }))
      : [];

    const payload = {
      ...(sysParts.length ? { systemInstruction: { parts: sysParts } } : {}),
      contents,
      ...(functionDeclarations.length ? { tools: [{ functionDeclarations }] } : {}),
      generationConfig: {
        temperature,
        maxOutputTokens,
        ...(responseMimeType && !functionDeclarations.length ? { responseMimeType } : {})
      }
    };

    const res = await fetchImpl(endpoint, {
      method: 'POST',
      redirect: 'error',
      signal,
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = data?.error?.message || `Gemini API HTTP ${res.status}`;
      const status = res.status === 401 || res.status === 403 ? 502 : (res.status === 429 ? 429 : 502);
      throw new ApiError(status, 'GEMINI_UPSTREAM_ERROR', detail);
    }

    const parts = data?.candidates?.[0]?.content?.parts || [];
    const textChunks = [];
    const toolCalls = [];
    for (const part of parts) {
      if (typeof part.text === 'string' && !part.thought) textChunks.push(part.text);
      if (part.functionCall?.name) {
        toolCalls.push({
          function: {
            name: part.functionCall.name,
            arguments: part.functionCall.args && typeof part.functionCall.args === 'object' ? part.functionCall.args : {}
          }
        });
      }
    }

    const meta = data?.usageMetadata || {};
    const promptTotal = Number(meta.promptTokenCount || 0);
    const cachedTokens = Number(meta.cachedContentTokenCount || 0);
    const inputTokens = Math.max(0, promptTotal - cachedTokens);
    const outputTokens = Number(meta.candidatesTokenCount || 0);
    const thinkingTokens = Number(meta.thoughtsTokenCount || 0);
    const totalTokens = Number(meta.totalTokenCount || (inputTokens + cachedTokens + outputTokens + thinkingTokens));

    const content = textChunks.join('');
    const usage = totalTokens > 0
      ? normalizeTokenUsage({ inputTokens, cachedTokens, outputTokens, thinkingTokens, totalTokens })
      : estimateFallbackTokens(JSON.stringify(contents), content);

    return {
      content,
      toolCalls,
      usage,
      model: chosenModel
    };
  }

  async function callGeminiCliOAuth({
    model,
    messages = [],
    systemPrompt = '',
    tools = [],
    responseMimeType = '',
    stream = false,
    onDelta = null,
    signal
  }) {
    const cli = findManagedGeminiCli({ platformRoot, env });
    if (!cli) throw new ApiError(503, 'GEMINI_CLI_NOT_AVAILABLE', '관리형 Gemini CLI가 설치되어 있지 않습니다.');
    ensurePrivateDirs();
    if (!hasOAuthCredentials()) {
      throw new ApiError(503, 'HUB_AGENT_NOT_CONNECTED', '운영자 Gemini 계정이 아직 연결되지 않았습니다. Admin에서 내 Gemini를 연결해 주세요.');
    }

    const chosenModel = model || 'gemini-3.5-flash';
    const hasTools = Array.isArray(tools) && tools.length > 0;
    const useStreamJson = Boolean(stream && !hasTools && responseMimeType !== 'application/json');
    const prompt = formatCliConversationPrompt({ messages, systemPrompt, tools, responseMimeType });

    const args = [
      ...cli.prefixArgs,
      '-p', 'Respond accurately to the conversation provided on stdin.',
      '-m', chosenModel,
      '-o', useStreamJson ? 'stream-json' : 'json',
      '--approval-mode', 'plan',
      '--skip-trust'
    ];

    return await new Promise((resolve, reject) => {
      const child = spawnImpl(cli.command, args, {
        cwd: scratchDir,
        env: buildIsolatedCliEnv(),
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
      });

      let stdout = '';
      let stderr = '';
      let lineBuffer = '';
      let streamedText = '';
      let lastAssistantText = '';
      let streamStats = null;
      let settled = false;

      const finish = (err, val) => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener('abort', onAbort);
        if (err) reject(err);
        else resolve(val);
      };

      const onAbort = () => {
        try { child.kill(); } catch {}
        finish(new ApiError(499, 'AGENT_REQUEST_CANCELLED', 'AI 요청이 취소되었습니다.'));
      };
      if (signal?.aborted) return onAbort();
      signal?.addEventListener('abort', onAbort, { once: true });

      child.stderr.on('data', chunk => { stderr += chunk.toString('utf8'); });
      child.stdout.on('data', chunk => {
        const text = chunk.toString('utf8');
        if (!useStreamJson) {
          stdout += text;
          return;
        }
        lineBuffer += text;
        for (let nl = lineBuffer.indexOf('\n'); nl !== -1; nl = lineBuffer.indexOf('\n')) {
          const line = lineBuffer.slice(0, nl).trim();
          lineBuffer = lineBuffer.slice(nl + 1);
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
            } else if (frame.type === 'result' && frame.stats) {
              streamStats = frame.stats;
            } else if (frame.type === 'error' && frame.message) {
              stderr += '\n' + frame.message;
            }
          } catch {
            // ignore non-JSON preamble line
          }
        }
      });

      child.once('error', err => finish(new ApiError(502, 'GEMINI_CLI_EXEC_FAILED', err.message)));
      child.once('close', code => {
        if (settled) return;
        if (!useStreamJson) {
          try {
            const idx = stdout.indexOf('{');
            const parsed = JSON.parse(idx >= 0 ? stdout.slice(idx) : stdout);
            if (parsed.error?.message && !parsed.response) {
              return finish(new ApiError(502, 'GEMINI_CLI_ERROR', parsed.error.message));
            }
            const rawReply = typeof parsed.response === 'string' ? parsed.response : String(parsed.content || '');
            const usage = parseCliStatsToUsage(parsed.stats) || estimateFallbackTokens(prompt, rawReply);

            if (hasTools) {
              const jsonMatch = rawReply.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                try {
                  const structured = JSON.parse(jsonMatch[0]);
                  if (typeof structured.content === 'string') {
                    const toolCalls = (Array.isArray(structured.tool_calls) ? structured.tool_calls : []).map(call => ({
                      function: {
                        name: call.name || call.function?.name,
                        arguments: typeof call.arguments_json === 'string'
                          ? JSON.parse(call.arguments_json)
                          : (call.arguments || call.function?.arguments || {})
                      }
                    })).filter(c => c.function.name);
                    return finish(null, { content: structured.content, toolCalls, usage, model: chosenModel });
                  }
                } catch {
                  // fall back to plain text if model didn't wrap tool_calls
                }
              }
            }

            if (onDelta && rawReply) onDelta(rawReply);
            return finish(null, { content: rawReply, toolCalls: [], usage, model: chosenModel });
          } catch {
            return finish(new ApiError(502, 'GEMINI_CLI_INVALID_OUTPUT', stderr.trim() || 'Gemini CLI 응답을 해석하지 못했습니다.'));
          }
        }

        const content = streamedText || lastAssistantText;
        if (code !== 0 && !content) {
          return finish(new ApiError(502, 'GEMINI_CLI_FAILED', stderr.trim() || 'Gemini CLI 요청 처리에 실패했습니다.'));
        }
        const usage = parseCliStatsToUsage(streamStats) || estimateFallbackTokens(prompt, content);
        return finish(null, { content, toolCalls: [], usage, model: chosenModel });
      });

      child.stdin.end(prompt, 'utf8');
    });
  }

  async function callUserByok({
    byok,
    messages = [],
    systemPrompt = '',
    tools = [],
    responseMimeType = '',
    maxOutputTokens = 4096,
    onDelta = null,
    signal
  }) {
    const provider = String(byok?.provider || '').trim().toLowerCase();
    const apiKey = String(byok?.apiKey || '').trim();
    if (!apiKey || apiKey.length < 10) {
      throw new ApiError(400, 'BYOK_API_KEY_REQUIRED', '본인 계정 연동 API 키를 입력해 주세요.');
    }

    if (provider === 'gemini' || provider === 'gemini-api') {
      const out = await callGeminiRestApi({
        apiKey,
        model: byok.model || 'gemini-2.5-flash',
        messages,
        systemPrompt,
        tools,
        responseMimeType,
        maxOutputTokens,
        signal
      });
      if (onDelta && out.content) onDelta(out.content);
      return { ...out, provider: 'user:gemini', authMode: 'user_byok' };
    }

    if (provider === 'openai' || provider === 'openai-api') {
      const baseUrl = validateExternalHttpsEndpoint(byok.baseUrl, 'https://api.openai.com/v1');
      const chosenModel = byok.model || 'gpt-4o-mini';
      const fullMessages = [
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        ...messages.map(m => ({ role: m.role, content: String(m.content || '') }))
      ];
      const res = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: 'POST',
        redirect: 'error',
        signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: chosenModel,
          messages: fullMessages,
          max_tokens: maxOutputTokens,
          ...(Array.isArray(tools) && tools.length ? { tools } : {}),
          ...(responseMimeType === 'application/json' && (!tools || !tools.length) ? { response_format: { type: 'json_object' } } : {})
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new ApiError(502, 'BYOK_UPSTREAM_ERROR', data?.error?.message || `OpenAI API HTTP ${res.status}`);
      }
      const choice = data?.choices?.[0]?.message || {};
      const content = String(choice.content || '');
      const toolCalls = (Array.isArray(choice.tool_calls) ? choice.tool_calls : []).map(tc => ({
        function: {
          name: tc.function?.name,
          arguments: typeof tc.function?.arguments === 'string' ? JSON.parse(tc.function.arguments || '{}') : (tc.function?.arguments || {})
        }
      })).filter(c => c.function.name);
      if (onDelta && content) onDelta(content);
      const usage = normalizeTokenUsage({
        inputTokens: Number(data?.usage?.prompt_tokens || 0),
        cachedTokens: Number(data?.usage?.prompt_tokens_details?.cached_tokens || 0),
        outputTokens: Number(data?.usage?.completion_tokens || 0),
        thinkingTokens: Number(data?.usage?.completion_tokens_details?.reasoning_tokens || 0),
        totalTokens: Number(data?.usage?.total_tokens || 0)
      });
      return { content, toolCalls, usage, provider: 'user:openai', model: chosenModel, authMode: 'user_byok' };
    }

    if (provider === 'anthropic' || provider === 'claude' || provider === 'claude-console') {
      const chosenModel = byok.model || 'claude-sonnet-4-5';
      const sys = [systemPrompt, ...messages.filter(m => m.role === 'system').map(m => m.content)].filter(Boolean).join('\n\n');
      const chatMsgs = messages
        .filter(m => m.role !== 'system')
        .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') }));
      const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        redirect: 'error',
        signal,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: chosenModel,
          max_tokens: maxOutputTokens,
          ...(sys ? { system: sys } : {}),
          messages: chatMsgs.length ? chatMsgs : [{ role: 'user', content: 'Hello' }]
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new ApiError(502, 'BYOK_UPSTREAM_ERROR', data?.error?.message || `Anthropic API HTTP ${res.status}`);
      }
      const content = (Array.isArray(data?.content) ? data.content : [])
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('');
      if (onDelta && content) onDelta(content);
      const usage = normalizeTokenUsage({
        inputTokens: Number(data?.usage?.input_tokens || 0),
        cachedTokens: Number(data?.usage?.cache_read_input_tokens || 0),
        outputTokens: Number(data?.usage?.output_tokens || 0)
      });
      return { content, toolCalls: [], usage, provider: 'user:anthropic', model: chosenModel, authMode: 'user_byok' };
    }

    throw new ApiError(400, 'UNSUPPORTED_BYOK_PROVIDER', '지원하는 본인 연동 공급자는 gemini, openai, anthropic 입니다.');
  }

  async function generate({
    preferredProvider = 'gemini-oauth',
    defaultModel = 'gemini-3.5-flash',
    model = '',
    messages = [],
    systemPrompt = '',
    tools = [],
    responseMimeType = '',
    maxOutputTokens = 4096,
    stream = false,
    onDelta = null,
    byok = null,
    signal
  }) {
    if (byok && typeof byok === 'object' && byok.apiKey) {
      return await callUserByok({
        byok,
        messages,
        systemPrompt,
        tools,
        responseMimeType,
        maxOutputTokens,
        onDelta,
        signal
      });
    }

    const status = getConnectionStatus({ preferredProvider });
    if (!status.ready || !status.activeMode) {
      throw new ApiError(
        503,
        'HUB_AGENT_NOT_CONNECTED',
        '허브 내장 Gemini 에이전트가 아직 연결되어 있지 않습니다. 운영자 관리 콘솔에서 Gemini 계정을 연결하거나 본인 AI API 키를 연동해 주세요.'
      );
    }

    const chosenModel = model || defaultModel || (status.activeMode === 'gemini-apikey' ? 'gemini-2.5-flash' : 'gemini-3.5-flash');

    if (status.activeMode === 'gemini-oauth') {
      const out = await callGeminiCliOAuth({
        model: chosenModel,
        messages,
        systemPrompt,
        tools,
        responseMimeType,
        stream,
        onDelta,
        signal
      });
      return { ...out, provider: 'hub:gemini-oauth', authMode: 'hub_managed' };
    }

    const apiKey = resolveOperatorApiKey();
    const out = await callGeminiRestApi({
      apiKey,
      model: chosenModel,
      messages,
      systemPrompt,
      tools,
      responseMimeType,
      maxOutputTokens,
      signal
    });
    if (onDelta && out.content) onDelta(out.content);
    return { ...out, provider: 'hub:gemini-apikey', authMode: 'hub_managed' };
  }

  function close() {
    if (pendingOAuth) {
      try { pendingOAuth.child.kill(); } catch {}
      pendingOAuth = null;
    }
  }

  return {
    getConnectionStatus,
    startOAuthConnect,
    saveApiKey,
    disconnect,
    generate,
    close
  };
}
