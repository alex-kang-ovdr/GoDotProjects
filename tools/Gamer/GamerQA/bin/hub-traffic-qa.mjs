#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../..');

function parseArgs(argv) {
  const opts = {
    url: '',
    spawnLocal: false,
    port: 18995,
    concurrency: 12,
    rounds: 4,
    runId: `hub-traffic-qa-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`,
    skipScreenshots: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--spawn-local') opts.spawnLocal = true;
    else if (a === '--skip-screenshots') opts.skipScreenshots = true;
    else if (a === '--url') opts.url = String(argv[++i] || '').replace(/\/$/, '');
    else if (a === '--port') opts.port = Number(argv[++i]);
    else if (a === '--concurrency') opts.concurrency = Math.max(1, Number(argv[++i]) || 12);
    else if (a === '--rounds') opts.rounds = Math.max(1, Number(argv[++i]) || 4);
    else if (a === '--run-id') opts.runId = String(argv[++i] || opts.runId);
  }
  return opts;
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return Math.round(sorted[idx] * 10) / 10;
}

function extractCookie(res) {
  const raw = res.headers.getSetCookie?.() || [];
  return raw.map(c => c.split(';', 1)[0]).join('; ');
}

function findChrome() {
  const candidates = [
    process.env.PLAYHUB_CHROME,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].filter(Boolean);
  return candidates.find(p => fs.existsSync(p)) || null;
}

async function captureScreenshots(baseUrl, outDir) {
  const chromeBin = findChrome();
  if (!chromeBin) return { captured: [], warning: 'Chrome/Edge binary not found' };

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'gamerqa-shot-'));
  const chrome = spawn(chromeBin, [
    '--headless=new',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=0',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    `--user-data-dir=${profile}`,
    'about:blank',
  ], { windowsHide: true, stdio: 'ignore' });

  let socket;
  const captured = [];
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    let portText = '';
    for (let i = 0; i < 120; i++) {
      if (fs.existsSync(portFile)) {
        try {
          portText = fs.readFileSync(portFile, 'utf8');
          if (portText.trim()) break;
        } catch {}
      }
      await delay(100);
    }
    const debugPort = Number(portText.split('\n')[0]);
    if (!debugPort) throw new Error('Chrome DevToolsActivePort unavailable');

    const tab = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' })).json();
    socket = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((r, j) => {
      socket.addEventListener('open', r, { once: true });
      socket.addEventListener('error', j, { once: true });
    });

    let serial = 0;
    const jobs = new Map();
    socket.addEventListener('message', ({ data }) => {
      const m = JSON.parse(data);
      if (jobs.has(m.id)) {
        const job = jobs.get(m.id);
        jobs.delete(m.id);
        m.error ? job.reject(new Error(m.error.message)) : job.resolve(m.result);
      }
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++serial;
      const timer = setTimeout(() => { jobs.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 20000);
      jobs.set(id, {
        resolve: v => { clearTimeout(timer); resolve(v); },
        reject: e => { clearTimeout(timer); reject(e); },
      });
      socket.send(JSON.stringify({ id, method, params }));
    });

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

    const shots = [
      { name: 'evidence-01-hub-portal.png', url: `${baseUrl}/`, waitMs: 2200 },
      { name: 'evidence-02-gamerqa-dashboard.png', url: `${baseUrl}/qa/`, waitMs: 2500 },
      { name: 'evidence-03-godot-template-play.png', url: `${baseUrl}/play/forge-voxel-frontier/`, waitMs: 2200 },
    ];

    for (const s of shots) {
      await send('Page.navigate', { url: s.url });
      await delay(s.waitMs);
      const res = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
      const filePath = path.join(outDir, s.name);
      fs.writeFileSync(filePath, Buffer.from(res.data, 'base64'));
      captured.push({ name: s.name, url: s.url, path: filePath, bytes: fs.statSync(filePath).size });
    }
    return { captured, warning: null };
  } finally {
    try { socket?.close(); } catch {}
    if (chrome && chrome.exitCode === null) {
      try { chrome.kill(); } catch {}
      await delay(300);
    }
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 }); } catch {}
  }
}

