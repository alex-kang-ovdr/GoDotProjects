import assert from 'node:assert/strict';
import { scryptSync } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { createApp } from '../server/app.mjs';
import { createLocalAdminLogin } from '../server/local-admin-login.mjs';

const USER_ORIGIN = 'http://127.0.0.1:8080';
const ADMIN_ORIGIN = 'http://127.0.0.1:8081';
const OTHER_ADMIN_ORIGIN = 'http://localhost:8081';
const LOCAL_LOGIN = '/api/admin/local-login';
const SESSION = '/api/admin/session';
const PASSWORD = 'local-admin-fixture-password';

async function fixture(t, setting, admin = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), 'playhub-admin-local-login-'));
  let stamp = Date.now();
  const app = createApp({
    publicHost: '127.0.0.1', publicPort: 0, adminHost: '127.0.0.1', adminPort: 0, adminUiPort: 8081,
    userOrigins: [USER_ORIGIN], userBaseUrl: USER_ORIGIN, adminOrigins: [ADMIN_ORIGIN, OTHER_ADMIN_ORIGIN],
    adminBaseUrl: ADMIN_ORIGIN, dataDir, admin: { ...admin, ...(setting === undefined ? {} : { localAutoLogin: setting }) }
  }, { env: {}, clock: () => stamp });
  t.after(async () => { await app.close(); rmSync(dataDir, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 }); });
  assert.equal(app.issueLocalAdminLoginUrl(), null);
  const ports = await app.listen();
  const request = (route, options = {}) => new Promise((resolve, reject) => {
    const { method = 'GET', body, headers = {}, listener = 'admin' } = options;
    const raw = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request({ host: '127.0.0.1', port: ports[listener].port, path: route, method, headers: {
      origin: listener === 'admin' ? ADMIN_ORIGIN : USER_ORIGIN,
      ...(raw === undefined ? {} : { 'content-type': 'application/json', 'content-length': Buffer.byteLength(raw) }),
      ...headers
    } }, res => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { text += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(text), cookie: res.headers['set-cookie']?.at(-1)?.split(';')[0] });
        } catch (error) { reject(error); }
      });
    });
    req.on('error', reject);
    req.end(raw);
  });
  function issue() {
    const issued = app.issueLocalAdminLoginUrl();
    assert.ok(issued, 'enabled launcher issues a local login URL');
    const url = new URL(issued);
    assert.equal(url.origin, ADMIN_ORIGIN);
    assert.equal(url.search, '');
    const token = /^#playhub-local-admin=([A-Za-z0-9_-]{43})$/.exec(url.hash)?.[1];
    assert.ok(token, 'token is confined to the fragment');
    return token;
  }
  function redeem(token, session, overrides = {}) {
    return request(overrides.route || LOCAL_LOGIN, { method: 'POST', body: { token }, listener: overrides.listener,
      headers: { cookie: session.cookie, 'x-csrf-token': session.data.csrfToken, ...overrides.headers } });
  }
  return { app, request, issue, redeem, advance: ms => { stamp += ms; } };
}

test('the unset and explicit OFF profiles never issue an automatic link', async t => {
  assert.equal(createLocalAdminLogin({ admin: {} }, Date.now), null);
  const salt = 'a'.repeat(32);
  const { app, request, redeem } = await fixture(t, false, { username: 'operator', salt, passwordHash: scryptSync(PASSWORD, salt, 64).toString('hex') });
  const session = await request(SESSION);
  assert.equal(session.data.authenticated, false);
  assert.equal(app.issueLocalAdminLoginUrl(), null);
  assert.equal((await redeem('A'.repeat(43), session)).status, 404);
  assert.equal((await request('/api/admin/audit', { headers: { cookie: session.cookie } })).status, 401);
  const manual = await request('/api/admin/login', { method: 'POST', body: { username: 'operator', password: PASSWORD },
    headers: { cookie: session.cookie, 'x-csrf-token': session.data.csrfToken } });
  assert.equal(manual.status, 200);
  assert.equal(manual.data.authenticated, true);
  assert.equal(manual.data.username, 'operator');
});

