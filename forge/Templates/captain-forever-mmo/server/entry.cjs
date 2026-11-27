'use strict';

const { randomBytes } = require('node:crypto');
const { WebSocket, WebSocketServer } = require('ws');

const SOCKET_PATH = '/captain-forever-mmo';
const PROJECT_ID = /^[a-f0-9]{24}$/;
const BUILD_ID = /^[a-f0-9]{16}$/;
const ROOM_ID = /^[a-f0-9]{12}$/;
const DEFAULT_PROXIMITY_RADIUS = 2400;
const DEFAULT_LEAVE_HYSTERESIS = 240;
const DEFAULT_MAX_NEARBY_PEERS = 16;
const DEFAULT_FLUSH_INTERVAL_MS = 50;
const DEFAULT_STATE_INTERVAL_MS = 1000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 10000;
const DEFAULT_MAX_MISSED_PONGS = 2;
const DEFAULT_JOIN_TIMEOUT_MS = 5000;
const DEFAULT_MAX_MESSAGES_PER_SEC = 80;
const MAX_BUFFERED_BYTES = 1_000_000;
const MAX_PLAYERS = 64;
const MAX_ROOMS = 64;
const MAX_BLUEPRINT_PARTS = 32;
const VALID_EVENTS = new Set(['join', 'state', 'ship', 'fire', 'hit', 'destroy', 'leave']);
const VALID_PHASES = new Set(['playing', 'editing', 'destroyed']);
const VALID_PART_KINDS = new Set([
  'scrap', 'core', 'armor', 'thruster', 'reverse_thruster', 'rcs_thruster',
  'battery', 'laser', 'missile_launcher', 'mini_missile_launcher',
  'machine_gun', 'railgun', 'ammo_bay', 'bullet_bay', 'shield_generator',
  'block', 'beam2', 'beam3', 'beam4', 'plate4', 'wedge', 'wedge_long',
]);

