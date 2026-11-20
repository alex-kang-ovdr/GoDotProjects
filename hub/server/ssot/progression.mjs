import { findGame } from '../catalog.mjs';
import { transaction } from '../db.mjs';
import { ApiError, assertId, digest, json, readJson, safeString } from '../security.mjs';
import { hasActiveSanction } from './sanctions.mjs';

const KEY_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const IDEM_KEY_RE = /^[A-Za-z0-9:_-]{8,128}$/;
const AGG_MODES = new Set(['sum', 'max', 'min', 'latest']);
const MAX_ABS_VALUE = 1e15;
const MINUTE = 60000;

function assertKey(raw, code) {
  if (typeof raw !== 'string' || !KEY_RE.test(raw)) throw new ApiError(400, code);
  return raw;
}

function cleanText(value, min, max, code) {
  const trimmed = typeof value === 'string' ? value.trim() : null;
  if (trimmed === null || trimmed.length < min || trimmed.length > max || trimmed.includes('\0')) {
    throw new ApiError(422, code);
  }
  return trimmed;
}

function serializeStatDef(row) {
  return {
    gameId: row.game_id,
    statKey: row.stat_key,
    aggMode: row.agg_mode,
    minValue: row.min_value === null ? null : row.min_value,
    maxValue: row.max_value === null ? null : row.max_value,
    maxDelta: row.max_delta === null ? null : row.max_delta,
    enabled: Boolean(row.enabled),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function serializeAchievementDef(row, unlockedMap = null) {
  const unlock = unlockedMap?.get(row.achievement_key) || null;
  const masked = Boolean(row.hidden) && !unlock;
  return {
    gameId: row.game_id,
    achievementKey: row.achievement_key,
    title: masked ? 'Hidden Achievement' : row.title,
    description: masked ? '' : row.description,
    statKey: row.stat_key || null,
    threshold: row.threshold === null ? null : row.threshold,
    hidden: Boolean(row.hidden),
    points: row.points,
    enabled: Boolean(row.enabled),
    unlocked: Boolean(unlock),
    unlockedAt: unlock ? new Date(unlock.unlocked_at).toISOString() : null,
    progressValue: unlock && unlock.progress_value !== null ? unlock.progress_value : null,
  };
}

function applyStatAggregation(aggMode, currentValue, incomingValue) {
  if (currentValue === null || currentValue === undefined) return incomingValue;
  if (aggMode === 'sum') return currentValue + incomingValue;
  if (aggMode === 'max') return Math.max(currentValue, incomingValue);
  if (aggMode === 'min') return Math.min(currentValue, incomingValue);
  return incomingValue; // 'latest'
}

function evaluateStatAchievements(db, { gameId, statKey, value, principalId, trafficType, qaRunId, stamp }) {
  const defs = db.prepare(`
    SELECT * FROM achievement_definitions
    WHERE game_id=? AND stat_key=? AND enabled=1 AND threshold IS NOT NULL
  `).all(gameId, statKey);
  const newlyUnlocked = [];
  for (const def of defs) {
    if (value < def.threshold) continue;
    const inserted = db.prepare(`
      INSERT OR IGNORE INTO player_achievements(
        game_id, achievement_key, principal_id, unlocked_at, progress_value,
        source, traffic_type, qa_run_id, eos_sync_status, eos_synced_at
      ) VALUES(?,?,?,?,?,'stat_auto',?,?,'not_applicable',NULL)
    `).run(gameId, def.achievement_key, principalId, stamp, value, trafficType, qaRunId || null);
    if (inserted.changes) {
      newlyUnlocked.push({
        achievementKey: def.achievement_key,
        title: def.title,
        points: def.points,
        unlockedAt: new Date(stamp).toISOString(),
        progressValue: value,
      });
    }
  }
  return newlyUnlocked;
}

// Merge guest stats & achievements into target registered account.
export function mergeGuestProgression(db, source, target, nowMs = Date.now()) {
  if (!source || !target || source === target) return;
  const sourceStats = db.prepare('SELECT * FROM player_stats WHERE principal_id=?').all(source);
  for (const row of sourceStats) {
    const existing = db.prepare('SELECT * FROM player_stats WHERE game_id=? AND stat_key=? AND principal_id=?')
      .get(row.game_id, row.stat_key, target);
    const def = db.prepare('SELECT agg_mode, max_value, min_value FROM stat_definitions WHERE game_id=? AND stat_key=?')
      .get(row.game_id, row.stat_key);
    const aggMode = def?.agg_mode || 'sum';
    let finalValue = row.value;
    if (!existing) {
      db.prepare('UPDATE player_stats SET principal_id=?, updated_at=? WHERE game_id=? AND stat_key=? AND principal_id=?')
        .run(target, nowMs, row.game_id, row.stat_key, source);
    } else {
      if (aggMode === 'latest') {
        finalValue = row.updated_at >= existing.updated_at ? row.value : existing.value;
      } else {
        finalValue = applyStatAggregation(aggMode, existing.value, row.value);
      }
      if (def?.max_value !== null && def?.max_value !== undefined) finalValue = Math.min(finalValue, def.max_value);
      if (def?.min_value !== null && def?.min_value !== undefined) finalValue = Math.max(finalValue, def.min_value);
      db.prepare(`
        UPDATE player_stats SET value=?, update_count=update_count+?, updated_at=?
        WHERE game_id=? AND stat_key=? AND principal_id=?
      `).run(finalValue, row.update_count, nowMs, row.game_id, row.stat_key, target);
      db.prepare('DELETE FROM player_stats WHERE game_id=? AND stat_key=? AND principal_id=?')
        .run(row.game_id, row.stat_key, source);
    }
    evaluateStatAchievements(db, {
      gameId: row.game_id,
      statKey: row.stat_key,
      value: finalValue,
      principalId: target,
      trafficType: existing?.traffic_type || row.traffic_type,
      qaRunId: existing?.qa_run_id || row.qa_run_id,
      stamp: nowMs,
    });
  }

  const sourceAch = db.prepare('SELECT * FROM player_achievements WHERE principal_id=?').all(source);
  for (const row of sourceAch) {
    const existing = db.prepare('SELECT * FROM player_achievements WHERE game_id=? AND achievement_key=? AND principal_id=?')
      .get(row.game_id, row.achievement_key, target);
    if (!existing) {
      db.prepare('UPDATE player_achievements SET principal_id=? WHERE game_id=? AND achievement_key=? AND principal_id=?')
        .run(target, row.game_id, row.achievement_key, source);
    } else {
      const earliest = Math.min(existing.unlocked_at, row.unlocked_at);
      db.prepare('UPDATE player_achievements SET unlocked_at=? WHERE game_id=? AND achievement_key=? AND principal_id=?')
        .run(earliest, row.game_id, row.achievement_key, target);
      db.prepare('DELETE FROM player_achievements WHERE game_id=? AND achievement_key=? AND principal_id=?')
        .run(row.game_id, row.achievement_key, source);
    }
  }
}

export function createProgression({ db, rootDir, now, sessionFor, requireSession, rate, audit, serverEvent }) {
  async function publicRoute(req, res, url) {
    const p = url.pathname;

    // GET /api/games/:gameId/progression
    const readMatch = p.match(/^\/api\/games\/([A-Za-z0-9_-]+)\/progression$/);
    if (readMatch && req.method === 'GET') {
      const game = findGame(rootDir, db, assertId(readMatch[1]));
      const session = sessionFor(req, 'public');
      const principalId = session?.principal_id || null;
      const trafficType = session?.traffic_type || 'live';
      const statDefs = db.prepare('SELECT * FROM stat_definitions WHERE game_id=? AND enabled=1 ORDER BY stat_key').all(game.id);
      const achDefs = db.prepare('SELECT * FROM achievement_definitions WHERE game_id=? AND enabled=1 ORDER BY achievement_key').all(game.id);
      let playerStats = {};
      let unlockedMap = null;
      if (principalId) {
        const sRows = db.prepare('SELECT stat_key, value, update_count, updated_at FROM player_stats WHERE game_id=? AND principal_id=? AND traffic_type=?')
          .all(game.id, principalId, trafficType);
        for (const r of sRows) {
          playerStats[r.stat_key] = { value: r.value, updateCount: r.update_count, updatedAt: new Date(r.updated_at).toISOString() };
        }
        const aRows = db.prepare('SELECT * FROM player_achievements WHERE game_id=? AND principal_id=? AND traffic_type=?')
          .all(game.id, principalId, trafficType);
        unlockedMap = new Map(aRows.map(r => [r.achievement_key, r]));
      }
      json(res, 200, {
        gameId: game.id,
        statDefinitions: statDefs.map(serializeStatDef),
        achievements: achDefs.map(def => serializeAchievementDef(def, unlockedMap)),
        stats: principalId ? playerStats : null,
      });
      return true;
    }

    // POST /api/games/:gameId/stats
    const statsMatch = p.match(/^\/api\/games\/([A-Za-z0-9_-]+)\/stats$/);
    if (statsMatch && req.method === 'POST') {
      const session = requireSession(req, 'public');
      if (!session.principal_id) throw new ApiError(401, 'PLAY_FIRST');
      rate(`progression:ip:${req.socket.remoteAddress}`, 120, MINUTE);
      rate(`progression:principal:${session.principal_id}`, 40, MINUTE);
      const game = findGame(rootDir, db, assertId(statsMatch[1]));
      const body = await readJson(req, 16384);
      const allowed = new Set(['playSessionId', 'updates', 'requestKey']);
      if (Object.keys(body).some(k => !allowed.has(k))) throw new ApiError(422, 'STATS_BODY_INVALID');
      const requestKey = req.headers['idempotency-key'] || body.requestKey;
      if (typeof requestKey !== 'string' || !IDEM_KEY_RE.test(requestKey)) throw new ApiError(400, 'IDEMPOTENCY_KEY_REQUIRED');
      if (!safeString(body.playSessionId, 128)) throw new ApiError(422, 'PLAY_SESSION_REQUIRED');
      if (!Array.isArray(body.updates) || body.updates.length < 1 || body.updates.length > 20) {
        throw new ApiError(422, 'STATS_UPDATES_INVALID');
      }
      const normalized = body.updates.map(item => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) throw new ApiError(422, 'STATS_UPDATES_INVALID');
        if (Object.keys(item).some(k => k !== 'statKey' && k !== 'value')) throw new ApiError(422, 'STATS_UPDATES_INVALID');
        const statKey = assertKey(item.statKey, 'STAT_KEY_INVALID');
        if (typeof item.value !== 'number' || !Number.isFinite(item.value) || Math.abs(item.value) > MAX_ABS_VALUE) {
          throw new ApiError(422, 'STAT_VALUE_INVALID');
        }
        return { statKey, value: item.value };
      });

      const stamp = now();
      const requestHash = digest(JSON.stringify({ op: 'stats', playSessionId: body.playSessionId, updates: normalized }));
      const prior = db.prepare('SELECT request_hash, response_json FROM progression_idempotency WHERE game_id=? AND principal_id=? AND request_key=?')
        .get(game.id, session.principal_id, requestKey);
      if (prior) {
        if (prior.request_hash !== requestHash) throw new ApiError(409, 'IDEMPOTENCY_CONFLICT');
        json(res, 200, { ...JSON.parse(prior.response_json), idempotentReplay: true });
        return true;
      }

      if (hasActiveSanction(db, session.principal_id, ['all'], stamp)) {
        throw new ApiError(403, 'USER_SANCTIONED');
      }
      const play = db.prepare('SELECT * FROM play_sessions WHERE id=?').get(body.playSessionId);
      if (!play || play.session_hash !== session.id_hash || play.principal_id !== session.principal_id || play.game_id !== game.id || play.expires_at <= stamp) {
        throw new ApiError(403, 'PLAY_SESSION_INVALID');
      }

      const result = transaction(db, () => {
        const dup = db.prepare('SELECT request_hash, response_json FROM progression_idempotency WHERE game_id=? AND principal_id=? AND request_key=?')
          .get(game.id, session.principal_id, requestKey);
        if (dup) {
          if (dup.request_hash !== requestHash) throw new ApiError(409, 'IDEMPOTENCY_CONFLICT');
          return { replay: true, payload: JSON.parse(dup.response_json) };
        }
        const updatedStats = {};
        const newlyUnlocked = [];
        for (const { statKey, value } of normalized) {
          const def = db.prepare('SELECT * FROM stat_definitions WHERE game_id=? AND stat_key=? AND enabled=1').get(game.id, statKey);
          if (!def) throw new ApiError(404, 'STAT_NOT_FOUND');
          if (def.max_delta !== null && Math.abs(value) > def.max_delta) throw new ApiError(422, 'STAT_DELTA_EXCEEDED');
          const cur = db.prepare('SELECT * FROM player_stats WHERE game_id=? AND stat_key=? AND principal_id=?')
            .get(game.id, statKey, session.principal_id);
          const nextVal = applyStatAggregation(def.agg_mode, cur?.value ?? null, value);
          if (def.min_value !== null && nextVal < def.min_value) throw new ApiError(422, 'STAT_OUT_OF_BOUNDS');
          if (def.max_value !== null && nextVal > def.max_value) throw new ApiError(422, 'STAT_OUT_OF_BOUNDS');
          if (!cur) {
            db.prepare(`
              INSERT INTO player_stats(game_id, stat_key, principal_id, value, update_count, traffic_type, qa_run_id, updated_at)
              VALUES(?,?,?,?,1,?,?,?)
            `).run(game.id, statKey, session.principal_id, nextVal, session.traffic_type, session.qa_run_id || null, stamp);
          } else {
            db.prepare(`
              UPDATE player_stats SET value=?, update_count=update_count+1, updated_at=?
              WHERE game_id=? AND stat_key=? AND principal_id=?
            `).run(nextVal, stamp, game.id, statKey, session.principal_id);
          }
          updatedStats[statKey] = nextVal;
          const unlocked = evaluateStatAchievements(db, {
            gameId: game.id, statKey, value: nextVal, principalId: session.principal_id,
            trafficType: session.traffic_type, qaRunId: session.qa_run_id, stamp,
          });
          newlyUnlocked.push(...unlocked);
        }
        const payload = { ok: true, gameId: game.id, stats: updatedStats, newlyUnlocked };
        db.prepare('INSERT INTO progression_idempotency VALUES(?,?,?,?,?,?)')
          .run(game.id, session.principal_id, requestKey, requestHash, JSON.stringify(payload), stamp);
        if (serverEvent && newlyUnlocked.length) {
          serverEvent('achievement_unlocked', session, game.id, play.id, { keys: newlyUnlocked.map(a => a.achievementKey) });
        }
        return { replay: false, payload };
      });

      json(res, result.replay ? 200 : 201, result.replay ? { ...result.payload, idempotentReplay: true } : result.payload);
      return true;
    }

    // POST /api/games/:gameId/achievements/:achievementKey/unlock
    const unlockMatch = p.match(/^\/api\/games\/([A-Za-z0-9_-]+)\/achievements\/([a-z0-9_-]+)\/unlock$/);
    if (unlockMatch && req.method === 'POST') {
      const session = requireSession(req, 'public');
      if (!session.principal_id) throw new ApiError(401, 'PLAY_FIRST');
      rate(`progression:ip:${req.socket.remoteAddress}`, 120, MINUTE);
      rate(`progression:principal:${session.principal_id}`, 40, MINUTE);
      const game = findGame(rootDir, db, assertId(unlockMatch[1]));
      const achievementKey = assertKey(unlockMatch[2], 'ACHIEVEMENT_KEY_INVALID');
      const body = await readJson(req, 4096);
      const allowed = new Set(['playSessionId', 'requestKey']);
      if (Object.keys(body).some(k => !allowed.has(k))) throw new ApiError(422, 'ACHIEVEMENT_BODY_INVALID');
      const requestKey = req.headers['idempotency-key'] || body.requestKey;
      if (typeof requestKey !== 'string' || !IDEM_KEY_RE.test(requestKey)) throw new ApiError(400, 'IDEMPOTENCY_KEY_REQUIRED');
      if (!safeString(body.playSessionId, 128)) throw new ApiError(422, 'PLAY_SESSION_REQUIRED');

      const stamp = now();
      const requestHash = digest(JSON.stringify({ op: 'unlock', achievementKey, playSessionId: body.playSessionId }));
      const prior = db.prepare('SELECT request_hash, response_json FROM progression_idempotency WHERE game_id=? AND principal_id=? AND request_key=?')
        .get(game.id, session.principal_id, requestKey);
      if (prior) {
        if (prior.request_hash !== requestHash) throw new ApiError(409, 'IDEMPOTENCY_CONFLICT');
        json(res, 200, { ...JSON.parse(prior.response_json), idempotentReplay: true });
        return true;
      }

      if (hasActiveSanction(db, session.principal_id, ['all'], stamp)) throw new ApiError(403, 'USER_SANCTIONED');
      const play = db.prepare('SELECT * FROM play_sessions WHERE id=?').get(body.playSessionId);
      if (!play || play.session_hash !== session.id_hash || play.principal_id !== session.principal_id || play.game_id !== game.id || play.expires_at <= stamp) {
        throw new ApiError(403, 'PLAY_SESSION_INVALID');
      }

      const result = transaction(db, () => {
        const def = db.prepare('SELECT * FROM achievement_definitions WHERE game_id=? AND achievement_key=? AND enabled=1').get(game.id, achievementKey);
        if (!def) throw new ApiError(404, 'ACHIEVEMENT_NOT_FOUND');
        if (def.stat_key !== null) throw new ApiError(409, 'ACHIEVEMENT_STAT_DRIVEN');
        const inserted = db.prepare(`
          INSERT OR IGNORE INTO player_achievements(
            game_id, achievement_key, principal_id, unlocked_at, progress_value,
            source, traffic_type, qa_run_id, eos_sync_status, eos_synced_at
          ) VALUES(?,?,?,?,NULL,'client',?,?,'not_applicable',NULL)
        `).run(game.id, achievementKey, session.principal_id, stamp, session.traffic_type, session.qa_run_id || null);
        const saved = db.prepare('SELECT * FROM player_achievements WHERE game_id=? AND achievement_key=? AND principal_id=?')
          .get(game.id, achievementKey, session.principal_id);
        const payload = {
          ok: true,
          newlyUnlocked: Boolean(inserted.changes),
          achievement: {
            achievementKey: def.achievement_key,
            title: def.title,
            points: def.points,
            unlockedAt: new Date(saved.unlocked_at).toISOString(),
          },
        };
        db.prepare('INSERT INTO progression_idempotency VALUES(?,?,?,?,?,?)')
          .run(game.id, session.principal_id, requestKey, requestHash, JSON.stringify(payload), stamp);
        if (serverEvent && inserted.changes) {
          serverEvent('achievement_unlocked', session, game.id, play.id, { keys: [achievementKey] });
        }
        return payload;
      });

      json(res, result.newlyUnlocked ? 201 : 200, result);
      return true;
    }

    return false;
  }

  async function adminRoute(req, res, url, adminSession) {
    const p = url.pathname;
    const statDefMatch = p.match(/^\/api\/admin\/games\/([A-Za-z0-9_-]+)\/stats\/([a-z0-9_-]+)$/);
    if (statDefMatch && req.method === 'PUT') {
      const game = findGame(rootDir, db, assertId(statDefMatch[1]), false);
      const statKey = assertKey(statDefMatch[2], 'STAT_KEY_INVALID');
      const body = await readJson(req, 4096);
      const allowed = new Set(['aggMode', 'minValue', 'maxValue', 'maxDelta', 'enabled']);
      if (Object.keys(body).some(k => !allowed.has(k))) throw new ApiError(422, 'STAT_DEF_BODY_INVALID');
      const existing = db.prepare('SELECT * FROM stat_definitions WHERE game_id=? AND stat_key=?').get(game.id, statKey);
      const aggMode = body.aggMode ?? existing?.agg_mode ?? 'sum';
      const minValue = body.minValue === undefined ? (existing?.min_value ?? null) : body.minValue;
      const maxValue = body.maxValue === undefined ? (existing?.max_value ?? null) : body.maxValue;
      const maxDelta = body.maxDelta === undefined ? (existing?.max_delta ?? null) : body.maxDelta;
      const enabled = body.enabled === undefined ? Boolean(existing ? existing.enabled : 1) : body.enabled;
      if (!AGG_MODES.has(aggMode)) throw new ApiError(422, 'STAT_AGG_MODE_INVALID');
      for (const bound of [minValue, maxValue, maxDelta]) {
        if (bound !== null && (typeof bound !== 'number' || !Number.isFinite(bound) || Math.abs(bound) > MAX_ABS_VALUE)) {
          throw new ApiError(422, 'STAT_BOUND_INVALID');
        }
      }
      if (minValue !== null && maxValue !== null && minValue > maxValue) throw new ApiError(422, 'STAT_BOUND_INVALID');
      if (maxDelta !== null && maxDelta <= 0) throw new ApiError(422, 'STAT_BOUND_INVALID');
      if (typeof enabled !== 'boolean') throw new ApiError(422, 'STAT_FLAGS_INVALID');
      const stamp = now();
      const saved = transaction(db, () => {
        db.prepare(`
          INSERT INTO stat_definitions(game_id, stat_key, agg_mode, min_value, max_value, max_delta, enabled, created_at, updated_at)
          VALUES(?,?,?,?,?,?,?,?,?)
          ON CONFLICT(game_id, stat_key) DO UPDATE SET
            agg_mode=excluded.agg_mode, min_value=excluded.min_value, max_value=excluded.max_value,
            max_delta=excluded.max_delta, enabled=excluded.enabled, updated_at=excluded.updated_at
        `).run(game.id, statKey, aggMode, minValue, maxValue, maxDelta, enabled ? 1 : 0, stamp, stamp);
        audit('stat_definition_configured', `${game.id}:${statKey}`, { aggMode, minValue, maxValue, maxDelta, enabled, admin: adminSession?.admin_username || 'admin' });
        return db.prepare('SELECT * FROM stat_definitions WHERE game_id=? AND stat_key=?').get(game.id, statKey);
      });
      json(res, existing ? 200 : 201, { statDefinition: serializeStatDef(saved) });
      return true;
    }

    const achDefMatch = p.match(/^\/api\/admin\/games\/([A-Za-z0-9_-]+)\/achievements\/([a-z0-9_-]+)$/);
    if (achDefMatch && req.method === 'PUT') {
      const game = findGame(rootDir, db, assertId(achDefMatch[1]), false);
      const achievementKey = assertKey(achDefMatch[2], 'ACHIEVEMENT_KEY_INVALID');
      const body = await readJson(req, 8192);
      const allowed = new Set(['title', 'description', 'statKey', 'threshold', 'hidden', 'points', 'enabled']);
      if (Object.keys(body).some(k => !allowed.has(k))) throw new ApiError(422, 'ACHIEVEMENT_DEF_BODY_INVALID');
      const existing = db.prepare('SELECT * FROM achievement_definitions WHERE game_id=? AND achievement_key=?').get(game.id, achievementKey);
      const title = cleanText(body.title ?? existing?.title, 1, 100, 'ACHIEVEMENT_TITLE_INVALID');
      const description = body.description === undefined ? (existing?.description ?? '') : cleanText(body.description, 0, 500, 'ACHIEVEMENT_DESC_INVALID');
      const statKey = body.statKey === undefined ? (existing?.stat_key ?? null) : (body.statKey === null ? null : assertKey(body.statKey, 'STAT_KEY_INVALID'));
      const threshold = body.threshold === undefined ? (existing?.threshold ?? null) : body.threshold;
      const hidden = body.hidden === undefined ? Boolean(existing ? existing.hidden : 0) : body.hidden;
      const points = body.points === undefined ? (existing?.points ?? 0) : body.points;
      const enabled = body.enabled === undefined ? Boolean(existing ? existing.enabled : 1) : body.enabled;
      if (Boolean(statKey) !== (threshold !== null)) throw new ApiError(422, 'ACHIEVEMENT_THRESHOLD_MISMATCH');
      if (threshold !== null && (typeof threshold !== 'number' || !Number.isFinite(threshold))) throw new ApiError(422, 'ACHIEVEMENT_THRESHOLD_INVALID');
      if (!Number.isSafeInteger(points) || points < 0 || points > 10000) throw new ApiError(422, 'ACHIEVEMENT_POINTS_INVALID');
      if (typeof hidden !== 'boolean' || typeof enabled !== 'boolean') throw new ApiError(422, 'ACHIEVEMENT_FLAGS_INVALID');
      const stamp = now();
      const saved = transaction(db, () => {
        db.prepare(`
          INSERT INTO achievement_definitions(
            game_id, achievement_key, title, description, stat_key, threshold,
            hidden, points, enabled, created_at, updated_at
          ) VALUES(?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(game_id, achievement_key) DO UPDATE SET
            title=excluded.title, description=excluded.description, stat_key=excluded.stat_key,
            threshold=excluded.threshold, hidden=excluded.hidden, points=excluded.points,
            enabled=excluded.enabled, updated_at=excluded.updated_at
        `).run(game.id, achievementKey, title, description, statKey, threshold, hidden ? 1 : 0, points, enabled ? 1 : 0, stamp, stamp);
        audit('achievement_definition_configured', `${game.id}:${achievementKey}`, { statKey, threshold, hidden, points, enabled, admin: adminSession?.admin_username || 'admin' });
        return db.prepare('SELECT * FROM achievement_definitions WHERE game_id=? AND achievement_key=?').get(game.id, achievementKey);
      });
      json(res, existing ? 200 : 201, { achievement: serializeAchievementDef(saved, null) });
      return true;
    }

    return false;
  }

  return { publicRoute, adminRoute };
}
