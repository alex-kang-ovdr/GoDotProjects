import fs from 'node:fs';
import path from 'node:path';
import {
  GAME_ID_RE,
  computeGameTargetHash,
  guardRelativePath,
  readStrictJson,
  sha256Buffer,
  sha256File,
  walkWebTree,
} from './fs-utils.mjs';
import { GAMERQA_ROOT, resolvePolicyPath, resolveProjectRoot } from './paths.mjs';
import { selectPopularGames } from './popularity.mjs';
import { runStaticSuite } from '../suites/static/index.mjs';
import { runSecuritySuite } from '../suites/security/index.mjs';
import {
  resolveBrowserExecutable,
  resolvePlaywrightModule,
  runRuntimeWebSuite,
} from '../suites/runtime-web/index.mjs';
import { writeMarkdownReport } from '../reporters/markdown-reporter.mjs';

export function loadReviewPolicy(policyOpt = 'v1', cwd = process.cwd()) {
  const policyPath = resolvePolicyPath(policyOpt, cwd);
  const policy = readStrictJson(policyPath);
  if (!policy || !policy.version || !Array.isArray(policy.rules)) {
    throw new Error(`Invalid policy structure in ${policyPath}`);
  }
  return {
    policy,
    policyPath,
    policySha256: sha256File(policyPath),
  };
}

export function summarizeChecks(checks) {
  const summary = { total: checks.length, pass: 0, warn: 0, fail: 0, error: 0, skip: 0 };
  for (const c of checks) {
    if (Object.hasOwn(summary, c.status)) summary[c.status]++;
  }
  return summary;
}

export function computeGameOutcome(checks) {
  const summary = summarizeChecks(checks);
  let score = 100;
  for (const c of checks) {
    if (c.status === 'error') score -= 40;
    else if (c.status === 'fail') {
      if (c.severity === 'block') score -= 35;
      else if (c.severity === 'major') score -= 20;
      else if (c.severity === 'minor') score -= 10;
      else score -= 5;
    } else if (c.status === 'warn') {
      if (c.severity === 'major') score -= 5;
      else if (c.severity === 'minor') score -= 2;
    } else if (c.status === 'skip') {
      score -= 10;
    }
  }
  score = Math.max(0, Math.min(100, score));

  // PLAN.md rule: skip and error are NEVER treated as passed.
  let status;
  let passed = false;
  if (summary.error > 0) {
    status = 'error';
  } else if (summary.fail > 0) {
    status = 'failed';
  } else if (summary.skip > 0) {
    status = summary.pass + summary.warn > 0 ? 'partial' : 'not_run';
  } else if (summary.warn > 0) {
    status = 'warned';
    passed = true;
  } else if (summary.pass > 0) {
    status = 'passed';
    passed = true;
  } else {
    status = 'not_run';
  }
  return { status, passed, score, summary };
}

export function computeRunOutcome(gameResults) {
  const summary = {
    totalGames: gameResults.length,
    passedGames: 0,
    warnedGames: 0,
    failedGames: 0,
    errorGames: 0,
    partialGames: 0,
    totalChecks: 0,
    pass: 0,
    warn: 0,
    fail: 0,
    error: 0,
    skip: 0,
  };

  for (const g of gameResults) {
    if (g.status === 'passed') summary.passedGames++;
    else if (g.status === 'warned') summary.warnedGames++;
    else if (g.status === 'failed') summary.failedGames++;
    else if (g.status === 'error') summary.errorGames++;
    else summary.partialGames++;

    summary.totalChecks += g.summary.total;
    summary.pass += g.summary.pass;
    summary.warn += g.summary.warn;
    summary.fail += g.summary.fail;
    summary.error += g.summary.error;
    summary.skip += g.summary.skip;
  }

  let status;
  let passed = false;
  if (summary.errorGames > 0 || summary.error > 0) {
    status = 'error';
  } else if (summary.failedGames > 0 || summary.fail > 0) {
    status = 'failed';
  } else if (summary.partialGames > 0 || summary.skip > 0) {
    status = summary.pass + summary.warn > 0 ? 'partial' : 'not_run';
  } else if (summary.warnedGames > 0 || summary.warn > 0) {
    status = 'warned';
    passed = true;
  } else if (summary.totalGames > 0) {
    status = 'passed';
    passed = true;
  } else {
    status = 'not_run';
  }

  const score = gameResults.length
    ? Math.round(gameResults.reduce((acc, g) => acc + g.score, 0) / gameResults.length)
    : 0;

  return { status, passed, score, summary };
}

