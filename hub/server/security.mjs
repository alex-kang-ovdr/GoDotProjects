import { randomBytes, randomUUID, createHash, timingSafeEqual, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
export const PUBLIC_COOKIE = 'poc_public_session';
export const ADMIN_COOKIE = 'poc_admin_session';
export const uid = () => randomUUID();
export const secret = () => randomBytes(32).toString('base64url');
export const digest = value => createHash('sha256').update(String(value)).digest('hex');
export function equal(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export class ApiError extends Error {
  constructor(status, code, message = code, extra) { super(message); this.status = status; this.code = code; this.extra = extra; }
}
export function cookies(req) {
  const result = {};
  for (const item of (req.headers.cookie || '').split(';')) {
    const at = item.indexOf('=');
    if (at > 0) { try { result[item.slice(0, at).trim()] = decodeURIComponent(item.slice(at + 1).trim()); } catch {} }
  }
  return result;
}
export function setCookie(res, name, value, secure, maxAge = 2592000) {
  const line = `${name}=${value}; Path=/api; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
  const old = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', old ? [...(Array.isArray(old) ? old : [old]), line] : [line]);
}
export async function readJson(req, limit = 300 * 1024) {
  if (!(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) throw new ApiError(415, 'JSON_REQUIRED');
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new ApiError(413, 'BODY_TOO_LARGE');
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new ApiError(400, 'INVALID_JSON'); }
}
export function json(res, status, value) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(value));
}
export function redirect(res, target) { res.statusCode = 302; res.setHeader('Location', target); res.setHeader('Cache-Control', 'no-store'); res.end(); }
export function cors(req, res, origins, mutation = false) {
  const origin = req.headers.origin;
  if (origin && !origins.includes(origin)) throw new ApiError(403, 'ORIGIN_DENIED');
  if (mutation && (!origin || !origins.includes(origin))) throw new ApiError(403, 'ORIGIN_REQUIRED');
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Expose-Headers', 'ETag');
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (req.method === 'OPTIONS') {
    if (!origin) throw new ApiError(403, 'ORIGIN_REQUIRED');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token, If-Match, If-None-Match, Idempotency-Key');
    res.statusCode = 204; res.end(); return true;
  }
  return false;
}
export async function checkPassword(password, admin) {
  if (!admin?.passwordHash || !admin?.salt || typeof password !== 'string' || password.length > 1024) return false;
  const actual = await scrypt(password, admin.salt, 64);
  return equal(actual.toString('hex'), admin.passwordHash);
}
export function safeString(value, max = 128) { return typeof value === 'string' && value.length > 0 && value.length <= max; }
export function assertId(value) { if (!safeString(value) || !/^[a-zA-Z0-9_-]+$/.test(value)) throw new ApiError(400, 'INVALID_ID'); return value; }

