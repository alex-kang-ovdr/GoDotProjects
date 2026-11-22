import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleRepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export const SAFE_ASSET_KINDS = new Set(['skins', 'accessories']);
export const SAFE_GLB_RE = /^[A-Za-z0-9_-]{1,80}\.glb$/;
export const ATTACHMENT_SLOTS = Object.freeze(['head', 'back', 'hand_r', 'hand_l']);
export const EMOTE_WHEEL_SIZE = 4;

export const PLAYCOIN_TOPUP_PACKS = Object.freeze([
  { id: 'pack_500', label: '스타터 550 PlayCoin', paidCoins: 500, bonusCoins: 50, bonusPercent: 10, priceDisplay: '₩7,000' },
  { id: 'pack_1200', label: '인기 1,440 PlayCoin', paidCoins: 1200, bonusCoins: 240, bonusPercent: 20, priceDisplay: '₩16,800' },
  { id: 'pack_2500', label: '최대 +25% · 3,125 PlayCoin', paidCoins: 2500, bonusCoins: 625, bonusPercent: 25, priceDisplay: '₩35,000' },
]);

export function resolveAvatarAddonDir(platformRoot, rootDir, options = {}) {
  const { addonDir, includeModuleFallback = true } = options || {};
  if (addonDir !== undefined) {
    return typeof addonDir === 'string' && addonDir && fs.existsSync(path.join(addonDir, 'catalog.json'))
      ? addonDir
      : null;
  }
  const candidates = [
    platformRoot && path.join(platformRoot, 'forge', 'Godot', 'addons', 'playforge_avatar'),
    rootDir && path.resolve(rootDir, '..', 'forge', 'Godot', 'addons', 'playforge_avatar'),
    includeModuleFallback ? path.join(moduleRepoRoot, 'forge', 'Godot', 'addons', 'playforge_avatar') : null,
  ].filter(Boolean);
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'catalog.json'))) return dir;
  }
  return null;
}

export function loadAvatarCatalog(addonDir) {
  const raw = JSON.parse(fs.readFileSync(path.join(addonDir, 'catalog.json'), 'utf8'));
  const itemsById = new Map();
  const starterIds = new Set();
  const publicItems = raw.items.map((item) => {
    const assetUrl = item.assetPath
      ? `/api/avatar/assets/${item.assetPath.replace(/^assets\//, '')}`
      : null;
    const enriched = Object.freeze({ ...item, assetUrl });
    itemsById.set(enriched.id, enriched);
    if (enriched.starter === true || enriched.pricePlayCoin === 0) starterIds.add(enriched.id);
    return enriched;
  });

  function resolveAssetFile(kind, fileName) {
    if (!SAFE_ASSET_KINDS.has(kind) || !SAFE_GLB_RE.test(fileName)) return null;
    const base = path.resolve(addonDir, 'assets', kind);
    const full = path.resolve(base, fileName);
    if (!full.startsWith(base + path.sep) || !fs.existsSync(full) || !fs.statSync(full).isFile()) return null;
    return full;
  }

  return Object.freeze({
    schemaVersion: raw.schemaVersion || 1,
    catalogVersion: raw.catalogVersion || 'unknown',
    currency: raw.currency || 'PlayCoin',
    defaultLoadout: raw.defaultLoadout,
    attachmentSlots: raw.attachmentSlots,
    rigProfiles: raw.rigProfiles,
    items: publicItems,
    itemsById,
    starterIds,
    topupPacks: PLAYCOIN_TOPUP_PACKS,
    resolveAssetFile,
  });
}
