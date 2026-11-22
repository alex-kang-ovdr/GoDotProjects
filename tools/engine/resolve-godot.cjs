'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SSOT_PATH = path.join(__dirname, 'engine-ssot.json');
const inspectCache = new Map();

function loadEngineSsot() {
  return JSON.parse(fs.readFileSync(SSOT_PATH, 'utf8'));
}

function realEngineExecutable(executable) {
  if (!executable) return executable;
  const direct = executable.replace(/_console\.exe$/i, '.exe');
  if (direct !== executable && fs.existsSync(direct)) return direct;
  const directDotConsole = executable.replace(/\.console\.exe$/i, '.exe');
  if (directDotConsole !== executable && fs.existsSync(directDotConsole)) return directDotConsole;
  return executable;
}

function inspectGodotBinary(executable) {
  const realPath = realEngineExecutable(path.resolve(executable));
  if (!fs.existsSync(realPath) || !fs.statSync(realPath).isFile()) {
    return { exists: false, executable: realPath, hasPlayForgeCore: false, matchedSymbols: [] };
  }
  const stat = fs.statSync(realPath);
  const cacheKey = `${realPath}:${stat.size}:${stat.mtimeMs}`;
  if (inspectCache.has(cacheKey)) return inspectCache.get(cacheKey);

  let requiredSymbols = ['PlayForgePlatform', 'playforge-core-pack'];
  try {
    const ssot = loadEngineSsot();
    if (Array.isArray(ssot.requiredForkSymbols) && ssot.requiredForkSymbols.length > 0) {
      requiredSymbols = ssot.requiredForkSymbols;
    }
  } catch { /* fallback defaults */ }

  const buf = fs.readFileSync(realPath);
  const matchedSymbols = requiredSymbols.filter((sym) => buf.includes(Buffer.from(sym, 'ascii')));
  const result = {
    exists: true,
    executable: realPath,
    bytes: stat.size,
    hasPlayForgeCore: matchedSymbols.length === requiredSymbols.length,
    matchedSymbols,
  };
  inspectCache.set(cacheKey, result);
  return result;
}

function collectRepoRoots(searchFrom, { searchOnly = false } = {}) {
  const roots = new Set();
  const seeds = [];
  if (Array.isArray(searchFrom)) seeds.push(...searchFrom);
  else if (typeof searchFrom === 'string' && searchFrom) seeds.push(searchFrom);
  if (!searchOnly) {
    seeds.push(path.resolve(__dirname, '../..'), process.cwd());
  }

  for (const seed of seeds) {
    let cursor = path.resolve(seed);
    const maxDepth = searchOnly ? 1 : 6;
    for (let i = 0; i < maxDepth; i += 1) {
      roots.add(cursor);
      const parent = path.dirname(cursor);
      if (parent === cursor) break;
      cursor = parent;
    }
  }
  return [...roots];
}

function selectBinaryFromDir(dir, patterns) {
  if (!dir || !fs.existsSync(dir)) return null;
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return null;
  }
  for (const pattern of patterns) {
    const matched = entries.filter((name) => pattern.test(name)).sort().at(-1);
    if (matched) {
      const full = path.join(dir, matched);
      if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
    }
  }
  return null;
}

/**
 * Single SSOT Godot binary resolver.
 * Priority:
 *   1. Explicit override (options.godotBin / GODOT_BIN / GODOT_CONSOLE_BIN / GODOT_EDITOR)
 *   2. Custom fork builds (godot-engine/bin, artifacts/local-runtime/godot-fork, sibling Forge-GodotEngine/bin)
 *   3. Stock fallback (artifacts/local-runtime/godot, GoDotProjects/Godot_v4.*, PATH) — blocked if requireFork: true
 */
