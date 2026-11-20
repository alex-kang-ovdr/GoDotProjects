import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  TARGETS,
  MAX_GOOGLE_PLAY_VERSION_CODE,
  MAX_CLOUD_RUN_REVISION_LENGTH,
  sanitizeBranchSlug,
  computeBuildCode,
  resolveBuildInfo,
  createDefaultReleasePolicy,
  mergeReleasePolicy,
  applyEnvPolicyOverrides,
  COMPAT_DECISIONS,
  COMPAT_REASONS,
  COMPAT_WS_CLOSE_FORCE_UPDATE,
  evaluateCompatibility,
} from './index.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_PATH = path.join(__dirname, 'resolve-build-info.mjs');
const FIXED_DATE = '2026-11-20T16:32:00Z'; // 2026-11-21 01:32:00 KST

test('resolveBuildInfo generates canonical buildId, KST/UTC timestamps, and artifacts for all 6 targets', () => {
  for (const target of TARGETS) {
    const info = resolveBuildInfo({
      target,
      semver: '0.3.0',
      channel: 'live',
      buildNum: 42,
      dailySeq: 1,
      date: FIXED_DATE,
      branch: 'PlayHub-Platform',
      commit: '13c70ba999999999999999999999999999999999',
      dirty: false,
    });
    assert.equal(info.buildId, `${target}-v0.3.0-20261121-0132-playhub-platform-g13c70ba-b42`);
    assert.equal(info.builtAtUtc, '2026-11-20T16:32:00Z');
    assert.equal(info.builtAtKst, '2026-11-21T01:32:00+09:00');
    assert.equal(info.buildCode, 2026112101);
    assert.ok(info.buildCode < MAX_GOOGLE_PLAY_VERSION_CODE);
    assert.equal(info.store.androidVersionCode, 2026112101);
    assert.equal(info.store.iosBundleVersion, '2026112101');
    assert.ok(info.cloudRun.revisionSuffix.length <= MAX_CLOUD_RUN_REVISION_LENGTH);
    assert.match(info.cloudRun.revisionSuffix, /^[a-z][a-z0-9-]{0,62}$/);
    assert.equal(info.artifacts.shaTag, 'sha-13c70ba');
    assert.ok(info.artifacts.primary.length > 0);
  }
});

test('computeBuildCode enforces YYYYMMDDNN format and Google Play Int32 ceiling', () => {
  assert.equal(computeBuildCode('20261121', 0), 2026112100);
  assert.equal(computeBuildCode('20991231', 99), 2099123199);
  assert.throws(() => computeBuildCode('21000101', 0), /Int32 ceiling/);
  assert.throws(() => computeBuildCode('20261121', 100), /between 0 and 99/);
  assert.throws(() => computeBuildCode('261121', 1), /YYYYMMDD/);
});

test('sanitizeBranchSlug normalizes slashes, uppercase, and truncates to 20 chars', () => {
  assert.equal(sanitizeBranchSlug('feature/Store_M1.2+Alpha-Long-Name'), 'feature-store-m1-2-a');
  assert.equal(sanitizeBranchSlug('HEAD'), 'detached');
  assert.equal(sanitizeBranchSlug(''), 'detached');
});

test('dirty working tree is allowed on local/dev and blocked on qa/rc/live', () => {
  const localDirty = resolveBuildInfo({
    target: 'hub',
    semver: '0.3.0',
    channel: 'local',
    date: FIXED_DATE,
    branch: 'PlayHub-Platform',
    commit: '13c70ba',
    dirty: true,
  });
  assert.ok(localDirty.buildId.endsWith('-dirty'));

  for (const strictChannel of ['qa', 'rc', 'live']) {
    assert.throws(
      () =>
        resolveBuildInfo({
          target: 'hub',
          semver: '0.3.0',
          channel: strictChannel,
          date: FIXED_DATE,
          branch: 'PlayHub-Platform',
          commit: '13c70ba',
          dirty: true,
        }),
      /Dirty working tree is blocked/,
    );
  }
});