export function resolveTargetGames({ projectRoot, games = [], all = false, topN = null, hubDbPath = null }) {
  if (topN !== null && topN !== undefined) {
    const selection = selectPopularGames({ projectRoot, topN, hubDbPath });
    return { gameIds: selection.gameIds, catalog: selection.catalog, selection };
  }
  const catalogFile = guardRelativePath(projectRoot, 'games/catalog.json');
  const catalog = readStrictJson(catalogFile);
  if (all) {
    const ids = (catalog.entries || []).map((e) => e.id).filter(Boolean);
    if (!ids.length) throw new Error('No games found in games/catalog.json');
    return { gameIds: ids, catalog, selection: null };
  }
  const unique = [...new Set(games.map((g) => g.trim()).filter(Boolean))];
  if (!unique.length) {
    throw new Error('Specify at least one --game <id>, --top <N>, or pass --all');
  }
  for (const id of unique) {
    if (!GAME_ID_RE.test(id)) {
      throw new Error(`Invalid game identifier: ${id}`);
    }
  }
  return { gameIds: unique, catalog, selection: null };
}

function collectWebContext({ projectRoot, gameId, policy, catalog }) {
  const limits = policy?.limits || {};
  const gameDir = path.join(projectRoot, 'games', gameId);
  const webDir = path.join(gameDir, 'Web');
  const catalogEntry = catalog?.entries?.find((e) => e.id === gameId) || null;
  let manifest = null;
  try {
    const manifestPath = guardRelativePath(gameDir, 'game.manifest.json');
    manifest = readStrictJson(manifestPath, limits.maxJsonBytes ?? 1048576);
  } catch {
    manifest = null;
  }
  const walk = walkWebTree(webDir, limits);
  return {
    gameDir,
    webDir,
    manifest,
    catalogEntry,
    files: walk.files,
    totalBytes: walk.totalBytes,
    walkIssues: walk.issues,
    parsedHtmlFiles: [],
    resolvedAssets: [],
  };
}

