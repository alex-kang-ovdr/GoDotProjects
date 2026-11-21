'use strict';

/**
 * PlayForge Template Showcase ("제작과정 보기") Daily E2E & Performance/Memory/Loading/Response Profiler
 *
 * - Auto-discovers all templates in forge/Templates/* with showcase.json (plus catalogs all templates)
 * - Layer 1: Forge HTTP API response time + showcase prepare time
 * - Layer 2: Native Godot 4.7.2 headless import + showcase-headless.gd E2E + Peak RSS
 * - Layer 3: Real Chrome Web Forge WASM E2E ("만드는 과정 보기" click -> WASM boot -> 4-role replay -> done)
 *            with Loading Time, API Response Time (p50/p95), FPS/Frame Time (p50/p95), JS/WASM/Server Memory
 * - Daily Report (JSON + Markdown) + History JSONL + Trend Tracking (7-day baseline delta, regression alerts, SVG HTML dashboard)
 */

const assert = require('node:assert/strict');
const { spawn, execSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

const forgeRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(forgeRoot, '..');

// Fallback node_modules resolution for fresh git worktrees that share PlayHub-Platform's installed forge dependencies
const localNodeModules = path.join(forgeRoot, 'node_modules');
const fallbackNodeModules = process.env.PLAYFORGE_NODE_MODULES_FALLBACK || 'D:\\Github\\GoDotProjects-worktrees\\PlayHub-Platform\\forge\\node_modules';
if (!fs.existsSync(path.join(localNodeModules, 'yjs')) && fs.existsSync(fallbackNodeModules)) {
  process.env.NODE_PATH = process.env.NODE_PATH
    ? `${process.env.NODE_PATH}${path.delimiter}${fallbackNodeModules}`
    : fallbackNodeModules;
  Module._initPaths();
}

const { createServer } = require(path.join(forgeRoot, 'server.cjs'));
const { loadGameTemplates } = require(path.join(forgeRoot, 'Tools', 'template-catalog.cjs'));
const { prepareTemplateShowcase } = require(path.join(forgeRoot, 'Tools', 'prepare-template-showcase.cjs'));

const VENDOR_MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.json': 'application/json; charset=utf-8',
};

const THRESHOLDS = {
  wasmBootDeltaPct: 15,
  godotImportDeltaPct: 15,
  frameP95DeltaPct: 20,
  memoryDeltaPct: 15,
  apiP95DeltaPct: 25,
};

function parseArgs(argv) {
  const opts = {
    templates: 'all',
    mode: 'full', // full | headless | web
    out: path.join(repoRoot, 'artifacts', 'showcase-daily'),
    godot: process.env.GODOT_EDITOR || 'D:\\Github\\GoDotProjects\\Godot_v4.7.2-stable_win64.exe',
    vendorFallback: process.env.PLAYFORGE_VENDOR_FALLBACK || 'D:\\Github\\GoDotProjects-worktrees\\PlayHub-Platform\\forge\\OfficialGodot\\vendor',
    playwrightRoot: process.env.PLAYFORGE_PLAYWRIGHT_ROOT || '',
    keepTemp: false,
    quiet: false,
  };
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    const key = eq > 0 ? arg.slice(2, eq) : arg.slice(2);
    const val = eq > 0 ? arg.slice(eq + 1) : 'true';
    if (key === 'templates') opts.templates = val;
    else if (key === 'mode') opts.mode = val;
    else if (key === 'out') opts.out = path.resolve(val);
    else if (key === 'godot') opts.godot = val;
    else if (key === 'vendor-fallback') opts.vendorFallback = path.resolve(val);
    else if (key === 'playwright-root') opts.playwrightRoot = path.resolve(val);
    else if (key === 'keep-temp') opts.keepTemp = val !== 'false';
    else if (key === 'quiet') opts.quiet = val !== 'false';
  }
  return opts;
}

function getKstDateParts(now = new Date()) {
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  const yyyy = kst.getUTCFullYear();
  const mm = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(kst.getUTCDate()).padStart(2, '0');
  const hh = String(kst.getUTCHours()).padStart(2, '0');
  const mi = String(kst.getUTCMinutes()).padStart(2, '0');
  const ss = String(kst.getUTCSeconds()).padStart(2, '0');
  return {
    date: `${yyyy}-${mm}-${dd}`,
    time: `${hh}:${mi}:${ss}`,
    isoKst: `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}+09:00`,
    runId: `${yyyy}-${mm}-${dd}_${hh}${mi}${ss}`,
  };
}

