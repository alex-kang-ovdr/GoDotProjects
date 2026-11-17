/**
 * Frontier Colony: rooms, electrical networks, temperature and perishables.
 * Pure JavaScript, no DOM, clocks, random numbers, or engine imports.
 * Persistent quantities live in game.state; derived topology is rebuilt in a
 * stable tile order. Watts × simulated seconds = battery watt-seconds.
 */
import { EXTRA_RESOURCE_LABELS } from './economy-data.js?v=4.0.0';

export const SYSTEM_BUILDINGS = Object.freeze({
  solar: { label: '태양광 발전기', cost: { steel: 20, wood: 8 }, work: 10, hp: 120, tech: 'electricity' },
  battery: { label: '축전지', cost: { steel: 16, wood: 5 }, work: 8, hp: 100, tech: 'electricity' },
  conduit: { label: '전력선', cost: { steel: 1 }, work: 1, hp: 40, tech: 'electricity' },
  cooler: { label: '냉각기', cost: { steel: 18, wood: 6 }, work: 9, hp: 100, tech: 'refrigeration' },
  heater: { label: '난방기', cost: { steel: 10, wood: 5 }, work: 7, hp: 100, tech: 'electricity' }
});

const BATTERY_CAPACITY = 18000;
const SOLAR_PEAK = 600;
const MAX_ROOM_AREA = 120;
const PERIOD = 0.5;
const DAY = 120;
const FOOD_LIFE = Object.freeze({ rawfood: 360, meals: 240 });
const CONSUMPTION = Object.freeze({ cooler: 120, heater: 100, beacon: 240 });
const CONSUMER_PRIORITY = Object.freeze({ cooler: 0, heater: 1, beacon: 2 });
const CONDUCTORS = new Set(['solar', 'battery', 'conduit']);
const RESOURCES = new Set(['wood', 'steel', 'rawfood', 'meals', 'medicine', ...Object.keys(EXTRA_RESOURCE_LABELS)]);
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isFood = type => Object.hasOwn(FOOD_LIFE, type);
const complete = building => Boolean(building?.complete && finite(building.hp, 1) > 0);
const isBoundary = tile => complete(tile?.building) && ['wall', 'door'].includes(tile.building.type);
const cellIndex = (s, x, y) => Math.floor(y) * s.width + Math.floor(x);

function tileAt(s, x, y) {
  x = Math.floor(x); y = Math.floor(y);
  return x >= 0 && y >= 0 && x < s.width && y < s.height ? s.tiles[y * s.width + x] || null : null;
}

function neighbours(index, width, height) {
  const x = index % width, y = Math.floor(index / width), result = [];
  if (y > 0) result.push(index - width);
  if (x + 1 < width) result.push(index + 1);
  if (y + 1 < height) result.push(index + width);
  if (x > 0) result.push(index - 1);
  return result;
}

export function outsideTemperature(state) {
  const hour = ((8 + finite(state?.time) / DAY * 24) % 24 + 24) % 24;
  const baseline = state?.weather === 'heat' ? 32 : state?.weather === 'rain' ? 17 : 22;
  return baseline + Math.sin(hour / 24 * Math.PI * 2 - 1.6) * 5;
}

function solarGeneration(state) {
  const hour = ((8 + finite(state.time) / DAY * 24) % 24 + 24) % 24;
  if (hour <= 6 || hour >= 18) return 0;
  const weather = state.weather === 'rain' ? 0.45 : state.weather === 'heat' ? 0.9 : 1;
  return SOLAR_PEAK * Math.sin((hour - 6) / 12 * Math.PI) * weather;
}

function defaultStockCell(state) {
  const depot = state.tiles.find(tile => tile?.zone === 'stockpile' && tile.terrain !== 'water' && !isBoundary(tile));
  if (depot) return { x: depot.x, y: depot.y };
  const land = state.tiles.find(tile => tile && tile.terrain !== 'water' && !isBoundary(tile));
  return land ? { x: land.x, y: land.y } : { x: 0, y: 0 };
}

