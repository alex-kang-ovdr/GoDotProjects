/**
 * Deterministic visiting trader. There are no calls to the colony RNG, clocks,
 * DOM, or engine imports. Purchased goods and sale proceeds enter the ordinary
 * loose-item / hauling pipeline; only already-deposited stock can be sold.
 */
import { TRADE_PRICES } from './economy-data.js?v=4.0.0';
import { withdrawStock } from './colony-systems.js?v=4.0.0';

const FIRST_VISIT = 80, NEXT_VISIT = 220, STAY = 100;
const SPEED = 1.8, REPATH = 2, BLOCK_LIMIT = 12, TRAVEL_LIMIT = 120;
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const INITIAL_STOCK = Object.freeze({ wood: 30, steel: 24, rawfood: 16, meals: 10, medicine: 6, tool: 2, armor: 2, rifle: 2 });
const LABELS = Object.freeze({ wood: '목재', steel: '강철', rawfood: '식재료', meals: '식사', medicine: '약품', tool: '작업 도구', armor: '방탄 조끼', rifle: '개량 소총' });
const NAMES = ['갈대길 상인', '먼별 상인', '솔바람 상인', '노을길 상인'];
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const cell = actor => ({ x: Math.floor(actor.x), y: Math.floor(actor.y) });
const sameCell = (a, b) => a?.x === b?.x && a?.y === b?.y;

function visitHash(seed, visit) {
  let value = (seed >>> 0) ^ Math.imul(visit, 0x9e3779b9);
  value = Math.imul(value ^ value >>> 16, 0x7feb352d);
  value = Math.imul(value ^ value >>> 15, 0x846ca68b);
  return (value ^ value >>> 16) >>> 0;
}

function tileAt(state, x, y) {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= state.width || y >= state.height) return null;
  return state.tiles[y * state.width + x] || null;
}

function safe(tile) {
  return Boolean(tile && tile.terrain !== 'water' && !(tile.fire > 0)
    && !(tile.building?.complete && tile.building.type === 'wall'));
}

// One flood fill answers both route and return-path questions on this undirected
// grid. Fire is always excluded; traders do not use the worker's unsafe fallback.
function reachable(state, start) {
  const size = state.tiles.length, previous = new Int32Array(size), distance = new Int32Array(size);
  previous.fill(-2); distance.fill(-1);
  if (!tileAt(state, start.x, start.y)) return { previous, distance, start: -1 };
  const origin = start.y * state.width + start.x, queue = new Int32Array(size);
  let head = 0, tail = 0;
  previous[origin] = -1; distance[origin] = 0; queue[tail++] = origin;
  while (head < tail) {
    const index = queue[head++], x = index % state.width, y = Math.floor(index / state.width);
    for (const [dx, dy] of DIRS) {
      const next = tileAt(state, x + dx, y + dy);
      if (!safe(next)) continue;
      const n = next.y * state.width + next.x;
      if (previous[n] !== -2) continue;
      previous[n] = index; distance[n] = distance[index] + 1; queue[tail++] = n;
    }
  }
  return { previous, distance, start: origin };
}

function pathFrom(state, map, target) {
  const goal = target.y * state.width + target.x;
  if (map.start < 0 || map.previous[goal] === -2) return null;
  const path = [];
  for (let index = goal; index !== map.start; index = map.previous[index]) path.push({ x: index % state.width, y: Math.floor(index / state.width) });
  return path.reverse();
}

export function initializeTrade(game, { migration = false } = {}) {
  const state = game.state;
  // Old-version payloads cannot inject a future visitor or invent trade income.
  // The engine invokes this only on its cloned migration state, never on a v4 load.
  if (migration) {
    state.trade = { nextVisitAt: finite(state.time) + FIRST_VISIT, visits: 0, visitor: null, stats: { bought: 0, sold: 0, earned: 0, spent: 0 } };
    return;
  }
  if (!record(state.trade)) state.trade = {};
  const trade = state.trade;
  if (trade.nextVisitAt === undefined) trade.nextVisitAt = finite(state.time) + FIRST_VISIT;
  if (trade.visits === undefined) trade.visits = 0;
  if (trade.visitor === undefined) trade.visitor = null;
  if (!record(trade.stats)) trade.stats = {};
  for (const key of ['bought', 'sold', 'earned', 'spent']) if (trade.stats[key] === undefined) trade.stats[key] = 0;
}

