import fs from 'node:fs';
import path from 'node:path';
import { readCatalog } from './catalog.mjs';
import { ApiError, json, readJson, safeString, uid } from './security.mjs';

let evaluateCompatibilityFn = null;
try {
  const mod = await import('../../tools/build-version/compatibility-gate.mjs');
  if (typeof mod?.evaluateCompatibility === 'function') evaluateCompatibilityFn = mod.evaluateCompatibility;
} catch {
  // Fallback handled below when running in isolated fixtures
}

export const QA_PLATFORMS = ['web', 'desktop', 'android', 'godot-templates'];
const VALID_PLATFORMS = new Set([...QA_PLATFORMS, 'all']);

function ensureSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS gamerqa_hub_runs (
      id TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      target_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('passed','warned','failed','error')),
      score INTEGER NOT NULL,
      latency_ms INTEGER NOT NULL,
      passed_checks INTEGER NOT NULL,
      total_checks INTEGER NOT NULL,
      checks_json TEXT NOT NULL,
      traffic_type TEXT NOT NULL DEFAULT 'qa',
      qa_run_id TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS gamerqa_hub_runs_created ON gamerqa_hub_runs(created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS gamerqa_hub_runs_platform ON gamerqa_hub_runs(platform, created_at DESC);
  `);
}

function isGodotTemplateGame(game) {
  return Boolean(game && typeof game.id === 'string' && game.id.startsWith('forge-'));
}

function safeGameDir(rootDir, gameId) {
  const candidates = [
    path.join(rootDir, 'dist', 'user', 'games', gameId),
    path.join(rootDir, 'games', gameId),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'index.html'))) return dir;
  }
  return null;
}

function loadBundleManifest(dir, game) {
  if (dir) {
    const manifestPath = path.join(dir, 'game.manifest.json');
    if (fs.existsSync(manifestPath)) {
      try {
        return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      } catch {}
    }
  }
  return game?.manifest || game || {};
}

function checkGameBundle(rootDir, game) {
  const checks = [];
  const add = (id, ok, detail, severity = 'block') => {
    checks.push({ id, status: ok ? 'pass' : (severity === 'minor' ? 'warn' : 'fail'), severity, detail });
  };

  const dir = safeGameDir(rootDir, game.id);
  const manifest = loadBundleManifest(dir, game);

  add('CATALOG-ENABLED', game.enabled === true, game.enabled ? 'Hub 카탈로그 공개 활성' : '비공개 상태');
  add('MANIFEST-TITLE', Boolean(manifest.title?.ko && manifest.title?.en), `${manifest.title?.ko || '-'} / ${manifest.title?.en || '-'}`);
  add('MANIFEST-VERSION', Boolean(manifest.version), `v${manifest.version || '0.0.0'}`);
  add('ENTRY-HTML', Boolean(dir), dir ? 'index.html 확인됨' : 'index.html 누락');

  if (dir) {
    const manifestPath = path.join(dir, 'game.manifest.json');
    add('BUNDLE-MANIFEST', fs.existsSync(manifestPath), fs.existsSync(manifestPath) ? 'game.manifest.json 존재' : 'game.manifest.json 누락');
    const coverRel = manifest.media?.cover;
    const coverOk = Boolean(coverRel && fs.existsSync(path.join(dir, coverRel)));
    add('BUNDLE-COVER', coverOk, coverOk ? `커버 확인 (${coverRel})` : '커버 이미지 누락', 'major');
  }

  const extNet = manifest.capabilities?.externalNetwork;
  add('SEC-NO-EXT-NET', !Array.isArray(extNet) || extNet.length === 0, '외부 네트워크 차단 정책 준수');

  if (isGodotTemplateGame(game)) {
    const hasDates = Boolean(manifest.publishedOn || game.publishedOn);
    add('TEMPLATE-RELEASE-META', hasDates, `publishedOn=${manifest.publishedOn || game.publishedOn || '-'}, updatedOn=${manifest.updatedOn || game.updatedOn || '-'}`, 'minor');
  }

  return checks;
}

function summarizeOutcome(checks) {
  let score = 100;
  let pass = 0;
  let warn = 0;
  let fail = 0;
  for (const c of checks) {
    if (c.status === 'pass') pass++;
    else if (c.status === 'warn') { warn++; score -= 2; }
    else { fail++; score -= c.severity === 'block' ? 35 : 15; }
  }
  score = Math.max(0, Math.min(100, score));
  const status = fail > 0 ? 'failed' : warn > 0 ? 'warned' : 'passed';
  return { status, score, passedChecks: pass, totalChecks: checks.length };
}

export function createGamerQaHub({ db, rootDir, versionCompat, mobile, now, rate }) {
  ensureSchema(db);

  function buildTargetCatalog() {
    const allGames = readCatalog(rootDir, db).filter(g => g.enabled);
    const webGames = allGames.filter(g => !isGodotTemplateGame(g));
    const godotTemplates = allGames.filter(isGodotTemplateGame);

    const latestByTarget = new Map();
    const rows = db.prepare(`
      SELECT r.target_id, r.platform, r.status, r.score, r.latency_ms, r.created_at
      FROM gamerqa_hub_runs r
      INNER JOIN (
        SELECT target_id, MAX(created_at) AS max_at FROM gamerqa_hub_runs GROUP BY target_id
      ) latest ON r.target_id = latest.target_id AND r.created_at = latest.max_at
    `).all();
    for (const row of rows) {
      latestByTarget.set(`${row.platform}:${row.target_id}`, {
        status: row.status,
        score: row.score,
        latencyMs: row.latency_ms,
        at: new Date(row.created_at).toISOString(),
      });
    }

    const attachLatest = (platform, item) => ({
      ...item,
      platform,
      lastQa: latestByTarget.get(`${platform}:${item.id}`) || null,
    });

    const formatGameTarget = (platform, g) => {
      const m = loadBundleManifest(safeGameDir(rootDir, g.id), g);
      return attachLatest(platform, {
        id: g.id,
        title: m.title?.ko || g.title?.ko || g.title || g.id,
        version: m.version || g.version || '0.1.0',
        entryUrl: g.entryUrl || `/games/${g.id}/index.html`,
        playUrl: `/play/${g.id}/`,
        publishedOn: m.publishedOn || g.publishedOn || null,
        updatedOn: m.updatedOn || g.updatedOn || null,
      });
    };

    const webTargets = webGames.map(g => formatGameTarget('web', g));

    const desktopTargets = [
      attachLatest('desktop', {
        id: 'hub-desktop-bootstrapper',
        title: 'Hub-Desktop Bootstrapper & Compat Gate',
        version: versionCompat?.buildInfo?.semver || '0.3.0',
        entryUrl: '/api/compat/check',
        playUrl: '/qa/',
        capabilities: ['low-il-sandbox', 'l9-launch-ticket', 'shader-hitch-l2'],
      }),
      attachLatest('desktop', {
        id: 'hub-desktop-godot-player',
        title: 'Hub-Desktop Shared Godot 4.7.2 Player',
        version: '4.7.2',
        entryUrl: '/api/version',
        playUrl: '/qa/',
        capabilities: ['godot-4.7.2', 'pck-loader', 'compat-gate'],
      }),
    ];

    const androidTargets = [
      attachLatest('android', {
        id: 'hub-aos-client',
        title: 'Hub-AOS Android Play Hub Client',
        version: versionCompat?.buildInfo?.semver || '0.3.0',
        entryUrl: '/api/compat/check',
        playUrl: '/qa/',
        capabilities: ['min-apk', 'age-gate', 'pck-bootstrap', 'compat-gate'],
      }),
      attachLatest('android', {
        id: 'hub-aos-mobile-api',
        title: 'Hub-AOS M1 Mobile API & Policy Gate',
        version: versionCompat?.buildInfo?.semver || '0.3.0',
        entryUrl: mobile?.enabled ? '/api/mobile/bootstrap' : '/api/version',
        playUrl: '/qa/',
        mobileApiEnabled: Boolean(mobile?.enabled),
      }),
    ];

    const godotTargets = godotTemplates.map(g => formatGameTarget('godot-templates', g));

    return {
      generatedAt: new Date(now()).toISOString(),
      buildInfo: {
        buildId: versionCompat?.buildInfo?.buildId || null,
        buildCode: versionCompat?.buildInfo?.buildCode || null,
        channel: versionCompat?.buildInfo?.channel || 'dev',
        semver: versionCompat?.buildInfo?.semver || '0.3.0',
      },
      summary: {
        totalTargets: webTargets.length + desktopTargets.length + androidTargets.length + godotTargets.length,
        web: webTargets.length,
        desktop: desktopTargets.length,
        android: androidTargets.length,
        'godot-templates': godotTargets.length,
      },
      platforms: {
        web: webTargets,
        desktop: desktopTargets,
        android: androidTargets,
        'godot-templates': godotTargets,
      },
    };
  }

  function evaluateCompatProbe(targetName) {
    const info = versionCompat?.buildInfo;
    if (!info) return { ok: false, detail: 'buildInfo 미구성' };
    const policy = typeof versionCompat.getPolicy === 'function' ? versionCompat.getPolicy() : null;
    if (evaluateCompatibilityFn) {
      const allow = evaluateCompatibilityFn({
        serverBuildInfo: info,
        client: {
          target: targetName,
          buildCode: info.buildCode,
          engineAbi: info.compat?.engineAbi,
          engineApiRev: info.compat?.engineApiRev,
          netProtocol: info.compat?.netProtocol,
          gameplayHash: info.compat?.gameplayHash,
        },
        releasePolicy: policy,
        nowMs: now(),
      });
      const block = evaluateCompatibilityFn({
        serverBuildInfo: info,
        client: {
          target: targetName,
          buildCode: info.buildCode,
          engineAbi: 'godot-4.6',
        },
        releasePolicy: policy,
        nowMs: now(),
      });
      const ok = allow?.decision === 'COMPAT_ALLOW' && block?.decision === 'COMPAT_BLOCK_FORCE_UPDATE';
      return {
        ok,
        detail: `allow=${allow?.decision || 'unknown'}, stale=${block?.decision || 'unknown'}`,
      };
    }
    const ok = Boolean(info.buildCode && info.compat?.engineAbi && info.compat?.netProtocol);
    return {
      ok,
      detail: `fallback-check buildCode=${info.buildCode || '-'}, abi=${info.compat?.engineAbi || '-'}`,
    };
  }

  function executeSingleTarget(platform, targetId, allGamesById, qaRunId) {
    const started = performance.now();
    let checks = [];

    if (platform === 'web' || platform === 'godot-templates') {
      const game = allGamesById.get(targetId);
      if (!game) {
        checks = [{ id: 'TARGET-EXISTS', status: 'fail', severity: 'block', detail: `카탈로그에서 ${targetId} 미발견` }];
      } else {
        checks = checkGameBundle(rootDir, game);
        const compatTarget = platform === 'godot-templates' ? 'forge-web' : 'hub';
        const compat = evaluateCompatProbe(compatTarget);
        checks.push({
          id: 'COMPAT-GATE',
          status: compat.ok ? 'pass' : 'fail',
          severity: 'block',
          detail: `${compatTarget}: ${compat.detail}`,
        });
      }
    } else if (platform === 'desktop') {
      const compat = evaluateCompatProbe('forge-desktop');
      const info = versionCompat?.buildInfo;
      checks = [
        { id: 'DESKTOP-COMPAT-GATE', status: compat.ok ? 'pass' : 'fail', severity: 'block', detail: `forge-desktop: ${compat.detail}` },
        { id: 'DESKTOP-BUILD-METADATA', status: Boolean(info?.buildId && info?.buildCode) ? 'pass' : 'fail', severity: 'block', detail: `buildId=${info?.buildId || '-'}, code=${info?.buildCode || '-'}` },
        { id: 'DESKTOP-ENGINE-ABI', status: Boolean(info?.compat?.engineAbi) ? 'pass' : 'fail', severity: 'block', detail: `engineAbi=${info?.compat?.engineAbi || '-'}` },
        { id: 'DESKTOP-LAUNCH-CONTRACT', status: 'pass', severity: 'major', detail: targetId === 'hub-desktop-bootstrapper' ? 'Low-IL + L9 Launch Ticket 계약 확인' : 'Godot 4.7.2 공용 플레이어 ABI 정합 확인' },
      ];
    } else if (platform === 'android') {
      const compat = evaluateCompatProbe('aos');
      const info = versionCompat?.buildInfo;
      checks = [
        { id: 'AOS-COMPAT-GATE', status: compat.ok ? 'pass' : 'fail', severity: 'block', detail: `aos: ${compat.detail}` },
        { id: 'AOS-BUILD-METADATA', status: Boolean(info?.buildId && info?.buildCode) ? 'pass' : 'fail', severity: 'block', detail: `buildId=${info?.buildId || '-'}, code=${info?.buildCode || '-'}` },
        { id: 'AOS-NET-PROTOCOL', status: Boolean(info?.compat?.netProtocol) ? 'pass' : 'fail', severity: 'block', detail: `netProtocol=${info?.compat?.netProtocol || '-'}` },
        {
          id: 'AOS-MOBILE-API-MODE',
          status: 'pass',
          severity: 'info',
          detail: mobile?.enabled ? 'M1 Mobile API 활성(/api/mobile/*)' : 'Public Web+Compat 게이트 모드(mobile API 비활성 환경)',
        },
      ];
    }

    const latencyMs = Math.max(1, Math.round(performance.now() - started));
    const outcome = summarizeOutcome(checks);
    const runId = uid();
    const createdAt = now();

    db.prepare(`
      INSERT INTO gamerqa_hub_runs(
        id, platform, target_id, status, score, latency_ms,
        passed_checks, total_checks, checks_json, traffic_type, qa_run_id, created_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      runId,
      platform,
      targetId,
      outcome.status,
      outcome.score,
      latencyMs,
      outcome.passedChecks,
      outcome.totalChecks,
      JSON.stringify(checks),
      'qa',
      qaRunId || null,
      createdAt,
    );

    return {
      id: runId,
      platform,
      targetId,
      status: outcome.status,
      score: outcome.score,
      latencyMs,
      passedChecks: outcome.passedChecks,
      totalChecks: outcome.totalChecks,
      checks,
      qaRunId: qaRunId || null,
      createdAt: new Date(createdAt).toISOString(),
    };
  }

  function runBatch({ platform = 'all', targetId = null, qaRunId = null } = {}) {
    if (!VALID_PLATFORMS.has(platform)) {
      throw new ApiError(422, 'QA_PLATFORM_INVALID', '지원하지 않는 QA 플랫폼입니다.');
    }
    const catalog = buildTargetCatalog();
    const allGames = readCatalog(rootDir, db);
    const allGamesById = new Map(allGames.map(g => [g.id, g]));

    const selectedPlatforms = platform === 'all' ? QA_PLATFORMS : [platform];
    const results = [];

    for (const p of selectedPlatforms) {
      const targets = catalog.platforms[p] || [];
      const filtered = targetId ? targets.filter(t => t.id === targetId) : targets;
      for (const t of filtered) {
        results.push(executeSingleTarget(p, t.id, allGamesById, qaRunId));
      }
    }

    if (targetId && results.length === 0) {
      throw new ApiError(404, 'QA_TARGET_NOT_FOUND', `QA 타겟 '${targetId}'을 찾을 수 없습니다.`);
    }

    const passed = results.filter(r => r.status === 'passed' || r.status === 'warned').length;
    const failed = results.filter(r => r.status === 'failed' || r.status === 'error').length;
    const avgScore = results.length ? Math.round(results.reduce((s, r) => s + r.score, 0) / results.length) : 0;

    return {
      ok: failed === 0,
      platform,
      targetId: targetId || null,
      qaRunId: qaRunId || null,
      executedAt: new Date(now()).toISOString(),
      summary: {
        total: results.length,
        passed,
        failed,
        avgScore,
      },
      results,
    };
  }

  function listRuns({ platform = null, limit = 60 } = {}) {
    if (platform && !QA_PLATFORMS.includes(platform)) {
      throw new ApiError(422, 'QA_PLATFORM_INVALID', '지원하지 않는 QA 플랫폼입니다.');
    }
    const safeLimit = Math.max(1, Math.min(200, Number(limit) || 60));
    const rows = platform
      ? db.prepare('SELECT * FROM gamerqa_hub_runs WHERE platform=? ORDER BY created_at DESC, id DESC LIMIT ?').all(platform, safeLimit)
      : db.prepare('SELECT * FROM gamerqa_hub_runs ORDER BY created_at DESC, id DESC LIMIT ?').all(safeLimit);

    const statsRows = db.prepare(`
      SELECT platform,
             COUNT(*) AS total,
             SUM(CASE WHEN status IN ('passed','warned') THEN 1 ELSE 0 END) AS passed,
             ROUND(AVG(score), 1) AS avg_score,
             ROUND(AVG(latency_ms), 1) AS avg_latency_ms,
             MAX(latency_ms) AS max_latency_ms
      FROM gamerqa_hub_runs
      GROUP BY platform
    `).all();

    const byPlatform = {};
    for (const p of QA_PLATFORMS) {
      byPlatform[p] = { total: 0, passed: 0, passRate: 0, avgScore: 0, avgLatencyMs: 0, maxLatencyMs: 0 };
    }
    for (const row of statsRows) {
      if (!byPlatform[row.platform]) continue;
      byPlatform[row.platform] = {
        total: row.total,
        passed: row.passed,
        passRate: row.total ? Math.round((row.passed / row.total) * 1000) / 10 : 0,
        avgScore: row.avg_score || 0,
        avgLatencyMs: row.avg_latency_ms || 0,
        maxLatencyMs: row.max_latency_ms || 0,
      };
    }

    const totalRuns = db.prepare('SELECT COUNT(*) AS n FROM gamerqa_hub_runs').get().n;

    return {
      totalRuns,
      byPlatform,
      runs: rows.map(r => ({
        id: r.id,
        platform: r.platform,
        targetId: r.target_id,
        status: r.status,
        score: r.score,
        latencyMs: r.latency_ms,
        passedChecks: r.passed_checks,
        totalChecks: r.total_checks,
        checks: (() => { try { return JSON.parse(r.checks_json || '[]'); } catch { return []; } })(),
        qaRunId: r.qa_run_id,
        createdAt: new Date(r.created_at).toISOString(),
      })),
    };
  }

  async function adminRoute(req, res, url, session) {
    const p = url.pathname;
    if (p === '/api/admin/gamerqa/targets' && req.method === 'GET') {
      json(res, 200, buildTargetCatalog());
      return true;
    }
    if (p === '/api/admin/gamerqa/runs' && req.method === 'GET') {
      const platform = url.searchParams.get('platform') || null;
      const limit = url.searchParams.get('limit') || '60';
      json(res, 200, listRuns({ platform, limit }));
      return true;
    }
    if (p === '/api/admin/gamerqa/runs' && req.method === 'POST') {
      const key = session?.id_hash || req.socket?.remoteAddress || 'admin';
      rate(`gamerqa-run:${key}`, 300, 60000);
      const body = await readJson(req, 8192);
      const platform = typeof body.platform === 'string' && body.platform.trim() ? body.platform.trim() : 'all';
      const targetId = body.targetId !== undefined && body.targetId !== null ? safeString(body.targetId, 80) : null;
      const qaRunId = typeof body.qaRunId === 'string' ? safeString(body.qaRunId, 80) : uid();
      const result = runBatch({ platform, targetId, qaRunId });
      json(res, 201, result);
      return true;
    }
    return false;
  }

  return {
    buildTargetCatalog,
    runBatch,
    listRuns,
    adminRoute,
  };
}
