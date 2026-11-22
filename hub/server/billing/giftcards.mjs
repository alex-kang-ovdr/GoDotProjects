// Track A: Gift Card Batch Issuance, HMAC-SHA256 PIN Storage (Zero Plaintext PIN in DB),
// Brute-Force Lockout (IP + Account), Preview, Atomic Redemption, and Liability Accounting.

import crypto from 'node:crypto';
import { ApiError, safeString, uid } from '../security.mjs';
import { MAX_BONUS_BPS, BILLING_UNIT } from './schema.mjs';
import { runAtomic, withIdempotency } from './idempotency.mjs';
import { calculateBonusCoins as calcBonusCoins } from './policy.mjs';
import {
  SYS_ACCOUNTS,
  clearingAccount,
  activateGiftCardLiability,
  creditPurchase,
  getWallet,
  postJournalEntry
} from './ledger.mjs';
import { assertCanPurchase } from './compliance.mjs';

const PIN_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 31 unambiguous chars (no 0/O/1/I/L)
const PIN_LENGTH = 16;
const GIFTCARD_CHANNELS = new Set(['gift_card_direct', 'gift_card_retail']);
const DEFAULT_MAX_FAILURES = 5;
const DEFAULT_WINDOW_MS = 15 * 60_000;
const DEFAULT_LOCK_MS = 15 * 60_000;

export function normalizeGiftCardPin(rawPin) {
  if (typeof rawPin !== 'string') throw new ApiError(422, 'GIFTCARD_PIN_INVALID', 'Gift card PIN must be a 16-character code');
  const cleaned = rawPin.toUpperCase().replace(/[\s\-_]+/g, '');
  if (!/^[A-Z0-9]{16}$/.test(cleaned)) {
    throw new ApiError(422, 'GIFTCARD_PIN_INVALID', 'Gift card PIN must be 16 alphanumeric characters');
  }
  return cleaned;
}

export function formatGiftCardPin(normalizedPin) {
  return normalizedPin.replace(/(.{4})(?=.)/g, '$1-');
}

export function maskGiftCardPin(normalizedPin) {
  return `****-****-****-${normalizedPin.slice(-4)}`;
}

export function generateGiftCardPin() {
  // Rejection sampling avoids modulo bias across the 31-char unambiguous alphabet (~79.3 bits entropy).
  const alphabetLen = PIN_ALPHABET.length;
  const maxUnbiased = Math.floor(256 / alphabetLen) * alphabetLen;
  let out = '';
  while (out.length < PIN_LENGTH) {
    const bytes = crypto.randomBytes(PIN_LENGTH * 2);
    for (let i = 0; i < bytes.length && out.length < PIN_LENGTH; i++) {
      if (bytes[i] < maxUnbiased) {
        out += PIN_ALPHABET[bytes[i] % alphabetLen];
      }
    }
  }
  return out;
}

export function hashGiftCardPin(normalizedPin, pepper) {
  if (!safeString(pepper, 256)) {
    throw new ApiError(500, 'GIFTCARD_PEPPER_NOT_CONFIGURED');
  }
  return crypto
    .createHmac('sha256', pepper)
    .update(`playhub:giftcard:v1:${normalizedPin}`)
    .digest('hex');
}

const BF_DB_SCOPE = 'billing.giftcard.bf';

