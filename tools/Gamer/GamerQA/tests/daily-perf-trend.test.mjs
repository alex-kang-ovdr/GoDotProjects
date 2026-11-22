import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { selectPopularGames, MAX_POPULAR_GAMES } from '../core/popularity.mjs';
import { evaluatePerfBudgets, loadDailyPerfBudgets } from '../core/perf-profiler.mjs';
import {
  appendHistoryJsonl,
  computeTrendAnalysis,
  readHistoryJsonl,
  sparkline,
} from '../core/trend-tracker.mjs';
import { runDailyPopularQa } from '../core/daily-runner.mjs';
import { renderDailyMarkdownReport } from '../reporters/daily-report.mjs';
import { resolveBrowserExecutable, resolvePlaywrightModule } from '../suites/runtime-web/index.mjs';

const VALID_PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);
const HAS_BROWSER = Boolean(resolvePlaywrightModule() || resolveBrowserExecutable());

function makeFixtureRepo(t, count = 25) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gamerqa-daily-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 }));
  fs.mkdirSync(path.join(root, 'games'), { recursive: true });
  const entries = [];
  for (let i = 1; i <= count; i++) {
    const id = `game-${String(i).padStart(2, '0')}`;
    const enabled = i <= count - 2; // last 2 disabled
    entries.push({
      id,
      path: id,
      enabled,
      priority: 100 + i,
      kind: 'imported',
      displayName: `Game ${i}`,
    });
    const gDir = path.join(root, 'games', id);
    const wDir = path.join(gDir, 'Web');
    fs.mkdirSync(path.join(wDir, 'assets'), { recursive: true });
    fs.writeFileSync(
      path.join(gDir, 'game.manifest.json'),
      JSON.stringify({
        schemaVersion: 1,
        id,
        slug: id,
        title: { ko: `게임 ${i}`, en: `Game ${i}` },
        summary: { ko: '데일리 성능 테스트용 샘플 웹 게임입니다.', en: 'Daily E2E performance test fixture game.' },
        instructions: { ko: '화면을 클릭하거나 방향키를 눌러 정상 동작을 확인합니다.', en: 'Click or press keys to test game responsiveness.' },
        rules: { ko: '프레임과 메모리 사용량을 정상 범위 내에서 유지하는 테스트 규칙입니다.', en: 'Maintain healthy frame rate and memory usage.' },
        entry: 'index.html',
        version: '1.0.0',
        updatedOn: '2026-11-21',
        tags: ['arcade'],
        controls: ['keyboard', 'mouse'],
        viewport: { width: 1280, height: 800, orientation: 'landscape', resize: 'responsive' },
        capabilities: { webgl: false, wasm: false, workers: false, fullscreen: true, pointerLock: false, externalNetwork: [] },
        save: { enabled: false, schemaVersion: 1, maxSlots: 0 },
        media: { cover: 'assets/cover.png', screenshots: ['assets/cover.png'] },
        integration: 'legacy-localstorage',
        supportedLocales: ['ko', 'en'],
      }, null, 2)
    );
    fs.writeFileSync(path.join(wDir, 'assets', 'cover.png'), VALID_PNG_1X1);
    fs.writeFileSync(
      path.join(wDir, 'index.html'),
      `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${id}</title></head><body><h1>${id}</h1><canvas id="c" width="320" height="200"></canvas><script src="app.js"></script></body></html>`
    );
    fs.writeFileSync(
      path.join(wDir, 'app.js'),
      `const c=document.getElementById('c');const ctx=c.getContext('2d');let x=10;function draw(){ctx.fillStyle='#1b2838';ctx.fillRect(0,0,320,200);ctx.fillStyle='#58c4dd';ctx.fillRect(x,80,30,30);}draw();window.addEventListener('keydown',()=>{x=(x+20)%280;draw();});c.addEventListener('click',()=>{x=(x+15)%280;draw();});`
    );
  }
  fs.writeFileSync(path.join(root, 'games', 'catalog.json'), JSON.stringify({ schemaVersion: 1, entries }, null, 2));
  return root;
}

