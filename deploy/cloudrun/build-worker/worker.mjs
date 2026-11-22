import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const forgeToolsDir = path.join(repoRoot, 'forge', 'Tools');

const { zipFiles } = require(path.join(forgeToolsDir, 'export-godot-project.cjs'));
const { validateDeploymentZip } = require(path.join(forgeToolsDir, 'deployment-zip-validator.cjs'));
const { isSealedAvatarPath } = require(path.join(forgeToolsDir, 'avatar-seal.cjs'));

const PLAYHUB_SHELL_PATH = path.join(forgeToolsDir, 'playhub-godot-shell.js');
const PLAYHUB_SHELL_TAG = '<script src="playhub-godot-shell.js"></script>';

const WEB_EXPORT_PRESET = `[preset.0]
name="Web"
platform="Web"
runnable=true
export_filter="all_resources"
include_filter="*.json,*.txt,*.glb"
exclude_filter="addons/playforge_platform/*,addons/playforge_replay/*,addons/playforge_agent_chat/*,addons/playforge_remote_control/*,addons/playforge_service/*,addons/playforge_asset_store/*,.playforge_backups/*"
export_path=""
script_export_mode=0
[preset.0.options]
variant/extensions_support=false
variant/thread_support=false
vram_texture_compression/for_desktop=true
vram_texture_compression/for_mobile=false
html/export_icon=true
html/canvas_resize_policy=2
html/focus_canvas_on_start=true
progressive_web_app/enabled=false
`;

const SAFE_CHILD_ENV_KEYS = new Set([
  'PATH',
  'HOME',
  'USER',
  'LANG',
  'LC_ALL',
  'TERM',
  'TMPDIR',
  'TEMP',
  'TMP',
  'XDG_DATA_HOME',
  'XDG_CONFIG_HOME',
  'XDG_CACHE_HOME',
  'SystemRoot',
  'COMSPEC',
]);

/** Build a scrubbed environment for the untrusted Godot child process. */
export function buildScrubbedChildEnv(baseEnv = process.env, workHome = os.homedir()) {
  const clean = {};
  for (const key of SAFE_CHILD_ENV_KEYS) {
    if (typeof baseEnv[key] === 'string' && baseEnv[key].length > 0) {
      clean[key] = baseEnv[key];
    }
  }
  clean.HOME = workHome;
  clean.XDG_CONFIG_HOME = path.join(workHome, '.config');
  clean.XDG_CACHE_HOME = path.join(workHome, '.cache');
  clean.XDG_DATA_HOME = path.join(workHome, '.local', 'share');
  return clean;
}

