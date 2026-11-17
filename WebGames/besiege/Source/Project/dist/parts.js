/**
 * IRONWOOD's small, original block catalogue and build graph.
 * Grid centers are integral. Render/physics add 0.72 to the Y coordinate.
 * A mechanical connection always points from support `a` to moving part `b`.
 */

export const BUILD_BOUNDS = Object.freeze({ x: 12, y: 10, z: 12, maxParts: 100 });
export const POWER_LIMITS = Object.freeze({ min: 0.3, max: 2, step: 0.1, default: 1 });
export const ELEVATION_LIMITS = Object.freeze({ min: -10, max: 45, step: 1, default: 0 });
export const STROKE_LIMITS = Object.freeze({ min: 0.25, max: 2, step: 0.05, default: 1.5 });

export const PARTS = Object.freeze({
  core: Object.freeze({
    name: '중심 코어', short: '코어', category: 'structure',
    description: '기체의 기준 블록. 한 기체에 하나만 두며 모든 부품을 이 코어에 연결합니다.',
    mass: 3, color: '#c58a49', cost: 5, maxHp: 100,
  }),
  wood: Object.freeze({
    name: '목재 블록', short: '목재', category: 'structure',
    description: '상하좌우와 앞뒤로 맞닿은 구조 부품을 잇는 기본 프레임입니다.',
    mass: 1, color: '#b98551', cost: 1, maxHp: 55,
  }),
  wheel: Object.freeze({
    name: '구동 바퀴', short: '바퀴', category: 'movement',
    description: '차축 방향의 이웃 하나에 장착합니다. 좌우 구동을 나누면 선회할 수 있습니다.',
    mass: 1.4, color: '#535d64', cost: 3, maxHp: 50,
  }),
  cannon: Object.freeze({
    name: '대포', short: '대포', category: 'weapon',
    description: '포신 앞으로 포탄을 발사합니다. 발사 반동을 버틸 지지 구조가 필요합니다.',
    mass: 3, color: '#5b656a', cost: 5, maxHp: 75,
  }),
  brace: Object.freeze({
    name: '강철 보강', short: '보강', category: 'structure',
    description: '일반 목재보다 강한 고정 연결을 만드는 보강 블록입니다.',
    mass: 1.3, color: '#76888b', cost: 2, maxHp: 110,
  }),
  hinge: Object.freeze({
    name: '회전 관절', short: '관절', category: 'mechanism',
    description: '아래 지지 블록을 축으로 회전하며 위에 얹은 부품을 함께 돌립니다.',
    mass: 1.5, color: '#ca9a52', cost: 3, maxHp: 65,
  }),
  float: Object.freeze({
    name: '부유체', short: '부유체', category: 'water',
    description: '물에 잠긴 만큼 부력을 받습니다. 좌우와 앞뒤로 나누어 배치하면 선체를 안정시키기 좋습니다.',
    mass: 0.7, color: '#b98753', cost: 3, maxHp: 65,
  }),
  propeller: Object.freeze({
    name: '추진 프로펠러', short: '추진기', category: 'movement',
    description: 'W/S로 포신과 같은 전방 축을 따라 추력을 냅니다. 코어와 연결된 추진기만 조작할 수 있습니다.',
    mass: 1.5, color: '#72958a', cost: 5, maxHp: 55,
  }),
  wing: Object.freeze({
    name: '양력 날개', short: '날개', category: 'air',
    description: '앞으로 움직일 때 양력을 받는 날개입니다. 좌우 대칭과 무게중심을 고려하고 과도한 받음각을 피하세요.',
    mass: 0.6, color: '#c7ba8e', cost: 3, maxHp: 45, defaultElevation: 6,
  }),
  piston: Object.freeze({
    name: '선형 피스톤', short: '피스톤', category: 'mechanism',
    description: '바로 아래 지지 블록을 기준으로 위쪽 하중을 밀어 올립니다. Z/X로 늘리거나 줄이고 중립에서는 목표 위치를 유지합니다.',
    mass: 1.8, color: '#9b9f9c', cost: 4, maxHp: 70, defaultStroke: STROKE_LIMITS.default,
  }),
});

