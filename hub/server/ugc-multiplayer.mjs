// Zero-dependency RFC 6455 WebSocket cross-play MMO relay for published PlayHub UGC games.
// Supports Web (WASM), Android (AOS native Godot .pck), and Desktop clients in the same auto-channeled rooms.
import crypto from 'node:crypto';
import { json } from './security.mjs';

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const SOCKET_PATH = '/ws/ugc-mmo';
const GAME_ID_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const ROOM_ID_RE = /^[a-f0-9]{12}$/;
const MAX_PAYLOAD = 64 * 1024;
const MAX_PLAYERS = 64;
const MAX_ROOMS = 128;
const DEFAULT_PROXIMITY_RADIUS = 520;
const DEFAULT_LEAVE_HYSTERESIS = 60;
const DEFAULT_MAX_NEARBY_GHOSTS = 12;
const DEFAULT_PLAYER_SPEED = 170;
const DEFAULT_FLUSH_INTERVAL_MS = 50;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 10000;
const DEFAULT_MAX_MISSED_PONGS = 2;
const MAX_OUTBOUND_QUEUE = 256;

const VALID_EVENTS = new Set(['join', 'flap', 'phase', 'sync', 'leave']);
const VALID_PHASES = new Set(['menu', 'ready', 'playing', 'paused', 'crashing', 'over']);
const VALID_PLATFORMS = new Set(['web', 'android', 'ios', 'desktop']);
const EVENT_TO_CODE = { join: 0, flap: 1, phase: 2, sync: 3, leave: 4 };
const CODE_TO_EVENT = ['join', 'flap', 'phase', 'sync', 'leave'];
const PHASE_TO_CODE = { menu: 0, ready: 1, playing: 2, paused: 3, crashing: 4, over: 5 };
const CODE_TO_PHASE = ['menu', 'ready', 'playing', 'paused', 'crashing', 'over'];

function clamp(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function cleanName(raw, fallback) {
  const text = String(raw || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().replace(/\s+/g, ' ').slice(0, 24);
  return text || fallback;
}

function cleanPlatform(raw) {
  const p = String(raw || '').trim().toLowerCase();
  return VALID_PLATFORMS.has(p) ? p : 'web';
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

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
    this.outboundQueue = [];
    this.pendingPresenceRaw = null;
    this.compactEvents = [];
    this.compactRemoved = [];
    this.compactPresence = null;
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
      this.socket.write(encodeWsFrame(0xA, payload.subarray(0, 125)));
    } catch {}
  }

  close(code = 1000, reason = '') {
    if (!this.open) return;
    this.open = false;
    try {
      const reasonBuf = Buffer.from(String(reason).slice(0, 120), 'utf8');
      const payload = Buffer.allocUnsafe(2 + reasonBuf.length);
      payload.writeUInt16BE(code, 0);
      reasonBuf.copy(payload, 2);
      this.socket.end(encodeWsFrame(0x8, payload));
    } catch {
      this.terminate();
    }
  }

  terminate() {
    this.open = false;
    try { this.socket.destroy(); } catch {}
  }

  _emitClose() {
    const wasOpen = this.open;
    this.open = false;
    if (wasOpen || this._onClose) {
      const fn = this._onClose;
      this._onClose = null;
      if (fn) fn();
    }
  }

  _onData(chunk) {
    if (!this.open) return;
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
    if (this.buffer.length > MAX_PAYLOAD * 2 + 64) {
      this.close(1009, 'Message too big');
      return;
    }

    while (this.buffer.length >= 2) {
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
        const big = this.buffer.readBigUInt64BE(2);
        if (big > BigInt(MAX_PAYLOAD)) {
          this.close(1009, 'Message too big');
          return;
        }
        payloadLen = Number(big);
        offset = 10;
      }

      if (payloadLen > MAX_PAYLOAD) {
        this.close(1009, 'Message too big');
        return;
      }

      const maskLen = masked ? 4 : 0;
      const frameEnd = offset + maskLen + payloadLen;
      if (this.buffer.length < frameEnd) return;

      let payload;
      if (masked) {
        const mask = this.buffer.subarray(offset, offset + 4);
        const raw = this.buffer.subarray(offset + 4, frameEnd);
        payload = Buffer.allocUnsafe(payloadLen);
        for (let i = 0; i < payloadLen; i++) {
          payload[i] = raw[i] ^ mask[i & 3];
        }
      } else {
        payload = Buffer.from(this.buffer.subarray(offset, frameEnd));
      }

      this.buffer = frameEnd === this.buffer.length ? Buffer.alloc(0) : this.buffer.subarray(frameEnd);

      if (opcode === 0x8) {
        this.close(1000);
        return;
      }
      if (opcode === 0x9) {
        this.pong(payload);
        continue;
      }
      if (opcode === 0xA) {
        this.missedPongs = 0;
        continue;
      }
      if (opcode === 0x1 || opcode === 0x2) {
        if (fin) {
          if (opcode === 0x1 && this._onMessage) this._onMessage(payload.toString('utf8'));
        } else {
          this.fragOpcode = opcode;
          this.fragChunks = [payload];
          this.fragBytes = payload.length;
        }
        continue;
      }
      if (opcode === 0x0 && this.fragOpcode) {
        this.fragBytes += payload.length;
        if (this.fragBytes > MAX_PAYLOAD) {
          this.close(1009, 'Message too big');
          return;
        }
        this.fragChunks.push(payload);
        if (fin) {
          const full = Buffer.concat(this.fragChunks);
          const op = this.fragOpcode;
          this.fragOpcode = 0;
          this.fragChunks = [];
          this.fragBytes = 0;
          if (op === 0x1 && this._onMessage) this._onMessage(full.toString('utf8'));
        }
      }
    }
  }
}

