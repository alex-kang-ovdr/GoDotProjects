// OAuth credentials stay on the server; none of these fields belong in web config.
export function resolveUgcOrigin(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw !== 'string') throw new Error('PLAYHUB_UGC_ORIGIN must be a valid HTTP(S) origin.');
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  let parsed;
  try { parsed = new URL(trimmed); } catch { throw new Error('PLAYHUB_UGC_ORIGIN must be a valid HTTP(S) origin.'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== trimmed || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('PLAYHUB_UGC_ORIGIN must be an explicit HTTP(S) origin without path, query, fragment or credentials.');
  }
  return parsed.origin;
}

function validateOAuthProvider(providerName, callbackPath, cfg, input, env, envNames) {
  const result = { ...cfg };
  for (const [field, name] of Object.entries(envNames)) {
    if (env[name] !== undefined) result[field] = env[name];
  }
  const configured = Boolean(result.clientId || result.clientSecret);
  if (configured) {
    if (['clientId', 'clientSecret', 'redirectUri'].some(key => typeof result[key] !== 'string' || !result[key].trim())) {
      throw new Error(`${providerName} login requires clientId, clientSecret and redirectUri in private configuration or ${envNames.clientId.replace('_CLIENT_ID', '_*')} environment variables.`);
    }
    let callback, site;
    try { callback = new URL(result.redirectUri); site = new URL(input.userBaseUrl); }
    catch { throw new Error(`${providerName} callback and userBaseUrl must be valid URLs.`); }
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(callback.hostname);
    if (callback.pathname !== callbackPath || callback.search || callback.hash || callback.username || callback.password
      || !['http:', 'https:'].includes(callback.protocol) || callback.hostname !== site.hostname) {
      throw new Error(`${providerName} callback must use ${callbackPath} on the same hostname as userBaseUrl, without query, fragment or credentials.`);
    }
    if (!local && (callback.protocol !== 'https:' || site.protocol !== 'https:' || input.secureCookies !== true
      || !Array.isArray(input.userOrigins) || input.userOrigins.some(origin => !origin.startsWith('https://')))) {
      throw new Error(`Remote ${providerName} login requires HTTPS site/callback/origins and secureCookies.`);
    }
  }
  return result;
}

export function resolveRuntimeConfig(input, env = process.env) {
  const google = validateOAuthProvider('Google', '/api/auth/google/callback', input.google, input, env, {
    clientId: 'PLAYHUB_GOOGLE_CLIENT_ID',
    clientSecret: 'PLAYHUB_GOOGLE_CLIENT_SECRET',
    redirectUri: 'PLAYHUB_GOOGLE_REDIRECT_URI'
  });
  const naver = validateOAuthProvider('Naver', '/api/auth/naver/callback', input.naver, input, env, {
    clientId: 'PLAYHUB_NAVER_CLIENT_ID',
    clientSecret: 'PLAYHUB_NAVER_CLIENT_SECRET',
    redirectUri: 'PLAYHUB_NAVER_REDIRECT_URI'
  });
  const emailEnv = env.PLAYHUB_EMAIL_AUTH_ENABLED;
  const emailEnabled = emailEnv !== undefined
    ? !['0', 'false', 'off', 'no'].includes(String(emailEnv).trim().toLowerCase())
    : input.auth?.emailEnabled !== false;
  const auth = { ...input.auth, emailEnabled };
  const rawUgcOrigin = env.PLAYHUB_UGC_ORIGIN !== undefined ? env.PLAYHUB_UGC_ORIGIN : input.publish?.ugcOrigin;
  const ugcOrigin = resolveUgcOrigin(rawUgcOrigin);
  const publish = (input.publish || ugcOrigin)
    ? { ...input.publish, ...(ugcOrigin ? { ugcOrigin } : {}) }
    : undefined;
  return publish ? { ...input, google, naver, auth, publish } : { ...input, google, naver, auth };
}
