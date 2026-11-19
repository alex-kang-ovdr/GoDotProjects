'use strict';

const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { WebSocket, WebSocketServer } = require('ws');

const SOCKET_PATH = '/fortress-war';
const PROJECT_ID = /^[a-f0-9]{24}$/;
const BUILD_ID = /^[a-f0-9]{16}$/;
const ROOM_ID = /^[a-f0-9]{12}$/;
const ITEMS = ['repair', 'shield', 'double', 'teleport'];
const TICK_MS = 100;
const CAPACITY = 18;
const COUNTDOWN_MS = 5000;
const CATALOG = require('../Templates/fortress-war/data/catalog.json');
const ENGINE_FILE = path.join(__dirname, 'fortress-engine.cjs');
const ENGINE = new vm.Script(fs.readFileSync(ENGINE_FILE, 'utf8'), { filename: ENGINE_FILE });
const DEFAULT_CONFIG = {
  profile: 'classic',
  map: 'highlands',
  teamSize: 2,
  playerTank: 'catapult',
  opponentTank: 'cannon',
  seed: 123,
  angleProfile: 'jp2003',
};

class RequestError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const isRecord = value => !!value && typeof value === 'object' && !Array.isArray(value);
const isTeam = value => value === 0 || value === 1;
const validId = (pattern, value) => typeof value === 'string' && pattern.test(value);

function readConfig(options = {}, prior = DEFAULT_CONFIG) {
  if (!isRecord(options) || Object.keys(options).some(key => !Object.hasOwn(DEFAULT_CONFIG, key))) {
    throw new RequestError('invalid_config', '지원하지 않는 대전 설정입니다.');
  }
  const config = { ...prior, ...options };
  if (typeof config.profile !== 'string' || !Object.hasOwn(CATALOG.catalogs, config.profile) || !CATALOG.maps.some(map => map.id === config.map) ||
      ![1, 2, 4].includes(config.teamSize) || !Number.isSafeInteger(config.seed) || config.seed < 1 || config.seed > 0xffffffff ||
      typeof config.angleProfile !== 'string' || !Object.hasOwn(CATALOG.aiming.angleProfiles, config.angleProfile)) {
    throw new RequestError('invalid_config', '프로필, 맵, 팀 크기, 시드 또는 각도 자료가 잘못되었습니다.');
  }

  const tanks = CATALOG.catalogs[config.profile];
  for (const [index, key] of ['playerTank', 'opponentTank'].entries()) {
    if (config.profile !== prior.profile && !Object.hasOwn(options, key)) config[key] = tanks[index].id;
    if (!tanks.some(tank => tank.id === config[key])) {
      throw new RequestError('invalid_config', '선택한 규칙에서 사용할 수 없는 탱크입니다.');
    }
  }
  if (config.profile === 'blue3') config.teamSize = 4;
  return config;
}

function makeEngine(config, onEvent) {
  // The packaged engine is the original Fortress War Web engine. Each room
  // runs it with its own global catalog and owns its simulation instance.
  const globals = { FortData: structuredClone(CATALOG) };
  ENGINE.runInNewContext(globals, { timeout: 1000, contextCodeGeneration: { strings: false, wasm: false } });
  return new globals.FortEngine({ ...config, control: 'hotseat', onEvent });
}

function encodeTerrain(terrain) {
  const runs = [];
  const mask = terrain.mask;
  for (let i = 0; i < mask.length;) {
    if (!mask[i]) {
      i++;
      continue;
    }
    const start = i++;
    while (i < mask.length && mask[i]) i++;
    runs.push([start, i - start]);
  }
  return { width: terrain.width, height: terrain.height, version: terrain.version, runs };
}

class FortressRoom {
  constructor(id, projectId, build, options, now = Date.now) {
    this.id = id;
    this.projectId = projectId;
    this.build = build;
    this.config = readConfig(options);
    this.now = now;
    this.players = new Map();
    this.hostId = null;
    this.phase = 'lobby';
    this.countdownEndsAt = null;
    this.engine = null;
    this.terrainCache = null;
    this.lastStep = now();
    this.logs = [];
    this.eventSequence = 0;
  }