function stockCell(state, x, y) {
  return Number.isFinite(x) && Number.isFinite(y)
    ? { x: clamp(Math.floor(x), 0, state.width - 1), y: clamp(Math.floor(y), 0, state.height - 1) }
    : defaultStockCell(state);
}

/**
 * Defaults only. A complete v2 snapshot is not refreshed here, because it may
 * have been captured between periodic updates. That preserves its exact phase.
 */
export function initializeSystems(game, { migration = false } = {}) {
  const s = game.state;
  const missingDerived = !Array.isArray(s.rooms) || !record(s.power)
    || s.tiles.some(tile => tile.roomId === undefined || tile.roofed === undefined || tile.temperature === undefined);
  const outside = outsideTemperature(s);
  if (!Array.isArray(s.rooms)) s.rooms = [];
  if (!record(s.power)) s.power = { generation: 0, demand: 0, servedDemand: 0, stored: 0, capacity: 0, networks: [] };
  if (!record(s.foodBatches)) s.foodBatches = {};
  for (const type of Object.keys(FOOD_LIFE)) {
    if (!Array.isArray(s.foodBatches[type])) {
      const count = Math.max(0, Math.floor(finite(s.resources[type])));
      const position = defaultStockCell(s);
      s.foodBatches[type] = count ? [{ count, freshness: 1, ...position }] : [];
    }
  }
  if (!record(s.systemStats)) s.systemStats = { spoiled: 0 };
  if (s.systemStats.spoiled === undefined) s.systemStats.spoiled = 0;
  for (const tile of s.tiles) {
    if (tile.roomId === undefined) tile.roomId = null;
    if (tile.roofed === undefined) tile.roofed = false;
    if (tile.temperature === undefined) tile.temperature = outside;
    if (tile.building) {
      if (tile.building.powered === undefined) tile.building.powered = false;
      if (tile.building.networkId === undefined) tile.building.networkId = null;
      if (tile.building.type === 'battery' && tile.building.charge === undefined) tile.building.charge = 0;
    }
  }
  for (const item of s.items || []) if (isFood(item.type) && item.freshness === undefined) item.freshness = 1;
  for (const colonist of s.colonists || []) {
    if (colonist.ambientTemperature === undefined) colonist.ambientTemperature = outside;
    if (colonist.sheltered === undefined) colonist.sheltered = false;
    if (colonist.thermalStress === undefined) colonist.thermalStress = 0;
    if (isFood(colonist.carry?.type) && colonist.carry.freshness === undefined) colonist.carry.freshness = 1;
  }
  if (migration || missingDerived) refreshSystems(game);
}

function buildRooms(state) {
  const { tiles, width, height } = state;
  const oldRooms = new Map((state.rooms || []).map(room => [room.id, room]));
  const outside = outsideTemperature(state);
  const visited = new Uint8Array(tiles.length);
  const queue = new Int32Array(tiles.length);
  const regions = [];
  for (const tile of tiles) {
    tile.roomId = null;
    tile.roofed = false;
    if (!Number.isFinite(tile.temperature)) tile.temperature = outside;
  }
  for (let start = 0; start < tiles.length; start++) {
    if (visited[start] || !tiles[start] || isBoundary(tiles[start])) continue;
    const members = [];
    let head = 0, tail = 0, exposed = false, perimeter = 0;
    queue[tail++] = start;
    visited[start] = 1;
    while (head < tail) {
      const index = queue[head++], tile = tiles[index];
      members.push(index);
      const x = index % width, y = Math.floor(index / width);
      // Water is not an insulating wall. An island does not become a room.
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1 || tile.terrain === 'water') exposed = true;
      for (const next of neighbours(index, width, height)) {
        if (!tiles[next]) { exposed = true; continue; }
        if (isBoundary(tiles[next])) { perimeter++; continue; }
        if (visited[next]) continue;
        visited[next] = 1;
        queue[tail++] = next;
      }
    }
    if (exposed || !members.length || members.length > MAX_ROOM_AREA) continue;
    members.sort((a, b) => a - b);
    const id = members[0], previous = oldRooms.get(id);
    const unchanged = previous && previous.tiles.length === members.length && previous.tiles.every((index, i) => index === members[i]);
    const temperature = unchanged && Number.isFinite(previous.temperature)
      ? previous.temperature
      : members.reduce((total, index) => total + finite(tiles[index].temperature, outside), 0) / members.length;
    const room = { id, tiles: members, area: members.length, temperature, beds: 0, stockpileTiles: 0 };
    for (const index of members) {
      const tile = tiles[index];
      tile.roomId = id;
      tile.roofed = true;
      tile.temperature = temperature;
      if (complete(tile.building) && tile.building.type === 'bed') room.beds++;
      if (tile.zone === 'stockpile') room.stockpileTiles++;
    }
    regions.push({ room, perimeter });
  }
  regions.sort((a, b) => a.room.id - b.room.id);
  state.rooms = regions.map(region => region.room);
  return regions;
}

