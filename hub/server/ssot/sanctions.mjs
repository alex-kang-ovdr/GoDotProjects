import { transaction } from '../db.mjs';
import { ApiError, json, readJson, safeString, uid } from '../security.mjs';

const SCOPES = new Set(['all', 'leaderboard', 'community', 'voice', 'multiplayer']);
const ACTIONS = new Set(['exclude', 'mute', 'ban']);
const EOS_SYNC_SCOPES = new Set(['all', 'voice', 'multiplayer']);
const EOS_SYNC_STATUSES = new Set(['not_applicable', 'pending', 'synced', 'failed']);

function pageNumber(value, fallback, min, max) {
  if (value === null) return fallback;
  if (!/^\d{1,10}$/.test(value) || Number(value) < min || Number(value) > max) {
    throw new ApiError(400, 'SANCTION_PAGINATION_INVALID');
  }
  return Number(value);
}

function cleanText(value, min, max, code) {
  const trimmed = typeof value === 'string' ? value.trim() : null;
  if (trimmed === null || trimmed.length < min || trimmed.length > max || trimmed.includes('\0')) {
    throw new ApiError(422, code);
  }
  return trimmed;
}

function serializeSanction(row, admin = false) {
  const result = {
    id: row.id,
    scope: row.scope,
    action: row.action,
    reason: row.reason,
    active: Boolean(row.active),
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
  };
  if (admin) {
    result.principalId = row.principal_id;
    result.evidence = JSON.parse(row.evidence_json || '{}');
    result.createdBy = row.created_by;
    result.revokedAt = row.revoked_at ? new Date(row.revoked_at).toISOString() : null;
    result.revokedBy = row.revoked_by || null;
    result.eosTargetPuid = row.eos_target_puid || null;
    result.eosSyncStatus = row.eos_sync_status;
    result.eosSyncedAt = row.eos_synced_at ? new Date(row.eos_synced_at).toISOString() : null;
  }
  return result;
}

export function hasActiveSanction(db, principalId, scopes, nowMs) {
  if (!principalId || !scopes?.length) return false;
  const placeholders = scopes.map(() => '?').join(',');
  const row = db.prepare(`
    SELECT 1 AS hit FROM user_sanctions
    WHERE principal_id=? AND active=1 AND scope IN (${placeholders})
      AND (expires_at IS NULL OR expires_at > ?)
    LIMIT 1
  `).get(principalId, ...scopes, nowMs);
  return Boolean(row);
}

// Prevent sanction evasion by carrying active guest sanctions onto the merged account.
export function mergeGuestSanctions(db, source, target) {
  if (!source || !target || source === target) return;
  db.prepare('UPDATE user_sanctions SET principal_id=? WHERE principal_id=?').run(target, source);
}

