import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { AVATAR_RENDER_PROFILE_V1 } from './catalog.mjs';

function findGodotStudioExecutable(forgeRoot, env = process.env) {
  const candidates = [
    env.PLAYHUB_DESKTOP_GODOT_BIN,
    env.GODOT_BIN,
    path.resolve(forgeRoot, '..', 'godot-engine', 'bin', 'godot.windows.editor.x86_64.console.exe'),
    path.resolve(forgeRoot, '..', '..', 'Forge-GodotEngine', 'bin', 'godot.windows.editor.x86_64.console.exe'),
    path.resolve(forgeRoot, '..', '..', 'GoDotProjects', 'Godot_v4.7.2-stable_win64_console.exe'),
    path.resolve(forgeRoot, '..', 'artifacts', 'local-runtime', 'godot', 'Godot_v4.7.2-stable_win64_console.exe'),
    'D:\\Github\\GoDotProjects\\Godot_v4.7.2-stable_win64_console.exe',
  ].filter(Boolean);

  for (const cand of candidates) {
    try {
      if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return cand;
    } catch {}
  }
  return null;
}

function allocateLoopbackPort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

function httpRequestLocal({ port, method, reqPath, token, bodyJson, timeoutMs = 12000 }) {
  return new Promise((resolve, reject) => {
    const bodyBuf = bodyJson !== undefined ? Buffer.from(JSON.stringify(bodyJson), 'utf8') : Buffer.alloc(0);
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: reqPath,
      method,
      headers: {
        'X-PlayHub-Worker-Token': token,
        ...(bodyBuf.length > 0 ? { 'Content-Type': 'application/json', 'Content-Length': String(bodyBuf.length) } : {}),
      },
      timeout: timeoutMs,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode || 0,
          headers: res.headers || {},
          body: Buffer.concat(chunks),
        });
      });
    });
    req.on('timeout', () => {
      req.destroy(new Error('Godot desktop preview worker timed out'));
    });
    req.on('error', reject);
    if (bodyBuf.length > 0) req.write(bodyBuf);
    req.end();
  });
}

