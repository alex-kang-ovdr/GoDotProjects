// AWS Signature Version 4 for the S3 API subset R2 exposes. Zero dependencies (node:crypto only).
// Both query presigning (browser direct transfer) and Authorization-header signing (server
// operations) share one canonical-request builder, which tests pin to the AWS published vector.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const UNSIGNED_PAYLOAD = 'UNSIGNED-PAYLOAD';
export const EMPTY_SHA256 = createHash('sha256').update('').digest('hex');
const ALGORITHM = 'AWS4-HMAC-SHA256';

const sha256Hex = value => createHash('sha256').update(value).digest('hex');
const hmac = (key, value) => createHmac('sha256', key).update(value).digest();

export function encodeRfc3986(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

// S3 canonical URI: each segment URI-encoded once, slashes kept.
export function canonicalPath(pathname) {
  return pathname.split('/').map(segment => encodeRfc3986(decodeURIComponent(segment))).join('/');
}

function canonicalQuery(params) {
  return [...params]
    .map(([k, v]) => [encodeRfc3986(k), encodeRfc3986(v)])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
}

function normalizeHeaders(headers) {
  const out = {};
  for (const [name, value] of Object.entries(headers)) out[name.toLowerCase()] = String(value).trim().replace(/\s+/g, ' ');
  return out;
}

export function amzDate(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function signingKey(secret, day, region, service) {
  return hmac(hmac(hmac(hmac('AWS4' + secret, day), region), service), 'aws4_request');
}

function signatureFor({ method, url, headers, signedHeaderNames, payloadHash, datetime, region, service, secretAccessKey, queryParams }) {
  const day = datetime.slice(0, 8);
  const scope = `${day}/${region}/${service}/aws4_request`;
  const canonicalHeaders = signedHeaderNames.map(name => `${name}:${headers[name]}\n`).join('');
  const canonicalRequest = [
    method,
    canonicalPath(url.pathname),
    canonicalQuery(queryParams),
    canonicalHeaders,
    signedHeaderNames.join(';'),
    payloadHash,
  ].join('\n');
  const stringToSign = [ALGORITHM, datetime, scope, sha256Hex(canonicalRequest)].join('\n');
  return { scope, signature: createHmac('sha256', signingKey(secretAccessKey, day, region, service)).update(stringToSign).digest('hex') };
}

/**
 * Presign a URL (query-string auth). `headers` are additional headers the client MUST send with
 * exactly these values (e.g. content-length, content-type); `host` is always signed.
 */
export function presignUrl({ method, url, accessKeyId, secretAccessKey, region = 'auto', service = 's3', date = new Date(), expiresIn, headers = {}, query = {} }) {
  if (!Number.isInteger(expiresIn) || expiresIn < 1 || expiresIn > 604800) throw new Error('expiresIn must be 1..604800 seconds');
  const target = new URL(url);
  const datetime = amzDate(date);
  const allHeaders = normalizeHeaders({ ...headers, host: target.host });
  const signedHeaderNames = Object.keys(allHeaders).sort();
  for (const [k, v] of Object.entries(query)) target.searchParams.set(k, v);
  target.searchParams.set('X-Amz-Algorithm', ALGORITHM);
  target.searchParams.set('X-Amz-Credential', `${accessKeyId}/${datetime.slice(0, 8)}/${region}/${service}/aws4_request`);
  target.searchParams.set('X-Amz-Date', datetime);
  target.searchParams.set('X-Amz-Expires', String(expiresIn));
  target.searchParams.set('X-Amz-SignedHeaders', signedHeaderNames.join(';'));
  const { signature } = signatureFor({
    method, url: target, headers: allHeaders, signedHeaderNames, payloadHash: UNSIGNED_PAYLOAD,
    datetime, region, service, secretAccessKey, queryParams: target.searchParams,
  });
  // Build the final query in canonical order so the URL is byte-stable for tests.
  const params = [...target.searchParams, ['X-Amz-Signature', signature]];
  target.search = canonicalQuery(params);
  return { url: target.toString(), headers: Object.fromEntries(signedHeaderNames.filter(h => h !== 'host').map(h => [h, allHeaders[h]])) };
}

/** Sign a server-side request with the Authorization header. Returns headers to send. */
export function signHeaders({ method, url, accessKeyId, secretAccessKey, region = 'auto', service = 's3', date = new Date(), headers = {}, payloadHash = EMPTY_SHA256 }) {
  const target = new URL(url);
  const datetime = amzDate(date);
  const allHeaders = normalizeHeaders({ ...headers, host: target.host, 'x-amz-date': datetime, 'x-amz-content-sha256': payloadHash });
  const signedHeaderNames = Object.keys(allHeaders).sort();
  const { scope, signature } = signatureFor({
    method, url: target, headers: allHeaders, signedHeaderNames, payloadHash,
    datetime, region, service, secretAccessKey, queryParams: target.searchParams,
  });
  const out = { ...allHeaders };
  delete out.host;
  out.authorization = `${ALGORITHM} Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaderNames.join(';')}, Signature=${signature}`;
  return out;
}

function safeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length || !/^[0-9a-f]+$/.test(a)) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

function parseDatetime(value) {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value || '');
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : NaN;
}

