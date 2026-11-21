// Track A: Double-Entry Zero-Sum PlayCoin Ledger, 3-Bucket Wallet (paid/bonus/promo),
// Lot FIFO, Hold/Capture (Reserve/Settle), Anti-Bonus-Stripping, and Clawback Engine.
//
// Policy alignment (2-Track v2.0):
// - Track A handles ONLY PlayHub 1P revenue & prepaid credits (hosting, server,
//   storage, AI overage, 1P platform items). PlayHub NEVER holds creator UGC
//   sales proceeds or settles cash to creators (no `earned` bucket).
// - Every journal entry enforces SUM(signed_coins) === 0 (Airbnb / Uber Zero-Sum).
// - Spending even 1 PlayCoin (paid OR bonus) from an order lot stamps
//   billing_orders.first_spent_at, blocking 7-day unused withdrawal abuse.

import { ApiError, uid, safeString } from '../security.mjs';
import { BILLING_UNIT } from './schema.mjs';
import { runAtomic } from './idempotency.mjs';

const SEVEN_DAYS_MS = 7 * 86400000;

export const userAccount = (principalId, bucket) => `user:${principalId}:${bucket}`;
export const clearingAccount = provider => `sys:clearing:${provider}`;
export const SYS_ACCOUNTS = {
  BONUS_CONTRA: 'sys:contra:channel_bonus',
  PROMO_CONTRA: 'sys:contra:promo_grant',
  GC_UNREDEEMED: 'sys:liability:gc_unredeemed',
  PLATFORM_REVENUE: 'sys:revenue:platform',
  BREAKAGE_REVENUE: 'sys:revenue:breakage',
  CHARGEBACK_DEBT: 'sys:contra:chargeback_debt',
  REFUND_WRITEOFF: 'sys:contra:refund_writeoff',
  ADMIN_ADJUST: 'sys:contra:admin_adjust'
};

function assertPositiveInt(value, code) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new ApiError(422, code);
}

function assertNonNegativeInt(value, code) {
  if (!Number.isSafeInteger(value) || value < 0) throw new ApiError(422, code);
}

export function ensureWallet(db, principalId, now = Date.now) {
  if (!safeString(principalId, 128)) throw new ApiError(400, 'PRINCIPAL_REQUIRED');
  const stamp = now();
  db.prepare(`
    INSERT OR IGNORE INTO billing_wallet_accounts(
      principal_id, paid_balance, bonus_balance, promo_balance,
      reserved_coins, debt_coins, frozen_reason, frozen_at, updated_at
    ) VALUES(?,0,0,0,0,0,NULL,NULL,?)
  `).run(principalId, stamp);
  return db.prepare('SELECT * FROM billing_wallet_accounts WHERE principal_id=?').get(principalId);
}

export function getWallet(db, principalId, now = Date.now) {
  const row = ensureWallet(db, principalId, now);
  const spendableGross = row.paid_balance + row.bonus_balance + row.promo_balance;
  return {
    unit: BILLING_UNIT,
    principalId: row.principal_id,
    paid: row.paid_balance,
    bonus: row.bonus_balance,
    promo: row.promo_balance,
    reserved: row.reserved_coins,
    available: Math.max(0, spendableGross - row.reserved_coins),
    debt: row.debt_coins,
    frozen: Boolean(row.frozen_reason),
    frozenReason: row.frozen_reason || null,
    frozenAt: row.frozen_at || null,
    updatedAt: row.updated_at
  };
}