export function createGiftCardBruteForceGuard({
  db = null,
  maxFailures = DEFAULT_MAX_FAILURES,
  windowMs = DEFAULT_WINDOW_MS,
  lockMs = DEFAULT_LOCK_MS,
  now = Date.now
} = {}) {
  const buckets = new Map();

  function prune(stamp) {
    if (buckets.size <= 10_000) return;
    for (const [k, v] of buckets) {
      if (v.lockedUntil <= stamp && v.windowEndsAt <= stamp) buckets.delete(k);
    }
  }

  function keysOf(principalId, clientIp) {
    const keys = [];
    if (principalId) keys.push(`user:${principalId}`);
    if (clientIp && clientIp !== 'unknown') keys.push(`ip:${clientIp}`);
    return keys;
  }

  function readBucket(key) {
    if (db) {
      const row = db.prepare(
        'SELECT response_json FROM billing_idempotency WHERE scope=? AND idempotency_key=?'
      ).get(BF_DB_SCOPE, key);
      if (!row) return null;
      try {
        const parsed = JSON.parse(row.response_json);
        if (parsed && typeof parsed === 'object') return parsed;
      } catch {}
      return null;
    }
    return buckets.get(key) || null;
  }

  function writeBucket(key, entry, stamp) {
    if (db) {
      const principalId = key.startsWith('user:') ? key.slice(5) : null;
      db.prepare(`
        INSERT INTO billing_idempotency(scope, idempotency_key, principal_id, request_hash, status_code, response_json, created_at)
        VALUES(?,?,?,'bf',429,?,?)
        ON CONFLICT(scope, idempotency_key) DO UPDATE SET
          response_json=excluded.response_json,
          created_at=excluded.created_at
      `).run(BF_DB_SCOPE, key, principalId, JSON.stringify(entry), stamp);
      return;
    }
    buckets.set(key, entry);
  }

  function deleteBucket(key) {
    if (db) {
      db.prepare('DELETE FROM billing_idempotency WHERE scope=? AND idempotency_key=?').run(BF_DB_SCOPE, key);
      return;
    }
    buckets.delete(key);
  }

  function assertNotLocked({ principalId, clientIp }) {
    const stamp = now();
    let maxWaitMs = 0;
    for (const key of keysOf(principalId, clientIp)) {
      const entry = readBucket(key);
      if (entry && entry.lockedUntil > stamp) {
        maxWaitMs = Math.max(maxWaitMs, entry.lockedUntil - stamp);
      }
    }
    if (maxWaitMs > 0) {
      const retryAfterSec = Math.max(1, Math.ceil(maxWaitMs / 1000));
      throw new ApiError(
        429,
        'GIFTCARD_BRUTEFORCE_LOCKED',
        `Too many invalid gift card PIN attempts. Try again in ${Math.ceil(retryAfterSec / 60)} minute(s).`,
        { retryAfterSec }
      );
    }
  }

  function recordFailure({ principalId, clientIp }) {
    const stamp = now();
    prune(stamp);
    let locked = false;
    let highestFailures = 0;
    for (const key of keysOf(principalId, clientIp)) {
      let entry = readBucket(key);
      if (!entry || entry.windowEndsAt <= stamp) {
        entry = { failures: 0, windowEndsAt: stamp + windowMs, lockedUntil: 0 };
      }
      entry.failures += 1;
      highestFailures = Math.max(highestFailures, entry.failures);
      if (entry.failures >= maxFailures) {
        entry.lockedUntil = stamp + lockMs;
        locked = true;
      }
      writeBucket(key, entry, stamp);
    }
    return {
      locked,
      failures: highestFailures,
      remainingAttempts: Math.max(0, maxFailures - highestFailures),
      retryAfterSec: locked ? Math.ceil(lockMs / 1000) : 0
    };
  }

  function recordSuccess({ principalId, clientIp }) {
    for (const key of keysOf(principalId, clientIp)) {
      deleteBucket(key);
    }
  }

  return { assertNotLocked, recordFailure, recordSuccess };
}

function sanitizePartnerCode(partnerName) {
  return String(partnerName || 'playhub')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || 'playhub';
}

function formatBatchRow(row, counts = null) {
  const bonusCoins = calcBonusCoins(row.base_coins, row.bonus_bps);
  return {
    id: row.id,
    channel: row.channel,
    partnerName: row.partner_name,
    currency: row.currency,
    faceValueMinor: row.face_value_minor,
    baseCoins: row.base_coins,
    bonusCoins,
    totalCoins: row.base_coins + bonusCoins,
    bonusBps: row.bonus_bps,
    bonusPercent: row.bonus_bps / 100,
    quantity: row.quantity,
    state: row.state,
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at).toISOString(),
    ...(counts ? { counts } : {})
  };
}

