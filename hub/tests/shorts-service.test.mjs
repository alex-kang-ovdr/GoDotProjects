import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server/app.mjs';
import { creditPromo, getWallet, verifyLedgerIntegrity } from '../server/billing/ledger.mjs';
import { detectFfmpegBinary } from '../server/shorts/engines.mjs';
import { sanitizeSnapshot } from '../tools/sanitize-snapshot.mjs';

const hubRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(hubRoot, '..');

// Minimal valid ISO BMFF MP4 buffer with 'ftyp' box for deterministic fast tests
const SYNTHETIC_MP4 = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x18]),
  Buffer.from('ftypisom', 'ascii'),
  Buffer.from([0x00, 0x00, 0x02, 0x00]),
  Buffer.from('isomiso2mp41', 'ascii'),
  Buffer.alloc(64, 0x41)
]);

function makeClient(baseUrl) {
  let cookie = '';
  let csrf = '';
  return {
    get csrf() { return csrf; },
    async request(route, { method = 'GET', body, headers = {}, rawBody = null } = {}) {
      const h = { Origin: 'http://localhost:8080', ...headers };
      if (cookie) h.Cookie = cookie;
      if (method !== 'GET' && method !== 'HEAD' && csrf && !h['X-CSRF-Token']) {
        h['X-CSRF-Token'] = csrf;
      }
      if (body !== undefined && !rawBody) h['Content-Type'] = 'application/json';
      const res = await fetch(baseUrl + route, {
        method,
        headers: h,
        body: rawBody !== null ? rawBody : (body === undefined ? undefined : JSON.stringify(body))
      });
      const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
      for (const sc of setCookies) {
        const pair = sc.split(';')[0];
        if (pair.startsWith('poc_public_session=')) cookie = pair;
      }
      const ct = res.headers.get('content-type') || '';
      const data = ct.includes('application/json') ? await res.json() : Buffer.from(await res.arrayBuffer());
      if (data?.csrfToken) csrf = data.csrfToken;
      return { status: res.status, headers: res.headers, data };
    }
  };
}

function createTestRegisteredUser(app, baseUrl, displayName = '테스트 창작자') {
  return (async () => {
    const client = makeClient(baseUrl);
    const sess = await client.request('/api/session');
    assert.equal(sess.status, 200);
    // Register via email SSO so user is a genuine registered account with active session
    const email = `creator-${Math.random().toString(16).slice(2, 10)}@example.com`;
    const reg = await client.request('/api/auth/email/register', {
      method: 'POST',
      body: { email, password: 'Password1234!', displayName }
    });
    assert.equal(reg.status, 201);
    const userRow = app.db.prepare('SELECT id FROM users WHERE display_name=? ORDER BY created_at DESC LIMIT 1').get(displayName);
    return { client, userId: userRow.id, email };
  })();
}