test('evaluateCompatibility enforces hard technical guardrails even when updatePolicy is optional', () => {
  const server = resolveBuildInfo({
    target: 'hub',
    semver: '0.3.0',
    channel: 'live',
    buildNum: 42,
    dailySeq: 5,
    date: FIXED_DATE,
    branch: 'PlayHub-Platform',
    commit: '13c70ba',
    dirty: false,
    engineAbi: 'godot-4.7',
    engineApiRev: 2,
    minEngineApiRev: 2,
    netProtocol: '1.2',
    gameplayHash: 'rules-v2',
  });
  const policy = createDefaultReleasePolicy({
    updatePolicy: 'optional',
    latestBuildCode: server.buildCode,
  });

  // 1) Exact match -> COMPAT_ALLOW
  const ok = evaluateCompatibility({
    serverBuildInfo: server,
    releasePolicy: policy,
    client: {
      target: 'aos',
      buildCode: server.buildCode,
      engineAbi: 'godot-4.7',
      engineApiRev: 2,
      netProtocol: '1.2',
      gameplayHash: 'rules-v2',
    },
  });
  assert.equal(ok.decision, COMPAT_DECISIONS.ALLOW);
  assert.equal(ok.reason, COMPAT_REASONS.OK);
  assert.equal(ok.httpStatus, 200);
  assert.equal(ok.allowed, true);

  // 2) Dirty client on live -> BLOCK even under optional
  const dirtyBlock = evaluateCompatibility({
    serverBuildInfo: server,
    releasePolicy: policy,
    client: {
      target: 'aos',
      buildId: 'aos-v0.3.0-20261121-0132-dev-g13c70ba-b0-dirty',
      buildCode: server.buildCode,
      dirty: true,
    },
  });
  assert.equal(dirtyBlock.decision, COMPAT_DECISIONS.BLOCK_FORCE_UPDATE);
  assert.equal(dirtyBlock.reason, COMPAT_REASONS.DIRTY_BUILD_BLOCKED);
  assert.equal(dirtyBlock.httpStatus, 426);
  assert.equal(dirtyBlock.wsCloseCode, COMPAT_WS_CLOSE_FORCE_UPDATE);

  // 3) engineAbi mismatch -> BLOCK even under optional
  const abiBlock = evaluateCompatibility({
    serverBuildInfo: server,
    releasePolicy: policy,
    client: { target: 'aos', buildCode: server.buildCode, engineAbi: 'godot-4.6' },
  });
  assert.equal(abiBlock.decision, COMPAT_DECISIONS.BLOCK_FORCE_UPDATE);
  assert.equal(abiBlock.reason, COMPAT_REASONS.ENGINE_ABI_MISMATCH);

  // 4) engineApiRev below min -> BLOCK even under optional
  const apiBlock = evaluateCompatibility({
    serverBuildInfo: server,
    releasePolicy: policy,
    client: { target: 'aos', buildCode: server.buildCode, engineApiRev: 1 },
  });
  assert.equal(apiBlock.decision, COMPAT_DECISIONS.BLOCK_FORCE_UPDATE);
  assert.equal(apiBlock.reason, COMPAT_REASONS.ENGINE_API_REV_MISMATCH);

  // 5) netProtocol major mismatch -> BLOCK even under optional
  const protoMajorBlock = evaluateCompatibility({
    serverBuildInfo: server,
    releasePolicy: policy,
    client: { target: 'aos', buildCode: server.buildCode, netProtocol: '2.0' },
  });
  assert.equal(protoMajorBlock.decision, COMPAT_DECISIONS.BLOCK_FORCE_UPDATE);
  assert.equal(protoMajorBlock.reason, COMPAT_REASONS.PROTOCOL_MAJOR_MISMATCH);
});