  log(event, message, effects = {}) {
    const entry = { seq: ++this.eventSequence, source: 'server', roomId: this.id, event, message, ...effects };
    this.logs.push(entry);
    if (this.logs.length > 48) this.logs.shift();
  }

  controller(team) {
    return Array.from(this.players.values()).find(player => !player.spectator && player.team === team);
  }

  join({ name, team, spectator = false }) {
    if (this.players.size >= CAPACITY) throw new RequestError('room_full', '대전방이 가득 찼습니다.');
    if (typeof spectator !== 'boolean' || (team != null && !isTeam(team))) {
      throw new RequestError('invalid_team', '팀을 선택하세요.');
    }
    const requested = team ?? (!this.controller(0) ? 0 : 1);
    const watching = spectator || !this.waiting() || !!this.controller(requested);
    const label = typeof name === 'string' ? name.replace(/[\p{Cc}\p{Cf}]/gu, '').trim() : '';
    const player = {
      id: randomBytes(10).toString('hex'),
      name: Array.from(label).slice(0, 24).join('') || 'Player',
      team: watching ? null : requested,
      spectator: watching,
      ready: false,
      lastSeq: -1,
      lastMoveAt: null,
    };
    this.players.set(player.id, player);
    this.hostId ??= player.id;
    this.log('join', player.name + ' joined' + (watching ? ' as spectator' : ''));
    this.reconsider();
    return player;
  }

  waiting() {
    return this.phase === 'lobby' || this.phase === 'countdown';
  }

  command(player, message) {
    if (message.type === 'action') return this.action(player, message);
    if (!this.waiting()) throw new RequestError('match_in_progress', '경기 중에는 대기실 설정을 변경할 수 없습니다.');

    switch (message.type) {
      case 'team': {
        if (!isTeam(message.team)) throw new RequestError('invalid_team', '팀을 선택하세요.');
        const occupied = this.controller(message.team);
        if (occupied === player) return;
        if (occupied) throw new RequestError('team_taken', '이미 해당 팀을 조작하는 참가자가 있습니다.');
        player.team = message.team;
        player.spectator = false;
        player.ready = false;
        break;
      }
      case 'spectate':
        player.team = null;
        player.spectator = true;
        player.ready = false;
        break;
      case 'ready':
        if (player.spectator || typeof message.ready !== 'boolean') {
          throw new RequestError('invalid_ready', '팀을 선택한 뒤 준비할 수 있습니다.');
        }
        player.ready = message.ready;
        break;
      case 'config': {
        if (player.id !== this.hostId) throw new RequestError('host_required', '방장만 대전 설정을 변경할 수 있습니다.');
        if (!isRecord(message.options)) throw new RequestError('invalid_config', '잘못된 대전 설정입니다.');
        const config = readConfig(message.options, this.config);
        if (JSON.stringify(config) !== JSON.stringify(this.config)) {
          this.config = config;
          for (const member of this.players.values()) member.ready = false;
          this.log('config', 'Match configuration changed');
        }
        break;
      }
      default:
        throw new RequestError('invalid_message', '지원하지 않는 요청입니다.');
    }
    this.reconsider();
  }