function getGitMeta() {
  try {
    const sha = execSync('git rev-parse --short HEAD', { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const subject = execSync('git log -1 --format=%s', { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return { sha, branch, subject };
  } catch {
    return { sha: 'unknown', branch: 'unknown', subject: '' };
  }
}

function round(n, digits = 1) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function percentile(values, p) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const sorted = [...values].filter(v => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function mean(values) {
  const valid = (values || []).filter(v => typeof v === 'number' && Number.isFinite(v));
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

function resolvePlaywright(explicitRoot) {
  const candidates = [
    explicitRoot,
    path.join(forgeRoot, 'node_modules'),
    path.join(repoRoot, 'node_modules'),
    'D:\\Github\\GoDotProjects-worktrees\\PlayHub-Platform\\forge\\node_modules',
  ].filter(Boolean);
  for (const dir of candidates) {
    for (const pkg of ['@playwright/test', 'playwright', 'playwright-core']) {
      try {
        const resolved = require.resolve(pkg, { paths: [dir] });
        return require(resolved);
      } catch {}
    }
  }
  throw new Error(`Playwright not found in: ${candidates.join(', ')}`);
}

function sampleWindowsProcessRssMb(pid) {
  if (!pid || process.platform !== 'win32') return null;
  try {
    const out = execSync(
      `powershell -NoProfile -Command "$p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if ($p) { Write-Output ($p.PeakWorkingSet64.ToString() + ',' + $p.WorkingSet64.ToString()) }"`,
      { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    if (!out) return null;
    const [peak, cur] = out.split(',').map(Number);
    return {
      peakMb: Number.isFinite(peak) ? peak / (1024 * 1024) : null,
      curMb: Number.isFinite(cur) ? cur / (1024 * 1024) : null,
    };
  } catch {
    return null;
  }
}

function runCommandTimed(command, args, { cwd = forgeRoot, timeoutMs = 60000 } = {}) {
  return new Promise(resolve => {
    const t0 = performance.now();
    const child = spawn(command, args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let peakRssMb = null;
    let timedOut = false;

    child.stdout.on('data', chunk => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', chunk => { stderr += chunk.toString('utf8'); });

    const sampler = setInterval(() => {
      if (child.pid && child.exitCode === null) {
        const mem = sampleWindowsProcessRssMb(child.pid);
        if (mem?.peakMb != null) peakRssMb = Math.max(peakRssMb || 0, mem.peakMb);
        else if (mem?.curMb != null) peakRssMb = Math.max(peakRssMb || 0, mem.curMb);
      }
    }, 350);

    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill('SIGKILL'); } catch {}
    }, timeoutMs);

    child.on('error', err => {
      clearInterval(sampler);
      clearTimeout(timer);
      resolve({
        exitCode: -1,
        durationMs: round(performance.now() - t0),
        peakRssMb: round(peakRssMb),
        stdout,
        stderr: stderr + '\n' + err.message,
        timedOut,
      });
    });

    child.on('close', code => {
      clearInterval(sampler);
      clearTimeout(timer);
      resolve({
        exitCode: code,
        durationMs: round(performance.now() - t0),
        peakRssMb: round(peakRssMb),
        stdout,
        stderr,
        timedOut,
      });
    });
  });
}

async function timedFetchJson(url, options) {
  const t0 = performance.now();
  const res = await fetch(url, options);
  const text = await res.text();
  const ms = performance.now() - t0;
  let data = null;
  try { data = JSON.parse(text); } catch {}
  return { status: res.status, ms: round(ms), bytes: Buffer.byteLength(text, 'utf8'), data, text };
}

async function startEphemeralForgeServer(tempRoot) {
  const workspace = path.join(tempRoot, 'workspace');
  const platformWorkspace = path.join(tempRoot, 'platform');
  const buildDirectory = path.join(tempRoot, 'builds');
  const cacheDir = path.join(tempRoot, 'http-cache');
  fs.mkdirSync(workspace, { recursive: true });
  fs.mkdirSync(platformWorkspace, { recursive: true });
  fs.mkdirSync(buildDirectory, { recursive: true });

  const server = createServer({
    workspace,
    platformWorkspace,
    buildDirectory,
    hubAuth: false,
    httpCache: { enabled: true, cacheDir },
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

async function profileHeadlessGodot(templateId, godotExe, tempRoot) {
  if (!fs.existsSync(godotExe)) {
    return { skipped: true, reason: `Godot binary not found: ${godotExe}`, ok: true };
  }
  const projectDir = path.join(tempRoot, `headless-${templateId}`);
  const tPrep0 = performance.now();
  prepareTemplateShowcase(templateId, projectDir, 'showcase');
  const prepareMs = round(performance.now() - tPrep0);

  const importRes = await runCommandTimed(godotExe, ['--headless', '--path', projectDir, '--editor', '--import', '--quit'], {
    cwd: forgeRoot,
    timeoutMs: 90000,
  });
  const importCombined = importRes.stdout + '\n' + importRes.stderr;
  const importError = importRes.exitCode !== 0 || /SCRIPT ERROR:|Parse Error|^ERROR:/m.test(importCombined);

  const headlessScript = path.join(forgeRoot, 'Tests', 'playforge_replay', 'fixtures', 'showcase-headless.gd');
  const replayRes = await runCommandTimed(godotExe, ['--headless', '--path', projectDir, '--script', headlessScript], {
    cwd: forgeRoot,
    timeoutMs: 90000,
  });
  const replayCombined = replayRes.stdout + '\n' + replayRes.stderr;
  const replayOk = replayRes.exitCode === 0 && /PLAYFORGE_SHOWCASE_HEADLESS_OK/.test(replayCombined) && !/SCRIPT ERROR:|Parse Error|^ERROR:/m.test(replayCombined);

  return {
    skipped: false,
    ok: !importError && replayOk,
    prepareMs,
    importMs: importRes.durationMs,
    importPeakRssMb: importRes.peakRssMb,
    replayMs: replayRes.durationMs,
    replayPeakRssMb: replayRes.peakRssMb,
    peakRssMb: round(Math.max(importRes.peakRssMb || 0, replayRes.peakRssMb || 0) || null),
    errors: [
      ...(importError ? [`Godot import failed (code=${importRes.exitCode})`] : []),
      ...(!replayOk ? [`Godot headless showcase failed (code=${replayRes.exitCode})`] : []),
    ],
  };
}

function resolveVendorDir(vendorFallback) {
  const localVendor = path.join(forgeRoot, 'OfficialGodot', 'vendor');
  if (fs.existsSync(path.join(localVendor, 'godot.editor.wasm'))) {
    return { dir: localVendor, usingFallback: false };
  }
  if (vendorFallback && fs.existsSync(path.join(vendorFallback, 'godot.editor.wasm'))) {
    return { dir: vendorFallback, usingFallback: true };
  }
  return { dir: null, usingFallback: false };
}

async function profileWebShowcase(templateMeta, baseUrl, playwright, vendorInfo) {
  const templateId = templateMeta.id;
  const templateName = templateMeta.name || templateMeta.title || templateId;
  if (!vendorInfo.dir) {
    return { skipped: true, ok: false, errors: ['Missing OfficialGodot/vendor/godot.editor.wasm'] };
  }

  const { chromium } = playwright;
  const browser = await chromium.launch({
    headless: true,
    channel: 'chrome',
    args: ['--enable-unsafe-swiftshader', '--enable-precise-memory-info'],
  });

  const errors = [];
  const apiTimings = [];
  let wasmTransferMs = null;
  let wasmTransferBytes = 0;
  let serverPeakRssMb = process.memoryUsage().rss / (1024 * 1024);

  const serverRssTimer = setInterval(() => {
    const rssMb = process.memoryUsage().rss / (1024 * 1024);
    if (rssMb > serverPeakRssMb) serverPeakRssMb = rssMb;
  }, 250);

  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');

    // Forge server.cjs now resolves OfficialGodot/vendor via shared SSOT resolver natively — no 96MB CDP route needed!
    const reqStartMap = new Map();
    page.on('request', req => {
      reqStartMap.set(req, performance.now());
    });
    page.on('response', async res => {
      const req = res.request();
      const start = reqStartMap.get(req);
      const pathname = new URL(res.url()).pathname;
      if (start !== undefined && pathname.startsWith('/api/')) {
        apiTimings.push({ pathname, status: res.status(), ms: performance.now() - start });
      }
      if (pathname.endsWith('/godot.editor.wasm')) {
        wasmTransferMs = start !== undefined ? performance.now() - start : null;
        const len = Number(res.headers()['content-length'] || 0);
        if (len > 0) wasmTransferBytes = len;
      }
    });
    page.on('pageerror', err => errors.push(`pageerror: ${err.message}`));
    page.on('crash', () => errors.push('Renderer page crashed'));
    page.on('console', msg => {
      const txt = msg.text();
      if (/SCRIPT ERROR:|Parse Error|Invalid call|Invalid access|Failed to save IDB file system/.test(txt)) {
        errors.push(`console(${msg.type()}): ${txt}`);
      }
    });

    await page.addInitScript(() => {
      window.prompt = () => 'Daily Showcase Profile';
    });

    // Seed an initial blank library entry so launcher opens gallery cleanly
    await timedFetchJson(`${baseUrl}/api/platform/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Daily Profile Seed', template: 'blank3d' }),
    });

    // 1. Launcher load time
    const tLauncher0 = performance.now();
    await page.goto(`${baseUrl}/OfficialGodot/`, { waitUntil: 'domcontentloaded' });
    const escapedName = templateName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const templateBtn = page.locator('#templates .card', { has: page.locator('strong', { hasText: new RegExp(`^${escapedName}$`) }) }).first();
    await templateBtn.waitFor({ state: 'visible', timeout: 20000 });
    const launcherLoadMs = round(performance.now() - tLauncher0);

    // 2. Click template & "만드는 과정 보기"
    await templateBtn.click();
    const watchBtn = page.getByRole('button', { name: '만드는 과정 보기' });
    await watchBtn.waitFor({ state: 'visible', timeout: 10000 });

    const tClick0 = performance.now();
    await watchBtn.click();
    await page.waitForFunction(() => new URL(location.href).searchParams.get('project'), undefined, { timeout: 20000 });
    const projectId = new URL(page.url()).searchParams.get('project');

    const editor = page.frames().find(frame => {
      try {
        const u = new URL(frame.url());
        return u.pathname.endsWith('/editor.html') && u.searchParams.get('project') === projectId;
      } catch {
        return false;
      }
    }) || await page.waitForEvent('framenavigated', {
      predicate: frame => {
        try {
          return frame !== page.mainFrame() && new URL(frame.url()).searchParams.get('project') === projectId;
        } catch {
          return false;
        }
      },
      timeout: 30000,
    });
    const editorIframeMs = round(performance.now() - tClick0);

    // 3. Wait for real Godot 4.7.2 WASM boot + showcase ready
    await editor.waitForFunction(() => window.__playforgeShowcaseState?.ready === true, undefined, { timeout: 120000 });
    const wasmBootReadyMs = round(performance.now() - tClick0);

    // Start rAF profiler in main page and memory sampler via CDP
    await page.evaluate(() => {
      window.__pfFrameDeltas = [];
      window.__pfRafActive = true;
      let prev = performance.now();
      function tick(now) {
        if (!window.__pfRafActive) return;
        const dt = now - prev;
        prev = now;
        if (dt > 0 && dt < 5000) window.__pfFrameDeltas.push(dt);
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });

    let jsHeapPeakMb = 0;
    let jsHeapTotalPeakMb = 0;
    let domNodesPeak = 0;
    let wasmHeapPeakMb = 0;

    async function sampleMemory() {
      try {
        const { metrics } = await cdp.send('Performance.getMetrics');
        const map = Object.fromEntries(metrics.map(m => [m.name, m.value]));
        const usedMb = (map.JSHeapUsedSize || 0) / (1024 * 1024);
        const totalMb = (map.JSHeapTotalSize || 0) / (1024 * 1024);
        const nodes = map.Nodes || 0;
        if (usedMb > jsHeapPeakMb) jsHeapPeakMb = usedMb;
        if (totalMb > jsHeapTotalPeakMb) jsHeapTotalPeakMb = totalMb;
        if (nodes > domNodesPeak) domNodesPeak = nodes;
      } catch {}
      try {
        const iframeMem = await editor.evaluate(() => {
          const jsUsed = performance.memory?.usedJSHeapSize ? performance.memory.usedJSHeapSize / (1024 * 1024) : 0;
          const wasmBytes = window.Module?.HEAPU8?.byteLength || 0;
          return { jsUsed, wasmMb: wasmBytes / (1024 * 1024) };
        });
        if (iframeMem.jsUsed > jsHeapPeakMb) jsHeapPeakMb = iframeMem.jsUsed;
        if (iframeMem.wasmMb > wasmHeapPeakMb) wasmHeapPeakMb = iframeMem.wasmMb;
      } catch {}
    }

    await sampleMemory();
    const memInterval = setInterval(sampleMemory, 500);

    // 4. Wait for first cue playing
    const tFirstCue0 = performance.now();
    await editor.waitForFunction(() => {
      const s = window.__playforgeShowcaseState;
      return s?.ready && s.playing && s.time > 0;
    }, undefined, { timeout: 60000 });
    const firstCueMs = round(performance.now() - tFirstCue0);

    // 5. Verify 4 simultaneous role cursors appear during playback
    let rolesVerified = false;
    try {
      await page.waitForFunction(() => {
        const iframe = document.getElementById('editor');
        const s = iframe?.contentWindow?.__playforgeShowcaseState;
        return s?.roles?.length === 4 && document.querySelectorAll('.peer-cursor.showcase-cursor[data-showcase-role]').length >= 4;
      }, undefined, { timeout: 25000 });
      rolesVerified = true;
    } catch {
      errors.push('4 showcase role cursors did not appear during replay');
    }

    // 6. Wait for replay completion
    const tReplay0 = performance.now();
    await editor.waitForFunction(() => {
      const s = window.__playforgeShowcaseState;
      return s?.ready && !s.playing && s.duration > 0 && Math.abs(s.time - s.duration) < 0.01;
    }, undefined, { timeout: 120000 });
    const replayWallMs = round(performance.now() - tReplay0);

    clearInterval(memInterval);
    await sampleMemory();

    // Collect final frame timings & end memory
    const frameDeltas = await page.evaluate(() => {
      window.__pfRafActive = false;
      return window.__pfFrameDeltas || [];
    });
    const endMetricsRes = await cdp.send('Performance.getMetrics').catch(() => ({ metrics: [] }));
    const endMap = Object.fromEntries((endMetricsRes.metrics || []).map(m => [m.name, m.value]));
    const jsHeapEndMb = round((endMap.JSHeapUsedSize || 0) / (1024 * 1024));

    const showcaseEndState = await editor.evaluate(() => {
      const s = window.__playforgeShowcaseState || {};
      return {
        duration: s.duration || 0,
        time: s.time || 0,
        finished: Boolean(s.replay?.finished),
        nodeCount: Array.isArray(s.replay?.nodes) ? s.replay.nodes.length : 0,
        isolated: Boolean(window.crossOriginIsolated),
      };
    });

    // 7. Verify project revision stayed untouched (no stray writes during playback)
    const afterProj = await timedFetchJson(`${baseUrl}/api/platform/projects/${projectId}`);
    const revisionUnchanged = afterProj.status === 200 && afterProj.data?.revision === 1;
    if (!revisionUnchanged) {
      errors.push(`Unexpected revision mutation during replay: revision=${afterProj.data?.revision}`);
    }

    const frameP50Ms = round(percentile(frameDeltas, 50), 2);
    const frameP95Ms = round(percentile(frameDeltas, 95), 2);
    const frameMaxMs = round(percentile(frameDeltas, 100), 2);
    const frameMeanMs = mean(frameDeltas);
    const fpsAvg = frameMeanMs ? round(1000 / frameMeanMs, 1) : null;
    const fpsP10 = frameP95Ms ? round(1000 / frameP95Ms, 1) : null;
    const longFramesOver50ms = frameDeltas.filter(dt => dt > 50).length;

    const apiMsList = apiTimings.map(x => x.ms);
    const apiP50Ms = round(percentile(apiMsList, 50), 1);
    const apiP95Ms = round(percentile(apiMsList, 95), 1);
    const apiMaxMs = round(percentile(apiMsList, 100), 1);

    const ok = errors.length === 0 && rolesVerified && revisionUnchanged && showcaseEndState.finished;

    return {
      skipped: false,
      ok,
      usingVendorFallback: vendorInfo.usingFallback,
      crossOriginIsolated: showcaseEndState.isolated,
      loading: {
        launcherLoadMs,
        editorIframeMs,
        wasmTransferMs: round(wasmTransferMs),
        wasmTransferMb: wasmTransferBytes > 0 ? round(wasmTransferBytes / (1024 * 1024), 2) : null,
        wasmBootReadyMs,
        firstCueMs,
        replayWallMs,
      },
      response: {
        apiCount: apiTimings.length,
        apiP50Ms,
        apiP95Ms,
        apiMaxMs,
      },
      performance: {
        samples: frameDeltas.length,
        fpsAvg,
        fpsP10,
        frameP50Ms,
        frameP95Ms,
        frameMaxMs,
        longFramesOver50ms,
      },
      memory: {
        jsHeapPeakMb: round(jsHeapPeakMb, 1),
        jsHeapTotalPeakMb: round(jsHeapTotalPeakMb, 1),
        jsHeapEndMb,
        wasmHeapPeakMb: round(wasmHeapPeakMb, 1),
        domNodesPeak,
        serverPeakRssMb: round(serverPeakRssMb, 1),
      },
      checks: {
        rolesVerified,
        revisionUnchanged,
        replayFinished: showcaseEndState.finished,
        reconstructedNodes: showcaseEndState.nodeCount,
        manifestDurationSec: showcaseEndState.duration,
      },
      errors,
    };
  } finally {
    clearInterval(serverRssTimer);
    await browser.close();
  }
}

function loadHistory(historyFile) {
  if (!fs.existsSync(historyFile)) return [];
  const lines = fs.readFileSync(historyFile, 'utf8').split(/\r?\n/).filter(Boolean);
  const items = [];
  for (const line of lines) {
    try { items.push(JSON.parse(line)); } catch {}
  }
  return items;
}

function computeDeltaPct(current, baseline) {
  if (typeof current !== 'number' || typeof baseline !== 'number' || baseline <= 0) return null;
  return round(((current - baseline) / baseline) * 100, 1);
}

function formatDelta(pct) {
  if (pct === null || pct === undefined) return '—';
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct}%`;
}

function evaluateTrend(currentRun, previousRuns) {
  // Baseline = rolling mean of up to last 7 PASS/WARN runs (excluding hard FAIL runs)
  const validPrev = previousRuns.filter(r => r.verdict !== 'FAIL').slice(-7);
  const templateTrends = {};
  const alerts = [];

  for (const t of currentRun.templates) {
    const id = t.id;
    const prevSamples = validPrev
      .map(r => (r.templates || []).find(item => item.id === id))
      .filter(Boolean);

    const baseWasmBoot = mean(prevSamples.map(s => s.web?.loading?.wasmBootReadyMs));
    const baseGodotImport = mean(prevSamples.map(s => s.headless?.importMs));
    const baseFrameP95 = mean(prevSamples.map(s => s.web?.performance?.frameP95Ms));
    const baseJsHeap = mean(prevSamples.map(s => s.web?.memory?.jsHeapPeakMb));
    const baseApiP95 = mean(prevSamples.map(s => s.web?.response?.apiP95Ms));

    const curWasmBoot = t.web?.loading?.wasmBootReadyMs ?? null;
    const curGodotImport = t.headless?.importMs ?? null;
    const curFrameP95 = t.web?.performance?.frameP95Ms ?? null;
    const curJsHeap = t.web?.memory?.jsHeapPeakMb ?? null;
    const curApiP95 = t.web?.response?.apiP95Ms ?? null;

    const deltas = {
      wasmBootPct: computeDeltaPct(curWasmBoot, baseWasmBoot),
      godotImportPct: computeDeltaPct(curGodotImport, baseGodotImport),
      frameP95Pct: computeDeltaPct(curFrameP95, baseFrameP95),
      jsHeapPct: computeDeltaPct(curJsHeap, baseJsHeap),
      apiP95Pct: computeDeltaPct(curApiP95, baseApiP95),
    };

    const templateAlerts = [];
    if (deltas.wasmBootPct !== null && deltas.wasmBootPct >= THRESHOLDS.wasmBootDeltaPct) {
      templateAlerts.push(`WASM 부팅 로딩 ${formatDelta(deltas.wasmBootPct)} 악화 (${curWasmBoot}ms vs 7일 평균 ${round(baseWasmBoot)}ms)`);
    }
    if (deltas.godotImportPct !== null && deltas.godotImportPct >= THRESHOLDS.godotImportDeltaPct) {
      templateAlerts.push(`Godot 임포트 ${formatDelta(deltas.godotImportPct)} 악화 (${curGodotImport}ms vs 7일 평균 ${round(baseGodotImport)}ms)`);
    }
    if (deltas.frameP95Pct !== null && deltas.frameP95Pct >= THRESHOLDS.frameP95DeltaPct) {
      templateAlerts.push(`프레임 P95 ${formatDelta(deltas.frameP95Pct)} 악화 (${curFrameP95}ms vs 7일 평균 ${round(baseFrameP95, 2)}ms)`);
    }
    if (deltas.jsHeapPct !== null && deltas.jsHeapPct >= THRESHOLDS.memoryDeltaPct) {
      templateAlerts.push(`JS Heap 피크 ${formatDelta(deltas.jsHeapPct)} 증가 (${curJsHeap}MB vs 7일 평균 ${round(baseJsHeap)}MB)`);
    }
    if (deltas.apiP95Pct !== null && deltas.apiP95Pct >= THRESHOLDS.apiP95DeltaPct) {
      templateAlerts.push(`API P95 응답 ${formatDelta(deltas.apiP95Pct)} 악화 (${curApiP95}ms vs 7일 평균 ${round(baseApiP95)}ms)`);
    }

    for (const msg of templateAlerts) alerts.push(`[${id}] ${msg}`);

    templateTrends[id] = {
      baselineRuns: prevSamples.length,
      baseline: {
        wasmBootReadyMs: round(baseWasmBoot),
        godotImportMs: round(baseGodotImport),
        frameP95Ms: round(baseFrameP95, 2),
        jsHeapPeakMb: round(baseJsHeap),
        apiP95Ms: round(baseApiP95),
      },
      deltas,
      alerts: templateAlerts,
    };
  }

  return { baselineCount: validPrev.length, templateTrends, alerts };
}

function buildDailyMarkdown(run, trend) {
  const lines = [];
  lines.push(`# PlayForge 템플릿 제작과정 보기 데일리 E2E · 프로파일 리포트 (${run.date})`);
  lines.push('');
  lines.push(`- **판정**: **${run.verdict}** | **실행 시각**: ${run.timestampKst} | **모드**: \`${run.mode}\``);
  lines.push(`- **Git**: \`${run.git.branch}\` @ \`${run.git.sha}\` — ${run.git.subject}`);
  lines.push(`- **전체 템플릿**: ${run.catalog.totalTemplates}종 (제작과정 보기 지원: **${run.catalog.showcaseTemplates.length}종** — ${run.catalog.showcaseTemplates.join(', ')})`);
  lines.push(`- **카탈로그 API 응답**: \`GET /api/platform/templates\` ${run.catalog.catalogApiMs} ms (${round(run.catalog.catalogBytes / 1024, 1)} KB)`);
  lines.push(`- **총 소요 시간**: ${round(run.totalDurationMs / 1000, 1)}초 | **트렌드 기준**: 최근 정상 ${trend.baselineCount}회 이동평균`);
  lines.push('');

  lines.push('## 1. 템플릿별 E2E · 성능 · 메모리 · 응답시간 · 로딩시간 요약');
  lines.push('');
  lines.push('| 템플릿 | 판정 | API 응답(P50/P95) | WASM 부팅 로딩 | 첫 큐 / 완주 | FPS(평균) / P95 프레임 | JS Heap / 서버 RSS | Godot 임포트 / 리플레이(피크 RSS) |');
  lines.push('|---|---|---:|---:|---:|---:|---:|---:|');

  for (const t of run.templates) {
    const status = t.ok ? 'PASS' : 'FAIL';
    const apiStr = t.web && !t.web.skipped
      ? `${t.web.response.apiP50Ms ?? '—'} / ${t.web.response.apiP95Ms ?? '—'} ms`
      : `${t.api.templateGetMs} ms`;
    const bootStr = t.web && !t.web.skipped
      ? `${t.web.loading.wasmBootReadyMs} ms (${formatDelta(trend.templateTrends[t.id]?.deltas.wasmBootPct)})`
      : '—';
    const replayStr = t.web && !t.web.skipped
      ? `${t.web.loading.firstCueMs} ms / ${round(t.web.loading.replayWallMs / 1000, 1)}s`
      : '—';
    const fpsStr = t.web && !t.web.skipped
      ? `${t.web.performance.fpsAvg ?? '—'} fps / ${t.web.performance.frameP95Ms ?? '—'} ms`
      : '—';
    const memStr = t.web && !t.web.skipped
      ? `${t.web.memory.jsHeapPeakMb ?? '—'} MB / ${t.web.memory.serverPeakRssMb ?? '—'} MB`
      : '—';
    const gdStr = t.headless && !t.headless.skipped
      ? `${t.headless.importMs} / ${t.headless.replayMs} ms (${t.headless.peakRssMb ?? '—'} MB)`
      : '—';
    lines.push(`| \`${t.id}\` (${t.cues} cues) | **${status}** | ${apiStr} | ${bootStr} | ${replayStr} | ${fpsStr} | ${memStr} | ${gdStr} |`);
  }
  lines.push('');

  lines.push('## 2. 회귀 경보 및 E2E 오류');
  lines.push('');
  const allErrors = run.templates.flatMap(t => [
    ...(t.headless?.errors || []).map(e => `[${t.id}/headless] ${e}`),
    ...(t.web?.errors || []).map(e => `[${t.id}/web] ${e}`),
  ]);
  if (allErrors.length === 0 && trend.alerts.length === 0) {
    lines.push('- 이상 없음 (E2E 전 항목 통과, 7일 기준 회귀 경보 0건)');
  } else {
    for (const err of allErrors) lines.push(`- **[FAIL]** ${err}`);
    for (const alert of trend.alerts) lines.push(`- **[WARN]** ${alert}`);
  }
  lines.push('');

  lines.push('## 3. 상세 로딩·API 타이밍 (ms)');
  lines.push('');
  lines.push('| 템플릿 | Prepare | Template API | Showcase API | Project Create | Launcher | Iframe | WASM 전송 | WASM 부팅 완료 | 재구성 노드 |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const t of run.templates) {
    lines.push(`| \`${t.id}\` | ${t.headless?.prepareMs ?? '—'} | ${t.api.templateGetMs} | ${t.api.showcaseAddonGetMs} | ${t.api.projectCreateMs} | ${t.web?.loading?.launcherLoadMs ?? '—'} | ${t.web?.loading?.editorIframeMs ?? '—'} | ${t.web?.loading?.wasmTransferMs ?? '—'} | ${t.web?.loading?.wasmBootReadyMs ?? '—'} | ${t.web?.checks?.reconstructedNodes ?? '—'} |`);
  }
  lines.push('');
  return lines.join('\n');
}

function buildTrendMarkdown(history) {
  const recent = history.slice(-14);
  const lines = [];
  lines.push('# PlayForge 템플릿 제작과정 보기 성능·로딩·메모리 트렌드 (최근 14회)');
  lines.push('');
  lines.push(`- 누적 기록: **${history.length}회** (최신: ${history[history.length - 1]?.timestampKst || '—'})`);
  lines.push('- 인터랙티브 차트 대시보드: `TREND_REPORT.html`');
  lines.push('');
  lines.push('| 날짜 | SHA | 판정 | 평균 WASM 부팅(ms) | 평균 P95 프레임(ms) | 평균 JS Heap 피크(MB) | 평균 API P95(ms) | 평균 Godot 임포트(ms) | 경보 |');
  lines.push('|---|---|---|---:|---:|---:|---:|---:|---:|');

  for (const r of recent) {
    const ts = r.templates || [];
    const avgBoot = round(mean(ts.map(t => t.web?.loading?.wasmBootReadyMs)));
    const avgF95 = round(mean(ts.map(t => t.web?.performance?.frameP95Ms)), 2);
    const avgHeap = round(mean(ts.map(t => t.web?.memory?.jsHeapPeakMb)));
    const avgApi95 = round(mean(ts.map(t => t.web?.response?.apiP95Ms)));
    const avgImp = round(mean(ts.map(t => t.headless?.importMs)));
    lines.push(`| ${r.date} | \`${r.git?.sha || '?'}\` | **${r.verdict}** | ${avgBoot ?? '—'} | ${avgF95 ?? '—'} | ${avgHeap ?? '—'} | ${avgApi95 ?? '—'} | ${avgImp ?? '—'} | ${(r.alerts || []).length} |`);
  }
  lines.push('');
  return lines.join('\n');
}

function svgChart(title, unit, seriesList, dates) {
  const W = 540;
  const H = 200;
  const pad = { top: 28, right: 20, bottom: 32, left: 52 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const colors = ['#60a5fa', '#34d399', '#f59e0b', '#f472b6', '#a78bfa'];

  const allVals = seriesList.flatMap(s => s.values).filter(v => typeof v === 'number' && Number.isFinite(v));
  const maxVal = allVals.length ? Math.max(...allVals) * 1.15 : 100;
  const minVal = 0;

  const xPos = idx => dates.length <= 1 ? pad.left + plotW / 2 : pad.left + (idx / (dates.length - 1)) * plotW;
  const yPos = val => pad.top + plotH - ((val - minVal) / (maxVal - minVal || 1)) * plotH;

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map(f => {
    const v = minVal + (maxVal - minVal) * f;
    const y = yPos(v).toFixed(1);
    return `<line x1="${pad.left}" y1="${y}" x2="${W - pad.right}" y2="${y}" stroke="#334155" stroke-dasharray="3,3"/><text x="${pad.left - 6}" y="${Number(y) + 4}" text-anchor="end" fill="#94a3b8" font-size="10">${round(v, 1)}</text>`;
  }).join('');

  const xLabels = dates.map((d, i) => {
    if (dates.length > 7 && i % Math.ceil(dates.length / 7) !== 0 && i !== dates.length - 1) return '';
    return `<text x="${xPos(i).toFixed(1)}" y="${H - 8}" text-anchor="middle" fill="#94a3b8" font-size="10">${d.slice(5)}</text>`;
  }).join('');

  const paths = seriesList.map((s, si) => {
    const color = colors[si % colors.length];
    const pts = s.values.map((v, i) => (typeof v === 'number' ? [xPos(i), yPos(v), v] : null)).filter(Boolean);
    const poly = pts.length > 1
      ? `<polyline fill="none" stroke="${color}" stroke-width="2" points="${pts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')}"/>`
      : '';
    const dots = pts.map(p => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.5" fill="${color}"><title>${s.name}: ${p[2]} ${unit}</title></circle>`).join('');
    return poly + dots;
  }).join('');

  const legend = seriesList.map((s, si) => `<span style="color:${colors[si % colors.length]};margin-right:10px;font-size:11px">● ${s.name}</span>`).join('');

  return `<div class="card"><div class="card-title">${title} (${unit})</div><div class="legend">${legend}</div><svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}">${gridLines}${xLabels}${paths}</svg></div>`;
}

function buildTrendHtml(history) {
  const recent = history.slice(-30);
  const dates = recent.map(r => r.date);
  const templateIds = [...new Set(recent.flatMap(r => (r.templates || []).map(t => t.id)))];
  const makeSeries = extractor => templateIds.map(id => ({
    name: id,
    values: recent.map(r => {
      const found = (r.templates || []).find(t => t.id === id);
      return found ? extractor(found) : null;
    }),
  }));

  const latest = history[history.length - 1];
  const rows = (latest?.templates || []).map(t => `<tr>
    <td><code>${t.id}</code></td>
    <td><span class="badge ${t.ok ? 'pass' : 'fail'}">${t.ok ? 'PASS' : 'FAIL'}</span></td>
    <td>${t.web?.loading?.wasmBootReadyMs ?? '—'} ms</td>
    <td>${t.web?.performance?.fpsAvg ?? '—'} fps / ${t.web?.performance?.frameP95Ms ?? '—'} ms</td>
    <td>${t.web?.memory?.jsHeapPeakMb ?? '—'} MB / ${t.web?.memory?.serverPeakRssMb ?? '—'} MB</td>
    <td>${t.web?.response?.apiP95Ms ?? '—'} ms</td>
    <td>${t.headless?.importMs ?? '—'} / ${t.headless?.replayMs ?? '—'} ms</td>
  </tr>`).join('');

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8"/>
<title>PlayForge Showcase Daily Trend Dashboard</title>
<style>
  body { background:#0f172a; color:#e2e8f0; font-family:system-ui,-apple-system,sans-serif; margin:0; padding:24px; }
  h1 { margin:0 0 6px; font-size:22px; }
  .meta { color:#94a3b8; font-size:13px; margin-bottom:20px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(460px,1fr)); gap:16px; margin-bottom:24px; }
  .card { background:#1e293b; border:1px solid #334155; border-radius:10px; padding:14px; }
  .card-title { font-weight:600; font-size:14px; margin-bottom:4px; }
  .legend { margin-bottom:6px; }
  table { width:100%; border-collapse:collapse; background:#1e293b; border-radius:10px; overflow:hidden; font-size:13px; }
  th, td { padding:10px 12px; border-bottom:1px solid #334155; text-align:left; }
  th { background:#0f172a; color:#94a3b8; }
  .badge { padding:2px 8px; border-radius:999px; font-weight:700; font-size:11px; }
  .pass { background:#064e3b; color:#6ee7b7; }
  .fail { background:#7f1d1d; color:#fca5a5; }
</style>
</head>
<body>
  <h1>PlayForge 템플릿 제작과정 보기 데일리 E2E · 성능 트렌드</h1>
  <div class="meta">최신 실행: ${latest?.timestampKst || '—'} · 판정: <strong>${latest?.verdict || '—'}</strong> · Git: <code>${latest?.git?.branch || '?'}@${latest?.git?.sha || '?'}</code> · 누적 ${history.length}회</div>
  <div class="grid">
    ${svgChart('WASM 부팅 로딩 시간', 'ms', makeSeries(t => t.web?.loading?.wasmBootReadyMs ?? null), dates)}
    ${svgChart('리플레이 프레임 타임 P95', 'ms', makeSeries(t => t.web?.performance?.frameP95Ms ?? null), dates)}
    ${svgChart('브라우저 JS Heap 피크 메모리', 'MB', makeSeries(t => t.web?.memory?.jsHeapPeakMb ?? null), dates)}
    ${svgChart('Forge API 응답 시간 P95', 'ms', makeSeries(t => t.web?.response?.apiP95Ms ?? null), dates)}
    ${svgChart('Godot 4.7.2 Headless 임포트 시간', 'ms', makeSeries(t => t.headless?.importMs ?? null), dates)}
    ${svgChart('리플레이 평균 FPS', 'fps', makeSeries(t => t.web?.performance?.fpsAvg ?? null), dates)}
  </div>
  <table>
    <thead><tr><th>템플릿</th><th>판정</th><th>WASM 부팅</th><th>평균 FPS / P95</th><th>JS Heap / 서버 RSS</th><th>API P95</th><th>Godot 임포트 / 리플레이</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const kst = getKstDateParts();
  const git = getGitMeta();
  const tTotal0 = performance.now();

  const allTemplates = loadGameTemplates(forgeRoot);
  const allIds = Object.keys(allTemplates).sort();
  const showcaseIds = allIds.filter(id => Boolean(allTemplates[id].showcase));
  const selectedIds = opts.templates === 'all'
    ? showcaseIds
    : opts.templates.split(',').map(s => s.trim()).filter(id => showcaseIds.includes(id));

  if (selectedIds.length === 0) {
    throw new Error(`No showcase templates matched (--templates=${opts.templates}). Available: ${showcaseIds.join(', ')}`);
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'playforge-daily-profile-'));
  let serverObj = null;
  let playwright = null;
  const vendorInfo = resolveVendorDir(opts.vendorFallback);

  try {
    if (opts.mode !== 'headless') {
      playwright = resolvePlaywright(opts.playwrightRoot);
    }
    serverObj = await startEphemeralForgeServer(tempRoot);
    const { baseUrl } = serverObj;

    // Catalog API response check (all 15 templates)
    const catalogRes = await timedFetchJson(`${baseUrl}/api/platform/templates`);
    assert.equal(catalogRes.status, 200, 'Catalog API must return 200');

    const templateResults = [];
    for (const id of selectedIds) {
      const meta = allTemplates[id];
      const manifest = JSON.parse(meta.showcase);
      if (!opts.quiet) console.error(`[profile] ${id} (${manifest.cues.length} cues)...`);

      // Layer 1: Direct API timing
      const tplRes = await timedFetchJson(`${baseUrl}/api/platform/templates/${id}`);
      const addonRes = await timedFetchJson(`${baseUrl}/api/platform-addon/showcase/${id}`);
      const createRes = await timedFetchJson(`${baseUrl}/api/platform/projects`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: `Profile ${id}`, template: id, mode: 'showcase' }),
      });

      const api = {
        ok: tplRes.status === 200 && addonRes.status === 200 && createRes.status === 201,
        templateGetMs: tplRes.ms,
        showcaseAddonGetMs: addonRes.ms,
        projectCreateMs: createRes.ms,
      };

      // Layer 2: Native Godot Headless
      const headless = (opts.mode === 'full' || opts.mode === 'headless')
        ? await profileHeadlessGodot(id, opts.godot, tempRoot)
        : { skipped: true, ok: true };

      // Layer 3: Real Web Chrome WASM E2E
      const web = (opts.mode === 'full' || opts.mode === 'web')
        ? await profileWebShowcase(meta, baseUrl, playwright, vendorInfo)
        : { skipped: true, ok: true };

      templateResults.push({
        id,
        name: meta.name || meta.title || id,
        dimension: meta.dimension,
        cues: manifest.cues.length,
        durationSec: manifest.duration,
        ok: api.ok && headless.ok && web.ok,
        api,
        headless,
        web,
      });
    }

    const totalDurationMs = round(performance.now() - tTotal0);
    const runRecord = {
      schemaVersion: 1,
      runId: kst.runId,
      date: kst.date,
      timestampKst: kst.isoKst,
      mode: opts.mode,
      git,
      catalog: {
        totalTemplates: allIds.length,
        allTemplates: allIds,
        showcaseTemplates: showcaseIds,
        catalogApiMs: catalogRes.ms,
        catalogBytes: catalogRes.bytes,
      },
      totalDurationMs,
      templates: templateResults,
      verdict: 'PASS',
      alerts: [],
    };

    const historyFile = path.join(opts.out, 'history.jsonl');
    const prevHistory = loadHistory(historyFile);
    const trend = evaluateTrend(runRecord, prevHistory);

    const anyFail = templateResults.some(t => !t.ok);
    runRecord.alerts = trend.alerts;
    runRecord.verdict = anyFail ? 'FAIL' : (trend.alerts.length > 0 ? 'WARN' : 'PASS');

    // Persist artifacts
    const runDir = path.join(opts.out, 'runs', kst.date);
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(path.join(runDir, 'report.json'), JSON.stringify({ run: runRecord, trend }, null, 2) + '\n', 'utf8');

    const dailyMd = buildDailyMarkdown(runRecord, trend);
    fs.writeFileSync(path.join(runDir, 'DAILY_REPORT.md'), dailyMd, 'utf8');
    fs.writeFileSync(path.join(opts.out, 'LATEST_REPORT.md'), dailyMd, 'utf8');

    const nextHistory = [...prevHistory, runRecord];
    fs.appendFileSync(historyFile, JSON.stringify(runRecord) + '\n', 'utf8');
    fs.writeFileSync(path.join(opts.out, 'TREND_REPORT.md'), buildTrendMarkdown(nextHistory), 'utf8');
    fs.writeFileSync(path.join(opts.out, 'TREND_REPORT.html'), buildTrendHtml(nextHistory), 'utf8');

    process.stdout.write(dailyMd + '\n');
    if (runRecord.verdict === 'FAIL') process.exitCode = 1;
  } finally {
    if (serverObj?.server) {
      serverObj.server.closeAllConnections?.();
      await new Promise(resolve => serverObj.server.close(resolve));
    }
    if (!opts.keepTemp) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }
}

main().catch(err => {
  console.error(err?.stack || String(err));
  process.exitCode = 1;
});