class HubMmoRoom {
  constructor(id, gameId, options = {}, now = Date.now) {
    this.id = id;
    this.gameId = gameId;
    this.now = now;
    this.phase = 'playing';
    this.courseSeed = Math.floor(clamp(options.courseSeed ?? 42071, 1, 999999, 42071));
    this.proximityRadius = clamp(options.proximityRadius, 120, 4000, DEFAULT_PROXIMITY_RADIUS);
    this.leaveHysteresis = clamp(options.leaveHysteresis, 0, 500, DEFAULT_LEAVE_HYSTERESIS);
    this.maxNearbyGhosts = Math.floor(clamp(options.maxNearbyGhosts, 1, MAX_PLAYERS - 1, DEFAULT_MAX_NEARBY_GHOSTS));
    this.players = new Map();
    this.dirtyPresence = new Set();
    this.nextPlayerNum = 1;
    this.nextShortId = 1;
    this.createdAt = now();
    this.stats = {
      eventsReceived: 0,
      multicastsSent: 0,
      filteredOut: 0,
      joins: 0,
      leaves: 0,
    };
  }

  estimateDistance(player, nowMs = this.now()) {
    if (player.phase !== 'playing') return player.runDistance;
    const elapsedSec = Math.max(0, Math.min(10, (nowMs - player.stateAt) / 1000));
    return player.runDistance + player.speed * elapsedSec;
  }

  estimateFlapTime(player, nowMs = this.now()) {
    if (player.phase !== 'playing') return player.flapTime;
    const elapsedSec = Math.max(0, Math.min(10, (nowMs - player.stateAt) / 1000));
    return Math.min(10, player.flapTime + elapsedSec);
  }

  isWithinProximity(distA, distB, wasNearby) {
    const limit = this.proximityRadius + (wasNearby ? this.leaveHysteresis : 0);
    return Math.abs(distA - distB) <= limit;
  }

  _peerEventPayload(player, eventType, nowMs = this.now()) {
    return {
      peerId: player.id,
      shortId: player.shortId,
      name: player.name,
      platform: player.platform,
      eventType,
      runDistance: Math.round(this.estimateDistance(player, nowMs)),
      y: Math.round(player.y),
      vy: Math.round(player.vy),
      angle: round3(player.angle),
      flapTime: round3(eventType === 'flap' ? 0 : this.estimateFlapTime(player, nowMs)),
      phase: player.phase,
      score: player.score,
      seq: player.seq,
    };
  }

