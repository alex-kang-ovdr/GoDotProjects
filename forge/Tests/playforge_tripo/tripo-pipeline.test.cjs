'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { validateGlbBuffer, buildSimulationGlb, buildPreviewPng } = require('../../Tools/tripo-pipeline/glb-validator.cjs');
const {
  maskApiKey,
  isPrivateOrLoopbackHost,
  validateRemoteUrl,
  TripoV3Client,
} = require('../../Tools/tripo-pipeline/tripo-client.cjs');
const { createMockTripoV3HttpServer } = require('../../Tools/tripo-pipeline/tripo-simulator.cjs');
const { TripoJobManager } = require('../../Tools/tripo-pipeline/tripo-job-manager.cjs');
const { createServer } = require('../../server.cjs');

test('GLB validator & procedural synthesizer produce valid PBR, rigged, and animated glTF 2.0 binary assets', () => {
  const propGlb = buildSimulationGlb({
    prompt: '황금 장식이 달린 판타지 보물상자',
    texture: true,
    pbr: true,
  });
  const propInfo = validateGlbBuffer(propGlb);
  assert.equal(propInfo.valid, true);
  assert.equal(propInfo.gltfVersion, '2.0');
  assert.ok(propInfo.meshCount >= 1);
  assert.ok(propInfo.triangleCount >= 20);
  assert.equal(propInfo.textureCount, 1);
  assert.equal(propInfo.imageCount, 1);
  assert.equal(propInfo.skinCount, 0);
  assert.equal(propInfo.animationCount, 0);
  assert.equal(propInfo.gameReadiness.hasPbr, true);
  assert.equal(propInfo.gameReadiness.hasTextures, true);
  assert.equal(propInfo.gameReadiness.grade, 'A');

  const animGlb = buildSimulationGlb({
    prompt: 'Stylized fantasy knight hero',
    texture: true,
    pbr: true,
    rigged: true,
    animationPreset: 'preset:walk',
  });
  const animInfo = validateGlbBuffer(animGlb);
  assert.equal(animInfo.valid, true);
  assert.equal(animInfo.skinCount, 1);
  assert.equal(animInfo.boneCount, 5);
  assert.equal(animInfo.animationCount, 1);
  assert.deepEqual(animInfo.animationNames, ['tripo_walk']);
  assert.equal(animInfo.gameReadiness.hasRig, true);
  assert.equal(animInfo.gameReadiness.hasAnimation, true);

  // Corrupted / non-GLB buffer must fail strictly
  assert.throws(() => validateGlbBuffer(Buffer.from('not a glb file at all')), /Invalid GLB header magic/);
  assert.throws(() => validateGlbBuffer(Buffer.alloc(10)), /too small/);
});

test('SSRF & API key security helpers block private/loopback/metadata hosts and mask secrets', () => {
  assert.equal(maskApiKey('tsk_1234567890abcdef'), 'tsk_12••••cdef');
  assert.equal(maskApiKey(''), '');

  assert.equal(isPrivateOrLoopbackHost('127.0.0.1'), true);
  assert.equal(isPrivateOrLoopbackHost('localhost'), true);
  assert.equal(isPrivateOrLoopbackHost('169.254.169.254'), true);
  assert.equal(isPrivateOrLoopbackHost('10.0.0.5'), true);
  assert.equal(isPrivateOrLoopbackHost('192.168.1.10'), true);
  assert.equal(isPrivateOrLoopbackHost('172.16.0.2'), true);
  assert.equal(isPrivateOrLoopbackHost('::1'), true);
  assert.equal(isPrivateOrLoopbackHost('openapi.tripo3d.ai'), false);

  assert.throws(() => validateRemoteUrl('http://openapi.tripo3d.ai/v3/account/balance'), /HTTPS required/);
  assert.throws(() => validateRemoteUrl('https://127.0.0.1/v3/tasks/1'), /Blocked private or loopback/);
  assert.throws(() => validateRemoteUrl('https://169.254.169.254/latest/meta-data/'), /Blocked private or loopback/);
  assert.throws(() => validateRemoteUrl('file:///etc/passwd'), /HTTPS required/);
  assert.throws(() => validateRemoteUrl('https://user:pass@openapi.tripo3d.ai/v3'), /Credentials in URL/);

  const valid = validateRemoteUrl('https://openapi.tripo3d.ai/v3/generation/text-to-model');
  assert.equal(valid.hostname, 'openapi.tripo3d.ai');
});

