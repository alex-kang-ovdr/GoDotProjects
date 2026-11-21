// Airbnb Orpheus-style idempotency wrapper for Hub-Billing.
// Primary-only contract: when Hub migrates to Turso / replicated SQLite, all
// billing_idempotency reads and writes MUST hit the primary (writer) database
// inside a write transaction — never a read replica — to prevent double charges
// caused by replication lag.

import { ApiError, digest, safeString } from '../security.mjs';

export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  const keys = Object.keys(value).filter(k => value[k] !== undefined).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') + '}';
}

let savepointSeq = 0;

export function runAtomic(db, fn) {
  if (db.isTransaction) {
    const sp = `billing_sp_${++savepointSeq}`;
    db.exec(`SAVEPOINT ${sp}`);
    try {
      const value = fn();
      db.exec(`RELEASE SAVEPOINT ${sp}`);
      return value;
    } catch (error) {
      db.exec(`ROLLBACK TO SAVEPOINT ${sp}`);
      db.exec(`RELEASE SAVEPOINT ${sp}`);
      throw error;
    }
  }
  db.exec('BEGIN IMMEDIATE');
  try {
    const value = fn();
    db.exec('COMMIT');
    return value;
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }
}

export function withIdempotency({ db, scope, key, principalId = null, requestPayload = {}, now = Date.now, fn }) {
  if (!safeString(scope, 64) || !/^[a-zA-Z0-9:._-]+$/.test(scope)) {
    throw new ApiError(400, 'IDEMPOTENCY_SCOPE_INVALID');
  }
  if (!safeString(key, 128) || !/^[a-zA-Z0-9:._-]+$/.test(key)) {
    throw new ApiError(400, 'IDEMPOTENCY_KEY_REQUIRED');
  }
  const requestHash = digest(canonicalJson(requestPayload));

  return runAtomic(db, () => {
    const existing = db.prepare(
      'SELECT principal_id, request_hash, status_code, response_json FROM billing_idempotency WHERE scope=? AND idempotency_key=?'
    ).get(scope, key);

    if (existing) {
      if (existing.request_hash !== requestHash || (existing.principal_id || null) !== (principalId || null)) {
        throw new ApiError(409, 'IDEMPOTENCY_KEY_CONFLICT');
      }
      return {
        replayed: true,
        status: existing.status_code,
        body: JSON.parse(existing.response_json)
      };
    }

    const outcome = fn();
    const status = Number.isInteger(outcome?.status) ? outcome.status : 200;
    const body = outcome && Object.prototype.hasOwnProperty.call(outcome, 'body') ? outcome.body : outcome;

    db.prepare(
      'INSERT INTO billing_idempotency(scope, idempotency_key, principal_id, request_hash, status_code, response_json, created_at) VALUES(?,?,?,?,?,?,?)'
    ).run(scope, key, principalId || null, requestHash, status, JSON.stringify(body), now());

    return { replayed: false, status, body };
  });
}