export async function runQaPipeline({
  projectRoot: explicitRoot,
  games = [],
  all = false,
  topN = null,
  hubDbPath = null,
  suites = ['static', 'security', 'runtime-web'],
  policy: policyOpt = 'v1',
  runId: explicitRunId,
  outDir: explicitOutDir,
  skipBrowser = false,
  continueOnBlock = false,
  playwrightPath,
  browserTimeoutMs = 20000,
  perfSampleMs = 900,
  writeArtifacts = true,
} = {}) {
  const startedMs = Date.now();
  const startedAt = new Date(startedMs).toISOString();
  const projectRoot = resolveProjectRoot(explicitRoot);
  const { policy, policyPath, policySha256 } = loadReviewPolicy(policyOpt);
  const { gameIds, catalog, selection } = resolveTargetGames({ projectRoot, games, all, topN, hubDbPath });
  const rankingByGameId = new Map((selection?.rankings || []).map((r) => [r.gameId, r]));

  const runId = explicitRunId || `${startedAt.replace(/[:.]/g, '-')}-${process.pid}`;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(runId)) {
    throw new Error(`Invalid runId: ${runId}`);
  }
  const outDir = explicitOutDir
    ? path.resolve(explicitOutDir)
    : path.join(projectRoot, 'artifacts', 'gamerqa', runId);
  const screenshotDir = writeArtifacts ? path.join(outDir, 'screenshots') : null;

  const activeSuites = suites.length ? suites : ['static', 'security', 'runtime-web'];
  const gameResults = [];
  let detectedBrowserDriver = null;
  let detectedBrowserExe = null;

  for (const gameId of gameIds) {
    const gStart = Date.now();
    const gameDir = path.join(projectRoot, 'games', gameId);
    const checks = [];
    const tiersExecuted = new Set();
    let staticContext = { gameDir, webDir: path.join(gameDir, 'Web'), manifest: null, catalogEntry: null, files: [] };
    let screenshots = [];
    let performance = null;

    if (activeSuites.includes('static')) {
      tiersExecuted.add(0);
      const res = await runStaticSuite({ projectRoot, gameId, policy, catalog });
      checks.push(...res.checks);
      staticContext = res.context;
    } else if (activeSuites.includes('security') || activeSuites.includes('runtime-web')) {
      staticContext = collectWebContext({ projectRoot, gameId, policy, catalog });
    }

    if (activeSuites.includes('security')) {
      tiersExecuted.add(0);
      const res = await runSecuritySuite({ gameId, policy, staticContext });
      checks.push(...res.checks);
    }

    const tier0Blocked = checks.some((c) => c.tier === 0 && c.severity === 'block' && (c.status === 'fail' || c.status === 'error'));

    if (activeSuites.includes('runtime-web')) {
      if (tier0Blocked && !continueOnBlock) {
        checks.push({
          id: 'RT-HTTP-BOOT',
          ruleId: 'RT-HTTP-BOOT',
          suite: 'runtime-web',
          tier: 1,
          severity: 'block',
          status: 'skip',
          title: 'Local static HTTP entry boot',
          message: 'Skipped Tier 1 runtime-web due to Tier 0 block failure (fail-fast)',
        });
      } else {
        tiersExecuted.add(1);
        const res = await runRuntimeWebSuite({
          projectRoot,
          gameId,
          policy,
          staticContext,
          screenshotDir,
          skipBrowser,
          playwrightPath,
          browserTimeoutMs,
          perfSampleMs,
        });
        checks.push(...res.checks);
        screenshots = res.screenshots || [];
        performance = res.performance || null;
        if (res.browserInfo) {
          detectedBrowserDriver = res.browserInfo.driver;
          detectedBrowserExe = res.browserInfo.executablePath;
        }
      }
    }

    const outcome = computeGameOutcome(checks);
    const targetHash = fs.existsSync(gameDir)
      ? computeGameTargetHash(gameDir)
      : sha256Buffer(Buffer.from(`missing:${gameId}`));

    gameResults.push({
      gameId,
      title: staticContext.manifest?.title?.ko || staticContext.manifest?.title?.en || staticContext.catalogEntry?.displayName || gameId,
      version: staticContext.manifest?.version || null,
      integration: staticContext.manifest?.integration || null,
      catalogEnabled: staticContext.catalogEntry ? Boolean(staticContext.catalogEntry.enabled) : null,
      targetHash,
      status: outcome.status,
      passed: outcome.passed,
      score: outcome.score,
      durationMs: Math.max(0, Date.now() - gStart),
      tiersExecuted: [...tiersExecuted].sort((a, b) => a - b),
      metrics: {
        fileCount: staticContext.files?.length || 0,
        totalBytes: staticContext.totalBytes || 0,
        ...(performance ? { performance } : {}),
      },
      ...(rankingByGameId.has(gameId) ? { popularity: rankingByGameId.get(gameId) } : {}),
      screenshots,
      summary: outcome.summary,
      checks,
    });
  }

  const runOutcome = computeRunOutcome(gameResults);
  const finishedMs = Date.now();
  const finishedAt = new Date(finishedMs).toISOString();

  const report = {
    schemaVersion: 1,
    runId,
    target: gameIds.length === 1 ? gameIds[0] : all ? 'catalog' : gameIds.join(','),
    targetType: gameIds.length === 1 ? 'game' : all ? 'catalog' : 'batch',
    gameId: gameIds.length === 1 ? gameIds[0] : null,
    policyVersion: policy.version,
    policy: {
      version: policy.version,
      file: path.basename(policyPath),
      ruleCount: policy.rules.length,
      sha256: policySha256,
    },
    status: runOutcome.status,
    passed: runOutcome.passed,
    score: runOutcome.score,
    startedAt,
    finishedAt,
    generatedAt: finishedAt,
    durationMs: Math.max(0, finishedMs - startedMs),
    projectRoot: path.relative(GAMERQA_ROOT, projectRoot) || '.',
    runner: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      browserDriver: detectedBrowserDriver,
      browserPath: detectedBrowserExe,
      suites: activeSuites,
    },
    summary: runOutcome.summary,
    games: gameResults,
  };

  let reportJsonPath = null;
  let reportMdPath = null;
  let evidenceManifestPath = null;

  if (writeArtifacts) {
    fs.mkdirSync(outDir, { recursive: true });
    reportJsonPath = path.join(outDir, 'report.json');
    reportMdPath = path.join(outDir, 'REPORT.md');
    evidenceManifestPath = path.join(outDir, 'evidence-manifest.json');

    const jsonText = JSON.stringify(report, null, 2) + '\n';
    fs.writeFileSync(reportJsonPath, jsonText, 'utf8');
    writeMarkdownReport(report, reportMdPath);

    const evidenceFiles = [
      { path: 'report.json', bytes: Buffer.byteLength(jsonText, 'utf8'), sha256: sha256Buffer(Buffer.from(jsonText, 'utf8')) },
      { path: 'REPORT.md', bytes: fs.statSync(reportMdPath).size, sha256: sha256File(reportMdPath) },
    ];
    for (const g of gameResults) {
      for (const shot of g.screenshots) {
        evidenceFiles.push({ path: shot.relativePath, bytes: shot.bytes, sha256: shot.sha256 });
      }
    }
    const evidenceDoc = {
      schemaVersion: 1,
      runId,
      generatedAt: finishedAt,
      policyVersion: policy.version,
      files: evidenceFiles,
    };
    fs.writeFileSync(evidenceManifestPath, JSON.stringify(evidenceDoc, null, 2) + '\n', 'utf8');
  }

  return { report, outDir, reportJsonPath, reportMdPath, evidenceManifestPath, selection };
}

