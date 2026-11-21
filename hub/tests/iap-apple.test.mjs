import test from 'node:test';
import assert from 'node:assert/strict';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import {
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
function derOid(bytes) { return derTag(0x06, Buffer.from(bytes)); }
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
function createTestX509({ serial, subjectCn, issuerCn, subjectPublicKey, issuerPrivateKey, notBefore, notAfter }) {
  // OID 1.2.840.10045.4.3.2 (ecdsa-with-SHA256)
  const algId = derSeq(derOid([0x2a, 0x86, 0x48, 0xce, 0x3d, 0x04, 0x03, 0x02]));
  const spkiDer = subjectPublicKey.export({ type: 'spki', format: 'der' });
  const version = derTag(0xa0, derInt(2)); // v3
  const tbs = derSeq(
    version,
    derInt(serial),
    algId,
    derName(issuerCn),
    derSeq(derUtcTime(notBefore), derUtcTime(notAfter)),
    derName(subjectCn),
    spkiDer
  );
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
  const leafKey = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const rogueRootKey = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });

  const rootCert = createTestX509({
    serial: 1,
    subjectCn: 'PlayHub Test Apple Root CA G3',
    issuerCn: 'PlayHub Test Apple Root CA G3',
    subjectPublicKey: rootKey.publicKey,
    issuerPrivateKey: rootKey.privateKey,
    notBefore,
    notAfter
  });
  const leafCert = createTestX509({
    serial: 2,
    subjectCn: 'PlayHub Test StoreKit Leaf',
    issuerCn: 'PlayHub Test Apple Root CA G3',
    subjectPublicKey: leafKey.publicKey,
    issuerPrivateKey: rootKey.privateKey,
    notBefore,
    notAfter
  });
  const rogueCert = createTestX509({
    serial: 99,
    subjectCn: 'Untrusted Attacker Root',
    issuerCn: 'Untrusted Attacker Root',
    subjectPublicKey: rogueRootKey.publicKey,
    issuerPrivateKey: rogueRootKey.privateKey,
    notBefore,
    notAfter
  });

  return { rootCert, leafCert, leafKey, rogueCert, rogueRootKey };
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