test('one local handoff rotates the administrator cookie and cannot be replayed', async t => {
  const { app, request, issue, redeem } = await fixture(t, true);
  const sessions = await Promise.all([request(SESSION), request(SESSION)]);
  assert.equal(sessions[0].data.authenticated, false);
  assert.equal((await redeem(undefined, sessions[0])).status, 401);
  const replaced = issue();
  const token = issue();
  assert.equal((await redeem(replaced, sessions[0])).data.error.code, 'LOCAL_ADMIN_TOKEN_INVALID');

  const results = await Promise.all(sessions.map(session => redeem(token, session)));
  assert.deepEqual(results.map(result => result.status).sort(), [200, 401]);
  const winner = results.findIndex(result => result.status === 200);
  const accepted = results[winner], session = sessions[winner];
  assert.equal(results[1 - winner].data.error.code, 'LOCAL_ADMIN_TOKEN_INVALID');
  assert.equal(accepted.data.authenticated, true);
  assert.equal(accepted.data.username, 'admin');
  assert.ok(accepted.cookie !== session.cookie, 'the cookie must rotate');
  assert.ok(accepted.data.csrfToken !== session.data.csrfToken, 'the CSRF token must rotate');
  assert.equal((await request('/api/admin/audit', { headers: { cookie: session.cookie } })).status, 401);
  assert.equal((await redeem(token, accepted)).data.error.code, 'LOCAL_ADMIN_TOKEN_INVALID');
  const audit = await request('/api/admin/audit', { headers: { cookie: accepted.cookie } });
  assert.equal(audit.status, 200);
  assert.deepEqual(audit.data.audit.map(row => [row.action, row.target, row.detail]), [['admin_local_login', 'admin', {}]]);
  await app.close();
  assert.equal(app.issueLocalAdminLoginUrl(), null);
});

test('a failed administrator audit does not send an invalid replacement cookie', async t => {
  const { app, issue, redeem, request } = await fixture(t, true);
  const session = await request(SESSION);
  app.db.exec(`CREATE TRIGGER fail_local_login_audit BEFORE INSERT ON audit WHEN NEW.action='admin_local_login'
    BEGIN SELECT RAISE(ABORT, 'test local login audit failure'); END`);
  const failure = await redeem(issue(), session);
  assert.equal(failure.status, 500);
  assert.equal(failure.cookie, undefined);
  const current = await request(SESSION, { headers: { cookie: session.cookie } });
  assert.equal(current.data.authenticated, false);
  assert.ok(current.data.csrfToken === session.data.csrfToken, 'the original session survives transaction rollback');
});

test('HTTP redemption rejects wrong origin, host, CSRF, proxy headers, public listener and expired links', async t => {
  const { request, issue, redeem, advance } = await fixture(t, true, { username: 'operator' });
  const session = await request(SESSION);
  const token = issue();
  assert.equal((await request(LOCAL_LOGIN, { method: 'POST', body: { token } })).status, 401);
  assert.equal((await redeem(token, session, { listener: 'public' })).status, 404);
  assert.equal((await redeem(token, session, { route: LOCAL_LOGIN + '?mode=anything' })).status, 404);
  assert.equal((await redeem(token, session, { headers: { origin: OTHER_ADMIN_ORIGIN } })).status, 403);
  assert.equal((await redeem(token, session, { headers: { origin: 'https://remote.invalid' } })).status, 403);
  assert.equal((await redeem(token, session, { headers: { host: 'different.invalid' } })).status, 403);
  assert.equal((await redeem(token, session, { headers: { forwarded: 'for=127.0.0.1' } })).status, 403);
  assert.equal((await redeem(token, session, { headers: { 'x-forwarded-for': '127.0.0.1' } })).status, 403);
  assert.equal((await redeem(token, session, { headers: { 'x-csrf-token': 'wrong' } })).data.error.code, 'CSRF_INVALID');
  assert.equal((await redeem(token, session)).data.username, 'operator');

  const anonymous = await request(SESSION);
  const expired = issue();
  advance(60_000);
  assert.equal((await redeem(expired, anonymous)).data.error.code, 'LOCAL_ADMIN_TOKEN_INVALID');
});

