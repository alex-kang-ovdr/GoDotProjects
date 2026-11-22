import fs from 'node:fs';
import path from 'node:path';
import { average, evaluatePerfBudgets, loadDailyPerfBudgets, percentile, roundNum } from './perf-profiler.mjs';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 86400000;
const SPARK_CHARS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

export function formatKstDate(dateInput = new Date()) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const kst = new Date(d.getTime() + KST_OFFSET_MS);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const day = String(kst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatKstTimestamp(dateInput = new Date()) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const kst = new Date(d.getTime() + KST_OFFSET_MS);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const day = String(kst.getUTCDate()).padStart(2, '0');
  const hh = String(kst.getUTCHours()).padStart(2, '0');
  const mm = String(kst.getUTCMinutes()).padStart(2, '0');
  const ss = String(kst.getUTCSeconds()).padStart(2, '0');
  return `${y}-${m}-${day}T${hh}:${mm}:${ss}+09:00`;
}

export function sparkline(values) {
  const nums = (values || []).filter((v) => v !== null && v !== undefined && Number.isFinite(Number(v))).map(Number);
  if (!nums.length) return '—';
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  if (max === min) return SPARK_CHARS[3].repeat(nums.length);
  return nums
    .map((v) => {
      const idx = Math.min(SPARK_CHARS.length - 1, Math.max(0, Math.round(((v - min) / (max - min)) * (SPARK_CHARS.length - 1))));
      return SPARK_CHARS[idx];
    })
    .join('');
}

export function buildDailySnapshot(report, { selection = null, budgetsConfig = null, git = null, manifestsByGame = null } = {}) {
  const cfg = budgetsConfig || loadDailyPerfBudgets();
  const generatedAt = report.generatedAt || report.finishedAt || new Date().toISOString();
  const dateKst = formatKstDate(generatedAt);

  const games = (report.games || []).map((g, idx) => {
    const perf = g.metrics?.performance || null;
    const manifest = manifestsByGame?.get(g.gameId) || null;
    const budget = evaluatePerfBudgets(perf, manifest, cfg);
    const consoleCheck = (g.checks || []).find((c) => c.ruleId === 'RT-BROWSER-CONSOLE');
    const consoleErrors = consoleCheck?.evidence
      ? (consoleCheck.evidence.pageErrorCount || 0) +
        (consoleCheck.evidence.consoleErrorCount || 0) +
        (consoleCheck.evidence.failedAssetCount || 0)
      : 0;

    return {
      rank: g.popularity?.rank ?? idx + 1,
      gameId: g.gameId,
      title: g.title || g.gameId,
      priority: g.popularity?.priority ?? null,
      playSessions30d: g.popularity?.playSessions30d ?? 0,
      status: g.status,
      passed: Boolean(g.passed),
      score: g.score,
      durationMs: g.durationMs,
      consoleErrors,
      budgetProfile: budget.profile,
      budgetGrade: budget.grade,
      budgetIssues: budget.issues,
      totalBootMs: perf?.loading?.totalBootMs ?? null,
      godotBootMs: perf?.loading?.godotBootMs ?? null,
      ttfbMs: perf?.loading?.ttfbMs ?? null,
      domContentLoadedMs: perf?.loading?.domContentLoadedMs ?? null,
      loadEventMs: perf?.loading?.loadEventMs ?? null,
      firstContentfulPaintMs: perf?.loading?.firstContentfulPaintMs ?? null,
      resourceCount: perf?.loading?.resourceCount ?? null,
      transferBytes: perf?.loading?.transferBytes ?? null,
      jsHeapUsedMb: perf?.memory?.jsHeapUsedMb ?? null,
      jsHeapPeakMb: perf?.memory?.jsHeapPeakMb ?? null,
      heapGrowthMb: perf?.memory?.heapGrowthMb ?? null,
      domNodes: perf?.memory?.domNodes ?? null,
      jsEventListeners: perf?.memory?.jsEventListeners ?? null,
      inputResponseMs: perf?.responsiveness?.inputResponseMs ?? null,
      avgFps: perf?.responsiveness?.avgFps ?? null,
      frameTimeP50Ms: perf?.responsiveness?.frameTimeP50Ms ?? null,
      frameTimeP95Ms: perf?.responsiveness?.frameTimeP95Ms ?? null,
      longTaskCount: perf?.responsiveness?.longTaskCount ?? null,
      frameChanged: perf?.responsiveness?.frameChanged ?? null,
      screenshot: g.screenshots?.[0]?.relativePath || null,
    };
  });

  const bootVals = games.map((g) => g.totalBootMs).filter((v) => v !== null);
  const ttfbVals = games.map((g) => g.ttfbMs).filter((v) => v !== null);
  const heapVals = games.map((g) => g.jsHeapUsedMb).filter((v) => v !== null);
  const respVals = games.map((g) => g.inputResponseMs).filter((v) => v !== null);
  const fpsVals = games.map((g) => g.avgFps).filter((v) => v !== null);

  const totalGames = games.length;
  const passedCount = games.filter((g) => g.passed).length;
  const budgetWarnGames = games.filter((g) => g.budgetGrade === 'warn').length;
  const budgetFailGames = games.filter((g) => g.budgetGrade === 'fail').length;

  return {
    schemaVersion: 1,
    runId: report.runId,
    dateKst,
    generatedAtUtc: generatedAt,
    generatedAtKst: formatKstTimestamp(generatedAt),
    durationMs: report.durationMs || 0,
    git: git || { branch: null, commit: null, sha7: null },
    selection: selection
      ? {
          source: selection.source,
          requestedTopN: selection.requestedTopN,
          selectedCount: selection.selectedCount,
          totalEnabledCatalogGames: selection.totalEnabledCatalogGames,
        }
      : { source: 'explicit', requestedTopN: totalGames, selectedCount: totalGames, totalEnabledCatalogGames: totalGames },
    status: report.status,
    passed: Boolean(report.passed),
    score: report.score,
    runner: report.runner || {},
    aggregates: {
      totalGames,
      passedGames: passedCount,
      failedGames: games.filter((g) => g.status === 'failed' || g.status === 'error').length,
      partialGames: games.filter((g) => g.status === 'partial' || g.status === 'not_run').length,
      passRatePct: totalGames ? roundNum((passedCount / totalGames) * 100, 1) : 0,
      budgetWarnGames,
      budgetFailGames,
      avgBootMs: roundNum(average(bootVals), 1),
      p95BootMs: roundNum(percentile(bootVals, 95), 1),
      avgTtfbMs: roundNum(average(ttfbVals), 1),
      avgJsHeapMb: roundNum(average(heapVals), 2),
      maxJsHeapMb: heapVals.length ? roundNum(Math.max(...heapVals), 2) : null,
      avgInputResponseMs: roundNum(average(respVals), 1),
      p95InputResponseMs: roundNum(percentile(respVals, 95), 1),
      avgFps: roundNum(average(fpsVals), 1),
    },
    games,
  };
}

