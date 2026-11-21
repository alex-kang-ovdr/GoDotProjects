import { X509Certificate, createVerify } from 'node:crypto';
import { transaction } from '../db.mjs';
import { ApiError, digest, uid } from '../security.mjs';

/**
 * Ensures multi-platform IAP + Roblox/UEFN Shared Wallet + Source-Bucket tables exist
 * while preserving hub/server/db.mjs PRAGMA user_version = 1 compatibility.
 */
export function ensureAppleIapWalletSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS iap_products (
      sku TEXT PRIMARY KEY,
      platform TEXT NOT NULL CHECK(platform IN ('google','apple','shared')),
      store_product_id TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('consumable','non_consumable','subscription')),
      game_id TEXT,
      coin_amount INTEGER NOT NULL DEFAULT 0 CHECK(coin_amount >= 0),
      entitlement_key TEXT,
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE UNIQUE INDEX IF NOT EXISTS iap_products_platform_store ON iap_products(platform, store_product_id);

    CREATE TABLE IF NOT EXISTS iap_transactions (
      id TEXT PRIMARY KEY,
      principal_id TEXT NOT NULL,
      platform TEXT NOT NULL CHECK(platform IN ('google','apple','web')),
      environment TEXT NOT NULL,
      sku TEXT NOT NULL,
      store_tx_id TEXT NOT NULL,
      original_tx_id TEXT,
      state TEXT NOT NULL CHECK(state IN ('GRANTED','VOIDED','EXPIRED')),
      raw_receipt_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(platform, store_tx_id)
    );
    CREATE INDEX IF NOT EXISTS iap_tx_principal ON iap_transactions(principal_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS iap_webhook_events (
      id TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      event_uuid TEXT NOT NULL UNIQUE,
      event_type TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      processed_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS player_wallet_accounts (
      principal_id TEXT PRIMARY KEY,
      balance INTEGER NOT NULL DEFAULT 0 CHECK(balance >= 0),
      clawback_deficit INTEGER NOT NULL DEFAULT 0 CHECK(clawback_deficit >= 0),
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS player_wallet_buckets (
      id TEXT PRIMARY KEY,
      principal_id TEXT NOT NULL,
      source_platform TEXT NOT NULL CHECK(source_platform IN ('apple','google','web','bonus')),
      currency_kind TEXT NOT NULL CHECK(currency_kind IN ('paid','bonus')),
      wallet_scope TEXT NOT NULL DEFAULT 'shared' CHECK(wallet_scope IN ('shared','platform_locked')),
      source_tx_id TEXT,
      granted_amount INTEGER NOT NULL CHECK(granted_amount > 0),
      remaining_amount INTEGER NOT NULL CHECK(remaining_amount >= 0),
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS wallet_buckets_principal ON player_wallet_buckets(principal_id, created_at ASC);
    CREATE INDEX IF NOT EXISTS wallet_buckets_tx ON player_wallet_buckets(source_tx_id);

    CREATE TABLE IF NOT EXISTS player_wallet_ledger (
      id TEXT PRIMARY KEY,
      principal_id TEXT NOT NULL,
      bucket_id TEXT,
      delta INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      reason TEXT NOT NULL,
      ref_id TEXT,
      idempotency_key TEXT UNIQUE,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS wallet_ledger_principal ON player_wallet_ledger(principal_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS player_entitlements (
      id TEXT PRIMARY KEY,
      principal_id TEXT NOT NULL,
      game_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      source_tx_id TEXT NOT NULL,
      expires_at INTEGER,
      revoked_at INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS entitlements_principal ON player_entitlements(principal_id, game_id, item_id);
  `);
}

function derBase64ToPem(base64Der) {
  const clean = String(base64Der || '').replace(/\s+/g, '');
  const lines = clean.match(/.{1,64}/g) || [];
  return `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----\n`;
}

/**
 * Cryptographically verifies an Apple StoreKit 2 / ASSN v2 JWS compact token:
 * 1) Validates header alg === 'ES256' and non-empty x5c chain
 * 2) Verifies X.509 certificate chain signatures (leaf -> intermediate -> root) and validity periods
 * 3) Pins the chain root SHA-256 fingerprint against trustedRootCertPems (Apple Root CA - G3)
 * 4) Verifies ES256 JWS signature using the leaf certificate's public key
 */
export function verifyStoreKitJws(jws, { trustedRootCertPems = [], nowMs = Date.now() } = {}) {
  if (typeof jws !== 'string' || jws.length === 0 || jws.length > 65536) {
    throw new ApiError(422, 'APPLE_JWS_REQUIRED');
  }
  if (!Array.isArray(trustedRootCertPems) || trustedRootCertPems.length === 0) {
    throw new ApiError(500, 'APPLE_TRUSTED_ROOTS_REQUIRED');
  }

  const parts = jws.split('.');
  if (parts.length !== 3) throw new ApiError(401, 'APPLE_JWS_MALFORMED');

  let header;
  let payload;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    throw new ApiError(401, 'APPLE_JWS_MALFORMED');
  }

  if (header.alg !== 'ES256' || !Array.isArray(header.x5c) || header.x5c.length < 2) {
    throw new ApiError(401, 'APPLE_JWS_HEADER_INVALID');
  }

  const certs = header.x5c.map(b64 => new X509Certificate(derBase64ToPem(b64)));
  for (const cert of certs) {
    const fromMs = Date.parse(cert.validFrom);
    const toMs = Date.parse(cert.validTo);
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || nowMs < fromMs || nowMs > toMs) {
      throw new ApiError(401, 'APPLE_CERT_EXPIRED');
    }
  }

  // Verify every link in the chain: cert[i] signed by cert[i+1]
  for (let i = 0; i < certs.length - 1; i++) {
    if (!certs[i].verify(certs[i + 1].publicKey)) {
      throw new ApiError(401, 'APPLE_CERT_CHAIN_INVALID');
    }
  }

  // Pin root certificate against trusted Apple Root CA list
  const trustedFingerprints = new Set(
    trustedRootCertPems.map(pem => new X509Certificate(pem).fingerprint256)
  );
  const chainRoot = certs[certs.length - 1];
  if (!trustedFingerprints.has(chainRoot.fingerprint256)) {
    throw new ApiError(401, 'APPLE_ROOT_UNTRUSTED');
  }

  // Verify ES256 JWS signature against leaf public key (IEEE P1363 raw r||s)
  const verifier = createVerify('SHA256');
  verifier.update(`${parts[0]}.${parts[1]}`);
  verifier.end();
  const sigBuf = Buffer.from(parts[2], 'base64url');
  if (!verifier.verify({ key: certs[0].publicKey, dsaEncoding: 'ieee-p1363' }, sigBuf)) {
    throw new ApiError(401, 'APPLE_JWS_SIGNATURE_INVALID');
  }

  return { header, payload, leafFingerprint: certs[0].fingerprint256 };
}

function getWalletBalance(db, principalId) {
  const row = db.prepare('SELECT balance, clawback_deficit FROM player_wallet_accounts WHERE principal_id=?').get(principalId);
  return row ? { balance: row.balance, clawbackDeficit: row.clawback_deficit } : { balance: 0, clawbackDeficit: 0 };
}

/**
 * Verifies a StoreKit 2 JWS transaction and atomically credits Play Coin into a source-tagged
 * shared wallet bucket (Roblox/UEFN Shared Wallet model) or grants entitlements.
 */
export function verifyAndGrantAppleTransaction({
  db,
  signedTransactionInfo,
  principalId,
  expectedBundleId,
  expectedEnvironment = null,
  expectedAppAccountToken = null,
  trustedRootCertPems,
  idempotencyKey = null,
  now = () => Date.now()
}) {
  const stamp = now();
  const { payload } = verifyStoreKitJws(signedTransactionInfo, { trustedRootCertPems, nowMs: stamp });

  if (expectedBundleId && payload.bundleId !== expectedBundleId) {
    throw new ApiError(403, 'APPLE_BUNDLE_ID_MISMATCH');
  }
  if (expectedEnvironment && payload.environment !== expectedEnvironment) {
    throw new ApiError(403, 'APPLE_ENVIRONMENT_MISMATCH');
  }
  if (expectedAppAccountToken && payload.appAccountToken && payload.appAccountToken.toLowerCase() !== expectedAppAccountToken.toLowerCase()) {
    throw new ApiError(403, 'APPLE_ACCOUNT_TOKEN_MISMATCH');
  }
  if (payload.revocationDate) {
    throw new ApiError(409, 'APPLE_TRANSACTION_REVOKED');
  }

  const storeTxId = String(payload.transactionId || '');
  const originalTxId = String(payload.originalTransactionId || storeTxId);
  const productId = String(payload.productId || '');
  if (!storeTxId || !productId) {
    throw new ApiError(422, 'APPLE_TX_FIELDS_MISSING');
  }

  const product = db
    .prepare("SELECT * FROM iap_products WHERE platform IN ('apple','shared') AND store_product_id=? AND active=1 LIMIT 1")
    .get(productId);
  if (!product) {
    throw new ApiError(404, 'IAP_PRODUCT_NOT_FOUND');
  }

  const receiptHash = digest(signedTransactionInfo);

  return transaction(db, () => {
    const existing = db
      .prepare("SELECT * FROM iap_transactions WHERE platform='apple' AND store_tx_id=?")
      .get(storeTxId);
    if (existing) {
      return {
        status: 'ALREADY_GRANTED',
        transactionId: existing.id,
        storeTransactionId: storeTxId,
        ...getWalletBalance(db, existing.principal_id)
      };
    }

    const txRecordId = uid();
    db.prepare(
      `INSERT INTO iap_transactions(id,principal_id,platform,environment,sku,store_tx_id,original_tx_id,state,raw_receipt_hash,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,'GRANTED',?,?,?)`
    ).run(
      txRecordId,
      principalId,
      'apple',
      String(payload.environment || 'Production'),
      product.sku,
      storeTxId,
      originalTxId,
      receiptHash,
      stamp,
      stamp
    );

    let newBalance = getWalletBalance(db, principalId).balance;
    let bucketId = null;

    if (product.coin_amount > 0) {
      bucketId = uid();
      db.prepare(
        `INSERT INTO player_wallet_buckets(id,principal_id,source_platform,currency_kind,wallet_scope,source_tx_id,granted_amount,remaining_amount,created_at)
         VALUES(?,?,'apple','paid','shared',?,?,?,?)`
      ).run(bucketId, principalId, txRecordId, product.coin_amount, product.coin_amount, stamp);

      newBalance += product.coin_amount;
      db.prepare(
        `INSERT INTO player_wallet_accounts(principal_id,balance,clawback_deficit,updated_at)
         VALUES(?,?,0,?)
         ON CONFLICT(principal_id) DO UPDATE SET balance=balance+excluded.balance, updated_at=excluded.updated_at`
      ).run(principalId, product.coin_amount, stamp);

      const finalAcct = getWalletBalance(db, principalId);
      newBalance = finalAcct.balance;
      db.prepare(
        `INSERT INTO player_wallet_ledger(id,principal_id,bucket_id,delta,balance_after,reason,ref_id,idempotency_key,created_at)
         VALUES(?,?,?,?,?,?,?,?,?)`
      ).run(
        uid(),
        principalId,
        bucketId,
        product.coin_amount,
        newBalance,
        'apple_iap_purchase',
        txRecordId,
        idempotencyKey || `apple:${storeTxId}`,
        stamp
      );
    }

    if (product.entitlement_key) {
      db.prepare(
        `INSERT INTO player_entitlements(id,principal_id,game_id,item_id,source_tx_id,expires_at,revoked_at,created_at)
         VALUES(?,?,?,?,?,?,NULL,?)`
      ).run(
        uid(),
        principalId,
        product.game_id || '_platform',
        product.entitlement_key,
        txRecordId,
        payload.expiresDate ? Number(payload.expiresDate) : null,
        stamp
      );
    }

    return {
      status: 'GRANTED',
      transactionId: txRecordId,
      storeTransactionId: storeTxId,
      bucketId,
      grantedCoins: product.coin_amount,
      entitlementKey: product.entitlement_key || null,
      ...getWalletBalance(db, principalId)
    };
  });
}

/**
 * Roblox / UEFN Shared Wallet FIFO Spend:
 * Deducts bonus coins first -> current platform paid coins -> other platforms' shared paid coins.
 */
export function spendSharedWalletCoins({
  db,
  principalId,
  amount,
  currentPlatform = 'apple',
  reason = 'in_game_spend',
  refId = null,
  idempotencyKey,
  now = () => Date.now()
}) {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new ApiError(422, 'INVALID_SPEND_AMOUNT');
  }
  if (!idempotencyKey) {
    throw new ApiError(422, 'IDEMPOTENCY_KEY_REQUIRED');
  }
  const stamp = now();

  return transaction(db, () => {
    const dup = db
      .prepare('SELECT balance_after FROM player_wallet_ledger WHERE idempotency_key=?')
      .get(idempotencyKey);
    if (dup) {
      return { status: 'ALREADY_APPLIED', balance: dup.balance_after, allocations: [] };
    }

    const rawBuckets = db
      .prepare('SELECT * FROM player_wallet_buckets WHERE principal_id=? AND remaining_amount > 0')
      .all(principalId)
      .filter(b => b.currency_kind === 'bonus' || b.wallet_scope === 'shared' || b.source_platform === currentPlatform);

    const priority = b => {
      if (b.currency_kind === 'bonus') return 0;
      if (b.source_platform === currentPlatform) return 1;
      return 2;
    };
    rawBuckets.sort((a, b) => {
      const pa = priority(a);
      const pb = priority(b);
      if (pa !== pb) return pa - pb;
      if (a.created_at !== b.created_at) return a.created_at - b.created_at;
      return a.id.localeCompare(b.id);
    });

    const available = rawBuckets.reduce((sum, b) => sum + b.remaining_amount, 0);
    if (available < amount) {
      throw new ApiError(409, 'INSUFFICIENT_COINS', `잔액 부족 (보유 ${available}, 필요 ${amount})`);
    }

    let left = amount;
    const allocations = [];
    let runningBalance = getWalletBalance(db, principalId).balance;

    for (let i = 0; i < rawBuckets.length && left > 0; i++) {
      const b = rawBuckets[i];
      const take = Math.min(b.remaining_amount, left);
      db.prepare('UPDATE player_wallet_buckets SET remaining_amount=remaining_amount-? WHERE id=?').run(take, b.id);
      runningBalance -= take;
      allocations.push({ bucketId: b.id, sourcePlatform: b.source_platform, amount: take });
      db.prepare(
        `INSERT INTO player_wallet_ledger(id,principal_id,bucket_id,delta,balance_after,reason,ref_id,idempotency_key,created_at)
         VALUES(?,?,?,?,?,?,?,?,?)`
      ).run(
        uid(),
        principalId,
        b.id,
        -take,
        runningBalance,
        reason,
        refId,
        i === 0 ? idempotencyKey : `${idempotencyKey}#${i}`,
        stamp
      );
      left -= take;
    }

    db.prepare('UPDATE player_wallet_accounts SET balance=?, updated_at=? WHERE principal_id=?').run(
      runningBalance,
      stamp,
      principalId
    );

    return { status: 'SPENT', balance: runningBalance, allocations };
  });
}

/**
 * Handles Apple App Store Server Notifications v2 (ASSN v2) webhook payloads:
 * - REFUND / REVOKE: voids transaction, revokes entitlements, claws back remaining bucket coins
 * - DID_RENEW: extends subscription entitlement expiration
 * - CONSUMPTION_REQUEST: computes exact consumption info from source bucket for Apple Consumption API
 */
export function handleAssnV2Notification({
  db,
  signedPayload,
  trustedRootCertPems,
  expectedBundleId = null,
  now = () => Date.now()
}) {
  const stamp = now();
  const { payload: outer } = verifyStoreKitJws(signedPayload, { trustedRootCertPems, nowMs: stamp });
  const eventUuid = String(outer.notificationUUID || '');
  const notificationType = String(outer.notificationType || '');
  if (!eventUuid || !notificationType) {
    throw new ApiError(422, 'ASSN_PAYLOAD_INVALID');
  }

  let txPayload = null;
  if (outer.data?.signedTransactionInfo) {
    txPayload = verifyStoreKitJws(outer.data.signedTransactionInfo, { trustedRootCertPems, nowMs: stamp }).payload;
    if (expectedBundleId && txPayload.bundleId !== expectedBundleId) {
      throw new ApiError(403, 'APPLE_BUNDLE_ID_MISMATCH');
    }
  }

  return transaction(db, () => {
    const seen = db.prepare('SELECT id FROM iap_webhook_events WHERE event_uuid=?').get(eventUuid);
    if (seen) {
      return { status: 'DUPLICATE_IGNORED', notificationType, eventUuid };
    }
    db.prepare(
      'INSERT INTO iap_webhook_events(id,platform,event_uuid,event_type,payload_hash,processed_at) VALUES(?,?,?,?,?,?)'
    ).run(uid(), 'apple', eventUuid, notificationType, digest(signedPayload), stamp);

    const storeTxId = txPayload ? String(txPayload.transactionId || '') : null;
    const txRow = storeTxId
      ? db.prepare("SELECT * FROM iap_transactions WHERE platform='apple' AND store_tx_id=?").get(storeTxId)
      : null;

    if ((notificationType === 'REFUND' || notificationType === 'REVOKE') && txRow) {
      db.prepare("UPDATE iap_transactions SET state='VOIDED', updated_at=? WHERE id=?").run(stamp, txRow.id);
      db.prepare('UPDATE player_entitlements SET revoked_at=? WHERE source_tx_id=? AND revoked_at IS NULL').run(stamp, txRow.id);

      const bucket = db.prepare('SELECT * FROM player_wallet_buckets WHERE source_tx_id=?').get(txRow.id);
      let clawedBack = 0;
      let deficitAdded = 0;
      if (bucket) {
        const acct = getWalletBalance(db, txRow.principal_id);
        clawedBack = Math.min(acct.balance, bucket.granted_amount);
        deficitAdded = Math.max(0, bucket.granted_amount - clawedBack);
        db.prepare('UPDATE player_wallet_buckets SET remaining_amount=0 WHERE id=?').run(bucket.id);
        db.prepare(
          'UPDATE player_wallet_accounts SET balance=balance-?, clawback_deficit=clawback_deficit+?, updated_at=? WHERE principal_id=?'
        ).run(clawedBack, deficitAdded, stamp, txRow.principal_id);
        db.prepare(
          `INSERT INTO player_wallet_ledger(id,principal_id,bucket_id,delta,balance_after,reason,ref_id,idempotency_key,created_at)
           VALUES(?,?,?,?,?,?,?,?,?)`
        ).run(
          uid(),
          txRow.principal_id,
          bucket.id,
          -clawedBack,
          acct.balance - clawedBack,
          `apple_${notificationType.toLowerCase()}`,
          txRow.id,
          `assn:${eventUuid}`,
          stamp
        );
      }
      return {
        status: 'VOIDED',
        notificationType,
        storeTransactionId: storeTxId,
        clawedBack,
        deficitAdded
      };
    }

    if (notificationType === 'DID_RENEW' && txPayload) {
      const origTxId = String(txPayload.originalTransactionId || '');
      const baseTx = db
        .prepare("SELECT * FROM iap_transactions WHERE platform='apple' AND original_tx_id=? ORDER BY created_at DESC LIMIT 1")
        .get(origTxId);
      if (baseTx && txPayload.expiresDate) {
        db.prepare('UPDATE player_entitlements SET expires_at=?, revoked_at=NULL WHERE source_tx_id=?').run(
          Number(txPayload.expiresDate),
          baseTx.id
        );
      }
      return { status: 'RENEWED', notificationType, originalTransactionId: origTxId };
    }

    if (notificationType === 'CONSUMPTION_REQUEST' && txRow) {
      const bucket = db.prepare('SELECT * FROM player_wallet_buckets WHERE source_tx_id=?').get(txRow.id);
      const granted = bucket?.granted_amount || 0;
      const remaining = bucket?.remaining_amount || 0;
      const consumed = Math.max(0, granted - remaining);
      const consumedPercent = granted > 0 ? Math.round((consumed / granted) * 100) : 0;
      // Apple Consumption API consumptionStatus: 1 = not consumed, 2 = partially consumed, 3 = fully consumed
      const consumptionStatus = consumed === 0 ? 1 : (remaining === 0 ? 3 : 2);
      return {
        status: 'CONSUMPTION_COMPUTED',
        notificationType,
        storeTransactionId: storeTxId,
        consumptionInfo: {
          consumptionStatus,
          consumedPercent,
          deliveryStatus: 0, // 0 = delivered and working properly
          sampleContentProvided: true
        }
      };
    }

    return { status: 'RECORDED', notificationType, eventUuid };
  });
}
