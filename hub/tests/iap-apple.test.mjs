import test from 'node:test';
import assert from 'node:assert/strict';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import {
  APPLE_STOREKIT_LEAF_OID,
  APPLE_WWDR_INTERMEDIATE_OID,
  ensureAppleIapWalletSchema,
  handleAssnV2Notification,
  spendSharedWalletCoins,
  verifyAndGrantAppleTransaction,
  verifyStoreKitJws
} from '../server/iap/apple.mjs';

// --- Pure Node ASN.1 DER X.509 v3 ES256 certificate generator (zero OpenSSL CLI dependency) ---
function derLen(len) {
  if (len < 0x80) return Buffer.from([len]);
  const bytes = [];
  let n = len;
  while (n > 0) { bytes.unshift(n & 0xff); n >>= 8; }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}
function derTag(tag, content) {
  return Buffer.concat([Buffer.from([tag]), derLen(content.length), content]);
}
function derSeq(...items) { return derTag(0x30, Buffer.concat(items)); }
function derSet(...items) { return derTag(0x31, Buffer.concat(items)); }
function derInt(num) {
  let hex = num.toString(16);
  if (hex.length % 2) hex = '0' + hex;
  let buf = Buffer.from(hex, 'hex');
  if (buf[0] & 0x80) buf = Buffer.concat([Buffer.from([0x00]), buf]);
  return derTag(0x02, buf);
}
function derBitString(buf) { return derTag(0x03, Buffer.concat([Buffer.from([0x00]), buf])); }
function derOctet(buf) { return derTag(0x04, buf); }
function derBool(v) { return derTag(0x01, Buffer.from([v ? 0xff : 0x00])); }
function derOid(bytes) { return derTag(0x06, Buffer.from(bytes)); }
function derOidStr(oid) {
  const parts = oid.split('.').map(Number);
  const out = [parts[0] * 40 + parts[1]];
  for (let i = 2; i < parts.length; i++) {
    let v = parts[i];
    const tmp = [v & 0x7f];
    v >>= 7;
    while (v > 0) { tmp.unshift((v & 0x7f) | 0x80); v >>= 7; }
    out.push(...tmp);
  }
  return derOid(out);
}
function derUtf8(str) { return derTag(0x0c, Buffer.from(str, 'utf8')); }
function derUtcTime(date) {
  const p = n => String(n).padStart(2, '0');
  const s = `${p(date.getUTCFullYear() % 100)}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}Z`;
  return derTag(0x17, Buffer.from(s, 'ascii'));
}
function derName(cn) {
  // OID 2.5.4.3 (commonName)
  return derSeq(derSet(derSeq(derOid([0x55, 0x04, 0x03]), derUtf8(cn))));
}
function createTestX509({
  serial,
  subjectCn,
  issuerCn,
  subjectPublicKey,
  issuerPrivateKey,
  notBefore,
  notAfter,
  isCa = false,
  extensionOids = []
}) {
  // OID 1.2.840.10045.4.3.2 (ecdsa-with-SHA256)
  const algId = derSeq(derOid([0x2a, 0x86, 0x48, 0xce, 0x3d, 0x04, 0x03, 0x02]));
  const spkiDer = subjectPublicKey.export({ type: 'spki', format: 'der' });
  const version = derTag(0xa0, derInt(2)); // v3
  const exts = [];
  if (isCa) {
    // BasicConstraints (2.5.29.19) critical CA:TRUE
    exts.push(derSeq(derOidStr('2.5.29.19'), derBool(true), derOctet(derSeq(derBool(true)))));
  }
  for (const oid of extensionOids) {
    exts.push(derSeq(derOidStr(oid), derOctet(Buffer.from([0x05, 0x00]))));
  }
  const tbsItems = [
    version,
    derInt(serial),
    algId,
    derName(issuerCn),
    derSeq(derUtcTime(notBefore), derUtcTime(notAfter)),
    derName(subjectCn),
    spkiDer
  ];
  if (exts.length > 0) {
    tbsItems.push(derTag(0xa3, derSeq(...exts)));
  }
  const tbs = derSeq(...tbsItems);
  const signer = createSign('SHA256');
  signer.update(tbs);
  signer.end();
  const sigDer = signer.sign(issuerPrivateKey); // DER ECDSA signature for X.509
  const certDer = derSeq(tbs, algId, derBitString(sigDer));
  const b64 = certDer.toString('base64');
  const pem = `-----BEGIN CERTIFICATE-----\n${b64.match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----\n`;
  return { der: certDer, base64: b64, pem };
}