  _compactEventTuple(player, eventType, includeIdentity = false, nowMs = this.now()) {
    const evCode = EVENT_TO_CODE[eventType] ?? 3;
    const dist = Math.round(this.estimateDistance(player, nowMs));
    const y = Math.round(player.y);
    if (evCode === 1 && !includeIdentity && player.phase === 'playing') {
      return [player.shortId, 1, dist, y, player.score];
    }
    const phaseCode = PHASE_TO_CODE[player.phase] ?? 0;
    const flap100 = evCode === 1 ? 0 : Math.round(this.estimateFlapTime(player, nowMs) * 100);
    if (includeIdentity) {
      return [player.shortId, evCode, dist, y, player.score, phaseCode, flap100, Math.round(player.vy), player.name];
    }
    return [player.shortId, evCode, dist, y, player.score, phaseCode, flap100];
  }

  _deliverPeerEvent(recipient, sender, eventType, { includeIdentity = false, nowMs, cache = null } = {}) {
    if (recipient.compact) {
      let encoded;
      if (cache && !includeIdentity) {
        if (cache.compactEncoded === null) {
          cache.compactEncoded = JSON.stringify(this._compactEventTuple(sender, eventType, false, nowMs));
        }
        encoded = cache.compactEncoded;
      } else if (cache && includeIdentity) {
        if (cache.compactIdentityEncoded === null) {
          cache.compactIdentityEncoded = JSON.stringify(this._compactEventTuple(sender, eventType, true, nowMs));
        }
        encoded = cache.compactIdentityEncoded;
      } else {
        encoded = JSON.stringify(this._compactEventTuple(sender, eventType, includeIdentity, nowMs));
      }
      recipient.sendCompactEvent(encoded);
      return;
    }
    let encoded;
    if (cache) {
      if (cache.legacyEncoded === null) {
        cache.legacyEncoded = JSON.stringify({
          type: 'rpc',
          method: 'client_multicast_event',
          params: this._peerEventPayload(sender, eventType, nowMs),
        });
      }
      encoded = cache.legacyEncoded;
    } else {
      encoded = JSON.stringify({
        type: 'rpc',
        method: 'client_multicast_event',
        params: this._peerEventPayload(sender, eventType, nowMs),
      });
    }
    recipient.sendRaw(encoded);
  }

  _deliverPeerRemoved(recipient, removedPlayer, cache = null) {
    if (recipient.compact) {
      recipient.sendCompactRemoved(removedPlayer.shortId);
      return;
    }
    if (cache) {
      if (cache.removedEncoded === null) {
        cache.removedEncoded = JSON.stringify({
          type: 'rpc',
          method: 'client_peer_removed',
          params: { peerId: removedPlayer.id },
        });
      }
      recipient.sendRaw(cache.removedEncoded);
      return;
    }
    recipient.sendRaw(JSON.stringify({
      type: 'rpc',
      method: 'client_peer_removed',
      params: { peerId: removedPlayer.id },
    }));
  }

  flushPresence() {
    if (this.dirtyPresence.size === 0) return;
    const onlineCount = this.players.size;
    for (const playerId of this.dirtyPresence) {
      const player = this.players.get(playerId);
      if (!player) continue;
      if (player.compact) {
        player.setCompactPresence(onlineCount, player.nearby.size);
      } else {
        player.setPresenceRaw(JSON.stringify({
          type: 'rpc',
          method: 'client_presence',
          params: { onlineCount, nearbyCount: player.nearby.size },
        }));
      }
    }
    this.dirtyPresence.clear();
  }

