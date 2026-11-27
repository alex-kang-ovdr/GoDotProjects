'use strict';

// Game-agnostic JoinTicket signer/verifier (HMAC-SHA256, byte-compatible with join-ticket-service.cjs)
// and trusted-proxy real client IP extraction (prevents loopback reverse-proxy IP collapsing).
const crypto = require('node:crypto');

const DEFAULT_TICKET_TTL_SEC = 60;
const MAX_CLOCK_SKEW_SEC = 5;
const MAX_USED_JTI_ENTRIES = 10000;
const LOOPBACK_IPS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

function b64urlEncode(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function b64urlDecode(str) {
  if (typeof str !== 'string' || !/^[A-Za-z0-9_-]+$/.test(str)) return null;
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  try {
    return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
  } catch {
    return null;
  }
}

function normalizeIp(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let ip = raw.trim();
  if (!ip) return '';
  if (ip.startsWith('[') && ip.includes(']')) {
    ip = ip.slice(1, ip.indexOf(']'));
  }
  if (ip.startsWith('::ffff:')) {
    const v4 = ip.slice(7);
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(v4)) return v4;
  }
  return ip;
}

function isTrustedProxyIp(ip, trustedProxies) {
  const norm = normalizeIp(ip);
  if (!norm) return false;
  if (trustedProxies === false) return false;
  if (LOOPBACK_IPS.has(norm) || LOOPBACK_IPS.has(ip)) return true;
  if (Array.isArray(trustedProxies) || trustedProxies instanceof Set) {
    for (const entry of trustedProxies) {
      if (normalizeIp(String(entry)) === norm) return true;
    }
  }
  return false;
}

/**
 * Extracts the real client IP safely behind Caddy / Cloudflare / reverse proxies.
 * Only trusts CF-Connecting-IP / X-Forwarded-For when the direct TCP peer is a trusted proxy.
 */
function resolveClientIp(req, { trustedProxies = true } = {}) {
  const socketIp = normalizeIp(req?.socket?.remoteAddress || req?.connection?.remoteAddress || '');
  if (!socketIp) return 'unknown';
  if (!isTrustedProxyIp(socketIp, trustedProxies)) {
    return socketIp;
  }
  const headers = req?.headers || {};
  const cfIp = normalizeIp(Array.isArray(headers['cf-connecting-ip']) ? headers['cf-connecting-ip'][0] : headers['cf-connecting-ip']);
  if (cfIp && !isTrustedProxyIp(cfIp, trustedProxies)) {
    return cfIp;
  }
  const rawXff = Array.isArray(headers['x-forwarded-for']) ? headers['x-forwarded-for'].join(',') : headers['x-forwarded-for'];
  if (typeof rawXff === 'string' && rawXff.trim()) {
    const hops = rawXff.split(',').map(h => normalizeIp(h)).filter(Boolean);
    // Walk right-to-left to find the first hop that is NOT a trusted proxy.
    for (let i = hops.length - 1; i >= 0; i -= 1) {
      if (!isTrustedProxyIp(hops[i], trustedProxies)) {
        return hops[i];
      }
    }
    if (hops.length > 0) return hops[0];
  }
  const realIp = normalizeIp(Array.isArray(headers['x-real-ip']) ? headers['x-real-ip'][0] : headers['x-real-ip']);
  if (realIp && !isTrustedProxyIp(realIp, trustedProxies)) {
    return realIp;
  }
  return socketIp;
}

function signRelayTicket(payload, secretBuf) {
  const body = b64urlEncode(Buffer.from(JSON.stringify(payload), 'utf8'));
  const mac = crypto.createHmac('sha256', secretBuf).update(body, 'utf8').digest();
  return `${body}.${b64urlEncode(mac)}`;
}

function verifyRelayTicketSignature(token, keyLookup) {
  if (typeof token !== 'string' || token.length < 16 || token.length > 4096) {
    return { ok: false, reason: 'ticket_malformed' };
  }
  const dot = token.indexOf('.');
  if (dot <= 0 || dot !== token.lastIndexOf('.')) {
    return { ok: false, reason: 'ticket_malformed' };
  }
  const bodyB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);
  const bodyBuf = b64urlDecode(bodyB64);
  const sigBuf = b64urlDecode(sigB64);
  if (!bodyBuf || !sigBuf || sigBuf.length !== 32) {
    return { ok: false, reason: 'ticket_malformed' };
  }
  let payload;
  try {
    payload = JSON.parse(bodyBuf.toString('utf8'));
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return { ok: false, reason: 'ticket_malformed' };
    }
  } catch {
    return { ok: false, reason: 'ticket_malformed' };
  }
  const kid = String(payload.kid || 'k1');
  const secretBuf = typeof keyLookup === 'function' ? keyLookup(kid) : keyLookup;
  if (!secretBuf) {
    return { ok: false, reason: 'unknown_kid' };
  }
  const expected = crypto.createHmac('sha256', secretBuf).update(bodyB64, 'utf8').digest();
  if (expected.length !== sigBuf.length || !crypto.timingSafeEqual(expected, sigBuf)) {
    return { ok: false, reason: 'invalid_signature' };
  }
  return { ok: true, payload };
}

function extractTicketFromRequest(req) {
  if (!req) return '';
  // 1. Sec-WebSocket-Protocol: playhub.v1, ticket.<token>
  const protoHdr = String(req.headers?.['sec-websocket-protocol'] || '');
  if (protoHdr) {
    for (const part of protoHdr.split(',')) {
      const trimmed = part.trim();
      if (trimmed.startsWith('ticket.')) {
        return trimmed.slice('ticket.'.length).trim();
      }
    }
  }
  // 2. Authorization: Bearer <token>
  const authHdr = String(req.headers?.authorization || '');
  if (authHdr.toLowerCase().startsWith('bearer ')) {
    return authHdr.slice(7).trim();
  }
  // 3. Query string ?ticket=<token> (supported for WebSocket clients unable to set custom headers)
  try {
    const parsed = new URL(req.url || '/', 'http://localhost');
    const q = parsed.searchParams.get('ticket');
    if (q) return q.trim();
  } catch {
    // ignore
  }
  return '';
}