export function postJournalEntry(db, {
  eventType,
  orderId = null,
  sinkType = null,
  sinkRefId = null,
  idempotencyKey,
  metadata = {},
  lines,
  now = Date.now
}) {
  if (!safeString(idempotencyKey, 160)) throw new ApiError(400, 'JOURNAL_IDEMPOTENCY_REQUIRED');
  if (!Array.isArray(lines) || lines.length < 2) throw new ApiError(500, 'JOURNAL_LINES_INSUFFICIENT');

  let sum = 0;
  for (const line of lines) {
    if (!safeString(line.accountCode, 160)) throw new ApiError(500, 'JOURNAL_ACCOUNT_INVALID');
    if (!Number.isSafeInteger(line.signedCoins) || line.signedCoins === 0) {
      throw new ApiError(500, 'JOURNAL_AMOUNT_INVALID');
    }
    sum += line.signedCoins;
  }
  if (sum !== 0) {
    throw new ApiError(500, 'JOURNAL_NOT_ZERO_SUM', `Double-entry imbalance: ${sum}`);
  }

  const stamp = now();
  const entryId = uid();
  db.prepare(`
    INSERT INTO billing_journal_entries(id, event_type, order_id, sink_type, sink_ref_id, idempotency_key, metadata_json, created_at)
    VALUES(?,?,?,?,?,?,?,?)
  `).run(entryId, eventType, orderId, sinkType, sinkRefId, idempotencyKey, JSON.stringify(metadata || {}), stamp);

  const insertLine = db.prepare(`
    INSERT INTO billing_journal_lines(id, entry_id, account_code, signed_coins, lot_id, created_at)
    VALUES(?,?,?,?,?,?)
  `);
  for (const line of lines) {
    insertLine.run(uid(), entryId, line.accountCode, line.signedCoins, line.lotId || null, stamp);
  }
  return entryId;
}

export function expirePromoLots(db, principalId, now = Date.now) {
  return runAtomic(db, () => {
    const stamp = now();
    const expiredLots = db.prepare(`
      SELECT id, remaining_coins FROM billing_wallet_lots
      WHERE principal_id=? AND bucket='promo' AND remaining_coins > 0 AND expires_at IS NOT NULL AND expires_at <= ?
      ORDER BY expires_at ASC, created_at ASC
    `).all(principalId, stamp);

    if (!expiredLots.length) return { expiredCoins: 0, lotCount: 0 };

    ensureWallet(db, principalId, now);
    let totalExpired = 0;
    const lines = [];
    for (const lot of expiredLots) {
      const updated = db.prepare(
        'UPDATE billing_wallet_lots SET remaining_coins=0 WHERE id=? AND remaining_coins=?'
      ).run(lot.id, lot.remaining_coins);
      if (updated.changes !== 1) throw new ApiError(409, 'LOT_CONCURRENT_MODIFICATION');
      totalExpired += lot.remaining_coins;
      lines.push({ accountCode: userAccount(principalId, 'promo'), signedCoins: -lot.remaining_coins, lotId: lot.id });
    }
    lines.push({ accountCode: SYS_ACCOUNTS.BREAKAGE_REVENUE, signedCoins: totalExpired });

    const balUpdate = db.prepare(`
      UPDATE billing_wallet_accounts
      SET promo_balance = promo_balance - ?, updated_at = ?
      WHERE principal_id = ? AND promo_balance >= ?
    `).run(totalExpired, stamp, principalId, totalExpired);
    if (balUpdate.changes !== 1) throw new ApiError(500, 'WALLET_PROMO_SYNC_ERROR');

    postJournalEntry(db, {
      eventType: 'expire',
      idempotencyKey: `expire:${principalId}:${expiredLots.map(l => l.id).join(',')}`,
      metadata: { lotIds: expiredLots.map(l => l.id) },
      lines,
      now
    });

    return { expiredCoins: totalExpired, lotCount: expiredLots.length };
  });
}

