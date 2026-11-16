/**
 * Deterministic fire and lightning simulation. All persistent history lives in
 * game.state. The engine owns its clock, work reservations, and pawn lifecycles.
 */
import { refreshSystems } from './colony-systems.js?v=4.0.0';

const PERIOD = 0.5;
const SPREAD_PERIOD = 3;
const MAX_FIRES = 32;
const MAX_SPREAD_PER_CYCLE = 4;
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const STRUCTURE_FUEL = Object.freeze({
  wall: 100, door: 85, bed: 70, stove: 65, sandbag: 105,
  researchbench: 80, horseshoes: 60, beacon: 130,
  solar: 75, battery: 65, cooler: 65, heater: 65, conduit: 20
});
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const random = game => typeof game._rand === 'function' ? game._rand() : 0.5;

function tileAt(state, x, y) {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= state.width || y >= state.height) return null;
  return state.tiles[y * state.width + x] || null;
}

function fuelFor(tile) {
  if (!tile || tile.terrain === 'water' || tile.building && !tile.building.complete) return 0;
  let fuel = 0;
  // Burned grass does not regrow as an invisible renewable fuel source. New
  // crops and rebuilt structures can burn even when standing on old ash.
  if (!tile.burned && tile.terrain === 'grass') fuel += 10;
  if (tile.feature === 'tree' && tile.amount > 0) fuel += 48 + Math.min(24, tile.amount);
  if (tile.feature === 'berry' && tile.amount > 0) fuel += 25;
  if (tile.crop) fuel += 18;
  if (tile.building?.complete && finite(tile.building.hp) > 0) fuel += STRUCTURE_FUEL[tile.building.type] || 45;
  return fuel;
}

function canIgnite(tile) {
  if (!tile || tile.terrain === 'water' || tile.building && !tile.building.complete) return false;
  return finite(tile.fireFuel) > 0 || fuelFor(tile) > 0;
}

/** Missing fields only: loading a complete snapshot never draws random values. */
export function initializeHazards(game, { migration = false } = {}) {
  const state = game.state;
  const firstDelay = state.difficulty === 'relaxed' ? 480 : 360;
  if (!record(state.hazards)) state.hazards = {};
  const defaults = {
    nextIncidentAt: finite(state.time) + firstDelay,
    spreadTimer: 0, incidentCount: 0, extinguished: 0,
    burnedBuildings: 0, burnedPlants: 0
  };
  for (const [key, value] of Object.entries(defaults)) if (state.hazards[key] === undefined) state.hazards[key] = value;
  for (const tile of state.tiles || []) {
    if (tile.fire === undefined) tile.fire = 0;
    if (tile.fireFuel === undefined) tile.fireFuel = 0;
    if (tile.burned === undefined) tile.burned = false;
  }
}

/** Public scenario command; invalid requests are completely read-only. */
export function igniteTile(game, x, y, strength = 0.35) {
  const state = game?.state;
  if (!state || !Array.isArray(state.tiles)) return { ok: false, message: '지도를 확인할 수 없습니다.' };
  const tile = tileAt(state, x, y);
  if (!tile) return { ok: false, message: '지도 안의 정수 좌표를 선택하세요.' };
  if (!Number.isFinite(strength) || strength <= 0 || strength > 1) return { ok: false, message: '화력은 0보다 크고 1 이하여야 합니다.' };
  if (finite(tile.fire) > 0) return { ok: false, message: '이미 불이 난 곳입니다.' };
  if (!canIgnite(tile)) return { ok: false, message: '물·불연성 땅·건설 계획에는 불을 붙일 수 없습니다.' };
  if (state.tiles.reduce((count, t) => count + (finite(t.fire) > 0 ? 1 : 0), 0) >= MAX_FIRES) return { ok: false, message: '동시에 번질 수 있는 화재는 32칸입니다.' };
  if (!record(state.hazards) || tile.fire === undefined || tile.burned === undefined) initializeHazards(game);
  tile.fireFuel = finite(tile.fireFuel) > 0 ? tile.fireFuel : fuelFor(tile);
  tile.fire = strength;
  if (typeof game._wake === 'function') game._wake();
  return { ok: true, message: '불이 붙었습니다. 소방 담당자가 가까이 이동해 진화합니다.' };
}