test('enabled profiles require direct loopback URLs and peers', () => {
  const config = { admin: { localAutoLogin: true }, adminUiPort: 8081, adminBaseUrl: ADMIN_ORIGIN, adminOrigins: [ADMIN_ORIGIN] };
  for (const adminBaseUrl of [undefined, 'http://example.invalid:8081', `${ADMIN_ORIGIN}/admin`, `${ADMIN_ORIGIN}/?a=b`, 'http://127.0.0.1:9998']) {
    assert.throws(() => createLocalAdminLogin({ ...config, adminBaseUrl }, Date.now), /adminBaseUrl/);
  }
  assert.throws(() => createLocalAdminLogin({ ...config, adminOrigins: [ADMIN_ORIGIN, 'http://example.invalid:8081'] }, Date.now), /loopback/);
  assert.throws(() => createLocalAdminLogin({ ...config, admin: { localAutoLogin: 'true' } }, Date.now), /boolean/);
  const login = createLocalAdminLogin(config, Date.now);
  for (const socket of [{ remoteAddress: '203.0.113.9', localAddress: '127.0.0.1' }, { remoteAddress: '127.0.0.1', localAddress: '192.0.2.1' }]) {
    assert.throws(() => login.requireDirectRequest({ socket, headers: { host: '127.0.0.1:8091', origin: ADMIN_ORIGIN } }, 8091),
      { code: 'LOCAL_ADMIN_DIRECT_REQUEST_REQUIRED' });
  }
});

test('administrator bootstrap clears its fragment immediately and preserves navigation anchors', () => {
  const script = readFileSync(new URL('../web/admin/local-login-bootstrap.js', import.meta.url), 'utf8');
  function boot(hash) {
    const window = {}, calls = [];
    vm.runInNewContext(script, { window, location: { hash, pathname: '/', search: '?lang=ko' },
      history: { state: null, replaceState: (...args) => calls.push(args) } });
    return { window, calls };
  }
  const token = 'T'.repeat(43);
  const valid = boot('#playhub-local-admin=' + token);
  assert.deepEqual(valid.calls, [[null, '', '/?lang=ko']]);
  const take = valid.window.takePlayHubLocalAdminToken;
  assert.equal(take(), token);
  assert.equal(take(), undefined);
  assert.equal(valid.window.takePlayHubLocalAdminToken, undefined);
  assert.equal(boot('#playhub-local-admin=bad').calls.length, 1);
  assert.deepEqual(boot('#submissions').calls, []);
});

