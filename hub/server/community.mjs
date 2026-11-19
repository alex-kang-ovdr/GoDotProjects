import { findGame } from './catalog.mjs';
import { transaction } from './db.mjs';
import { ApiError, assertId, json, readJson, uid } from './security.mjs';

const kinds = new Set(['all', 'comment', 'suggestion']);
const statuses = new Set(['open', 'planned', 'completed', 'declined']);
const visibilities = new Set(['all', 'visible', 'hidden']);
const minute = 60000;

function validateKeys(input, keys) {
  if (Object.keys(input).some(key => !keys.includes(key))) throw new ApiError(422, 'COMMUNITY_BODY_INVALID');
}

function text(value, min, max, code) {
  const trimmed = typeof value === 'string' ? value.trim() : null;
  if (trimmed === null || trimmed.length < min || trimmed.length > max || trimmed.includes('\0')) {
    throw new ApiError(422, code);
  }
  return trimmed;
}

function entryContent(input, kind, previous) {
  const title = input.title === undefined ? previous?.title ?? '' : input.title;
  const body = input.body === undefined ? previous?.body : input.body;
  return {
    title: text(title, kind === 'suggestion' ? 1 : 0, kind === 'suggestion' ? 100 : 0, 'COMMUNITY_TITLE_INVALID'),
    body: text(body, 1, 2000, 'COMMUNITY_TEXT_INVALID')
  };
}

function pageNumber(value, fallback, min, max) {
  if (value === null) return fallback;
  if (!/^\d{1,10}$/.test(value) || Number(value) < min || Number(value) > max) {
    throw new ApiError(400, 'COMMUNITY_PAGINATION_INVALID');
  }
  return Number(value);
}

async function readEmptyBody(req) {
  if (!req.headers['transfer-encoding'] && !Number(req.headers['content-length'])) return;
  validateKeys(await readJson(req, 1024), []);
}

export function mergeGuestCommunity(db, source, target) {
  if (source === target) return;
  db.prepare('UPDATE community_items SET author_id=? WHERE author_id=?').run(target, source);
  db.prepare('INSERT INTO community_votes(item_id,principal_id,created_at) SELECT item_id,?,created_at FROM community_votes WHERE principal_id=? ON CONFLICT(item_id,principal_id) DO NOTHING').run(target, source);
  db.prepare('DELETE FROM community_votes WHERE principal_id=?').run(source);
  db.prepare('INSERT INTO community_reports(item_id,principal_id,reason,created_at) SELECT item_id,?,reason,created_at FROM community_reports WHERE principal_id=? ON CONFLICT(item_id,principal_id) DO NOTHING').run(target, source);
  db.prepare('DELETE FROM community_reports WHERE principal_id=?').run(source);
}

