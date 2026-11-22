import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_CATALOG_PATH,
  NO_AI_DISCLOSURE,
  buildHybridIndex,
  deserializeIndex,
  expandBilingualTerms,
  loadCatalog,
  searchHybrid,
  serializeIndex,
} from '../../tools/ai-supply/semantic-store/indexer.mjs';
import {
  DEFAULT_ROLE_ORDER,
  aggregateThirdPartyNotices,
  planSceneKitbash,
} from '../../tools/ai-supply/semantic-store/kitbasher.mjs';
import {
  RLVR_REWARD_WEIGHTS,
  applyDeterministicGdscriptRepairs,
  computeRlvrReward,
  runBoundedRepairLoop,
} from '../../tools/ai-supply/rlvr-porting/verifier.mjs';
import {
  DATASTORE_SCOPE_RE,
  extractMarketplaceRefsFromSource,
  generateCommerceManifest,
  rewriteRobloxXGradeSnippet,
  slugifyDataStoreScope,
} from '../../tools/ai-supply/rlvr-porting/roblox-xgrade-bridge.mjs';
import {
  ASSET_BUDGET_LIMITS,
  RIG_REQUIRED_CORE_BONES,
  createSyntheticGlbBuffer,
  inspectGlbBuffer,
  inspectGlbFile,
  validateAssetBudget,
} from '../../tools/ai-supply/avatar-factory/glb-budget-gate.mjs';
import {
  CANONICAL_SLOTS,
  DEFAULT_AVATAR_CATALOG_PATH,
  VLM_CRITIQUE_RUBRIC,
  computeCanonicalAttachmentChecks,
  loadAvatarRigProfiles,
  scoreVlmCritique,
  verifyRigSocketScaleCompensation,
} from '../../tools/ai-supply/avatar-factory/socket-normalizer.mjs';

const REPO_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const AVATAR_ASSETS_DIR = join(REPO_ROOT, 'forge/Godot/addons/playforge_avatar/assets');

