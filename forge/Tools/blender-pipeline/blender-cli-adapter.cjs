'use strict';

/*
 * Licensing & GPL Isolation Note (Blender GNU GPL v2+/v3, non-AGPL):
 * - SaaS server-side execution of unmodified official Blender via isolated child process + JSON/file IPC
 *   keeps PlayForge proprietary code outside GPL derivative scope; generated .glb outputs are user/platform data.
 * - Never link Blender DLLs/bpy in-process and never bundle proprietary AI/business logic into blender_worker.py
 *   (if externally distributed, only the thin bpy worker script is GPL-scoped; use MIT threejs-cli for bundled builds).
 */

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { SCHEMA_VERSION, validateGlbBuffer } = require('./engine-adapter.cjs');

const DEFAULT_TIMEOUT_MS = 60000;
const PROBE_TIMEOUT_MS = 10000;
const MAX_LOG_BYTES = 64 * 1024;
const WORKER_SCRIPT = path.resolve(__dirname, 'worker', 'blender_worker.py');

function isInsideDir(baseDir, candidate) {
  const rel = path.relative(path.resolve(baseDir), path.resolve(candidate));
  return Boolean(rel) && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function appendBounded(current, chunk, maxBytes = MAX_LOG_BYTES) {
  const next = current + chunk.toString('utf8');
  return next.length > maxBytes ? next.slice(next.length - maxBytes) : next;
}

function discoverBlenderBinary(env = process.env, explicitBin = null) {
  const candidates = [];
  if (explicitBin) candidates.push(explicitBin);
  if (env.PLAYFORGE_BLENDER_BIN) candidates.push(env.PLAYFORGE_BLENDER_BIN);
  if (env.BLENDER_BIN) candidates.push(env.BLENDER_BIN);

  if (process.platform === 'win32') {
    const programDirs = [
      env.ProgramFiles || 'C:\\Program Files',
      env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
    ].filter(Boolean);
    for (const dir of programDirs) {
      const bfDir = path.join(dir, 'Blender Foundation');
      try {
        if (fs.existsSync(bfDir)) {
          const entries = fs.readdirSync(bfDir, { withFileTypes: true })
            .filter(entry => entry.isDirectory() && /^Blender/i.test(entry.name))
            .map(entry => entry.name)
            .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
          for (const name of entries) {
            candidates.push(path.join(bfDir, name, 'blender.exe'));
          }
        }
      } catch {
        // Ignore inaccessible directories
      }
    }
    candidates.push('blender.exe');
  } else if (process.platform === 'darwin') {
    candidates.push('/Applications/Blender.app/Contents/MacOS/Blender');
    candidates.push('/opt/homebrew/bin/blender');
    candidates.push('/usr/local/bin/blender');
  } else {
    candidates.push('/usr/bin/blender');
    candidates.push('/usr/local/bin/blender');
    candidates.push('/snap/bin/blender');
  }
  candidates.push('blender');

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'string') continue;
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    if (path.isAbsolute(trimmed)) {
      if (fs.existsSync(trimmed)) return trimmed;
    } else {
      const pathEntries = String(env.PATH || '').split(path.delimiter).filter(Boolean);
      for (const dir of pathEntries) {
        const full = path.join(dir, trimmed);
        if (fs.existsSync(full)) return full;
      }
    }
  }
  return null;
}

function buildIsolatedArgs(workerScriptPath, requestPath, responsePath) {
  return [
    '--background',
    '--factory-startup',
    '--python-exit-code',
    '1',
    '--python',
    workerScriptPath,
    '--',
    '--request',
    requestPath,
    '--response',
    responsePath,
  ];
}

function runIsolatedProcess(binaryPath, args, { cwd, timeoutMs, env } = {}) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let finished = false;
    let timedOut = false;

    const childEnv = {
      PATH: env?.PATH || process.env.PATH || '',
      SYSTEMROOT: env?.SYSTEMROOT || process.env.SYSTEMROOT || '',
      TEMP: cwd || env?.TEMP || process.env.TEMP || '',
      TMP: cwd || env?.TMP || process.env.TMP || '',
      HOME: cwd || env?.HOME || process.env.HOME || '',
      USERPROFILE: cwd || env?.USERPROFILE || process.env.USERPROFILE || '',
      PYTHONUTF8: '1',
      PYTHONDONTWRITEBYTECODE: '1',
    };

    const child = spawn(binaryPath, args, {
      cwd,
      env: childEnv,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const timer = setTimeout(() => {
      if (finished) return;
      timedOut = true;
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
    }, timeoutMs || DEFAULT_TIMEOUT_MS);
    timer.unref();

    child.stdout.on('data', chunk => { stdout = appendBounded(stdout, chunk); });
    child.stderr.on('data', chunk => { stderr = appendBounded(stderr, chunk); });
    child.on('error', err => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code, signal) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({ code, signal, timedOut, stdout, stderr });
    });
  });
}

function parseBlenderVersion(stdout) {
  const match = String(stdout || '').match(/Blender\s+([0-9]+\.[0-9]+(?:\.[0-9]+)?)/i);
  return match ? match[1] : null;
}

