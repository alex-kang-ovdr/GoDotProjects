'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const SEALED_AVATAR_DIR = 'addons/playforge_avatar';
const SEALED_TEXT_FILES = Object.freeze([
  'plugin.cfg',
  'plugin.gd',
  'catalog.json',
  'avatar_catalog.gd',
  'avatar_bridge.gd',
  'avatar_rig.gd',
  'avatar_ragdoll.gd',
  'avatar_controller.gd',
  'avatar_spawn.gd',
  'avatar_portrait_ui.gd',
  'avatar_bootstrap.gd',
]);
const STARTER_ASSET_REL_PATHS = new Set([
  'assets/skins/Knight.glb',
  'assets/accessories/quiver.glb',
]);
const PLAYHUB_AVATAR_AUTOLOAD_NAME = 'PlayForgeAvatarRuntime';
const PLAYHUB_AVATAR_AUTOLOAD_PATH = '*res://addons/playforge_avatar/avatar_bootstrap.gd';
const PLATFORM_INTERNAL_ADDON_RE = /^addons\/playforge_(avatar|platform|replay|agent_chat|remote_control|asset_store|showcase)\//;
const PLATFORM_INTERNAL_META_FILES = new Set([
  '.playforge-platform.json',
  '.playforge-showcase.json',
  '.playforge-store.json',
]);
const SAFE_ASSET_KINDS = new Set(['skins', 'accessories']);
const SAFE_GLB_NAME_RE = /^[A-Za-z0-9_-]{1,80}\.glb$/;

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function addonSourceDir(forgeRoot) {
  return path.join(forgeRoot, 'Godot', 'addons', 'playforge_avatar');
}

function normalizeAvatarCheckPath(filePath) {
  if (typeof filePath !== 'string') return '';
  let s = filePath.replaceAll('\\', '/').trim();
  while (/^res:\/\//i.test(s)) {
    s = s.replace(/^res:\/\//i, '');
  }
  while (s.startsWith('/') || s.startsWith('./')) {
    if (s.startsWith('/')) s = s.slice(1);
    else if (s.startsWith('./')) s = s.slice(2);
  }
  if (!s) return '';
  let normalized = path.posix.normalize(s);
  while (normalized.startsWith('/') || normalized.startsWith('./')) {
    if (normalized.startsWith('/')) normalized = normalized.slice(1);
    else if (normalized.startsWith('./')) normalized = normalized.slice(2);
  }
  return normalized;
}

function isSealedAvatarPath(filePath) {
  if (typeof filePath !== 'string') return false;
  if (filePath.includes('\0')) return true;
  const normalized = normalizeAvatarCheckPath(filePath);
  if (!normalized) return false;
  const segments = normalized.split('/');
  if (segments.includes('..')) return true;
  const lowered = normalized.toLowerCase();
  const sealed = SEALED_AVATAR_DIR.toLowerCase();
  return lowered === sealed || lowered.startsWith(sealed + '/');
}

function stripSealedAvatarEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.filter((entry) => {
    const filePath = Array.isArray(entry) ? entry[0] : entry?.path;
    return !isSealedAvatarPath(filePath);
  });
}

function listBinaryAssets(forgeRoot) {
  const base = addonSourceDir(forgeRoot);
  const assets = [];
  for (const kind of SAFE_ASSET_KINDS) {
    const dir = path.join(base, 'assets', kind);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir).sort()) {
      if (!SAFE_GLB_NAME_RE.test(name)) continue;
      const fullPath = path.join(dir, name);
      if (!fs.statSync(fullPath).isFile()) continue;
      const bytes = fs.readFileSync(fullPath);
      assets.push({
        kind,
        name,
        relPath: `assets/${kind}/${name}`,
        fullPath,
        bytes: bytes.length,
        sha256: sha256(bytes),
      });
    }
  }
  return assets;
}