function findVisitRoute(state) {
  const depots = state.tiles.filter(tile => tile.zone === 'stockpile' && safe(tile));
  if (!depots.length) return null;
  const anchor = {
    x: depots.reduce((n, tile) => n + tile.x, 0) / depots.length,
    y: depots.reduce((n, tile) => n + tile.y, 0) / depots.length
  };
  const hash = visitHash(state.seed, state.trade.visits + 1);
  const preferredY = clamp(Math.round(anchor.y) + hash % 9 - 4, 1, state.height - 2);
  const entries = state.tiles.filter(tile => tile.x === state.width - 1 && safe(tile))
    .sort((a, b) => Math.abs(a.y - preferredY) - Math.abs(b.y - preferredY) || a.y - b.y);
  const meetings = state.tiles.filter(tile => safe(tile) && !tile.roofed && !tile.building && !tile.feature && !tile.crop && !tile.zone
    && Math.abs(tile.x - anchor.x) + Math.abs(tile.y - anchor.y) >= 4
    && Math.abs(tile.x - anchor.x) + Math.abs(tile.y - anchor.y) <= 14)
    .sort((a, b) => {
      const score = tile => Math.abs(tile.x - Math.min(state.width - 3, anchor.x + 8)) + Math.abs(tile.y - anchor.y) * 1.3;
      return score(a) - score(b) || a.y - b.y || a.x - b.x;
    });
  for (const entry of entries) {
    const map = reachable(state, entry);
    if (!depots.some(tile => map.distance[tile.y * state.width + tile.x] >= 0)) continue;
    const meeting = meetings.find(tile => map.distance[tile.y * state.width + tile.x] >= 0);
    if (meeting) return { entry: { x: entry.x, y: entry.y }, meeting: { x: meeting.x, y: meeting.y }, path: pathFrom(state, map, meeting), hash };
  }
  return null;
}

function beginVisit(game) {
  const state = game.state, trade = state.trade;
  if (state.activeRaid || state.gameOver) { trade.nextVisitAt = finite(state.time) + 30; return; }
  const route = findVisitRoute(state);
  if (!route) { trade.nextVisitAt = finite(state.time) + 30; return; }
  trade.visits++;
  trade.visitor = {
    id: `trader_${trade.visits}`, name: NAMES[route.hash % NAMES.length],
    x: route.entry.x + 0.5, y: route.entry.y + 0.5,
    phase: 'arriving', path: route.path, destination: { ...route.meeting },
    entry: route.entry, meeting: route.meeting,
    arrivedAt: null, leavesAt: null, nextPathAt: finite(state.time), blockedTime: 0, travelElapsed: 0,
    stock: { ...INITIAL_STOCK }, silver: 180
  };
  if (typeof game._log === 'function') game._log('info', '상인이 찾아옵니다', `${trade.visitor.name}이(가) 정착지 외곽으로 이동 중입니다. 도착하면 창고의 은화와 물품으로 교역할 수 있습니다.`);
}

function routeToExit(state, visitor) {
  const map = reachable(state, cell(visitor));
  const exits = state.tiles.filter(tile => tile.x === state.width - 1 && safe(tile) && map.distance[tile.y * state.width + tile.x] >= 0)
    .sort((a, b) => map.distance[a.y * state.width + a.x] - map.distance[b.y * state.width + b.x]
      || Math.abs(a.y - visitor.entry.y) - Math.abs(b.y - visitor.entry.y) || a.y - b.y);
  if (!exits.length) { visitor.path = []; visitor.destination = { ...visitor.entry }; return false; }
  visitor.destination = { x: exits[0].x, y: exits[0].y };
  visitor.path = pathFrom(state, map, visitor.destination);
  return true;
}

function beginLeaving(game, reason) {
  const state = game.state, visitor = state.trade.visitor;
  if (!visitor || visitor.phase === 'leaving') return;
  visitor.phase = 'leaving'; visitor.blockedTime = 0; visitor.travelElapsed = 0;
  routeToExit(state, visitor); visitor.nextPathAt = finite(state.time) + REPATH;
  if (typeof game._log === 'function') game._log('info', '상인이 돌아갑니다', reason || '거래 시간이 끝났습니다. 이미 배송된 물품과 은화는 정착지에 남습니다.');
}

