'use strict';

// Single Source of Truth (SSOT) for spatial MMO room simulation, compact 5-element tuple codec,
// linear AOI estimation, and socket batch flushing shared by PlayHub (/ws/ugc-mmo) and PlayForge PIE.
const crypto = require('node:crypto');

const DEFAULT_PROXIMITY_RADIUS = 520;
const DEFAULT_LEAVE_HYSTERESIS = 60;
const DEFAULT_MAX_NEARBY_GHOSTS = 12;
const DEFAULT_PLAYER_SPEED = 170; // Matches Game.gd DEFAULTS.speed
const DEFAULT_FLUSH_INTERVAL_MS = 50;
const DEFAULT_STATE_INTERVAL_MS = 1000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 10000;
const DEFAULT_MAX_MISSED_PONGS = 2;
const MAX_PLAYERS = 64;
const MAX_OUTBOUND_QUEUE = 256;

const VALID_EVENTS = new Set(['join', 'flap', 'phase', 'sync', 'leave']);
const VALID_PHASES = new Set(['menu', 'ready', 'playing', 'paused', 'crashing', 'over']);
const VALID_PLATFORMS = new Set(['web', 'android', 'ios', 'desktop']);

const EVENT_TO_CODE = Object.freeze({ join: 0, flap: 1, phase: 2, sync: 3, leave: 4 });
const CODE_TO_EVENT = Object.freeze(['join', 'flap', 'phase', 'sync', 'leave']);
const PHASE_TO_CODE = Object.freeze({ menu: 0, ready: 1, playing: 2, paused: 3, crashing: 4, over: 5 });
const CODE_TO_PHASE = Object.freeze(['menu', 'ready', 'playing', 'paused', 'crashing', 'over']);

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

