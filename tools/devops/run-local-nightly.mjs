#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_REPO_ROOT,
  escapeHtml,
  formatDuration,
  formatKstRunId,
  getGitMetadata,
  isExistingFile,
  mapSuspectedOwners,
  summarizeStageStatuses,
  writeJsonAtomic,
} from './common.mjs';
import { runDeterministicCi } from './run-deterministic-ci.mjs';
import { archiveBuildToGdrive } from './archive-gdrive.mjs';
import { pruneDailyBuilds } from './prune-daily-builds.mjs';

function parseArgs(argv) {
  const opts = {
    repoRoot: DEFAULT_REPO_ROOT,
    runId: null,
    outDir: null,
    cloudManifest: null,
    fallbackLocalDeterministic: false,
    archiveDest: null,
    skipArchive: false,
    prune: true,
    dryRun: false,
    json: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--help' || token === '-h') { opts.help = true; continue; }
    if (token === '--fallback-local-deterministic') { opts.fallbackLocalDeterministic = true; continue; }
    if (token === '--skip-archive') { opts.skipArchive = true; continue; }
    if (token === '--no-prune') { opts.prune = false; continue; }
    if (token === '--dry-run') { opts.dryRun = true; continue; }
    if (token === '--json') { opts.json = true; continue; }
    const eq = token.indexOf('=');
    const key = eq > 0 ? token.slice(0, eq) : token;
    const val = eq > 0 ? token.slice(eq + 1) : argv[++i];
    if (val === undefined) throw new Error(`Missing value for ${key}`);
    if (key === '--repo-root') opts.repoRoot = path.resolve(val);
    else if (key === '--run-id') opts.runId = val;
    else if (key === '--out-dir') opts.outDir = path.resolve(val);
    else if (key === '--cloud-manifest') opts.cloudManifest = val;
    else if (key === '--archive-dest') opts.archiveDest = val;
    else throw new Error(`Unknown option: ${key}`);
  }
  return opts;
}

