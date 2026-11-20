#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_REPO_ROOT,
  formatDuration,
  formatKstDate,
  getGitMetadata,
  isExistingFile,
  mapSuspectedOwners,
} from './common.mjs';

function parseArgs(argv) {
  const opts = {
    repoRoot: DEFAULT_REPO_ROOT,
    manifest: null,
    todayKst: null,
    json: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--help' || token === '-h') { opts.help = true; continue; }
    if (token === '--json') { opts.json = true; continue; }
    const eq = token.indexOf('=');
    const key = eq > 0 ? token.slice(0, eq) : token;
    const val = eq > 0 ? token.slice(eq + 1) : argv[++i];
    if (val === undefined) throw new Error(`Missing value for ${key}`);
    if (key === '--repo-root') opts.repoRoot = path.resolve(val);
    else if (key === '--manifest') opts.manifest = val;
    else if (key === '--today') opts.todayKst = val;
    else throw new Error(`Unknown option: ${key}`);
  }
  return opts;
}

async function loadManifestReadOnly(repoRoot, explicitSource) {
  if (explicitSource) {
    if (/^https?:\/\//i.test(explicitSource)) {
      const res = await fetch(explicitSource, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`Failed to fetch manifest (${res.status}): ${explicitSource}`);
      return { manifest: await res.json(), sourcePath: explicitSource };
    }
    const resolved = path.resolve(explicitSource);
    if (!isExistingFile(resolved)) return { manifest: null, sourcePath: resolved };
    return { manifest: JSON.parse(fs.readFileSync(resolved, 'utf8')), sourcePath: resolved };
  }

  const buildsRoot = path.join(repoRoot, 'artifacts', 'daily-builds');
  const latestPointerPath = path.join(buildsRoot, 'latest.json');
  if (isExistingFile(latestPointerPath)) {
    const pointer = JSON.parse(fs.readFileSync(latestPointerPath, 'utf8'));
    if (pointer.runId) {
      const unified = path.join(buildsRoot, pointer.runId, 'DAILY_BUILD_MANIFEST.json');
      if (isExistingFile(unified)) {
        return { manifest: JSON.parse(fs.readFileSync(unified, 'utf8')), sourcePath: unified };
      }
      const det = path.join(buildsRoot, pointer.runId, 'deterministic-manifest.json');
      if (isExistingFile(det)) {
        return { manifest: JSON.parse(fs.readFileSync(det, 'utf8')), sourcePath: det };
      }
    }
  }
  if (fs.existsSync(buildsRoot)) {
    let newest = null;
    for (const entry of fs.readdirSync(buildsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.toLowerCase() === 'previews') continue;
      const unified = path.join(buildsRoot, entry.name, 'DAILY_BUILD_MANIFEST.json');
      const det = path.join(buildsRoot, entry.name, 'deterministic-manifest.json');
      const candidatePath = isExistingFile(unified) ? unified : isExistingFile(det) ? det : null;
      if (!candidatePath) continue;
      try {
        const m = JSON.parse(fs.readFileSync(candidatePath, 'utf8'));
        const ts = String(m.finishedAt || m.startedAt || '');
        if (!newest || ts > newest.ts) newest = { ts, manifest: m, sourcePath: candidatePath };
      } catch {
        // ignore invalid manifest
      }
    }
    if (newest) return { manifest: newest.manifest, sourcePath: newest.sourcePath };
  }
  return { manifest: null, sourcePath: latestPointerPath };
}

function extractManifestKstDate(manifest) {
  if (!manifest) return null;
  const fromRunId = /(\d{4}-\d{2}-\d{2})/.exec(String(manifest.runId || ''));
  if (fromRunId) return fromRunId[1];
  const ts = manifest.finishedAt || manifest.startedAt;
  if (ts) {
    const parsed = new Date(ts);
    if (!Number.isNaN(parsed.getTime())) return formatKstDate(parsed);
  }
  return null;
}

