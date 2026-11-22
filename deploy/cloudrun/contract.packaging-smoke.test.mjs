import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build as buildHubDist } from '../../hub/tools/build.mjs';
import { TOOLS as PORTABLE_SEA_TOOLS, createBundle as createPortableSeaBundle } from '../../hub/portable/build-sea.mjs';

const require = createRequire(import.meta.url);
const portableLauncher = require('../../hub/portable/launcher.cjs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

function toPosix(p) {
  return p.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
}

/**
 * Parse a .dockerignore file into ordered { negate, pattern, regex } rules
 * matching Docker BuildKit / moby/patternmatcher semantics.
 */
function parseDockerignore(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const rules = [];
  for (const rawLine of raw.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    let negate = false;
    let pattern = trimmed;
    if (pattern.startsWith('!')) {
      negate = true;
      pattern = pattern.slice(1).trim();
    }
    pattern = pattern.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
    if (!pattern) continue;
    rules.push({ negate, pattern, regex: dockerignorePatternToRegex(pattern) });
  }
  return rules;
}

function dockerignorePatternToRegex(pattern) {
  let out = '^';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        if (pattern[i + 2] === '/') {
          out += '(?:.*/)?';
          i += 2;
        } else {
          out += '.*';
          i += 1;
        }
      } else {
        out += '[^/]*';
      }
    } else if (ch === '?') {
      out += '[^/]';
    } else if (/[.+^${}()|[\]\\]/.test(ch)) {
      out += '\\' + ch;
    } else {
      out += ch;
    }
  }
  out += '$';
  return new RegExp(out);
}

function pathPrefixes(relPosix) {
  const clean = toPosix(relPosix);
  if (!clean) return [];
  const parts = clean.split('/').filter(Boolean);
  const prefixes = [];
  for (let i = 1; i <= parts.length; i++) {
    prefixes.push(parts.slice(0, i).join('/'));
  }
  return prefixes;
}

function isIgnoredByDockerignore(relPosix, rules) {
  const prefixes = pathPrefixes(relPosix);
  if (!prefixes.length) return false;
  let ignored = false;
  for (const rule of rules) {
    // Docker patternmatcher evaluates both the path and any parent directory prefix.
    if (prefixes.some(prefix => rule.regex.test(prefix))) {
      ignored = !rule.negate;
    }
  }
  return ignored;
}

/**
 * Parse COPY instructions from a Dockerfile (skipping multi-stage `COPY --from=...`).
 * Returns array of { lineNumber, sources: string[], dest: string }.
 */
function parseDockerfileCopies(dockerfilePath) {
  const raw = fs.readFileSync(dockerfilePath, 'utf8');
  const lines = raw.split(/\r?\n/);
  const logicalLines = [];
  let buf = '';
  let startLine = 1;

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    if (!buf) {
      const stripped = line.trim();
      if (!stripped || stripped.startsWith('#')) continue;
      startLine = idx + 1;
    }
    if (/\\\s*$/.test(line)) {
      buf += line.replace(/\\\s*$/, ' ');
    } else {
      buf += line;
      logicalLines.push({ lineNumber: startLine, text: buf.trim() });
      buf = '';
    }
  }
  if (buf.trim()) {
    logicalLines.push({ lineNumber: startLine, text: buf.trim() });
  }

  const copies = [];
  for (const { lineNumber, text } of logicalLines) {
    if (!/^COPY\s+/i.test(text)) continue;
    let rest = text.replace(/^COPY\s+/i, '').trim();
    let isFromStage = false;
    while (rest.startsWith('--')) {
      const m = rest.match(/^(--[^\s]+)\s+([\s\S]*)$/);
      if (!m) break;
      if (m[1].toLowerCase().startsWith('--from=')) isFromStage = true;
      rest = m[2].trim();
    }
    if (isFromStage) continue;

    let tokens;
    if (rest.startsWith('[')) {
      tokens = JSON.parse(rest);
    } else {
      tokens = rest.split(/\s+/).filter(Boolean);
    }
    assert.ok(tokens.length >= 2, `Invalid COPY instruction at ${dockerfilePath}:${lineNumber}: ${text}`);
    const dest = tokens[tokens.length - 1];
    const sources = tokens.slice(0, -1).map(toPosix);
    copies.push({ lineNumber, sources, dest });
  }
  return copies;
}

/**
 * Strip JS comments while preserving string literals & template literals.
 */
