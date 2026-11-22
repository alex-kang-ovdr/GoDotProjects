// Per-Creator Personal Subscription AI OAuth 2.0 (PKCE) & BYOK Session Store for PlayHub Shorts.
// Credentials live strictly in server process memory (never persisted to SQLite, never echoed back raw).
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ApiError } from '../security.mjs';

const execFileAsync = promisify(execFile);
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';
const GOOGLE_SCOPES = 'openid email https://www.googleapis.com/auth/cloud-platform';
const STATE_TTL_MS = 10 * 60 * 1000;

function base64Url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function maskSecret(val) {
  const s = String(val || '').trim();
  if (!s) return null;
  if (s.length <= 8) return '****';
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

async function detectGcloudCli() {
  try {
    await execFileAsync('gcloud', ['--version'], { timeout: 2500, windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

export function createPersonalAiAuthStore({ env = process.env, config = {}, fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  const credsByPrincipal = new Map();
  const pendingStates = new Map();

  function oauthClientConfig(override = {}) {
    const sc = config?.shorts || {};
    const clientId = String(
      override.clientId ||
      sc.googleOAuthClientId ||
      env.PLAYHUB_SHORTS_GOOGLE_OAUTH_CLIENT_ID ||
      env.PLAYHUB_GOOGLE_OAUTH_CLIENT_ID ||
      env.PLAYHUB_GOOGLE_CLIENT_ID ||
      config.google?.clientId ||
      config.googleClientId ||
      ''
    ).trim();
    const clientSecret = String(
      override.clientSecret ||
      sc.googleOAuthClientSecret ||
      env.PLAYHUB_SHORTS_GOOGLE_OAUTH_CLIENT_SECRET ||
      env.PLAYHUB_GOOGLE_OAUTH_CLIENT_SECRET ||
      env.PLAYHUB_GOOGLE_CLIENT_SECRET ||
      config.google?.clientSecret ||
      config.googleClientSecret ||
      ''
    ).trim();
    return { clientId, clientSecret, configured: Boolean(clientId) };
  }

  function pruneExpiredStates() {
    const t = now();
    for (const [k, v] of pendingStates.entries()) {
      if (t - v.createdAt > STATE_TTL_MS) pendingStates.delete(k);
    }
  }

  async function getStatus(principalId, { allowLocalGcloud = false } = {}) {
    const oauth = oauthClientConfig();
    const entry = principalId ? credsByPrincipal.get(principalId) || null : null;
    const gcloudAvailable = allowLocalGcloud ? await detectGcloudCli() : false;
    return {
      ok: true,
      googleOAuthConfigured: oauth.configured,
      gcloudAvailable,
      google: entry ? {
        connected: true,
        mode: entry.mode, // 'vertex-oauth' | 'gemini-key'
        source: entry.source, // 'google-oauth-pkce' | 'gcloud-oauth' | 'manual-oauth' | 'gemini-key'
        email: entry.email || null,
        vertexProject: entry.vertexProject || null,
        vertexLocation: entry.vertexLocation || 'us-central1',
        maskedSecret: maskSecret(entry.mode === 'gemini-key' ? entry.geminiApiKey : entry.vertexAccessToken),
        expiresAt: entry.expiresAt ? new Date(entry.expiresAt).toISOString() : null,
        connectedAt: new Date(entry.connectedAt).toISOString()
      } : {
        connected: false,
        mode: null,
        source: null,
        email: null,
        vertexProject: null,
        vertexLocation: 'us-central1',
        maskedSecret: null,
        expiresAt: null,
        connectedAt: null
      }
    };
  }

  function getCredentials(principalId) {
    if (!principalId) return null;
    const entry = credsByPrincipal.get(principalId);
    if (!entry) return null;
    if (entry.expiresAt && now() > entry.expiresAt) return null;
    return { ...entry };
  }

  function startGoogleOAuth({
    principalId,
    redirectUri,
    vertexProject = '',
    vertexLocation = 'us-central1',
    clientId = '',
    clientSecret = ''
  }) {
    const oauth = oauthClientConfig({ clientId, clientSecret });
    if (!oauth.configured) {
      throw new ApiError(
        503,
        'GOOGLE_OAUTH_NOT_CONFIGURED',
        'Google OAuth Client ID가 설정되지 않았습니다. 모달에서 개인 Google OAuth Client ID를 입력하거나 아래 Gemini API 키 / Vertex OAuth 토큰을 연결해 주세요.'
      );
    }
    pruneExpiredStates();
    const stateToken = base64Url(crypto.randomBytes(24));
    const codeVerifier = base64Url(crypto.randomBytes(32));
    const codeChallenge = base64Url(crypto.createHash('sha256').update(codeVerifier).digest());

    pendingStates.set(stateToken, {
      principalId,
      codeVerifier,
      redirectUri,
      clientId: oauth.clientId,
      clientSecret: oauth.clientSecret,
      vertexProject: String(vertexProject || '').trim().slice(0, 128),
      vertexLocation: String(vertexLocation || 'us-central1').trim().slice(0, 48) || 'us-central1',
      createdAt: now()
    });

    const params = new URLSearchParams({
      client_id: oauth.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: GOOGLE_SCOPES,
      state: stateToken,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      access_type: 'offline',
      prompt: 'consent'
    });
    return {
      ok: true,
      state: stateToken,
      authUrl: `${GOOGLE_AUTH_URL}?${params.toString()}`
    };
  }

  async function handleGoogleOAuthCallback({ code, state, error }) {
    pruneExpiredStates();
    if (error) {
      return { ok: false, errorCode: String(error).slice(0, 64), message: 'Google OAuth 인증이 취소되었거나 거부되었습니다.' };
    }
    const pending = state ? pendingStates.get(String(state)) : null;
    if (!pending) {
      return { ok: false, errorCode: 'OAUTH_STATE_INVALID', message: 'OAuth 상태 토큰이 만료되었거나 유효하지 않습니다.' };
    }
    pendingStates.delete(String(state));

    if (!code) {
      return { ok: false, errorCode: 'OAUTH_CODE_MISSING', message: 'Google 인증 코드가 누락되었습니다.' };
    }

    const oauth = oauthClientConfig({
      clientId: pending.clientId,
      clientSecret: pending.clientSecret
    });
    const form = new URLSearchParams({
      client_id: oauth.clientId,
      code: String(code),
      code_verifier: pending.codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: pending.redirectUri
    });
    if (oauth.clientSecret) form.set('client_secret', oauth.clientSecret);

    const tokenRes = await fetchImpl(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString()
    });
    const tokenData = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !tokenData.access_token) {
      return {
        ok: false,
        errorCode: 'OAUTH_TOKEN_EXCHANGE_FAILED',
        message: tokenData.error_description || tokenData.error || 'Google OAuth 토큰 교환에 실패했습니다.'
      };
    }

    let email = null;
    try {
      const uiRes = await fetchImpl(GOOGLE_USERINFO_URL, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` }
      });
      const ui = await uiRes.json().catch(() => ({}));
      if (ui?.email) email = String(ui.email).slice(0, 120);
    } catch {}

    const expiresInSec = Number(tokenData.expires_in) || 3500;
    credsByPrincipal.set(pending.principalId, {
      mode: 'vertex-oauth',
      source: 'google-oauth-pkce',
      email,
      vertexProject: pending.vertexProject || String(env.PLAYHUB_VERTEX_PROJECT || env.GOOGLE_CLOUD_PROJECT || '').trim(),
      vertexLocation: pending.vertexLocation || 'us-central1',
      vertexAccessToken: String(tokenData.access_token),
      refreshToken: tokenData.refresh_token ? String(tokenData.refresh_token) : null,
      geminiApiKey: '',
      expiresAt: now() + Math.max(60, expiresInSec - 60) * 1000,
      connectedAt: now()
    });

    return { ok: true, email };
  }

  async function connectManualOrGcloud({
    principalId,
    mode = 'gemini-key',
    vertexProject = '',
    vertexLocation = 'us-central1',
    accessToken = '',
    geminiApiKey = '',
    allowLocalGcloud = false
  }) {
    if (!principalId) throw new ApiError(403, 'AUTH_REQUIRED', '로그인이 필요합니다.');

    if (mode === 'gcloud-oauth') {
      if (!allowLocalGcloud) {
        throw new ApiError(403, 'GCLOUD_LOCAL_ONLY', '로컬 gcloud OAuth 자동 가져오기는 로컬/개발 환경에서만 사용할 수 있습니다.');
      }
      try {
        const [{ stdout: tokOut }, projRes, acctRes] = await Promise.all([
          execFileAsync('gcloud', ['auth', 'print-access-token'], { timeout: 6000, windowsHide: true }),
          execFileAsync('gcloud', ['config', 'get-value', 'project'], { timeout: 4000, windowsHide: true }).catch(() => ({ stdout: '' })),
          execFileAsync('gcloud', ['config', 'get-value', 'account'], { timeout: 4000, windowsHide: true }).catch(() => ({ stdout: '' }))
        ]);
        const token = String(tokOut || '').trim();
        const proj = String(vertexProject || projRes.stdout || '').trim();
        const acct = String(acctRes.stdout || '').trim();
        if (!token) throw new Error('토큰이 비어 있습니다.');
        credsByPrincipal.set(principalId, {
          mode: 'vertex-oauth',
          source: 'gcloud-oauth',
          email: acct && acct !== '(unset)' ? acct : null,
          vertexProject: proj && proj !== '(unset)' ? proj : '',
          vertexLocation: String(vertexLocation || 'us-central1').trim() || 'us-central1',
          vertexAccessToken: token,
          geminiApiKey: '',
          expiresAt: now() + 50 * 60 * 1000,
          connectedAt: now()
        });
        return getStatus(principalId, { allowLocalGcloud });
      } catch (err) {
        throw new ApiError(422, 'GCLOUD_OAUTH_FAILED', `로컬 gcloud OAuth 토큰을 가져오지 못했습니다. 터미널에서 'gcloud auth login' 후 다시 시도해 주세요. (${err.message || ''})`);
      }
    }

    if (mode === 'vertex-oauth') {
      const proj = String(vertexProject || '').trim().slice(0, 128);
      const tok = String(accessToken || '').trim();
      if (!proj || !tok) {
        throw new ApiError(422, 'VERTEX_OAUTH_REQUIRED', 'Google Cloud 프로젝트 ID와 OAuth 2.0 액세스 토큰을 모두 입력해 주세요.');
      }
      credsByPrincipal.set(principalId, {
        mode: 'vertex-oauth',
        source: 'manual-oauth',
        email: null,
        vertexProject: proj,
        vertexLocation: String(vertexLocation || 'us-central1').trim().slice(0, 48) || 'us-central1',
        vertexAccessToken: tok,
        geminiApiKey: '',
        expiresAt: now() + 55 * 60 * 1000,
        connectedAt: now()
      });
      return getStatus(principalId, { allowLocalGcloud });
    }

    // Default: personal Google AI Studio Gemini API Key
    const key = String(geminiApiKey || '').trim();
    if (key.length < 10) {
      throw new ApiError(422, 'GEMINI_KEY_INVALID', '유효한 개인 Google AI Studio Gemini API 키를 입력해 주세요.');
    }
    credsByPrincipal.set(principalId, {
      mode: 'gemini-key',
      source: 'gemini-key',
      email: null,
      vertexProject: '',
      vertexLocation: 'us-central1',
      vertexAccessToken: '',
      geminiApiKey: key,
      expiresAt: null,
      connectedAt: now()
    });
    return getStatus(principalId, { allowLocalGcloud });
  }

  function disconnect(principalId) {
    if (principalId) credsByPrincipal.delete(principalId);
    return { ok: true, connected: false };
  }

  return {
    getStatus,
    getCredentials,
    startGoogleOAuth,
    handleGoogleOAuthCallback,
    connectManualOrGcloud,
    disconnect
  };
}
