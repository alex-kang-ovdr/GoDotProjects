import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { resolveBrowserExecutable } from '../../suites/runtime-web/index.mjs';

export async function launchCdpBrowser({ executablePath = null, viewport = { width: 1280, height: 800, mobile: false } } = {}) {
  const exe = executablePath || resolveBrowserExecutable();
  if (!exe) {
    throw new Error('No local Chrome/Edge executable found for Hub Use-Case E2E testing.');
  }

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'gamerqa-hub-uc-'));
  let launchError = null;
  const chrome = spawn(
    exe,
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
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { windowsHide: true, stdio: 'ignore' }
  );
  chrome.on('error', (err) => { launchError = err; });

  const portFile = path.join(profile, 'DevToolsActivePort');
  let port = null;
  for (let i = 0; i < 120; i++) {
    if (launchError) throw launchError;
    if (chrome.exitCode !== null) throw new Error(`Chrome exited prematurely with code ${chrome.exitCode}`);
    if (fs.existsSync(portFile)) {
      const value = Number(fs.readFileSync(portFile, 'utf8').split('\n')[0]);
      if (Number.isInteger(value) && value > 0) { port = value; break; }
    }
    await delay(100);
  }
  if (!port) throw new Error('Chrome DevToolsActivePort timed out');

  async function openTab() {
    const tab = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT', signal: AbortSignal.timeout(10000) })).json();
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', () => reject(new Error('CDP WebSocket open error')), { once: true });
    });

    let seq = 0;
    const jobs = new Map();
    const state = {
      pageErrors: [],
      consoleErrors: [],
      httpFailures: [],
      apiTimings: [],
      pendingRequests: new Map(),
    };

    const send = (method, params = {}, timeoutMs = 20000) =>
      new Promise((resolve, reject) => {
        const id = ++seq;
        const timer = setTimeout(() => {
          jobs.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }, timeoutMs);
        jobs.set(id, { resolve, reject, timer });
        ws.send(JSON.stringify({ id, method, params }));
      });

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
        state.pageErrors.push(ex.exception?.description || ex.text || 'Uncaught exception');
      } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        const txt = msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(' ');
        state.consoleErrors.push(txt);
      } else if (msg.method === 'Network.requestWillBeSent') {
        state.pendingRequests.set(msg.params.requestId, {
          url: msg.params.request?.url || '',
          method: msg.params.request?.method || 'GET',
          startedAt: Date.now(),
        });
      } else if (msg.method === 'Network.responseReceived') {
        const reqInfo = state.pendingRequests.get(msg.params.requestId);
        const status = msg.params.response?.status || 0;
        const url = msg.params.response?.url || reqInfo?.url || '';
        const durationMs = reqInfo ? Date.now() - reqInfo.startedAt : null;
        if (url.includes('/api/')) {
          state.apiTimings.push({
            method: reqInfo?.method || 'GET',
            url,
            status,
            durationMs,
          });
        }
        if (status >= 400) {
          state.httpFailures.push({ status, url, method: reqInfo?.method || 'GET' });
        }
      } else if (msg.method === 'Network.loadingFinished' || msg.method === 'Network.loadingFailed') {
        state.pendingRequests.delete(msg.params.requestId);
      }
    });

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Network.enable');
    await send('Performance.enable').catch(() => {});
    await send('Emulation.setDeviceMetricsOverride', {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: Boolean(viewport.mobile),
    });

    const evalJs = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) {
        throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      }
      return r.result?.value;
    };

    const evalInChildFrame = async (urlSubstring, expression) => {
      // 1. Try same-process child frame via Page.getFrameTree
      try {
        const tree = await send('Page.getFrameTree');
        const queue = [...(tree?.frameTree?.childFrames || [])];
        while (queue.length) {
          const node = queue.shift();
          if (node?.frame?.url && (!urlSubstring || node.frame.url.includes(urlSubstring))) {
            const world = await send('Page.createIsolatedWorld', {
              frameId: node.frame.id,
              worldName: 'gamerqa-probe',
              grantUniveralAccess: false,
            });
            const r = await send('Runtime.evaluate', {
              contextId: world.executionContextId,
              expression,
              returnByValue: true,
              awaitPromise: true,
            });
            if (!r.exceptionDetails && r.result?.value !== undefined) {
              return { frameUrl: node.frame.url, value: r.result.value };
            }
          }
          if (Array.isArray(node?.childFrames)) queue.push(...node.childFrames);
        }
      } catch {}

      // 2. Fallback for out-of-process sandboxed iframes (OOPIF): inspect target list via /json/list
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(5000) })).json();
      const match = (targets || []).find((t) => t.type === 'iframe' && t.webSocketDebuggerUrl && (!urlSubstring || String(t.url || '').includes(urlSubstring)));
      if (!match) return null;
      const childWs = new WebSocket(match.webSocketDebuggerUrl);
      try {
        await new Promise((resolve, reject) => {
          childWs.addEventListener('open', resolve, { once: true });
          childWs.addEventListener('error', () => reject(new Error('Child iframe CDP WS error')), { once: true });
        });
        const evalRes = await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Child iframe eval timeout')), 8000);
          childWs.addEventListener('message', ({ data }) => {
            const msg = JSON.parse(data);
            if (msg.id === 1) {
              clearTimeout(timer);
              if (msg.error) reject(new Error(msg.error.message));
              else resolve(msg.result);
            }
          });
          childWs.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } }));
        });
        if (evalRes?.exceptionDetails) {
          throw new Error(evalRes.exceptionDetails.exception?.description || evalRes.exceptionDetails.text);
        }
        return { frameUrl: match.url, value: evalRes?.result?.value };
      } finally {
        try { childWs.close(); } catch {}
      }
    };

    const resetTelemetry = () => {
      state.pageErrors.length = 0;
      state.consoleErrors.length = 0;
      state.httpFailures.length = 0;
      state.apiTimings.length = 0;
    };

    const goto = async (url, waitMs = 15000) => {
      const t0 = Date.now();
      await send('Page.navigate', { url });
      const deadline = Date.now() + waitMs;
      while (Date.now() < deadline) {
        try {
          const rs = await evalJs('document.readyState');
          if (rs === 'complete') break;
        } catch {}
        await delay(80);
      }
      await delay(150);
      return Date.now() - t0;
    };

    const waitFor = async (expr, timeoutMs = 10000, intervalMs = 80) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        try {
          const v = await evalJs(expr);
          if (v) return v;
        } catch {}
        await delay(intervalMs);
      }
      throw new Error(`waitFor timed out (${timeoutMs}ms): ${expr}`);
    };

    const getPerfMetrics = async () => {
      const m = await send('Performance.getMetrics').catch(() => ({ metrics: [] }));
      const map = new Map((m.metrics || []).map((x) => [x.name, Number(x.value)]));
      return {
        jsHeapUsedMb: map.has('JSHeapUsedSize') ? Math.round((map.get('JSHeapUsedSize') / (1024 * 1024)) * 100) / 100 : null,
        domNodes: map.has('Nodes') ? map.get('Nodes') : null,
        jsEventListeners: map.has('JSEventListeners') ? map.get('JSEventListeners') : null,
      };
    };

    const setViewport = async (width, height, mobile = false) => {
      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile,
      });
      await delay(150);
    };

    const capturePng = async (filePath) => {
      const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
      const buf = Buffer.from(shot.data, 'base64');
      if (filePath) {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, buf);
      }
      return buf;
    };

    const closeTab = () => {
      try { ws.close(); } catch {}
    };

    return {
      send,
      evalJs,
      evalInChildFrame,
      goto,
      waitFor,
      setViewport,
      getPerfMetrics,
      capturePng,
      resetTelemetry,
      telemetry: () => ({
        pageErrors: [...state.pageErrors],
        consoleErrors: [...state.consoleErrors],
        httpFailures: [...state.httpFailures],
        apiTimings: [...state.apiTimings],
      }),
      close: closeTab,
    };
  }

  return {
    executablePath: exe,
    openTab,
    async close() {
      if (chrome.exitCode === null && chrome.pid) {
        const exited = new Promise((resolve) => chrome.once('exit', resolve));
        chrome.kill();
        await Promise.race([exited, delay(3000)]);
      }
      fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
    },
  };
}
