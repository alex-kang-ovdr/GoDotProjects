import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.mjs';

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
      mobile: { enabled: true, jwtSecret: 'test-mobile-secret-32-chars-minimum!!' }
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

    // 3. Rotating Refresh Token works once, and replaying refresh1 revokes the entire family!
    const refreshed = await reqJson(baseUrl, '/api/mobile/auth/refresh', {
      method: 'POST',
      body: { refreshToken: refresh1 }
    });
    assert.equal(refreshed.status, 200);
    const refresh2 = refreshed.data.refreshToken;
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

    // 4. Neutral Age Gate (KR: 13yo -> CHILD_PROTECTED) + anti-spoofing upgrade block
    const childGate = await reqJson(baseUrl, '/api/mobile/age-gate', {
      method: 'POST',
      token: guestToken1,
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
      token: guestToken1,
      body: { birthYear: 1995, birthMonth: 1, regionCode: 'KR' }
    });
    assert.equal(spoofAttempt.status, 403);
    assert.equal(spoofAttempt.data.error.code, 'AGE_TIER_LOCKED');

    // 5. Catalog reflects runtime, ageRating & version compatibility with forgeSupported === false
    const cat = await reqJson(baseUrl, '/api/mobile/catalog', {
      token: guestToken1,
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
      token: guestToken1,
      headers: { 'X-PlayHub-Engine-Version': '4.7.2', 'X-PlayHub-App-Version-Code': '5' }
    });
    const adultGameV5 = catV5.data.games.find(g => g.id === 'adult-game');
    assert.equal(adultGameV5.compatibility.compatible, false);
    assert.equal(adultGameV5.compatibility.reason, 'ENGINE_UPDATE_REQUIRED');

    // 6. Server-side Fail-Closed ageRating check on play-sessions
    const playAll = await reqJson(baseUrl, '/api/mobile/play-sessions', {
      method: 'POST',
      token: guestToken1,
      body: { gameId: 'all-game' }
    });
    assert.equal(playAll.status, 201);

    const playTeenBlocked = await reqJson(baseUrl, '/api/mobile/play-sessions', {
      method: 'POST',
      token: guestToken1,
      body: { gameId: 'teen-game' }
    });
    assert.equal(playTeenBlocked.status, 403);
    assert.equal(playTeenBlocked.data.error.code, 'AGE_RATING_RESTRICTED');

    // Parental consent unlocks 12+ but still blocks 18+
    const consent = await reqJson(baseUrl, '/api/mobile/parental-consent', {
      method: 'POST',
      token: guestToken1,
      body: { guardianContact: 'parent@example.com', method: 'email' }
    });
    assert.equal(consent.status, 200);
    assert.equal(consent.data.ageCompliance.parentalConsentStatus, 'verified');

    const playTeenAllowed = await reqJson(baseUrl, '/api/mobile/play-sessions', {
      method: 'POST',
      token: guestToken1,
      body: { gameId: 'teen-game' }
    });
    assert.equal(playTeenAllowed.status, 201);

    const playAdultBlocked = await reqJson(baseUrl, '/api/mobile/play-sessions', {
      method: 'POST',
      token: guestToken1,
      body: { gameId: 'adult-game' }
    });
    assert.equal(playAdultBlocked.status, 403);

    // 7. Cloud Save with If-Match optimistic locking
    const save1 = await reqJson(baseUrl, '/api/mobile/saves/all-game', {
      method: 'PUT',
      token: guestToken1,
      headers: { 'If-None-Match': '*' },
      body: { schemaVersion: 1, payload: { gameId: 'all-game', score: 1500 } }
    });
    assert.equal(save1.status, 200);
    assert.equal(save1.data.revision, 1);
    assert.equal(save1.headers.get('etag'), '"r1"');

    const saveConflict = await reqJson(baseUrl, '/api/mobile/saves/all-game', {
      method: 'PUT',
      token: guestToken1,
      headers: { 'If-Match': '"r99"' },
      body: { schemaVersion: 1, payload: { gameId: 'all-game', score: 9999 } }
    });
    assert.equal(saveConflict.status, 412);

    const saveLoaded = await reqJson(baseUrl, '/api/mobile/saves/all-game', { token: guestToken1 });
    assert.equal(saveLoaded.status, 200);
    assert.equal(saveLoaded.data.payload.score, 1500);

    // 8. Google Mobile Sign-In while holding Guest token creates pendingMerge & preserves child compliance!
    const googleRes = await reqJson(baseUrl, '/api/mobile/auth/google', {
      method: 'POST',
      token: guestToken1,
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