export function readHistoryJsonl(historyPath) {
  if (!fs.existsSync(historyPath)) return [];
  const raw = fs.readFileSync(historyPath, 'utf8');
  const records = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object' && parsed.runId) {
        records.push(parsed);
      }
    } catch {
      // ignore corrupted trailing line
    }
  }
  return records;
}

export function appendHistoryJsonl(historyPath, snapshot) {
  fs.mkdirSync(path.dirname(historyPath), { recursive: true });
  const existing = readHistoryJsonl(historyPath);
  const filtered = existing.filter((r) => r.runId !== snapshot.runId);
  filtered.push(snapshot);
  const tmpPath = `${historyPath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, filtered.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
  fs.renameSync(tmpPath, historyPath);
  return filtered;
}

function pctDelta(current, baseline) {
  if (current === null || baseline === null || !Number.isFinite(current) || !Number.isFinite(baseline) || baseline === 0) {
    return null;
  }
  return roundNum(((current - baseline) / baseline) * 100, 1);
}

export function computeTrendAnalysis(currentSnapshot, historyRecords = [], budgetsConfig = null) {
  const cfg = budgetsConfig || loadDailyPerfBudgets();
  const t = cfg.regressionThresholds || {};
  const windowDays = Number(t.baselineWindowDays ?? 7);
  const minBaselineRuns = Number(t.minBaselineRuns ?? 1);
  const currentMs = Date.parse(currentSnapshot.generatedAtUtc) || Date.now();
  const windowStartMs = currentMs - windowDays * DAY_MS;

  const priorRuns = historyRecords
    .filter((r) => r && r.runId !== currentSnapshot.runId)
    .sort((a, b) => Date.parse(a.generatedAtUtc || 0) - Date.parse(b.generatedAtUtc || 0));

  const windowRuns = priorRuns.filter((r) => {
    const ms = Date.parse(r.generatedAtUtc || 0);
    return Number.isFinite(ms) && ms >= windowStartMs && ms <= currentMs;
  });
  const baselineRuns = windowRuns.length >= minBaselineRuns ? windowRuns : priorRuns.slice(-windowDays);
  const prevRun = priorRuns.length ? priorRuns[priorRuns.length - 1] : null;

  const platformBaseline = baselineRuns.length
    ? {
        runCount: baselineRuns.length,
        avgBootMs: roundNum(average(baselineRuns.map((r) => r.aggregates?.avgBootMs)), 1),
        avgJsHeapMb: roundNum(average(baselineRuns.map((r) => r.aggregates?.avgJsHeapMb)), 2),
        avgInputResponseMs: roundNum(average(baselineRuns.map((r) => r.aggregates?.avgInputResponseMs)), 1),
        avgFps: roundNum(average(baselineRuns.map((r) => r.aggregates?.avgFps)), 1),
        passRatePct: roundNum(average(baselineRuns.map((r) => r.aggregates?.passRatePct)), 1),
      }
    : null;

  const regressions = [];
  const gameDeltas = {};

  for (const g of currentSnapshot.games || []) {
    const histGames = baselineRuns
      .map((r) => (r.games || []).find((x) => x.gameId === g.gameId))
      .filter(Boolean);
    const prevGame = (prevRun?.games || []).find((x) => x.gameId === g.gameId) || null;

    const baseBoot = roundNum(average(histGames.map((x) => x.totalBootMs)), 1);
    const baseHeap = roundNum(average(histGames.map((x) => x.jsHeapUsedMb)), 2);
    const baseResp = roundNum(average(histGames.map((x) => x.inputResponseMs)), 1);
    const baseFps = roundNum(average(histGames.map((x) => x.avgFps)), 1);

    const delta = {
      baselineRuns: histGames.length,
      prevStatus: prevGame?.status || null,
      bootBaselineMs: baseBoot,
      bootDeltaMs: g.totalBootMs !== null && baseBoot !== null ? roundNum(g.totalBootMs - baseBoot, 1) : null,
      bootDeltaPct: pctDelta(g.totalBootMs, baseBoot),
      heapBaselineMb: baseHeap,
      heapDeltaMb: g.jsHeapUsedMb !== null && baseHeap !== null ? roundNum(g.jsHeapUsedMb - baseHeap, 2) : null,
      heapDeltaPct: pctDelta(g.jsHeapUsedMb, baseHeap),
      responseBaselineMs: baseResp,
      responseDeltaMs: g.inputResponseMs !== null && baseResp !== null ? roundNum(g.inputResponseMs - baseResp, 1) : null,
      responseDeltaPct: pctDelta(g.inputResponseMs, baseResp),
      fpsBaseline: baseFps,
      fpsDelta: g.avgFps !== null && baseFps !== null ? roundNum(g.avgFps - baseFps, 1) : null,
      fpsDeltaPct: pctDelta(g.avgFps, baseFps),
    };
    gameDeltas[g.gameId] = delta;

    // 1. Status regression
    if (prevGame && prevGame.passed && !g.passed) {
      regressions.push({
        severity: 'high',
        gameId: g.gameId,
        metric: 'status',
        baseline: prevGame.status,
        current: g.status,
        delta: `${prevGame.status} -> ${g.status}`,
        deltaPct: null,
        message: `상태 회귀: 직전 ${prevGame.status} → 현재 ${g.status}`,
      });
    }

    if (histGames.length < minBaselineRuns) continue;

    // 2. Boot time spike
    if (
      delta.bootDeltaMs !== null &&
      delta.bootDeltaPct !== null &&
      delta.bootDeltaPct >= (t.bootIncreasePct ?? 25) &&
      delta.bootDeltaMs >= (t.bootIncreaseMinMs ?? 500)
    ) {
      regressions.push({
        severity: 'medium',
        gameId: g.gameId,
        metric: 'totalBootMs',
        baseline: baseBoot,
        current: g.totalBootMs,
        delta: delta.bootDeltaMs,
        deltaPct: delta.bootDeltaPct,
        message: `로딩 지연: ${baseBoot}ms → ${g.totalBootMs}ms (+${delta.bootDeltaMs}ms / +${delta.bootDeltaPct}%)`,
      });
    }

    // 3. Memory spike
    if (
      delta.heapDeltaMb !== null &&
      delta.heapDeltaPct !== null &&
      delta.heapDeltaPct >= (t.heapIncreasePct ?? 20) &&
      delta.heapDeltaMb >= (t.heapIncreaseMinMb ?? 20)
    ) {
      regressions.push({
        severity: 'high',
        gameId: g.gameId,
        metric: 'jsHeapUsedMb',
        baseline: baseHeap,
        current: g.jsHeapUsedMb,
        delta: delta.heapDeltaMb,
        deltaPct: delta.heapDeltaPct,
        message: `메모리 증가: ${baseHeap}MB → ${g.jsHeapUsedMb}MB (+${delta.heapDeltaMb}MB / +${delta.heapDeltaPct}%)`,
      });
    }

    // 4. Input response spike
    if (
      delta.responseDeltaMs !== null &&
      delta.responseDeltaPct !== null &&
      delta.responseDeltaPct >= (t.responseIncreasePct ?? 30) &&
      delta.responseDeltaMs >= (t.responseIncreaseMinMs ?? 25)
    ) {
      regressions.push({
        severity: 'medium',
        gameId: g.gameId,
        metric: 'inputResponseMs',
        baseline: baseResp,
        current: g.inputResponseMs,
        delta: delta.responseDeltaMs,
        deltaPct: delta.responseDeltaPct,
        message: `응답 지연: ${baseResp}ms → ${g.inputResponseMs}ms (+${delta.responseDeltaMs}ms / +${delta.responseDeltaPct}%)`,
      });
    }

    // 5. FPS drop
    if (
      delta.fpsDelta !== null &&
      delta.fpsDeltaPct !== null &&
      delta.fpsDeltaPct <= -(t.fpsDropPct ?? 20) &&
      delta.fpsDelta <= -(t.fpsDropMin ?? 5)
    ) {
      regressions.push({
        severity: 'medium',
        gameId: g.gameId,
        metric: 'avgFps',
        baseline: baseFps,
        current: g.avgFps,
        delta: delta.fpsDelta,
        deltaPct: delta.fpsDeltaPct,
        message: `FPS 저하: ${baseFps}fps → ${g.avgFps}fps (${delta.fpsDelta}fps / ${delta.fpsDeltaPct}%)`,
      });
    }
  }

  // Collapse history + current by KST date (latest run per day) for 14-day trend table
  const byDate = new Map();
  for (const r of [...priorRuns, currentSnapshot]) {
    const dk = r.dateKst || formatKstDate(r.generatedAtUtc);
    byDate.set(dk, r);
  }
  const dailySeries = [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-14)
    .map(([dateKst, r]) => ({
      dateKst,
      runId: r.runId,
      totalGames: r.aggregates?.totalGames ?? 0,
      passRatePct: r.aggregates?.passRatePct ?? 0,
      avgBootMs: r.aggregates?.avgBootMs ?? null,
      avgJsHeapMb: r.aggregates?.avgJsHeapMb ?? null,
      avgInputResponseMs: r.aggregates?.avgInputResponseMs ?? null,
      avgFps: r.aggregates?.avgFps ?? null,
      budgetFailGames: r.aggregates?.budgetFailGames ?? 0,
    }));

  return {
    baselineWindowDays: windowDays,
    platformBaseline,
    platformDeltas: platformBaseline
      ? {
          avgBootDeltaPct: pctDelta(currentSnapshot.aggregates.avgBootMs, platformBaseline.avgBootMs),
          avgHeapDeltaPct: pctDelta(currentSnapshot.aggregates.avgJsHeapMb, platformBaseline.avgJsHeapMb),
          avgResponseDeltaPct: pctDelta(currentSnapshot.aggregates.avgInputResponseMs, platformBaseline.avgInputResponseMs),
          avgFpsDeltaPct: pctDelta(currentSnapshot.aggregates.avgFps, platformBaseline.avgFps),
          passRateDeltaPct: roundNum(currentSnapshot.aggregates.passRatePct - platformBaseline.passRatePct, 1),
        }
      : null,
    regressions,
    gameDeltas,
    dailySeries,
    sparklines: {
      passRate: sparkline(dailySeries.map((d) => d.passRatePct)),
      avgBootMs: sparkline(dailySeries.map((d) => d.avgBootMs)),
      avgJsHeapMb: sparkline(dailySeries.map((d) => d.avgJsHeapMb)),
      avgInputResponseMs: sparkline(dailySeries.map((d) => d.avgInputResponseMs)),
      avgFps: sparkline(dailySeries.map((d) => d.avgFps)),
    },
  };
}