test('local-auto-login requires a one-time launcher token and never bypasses a configured passwordHash', async t => {
  const off = await fixture(t, false);
  const offSession = await off.request(SESSION);
  assert.equal(offSession.data.localAutoLogin, false);
  assert.equal((await off.request('/api/admin/local-auto-login', {
    method: 'POST', body: {}, headers: { cookie: offSession.cookie, 'x-csrf-token': offSession.data.csrfToken }
  })).status, 404);

  // When passwordHash is configured, localAutoLogin: true must NOT bypass password login.
  const salt = 'b'.repeat(32);
  const passwordHash = scryptSync(PASSWORD, salt, 64).toString('hex');
  assert.equal(createLocalAdminLogin({
    admin: { username: 'operator', salt, passwordHash, localAutoLogin: true },
    adminUiPort: 8081, adminBaseUrl: ADMIN_ORIGIN, adminOrigins: [ADMIN_ORIGIN]
  }, Date.now), null);
  const withPassword = await fixture(t, true, { username: 'operator', salt, passwordHash });
  const pwSession = await withPassword.request(SESSION);
  assert.equal(pwSession.data.localAutoLogin, false);
  assert.equal(withPassword.app.issueLocalAdminLoginUrl(), null);
  assert.equal((await withPassword.request('/api/admin/local-auto-login', {
    method: 'POST', body: { token: 'A'.repeat(43) }, headers: { cookie: pwSession.cookie, 'x-csrf-token': pwSession.data.csrfToken }
  })).status, 404);
  assert.equal((await withPassword.request('/api/admin/local-login', {
    method: 'POST', body: { token: 'A'.repeat(43) }, headers: { cookie: pwSession.cookie, 'x-csrf-token': pwSession.data.csrfToken }
  })).status, 404);
  const manual = await withPassword.request('/api/admin/login', {
    method: 'POST', body: { username: 'operator', password: PASSWORD },
    headers: { cookie: pwSession.cookie, 'x-csrf-token': pwSession.data.csrfToken }
  });
  assert.equal(manual.status, 200);
  assert.equal(manual.data.authenticated, true);

  // Without passwordHash and with localAutoLogin: true, /api/admin/local-auto-login still requires a valid one-time token.
  const on = await fixture(t, true);
  const s = await on.request(SESSION);
  assert.equal(s.data.localAutoLogin, true);
  assert.equal(s.data.authenticated, false);
  assert.equal((await on.request('/api/admin/local-auto-login', {
    method: 'POST', body: {}, listener: 'public', headers: { cookie: s.cookie, 'x-csrf-token': s.data.csrfToken }
  })).status, 404);
  assert.equal((await on.request('/api/admin/local-auto-login', {
    method: 'POST', body: {}, headers: { cookie: s.cookie, 'x-csrf-token': s.data.csrfToken, origin: 'https://remote.invalid' }
  })).status, 403);
  assert.equal((await on.request('/api/admin/local-auto-login', {
    method: 'POST', body: {}, headers: { cookie: s.cookie, 'x-csrf-token': s.data.csrfToken, 'x-forwarded-for': '127.0.0.1' }
  })).status, 403);
  assert.equal((await on.request('/api/admin/local-auto-login', {
    method: 'POST', body: {}, headers: { cookie: s.cookie, 'x-csrf-token': 'wrong' }
  })).status, 403);
  // Missing token must fail with 401 LOCAL_ADMIN_TOKEN_INVALID.
  const noToken = await on.request('/api/admin/local-auto-login', {
    method: 'POST', body: {}, headers: { cookie: s.cookie, 'x-csrf-token': s.data.csrfToken }
  });
  assert.equal(noToken.status, 401);
  assert.equal(noToken.data.error.code, 'LOCAL_ADMIN_TOKEN_INVALID');

  // Valid one-time launcher token succeeds and cannot be replayed.
  const token = on.issue();
  const ok = await on.request('/api/admin/local-auto-login', {
    method: 'POST', body: { token }, headers: { cookie: s.cookie, 'x-csrf-token': s.data.csrfToken }
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.authenticated, true);
  assert.equal(ok.data.username, 'admin');
  assert.equal(ok.data.localAutoLogin, true);
  assert.ok(ok.cookie !== s.cookie);
  assert.ok(ok.data.csrfToken !== s.data.csrfToken);
  const replay = await on.request('/api/admin/local-auto-login', {
    method: 'POST', body: { token }, headers: { cookie: ok.cookie, 'x-csrf-token': ok.data.csrfToken }
  });
  assert.equal(replay.status, 401);
  assert.equal(replay.data.error.code, 'LOCAL_ADMIN_TOKEN_INVALID');
  const audit = await on.request('/api/admin/audit', { headers: { cookie: ok.cookie } });
  assert.equal(audit.status, 200);
  assert.deepEqual(audit.data.audit.map(row => row.action), ['admin_local_auto_login']);
});
