import { readFileSync, realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { digest, ApiError } from './security.mjs';

const validId = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const localized = value => typeof value === 'string' ? value : value?.ko || value?.en || '';
export function validGameUpdateDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function readCatalog(rootDir, db, options = {}) {
  let catalog;
  try { catalog = JSON.parse(readFileSync(resolve(rootDir, 'catalog/games.json'), 'utf8')); }
  catch { throw new ApiError(503, 'CATALOG_UNAVAILABLE', '게임 목록을 읽을 수 없습니다.'); }
  if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.entries) || catalog.entries.length > 1000) throw new ApiError(503, 'CATALOG_INVALID');
  const seen = new Set();
  const staticGames = catalog.entries.map(entry => {
    if (!validId.test(entry.id || '') || entry.path !== `games/${entry.id}` || seen.has(entry.id)) throw new ApiError(503, 'CATALOG_INVALID');
    seen.add(entry.id);
    let raw, manifest;
    try {
      const gameRoot = realpathSync(resolve(rootDir, entry.path));
      const allowed = realpathSync(resolve(rootDir, 'games')) + sep;
      if (!gameRoot.startsWith(allowed)) throw new Error();
      raw = readFileSync(resolve(gameRoot, 'game.manifest.json'), 'utf8'); manifest = JSON.parse(raw);
    } catch { throw new ApiError(503, 'MANIFEST_INVALID', `게임 manifest를 확인하세요: ${entry.id}`); }
    if (manifest.id !== entry.id || manifest.entry !== 'index.html') throw new ApiError(503, 'MANIFEST_INVALID');
    const override = db.prepare('SELECT enabled FROM game_overrides WHERE game_id=?').get(entry.id);
    return {
      id: entry.id, title: localized(manifest.title), description: localized(manifest.summary),
      genre: manifest.tags?.[0] || 'puzzle', tags: manifest.tags || [],
      enabled: entry.enabled === true && (override ? override.enabled === 1 : true),
      catalogEnabled: entry.enabled === true, entryUrl: `/games/${entry.id}/index.html`,
      coverUrl: `/games/${entry.id}/${manifest.media?.cover || 'assets/cover.svg'}`,
      controls: manifest.controls || [], orientation: manifest.viewport?.orientation || 'any',
      instructions: localized(manifest.instructions), saveSchemaVersion: manifest.save?.schemaVersion || 1,
      publishedOn: validGameUpdateDate(manifest.publishedOn) ? manifest.publishedOn : undefined,
      updatedOn: validGameUpdateDate(manifest.updatedOn) ? manifest.updatedOn : undefined,
      buildId: `${manifest.version || '0.1.0'}-${digest(raw).slice(0, 12)}`
    };
  });

  let ugcRows = [];
  try {
    const hasTable = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='hub_publications'").get();
    if (hasTable) {
      ugcRows = db.prepare('SELECT * FROM hub_publications ORDER BY published_at DESC, game_id ASC').all();
    }
  } catch {}

  const ugcGames = [];
  for (const row of ugcRows) {
    if (!validId.test(row.game_id || '') || seen.has(row.game_id)) continue;
    let manifest;
    try { manifest = JSON.parse(row.manifest_json); } catch { continue; }
    if (!manifest || typeof manifest !== 'object') continue;
    seen.add(row.game_id);
    const override = db.prepare('SELECT enabled FROM game_overrides WHERE game_id=?').get(row.game_id);
    const isPublicActive = row.status === 'published' && row.visibility === 'public';
    const rawBaseUrl = String(row.artifact_base_url || '').replace(/\/?$/, '/');
    const ugcOrigin = typeof options?.ugcOrigin === 'string' && options.ugcOrigin ? options.ugcOrigin.replace(/\/+$/, '') : '';
    const baseUrl = ugcOrigin && rawBaseUrl.startsWith('/') ? `${ugcOrigin}${rawBaseUrl}` : rawBaseUrl;
    const cover = manifest.media?.cover ? `${baseUrl}${manifest.media.cover}` : '';
    ugcGames.push({
      id: row.game_id,
      title: localized(manifest.title) || row.game_id,
      description: localized(manifest.summary) || '',
      genre: manifest.tags?.[0] || 'arcade',
      tags: Array.isArray(manifest.tags) ? manifest.tags : ['arcade'],
      enabled: isPublicActive && (override ? override.enabled === 1 : true),
      catalogEnabled: isPublicActive,
      entryUrl: `${baseUrl}${manifest.entry || 'index.html'}`,
      coverUrl: cover,
      controls: Array.isArray(manifest.controls) ? manifest.controls : ['keyboard', 'mouse'],
      orientation: manifest.viewport?.orientation || 'any',
      instructions: localized(manifest.instructions) || '',
      saveSchemaVersion: manifest.save?.schemaVersion || 1,
      pointerLock: manifest.capabilities?.pointerLock === true,
      publishedOn: validGameUpdateDate(manifest.publishedOn) ? manifest.publishedOn : undefined,
      updatedOn: validGameUpdateDate(manifest.updatedOn) ? manifest.updatedOn : undefined,
      buildId: `${manifest.version || '0.1.0'}-${String(row.artifact_sha256 || '').slice(0, 12) || digest(row.manifest_json).slice(0, 12)}`,
      source: 'ugc',
      deployMode: row.deploy_mode || 'singleplay',
      visibility: row.visibility || 'public',
      publicationStatus: row.status,
      hostSlug: row.host_slug,
      activeReleaseId: row.active_release_id,
      casVersion: row.cas_version
    });
  }

  return [...staticGames, ...ugcGames];
}
export function findGame(rootDir, db, id, activeOnly = true, options = {}) {
  const game = readCatalog(rootDir, db, options).find(g => g.id === id && (!activeOnly || g.enabled));
  if (!game) throw new ApiError(404, 'GAME_NOT_FOUND'); return game;
}