export const MISSIONS = Object.freeze([
  Object.freeze({
    id: 'outpost', name: '돌초소', subtitle: '첫 번째 시험장',
    description: '9개 표적을 파괴하세요. 중앙 방어 포탑부터 노리고 붉은 공격 예고가 보이면 이동하세요.',
    targetCount: 9, timeHint: '제한 3분 · 시간 별 1분',
    budget: 45, ammo: 12, timeLimit: 180, parTime: 60, parShots: 5, campaign: true,
    objective: 'destroy', environment: 'land', recommendedPreset: 'rover', checkpointCount: 0,
  }),
  Object.freeze({
    id: 'gate', name: '성문 돌파', subtitle: '구조와 화력의 시험',
    description: '방어 포탑 2개가 지키는 10개 표적을 돌파하세요. 엄폐물과 보강 차체로 코어를 지키세요.',
    targetCount: 10, timeHint: '제한 3분 · 시간 별 1분 30초',
    budget: 48, ammo: 14, timeLimit: 180, parTime: 90, parShots: 5, campaign: true,
    objective: 'destroy', environment: 'land', recommendedPreset: 'rover', checkpointCount: 0,
  }),
  Object.freeze({
    id: 'citadel', name: '철벽 요새', subtitle: '마지막 공성 시험',
    description: '세 방어 포탑이 지키는 15개 표적을 파괴하세요. 사격 각도와 이동 경로를 함께 설계해 보세요.',
    targetCount: 15, timeHint: '제한 3분 30초 · 시간 별 2분',
    budget: 60, ammo: 20, timeLimit: 210, parTime: 120, parShots: 10, campaign: true,
    objective: 'destroy', environment: 'land', recommendedPreset: 'rover', checkpointCount: 0,
  }),
  Object.freeze({
    id: 'harbor', name: '해협 항로', subtitle: '부력과 추진의 시험',
    description: '배를 띄우고 세 항로 표지를 순서대로 통과하세요. 부유체를 넓게 나누고 코어가 물에 잠기지 않게 설계하세요.',
    targetCount: 0, checkpointCount: 3, timeHint: '제한 2분 30초 · 시간 별 55초',
    budget: 65, ammo: 0, timeLimit: 150, parTime: 55, parShots: null, campaign: true,
    objective: 'route', environment: 'water', recommendedPreset: 'boat',
  }),
  Object.freeze({
    id: 'skyway', name: '하늘 회랑', subtitle: '양력과 조종의 시험',
    description: '활주로에서 이륙해 세 공중 고리를 순서대로 통과하세요. 속도를 얻은 뒤 기수를 들고 날개를 수평으로 유지하세요.',
    targetCount: 0, checkpointCount: 3, timeHint: '제한 2분 30초 · 시간 별 45초',
    budget: 70, ammo: 0, timeLimit: 150, parTime: 45, parShots: null, campaign: true,
    objective: 'route', environment: 'air', recommendedPreset: 'plane',
  }),
  Object.freeze({
    id: 'switchback', name: '굴곡 주행', subtitle: '차동 조향과 제동의 시험',
    description: '좌우로 어긋난 네 육상 관문을 순서대로 통과하세요. 커브 전에 감속하고 차체의 폭과 바퀴 구동을 조정해 보세요.',
    targetCount: 0, checkpointCount: 4, timeHint: '제한 2분 30초 · 시간 별 45초',
    budget: 55, ammo: 0, timeLimit: 150, parTime: 45, parShots: null, campaign: true,
    objective: 'route', environment: 'land', recommendedPreset: 'ram',
  }),
  Object.freeze({
    id: 'sandbox', name: '자유 제작', subtitle: '마음껏 조립하고 시험하기',
    description: '승리 조건 없이 주행, 관절과 파손을 시험하세요. 시험을 끝내면 설계 상태로 돌아갑니다.',
    targetCount: 0, timeHint: '시간 제한 없음',
    budget: null, ammo: null, timeLimit: null, parTime: null, parShots: null, campaign: false,
    objective: 'sandbox', environment: 'land', recommendedPreset: 'lift', checkpointCount: 0,
  }),
]);

