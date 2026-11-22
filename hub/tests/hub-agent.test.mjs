import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createApp } from '../server/app.mjs';
import { creditPromo, getWallet, verifyLedgerIntegrity } from '../server/billing/ledger.mjs';
import { upsertSubscription } from '../server/billing/subscriptions.mjs';
import { currentKstWeekWindow } from '../server/agent/pricing.mjs';

const require = createRequire(import.meta.url);
const { createServer: createForgeServer } = require('../../forge/server.cjs');

const FORGE_ROOT = path.resolve(import.meta.dirname, '../../forge');

function makeTempHubRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-agent-test-'));
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(path.join(root, 'catalog'), { recursive: true });
  fs.mkdirSync(path.join(root, 'games', 'test-game'), { recursive: true });
  fs.writeFileSync(path.join(root, 'catalog', 'games.json'), JSON.stringify({
    schemaVersion: 1,
    entries: [{ id: 'test-game', path: 'games/test-game', enabled: true }]
  }));
  fs.writeFileSync(path.join(root, 'games', 'test-game', 'game.manifest.json'), JSON.stringify({
    schemaVersion: 1,
    id: 'test-game',
    slug: 'test-game',
    entry: 'index.html',
    version: '0.1.0',
    title: { ko: '테스트 게임', en: 'Test Game' },
    summary: { ko: '테스트', en: 'Test' },
    instructions: { ko: '테스트 조작 안내', en: 'Test instructions' },
    tags: ['puzzle'],
    controls: ['keyboard'],
    save: { schemaVersion: 1 },
    media: { cover: 'assets/cover.svg' }
  }));
  return { root, dataDir };
}

function parseSetCookie(res, name) {
  const raw = res.headers.getSetCookie?.() || [];
  for (const line of raw) {
    const first = line.split(';')[0];
    const eq = first.indexOf('=');
    if (eq > 0 && first.slice(0, eq).trim() === name) return first.slice(eq + 1).trim();
  }
  return null;
}

