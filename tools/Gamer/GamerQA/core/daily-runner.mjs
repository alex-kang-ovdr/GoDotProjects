import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { guardRelativePath, readStrictJson } from './fs-utils.mjs';
import { resolveProjectRoot } from './paths.mjs';
import { loadDailyPerfBudgets } from './perf-profiler.mjs';
import { MAX_POPULAR_GAMES } from './popularity.mjs';
import { runQaPipeline } from './runner.mjs';
import {
  appendHistoryJsonl,
  buildDailySnapshot,
  computeTrendAnalysis,
  formatKstDate,
  readHistoryJsonl,
} from './trend-tracker.mjs';
import { writeDailyReportArtifacts } from '../reporters/daily-report.mjs';

function readGitContext(cwd) {
  const run = (args) => {
    try {
      return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      return null;
    }
  };
  const branch = run(['rev-parse', '--abbrev-ref', 'HEAD']);
  const commit = run(['rev-parse', 'HEAD']);
  return { branch, commit, sha7: commit ? commit.slice(0, 7) : null };
}

function pruneOldDailyFiles(dailyDir, retentionDays = 30, nowMs = Date.now()) {
  if (!retentionDays || retentionDays < 1 || !fs.existsSync(dailyDir)) return 0;
  const cutoffMs = nowMs - retentionDays * 86400000;
  let removed = 0;
  for (const name of fs.readdirSync(dailyDir)) {
    if (!/^DAILY-\d{4}-\d{2}-\d{2}\.md$/.test(name)) continue;
    const full = path.join(dailyDir, name);
    try {
      const st = fs.statSync(full);
      if (st.isFile() && st.mtimeMs < cutoffMs) {
        fs.unlinkSync(full);
        removed++;
      }
    } catch {}
  }
  const logsDir = path.join(dailyDir, 'logs');
  if (fs.existsSync(logsDir)) {
    for (const name of fs.readdirSync(logsDir)) {
      if (!/^daily-\d{4}-\d{2}-\d{2}\.log$/.test(name)) continue;
      const full = path.join(logsDir, name);
      try {
        const st = fs.statSync(full);
        if (st.isFile() && st.mtimeMs < cutoffMs) {
          fs.unlinkSync(full);
          removed++;
        }
      } catch {}
    }
  }
  return removed;
}

export async function runDailyPopularQa({
  projectRoot: explicitRoot,
  topN = MAX_POPULAR_GAMES,
  hubDbPath = null,
  dailyDir: explicitDailyDir = null,
  budgetsPath = null,
  suites = ['static', 'security', 'runtime-web'],
  policy = 'v1',
  runId: explicitRunId = null,
  skipBrowser = false,
  playwrightPath = null,
  browserTimeoutMs = 25000,
  perfSampleMs = 900,
  retentionDays = 30,
} = {}) {
  const projectRoot = resolveProjectRoot(explicitRoot);
  const clampedTopN = Math.max(1, Math.min(MAX_POPULAR_GAMES, Math.floor(Number(topN) || MAX_POPULAR_GAMES)));
  const now = new Date();
  const kstDate = formatKstDate(now);
  const kstClock = new Date(now.getTime() + 9 * 3600000);
  const hhmmss =
    String(kstClock.getUTCHours()).padStart(2, '0') +
    String(kstClock.getUTCMinutes()).padStart(2, '0') +
    String(kstClock.getUTCSeconds()).padStart(2, '0');
  const runId = explicitRunId || `daily-${kstDate.replace(/-/g, '')}-${hhmmss}`;

  const budgetsConfig = loadDailyPerfBudgets(budgetsPath);
  const dailyDir = explicitDailyDir
    ? path.resolve(explicitDailyDir)
    : path.join(projectRoot, 'artifacts', 'gamerqa', 'daily');
  const historyPath = path.join(dailyDir, 'history.jsonl');

  const pipeline = await runQaPipeline({
    projectRoot,
    topN: clampedTopN,
    hubDbPath,
    suites,
    policy,
    runId,
    skipBrowser,
    continueOnBlock: true,
    playwrightPath,
    browserTimeoutMs,
    perfSampleMs,
    writeArtifacts: true,
  });

  const manifestsByGame = new Map();
  for (const g of pipeline.report.games) {
    try {
      const mp = guardRelativePath(path.join(projectRoot, 'games', g.gameId), 'game.manifest.json');
      manifestsByGame.set(g.gameId, readStrictJson(mp));
    } catch {}
  }

  const git = readGitContext(projectRoot);
  const snapshot = buildDailySnapshot(pipeline.report, {
    selection: pipeline.selection,
    budgetsConfig,
    git,
    manifestsByGame,
  });

  const priorHistory = readHistoryJsonl(historyPath);
  const trend = computeTrendAnalysis(snapshot, priorHistory, budgetsConfig);
  appendHistoryJsonl(historyPath, snapshot);

  const written = writeDailyReportArtifacts({ dailyDir, snapshot, trend });
  const prunedFiles = pruneOldDailyFiles(dailyDir, retentionDays);

  return {
    runId,
    snapshot,
    trend,
    historyPath,
    dailyDir,
    ...written,
    prunedFiles,
    reportJsonPath: pipeline.reportJsonPath,
    reportMdPath: pipeline.reportMdPath,
  };
}
