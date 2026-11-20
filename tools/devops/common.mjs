import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_REPO_ROOT = path.resolve(HERE, '..', '..');
export const EXPECTED_GODOT_SUBMODULE_PIN = 'ed1daf0bf001b61586d9930840f2f1394092c079';

export function isExistingFile(filePath) {
  try {
    return Boolean(filePath) && fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

export function isExistingDir(dirPath) {
  try {
    return Boolean(dirPath) && fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

export function ensureHubNodeModules(targetRepoRoot, fallbackRepoRoot = DEFAULT_REPO_ROOT) {
  const dest = path.join(targetRepoRoot, 'hub', 'node_modules');
  if (isExistingDir(path.join(dest, 'parse5'))) return { seeded: false, path: dest };
  const candidates = [
    path.join(fallbackRepoRoot, 'hub', 'node_modules'),
    path.resolve(fallbackRepoRoot, '..', 'PlayHub-Platform', 'hub', 'node_modules'),
    path.resolve(targetRepoRoot, '..', 'PlayHub-Platform', 'hub', 'node_modules'),
  ];
  for (const src of candidates) {
    if (isExistingDir(path.join(src, 'parse5')) && path.resolve(src) !== path.resolve(dest)) {
      fs.cpSync(src, dest, { recursive: true });
      return { seeded: true, from: src, path: dest };
    }
  }
  return { seeded: false, path: null };
}

export function resolveNode24(repoRoot = DEFAULT_REPO_ROOT) {
  const candidates = [
    process.env.PLAYHUB_NODE_BIN,
    path.join(repoRoot, 'artifacts', 'local-runtime', 'node24', 'node.exe'),
    path.resolve(repoRoot, '..', 'PlayHub-Platform', 'artifacts', 'local-runtime', 'node24', 'node.exe'),
    process.execPath,
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (isExistingFile(candidate)) return path.resolve(candidate);
  }
  return process.execPath;
}

export function resolvePython() {
  if (process.env.PLAYHUB_PYTHON && isExistingFile(process.env.PLAYHUB_PYTHON)) {
    return process.env.PLAYHUB_PYTHON;
  }
  const names = process.platform === 'win32' ? ['python', 'python3'] : ['python3', 'python'];
  for (const name of names) {
    try {
      execFileSync(name, ['--version'], { stdio: 'ignore', windowsHide: true });
      return name;
    } catch {
      // try next
    }
  }
  return null;
}

export function resolveGodotBin(repoRoot = DEFAULT_REPO_ROOT) {
  const candidates = [
    process.env.GODOT_BIN,
    path.join(repoRoot, 'artifacts', 'local-runtime', 'godot', 'Godot_v4.7.2-stable_win64_console.exe'),
    path.join(repoRoot, 'artifacts', 'local-runtime', 'godot', 'Godot_v4.7.2-stable_win64.exe'),
    path.resolve(repoRoot, '..', 'PlayHub-Platform', 'artifacts', 'local-runtime', 'godot', 'Godot_v4.7.2-stable_win64_console.exe'),
    path.resolve(repoRoot, '..', '..', 'GoDotProjects', 'Godot_v4.7.2-stable_win64_console.exe'),
    path.resolve(repoRoot, '..', '..', 'GoDotProjects', 'Godot_v4.7.2-stable_win64.exe'),
    path.join(repoRoot, 'artifacts', 'local-runtime', 'godot', 'Godot_v4.7.2-stable_linux.x86_64'),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (isExistingFile(candidate)) return path.resolve(candidate);
  }
  return null;
}

export function resolveGamerCacheRoot(repoRoot = DEFAULT_REPO_ROOT) {
  const candidates = [
    process.env.GAMER_CACHE_ROOT,
    path.join(repoRoot, 'tools', 'Gamer'),
    path.resolve(repoRoot, '..', 'PlayHub-Platform', 'tools', 'Gamer'),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (
      isExistingDir(path.join(candidate, 'models', 'GameScaling-0.8B-S3')) &&
      isExistingFile(path.join(candidate, '.venv-inference', 'Scripts', 'python.exe'))
    ) {
      return path.resolve(candidate);
    }
  }
  return null;
}

export function formatKstDate(date = new Date()) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const yyyy = kst.getUTCFullYear();
  const mm = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(kst.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function formatKstRunId(shortSha = 'local', date = new Date()) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const datePart = formatKstDate(date);
  const hh = String(kst.getUTCHours()).padStart(2, '0');
  const mi = String(kst.getUTCMinutes()).padStart(2, '0');
  return `daily-${datePart}-${hh}${mi}-${shortSha.slice(0, 7)}`;
}

export function getKstDayOfWeek(dateStr) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return null;
  const utc = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return utc.getUTCDay(); // 0=Sun, 1=Mon
}

export function sha256File(filePath) {
  const hash = createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

export function sha256String(value) {
  return createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex');
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '0s';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}m ${s}s`;
}

export function safeGit(repoRoot, args) {
  try {
    return execFileSync('git', ['-C', repoRoot, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    }).trim();
  } catch {
    return '';
  }
}

export function getGitMetadata(repoRoot = DEFAULT_REPO_ROOT) {
  const commit = safeGit(repoRoot, ['rev-parse', 'HEAD']) || 'unknown';
  const shortCommit = commit === 'unknown' ? 'unknown' : commit.slice(0, 7);
  const branch = safeGit(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD']) || 'unknown';
  const recentRaw = safeGit(repoRoot, ['log', '--since=24 hours ago', '--format=%h|%an|%s', '-n', '20']);
  const recentCommits = recentRaw
    ? recentRaw.split(/\r?\n/).filter(Boolean).map((line) => {
        const [sha, author, ...subject] = line.split('|');
        return { sha, author, subject: subject.join('|') };
      })
    : [];
  const changedRaw = safeGit(repoRoot, ['log', '--since=24 hours ago', '--name-only', '--pretty=format:']);
  const recentlyChangedFiles = [...new Set(changedRaw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean))].sort();
  const gitlinkLine = safeGit(repoRoot, ['ls-tree', 'HEAD', 'godot-engine']);
  const gitlinkMatch = /commit\s+([a-f0-9]{40})\s+godot-engine/.exec(gitlinkLine);
  const godotSubmodulePin = gitlinkMatch ? gitlinkMatch[1] : null;
  return {
    branch,
    commit,
    shortCommit,
    godotSubmodulePin,
    recentCommits,
    recentlyChangedFiles,
  };
}

export function mapSuspectedOwners(repoRoot, files) {
  const ownersPath = path.join(repoRoot, 'tools', 'worktree-ownership', 'owners.json');
  if (!isExistingFile(ownersPath) || !Array.isArray(files) || !files.length) return [];
  const cfg = JSON.parse(fs.readFileSync(ownersPath, 'utf8'));
  const special = /[.+^${}()|[\]\\]/g;
  const globToRe = (g) =>
    new RegExp(
      '^' +
        g
          .replace(special, (c) => '\\' + c)
          .replace(/\*\*/g, '\u0000')
          .replace(/\*/g, '[^/]*')
          .replace(/\u0000/g, '.*') +
        '$',
    );
  const hits = new Map();
  for (const file of files) {
    const normalized = file.replaceAll('\\', '/');
    for (const [branch, meta] of Object.entries(cfg.branches || {})) {
      if ((meta.owns || []).some((pattern) => globToRe(pattern).test(normalized))) {
        if (!hits.has(branch)) hits.set(branch, { branch, role: meta.role, files: [] });
        hits.get(branch).files.push(normalized);
      }
    }
  }
  return [...hits.values()].sort((a, b) => b.files.length - a.files.length);
}

export function runSubprocess(executable, args, { cwd = DEFAULT_REPO_ROOT, env = process.env, timeoutMs = 600000, logFile = null } = {}) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let settled = false;
    let timedOut = false;
    let logStream = null;
    if (logFile) {
      fs.mkdirSync(path.dirname(logFile), { recursive: true });
      logStream = fs.createWriteStream(logFile, { flags: 'w', encoding: 'utf8' });
    }
    let tail = '';
    const appendOutput = (chunk) => {
      const text = chunk.toString('utf8');
      if (logStream) logStream.write(text);
      tail = (tail + text).slice(-12000);
    };
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (logStream) logStream.end();
      resolve({
        ...result,
        durationMs: Date.now() - startedAt,
        tail: tail.trim(),
        logFile: logFile ? path.resolve(logFile) : null,
      });
    };

    let child;
    try {
      child = spawn(executable, args, {
        cwd,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (err) {
      finish({ exitCode: null, code: 'START_FAILED', error: err.message });
      return;
    }

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill('SIGKILL');
      } catch {
        // ignore
      }
    }, timeoutMs);

    child.stdout?.on('data', appendOutput);
    child.stderr?.on('data', appendOutput);
    child.once('error', (err) => {
      finish({
        exitCode: null,
        code: err.code === 'ENOENT' ? 'TOOL_NOT_FOUND' : 'PROCESS_ERROR',
        error: err.message,
      });
    });
    child.once('close', (exitCode, signal) => {
      finish({
        exitCode,
        signal: signal || null,
        code: timedOut ? 'TIMEOUT' : signal ? 'TERMINATED' : exitCode === 0 ? 'OK' : 'NON_ZERO_EXIT',
      });
    });
  });
}

export function writeJsonAtomic(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  fs.renameSync(tempPath, filePath);
}

export function summarizeStageStatuses(stages) {
  const counts = {
    total: stages.length,
    pass: 0,
    warn: 0,
    fail: 0,
    error: 0,
    skip: 0,
    not_run: 0,
    deferred_to_local: 0,
  };
  for (const stage of stages) {
    if (Object.prototype.hasOwnProperty.call(counts, stage.status)) {
      counts[stage.status] += 1;
    } else {
      counts.error += 1;
    }
  }
  let overallStatus = 'pass';
  if (counts.fail > 0 || counts.error > 0) overallStatus = 'fail';
  else if (counts.skip > 0 || counts.not_run > 0) overallStatus = 'partial';
  else if (counts.warn > 0) overallStatus = 'warn';
  return { counts, overallStatus };
}