function createMockGeminiProvider({ initiallyReady = true } = {}) {
  let oauthConnected = initiallyReady;
  let apiKeyValue = '';
  let nextUsage = {
    inputTokens: 1000,
    cachedTokens: 0,
    outputTokens: 250,
    thinkingTokens: 0,
    totalTokens: 1250
  };
  let nextFailure = null;
  const calls = [];

  return {
    calls,
    setUsage(u) { nextUsage = { ...nextUsage, ...u }; },
    setNextFailure(err) { nextFailure = err; },
    setOAuthConnected(v) { oauthConnected = Boolean(v); },
    getConnectionStatus({ preferredProvider = 'gemini-oauth' } = {}) {
      const apiKeyConnected = Boolean(apiKeyValue);
      const ready = oauthConnected || apiKeyConnected;
      let activeMode = null;
      if (preferredProvider === 'gemini-oauth') {
        activeMode = oauthConnected ? 'gemini-oauth' : (apiKeyConnected ? 'gemini-apikey' : null);
      } else {
        activeMode = apiKeyConnected ? 'gemini-apikey' : (oauthConnected ? 'gemini-oauth' : null);
      }
      return {
        ready,
        activeMode,
        oauth: {
          cliInstalled: true,
          cliPath: 'mock/gemini.js',
          connected: oauthConnected,
          accountEmail: oauthConnected ? 'operator@playhub.test' : null,
          loginInProgress: false,
          authUrl: null
        },
        apiKey: {
          connected: apiKeyConnected,
          maskedKey: apiKeyConnected ? `${apiKeyValue.slice(0, 6)}...${apiKeyValue.slice(-4)}` : null
        },
        models: ['gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-2.5-pro']
      };
    },
    async startOAuthConnect() {
      oauthConnected = true;
      return {
        alreadyConnected: false,
        pending: false,
        status: 'connected',
        accountEmail: 'operator@playhub.test'
      };
    },
    saveApiKey(key) {
      apiKeyValue = String(key || '').trim();
      return this.getConnectionStatus({ preferredProvider: 'gemini-apikey' });
    },
    disconnect({ target = 'all' } = {}) {
      if (target === 'all' || target === 'oauth') oauthConnected = false;
      if (target === 'all' || target === 'apikey') apiKeyValue = '';
      return this.getConnectionStatus();
    },
    async generate(opts = {}) {
      calls.push(opts);
      if (nextFailure) {
        const err = nextFailure;
        nextFailure = null;
        throw err;
      }

      const isByok = Boolean(opts.byok?.apiKey);
      const model = opts.model || opts.defaultModel || 'gemini-3.5-flash';
      const promptText = (opts.messages || []).map(m => m.content || '').join('\n');

      let content = `안녕하세요! PlayHub 내장 Gemini 응답입니다. (${promptText.slice(0, 40)})`;

      // Detect 3D modeling recipe prompts (Hub modeling or Forge Blender planner)
      if (
        opts.responseMimeType === 'application/json' &&
        (String(opts.systemPrompt || '').includes('MeshRecipe') || promptText.includes('MeshRecipe'))
      ) {
        content = JSON.stringify({
          version: 1,
          name: 'CrystalTower',
          style: 'stylized',
          parts: [
            { id: 'base_pedestal', shape: 'cylinder', position: [0, 0, 0.25], rotation: [0, 0, 0], scale: [1.2, 1.2, 0.5], color: '#475569', roughness: 0.7, metallic: 0.2 },
            { id: 'crystal_spire', shape: 'cone', position: [0, 0, 1.4], rotation: [0, 0, 0], scale: [0.65, 0.65, 1.8], color: '#38bdf8', roughness: 0.15, metallic: 0.1, emission: '#0ea5e9', emissionStrength: 1.8 },
            { id: 'orbit_ring', shape: 'torus', position: [0, 0, 1.2], rotation: [15, 0, 0], scale: [1.0, 1.0, 0.2], color: '#fbbf24', roughness: 0.3, metallic: 0.85 }
          ]
        });
      } else if (
        opts.responseMimeType === 'application/json' &&
        (String(opts.systemPrompt || '').includes('Godot 4.7.2') || promptText.includes('SOURCE ENGINE'))
      ) {
        content = JSON.stringify({
          projectName: 'PortedArenaGame',
          summary: '원본 스크립트를 Godot 4.7.2 CharacterBody3D 및 Area3D 시그널 구조로 자동 포팅했습니다.',
          files: [
            {
              path: 'project.godot',
              content: '; Engine configuration file.\nconfig_version=5\n\n[application]\nconfig/name="PortedArenaGame"\nrun/main_scene="res://scenes/main.tscn"\nconfig/features=PackedStringArray("4.7", "GL Compatibility")\n'
            },
            {
              path: 'scenes/main.tscn',
              content: '[gd_scene load_steps=2 format=3]\n\n[ext_resource type="Script" path="res://scripts/main.gd" id="1_main"]\n\n[node name="Main" type="Node3D"]\nscript = ExtResource("1_main")\n'
            },
            {
              path: 'scripts/main.gd',
              content: 'extends Node3D\n\n@export var move_speed: float = 7.0\n\nfunc _ready() -> void:\n\tprint("Ported Godot 4.7.2 Ready")\n'
            }
          ],
          parityNotes: ['물리 이동 루프를 _physics_process 기준으로 매핑했습니다.'],
          manualFollowUps: ['원본 애니메이션 리소스를 Godot AnimationPlayer에 연결하세요.']
        });
      } else if (promptText.includes('MeshRecipe') || String(opts.systemPrompt || '').includes('MeshRecipe')) {
        // Forge Blender llm-planner calls /api/agent-chat without responseMimeType
        content = JSON.stringify({
          name: 'ForgeSword',
          summary: 'Lowpoly sword generated via Hub-Agent',
          archetype: 'custom',
          style: 'lowpoly',
          dimensions: { width: 0.3, depth: 0.12, height: 1.5 },
          palette: { primary: '#cbd5e1', secondary: '#78350f', accent: '#38bdf8' },
          parts: [
            { name: 'blade', shape: 'box', position: [0, 0, 0.9], rotation: [0, 0, 0], scale: [0.16, 0.05, 1.2], color: '#cbd5e1', roughness: 0.25, metallic: 0.9 },
            { name: 'hilt', shape: 'cylinder', position: [0, 0, 0.15], rotation: [0, 0, 0], scale: [0.08, 0.08, 0.3], color: '#78350f', roughness: 0.8, metallic: 0.1 }
          ]
        });
      }

      if (opts.stream && typeof opts.onDelta === 'function') {
        const half = Math.ceil(content.length / 2);
        opts.onDelta(content.slice(0, half));
        opts.onDelta(content.slice(half));
      }

      return {
        authMode: isByok ? 'user_byok' : 'hub_managed',
        provider: isByok ? (opts.byok.provider || 'openai') : 'gemini-oauth',
        model,
        content,
        toolCalls: [],
        usage: { ...nextUsage }
      };
    },
    close() {}
  };
}