export function createCommunity({ db, rootDir, now, sessionFor, requireSession, promote, rate, audit }) {
  const detailFields = `
    c.*, u.display_name AS author_name, c.author_id IS ? AS is_owner,
    (SELECT COUNT(*) FROM community_votes v WHERE v.item_id=c.id) AS vote_count,
    EXISTS(SELECT 1 FROM community_votes v WHERE v.item_id=c.id AND v.principal_id=?) AS voted`;
  const reportDetails = db.prepare('SELECT reason,created_at FROM community_reports WHERE item_id=? ORDER BY created_at DESC,principal_id LIMIT 10');
  const adminFields = ', (SELECT COUNT(*) FROM community_reports r WHERE r.item_id=c.id) AS report_count';

  function item(row, admin = false) {
    const result = {
      id:row.id, gameId:row.game_id, kind:row.kind, title:row.title, body:row.body,
      authorName:row.author_name || 'Guest', isOwner:Boolean(row.is_owner),
      createdAt:new Date(row.created_at).toISOString(), updatedAt:new Date(row.updated_at).toISOString(),
      status:row.status, voteCount:row.vote_count, voted:Boolean(row.voted), hidden:Boolean(row.hidden)
    };
    if (admin) {
      result.reportCount = row.report_count;
      result.reports = reportDetails.all(row.id).map(report => ({
        reason:report.reason, createdAt:new Date(report.created_at).toISOString()
      }));
    }
    return result;
  }

  function list(query, gameId, principal, admin) {
    const requestedKind = query.get('kind');
    const kind = requestedKind === null || (admin && requestedKind === '') ? 'all' : requestedKind;
    const visibility = admin ? query.get('visibility') ?? 'all' : 'visible';
    const reported = admin ? query.get('reported') ?? 'all' : 'all';
    if (!kinds.has(kind) || !visibilities.has(visibility) || !['all', 'only'].includes(reported)) throw new ApiError(400, 'COMMUNITY_FILTER_INVALID');
    const offset = pageNumber(query.get('offset'), 0, 0, 1000000);
    const limit = pageNumber(query.get('limit'), 20, 1, 100);
    const filters = [];
    const values = [];
    if (gameId) { filters.push('game_id=?'); values.push(gameId); }
    if (kind !== 'all') { filters.push('kind=?'); values.push(kind); }
    if (visibility !== 'all') { filters.push('hidden=?'); values.push(Number(visibility === 'hidden')); }
    if (reported === 'only') { filters.push('EXISTS (SELECT 1 FROM community_reports r WHERE r.item_id=community_items.id)'); }
    const where = filters.length ? 'WHERE ' + filters.join(' AND ') : '';
    const rows = db.prepare(`
      WITH matching AS NOT MATERIALIZED (SELECT * FROM community_items ${where}),
      page AS (SELECT * FROM matching ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?)
      SELECT (SELECT COUNT(*) FROM matching) AS total, ${detailFields}${admin ? adminFields : ''}
      FROM (SELECT 1) LEFT JOIN page c ON 1 LEFT JOIN users u ON u.id=c.author_id
      ORDER BY c.created_at DESC,c.id DESC
    `).all(...values, limit, offset, principal, principal);
    const total = rows[0].total;
    const items = rows.filter(row => row.id !== null).map(row => item(row, admin));
    return { items, total, hasMore:offset + items.length < total };
  }

  function byId(id, principal, admin = false) {
    const row = db.prepare(`
      SELECT ${detailFields}${admin ? adminFields : ''}
      FROM community_items c JOIN users u ON u.id=c.author_id
      WHERE c.id=? AND (? OR c.hidden=0)
    `).get(principal, principal, id, Number(admin));
    if (!row) throw new ApiError(404, 'COMMUNITY_NOT_FOUND');
    return row;
  }

  function writeSession(req, kind) {
    const session = requireSession(req, kind, kind === 'admin');
    rate('community:ip:' + kind + ':' + req.socket.remoteAddress, 120, minute);
    rate('community:session:' + session.id_hash, 30, minute);
    return session;
  }

  function writeActor(req, res, session, getTarget, promoteAnonymous) {
    let actor = requireSession(req, 'public');
    if (session.id_hash !== actor.id_hash) throw new ApiError(401, 'SESSION_REQUIRED');
    if (promoteAnonymous && !actor.principal_id) {
      getTarget();
      actor = promote(actor, req, res);
    }
    if (actor.principal_id) rate('community:principal:' + actor.principal_id, 30, minute);
    return actor;
  }

  async function publicRoute(req, res, url) {
    const gamePath = url.pathname.match(/^\/api\/games\/([a-zA-Z0-9_-]+)\/community$/);
    if (gamePath && req.method === 'GET') {
      const gameId = findGame(rootDir, db, assertId(gamePath[1])).id;
      json(res, 200, list(url.searchParams, gameId, sessionFor(req, 'public')?.principal_id ?? null, false));
      return true;
    }
    if (gamePath && req.method === 'POST') {
      const gameId = assertId(gamePath[1]);
      const session = writeSession(req, 'public');
      const input = await readJson(req, 16384);
      validateKeys(input, ['kind', 'title', 'body']);
      if (!['comment', 'suggestion'].includes(input.kind)) throw new ApiError(422, 'COMMUNITY_KIND_INVALID');
      const {title, body} = entryContent(input, input.kind);
      const getGame = () => findGame(rootDir, db, gameId);
      const actor = writeActor(req, res, session, getGame, true);
      const created = transaction(db, () => {
        getGame();
        const id = uid(), stamp = now();
        db.prepare('INSERT INTO community_items VALUES(?,?,?,?,?,?,?,0,?,?)').run(id, gameId, actor.principal_id, input.kind, title, body, 'open', stamp, stamp);
        return item(byId(id, actor.principal_id));
      });
      json(res, 201, {item:created});
      return true;
    }

    const itemPath = url.pathname.match(/^\/api\/community\/([a-zA-Z0-9_-]+)(?:\/(vote|report))?$/);
    if (!itemPath) return false;
    const [, rawId, action] = itemPath;
    const method = req.method;
    const isVote = action === 'vote' && ['PUT', 'DELETE'].includes(method);
    const isReport = action === 'report' && method === 'POST';
    const isOwnerMutation = !action && ['PATCH', 'DELETE'].includes(method);
    if (!(isVote || isReport || isOwnerMutation)) return false;

    const id = assertId(rawId);
    const session = writeSession(req, 'public');
    let input;
    if (method === 'PATCH' || isReport) input = await readJson(req, isReport ? 4096 : 16384);
    else await readEmptyBody(req);
    let reason;
    if (isReport) {
      validateKeys(input, ['reason']);
      reason = text(input.reason, 1, 500, 'COMMUNITY_REPORT_INVALID');
    }
    const getTarget = (principal = null) => {
      const row = byId(id, principal);
      findGame(rootDir, db, row.game_id);
      if (isVote && row.kind !== 'suggestion') throw new ApiError(422, 'COMMUNITY_VOTE_NOT_SUPPORTED');
      return row;
    };
    const actor = writeActor(req, res, session, getTarget, isReport || (isVote && method === 'PUT'));
    const result = transaction(db, () => {
      const row = getTarget(actor.principal_id);
      if (isReport) {
        db.prepare('INSERT INTO community_reports VALUES(?,?,?,?) ON CONFLICT(item_id,principal_id) DO NOTHING').run(id, actor.principal_id, reason, now());
        return {ok:true};
      }
      if (isVote) {
        if (method === 'PUT') db.prepare('INSERT INTO community_votes VALUES(?,?,?) ON CONFLICT(item_id,principal_id) DO NOTHING').run(id, actor.principal_id, now());
        else if (actor.principal_id) db.prepare('DELETE FROM community_votes WHERE item_id=? AND principal_id=?').run(id, actor.principal_id);
        return {item:item(byId(id, actor.principal_id))};
      }
      if (!row.is_owner) throw new ApiError(403, 'COMMUNITY_OWNER_REQUIRED');
      if (method === 'DELETE') {
        db.prepare('DELETE FROM community_items WHERE id=?').run(id);
        return {ok:true};
      }
      validateKeys(input, ['title', 'body']);
      if (!Object.keys(input).length) throw new ApiError(422, 'COMMUNITY_BODY_INVALID');
      const {title, body} = entryContent(input, row.kind, row);
      db.prepare('UPDATE community_items SET title=?,body=?,updated_at=? WHERE id=?').run(title, body, now(), id);
      return {item:item(byId(id, actor.principal_id))};
    });
    json(res, 200, result);
    return true;
  }

  async function adminRoute(req, res, url) {
    if (url.pathname === '/api/admin/community' && req.method === 'GET') {
      const gameId = url.searchParams.get('gameId');
      if (gameId) findGame(rootDir, db, assertId(gameId), false);
      json(res, 200, list(url.searchParams, gameId, null, true));
      return true;
    }
    const match = url.pathname.match(/^\/api\/admin\/community\/([a-zA-Z0-9_-]+)$/);
    if (!match || req.method !== 'PATCH') return false;
    const id = assertId(match[1]);
    writeSession(req, 'admin');
    const input = await readJson(req, 4096);
    const admin = requireSession(req, 'admin', true);
    validateKeys(input, ['hidden', 'status']);
    if (!Object.keys(input).length || (input.hidden !== undefined && typeof input.hidden !== 'boolean') ||
        (input.status !== undefined && !statuses.has(input.status))) throw new ApiError(422, 'COMMUNITY_MODERATION_INVALID');

    const changed = transaction(db, () => {
      const row = byId(id, null, true);
      if (input.status !== undefined && row.kind !== 'suggestion') throw new ApiError(422, 'COMMUNITY_STATUS_NOT_SUPPORTED');
      const hidden = input.hidden ?? Boolean(row.hidden);
      const status = input.status ?? row.status;
      if (hidden !== Boolean(row.hidden) || status !== row.status) {
        db.prepare('UPDATE community_items SET hidden=?,status=?,updated_at=? WHERE id=?').run(Number(hidden), status, now(), id);
        audit('community_moderated', id, {gameId:row.game_id, hidden, status, admin:admin.admin_username});
      }
      return item(byId(id, null, true), true);
    });
    json(res, 200, {item:changed});
    return true;
  }

  return { publicRoute, adminRoute };
}
