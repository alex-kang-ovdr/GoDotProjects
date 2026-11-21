import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import {
  MIME_TYPES,
  guardRelativePath,
  parseHtmlDocument,
  sha256Buffer,
} from '../../core/fs-utils.mjs';
import { GAMERQA_ROOT } from '../../core/paths.mjs';
import {
  assemblePerformanceProfile,
  buildBrowserPerfProbeExpression,
  normalizeCdpMetrics,
} from '../../core/perf-profiler.mjs';

function ruleSeverity(policy, ruleId, fallback) {
  return policy?.rules?.find((r) => r.id === ruleId)?.severity || fallback;
}

function makeCheck(policy, ruleId, status, title, message, details = [], evidence = null, fallbackSeverity = 'block') {
  const item = {
    id: ruleId,
    ruleId,
    suite: 'runtime-web',
    tier: 1,
    severity: ruleSeverity(policy, ruleId, fallbackSeverity),
    status,
    title,
    message,
  };
  if (details && details.length) item.details = details.slice(0, 30);
  if (evidence !== null && evidence !== undefined) item.evidence = evidence;
  return item;
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

export function isAllowlistedUrl(candidateUrl, allowlist = [], allowedGameOrigin = null) {
  if (!candidateUrl || candidateUrl.startsWith('data:') || candidateUrl.startsWith('blob:') || candidateUrl.startsWith('about:')) {
    return true;
  }
  let parsed;
  try {
    parsed = new URL(candidateUrl);
  } catch {
    return false;
  }
  const proto = parsed.protocol.toLowerCase();
  if (!['http:', 'https:', 'ws:', 'wss:'].includes(proto)) {
    return false;
  }
  // Loopback is allowed ONLY for the exact static game server origin (scheme + host + port) over HTTP(S).
  if (allowedGameOrigin) {
    try {
      const gameOrigin = new URL(allowedGameOrigin);
      if ((proto === 'http:' || proto === 'https:') && parsed.origin === gameOrigin.origin && proto === gameOrigin.protocol.toLowerCase()) {
        return true;
      }
    } catch {
      // ignore invalid allowedGameOrigin
    }
  }
  return allowlist.some((entry) => {
    try {
      const allowed = new URL(entry);
      return parsed.origin === allowed.origin && proto === allowed.protocol.toLowerCase();
    } catch {
      const host = parsed.hostname.toLowerCase();
      if (LOOPBACK_HOSTS.has(host)) return false;
      return host === String(entry).trim().toLowerCase();
    }
  });
}

export function buildHostResolverRules(allowlist = [], allowedGameOrigin = null) {
  const excludes = new Set();
  let gameHost = '127.0.0.1';
  if (allowedGameOrigin) {
    try {
      gameHost = new URL(allowedGameOrigin).hostname || '127.0.0.1';
    } catch {
      gameHost = '127.0.0.1';
    }
  }
  excludes.add(gameHost);
  for (const item of allowlist) {
    let host = '';
    try {
      host = new URL(item).hostname;
    } catch {
      host = String(item || '').trim();
    }
    if (host && !/[\s,;~*]/.test(host)) {
      excludes.add(host);
    }
  }
  return `MAP * ~NOTFOUND, ${[...excludes].map((h) => `EXCLUDE ${h}`).join(', ')}`;
}

export function resolvePlaywrightModule({ projectRoot, playwrightPath } = {}) {
  const candidates = [];
  if (playwrightPath) candidates.push(playwrightPath);
  if (process.env.GAMERQA_PLAYWRIGHT_PATH) candidates.push(process.env.GAMERQA_PLAYWRIGHT_PATH);
  if (process.env.PLAYWRIGHT_PATH) candidates.push(process.env.PLAYWRIGHT_PATH);

  const searchBases = [
    GAMERQA_ROOT,
    projectRoot ? path.join(projectRoot, 'hub') : null,
    projectRoot ? path.join(projectRoot, 'hub', 'qa') : null,
    projectRoot,
  ].filter(Boolean);

  if (process.env.NODE_PATH) {
    for (const dir of process.env.NODE_PATH.split(path.delimiter).filter(Boolean)) {
      searchBases.push(path.dirname(dir), dir);
    }
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  const moduleNames = ['playwright', '@playwright/test', 'playwright-core'];
  for (const base of searchBases) {
    let req;
    try {
      req = createRequire(path.join(base, 'package.json'));
    } catch {
      continue;
    }
    for (const mod of moduleNames) {
      try {
        return req.resolve(mod);
      } catch {
        // continue searching
      }
    }
  }
  return null;
}

export function resolveBrowserExecutable() {
  const envCandidates = [
    process.env.GAMERQA_CHROME,
    process.env.PLAYHUB_CHROME,
    process.env.CHROME_PATH,
  ].filter(Boolean);

  const platformCandidates = process.platform === 'win32'
    ? [
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
        'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
      ]
    : process.platform === 'darwin'
      ? [
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
        ]
      : [
          '/usr/bin/google-chrome',
          '/usr/bin/chromium',
          '/usr/bin/chromium-browser',
        ];

  for (const candidate of [...envCandidates, ...platformCandidates]) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export function createStaticGameServer(webDir) {
  const server = http.createServer((req, res) => {
    if (!['GET', 'HEAD'].includes(req.method || '')) {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Method Not Allowed');
      return;
    }
    try {
      let rel = decodeURIComponent((req.url || '/').split('?')[0]);
      if (rel === '/') rel = '/index.html';
      if (!rel.startsWith('/')) {
        res.writeHead(404); res.end('Not Found'); return;
      }
      rel = rel.slice(1);
      const ext = path.extname(rel).toLowerCase();
      const fullPath = guardRelativePath(webDir, rel);
      const stat = fs.statSync(fullPath);
      if (!stat.isFile()) {
        res.writeHead(404); res.end('Not Found'); return;
      }
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'Content-Length': stat.size,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Cross-Origin-Resource-Policy': 'same-origin',
      });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      fs.createReadStream(fullPath).on('error', () => res.destroy()).pipe(res);
    } catch {
      if (!res.headersSent) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
      } else {
        res.destroy();
      }
    }
  });

  return {
    server,
    async listen() {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
          server.removeListener('error', reject);
          resolve();
        });
      });
      const addr = server.address();
      return { port: addr.port, baseUrl: `http://127.0.0.1:${addr.port}` };
    },
    async close() {
      server.closeAllConnections();
      if (!server.listening) return;
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

function collectRuntimeAssetsFromHtml(htmlText, htmlRelPosix, manifest, webDir) {
  const parsed = parseHtmlDocument(htmlText);
  const assets = new Set();
  let declaredIcon = false;
  let refreshTarget = null;

  for (const { tag, attrs } of parsed.tags) {
    if (tag === 'link') {
      const rels = String(attrs.rel || '').toLowerCase().split(/\s+/).filter(Boolean);
      if (rels.includes('icon') || rels.includes('shortcut') || rels.includes('apple-touch-icon')) {
        declaredIcon = true;
      }
      if (Object.hasOwn(attrs, 'href') && rels.some((r) => ['stylesheet', 'icon', 'shortcut', 'preload', 'modulepreload', 'manifest', 'apple-touch-icon'].includes(r))) {
        const href = String(attrs.href || '');
        if (!href.startsWith('data:') && !/^(?:https?:)?\/\//i.test(href)) {
          assets.add(href.split(/[?#]/, 1)[0]);
        }
      }
    }
    if (tag === 'meta' && String(attrs['http-equiv'] || '').toLowerCase() === 'refresh') {
      const m = /url\s*=\s*(['"]?)([^'"\s;]+)\1/i.exec(String(attrs.content || ''));
      if (m && !/^(?:[a-z]+:|\/\/)/i.test(m[2])) refreshTarget = m[2];
    }
    for (const attr of ['src', 'poster']) {
      if (Object.hasOwn(attrs, attr) && ['script', 'img', 'source', 'audio', 'video', 'track', 'input'].includes(tag)) {
        const val = String(attrs[attr] || '');
        if (val && !val.startsWith('data:') && !/^(?:https?:)?\/\//i.test(val)) {
          assets.add(val.split(/[?#]/, 1)[0]);
        }
      }
    }
  }

  // Extract Godot config fileSizes and worklets if present
  const godotMatch = /const\s+GODOT_CONFIG\s*=\s*(\{[\s\S]*?\});/.exec(htmlText);
  if (godotMatch) {
    try {
      const cfg = JSON.parse(godotMatch[1]);
      if (cfg.fileSizes && typeof cfg.fileSizes === 'object') {
        for (const name of Object.keys(cfg.fileSizes)) assets.add(name);
      }
      if (typeof cfg.executable === 'string') {
        for (const candidate of [`${cfg.executable}.js`, `${cfg.executable}.pck`, `${cfg.executable}.wasm`, `${cfg.executable}.audio.worklet.js`, `${cfg.executable}.audio.position.worklet.js`]) {
          if (fs.existsSync(path.join(webDir, candidate))) assets.add(candidate);
        }
      }
    } catch {
      // ignore non-JSON GODOT_CONFIG
    }
  }

  if (manifest?.media?.cover) assets.add(manifest.media.cover);
  for (const s of manifest?.media?.screenshots || []) assets.add(s);

  const normalized = [];
  const baseDir = path.posix.dirname(htmlRelPosix);
  for (const raw of assets) {
    const joined = baseDir === '.' ? raw : path.posix.join(baseDir, raw);
    normalized.push(joined.replace(/^\.\//, ''));
  }

  return { assets: [...new Set(normalized)].sort(), declaredIcon, refreshTarget };
}

async function runWithPlaywright({ playwrightModPath, executablePath, url, allowedGameOrigin, allowlist, declaredIcon, timeoutMs, screenshotPath, perfSampleMs = 900 }) {
  const pw = await import(pathToFileURL(playwrightModPath).href);
  const chromium = pw.chromium || pw.default?.chromium;
  if (!chromium) throw new Error('Playwright module does not export chromium');

  const gameOrigin = allowedGameOrigin || new URL(url).origin;
  const resolverRule = buildHostResolverRules(allowlist, gameOrigin);

  const launchOpts = {
    headless: true,
    args: [
      '--no-first-run',
      '--disable-background-networking',
      '--no-proxy-server',
      '--mute-audio',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      `--host-resolver-rules=${resolverRule}`,
    ],
  };
  if (executablePath) launchOpts.executablePath = executablePath;

  const browser = await chromium.launch(launchOpts);
  const pageErrors = [];
  const consoleErrors = [];
  const failedAssets = [];
  const externalRequests = [];
  const recordExternalRequest = (reqUrl) => {
    if (!externalRequests.includes(reqUrl)) externalRequests.push(reqUrl);
  };
  let implicitFavicon404 = false;

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      serviceWorkers: 'block',
    });
    const page = await context.newPage();

    const routeTarget = typeof context.route === 'function' ? context : page;
    await routeTarget.route('**/*', async (route) => {
      const reqUrl = route.request().url();
      if (!isAllowlistedUrl(reqUrl, allowlist, gameOrigin)) {
        recordExternalRequest(reqUrl);
        await route.abort();
        return;
      }
      await route.continue();
    });

    const wsRouteTarget = typeof context.routeWebSocket === 'function'
      ? context
      : typeof page.routeWebSocket === 'function'
        ? page
        : null;
    if (wsRouteTarget) {
      await wsRouteTarget.routeWebSocket(/.*/, (wsRoute) => {
        const wsUrl = wsRoute.url();
        if (!isAllowlistedUrl(wsUrl, allowlist, gameOrigin)) {
          recordExternalRequest(wsUrl);
          wsRoute.close({ code: 1008, reason: 'Blocked by GamerQA outbound isolation' });
          return;
        }
        wsRoute.connectToServer();
      });
    }

    page.on('websocket', (wsEvent) => {
      const wsUrl = typeof wsEvent?.url === 'function' ? wsEvent.url() : '';
      if (wsUrl && !isAllowlistedUrl(wsUrl, allowlist, gameOrigin)) {
        recordExternalRequest(wsUrl);
      }
    });

    page.on('pageerror', (err) => pageErrors.push(err?.message || String(err)));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (!declaredIcon && /404 \(Not Found\)/.test(text) && implicitFavicon404) return;
        consoleErrors.push(text);
      }
    });
    page.on('response', (res) => {
      if (res.status() >= 400) {
        const resUrl = res.url();
        if (!declaredIcon && resUrl.endsWith('/favicon.ico') && res.status() === 404) {
          implicitFavicon404 = true;
          return;
        }
        failedAssets.push(`${res.status()} ${resUrl}`);
      }
    });

    const bootStartMs = Date.now();
    await page.goto(url, { waitUntil: 'load', timeout: timeoutMs });
    await page.waitForTimeout(800);

    // Handle Godot splash/init status element if present
    const hasGodot = await page.evaluate(() => typeof globalThis.Engine === 'function' || Boolean(document.getElementById('status-progress')));
    let godotBootMs = null;
    if (hasGodot) {
      const godotStartMs = Date.now();
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const st = await page.evaluate(() => {
          const statusEl = document.getElementById('status');
          const noticeEl = document.getElementById('status-notice');
          const noticeVisible = noticeEl && getComputedStyle(noticeEl).display !== 'none' && noticeEl.innerText.trim().length > 0;
          return {
            done: !statusEl || getComputedStyle(statusEl).visibility === 'hidden',
            notice: noticeVisible ? noticeEl.innerText.trim() : null,
          };
        });
        if (st.notice) {
          pageErrors.push(`Godot failure notice: ${st.notice}`);
          break;
        }
        if (st.done) break;
        await page.waitForTimeout(250);
      }
      godotBootMs = Date.now() - godotStartMs;
      await page.waitForTimeout(500);
    }
    const totalBootMs = Date.now() - bootStartMs;

    let cdpSession = null;
    let cdpBefore = null;
    let cdpAfter = null;
    let perfProbe = null;
    if (typeof context.newCDPSession === 'function') {
      try {
        cdpSession = await context.newCDPSession(page);
        await cdpSession.send('Performance.enable');
        const mBefore = await cdpSession.send('Performance.getMetrics');
        cdpBefore = normalizeCdpMetrics(mBefore?.metrics);
      } catch {
        cdpSession = null;
      }
    }
    try {
      const probeCandidate = await page.evaluate(buildBrowserPerfProbeExpression(perfSampleMs));
      if (probeCandidate && typeof probeCandidate === 'object' && probeCandidate.loading && probeCandidate.responsiveness) {
        perfProbe = probeCandidate;
      }
    } catch {
      perfProbe = null;
    }
    if (cdpSession) {
      try {
        const mAfter = await cdpSession.send('Performance.getMetrics');
        cdpAfter = normalizeCdpMetrics(mAfter?.metrics);
      } catch {}
    }
    const performance = assemblePerformanceProfile({
      totalBootMs,
      godotBootMs,
      probe: perfProbe,
      cdpBefore,
      cdpAfter,
    });

    const domState = await page.evaluate(() => {
      const canvases = [...document.querySelectorAll('canvas')].map((c) => {
        const rect = c.getBoundingClientRect();
        return { width: c.width, height: c.height, rectW: Math.round(rect.width), rectH: Math.round(rect.height) };
      });
      return {
        href: location.href,
        title: document.title,
        readyState: document.readyState,
        canvases,
        bodyTextLength: (document.body?.innerText || '').trim().length,
        elementCount: document.body ? document.body.querySelectorAll('*').length : 0,
      };
    });

    let screenshotBytes = 0;
    let screenshotSha256 = null;
    const pngBuffer = await page.screenshot({ type: 'png' });
    screenshotBytes = pngBuffer.length;
    screenshotSha256 = sha256Buffer(pngBuffer);
    if (screenshotPath) {
      fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
      fs.writeFileSync(screenshotPath, pngBuffer);
    }

    return {
      driver: 'playwright',
      executablePath: executablePath || 'playwright-bundled',
      domState,
      pageErrors,
      consoleErrors: consoleErrors.filter((msg) => !(implicitFavicon404 && !declaredIcon && /^Failed to load resource: the server responded with a status of 404 \(Not Found\)$/.test(msg))),
      failedAssets,
      externalRequests,
      implicitFavicon404,
      screenshotBytes,
      screenshotSha256,
      performance,
    };
  } finally {
    await browser.close().catch(() => {});
  }
}

async function runWithChromeCdp({ executablePath, url, allowedGameOrigin, allowlist, declaredIcon, timeoutMs, screenshotPath, perfSampleMs = 900 }) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'gamerqa-cdp-'));
  const gameOrigin = allowedGameOrigin || new URL(url).origin;
  const resolverRule = buildHostResolverRules(allowlist, gameOrigin);
  let launchError = null;
  const chrome = spawn(
    executablePath,
    [
      '--headless=new',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-component-update',
      '--no-proxy-server',
      '--mute-audio',
      '--remote-debugging-address=127.0.0.1',
      '--remote-debugging-port=0',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      `--host-resolver-rules=${resolverRule}`,
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { windowsHide: true, stdio: 'ignore' }
  );
  chrome.on('error', (err) => { launchError = err; });

  let ws = null;
  const pageErrors = [];
  const consoleErrors = [];
  const rawBrowserLogErrors = [];
  const failedAssets = [];
  const externalRequests = [];
  const recordExternalRequest = (reqUrl) => {
    if (!externalRequests.includes(reqUrl)) externalRequests.push(reqUrl);
  };
  let implicitFavicon404 = false;

  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    let port = null;
    for (let i = 0; i < 100; i++) {
      if (launchError) throw launchError;
      if (chrome.exitCode !== null) throw new Error(`Chrome exited prematurely with code ${chrome.exitCode}`);
      if (fs.existsSync(portFile)) {
        const value = Number(fs.readFileSync(portFile, 'utf8').split('\n')[0]);
        if (Number.isInteger(value) && value > 0) { port = value; break; }
      }
      await delay(100);
    }
    if (!port) throw new Error('Chrome DevToolsActivePort timed out');

    const tab = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT', signal: AbortSignal.timeout(10000) })).json();
    ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', () => reject(new Error('DevTools WebSocket error')), { once: true });
    });

    let seq = 0;
    const jobs = new Map();
    ws.addEventListener('message', ({ data }) => {
      const msg = JSON.parse(data);
      if (msg.id && jobs.has(msg.id)) {
        const job = jobs.get(msg.id);
        jobs.delete(msg.id);
        clearTimeout(job.timer);
        if (msg.error) job.reject(new Error(msg.error.message));
        else job.resolve(msg.result);
        return;
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        const ex = msg.params.exceptionDetails;
        pageErrors.push(ex.exception?.description || ex.text || 'Uncaught exception');
      } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        const text = msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(' ');
        consoleErrors.push(text);
      } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
        rawBrowserLogErrors.push({ text: msg.params.entry.text, url: msg.params.entry.url || '' });
      } else if (msg.method === 'Network.requestWillBeSent') {
        const reqUrl = msg.params.request.url;
        if (!isAllowlistedUrl(reqUrl, allowlist, gameOrigin)) recordExternalRequest(reqUrl);
      } else if (msg.method === 'Network.webSocketCreated') {
        const wsUrl = msg.params.url;
        if (!isAllowlistedUrl(wsUrl, allowlist, gameOrigin)) recordExternalRequest(wsUrl);
      } else if (msg.method === 'Fetch.requestPaused') {
        const reqUrl = msg.params.request?.url || '';
        const requestId = msg.params.requestId;
        if (!isAllowlistedUrl(reqUrl, allowlist, gameOrigin)) {
          recordExternalRequest(reqUrl);
          send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }).catch(() => {});
        } else {
          send('Fetch.continueRequest', { requestId }).catch(() => {});
        }
      } else if (msg.method === 'Network.responseReceived') {
        const status = msg.params.response.status;
        const resUrl = msg.params.response.url;
        if (status >= 400) {
          if (!declaredIcon && status === 404 && resUrl.endsWith('/favicon.ico')) {
            implicitFavicon404 = true;
          } else {
            failedAssets.push(`${status} ${resUrl}`);
          }
        }
      }
    });

    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++seq;
      const timer = setTimeout(() => { jobs.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 20000);
      jobs.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result?.value;
    };

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Log.enable');
    await send('Network.enable');
    await send('Performance.enable').catch(() => {});
    await send('Network.setBypassServiceWorker', { bypass: true }).catch(() => {});
    await send('Fetch.enable', { patterns: [{ urlPattern: 'http://*' }, { urlPattern: 'https://*' }] }).catch(() => {});
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    const bootStartMs = Date.now();
    await send('Page.navigate', { url });

    // Wait for page load (and handle meta-refresh redirects cleanly)
    const loadDeadline = Date.now() + timeoutMs;
    let lastHref = '';
    let settledCount = 0;
    while (Date.now() < loadDeadline) {
      try {
        const st = await evaluate(`({ href: location.href, readyState: document.readyState, hasRefresh: Boolean(document.querySelector('meta[http-equiv="refresh" i]')) })`);
        if (st?.readyState === 'complete' && !st.hasRefresh) {
          if (st.href === lastHref) settledCount++;
          else { lastHref = st.href; settledCount = 0; }
          if (settledCount >= 3) break;
        }
      } catch {
        // page may be navigating during redirect
      }
      await delay(200);
    }

    // Check if Godot engine bootstrap is active
    let hasGodot = false;
    try {
      hasGodot = Boolean(await evaluate(`typeof globalThis.Engine === 'function' || Boolean(document.getElementById('status-progress'))`));
    } catch {
      hasGodot = false;
    }

    let godotBootMs = null;
    if (hasGodot) {
      const godotStartMs = Date.now();
      const godotDeadline = Date.now() + timeoutMs;
      while (Date.now() < godotDeadline) {
        const st = await evaluate(`(() => {
          const s = document.getElementById('status');
          const n = document.getElementById('status-notice');
          const noticeVisible = n && getComputedStyle(n).display !== 'none' && n.innerText.trim().length > 0;
          return { done: !s || getComputedStyle(s).visibility === 'hidden', notice: noticeVisible ? n.innerText.trim() : null };
        })()`);
        if (st.notice) {
          pageErrors.push(`Godot failure notice: ${st.notice}`);
          break;
        }
        if (st.done) break;
        await delay(250);
      }
      godotBootMs = Date.now() - godotStartMs;
      await delay(600);
    } else {
      await delay(800);
    }
    const totalBootMs = Date.now() - bootStartMs;

    let cdpBefore = null;
    let cdpAfter = null;
    let perfProbe = null;
    try {
      const mBefore = await send('Performance.getMetrics');
      cdpBefore = normalizeCdpMetrics(mBefore?.metrics);
    } catch {}
    try {
      const probeCandidate = await evaluate(buildBrowserPerfProbeExpression(perfSampleMs));
      if (probeCandidate && typeof probeCandidate === 'object' && probeCandidate.loading && probeCandidate.responsiveness) {
        perfProbe = probeCandidate;
      }
    } catch {
      perfProbe = null;
    }
    try {
      const mAfter = await send('Performance.getMetrics');
      cdpAfter = normalizeCdpMetrics(mAfter?.metrics);
    } catch {}
    const performance = assemblePerformanceProfile({
      totalBootMs,
      godotBootMs,
      probe: perfProbe,
      cdpBefore,
      cdpAfter,
    });

    const domState = await evaluate(`(() => {
      const canvases = [...document.querySelectorAll('canvas')].map(c => {
        const r = c.getBoundingClientRect();
        return { width: c.width, height: c.height, rectW: Math.round(r.width), rectH: Math.round(r.height) };
      });
      return {
        href: location.href,
        title: document.title,
        readyState: document.readyState,
        canvases,
        bodyTextLength: (document.body?.innerText || '').trim().length,
        elementCount: document.body ? document.body.querySelectorAll('*').length : 0
      };
    })()`);

    const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const pngBuffer = Buffer.from(shot.data, 'base64');
    if (screenshotPath) {
      fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
      fs.writeFileSync(screenshotPath, pngBuffer);
    }

    const filteredLogErrors = rawBrowserLogErrors
      .filter((item) => {
        if (!declaredIcon && implicitFavicon404 && item.url.endsWith('/favicon.ico')) return false;
        if (!declaredIcon && implicitFavicon404 && /Failed to load resource: the server responded with a status of 404 \(Not Found\)/.test(item.text)) return false;
        return true;
      })
      .map((item) => item.url ? `${item.text} (${item.url})` : item.text);

    return {
      driver: 'chrome-cdp',
      executablePath,
      domState,
      pageErrors,
      consoleErrors: [...consoleErrors, ...filteredLogErrors],
      failedAssets,
      externalRequests,
      implicitFavicon404,
      screenshotBytes: pngBuffer.length,
      screenshotSha256: sha256Buffer(pngBuffer),
      performance,
    };
  } finally {
    ws?.close();
    if (chrome.exitCode === null && chrome.pid) {
      const exited = new Promise((resolve) => chrome.once('exit', resolve));
      chrome.kill();
      await Promise.race([exited, delay(3000)]);
    }
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
  }
}