function startIncident(game) {
  const state = game.state, hazards = state.hazards;
  if (finite(state.time) < hazards.nextIncidentAt || state.gameOver) return;
  const fires = state.tiles.reduce((count, tile) => count + (tile.fire > 0 ? 1 : 0), 0);
  // Let an ongoing large emergency resolve before adding another lightning fire.
  if (fires >= 8 || state.activeRaid) { hazards.nextIncidentAt = finite(state.time) + 45; return; }
  const buildings = state.tiles.filter(tile => tile.building?.complete);
  const living = (state.colonists || []).filter(pawn => !pawn.dead);
  const anchors = buildings.length ? buildings : living;
  const cx = anchors.length ? anchors.reduce((n, value) => n + value.x, 0) / anchors.length : state.width / 2;
  const cy = anchors.length ? anchors.reduce((n, value) => n + value.y, 0) / anchors.length : state.height / 2;
  const safe = state.tiles.filter(tile => {
    if (tile.roofed || tile.building || tile.crop || tile.fire > 0 || !canIgnite(tile)) return false;
    const distance = Math.hypot(tile.x - cx, tile.y - cy);
    return distance >= 6 && distance <= 12
      && !buildings.some(other => Math.abs(other.x - tile.x) + Math.abs(other.y - tile.y) < 3)
      && !living.some(pawn => Math.hypot(pawn.x - tile.x - 0.5, pawn.y - tile.y - 0.5) < 2);
  });
  const woody = safe.filter(tile => tile.feature === 'tree' || tile.feature === 'berry');
  const candidates = woody.length ? woody : safe;
  hazards.nextIncidentAt = finite(state.time) + (state.difficulty === 'relaxed' ? 360 : 300) + Math.floor(random(game) * 91);
  if (!candidates.length) return;
  const tile = candidates[Math.min(candidates.length - 1, Math.floor(random(game) * candidates.length))];
  const result = igniteTile(game, tile.x, tile.y, state.difficulty === 'relaxed' ? 0.28 : 0.35);
  if (!result.ok) return;
  hazards.incidentCount++;
  // Existing effect kinds remain compatible with every release's save validator.
  if (typeof game._effect === 'function') game._effect('hit', tile.x + 0.5, tile.y + 0.5, tile.x + 0.5, tile.y + 0.5, '#f8d995', '낙뢰');
  if (typeof game._log === 'function') game._log('danger', '낙뢰로 불이 났습니다', `정착지 바깥 (${tile.x}, ${tile.y})에 화재가 발생했습니다. 소방 담당자를 확인하고 필요하면 우선 진화를 지시하세요.`);
}

function releasePlantWork(game, tile) {
  if (typeof game._releaseJob !== 'function') return;
  for (const pawn of game.state.colonists || []) {
    if (pawn.job && ['grow', 'harvest'].includes(pawn.job.type) && pawn.job.tx === tile.x && pawn.job.ty === tile.y) game._releaseJob(pawn);
  }
}

function destroyBuilding(game, tile) {
  const building = tile.building;
  if (!building?.complete) return false;
  if (typeof game._onBuildingDestroyed === 'function') game._onBuildingDestroyed(building, tile, 'fire');
  else if (typeof game._releaseJob === 'function') {
    for (const pawn of game.state.colonists || []) if (pawn.job?.targetId === building.id || pawn.job?.bedId === building.id) game._releaseJob(pawn);
  }
  // Fire never calls the demolition/cancellation command and never issues a refund.
  tile.building = null;
  tile.burned = true;
  game.state.hazards.burnedBuildings++;
  if (typeof game._effect === 'function') game._effect('hit', tile.x + 0.5, tile.y + 0.5, tile.x + 0.5, tile.y + 0.5, '#d78d64', '화재로 파괴');
  if (typeof game._log === 'function') game._log('warning', '건물이 불에 무너졌습니다', `(${tile.x}, ${tile.y})의 구조물이 파괴되었습니다. 화재를 진압한 뒤 방과 전력 연결을 복구하세요.`);
  return true;
}

function damageActors(game, dt) {
  const state = game.state;
  for (const pawn of state.colonists || []) {
    if (pawn.dead) continue;
    const tile = tileAt(state, Math.floor(pawn.x), Math.floor(pawn.y));
    if (!tile || tile.fire <= 0) continue;
    const previous = pawn.health;
    pawn.health = Math.max(0, pawn.health - tile.fire * 5 * dt);
    if (pawn.health <= 0) {
      if (typeof game._killPawn === 'function') game._killPawn(pawn);
      else { pawn.dead = true; pawn.drafted = false; }
    } else if (previous >= 15 && pawn.health < 15) {
      if (typeof game._downPawn === 'function') game._downPawn(pawn);
      else {
        if (typeof game._releaseJob === 'function') game._releaseJob(pawn);
        pawn.drafted = false; pawn.order = null;
      }
      pawn.status = '화상으로 쓰러짐 · 구조 필요';
    }
  }
  for (const pawn of state.raiders || []) {
    if (pawn.dead) continue;
    const tile = tileAt(state, Math.floor(pawn.x), Math.floor(pawn.y));
    if (!tile || tile.fire <= 0) continue;
    pawn.health = Math.max(0, pawn.health - tile.fire * 5 * dt);
    if (pawn.health <= 0) {
      pawn.dead = true; pawn.path = []; pawn.destination = null;
      pawn.status = '화재로 제압됨';
      if (state.stats) state.stats.raidersDefeated = finite(state.stats.raidersDefeated) + 1;
    }
  }
}