  action(player, message) {
    if (this.phase !== 'playing' || player.spectator || !this.engine.isHumanTurn() || this.engine.active.team !== player.team) {
      throw new RequestError('not_active_team', '현재 턴의 팀만 조작할 수 있습니다.');
    }
    if (!Number.isSafeInteger(message.turnNumber) || message.turnNumber !== this.engine.state.turnNumber) {
      throw new RequestError('stale_turn', '현재 턴 번호와 일치하지 않습니다.');
    }
    if (!Number.isSafeInteger(message.seq) || message.seq <= player.lastSeq) {
      throw new RequestError('stale_sequence', '이미 처리한 입력입니다.');
    }

    const engine = this.engine;
    switch (message.action) {
      case 'aim':
      case 'fire': {
        const { angle, power, face, weaponIndex } = message;
        if ((angle !== undefined && (!Number.isFinite(angle) || angle < -180 || angle > 180)) ||
            (power !== undefined && (!Number.isFinite(power) || power < 0 || power > 100)) ||
            (face !== undefined && face !== -1 && face !== 1) ||
            (weaponIndex !== undefined && (!Number.isInteger(weaponIndex) || weaponIndex < 0 || weaponIndex > 3))) {
          throw new RequestError('invalid_action', '각도, 파워, 방향 또는 무기 입력이 잘못되었습니다.');
        }
        if (weaponIndex !== undefined && !engine.setWeapon(weaponIndex)) {
          throw new RequestError('action_unavailable', '현재 선택할 수 없는 무기입니다.');
        }
        if (angle !== undefined) engine.setAngle(angle);
        if (power !== undefined) engine.setPower(power);
        if (face !== undefined) engine.setFacing(face);
        if (message.action === 'fire' && !engine.fire()) {
          throw new RequestError('action_unavailable', '지금은 발사할 수 없습니다.');
        }
        break;
      }
      case 'move': {
        const { direction, dt } = message;
        if ((direction !== -1 && direction !== 1) || !Number.isFinite(dt) || dt <= 0 || dt > 0.1) {
          throw new RequestError('invalid_action', '잘못된 이동 입력입니다.');
        }
        const now = this.now();
        const elapsed = player.lastMoveAt === null ? 1 / 60 : Math.max(0, (now - player.lastMoveAt) / 1000);
        player.lastMoveAt = now;
        engine.move(direction, Math.min(dt, elapsed));
        break;
      }
      case 'item':
        if (!ITEMS.includes(message.itemId) || !engine.useItem(message.itemId)) {
          throw new RequestError('action_unavailable', '현재 사용할 수 없는 아이템입니다.');
        }
        break;
      case 'skip':
        engine.skip();
        break;
      default:
        throw new RequestError('invalid_action', '지원하지 않는 포격 입력입니다.');
    }
    player.lastSeq = message.seq;
    this.finishIfEnded();
  }

  reconsider() {
    if (!this.waiting()) return;
    const ready = this.controller(0)?.ready && this.controller(1)?.ready;
    if (!ready) {
      this.phase = 'lobby';
      this.countdownEndsAt = null;
    } else if (this.phase !== 'countdown') {
      this.phase = 'countdown';
      this.countdownEndsAt = this.now() + COUNTDOWN_MS;
      this.log('countdown', 'Match countdown started');
    }
  }

  start(now) {
    this.engine = makeEngine(this.config, event => {
      const effects = {};
      for (const key of ['x', 'y', 'radius', 'team', 'tankId', 'shotId', 'volleyId']) {
        if (event[key] !== undefined) effects[key] = event[key];
      }
      this.log(event.type, event.text || '', effects);
    });
    this.phase = 'playing';
    this.countdownEndsAt = null;
    this.lastStep = now;
    this.log('start', 'Match started');
  }

  tick() {
    const now = this.now();
    if (this.phase === 'countdown' && now >= this.countdownEndsAt) this.start(now);
    if (this.phase !== 'playing') return;
    const dt = Math.min(0.25, Math.max(0, (now - this.lastStep) / 1000));
    this.lastStep = now;
    this.engine.tick(dt);
    this.finishIfEnded();
  }

  finishIfEnded() {
    if (this.phase !== 'playing' || this.engine.state.phase !== 'gameover') return;
    this.phase = 'finished';
    this.log('finish', 'Match ended');
  }

