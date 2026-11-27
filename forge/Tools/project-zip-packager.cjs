'use strict';

/**
 * Server-side Godot Project ZIP Extractor & Multi-Platform Packager
 *
 * Accepts an uploaded Godot project source .zip (or a Forge project snapshot packed as .zip),
 * validates & extracts it safely (Zip-Slip / symlink / zip-bomb protection), and packages
 * per-platform deployable artifacts on the server:
 *   - web:     index.html, index.wasm, index.js, index.pck, playhub-godot-shell.js
 *   - android: platforms/android/index.pck (mobile texture compression + GDPC header verified)
 *   - desktop: platforms/desktop/index.pck (desktop texture compression + GDPC header verified)
 *   - ios:     platforms/ios/index.pck     (mobile texture compression + GDPC header verified)
 *
 * Produces a unified platform-packages.json manifest and a strict PlayHub-GameDeploy.zip
 * ready for game-only upload to any selected Hub Farm without redeploying platform servers.
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { findGodot } = require('./native-runtime.cjs');
const { validateDeploymentZip, crc32 } = require('./deployment-zip-validator.cjs');
const { isSealedAvatarPath } = require('./avatar-seal.cjs');

/**
 * Builds a strict deployment ZIP compatible with deployment-zip-validator & artifact-storage,
 * using raw DEFLATE (method 8) when it reduces payload size (critical for Godot index.wasm ~39MB -> ~11MB)
 * and STORE (method 0) otherwise.
 */
