// End-to-end tests for Web Forge Game-Only Deploy:
// - Dev-only Target Farm selector (presets, custom URL, live-host blocking, Live fail-closed lock, /_healthz probe)
// - Project ZIP upload validation & Zip-Slip rejection
// - Server-side multi-platform packaging (Web, Android, Desktop, iOS + PCK GDPC verification & deduplication)
// - Game-only deployment to selected Dev Hub Farm -> immediate /play-ugc/ + /api/mobile/catalog (Android PCK) live serving
// - Live Hub channel fail-closed check against direct public deploy
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { createApp } from '../server/app.mjs';

const require = createRequire(import.meta.url);
const { createServer: createForgeServer } = require('../../forge/server.cjs');
const { zipFiles } = require('../../forge/Tools/export-godot-project.cjs');
const {
  isFarmSelectorAllowed,
  normalizeFarmUrl,
  resolveTargetFarm,
} = require('../../forge/Tools/farm-targets.cjs');
const { extractProjectZip } = require('../../forge/Tools/project-zip-packager.cjs');

const HUB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(HUB_ROOT, '..');
const SHELL_JS = fs.readFileSync(path.join(REPO_ROOT, 'forge/Tools/playhub-godot-shell.js'), 'utf8');

function makeFakePck(tag = 'web') {
  const header = Buffer.alloc(24);
  header.write('GDPC', 0, 4, 'ascii');
  header.writeUInt32LE(2, 4); // formatVersion
  header.writeUInt32LE(4, 8); // major
  header.writeUInt32LE(7, 12); // minor
  header.writeUInt32LE(2, 16); // patch
  header.writeUInt32LE(0, 20);
  return Buffer.concat([header, Buffer.from(`fake-pck-payload:${tag}`, 'utf8')]);
}

function makeSampleProjectZip({ wrapFolder = '' } = {}) {
  const prefix = wrapFolder ? `${wrapFolder}/` : '';
  return zipFiles([
    [`${prefix}project.godot`, 'config_version=5\n[application]\nconfig/name="FTL Zip Sample"\nrun/main_scene="res://scenes/main.tscn"\n'],
    [`${prefix}scenes/main.tscn`, '[gd_scene format=3]\n[node name="Main" type="Node2D"]\n'],
    [`${prefix}scripts/main.gd`, 'extends Node2D\nfunc _ready():\n\tpass\n'],
  ]);
}

async function createTempHub(t, { deployChannel = 'dev', devToken = 'dev-secret-token-123456' } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-game-deploy-hub-'));
  const dataDir = path.join(tmp, 'data');
  const rootDir = path.join(tmp, 'root');
  const forgeDir = path.join(tmp, 'forge-data');
  fs.mkdirSync(path.join(rootDir, 'games'), { recursive: true });
  fs.mkdirSync(path.join(rootDir, 'catalog'), { recursive: true });
  fs.writeFileSync(path.join(rootDir, 'catalog', 'games.json'), JSON.stringify({ schemaVersion: 1, entries: [] }), 'utf8');

  let app = null;
  const server = http.createServer((req, res) => {
    if (req.url === '/_healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, role: 'public', revision: `test-${deployChannel}-001` }));
      return;
    }
    app.publicHandler(req, res);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await app?.close?.();
    fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 });
  });
  app = createApp(
    {
      dataDir,
      deployChannel,
      secureCookies: false,
      userOrigins: [baseUrl],
      adminOrigins: [baseUrl],
      userBaseUrl: baseUrl,
      mobile: { enabled: true },
      forge: { enabled: false },
      publish: { storageMode: 'local-fs', devDirectDeployToken: devToken },
    },
    {
      rootDir,
      platformRoot: REPO_ROOT,
      env: {
        ...process.env,
        PLAYHUB_CHANNEL: deployChannel,
        PLAYHUB_DEV_GAME_DEPLOY_TOKEN: devToken,
      },
    }
  );
  return { baseUrl, app, devToken };
}

