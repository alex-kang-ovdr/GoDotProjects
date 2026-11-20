import { findGame } from '../catalog.mjs';
import { transaction } from '../db.mjs';
import { ApiError, assertId, digest, json, readJson, safeString, uid } from '../security.mjs';
import { hasActiveSanction } from './sanctions.mjs';

const BOARD_KEY_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const PERIOD_KEY_RE = /^(all|\d{4}-\d{2}-\d{2}|\d{4}-W\d{2}|\d{4}-\d{2})$/;
const IDEM_KEY_RE = /^[A-Za-z0-9:_-]{8,128}$/;
const SORT_ORDERS = new Set(['desc', 'asc']);
const SCORE_MODES = new Set(['best', 'sum', 'latest']);
const RESET_PERIODS = new Set(['all', 'daily', 'weekly', 'monthly']);
const MAX_ABS_SCORE = 1e15;
const MINUTE = 60000;

export function computePeriodKey(resetPeriod, timestampMs) {
  if (resetPeriod === 'all') return 'all';
  const d = new Date(timestampMs);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  if (resetPeriod === 'daily') return `${year}-${month}-${day}`;
  if (resetPeriod === 'monthly') return `${year}-${month}`;
  if (resetPeriod === 'weekly') {
    // ISO-8601 week key in UTC (e.g. 2026-W47)
    const utc = new Date(Date.UTC(year, d.getUTCMonth(), d.getUTCDate()));
    const dayNum = utc.getUTCDay() || 7;
    utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
    const isoYear = utc.getUTCFullYear();
    const yearStart = new Date(Date.UTC(isoYear, 0, 1));
    const week = Math.ceil((((utc - yearStart) / 86400000) + 1) / 7);
    return `${isoYear}-W${String(week).padStart(2, '0')}`;
  }
  throw new ApiError(422, 'BOARD_PERIOD_INVALID');
}

function toSortScore(score, sortOrder) {
  return sortOrder === 'asc' ? -score : score;
}

function pageNumber(value, fallback, min, max) {
  if (value === null) return fallback;
  if (!/^\d{1,10}$/.test(value) || Number(value) < min || Number(value) > max) {
    throw new ApiError(400, 'LEADERBOARD_PAGINATION_INVALID');
  }
  return Number(value);
}

function assertBoardKey(raw) {
  if (typeof raw !== 'string' || !BOARD_KEY_RE.test(raw)) {
    throw new ApiError(400, 'LEADERBOARD_KEY_INVALID');
  }
  return raw;
}

