import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { guardRelativePath, readStrictJson } from './fs-utils.mjs';

export const MAX_POPULAR_GAMES = 20;
const DAY_MS = 86400000;

function queryHubPopularity(dbPath, windowDays = 30, nowMs = Date.now()) {
  if (!dbPath || !fs.existsSync(dbPath)) return null;
  let db = null;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
    const tables = new Set(
      db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name)
    );
    if (!tables.has('play_sessions')) return null;

    const sinceMs = nowMs - windowDays * DAY_MS;
    const rows = db
      .prepare(
        `SELECT game_id AS gameId,
                COUNT(*) AS sessions,
                COALESCE(SUM(active_ms), 0) AS activeMs
         FROM play_sessions
         WHERE traffic_type = 'live' AND started_at >= ?
         GROUP BY game_id`
      )
      .all(sinceMs);

    const map = new Map();
    for (const row of rows) {
      if (!row?.gameId) continue;
      map.set(String(row.gameId), {
        playSessions30d: Number(row.sessions || 0),
        activeMs30d: Number(row.activeMs || 0),
      });
    }
    return map.size > 0 ? map : null;
  } catch {
    return null;
  } finally {
    try {
      db?.close();
    } catch {
      // ignore close errors
    }
  }
}

export function selectPopularGames({
  projectRoot,
  topN = MAX_POPULAR_GAMES,
  hubDbPath = null,
  windowDays = 30,
  nowMs = Date.now(),
} = {}) {
  const clampedTopN = Math.max(1, Math.min(MAX_POPULAR_GAMES, Math.floor(Number(topN) || MAX_POPULAR_GAMES)));
  const catalogPath = guardRelativePath(projectRoot, 'games/catalog.json');
  const catalog = readStrictJson(catalogPath);
  const enabledEntries = (catalog.entries || []).filter((e) => e && e.id && e.enabled !== false);
  if (!enabledEntries.length) {
    throw new Error('No enabled games found in games/catalog.json');
  }

  const candidateDbPaths = [
    hubDbPath ? path.resolve(hubDbPath) : null,
    process.env.PLAYHUB_DATA_DIR ? path.join(path.resolve(process.env.PLAYHUB_DATA_DIR), 'platform.sqlite') : null,
    path.join(projectRoot, 'hub', 'data', 'platform.sqlite'),
  ].filter(Boolean);

  let telemetryMap = null;
  let resolvedDbPath = null;
  for (const candidate of candidateDbPaths) {
    const map = queryHubPopularity(candidate, windowDays, nowMs);
    if (map) {
      telemetryMap = map;
      resolvedDbPath = candidate;
      break;
    }
  }

  const source = telemetryMap ? 'hub-sqlite' : 'catalog-priority';

  const ranked = enabledEntries
    .map((entry) => {
      const tel = telemetryMap?.get(entry.id) || { playSessions30d: 0, activeMs30d: 0 };
      return {
        gameId: entry.id,
        displayName: entry.displayName || entry.id,
        priority: Number.isFinite(Number(entry.priority)) ? Number(entry.priority) : 0,
        kind: entry.kind || 'unknown',
        playSessions30d: tel.playSessions30d,
        activeMs30d: tel.activeMs30d,
      };
    })
    .sort((a, b) => {
      if (telemetryMap) {
        if (b.playSessions30d !== a.playSessions30d) return b.playSessions30d - a.playSessions30d;
        if (b.activeMs30d !== a.activeMs30d) return b.activeMs30d - a.activeMs30d;
      }
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.gameId.localeCompare(b.gameId);
    });

  const selected = ranked.slice(0, clampedTopN).map((item, idx) => ({
    rank: idx + 1,
    ...item,
  }));

  return {
    source,
    hubDbPath: resolvedDbPath,
    windowDays,
    requestedTopN: clampedTopN,
    totalEnabledCatalogGames: enabledEntries.length,
    selectedCount: selected.length,
    gameIds: selected.map((s) => s.gameId),
    rankings: selected,
    catalog,
  };
}