function buildPowerTopology(state) {
  const { tiles, width, height } = state;
  const conductor = new Uint8Array(tiles.length), visited = new Uint8Array(tiles.length);
  const nodeNetworks = new Int32Array(tiles.length);
  nodeNetworks.fill(-1);
  const networks = [], consumers = [];
  for (let i = 0; i < tiles.length; i++) {
    const building = tiles[i]?.building;
    if (!building) continue;
    building.powered = false;
    building.networkId = null;
    if (building.type === 'battery' && building.charge === undefined) building.charge = 0;
    if (!complete(building)) continue;
    if (CONDUCTORS.has(building.type)) conductor[i] = 1;
    else if (Object.hasOwn(CONSUMPTION, building.type)) consumers.push({ index: i, tile: tiles[i], building });
  }
  for (let start = 0; start < tiles.length; start++) {
    if (!conductor[start] || visited[start]) continue;
    const queue = [start], nodes = [];
    visited[start] = 1;
    for (let head = 0; head < queue.length; head++) {
      const index = queue[head];
      nodes.push(index);
      for (const next of neighbours(index, width, height)) if (conductor[next] && !visited[next]) {
        visited[next] = 1;
        queue.push(next);
      }
    }
    nodes.sort((a, b) => a - b);
    const network = { id: nodes[0], nodes, batteries: [], solar: [], consumers: [] };
    const ordinal = networks.length;
    for (const index of nodes) {
      const building = tiles[index].building;
      building.networkId = network.id;
      nodeNetworks[index] = ordinal;
      if (building.type === 'battery') network.batteries.push(building);
      if (building.type === 'solar') network.solar.push(building);
    }
    networks.push(network);
  }
  for (const consumer of consumers) {
    const x = consumer.index % width, y = Math.floor(consumer.index / width);
    let nearest = -1;
    for (let radius = 1; radius <= 3 && nearest < 0; radius++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const dy = radius - Math.abs(dx);
        for (const signedY of dy === 0 ? [0] : [-dy, dy]) {
          const nx = x + dx, ny = y + signedY;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const index = ny * width + nx;
          if (conductor[index] && (nearest < 0 || index < nearest)) nearest = index;
        }
      }
    }
    if (nearest >= 0) {
      const network = networks[nodeNetworks[nearest]];
      consumer.building.networkId = network.id;
      network.consumers.push(consumer);
    }
  }
  for (const network of networks) network.consumers.sort((a, b) => CONSUMER_PRIORITY[a.building.type] - CONSUMER_PRIORITY[b.building.type] || a.index - b.index);
  return { networks, consumers };
}