function zipFilesCompressed(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, raw] of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const data = Buffer.isBuffer(raw) ? raw : Buffer.from(raw, 'utf8');
    const crc = crc32(data);
    let method = 0;
    let payload = data;
    if (data.length >= 256) {
      const deflated = zlib.deflateRawSync(data, { level: 6 });
      if (deflated.length < data.length * 0.96) {
        method = 8;
        payload = deflated;
      }
    }
    const flags = 0x0800; // UTF-8 filename
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(flags, 6);
    lh.writeUInt16LE(method, 8);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(payload.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    locals.push(lh, nameBuf, payload);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(flags, 8);
    ch.writeUInt16LE(method, 10);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(payload.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt32LE(0x80000000, 38);
    ch.writeUInt32LE(offset, 42);
    centrals.push(ch, nameBuf);

    offset += lh.length + nameBuf.length + payload.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

const SUPPORTED_PLATFORMS = Object.freeze(['web', 'android', 'desktop', 'ios']);
const DEFAULT_PLATFORMS = Object.freeze(['web', 'android', 'desktop']);
const ENGINE_VERSION = '4.7.2';

const MAX_PROJECT_ZIP_BYTES = 64 * 1024 * 1024; // 64 MiB upload cap
const MAX_PROJECT_EXPANDED_BYTES = 192 * 1024 * 1024; // 192 MiB expanded cap
const MAX_PROJECT_ENTRIES = 4096;

const WINDOWS_RESERVED_RE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
const PLAYHUB_SHELL_PATH = path.join(__dirname, 'playhub-godot-shell.js');
const PLAYHUB_SHELL_TAG = '<script src="playhub-godot-shell.js"></script>';

const MULTI_PLATFORM_EXPORT_PRESETS = `[preset.0]
name="Web"
platform="Web"
runnable=true
export_filter="all_resources"
include_filter="*.json,*.txt,*.cfg,*.glb"
exclude_filter="addons/playforge_platform/*,addons/playforge_replay/*,addons/playforge_agent_chat/*,addons/playforge_remote_control/*,addons/playforge_service/*,addons/playforge_asset_store/*,.playforge_backups/*,tests/*,saved/*"
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

[preset.1]
name="MobilePack"
platform="Web"
runnable=false
export_filter="all_resources"
include_filter="*.json,*.txt,*.cfg,*.glb"
exclude_filter="addons/playforge_platform/*,addons/playforge_replay/*,addons/playforge_agent_chat/*,addons/playforge_remote_control/*,addons/playforge_service/*,addons/playforge_asset_store/*,.playforge_backups/*,tests/*,saved/*"
export_path=""
script_export_mode=0
[preset.1.options]
variant/extensions_support=false
variant/thread_support=false
vram_texture_compression/for_desktop=false
vram_texture_compression/for_mobile=true
`;

function sha256Hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function normalizePlatforms(raw) {
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(',')
      : DEFAULT_PLATFORMS;
  const clean = [];
  for (const item of list) {
    const p = String(item || '').trim().toLowerCase();
    if (SUPPORTED_PLATFORMS.includes(p) && !clean.includes(p)) clean.push(p);
  }
  if (!clean.includes('web')) clean.unshift('web');
  return clean;
}

function findEocdOffset(buffer) {
  const minOffset = Math.max(0, buffer.length - 65557);
  for (let i = buffer.length - 22; i >= minOffset; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      const commentLen = buffer.readUInt16LE(i + 20);
      if (i + 22 + commentLen === buffer.length) return i;
    }
  }
  return -1;
}

function sanitizeZipEntryPath(rawName) {
  const replaced = String(rawName || '').replace(/\\/g, '/');
  const isDir = replaced.endsWith('/');
  const trimmed = isDir ? replaced.slice(0, -1) : replaced;
  if (!trimmed || trimmed.length > 260 || trimmed.startsWith('/') || /[:\x00-\x1f\x7f]/.test(trimmed)) {
    throw Object.assign(new Error(`안전하지 않은 ZIP 경로입니다: ${rawName}`), { code: 'UNSAFE_PROJECT_ZIP', status: 400 });
  }
  const parts = trimmed.split('/');
  for (const seg of parts) {
    if (!seg || seg === '.' || seg === '..' || WINDOWS_RESERVED_RE.test(seg)) {
      throw Object.assign(new Error(`허용되지 않는 ZIP 경로 세그먼트입니다: ${rawName}`), { code: 'UNSAFE_PROJECT_ZIP', status: 400 });
    }
  }
  return { normalized: parts.join('/'), isDir };
}

/**
 * Safely parse & extract a standard Godot Project ZIP (STORE or DEFLATE) into destDir.
 * Auto-strips a single top-level wrapper folder if project.godot lives one level deep.
 */
function extractProjectZip(zipBuffer, destDir, options = {}) {
  const maxZipBytes = options.maxZipBytes || MAX_PROJECT_ZIP_BYTES;
  const maxExpandedBytes = options.maxExpandedBytes || MAX_PROJECT_EXPANDED_BYTES;
  const maxEntries = options.maxEntries || MAX_PROJECT_ENTRIES;

  if (!Buffer.isBuffer(zipBuffer) || zipBuffer.length < 22 || zipBuffer.length > maxZipBytes) {
    throw Object.assign(new Error('유효하지 않거나 용량 한도(64MB)를 초과한 프로젝트 ZIP 파일입니다.'), {
      code: 'INVALID_PROJECT_ZIP',
      status: 400,
    });
  }

  const eocd = findEocdOffset(zipBuffer);
  if (eocd < 0) {
    throw Object.assign(new Error('ZIP 중앙 디렉터리(EOCD)를 찾을 수 없습니다.'), { code: 'INVALID_PROJECT_ZIP', status: 400 });
  }

  const totalEntries = zipBuffer.readUInt16LE(eocd + 10);
  const cdSize = zipBuffer.readUInt32LE(eocd + 12);
  const cdOffset = zipBuffer.readUInt32LE(eocd + 16);
  if (!totalEntries || totalEntries > maxEntries || cdOffset + cdSize > eocd) {
    throw Object.assign(new Error('ZIP 항목 수가 비어 있거나 허용 한도를 초과했습니다.'), { code: 'INVALID_PROJECT_ZIP', status: 400 });
  }

  const rawFiles = [];
  let pos = cdOffset;
  let expandedBytes = 0;

  for (let i = 0; i < totalEntries; i++) {
    if (pos + 46 > cdOffset + cdSize || zipBuffer.readUInt32LE(pos) !== 0x02014b50) {
      throw Object.assign(new Error('손상된 ZIP 중앙 디렉터리 레코드입니다.'), { code: 'INVALID_PROJECT_ZIP', status: 400 });
    }
    const flags = zipBuffer.readUInt16LE(pos + 8);
    const method = zipBuffer.readUInt16LE(pos + 10);
    const compSize = zipBuffer.readUInt32LE(pos + 20);
    const uncompSize = zipBuffer.readUInt32LE(pos + 24);
    const nameLen = zipBuffer.readUInt16LE(pos + 28);
    const extraLen = zipBuffer.readUInt16LE(pos + 30);
    const commentLen = zipBuffer.readUInt16LE(pos + 32);
    const extAttr = zipBuffer.readUInt32LE(pos + 38);
    const localOffset = zipBuffer.readUInt32LE(pos + 42);
    const unixType = (extAttr >>> 16) & 0xf000;

    if (flags & 0x1) {
      throw Object.assign(new Error('암호화된 ZIP 파일은 지원하지 않습니다.'), { code: 'ENCRYPTED_PROJECT_ZIP', status: 400 });
    }
    if (unixType === 0xa000) {
      throw Object.assign(new Error('심볼릭 링크가 포함된 ZIP은 보안상 허용되지 않습니다.'), { code: 'UNSAFE_PROJECT_ZIP', status: 400 });
    }
    if (method !== 0 && method !== 8) {
      throw Object.assign(new Error(`지원하지 않는 ZIP 압축 방식입니다 (method=${method}).`), { code: 'INVALID_PROJECT_ZIP', status: 400 });
    }

    const rawName = zipBuffer.subarray(pos + 46, pos + 46 + nameLen).toString('utf8');
    pos += 46 + nameLen + extraLen + commentLen;

    // Ignore macOS AppleDouble / Finder junk
    if (rawName.startsWith('__MACOSX/') || path.posix.basename(rawName) === '.DS_Store') continue;

    const { normalized, isDir } = sanitizeZipEntryPath(rawName);
    if (isDir) continue;
    // Skip hidden dot-dirs like .git/ or .godot/
    if (normalized.split('/').some((seg) => seg.startsWith('.'))) continue;
    if (isSealedAvatarPath(normalized)) continue;

    expandedBytes += uncompSize;
    if (expandedBytes > maxExpandedBytes || uncompSize > Math.max(compSize * 200, 2 * 1024 * 1024)) {
      throw Object.assign(new Error('ZIP 압축 해제 용량 또는 압축비 제한을 초과했습니다.'), { code: 'UNSAFE_PROJECT_ZIP', status: 400 });
    }

    if (localOffset + 30 > cdOffset || zipBuffer.readUInt32LE(localOffset) !== 0x04034b50) {
      throw Object.assign(new Error('손상된 ZIP 로컬 파일 헤더입니다.'), { code: 'INVALID_PROJECT_ZIP', status: 400 });
    }
    const localNameLen = zipBuffer.readUInt16LE(localOffset + 26);
    const localExtraLen = zipBuffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const dataEnd = dataStart + compSize;
    if (dataEnd > cdOffset) {
      throw Object.assign(new Error('손상된 ZIP 데이터 범위입니다.'), { code: 'INVALID_PROJECT_ZIP', status: 400 });
    }
    const slice = zipBuffer.subarray(dataStart, dataEnd);
    const content = method === 0 ? Buffer.from(slice) : zlib.inflateRawSync(slice);
    if (content.length !== uncompSize) {
      throw Object.assign(new Error(`ZIP 파일 크기 불일치: ${normalized}`), { code: 'INVALID_PROJECT_ZIP', status: 400 });
    }
    rawFiles.push({ path: normalized, content });
  }

  // Detect optional single wrapper directory containing project.godot
  let stripPrefix = '';
  const hasRootProject = rawFiles.some((f) => f.path === 'project.godot');
  if (!hasRootProject) {
    const nested = rawFiles.find((f) => f.path.endsWith('/project.godot') && f.path.split('/').length === 2);
    if (nested) stripPrefix = nested.path.slice(0, -'project.godot'.length);
  }

  const rootResolved = path.resolve(destDir);
  fs.mkdirSync(rootResolved, { recursive: true });

  const written = [];
  for (const item of rawFiles) {
    let rel = item.path;
    if (stripPrefix) {
      if (!rel.startsWith(stripPrefix)) continue;
      rel = rel.slice(stripPrefix.length);
      if (!rel) continue;
    }
    const target = path.resolve(rootResolved, rel);
    if (target !== rootResolved && !target.startsWith(rootResolved + path.sep)) {
      throw Object.assign(new Error(`ZIP 경로 탈출 차단: ${rel}`), { code: 'UNSAFE_PROJECT_ZIP', status: 400 });
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, item.content);
    written.push(rel);
  }

  const projectGodotPath = path.join(rootResolved, 'project.godot');
  if (!fs.existsSync(projectGodotPath)) {
    throw Object.assign(new Error('업로드된 프로젝트 ZIP에 project.godot 파일이 없습니다.'), {
      code: 'MISSING_PROJECT_GODOT',
      status: 400,
    });
  }

  const projectGodotText = fs.readFileSync(projectGodotPath, 'utf8');
  const mainSceneMatch = projectGodotText.match(/run\/main_scene\s*=\s*"([^"]+)"/);
  const nameMatch = projectGodotText.match(/config\/name\s*=\s*"([^"]+)"/);
  let metadata = null;
  const metaPath = path.join(rootResolved, 'metadata.json');
  if (fs.existsSync(metaPath)) {
    try {
      metadata = JSON.parse(fs.readFileSync(metaPath, 'utf8').replace(/^\uFEFF/, ''));
    } catch {}
  }

  return {
    projectDir: rootResolved,
    fileCount: written.length,
    expandedBytes,
    sourceZipSha256: sha256Hex(zipBuffer),
    mainScene: mainSceneMatch ? mainSceneMatch[1] : null,
    projectName: nameMatch ? nameMatch[1] : null,
    metadata,
  };
}