  join(rawName, options = {}) {
    if (this.players.size >= MAX_PLAYERS) {
      throw new Error('이 MMO 월드가 가득 찼습니다.');
    }
    const id = 'p-' + crypto.randomBytes(6).toString('hex');
    const shortId = this.nextShortId++;
    const name = cleanName(rawName, `Player ${this.nextPlayerNum++}`);
    const platform = cleanPlatform(options.platform);
    const nowMs = this.now();
    const player = {
      id,
      shortId,
      name,
      platform,
      runDistance: clamp(options.runDistance, 0, 10000000, 0),
      speed: clamp(options.speed, 60, 400, DEFAULT_PLAYER_SPEED),
      y: clamp(options.y, 0, 640, 290),
      vy: 0,
      angle: 0,
      flapTime: 0,
      phase: VALID_PHASES.has(options.phase) ? options.phase : 'menu',
      score: 0,
      seq: 0,
      nearby: new Set(),
      joinedAt: nowMs,
      lastSeenAt: nowMs,
      stateAt: nowMs,
      compact: Boolean(options.compact),
      sendImmediate: options.sendImmediate,
      sendRaw: options.sendRaw,
      setPresenceRaw: options.setPresenceRaw,
      sendCompactEvent: options.sendCompactEvent,
      sendCompactRemoved: options.sendCompactRemoved,
      setCompactPresence: options.setCompactPresence,
    };
    this.players.set(id, player);
    this.stats.joins += 1;

    const welcome = {
      type: 'welcome',
      roomId: this.id,
      gameId: this.gameId,
      playerId: player.id,
      shortId: player.shortId,
      playerName: player.name,
      platform: player.platform,
      courseSeed: this.courseSeed,
      proximityRadius: this.proximityRadius,
      maxNearbyGhosts: this.maxNearbyGhosts,
      compact: player.compact,
      onlineCount: this.players.size,
    };
    player.sendImmediate(welcome);

    const joinCache = { legacyEncoded: null, compactEncoded: null, compactIdentityEncoded: null };
    const playerDist = this.estimateDistance(player, nowMs);
    for (const other of this.players.values()) {
      if (other.id === player.id) continue;
      const canPair = player.nearby.size < this.maxNearbyGhosts && other.nearby.size < this.maxNearbyGhosts;
      const otherDist = this.estimateDistance(other, nowMs);
      if (canPair && this.isWithinProximity(playerDist, otherDist, false)) {
        player.nearby.add(other.id);
        other.nearby.add(player.id);
        this._deliverPeerEvent(other, player, 'join', { includeIdentity: true, nowMs, cache: joinCache });
        this._deliverPeerEvent(player, other, 'sync', { includeIdentity: true, nowMs });
        this.stats.multicastsSent += 2;
      } else {
        this.stats.filteredOut += 1;
      }
    }
    for (const peer of this.players.values()) this.dirtyPresence.add(peer.id);
    return { player, welcome };
  }

  handleEvent(playerId, params) {
    const player = this.players.get(playerId);
    if (!player) throw new Error('참가하지 않은 플레이어입니다.');
    if (!params || typeof params !== 'object' || Array.isArray(params)) {
      throw new Error('RPC 인자가 올바르지 않습니다.');
    }
    const eventType = String(params.eventType ?? params.event_type ?? 'sync');
    if (!VALID_EVENTS.has(eventType)) throw new Error('지원하지 않는 플레이어 이벤트입니다.');
    const seq = Number.isSafeInteger(params.seq) ? params.seq : 0;
    if (eventType !== 'join' && seq > 0 && seq <= player.seq) return;
    if (seq > 0) player.seq = seq;

    if (typeof params.name === 'string' && params.name.trim()) {
      player.name = cleanName(params.name, player.name);
    }
    const nowMs = this.now();
    const rawPhase = String(params.phase ?? (eventType === 'flap' ? 'playing' : player.phase));
    player.phase = VALID_PHASES.has(rawPhase) ? rawPhase : player.phase;
    player.runDistance = clamp(params.runDistance ?? params.run_distance, 0, 10000000, player.runDistance);
    if (params.speed !== undefined) player.speed = clamp(params.speed, 60, 400, player.speed);
    player.y = clamp(params.y, 0, 640, player.y);
    if (eventType === 'flap') {
      player.vy = -345;
      player.angle = -0.785;
      player.flapTime = 0;
    } else {
      player.vy = clamp(params.vy, -2000, 2000, player.vy);
      player.angle = clamp(params.angle, -Math.PI, Math.PI, player.angle);
      player.flapTime = clamp(params.flapTime ?? params.flap_time, 0, 10, player.flapTime);
    }
    player.score = Math.max(0, Math.floor(clamp(params.score, 0, 999999, player.score)));
    player.lastSeenAt = nowMs;
    player.stateAt = nowMs;

    this.stats.eventsReceived += 1;
    const eventCache = { legacyEncoded: null, compactEncoded: null, compactIdentityEncoded: null };
    const removedCache = { removedEncoded: null };
    const senderDist = player.runDistance;
    let presenceChanged = false;

    for (const other of this.players.values()) {
      if (other.id === player.id) continue;
      const wasNearby = player.nearby.has(other.id);
      const otherDist = this.estimateDistance(other, nowMs);
      const inRange = this.isWithinProximity(senderDist, otherDist, wasNearby);
      const nowNearby = inRange && (wasNearby || (player.nearby.size < this.maxNearbyGhosts && other.nearby.size < this.maxNearbyGhosts));

      if (nowNearby) {
        const entering = !wasNearby;
        this._deliverPeerEvent(other, player, eventType, {
          includeIdentity: entering || eventType === 'join',
          nowMs,
          cache: eventCache,
        });
        this.stats.multicastsSent += 1;
        if (entering) {
          player.nearby.add(other.id);
          other.nearby.add(player.id);
          this._deliverPeerEvent(player, other, 'sync', { includeIdentity: true, nowMs });
          this.stats.multicastsSent += 1;
          this.dirtyPresence.add(other.id);
          presenceChanged = true;
        }
      } else {
        this.stats.filteredOut += 1;
        if (wasNearby) {
          player.nearby.delete(other.id);
          other.nearby.delete(player.id);
          this._deliverPeerRemoved(other, player, removedCache);
          this._deliverPeerRemoved(player, other);
          this.dirtyPresence.add(other.id);
          presenceChanged = true;
        }
      }
    }
    if (presenceChanged) this.dirtyPresence.add(player.id);
  }

