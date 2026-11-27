// Standalone Type 1 Data Plane: Game-Agnostic Spatial Interest Relay Service (relay-spatial-v1).
// Runs independently from Hub web/API to isolate blast radius and scale horizontally.
// Zero game-specific rules, physics, or event schemas: forwards N-D coordinates + opaque payloads only.
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadShared(name) {
  const repoShared = path.resolve(__dirname, '../../tools/ugc-shared', name);
  if (fs.existsSync(repoShared)) return require(repoShared);
  return require(path.resolve(__dirname, 'ugc-shared', name));
}

function tryLoadWs() {
  const candidates = [
    'ws',
    path.resolve(__dirname, '../../forge/node_modules/ws'),
  ];
  for (const cand of candidates) {
    try { return require(cand); } catch { /* next */ }
  }
  return null;
}

const {
  MAX_OUTBOUND_QUEUE,
  GenericSpatialRoom,
  flushGenericSocketQueue,
} = loadShared('generic-spatial-room.cjs');
const { GAME_ID_RE, normalizeRelayConfig } = loadShared('publish-contract.cjs');
const {
  RelayTicketAuthority,
  resolveClientIp,
  extractTicketFromRequest,
} = loadShared('relay-ticket.cjs');

const RELAY_SOCKET_PATH = '/ws/relay-spatial';
const ROOM_ID_RE = /^[a-f0-9]{12}$/;
const PARTY_CODE_RE = /^[A-Za-z0-9_-]{4,24}$/;
const DEFAULT_MAX_ROOMS = 256;
const DEFAULT_MAX_TOTAL_SOCKETS = 2048;
const DEFAULT_MAX_SOCKETS_PER_IP = 32;
const DEFAULT_MAX_MESSAGES_PER_SEC = 80;
const DEFAULT_FLUSH_INTERVAL_MS = 50;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 10000;
const DEFAULT_MAX_MISSED_PONGS = 2;
const MAX_FRAME_BYTES = 16 * 1024;

