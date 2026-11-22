import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.mjs';
import { resolveRuntimeConfig } from '../server/runtime-config.mjs';
import { SCHEMA_ALLOWLIST, DROP_TABLES } from '../tools/sanitize-snapshot.mjs';

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-sso-test-'));
}

function makeClient(baseUrl, origin) {
  const jar = new Map();
  let csrf = null;

  function cookieHeader() {
    return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  function storeCookies(res) {
    const setCookies = typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : [];
    for (const line of setCookies) {
      const [pair, ...attrs] = line.split(';');
      const idx = pair.indexOf('=');
      if (idx <= 0) continue;
      const name = pair.slice(0, idx).trim();
      const val = pair.slice(idx + 1).trim();
      const maxAge = attrs.find(a => a.trim().toLowerCase().startsWith('max-age='));
      if (maxAge && Number(maxAge.split('=')[1]) <= 0) jar.delete(name);
      else if (val) jar.set(name, val);
    }
  }

  return {
    get csrf() { return csrf; },
    async call(pathname, { method = 'GET', body, headers = {}, redirect = 'manual', omitCsrf = false } = {}) {
      const h = { ...headers };
      const cookie = cookieHeader();
      if (cookie) h.Cookie = cookie;
      if (method !== 'GET' && method !== 'HEAD') {
        h.Origin = origin;
        if (csrf && !omitCsrf) h['X-CSRF-Token'] = csrf;
        if (body !== undefined) h['Content-Type'] = 'application/json';
      }
      const res = await fetch(`${baseUrl}${pathname}`, {
        method,
        headers: h,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        redirect
      });
      storeCookies(res);
      let data = null;
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        data = await res.json();
        if (data?.csrfToken) csrf = data.csrfToken;
      }
      return { status: res.status, headers: res.headers, data };
    }
  };
}

