'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  POLICY_REQUIREMENTS,
  MeshEngineRegistry,
  validateMeshRecipe,
  validateGlbBuffer,
  assertAdapterPolicy,
} = require('../../Tools/blender-pipeline/engine-adapter.cjs');
const {
  buildIsolatedArgs,
  createBlenderCliAdapter,
} = require('../../Tools/blender-pipeline/blender-cli-adapter.cjs');
const { planFromPrompt } = require('../../Tools/blender-pipeline/prompt-planner.cjs');
const { listAiModels, planWithAi } = require('../../Tools/blender-pipeline/llm-planner.cjs');
const { BlenderJobManager } = require('../../Tools/blender-pipeline/job-manager.cjs');
const { createServer } = require('../../server.cjs');

function buildMinimalValidGlb() {
  // Minimal valid glTF 2.0 GLB containing 1 triangle mesh
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const binRaw = Buffer.from(positions.buffer);
  const binPad = (4 - (binRaw.length % 4)) % 4;
  const binBuf = Buffer.concat([binRaw, Buffer.alloc(binPad, 0)]);

  const jsonObj = {
    asset: { version: '2.0', generator: 'PlayForge-MockMesher-Test' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: 'MockTriangle', mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    buffers: [{ byteLength: binRaw.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: binRaw.length }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }],
  };
  const jsonRaw = Buffer.from(JSON.stringify(jsonObj), 'utf8');
  const jsonPad = (4 - (jsonRaw.length % 4)) % 4;
  const jsonBuf = Buffer.concat([jsonRaw, Buffer.alloc(jsonPad, 0x20)]);

  const totalLen = 12 + 8 + jsonBuf.length + 8 + binBuf.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // glTF
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLen, 8);

  const jsonHdr = Buffer.alloc(8);
  jsonHdr.writeUInt32LE(jsonBuf.length, 0);
  jsonHdr.writeUInt32LE(0x4e4f534a, 4); // JSON

  const binHdr = Buffer.alloc(8);
  binHdr.writeUInt32LE(binBuf.length, 0);
  binHdr.writeUInt32LE(0x004e4942, 4); // BIN

  return Buffer.concat([header, jsonHdr, jsonBuf, binHdr, binBuf]);
}

test('policy enforcement: Blender CLI adapter enforces unmodified binary, zero DLL link, isolated process, and JSON/file IPC', () => {
  const adapter = createBlenderCliAdapter();
  assert.deepEqual(adapter.policy, POLICY_REQUIREMENTS);
  assert.equal(adapter.policy.unmodifiedOfficialBinary, true);
  assert.equal(adapter.policy.directDllLink, false);
  assert.equal(adapter.policy.isolatedProcess, true);
  assert.equal(adapter.policy.ipcMode, 'json-file');

  const args = buildIsolatedArgs('/w/blender_worker.py', '/job/request.json', '/job/response.json');
  assert.ok(args.includes('--background'));
  assert.ok(args.includes('--factory-startup'));
  assert.ok(args.includes('--python-exit-code'));
  assert.equal(args[args.indexOf('--request') + 1], '/job/request.json');
  assert.equal(args[args.indexOf('--response') + 1], '/job/response.json');

  // Reject policy violations on adapter registration
  assert.throws(() => assertAdapterPolicy({
    id: 'bad-dll',
    policy: { unmodifiedOfficialBinary: true, directDllLink: true, isolatedProcess: true, ipcMode: 'json-file' },
    probe: async () => ({ available: true }),
    execute: async () => ({}),
  }), /directDllLink must be false/);

  assert.throws(() => assertAdapterPolicy({
    id: 'bad-ipc',
    policy: { unmodifiedOfficialBinary: true, directDllLink: false, isolatedProcess: true, ipcMode: 'shared-memory' },
    probe: async () => ({ available: true }),
    execute: async () => ({}),
  }), /ipcMode must be "json-file"/);
});