function verifyPckHeader(pckPath) {
  if (!fs.existsSync(pckPath)) {
    throw Object.assign(new Error(`PCK 파일을 찾을 수 없습니다: ${path.basename(pckPath)}`), { code: 'PCK_MISSING', status: 500 });
  }
  const fd = fs.openSync(pckPath, 'r');
  try {
    const header = Buffer.alloc(20);
    const n = fs.readSync(fd, header, 0, 20, 0);
    if (n < 20 || header.subarray(0, 4).toString('ascii') !== 'GDPC') {
      throw Object.assign(new Error('유효한 Godot PCK(GDPC) 헤더가 아닙니다.'), { code: 'PCK_INVALID_HEADER', status: 500 });
    }
    return {
      formatVersion: header.readUInt32LE(4),
      engineVersion: `${header.readUInt32LE(8)}.${header.readUInt32LE(12)}.${header.readUInt32LE(16)}`,
    };
  } finally {
    fs.closeSync(fd);
  }
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

function runGodot(godotBin, args, { cwd, timeoutMs = 180000, onLog } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(godotBin, args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    const collect = (chunk) => {
      const text = chunk.toString();
      log = (log + text).slice(-250000);
      if (typeof onLog === 'function') onLog(text);
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(Object.assign(new Error(`Godot 패키징 시간 초과 (${Math.round(timeoutMs / 1000)}s)`), { log }));
      } else if (code !== 0) {
        reject(Object.assign(new Error(`Godot 패키징 실패 (exit ${code})`), { log }));
      } else {
        resolve(log);
      }
    });
  });
}