function makeTempApp(extraConfig = {}, extraDeps = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-shorts-test-'));
  const dataDir = path.join(tmpDir, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const app = createApp({
    publicHost: '127.0.0.1',
    publicPort: 0,
    adminHost: '127.0.0.1',
    adminPort: 0,
    userOrigins: ['http://localhost:8080'],
    adminOrigins: ['http://127.0.0.1:8081'],
    userBaseUrl: 'http://localhost:8080',
    dataDir,
    secureCookies: false,
    billing: { enabled: true, allowMockProvider: true, allowDemoAccount: true },
    ...extraConfig
  }, {
    rootDir: hubRoot,
    platformRoot: repoRoot,
    ...extraDeps
  });
  return { app, tmpDir, dataDir };
}

test('Hub-Shorts: Veo LRO generation, PlayCoin Hold/Capture settlement, fallback partial refund, failure auto-release, ownership, and feed', async () => {
  let veoCallCount = 0;
  const mockVeoFetch = async (url, init) => {
    const s = String(url);
    if (s.includes(':predictLongRunning')) {
      veoCallCount++;
      if (veoCallCount === 2) {
        // Simulate upstream Veo error on second call to verify fallback + partial refund!
        return new Response(JSON.stringify({ error: { message: 'Veo quota temporarily exhausted' } }), {
          status: 429,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({ name: 'operations/veo-op-123' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (s.includes('/operations/veo-op-123')) {
      return new Response(JSON.stringify({
        done: true,
        response: {
          generateVideoResponse: {
            generatedSamples: [{ video: { uri: 'https://veo.example.invalid/clip.mp4' } }]
          }
        }
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (s === 'https://veo.example.invalid/clip.mp4') {
      return new Response(SYNTHETIC_MP4, { status: 200, headers: { 'Content-Type': 'video/mp4' } });
    }
    return new Response('{}', { status: 404 });
  };

  let failFfmpeg = false;
  const fakeFfmpegRenderer = async ({ outputVideoPath, outputPosterPath }) => {
    if (failFfmpeg) {
      throw Object.assign(new Error('Simulated FFmpeg crash'), { code: 'FFMPEG_SIMULATED_CRASH' });
    }
    fs.writeFileSync(outputVideoPath, SYNTHETIC_MP4);
    const svgPath = outputPosterPath.replace(/\.jpg$/, '.svg');
    fs.writeFileSync(svgPath, '<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280"></svg>', 'utf8');
    return {
      videoPath: outputVideoPath,
      posterPath: svgPath,
      posterExt: '.svg',
      mimeType: 'video/mp4',
      bytes: SYNTHETIC_MP4.length,
      sha256: 'abc123def456',
      durationSec: 8,
      width: 720,
      height: 1280,
      aspectRatio: '9:16',
      model: 'ffmpeg-9x16-director-v1'
    };
  };

  const { app, tmpDir, dataDir } = makeTempApp({
    shorts: { geminiApiKey: 'test-gemini-veo-key' }
  }, {
    shortsFetch: mockVeoFetch,
    shortsRenderers: { ffmpeg: fakeFfmpegRenderer }
  });

  const { public: pubAddr } = await app.listen();
  const baseUrl = `http://127.0.0.1:${pubAddr.port}`;

  try {
    // 1. Public config & storyboard composition
    const anon = makeClient(baseUrl);
    const cfgRes = await anon.request('/api/shorts/config');
    assert.equal(cfgRes.status, 200);
    assert.equal(cfgRes.data.veoConfigured, true);
    assert.equal(cfgRes.data.engines.length, 4);

    const plansRes = await anon.request('/api/shorts/playground-plans');
    assert.equal(plansRes.status, 200);
    assert.equal(plansRes.data.ok, true);
    assert.deepEqual(
      plansRes.data.plans.map(p => p.gameId),
      ['world-of-warships', 'besiege', 'league-of-legends', 'clash-royale', 'survivor-io']
    );
    for (const plan of plansRes.data.plans) {
      assert.equal(plan.scenes.length, 3);
      assert.match(plan.masterFlowPrompt, /Google Playground/);
    }

    await anon.request('/api/session');
    const sbRes = await anon.request('/api/shorts/storyboard', {
      method: 'POST',
      body: { gameId: 'brick-breaker', stylePreset: 'neon-arcade', cameraMotion: 'dynamic-zoom', durationSec: 8 }
    });
    assert.equal(sbRes.status, 200);
    assert.equal(sbRes.data.storyboard.scenes.length, 3);
    assert.match(sbRes.data.storyboard.flowPrompt, /Vertical 9:16/);
    assert.match(sbRes.data.storyboard.flowExportMarkdown, /Google Flow/);

    // 2. Create two registered creators & seed Creator A's UGC publication
    const creatorA = await createTestRegisteredUser(app, baseUrl, '크리에이터 A');
    const creatorB = await createTestRegisteredUser(app, baseUrl, '크리에이터 B');

    const nowMs = Date.now();
    app.db.prepare(`
      INSERT INTO hub_publications(
        game_id, host_slug, owner_key, owner_id, project_id, active_release_id,
        visibility, deploy_mode, status, artifact_sha256, artifact_base_url,
        manifest_json, deploy_profile_json, cas_version, published_at, updated_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      'creator-a-rocket',
      'paaaaaaaaaaaaaaaa',
      'owner-key-a',
      creatorA.userId,
      'a'.repeat(24),
      'b'.repeat(24),
      'public',
      'singleplay',
      'published',
      'c'.repeat(64),
      '/play-ugc/paaaaaaaaaaaaaaaa/' + 'b'.repeat(24) + '/',
      JSON.stringify({ id: 'creator-a-rocket', title: { ko: '로켓 러시', en: 'Rocket Rush' }, summary: { ko: '우주 아케이드' }, tags: ['arcade'], controls: ['touch'] }),
      JSON.stringify({ mode: 'singleplay' }),
      1,
      nowMs,
      nowMs
    );

    // 3. Insufficient PlayCoin check (balance is 0 initially)
    const noCoins = await creatorA.client.request('/api/shorts/generate?sync=1', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'gen-no-coins-001' },
      body: { gameId: 'creator-a-rocket', engineId: 'google-flow-veo-fast' }
    });
    assert.equal(noCoins.status, 422);
    assert.equal(noCoins.data.error.code, 'INSUFFICIENT_PLAYCOIN');

    // 4. Credit 200 PlayCoin to Creator A via canonical Track A ledger
    creditPromo(app.db, {
      principalId: creatorA.userId,
      coins: 200,
      reason: 'test_seed',
      idempotencyKey: 'seed-creator-a-200'
    });
    assert.equal(getWallet(app.db, creatorA.userId).available, 200);

    // 5. Generate with Google Flow Veo Fast (60 PC) — succeeds via mocked Veo LRO!
    const veoGen = await creatorA.client.request('/api/shorts/generate?sync=1', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'gen-veo-success-001' },
      body: {
        gameId: 'creator-a-rocket',
        engineId: 'google-flow-veo-fast',
        title: '로켓 러시 8초 트레일러',
        stylePreset: 'cinematic'
      }
    });
    assert.equal(veoGen.status, 201);
    assert.equal(veoGen.data.short.status, 'ready');
    assert.equal(veoGen.data.short.resolvedEngineId, 'google-flow-veo-fast');
    assert.equal(veoGen.data.short.quotedCoins, 60);
    assert.equal(veoGen.data.short.chargedCoins, 60);
    assert.equal(getWallet(app.db, creatorA.userId).available, 140);
    assert.equal(getWallet(app.db, creatorA.userId).reserved, 0);

    // 6. Idempotency replay returns cached response without charging again!
    const replay = await creatorA.client.request('/api/shorts/generate?sync=1', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'gen-veo-success-001' },
      body: {
        gameId: 'creator-a-rocket',
        engineId: 'google-flow-veo-fast',
        title: '로켓 러시 8초 트레일러',
        stylePreset: 'cinematic'
      }
    });
    assert.equal(replay.status, 200);
    assert.equal(replay.data.replayed, true);
    assert.equal(getWallet(app.db, creatorA.userId).available, 140);

    // 7. Veo fails on 2nd call -> falls back to PlayForge Motion (20 PC), holding 60 PC and automatically refunding 40 PC!
    const fallbackGen = await creatorA.client.request('/api/shorts/generate?sync=1', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'gen-veo-fallback-002' },
      body: {
        gameId: 'creator-a-rocket',
        engineId: 'google-flow-veo-fast',
        allowFallback: true,
        title: '로켓 러시 폴백 쇼츠'
      }
    });
    assert.equal(fallbackGen.status, 201);
    assert.equal(fallbackGen.data.short.status, 'ready');
    assert.equal(fallbackGen.data.short.fallbackUsed, true);
    assert.equal(fallbackGen.data.short.resolvedEngineId, 'forge-motion-ffmpeg');
    assert.equal(fallbackGen.data.short.quotedCoins, 60);
    assert.equal(fallbackGen.data.short.chargedCoins, 20);
    assert.equal(getWallet(app.db, creatorA.userId).available, 120); // 140 - 20 = 120 (40 released!)

    // 8. Complete render failure automatically releases 100% of held PlayCoins!
    failFfmpeg = true;
    const failedGen = await creatorA.client.request('/api/shorts/generate?sync=1', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'gen-ffmpeg-fail-003' },
      body: {
        gameId: 'creator-a-rocket',
        engineId: 'forge-motion-ffmpeg',
        title: '실패 테스트 쇼츠'
      }
    });
    failFfmpeg = false;
    assert.equal(failedGen.status, 500);
    assert.equal(failedGen.data.short.status, 'failed');
    assert.equal(failedGen.data.short.chargedCoins, 0);
    assert.equal(getWallet(app.db, creatorA.userId).available, 120);
    assert.equal(getWallet(app.db, creatorA.userId).reserved, 0);

    // Verify double-entry Zero-Sum ledger integrity!
    const integrity = verifyLedgerIntegrity(app.db);
    assert.equal(integrity.ok, true);

    // 9. Creator B CANNOT generate or publish for Creator A's UGC game (strict ownership check!)
    creditPromo(app.db, {
      principalId: creatorB.userId,
      coins: 100,
      reason: 'test_seed_b',
      idempotencyKey: 'seed-creator-b-100'
    });
    const hijackGen = await creatorB.client.request('/api/shorts/generate?sync=1', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'gen-hijack-001' },
      body: { gameId: 'creator-a-rocket', engineId: 'forge-motion-ffmpeg' }
    });
    assert.equal(hijackGen.status, 403);
    assert.equal(hijackGen.data.error.code, 'GAME_OWNERSHIP_FORBIDDEN');

    // 10. Publish Creator A's first short to Hub My Game & test HTTP Range streaming, feed, likes, views
    const shortId1 = veoGen.data.short.id;
    const shortId2 = fallbackGen.data.short.id;
    const pub1 = await creatorA.client.request(`/api/shorts/${shortId1}/publish`, {
      method: 'POST',
      body: { gameId: 'creator-a-rocket', title: '로켓 러시 공식 쇼츠', caption: '8초 만에 우주 정복!', isPrimary: true }
    });
    assert.equal(pub1.status, 200);
    assert.equal(pub1.data.short.status, 'published');
    assert.equal(pub1.data.short.isPrimary, true);

    // Publish second short as primary -> atomically demotes first short's isPrimary!
    const pub2 = await creatorA.client.request(`/api/shorts/${shortId2}/publish`, {
      method: 'POST',
      body: { gameId: 'creator-a-rocket', isPrimary: true }
    });
    assert.equal(pub2.status, 200);
    assert.equal(pub2.data.short.isPrimary, true);

    const byGame = await anon.request('/api/shorts/by-game/creator-a-rocket');
    assert.equal(byGame.status, 200);
    assert.equal(byGame.data.shorts.length, 2);
    assert.equal(byGame.data.primary.id, shortId2);
    assert.equal(byGame.data.shorts.find(s => s.id === shortId1).isPrimary, false);

    // HTTP 206 Partial Content Range streaming test
    const rangeRes = await anon.request(`/api/shorts/${shortId1}/video`, {
      headers: { Range: 'bytes=0-15' }
    });
    assert.equal(rangeRes.status, 206);
    assert.equal(rangeRes.headers.get('content-range'), `bytes 0-15/${SYNTHETIC_MP4.length}`);
    assert.equal(rangeRes.data.length, 16);

    // Like & deduplicated daily view
    const like1 = await anon.request(`/api/shorts/${shortId1}/like`, { method: 'POST', body: {} });
    assert.equal(like1.status, 200);
    assert.equal(like1.data.liked, true);
    assert.equal(like1.data.likeCount, 1);

    const view1 = await anon.request(`/api/shorts/${shortId1}/view`, { method: 'POST', body: {} });
    const view2 = await anon.request(`/api/shorts/${shortId1}/view`, { method: 'POST', body: {} });
    assert.equal(view1.data.viewCount, 1);
    assert.equal(view2.data.counted, false);
    assert.equal(view2.data.viewCount, 1);

    // 11. Direct Google Flow MP4 import (0 PC) + invalid signature rejection
    const badImport = await creatorA.client.request('/api/shorts/import', {
      method: 'POST',
      headers: { 'Content-Type': 'video/mp4' },
      rawBody: Buffer.from('not-a-valid-video-file-at-all-1234567890')
    });
    assert.equal(badImport.status, 422);
    assert.equal(badImport.data.error.code, 'VIDEO_SIGNATURE_INVALID');

    const goodImport = await creatorA.client.request('/api/shorts/import?gameId=creator-a-rocket&title=Flow%20Import', {
      method: 'POST',
      headers: { 'Content-Type': 'video/mp4' },
      rawBody: SYNTHETIC_MP4
    });
    assert.equal(goodImport.status, 201);
    assert.equal(goodImport.data.short.engineId, 'flow-import');
    assert.equal(goodImport.data.short.chargedCoins, 0);

    // 12. Games summary map reflects registered shorts
    const summary = await anon.request('/api/shorts/games-summary');
    assert.equal(summary.status, 200);
    assert.equal(summary.data.games['creator-a-rocket'].count, 2);

    // 13. Fail-Closed snapshot sanitizer handles all 4 shorts_* tables cleanly
    const outDb = path.join(tmpDir, 'sanitized.sqlite');
    const sanReport = await sanitizeSnapshot({
      from: path.join(dataDir, 'platform.sqlite'),
      out: outDb,
      targetEnv: 'dev'
    });
    assert.equal(sanReport.ok, true);
    assert.equal(sanReport.sanitized, true);
    assert.equal(sanReport.integrity, 'ok');
    const { DatabaseSync } = await import('node:sqlite');
    const sanDb = new DatabaseSync(outDb, { readOnly: true });
    try {
      assert.equal(sanDb.prepare('SELECT COUNT(*) AS c FROM shorts_idempotency').get().c, 0);
      assert.equal(sanDb.prepare('SELECT COUNT(*) AS c FROM shorts_views').get().c, 0);
      const sv = sanDb.prepare('SELECT creator_name, billing_hold_id FROM shorts_videos LIMIT 1').get();
      assert.match(sv.creator_name, /^DevCreator_/);
      assert.equal(sv.billing_hold_id, null);
    } finally {
      sanDb.close();
    }
  } finally {
    await app.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Hub-Shorts: Production mode blocks non-owner binding to static catalog games', async () => {
  const { app, tmpDir } = makeTempApp({
    secureCookies: true,
    userOrigins: ['https://playhub.example'],
    userBaseUrl: 'https://playhub.example',
    billing: { enabled: true, allowMockProvider: false, allowDemoAccount: false }
  });
  const { public: pubAddr } = await app.listen();
  const baseUrl = `http://127.0.0.1:${pubAddr.port}`;
  try {
    // Seed a registered user + session directly in DB for secureCookies=true test
    const nowMs = Date.now();
    const userId = 'u-prod-creator-1';
    app.db.prepare('INSERT INTO users(id,kind,display_name,created_at) VALUES(?,?,?,?)')
      .run(userId, 'registered', 'Prod Creator', nowMs);
    const { secret, digest } = await import('../server/security.mjs');
    const tok = secret();
    const csrf = secret();
    app.db.prepare('INSERT INTO sessions(id_hash,kind,principal_id,analytics_subject,csrf,admin_authenticated,admin_username,created_at,expires_at,traffic_type,qa_run_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
      .run(digest(tok), 'public', userId, 'a:prod1', csrf, 0, null, nowMs, nowMs + 3600000, 'live', null);

    const res = await fetch(`${baseUrl}/api/shorts/generate?sync=1`, {
      method: 'POST',
      headers: {
        Origin: 'https://playhub.example',
        Cookie: `poc_public_session=${tok}`,
        'X-CSRF-Token': csrf,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ gameId: 'brick-breaker', engineId: 'forge-motion-ffmpeg' })
    });
    const body = await res.json();
    assert.equal(res.status, 403);
    assert.equal(body.error.code, 'GAME_OWNERSHIP_REQUIRED');
  } finally {
    await app.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Hub-Shorts: Real FFmpeg 9:16 MP4 render integration (when ffmpeg is installed)', async (t) => {
  const ff = detectFfmpegBinary();
  if (!ff.available) {
    t.skip('FFmpeg binary not installed on this host');
    return;
  }
  const { app, tmpDir } = makeTempApp();
  const { public: pubAddr } = await app.listen();
  const baseUrl = `http://127.0.0.1:${pubAddr.port}`;
  try {
    const creator = await createTestRegisteredUser(app, baseUrl, 'FFmpeg 실측 크리에이터');
    const grant = await creator.client.request('/api/shorts/dev-grant', { method: 'POST', body: { coins: 100 } });
    assert.equal(grant.status, 200);
    assert.equal(grant.data.wallet.available, 100);

    const gen = await creator.client.request('/api/shorts/generate?sync=1', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'real-ffmpeg-001' },
      body: {
        gameId: 'brick-breaker',
        engineId: 'forge-motion-ffmpeg',
        stylePreset: 'neon-arcade',
        durationSec: 5,
        title: '브릭 브레이커 실측 쇼츠'
      }
    });
    assert.equal(gen.status, 201);
    assert.equal(gen.data.short.status, 'ready');
    assert.equal(gen.data.short.width, 720);
    assert.equal(gen.data.short.height, 1280);
    assert.equal(gen.data.short.chargedCoins, 20);
    assert.ok(gen.data.short.bytes > 20000);
    assert.equal(getWallet(app.db, creator.userId).available, 80);

    const pub = await creator.client.request(`/api/shorts/${gen.data.short.id}/publish`, {
      method: 'POST',
      body: { gameId: 'brick-breaker', isPrimary: true }
    });
    assert.equal(pub.status, 200);
    assert.equal(pub.data.short.status, 'published');

    const posterRes = await creator.client.request(`/api/shorts/${gen.data.short.id}/poster`);
    assert.equal(posterRes.status, 200);
    assert.ok(posterRes.data.length > 1000);
  } finally {
    await app.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
