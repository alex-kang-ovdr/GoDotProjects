import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CORE_DIR = path.dirname(fileURLToPath(import.meta.url));
export const GAMERQA_ROOT = path.resolve(CORE_DIR, '..');

function isProjectRoot(dir) {
  return (
    fs.existsSync(path.join(dir, 'games', 'catalog.json')) &&
    fs.existsSync(path.join(dir, 'tools', 'Gamer', 'GamerQA'))
  );
}

/**
 * Resolve the repository/worktree root without hardcoding any machine-specific absolute path.
 */
export function resolveProjectRoot(explicitRoot, env = process.env, cwd = process.cwd()) {
  if (explicitRoot) {
    const resolved = path.resolve(cwd, explicitRoot);
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
      throw new Error(`Project root does not exist or is not a directory: ${resolved}`);
    }
    return resolved;
  }

  const envRoot = env.GAMERQA_PROJECT_ROOT || env.PLAYHUB_PROJECT_ROOT;
  if (envRoot) {
    const resolved = path.resolve(cwd, envRoot);
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
      throw new Error(`Configured project root does not exist: ${resolved}`);
    }
    return resolved;
  }

  for (const startDir of [GAMERQA_ROOT, cwd]) {
    let cursor = path.resolve(startDir);
    for (let depth = 0; depth < 8; depth++) {
      if (isProjectRoot(cursor)) return cursor;
      const parent = path.dirname(cursor);
      if (parent === cursor) break;
      cursor = parent;
    }
  }

  // Fallback relative to tools/Gamer/GamerQA (3 levels up)
  const fallback = path.resolve(GAMERQA_ROOT, '..', '..', '..');
  if (fs.existsSync(path.join(fallback, 'games'))) return fallback;

  throw new Error('Could not resolve PlayHub project root. Pass --project-root <dir>.');
}

/**
 * Resolve a review policy JSON path from either version name ("v1") or path.
 */
export function resolvePolicyPath(policyOpt = 'v1', cwd = process.cwd()) {
  const value = String(policyOpt || 'v1').trim();
  const byVersion = path.join(GAMERQA_ROOT, 'policies', `review-policy.${value.replace(/^review-policy\./, '')}.json`);
  if (/^v\d+(?:\.\d+)*$/i.test(value) && fs.existsSync(byVersion)) {
    return byVersion;
  }
  const direct = path.resolve(cwd, value);
  if (fs.existsSync(direct)) return direct;
  const inPolicies = path.join(GAMERQA_ROOT, 'policies', value);
  if (fs.existsSync(inPolicies)) return inPolicies;
  throw new Error(`Review policy file not found: ${value}`);
}