  leave(player) {
    if (!this.players.delete(player.id)) return;
    this.log('leave', player.name + ' left');
    if (this.hostId === player.id) {
      this.hostId = (this.controller(0) || this.controller(1) || this.players.values().next().value)?.id ?? null;
    }
    if (this.phase === 'playing' && !player.spectator) {
      const winner = this.controller(1 - player.team)?.team ?? -1;
      Object.assign(this.engine.state, { phase: 'gameover', winner, endReason: 'forfeit' });
      this.log('forfeit', player.name + ' forfeited', { team: winner });
      this.finishIfEnded();
    }
    this.reconsider();
  }

  metadata() {
    return { roomId: this.id, projectId: this.projectId, ...this.build, phase: this.phase, players: this.players.size };
  }

  terrain() {
    if (!this.engine) return null;
    if (this.terrainCache?.version !== this.engine.terrain.version) this.terrainCache = encodeTerrain(this.engine.terrain);
    return this.terrainCache;
  }

  snapshot() {
    const engine = this.engine;
    const game = engine ? {
      ...engine.state,
      tanks: engine.state.tanks.map(({ def, ...tank }) => tank),
      projectiles: engine.state.projectiles.map(({ x, y, vx, vy, radius, kind, team, ownerId, shotId, volleyId, trail }) =>
        ({ x, y, vx, vy, radius, kind, team, ownerId, shotId, volleyId, trail })),
      aiming: engine.getAimingState(),
      actionPreview: engine.getActionPreview(),
      itemsAvailable: ITEMS.filter(item => engine.canUseItem(item)),
      trajectory: engine.getTrajectory(),
    } : null;
    return {
      type: 'state',
      ...this.metadata(),
      serverTime: this.now(),
      countdownEndsAt: this.countdownEndsAt,
      hostId: this.hostId,
      players: Array.from(this.players.values(), ({ id, name, team, ready, spectator }) => ({ id, name, team, ready, spectator })),
      config: this.config,
      game,
      logs: this.logs,
    };
  }
}

