import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createSign, generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.mjs';
import { clearAppleJwksCache, revokeAppleToken, verifyAppleIdentityToken } from '../server/mobile/apple-auth.mjs';

function setupFixtureRoot() {
  const dir = mkdtempSync(join(tmpdir(), 'playhub-mobile-m1-'));
  mkdirSync(join(dir, 'catalog'), { recursive: true });
  mkdirSync(join(dir, 'games/all-game/Web'), { recursive: true });
  mkdirSync(join(dir, 'games/teen-game/Web'), { recursive: true });
  mkdirSync(join(dir, 'games/adult-game/Web'), { recursive: true });
  mkdirSync(join(dir, 'data'), { recursive: true });

  writeFileSync(
    join(dir, 'catalog/games.json'),
    JSON.stringify({
      schemaVersion: 1,
      entries: [
        { id: 'all-game', path: 'games/all-game', enabled: true },
        { id: 'teen-game', path: 'games/teen-game', enabled: true },
        { id: 'adult-game', path: 'games/adult-game', enabled: true }
      ]
    })
  );

  // all-game has a .pck so it maps to godot-pck runtime
  writeFileSync(join(dir, 'games/all-game/game.manifest.json'), JSON.stringify({
    id: 'all-game', entry: 'index.html', title: 'All Ages Godot Game', summary: 'Safe game', tags: ['action']
  }));
  writeFileSync(join(dir, 'games/all-game/Web/index.pck'), Buffer.from('GDPC\x02\x00\x00\x00\x04\x00\x00\x00\x07\x00\x00\x00\x02\x00\x00\x00'));

  writeFileSync(join(dir, 'games/teen-game/game.manifest.json'), JSON.stringify({
    id: 'teen-game', entry: 'index.html', title: 'Teen Game 12+', summary: '12+ rated', tags: ['12+', 'action']
  }));
  writeFileSync(join(dir, 'games/adult-game/game.manifest.json'), JSON.stringify({
    id: 'adult-game', entry: 'index.html', title: 'Adult Game 18+', summary: '18+ rated', tags: ['18+', 'rpg'],
    android: { runtime: 'godot-pck', engineVersion: '4.8.0', minAppVersionCode: 5, bundle: { url: '/games/adult-game/index.pck', bytes: 1024 } }
  }));

  return dir;
}

async function reqJson(baseUrl, path, { method = 'GET', token, headers = {}, body } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: h,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await res.json();
  return { status: res.status, headers: res.headers, data };
}

