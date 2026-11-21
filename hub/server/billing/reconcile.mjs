// Daily Reconciliation & Cross-Track Invariant Auditor (Admin Loopback Only).
// Verifies:
// 1. Track A Double-Entry Zero-Sum ledger & wallet/lot/hold consistency
// 2. Track A Bonus Hard Cap (<= 2500 bps across orders, rules, giftcard batches)
// 3. Track A PAID Orders <-> Journal Credits exact match
// 4. Track A Gift Card Liability (`sys:liability:gc_unredeemed`) == Active cards base_coins
// 5. Track B 0% Platform Fee invariant (`platform_fee_bps = 0`, `platform_fee_minor = 0`)
// 6. Track B Direct Orders <-> Entitlements state parity & Zero Track A ledger leakage

import { verifyLedgerIntegrity, SYS_ACCOUNTS } from './ledger.mjs';
import { MAX_BONUS_BPS } from './schema.mjs';

const DAY_MS = 86400000;

export function runDailyReconciliation(db, { now = Date.now } = {}) {
  const stamp = now();
  const ledgerIntegrity = verifyLedgerIntegrity(db);

  // 1. Track A: Bonus hard cap audit across all policy/order/giftcard tables
  const overCapOrders = db.prepare('SELECT COUNT(*) AS c FROM billing_orders WHERE bonus_bps > ?').get(MAX_BONUS_BPS).c;
  const overCapRules = db.prepare('SELECT COUNT(*) AS c FROM billing_channel_bonus_rules WHERE bonus_bps > ?').get(MAX_BONUS_BPS).c;
  const overCapBatches = db.prepare('SELECT COUNT(*) AS c FROM billing_giftcard_batches WHERE bonus_bps > ?').get(MAX_BONUS_BPS).c;

  // 2. Track A: Every PAID order must have a matching topup / giftcard_redeem journal entry
  const paidOrdersMissingJournal = db.prepare(`
    SELECT o.id, o.provider, o.base_coins, o.bonus_coins
    FROM billing_orders o
    LEFT JOIN billing_journal_entries e
      ON e.order_id = o.id AND e.event_type IN ('topup', 'giftcard_redeem')
    WHERE o.state = 'PAID' AND e.id IS NULL
  `).all();

  // 3. Track A: Gift card unredeemed liability == sum(base_coins) of ACTIVE giftcards
  const gcLiabilityLedger = db.prepare(
    'SELECT COALESCE(SUM(signed_coins), 0) AS bal FROM billing_journal_lines WHERE account_code=?'
  ).get(SYS_ACCOUNTS.GC_UNREDEEMED).bal;

  const gcActiveBaseCoins = db.prepare(`
    SELECT COALESCE(SUM(b.base_coins), 0) AS total
    FROM billing_giftcards c
    JOIN billing_giftcard_batches b ON b.id = c.batch_id
    WHERE c.state = 'ACTIVE'
  `).get().total;

  const gcLiabilityDiff = gcLiabilityLedger - gcActiveBaseCoins;

  // 4. Track B: Zero platform fee invariant & direct order <-> entitlement parity
  const nonZeroConnFees = db.prepare('SELECT COUNT(*) AS c FROM billing_creator_connections WHERE platform_fee_bps != 0').get().c;
  const nonZeroOrderFees = db.prepare('SELECT COUNT(*) AS c FROM billing_direct_orders WHERE platform_fee_minor != 0').get().c;

  const paidDirectMissingEntitlement = db.prepare(`
    SELECT d.id, d.buyer_id, d.game_id
    FROM billing_direct_orders d
    LEFT JOIN billing_entitlements e ON e.direct_order_id = d.id
    WHERE d.state = 'PAID' AND e.id IS NULL
  `).all();

  const refundedDirectStillActive = db.prepare(`
    SELECT d.id, e.id AS entitlement_id, e.state
    FROM billing_direct_orders d
    JOIN billing_entitlements e ON e.direct_order_id = d.id
    WHERE d.state IN ('REFUNDED', 'CHARGEBACK') AND e.state != 'REVOKED'
  `).all();

  // Ensure zero Track B direct orders leaked into Track A billing_journal_entries
  const directOrderLedgerLeaks = db.prepare(`
    SELECT COUNT(*) AS c
    FROM billing_journal_entries e
    JOIN billing_direct_orders d ON d.id = e.order_id
  `).get().c;

  // 5. Operational alerts (stale CREATED orders > 24h, expired still-HELD holds)
  const staleCreatedOrders = db.prepare(
    "SELECT COUNT(*) AS c FROM billing_orders WHERE state='CREATED' AND created_at < ?"
  ).get(stamp - DAY_MS).c;

  const expiredActiveHolds = db.prepare(
    "SELECT COUNT(*) AS c FROM billing_wallet_holds WHERE state='HELD' AND expires_at IS NOT NULL AND expires_at <= ?"
  ).get(stamp).c;

  const trackAOk = (
    overCapOrders === 0 &&
    overCapRules === 0 &&
    overCapBatches === 0 &&
    paidOrdersMissingJournal.length === 0
  );
  const giftcardLiabilityOk = gcLiabilityDiff === 0;
  const trackBOk = (
    nonZeroConnFees === 0 &&
    nonZeroOrderFees === 0 &&
    paidDirectMissingEntitlement.length === 0 &&
    refundedDirectStillActive.length === 0 &&
    directOrderLedgerLeaks === 0
  );

  return {
    ok: ledgerIntegrity.ok && trackAOk && giftcardLiabilityOk && trackBOk,
    checkedAt: new Date(stamp).toISOString(),
    ledgerIntegrity,
    trackAChecks: {
      ok: trackAOk,
      overCapOrders,
      overCapRules,
      overCapBatches,
      paidOrdersMissingJournalCount: paidOrdersMissingJournal.length
    },
    giftcardLiabilityCheck: {
      ok: giftcardLiabilityOk,
      ledgerLiabilityCoins: gcLiabilityLedger,
      activeCardsBaseCoins: gcActiveBaseCoins,
      diffCoins: gcLiabilityDiff
    },
    trackBChecks: {
      ok: trackBOk,
      nonZeroConnFees,
      nonZeroOrderFees,
      paidDirectMissingEntitlementCount: paidDirectMissingEntitlement.length,
      refundedDirectStillActiveCount: refundedDirectStillActive.length,
      directOrderLedgerLeaks
    },
    alerts: {
      staleCreatedOrders,
      expiredActiveHolds
    }
  };
}