test('Dev Farm selector allows presets/custom in dev, blocks Live hosts, and fail-closes in Live', () => {
  assert.equal(isFarmSelectorAllowed('dev'), true);
  assert.equal(isFarmSelectorAllowed('debug'), true);
  assert.equal(isFarmSelectorAllowed('test'), true);
  assert.equal(isFarmSelectorAllowed('live'), false);
  assert.equal(isFarmSelectorAllowed('release'), false);
  assert.equal(isFarmSelectorAllowed('production'), false);

  assert.equal(
    normalizeFarmUrl('https://dev-farm1.playhub.example.com/', { buildStage: 'dev' }),
    'https://dev-farm1.playhub.example.com'
  );
  assert.throws(
    () => normalizeFarmUrl('https://live.playhub.example.com', { buildStage: 'dev' }),
    /FARM_LIVE_HOST_BLOCKED|Live 서버/
  );
  assert.throws(
    () => normalizeFarmUrl('https://playhub-live-prod.us-west1.run.app', { buildStage: 'dev' }),
    /FARM_LIVE_HOST_BLOCKED|Live 서버/
  );
  assert.throws(
    () => resolveTargetFarm({ buildStage: 'live', defaultBaseUrl: 'https://hub.example', farmId: 'dev-farm-1' }),
    /Live 환경에서는 대상 팜을 변경할 수 없습니다/
  );
});

test('extractProjectZip strips single wrapper folder and rejects unsafe or missing project.godot ZIPs', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'playforge-zip-extract-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 }));

  const wrappedZip = makeSampleProjectZip({ wrapFolder: 'my-ftl-proj' });
  const extracted = extractProjectZip(wrappedZip, path.join(tmp, 'ok'));
  assert.equal(extracted.fileCount, 3);
  assert.equal(extracted.projectName, 'FTL Zip Sample');
  assert.equal(extracted.mainScene, 'res://scenes/main.tscn');
  assert.ok(fs.existsSync(path.join(tmp, 'ok', 'project.godot')));

  const missingProjectZip = zipFiles([['README.txt', 'no project.godot']]);
  assert.throws(
    () => extractProjectZip(missingProjectZip, path.join(tmp, 'missing')),
    /project\.godot/
  );

  const traversalZip = zipFiles([['../escape.txt', 'evil'], ['project.godot', 'config_version=5\n']]);
  assert.throws(
    () => extractProjectZip(traversalZip, path.join(tmp, 'traversal')),
    /안전하지 않은 ZIP|허용되지 않는 ZIP/
  );
});