function distributePower(state, topology, dt, advance) {
  const output = { generation: 0, demand: 0, servedDemand: 0, stored: 0, capacity: 0, networks: [] };
  for (const consumer of topology.consumers) {
    output.demand += CONSUMPTION[consumer.building.type];
    consumer.building.powered = false;
  }
  const solarOutput = solarGeneration(state);
  for (const network of topology.networks) {
    const generation = network.solar.length * solarOutput;
    const capacity = network.batteries.length * BATTERY_CAPACITY;
    const storedBefore = network.batteries.reduce((n, battery) => n + finite(battery.charge), 0);
    const demand = network.consumers.reduce((n, consumer) => n + CONSUMPTION[consumer.building.type], 0);
    let available = generation + storedBefore / Math.max(0.000001, dt), servedDemand = 0;
    for (const consumer of network.consumers) {
      const watts = CONSUMPTION[consumer.building.type];
      if (available + 1e-9 < watts) continue;
      consumer.building.powered = true;
      available -= watts;
      servedDemand += watts;
    }
    if (advance) {
      let delta = (generation - servedDemand) * dt;
      for (const battery of network.batteries) {
        if (delta >= 0) {
          const charge = Math.min(delta, Math.max(0, BATTERY_CAPACITY - battery.charge));
          battery.charge += charge;
          delta -= charge;
        } else {
          const discharge = Math.min(-delta, battery.charge);
          battery.charge -= discharge;
          delta += discharge;
        }
        if (Math.abs(battery.charge) < 1e-9) battery.charge = 0;
        battery.charge = clamp(battery.charge, 0, BATTERY_CAPACITY);
      }
    }
    const stored = network.batteries.reduce((n, battery) => n + finite(battery.charge), 0);
    const energised = generation > 1e-9 || stored > 1e-9 || servedDemand > 0;
    for (const index of network.nodes) {
      const building = state.tiles[index].building;
      building.powered = building.type === 'solar' ? solarOutput > 1e-9 : energised;
    }
    output.networks.push({ id: network.id, generation, demand, servedDemand, stored, capacity });
    output.generation += generation;
    output.servedDemand += servedDemand;
    output.stored += stored;
    output.capacity += capacity;
  }
  state.power = output;
}

function updateAmbientFields(state) {
  const outside = outsideTemperature(state);
  for (const colonist of state.colonists || []) {
    const tile = tileAt(state, colonist.x, colonist.y);
    colonist.ambientTemperature = finite(tile?.temperature, outside);
    colonist.sheltered = Boolean(tile?.roofed);
    colonist.thermalStress = clamp(Math.max(0, 8 - colonist.ambientTemperature) * 3 + Math.max(0, colonist.ambientTemperature - 30) * 4, 0, 100);
  }
}

export function refreshSystems(game) {
  const s = game.state;
  buildRooms(s);
  const topology = buildPowerTopology(s);
  distributePower(s, topology, PERIOD, false);
  updateAmbientFields(s);
}

function advanceTemperature(state, regions, dt) {
  const outside = outsideTemperature(state), outdoorDecay = Math.exp(-dt / 3);
  for (const tile of state.tiles) if (tile.roomId === null) tile.temperature = clamp(outside + (tile.temperature - outside) * outdoorDecay + clamp(finite(tile.fire), 0, 1) * 7 * dt, -100, 150);
  for (const { room, perimeter } of regions) {
    const heatCapacity = room.area * 12 + 120;
    const heatLeak = perimeter * 0.1 + room.area * 0.02;
    const passive = outside + (room.temperature - outside) * Math.exp(-heatLeak / heatCapacity * dt);
    let coolers = 0, heaters = 0, fireHeat = 0;
    for (const index of room.tiles) {
      fireHeat += clamp(finite(state.tiles[index].fire), 0, 1) * 1400;
      const building = state.tiles[index].building;
      if (!complete(building) || !building.powered) continue;
      if (building.type === 'cooler') coolers++;
      if (building.type === 'heater') heaters++;
    }
    const heated = passive + fireHeat * dt / heatCapacity;
    const cooling = Math.min(Math.max(0, heated), coolers * 360 * dt / heatCapacity);
    const heating = Math.min(Math.max(0, 21 - heated), heaters * 220 * dt / heatCapacity);
    room.temperature = clamp(heated - cooling + heating, -100, 150);
    for (const index of room.tiles) state.tiles[index].temperature = room.temperature;
  }
}

