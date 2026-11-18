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
  async function getKeys(force = false) {
    if (!force && cachedKeys.length && now() < keysUntil) return cachedKeys;
    const response = await ctx.fetch(JWKS, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new ApiError(502, 'GOOGLE_KEYS_UNAVAILABLE');
    const body = await response.json();
    if (!Array.isArray(body.keys)) throw new ApiError(502, 'GOOGLE_KEYS_UNAVAILABLE');
    cachedKeys = body.keys; keysUntil = now() + 3600000; return cachedKeys;
  }
  async function verifyIdToken(token, nonce) {
    if (typeof token !== 'string' || token.length > 32768) throw new ApiError(401, 'GOOGLE_TOKEN_INVALID');
    const pieces = token.split('.');
    if (pieces.length !== 3 || pieces.some(p => !/^[A-Za-z0-9_-]+$/.test(p))) throw new ApiError(401, 'GOOGLE_TOKEN_INVALID');
    let header, claims;
    try { header = JSON.parse(Buffer.from(pieces[0], 'base64url')); claims = JSON.parse(Buffer.from(pieces[1], 'base64url')); }
    catch { throw new ApiError(401, 'GOOGLE_TOKEN_INVALID'); }
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new ApiError(401, 'GOOGLE_TOKEN_INVALID');
    let keys = await getKeys(), key = keys.find(k => k.kid === header.kid && k.kty === 'RSA' && (!k.use || k.use === 'sig') && (!k.alg || k.alg === 'RS256'));
    if (!key) { keys = await getKeys(true); key = keys.find(k => k.kid === header.kid && k.kty === 'RSA' && (!k.use || k.use === 'sig') && (!k.alg || k.alg === 'RS256')); }
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
  function getReturn(req, requested) {
    let target, callback, requestHost;
    try {
      target = new URL(requested || '/', config.userBaseUrl);
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
      const attempt = state && db.prepare('SELECT * FROM oauth_states WHERE state_hash=?').get(digest(state));
      if (!attempt || attempt.used_at !== null || attempt.expires_at <= now() || attempt.session_hash !== session.id_hash) throw new ApiError(400, 'OAUTH_STATE_INVALID');
      db.prepare('UPDATE oauth_states SET used_at=? WHERE state_hash=? AND used_at IS NULL').run(now(), digest(state));
      if (url.searchParams.has('error')) { const back = new URL(attempt.return_to); back.searchParams.set('authError', 'GOOGLE_CANCELLED'); redirect(res, back.href); return; }
      const code = url.searchParams.get('code');
      if (!code || code.length > 4096) throw new ApiError(400, 'OAUTH_CODE_INVALID');
      const response = await ctx.fetch(TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: google.clientId, client_secret: google.clientSecret, redirect_uri: google.redirectUri, code_verifier: attempt.verifier }), signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new ApiError(401, 'GOOGLE_EXCHANGE_FAILED');
      const tokens = await response.json();
      const claims = await verifyIdToken(tokens.id_token, attempt.nonce);
      const userId = transaction(db, () => {
        const identity = db.prepare('SELECT user_id FROM identities WHERE provider=? AND subject=?').get('google', claims.sub);
        if (identity) return identity.user_id;
        const id = uid();
        db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(id, 'registered', String(claims.name || 'Google 사용자').slice(0, 100), now());
        db.prepare('INSERT INTO identities VALUES(?,?,?)').run('google', claims.sub, id); return id;
      });
      ctx.revokeSession(session);
      const next = ctx.newSession(res, 'public', userId, `u:${userId}`);
      if (attempt.guest_id && attempt.guest_id !== userId) db.prepare('INSERT INTO merge_requests VALUES(?,?,?,?,?,?,?,NULL)').run(uid(), attempt.guest_id, userId, attempt.source_subject, next.analytics_subject, 'pending', now() + 86400000);
      ctx.audit('google_login', userId, { provider: 'google' });
      const back = new URL(attempt.return_to); back.searchParams.set('auth', 'success'); redirect(res, back.href);
    }
  };
}