function clamp(value, min, max, fallback) {
  if (typeof value !== 'number' && typeof value !== 'string') return fallback;
  if (typeof value === 'string' && value.trim() === '') return fallback;
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function safeString(raw, fallback = '') {
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
  return fallback;
}

function cleanName(raw, fallback) {
  if (typeof raw !== 'string') return fallback;
  const text = raw.trim().replace(/\s+/g, ' ').slice(0, 24);
  return text || fallback;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function sanitizeBlueprint(raw) {
  if (!Array.isArray(raw)) return null;
  const out = [];
  for (const item of raw) {
    if (out.length >= MAX_BLUEPRINT_PARTS) break;
    if (!Array.isArray(item) || item.length < 4) continue;
    const rawKind = typeof item[0] === 'string' ? item[0] : '';
    const kind = VALID_PART_KINDS.has(rawKind) ? rawKind : 'block';
    const cx = Math.floor(clamp(item[1], -16, 16, 0));
    const cy = Math.floor(clamp(item[2], -16, 16, 0));
    const turns = ((Math.floor(clamp(item[3], 0, 3, 0)) % 4) + 4) % 4;
    const hpRatio = round2(clamp(item[4] ?? 1, 0, 1, 1));
    out.push([kind, cx, cy, turns, hpRatio]);
  }
  return out;
}

function sanitizeShot(raw, fallbackX, fallbackY) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const kind = typeof raw.kind === 'string' && raw.kind ? raw.kind : 'laser';
  const color = typeof raw.color === 'string' && /^[0-9a-fA-F]{6}$/.test(raw.color) ? raw.color : '4ef5d6';
  return {
    x: round2(clamp(raw.x, -250000, 250000, fallbackX)),
    y: round2(clamp(raw.y, -250000, 250000, fallbackY)),
    vx: round2(clamp(raw.vx, -4000, 4000, 0)),
    vy: round2(clamp(raw.vy, -4000, 4000, 0)),
    kind: kind.slice(0, 20),
    damage: round2(clamp(raw.damage, 0.5, 120, 7)),
    life: round2(clamp(raw.life, 0.1, 5, 2)),
    color,
  };
}

class CaptainMmoRoom {
  constructor(id, projectId, build, options = {}, now = Date.now) {
    this.id = id;
    this.projectId = projectId;
    this.build = build || null;
    this.now = now;
    this.phase = 'playing'; // Always live: seamless drop-in (난입)
    this.sectorSeed = Math.floor(clamp(options.sectorSeed ?? (10000 + (parseInt(id.slice(0, 6), 16) % 900000)), 1, 999999, 42071));
    this.proximityRadius = clamp(options.proximityRadius, 250, 20000, DEFAULT_PROXIMITY_RADIUS);
    this.leaveHysteresis = clamp(options.leaveHysteresis, 0, 1000, DEFAULT_LEAVE_HYSTERESIS);
    this.maxNearbyPeers = Math.floor(clamp(options.maxNearbyPeers, 1, MAX_PLAYERS - 1, DEFAULT_MAX_NEARBY_PEERS));
    this.players = new Map();
    this.nextPlayerNum = 1;
    this.logs = [];
    this.logSeq = 0;
    this.stats = {
      eventsReceived: 0,
      multicastsSent: 0,
      filteredOut: 0,
      joins: 0,
      leaves: 0,
      hitsRelayed: 0,
    };
  }

  recordLog(event, message) {
    this.logs.push({
      seq: ++this.logSeq,
      at: this.now(),
      source: 'server',
      roomId: this.id,
      event: safeString(event).slice(0, 40),
      message: safeString(message).slice(0, 240),
    });
    if (this.logs.length > 120) this.logs.shift();
  }

  estimatePosition(player, nowMs = this.now()) {
    const dt = Math.max(0, Math.min(2, (nowMs - player.stateAt) / 1000));
    return {
      x: player.x + player.vx * dt,
      y: player.y + player.vy * dt,
    };
  }

  isWithinProximity(posA, posB, wasNearby) {
    const limit = this.proximityRadius + (wasNearby ? this.leaveHysteresis : 0);
    const dx = posA.x - posB.x;
    const dy = posA.y - posB.y;
    return (dx * dx + dy * dy) <= limit * limit;
  }

  _peerEventPayload(player, eventType, includeBlueprint = false, nowMs = this.now()) {
    const pos = this.estimatePosition(player, nowMs);
    const payload = {
      peerId: player.id,
      name: player.name,
      eventType,
      x: round2(pos.x),
      y: round2(pos.y),
      vx: round2(player.vx),
      vy: round2(player.vy),
      rot: round2(player.rot),
      vrot: round2(player.vrot),
      thrust: player.thrust,
      shields: player.shields,
      hullRatio: player.hullRatio,
      partCount: player.partCount,
      salvage: player.salvage,
      phase: player.phase,
      seq: player.seq,
    };
    if (includeBlueprint && Array.isArray(player.blueprint) && player.blueprint.length > 0) {
      payload.blueprint = player.blueprint;
    }
    return payload;
  }

  _send(player, message) {
    if (typeof player.queueRpc === 'function' && message.type === 'rpc') {
      player.queueRpc(message);
      return;
    }
    if (typeof player.send === 'function') {
      player.send(message);
    }
  }

  addPlayer(options = {}) {
    if (this.players.size >= MAX_PLAYERS) {
      return { ok: false, error: 'MMO 섹터 정원이 가득 찼습니다.' };
    }
    const id = typeof options.id === 'string' && options.id ? options.id : ('p-' + randomBytes(6).toString('hex'));
    const num = this.nextPlayerNum++;
    const name = cleanName(options.name, `선장 ${num}`);
    const player = {
      id,
      name,
      x: clamp(options.x, -250000, 250000, 0),
      y: clamp(options.y, -250000, 250000, 0),
      vx: 0,
      vy: 0,
      rot: -Math.PI * 0.5,
      vrot: 0,
      thrust: 0,
      shields: 1,
      hullRatio: 1,
      partCount: 15,
      salvage: 0,
      phase: 'playing',
      blueprint: [],
      seq: 0,
      stateAt: this.now(),
      nearby: new Set(),
      subscribeState: Boolean(options.subscribeState),
      send: options.send || (() => {}),
      queueRpc: options.queueRpc || null,
    };
    this.players.set(id, player);
    this.stats.joins += 1;
    this.recordLog('join', `${name} 난입 (온라인 ${this.players.size}명)`);
    this.broadcastPresence();
    return { ok: true, player };
  }

  removePlayer(playerId) {
    const player = this.players.get(playerId);
    if (!player) return false;
    this.players.delete(playerId);
    this.stats.leaves += 1;
    for (const otherId of player.nearby) {
      const other = this.players.get(otherId);
      if (!other) continue;
      other.nearby.delete(playerId);
      this._send(other, {
        type: 'rpc',
        method: 'client_peer_removed',
        params: { peerId: playerId },
      });
    }
    this.recordLog('leave', `${player.name} 이탈 (온라인 ${this.players.size}명)`);
    this.broadcastPresence();
    return true;
  }

  handlePlayerEvent(playerId, raw = {}) {
    const player = this.players.get(playerId);
    if (!player) return { ok: false, error: 'Unknown player' };
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'Invalid event payload' };
    const rawEventType = raw.event_type ?? raw.eventType;
    const eventType = typeof rawEventType === 'string' ? rawEventType : (rawEventType === undefined ? 'state' : '');
    if (!VALID_EVENTS.has(eventType)) return { ok: false, error: 'Invalid eventType' };

    const seq = Math.floor(clamp(raw.seq, 0, 1e9, 0));
    if (!['join', 'ship', 'hit', 'destroy'].includes(eventType) && seq > 0 && seq <= player.seq) {
      return { ok: true, ignored: true };
    }
    if (seq > 0) player.seq = seq;

    if (typeof raw.name === 'string' && raw.name) player.name = cleanName(raw.name, player.name);
    const phase = typeof raw.phase === 'string' && raw.phase ? raw.phase : player.phase;
    const nowMs = this.now();
    player.phase = VALID_PHASES.has(phase) ? phase : 'playing';
    player.x = clamp(raw.x, -250000, 250000, player.x);
    player.y = clamp(raw.y, -250000, 250000, player.y);
    player.vx = clamp(raw.vx, -3000, 3000, player.vx);
    player.vy = clamp(raw.vy, -3000, 3000, player.vy);
    player.rot = clamp(raw.rot, -Math.PI * 4, Math.PI * 4, player.rot);
    player.vrot = clamp(raw.vrot, -20, 20, player.vrot);
    player.thrust = Math.floor(clamp(raw.thrust, 0, 15, player.thrust)) & 15;
    player.shields = Math.floor(clamp(raw.shields, 0, 8, player.shields));
    player.hullRatio = round2(clamp(raw.hull_ratio ?? raw.hullRatio, 0, 1, player.hullRatio));
    player.partCount = Math.floor(clamp(raw.part_count ?? raw.partCount, 0, MAX_BLUEPRINT_PARTS, player.partCount));
    player.salvage = Math.floor(clamp(raw.salvage, 0, 1e6, player.salvage));
    player.stateAt = nowMs;

    const blueprint = sanitizeBlueprint(raw.blueprint);
    if (blueprint) {
      player.blueprint = blueprint;
      player.partCount = blueprint.length;
    }

    this.stats.eventsReceived += 1;

    // Direct hit delivery to target captain within AOI
    if (eventType === 'hit') {
      const rawTargetId = raw.target_peer_id ?? raw.targetPeerId;
      const targetId = typeof rawTargetId === 'string' ? rawTargetId : '';
      const target = this.players.get(targetId);
      if (target && target.id !== player.id) {
        const senderPos = { x: player.x, y: player.y };
        const targetPos = this.estimatePosition(target, nowMs);
        if (this.isWithinProximity(senderPos, targetPos, true)) {
          const rawWeaponKind = raw.weapon_kind ?? raw.weaponKind;
          const weaponKind = typeof rawWeaponKind === 'string' && rawWeaponKind ? rawWeaponKind : 'laser';
          this._send(target, {
            type: 'rpc',
            method: 'client_incoming_hit',
            params: {
              fromPeerId: player.id,
              fromName: player.name,
              damage: round2(clamp(raw.damage, 0.5, 120, 7)),
              impact_x: round2(clamp(raw.impact_x ?? raw.impactX, -250000, 250000, targetPos.x)),
              impact_y: round2(clamp(raw.impact_y ?? raw.impactY, -250000, 250000, targetPos.y)),
              weapon_kind: weaponKind.slice(0, 20),
            },
          });
          this.stats.hitsRelayed += 1;
          this.stats.multicastsSent += 1;
        }
      }
      return { ok: true, relayedHit: true };
    }

    const includeBlueprint = eventType === 'join' || eventType === 'ship';
    const basePayload = this._peerEventPayload(player, eventType, includeBlueprint, nowMs);
    if (eventType === 'fire') {
      const shot = sanitizeShot(raw.shot, player.x, player.y);
      if (shot) basePayload.shot = shot;
    } else if (eventType === 'destroy' && Array.isArray(raw.wreck)) {
      basePayload.wreck = raw.wreck.slice(0, 8).map(k => (typeof k === 'string' && VALID_PART_KINDS.has(k)) ? k : 'scrap');
    }

    const senderPos = { x: player.x, y: player.y };
    const presenceChanged = new Set();
    let sentCount = 0;

    for (const [otherId, other] of this.players) {
      if (otherId === playerId) continue;
      const wasNearby = player.nearby.has(otherId);
      const otherPos = this.estimatePosition(other, nowMs);
      const inRange = this.isWithinProximity(senderPos, otherPos, wasNearby);
      const nowNearby = inRange && (wasNearby || (player.nearby.size < this.maxNearbyPeers && other.nearby.size < this.maxNearbyPeers));

      if (nowNearby) {
        const outgoing = (!wasNearby && !basePayload.blueprint && player.blueprint.length > 0)
          ? { ...basePayload, blueprint: player.blueprint }
          : basePayload;
        this._send(other, {
          type: 'rpc',
          method: 'client_multicast_event',
          params: outgoing,
        });
        this.stats.multicastsSent += 1;
        sentCount += 1;
        if (!wasNearby) {
          player.nearby.add(otherId);
          other.nearby.add(playerId);
          presenceChanged.add(playerId);
          presenceChanged.add(otherId);
          this._send(player, {
            type: 'rpc',
            method: 'client_multicast_event',
            params: this._peerEventPayload(other, 'ship', true, nowMs),
          });
          this.stats.multicastsSent += 1;
        }
      } else {
        this.stats.filteredOut += 1;
        if (wasNearby) {
          player.nearby.delete(otherId);
          other.nearby.delete(playerId);
          presenceChanged.add(playerId);
          presenceChanged.add(otherId);
          this._send(other, {
            type: 'rpc',
            method: 'client_peer_removed',
            params: { peerId: playerId },
          });
          this._send(player, {
            type: 'rpc',
            method: 'client_peer_removed',
            params: { peerId: otherId },
          });
        }
      }
    }

    if (eventType === 'join') {
      this.broadcastPresence();
    } else if (presenceChanged.size > 0) {
      this.sendPresenceSubset(presenceChanged);
    }

    return { ok: true, sentCount, nearbyCount: player.nearby.size };
  }

  sendPresenceSubset(ids) {
    const onlineCount = this.players.size;
    for (const id of ids) {
      const p = this.players.get(id);
      if (!p) continue;
      this._send(p, {
        type: 'rpc',
        method: 'client_presence',
        params: { onlineCount, nearbyCount: p.nearby.size },
      });
    }
  }

  broadcastPresence() {
    const onlineCount = this.players.size;
    for (const p of this.players.values()) {
      this._send(p, {
        type: 'rpc',
        method: 'client_presence',
        params: { onlineCount, nearbyCount: p.nearby.size },
      });
    }
  }

  snapshot() {
    const nowMs = this.now();
    const players = [];
    for (const p of this.players.values()) {
      const pos = this.estimatePosition(p, nowMs);
      players.push({
        id: p.id,
        name: p.name,
        x: round2(pos.x),
        y: round2(pos.y),
        vx: round2(p.vx),
        vy: round2(p.vy),
        rot: round2(p.rot),
        thrust: p.thrust,
        shields: p.shields,
        hullRatio: p.hullRatio,
        partCount: p.partCount,
        salvage: p.salvage,
        phase: p.phase,
        nearbyCount: p.nearby.size,
        blueprint: p.blueprint,
      });
    }
    return {
      type: 'state',
      roomId: this.id,
      projectId: this.projectId,
      buildId: this.build?.id || null,
      revision: this.build?.revision ?? null,
      previewUrl: this.build?.previewUrl || null,
      phase: this.phase,
      sectorSeed: this.sectorSeed,
      proximityRadius: this.proximityRadius,
      onlineCount: this.players.size,
      serverTime: nowMs,
      stats: { ...this.stats },
      players,
      logs: this.logs.slice(-40),
    };
  }

  metadata() {
    return {
      id: this.id,
      roomId: this.id,
      projectId: this.projectId,
      buildId: this.build?.id || null,
      revision: this.build?.revision ?? null,
      previewUrl: this.build?.previewUrl || null,
      phase: this.phase,
      sectorSeed: this.sectorSeed,
      proximityRadius: this.proximityRadius,
      onlineCount: this.players.size,
      maxPlayers: MAX_PLAYERS,
    };
  }
}