class RelayTicketAuthority {
  constructor({ secret = null, activeKid = 'k1', keys = null, now = Date.now, defaultTtlSec = DEFAULT_TICKET_TTL_SEC } = {}) {
    this.now = now;
    this.defaultTtlSec = Math.max(5, Math.min(300, Number(defaultTtlSec) || DEFAULT_TICKET_TTL_SEC));
    this.activeKid = String(activeKid || 'k1');
    this.keys = new Map();
    if (keys instanceof Map) {
      for (const [k, v] of keys.entries()) {
        this.keys.set(String(k), Buffer.isBuffer(v) ? v : Buffer.from(String(v), 'utf8'));
      }
    } else if (keys && typeof keys === 'object') {
      for (const [k, v] of Object.entries(keys)) {
        this.keys.set(String(k), Buffer.isBuffer(v) ? v : Buffer.from(String(v), 'utf8'));
      }
    }
    if (secret) {
      this.keys.set(this.activeKid, Buffer.isBuffer(secret) ? secret : Buffer.from(String(secret), 'utf8'));
    }
    if (this.keys.size === 0) {
      this.keys.set(this.activeKid, crypto.randomBytes(32));
    }
    this.usedJti = new Map(); // jti -> expiresAtSec
  }

  rotateKey(newKid, newSecret = crypto.randomBytes(32), { retireOld = false } = {}) {
    const kid = String(newKid || `k${this.keys.size + 1}`);
    const buf = Buffer.isBuffer(newSecret) ? newSecret : Buffer.from(String(newSecret), 'utf8');
    if (retireOld) this.keys.clear();
    this.keys.set(kid, buf);
    this.activeKid = kid;
    return kid;
  }

  _pruneUsedJti(nowSec) {
    if (this.usedJti.size === 0) return;
    for (const [jti, exp] of this.usedJti.entries()) {
      if (exp <= nowSec) this.usedJti.delete(jti);
    }
    while (this.usedJti.size > MAX_USED_JTI_ENTRIES) {
      const oldest = this.usedJti.keys().next().value;
      if (oldest === undefined) break;
      this.usedJti.delete(oldest);
    }
  }

  issue({ sub, name = '', platform = 'web', gameId, runtime = 'relay-spatial-v1', roomId = '', role = 'player', releaseId = '', ttlSec = null } = {}) {
    const nowSec = Math.floor(this.now() / 1000);
    const ttl = Math.max(5, Math.min(300, Number(ttlSec || this.defaultTtlSec)));
    const exp = nowSec + ttl;
    const jti = 'jti_' + crypto.randomBytes(12).toString('hex');
    const payload = {
      v: 1,
      kid: this.activeKid,
      jti,
      sub: String(sub || 'anon').slice(0, 128),
      name: String(name || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 24),
      platform: String(platform || 'web').toLowerCase().slice(0, 16),
      gameId: String(gameId || '').trim(),
      runtime: String(runtime || 'relay-spatial-v1').trim(),
      roomId: String(roomId || '').trim(),
      role: String(role || 'player').trim(),
      ...(releaseId ? { releaseId: String(releaseId).trim() } : {}),
      iat: nowSec,
      exp,
    };
    const secretBuf = this.keys.get(this.activeKid);
    return {
      token: signRelayTicket(payload, secretBuf),
      payload,
      expiresAt: exp * 1000,
    };
  }

  verify(token, { expectedGameId = '', expectedRoomId = '', expectedRuntime = '', consume = true } = {}) {
    const check = verifyRelayTicketSignature(token, kid => this.keys.get(kid));
    if (!check.ok) return check;
    const payload = check.payload;
    const nowSec = Math.floor(this.now() / 1000);
    if (!Number.isFinite(payload.exp) || payload.exp + MAX_CLOCK_SKEW_SEC < nowSec) {
      return { ok: false, reason: 'ticket_expired' };
    }
    if (Number.isFinite(payload.iat) && payload.iat - MAX_CLOCK_SKEW_SEC > nowSec) {
      return { ok: false, reason: 'ticket_not_yet_valid' };
    }
    if (!payload.jti || typeof payload.jti !== 'string') {
      return { ok: false, reason: 'missing_jti' };
    }
    if (expectedGameId && payload.gameId && payload.gameId !== expectedGameId) {
      return { ok: false, reason: 'game_mismatch' };
    }
    if (expectedRoomId && payload.roomId && payload.roomId !== expectedRoomId) {
      return { ok: false, reason: 'room_mismatch' };
    }
    if (expectedRuntime && payload.runtime && payload.runtime !== expectedRuntime) {
      return { ok: false, reason: 'runtime_mismatch' };
    }
    this._pruneUsedJti(nowSec);
    if (consume) {
      if (this.usedJti.has(payload.jti)) {
        return { ok: false, reason: 'ticket_replayed' };
      }
      this.usedJti.set(payload.jti, payload.exp + MAX_CLOCK_SKEW_SEC);
    }
    return { ok: true, payload };
  }
}

module.exports = {
  DEFAULT_TICKET_TTL_SEC,
  b64urlEncode,
  b64urlDecode,
  normalizeIp,
  isTrustedProxyIp,
  resolveClientIp,
  signRelayTicket,
  verifyRelayTicketSignature,
  extractTicketFromRequest,
  RelayTicketAuthority,
};