export async function generateMorningBriefing({
  repoRoot = DEFAULT_REPO_ROOT,
  manifest: explicitManifest = null,
  manifestObject = null,
  todayKst = formatKstDate(new Date()),
} = {}) {
  const root = path.resolve(repoRoot);
  const loaded = manifestObject
    ? { manifest: manifestObject, sourcePath: 'in-memory' }
    : await loadManifestReadOnly(root, explicitManifest);

  const manifest = loaded.manifest;
  const git = manifest?.git || getGitMetadata(root);
  const suspectedOwners =
    manifest?.suspectedOwners?.length
      ? manifest.suspectedOwners
      : mapSuspectedOwners(root, git.recentlyChangedFiles || []);

  const manifestDate = extractManifestKstDate(manifest);
  const missedToday = !manifest || manifestDate !== todayKst;

  let verdict = 'MISSED_TODAY';
  if (manifest && !missedToday) {
    verdict = String(manifest.overallStatus || 'unknown').toUpperCase();
  } else if (manifest && missedToday) {
    verdict = 'MISSED_TODAY';
  }

  const failingStages = (manifest?.stages || [])
    .filter((s) => s.status === 'fail' || s.status === 'error')
    .map((s) => ({
      id: s.id,
      title: s.title,
      status: s.status,
      exitCode: s.exitCode ?? null,
      message: s.message || '',
      lastLine: s.tail ? s.tail.split(/\r?\n/).filter(Boolean).slice(-1)[0] || '' : '',
    }));

  const actions = [];
  if (missedToday) {
    actions.push(
      manifest
        ? `오늘(${todayKst}) 데일리 빌드가 실행되지 않았습니다(마지막 빌드: ${manifestDate || '없음'}). Cloud Build 트리거 및 Cloud Scheduler 상태를 점검하세요.`
        : `오늘(${todayKst}) 빌드 매니페스트가 없습니다. Cloud Build 트리거 설정 또는 수동 1회 실행을 확인하세요.`,
    );
  }
  if (failingStages.length) {
    const ids = failingStages.map((s) => s.id).join(', ');
    const topOwner = suspectedOwners[0]?.branch ? ` (최근 변경 소유자: ${suspectedOwners[0].branch})` : '';
    actions.push(`실패 스테이지(${ids}) 로그를 먼저 확인하세요${topOwner}.`);
  }
  if (manifest && manifest.archive?.archiveStatus === 'pending_gdrive_upload') {
    actions.push('Google Drive 아카이브가 업로드 대기 상태(pending_gdrive_upload)입니다. PLAYHUB_GDRIVE_ARCHIVE_DIR 또는 Drive 연결을 확인하세요.');
  }
  if (!actions.length) {
    actions.push('이상 없음 — 오늘 아카이브된 빌드를 기준으로 개발/테스트를 진행하세요.');
  }

  const briefing = {
    schemaVersion: 1,
    kind: 'playhub-morning-briefing',
    readOnly: true,
    todayKst,
    verdict,
    missedToday,
    manifestDate,
    manifestSource: loaded.sourcePath,
    runId: manifest?.runId || null,
    durationMs: manifest?.durationMs ?? null,
    commit: git.shortCommit || 'unknown',
    branch: git.branch || 'unknown',
    summary: manifest?.summary || null,
    failingStages,
    recentCommits: (git.recentCommits || []).slice(0, 10),
    suspectedOwners,
    archive: manifest?.archive || null,
    artifacts: manifest?.artifacts || [],
    actions,
  };

  return briefing;
}

export function renderMorningBriefingMarkdown(b) {
  const lines = [
    `# PlayHub 오전 데일리 브리핑 (${b.todayKst})`,
    '',
    `1. **오늘 빌드 판정**: \`${b.verdict}\`${b.runId ? ` (\`${b.runId}\`, 커밋 \`${b.commit}\` / \`${b.branch}\`, 소요 ${formatDuration(b.durationMs)})` : ' (오늘 실행 이력 없음)'}`,
  ];

  if (b.failingStages.length) {
    lines.push('2. **실패 진단**:');
    for (const f of b.failingStages) {
      lines.push(`   - \`${f.id}\` (${f.title}): ${f.message}${f.lastLine ? ` — \`${f.lastLine.slice(0, 140)}\`` : ''}`);
    }
    if (b.suspectedOwners.length) {
      lines.push(`   - 추정 영향 워크트리: ${b.suspectedOwners.slice(0, 3).map((o) => `${o.branch}(${o.files.length}개)`).join(', ')}`);
    }
  } else if (b.missedToday) {
    lines.push(`2. **실패 진단**: 오늘(${b.todayKst}) 빌드 미수신 (직전 기록: ${b.manifestDate || '없음'})`);
  } else {
    lines.push(`2. **실패 진단**: 실패 0건 (pass ${b.summary?.pass ?? 0} / skip ${b.summary?.skip ?? 0})`);
  }

  if (b.recentCommits.length) {
    lines.push(`3. **최근 24시간 변경 요약** (${b.recentCommits.length}건):`);
    for (const c of b.recentCommits.slice(0, 5)) {
      lines.push(`   - \`${c.sha}\` ${c.subject}`);
    }
  } else {
    lines.push('3. **최근 24시간 변경 요약**: 신규 커밋 없음');
  }

  if (b.archive) {
    const dest = b.archive.destinationDir ? ` · 경로: ${b.archive.destinationDir}` : '';
    const count = Number.isInteger(b.archive.fileCount) ? ` · 파일 ${b.archive.fileCount}개` : '';
    lines.push(`4. **아카이브 확인**: \`${b.archive.archiveStatus}\` (검증: \`${b.archive.archiveVerified}\`${count}${dest})`);
  } else if (b.artifacts.length) {
    lines.push(`4. **아카이브 확인**: 생성 아티팩트 ${b.artifacts.length}개 (${b.artifacts.map((a) => `${a.relativePath} [${a.sha256.slice(0, 10)}…]`).join(', ')})`);
  } else {
    lines.push('4. **아카이브 확인**: 기록된 아카이브 없음');
  }

  lines.push('5. **오늘 우선 확인 액션**:');
  for (const act of b.actions) {
    lines.push(`   - ${act}`);
  }
  return lines.join('\n') + '\n';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const opts = parseArgs(process.argv.slice(2));
    if (opts.help) {
      console.log('Usage: node tools/devops/briefing.mjs [--manifest PATH|URL] [--today YYYY-MM-DD] [--repo-root DIR] [--json]');
      process.exit(0);
    }
    const briefing = await generateMorningBriefing({
      repoRoot: opts.repoRoot,
      manifest: opts.manifest,
      todayKst: opts.todayKst || formatKstDate(new Date()),
    });
    if (opts.json) {
      console.log(JSON.stringify(briefing, null, 2));
    } else {
      process.stdout.write(renderMorningBriefingMarkdown(briefing));
    }
    process.exitCode = briefing.verdict === 'FAIL' || briefing.verdict === 'MISSED_TODAY' ? 1 : 0;
  } catch (err) {
    console.error(`Briefing error: ${err.message}`);
    process.exitCode = 2;
  }
}