function stripJsComments(code) {
  let out = '';
  let i = 0;
  const len = code.length;
  while (i < len) {
    const ch = code[i];
    const next = code[i + 1];
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      out += ch;
      i++;
      while (i < len) {
        const c = code[i];
        out += c;
        if (c === '\\') {
          if (i + 1 < len) out += code[i + 1];
          i += 2;
          continue;
        }
        i++;
        if (c === quote) break;
      }
      continue;
    }
    if (ch === '/' && next === '/') {
      i += 2;
      while (i < len && code[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < len && !(code[i] === '*' && code[i + 1] === '/')) {
        if (code[i] === '\n') out += '\n';
        i++;
      }
      i += 2;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

function extractRelativeSpecifiers(filePath, { includeDynamic = true } = {}) {
  const cleaned = stripJsComments(fs.readFileSync(filePath, 'utf8'));
  const specs = new Set();
  const patterns = [
    /\b(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    ...(includeDynamic ? [/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g] : []),
    /\b(?:require|localRequire|createRequire)\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(cleaned)) !== null) {
      const spec = m[1];
      if (spec.startsWith('./') || spec.startsWith('../')) {
        specs.add(spec);
      }
    }
  }
  return [...specs];
}

function resolveModuleFile(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = [
    base,
    `${base}.mjs`,
    `${base}.cjs`,
    `${base}.js`,
    path.join(base, 'index.mjs'),
    path.join(base, 'index.cjs'),
    path.join(base, 'index.js'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return base;
}

function walkJsFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkJsFiles(full));
    else if (/\.(mjs|cjs|js)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function isCoveredByCopySources(relPosix, copySources) {
  const target = toPosix(relPosix);
  return copySources.some(src => target === src || target.startsWith(`${src}/`));
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(err => (err ? reject(err) : resolve(port)));
    });
  });
}

function waitForExit(child, timeoutMs = 4000) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch {}
      resolve();
    }, timeoutMs);
    timer.unref();
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

test('TC-2.1: Dockerfile COPY sources are never blocked by Dockerfile.dockerignore or shared .dockerignore', () => {
  const sharedIgnorePath = path.join(repoRoot, 'deploy/cloudrun/.dockerignore');
  const sharedRules = parseDockerignore(sharedIgnorePath);

  // Sanity self-checks so the .dockerignore matcher cannot degrade into a no-op
  assert.equal(isIgnoredByDockerignore('tools/worktree-ownership/check-ownership.mjs', sharedRules), true);
  assert.equal(isIgnoredByDockerignore('tools/build-version/index.mjs', sharedRules), false);
  assert.equal(isIgnoredByDockerignore('tools/ugc-shared/index.mjs', sharedRules), false);
  assert.equal(isIgnoredByDockerignore('hub/data/playhub.sqlite', sharedRules), true);
  assert.equal(isIgnoredByDockerignore('hub/tests/backend.http.test.mjs', sharedRules), true);
  assert.equal(isIgnoredByDockerignore('forge/Deploy/release.zip', sharedRules), true);

  // Build-generated output that is created right before `docker build` in CI (not committed to git)
  const buildGeneratedSources = new Set(['hub/dist']);

  const targets = [
    {
      name: 'hub',
      dockerfile: path.join(repoRoot, 'deploy/cloudrun/hub/Dockerfile'),
      ignoreFile: path.join(repoRoot, 'deploy/cloudrun/hub/Dockerfile.dockerignore'),
    },
    {
      name: 'forge',
      dockerfile: path.join(repoRoot, 'deploy/cloudrun/forge/Dockerfile'),
      ignoreFile: path.join(repoRoot, 'deploy/cloudrun/forge/Dockerfile.dockerignore'),
    },
    {
      name: 'build-worker',
      dockerfile: path.join(repoRoot, 'deploy/cloudrun/build-worker/Dockerfile'),
      ignoreFile: path.join(repoRoot, 'deploy/cloudrun/build-worker/Dockerfile.dockerignore'),
    },
  ];

  for (const target of targets) {
    assert.ok(fs.existsSync(target.dockerfile), `Missing Dockerfile for ${target.name}`);
    assert.ok(fs.existsSync(target.ignoreFile), `Missing Dockerfile.dockerignore for ${target.name}`);

    const specificRules = parseDockerignore(target.ignoreFile);
    const copies = parseDockerfileCopies(target.dockerfile);
    assert.ok(copies.length > 0, `Expected at least one COPY instruction in ${target.name} Dockerfile`);

    for (const copy of copies) {
      for (const src of copy.sources) {
        assert.equal(
          isIgnoredByDockerignore(src, specificRules),
          false,
          `${target.name} Dockerfile:${copy.lineNumber} COPY source "${src}" is blocked by ${path.relative(repoRoot, target.ignoreFile)}`
        );
        assert.equal(
          isIgnoredByDockerignore(src, sharedRules),
          false,
          `${target.name} Dockerfile:${copy.lineNumber} COPY source "${src}" is blocked by deploy/cloudrun/.dockerignore`
        );
        if (!buildGeneratedSources.has(src)) {
          const abs = path.join(repoRoot, src);
          assert.ok(
            fs.existsSync(abs),
            `${target.name} Dockerfile:${copy.lineNumber} COPY source "${src}" does not exist on disk`
          );
        }
      }
    }
  }
});