function signEs256Jws(leafPrivateKey, x5cBase64Array, payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'ES256', x5c: x5cBase64Array })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signer = createSign('SHA256');
  signer.update(`${header}.${body}`);
  signer.end();
  const sig = signer.sign({ key: leafPrivateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return `${header}.${body}.${sig}`;
}

function makeTestPki(nowMs) {
  const notBefore = new Date(nowMs - 86400_000);
  const notAfter = new Date(nowMs + 86400_000 * 365);
  const rootKey = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const interKey = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const leafKey = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const rogueRootKey = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });

  const rootCert = createTestX509({
    serial: 1,
    subjectCn: 'PlayHub Test Apple Root CA G3',
    issuerCn: 'PlayHub Test Apple Root CA G3',
    subjectPublicKey: rootKey.publicKey,
    issuerPrivateKey: rootKey.privateKey,
    notBefore,
    notAfter,
    isCa: true
  });
  const interCert = createTestX509({
    serial: 10,
    subjectCn: 'PlayHub Test Apple WWDR G6',
    issuerCn: 'PlayHub Test Apple Root CA G3',
    subjectPublicKey: interKey.publicKey,
    issuerPrivateKey: rootKey.privateKey,
    notBefore,
    notAfter,
    isCa: true,
    extensionOids: [APPLE_WWDR_INTERMEDIATE_OID]
  });
  const leafCert = createTestX509({
    serial: 2,
    subjectCn: 'PlayHub Test StoreKit Leaf',
    issuerCn: 'PlayHub Test Apple Root CA G3',
    subjectPublicKey: leafKey.publicKey,
    issuerPrivateKey: rootKey.privateKey,
    notBefore,
    notAfter,
    isCa: false,
    extensionOids: [APPLE_STOREKIT_LEAF_OID]
  });
  const leafViaInterCert = createTestX509({
    serial: 20,
    subjectCn: 'PlayHub Test StoreKit Leaf 3-Chain',
    issuerCn: 'PlayHub Test Apple WWDR G6',
    subjectPublicKey: leafKey.publicKey,
    issuerPrivateKey: interKey.privateKey,
    notBefore,
    notAfter,
    isCa: false,
    extensionOids: [APPLE_STOREKIT_LEAF_OID]
  });
  const rogueCert = createTestX509({
    serial: 99,
    subjectCn: 'Untrusted Attacker Root',
    issuerCn: 'Untrusted Attacker Root',
    subjectPublicKey: rogueRootKey.publicKey,
    issuerPrivateKey: rogueRootKey.privateKey,
    notBefore,
    notAfter,
    isCa: true
  });

  return {
    rootKey,
    rootCert,
    interKey,
    interCert,
    leafCert,
    leafViaInterCert,
    leafKey,
    rogueCert,
    rogueRootKey,
    notBefore,
    notAfter
  };
}

