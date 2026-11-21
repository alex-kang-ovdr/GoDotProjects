import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createSign, createVerify, generateKeyPairSync } from 'node:crypto';
import {
  buildAppleClientSecret,
  clearAppleJwksCache,
  revokeAppleToken,
  verifyAppleIdentityToken
} from '../server/mobile/apple-auth.mjs';

function signRs256Jwt(privateKey, header, payload) {
  const h = Buffer.from(JSON.stringify(header)).toString('base64url');
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signer = createSign('RSA-SHA256');
  signer.update(`${h}.${p}`);
  signer.end();
  const s = signer.sign(privateKey).toString('base64url');
  return `${h}.${p}.${s}`;
}

test('Sign in with Apple JWKS RS256 verification, nonce check, Private Relay & kid rotation', async () => {
  clearAppleJwksCache();
  const k1 = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const k2 = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk1 = { ...k1.publicKey.export({ format: 'jwk' }), kid: 'apple-k1', alg: 'RS256', use: 'sig' };
  const jwk2 = { ...k2.publicKey.export({ format: 'jwk' }), kid: 'apple-k2', alg: 'RS256', use: 'sig' };

  let fetchCount = 0;
  const jwksFetcher = async () => {
    fetchCount++;
    return { keys: fetchCount === 1 ? [jwk1] : [jwk1, jwk2] };
  };

  const nowMs = Date.UTC(2026, 10, 21, 3, 0, 0);
  const nowSec = Math.floor(nowMs / 1000);
  const rawNonce = 'test-raw-nonce-12345';
  const nonceHash = createHash('sha256').update(rawNonce).digest('hex');

  const validToken = signRs256Jwt(
    k1.privateKey,
    { alg: 'RS256', kid: 'apple-k1' },
    {
      iss: 'https://appleid.apple.com',
      aud: 'com.playhub.gamedev.live',
      sub: '001234.abcdef987654.0123',
      email: 'xyz@privaterelay.appleid.com',
      email_verified: 'true',
      is_private_email: 'true',
      nonce: nonceHash,
      exp: nowSec + 600
    }
  );

  const claims = await verifyAppleIdentityToken(validToken, {
    expectedAudiences: ['com.playhub.gamedev.live'],
    rawNonce,
    jwksFetcher,
    nowMs
  });
  assert.equal(claims.sub, '001234.abcdef987654.0123');
  assert.equal(claims.isPrivateEmail, true);
  assert.equal(claims.emailVerified, true);
  assert.equal(fetchCount, 1);

  // Key rotation: unknown kid triggers JWKS refresh and succeeds with k2
  const rotatedToken = signRs256Jwt(
    k2.privateKey,
    { alg: 'RS256', kid: 'apple-k2' },
    {
      iss: 'https://appleid.apple.com',
      aud: 'com.playhub.gamedev.live',
      sub: '009999.rotated.0123',
      nonce: nonceHash,
      exp: nowSec + 600
    }
  );
  const rotatedClaims = await verifyAppleIdentityToken(rotatedToken, {
    expectedAudiences: ['com.playhub.gamedev.live'],
    rawNonce,
    jwksFetcher,
    nowMs
  });
  assert.equal(rotatedClaims.sub, '009999.rotated.0123');
  assert.equal(fetchCount, 2);

  // Nonce mismatch rejected
  await assert.rejects(
    verifyAppleIdentityToken(validToken, {
      expectedAudiences: ['com.playhub.gamedev.live'],
      rawNonce: 'wrong-nonce',
      jwksFetcher,
      nowMs
    }),
    err => err.code === 'APPLE_TOKEN_NONCE_MISMATCH'
  );

  // Audience mismatch rejected
  await assert.rejects(
    verifyAppleIdentityToken(validToken, {
      expectedAudiences: ['com.other.app'],
      rawNonce,
      jwksFetcher,
      nowMs
    }),
    err => err.code === 'APPLE_TOKEN_AUDIENCE_MISMATCH'
  );

  // Expired token rejected
  await assert.rejects(
    verifyAppleIdentityToken(validToken, {
      expectedAudiences: ['com.playhub.gamedev.live'],
      rawNonce,
      jwksFetcher,
      nowMs: nowMs + 700_000
    }),
    err => err.code === 'APPLE_TOKEN_EXPIRED'
  );
});

test('Apple ES256 client_secret signing & Guideline 5.1.1(v) /auth/revoke', async () => {
  const ec = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const privPem = ec.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const secretJwt = buildAppleClientSecret({
    teamId: 'ABCDE12345',
    keyId: 'KEY1234567',
    clientId: 'com.playhub.gamedev.live',
    privateKeyPem: privPem,
    nowMs: Date.UTC(2026, 10, 21, 3, 0, 0)
  });

  const parts = secretJwt.split('.');
  assert.equal(parts.length, 3);
  const verifier = createVerify('SHA256');
  verifier.update(`${parts[0]}.${parts[1]}`);
  verifier.end();
  assert.equal(verifier.verify({ key: ec.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(parts[2], 'base64url')), true);

  let capturedUrl = null;
  let capturedBody = null;
  const revokeRes = await revokeAppleToken({
    clientId: 'com.playhub.gamedev.live',
    clientSecret: secretJwt,
    token: 'apple-refresh-token-xyz',
    fetchImpl: async (url, init) => {
      capturedUrl = url;
      capturedBody = init.body;
      return { ok: true, status: 200 };
    }
  });
  assert.equal(revokeRes.revoked, true);
  assert.equal(capturedUrl, 'https://appleid.apple.com/auth/revoke');
  assert.match(capturedBody, /token=apple-refresh-token-xyz/);
});