async function startTestEnv(t, { initiallyReady = true } = {}) {
  const { root, dataDir } = makeTempHubRoot();
  // Wednesday 2026-11-18 03:00:00 UTC (= 12:00:00 KST)
  let nowVal = Date.UTC(2026, 10, 18, 3, 0, 0);
  const now = () => nowVal;
  const advance = ms => { nowVal += ms; };

  const internalSecret = 'hub-agent-internal-secret-32chars-minimum-ok';
  const giftcardPepper = 'hub-agent-giftcard-pepper-32chars-minimum-ok';
  const mockProvider = createMockGeminiProvider({ initiallyReady });

  const origin = 'http://127.0.0.1:8080';
  const adminOrigin = 'http://127.0.0.1:8081';

  const app = createApp({
    dataDir,
    publicHost: '127.0.0.1',
    publicPort: 0,
    adminHost: '127.0.0.1',
    adminPort: 0,
    userOrigins: [origin],
    adminOrigins: [adminOrigin],
    userBaseUrl: origin,
    adminBaseUrl: adminOrigin,
    admin: { localAutoLogin: true },
    forge: { internalSecret },
    datastore: { internalSecret },
    billing: {
      enabled: true,
      allowMockProvider: true,
      allowDemoAccount: true,
      giftcardPepper,
      internalSecret
    }
  }, {
    rootDir: root,
    clock: now,
    hubAgentProvider: mockProvider
  });

  const addrs = await app.listen();
  t.after(async () => {
    await app.close();
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  const pubBase = `http://127.0.0.1:${addrs.public.port}`;
  const admBase = `http://127.0.0.1:${addrs.admin.port}`;

  async function req(url, { method = 'GET', cookie = '', csrf = '', headers = {}, body } = {}) {
    const h = { ...headers };
    if (cookie) h.Cookie = cookie;
    if (csrf) h['X-CSRF-Token'] = csrf;
    if (body !== undefined && !h['Content-Type']) h['Content-Type'] = 'application/json';
    const r = await fetch(url, {
      method,
      headers: h,
      body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body))
    });
    const text = await r.text();
    let jsonBody = null;
    try { jsonBody = text ? JSON.parse(text) : null; } catch {}
    return { status: r.status, res: r, body: jsonBody, raw: text };
  }

  let googleSubSeq = 0;
  async function createRegisteredUser({ attachGoogleIdentity = true, topupCoins = 0 } = {}) {
    const s = await req(`${pubBase}/api/session`, { headers: { Origin: origin } });
    const preCookie = `poc_public_session=${parseSetCookie(s.res, 'poc_public_session')}`;
    const r = await req(`${pubBase}/api/billing/demo-signin`, {
      method: 'POST',
      cookie: preCookie,
      csrf: s.body.csrfToken,
      headers: { Origin: origin },
      body: {}
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const pubToken = parseSetCookie(r.res, 'poc_public_session');
    const cookie = `poc_public_session=${pubToken}; poc_forge_session=${pubToken}`;
    const walletRes = await req(`${pubBase}/api/billing/wallet`, { cookie, headers: { Origin: origin } });
    const principalId = walletRes.body.wallet.principalId;

    if (attachGoogleIdentity) {
      googleSubSeq += 1;
      app.db.prepare('INSERT OR IGNORE INTO identities(provider, subject, user_id) VALUES(?, ?, ?)')
        .run('google', `google-sub-${googleSubSeq}-${principalId}`, principalId);
    }

    if (topupCoins > 0) {
      creditPromo(app.db, {
        principalId,
        coins: topupCoins,
        reason: 'test_seed',
        idempotencyKey: `seed-topup:${principalId}:${topupCoins}`,
        now
      });
    }

    return { cookie, csrf: r.body.csrfToken, principalId };
  }

  async function signInAdmin() {
    const admSess = await req(`${admBase}/api/admin/session`, { headers: { Origin: adminOrigin } });
    const admCookie = `poc_admin_session=${parseSetCookie(admSess.res, 'poc_admin_session')}`;
    const localUrl = app.issueLocalAdminLoginUrl();
    const localToken = new URL(localUrl).hash.split('#playhub-local-admin=')[1];
    const login = await req(`${admBase}/api/admin/local-login`, {
      method: 'POST',
      cookie: admCookie,
      csrf: admSess.body.csrfToken,
      headers: { Origin: adminOrigin },
      body: { token: localToken }
    });
    assert.equal(login.status, 200, JSON.stringify(login.body));
    return {
      cookie: `poc_admin_session=${parseSetCookie(login.res, 'poc_admin_session')}`,
      csrf: login.body.csrfToken
    };
  }

  return {
    app,
    root,
    pubBase,
    admBase,
    origin,
    adminOrigin,
    internalSecret,
    mockProvider,
    req,
    createRegisteredUser,
    signInAdmin,
    now,
    advance
  };
}

test('Free tier trial quota (0 PlayCoin), 3D GLB generation, Roblox/Unity/Unreal porting, 402 block on exhaustion, and PlayCoin overage deduction', async t => {
  const ctx = await startTestEnv(t);
  const admin = await ctx.signInAdmin();

  // Set compact Free trial quota = 6,000 weighted tokens, 2,000 weighted tokens = 1 PlayCoin
  const polRes = await ctx.req(`${ctx.admBase}/api/admin/hub-agent/policy`, {
    method: 'PUT',
    cookie: admin.cookie,
    csrf: admin.csrf,
    headers: { Origin: ctx.adminOrigin },
    body: {
      freeTrialTokens: 6000,
      proWeeklyTokens: 20000,
      tokensPerCoin: 2000,
      minCoinsPerCall: 1
    }
  });
  assert.equal(polRes.status, 200);
  assert.equal(polRes.body.policy.freeTrialTokens, 6000);

  // User starts with 0 PlayCoins on Free plan
  const user = await ctx.createRegisteredUser({ topupCoins: 0 });
  const initStatus = await ctx.req(`${ctx.pubBase}/api/hub-agent/status`, {
    cookie: user.cookie,
    headers: { Origin: ctx.origin }
  });
  assert.equal(initStatus.status, 200);
  assert.equal(initStatus.body.planTier, 'free');
  assert.equal(initStatus.body.wallet.available, 0);
  assert.equal(initStatus.body.quota.remainingTokens, 6000);

  // Each mock call uses input=1000 (x1.0) + output=250 (x4.0) = 2,000 weighted tokens!
  ctx.mockProvider.setUsage({ inputTokens: 1000, cachedTokens: 0, outputTokens: 250, thinkingTokens: 0, totalTokens: 1250 });

  // Call 1: Hub Built-in Chat -> consumes 2,000 / 6,000 Free trial tokens, 0 PlayCoins
  const chatRes = await ctx.req(`${ctx.pubBase}/api/hub-agent/chat`, {
    method: 'POST',
    cookie: user.cookie,
    csrf: user.csrf,
    headers: { Origin: ctx.origin },
    body: {
      messages: [{ role: 'user', content: 'Godot 4.7 CharacterBody3D 점프 예제 알려줘' }]
    }
  });
  assert.equal(chatRes.status, 200, JSON.stringify(chatRes.body));
  assert.equal(chatRes.body.billing.chargedCoins, 0);
  assert.equal(chatRes.body.tokenUsage.weightedTokens, 2000);
  assert.equal(chatRes.body.tokenUsage.quotaTokensUsed, 2000);
  assert.equal(chatRes.body.billing.quota.remainingTokens, 4000);

  // Call 2: 3D Modeling (.glb binary compilation) -> consumes 2,000 more Free trial tokens (remaining 2,000), 0 PlayCoins
  const modelRes = await ctx.req(`${ctx.pubBase}/api/hub-agent/modeling`, {
    method: 'POST',
    cookie: user.cookie,
    csrf: user.csrf,
    headers: { Origin: ctx.origin },
    body: {
      prompt: '마법 크리스탈 타워 오브젝트 만들어줘',
      style: 'stylized',
      name: 'CrystalTower'
    }
  });
  assert.equal(modelRes.status, 201, JSON.stringify(modelRes.body));
  assert.equal(modelRes.body.billing.chargedCoins, 0);
  assert.equal(modelRes.body.billing.quota.remainingTokens, 2000);
  assert.ok(modelRes.body.metrics.triangleCount > 20);
  assert.equal(modelRes.body.recipe.parts.length, 3);

  // Download generated .glb binary and verify glTF 2.0 header ("glTF" = 0x46546C67, version = 2)
  const glbRes = await fetch(`${ctx.pubBase}${modelRes.body.downloadUrl}`, {
    headers: { Cookie: user.cookie, Origin: ctx.origin }
  });
  assert.equal(glbRes.status, 200);
  assert.equal(glbRes.headers.get('content-type'), 'model/gltf-binary');
  const glbBytes = Buffer.from(await glbRes.arrayBuffer());
  assert.equal(glbBytes.readUInt32LE(0), 0x46546c67);
  assert.equal(glbBytes.readUInt32LE(4), 2);
  assert.equal(glbBytes.readUInt32LE(8), glbBytes.length);

  // Call 3: Project Porting (Unreal C++ with Marketplace asset warning -> Godot 4.7.2) -> consumes final 2,000 Free trial tokens (remaining 0), 0 PlayCoins
  const portRes = await ctx.req(`${ctx.pubBase}/api/hub-agent/porting`, {
    method: 'POST',
    cookie: user.cookie,
    csrf: user.csrf,
    headers: { Origin: ctx.origin },
    body: {
      sourceEngine: 'unreal',
      projectName: 'UnrealJumpPad',
      files: [
        { path: 'Source/JumpPadActor.h', content: 'class AJumpPad : public AActor { UPROPERTY() float Z = 900.f; };' },
        { path: 'Content/Marketplace/HeroPack.uasset', content: 'binary-placeholder' }
      ]
    }
  });
  assert.equal(portRes.status, 200, JSON.stringify(portRes.body));
  assert.equal(portRes.body.billing.chargedCoins, 0);
  assert.equal(portRes.body.billing.quota.remainingTokens, 0);
  assert.ok(portRes.body.files.some(f => f.path === 'project.godot'));
  assert.ok(portRes.body.files.some(f => f.path === 'scenes/main.tscn'));
  assert.ok(portRes.body.files.some(f => f.path === 'PORTING_REPORT.md'));
  assert.ok(portRes.body.eulaWarnings.length >= 1, 'Expected Unreal EULA asset warning');

  // Call 4: Free trial exhausted (0 remaining) AND wallet has 0 PlayCoin -> must return 402 INSUFFICIENT_PLAYCOIN!
  const blockedRes = await ctx.req(`${ctx.pubBase}/api/hub-agent/chat`, {
    method: 'POST',
    cookie: user.cookie,
    csrf: user.csrf,
    headers: { Origin: ctx.origin },
    body: {
      messages: [{ role: 'user', content: '추가 질문입니다' }]
    }
  });
  assert.equal(blockedRes.status, 402);
  assert.equal(blockedRes.body.error.code, 'INSUFFICIENT_PLAYCOIN');

  // Top up 20 PlayCoins into user's wallet, then run overage call using 5,000 weighted tokens -> ceil(5000 / 2000) = 3 PlayCoins deducted!
  creditPromo(ctx.app.db, {
    principalId: user.principalId,
    coins: 20,
    reason: 'overage_test',
    idempotencyKey: 'overage-topup-1',
    now: ctx.now
  });

  // input=1000 (1000) + cached=2000 (500) + output=875 (3500) = 5,000 weighted tokens -> 3 PlayCoins!
  ctx.mockProvider.setUsage({ inputTokens: 1000, cachedTokens: 2000, outputTokens: 875, thinkingTokens: 0, totalTokens: 3875 });
  const overageRes = await ctx.req(`${ctx.pubBase}/api/hub-agent/chat`, {
    method: 'POST',
    cookie: user.cookie,
    csrf: user.csrf,
    headers: { Origin: ctx.origin },
    body: {
      messages: [{ role: 'user', content: '멀티플레이 동기화 설계 알려줘' }]
    }
  });
  assert.equal(overageRes.status, 200, JSON.stringify(overageRes.body));
  assert.equal(overageRes.body.tokenUsage.weightedTokens, 5000);
  assert.equal(overageRes.body.tokenUsage.quotaTokensUsed, 0);
  assert.equal(overageRes.body.tokenUsage.overageTokens, 5000);
  assert.equal(overageRes.body.billing.chargedCoins, 3);
  assert.equal(overageRes.body.billing.wallet.available, 17);
  assert.equal(overageRes.body.billing.wallet.reserved, 0);

  const integrity = verifyLedgerIntegrity(ctx.app.db);
  assert.equal(integrity.ok, true, JSON.stringify(integrity));
});

test('Pro subscription weekly token allowance, partial overage billing, and automatic Monday 00:00 KST reset', async t => {
  const ctx = await startTestEnv(t);
  const admin = await ctx.signInAdmin();

  await ctx.req(`${ctx.admBase}/api/admin/hub-agent/policy`, {
    method: 'PUT',
    cookie: admin.cookie,
    csrf: admin.csrf,
    headers: { Origin: ctx.adminOrigin },
    body: {
      freeTrialTokens: 1000,
      proWeeklyTokens: 5000,
      tokensPerCoin: 2000,
      minCoinsPerCall: 1
    }
  });

  const user = await ctx.createRegisteredUser({ topupCoins: 15 });

  // Activate Pro subscription for 30 days
  const startStamp = ctx.now();
  upsertSubscription(ctx.app.db, {
    principalId: user.principalId,
    planTier: 'pro',
    status: 'ACTIVE',
    provider: 'mock',
    providerSubscriptionId: 'sub_pro_weekly_1',
    currentPeriodStart: startStamp,
    currentPeriodEnd: startStamp + 30 * 86400_000,
    now: ctx.now
  });

  const week1 = currentKstWeekWindow(ctx.now());

  // Call 1: 3,000 weighted tokens (input=1000 + output=500*4=2000) -> 100% covered by Pro weekly quota (0 PlayCoin)
  ctx.mockProvider.setUsage({ inputTokens: 1000, cachedTokens: 0, outputTokens: 500, thinkingTokens: 0, totalTokens: 1500 });
  const call1 = await ctx.req(`${ctx.pubBase}/api/hub-agent/chat`, {
    method: 'POST',
    cookie: user.cookie,
    csrf: user.csrf,
    headers: { Origin: ctx.origin },
    body: { messages: [{ role: 'user', content: 'Pro 주간 쿼터 테스트 1' }] }
  });
  assert.equal(call1.status, 200);
  assert.equal(call1.body.billing.planTier, 'pro');
  assert.equal(call1.body.billing.chargedCoins, 0);
  assert.equal(call1.body.billing.quota.remainingTokens, 2000);
  assert.equal(call1.body.billing.wallet.available, 15);

  // Call 2: 5,000 weighted tokens (input=1000 + output=1000*4=4000) -> 2,000 covered by remaining Pro weekly quota + 3,000 overage -> ceil(3000/2000) = 2 PlayCoins!
  ctx.mockProvider.setUsage({ inputTokens: 1000, cachedTokens: 0, outputTokens: 1000, thinkingTokens: 0, totalTokens: 2000 });
  const call2 = await ctx.req(`${ctx.pubBase}/api/hub-agent/chat`, {
    method: 'POST',
    cookie: user.cookie,
    csrf: user.csrf,
    headers: { Origin: ctx.origin },
    body: { messages: [{ role: 'user', content: 'Pro 주간 부분 초과 테스트 2' }] }
  });
  assert.equal(call2.status, 200);
  assert.equal(call2.body.tokenUsage.weightedTokens, 5000);
  assert.equal(call2.body.tokenUsage.quotaTokensUsed, 2000);
  assert.equal(call2.body.tokenUsage.overageTokens, 3000);
  assert.equal(call2.body.billing.chargedCoins, 2);
  assert.equal(call2.body.billing.quota.remainingTokens, 0);
  assert.equal(call2.body.billing.wallet.available, 13);

  // Advance clock past next Monday 00:00:00 KST -> Pro weekly quota automatically resets to full 5,000!
  const msToNextMonday = (week1.nextResetMs - ctx.now()) + 60_000;
  ctx.advance(msToNextMonday);

  const statusNextWeek = await ctx.req(`${ctx.pubBase}/api/hub-agent/status`, {
    cookie: user.cookie,
    headers: { Origin: ctx.origin }
  });
  assert.equal(statusNextWeek.status, 200);
  assert.notEqual(statusNextWeek.body.quota.weekKey, week1.weekKey);
  assert.equal(statusNextWeek.body.quota.usedTokens, 0);
  assert.equal(statusNextWeek.body.quota.remainingTokens, 5000);

  // Call in new week: 2,000 weighted tokens -> 0 PlayCoins charged again!
  ctx.mockProvider.setUsage({ inputTokens: 1000, cachedTokens: 0, outputTokens: 250, thinkingTokens: 0, totalTokens: 1250 });
  const callNewWeek = await ctx.req(`${ctx.pubBase}/api/hub-agent/chat`, {
    method: 'POST',
    cookie: user.cookie,
    csrf: user.csrf,
    headers: { Origin: ctx.origin },
    body: { messages: [{ role: 'user', content: '새 주간 리셋 후 호출' }] }
  });
  assert.equal(callNewWeek.status, 200);
  assert.equal(callNewWeek.body.billing.chargedCoins, 0);
  assert.equal(callNewWeek.body.billing.wallet.available, 13);
  assert.equal(callNewWeek.body.billing.quota.remainingTokens, 3000);
  assert.equal(verifyLedgerIntegrity(ctx.app.db).ok, true);
});

test('User BYOK deducts 0 quota & 0 PlayCoin, and upstream LLM failure releases PlayCoin hold cleanly', async t => {
  const ctx = await startTestEnv(t);
  const admin = await ctx.signInAdmin();

  // Set Free trial = 0 so every managed call immediately reserves a PlayCoin hold
  await ctx.req(`${ctx.admBase}/api/admin/hub-agent/policy`, {
    method: 'PUT',
    cookie: admin.cookie,
    csrf: admin.csrf,
    headers: { Origin: ctx.adminOrigin },
    body: { freeTrialTokens: 0, tokensPerCoin: 2000 }
  });

  const user = await ctx.createRegisteredUser({ topupCoins: 10 });

  // 1. User BYOK call: even with freeTrialTokens=0, deducts 0 PlayCoins!
  ctx.mockProvider.setUsage({ inputTokens: 4000, cachedTokens: 0, outputTokens: 1000, thinkingTokens: 0, totalTokens: 5000 });
  const byokRes = await ctx.req(`${ctx.pubBase}/api/hub-agent/chat`, {
    method: 'POST',
    cookie: user.cookie,
    csrf: user.csrf,
    headers: { Origin: ctx.origin },
    body: {
      messages: [{ role: 'user', content: '내 개인 API 키로 질문' }],
      byok: { provider: 'gemini', apiKey: 'AIzaSyUserPersonalKey1234567890' }
    }
  });
  assert.equal(byokRes.status, 200);
  assert.equal(byokRes.body.billing.authMode, 'user_byok');
  assert.equal(byokRes.body.billing.chargedCoins, 0);
  assert.equal(getWallet(ctx.app.db, user.principalId, ctx.now).available, 10);

  // 2. Managed call fails upstream -> reserved hold must be released immediately (available stays 10, reserved stays 0)
  ctx.mockProvider.setNextFailure(Object.assign(new Error('Upstream Gemini 503'), { status: 502 }));
  const failRes = await ctx.req(`${ctx.pubBase}/api/hub-agent/chat`, {
    method: 'POST',
    cookie: user.cookie,
    csrf: user.csrf,
    headers: { Origin: ctx.origin },
    body: { messages: [{ role: 'user', content: '업스트림 실패 시 홀드 해제 검증' }] }
  });
  assert.equal(failRes.status, 502);

  const walletAfterFail = getWallet(ctx.app.db, user.principalId, ctx.now);
  assert.equal(walletAfterFail.available, 10);
  assert.equal(walletAfterFail.reserved, 0);
  assert.equal(verifyLedgerIntegrity(ctx.app.db).ok, true);

  // 3. Admin API key connect / smoke test / disconnect check
  const connectKey = await ctx.req(`${ctx.admBase}/api/admin/hub-agent/connect/apikey`, {
    method: 'POST',
    cookie: admin.cookie,
    csrf: admin.csrf,
    headers: { Origin: ctx.adminOrigin },
    body: { apiKey: 'AIzaSyOperatorManagedKey9876543210', defaultModel: 'gemini-2.5-flash' }
  });
  assert.equal(connectKey.status, 200);
  assert.equal(connectKey.body.status.apiKey.connected, true);
  assert.ok(!JSON.stringify(connectKey.body).includes('9876543210'), 'Full secret must not leak');

  const smoke = await ctx.req(`${ctx.admBase}/api/admin/hub-agent/test`, {
    method: 'POST',
    cookie: admin.cookie,
    csrf: admin.csrf,
    headers: { Origin: ctx.adminOrigin },
    body: { prompt: '연결 점검' }
  });
  assert.equal(smoke.status, 200);
  assert.equal(smoke.body.ok, true);
});

test('PlayForge E2E bridge: Forge AI Chat (JSON + NDJSON stream), Blender 3D planner, Project Porting -> PlayForge project, and per-user BYOK isolation', async t => {
  const ctx = await startTestEnv(t);
  const admin = await ctx.signInAdmin();

  // Set Free trial = 2,000 weighted tokens so User A's 1st Forge call uses Free trial (0 coin) and 2nd+ calls deduct PlayCoins
  await ctx.req(`${ctx.admBase}/api/admin/hub-agent/policy`, {
    method: 'PUT',
    cookie: admin.cookie,
    csrf: admin.csrf,
    headers: { Origin: ctx.adminOrigin },
    body: { freeTrialTokens: 2000, tokensPerCoin: 2000, minCoinsPerCall: 1 }
  });

  const forgeTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'playforge-agent-e2e-'));
  const forgeOrigin = 'http://127.0.0.1:18095';

  let byokUpstreamCalls = 0;
  const realFetch = globalThis.fetch;
  const forgeFetch = async (url, init) => {
    const u = String(url);
    if (u.startsWith('https://api.openai.com/')) {
      byokUpstreamCalls += 1;
      return new Response(JSON.stringify({
        choices: [{ message: { role: 'assistant', content: 'OpenAI BYOK 개인 계정 응답입니다.' } }]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return realFetch(url, init);
  };

  const forgeSrv = createForgeServer({
    root: FORGE_ROOT,
    buildDirectory: path.join(forgeTmp, 'builds'),
    blenderJobsDirectory: path.join(forgeTmp, 'blender-jobs'),
    publicOrigin: [forgeOrigin, ctx.origin],
    hubAgentFetch: forgeFetch,
    hubAuth: {
      verifyUrl: `${ctx.admBase}/internal/session/verify`,
      internalSecret: ctx.internalSecret,
      loginUrl: `${ctx.origin}/`,
      accountsDirectory: path.join(forgeTmp, 'accounts'),
      studioDirectory: path.join(forgeTmp, 'studios')
    }
  });

  await new Promise((resolve, reject) => {
    forgeSrv.once('error', reject);
    forgeSrv.listen(0, '127.0.0.1', () => resolve());
  });
  const forgePort = forgeSrv.address().port;
  const forgeBase = `http://127.0.0.1:${forgePort}`;

  t.after(async () => {
    forgeSrv.shutdown();
    await new Promise(resolve => forgeSrv.once('close', resolve));
    fs.rmSync(forgeTmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  const userA = await ctx.createRegisteredUser({ attachGoogleIdentity: true, topupCoins: 10 });
  const userB = await ctx.createRegisteredUser({ attachGoogleIdentity: true, topupCoins: 10 });

  async function forgeReq(pathname, user, { method = 'GET', body } = {}) {
    const headers = {
      Origin: forgeOrigin,
      Cookie: user.cookie,
      'X-CSRF-Token': user.csrf
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const r = await fetch(`${forgeBase}${pathname}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await r.text();
    let jsonBody = null;
    try { jsonBody = text ? JSON.parse(text) : null; } catch {}
    return { status: r.status, body: jsonBody, raw: text };
  }

  // 1. Provider discovery in Forge shows PlayHub Built-in Gemini (`gemini-connect`) connected!
  const provA = await forgeReq('/api/agent-chat/providers', userA);
  assert.equal(provA.status, 200, provA.raw);
  const geminiEntry = provA.body.providers.find(p => p.id === 'gemini-connect');
  assert.equal(geminiEntry.configured, true);
  assert.equal(geminiEntry.auth, 'connected');

  // Verify Godot Editor addon adaptation sets default provider to gemini-connect
  const addonRes = await forgeReq('/api/platform-addon/agent-chat', userA);
  assert.equal(addonRes.status, 200);
  assert.ok(addonRes.body.files['chat_settings.gd'].includes('var provider := "gemini-connect"'));

  // Each call = 2,000 weighted tokens
  ctx.mockProvider.setUsage({ inputTokens: 1000, cachedTokens: 0, outputTokens: 250, thinkingTokens: 0, totalTokens: 1250 });

  // 2. Forge AI Chat NDJSON stream (1st call for User A -> covered by 2,000 Free trial tokens, 0 PlayCoin)
  const streamRes = await forgeReq('/api/agent-chat', userA, {
    method: 'POST',
    body: {
      provider: 'gemini-connect',
      stream: true,
      messages: [{ role: 'user', content: 'Forge AI 채팅 스트리밍 테스트' }]
    }
  });
  assert.equal(streamRes.status, 200);
  const frames = streamRes.raw.trim().split('\n').map(line => JSON.parse(line));
  const finalFrame = frames.find(f => f.type === 'final');
  assert.ok(finalFrame, 'Expected final NDJSON frame');
  assert.equal(finalFrame.billing.chargedCoins, 0);
  assert.ok(finalFrame.message.content.includes('Free 체험 한도 적용'));

  // 3. Forge Blender Studio AI 3D Modeling Plan (`/api/blender/plan`) -> Free trial exhausted, deducts 1 PlayCoin (10 -> 9)!
  const blenderPlan = await forgeReq('/api/blender/plan', userA, {
    method: 'POST',
    body: {
      prompt: '중세 로우폴리 검 에셋 만들어줘',
      aiProvider: 'gemini-connect'
    }
  });
  assert.equal(blenderPlan.status, 200, blenderPlan.raw);
  assert.equal(blenderPlan.body.ok, true);
  assert.equal(blenderPlan.body.recipe.name, 'ForgeSword');
  assert.equal(getWallet(ctx.app.db, userA.principalId, ctx.now).available, 9);

  // 4. Forge Project Porting (`/api/porting/convert` with `createNewProject: true`) -> creates Godot 4.7.2 project in Forge & deducts 1 PlayCoin (9 -> 8)!
  const portingRes = await forgeReq('/api/porting/convert', userA, {
    method: 'POST',
    body: {
      sourceEngine: 'unity',
      projectName: 'PortedArenaGame',
      sourceCode: 'using UnityEngine; public class Mover : MonoBehaviour { void FixedUpdate() {} }',
      createNewProject: true
    }
  });
  assert.equal(portingRes.status, 200, portingRes.raw);
  assert.equal(portingRes.body.ok, true);
  assert.ok(portingRes.body.savedProject?.id, 'Expected newly created PlayForge project');
  assert.equal(getWallet(ctx.app.db, userA.principalId, ctx.now).available, 8);

  // Verify the ported files exist inside User A's PlayForge workspace!
  const createdProj = await forgeReq(`/api/platform/projects/${portingRes.body.savedProject.id}`, userA);
  assert.equal(createdProj.status, 200);
  const mainGd = createdProj.body.files.find(f => f.path === 'scripts/main.gd');
  assert.ok(mainGd?.content.includes('Ported Godot 4.7.2 Ready'));

  // 5. User A connects personal OpenAI BYOK key -> strictly isolated from User B, and deducts 0 PlayCoins!
  const connectByokA = await forgeReq('/api/agent-chat/providers/connect', userA, {
    method: 'POST',
    body: {
      provider: 'openai-api',
      api_key: 'sk-userA-personal-key-1234567890',
      model: 'gpt-5.4-mini'
    }
  });
  assert.equal(connectByokA.status, 200);
  assert.equal(connectByokA.body.providers.find(p => p.id === 'openai-api').configured, true);

  // User B must NOT see User A's connected key!
  const provB = await forgeReq('/api/agent-chat/providers', userB);
  assert.equal(provB.body.providers.find(p => p.id === 'openai-api').configured, false);

  // User A chats with personal BYOK -> 0 PlayCoins deducted (balance remains 8)!
  const byokChatA = await forgeReq('/api/agent-chat', userA, {
    method: 'POST',
    body: {
      provider: 'openai-api',
      messages: [{ role: 'user', content: '개인 OpenAI 키로 질문' }]
    }
  });
  assert.equal(byokChatA.status, 200, byokChatA.raw);
  assert.equal(byokChatA.body.billing.authMode, 'user_byok');
  assert.equal(byokChatA.body.billing.chargedCoins, 0);
  assert.equal(byokUpstreamCalls, 1);
  assert.equal(getWallet(ctx.app.db, userA.principalId, ctx.now).available, 8);
  assert.equal(verifyLedgerIntegrity(ctx.app.db).ok, true);
});