function attachCaptainForeverMmo(server, options = {}) {
  const originAllowed = options.originAllowed || (() => true);
  const validateBuild = options.validateBuild || (() => null);
  const now = options.now || Date.now;
  const compat = options.compat || null;
  const flushIntervalMs = clamp(options.flushIntervalMs, 10, 500, DEFAULT_FLUSH_INTERVAL_MS);
  const stateIntervalMs = clamp(options.stateIntervalMs, 200, 10000, DEFAULT_STATE_INTERVAL_MS);
  const heartbeatIntervalMs = clamp(options.heartbeatIntervalMs, 1000, 60000, DEFAULT_HEARTBEAT_INTERVAL_MS);
  const joinTimeoutMs = clamp(options.joinTimeoutMs, 50, 60000, DEFAULT_JOIN_TIMEOUT_MS);
  const maxMessagesPerSec = Math.floor(clamp(options.maxMessagesPerSec, 1, 1000, DEFAULT_MAX_MESSAGES_PER_SEC));

  const rooms = new Map();
  const wss = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024 });

  const onUpgrade = (request, socket, head) => {
    let pathname = '';
    try {
      pathname = new URL(request.url || '', 'http://localhost').pathname;
    } catch {
      return;
    }
    if (pathname !== SOCKET_PATH) return;
    if (!originAllowed(request)) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    wss.handleUpgrade(request, socket, head, client => {
      client._compatResult = request.compatResult || null;
      client._ownerKey = request.hubAuth?.accountKey || null;
      wss.emit('connection', client, request);
    });
  };
  server.on('upgrade', onUpgrade);

  function sendJson(ws, payload) {
    if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < MAX_BUFFERED_BYTES) {
      ws.send(JSON.stringify(payload));
    }
  }

  wss.on('connection', (ws, req) => {
    ws.on('error', () => {});
    ws.missedPongs = 0;
    ws.on('pong', () => { ws.missedPongs = 0; });

    if (compat) {
      if (typeof compat.enforceWsConnection === 'function') {
        if (!compat.enforceWsConnection(ws, req, sendJson)) return;
      } else if (ws._compatResult && ws._compatResult.decision === 'BLOCK_FORCE_UPDATE') {
        sendJson(ws, { type: 'error', error: ws._compatResult.message || '업데이트가 필요합니다.', compat: ws._compatResult });
        ws.close(4426, 'Update required');
        return;
      }
    } else if (ws._compatResult && ws._compatResult.decision === 'BLOCK_FORCE_UPDATE') {
      sendJson(ws, { type: 'error', error: ws._compatResult.message || '업데이트가 필요합니다.', compat: ws._compatResult });
      ws.close(4426, 'Update required');
      return;
    }

    let joinedRoom = null;
    let joinedPlayerId = null;
    let joining = false;
    let rpcQueue = [];
    let supportsBatch = false;
    let rateAt = now();
    let msgCount = 0;

    const joinTimeout = setTimeout(() => {
      if (!joinedPlayerId) ws.close(1008, 'Join required');
    }, joinTimeoutMs);
    joinTimeout.unref?.();

    const flushQueue = () => {
      if (!rpcQueue.length || ws.readyState !== WebSocket.OPEN || ws.bufferedAmount >= MAX_BUFFERED_BYTES) {
        rpcQueue = [];
        return;
      }
      if (supportsBatch && rpcQueue.length > 1) {
        sendJson(ws, { type: 'rpc_batch', items: rpcQueue });
      } else {
        for (const item of rpcQueue) sendJson(ws, item);
      }
      rpcQueue = [];
    };

    const queueRpc = message => {
      if (ws.readyState !== WebSocket.OPEN || ws.bufferedAmount >= MAX_BUFFERED_BYTES) return;
      rpcQueue.push(message);
      if (rpcQueue.length > 128) rpcQueue.shift();
    };

    ws._flushRpc = flushQueue;

    ws.on('message', async raw => {
      try {
        const currentNow = now();
        if (currentNow - rateAt > 1000) {
          rateAt = currentNow;
          msgCount = 0;
        }
        if (++msgCount > maxMessagesPerSec) {
          return sendJson(ws, { type: 'error', error: '요청이 너무 빠릅니다.' });
        }

        let msg;
        try {
          const text = typeof raw === 'string' ? raw : Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
          msg = JSON.parse(text);
        } catch {
          return sendJson(ws, { type: 'error', error: 'Invalid JSON' });
        }
        if (!msg || typeof msg !== 'object' || Array.isArray(msg)) {
          return sendJson(ws, { type: 'error', error: 'Invalid message format' });
        }
        if (typeof msg.type !== 'string') {
          return sendJson(ws, { type: 'error', error: 'Invalid message type' });
        }

        if (compat) {
          if (typeof compat.enforceWsMessage === 'function') {
            const compatMsg = (msg.type === 'join' && !msg.compat && msg.client && typeof msg.client === 'object')
              ? { ...msg, compat: msg.client }
              : msg;
            const gate = compat.enforceWsMessage(ws, compatMsg, sendJson);
            if (gate.handled) return;
          } else if (msg.type === 'join' && msg.client && typeof msg.client === 'object' && typeof compat.check === 'function') {
            const check = compat.check(msg.client);
            if (check.decision === 'BLOCK_FORCE_UPDATE') {
              sendJson(ws, { type: 'error', error: check.message, compat: check });
              ws.close(4426, 'Update required');
              return;
            }
          }
        }

        if (msg.type === 'join') {
          if (joinedRoom || joining) {
            return sendJson(ws, { type: 'error', error: '이미 MMO 월드에 참가 중입니다.' });
          }
          supportsBatch = Boolean(msg.supportsBatch);
          let room = null;
          let createdRoom = false;

          if (msg.roomId !== undefined && msg.roomId !== null && msg.roomId !== '') {
            if (typeof msg.roomId !== 'string' || !ROOM_ID.test(msg.roomId)) {
              return sendJson(ws, { type: 'error', error: '잘못된 방 ID입니다.' });
            }
            room = rooms.get(msg.roomId) || null;
            if (!room) {
              return sendJson(ws, { type: 'error', error: '요청한 MMO 섹터 방을 찾을 수 없습니다.' });
            }
          } else {
            if (rooms.size >= MAX_ROOMS) {
              return sendJson(ws, { type: 'error', error: '활성 MMO 방 한도에 도달했습니다.' });
            }
            const projectId = typeof msg.projectId === 'string' ? msg.projectId : '';
            const buildId = typeof msg.buildId === 'string' ? msg.buildId : '';
            if (!PROJECT_ID.test(projectId) || !BUILD_ID.test(buildId)) {
              return sendJson(ws, { type: 'error', error: '유효한 projectId와 buildId가 필요합니다.' });
            }
            joining = true;
            let build;
            try {
              build = await Promise.resolve(validateBuild(buildId, projectId, ws._ownerKey));
            } finally {
              joining = false;
            }
            if (ws.readyState !== WebSocket.OPEN) return;
            if (!build) {
              return sendJson(ws, { type: 'error', error: '검증된 Captain Forever MMO 빌드가 아닙니다.' });
            }
            if (rooms.size >= MAX_ROOMS) {
              return sendJson(ws, { type: 'error', error: '활성 MMO 방 한도에 도달했습니다.' });
            }
            const newId = randomBytes(6).toString('hex');
            room = new CaptainMmoRoom(newId, projectId, build, {
              sectorSeed: msg.sectorSeed,
              proximityRadius: msg.proximityRadius,
            }, now);
            createdRoom = true;
          }

          const joined = room.addPlayer({
            name: msg.name,
            subscribeState: Boolean(msg.subscribeState),
            send: payload => sendJson(ws, payload),
            queueRpc,
          });
          if (!joined.ok) {
            return sendJson(ws, { type: 'error', error: joined.error });
          }
          if (createdRoom) {
            rooms.set(room.id, room);
          }

          joinedRoom = room;
          joinedPlayerId = joined.player.id;
          clearTimeout(joinTimeout);
          sendJson(ws, {
            type: 'welcome',
            roomId: room.id,
            playerId: joinedPlayerId,
            playerName: joined.player.name,
            projectId: room.projectId,
            buildId: room.build?.id || null,
            revision: room.build?.revision ?? null,
            previewUrl: room.build?.previewUrl || null,
            sectorSeed: room.sectorSeed,
            proximityRadius: room.proximityRadius,
            onlineCount: room.players.size,
          });
          if (joined.player.subscribeState) {
            sendJson(ws, room.snapshot());
          }
          return;
        }

        if (!joinedRoom || !joinedPlayerId) {
          return sendJson(ws, { type: 'error', error: '먼저 join 메시지로 입장하세요.' });
        }

        if (msg.type === 'rpc' && msg.method === 'server_player_event') {
          joinedRoom.handlePlayerEvent(joinedPlayerId, msg.params || {});
          return;
        }
        if (msg.type === 'ping') {
          sendJson(ws, { type: 'pong', at: now() });
        }
      } catch (err) {
        sendJson(ws, { type: 'error', error: err?.message || 'Internal message error' });
      }
    });

    ws.on('close', () => {
      clearTimeout(joinTimeout);
      rpcQueue = [];
      if (joinedRoom && joinedPlayerId) {
        joinedRoom.removePlayer(joinedPlayerId);
        if (joinedRoom.players.size === 0) {
          rooms.delete(joinedRoom.id);
        }
      }
      joinedRoom = null;
      joinedPlayerId = null;
    });
  });

  const flushTimer = setInterval(() => {
    for (const client of wss.clients) {
      if (typeof client._flushRpc === 'function') client._flushRpc();
    }
  }, flushIntervalMs);
  flushTimer.unref?.();

  const stateTimer = setInterval(() => {
    for (const room of rooms.values()) {
      let cached = null;
      for (const p of room.players.values()) {
        if (!p.subscribeState) continue;
        if (!cached) cached = room.snapshot();
        p.send(cached);
      }
    }
  }, stateIntervalMs);
  stateTimer.unref?.();

  const heartbeatTimer = setInterval(() => {
    for (const client of wss.clients) {
      if (client.missedPongs >= DEFAULT_MAX_MISSED_PONGS) {
        client.terminate();
        continue;
      }
      client.missedPongs += 1;
      try { client.ping(); } catch { client.terminate(); }
    }
  }, heartbeatIntervalMs);
  heartbeatTimer.unref?.();

  return {
    rooms,
    metadata(roomId) {
      const room = rooms.get(roomId);
      return room ? room.metadata() : null;
    },
    close() {
      clearInterval(flushTimer);
      clearInterval(stateTimer);
      clearInterval(heartbeatTimer);
      server.off('upgrade', onUpgrade);
      for (const client of wss.clients) client.terminate();
      wss.close();
      rooms.clear();
    },
  };
}