const STRENGTH = Object.freeze({ fixed: 1400, reinforced: 2200, hinge: 1100, wheel: 1600, piston: 1800 });
const POSITIVE_NEIGHBORS = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const BINDINGS = new Set(['all', 'left', 'right']);
const keyAt = (x, y, z) => `${x},${y},${z}`;
const compareIds = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
const isPart = (p) => p !== null && typeof p === 'object' && !Array.isArray(p);
const hasType = (type) => typeof type === 'string' && Object.prototype.hasOwnProperty.call(PARTS, type);
const isGridPart = (p) => isPart(p) && hasType(p.type)
  && typeof p.id === 'string' && p.id.trim().length > 0
  && Number.isInteger(p.x) && Number.isInteger(p.y) && Number.isInteger(p.z)
  && Number.isInteger(p.rot) && p.rot >= 0 && p.rot <= 3;

/** New arrays/objects make editor history and simulation snapshots independent. */
export function cloneParts(parts) {
  if (!Array.isArray(parts)) return [];
  return parts.map((part) => isPart(part) ? { ...part } : part);
}

/**
 * Price and mass come only from the catalogue, never from imported overrides.
 * Invalid/unknown entries are ignored for a safe editor preview; validation
 * still decides whether the complete design may be loaded or simulated.
 */
export function getDesignStats(parts) {
  let cost = 0, mass = 0, count = 0;
  if (!Array.isArray(parts)) return { cost, mass, count };
  for (const part of parts) {
    if (!isPart(part) || typeof part.type !== 'string' || !hasType(part.type)) continue;
    cost += PARTS[part.type].cost;
    mass += PARTS[part.type].mass;
    count += 1;
  }
  // Catalogue masses have one decimal place; do not leak floating-point dust.
  return { cost, mass: Math.round(mass * 10) / 10, count };
}

/**
 * Standard blocks join by face adjacency, never by corners or visual overlap.
 * A wheel has one axle attachment. Hinges and pistons have one lower mechanical
 * joint and can support an upper fixed payload. Their sides never weld shut.
 * Invalid cells/IDs are handled by validateDesign; this helper never mutates
 * the design and also tolerates an incomplete editor/import preview.
 */