test('Web Forge uploads Project ZIP -> server packages Web/Android/Desktop/iOS -> deploys game-only to selected Dev Farm', async (t) => {
  const devHub = await createTempHub(t, { deployChannel: 'dev', devToken: 'dev-deploy-token-xyz' });
  const forgeTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'playforge-game-deploy-forge-'));
  t.after(() => fs.rmSync(forgeTmp, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 }));

  const mockExporter = async ({ projectDir, outputDir, platforms }) => {
    assert.ok(fs.existsSync(path.join(projectDir, 'project.godot')));
    fs.writeFileSync(path.join(outputDir, 'index.html'), '<!doctype html><html><head></head><body>OK</body></html>', 'utf8');
    fs.writeFileSync(path.join(outputDir, 'playhub-godot-shell.js'), SHELL_JS, 'utf8');
    fs.writeFileSync(path.join(outputDir, 'index.pck'), makeFakePck('web-desktop'));
    if (platforms.includes('android')) {
      fs.mkdirSync(path.join(outputDir, 'platforms', 'android'), { recursive: true });
      fs.writeFileSync(path.join(outputDir, 'platforms', 'android', 'index.pck'), makeFakePck('android-mobile-etc2'));
    }
    if (platforms.includes('ios')) {
      fs.mkdirSync(path.join(outputDir, 'platforms', 'ios'), { recursive: true });
      fs.writeFileSync(path.join(outputDir, 'platforms', 'ios', 'index.pck'), makeFakePck('android-mobile-etc2'));
    }
  };

  const forgeServer = createForgeServer({
    hubAuth: false,
    buildMode: 'dev',
    workspace: path.join(forgeTmp, 'ws'),
    platformWorkspace: path.join(forgeTmp, 'platform'),
    buildDirectory: path.join(forgeTmp, 'builds'),
    gameDeployDirectory: path.join(forgeTmp, 'game-deploys'),
    devDeployToken: devHub.devToken,
    gameDeployExporter: mockExporter,
  });
  await new Promise((resolve) => forgeServer.listen(0, '127.0.0.1', resolve));
  const forgePort = forgeServer.address().port;
  const forgeBase = `http://127.0.0.1:${forgePort}`;
  t.after(() => new Promise((resolve) => {
    forgeServer.shutdown();
    forgeServer.once('close', resolve);
  }));

  // 1. Fetch deploy config (Dev mode => farmSelectorAllowed: true)
  const cfgRes = await fetch(`${forgeBase}/api/platform/game-deploy/config`);
  assert.equal(cfgRes.status, 200);
  const cfg = await cfgRes.json();
  assert.equal(cfg.farmSelectorAllowed, true);
  assert.deepEqual(cfg.supportedPlatforms, ['web', 'android', 'desktop', 'ios']);

  // 2. Probe custom Dev Farm health via Forge server
  const probeRes = await fetch(`${forgeBase}/api/platform/game-deploy/probe-farm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ farmId: 'custom', customUrl: devHub.baseUrl }),
  });
  assert.equal(probeRes.status, 200);
  const probe = await probeRes.json();
  assert.equal(probe.health.ok, true);
  assert.equal(probe.health.revision, 'test-dev-001');

  // 3. Upload raw Project ZIP to Forge -> server packages Web/Android/Desktop/iOS -> game-only deploy to Dev Hub
  const projectZip = makeSampleProjectZip();
  const deployMeta = {
    uploadFilename: 'ftl-zip-test.zip',
    gameSlug: 'ftl-zip-test',
    title: 'FTL ZIP 테스트',
    description: '웹 포지 ZIP 업로드 플랫폼별 패키징 게임 단독 배포 테스트',
    visibility: 'public',
    deployMode: 'singleplay',
    controls: ['keyboard', 'mouse', 'touch'],
    platforms: ['web', 'android', 'desktop', 'ios'],
    targetFarmId: 'custom',
    customFarmUrl: devHub.baseUrl,
    pushToFarm: true,
  };
  const startRes = await fetch(`${forgeBase}/api/platform/game-deploy/jobs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/zip',
      'X-PlayForge-Deploy-Meta': Buffer.from(JSON.stringify(deployMeta), 'utf8').toString('base64'),
    },
    body: projectZip,
  });
  assert.equal(startRes.status, 202);
  const { job: initialJob } = await startRes.json();
  assert.equal(initialJob.sourceMode, 'zip-upload');
  // Immediate-response stats are available immediately on 202 Accepted before packaging finishes
  assert.ok(initialJob.immediateMetrics, '202 Accepted response must include immediateMetrics');
  assert.equal(initialJob.immediateMetrics.phase, 'accepted');
  assert.equal(initialJob.immediateMetrics.uploadBytes, projectZip.length);
  assert.ok(initialJob.immediateMetrics.uploadReceiveMs >= 0);
  assert.equal(initialJob.immediateMetrics.targetPlatformCount, 4);
  assert.ok(initialJob.immediateMetrics.queuePosition >= 1);
  assert.ok(initialJob.immediateMetrics.serverRssMb > 0);
  assert.equal(initialJob.metrics, null, 'Final completion metrics must remain null until deploy finishes');

  // Poll until completed
  let job = initialJob;
  const deadline = Date.now() + 15000;
  while (['queued', 'running'].includes(job.status) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
    const pollRes = await fetch(`${forgeBase}/api/platform/game-deploy/jobs/${job.id}`);
    job = (await pollRes.json()).job;
  }
  assert.equal(job.status, 'succeeded', `deploy job failed: ${job.error}\n${job.log}`);
  assert.equal(job.platforms.web.pckFile, 'index.pck');
  assert.equal(job.platforms.android.pckFile, 'platforms/android/index.pck');
  assert.equal(job.platforms.desktop.pckFile, 'index.pck'); // deduplicated with web!
  assert.equal(job.platforms.ios.pckFile, 'platforms/android/index.pck'); // deduplicated with android mobile PCK!
  assert.equal(job.deployResult.ok, true);
  assert.equal(job.deployResult.gameId, 'ftl-zip-test');
  assert.equal(job.deployResult.directPublished, true);

  // 4. Verify game is immediately live on target Dev Hub (Web + Android mobile catalog)
  const playRes = await fetch(job.deployResult.fullPlayUrl);
  assert.equal(playRes.status, 200);
  const playHtml = await playRes.text();
  assert.match(playHtml, /OK/);

  const mobileCatRes = await fetch(`${devHub.baseUrl}/api/mobile/catalog`, {
    headers: { 'X-PlayHub-Engine-Version': '4.7.2', 'X-PlayHub-App-Version-Code': '1' },
  });
  assert.equal(mobileCatRes.status, 200);
  const mobileCat = await mobileCatRes.json();
  const deployed = mobileCat.games.find((g) => g.id === 'ftl-zip-test');
  assert.ok(deployed, 'Newly deployed game must immediately appear in /api/mobile/catalog');
  assert.equal(deployed.runtime, 'godot-pck');
  assert.equal(deployed.compatibility.compatible, true);
  assert.match(deployed.android.pckUrl, /platforms\/android\/index\.pck$/);

  const pckRes = await fetch(`${devHub.baseUrl}${deployed.android.pckUrl}`);
  assert.equal(pckRes.status, 200);
  const pckBuf = Buffer.from(await pckRes.arrayBuffer());
  assert.equal(pckBuf.subarray(0, 4).toString('ascii'), 'GDPC');
  assert.match(pckBuf.toString('utf8'), /android-mobile-etc2/);

  // 5. Verify per-job deployment metrics (immediate preserved + final transfer/timing/usage populated)
  assert.ok(job.immediateMetrics, 'Completed job must retain immediateMetrics');
  assert.equal(job.immediateMetrics.phase, 'accepted');
  assert.ok(job.metrics, 'Completed job must include final metrics');
  assert.equal(job.metrics.phase, 'final');
  assert.ok(job.metrics.transfer.uploadBytes > 0);
  assert.ok(job.metrics.transfer.bundleBytes > 0);
  assert.ok(job.metrics.transfer.expandedBytes > 0);
  assert.ok(job.metrics.transfer.dedupSavedBytes > 0, 'Desktop/iOS PCK deduplication must report saved bytes');
  assert.equal(job.metrics.transfer.farmTransferBytes, job.bundleBytes);
  assert.equal(
    job.metrics.transfer.totalTransferBytes,
    job.metrics.transfer.uploadBytes + job.metrics.transfer.farmTransferBytes
  );
  assert.ok(job.metrics.timing.totalMs >= 0);
  assert.ok(job.metrics.timing.extractMs >= 0);
  assert.ok(job.metrics.timing.packageMs >= 0);
  assert.ok(job.metrics.timing.farmUploadMs >= 0);
  assert.ok(job.metrics.timing.hubServerMs >= 0);
  assert.ok(job.metrics.timing.packageStages && Number.isFinite(job.metrics.timing.packageStages.zipMs));
  assert.ok(job.metrics.usage.cpuTotalMs >= 0);
  assert.ok(job.metrics.usage.peakRssMb > 0);
  assert.ok(job.metrics.usage.workspaceDiskBytes > 0);

  assert.ok(job.deployResult.metrics, 'Hub deploy response must include server-side metrics');
  assert.ok(job.deployResult.metrics.bundleBytes > 0);
  assert.ok(job.deployResult.metrics.expandedBytes > 0);
  assert.ok(job.deployResult.metrics.entryCount >= 3);
  assert.ok(job.deployResult.metrics.rssMb > 0);

  // 6. Verify Forge aggregated deployment statistics endpoint
  const forgeStatsRes = await fetch(`${forgeBase}/api/platform/game-deploy/stats`);
  assert.equal(forgeStatsRes.status, 200);
  const forgeStats = await forgeStatsRes.json();
  assert.equal(forgeStats.ok, true);
  assert.equal(forgeStats.totalDeploys, 1);
  assert.equal(forgeStats.succeeded, 1);
  assert.equal(forgeStats.failed, 0);
  assert.equal(forgeStats.successRate, 100);
  assert.ok(forgeStats.transfer.totalBytes > 0);
  assert.ok(forgeStats.transfer.totalDedupSavedBytes > 0);
  assert.ok(forgeStats.usage.peakRssMb > 0);
  assert.ok(forgeStats.usage.totalWorkspaceDiskBytes > 0);
  assert.equal(forgeStats.byPlatform.web.count, 1);
  assert.equal(forgeStats.byPlatform.android.count, 1);
  assert.equal(forgeStats.byPlatform.desktop.count, 1);
  assert.equal(forgeStats.byPlatform.ios.count, 1);
  assert.equal(forgeStats.byFarm.custom.count, 1);
  assert.equal(forgeStats.recent.length, 1);
  assert.equal(forgeStats.recent[0].gameSlug, 'ftl-zip-test');

  // 7. Verify Hub deployment statistics endpoint (requires auth, returns persisted SQLite stats)
  const unauthStatsRes = await fetch(`${devHub.baseUrl}/api/creator/publications/deploy-stats`);
  assert.equal(unauthStatsRes.status, 401);

  const hubStatsRes = await fetch(`${devHub.baseUrl}/api/creator/publications/deploy-stats`, {
    headers: { 'X-PlayHub-Dev-Deploy-Token': devHub.devToken },
  });
  assert.equal(hubStatsRes.status, 200);
  const hubStats = await hubStatsRes.json();
  assert.equal(hubStats.ok, true);
  assert.equal(hubStats.totalDeploys, 1);
  assert.equal(hubStats.succeeded, 1);
  assert.equal(hubStats.failed, 0);
  assert.equal(hubStats.successRate, 100);
  assert.ok(hubStats.transfer.totalBundleBytes > 0);
  assert.ok(hubStats.transfer.totalExpandedBytes > 0);
  assert.ok(hubStats.usage.peakRssMb > 0);
  assert.ok(hubStats.usage.totalStorageBytes > 0);
  assert.equal(hubStats.byPlatform.android, 1);
  assert.equal(hubStats.recent.length, 1);
  assert.equal(hubStats.recent[0].gameId, 'ftl-zip-test');
});