function createBlenderCliAdapter(options = {}) {
  const env = options.env || process.env;
  const workerScriptPath = path.resolve(options.workerScriptPath || WORKER_SCRIPT);
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : DEFAULT_TIMEOUT_MS;
  const explicitBin = options.binaryPath || null;

  let cachedProbe = null;
  let cachedProbeAt = 0;

  async function probe({ force = false } = {}) {
    const now = Date.now();
    if (!force && cachedProbe && now - cachedProbeAt < 15000) {
      return cachedProbe;
    }
    const binaryPath = discoverBlenderBinary(env, explicitBin);
    if (!binaryPath) {
      cachedProbe = {
        available: false,
        binaryPath: null,
        version: null,
        workerScriptPresent: fs.existsSync(workerScriptPath),
        error: 'Official Blender binary not found. Install Blender 4.x or set PLAYFORGE_BLENDER_BIN.',
      };
      cachedProbeAt = now;
      return cachedProbe;
    }

    try {
      const result = await runIsolatedProcess(binaryPath, ['--version'], {
        cwd: path.dirname(workerScriptPath),
        timeoutMs: PROBE_TIMEOUT_MS,
        env,
      });
      const version = parseBlenderVersion(result.stdout);
      cachedProbe = {
        available: result.code === 0 && Boolean(version),
        binaryPath,
        version,
        workerScriptPresent: fs.existsSync(workerScriptPath),
        error: result.code === 0 ? null : (result.stderr.trim() || `Blender exited with code ${result.code}`),
      };
    } catch (err) {
      cachedProbe = {
        available: false,
        binaryPath,
        version: null,
        workerScriptPresent: fs.existsSync(workerScriptPath),
        error: err.message,
      };
    }
    cachedProbeAt = now;
    return cachedProbe;
  }

  async function execute(jobContext) {
    const { jobId, jobDir, recipe, operation = 'generate_prop' } = jobContext;
    if (!jobDir || !fs.existsSync(jobDir)) {
      throw new Error('Isolated jobDir must exist before execution');
    }
    const status = await probe();
    if (!status.available || !status.binaryPath) {
      const err = new Error(status.error || 'Headless Blender engine is unavailable');
      err.status = 503;
      throw err;
    }
    if (!fs.existsSync(workerScriptPath)) {
      const err = new Error(`Blender worker script missing: ${workerScriptPath}`);
      err.status = 500;
      throw err;
    }

    const requestPath = path.join(jobDir, 'request.json');
    const responsePath = path.join(jobDir, 'response.json');
    const outputFileName = 'output.glb';
    const outputPath = path.join(jobDir, outputFileName);

    const requestPayload = {
      schemaVersion: SCHEMA_VERSION,
      jobId,
      operation,
      output: {
        glbPath: outputFileName,
        format: 'GLB',
        yUp: true,
        applyModifiers: true,
        normalizePivot: 'bottom_center',
      },
      recipe,
    };
    await fs.promises.writeFile(requestPath, JSON.stringify(requestPayload, null, 2), 'utf8');

    const args = buildIsolatedArgs(workerScriptPath, requestPath, responsePath);
    const startedAt = Date.now();
    const proc = await runIsolatedProcess(status.binaryPath, args, {
      cwd: jobDir,
      timeoutMs,
      env,
    });
    const elapsedMs = Date.now() - startedAt;

    if (proc.timedOut) {
      const err = new Error(`Headless Blender process timed out after ${timeoutMs}ms`);
      err.status = 504;
      err.logs = { stdout: proc.stdout, stderr: proc.stderr };
      throw err;
    }

    let responseJson = null;
    if (fs.existsSync(responsePath)) {
      try {
        responseJson = JSON.parse(await fs.promises.readFile(responsePath, 'utf8'));
      } catch (parseErr) {
        const err = new Error(`Invalid response.json from Blender worker: ${parseErr.message}`);
        err.logs = { stdout: proc.stdout, stderr: proc.stderr };
        throw err;
      }
    }

    if (proc.code !== 0 || !responseJson || responseJson.ok !== true) {
      const message = responseJson?.error || proc.stderr.trim() || `Blender worker exited with code ${proc.code}`;
      const err = new Error(message);
      err.status = 500;
      err.logs = { stdout: proc.stdout, stderr: proc.stderr };
      throw err;
    }

    const declaredGlb = path.resolve(jobDir, String(responseJson.artifact?.glbPath || outputFileName));
    if (!isInsideDir(jobDir, declaredGlb) || !fs.existsSync(declaredGlb)) {
      throw new Error('Blender worker did not produce a valid output.glb inside job workspace');
    }

    const glbBuffer = await fs.promises.readFile(declaredGlb);
    const glbValidation = validateGlbBuffer(glbBuffer);

    return {
      engine: {
        id: 'blender-cli',
        version: responseJson.engine?.version || status.version,
        binaryPolicy: 'unmodified-official-cli',
      },
      ipc: {
        mode: 'json-file',
        requestFile: 'request.json',
        responseFile: 'response.json',
        request: requestPayload,
        response: responseJson,
      },
      glbPath: declaredGlb,
      glbBuffer,
      glbValidation,
      metrics: {
        ...(responseJson.metrics || {}),
        processElapsedMs: elapsedMs,
      },
      warnings: Array.isArray(responseJson.warnings) ? responseJson.warnings : [],
      logs: {
        stdout: proc.stdout,
        stderr: proc.stderr,
        exitCode: proc.code,
      },
    };
  }

  return {
    id: 'blender-cli',
    displayName: 'Blender Headless CLI (Unmodified)',
    policy: Object.freeze({
      unmodifiedOfficialBinary: true,
      directDllLink: false,
      isolatedProcess: true,
      ipcMode: 'json-file',
    }),
    buildIsolatedArgs,
    probe,
    execute,
  };
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  WORKER_SCRIPT,
  discoverBlenderBinary,
  buildIsolatedArgs,
  parseBlenderVersion,
  createBlenderCliAdapter,
};