export function issueGiftCardBatch(db, {
  channel = 'gift_card_direct',
  partnerName = 'playhub_direct',
  currency = 'KRW',
  faceValueMinor,
  baseCoins,
  bonusBps = 2500,
  quantity = 1,
  expiresAt = null,
  createdBy = 'admin',
  activateImmediately = false,
  pepper,
  now = Date.now
}) {
  if (!GIFTCARD_CHANNELS.has(channel)) throw new ApiError(422, 'GIFTCARD_CHANNEL_INVALID');
  if (!safeString(partnerName, 80)) throw new ApiError(422, 'PARTNER_NAME_REQUIRED');
  const curr = String(currency || '').toUpperCase();
  if (!/^[A-Z]{3}$/.test(curr)) throw new ApiError(422, 'CURRENCY_INVALID');
  if (!Number.isSafeInteger(faceValueMinor) || faceValueMinor <= 0) throw new ApiError(422, 'FACE_VALUE_INVALID');
  if (!Number.isSafeInteger(baseCoins) || baseCoins <= 0) throw new ApiError(422, 'BASE_COINS_INVALID');
  if (!Number.isSafeInteger(bonusBps) || bonusBps < 0 || bonusBps > MAX_BONUS_BPS) {
    throw new ApiError(422, 'BONUS_BPS_EXCEEDS_25_PERCENT_CAP', `bonusBps must be between 0 and ${MAX_BONUS_BPS}`);
  }
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000) {
    throw new ApiError(422, 'GIFTCARD_QUANTITY_INVALID', 'quantity must be between 1 and 1000');
  }
  if (expiresAt !== null && (!Number.isSafeInteger(expiresAt) || expiresAt <= now())) {
    throw new ApiError(422, 'GIFTCARD_EXPIRY_INVALID');
  }

  return runAtomic(db, () => {
    const stamp = now();
    const batchId = uid();
    const batchShort = batchId.replace(/-/g, '').slice(0, 8).toUpperCase();
    const batchState = activateImmediately ? 'ACTIVE' : 'ISSUED';
    const cardState = activateImmediately ? 'ACTIVE' : 'ISSUED';

    db.prepare(`
      INSERT INTO billing_giftcard_batches(
        id, channel, partner_name, currency, face_value_minor, base_coins,
        bonus_bps, quantity, state, expires_at, created_by, created_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      batchId, channel, partnerName.trim(), curr, faceValueMinor, baseCoins,
      bonusBps, quantity, batchState, expiresAt, createdBy, stamp
    );

    const insertCard = db.prepare(`
      INSERT INTO billing_giftcards(
        id, batch_id, serial_no, pin_hash, pin_hint, currency, face_value_minor,
        state, activated_at, redeemed_by, redeemed_at, redeemed_order_id, expires_at
      ) VALUES(?,?,?,?,?,?,?,?,?,NULL,NULL,NULL,?)
    `);

    const bonusCoins = calcBonusCoins(baseCoins, bonusBps);
    const totalCoins = baseCoins + bonusCoins;
    const oneTimePins = [];
    const seenHashes = new Set();

    for (let i = 0; i < quantity; i++) {
      let rawPin;
      let pinHash;
      do {
        rawPin = generateGiftCardPin();
        pinHash = hashGiftCardPin(rawPin, pepper);
      } while (seenHashes.has(pinHash));
      seenHashes.add(pinHash);

      const cardId = uid();
      const serialNo = `GC-${batchShort}-${String(i + 1).padStart(5, '0')}`;
      const pinHint = maskGiftCardPin(rawPin);
      const formattedPin = formatGiftCardPin(rawPin);

      insertCard.run(
        cardId, batchId, serialNo, pinHash, pinHint, curr, faceValueMinor,
        cardState, activateImmediately ? stamp : null, expiresAt
      );

      oneTimePins.push({
        id: cardId,
        serialNo,
        pin: formattedPin,
        pinHint,
        currency: curr,
        faceValueMinor,
        baseCoins,
        bonusCoins,
        totalCoins,
        state: cardState
      });
    }

    let liabilityEntryId = null;
    if (activateImmediately) {
      const act = activateGiftCardLiability(db, {
        batchId,
        partnerName: sanitizePartnerCode(partnerName),
        totalBaseCoins: baseCoins * quantity,
        idempotencyKey: `gc-activate-batch:${batchId}`,
        now
      });
      liabilityEntryId = act.entryId;
    }

    const csvHeader = 'serial_no,pin,currency,face_value_minor,base_coins,bonus_coins,total_coins,bonus_percent,channel,expires_at';
    const csvRows = oneTimePins.map(c => [
      c.serialNo,
      c.pin,
      c.currency,
      c.faceValueMinor,
      c.baseCoins,
      c.bonusCoins,
      c.totalCoins,
      (bonusBps / 100).toFixed(2),
      channel,
      expiresAt ? new Date(expiresAt).toISOString() : ''
    ].join(','));

    const batchRow = db.prepare('SELECT * FROM billing_giftcard_batches WHERE id=?').get(batchId);
    return {
      batch: formatBatchRow(batchRow),
      liabilityEntryId,
      oneTimePins,
      csv: [csvHeader, ...csvRows].join('\n')
    };
  });
}

export function activateGiftCardBatch(db, { batchId, actorId = 'admin', now = Date.now }) {
  if (!safeString(batchId, 128)) throw new ApiError(400, 'BATCH_ID_REQUIRED');

  return runAtomic(db, () => {
    const batch = db.prepare('SELECT * FROM billing_giftcard_batches WHERE id=?').get(batchId);
    if (!batch) throw new ApiError(404, 'GIFTCARD_BATCH_NOT_FOUND');
    if (batch.state === 'VOIDED' || batch.state === 'CLOSED') {
      throw new ApiError(409, 'GIFTCARD_BATCH_NOT_ACTIVATABLE', `Batch state is ${batch.state}`);
    }

    const stamp = now();
    const updated = db.prepare(`
      UPDATE billing_giftcards
      SET state='ACTIVE', activated_at=?
      WHERE batch_id=? AND state='ISSUED'
    `).run(stamp, batchId);

    if (updated.changes === 0) {
      const refreshed = db.prepare('SELECT * FROM billing_giftcard_batches WHERE id=?').get(batchId);
      return { duplicate: true, activatedCount: 0, liabilityEntryId: null, batch: formatBatchRow(refreshed) };
    }

    db.prepare("UPDATE billing_giftcard_batches SET state='ACTIVE' WHERE id=?").run(batchId);

    const act = activateGiftCardLiability(db, {
      batchId,
      partnerName: sanitizePartnerCode(batch.partner_name),
      totalBaseCoins: batch.base_coins * updated.changes,
      idempotencyKey: `gc-activate-batch:${batchId}:${stamp}`,
      now
    });

    const refreshed = db.prepare('SELECT * FROM billing_giftcard_batches WHERE id=?').get(batchId);
    return {
      duplicate: false,
      activatedCount: updated.changes,
      liabilityEntryId: act.entryId,
      actorId,
      batch: formatBatchRow(refreshed)
    };
  });
}

export function voidGiftCardBatch(db, { batchId, reason = 'admin_void', actorId = 'admin', now = Date.now }) {
  if (!safeString(batchId, 128)) throw new ApiError(400, 'BATCH_ID_REQUIRED');

  return runAtomic(db, () => {
    const batch = db.prepare('SELECT * FROM billing_giftcard_batches WHERE id=?').get(batchId);
    if (!batch) throw new ApiError(404, 'GIFTCARD_BATCH_NOT_FOUND');

    const activeCount = db.prepare(
      "SELECT COUNT(*) AS count FROM billing_giftcards WHERE batch_id=? AND state='ACTIVE'"
    ).get(batchId).count;

    const voided = db.prepare(`
      UPDATE billing_giftcards
      SET state='VOIDED'
      WHERE batch_id=? AND state IN ('ISSUED','ACTIVE')
    `).run(batchId);

    db.prepare("UPDATE billing_giftcard_batches SET state='VOIDED' WHERE id=?").run(batchId);

    let reversalEntryId = null;
    if (activeCount > 0) {
      const reverseCoins = activeCount * batch.base_coins;
      reversalEntryId = postJournalEntry(db, {
        eventType: 'admin_adjust',
        sinkType: 'giftcard_batch_void',
        sinkRefId: batchId,
        idempotencyKey: `gc-void-batch:${batchId}:${now()}`,
        metadata: { reason, actorId, voidedActiveCount: activeCount, reverseCoins },
        lines: [
          { accountCode: SYS_ACCOUNTS.GC_UNREDEEMED, signedCoins: -reverseCoins },
          { accountCode: clearingAccount(`giftcard_${sanitizePartnerCode(batch.partner_name)}`), signedCoins: reverseCoins }
        ],
        now
      });
    }

    const refreshed = db.prepare('SELECT * FROM billing_giftcard_batches WHERE id=?').get(batchId);
    return {
      batch: formatBatchRow(refreshed),
      voidedCount: voided.changes,
      voidedActiveCount: activeCount,
      reversalEntryId
    };
  });
}

export function voidGiftCardBySerial(db, { serialNo, reason = 'stolen_or_damaged', actorId = 'admin', now = Date.now }) {
  if (!safeString(serialNo, 64)) throw new ApiError(422, 'SERIAL_NO_REQUIRED');

  return runAtomic(db, () => {
    const card = db.prepare('SELECT * FROM billing_giftcards WHERE serial_no=?').get(serialNo.trim());
    if (!card) throw new ApiError(404, 'GIFTCARD_NOT_FOUND');
    if (card.state === 'REDEEMED') throw new ApiError(409, 'GIFTCARD_ALREADY_REDEEMED');
    if (card.state === 'VOIDED') {
      return { duplicate: true, serialNo: card.serial_no, state: 'VOIDED', reversalEntryId: null };
    }

    const wasActive = card.state === 'ACTIVE';
    db.prepare("UPDATE billing_giftcards SET state='VOIDED' WHERE id=?").run(card.id);

    let reversalEntryId = null;
    if (wasActive) {
      const batch = db.prepare('SELECT * FROM billing_giftcard_batches WHERE id=?').get(card.batch_id);
      reversalEntryId = postJournalEntry(db, {
        eventType: 'admin_adjust',
        sinkType: 'giftcard_void',
        sinkRefId: card.serial_no,
        idempotencyKey: `gc-void-card:${card.id}`,
        metadata: { reason, actorId, serialNo: card.serial_no, baseCoins: batch.base_coins },
        lines: [
          { accountCode: SYS_ACCOUNTS.GC_UNREDEEMED, signedCoins: -batch.base_coins },
          { accountCode: clearingAccount(`giftcard_${sanitizePartnerCode(batch.partner_name)}`), signedCoins: batch.base_coins }
        ],
        now
      });
    }

    return {
      duplicate: false,
      serialNo: card.serial_no,
      state: 'VOIDED',
      reversalEntryId
    };
  });
}

export function listGiftCardBatches(db, { limit = 50 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const batches = db.prepare(
    'SELECT * FROM billing_giftcard_batches ORDER BY created_at DESC LIMIT ?'
  ).all(safeLimit);

  const countStmt = db.prepare(`
    SELECT state, COUNT(*) AS count
    FROM billing_giftcards
    WHERE batch_id=?
    GROUP BY state
  `);

  return batches.map(b => {
    const counts = { ISSUED: 0, ACTIVE: 0, REDEEMED: 0, VOIDED: 0, EXPIRED: 0 };
    for (const row of countStmt.all(b.id)) {
      counts[row.state] = row.count;
    }
    return formatBatchRow(b, counts);
  });
}

function assertRegisteredAndUnfrozen(db, principalId, now) {
  const user = db.prepare('SELECT id, kind FROM users WHERE id=?').get(principalId);
  if (!user || user.kind !== 'registered') {
    throw new ApiError(403, 'REGISTERED_ACCOUNT_REQUIRED', 'Google account login is required to redeem a gift card');
  }
  const wallet = getWallet(db, principalId, now);
  if (wallet.frozen) {
    throw new ApiError(403, 'BILLING_ACCOUNT_FROZEN', wallet.frozenReason || 'Account is restricted');
  }
  if (wallet.debt > 0) {
    throw new ApiError(403, 'BILLING_DEBT_OUTSTANDING', 'Account has outstanding chargeback debt');
  }
  return wallet;
}

function lookupActiveCardByHash(db, pinHash, stamp) {
  const row = db.prepare(`
    SELECT c.*, b.channel, b.partner_name, b.base_coins, b.bonus_bps, b.state AS batch_state
    FROM billing_giftcards c
    JOIN billing_giftcard_batches b ON b.id = c.batch_id
    WHERE c.pin_hash = ?
  `).get(pinHash);

  if (!row) {
    return { ok: false, failureCountable: true, status: 404, code: 'GIFTCARD_INVALID_OR_UNAVAILABLE', message: 'Gift card PIN is invalid or not yet activated' };
  }
  if (row.state === 'REDEEMED') {
    return { ok: false, failureCountable: false, status: 409, code: 'GIFTCARD_ALREADY_REDEEMED', message: 'This gift card has already been redeemed' };
  }
  if (row.state === 'EXPIRED' || (row.expires_at !== null && row.expires_at <= stamp)) {
    return { ok: false, failureCountable: false, status: 422, code: 'GIFTCARD_EXPIRED', message: 'This gift card has expired' };
  }
  if (row.state !== 'ACTIVE' || row.batch_state !== 'ACTIVE') {
    return { ok: false, failureCountable: true, status: 404, code: 'GIFTCARD_INVALID_OR_UNAVAILABLE', message: 'Gift card PIN is invalid or not yet activated' };
  }
  return { ok: true, row };
}

export function previewGiftCard(db, {
  principalId,
  pin,
  pepper,
  bruteForceGuard = null,
  clientIp = null,
  now = Date.now
}) {
  bruteForceGuard?.assertNotLocked({ principalId, clientIp });
  assertRegisteredAndUnfrozen(db, principalId, now);

  let normalized;
  try {
    normalized = normalizeGiftCardPin(pin);
  } catch (err) {
    const bf = bruteForceGuard?.recordFailure({ principalId, clientIp });
    if (bf?.locked) {
      throw new ApiError(429, 'GIFTCARD_BRUTEFORCE_LOCKED', 'Too many invalid gift card PIN attempts', { retryAfterSec: bf.retryAfterSec });
    }
    throw err;
  }

  const pinHash = hashGiftCardPin(normalized, pepper);
  const lookup = lookupActiveCardByHash(db, pinHash, now());
  if (!lookup.ok) {
    if (lookup.failureCountable) {
      const bf = bruteForceGuard?.recordFailure({ principalId, clientIp });
      if (bf?.locked) {
        throw new ApiError(429, 'GIFTCARD_BRUTEFORCE_LOCKED', 'Too many invalid gift card PIN attempts', { retryAfterSec: bf.retryAfterSec });
      }
    }
    throw new ApiError(lookup.status, lookup.code, lookup.message);
  }

  // Never reset brute-force failure counters on non-consuming preview;
  // otherwise an attacker holding 1 unused PIN can reset counters every 4 guesses.
  const c = lookup.row;
  const bonusCoins = calcBonusCoins(c.base_coins, c.bonus_bps);

  return {
    unit: BILLING_UNIT,
    serialNo: c.serial_no,
    pinHint: c.pin_hint,
    channel: c.channel,
    partnerName: c.partner_name,
    currency: c.currency,
    faceValueMinor: c.face_value_minor,
    baseCoins: c.base_coins,
    bonusCoins,
    totalCoins: c.base_coins + bonusCoins,
    bonusBps: c.bonus_bps,
    bonusPercent: c.bonus_bps / 100,
    expiresAt: c.expires_at ? new Date(c.expires_at).toISOString() : null
  };
}

export function redeemGiftCard(db, {
  principalId,
  pin,
  idempotencyKey,
  pepper,
  bruteForceGuard = null,
  clientIp = null,
  now = Date.now
}) {
  bruteForceGuard?.assertNotLocked({ principalId, clientIp });
  assertRegisteredAndUnfrozen(db, principalId, now);

  let normalized;
  try {
    normalized = normalizeGiftCardPin(pin);
  } catch (err) {
    const bf = bruteForceGuard?.recordFailure({ principalId, clientIp });
    if (bf?.locked) {
      throw new ApiError(429, 'GIFTCARD_BRUTEFORCE_LOCKED', 'Too many invalid gift card PIN attempts', { retryAfterSec: bf.retryAfterSec });
    }
    throw err;
  }

  const pinHash = hashGiftCardPin(normalized, pepper);

  let outcome;
  try {
    outcome = withIdempotency({
      db,
      scope: 'billing.giftcard.redeem',
      key: idempotencyKey,
      principalId,
      requestPayload: { pinHash },
      now,
      fn: () => {
        const stamp = now();
        assertRegisteredAndUnfrozen(db, principalId, now);

        const lookup = lookupActiveCardByHash(db, pinHash, stamp);
        if (!lookup.ok) {
          throw new ApiError(lookup.status, lookup.code, lookup.message, { failureCountable: lookup.failureCountable });
        }

        const card = lookup.row;
        assertCanPurchase(db, {
          principalId,
          amountMinor: card.face_value_minor,
          currency: card.currency,
          includeGiftcards: true,
          now
        });
        const bonusCoins = calcBonusCoins(card.base_coins, card.bonus_bps);
        const orderId = uid();

        // Atomic conditional state transition prevents any concurrent double-redemption.
        const claimed = db.prepare(`
          UPDATE billing_giftcards
          SET state='REDEEMED', redeemed_by=?, redeemed_at=?
          WHERE id=? AND state='ACTIVE'
        `).run(principalId, stamp, card.id);
        if (claimed.changes !== 1) {
          throw new ApiError(409, 'GIFTCARD_ALREADY_REDEEMED', 'This gift card has already been redeemed');
        }

        db.prepare(`
          INSERT INTO billing_orders(
            id, principal_id, channel, provider, sku_id, currency, amount_minor,
            base_coins, bonus_coins, bonus_bps, state, provider_payment_id,
            idempotency_key, first_spent_at, paid_at, created_at, updated_at
          ) VALUES(?,?,?,?,?,?,?,?,?,?,'PAID',?,?,NULL,?,?,?)
        `).run(
          orderId, principalId, card.channel, 'giftcard', `giftcard:${card.batch_id}`,
          card.currency, card.face_value_minor, card.base_coins, bonusCoins, card.bonus_bps,
          `gc:${card.serial_no}`, `gc-order:${card.id}`, stamp, stamp, stamp
        );

        db.prepare('UPDATE billing_giftcards SET redeemed_order_id=? WHERE id=?').run(orderId, card.id);

        const credited = creditPurchase(db, {
          principalId,
          orderId,
          provider: 'giftcard',
          baseCoins: card.base_coins,
          bonusCoins,
          idempotencyKey: `gc-redeem:${card.id}`,
          isGiftCardRedeem: true,
          now
        });

        // Close batch automatically once no ISSUED or ACTIVE cards remain.
        const remaining = db.prepare(
          "SELECT COUNT(*) AS count FROM billing_giftcards WHERE batch_id=? AND state IN ('ISSUED','ACTIVE')"
        ).get(card.batch_id).count;
        if (remaining === 0) {
          db.prepare("UPDATE billing_giftcard_batches SET state='CLOSED' WHERE id=? AND state='ACTIVE'").run(card.batch_id);
        }

        return {
          status: 200,
          body: {
            unit: BILLING_UNIT,
            orderId,
            giftcard: {
              serialNo: card.serial_no,
              pinHint: card.pin_hint,
              channel: card.channel,
              partnerName: card.partner_name,
              currency: card.currency,
              faceValueMinor: card.face_value_minor,
              baseCoins: card.base_coins,
              bonusCoins,
              totalCoins: card.base_coins + bonusCoins,
              bonusBps: card.bonus_bps,
              bonusPercent: card.bonus_bps / 100,
              state: 'REDEEMED'
            },
            journalEntryId: credited.entryId,
            wallet: credited.wallet
          }
        };
      }
    });
  } catch (err) {
    if (err instanceof ApiError && err.extra?.failureCountable) {
      const bf = bruteForceGuard?.recordFailure({ principalId, clientIp });
      if (bf?.locked) {
        throw new ApiError(429, 'GIFTCARD_BRUTEFORCE_LOCKED', 'Too many invalid gift card PIN attempts', { retryAfterSec: bf.retryAfterSec });
      }
      throw new ApiError(err.status, err.code, err.message);
    }
    throw err;
  }

  if (!outcome.replayed) {
    bruteForceGuard?.recordSuccess({ principalId, clientIp });
  }
  return { replayed: outcome.replayed, ...outcome.body };
}