function serializeBoard(row) {
  return {
    gameId: row.game_id,
    boardKey: row.board_key,
    sortOrder: row.sort_order,
    scoreMode: row.score_mode,
    resetPeriod: row.reset_period,
    maxScoreBound: row.max_score_bound === null ? null : row.max_score_bound,
    minPlayMs: row.min_play_ms,
    guestVisible: Boolean(row.guest_visible),
    enabled: Boolean(row.enabled),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function serializeEntry(row, rank, admin = false) {
  const result = {
    rank,
    principalId: row.principal_id,
    displayName: row.display_name || (row.user_kind === 'guest' ? `Guest-${row.principal_id.slice(0, 6)}` : 'Player'),
    userKind: row.user_kind || 'guest',
    score: row.score,
    tieBreakerMs: row.tie_breaker_ms,
    metadata: JSON.parse(row.metadata_json || '{}'),
    submissionCount: row.submission_count,
    source: row.source,
    achievedAt: new Date(row.achieved_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
  if (admin) {
    result.trafficType = row.traffic_type;
    result.qaRunId = row.qa_run_id || null;
    result.excluded = Boolean(row.excluded);
    result.excludeReason = row.exclude_reason || null;
  }
  return result;
}

function isBetterCandidate(candSort, candTie, candAchieved, curSort, curTie, curAchieved) {
  if (candSort !== curSort) return candSort > curSort;
  if (candTie !== curTie) return candTie < curTie;
  return candAchieved < curAchieved;
}

// Merge guest leaderboard entries & submission ledger into the target Google account.
export function mergeGuestLeaderboard(db, source, target, nowMs = Date.now()) {
  if (!source || !target || source === target) return;
  const sourceEntries = db.prepare('SELECT * FROM leaderboard_entries WHERE principal_id=?').all(source);
  for (const row of sourceEntries) {
    const existing = db.prepare(`
      SELECT * FROM leaderboard_entries
      WHERE game_id=? AND board_key=? AND period_key=? AND principal_id=?
    `).get(row.game_id, row.board_key, row.period_key, target);
    if (!existing) {
      db.prepare(`
        UPDATE leaderboard_entries SET principal_id=?, updated_at=?
        WHERE game_id=? AND board_key=? AND period_key=? AND principal_id=?
      `).run(target, nowMs, row.game_id, row.board_key, row.period_key, source);
      continue;
    }
    const board = db.prepare('SELECT sort_order, score_mode FROM leaderboard_boards WHERE game_id=? AND board_key=?').get(row.game_id, row.board_key);
    const sortOrder = board?.sort_order || 'desc';
    const scoreMode = board?.score_mode || 'best';
    const excluded = Math.max(existing.excluded, row.excluded);
    const excludeReason = existing.exclude_reason || row.exclude_reason || null;
    const count = existing.submission_count + row.submission_count;
    let next = existing;
    if (scoreMode === 'sum') {
      const summed = existing.score + row.score;
      next = {
        ...existing,
        score: summed,
        sort_score: toSortScore(summed, sortOrder),
        tie_breaker_ms: Math.min(existing.tie_breaker_ms, row.tie_breaker_ms),
        achieved_at: Math.max(existing.achieved_at, row.achieved_at),
      };
    } else if (scoreMode === 'latest') {
      next = row.updated_at >= existing.updated_at ? row : existing;
    } else if (isBetterCandidate(row.sort_score, row.tie_breaker_ms, row.achieved_at, existing.sort_score, existing.tie_breaker_ms, existing.achieved_at)) {
      next = row;
    }
    db.prepare(`
      UPDATE leaderboard_entries
      SET score=?, sort_score=?, tie_breaker_ms=?, metadata_json=?, submission_count=?,
          source=?, excluded=?, exclude_reason=?, achieved_at=?, updated_at=?
      WHERE game_id=? AND board_key=? AND period_key=? AND principal_id=?
    `).run(
      next.score, next.sort_score, next.tie_breaker_ms, next.metadata_json, count,
      next.source, excluded, excludeReason, next.achieved_at, nowMs,
      row.game_id, row.board_key, row.period_key, target
    );
    db.prepare(`
      DELETE FROM leaderboard_entries
      WHERE game_id=? AND board_key=? AND period_key=? AND principal_id=?
    `).run(row.game_id, row.board_key, row.period_key, source);
  }

  const sourceSubs = db.prepare('SELECT id, game_id, board_key, request_key FROM leaderboard_submissions WHERE principal_id=?').all(source);
  for (const sub of sourceSubs) {
    const conflict = db.prepare(`
      SELECT 1 FROM leaderboard_submissions
      WHERE game_id=? AND board_key=? AND principal_id=? AND request_key=?
    `).get(sub.game_id, sub.board_key, target, sub.request_key);
    const nextKey = conflict ? `merge:${sub.id.slice(0, 8)}:${sub.request_key}`.slice(0, 128) : sub.request_key;
    db.prepare('UPDATE leaderboard_submissions SET principal_id=?, request_key=? WHERE id=?').run(target, nextKey, sub.id);
  }
}

export function createLeaderboard({ db, rootDir, now, sessionFor, requireSession, rate, audit, serverEvent }) {
  function getOrProvisionBoard(gameId, boardKey, { allowAutoDefault = true, requireEnabled = true } = {}) {
    let board = db.prepare('SELECT * FROM leaderboard_boards WHERE game_id=? AND board_key=?').get(gameId, boardKey);
    if (!board && allowAutoDefault && boardKey === 'default') {
      const stamp = now();
      db.prepare(`
        INSERT OR IGNORE INTO leaderboard_boards(
          game_id, board_key, sort_order, score_mode, reset_period,
          max_score_bound, min_play_ms, guest_visible, enabled, created_at, updated_at
        ) VALUES(?, 'default', 'desc', 'best', 'all', NULL, 0, 1, 1, ?, ?)
      `).run(gameId, stamp, stamp);
      board = db.prepare('SELECT * FROM leaderboard_boards WHERE game_id=? AND board_key=?').get(gameId, boardKey);
    }
    if (!board) throw new ApiError(404, 'LEADERBOARD_NOT_FOUND');
    if (requireEnabled && !board.enabled) throw new ApiError(404, 'LEADERBOARD_DISABLED');
    return board;
  }

  function rankForEntry(board, periodKey, trafficType, entry, stamp) {
    const guestFilter = board.guest_visible ? '' : "AND u.kind != 'guest'";
    const row = db.prepare(`
      SELECT COUNT(*) AS ahead
      FROM leaderboard_entries e
      JOIN users u ON u.id = e.principal_id
      WHERE e.game_id=? AND e.board_key=? AND e.period_key=? AND e.traffic_type=?
        AND e.excluded=0
        ${guestFilter}
        AND NOT EXISTS (
          SELECT 1 FROM user_sanctions s
          WHERE s.principal_id=e.principal_id AND s.active=1
            AND s.scope IN ('all','leaderboard')
            AND (s.expires_at IS NULL OR s.expires_at > ?)
        )
        AND (
          e.sort_score > ?
          OR (e.sort_score = ? AND e.tie_breaker_ms < ?)
          OR (e.sort_score = ? AND e.tie_breaker_ms = ? AND e.achieved_at < ?)
          OR (e.sort_score = ? AND e.tie_breaker_ms = ? AND e.achieved_at = ? AND e.principal_id < ?)
        )
    `).get(
      board.game_id, board.board_key, periodKey, trafficType, stamp,
      entry.sort_score,
      entry.sort_score, entry.tie_breaker_ms,
      entry.sort_score, entry.tie_breaker_ms, entry.achieved_at,
      entry.sort_score, entry.tie_breaker_ms, entry.achieved_at, entry.principal_id
    );
    return row.ahead + 1;
  }

  function queryBoard(board, { periodKey, trafficType, limit, offset, principalId = null, includeExcluded = false }) {
    const stamp = now();
    const guestFilter = (!includeExcluded && !board.guest_visible) ? "AND u.kind != 'guest'" : '';
    const excludeFilter = includeExcluded ? '' : `
      AND e.excluded=0
      AND NOT EXISTS (
        SELECT 1 FROM user_sanctions s
        WHERE s.principal_id=e.principal_id AND s.active=1
          AND s.scope IN ('all','leaderboard')
          AND (s.expires_at IS NULL OR s.expires_at > ?)
      )`;
    const baseArgs = includeExcluded
      ? [board.game_id, board.board_key, periodKey, trafficType]
      : [board.game_id, board.board_key, periodKey, trafficType, stamp];
    const total = db.prepare(`
      SELECT COUNT(*) AS n
      FROM leaderboard_entries e
      JOIN users u ON u.id = e.principal_id
      WHERE e.game_id=? AND e.board_key=? AND e.period_key=? AND e.traffic_type=?
        ${guestFilter}
        ${excludeFilter}
    `).get(...baseArgs).n;

    const rows = db.prepare(`
      SELECT e.*, u.display_name, u.kind AS user_kind
      FROM leaderboard_entries e
      JOIN users u ON u.id = e.principal_id
      WHERE e.game_id=? AND e.board_key=? AND e.period_key=? AND e.traffic_type=?
        ${guestFilter}
        ${excludeFilter}
      ORDER BY e.sort_score DESC, e.tie_breaker_ms ASC, e.achieved_at ASC, e.principal_id ASC
      LIMIT ? OFFSET ?
    `).all(...baseArgs, limit, offset);

    const entries = rows.map((row, idx) => serializeEntry(row, offset + idx + 1, includeExcluded));
    let me = null;
    if (principalId && !includeExcluded) {
      const own = db.prepare(`
        SELECT e.*, u.display_name, u.kind AS user_kind
        FROM leaderboard_entries e
        JOIN users u ON u.id = e.principal_id
        WHERE e.game_id=? AND e.board_key=? AND e.period_key=? AND e.principal_id=? AND e.traffic_type=?
      `).get(board.game_id, board.board_key, periodKey, principalId, trafficType);
      if (own && !own.excluded && (board.guest_visible || own.user_kind !== 'guest') && !hasActiveSanction(db, principalId, ['all', 'leaderboard'], stamp)) {
        const rank = rankForEntry(board, periodKey, trafficType, own, stamp);
        me = serializeEntry(own, rank, false);
      }
    }
    return {
      board: serializeBoard(board),
      periodKey,
      total,
      hasMore: offset + entries.length < total,
      entries,
      ...(includeExcluded ? {} : { me }),
    };
  }

  function recordRejectedSubmission({ gameId, boardKey, periodKey, principalId, playSessionId, requestKey, requestHash, rawScore, reason, trafficType, qaRunId, stamp }) {
    const payload = { ok: false, accepted: false, reason };
    db.prepare(`
      INSERT OR IGNORE INTO leaderboard_submissions(
        id, game_id, board_key, period_key, principal_id, play_session_id,
        request_key, request_hash, raw_score, accepted, reject_reason, response_json,
        source, traffic_type, qa_run_id, created_at
      ) VALUES(?,?,?,?,?,?,?,?,?,0,?,?, 'client', ?,?,?)
    `).run(uid(), gameId, boardKey, periodKey, principalId, playSessionId || null, requestKey, requestHash, rawScore, reason, JSON.stringify(payload), trafficType, qaRunId || null, stamp);
  }

  async function publicRoute(req, res, url) {
    const p = url.pathname;
    const listMatch = p.match(/^\/api\/games\/([A-Za-z0-9_-]+)\/leaderboards$/);
    if (listMatch && req.method === 'GET') {
      const game = findGame(rootDir, db, assertId(listMatch[1]));
      const rows = db.prepare('SELECT * FROM leaderboard_boards WHERE game_id=? AND enabled=1 ORDER BY board_key').all(game.id);
      const boards = rows.length ? rows.map(serializeBoard) : [serializeBoard(getOrProvisionBoard(game.id, 'default'))];
      json(res, 200, { gameId: game.id, boards });
      return true;
    }

    const boardMatch = p.match(/^\/api\/games\/([A-Za-z0-9_-]+)\/leaderboards\/([a-z0-9_-]+)$/);
    if (boardMatch && req.method === 'GET') {
      const game = findGame(rootDir, db, assertId(boardMatch[1]));
      const boardKey = assertBoardKey(boardMatch[2]);
      const board = getOrProvisionBoard(game.id, boardKey, { allowAutoDefault: true, requireEnabled: true });
      const requestedPeriod = url.searchParams.get('period');
      if (requestedPeriod !== null && !PERIOD_KEY_RE.test(requestedPeriod)) {
        throw new ApiError(400, 'LEADERBOARD_PERIOD_INVALID');
      }
      const periodKey = requestedPeriod || computePeriodKey(board.reset_period, now());
      const limit = pageNumber(url.searchParams.get('limit'), 20, 1, 100);
      const offset = pageNumber(url.searchParams.get('offset'), 0, 0, 100000);
      const session = sessionFor(req, 'public');
      const trafficType = session?.traffic_type || 'live';
      const result = queryBoard(board, { periodKey, trafficType, limit, offset, principalId: session?.principal_id || null });
      json(res, 200, result);
      return true;
    }

    const submitMatch = p.match(/^\/api\/games\/([A-Za-z0-9_-]+)\/leaderboards\/([a-z0-9_-]+)\/scores$/);
    if (submitMatch && req.method === 'POST') {
      const session = requireSession(req, 'public');
      if (!session.principal_id) throw new ApiError(401, 'PLAY_FIRST');
      rate(`leaderboard:ip:${req.socket.remoteAddress}`, 120, MINUTE);
      rate(`leaderboard:principal:${session.principal_id}`, 30, MINUTE);
      const game = findGame(rootDir, db, assertId(submitMatch[1]));
      const boardKey = assertBoardKey(submitMatch[2]);
      const board = getOrProvisionBoard(game.id, boardKey, { allowAutoDefault: true, requireEnabled: true });
      const body = await readJson(req, 8192);
      const allowed = new Set(['playSessionId', 'score', 'tieBreakerMs', 'metadata', 'requestKey']);
      if (Object.keys(body).some(key => !allowed.has(key))) throw new ApiError(422, 'SCORE_BODY_INVALID');

      const requestKey = req.headers['idempotency-key'] || body.requestKey;
      if (typeof requestKey !== 'string' || !IDEM_KEY_RE.test(requestKey)) {
        throw new ApiError(400, 'IDEMPOTENCY_KEY_REQUIRED');
      }
      if (!safeString(body.playSessionId, 128)) throw new ApiError(422, 'PLAY_SESSION_REQUIRED');
      if (typeof body.score !== 'number' || !Number.isFinite(body.score) || Math.abs(body.score) > MAX_ABS_SCORE) {
        throw new ApiError(422, 'SCORE_INVALID');
      }
      const tieBreakerMs = body.tieBreakerMs === undefined ? 0 : body.tieBreakerMs;
      if (!Number.isSafeInteger(tieBreakerMs) || tieBreakerMs < 0 || tieBreakerMs > 86400000) {
        throw new ApiError(422, 'TIE_BREAKER_INVALID');
      }
      let metadata = {};
      if (body.metadata !== undefined) {
        if (!body.metadata || typeof body.metadata !== 'object' || Array.isArray(body.metadata)) {
          throw new ApiError(422, 'SCORE_METADATA_INVALID');
        }
        if (Object.keys(body.metadata).some(k => /token|password|secret|email|cookie|payload/i.test(k))) {
          throw new ApiError(422, 'SCORE_METADATA_INVALID');
        }
        metadata = body.metadata;
      }
      const metadataJson = JSON.stringify(metadata);
      if (metadataJson.length > 1024) throw new ApiError(422, 'SCORE_METADATA_INVALID');

      const stamp = now();
      const periodKey = computePeriodKey(board.reset_period, stamp);
      const requestHash = digest(JSON.stringify({
        playSessionId: body.playSessionId,
        score: body.score,
        tieBreakerMs,
        metadataJson,
      }));

      // Fast idempotency replay before sanction/session checks for identical accepted retries
      const prior = db.prepare(`
        SELECT request_hash, accepted, reject_reason, response_json
        FROM leaderboard_submissions
        WHERE game_id=? AND board_key=? AND principal_id=? AND request_key=?
      `).get(game.id, board.board_key, session.principal_id, requestKey);
      if (prior) {
        if (prior.request_hash !== requestHash) throw new ApiError(409, 'IDEMPOTENCY_CONFLICT');
        if (!prior.accepted) {
          const status = prior.reject_reason === 'LEADERBOARD_SANCTIONED' ? 403 : 422;
          throw new ApiError(status, prior.reject_reason || 'SCORE_REJECTED');
        }
        json(res, 200, { ...JSON.parse(prior.response_json), idempotentReplay: true });
        return true;
      }

      if (hasActiveSanction(db, session.principal_id, ['all', 'leaderboard'], stamp)) {
        recordRejectedSubmission({
          gameId: game.id, boardKey: board.board_key, periodKey, principalId: session.principal_id,
          playSessionId: body.playSessionId, requestKey, requestHash, rawScore: body.score,
          reason: 'LEADERBOARD_SANCTIONED', trafficType: session.traffic_type, qaRunId: session.qa_run_id, stamp,
        });
        throw new ApiError(403, 'LEADERBOARD_SANCTIONED');
      }

      const play = db.prepare('SELECT * FROM play_sessions WHERE id=?').get(body.playSessionId);
      if (!play || play.session_hash !== session.id_hash || play.principal_id !== session.principal_id || play.game_id !== game.id || play.expires_at <= stamp) {
        throw new ApiError(403, 'PLAY_SESSION_INVALID');
      }
      if (board.min_play_ms > 0 && play.active_ms < board.min_play_ms) {
        recordRejectedSubmission({
          gameId: game.id, boardKey: board.board_key, periodKey, principalId: session.principal_id,
          playSessionId: play.id, requestKey, requestHash, rawScore: body.score,
          reason: 'MIN_PLAY_TIME_NOT_MET', trafficType: session.traffic_type, qaRunId: session.qa_run_id, stamp,
        });
        throw new ApiError(422, 'MIN_PLAY_TIME_NOT_MET');
      }
      if (board.max_score_bound !== null && (body.score > board.max_score_bound || (board.max_score_bound >= 0 && body.score < 0))) {
        recordRejectedSubmission({
          gameId: game.id, boardKey: board.board_key, periodKey, principalId: session.principal_id,
          playSessionId: play.id, requestKey, requestHash, rawScore: body.score,
          reason: 'SCORE_OUT_OF_BOUNDS', trafficType: session.traffic_type, qaRunId: session.qa_run_id, stamp,
        });
        throw new ApiError(422, 'SCORE_OUT_OF_BOUNDS');
      }

      const result = transaction(db, () => {
        const dup = db.prepare(`
          SELECT request_hash, accepted, reject_reason, response_json
          FROM leaderboard_submissions
          WHERE game_id=? AND board_key=? AND principal_id=? AND request_key=?
        `).get(game.id, board.board_key, session.principal_id, requestKey);
        if (dup) {
          if (dup.request_hash !== requestHash) throw new ApiError(409, 'IDEMPOTENCY_CONFLICT');
          return { replay: true, payload: JSON.parse(dup.response_json) };
        }

        const existing = db.prepare(`
          SELECT * FROM leaderboard_entries
          WHERE game_id=? AND board_key=? AND period_key=? AND principal_id=?
        `).get(game.id, board.board_key, periodKey, session.principal_id);

        let improved = false;
        let nextScore = body.score;
        let nextSort = toSortScore(body.score, board.sort_order);
        let nextTie = tieBreakerMs;
        let nextMeta = metadataJson;
        let nextAchieved = stamp;

        if (!existing) {
          improved = true;
          db.prepare(`
            INSERT INTO leaderboard_entries(
              game_id, board_key, period_key, principal_id, score, sort_score,
              tie_breaker_ms, metadata_json, submission_count, source, traffic_type, qa_run_id,
              excluded, exclude_reason, achieved_at, updated_at
            ) VALUES(?,?,?,?,?,?,?,?,1,'client',?,?,0,NULL,?,?)
          `).run(
            game.id, board.board_key, periodKey, session.principal_id,
            nextScore, nextSort, nextTie, nextMeta,
            session.traffic_type, session.qa_run_id || null, stamp, stamp
          );
        } else {
          if (board.score_mode === 'sum') {
            nextScore = existing.score + body.score;
            nextSort = toSortScore(nextScore, board.sort_order);
            improved = body.score !== 0;
          } else if (board.score_mode === 'latest') {
            improved = true;
          } else {
            // 'best' mode
            const candidateSort = toSortScore(body.score, board.sort_order);
            if (isBetterCandidate(candidateSort, tieBreakerMs, stamp, existing.sort_score, existing.tie_breaker_ms, existing.achieved_at)) {
              improved = true;
              nextScore = body.score;
              nextSort = candidateSort;
            } else {
              nextScore = existing.score;
              nextSort = existing.sort_score;
              nextTie = existing.tie_breaker_ms;
              nextMeta = existing.metadata_json;
              nextAchieved = existing.achieved_at;
            }
          }
          db.prepare(`
            UPDATE leaderboard_entries
            SET score=?, sort_score=?, tie_breaker_ms=?, metadata_json=?,
                submission_count=submission_count+1, achieved_at=?, updated_at=?
            WHERE game_id=? AND board_key=? AND period_key=? AND principal_id=?
          `).run(
            nextScore, nextSort, nextTie, nextMeta, nextAchieved, stamp,
            game.id, board.board_key, periodKey, session.principal_id
          );
        }

        const saved = db.prepare(`
          SELECT e.*, u.display_name, u.kind AS user_kind
          FROM leaderboard_entries e
          JOIN users u ON u.id = e.principal_id
          WHERE e.game_id=? AND e.board_key=? AND e.period_key=? AND e.principal_id=?
        `).get(game.id, board.board_key, periodKey, session.principal_id);

        const rank = (!saved.excluded && (board.guest_visible || saved.user_kind !== 'guest'))
          ? rankForEntry(board, periodKey, session.traffic_type, saved, stamp)
          : null;

        const payload = {
          ok: true,
          accepted: true,
          improved,
          board: serializeBoard(board),
          periodKey,
          rank,
          entry: serializeEntry(saved, rank, false),
        };

        db.prepare(`
          INSERT INTO leaderboard_submissions(
            id, game_id, board_key, period_key, principal_id, play_session_id,
            request_key, request_hash, raw_score, accepted, reject_reason, response_json,
            source, traffic_type, qa_run_id, created_at
          ) VALUES(?,?,?,?,?,?,?,?,?,1,NULL,?,'client',?,?,?)
        `).run(
          uid(), game.id, board.board_key, periodKey, session.principal_id, play.id,
          requestKey, requestHash, body.score, JSON.stringify(payload),
          session.traffic_type, session.qa_run_id || null, stamp
        );
        if (serverEvent) {
          serverEvent('leaderboard_score_submitted', session, game.id, play.id, {
            board_key: board.board_key,
            period_key: periodKey,
            improved,
          });
        }
        return { replay: false, payload };
      });

      json(res, result.replay ? 200 : 201, result.replay ? { ...result.payload, idempotentReplay: true } : result.payload);
      return true;
    }

    return false;
  }

  async function adminRoute(req, res, url, adminSession) {
    const p = url.pathname;
    const boardConfigMatch = p.match(/^\/api\/admin\/games\/([A-Za-z0-9_-]+)\/leaderboards\/([a-z0-9_-]+)$/);
    if (boardConfigMatch && req.method === 'PUT') {
      const game = findGame(rootDir, db, assertId(boardConfigMatch[1]), false);
      const boardKey = assertBoardKey(boardConfigMatch[2]);
      const body = await readJson(req, 8192);
      const allowed = new Set(['sortOrder', 'scoreMode', 'resetPeriod', 'maxScoreBound', 'minPlayMs', 'guestVisible', 'enabled']);
      if (Object.keys(body).some(key => !allowed.has(key))) throw new ApiError(422, 'BOARD_BODY_INVALID');

      const existing = db.prepare('SELECT * FROM leaderboard_boards WHERE game_id=? AND board_key=?').get(game.id, boardKey);
      const sortOrder = body.sortOrder ?? existing?.sort_order ?? 'desc';
      const scoreMode = body.scoreMode ?? existing?.score_mode ?? 'best';
      const resetPeriod = body.resetPeriod ?? existing?.reset_period ?? 'all';
      const maxScoreBound = body.maxScoreBound === undefined ? (existing?.max_score_bound ?? null) : body.maxScoreBound;
      const minPlayMs = body.minPlayMs === undefined ? (existing?.min_play_ms ?? 0) : body.minPlayMs;
      const guestVisible = body.guestVisible === undefined ? Boolean(existing ? existing.guest_visible : 1) : body.guestVisible;
      const enabled = body.enabled === undefined ? Boolean(existing ? existing.enabled : 1) : body.enabled;

      if (!SORT_ORDERS.has(sortOrder)) throw new ApiError(422, 'BOARD_SORT_ORDER_INVALID');
      if (!SCORE_MODES.has(scoreMode)) throw new ApiError(422, 'BOARD_SCORE_MODE_INVALID');
      if (!RESET_PERIODS.has(resetPeriod)) throw new ApiError(422, 'BOARD_RESET_PERIOD_INVALID');
      if (maxScoreBound !== null && (typeof maxScoreBound !== 'number' || !Number.isFinite(maxScoreBound) || Math.abs(maxScoreBound) > MAX_ABS_SCORE)) {
        throw new ApiError(422, 'BOARD_MAX_SCORE_INVALID');
      }
      if (!Number.isSafeInteger(minPlayMs) || minPlayMs < 0 || minPlayMs > 86400000) {
        throw new ApiError(422, 'BOARD_MIN_PLAY_MS_INVALID');
      }
      if (typeof guestVisible !== 'boolean' || typeof enabled !== 'boolean') {
        throw new ApiError(422, 'BOARD_FLAGS_INVALID');
      }

      const stamp = now();
      const board = transaction(db, () => {
        db.prepare(`
          INSERT INTO leaderboard_boards(
            game_id, board_key, sort_order, score_mode, reset_period,
            max_score_bound, min_play_ms, guest_visible, enabled, created_at, updated_at
          ) VALUES(?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(game_id, board_key) DO UPDATE SET
            sort_order=excluded.sort_order,
            score_mode=excluded.score_mode,
            reset_period=excluded.reset_period,
            max_score_bound=excluded.max_score_bound,
            min_play_ms=excluded.min_play_ms,
            guest_visible=excluded.guest_visible,
            enabled=excluded.enabled,
            updated_at=excluded.updated_at
        `).run(game.id, boardKey, sortOrder, scoreMode, resetPeriod, maxScoreBound, minPlayMs, guestVisible ? 1 : 0, enabled ? 1 : 0, stamp, stamp);
        if (existing && existing.sort_order !== sortOrder) {
          db.prepare('UPDATE leaderboard_entries SET sort_score = CASE WHEN ? = \'asc\' THEN -score ELSE score END WHERE game_id=? AND board_key=?').run(sortOrder, game.id, boardKey);
        }
        audit('leaderboard_board_configured', `${game.id}:${boardKey}`, { sortOrder, scoreMode, resetPeriod, maxScoreBound, minPlayMs, guestVisible, enabled, admin: adminSession?.admin_username || 'admin' });
        return db.prepare('SELECT * FROM leaderboard_boards WHERE game_id=? AND board_key=?').get(game.id, boardKey);
      });
      json(res, existing ? 200 : 201, { board: serializeBoard(board) });
      return true;
    }

    const entriesMatch = p.match(/^\/api\/admin\/games\/([A-Za-z0-9_-]+)\/leaderboards\/([a-z0-9_-]+)\/entries$/);
    if (entriesMatch && req.method === 'GET') {
      const game = findGame(rootDir, db, assertId(entriesMatch[1]), false);
      const boardKey = assertBoardKey(entriesMatch[2]);
      const board = getOrProvisionBoard(game.id, boardKey, { allowAutoDefault: true, requireEnabled: false });
      const dataset = url.searchParams.get('dataset') || 'live';
      if (!['live', 'qa'].includes(dataset)) throw new ApiError(400, 'DATASET_INVALID');
      const requestedPeriod = url.searchParams.get('period');
      if (requestedPeriod !== null && !PERIOD_KEY_RE.test(requestedPeriod)) throw new ApiError(400, 'LEADERBOARD_PERIOD_INVALID');
      const periodKey = requestedPeriod || computePeriodKey(board.reset_period, now());
      const limit = pageNumber(url.searchParams.get('limit'), 50, 1, 200);
      const offset = pageNumber(url.searchParams.get('offset'), 0, 0, 100000);
      json(res, 200, queryBoard(board, { periodKey, trafficType: dataset, limit, offset, includeExcluded: true }));
      return true;
    }

    const moderateMatch = p.match(/^\/api\/admin\/games\/([A-Za-z0-9_-]+)\/leaderboards\/([a-z0-9_-]+)\/entries\/([A-Za-z0-9_-]+)$/);
    if (moderateMatch && req.method === 'PATCH') {
      const game = findGame(rootDir, db, assertId(moderateMatch[1]), false);
      const boardKey = assertBoardKey(moderateMatch[2]);
      const principalId = moderateMatch[3];
      const board = getOrProvisionBoard(game.id, boardKey, { allowAutoDefault: false, requireEnabled: false });
      const body = await readJson(req, 4096);
      if (Object.keys(body).some(k => !['excluded', 'reason', 'periodKey'].includes(k))) throw new ApiError(422, 'MODERATION_BODY_INVALID');
      if (typeof body.excluded !== 'boolean') throw new ApiError(422, 'EXCLUDED_BOOLEAN_REQUIRED');
      const periodKey = body.periodKey || computePeriodKey(board.reset_period, now());
      if (!PERIOD_KEY_RE.test(periodKey)) throw new ApiError(422, 'LEADERBOARD_PERIOD_INVALID');
      const reason = body.reason === undefined ? null : (typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : null);
      const stamp = now();
      const updated = transaction(db, () => {
        const resUpdate = db.prepare(`
          UPDATE leaderboard_entries
          SET excluded=?, exclude_reason=?, updated_at=?
          WHERE game_id=? AND board_key=? AND period_key=? AND principal_id=?
        `).run(body.excluded ? 1 : 0, body.excluded ? reason : null, stamp, game.id, boardKey, periodKey, principalId);
        if (!resUpdate.changes) throw new ApiError(404, 'LEADERBOARD_ENTRY_NOT_FOUND');
        audit('leaderboard_entry_moderated', `${game.id}:${boardKey}:${principalId}`, { periodKey, excluded: body.excluded, reason, admin: adminSession?.admin_username || 'admin' });
        return db.prepare(`
          SELECT e.*, u.display_name, u.kind AS user_kind
          FROM leaderboard_entries e JOIN users u ON u.id=e.principal_id
          WHERE e.game_id=? AND e.board_key=? AND e.period_key=? AND e.principal_id=?
        `).get(game.id, boardKey, periodKey, principalId);
      });
      json(res, 200, { entry: serializeEntry(updated, null, true) });
      return true;
    }

    const snapshotMatch = p.match(/^\/api\/admin\/games\/([A-Za-z0-9_-]+)\/leaderboards\/([a-z0-9_-]+)\/snapshot$/);
    if (snapshotMatch && req.method === 'GET') {
      const game = findGame(rootDir, db, assertId(snapshotMatch[1]), false);
      const boardKey = assertBoardKey(snapshotMatch[2]);
      const board = getOrProvisionBoard(game.id, boardKey, { allowAutoDefault: true, requireEnabled: false });
      const requestedPeriod = url.searchParams.get('period');
      if (requestedPeriod !== null && !PERIOD_KEY_RE.test(requestedPeriod)) throw new ApiError(400, 'LEADERBOARD_PERIOD_INVALID');
      const periodKey = requestedPeriod || computePeriodKey(board.reset_period, now());
      const limit = pageNumber(url.searchParams.get('limit'), 1000, 1, 10000);
      const data = queryBoard(board, { periodKey, trafficType: 'live', limit, offset: 0, includeExcluded: false });
      const bodyPayload = {
        schemaVersion: 1,
        exportedAt: new Date(now()).toISOString(),
        gameId: game.id,
        boardKey,
        periodKey,
        board: data.board,
        totalEntries: data.total,
        entries: data.entries,
      };
      const sha256 = digest(JSON.stringify(bodyPayload));
      json(res, 200, { ...bodyPayload, sha256 });
      return true;
    }

    return false;
  }

  return { publicRoute, adminRoute };
}
