// Per-owner storage ledger. Every increase is a single conditional UPDATE so two concurrent requests
// can never both pass the limit check (no SELECT-then-UPDATE). Callers run these inside transaction().
//   used_bytes     = bytes of the owner's LIVE + DELETING blobs (files and manifests, each counted once)
//   reserved_bytes = declared bytes of uploads still in flight
import { ApiError } from '../security.mjs';

export function createQuota({ db, plans, now }) {
  const limitOf = plan => {
    const value = plans[plan];
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`cdn.plans.${plan} must be a non-negative integer`);
    return value;
  };
  limitOf('free'); limitOf('pro');

  function ensure(owner) {
    db.prepare('INSERT INTO cdn_storage(owner,plan,used_bytes,reserved_bytes,updated_at) VALUES(?,?,0,0,?) ON CONFLICT(owner) DO NOTHING').run(owner, 'free', now());
  }

  function snapshot(owner) {
    ensure(owner);
    const row = db.prepare('SELECT plan,used_bytes,reserved_bytes FROM cdn_storage WHERE owner=?').get(owner);
    return { plan: row.plan, limitBytes: limitOf(row.plan), usedBytes: row.used_bytes, reservedBytes: row.reserved_bytes };
  }

  /** Reserve `bytes` for in-flight uploads; throws 422 when the plan limit would be exceeded. */
  function reserve(owner, bytes) {
    if (!Number.isSafeInteger(bytes) || bytes < 0) throw new ApiError(400, 'INVALID_SIZE');
    if (bytes === 0) return;
    ensure(owner);
    const result = db.prepare(`UPDATE cdn_storage SET reserved_bytes=reserved_bytes+?, updated_at=?
      WHERE owner=? AND used_bytes+reserved_bytes+? <= (CASE plan WHEN 'pro' THEN ? ELSE ? END)`)
      .run(bytes, now(), owner, bytes, limitOf('pro'), limitOf('free'));
    if (result.changes !== 1) {
      const s = snapshot(owner);
      throw new ApiError(422, 'STORAGE_LIMIT_EXCEEDED', 'STORAGE_LIMIT_EXCEEDED', { storage: { ...s, requiredBytes: bytes } });
    }
  }

  /** Return unused reservation. Never goes below zero. */
  function release(owner, bytes) {
    if (!bytes) return;
    db.prepare('UPDATE cdn_storage SET reserved_bytes=MAX(0,reserved_bytes-?), updated_at=? WHERE owner=?').run(bytes, now(), owner);
  }

  /** Convert a reservation into used bytes once a blob becomes LIVE. */
  function settle(owner, reservedBytes, usedBytes) {
    db.prepare('UPDATE cdn_storage SET reserved_bytes=MAX(0,reserved_bytes-?), used_bytes=used_bytes+?, updated_at=? WHERE owner=?').run(reservedBytes, usedBytes, now(), owner);
  }

  /** Charge bytes without a prior reservation (manifests); same atomic limit check as reserve(). */
  function charge(owner, bytes) {
    reserve(owner, bytes);
    settle(owner, bytes, bytes);
  }

  function refund(owner, bytes) {
    db.prepare('UPDATE cdn_storage SET used_bytes=MAX(0,used_bytes-?), updated_at=? WHERE owner=?').run(bytes, now(), owner);
  }

  function setPlan(owner, plan) {
    if (!['free', 'pro'].includes(plan)) throw new ApiError(400, 'INVALID_PLAN');
    ensure(owner);
    db.prepare('UPDATE cdn_storage SET plan=?, updated_at=? WHERE owner=?').run(plan, now(), owner);
    return snapshot(owner);
  }

  return { snapshot, reserve, release, settle, charge, refund, setPlan, limitOf };
}
