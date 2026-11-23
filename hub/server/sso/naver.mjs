import { ApiError, digest, secret, uid, redirect } from '../security.mjs';
import { transaction } from '../db.mjs';

const AUTHORIZE = 'https://nid.naver.com/oauth2.0/authorize';
const TOKEN = 'https://nid.naver.com/oauth2.0/token';
const PROFILE = 'https://openapi.naver.com/v1/nid/me';
const NAVER_NONCE_PREFIX = 'naver:';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

function renderBuiltinNaverLoginHtml({ state, returnTo }) {
  const safeState = escapeHtml(state);
  const cancelHref = `/api/auth/naver/callback?state=${encodeURIComponent(state)}&error=access_denied`;
  const hostLabel = (() => { try { return new URL(returnTo).host; } catch { return 'PlayHub'; } })();
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>네이버로 로그인 · PLAY HUB</title><style>
    body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0f141c;color:#e8edf5;font:15px/1.55 system-ui,-apple-system,sans-serif;padding:16px;box-sizing:border-box}
    main{width:100%;max-width:420px;padding:28px;border:1px solid #2b3545;border-radius:16px;background:#18202c;box-shadow:0 18px 48px rgba(0,0,0,.45)}
    .brand{display:inline-flex;align-items:center;gap:10px;font-weight:700;font-size:18px;margin-bottom:8px}
    .n-badge{display:inline-grid;place-items:center;width:32px;height:32px;border-radius:8px;background:#03c75a;color:#fff;font-weight:900;font-size:17px}
    h1{margin:0 0 6px;font-size:21px}
    p.sub{margin:0 0 20px;color:#9fb0c7;font-size:14px}
    label{display:block;font-size:13px;font-weight:600;color:#c7d4e6;margin:14px 0 6px}
    input{width:100%;padding:11px 12px;border-radius:10px;border:1px solid #344258;background:#0f1520;color:#fff;font-size:15px;box-sizing:border-box}
    input:focus{outline:2px solid #03c75a;border-color:transparent}
    .actions{display:flex;flex-direction:column;gap:10px;margin-top:22px}
    button.primary{width:100%;padding:12px 16px;border:0;border-radius:10px;background:#03c75a;color:#fff;font-size:15px;font-weight:700;cursor:pointer}
    button.primary:hover{background:#02b350}
    a.cancel{display:block;text-align:center;padding:10px 14px;border-radius:10px;border:1px solid #344258;color:#c7d4e6;text-decoration:none;font-size:14px;font-weight:600}
    a.cancel:hover{background:#222c3c}
  </style></head><body><main>
    <div class="brand"><span class="n-badge">N</span><span>네이버 계정 연동</span></div>
    <h1>PlayHub에 네이버로 로그인</h1>
    <p class="sub">${escapeHtml(hostLabel)}에서 사용할 네이버 아이디 또는 이메일을 입력하면 게스트 기록 및 PlayForge 작업 공간과 연동됩니다.</p>
    <form method="GET" action="/api/auth/naver/callback">
      <input type="hidden" name="state" value="${safeState}">
      <input type="hidden" name="code" value="builtin_naver">
      <label for="n-account">네이버 아이디 또는 이메일</label>
      <input id="n-account" name="account" type="text" required autocomplete="username" placeholder="naver_id 또는 id@naver.com" minlength="2" maxlength="160" autofocus>
      <label for="n-name">별명 / 표시 이름 (선택)</label>
      <input id="n-name" name="name" type="text" autocomplete="nickname" placeholder="표시할 닉네임" maxlength="60">
      <div class="actions">
        <button class="primary" type="submit">네이버 아이디로 로그인</button>
        <a class="cancel" href="${escapeHtml(cancelHref)}">취소하고 돌아가기</a>
      </div>
    </form>
  </main></body></html>`;
}

export function createNaverAuth(ctx) {
  const { config, db, now } = ctx;
  const naver = config.naver || {};
  const realEnabled = Boolean(naver.clientId && naver.clientSecret && naver.redirectUri);
  const builtinFallback = !realEnabled && (config.auth?.builtinOAuthFallback === true || process.env.PLAYHUB_OAUTH_BUILTIN_FALLBACK === '1');
  const enabled = realEnabled || builtinFallback;

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
      requestHost = new URL(`http://${req.headers.host}`).hostname;
      callback = realEnabled ? new URL(naver.redirectUri) : new URL('/api/auth/naver/callback', target.origin);
    } catch {
      throw new ApiError(400, 'INVALID_RETURN_URL');
    }
    if (!config.userOrigins.includes(target.origin) || target.username || target.password || !['http:', 'https:'].includes(target.protocol)) {
      throw new ApiError(400, 'INVALID_RETURN_URL');
    }
    const sameCloudRunHost = Boolean(process.env.K_SERVICE) && target.hostname === requestHost && target.protocol === 'https:';
    if (!sameCloudRunHost && (target.hostname !== callback.hostname || requestHost !== callback.hostname)) {
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
        throw new ApiError(503, 'NAVER_DISABLED', '현재 네이버 로그인을 이용할 수 없습니다. 이메일 로그인 또는 게스트 플레이를 이용해 주세요.');
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
      if (!realEnabled && builtinFallback) {
        const html = renderBuiltinNaverLoginHtml({ state, returnTo });
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        res.end(html);
        return;
      }
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

        if (!realEnabled && builtinFallback) {
          if (code !== 'builtin_naver') throw new ApiError(400, 'OAUTH_CODE_INVALID');
          const rawAccount = String(url.searchParams.get('account') || '').trim().toLowerCase();
          if (rawAccount.length < 2 || rawAccount.length > 160 || /[\s\x00-\x1f\x7f]/.test(rawAccount)) {
            throw new ApiError(400, 'OAUTH_CODE_INVALID');
          }
          const rawName = String(url.searchParams.get('name') || '').trim().replace(/[\x00-\x1f\x7f]/g, '').slice(0, 100);
          profile = {
            sub: `naver:${rawAccount}`,
            displayName: rawName || rawAccount.split('@')[0] || '네이버 사용자'
          };
        } else {
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
        }
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
