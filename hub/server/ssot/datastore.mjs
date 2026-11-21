import { findGame } from '../catalog.mjs';
import { transaction } from '../db.mjs';
import { ApiError, assertId, digest, json, readJson, safeString, uid } from '../security.mjs';

const SCOPE_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const ENTRY_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/;
const HOLDER_RE = /^[A-Za-z0-9][A-Za-z0-9:._-]{2,127}$/;
const MAX_VERSIONS_PER_KEY = 20;
const TOMBSTONE_ETAG = 'deleted';

function isTombstone(row) {
  return Boolean(row && row.value_json === '' && row.etag === TOMBSTONE_ETAG);
}

const DEFAULT_QUOTA = {
  max_keys: 10000,
  max_value_bytes: 262144, // 256 KiB per key
  max_total_bytes: 67108864, // 64 MiB per game
  default_lease_ms: 30000,
  max_lease_ms: 120000,
  enabled: 1,
};

function assertScope(raw) {
  if (typeof raw !== 'string' || !SCOPE_RE.test(raw)) throw new ApiError(400, 'DATASTORE_SCOPE_INVALID');
  return raw;
}

function assertEntryKey(raw) {
  if (typeof raw !== 'string' || !ENTRY_KEY_RE.test(raw)) throw new ApiError(400, 'DATASTORE_KEY_INVALID');
  return raw;
}

function assertHolderId(raw) {
  if (typeof raw !== 'string' || !HOLDER_RE.test(raw)) throw new ApiError(422, 'DATASTORE_HOLDER_INVALID');
  return raw;
}

function pageNumber(value, fallback, min, max) {
  if (value === null) return fallback;
  if (!/^\d{1,10}$/.test(value) || Number(value) < min || Number(value) > max) {
    throw new ApiError(400, 'DATASTORE_PAGINATION_INVALID');
  }
  return Number(value);
}

function parseIfMatch(header) {
  if (header === undefined) return null;
  if (typeof header !== 'string' || !/^"r(\d+)"$/.test(header.trim())) {
    throw new ApiError(400, 'DATASTORE_PRECONDITION_INVALID');
  }
  return Number(header.trim().slice(2, -1));
}

function serializeQuota(gameId, row) {
  const q = row || DEFAULT_QUOTA;
  return {
    gameId,
    maxKeys: q.max_keys,
    maxValueBytes: q.max_value_bytes,
    maxTotalBytes: q.max_total_bytes,
    defaultLeaseMs: q.default_lease_ms,
    maxLeaseMs: q.max_lease_ms,
    enabled: Boolean(q.enabled),
  };
}