test('TC-2.2: All cross-directory relative imports/requires from Hub & Cloud Run entrypoint are covered by hub/Dockerfile COPY', () => {
  const hubDockerfile = path.join(repoRoot, 'deploy/cloudrun/hub/Dockerfile');
  const hubIgnore = parseDockerignore(path.join(repoRoot, 'deploy/cloudrun/hub/Dockerfile.dockerignore'));
  const sharedIgnore = parseDockerignore(path.join(repoRoot, 'deploy/cloudrun/.dockerignore'));
  const copySources = parseDockerfileCopies(hubDockerfile).flatMap(c => c.sources);

  const scannedFiles = [
    ...walkJsFiles(path.join(repoRoot, 'hub/server')),
    ...walkJsFiles(path.join(repoRoot, 'deploy/cloudrun/hub')),
    path.join(repoRoot, 'hub/tools/runtime-output.cjs'),
    path.join(repoRoot, 'hub/tools/backup.mjs'),
    path.join(repoRoot, 'hub/tools/restore-data.mjs'),
    path.join(repoRoot, 'hub/tools/store-proxy.mjs'),
    // Transitive runtime modules copied into the Hub container
    ...walkJsFiles(path.join(repoRoot, 'store/server')),
    ...walkJsFiles(path.join(repoRoot, 'tools/build-version')),
  ];

  assert.ok(scannedFiles.length >= 40, `Expected >=40 runtime files to scan, got ${scannedFiles.length}`);

  const outsideHubImports = [];
  const hubToolImports = [];

  for (const filePath of scannedFiles) {
    assert.ok(fs.existsSync(filePath), `Expected runtime source file to exist: ${filePath}`);
    const fromRel = toPosix(path.relative(repoRoot, filePath));
    for (const spec of extractRelativeSpecifiers(filePath)) {
      const resolvedAbs = resolveModuleFile(filePath, spec);
      const targetRel = toPosix(path.relative(repoRoot, resolvedAbs));

      // Verify any relative import escaping hub/ (or entering hub/tools/) is packaged in hub/Dockerfile
      const escapesHub = !targetRel.startsWith('hub/');
      const targetsHubTool = targetRel.startsWith('hub/tools/');
      if (!escapesHub && !targetsHubTool) continue;

      assert.ok(
        fs.existsSync(resolvedAbs),
        `Broken relative import in ${fromRel}: "${spec}" -> "${targetRel}" does not exist`
      );
      assert.ok(
        isCoveredByCopySources(targetRel, copySources),
        `Cross-directory import "${targetRel}" (referenced by ${fromRel} via "${spec}") is NOT covered by any COPY in deploy/cloudrun/hub/Dockerfile`
      );
      assert.equal(
        isIgnoredByDockerignore(targetRel, hubIgnore),
        false,
        `Cross-directory import "${targetRel}" (referenced by ${fromRel}) is blocked by deploy/cloudrun/hub/Dockerfile.dockerignore`
      );
      assert.equal(
        isIgnoredByDockerignore(targetRel, sharedIgnore),
        false,
        `Cross-directory import "${targetRel}" (referenced by ${fromRel}) is blocked by deploy/cloudrun/.dockerignore`
      );

      if (escapesHub) outsideHubImports.push({ from: fromRel, target: targetRel });
      if (targetsHubTool) hubToolImports.push({ from: fromRel, target: targetRel });
    }
  }

  // Ensure the static scanner actually found the known cross-directory runtime boundaries
  assert.ok(
    outsideHubImports.some(x => x.target.startsWith('tools/build-version/')),
    'Expected cross-directory import to tools/build-version/*'
  );
  assert.ok(
    outsideHubImports.some(x => x.target.startsWith('forge/Tools/')),
    'Expected cross-directory import to forge/Tools/*'
  );
  assert.ok(
    outsideHubImports.some(x => x.target.startsWith('store/server/')),
    'Expected cross-directory import to store/server/*'
  );
  assert.ok(
    outsideHubImports.some(x => x.target.startsWith('store/web/')),
    'Expected transitive cross-directory import to store/web/*'
  );
  assert.ok(
    hubToolImports.some(x => x.target === 'hub/tools/runtime-output.cjs'),
    'Expected hub/tools/runtime-output.cjs reference'
  );
});

