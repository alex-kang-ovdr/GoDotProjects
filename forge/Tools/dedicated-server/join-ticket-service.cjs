#!/usr/bin/env node
'use strict';
/**
 * PlayHub Control Plane — JoinTicket 발급·세션 Lease·슬롯 CAS 예약·키 로테이션 서비스 (로드맵 28·29·30).
 *
 * - Godot 데디케이티드 서버(data plane)와 분리된 HTTP control plane으로 동작한다.
 * - 서명 비밀키는 control plane과 전용 서버 브로커 파일(keyring.json)에만 두며,
 *   HTTP 응답·클라이언트 상태·일반 로그에 비밀키/원문 토큰을 절대 노출하지 않는다.
 * - 티켓 형식은 NetJoinTicketAuthority(join_ticket.gd)와 100% 바이트 호환된다:
 *     base64url(payload JSON) + "." + base64url(HMAC-SHA256(key[kid], payload_b64))
 *
 * 엔드포인트 (plans/29 §4, plans/28 §3):
 *   POST   /sessions                         세션 + SessionLease 생성, 키링 파일(선택) 기록
 *   GET    /sessions/:id/health              공개 세션 상태 조회(비밀값 미포함)
 *   POST   /sessions/:id/reserve             원자적 슬롯 예약(CAS + idempotencyKey)
 *   DELETE /sessions/:id/reservations/:rid   예약 취소
 *   POST   /sessions/:id/join-ticket         단기 single-use JoinTicket 발급(기본 60초 TTL)
 *   POST   /sessions/:id/resume              재접속용 신규 single-use JoinTicket 발급(새 nonce)
 *   POST   /sessions/:id/lease/renew         fencing token(leaseEpoch) 검증 및 lease 연장
 *   POST   /sessions/:id/keys/rotate         서명 키 로테이션(신규 kid 활성화, 선택적 구 키 폐기)
 *   POST   /sessions/:id/results             idempotent 경기 결과 확정(stale leaseEpoch 거절)
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const VERSION = 1;
const DEFAULT_TICKET_TTL_SEC = 60;
const DEFAULT_LEASE_TTL_SEC = 30;
const DEFAULT_RESERVATION_TTL_SEC = 60;
const MAX_BODY_BYTES = 16 * 1024;

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function signTicket(payload, secretBuf) {
  const body = b64url(Buffer.from(JSON.stringify(payload), 'utf8'));
  const mac = crypto.createHmac('sha256', secretBuf).update(body, 'utf8').digest();
  return `${body}.${b64url(mac)}`;
}

class JoinTicketControlPlane {
  constructor(opts = {}) {
    this.nowFn = opts.nowFn || (() => Date.now());
    this.sessions = new Map(); // sessionId -> SessionRecord
  }

  _nowSec() {
    return Math.floor(this.nowFn() / 1000);
  }

  _writeKeyringFile(session) {
    if (!session.keyringFile) return;
    fs.mkdirSync(path.dirname(session.keyringFile), { recursive: true });
    const keysObj = {};
    for (const [kid, buf] of session.keys.entries()) {
      keysObj[kid] = b64url(buf);
    }
    const tmp = `${session.keyringFile}.tmp.${process.pid}.${Date.now()}`;
    fs.writeFileSync(tmp, JSON.stringify({ activeKid: session.activeKid, keys: keysObj }), { mode: 0o600 });
    fs.renameSync(tmp, session.keyringFile);
  }

  createSession(spec = {}) {
    const nowSec = this._nowSec();
    const sessionId = String(spec.sessionId || crypto.randomBytes(8).toString('hex'));
    if (this.sessions.has(sessionId)) {
      return { ok: false, status: 409, reason: 'session_exists' };
    }
    const maxPlayers = Math.max(1, Math.min(256, Number(spec.maxPlayers || 4)));
    const leaseTtlSec = Math.max(5, Number(spec.leaseTtlSec || DEFAULT_LEASE_TTL_SEC));
    const ticketTtlSec = Math.max(5, Math.min(300, Number(spec.ticketTtlSec || DEFAULT_TICKET_TTL_SEC)));
    const kid = 'k1';
    const keys = new Map([[kid, crypto.randomBytes(32)]]);
    const session = {
      sessionId,
      instanceId: String(spec.instanceId || `ds-${crypto.randomBytes(4).toString('hex')}`),
      projectId: String(spec.projectId || 'forge-default'),
      buildId: String(spec.buildId || 'dev-4.7.2'),
      protocolHash: String(spec.protocolHash || ''),
      maxPlayers,
      leaseEpoch: Number(spec.leaseEpoch || 1),
      leaseExpiresAt: nowSec + leaseTtlSec,
      leaseTtlSec,
      ticketTtlSec,
      state: 'ready', // ready | allocated | draining | stopped
      activeKid: kid,
      keySeq: 1,
      keys,
      keyringFile: spec.keyringFile ? path.resolve(spec.keyringFile) : '',
      reservations: new Map(), // reservationId -> {reservationId, userId, slot, expiresAt, idempotencyKey, issued}
      slotOwner: new Map(),    // slot -> reservationId
      userSlot: new Map(),     // userId -> slot
      idempotency: new Map(),  // idempotencyKey -> reservationId
      committedResults: new Map(), // resultRevision -> resultRecord
    };
    this._writeKeyringFile(session);
    this.sessions.set(sessionId, session);
    return { ok: true, status: 201, session: this.publicSession(session) };
  }

  publicSession(s) {
    return {
      sessionId: s.sessionId,
      instanceId: s.instanceId,
      projectId: s.projectId,
      buildId: s.buildId,
      protocolHash: s.protocolHash,
      maxPlayers: s.maxPlayers,
      leaseEpoch: s.leaseEpoch,
      leaseExpiresAt: s.leaseExpiresAt,
      state: s.state,
      activeKid: s.activeKid,
      activeKeyCount: s.keys.size,
      reservedSlots: s.slotOwner.size,
    };
  }

  _pruneExpiredReservations(s) {
    const nowSec = this._nowSec();
    for (const [rid, r] of s.reservations.entries()) {
      if (!r.issued && r.expiresAt <= nowSec) {
        s.reservations.delete(rid);
        if (s.slotOwner.get(r.slot) === rid) s.slotOwner.delete(r.slot);
        if (s.userSlot.get(r.userId) === r.slot) s.userSlot.delete(r.userId);
        if (r.idempotencyKey && s.idempotency.get(r.idempotencyKey) === rid) s.idempotency.delete(r.idempotencyKey);
      }
    }
  }

  reserveSlot(sessionId, req = {}) {
    const s = this.sessions.get(sessionId);
    if (!s) return { ok: false, status: 404, reason: 'session_not_found' };
    this._pruneExpiredReservations(s);
    if (s.state === 'draining' || s.state === 'stopped') {
      return { ok: false, status: 409, reason: 'session_draining' };
    }
    const nowSec = this._nowSec();
    if (s.leaseExpiresAt <= nowSec) {
      return { ok: false, status: 409, reason: 'lease_expired' };
    }
    const userId = String(req.userId || '').trim();
    if (!userId || userId.length > 64) {
      return { ok: false, status: 400, reason: 'invalid_user_id' };
    }
    if (req.projectId && String(req.projectId) !== s.projectId) {
      return { ok: false, status: 409, reason: 'project_mismatch' };
    }
    if (req.buildId && String(req.buildId) !== s.buildId) {
      return { ok: false, status: 409, reason: 'build_mismatch' };
    }
    if (s.protocolHash && req.protocolHash && String(req.protocolHash) !== s.protocolHash) {
      return { ok: false, status: 409, reason: 'protocol_mismatch' };
    }
    const idemKey = req.idempotencyKey ? `${userId}:${String(req.idempotencyKey)}` : '';
    if (idemKey && s.idempotency.has(idemKey)) {
      const existing = s.reservations.get(s.idempotency.get(idemKey));
      if (existing) {
        return { ok: true, status: 200, idempotent: true, reservation: { ...existing } };
      }
    }
    if (s.userSlot.has(userId)) {
      return { ok: false, status: 409, reason: 'user_already_reserved' };
    }
    let slot = req.slot !== undefined ? Number(req.slot) : -1;
    if (slot >= 0) {
      if (!Number.isInteger(slot) || slot >= s.maxPlayers) {
        return { ok: false, status: 400, reason: 'slot_out_of_range' };
      }
      if (s.slotOwner.has(slot)) {
        return { ok: false, status: 409, reason: 'slot_taken' };
      }
    } else {
      for (let i = 0; i < s.maxPlayers; i += 1) {
        if (!s.slotOwner.has(i)) { slot = i; break; }
      }
      if (slot < 0) return { ok: false, status: 409, reason: 'session_full' };
    }
    const reservationId = `res-${crypto.randomBytes(6).toString('hex')}`;
    const ttl = Math.max(5, Number(req.ttlSec || DEFAULT_RESERVATION_TTL_SEC));
    const rec = {
      reservationId,
      userId,
      slot,
      expiresAt: nowSec + ttl,
      idempotencyKey: idemKey,
      issued: false,
    };
    s.reservations.set(reservationId, rec);
    s.slotOwner.set(slot, reservationId);
    s.userSlot.set(userId, slot);
    if (idemKey) s.idempotency.set(idemKey, reservationId);
    s.state = 'allocated';
    return { ok: true, status: 201, reservation: { ...rec } };
  }

  cancelReservation(sessionId, reservationId) {
    const s = this.sessions.get(sessionId);
    if (!s) return { ok: false, status: 404, reason: 'session_not_found' };
    const r = s.reservations.get(reservationId);
    if (!r) return { ok: false, status: 404, reason: 'reservation_not_found' };
    s.reservations.delete(reservationId);
    if (s.slotOwner.get(r.slot) === reservationId) s.slotOwner.delete(r.slot);
    if (s.userSlot.get(r.userId) === r.slot) s.userSlot.delete(r.userId);
    if (r.idempotencyKey && s.idempotency.get(r.idempotencyKey) === reservationId) s.idempotency.delete(r.idempotencyKey);
    return { ok: true, status: 200, cancelled: reservationId };
  }

  issueJoinTicket(sessionId, req = {}, isResume = false) {
    const s = this.sessions.get(sessionId);
    if (!s) return { ok: false, status: 404, reason: 'session_not_found' };
    this._pruneExpiredReservations(s);
    if (s.state === 'draining' || s.state === 'stopped') {
      return { ok: false, status: 409, reason: 'session_draining' };
    }
    const nowSec = this._nowSec();
    if (s.leaseExpiresAt <= nowSec) {
      return { ok: false, status: 409, reason: 'lease_expired' };
    }
    const userId = String(req.userId || '').trim();
    if (!userId) return { ok: false, status: 400, reason: 'invalid_user_id' };
    if (req.projectId && String(req.projectId) !== s.projectId) return { ok: false, status: 409, reason: 'project_mismatch' };
    if (req.buildId && String(req.buildId) !== s.buildId) return { ok: false, status: 409, reason: 'build_mismatch' };
    if (s.protocolHash && req.protocolHash && String(req.protocolHash) !== s.protocolHash) {
      return { ok: false, status: 409, reason: 'protocol_mismatch' };
    }
    if (!s.userSlot.has(userId)) {
      return { ok: false, status: 404, reason: 'reservation_required' };
    }
    const slot = s.userSlot.get(userId);
    const rid = s.slotOwner.get(slot);
    const res = s.reservations.get(rid);
    if (!res || res.userId !== userId) {
      return { ok: false, status: 409, reason: 'slot_owner_mismatch' };
    }
    if (req.slot !== undefined && Number(req.slot) !== slot) {
      return { ok: false, status: 403, reason: 'slot_forbidden' };
    }
    res.issued = true;
    const ttl = Math.max(5, Math.min(300, Number(req.ttlSec || s.ticketTtlSec)));
    const expiresAtUnix = nowSec + ttl;
    const payload = {
      version: VERSION,
      kid: s.activeKid,
      sessionId: s.sessionId,
      instanceId: s.instanceId,
      leaseEpoch: s.leaseEpoch,
      userId,
      slot,
      resume: Boolean(isResume),
      expiresAt: new Date(expiresAtUnix * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
      expiresAtUnix,
      ttlSec: ttl,
      singleUse: true,
      nonce: b64url(crypto.randomBytes(16)),
    };
    const keyBuf = s.keys.get(s.activeKid);
    const ticket = signTicket(payload, keyBuf);
    return {
      ok: true,
      status: 200,
      ticket,
      claims: {
        kid: payload.kid,
        sessionId: payload.sessionId,
        instanceId: payload.instanceId,
        leaseEpoch: payload.leaseEpoch,
        userId: payload.userId,
        slot: payload.slot,
        resume: payload.resume,
        expiresAt: payload.expiresAt,
        ttlSec: payload.ttlSec,
      },
    };
  }

  renewLease(sessionId, req = {}) {
    const s = this.sessions.get(sessionId);
    if (!s) return { ok: false, status: 404, reason: 'session_not_found' };
    const reqEpoch = Number(req.leaseEpoch);
    if (!Number.isInteger(reqEpoch) || reqEpoch !== s.leaseEpoch) {
      return { ok: false, status: 409, reason: 'stale_lease_epoch', currentEpoch: s.leaseEpoch };
    }
    if (req.bumpEpoch) {
      s.leaseEpoch += 1;
    }
    s.leaseExpiresAt = this._nowSec() + Math.max(5, Number(req.ttlSec || s.leaseTtlSec));
    return { ok: true, status: 200, leaseEpoch: s.leaseEpoch, leaseExpiresAt: s.leaseExpiresAt };
  }

  rotateKey(sessionId, req = {}) {
    const s = this.sessions.get(sessionId);
    if (!s) return { ok: false, status: 404, reason: 'session_not_found' };
    s.keySeq += 1;
    const newKid = `k${s.keySeq}`;
    s.keys.set(newKid, crypto.randomBytes(32));
    s.activeKid = newKid;
    const retired = [];
    if (Array.isArray(req.retireKids)) {
      for (const oldKid of req.retireKids) {
        const k = String(oldKid);
        if (k !== newKid && s.keys.delete(k)) retired.push(k);
      }
    } else if (req.retirePrevious) {
      for (const k of [...s.keys.keys()]) {
        if (k !== newKid) { s.keys.delete(k); retired.push(k); }
      }
    }
    this._writeKeyringFile(s);
    return { ok: true, status: 200, activeKid: s.activeKid, activeKeyCount: s.keys.size, retired };
  }

  commitResult(sessionId, req = {}) {
    const s = this.sessions.get(sessionId);
    if (!s) return { ok: false, status: 404, reason: 'session_not_found' };
    const leaseEpoch = Number(req.leaseEpoch);
    if (leaseEpoch !== s.leaseEpoch) {
      return { ok: false, status: 409, reason: 'stale_lease_epoch', currentEpoch: s.leaseEpoch };
    }
    const rev = Number(req.resultRevision);
    if (!Number.isInteger(rev) || rev < 1) {
      return { ok: false, status: 400, reason: 'invalid_result_revision' };
    }
    if (s.committedResults.has(rev)) {
      return { ok: true, status: 200, duplicate: true, result: s.committedResults.get(rev) };
    }
    const record = {
      sessionId: s.sessionId,
      leaseEpoch,
      resultRevision: rev,
      resultHash: String(req.resultHash || ''),
      committedAt: this._nowSec(),
    };
    s.committedResults.set(rev, record);
    return { ok: true, status: 201, duplicate: false, result: record };
  }

  getHealth(sessionId) {
    const s = this.sessions.get(sessionId);
    if (!s) return { ok: false, status: 404, reason: 'session_not_found' };
    this._pruneExpiredReservations(s);
    return { ok: true, status: 200, session: this.publicSession(s) };
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (c) => {
      total += c.length;
      if (total > MAX_BODY_BYTES) {
        reject(new Error('body_too_large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('invalid_json'));
      }
    });
    req.on('error', reject);
  });
}

function createControlPlaneServer(cp = new JoinTicketControlPlane()) {
  const server = http.createServer(async (req, res) => {
    const send = (status, body) => {
      const jsonStr = JSON.stringify(body);
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
      res.end(jsonStr);
    };
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      const p = url.pathname;
      const m = req.method;

      if (m === 'POST' && p === '/sessions') {
        const body = await readJsonBody(req);
        const r = cp.createSession(body);
        return send(r.status, r);
      }
      let match;
      if (m === 'GET' && (match = /^\/sessions\/([^/]+)\/health$/.exec(p))) {
        const r = cp.getHealth(decodeURIComponent(match[1]));
        return send(r.status, r);
      }
      if (m === 'POST' && (match = /^\/sessions\/([^/]+)\/reserve$/.exec(p))) {
        const r = cp.reserveSlot(decodeURIComponent(match[1]), await readJsonBody(req));
        return send(r.status, r);
      }
      if (m === 'DELETE' && (match = /^\/sessions\/([^/]+)\/reservations\/([^/]+)$/.exec(p))) {
        const r = cp.cancelReservation(decodeURIComponent(match[1]), decodeURIComponent(match[2]));
        return send(r.status, r);
      }
      if (m === 'POST' && (match = /^\/sessions\/([^/]+)\/join-ticket$/.exec(p))) {
        const r = cp.issueJoinTicket(decodeURIComponent(match[1]), await readJsonBody(req), false);
        return send(r.status, r);
      }
      if (m === 'POST' && (match = /^\/sessions\/([^/]+)\/resume$/.exec(p))) {
        const r = cp.issueJoinTicket(decodeURIComponent(match[1]), await readJsonBody(req), true);
        return send(r.status, r);
      }
      if (m === 'POST' && (match = /^\/sessions\/([^/]+)\/lease\/renew$/.exec(p))) {
        const r = cp.renewLease(decodeURIComponent(match[1]), await readJsonBody(req));
        return send(r.status, r);
      }
      if (m === 'POST' && (match = /^\/sessions\/([^/]+)\/keys\/rotate$/.exec(p))) {
        const r = cp.rotateKey(decodeURIComponent(match[1]), await readJsonBody(req));
        return send(r.status, r);
      }
      if (m === 'POST' && (match = /^\/sessions\/([^/]+)\/results$/.exec(p))) {
        const r = cp.commitResult(decodeURIComponent(match[1]), await readJsonBody(req));
        return send(r.status, r);
      }
      return send(404, { ok: false, reason: 'not_found' });
    } catch (err) {
      return send(err.message === 'body_too_large' ? 413 : 400, { ok: false, reason: err.message });
    }
  });
  return { server, controlPlane: cp };
}

module.exports = { JoinTicketControlPlane, createControlPlaneServer, b64url };