function buildSealManifest(forgeRoot) {
  const base = addonSourceDir(forgeRoot);
  const files = {};
  for (const rel of SEALED_TEXT_FILES) {
    const full = path.join(base, rel);
    if (!fs.existsSync(full)) throw new Error(`Missing sealed avatar file: ${rel}`);
    files[rel] = sha256(fs.readFileSync(full));
  }
  for (const asset of listBinaryAssets(forgeRoot)) {
    files[asset.relPath] = asset.sha256;
  }
  const catalog = JSON.parse(fs.readFileSync(path.join(base, 'catalog.json'), 'utf8'));
  return {
    schemaVersion: 1,
    addon: 'playforge_avatar',
    sealed: true,
    catalogVersion: catalog.catalogVersion || 'unknown',
    fileCount: Object.keys(files).length,
    files,
  };
}

function loadSealedAvatarBundle(forgeRoot) {
  const base = addonSourceDir(forgeRoot);
  const textFiles = {};
  for (const rel of SEALED_TEXT_FILES) {
    textFiles[rel] = fs.readFileSync(path.join(base, rel), 'utf8');
  }
  const manifest = buildSealManifest(forgeRoot);
  textFiles['seal_manifest.json'] = JSON.stringify(manifest, null, 2) + '\n';
  const assets = listBinaryAssets(forgeRoot).map(({ kind, name, relPath, bytes, sha256: digest }) => ({
    kind,
    name,
    relPath,
    bytes,
    sha256: digest,
    url: `/api/platform-addon/avatar/assets/${kind}/${name}`,
  }));
  return { manifest, files: textFiles, assets };
}

function resolveSealedAssetFile(forgeRoot, kind, fileName) {
  if (!SAFE_ASSET_KINDS.has(kind) || !SAFE_GLB_NAME_RE.test(fileName)) return null;
  const base = path.resolve(addonSourceDir(forgeRoot), 'assets', kind);
  const target = path.resolve(base, fileName);
  if (!target.startsWith(base + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) return null;
  return target;
}

function injectSealedAvatarIntoProjectDir(forgeRoot, projectDir, options = {}) {
  const targetDir = path.join(projectDir, 'addons', 'playforge_avatar');
  // Always wipe any untrusted copy inside the project directory before injecting canonical files.
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });

  const bundle = loadSealedAvatarBundle(forgeRoot);
  for (const [rel, content] of Object.entries(bundle.files)) {
    const dest = path.join(targetDir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content, 'utf8');
  }
  const includeMode = options.includeAssets === undefined ? 'all'
    : (options.includeAssets === true ? 'all' : (options.includeAssets === false ? 'none' : String(options.includeAssets)));
  if (includeMode === 'all' || includeMode === 'starter') {
    for (const asset of listBinaryAssets(forgeRoot)) {
      if (includeMode === 'starter' && !STARTER_ASSET_REL_PATHS.has(asset.relPath)) continue;
      const dest = path.join(targetDir, asset.relPath);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(asset.fullPath, dest);
    }
  }
  return bundle.manifest;
}

function injectPlayHubAvatarAutoload(projectGodotContent) {
  if (typeof projectGodotContent !== 'string') return projectGodotContent;
  const newline = projectGodotContent.includes('\r\n') ? '\r\n' : '\n';
  const entryLine = `${PLAYHUB_AVATAR_AUTOLOAD_NAME}=${JSON.stringify(PLAYHUB_AVATAR_AUTOLOAD_PATH)}`;
  if (new RegExp(`^[ \\t]*${PLAYHUB_AVATAR_AUTOLOAD_NAME}[ \\t]*=`, 'm').test(projectGodotContent)) {
    return projectGodotContent.replace(
      new RegExp(`^[ \\t]*${PLAYHUB_AVATAR_AUTOLOAD_NAME}[ \\t]*=.*$`, 'm'),
      entryLine,
    );
  }
  const section = /^\[autoload\][ \t]*(?=\r?$)/m.exec(projectGodotContent);
  if (!section) {
    const trimmed = projectGodotContent.replace(/(?:\r?\n)*$/, '');
    return `${trimmed}${newline}${newline}[autoload]${newline}${newline}${entryLine}${newline}`;
  }
  const start = section.index + section[0].length;
  const remainder = projectGodotContent.slice(start);
  const nextSection = /^\[[^\r\n]+\][ \t]*\r?$/m.exec(remainder);
  const end = nextSection ? nextSection.index : remainder.length;
  const body = remainder.slice(0, end).replace(/(?:\r?\n)*$/, '');
  const updatedBody = `${body}${newline}${entryLine}${newline}${nextSection ? newline : ''}`;
  return projectGodotContent.slice(0, start) + updatedBody + remainder.slice(end);
}

