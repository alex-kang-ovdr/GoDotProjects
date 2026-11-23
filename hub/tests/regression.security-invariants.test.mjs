import test from 'node:test';
import assert from 'node:assert/strict';
import { createSign, generateKeyPairSync, scryptSync } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server/app.mjs';
import { openDatabase } from '../server/db.mjs';
import { createBilling } from '../server/billing/routes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

function createCatalogRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-sec-inv-'));
  fs.mkdirSync(path.join(dir, 'catalog'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'games/all-game/Web'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'games/teen-game/Web'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'games/adult-game/Web'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'data'), { recursive: true });

  fs.writeFileSync(
    path.join(dir, 'catalog/games.json'),
    JSON.stringify({
      schemaVersion: 1,
      entries: [
        { id: 'all-game', path: 'games/all-game', enabled: true },
        { id: 'teen-game', path: 'games/teen-game', enabled: true },
        { id: 'adult-game', path: 'games/adult-game', enabled: true },
      ],
    })
  );

  fs.writeFileSync(
    path.join(dir, 'games/all-game/game.manifest.json'),
    JSON.stringify({
      id: 'all-game',
      entry: 'index.html',
      title: { ko: '전체이용가 게임', en: 'All Ages Game' },
      summary: { ko: '안전한 테스트 게임', en: 'Safe test game' },
      tags: ['action'],
    })
  );
  fs.writeFileSync(
    path.join(dir, 'games/teen-game/game.manifest.json'),
    JSON.stringify({
      id: 'teen-game',
      entry: 'index.html',
      title: { ko: '12세 게임', en: 'Teen Game' },
      summary: { ko: '12+ 등급 게임', en: '12+ rated' },
      tags: ['12+', 'action'],
    })
  );
  fs.writeFileSync(
    path.join(dir, 'games/adult-game/game.manifest.json'),
    JSON.stringify({
      id: 'adult-game',
      entry: 'index.html',
      title: { ko: '성인 게임', en: 'Adult Game' },
      summary: { ko: '18+ 등급 게임', en: '18+ rated' },
      tags: ['18+', 'rpg'],
    })
  );

  return dir;
}

