// PlayHub PlayerBot Gateway — Gemini OAuth 2.0 (PKCE + Managed CLI + Direct Bearer/API Key)
// Stores tokens privately on server disk (artifacts/playerbot-auth/, 0o600). Never exposed to browser JS.

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';
const GEMINI_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/generative-language.retriever',
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

function maskSecret(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (s.length <= 8) return '••••••••';
  return `${s.slice(0, 4)}••••${s.slice(-4)}`;
}

function base64Url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function findGeminiCli(platformRoot = '', env = process.env) {
  for (const key of ['PLAYHUB_GEMINI_EXECUTABLE', 'PLAYFORGE_GEMINI_EXECUTABLE']) {
    const candidate = env[key];
    if (candidate && fs.existsSync(candidate)) {
      return candidate.endsWith('.js') || candidate.endsWith('.mjs') || candidate.endsWith('.cjs')
        ? { command: process.execPath, prefixArgs: [candidate], source: key }
        : { command: candidate, prefixArgs: [], source: key };
    }
  }
  const bundleRel = path.join('forge', 'Saved', 'Tools', 'gemini-cli', 'node_modules', '@google', 'gemini-cli', 'bundle', 'gemini.js');
  const localAppData = env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const candidateRoots = [];
  if (platformRoot) {
    candidateRoots.push(platformRoot);
    const parentWorktrees = path.dirname(platformRoot);
    for (const sibling of ['PlayHub-Platform', 'Forge-AgentChat', 'Forge-AgentReplay', 'Forge-Blender', 'PlayForge-Main']) {
      candidateRoots.push(path.join(parentWorktrees, sibling));
    }
  }
  const candidates = [
    ...candidateRoots.map(r => path.join(r, bundleRel)),
    path.join(localAppData, 'PlayHub', 'Tools', 'gemini-cli', 'node_modules', '@google', 'gemini-cli', 'bundle', 'gemini.js'),
  ].filter(Boolean);
  for (const full of candidates) {
    if (fs.existsSync(full)) return { command: process.execPath, prefixArgs: [full], source: full };
  }
  const searchPath = Object.entries(env).find(([k]) => k.toLowerCase() === 'path')?.[1] || '';
  const names = process.platform === 'win32' ? ['gemini.cmd', 'gemini.exe', 'gemini'] : ['gemini'];
  for (const dir of searchPath.split(path.delimiter)) {
    const cleanDir = dir.trim().replace(/^"(.*)"$/, '$1');
    if (!cleanDir || !path.isAbsolute(cleanDir)) continue;
    for (const name of names) {
      const full = path.join(cleanDir, name);
      if (fs.existsSync(full)) return { command: full, prefixArgs: [], source: full };
    }
  }
  return null;
}

