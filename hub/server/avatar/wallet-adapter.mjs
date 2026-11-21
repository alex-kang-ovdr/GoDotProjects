import { ApiError, uid } from '../security.mjs';
import { transaction } from '../db.mjs';

const STARTER_PROMO_PLAYCOIN = 250;

/**
 * PlayCoin 3-Bucket Wallet Adapter (Track A compatible with Hub-Billing: paid / bonus / promo).
 * Designed as a drop-in seam so Hub-Billing's centralized ledger.mjs can replace the backing
 * store without changing Avatar Shop API or client contracts.
 */
export function createPlayCoinWalletAdapter({ db, now, topupPacks }) {
  const packsById = new Map(topupPacks.map((p) => [p.id, p]));

  function formatWallet(row) {
    if (!row) {
      return {
        currency: 'PlayCoin',
        paid: 0,
        bonus: 0,
        promo: STARTER_PROMO_PLAYCOIN,
        total: STARTER_PROMO_PLAYCOIN,
        welcomePreview: true,
      };
    }
    return {
      currency: 'PlayCoin',
      paid: row.paid_balance,
      bonus: row.bonus_balance,
      promo: row.promo_balance,
      total: row.paid_balance + row.bonus_balance + row.promo_balance,
      welcomePreview: false,
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  function ensureWallet(principalId) {
    let row = db.prepare('SELECT * FROM avatar_wallets WHERE principal_id=?').get(principalId);
    if (row) return row;
    const ts = now();
    const inserted = db
      .prepare('INSERT OR IGNORE INTO avatar_wallets(principal_id,paid_balance,bonus_balance,promo_balance,updated_at) VALUES(?,0,0,?,?)')
      .run(principalId, STARTER_PROMO_PLAYCOIN, ts);
    if (inserted.changes === 1) {
      db.prepare('INSERT OR IGNORE INTO avatar_wallet_ledger(id,principal_id,delta_paid,delta_bonus,delta_promo,kind,ref_id,idempotency_key,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
        .run(uid(), principalId, 0, 0, STARTER_PROMO_PLAYCOIN, 'welcome_promo', 'starter', `welcome:${principalId}`, ts);
    }
    return db.prepare('SELECT * FROM avatar_wallets WHERE principal_id=?').get(principalId);
  }

  function getWallet(principalId) {
    if (!principalId) return formatWallet(null);
    return formatWallet(ensureWallet(principalId));
  }

  function listLedger(principalId, limit = 20) {
    if (!principalId) return [];
    return db
      .prepare('SELECT id,delta_paid,delta_bonus,delta_promo,kind,ref_id,created_at FROM avatar_wallet_ledger WHERE principal_id=? ORDER BY created_at DESC,id DESC LIMIT ?')
      .all(principalId, limit)
      .map((r) => ({
        id: r.id,
        deltaPaid: r.delta_paid,
        deltaBonus: r.delta_bonus,
        deltaPromo: r.delta_promo,
        deltaTotal: r.delta_paid + r.delta_bonus + r.delta_promo,
        kind: r.kind,
        refId: r.ref_id,
        createdAt: new Date(r.created_at).toISOString(),
      }));
  }

  function topUpPack(principalId, packId, idempotencyKey) {
    const pack = packsById.get(packId);
    if (!pack) throw new ApiError(422, 'INVALID_TOPUP_PACK', '지원하지 않는 PlayCoin 충전 상품입니다.');
    const key = `topup:${principalId}:${idempotencyKey}`;
    return transaction(db, () => {
      ensureWallet(principalId);
      const existing = db.prepare('SELECT * FROM avatar_wallet_ledger WHERE idempotency_key=?').get(key);
      if (existing) {
        if (existing.ref_id !== packId) throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', '동일한 멱등키에 다른 충전 상품이 요청되었습니다.');
        const row = db.prepare('SELECT * FROM avatar_wallets WHERE principal_id=?').get(principalId);
        return { wallet: formatWallet(row), replayed: true, pack };
      }
      const ts = now();
      db.prepare('UPDATE avatar_wallets SET paid_balance=paid_balance+?, bonus_balance=bonus_balance+?, updated_at=? WHERE principal_id=?')
        .run(pack.paidCoins, pack.bonusCoins, ts, principalId);
      db.prepare('INSERT INTO avatar_wallet_ledger(id,principal_id,delta_paid,delta_bonus,delta_promo,kind,ref_id,idempotency_key,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
        .run(uid(), principalId, pack.paidCoins, pack.bonusCoins, 0, 'topup_pack', pack.id, key, ts);
      const row = db.prepare('SELECT * FROM avatar_wallets WHERE principal_id=?').get(principalId);
      return { wallet: formatWallet(row), replayed: false, pack };
    });
  }

  /**
   * Spend PlayCoin inside an active SQLite transaction (caller wraps in transaction()).
   * Priority: promo -> bonus -> paid (maximizes user benefit and protects paid principal).
   */
  function spendInTx(principalId, amount, kind, refId, idempotencyKey) {
    if (!Number.isSafeInteger(amount) || amount < 0) throw new ApiError(422, 'INVALID_AMOUNT');
    const row = ensureWallet(principalId);
    if (amount === 0) {
      return { wallet: formatWallet(row), spent: { promo: 0, bonus: 0, paid: 0 } };
    }
    const total = row.paid_balance + row.bonus_balance + row.promo_balance;
    if (total < amount) {
      throw new ApiError(402, 'INSUFFICIENT_PLAYCOIN', `PlayCoin 잔액이 부족합니다. (필요 ${amount} / 보유 ${total})`, {
        required: amount,
        available: total,
      });
    }
    let remaining = amount;
    const spendPromo = Math.min(row.promo_balance, remaining);
    remaining -= spendPromo;
    const spendBonus = Math.min(row.bonus_balance, remaining);
    remaining -= spendBonus;
    const spendPaid = remaining;

    const ts = now();
    db.prepare('UPDATE avatar_wallets SET paid_balance=paid_balance-?, bonus_balance=bonus_balance-?, promo_balance=promo_balance-?, updated_at=? WHERE principal_id=?')
      .run(spendPaid, spendBonus, spendPromo, ts, principalId);
    db.prepare('INSERT INTO avatar_wallet_ledger(id,principal_id,delta_paid,delta_bonus,delta_promo,kind,ref_id,idempotency_key,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(uid(), principalId, -spendPaid, -spendBonus, -spendPromo, kind, refId, `spend:${principalId}:${idempotencyKey}`, ts);
    const updated = db.prepare('SELECT * FROM avatar_wallets WHERE principal_id=?').get(principalId);
    return { wallet: formatWallet(updated), spent: { promo: spendPromo, bonus: spendBonus, paid: spendPaid } };
  }

  return { getWallet, ensureWallet, listLedger, topUpPack, spendInTx };
}