test('evaluateCompatibility supports per-target force/optional switching, graceMinutes, and legacy drain pool routing', () => {
  const nowMs = Date.parse('2026-11-21T02:00:00Z');
  const server = resolveBuildInfo({
    target: 'hub',
    semver: '0.3.1',
    channel: 'live',
    buildNum: 50,
    dailySeq: 10,
    date: FIXED_DATE,
    branch: 'PlayHub-Platform',
    commit: '13c70ba',
    dirty: false,
    netProtocol: '1.3',
    gameplayHash: 'rules-v3',
  });

  let policy = createDefaultReleasePolicy({
    updatePolicy: 'optional',
    latestBuildCode: 2026112110,
    updatedAtUtc: '2026-11-21T01:55:00Z', // 5 minutes ago
  });
  policy = mergeReleasePolicy(
    policy,
    {
      targets: {
        aos: {
          updatePolicy: 'force',
          latestBuildCode: 2026112110,
          graceMinutes: 10,
          storeUrl: 'https://play.google.com/store/apps/details?id=com.playhub.app',
          notice: '보안 패치를 위해 업데이트가 필요합니다.',
        },
        ios: {
          updatePolicy: 'optional',
          latestBuildCode: 2026112110,
          storeUrl: 'https://apps.apple.com/app/id000000000',
        },
      },
      activePools: [
        {
          poolId: 'drain-rules-v2',
          gameplayHash: 'rules-v2',
          endpoint: 'wss://legacy-v2.playhub.internal/ws',
          expiresAtUtc: '2026-11-21T03:00:00Z',
        },
      ],
    },
    { nowMs: Date.parse('2026-11-21T01:55:00Z'), updatedBy: 'ops-admin' },
  );

  // AOS older build in lobby -> FORCE BLOCK (426)
  const aosLobby = evaluateCompatibility({
    serverBuildInfo: server,
    releasePolicy: policy,
    nowMs,
    client: { target: 'aos', buildCode: 2026112105, netProtocol: '1.3', gameplayHash: 'rules-v3' },
  });
  assert.equal(aosLobby.decision, COMPAT_DECISIONS.BLOCK_FORCE_UPDATE);
  assert.equal(aosLobby.reason, COMPAT_REASONS.POLICY_FORCE_UPDATE);
  assert.equal(aosLobby.httpStatus, 426);
  assert.equal(aosLobby.action.kind, 'store_update');
  assert.equal(aosLobby.action.storeUrl, 'https://play.google.com/store/apps/details?id=com.playhub.app');

  // AOS older build mid-match within 10m grace -> SOFT ALLOW with updateRequiredAfterMatch
  const aosInMatch = evaluateCompatibility({
    serverBuildInfo: server,
    releasePolicy: policy,
    nowMs,
    client: { target: 'aos', buildCode: 2026112105, inMatch: true, netProtocol: '1.3', gameplayHash: 'rules-v3' },
  });
  assert.equal(aosInMatch.decision, COMPAT_DECISIONS.ALLOW_SOFT_UPDATE);
  assert.equal(aosInMatch.updateRequiredAfterMatch, true);
  assert.ok(aosInMatch.graceRemainingSec > 0);

  // iOS older build at the same time -> OPTIONAL SOFT UPDATE (200)
  const iosLobby = evaluateCompatibility({
    serverBuildInfo: server,
    releasePolicy: policy,
    nowMs,
    client: { target: 'ios', buildCode: 2026112105, netProtocol: '1.3', gameplayHash: 'rules-v3' },
  });
  assert.equal(iosLobby.decision, COMPAT_DECISIONS.ALLOW_SOFT_UPDATE);
  assert.equal(iosLobby.reason, COMPAT_REASONS.POLICY_OPTIONAL_UPDATE);
  assert.equal(iosLobby.httpStatus, 200);
  assert.equal(iosLobby.updateRecommended, true);

  // Older gameplayHash with active drain pool -> COMPAT_ROUTE_LEGACY_POOL
  const legacyDrain = evaluateCompatibility({
    serverBuildInfo: server,
    releasePolicy: policy,
    nowMs,
    client: { target: 'ios', buildCode: 2026112110, netProtocol: '1.3', gameplayHash: 'rules-v2' },
  });
  assert.equal(legacyDrain.decision, COMPAT_DECISIONS.ROUTE_LEGACY_POOL);
  assert.equal(legacyDrain.reason, COMPAT_REASONS.GAME_RELEASE_DRAIN);
  assert.equal(legacyDrain.targetPool.poolId, 'drain-rules-v2');

  // Unknown gameplayHash with no drain pool -> COMPAT_BLOCK_FORCE_UPDATE
  const unknownRules = evaluateCompatibility({
    serverBuildInfo: server,
    releasePolicy: policy,
    nowMs,
    client: { target: 'ios', buildCode: 2026112110, netProtocol: '1.3', gameplayHash: 'rules-v1' },
  });
  assert.equal(unknownRules.decision, COMPAT_DECISIONS.BLOCK_FORCE_UPDATE);
  assert.equal(unknownRules.reason, COMPAT_REASONS.GAMEPLAY_HASH_MISMATCH);

  // Minor netProtocol behind -> COMPAT_ALLOW_SOFT_UPDATE (MINOR_BEHIND)
  const minorBehind = evaluateCompatibility({
    serverBuildInfo: server,
    releasePolicy: policy,
    nowMs,
    client: { target: 'ios', buildCode: 2026112110, netProtocol: '1.1', gameplayHash: 'rules-v3' },
  });
  assert.equal(minorBehind.decision, COMPAT_DECISIONS.ALLOW_SOFT_UPDATE);
  assert.equal(minorBehind.reason, COMPAT_REASONS.MINOR_BEHIND);
});

