'use strict';

const { randomBytes } = require('node:crypto');
const { WebSocket, WebSocketServer } = require('ws');

const SOCKET_PATH = '/tappy-chicken-mmo';
const PROJECT_ID = /^[a-f0-9]{24}$/;
const BUILD_ID = /^[a-f0-9]{16}$/;
const ROOM_ID = /^[a-f0-9]{12}$/;
const DEFAULT_PROXIMITY_RADIUS = 520;
const DEFAULT_LEAVE_HYSTERESIS = 60;
const MAX_PLAYERS = 64;
const MAX_ROOMS = 64;
const VALID_EVENTS = new Set(['join', 'flap', 'phase', 'sync', 'leave']);
const VALID_PHASES = new Set(['menu', 'ready', 'playing', 'paused', 'crashing', 'over']);

function clamp(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function cleanName(raw, fallback) {
  const text = String(raw || '').trim().replace(/\s+/g, ' ').slice(0, 24);
  return text || fallback;
}

class TappyMmoRoom {
  constructor(id, projectId, build, options = {}, now = Date.now) {
    this.id = id;
    this.projectId = projectId;
    this.build = build || null;
    this.now = now;
    this.phase = 'playing'; // Always live: seamless drop-in (난입) without lobby wait.
    this.courseSeed = Math.floor(clamp(options.courseSeed ?? (10000 + (parseInt(id.slice(0, 6), 16) % 900000)), 1, 999999, 42071));
    this.proximityRadius = clamp(options.proximityRadius, 120, 4000, DEFAULT_PROXIMITY_RADIUS);
    this.leaveHysteresis = clamp(options.leaveHysteresis, 0, 500, DEFAULT_LEAVE_HYSTERESIS);
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
    };
  }

  recordLog(event, message) {
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

  isWithinProximity(distA, distB, wasNearby) {
    const limit = this.proximityRadius + (wasNearby ? this.leaveHysteresis : 0);
    return Math.abs(distA - distB) <= limit;
  }

  _peerEventPayload(player, eventType) {
    return {
      peerId: player.id,
      name: player.name,
      eventType,
      event_type: eventType,
      runDistance: player.runDistance,
      run_distance: player.runDistance,
      y: player.y,
      vy: player.vy,
      angle: player.angle,
      flapTime: player.flapTime,
      flap_time: player.flapTime,
      phase: player.phase,
      score: player.score,
      seq: player.seq,
    };
  }

  _sendTo(player, message) {
    if (typeof player.send === 'function') player.send(message);
  }

  _sendPresence(player) {
    this._sendTo(player, {
      type: 'rpc',
      method: 'client_presence',
      params: {
        onlineCount: this.players.size,
        nearbyCount: player.nearby.size,
      },
    });
  }

  join(rawName, options = {}) {
    if (this.players.size >= MAX_PLAYERS) {
      throw new Error('이 MMO 월드가 가득 찼습니다.');
    }
    const id = 'p-' + randomBytes(6).toString('hex');
    const name = cleanName(rawName, `Player ${this.nextPlayerNum++}`);
    const now = this.now();
    const player = {
      id,
      name,
      runDistance: clamp(options.runDistance, 0, 10000000, 0),
      y: clamp(options.y, 0, 640, 290),
      vy: 0,
      angle: 0,
      flapTime: 0,
      phase: VALID_PHASES.has(options.phase) ? options.phase : 'menu',
      score: 0,
      seq: 0,
      nearby: new Set(),
      joinedAt: now,
      lastSeenAt: now,
      send: typeof options.send === 'function' ? options.send : null,
    };
    this.players.set(id, player);
    this.stats.joins += 1;
    this.recordLog('join', `${name} 난입 (온라인 ${this.players.size}명, 시드 ${this.courseSeed})`);

    const welcome = {
      type: 'welcome',
      roomId: this.id,
      projectId: this.projectId,
      buildId: this.build?.id || null,
      revision: this.build?.revision ?? null,
      previewUrl: this.build?.previewUrl || null,
      playerId: player.id,
      playerName: player.name,
      courseSeed: this.courseSeed,
      proximityRadius: this.proximityRadius,
      onlineCount: this.players.size,
    };
    this._sendTo(player, welcome);

    // Sync immediately with peers already within proximity radius of the drop-in point.
    const joinPayload = this._peerEventPayload(player, 'join');
    for (const other of this.players.values()) {
      if (other.id === player.id) continue;
      if (this.isWithinProximity(player.runDistance, other.runDistance, false)) {
        player.nearby.add(other.id);
        other.nearby.add(player.id);
        this._sendTo(other, { type: 'rpc', method: 'client_multicast_event', params: joinPayload });
        this._sendTo(player, { type: 'rpc', method: 'client_multicast_event', params: this._peerEventPayload(other, 'sync') });
        this.stats.multicastsSent += 2;
      } else {
        this.stats.filteredOut += 1;
      }
    }
    for (const peer of this.players.values()) this._sendPresence(peer);
    return { player, welcome };
  }

  handleRpc(playerId, message) {
    const player = this.players.get(playerId);
    if (!player) throw new Error('참가하지 않은 플레이어입니다.');
    if (!message || typeof message !== 'object' || message.method !== 'server_player_event') {
      throw new Error('지원하지 않는 RPC 메서드입니다.');
    }
    const params = message.params;
    if (!params || typeof params !== 'object' || Array.isArray(params)) {
      throw new Error('RPC 인자가 올바르지 않습니다.');
    }
    const eventType = String(params.eventType ?? params.event_type ?? 'sync');
    if (!VALID_EVENTS.has(eventType)) {
      throw new Error('지원하지 않는 플레이어 이벤트입니다.');
    }
    const seq = Number.isSafeInteger(params.seq) ? params.seq : 0;
    if (eventType !== 'join' && seq > 0 && seq <= player.seq) {
      return { ignored: true, deliveredTo: [], enteredIds: [], leftIds: [], filteredIds: [] };
    }
    if (seq > 0) player.seq = seq;

    if (typeof params.name === 'string' && params.name.trim()) {
      player.name = cleanName(params.name, player.name);
    }
    const rawPhase = String(params.phase ?? player.phase);
    player.phase = VALID_PHASES.has(rawPhase) ? rawPhase : player.phase;
    player.runDistance = clamp(params.runDistance ?? params.run_distance, 0, 10000000, player.runDistance);
    player.y = clamp(params.y, 0, 640, player.y);
    player.vy = clamp(params.vy, -2000, 2000, player.vy);
    player.angle = clamp(params.angle, -Math.PI, Math.PI, player.angle);
    player.flapTime = clamp(params.flapTime ?? params.flap_time, 0, 10, player.flapTime);
    player.score = Math.max(0, Math.floor(clamp(params.score, 0, 999999, player.score)));
    player.lastSeenAt = this.now();

    this.stats.eventsReceived += 1;
    const eventPayload = this._peerEventPayload(player, eventType);
    const deliveredTo = [];
    const enteredIds = [];
    const leftIds = [];
    const filteredIds = [];

    for (const other of this.players.values()) {
      if (other.id === player.id) continue;
      const wasNearby = player.nearby.has(other.id);
      const nowNearby = this.isWithinProximity(player.runDistance, other.runDistance, wasNearby);

      if (nowNearby) {
        this._sendTo(other, { type: 'rpc', method: 'client_multicast_event', params: eventPayload });
        this.stats.multicastsSent += 1;
        deliveredTo.push(other.id);
        if (!wasNearby) {
          player.nearby.add(other.id);
          other.nearby.add(player.id);
          enteredIds.push(other.id);
          // Symmetric AOI entry: also deliver other's current state to sender.
          this._sendTo(player, { type: 'rpc', method: 'client_multicast_event', params: this._peerEventPayload(other, 'sync') });
          this.stats.multicastsSent += 1;
        }
      } else {
        this.stats.filteredOut += 1;
        filteredIds.push(other.id);
        if (wasNearby) {
          player.nearby.delete(other.id);
          other.nearby.delete(player.id);
          leftIds.push(other.id);
          this._sendTo(other, { type: 'rpc', method: 'client_peer_removed', params: { peerId: player.id } });
          this._sendTo(player, { type: 'rpc', method: 'client_peer_removed', params: { peerId: other.id } });
        }
      }
    }

    if (enteredIds.length > 0 || leftIds.length > 0) {
      this._sendPresence(player);
      for (const peerId of [...enteredIds, ...leftIds]) {
        const peer = this.players.get(peerId);
        if (peer) this._sendPresence(peer);
      }
    }

    if (eventType === 'flap' && deliveredTo.length > 0) {
      // Keep event log concise without flooding.
      if (this.stats.eventsReceived <= 12 || this.stats.eventsReceived % 20 === 0) {
        this.recordLog('rpc', `${player.name} flap RPC -> 주변 ${deliveredTo.length}명 멀티캐스트 (범위 밖 ${filteredIds.length}명 제외)`);
      }
    }

    return { ignored: false, deliveredTo, enteredIds, leftIds, filteredIds };
  }

  leave(playerId) {
    const player = this.players.get(playerId);
    if (!player) return [];
    const notified = [];
    this.players.delete(playerId);
    this.stats.leaves += 1;
    for (const otherId of player.nearby) {
      const other = this.players.get(otherId);
      if (!other) continue;
      other.nearby.delete(playerId);
      this._sendTo(other, { type: 'rpc', method: 'client_peer_removed', params: { peerId: playerId } });
      notified.push(otherId);
    }
    this.recordLog('leave', `${player.name} 이탈 (주변 ${notified.length}명에게 정리 RPC 전송)`);
    for (const peer of this.players.values()) this._sendPresence(peer);
    return notified;
  }

  metadata() {
    return {
      roomId: this.id,
      projectId: this.projectId,
      buildId: this.build?.id || null,
      revision: this.build?.revision ?? null,
      previewUrl: this.build?.previewUrl || null,
      phase: this.phase,
      players: this.players.size,
      courseSeed: this.courseSeed,
      proximityRadius: this.proximityRadius,
    };
  }

  snapshot() {
    return {
      type: 'state',
      roomId: this.id,
      projectId: this.projectId,
      buildId: this.build?.id || null,
      revision: this.build?.revision ?? null,
      previewUrl: this.build?.previewUrl || null,
      phase: this.phase,
      serverTime: this.now(),
      courseSeed: this.courseSeed,
      proximityRadius: this.proximityRadius,
      onlineCount: this.players.size,
      stats: { ...this.stats },
      players: [...this.players.values()].map(p => ({
        id: p.id,
        name: p.name,
        runDistance: Math.round(p.runDistance),
        y: Math.round(p.y),
        vy: Math.round(p.vy),
        angle: Number(p.angle.toFixed(3)),
        flapTime: Number(p.flapTime.toFixed(3)),
        phase: p.phase,
        score: p.score,
        nearbyCount: p.nearby.size,
      })),
      logs: this.logs.slice(-40),
    };
  }
}

function attachTappyChickenMmo(
  server,
  {
    originAllowed = () => true,
    now = Date.now,
    validateBuild = () => null,
    compat = null,
    joinTimeoutMs = 5000,
    heartbeatIntervalMs = 2000,
    maxMessagesPerSec = 80,
  } = {},
) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  const rooms = new Map();
  const socketsByRoom = new Map();

  const sendJson = (ws, data) => {
    if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 1000000) {
      ws.send(JSON.stringify(data));
    }
  };

  const broadcastState = room => {
    const encoded = JSON.stringify(room.snapshot());
    for (const ws of socketsByRoom.get(room.id) || []) {
      if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 1000000) ws.send(encoded);
    }
  };

  const cleanupRoom = room => {
    if (room.players.size === 0 && (socketsByRoom.get(room.id)?.size || 0) === 0) {
      rooms.delete(room.id);
      socketsByRoom.delete(room.id);
    }
  };

  const upgrade = (req, socket, head) => {
    let pathname = '';
    try { pathname = new URL(req.url || '', 'http://localhost').pathname; } catch { return; }
    if (pathname !== SOCKET_PATH) return;
    if (!originAllowed(req)) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
  };
  server.on('upgrade', upgrade);

  const stateTimer = setInterval(() => {
    for (const room of rooms.values()) broadcastState(room);
  }, 500);
  stateTimer.unref();

  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (!socket.alive) {
        socket.terminate();
        continue;
      }
      socket.alive = false;
      socket.ping();
    }
  }, heartbeatIntervalMs);
  heartbeat.unref();

  wss.on('connection', (ws, req) => {
    if (compat && !compat.enforceWsConnection(ws, req, sendJson)) return;
    ws.alive = true;
    ws.on('pong', () => { ws.alive = true; });
    let rateAt = now();
    let msgCount = 0;
    let activeRoom = null;
    let activePlayerId = null;
    let joining = false;
    const joinTimeout = setTimeout(() => {
      if (!activePlayerId) ws.close(1008, 'Join required');
    }, joinTimeoutMs);
    joinTimeout.unref();

    ws.on('message', async raw => {
      try {
        const currentNow = now();
        if (currentNow - rateAt > 1000) {
          rateAt = currentNow;
          msgCount = 0;
        }
        if (++msgCount > maxMessagesPerSec) {
          throw new Error('요청이 너무 빠릅니다.');
        }

        let msg;
        try {
          msg = JSON.parse(raw.toString());
          if (!msg || typeof msg !== 'object' || Array.isArray(msg)) throw new Error('잘못된 메시지 형식입니다.');
        } catch {
          sendJson(ws, { type: 'error', error: '올바른 JSON 메시지가 아닙니다.' });
          return;
        }

        if (compat) {
          const gate = compat.enforceWsMessage(ws, msg, sendJson);
          if (gate.handled) return;
        }
        if (msg.type === 'join') {
          if (activeRoom || joining) throw new Error('이미 MMO 월드에 참가 중입니다.');
          let room = null;
          let createdRoom = false;
          if (msg.roomId) {
            if (typeof msg.roomId !== 'string' || !ROOM_ID.test(msg.roomId)) throw new Error('잘못된 방 ID입니다.');
            room = rooms.get(msg.roomId);
            if (!room) throw new Error('해당 Tappy Chicken MMO 월드를 찾을 수 없습니다.');
          } else {
            const projectId = msg.projectId;
            const buildId = msg.buildId;
            if (typeof projectId !== 'string' || !PROJECT_ID.test(projectId)) throw new Error('프로젝트 ID가 올바르지 않습니다.');
            if (typeof buildId !== 'string' || !BUILD_ID.test(buildId)) throw new Error('성공한 프로젝트 빌드가 필요합니다.');
            if (rooms.size >= MAX_ROOMS) throw new Error('활성 MMO 월드가 너무 많습니다.');
            joining = true;
            let build;
            try {
              const checked = validateBuild(buildId, projectId, req.hubAuth?.accountKey);
              build = checked && typeof checked.then === 'function' ? await checked : checked;
            } finally {
              joining = false;
            }
            if (ws.readyState !== WebSocket.OPEN) return;
            if (!build) throw new Error('성공한 프로젝트 빌드가 아닙니다.');
            if (rooms.size >= MAX_ROOMS) throw new Error('활성 MMO 월드가 너무 많습니다.');
            const id = randomBytes(6).toString('hex');
            room = new TappyMmoRoom(id, projectId, build, {
              proximityRadius: msg.proximityRadius,
              courseSeed: msg.courseSeed,
            }, now);
            rooms.set(id, room);
            socketsByRoom.set(id, new Set());
            createdRoom = true;
          }
          let joined;
          try {
            joined = room.join(msg.name, { send: payload => sendJson(ws, payload) });
          } catch (joinError) {
            if (createdRoom) {
              rooms.delete(room.id);
              socketsByRoom.delete(room.id);
            }
            activeRoom = null;
            activePlayerId = null;
            throw joinError;
          }
          socketsByRoom.get(room.id).add(ws);
          activeRoom = room;
          activePlayerId = joined.player.id;
          clearTimeout(joinTimeout);
          broadcastState(room);
          return;
        }

        if (!activeRoom || !activePlayerId) {
          throw new Error('먼저 MMO 월드에 참가해야 합니다.');
        }

        if (msg.type === 'rpc') {
          activeRoom.handleRpc(activePlayerId, msg);
          return;
        }

        throw new Error('지원하지 않는 요청입니다.');
      } catch (error) {
        sendJson(ws, { type: 'error', error: error.message });
      }
    });

    ws.on('close', () => {
      clearTimeout(joinTimeout);
      if (!activeRoom) return;
      socketsByRoom.get(activeRoom.id)?.delete(ws);
      if (activePlayerId) activeRoom.leave(activePlayerId);
      broadcastState(activeRoom);
      cleanupRoom(activeRoom);
      activeRoom = null;
      activePlayerId = null;
    });
  });

  return {
    rooms,
    metadata(roomId) {
      const room = rooms.get(roomId);
      return room ? room.metadata() : null;
    },
    close() {
      clearInterval(stateTimer);
      clearInterval(heartbeat);
      server.off('upgrade', upgrade);
      for (const client of wss.clients) client.terminate();
      wss.close();
      rooms.clear();
      socketsByRoom.clear();
    },
  };
}

module.exports = { TappyMmoRoom, attachTappyChickenMmo, DEFAULT_PROXIMITY_RADIUS, DEFAULT_LEAVE_HYSTERESIS };