async function startLocalCloudRun(port) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-cr-traffic-'));
  const child = spawn(process.execPath, ['deploy/cloudrun/hub/entrypoint.mjs'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
      PLAYHUB_PUBLIC_ORIGIN: `http://127.0.0.1:${port}`,
      PLAYHUB_DATA_DIR: path.join(tmp, 'data'),
      PLAYHUB_FORGE_DIR: path.join(tmp, 'forge'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  await new Promise((resolve, reject) => {
    let out = '';
    let err = '';
    const timer = setTimeout(() => reject(new Error(`Local Cloud Run startup timeout: ${err}`)), 15000);
    child.stdout.on('data', d => {
      out += d.toString();
      if (out.includes('cloudrun_hub_listening')) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.stderr.on('data', d => { err += d.toString(); });
    child.once('exit', code => {
      clearTimeout(timer);
      reject(new Error(`Entrypoint exited early (${code}): ${err}`));
    });
  });

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    async stop() {
      child.kill('SIGTERM');
      await delay(400);
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
    },
  };
}

async function run() {
  const opts = parseArgs(process.argv.slice(2));
  let localServer = null;
  if (opts.spawnLocal || !opts.url) {
    localServer = await startLocalCloudRun(opts.port);
    opts.url = localServer.baseUrl;
  }

  const outDir = path.join(repoRoot, 'artifacts', 'gamerqa', opts.runId);
  fs.mkdirSync(outDir, { recursive: true });

  try {
    const origin = new URL(opts.url).origin;

    // 1. Health, version, and QA session
    const health = await (await fetch(`${opts.url}/_healthz`)).json();
    const version = await (await fetch(`${opts.url}/api/version`)).json();
    const targets = await (await fetch(`${opts.url}/api/qa/targets`)).json();

    const sessRes = await fetch(`${opts.url}/api/session`, { headers: { Origin: origin } });
    let cookie = extractCookie(sessRes);
    let csrf = (await sessRes.json()).csrfToken;
    const qaSessRes = await fetch(`${opts.url}/api/qa/session`, {
      method: 'POST',
      headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: '{}',
    });
    cookie = extractCookie(qaSessRes) || cookie;
    csrf = (await qaSessRes.json()).csrfToken;

    // 2. Full 4-platform QA run
    const fullQaRes = await fetch(`${opts.url}/api/qa/runs`, {
      method: 'POST',
      headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify({ platform: 'all' }),
    });
    const fullQa = await fullQaRes.json();

    // 3. Build multi-platform traffic workload
    const compatPayload = (target) => ({
      target,
      buildCode: version.buildInfo.buildCode,
      engineAbi: version.buildInfo.compat.engineAbi,
      engineApiRev: version.buildInfo.compat.engineApiRev,
      netProtocol: version.buildInfo.compat.netProtocol,
      gameplayHash: version.buildInfo.compat.gameplayHash,
    });

    const jobs = [];
    const webGames = targets.platforms.web || [];
    const godotGames = targets.platforms['godot-templates'] || [];

    for (let r = 0; r < opts.rounds; r++) {
      jobs.push(
        { label: 'web:portal', url: `${opts.url}/` },
        { label: 'web:qa-ui', url: `${opts.url}/qa/` },
        { label: 'api:health', url: `${opts.url}/api/health` },
        { label: 'api:version', url: `${opts.url}/api/version` },
        { label: 'api:games', url: `${opts.url}/api/games` },
        { label: 'api:qa-targets', url: `${opts.url}/api/qa/targets` },
        { label: 'api:qa-runs', url: `${opts.url}/api/qa/runs?limit=40` },
        { label: 'desktop:compat', url: `${opts.url}/api/compat/check`, method: 'POST', body: compatPayload('forge-desktop') },
        { label: 'android:compat', url: `${opts.url}/api/compat/check`, method: 'POST', body: compatPayload('aos') },
        { label: 'godot:compat', url: `${opts.url}/api/compat/check`, method: 'POST', body: compatPayload('forge-web') },
        { label: 'qa:run-desktop', url: `${opts.url}/api/qa/runs`, method: 'POST', auth: true, body: { platform: 'desktop' } },
        { label: 'qa:run-android', url: `${opts.url}/api/qa/runs`, method: 'POST', auth: true, body: { platform: 'android' } },
        { label: 'qa:run-godot', url: `${opts.url}/api/qa/runs`, method: 'POST', auth: true, body: { platform: 'godot-templates' } },
      );
      for (const g of webGames) {
        jobs.push({ label: `web-game:${g.id}`, url: `${opts.url}${g.entryUrl}` });
      }
      for (const g of godotGames) {
        jobs.push({ label: `godot-template:${g.id}`, url: `${opts.url}${g.entryUrl}` });
      }
    }

    const latencies = [];
    const statusCounts = {};
    const failures = [];
    let cursor = 0;
    const loadStarted = performance.now();

    async function worker() {
      while (true) {
        const idx = cursor++;
        if (idx >= jobs.length) break;
        const job = jobs[idx];
        const t0 = performance.now();
        try {
          const headers = {};
          if (job.body !== undefined) headers['Content-Type'] = 'application/json';
          if (job.auth) {
            headers.Origin = origin;
            headers.Cookie = cookie;
            headers['X-CSRF-Token'] = csrf;
          }
          const res = await fetch(job.url, {
            method: job.method || 'GET',
            headers,
            body: job.body !== undefined ? JSON.stringify(job.body) : undefined,
          });
          await res.arrayBuffer();
          const dt = performance.now() - t0;
          latencies.push(dt);
          statusCounts[res.status] = (statusCounts[res.status] || 0) + 1;
          if (!res.ok) failures.push({ label: job.label, status: res.status });
        } catch (err) {
          const dt = performance.now() - t0;
          latencies.push(dt);
          statusCounts.ERR = (statusCounts.ERR || 0) + 1;
          failures.push({ label: job.label, error: err.message });
        }
      }
    }

    await Promise.all(Array.from({ length: opts.concurrency }, worker));
    const loadDurationMs = Math.max(1, Math.round(performance.now() - loadStarted));
    latencies.sort((a, b) => a - b);

    const finalRuns = await (await fetch(`${opts.url}/api/qa/runs?limit=60`)).json();

    // 4. Evidence screenshots
    const shots = opts.skipScreenshots
      ? { captured: [], warning: 'Skipped by flag' }
      : await captureScreenshots(opts.url, outDir);

    const report = {
      runId: opts.runId,
      targetUrl: opts.url,
      mode: localServer ? 'local-cloudrun-entrypoint' : 'remote-cloudrun',
      generatedAt: new Date().toISOString(),
      health,
      buildInfo: version.buildInfo,
      targetsSummary: targets.summary,
      fullQaSummary: fullQa.summary,
      trafficLoad: {
        concurrency: opts.concurrency,
        rounds: opts.rounds,
        totalRequests: jobs.length,
        durationMs: loadDurationMs,
        rps: Math.round((jobs.length / (loadDurationMs / 1000)) * 10) / 10,
        statusCounts,
        errorCount: failures.length,
        errorRatePct: Math.round((failures.length / jobs.length) * 10000) / 100,
        latencyMs: {
          p50: percentile(latencies, 50),
          p95: percentile(latencies, 95),
          p99: percentile(latencies, 99),
          max: Math.round((latencies[latencies.length - 1] || 0) * 10) / 10,
        },
        failures: failures.slice(0, 20),
      },
      persistedQaStats: {
        totalRuns: finalRuns.totalRuns,
        byPlatform: finalRuns.byPlatform,
      },
      screenshots: shots.captured,
      screenshotWarning: shots.warning,
    };

    fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');

    const md = [
      `# PlayHub Multi-Platform GamerQA & Traffic Report — \`${opts.runId}\``,
      '',
      `- **Target URL**: ${opts.url} (\`${report.mode}\`)`,
      `- **Build**: \`${version.buildInfo?.buildId || '-'}\` (\`${version.buildInfo?.channel || 'dev'}\`)`,
      `- **Generated At**: ${report.generatedAt}`,
      '',
      '## 1. Multi-Platform QA Coverage',
      '',
      '| Platform | Targets | Persisted QA Runs | Pass Rate | Avg Score | Avg Latency |',
      '|---|---:|---:|---:|---:|---:|',
      ...['web', 'desktop', 'android', 'godot-templates'].map(p => {
        const st = finalRuns.byPlatform[p] || {};
        return `| \`${p}\` | ${targets.summary[p] || 0} | ${st.total || 0} | ${st.passRate || 0}% | ${st.avgScore || 0}/100 | ${st.avgLatencyMs || 0} ms |`;
      }),
      '',
      '## 2. Traffic Load Test Metrics',
      '',
      `- **Total Requests**: ${report.trafficLoad.totalRequests} (concurrency=${opts.concurrency}, rounds=${opts.rounds})`,
      `- **Throughput**: ${report.trafficLoad.rps} req/s (${loadDurationMs} ms)`,
      `- **Errors**: ${report.trafficLoad.errorCount} (${report.trafficLoad.errorRatePct}%)`,
      `- **Latency**: p50=${report.trafficLoad.latencyMs.p50}ms / p95=${report.trafficLoad.latencyMs.p95}ms / p99=${report.trafficLoad.latencyMs.p99}ms / max=${report.trafficLoad.latencyMs.max}ms`,
      `- **HTTP Statuses**: \`${JSON.stringify(statusCounts)}\``,
      '',
      '## 3. Evidence Screenshots',
      '',
      ...shots.captured.map(s => `- **${s.name}** (${s.url}) — \`${s.bytes} bytes\``),
      '',
    ].join('\n');

    fs.writeFileSync(path.join(outDir, 'REPORT.md'), md);

    console.log(JSON.stringify({
      ok: failures.length === 0 && fullQa.ok,
      outDir,
      targetUrl: opts.url,
      targets: targets.summary,
      fullQa: fullQa.summary,
      trafficLoad: report.trafficLoad,
      screenshots: shots.captured.map(s => s.path),
    }, null, 2));

    if (failures.length > 0 || !fullQa.ok) process.exitCode = 1;
  } finally {
    if (localServer) await localServer.stop();
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