export function createDesktopGodotPreviewService({ forgeRoot, env = process.env, idleTimeoutMs = 120000 }) {
  const projectDir = path.join(forgeRoot, 'Godot');
  const studioScene = 'res://addons/playforge_avatar/avatar_studio.tscn';
  let worker = null; // { proc, port, token, meta, idleTimer }
  let startPromise = null;
  let renderChain = Promise.resolve();
  let disposed = false;

  function resolveBinary() {
    const exe = findGodotStudioExecutable(forgeRoot, env);
    if (!exe) return null;
    if (!fs.existsSync(path.join(projectDir, 'project.godot'))) return null;
    if (!fs.existsSync(path.join(projectDir, 'addons', 'playforge_avatar', 'avatar_studio.gd'))) return null;
    return exe;
  }

  function clearIdleTimer() {
    if (worker?.idleTimer) {
      clearTimeout(worker.idleTimer);
      worker.idleTimer = null;
    }
  }

  function touchIdleTimer() {
    clearIdleTimer();
    if (!worker || idleTimeoutMs <= 0) return;
    worker.idleTimer = setTimeout(() => {
      void stopWorker();
    }, idleTimeoutMs);
    worker.idleTimer.unref?.();
  }

  async function stopWorker() {
    clearIdleTimer();
    const active = worker;
    worker = null;
    if (!active) return;
    try {
      await httpRequestLocal({ port: active.port, method: 'POST', reqPath: '/shutdown', token: active.token, timeoutMs: 1200 });
    } catch {}
    try {
      if (active.proc && active.proc.exitCode === null) active.proc.kill();
    } catch {}
  }

  async function ensureWorker() {
    if (disposed) throw new Error('Desktop Godot preview service disposed');
    if (worker && worker.proc && worker.proc.exitCode === null) {
      touchIdleTimer();
      return worker;
    }
    if (startPromise) return startPromise;

    startPromise = (async () => {
      const exe = resolveBinary();
      if (!exe) {
        throw Object.assign(new Error('Godot 4.7.2 데스크톱 런타임 바이너리를 찾을 수 없습니다.'), { status: 503, code: 'GODOT_RUNTIME_UNAVAILABLE' });
      }
      const port = await allocateLoopbackPort();
      const token = crypto.randomBytes(32).toString('hex');
      const args = [
        '--rendering-driver', 'opengl3',
        '--path', projectDir,
        studioScene,
        '--',
        `--avatar-studio-worker-port=${port}`,
        `--avatar-studio-worker-token=${token}`,
      ];
      const proc = spawn(exe, args, {
        cwd: projectDir,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let logs = '';
      const meta = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          try { proc.kill(); } catch {}
          reject(Object.assign(new Error(`Godot desktop preview worker startup timed out:\n${logs.slice(-1200)}`), { status: 504, code: 'GODOT_WORKER_TIMEOUT' }));
        }, 20000);

        const onData = (chunk) => {
          logs = (logs + chunk.toString('utf8')).slice(-4000);
          const m = /AVATAR_STUDIO_WORKER_READY=(\{[^\r\n]+\})/.exec(logs);
          if (m) {
            clearTimeout(timer);
            try {
              resolve(JSON.parse(m[1]));
            } catch {
              resolve({ port, renderer: 'godot-runtime' });
            }
          }
        };
        proc.stdout.on('data', onData);
        proc.stderr.on('data', onData);
        proc.once('error', (err) => {
          clearTimeout(timer);
          reject(err);
        });
        proc.once('exit', (code) => {
          clearTimeout(timer);
          if (!worker) {
            reject(Object.assign(new Error(`Godot desktop preview worker exited early (${code}):\n${logs.slice(-1200)}`), { status: 502, code: 'GODOT_WORKER_EXITED' }));
          }
        });
      });

      const record = { proc, port, token, meta, idleTimer: null };
      proc.once('exit', () => {
        if (worker === record) {
          clearIdleTimer();
          worker = null;
        }
      });
      worker = record;
      touchIdleTimer();
      return record;
    })().finally(() => {
      startPromise = null;
    });

    return startPromise;
  }

  function getStatus() {
    const exe = resolveBinary();
    return {
      available: Boolean(exe),
      renderer: 'godot-runtime',
      running: Boolean(worker && worker.proc && worker.proc.exitCode === null),
      pid: worker?.proc?.pid || null,
      engineVersion: worker?.meta?.engineVersion || '4.7.2',
      gpu: worker?.meta?.gpu || null,
      renderProfileId: AVATAR_RENDER_PROFILE_V1.profileId,
      renderProfile: AVATAR_RENDER_PROFILE_V1,
    };
  }

  function renderFrame(params = {}) {
    const task = renderChain.then(async () => {
      const w = await ensureWorker();
      touchIdleTimer();
      const resp = await httpRequestLocal({
        port: w.port,
        method: 'POST',
        reqPath: '/render',
        token: w.token,
        bodyJson: params,
        timeoutMs: 15000,
      });
      if (resp.statusCode !== 200) {
        throw Object.assign(new Error(`Godot preview render failed (${resp.statusCode})`), { status: 502, code: 'GODOT_RENDER_FAILED' });
      }
      return {
        png: resp.body,
        renderer: String(resp.headers['x-playhub-avatar-renderer'] || 'godot-runtime'),
        engineVersion: String(resp.headers['x-playhub-engine-version'] || w.meta?.engineVersion || '4.7.2'),
        renderProfileId: String(resp.headers['x-playhub-render-profile'] || AVATAR_RENDER_PROFILE_V1.profileId),
        renderMs: Number(resp.headers['x-playhub-render-ms'] || 0),
        skinId: String(resp.headers['x-playhub-skin-id'] || ''),
        boneCount: Number(resp.headers['x-playhub-bone-count'] || 0),
        animationCount: Number(resp.headers['x-playhub-animation-count'] || 0),
      };
    });
    renderChain = task.catch(() => {});
    return task;
  }

  function launchStudioWindow({ loadout = {}, camera = 'TPS' } = {}) {
    const exe = resolveBinary();
    if (!exe) {
      throw Object.assign(new Error('Godot 4.7.2 데스크톱 런타임을 찾을 수 없습니다.'), { status: 503, code: 'GODOT_RUNTIME_UNAVAILABLE' });
    }
    const args = [
      '--rendering-driver', 'opengl3',
      '--path', projectDir,
      studioScene,
      '--',
      `--playhub-avatar-camera=${String(camera || 'TPS')}`,
      `--playhub-avatar-loadout=${JSON.stringify(loadout)}`,
    ];
    const child = spawn(exe, args, {
      cwd: projectDir,
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });
    child.unref();
    return { ok: true, launched: true, pid: child.pid || null, renderer: 'godot-runtime', camera };
  }

  async function dispose() {
    disposed = true;
    await stopWorker();
  }

  process.once('exit', () => {
    try {
      if (worker?.proc && worker.proc.exitCode === null) worker.proc.kill();
    } catch {}
  });

  return {
    getStatus,
    renderFrame,
    launchStudioWindow,
    dispose,
  };
}