function decayRate(temperature) {
  if (temperature <= 0) return 0;
  if (temperature <= 8) return 0.15;
  if (temperature <= 20) return 0.15 + (temperature - 8) / 12 * 0.85;
  return Math.min(5, 1 + (temperature - 20) / 18);
}

function batchTemperature(state, batch) {
  return finite(tileAt(state, batch.x, batch.y)?.temperature, outsideTemperature(state));
}

function removeOldest(batches, count) {
  const order = batches.map((batch, index) => ({ batch, index })).sort((a, b) => a.batch.freshness - b.batch.freshness || a.index - b.index);
  let remaining = count, freshness = 1;
  for (const { batch } of order) {
    if (remaining <= 0) break;
    const taken = Math.min(remaining, batch.count);
    if (taken > 0) freshness = Math.min(freshness, batch.freshness);
    batch.count -= taken;
    remaining -= taken;
  }
  return freshness;
}

/** Reconcile deliberate test/scenario stock edits; normal food writes use APIs. */
function reconcileStock(state) {
  for (const type of Object.keys(FOOD_LIFE)) {
    const batches = state.foodBatches[type];
    const expected = Math.max(0, Math.floor(finite(state.resources[type])));
    const actual = batches.reduce((sum, batch) => sum + batch.count, 0);
    if (expected > actual) batches.push({ count: expected - actual, freshness: 1, ...defaultStockCell(state) });
    else if (expected < actual) removeOldest(batches, actual - expected);
    state.foodBatches[type] = batches.filter(batch => batch.count > 0);
  }
}

export function depositStock(game, type, count, x, y, freshness = 1) {
  if (!RESOURCES.has(type) || !Number.isInteger(count) || count < 0 || !Number.isFinite(freshness) || freshness < 0 || freshness > 1) return { ok: false };
  const s = game.state;
  if (!record(s.foodBatches)) initializeSystems(game);
  if (!count) return { ok: true, freshness };
  if (isFood(type)) {
    reconcileStock(s);
    const position = stockCell(s, x, y);
    const match = s.foodBatches[type].find(batch => batch.x === position.x && batch.y === position.y && batch.freshness === freshness);
    if (match) match.count += count;
    else s.foodBatches[type].push({ count, freshness, ...position });
  }
  s.resources[type] = finite(s.resources[type]) + count;
  return { ok: true, freshness };
}

export function withdrawStock(game, type, count) {
  if (!RESOURCES.has(type) || !Number.isInteger(count) || count < 0) return { ok: false, freshness: 1 };
  const s = game.state;
  if (!record(s.foodBatches)) initializeSystems(game);
  if (isFood(type)) reconcileStock(s);
  if (finite(s.resources[type]) < count) return { ok: false, freshness: 1 };
  let freshness = 1;
  if (count && isFood(type)) {
    freshness = removeOldest(s.foodBatches[type], count);
    s.foodBatches[type] = s.foodBatches[type].filter(batch => batch.count > 0);
  }
  s.resources[type] -= count;
  return { ok: true, freshness };
}

function abandonSpoiledWork(game, colonist) {
  if (typeof game._releaseJob === 'function') game._releaseJob(colonist, false);
  else colonist.carry = null;
  colonist.status = '음식이 상해 작업 재계획';
  colonist.thinkAt = finite(game.state.time);
}

