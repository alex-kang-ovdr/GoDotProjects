import { createMap, MAPS, surfaceAt } from './maps.js';
import { clamp, angleDelta, turnTowards, circleTouchesRect, segmentRect, segmentCircle, segmentTank, clearLine } from './geometry.js';
export { clamp, angleDelta, segmentRect, segmentCircle, segmentTank, clearLine } from './geometry.js';

// An original, deliberately compact ruleset. Ten world units equal one game meter.
// There is no networking, external game data, or dependency on a rendering frame rate.
export const TANKS = Object.freeze({
  scout: Object.freeze({ name: 'R-41 정찰형', label: 'R-41', hp: 820, speed: 145, reverse: 74, turnRate: 1.68, turretRate: 2.1, reload: 2.65, damage: 170, penetration: 128, armor: { front: 62, side: 34, rear: 24 }, viewRange: 770, radius: 18, acceleration: 130, caliber: 76, role: '정찰 · 측면 기동' }),
  medium: Object.freeze({ name: 'M-47 기동형', label: 'M-47', hp: 1180, speed: 112, reverse: 55, turnRate: 1.27, turretRate: 1.75, reload: 3.65, damage: 242, penetration: 162, armor: { front: 112, side: 68, rear: 42 }, viewRange: 660, radius: 22, acceleration: 98, caliber: 105, role: '균형 · 기동 전투' }),
  heavy: Object.freeze({ name: 'H-90 중장갑', label: 'H-90', hp: 1650, speed: 82, reverse: 39, turnRate: 0.95, turretRate: 1.25, reload: 4.9, damage: 335, penetration: 198, armor: { front: 168, side: 94, rear: 58 }, viewRange: 590, radius: 25, acceleration: 67, caliber: 122, role: '장갑 · 전선 돌파' }),
});

export const RULES = Object.freeze({ duration: 360, captureRate: 4, spotMemory: 4, proximity: 85, repairCooldown: 30, smokeCooldown: 25, smokeDuration: 7, smokeRadius: 145, orderDuration: 25, focusDuration: 15, engineDamageDuration: 8, ammoRackDamageDuration: 12, projectileSpeed: 1090, maxRange: 1270, ricochetAngle: 70 * Math.PI / 180 });

const emptyStats = () => ({ damage: 0, kills: 0, shots: 0, hits: 0, blocked: 0, assisted: 0, spots: 0, captures: 0, damageReceived: 0, distanceTravelled: 0 });

function random(state) {
  let value = state._rng += 0x6D2B79F5;
  value = Math.imul(value ^ value >>> 15, value | 1);
  value ^= value + Math.imul(value ^ value >>> 7, value | 61);
  return ((value ^ value >>> 14) >>> 0) / 4294967296;
}

function seedNumber(seed) {
  if (Number.isFinite(seed)) return Number(seed) >>> 0;
  let hash = 2166136261;
  for (const character of String(seed)) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}

function event(state, type, details = {}) {
  const item = { id: state._nextEventId++, type, time: state.elapsed, ...details };
  state.events.push(item);
  if (state.events.length > 40) state.events.splice(0, state.events.length - 40);
  return item;
}

function effect(state, type, x, y, life = 0.5, details = {}) {
  state.effects.push({ id: state._nextEffectId++, type, x, y, life, maxLife: life, angle: 0, ...details });
  if (state.effects.length > 140) state.effects.splice(0, state.effects.length - 140);
}

function makeTank(state, type, team, index, isPlayer = false) {
  const config = TANKS[type];
  const startX = team === 0 ? 285 : 2115;
  const positions = [[55, 0], [-10, -255], [-35, 265], [-125, -125], [-130, 130]];
  const [offsetX, offsetY] = positions[index];
  const heading = team === 0 ? 0 : Math.PI;
  const id = isPlayer ? 'player' : team === 0 ? `ally-${index}` : `enemy-${index}`;
  return {
    id, team, isPlayer, type, name: isPlayer ? config.name : `${team === 0 ? '청군' : '적군'} ${index + 1}`,
    x: startX + (team === 0 ? offsetX : -offsetX), y: 800 + offsetY,
    angle: heading, turretAngle: heading, hp: config.hp, maxHp: config.hp, alive: true,
    radius: config.radius, speed: 0, vx: 0, vy: 0, reloadLeft: 0, reloadTime: config.reload, surfaceId: 'plain',
    ammo: 'AP', trackDisabled: 0, repairCooldown: 0, modules: { engine: 0, ammoRack: 0 }, _reloadMultiplier: 1,
    smokeCharges: 2, smokeCooldown: 0, stats: emptyStats(), visibleToPlayer: team === 0,
    spotted: false, lastSeen: null, visibleUntil: [team === 0 ? Infinity : -1, team === 1 ? Infinity : -1],
    revealUntil: -1, dispersion: 0.006, _bloom: 0, _lane: [800, state.map.lanes?.[0] ?? 420, state.map.lanes?.[2] ?? 1180, 650, 980][index],
    _routeIndex: 0, _path: [], _pathNext: 0, _goal: null, _decisionAt: 0,
    _control: {}, _targetId: null, _reactionAt: 0, _aimError: 0,
    _stuckAt: 0, _stuckX: startX, _stuckY: 800 + offsetY, _reverseUntil: 0,
    _avoidSign: index % 2 ? 1 : -1, _spotNoticeAt: -10, _capturePoints: {},
    _seenByTeam: [false, false], _spotters: [[], []], _lastSpotters: [[], []], _lastSpotterUntil: [0, 0],
    _lastDamageFrom: null, _coverGoal: null, _coverUntil: 0,
    _fireLaneGoal: null, _fireLaneUntil: 0, _blockedFireSince: null,
  };
}

export function createBattle({ tankClass = 'medium', difficulty = 'normal', seed = 42, mapId = 'valley', mode = 'standard', battleId = null } = {}) {
  if (!Object.hasOwn(TANKS, tankClass)) tankClass = 'medium';
  if (!['easy', 'normal', 'hard'].includes(difficulty)) difficulty = 'normal';
  const training = mode === 'training' || mapId === 'training';
  mode = training ? 'training' : 'standard';
  mapId = training ? 'training' : Object.hasOwn(MAPS, mapId) && mapId !== 'training' ? mapId : 'valley';
  const state = {
    phase: 'playing', paused: false, winner: null, resultReason: '', elapsed: 0, timeRemaining: RULES.duration,
    duration: RULES.duration, difficulty, seed, mode, mapId, battleId: battleId || `${mapId}:${mode}:${seedNumber(seed)}`,
    playerId: 'player', spectateId: null, aiEnabled: !training, order: null, lockTargetId: null, focusTarget: null,
    map: createMap(mapId), bases: training ? [] : [
      { team: 0, x: 240, y: 800, r: 125, capture: 0, contested: false, capturingTeam: null, _contributors: {} },
      { team: 1, x: 2160, y: 800, r: 125, capture: 0, contested: false, capturingTeam: null, _contributors: {} },
    ],
    tanks: [], projectiles: [], effects: [], events: [], smokeClouds: [], statistics: emptyStats(),
    _rng: seedNumber(seed), _nextEventId: 1, _nextEffectId: 1, _nextProjectileId: 1, _nextSmokeId: 1,
    _visionTimer: 0.2, _navVersion: -1, _nav: {},
  };
  const roster = [tankClass, 'scout', 'medium', 'heavy', 'medium'];
  if (training) {
    const player = makeTank(state, tankClass, 0, 0, true);
    Object.assign(player, state.map.trainingSpawn || { x: 400, y: 800, angle: 0 });
    player.turretAngle = player.angle;
    state.tanks.push(player);
    for (const [index, descriptor] of state.map.trainingTargets.entries()) {
      const target = makeTank(state, descriptor.type, 1, index);
      Object.assign(target, { x: descriptor.x, y: descriptor.y, angle: descriptor.angle, turretAngle: descriptor.angle, name: descriptor.label, trainingTarget: true });
      state.tanks.push(target);
    }
  } else {
    // Both sides receive the same roster. Difficulty alters decisions, never vehicle health.
    for (let index = 0; index < 5; index++) state.tanks.push(makeTank(state, roster[index], 0, index, index === 0));
    for (let index = 0; index < 5; index++) state.tanks.push(makeTank(state, roster[index], 1, index));
  }
  for (const tank of state.tanks) tank.surfaceId = surfaceAt(state.map, tank.x, tank.y).id;
  state.statistics = getPlayer(state).stats;
  updateVisibility(state);
  return state;
}

export const getPlayer = state => state?.tanks?.find(tank => tank.id === state.playerId);

function visibleEnemy(state, targetId) {
  const player = getPlayer(state);
  if (!player?.alive || state.phase !== 'playing') return null;
  const target = state.tanks.find(tank => tank.id === targetId);
  return target?.alive && target.team !== player.team && target.visibleToPlayer && target.visibleUntil[player.team] >= state.elapsed ? target : null;
}

function lockCandidate(state, targetId) {
  const target = visibleEnemy(state, targetId);
  const player = getPlayer(state);
  return target && Math.hypot(target.x - player.x, target.y - player.y) <= RULES.maxRange ? target : null;
}

export function getLockedTarget(state) {
  return state?.lockTargetId ? lockCandidate(state, state.lockTargetId) : null;
}