function makeCookieClient(baseUrl, origin) {
  const jar = new Map();
  let csrf = null;

  function cookieHeader() {
    return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  function storeCookies(res) {
    const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    for (const line of list) {
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
    cookieHeader,
    async call(pathname, { method = 'GET', body, headers = {}, redirect = 'manual', omitCsrf = false, csrfOverride = null } = {}) {
      const h = { ...headers };
      const cookie = cookieHeader();
      if (cookie) h.Cookie = cookie;
      if (method !== 'GET' && method !== 'HEAD') {
        if (!('Origin' in h) && !('origin' in h)) h.Origin = origin;
        if (!omitCsrf) {
          const token = csrfOverride !== null ? csrfOverride : csrf;
          if (token) h['X-CSRF-Token'] = token;
        }
        if (body !== undefined) h['Content-Type'] = 'application/json';
      }
      const res = await fetch(`${baseUrl}${pathname}`, {
        method,
        headers: h,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        redirect,
      });
      storeCookies(res);
      let data = null;
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        data = await res.json();
        if (data?.csrfToken) csrf = data.csrfToken;
      }
      return { status: res.status, headers: res.headers, data };
    },
  };
}

async function mobileCall(baseUrl, pathname, { method = 'GET', token = null, body, headers = {} } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const res = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: h,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  return { status: res.status, headers: res.headers, data };
}

function createSignedGoogleMock({ clientId, sub = 'google-sub-42', name = '구글유저', nowSecFn }) {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-kid-1', use: 'sig', alg: 'RS256' };
  let lastNonce = '';

  function signIdToken(nonce) {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'test-kid-1' })).toString('base64url');
    const iat = nowSecFn();
    const payload = Buffer.from(JSON.stringify({
      iss: 'https://accounts.google.com',
      aud: clientId,
      azp: clientId,
      sub,
      name,
      nonce,
      iat,
      exp: iat + 3600,
    })).toString('base64url');
    const signer = createSign('RSA-SHA256');
    signer.update(`${header}.${payload}`);
    const sig = signer.sign(privateKey).toString('base64url');
    return `${header}.${payload}.${sig}`;
  }

  return {
    setNonce(nonce) { lastNonce = nonce; },
    async handleFetch(url) {
      const href = String(url);
      if (href === 'https://www.googleapis.com/oauth2/v3/certs') {
        return new Response(JSON.stringify({ keys: [jwk] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (href === 'https://oauth2.googleapis.com/token') {
        return new Response(JSON.stringify({ id_token: signIdToken(lastNonce), access_token: 'g-access' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return null;
    },
  };
}

function makeProdBillingConfig(rootDir, billingOverride) {
  return {
    dataDir: path.join(rootDir, 'data'),
    publicHost: '127.0.0.1',
    publicPort: 0,
    adminHost: '127.0.0.1',
    adminPort: 0,
    userBaseUrl: 'https://prod.playhub.test',
    userOrigins: ['https://prod.playhub.test'],
    adminOrigins: ['http://127.0.0.1:8081'],
    secureCookies: true,
    billing: {
      enabled: true,
      ...billingOverride,
    },
  };
}

test('TC-3.1: Production Fail-Closed boot & request matrix (Billing guards, Avatar topup 403, Datastore secret 503)', async t => {
  const rootDir = createCatalogRoot();
  const billingDbDir = path.join(rootDir, 'data-billing-matrix');
  const billingDb = openDatabase(billingDbDir);
  let app = null;

  t.after(async () => {
    if (app) await app.close();
    try { billingDb.close(); } catch {}
    try { fs.rmSync(rootDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 120 }); } catch {}
  });

  // 1) Billing boot rejections under secureCookies: true
  const rejectedConfigs = [
    {
      label: 'allowMockProvider=true',
      billing: { allowMockProvider: true },
      pattern: /allowMockProvider cannot be enabled with secureCookies/,
    },
    {
      label: 'allowDemoAccount=true',
      billing: { allowDemoAccount: true },
      pattern: /allowDemoAccount cannot be enabled with secureCookies/,
    },
    {
      label: 'stripeConnect.allowMockDirect=true',
      billing: { stripeConnect: { allowMockDirect: true } },
      pattern: /allowMockDirect cannot be enabled with secureCookies/,
    },
    {
      label: 'toss test_sk_* key',
      billing: {
        toss: { clientKey: 'live_ck_abc', secretKey: 'test_sk_abc', webhookSecret: 'whsec_toss_live_1', sandbox: false },
      },
      pattern: /billing\.toss cannot use test keys/,
    },
    {
      label: 'toss test_ck_* key',
      billing: {
        toss: { clientKey: 'test_ck_abc', secretKey: 'live_sk_abc', webhookSecret: 'whsec_toss_live_2', sandbox: false },
      },
      pattern: /billing\.toss cannot use test keys/,
    },
    {
      label: 'stripeGpay pk_test_* key',
      billing: {
        stripeGpay: {
          publishableKey: 'pk_test_12345',
          secretKey: 'sk_live_12345',
          webhookSecret: 'whsec_gpay_live_1',
          googlePayEnvironment: 'PRODUCTION',
          sandbox: false,
        },
      },
      pattern: /billing\.stripeGpay cannot use test keys/,
    },
    {
      label: 'stripeConnect sk_test_* key',
      billing: {
        stripeConnect: { secretKey: 'sk_test_12345', webhookSecret: 'whsec_connect_live_1', allowMockDirect: false },
      },
      pattern: /billing\.stripeConnect cannot use test keys/,
    },
    {
      label: 'sandbox toss PG',
      billing: {
        toss: { clientKey: 'live_ck_abc', secretKey: 'live_sk_abc', webhookSecret: 'whsec_toss_live_3', sandbox: true },
      },
      pattern: /billing\.toss\.sandbox cannot be enabled/,
    },
    {
      label: 'sandbox xsolla PG',
      billing: {
        xsolla: { merchantId: '100', projectId: '200', apiKey: 'live_api_key', webhookSecret: 'whsec_xsolla_live', sandbox: true },
      },
      pattern: /billing\.xsolla\.sandbox cannot be enabled/,
    },
    {
      label: 'sandbox kakaopay PG',
      billing: {
        kakaopay: { secretKey: 'PRD_LIVE_KEY', cid: 'C_LIVE_001', webhookSecret: 'whsec_kakao_live', sandbox: true },
      },
      pattern: /billing\.kakaopay\.sandbox cannot be enabled/,
    },
    {
      label: 'sandbox stripeGpay TEST environment',
      billing: {
        stripeGpay: {
          publishableKey: 'pk_live_12345',
          secretKey: 'sk_live_12345',
          webhookSecret: 'whsec_gpay_live_2',
          googlePayEnvironment: 'TEST',
          sandbox: true,
        },
      },
      pattern: /billing\.stripe_gpay\.sandbox|googlePayEnvironment=PRODUCTION/,
    },
  ];

  for (const tc of rejectedConfigs) {
    assert.throws(
      () => createBilling({
        config: makeProdBillingConfig(rootDir, tc.billing),
        db: billingDb,
        env: {},
      }),
      tc.pattern,
      `Expected production boot rejection for ${tc.label}`
    );
  }

  // Also verify createApp() itself fails closed at boot when secureCookies: true + unsafe billing config
  assert.throws(
    () => createApp(
      {
        ...makeProdBillingConfig(rootDir, { allowMockProvider: true }),
        dataDir: path.join(rootDir, 'data-boot-fail'),
        avatar: { signingSecret: 'prod-avatar-signing-secret-32chars!' },
      },
      { rootDir, platformRoot: repoRoot, env: {} }
    ),
    /allowMockProvider cannot be enabled with secureCookies/
  );

  // Positive control: valid live production billing config boots cleanly with secureCookies: true
  const validProdApp = createApp(
    {
      ...makeProdBillingConfig(rootDir, {
        allowMockProvider: false,
        allowDemoAccount: false,
        toss: { clientKey: 'live_ck_prod', secretKey: 'live_sk_prod', webhookSecret: 'whsec_toss_prod_unique', sandbox: false },
        stripeConnect: { allowMockDirect: false },
      }),
      dataDir: path.join(rootDir, 'data-valid-prod'),
      avatar: { signingSecret: 'prod-avatar-signing-secret-32chars!' },
    },
    { rootDir, platformRoot: repoRoot, env: {} }
  );
  await validProdApp.close();

  // 2) Default Avatar topup 403 TOPUP_DISABLED & /internal/v1/datastore/* 503 fail-closed when secret unset
  app = createApp(
    {
      dataDir: path.join(rootDir, 'data-default'),
      publicHost: '127.0.0.1',
      publicPort: 0,
      adminHost: '127.0.0.1',
      adminPort: 0,
      userBaseUrl: 'http://localhost:8080',
      userOrigins: ['http://localhost:8080'],
      adminOrigins: ['http://127.0.0.1:8081'],
      secureCookies: false,
    },
    { rootDir, platformRoot: repoRoot, env: {} }
  );
  const ports = await app.listen();

  const pubClient = makeCookieClient(`http://localhost:${ports.public.port}`, 'http://localhost:8080');
  const sess = await pubClient.call('/api/session');
  assert.equal(sess.status, 200);

  const topupRes = await pubClient.call('/api/avatar/wallet/topup', {
    method: 'POST',
    body: { packId: 'pack_starter_500' },
  });
  assert.equal(topupRes.status, 403);
  assert.equal(topupRes.data?.error?.code, 'TOPUP_DISABLED');

  // /internal/v1/datastore/* without internal secret configured -> 503 fail-closed on admin listener
  const dsGet = await fetch(`http://127.0.0.1:${ports.admin.port}/internal/v1/datastore/games/all-game/scopes/global/keys`);
  assert.equal(dsGet.status, 503);
  assert.equal((await dsGet.json()).error?.code, 'INTERNAL_SECRET_NOT_CONFIGURED');

  const dsPut = await fetch(`http://127.0.0.1:${ports.admin.port}/internal/v1/datastore/games/all-game/scopes/global/keys/player1`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: { score: 1 } }),
  });
  assert.equal(dsPut.status, 503);
  assert.equal((await dsPut.json()).error?.code, 'INTERNAL_SECRET_NOT_CONFIGURED');

  // Public listener hides /internal/v1/datastore/* completely -> 404
  const dsPub = await fetch(`http://127.0.0.1:${ports.public.port}/internal/v1/datastore/games/all-game/scopes/global/keys`);
  assert.equal(dsPub.status, 404);
});

test('TC-3.2: 4 auth providers (Email, Google, Naver, Guest) cross-feature matrix + Guest->Registered avatar merge preservation', async t => {
  const rootDir = createCatalogRoot();
  const nowMs = Date.parse('2026-11-22T06:00:00Z');
  const forgeSecret = 'f'.repeat(40);
  const googleClientId = 'google-client-matrix';
  const googleMock = createSignedGoogleMock({
    clientId: googleClientId,
    sub: 'google-matrix-sub-001',
    name: '구글플레이어',
    nowSecFn: () => Math.floor(nowMs / 1000),
  });

  const combinedFetch = async (url, opts) => {
    const g = await googleMock.handleFetch(url, opts);
    if (g) return g;
    const href = String(url);
    if (href.startsWith('https://nid.naver.com/oauth2.0/token')) {
      return new Response(JSON.stringify({ access_token: 'naver-matrix-tok', token_type: 'bearer' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (href.startsWith('https://openapi.naver.com/v1/nid/me')) {
      return new Response(JSON.stringify({
        resultcode: '00',
        message: 'success',
        response: { id: 'naver-matrix-sub-001', nickname: '네이버플레이어' },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    throw new Error(`Unexpected external fetch: ${href}`);
  };

  const origin = 'http://localhost:8080';
  const app = createApp(
    {
      dataDir: path.join(rootDir, 'data'),
      publicHost: '127.0.0.1',
      publicPort: 0,
      adminHost: '127.0.0.1',
      adminPort: 0,
      userBaseUrl: origin,
      userOrigins: [origin],
      adminOrigins: ['http://127.0.0.1:8081'],
      secureCookies: false,
      google: {
        clientId: googleClientId,
        clientSecret: 'google-secret-matrix',
        redirectUri: 'http://localhost:8090/api/auth/google/callback',
      },
      naver: {
        clientId: 'naver-client-matrix',
        clientSecret: 'naver-secret-matrix',
        redirectUri: 'http://localhost:8090/api/auth/naver/callback',
      },
      forge: { internalSecret: forgeSecret },
      avatar: { allowMockTopup: true },
    },
    { rootDir, platformRoot: repoRoot, clock: () => nowMs, fetch: combinedFetch, env: {} }
  );
  t.after(async () => {
    await app.close();
    fs.rmSync(rootDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 120 });
  });

  const ports = await app.listen();
  const pubBase = `http://localhost:${ports.public.port}`;
  const adminBase = `http://127.0.0.1:${ports.admin.port}`;

  // 1) Authenticate all 4 account types through real Hub HTTP auth endpoints
  // a. Email
  const emailClient = makeCookieClient(pubBase, origin);
  await emailClient.call('/api/session');
  const emailReg = await emailClient.call('/api/auth/email/register', {
    method: 'POST',
    body: { email: 'matrix@example.com', password: 'Password123', displayName: '이메일플레이어' },
  });
  assert.equal(emailReg.status, 201);

  // b. Google OAuth
  const googleClient = makeCookieClient(pubBase, origin);
  await googleClient.call('/api/session');
  const gStart = await googleClient.call('/api/auth/google/start?returnTo=%2F');
  assert.equal(gStart.status, 302);
  const gAuthUrl = new URL(gStart.headers.get('location'));
  googleMock.setNonce(gAuthUrl.searchParams.get('nonce'));
  const gCb = await googleClient.call(`/api/auth/google/callback?code=g-code-1&state=${encodeURIComponent(gAuthUrl.searchParams.get('state'))}`);
  assert.equal(gCb.status, 302);
  assert.equal(new URL(gCb.headers.get('location')).searchParams.get('auth'), 'success');

  // c. Naver OAuth
  const naverClient = makeCookieClient(pubBase, origin);
  await naverClient.call('/api/session');
  const nStart = await naverClient.call('/api/auth/naver/start?returnTo=%2F');
  assert.equal(nStart.status, 302);
  const nState = new URL(nStart.headers.get('location')).searchParams.get('state');
  const nCb = await naverClient.call(`/api/auth/naver/callback?code=n-code-1&state=${encodeURIComponent(nState)}`);
  assert.equal(nCb.status, 302);
  assert.equal(new URL(nCb.headers.get('location')).searchParams.get('auth'), 'success');

  // d. Guest
  const guestClient = makeCookieClient(pubBase, origin);
  await guestClient.call('/api/session');
  const guestRes = await guestClient.call('/api/auth/guest', { method: 'POST', body: {} });
  assert.equal(guestRes.status, 200);

  const accounts = [
    { name: 'email', client: emailClient, expectedKind: 'registered', expectedProvider: 'email', expectedForgeStatus: 200, expectedIssuer: 'https://playhub.local/auth/email' },
    { name: 'google', client: googleClient, expectedKind: 'registered', expectedProvider: 'google', expectedForgeStatus: 200, expectedIssuer: 'https://accounts.google.com' },
    { name: 'naver', client: naverClient, expectedKind: 'registered', expectedProvider: 'naver', expectedForgeStatus: 200, expectedIssuer: 'https://playhub.local/auth/naver' },
    { name: 'guest', client: guestClient, expectedKind: 'guest', expectedProvider: 'guest', expectedForgeStatus: 200, expectedIssuer: 'https://playhub.local/auth/guest' },
  ];

  const forgeAccountKeys = new Set();

  for (const acc of accounts) {
    // /api/session
    const sess = await acc.client.call('/api/session');
    assert.equal(sess.status, 200, `[${acc.name}] /api/session`);
    assert.equal(sess.data.kind, acc.expectedKind, `[${acc.name}] session kind`);
    assert.equal(sess.data.authProvider, acc.expectedProvider, `[${acc.name}] session authProvider`);

    // /api/avatar/me
    const avatarMe = await acc.client.call('/api/avatar/me');
    assert.equal(avatarMe.status, 200, `[${acc.name}] /api/avatar/me`);
    assert.equal(avatarMe.data.ok, true);
    assert.ok(avatarMe.data.principal?.id, `[${acc.name}] avatar principal.id`);
    assert.equal(avatarMe.data.principal.kind, acc.expectedKind);
    assert.equal(avatarMe.data.loadout?.verified, true);

    // /api/social/profile
    const socialProf = await acc.client.call('/api/social/profile');
    assert.equal(socialProf.status, 200, `[${acc.name}] /api/social/profile`);
    assert.equal(socialProf.data.principalId, avatarMe.data.principal.id);
    assert.match(socialProf.data.handle, /#[0-9]{4}$/);

    // /internal/session/verify (Email, Google, Naver, and Guest MUST all be allowed into Forge with isolated accountKeys)
    const verifyRes = await fetch(`${adminBase}/internal/session/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-PlayHub-Internal-Secret': forgeSecret,
      },
      body: JSON.stringify({ cookie: acc.client.cookieHeader(), method: 'GET' }),
    });
    assert.equal(verifyRes.status, acc.expectedForgeStatus, `[${acc.name}] /internal/session/verify status`);
    const verifyBody = await verifyRes.json();
    if (acc.expectedForgeStatus === 200) {
      assert.equal(verifyBody.authenticated, true);
      assert.equal(verifyBody.userId, avatarMe.data.principal.id);
      assert.equal(verifyBody.identity?.iss, acc.expectedIssuer);
      assert.match(verifyBody.accountKey, /^[a-f0-9]{64}$/);
      forgeAccountKeys.add(verifyBody.accountKey);
    } else {
      assert.equal(verifyBody.authenticated, false);
      assert.equal(verifyBody.error, 'GOOGLE_LOGIN_REQUIRED');
    }

    // /api/saves/* (PUT then GET isolated per principal)
    const savePut = await acc.client.call('/api/saves/all-game', {
      method: 'PUT',
      headers: { 'If-None-Match': '*' },
      body: { schemaVersion: 1, payload: { owner: acc.name, stage: 3 } },
    });
    assert.equal(savePut.status, 201, `[${acc.name}] PUT /api/saves/all-game`);
    assert.equal(savePut.data.revision, 1);

    const saveGet = await acc.client.call('/api/saves/all-game');
    assert.equal(saveGet.status, 200, `[${acc.name}] GET /api/saves/all-game`);
    assert.deepEqual(saveGet.data.payload, { owner: acc.name, stage: 3 });
  }

  assert.equal(forgeAccountKeys.size, 4, 'Email, Google, Naver, and Guest must map to 4 distinct Forge accountKeys');

  // 2) Guest -> Registered merge (/api/auth/merge) preserves Avatar wallet & purchased inventory
  const mergeClient = makeCookieClient(pubBase, origin);
  await mergeClient.call('/api/session');
  await mergeClient.call('/api/auth/guest', { method: 'POST', body: {} });

  const catalog = await mergeClient.call('/api/avatar/catalog');
  assert.equal(catalog.status, 200);
  const pack = catalog.data.topupPacks[0];
  assert.ok(pack?.id, 'Expected at least one topupPack in avatar catalog');

  const guestMeInitial = await mergeClient.call('/api/avatar/me');
  const starterOwned = new Set(guestMeInitial.data.inventory.map(i => i.itemId));
  const purchasableItem = catalog.data.items.find(i => !starterOwned.has(i.id) && i.pricePlayCoin > 0);
  assert.ok(purchasableItem, 'Expected at least one purchasable non-starter avatar item');

  const topup = await mergeClient.call('/api/avatar/wallet/topup', {
    method: 'POST',
    headers: { 'Idempotency-Key': 'merge-topup-key-001' },
    body: { packId: pack.id },
  });
  assert.equal(topup.status, 200);

  const buy = await mergeClient.call('/api/avatar/purchase', {
    method: 'POST',
    headers: { 'Idempotency-Key': 'merge-buy-key-001' },
    body: { itemId: purchasableItem.id },
  });
  assert.equal(buy.status, 200);

  const preMergeMe = await mergeClient.call('/api/avatar/me');
  assert.ok(preMergeMe.data.wallet.total > 0);
  assert.ok(preMergeMe.data.inventory.some(i => i.itemId === purchasableItem.id));

  // Register email on the same guest session -> produces pendingMerge
  const upgraded = await mergeClient.call('/api/auth/email/register', {
    method: 'POST',
    body: { email: 'merged-avatar@example.com', password: 'Password123', displayName: '병합유저' },
  });
  assert.equal(upgraded.status, 201);
  assert.ok(upgraded.data.pendingMerge?.id, 'Expected pendingMerge after guest upgrades to registered account');

  const merged = await mergeClient.call('/api/auth/merge', {
    method: 'POST',
    body: { mergeId: upgraded.data.pendingMerge.id, consent: true, choices: [] },
  });
  assert.equal(merged.status, 200);
  assert.equal(merged.data.status, 'completed');

  const postMergeMe = await mergeClient.call('/api/avatar/me');
  assert.equal(postMergeMe.status, 200);
  assert.equal(postMergeMe.data.principal.kind, 'registered');
  assert.equal(postMergeMe.data.wallet.paid, preMergeMe.data.wallet.paid, 'Paid PlayCoin balance must survive guest merge');
  assert.equal(postMergeMe.data.wallet.bonus, preMergeMe.data.wallet.bonus, 'Bonus PlayCoin balance must survive guest merge');
  assert.equal(postMergeMe.data.wallet.promo, preMergeMe.data.wallet.promo, 'Promo PlayCoin balance must survive guest merge');
  assert.equal(postMergeMe.data.wallet.total, preMergeMe.data.wallet.total, 'Total PlayCoin balance must survive guest merge');
  assert.ok(
    postMergeMe.data.inventory.some(i => i.itemId === purchasableItem.id),
    'Purchased avatar item must remain in inventory after guest merge'
  );
  assert.ok(
    postMergeMe.data.ledger.some(e => e.kind === 'guest_merge_in'),
    'Avatar ledger must record guest_merge_in transfer'
  );
});

test('TC-3.3: Sanctions matrix (all / community / multiplayer / leaderboard) across all write APIs', async t => {
  const rootDir = createCatalogRoot();
  const nowMs = Date.parse('2026-11-22T06:00:00Z');
  const salt = 'b'.repeat(32);
  const adminPassword = 'AdminSecretPassword123!';
  const forgeSecret = 's'.repeat(40);
  const origin = 'http://localhost:8080';
  const adminOrigin = 'http://127.0.0.1:8081';

  const app = createApp(
    {
      dataDir: path.join(rootDir, 'data'),
      publicHost: '127.0.0.1',
      publicPort: 0,
      adminHost: '127.0.0.1',
      adminPort: 0,
      userBaseUrl: origin,
      userOrigins: [origin],
      adminOrigins: [adminOrigin],
      secureCookies: false,
      admin: {
        username: 'admin',
        salt,
        passwordHash: scryptSync(adminPassword, salt, 64).toString('hex'),
      },
      forge: { internalSecret: forgeSecret },
      mobile: { enabled: true, jwtSecret: 'sanction-matrix-mobile-secret-32chars!' },
    },
    { rootDir, platformRoot: repoRoot, clock: () => nowMs, env: {} }
  );
  t.after(async () => {
    await app.close();
    fs.rmSync(rootDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 120 });
  });

  const ports = await app.listen();
  const pubBase = `http://localhost:${ports.public.port}`;
  const adminBase = `http://127.0.0.1:${ports.admin.port}`;

  // Admin login
  const adminClient = makeCookieClient(adminBase, adminOrigin);
  await adminClient.call('/api/admin/session');
  const adminLogin = await adminClient.call('/api/admin/login', {
    method: 'POST',
    body: { username: 'admin', password: adminPassword },
  });
  assert.equal(adminLogin.status, 200);

  async function registerAdultUser(email, displayName) {
    const client = makeCookieClient(pubBase, origin);
    await client.call('/api/session');
    const reg = await client.call('/api/auth/email/register', {
      method: 'POST',
      body: { email, password: 'Password123', displayName },
    });
    assert.equal(reg.status, 201);
    const prof = await client.call('/api/social/profile');
    assert.equal(prof.status, 200);
    const principalId = prof.data.principalId;
    // Mark ADULT in user_age_compliance so social checks isolate sanction enforcement cleanly
    app.db.prepare(
      `INSERT OR REPLACE INTO user_age_compliance(principal_id,region_code,age_tier,parental_consent_status,parental_consent_at,kyc_verified_at,updated_at)
       VALUES(?,'KR','ADULT','not_required',NULL,NULL,?)`
    ).run(principalId, nowMs);
    return { client, principalId, handle: prof.data.handle };
  }

  async function createSanction(principalId, scope, action = 'ban') {
    const res = await adminClient.call('/api/admin/sanctions', {
      method: 'POST',
      body: { principalId, scope, action, reason: `test-${scope}` },
    });
    assert.equal(res.status, 201);
    return res.data.sanction;
  }

  const peer = await registerAdultUser('peer-target@example.com', '피어대상');
  const peerParty = await peer.client.call('/api/social/parties', {
    method: 'POST',
    body: { title: '피어 파티', targetGameId: 'all-game' },
  });
  assert.equal(peerParty.status, 201);
  const peerRoomCode = peerParty.data.party.roomCode;

  // --- 1. scope='all' blocks EVERY write API + Forge verify ---
  const userAll = await registerAdultUser('sanction-all@example.com', '전체제재유저');
  // Seed valid play session and save before sanctioning
  const prePlay = await userAll.client.call('/api/play-sessions', { method: 'POST', body: { gameId: 'all-game' } });
  assert.equal(prePlay.status, 201);
  const preSave = await userAll.client.call('/api/saves/all-game', {
    method: 'PUT',
    headers: { 'If-None-Match': '*' },
    body: { schemaVersion: 1, payload: { hp: 100 } },
  });
  assert.equal(preSave.status, 201);

  await createSanction(userAll.principalId, 'all', 'ban');

  const allChecks = [
    ['play-sessions', await userAll.client.call('/api/play-sessions', { method: 'POST', body: { gameId: 'all-game' } })],
    ['saves PUT', await userAll.client.call('/api/saves/all-game', { method: 'PUT', headers: { 'If-Match': '"r1"' }, body: { schemaVersion: 1, payload: { hp: 99 } } })],
    ['saves restore', await userAll.client.call('/api/saves/all-game/restore', { method: 'POST', headers: { 'Idempotency-Key': 'restore-all-sanction-1' }, body: { backupId: 'nonexistent', expectedMainRevision: 1 } })],
    ['avatar loadout', await userAll.client.call('/api/avatar/loadout', { method: 'PUT', body: { skinId: 'skin_adventurer' } })],
    ['avatar purchase', await userAll.client.call('/api/avatar/purchase', { method: 'POST', headers: { 'Idempotency-Key': 'buy-all-sanction-1' }, body: { itemId: 'any_item' } })],
    ['community post', await userAll.client.call('/api/games/all-game/community', { method: 'POST', body: { kind: 'comment', body: 'blocked' } })],
    ['social profile PUT', await userAll.client.call('/api/social/profile', { method: 'PUT', body: { displayName: '변경시도' } })],
    ['social friend request', await userAll.client.call('/api/social/friends/request', { method: 'POST', body: { targetPrincipalId: peer.principalId } })],
    ['social party create', await userAll.client.call('/api/social/parties', { method: 'POST', body: { title: 'blocked' } })],
    ['social presence', await userAll.client.call('/api/social/presence', { method: 'POST', body: { status: 'online' } })],
    ['leaderboard score', await userAll.client.call('/api/games/all-game/leaderboards/default/scores', { method: 'POST', headers: { 'Idempotency-Key': 'lb-all-sanction-1' }, body: { playSessionId: prePlay.data.id, score: 100 } })],
    ['social leaderboard score', await userAll.client.call('/api/social/leaderboards/all-game/high_score/scores', { method: 'POST', body: { score: 100 } })],
  ];
  for (const [label, res] of allChecks) {
    assert.equal(res.status, 403, `scope='all' must block ${label} with 403 (got ${res.status}: ${JSON.stringify(res.data)})`);
  }

  const forgeBlocked = await fetch(`${adminBase}/internal/session/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-PlayHub-Internal-Secret': forgeSecret },
    body: JSON.stringify({ cookie: userAll.client.cookieHeader(), method: 'GET' }),
  });
  assert.equal(forgeBlocked.status, 403);
  assert.equal((await forgeBlocked.json()).error, 'USER_SANCTIONED');

  // --- 2. scope='community' blocks community & social community writes while keeping play/Forge allowed ---
  const userComm = await registerAdultUser('sanction-comm@example.com', '커뮤니티제재');
  await createSanction(userComm.principalId, 'community', 'mute');

  assert.equal((await userComm.client.call('/api/games/all-game/community', { method: 'POST', body: { kind: 'comment', body: 'blocked' } })).status, 403);
  assert.equal((await userComm.client.call('/api/social/profile', { method: 'PUT', body: { displayName: '차단됨' } })).status, 403);
  assert.equal((await userComm.client.call('/api/social/users/search?q=피어')).status, 403);
  assert.equal((await userComm.client.call('/api/social/friends/request', { method: 'POST', body: { targetPrincipalId: peer.principalId } })).status, 403);
  assert.equal((await userComm.client.call('/api/social/messages', { method: 'POST', body: { channelType: 'dm', peerId: peer.principalId, body: 'hi' } })).status, 403);

  // Scope precision: community sanction does NOT block solo play sessions or Forge auth
  assert.equal((await userComm.client.call('/api/play-sessions', { method: 'POST', body: { gameId: 'all-game' } })).status, 201);
  const commForge = await fetch(`${adminBase}/internal/session/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-PlayHub-Internal-Secret': forgeSecret },
    body: JSON.stringify({ cookie: userComm.client.cookieHeader(), method: 'GET' }),
  });
  assert.equal(commForge.status, 200);

  // --- 3. scope='multiplayer' blocks party create/join/party-chat while keeping community allowed ---
  const userMp = await registerAdultUser('sanction-mp@example.com', '멀티제재');
  await createSanction(userMp.principalId, 'multiplayer', 'ban');

  assert.equal((await userMp.client.call('/api/social/parties', { method: 'POST', body: { title: 'blocked party' } })).status, 403);
  assert.equal((await userMp.client.call('/api/social/parties/join', { method: 'POST', body: { roomCode: peerRoomCode } })).status, 403);
  assert.equal((await userMp.client.call('/api/social/messages', { method: 'POST', body: { channelType: 'party', partyId: peerParty.data.party.id, body: 'blocked' } })).status, 403);
  assert.equal((await userMp.client.call('/api/games/all-game/community', { method: 'POST', body: { kind: 'comment', body: 'still allowed' } })).status, 201);

  // --- 4. scope='leaderboard' blocks both SSOT & social leaderboard writes, then restores after revoke ---
  const userLb = await registerAdultUser('sanction-lb@example.com', '리더보드제재');
  const lbPlay = await userLb.client.call('/api/play-sessions', { method: 'POST', body: { gameId: 'all-game' } });
  assert.equal(lbPlay.status, 201);

  const lbSanction = await createSanction(userLb.principalId, 'leaderboard', 'exclude');
  const ssotLbBlocked = await userLb.client.call('/api/games/all-game/leaderboards/default/scores', {
    method: 'POST',
    headers: { 'Idempotency-Key': 'lb-sanction-blocked-1' },
    body: { playSessionId: lbPlay.data.id, score: 500 },
  });
  assert.equal(ssotLbBlocked.status, 403);
  assert.equal(ssotLbBlocked.data?.error?.code, 'LEADERBOARD_SANCTIONED');

  const socialLbBlocked = await userLb.client.call('/api/social/leaderboards/all-game/high_score/scores', {
    method: 'POST',
    body: { score: 500 },
  });
  assert.equal(socialLbBlocked.status, 403);

  // Revoke sanction -> leaderboard submission succeeds
  const revoked = await adminClient.call(`/api/admin/sanctions/${lbSanction.id}/revoke`, {
    method: 'POST',
    body: { reason: 'appeal accepted' },
  });
  assert.equal(revoked.status, 200);

  const ssotLbAllowed = await userLb.client.call('/api/games/all-game/leaderboards/default/scores', {
    method: 'POST',
    headers: { 'Idempotency-Key': 'lb-sanction-restored-2' },
    body: { playSessionId: lbPlay.data.id, score: 500 },
  });
  assert.equal(ssotLbAllowed.status, 201);
});

test('TC-3.4: Age compliance matrix (UNKNOWN & CHILD_PROTECTED) blocks web social & mobile overrideRating 18+ bypass', async t => {
  const rootDir = createCatalogRoot();
  const nowMs = Date.parse('2026-11-22T06:00:00Z');
  const origin = 'http://localhost:8080';
  const consentCodes = [];

  const app = createApp(
    {
      dataDir: path.join(rootDir, 'data'),
      publicHost: '127.0.0.1',
      publicPort: 0,
      adminHost: '127.0.0.1',
      adminPort: 0,
      userBaseUrl: origin,
      userOrigins: [origin],
      adminOrigins: ['http://127.0.0.1:8081'],
      secureCookies: false,
      mobile: {
        enabled: true,
        jwtSecret: 'age-matrix-mobile-jwt-secret-32chars!',
        onParentalConsentCode: info => consentCodes.push(info),
      },
    },
    { rootDir, platformRoot: repoRoot, clock: () => nowMs, env: {} }
  );
  t.after(async () => {
    await app.close();
    fs.rmSync(rootDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 120 });
  });

  const ports = await app.listen();
  const pubBase = `http://localhost:${ports.public.port}`;

  // Seed an adult peer target for friend requests
  const adultPeer = makeCookieClient(pubBase, origin);
  await adultPeer.call('/api/session');
  await adultPeer.call('/api/auth/email/register', {
    method: 'POST',
    body: { email: 'adult-peer@example.com', password: 'Password123', displayName: '성인피어' },
  });
  const adultPeerId = (await adultPeer.call('/api/social/profile')).data.principalId;

  // --- 1. UNKNOWN age tier ---
  const unknownWeb = makeCookieClient(pubBase, origin);
  await unknownWeb.call('/api/session');
  const unknownReg = await unknownWeb.call('/api/auth/email/register', {
    method: 'POST',
    body: { email: 'unknown-age@example.com', password: 'Password123', displayName: '미확인유저' },
  });
  assert.equal(unknownReg.status, 201);

  const uFriendReq = await unknownWeb.call('/api/social/friends/request', {
    method: 'POST',
    body: { targetPrincipalId: adultPeerId },
  });
  assert.equal(uFriendReq.status, 403);
  assert.equal(uFriendReq.data?.error?.code, 'AGE_GATE_REQUIRED');

  const uMsg = await unknownWeb.call('/api/social/messages', {
    method: 'POST',
    body: { channelType: 'dm', peerId: adultPeerId, body: 'hello' },
  });
  assert.equal(uMsg.status, 403);
  assert.equal(uMsg.data?.error?.code, 'AGE_GATE_REQUIRED');

  const uParty = await unknownWeb.call('/api/social/parties', {
    method: 'POST',
    body: { title: '미확인 파티' },
  });
  assert.equal(uParty.status, 403);
  assert.equal(uParty.data?.error?.code, 'AGE_GATE_REQUIRED');

  // Same UNKNOWN account on Mobile attempting 18+ & 12+ bypass with overrideRating: "ALL"
  const unknownMobile = await mobileCall(pubBase, '/api/mobile/auth/email/login', {
    method: 'POST',
    body: { email: 'unknown-age@example.com', password: 'Password123' },
  });
  assert.equal(unknownMobile.status, 200);
  assert.equal(unknownMobile.data.profile.ageCompliance.ageTier, 'UNKNOWN');

  const uAdultBypass = await mobileCall(pubBase, '/api/mobile/play-sessions', {
    method: 'POST',
    token: unknownMobile.data.accessToken,
    body: { gameId: 'adult-game', overrideRating: 'ALL' },
  });
  assert.equal(uAdultBypass.status, 403);
  assert.equal(uAdultBypass.data?.error?.code, 'AGE_RATING_RESTRICTED');

  const uTeenBypass = await mobileCall(pubBase, '/api/mobile/play-sessions', {
    method: 'POST',
    token: unknownMobile.data.accessToken,
    body: { gameId: 'teen-game', overrideRating: 'ALL' },
  });
  assert.equal(uTeenBypass.status, 403);
  assert.equal(uTeenBypass.data?.error?.code, 'AGE_RATING_RESTRICTED');

  const uAllAllowed = await mobileCall(pubBase, '/api/mobile/play-sessions', {
    method: 'POST',
    token: unknownMobile.data.accessToken,
    body: { gameId: 'all-game' },
  });
  assert.equal(uAllAllowed.status, 201);

  // --- 2. CHILD_PROTECTED (pending parental consent) ---
  const childWeb = makeCookieClient(pubBase, origin);
  await childWeb.call('/api/session');
  await childWeb.call('/api/auth/email/register', {
    method: 'POST',
    body: { email: 'child-user@example.com', password: 'Password123', displayName: '어린이유저' },
  });
  const childMobile = await mobileCall(pubBase, '/api/mobile/auth/email/login', {
    method: 'POST',
    body: { email: 'child-user@example.com', password: 'Password123' },
  });
  assert.equal(childMobile.status, 200);

  const childAgeGate = await mobileCall(pubBase, '/api/mobile/age-gate', {
    method: 'POST',
    token: childMobile.data.accessToken,
    body: { birthYear: 2016, birthMonth: 5, regionCode: 'KR' },
  });
  assert.equal(childAgeGate.status, 200);
  assert.equal(childAgeGate.data.ageCompliance.ageTier, 'CHILD_PROTECTED');
  assert.equal(childAgeGate.data.ageCompliance.parentalConsentStatus, 'pending');

  // Web Social blocked with PARENTAL_CONSENT_REQUIRED while pending
  const cFriendReq = await childWeb.call('/api/social/friends/request', {
    method: 'POST',
    body: { targetPrincipalId: adultPeerId },
  });
  assert.equal(cFriendReq.status, 403);
  assert.equal(cFriendReq.data?.error?.code, 'PARENTAL_CONSENT_REQUIRED');

  const cQuickMsg = await childWeb.call('/api/social/messages', {
    method: 'POST',
    body: { channelType: 'dm', peerId: adultPeerId, quickMessageId: 'qm_hi' },
  });
  assert.equal(cQuickMsg.status, 403);
  assert.equal(cQuickMsg.data?.error?.code, 'PARENTAL_CONSENT_REQUIRED');

  const cParty = await childWeb.call('/api/social/parties', {
    method: 'POST',
    body: { title: '어린이 파티' },
  });
  assert.equal(cParty.status, 403);
  assert.equal(cParty.data?.error?.code, 'PARENTAL_CONSENT_REQUIRED');

  // Mobile 18+ bypass with overrideRating: "ALL" rejected
  const cAdultBypass = await mobileCall(pubBase, '/api/mobile/play-sessions', {
    method: 'POST',
    token: childMobile.data.accessToken,
    body: { gameId: 'adult-game', overrideRating: 'ALL' },
  });
  assert.equal(cAdultBypass.status, 403);
  assert.equal(cAdultBypass.data?.error?.code, 'AGE_RATING_RESTRICTED');

  // Self-upgrade attempt to adult without KYC rejected with AGE_TIER_LOCKED
  const cUpgradeAttempt = await mobileCall(pubBase, '/api/mobile/age-gate', {
    method: 'POST',
    token: childMobile.data.accessToken,
    body: { birthYear: 1990, birthMonth: 1, regionCode: 'KR' },
  });
  assert.equal(cUpgradeAttempt.status, 403);
  assert.equal(cUpgradeAttempt.data?.error?.code, 'AGE_TIER_LOCKED');

  // Even after parental consent verification, free chat & friend requests & 18+ overrideRating remain blocked!
  const consentReq = await mobileCall(pubBase, '/api/mobile/parental-consent', {
    method: 'POST',
    token: childMobile.data.accessToken,
    body: { guardianContact: 'parent@example.com', method: 'email' },
  });
  assert.equal(consentReq.status, 202);
  const delivered = consentCodes.at(-1);
  assert.ok(delivered?.verificationCode);

  const consentVerify = await mobileCall(pubBase, '/api/mobile/parental-consent', {
    method: 'POST',
    token: childMobile.data.accessToken,
    body: { action: 'verify', challengeId: delivered.challengeId, verificationCode: delivered.verificationCode },
  });
  assert.equal(consentVerify.status, 200);
  assert.equal(consentVerify.data.ageCompliance.parentalConsentStatus, 'verified');

  const cFriendStillBlocked = await childWeb.call('/api/social/friends/request', {
    method: 'POST',
    body: { targetPrincipalId: adultPeerId },
  });
  assert.equal(cFriendStillBlocked.status, 403);
  assert.equal(cFriendStillBlocked.data?.error?.code, 'CHILD_SOCIAL_RESTRICTED');

  const cFreeChatBlocked = await childWeb.call('/api/social/messages', {
    method: 'POST',
    body: { channelType: 'dm', peerId: adultPeerId, body: 'free chat attempt' },
  });
  assert.equal(cFreeChatBlocked.status, 403);
  assert.equal(cFreeChatBlocked.data?.error?.code, 'CHILD_FREE_CHAT_BLOCKED');

  const cAdultStillBlocked = await mobileCall(pubBase, '/api/mobile/play-sessions', {
    method: 'POST',
    token: childMobile.data.accessToken,
    body: { gameId: 'adult-game', overrideRating: 'ALL' },
  });
  assert.equal(cAdultStillBlocked.status, 403);
  assert.equal(cAdultStillBlocked.data?.error?.code, 'AGE_RATING_RESTRICTED');
});

test('TC-3.5: CSRF invariants on major write APIs + /api/admin/local-auto-login launcher token enforcement', async t => {
  const rootDir = createCatalogRoot();
  const origin = 'http://127.0.0.1:8080';
  const adminOrigin = 'http://127.0.0.1:8081';

  // Fixture A: password-protected admin + public write CSRF checks
  const salt = 'c'.repeat(32);
  const adminPassword = 'AdminCsrfPassword123!';
  const app = createApp(
    {
      dataDir: path.join(rootDir, 'data-csrf'),
      publicHost: '127.0.0.1',
      publicPort: 0,
      adminHost: '127.0.0.1',
      adminPort: 0,
      userBaseUrl: origin,
      userOrigins: [origin],
      adminOrigins: [adminOrigin],
      adminBaseUrl: adminOrigin,
      secureCookies: false,
      admin: {
        username: 'admin',
        salt,
        passwordHash: scryptSync(adminPassword, salt, 64).toString('hex'),
        localAutoLogin: false,
      },
    },
    { rootDir, platformRoot: repoRoot, env: {} }
  );
  t.after(async () => { await app.close(); });
  const ports = await app.listen();

  const client = makeCookieClient(`http://127.0.0.1:${ports.public.port}`, origin);
  await client.call('/api/session');

  // Public mutations missing X-CSRF-Token MUST all return 403 CSRF_INVALID
  const publicWriteTargets = [
    ['POST', '/api/auth/guest', {}],
    ['POST', '/api/auth/email/register', { email: 'nocsrf@example.com', password: 'Password123' }],
    ['POST', '/api/play-sessions', { gameId: 'all-game' }],
    ['PUT', '/api/saves/all-game', { schemaVersion: 1, payload: { a: 1 } }],
    ['POST', '/api/games/all-game/community', { kind: 'comment', body: 'hi' }],
    ['PUT', '/api/avatar/loadout', { skinId: 'skin_adventurer' }],
    ['POST', '/api/avatar/purchase', { itemId: 'any' }],
    ['PUT', '/api/social/profile', { displayName: 'NoCsrf' }],
    ['POST', '/api/social/parties', { title: 'NoCsrf' }],
    ['POST', '/api/auth/merge', { mergeId: 'm1', consent: true }],
  ];

  for (const [method, pathname, body] of publicWriteTargets) {
    const missing = await client.call(pathname, { method, body, omitCsrf: true });
    assert.equal(missing.status, 403, `Missing CSRF on ${method} ${pathname} must be 403`);
    assert.equal(missing.data?.error?.code, 'CSRF_INVALID', `Missing CSRF on ${method} ${pathname} code`);

    const forged = await client.call(pathname, { method, body, csrfOverride: 'forged-csrf-token-value' });
    assert.equal(forged.status, 403, `Wrong CSRF on ${method} ${pathname} must be 403`);
    assert.equal(forged.data?.error?.code, 'CSRF_INVALID', `Wrong CSRF on ${method} ${pathname} code`);
  }

  // Admin mutation missing CSRF -> 403 CSRF_INVALID; local-auto-login disabled -> 404
  const adminClient = makeCookieClient(`http://127.0.0.1:${ports.admin.port}`, adminOrigin);
  await adminClient.call('/api/admin/session');
  assert.equal(
    (await adminClient.call('/api/admin/login', {
      method: 'POST',
      body: { username: 'admin', password: adminPassword },
    })).status,
    200
  );

  const adminNoCsrf = await adminClient.call('/api/admin/sanctions', {
    method: 'POST',
    body: { principalId: 'p1', scope: 'all', action: 'ban', reason: 'test' },
    omitCsrf: true,
  });
  assert.equal(adminNoCsrf.status, 403);
  assert.equal(adminNoCsrf.data?.error?.code, 'CSRF_INVALID');

  const disabledLocalAuto = await adminClient.call('/api/admin/local-auto-login', {
    method: 'POST',
    body: { token: 'A'.repeat(43) },
  });
  assert.equal(disabledLocalAuto.status, 404);

  // Fixture B: localAutoLogin enabled (portable launcher mode) -> missing/invalid token MUST be 401
  const localApp = createApp(
    {
      dataDir: path.join(rootDir, 'data-local-admin'),
      publicHost: '127.0.0.1',
      publicPort: 0,
      adminHost: '127.0.0.1',
      adminPort: 0,
      adminUiPort: 8081,
      userBaseUrl: origin,
      userOrigins: [origin],
      adminOrigins: [adminOrigin],
      adminBaseUrl: adminOrigin,
      secureCookies: false,
      admin: { localAutoLogin: true },
    },
    { rootDir, platformRoot: repoRoot, env: {} }
  );
  t.after(async () => {
    await localApp.close();
    fs.rmSync(rootDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 120 });
  });
  const localPorts = await localApp.listen();

  const rawAdminReq = (pathname, { method = 'GET', body, headers = {} } = {}) =>
    new Promise((resolve, reject) => {
      const payload = body === undefined ? undefined : JSON.stringify(body);
      const req = http.request(
        {
          host: '127.0.0.1',
          port: localPorts.admin.port,
          path: pathname,
          method,
          headers: {
            Origin: adminOrigin,
            ...(payload !== undefined ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
            ...headers,
          },
        },
        res => {
          let text = '';
          res.setEncoding('utf8');
          res.on('data', chunk => { text += chunk; });
          res.on('end', () => {
            resolve({
              status: res.statusCode,
              data: text ? JSON.parse(text) : null,
              cookie: res.headers['set-cookie']?.at(-1)?.split(';')[0] || '',
            });
          });
        }
      );
      req.on('error', reject);
      req.end(payload);
    });

  const adminSess = await rawAdminReq('/api/admin/session');
  assert.equal(adminSess.status, 200);
  assert.equal(adminSess.data.authenticated, false);
  const authHeaders = { Cookie: adminSess.cookie, 'X-CSRF-Token': adminSess.data.csrfToken };

  // 1) Missing token before issuing -> 401 LOCAL_ADMIN_TOKEN_INVALID
  const missingTokenBefore = await rawAdminReq('/api/admin/local-auto-login', {
    method: 'POST',
    headers: authHeaders,
    body: {},
  });
  assert.equal(missingTokenBefore.status, 401);
  assert.equal(missingTokenBefore.data?.error?.code, 'LOCAL_ADMIN_TOKEN_INVALID');

  // 2) Issue real launcher token, then verify missing/empty/wrong tokens still fail with 401
  const issuedUrl = localApp.issueLocalAdminLoginUrl();
  assert.ok(issuedUrl);
  const validToken = /^#playhub-local-admin=([A-Za-z0-9_-]{43})$/.exec(new URL(issuedUrl).hash)?.[1];
  assert.ok(validToken);

  const missingTokenAfter = await rawAdminReq('/api/admin/local-auto-login', {
    method: 'POST',
    headers: authHeaders,
    body: {},
  });
  assert.equal(missingTokenAfter.status, 401);
  assert.equal(missingTokenAfter.data?.error?.code, 'LOCAL_ADMIN_TOKEN_INVALID');

  const emptyToken = await rawAdminReq('/api/admin/local-auto-login', {
    method: 'POST',
    headers: authHeaders,
    body: { token: '' },
  });
  assert.equal(emptyToken.status, 401);
  assert.equal(emptyToken.data?.error?.code, 'LOCAL_ADMIN_TOKEN_INVALID');

  const wrongToken = await rawAdminReq('/api/admin/local-auto-login', {
    method: 'POST',
    headers: authHeaders,
    body: { token: 'Z'.repeat(43) },
  });
  assert.equal(wrongToken.status, 401);
  assert.equal(wrongToken.data?.error?.code, 'LOCAL_ADMIN_TOKEN_INVALID');

  // Proxied request header rejected with 403 LOCAL_ADMIN_DIRECT_REQUEST_REQUIRED
  const proxiedReq = await rawAdminReq('/api/admin/local-auto-login', {
    method: 'POST',
    headers: { ...authHeaders, 'X-Forwarded-For': '203.0.113.10' },
    body: { token: validToken },
  });
  assert.equal(proxiedReq.status, 403);
  assert.equal(proxiedReq.data?.error?.code, 'LOCAL_ADMIN_DIRECT_REQUEST_REQUIRED');

  // Missing CSRF rejected with 403 CSRF_INVALID
  const missingCsrfLocal = await rawAdminReq('/api/admin/local-auto-login', {
    method: 'POST',
    headers: { Cookie: adminSess.cookie },
    body: { token: validToken },
  });
  assert.equal(missingCsrfLocal.status, 403);
  assert.equal(missingCsrfLocal.data?.error?.code, 'CSRF_INVALID');

  // Valid token succeeds once (200), then replay fails (401)
  const redeemed = await rawAdminReq('/api/admin/local-auto-login', {
    method: 'POST',
    headers: authHeaders,
    body: { token: validToken },
  });
  assert.equal(redeemed.status, 200);
  assert.equal(redeemed.data.authenticated, true);

  const replay = await rawAdminReq('/api/admin/local-auto-login', {
    method: 'POST',
    headers: { Cookie: redeemed.cookie, 'X-CSRF-Token': redeemed.data.csrfToken },
    body: { token: validToken },
  });
  assert.equal(replay.status, 401);
  assert.equal(replay.data?.error?.code, 'LOCAL_ADMIN_TOKEN_INVALID');
});