export function getConnections(parts) {
  if (!Array.isArray(parts)) return [];
  const byCell = new Map();
  const byId = new Map();
  for (const part of parts) {
    if (!isGridPart(part)) continue;
    const cellKey = keyAt(part.x, part.y, part.z);
    if (byCell.has(cellKey) || byId.has(part.id)) continue;
    byCell.set(cellKey, part);
    byId.set(part.id, part);
  }
  const ordered = [...byId.values()].sort(compareIds);
  const core = ordered.find((p) => p.type === 'core');
  const result = [];
  const seen = new Set();
  const at = (p, dx, dy, dz) => byCell.get(keyAt(p.x + dx, p.y + dy, p.z + dz));
  const fixedStrength = (a, b) => a.type === 'brace' || b.type === 'brace'
    ? STRENGTH.reinforced : STRENGTH.fixed;
  const add = (a, b, kind, strength) => {
    if (!a || !b || a.id === b.id) return;
    // JSON encoding avoids collisions even for user-imported IDs with separators.
    const pairKey = JSON.stringify([a.id, b.id].sort());
    if (seen.has(pairKey)) return;
    seen.add(pairKey);
    result.push({ a: a.id, b: b.id, kind, strength });
  };
  const ordinary = (p) => p && !['wheel', 'hinge', 'piston'].includes(p.type);

  for (const part of ordered) {
    if (!ordinary(part)) continue;
    for (const [dx, dy, dz] of POSITIVE_NEIGHBORS) {
      const neighbor = at(part, dx, dy, dz);
      if (ordinary(neighbor)) add(part, neighbor, 'fixed', fixedStrength(part, neighbor));
    }
  }

  for (const part of ordered) {
    if (part.type !== 'hinge' && part.type !== 'piston') continue;
    const support = at(part, 0, -1, 0);
    if (!support || support.type === 'wheel') continue;
    add(support, part, part.type, STRENGTH[part.type]);
    const payload = at(part, 0, 1, 0);
    if (ordinary(payload)) add(part, payload, 'fixed', fixedStrength(part, payload));
    // Each stacked mechanism creates its own lower joint in its iteration.
  }

  const distanceToCore = (p) => core
    ? Math.abs(p.x - core.x) + Math.abs(p.y - core.y) + Math.abs(p.z - core.z)
    : 0;
  for (const part of ordered) {
    if (part.type !== 'wheel') continue;
    const axis = part.rot % 2 === 0 ? [1, 0, 0] : [0, 0, 1];
    const candidates = [at(part, ...axis), at(part, ...axis.map((n) => -n))]
      .filter(ordinary)
      .sort((a, b) => distanceToCore(a) - distanceToCore(b) || compareIds(a, b));
    if (candidates.length) add(candidates[0], part, 'wheel', STRENGTH.wheel);
  }
  return result;
}

/**
 * Validate the actual attachment graph, not just visually neighboring cells.
 * Draft saves/imports may keep unconnected pieces; simulations remain strict.
 */