function finishVisit(state) {
  state.trade.visitor = null;
  state.trade.nextVisitAt = finite(state.time) + NEXT_VISIT;
}

function replan(state, visitor) {
  visitor.nextPathAt = finite(state.time) + REPATH;
  if (visitor.phase === 'leaving') return routeToExit(state, visitor);
  if (!safe(tileAt(state, visitor.meeting.x, visitor.meeting.y))) { visitor.path = []; return false; }
  const path = pathFrom(state, reachable(state, cell(visitor)), visitor.meeting);
  visitor.path = path || [];
  return path !== null;
}

function advanceVisitor(game, dt) {
  const state = game.state, visitor = state.trade.visitor;
  if (!visitor) return;
  const meeting = tileAt(state, visitor.meeting.x, visitor.meeting.y);
  if (visitor.phase !== 'leaving' && (state.activeRaid || !safe(meeting) || meeting.building)) {
    beginLeaving(game, '습격이나 만남 지점의 위험으로 교역을 중단합니다. 상인이 안전한 길을 찾아 떠납니다.');
  }
  if (visitor.phase === 'trading') {
    if (finite(state.time) >= visitor.leavesAt) beginLeaving(game);
    else return;
  }
  visitor.travelElapsed += dt;
  if (visitor.travelElapsed >= TRAVEL_LIMIT) {
    if (visitor.phase === 'leaving') finishVisit(state);
    else beginLeaving(game, '접근 경로가 오래 막혀 이번 방문을 마칩니다.');
    return;
  }
  let blocked = false;
  if (visitor.path.length && !safe(tileAt(state, visitor.path[0].x, visitor.path[0].y))) visitor.path = [];
  const atDestination = () => Math.hypot(visitor.x - visitor.destination.x - 0.5, visitor.y - visitor.destination.y - 0.5) < 1e-7;
  if (!visitor.path.length && !atDestination()) {
    if (finite(state.time) >= visitor.nextPathAt) replan(state, visitor);
    if (!visitor.path.length) blocked = true;
  }
  if (!blocked) {
    let distance = SPEED * dt;
    while (distance > 1e-9 && visitor.path.length) {
      const next = visitor.path[0];
      if (!safe(tileAt(state, next.x, next.y))) { visitor.path = []; blocked = true; break; }
      const dx = next.x + 0.5 - visitor.x, dy = next.y + 0.5 - visitor.y, length = Math.hypot(dx, dy);
      if (length <= distance + 1e-9) { visitor.x = next.x + 0.5; visitor.y = next.y + 0.5; distance -= length; visitor.path.shift(); }
      else { visitor.x += dx / length * distance; visitor.y += dy / length * distance; distance = 0; }
    }
  }
  visitor.blockedTime = blocked ? visitor.blockedTime + dt : 0;
  if (visitor.blockedTime >= BLOCK_LIMIT) {
    if (visitor.phase === 'leaving') finishVisit(state);
    else beginLeaving(game, '만남 지점으로 가는 길이 막혀 상인이 돌아갑니다.');
    return;
  }
  if (!visitor.path.length && atDestination()) {
    if (visitor.phase === 'leaving') { finishVisit(state); return; }
    visitor.phase = 'trading'; visitor.arrivedAt = finite(state.time); visitor.leavesAt = finite(state.time) + STAY;
    visitor.travelElapsed = 0; visitor.blockedTime = 0;
    if (typeof game._log === 'function') game._log('success', '교역을 시작할 수 있습니다', `${visitor.name}이(가) 100초 동안 머뭅니다. 구매품과 판매 대금은 상인 옆에 내려놓으므로 창고로 운반하세요.`);
  }
}

export function updateTrade(game, dt) {
  if (!Number.isFinite(dt) || dt <= 0 || !game?.state) return;
  const state = game.state;
  if (!record(state.trade)) initializeTrade(game);
  if (!state.trade.visitor && finite(state.time) >= state.trade.nextVisitAt) beginVisit(game);
  let remaining = dt;
  while (remaining > 1e-9 && state.trade.visitor) {
    const step = Math.min(0.5, remaining); advanceVisitor(game, step); remaining -= step;
  }
}