export function setTargetLock(state, targetId) {
  if (!state) return false;
  if (targetId === null) {
    if (state.lockTargetId) event(state, 'lock', { actor: state.playerId, target: null, team: 0, visibleToPlayer: true, text: '표적 고정 해제' });
    state.lockTargetId = null;
    return true;
  }
  if (state.phase !== 'playing' || state.paused) return false;
  const target = lockCandidate(state, targetId);
  if (!target) return false;
  state.lockTargetId = target.id;
  event(state, 'lock', { actor: state.playerId, target: target.id, team: 0, visibleToPlayer: true, text: `${target.name} · 표적 고정` });
  return true;
}

export function acquireTarget(state, aimX, aimY) {
  const player = getPlayer(state);
  if (!player?.alive || !Number.isFinite(aimX) || !Number.isFinite(aimY) || Math.hypot(aimX - player.x, aimY - player.y) < 1) return null;
  const bearing = Math.atan2(aimY - player.y, aimX - player.x);
  let selected = null, selectedScore = Infinity;
  for (const tank of state.tanks) {
    if (!lockCandidate(state, tank.id)) continue;
    const cursorDistance = Math.hypot(tank.x - aimX, tank.y - aimY);
    const angularDistance = Math.abs(angleDelta(Math.atan2(tank.y - player.y, tank.x - player.x), bearing));
    const underCursor = cursorDistance <= Math.max(65, tank.radius * 2.6);
    if (!underCursor && angularDistance > .28) continue;
    const score = angularDistance * 900 + cursorDistance * .18 + (underCursor ? -400 : 0);
    if (score < selectedScore) { selected = tank; selectedScore = score; }
  }
  return selected;
}

export function issueFocusFire(state, targetId) {
  if (!state || state.phase !== 'playing' || state.paused || state.mode === 'training') return false;
  const target = visibleEnemy(state, targetId);
  if (!target) return false;
  state.focusTarget = { targetId: target.id, until: state.elapsed + RULES.focusDuration };
  for (const tank of state.tanks) if (tank.team === 0 && !tank.isPlayer) tank._decisionAt = 0;
  event(state, 'focus', { actor: state.playerId, target: target.id, team: 0, visibleToPlayer: true, text: `${target.name} · 집중 사격` });
  return true;
}

function refreshTargeting(state) {
  if (state.lockTargetId && !getLockedTarget(state)) state.lockTargetId = null;
  if (state.focusTarget && (state.focusTarget.until <= state.elapsed || !visibleEnemy(state, state.focusTarget.targetId))) {
    state.focusTarget = null;
    for (const tank of state.tanks) if (tank.team === 0 && !tank.isPlayer) tank._decisionAt = 0;
  }
}

function syncReloadMultiplier(tank) {
  const desired = tank.modules.ammoRack > 0 ? 1.6 : 1;
  const previous = tank._reloadMultiplier || 1;
  if (desired !== previous) tank.reloadLeft = Math.max(0, tank.reloadLeft / previous * desired);
  tank._reloadMultiplier = desired;
  tank.reloadTime = TANKS[tank.type].reload * desired;
}

function damageModule(tank, type, duration) {
  tank.modules[type] = Math.max(tank.modules[type], duration);
  if (type === 'ammoRack') syncReloadMultiplier(tank);
}

export function deploySmoke(state, tank = getPlayer(state)) {
  if (!state || state.phase !== 'playing' || state.paused || !tank?.alive || !state.tanks.includes(tank) || tank.smokeCharges <= 0 || tank.smokeCooldown > 0) return false;
  tank.smokeCharges--;
  tank.smokeCooldown = RULES.smokeCooldown;
  const cloud = { id: `smoke-${state._nextSmokeId++}`, x: tank.x, y: tank.y, radius: RULES.smokeRadius,
    remaining: RULES.smokeDuration, duration: RULES.smokeDuration, team: tank.team, ownerId: tank.id,
    visibleToPlayer: tank.team === 0 || tank.visibleToPlayer };
  state.smokeClouds.push(cloud);
  state._visionTimer = 0.2;
  event(state, 'smoke', { actor: tank.id, team: tank.team, x: tank.x, y: tank.y, text: `${tank.name} · 연막 전개` });
  return true;
}

export function issueOrder(state, type, details = {}) {
  if (!state || state.phase !== 'playing' || state.paused || state.mode === 'training' || !getPlayer(state)?.alive || !['attack', 'defend', 'follow', 'move'].includes(type)) return false;
  let point = null;
  if (type === 'move') {
    if (!Number.isFinite(details?.x) || !Number.isFinite(details?.y)) return false;
    point = resolveMovePoint(state, details.x, details.y);
    if (!point) return false;
  }
  state.order = { type, ...(point || {}), until: state.elapsed + RULES.orderDuration };
  for (const tank of state.tanks) if (tank.team === 0 && !tank.isPlayer) {
    tank._decisionAt = 0; tank._pathNext = 0; tank._coverGoal = null; tank._fireLaneGoal = null;
  }
  const text = { attack: '분대 명령 · 적 기지로 진격', defend: '분대 명령 · 아군 기지 방어', follow: '분대 명령 · 전차장 지원', move: '분대 명령 · 지정 지점으로 이동' }[type];
  event(state, 'order', { actor: state.playerId, team: 0, ...(point || {}), text });
  return true;
}

function smokeBlocks(state, observer, target) {
  if (Math.hypot(observer.x - target.x, observer.y - target.y) <= RULES.proximity) return false;
  return state.smokeClouds.some(cloud => cloud.remaining > 0 && segmentCircle(observer.x, observer.y, target.x, target.y, cloud));
}

// The angle is the projectile's direction of travel, not the direction to its shooter.
// Passing the actual hull face matters: a shallow side hit can ricochet even when the
// target's front face would have presented a low impact angle.
export function armorAtAngle(tank, projectileAngle, zone = null) {
  const config = TANKS[tank.type] || TANKS.medium;
  const armor = tank.armor || config.armor;
  const bearing = angleDelta(projectileAngle + Math.PI, tank.angle || 0);
  const magnitude = Math.abs(bearing);
  if (!zone) zone = magnitude <= Math.PI / 4 ? 'front' : magnitude >= Math.PI * 3 / 4 ? 'rear' : 'side';
  const normal = zone === 'front' ? 0 : zone === 'rear' ? Math.PI : (bearing < 0 ? -1 : 1) * Math.PI / 2;
  const incidence = Math.min(Math.PI / 2, Math.abs(angleDelta(bearing, normal)));
  const nominal = armor[zone] ?? armor.side;
  return { zone, nominal, effective: nominal / Math.max(0.04, Math.cos(incidence)), incidence, ricochet: incidence >= RULES.ricochetAngle };
}

function routeClear(map, x1, y1, x2, y2, radius) {
  for (const obstacle of map.obstacles) {
    if (obstacle.destroyed) continue;
    const expanded = { x: obstacle.x - radius, y: obstacle.y - radius, w: obstacle.w + radius * 2, h: obstacle.h + radius * 2 };
    if (segmentRect(x1, y1, x2, y2, expanded)) return false;
  }
  return true;
}

function navigationGrid(state, type) {
  if (state._navVersion !== state.map.version) { state._nav = {}; state._navVersion = state.map.version; }
  if (state._nav[type]) return state._nav[type];
  const cell = 64;
  const cols = Math.ceil(state.map.width / cell);
  const rows = Math.ceil(state.map.height / cell);
  const radius = TANKS[type].radius + 15;
  const blocked = new Uint8Array(cols * rows);
  const travelCost = new Float32Array(cols * rows);
  let minimumCost = 1;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const px = (x + 0.5) * cell;
    const py = (y + 0.5) * cell;
    travelCost[y * cols + x] = 1 / surfaceAt(state.map, px, py).speedMultiplier;
    minimumCost = Math.min(minimumCost, travelCost[y * cols + x]);
    if (px < radius || py < radius || px > state.map.width - radius || py > state.map.height - radius || state.map.obstacles.some(item => !item.destroyed && circleTouchesRect(px, py, radius, item))) blocked[y * cols + x] = 1;
  }
  return state._nav[type] = { cell, cols, rows, blocked, travelCost, minimumCost };
}

function nearestCell(grid, x, y) {
  const cx = clamp(Math.floor(x / grid.cell), 0, grid.cols - 1);
  const cy = clamp(Math.floor(y / grid.cell), 0, grid.rows - 1);
  if (!grid.blocked[cy * grid.cols + cx]) return cy * grid.cols + cx;
  for (let range = 1; range < 9; range++) {
    let best = -1;
    let bestDistance = Infinity;
    for (let dy = -range; dy <= range; dy++) for (let dx = -range; dx <= range; dx++) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= grid.cols || ny >= grid.rows || grid.blocked[ny * grid.cols + nx]) continue;
      const d = ((nx + 0.5) * grid.cell - x) ** 2 + ((ny + 0.5) * grid.cell - y) ** 2;
      if (d < bestDistance) { best = ny * grid.cols + nx; bestDistance = d; }
    }
    if (best >= 0) return best;
  }
  return cy * grid.cols + cx;
}