async function fetchJsonMaybe(source) {
  if (!source) return null;
  if (/^https?:\/\//i.test(source)) {
    const res = await fetch(source, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`Failed to fetch cloud manifest (${res.status}): ${source}`);
    return await res.json();
  }
  const resolved = path.resolve(source);
  if (!isExistingFile(resolved)) throw new Error(`Cloud manifest file not found: ${resolved}`);
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

export function renderUnifiedMarkdown(manifest) {
  const lines = [
    `# PlayHub Daily Build & Archive Report (${manifest.runId})`,
    '',
    `- **Overall Status**: \`${manifest.overallStatus.toUpperCase()}\``,
    `- **Build Source**: \`${manifest.deterministicSource}\``,
    `- **Commit**: \`${manifest.git.shortCommit}\` (\`${manifest.git.branch}\`)`,
    `- **Godot Submodule Pin**: \`${manifest.git.godotSubmodulePin || 'unavailable'}\``,
    `- **Time**: ${manifest.startedAt} → ${manifest.finishedAt} (${formatDuration(manifest.durationMs)})`,
    `- **Summary**: pass ${manifest.summary.pass} · warn ${manifest.summary.warn} · fail ${manifest.summary.fail} · error ${manifest.summary.error} · skip ${manifest.summary.skip} · not_run ${manifest.summary.not_run}`,
    `- **Google Drive Archive**: \`${manifest.archive?.archiveStatus || 'skipped'}\`${manifest.archive?.destinationDir ? ` (${manifest.archive.destinationDir})` : ''}`,
    '',
    '## Build & Verification Stages',
    '',
    '| Track | Stage | Title | Status | Duration | Notes |',
    '|---|---|---|---|---:|---|',
  ];
  for (const s of manifest.stages) {
    lines.push(
      `| ${s.track || 'cloud'} | \`${s.id}\` | ${s.title} | **${s.status.toUpperCase()}** | ${formatDuration(s.durationMs)} | ${s.message || ''} |`,
    );
  }
  if (manifest.artifacts.length) {
    lines.push('', '## Archived Build Artifacts', '', '| File | Size (bytes) | SHA-256 |', '|---|---:|---|');
    for (const a of manifest.artifacts) {
      lines.push(`| \`${a.relativePath}\` | ${a.bytes} | \`${a.sha256}\` |`);
    }
  }
  const failing = manifest.stages.filter((s) => s.status === 'fail' || s.status === 'error');
  if (failing.length) {
    lines.push('', '## Failure Diagnostics (For AI Summary)', '');
    for (const s of failing) {
      lines.push(`### \`${s.id}\` — ${s.title}`, '', `- Status: \`${s.status}\` (exit: \`${s.exitCode}\`)`, `- Message: ${s.message}`);
      if (s.tail) {
        lines.push('', '```text', s.tail.slice(-1200), '```');
      }
      lines.push('');
    }
  }
  if (manifest.suspectedOwners.length) {
    lines.push('', '## Recently Touched Worktree Owners (24h)', '');
    for (const o of manifest.suspectedOwners) {
      lines.push(`- **${o.branch}** (${o.role}): ${o.files.slice(0, 8).join(', ')}${o.files.length > 8 ? ` (+${o.files.length - 8} more)` : ''}`);
    }
  }
  if (manifest.git.recentCommits.length) {
    lines.push('', '## Recent Commits (24h)', '');
    for (const c of manifest.git.recentCommits.slice(0, 10)) {
      lines.push(`- \`${c.sha}\` ${c.subject} (${c.author})`);
    }
  }
  return lines.join('\n') + '\n';
}

export function renderUnifiedHtml(manifest) {
  const rows = manifest.stages
    .map(
      (s) =>
        `<tr class="st-${escapeHtml(s.status)}"><td><code>${escapeHtml(s.track || 'cloud')}</code></td><td><code>${escapeHtml(s.id)}</code></td><td>${escapeHtml(s.title)}</td><td><strong>${escapeHtml(s.status.toUpperCase())}</strong></td><td>${escapeHtml(formatDuration(s.durationMs))}</td><td>${escapeHtml(s.message || '')}</td></tr>`,
    )
    .join('');
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PlayHub Daily Build & Archive — ${escapeHtml(manifest.runId)}</title><style>body{font:14px/1.6 system-ui,sans-serif;background:#f4f7f5;color:#172a23;max-width:1180px;margin:28px auto;padding:0 18px}header,section{background:#fff;border:1px solid #d5e1db;border-radius:12px;padding:22px;margin:16px 0}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #e3ebe7;padding:10px;text-align:left;vertical-align:top}.st-pass strong{color:#157347}.st-fail strong,.st-error strong{color:#b02a37}.st-skip strong,.st-not_run strong,.st-warn strong{color:#9a6700}code{font-size:12px}</style></head><body><header><h1>PlayHub Daily Build & Archive Report — ${escapeHtml(manifest.runId)}</h1><p><strong>${escapeHtml(manifest.overallStatus.toUpperCase())}</strong> · source <code>${escapeHtml(manifest.deterministicSource)}</code> · commit <code>${escapeHtml(manifest.git.shortCommit)}</code> (${escapeHtml(manifest.git.branch)}) · ${escapeHtml(formatDuration(manifest.durationMs))}</p><p>pass ${manifest.summary.pass} · fail ${manifest.summary.fail} · error ${manifest.summary.error} · skip ${manifest.summary.skip} · not_run ${manifest.summary.not_run} · archive: <code>${escapeHtml(manifest.archive?.archiveStatus || 'skipped')}</code></p></header><section><table><thead><tr><th>Track</th><th>Stage</th><th>항목</th><th>상태</th><th>소요</th><th>설명</th></tr></thead><tbody>${rows}</tbody></table></section></body></html>\n`;
}

export async function runLocalNightly(rawOpts = {}) {
  const opts = {
    repoRoot: DEFAULT_REPO_ROOT,
    runId: null,
    outDir: null,
    cloudManifest: null,
    fallbackLocalDeterministic: false,
    archiveDest: null,
    skipArchive: false,
    prune: true,
    dryRun: false,
    ...rawOpts,
  };

  const startedAt = new Date();
  const startedMs = Date.now();
  const repoRoot = path.resolve(opts.repoRoot);
  const git = getGitMetadata(repoRoot);

  // Step 1: Collect Google Cloud Build deterministic manifest or run local fallback
  let deterministicManifest = null;
  let deterministicSource = 'none';
  if (opts.cloudManifest) {
    deterministicManifest = await fetchJsonMaybe(opts.cloudManifest);
    deterministicSource = 'cloud_build';
  } else if (opts.fallbackLocalDeterministic) {
    const tempRunId = opts.runId || formatKstRunId(git.shortCommit, startedAt);
    const tempOutDir = opts.outDir || path.join(repoRoot, 'artifacts', 'daily-builds', tempRunId);
    const localDet = await runDeterministicCi({
      repoRoot,
      mode: 'local',
      runId: tempRunId,
      outDir: tempOutDir,
      dryRun: opts.dryRun,
    });
    deterministicManifest = localDet.manifest;
    deterministicSource = 'local_fallback';
  }

  const runId = opts.runId || deterministicManifest?.runId || formatKstRunId(git.shortCommit, startedAt);
  const buildsRoot = path.join(repoRoot, 'artifacts', 'daily-builds');
  const outDir = opts.outDir || path.join(buildsRoot, runId);
  if (!opts.dryRun) fs.mkdirSync(outDir, { recursive: true });

  const combinedStages = [];
  if (deterministicManifest) {
    for (const s of deterministicManifest.stages || []) {
      combinedStages.push({ ...s, track: deterministicSource === 'cloud_build' ? 'cloud' : 'local' });
    }
  } else {
    combinedStages.push({
      track: 'cloud',
      id: 'cloud_deterministic_manifest',
      title: 'Google Cloud Build 결정론적 매니페스트 수신',
      status: 'not_run',
      exitCode: null,
      durationMs: 0,
      message: 'No --cloud-manifest provided and --fallback-local-deterministic not enabled.',
    });
  }

  const finishedAt = new Date();
  const { counts, overallStatus } = summarizeStageStatuses(combinedStages);
  const suspectedOwners = mapSuspectedOwners(repoRoot, git.recentlyChangedFiles);

  const unifiedManifest = {
    schemaVersion: 1,
    kind: 'playhub-daily-build-archive-manifest',
    runId,
    dryRun: opts.dryRun,
    overallStatus,
    deterministicSource,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: Date.now() - startedMs,
    git: deterministicManifest?.git || git,
    summary: counts,
    stages: combinedStages,
    artifacts: deterministicManifest?.artifacts || [],
    suspectedOwners,
    archive: null,
    prune: null,
  };

  if (!opts.dryRun) {
    writeJsonAtomic(path.join(outDir, 'DAILY_BUILD_MANIFEST.json'), unifiedManifest);
    fs.writeFileSync(path.join(outDir, 'DAILY_REPORT.md'), renderUnifiedMarkdown(unifiedManifest), 'utf8');
    fs.writeFileSync(path.join(outDir, 'DAILY_REPORT.html'), renderUnifiedHtml(unifiedManifest), 'utf8');

    if (!opts.skipArchive) {
      unifiedManifest.archive = archiveBuildToGdrive({
        buildDir: outDir,
        runId,
        destRoot: opts.archiveDest,
        dryRun: false,
      });
      writeJsonAtomic(path.join(outDir, 'DAILY_BUILD_MANIFEST.json'), unifiedManifest);
      fs.writeFileSync(path.join(outDir, 'DAILY_REPORT.md'), renderUnifiedMarkdown(unifiedManifest), 'utf8');
      fs.writeFileSync(path.join(outDir, 'DAILY_REPORT.html'), renderUnifiedHtml(unifiedManifest), 'utf8');
    }

    const pointer = {
      runId,
      overallStatus,
      commit: unifiedManifest.git.commit,
      shortCommit: unifiedManifest.git.shortCommit,
      branch: unifiedManifest.git.branch,
      finishedAt: unifiedManifest.finishedAt,
      reportMarkdown: path.join(outDir, 'DAILY_REPORT.md'),
      reportHtml: path.join(outDir, 'DAILY_REPORT.html'),
      archiveStatus: unifiedManifest.archive?.archiveStatus || 'skipped',
    };
    writeJsonAtomic(path.join(buildsRoot, 'latest.json'), pointer);
    if (overallStatus === 'pass') {
      writeJsonAtomic(path.join(buildsRoot, 'latest-good.json'), pointer);
    }

    if (opts.prune) {
      unifiedManifest.prune = pruneDailyBuilds({ baseDir: buildsRoot, dryRun: false });
      writeJsonAtomic(path.join(outDir, 'DAILY_BUILD_MANIFEST.json'), unifiedManifest);
    }
  }

  return { manifest: unifiedManifest, outDir };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const opts = parseArgs(process.argv.slice(2));
    if (opts.help) {
      console.log(
        'Usage: node tools/devops/run-local-nightly.mjs [--cloud-manifest PATH|URL] [--fallback-local-deterministic] [--archive-dest DIR] [--skip-archive] [--no-prune] [--dry-run] [--json]',
      );
      process.exit(0);
    }
    const { manifest, outDir } = await runLocalNightly(opts);
    if (opts.json) {
      console.log(JSON.stringify(manifest, null, 2));
    } else {
      console.log(
        `Daily Build & Archive [${manifest.runId}] => ${manifest.overallStatus.toUpperCase()} (pass=${manifest.summary.pass}, fail=${manifest.summary.fail}, error=${manifest.summary.error}, skip=${manifest.summary.skip}, archive=${manifest.archive?.archiveStatus || 'skipped'})`,
      );
      if (!opts.dryRun) console.log(`Report: ${path.join(outDir, 'DAILY_REPORT.md')}`);
    }
    process.exitCode = manifest.overallStatus === 'fail' ? 1 : 0;
  } catch (err) {
    console.error(`Daily build & archive error: ${err.message}`);
    process.exitCode = 2;
  }
}
