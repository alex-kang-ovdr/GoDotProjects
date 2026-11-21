'use strict';

/*
 * Licensing Note: Uses Three.js (MIT License) in an isolated child process via JSON/file IPC.
 * Safe for both commercial SaaS and externally distributed proprietary builds (GPL-free default option).
 */

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { SCHEMA_VERSION, validateGlbBuffer } = require('./engine-adapter.cjs');

const DEFAULT_TIMEOUT_MS = 30000;
const MAX_LOG_BYTES = 64 * 1024;
const WORKER_SCRIPT = path.resolve(__dirname, 'worker', 'threejs_worker.mjs');

function isInsideDir(baseDir, candidate) {
  const rel = path.relative(path.resolve(baseDir), path.resolve(candidate));
  return Boolean(rel) && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function appendBounded(current, chunk, maxBytes = MAX_LOG_BYTES) {
  const next = current + chunk.toString('utf8');
  return next.length > maxBytes ? next.slice(next.length - maxBytes) : next;
}

function resolveThreeVersion() {
  try {
    const pkgPath = path.resolve(__dirname, '..', '..', 'node_modules', 'three', 'package.json');
    if (!fs.existsSync(pkgPath)) return null;
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return pkg.version || 'unknown';
  } catch {
    return null;
  }
}

function buildIsolatedArgs(workerScriptPath, requestPath, responsePath) {
  return [
    workerScriptPath,
    '--request',
    requestPath,
    '--response',
    responsePath,
  ];
}

function runIsolatedNode(args, { cwd, timeoutMs } = {}) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let finished = false;
    let timedOut = false;

    const child = spawn(process.execPath, args, {
      cwd,
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

function createThreeJsCliAdapter(options = {}) {
  const workerScriptPath = path.resolve(options.workerScriptPath || WORKER_SCRIPT);
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : DEFAULT_TIMEOUT_MS;

  async function probe() {
    const version = resolveThreeVersion();
    const workerPresent = fs.existsSync(workerScriptPath);
    return {
      available: Boolean(version && workerPresent),
      binaryPath: process.execPath,
      version: version ? `three@${version}` : null,
      workerScriptPresent: workerPresent,
      error: !version
        ? 'three package is not installed in forge/node_modules.'
        : (!workerPresent ? `Three.js worker script missing: ${workerScriptPath}` : null),
    };
  }

  async function execute(jobContext) {
    const { jobId, jobDir, recipe, operation = 'generate_prop' } = jobContext;
    if (!jobDir || !fs.existsSync(jobDir)) {
      throw new Error('Isolated jobDir must exist before execution');
    }
    const status = await probe();
    if (!status.available) {
      const err = new Error(status.error || 'Three.js Headless engine is unavailable');
      err.status = 503;
      throw err;
    }

    const requestPath = path.join(jobDir, 'request.json');
    const responsePath = path.join(jobDir, 'response.json');
    const outputFileName = 'output.glb';

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
    const proc = await runIsolatedNode(args, { cwd: jobDir, timeoutMs });
    const elapsedMs = Date.now() - startedAt;

    if (proc.timedOut) {
      const err = new Error(`Headless Three.js worker timed out after ${timeoutMs}ms`);
      err.status = 504;
      err.logs = { stdout: proc.stdout, stderr: proc.stderr };
      throw err;
    }

    let responseJson = null;
    if (fs.existsSync(responsePath)) {
      try {
        responseJson = JSON.parse(await fs.promises.readFile(responsePath, 'utf8'));
      } catch (parseErr) {
        const err = new Error(`Invalid response.json from Three.js worker: ${parseErr.message}`);
        err.logs = { stdout: proc.stdout, stderr: proc.stderr };
        throw err;
      }
    }

    if (proc.code !== 0 || !responseJson || responseJson.ok !== true) {
      const message = responseJson?.error || proc.stderr.trim() || `Three.js worker exited with code ${proc.code}`;
      const err = new Error(message);
      err.status = 500;
      err.logs = { stdout: proc.stdout, stderr: proc.stderr };
      throw err;
    }

    const declaredGlb = path.resolve(jobDir, String(responseJson.artifact?.glbPath || outputFileName));
    if (!isInsideDir(jobDir, declaredGlb) || !fs.existsSync(declaredGlb)) {
      throw new Error('Three.js worker did not produce a valid output.glb inside job workspace');
    }

    const glbBuffer = await fs.promises.readFile(declaredGlb);
    const glbValidation = validateGlbBuffer(glbBuffer);

    return {
      engine: {
        id: 'threejs-cli',
        version: responseJson.engine?.version || status.version,
        binaryPolicy: 'isolated-node-threejs',
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
    id: 'threejs-cli',
    displayName: 'Three.js Headless Worker (초고속)',
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
  WORKER_SCRIPT,
  buildIsolatedArgs,
  createThreeJsCliAdapter,
};