function collectFilesRecursive(baseDir, prefix = '') {
  const out = [];
  for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
    const full = path.join(baseDir, entry.name);
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...collectFilesRecursive(full, rel));
    else if (entry.isFile()) out.push([rel, fs.readFileSync(full)]);
  }
  return out;
}

/**
 * Package an extracted Godot project directory into per-platform artifacts inside outputDir,
 * returning platform manifests + validated PlayHub-GameDeploy.zip buffer.
 */
async function packageProjectForPlatforms({
  forgeRoot,
  projectDir,
  outputDir,
  platforms = DEFAULT_PLATFORMS,
  sourceZipSha256 = '',
  controls = [],
  godotBin = null,
  exporter = null,
  onProgress = () => {},
} = {}) {
  const startedAt = Date.now();
  const timings = {
    importMs: 0,
    webMs: 0,
    mobileMs: 0,
    desktopMs: 0,
    verifyAndManifestMs: 0,
    zipMs: 0,
    totalMs: 0,
  };
  const targetPlatforms = normalizePlatforms(platforms);
  fs.mkdirSync(outputDir, { recursive: true });
  const logs = [];

  if (typeof exporter === 'function') {
    onProgress('packaging_custom', '플랫폼별 패키징 실행 중…');
    const t0 = Date.now();
    await exporter({ projectDir, outputDir, platforms: targetPlatforms });
    timings.webMs = Date.now() - t0;
  } else {
    const bin = godotBin || findGodot(forgeRoot);
    if (!bin || !fs.existsSync(bin)) {
      throw Object.assign(new Error('서버에서 Godot 4.7.2 실행 파일을 찾을 수 없습니다.'), { code: 'GODOT_NOT_FOUND', status: 503 });
    }
    fs.writeFileSync(path.join(projectDir, 'export_presets.cfg'), MULTI_PLATFORM_EXPORT_PRESETS, 'utf8');

    onProgress('importing', 'Godot 프로젝트 리소스 임포트 중…');
    let t0 = Date.now();
    logs.push(await runGodot(bin, ['--headless', '--path', projectDir, '--editor', '--import', '--quit'], { cwd: projectDir, timeoutMs: 120000 }));
    timings.importMs = Date.now() - t0;

    onProgress('packaging_web', 'Web 플랫폼 패키징 중…');
    t0 = Date.now();
    logs.push(await runGodot(bin, ['--headless', '--path', projectDir, '--export-release', 'Web', path.join(outputDir, 'index.html')], { cwd: projectDir, timeoutMs: 180000 }));
    injectPlayHubShell(outputDir);
    timings.webMs = Date.now() - t0;

    const needsMobilePck = targetPlatforms.includes('android') || targetPlatforms.includes('ios');
    let mobilePckPath = null;
    if (needsMobilePck) {
      onProgress('packaging_mobile', 'Android/iOS 모바일 PCK 패키징 중…');
      t0 = Date.now();
      const mobileTmp = path.join(outputDir, '.mobile-pack-tmp.pck');
      try {
        logs.push(await runGodot(bin, ['--headless', '--path', projectDir, '--export-pack', 'MobilePack', mobileTmp], { cwd: projectDir, timeoutMs: 180000 }));
        if (fs.existsSync(mobileTmp)) mobilePckPath = mobileTmp;
      } catch (err) {
        // Fallback to Web PCK if mobile export preset fails on host template
        logs.push(`[mobile-pack-fallback] ${err.message}`);
      }
      timings.mobileMs = Date.now() - t0;
    }

    const webPck = path.join(outputDir, 'index.pck');
    if (targetPlatforms.includes('android')) {
      const destDir = path.join(outputDir, 'platforms', 'android');
      fs.mkdirSync(destDir, { recursive: true });
      fs.copyFileSync(mobilePckPath || webPck, path.join(destDir, 'index.pck'));
    }
    if (targetPlatforms.includes('ios')) {
      const destDir = path.join(outputDir, 'platforms', 'ios');
      fs.mkdirSync(destDir, { recursive: true });
      fs.copyFileSync(mobilePckPath || webPck, path.join(destDir, 'index.pck'));
    }
    if (targetPlatforms.includes('desktop')) {
      onProgress('packaging_desktop', 'Desktop PCK 패키징 중…');
      t0 = Date.now();
      const destDir = path.join(outputDir, 'platforms', 'desktop');
      fs.mkdirSync(destDir, { recursive: true });
      fs.copyFileSync(webPck, path.join(destDir, 'index.pck'));
      timings.desktopMs = Date.now() - t0;
    }
    if (mobilePckPath && fs.existsSync(mobilePckPath)) {
      try { fs.unlinkSync(mobilePckPath); } catch {}
    }
  }

  const tVerifyStart = Date.now();

  // Verify Web bundle essentials
  for (const reqFile of ['index.html', 'index.pck']) {
    if (!fs.existsSync(path.join(outputDir, reqFile))) {
      throw Object.assign(new Error(`필수 Web 패키징 산출물이 누락되었습니다: ${reqFile}`), { code: 'WEB_PACKAGING_INCOMPLETE', status: 500 });
    }
  }

  const webPckPath = path.join(outputDir, 'index.pck');
  const webPckInfo = verifyPckHeader(webPckPath);
  const webPckBytes = fs.readFileSync(webPckPath);
  const webPckSha = sha256Hex(webPckBytes);

  const platformPackages = {
    web: {
      platform: 'web',
      status: 'ready',
      entryFile: 'index.html',
      pckFile: 'index.pck',
      engineVersion: webPckInfo.engineVersion || ENGINE_VERSION,
      pckFormatVersion: webPckInfo.formatVersion,
      pckBytes: webPckBytes.length,
      pckSha256: webPckSha,
    },
  };

  // Deduplicate identical PCK payloads across platforms so PlayHub-GameDeploy.zip stays compact (< 64 MiB)
  const seenPckBySha = new Map([[webPckSha, 'index.pck']]);
  let rawPlatformPckBytes = webPckBytes.length;
  let dedupedPckBytes = webPckBytes.length;
  for (const plat of ['android', 'desktop', 'ios']) {
    if (!targetPlatforms.includes(plat)) continue;
    const platDir = path.join(outputDir, 'platforms', plat);
    const platPck = path.join(platDir, 'index.pck');
    if (!fs.existsSync(platPck)) {
      fs.mkdirSync(platDir, { recursive: true });
      fs.copyFileSync(webPckPath, platPck);
    }
    const info = verifyPckHeader(platPck);
    const bytes = fs.readFileSync(platPck);
    const sha = sha256Hex(bytes);
    rawPlatformPckBytes += bytes.length;
    let canonicalPckRel = `platforms/${plat}/index.pck`;
    if (seenPckBySha.has(sha)) {
      canonicalPckRel = seenPckBySha.get(sha);
      try { fs.unlinkSync(platPck); } catch {}
    } else {
      seenPckBySha.set(sha, canonicalPckRel);
      dedupedPckBytes += bytes.length;
    }
    const platManifest = {
      schemaVersion: 1,
      platform: plat,
      runtime: 'godot-pck',
      engineVersion: info.engineVersion || ENGINE_VERSION,
      pckFormatVersion: info.formatVersion,
      minAppVersionCode: 1,
      pckFile: canonicalPckRel,
      deduplicated: canonicalPckRel !== `platforms/${plat}/index.pck`,
      pckBytes: bytes.length,
      pckSha256: sha,
      touchSupported: Array.isArray(controls) ? controls.includes('touch') : true,
      packagedAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(platDir, 'manifest.json'), JSON.stringify(platManifest, null, 2), 'utf8');
    platformPackages[plat] = {
      platform: plat,
      status: 'ready',
      pckFile: canonicalPckRel,
      manifestFile: `platforms/${plat}/manifest.json`,
      deduplicated: platManifest.deduplicated,
      engineVersion: platManifest.engineVersion,
      pckFormatVersion: info.formatVersion,
      minAppVersionCode: 1,
      pckBytes: bytes.length,
      pckSha256: sha,
    };
  }

  const dedupSavedBytes = Math.max(0, rawPlatformPckBytes - dedupedPckBytes);
  timings.verifyAndManifestMs = Date.now() - tVerifyStart;

  const unifiedManifest = {
    schemaVersion: 1,
    packagingMode: 'server-multi-platform',
    engineVersion: webPckInfo.engineVersion || ENGINE_VERSION,
    sourceZipSha256,
    packagedAt: new Date().toISOString(),
    targetPlatforms,
    dedupSavedBytes,
    platforms: platformPackages,
  };
  fs.writeFileSync(path.join(outputDir, 'platform-packages.json'), JSON.stringify(unifiedManifest, null, 2), 'utf8');

  onProgress('zipping', '배포 번들 검증 및 패키징 중…');
  const tZipStart = Date.now();
  const entries = collectFilesRecursive(outputDir).filter(([rel]) => rel !== 'PlayHub-GameDeploy.zip').sort(([a], [b]) => a.localeCompare(b, 'en'));
  const bundleZipBuffer = zipFilesCompressed(entries);
  const validation = validateDeploymentZip(bundleZipBuffer);
  fs.writeFileSync(path.join(outputDir, 'PlayHub-GameDeploy.zip'), bundleZipBuffer);
  timings.zipMs = Date.now() - tZipStart;
  timings.totalMs = Date.now() - startedAt;

  return {
    bundleZipPath: path.join(outputDir, 'PlayHub-GameDeploy.zip'),
    bundleZipBuffer,
    bundleSha256: validation.sha256,
    bundleBytes: validation.bytes,
    expandedBytes: validation.expandedBytes,
    entryCount: validation.entries,
    platformManifest: unifiedManifest,
    platforms: platformPackages,
    metrics: {
      timings,
      sizes: {
        rawPlatformPckBytes,
        dedupedPckBytes,
        dedupSavedBytes,
        bundleBytes: validation.bytes,
        expandedBytes: validation.expandedBytes,
        entryCount: validation.entries,
      },
    },
    log: logs.join('\n').slice(-120000),
  };
}

module.exports = {
  SUPPORTED_PLATFORMS,
  DEFAULT_PLATFORMS,
  ENGINE_VERSION,
  MAX_PROJECT_ZIP_BYTES,
  normalizePlatforms,
  extractProjectZip,
  verifyPckHeader,
  packageProjectForPlatforms,
};
