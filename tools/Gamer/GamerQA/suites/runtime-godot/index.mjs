import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const COPY_EXCLUDE_DIRS = new Set(['.godot', '.git', 'node_modules', 'Saved']);

const ERROR_CLASSIFIERS = [
  { type: 'PARSE_ERROR', pattern: /\bParse Error:\s*.+/i },
  { type: 'SCRIPT_ERROR', pattern: /\bSCRIPT ERROR:\s*.+/i },
  {
    type: 'FAILED_LOADING_RESOURCE',
    pattern: /\b(?:Failed loading resource|Resource file not found|Failed to instantiate scene|Failed to load script|Cannot open file)\b.*/i,
  },
  { type: 'ASSERTION_FAILED', pattern: /\b(?:ASSERTION FAILED:|Assertion failed)\b.*/i },
  { type: 'ENGINE_ERROR', pattern: /^\s*(?:ERROR|USER ERROR):\s*.+/ },
];

const WARNING_PATTERN = /^\s*WARNING:\s*.+/;

export function stripAnsi(text = '') {
  return String(text).replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Inspect combined Godot stdout/stderr output for fatal errors and warnings.
 * Godot frequently exits with status 0 even after Parse Error / SCRIPT ERROR /
 * Failed loading resource, so log analysis is mandatory.
 */
export function analyzeGodotOutput(stdout = '', stderr = '') {
  const cleanStdout = stripAnsi(stdout);
  const cleanStderr = stripAnsi(stderr);
  const combined = [cleanStdout, cleanStderr].filter(Boolean).join('\n');
  const errors = [];
  const warnings = [];
  const seenErrors = new Set();
  const seenWarnings = new Set();

  for (const rawLine of combined.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;

    let matchedType = null;
    for (const classifier of ERROR_CLASSIFIERS) {
      if (classifier.pattern.test(line)) {
        matchedType = classifier.type;
        break;
      }
    }

    if (matchedType) {
      const trimmed = line.trim();
      if (!seenErrors.has(trimmed)) {
        seenErrors.add(trimmed);
        errors.push({ type: matchedType, line: trimmed });
      }
      continue;
    }

    if (WARNING_PATTERN.test(line)) {
      const trimmed = line.trim();
      if (!seenWarnings.has(trimmed)) {
        seenWarnings.add(trimmed);
        warnings.push({ line: trimmed });
      }
    }
  }

  return {
    hasErrors: errors.length > 0,
    errors,
    warnings,
    cleanStdout,
    cleanStderr,
    cleanOutput: combined,
  };
}

function collectSearchDirs(searchFrom) {
  const roots = new Set();
  const seeds = [
    searchFrom,
    process.cwd(),
    path.dirname(fileURLToPath(import.meta.url)),
  ].filter(Boolean);

  for (const seed of seeds) {
    let cursor = path.resolve(seed);
    for (let depth = 0; depth < 7; depth++) {
      roots.add(cursor);
      roots.add(path.join(cursor, 'GoDotProjects'));
      const parent = path.dirname(cursor);
      if (parent === cursor) break;
      cursor = parent;
    }
  }
  return [...roots];
}

/**
 * Locate the Godot 4.x executable (preferring the Windows console launcher for clean stdio).
 */
export function findGodotBinary(options = {}) {
  const explicitCandidates = [
    options.godotBin,
    process.env.GODOT_BIN,
    process.env.GODOT_CONSOLE_BIN,
    process.env.GODOT_EDITOR,
  ].filter(Boolean);

  for (const candidate of explicitCandidates) {
    const resolved = path.resolve(candidate);
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      return { found: true, executable: resolved, source: 'explicit' };
    }
    return {
      found: false,
      executable: null,
      reason: `Configured Godot executable not found: ${resolved}`,
    };
  }

  const patterns = process.platform === 'win32'
    ? [/^Godot_v4\..*_win64_console\.exe$/i, /^Godot_v4\..*_win64\.exe$/i]
    : [/^Godot_v4\..*linux.*$/i, /^godot4?$/i];

  for (const dir of collectSearchDirs(options.searchFrom)) {
    if (!fs.existsSync(dir)) continue;
    let entries;
    try {
      entries = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const pattern of patterns) {
      const match = entries.filter(name => pattern.test(name)).sort().at(-1);
      if (match) {
        return { found: true, executable: path.join(dir, match), source: 'discovered' };
      }
    }
  }

  const lookupCmd = process.platform === 'win32' ? 'where.exe' : 'which';
  for (const binName of ['godot4', 'godot']) {
    const probe = spawnSync(lookupCmd, [binName], { encoding: 'utf8', windowsHide: true });
    if (probe.status === 0 && probe.stdout) {
      const firstLine = probe.stdout.trim().split(/\r?\n/)[0];
      if (firstLine && fs.existsSync(firstLine)) {
        return { found: true, executable: firstLine, source: 'path' };
      }
    }
  }

  return {
    found: false,
    executable: null,
    reason: 'Godot 4.7+ executable was not found. Pass godotBin or set GODOT_BIN.',
  };
}

