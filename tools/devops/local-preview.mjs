#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_REPO_ROOT,
  ensureHubNodeModules,
  formatKstRunId,
  isExistingDir,
  isExistingFile,
  resolveNode24,
  runSubprocess,
  writeJsonAtomic,
} from './common.mjs';
import { validateGitRef } from './manual-build-test.mjs';

const RESERVED_DEFAULT_PORTS = new Set([8080, 8081, 8090, 8091, 4173, 4177]);

export function buildIsolatedPreviewConfig({ basePort = 18280, dataDir }) {
  if (!Number.isInteger(basePort) || basePort < 1024 || basePort > 60000) {
    throw new Error(`Invalid preview basePort: ${basePort}`);
  }
  const userPort = basePort;
  const adminUiPort = basePort + 1;
  const publicPort = basePort + 10;
  const adminPort = basePort + 11;
  for (const p of [userPort, adminUiPort, publicPort, adminPort]) {
    if (RESERVED_DEFAULT_PORTS.has(p)) {
      throw new Error(`Preview port ${p} collides with default platform port. Choose another --port.`);
    }
  }
  const absDataDir = path.resolve(dataDir);
  return {
    publicPort,
    adminPort,
    userPort,
    adminUiPort,
    publicHost: '127.0.0.1',
    adminHost: '127.0.0.1',
    userOrigins: [`http://127.0.0.1:${userPort}`, `http://localhost:${userPort}`],
    adminOrigins: [`http://127.0.0.1:${adminUiPort}`, `http://localhost:${adminUiPort}`],
    publicBaseUrl: `http://127.0.0.1:${publicPort}`,
    userBaseUrl: `http://127.0.0.1:${userPort}`,
    adminBaseUrl: `http://127.0.0.1:${adminUiPort}`,
    dataDir: absDataDir,
    secureCookies: false,
    searchIndexingEnabled: false,
    google: {
      clientId: '',
      clientSecret: '',
      redirectUri: `http://127.0.0.1:${publicPort}/api/auth/google/callback`,
    },
    admin: {
      username: 'admin',
      passwordHash: '',
      salt: '',
      localAutoLogin: false,
    },
    cdn: { enabled: false },
  };
}

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function probeHealth(url, timeoutMs = 2000) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function waitUntilReady(apiHealthUrl, userUrl, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const [apiRes, uiRes] = await Promise.all([probeHealth(apiHealthUrl), probeHealth(userUrl)]);
    if (apiRes.ok && uiRes.ok) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

export function listLocalPreviews(repoRoot = DEFAULT_REPO_ROOT) {
  const previewsDir = path.join(path.resolve(repoRoot), 'artifacts', 'daily-builds', 'previews');
  if (!isExistingDir(previewsDir)) return [];
  const items = [];
  for (const entry of fs.readdirSync(previewsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const stateFile = path.join(previewsDir, entry.name, 'preview-state.json');
    if (!isExistingFile(stateFile)) continue;
    try {
      const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      items.push({ ...state, alive: isPidAlive(state.pid) });
    } catch {
      // ignore corrupted state
    }
  }
  return items.sort((a, b) => String(b.startedAt || '').localeCompare(String(a.startedAt || '')));
}

export async function startLocalPreview({
  repoRoot = DEFAULT_REPO_ROOT,
  ref = 'HEAD',
  basePort = 18280,
  useDetachedWorktree = true,
} = {}) {
  const root = path.resolve(repoRoot);
  const resolvedRef = validateGitRef(root, ref);
  const runId = `preview-${formatKstRunId(resolvedRef.shortCommit).replace(/^daily-/, '')}`;
  const previewDir = path.join(root, 'artifacts', 'daily-builds', 'previews', runId);
  const checkoutDir = useDetachedWorktree ? path.join(previewDir, 'checkout') : root;
  const dataDir = path.join(previewDir, 'preview-data');
  const configPath = path.join(previewDir, 'preview-config.json');
  const node24 = resolveNode24(root);

  fs.mkdirSync(dataDir, { recursive: true });

  if (useDetachedWorktree) {
    execFileSync('git', ['-c', 'core.longpaths=true', '-C', root, 'worktree', 'add', '--detach', checkoutDir, resolvedRef.commit], {
      stdio: 'pipe',
      windowsHide: true,
    });
  }

  const config = buildIsolatedPreviewConfig({ basePort, dataDir });
  writeJsonAtomic(configPath, config);
  ensureHubNodeModules(checkoutDir, root);

  // Build hub/dist inside the target checkout using isolated preview config
  const buildLog = path.join(previewDir, 'build.log');
  const buildRes = await runSubprocess(
    node24,
    ['hub/tools/build.mjs', '--config', configPath],
    { cwd: checkoutDir, timeoutMs: 180000, logFile: buildLog },
  );
  if (buildRes.exitCode !== 0) {
    throw new Error(`Preview build failed (exit ${buildRes.exitCode}). See ${buildLog}`);
  }

  const outLog = fs.openSync(path.join(previewDir, 'server.stdout.log'), 'w');
  const errLog = fs.openSync(path.join(previewDir, 'server.stderr.log'), 'w');
  let child;
  try {
    child = spawn(node24, ['hub/tools/dev.mjs', '--config', configPath], {
      cwd: checkoutDir,
      env: { ...process.env, PLAYHUB_NO_BROWSER: '1' },
      detached: true,
      stdio: ['ignore', outLog, errLog],
      windowsHide: true,
    });
    child.unref();
  } finally {
    fs.closeSync(outLog);
    fs.closeSync(errLog);
  }

  const ready = await waitUntilReady(
    `http://127.0.0.1:${config.publicPort}/api/health`,
    `http://127.0.0.1:${config.userPort}/`,
    20000,
  );
  if (!ready) {
    try { process.kill(child.pid); } catch { /* ignore */ }
    throw new Error(`Preview server did not become ready on port ${config.userPort}. See ${path.join(previewDir, 'server.stderr.log')}`);
  }

  const state = {
    schemaVersion: 1,
    runId,
    ref: resolvedRef.ref,
    commit: resolvedRef.commit,
    shortCommit: resolvedRef.shortCommit,
    subject: resolvedRef.subject,
    pid: child.pid,
    useDetachedWorktree,
    checkoutDir,
    previewDir,
    configPath,
    urls: {
      user: `http://127.0.0.1:${config.userPort}/`,
      adminUi: `http://127.0.0.1:${config.adminUiPort}/`,
      publicApi: `http://127.0.0.1:${config.publicPort}/api/health`,
    },
    ports: {
      userPort: config.userPort,
      adminUiPort: config.adminUiPort,
      publicPort: config.publicPort,
      adminPort: config.adminPort,
    },
    startedAt: new Date().toISOString(),
  };
  writeJsonAtomic(path.join(previewDir, 'preview-state.json'), state);
  return state;
}

function rmDirWithRetry(targetDir, maxAttempts = 20, delayMs = 150) {
  for (let attempt = 0; ; attempt++) {
    try {
      fs.rmSync(targetDir, { recursive: true, force: true });
      return;
    } catch (err) {
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(err.code) || attempt >= maxAttempts) throw err;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
    }
  }
}

export function stopLocalPreview({ repoRoot = DEFAULT_REPO_ROOT, runId, cleanup = false } = {}) {
  if (!runId || !/^[A-Za-z0-9._-]+$/.test(runId)) {
    throw new Error(`Invalid preview runId: ${runId}`);
  }
  const root = path.resolve(repoRoot);
  const previewDir = path.join(root, 'artifacts', 'daily-builds', 'previews', runId);
  const statePath = path.join(previewDir, 'preview-state.json');
  if (!isExistingFile(statePath)) {
    throw new Error(`Preview state not found for ${runId}`);
  }
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  let stopped = false;
  if (isPidAlive(state.pid)) {
    try {
      process.kill(state.pid);
      stopped = true;
    } catch {
      stopped = false;
    }
    // Wait briefly on Windows for child process to release log/SQLite handles
    for (let i = 0; i < 15 && isPidAlive(state.pid); i++) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
  }
  if (cleanup) {
    if (state.useDetachedWorktree && isExistingDir(state.checkoutDir)) {
      try {
        execFileSync('git', ['-C', root, 'worktree', 'remove', '--force', state.checkoutDir], {
          stdio: 'pipe',
          windowsHide: true,
        });
      } catch {
        // fallback directory cleanup below
      }
    }
    rmDirWithRetry(previewDir);
    return { runId, stopped, cleaned: true };
  }
  state.stoppedAt = new Date().toISOString();
  writeJsonAtomic(statePath, state);
  return { runId, stopped, cleaned: false };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, ...rest] = process.argv.slice(2);
  let repoRoot = DEFAULT_REPO_ROOT;
  let ref = 'HEAD';
  let basePort = 18280;
  let runId = null;
  let noWorktree = false;

  try {
    for (let i = 0; i < rest.length; i++) {
      const t = rest[i];
      if (t === '--repo-root') repoRoot = path.resolve(rest[++i]);
      else if (t === '--ref') ref = rest[++i];
      else if (t === '--port') basePort = Number(rest[++i]);
      else if (t === '--run-id') runId = rest[++i];
      else if (t === '--no-worktree') noWorktree = true;
    }

    if (!cmd || cmd === '--help' || cmd === '-h') {
      console.log(
        'Usage:\n' +
          '  node tools/devops/local-preview.mjs start --ref <branch|commit> [--port 18280] [--no-worktree]\n' +
          '  node tools/devops/local-preview.mjs status\n' +
          '  node tools/devops/local-preview.mjs stop --run-id <id>\n' +
          '  node tools/devops/local-preview.mjs cleanup --run-id <id>',
      );
      process.exit(0);
    }

    if (cmd === 'status') {
      console.log(JSON.stringify({ previews: listLocalPreviews(repoRoot) }, null, 2));
    } else if (cmd === 'start') {
      const state = await startLocalPreview({ repoRoot, ref, basePort, useDetachedWorktree: !noWorktree });
      console.log(JSON.stringify(state, null, 2));
    } else if (cmd === 'stop') {
      console.log(JSON.stringify(stopLocalPreview({ repoRoot, runId, cleanup: false }), null, 2));
    } else if (cmd === 'cleanup') {
      console.log(JSON.stringify(stopLocalPreview({ repoRoot, runId, cleanup: true }), null, 2));
    } else {
      throw new Error(`Unknown subcommand: ${cmd}`);
    }
  } catch (err) {
    console.error(`Local preview error: ${err.message}`);
    process.exitCode = 2;
  }
}
