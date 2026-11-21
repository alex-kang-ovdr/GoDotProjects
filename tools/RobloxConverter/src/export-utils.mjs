import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(__dir, '..', '..', '..');

export const CONVERSION_REPORT_FILE = 'conversion_report.json';
export const CONVERSION_REPORT_SCHEMA_PREFIX = 'playforge.roblox.conversion_report.';

function normalizeForCompare(targetPath) {
  const resolved = path.resolve(targetPath);
  const root = path.parse(resolved).root;
  const trimmed = resolved.length > root.length ? resolved.replace(/[\\/]+$/, '') : resolved;
  return process.platform === 'win32' ? trimmed.toLowerCase() : trimmed;
}

function isDriveOrFsRoot(targetPath) {
  const resolved = path.resolve(targetPath);
  const root = path.parse(resolved).root;
  return normalizeForCompare(resolved) === normalizeForCompare(root);
}

function isSameOrParent(candidateParent, targetPath) {
  const p = normalizeForCompare(candidateParent);
  const c = normalizeForCompare(targetPath);
  if (p === c) return true;
  const rel = path.relative(p, c);
  return Boolean(rel) && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function assertNotDangerousPath(candidatePath, inputPath, repoRoot) {
  if (isDriveOrFsRoot(candidatePath)) {
    throw new Error(`Refusing to use drive/filesystem root as output directory: ${candidatePath}`);
  }
  const homeDir = os.homedir();
  if (homeDir && isSameOrParent(candidatePath, homeDir)) {
    throw new Error(`Refusing to use home directory (or its ancestor) as output directory: ${candidatePath}`);
  }
  const tmpDir = os.tmpdir();
  if (tmpDir && isSameOrParent(candidatePath, tmpDir)) {
    throw new Error(`Refusing to use temp root directory (or its ancestor) as output directory: ${candidatePath}`);
  }
  if (repoRoot && isSameOrParent(candidatePath, repoRoot)) {
    throw new Error(`Refusing to use repository root (or its ancestor) as output directory: ${candidatePath}`);
  }
  if (inputPath && isSameOrParent(candidatePath, path.resolve(inputPath))) {
    throw new Error(`Refusing to use input path or its ancestor as output directory: ${candidatePath}`);
  }
}

export function hasConversionOutputMarker(dirPath) {
  const markerPath = path.join(dirPath, CONVERSION_REPORT_FILE);
  if (!fs.existsSync(markerPath)) return false;
  try {
    const stat = fs.lstatSync(markerPath);
    if (!stat.isFile()) return false;
    const parsed = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof parsed.schema === 'string' &&
      parsed.schema.startsWith(CONVERSION_REPORT_SCHEMA_PREFIX)
    );
  } catch {
    return false;
  }
}

export function prepareSafeOutputDir(outDir, inputPath, { repoRoot = DEFAULT_REPO_ROOT } = {}) {
  if (typeof outDir !== 'string' || !outDir.trim()) {
    throw new Error('Output directory must be a non-empty path string');
  }
  const resolvedOut = path.resolve(outDir);
  assertNotDangerousPath(resolvedOut, inputPath, repoRoot);

  if (!fs.existsSync(resolvedOut)) {
    fs.mkdirSync(resolvedOut, { recursive: true });
    return resolvedOut;
  }

  const stat = fs.lstatSync(resolvedOut);
  if (!stat.isDirectory()) {
    throw new Error(`Refusing to overwrite non-directory output path: ${resolvedOut}`);
  }

  const realOut = fs.realpathSync(resolvedOut);
  assertNotDangerousPath(realOut, inputPath, repoRoot);

  if (fs.existsSync(path.join(realOut, '.git'))) {
    throw new Error(`Refusing to clear Git repository root: ${realOut}`);
  }

  const entries = fs.readdirSync(realOut);
  if (entries.length === 0) {
    return resolvedOut;
  }

  if (!hasConversionOutputMarker(realOut)) {
    throw new Error(
      `Refusing to clear non-empty output directory without a valid ${CONVERSION_REPORT_FILE} marker: ${resolvedOut}`
    );
  }

  for (const entry of entries) {
    fs.rmSync(path.join(realOut, entry), { recursive: true, force: true });
  }
  return resolvedOut;
}

export function escapeGodotString(value) {
  return String(value ?? '')
    .replace(/\0/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t');
}
