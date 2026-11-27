// Zero-dependency RFC 6455 WebSocket cross-play MMO relay for published PlayHub UGC games.
// Supports Web (WASM), Android (AOS native Godot .pck), iOS, and Desktop clients in the same
// auto-channeled or M3 Social Party Co-Entry rooms. Room engine & codec live in tools/ugc-shared/mmo-room-core.cjs (SSOT).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { json } from './security.mjs';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadShared(name) {
  const repoShared = path.resolve(__dirname, '../../tools/ugc-shared', name);
  if (fs.existsSync(repoShared)) return require(repoShared);
  return require(path.resolve(__dirname, 'ugc-shared', name));
}

const {
  DEFAULT_FLUSH_INTERVAL_MS,
  DEFAULT_HEARTBEAT_INTERVAL_MS,
  DEFAULT_MAX_MISSED_PONGS,
  MAX_PLAYERS,
  MAX_OUTBOUND_QUEUE,
  parseCompactClientEvent,
  flushSocketQueue,
  SpatialMmoRoom,
} = loadShared('mmo-room-core.cjs');
const {
  GenericSpatialRoom,
  flushGenericSocketQueue,
} = loadShared('generic-spatial-room.cjs');
const { GAME_ID_RE, normalizeRelayConfig } = loadShared('publish-contract.cjs');
const {
  RelayTicketAuthority,
  resolveClientIp,
  extractTicketFromRequest,
} = loadShared('relay-ticket.cjs');

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const SOCKET_PATH = '/ws/ugc-mmo';
const GENERIC_RELAY_PATH = '/ws/relay-spatial';
const ROOM_ID_RE = /^[a-f0-9]{12}$/;
const PARTY_ROOM_CODE_RE = /^[A-Za-z0-9_-]{4,24}$/;
const MAX_PAYLOAD = 64 * 1024;
const MAX_FRAG_CHUNKS = 32;
const MAX_ROOMS = 128;
const DEFAULT_MAX_TOTAL_SOCKETS = 512;
const DEFAULT_MAX_SOCKETS_PER_IP = 32;

