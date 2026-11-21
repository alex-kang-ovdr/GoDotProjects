import { X509Certificate, createVerify } from 'node:crypto';
import { transaction } from '../db.mjs';
import { ApiError, digest, equal, uid } from '../security.mjs';

export const APPLE_STOREKIT_LEAF_OID = '1.2.840.113635.100.6.11.1';
export const APPLE_WWDR_INTERMEDIATE_OID = '1.2.840.113635.100.6.2.1';

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
      idempotency_key TEXT,
      created_at INTEGER NOT NULL,
      UNIQUE(principal_id, idempotency_key)
    );
    CREATE INDEX IF NOT EXISTS wallet_ledger_principal ON player_wallet_ledger(principal_id, created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS wallet_ledger_principal_idem ON player_wallet_ledger(principal_id, idempotency_key);

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

function readAsn1Tlv(buf, offset, end) {
  if (offset >= end) return null;
  const tag = buf[offset++];
  if (offset >= end) return null;
  let len = buf[offset++];
  if (len & 0x80) {
    const numBytes = len & 0x7f;
    if (numBytes === 0 || numBytes > 4 || offset + numBytes > end) return null;
    len = 0;
    for (let i = 0; i < numBytes; i++) {
      len = (len << 8) | buf[offset++];
    }
  }
  const valStart = offset;
  const valEnd = valStart + len;
  if (valEnd > end) return null;
  return { tag, valStart, valEnd, nextOffset: valEnd };
}

function decodeDerOid(buf, start, end) {
  if (start >= end) return null;
  const firstByte = buf[start];
  const parts = firstByte >= 80
    ? [2, firstByte - 80]
    : [Math.floor(firstByte / 40), firstByte % 40];
  let value = 0;
  let inArc = false;
  for (let i = start + 1; i < end; i++) {
    const b = buf[i];
    value = value * 128 + (b & 0x7f);
    inArc = true;
    if ((b & 0x80) === 0) {
      parts.push(value);
      value = 0;
      inArc = false;
    }
  }
  if (inArc) return null;
  return parts.join('.');
}

function extractX509ExtensionOids(rawDer) {
  const oids = new Set();
  if (!Buffer.isBuffer(rawDer) || rawDer.length === 0) return oids;
  const certSeq = readAsn1Tlv(rawDer, 0, rawDer.length);
  if (!certSeq || certSeq.tag !== 0x30) return oids;
  const tbsSeq = readAsn1Tlv(rawDer, certSeq.valStart, certSeq.valEnd);
  if (!tbsSeq || tbsSeq.tag !== 0x30) return oids;

  let pos = tbsSeq.valStart;
  while (pos < tbsSeq.valEnd) {
    const field = readAsn1Tlv(rawDer, pos, tbsSeq.valEnd);
    if (!field) break;
    if (field.tag === 0xa3) {
      const extsSeq = readAsn1Tlv(rawDer, field.valStart, field.valEnd);
      if (extsSeq && extsSeq.tag === 0x30) {
        let ePos = extsSeq.valStart;
        while (ePos < extsSeq.valEnd) {
          const extSeq = readAsn1Tlv(rawDer, ePos, extsSeq.valEnd);
          if (!extSeq) break;
          if (extSeq.tag === 0x30) {
            const oidTlv = readAsn1Tlv(rawDer, extSeq.valStart, extSeq.valEnd);
            if (oidTlv && oidTlv.tag === 0x06) {
              const oid = decodeDerOid(rawDer, oidTlv.valStart, oidTlv.valEnd);
              if (oid) oids.add(oid);
            }
          }
          ePos = extSeq.nextOffset;
        }
      }
      break;
    }
    pos = field.nextOffset;
  }
  return oids;
}

/**
 * Cryptographically verifies an Apple StoreKit 2 / ASSN v2 JWS compact token:
 * 1) Validates header alg === 'ES256' and non-empty x5c chain
 * 2) Verifies X.509 certificate chain signatures (leaf -> intermediate -> root),
 *    CA BasicConstraints, Issuer/Subject checkIssued, validity periods, and Apple StoreKit OID extensions
 * 3) Pins the chain root SHA-256 fingerprint against trustedRootCertPems (Apple Root CA - G3)
 * 4) Verifies ES256 JWS signature using the leaf certificate's public key
 */
export function verifyStoreKitJws(
  jws,
  { trustedRootCertPems = [], nowMs = Date.now(), allowTestChainOidBypass = false } = {}
) {
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

  if (header.alg !== 'ES256' || !Array.isArray(header.x5c) || header.x5c.length < 2 || header.x5c.length > 8) {
    throw new ApiError(401, 'APPLE_JWS_HEADER_INVALID');
  }

  let certs;
  try {
    certs = header.x5c.map(b64 => {
      if (typeof b64 !== 'string' || !b64.trim()) throw new Error('Invalid x5c entry');
      return new X509Certificate(derBase64ToPem(b64));
    });
  } catch {
    throw new ApiError(401, 'APPLE_CERT_MALFORMED');
  }

  for (const cert of certs) {
    const fromMs = Date.parse(cert.validFrom);
    const toMs = Date.parse(cert.validTo);
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || nowMs < fromMs || nowMs > toMs) {
      throw new ApiError(401, 'APPLE_CERT_EXPIRED');
    }
  }

  // Every intermediate and root certificate must carry CA BasicConstraints (ca === true)
  for (let i = 1; i < certs.length; i++) {
    if (certs[i].ca !== true) {
      throw new ApiError(401, 'APPLE_CERT_NOT_CA');
    }
  }

  // Verify every link in the chain: cert[i] issued and signed by cert[i+1]
  for (let i = 0; i < certs.length - 1; i++) {
    if (!certs[i].checkIssued(certs[i + 1]) || !certs[i].verify(certs[i + 1].publicKey)) {
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

  // Verify Apple StoreKit / WWDR dedicated X.509 extension OIDs (strict by default)
  if (!allowTestChainOidBypass) {
    const leafOids = extractX509ExtensionOids(certs[0].raw);
    if (!leafOids.has(APPLE_STOREKIT_LEAF_OID)) {
      throw new ApiError(401, 'APPLE_CERT_OID_INVALID');
    }
    if (certs.length >= 3) {
      const interOids = extractX509ExtensionOids(certs[1].raw);
      if (!interOids.has(APPLE_WWDR_INTERMEDIATE_OID)) {
        throw new ApiError(401, 'APPLE_CERT_OID_INVALID');
      }
    }
  }

  // Verify ES256 JWS signature against leaf public key (IEEE P1363 raw r||s)
  let verified = false;
  try {
    const verifier = createVerify('SHA256');
    verifier.update(`${parts[0]}.${parts[1]}`);
    verifier.end();
    const sigBuf = Buffer.from(parts[2], 'base64url');
    verified = verifier.verify({ key: certs[0].publicKey, dsaEncoding: 'ieee-p1363' }, sigBuf);
  } catch {
    verified = false;
  }
  if (!verified) {
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
  expectedEnvironment = 'Production',
  expectedAppAccountToken = null,
  trustedRootCertPems,
  idempotencyKey = null,
  allowTestChainOidBypass = false,
  now = () => Date.now()
}) {
  if (!principalId || typeof principalId !== 'string') {
    throw new ApiError(422, 'PRINCIPAL_ID_REQUIRED');
  }
  if (!expectedEnvironment || typeof expectedEnvironment !== 'string') {
    throw new ApiError(500, 'APPLE_EXPECTED_ENVIRONMENT_REQUIRED');
  }
  const stamp = now();
  const { payload } = verifyStoreKitJws(signedTransactionInfo, {
    trustedRootCertPems,
    nowMs: stamp,
    allowTestChainOidBypass
  });

  if (expectedBundleId && payload.bundleId !== expectedBundleId) {
    throw new ApiError(403, 'APPLE_BUNDLE_ID_MISMATCH');
  }
  if (payload.environment !== expectedEnvironment) {
    throw new ApiError(403, 'APPLE_ENVIRONMENT_MISMATCH');
  }
  if (expectedAppAccountToken) {
    if (
      typeof payload.appAccountToken !== 'string' ||
      !payload.appAccountToken ||
      !equal(payload.appAccountToken.toLowerCase(), String(expectedAppAccountToken).toLowerCase())
    ) {
      throw new ApiError(403, 'APPLE_ACCOUNT_TOKEN_MISMATCH');
    }
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
      if (existing.principal_id !== principalId) {
        throw new ApiError(403, 'APPLE_TRANSACTION_OWNER_MISMATCH');
      }
      if (existing.state === 'VOIDED') {
        throw new ApiError(409, 'TRANSACTION_VOIDED');
      }
      if (existing.state !== 'GRANTED') {
        throw new ApiError(409, 'TRANSACTION_NOT_GRANTED');
      }
      return {
        status: 'ALREADY_GRANTED',
        transactionId: existing.id,
        storeTransactionId: storeTxId,
        ...getWalletBalance(db, principalId)
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
      .prepare('SELECT balance_after FROM player_wallet_ledger WHERE principal_id=? AND idempotency_key=?')
      .get(principalId, idempotencyKey);
    if (dup) {
      let finalBalance = dup.balance_after;
      for (let idx = 1; ; idx++) {
        const nextLeg = db
          .prepare('SELECT balance_after FROM player_wallet_ledger WHERE principal_id=? AND idempotency_key=?')
          .get(principalId, `${idempotencyKey}#${idx}`);
        if (!nextLeg) break;
        finalBalance = nextLeg.balance_after;
      }
      return { status: 'ALREADY_APPLIED', balance: finalBalance, allocations: [] };
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
  allowTestChainOidBypass = false,
  now = () => Date.now()
}) {
  const stamp = now();
  const { payload: outer } = verifyStoreKitJws(signedPayload, {
    trustedRootCertPems,
    nowMs: stamp,
    allowTestChainOidBypass
  });
  const eventUuid = String(outer.notificationUUID || '');
  const notificationType = String(outer.notificationType || '');
  if (!eventUuid || !notificationType) {
    throw new ApiError(422, 'ASSN_PAYLOAD_INVALID');
  }

  let txPayload = null;
  if (outer.data?.signedTransactionInfo) {
    txPayload = verifyStoreKitJws(outer.data.signedTransactionInfo, {
      trustedRootCertPems,
      nowMs: stamp,
      allowTestChainOidBypass
    }).payload;
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
      // Strictly-once clawback: only execute when transitioning GRANTED -> VOIDED
      const voided = db
        .prepare("UPDATE iap_transactions SET state='VOIDED', updated_at=? WHERE id=? AND state='GRANTED'")
        .run(stamp, txRow.id);
      if (voided.changes !== 1) {
        return {
          status: 'ALREADY_VOIDED',
          notificationType,
          storeTransactionId: storeTxId,
          clawedBack: 0,
          deficitAdded: 0
        };
      }
      db.prepare('UPDATE player_entitlements SET revoked_at=? WHERE source_tx_id=? AND revoked_at IS NULL').run(stamp, txRow.id);

      const bucket = db.prepare('SELECT * FROM player_wallet_buckets WHERE source_tx_id=?').get(txRow.id);
      let clawedBack = 0;
      let deficitAdded = 0;
      if (bucket) {
        const acct = getWalletBalance(db, txRow.principal_id);
        const allBuckets = db
          .prepare('SELECT id, remaining_amount FROM player_wallet_buckets WHERE principal_id=? AND remaining_amount > 0 ORDER BY created_at ASC, id ASC')
          .all(txRow.principal_id);
        const totalBucketRemaining = allBuckets.reduce((sum, b) => sum + b.remaining_amount, 0);
        const availableToClaw = Math.min(acct.balance, totalBucketRemaining);
        clawedBack = Math.min(availableToClaw, bucket.granted_amount);
        deficitAdded = Math.max(0, bucket.granted_amount - clawedBack);

        // Drain refunded source bucket first, then other buckets in FIFO order to maintain balance === SUM(remaining_amount)
        let leftToClaw = clawedBack;
        const fromSource = Math.min(bucket.remaining_amount, leftToClaw);
        if (fromSource > 0) {
          db.prepare('UPDATE player_wallet_buckets SET remaining_amount=remaining_amount-? WHERE id=?').run(fromSource, bucket.id);
          leftToClaw -= fromSource;
        }
        for (const other of allBuckets) {
          if (leftToClaw <= 0) break;
          if (other.id === bucket.id) continue;
          const take = Math.min(other.remaining_amount, leftToClaw);
          if (take > 0) {
            db.prepare('UPDATE player_wallet_buckets SET remaining_amount=remaining_amount-? WHERE id=?').run(take, other.id);
            leftToClaw -= take;
          }
        }

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