test('selectPopularGames caps at 20 enabled games and prefers Hub SQLite play_sessions over catalog priority', (t) => {
  const root = makeFixtureRepo(t, 25);

  // 1. Catalog priority fallback (clamped to <= 20 even if 50 requested)
  const byCatalog = selectPopularGames({ projectRoot: root, topN: 50 });
  assert.equal(byCatalog.source, 'catalog-priority');
  assert.equal(byCatalog.selectedCount, MAX_POPULAR_GAMES);
  assert.equal(byCatalog.gameIds.length, 20);
  // game-24 and game-25 are disabled, so highest enabled is game-23 (priority 123)
  assert.equal(byCatalog.gameIds[0], 'game-23');
  assert.equal(byCatalog.gameIds.includes('game-24'), false);

  // 2. Live Hub SQLite play_sessions overrides order
  const dbPath = path.join(root, 'hub-telemetry.sqlite');
  const db = new DatabaseSync(dbPath);
  db.exec(`CREATE TABLE play_sessions (id TEXT, game_id TEXT, traffic_type TEXT, started_at INTEGER, active_ms INTEGER);`);
  const now = Date.now();
  const insert = db.prepare('INSERT INTO play_sessions VALUES (?, ?, ?, ?, ?)');
  for (let i = 0; i < 5; i++) insert.run(`s-g02-${i}`, 'game-02', 'live', now - 3600000, 60000);
  for (let i = 0; i < 3; i++) insert.run(`s-g05-${i}`, 'game-05', 'live', now - 3600000, 45000);
  // QA traffic must NOT count toward popularity
  for (let i = 0; i < 50; i++) insert.run(`s-qa-${i}`, 'game-01', 'qa', now - 3600000, 90000);
  db.close();

  const byDb = selectPopularGames({ projectRoot: root, topN: 10, hubDbPath: dbPath, nowMs: now });
  assert.equal(byDb.source, 'hub-sqlite');
  assert.equal(byDb.selectedCount, 10);
  assert.equal(byDb.gameIds[0], 'game-02');
  assert.equal(byDb.rankings[0].playSessions30d, 5);
  assert.equal(byDb.gameIds[1], 'game-05');
  assert.equal(byDb.rankings[1].playSessions30d, 3);
});

test('evaluatePerfBudgets and computeTrendAnalysis detect loading, memory, response, FPS, and status regressions', () => {
  const budgets = loadDailyPerfBudgets();
  const badPerf = {
    loading: { totalBootMs: 18000, ttfbMs: 50 },
    memory: { jsHeapUsedMb: 600, heapGrowthMb: 12 },
    responsiveness: { inputResponseMs: 350, avgFps: 8, frameTimeP95Ms: 140 },
  };
  const evaluated = evaluatePerfBudgets(badPerf, { capabilities: { wasm: false, webgl: false } }, budgets);
  assert.equal(evaluated.grade, 'fail');
  assert.ok(evaluated.issues.some((i) => i.metric === 'totalBootMs' && i.level === 'fail'));
  assert.ok(evaluated.issues.some((i) => i.metric === 'jsHeapUsedMb' && i.level === 'fail'));
  assert.ok(evaluated.issues.some((i) => i.metric === 'inputResponseMs' && i.level === 'fail'));

  const history = [
    {
      runId: 'daily-20261119-040000',
      dateKst: '2026-11-19',
      generatedAtUtc: '2026-11-18T19:00:00Z',
      aggregates: { totalGames: 2, passRatePct: 100, avgBootMs: 1000, avgJsHeapMb: 40, avgInputResponseMs: 16, avgFps: 58, budgetFailGames: 0 },
      games: [
        { gameId: 'alpha', status: 'passed', passed: true, totalBootMs: 1000, jsHeapUsedMb: 40, inputResponseMs: 16, avgFps: 58 },
        { gameId: 'beta', status: 'passed', passed: true, totalBootMs: 1200, jsHeapUsedMb: 50, inputResponseMs: 20, avgFps: 60 },
      ],
    },
    {
      runId: 'daily-20261120-040000',
      dateKst: '2026-11-20',
      generatedAtUtc: '2026-11-19T19:00:00Z',
      aggregates: { totalGames: 2, passRatePct: 100, avgBootMs: 1050, avgJsHeapMb: 42, avgInputResponseMs: 18, avgFps: 57, budgetFailGames: 0 },
      games: [
        { gameId: 'alpha', status: 'passed', passed: true, totalBootMs: 1050, jsHeapUsedMb: 42, inputResponseMs: 18, avgFps: 57 },
        { gameId: 'beta', status: 'passed', passed: true, totalBootMs: 1250, jsHeapUsedMb: 52, inputResponseMs: 20, avgFps: 58 },
      ],
    },
  ];

  const today = {
    runId: 'daily-20261121-040000',
    dateKst: '2026-11-21',
    generatedAtUtc: '2026-11-20T19:00:00Z',
    generatedAtKst: '2026-11-21T04:00:00+09:00',
    durationMs: 4200,
    git: { branch: 'PlayHub-GamerQA', sha7: '09f5983' },
    selection: { source: 'catalog-priority', requestedTopN: 2, selectedCount: 2, totalEnabledCatalogGames: 23 },
    status: 'failed',
    passed: false,
    score: 65,
    runner: { browserDriver: 'chrome-cdp', nodeVersion: process.version },
    aggregates: { totalGames: 2, passedGames: 1, failedGames: 1, partialGames: 0, passRatePct: 50, budgetWarnGames: 0, budgetFailGames: 1, avgBootMs: 1800, p95BootMs: 2400, avgTtfbMs: 10, avgJsHeapMb: 70, maxJsHeapMb: 90, avgInputResponseMs: 45, p95InputResponseMs: 70, avgFps: 40 },
    games: [
      { rank: 1, gameId: 'alpha', status: 'passed', passed: true, consoleErrors: 0, budgetProfile: 'standard', budgetGrade: 'warn', budgetIssues: [], totalBootMs: 2400, ttfbMs: 10, jsHeapUsedMb: 90, heapGrowthMb: 12, inputResponseMs: 70, avgFps: 30, frameTimeP95Ms: 45 },
      { rank: 2, gameId: 'beta', status: 'failed', passed: false, consoleErrors: 1, budgetProfile: 'standard', budgetGrade: 'pass', budgetIssues: [], totalBootMs: 1200, ttfbMs: 10, jsHeapUsedMb: 50, heapGrowthMb: 2, inputResponseMs: 20, avgFps: 50, frameTimeP95Ms: 20 },
    ],
  };

  const trend = computeTrendAnalysis(today, history, budgets);
  assert.ok(trend.regressions.some((r) => r.gameId === 'beta' && r.metric === 'status'));
  assert.ok(trend.regressions.some((r) => r.gameId === 'alpha' && r.metric === 'totalBootMs'));
  assert.ok(trend.regressions.some((r) => r.gameId === 'alpha' && r.metric === 'jsHeapUsedMb'));
  assert.ok(trend.regressions.some((r) => r.gameId === 'alpha' && r.metric === 'inputResponseMs'));
  assert.ok(trend.regressions.some((r) => r.gameId === 'alpha' && r.metric === 'avgFps'));
  assert.equal(trend.dailySeries.length, 3);
  assert.equal(sparkline([10, 20, 30]).length, 3);

  const md = renderDailyMarkdownReport(today, trend);
  assert.match(md, /Regression Alerts/);
  assert.match(md, /alpha/);
  assert.match(md, /beta/);
  assert.match(md, /2026-11-21/);
});