export function verifyInstallation({ projectRoot: explicitRoot } = {}) {
  const checks = [];
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  checks.push({
    id: 'VERIFY-NODE',
    ok: Number.isInteger(nodeMajor) && nodeMajor >= 24,
    message: `Node ${process.version} (requires >=24)`,
  });

  let root = null;
  try {
    root = resolveProjectRoot(explicitRoot);
    checks.push({ id: 'VERIFY-PROJECT-ROOT', ok: true, message: `Project root resolved: ${root}` });
  } catch (err) {
    checks.push({ id: 'VERIFY-PROJECT-ROOT', ok: false, message: err.message });
  }

  for (const [id, rel] of [
    ['VERIFY-SCHEMA', 'schemas/qa-run.schema.json'],
    ['VERIFY-POLICY', 'policies/review-policy.v1.json'],
  ]) {
    try {
      const full = path.join(GAMERQA_ROOT, rel);
      const doc = readStrictJson(full);
      checks.push({ id, ok: Boolean(doc && typeof doc === 'object'), message: `${rel} valid` });
    } catch (err) {
      checks.push({ id, ok: false, message: `${rel} invalid: ${err.message}` });
    }
  }

  if (root) {
    try {
      const cat = readStrictJson(guardRelativePath(root, 'games/catalog.json'));
      checks.push({
        id: 'VERIFY-CATALOG',
        ok: cat.schemaVersion === 1 && Array.isArray(cat.entries),
        message: `games/catalog.json readable (${cat.entries?.length || 0} entries)`,
      });
    } catch (err) {
      checks.push({ id: 'VERIFY-CATALOG', ok: false, message: `games/catalog.json error: ${err.message}` });
    }
  }

  const pwPath = resolvePlaywrightModule({ projectRoot: root });
  const browserExe = resolveBrowserExecutable();
  checks.push({
    id: 'VERIFY-BROWSER-DRIVER',
    ok: Boolean(pwPath || browserExe),
    message: pwPath
      ? `Playwright available (${pwPath})`
      : browserExe
        ? `Chrome/Edge CDP available (${browserExe})`
        : 'Neither Playwright nor local Chrome/Edge found (runtime-web browser checks would skip)',
  });

  const ok = checks.every((c) => c.ok);
  return { ok, gamerQaRoot: GAMERQA_ROOT, projectRoot: root, checks };
}