export function creditPurchase(db, {
  principalId,
  orderId,
  provider,
  baseCoins,
  bonusCoins = 0,
  idempotencyKey,
  expiresAt = null,
  isGiftCardRedeem = false,
  now = Date.now
}) {
  assertPositiveInt(baseCoins, 'BASE_COINS_INVALID');
  assertNonNegativeInt(bonusCoins, 'BONUS_COINS_INVALID');
  if (!safeString(orderId, 128)) throw new ApiError(400, 'ORDER_ID_REQUIRED');

  return runAtomic(db, () => {
    const existingEntry = db.prepare(
      'SELECT id FROM billing_journal_entries WHERE idempotency_key=?'
    ).get(idempotencyKey);
    if (existingEntry) {
      return { duplicate: true, entryId: existingEntry.id, wallet: getWallet(db, principalId, now) };
    }

    const stamp = now();
    ensureWallet(db, principalId, now);

    const paidLotId = uid();
    db.prepare(`
      INSERT INTO billing_wallet_lots(id, principal_id, parent_order_id, bucket, initial_coins, remaining_coins, expires_at, created_at)
      VALUES(?,?,?,'paid',?,?,?,?)
    `).run(paidLotId, principalId, orderId, baseCoins, baseCoins, expiresAt, stamp);

    const sourceAccount = isGiftCardRedeem ? SYS_ACCOUNTS.GC_UNREDEEMED : clearingAccount(provider);
    const lines = [
      { accountCode: sourceAccount, signedCoins: -baseCoins },
      { accountCode: userAccount(principalId, 'paid'), signedCoins: baseCoins, lotId: paidLotId }
    ];

    let bonusLotId = null;
    if (bonusCoins > 0) {
      bonusLotId = uid();
      db.prepare(`
        INSERT INTO billing_wallet_lots(id, principal_id, parent_order_id, bucket, initial_coins, remaining_coins, expires_at, created_at)
        VALUES(?,?,?,'bonus',?,?,?,?)
      `).run(bonusLotId, principalId, orderId, bonusCoins, bonusCoins, expiresAt, stamp);

      lines.push(
        { accountCode: SYS_ACCOUNTS.BONUS_CONTRA, signedCoins: -bonusCoins },
        { accountCode: userAccount(principalId, 'bonus'), signedCoins: bonusCoins, lotId: bonusLotId }
      );
    }

    db.prepare(`
      UPDATE billing_wallet_accounts
      SET paid_balance = paid_balance + ?, bonus_balance = bonus_balance + ?, updated_at = ?
      WHERE principal_id = ?
    `).run(baseCoins, bonusCoins, stamp, principalId);

    const entryId = postJournalEntry(db, {
      eventType: isGiftCardRedeem ? 'giftcard_redeem' : 'topup',
      orderId,
      idempotencyKey,
      metadata: { provider, baseCoins, bonusCoins },
      lines,
      now
    });

    return {
      duplicate: false,
      entryId,
      paidLotId,
      bonusLotId,
      wallet: getWallet(db, principalId, now)
    };
  });
}

export function activateGiftCardLiability(db, { batchId, partnerName, totalBaseCoins, idempotencyKey, now = Date.now }) {
  assertPositiveInt(totalBaseCoins, 'BASE_COINS_INVALID');
  return runAtomic(db, () => {
    const existing = db.prepare('SELECT id FROM billing_journal_entries WHERE idempotency_key=?').get(idempotencyKey);
    if (existing) return { duplicate: true, entryId: existing.id };
    const entryId = postJournalEntry(db, {
      eventType: 'giftcard_activate',
      sinkType: 'giftcard_batch',
      sinkRefId: batchId,
      idempotencyKey,
      metadata: { partnerName, totalBaseCoins },
      lines: [
        { accountCode: clearingAccount(`giftcard_${partnerName}`), signedCoins: -totalBaseCoins },
        { accountCode: SYS_ACCOUNTS.GC_UNREDEEMED, signedCoins: totalBaseCoins }
      ],
      now
    });
    return { duplicate: false, entryId };
  });
}

export function creditPromo(db, { principalId, coins, expiresAt = null, reason = 'promo', idempotencyKey, now = Date.now }) {
  assertPositiveInt(coins, 'PROMO_COINS_INVALID');
  return runAtomic(db, () => {
    const existing = db.prepare('SELECT id FROM billing_journal_entries WHERE idempotency_key=?').get(idempotencyKey);
    if (existing) return { duplicate: true, entryId: existing.id, wallet: getWallet(db, principalId, now) };

    const stamp = now();
    ensureWallet(db, principalId, now);
    const lotId = uid();
    db.prepare(`
      INSERT INTO billing_wallet_lots(id, principal_id, parent_order_id, bucket, initial_coins, remaining_coins, expires_at, created_at)
      VALUES(?,?,NULL,'promo',?,?,?,?)
    `).run(lotId, principalId, coins, coins, expiresAt, stamp);

    db.prepare(`
      UPDATE billing_wallet_accounts
      SET promo_balance = promo_balance + ?, updated_at = ?
      WHERE principal_id = ?
    `).run(coins, stamp, principalId);

    const entryId = postJournalEntry(db, {
      eventType: 'promo_grant',
      idempotencyKey,
      metadata: { reason, expiresAt },
      lines: [
        { accountCode: SYS_ACCOUNTS.PROMO_CONTRA, signedCoins: -coins },
        { accountCode: userAccount(principalId, 'promo'), signedCoins: coins, lotId }
      ],
      now
    });

    return { duplicate: false, entryId, lotId, wallet: getWallet(db, principalId, now) };
  });
}