async function startFixture(options = {}) {
  const dataDir = makeTempDir();
  let currentTime = options.startTime || Date.parse('2026-11-22T00:00:00Z');
  const origin = 'http://localhost:8080';
  const app = createApp(
    {
      dataDir,
      publicHost: '127.0.0.1',
      publicPort: 0,
      adminHost: '127.0.0.1',
      adminPort: 0,
      userBaseUrl: origin,
      userOrigins: [origin],
      adminOrigins: ['http://127.0.0.1:8081'],
      secureCookies: false,
      ...(options.config || {})
    },
    {
      clock: () => currentTime,
      fetch: options.fetch || globalThis.fetch,
      verifyMobileGoogleToken: options.verifyMobileGoogleToken,
      verifyMobileNaverToken: options.verifyMobileNaverToken,
      env: options.env || {}
    }
  );
  const { public: pub } = await app.listen();
  const baseUrl = `http://localhost:${pub.port}`;
  return {
    app,
    baseUrl,
    origin,
    dataDir,
    advance(ms) { currentTime += ms; },
    newClient() { return makeClient(baseUrl, origin); },
    async close() {
      await app.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  };
}

test('runtime-config validates Naver OAuth env overrides and email auth toggle', () => {
  const local = {
    userBaseUrl: 'http://localhost:8080',
    userOrigins: ['http://localhost:8080'],
    naver: { redirectUri: 'http://localhost:8090/api/auth/naver/callback' }
  };
  const creds = { PLAYHUB_NAVER_CLIENT_ID: 'naver-id', PLAYHUB_NAVER_CLIENT_SECRET: 'naver-secret' };
  const resolved = resolveRuntimeConfig(local, creds);
  assert.equal(resolved.naver.clientId, 'naver-id');
  assert.equal(resolved.naver.clientSecret, 'naver-secret');
  assert.equal(resolved.auth.emailEnabled, true);
  assert.equal(local.naver.clientSecret, undefined);

  assert.throws(
    () => resolveRuntimeConfig(local, { PLAYHUB_NAVER_CLIENT_SECRET: 'top-secret-naver' }),
    err => !err.message.includes('top-secret-naver') && /Naver login requires/.test(err.message)
  );
  assert.throws(
    () => resolveRuntimeConfig(local, { ...creds, PLAYHUB_NAVER_REDIRECT_URI: 'http://localhost:8090/api/auth/google/callback' })
  );
  assert.throws(
    () => resolveRuntimeConfig(
      { userBaseUrl: 'https://play.example', userOrigins: ['https://play.example'], secureCookies: false },
      { ...creds, PLAYHUB_NAVER_REDIRECT_URI: 'https://play.example/api/auth/naver/callback' }
    )
  );

  const disabledEmail = resolveRuntimeConfig(local, { PLAYHUB_EMAIL_AUTH_ENABLED: '0' });
  assert.equal(disabledEmail.auth.emailEnabled, false);
});

test('email register, login, lockout, password change, and guest save merge', async () => {
  const f = await startFixture();
  try {
    const client = f.newClient();
    const initial = await client.call('/api/session');
    assert.equal(initial.status, 200);
    assert.equal(initial.data.emailEnabled, true);
    assert.equal(initial.data.naverEnabled, false);
    assert.equal(initial.data.authProvider, null);

    // CSRF required
    const noCsrf = await client.call('/api/auth/email/register', {
      method: 'POST',
      body: { email: 'user@example.com', password: 'Password123' },
      omitCsrf: true
    });
    assert.equal(noCsrf.status, 403);

    // Weak password rejected
    const weak = await client.call('/api/auth/email/register', {
      method: 'POST',
      body: { email: 'user@example.com', password: 'short' }
    });
    assert.equal(weak.status, 422);
    assert.equal(weak.data.error.code, 'PASSWORD_TOO_WEAK');

    // Create a guest preference so we verify guest merge request is created on register
    const pref = await client.call('/api/preferences', { method: 'PUT', body: { locale: 'en' } });
    assert.equal(pref.status, 200);
    assert.equal((await client.call('/api/session')).data.kind, 'guest');

    // Register with email
    const reg = await client.call('/api/auth/email/register', {
      method: 'POST',
      body: { email: '  Tester@Example.com ', password: 'Password123', displayName: '테스트유저' }
    });
    assert.equal(reg.status, 201);
    assert.equal(reg.data.kind, 'registered');
    assert.equal(reg.data.authProvider, 'email');
    assert.equal(reg.data.displayName, '테스트유저');
    assert.ok(reg.data.pendingMerge?.id);

    // Merge guest data into newly registered email account
    const merged = await client.call('/api/auth/merge', {
      method: 'POST',
      body: { mergeId: reg.data.pendingMerge.id, consent: true, choices: [] }
    });
    assert.equal(merged.status, 200);
    const prefAfterMerge = await client.call('/api/preferences');
    assert.equal(prefAfterMerge.data.locale, 'en');

    // Duplicate email rejected (case-insensitive)
    const other = f.newClient();
    await other.call('/api/session');
    const dup = await other.call('/api/auth/email/register', {
      method: 'POST',
      body: { email: 'tester@example.com', password: 'Password123' }
    });
    assert.equal(dup.status, 409);
    assert.equal(dup.data.error.code, 'EMAIL_ALREADY_REGISTERED');

    // Failed logins trigger lockout after 5 attempts
    for (let i = 0; i < 4; i++) {
      const bad = await other.call('/api/auth/email/login', {
        method: 'POST',
        body: { email: 'tester@example.com', password: 'WrongPassword1' }
      });
      assert.equal(bad.status, 401);
      assert.equal(bad.data.error.code, 'EMAIL_CREDENTIALS_INVALID');
    }
    const locked = await other.call('/api/auth/email/login', {
      method: 'POST',
      body: { email: 'tester@example.com', password: 'WrongPassword1' }
    });
    assert.equal(locked.status, 429);
    assert.equal(locked.data.error.code, 'EMAIL_ACCOUNT_LOCKED');

    // Even valid password rejected while locked
    const stillLocked = await other.call('/api/auth/email/login', {
      method: 'POST',
      body: { email: 'tester@example.com', password: 'Password123' }
    });
    assert.equal(stillLocked.status, 429);

    // Advance past 5-minute lock window and log in
    f.advance(5 * 60 * 1000 + 1000);
    const loggedIn = await other.call('/api/auth/email/login', {
      method: 'POST',
      body: { email: 'TESTER@example.com', password: 'Password123' }
    });
    assert.equal(loggedIn.status, 200);
    assert.equal(loggedIn.data.kind, 'registered');
    assert.equal(loggedIn.data.authProvider, 'email');
    assert.equal(loggedIn.data.displayName, '테스트유저');

    // Change password (must revoke other active sessions of the same user while keeping current session)
    const pwChange = await other.call('/api/auth/email/password', {
      method: 'POST',
      body: { currentPassword: 'Password123', newPassword: 'NewPassword456' }
    });
    assert.equal(pwChange.status, 200);
    assert.equal(pwChange.data.revokedOtherSessions, 1);
    const revokedClientSession = await client.call('/api/session');
    assert.equal(revokedClientSession.data.kind, 'anonymous');
    const keptOtherSession = await other.call('/api/session');
    assert.equal(keptOtherSession.data.kind, 'registered');

    // Logout & verify old password fails and new password succeeds
    await other.call('/api/auth/logout', { method: 'POST', body: {} });
    await other.call('/api/session');
    const oldPw = await other.call('/api/auth/email/login', {
      method: 'POST',
      body: { email: 'tester@example.com', password: 'Password123' }
    });
    assert.equal(oldPw.status, 401);
    const newPw = await other.call('/api/auth/email/login', {
      method: 'POST',
      body: { email: 'tester@example.com', password: 'NewPassword456' }
    });
    assert.equal(newPw.status, 200);
    assert.equal(newPw.data.kind, 'registered');

    // QA session blocks email login
    const qa = f.newClient();
    await qa.call('/api/session');
    await qa.call('/api/qa/session', { method: 'POST', body: {} });
    const qaLogin = await qa.call('/api/auth/email/login', {
      method: 'POST',
      body: { email: 'tester@example.com', password: 'NewPassword456' }
    });
    assert.equal(qaLogin.status, 403);
  } finally {
    await f.close();
  }
});

test('Naver OAuth start, callback, re-login, cancellation, state replay protection, and guest merge', async () => {
  const naverMock = async (url, opts) => {
    const href = String(url);
    if (href.startsWith('https://nid.naver.com/oauth2.0/token')) {
      const body = String(opts?.body || '');
      assert.ok(body.includes('grant_type=authorization_code'));
      return new Response(JSON.stringify({ access_token: 'naver-access-xyz', token_type: 'bearer', expires_in: '3600' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (href.startsWith('https://openapi.naver.com/v1/nid/me')) {
      assert.equal(opts?.headers?.Authorization, 'Bearer naver-access-xyz');
      return new Response(JSON.stringify({
        resultcode: '00',
        message: 'success',
        response: { id: 'naver-sub-999', nickname: '네이버게이머', name: '홍길동' }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    throw new Error(`Unexpected fetch: ${href}`);
  };

  const f = await startFixture({
    fetch: naverMock,
    config: {
      naver: {
        clientId: 'naver-client-1',
        clientSecret: 'naver-secret-1',
        redirectUri: 'http://localhost:8090/api/auth/naver/callback'
      }
    }
  });

  try {
    const client = f.newClient();
    const initial = await client.call('/api/session');
    assert.equal(initial.data.naverEnabled, true);

    // Promote to guest via preference before Naver login
    const pref = await client.call('/api/preferences', { method: 'PUT', body: { locale: 'ja' } });
    assert.equal(pref.status, 200);

    // Start Naver OAuth
    const start = await client.call('/api/auth/naver/start?returnTo=%2F%3Fview%3Daccount');
    assert.equal(start.status, 302);
    const authorizeUrl = new URL(start.headers.get('location'));
    assert.equal(authorizeUrl.origin, 'https://nid.naver.com');
    assert.equal(authorizeUrl.pathname, '/oauth2.0/authorize');
    assert.equal(authorizeUrl.searchParams.get('client_id'), 'naver-client-1');
    const state = authorizeUrl.searchParams.get('state');
    assert.ok(state);

    // Callback completes login and sets authProvider=naver
    const cb = await client.call(`/api/auth/naver/callback?code=naver-code-1&state=${encodeURIComponent(state)}`);
    assert.equal(cb.status, 302);
    const back = new URL(cb.headers.get('location'));
    assert.equal(back.searchParams.get('auth'), 'success');
    assert.equal(back.searchParams.get('authProvider'), 'naver');

    const authed = await client.call('/api/session');
    assert.equal(authed.data.kind, 'registered');
    assert.equal(authed.data.authProvider, 'naver');
    assert.equal(authed.data.displayName, '네이버게이머');
    assert.ok(authed.data.pendingMerge?.id);

    // State replay rejected
    const replay = await client.call(`/api/auth/naver/callback?code=naver-code-1&state=${encodeURIComponent(state)}`);
    assert.equal(replay.status, 400);
    assert.equal(replay.data.error.code, 'OAUTH_STATE_INVALID');

    // Cancellation flow
    const second = f.newClient();
    await second.call('/api/session');
    const start2 = await second.call('/api/auth/naver/start?returnTo=%2F%3Fview%3Daccount');
    const state2 = new URL(start2.headers.get('location')).searchParams.get('state');
    const cancelled = await second.call(`/api/auth/naver/callback?error=access_denied&state=${encodeURIComponent(state2)}`);
    assert.equal(cancelled.status, 302);
    const cancelBack = new URL(cancelled.headers.get('location'));
    assert.equal(cancelBack.searchParams.get('authError'), 'NAVER_CANCELLED');
    assert.equal(cancelBack.searchParams.get('authProvider'), 'naver');

    // Re-login with same Naver sub returns same user
    const start3 = await second.call('/api/auth/naver/start?returnTo=%2F%3Fview%3Daccount');
    const state3 = new URL(start3.headers.get('location')).searchParams.get('state');
    const cb3 = await second.call(`/api/auth/naver/callback?code=naver-code-2&state=${encodeURIComponent(state3)}`);
    assert.equal(cb3.status, 302);
    const authed2 = await second.call('/api/session');
    assert.equal(authed2.data.kind, 'registered');
    assert.equal(authed2.data.displayName, '네이버게이머');
  } finally {
    await f.close();
  }
});

test('email_credentials is allowlisted and dropped in sanitize-snapshot', () => {
  assert.ok(Array.isArray(SCHEMA_ALLOWLIST.email_credentials));
  assert.ok(DROP_TABLES.includes('email_credentials'));
});

test('web explicit guest login and authProviders metadata', async () => {
  const f = await startFixture();
  try {
    const client = f.newClient();
    const anon = await client.call('/api/session');
    assert.equal(anon.data.kind, 'anonymous');
    assert.deepEqual(anon.data.authProviders, { email: true, google: false, naver: false, guest: true });

    const guest = await client.call('/api/auth/guest', { method: 'POST', body: {} });
    assert.equal(guest.status, 200);
    assert.equal(guest.data.kind, 'guest');
    assert.equal(guest.data.authProvider, 'guest');
  } finally {
    await f.close();
  }
});

test('mobile/native unified 4-way auth API (providers, guest, email, google, naver)', async () => {
  const f = await startFixture({
    config: {
      mobile: { enabled: true, jwtSecret: 'test-mobile-jwt-secret-32-chars-minimum' }
    },
    verifyMobileGoogleToken: async (token) => {
      if (token === 'google-id-token-ok') return { sub: 'g-mobile-1', name: '구글모바일' };
      return null;
    },
    verifyMobileNaverToken: async (body) => {
      if (body.accessToken === 'naver-sdk-token-ok') return { sub: 'n-mobile-1', name: '네이버모바일' };
      return null;
    }
  });
  try {
    async function mobileReq(pathname, { method = 'GET', body, token } = {}) {
      const headers = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      const res = await fetch(`${f.baseUrl}${pathname}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined
      });
      return { status: res.status, data: await res.json() };
    }

    // 1. Discover providers
    const providers = await mobileReq('/api/mobile/auth/providers');
    assert.equal(providers.status, 200);
    assert.deepEqual(providers.data.providers, { email: true, google: true, naver: true, guest: true });

    // 2. Guest login
    const guest = await mobileReq('/api/mobile/auth/guest', { method: 'POST', body: {} });
    assert.equal(guest.status, 201);
    assert.equal(guest.data.profile.isGuest, true);
    assert.equal(guest.data.profile.authProvider, 'guest');
    assert.ok(guest.data.accessToken);

    // 3. Email register (upgrading from guest Bearer)
    const emailReg = await mobileReq('/api/mobile/auth/email/register', {
      method: 'POST',
      token: guest.data.accessToken,
      body: { email: 'mobile@example.com', password: 'Password123', displayName: '모바일이메일' }
    });
    assert.equal(emailReg.status, 201);
    assert.equal(emailReg.data.profile.isGuest, false);
    assert.equal(emailReg.data.profile.authProvider, 'email');
    assert.equal(emailReg.data.profile.displayName, '모바일이메일');

    // 4. Email login
    const emailLogin = await mobileReq('/api/mobile/auth/email/login', {
      method: 'POST',
      body: { email: 'mobile@example.com', password: 'Password123' }
    });
    assert.equal(emailLogin.status, 200);
    assert.equal(emailLogin.data.profile.principalId, emailReg.data.profile.principalId);
    assert.equal(emailLogin.data.profile.authProvider, 'email');

    // 5. Google login
    const googleLogin = await mobileReq('/api/mobile/auth/google', {
      method: 'POST',
      body: { idToken: 'google-id-token-ok' }
    });
    assert.equal(googleLogin.status, 200);
    assert.equal(googleLogin.data.profile.authProvider, 'google');
    assert.equal(googleLogin.data.profile.displayName, '구글모바일');

    // 6. Naver login
    const naverLogin = await mobileReq('/api/mobile/auth/naver', {
      method: 'POST',
      body: { accessToken: 'naver-sdk-token-ok' }
    });
    assert.equal(naverLogin.status, 200);
    assert.equal(naverLogin.data.profile.authProvider, 'naver');
    assert.equal(naverLogin.data.profile.displayName, '네이버모바일');

    // Invalid Naver token rejected
    const badNaver = await mobileReq('/api/mobile/auth/naver', {
      method: 'POST',
      body: { accessToken: 'bad-token' }
    });
    assert.equal(badNaver.status, 401);
  } finally {
    await f.close();
  }
});
