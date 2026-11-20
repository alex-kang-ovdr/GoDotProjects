import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { resolveCliExitCode, runDeterministicCi } from '../run-deterministic-ci.mjs';
import { archiveBuildToGdrive } from '../archive-gdrive.mjs';
import { pruneDailyBuilds } from '../prune-daily-builds.mjs';
import { runLocalNightly } from '../run-local-nightly.mjs';
import { createManualTriggerPlan, listGitRefs, sanitizeCloudRunTag, validateGitRef } from '../manual-build-test.mjs';
import { generateMorningBriefing, renderMorningBriefingMarkdown } from '../briefing.mjs';
import {
  buildIsolatedPreviewConfig,
  isPreviewServerCommandLine,
  listLocalPreviews,
  startLocalPreview,
  stopLocalPreview,
} from '../local-preview.mjs';
import { resolveRunFilePath } from '../serve-report.mjs';
import { DEFAULT_REPO_ROOT, EXPECTED_GODOT_SUBMODULE_PIN, getGitMetadata, runSubprocess, sha256File } from '../common.mjs';

test('runDeterministicCi --dry-run builds deterministic-only manifest without AI QA stages', async () => {
  const { manifest } = await runDeterministicCi({
    repoRoot: DEFAULT_REPO_ROOT,
    mode: 'cloud',
    dryRun: true,
    runId: 'daily-2026-11-21-0330-test001',
  });
  assert.equal(manifest.kind, 'playhub-deterministic-ci');
  assert.equal(manifest.mode, 'cloud');
  assert.ok(manifest.stages.some((s) => s.id === 'hub_acceptance'));
  assert.ok(manifest.stages.some((s) => s.id === 'source_zip_package'));
  assert.equal(manifest.stages.some((s) => s.id.includes('gamerqa')), false);
});