function availableExchange(state, visitor) {
  const position = cell(visitor), delivery = tileAt(state, position.x, position.y);
  if (!safe(delivery) || delivery.building) return null;
  const map = reachable(state, position);
  const hasDepot = state.tiles.some(tile => tile.zone === 'stockpile' && safe(tile) && map.distance[tile.y * state.width + tile.x] >= 0);
  if (!hasDepot) return null;
  const civilian = (state.colonists || []).some(pawn => !pawn.dead && !pawn.drafted && pawn.health >= 15
    && !pawn.carriedBy && !pawn.carryingPawnId && !pawn.patientBedId
    && safe(tileAt(state, Math.floor(pawn.x), Math.floor(pawn.y)))
    && map.distance[Math.floor(pawn.y) * state.width + Math.floor(pawn.x)] >= 0);
  return civilian ? position : null;
}

export function executeTrade(game, payload) {
  const no = message => ({ ok: false, message });
  const state = game?.state, visitor = state?.trade?.visitor;
  if (!record(payload) || !state || !visitor) return no('현재 교역할 상인이 없습니다.');
  if (payload.traderId !== visitor.id || visitor.phase !== 'trading') return no('현재 방문한 상인이 만남 지점에 도착해야 합니다.');
  if (state.gameOver || state.activeRaid || finite(state.time) >= visitor.leavesAt) return no('위험 상황이거나 교역 시간이 끝났습니다.');
  const { side, type, count } = payload;
  if (!['buy', 'sell'].includes(side) || !Object.hasOwn(TRADE_PRICES, type) || !Number.isInteger(count) || count < 1 || count > 100) return no('거래 종류와 1~100개의 정수 수량을 확인하세요.');
  const price = TRADE_PRICES[type][side];
  if (!Number.isInteger(price) || price <= 0) return no('식품은 상인에게 구매만 할 수 있습니다.');
  const total = price * count;
  if (side === 'buy') {
    if (visitor.stock[type] < count) return no('상인에게 그만큼의 재고가 없습니다.');
    if (finite(state.resources.silver) < total) return no('창고에 입고된 은화가 부족합니다. 바닥의 은화를 먼저 운반하세요.');
    if (visitor.silver + total > 1e8) return no('상인의 은화 보관 한도를 넘습니다.');
  } else {
    if (finite(state.resources[type]) < count) return no('창고에 입고된 판매 물품이 부족합니다. 바닥·운반·장착 물품은 판매하지 않습니다.');
    if (visitor.silver < total) return no('상인에게 지급할 은화가 부족합니다.');
    if (visitor.stock[type] + count > 1e8) return no('상인의 물품 보관 한도를 넘습니다.');
  }
  const position = availableExchange(state, visitor);
  if (!position) return no('안전한 배송 위치와 창고, 상인에게 왕복할 수 있는 비징집 주민이 필요합니다.');
  if (typeof game._dropItem !== 'function') return no('물품 배송을 준비할 수 없습니다.');
  const dropType = side === 'buy' ? type : 'silver', dropCount = side === 'buy' ? count : total;
  const stack = state.items.find(item => item.type === dropType && item.x === position.x && item.y === position.y && !item.reservedBy);
  if (stack && stack.count + dropCount > 1e8 || !stack && state.items.length >= 10000) return no('배송 물품을 놓을 공간이 부족합니다. 기존 물품을 운반하세요.');
  // Everything that can reject has been checked before the one stock debit.
  const taken = withdrawStock(game, side === 'buy' ? 'silver' : type, side === 'buy' ? total : count);
  if (!taken.ok) return no('거래할 창고 재고를 다시 확인하세요.');
  if (side === 'buy') {
    visitor.stock[type] -= count; visitor.silver += total;
    state.trade.stats.bought += count; state.trade.stats.spent += total;
  } else {
    visitor.stock[type] += count; visitor.silver -= total;
    state.trade.stats.sold += count; state.trade.stats.earned += total;
  }
  game._dropItem(dropType, dropCount, position.x, position.y, 1);
  if (typeof game._wake === 'function') game._wake();
  const message = side === 'buy' ? `${LABELS[type]} ${count}개를 은화 ${total}개에 구매했습니다. 상인 옆 물품을 창고로 운반하세요.`
    : `${LABELS[type]} ${count}개를 판매했습니다. 상인 옆의 은화 ${total}개를 창고로 운반하세요.`;
  if (typeof game._log === 'function') game._log('success', side === 'buy' ? '물품 구매' : '물품 판매', message);
  return { ok: true, message };
}