export function createSanctions({ db, now, sessionFor, audit }) {
  async function publicRoute(req, res, url) {
    if (url.pathname !== '/api/me/sanctions' || req.method !== 'GET') return false;
    const s = sessionFor(req, 'public');
    if (!s?.principal_id) {
      json(res, 200, { sanctions: [] });
      return true;
    }
    const stamp = now();
    const rows = db.prepare(`
      SELECT * FROM user_sanctions
      WHERE principal_id=? AND active=1 AND (expires_at IS NULL OR expires_at > ?)
      ORDER BY created_at DESC, id DESC
    `).all(s.principal_id, stamp);
    json(res, 200, { sanctions: rows.map(row => serializeSanction(row, false)) });
    return true;
  }

  async function adminRoute(req, res, url, adminSession) {
    const p = url.pathname;
    if (p === '/api/admin/sanctions' && req.method === 'GET') {
      const principalId = url.searchParams.get('principalId');
      const scope = url.searchParams.get('scope');
      const activeParam = url.searchParams.get('active') || 'all';
      const eosSyncStatus = url.searchParams.get('eosSyncStatus');
      if (scope && !SCOPES.has(scope)) throw new ApiError(400, 'SANCTION_SCOPE_INVALID');
      if (!['all', 'true', 'false'].includes(activeParam)) throw new ApiError(400, 'SANCTION_FILTER_INVALID');
      if (eosSyncStatus && !EOS_SYNC_STATUSES.has(eosSyncStatus)) throw new ApiError(400, 'SANCTION_SYNC_FILTER_INVALID');
      const limit = pageNumber(url.searchParams.get('limit'), 50, 1, 200);
      const offset = pageNumber(url.searchParams.get('offset'), 0, 0, 100000);
      const filters = [];
      const values = [];
      const stamp = now();
      if (principalId) { filters.push('principal_id=?'); values.push(principalId); }
      if (scope) { filters.push('scope=?'); values.push(scope); }
      if (activeParam === 'true') { filters.push('active=1 AND (expires_at IS NULL OR expires_at > ?)'); values.push(stamp); }
      if (activeParam === 'false') { filters.push('(active=0 OR (expires_at IS NOT NULL AND expires_at <= ?))'); values.push(stamp); }
      if (eosSyncStatus) { filters.push('eos_sync_status=?'); values.push(eosSyncStatus); }
      const where = filters.length ? 'WHERE ' + filters.join(' AND ') : '';
      const total = db.prepare(`SELECT COUNT(*) AS n FROM user_sanctions ${where}`).get(...values).n;
      const rows = db.prepare(`SELECT * FROM user_sanctions ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`).all(...values, limit, offset);
      json(res, 200, {
        sanctions: rows.map(row => serializeSanction(row, true)),
        total,
        hasMore: offset + rows.length < total,
      });
      return true;
    }

    if (p === '/api/admin/sanctions' && req.method === 'POST') {
      const body = await readJson(req, 8192);
      const allowed = new Set(['principalId', 'scope', 'action', 'reason', 'evidence', 'expiresAt', 'eosTargetPuid']);
      if (Object.keys(body).some(key => !allowed.has(key))) throw new ApiError(422, 'SANCTION_BODY_INVALID');
      const principalId = safeString(body.principalId, 128) ? body.principalId : null;
      if (!principalId) throw new ApiError(422, 'SANCTION_PRINCIPAL_REQUIRED');
      const user = db.prepare('SELECT id FROM users WHERE id=?').get(principalId);
      if (!user) throw new ApiError(404, 'USER_NOT_FOUND');
      if (!SCOPES.has(body.scope)) throw new ApiError(422, 'SANCTION_SCOPE_INVALID');
      if (!ACTIONS.has(body.action)) throw new ApiError(422, 'SANCTION_ACTION_INVALID');
      const reason = cleanText(body.reason, 1, 500, 'SANCTION_REASON_INVALID');
      const stamp = now();
      let expiresAt = null;
      if (body.expiresAt !== undefined && body.expiresAt !== null) {
        const parsed = typeof body.expiresAt === 'number' ? body.expiresAt : Date.parse(body.expiresAt);
        if (!Number.isFinite(parsed) || parsed <= stamp) throw new ApiError(422, 'SANCTION_EXPIRY_INVALID');
        expiresAt = Math.floor(parsed);
      }
      let evidenceJson = '{}';
      if (body.evidence !== undefined) {
        if (!body.evidence || typeof body.evidence !== 'object' || Array.isArray(body.evidence)) {
          throw new ApiError(422, 'SANCTION_EVIDENCE_INVALID');
        }
        evidenceJson = JSON.stringify(body.evidence);
        if (evidenceJson.length > 4096) throw new ApiError(422, 'SANCTION_EVIDENCE_INVALID');
      }
      let eosTargetPuid = null;
      if (body.eosTargetPuid !== undefined && body.eosTargetPuid !== null) {
        if (typeof body.eosTargetPuid !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(body.eosTargetPuid)) {
          throw new ApiError(422, 'EOS_PUID_INVALID');
        }
        eosTargetPuid = body.eosTargetPuid;
      }
      const eosSyncStatus = (eosTargetPuid && EOS_SYNC_SCOPES.has(body.scope)) ? 'pending' : 'not_applicable';
      const id = uid();
      const createdBy = adminSession?.admin_username || 'admin';
      const created = transaction(db, () => {
        db.prepare(`
          INSERT INTO user_sanctions(
            id, principal_id, scope, action, reason, evidence_json, active, expires_at,
            created_by, created_at, revoked_at, revoked_by, eos_target_puid, eos_sync_status, eos_synced_at
          ) VALUES(?,?,?,?,?,?,1,?,?,?,NULL,NULL,?,?,NULL)
        `).run(id, principalId, body.scope, body.action, reason, evidenceJson, expiresAt, createdBy, stamp, eosTargetPuid, eosSyncStatus);
        audit('user_sanction_created', principalId, { sanctionId: id, scope: body.scope, action: body.action, eosSyncStatus, admin: createdBy });
        return db.prepare('SELECT * FROM user_sanctions WHERE id=?').get(id);
      });
      json(res, 201, { sanction: serializeSanction(created, true) });
      return true;
    }

    const revokeMatch = p.match(/^\/api\/admin\/sanctions\/([A-Za-z0-9_-]+)\/revoke$/);
    if (revokeMatch && req.method === 'POST') {
      const body = await readJson(req, 4096);
      if (Object.keys(body).some(key => key !== 'reason')) throw new ApiError(422, 'SANCTION_BODY_INVALID');
      const note = body.reason === undefined ? null : cleanText(body.reason, 1, 500, 'SANCTION_REASON_INVALID');
      const id = revokeMatch[1];
      const stamp = now();
      const actor = adminSession?.admin_username || 'admin';
      const updated = transaction(db, () => {
        const current = db.prepare('SELECT * FROM user_sanctions WHERE id=?').get(id);
        if (!current) throw new ApiError(404, 'SANCTION_NOT_FOUND');
        if (!current.active) return current;
        const nextSync = current.eos_sync_status === 'synced' ? 'pending' : (current.eos_sync_status === 'pending' ? 'not_applicable' : current.eos_sync_status);
        db.prepare(`
          UPDATE user_sanctions
          SET active=0, revoked_at=?, revoked_by=?, eos_sync_status=?
          WHERE id=?
        `).run(stamp, actor, nextSync, id);
        audit('user_sanction_revoked', current.principal_id, { sanctionId: id, note, eosSyncStatus: nextSync, admin: actor });
        return db.prepare('SELECT * FROM user_sanctions WHERE id=?').get(id);
      });
      json(res, 200, { sanction: serializeSanction(updated, true) });
      return true;
    }

    return false;
  }

  return { publicRoute, adminRoute };
}