function resolveMovePoint(state, x, y) {
  // Orders must fit every class, including the heavy tank's navigation margin.
  const radius = TANKS.heavy.radius + 15;
  const point = { x: clamp(x, radius + 6, state.map.width - radius - 6), y: clamp(y, radius + 6, state.map.height - radius - 6) };
  if (canOccupy(state, { radius }, point.x, point.y)) return point;
  const grid = navigationGrid(state, 'heavy');
  const index = nearestCell(grid, point.x, point.y);
  if (grid.blocked[index]) return null;
  const resolved = { x: (index % grid.cols + .5) * grid.cell, y: (Math.floor(index / grid.cols) + .5) * grid.cell };
  return Math.hypot(resolved.x - point.x, resolved.y - point.y) <= 320 && canOccupy(state, { radius }, resolved.x, resolved.y) ? resolved : null;
}

function terrainTravelCost(map, start, end) {
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  const samples = Math.max(1, Math.ceil(distance / 32));
  let cost = 0;
  for (let i = 0; i < samples; i++) {
    const fraction = (i + .5) / samples;
    cost += distance / samples / surfaceAt(map, start.x + (end.x - start.x) * fraction, start.y + (end.y - start.y) * fraction).speedMultiplier;
  }
  return cost;
}

function heapPush(heap, item) {
  let index = heap.length;
  heap.push(item);
  while (index > 0) {
    const parent = (index - 1) >> 1;
    if (heap[parent].f <= item.f) break;
    heap[index] = heap[parent]; index = parent;
  }
  heap[index] = item;
}

function heapPop(heap) {
  const first = heap[0];
  const last = heap.pop();
  if (heap.length) {
    let index = 0;
    while (index * 2 + 1 < heap.length) {
      let child = index * 2 + 1;
      if (child + 1 < heap.length && heap[child + 1].f < heap[child].f) child++;
      if (heap[child].f >= last.f) break;
      heap[index] = heap[child]; index = child;
    }
    heap[index] = last;
  }
  return first;
}

function findPath(state, tank, goal) {
  const grid = navigationGrid(state, tank.type);
  const start = nearestCell(grid, tank.x, tank.y);
  const end = nearestCell(grid, goal.x, goal.y);
  if (start === end) return [{ x: goal.x, y: goal.y }];
  const total = grid.cols * grid.rows;
  const cost = new Float64Array(total).fill(Infinity);
  const previous = new Int32Array(total).fill(-1);
  const closed = new Uint8Array(total);
  const heap = [];
  const endX = end % grid.cols;
  const endY = Math.floor(end / grid.cols);
  cost[start] = 0;
  heapPush(heap, { index: start, f: 0 });
  while (heap.length) {
    const current = heapPop(heap).index;
    if (closed[current]) continue;
    if (current === end) break;
    closed[current] = 1;
    const x = current % grid.cols;
    const y = Math.floor(current / grid.cols);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= grid.cols || ny >= grid.rows) continue;
      const next = ny * grid.cols + nx;
      if (grid.blocked[next] || closed[next]) continue;
      if (dx && dy && (grid.blocked[y * grid.cols + nx] || grid.blocked[ny * grid.cols + x])) continue;
      const nextCost = cost[current] + (dx && dy ? 1.41421356 : 1) * (grid.travelCost[current] + grid.travelCost[next]) / 2;
      if (nextCost >= cost[next]) continue;
      cost[next] = nextCost;
      previous[next] = current;
      heapPush(heap, { index: next, f: nextCost + Math.hypot(nx - endX, ny - endY) * grid.minimumCost });
    }
  }
  if (previous[end] < 0) return [{ x: goal.x, y: goal.y }];
  const path = [];
  let current = end;
  while (current !== start && current >= 0) {
    path.push({ x: (current % grid.cols + 0.5) * grid.cell, y: (Math.floor(current / grid.cols) + 0.5) * grid.cell });
    current = previous[current];
  }
  path.reverse();
  const result = [];
  let anchor = { x: tank.x, y: tank.y };
  while (path.length) {
    let furthest = 0;
    let pathCost = terrainTravelCost(state.map, anchor, path[0]);
    for (let i = 1; i < path.length; i++) {
      if (!routeClear(state.map, anchor.x, anchor.y, path[i].x, path[i].y, tank.radius + 7)) break;
      pathCost += terrainTravelCost(state.map, path[i - 1], path[i]);
      if (terrainTravelCost(state.map, anchor, path[i]) > pathCost * 1.03) break;
      furthest = i;
    }
    anchor = path[furthest]; result.push(anchor); path.splice(0, furthest + 1);
  }
  if (routeClear(state.map, anchor.x, anchor.y, goal.x, goal.y, tank.radius + 7)) result.push({ x: goal.x, y: goal.y });
  return result;
}

function driveTo(state, tank, goal) {
  const config = TANKS[tank.type];
  let waypoint = goal;
  if (!routeClear(state.map, tank.x, tank.y, goal.x, goal.y, config.radius + 8)) {
    const movedGoal = !tank._goal || Math.hypot(tank._goal.x - goal.x, tank._goal.y - goal.y) > 125;
    if (state.elapsed >= tank._pathNext || movedGoal || !tank._path.length) {
      tank._path = findPath(state, tank, goal);
      tank._pathNext = state.elapsed + 1.3 + random(state) * 0.5;
      tank._goal = { ...goal };
    }
    while (tank._path.length > 1 && Math.hypot(tank._path[0].x - tank.x, tank._path[0].y - tank.y) < 34) tank._path.shift();
    if (tank._path.length) waypoint = tank._path[0];
  } else {
    tank._path = [];
  }
  const angle = Math.atan2(waypoint.y - tank.y, waypoint.x - tank.x);
  const difference = angleDelta(angle, tank.angle);
  const distance = Math.hypot(waypoint.x - tank.x, waypoint.y - tank.y);
  return { throttle: distance < 20 ? 0 : Math.abs(difference) < 0.8 ? 1 : Math.abs(difference) < 1.45 ? 0.28 : 0, steer: clamp(difference * 2.1, -1, 1) };
}

function coverPosition(state, tank, target) {
  if (tank._coverGoal && state.elapsed < tank._coverUntil && canOccupy(state, tank, tank._coverGoal.x, tank._coverGoal.y) && Number.isFinite(formationCrowding(state, tank, tank._coverGoal))) return tank._coverGoal;
  let best = null, bestScore = Infinity;
  for (const obstacle of state.map.obstacles) {
    if (obstacle.destroyed || obstacle.type === 'wall') continue;
    const cx = obstacle.x + obstacle.w / 2, cy = obstacle.y + obstacle.h / 2;
    if (Math.hypot(cx - tank.x, cy - tank.y) > 290) continue;
    const away = Math.atan2(cy - target.y, cx - target.x);
    const clearance = Math.max(obstacle.w, obstacle.h) * .65 + tank.radius + 22;
    const point = { x: cx + Math.cos(away) * clearance, y: cy + Math.sin(away) * clearance };
    if (!canOccupy(state, tank, point.x, point.y) || clearLine(state.map, point.x, point.y, target.x, target.y)) continue;
    const travel = Math.hypot(point.x - tank.x, point.y - tank.y);
    if (travel > 280 || Math.hypot(point.x - target.x, point.y - target.y) < 170) continue;
    const score = travel + formationCrowding(state, tank, point) + (routeClear(state.map, tank.x, tank.y, point.x, point.y, tank.radius + 5) ? 0 : 100);
    if (score < bestScore) { best = point; bestScore = score; }
  }
  tank._coverGoal = best; tank._coverUntil = state.elapsed + 1.4;
  return best;
}

function formationCrowding(state, tank, point) {
  let penalty = 0;
  for (const ally of state.tanks) {
    if (!ally.alive || ally === tank || ally.team !== tank.team) continue;
    const distance = Math.hypot(point.x - ally.x, point.y - ally.y);
    if (distance < tank.radius + ally.radius + 12) return Infinity;
    penalty += Math.max(0, 130 - distance) * 1.5;
    if (ally._coverGoal) penalty += Math.max(0, 100 - Math.hypot(point.x - ally._coverGoal.x, point.y - ally._coverGoal.y));
  }
  return penalty;
}

function friendlyBlocksShot(state, tank, target, origin = tank) {
  return state.tanks.some(ally => ally.alive && ally.team === tank.team && ally !== tank && segmentCircle(origin.x, origin.y, target.x, target.y, { x: ally.x, y: ally.y, r: ally.radius + 7 }));
}

function firingLanePosition(state, tank, target) {
  const usable = point => canOccupy(state, tank, point.x, point.y)
    && Number.isFinite(formationCrowding(state, tank, point))
    && routeClear(state.map, tank.x, tank.y, point.x, point.y, tank.radius + 5)
    && clearLine(state.map, point.x, point.y, target.x, target.y)
    && !smokeBlocks(state, point, target) && !friendlyBlocksShot(state, tank, target, point);
  if (tank._fireLaneGoal && state.elapsed < tank._fireLaneUntil && usable(tank._fireLaneGoal)) return tank._fireLaneGoal;
  const bearing = Math.atan2(target.y - tank.y, target.x - tank.x);
  let best = null, bestScore = Infinity;
  for (const distance of [75, 120, 180]) for (const sign of [tank._avoidSign, -tank._avoidSign]) {
    const point = { x: tank.x - Math.sin(bearing) * distance * sign - Math.cos(bearing) * 20,
      y: tank.y + Math.cos(bearing) * distance * sign - Math.sin(bearing) * 20 };
    if (!usable(point)) continue;
    const score = distance + formationCrowding(state, tank, point) + (sign === tank._avoidSign ? 0 : 8);
    if (score < bestScore) { best = point; bestScore = score; }
  }
  tank._fireLaneGoal = best; tank._fireLaneUntil = state.elapsed + 1.8;
  return best;
}