function sanitizeProjectGodotForStandardGodot(content) {
  if (typeof content !== 'string') return content;
  const newline = content.includes('\r\n') ? '\r\n' : '\n';
  const lines = content.split(/\r?\n/);
  const sections = [];
  let current = { header: null, lines: [] };
  for (const line of lines) {
    const headerMatch = /^\[([^\r\n]+)\][ \t]*$/.exec(line);
    if (headerMatch) {
      sections.push(current);
      current = { header: headerMatch[1].trim(), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  sections.push(current);

  const output = [];
  for (const sec of sections) {
    if (sec.header === null) {
      output.push(...sec.lines);
      continue;
    }
    if (sec.header === 'playforge') {
      continue;
    }
    if (sec.header === 'autoload') {
      const kept = sec.lines.filter((line) => {
        const trimmed = line.trim();
        if (!trimmed) return true;
        if (trimmed.startsWith(`${PLAYHUB_AVATAR_AUTOLOAD_NAME}=`)) return false;
        if (trimmed.includes('res://addons/playforge_avatar/')) return false;
        return true;
      });
      if (kept.some((line) => line.trim() && !line.trim().startsWith(';'))) {
        output.push(`[${sec.header}]`, ...kept);
      }
      continue;
    }
    if (sec.header === 'editor_plugins') {
      const kept = [];
      let hasEnabled = false;
      for (const line of sec.lines) {
        const enabledMatch = /^([ \t]*enabled[ \t]*=[ \t]*PackedStringArray\()([^\r\n]*)(\)[ \t]*)$/.exec(line);
        if (!enabledMatch) {
          kept.push(line);
          continue;
        }
        const items = [...enabledMatch[2].matchAll(/"([^"]*)"/g)].map((m) => m[1]);
        const filtered = items.filter((p) => !/^res:\/\/addons\/playforge_(avatar|platform|replay|agent_chat|remote_control|asset_store|showcase)\//.test(p));
        if (filtered.length > 0) {
          hasEnabled = true;
          kept.push(`${enabledMatch[1]}${filtered.map((p) => JSON.stringify(p)).join(', ')}${enabledMatch[3]}`);
        }
      }
      if (hasEnabled || kept.some((line) => line.trim() && !line.trim().startsWith(';'))) {
        output.push(`[${sec.header}]`, ...kept);
      }
      continue;
    }
    output.push(`[${sec.header}]`, ...sec.lines);
  }
  return output.join(newline).replace(/(?:\r?\n){3,}/g, `${newline}${newline}`).replace(/(?:\r?\n)*$/, newline);
}

function sanitizeSceneForStandardGodot(content) {
  if (typeof content !== 'string' || (!content.includes('playforge_avatar') && !content.includes('PlayForgeAvatar'))) {
    return { content, removedNodes: 0 };
  }
  const newline = content.includes('\r\n') ? '\r\n' : '\n';
  const blocks = content.split(/\r?\n(?=\[)/);
  const avatarExtIds = new Set();

  for (const block of blocks) {
    if (!block.startsWith('[ext_resource ')) continue;
    if (/path="res:\/\/addons\/playforge_avatar\/[^"]*"/.test(block)) {
      const idMatch = /\bid="([^"]+)"/.exec(block);
      if (idMatch) avatarExtIds.add(idMatch[1]);
    }
  }

  const removedNodePaths = new Set();
  const keptBlocks = [];
  let removedNodes = 0;

  for (const block of blocks) {
    if (block.startsWith('[ext_resource ') && /path="res:\/\/addons\/playforge_avatar\/[^"]*"/.test(block)) {
      continue;
    }
    if (block.startsWith('[node ')) {
      const firstLine = block.split(/\r?\n/, 1)[0];
      const nameMatch = /\bname="([^"]+)"/.exec(firstLine);
      const typeMatch = /\btype="([^"]+)"/.exec(firstLine);
      const parentMatch = /\bparent="([^"]+)"/.exec(firstLine);
      const nodeName = nameMatch ? nameMatch[1] : '';
      const nodeType = typeMatch ? typeMatch[1] : '';
      const parentPath = parentMatch ? parentMatch[1] : null;
      const fullPath = parentPath === null ? '.' : (parentPath === '.' ? nodeName : `${parentPath}/${nodeName}`);

      const hasAvatarType = /^PlayForgeAvatar(Spawn|Controller|PortraitUI|Rig)$/.test(nodeType);
      const scriptMatch = /^[ \t]*script[ \t]*=[ \t]*ExtResource\("([^"]+)"\)/m.exec(block);
      const hasAvatarScript = Boolean(scriptMatch && avatarExtIds.has(scriptMatch[1]));
      const underRemovedParent = parentPath !== null && [...removedNodePaths].some(
        (removed) => parentPath === removed || parentPath.startsWith(`${removed}/`),
      );

      if (hasAvatarType || hasAvatarScript || underRemovedParent) {
        if (fullPath !== '.') removedNodePaths.add(fullPath);
        removedNodes++;
        continue;
      }
    }
    keptBlocks.push(block);
  }

  let rebuilt = keptBlocks.join(newline);
  if (avatarExtIds.size > 0 || removedNodes > 0) {
    const extCount = (rebuilt.match(/^\[ext_resource\b/gm) || []).length;
    const subCount = (rebuilt.match(/^\[sub_resource\b/gm) || []).length;
    const steps = extCount + subCount + 1;
    rebuilt = rebuilt.replace(/^\[gd_scene([^\]]*)\bload_steps=\d+([^\]]*)\]/m, `[gd_scene$1load_steps=${steps}$2]`);
  }
  return { content: rebuilt, removedNodes };
}