function advanceFood(game, dt) {
  const s = game.state;
  let spoiled = 0;
  for (const type of Object.keys(FOOD_LIFE)) {
    const batches = s.foodBatches[type];
    for (const batch of batches) {
      batch.freshness = Math.max(0, batch.freshness - dt * decayRate(batchTemperature(s, batch)) / FOOD_LIFE[type]);
      if (batch.freshness <= 1e-12) {
        spoiled += batch.count;
        s.resources[type] -= batch.count;
        batch.count = 0;
      }
    }
    s.foodBatches[type] = batches.filter(batch => batch.count > 0);
  }
  const remainingItems = [];
  for (const item of s.items || []) {
    if (!isFood(item.type)) { remainingItems.push(item); continue; }
    item.freshness = Math.max(0, finite(item.freshness, 1) - dt * decayRate(batchTemperature(s, item)) / FOOD_LIFE[item.type]);
    if (item.freshness > 1e-12) { remainingItems.push(item); continue; }
    spoiled += item.count;
    if (item.reservedBy) {
      const owner = (s.colonists || []).find(c => c.id === item.reservedBy && c.job?.targetId === item.id);
      if (owner) abandonSpoiledWork(game, owner);
    }
    if (s.reservations) delete s.reservations[`item:${item.id}`];
  }
  s.items = remainingItems;
  for (const colonist of s.colonists || []) {
    const carry = colonist.carry;
    if (!carry || !isFood(carry.type)) continue;
    const temperature = finite(tileAt(s, colonist.x, colonist.y)?.temperature, outsideTemperature(s));
    carry.freshness = Math.max(0, finite(carry.freshness, 1) - dt * decayRate(temperature) / FOOD_LIFE[carry.type]);
    if (carry.freshness <= 1e-12) {
      spoiled += carry.count;
      abandonSpoiledWork(game, colonist);
    }
  }
  return spoiled;
}

export function updateSystems(game, dt) {
  if (!Number.isFinite(dt) || dt <= 0) return;
  const s = game.state;
  if (!record(s.foodBatches) || !Array.isArray(s.rooms) || !record(s.systemStats)) initializeSystems(game);
  reconcileStock(s);
  const regions = buildRooms(s), topology = buildPowerTopology(s);
  let remaining = dt, spoiled = 0;
  // Large direct calls still exhaust batteries partway through the interval.
  // The engine owns its clock; this function never advances state.time.
  while (remaining > 1e-9) {
    const step = Math.min(PERIOD, remaining);
    distributePower(s, topology, step, true);
    advanceTemperature(s, regions, step);
    spoiled += advanceFood(game, step);
    remaining -= step;
  }
  updateAmbientFields(s);
  if (spoiled > 0) {
    s.systemStats.spoiled += spoiled;
    if (!record(s.lastAlerts)) s.lastAlerts = {};
    if (typeof game._log === 'function' && finite(s.time) - finite(s.lastAlerts.spoilage, -100) >= 20) {
      s.lastAlerts.spoilage = finite(s.time);
      game._log('warning', '음식이 상했습니다', `${spoiled}개의 음식이 부패했습니다. 밀폐된 창고와 전원이 연결된 냉각기를 확인하세요.`);
    }
  }
}