test('Mobile M1: Guest auth, Rotating Refresh Token reuse detection, Age Gate, Catalog & Cloud Saves', async () => {
  const rootDir = setupFixtureRoot();
  let clockMs = Date.parse('2026-11-21T00:00:00Z');
  const deliveredConsentCodes = [];
  const app = createApp(
    {
      dataDir: join(rootDir, 'data'),
      publicHost: '127.0.0.1',
      publicPort: 0,
      adminHost: '127.0.0.1',
      adminPort: 0,
      userBaseUrl: 'http://127.0.0.1:18130',
      userOrigins: ['http://127.0.0.1:18130'],
      adminOrigins: ['http://127.0.0.1:18131'],
      mobile: {
        enabled: true,
        jwtSecret: 'test-mobile-secret-32-chars-minimum!!',
        onParentalConsentCode: (info) => deliveredConsentCodes.push(info)
      }
    },
    {
      rootDir,
      clock: () => clockMs,
      verifyMobileGoogleToken: async (idToken) => {
        if (idToken === 'valid-google-token') return { sub: 'google-sub-1001', name: 'Alex Mobile' };
        return null;
      }
    }
  );

  const addr = await app.listen();
  const baseUrl = `http://127.0.0.1:${addr.public.port}`;

  try {
    // 1. Browser Origin header must be rejected on mobile endpoints
    const badOrigin = await reqJson(baseUrl, '/api/mobile/auth/guest', {
      method: 'POST',
      headers: { Origin: 'http://evil.example.com' }
    });
    assert.equal(badOrigin.status, 403);
    assert.equal(badOrigin.data.error.code, 'MOBILE_ORIGIN_FORBIDDEN');

    // 2. Guest immediate sign-in works without Google
    const guest = await reqJson(baseUrl, '/api/mobile/auth/guest', { method: 'POST' });
    assert.equal(guest.status, 201);
    assert.equal(guest.data.profile.isGuest, true);
    assert.equal(guest.data.profile.ageCompliance.ageTier, 'UNKNOWN');
    const guestToken1 = guest.data.accessToken;
    const refresh1 = guest.data.refreshToken;

    // 3. Rotating Refresh Token works once, and replaying refresh1 revokes the entire family
    //    AND immediately invalidates existing Access JWTs for that family!
    const refreshed = await reqJson(baseUrl, '/api/mobile/auth/refresh', {
      method: 'POST',
      body: { refreshToken: refresh1 }
    });
    assert.equal(refreshed.status, 200);
    const refresh2 = refreshed.data.refreshToken;
    const refreshedAccess = refreshed.data.accessToken;
    assert.notEqual(refresh2, refresh1);

    const replay = await reqJson(baseUrl, '/api/mobile/auth/refresh', {
      method: 'POST',
      body: { refreshToken: refresh1 }
    });
    assert.equal(replay.status, 401);
    assert.equal(replay.data.error.code, 'TOKEN_REUSE_DETECTED');

    // refresh2 from the compromised family is now also revoked!
    const afterCompromise = await reqJson(baseUrl, '/api/mobile/auth/refresh', {
      method: 'POST',
      body: { refreshToken: refresh2 }
    });
    assert.equal(afterCompromise.status, 401);

    // Access JWTs from the compromised family are IMMEDIATELY invalidated (no 15-min window!)
    const meRevoked1 = await reqJson(baseUrl, '/api/mobile/me', { token: guestToken1 });
    assert.equal(meRevoked1.status, 401);
    assert.equal(meRevoked1.data.error.code, 'MOBILE_SESSION_REVOKED');
    const meRevoked2 = await reqJson(baseUrl, '/api/mobile/me', { token: refreshedAccess });
    assert.equal(meRevoked2.status, 401);
    assert.equal(meRevoked2.data.error.code, 'MOBILE_SESSION_REVOKED');

    // Start a clean guest session for Age Gate, Catalog, Parental Consent & Cloud Saves
    const guest2 = await reqJson(baseUrl, '/api/mobile/auth/guest', { method: 'POST' });
    assert.equal(guest2.status, 201);
    const activeToken = guest2.data.accessToken;

    // 4. Neutral Age Gate (KR: 13yo -> CHILD_PROTECTED) + anti-spoofing upgrade block
    const childGate = await reqJson(baseUrl, '/api/mobile/age-gate', {
      method: 'POST',
      token: activeToken,
      body: { birthYear: 2013, birthMonth: 5, regionCode: 'KR' }
    });
    assert.equal(childGate.status, 200);
    assert.equal(childGate.data.ageCompliance.ageTier, 'CHILD_PROTECTED');
    assert.equal(childGate.data.ageCompliance.parentalConsentStatus, 'pending');
    assert.equal(childGate.data.capabilities.disablePersonalizedAds, true);
    assert.equal(childGate.data.capabilities.canUseFreeChat, false);

    // Child cannot spoof age up to adult by resubmitting!
    const spoofAttempt = await reqJson(baseUrl, '/api/mobile/age-gate', {
      method: 'POST',
      token: activeToken,
      body: { birthYear: 1995, birthMonth: 1, regionCode: 'KR' }
    });
    assert.equal(spoofAttempt.status, 403);
    assert.equal(spoofAttempt.data.error.code, 'AGE_TIER_LOCKED');

    // 5. Catalog reflects runtime, ageRating & version compatibility with forgeSupported === false
    const cat = await reqJson(baseUrl, '/api/mobile/catalog', {
      token: activeToken,
      headers: { 'X-PlayHub-Engine-Version': '4.7.2', 'X-PlayHub-App-Version-Code': '1' }
    });
    assert.equal(cat.status, 200);
    assert.equal(cat.data.forgeSupported, false);
    const allGame = cat.data.games.find(g => g.id === 'all-game');
    const teenGame = cat.data.games.find(g => g.id === 'teen-game');
    const adultGame = cat.data.games.find(g => g.id === 'adult-game');
    assert.equal(allGame.runtime, 'godot-pck');
    assert.equal(allGame.allowed, true);
    assert.equal(allGame.compatibility.compatible, true);
    assert.equal(teenGame.allowed, false);
    assert.equal(adultGame.compatibility.compatible, false);
    assert.equal(adultGame.compatibility.reason, 'APP_UPDATE_REQUIRED');

    // App version 5 still flags Godot 4.8.0 > 4.7.2 ENGINE_UPDATE_REQUIRED!
    const catV5 = await reqJson(baseUrl, '/api/mobile/catalog', {
      token: activeToken,
      headers: { 'X-PlayHub-Engine-Version': '4.7.2', 'X-PlayHub-App-Version-Code': '5' }
    });
    const adultGameV5 = catV5.data.games.find(g => g.id === 'adult-game');
    assert.equal(adultGameV5.compatibility.compatible, false);
    assert.equal(adultGameV5.compatibility.reason, 'ENGINE_UPDATE_REQUIRED');

    // 6. Server-side Fail-Closed ageRating check on play-sessions (client overrideRating MUST be ignored!)
    const playAll = await reqJson(baseUrl, '/api/mobile/play-sessions', {
      method: 'POST',
      token: activeToken,
      body: { gameId: 'all-game' }
    });
    assert.equal(playAll.status, 201);

    const playTeenBlocked = await reqJson(baseUrl, '/api/mobile/play-sessions', {
      method: 'POST',
      token: activeToken,
      body: { gameId: 'teen-game' }
    });
    assert.equal(playTeenBlocked.status, 403);
    assert.equal(playTeenBlocked.data.error.code, 'AGE_RATING_RESTRICTED');

    // Critical regression: client-supplied overrideRating: 'ALL' must NEVER bypass server gameAgeRating!
    const playAdultOverrideBypass = await reqJson(baseUrl, '/api/mobile/play-sessions', {
      method: 'POST',
      token: activeToken,
      body: { gameId: 'adult-game', overrideRating: 'ALL' }
    });
    assert.equal(playAdultOverrideBypass.status, 403);
    assert.equal(playAdultOverrideBypass.data.error.code, 'AGE_RATING_RESTRICTED');

    const playTeenOverrideBypass = await reqJson(baseUrl, '/api/mobile/play-sessions', {
      method: 'POST',
      token: activeToken,
      body: { gameId: 'teen-game', overrideRating: 'ALL' }
    });
    assert.equal(playTeenOverrideBypass.status, 403);
    assert.equal(playTeenOverrideBypass.data.error.code, 'AGE_RATING_RESTRICTED');

    // Two-step Parental consent: Step 1 MUST remain pending (no self-escalation!)
    const consentReq = await reqJson(baseUrl, '/api/mobile/parental-consent', {
      method: 'POST',
      token: activeToken,
      body: { guardianContact: 'parent@example.com', method: 'email' }
    });
    assert.equal(consentReq.status, 202);
    assert.equal(consentReq.data.status, 'pending');
    assert.equal(consentReq.data.verificationRequired, true);
    assert.equal(consentReq.data.verificationCode, undefined, 'Verification code must not leak in HTTP response');
    assert.equal(consentReq.data.profile.ageCompliance.parentalConsentStatus, 'pending');
    assert.ok(consentReq.data.challengeId);
    assert.equal(deliveredConsentCodes.length, 1);
    assert.equal(deliveredConsentCodes[0].challengeId, consentReq.data.challengeId);

    // Still blocked until Step 2 code is confirmed
    const playTeenStillBlocked = await reqJson(baseUrl, '/api/mobile/play-sessions', {
      method: 'POST',
      token: activeToken,
      body: { gameId: 'teen-game' }
    });
    assert.equal(playTeenStillBlocked.status, 403);

    // Wrong verification code fails
    const badCode = await reqJson(baseUrl, '/api/mobile/parental-consent', {
      method: 'POST',
      token: activeToken,
      body: { challengeId: consentReq.data.challengeId, verificationCode: '000000000000' }
    });
    assert.equal(badCode.status, 403);
    assert.equal(badCode.data.error.code, 'PARENTAL_CONSENT_CODE_INVALID');

    // Step 2: Confirm out-of-band code transitions to verified (unlocks 12+, still blocks 18+)
    const consentVerify = await reqJson(baseUrl, '/api/mobile/parental-consent', {
      method: 'POST',
      token: activeToken,
      body: {
        challengeId: consentReq.data.challengeId,
        verificationCode: deliveredConsentCodes[0].verificationCode
      }
    });
    assert.equal(consentVerify.status, 200);
    assert.equal(consentVerify.data.ageCompliance.parentalConsentStatus, 'verified');

    // Replaying consumed challenge is rejected
    const consentReplay = await reqJson(baseUrl, '/api/mobile/parental-consent', {
      method: 'POST',
      token: activeToken,
      body: {
        challengeId: consentReq.data.challengeId,
        verificationCode: deliveredConsentCodes[0].verificationCode
      }
    });
    assert.equal(consentReplay.status, 403);
    assert.equal(consentReplay.data.error.code, 'PARENTAL_CONSENT_CHALLENGE_INVALID');

    const playTeenAllowed = await reqJson(baseUrl, '/api/mobile/play-sessions', {
      method: 'POST',
      token: activeToken,
      body: { gameId: 'teen-game' }
    });
    assert.equal(playTeenAllowed.status, 201);

    const playAdultBlocked = await reqJson(baseUrl, '/api/mobile/play-sessions', {
      method: 'POST',
      token: activeToken,
      body: { gameId: 'adult-game', overrideRating: 'ALL' }
    });
    assert.equal(playAdultBlocked.status, 403);

    // 7. Cloud Save with If-Match optimistic locking
    const save1 = await reqJson(baseUrl, '/api/mobile/saves/all-game', {
      method: 'PUT',
      token: activeToken,
      headers: { 'If-None-Match': '*' },
      body: { schemaVersion: 1, payload: { gameId: 'all-game', score: 1500 } }
    });
    assert.equal(save1.status, 200);
    assert.equal(save1.data.revision, 1);
    assert.equal(save1.headers.get('etag'), '"r1"');

    const saveConflict = await reqJson(baseUrl, '/api/mobile/saves/all-game', {
      method: 'PUT',
      token: activeToken,
      headers: { 'If-Match': '"r99"' },
      body: { schemaVersion: 1, payload: { gameId: 'all-game', score: 9999 } }
    });
    assert.equal(saveConflict.status, 412);

    const saveLoaded = await reqJson(baseUrl, '/api/mobile/saves/all-game', { token: activeToken });
    assert.equal(saveLoaded.status, 200);
    assert.equal(saveLoaded.data.payload.score, 1500);

    // 8. Google Mobile Sign-In while holding Guest token creates pendingMerge & preserves child compliance!
    const googleRes = await reqJson(baseUrl, '/api/mobile/auth/google', {
      method: 'POST',
      token: activeToken,
      body: { idToken: 'valid-google-token' }
    });
    assert.equal(googleRes.status, 200);
    assert.equal(googleRes.data.profile.isGuest, false);
    assert.equal(googleRes.data.profile.displayName, 'Alex Mobile');
    assert.ok(googleRes.data.profile.pendingMerge?.id);
    assert.equal(googleRes.data.profile.ageCompliance.ageTier, 'CHILD_PROTECTED');
  } finally {
    await app.close();
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('Mobile security regressions: logout invalidates access JWT, refresh & parental-consent rate limits, challenge expiry & binding', async () => {
  const rootDir = setupFixtureRoot();
  let clockMs = Date.parse('2026-11-21T01:00:00Z');
  const codes = [];
  const app = createApp(
    {
      dataDir: join(rootDir, 'data'),
      publicHost: '127.0.0.1',
      publicPort: 0,
      adminHost: '127.0.0.1',
      adminPort: 0,
      userBaseUrl: 'http://127.0.0.1:18130',
      userOrigins: ['http://127.0.0.1:18130'],
      adminOrigins: ['http://127.0.0.1:18131'],
      mobile: {
        enabled: true,
        jwtSecret: 'test-mobile-secret-32-chars-minimum!!',
        onParentalConsentCode: (info) => codes.push(info)
      }
    },
    { rootDir, clock: () => clockMs }
  );

  const addr = await app.listen();
  const baseUrl = `http://127.0.0.1:${addr.public.port}`;

  try {
    // 1. Logout immediately invalidates Access JWT
    const g1 = await reqJson(baseUrl, '/api/mobile/auth/guest', { method: 'POST' });
    const okMe = await reqJson(baseUrl, '/api/mobile/me', { token: g1.data.accessToken });
    assert.equal(okMe.status, 200);

    const logoutRes = await reqJson(baseUrl, '/api/mobile/auth/logout', {
      method: 'POST',
      token: g1.data.accessToken
    });
    assert.equal(logoutRes.status, 200);

    const afterLogout = await reqJson(baseUrl, '/api/mobile/me', { token: g1.data.accessToken });
    assert.equal(afterLogout.status, 401);
    assert.equal(afterLogout.data.error.code, 'MOBILE_SESSION_REVOKED');

    // 2. Parental consent challenge binding & expiry & rate limit
    const childA = await reqJson(baseUrl, '/api/mobile/auth/guest', { method: 'POST' });
    const childB = await reqJson(baseUrl, '/api/mobile/auth/guest', { method: 'POST' });
    await reqJson(baseUrl, '/api/mobile/age-gate', {
      method: 'POST',
      token: childA.data.accessToken,
      body: { birthYear: 2013, birthMonth: 1, regionCode: 'KR' }
    });
    await reqJson(baseUrl, '/api/mobile/age-gate', {
      method: 'POST',
      token: childB.data.accessToken,
      body: { birthYear: 2013, birthMonth: 1, regionCode: 'KR' }
    });

    const reqA = await reqJson(baseUrl, '/api/mobile/parental-consent', {
      method: 'POST',
      token: childA.data.accessToken,
      body: { guardianContact: 'mom@example.com', method: 'email' }
    });
    assert.equal(reqA.status, 202);
    const codeA = codes[0];

    // Child B cannot redeem Child A's challenge
    const stolenAttempt = await reqJson(baseUrl, '/api/mobile/parental-consent', {
      method: 'POST',
      token: childB.data.accessToken,
      body: { challengeId: codeA.challengeId, verificationCode: codeA.verificationCode }
    });
    assert.equal(stolenAttempt.status, 403);
    assert.equal(stolenAttempt.data.error.code, 'PARENTAL_CONSENT_CHALLENGE_INVALID');

    // Advance clock past 10-minute TTL -> expired challenge rejected with 410
    clockMs += 11 * 60 * 1000;
    const expiredAttempt = await reqJson(baseUrl, '/api/mobile/parental-consent', {
      method: 'POST',
      token: childA.data.accessToken,
      body: { challengeId: codeA.challengeId, verificationCode: codeA.verificationCode }
    });
    assert.equal(expiredAttempt.status, 410);
    assert.equal(expiredAttempt.data.error.code, 'PARENTAL_CONSENT_CHALLENGE_EXPIRED');

    // Rate limit on /api/mobile/parental-consent (10/min per user)
    let consentRateLimited = false;
    for (let i = 0; i < 12; i++) {
      const r = await reqJson(baseUrl, '/api/mobile/parental-consent', {
        method: 'POST',
        token: childA.data.accessToken,
        body: { guardianContact: 'mom@example.com', method: 'email' }
      });
      if (r.status === 429) {
        assert.equal(r.data.error.code, 'RATE_LIMITED');
        consentRateLimited = true;
        break;
      }
    }
    assert.equal(consentRateLimited, true, 'Expected /api/mobile/parental-consent to enforce rate limit');

    // 3. Rate limit on /api/mobile/auth/refresh (30/min per IP)
    let refreshRateLimited = false;
    for (let i = 0; i < 35; i++) {
      const r = await reqJson(baseUrl, '/api/mobile/auth/refresh', {
        method: 'POST',
        body: { refreshToken: 'phr_invalid_token_probe' }
      });
      if (r.status === 429) {
        assert.equal(r.data.error.code, 'RATE_LIMITED');
        refreshRateLimited = true;
        break;
      }
    }
    assert.equal(refreshRateLimited, true, 'Expected /api/mobile/auth/refresh to enforce rate limit');
  } finally {
    await app.close();
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('Apple auth fail-closed expectedAudiences, 60s JWKS force-refresh cooldown, and AbortSignal timeout', async () => {
  clearAppleJwksCache();
  const k1 = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk1 = { ...k1.publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };

  function signJwt(header, payload) {
    const h = Buffer.from(JSON.stringify(header)).toString('base64url');
    const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const s = createSign('RSA-SHA256').update(`${h}.${p}`).sign(k1.privateKey).toString('base64url');
    return `${h}.${p}.${s}`;
  }

  let nowMs = Date.UTC(2026, 10, 21, 5, 0, 0);
  const exp = Math.floor(nowMs / 1000) + 600;
  const nonce = 'nonce-abc';
  const nonceHash = createHash('sha256').update(nonce).digest('hex');

  const validJwt = signJwt(
    { alg: 'RS256', kid: 'k1' },
    { iss: 'https://appleid.apple.com', aud: 'com.playhub.live', sub: 'apple-sub-1', nonce: nonceHash, exp }
  );
  const unknownKidJwt = signJwt(
    { alg: 'RS256', kid: 'unknown-kid' },
    { iss: 'https://appleid.apple.com', aud: 'com.playhub.live', sub: 'apple-sub-1', nonce: nonceHash, exp }
  );

  let fetches = 0;
  const jwksFetcher = async () => {
    fetches++;
    return { keys: [jwk1] };
  };

  // 1. Empty expectedAudiences MUST fail closed before accepting any token
  await assert.rejects(
    verifyAppleIdentityToken(validJwt, { expectedAudiences: [], rawNonce: nonce, jwksFetcher, nowMs }),
    err => err.code === 'APPLE_AUDIENCE_REQUIRED'
  );
  await assert.rejects(
    verifyAppleIdentityToken(validJwt, { rawNonce: nonce, jwksFetcher, nowMs }),
    err => err.code === 'APPLE_AUDIENCE_REQUIRED'
  );
  assert.equal(fetches, 0, 'Fail-closed audience check must happen before JWKS fetch');

  // 2. Initial fetch succeeds
  const ok = await verifyAppleIdentityToken(validJwt, {
    expectedAudiences: ['com.playhub.live'],
    rawNonce: nonce,
    jwksFetcher,
    nowMs
  });
  assert.equal(ok.sub, 'apple-sub-1');
  assert.equal(fetches, 1);

  // 3. Unknown kid spam triggers at most 1 force refresh per 60 seconds
  for (let i = 0; i < 5; i++) {
    await assert.rejects(
      verifyAppleIdentityToken(unknownKidJwt, {
        expectedAudiences: ['com.playhub.live'],
        rawNonce: nonce,
        jwksFetcher,
        nowMs: nowMs + i * 1000
      }),
      err => err.code === 'APPLE_KEY_NOT_FOUND'
    );
  }
  assert.equal(fetches, 2, 'Force refresh must be rate-limited by 60s cooldown');

  // After 60 seconds, force refresh is permitted again
  await assert.rejects(
    verifyAppleIdentityToken(unknownKidJwt, {
      expectedAudiences: ['com.playhub.live'],
      rawNonce: nonce,
      jwksFetcher,
      nowMs: nowMs + 61_000
    }),
    err => err.code === 'APPLE_KEY_NOT_FOUND'
  );
  assert.equal(fetches, 3);

  // 4. revokeAppleToken passes an AbortSignal timeout
  let seenSignal = null;
  await revokeAppleToken({
    clientId: 'com.playhub.live',
    clientSecret: 'secret-jwt',
    token: 'refresh-tok',
    fetchImpl: async (_url, init) => {
      seenSignal = init.signal;
      return { ok: true, status: 200 };
    }
  });
  assert.ok(seenSignal instanceof AbortSignal, 'revokeAppleToken must pass AbortSignal.timeout');
});