test('applyEnvPolicyOverrides applies PLAYHUB_UPDATE_POLICY and PLAYHUB_FORCE_TARGETS', () => {
  const base = createDefaultReleasePolicy({ updatePolicy: 'optional' });
  const forcedSubset = applyEnvPolicyOverrides(
    base,
    { PLAYHUB_UPDATE_POLICY: 'optional', PLAYHUB_FORCE_TARGETS: 'hub,forge,aos' },
    2026112103,
  );
  assert.equal(forcedSubset.targets.hub.updatePolicy, 'force');
  assert.equal(forcedSubset.targets['forge-web'].updatePolicy, 'force');
  assert.equal(forcedSubset.targets.aos.updatePolicy, 'force');
  assert.equal(forcedSubset.targets.ios.updatePolicy, 'optional');
  assert.equal(forcedSubset.targets.hub.latestBuildCode, 2026112103);
});

test('CLI emits BUILD_INFO.json and GITHUB_OUTPUT lines cleanly', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'build-ver-cli-'));
  try {
    const outJson = path.join(tmp, 'BUILD_INFO.json');
    const ghOut = path.join(tmp, 'github_output.txt');
    const stdout = execFileSync(
      process.execPath,
      [
        CLI_PATH,
        '--target', 'hub',
        '--semver', '0.3.0',
        '--channel', 'dev',
        '--build-num', '77',
        '--daily-seq', '3',
        '--date', FIXED_DATE,
        '--branch', 'PlayHub-Platform',
        '--commit', '13c70ba000000000000000000000000000000000',
        '--clean',
        '--out-json', outJson,
        '--github-output', ghOut,
        '--output-prefix', 'hub',
      ],
      { encoding: 'utf8' },
    );
    const parsedStdout = JSON.parse(stdout);
    const parsedFile = JSON.parse(fs.readFileSync(outJson, 'utf8'));
    assert.deepEqual(parsedStdout, parsedFile);
    const ghText = fs.readFileSync(ghOut, 'utf8');
    assert.match(ghText, /^hub_build_id=hub-v0\.3\.0-20261121-0132-playhub-platform-g13c70ba-b77$/m);
    assert.match(ghText, /^hub_build_code=2026112103$/m);
    assert.match(ghText, /^hub_sha_tag=sha-13c70ba$/m);
    assert.match(ghText, /^hub_revision=ph-pub-20261121-0132-b77-13c70ba$/m);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