module.exports = {
  CaptainMmoRoom,
  attachCaptainForeverMmo,
  SOCKET_PATH,
  DEFAULT_PROXIMITY_RADIUS,
  DEFAULT_LEAVE_HYSTERESIS,
};

if (require.main === module) {
  const http = require('node:http');
  const port = Number(process.env.PLAYHUB_PORT || 0);
  const host = process.env.PLAYHUB_HOST || '127.0.0.1';
  const sid = process.env.PLAYHUB_SESSION_ID || 'captain-mmo-session';
  const room = new CaptainMmoRoom(sid, '0'.repeat(24), { buildId: '0'.repeat(16), revision: 1, previewUrl: '/' }, {}, Date.now);
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16384 });
  const peers = new Map();
  const server = http.createServer((req, res) => {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, gameId: 'captain-forever-mmo', sessionId: sid, players: room.players.size }));
      return;
    }
    res.writeHead(404).end();
  });
  server.on('upgrade', (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, ws => {
      const verifiedName = String(req.headers['x-playhub-display-name'] || '').trim();
      ws.on('message', raw => {
        try {
          const m = JSON.parse(raw.toString('utf8'));
          if (m.type === 'join') {
            if (peers.has(ws)) return;
            const joined = room.join(verifiedName || m.name, { send: payload => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload)); } });
            peers.set(ws, joined.player);
          } else {
            const p = peers.get(ws);
            if (p && m.type === 'rpc') room.handleRpc(p.id, m);
          }
        } catch (err) {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'error', error: err.message }));
        }
      });
      ws.on('close', () => {
        const p = peers.get(ws);
        if (p) { room.leave(p.id); peers.delete(ws); }
      });
    });
  });
  const stop = () => { for (const ws of wss.clients) ws.terminate(); wss.close(); server.close(() => process.exit(0)); };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  server.listen(port, host);
}
