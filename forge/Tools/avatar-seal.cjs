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
]);
const SAFE_ASSET_KINDS = new Set(['skins', 'accessories']);
const SAFE_GLB_NAME_RE = /^[A-Za-z0-9_-]{1,80}\.glb$/;

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function addonSourceDir(forgeRoot) {
  return path.join(forgeRoot, 'Godot', 'addons', 'playforge_avatar');
}

function isSealedAvatarPath(filePath) {
  if (typeof filePath !== 'string') return false;
  const normalized = filePath.replaceAll('\\', '/').replace(/^\.\//, '');
  return normalized === SEALED_AVATAR_DIR || normalized.startsWith(SEALED_AVATAR_DIR + '/');
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
  const includeAssets = options.includeAssets !== false;
  if (includeAssets) {
    for (const asset of listBinaryAssets(forgeRoot)) {
      const dest = path.join(targetDir, asset.relPath);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(asset.fullPath, dest);
    }
  }
  return bundle.manifest;
}

module.exports = {
  SEALED_AVATAR_DIR,
  SEALED_TEXT_FILES,
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
};