export function createGeminiOAuthManager({
  dataDir,
  platformRoot = '',
  env = process.env,
  fetchImpl = globalThis.fetch,
  spawnImpl = spawn,
  utcNow = () => Date.now(),
}) {
  const authDir = path.join(dataDir, 'playerbot-auth');
  const authFile = path.join(authDir, 'gemini-oauth.json');
  const cliAccountDir = path.join(authDir, 'gemini-cli-home');
  const pendingStates = new Map(); // state -> { verifier, redirectUri, createdAt }
  let pendingCli = null;

  function readStore() {
    try {
      if (!fs.existsSync(authFile)) return {};
      const parsed = JSON.parse(fs.readFileSync(authFile, 'utf8'));
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeStore(next) {
    fs.mkdirSync(authDir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(authFile, JSON.stringify(next, null, 2), { encoding: 'utf8', mode: 0o600 });
  }

  function getClientConfig() {
    const store = readStore();
    return {
      clientId: String(store.clientId || env.GOOGLE_OAUTH_CLIENT_ID || env.GEMINI_OAUTH_CLIENT_ID || '').trim(),
      clientSecret: String(store.clientSecret || env.GOOGLE_OAUTH_CLIENT_SECRET || env.GEMINI_OAUTH_CLIENT_SECRET || '').trim(),
    };
  }

  function hasCliOAuthCreds() {
    const cfgDir = path.join(cliAccountDir, '.gemini');
    return fs.existsSync(path.join(cfgDir, 'oauth_creds.json')) || fs.existsSync(path.join(cfgDir, 'gemini-credentials.json'));
  }

  function getStatus() {
    const store = readStore();
    const cfg = getClientConfig();
    const cli = findGeminiCli(platformRoot, env);
    const cliConnected = hasCliOAuthCreds();
    const oauthTokenValid = Boolean(store.accessToken && (!store.expiresAt || store.expiresAt > utcNow() + 15_000 || store.refreshToken));
    const apiKey = String(store.apiKey || env.GEMINI_API_KEY || '').trim();
    const activeMode = oauthTokenValid
      ? 'google-oauth2'
      : cliConnected
        ? 'gemini-cli-oauth'
        : apiKey
          ? 'gemini-apikey'
          : null;

    return {
      connected: Boolean(activeMode),
      active_mode: activeMode,
      model: String(store.model || 'gemini-2.5-flash-lite'),
      email: store.email || '',
      oauth_configured: Boolean(cfg.clientId),
      oauth_client_id_masked: maskSecret(cfg.clientId),
      cli_installed: Boolean(cli),
      cli_connected: cliConnected,
      has_refresh_token: Boolean(store.refreshToken),
      has_api_key: Boolean(apiKey),
      api_key_masked: maskSecret(apiKey),
      pending_cli_url: pendingCli?.url || '',
    };
  }

  function saveConfig({ clientId, clientSecret, accessToken, apiKey, model } = {}) {
    const store = readStore();
    if (clientId !== undefined) store.clientId = String(clientId).trim();
    if (clientSecret !== undefined) store.clientSecret = String(clientSecret).trim();
    if (accessToken !== undefined) {
      const tok = String(accessToken).trim();
      if (tok) {
        store.accessToken = tok;
        store.expiresAt = utcNow() + 50 * 60 * 1000;
        store.email = store.email || 'oauth-bearer@google';
      }
    }
    if (apiKey !== undefined) store.apiKey = String(apiKey).trim();
    if (model !== undefined && String(model).trim()) store.model = String(model).trim();
    store.updatedAt = new Date(utcNow()).toISOString();
    writeStore(store);
    return getStatus();
  }

  async function startOAuth({ origin = 'http://127.0.0.1:18190', clientId, clientSecret } = {}) {
    if (clientId !== undefined || clientSecret !== undefined) {
      const patch = {};
      if (String(clientId || '').trim()) patch.clientId = String(clientId).trim();
      if (String(clientSecret || '').trim()) patch.clientSecret = String(clientSecret).trim();
      if (Object.keys(patch).length) saveConfig(patch);
    }
    const cfg = getClientConfig();
    // Path 1: Standard Google OAuth 2.0 PKCE Authorization Code Flow
    if (cfg.clientId) {
      const state = base64Url(crypto.randomBytes(24));
      const verifier = base64Url(crypto.randomBytes(32));
      const challenge = base64Url(crypto.createHash('sha256').update(verifier).digest());
      const redirectUri = `${origin.replace(/\/+$/, '')}/api/playerbot/oauth/gemini/callback`;
      pendingStates.set(state, { verifier, redirectUri, createdAt: utcNow() });
      // Prune stale states (>15m)
      for (const [k, v] of pendingStates.entries()) {
        if (utcNow() - v.createdAt > 15 * 60 * 1000) pendingStates.delete(k);
      }
      const params = new URLSearchParams({
        client_id: cfg.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: GEMINI_OAUTH_SCOPES,
        access_type: 'offline',
        prompt: 'consent',
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
      });
      return {
        ok: true,
        mode: 'google-oauth2',
        connect_url: `${GOOGLE_AUTH_URL}?${params.toString()}`,
        redirect_uri: redirectUri,
        status: getStatus(),
      };
    }

    // Path 2: Managed Gemini CLI OAuth fallback (if installed)
    const cli = findGeminiCli(platformRoot, env);
    if (cli) {
      fs.mkdirSync(path.join(cliAccountDir, '.gemini'), { recursive: true, mode: 0o700 });
      const childEnv = { ...env, GEMINI_CLI_HOME: cliAccountDir, GEMINI_FORCE_FILE_STORAGE: 'true', NO_BROWSER: 'true' };
      const child = spawnImpl(cli.command, [...cli.prefixArgs, '-p', 'OK', '-o', 'json', '--approval-mode', 'plan', '--skip-trust'], {
        cwd: authDir, env: childEnv, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
      });
      const entry = { child, url: '' };
      pendingCli = entry;
      const url = await new Promise(resolve => {
        let buf = '';
        const t = setTimeout(() => resolve(entry.url), 6000);
        const onData = chunk => {
          buf += chunk.toString('utf8');
          const m = buf.match(/https:\/\/accounts\.google\.com\/[^\s"'<>]+/);
          if (m && !entry.url) { entry.url = m[0]; clearTimeout(t); resolve(entry.url); }
        };
        child.stdout.on('data', onData);
        child.stderr.on('data', onData);
        child.once('close', () => { clearTimeout(t); if (pendingCli === entry) pendingCli = null; resolve(entry.url); });
      });
      return { ok: true, mode: 'gemini-cli-oauth', connect_url: url, status: getStatus() };
    }

    return {
      ok: false,
      needs_config: true,
      error: 'GOOGLE_OAUTH_CLIENT_ID가 설정되지 않았습니다. 아래 입력란에 Google OAuth Client ID(또는 OAuth Bearer 토큰 / Gemini API 키)를 입력한 뒤 다시 시도해 주세요.',
      redirect_uri: `${origin.replace(/\/+$/, '')}/api/playerbot/oauth/gemini/callback`,
      status: getStatus(),
    };
  }

  async function handleOAuthCallback({ code, state, error }) {
    if (error) return { ok: false, error: `Google OAuth 거부됨: ${error}` };
    const entry = pendingStates.get(String(state || ''));
    if (!entry) return { ok: false, error: '유효하지 않거나 만료된 OAuth state입니다. 다시 로그인을 시작해 주세요.' };
    pendingStates.delete(String(state));

    const cfg = getClientConfig();
    const form = new URLSearchParams({
      code: String(code || ''),
      client_id: cfg.clientId,
      redirect_uri: entry.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: entry.verifier,
    });
    if (cfg.clientSecret) form.set('client_secret', cfg.clientSecret);

    const tokenResp = await fetchImpl(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const tokenData = await tokenResp.json().catch(() => ({}));
    if (!tokenResp.ok || !tokenData.access_token) {
      return { ok: false, error: tokenData.error_description || tokenData.error || '토큰 교환에 실패했습니다.' };
    }

    let email = '';
    try {
      const uiResp = await fetchImpl(GOOGLE_USERINFO_URL, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (uiResp.ok) {
        const uiData = await uiResp.json();
        email = uiData.email || '';
      }
    } catch {}

    const store = readStore();
    store.accessToken = tokenData.access_token;
    if (tokenData.refresh_token) store.refreshToken = tokenData.refresh_token;
    store.expiresAt = utcNow() + Number(tokenData.expires_in || 3600) * 1000;
    if (email) store.email = email;
    store.updatedAt = new Date(utcNow()).toISOString();
    writeStore(store);

    return { ok: true, email, status: getStatus() };
  }

  async function getValidAccessToken() {
    const store = readStore();
    if (!store.accessToken) return null;
    if (!store.expiresAt || store.expiresAt > utcNow() + 30_000) {
      return store.accessToken;
    }
    if (!store.refreshToken) return null;
    const cfg = getClientConfig();
    if (!cfg.clientId) return null;
    const form = new URLSearchParams({
      client_id: cfg.clientId,
      refresh_token: store.refreshToken,
      grant_type: 'refresh_token',
    });
    if (cfg.clientSecret) form.set('client_secret', cfg.clientSecret);
    try {
      const resp = await fetchImpl(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      });
      if (!resp.ok) return null;
      const data = await resp.json();
      if (!data.access_token) return null;
      store.accessToken = data.access_token;
      store.expiresAt = utcNow() + Number(data.expires_in || 3600) * 1000;
      writeStore(store);
      return store.accessToken;
    } catch {
      return null;
    }
  }

  function getApiKey() {
    const store = readStore();
    return String(store.apiKey || env.GEMINI_API_KEY || '').trim() || null;
  }

  function disconnect() {
    if (pendingCli) {
      try { pendingCli.child.kill(); } catch {}
      pendingCli = null;
    }
    pendingStates.clear();
    const store = readStore();
    delete store.accessToken;
    delete store.refreshToken;
    delete store.expiresAt;
    delete store.email;
    delete store.apiKey;
    writeStore(store);
    return getStatus();
  }

  return {
    getStatus,
    saveConfig,
    startOAuth,
    handleOAuthCallback,
    getValidAccessToken,
    getApiKey,
    disconnect,
  };
}