function aiControl(state, tank) {
  if (state.elapsed < tank._decisionAt) return tank._control;
  tank._decisionAt = state.elapsed + 0.12;
  const enemyTeam = 1 - tank.team;
  const ownBase = state.bases.find(base => base.team === tank.team);
  const enemyBase = state.bases.find(base => base.team === enemyTeam);
  const focusId = tank.team === 0 && state.focusTarget?.until > state.elapsed ? state.focusTarget.targetId : null;
  let target = null, targetScore = Infinity;
  for (const enemy of state.tanks) {
    if (!enemy.alive || enemy.team !== enemyTeam || enemy.visibleUntil[tank.team] < state.elapsed) continue;
    const distance = Math.hypot(enemy.x - tank.x, enemy.y - tank.y);
    const line = clearLine(state.map, tank.x, tank.y, enemy.x, enemy.y) && !smokeBlocks(state, tank, enemy);
    const score = distance + (line ? 0 : 240) + (enemy.id === tank._targetId ? -65 : 0) - (enemy.hp < TANKS[tank.type].damage ? 90 : 0) - (enemy.id === focusId ? 10000 : 0);
    if (score < targetScore) { target = enemy; targetScore = score; }
  }
  const difficulty = tank.team === 0 ? 'normal' : state.difficulty;
  const reaction = difficulty === 'easy' ? 0.9 : difficulty === 'hard' ? 0.25 : 0.55;
  const inaccuracy = difficulty === 'easy' ? 0.072 : difficulty === 'hard' ? 0.022 : 0.043;
  const damaged = tank.trackDisabled > 0 || tank.modules.engine > 0 || tank.modules.ammoRack > 0;
  const recentHit = Number.isFinite(tank.lastHitAt) && state.elapsed - tank.lastHitAt < 2.2;
  let control = { throttle: 0, steer: 0, fire: false, ammo: 'AP', repair: damaged,
    smoke: tank.hp / tank.maxHp < .32 && recentHit && tank.spotted && (tank.reloadLeft > 1 || damaged) };
  let fireLane = null;
  if (target) {
    if (tank._targetId !== target.id) {
      tank._targetId = target.id;
      tank._reactionAt = state.elapsed + reaction + random(state) * reaction;
      tank._aimError = (random(state) - 0.5) * inaccuracy * 2;
      tank._coverGoal = null;
      tank._fireLaneGoal = null; tank._blockedFireSince = null;
    }
    const distance = Math.hypot(target.x - tank.x, target.y - tank.y);
    const timeToTarget = distance / RULES.projectileSpeed;
    const aimX = target.x + (target.vx || 0) * timeToTarget * 0.72;
    const aimY = target.y + (target.vy || 0) * timeToTarget * 0.72;
    const targetAngle = Math.atan2(aimY - tank.y, aimX - tank.x) + tank._aimError;
    control.aimX = tank.x + Math.cos(targetAngle) * distance;
    control.aimY = tank.y + Math.sin(targetAngle) * distance;
    const lineOfFire = clearLine(state.map, tank.x, tank.y, target.x, target.y) && !smokeBlocks(state, tank, target);
    const preferredRange = tank.type === 'scout' ? 425 : tank.type === 'heavy' ? 330 : 410;
    const angleAtTarget = Math.abs(angleDelta(Math.atan2(tank.y - target.y, tank.x - target.x), target.angle));
    const flank = tank.type === 'scout' && distance < 640 && distance > 210 && angleAtTarget < 1.05 && tank.hp > tank.maxHp * .35;
    const retreat = tank.type !== 'heavy' && (tank.reloadLeft > 1.2 || tank.hp < tank.maxHp * .3) && distance < 620;
    const cover = retreat ? coverPosition(state, tank, target) : null;
    if (cover && Math.hypot(cover.x - tank.x, cover.y - tank.y) > 25) {
      Object.assign(control, driveTo(state, tank, cover));
    } else if (cover && !lineOfFire) {
      control.throttle = 0;
      control.steer = clamp(angleDelta(Math.atan2(target.y - tank.y, target.x - tank.x), tank.angle) * 2, -1, 1);
    } else if (flank) {
      const side = target.angle + tank._avoidSign * Math.PI / 2;
      const point = { x: clamp(target.x + Math.cos(side) * 260, 80, state.map.width - 80), y: clamp(target.y + Math.sin(side) * 260, 80, state.map.height - 80) };
      Object.assign(control, driveTo(state, tank, point));
    } else if (lineOfFire && distance < preferredRange + 100) {
      control.steer = clamp(angleDelta(Math.atan2(target.y - tank.y, target.x - tank.x), tank.angle) * 2, -1, 1);
      control.throttle = distance < 205 ? -0.5 : tank.type === 'heavy' && distance > 380 && tank.reloadLeft < .8 ? .35 : 0;
    } else {
      const dx = target.x - tank.x, dy = target.y - tank.y;
      const length = Math.max(1, Math.hypot(dx, dy));
      const goal = lineOfFire ? { x: target.x - dx / length * preferredRange * 0.7, y: target.y - dy / length * preferredRange * 0.7 } : { x: target.x, y: target.y };
      Object.assign(control, driveTo(state, tank, goal));
    }
    const friendlyBlocking = friendlyBlocksShot(state, tank, target);
    if (friendlyBlocking && lineOfFire) {
      tank._blockedFireSince ??= state.elapsed;
      if (!cover && tank.reloadLeft < 1.2 && state.elapsed - tank._blockedFireSince >= .4) {
        fireLane = firingLanePosition(state, tank, target);
        if (fireLane) Object.assign(control, driveTo(state, tank, fireLane));
      }
    } else {
      tank._blockedFireSince = null; tank._fireLaneGoal = null;
    }
    control.fire = lineOfFire && !friendlyBlocking && distance < RULES.maxRange - 100 && Math.abs(angleDelta(targetAngle, tank.turretAngle)) < 0.065 && state.elapsed >= tank._reactionAt;
    if (control.fire && tank.reloadLeft <= 0) {
      tank._aimError = (random(state) - 0.5) * inaccuracy * 2;
      tank._reactionAt = state.elapsed + tank.reloadTime + reaction * 0.6;
    }
  } else {
    tank._targetId = null;
    tank._blockedFireSince = null; tank._fireLaneGoal = null;
    const direction = tank.team === 0 ? 1 : -1;
    const route = [
      { x: tank.team === 0 ? 690 : 1710, y: tank._lane },
      { x: 1200 + direction * 75, y: tank._lane },
      { x: tank.team === 0 ? 1740 : 660, y: tank._lane },
      { x: enemyBase?.x ?? (tank.team === 0 ? state.map.width - 240 : 240), y: (enemyBase?.y ?? state.map.height / 2) + (tank._lane < 800 ? -45 : tank._lane > 800 ? 45 : 0) },
    ];
    while (tank._routeIndex < route.length - 1 && Math.hypot(tank.x - route[tank._routeIndex].x, tank.y - route[tank._routeIndex].y) < 95) tank._routeIndex++;
    Object.assign(control, driveTo(state, tank, route[Math.min(route.length - 1, tank._routeIndex)]));
    control.aimX = tank.x + Math.cos(tank.angle) * 600;
    control.aimY = tank.y + Math.sin(tank.angle) * 600;
    if (enemyBase && tank._routeIndex === route.length - 1 && Math.hypot(tank.x - enemyBase.x, tank.y - enemyBase.y) < enemyBase.r * .7) control.throttle = 0;
  }
  // Orders modify movement without discarding valid targeting or fire discipline.
  const order = tank.team === 0 && state.order?.until > state.elapsed ? state.order.type : null;
  const leader = getPlayer(state);
  if (ownBase?.capture > 5 && Math.hypot(tank.x - ownBase.x, tank.y - ownBase.y) < 1300) {
    Object.assign(control, driveTo(state, tank, ownBase));
  } else if (order === 'move') {
    const squad = state.tanks.filter(ally => ally.team === 0 && !ally.isPlayer);
    const offsets = [[-60, -60], [60, 60], [-60, 60], [60, -60]];
    const [offsetX, offsetY] = offsets[Math.max(0, squad.indexOf(tank)) % offsets.length];
    const point = resolveMovePoint(state, state.order.x + offsetX, state.order.y + offsetY) || state.order;
    const distance = Math.hypot(tank.x - point.x, tank.y - point.y);
    if (distance > 45 && !(fireLane && distance < 150)) Object.assign(control, driveTo(state, tank, point));
    else if (!fireLane) control.throttle = 0;
  } else if (order === 'defend' && ownBase) {
    const point = { x: ownBase.x + 130, y: ownBase.y + (tank._lane - 800) * .45 };
    if (Math.hypot(tank.x - point.x, tank.y - point.y) > 90 || !target) Object.assign(control, driveTo(state, tank, point));
  } else if (order === 'follow' && leader?.alive) {
    const side = tank._avoidSign * (tank.type === 'heavy' ? 110 : 155);
    const point = { x: clamp(leader.x - Math.cos(leader.angle) * 120 - Math.sin(leader.angle) * side, 70, state.map.width - 70), y: clamp(leader.y - Math.sin(leader.angle) * 120 + Math.cos(leader.angle) * side, 70, state.map.height - 70) };
    if (Math.hypot(tank.x - leader.x, tank.y - leader.y) > 310 || !target) Object.assign(control, driveTo(state, tank, point));
  } else if (order === 'attack' && !target && enemyBase) {
    // Keep separate lanes until the midfield, then converge on the objective.
    if (tank.x > state.map.width * .56) Object.assign(control, driveTo(state, tank, { x: enemyBase.x, y: enemyBase.y + tank._avoidSign * 55 }));
  }
  if (state.elapsed - tank._stuckAt > 1.3) {
    const moved = Math.hypot(tank.x - tank._stuckX, tank.y - tank._stuckY);
    if (Math.abs(tank._control.throttle || 0) > 0.2 && moved < 10 && tank.trackDisabled <= 0) {
      tank._reverseUntil = state.elapsed + 0.85;
      tank._pathNext = 0;
      tank._avoidSign *= -1;
    }
    tank._stuckAt = state.elapsed; tank._stuckX = tank.x; tank._stuckY = tank.y;
  }
  if (state.elapsed < tank._reverseUntil) { control.throttle = -0.7; control.steer = tank._avoidSign * 0.8; }
  tank._control = control;
  return control;
}