// ============================================================================
// N4 — 11,826 Open Asset Bilingual Hybrid Search, Kitbashing & Notices
// ============================================================================
describe('N4 — Semantic Store (Real 11,826-item Catalog)', () => {
  const { items: realItems } = loadCatalog(DEFAULT_CATALOG_PATH);
  const fullIndex = buildHybridIndex(realItems);

  it('loads all 11,826 real catalog items and builds hybrid index cleanly', () => {
    assert.equal(realItems.length, 11826);
    assert.equal(fullIndex.n, 11826);
    assert.ok(fullIndex.vocabularySize > 5000, `Expected >5000 terms, got ${fullIndex.vocabularySize}`);
    assert.equal(fullIndex.denseMatrix.length, 11826 * fullIndex.dim);
  });

  it('expands bilingual KO<->EN game-dev domain lexicon bidirectionally', () => {
    const koExp = expandBilingualTerms(['사이버펑크', '돌', '바닥', '기사']);
    assert.ok(koExp.expanded.includes('cyberpunk'));
    assert.ok(koExp.expanded.includes('stone'));
    assert.ok(koExp.expanded.includes('floor'));
    assert.ok(koExp.expanded.includes('knight'));

    const enExp = expandBilingualTerms(['medieval', 'wood', 'audio']);
    assert.ok(enExp.expanded.includes('중세'));
    assert.ok(enExp.expanded.includes('나무'));
    assert.ok(enExp.expanded.includes('효과음'));
  });

  it('round-trips index serialization/deserialization without losing search rankings', () => {
    const sample = realItems.slice(0, 250);
    const smallIndex = buildHybridIndex(sample);
    const serialized = serializeIndex(smallIndex);
    const restored = deserializeIndex(serialized, sample);

    const a = searchHybrid(smallIndex, { query: '기사 캐릭터', limit: 5 });
    const b = searchHybrid(restored, { query: '기사 캐릭터', limit: 5 });
    assert.equal(a.results.length, b.results.length);
    assert.deepEqual(
      a.results.map((r) => r.asset_id),
      b.results.map((r) => r.asset_id)
    );
  });

  it('achieves P95 query latency < 50ms and 100% No-AI compliance across 20 bilingual queries', () => {
    const queries = [
      '비 오는 중세 판타지 돌바닥',
      '사이버펑크 네온 골목',
      '나무 숲 목재 바닥',
      '밤 하늘 조명 스카이박스',
      '아이콘 UI 버튼',
      '효과음 타격음 오디오',
      '기사 모험가 캐릭터',
      '물 바다 젖은 표면',
      '금속 강철 녹슨 벽',
      '중세 성 벽돌',
      'medieval stone cobblestone floor',
      'cyberpunk neon street alley',
      'forest wood bark tree',
      'night sky hdri lighting',
      'fantasy rpg ui icon',
      'retro game audio sfx',
      'knight adventurer character 3d',
      'rusted metal steel industrial',
      'godot 3d camera shader addon',
      'desert sand terrain ground',
    ];

    // Warm-up 2 queries for V8 JIT stabilization
    searchHybrid(fullIndex, { query: queries[0], limit: 10 });
    searchHybrid(fullIndex, { query: queries[10], limit: 10 });

    const latencies = [];
    let totalChecked = 0;

    for (const q of queries) {
      const res = searchHybrid(fullIndex, {
        query: q,
        limit: 10,
        noAiOnly: true,
        excludeExternalOnly: true,
      });
      latencies.push(res.tookMs);
      assert.ok(res.results.length > 0, `Expected results for query "${q}"`);
      for (const hit of res.results) {
        totalChecked++;
        assert.equal(hit.ai_disclosure, NO_AI_DISCLOSURE, `Non-compliant item ${hit.asset_id} leaked`);
        assert.notEqual(hit.license_tier, 'tier4_external_only', `External-only item ${hit.asset_id} leaked`);
      }
    }

    latencies.sort((a, b) => a - b);
    const p95Index = Math.min(latencies.length - 1, Math.ceil(latencies.length * 0.95) - 1);
    const p95 = latencies[p95Index];

    assert.ok(totalChecked >= 150);
    assert.ok(p95 < 50, `Expected P95 latency < 50ms, got ${p95.toFixed(2)}ms (all: ${latencies.join(', ')})`);

    // Spot-check cross-lingual KO->EN relevance
    const stoneFloor = searchHybrid(fullIndex, {
      query: '비 오는 중세 판타지 돌바닥',
      categories: ['PBR 텍스처 · 머티리얼'],
      limit: 5,
    });
    assert.ok(
      stoneFloor.results.some((r) => /stone|paving|cobble|tile|brick|rock/i.test(r.title)),
      `Expected stone/paving PBR result in top 5, got: ${stoneFloor.results.map((r) => r.title).join(', ')}`
    );

    // Spot-check faceted filters: CC0-only + local bundle
    const localCc0 = searchHybrid(fullIndex, {
      query: '기사 캐릭터',
      licenseTiers: ['tier1_cc0'],
      hasLocalBundleOnly: true,
      limit: 10,
    });
    assert.ok(localCc0.results.length >= 1);
    assert.ok(localCc0.results.every((r) => r.license_tier === 'tier1_cc0' && r.hasLocalBundle === true));
  });

  it('plans a multi-role 3D scene kitbash with hydration flags and deduplicated Third-Party Notices', () => {
    const plan = planSceneKitbash(fullIndex, {
      prompt: '사이버펑크 네온 골목 아레나',
      maxPerRole: 3,
      noAiOnly: true,
      licenseTiers: ['tier1_cc0', 'tier2_attribution'],
    });

    assert.equal(plan.complianceSummary.noAiComplianceRate, 1);
    assert.equal(plan.complianceSummary.totalAssets, DEFAULT_ROLE_ORDER.length * 3);

    for (const roleId of DEFAULT_ROLE_ORDER) {
      assert.ok(plan.roles[roleId], `Missing role ${roleId}`);
      assert.equal(plan.roles[roleId].count, 3, `Expected 3 items for role ${roleId}`);
      for (const asset of plan.roles[roleId].assets) {
        assert.equal(asset.ai_disclosure, NO_AI_DISCLOSURE);
        assert.ok(['tier1_cc0', 'tier2_attribution'].includes(asset.license_tier));
        assert.equal(typeof asset.hasLocalBundle, 'boolean');
        assert.equal(typeof asset.needsExternalHydration, 'boolean');
        assert.ok(['local_bundle', 'r2_cas_hydrate', 'external_link_only'].includes(asset.hydrationStrategy));
      }
    }

    assert.ok(plan.thirdPartyNoticesTxt.includes('THIRD-PARTY NOTICES'));
    assert.ok(plan.creditsMd.includes('# Third-Party Asset Credits'));
    assert.equal(plan.notices.uniqueCount, plan.complianceSummary.totalAssets);
    assert.equal(plan.notices.duplicateCount, 0);
  });

  it('deduplicates repeated assets and identical notices in aggregateThirdPartyNotices', () => {
    const sampleA = realItems[0];
    const sampleB = realItems[100];
    const dupByNotice = {
      ...sampleA,
      asset_id: 'duplicate-notice-alias',
    };
    const aggregated = aggregateThirdPartyNotices([sampleA, sampleB, sampleA, dupByNotice], {
      projectName: 'Dedup Test Scene',
    });

    assert.equal(aggregated.uniqueCount, 2);
    assert.equal(aggregated.duplicateCount, 2);
    assert.ok(aggregated.thirdPartyNoticesTxt.includes('Total Unique Open Assets: 2 (Deduplicated: 2)'));
    assert.ok(aggregated.creditsMd.includes('No-AI Verified'));
  });

  it('supports CLI --query and --kitbash --json modes', () => {
    const cliPath = join(REPO_ROOT, 'tools/ai-supply/semantic-store/cli.mjs');
    const qOut = execFileSync(process.execPath, [cliPath, '--query', '돌바닥', '--limit', '3', '--json'], {
      encoding: 'utf8',
    });
    const qParsed = JSON.parse(qOut);
    assert.equal(qParsed.indexSize, 11826);
    assert.equal(qParsed.results.length, 3);

    const kOut = execFileSync(process.execPath, [cliPath, '--kitbash', '중세 던전', '--max-per-role', '1', '--json'], {
      encoding: 'utf8',
    });
    const kParsed = JSON.parse(kOut);
    assert.equal(kParsed.complianceSummary.totalAssets, 6);
    assert.equal(kParsed.complianceSummary.noAiComplianceRate, 1);
  });
});

