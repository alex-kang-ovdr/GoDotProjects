#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_REPO_ROOT,
  EXPECTED_GODOT_SUBMODULE_PIN,
  ensureForgeNodeModules,
  ensureHubNodeModules,
  escapeHtml,
  formatDuration,
  formatKstDate,
  formatKstRunId,
  getGitMetadata,
  hasPythonModule,
  isExistingDir,
  isExistingFile,
  mapSuspectedOwners,
  resolveNode24,
  resolvePython,
  runSubprocess,
  sha256File,
  summarizeStageStatuses,
  writeJsonAtomic,
} from './common.mjs';

function parseArgs(argv) {
  const opts = {
    repoRoot: DEFAULT_REPO_ROOT,
    mode: 'local', // cloud | local
    runId: null,
    outDir: null,
    skipStages: new Set(),
    withBrowser: false,
    expectedGodotPin: EXPECTED_GODOT_SUBMODULE_PIN,
    dryRun: false,
    json: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--help' || token === '-h') { opts.help = true; continue; }
    if (token === '--dry-run') { opts.dryRun = true; continue; }
    if (token === '--with-browser') { opts.withBrowser = true; continue; }
    if (token === '--json') { opts.json = true; continue; }
    const eq = token.indexOf('=');
    const key = eq > 0 ? token.slice(0, eq) : token;
    const val = eq > 0 ? token.slice(eq + 1) : argv[++i];
    if (val === undefined) throw new Error(`Missing value for ${key}`);
    if (key === '--repo-root') opts.repoRoot = path.resolve(val);
    else if (key === '--mode') {
      if (!['cloud', 'local'].includes(val)) throw new Error('--mode must be cloud or local');
      opts.mode = val;
    } else if (key === '--run-id') opts.runId = val;
    else if (key === '--out-dir') opts.outDir = path.resolve(val);
    else if (key === '--skip-stages') {
      for (const s of val.split(',').map((x) => x.trim()).filter(Boolean)) opts.skipStages.add(s);
    } else if (key === '--expected-godot-pin') opts.expectedGodotPin = val;
    else throw new Error(`Unknown option: ${key}`);
  }
  return opts;
}

function listMatchingFiles(dirPath, predicate) {
  if (!isExistingDir(dirPath)) return [];
  return fs
    .readdirSync(dirPath)
    .filter((name) => predicate(name))
    .sort()
    .map((name) => path.join(dirPath, name));
}

export function renderDeterministicMarkdown(manifest) {
  const lines = [
    `# PlayHub Deterministic CI Report (${manifest.runId})`,
    '',
    `- **Overall Status**: \`${manifest.overallStatus.toUpperCase()}\``,
    `- **Execution Mode**: \`${manifest.mode}\``,
    `- **Commit**: \`${manifest.git.shortCommit}\` (\`${manifest.git.branch}\`)`,
    `- **Godot Submodule Pin**: \`${manifest.git.godotSubmodulePin || 'unavailable'}\``,
    `- **Started / Finished**: ${manifest.startedAt} → ${manifest.finishedAt} (${formatDuration(manifest.durationMs)})`,
    `- **Summary**: pass ${manifest.summary.pass} · warn ${manifest.summary.warn} · fail ${manifest.summary.fail} · error ${manifest.summary.error} · skip ${manifest.summary.skip} · deferred_to_local ${manifest.summary.deferred_to_local}`,
    '',
    '## Stage Matrix',
    '',
    '| Stage | Title | Status | Duration | Notes |',
    '|---|---|---|---:|---|',
  ];
  for (const s of manifest.stages) {
    lines.push(
      `| \`${s.id}\` | ${s.title} | **${s.status.toUpperCase()}** | ${formatDuration(s.durationMs)} | ${s.message || ''} |`,
    );
  }
  if (manifest.artifacts.length) {
    lines.push('', '## Produced Artifacts', '', '| File | Size (bytes) | SHA-256 |', '|---|---:|---|');
    for (const a of manifest.artifacts) {
      lines.push(`| \`${a.relativePath}\` | ${a.bytes} | \`${a.sha256}\` |`);
    }
  }
  if (manifest.suspectedOwners.length) {
    lines.push('', '## Recently Touched Ownership Areas (24h)', '');
    for (const owner of manifest.suspectedOwners) {
      lines.push(`- **${owner.branch}** (${owner.role}): ${owner.files.length} file(s)`);
    }
  }
  return lines.join('\n') + '\n';
}