function canOccupy(state, tank, x, y) {
  const radius = tank.radius;
  if (x < radius + 6 || y < radius + 6 || x > state.map.width - radius - 6 || y > state.map.height - radius - 6) return false;
  return !state.map.obstacles.some(obstacle => !obstacle.destroyed && circleTouchesRect(x, y, radius, obstacle));
}

function moveTank(state, tank, control, dt) {
  const config = TANKS[tank.type];
  const surface = surfaceAt(state.map, tank.x, tank.y);
  tank.surfaceId = surface.id;
  const oldX = tank.x;
  const oldY = tank.y;
  let throttle = clamp(Number(control.throttle) || 0, -1, 1);
  let steer = clamp(Number(control.steer) || 0, -1, 1);
  if (Number.isFinite(control.moveAngle) && control.movePower > 0.05) {
    const difference = angleDelta(control.moveAngle, tank.angle);
    steer = clamp(difference * 2.7, -1, 1);
    throttle = clamp(control.movePower, 0, 1) * clamp(1 - Math.abs(difference) / 1.7, 0, 1);
  }
  if (tank.trackDisabled > 0) { throttle = 0; steer = 0; }
  const turningFactor = 1 - Math.min(0.25, Math.abs(tank.speed) / config.speed * 0.25);
  tank.angle += steer * config.turnRate * turningFactor * surface.turnMultiplier * dt;
  const engineFactor = tank.modules.engine > 0 ? .6 : 1;
  const desiredSpeed = throttle * (throttle >= 0 ? config.speed : config.reverse) * engineFactor * surface.speedMultiplier;
  const acceleration = config.acceleration * engineFactor * surface.accelerationMultiplier * (Math.abs(desiredSpeed) < Math.abs(tank.speed) ? 1.8 : 1);
  tank.speed += clamp(desiredSpeed - tank.speed, -acceleration * dt, acceleration * dt);
  if (tank.trackDisabled > 0) tank.speed *= Math.exp(-dt * 18);
  const dx = Math.cos(tank.angle) * tank.speed * dt;
  const dy = Math.sin(tank.angle) * tank.speed * dt;
  if (canOccupy(state, tank, tank.x + dx, tank.y + dy)) {
    tank.x += dx; tank.y += dy;
  } else {
    let moved = false;
    if (canOccupy(state, tank, tank.x + dx, tank.y)) { tank.x += dx; moved ||= Math.abs(dx) > 0.001; }
    if (canOccupy(state, tank, tank.x, tank.y + dy)) { tank.y += dy; moved ||= Math.abs(dy) > 0.001; }
    tank.speed *= moved ? 0.86 : 0.2;
  }
  tank.vx = (tank.x - oldX) / dt;
  tank.vy = (tank.y - oldY) / dt;
  tank.surfaceId = surfaceAt(state.map, tank.x, tank.y).id;
  tank.stats.distanceTravelled += Math.hypot(tank.x - oldX, tank.y - oldY);
  if (Number.isFinite(control.aimX) && Number.isFinite(control.aimY)) {
    const desiredAngle = Math.atan2(control.aimY - tank.y, control.aimX - tank.x);
    const oldAngle = tank.turretAngle;
    tank.turretAngle = turnTowards(tank.turretAngle, desiredAngle, config.turretRate * dt);
    const movementBloom = Math.abs(tank.speed) / config.speed * 0.026;
    const rotationBloom = Math.abs(angleDelta(tank.turretAngle, oldAngle)) / Math.max(dt, 0.001) * 0.009;
    const desiredBloom = movementBloom + rotationBloom;
    tank._bloom += (desiredBloom - tank._bloom) * Math.min(1, dt * 3.2);
  } else tank._bloom *= Math.exp(-dt * 3.2);
  tank.dispersion = 0.006 + tank._bloom;
  if ((control.ammo === 'AP' || control.ammo === 'HE') && tank.ammo !== control.ammo) {
    tank.ammo = control.ammo;
    syncReloadMultiplier(tank);
    tank.reloadLeft = tank.reloadTime;
    event(state, 'ammo', { actor: tank.id, team: tank.team, ammo: tank.ammo, text: `${tank.ammo} 장전 시작` });
  }
  if (control.repair && (tank.trackDisabled > 0 || tank.modules.engine > 0 || tank.modules.ammoRack > 0) && tank.repairCooldown <= 0) {
    tank.trackDisabled = 0; tank.modules.engine = 0; tank.modules.ammoRack = 0;
    syncReloadMultiplier(tank);
    tank.repairCooldown = RULES.repairCooldown;
    effect(state, 'smoke', tank.x, tank.y, 0.7, { repair: true, ownerId: tank.id, targetId: tank.id, visibleToPlayer: tank.team === 0 || tank.visibleToPlayer });
    event(state, 'repair', { actor: tank.id, team: tank.team, x: tank.x, y: tank.y, text: tank.isPlayer ? '수리 도구 사용 · 모든 부품 복구' : `${tank.name} 부품 복구` });
  }
  if (control.smoke) deploySmoke(state, tank);
}

function separateTanks(state) {
  for (let a = 0; a < state.tanks.length; a++) {
    const first = state.tanks[a];
    if (!first.alive) continue;
    for (let b = a + 1; b < state.tanks.length; b++) {
      const second = state.tanks[b];
      if (!second.alive) continue;
      const dx = second.x - first.x;
      const dy = second.y - first.y;
      const length = Math.hypot(dx, dy);
      const required = first.radius + second.radius + 2;
      if (length >= required) continue;
      const nx = length > 0.001 ? dx / length : 1;
      const ny = length > 0.001 ? dy / length : 0;
      const correction = (required - length) * 0.51;
      if (canOccupy(state, first, first.x - nx * correction, first.y - ny * correction)) { first.x -= nx * correction; first.y -= ny * correction; }
      if (canOccupy(state, second, second.x + nx * correction, second.y + ny * correction)) { second.x += nx * correction; second.y += ny * correction; }
      if (length < required - 5) { first.speed *= 0.85; second.speed *= 0.85; }
    }
  }
}

function fire(state, tank) {
  if (!tank.alive || tank.reloadLeft > 0) return;
  const config = TANKS[tank.type];
  const spread = (random(state) + random(state) - 1) * tank.dispersion;
  const angle = tank.turretAngle + spread;
  const barrelLength = config.radius * 1.95 + 6;
  let x = tank.x + Math.cos(angle) * barrelLength;
  let y = tank.y + Math.sin(angle) * barrelLength;
  // Trace the entire barrel, including live hulls. Starting inside a nearby tank
  // skips its entry face and can turn a side ricochet into an incorrect rear hit.
  let barrelHit = null;
  for (const obstacle of state.map.obstacles) {
    if (obstacle.destroyed) continue;
    const hit = segmentRect(tank.x, tank.y, x, y, obstacle);
    if (hit && (!barrelHit || hit.t < barrelHit.t)) barrelHit = hit;
  }
  for (const other of state.tanks) {
    if (!other.alive || other === tank) continue;
    const hit = segmentTank(tank.x, tank.y, x, y, other, other.radius);
    if (hit && (!barrelHit || hit.t < barrelHit.t)) barrelHit = hit;
  }
  if (barrelHit) { x = barrelHit.x - Math.cos(angle) * .1; y = barrelHit.y - Math.sin(angle) * .1; }
  const speed = RULES.projectileSpeed * (tank.ammo === 'HE' ? 0.78 : 1);
  state.projectiles.push({
    id: state._nextProjectileId++, x, y, previousX: x, previousY: y,
    vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, angle,
    team: tank.team, ownerId: tank.id, ammo: tank.ammo,
    damage: config.damage * (0.875 + random(state) * 0.25),
    penetration: config.penetration * (0.85 + random(state) * 0.3),
    traveled: 0, age: 0, maxRange: RULES.maxRange, _hitCredited: false,
  });
  syncReloadMultiplier(tank);
  tank.reloadLeft = tank.reloadTime;
  tank.revealUntil = state.elapsed + 3.3;
  tank._bloom = Math.min(0.07, tank._bloom + 0.018);
  state._visionTimer = 0.2;
  effect(state, 'muzzle', x, y, 0.18, { angle, team: tank.team, size: tank.type === 'heavy' ? 1.3 : 1, ownerId: tank.id, visibleToPlayer: tank.team === 0 || tank.visibleToPlayer });
  event(state, 'fire', { actor: tank.id, team: tank.team, x, y, ammo: tank.ammo, text: tank.isPlayer ? `${tank.ammo} 발사` : `${tank.name} 발사` });
  tank.stats.shots++;
}