function flushSocketQueue(ws, isOpenFn, maxBufferedBytes = 1000000) {
  const isOpen = typeof isOpenFn === 'function' ? isOpenFn(ws) : Boolean(ws && ws.open);
  if (!isOpen) {
    if (ws) {
      if (ws.outboundQueue) ws.outboundQueue.length = 0;
      ws.pendingPresenceRaw = null;
      if (ws.compactEvents) ws.compactEvents.length = 0;
      if (ws.compactRemoved) ws.compactRemoved.length = 0;
      ws.compactPresence = null;
    }
    return;
  }
  if (ws.compact) {
    const hasEvents = ws.compactEvents.length > 0;
    const hasRemoved = ws.compactRemoved.length > 0;
    const hasPresence = ws.compactPresence !== null;
    if (!hasEvents && !hasRemoved && !hasPresence) return;
    if (ws.bufferedAmount < maxBufferedBytes) {
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
  const count = ws.outboundQueue.length;
  if (count === 0) return;
  if (ws.bufferedAmount < maxBufferedBytes) {
    if (count === 1) {
      ws.send(ws.outboundQueue[0]);
    } else if (ws.supportsBatch) {
      ws.send('{"type":"rpc_batch","items":[' + ws.outboundQueue.join(',') + ']}');
    } else {
      for (let i = 0; i < count; i += 1) {
        if (ws.bufferedAmount >= maxBufferedBytes) break;
        ws.send(ws.outboundQueue[i]);
      }
    }
  }
  ws.outboundQueue.length = 0;
}

class SpatialMmoRoom {
  constructor(id, scope = {}, options = {}, now = Date.now) {
    this.id = id;
    this.gameId = scope.gameId || null;
    this.projectId = scope.projectId || null;
    this.build = scope.build || null;
    this.partyCode = scope.partyCode || null;
    this.now = now;
    this.phase = 'playing'; // Always live: seamless drop-in (난입) without lobby wait.
    const defaultSeed = scope.defaultSeed ?? (10000 + (parseInt(String(id).slice(0, 6), 16) % 900000));
    this.courseSeed = Math.floor(clamp(options.courseSeed ?? defaultSeed, 1, 999999, 42071));
    this.proximityRadius = clamp(options.proximityRadius, 120, 4000, DEFAULT_PROXIMITY_RADIUS);
    this.leaveHysteresis = clamp(options.leaveHysteresis, 0, 500, DEFAULT_LEAVE_HYSTERESIS);
    this.maxNearbyGhosts = Math.floor(clamp(options.maxNearbyGhosts, 1, MAX_PLAYERS - 1, DEFAULT_MAX_NEARBY_GHOSTS));
    this.deferPresence = Boolean(options.deferPresence);
    this.enableLogs = Boolean(options.enableLogs);
    this.includePlatform = Boolean(options.includePlatform);
    this.players = new Map();
    this.dirtyPresence = new Set();
    this.nextPlayerNum = 1;
    this.nextShortId = 1;
    this.createdAt = now();
    this.logs = [];
    this.logSeq = 0;
    this.stats = {
      eventsReceived: 0,
      multicastsSent: 0,
      filteredOut: 0,
      joins: 0,
      leaves: 0,
    };
  }

  recordLog(event, message) {
    if (!this.enableLogs) return;
    this.logs.push({
      seq: ++this.logSeq,
      at: this.now(),
      source: 'server',
      roomId: this.id,
      event,
      message: String(message).slice(0, 240),
    });
    if (this.logs.length > 120) this.logs.shift();
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
    const dist = this.estimateDistance(player, nowMs);
    const flapTime = eventType === 'flap' ? 0 : this.estimateFlapTime(player, nowMs);
    const payload = {
      peerId: player.id,
      name: player.name,
      eventType,
      runDistance: Math.round(dist),
      y: Math.round(player.y),
      vy: Math.round(player.vy),
      angle: round3(player.angle),
      flapTime: round3(flapTime),
      phase: player.phase,
      score: player.score,
      seq: player.seq,
    };
    if (this.includePlatform) {
      payload.shortId = player.shortId;
      payload.platform = player.platform;
    }
    return payload;
  }

  _compactEventTuple(player, eventType, includeIdentity = false, nowMs = this.now()) {
    const evCode = EVENT_TO_CODE[eventType] ?? 3;
    const dist = Math.round(this.estimateDistance(player, nowMs));
    const y = Math.round(player.y);
    // Ultra-compact 5-element tuple for steady-state flap events (~20 bytes):
    // [shortId, 1, runDistance, y, score] — flapTime=0, phase='playing', vy/angle are deterministic.
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

  _sendTo(player, message, preEncoded = null) {
    if (typeof player.sendRaw === 'function') {
      player.sendRaw(preEncoded ?? JSON.stringify(message));
      return;
    }
    if (typeof player.send === 'function') {
      player.send(message);
    }
  }

  _deliverPeerEvent(recipient, sender, eventType, { includeIdentity = false, nowMs, cache = null } = {}) {
    if (recipient.compact && typeof recipient.sendCompactEvent === 'function') {
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
    if (cache) {
      if (cache.legacyMessage === null) {
        cache.legacyMessage = {
          type: 'rpc',
          method: 'client_multicast_event',
          params: this._peerEventPayload(sender, eventType, nowMs),
        };
      }
      if (recipient.sendRaw && cache.legacyEncoded === null) {
        cache.legacyEncoded = JSON.stringify(cache.legacyMessage);
      }
      this._sendTo(recipient, cache.legacyMessage, cache.legacyEncoded);
      return;
    }
    this._sendTo(recipient, {
      type: 'rpc',
      method: 'client_multicast_event',
      params: this._peerEventPayload(sender, eventType, nowMs),
    });
  }

  _deliverPeerRemoved(recipient, removedPlayer, cache = null) {
    if (recipient.compact && typeof recipient.sendCompactRemoved === 'function') {
      recipient.sendCompactRemoved(removedPlayer.shortId);
      return;
    }
    if (cache) {
      if (cache.removedMessage === null) {
        cache.removedMessage = {
          type: 'rpc',
          method: 'client_peer_removed',
          params: { peerId: removedPlayer.id },
        };
      }
      if (recipient.sendRaw && cache.removedEncoded === null) {
        cache.removedEncoded = JSON.stringify(cache.removedMessage);
      }
      this._sendTo(recipient, cache.removedMessage, cache.removedEncoded);
      return;
    }
    this._sendTo(recipient, {
      type: 'rpc',
      method: 'client_peer_removed',
      params: { peerId: removedPlayer.id },
    });
  }

  _sendPresence(player) {
    if (this.deferPresence) {
      this.dirtyPresence.add(player.id);
      return;
    }
    this._sendTo(player, {
      type: 'rpc',
      method: 'client_presence',
      params: {
        onlineCount: this.players.size,
        nearbyCount: player.nearby.size,
      },
    });
  }

  flushPresence() {
    if (this.dirtyPresence.size === 0) return;
    const onlineCount = this.players.size;
    for (const playerId of this.dirtyPresence) {
      const player = this.players.get(playerId);
      if (!player) continue;
      if (player.compact && typeof player.setCompactPresence === 'function') {
        player.setCompactPresence(onlineCount, player.nearby.size);
        continue;
      }
      const payload = {
        type: 'rpc',
        method: 'client_presence',
        params: {
          onlineCount,
          nearbyCount: player.nearby.size,
        },
      };
      if (typeof player.setPresenceRaw === 'function') {
        player.setPresenceRaw(JSON.stringify(payload));
      } else {
        this._sendTo(player, payload);
      }
    }
    this.dirtyPresence.clear();
  }

  _buildWelcome(player) {
    const base = {
      type: 'welcome',
      roomId: this.id,
      playerId: player.id,
      shortId: player.shortId,
      playerName: player.name,
      courseSeed: this.courseSeed,
      proximityRadius: this.proximityRadius,
      maxNearbyGhosts: this.maxNearbyGhosts,
      compact: player.compact,
      onlineCount: this.players.size,
    };
    if (this.gameId) base.gameId = this.gameId;
    if (this.partyCode) base.partyCode = this.partyCode;
    if (this.includePlatform) base.platform = player.platform;
    if (this.projectId !== null) {
      base.projectId = this.projectId;
      base.buildId = this.build?.id || null;
      base.revision = this.build?.revision ?? null;
      base.previewUrl = this.build?.previewUrl || null;
    }
    return base;
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
      send: typeof options.send === 'function' ? options.send : null,
      sendImmediate: typeof options.sendImmediate === 'function' ? options.sendImmediate : null,
      sendRaw: typeof options.sendRaw === 'function' ? options.sendRaw : null,
      setPresenceRaw: typeof options.setPresenceRaw === 'function' ? options.setPresenceRaw : null,
      sendCompactEvent: typeof options.sendCompactEvent === 'function' ? options.sendCompactEvent : null,
      sendCompactRemoved: typeof options.sendCompactRemoved === 'function' ? options.sendCompactRemoved : null,
      setCompactPresence: typeof options.setCompactPresence === 'function' ? options.setCompactPresence : null,
    };
    this.players.set(id, player);
    this.stats.joins += 1;
    this.recordLog('join', `${name} 난입 (온라인 ${this.players.size}명, 시드 ${this.courseSeed})`);

    const welcome = this._buildWelcome(player);
    if (player.sendImmediate) {
      player.sendImmediate(welcome);
    } else {
      this._sendTo(player, welcome);
    }

    const joinCache = { legacyMessage: null, legacyEncoded: null, compactEncoded: null, compactIdentityEncoded: null };
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
    for (const peer of this.players.values()) this._sendPresence(peer);
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
    if (eventType !== 'join' && seq > 0 && seq <= player.seq) {
      return { ignored: true, deliveredTo: [], enteredIds: [], leftIds: [], filteredIds: [] };
    }
    if (seq > 0) player.seq = seq;

    if (typeof params.name === 'string' && params.name.trim()) {
      player.name = cleanName(params.name, player.name);
    }
    const nowMs = this.now();
    const rawPhase = String(params.phase ?? (eventType === 'flap' ? 'playing' : player.phase));
    player.phase = VALID_PHASES.has(rawPhase) ? rawPhase : player.phase;
    player.runDistance = clamp(params.runDistance ?? params.run_distance, 0, 10000000, player.runDistance);
    if (params.speed !== undefined) {
      player.speed = clamp(params.speed, 60, 400, player.speed);
    }
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
    const eventCache = { legacyMessage: null, legacyEncoded: null, compactEncoded: null, compactIdentityEncoded: null };
    const removedCache = { removedMessage: null, removedEncoded: null };
    const deliveredTo = [];
    const enteredIds = [];
    const leftIds = [];
    const filteredIds = [];
    const senderDist = player.runDistance;

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
        deliveredTo.push(other.id);
        if (entering) {
          player.nearby.add(other.id);
          other.nearby.add(player.id);
          enteredIds.push(other.id);
          this._deliverPeerEvent(player, other, 'sync', { includeIdentity: true, nowMs });
          this.stats.multicastsSent += 1;
        }
      } else {
        this.stats.filteredOut += 1;
        filteredIds.push(other.id);
        if (wasNearby) {
          player.nearby.delete(other.id);
          other.nearby.delete(player.id);
          leftIds.push(other.id);
          this._deliverPeerRemoved(other, player, removedCache);
          this._deliverPeerRemoved(player, other);
        }
      }
    }

    if (enteredIds.length > 0 || leftIds.length > 0) {
      this._sendPresence(player);
      for (const peerId of enteredIds) {
        const peer = this.players.get(peerId);
        if (peer) this._sendPresence(peer);
      }
      for (const peerId of leftIds) {
        const peer = this.players.get(peerId);
        if (peer) this._sendPresence(peer);
      }
    }

    if (eventType === 'flap' && deliveredTo.length > 0) {
      if (this.stats.eventsReceived <= 12 || this.stats.eventsReceived % 50 === 0) {
        this.recordLog('rpc', `${player.name} flap RPC -> 주변 ${deliveredTo.length}명 멀티캐스트 (범위 밖 ${filteredIds.length}명 제외)`);
      }
    }

    return { ignored: false, deliveredTo, enteredIds, leftIds, filteredIds };
  }

  handleRpc(playerId, message) {
    if (!this.players.has(playerId)) throw new Error('참가하지 않은 플레이어입니다.');
    if (!message || typeof message !== 'object' || message.method !== 'server_player_event') {
      throw new Error('지원하지 않는 RPC 메서드입니다.');
    }
    return this.handleEvent(playerId, message.params);
  }

  leave(playerId) {
    const player = this.players.get(playerId);
    if (!player) return [];
    const notified = [];
    this.players.delete(playerId);
    this.dirtyPresence.delete(playerId);
    this.stats.leaves += 1;
    const removedCache = { removedMessage: null, removedEncoded: null };
    for (const otherId of player.nearby) {
      const other = this.players.get(otherId);
      if (!other) continue;
      other.nearby.delete(playerId);
      this._deliverPeerRemoved(other, player, removedCache);
      notified.push(otherId);
    }
    this.recordLog('leave', `${player.name} 이탈 (주변 ${notified.length}명에게 정리 RPC 전송)`);
    for (const peer of this.players.values()) this._sendPresence(peer);
    return notified;
  }
}

module.exports = {
  DEFAULT_PROXIMITY_RADIUS,
  DEFAULT_LEAVE_HYSTERESIS,
  DEFAULT_MAX_NEARBY_GHOSTS,
  DEFAULT_PLAYER_SPEED,
  DEFAULT_FLUSH_INTERVAL_MS,
  DEFAULT_STATE_INTERVAL_MS,
  DEFAULT_HEARTBEAT_INTERVAL_MS,
  DEFAULT_MAX_MISSED_PONGS,
  MAX_PLAYERS,
  MAX_OUTBOUND_QUEUE,
  VALID_EVENTS,
  VALID_PHASES,
  VALID_PLATFORMS,
  EVENT_TO_CODE,
  CODE_TO_EVENT,
  PHASE_TO_CODE,
  CODE_TO_PHASE,
  clamp,
  cleanName,
  cleanPlatform,
  round3,
  parseCompactClientEvent,
  flushSocketQueue,
  SpatialMmoRoom,
};
