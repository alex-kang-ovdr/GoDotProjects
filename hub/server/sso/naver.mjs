import { ApiError, digest, secret, uid, redirect } from '../security.mjs';
import { transaction } from '../db.mjs';

const AUTHORIZE = 'https://nid.naver.com/oauth2.0/authorize';
const TOKEN = 'https://nid.naver.com/oauth2.0/token';
const PROFILE = 'https://openapi.naver.com/v1/nid/me';
const NAVER_NONCE_PREFIX = 'naver:';

export function createNaverAuth(ctx) {
  const { config, db, now } = ctx;
  const naver = config.naver || {};
  const enabled = Boolean(naver.clientId && naver.clientSecret && naver.redirectUri);

  async function fetchNaverJson(url, errorCode, options) {
    try {
      const response = await ctx.fetch(url, { ...options, signal: AbortSignal.timeout(10000) });
      if (response.ok) return await response.json();
    } catch {}
    throw new ApiError(502, errorCode);
  }

  function returnUrl(value) {
    const url = new URL(value, config.userBaseUrl);
    url.searchParams.delete('auth');
    url.searchParams.delete('authError');
    url.searchParams.delete('authProvider');
    return url;
  }

  function getReturn(req, requested) {
    let target, callback, requestHost;
    try {
      target = returnUrl(requested || '/');
      callback = new URL(naver.redirectUri);
      requestHost = new URL(`http://${req.headers.host}`).hostname;
    } catch {
      throw new ApiError(400, 'INVALID_RETURN_URL');
    }
    if (!config.userOrigins.includes(target.origin) || target.username || target.password || !['http:', 'https:'].includes(target.protocol)) {
      throw new ApiError(400, 'INVALID_RETURN_URL');
    }
    if (target.hostname !== callback.hostname || requestHost !== callback.hostname) {
      throw new ApiError(
        400,
        'NAVER_ORIGIN_UNSUPPORTED',
        'Naver callback과 현재 사이트/API의 호스트가 같아야 합니다. LAN Naver 로그인은 등록된 HTTPS 도메인으로 구성하세요.'
      );
    }
    if (callback.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(callback.hostname)) {
      throw new ApiError(400, 'NAVER_HTTPS_REQUIRED');
    }
    return target.href;
  }

  return {
    enabled,
    async start(req, res, session, url) {
      if (!enabled) {
        throw new ApiError(503, 'NAVER_DISABLED', '네이버 OAuth 설정이 없습니다. 이메일 로그인 또는 게스트 플레이를 이용할 수 있습니다.');
      }
      const returnTo = getReturn(req, url.searchParams.get('returnTo'));
      const state = secret();
      const nonce = `${NAVER_NONCE_PREFIX}${secret()}`;
      const verifier = secret();
      const user = session.principal_id ? db.prepare('SELECT kind FROM users WHERE id=?').get(session.principal_id) : null;
      db.prepare('INSERT INTO oauth_states VALUES(?,?,?,?,?,?,?,?,NULL)').run(
        digest(state),
        session.id_hash,
        user?.kind === 'guest' ? session.principal_id : null,
        session.analytics_subject,
        nonce,
        verifier,
        returnTo,
        now() + 300000
      );
      const target = new URL(AUTHORIZE);
      for (const [key, value] of Object.entries({
        response_type: 'code',
        client_id: naver.clientId,
        redirect_uri: naver.redirectUri,
        state
      })) {
        target.searchParams.set(key, value);
      }
      redirect(res, target.href);
    },

    async callback(req, res, session, url) {
      if (!enabled) throw new ApiError(503, 'NAVER_DISABLED');
      const state = url.searchParams.get('state');
      const stamp = now();
      const attempt = state && db.prepare(`UPDATE oauth_states SET used_at=?
        WHERE state_hash=? AND session_hash=? AND used_at IS NULL AND expires_at>? AND nonce LIKE 'naver:%'
        RETURNING *`).get(stamp, digest(state), session.id_hash, stamp);
      if (!attempt) throw new ApiError(400, 'OAUTH_STATE_INVALID');

      const back = returnUrl(attempt.return_to);
      let profile;
      try {
        const providerError = url.searchParams.get('error');
        if (providerError !== null) {
          throw new ApiError(401, providerError === 'access_denied' ? 'NAVER_CANCELLED' : 'NAVER_PROVIDER_ERROR');
        }
        const code = url.searchParams.get('code');
        if (!code || code.length > 4096) throw new ApiError(400, 'OAUTH_CODE_INVALID');

        const tokens = await fetchNaverJson(TOKEN, 'NAVER_EXCHANGE_FAILED', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: naver.clientId,
            client_secret: naver.clientSecret,
            code,
            state
          })
        });
        if (!tokens || tokens.error || typeof tokens.access_token !== 'string' || !tokens.access_token) {
          throw new ApiError(502, 'NAVER_EXCHANGE_FAILED');
        }

        const me = await fetchNaverJson(PROFILE, 'NAVER_PROFILE_FAILED', {
          method: 'GET',
          headers: { Authorization: `Bearer ${tokens.access_token}` }
        });
        if (!me || me.resultcode !== '00' || !me.response || typeof me.response !== 'object') {
          throw new ApiError(502, 'NAVER_PROFILE_FAILED');
        }
        const sub = me.response.id;
        if (typeof sub !== 'string' || !sub.trim() || sub.length > 255) {
          throw new ApiError(401, 'NAVER_PROFILE_INVALID');
        }
        const rawName = (typeof me.response.nickname === 'string' && me.response.nickname.trim())
          || (typeof me.response.name === 'string' && me.response.name.trim())
          || '네이버 사용자';
        profile = {
          sub: sub.trim(),
          displayName: rawName.replace(/[\x00-\x1f\x7f]/g, '').slice(0, 100) || '네이버 사용자'
        };
      } catch (error) {
        if (!(error instanceof ApiError)) throw error;
        back.searchParams.set('authProvider', 'naver');
        back.searchParams.set('authError', error.code);
        redirect(res, back.href);
        return;
      }

      const previousCookies = res.getHeader('Set-Cookie');
      try {
        transaction(db, () => {
          const current = db.prepare("SELECT id_hash FROM sessions WHERE id_hash=? AND kind='public' AND expires_at>?").get(session.id_hash, now());
          if (!current) throw new ApiError(401, 'SESSION_REQUIRED');

          const identity = db.prepare('SELECT user_id FROM identities WHERE provider=? AND subject=?').get('naver', profile.sub);
          const userId = identity?.user_id ?? uid();
          if (!identity) {
            db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(userId, 'registered', profile.displayName, now());
            db.prepare('INSERT INTO identities VALUES(?,?,?)').run('naver', profile.sub, userId);
          }
          const analyticsSubject = `u:${userId}`;
          ctx.revokeSession(current);
          if (attempt.guest_id && attempt.guest_id !== userId) {
            db.prepare('INSERT INTO merge_requests VALUES(?,?,?,?,?,?,?,NULL)').run(
              uid(),
              attempt.guest_id,
              userId,
              attempt.source_subject,
              analyticsSubject,
              'pending',
              now() + 86400000
            );
          }
          ctx.audit('naver_login', userId, { provider: 'naver' });
          ctx.newSession(res, 'public', userId, analyticsSubject);
        });
      } catch (error) {
        if (previousCookies === undefined) res.removeHeader('Set-Cookie');
        else res.setHeader('Set-Cookie', previousCookies);
        throw error;
      }

      back.searchParams.set('authProvider', 'naver');
      back.searchParams.set('auth', 'success');
      redirect(res, back.href);
    }
  };
}