test('Live Hub channel and Live Forge mode fail-closed against farm selection & direct public deploy', async (t) => {
  const liveHub = await createTempHub(t, { deployChannel: 'live', devToken: 'should-be-ignored-in-live' });
  const forgeTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'playforge-live-lock-'));
  t.after(() => fs.rmSync(forgeTmp, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 }));

  const liveForge = createForgeServer({
    hubAuth: false,
    buildMode: 'live',
    workspace: path.join(forgeTmp, 'ws'),
    platformWorkspace: path.join(forgeTmp, 'platform'),
    buildDirectory: path.join(forgeTmp, 'builds'),
    gameDeployDirectory: path.join(forgeTmp, 'game-deploys'),
    defaultFarmUrl: liveHub.baseUrl,
  });
  await new Promise((resolve) => liveForge.listen(0, '127.0.0.1', resolve));
  const forgeBase = `http://127.0.0.1:${liveForge.address().port}`;
  t.after(() => new Promise((resolve) => {
    liveForge.shutdown();
    liveForge.once('close', resolve);
  }));

  const cfg = await (await fetch(`${forgeBase}/api/platform/game-deploy/config`)).json();
  assert.equal(cfg.farmSelectorAllowed, false);

  const probeRes = await fetch(`${forgeBase}/api/platform/game-deploy/probe-farm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ farmId: 'dev-farm-1' }),
  });
  assert.equal(probeRes.status, 403);

  const overrideRes = await fetch(`${forgeBase}/api/platform/game-deploy/jobs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/zip',
      'X-PlayForge-Deploy-Meta': Buffer.from(JSON.stringify({
        gameSlug: 'attempt-farm-override',
        targetFarmId: 'dev-farm-1',
      }), 'utf8').toString('base64'),
    },
    body: makeSampleProjectZip(),
  });
  assert.equal(overrideRes.status, 403);
});