export function validateDesign(parts, { allowDisconnected = false } = {}) {
  const errors = [];
  const warnings = [];
  if (!Array.isArray(parts)) {
    return { valid: false, errors: ['설계 데이터는 부품 목록이어야 합니다.'], warnings };
  }
  if (parts.length > BUILD_BOUNDS.maxParts) {
    errors.push(`부품은 ${BUILD_BOUNDS.maxParts}개까지 사용할 수 있습니다.`);
  }
  const cores = parts.filter((p) => isPart(p) && p.type === 'core');
  if (cores.length !== 1) errors.push('중심 코어는 정확히 하나 있어야 합니다.');
  const ids = new Set();
  const cells = new Set();
  let malformed = false;
  for (let i = 0; i < parts.length; i += 1) {
    const p = parts[i];
    const label = isPart(p) && hasType(p.type) ? PARTS[p.type].name : `${i + 1}번째 부품`;
    if (!isPart(p)) {
      errors.push(`${i + 1}번째 부품의 데이터 형식이 올바르지 않습니다.`);
      malformed = true;
      continue;
    }
    if (!hasType(p.type)) { errors.push(`${label}: 알 수 없는 부품 종류입니다.`); malformed = true; }
    if (typeof p.id !== 'string' || !p.id.trim()) {
      errors.push(`${label}: 부품 ID가 없습니다.`); malformed = true;
    } else if (ids.has(p.id)) {
      errors.push(`${label}: 중복된 부품 ID가 있습니다.`); malformed = true;
    } else ids.add(p.id);

    if (![p.x, p.y, p.z].every(Number.isInteger)) {
      errors.push(`${label}: 격자 위치는 정수여야 합니다.`); malformed = true;
    } else {
      if (Math.abs(p.x) > BUILD_BOUNDS.x || Math.abs(p.z) > BUILD_BOUNDS.z
        || p.y < 0 || p.y > BUILD_BOUNDS.y) {
        errors.push(`${label}: 제작 범위는 X/Z -12~12, Y 0~10입니다.`);
      }
      const cellKey = keyAt(p.x, p.y, p.z);
      if (cells.has(cellKey)) { errors.push(`같은 격자 (${cellKey})에 부품이 겹쳐 있습니다.`); malformed = true; }
      cells.add(cellKey);
    }
    if (!Number.isInteger(p.rot) || p.rot < 0 || p.rot > 3) {
      errors.push(`${label}: 회전값은 0~3이어야 합니다.`); malformed = true;
    }
    if (!Number.isFinite(p.power) || p.power < POWER_LIMITS.min - 1e-9
      || p.power > POWER_LIMITS.max + 1e-9) {
      errors.push(`${label}: 출력은 ${POWER_LIMITS.min}~${POWER_LIMITS.max} 범위여야 합니다.`);
    }
    if (p.elevation !== undefined && (!Number.isFinite(p.elevation)
      || p.elevation < ELEVATION_LIMITS.min || p.elevation > ELEVATION_LIMITS.max)) {
      errors.push(`${label}: 포의 상하 각도 또는 날개 설치각은 ${ELEVATION_LIMITS.min}~${ELEVATION_LIMITS.max}도 범위여야 합니다.`);
    }
    if (p.stroke !== undefined && (!Number.isFinite(p.stroke)
      || p.stroke < STROKE_LIMITS.min || p.stroke > STROKE_LIMITS.max)) {
      errors.push(`${label}: 피스톤 행정은 ${STROKE_LIMITS.min}~${STROKE_LIMITS.max}m 범위여야 합니다.`);
    }
    if (!BINDINGS.has(p.binding)) errors.push(`${label}: 구동 그룹은 전체·왼쪽·오른쪽 중 하나여야 합니다.`);
  }

  if (!malformed && cores.length === 1) {
    const topologyIssues = allowDisconnected ? warnings : errors;
    const connections = getConnections(parts);
    const neighbors = new Map(parts.map((p) => [p.id, new Set()]));
    for (const c of connections) {
      neighbors.get(c.a).add(c.b);
      neighbors.get(c.b).add(c.a);
    }
    const reachable = new Set([cores[0].id]);
    const queue = [cores[0].id];
    for (let i = 0; i < queue.length; i += 1) {
      for (const next of neighbors.get(queue[i]) || []) {
        if (!reachable.has(next)) { reachable.add(next); queue.push(next); }
      }
    }
    const disconnected = parts.filter((p) => !reachable.has(p.id));
    if (disconnected.length) {
      const examples = disconnected.slice(0, 3)
        .map((p) => `${PARTS[p.type].short} (${p.x},${p.y},${p.z})`).join(', ');
      topologyIssues.push(`코어에 연결되지 않은 부품 ${disconnected.length}개: ${examples}${disconnected.length > 3 ? ' 외' : ''}.`);
    }
    for (const p of parts) {
      if (p.type === 'wheel' && !connections.some((c) => c.kind === 'wheel' && c.b === p.id)) {
        topologyIssues.push(`바퀴 (${p.x},${p.y},${p.z})의 차축 방향에 지지 블록이 필요합니다. R로 방향을 바꿔 보세요.`);
      }
      if (p.type === 'hinge' && !connections.some((c) => c.kind === 'hinge' && c.b === p.id)) {
        topologyIssues.push(`관절 (${p.x},${p.y},${p.z}) 바로 아래에 지지 블록이 필요합니다.`);
      }
      if (p.type === 'piston' && !connections.some((c) => c.kind === 'piston' && c.b === p.id)) {
        topologyIssues.push(`피스톤 (${p.x},${p.y},${p.z}) 바로 아래에 지지 블록이 필요합니다.`);
      }
    }
    // A rigid bypass around a hinge can lock the intended moving assembly.
    const fixedNeighbors = new Map(parts.map((p) => [p.id, new Set()]));
    for (const c of connections.filter((c) => c.kind === 'fixed')) {
      fixedNeighbors.get(c.a).add(c.b); fixedNeighbors.get(c.b).add(c.a);
    }
    for (const pivot of connections.filter((c) => c.kind === 'hinge' || c.kind === 'piston')) {
      const seen = new Set([pivot.a]);
      const pending = [pivot.a];
      for (let i = 0; i < pending.length; i += 1) {
        for (const next of fixedNeighbors.get(pending[i]) || []) {
          if (!seen.has(next)) { seen.add(next); pending.push(next); }
        }
      }
      if (seen.has(pivot.b)) {
        warnings.push(`${pivot.kind === 'piston' ? '피스톤' : '관절'}을 우회하는 고정 연결이 있습니다. 움직일 공간과 상부 구조의 연결을 확인하세요.`);
        break;
      }
    }
  }
  const usesWaterOrAir = parts.some((p) => isPart(p) && (p.type === 'float' || p.type === 'wing'));
  if (!usesWaterOrAir && !parts.some((p) => isPart(p) && p.type === 'wheel')) warnings.push('구동 바퀴가 없어 지상 주행이 어렵습니다.');
  if (!usesWaterOrAir && !parts.some((p) => isPart(p) && p.type === 'cannon')) warnings.push('대포가 없어 사격은 불가능합니다.');
  return { valid: errors.length === 0, errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

export function makePreset(name = 'rover') {
  const preset = ['rover', 'ram', 'blank', 'boat', 'plane', 'lift'].includes(name) ? name : 'rover';
  const parts = [];
  const add = (type, x, y, z, extra = {}) => {
    parts.push({ id: `${preset}-${parts.length + 1}`, type, x, y, z, rot: 0,
      power: POWER_LIMITS.default, binding: 'all', elevation: PARTS[type].defaultElevation ?? ELEVATION_LIMITS.default,
      ...(type === 'piston' ? { stroke: STROKE_LIMITS.default } : {}), ...extra });
  };
  add('core', 0, preset === 'boat' || preset === 'plane' ? 1 : 0, 0);
  if (preset === 'blank') return parts;

  if (preset === 'lift') {
    for (let z = -1; z <= 1; z += 1) {
      for (let x = -1; x <= 1; x += 1) if (x || z) add('brace', x, 0, z);
    }
    add('piston', 0, 1, 0);
    for (const [x, z] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) add('wood', x, 2, z);
    return parts;
  }

  if (preset === 'boat') {
    add('wood', 0, 0, 0);
    for (const z of [-1, 1]) {
      add('wood', 0, 0, z);
      for (const x of [-1, 1]) add('wood', x, 0, z);
    }
    for (const x of [-2, 2]) {
      for (let z = -2; z <= 2; z += 1) add('float', x, 0, z);
    }
    add('propeller', 0, 0, 2);
    return parts;
  }

  if (preset === 'plane') {
    for (const z of [-1, 1]) {
      add('wood', 0, 0, z);
      add('wood', 0, 1, z);
      for (const x of [-1, 1]) add('wheel', x, 0, z, { power: 2, binding: x < 0 ? 'left' : 'right' });
    }
    add('wood', 0, 1, 2);
    for (const x of [-3, -2, -1, 1, 2, 3]) add('wing', x, 1, 0);
    for (const x of [-1, 1]) add('wing', x, 1, 2, { elevation: 0 });
    add('propeller', 0, 1, -2, { power: 1.2 });
    return parts;
  }

  const front = preset === 'ram' ? -2 : -1;
  for (let z = front; z <= 1; z += 1) {
    for (let x = -1; x <= 1; x += 1) {
      if (x === 0 && z === 0) continue;
      const reinforced = (x === 0 && Math.abs(z) === 1) || (preset === 'ram' && z === -2);
      add(reinforced ? 'brace' : 'wood', x, 0, z);
    }
  }
  for (const x of [-2, 2]) {
    for (const z of [-1, 1]) add('wheel', x, 0, z, { binding: x < 0 ? 'left' : 'right' });
  }
  if (preset === 'rover') {
    add('hinge', 0, 1, 0);
    add('cannon', 0, 2, 0);
  } else {
    for (let x = -1; x <= 1; x += 1) add('brace', x, 1, -2);
  }
  return parts;
}