function consumeLotsInTx(db, {
  principalId,
  amountCoins,
  sinkType,
  sinkRefId,
  idempotencyKey,
  allowBonusForInfra = true,
  reservedAlreadyReleased = 0,
  now = Date.now
}) {
  assertPositiveInt(amountCoins, 'SPEND_COINS_INVALID');

  expirePromoLots(db, principalId, now);
  const wallet = ensureWallet(db, principalId, now);
  if (wallet.frozen_reason) throw new ApiError(403, 'BILLING_ACCOUNT_FROZEN', wallet.frozen_reason);
  if (wallet.debt_coins > 0) throw new ApiError(403, 'BILLING_DEBT_OUTSTANDING');

  const skipBonus = sinkType === 'infra_server' && allowBonusForInfra === false;
  const buckets = skipBonus ? ['promo', 'paid'] : ['promo', 'bonus', 'paid'];
  const effectiveAvailable =
    wallet.promo_balance +
    (skipBonus ? 0 : wallet.bonus_balance) +
    wallet.paid_balance -
    (wallet.reserved_coins - reservedAlreadyReleased);

  if (effectiveAvailable < amountCoins) {
    throw new ApiError(422, 'INSUFFICIENT_PLAYCOIN', 'Insufficient PlayCoin balance', {
      requiredCoins: amountCoins,
      availableCoins: Math.max(0, effectiveAvailable)
    });
  }

  const stamp = now();
  let remaining = amountCoins;
  const deductedByBucket = { promo: 0, bonus: 0, paid: 0 };
  const touchedOrderIds = new Set();
  const journalLines = [];

  for (const bucket of buckets) {
    if (remaining === 0) break;
    const lots = db.prepare(`
      SELECT id, parent_order_id, remaining_coins
      FROM billing_wallet_lots
      WHERE principal_id=? AND bucket=? AND remaining_coins > 0
        AND (expires_at IS NULL OR expires_at > ?)
      ORDER BY
        CASE WHEN expires_at IS NULL THEN 1 ELSE 0 END ASC,
        expires_at ASC,
        created_at ASC,
        id ASC
    `).all(principalId, bucket, stamp);

    for (const lot of lots) {
      if (remaining === 0) break;
      const take = Math.min(remaining, lot.remaining_coins);
      const updated = db.prepare(
        'UPDATE billing_wallet_lots SET remaining_coins = remaining_coins - ? WHERE id=? AND remaining_coins >= ?'
      ).run(take, lot.id, take);
      if (updated.changes !== 1) throw new ApiError(409, 'LOT_CONCURRENT_MODIFICATION');

      deductedByBucket[bucket] += take;
      remaining -= take;
      if (lot.parent_order_id) touchedOrderIds.add(lot.parent_order_id);
      journalLines.push({
        accountCode: userAccount(principalId, bucket),
        signedCoins: -take,
        lotId: lot.id
      });
    }
  }

  if (remaining !== 0) {
    throw new ApiError(422, 'INSUFFICIENT_PLAYCOIN');
  }

  // Anti-Bonus-Stripping Rule: spending ANY paid or bonus coin from an order
  // immediately stamps first_spent_at on the parent order.
  const markSpent = db.prepare(
    'UPDATE billing_orders SET first_spent_at = COALESCE(first_spent_at, ?), updated_at = ? WHERE id = ?'
  );
  for (const oid of touchedOrderIds) {
    markSpent.run(stamp, stamp, oid);
  }

  const updatedWallet = db.prepare(`
    UPDATE billing_wallet_accounts
    SET promo_balance = promo_balance - ?,
        bonus_balance = bonus_balance - ?,
        paid_balance = paid_balance - ?,
        reserved_coins = reserved_coins - ?,
        updated_at = ?
    WHERE principal_id = ?
      AND promo_balance >= ?
      AND bonus_balance >= ?
      AND paid_balance >= ?
      AND reserved_coins >= ?
  `).run(
    deductedByBucket.promo,
    deductedByBucket.bonus,
    deductedByBucket.paid,
    reservedAlreadyReleased,
    stamp,
    principalId,
    deductedByBucket.promo,
    deductedByBucket.bonus,
    deductedByBucket.paid,
    reservedAlreadyReleased
  );
  if (updatedWallet.changes !== 1) throw new ApiError(409, 'WALLET_CONCURRENT_MODIFICATION');

  // Track A spending recognizes 100% as PlayHub 1P platform revenue.
  journalLines.push({
    accountCode: SYS_ACCOUNTS.PLATFORM_REVENUE,
    signedCoins: amountCoins
  });

  const entryId = postJournalEntry(db, {
    eventType: reservedAlreadyReleased > 0 ? 'settle' : 'spend',
    sinkType,
    sinkRefId,
    idempotencyKey,
    metadata: { deductedByBucket, touchedOrderIds: [...touchedOrderIds], platformCoins: amountCoins },
    lines: journalLines,
    now
  });

  return {
    entryId,
    spentCoins: amountCoins,
    deductedByBucket,
    touchedOrderIds: [...touchedOrderIds],
    platformCoins: amountCoins,
    wallet: getWallet(db, principalId, now)
  };
}