function encodeWsFrame(opcode, payloadBuf) {
  const len = payloadBuf.length;
  let header;
  if (len < 126) {
    header = Buffer.allocUnsafe(2);
    header[0] = 0x80 | opcode;
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.allocUnsafe(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.allocUnsafe(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payloadBuf]);
}

class SimpleWsConnection {
  constructor(socket) {
    this.socket = socket;
    this.open = true;
    this.buffer = Buffer.alloc(0);
    this.fragOpcode = 0;
    this.fragChunks = [];
    this.fragBytes = 0;
    this.missedPongs = 0;
    this.compact = false;
    this.supportsBatch = false;
    this.outboundQueue = [];
    this.pendingPresenceRaw = null;
    this.compactEvents = [];
    this.compactRemoved = [];
    this.compactPresence = null;
    this._relayBatch = [];
    this._relayRemoved = [];
    this._relayPresence = null;
    this._onMessage = null;
    this._onClose = null;

    socket.setNoDelay(true);
    socket.on('data', chunk => this._onData(chunk));
    socket.on('close', () => this._emitClose());
    socket.on('error', () => this.terminate());
  }

  get bufferedAmount() {
    return this.socket.writableLength || 0;
  }

  onMessage(fn) { this._onMessage = fn; }
  onClose(fn) { this._onClose = fn; }

  send(text) {
    if (!this.open || this.socket.destroyed) return;
    try {
      this.socket.write(encodeWsFrame(0x1, Buffer.from(String(text), 'utf8')));
    } catch {
      this.terminate();
    }
  }

  ping() {
    if (!this.open || this.socket.destroyed) return;
    try {
      this.socket.write(encodeWsFrame(0x9, Buffer.alloc(0)));
    } catch {
      this.terminate();
    }
  }

  pong(payload = Buffer.alloc(0)) {
    if (!this.open || this.socket.destroyed) return;
    try {
      this.socket.write(encodeWsFrame(0xA, payload));
    } catch {
      this.terminate();
    }
  }

  close(code = 1000, reason = '') {
    if (!this.open) return;
    this.open = false;
    try {
      const reasonBuf = Buffer.from(String(reason || ''), 'utf8').subarray(0, 120);
      const body = Buffer.allocUnsafe(2 + reasonBuf.length);
      body.writeUInt16BE(code, 0);
      reasonBuf.copy(body, 2);
      this.socket.end(encodeWsFrame(0x8, body));
    } catch {
      this.socket.destroy();
    }
    this._emitClose();
  }

  terminate() {
    this.open = false;
    try { this.socket.destroy(); } catch {}
    this._emitClose();
  }

  _emitClose() {
    this.open = false;
    if (this._onClose) {
      const cb = this._onClose;
      this._onClose = null;
      cb();
    }
  }

  _onData(chunk) {
    if (!this.open) return;
    if (this.buffer.length + chunk.length > MAX_PAYLOAD * 4) {
      this.close(1009, 'Frame too large');
      return;
    }
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;

    while (this.open && this.buffer.length >= 2) {
      const b0 = this.buffer[0];
      const b1 = this.buffer[1];
      const fin = (b0 & 0x80) !== 0;
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let payloadLen = b1 & 0x7f;
      let offset = 2;

      if (payloadLen === 126) {
        if (this.buffer.length < 4) return;
        payloadLen = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (payloadLen === 127) {
        if (this.buffer.length < 10) return;
        const bigLen = this.buffer.readBigUInt64BE(2);
        if (bigLen > BigInt(MAX_PAYLOAD)) {
          this.close(1009, 'Payload too large');
          return;
        }
        payloadLen = Number(bigLen);
        offset = 10;
      }

      const isControl = (opcode & 0x08) !== 0;
      if (![0x0, 0x1, 0x2, 0x8, 0x9, 0xA].includes(opcode)) {
        this.close(1002, 'Unsupported opcode');
        return;
      }
      if (isControl && (!fin || payloadLen > 125)) {
        this.close(1002, 'Invalid control frame');
        return;
      }
      if (payloadLen > MAX_PAYLOAD) {
        this.close(1009, 'Payload too large');
        return;
      }
      if (!masked) {
        this.close(1002, 'Client frames must be masked');
        return;
      }
      if (this.buffer.length < offset + 4 + payloadLen) return;

      const maskKey = this.buffer.subarray(offset, offset + 4);
      const rawPayload = Buffer.from(this.buffer.subarray(offset + 4, offset + 4 + payloadLen));
      for (let i = 0; i < payloadLen; i += 1) {
        rawPayload[i] ^= maskKey[i & 3];
      }
      this.buffer = this.buffer.subarray(offset + 4 + payloadLen);

      if (opcode === 0x8) {
        this.close(1000, 'Normal closure');
        return;
      }
      if (opcode === 0x9) {
        this.pong(rawPayload);
        continue;
      }
      if (opcode === 0xA) {
        this.missedPongs = 0;
        continue;
      }

      if (opcode === 0x1 || opcode === 0x2) {
        if (this.fragOpcode) {
          this.close(1002, 'Unexpected data frame');
          return;
        }
        if (fin) {
          if (opcode === 0x1 && this._onMessage) {
            this._onMessage(rawPayload.toString('utf8'));
          }
        } else {
          this.fragOpcode = opcode;
          this.fragChunks = [rawPayload];
          this.fragBytes = rawPayload.length;
        }
      } else if (opcode === 0x0) {
        if (!this.fragOpcode) {
          this.close(1002, 'Unexpected continuation frame');
          return;
        }
        if (this.fragChunks.length >= MAX_FRAG_CHUNKS) {
          this.close(1009, 'Too many fragmented frames');
          return;
        }
        this.fragBytes += rawPayload.length;
        if (this.fragBytes > MAX_PAYLOAD) {
          this.close(1009, 'Fragmented payload too large');
          return;
        }
        this.fragChunks.push(rawPayload);
        if (fin) {
          const full = Buffer.concat(this.fragChunks);
          const origOpcode = this.fragOpcode;
          this.fragOpcode = 0;
          this.fragChunks = [];
          this.fragBytes = 0;
          if (origOpcode === 0x1 && this._onMessage) {
            this._onMessage(full.toString('utf8'));
          }
        }
      }
    }
  }
}

class HubMmoRoom extends SpatialMmoRoom {
  constructor(id, gameId, options = {}, now = Date.now) {
    super(
      id,
      { gameId, partyCode: options.partyCode || null, defaultSeed: options.defaultSeed ?? 42071 },
      { ...options, deferPresence: true, enableLogs: false, includePlatform: true },
      now
    );
  }

  metadata({ publicView = false } = {}) {
    const platforms = {};
    const players = [];
    const nowMs = this.now();
    for (const p of this.players.values()) {
      platforms[p.platform] = (platforms[p.platform] || 0) + 1;
      if (!publicView || !this.partyCode) {
        players.push({
          id: p.id,
          shortId: p.shortId,
          name: p.name,
          platform: p.platform,
          runDistance: Math.round(this.estimateDistance(p, nowMs)),
          phase: p.phase,
          score: p.score,
          nearbyCount: p.nearby.size,
        });
      }
    }
    if (publicView && this.partyCode) {
      return {
        gameId: this.gameId,
        isParty: true,
        phase: this.phase,
        onlineCount: this.players.size,
        platforms,
      };
    }
    return {
      roomId: this.id,
      gameId: this.gameId,
      ...(!publicView && this.partyCode ? { partyCode: this.partyCode } : {}),
      phase: this.phase,
      courseSeed: this.courseSeed,
      proximityRadius: this.proximityRadius,
      maxNearbyGhosts: this.maxNearbyGhosts,
      onlineCount: this.players.size,
      platforms,
      players,
      stats: { ...this.stats },
    };
  }
}

export function buildMultiplayerDescriptor(game, socketPath = SOCKET_PATH, { relayPublicUrl = '' } = {}) {
  if (!game) return null;
  const dp = game.deployProfile && typeof game.deployProfile === 'object' ? game.deployProfile : {};
  const mode = game.deployMode || dp.deployMode || 'singleplay';
  const runtime = dp.serverRuntime || (mode === 'mmo' ? 'node-wss-v1' : 'none');

  if (runtime === 'relay-spatial-v1') {
    return {
      transport: 'ws',
      runtime: 'relay-spatial-v1',
      protocol: 'playhub.relay.v1',
      wsPath: GENERIC_RELAY_PATH,
      matchPath: '/api/multiplayer/match',
      ...(relayPublicUrl ? { wsUrl: relayPublicUrl } : {}),
      gameId: game.id,
      relayConfig: normalizeRelayConfig(dp.relayConfig),
    };
  }
  if (mode === 'mo' && (runtime === 'node-wss-v1' || runtime === 'godot-linux-wss-v1')) {
    return {
      transport: 'ws',
      runtime,
      matchPath: '/api/multiplayer/match',
      gameId: game.id,
    };
  }
  if (mode !== 'mmo') return null;
  return {
    transport: 'ws',
    runtime,
    wsPath: socketPath,
    matchPath: '/api/multiplayer/match',
    gameId: game.id,
  };
}

export function createUgcMultiplayer({
  now = Date.now,
  allowedOrigins = null,
  trustedProxies = true,
  ticketAuthority = null,
  ticketSecret = process.env.PLAYHUB_RELAY_TICKET_SECRET || '',
  requireTicket = process.env.PLAYHUB_REQUIRE_WS_TICKET === '1',
  relayPublicUrl = process.env.PLAYHUB_RELAY_PUBLIC_URL || '',
  flushIntervalMs = DEFAULT_FLUSH_INTERVAL_MS,
  heartbeatIntervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS,
  maxMissedPongs = DEFAULT_MAX_MISSED_PONGS,
  maxMessagesPerSec = 80,
  maxTotalSockets = DEFAULT_MAX_TOTAL_SOCKETS,
  maxSocketsPerIp = DEFAULT_MAX_SOCKETS_PER_IP,
} = {}) {
  const authority = ticketAuthority || new RelayTicketAuthority({
    secret: ticketSecret || crypto.randomBytes(32),
    now,
  });
  const rooms = new Map();
  const partyRooms = new Map(); // `${gameId}:${PARTY_CODE}` -> roomId
  const socketsByRoom = new Map();
  const genericRooms = new Map();
  const genericPartyRooms = new Map();
  const genericSocketsByRoom = new Map();
  const allSockets = new Set();
  const socketsByIp = new Map();
  const allowedOriginSet = Array.isArray(allowedOrigins) && allowedOrigins.length
    ? new Set(allowedOrigins.map(o => String(o).trim().replace(/\/$/, '')))
    : null;

  function findOrCreateGenericChannel(gameId, rawConfig = {}) {
    const cfg = normalizeRelayConfig(rawConfig);
    for (const room of genericRooms.values()) {
      if (room.gameId === gameId && !room.partyCode && room.players.size < room.config.maxPlayersPerChannel) {
        return room;
      }
    }
    if (genericRooms.size >= MAX_ROOMS) {
      throw new Error('활성 멀티플레이 채널이 가득 찼습니다.');
    }
    const id = crypto.randomBytes(6).toString('hex');
    const room = new GenericSpatialRoom(id, { gameId }, cfg, now);
    genericRooms.set(id, room);
    genericSocketsByRoom.set(id, new Set());
    return room;
  }

  function findOrCreateGenericPartyChannel(gameId, rawPartyCode, rawConfig = {}) {
    const partyCode = String(rawPartyCode || '').trim().toUpperCase();
    const key = `${gameId}:${partyCode}`;
    const existingId = genericPartyRooms.get(key);
    if (existingId && genericRooms.has(existingId)) return genericRooms.get(existingId);
    if (genericRooms.size >= MAX_ROOMS) throw new Error('활성 멀티플레이 채널이 가득 찼습니다.');
    const id = crypto.randomBytes(6).toString('hex');
    const seedHash = crypto.createHash('sha256').update(key).digest().readUInt32BE(0);
    const defaultSeed = 10000 + (seedHash % 900000);
    const room = new GenericSpatialRoom(id, { gameId, partyCode, defaultSeed }, normalizeRelayConfig(rawConfig), now);
    genericRooms.set(id, room);
    genericPartyRooms.set(key, id);
    genericSocketsByRoom.set(id, new Set());
    return room;
  }

  function findOrCreateChannel(gameId, options = {}) {
    for (const room of rooms.values()) {
      if (room.gameId === gameId && !room.partyCode && room.players.size < MAX_PLAYERS) {
        return room;
      }
    }
    if (rooms.size >= MAX_ROOMS) {
      throw new Error('활성 멀티플레이 채널이 가득 찼습니다.');
    }
    const id = crypto.randomBytes(6).toString('hex');
    const room = new HubMmoRoom(id, gameId, options, now);
    rooms.set(id, room);
    socketsByRoom.set(id, new Set());
    return room;
  }

  function findOrCreatePartyChannel(gameId, rawPartyCode, options = {}) {
    const partyCode = String(rawPartyCode || '').trim().toUpperCase();
    const key = `${gameId}:${partyCode}`;
    const existingId = partyRooms.get(key);
    if (existingId && rooms.has(existingId)) {
      return rooms.get(existingId);
    }
    if (rooms.size >= MAX_ROOMS) {
      throw new Error('활성 멀티플레이 채널이 가득 찼습니다.');
    }
    const id = crypto.randomBytes(6).toString('hex');
    const seedHash = crypto.createHash('sha256').update(key).digest().readUInt32BE(0);
    const defaultSeed = 10000 + (seedHash % 900000);
    const room = new HubMmoRoom(id, gameId, { ...options, partyCode, defaultSeed }, now);
    rooms.set(id, room);
    partyRooms.set(key, id);
    socketsByRoom.set(id, new Set());
    return room;
  }

  const flushTimer = setInterval(() => {
    for (const room of rooms.values()) {
      room.flushPresence();
      const sockets = socketsByRoom.get(room.id);
      if (!sockets) continue;
      for (const ws of sockets) flushSocketQueue(ws);
    }
    for (const room of genericRooms.values()) {
      room.flushPresence();
      const sockets = genericSocketsByRoom.get(room.id);
      if (!sockets) continue;
      for (const ws of sockets) flushGenericSocketQueue(ws, s => Boolean(s && s.open));
    }
  }, flushIntervalMs);
  flushTimer.unref();

  const heartbeatTimer = setInterval(() => {
    for (const ws of allSockets) {
      if (ws.missedPongs >= maxMissedPongs) {
        ws.terminate();
        continue;
      }
      ws.missedPongs += 1;
      ws.ping();
    }
  }, heartbeatIntervalMs);
  heartbeatTimer.unref();

  function handleUpgrade(req, socket, head) {
    let pathname = '';
    try { pathname = new URL(req.url || '/', 'http://localhost').pathname; } catch { return false; }
    const isGenericRelay = pathname === GENERIC_RELAY_PATH;
    if (pathname !== SOCKET_PATH && !isGenericRelay) return false;

    const rawOrigin = req.headers.origin;
    if (rawOrigin !== undefined && rawOrigin !== '') {
      const normalizedOrigin = String(rawOrigin).trim().replace(/\/$/, '');
      if (allowedOriginSet && !allowedOriginSet.has(normalizedOrigin)) {
        socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
        return true;
      }
    }

    const key = req.headers['sec-websocket-key'];
    const upgradeHdr = String(req.headers.upgrade || '').toLowerCase();
    if (!key || upgradeHdr !== 'websocket') {
      socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
      return true;
    }

    const clientIp = resolveClientIp(req, { trustedProxies });
    const ipCount = socketsByIp.get(clientIp) || 0;
    if (allSockets.size >= maxTotalSockets || ipCount >= maxSocketsPerIp) {
      socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');
      return true;
    }

    const upgradeTicket = extractTicketFromRequest(req);
    let verifiedTicket = null;
    if (upgradeTicket) {
      const check = authority.verify(upgradeTicket, { consume: true });
      if (!check.ok) {
        socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
        return true;
      }
      verifiedTicket = check.payload;
    }

    const accept = crypto.createHash('sha1').update(String(key).trim() + WS_GUID).digest('base64');
    const reqProtos = String(req.headers['sec-websocket-protocol'] || '').split(',').map(s => s.trim());
    const protoLine = reqProtos.includes('playhub.v1') ? 'Sec-WebSocket-Protocol: playhub.v1\r\n' : '';
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      protoLine +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
    );

    const ws = new SimpleWsConnection(socket);
    allSockets.add(ws);
    socketsByIp.set(clientIp, ipCount + 1);
    let rateAt = now();
    let msgCount = 0;
    let rateViolations = 0;
    let activeRoom = null;
    let activePlayerId = null;
    let authPayload = verifiedTicket;

    const joinTimeout = setTimeout(() => {
      if (!activePlayerId) ws.close(1008, 'Join required');
    }, 8000);
    joinTimeout.unref();

    if (isGenericRelay) {
      ws.onMessage(rawText => {
        try {
          const currentNow = now();
          if (currentNow - rateAt > 1000) { rateAt = currentNow; msgCount = 0; }
          if (++msgCount > maxMessagesPerSec) {
            rateViolations += 1;
            if (rateViolations >= 3) { ws.close(1008, 'Rate limit exceeded'); return; }
            ws.send(JSON.stringify({ t: 'error', error: 'RATE_LIMITED' }));
            return;
          }
          let msg;
          try {
            msg = JSON.parse(rawText);
            if (!msg || typeof msg !== 'object' || Array.isArray(msg)) throw new Error();
          } catch {
            ws.send(JSON.stringify({ t: 'error', error: 'INVALID_JSON' }));
            return;
          }
          const mType = msg.t || msg.type;
          if (mType === 'join' || mType === 'auth') {
            if (activeRoom) throw new Error('ALREADY_JOINED');
            if (requireTicket && !authPayload) {
              const inlineTicket = typeof msg.ticket === 'string' ? msg.ticket.trim() : '';
              if (!inlineTicket) throw new Error('TICKET_REQUIRED');
              const check = authority.verify(inlineTicket, { expectedRuntime: 'relay-spatial-v1', consume: true });
              if (!check.ok) throw new Error(`TICKET_INVALID:${check.reason}`);
              authPayload = check.payload;
            }
            const gameId = authPayload?.gameId || String(msg.gameId || '').trim();
            const requestedRoom = authPayload?.roomId || String(msg.roomId || '').trim();
            if (!GAME_ID_RE.test(gameId)) throw new Error('INVALID_GAME_ID');
            let room;
            if (!requestedRoom) {
              room = findOrCreateGenericChannel(gameId, msg.config || {});
            } else if (ROOM_ID_RE.test(requestedRoom)) {
              room = genericRooms.get(requestedRoom);
              if (!room || room.gameId !== gameId) throw new Error('ROOM_NOT_FOUND');
            } else if (PARTY_ROOM_CODE_RE.test(requestedRoom)) {
              room = findOrCreateGenericPartyChannel(gameId, requestedRoom, msg.config || {});
            } else {
              throw new Error('INVALID_ROOM_ID');
            }
            const joined = room.join({
              sub: authPayload?.sub || '',
              name: authPayload?.name || msg.name || '',
              platform: authPayload?.platform || msg.platform || 'web',
              pos: msg.p,
              vel: msg.v,
              moving: msg.m,
              opaqueState: msg.d !== undefined ? msg.d : null,
              sendImmediate: payload => ws.send(JSON.stringify(payload)),
              queueEvent: encodedTuple => {
                if (ws._relayBatch.length >= MAX_OUTBOUND_QUEUE) ws._relayBatch.shift();
                ws._relayBatch.push(encodedTuple);
              },
              queueRemoved: shortId => {
                if (ws._relayRemoved.length < MAX_OUTBOUND_QUEUE) ws._relayRemoved.push(shortId);
              },
              setPresence: (online, nearby) => { ws._relayPresence = [online, nearby]; },
            });
            genericSocketsByRoom.get(room.id).add(ws);
            activeRoom = room;
            activePlayerId = joined.peer.id;
            clearTimeout(joinTimeout);
            return;
          }
          if (!activeRoom || !activePlayerId) throw new Error('JOIN_REQUIRED');
          if (mType === 'pub' || msg.p !== undefined || msg.d !== undefined) {
            activeRoom.publish(activePlayerId, msg);
            return;
          }
          throw new Error('UNSUPPORTED_MESSAGE');
        } catch (err) {
          ws.send(JSON.stringify({ t: 'error', error: err.message || 'RELAY_ERROR' }));
        }
      });
      ws.onClose(() => {
        clearTimeout(joinTimeout);
        if (allSockets.delete(ws)) {
          const remaining = (socketsByIp.get(clientIp) || 1) - 1;
          if (remaining <= 0) socketsByIp.delete(clientIp);
          else socketsByIp.set(clientIp, remaining);
        }
        ws._relayBatch.length = 0;
        ws._relayRemoved.length = 0;
        if (!activeRoom) return;
        genericSocketsByRoom.get(activeRoom.id)?.delete(ws);
        if (activePlayerId) activeRoom.leave(activePlayerId);
        if (activeRoom.players.size === 0 && (genericSocketsByRoom.get(activeRoom.id)?.size || 0) === 0) {
          genericRooms.delete(activeRoom.id);
          genericSocketsByRoom.delete(activeRoom.id);
          if (activeRoom.partyCode) genericPartyRooms.delete(`${activeRoom.gameId}:${activeRoom.partyCode}`);
        }
        activeRoom = null;
        activePlayerId = null;
      });
      if (head && head.length) ws._onData(head);
      return true;
    }

    ws.onMessage(rawText => {
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
          ws.send(JSON.stringify({ type: 'error', error: '요청이 너무 빠릅니다.' }));
          return;
        }

        let msg;
        try {
          msg = JSON.parse(rawText);
          if (!msg || typeof msg !== 'object' || Array.isArray(msg)) throw new Error();
        } catch {
          ws.send(JSON.stringify({ type: 'error', error: '올바른 JSON 메시지가 아닙니다.' }));
          return;
        }

        if (msg.type === 'join') {
          if (activeRoom) throw new Error('이미 멀티플레이 채널에 참가 중입니다.');
          if (requireTicket && !authPayload) {
            const inlineTicket = typeof msg.ticket === 'string' ? msg.ticket.trim() : '';
            if (!inlineTicket) throw new Error('인증 티켓이 필요합니다.');
            const check = authority.verify(inlineTicket, { consume: true });
            if (!check.ok) throw new Error(`티켓 검증 실패: ${check.reason}`);
            authPayload = check.payload;
          }
          const gameId = authPayload?.gameId || String(msg.gameId || 'tappy-chicken-mmo').trim();
          const requestedRoom = authPayload?.roomId || (typeof msg.roomId === 'string' ? msg.roomId.trim() : '');
          let room = null;
          if (requestedRoom) {
            if (ROOM_ID_RE.test(requestedRoom)) {
              if (!GAME_ID_RE.test(gameId)) throw new Error('잘못된 게임 ID입니다.');
              room = rooms.get(requestedRoom);
              if (!room || room.gameId !== gameId) throw new Error('해당 멀티플레이 채널을 찾을 수 없습니다.');
            } else if (PARTY_ROOM_CODE_RE.test(requestedRoom)) {
              if (!GAME_ID_RE.test(gameId)) throw new Error('잘못된 게임 ID입니다.');
              room = findOrCreatePartyChannel(gameId, requestedRoom, {
                courseSeed: msg.courseSeed,
                proximityRadius: msg.proximityRadius,
                maxNearbyGhosts: msg.maxNearbyGhosts,
              });
            } else {
              throw new Error('잘못된 방 ID입니다.');
            }
          } else {
            if (!GAME_ID_RE.test(gameId)) throw new Error('잘못된 게임 ID입니다.');
            room = findOrCreateChannel(gameId, {
              courseSeed: msg.courseSeed,
              proximityRadius: msg.proximityRadius,
              maxNearbyGhosts: msg.maxNearbyGhosts,
            });
          }

          ws.compact = Boolean(msg.compact);
          ws.supportsBatch = Boolean(msg.supportsBatch);
          const joined = room.join(authPayload?.name || msg.name, {
            platform: authPayload?.platform || msg.platform,
            compact: ws.compact,
            speed: msg.speed,
            runDistance: msg.runDistance,
            phase: msg.phase,
            sendImmediate: payload => ws.send(JSON.stringify(payload)),
            sendRaw: encoded => {
              if (ws.outboundQueue.length >= MAX_OUTBOUND_QUEUE) ws.outboundQueue.shift();
              ws.outboundQueue.push(encoded);
            },
            setPresenceRaw: encoded => { ws.pendingPresenceRaw = encoded; },
            sendCompactEvent: encodedTuple => {
              if (ws.compactEvents.length >= MAX_OUTBOUND_QUEUE) ws.compactEvents.shift();
              ws.compactEvents.push(encodedTuple);
            },
            sendCompactRemoved: shortId => {
              if (ws.compactRemoved.length < MAX_OUTBOUND_QUEUE) ws.compactRemoved.push(shortId);
            },
            setCompactPresence: (onlineCount, nearbyCount) => {
              ws.compactPresence = [onlineCount, nearbyCount];
            },
          });
          socketsByRoom.get(room.id).add(ws);
          activeRoom = room;
          activePlayerId = joined.player.id;
          clearTimeout(joinTimeout);
          return;
        }

        if (!activeRoom || !activePlayerId) throw new Error('먼저 멀티플레이 채널에 참가해야 합니다.');

        if (Array.isArray(msg.e)) {
          activeRoom.handleEvent(activePlayerId, parseCompactClientEvent(msg.e));
          return;
        }
        if (msg.type === 'rpc' && msg.method === 'server_player_event') {
          activeRoom.handleEvent(activePlayerId, msg.params);
          return;
        }
        throw new Error('지원하지 않는 요청입니다.');
      } catch (error) {
        ws.send(JSON.stringify({ type: 'error', error: error.message || '처리 오류' }));
      }
    });

    ws.onClose(() => {
      clearTimeout(joinTimeout);
      if (allSockets.delete(ws)) {
        const remaining = (socketsByIp.get(clientIp) || 1) - 1;
        if (remaining <= 0) socketsByIp.delete(clientIp);
        else socketsByIp.set(clientIp, remaining);
      }
      ws.outboundQueue.length = 0;
      ws.compactEvents.length = 0;
      ws.compactRemoved.length = 0;
      if (!activeRoom) return;
      socketsByRoom.get(activeRoom.id)?.delete(ws);
      if (activePlayerId) activeRoom.leave(activePlayerId);
      if (activeRoom.players.size === 0 && (socketsByRoom.get(activeRoom.id)?.size || 0) === 0) {
        rooms.delete(activeRoom.id);
        socketsByRoom.delete(activeRoom.id);
        if (activeRoom.partyCode) {
          partyRooms.delete(`${activeRoom.gameId}:${activeRoom.partyCode}`);
        }
      }
      activeRoom = null;
      activePlayerId = null;
    });

    if (head && head.length) ws._onData(head);
    return true;
  }

  function publicRoute(req, res, url) {
    const match = url.pathname.match(/^\/api\/ugc-multiplayer\/([a-z][a-z0-9]*(?:-[a-z0-9]+)*)\/rooms$/);
    if (match && req.method === 'GET') {
      const gameId = match[1];
      const list = [...rooms.values()].filter(r => r.gameId === gameId).map(r => r.metadata({ publicView: true }));
      const totalOnline = list.reduce((acc, r) => acc + r.onlineCount, 0);
      json(res, 200, {
        gameId,
        wsPath: SOCKET_PATH,
        totalOnline,
        rooms: list,
      });
      return true;
    }
    const relayMatch = url.pathname.match(/^\/api\/relay\/([a-z][a-z0-9]*(?:-[a-z0-9]+)*)\/rooms$/);
    if (relayMatch && req.method === 'GET') {
      const gameId = relayMatch[1];
      const list = [...genericRooms.values()].filter(r => r.gameId === gameId).map(r => r.metadata({ publicView: true }));
      const totalOnline = list.reduce((acc, r) => acc + r.online, 0);
      json(res, 200, {
        gameId,
        wsPath: GENERIC_RELAY_PATH,
        runtime: 'relay-spatial-v1',
        totalOnline,
        rooms: list,
      });
      return true;
    }
    return false;
  }

  function issueMatchTicket({ sub, name = '', platform = 'web', game, partyCode = '', roomId = '', ttlSec = 60 } = {}) {
    const descriptor = buildMultiplayerDescriptor(game, SOCKET_PATH, { relayPublicUrl });
    if (!descriptor) {
      throw new Error('GAME_NOT_MULTIPLAYER');
    }
    const targetRoom = String(roomId || partyCode || '').trim();
    const issued = authority.issue({
      sub,
      name,
      platform,
      gameId: game.id,
      runtime: descriptor.runtime,
      roomId: targetRoom,
      releaseId: game.buildId || '',
      ttlSec,
    });
    return {
      gameId: game.id,
      runtime: descriptor.runtime,
      protocol: descriptor.protocol || null,
      wsPath: descriptor.wsPath || null,
      ...(descriptor.wsUrl ? { wsUrl: descriptor.wsUrl } : {}),
      roomId: targetRoom,
      ...(descriptor.relayConfig ? { relayConfig: descriptor.relayConfig } : {}),
      joinTicket: issued.token,
      expiresAt: issued.expiresAt,
    };
  }

  function close() {
    clearInterval(flushTimer);
    clearInterval(heartbeatTimer);
    for (const ws of allSockets) ws.terminate();
    allSockets.clear();
    socketsByIp.clear();
    rooms.clear();
    partyRooms.clear();
    socketsByRoom.clear();
    genericRooms.clear();
    genericPartyRooms.clear();
    genericSocketsByRoom.clear();
  }

  return {
    socketPath: SOCKET_PATH,
    genericRelayPath: GENERIC_RELAY_PATH,
    authority,
    rooms,
    genericRooms,
    descriptorForGame: game => buildMultiplayerDescriptor(game, SOCKET_PATH, { relayPublicUrl }),
    issueMatchTicket,
    handleUpgrade,
    publicRoute,
    close,
  };
}
