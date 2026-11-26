// PlayHub Dedicated Server JoinTicket & SessionLease Control Plane adapter (Roadmap 28/29/30).
// Reuses forge/Tools/dedicated-server/join-ticket-service.cjs (SSOT) without duplicating crypto/CAS logic.
// - Internal routes (/internal/v1/multiplayer/ds/*): guarded by verifyInternalAccess (loopback + internal secret).
// - Public routes (/api/multiplayer/ds/*): player-facing JoinTicket/Resume bound strictly to verified Hub session principal_id.
// - Admin routes (/api/admin/multiplayer/ds/*): read-only session visibility with zero signing-key exposure.
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { ApiError, json, readJson } from './security.mjs';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSION_ID_RE = /^[A-Za-z0-9:._-]{1,64}$/;
const RESERVATION_ID_RE = /^[A-Za-z0-9:._-]{1,64}$/;

function loadJoinTicketService(platformRoot) {
  const candidates = [
    platformRoot && path.resolve(platformRoot, 'forge/Tools/dedicated-server/join-ticket-service.cjs'),
    path.resolve(__dirname, '../../forge/Tools/dedicated-server/join-ticket-service.cjs'),
  ].filter(Boolean);
  for (const p of candidates) {
    try {
      return require(p);
    } catch { /* try next */ }
  }
  throw new Error('Cannot locate forge/Tools/dedicated-server/join-ticket-service.cjs');
}

function assertSessionId(raw) {
  const id = decodeURIComponent(String(raw || ''));
  if (!SESSION_ID_RE.test(id)) throw new ApiError(400, 'DS_SESSION_ID_INVALID');
  return id;
}

export function createDsControlPlane({ platformRoot, now = Date.now, audit = () => {}, rate = () => {}, requireSession, promote, verifyInternalAccess }) {
  const { JoinTicketControlPlane } = loadJoinTicketService(platformRoot);
  const cp = new JoinTicketControlPlane({ nowFn: now });

  async function internalRoute(req, res, url) {
    const p = url.pathname;
    if (!p.startsWith('/internal/v1/multiplayer/ds/')) return false;
    verifyInternalAccess(req, res);
    const sub = p.slice('/internal/v1/multiplayer/ds'.length);
    const m = req.method;

    if (m === 'POST' && sub === '/sessions') {
      const body = await readJson(req, 16384);
      const r = cp.createSession(body);
      if (r.ok) audit('ds_session_created', r.session.sessionId, { instanceId: r.session.instanceId, maxPlayers: r.session.maxPlayers, leaseEpoch: r.session.leaseEpoch });
      json(res, r.status, r);
      return true;
    }
    let match;
    if (m === 'GET' && (match = /^\/sessions\/([^/]+)\/health$/.exec(sub))) {
      const r = cp.getHealth(assertSessionId(match[1]));
      json(res, r.status, r);
      return true;
    }
    if (m === 'POST' && (match = /^\/sessions\/([^/]+)\/reserve$/.exec(sub))) {
      const sid = assertSessionId(match[1]);
      const r = cp.reserveSlot(sid, await readJson(req, 16384));
      json(res, r.status, r);
      return true;
    }
    if (m === 'DELETE' && (match = /^\/sessions\/([^/]+)\/reservations\/([^/]+)$/.exec(sub))) {
      const sid = assertSessionId(match[1]);
      const rid = decodeURIComponent(match[2]);
      if (!RESERVATION_ID_RE.test(rid)) throw new ApiError(400, 'DS_RESERVATION_ID_INVALID');
      const r = cp.cancelReservation(sid, rid);
      json(res, r.status, r);
      return true;
    }
    if (m === 'POST' && (match = /^\/sessions\/([^/]+)\/join-ticket$/.exec(sub))) {
      const r = cp.issueJoinTicket(assertSessionId(match[1]), await readJson(req, 16384), false);
      json(res, r.status, r);
      return true;
    }
    if (m === 'POST' && (match = /^\/sessions\/([^/]+)\/resume$/.exec(sub))) {
      const r = cp.issueJoinTicket(assertSessionId(match[1]), await readJson(req, 16384), true);
      json(res, r.status, r);
      return true;
    }
    if (m === 'POST' && (match = /^\/sessions\/([^/]+)\/lease\/renew$/.exec(sub))) {
      const sid = assertSessionId(match[1]);
      const r = cp.renewLease(sid, await readJson(req, 8192));
      if (r.ok) audit('ds_lease_renewed', sid, { leaseEpoch: r.leaseEpoch });
      json(res, r.status, r);
      return true;
    }
    if (m === 'POST' && (match = /^\/sessions\/([^/]+)\/keys\/rotate$/.exec(sub))) {
      const sid = assertSessionId(match[1]);
      const r = cp.rotateKey(sid, await readJson(req, 8192));
      if (r.ok) audit('ds_keys_rotated', sid, { activeKid: r.activeKid, retired: r.retired });
      json(res, r.status, r);
      return true;
    }
    if (m === 'POST' && (match = /^\/sessions\/([^/]+)\/results$/.exec(sub))) {
      const sid = assertSessionId(match[1]);
      const r = cp.commitResult(sid, await readJson(req, 16384));
      if (r.ok && !r.duplicate) audit('ds_result_committed', sid, { leaseEpoch: r.result.leaseEpoch, resultRevision: r.result.resultRevision });
      json(res, r.status, r);
      return true;
    }
    return false;
  }

  async function publicRoute(req, res, url) {
    const p = url.pathname;
    if (!p.startsWith('/api/multiplayer/ds/')) return false;
    const sub = p.slice('/api/multiplayer/ds'.length);
    const m = req.method;
    let match;

    if (m === 'GET' && (match = /^\/sessions\/([^/]+)\/health$/.exec(sub))) {
      const r = cp.getHealth(assertSessionId(match[1]));
      json(res, r.status, r);
      return true;
    }
    if (m === 'POST' && (match = /^\/sessions\/([^/]+)\/(join-ticket|resume)$/.exec(sub))) {
      const sid = assertSessionId(match[1]);
      const isResume = match[2] === 'resume';
      const s = requireSession(req, 'public');
      const principal = promote(s, req, res);
      rate(`ds-ticket:${principal.principal_id}`, 30, 60000);
      const body = await readJson(req, 8192);
      // Security boundary: never trust client-supplied userId; always bind to verified Hub principal_id.
      const r = cp.issueJoinTicket(sid, {
        ...body,
        userId: principal.principal_id,
      }, isResume);
      json(res, r.status, r);
      return true;
    }
    return false;
  }

  async function adminRoute(req, res, url) {
    if (req.method === 'GET' && url.pathname === '/api/admin/multiplayer/ds/sessions') {
      const sessions = [];
      for (const s of cp.sessions.values()) {
        sessions.push(cp.publicSession(s));
      }
      json(res, 200, { ok: true, sessions });
      return true;
    }
    return false;
  }

  return { controlPlane: cp, internalRoute, publicRoute, adminRoute };
}