test('StoreKit 2 JWS x5c chain verification, Roblox/UEFN Shared Wallet FIFO spend, ASSN v2 consumption & refund', () => {
  const nowMs = Date.UTC(2026, 10, 21, 3, 0, 0);
  const pki = makeTestPki(nowMs);
  const trustedRoots = [pki.rootCert.pem];
  const x5c = [pki.leafCert.base64, pki.rootCert.base64];

  // 1. Untrusted root rejected
  const rogueJws = signEs256Jws(pki.rogueRootKey.privateKey, [pki.rogueCert.base64, pki.rogueCert.base64], { transactionId: 'rogue' });
  assert.throws(
    () => verifyStoreKitJws(rogueJws, { trustedRootCertPems: trustedRoots, nowMs }),
    err => err.code === 'APPLE_ROOT_UNTRUSTED'
  );

  // 2. Setup in-memory SQLite DB with IAP + Shared Wallet schema
  const db = new DatabaseSync(':memory:');
  ensureAppleIapWalletSchema(db);
  db.prepare(
    "INSERT INTO iap_products(sku,platform,store_product_id,kind,game_id,coin_amount,entitlement_key,active) VALUES('coin_tier2','apple','com.playhub.coin.tier2','consumable',NULL,500,NULL,1)"
  ).run();
  db.prepare(
    "INSERT INTO iap_products(sku,platform,store_product_id,kind,game_id,coin_amount,entitlement_key,active) VALUES('pass_monthly','apple','com.playhub.pass.monthly','subscription',NULL,100,'play_pass',1)"
  ).run();

  const principalId = 'user-shared-wallet-1';

  // Pre-seed a Google Play shared paid bucket (300) and a Bonus bucket (100) to verify Roblox/UEFN Shared Wallet!
  db.prepare("INSERT INTO player_wallet_accounts(principal_id,balance,clawback_deficit,updated_at) VALUES(?,400,0,?)").run(principalId, nowMs - 1000);
  db.prepare(
    "INSERT INTO player_wallet_buckets(id,principal_id,source_platform,currency_kind,wallet_scope,source_tx_id,granted_amount,remaining_amount,created_at) VALUES('b-bonus',?,'bonus','bonus','shared',NULL,100,100,?)"
  ).run(principalId, nowMs - 900);
  db.prepare(
    "INSERT INTO player_wallet_buckets(id,principal_id,source_platform,currency_kind,wallet_scope,source_tx_id,granted_amount,remaining_amount,created_at) VALUES('b-google',?,'google','paid','shared','tx-g-1',300,300,?)"
  ).run(principalId, nowMs - 800);

  // 3. Grant Apple StoreKit 2 purchase (500 coins) -> total shared wallet balance becomes 900
  const txJws = signEs256Jws(pki.leafKey.privateKey, x5c, {
    transactionId: '200000088888',
    originalTransactionId: '200000088888',
    bundleId: 'com.playhub.gamedev.live',
    productId: 'com.playhub.coin.tier2',
    environment: 'Production',
    appAccountToken: '11111111-2222-3333-4444-555555555555'
  });

  const grant1 = verifyAndGrantAppleTransaction({
    db,
    signedTransactionInfo: txJws,
    principalId,
    expectedBundleId: 'com.playhub.gamedev.live',
    expectedEnvironment: 'Production',
    expectedAppAccountToken: '11111111-2222-3333-4444-555555555555',
    trustedRootCertPems: trustedRoots,
    now: () => nowMs
  });
  assert.equal(grant1.status, 'GRANTED');
  assert.equal(grant1.balance, 900);

  // Duplicate transaction verification is strictly idempotent (no double credit)
  const grantDup = verifyAndGrantAppleTransaction({
    db,
    signedTransactionInfo: txJws,
    principalId,
    expectedBundleId: 'com.playhub.gamedev.live',
    trustedRootCertPems: trustedRoots,
    now: () => nowMs
  });
  assert.equal(grantDup.status, 'ALREADY_GRANTED');
  assert.equal(grantDup.balance, 900);

  // 4. Spend 350 coins on iOS -> FIFO: 100 bonus first, then 250 Apple paid (leaving 250 in Apple bucket & 300 in Google shared bucket)
  const spend = spendSharedWalletCoins({
    db,
    principalId,
    amount: 350,
    currentPlatform: 'apple',
    reason: 'avatar_cosmetic',
    refId: 'hat_01',
    idempotencyKey: 'spend-req-1',
    now: () => nowMs + 1000
  });
  assert.equal(spend.status, 'SPENT');
  assert.equal(spend.balance, 550);
  assert.deepEqual(
    spend.allocations.map(a => [a.sourcePlatform, a.amount]),
    [['bonus', 100], ['apple', 250]]
  );

  // 5. ASSN v2 CONSUMPTION_REQUEST computes exact 50% consumed (250 / 500 -> consumptionStatus = 2 partially consumed)
  const consumptionPayload = signEs256Jws(pki.leafKey.privateKey, x5c, {
    notificationUUID: 'evt-consumption-1',
    notificationType: 'CONSUMPTION_REQUEST',
    data: { signedTransactionInfo: txJws }
  });
  const consumptionRes = handleAssnV2Notification({
    db,
    signedPayload: consumptionPayload,
    trustedRootCertPems: trustedRoots,
    expectedBundleId: 'com.playhub.gamedev.live',
    now: () => nowMs + 2000
  });
  assert.equal(consumptionRes.status, 'CONSUMPTION_COMPUTED');
  assert.equal(consumptionRes.consumptionInfo.consumedPercent, 50);
  assert.equal(consumptionRes.consumptionInfo.consumptionStatus, 2);

  // Duplicate ASSN v2 event ignored
  const consumptionDup = handleAssnV2Notification({
    db,
    signedPayload: consumptionPayload,
    trustedRootCertPems: trustedRoots,
    now: () => nowMs + 2500
  });
  assert.equal(consumptionDup.status, 'DUPLICATE_IGNORED');

  // 6. ASSN v2 REFUND voids tx and claws back 500 coins from balance (550 -> 50, deficit 0)
  const refundPayload = signEs256Jws(pki.leafKey.privateKey, x5c, {
    notificationUUID: 'evt-refund-1',
    notificationType: 'REFUND',
    data: { signedTransactionInfo: txJws }
  });
  const refundRes = handleAssnV2Notification({
    db,
    signedPayload: refundPayload,
    trustedRootCertPems: trustedRoots,
    expectedBundleId: 'com.playhub.gamedev.live',
    now: () => nowMs + 3000
  });
  assert.equal(refundRes.status, 'VOIDED');
  assert.equal(refundRes.clawedBack, 500);
  assert.equal(refundRes.deficitAdded, 0);
  const acctAfterRefund = db.prepare('SELECT balance, clawback_deficit FROM player_wallet_accounts WHERE principal_id=?').get(principalId);
  assert.equal(acctAfterRefund.balance, 50);
  const bucketSumAfterRefund = db.prepare('SELECT COALESCE(SUM(remaining_amount), 0) AS s FROM player_wallet_buckets WHERE principal_id=?').get(principalId).s;
  assert.equal(bucketSumAfterRefund, acctAfterRefund.balance, 'balance === SUM(remaining_amount) invariant must hold after refund');

  // 7. Subscription grant + DID_RENEW extends entitlement expires_at
  const subTx1 = signEs256Jws(pki.leafKey.privateKey, x5c, {
    transactionId: '30000001',
    originalTransactionId: '30000001',
    bundleId: 'com.playhub.gamedev.live',
    productId: 'com.playhub.pass.monthly',
    environment: 'Production',
    expiresDate: nowMs + 30 * 86400_000
  });
  const subGrant = verifyAndGrantAppleTransaction({
    db,
    signedTransactionInfo: subTx1,
    principalId,
    expectedBundleId: 'com.playhub.gamedev.live',
    trustedRootCertPems: trustedRoots,
    now: () => nowMs + 4000
  });
  assert.equal(subGrant.entitlementKey, 'play_pass');

  const renewedExpiry = nowMs + 60 * 86400_000;
  const subTx2 = signEs256Jws(pki.leafKey.privateKey, x5c, {
    transactionId: '30000002',
    originalTransactionId: '30000001',
    bundleId: 'com.playhub.gamedev.live',
    productId: 'com.playhub.pass.monthly',
    environment: 'Production',
    expiresDate: renewedExpiry
  });
  const renewWebhook = signEs256Jws(pki.leafKey.privateKey, x5c, {
    notificationUUID: 'evt-renew-1',
    notificationType: 'DID_RENEW',
    data: { signedTransactionInfo: subTx2 }
  });
  const renewRes = handleAssnV2Notification({
    db,
    signedPayload: renewWebhook,
    trustedRootCertPems: trustedRoots,
    now: () => nowMs + 5000
  });
  assert.equal(renewRes.status, 'RENEWED');
  const ent = db.prepare("SELECT expires_at FROM player_entitlements WHERE principal_id=? AND item_id='play_pass'").get(principalId);
  assert.equal(ent.expires_at, renewedExpiry);
});