// ============================================================================
// N1 — RLVR Reward Verifier, Bounded Repair Loop & Roblox X-Grade Bridge
// ============================================================================
describe('N1 — RLVR Porting Verifier & Roblox X-Grade Bridge', () => {
  it('computes exact RLVR reward formula with clamping and diagnostic breakdown', () => {
    assert.deepEqual(RLVR_REWARD_WEIGHTS, { parse: 0.25, transpile: 0.2, runtime: 0.35, visual: 0.2 });

    // Perfect score
    const perfect = computeRlvrReward({
      staticErrors: 0,
      checkedScripts: 10,
      todoFallbackLines: 0,
      totalCodeLines: 200,
      runtimePassed: 8,
      runtimeTotal: 8,
      pixelGatePass: true,
    });
    assert.equal(perfect.reward, 1);
    assert.equal(perfect.diagnostics.passedAllGates, true);
    assert.deepEqual(perfect.diagnostics.failedGates, []);

    // Partial exact weighted calculation:
    // rParse = 1 - 2/10 = 0.8 -> 0.25*0.8 = 0.20
    // rTranspile = 1 - 50/200 = 0.75 -> 0.20*0.75 = 0.15
    // rRuntime = 3/6 = 0.5 -> 0.35*0.5 = 0.175
    // rVisual = 0 -> 0
    // Total = 0.525
    const partial = computeRlvrReward({
      staticErrors: 2,
      checkedScripts: 10,
      todoFallbackLines: 50,
      totalCodeLines: 200,
      runtimePassed: 3,
      runtimeTotal: 6,
      pixelGatePass: false,
    });
    assert.equal(partial.reward, 0.525);
    assert.equal(partial.components.rParse, 0.8);
    assert.equal(partial.components.rTranspile, 0.75);
    assert.equal(partial.components.rRuntime, 0.5);
    assert.equal(partial.components.rVisual, 0);
    assert.deepEqual(partial.diagnostics.failedGates, ['parse', 'transpile', 'runtime', 'visual']);

    // Clamping when staticErrors > checkedScripts or todoFallbackLines > totalCodeLines
    const clamped = computeRlvrReward({
      staticErrors: 50,
      checkedScripts: 4,
      todoFallbackLines: 999,
      totalCodeLines: 100,
      runtimePassed: 10,
      runtimeTotal: 5,
      pixelGatePass: true,
    });
    assert.equal(clamped.components.rParse, 0);
    assert.equal(clamped.components.rTranspile, 0);
    assert.equal(clamped.components.rRuntime, 1);
    assert.equal(clamped.components.rVisual, 1);
    assert.equal(clamped.reward, 0.55);
  });

  it('runs deterministic Stage A + bounded K=4 Stage B repair loop and logs RLVR/GRPO JSONL trajectories', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'rlvr-supply-test-'));
    const logPath = join(tmpDir, 'trajectories.jsonl');

    try {
      const brokenInitial = [
        'func test():',
        '  var player := root.get_node("Player")',
        '  if hp ~= 0:',
        '    # TODO_STUB_A',
        '    # TODO_STUB_B',
      ].join('\n');

      const evaluateOracle = (code) => {
        const staticErrors = (code.includes(':=') ? 1 : 0) + (code.includes('~=') ? 1 : 0);
        const todoFallbackLines = (code.match(/TODO_STUB/g) || []).length;
        const runtimePassed = todoFallbackLines === 0 && staticErrors === 0 ? 4 : Math.max(0, 2 - todoFallbackLines);
        const pixelGatePass = runtimePassed === 4 && code.includes('VISUAL_OK');
        return computeRlvrReward({
          staticErrors,
          checkedScripts: 2,
          todoFallbackLines,
          totalCodeLines: 4,
          runtimePassed,
          runtimeTotal: 4,
          pixelGatePass,
        });
      };

      const proposeCandidates = ({ iteration, currentCode, kCandidates }) => {
        assert.equal(kCandidates, 4);
        if (iteration === 1) {
          return [
            currentCode, // no-op
            currentCode.replace('# TODO_STUB_A', 'pass'), // partial
            currentCode.replace('# TODO_STUB_A', 'pass').replace('# TODO_STUB_B', 'pass'), // fixes runtime
            currentCode + '\n# broken ~=', // regression
          ];
        }
        return [
          currentCode,
          currentCode + '\n# VISUAL_OK', // converges to 1.0
          currentCode + '\n# noop',
          currentCode + '\n# TODO_STUB_C',
        ];
      };

      const result = await runBoundedRepairLoop({
        initialCandidate: brokenInitial,
        evaluateOracle,
        proposeCandidates,
        applyDeterministicRepair: applyDeterministicGdscriptRepairs,
        promptContext: { sourceEngine: 'roblox', script: 'player_controller.gd' },
        maxIterations: 3,
        kCandidates: 4,
        targetReward: 0.99,
        trajectoryLogPath: logPath,
      });

      assert.equal(result.stageAImproved, true);
      assert.ok(result.stageARules.includes('FIX_GDSCRIPT_TYPE_INFERENCE'));
      assert.ok(result.stageARules.includes('FIX_LUAU_NOT_EQUAL'));
      assert.equal(result.converged, true);
      assert.equal(result.iterationsRun, 2);
      assert.equal(result.bestReward, 1);
      assert.ok(result.bestReward > result.initialReward);

      const lines = readFileSync(logPath, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
      assert.equal(lines.length, 2);
      assert.equal(lines[0].iteration, 1);
      assert.equal(lines[0].candidates.length, 4);
      assert.equal(lines[0].bestIndex, 2);
      assert.equal(lines[1].iteration, 2);
      assert.equal(lines[1].bestIndex, 1);
      assert.equal(lines[1].bestReward, 1);
      assert.equal(typeof lines[0].candidates[0].advantage, 'number');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('slugifies arbitrary Roblox DataStore names into collision-safe SCOPE_RE compliant scopes', () => {
    const cases = [
      'player_data',
      'PlayerData_v2',
      'Player Data!',
      'Player Data?',
      '---LeadingHyphens---',
      '유저데이터1',
      '유저데이터2',
      '',
      'A_Very_Long_Roblox_DataStore_Name_That_Exceeds_Thirty_Two_Characters_Easily',
    ];

    const outputs = new Map();
    for (const raw of cases) {
      const slug = slugifyDataStoreScope(raw);
      assert.match(slug, DATASTORE_SCOPE_RE, `Scope "${slug}" from "${raw}" violates SCOPE_RE`);
      assert.ok(slug.length <= 32, `Scope "${slug}" exceeds 32 chars`);
      // Determinism
      assert.equal(slug, slugifyDataStoreScope(raw));
      outputs.set(raw, slug);
    }

    // Already-valid canonical scope preserved cleanly
    assert.equal(outputs.get('player_data'), 'player_data');
    // Collision safety between distinct raw inputs with identical ASCII stem
    assert.notEqual(outputs.get('Player Data!'), outputs.get('Player Data?'));
    assert.notEqual(outputs.get('유저데이터1'), outputs.get('유저데이터2'));
  });

  it('generates Track B 0%-fee commerce_manifest.json and rewrites X-Grade DataStore & Marketplace snippets', () => {
    const luauSnippet = `
      local ds = DataStoreService:GetDataStore("Player Inventory v2!")
      local lb = DataStoreService:GetOrderedDataStore("Weekly Coins Board")
      local saved = ds:GetAsync("u_1001")
      ds:SetAsync("u_1001", saved)
      ds:UpdateAsync("u_1001", transform_fn)
      local ownsVip = MarketplaceService:UserOwnsGamePassAsync(player.UserId, 88442211)
      MarketplaceService:PromptGamePassPurchase(player, 88442211)
      MarketplaceService:PromptProductPurchase(player, 99553322)
      MarketplaceService.ProcessReceipt = handle_receipt
    `;

    const rewritten = rewriteRobloxXGradeSnippet(luauSnippet, {
      gameId: 'roblox-obby-port',
      casMaxRetries: 3,
      bindPrincipalId: true,
    });

    assert.equal(rewritten.hasAsyncCalls, true);
    assert.equal(rewritten.discoveredScopes.length, 2);
    for (const sc of rewritten.discoveredScopes) {
      assert.match(sc.scope, DATASTORE_SCOPE_RE);
    }

    assert.ok(rewritten.code.includes('PlayHubDataStore.open_scope('));
    assert.ok(rewritten.code.includes('PlayHubLeaderboard.open_board('));
    assert.ok(rewritten.code.includes('await ds.get_async("u_1001")'));
    assert.ok(rewritten.code.includes('await ds.set_async("u_1001", saved)'));
    assert.ok(rewritten.code.includes('await ds.update_async("u_1001", transform_fn, {"max_retries": 3, "cas_mode": "expected_revision"})'));
    assert.ok(rewritten.code.includes('await PlayHubBilling.user_owns_game_pass_async('));
    assert.ok(rewritten.code.includes('await PlayHubBilling.prompt_game_pass_purchase('));
    assert.ok(rewritten.code.includes('await PlayHubBilling.prompt_product_purchase('));
    assert.ok(rewritten.code.includes('PlayHubBilling.process_receipt(handle_receipt)'));
    assert.ok(rewritten.code.includes('PlayHubSession.get_principal_id(player)'));

    const extracted = extractMarketplaceRefsFromSource(luauSnippet);
    assert.equal(extracted.length, 2);

    const manifest = generateCommerceManifest('roblox-obby-port', [
      ...extracted,
      { devProductId: 77110022, kind: 'durable', title: 'Golden Jetpack', priceRobux: 250 },
      { gamePassId: 88442211, title: 'VIP Duplicate Should Dedupe' },
    ]);

    assert.equal(manifest.track, 'B_DIRECT_COMMERCE');
    assert.equal(manifest.platform_fee_bps, 0);
    assert.equal(manifest.platform_fee_percent, 0);
    assert.equal(manifest.productCount, 3);

    const kinds = manifest.products.map((p) => p.kind).sort();
    assert.deepEqual(kinds, ['consumable', 'durable', 'pass']);
    for (const prod of manifest.products) {
      assert.equal(prod.platform_fee_bps, 0);
      assert.equal(prod.game_id, 'roblox-obby-port');
      assert.equal(prod.status, 'DRAFT');
      assert.ok(prod.amount_minor > 0);
    }
  });
});

// ============================================================================
// N2 — Binary GLB Hard Budget Gate, Rig Socket Normalizer & VLM Critique
// ============================================================================
describe('N2 — Binary GLB Budget Gate, Socket Normalizer & VLM Critique Rubric', () => {
  it('parses synthetic GLB buffers accurately and enforces hard budgets across all 3 asset kinds', () => {
    // 1. Valid synthetic ugc_attachment (200 tris, 1 material, 0.4m extent, 1 embedded texture)
    const validAttachBuf = createSyntheticGlbBuffer(
      {
        meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, mode: 4 }] }],
        accessors: [
          { count: 120, min: [-0.2, 0.0, -0.2], max: [0.2, 0.35, 0.2] },
          { count: 600 }, // 200 triangles
        ],
        materials: [{ name: 'CrownGold' }],
        textures: [{ source: 0 }],
        images: [{ bufferView: 0, mimeType: 'image/png' }],
        bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 2048 }],
        extensionsRequired: ['KHR_materials_unlit'],
      },
      Buffer.alloc(2048)
    );

    const inspected = inspectGlbBuffer(validAttachBuf);
    assert.equal(inspected.triangleCount, 200);
    assert.equal(inspected.vertexCount, 120);
    assert.equal(inspected.meshCount, 1);
    assert.equal(inspected.materialCount, 1);
    assert.equal(inspected.textureCount, 1);
    assert.equal(inspected.maxTextureBytes, 2048);
    assert.deepEqual(inspected.boundingBox.size, [0.4, 0.35, 0.4]);
    assert.equal(inspected.boundingBox.maxExtent, 0.4);
    assert.deepEqual(inspected.extensionsRequired, ['KHR_materials_unlit']);

    const attachGate = validateAssetBudget(inspected, 'ugc_attachment');
    assert.equal(attachGate.ok, true);

    // 2. Over-budget ugc_attachment (5,000 tris > 4,000, 3 materials > 2, 1.8m > 1.2m)
    const badAttachBuf = createSyntheticGlbBuffer({
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, mode: 4 }] }],
      accessors: [
        { count: 3000, min: [-0.9, 0.0, -0.2], max: [0.9, 0.5, 0.2] },
        { count: 15000 }, // 5,000 triangles
      ],
      materials: [{ name: 'M1' }, { name: 'M2' }, { name: 'M3' }],
    });
    const badAttachGate = validateAssetBudget(inspectGlbBuffer(badAttachBuf), 'ugc_attachment');
    assert.equal(badAttachGate.ok, false);
    const badCodes = badAttachGate.violations.map((v) => v.code);
    assert.ok(badCodes.includes('TRIANGLE_BUDGET_EXCEEDED'));
    assert.ok(badCodes.includes('MATERIAL_BUDGET_EXCEEDED'));
    assert.ok(badCodes.includes('BOUNDING_EXTENT_EXCEEDED'));

    // 3. Synthetic ugc_avatar_skin missing required bones fails, full kaykit_v1 passes
    const incompleteSkinBuf = createSyntheticGlbBuffer({
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
      accessors: [{ count: 600, min: [-0.5, 0, -0.5], max: [0.5, 1.8, 0.5] }, { count: 3000 }],
      materials: [{ name: 'SkinMat' }],
      nodes: [{ name: 'hips' }, { name: 'spine' }],
      skins: [{ joints: [0, 1] }],
    });
    const badSkinGate = validateAssetBudget(inspectGlbBuffer(incompleteSkinBuf), 'ugc_avatar_skin');
    assert.equal(badSkinGate.ok, false);
    assert.ok(badSkinGate.violations.some((v) => v.code === 'REQUIRED_RIG_BONES_MISSING'));

    const fullNodes = RIG_REQUIRED_CORE_BONES.kaykit_v1.map((name) => ({ name }));
    const goodSkinBuf = createSyntheticGlbBuffer({
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
      accessors: [{ count: 1000, min: [-0.5, 0, -0.5], max: [0.5, 1.8, 0.5] }, { count: 6000 }],
      materials: [{ name: 'SkinMat' }],
      nodes: fullNodes,
      skins: [{ joints: fullNodes.map((_, idx) => idx) }],
    });
    const goodSkinGate = validateAssetBudget(inspectGlbBuffer(goodSkinBuf), 'ugc_avatar_skin');
    assert.equal(goodSkinGate.ok, true);
    assert.equal(goodSkinGate.matchedRigProfile, 'kaykit_v1');

    // 4. scene_prop limit (25,000 tris)
    const overPropBuf = createSyntheticGlbBuffer({
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
      accessors: [{ count: 15000, min: [-2, 0, -2], max: [2, 3, 2] }, { count: 78000 }], // 26,000 tris
    });
    const propGate = validateAssetBudget(inspectGlbBuffer(overPropBuf), 'scene_prop');
    assert.equal(propGate.ok, false);
    assert.equal(propGate.violations[0].code, 'TRIANGLE_BUDGET_EXCEEDED');

    // 5. Rejects non-GLB buffer
    assert.throws(() => inspectGlbBuffer(Buffer.from('not a glb file')), /Invalid GLB/);
  });

  it('inspects REAL PlayForge Avatar GLB skins and accessories from forge/Godot/addons/playforge_avatar/assets/', () => {
    // Real kaykit_v1 skin: Knight.glb
    const knightInfo = inspectGlbFile(join(AVATAR_ASSETS_DIR, 'skins/Knight.glb'));
    assert.ok(knightInfo.triangleCount > 1000 && knightInfo.triangleCount <= ASSET_BUDGET_LIMITS.ugc_avatar_skin.maxTriangles);
    assert.ok(knightInfo.skinBoneNames.length >= 16);
    const knightGate = validateAssetBudget(knightInfo, 'ugc_avatar_skin', { rigProfile: 'kaykit_v1' });
    assert.equal(knightGate.ok, true, `Knight.glb failed skin gate: ${JSON.stringify(knightGate.violations)}`);
    assert.equal(knightGate.matchedRigProfile, 'kaykit_v1');

    // Real robot_expressive_v1 skin: RobotExpressive.glb
    const robotInfo = inspectGlbFile(join(AVATAR_ASSETS_DIR, 'skins/RobotExpressive.glb'));
    assert.ok(robotInfo.triangleCount > 1000 && robotInfo.triangleCount <= ASSET_BUDGET_LIMITS.ugc_avatar_skin.maxTriangles);
    const robotGate = validateAssetBudget(robotInfo, 'ugc_avatar_skin', { rigProfile: 'robot_expressive_v1' });
    assert.equal(robotGate.ok, true, `RobotExpressive.glb failed skin gate: ${JSON.stringify(robotGate.violations)}`);
    assert.equal(robotGate.matchedRigProfile, 'robot_expressive_v1');

    // Real compliant attachments: crown_gold, visor_cyber, quiver, wand
    for (const rel of [
      'accessories/crown_gold.glb',
      'accessories/visor_cyber.glb',
      'accessories/quiver.glb',
      'accessories/wand.glb',
    ]) {
      const info = inspectGlbFile(join(AVATAR_ASSETS_DIR, rel));
      const gate = validateAssetBudget(info, 'ugc_attachment');
      assert.equal(gate.ok, true, `${rel} failed ugc_attachment gate: ${JSON.stringify(gate.violations)}`);
    }

    // Real oversized 2H staff (2.155m > 1.2m) must be caught by ugc_attachment hard extent gate,
    // while passing scene_prop budget!
    const staffInfo = inspectGlbFile(join(AVATAR_ASSETS_DIR, 'accessories/staff.glb'));
    const staffAttachGate = validateAssetBudget(staffInfo, 'ugc_attachment');
    assert.equal(staffAttachGate.ok, false);
    assert.ok(staffAttachGate.violations.some((v) => v.code === 'BOUNDING_EXTENT_EXCEEDED'));
    const staffPropGate = validateAssetBudget(staffInfo, 'scene_prop');
    assert.equal(staffPropGate.ok, true);
  });

  it('verifies kaykit_v1 vs robot_expressive_v1 100x socket scale compensation across all 4 slots', () => {
    const { rigProfiles } = loadAvatarRigProfiles(DEFAULT_AVATAR_CATALOG_PATH);
    const report = verifyRigSocketScaleCompensation(rigProfiles);

    assert.equal(report.ok, true, `Scale compensation check failed: ${JSON.stringify(report.violations)}`);
    assert.deepEqual(Object.keys(report.slots), [...CANONICAL_SLOTS]);

    // Verify exact real catalog socket ratios (~47x to 78x compensating the 100x cm bone space + 0.88 vs 0.44 modelScale)
    assert.equal(report.slots.head.rawSocketScaleRatio, 78);
    assert.ok(report.slots.back.rawSocketScaleRatio > 45 && report.slots.back.rawSocketScaleRatio < 50);
    assert.ok(report.slots.hand_r.rawSocketScaleRatio > 50 && report.slots.hand_r.rawSocketScaleRatio < 55);
    assert.equal(report.slots.hand_l.rawSocketScaleRatio, report.slots.hand_r.rawSocketScaleRatio);

    // Canonical attachment checks on real GLBs
    const crownInfo = inspectGlbFile(join(AVATAR_ASSETS_DIR, 'accessories/crown_gold.glb'));
    const crownCheck = computeCanonicalAttachmentChecks(crownInfo.boundingBox, 'head');
    assert.equal(crownCheck.ok, true, `crown_gold failed head check: ${JSON.stringify(crownCheck.violations)}`);

    const quiverInfo = inspectGlbFile(join(AVATAR_ASSETS_DIR, 'accessories/quiver.glb'));
    const quiverCheck = computeCanonicalAttachmentChecks(quiverInfo.boundingBox, 'back');
    assert.equal(quiverCheck.ok, true, `quiver failed back check: ${JSON.stringify(quiverCheck.violations)}`);

    const wandInfo = inspectGlbFile(join(AVATAR_ASSETS_DIR, 'accessories/wand.glb'));
    const wandCheck = computeCanonicalAttachmentChecks(wandInfo.boundingBox, 'hand_r');
    assert.equal(wandCheck.ok, true, `wand failed hand_r check: ${JSON.stringify(wandCheck.violations)}`);

    // Misaligned head bbox triggers violation
    const badHeadCheck = computeCanonicalAttachmentChecks(
      { min: [0.4, -0.5, -0.2], max: [0.9, 0.2, 0.2] },
      'head'
    );
    assert.equal(badHeadCheck.ok, false);
    assert.ok(badHeadCheck.violations.some((v) => v.code === 'HEAD_OFF_CENTER_X'));
    assert.ok(badHeadCheck.violations.some((v) => v.code === 'HEAD_PIVOT_BELOW_BOTTOM'));
  });

  it('scores VLM multi-view critiques cleanly into pass, refine, and reject decisions', () => {
    assert.equal(VLM_CRITIQUE_RUBRIC.passThreshold, 8.0);

    const passed = scoreVlmCritique({
      iteration: 1,
      silhouetteMatch: 8.8,
      noFloatingParts: 9.5,
      proportionBalance: 8.2,
      colorMaterialHarmony: 8.0,
      floatingPartsDetected: false,
      budgetGatePassed: true,
    });
    assert.equal(passed.pass, true);
    assert.equal(passed.decision, 'pass');
    assert.ok(passed.weightedScore >= 8.0);

    // High average score BUT floating parts detected -> must refine, not pass!
    const floatingRefine = scoreVlmCritique({
      iteration: 1,
      silhouetteMatch: 9.0,
      noFloatingParts: 8.5,
      proportionBalance: 8.5,
      colorMaterialHarmony: 8.5,
      floatingPartsDetected: true,
      patchDirectives: [{ partId: 'horn_l', action: 'snap_to_parent' }],
    });
    assert.equal(floatingRefine.pass, false);
    assert.equal(floatingRefine.decision, 'refine');
    assert.equal(floatingRefine.nextAction, 'patch_mesh_recipe_v1');
    assert.equal(floatingRefine.hardFailures.length, 1);

    // Below threshold at max iteration -> reject
    const rejected = scoreVlmCritique({
      iteration: 3,
      maxIterations: 3,
      silhouetteMatch: 6.5,
      noFloatingParts: 7.0,
      proportionBalance: 6.8,
      colorMaterialHarmony: 7.0,
    });
    assert.equal(rejected.pass, false);
    assert.equal(rejected.decision, 'reject');
  });
});