function resetCaptureContribution(state, tank) {
  for (const base of state.bases) {
    if (base._contributors[tank.id]) base._contributors[tank.id] = 0;
  }
}

function destroyTank(state, tank, projectile) {
  if (!tank.alive) return;
  tank.alive = false; tank.hp = 0; tank.speed = 0; tank.vx = 0; tank.vy = 0;
  tank.trackDisabled = 0; tank.modules.engine = 0; tank.modules.ammoRack = 0;
  resetCaptureContribution(state, tank);
  const attacker = state.tanks.find(item => item.id === projectile?.ownerId);
  const visible = tank.team === 0 || tank.visibleToPlayer;
  effect(state, 'explosion', tank.x, tank.y, 1.1, { size: 1.6, team: tank.team, ownerId: attacker?.id, targetId: tank.id, visibleToPlayer: visible });
  effect(state, 'smoke', tank.x, tank.y, 7, { size: 1.2, wreck: true, targetId: tank.id, visibleToPlayer: visible });
  event(state, 'destroyed', { actor: attacker?.id ?? null, target: tank.id, team: attacker?.team ?? 1 - tank.team, x: tank.x, y: tank.y, visibleToPlayer: visible, text: tank.isPlayer ? '차량 파괴 · 아군을 관전합니다' : `${tank.name} 격파` });
  if (attacker && attacker.team !== tank.team) attacker.stats.kills++;
  // Wrecks are physical cover and invalidate pathfinding, but their visual is the dead tank.
  const w = tank.radius * 1.8, h = tank.radius * 1.5;
  state.map.obstacles.push({ id: `wreck-${tank.id}`, type: 'wreck', tankId: tank.id, invisible: true, x: tank.x - w / 2, y: tank.y - h / 2, w, h, hp: 99999, maxHp: 99999, destructible: false, destroyed: false });
  state.map.version = (state.map.version || 0) + 1;
  if (tank.isPlayer) state.spectateId = state.tanks.find(item => item.alive && item.team === 0)?.id ?? null;
  refreshTargeting(state);
}

function creditAssistance(state, attacker, target, damage) {
  if (!attacker || detectable(state, attacker, target) || target.visibleUntil[attacker.team] < state.elapsed) return;
  const candidates = target._spotters[attacker.team].length ? target._spotters[attacker.team] : target._lastSpotterUntil[attacker.team] >= state.elapsed ? target._lastSpotters[attacker.team] : [];
  const spotters = candidates.map(id => state.tanks.find(t => t.id === id)).filter(t => t?.alive && t.id !== attacker.id);
  if (!spotters.length) return;
  let remaining = damage;
  for (let i = 0; i < spotters.length; i++) {
    const assistance = i === spotters.length - 1 ? remaining : Math.floor(damage / spotters.length);
    remaining -= assistance;
    spotters[i].stats.assisted += assistance;
    if (spotters[i].isPlayer) event(state, 'assist', { actor: spotters[i].id, target: target.id, team: attacker.team, damage: assistance, text: `정찰 지원 ${assistance}` });
  }
}

function damageTank(state, tank, amount, projectile, hit = null) {
  if (!tank.alive || projectile.team === tank.team) return;
  const damage = Math.min(tank.hp, Math.max(1, Math.round(amount)));
  tank.hp = Math.max(0, tank.hp - damage);
  tank.lastHitAt = state.elapsed; tank.lastHitAngle = projectile.angle; tank._lastDamageFrom = projectile.ownerId;
  resetCaptureContribution(state, tank);
  const attacker = state.tanks.find(item => item.id === projectile.ownerId);
  if (attacker) {
    attacker.stats.damage += damage;
    if (!projectile._hitCredited) { attacker.stats.hits++; projectile._hitCredited = true; }
    creditAssistance(state, attacker, tank, damage);
  }
  tank.stats.damageReceived += damage;
  const penetrated = projectile.ammo === 'AP' || hit?.penetrated === true;
  const trackChance = hit?.zone === 'side' ? 0.24 : projectile.ammo === 'HE' ? 0.16 : 0.05;
  const trackHit = random(state) < trackChance;
  if (trackHit) tank.trackDisabled = Math.max(tank.trackDisabled, 4.2);
  let module = trackHit ? 'track' : null;
  if (penetrated && hit?.zone === 'rear' && random(state) < .32) {
    damageModule(tank, 'engine', RULES.engineDamageDuration); module = 'engine';
  } else if (penetrated && hit?.zone === 'side' && random(state) < .22) {
    damageModule(tank, 'ammoRack', RULES.ammoRackDamageDuration); module = 'ammoRack';
  }
  const labels = { track: '궤도 손상', engine: '엔진 손상', ammoRack: '탄약고 손상' };
  const visible = tank.team === 0 || tank.visibleToPlayer;
  const armor = armorAtAngle(tank, projectile.angle, hit?.zone);
  effect(state, 'impact', hit?.x ?? tank.x, hit?.y ?? tank.y, 0.45, { angle: projectile.angle, damage, team: tank.team, ownerId: projectile.ownerId, targetId: tank.id, visibleToPlayer: visible });
  event(state, 'hit', { actor: projectile.ownerId, target: tank.id, team: projectile.team, x: tank.x, y: tank.y, damage,
    ammo: projectile.ammo, hitZone: hit?.zone ?? armor.zone, angle: projectile.angle, angleDegrees: armor.incidence * 180 / Math.PI,
    penetrated, critical: Boolean(module), module, visibleToPlayer: visible,
    text: `${damage} 피해${module ? ` · ${labels[module]}` : ''}` });
  if (tank.hp <= 0) destroyTank(state, tank, projectile);
}

function damageObstacle(state, obstacle, projectile) {
  if (!obstacle.destructible && obstacle.type !== 'wall') return;
  obstacle.hp = Math.max(0, obstacle.hp - projectile.damage * (projectile.ammo === 'HE' ? 2 : 0.8));
  if (obstacle.hp <= 0 && !obstacle.destroyed) {
    obstacle.destroyed = true;
    state.map.version = (state.map.version || 0) + 1;
    effect(state, 'explosion', obstacle.x + obstacle.w / 2, obstacle.y + obstacle.h / 2, 0.65, { size: 0.7, debris: true, ownerId: projectile.ownerId });
    event(state, 'hit', { actor: projectile.ownerId, target: obstacle.id, team: projectile.team, x: obstacle.x + obstacle.w / 2, y: obstacle.y + obstacle.h / 2, damage: 0, text: '낮은 담장 파괴 · 사선 확보' });
  }
}

function explodeHE(state, projectile, hit, directTank = null) {
  effect(state, 'explosion', hit.x, hit.y, 0.6, { size: 0.85, radius: 82, ownerId: projectile.ownerId, targetId: directTank?.id, visibleToPlayer: directTank ? directTank.team === 0 || directTank.visibleToPlayer : undefined });
  if (directTank && directTank.team !== projectile.team) {
    const armor = armorAtAngle(directTank, projectile.angle, hit.zone);
    const penetration = projectile.penetration * 0.32;
    const multiplier = penetration > armor.nominal ? 1.18 : Math.max(0.22, 0.63 - armor.nominal / 530);
    damageTank(state, directTank, projectile.damage * multiplier, projectile, { ...hit, penetrated: penetration > armor.nominal });
  }
  // Offset an impact off its wall surface so nearby targets on this side can be hit.
  const originX = hit.x + (hit.nx || 0) * 1.5;
  const originY = hit.y + (hit.ny || 0) * 1.5;
  for (const tank of state.tanks) {
    if (!tank.alive || tank === directTank || tank.team === projectile.team) continue;
    const distance = Math.max(0, Math.hypot(tank.x - hit.x, tank.y - hit.y) - tank.radius);
    if (distance > 82 || !clearLine(state.map, originX, originY, tank.x, tank.y, directTank ? `wreck-${directTank.id}` : null)) continue;
    const armor = armorAtAngle(tank, Math.atan2(tank.y - hit.y, tank.x - hit.x));
    const damage = projectile.damage * 0.58 * (1 - distance / 82) * Math.max(0.23, 1 - armor.nominal / 275);
    if (damage >= 5) damageTank(state, tank, damage, projectile, { x: tank.x, y: tank.y, zone: 'side' });
  }
}