function buildIsolatedEnv(profileDir) {
  return {
    ...process.env,
    APPDATA: profileDir,
    LOCALAPPDATA: profileDir,
    HOME: profileDir,
    XDG_DATA_HOME: profileDir,
    XDG_CONFIG_HOME: profileDir,
    XDG_CACHE_HOME: profileDir,
    GODOT_SILENCE_ROOT_WARNING: '1',
  };
}

function rmSyncWithRetry(targetDir, attempts = 5) {
  for (let i = 0; i < attempts; i++) {
    try {
      fs.rmSync(targetDir, { recursive: true, force: true });
      return;
    } catch (error) {
      if (i === attempts - 1) return;
      const waitUntil = Date.now() + 50 * (i + 1);
      while (Date.now() < waitUntil) {
        // Brief spin before retrying Windows handle release.
      }
    }
  }
}

function prepareIsolatedWorkspace(projectDir) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gamerqa-godot-'));
  const isolatedProjectDir = path.join(tempRoot, 'project');
  const profileDir = path.join(tempRoot, 'profile');
  fs.mkdirSync(profileDir, { recursive: true });

  fs.cpSync(projectDir, isolatedProjectDir, {
    recursive: true,
    filter: src => !COPY_EXCLUDE_DIRS.has(path.basename(src)),
  });

  return {
    tempRoot,
    projectDir: isolatedProjectDir,
    env: buildIsolatedEnv(profileDir),
    cleanup: () => rmSyncWithRetry(tempRoot),
  };
}

export function getGodotVersion(executable, env = process.env) {
  const probe = spawnSync(executable, ['--version'], {
    env,
    encoding: 'utf8',
    timeout: 10000,
    windowsHide: true,
  });
  if (probe.error || probe.status !== 0) return null;
  return stripAnsi(probe.stdout || '').trim().split(/\r?\n/)[0] || null;
}

function executeGodotPhase({ executable, projectDir, args, env, timeoutMs, failOnWarning, phaseName }) {
  const started = performance.now();
  const result = spawnSync(executable, args, {
    cwd: projectDir,
    env,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });
  const durationMs = Math.round(performance.now() - started);
  const timedOut = result.error?.code === 'ETIMEDOUT';
  const spawnError = result.error ? result.error.message : null;
  const analysis = analyzeGodotOutput(result.stdout || '', result.stderr || '');

  const errors = [...analysis.errors];
  if (spawnError) {
    errors.unshift({ type: timedOut ? 'TIMEOUT' : 'SPAWN_ERROR', line: spawnError });
  }
  if (result.status !== 0 && !spawnError) {
    errors.push({ type: 'NON_ZERO_EXIT', line: `Godot exited with code ${result.status}` });
  }
  if (failOnWarning && analysis.warnings.length > 0) {
    for (const warning of analysis.warnings) {
      errors.push({ type: 'WARNING_AS_ERROR', line: warning.line });
    }
  }

  return {
    name: phaseName,
    command: [executable, ...args],
    exitCode: result.status,
    signal: result.signal || null,
    timedOut,
    spawnError,
    durationMs,
    status: errors.length > 0 ? 'fail' : 'pass',
    errors,
    warnings: analysis.warnings,
    stdout: analysis.cleanStdout,
    stderr: analysis.cleanStderr,
  };
}

/**
 * Run Godot 4.7+ headless verification (`--import --quit` and `--quit` / `--quit-after N`)
 * against a project directory. Isolates `.godot/` and user profile in a temporary copy
 * by default so the source workspace remains completely clean.
 */