/** Strict extension validation before v2 state reaches simulation or drawing. */
export function validateSystems(data, bad) {
  const fail = label => { bad(label); throw new Error(`Invalid system state: ${label}`); };
  const num = (value, min, max, label) => { if (!Number.isFinite(value) || value < min || value > max) fail(label); };
  const integer = (value, min, max, label) => { if (!Number.isInteger(value)) fail(label); num(value, min, max, label); };
  const boolean = (value, label) => { if (typeof value !== 'boolean') fail(label); };
  if (!record(data) || !Array.isArray(data.tiles)) fail('시스템 지도');
  const count = data.tiles.length, roomIds = new Set(), networkIds = new Set(), memberships = new Map();
  if (!Array.isArray(data.rooms) || data.rooms.length > count) fail('방 목록');
  let previousRoomId = -1;
  for (const room of data.rooms) {
    if (!record(room) || !Array.isArray(room.tiles)) fail('방 상태');
    integer(room.id, 0, count - 1, '방 ID');
    if (room.id <= previousRoomId || roomIds.has(room.id)) fail('방 ID 순서');
    previousRoomId = room.id; roomIds.add(room.id);
    integer(room.area, 1, MAX_ROOM_AREA, '방 면적');
    if (room.tiles.length !== room.area) fail('방 타일 수');
    num(room.temperature, -100, 150, '실내 온도');
    integer(room.beds, 0, room.area, '실내 침상');
    integer(room.stockpileTiles, 0, room.area, '실내 창고');
    let previous = -1;
    for (const index of room.tiles) {
      integer(index, 0, count - 1, '방 타일');
      if (index <= previous || memberships.has(index)) fail('중복 방 타일');
      previous = index; memberships.set(index, room.id);
    }
    if (room.id !== room.tiles[0]) fail('방 ID 참조');
  }
  const power = data.power;
  if (!record(power) || !Array.isArray(power.networks) || power.networks.length > count) fail('전력 상태');
  const powerFields = ['generation', 'demand', 'servedDemand', 'stored', 'capacity'];
  for (const key of powerFields) num(power[key], 0, 1e12, `전력 ${key}`);
  if (power.stored > power.capacity + 1e-6 || power.servedDemand > power.demand + 1e-6) fail('전력 수지');
  const sums = { generation: 0, demand: 0, servedDemand: 0, stored: 0, capacity: 0 };
  let previousNetworkId = -1;
  for (const network of power.networks) {
    if (!record(network)) fail('전력망');
    integer(network.id, 0, count - 1, '전력망 ID');
    if (network.id <= previousNetworkId || networkIds.has(network.id)) fail('전력망 ID 순서');
    previousNetworkId = network.id; networkIds.add(network.id);
    for (const key of powerFields) { num(network[key], 0, 1e12, `전력망 ${key}`); sums[key] += network[key]; }
    if (network.stored > network.capacity + 1e-6 || network.servedDemand > network.demand + 1e-6) fail('전력망 수지');
  }
  for (const key of ['generation', 'servedDemand', 'stored', 'capacity']) if (Math.abs(sums[key] - power[key]) > 1e-5) fail('전력망 합계');
  if (sums.demand > power.demand + 1e-5) fail('미연결 전력 수요');
  for (let index = 0; index < count; index++) {
    const tile = data.tiles[index];
    if (!record(tile)) fail('시스템 타일');
    num(tile.temperature, -100, 150, '타일 온도');
    boolean(tile.roofed, '지붕 상태');
    if (tile.roomId !== null && (!Number.isInteger(tile.roomId) || !roomIds.has(tile.roomId))) fail('방 참조');
    const expected = memberships.get(index) ?? null;
    if (tile.roomId !== expected || tile.roofed !== (expected !== null)) fail('방·지붕 타일 불일치');
    if (tile.building) {
      const building = tile.building;
      boolean(building.powered, '건물 전력');
      if (building.networkId !== null && (!Number.isInteger(building.networkId) || !networkIds.has(building.networkId))) fail('건물 전력망 참조');
      if (building.type === 'battery') num(building.charge, 0, BATTERY_CAPACITY, '배터리 충전량');
    }
  }
  if (!record(data.foodBatches) || !record(data.resources)) fail('식량 묶음');
  for (const type of Object.keys(FOOD_LIFE)) {
    const batches = data.foodBatches[type];
    if (!Array.isArray(batches) || batches.length > 10000) fail('식량 묶음 목록');
    let total = 0;
    for (const batch of batches) {
      if (!record(batch)) fail('식량 묶음 상태');
      integer(batch.count, 1, 1e8, '식량 묶음 수량');
      num(batch.freshness, 0, 1, '식량 신선도');
      integer(batch.x, 0, data.width - 1, '식량 보관 x');
      integer(batch.y, 0, data.height - 1, '식량 보관 y');
      total += batch.count;
    }
    if (total !== data.resources[type]) fail('식량 재고와 묶음 합계');
  }
  if (!record(data.systemStats)) fail('시스템 통계');
  integer(data.systemStats.spoiled, 0, 1e12, '부패 통계');
  for (const item of data.items || []) if (isFood(item.type) || item.freshness !== undefined) num(item.freshness, 0, 1, '물품 신선도');
  for (const colonist of data.colonists || []) {
    num(colonist.ambientTemperature, -100, 150, '주민 체감 온도');
    boolean(colonist.sheltered, '주민 실내 상태');
    num(colonist.thermalStress, 0, 100, '주민 온도 부담');
    if (colonist.carry && (isFood(colonist.carry.type) || colonist.carry.freshness !== undefined)) num(colonist.carry.freshness, 0, 1, '운반 음식 신선도');
  }
  return true;
}