test('runDailyPopularQa executes real E2E performance/memory/response profiling and persists history.jsonl & daily reports', async (t) => {
  const root = makeFixtureRepo(t, 4);
  const dailyDir = path.join(root, 'artifacts', 'gamerqa', 'daily');
  const res = await runDailyPopularQa({
    projectRoot: root,
    topN: 2,
    dailyDir,
    runId: 'daily-e2e-test-1',
    skipBrowser: !HAS_BROWSER,
    perfSampleMs: 400,
  });

  assert.equal(res.snapshot.games.length, 2);
  assert.ok(fs.existsSync(res.dailyMdPath));
  assert.ok(fs.existsSync(res.latestMdPath));
  assert.ok(fs.existsSync(res.latestJsonPath));
  assert.ok(fs.existsSync(res.historyPath));

  const history = readHistoryJsonl(res.historyPath);
  assert.equal(history.length, 1);
  assert.equal(history[0].runId, 'daily-e2e-test-1');

  // Re-appending same runId deduplicates cleanly
  const deduped = appendHistoryJsonl(res.historyPath, history[0]);
  assert.equal(deduped.length, 1);

  if (HAS_BROWSER) {
    const first = res.snapshot.games[0];
    assert.equal(first.status, 'passed');
    assert.ok(first.totalBootMs > 0, `expected totalBootMs > 0, got ${first.totalBootMs}`);
    assert.ok(first.jsHeapUsedMb > 0, `expected jsHeapUsedMb > 0, got ${first.jsHeapUsedMb}`);
    assert.ok(first.inputResponseMs !== null && first.inputResponseMs >= 0, `expected inputResponseMs >= 0, got ${first.inputResponseMs}`);
    assert.ok(first.avgFps !== null && first.avgFps > 0, `expected avgFps > 0, got ${first.avgFps}`);
  }
});
