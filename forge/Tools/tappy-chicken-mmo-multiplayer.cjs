'use strict';

// PlayForge PIE WebSocket server for Tappy Chicken MMO.
// Room simulation, compact 5-element tuple codec, and socket flush live in tools/ugc-shared/mmo-room-core.cjs (SSOT).
const { randomBytes } = require('node:crypto');
const { WebSocket, WebSocketServer } = require('ws');
const {
  DEFAULT_PROXIMITY_RADIUS,
  DEFAULT_LEAVE_HYSTERESIS,
  DEFAULT_MAX_NEARBY_GHOSTS,
  DEFAULT_PLAYER_SPEED,
  DEFAULT_FLUSH_INTERVAL_MS,
  DEFAULT_STATE_INTERVAL_MS,
  DEFAULT_HEARTBEAT_INTERVAL_MS,
  DEFAULT_MAX_MISSED_PONGS,
  MAX_OUTBOUND_QUEUE,
  EVENT_TO_CODE,
  CODE_TO_EVENT,
  PHASE_TO_CODE,
  CODE_TO_PHASE,
  round3,
  parseCompactClientEvent,
  flushSocketQueue,
  SpatialMmoRoom,
} = require('../../tools/ugc-shared/mmo-room-core.cjs');

const SOCKET_PATH = '/tappy-chicken-mmo';
const PROJECT_ID = /^[a-f0-9]{24}$/;
const BUILD_ID = /^[a-f0-9]{16}$/;
const ROOM_ID = /^[a-f0-9]{12}$/;
const MAX_ROOMS = 64;