/**
 * Verify an incoming request (used by the local S3 emulator). `lookupSecret(accessKeyId)` returns the
 * secret or null. Returns { ok:true } or { ok:false, code }.
 */
export function verifyRequest({ method, url, headers, lookupSecret, now = Date.now(), maxSkewMs = 15 * 60 * 1000 }) {
  const target = new URL(url);
  const h = normalizeHeaders(headers);
  const q = target.searchParams;
  if (q.get('X-Amz-Algorithm')) {
    if (q.get('X-Amz-Algorithm') !== ALGORITHM) return { ok: false, code: 'AuthorizationQueryParametersError' };
    const [accessKeyId, day, region, service, terminal] = (q.get('X-Amz-Credential') || '').split('/');
    const datetime = q.get('X-Amz-Date') || '';
    const expires = Number(q.get('X-Amz-Expires'));
    const signedHeaderNames = (q.get('X-Amz-SignedHeaders') || '').split(';').filter(Boolean);
    const provided = q.get('X-Amz-Signature');
    const secret = lookupSecret(accessKeyId);
    const start = parseDatetime(datetime);
    if (!secret) return { ok: false, code: 'InvalidAccessKeyId' };
    if (terminal !== 'aws4_request' || datetime.slice(0, 8) !== day || !Number.isFinite(start) || !Number.isInteger(expires)) return { ok: false, code: 'AuthorizationQueryParametersError' };
    if (!signedHeaderNames.includes('host')) return { ok: false, code: 'AuthorizationQueryParametersError' };
    if (now < start - maxSkewMs) return { ok: false, code: 'RequestNotYetValid' };
    if (now > start + expires * 1000) return { ok: false, code: 'ExpiredRequest' };
    for (const name of signedHeaderNames) if (h[name] === undefined) return { ok: false, code: 'SignatureDoesNotMatch' };
    const params = [...q].filter(([k]) => k !== 'X-Amz-Signature');
    const { signature } = signatureFor({ method, url: target, headers: h, signedHeaderNames, payloadHash: UNSIGNED_PAYLOAD, datetime, region, service, secretAccessKey: secret, queryParams: params });
    return safeEqualHex(signature, provided) ? { ok: true, accessKeyId, signedHeaderNames } : { ok: false, code: 'SignatureDoesNotMatch' };
  }
  const auth = /^AWS4-HMAC-SHA256 Credential=([^,]+), SignedHeaders=([^,]+), Signature=([0-9a-f]{64})$/.exec(h.authorization || '');
  if (!auth) return { ok: false, code: 'AccessDenied' };
  const [accessKeyId, day, region, service, terminal] = auth[1].split('/');
  const signedHeaderNames = auth[2].split(';');
  const datetime = h['x-amz-date'] || '';
  const secret = lookupSecret(accessKeyId);
  if (!secret) return { ok: false, code: 'InvalidAccessKeyId' };
  if (terminal !== 'aws4_request' || datetime.slice(0, 8) !== day || !signedHeaderNames.includes('host') || !h['x-amz-content-sha256']) return { ok: false, code: 'AuthorizationHeaderMalformed' };
  if (Math.abs(now - parseDatetime(datetime)) > maxSkewMs) return { ok: false, code: 'RequestTimeTooSkewed' };
  for (const name of signedHeaderNames) if (h[name] === undefined) return { ok: false, code: 'SignatureDoesNotMatch' };
  const { signature } = signatureFor({ method, url: target, headers: h, signedHeaderNames, payloadHash: h['x-amz-content-sha256'], datetime, region, service, secretAccessKey: secret, queryParams: target.searchParams });
  return safeEqualHex(signature, auth[3]) ? { ok: true, accessKeyId, signedHeaderNames } : { ok: false, code: 'SignatureDoesNotMatch' };
}

/** Strip signing material from a URL before it can reach logs, audit rows, or error bodies. */
export function redactUrl(value) {
  try { const u = new URL(value); return u.origin + u.pathname; } catch { return '[redacted]'; }
}
