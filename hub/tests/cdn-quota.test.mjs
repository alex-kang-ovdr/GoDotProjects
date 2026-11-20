import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ensureCdnSchema } from '../server/cdn/schema.mjs';
import { createQuota } from '../server/cdn/quota.mjs';
import { transaction } from '../server/db.mjs';

function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-cdn-quota-'));
  const file = path.join(dir, 'q.sqlite');
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000');
  ensureCdnSchema(db);
  const handles = [db];
  t.after(() => { for (const h of handles) h.close(); fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); });
  return { db, handles, file, quota: createQuota({ db, plans: { free: 100, pro: 1000 }, now: Date.now }) };
}

test('limit boundary: exactly the limit is admissible, one byte more is not', t => {
  const { quota } = setup(t);
  quota.reserve('a', 60);
  quota.settle('a', 60, 60);
  quota.reserve('a', 40);
  assert.deepEqual(quota.snapshot('a'), { plan: 'free', limitBytes: 100, usedBytes: 60, reservedBytes: 40 });
  assert.throws(() => quota.reserve('a', 1), e => e.status === 422 && e.code === 'STORAGE_LIMIT_EXCEEDED' && e.extra.storage.requiredBytes === 1);
  quota.release('a', 40);
  assert.equal(quota.snapshot('a').reservedBytes, 0);
});

test('upgrade and downgrade change only the limit, never stored bytes', t => {
  const { quota } = setup(t);
  quota.charge('a', 90);
  assert.throws(() => quota.reserve('a', 20));
  quota.setPlan('a', 'pro');
  quota.reserve('a', 20);
  const down = quota.setPlan('a', 'free');
  assert.deepEqual([down.usedBytes, down.reservedBytes, down.limitBytes], [90, 20, 100]);
  assert.throws(() => quota.reserve('a', 1), e => e.code === 'STORAGE_LIMIT_EXCEEDED');
  quota.release('a', 20); quota.refund('a', 90);
  assert.equal(quota.snapshot('a').usedBytes, 0);
});

test('stale reads on two connections cannot both reserve the last bytes', t => {
  const { db, handles, file, quota } = setup(t);
  const other = new DatabaseSync(file);
  other.exec('PRAGMA busy_timeout=5000');
  handles.unshift(other);
  const quota2 = createQuota({ db: other, plans: { free: 100, pro: 1000 }, now: Date.now });
  quota.charge('a', 50);
  // Interleave: both read "50 used" before either writes, like two API isolates would.
  const seenA = quota.snapshot('a').usedBytes, seenB = quota2.snapshot('a').usedBytes;
  assert.equal(seenA + 40 <= 100 && seenB + 40 <= 100, true, 'a naive read-check would admit both');
  const results = [];
  for (const [q, conn] of [[quota, db], [quota2, other]]) {
    try { transaction(conn, () => q.reserve('a', 40)); results.push('ok'); } catch (e) { results.push(e.code); }
  }
  results.sort();
  assert.deepEqual(results, ['STORAGE_LIMIT_EXCEEDED', 'ok']);
  assert.deepEqual(quota.snapshot('a'), { plan: 'free', limitBytes: 100, usedBytes: 50, reservedBytes: 40 });
});