function attachFortressWar(server, { originAllowed, validateBuild, now = Date.now }) {
  const rooms = new Map();
  const sessions = new Map();
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
  let closed = false;

  function send(socket, message) {
    if (socket.readyState !== WebSocket.OPEN || socket.bufferedAmount >= 1_000_000) return false;
    socket.send(typeof message === 'string' ? message : JSON.stringify(message));
    return true;
  }

  function sendState(socket, session, state, terrain) {
    if (terrain && session.terrainVersion !== terrain.version) {
      if (send(socket, { ...state, terrain })) session.terrainVersion = terrain.version;
    } else {
      send(socket, state);
    }
  }

  function join(message, ownerKey = null) {
    if (!validId(PROJECT_ID, message.projectId) || !validId(BUILD_ID, message.buildId)) {
      throw new RequestError('invalid_build', '성공한 프로젝트 빌드를 선택하세요.');
    }
    if (message.roomId !== undefined && message.roomId !== null && message.roomId !== '') {
      const room = validId(ROOM_ID, message.roomId) && rooms.get(message.roomId);
      if (!room) throw new RequestError('room_missing', '대전방을 찾을 수 없습니다.');
      if (message.projectId !== room.projectId || message.buildId !== room.build.buildId) {
        throw new RequestError('build_mismatch', '대전방에서 사용하는 빌드 정보가 다릅니다.');
      }
      return room;
    }
    if (rooms.size >= 64) throw new RequestError('room_limit', '현재 대전방이 가득 찼습니다.');
    const build = validateBuild(message.buildId, message.projectId, ownerKey);
    const previewUrl = '/api/builds/' + message.buildId + '/files/index.html';
    if (build?.id !== message.buildId || !Number.isSafeInteger(build.revision) || build.revision < 1 || build.previewUrl !== previewUrl) {
      throw new RequestError('invalid_build', '성공한 프로젝트 빌드를 선택하세요.');
    }
    const pin = { buildId: build.id, revision: build.revision, previewUrl };
    return new FortressRoom(randomBytes(6).toString('hex'), message.projectId, pin, message.options, now);
  }

  const upgrade = (request, socket, head) => {
    if (request.url !== SOCKET_PATH) return;
    if (!originAllowed(request)) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, peer => wss.emit('connection', peer, request));
  };
  server.on('upgrade', upgrade);

  wss.on('connection', (socket, request) => {
    const ownerKey = request?.hubAuth?.accountKey || null;
    socket.alive = true;
    socket.on('pong', () => { socket.alive = true; });
    socket.on('error', () => socket.terminate());
    let rateStart = now();
    let messages = 0;
    const joinTimer = setTimeout(() => {
      if (!sessions.has(socket)) socket.close(1008, 'Join required');
    }, 5000);
    joinTimer.unref();

    socket.on('message', raw => {
      const receivedAt = now();
      if (receivedAt - rateStart >= 1000) {
        rateStart = receivedAt;
        messages = 0;
      }
      if (++messages > 80) {
        socket.close(1008, 'Too many messages');
        return;
      }

      let message;
      try {
        try { message = JSON.parse(raw.toString()); }
        catch { throw new RequestError('invalid_message', '잘못된 메시지입니다.'); }
        if (!isRecord(message)) throw new RequestError('invalid_message', '잘못된 메시지입니다.');
        const session = sessions.get(socket);
        if (message.type === 'join') {
          if (session) throw new RequestError('already_joined', '이미 참가했습니다.');
          const room = join(message, ownerKey);
          const player = room.join(message);
          const joined = { room, player, terrainVersion: null };
          rooms.set(room.id, room);
          sessions.set(socket, joined);
          clearTimeout(joinTimer);
          send(socket, { ...room.metadata(), type: 'welcome', playerId: player.id });
          sendState(socket, joined, room.snapshot(), room.terrain());
        } else {
          if (!session) throw new RequestError('join_required', '먼저 대전방에 참가하세요.');
          session.room.command(session.player, message);
        }
      } catch (error) {
        if (!(error instanceof RequestError)) console.error('Fortress War request failed:', error);
        send(socket, {
          type: 'error',
          code: error instanceof RequestError ? error.code : 'server_error',
          error: error instanceof RequestError ? error.message : '대전 서버에서 요청을 처리하지 못했습니다.',
          ...(Number.isSafeInteger(message?.seq) ? { seq: message.seq } : {}),
        });
      }
    });
    socket.on('close', () => {
      clearTimeout(joinTimer);
      const session = sessions.get(socket);
      if (!session) return;
      const { room, player } = session;
      sessions.delete(socket);
      room.leave(player);
      if (room.players.size === 0) rooms.delete(room.id);
    });
  });

  const timer = setInterval(() => {
    const frames = new Map();
    for (const room of rooms.values()) {
      try {
        room.tick();
        frames.set(room.id, { state: room.snapshot(), terrain: room.terrain() });
      } catch (error) {
        console.error('Fortress War room failed:', error);
        for (const [socket, session] of sessions) {
          if (session.room === room) socket.close(1011, 'Match unavailable');
        }
        rooms.delete(room.id);
      }
    }
    for (const [socket, session] of sessions) {
      const frame = frames.get(session.room.id);
      if (frame) sendState(socket, session, frame.state, frame.terrain);
    }
  }, TICK_MS);
  timer.unref();

  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (!socket.alive) {
        socket.terminate();
        continue;
      }
      socket.alive = false;
      if (socket.readyState === WebSocket.OPEN) socket.ping();
    }
  }, 2000);
  heartbeat.unref();

  return {
    metadata: id => rooms.get(id)?.metadata() ?? null,
    close() {
      if (closed) return;
      closed = true;
      clearInterval(timer);
      clearInterval(heartbeat);
      server.off('upgrade', upgrade);
      for (const socket of wss.clients) socket.terminate();
      wss.close();
      rooms.clear();
      sessions.clear();
    },
  };
}

module.exports = { attachFortressWar, FortressRoom };