function resolveGodotBinary(options = {}) {
  const env = options.env || process.env;
  const preferConsole = options.preferConsole === true;
  const requireFork = options.requireFork === true;
  const verifySymbols = options.verifySymbols === true || requireFork;
  const isWin = (options.platform || process.platform) === 'win32';

  const finalize = (rawPath, source) => {
    const executable = preferConsole ? rawPath : realEngineExecutable(rawPath);
    const inspection = verifySymbols ? inspectGodotBinary(executable) : null;
    const isFork = inspection
      ? inspection.hasPlayForgeCore
      : source === 'fork-discovered';
    if (requireFork && !isFork) {
      return {
        found: false,
        executable: null,
        source,
        isFork: false,
        reason: `PlayForge custom fork binary (modules/playforge_core) is required, but resolved binary is stock Godot: ${executable}`,
      };
    }
    return {
      found: true,
      executable,
      source,
      isFork,
      ...(inspection ? { matchedSymbols: inspection.matchedSymbols } : {}),
    };
  };

  // 1. Explicit override
  const explicitList = [
    options.godotBin,
    env.GODOT_BIN,
    ...(preferConsole ? [env.GODOT_CONSOLE_BIN, env.GODOT_EDITOR] : [env.GODOT_EDITOR, env.GODOT_CONSOLE_BIN]),
  ].filter(Boolean);

  for (const candidate of explicitList) {
    const resolved = path.resolve(candidate);
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      return finalize(resolved, 'explicit');
    }
    return {
      found: false,
      executable: null,
      source: 'explicit',
      isFork: false,
      reason: `Configured Godot executable not found: ${resolved}`,
    };
  }

  const roots = collectRepoRoots(options.searchFrom, { searchOnly: options.searchOnly === true });

  // 2. Custom fork build directories (SSOT priority)
  const forkDirs = [];
  for (const r of roots) {
    forkDirs.push(path.join(r, 'godot-engine', 'bin'));
    forkDirs.push(path.join(r, 'artifacts', 'local-runtime', 'godot-fork'));
    forkDirs.push(path.join(r, 'Forge-GodotEngine', 'bin'));
  }

  const forkPatterns = isWin
    ? (preferConsole
      ? [
          /^godot\.windows\.editor\.x86_64\.console\.exe$/i,
          /^godot\.windows\.editor\.x86_64\.exe$/i,
          /^godot\.windows\.template_release\.x86_64\.console\.exe$/i,
          /^godot\.windows\.template_release\.x86_64\.exe$/i,
          /^godot\.windows\.template_debug\.x86_64\.console\.exe$/i,
          /^godot\.windows\.template_debug\.x86_64\.exe$/i,
        ]
      : [
          /^godot\.windows\.editor\.x86_64\.exe$/i,
          /^godot\.windows\.template_release\.x86_64\.exe$/i,
          /^godot\.windows\.template_debug\.x86_64\.exe$/i,
        ])
    : [
        /^godot\.linuxbsd\.editor\.x86_64$/i,
        /^godot\.linuxbsd\.template_release\.x86_64$/i,
        /^godot\.linuxbsd\.template_debug\.x86_64$/i,
      ];

  for (const dir of new Set(forkDirs)) {
    const hit = selectBinaryFromDir(dir, forkPatterns);
    if (hit) {
      if (requireFork) {
        const check = inspectGodotBinary(hit);
        if (!check.hasPlayForgeCore) continue;
      }
      return finalize(hit, 'fork-discovered');
    }
  }

  if (requireFork) {
    return {
      found: false,
      executable: null,
      source: null,
      isFork: false,
      reason: 'PlayForge custom Godot fork binary not found in godot-engine/bin, artifacts/local-runtime/godot-fork, or Forge-GodotEngine/bin. Set GODOT_BIN to a custom fork build.',
    };
  }

  // 3. Stock fallback directories
  const stockDirs = [];
  for (const r of roots) {
    stockDirs.push(path.join(r, 'artifacts', 'local-runtime', 'godot'));
    stockDirs.push(r);
    stockDirs.push(path.join(r, 'GoDotProjects'));
  }

  const stockPatterns = isWin
    ? (preferConsole
      ? [/^Godot_v4\..*_win64_console\.exe$/i, /^Godot_v4\..*_win64\.exe$/i]
      : [/^Godot_v4\..*_win64_console\.exe$/i, /^Godot_v4\..*_win64\.exe$/i])
    : [/^Godot_v4\..*linux.*$/i, /^godot4?$/i];

  for (const dir of new Set(stockDirs)) {
    const hit = selectBinaryFromDir(dir, stockPatterns);
    if (hit) return finalize(hit, 'stock-fallback');
  }

  // 4. PATH lookup
  const lookupCmd = isWin ? 'where.exe' : 'which';
  for (const binName of ['godot4', 'godot']) {
    const probe = spawnSync(lookupCmd, [binName], { encoding: 'utf8', windowsHide: true });
    if (probe.status === 0 && probe.stdout) {
      const firstLine = probe.stdout.trim().split(/\r?\n/)[0];
      if (firstLine && fs.existsSync(firstLine)) {
        return finalize(firstLine, 'path');
      }
    }
  }

  return {
    found: false,
    executable: null,
    source: null,
    isFork: false,
    reason: 'Godot 4.7+ executable was not found. Build godot-engine submodule or set GODOT_BIN.',
  };
}

module.exports = {
  SSOT_PATH,
  loadEngineSsot,
  realEngineExecutable,
  inspectGodotBinary,
  resolveGodotBinary,
};
