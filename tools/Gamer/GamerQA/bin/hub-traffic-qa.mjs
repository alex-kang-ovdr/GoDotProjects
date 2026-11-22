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
    rounds: 3,
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
    else if (a === '--rounds') opts.rounds = Math.max(1, Number(argv[++i]) || 3);
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

async function captureEvidence(baseUrl, outDir) {
  const chromeBin = findChrome();
  if (!chromeBin) return { captured: [], godotLoaded: false, warning: 'Chrome/Edge binary not found' };

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
  let godotCorsErrors = 0;
  let godotWasmOk = false;
  let godotPckOk = false;
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
    const send = (method, params = {}, sid) => new Promise((resolve, reject) => {
      const id = ++serial;
      const timer = setTimeout(() => { jobs.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 20000);
      jobs.set(id, {
        resolve: v => { clearTimeout(timer); resolve(v); },
        reject: e => { clearTimeout(timer); reject(e); },
      });
      socket.send(JSON.stringify({ id, method, params, ...(sid ? { sessionId: sid } : {}) }));
    });
    socket.addEventListener('message', ({ data }) => {
      const m = JSON.parse(data);
      if (jobs.has(m.id)) {
        const job = jobs.get(m.id);
        jobs.delete(m.id);
        m.error ? job.reject(new Error(m.error.message)) : job.resolve(m.result);
      }
      if (m.method === 'Target.attachedToTarget') {
        void send('Network.enable', {}, m.params.sessionId).catch(() => {});
        void send('Log.enable', {}, m.params.sessionId).catch(() => {});
      }
      if (m.method === 'Network.responseReceived') {
        const u = m.params.response?.url || '';
        const st = m.params.response?.status || 0;
        if (u.includes('forge-voxel-frontier/index.wasm') && st === 200) godotWasmOk = true;
        if (u.includes('forge-voxel-frontier/index.pck') && st === 200) godotPckOk = true;
      }
      if (m.method === 'Log.entryAdded' && String(m.params.entry?.text || '').includes('blocked by CORS')) {
        godotCorsErrors++;
      }
    });

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Network.enable');
    await send('Log.enable');
    await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

    const snap = async (name, url) => {
      const res = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
      const filePath = path.join(outDir, name);
      fs.writeFileSync(filePath, Buffer.from(res.data, 'base64'));
      captured.push({ name, url, path: filePath, bytes: fs.statSync(filePath).size });
    };

    // 1. Desktop Hub Portal (verify no QA nav, no match3+ tags)
    await send('Page.navigate', { url: `${baseUrl}/` });
    await delay(2500);
    await snap('evidence-01-hub-desktop.png', `${baseUrl}/`);

    // 2. Mobile 390px Portal (verify logo + search bar single line)
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await delay(800);
    await snap('evidence-02-hub-mobile.png', `${baseUrl}/ (390x844)`);

    // 3. Godot Template Game live launch (verify WASM + PCK load without CORS error)
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: `${baseUrl}/play/forge-voxel-frontier/` });
    await delay(2500);
    await send('Runtime.evaluate', { expression: "document.querySelector('#play-button')?.click()" });
    await delay(10000);
    await snap('evidence-03-godot-running.png', `${baseUrl}/play/forge-voxel-frontier/`);

    return { captured, godotWasmOk, godotPckOk, godotCorsErrors, warning: null };
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
    const health = await (await fetch(`${opts.url}/_healthz`)).json();
    const version = await (await fetch(`${opts.url}/api/version`)).json();
    const gamesPayload = await (await fetch(`${opts.url}/api/games`)).json();
    const games = gamesPayload.games || [];
    const webGames = games.filter(g => !g.id.startsWith('forge-'));
    const godotGames = games.filter(g => g.id.startsWith('forge-'));

    // Security boundary check: public /qa/ and /api/admin/* must NOT be exposed
    const qaPageRes = await fetch(`${opts.url}/qa/`);
    const adminApiRes = await fetch(`${opts.url}/api/admin/gamerqa/targets`);

    // QA isolated session + game start check (no ORIGIN_DENIED)
    const sessRes = await fetch(`${opts.url}/api/session`, { headers: { Origin: origin } });
    let cookie = extractCookie(sessRes);
    let sessBody = await sessRes.json();
    let csrf = sessBody.csrfToken;
    const qaSessRes = await fetch(`${opts.url}/api/qa/session`, {
      method: 'POST',
      headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: '{}',
    });
    cookie = extractCookie(qaSessRes) || cookie;
    csrf = (await qaSessRes.json()).csrfToken;

    const playStartRes = await fetch(`${opts.url}/api/play-sessions`, {
      method: 'POST',
      headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify({ gameId: godotGames[0]?.id || 'forge-voxel-frontier' }),
    });

    // Email registration + Forge auth probe (when /forge/ is mounted)
    const emailSessRes = await fetch(`${opts.url}/api/session`, { headers: { Origin: origin } });
    const emailSessCookie = extractCookie(emailSessRes);
    const emailSessCsrf = (await emailSessRes.json()).csrfToken;
    const regRes = await fetch(`${opts.url}/api/auth/email/register`, {
      method: 'POST',
      headers: { Origin: origin, Cookie: emailSessCookie, 'Content-Type': 'application/json', 'X-CSRF-Token': emailSessCsrf },
      body: JSON.stringify({ email: `qa-traffic-${Date.now()}@example.com`, password: 'TrafficPass!1234', displayName: 'QATraffic' }),
    });
    const regCookie = extractCookie(regRes) || emailSessCookie;
    const forgeCheck = await fetch(`${opts.url}/forge/OfficialGodot/`, {
      headers: { Cookie: regCookie, Accept: 'text/html' },
      redirect: 'manual',
    });

    // Multi-platform concurrent traffic workload
    const compatPayload = (target) => ({
      target,
      buildCode: version.buildInfo.buildCode,
      engineAbi: version.buildInfo.compat.engineAbi,
      engineApiRev: version.buildInfo.compat.engineApiRev,
      netProtocol: version.buildInfo.compat.netProtocol,
      gameplayHash: version.buildInfo.compat.gameplayHash,
    });

    const jobs = [];
    for (let r = 0; r < opts.rounds; r++) {
      jobs.push(
        { label: 'web:portal', url: `${opts.url}/` },
        { label: 'api:health', url: `${opts.url}/api/health` },
        { label: 'api:version', url: `${opts.url}/api/version` },
        { label: 'api:games', url: `${opts.url}/api/games` },
        { label: 'desktop:compat', url: `${opts.url}/api/compat/check`, method: 'POST', body: compatPayload('forge-desktop') },
        { label: 'android:compat', url: `${opts.url}/api/compat/check`, method: 'POST', body: compatPayload('aos') },
        { label: 'godot:compat', url: `${opts.url}/api/compat/check`, method: 'POST', body: compatPayload('forge-web') },
        { label: 'play:start-godot', url: `${opts.url}/api/play-sessions`, method: 'POST', auth: true, body: { gameId: 'forge-voxel-frontier' } },
      );
      for (const g of webGames) jobs.push({ label: `web-game:${g.id}`, url: `${opts.url}${g.entryUrl}` });
      for (const g of godotGames) jobs.push({ label: `godot-template:${g.id}`, url: `${opts.url}${g.entryUrl}` });
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
          latencies.push(performance.now() - t0);
          statusCounts.ERR = (statusCounts.ERR || 0) + 1;
          failures.push({ label: job.label, error: err.message });
        }
      }
    }

    await Promise.all(Array.from({ length: opts.concurrency }, worker));
    const loadDurationMs = Math.max(1, Math.round(performance.now() - loadStarted));
    latencies.sort((a, b) => a - b);

    const evidence = opts.skipScreenshots
      ? { captured: [], godotWasmOk: false, godotPckOk: false, godotCorsErrors: 0, warning: 'Skipped by flag' }
      : await captureEvidence(opts.url, outDir);

    const report = {
      runId: opts.runId,
      targetUrl: opts.url,
      mode: localServer ? 'local-cloudrun-entrypoint' : 'remote-cloudrun',
      generatedAt: new Date().toISOString(),
      health,
      buildInfo: version.buildInfo,
      securityChecks: {
        publicQaPageStatus: qaPageRes.status,
        publicAdminApiStatus: adminApiRes.status,
        anonIsAdmin: sessBody.isAdmin,
        anonAdminUrl: sessBody.adminUrl,
        playSessionStartStatus: playStartRes.status,
        forgeAfterEmailLoginStatus: forgeCheck.status,
      },
      catalogCounts: { total: games.length, web: webGames.length, godotTemplates: godotGames.length },
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
      godotRuntimeProbe: {
        wasmHttp200: evidence.godotWasmOk,
        pckHttp200: evidence.godotPckOk,
        corsErrors: evidence.godotCorsErrors,
      },
      screenshots: evidence.captured,
    };

    fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
    if (failures.length > 0 || playStartRes.status !== 201 || qaPageRes.status !== 404 || adminApiRes.status !== 404 || evidence.godotCorsErrors > 0) {
      process.exitCode = 1;
    }
  } finally {
    if (localServer) await localServer.stop();
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
