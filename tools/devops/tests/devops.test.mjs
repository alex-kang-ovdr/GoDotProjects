import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runDeterministicCi } from '../run-deterministic-ci.mjs';
import { archiveBuildToGdrive } from '../archive-gdrive.mjs';
import { pruneDailyBuilds } from '../prune-daily-builds.mjs';
import { runLocalNightly } from '../run-local-nightly.mjs';
import { createManualTriggerPlan, listGitRefs, sanitizeCloudRunTag, validateGitRef } from '../manual-build-test.mjs';
import { generateMorningBriefing, renderMorningBriefingMarkdown } from '../briefing.mjs';
import { buildIsolatedPreviewConfig, listLocalPreviews } from '../local-preview.mjs';
import { DEFAULT_REPO_ROOT, sha256File } from '../common.mjs';

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