test('Apple IAP Critical & High security regressions: x5c strict CA/checkIssued/OID, appAccountToken/Production/owner/VOIDED, single-clawback FIFO & scoped idempotency', () => {
  const nowMs = Date.UTC(2026, 10, 21, 6, 0, 0);
  const pki = makeTestPki(nowMs);
  const trustedRoots = [pki.rootCert.pem];
  const valid3Chain = [pki.leafViaInterCert.base64, pki.interCert.base64, pki.rootCert.base64];

  // 1. Valid 3-cert chain (leaf OID + intermediate CA/WWDR OID + root CA) succeeds strictly
  const jws3 = signEs256Jws(pki.leafKey.privateKey, valid3Chain, { transactionId: 'tx-3chain' });
  const verified3 = verifyStoreKitJws(jws3, { trustedRootCertPems: trustedRoots, nowMs });
  assert.equal(verified3.payload.transactionId, 'tx-3chain');

  // 2. Malformed x5c base64/DER returns 401 APPLE_CERT_MALFORMED (never 500)
  const badX5cJws = signEs256Jws(pki.leafKey.privateKey, ['not-a-valid-cert!!!', pki.rootCert.base64], { transactionId: 'bad' });
  assert.throws(
    () => verifyStoreKitJws(badX5cJws, { trustedRootCertPems: trustedRoots, nowMs }),
    err => err.status === 401 && err.code === 'APPLE_CERT_MALFORMED'
  );

  // 3. Non-CA issuer (ca === false) rejected with 401 APPLE_CERT_NOT_CA
  const nonCaInterKey = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const nonCaInterCert = createTestX509({
    serial: 31,
    subjectCn: 'Non-CA Intermediate',
    issuerCn: 'PlayHub Test Apple Root CA G3',
    subjectPublicKey: nonCaInterKey.publicKey,
    issuerPrivateKey: pki.rootKey.privateKey,
    notBefore: pki.notBefore,
    notAfter: pki.notAfter,
    isCa: false,
    extensionOids: [APPLE_WWDR_INTERMEDIATE_OID]
  });
  const leafUnderNonCa = createTestX509({
    serial: 32,
    subjectCn: 'Leaf Under Non-CA',
    issuerCn: 'Non-CA Intermediate',
    subjectPublicKey: pki.leafKey.publicKey,
    issuerPrivateKey: nonCaInterKey.privateKey,
    notBefore: pki.notBefore,
    notAfter: pki.notAfter,
    isCa: false,
    extensionOids: [APPLE_STOREKIT_LEAF_OID]
  });
  const nonCaJws = signEs256Jws(
    pki.leafKey.privateKey,
    [leafUnderNonCa.base64, nonCaInterCert.base64, pki.rootCert.base64],
    { transactionId: 'non-ca' }
  );
  assert.throws(
    () => verifyStoreKitJws(nonCaJws, { trustedRootCertPems: trustedRoots, nowMs }),
    err => err.status === 401 && err.code === 'APPLE_CERT_NOT_CA'
  );

  // 4. Mismatched Issuer DN fails checkIssued (401 APPLE_CERT_CHAIN_INVALID) even when signed by root key
  const badIssuerLeaf = createTestX509({
    serial: 33,
    subjectCn: 'Mismatched Issuer Leaf',
    issuerCn: 'Some Other Issuer Name',
    subjectPublicKey: pki.leafKey.publicKey,
    issuerPrivateKey: pki.rootKey.privateKey,
    notBefore: pki.notBefore,
    notAfter: pki.notAfter,
    isCa: false,
    extensionOids: [APPLE_STOREKIT_LEAF_OID]
  });
  const badIssuerJws = signEs256Jws(
    pki.leafKey.privateKey,
    [badIssuerLeaf.base64, pki.rootCert.base64],
    { transactionId: 'bad-issuer' }
  );
  assert.throws(
    () => verifyStoreKitJws(badIssuerJws, { trustedRootCertPems: trustedRoots, nowMs }),
    err => err.status === 401 && err.code === 'APPLE_CERT_CHAIN_INVALID'
  );

  // 5. Missing Apple StoreKit leaf OID rejected strictly by default (401 APPLE_CERT_OID_INVALID)
  const noOidLeaf = createTestX509({
    serial: 34,
    subjectCn: 'Leaf Without Apple OID',
    issuerCn: 'PlayHub Test Apple Root CA G3',
    subjectPublicKey: pki.leafKey.publicKey,
    issuerPrivateKey: pki.rootKey.privateKey,
    notBefore: pki.notBefore,
    notAfter: pki.notAfter,
    isCa: false,
    extensionOids: []
  });
  const noOidJws = signEs256Jws(
    pki.leafKey.privateKey,
    [noOidLeaf.base64, pki.rootCert.base64],
    { transactionId: 'no-oid' }
  );
  assert.throws(
    () => verifyStoreKitJws(noOidJws, { trustedRootCertPems: trustedRoots, nowMs }),
    err => err.status === 401 && err.code === 'APPLE_CERT_OID_INVALID'
  );
  // Explicit test opt-in bypass works only when requested
  assert.equal(
    verifyStoreKitJws(noOidJws, { trustedRootCertPems: trustedRoots, nowMs, allowTestChainOidBypass: true }).payload.transactionId,
    'no-oid'
  );

  // 6. Intermediate missing WWDR OID rejected strictly by default
  const noOidInterCert = createTestX509({
    serial: 35,
    subjectCn: 'Inter Without WWDR OID',
    issuerCn: 'PlayHub Test Apple Root CA G3',
    subjectPublicKey: pki.interKey.publicKey,
    issuerPrivateKey: pki.rootKey.privateKey,
    notBefore: pki.notBefore,
    notAfter: pki.notAfter,
    isCa: true,
    extensionOids: []
  });
  const leafUnderNoOidInter = createTestX509({
    serial: 36,
    subjectCn: 'Leaf Under Inter Without OID',
    issuerCn: 'Inter Without WWDR OID',
    subjectPublicKey: pki.leafKey.publicKey,
    issuerPrivateKey: pki.interKey.privateKey,
    notBefore: pki.notBefore,
    notAfter: pki.notAfter,
    isCa: false,
    extensionOids: [APPLE_STOREKIT_LEAF_OID]
  });
  const noOidInterJws = signEs256Jws(
    pki.leafKey.privateKey,
    [leafUnderNoOidInter.base64, noOidInterCert.base64, pki.rootCert.base64],
    { transactionId: 'no-inter-oid' }
  );
  assert.throws(
    () => verifyStoreKitJws(noOidInterJws, { trustedRootCertPems: trustedRoots, nowMs }),
    err => err.status === 401 && err.code === 'APPLE_CERT_OID_INVALID'
  );

  // 7. verifyAndGrantAppleTransaction strict checks: Production default, missing appAccountToken, owner mismatch, VOIDED resubmission
  const db = new DatabaseSync(':memory:');
  ensureAppleIapWalletSchema(db);
  db.prepare(
    "INSERT INTO iap_products(sku,platform,store_product_id,kind,game_id,coin_amount,entitlement_key,active) VALUES('coin_500','apple','com.playhub.coin.500','consumable',NULL,500,NULL,1)"
  ).run();

  // 7a. Default expectedEnvironment is 'Production' -> Sandbox receipt rejected with 403
  const sandboxTx = signEs256Jws(pki.leafKey.privateKey, valid3Chain, {
    transactionId: 'tx-sandbox-1',
    originalTransactionId: 'tx-sandbox-1',
    bundleId: 'com.playhub.live',
    productId: 'com.playhub.coin.500',
    environment: 'Sandbox',
    appAccountToken: 'aaaa-bbbb'
  });
  assert.throws(
    () => verifyAndGrantAppleTransaction({
      db,
      signedTransactionInfo: sandboxTx,
      principalId: 'user-a',
      expectedBundleId: 'com.playhub.live',
      expectedAppAccountToken: 'aaaa-bbbb',
      trustedRootCertPems: trustedRoots,
      now: () => nowMs
    }),
    err => err.status === 403 && err.code === 'APPLE_ENVIRONMENT_MISMATCH'
  );

  // 7b. Missing appAccountToken when expectedAppAccountToken is specified -> 403 immediately
  const missingTokenTx = signEs256Jws(pki.leafKey.privateKey, valid3Chain, {
    transactionId: 'tx-no-token-1',
    originalTransactionId: 'tx-no-token-1',
    bundleId: 'com.playhub.live',
    productId: 'com.playhub.coin.500',
    environment: 'Production'
  });
  assert.throws(
    () => verifyAndGrantAppleTransaction({
      db,
      signedTransactionInfo: missingTokenTx,
      principalId: 'user-a',
      expectedBundleId: 'com.playhub.live',
      expectedAppAccountToken: 'aaaa-bbbb',
      trustedRootCertPems: trustedRoots,
      now: () => nowMs
    }),
    err => err.status === 403 && err.code === 'APPLE_ACCOUNT_TOKEN_MISMATCH'
  );

  // 7c. Valid grant to user-a, then duplicate submission by user-b -> 403 APPLE_TRANSACTION_OWNER_MISMATCH
  const validProdTx = signEs256Jws(pki.leafKey.privateKey, valid3Chain, {
    transactionId: 'tx-prod-100',
    originalTransactionId: 'tx-prod-100',
    bundleId: 'com.playhub.live',
    productId: 'com.playhub.coin.500',
    environment: 'Production',
    appAccountToken: 'aaaa-bbbb'
  });
  // Seed user-a with an extra Google bucket (200) and user-b with a bucket (300)
  db.prepare("INSERT INTO player_wallet_accounts(principal_id,balance,clawback_deficit,updated_at) VALUES('user-a',200,0,?)").run(nowMs - 100);
  db.prepare(
    "INSERT INTO player_wallet_buckets(id,principal_id,source_platform,currency_kind,wallet_scope,source_tx_id,granted_amount,remaining_amount,created_at) VALUES('b-a-google','user-a','google','paid','shared','tx-g-a',200,200,?)"
  ).run(nowMs - 100);
  db.prepare("INSERT INTO player_wallet_accounts(principal_id,balance,clawback_deficit,updated_at) VALUES('user-b',300,0,?)").run(nowMs - 100);
  db.prepare(
    "INSERT INTO player_wallet_buckets(id,principal_id,source_platform,currency_kind,wallet_scope,source_tx_id,granted_amount,remaining_amount,created_at) VALUES('b-b-google','user-b','google','paid','shared','tx-g-b',300,300,?)"
  ).run(nowMs - 100);

  const gA = verifyAndGrantAppleTransaction({
    db,
    signedTransactionInfo: validProdTx,
    principalId: 'user-a',
    expectedBundleId: 'com.playhub.live',
    expectedAppAccountToken: 'aaaa-bbbb',
    trustedRootCertPems: trustedRoots,
    now: () => nowMs
  });
  assert.equal(gA.status, 'GRANTED');
  assert.equal(gA.balance, 700);

  assert.throws(
    () => verifyAndGrantAppleTransaction({
      db,
      signedTransactionInfo: validProdTx,
      principalId: 'user-b',
      expectedBundleId: 'com.playhub.live',
      expectedAppAccountToken: 'aaaa-bbbb',
      trustedRootCertPems: trustedRoots,
      now: () => nowMs
    }),
    err => err.status === 403 && err.code === 'APPLE_TRANSACTION_OWNER_MISMATCH'
  );

  // 8. Scoped (principal_id, idempotency_key): user-a and user-b can both use 'shared-key-1' independently!
  const spendA = spendSharedWalletCoins({
    db,
    principalId: 'user-a',
    amount: 150,
    currentPlatform: 'apple',
    idempotencyKey: 'shared-key-1',
    now: () => nowMs + 100
  });
  assert.equal(spendA.status, 'SPENT');
  assert.equal(spendA.balance, 550);

  const spendB = spendSharedWalletCoins({
    db,
    principalId: 'user-b',
    amount: 100,
    currentPlatform: 'google',
    idempotencyKey: 'shared-key-1',
    now: () => nowMs + 100
  });
  assert.equal(spendB.status, 'SPENT');
  assert.equal(spendB.balance, 200);

  // Replaying user-a's own key returns ALREADY_APPLIED with user-a's balance
  const spendAReplay = spendSharedWalletCoins({
    db,
    principalId: 'user-a',
    amount: 150,
    currentPlatform: 'apple',
    idempotencyKey: 'shared-key-1',
    now: () => nowMs + 200
  });
  assert.equal(spendAReplay.status, 'ALREADY_APPLIED');
  assert.equal(spendAReplay.balance, 550);

  // 9. ASSN v2 REFUND followed by REVOKE:
  //    - Only 1 clawback executes (500 coins: 350 from Apple bucket + 150 FIFO from Google bucket -> balance 50, SUM(remaining)=50)
  //    - Subsequent spend of 50 coins succeeds without CHECK(balance >= 0) crash!
  //    - Second event (REVOKE) returns ALREADY_VOIDED with 0 clawback!
  //    - Re-submitting voided tx to verifyAndGrantAppleTransaction returns 409 TRANSACTION_VOIDED!
  const refundEvent = signEs256Jws(pki.leafKey.privateKey, valid3Chain, {
    notificationUUID: 'evt-ref-100',
    notificationType: 'REFUND',
    data: { signedTransactionInfo: validProdTx }
  });
  const refRes = handleAssnV2Notification({
    db,
    signedPayload: refundEvent,
    trustedRootCertPems: trustedRoots,
    expectedBundleId: 'com.playhub.live',
    now: () => nowMs + 500
  });
  assert.equal(refRes.status, 'VOIDED');
  assert.equal(refRes.clawedBack, 500);
  assert.equal(refRes.deficitAdded, 0);

  const aAcct = db.prepare("SELECT balance, clawback_deficit FROM player_wallet_accounts WHERE principal_id='user-a'").get();
  const aBucketSum = db.prepare("SELECT COALESCE(SUM(remaining_amount), 0) AS s FROM player_wallet_buckets WHERE principal_id='user-a'").get().s;
  assert.equal(aAcct.balance, 50);
  assert.equal(aBucketSum, 50);

  // Second REVOKE event for the SAME transaction must NOT claw back a second time!
  const revokeEvent = signEs256Jws(pki.leafKey.privateKey, valid3Chain, {
    notificationUUID: 'evt-rev-100',
    notificationType: 'REVOKE',
    data: { signedTransactionInfo: validProdTx }
  });
  const revRes = handleAssnV2Notification({
    db,
    signedPayload: revokeEvent,
    trustedRootCertPems: trustedRoots,
    expectedBundleId: 'com.playhub.live',
    now: () => nowMs + 600
  });
  assert.equal(revRes.status, 'ALREADY_VOIDED');
  assert.equal(revRes.clawedBack, 0);
  assert.equal(revRes.deficitAdded, 0);
  assert.equal(
    db.prepare("SELECT balance FROM player_wallet_accounts WHERE principal_id='user-a'").get().balance,
    50
  );

  // Resubmitting VOIDED transaction to verifyAndGrantAppleTransaction must return 409 TRANSACTION_VOIDED
  assert.throws(
    () => verifyAndGrantAppleTransaction({
      db,
      signedTransactionInfo: validProdTx,
      principalId: 'user-a',
      expectedBundleId: 'com.playhub.live',
      expectedAppAccountToken: 'aaaa-bbbb',
      trustedRootCertPems: trustedRoots,
      now: () => nowMs + 700
    }),
    err => err.status === 409 && err.code === 'TRANSACTION_VOIDED'
  );

  // Spending remaining 50 coins succeeds cleanly (and spending 1 more fails cleanly with 409 INSUFFICIENT_COINS, never SQLite CHECK crash!)
  const spendRest = spendSharedWalletCoins({
    db,
    principalId: 'user-a',
    amount: 50,
    currentPlatform: 'apple',
    idempotencyKey: 'spend-rest-50',
    now: () => nowMs + 800
  });
  assert.equal(spendRest.status, 'SPENT');
  assert.equal(spendRest.balance, 0);
  assert.throws(
    () => spendSharedWalletCoins({
      db,
      principalId: 'user-a',
      amount: 1,
      currentPlatform: 'apple',
      idempotencyKey: 'spend-over-1',
      now: () => nowMs + 900
    }),
    err => err.status === 409 && err.code === 'INSUFFICIENT_COINS'
  );
});