export function spendCoins(db, params) {
  return runAtomic(db, () => {
    const existing = db.prepare(
      'SELECT id FROM billing_journal_entries WHERE idempotency_key=?'
    ).get(params.idempotencyKey);
    if (existing) {
      return { duplicate: true, entryId: existing.id, wallet: getWallet(db, params.principalId, params.now || Date.now) };
    }
    return { duplicate: false, ...consumeLotsInTx(db, params) };
  });
}

// Uber Hold/Capture & UsageMetering Reserve/Settle pattern.
export function reserveHold(db, {
  principalId,
  amountCoins,
  sinkType,
  sinkRefId,
  idempotencyKey,
  ttlMs = 15 * 60000,
  now = Date.now
}) {
  assertPositiveInt(amountCoins, 'HOLD_COINS_INVALID');
  return runAtomic(db, () => {
    const existing = db.prepare('SELECT * FROM billing_wallet_holds WHERE idempotency_key=?').get(idempotencyKey);
    if (existing) {
      return { duplicate: true, hold: existing, wallet: getWallet(db, principalId, now) };
    }

    expirePromoLots(db, principalId, now);
    const wallet = ensureWallet(db, principalId, now);
    if (wallet.frozen_reason) throw new ApiError(403, 'BILLING_ACCOUNT_FROZEN', wallet.frozen_reason);
    if (wallet.debt_coins > 0) throw new ApiError(403, 'BILLING_DEBT_OUTSTANDING');

    const stamp = now();
    const updated = db.prepare(`
      UPDATE billing_wallet_accounts
      SET reserved_coins = reserved_coins + ?, updated_at = ?
      WHERE principal_id = ?
        AND frozen_reason IS NULL
        AND debt_coins = 0
        AND (paid_balance + bonus_balance + promo_balance - reserved_coins) >= ?
    `).run(amountCoins, stamp, principalId, amountCoins);

    if (updated.changes !== 1) {
      throw new ApiError(422, 'INSUFFICIENT_PLAYCOIN', 'Insufficient available PlayCoin for reservation');
    }

    const holdId = uid();
    db.prepare(`
      INSERT INTO billing_wallet_holds(id, principal_id, amount_coins, settled_coins, sink_type, sink_ref_id, state, idempotency_key, expires_at, created_at, updated_at)
      VALUES(?,?,?,0,?,?,'HELD',?,?,?,?)
    `).run(holdId, principalId, amountCoins, sinkType, sinkRefId, idempotencyKey, ttlMs ? stamp + ttlMs : null, stamp, stamp);

    const hold = db.prepare('SELECT * FROM billing_wallet_holds WHERE id=?').get(holdId);
    return { duplicate: false, hold, wallet: getWallet(db, principalId, now) };
  });
}