test('TripoV3Client executes full Live HTTP protocol against local mock Tripo API v3 server', async () => {
  const apiKey = 'tsk_live_protocol_verify_987654';
  const mockServer = createMockTripoV3HttpServer({
    expectedApiKey: apiKey,
    initialBalance: 400,
    pollsToFinish: 2,
  });
  const { baseUrl } = await mockServer.listen();
  const traces = [];

  try {
    const client = new TripoV3Client({
      apiKey,
      baseUrl,
      allowLoopbackMock: true,
      onTrace: t => traces.push(t),
    });

    // 1. Balance check
    const bal = await client.getBalance();
    assert.equal(bal.balance, 400);
    assert.equal(bal.frozen, 0);

    // 2. Unauthorized key must fail cleanly with 401
    const badClient = new TripoV3Client({ apiKey: 'tsk_wrong', baseUrl, allowLoopbackMock: true });
    await assert.rejects(() => badClient.getBalance(), /401/);

    // 3. Text-to-Model + Polling + Immediate GLB download
    const created = await client.createTextToModel({
      prompt: 'Sci-fi combat mech robot with cyan core',
      model: 'v3.1-20260211',
      texture: true,
      pbr: true,
      quad: true,
      faceLimit: 12000,
    });
    assert.ok(created.taskId);

    const p1 = await client.getTask(created.taskId);
    assert.equal(p1.status, 'running');
    const p2 = await client.getTask(created.taskId);
    assert.equal(p2.status, 'success');
    assert.ok(p2.output.modelUrl);

    const glbBuf = await client.downloadAsset(p2.output.modelUrl);
    const glbInfo = validateGlbBuffer(glbBuf);
    assert.equal(glbInfo.valid, true);
    assert.ok(glbInfo.triangleCount > 0);

    // 4. Multipart File Upload + Image-to-Model
    const samplePng = buildPreviewPng('cyber drone');
    const uploaded = await client.uploadFile(samplePng, 'concept.png', 'image/png');
    assert.ok(uploaded.fileToken.startsWith('sim_tok_'));

    const imgTask = await client.createImageToModel({
      fileToken: uploaded.fileToken,
      model: 'P1-20260311',
    });
    assert.ok(imgTask.taskId);

    // 5. Auto-Rig + Retarget + Convert chained off taskId
    const rc = await client.rigCheck(created.taskId);
    assert.equal(rc.riggable, true);

    const rigTask = await client.createRigTask({ originalTaskId: created.taskId, rigType: 'biped' });
    await client.getTask(rigTask.taskId);
    const rigDone = await client.getTask(rigTask.taskId);
    assert.equal(rigDone.status, 'success');
    const rigGlbInfo = validateGlbBuffer(await client.downloadAsset(rigDone.output.modelUrl));
    assert.equal(rigGlbInfo.skinCount, 1);
    assert.equal(rigGlbInfo.boneCount, 5);

    const animTask = await client.createRetargetTask({ originalTaskId: rigTask.taskId, animation: 'preset:run' });
    await client.getTask(animTask.taskId);
    const animDone = await client.getTask(animTask.taskId);
    const animGlbInfo = validateGlbBuffer(await client.downloadAsset(animDone.output.modelUrl));
    assert.equal(animGlbInfo.animationCount, 1);
    assert.deepEqual(animGlbInfo.animationNames, ['tripo_run']);

    // Verify wire traces never expose the raw Bearer key
    const serializedTraces = JSON.stringify(traces);
    assert.equal(serializedTraces.includes(apiKey), false, 'Raw Tripo API key must never appear in wire traces');
  } finally {
    await mockServer.close();
  }
});