export function renderDeterministicHtml(manifest) {
  const rows = manifest.stages
    .map(
      (s) =>
        `<tr class="st-${escapeHtml(s.status)}"><td><code>${escapeHtml(s.id)}</code></td><td>${escapeHtml(s.title)}</td><td><strong>${escapeHtml(s.status.toUpperCase())}</strong></td><td>${escapeHtml(formatDuration(s.durationMs))}</td><td>${escapeHtml(s.message || '')}</td></tr>`,
    )
    .join('');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PlayHub Deterministic CI — ${escapeHtml(manifest.runId)}</title><style>body{font:14px/1.6 system-ui,sans-serif;background:#f5f7f6;color:#182b24;max-width:1100px;margin:28px auto;padding:0 18px}header,section{background:#fff;border:1px solid #d7e2dc;border-radius:12px;padding:20px;margin:16px 0}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #e4ece8;padding:10px;text-align:left;vertical-align:top}.st-pass strong{color:#157347}.st-fail strong,.st-error strong{color:#b02a37}.st-skip strong,.st-deferred_to_local strong,.st-warn strong{color:#9a6700}code{font-size:12px}</style></head><body><header><h1>PlayHub Deterministic CI — ${escapeHtml(manifest.runId)}</h1><p><strong>${escapeHtml(manifest.overallStatus.toUpperCase())}</strong> · mode <code>${escapeHtml(manifest.mode)}</code> · commit <code>${escapeHtml(manifest.git.shortCommit)}</code> (${escapeHtml(manifest.git.branch)}) · ${escapeHtml(formatDuration(manifest.durationMs))}</p><p>pass ${manifest.summary.pass} / fail ${manifest.summary.fail} / error ${manifest.summary.error} / skip ${manifest.summary.skip} / deferred_to_local ${manifest.summary.deferred_to_local}</p></header><section><table><thead><tr><th>Stage</th><th>항목</th><th>상태</th><th>소요</th><th>설명</th></tr></thead><tbody>${rows}</tbody></table></section></body></html>\n`;
}

export async function runDeterministicCi(rawOpts = {}) {
  const opts = {
    repoRoot: DEFAULT_REPO_ROOT,
    mode: 'local',
    runId: null,
    outDir: null,
    skipStages: new Set(),
    withBrowser: false,
    expectedGodotPin: EXPECTED_GODOT_SUBMODULE_PIN,
    dryRun: false,
    ...rawOpts,
  };
  const startedAt = new Date();
  const startedMs = Date.now();
  const repoRoot = path.resolve(opts.repoRoot);
  const git = getGitMetadata(repoRoot);
  const runId = opts.runId || formatKstRunId(git.shortCommit, startedAt);
  const outDir = opts.outDir || path.join(repoRoot, 'artifacts', 'daily-builds', runId);
  const logsDir = path.join(outDir, 'logs');
  const reportsDir = path.join(outDir, 'reports');
  const packagesDir = path.join(outDir, 'packages');

  if (!opts.dryRun) {
    fs.mkdirSync(logsDir, { recursive: true });
    fs.mkdirSync(reportsDir, { recursive: true });
    fs.mkdirSync(packagesDir, { recursive: true });
    ensureHubNodeModules(repoRoot);
    ensureForgeNodeModules(repoRoot);
  }

  const node24 = resolveNode24(repoRoot);
  const python = resolvePython();
  const stages = [];
  const artifacts = [];

  const recordStage = (entry) => {
    stages.push(entry);
    return entry;
  };

  const execStage = async ({ id, title, executable, args, cwd = repoRoot, timeoutMs = 300000, env = process.env, reportFile = null }) => {
    if (opts.skipStages.has(id)) {
      return recordStage({ id, title, status: 'skip', exitCode: null, durationMs: 0, message: 'Skipped by --skip-stages flag.' });
    }
    if (opts.dryRun) {
      return recordStage({
        id,
        title,
        status: 'not_run',
        exitCode: null,
        durationMs: 0,
        command: [executable, ...args].join(' '),
        message: 'Dry-run planned command.',
      });
    }
    const logFile = path.join(logsDir, `${id}.log`);
    const res = await runSubprocess(executable, args, { cwd, env, timeoutMs, logFile });
    const passed = res.exitCode === 0;
    return recordStage({
      id,
      title,
      status: passed ? 'pass' : res.code === 'TOOL_NOT_FOUND' || res.code === 'START_FAILED' ? 'error' : 'fail',
      exitCode: res.exitCode,
      code: res.code,
      durationMs: res.durationMs,
      logFile: path.relative(outDir, logFile).replaceAll('\\', '/'),
      ...(reportFile && isExistingFile(reportFile) ? { reportFile: path.relative(outDir, reportFile).replaceAll('\\', '/') } : {}),
      message: passed ? 'Passed.' : `Failed (${res.code}, exit ${res.exitCode}).`,
      ...(passed ? {} : { tail: res.tail.slice(-2000) }),
    });
  };

  // Stage 0a: Worktree ownership check
  await execStage({
    id: 'ownership_check',
    title: '워크트리 소유권 검증 (check-ownership.mjs)',
    executable: node24,
    args: ['tools/worktree-ownership/check-ownership.mjs'],
  });

  // Stage 0b: Godot submodule pin verification
  if (opts.skipStages.has('submodule_pin')) {
    recordStage({ id: 'submodule_pin', title: 'godot-engine 서브모듈 커밋 핀 검증', status: 'skip', exitCode: null, durationMs: 0, message: 'Skipped by flag.' });
  } else if (opts.dryRun) {
    recordStage({ id: 'submodule_pin', title: 'godot-engine 서브모듈 커밋 핀 검증', status: 'not_run', exitCode: null, durationMs: 0, message: `Expected pin ${opts.expectedGodotPin}` });
  } else {
    const matched = git.godotSubmodulePin === opts.expectedGodotPin;
    recordStage({
      id: 'submodule_pin',
      title: 'godot-engine 서브모듈 커밋 핀 검증',
      status: matched ? 'pass' : 'fail',
      exitCode: matched ? 0 : 1,
      durationMs: 1,
      expected: opts.expectedGodotPin,
      actual: git.godotSubmodulePin,
      message: matched ? `Pinned at ${git.godotSubmodulePin.slice(0, 12)}` : `Pin mismatch (actual: ${git.godotSubmodulePin || 'missing'})`,
    });
  }

  // Stage 1a: Hub acceptance (build + verify + HTTP smoke + optional python contracts when jsonschema is installed)
  const hasJsonSchema = !opts.dryRun && python ? hasPythonModule(python, 'jsonschema') : false;
  if (!opts.dryRun && !opts.skipStages.has('hub_acceptance')) {
    // Pre-sync webgames before acceptance so SOURCE_STABILITY compares identical pre/post line endings.
    await runSubprocess(node24, ['tools/sync-webgames.mjs'], {
      cwd: path.join(repoRoot, 'hub'),
      timeoutMs: 120000,
    });
  }
  const hubReport = path.join(reportsDir, 'hub-acceptance.json');
  const hubArgs = ['tools/acceptance.mjs', '--report', hubReport];
  if (hasJsonSchema) hubArgs.push('--with-python');
  await execStage({
    id: 'hub_acceptance',
    title: `Hub 통합 빌드·회귀·HTTP 검증${hasJsonSchema ? ' (+ Python 계약)' : ' (Node 코어)'}`,
    executable: node24,
    args: hubArgs,
    cwd: path.join(repoRoot, 'hub'),
    timeoutMs: 420000,
    env: { ...process.env, ...(hasJsonSchema ? { PLAYHUB_PYTHON: python } : {}) },
    reportFile: hubReport,
  });

  // Stage 1b: Store contract & API tests (browser UI test gated by --with-browser)
  const storeTests = listMatchingFiles(path.join(repoRoot, 'store', 'tests'), (n) => n.endsWith('.test.mjs'));
  if (storeTests.length) {
    const storeArgs = ['--test'];
    if (!opts.withBrowser) storeArgs.push('--test-skip-pattern=Store web UI connects to live server');
    storeArgs.push(...storeTests);
    await execStage({
      id: 'store_tests',
      title: `PlayForge Store 계약·API 테스트${opts.withBrowser ? ' (+ 브라우저 UI)' : ' (Node API)'}`,
      executable: node24,
      args: storeArgs,
    });
  }

  // Stage 1c: CDN & L10N unit tests (*.browser.test.mjs gated by --with-browser)
  const cdnL10nTests = listMatchingFiles(
    path.join(repoRoot, 'hub', 'tests'),
    (n) =>
      (n.startsWith('cdn') || n.startsWith('l10n') || n === 'locales-deployment.test.mjs') &&
      n.endsWith('.mjs') &&
      (opts.withBrowser || !n.endsWith('.browser.test.mjs')),
  );
  if (cdnL10nTests.length) {
    await execStage({
      id: 'cdn_l10n_tests',
      title: `PlayHub CDN & L10N 단위 회귀 테스트${opts.withBrowser ? ' (+ 브라우저)' : ' (Node 단위)'}`,
      executable: node24,
      args: ['--test', ...cdnL10nTests],
    });
  }

  // Stage 1d: Deployment preflight + source package unit tests
  await execStage({
    id: 'deployment_preflight_test',
    title: '배포 Preflight 단위 테스트',
    executable: node24,
    args: ['--test', path.join(repoRoot, 'tests', 'deployment', 'preflight.test.cjs')],
  });

  if (python) {
    await execStage({
      id: 'source_package_unit_test',
      title: 'Source ZIP 패키저 단위 테스트 (Python)',
      executable: python,
      args: ['-m', 'unittest', 'tests/deployment/test_source_package.py'],
    });
  } else {
    recordStage({
      id: 'source_package_unit_test',
      title: 'Source ZIP 패키저 단위 테스트 (Python)',
      status: 'error',
      exitCode: null,
      durationMs: 0,
      message: 'Python interpreter not found.',
    });
  }

  // Stage 2: Forge unit tests + Hub-Forge integration
  const forgeHasDeps = isExistingDir(path.join(repoRoot, 'forge', 'node_modules', 'ws'));
  if (forgeHasDeps || opts.dryRun) {
    await execStage({
      id: 'forge_tests',
      title: 'Forge 코어·멀티플레이·애드온 회귀 테스트',
      executable: node24,
      args: ['Tools/run-tests.cjs'],
      cwd: path.join(repoRoot, 'forge'),
      timeoutMs: 420000,
    });
    await execStage({
      id: 'hub_forge_integration',
      title: 'Hub–Forge 통합·원격 세션 검증 테스트',
      executable: node24,
      args: [
        '--test',
        path.join(repoRoot, 'tests', 'deployment', 'hub-forge-integration.test.mjs'),
        path.join(repoRoot, 'tests', 'deployment', 'hub-forge-platform-parity.test.mjs'),
      ],
      timeoutMs: 300000,
    });
  } else {
    recordStage({
      id: 'forge_tests',
      title: 'Forge 코어·멀티플레이·애드온 회귀 테스트',
      status: 'skip',
      exitCode: null,
      durationMs: 0,
      message: 'forge/node_modules not installed in this checkout (run npm ci in forge/).',
    });
    recordStage({
      id: 'hub_forge_integration',
      title: 'Hub–Forge 통합·원격 세션 검증 테스트',
      status: 'skip',
      exitCode: null,
      durationMs: 0,
      message: 'forge/node_modules not installed in this checkout.',
    });
  }

  // Stage 4: Clean Source ZIP artifact packaging
  if (python) {
    const versionTag = `0.3.0-daily.${formatKstDate(startedAt).replaceAll('-', '')}.${git.shortCommit}`;
    const sourceZipPath = path.join(packagesDir, `PlayHub-Platform-Source-${versionTag}.zip`);
    const stageRes = await execStage({
      id: 'source_zip_package',
      title: '클린 소스 아카이브 ZIP 생성·시크릿 스캔·SHA256 검증',
      executable: python,
      args: [path.join(repoRoot, 'tools', 'build', 'package_source.py'), '--version', versionTag, '--output', sourceZipPath],
      timeoutMs: 300000,
    });
    if (!opts.dryRun && stageRes.status === 'pass' && isExistingFile(sourceZipPath)) {
      artifacts.push({
        kind: 'source-zip',
        relativePath: path.relative(outDir, sourceZipPath).replaceAll('\\', '/'),
        bytes: fs.statSync(sourceZipPath).size,
        sha256: sha256File(sourceZipPath),
      });
    }
  }

  const finishedAt = new Date();
  const { counts, overallStatus } = summarizeStageStatuses(stages);
  const suspectedOwners = mapSuspectedOwners(repoRoot, git.recentlyChangedFiles);

  const manifest = {
    schemaVersion: 1,
    kind: 'playhub-deterministic-ci',
    runId,
    mode: opts.mode,
    dryRun: opts.dryRun,
    overallStatus,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: Date.now() - startedMs,
    environment: {
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      node24Path: node24,
      python: python || null,
      cloudBuildId: process.env.BUILD_ID || null,
      gcpProjectId: process.env.PROJECT_ID || null,
    },
    git,
    summary: counts,
    stages,
    artifacts,
    suspectedOwners,
  };

  if (!opts.dryRun) {
    writeJsonAtomic(path.join(outDir, 'deterministic-manifest.json'), manifest);
    fs.writeFileSync(path.join(outDir, 'deterministic-report.md'), renderDeterministicMarkdown(manifest), 'utf8');
    fs.writeFileSync(path.join(outDir, 'deterministic-report.html'), renderDeterministicHtml(manifest), 'utf8');
  }

  return { manifest, outDir };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const opts = parseArgs(process.argv.slice(2));
    if (opts.help) {
      console.log(
        'Usage: node tools/devops/run-deterministic-ci.mjs [--mode cloud|local] [--run-id ID] [--out-dir DIR] [--skip-stages a,b] [--with-browser] [--dry-run] [--json]',
      );
      process.exit(0);
    }
    const { manifest, outDir } = await runDeterministicCi(opts);
    if (opts.json) {
      console.log(JSON.stringify(manifest, null, 2));
    } else {
      console.log(
        `Deterministic CI [${manifest.runId}] => ${manifest.overallStatus.toUpperCase()} (pass=${manifest.summary.pass}, fail=${manifest.summary.fail}, error=${manifest.summary.error}, skip=${manifest.summary.skip}, deferred=${manifest.summary.deferred_to_local})`,
      );
      if (!opts.dryRun) console.log(`Output: ${outDir}`);
    }
    process.exitCode = manifest.overallStatus === 'fail' ? 1 : 0;
  } catch (err) {
    console.error(`Deterministic CI error: ${err.message}`);
    process.exitCode = 2;
  }
}