  leave(playerId) {
    const player = this.players.get(playerId);
    if (!player) return;
    this.players.delete(playerId);
    this.dirtyPresence.delete(playerId);
    this.stats.leaves += 1;
    const removedCache = { removedEncoded: null };
    for (const otherId of player.nearby) {
      const other = this.players.get(otherId);
      if (!other) continue;
      other.nearby.delete(playerId);
      this._deliverPeerRemoved(other, player, removedCache);
    }
    for (const peer of this.players.values()) this.dirtyPresence.add(peer.id);
  }

  metadata() {
    const platforms = {};
    const players = [];
    const nowMs = this.now();
    for (const p of this.players.values()) {
      platforms[p.platform] = (platforms[p.platform] || 0) + 1;
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
    return {
      roomId: this.id,
      gameId: this.gameId,
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

function parseCompactClientEvent(arr) {
  if (!Array.isArray(arr) || arr.length < 3) {
    throw new Error('압축 이벤트 형식이 올바르지 않습니다.');
  }
  const eventType = CODE_TO_EVENT[arr[0]];
  if (!eventType) throw new Error('지원하지 않는 플레이어 이벤트입니다.');
  const params = {
    eventType,
    runDistance: arr[1],
    y: arr[2],
    score: arr[3] ?? 0,
    phase: arr[4] !== undefined ? (CODE_TO_PHASE[arr[4]] || 'playing') : (eventType === 'flap' ? 'playing' : undefined),
    seq: arr[5] ?? 0,
  };
  if (arr[6] !== undefined) params.flapTime = Number(arr[6]) / 100;
  if (arr[7] !== undefined) params.vy = arr[7];
  if (arr[8] !== undefined) params.speed = arr[8];
  return params;
}

export function createUgcMultiplayer({
  now = Date.now,
  flushIntervalMs = DEFAULT_FLUSH_INTERVAL_MS,
  heartbeatIntervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS,
  maxMissedPongs = DEFAULT_MAX_MISSED_PONGS,
  maxMessagesPerSec = 80,
} = {}) {
  const rooms = new Map();
  const socketsByRoom = new Map();
  const allSockets = new Set();

  function findOrCreateChannel(gameId, options = {}) {
    for (const room of rooms.values()) {
      if (room.gameId === gameId && room.players.size < MAX_PLAYERS) {
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

  function flushSocket(ws) {
    if (!ws.open) {
      ws.outboundQueue.length = 0;
      ws.pendingPresenceRaw = null;
      ws.compactEvents.length = 0;
      ws.compactRemoved.length = 0;
      ws.compactPresence = null;
      return;
    }
    if (ws.compact) {
      const hasEvents = ws.compactEvents.length > 0;
      const hasRemoved = ws.compactRemoved.length > 0;
      const hasPresence = ws.compactPresence !== null;
      if (!hasEvents && !hasRemoved && !hasPresence) return;
      if (ws.bufferedAmount < 1000000) {
        const parts = [];
        if (hasEvents) parts.push('"b":[' + ws.compactEvents.join(',') + ']');
        if (hasRemoved) parts.push('"r":[' + ws.compactRemoved.join(',') + ']');
        if (hasPresence) parts.push('"p":[' + ws.compactPresence[0] + ',' + ws.compactPresence[1] + ']');
        ws.send('{' + parts.join(',') + '}');
      }
      ws.compactEvents.length = 0;
      ws.compactRemoved.length = 0;
      ws.compactPresence = null;
      return;
    }
    if (ws.pendingPresenceRaw !== null) {
      ws.outboundQueue.push(ws.pendingPresenceRaw);
      ws.pendingPresenceRaw = null;
    }
    if (ws.outboundQueue.length === 0) return;
    if (ws.bufferedAmount < 1000000) {
      for (const frame of ws.outboundQueue) {
        if (ws.bufferedAmount >= 1000000) break;
        ws.send(frame);
      }
    }
    ws.outboundQueue.length = 0;
  }

  const flushTimer = setInterval(() => {
    for (const room of rooms.values()) {
      room.flushPresence();
      const sockets = socketsByRoom.get(room.id);
      if (!sockets) continue;
      for (const ws of sockets) flushSocket(ws);
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
    if (pathname !== SOCKET_PATH) return false;

    const key = req.headers['sec-websocket-key'];
    const upgradeHdr = String(req.headers.upgrade || '').toLowerCase();
    if (!key || upgradeHdr !== 'websocket') {
      socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
      return true;
    }

    const accept = crypto.createHash('sha1').update(String(key).trim() + WS_GUID).digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
    );

    const ws = new SimpleWsConnection(socket);
    allSockets.add(ws);
    let rateAt = now();
    let msgCount = 0;
    let activeRoom = null;
    let activePlayerId = null;

    const joinTimeout = setTimeout(() => {
      if (!activePlayerId) ws.close(1008, 'Join required');
    }, 8000);
    joinTimeout.unref();

    ws.onMessage(rawText => {
      try {
        const currentNow = now();
        if (currentNow - rateAt > 1000) {
          rateAt = currentNow;
          msgCount = 0;
        }
        if (++msgCount > maxMessagesPerSec) throw new Error('요청이 너무 빠릅니다.');

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
          let room = null;
          if (typeof msg.roomId === 'string' && msg.roomId) {
            if (!ROOM_ID_RE.test(msg.roomId)) throw new Error('잘못된 방 ID입니다.');
            room = rooms.get(msg.roomId);
            if (!room) throw new Error('해당 멀티플레이 채널을 찾을 수 없습니다.');
          } else {
            const gameId = String(msg.gameId || 'tappy-chicken-mmo').trim();
            if (!GAME_ID_RE.test(gameId)) throw new Error('잘못된 게임 ID입니다.');
            room = findOrCreateChannel(gameId, {
              courseSeed: msg.courseSeed,
              proximityRadius: msg.proximityRadius,
              maxNearbyGhosts: msg.maxNearbyGhosts,
            });
          }

          ws.compact = Boolean(msg.compact);
          const joined = room.join(msg.name, {
            platform: msg.platform,
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
      allSockets.delete(ws);
      ws.outboundQueue.length = 0;
      ws.compactEvents.length = 0;
      ws.compactRemoved.length = 0;
      if (!activeRoom) return;
      socketsByRoom.get(activeRoom.id)?.delete(ws);
      if (activePlayerId) activeRoom.leave(activePlayerId);
      if (activeRoom.players.size === 0 && (socketsByRoom.get(activeRoom.id)?.size || 0) === 0) {
        rooms.delete(activeRoom.id);
        socketsByRoom.delete(activeRoom.id);
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
      const list = [...rooms.values()].filter(r => r.gameId === gameId).map(r => r.metadata());
      const totalOnline = list.reduce((acc, r) => acc + r.onlineCount, 0);
      json(res, 200, {
        gameId,
        wsPath: SOCKET_PATH,
        totalOnline,
        rooms: list,
      });
      return true;
    }
    return false;
  }

  function close() {
    clearInterval(flushTimer);
    clearInterval(heartbeatTimer);
    for (const ws of allSockets) ws.terminate();
    allSockets.clear();
    rooms.clear();
    socketsByRoom.clear();
  }

  return {
    socketPath: SOCKET_PATH,
    rooms,
    handleUpgrade,
    publicRoute,
    close,
  };
}