export function runGodotProjectCheck(projectDir, options = {}) {
  const started = performance.now();
  const absProjectDir = path.resolve(projectDir);

  if (!fs.existsSync(absProjectDir) || !fs.existsSync(path.join(absProjectDir, 'project.godot'))) {
    return {
      suite: 'runtime-godot',
      status: 'error',
      projectDir: absProjectDir,
      isolated: false,
      godot: { executable: null, version: null },
      phases: [],
      errors: [{ phase: 'preflight', type: 'MISSING_PROJECT', line: `Missing project.godot in ${absProjectDir}` }],
      warnings: [],
      durationMs: Math.round(performance.now() - started),
    };
  }

  const binary = findGodotBinary({ ...options, searchFrom: absProjectDir });
  if (!binary.found) {
    return {
      suite: 'runtime-godot',
      status: 'error',
      projectDir: absProjectDir,
      isolated: false,
      godot: { executable: null, version: null },
      phases: [],
      errors: [{ phase: 'preflight', type: 'GODOT_NOT_FOUND', line: binary.reason }],
      warnings: [],
      durationMs: Math.round(performance.now() - started),
    };
  }

  const isolate = options.isolate !== false;
  const runImport = options.runImport !== false;
  const runBoot = options.runBoot !== false;
  const failOnWarning = options.failOnWarning === true;
  const stopOnFailure = options.stopOnFailure === true;
  const importTimeoutMs = options.importTimeoutMs ?? 60000;
  const bootTimeoutMs = options.bootTimeoutMs ?? 30000;
  const quitAfterFrames = options.quitAfterFrames ?? 3;

  let workspace = null;
  const phases = [];

  try {
    let targetDir = absProjectDir;
    let env = process.env;
    if (isolate) {
      workspace = prepareIsolatedWorkspace(absProjectDir);
      targetDir = workspace.projectDir;
      env = workspace.env;
    }

    const godotVersion = getGodotVersion(binary.executable, env);

    if (runImport) {
      const importPhase = executeGodotPhase({
        executable: binary.executable,
        projectDir: targetDir,
        args: ['--headless', '--path', targetDir, '--import', '--quit'],
        env,
        timeoutMs: importTimeoutMs,
        failOnWarning,
        phaseName: 'import',
      });
      phases.push(importPhase);
    }

    const shouldRunBoot = runBoot && (!stopOnFailure || phases.every(p => p.status === 'pass'));
    if (shouldRunBoot) {
      const quitArgs = Number.isInteger(quitAfterFrames) && quitAfterFrames > 0
        ? ['--quit-after', String(quitAfterFrames)]
        : ['--quit'];
      const bootPhase = executeGodotPhase({
        executable: binary.executable,
        projectDir: targetDir,
        args: ['--headless', '--path', targetDir, ...quitArgs],
        env,
        timeoutMs: bootTimeoutMs,
        failOnWarning,
        phaseName: 'boot',
      });
      phases.push(bootPhase);
    }

    if (options.scriptPath && (!stopOnFailure || phases.every(p => p.status === 'pass'))) {
      const scriptPhase = executeGodotPhase({
        executable: binary.executable,
        projectDir: targetDir,
        args: ['--headless', '--path', targetDir, '--script', options.scriptPath],
        env,
        timeoutMs: options.scriptTimeoutMs ?? bootTimeoutMs,
        failOnWarning,
        phaseName: 'script',
      });
      phases.push(scriptPhase);
    }

    const errors = phases.flatMap(p => p.errors.map(err => ({ phase: p.name, ...err })));
    const warnings = phases.flatMap(p => p.warnings.map(warn => ({ phase: p.name, ...warn })));
    const status = phases.length === 0
      ? 'error'
      : errors.length > 0
        ? 'fail'
        : 'pass';

    return {
      suite: 'runtime-godot',
      status,
      projectDir: absProjectDir,
      isolated: isolate,
      godot: { executable: binary.executable, version: godotVersion },
      phases,
      errors,
      warnings,
      durationMs: Math.round(performance.now() - started),
    };
  } finally {
    if (workspace) workspace.cleanup();
  }
}

export function runSuite(context = {}) {
  const dirs = Array.isArray(context.projectDirs)
    ? context.projectDirs
    : context.projectDir
      ? [context.projectDir]
      : [];

  if (dirs.length === 0) {
    return {
      suite: 'runtime-godot',
      status: 'error',
      results: [],
      summary: { total: 0, passed: 0, failed: 0, errored: 1 },
      errors: [{ phase: 'preflight', type: 'NO_TARGETS', line: 'No projectDir or projectDirs specified' }],
    };
  }

  const results = dirs.map(dir => runGodotProjectCheck(dir, context));
  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const errored = results.filter(r => r.status === 'error').length;
  const status = errored > 0 ? 'error' : failed > 0 ? 'fail' : 'pass';

  return {
    suite: 'runtime-godot',
    status,
    summary: { total: results.length, passed, failed, errored },
    results,
  };
}