/** Validate and materialize snapshot files safely inside projectDir. */
export function materializeSnapshot(snapshot, projectDir) {
  if (!snapshot || !Array.isArray(snapshot.files) || snapshot.files.length === 0) {
    throw new Error('snapshot.files must be a non-empty array');
  }
  const root = path.resolve(projectDir);
  fs.mkdirSync(root, { recursive: true });

  for (const entry of snapshot.files) {
    const rel = String(entry?.path || '');
    if (!rel || rel.length > 240 || path.isAbsolute(rel) || /[\\:\x00-\x1f\x7f]/.test(rel)) {
      throw new Error(`Unsafe snapshot file path: ${rel}`);
    }
    const parts = rel.split('/');
    if (parts.some(seg => !seg || seg === '.' || seg === '..')) {
      throw new Error(`Path traversal rejected: ${rel}`);
    }
    if (isSealedAvatarPath(rel)) continue;

    const target = path.resolve(root, rel);
    if (target !== root && !target.startsWith(root + path.sep)) {
      throw new Error(`Path escaped project root: ${rel}`);
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (entry.encoding === 'base64') {
      fs.writeFileSync(target, Buffer.from(String(entry.content || ''), 'base64'));
    } else {
      fs.writeFileSync(target, String(entry.content ?? ''), 'utf8');
    }
  }

  fs.writeFileSync(path.join(root, 'export_presets.cfg'), WEB_EXPORT_PRESET, 'utf8');
}

function injectPlayHubShell(outputDir) {
  const indexPath = path.join(outputDir, 'index.html');
  if (!fs.existsSync(indexPath) || !fs.existsSync(PLAYHUB_SHELL_PATH)) return false;
  fs.copyFileSync(PLAYHUB_SHELL_PATH, path.join(outputDir, 'playhub-godot-shell.js'));
  const html = fs.readFileSync(indexPath, 'utf8');
  if (html.includes('playhub-godot-shell.js')) return true;
  const patched = /<\/head>/i.test(html)
    ? html.replace(/<\/head>/i, `  ${PLAYHUB_SHELL_TAG}\n</head>`)
    : /<\/body>/i.test(html)
      ? html.replace(/<\/body>/i, `  ${PLAYHUB_SHELL_TAG}\n</body>`)
      : `${html}\n${PLAYHUB_SHELL_TAG}\n`;
  fs.writeFileSync(indexPath, patched, 'utf8');
  return true;
}

function runGodotCommand(godotBin, args, { cwd, env, timeoutMs = 120000 }) {
  return new Promise((resolve, reject) => {
    const child = spawn(godotBin, args, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    const append = chunk => {
      output = (output + chunk.toString()).slice(-1000000);
    };
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    child.once('error', err => {
      clearTimeout(timer);
      reject(err);
    });
    child.once('close', code => {
      clearTimeout(timer);
      if (timedOut) {
        reject(Object.assign(new Error('Godot build timed out'), { log: output }));
      } else if (code !== 0 || /SCRIPT ERROR:|ERROR:/.test(output)) {
        reject(Object.assign(new Error(`Godot build failed (exit ${code})`), { log: output }));
      } else {
        resolve(output);
      }
    });
  });
}

const SHARED_ENGINE_FILENAMES = new Set([
  'index.wasm',
  'index.js',
  'index.audio.worklet.js',
  'index.audio.position.worklet.js',
  'index.service.worker.js',
  'index.side.wasm',
]);

/**
 * Rewrite Godot 4.7.2 Web export index.html so the game loads the shared immutable
 * engine runtime (godot.js + godot.wasm + worklets) from sharedRuntimeBase while
 * loading only its own lightweight index.pck from the per-release UGC folder.
 */
export function rewriteHtmlForSharedRuntime(html, sharedRuntimeBase) {
  const base = String(sharedRuntimeBase || '').trim().replace(/\/+$/, '');
  if (!base || !base.startsWith('/') || base.includes('..') || /[\s"'<>]/.test(base)) {
    throw new Error(`Invalid sharedRuntimeBase: ${sharedRuntimeBase}`);
  }
  let out = String(html);
  out = out.replace(
    /<script\s+src=["'](?:\.\/)?index\.js["']\s*><\/script>/i,
    `<script src="${base}/godot.js"></script>`
  );
  const cfgRe = /const\s+GODOT_CONFIG\s*=\s*(\{[\s\S]*?\})\s*;/;
  const match = cfgRe.exec(out);
  if (!match) {
    throw new Error('Failed to locate GODOT_CONFIG in Godot Web export index.html');
  }
  const cfg = JSON.parse(match[1]);
  cfg.executable = `${base}/godot`;
  cfg.mainPack = 'index.pck';
  if (cfg.fileSizes && typeof cfg.fileSizes === 'object') {
    if (Object.hasOwn(cfg.fileSizes, 'index.wasm')) {
      cfg.fileSizes[`${base}/godot.wasm`] = cfg.fileSizes['index.wasm'];
      delete cfg.fileSizes['index.wasm'];
    }
  }
  out = out.replace(cfgRe, `const GODOT_CONFIG = ${JSON.stringify(cfg)};`);
  return out;
}

const DEFAULT_GODOT_WASM_BYTES = 39514754;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

/** Generate a lightweight Godot 4.7.2 Web shell HTML referencing the shared immutable runtime. */
export function buildSharedRuntimeHtml({ title = 'PlayHub Game', sharedRuntimeBase, mainPackBytes = 0, engineWasmBytes = DEFAULT_GODOT_WASM_BYTES } = {}) {
  const base = String(sharedRuntimeBase || '').trim().replace(/\/+$/, '');
  if (!base || !base.startsWith('/') || base.includes('..') || /[\s"'<>]/.test(base)) {
    throw new Error(`Invalid sharedRuntimeBase: ${sharedRuntimeBase}`);
  }
  const godotConfig = {
    args: [],
    canvasResizePolicy: 2,
    emscriptenPoolSize: 8,
    ensureCrossOriginIsolationHeaders: false,
    executable: `${base}/godot`,
    mainPack: 'index.pck',
    experimentalVK: false,
    fileSizes: {
      'index.pck': Number(mainPackBytes) || 0,
      [`${base}/godot.wasm`]: Number(engineWasmBytes) || DEFAULT_GODOT_WASM_BYTES,
    },
    focusCanvas: true,
    gdextensionLibs: [],
    godotPoolSize: 4,
  };
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, user-scalable=no, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
html, body, #canvas { margin: 0; padding: 0; border: 0; }
body { color: #fff; background: #000; overflow: hidden; touch-action: none; }
#canvas { display: block; }
#canvas:focus { outline: none; }
#status { position: absolute; inset: 0; background: #181c24; display: flex; flex-direction: column; justify-content: center; align-items: center; font-family: system-ui, sans-serif; }
#status-progress { width: 50%; max-width: 360px; }
#status-notice { display: none; margin: 1rem 2rem; padding: 1rem; border-radius: 8px; background: #5b3943; color: #f3e6ea; }
  </style>
  <script src="playhub-godot-shell.js"></script>
</head>
<body>
  <canvas id="canvas">Your browser does not support the canvas tag.</canvas>
  <div id="status">
    <progress id="status-progress"></progress>
    <div id="status-notice"></div>
  </div>
  <script src="${base}/godot.js"></script>
  <script>
const GODOT_CONFIG = ${JSON.stringify(godotConfig)};
const engine = new Engine(GODOT_CONFIG);
(function () {
  const statusOverlay = document.getElementById('status');
  const statusProgress = document.getElementById('status-progress');
  const statusNotice = document.getElementById('status-notice');
  function fail(err) {
    console.error(err);
    statusProgress.style.display = 'none';
    statusNotice.style.display = 'block';
    statusNotice.textContent = err instanceof Error ? err.message : String(err || 'Failed to start game');
  }
  const missing = Engine.getMissingFeatures({ threads: false });
  if (missing.length) {
    fail('Missing browser features: ' + missing.join(', '));
    return;
  }
  engine.startGame({
    onProgress: function (current, total) {
      if (current > 0 && total > 0) { statusProgress.value = current; statusProgress.max = total; }
      else { statusProgress.removeAttribute('value'); statusProgress.removeAttribute('max'); }
    }
  }).then(function () { statusOverlay.remove(); }, fail);
}());
  </script>
</body>
</html>
`;
}

/** Execute one isolated build from a snapshot object and return { result, zipBuffer }. */
export async function executeIsolatedBuild(snapshot, options = {}) {
  const godotBin = options.godotBin || process.env.GODOT_BIN || '/usr/local/bin/godot';
  const godotPrefixArgs = Array.isArray(options.godotPrefixArgs) ? options.godotPrefixArgs : [];
  const timeoutMs = Number(options.timeoutMs || process.env.BUILD_TIMEOUT_MS || 120000);
  const rawSharedRuntimeBase = options.sharedRuntimeBase !== undefined
    ? options.sharedRuntimeBase
    : (process.env.PLAYFORGE_SHARED_WEB_RUNTIME_BASE || '');
  const sharedRuntimeBase = snapshot?.packaging === 'standalone'
    ? ''
    : String(rawSharedRuntimeBase || '').trim().replace(/\/+$/, '');
  const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'playforge-p0-build-'));
  const projectDir = path.join(workRoot, 'project');
  const outputDir = path.join(workRoot, 'output');
  fs.mkdirSync(outputDir, { recursive: true });

  const startedAt = new Date().toISOString();
  const canonicalFiles = Array.isArray(snapshot?.files)
    ? [...snapshot.files].sort((a, b) => String(a.path).localeCompare(String(b.path), 'en'))
    : [];
  const sourceHash = crypto.createHash('sha256').update(JSON.stringify(canonicalFiles)).digest('hex');

  const result = {
    id: snapshot?.buildId || crypto.randomBytes(8).toString('hex'),
    target: 'web',
    projectId: snapshot?.id || null,
    revision: snapshot?.revision ?? null,
    ownerKey: snapshot?.ownerKey || null,
    sourceHash,
    status: 'running',
    startedAt,
    finishedAt: null,
    log: '',
    files: [],
  };

  try {
    materializeSnapshot({ ...snapshot, files: canonicalFiles }, projectDir);
    const childEnv = buildScrubbedChildEnv(options.baseEnv || process.env, options.workHome || os.homedir());

    const importLog = await runGodotCommand(
      godotBin,
      [...godotPrefixArgs, '--headless', '--path', projectDir, '--editor', '--import', '--quit'],
      { cwd: projectDir, env: childEnv, timeoutMs }
    );
    let exportLog = '';
    let engineWasmBytes = DEFAULT_GODOT_WASM_BYTES;
    let mainPackBytes = 0;
    let packaging = 'standalone';
    let shellInjected = false;

    if (sharedRuntimeBase) {
      // Fast thin-UGC path: export ONLY index.pck (skips unpacking 39.5 MB Web template into Cloud Run tmpfs RAM)
      exportLog = await runGodotCommand(
        godotBin,
        [...godotPrefixArgs, '--headless', '--path', projectDir, '--export-pack', 'Web', path.join(outputDir, 'index.pck')],
        { cwd: projectDir, env: childEnv, timeoutMs }
      );
      result.log = (importLog + '\n' + exportLog).slice(-12000);

      for (const name of fs.readdirSync(outputDir)) {
        if (fs.lstatSync(path.join(outputDir, name)).isSymbolicLink()) {
          throw new Error(`Symbolic link rejected in build output: ${name}`);
        }
      }
      const pckPath = path.join(outputDir, 'index.pck');
      if (!fs.existsSync(pckPath) || !fs.lstatSync(pckPath).isFile()) {
        throw new Error('Godot did not produce required Web file: index.pck');
      }
      mainPackBytes = fs.statSync(pckPath).size;
      const html = buildSharedRuntimeHtml({
        title: snapshot?.name || 'PlayHub Game',
        sharedRuntimeBase,
        mainPackBytes,
        engineWasmBytes,
      });
      fs.writeFileSync(path.join(outputDir, 'index.html'), html, 'utf8');
      shellInjected = injectPlayHubShell(outputDir);
      const ugcManifest = {
        schemaVersion: 2,
        packaging: 'modular-thin-ugc',
        sharedRuntimeBase,
        executable: `${sharedRuntimeBase}/godot`,
        mainPack: 'index.pck',
        engineWasmBytes,
        mainPackBytes,
        projectId: result.projectId,
        revision: result.revision,
      };
      fs.writeFileSync(path.join(outputDir, 'ugc.manifest.json'), JSON.stringify(ugcManifest, null, 2) + '\n', 'utf8');
      packaging = 'modular-thin-ugc';
    } else {
      exportLog = await runGodotCommand(
        godotBin,
        [...godotPrefixArgs, '--headless', '--path', projectDir, '--export-release', 'Web', path.join(outputDir, 'index.html')],
        { cwd: projectDir, env: childEnv, timeoutMs }
      );
      result.log = (importLog + '\n' + exportLog).slice(-12000);

      for (const name of fs.readdirSync(outputDir)) {
        if (fs.lstatSync(path.join(outputDir, name)).isSymbolicLink()) {
          throw new Error(`Symbolic link rejected in build output: ${name}`);
        }
      }

      for (const reqFile of ['index.html', 'index.wasm', 'index.pck']) {
        const reqPath = path.join(outputDir, reqFile);
        if (!fs.existsSync(reqPath) || !fs.lstatSync(reqPath).isFile()) {
          throw new Error(`Godot did not produce required Web file: ${reqFile}`);
        }
      }
      shellInjected = injectPlayHubShell(outputDir);
      engineWasmBytes = fs.statSync(path.join(outputDir, 'index.wasm')).size;
      mainPackBytes = fs.statSync(path.join(outputDir, 'index.pck')).size;
    }
    const names = fs.readdirSync(outputDir)
      .filter(name => {
        if (name === 'PlayForge-Web.zip') return false;
        if (packaging === 'modular-thin-ugc' && SHARED_ENGINE_FILENAMES.has(name.toLowerCase())) return false;
        const st = fs.lstatSync(path.join(outputDir, name));
        if (st.isSymbolicLink()) {
          throw new Error(`Symbolic link rejected in build output: ${name}`);
        }
        return st.isFile();
      })
      .sort();
    const zipBuffer = zipFiles(names.map(name => [name, fs.readFileSync(path.join(outputDir, name))]));
    const validation = validateDeploymentZip(zipBuffer);

    result.status = 'succeeded';
    result.finishedAt = new Date().toISOString();
    result.packaging = packaging;
    if (sharedRuntimeBase) result.sharedRuntimeBase = sharedRuntimeBase;
    result.engineWasmBytes = engineWasmBytes;
    result.mainPackBytes = mainPackBytes;
    result.files = [...names, 'PlayForge-Web.zip'];
    result.artifactSha256 = validation.sha256;
    result.bytes = validation.bytes;
    result.expandedBytes = validation.expandedBytes;
    result.entryCount = validation.entries;
    result.sdkBridgeVersion = shellInjected ? 'playhub-godot-shell-v1' : null;

    return { result, zipBuffer };
  } catch (err) {
    result.status = 'failed';
    result.finishedAt = new Date().toISOString();
    result.error = err.message;
    if (err.log) result.log = String(err.log).slice(-12000);
    return { result, zipBuffer: null };
  } finally {
    fs.rmSync(workRoot, { recursive: true, force: true });
  }
}

async function runCli() {
  const inputUrl = process.env.BUILD_INPUT_URL || '';
  const outputZipUrl = process.env.BUILD_OUTPUT_ZIP_URL || '';
  const resultUrl = process.env.BUILD_RESULT_URL || '';
  const inputFile = process.env.BUILD_INPUT_FILE || '';
  const outputDir = process.env.BUILD_OUTPUT_DIR || '';

  let snapshot;
  if (inputFile) {
    snapshot = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  } else if (inputUrl) {
    const res = await fetch(inputUrl);
    if (!res.ok) throw new Error(`Failed to fetch snapshot (${res.status})`);
    snapshot = await res.json();
  } else {
    throw new Error('Set BUILD_INPUT_URL (Cloud Run Job) or BUILD_INPUT_FILE (local test)');
  }

  const { result, zipBuffer } = await executeIsolatedBuild(snapshot);

  if (outputDir) {
    fs.mkdirSync(outputDir, { recursive: true });
    if (zipBuffer) fs.writeFileSync(path.join(outputDir, 'PlayForge-Web.zip'), zipBuffer);
    fs.writeFileSync(path.join(outputDir, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  }

  if (zipBuffer && outputZipUrl) {
    const putZip = await fetch(outputZipUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/zip' },
      body: zipBuffer,
    });
    if (!putZip.ok) throw new Error(`Failed to upload PlayForge-Web.zip (${putZip.status})`);
  }

  if (resultUrl) {
    const putRes = await fetch(resultUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result, null, 2),
    });
    if (!putRes.ok) throw new Error(`Failed to upload result.json (${putRes.status})`);
  }

  console.log(JSON.stringify({
    event: 'p0_build_worker_done',
    buildId: result.id,
    status: result.status,
    artifactSha256: result.artifactSha256 || null,
    bytes: result.bytes || 0,
  }));

  if (result.status !== 'succeeded') process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli().catch(err => {
    console.error('p0_build_worker_fatal:', err.message);
    process.exit(1);
  });
}