test('PlayForge Server /api/tripo/* E2E flow: Live mock, Simulation, Upload, Rig, Retarget, Convert, Addon & Security', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-tripo-server-'));
  const mockTripo = createMockTripoV3HttpServer({
    expectedApiKey: 'tsk_e2e_secret_key_5555',
    initialBalance: 300,
    pollsToFinish: 2,
  });
  const { baseUrl: mockBaseUrl } = await mockTripo.listen();

  const server = createServer({
    platformWorkspace: path.join(tmpDir, 'workspace'),
    tripoStorageDir: path.join(tmpDir, 'tripo'),
    tripoBaseUrl: mockBaseUrl,
    tripoMode: 'simulation',
    tripoAllowLoopbackMock: true,
    tripoPollIntervalLiveMs: 50,
    tripoPollIntervalSimMs: 20,
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;

  try {
    // Acquire CSRF session token
    const sessionRes = await fetch(`${origin}/api/session`);
    assert.equal(sessionRes.status, 200);
    const { csrfToken } = await sessionRes.json();
    const cookie = (sessionRes.headers.get('set-cookie') || '').split(';')[0];
    const postHeaders = {
      'Content-Type': 'application/json',
      'X-PlayForge-CSRF': csrfToken,
      ...(cookie ? { Cookie: cookie } : {}),
    };

    // 1. Static Tripo Studio UI & Godot Addon bundle
    const studioRes = await fetch(`${origin}/OfficialGodot/tripo-studio.html`);
    assert.equal(studioRes.status, 200);
    const studioHtml = await studioRes.text();
    assert.ok(studioHtml.includes('Tripo3D Studio'));

    const addonRes = await fetch(`${origin}/api/platform-addon/tripo`);
    assert.equal(addonRes.status, 200);
    const addonData = await addonRes.json();
    assert.equal(addonData.ok, true);
    assert.ok(addonData.files['plugin.cfg']);
    assert.ok(addonData.files['plugin.gd']);
    assert.ok(addonData.files['tripo_dock.gd']);
    assert.ok(addonData.files['glb_importer.gd']);

    // 2. Status in simulation mode
    const stRes = await fetch(`${origin}/api/tripo/status`);
    assert.equal(stRes.status, 200);
    const stData = await stRes.json();
    assert.equal(stData.ok, true);
    assert.equal(stData.mode, 'simulation');
    assert.equal(stData.balance.balance, 500);

    // 3. Text-to-3D (Simulation sync=1)
    const genRes = await fetch(`${origin}/api/tripo/jobs?sync=1`, {
      method: 'POST',
      headers: postHeaders,
      body: JSON.stringify({
        taskType: 'text_to_model',
        prompt: 'Stylized fantasy knight in blue and gold armor',
        model: 'v3.1-20260211',
        texture: true,
        pbr: true,
      }),
    });
    assert.equal(genRes.status, 200);
    const genData = await genRes.json();
    assert.equal(genData.ok, true);
    assert.equal(genData.job.status, 'succeeded');
    const baseAssetId = genData.asset.assetId;
    assert.ok(baseAssetId);

    // Download GLB + Manifest + Preview
    const glbRes = await fetch(`${origin}/api/tripo/assets/${baseAssetId}/model.glb`);
    assert.equal(glbRes.status, 200);
    assert.equal(glbRes.headers.get('content-type'), 'model/gltf-binary');
    const glbInfo = validateGlbBuffer(Buffer.from(await glbRes.arrayBuffer()));
    assert.equal(glbInfo.valid, true);

    const prevRes = await fetch(`${origin}/api/tripo/assets/${baseAssetId}/preview.png`);
    assert.equal(prevRes.status, 200);
    assert.equal(prevRes.headers.get('content-type'), 'image/png');

    // 4. Auto-Rig -> Retarget -> Convert chain
    const rigRes = await fetch(`${origin}/api/tripo/assets/${baseAssetId}/rig?sync=1`, {
      method: 'POST',
      headers: postHeaders,
      body: JSON.stringify({ rigType: 'biped' }),
    });
    assert.equal(rigRes.status, 200);
    const rigData = await rigRes.json();
    assert.equal(rigData.asset.metrics.skinCount, 1);
    assert.equal(rigData.asset.metrics.boneCount, 5);

    const retargetRes = await fetch(`${origin}/api/tripo/assets/${rigData.asset.assetId}/retarget?sync=1`, {
      method: 'POST',
      headers: postHeaders,
      body: JSON.stringify({ animation: 'preset:slash' }),
    });
    assert.equal(retargetRes.status, 200);
    const retargetData = await retargetRes.json();
    assert.equal(retargetData.asset.metrics.animationCount, 1);
    assert.deepEqual(retargetData.asset.metrics.animationNames, ['tripo_slash']);

    const convertRes = await fetch(`${origin}/api/tripo/assets/${baseAssetId}/convert?sync=1`, {
      method: 'POST',
      headers: postHeaders,
      body: JSON.stringify({ format: 'GLTF', faceLimit: 5000, quad: true }),
    });
    assert.equal(convertRes.status, 200);
    const convertData = await convertRes.json();
    assert.equal(convertData.asset.tripo.faceLimit, 5000);
    assert.equal(convertData.asset.tripo.quad, true);

    // 5. Image upload validation & Image-to-3D + Multiview-to-3D
    const badUp = await fetch(`${origin}/api/tripo/uploads`, {
      method: 'POST',
      headers: postHeaders,
      body: JSON.stringify({ dataUrl: 'data:image/png;base64,' + Buffer.from('NOT_A_PNG').toString('base64') }),
    });
    assert.equal(badUp.status, 400);

    const validPngDataUrl = 'data:image/png;base64,' + buildPreviewPng('emerald crystal').toString('base64');
    const up1 = await (await fetch(`${origin}/api/tripo/uploads`, {
      method: 'POST',
      headers: postHeaders,
      body: JSON.stringify({ dataUrl: validPngDataUrl, filename: 'front.png' }),
    })).json();
    const up2 = await (await fetch(`${origin}/api/tripo/uploads`, {
      method: 'POST',
      headers: postHeaders,
      body: JSON.stringify({ dataUrl: validPngDataUrl, filename: 'side.png' }),
    })).json();
    assert.equal(up1.ok, true);
    assert.equal(up2.ok, true);

    const imgJob = await (await fetch(`${origin}/api/tripo/jobs?sync=1`, {
      method: 'POST',
      headers: postHeaders,
      body: JSON.stringify({ taskType: 'image_to_model', uploadId: up1.upload.uploadId, prompt: 'Emerald Crystal' }),
    })).json();
    assert.equal(imgJob.ok, true);

    const mvJob = await (await fetch(`${origin}/api/tripo/jobs?sync=1`, {
      method: 'POST',
      headers: postHeaders,
      body: JSON.stringify({
        taskType: 'multiview_to_model',
        multiviewUploadIds: [up1.upload.uploadId, up2.upload.uploadId],
        prompt: 'Emerald Knight 4View',
      }),
    })).json();
    assert.equal(mvJob.ok, true);

    // 6. Config security: proxied/tunnel requests must be rejected (403)
    const tunnelCfg = await fetch(`${origin}/api/tripo/config`, {
      method: 'POST',
      headers: { ...postHeaders, 'X-Forwarded-For': '203.0.113.5' },
      body: JSON.stringify({ apiKey: 'tsk_hijack' }),
    });
    assert.equal(tunnelCfg.status, 403);

    // Localhost config switch to Live mode against mock Tripo v3 HTTP server
    const cfgRes = await fetch(`${origin}/api/tripo/config`, {
      method: 'POST',
      headers: postHeaders,
      body: JSON.stringify({
        apiKey: 'tsk_e2e_secret_key_5555',
        mode: 'live',
        testConnection: true,
      }),
    });
    assert.equal(cfgRes.status, 200);
    const cfgData = await cfgRes.json();
    assert.equal(cfgData.ok, true);
    assert.equal(cfgData.config.mode, 'live');
    assert.equal(cfgData.config.apiKeyMasked, 'tsk_e2••••5555');
    assert.equal(cfgData.balance.balance, 300);
    assert.equal(JSON.stringify(cfgData).includes('tsk_e2e_secret_key_5555'), false);

    // Run real Live-mode job through Forge server -> mock Tripo v3 HTTP server
    const liveJobRes = await fetch(`${origin}/api/tripo/jobs?sync=1`, {
      method: 'POST',
      headers: postHeaders,
      body: JSON.stringify({
        taskType: 'text_to_model',
        prompt: 'Cyberpunk racing hover car with neon lights',
        model: 'P1-20260311',
      }),
    });
    assert.equal(liveJobRes.status, 200);
    const liveJob = await liveJobRes.json();
    assert.equal(liveJob.ok, true);
    assert.equal(liveJob.asset.tripo.mode, 'live');
    assert.equal(liveJob.asset.tripo.modelVersion, 'P1-20260311');

    // 7. Delete asset cleanup
    const delRes = await fetch(`${origin}/api/tripo/assets/${liveJob.asset.assetId}`, {
      method: 'DELETE',
      headers: postHeaders,
    });
    assert.equal(delRes.status, 200);
    const afterDel = await fetch(`${origin}/api/tripo/assets/${liveJob.asset.assetId}/manifest.json`);
    assert.equal(afterDel.status, 404);
  } finally {
    await new Promise(resolve => {
      server.once('close', resolve);
      server.shutdown();
    });
    await mockTripo.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
