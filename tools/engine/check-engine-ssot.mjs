#!/usr/bin/env node
/**
 * PlayForge Godot Engine SSOT 검증 CLI.
 * 사용법: node tools/engine/check-engine-ssot.mjs [--strict] [--json]
 *  - 기본 모드: 서브모듈 핀 불일치, .gitmodules 포크 URL 이탈, 미등록 공식 Godot 다운로드 URL 유입,
 *    이미 migrated 전환된 타깃의 순정 회귀, SCons 프로파일 불변식 위반을 즉시 FAIL 처리.
 *  - --strict: pending_fork_rebuild 타깃이 1개라도 남아 있으면 FAIL (전 6대 타깃 마이그레이션 완료 검증용).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadEngineSsot } from './resolve-godot.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function gitOutput(args, cwd = REPO_ROOT) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true }).trim();
}

export function auditEngineSsot({ repoRoot = REPO_ROOT, strict = false } = {}) {
  const ssot = loadEngineSsot();
  const errors = [];
  const warnings = [];
  const targetSummary = [];

  // 1. Submodule gitlink & .gitmodules URL check
  const gitmodulesPath = path.join(repoRoot, '.gitmodules');
  if (!fs.existsSync(gitmodulesPath)) {
    errors.push('.gitmodules file is missing.');
  } else {
    const gm = fs.readFileSync(gitmodulesPath, 'utf8');
    const urlMatch = gm.match(/^\s*url\s*=\s*(.+)$/m);
    const url = urlMatch ? urlMatch[1].trim() : '';
    const forkRe = new RegExp(ssot.forkUrlPattern);
    if (!forkRe.test(url)) {
      errors.push(`.gitmodules submodule url (${url || 'empty'}) does not match fork pattern ${ssot.forkUrlPattern}`);
    }
  }

  let actualSubmoduleCommit = null;
  try {
    const treeLine = gitOutput(['ls-tree', 'HEAD', ssot.submodulePath], repoRoot);
    const m = treeLine.match(/^160000\s+commit\s+([0-9a-f]{40})\s+/);
    actualSubmoduleCommit = m ? m[1] : null;
  } catch (err) {
    errors.push(`Failed to read gitlink for ${ssot.submodulePath}: ${err.message}`);
  }
  if (!actualSubmoduleCommit) {
    errors.push(`Submodule gitlink not found at HEAD for ${ssot.submodulePath}.`);
  } else if (actualSubmoduleCommit !== ssot.pinnedForkCommit) {
    errors.push(
      `Submodule ${ssot.submodulePath} gitlink (${actualSubmoduleCommit}) != engine-ssot.json pinnedForkCommit (${ssot.pinnedForkCommit}). Update engine-ssot.json when intentionally bumping the fork submodule.`
    );
  }
  if (actualSubmoduleCommit === ssot.upstreamBaseCommit) {
    errors.push(`Submodule ${ssot.submodulePath} is pinned to unpatched upstream base commit ${ssot.upstreamBaseCommit}.`);
  }

  // 2. Scan tracked code/config files for forbidden upstream Godot download URLs
  const pendingAllowed = new Set((ssot.knownStockFallbackPending || []).map((p) => p.replace(/\\/g, '/')));
  const foundUpstreamFiles = new Set();
  const trackedFiles = gitOutput(['ls-files'], repoRoot)
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  const ignorePrefixes = ['docs/', 'references/', 'games/', 'forge/Docs/', 'forge/Samples/', 'tools/engine/engine-ssot.json'];
  const textExtRe = /\.(mjs|cjs|js|ts|py|ps1|sh|yml|yaml|json|kt|kts|swift|xcconfig|cfg|gd|txt)$|(^|\/)Dockerfile(\.[^/]+)?$/i;

  for (const rel of trackedFiles) {
    if (ignorePrefixes.some((pfx) => rel === pfx || rel.startsWith(pfx))) continue;
    if (/\.md$/i.test(rel)) continue;
    if (/\.test\.(mjs|cjs|js)$/i.test(rel)) continue;
    if (!textExtRe.test(rel)) continue;
    const abs = path.join(repoRoot, rel);
    if (!fs.existsSync(abs)) continue;
    let content;
    try {
      const stat = fs.statSync(abs);
      if (!stat.isFile() || stat.size > 2 * 1024 * 1024) continue;
      content = fs.readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    for (const pat of ssot.forbiddenUpstreamPatterns || []) {
      if (content.includes(pat)) {
        foundUpstreamFiles.add(rel);
        if (!pendingAllowed.has(rel)) {
          errors.push(`Unregistered official upstream Godot URL (${pat}) found in ${rel}. Use fork release (${ssot.forkRepo}) instead.`);
        }
      }
    }
  }

  // Detect stale knownStockFallbackPending entries (already cleaned up -> remove from ledger)
  for (const p of pendingAllowed) {
    if (!foundUpstreamFiles.has(p)) {
      errors.push(`Stale knownStockFallbackPending entry in engine-ssot.json: ${p} no longer contains upstream Godot URLs — remove it to lock strict mode.`);
    }
  }

  // 3. Target lockfiles & SCons profile invariants
  const profileChecked = new Set();
  for (const [name, target] of Object.entries(ssot.targets || {})) {
    let lockCommit = null;
    if (target.lockPath) {
      const absLock = path.join(repoRoot, target.lockPath);
      if (!fs.existsSync(absLock)) {
        errors.push(`Target "${name}" lockfile missing: ${target.lockPath}`);
      } else {
        const lock = JSON.parse(fs.readFileSync(absLock, 'utf8').replace(/^\uFEFF/, ''));
        lockCommit = lock.forkCommit || null;
        if (target.status === 'migrated' && lockCommit !== ssot.pinnedForkCommit) {
          errors.push(`Migrated target "${name}" lockfile (${target.lockPath}) forkCommit=${lockCommit} != pinnedForkCommit=${ssot.pinnedForkCommit}`);
        } else if (target.status === 'pending_fork_rebuild' && target.expectedForkCommit && lockCommit !== target.expectedForkCommit) {
          if (lockCommit === ssot.pinnedForkCommit) {
            errors.push(`Target "${name}" lockfile already matches pinnedForkCommit! Update engine-ssot.json status to "migrated".`);
          } else {
            errors.push(`Target "${name}" lockfile forkCommit=${lockCommit} differs from expectedForkCommit=${target.expectedForkCommit}`);
          }
        }
      }
    }

    if (target.profilePath && !profileChecked.has(target.profilePath)) {
      profileChecked.add(target.profilePath);
      const absProfile = path.join(repoRoot, target.profilePath);
      if (!fs.existsSync(absProfile)) {
        errors.push(`Target "${name}" SCons profile missing: ${target.profilePath}`);
      } else {
        const src = fs.readFileSync(absProfile, 'utf8');
        for (const flag of ssot.globalProfileInvariants?.mustEnable || []) {
          if (!new RegExp(`^\\s*${flag}\\s*=\\s*["']yes["']`, 'm').test(src)) {
            errors.push(`SCons profile ${target.profilePath} must set ${flag} = "yes"`);
          }
        }
        for (const flag of ssot.globalProfileInvariants?.mustDisable || []) {
          if (!new RegExp(`^\\s*${flag}\\s*=\\s*["']no["']`, 'm').test(src)) {
            errors.push(`SCons profile ${target.profilePath} must disable ${flag} = "no"`);
          }
        }
      }
    }

    if (target.status === 'pending_fork_rebuild') {
      const msg = `Target "${name}" is still pending_fork_rebuild (${target.notes || 'uses stock 4.7.2-stable'}).`;
      if (strict) errors.push(msg);
      else warnings.push(msg);
    }
    targetSummary.push({ target: name, status: target.status, lockCommit, profilePath: target.profilePath || null });
  }

  return {
    ok: errors.length === 0,
    strict,
    submoduleCommit: actualSubmoduleCommit,
    pinnedForkCommit: ssot.pinnedForkCommit,
    targets: targetSummary,
    pendingUpstreamFiles: [...foundUpstreamFiles].sort(),
    warnings,
    errors,
  };
}

const isCli = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isCli) {
  const strict = process.argv.includes('--strict');
  const asJson = process.argv.includes('--json');
  const result = auditEngineSsot({ strict });
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`[engine-ssot] submodule=${result.submoduleCommit?.slice(0, 11) || 'missing'} pinned=${result.pinnedForkCommit.slice(0, 11)} strict=${strict}`);
    for (const t of result.targets) {
      const badge = t.status === 'migrated' ? 'OK  ' : 'PEND';
      console.log(`  [${badge}] ${t.target.padEnd(18)} status=${t.status}${t.lockCommit ? ` lock=${t.lockCommit.slice(0, 11)}` : ''}`);
    }
    for (const w of result.warnings) console.log(`  WARN  ${w}`);
    for (const e of result.errors) console.error(`  FAIL  ${e}`);
    console.log(`[engine-ssot] ${result.ok ? 'PASS' : 'FAIL'} (errors=${result.errors.length}, pending=${result.warnings.length})`);
  }
  process.exit(result.ok ? 0 : 1);
}
