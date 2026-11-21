import fs from 'node:fs';
import path from 'node:path';

function esc(value) {
  return String(value ?? '—').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function fmtNum(val, unit = '', decimals = null) {
  if (val === null || val === undefined || !Number.isFinite(Number(val))) return '—';
  const n = decimals !== null ? Number(val).toFixed(decimals) : String(val);
  return `${n}${unit}`;
}

function fmtDeltaPct(pct) {
  if (pct === null || pct === undefined || !Number.isFinite(Number(pct))) return '';
  const sign = Number(pct) > 0 ? '+' : '';
  return ` (${sign}${pct}%)`;
}

export function renderDailyMarkdownReport(snapshot, trend) {
  const agg = snapshot.aggregates || {};
  const pd = trend?.platformDeltas || null;
  const lines = [];

  lines.push(`# PlayHub GamerQA 데일리 인기 Top ${snapshot.selection?.selectedCount ?? agg.totalGames} E2E 프로파일 리포트 (${snapshot.dateKst})`);
  lines.push('');
  lines.push(`- **실행 ID**: \`${snapshot.runId}\``);
  lines.push(`- **생성 시각 (KST)**: \`${snapshot.generatedAtKst}\` (소요: \`${(snapshot.durationMs / 1000).toFixed(1)}s\`)`);
  lines.push(`- **Git 기준**: 브랜치 \`${snapshot.git?.branch || 'unknown'}\` / 커밋 \`${snapshot.git?.sha7 || 'unknown'}\``);
  lines.push(
    `- **인기 게임 선정**: \`${snapshot.selection?.source || 'catalog-priority'}\` (활성 카탈로그 ${snapshot.selection?.totalEnabledCatalogGames ?? agg.totalGames}개 중 상위 **${snapshot.selection?.selectedCount ?? agg.totalGames}개**, 상한 20개)`
  );
  lines.push(
    `- **브라우저 드라이버**: \`${snapshot.runner?.browserDriver || 'none'}\` · Node \`${snapshot.runner?.nodeVersion || process.version}\``
  );
  lines.push('');

  lines.push('## 1. 핵심 요약 (Executive KPI)');
  lines.push('');
  lines.push('| 지표 | 금일 측정값 | 7일 평균 대비 |');
  lines.push('|---|---:|---:|');
  lines.push(`| E2E 통과율 | **${agg.passRatePct}%** (${agg.passedGames}/${agg.totalGames}) | ${pd ? `${pd.passRateDeltaPct >= 0 ? '+' : ''}${pd.passRateDeltaPct}%p` : '기준선 축적 중'} |`);
  lines.push(`| 평균 / P95 로딩 시간 (Boot) | **${fmtNum(agg.avgBootMs, 'ms')}** / ${fmtNum(agg.p95BootMs, 'ms')} | ${pd ? fmtDeltaPct(pd.avgBootDeltaPct).trim() || '—' : '기준선 축적 중'} |`);
  lines.push(`| 평균 TTFB | ${fmtNum(agg.avgTtfbMs, 'ms')} | — |`);
  lines.push(`| 평균 / 최대 JS Heap 메모리 | **${fmtNum(agg.avgJsHeapMb, 'MB')}** / ${fmtNum(agg.maxJsHeapMb, 'MB')} | ${pd ? fmtDeltaPct(pd.avgHeapDeltaPct).trim() || '—' : '기준선 축적 중'} |`);
  lines.push(`| 평균 / P95 입력 응답시간 | **${fmtNum(agg.avgInputResponseMs, 'ms')}** / ${fmtNum(agg.p95InputResponseMs, 'ms')} | ${pd ? fmtDeltaPct(pd.avgResponseDeltaPct).trim() || '—' : '기준선 축적 중'} |`);
  lines.push(`| 평균 프레임률 (FPS) | **${fmtNum(agg.avgFps, 'fps')}** | ${pd ? fmtDeltaPct(pd.avgFpsDeltaPct).trim() || '—' : '기준선 축적 중'} |`);
  lines.push(`| 성능 예산 초과 (Fail / Warn) | ${agg.budgetFailGames} fail / ${agg.budgetWarnGames} warn | 회귀 경보 **${trend?.regressions?.length || 0}건** |`);
  lines.push('');

  lines.push('## 2. 회귀 경보 (Regression Alerts — 7일 기준선 대비)');
  lines.push('');
  if (!trend?.regressions?.length) {
    lines.push('- 감지된 성능·메모리·응답시간·상태 회귀가 없습니다.');
  } else {
    lines.push('| 심각도 | 게임 ID | 지표 | 상세 내용 |');
    lines.push('|---|---|---|---|');
    for (const r of trend.regressions) {
      lines.push(`| **${r.severity.toUpperCase()}** | \`${esc(r.gameId)}\` | \`${esc(r.metric)}\` | ${esc(r.message)} |`);
    }
  }
  lines.push('');

  lines.push(`## 3. 인기 상위 ${snapshot.games.length}개 게임 E2E 성능·메모리·응답·로딩 프로파일`);
  lines.push('');
  lines.push('| 순위 | 게임 ID | 상태 | 로딩 (Boot ms) | TTFB | JS Heap (MB) | 힙 증분 | 입력 응답 (ms) | FPS / P95 프레임 | 콘솔 오류 | 예산 |');
  lines.push('|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---|');

  for (const g of snapshot.games) {
    const d = trend?.gameDeltas?.[g.gameId] || {};
    const bootCell = `${fmtNum(g.totalBootMs, 'ms')}${fmtDeltaPct(d.bootDeltaPct)}`;
    const heapCell = `${fmtNum(g.jsHeapUsedMb, 'MB')}${fmtDeltaPct(d.heapDeltaPct)}`;
    const growthCell = g.heapGrowthMb !== null ? `${g.heapGrowthMb >= 0 ? '+' : ''}${g.heapGrowthMb}MB` : '—';
    const respCell = `${fmtNum(g.inputResponseMs, 'ms')}${fmtDeltaPct(d.responseDeltaPct)}`;
    const fpsCell = `${fmtNum(g.avgFps, 'fps')} / ${fmtNum(g.frameTimeP95Ms, 'ms')}`;
    lines.push(
      `| ${g.rank} | \`${esc(g.gameId)}\` | **${String(g.status || '').toUpperCase()}** | ${esc(bootCell)} | ${fmtNum(g.ttfbMs, 'ms')} | ${esc(heapCell)} | ${growthCell} | ${esc(respCell)} | ${esc(fpsCell)} | ${g.consoleErrors} | ${String(g.budgetGrade || 'n/a').toUpperCase()} |`
    );
  }
  lines.push('');

  const budgetFlagged = snapshot.games.filter((g) => (g.budgetIssues || []).length > 0);
  if (budgetFlagged.length) {
    lines.push('### 성능 예산 주의/초과 항목');
    lines.push('');
    for (const g of budgetFlagged) {
      lines.push(`- \`${g.gameId}\` (${g.budgetProfile}, **${g.budgetGrade.toUpperCase()}**): ${g.budgetIssues.map((i) => i.message).join('; ')}`);
    }
    lines.push('');
  }

  lines.push('## 4. 최근 14일 데일리 트렌드');
  lines.push('');
  if (trend?.sparklines) {
    lines.push(`- **통과율 추이**: \`${trend.sparklines.passRate}\``);
    lines.push(`- **평균 로딩(ms) 추이**: \`${trend.sparklines.avgBootMs}\``);
    lines.push(`- **평균 메모리(MB) 추이**: \`${trend.sparklines.avgJsHeapMb}\``);
    lines.push(`- **평균 응답시간(ms) 추이**: \`${trend.sparklines.avgInputResponseMs}\``);
    lines.push(`- **평균 FPS 추이**: \`${trend.sparklines.avgFps}\``);
    lines.push('');
  }
  lines.push('| 날짜 (KST) | 실행 ID | 게임 수 | 통과율 | 평균 Boot | 평균 Heap | 평균 응답 | 평균 FPS | 예산 Fail |');
  lines.push('|---|---|---:|---:|---:|---:|---:|---:|---:|');
  for (const row of trend?.dailySeries || []) {
    lines.push(
      `| ${row.dateKst} | \`${esc(row.runId)}\` | ${row.totalGames} | ${row.passRatePct}% | ${fmtNum(row.avgBootMs, 'ms')} | ${fmtNum(row.avgJsHeapMb, 'MB')} | ${fmtNum(row.avgInputResponseMs, 'ms')} | ${fmtNum(row.avgFps, 'fps')} | ${row.budgetFailGames} |`
    );
  }
  lines.push('');
  return lines.join('\n');
}

export function writeDailyReportArtifacts({ dailyDir, snapshot, trend }) {
  fs.mkdirSync(dailyDir, { recursive: true });
  const markdown = renderDailyMarkdownReport(snapshot, trend);
  const dailyMdPath = path.join(dailyDir, `DAILY-${snapshot.dateKst}.md`);
  const latestMdPath = path.join(dailyDir, 'LATEST_DAILY.md');
  const latestJsonPath = path.join(dailyDir, 'latest.json');

  fs.writeFileSync(dailyMdPath, markdown, 'utf8');
  fs.writeFileSync(latestMdPath, markdown, 'utf8');
  fs.writeFileSync(
    latestJsonPath,
    JSON.stringify({ snapshot, trend }, null, 2) + '\n',
    'utf8'
  );

  return { dailyMdPath, latestMdPath, latestJsonPath, markdown };
}