function writeUpgradeError(socket, status, text) {
  try {
    socket.end(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\n\r\n`);
  } catch {
    try { socket.destroy(); } catch {}
  }
}

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function encodeWsFrame(opcode, payloadBuf) {
  const len = payloadBuf.length;
  let hdr;
  if (len < 126) {
    hdr = Buffer.allocUnsafe(2);
    hdr[0] = 0x80 | opcode;
    hdr[1] = len;
  } else if (len < 65536) {
    hdr = Buffer.allocUnsafe(4);
    hdr[0] = 0x80 | opcode;
    hdr[1] = 126;
    hdr.writeUInt16BE(len, 2);
  } else {
    hdr = Buffer.allocUnsafe(10);
    hdr[0] = 0x80 | opcode;
    hdr[1] = 127;
    hdr.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([hdr, payloadBuf]);
}

// Zero-dependency RFC 6455 fallback adapter (used when `ws` is not installed in slim Hub Docker images).
class NativeRelayWsSocket {
  constructor(socket, maxPayload) {
    this.socket = socket;
    this.maxPayload = maxPayload;
    this.readyState = 1;
    this._chunks = [];
    this._bufferedLen = 0;
    this._listeners = { message: [], close: [], pong: [] };
    socket.setNoDelay(true);
    socket.on('data', chunk => this._onData(chunk));
    socket.on('close', () => this._emitClose());
    socket.on('error', () => this.terminate());
  }
  get bufferedAmount() { return this.socket.writableLength || 0; }
  on(ev, fn) { if (this._listeners[ev]) this._listeners[ev].push(fn); }
  send(text) {
    if (this.readyState !== 1 || this.socket.destroyed) return;
    try { this.socket.write(encodeWsFrame(0x1, Buffer.from(String(text), 'utf8'))); } catch { this.terminate(); }
  }
  ping() {
    if (this.readyState !== 1 || this.socket.destroyed) return;
    try { this.socket.write(encodeWsFrame(0x9, Buffer.alloc(0))); } catch { this.terminate(); }
  }
  close(code = 1000, reason = '') {
    if (this.readyState !== 1) return;
    this.readyState = 3;
    try {
      const rbuf = Buffer.from(String(reason || ''), 'utf8').subarray(0, 120);
      const body = Buffer.allocUnsafe(2 + rbuf.length);
      body.writeUInt16BE(code, 0);
      rbuf.copy(body, 2);
      this.socket.end(encodeWsFrame(0x8, body));
    } catch { this.socket.destroy(); }
    this._emitClose();
  }
  terminate() {
    this.readyState = 3;
    try { this.socket.destroy(); } catch {}
    this._emitClose();
  }
  _emitClose() {
    if (this._closedEmitted) return;
    this._closedEmitted = true;
    this.readyState = 3;
    for (const fn of this._listeners.close) fn();
  }
  _onData(chunk) {
    if (this.readyState !== 1) return;
    this._bufferedLen += chunk.length;
    if (this._bufferedLen > this.maxPayload * 4) { this.close(1009, 'Frame too large'); return; }
    this._chunks.push(chunk);
    let buf = this._chunks.length === 1 ? this._chunks[0] : Buffer.concat(this._chunks);
    while (this.readyState === 1 && buf.length >= 2) {
      const b0 = buf[0];
      const b1 = buf[1];
      const fin = (b0 & 0x80) !== 0;
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let plen = b1 & 0x7f;
      let off = 2;
      if (plen === 126) { if (buf.length < 4) break; plen = buf.readUInt16BE(2); off = 4; }
      else if (plen === 127) { if (buf.length < 10) break; plen = Number(buf.readBigUInt64BE(2)); off = 10; }
      if (!masked || plen > this.maxPayload) { this.close(1009, 'Invalid frame'); return; }
      if (buf.length < off + 4 + plen) break;
      const mask = buf.subarray(off, off + 4);
      const data = Buffer.from(buf.subarray(off + 4, off + 4 + plen));
      for (let i = 0; i < plen; i += 1) data[i] ^= mask[i & 3];
      buf = buf.subarray(off + 4 + plen);
      if (opcode === 0x8) { this.close(1000, 'Normal closure'); return; }
      if (opcode === 0x9) { try { this.socket.write(encodeWsFrame(0xA, data)); } catch {} continue; }
      if (opcode === 0xA) { for (const fn of this._listeners.pong) fn(); continue; }
      if (fin && opcode === 0x1) { for (const fn of this._listeners.message) fn(data); }
    }
    this._chunks = buf.length ? [buf] : [];
    this._bufferedLen = buf.length;
  }
}

export function createSpatialRelayService({
  now = Date.now,
  allowedOrigins = null,
  trustedProxies = true,
  ticketAuthority = null,
  ticketSecret = process.env.PLAYHUB_RELAY_TICKET_SECRET || '',
  requireTicket = true,
  resolveGameRelayConfig = null,
  flushIntervalMs = DEFAULT_FLUSH_INTERVAL_MS,
  heartbeatIntervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS,
  maxMissedPongs = DEFAULT_MAX_MISSED_PONGS,
  maxMessagesPerSec = DEFAULT_MAX_MESSAGES_PER_SEC,
  maxRooms = DEFAULT_MAX_ROOMS,
  maxTotalSockets = DEFAULT_MAX_TOTAL_SOCKETS,
  maxSocketsPerIp = DEFAULT_MAX_SOCKETS_PER_IP,
  socketPath = RELAY_SOCKET_PATH,
  forceNativeWs = false,
} = {}) {
  const wsLib = forceNativeWs ? null : tryLoadWs();
  const WebSocketServer = wsLib?.WebSocketServer || null;

  const authority = ticketAuthority || new RelayTicketAuthority({
    secret: ticketSecret || crypto.randomBytes(32),
    now,
  });

  const allowedOriginSet = Array.isArray(allowedOrigins) && allowedOrigins.length
    ? new Set(allowedOrigins.map(o => String(o).trim().replace(/\/$/, '')))
    : null;

  const rooms = new Map();        // roomId -> GenericSpatialRoom
  const partyRooms = new Map();   // `${gameId}:${PARTY_CODE}` -> roomId
  const socketsByRoom = new Map();// roomId -> Set<WebSocket>
  const allSockets = new Set();
  const socketsByIp = new Map();  // realIp -> count

  const wss = WebSocketServer
    ? new WebSocketServer({
        noServer: true,
        maxPayload: MAX_FRAME_BYTES,
        handleProtocols: protocols => {
          if (protocols.has('playhub.v1')) return 'playhub.v1';
          return false;
        },
      })
    : null;

  function resolveConfig(gameId, overrides = {}) {
    const fromResolver = typeof resolveGameRelayConfig === 'function' ? (resolveGameRelayConfig(gameId) || {}) : {};
    return normalizeRelayConfig({ ...fromResolver, ...overrides });
  }

  function findOrCreateChannel(gameId, configOverrides = {}) {
    const cfg = resolveConfig(gameId, configOverrides);
    for (const room of rooms.values()) {
      if (room.gameId === gameId && !room.partyCode && room.players.size < room.config.maxPlayersPerChannel) {
        return room;
      }
    }
    if (rooms.size >= maxRooms) {
      throw new Error('RELAY_CAPACITY_FULL');
    }
    const id = crypto.randomBytes(6).toString('hex');
    const room = new GenericSpatialRoom(id, { gameId }, cfg, now);
    rooms.set(id, room);
    socketsByRoom.set(id, new Set());
    return room;
  }

  function findOrCreatePartyChannel(gameId, rawPartyCode, configOverrides = {}) {
    const partyCode = String(rawPartyCode || '').trim().toUpperCase();
    const key = `${gameId}:${partyCode}`;
    const existingId = partyRooms.get(key);
    if (existingId && rooms.has(existingId)) {
      return rooms.get(existingId);
    }
    if (rooms.size >= maxRooms) {
      throw new Error('RELAY_CAPACITY_FULL');
    }
    const id = crypto.randomBytes(6).toString('hex');
    const seedHash = crypto.createHash('sha256').update(key).digest().readUInt32BE(0);
    const defaultSeed = 10000 + (seedHash % 900000);
    const cfg = resolveConfig(gameId, configOverrides);
    const room = new GenericSpatialRoom(id, { gameId, partyCode, defaultSeed }, cfg, now);
    rooms.set(id, room);
    partyRooms.set(key, id);
    socketsByRoom.set(id, new Set());
    return room;
  }

  function allocateRoom(gameId, requestedRoom = '', configOverrides = {}) {
    if (!GAME_ID_RE.test(gameId)) throw new Error('INVALID_GAME_ID');
    const reqRoom = String(requestedRoom || '').trim();
    if (!reqRoom) return findOrCreateChannel(gameId, configOverrides);
    if (ROOM_ID_RE.test(reqRoom)) {
      const existing = rooms.get(reqRoom);
      if (!existing || existing.gameId !== gameId) throw new Error('ROOM_NOT_FOUND');
      return existing;
    }
    if (PARTY_CODE_RE.test(reqRoom)) {
      return findOrCreatePartyChannel(gameId, reqRoom, configOverrides);
    }
    throw new Error('INVALID_ROOM_ID');
  }

  const flushTimer = setInterval(() => {
    for (const room of rooms.values()) {
      room.flushPresence();
      const sockets = socketsByRoom.get(room.id);
      if (!sockets) continue;
      for (const ws of sockets) {
        flushGenericSocketQueue(ws, s => s.readyState === 1);
      }
    }
  }, flushIntervalMs);
  flushTimer.unref();

  const heartbeatTimer = setInterval(() => {
    for (const ws of allSockets) {
      if ((ws._missedPongs || 0) >= maxMissedPongs) {
        ws.terminate();
        continue;
      }
      ws._missedPongs = (ws._missedPongs || 0) + 1;
      try { ws.ping(); } catch { ws.terminate(); }
    }
  }, heartbeatIntervalMs);
  heartbeatTimer.unref();

  function attachSocket(ws, req, clientIp, verifiedTicket) {
    ws._relayBatch = [];
    ws._relayRemoved = [];
    ws._relayPresence = null;
    ws._missedPongs = 0;

    allSockets.add(ws);
    socketsByIp.set(clientIp, (socketsByIp.get(clientIp) || 0) + 1);

    let rateAt = now();
    let msgCount = 0;
    let rateViolations = 0;
    let activeRoom = null;
    let activePeerId = null;
    let authPayload = verifiedTicket || null;

    const joinTimeout = setTimeout(() => {
      if (!activePeerId) ws.close(1008, 'Join required');
    }, 6000);
    joinTimeout.unref();

    ws.on('pong', () => { ws._missedPongs = 0; });

    function completeJoin(joinMsg) {
      if (activeRoom) throw new Error('ALREADY_JOINED');
      if (requireTicket && !authPayload) {
        const inlineTicket = typeof joinMsg.ticket === 'string' ? joinMsg.ticket.trim() : '';
        if (!inlineTicket) throw new Error('TICKET_REQUIRED');
        const check = authority.verify(inlineTicket, { expectedRuntime: 'relay-spatial-v1', consume: true });
        if (!check.ok) throw new Error(`TICKET_INVALID:${check.reason}`);
        authPayload = check.payload;
      }

      const gameId = authPayload?.gameId || String(joinMsg.gameId || '').trim();
      const requestedRoom = authPayload?.roomId || String(joinMsg.roomId || '').trim();
      const verifiedName = authPayload?.name || String(joinMsg.name || '').trim();
      const verifiedPlatform = authPayload?.platform || String(joinMsg.platform || 'web').trim();
      const room = allocateRoom(gameId, requestedRoom, joinMsg.config || {});

      const { peer } = room.join({
        sub: authPayload?.sub || '',
        name: verifiedName,
        platform: verifiedPlatform,
        pos: joinMsg.p,
        vel: joinMsg.v,
        moving: joinMsg.m,
        opaqueState: joinMsg.d !== undefined ? joinMsg.d : null,
        sendImmediate: payload => {
          if (ws.readyState === 1) ws.send(JSON.stringify(payload));
        },
        queueEvent: encodedTuple => {
          if (ws._relayBatch.length >= MAX_OUTBOUND_QUEUE) ws._relayBatch.shift();
          ws._relayBatch.push(encodedTuple);
        },
        queueRemoved: shortId => {
          if (ws._relayRemoved.length < MAX_OUTBOUND_QUEUE) ws._relayRemoved.push(shortId);
        },
        setPresence: (online, nearby) => {
          ws._relayPresence = [online, nearby];
        },
      });
      socketsByRoom.get(room.id).add(ws);
      activeRoom = room;
      activePeerId = peer.id;
      clearTimeout(joinTimeout);
    }

    // If ticket already carried gameId + roomId on upgrade, client can still send initial `join` with initial position/state.
    ws.on('message', rawBuf => {
      try {
        const currentNow = now();
        if (currentNow - rateAt > 1000) {
          rateAt = currentNow;
          msgCount = 0;
        }
        if (++msgCount > maxMessagesPerSec) {
          rateViolations += 1;
          if (rateViolations >= 3) {
            ws.close(1008, 'Rate limit exceeded');
            return;
          }
          if (ws.readyState === 1) ws.send(JSON.stringify({ t: 'error', error: 'RATE_LIMITED' }));
          return;
        }

        let msg;
        try {
          msg = JSON.parse(rawBuf.toString('utf8'));
          if (!msg || typeof msg !== 'object' || Array.isArray(msg)) throw new Error();
        } catch {
          if (ws.readyState === 1) ws.send(JSON.stringify({ t: 'error', error: 'INVALID_JSON' }));
          return;
        }

        const msgType = msg.t || msg.type;
        if (msgType === 'join' || msgType === 'auth') {
          completeJoin(msg);
          return;
        }
        if (!activeRoom || !activePeerId) {
          throw new Error('JOIN_REQUIRED');
        }
        if (msgType === 'pub' || msg.p !== undefined || msg.d !== undefined) {
          activeRoom.publish(activePeerId, msg);
          return;
        }
        throw new Error('UNSUPPORTED_MESSAGE');
      } catch (err) {
        if (ws.readyState === 1) {
          ws.send(JSON.stringify({ t: 'error', error: err.message || 'RELAY_ERROR' }));
        }
      }
    });

    ws.on('close', () => {
      clearTimeout(joinTimeout);
      if (allSockets.delete(ws)) {
        const rem = (socketsByIp.get(clientIp) || 1) - 1;
        if (rem <= 0) socketsByIp.delete(clientIp);
        else socketsByIp.set(clientIp, rem);
      }
      ws._relayBatch.length = 0;
      ws._relayRemoved.length = 0;
      if (!activeRoom) return;
      socketsByRoom.get(activeRoom.id)?.delete(ws);
      if (activePeerId) activeRoom.leave(activePeerId);
      if (activeRoom.players.size === 0 && (socketsByRoom.get(activeRoom.id)?.size || 0) === 0) {
        rooms.delete(activeRoom.id);
        socketsByRoom.delete(activeRoom.id);
        if (activeRoom.partyCode) {
          partyRooms.delete(`${activeRoom.gameId}:${activeRoom.partyCode}`);
        }
      }
      activeRoom = null;
      activePeerId = null;
    });
  }

  function handleUpgrade(req, socket, head) {
    let pathname = '';
    try { pathname = new URL(req.url || '/', 'http://localhost').pathname; } catch { return false; }
    if (pathname !== socketPath) return false;

    const rawOrigin = req.headers.origin;
    if (rawOrigin !== undefined && rawOrigin !== '') {
      const normalized = String(rawOrigin).trim().replace(/\/$/, '');
      if (allowedOriginSet && !allowedOriginSet.has(normalized)) {
        writeUpgradeError(socket, 403, 'Forbidden');
        return true;
      }
    }

    const clientIp = resolveClientIp(req, { trustedProxies });
    const ipCount = socketsByIp.get(clientIp) || 0;
    if (allSockets.size >= maxTotalSockets || ipCount >= maxSocketsPerIp) {
      writeUpgradeError(socket, 503, 'Service Unavailable');
      return true;
    }

    // Verify upgrade-level JoinTicket if present (or enforce immediately if requireTicket && no inline fallback)
    const upgradeTicket = extractTicketFromRequest(req);
    let verifiedTicket = null;
    if (upgradeTicket) {
      const check = authority.verify(upgradeTicket, { expectedRuntime: 'relay-spatial-v1', consume: true });
      if (!check.ok) {
        writeUpgradeError(socket, 401, 'Unauthorized');
        return true;
      }
      verifiedTicket = check.payload;
    }

    if (wss) {
      wss.handleUpgrade(req, socket, head, ws => {
        attachSocket(ws, req, clientIp, verifiedTicket);
      });
    } else {
      const key = req.headers['sec-websocket-key'];
      if (!key || String(req.headers.upgrade || '').toLowerCase() !== 'websocket') {
        writeUpgradeError(socket, 400, 'Bad Request');
        return true;
      }
      const accept = crypto.createHash('sha1').update(String(key).trim() + WS_GUID).digest('base64');
      const protos = String(req.headers['sec-websocket-protocol'] || '').split(',').map(s => s.trim());
      const protoHdr = protos.includes('playhub.v1') ? 'Sec-WebSocket-Protocol: playhub.v1\r\n' : '';
      socket.write(
        'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        protoHdr +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
      );
      const nativeWs = new NativeRelayWsSocket(socket, MAX_FRAME_BYTES);
      attachSocket(nativeWs, req, clientIp, verifiedTicket);
      if (head && head.length) nativeWs._onData(head);
    }
    return true;
  }

  function handleHttp(req, res, url) {
    if (url.pathname === '/healthz' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({
        ok: true,
        service: 'spatial-relay-v1',
        rooms: rooms.size,
        sockets: allSockets.size,
        requireTicket,
      }));
      return true;
    }
    const match = url.pathname.match(/^\/api\/relay\/([a-z][a-z0-9]*(?:-[a-z0-9]+)*)\/rooms$/);
    if (match && req.method === 'GET') {
      const gameId = match[1];
      const list = [...rooms.values()]
        .filter(r => r.gameId === gameId)
        .map(r => r.metadata({ publicView: true }));
      const totalOnline = list.reduce((acc, r) => acc + r.online, 0);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ gameId, wsPath: socketPath, runtime: 'relay-spatial-v1', totalOnline, rooms: list }));
      return true;
    }
    return false;
  }

  function createStandaloneServer() {
    const server = http.createServer((req, res) => {
      let url;
      try { url = new URL(req.url || '/', 'http://localhost'); } catch {
        res.writeHead(400).end();
        return;
      }
      if (!handleHttp(req, res, url)) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: 'NOT_FOUND' }));
      }
    });
    server.on('upgrade', (req, socket, head) => {
      if (!handleUpgrade(req, socket, head)) {
        writeUpgradeError(socket, 404, 'Not Found');
      }
    });
    server.on('close', close);
    return server;
  }

  function close() {
    clearInterval(flushTimer);
    clearInterval(heartbeatTimer);
    for (const ws of allSockets) {
      try { ws.terminate(); } catch {}
    }
    allSockets.clear();
    socketsByIp.clear();
    rooms.clear();
    partyRooms.clear();
    socketsByRoom.clear();
    try { wss?.close(); } catch {}
  }

  return {
    socketPath,
    authority,
    rooms,
    allocateRoom,
    handleUpgrade,
    handleHttp,
    createStandaloneServer,
    close,
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const host = process.env.HOST || '127.0.0.1';
  const port = Number(process.env.RELAY_PORT || process.env.PORT || 8095);
  const service = createSpatialRelayService({
    requireTicket: process.env.PLAYHUB_RELAY_ALLOW_ANON !== '1',
    allowedOrigins: process.env.PLAYHUB_ALLOWED_ORIGINS
      ? process.env.PLAYHUB_ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
      : null,
  });
  const server = service.createStandaloneServer();
  server.listen(port, host, () => {
    console.log(`[spatial-relay-v1] listening on http://${host}:${port}${service.socketPath}`);
  });
  process.on('SIGINT', () => { service.close(); server.closeAllConnections?.(); server.close(() => process.exit(0)); });
  process.on('SIGTERM', () => { service.close(); server.closeAllConnections?.(); server.close(() => process.exit(0)); });
}
