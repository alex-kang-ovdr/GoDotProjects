'use strict';

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const ACCOUNT_KEY = /^[a-f0-9]{64}$/;

function validateVerifyUrl(raw) {
  const url = new URL(String(raw || ''));
  if (!['http:', 'https:'].includes(url.protocol) || !LOOPBACK.has(url.hostname) || url.username || url.password || url.search || url.hash) {
    throw new Error('Hub session verifyUrl must be an explicit loopback HTTP(S) URL without query or credentials.');
  }
  return url.href;
}

function validateHubAccountUrl(raw) {
  const value = String(raw || '/?view=account');
  if (value.startsWith('/') && !value.startsWith('//') && !/[\\\0\r\n]/.test(value)) return value;
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Hub account URL must be a relative path or explicit HTTP(S) URL.');
  }
  return url.href;
}

function hubAuthConfigFromEnv(env = process.env) {
  const mode = String(env.PLAYHUB_FORGE_AUTH_MODE || '').trim().toLowerCase();
  const verifyUrl = String(env.PLAYHUB_SESSION_VERIFY_URL || '').trim();
  if (!mode && !verifyUrl) return null;
  if (mode && mode !== 'hub') {
    throw new Error('Unsupported PLAYHUB_FORGE_AUTH_MODE; expected "hub".');
  }
  if (!verifyUrl) {
    throw new Error('PLAYHUB_SESSION_VERIFY_URL is required when PLAYHUB_FORGE_AUTH_MODE=hub.');
  }
  return {
    verifyUrl,
    internalSecret: env.PLAYHUB_FORGE_INTERNAL_SECRET || '',
    accountsDirectory: env.PLAYHUB_FORGE_ACCOUNTS_DIR || '',
    studioDirectory: env.PLAYHUB_FORGE_STUDIOS_DIR || '',
    loginUrl: env.PLAYHUB_FORGE_HUB_ACCOUNT_URL || '/?view=account',
  };
}

// Fail-closed Hub session verifier. Forge never issues its own sessions, never
// trusts Authorization/Bearer or X-Forwarded-* headers, and never caches
// authentication results across requests so Hub logout takes effect immediately.
function createHubSessionAuth(options = {}) {
  const verifyUrl = validateVerifyUrl(options.verifyUrl);
  const internalSecret = typeof options.internalSecret === 'string' ? options.internalSecret : '';
  const loginUrl = validateHubAccountUrl(options.loginUrl || '/?view=account');
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const timeoutMs = Number.isInteger(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : 3000;

  async function verify(req, { requireCsrf } = {}) {
    if (req.headers?.authorization !== undefined) {
      return { authenticated: false, status: 401, error: 'HUB_SESSION_REQUIRED', loginUrl };
    }
    const cookie = typeof req.headers?.cookie === 'string' ? req.headers.cookie : '';
    if (!cookie) {
      return { authenticated: false, status: 401, error: 'GOOGLE_LOGIN_REQUIRED', loginUrl };
    }
    const method = String(req.method || 'GET').toUpperCase();
    const csrfToken = typeof req.headers?.['x-csrf-token'] === 'string' ? req.headers['x-csrf-token'] : undefined;
    const needsCsrf = requireCsrf !== undefined
      ? Boolean(requireCsrf)
      : (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) || csrfToken !== undefined);

    let response;
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (internalSecret) headers['X-PlayHub-Internal-Secret'] = internalSecret;
      response = await fetchImpl(verifyUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ cookie, method, csrfToken, requireCsrf: needsCsrf }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      return { authenticated: false, status: 503, error: 'AUTH_SERVICE_UNAVAILABLE', loginUrl };
    }

    let data = null;
    try { data = await response.json(); } catch {}
    if (response.status === 401 || response.status === 403) {
      return {
        authenticated: false,
        status: response.status,
        error: typeof data?.error === 'string' ? data.error : (response.status === 403 ? 'CSRF_INVALID' : 'GOOGLE_LOGIN_REQUIRED'),
        loginUrl,
      };
    }
    if (response.status !== 200 || data?.authenticated !== true ||
        typeof data.accountKey !== 'string' || !ACCOUNT_KEY.test(data.accountKey) ||
        !data.identity || typeof data.identity.sub !== 'string' || !data.identity.sub) {
      return { authenticated: false, status: 503, error: 'AUTH_SERVICE_UNAVAILABLE', loginUrl };
    }
    return {
      authenticated: true,
      userId: data.userId || null,
      displayName: data.displayName || null,
      accountKey: data.accountKey,
      identity: data.identity,
      csrfToken: typeof data.csrfToken === 'string' ? data.csrfToken : null,
      expiresAt: data.expiresAt || null,
      loginUrl,
    };
  }

  return { verify, loginUrl, verifyUrl };
}

module.exports = { createHubSessionAuth, hubAuthConfigFromEnv, validateHubAccountUrl };