test('TC-2.3: Staged Dockerfile COPY isolation boot smoke test with PLAYHUB_SECURE_COOKIES=true & PLAYHUB_PUBLIC_ORIGIN', async t => {
  const hubDockerfile = path.join(repoRoot, 'deploy/cloudrun/hub/Dockerfile');
  const hubIgnore = parseDockerignore(path.join(repoRoot, 'deploy/cloudrun/hub/Dockerfile.dockerignore'));
  const copies = parseDockerfileCopies(hubDockerfile);

  const stagingRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-cr-stage-'));
  const runtimeTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-cr-runtime-'));
  const stagedNodeModules = path.join(stagingRoot, 'hub', 'node_modules');
  let child = null;

  t.after(async () => {
    if (child) {
      try { child.kill('SIGTERM'); } catch {}
      await waitForExit(child, 5000);
    }
    // Always remove symlink/junction first before recursively removing stagingRoot
    try {
      if (fs.lstatSync(stagedNodeModules).isSymbolicLink()) {
        fs.rmSync(stagedNodeModules, { force: true });
      }
    } catch {}
    fs.rmSync(stagingRoot, { recursive: true, force: true, maxRetries: 6, retryDelay: 150 });
    fs.rmSync(runtimeTmp, { recursive: true, force: true, maxRetries: 6, retryDelay: 150 });
  });

  // 1. Replicate every COPY instruction from deploy/cloudrun/hub/Dockerfile into isolated stagingRoot
  for (const copy of copies) {
    for (const src of copy.sources) {
      const destRel = toPosix(copy.dest);
      const destAbs = path.resolve(stagingRoot, destRel);
      assert.ok(
        destAbs === stagingRoot || destAbs.startsWith(stagingRoot + path.sep),
        `COPY destination escapes staging root: ${copy.dest}`
      );

      if (src === 'hub/dist') {
        // Build fresh static dist directly into stagingRoot (works even in CI before `node hub/tools/build.mjs`)
        fs.mkdirSync(path.dirname(destAbs), { recursive: true });
        buildHubDist({ root: path.join(repoRoot, 'hub'), outputDir: destAbs });
        continue;
      }

      const srcAbs = path.join(repoRoot, src);
      fs.mkdirSync(path.dirname(destAbs), { recursive: true });
      fs.cpSync(srcAbs, destAbs, {
        recursive: true,
        filter(candidate) {
          const rel = toPosix(path.relative(repoRoot, candidate));
          return !isIgnoredByDockerignore(rel, hubIgnore);
        },
      });
    }
  }

  // Symlink/junction hub/node_modules if present (never mutating repo)
  const repoNodeModules = path.join(repoRoot, 'hub', 'node_modules');
  if (fs.existsSync(repoNodeModules) && !fs.existsSync(stagedNodeModules)) {
    fs.symlinkSync(repoNodeModules, stagedNodeModules, process.platform === 'win32' ? 'junction' : 'dir');
  }

  // Replicate Dockerfile RUN step generating ./BUILD_INFO.json inside staged container root
  const hubPkg = JSON.parse(fs.readFileSync(path.join(stagingRoot, 'hub/package.json'), 'utf8'));
  execFileSync(
    process.execPath,
    [
      'tools/build-version/resolve-build-info.mjs',
      '--target', 'hub',
      '--semver', hubPkg.version,
      '--channel', 'dev',
      '--build-num', '0',
      '--branch', 'playhub-platform',
      '--commit', '0000000',
      '--update-policy', 'optional',
      '--clean',
      '--out-json', './BUILD_INFO.json',
    ],
    { cwd: stagingRoot, stdio: 'pipe' }
  );
  assert.ok(fs.existsSync(path.join(stagingRoot, 'BUILD_INFO.json')), 'Expected BUILD_INFO.json in staging root');

  // 2. Boot deploy/cloudrun/hub/entrypoint.mjs from the isolated stagingRoot as cwd
  const port = await getFreePort();
  const publicOrigin = 'https://smoke.playhub.test';
  const cleanEnv = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (k.startsWith('PLAYHUB_') || k === 'K_SERVICE' || k === 'K_REVISION' || k === 'PORT' || k === 'HOST') continue;
    cleanEnv[k] = v;
  }

  child = spawn(process.execPath, ['deploy/cloudrun/hub/entrypoint.mjs'], {
    cwd: stagingRoot,
    env: {
      ...cleanEnv,
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: String(port),
      PLAYHUB_ROLE: 'public',
      PLAYHUB_SECURE_COOKIES: 'true',
      PLAYHUB_PUBLIC_ORIGIN: publicOrigin,
      PLAYHUB_DATA_DIR: path.join(runtimeTmp, 'data'),
      PLAYHUB_FORGE_DIR: path.join(runtimeTmp, 'forge'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  const startupMeta = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Staged Cloud Run Hub entrypoint timed out.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    }, 15000);
    timer.unref();

    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
      for (const line of stdout.split(/\r?\n/)) {
        if (!line.includes('cloudrun_hub_listening')) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.event === 'cloudrun_hub_listening') {
            clearTimeout(timer);
            resolve(parsed);
            return;
          }
        } catch {}
      }
    });
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      reject(new Error(`Staged entrypoint exited early (code=${code}, signal=${signal}).\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    });
  });

  assert.equal(startupMeta.role, 'public');
  assert.equal(startupMeta.port, port);
  assert.equal(startupMeta.publicOrigin, publicOrigin);
  assert.equal(startupMeta.storeProxyEnabled, true, `Embedded store must start in staged container; stderr=${stderr}`);

  const base = `http://127.0.0.1:${port}`;

  // 3. Measure & assert every Cloud Run edge + Hub + embedded Store contract endpoint
  const healthzRes = await fetch(`${base}/_healthz`);
  assert.equal(healthzRes.status, 200);
  const healthz = await healthzRes.json();
  assert.equal(healthz.ok, true);
  assert.equal(healthz.role, 'public');

  const indexRes = await fetch(`${base}/`);
  assert.equal(indexRes.status, 200);
  assert.equal(
    indexRes.headers.has('cross-origin-opener-policy'),
    false,
    'Hub root must NOT set Cross-Origin-Opener-Policy (would break Google OAuth popups)'
  );
  const indexHtml = await indexRes.text();
  assert.match(indexHtml, /<html/i);

  const configRes = await fetch(`${base}/config.js`);
  assert.equal(configRes.status, 200);
  const configJs = await configRes.text();
  assert.ok(configJs.includes('location.origin'), `Expected /config.js to reference location.origin, got: ${configJs}`);
  assert.ok(configJs.includes('"mode":"cloud-run"'));

  const apiHealthRes = await fetch(`${base}/api/health`);
  assert.equal(apiHealthRes.status, 200);
  const apiHealth = await apiHealthRes.json();
  assert.equal(apiHealth.ok, true);
  assert.equal(apiHealth.service, 'public');

  const versionRes = await fetch(`${base}/api/version`);
  assert.equal(versionRes.status, 200);
  const version = await versionRes.json();
  assert.equal(version.ok, true);
  assert.ok(version.buildInfo?.buildId);
  assert.ok(version.buildInfo?.buildCode);
  assert.ok(version.buildInfo?.compat?.engineAbi);

  // /api/compat/check: matching version -> 200 COMPAT_ALLOW
  const compatOkRes = await fetch(`${base}/api/compat/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      target: 'hub',
      buildCode: version.buildInfo.buildCode,
      engineAbi: version.buildInfo.compat.engineAbi,
      engineApiRev: version.buildInfo.compat.engineApiRev,
      netProtocol: version.buildInfo.compat.netProtocol,
      gameplayHash: version.buildInfo.compat.gameplayHash,
    }),
  });
  assert.equal(compatOkRes.status, 200);
  const compatOk = await compatOkRes.json();
  assert.equal(compatOk.decision, 'COMPAT_ALLOW');

  // /api/compat/check: stale engineAbi godot-4.6 -> 426 COMPAT_BLOCK_FORCE_UPDATE
  const compatBlockRes = await fetch(`${base}/api/compat/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      target: 'aos',
      buildCode: version.buildInfo.buildCode,
      engineAbi: 'godot-4.6',
    }),
  });
  assert.equal(compatBlockRes.status, 426);
  const compatBlock = await compatBlockRes.json();
  assert.equal(compatBlock.decision, 'COMPAT_BLOCK_FORCE_UPDATE');

  // /api/avatar/catalog (verifies forge/Godot/addons/playforge_avatar COPY!)
  const avatarCatRes = await fetch(`${base}/api/avatar/catalog`);
  assert.equal(avatarCatRes.status, 200);
  const avatarCat = await avatarCatRes.json();
  assert.equal(avatarCat.ok, true);
  assert.equal(avatarCat.currency, 'PlayCoin');
  assert.ok(Array.isArray(avatarCat.items) && avatarCat.items.length > 0);

  // Embedded PlayForge Asset Store (/store/ + /api/store/catalog)
  const storePageRes = await fetch(`${base}/store/`);
  assert.equal(storePageRes.status, 200);

  const storeCatRes = await fetch(`${base}/api/store/catalog?limit=2`, {
    headers: { Origin: publicOrigin },
  });
  assert.equal(storeCatRes.status, 200);
  const storeCat = await storeCatRes.json();
  assert.ok((storeCat.total ?? storeCat.items?.length ?? 0) >= 1, 'Store catalog must return seeded assets');

  // Store proxy rejects unknown Origin with 403 ORIGIN_DENIED
  const storeEvilOrigin = await fetch(`${base}/api/store/catalog?limit=1`, {
    headers: { Origin: 'https://evil.invalid' },
  });
  assert.equal(storeEvilOrigin.status, 403);
  const storeEvilBody = await storeEvilOrigin.json();
  assert.equal(storeEvilBody.error?.code, 'ORIGIN_DENIED');

  // /PlayForge/ redirect -> 302 /forge/OfficialGodot/
  const forgeRedirRes = await fetch(`${base}/PlayForge/`, { redirect: 'manual' });
  assert.equal(forgeRedirRes.status, 302);
  assert.equal(forgeRedirRes.headers.get('location'), '/forge/OfficialGodot/');

  // Public edge strictly blocks /api/admin/* and /internal/session/verify with 404
  const adminHealthRes = await fetch(`${base}/api/admin/health`);
  assert.equal(adminHealthRes.status, 404);

  const internalVerifyGet = await fetch(`${base}/internal/session/verify`);
  assert.equal(internalVerifyGet.status, 404);
  const internalVerifyPost = await fetch(`${base}/internal/session/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert.equal(internalVerifyPost.status, 404);

  // Verify PLAYHUB_PUBLIC_ORIGIN & PLAYHUB_SECURE_COOKIES are active in staged container
  const sessionRes = await fetch(`${base}/api/session`, {
    headers: { Origin: publicOrigin },
  });
  assert.equal(sessionRes.status, 200);
  assert.equal(sessionRes.headers.get('access-control-allow-origin'), publicOrigin);
  const setCookies = sessionRes.headers.getSetCookie();
  assert.ok(setCookies.some(c => /;\s*Secure\b/i.test(c) && /;\s*HttpOnly\b/i.test(c)), 'Expected Secure + HttpOnly session cookie');

  const evilOriginMutation = await fetch(`${base}/api/auth/guest`, {
    method: 'POST',
    headers: { Origin: 'https://evil.invalid', 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert.equal(evilOriginMutation.status, 403);
  const evilBody = await evilOriginMutation.json();
  assert.equal(evilBody.error?.code, 'ORIGIN_DENIED');
});

test('TC-2.4: Portable SEA bundle (TOOLS + createBundle) packages all hub/tools and hub/server internal tool imports without missing modules', async t => {
  const hubRoot = path.join(repoRoot, 'hub');

  // 1. Validate exported TOOLS list integrity
  assert.ok(Array.isArray(PORTABLE_SEA_TOOLS) && PORTABLE_SEA_TOOLS.length > 0, 'Expected non-empty TOOLS array from hub/portable/build-sea.mjs');
  const toolSet = new Set(PORTABLE_SEA_TOOLS);
  assert.equal(toolSet.size, PORTABLE_SEA_TOOLS.length, 'TOOLS array in build-sea.mjs must not contain duplicates');
  for (const requiredTool of ['build.mjs', 'dev.mjs', 'forge-proxy.mjs', 'store-proxy.mjs', 'backup.mjs', 'runtime-output.cjs', 'setup.mjs', 'smoke.mjs', 'check-stack.mjs', 'restore-data.mjs', 'preview-ports.ps1']) {
    assert.ok(toolSet.has(requiredTool), `Expected "${requiredTool}" in hub/portable/build-sea.mjs TOOLS`);
  }
  for (const tool of PORTABLE_SEA_TOOLS) {
    const absTool = path.join(hubRoot, 'tools', tool);
    assert.ok(fs.existsSync(absTool) && fs.statSync(absTool).isFile(), `TOOLS entry "${tool}" does not exist at ${absTool}`);
  }

  // 2. Stage a real portable hub tree (real server/web/shared/portable/tools/config + lightweight fixture game, no forge/ directory)
  const stagingBase = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-sea-contract-'));
  t.after(() => fs.rmSync(stagingBase, { recursive: true, force: true, maxRetries: 6, retryDelay: 150 }));

  const stagedHub = path.join(stagingBase, 'hub');
  fs.mkdirSync(path.join(stagedHub, 'config'), { recursive: true });
  fs.mkdirSync(path.join(stagedHub, 'games', 'fixture-game'), { recursive: true });
  fs.mkdirSync(path.join(stagedHub, 'catalog'), { recursive: true });
  fs.copyFileSync(path.join(hubRoot, 'package.json'), path.join(stagedHub, 'package.json'));
  fs.copyFileSync(path.join(hubRoot, 'config', 'example.json'), path.join(stagedHub, 'config', 'example.json'));
  for (const dir of ['server', 'web', 'shared', 'portable', 'tools']) {
    fs.cpSync(path.join(hubRoot, dir), path.join(stagedHub, dir), {
      recursive: true,
      filter(candidate) {
        const base = path.basename(candidate);
        return !base.startsWith('.') && base !== 'node_modules' && !/\.exe$/i.test(base);
      },
    });
  }
  const repoUgcShared = path.join(repoRoot, 'tools', 'ugc-shared');
  if (fs.existsSync(repoUgcShared)) {
    fs.cpSync(repoUgcShared, path.join(stagingBase, 'tools', 'ugc-shared'), { recursive: true });
  }
  fs.writeFileSync(path.join(stagedHub, 'games', 'fixture-game', 'index.html'), '<!doctype html><title>Fixture</title>');
  fs.writeFileSync(path.join(stagedHub, 'catalog', 'games.json'), JSON.stringify({ schemaVersion: 1, entries: [] }));

  // 3. Build real SEA bundle via createBundle() and collect every bundled path
  const bundle = createPortableSeaBundle({ root: stagedHub, nodeLicenseText: 'PlayHub SEA contract test Node license' });
  const bundledPaths = new Set(bundle.manifest.files.map(f => f.path));

  for (const tool of PORTABLE_SEA_TOOLS) {
    assert.ok(bundledPaths.has(`tools/${tool}`), `createBundle() did not package TOOLS entry "tools/${tool}"`);
  }

  // 4. Exhaustive static import/require scan across hub/server/**, hub/portable/* (runtime), and bundled hub/tools/*
  const portableRuntimeFiles = fs.readdirSync(path.join(hubRoot, 'portable'))
    .filter(name => /\.mjs$/.test(name) && name !== 'build-sea.mjs')
    .map(name => path.join(hubRoot, 'portable', name));
  const bundledToolJsFiles = PORTABLE_SEA_TOOLS
    .filter(name => /\.(?:mjs|cjs|js)$/.test(name))
    .map(name => path.join(hubRoot, 'tools', name));
  const scannedHubFiles = [
    ...walkJsFiles(path.join(hubRoot, 'server')),
    ...portableRuntimeFiles,
    ...bundledToolJsFiles,
  ];
  assert.ok(scannedHubFiles.length >= 60, `Expected >=60 portable runtime JS files to scan, got ${scannedHubFiles.length}`);

  const toolEdges = [];
  for (const filePath of scannedHubFiles) {
    const fromHubRel = toPosix(path.relative(hubRoot, filePath));
    assert.ok(bundledPaths.has(fromHubRel), `Scanned runtime file "${fromHubRel}" is missing from createBundle() manifest`);

    for (const spec of extractRelativeSpecifiers(filePath, { includeDynamic: false })) {
      const resolvedAbs = resolveModuleFile(filePath, spec);
      const targetHubRel = toPosix(path.relative(hubRoot, resolvedAbs));
      // Relative imports that escape hub/ (e.g. ../../forge/Tools/*) are optional or verified in TC-2.2.
      if (targetHubRel.startsWith('../') || targetHubRel === '..' || path.isAbsolute(targetHubRel)) continue;

      assert.ok(
        fs.existsSync(resolvedAbs),
        `Broken static import in hub/${fromHubRel}: "${spec}" -> "hub/${targetHubRel}" does not exist`
      );
      assert.ok(
        bundledPaths.has(targetHubRel),
        `Portable SEA bundle is missing "${targetHubRel}" (statically imported by hub/${fromHubRel} via "${spec}")`
      );
      if (targetHubRel.startsWith('tools/')) {
        const toolName = targetHubRel.slice('tools/'.length);
        assert.ok(
          toolSet.has(toolName),
          `hub/${fromHubRel} imports "tools/${toolName}" (via "${spec}"), which is missing from hub/portable/build-sea.mjs TOOLS`
        );
        toolEdges.push({ from: fromHubRel, target: targetHubRel });
      }
    }
  }

  // Also verify runtime dynamic tools/* path references in hub/portable/*.mjs (e.g. tools/dev.mjs, tools/setup.mjs, tools/smoke.mjs, tools/preview-ports.ps1)
  for (const filePath of portableRuntimeFiles) {
    const fromHubRel = toPosix(path.relative(hubRoot, filePath));
    const cleaned = stripJsComments(fs.readFileSync(filePath, 'utf8'));
    const refRe = /['"]tools\/([A-Za-z0-9._-]+)['"]/g;
    let m;
    while ((m = refRe.exec(cleaned)) !== null) {
      const toolName = m[1];
      assert.ok(
        toolSet.has(toolName) && bundledPaths.has(`tools/${toolName}`),
        `Portable runtime file hub/${fromHubRel} references "tools/${toolName}", which is not in build-sea.mjs TOOLS / bundle`
      );
    }
  }

  // Sanity assertions ensuring static scanner actually observed all known critical tool boundaries
  for (const [from, target] of [
    ['tools/dev.mjs', 'tools/forge-proxy.mjs'],
    ['tools/dev.mjs', 'tools/store-proxy.mjs'],
    ['tools/dev.mjs', 'tools/runtime-output.cjs'],
    ['server/admin-console.mjs', 'tools/backup.mjs'],
    ['server/index.mjs', 'tools/runtime-output.cjs'],
    ['portable/prepare.mjs', 'tools/build.mjs'],
  ]) {
    assert.ok(
      toolEdges.some(edge => edge.from === from && edge.target === target),
      `Expected portable static scanner to detect ${from} -> ${target}`
    );
  }

  // 5. Extract bundle into a standalone instance (no forge/ or repo tools/build-version/) and verify ESM imports + ForgeGateway fallback
  const instanceRoot = path.join(stagingBase, 'standalone-instance');
  const extracted = portableLauncher.extractBundle(bundle.buffer, instanceRoot);
  for (const entry of ['tools/dev.mjs', 'tools/build.mjs', 'portable/launch.mjs', 'portable/prepare.mjs', 'portable/workers.mjs']) {
    const mod = await import(pathToFileURL(path.join(extracted.appRoot, entry)).href);
    assert.ok(mod && typeof mod === 'object', `Expected extracted standalone module "${entry}" to import cleanly`);
  }
  const gwMod = await import(pathToFileURL(path.join(extracted.appRoot, 'server/forge-gateway.mjs')).href);
  const gw = gwMod.createLocalForgeGateway({ config: { enabled: false }, root: path.dirname(extracted.appRoot) });
  try {
    assert.deepEqual(gw.adminSnapshot(), {
      templates: [],
      projects: [],
      builds: [],
      driveSync: {
        snapshots: { total: 0, committed: 0, verified: 0, pending: 0, failed: 0 },
        submissions: { total: 0, committed: 0, verified: 0, pending: 0, failed: 0 },
        deployments: { total: 0, committed: 0, verified: 0, pending: 0, failed: 0 },
      },
      serverPresent: false,
      officialEditorPresent: false,
    });
  } finally {
    gw.close();
  }
});