export function settleHold(db, {
  holdId,
  actualCoins,
  idempotencyKey,
  allowBonusForInfra = true,
  now = Date.now
}) {
  assertNonNegativeInt(actualCoins, 'SETTLE_COINS_INVALID');
  return runAtomic(db, () => {
    const hold = db.prepare('SELECT * FROM billing_wallet_holds WHERE id=?').get(holdId);
    if (!hold) throw new ApiError(404, 'HOLD_NOT_FOUND');
    if (hold.state === 'SETTLED') {
      return { duplicate: true, hold, wallet: getWallet(db, hold.principal_id, now) };
    }
    if (hold.state !== 'HELD') throw new ApiError(409, 'HOLD_NOT_ACTIVE');
    if (actualCoins > hold.amount_coins) {
      throw new ApiError(422, 'SETTLE_EXCEEDS_HOLD', 'actualCoins cannot exceed reserved amount');
    }

    const stamp = now();
    const stateChange = db.prepare(`
      UPDATE billing_wallet_holds
      SET state='SETTLED', settled_coins=?, updated_at=?
      WHERE id=? AND state='HELD'
    `).run(actualCoins, stamp, holdId);
    if (stateChange.changes !== 1) throw new ApiError(409, 'HOLD_CONCURRENT_MODIFICATION');

    if (actualCoins === 0) {
      db.prepare(`
        UPDATE billing_wallet_accounts
        SET reserved_coins = reserved_coins - ?, updated_at = ?
        WHERE principal_id = ? AND reserved_coins >= ?
      `).run(hold.amount_coins, stamp, hold.principal_id, hold.amount_coins);
      return {
        duplicate: false,
        entryId: null,
        spentCoins: 0,
        releasedCoins: hold.amount_coins,
        hold: db.prepare('SELECT * FROM billing_wallet_holds WHERE id=?').get(holdId),
        wallet: getWallet(db, hold.principal_id, now)
      };
    }

    const spendResult = consumeLotsInTx(db, {
      principalId: hold.principal_id,
      amountCoins: actualCoins,
      sinkType: hold.sink_type,
      sinkRefId: hold.sink_ref_id,
      idempotencyKey,
      allowBonusForInfra,
      reservedAlreadyReleased: hold.amount_coins,
      now
    });

    return {
      duplicate: false,
      ...spendResult,
      releasedCoins: hold.amount_coins - actualCoins,
      hold: db.prepare('SELECT * FROM billing_wallet_holds WHERE id=?').get(holdId)
    };
  });
}

export function releaseHold(db, { holdId, now = Date.now }) {
  return runAtomic(db, () => {
    const hold = db.prepare('SELECT * FROM billing_wallet_holds WHERE id=?').get(holdId);
    if (!hold) throw new ApiError(404, 'HOLD_NOT_FOUND');
    if (hold.state === 'RELEASED') return { duplicate: true, hold, wallet: getWallet(db, hold.principal_id, now) };
    if (hold.state !== 'HELD') throw new ApiError(409, 'HOLD_NOT_ACTIVE');

    const stamp = now();
    const changed = db.prepare(
      "UPDATE billing_wallet_holds SET state='RELEASED', updated_at=? WHERE id=? AND state='HELD'"
    ).run(stamp, holdId);
    if (changed.changes !== 1) throw new ApiError(409, 'HOLD_CONCURRENT_MODIFICATION');

    db.prepare(`
      UPDATE billing_wallet_accounts
      SET reserved_coins = reserved_coins - ?, updated_at = ?
      WHERE principal_id = ? AND reserved_coins >= ?
    `).run(hold.amount_coins, stamp, hold.principal_id, hold.amount_coins);

    return {
      duplicate: false,
      hold: db.prepare('SELECT * FROM billing_wallet_holds WHERE id=?').get(holdId),
      wallet: getWallet(db, hold.principal_id, now)
    };
  });
}

