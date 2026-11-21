import { createHash, createPrivateKey, createPublicKey, createSign, createVerify } from 'node:crypto';
import { ApiError, equal } from '../security.mjs';

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';
const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke';
const JWKS_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const JWKS_FORCE_REFRESH_COOLDOWN_MS = 60 * 1000; // 60 seconds
const APPLE_FETCH_TIMEOUT_MS = 5000;

let cachedJwks = null;
let cachedJwksAt = 0;
let lastForceRefreshAt = 0;

function b64urlJson(segment) {
  try {
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
  } catch {
    throw new ApiError(401, 'APPLE_TOKEN_INVALID');
  }
}

async function defaultFetchAppleJwks() {
  const res = await fetch(APPLE_JWKS_URL, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(APPLE_FETCH_TIMEOUT_MS)
  });
  if (!res.ok) throw new ApiError(503, 'APPLE_JWKS_UNAVAILABLE');
  return res.json();
}

export function clearAppleJwksCache() {
  cachedJwks = null;
  cachedJwksAt = 0;
  lastForceRefreshAt = 0;
}

async function resolveAppleJwk(kid, jwksFetcher, nowMs) {
  const fetchFn = jwksFetcher || defaultFetchAppleJwks;
  if (!cachedJwks || nowMs - cachedJwksAt > JWKS_CACHE_TTL_MS) {
    cachedJwks = await fetchFn();
    cachedJwksAt = nowMs;
  }
  let match = (cachedJwks?.keys || []).find(k => k.kid === kid);
  if (!match && (lastForceRefreshAt === 0 || nowMs - lastForceRefreshAt >= JWKS_FORCE_REFRESH_COOLDOWN_MS)) {
    // Key rotation fallback: rate-limited to at most once per 60 seconds on kid miss
    lastForceRefreshAt = nowMs;
    cachedJwks = await fetchFn();
    cachedJwksAt = nowMs;
    match = (cachedJwks?.keys || []).find(k => k.kid === kid);
  }
  if (!match) throw new ApiError(401, 'APPLE_KEY_NOT_FOUND');
  return match;
}

/**
 * Verifies a Sign in with Apple RS256 identityToken against Apple JWKS,
 * checking issuer, audience (Bundle ID), expiration, and SHA-256 nonce.
 */
export async function verifyAppleIdentityToken(
  identityToken,
  { expectedAudiences = [], rawNonce = null, jwksFetcher = null, nowMs = Date.now() } = {}
) {
  const audiences = Array.isArray(expectedAudiences)
    ? expectedAudiences.filter(a => typeof a === 'string' && a.trim().length > 0)
    : [];
  if (audiences.length === 0) {
    throw new ApiError(500, 'APPLE_AUDIENCE_REQUIRED');
  }
  if (typeof identityToken !== 'string' || identityToken.length === 0 || identityToken.length > 16384) {
    throw new ApiError(422, 'APPLE_TOKEN_REQUIRED');
  }
  const parts = identityToken.split('.');
  if (parts.length !== 3) throw new ApiError(401, 'APPLE_TOKEN_INVALID');

  const header = b64urlJson(parts[0]);
  const claims = b64urlJson(parts[1]);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid) {
    throw new ApiError(401, 'APPLE_TOKEN_HEADER_INVALID');
  }

  const jwk = await resolveAppleJwk(header.kid, jwksFetcher, nowMs);
  const publicKey = createPublicKey({ key: jwk, format: 'jwk' });
  const verifier = createVerify('RSA-SHA256');
  verifier.update(`${parts[0]}.${parts[1]}`);
  verifier.end();
  const sigBuf = Buffer.from(parts[2], 'base64url');
  if (!verifier.verify(publicKey, sigBuf)) {
    throw new ApiError(401, 'APPLE_TOKEN_SIGNATURE_INVALID');
  }

  const nowSec = Math.floor(nowMs / 1000);
  if (claims.iss !== APPLE_ISSUER) {
    throw new ApiError(401, 'APPLE_TOKEN_ISSUER_INVALID');
  }
  if (!Number.isFinite(claims.exp) || claims.exp <= nowSec) {
    throw new ApiError(401, 'APPLE_TOKEN_EXPIRED');
  }
  if (!audiences.includes(claims.aud)) {
    throw new ApiError(401, 'APPLE_TOKEN_AUDIENCE_MISMATCH');
  }
  if (typeof claims.sub !== 'string' || !claims.sub) {
    throw new ApiError(401, 'APPLE_TOKEN_SUBJECT_MISSING');
  }

  if (rawNonce !== null && rawNonce !== undefined) {
    const expectedNonceHash = createHash('sha256').update(String(rawNonce)).digest('hex');
    if (typeof claims.nonce !== 'string' || !equal(claims.nonce, expectedNonceHash)) {
      throw new ApiError(401, 'APPLE_TOKEN_NONCE_MISMATCH');
    }
  }

  return {
    sub: claims.sub,
    aud: claims.aud,
    email: typeof claims.email === 'string' ? claims.email : null,
    emailVerified: claims.email_verified === true || claims.email_verified === 'true',
    isPrivateEmail: claims.is_private_email === true || claims.is_private_email === 'true',
    authTime: Number(claims.auth_time || 0)
  };
}

/**
 * Generates an ES256 Apple client_secret JWT signed with the Apple .p8 private key.
 * Required for Apple /auth/token and /auth/revoke (Guideline 5.1.1(v) account deletion).
 */
export function buildAppleClientSecret({
  teamId,
  keyId,
  clientId,
  privateKeyPem,
  nowMs = Date.now(),
  ttlSec = 300
}) {
  if (!teamId || !keyId || !clientId || !privateKeyPem) {
    throw new ApiError(500, 'APPLE_CLIENT_SECRET_CONFIG_INVALID');
  }
  const iat = Math.floor(nowMs / 1000);
  const exp = iat + Math.min(Math.max(60, ttlSec), 15777000);
  const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: keyId })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: teamId,
    iat,
    exp,
    aud: APPLE_ISSUER,
    sub: clientId
  })).toString('base64url');

  const signer = createSign('SHA256');
  signer.update(`${header}.${payload}`);
  signer.end();
  const keyObj = createPrivateKey(privateKeyPem);
  const sig = signer.sign({ key: keyObj, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return `${header}.${payload}.${sig}`;
}

/**
 * Revokes a user's Sign in with Apple refresh/access token upon in-app account deletion
 * (mandatory under Apple App Store Review Guideline 5.1.1(v)).
 */
export async function revokeAppleToken({
  clientId,
  clientSecret,
  token,
  tokenTypeHint = 'refresh_token',
  fetchImpl = fetch
}) {
  if (!clientId || !clientSecret || !token) {
    throw new ApiError(422, 'APPLE_REVOKE_PARAMS_REQUIRED');
  }
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    token,
    token_type_hint: tokenTypeHint
  });
  const res = await fetchImpl(APPLE_REVOKE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(APPLE_FETCH_TIMEOUT_MS)
  });
  if (!res.ok) {
    throw new ApiError(502, 'APPLE_REVOKE_FAILED', `Apple /auth/revoke returned HTTP ${res.status}`);
  }
  return { revoked: true };
}