test('natural language planner: parses Korean and English prompts into validated MeshRecipe v1 + placement', () => {
  const chest = planFromPrompt({ prompt: '황금 장식이 달린 판타지 보물상자 x=3.5, z=-2' });
  assert.equal(chest.recipe.archetype, 'chest');
  assert.equal(chest.recipe.style, 'fantasy');
  assert.deepEqual(chest.placement.position, [3.5, 0, -2]);
  assert.equal(chest.recipe.schemaVersion, 1);

  const tree = planFromPrompt({ prompt: '눈 덮인 소나무 높이 4m' });
  assert.equal(tree.recipe.archetype, 'tree');
  assert.equal(tree.recipe.variants.snowy, true);
  assert.equal(tree.recipe.variants.pine, true);
  assert.equal(tree.recipe.dimensions.height, 4);

  const sword = planFromPrompt({ prompt: 'glowing blue crystal sword at (1, 0.5, -4)' });
  assert.equal(sword.recipe.archetype, 'sword');
  assert.equal(sword.recipe.variants.glowing, true);
  assert.deepEqual(sword.placement.position, [1, 0.5, -4]);

  // Regression: "아이언맨" must NEVER fall back to a crate even in offline heuristic mode
  const ironman = planFromPrompt({ prompt: '아이언맨 Mark 85 아머 슈트' });
  assert.equal(ironman.recipe.archetype, 'custom');
  assert.ok(ironman.recipe.parts.length >= 25, `Expected multi-part armor, got ${ironman.recipe.parts.length}`);

  // Security validation: reject unknown archetype and excessive parts
  assert.throws(() => validateMeshRecipe({ archetype: 'rm -rf /' }), /Unsupported archetype/);
  assert.throws(() => validateMeshRecipe({
    archetype: 'custom',
    parts: Array.from({ length: 120 }, () => ({ shape: 'box' })),
  }), /exceeds maximum/);
});