// Handles 7-day unused withdrawal (Electronic Commerce Act) and chargeback clawback.
export function clawbackOrder(db, {
  orderId,
  kind,
  reason,
  actorId,
  refundAmountMinor = null,
  providerRefundId = null,
  idempotencyKey,
  now = Date.now
}) {
  if (!['withdrawal_7d', 'balance_refund', 'minor_cancel', 'cs_exception', 'chargeback'].includes(kind)) {
    throw new ApiError(400, 'REFUND_KIND_INVALID');
  }

  return runAtomic(db, () => {
    const existingEntry = db.prepare('SELECT id FROM billing_journal_entries WHERE idempotency_key=?').get(idempotencyKey);
    if (existingEntry) {
      const existingRefund = db.prepare('SELECT * FROM billing_refunds WHERE order_id=? ORDER BY created_at DESC LIMIT 1').get(orderId);
      return { duplicate: true, entryId: existingEntry.id, refund: existingRefund };
    }

    const order = db.prepare('SELECT * FROM billing_orders WHERE id=?').get(orderId);
    if (!order) throw new ApiError(404, 'ORDER_NOT_FOUND');
    if (order.state !== 'PAID') throw new ApiError(409, 'ORDER_NOT_REFUNDABLE', `Order state is ${order.state}`);

    const stamp = now();
    const principalId = order.principal_id;
    ensureWallet(db, principalId, now);

    if (kind === 'withdrawal_7d') {
      if (!order.paid_at || (stamp - order.paid_at) > SEVEN_DAYS_MS) {
        throw new ApiError(422, 'WITHDRAWAL_WINDOW_EXPIRED', '7-day withdrawal period has elapsed');
      }
      if (order.first_spent_at !== null) {
        throw new ApiError(409, 'WITHDRAWAL_ORDER_ALREADY_SPENT', 'Order PlayCoin (paid or bonus) has already been used');
      }
    }

    const targetPaid = order.base_coins;
    const targetBonus = order.bonus_coins;
    const lots = db.prepare(
      'SELECT id, bucket, remaining_coins FROM billing_wallet_lots WHERE parent_order_id=? AND remaining_coins > 0'
    ).all(orderId);

    const journalLines = [];
    let clawedPaid = 0;
    let clawedBonus = 0;

    for (const lot of lots) {
      db.prepare('UPDATE billing_wallet_lots SET remaining_coins=0 WHERE id=?').run(lot.id);
      if (lot.bucket === 'paid') clawedPaid += lot.remaining_coins;
      else if (lot.bucket === 'bonus') clawedBonus += lot.remaining_coins;
      journalLines.push({
        accountCode: userAccount(principalId, lot.bucket),
        signedCoins: -lot.remaining_coins,
        lotId: lot.id
      });
    }

    if (kind === 'withdrawal_7d' && (clawedPaid !== targetPaid || clawedBonus !== targetBonus)) {
      throw new ApiError(409, 'WITHDRAWAL_ORDER_ALREADY_SPENT');
    }

    let shortfallPaid = targetPaid - clawedPaid;
    let shortfallBonus = targetBonus - clawedBonus;

    if (kind === 'chargeback' || kind === 'minor_cancel') {
      for (const [bucket, needed] of [['bonus', shortfallBonus], ['paid', shortfallPaid]]) {
        let need = needed;
        if (need <= 0) continue;
        const otherLots = db.prepare(`
          SELECT id, remaining_coins FROM billing_wallet_lots
          WHERE principal_id=? AND bucket=? AND remaining_coins > 0
          ORDER BY created_at ASC, id ASC
        `).all(principalId, bucket);
        for (const lot of otherLots) {
          if (need <= 0) break;
          const take = Math.min(need, lot.remaining_coins);
          db.prepare('UPDATE billing_wallet_lots SET remaining_coins = remaining_coins - ? WHERE id=?').run(take, lot.id);
          need -= take;
          if (bucket === 'paid') { clawedPaid += take; shortfallPaid -= take; }
          else { clawedBonus += take; shortfallBonus -= take; }
          journalLines.push({
            accountCode: userAccount(principalId, bucket),
            signedCoins: -take,
            lotId: lot.id
          });
        }
      }
    }

    const debtAdded = (kind === 'chargeback') ? (shortfallPaid + shortfallBonus) : 0;

    const isGiftCard = order.channel === 'gift_card_direct' || order.channel === 'gift_card_retail';
    const clearingRev = targetPaid;
    const bonusRev = targetBonus;
    if (clearingRev > 0) {
      journalLines.push({
        accountCode: isGiftCard ? SYS_ACCOUNTS.GC_UNREDEEMED : clearingAccount(order.provider),
        signedCoins: clearingRev
      });
    }
    if (bonusRev > 0) {
      journalLines.push({ accountCode: SYS_ACCOUNTS.BONUS_CONTRA, signedCoins: bonusRev });
    }
    const unrecovered = (clearingRev + bonusRev) - (clawedPaid + clawedBonus);
    if (unrecovered > 0) {
      journalLines.push({
        accountCode: kind === 'chargeback' ? SYS_ACCOUNTS.CHARGEBACK_DEBT : SYS_ACCOUNTS.REFUND_WRITEOFF,
        signedCoins: -unrecovered
      });
    }

    const freezeReason = kind === 'chargeback' ? 'CHARGEBACK_DISPUTE' : null;
    db.prepare(`
      UPDATE billing_wallet_accounts
      SET paid_balance = paid_balance - ?,
          bonus_balance = bonus_balance - ?,
          debt_coins = debt_coins + ?,
          frozen_reason = COALESCE(?, frozen_reason),
          frozen_at = CASE WHEN ? IS NOT NULL THEN COALESCE(frozen_at, ?) ELSE frozen_at END,
          updated_at = ?
      WHERE principal_id = ?
        AND paid_balance >= ?
        AND bonus_balance >= ?
    `).run(clawedPaid, clawedBonus, debtAdded, freezeReason, freezeReason, stamp, stamp, principalId, clawedPaid, clawedBonus);

    const nextOrderState = kind === 'chargeback' ? 'CHARGEBACK' : 'REFUNDED';
    db.prepare('UPDATE billing_orders SET state=?, updated_at=? WHERE id=?').run(nextOrderState, stamp, orderId);

    const entryId = postJournalEntry(db, {
      eventType: kind === 'chargeback' ? 'chargeback_clawback' : 'refund_clawback',
      orderId,
      idempotencyKey,
      metadata: { kind, reason, actorId, clawedPaid, clawedBonus, debtAdded },
      lines: journalLines,
      now
    });

    const refundId = uid();
    const refundMinor = refundAmountMinor ?? order.amount_minor;
    db.prepare(`
      INSERT INTO billing_refunds(
        id, order_id, principal_id, kind, refund_amount_minor,
        clawback_paid_coins, clawback_bonus_coins, debt_added_coins,
        provider_refund_id, status, reason, actor_id, created_at, completed_at
      ) VALUES(?,?,?,?,?,?,?,?,?,'COMPLETED',?,?,?,?)
    `).run(
      refundId, orderId, principalId, kind, refundMinor,
      clawedPaid, clawedBonus, debtAdded,
      providerRefundId, reason, actorId, stamp, stamp
    );

    return {
      duplicate: false,
      entryId,
      refund: db.prepare('SELECT * FROM billing_refunds WHERE id=?').get(refundId),
      wallet: getWallet(db, principalId, now)
    };
  });
}