function serializeEntry(row, stamp) {
  const locked = Boolean(row.lock_holder && row.lock_expires_at && row.lock_expires_at > stamp);
  return {
    gameId: row.game_id,
    scope: row.scope,
    key: row.entry_key,
    ownerPrincipalId: row.owner_principal_id || null,
    revision: row.revision,
    etag: row.etag,
    bytes: row.bytes,
    value: JSON.parse(row.value_json),
    fencingToken: row.fencing_token,
    locked,
    lockHolder: locked ? row.lock_holder : null,
    lockExpiresAt: locked ? new Date(row.lock_expires_at).toISOString() : null,
    updatedBy: row.updated_by,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

// Re-attribute guest-owned player datastore rows onto the merged account.
export function mergeGuestDataStore(db, source, target) {
  if (!source || !target || source === target) return;
  db.prepare('UPDATE datastore_entries SET owner_principal_id=? WHERE owner_principal_id=?').run(target, source);
}

export function createDataStore({ db, rootDir, now, audit, verifyInternalAccess }) {
  function quotaFor(gameId) {
    const row = db.prepare('SELECT * FROM datastore_quotas WHERE game_id=?').get(gameId);
    const q = row || DEFAULT_QUOTA;
    if (!q.enabled) throw new ApiError(403, 'DATASTORE_DISABLED');
    return q;
  }

  function trimVersions(gameId, scope, entryKey) {
    db.prepare(`
      DELETE FROM datastore_versions
      WHERE id IN (
        SELECT id FROM datastore_versions
        WHERE game_id=? AND scope=? AND entry_key=?
        ORDER BY revision DESC, created_at DESC
        LIMIT -1 OFFSET ?
      )
    `).run(gameId, scope, entryKey, MAX_VERSIONS_PER_KEY);
  }

  function archiveVersion(row, reason, updatedBy, stamp) {
    db.prepare(`
      INSERT INTO datastore_versions(
        id, game_id, scope, entry_key, revision, value_json, bytes, reason, updated_by, created_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?)
    `).run(uid(), row.game_id, row.scope, row.entry_key, row.revision, row.value_json, row.bytes, reason, updatedBy, stamp);
    trimVersions(row.game_id, row.scope, row.entry_key);
  }

  function assertOwnerExists(principalId) {
    if (principalId === null || principalId === undefined) return null;
    if (!safeString(principalId, 128)) throw new ApiError(422, 'DATASTORE_OWNER_INVALID');
    const u = db.prepare('SELECT id FROM users WHERE id=?').get(principalId);
    if (!u) throw new ApiError(404, 'USER_NOT_FOUND');
    return principalId;
  }

  function assertLockForMutation(current, { holderId, fencingToken }, stamp) {
    const live = Boolean(current && !isTombstone(current));
    const activeLock = Boolean(live && current.lock_holder && current.lock_expires_at && current.lock_expires_at > stamp);
    if (activeLock) {
      if (!holderId || holderId !== current.lock_holder) {
        throw new ApiError(423, 'DATASTORE_LOCK_HELD', '다른 서버가 세션 락을 보유하고 있습니다.', {
          lockHolder: current.lock_holder,
          lockExpiresAt: new Date(current.lock_expires_at).toISOString(),
        });
      }
      if (fencingToken === undefined || fencingToken === null) {
        throw new ApiError(409, 'DATASTORE_FENCING_TOKEN_REQUIRED');
      }
      if (!Number.isSafeInteger(fencingToken) || fencingToken < 1) {
        throw new ApiError(422, 'DATASTORE_FENCING_TOKEN_INVALID');
      }
      if (fencingToken !== current.fencing_token) {
        throw new ApiError(409, 'DATASTORE_FENCING_TOKEN_STALE');
      }
      return;
    }
    // Lock-protected keys (fencing_token > 0) require a valid matching fencingToken even after
    // lease expiry, unlock, force-unlock, or delete so zombie writers cannot omit it to bypass fencing.
    if (current && current.fencing_token > 0) {
      if (fencingToken === undefined || fencingToken === null) {
        throw new ApiError(409, 'DATASTORE_FENCING_TOKEN_REQUIRED');
      }
      if (!Number.isSafeInteger(fencingToken) || fencingToken < 1) {
        throw new ApiError(422, 'DATASTORE_FENCING_TOKEN_INVALID');
      }
      if (fencingToken !== current.fencing_token) {
        throw new ApiError(409, 'DATASTORE_FENCING_TOKEN_STALE');
      }
      if (current.lock_holder && current.lock_expires_at && current.lock_expires_at <= stamp) {
        throw new ApiError(409, 'DATASTORE_LOCK_EXPIRED');
      }
      return;
    }
    // Unprotected CAS-only entries (never locked, fencing_token === 0) or missing entries:
    // fencingToken is optional, but if supplied it cannot match 0/missing.
    if (fencingToken !== undefined && fencingToken !== null) {
      if (!Number.isSafeInteger(fencingToken) || fencingToken < 1) {
        throw new ApiError(422, 'DATASTORE_FENCING_TOKEN_INVALID');
      }
      throw new ApiError(409, 'DATASTORE_FENCING_TOKEN_STALE');
    }
  }

  async function internalRoute(req, res, url) {
    const p = url.pathname;
    if (!p.startsWith('/internal/v1/datastore/')) return false;
    verifyInternalAccess(req, res);

    // GET /internal/v1/datastore/games/:gameId/scopes/:scope/keys
    const listMatch = p.match(/^\/internal\/v1\/datastore\/games\/([A-Za-z0-9_-]+)\/scopes\/([a-z0-9_-]+)\/keys$/);
    if (listMatch && req.method === 'GET') {
      const game = findGame(rootDir, db, assertId(listMatch[1]), false);
      const scope = assertScope(listMatch[2]);
      quotaFor(game.id);
      const prefix = url.searchParams.get('prefix') || '';
      if (prefix.length > 128 || prefix.includes('\0') || prefix.includes('%') || prefix.includes('_')) {
        throw new ApiError(400, 'DATASTORE_PREFIX_INVALID');
      }
      const limit = pageNumber(url.searchParams.get('limit'), 50, 1, 200);
      const offset = pageNumber(url.searchParams.get('offset'), 0, 0, 100000);
      const stamp = now();
      const where = prefix ? 'WHERE game_id=? AND scope=? AND etag!=? AND entry_key LIKE ?' : 'WHERE game_id=? AND scope=? AND etag!=?';
      const args = prefix ? [game.id, scope, TOMBSTONE_ETAG, prefix + '%'] : [game.id, scope, TOMBSTONE_ETAG];
      const total = db.prepare(`SELECT COUNT(*) AS n FROM datastore_entries ${where}`).get(...args).n;
      const rows = db.prepare(`SELECT * FROM datastore_entries ${where} ORDER BY entry_key ASC LIMIT ? OFFSET ?`).all(...args, limit, offset);
      json(res, 200, {
        gameId: game.id,
        scope,
        total,
        hasMore: offset + rows.length < total,
        keys: rows.map(row => ({
          key: row.entry_key,
          revision: row.revision,
          etag: row.etag,
          bytes: row.bytes,
          ownerPrincipalId: row.owner_principal_id || null,
          fencingToken: row.fencing_token,
          locked: Boolean(row.lock_holder && row.lock_expires_at && row.lock_expires_at > stamp),
          updatedAt: new Date(row.updated_at).toISOString(),
        })),
      });
      return true;
    }

    // POST /internal/v1/datastore/games/:gameId/scopes/:scope/keys/:key/lock
    const lockMatch = p.match(/^\/internal\/v1\/datastore\/games\/([A-Za-z0-9_-]+)\/scopes\/([a-z0-9_-]+)\/keys\/([A-Za-z0-9:._-]+)\/lock$/);
    if (lockMatch && req.method === 'POST') {
      const game = findGame(rootDir, db, assertId(lockMatch[1]), false);
      const scope = assertScope(lockMatch[2]);
      const entryKey = assertEntryKey(lockMatch[3]);
      const quota = quotaFor(game.id);
      const body = await readJson(req, Math.min(quota.max_value_bytes + 4096, 1024 * 1024));
      const allowed = new Set(['holderId', 'leaseMs', 'createIfMissing', 'initialValue', 'ownerPrincipalId', 'fencingToken']);
      if (Object.keys(body).some(k => !allowed.has(k))) throw new ApiError(422, 'DATASTORE_LOCK_BODY_INVALID');
      const holderId = assertHolderId(body.holderId);
      const leaseMs = body.leaseMs === undefined ? quota.default_lease_ms : body.leaseMs;
      if (!Number.isSafeInteger(leaseMs) || leaseMs < 1000 || leaseMs > quota.max_lease_ms) {
        throw new ApiError(422, 'DATASTORE_LEASE_INVALID');
      }
      let requestedFencingToken = null;
      if (body.fencingToken !== undefined && body.fencingToken !== null) {
        if (!Number.isSafeInteger(body.fencingToken) || body.fencingToken < 1) {
          throw new ApiError(422, 'DATASTORE_FENCING_TOKEN_INVALID');
        }
        requestedFencingToken = body.fencingToken;
      }
      const createIfMissing = body.createIfMissing !== false;
      const ownerPrincipalId = assertOwnerExists(body.ownerPrincipalId);
      const initialValue = body.initialValue === undefined ? {} : body.initialValue;
      const initialJson = JSON.stringify(initialValue);
      const initialBytes = Buffer.byteLength(initialJson, 'utf8');
      if (initialBytes > quota.max_value_bytes) throw new ApiError(413, 'DATASTORE_VALUE_TOO_LARGE');

      const stamp = now();
      const expiresAt = stamp + leaseMs;
      const outcome = transaction(db, () => {
        const current = db.prepare('SELECT * FROM datastore_entries WHERE game_id=? AND scope=? AND entry_key=?')
          .get(game.id, scope, entryKey);
        if (!current || isTombstone(current)) {
          if (!createIfMissing) throw new ApiError(404, 'DATASTORE_ENTRY_NOT_FOUND');
          const usage = db.prepare('SELECT COUNT(*) AS key_count, COALESCE(SUM(bytes),0) AS total_bytes FROM datastore_entries WHERE game_id=? AND etag!=?').get(game.id, TOMBSTONE_ETAG);
          if (usage.key_count + 1 > quota.max_keys || usage.total_bytes + initialBytes > quota.max_total_bytes) {
            throw new ApiError(413, 'DATASTORE_QUOTA_EXCEEDED');
          }
          if (!current) {
            const etag = `"r1"`;
            db.prepare(`
              INSERT INTO datastore_entries(
                game_id, scope, entry_key, owner_principal_id, revision, value_json, bytes, etag,
                fencing_token, lock_holder, lock_expires_at, updated_by, created_at, updated_at
              ) VALUES(?,?,?,?,1,?,?,?,1,?,?,?,?,?)
            `).run(game.id, scope, entryKey, ownerPrincipalId, initialJson, initialBytes, etag, holderId, expiresAt, holderId, stamp, stamp);
          } else {
            const nextRev = current.revision + 1;
            const nextToken = current.fencing_token + 1;
            const etag = `"r${nextRev}"`;
            db.prepare(`
              UPDATE datastore_entries
              SET owner_principal_id=?, revision=?, value_json=?, bytes=?, etag=?,
                  fencing_token=?, lock_holder=?, lock_expires_at=?, updated_by=?, created_at=?, updated_at=?
              WHERE game_id=? AND scope=? AND entry_key=?
            `).run(ownerPrincipalId, nextRev, initialJson, initialBytes, etag, nextToken, holderId, expiresAt, holderId, stamp, stamp, game.id, scope, entryKey);
          }
          const created = db.prepare('SELECT * FROM datastore_entries WHERE game_id=? AND scope=? AND entry_key=?')
            .get(game.id, scope, entryKey);
          return { acquired: true, renewed: false, created: true, entry: serializeEntry(created, stamp) };
        }

        const activeLock = Boolean(current.lock_holder && current.lock_expires_at && current.lock_expires_at > stamp);
        if (activeLock && current.lock_holder !== holderId) {
          throw new ApiError(423, 'DATASTORE_LOCK_HELD', '다른 서버가 세션 락을 보유하고 있습니다.', {
            lockHolder: current.lock_holder,
            lockExpiresAt: new Date(current.lock_expires_at).toISOString(),
          });
        }
        const sameActiveHolder = activeLock && current.lock_holder === holderId;
        const tokenMatched = sameActiveHolder && requestedFencingToken !== null && requestedFencingToken === current.fencing_token;
        const renewed = tokenMatched;
        const nextToken = tokenMatched ? current.fencing_token : current.fencing_token + 1;
        db.prepare(`
          UPDATE datastore_entries
          SET fencing_token=?, lock_holder=?, lock_expires_at=?, updated_at=?
          WHERE game_id=? AND scope=? AND entry_key=?
        `).run(nextToken, holderId, expiresAt, stamp, game.id, scope, entryKey);
        const updated = db.prepare('SELECT * FROM datastore_entries WHERE game_id=? AND scope=? AND entry_key=?')
          .get(game.id, scope, entryKey);
        return { acquired: true, renewed, created: false, entry: serializeEntry(updated, stamp) };
      });

      json(res, outcome.created ? 201 : 200, {
        ok: true,
        acquired: true,
        renewed: outcome.renewed,
        fencingToken: outcome.entry.fencingToken,
        lockHolder: outcome.entry.lockHolder,
        lockExpiresAt: outcome.entry.lockExpiresAt,
        entry: outcome.entry,
      });
      return true;
    }

    // POST /internal/v1/datastore/games/:gameId/scopes/:scope/keys/:key/unlock
    const unlockMatch = p.match(/^\/internal\/v1\/datastore\/games\/([A-Za-z0-9_-]+)\/scopes\/([a-z0-9_-]+)\/keys\/([A-Za-z0-9:._-]+)\/unlock$/);
    if (unlockMatch && req.method === 'POST') {
      const game = findGame(rootDir, db, assertId(unlockMatch[1]), false);
      const scope = assertScope(unlockMatch[2]);
      const entryKey = assertEntryKey(unlockMatch[3]);
      quotaFor(game.id);
      const body = await readJson(req, 4096);
      if (Object.keys(body).some(k => k !== 'holderId' && k !== 'fencingToken')) throw new ApiError(422, 'DATASTORE_UNLOCK_BODY_INVALID');
      const holderId = assertHolderId(body.holderId);
      if (!Number.isSafeInteger(body.fencingToken) || body.fencingToken < 1) throw new ApiError(422, 'DATASTORE_FENCING_TOKEN_INVALID');
      const stamp = now();
      const result = transaction(db, () => {
        const current = db.prepare('SELECT * FROM datastore_entries WHERE game_id=? AND scope=? AND entry_key=?')
          .get(game.id, scope, entryKey);
        if (!current || isTombstone(current)) throw new ApiError(404, 'DATASTORE_ENTRY_NOT_FOUND');
        if (current.fencing_token !== body.fencingToken) throw new ApiError(409, 'DATASTORE_FENCING_TOKEN_STALE');
        if (current.lock_holder && current.lock_holder !== holderId && current.lock_expires_at > stamp) {
          throw new ApiError(423, 'DATASTORE_LOCK_HELD');
        }
        const nextToken = current.fencing_token + 1;
        db.prepare(`
          UPDATE datastore_entries SET fencing_token=?, lock_holder=NULL, lock_expires_at=NULL, updated_at=?
          WHERE game_id=? AND scope=? AND entry_key=?
        `).run(nextToken, stamp, game.id, scope, entryKey);
        return { ok: true, released: true, fencingToken: nextToken };
      });
      json(res, 200, result);
      return true;
    }

    // GET / PUT / DELETE /internal/v1/datastore/games/:gameId/scopes/:scope/keys/:key
    const itemMatch = p.match(/^\/internal\/v1\/datastore\/games\/([A-Za-z0-9_-]+)\/scopes\/([a-z0-9_-]+)\/keys\/([A-Za-z0-9:._-]+)$/);
    if (itemMatch && ['GET', 'PUT', 'DELETE'].includes(req.method)) {
      const game = findGame(rootDir, db, assertId(itemMatch[1]), false);
      const scope = assertScope(itemMatch[2]);
      const entryKey = assertEntryKey(itemMatch[3]);
      const quota = quotaFor(game.id);
      const stamp = now();

      if (req.method === 'GET') {
        const row = db.prepare('SELECT * FROM datastore_entries WHERE game_id=? AND scope=? AND entry_key=?')
          .get(game.id, scope, entryKey);
        if (!row || isTombstone(row)) throw new ApiError(404, 'DATASTORE_ENTRY_NOT_FOUND');
        res.setHeader('ETag', row.etag);
        json(res, 200, { entry: serializeEntry(row, stamp) });
        return true;
      }

      if (req.method === 'PUT') {
        const body = await readJson(req, Math.min(quota.max_value_bytes + 8192, 1024 * 1024));
        const allowed = new Set(['value', 'expectedRevision', 'holderId', 'fencingToken', 'ownerPrincipalId', 'releaseLock', 'reason']);
        if (Object.keys(body).some(k => !allowed.has(k))) throw new ApiError(422, 'DATASTORE_WRITE_BODY_INVALID');
        if (body.value === undefined) throw new ApiError(422, 'DATASTORE_VALUE_REQUIRED');
        const valueJson = JSON.stringify(body.value);
        if (valueJson === undefined) throw new ApiError(422, 'DATASTORE_VALUE_INVALID');
        const bytes = Buffer.byteLength(valueJson, 'utf8');
        if (bytes > quota.max_value_bytes) throw new ApiError(413, 'DATASTORE_VALUE_TOO_LARGE');

        const headerRev = parseIfMatch(req.headers['if-match']);
        const expectedRevision = body.expectedRevision !== undefined ? body.expectedRevision : headerRev;
        if (expectedRevision !== null && expectedRevision !== undefined && (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)) {
          throw new ApiError(422, 'DATASTORE_REVISION_INVALID');
        }
        const holderId = body.holderId !== undefined ? assertHolderId(body.holderId) : null;
        const releaseLock = body.releaseLock === true;
        const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 64) || 'write' : 'write';
        const ownerPrincipalId = body.ownerPrincipalId !== undefined ? assertOwnerExists(body.ownerPrincipalId) : undefined;

        const saved = transaction(db, () => {
          const current = db.prepare('SELECT * FROM datastore_entries WHERE game_id=? AND scope=? AND entry_key=?')
            .get(game.id, scope, entryKey);
          const live = current && !isTombstone(current) ? current : null;
          assertLockForMutation(current, { holderId, fencingToken: body.fencingToken }, stamp);
          if (expectedRevision !== null && expectedRevision !== undefined && (live?.revision || 0) !== expectedRevision) {
            throw new ApiError(412, 'DATASTORE_REVISION_CONFLICT', '리비전 충돌이 발생했습니다.', {
              currentRevision: live?.revision || 0,
            });
          }

          const usage = db.prepare('SELECT COUNT(*) AS key_count, COALESCE(SUM(bytes),0) AS total_bytes FROM datastore_entries WHERE game_id=? AND etag!=?').get(game.id, TOMBSTONE_ETAG);
          const nextKeys = live ? usage.key_count : usage.key_count + 1;
          const nextTotalBytes = usage.total_bytes - (live?.bytes || 0) + bytes;
          if (nextKeys > quota.max_keys || nextTotalBytes > quota.max_total_bytes) {
            throw new ApiError(413, 'DATASTORE_QUOTA_EXCEEDED');
          }

          const updatedBy = holderId || 'server';
          if (!current) {
            const etag = '"r1"';
            db.prepare(`
              INSERT INTO datastore_entries(
                game_id, scope, entry_key, owner_principal_id, revision, value_json, bytes, etag,
                fencing_token, lock_holder, lock_expires_at, updated_by, created_at, updated_at
              ) VALUES(?,?,?,?,1,?,?,?,0,NULL,NULL,?,?,?)
            `).run(game.id, scope, entryKey, ownerPrincipalId ?? null, valueJson, bytes, etag, updatedBy, stamp, stamp);
          } else if (!live) {
            const nextRev = current.revision + 1;
            const etag = `"r${nextRev}"`;
            const nextFencingToken = releaseLock ? current.fencing_token + 1 : current.fencing_token;
            db.prepare(`
              UPDATE datastore_entries
              SET owner_principal_id=?, revision=?, value_json=?, bytes=?, etag=?,
                  fencing_token=?, lock_holder=NULL, lock_expires_at=NULL, updated_by=?, created_at=?, updated_at=?
              WHERE game_id=? AND scope=? AND entry_key=?
            `).run(ownerPrincipalId ?? null, nextRev, valueJson, bytes, etag, nextFencingToken, updatedBy, stamp, stamp, game.id, scope, entryKey);
          } else {
            archiveVersion(live, reason, updatedBy, stamp);
            const nextRev = live.revision + 1;
            const etag = `"r${nextRev}"`;
            const nextOwner = ownerPrincipalId === undefined ? live.owner_principal_id : ownerPrincipalId;
            const nextFencingToken = releaseLock ? live.fencing_token + 1 : live.fencing_token;
            const nextHolder = releaseLock ? null : live.lock_holder;
            const nextExpiry = releaseLock ? null : live.lock_expires_at;
            db.prepare(`
              UPDATE datastore_entries
              SET owner_principal_id=?, revision=?, value_json=?, bytes=?, etag=?,
                  fencing_token=?, lock_holder=?, lock_expires_at=?, updated_by=?, updated_at=?
              WHERE game_id=? AND scope=? AND entry_key=?
            `).run(nextOwner, nextRev, valueJson, bytes, etag, nextFencingToken, nextHolder, nextExpiry, updatedBy, stamp, game.id, scope, entryKey);
          }
          const fresh = db.prepare('SELECT * FROM datastore_entries WHERE game_id=? AND scope=? AND entry_key=?')
            .get(game.id, scope, entryKey);
          return { created: !live, entry: serializeEntry(fresh, stamp) };
        });

        res.setHeader('ETag', saved.entry.etag);
        json(res, saved.created ? 201 : 200, { ok: true, entry: saved.entry });
        return true;
      }

      if (req.method === 'DELETE') {
        const headerRev = parseIfMatch(req.headers['if-match']);
        let body = {};
        if (req.headers['transfer-encoding'] || Number(req.headers['content-length'])) {
          body = await readJson(req, 4096);
        }
        const allowed = new Set(['holderId', 'fencingToken', 'expectedRevision']);
        if (Object.keys(body).some(k => !allowed.has(k))) throw new ApiError(422, 'DATASTORE_DELETE_BODY_INVALID');
        const holderId = body.holderId !== undefined ? assertHolderId(body.holderId) : null;
        const expectedRevision = body.expectedRevision !== undefined ? body.expectedRevision : headerRev;
        if (expectedRevision !== null && expectedRevision !== undefined && (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1)) {
          throw new ApiError(422, 'DATASTORE_REVISION_INVALID');
        }
        const deleted = transaction(db, () => {
          const current = db.prepare('SELECT * FROM datastore_entries WHERE game_id=? AND scope=? AND entry_key=?')
            .get(game.id, scope, entryKey);
          if (!current || isTombstone(current)) throw new ApiError(404, 'DATASTORE_ENTRY_NOT_FOUND');
          assertLockForMutation(current, { holderId, fencingToken: body.fencingToken }, stamp);
          if (expectedRevision !== null && expectedRevision !== undefined && current.revision !== expectedRevision) {
            throw new ApiError(412, 'DATASTORE_REVISION_CONFLICT', '리비전 충돌이 발생했습니다.', { currentRevision: current.revision });
          }
          archiveVersion(current, 'deleted', holderId || 'server', stamp);
          const nextFencingToken = current.fencing_token > 0 ? current.fencing_token + 1 : 0;
          db.prepare(`
            UPDATE datastore_entries
            SET owner_principal_id=NULL, value_json='', bytes=0, etag=?,
                fencing_token=?, lock_holder=NULL, lock_expires_at=NULL, updated_by=?, updated_at=?
            WHERE game_id=? AND scope=? AND entry_key=?
          `).run(TOMBSTONE_ETAG, nextFencingToken, holderId || 'server', stamp, game.id, scope, entryKey);
          return { ok: true, deletedKey: entryKey, archivedRevision: current.revision, fencingToken: nextFencingToken };
        });
        json(res, 200, deleted);
        return true;
      }
    }

    return false;
  }

  async function adminRoute(req, res, url, adminSession) {
    const p = url.pathname;
    const quotaMatch = p.match(/^\/api\/admin\/games\/([A-Za-z0-9_-]+)\/datastore\/quota$/);
    if (quotaMatch && req.method === 'PUT') {
      const game = findGame(rootDir, db, assertId(quotaMatch[1]), false);
      const body = await readJson(req, 4096);
      const allowed = new Set(['maxKeys', 'maxValueBytes', 'maxTotalBytes', 'defaultLeaseMs', 'maxLeaseMs', 'enabled']);
      if (Object.keys(body).some(k => !allowed.has(k))) throw new ApiError(422, 'DATASTORE_QUOTA_BODY_INVALID');
      const existing = db.prepare('SELECT * FROM datastore_quotas WHERE game_id=?').get(game.id) || DEFAULT_QUOTA;
      const maxKeys = body.maxKeys ?? existing.max_keys;
      const maxValueBytes = body.maxValueBytes ?? existing.max_value_bytes;
      const maxTotalBytes = body.maxTotalBytes ?? existing.max_total_bytes;
      const defaultLeaseMs = body.defaultLeaseMs ?? existing.default_lease_ms;
      const maxLeaseMs = body.maxLeaseMs ?? existing.max_lease_ms;
      const enabled = body.enabled === undefined ? Boolean(existing.enabled) : body.enabled;
      if (!Number.isSafeInteger(maxKeys) || maxKeys < 1 || maxKeys > 10_000_000) throw new ApiError(422, 'DATASTORE_QUOTA_INVALID');
      if (!Number.isSafeInteger(maxValueBytes) || maxValueBytes < 64 || maxValueBytes > 4 * 1024 * 1024) throw new ApiError(422, 'DATASTORE_QUOTA_INVALID');
      if (!Number.isSafeInteger(maxTotalBytes) || maxTotalBytes < 1024 || maxTotalBytes > 10 * 1024 * 1024 * 1024) throw new ApiError(422, 'DATASTORE_QUOTA_INVALID');
      if (!Number.isSafeInteger(defaultLeaseMs) || defaultLeaseMs < 1000 || !Number.isSafeInteger(maxLeaseMs) || maxLeaseMs < defaultLeaseMs || maxLeaseMs > 600000) {
        throw new ApiError(422, 'DATASTORE_QUOTA_INVALID');
      }
      if (typeof enabled !== 'boolean') throw new ApiError(422, 'DATASTORE_QUOTA_INVALID');
      const stamp = now();
      const saved = transaction(db, () => {
        db.prepare(`
          INSERT INTO datastore_quotas(game_id, max_keys, max_value_bytes, max_total_bytes, default_lease_ms, max_lease_ms, enabled, updated_at)
          VALUES(?,?,?,?,?,?,?,?)
          ON CONFLICT(game_id) DO UPDATE SET
            max_keys=excluded.max_keys, max_value_bytes=excluded.max_value_bytes,
            max_total_bytes=excluded.max_total_bytes, default_lease_ms=excluded.default_lease_ms,
            max_lease_ms=excluded.max_lease_ms, enabled=excluded.enabled, updated_at=excluded.updated_at
        `).run(game.id, maxKeys, maxValueBytes, maxTotalBytes, defaultLeaseMs, maxLeaseMs, enabled ? 1 : 0, stamp);
        audit('datastore_quota_configured', game.id, { maxKeys, maxValueBytes, maxTotalBytes, defaultLeaseMs, maxLeaseMs, enabled, admin: adminSession?.admin_username || 'admin' });
        return db.prepare('SELECT * FROM datastore_quotas WHERE game_id=?').get(game.id);
      });
      json(res, 200, { quota: serializeQuota(game.id, saved) });
      return true;
    }

    const statsMatch = p.match(/^\/api\/admin\/games\/([A-Za-z0-9_-]+)\/datastore\/stats$/);
    if (statsMatch && req.method === 'GET') {
      const game = findGame(rootDir, db, assertId(statsMatch[1]), false);
      const stamp = now();
      const quota = db.prepare('SELECT * FROM datastore_quotas WHERE game_id=?').get(game.id);
      const agg = db.prepare(`
        SELECT COUNT(*) AS key_count,
               COALESCE(SUM(bytes), 0) AS total_bytes,
               SUM(CASE WHEN lock_holder IS NOT NULL AND lock_expires_at > ? THEN 1 ELSE 0 END) AS active_locks
        FROM datastore_entries WHERE game_id=? AND etag!=?
      `).get(stamp, game.id, TOMBSTONE_ETAG);
      const versionCount = db.prepare('SELECT COUNT(*) AS n FROM datastore_versions WHERE game_id=?').get(game.id).n;
      json(res, 200, {
        gameId: game.id,
        keyCount: agg.key_count,
        totalBytes: agg.total_bytes,
        activeLocks: agg.active_locks || 0,
        archivedVersions: versionCount,
        quota: serializeQuota(game.id, quota),
      });
      return true;
    }

    const forceUnlockMatch = p.match(/^\/api\/admin\/games\/([A-Za-z0-9_-]+)\/datastore\/scopes\/([a-z0-9_-]+)\/keys\/([A-Za-z0-9:._-]+)\/force-unlock$/);
    if (forceUnlockMatch && req.method === 'POST') {
      const game = findGame(rootDir, db, assertId(forceUnlockMatch[1]), false);
      const scope = assertScope(forceUnlockMatch[2]);
      const entryKey = assertEntryKey(forceUnlockMatch[3]);
      const body = await readJson(req, 4096);
      const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim().slice(0, 500) : 'admin_force_unlock';
      const stamp = now();
      const updated = transaction(db, () => {
        const current = db.prepare('SELECT * FROM datastore_entries WHERE game_id=? AND scope=? AND entry_key=?')
          .get(game.id, scope, entryKey);
        if (!current || isTombstone(current)) throw new ApiError(404, 'DATASTORE_ENTRY_NOT_FOUND');
        // Bump fencing_token on force-unlock so the previous holder can never write back after an emergency break!
        const nextToken = current.fencing_token + 1;
        db.prepare(`
          UPDATE datastore_entries
          SET fencing_token=?, lock_holder=NULL, lock_expires_at=NULL, updated_at=?
          WHERE game_id=? AND scope=? AND entry_key=?
        `).run(nextToken, stamp, game.id, scope, entryKey);
        audit('datastore_force_unlocked', `${game.id}:${scope}:${entryKey}`, { previousHolder: current.lock_holder, nextFencingToken: nextToken, reason, admin: adminSession?.admin_username || 'admin' });
        return db.prepare('SELECT * FROM datastore_entries WHERE game_id=? AND scope=? AND entry_key=?')
          .get(game.id, scope, entryKey);
      });
      json(res, 200, { ok: true, entry: serializeEntry(updated, stamp) });
      return true;
    }

    return false;
  }

  return { internalRoute, adminRoute };
}