test('Browser notification formatter includes full deploy stats in Dev builds and redacts internal host metrics in Live builds', () => {
  const src = fs.readFileSync(path.join(REPO_ROOT, 'forge/OfficialGodot/publish-panel.js'), 'utf8');
  const sandbox = { window: {}, console };
  sandbox.window = sandbox;
  vm.runInNewContext(src, sandbox, { filename: 'publish-panel.js' });
  const { buildDeployNotificationPayload } = sandbox.PlayForgePublish;
  assert.equal(typeof buildDeployNotificationPayload, 'function');

  const sampleJob = {
    id: 'job1234567890ab',
    title: 'FTL 테스트',
    gameSlug: 'ftl-test',
    status: 'succeeded',
    targetPlatforms: ['web', 'android', 'desktop'],
    targetFarm: { label: 'DEV · 현재' },
    pushToFarm: true,
    bundleBytes: 17 * 1024 * 1024,
    deployResult: { fullPlayUrl: 'https://dev.example/play-ugc/ftl-test/index.html' },
    metrics: {
      phase: 'final',
      transfer: {
        uploadBytes: 14 * 1024 * 1024,
        farmTransferBytes: 17 * 1024 * 1024,
        totalTransferBytes: 31 * 1024 * 1024,
        bundleBytes: 17 * 1024 * 1024,
        dedupSavedBytes: 30 * 1024 * 1024,
        farmThroughputMBps: 18.5,
      },
      timing: {
        totalMs: 12400,
        packageMs: 9800,
        farmUploadMs: 1600,
      },
      usage: {
        cpuTotalMs: 4200,
        peakRssMb: 246.5,
        workspaceDiskBytes: 64 * 1024 * 1024,
      },
    },
  };

  const devPayload = buildDeployNotificationPayload(sampleJob, { isDevBuild: true });
  assert.match(devPayload.title, /^\[DEV 배포 완료\] FTL 테스트/);
  assert.match(devPayload.body, /DEV · 현재/);
  assert.match(devPayload.body, /전송 31\.00 MB/);
  assert.match(devPayload.body, /절감 30\.00 MB/);
  assert.match(devPayload.body, /시간 12\.40s/);
  assert.match(devPayload.body, /CPU 4\.20s/);
  assert.match(devPayload.body, /RAM 246\.5MB/);
  assert.match(devPayload.body, /디스크 64\.00 MB/);

  const livePayload = buildDeployNotificationPayload(sampleJob, { isDevBuild: false });
  assert.match(livePayload.title, /^\[배포 완료\] FTL 테스트/);
  assert.match(livePayload.body, /WEB, ANDROID, DESKTOP/);
  assert.match(livePayload.body, /번들 17\.00 MB/);
  assert.match(livePayload.body, /소요 12\.40s/);
  assert.doesNotMatch(livePayload.body, /RAM|CPU|디스크|DEV · 현재/);

  const devFailPayload = buildDeployNotificationPayload(
    { ...sampleJob, status: 'failed', error: 'EXPORT_FAILED' },
    { isDevBuild: true }
  );
  assert.match(devFailPayload.title, /^\[DEV 배포 실패\]/);
  assert.match(devFailPayload.body, /EXPORT_FAILED/);
  assert.match(devFailPayload.body, /RAM 246\.5MB/);

  const liveFailPayload = buildDeployNotificationPayload(
    { ...sampleJob, status: 'failed', error: 'EXPORT_FAILED' },
    { isDevBuild: false }
  );
  assert.match(liveFailPayload.title, /^\[배포 실패\]/);
  assert.doesNotMatch(liveFailPayload.body, /RAM|CPU|디스크/);
});