// Automated financial integrity auditor: Zero-Sum journal + projection parity + lot parity + hold parity.
export function verifyLedgerIntegrity(db) {
  const imbalances = db.prepare(`
    SELECT entry_id, SUM(signed_coins) AS net
    FROM billing_journal_lines
    GROUP BY entry_id
    HAVING net != 0
  `).all();

  const globalSum = db.prepare('SELECT COALESCE(SUM(signed_coins), 0) AS net FROM billing_journal_lines').get().net;

  const accountDrifts = [];
  const wallets = db.prepare('SELECT * FROM billing_wallet_accounts').all();
  for (const w of wallets) {
    for (const [bucket, col] of [['paid', 'paid_balance'], ['bonus', 'bonus_balance'], ['promo', 'promo_balance']]) {
      const code = userAccount(w.principal_id, bucket);
      const journalSum = db.prepare(
        'SELECT COALESCE(SUM(signed_coins), 0) AS total FROM billing_journal_lines WHERE account_code=?'
      ).get(code).total;
      if (journalSum !== w[col]) {
        accountDrifts.push({ principalId: w.principal_id, bucket, walletBalance: w[col], journalBalance: journalSum });
      }
      const lotSum = db.prepare(
        'SELECT COALESCE(SUM(remaining_coins), 0) AS total FROM billing_wallet_lots WHERE principal_id=? AND bucket=?'
      ).get(w.principal_id, bucket).total;
      if (lotSum !== w[col]) {
        accountDrifts.push({ principalId: w.principal_id, bucket, walletBalance: w[col], lotBalance: lotSum });
      }
    }
    const heldSum = db.prepare(
      "SELECT COALESCE(SUM(amount_coins), 0) AS total FROM billing_wallet_holds WHERE principal_id=? AND state='HELD'"
    ).get(w.principal_id).total;
    if (heldSum !== w.reserved_coins) {
      accountDrifts.push({ principalId: w.principal_id, bucket: 'reserved', walletReserved: w.reserved_coins, heldSum });
    }
  }

  return {
    ok: imbalances.length === 0 && globalSum === 0 && accountDrifts.length === 0,
    globalSum,
    imbalances,
    accountDrifts
  };
}