export async function runRuntimeWebSuite({
  projectRoot,
  gameId,
  policy,
  staticContext,
  screenshotDir,
  skipBrowser = false,
  playwrightPath,
  browserTimeoutMs = 20000,
  perfSampleMs = 900,
}) {
  const checks = [];
  const webDir = staticContext.webDir;
  const manifest = staticContext.manifest;
  const entryRel = typeof manifest?.entry === 'string' && manifest.entry ? manifest.entry : 'index.html';
  const allowlist = Array.isArray(manifest?.capabilities?.externalNetwork) ? manifest.capabilities.externalNetwork : [];

  if (!fs.existsSync(webDir) || !fs.existsSync(path.join(webDir, entryRel))) {
    checks.push(makeCheck(policy, 'RT-HTTP-BOOT', 'fail', 'Local static HTTP entry boot', `Missing Web/${entryRel} for runtime host`));
    checks.push(makeCheck(policy, 'RT-HTTP-ASSETS', 'skip', 'Local static HTTP asset responses', 'Skipped due to missing entry HTML'));
    checks.push(makeCheck(policy, 'RT-BROWSER-LOAD', 'skip', 'Headless browser load & render', 'Skipped due to missing entry HTML'));
    checks.push(makeCheck(policy, 'RT-BROWSER-CONSOLE', 'skip', 'Zero console errors & uncaught exceptions', 'Skipped due to missing entry HTML'));
    checks.push(makeCheck(policy, 'RT-BROWSER-NETWORK', 'skip', 'Outbound network isolation', 'Skipped due to missing entry HTML'));
    checks.push(makeCheck(policy, 'RT-BROWSER-SCREENSHOT', 'skip', 'Runtime screenshot capture', 'Skipped due to missing entry HTML', [], null, 'minor'));
    return { suite: 'runtime-web', tier: 1, checks, screenshots: [], browserInfo: null };
  }

  const staticHost = createStaticGameServer(webDir);
  let baseUrl = '';
  let declaredIcon = false;
  const screenshots = [];
  let browserInfo = null;
  let performance = null;

  try {
    const started = await staticHost.listen();
    baseUrl = started.baseUrl;

    // 1. RT-HTTP-BOOT
    const entryUrl = `${baseUrl}/${entryRel}`;
    const bootRes = await fetch(entryUrl, { signal: AbortSignal.timeout(10000) });
    const entryHtml = await bootRes.text();
    const contentType = bootRes.headers.get('content-type') || '';
    const bootIssues = [];
    if (bootRes.status !== 200) bootIssues.push(`Expected HTTP 200 for /${entryRel}, got ${bootRes.status}`);
    if (!contentType.includes('text/html')) bootIssues.push(`Expected text/html content-type, got ${contentType}`);
    if (!entryHtml.trim()) bootIssues.push(`Empty HTML body for /${entryRel}`);

    const parsedEntry = collectRuntimeAssetsFromHtml(entryHtml, entryRel, manifest, webDir);
    declaredIcon = parsedEntry.declaredIcon;
    const allAssets = new Set(parsedEntry.assets);

    // If local meta-refresh redirect exists (e.g. poly-bridge-2 -> play.html), verify redirect target too
    let redirectTarget = null;
    if (parsedEntry.refreshTarget) {
      redirectTarget = parsedEntry.refreshTarget;
      const redirRes = await fetch(`${baseUrl}/${redirectTarget}`, { signal: AbortSignal.timeout(10000) });
      const redirHtml = await redirRes.text();
      if (redirRes.status !== 200) {
        bootIssues.push(`Meta-refresh target /${redirectTarget} returned HTTP ${redirRes.status}`);
      } else {
        const parsedRedir = collectRuntimeAssetsFromHtml(redirHtml, redirectTarget, manifest, webDir);
        declaredIcon = declaredIcon || parsedRedir.declaredIcon;
        for (const a of parsedRedir.assets) allAssets.add(a);
      }
    }

    checks.push(
      makeCheck(
        policy,
        'RT-HTTP-BOOT',
        bootIssues.length ? 'fail' : 'pass',
        'Local static HTTP entry boot',
        bootIssues.length
          ? bootIssues[0]
          : `HTTP ${bootRes.status} on /${entryRel}${redirectTarget ? ` -> /${redirectTarget}` : ''} (${Buffer.byteLength(entryHtml, 'utf8')} bytes)`,
        bootIssues,
        { url: entryUrl, status: bootRes.status, redirectTarget }
      )
    );

    // 2. RT-HTTP-ASSETS
    const assetFailures = [];
    const checkedAssets = [];
    for (const relAsset of [...allAssets].sort()) {
      const assetUrl = `${baseUrl}/${relAsset}`;
      try {
        const res = await fetch(assetUrl, { method: 'HEAD', signal: AbortSignal.timeout(10000) });
        const len = Number(res.headers.get('content-length') || 0);
        checkedAssets.push({ path: relAsset, status: res.status, contentType: res.headers.get('content-type') || '', bytes: len });
        if (res.status !== 200) {
          assetFailures.push(`/${relAsset} returned HTTP ${res.status}`);
        } else if (len === 0) {
          assetFailures.push(`/${relAsset} has 0 content-length`);
        }
      } catch (err) {
        assetFailures.push(`/${relAsset} fetch failed: ${err.message}`);
      }
    }

    checks.push(
      makeCheck(
        policy,
        'RT-HTTP-ASSETS',
        assetFailures.length ? 'fail' : 'pass',
        'Local static HTTP asset responses',
        assetFailures.length
          ? assetFailures[0]
          : `${checkedAssets.length} local asset(s) returned HTTP 200`,
        assetFailures,
        { checkedCount: checkedAssets.length, assets: checkedAssets }
      )
    );

    // 3. Browser Runtime Check (Playwright if installed, else Chrome/Edge CDP)
    const shouldSkipBrowser = skipBrowser || process.env.GAMERQA_SKIP_BROWSER === '1';
    const pwModPath = shouldSkipBrowser ? null : resolvePlaywrightModule({ projectRoot, playwrightPath });
    const browserExe = shouldSkipBrowser ? null : resolveBrowserExecutable();

    if (shouldSkipBrowser || (!pwModPath && !browserExe)) {
      const reason = shouldSkipBrowser
        ? 'Browser check skipped by flag/environment (--skip-browser / GAMERQA_SKIP_BROWSER=1)'
        : 'Neither Playwright nor local Chrome/Edge binary found; browser check skipped';
      checks.push(makeCheck(policy, 'RT-BROWSER-LOAD', 'skip', 'Headless browser load & render', reason));
      checks.push(makeCheck(policy, 'RT-BROWSER-CONSOLE', 'skip', 'Zero console errors & uncaught exceptions', reason));
      checks.push(makeCheck(policy, 'RT-BROWSER-NETWORK', 'skip', 'Outbound network isolation', reason));
      checks.push(makeCheck(policy, 'RT-BROWSER-SCREENSHOT', 'skip', 'Runtime screenshot capture', reason, [], null, 'minor'));
      return { suite: 'runtime-web', tier: 1, checks, screenshots, browserInfo };
    }

    const screenshotFile = screenshotDir ? path.join(screenshotDir, `${gameId}.png`) : null;
    let runResult;
    if (pwModPath) {
      try {
        runResult = await runWithPlaywright({
          playwrightModPath: pwModPath,
          executablePath: browserExe,
          url: entryUrl,
          allowedGameOrigin: baseUrl,
          allowlist,
          declaredIcon,
          timeoutMs: browserTimeoutMs,
          screenshotPath: screenshotFile,
          perfSampleMs,
        });
      } catch (pwErr) {
        if (browserExe) {
          runResult = await runWithChromeCdp({
            executablePath: browserExe,
            url: entryUrl,
            allowedGameOrigin: baseUrl,
            allowlist,
            declaredIcon,
            timeoutMs: browserTimeoutMs,
            screenshotPath: screenshotFile,
            perfSampleMs,
          });
          runResult.fallbackNote = `Playwright fallback to Chrome CDP (${pwErr.message})`;
        } else {
          throw pwErr;
        }
      }
    } else {
      runResult = await runWithChromeCdp({
        executablePath: browserExe,
        url: entryUrl,
        allowedGameOrigin: baseUrl,
        allowlist,
        declaredIcon,
        timeoutMs: browserTimeoutMs,
        screenshotPath: screenshotFile,
        perfSampleMs,
      });
    }

    browserInfo = { driver: runResult.driver, executablePath: runResult.executablePath };
    performance = runResult.performance || null;

    const dom = runResult.domState || {};
    const hasCanvas = Array.isArray(dom.canvases) && dom.canvases.some((c) => c.width > 0 && c.height > 0);
    const hasUi = (dom.bodyTextLength || 0) > 0 || (dom.elementCount || 0) > 0;
    const loadIssues = [];
    if (dom.readyState !== 'complete') loadIssues.push(`Document readyState was '${dom.readyState}' instead of 'complete'`);
    if (!hasCanvas && !hasUi) loadIssues.push('Rendered DOM has neither non-zero canvas nor visible content');
    if (runResult.pageErrors.some((e) => e.startsWith('Godot failure notice:'))) {
      loadIssues.push(runResult.pageErrors.find((e) => e.startsWith('Godot failure notice:')));
    }

    checks.push(
      makeCheck(
        policy,
        'RT-BROWSER-LOAD',
        loadIssues.length ? 'fail' : 'pass',
        'Headless browser load & render',
        loadIssues.length
          ? loadIssues[0]
          : `Loaded via ${runResult.driver} (${dom.canvases?.length || 0} canvas(es), bodyText=${dom.bodyTextLength || 0} chars)`,
        loadIssues,
        { driver: runResult.driver, domState: dom }
      )
    );

    const allConsoleIssues = [
      ...runResult.pageErrors.map((e) => `Uncaught exception: ${e}`),
      ...runResult.consoleErrors.map((e) => `Console error: ${e}`),
      ...runResult.failedAssets.map((e) => `HTTP failure: ${e}`),
    ];
    checks.push(
      makeCheck(
        policy,
        'RT-BROWSER-CONSOLE',
        allConsoleIssues.length ? 'fail' : 'pass',
        'Zero console errors & uncaught exceptions',
        allConsoleIssues.length
          ? `${allConsoleIssues.length} runtime console/exception/asset error(s)`
          : `0 uncaught exceptions, 0 console errors${runResult.implicitFavicon404 ? ' (implicit /favicon.ico 404 excluded)' : ''}`,
        allConsoleIssues,
        {
          pageErrorCount: runResult.pageErrors.length,
          consoleErrorCount: runResult.consoleErrors.length,
          failedAssetCount: runResult.failedAssets.length,
          implicitFavicon404: runResult.implicitFavicon404,
        }
      )
    );

    checks.push(
      makeCheck(
        policy,
        'RT-BROWSER-NETWORK',
        runResult.externalRequests.length ? 'fail' : 'pass',
        'Outbound network isolation',
        runResult.externalRequests.length
          ? `${runResult.externalRequests.length} unallowlisted external request(s) attempted`
          : '0 unallowlisted outbound network requests observed',
        runResult.externalRequests
      )
    );

    const shotOk = runResult.screenshotBytes > 1024;
    if (screenshotFile && shotOk) {
      screenshots.push({
        name: `${gameId}.png`,
        relativePath: `screenshots/${gameId}.png`,
        bytes: runResult.screenshotBytes,
        sha256: runResult.screenshotSha256,
      });
    }
    checks.push(
      makeCheck(
        policy,
        'RT-BROWSER-SCREENSHOT',
        shotOk ? 'pass' : 'fail',
        'Runtime screenshot capture',
        shotOk
          ? `Captured PNG (${runResult.screenshotBytes} bytes)`
          : `Screenshot too small or missing (${runResult.screenshotBytes} bytes)`,
        [],
        shotOk ? { relativePath: screenshotFile ? `screenshots/${gameId}.png` : null, bytes: runResult.screenshotBytes, sha256: runResult.screenshotSha256 } : null,
        'minor'
      )
    );
  } catch (err) {
    checks.push(
      makeCheck(
        policy,
        'RT-BROWSER-LOAD',
        'error',
        'Headless browser load & render',
        `Runtime web suite error: ${err.message}`
      )
    );
  } finally {
    await staticHost.close();
  }

  return { suite: 'runtime-web', tier: 1, checks, screenshots, browserInfo, performance };
}