function burnStep(game, dt) {
  const state = game.state;
  let destroyed = false;
  for (const tile of state.tiles) {
    if (!(tile.fire > 0)) continue;
    // Blueprints cannot provide fuel or lose prepaid construction materials.
    if (tile.terrain === 'water' || tile.building && !tile.building.complete) { tile.fire = 0; tile.fireFuel = 0; continue; }
    if (tile.fireFuel <= 0) { tile.fire = 0; continue; }
    const rain = state.weather === 'rain' && !tile.roofed;
    const growth = tile.fireFuel > 4 ? 0.045 : -0.2;
    tile.fire = clamp(tile.fire + (growth - (rain ? 0.3 : 0)) * dt, 0, 1);
    if (tile.fire <= 1e-9) { tile.fire = 0; continue; }
    tile.burned = true;
    tile.fireFuel = Math.max(0, tile.fireFuel - (0.35 + tile.fire * 0.95) * dt);
    if (tile.building?.complete) {
      tile.building.hp = Math.max(0, tile.building.hp - tile.fire * 6 * dt);
      if (tile.building.hp <= 0) destroyed = destroyBuilding(game, tile) || destroyed;
    }
    if (tile.feature === 'tree' || tile.feature === 'berry') {
      // Resource yields stay integers. A plant is lost after its fuel has been
      // substantially consumed, rather than exposing fractional harvest stacks.
      if (tile.fireFuel <= Math.max(6, fuelFor(tile) * 0.5)) {
        tile.feature = null; tile.amount = 0; tile.designation = null;
        state.hazards.burnedPlants++; releasePlantWork(game, tile);
      }
    }
    if (tile.crop) {
      tile.crop.growth = Math.max(0, tile.crop.growth - tile.fire * 0.06 * dt);
      if (tile.crop.growth <= 0) { tile.crop = null; state.hazards.burnedPlants++; releasePlantWork(game, tile); }
    }
    if (tile.fireFuel <= 0) tile.fire = 0;
  }
  damageActors(game, dt);
  return destroyed;
}

function spreadFire(game) {
  const state = game.state, sources = state.tiles.filter(tile => tile.fire > 0);
  let burning = sources.length, spread = 0;
  for (const tile of sources) {
    if (burning >= MAX_FIRES || spread >= MAX_SPREAD_PER_CYCLE) break;
    if (state.weather === 'rain' && !tile.roofed) continue;
    const candidates = DIRS.map(([dx, dy]) => tileAt(state, tile.x + dx, tile.y + dy))
      .filter(other => other && other.fire === 0 && canIgnite(other));
    if (!candidates.length || random(game) >= tile.fire * 0.45) continue;
    const target = candidates[Math.min(candidates.length - 1, Math.floor(random(game) * candidates.length))];
    const result = igniteTile(game, target.x, target.y, 0.22);
    if (result.ok) { burning++; spread++; }
  }
}

export function updateHazards(game, dt) {
  if (!Number.isFinite(dt) || dt <= 0 || !game?.state) return;
  const state = game.state;
  if (!record(state.hazards)) initializeHazards(game);
  startIncident(game);
  let remaining = dt, topologyChanged = false;
  while (remaining > 1e-9) {
    const step = Math.min(PERIOD, remaining);
    topologyChanged = burnStep(game, step) || topologyChanged;
    state.hazards.spreadTimer += step;
    while (state.hazards.spreadTimer >= SPREAD_PERIOD - 1e-9) {
      state.hazards.spreadTimer = Math.max(0, state.hazards.spreadTimer - SPREAD_PERIOD);
      spreadFire(game);
    }
    remaining -= step;
  }
  if (topologyChanged) {
    refreshSystems(game);
    if (typeof game._wake === 'function') game._wake();
  }
}

/** Reject impossible persisted extension state before the engine uses it. */
export function validateHazards(data, bad) {
  const fail = label => { bad(label); throw new Error(`Invalid hazard state: ${label}`); };
  const number = (value, min, max, label) => { if (!Number.isFinite(value) || value < min || value > max) fail(label); };
  if (!record(data?.hazards) || !Array.isArray(data.tiles)) fail('화재 상태');
  const hazards = data.hazards;
  number(hazards.nextIncidentAt, 0, 1e10, '다음 낙뢰 시간');
  number(hazards.spreadTimer, 0, SPREAD_PERIOD, '화재 확산 시간');
  if (hazards.spreadTimer >= SPREAD_PERIOD) fail('화재 확산 주기');
  for (const key of ['incidentCount', 'extinguished', 'burnedBuildings', 'burnedPlants']) {
    number(hazards[key], 0, 1e10, `화재 ${key}`);
    if (!Number.isInteger(hazards[key])) fail('화재 통계 정수');
  }
  let fires = 0;
  for (const tile of data.tiles) {
    if (!record(tile)) fail('화재 타일');
    number(tile.fire, 0, 1, '화력');
    number(tile.fireFuel, 0, 1e6, '잔여 연료');
    if (typeof tile.burned !== 'boolean') fail('탄자리');
    if (tile.fire > 0) {
      fires++;
      if (tile.fireFuel <= 0 || tile.terrain === 'water' || tile.building && !tile.building.complete) fail('불이 붙을 수 없는 타일');
    }
  }
  if (fires > MAX_FIRES) fail('동시 화재 한도');
  return true;
}