function hitTank(state, tank, projectile, hit) {
  if (projectile.ammo === 'HE') { explodeHE(state, projectile, hit, tank); return; }
  if (tank.team === projectile.team) {
    effect(state, 'ricochet', hit.x, hit.y, 0.35, { angle: projectile.angle, harmless: true, ownerId: projectile.ownerId, targetId: tank.id, visibleToPlayer: tank.team === 0 || tank.visibleToPlayer });
    if (projectile.ownerId === state.playerId) event(state, 'bounce', { actor: projectile.ownerId, target: tank.id, team: projectile.team, x: hit.x, y: hit.y, damage: 0, text: '아군이 사선을 가로막았습니다' });
    return;
  }
  const attacker = state.tanks.find(item => item.id === projectile.ownerId);
  // A physical enemy-tank contact is a hit even when armor stops the shell.
  if (attacker && !projectile._hitCredited) { attacker.stats.hits++; projectile._hitCredited = true; }
  const armor = armorAtAngle(tank, projectile.angle, hit.zone);
  const rangeFactor = 1 - clamp((projectile.traveled - 450) / 5000, 0, 0.16);
  if (armor.ricochet || projectile.penetration * rangeFactor < armor.effective) {
    effect(state, 'ricochet', hit.x, hit.y, 0.5, { angle: Math.atan2(hit.ny, hit.nx), size: 1, ownerId: projectile.ownerId, targetId: tank.id, visibleToPlayer: tank.team === 0 || tank.visibleToPlayer });
    tank.stats.blocked += Math.round(projectile.damage);
    if (hit.zone === 'side' && random(state) < 0.1) tank.trackDisabled = Math.max(tank.trackDisabled, 2.8);
    event(state, 'bounce', { actor: projectile.ownerId, target: tank.id, team: projectile.team, x: hit.x, y: hit.y, damage: 0, ammo: projectile.ammo, hitZone: armor.zone, angleDegrees: armor.incidence * 180 / Math.PI, penetrated: false, ricochet: armor.ricochet, text: armor.ricochet ? '도탄 · 입사각이 너무 큽니다' : '장갑 관통 실패' });
    return;
  }
  damageTank(state, tank, projectile.damage, projectile, hit);
}

function updateProjectiles(state, dt) {
  const remaining = [];
  for (const projectile of state.projectiles) {
    const x2 = projectile.x + projectile.vx * dt;
    const y2 = projectile.y + projectile.vy * dt;
    projectile.previousX = projectile.x;
    projectile.previousY = projectile.y;
    projectile.age += dt;
    let first = null;
    for (const obstacle of state.map.obstacles) {
      if (obstacle.destroyed) continue;
      const hit = segmentRect(projectile.x, projectile.y, x2, y2, obstacle);
      if (hit && (!first || hit.t < first.hit.t)) first = { hit, obstacle };
    }
    for (const tank of state.tanks) {
      if (!tank.alive || tank.id === projectile.ownerId) continue;
      const hit = segmentTank(projectile.x, projectile.y, x2, y2, tank, tank.radius);
      if (hit && (!first || hit.t < first.hit.t)) first = { hit, tank };
    }
    const traveled = Math.hypot(projectile.vx, projectile.vy) * dt;
    projectile.traveled += traveled * (first?.hit.t ?? 1);
    if (first) {
      projectile.x = first.hit.x; projectile.y = first.hit.y;
      if (first.tank) hitTank(state, first.tank, projectile, first.hit);
      else {
        damageObstacle(state, first.obstacle, projectile);
        if (projectile.ammo === 'HE') explodeHE(state, projectile, first.hit);
        else effect(state, 'impact', first.hit.x, first.hit.y, 0.4, { angle: projectile.angle, debris: true, ownerId: projectile.ownerId });
      }
      continue;
    }
    projectile.x = x2; projectile.y = y2;
    if (projectile.traveled < projectile.maxRange && projectile.x > 0 && projectile.y > 0 && projectile.x < state.map.width && projectile.y < state.map.height) remaining.push(projectile);
    else if (projectile.ammo === 'HE') effect(state, 'impact', clamp(x2, 0, state.map.width), clamp(y2, 0, state.map.height), 0.2, { size: 0.4, ownerId: projectile.ownerId });
  }
  state.projectiles = remaining;
}

function detectable(state, observer, target) {
  const distance = Math.hypot(observer.x - target.x, observer.y - target.y);
  if (distance <= RULES.proximity) return true;
  if (smokeBlocks(state, observer, target)) return false;
  const observerConfig = TANKS[observer.type];
  const firing = target.revealUntil > state.elapsed;
  let range = observer.viewRange ?? observerConfig.viewRange;
  if (target.type === 'scout') range *= 0.92;
  if (firing) range *= 1.18;
  if (distance > range) return false;
  if (!clearLine(state.map, observer.x, observer.y, target.x, target.y)) return false;
  if (!firing) {
    const inBush = state.map.bushes.some(bush => Math.hypot(target.x - bush.x, target.y - bush.y) < bush.r);
    if (inBush) range *= Math.abs(target.speed) > 18 ? 0.72 : 0.47;
  }
  return distance <= range;
}

function updateVisibility(state) {
  for (const target of state.tanks) {
    if (!target.alive) {
      // A wreck is static knowledge once discovered. A blind kill remains hidden
      // until an ally observes it, ignoring only the wreck's own solid rectangle.
      const wreckId = `wreck-${target.id}`;
      const discovered = target.team === 0 || target.visibleToPlayer || (state.map.obstacles.some(obstacle => obstacle.id === wreckId) && state.tanks.some(observer => {
        if (!observer.alive || observer.team !== 0) return false;
        const distance = Math.hypot(observer.x - target.x, observer.y - target.y);
        if (distance <= RULES.proximity) return true;
        return distance <= (observer.viewRange ?? TANKS[observer.type].viewRange) && !smokeBlocks(state, observer, target)
          && clearLine(state.map, observer.x, observer.y, target.x, target.y, wreckId);
      }));
      if (discovered) {
        target.visibleToPlayer = true;
        target.visibleUntil[0] = Infinity;
        target.lastSeen = { x: target.x, y: target.y, time: state.elapsed, hp: 0 };
      }
      continue;
    }
    if (target.trainingTarget) {
      target.visibleUntil[0] = Infinity; target.visibleToPlayer = true; target.spotted = true;
      target.lastSeen = { x: target.x, y: target.y, time: state.elapsed, hp: target.hp };
      continue;
    }
    const opponent = 1 - target.team;
    const observers = state.tanks.filter(observer => observer.alive && observer.team === opponent);
    const detectors = observers.filter(observer => detectable(state, observer, target));
    const detected = detectors.length > 0;
    target._spotters[opponent] = detectors.map(observer => observer.id);
    target.visibleUntil[target.team] = Infinity;
    if (detected) {
      target.visibleUntil[opponent] = state.elapsed + RULES.spotMemory;
      target._lastSpotters[opponent] = [...target._spotters[opponent]];
      target._lastSpotterUntil[opponent] = target.visibleUntil[opponent];
      if (!target._seenByTeam[opponent]) {
        target._seenByTeam[opponent] = true;
        // The observer with the shortest unobstructed range receives first-spot credit.
        const observer = [...detectors].sort((a, b) => Math.hypot(a.x - target.x, a.y - target.y) - Math.hypot(b.x - target.x, b.y - target.y))[0];
        observer.stats.spots++;
        if (observer.isPlayer) event(state, 'spot', { actor: observer.id, target: target.id, team: observer.team, text: `${target.name} 최초 발견` });
      }
    } else if (observers.some(observer => smokeBlocks(state, observer, target))) {
      target.visibleUntil[opponent] = Math.min(target.visibleUntil[opponent], state.elapsed + 1);
      target._lastSpotterUntil[opponent] = Math.min(target._lastSpotterUntil[opponent], target.visibleUntil[opponent]);
    }
    const wasSpotted = target.spotted;
    target.spotted = target.visibleUntil[opponent] >= state.elapsed;
    target.visibleToPlayer = target.team === 0 || target.visibleUntil[0] >= state.elapsed;
    if (target.team === 1 && target.visibleToPlayer) target.lastSeen = { x: target.x, y: target.y, time: state.elapsed, hp: target.hp };
    if (target.isPlayer && target.spotted && !wasSpotted && state.elapsed - target._spotNoticeAt > 6) {
      target._spotNoticeAt = state.elapsed;
      event(state, 'spotted', { actor: target.id, target: target.id, team: target.team, x: target.x, y: target.y, text: '적에게 발견되었습니다 · 엄폐물을 이용하세요' });
    }
  }
  state._visionTimer = 0;
}