test('archiveBuildToGdrive copies files, verifies SHA-256, and writes checksum manifest', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-devops-archive-'));
  try {
    const buildDir = path.join(tmp, 'build');
    const gdriveDest = path.join(tmp, 'gdrive');
    fs.mkdirSync(path.join(buildDir, 'packages'), { recursive: true });
    fs.writeFileSync(path.join(buildDir, 'DAILY_REPORT.md'), '# Daily Report\nOK\n', 'utf8');
    fs.writeFileSync(path.join(buildDir, 'packages', 'sample.zip'), 'PK\x03\x04dummy', 'utf8');

    const receipt = archiveBuildToGdrive({
      buildDir,
      runId: 'daily-2026-11-21-0400-abc1234',
      destRoot: gdriveDest,
    });
    assert.equal(receipt.archiveStatus, 'archived');
    assert.equal(receipt.archiveVerified, true);
    assert.equal(receipt.fileCount, 2);
    const copied = path.join(gdriveDest, 'daily-2026-11-21-0400-abc1234', 'packages', 'sample.zip');
    assert.equal(sha256File(copied), sha256File(path.join(buildDir, 'packages', 'sample.zip')));
    assert.ok(fs.existsSync(path.join(gdriveDest, 'daily-2026-11-21-0400-abc1234', 'ARCHIVE_SHA256SUMS.txt')));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('pruneDailyBuilds enforces 14d daily, 90d Monday weekly, and protects latest-good & manifests', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-devops-prune-'));
  try {
    const mkBuild = (name) => {
      const dir = path.join(tmp, name);
      fs.mkdirSync(path.join(dir, 'packages'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'DAILY_BUILD_MANIFEST.json'), '{"ok":true}\n');
      fs.writeFileSync(path.join(dir, 'packages', 'pkg.zip'), 'zip');
    };
    mkBuild('daily-2026-11-20-0400-aaaaaaa');
    mkBuild('daily-2026-10-20-0400-bbbbbbb');
    mkBuild('daily-2026-10-19-0400-ccccccc');
    mkBuild('daily-2026-10-01-0400-ddddddd');

    fs.writeFileSync(path.join(tmp, 'latest-good.json'), JSON.stringify({ runId: 'daily-2026-10-01-0400-ddddddd' }));

    const result = pruneDailyBuilds({
      baseDir: tmp,
      dailyDays: 14,
      weeklyDays: 90,
      now: new Date('2026-11-21T04:00:00+09:00'),
    });

    assert.equal(result.pruned.length, 1);
    assert.equal(result.pruned[0].runId, 'daily-2026-10-20-0400-bbbbbbb');
    assert.equal(fs.existsSync(path.join(tmp, 'daily-2026-10-20-0400-bbbbbbb', 'packages')), false);
    assert.equal(fs.existsSync(path.join(tmp, 'daily-2026-10-20-0400-bbbbbbb', 'DAILY_BUILD_MANIFEST.json')), true);
    assert.equal(fs.existsSync(path.join(tmp, 'daily-2026-10-19-0400-ccccccc', 'packages')), true);
    assert.equal(fs.existsSync(path.join(tmp, 'daily-2026-10-01-0400-ddddddd', 'packages')), true);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('runLocalNightly finalizes Cloud Build manifest into report and Google Drive archive without AI QA', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-devops-nightly-'));
  try {
    const cloudManifestPath = path.join(tmp, 'deterministic-manifest.json');
    const outDir = path.join(tmp, 'out');
    const archiveDir = path.join(tmp, 'gdrive');
    fs.writeFileSync(
      cloudManifestPath,
      JSON.stringify({
        schemaVersion: 1,
        kind: 'playhub-deterministic-ci',
        runId: 'daily-2026-11-21-0330-pass001',
        overallStatus: 'pass',
        git: { branch: 'PlayHub-Platform', commit: '13c70ba000000000000000000000000000000000', shortCommit: '13c70ba', godotSubmodulePin: 'ed1daf0bf001b61586d9930840f2f13940f2f139', recentCommits: [], recentlyChangedFiles: [] },
        summary: { total: 2, pass: 2, fail: 0, error: 0, skip: 0, warn: 0, not_run: 0, deferred_to_local: 0 },
        stages: [
          { id: 'ownership_check', title: 'Ownership', status: 'pass', durationMs: 100, exitCode: 0, message: 'Passed.' },
          { id: 'source_zip_package', title: 'Source ZIP', status: 'pass', durationMs: 500, exitCode: 0, message: 'Passed.' },
        ],
        artifacts: [],
      }),
    );

    const { manifest } = await runLocalNightly({
      repoRoot: DEFAULT_REPO_ROOT,
      cloudManifest: cloudManifestPath,
      outDir,
      archiveDest: archiveDir,
      prune: false,
      dryRun: false,
    });
    assert.equal(manifest.kind, 'playhub-daily-build-archive-manifest');
    assert.equal(manifest.overallStatus, 'pass');
    assert.equal(manifest.stages.some((s) => s.id.includes('gpu') || s.id.includes('gamerqa')), false);
    assert.ok(fs.existsSync(path.join(outDir, 'DAILY_REPORT.md')));
    assert.ok(fs.existsSync(path.join(outDir, 'DAILY_REPORT.html')));
    assert.equal(manifest.archive.archiveStatus, 'archived');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('manual-build-test validates git refs safely and generates isolated local/dev plans', () => {
  const refs = listGitRefs(DEFAULT_REPO_ROOT, 5);
  assert.ok(refs.branches.length > 0);
  assert.ok(refs.commits.length > 0);

  assert.throws(() => validateGitRef(DEFAULT_REPO_ROOT, '--evil;rm -rf /'), /Invalid or unsafe/);
  assert.throws(() => validateGitRef(DEFAULT_REPO_ROOT, 'main..HEAD'), /Invalid or unsafe/);

  const localPlan = createManualTriggerPlan({
    repoRoot: DEFAULT_REPO_ROOT,
    ref: 'HEAD',
    buildTarget: 'local',
    testTarget: 'local-preview',
    localBasePort: 18280,
  });
  assert.equal(localPlan.isolation.ports.userPort, 18280);
  assert.match(localPlan.isolation.devUrlPattern, /^http:\/\/127\.0\.0\.1:18280\/$/);

  const devTagPlan = createManualTriggerPlan({
    repoRoot: DEFAULT_REPO_ROOT,
    ref: 'HEAD',
    buildTarget: 'cloudbuild',
    testTarget: 'dev-tag',
  });
  assert.equal(devTagPlan.devDeployment.trafficPercent, 0);
  assert.equal(devTagPlan.devDeployment.revisionTag, sanitizeCloudRunTag('rev', devTagPlan.source.shortCommit));
  assert.match(devTagPlan.isolation.devUrlPattern, /^https:\/\/rev-[a-f0-9]{7}---playhub-hub-/);
});

test('briefing detects PASS, FAIL with suspected owners, and MISSED_TODAY read-only', async () => {
  const passBrief = await generateMorningBriefing({
    repoRoot: DEFAULT_REPO_ROOT,
    todayKst: '2026-11-21',
    manifestObject: {
      runId: 'daily-2026-11-21-0330-13c70ba',
      overallStatus: 'pass',
      durationMs: 120000,
      git: { branch: 'PlayHub-Platform', shortCommit: '13c70ba', recentCommits: [{ sha: '13c70ba', subject: 'test commit' }], recentlyChangedFiles: [] },
      summary: { pass: 5, fail: 0, error: 0, skip: 0 },
      stages: [{ id: 'hub_acceptance', title: 'Hub', status: 'pass', message: 'Passed.' }],
      archive: { archiveStatus: 'archived', archiveVerified: true, fileCount: 3, destinationDir: 'G:\\My Drive\\PlayHub-Daily-Builds\\daily-2026-11-21-0330-13c70ba' },
      artifacts: [],
    },
  });
  assert.equal(passBrief.readOnly, true);
  assert.equal(passBrief.verdict, 'PASS');
  assert.equal(passBrief.missedToday, false);
  const md = renderMorningBriefingMarkdown(passBrief);
  assert.match(md, /오늘 빌드 판정.*PASS/);
  assert.match(md, /아카이브 확인.*archived/);

  const missedBrief = await generateMorningBriefing({
    repoRoot: DEFAULT_REPO_ROOT,
    todayKst: '2026-11-21',
    manifestObject: {
      runId: 'daily-2026-11-20-0330-13c70ba',
      overallStatus: 'pass',
      durationMs: 10000,
      git: { branch: 'PlayHub-Platform', shortCommit: '13c70ba', recentCommits: [], recentlyChangedFiles: [] },
      summary: { pass: 1, fail: 0, error: 0, skip: 0 },
      stages: [],
      artifacts: [],
    },
  });
  assert.equal(missedBrief.verdict, 'MISSED_TODAY');
  assert.equal(missedBrief.missedToday, true);

  const failBrief = await generateMorningBriefing({
    repoRoot: DEFAULT_REPO_ROOT,
    todayKst: '2026-11-21',
    manifestObject: {
      runId: 'daily-2026-11-21-0330-13c70ba',
      overallStatus: 'fail',
      durationMs: 42000,
      git: { branch: 'PlayHub-Platform', shortCommit: '13c70ba', recentCommits: [], recentlyChangedFiles: ['store/server/store-api.mjs'] },
      summary: { pass: 3, fail: 1, error: 0, skip: 0 },
      stages: [{ id: 'store_tests', title: 'Store Tests', status: 'fail', exitCode: 1, message: 'Failed.', tail: 'AssertionError: bad status' }],
      artifacts: [],
    },
  });
  assert.equal(failBrief.verdict, 'FAIL');
  assert.equal(failBrief.failingStages.length, 1);
  assert.equal(failBrief.suspectedOwners[0].branch, 'PlayHub-Store');
});

test('local-preview isolates ports away from default platform ports', () => {
  assert.throws(() => buildIsolatedPreviewConfig({ basePort: 8080, dataDir: os.tmpdir() }), /collides with default/);
  const cfg = buildIsolatedPreviewConfig({ basePort: 18280, dataDir: path.join(os.tmpdir(), 'preview-data') });
  assert.equal(cfg.publicHost, '127.0.0.1');
  assert.equal(cfg.adminHost, '127.0.0.1');
  assert.equal(cfg.userPort, 18280);
  assert.equal(cfg.adminUiPort, 18281);
  assert.equal(cfg.publicPort, 18290);
  assert.equal(cfg.adminPort, 18291);
  assert.equal(Array.isArray(listLocalPreviews(DEFAULT_REPO_ROOT)), true);
});

test('EXPECTED_GODOT_SUBMODULE_PIN matches HEAD godot-engine gitlink', () => {
  const git = getGitMetadata(DEFAULT_REPO_ROOT);
  assert.equal(git.godotSubmodulePin, EXPECTED_GODOT_SUBMODULE_PIN);
});

test('cloudbuild.daily.yaml escapes shell/JS variables, enables dynamic/loose substitutions, and uploads before failing', () => {
  const yamlPath = path.join(DEFAULT_REPO_ROOT, 'tools', 'devops', 'cloudbuild.daily.yaml');
  const content = fs.readFileSync(yamlPath, 'utf8');

  assert.match(content, /^\s*dynamicSubstitutions:\s*true\s*$/m);
  assert.match(content, /^\s*substitutionOption:\s*ALLOW_LOOSE\s*$/m);
  assert.match(content, /\$\$\{OUT_DIR\}/);
  assert.match(content, /\$\$\{runId\}/);

  // Every unescaped ${...} (not preceded by another $) must be a known Cloud Build substitution.
  const allowedSubstitutions = new Set([
    '_MODE',
    '_RUN_ID',
    '_ARCHIVE_BUCKET',
    '_DEPLOY_DEV_TAG',
    'BUILD_ID',
    'PROJECT_ID',
    'COMMIT_SHA',
    'SHORT_SHA',
    'BRANCH_NAME',
  ]);
  const unescaped = [];
  for (const m of content.matchAll(/(?<!\$)\$\{([^}]+)\}/g)) {
    if (!allowedSubstitutions.has(m[1])) unescaped.push(m[0]);
  }
  assert.deepEqual(unescaped, []);

  // Upload step must run before final CI verdict enforcement step.
  const stepIds = [...content.matchAll(/^\s*-\s+id:\s*"([^"]+)"/gm)].map((m) => m[1]);
  const uploadIdx = stepIds.indexOf('upload-reports-to-gcs');
  const enforceIdx = stepIds.indexOf('enforce-ci-status');
  assert.ok(uploadIdx >= 0, 'upload-reports-to-gcs step must exist');
  assert.ok(enforceIdx > uploadIdx, 'enforce-ci-status must run after upload-reports-to-gcs');
  assert.equal(enforceIdx, stepIds.length - 1, 'enforce-ci-status must be the final step');
});

test('run-deterministic-ci defers CLI failure exit in cloud mode and handles missing .git with COMMIT_SHA fallback', async () => {
  assert.equal(resolveCliExitCode({ overallStatus: 'fail' }, { mode: 'cloud' }), 0);
  assert.equal(resolveCliExitCode({ overallStatus: 'fail' }, { mode: 'local' }), 1);
  assert.equal(resolveCliExitCode({ overallStatus: 'pass' }, { mode: 'local' }), 0);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-devops-nogit-'));
  try {
    const fakeSha = '1234567890abcdef1234567890abcdef12345678';
    const git = getGitMetadata(tmp, { COMMIT_SHA: fakeSha, BRANCH_NAME: 'PlayHub-Platform' });
    assert.equal(git.hasGit, false);
    assert.equal(git.commit, fakeSha);
    assert.equal(git.shortCommit, '1234567');
    assert.equal(git.branch, 'PlayHub-Platform');
    assert.equal(git.godotSubmodulePin, null);

    const outOk = path.join(tmp, 'out-nogit');
    const { manifest } = await runDeterministicCi({
      repoRoot: tmp,
      mode: 'cloud',
      runId: 'daily-2026-11-21-0330-1234567',
      outDir: outOk,
      skipStages: new Set([
        'hub_acceptance',
        'deployment_preflight_test',
        'source_package_unit_test',
        'forge_tests',
        'hub_forge_integration',
        'source_zip_package',
      ]),
      env: { ...process.env, COMMIT_SHA: fakeSha, BRANCH_NAME: 'PlayHub-Platform' },
    });
    assert.equal(manifest.git.commit, fakeSha);
    assert.equal(manifest.git.shortCommit, '1234567');
    const pinStage = manifest.stages.find((s) => s.id === 'submodule_pin');
    const ownStage = manifest.stages.find((s) => s.id === 'ownership_check');
    assert.equal(pinStage?.status, 'not_run');
    assert.equal(ownStage?.status, 'not_run');
    assert.notEqual(manifest.overallStatus, 'fail');

    // End-to-end CLI exit code: failing stage still exits 0 in cloud mode (manifest written), 1 in local mode.
    const scriptPath = path.join(DEFAULT_REPO_ROOT, 'tools', 'devops', 'run-deterministic-ci.mjs');
    const commonArgs = [
      scriptPath,
      '--repo-root',
      tmp,
      '--skip-stages',
      'hub_acceptance,source_package_unit_test,source_zip_package',
    ];
    const cloudOut = path.join(tmp, 'out-cloud-fail');
    const cloudRes = await runSubprocess(process.execPath, [...commonArgs, '--mode', 'cloud', '--out-dir', cloudOut], {
      cwd: DEFAULT_REPO_ROOT,
      env: { ...process.env, COMMIT_SHA: fakeSha },
      timeoutMs: 30000,
    });
    assert.equal(cloudRes.exitCode, 0);
    const cloudManifest = JSON.parse(fs.readFileSync(path.join(cloudOut, 'deterministic-manifest.json'), 'utf8'));
    assert.equal(cloudManifest.overallStatus, 'fail');
    assert.equal(cloudManifest.git.commit, fakeSha);

    const localOut = path.join(tmp, 'out-local-fail');
    const localRes = await runSubprocess(process.execPath, [...commonArgs, '--mode', 'local', '--out-dir', localOut], {
      cwd: DEFAULT_REPO_ROOT,
      env: { ...process.env, COMMIT_SHA: fakeSha },
      timeoutMs: 30000,
    });
    assert.equal(localRes.exitCode, 1);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('serve-report resolveRunFilePath blocks previews case-insensitively and blocks path traversal', () => {
  const root = path.join(os.tmpdir(), 'playhub-builds-root');
  assert.equal(resolveRunFilePath(root, 'previews/run1/preview-state.json'), null);
  assert.equal(resolveRunFilePath(root, 'Previews/run1/preview-state.json'), null);
  assert.equal(resolveRunFilePath(root, 'PREVIEWS/run1/preview-state.json'), null);
  assert.equal(resolveRunFilePath(root, './PrEvIeWs/run1/preview-state.json'), null);
  assert.equal(resolveRunFilePath(root, 'previews'), null);
  assert.equal(resolveRunFilePath(root, '../secret.json'), null);
  assert.equal(resolveRunFilePath(root, 'daily-2026-11-21\\report.html'), null);

  const okPath = resolveRunFilePath(root, 'daily-2026-11-21/deterministic-report.html');
  assert.equal(okPath, path.resolve(root, 'daily-2026-11-21', 'deterministic-report.html'));
});

test('local-preview verifies PID command line before killing and cleans up worktree + state on start failure', async () => {
  const cfgPath = path.join('D:', 'tmp', 'previews', 'preview-1', 'preview-config.json');
  assert.equal(
    isPreviewServerCommandLine(`"C:\\node\\node.exe" hub/tools/dev.mjs --config "${cfgPath}"`, { configPath: cfgPath }),
    true,
  );
  assert.equal(
    isPreviewServerCommandLine(`"C:\\node\\node.exe" hub/tools/dev.mjs --config "${cfgPath.toUpperCase()}"`, { configPath: cfgPath }),
    process.platform === 'win32',
  );
  assert.equal(
    isPreviewServerCommandLine('C:\\Windows\\notepad.exe', { configPath: cfgPath }),
    false,
  );
  assert.equal(
    isPreviewServerCommandLine(`node hub/tools/dev.mjs --config "D:\\other\\preview-config.json"`, { configPath: cfgPath }),
    false,
  );

  // stopLocalPreview must NOT kill an unrelated live process (using our own PID as a safe sentinel).
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-devops-preview-'));
  try {
    const runId = 'preview-2026-11-21-0300-deadbee';
    const previewDir = path.join(tmp, 'artifacts', 'daily-builds', 'previews', runId);
    fs.mkdirSync(previewDir, { recursive: true });
    fs.writeFileSync(
      path.join(previewDir, 'preview-state.json'),
      JSON.stringify({
        schemaVersion: 1,
        status: 'running',
        runId,
        pid: process.pid,
        useDetachedWorktree: false,
        checkoutDir: tmp,
        previewDir,
        configPath: path.join(previewDir, 'preview-config.json'),
      }),
    );
    const stopRes = stopLocalPreview({ repoRoot: tmp, runId, cleanup: false });
    assert.equal(stopRes.stopped, false);
    assert.equal(stopRes.pidVerified, false);

    // startLocalPreview records state up front and removes detached worktree in finally when build fails.
    const repoDir = path.join(tmp, 'mini-repo');
    fs.mkdirSync(repoDir, { recursive: true });
    execFileSync('git', ['-C', repoDir, 'init'], { stdio: 'pipe', windowsHide: true });
    execFileSync('git', ['-C', repoDir, 'config', 'user.email', 'ci@example.com'], { stdio: 'pipe', windowsHide: true });
    execFileSync('git', ['-C', repoDir, 'config', 'user.name', 'CI'], { stdio: 'pipe', windowsHide: true });
    fs.writeFileSync(path.join(repoDir, 'README.md'), '# test\n', 'utf8');
    execFileSync('git', ['-C', repoDir, 'add', 'README.md'], { stdio: 'pipe', windowsHide: true });
    execFileSync('git', ['-C', repoDir, 'commit', '-m', 'init'], { stdio: 'pipe', windowsHide: true });

    await assert.rejects(
      () => startLocalPreview({ repoRoot: repoDir, ref: 'HEAD', basePort: 19280, useDetachedWorktree: true }),
      /Preview build failed/,
    );
    const previews = listLocalPreviews(repoDir);
    assert.equal(previews.length, 1);
    assert.equal(previews[0].status, 'failed');
    assert.equal(previews[0].pid, null);
    assert.ok(previews[0].stoppedAt);
    assert.equal(fs.existsSync(previews[0].checkoutDir), false, 'detached worktree should be removed on failure');

    const cleanupRes = stopLocalPreview({ repoRoot: repoDir, runId: previews[0].runId, cleanup: true });
    assert.equal(cleanupRes.cleaned, true);
    assert.equal(fs.existsSync(previews[0].previewDir), false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('common.runSubprocess handles synchronous spawn error without timer TDZ ReferenceError', async () => {
  const res = await runSubprocess(null, []);
  assert.equal(res.exitCode, null);
  assert.equal(res.code, 'START_FAILED');
  assert.equal(typeof res.error, 'string');
});