export function validateTrade(data, bad) {
  const fail = label => { bad(label); throw new Error(`Invalid trade state: ${label}`); };
  const number = (value, min, max, label) => { if (!Number.isFinite(value) || value < min || value > max) fail(label); };
  const integer = (value, min, max, label) => { if (!Number.isInteger(value)) fail(label); number(value, min, max, label); };
  const point = (value, label) => {
    if (!record(value)) fail(label);
    integer(value.x, 0, data.width - 1, label); integer(value.y, 0, data.height - 1, label);
  };
  if (!record(data?.trade) || !Array.isArray(data.tiles) || !Number.isInteger(data.width) || !Number.isInteger(data.height)
    || data.width < 1 || data.height < 1 || data.tiles.length !== data.width * data.height) fail('교역 상태');
  const trade = data.trade;
  number(trade.nextVisitAt, 0, 1e10, '상인 방문 시각'); integer(trade.visits, 0, 1e10, '상인 방문 수');
  if (!record(trade.stats)) fail('교역 통계');
  for (const key of ['bought', 'sold', 'earned', 'spent']) integer(trade.stats[key], 0, 1e10, '교역 통계');
  const visitor = trade.visitor;
  if (visitor === null) return true;
  if (!record(visitor) || trade.visits < 1) fail('방문 상인');
  if (typeof visitor.id !== 'string' || !visitor.id || visitor.id.length > 100 || typeof visitor.name !== 'string' || !visitor.name || visitor.name.length > 100) fail('상인 신원');
  if (visitor.id !== `trader_${trade.visits}`) fail('현재 방문 상인 ID');
  number(visitor.x, 0, data.width - 0.000001, '상인 x'); number(visitor.y, 0, data.height - 0.000001, '상인 y');
  if (!['arriving', 'trading', 'leaving'].includes(visitor.phase)) fail('상인 단계');
  point(visitor.entry, '상인 입구'); point(visitor.meeting, '만남 지점'); point(visitor.destination, '상인 목적지');
  if (visitor.entry.x !== data.width - 1) fail('상인 지도 입구');
  if (visitor.phase === 'arriving' && !sameCell(visitor.destination, visitor.meeting)) fail('상인 도착 목적지');
  if (visitor.phase === 'leaving' && visitor.destination.x !== data.width - 1) fail('상인 퇴장 목적지');
  if (!Array.isArray(visitor.path) || visitor.path.length > data.tiles.length) fail('상인 이동 경로');
  let previous = cell(visitor);
  for (let i = 0; i < visitor.path.length; i++) {
    const step = visitor.path[i]; point(step, '상인 경로 좌표');
    const distance = Math.abs(step.x - previous.x) + Math.abs(step.y - previous.y);
    if (distance > 1 || i > 0 && distance !== 1) fail('상인 경로 연결');
    previous = step;
  }
  if (visitor.path.length && !sameCell(previous, visitor.destination)) fail('상인 경로 끝');
  if (visitor.arrivedAt !== null) number(visitor.arrivedAt, 0, data.time, '상인 도착 시각');
  if (visitor.leavesAt !== null) number(visitor.leavesAt, 0, 1e10, '상인 출발 시각');
  if ((visitor.arrivedAt === null) !== (visitor.leavesAt === null)) fail('상인 체류 시각');
  if (visitor.arrivedAt !== null && Math.abs(visitor.leavesAt - visitor.arrivedAt - STAY) > 1e-6) fail('상인 체류 기간');
  if (visitor.phase === 'arriving' && visitor.arrivedAt !== null) fail('도착 전 상인 시각');
  if (visitor.phase === 'trading' && (visitor.arrivedAt === null || visitor.path.length || Math.hypot(visitor.x - visitor.meeting.x - 0.5, visitor.y - visitor.meeting.y - 0.5) > 1e-6)) fail('교역 지점 상인');
  for (const key of ['nextPathAt', 'blockedTime', 'travelElapsed']) number(visitor[key], 0, 1e10, '상인 이동 시간');
  if (!record(visitor.stock) || Object.keys(visitor.stock).length !== Object.keys(INITIAL_STOCK).length) fail('상인 재고 목록');
  for (const type of Object.keys(INITIAL_STOCK)) integer(visitor.stock[type], 0, 1e8, '상인 재고');
  integer(visitor.silver, 0, 1e8, '상인 은화');
  return true;
}