function sanitizeProjectForStandardGodot(rawEntries) {
  const list = Array.isArray(rawEntries)
    ? rawEntries.map((item) => (Array.isArray(item) ? [item[0], item[1]] : [item.path, item.content]))
    : Object.entries(rawEntries || {});
  const entries = [];
  const strippedFiles = [];
  let strippedSceneNodes = 0;

  for (const [rawPath, rawData] of list) {
    const normalized = String(rawPath).replaceAll('\\', '/').replace(/^\.\//, '');
    if (isSealedAvatarPath(normalized) || PLATFORM_INTERNAL_ADDON_RE.test(normalized) || PLATFORM_INTERNAL_META_FILES.has(normalized)) {
      strippedFiles.push(normalized);
      continue;
    }
    if (normalized === 'project.godot') {
      const text = Buffer.isBuffer(rawData) ? rawData.toString('utf8') : String(rawData);
      const clean = sanitizeProjectGodotForStandardGodot(text);
      entries.push([normalized, Buffer.isBuffer(rawData) ? Buffer.from(clean, 'utf8') : clean]);
      continue;
    }
    if (normalized.endsWith('.tscn')) {
      const text = Buffer.isBuffer(rawData) ? rawData.toString('utf8') : String(rawData);
      const { content: clean, removedNodes } = sanitizeSceneForStandardGodot(text);
      strippedSceneNodes += removedNodes;
      entries.push([normalized, Buffer.isBuffer(rawData) ? Buffer.from(clean, 'utf8') : clean]);
      continue;
    }
    entries.push([normalized, rawData]);
  }
  return { entries, strippedFiles, strippedSceneNodes };
}

module.exports = {
  SEALED_AVATAR_DIR,
  SEALED_TEXT_FILES,
  STARTER_ASSET_REL_PATHS,
  PLAYHUB_AVATAR_AUTOLOAD_NAME,
  PLAYHUB_AVATAR_AUTOLOAD_PATH,
  SAFE_ASSET_KINDS,
  SAFE_GLB_NAME_RE,
  addonSourceDir,
  isSealedAvatarPath,
  stripSealedAvatarEntries,
  listBinaryAssets,
  buildSealManifest,
  loadSealedAvatarBundle,
  resolveSealedAssetFile,
  injectSealedAvatarIntoProjectDir,
  injectPlayHubAvatarAutoload,
  sanitizeProjectGodotForStandardGodot,
  sanitizeSceneForStandardGodot,
  sanitizeProjectForStandardGodot,
};