class TappyMmoRoom extends SpatialMmoRoom {
  constructor(id, projectId, build, options = {}, now = Date.now) {
    super(
      id,
      { projectId, build: build || null },
      { ...options, enableLogs: true, includePlatform: false },
      now
    );
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
      maxNearbyGhosts: this.maxNearbyGhosts,
      stats: { ...this.stats },
    };
  }

  snapshot() {
    const nowMs = this.now();
    return {
      type: 'state',
      roomId: this.id,
      projectId: this.projectId,
      buildId: this.build?.id || null,
      revision: this.build?.revision ?? null,
      previewUrl: this.build?.previewUrl || null,
      phase: this.phase,
      serverTime: nowMs,
      courseSeed: this.courseSeed,
      proximityRadius: this.proximityRadius,
      maxNearbyGhosts: this.maxNearbyGhosts,
      onlineCount: this.players.size,
      stats: { ...this.stats },
      players: [...this.players.values()].map(p => ({
        id: p.id,
        shortId: p.shortId,
        name: p.name,
        runDistance: Math.round(this.estimateDistance(p, nowMs)),
        y: Math.round(p.y),
        vy: Math.round(p.vy),
        angle: round3(p.angle),
        flapTime: round3(this.estimateFlapTime(p, nowMs)),
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
    heartbeatIntervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS,
    maxMissedPongs = DEFAULT_MAX_MISSED_PONGS,
    flushIntervalMs = DEFAULT_FLUSH_INTERVAL_MS,
    stateIntervalMs = DEFAULT_STATE_INTERVAL_MS,
    maxNearbyGhosts = DEFAULT_MAX_NEARBY_GHOSTS,
    maxMessagesPerSec = 80,
  } = {},
) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  const rooms = new Map();
  const socketsByRoom = new Map();
  const stateSubscribersByRoom = new Map();
  const pendingStateTimers = new Map();

  const isWsOpen = ws => ws.readyState === WebSocket.OPEN;

  const sendRawNow = (ws, encoded) => {
    if (isWsOpen(ws) && ws.bufferedAmount < 1000000) {
      ws.send(encoded);
    }
  };

  const sendJson = (ws, data) => {
    if (isWsOpen(ws) && ws.bufferedAmount < 1000000) {
      ws.send(JSON.stringify(data));
    }
  };

  const enqueueRaw = (ws, encoded) => {
    if (!isWsOpen(ws) || ws.bufferedAmount >= 1000000) return;
    if (ws.outboundQueue.length >= MAX_OUTBOUND_QUEUE) {
      ws.outboundQueue.shift();
    }
    ws.outboundQueue.push(encoded);
  };

  const enqueueCompactEvent = (ws, encodedTuple) => {
    if (!isWsOpen(ws) || ws.bufferedAmount >= 1000000) return;
    if (ws.compactEvents.length >= MAX_OUTBOUND_QUEUE) {
      ws.compactEvents.shift();
    }
    ws.compactEvents.push(encodedTuple);
  };

  const broadcastState = room => {
    const subscribers = stateSubscribersByRoom.get(room.id);
    if (!subscribers || subscribers.size === 0) return;
    const encoded = JSON.stringify(room.snapshot());
    for (const ws of subscribers) {
      sendRawNow(ws, encoded);
    }
  };

  const scheduleStateBroadcast = room => {
    const subscribers = stateSubscribersByRoom.get(room.id);
    if (!subscribers || subscribers.size === 0) return;
    if (pendingStateTimers.has(room.id)) return;
    const timer = setTimeout(() => {
      pendingStateTimers.delete(room.id);
      if (rooms.has(room.id)) broadcastState(room);
    }, 150);
    timer.unref();
    pendingStateTimers.set(room.id, timer);
  };

  const cleanupRoom = room => {
    if (room.players.size === 0 && (socketsByRoom.get(room.id)?.size || 0) === 0) {
      const pending = pendingStateTimers.get(room.id);
      if (pending) {
        clearTimeout(pending);
        pendingStateTimers.delete(room.id);
      }
      rooms.delete(room.id);
      socketsByRoom.delete(room.id);
      stateSubscribersByRoom.delete(room.id);
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

  const flushTimer = setInterval(() => {
    for (const room of rooms.values()) {
      room.flushPresence();
      const sockets = socketsByRoom.get(room.id);
      if (!sockets) continue;
      for (const ws of sockets) flushSocketQueue(ws, isWsOpen);
    }
  }, flushIntervalMs);
  flushTimer.unref();

  const stateTimer = setInterval(() => {
    for (const room of rooms.values()) broadcastState(room);
  }, stateIntervalMs);
  stateTimer.unref();

  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (socket.missedPongs >= maxMissedPongs) {
        socket.terminate();
        continue;
      }
      socket.missedPongs += 1;
      socket.ping();
    }
  }, heartbeatIntervalMs);
  heartbeat.unref();

  wss.on('connection', (ws, req) => {
    if (compat && !compat.enforceWsConnection(ws, req, sendJson)) return;
    ws.missedPongs = 0;
    ws.supportsBatch = false;
    ws.compact = false;
    ws.subscribeState = false;
    ws.outboundQueue = [];
    ws.pendingPresenceRaw = null;
    ws.compactEvents = [];
    ws.compactRemoved = [];
    ws.compactPresence = null;
    ws.on('pong', () => { ws.missedPongs = 0; });
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
            if (!isWsOpen(ws)) return;
            if (!build) throw new Error('성공한 프로젝트 빌드가 아닙니다.');
            if (rooms.size >= MAX_ROOMS) throw new Error('활성 MMO 월드가 너무 많습니다.');
            const id = randomBytes(6).toString('hex');
            room = new TappyMmoRoom(id, projectId, build, {
              proximityRadius: msg.proximityRadius,
              courseSeed: msg.courseSeed,
              maxNearbyGhosts: msg.maxNearbyGhosts ?? maxNearbyGhosts,
              deferPresence: true,
            }, now);
            rooms.set(id, room);
            socketsByRoom.set(id, new Set());
            stateSubscribersByRoom.set(id, new Set());
            createdRoom = true;
          }
          ws.supportsBatch = Boolean(msg.supportsBatch);
          ws.compact = Boolean(msg.compact);
          ws.subscribeState = Boolean(msg.subscribeState);
          let joined;
          try {
            joined = room.join(msg.name, {
              compact: ws.compact,
              speed: msg.speed,
              sendImmediate: payload => sendJson(ws, payload),
              sendRaw: encoded => enqueueRaw(ws, encoded),
              setPresenceRaw: encoded => { ws.pendingPresenceRaw = encoded; },
              sendCompactEvent: encodedTuple => enqueueCompactEvent(ws, encodedTuple),
              sendCompactRemoved: shortId => {
                if (isWsOpen(ws) && ws.compactRemoved.length < MAX_OUTBOUND_QUEUE) {
                  ws.compactRemoved.push(shortId);
                }
              },
              setCompactPresence: (onlineCount, nearbyCount) => {
                ws.compactPresence = [onlineCount, nearbyCount];
              },
            });
          } catch (joinError) {
            if (createdRoom) {
              rooms.delete(room.id);
              socketsByRoom.delete(room.id);
              stateSubscribersByRoom.delete(room.id);
            }
            activeRoom = null;
            activePlayerId = null;
            throw joinError;
          }
          socketsByRoom.get(room.id).add(ws);
          if (ws.subscribeState) {
            stateSubscribersByRoom.get(room.id).add(ws);
          }
          activeRoom = room;
          activePlayerId = joined.player.id;
          clearTimeout(joinTimeout);
          if (ws.subscribeState) {
            sendRawNow(ws, JSON.stringify(room.snapshot()));
          }
          scheduleStateBroadcast(room);
          return;
        }

        if (!activeRoom || !activePlayerId) {
          throw new Error('먼저 MMO 월드에 참가해야 합니다.');
        }

        if (Array.isArray(msg.e)) {
          activeRoom.handleEvent(activePlayerId, parseCompactClientEvent(msg.e));
          return;
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
      ws.outboundQueue.length = 0;
      ws.pendingPresenceRaw = null;
      ws.compactEvents.length = 0;
      ws.compactRemoved.length = 0;
      ws.compactPresence = null;
      if (!activeRoom) return;
      socketsByRoom.get(activeRoom.id)?.delete(ws);
      stateSubscribersByRoom.get(activeRoom.id)?.delete(ws);
      if (activePlayerId) activeRoom.leave(activePlayerId);
      scheduleStateBroadcast(activeRoom);
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
      clearInterval(flushTimer);
      clearInterval(stateTimer);
      clearInterval(heartbeat);
      for (const timer of pendingStateTimers.values()) clearTimeout(timer);
      pendingStateTimers.clear();
      server.off('upgrade', upgrade);
      for (const client of wss.clients) client.terminate();
      wss.close();
      rooms.clear();
      socketsByRoom.clear();
      stateSubscribersByRoom.clear();
    },
  };
}

module.exports = {
  TappyMmoRoom,
  attachTappyChickenMmo,
  DEFAULT_PROXIMITY_RADIUS,
  DEFAULT_LEAVE_HYSTERESIS,
  DEFAULT_MAX_NEARBY_GHOSTS,
  DEFAULT_PLAYER_SPEED,
  EVENT_TO_CODE,
  CODE_TO_EVENT,
  PHASE_TO_CODE,
  CODE_TO_PHASE,
};