function updateCapture(state, dt) {
  const completed = [];
  for (const base of state.bases) {
    const inside = state.tanks.filter(tank => tank.alive && Math.hypot(tank.x - base.x, tank.y - base.y) <= base.r);
    const attackers = inside.filter(tank => tank.team !== base.team);
    const defenders = inside.filter(tank => tank.team === base.team);
    const wasCapturing = base.capturingTeam;
    base.contested = attackers.length > 0 && defenders.length > 0;
    base.capturingTeam = attackers.length ? 1 - base.team : null;
    for (const id of Object.keys(base._contributors)) if (!attackers.some(tank => tank.id === id)) delete base._contributors[id];
    if (!base.contested && attackers.length) {
      const contributionRate = RULES.captureRate * Math.min(3, attackers.length) / attackers.length;
      for (const tank of attackers) base._contributors[tank.id] = (base._contributors[tank.id] || 0) + contributionRate * dt;
    }
    base.capture = clamp(Object.values(base._contributors).reduce((sum, value) => sum + value, 0), 0, 100);
    const playerContribution = base._contributors[state.playerId] || 0;
    state.statistics.captures = Math.max(state.statistics.captures, Math.round(playerContribution));
    if (wasCapturing === null && attackers.length) {
      event(state, 'capture', { actor: attackers[0].id, target: `base-${base.team}`, team: 1 - base.team, x: base.x, y: base.y, text: base.team === 1 ? '적 기지 점령 시작' : '아군 기지가 점령당하고 있습니다' });
    }
    if (base.capture >= 100 - 1e-7) { base.capture = 100; completed.push(1 - base.team); }
  }
  if (completed.length > 1) finishBattle(state, null, '양 팀 동시 점령 · 무승부');
  else if (completed.length === 1) finishBattle(state, completed[0], completed[0] === 0 ? '적 기지 점령 완료' : '아군 기지 점령당함');
}

function finishBattle(state, winner, reason) {
  if (state.phase !== 'playing') return;
  state.phase = 'ended';
  state.lockTargetId = null;
  state.focusTarget = null;
  state.winner = winner;
  state.resultReason = reason;
  state.statistics.survived = Boolean(getPlayer(state)?.alive);
  state.statistics.duration = state.elapsed;
  event(state, 'end', { team: winner, actor: null, target: null, text: reason });
}

function checkVictory(state) {
  if (state.phase !== 'playing') return;
  const teams = [state.tanks.filter(tank => tank.alive && tank.team === 0), state.tanks.filter(tank => tank.alive && tank.team === 1)];
  if (!teams[0].length && !teams[1].length) finishBattle(state, null, '양 팀 전멸 · 무승부');
  else if (!teams[1].length) finishBattle(state, 0, state.mode === 'training' ? '훈련 완료 · 표적 3대 격파' : '적 전차 전멸');
  else if (!teams[0].length) finishBattle(state, 1, '아군 전차 전멸');
  else if (state.mode === 'training' && state.timeRemaining <= 0) finishBattle(state, null, '훈련 시간 종료 · 남은 표적 있음');
  else if (state.timeRemaining <= 0) {
    if (teams[0].length !== teams[1].length) {
      const winner = teams[0].length > teams[1].length ? 0 : 1;
      finishBattle(state, winner, '제한 시간 종료 · 생존 전차 수 우세');
    } else {
      const health = teams.map(team => team.reduce((sum, tank) => sum + tank.hp / tank.maxHp, 0));
      const difference = health[0] - health[1];
      finishBattle(state, Math.abs(difference) < 0.01 ? null : difference > 0 ? 0 : 1, Math.abs(difference) < 0.01 ? '제한 시간 종료 · 동률 무승부' : '제한 시간 종료 · 잔존 내구도 우세');
    }
  }
}

function tick(state, input, dt) {
  const hadLock = Boolean(state.lockTargetId);
  state.elapsed += dt;
  state.timeRemaining = Math.max(0, state.duration - state.elapsed);
  state._visionTimer += dt;
  if (state.order && state.order.until <= state.elapsed) state.order = null;
  for (const item of state.effects) item.life -= dt;
  state.effects = state.effects.filter(item => item.life > 0);
  for (const cloud of state.smokeClouds) cloud.remaining -= dt;
  state.smokeClouds = state.smokeClouds.filter(cloud => cloud.remaining > 0);
  for (const tank of state.tanks) {
    if (!tank.alive) continue;
    tank.modules.engine = Math.max(0, tank.modules.engine - dt);
    tank.modules.ammoRack = Math.max(0, tank.modules.ammoRack - dt);
    syncReloadMultiplier(tank);
    tank.reloadLeft = Math.max(0, tank.reloadLeft - dt);
    tank.repairCooldown = Math.max(0, tank.repairCooldown - dt);
    tank.smokeCooldown = Math.max(0, tank.smokeCooldown - dt);
    tank.trackDisabled = Math.max(0, tank.trackDisabled - dt);
  }
  if (state._visionTimer >= 0.12) updateVisibility(state);
  refreshTargeting(state);
  const lockedTarget = getLockedTarget(state);
  const controls = [];
  for (const tank of state.tanks) {
    if (!tank.alive) continue;
    const control = tank.isPlayer ? lockedTarget ? { ...input, aimX: lockedTarget.x, aimY: lockedTarget.y }
      : hadLock ? { ...input, fire: false } : input
      : state.aiEnabled && state.mode !== 'training' ? aiControl(state, tank) : {};
    controls.push([tank, control]);
    moveTank(state, tank, control, dt);
  }
  separateTanks(state);
  refreshTargeting(state);
  for (const [tank, control] of controls) {
    if (!control.fire) continue;
    if (tank.isPlayer && hadLock) {
      const target = getLockedTarget(state);
      if (!target || Math.abs(angleDelta(Math.atan2(target.y - tank.y, target.x - tank.x), tank.turretAngle)) >= .035
        || !clearLine(state.map, tank.x, tank.y, target.x, target.y) || friendlyBlocksShot(state, tank, target)) continue;
    }
    fire(state, tank);
  }
  updateProjectiles(state, dt);
  if (state.mode !== 'training') updateCapture(state, dt);
  checkVictory(state);
}

export function stepBattle(state, input = {}, dt = 1 / 60) {
  if (!state || state.phase !== 'playing' || state.paused || !Number.isFinite(dt) || dt <= 0) return state;
  // Cap a suspended tab's catch-up and subdivide to keep collisions stable.
  let remaining = Math.min(dt, 0.25);
  while (remaining > 1e-8 && state.phase === 'playing') {
    const step = Math.min(remaining, 1 / 30);
    tick(state, input || {}, step);
    remaining -= step;
  }
  return state;
}

export function aimStatus(state, x, y) {
  const player = getPlayer(state);
  const empty = { target: null, distance: 0, effectiveArmor: 0, hitZone: null, penetrable: null, blocked: false,
    blockedReason: null, penetrationChance: 0, angleDegrees: 0, aligned: false, estimatedDamage: 0 };
  if (!player?.alive || !Number.isFinite(x) || !Number.isFinite(y)) return empty;
  const distance = Math.hypot(x - player.x, y - player.y);
  const angle = Math.atan2(y - player.y, x - player.x);
  const aligned = Math.abs(angleDelta(angle, player.turretAngle)) < .035;
  const length = Math.min(RULES.maxRange, distance + 45);
  const endX = player.x + Math.cos(angle) * length, endY = player.y + Math.sin(angle) * length;
  let obstacleT = Infinity;
  for (const obstacle of state.map.obstacles) {
    if (obstacle.destroyed) continue;
    const hit = segmentRect(player.x, player.y, endX, endY, obstacle);
    if (hit) obstacleT = Math.min(obstacleT, hit.t);
  }
  let closest = null;
  for (const tank of state.tanks) {
    if (!tank.alive || tank === player || (tank.team !== player.team && !tank.visibleToPlayer)) continue;
    const hit = segmentTank(player.x, player.y, endX, endY, tank, tank.radius);
    if (hit && (!closest || hit.t < closest.hit.t)) closest = { tank, hit };
  }
  if (!closest || closest.tank.team === player.team) {
    const blockedReason = obstacleT < (closest?.hit.t ?? 1) ? 'cover' : closest ? 'ally' : null;
    return { ...empty, distance, aligned, blocked: Boolean(blockedReason), blockedReason };
  }
  const armor = armorAtAngle(closest.tank, angle, closest.hit.zone);
  const targetDistance = Math.hypot(closest.tank.x - player.x, closest.tank.y - player.y);
  const shellDistance = Math.max(0, Math.hypot(closest.hit.x - player.x, closest.hit.y - player.y) - (player.radius * 1.95 + 6));
  const rangeFactor = 1 - clamp((shellDistance - 450) / 5000, 0, 0.16);
  const config = TANKS[player.type];
  const averagePen = config.penetration * rangeFactor;
  const chance = armor.ricochet ? 0 : clamp((averagePen * 1.15 - armor.effective) / (averagePen * .30), 0, 1);
  const blocked = obstacleT < closest.hit.t;
  const hePen = config.penetration * .32;
  const hePenChance = clamp((hePen * 1.15 - armor.nominal) / (hePen * .3), 0, 1);
  const heMultiplier = hePenChance * 1.18 + (1 - hePenChance) * Math.max(.22, .63 - armor.nominal / 530);
  return {
    target: closest.tank, distance: targetDistance, effectiveArmor: armor.effective, hitZone: armor.zone,
    penetrable: player.ammo === 'HE' ? null : chance >= .5, penetrationChance: player.ammo === 'HE' ? 0 : chance,
    blocked, blockedReason: blocked ? 'cover' : null, angleDegrees: armor.incidence * 180 / Math.PI, aligned,
    estimatedDamage: Math.round(player.ammo === 'HE' ? config.damage * heMultiplier : config.damage * chance),
  };
}