test('AI model selection & LLM blueprint planner: lists connected models and converts LLM JSON into validated multi-part GLB via Blender', async t => {
  const mockAgentChatProvider = async (req, res, replyJson) => {
    if (req.url === '/api/agent-chat/providers') {
      return replyJson(200, {
        providers: [
          {
            id: 'claude-connect',
            label: 'Claude',
            configured: true,
            auth: 'connected',
            default_model: 'claude-sonnet-5-5',
            models: ['claude-sonnet-5-5', 'claude-opus-5-5'],
          },
          {
            id: 'chatgpt-connect',
            label: 'ChatGPT',
            configured: true,
            auth: 'connected',
            default_model: 'gpt-6.2-sol',
            models: ['gpt-6.2-sol', 'gpt-6.2-astra'],
          },
        ],
      });
    }
    if (req.url === '/api/agent-chat') {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      assert.equal(body.provider, 'chatgpt-connect');
      assert.equal(body.model, 'gpt-6.2-astra');
      const llmJson = {
        name: 'IronMan_LLM',
        summary: 'LLM이 설계한 아이언맨 커스텀 아머',
        archetype: 'custom',
        style: 'scifi',
        parts: [
          { name: 'Torso', shape: 'box', position: [0, 0, 1.3], scale: [0.5, 0.3, 0.45], color: '#a8181f', metallic: 0.9, roughness: 0.2, bevel: 0.02 },
          { name: 'ArcReactor', shape: 'cylinder', position: [0, -0.17, 1.35], rotationDeg: [90, 0, 0], scale: [0.12, 0.12, 0.04], color: '#38e8ff', emissionStrength: 3.2, smooth: true },
          { name: 'Helmet', shape: 'sphere', position: [0, 0, 1.72], scale: [0.26, 0.28, 0.3], color: '#a8181f', metallic: 0.92, roughness: 0.18, smooth: true },
          { name: 'Faceplate', shape: 'wedge', position: [0, -0.13, 1.71], scale: [0.16, 0.08, 0.2], color: '#e5b82e', metallic: 0.94, roughness: 0.16 },
          { name: 'Arm_L', shape: 'capsule', position: [-0.36, 0, 1.2], scale: [0.14, 0.14, 0.55], color: '#e5b82e', metallic: 0.9, roughness: 0.22, smooth: true },
          { name: 'Arm_R', shape: 'capsule', position: [0.36, 0, 1.2], scale: [0.14, 0.14, 0.55], color: '#e5b82e', metallic: 0.9, roughness: 0.22, smooth: true },
          { name: 'Leg_L', shape: 'cylinder', position: [-0.15, 0, 0.5], scale: [0.16, 0.16, 0.95], topRadiusRatio: 1.15, color: '#a8181f', metallic: 0.9, roughness: 0.22, smooth: true },
          { name: 'Leg_R', shape: 'cylinder', position: [0.15, 0, 0.5], scale: [0.16, 0.16, 0.95], topRadiusRatio: 1.15, color: '#a8181f', metallic: 0.9, roughness: 0.22, smooth: true },
        ],
      };
      return replyJson(200, {
        message: { role: 'assistant', content: '```json\n' + JSON.stringify(llmJson) + '\n```' },
      });
    }
    return replyJson(404, { error: 'not found' });
  };

  const catalog = await listAiModels(mockAgentChatProvider);
  assert.equal(catalog.ok, true);
  assert.equal(catalog.recommended.provider, 'claude-connect');
  assert.ok(catalog.providers.some(p => p.id === 'chatgpt-connect' && p.models.includes('gpt-6.2-astra')));
  assert.ok(catalog.providers.some(p => p.id === 'heuristic'));

  const planned = await planWithAi(
    { prompt: '아이언맨 만들어줘', aiProvider: 'chatgpt-connect', aiModel: 'gpt-6.2-astra' },
    { agentChatProvider: mockAgentChatProvider }
  );
  assert.equal(planned.ai.usedLlm, true);
  assert.equal(planned.ai.provider, 'chatgpt-connect');
  assert.equal(planned.ai.model, 'gpt-6.2-astra');
  assert.equal(planned.recipe.archetype, 'custom');
  assert.equal(planned.recipe.parts.length, 8);

  const probe = await createBlenderCliAdapter().probe({ force: true });
  if (!probe.available) {
    t.skip(`Local Blender unavailable: ${probe.error}`);
    return;
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-blender-llm-'));
  try {
    const mgr = new BlenderJobManager(tmpDir, { storageDir: tmpDir, agentChatProvider: mockAgentChatProvider });
    const { donePromise } = mgr.submitJob({
      prompt: '아이언맨 만들어줘',
      aiProvider: 'chatgpt-connect',
      aiModel: 'gpt-6.2-astra',
    });
    const done = await donePromise;
    assert.equal(done.status, 'succeeded', `LLM job failed: ${done.error}`);
    assert.equal(done.ai.usedLlm, true);
    assert.equal(done.ai.model, 'gpt-6.2-astra');
    assert.equal(done.asset.artifact.meshCount, 8);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('engine swappability: MeshEngineRegistry swaps in a non-Blender 3D adapter seamlessly via JSON/file IPC', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-blender-swap-'));
  try {
    const mockGlb = buildMinimalValidGlb();
    const mockAdapter = {
      id: 'mock-mesher-cli',
      displayName: 'Mock Swappable 3D Engine',
      policy: {
        unmodifiedOfficialBinary: true,
        directDllLink: false,
        isolatedProcess: true,
        ipcMode: 'json-file',
      },
      async probe() {
        return { available: true, version: '1.0.0-mock', binaryPath: 'mock' };
      },
      async execute({ jobId, jobDir, recipe }) {
        const reqPath = path.join(jobDir, 'request.json');
        const resPath = path.join(jobDir, 'response.json');
        const outPath = path.join(jobDir, 'output.glb');
        const request = { schemaVersion: 1, jobId, recipe };
        fs.writeFileSync(reqPath, JSON.stringify(request));
        fs.writeFileSync(outPath, mockGlb);
        const response = { schemaVersion: 1, jobId, ok: true, artifact: { glbPath: 'output.glb', bytes: mockGlb.length } };
        fs.writeFileSync(resPath, JSON.stringify(response));
        return {
          engine: { id: 'mock-mesher-cli', version: '1.0.0-mock' },
          ipc: { mode: 'json-file', requestFile: 'request.json', responseFile: 'response.json', request, response },
          glbPath: outPath,
          glbBuffer: mockGlb,
          glbValidation: validateGlbBuffer(mockGlb),
          metrics: { objectCount: 1, meshCount: 1, vertexCount: 3, triangleCount: 1, materialCount: 0, durationMs: 5 },
          warnings: [],
          logs: { exitCode: 0, stdout: 'ok', stderr: '' },
        };
      },
    };

    const registry = new MeshEngineRegistry().register(mockAdapter, { isDefault: true });
    const manager = new BlenderJobManager(tmpDir, { storageDir: tmpDir, registry });
    const status = await manager.getStatus();
    assert.equal(status.available, true);
    assert.equal(status.defaultEngineId, 'mock-mesher-cli');

    const { donePromise } = manager.submitJob({ prompt: '빨간 로우폴리 자동차' });
    const completed = await donePromise;
    assert.equal(completed.status, 'succeeded');
    assert.equal(completed.engineId, 'mock-mesher-cli');
    assert.equal(completed.asset.engine.id, 'mock-mesher-cli');
    assert.equal(completed.asset.artifact.gltfVersion, '2.0');
    assert.ok(fs.existsSync(manager.getAssetGlbPath(completed.asset.assetId)));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('real Headless Blender 4.x E2E over PlayForge HTTP API: plan -> generate -> GLB integrity -> addon bundle', async t => {
  const probe = await createBlenderCliAdapter().probe({ force: true });
  if (!probe.available) {
    t.skip(`Local Blender binary unavailable: ${probe.error}`);
    return;
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-blender-http-'));
  const server = createServer({
    workspace: path.join(tmpDir, 'workspace'),
    platformWorkspace: path.join(tmpDir, 'platform'),
    buildDirectory: path.join(tmpDir, 'builds'),
    blenderStorageDir: path.join(tmpDir, 'blender'),
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Engine status & policy flags
    const statusRes = await fetch(`${baseUrl}/api/blender/status`);
    assert.equal(statusRes.status, 200);
    const statusJson = await statusRes.json();
    assert.equal(statusJson.ok, true);
    assert.equal(statusJson.available, true);
    assert.equal(statusJson.policy.unmodifiedOfficialBinary, true);
    assert.equal(statusJson.policy.directDllLink, false);
    assert.equal(statusJson.policy.isolatedProcess, true);
    assert.equal(statusJson.policy.ipcMode, 'json-file');

    // 2. Web Godot addon bundle endpoint
    const addonRes = await fetch(`${baseUrl}/api/platform-addon/blender`);
    assert.equal(addonRes.status, 200);
    const addonJson = await addonRes.json();
    assert.equal(addonJson.ok, true);
    assert.ok(addonJson.files['plugin.cfg']);
    assert.ok(addonJson.files['plugin.gd']);
    assert.ok(addonJson.files['blender_dock.gd']);
    assert.ok(addonJson.files['glb_importer.gd']);

    // 2.5 AI Models endpoint
    const modelsRes = await fetch(`${baseUrl}/api/blender/models`);
    assert.equal(modelsRes.status, 200);
    const modelsJson = await modelsRes.json();
    assert.equal(modelsJson.ok, true);
    assert.ok(Array.isArray(modelsJson.providers));
    assert.ok(modelsJson.providers.some(p => p.id === 'heuristic'));

    // 3. Plan endpoint (offline deterministic mode for reproducible CI)
    const planRes = await fetch(`${baseUrl}/api/blender/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: '눈 덮인 소나무 높이 4m x=-2, z=3', aiProvider: 'heuristic' }),
    });
    assert.equal(planRes.status, 200);
    const planJson = await planRes.json();
    assert.equal(planJson.ok, true);
    assert.equal(planJson.recipe.archetype, 'tree');
    assert.equal(planJson.recipe.variants.snowy, true);
    assert.deepEqual(planJson.placement.position, [-2, 0, 3]);

    // 4. Async job submission -> poll -> GLB download & integrity validation
    const jobRes = await fetch(`${baseUrl}/api/blender/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: '눈 덮인 소나무 높이 4m x=-2, z=3',
        aiProvider: 'heuristic',
        projectId: 'proj_test_001',
      }),
    });
    assert.equal(jobRes.status, 202);
    const submitted = await jobRes.json();
    assert.equal(submitted.ok, true);
    const jobId = submitted.job.id;

    let finalJob = submitted.job;
    const deadline = Date.now() + 60000;
    while (['planning', 'queued', 'running'].includes(finalJob.status)) {
      assert.ok(Date.now() < deadline, 'Blender job timed out');
      await new Promise(r => setTimeout(r, 400));
      const poll = await fetch(`${baseUrl}/api/blender/jobs/${jobId}`);
      assert.equal(poll.status, 200);
      finalJob = (await poll.json()).job;
    }

    assert.equal(finalJob.status, 'succeeded', `Job failed: ${finalJob.error}`);
    assert.equal(finalJob.ipc.mode, 'json-file');
    assert.ok(finalJob.metrics.triangleCount > 20);
    assert.equal(finalJob.metrics.boundingBox.min[1], 0); // Bottom-center Y=0 normalized

    const assetId = finalJob.asset.assetId;
    const glbRes = await fetch(`${baseUrl}/api/blender/assets/${assetId}/model.glb`);
    assert.equal(glbRes.status, 200);
    assert.equal(glbRes.headers.get('content-type'), 'model/gltf-binary');
    const glbBytes = Buffer.from(await glbRes.arrayBuffer());
    const validated = validateGlbBuffer(glbBytes);
    assert.equal(validated.sha256, finalJob.asset.artifact.sha256);
    assert.equal(validated.gltfVersion, '2.0');
    assert.ok(validated.meshCount >= 4);

    // 5. Manifest & asset listing & deletion
    const manRes = await fetch(`${baseUrl}/api/blender/assets/${assetId}/manifest.json`);
    assert.equal(manRes.status, 200);
    const manJson = await manRes.json();
    assert.equal(manJson.asset.assetId, assetId);

    const listRes = await fetch(`${baseUrl}/api/blender/assets?projectId=proj_test_001`);
    assert.equal(listRes.status, 200);
    assert.equal((await listRes.json()).assets.length, 1);

    const delRes = await fetch(`${baseUrl}/api/blender/assets/${assetId}`, { method: 'DELETE' });
    assert.equal(delRes.status, 200);
    const afterDel = await fetch(`${baseUrl}/api/blender/assets/${assetId}/model.glb`);
    assert.equal(afterDel.status, 404);
  } finally {
    server.shutdown();
    await new Promise(resolve => setTimeout(resolve, 100));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('3-stage iterative workflow (1: concept x2 -> 2: prompt -> 3: plan -> execute with Three.js & repeat)', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-3stage-http-'));
  const server = createServer({
    workspace: path.join(tmpDir, 'workspace'),
    platformWorkspace: path.join(tmpDir, 'platform'),
    buildDirectory: path.join(tmpDir, 'builds'),
    blenderStorageDir: path.join(tmpDir, 'blender'),
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // Verify both blender-cli and threejs-cli engines are registered
    const st = await fetch(`${baseUrl}/api/blender/status`).then(r => r.json());
    assert.ok(st.engines.some(e => e.id === 'blender-cli'));
    const threeEng = st.engines.find(e => e.id === 'threejs-cli');
    assert.ok(threeEng && threeEng.available === true, 'threejs-cli should be available');

    // Stage 1: Generate TWO concept variations for Darth Vader
    const c1 = await fetch(`${baseUrl}/api/blender/concept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: '스타워즈 다스베이더', style: 'scifi', variation: 1, aiProvider: 'heuristic' }),
    }).then(r => r.json());
    assert.equal(c1.ok, true);
    assert.ok(c1.concept.conceptId.startsWith('cnc_'));

    const c2 = await fetch(`${baseUrl}/api/blender/concept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: '스타워즈 다스베이더', style: 'stylized', variation: 2, aiProvider: 'heuristic' }),
    }).then(r => r.json());
    assert.equal(c2.ok, true);
    assert.notEqual(c1.concept.conceptId, c2.concept.conceptId);

    // Fetch concept SVG image & ensure XSS safety
    const svgRes = await fetch(`${baseUrl}${c1.concept.imageUrl}`);
    assert.equal(svgRes.status, 200);
    const svgText = await svgRes.text();
    assert.ok(svgText.includes('<svg') && !svgText.includes('<script'));

    // Stage 2: Generate 3D modeling prompt from Stage 1 concept
    const p2 = await fetch(`${baseUrl}/api/blender/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idea: '스타워즈 다스베이더', conceptId: c1.concept.conceptId, aiProvider: 'heuristic' }),
    }).then(r => r.json());
    assert.equal(p2.ok, true);
    assert.ok(p2.modelingPrompt.includes('다스베이더'));
    assert.ok(Array.isArray(p2.checklist) && p2.checklist.length >= 2);

    // Stage 3-1: Create modeling plan
    const plan = await fetch(`${baseUrl}/api/blender/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: p2.modelingPrompt, engineId: 'threejs-cli', aiProvider: 'heuristic' }),
    }).then(r => r.json());
    assert.equal(plan.ok, true);
    assert.equal(plan.recipe.archetype, 'custom');
    assert.ok(plan.recipe.parts.length >= 25);

    // Stage 3-2: Execute TWICE with threejs-cli (multiple runs preserved independently)
    const run1 = await fetch(`${baseUrl}/api/blender/jobs?sync=1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: p2.modelingPrompt,
        recipe: plan.recipe,
        conceptId: c1.concept.conceptId,
        engineId: 'threejs-cli',
        placement: { position: [0, 0, 0] },
      }),
    }).then(r => r.json());
    assert.equal(run1.ok, true, `Three.js run1 failed: ${run1.job?.error}`);
    assert.equal(run1.job.engineId, 'threejs-cli');
    assert.equal(run1.job.asset.conceptId, c1.concept.conceptId);
    assert.equal(run1.job.metrics.boundingBox.min[1], 0);

    const run2 = await fetch(`${baseUrl}/api/blender/jobs?sync=1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: '아이언맨 Mark 85',
        engineId: 'threejs-cli',
        aiProvider: 'heuristic',
        placement: { position: [2, 0, 0] },
      }),
    }).then(r => r.json());
    assert.equal(run2.ok, true);
    assert.notEqual(run1.job.asset.assetId, run2.job.asset.assetId);

    const allAssets = await fetch(`${baseUrl}/api/blender/assets`).then(r => r.json());
    assert.equal(allAssets.assets.length, 2);

    // Validate Three.js GLB binary directly
    const glbBytes = Buffer.from(await (await fetch(`${baseUrl}${run1.job.asset.artifact.url}`)).arrayBuffer());
    const validated = validateGlbBuffer(glbBytes);
    assert.equal(validated.gltfVersion, '2.0');
    assert.ok(validated.meshCount >= 25);
  } finally {
    server.shutdown();
    await new Promise(resolve => setTimeout(resolve, 100));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
