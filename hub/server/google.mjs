import { createPublicKey, verify, createHash } from 'node:crypto';
import { ApiError, digest, equal, secret, uid, redirect } from './security.mjs';
import { transaction } from './db.mjs';

const AUTHORIZE = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const JWKS = 'https://www.googleapis.com/oauth2/v3/certs';
export function createGoogle(ctx) {
  const { config, db, now } = ctx;
  const google = config.google || {};
  const enabled = Boolean(google.clientId && google.clientSecret && google.redirectUri);
  let cachedKeys = [], keysUntil = 0;
  async function fetchGoogleJson(url, errorCode, options) {
    try {
      const response = await ctx.fetch(url, { ...options, signal: AbortSignal.timeout(10000) });
      if (response.ok) return await response.json();
    } catch {}
    throw new ApiError(502, errorCode);
  }
  async function getKeys(force = false) {
    if (!force && cachedKeys.length && now() < keysUntil) return cachedKeys;
    const body = await fetchGoogleJson(JWKS, 'GOOGLE_KEYS_UNAVAILABLE');
    if (!Array.isArray(body?.keys)) throw new ApiError(502, 'GOOGLE_KEYS_UNAVAILABLE');
    cachedKeys = body.keys; keysUntil = now() + 3600000; return cachedKeys;
  }
  async function verifyIdToken(token, nonce) {
    if (typeof token !== 'string' || token.length > 32768) throw new ApiError(401, 'GOOGLE_TOKEN_INVALID');
    const pieces = token.split('.');
    if (pieces.length !== 3 || pieces.some(p => !/^[A-Za-z0-9_-]+$/.test(p))) throw new ApiError(401, 'GOOGLE_TOKEN_INVALID');
    let header, claims;
    try { header = JSON.parse(Buffer.from(pieces[0], 'base64url')); claims = JSON.parse(Buffer.from(pieces[1], 'base64url')); }
    catch { throw new ApiError(401, 'GOOGLE_TOKEN_INVALID'); }
    if (header?.alg !== 'RS256' || typeof header.kid !== 'string' || !claims || typeof claims !== 'object' || Array.isArray(claims)) throw new ApiError(401, 'GOOGLE_TOKEN_INVALID');
    const matchesKey = key => key?.kid === header.kid && key.kty === 'RSA' && (!key.use || key.use === 'sig') && (!key.alg || key.alg === 'RS256');
    const key = (await getKeys()).find(matchesKey) ?? (await getKeys(true)).find(matchesKey);
    try {
      if (!key || !verify('RSA-SHA256', Buffer.from(`${pieces[0]}.${pieces[1]}`), createPublicKey({ key, format: 'jwk' }), Buffer.from(pieces[2], 'base64url'))) throw new Error();
    } catch { throw new ApiError(401, 'GOOGLE_TOKEN_INVALID'); }
    const seconds = Math.floor(now() / 1000), audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss)
      || !audiences.includes(google.clientId) || (claims.azp && claims.azp !== google.clientId)
      || (audiences.length > 1 && claims.azp !== google.clientId)
      || !Number.isFinite(claims.exp) || claims.exp <= seconds
      || !Number.isFinite(claims.iat) || claims.iat > seconds + 60
      || !equal(claims.nonce, nonce) || typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 255) throw new ApiError(401, 'GOOGLE_TOKEN_INVALID');
    return claims;
  }
  function returnUrl(value) {
    const url = new URL(value, config.userBaseUrl);
    url.searchParams.delete('auth');
    url.searchParams.delete('authError');
    return url;
  }
  function getReturn(req, requested) {
    let target, callback, requestHost;
    try {
      target = returnUrl(requested || '/');
      callback = new URL(google.redirectUri);
      requestHost = new URL(`http://${req.headers.host}`).hostname;
    } catch { throw new ApiError(400, 'INVALID_RETURN_URL'); }
    if (!config.userOrigins.includes(target.origin) || target.username || target.password || !['http:', 'https:'].includes(target.protocol)) throw new ApiError(400, 'INVALID_RETURN_URL');
    if (target.hostname !== callback.hostname || requestHost !== callback.hostname) throw new ApiError(400, 'GOOGLE_ORIGIN_UNSUPPORTED', 'Google callback과 현재 사이트/API의 호스트가 같아야 합니다. LAN Google 로그인은 등록된 HTTPS 도메인으로 구성하세요.');
    if (callback.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(callback.hostname)) throw new ApiError(400, 'GOOGLE_HTTPS_REQUIRED');
    return target.href;
  }
  return { enabled,
    async start(req, res, session, url) {
      if (!enabled) throw new ApiError(503, 'GOOGLE_DISABLED', 'Google OAuth 설정이 없습니다. 게스트 플레이를 계속할 수 있습니다.');
      const returnTo = getReturn(req, url.searchParams.get('returnTo'));
      const state = secret(), nonce = secret(), verifier = secret();
      const user = session.principal_id ? db.prepare('SELECT kind FROM users WHERE id=?').get(session.principal_id) : null;
      db.prepare('INSERT INTO oauth_states VALUES(?,?,?,?,?,?,?,?,NULL)').run(digest(state), session.id_hash, user?.kind === 'guest' ? session.principal_id : null, session.analytics_subject, nonce, verifier, returnTo, now() + 300000);
      const target = new URL(AUTHORIZE);
      for (const [key, value] of Object.entries({ client_id: google.clientId, redirect_uri: google.redirectUri, response_type: 'code', scope: 'openid profile', state, nonce, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' })) target.searchParams.set(key, value);
      redirect(res, target.href);
    },
    async callback(req, res, session, url) {
      if (!enabled) throw new ApiError(503, 'GOOGLE_DISABLED');
      const state = url.searchParams.get('state');
      const stamp = now();
      const attempt = state && db.prepare(`UPDATE oauth_states SET used_at=?
        WHERE state_hash=? AND session_hash=? AND used_at IS NULL AND expires_at>?
        RETURNING *`).get(stamp, digest(state), session.id_hash, stamp);
      if (!attempt) throw new ApiError(400, 'OAUTH_STATE_INVALID');

      const back = returnUrl(attempt.return_to);
      let claims;
      try {
        const providerError = url.searchParams.get('error');
        if (providerError !== null) throw new ApiError(401, providerError === 'access_denied' ? 'GOOGLE_CANCELLED' : 'GOOGLE_PROVIDER_ERROR');
        const code = url.searchParams.get('code');
        if (!code || code.length > 4096) throw new ApiError(400, 'OAUTH_CODE_INVALID');
        const tokens = await fetchGoogleJson(TOKEN, 'GOOGLE_EXCHANGE_FAILED', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: google.clientId, client_secret: google.clientSecret, redirect_uri: google.redirectUri, code_verifier: attempt.verifier })
        });
        claims = await verifyIdToken(tokens?.id_token, attempt.nonce);
      } catch (error) {
        if (!(error instanceof ApiError)) throw error;
        back.searchParams.set('authError', error.code);
        redirect(res, back.href);
        return;
      }
      const previousCookies = res.getHeader('Set-Cookie');
      try {
        transaction(db, () => {
          // Logout or a second callback may have revoked this session during the token request.
          const current = db.prepare("SELECT id_hash FROM sessions WHERE id_hash=? AND kind='public' AND expires_at>?").get(session.id_hash, now());
          if (!current) throw new ApiError(401, 'SESSION_REQUIRED');

          const identity = db.prepare('SELECT user_id FROM identities WHERE provider=? AND subject=?').get('google', claims.sub);
          const userId = identity?.user_id ?? uid();
          if (!identity) {
            const name = typeof claims.name === 'string' && claims.name ? claims.name : 'Google 사용자';
            db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(userId, 'registered', name.slice(0, 100), now());
            db.prepare('INSERT INTO identities VALUES(?,?,?)').run('google', claims.sub, userId);
          }
          const analyticsSubject = `u:${userId}`;
          ctx.revokeSession(current);
          if (attempt.guest_id && attempt.guest_id !== userId) db.prepare('INSERT INTO merge_requests VALUES(?,?,?,?,?,?,?,NULL)').run(uid(), attempt.guest_id, userId, attempt.source_subject, analyticsSubject, 'pending', now() + 86400000);
          ctx.audit('google_login', userId, { provider: 'google' });
          ctx.newSession(res, 'public', userId, analyticsSubject);
        });
      } catch (error) {
        if (previousCookies === undefined) res.removeHeader('Set-Cookie');
        else res.setHeader('Set-Cookie', previousCookies);
        throw error;
      }
      back.searchParams.set('auth', 'success');
      redirect(res, back.href);
    }
  };
}
