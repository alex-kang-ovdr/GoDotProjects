import { PARTS, BUILD_BOUNDS, STROKE_LIMITS, cloneParts, validateDesign, getConnections, getDesignStats } from './parts.js';

const key = p => `${p.x},${p.y},${p.z}`;
const inside = p => !!p && [p.x, p.y, p.z].every(Number.isInteger) && Math.abs(p.x) <= BUILD_BOUNDS.x && Math.abs(p.z) <= BUILD_BOUNDS.z && p.y >= 0 && p.y <= BUILD_BOUNDS.y;
const knownPart = p => !!p && typeof p === 'object' && !Array.isArray(p)
  && typeof p.type === 'string' && Object.hasOwn(PARTS, p.type);

/** Import structural data; disconnected drafts remain editable and never execute yet. */
export function normalizeBlueprint(data) {
  if (!data || data.format !== 'ironwood-design' || data.version !== 1 || !Array.isArray(data.parts)) throw new Error('IRONWOOD 버전 1 설계 JSON을 선택해 주세요.');
  if (data.parts.length < 1 || data.parts.length > BUILD_BOUNDS.maxParts) throw new Error('설계에는 부품이 1~100개 있어야 합니다.');
  const parts = data.parts.map(p => {
    if (!p || typeof p !== 'object' || typeof p.id !== 'string' || !p.id.trim() || p.id.length > 128) throw new Error('유효한 부품 ID가 필요합니다.');
    const defaultElevation = knownPart(p) ? PARTS[p.type].defaultElevation ?? 0 : 0;
    return { id: p.id, type: p.type, x: p.x, y: p.y, z: p.z, rot: p.rot === undefined ? 0 : p.rot, power: p.power === undefined ? 1 : p.power, binding: p.binding === undefined ? 'all' : p.binding, elevation: p.elevation === undefined ? defaultElevation : p.elevation,
      ...(p.type === 'piston' || p.stroke !== undefined ? { stroke: p.stroke === undefined ? STROKE_LIMITS.default : p.stroke } : {}) };
  });
  const result = validateDesign(parts, { allowDisconnected: true });
  if (!result.valid) throw new Error(result.errors.join(' '));
  return { parts, mission: typeof data.mission === 'string' ? data.mission : 'outpost' };
}

/** Mirror around X=0 while preserving a useful left/right motor assignment. */
export function mirrorPart(part) {
  return { ...part, x: -part.x, rot: (4 - (part.rot || 0)) % 4,
    binding: part.binding === 'left' ? 'right' : part.binding === 'right' ? 'left' : 'all' };
}

/** Atomic operation: a failed second mirrored placement cannot leave the first behind. */
export function planPlacement(parts, template, cell, { movingId = null, mirror = false, createId } = {}) {
  const fail = error => ({ ok: false, error, parts, addedIds: [] });
  if (!Array.isArray(parts)) return fail('설계 데이터는 부품 목록이어야 합니다.');
  if (!knownPart(template)) return fail('부품을 먼저 선택해 주세요.');
  const moving = movingId ? parts.find(p => p.id === movingId) : null;
  if (movingId && !moving) return fail('이동할 부품을 찾을 수 없습니다.');
  if (moving?.type === 'core') return fail('코어는 고정 기준점입니다. 다른 부품을 이동해 주세요.');
  if (!inside(cell)) return fail('조립 구역 안의 정수 격자에 배치해 주세요.');
  if (template.type === 'core' && parts.some(p => p.type === 'core')) return fail('코어는 하나만 사용할 수 있습니다.');
  const base = { ...template, x: cell.x, y: cell.y, z: cell.z,
    rot: template.rot === undefined ? 0 : template.rot,
    power: template.power === undefined ? 1 : template.power,
    binding: template.binding === undefined ? 'all' : template.binding,
    elevation: template.elevation === undefined ? PARTS[template.type].defaultElevation ?? 0 : template.elevation,
    ...(template.type === 'piston' || template.stroke !== undefined ? { stroke: template.stroke === undefined ? STROKE_LIMITS.default : template.stroke } : {}) };
  const candidates = [base];
  if (mirror && !movingId && cell.x !== 0 && template.type !== 'core') candidates.push(mirrorPart(base));
  const retained = parts.filter(p => p.id !== movingId);
  if (retained.length + candidates.length > BUILD_BOUNDS.maxParts) return fail('대칭 부품을 포함해 최대 100개까지 배치할 수 있습니다.');
  const occupied = new Set(retained.map(key));
  for (const p of candidates) {
    if (!inside(p)) return fail('대칭 부품이 조립 구역 밖에 있습니다.');
    if (occupied.has(key(p))) return fail('이미 부품이 있는 격자입니다. 대칭 위치도 확인해 주세요.');
    occupied.add(key(p));
  }
  const ids = new Set(retained.map(p => p.id));
  let serial = 1;
  for (const p of candidates) {
    if (movingId) p.id = movingId;
    else {
      p.id = createId ? createId() : `placed-${serial++}`;
      while (ids.has(p.id)) p.id = createId ? createId() : `placed-${serial++}`;
    }
    ids.add(p.id);
  }
  const result = [...cloneParts(retained), ...candidates];
  const check = validateDesign(result, { allowDisconnected: true });
  if (!check.valid) return fail(check.errors[0]);
  return { ok: true, parts: result, addedIds: candidates.map(p => p.id), error: null };
}

/**
 * Plan one reversible edit for a whole selection. No source objects are changed,
 * including on a collision, invalid command, or failed ID allocation. Mirrors
 * use world X=0; rotations use the supplied integral pivot and +Y quarter turns.
 */
export function planGroupTransform(parts, selectedIds, options = {}) {
  const selection = Array.isArray(selectedIds) ? [...selectedIds] : [];
  const fail = error => ({ ok: false, parts, selectedIds: selection, addedIds: [], removedIds: [], changed: false, error });
  if (!Array.isArray(parts)) return fail('설계 데이터는 부품 목록이어야 합니다.');
  const sourceCheck = validateDesign(parts, { allowDisconnected: true });
  if (!sourceCheck.valid) return fail(sourceCheck.errors[0]);
  if (!selection.length || selection.some(id => typeof id !== 'string' || !id.trim())
    || new Set(selection).size !== selection.length) return fail('중복 없이 하나 이상의 부품을 선택해 주세요.');
  const byId = new Map(parts.map(p => [p.id, p]));
  if (selection.some(id => !byId.has(id))) return fail('선택한 부품이 현재 설계에 없습니다. 다시 선택해 주세요.');
  const chosen = selection.map(id => byId.get(id));
  if (chosen.some(p => p.type === 'core')) return fail('코어를 포함한 그룹은 변형하거나 삭제할 수 없습니다. 코어를 선택에서 제외해 주세요.');
  const kind = options?.kind;
  if (!['move', 'copy', 'rotate', 'mirror', 'delete'].includes(kind)) return fail('지원하지 않는 그룹 편집 명령입니다.');
  const selected = new Set(selection);
  let candidates = chosen.map(p => ({ ...p }));
  if (kind === 'move' || kind === 'copy') {
    const delta = options.delta;
    if (!delta || ![delta.x, delta.y, delta.z].every(Number.isSafeInteger)) return fail('이동 간격은 X/Y/Z 정수 격자로 지정해 주세요.');
    candidates = candidates.map(p => ({ ...p, x: p.x + delta.x, y: p.y + delta.y, z: p.z + delta.z }));
  } else if (kind === 'rotate') {
    const pivot = options.pivot, turns = options.turns === undefined ? 1 : options.turns;
    if (!pivot || ![pivot.x, pivot.y, pivot.z].every(Number.isSafeInteger) || !Number.isSafeInteger(turns)) {
      return fail('회전 기준은 정수 격자, 회전 횟수는 90도 단위 정수여야 합니다.');
    }
    const quarterTurns = ((turns % 4) + 4) % 4;
    candidates = candidates.map(p => {
      let dx = p.x - pivot.x, dz = p.z - pivot.z;
      for (let i = 0; i < quarterTurns; i++) [dx, dz] = [dz, -dx];
      return { ...p, x: pivot.x + dx, z: pivot.z + dz, rot: (p.rot + quarterTurns) % 4 };
    });
  } else if (kind === 'mirror') {
    candidates = candidates.map(mirrorPart);
  } else candidates = [];

  const retained = kind === 'copy' ? parts : parts.filter(p => !selected.has(p.id));
  if (retained.length + candidates.length > BUILD_BOUNDS.maxParts) return fail('복사한 그룹을 포함해 부품은 100개까지 사용할 수 있습니다.');
  const occupied = new Set(retained.map(key));
  for (const candidate of candidates) {
    if (!inside(candidate)) return fail('변형한 그룹이 조립 구역 밖에 있습니다. X/Z -12~12, Y 0~10 안으로 옮겨 주세요.');
    if (occupied.has(key(candidate))) return fail('그룹의 일부가 기존 부품과 겹칩니다. 다른 위치를 선택해 주세요.');
    occupied.add(key(candidate));
  }

  const addedIds = [], removedIds = kind === 'delete' ? selection : [];
  if (kind === 'copy') {
    const used = new Set(parts.map(p => p.id));
    let serial = 1;
    for (const candidate of candidates) {
      let freshId = null;
      try {
        for (let attempt = 0; attempt <= BUILD_BOUNDS.maxParts; attempt++) {
          const next = options.createId ? options.createId() : `group-${serial++}`;
          if (typeof next !== 'string' || !next.trim() || next.length > 128) return fail('새 부품 ID를 만들 수 없습니다. 다시 시도해 주세요.');
          if (!used.has(next)) { freshId = next; break; }
        }
      } catch { return fail('새 부품 ID를 만들 수 없습니다. 다시 시도해 주세요.'); }
      if (freshId === null) return fail('중복되지 않는 부품 ID를 만들 수 없습니다. 다시 시도해 주세요.');
      candidate.id = freshId;
      candidate.elevation ??= PARTS[candidate.type].defaultElevation ?? 0;
      if (candidate.type === 'piston' && candidate.stroke === undefined) candidate.stroke = STROKE_LIMITS.default;
      used.add(freshId); addedIds.push(freshId);
    }
  }
  const changed = kind === 'copy' || kind === 'delete' || candidates.some((p, index) => {
    const old = chosen[index];
    return p.x !== old.x || p.y !== old.y || p.z !== old.z || p.rot !== old.rot || p.binding !== old.binding;
  });
  if (!changed) return { ok: true, parts, selectedIds: selection, addedIds: [], removedIds: [], changed: false, error: null };
  const replacements = new Map(candidates.map(p => [p.id, p]));
  const result = kind === 'copy' ? [...cloneParts(parts), ...candidates]
    : kind === 'delete' ? cloneParts(retained) : parts.map(p => ({ ...(replacements.get(p.id) || p) }));
  const resultCheck = validateDesign(result, { allowDisconnected: true });
  if (!resultCheck.valid) return fail(resultCheck.errors[0]);
  return { ok: true, parts: result, selectedIds: kind === 'copy' ? addedIds : kind === 'delete' ? [] : selection,
    addedIds, removedIds, changed: true, error: null, warnings: resultCheck.warnings };
}

/**
 * Environment hints are advisory: only invalid attachments/schema and budget
 * block launch. A caller may keep the V2 two-argument form or pass a mission.
 */
export function analyzeDesign(parts, budget = null, mission = null) {
  const stats = getDesignStats(parts);
  const validation = validateDesign(parts);
  const links = getConnections(parts);
  const entries = Array.isArray(parts) ? parts.filter(knownPart) : [];
  const adjacency = new Map(entries.map(p => [p.id, []]));
  for (const link of links) { adjacency.get(link.a)?.push(link.b); adjacency.get(link.b)?.push(link.a); }
  const core = entries.find(p => p.type === 'core');
  const reachable = new Set(core ? [core.id] : []), queue = core ? [core.id] : [];
  for (let i = 0; i < queue.length; i++) for (const id of adjacency.get(queue[i]) || []) if (!reachable.has(id)) { reachable.add(id); queue.push(id); }
  const centerOfMass = { x: 0, y: 0, z: 0 };
  let positionedMass = 0;
  for (const p of entries.filter(inside)) {
    const mass = PARTS[p.type].mass;
    centerOfMass.x += p.x * mass; centerOfMass.y += (p.y + .72) * mass; centerOfMass.z += p.z * mass;
    positionedMass += mass;
  }
  if (positionedMass > 0) for (const axis of ['x', 'y', 'z']) centerOfMass[axis] /= positionedMass;
  const overBudget = Number.isFinite(budget) && stats.cost > budget;
  const count = type => entries.filter(p => p.type === type).length;
  const wheelCount = count('wheel'), cannonCount = count('cannon');
  const floatCount = count('float'), propellerCount = count('propeller'), wingCount = count('wing');
  const pistonCount = count('piston');
  const mobilityWarnings = [];
  const environment = mission?.environment;
  if (environment === 'water') {
    if (!floatCount) mobilityWarnings.push('수상 항로에 부유체가 없습니다. 코어가 잠기지 않도록 부력을 확보하세요.');
    if (!propellerCount) mobilityWarnings.push('추진 프로펠러가 없어 수상 이동이 어렵습니다.');
  } else if (environment === 'air') {
    if (!wingCount) mobilityWarnings.push('공중 항로에 양력 날개가 없습니다. 지상 주행만으로 공중 고리를 통과하기 어렵습니다.');
    if (!propellerCount) mobilityWarnings.push('추진 프로펠러가 없어 이륙에 필요한 속도를 얻기 어렵습니다.');
    if (!wheelCount) mobilityWarnings.push('바퀴가 없어 지상 활주가 어렵습니다. 이륙할 때 기체가 지면에 닿는지 확인하세요.');
  } else if (environment === 'land' && !wheelCount && !(mission?.objective === 'sandbox' && pistonCount)) {
    mobilityWarnings.push('지상 시험장에서 움직일 구동 바퀴가 없습니다.');
  }
  if (!environment && (floatCount || wingCount) && !propellerCount) {
    mobilityWarnings.push('부유체와 날개는 수동 부품입니다. 지속해서 전진하려면 추진 프로펠러가 필요합니다.');
  }
  const floats = entries.filter(p => p.type === 'float' && inside(p));
  if (floats.length && (new Set(floats.map(p => p.x)).size < 2 || new Set(floats.map(p => p.z)).size < 2)) {
    mobilityWarnings.push('부유체가 한 줄에 모여 있습니다. 좌우와 앞뒤로 나누면 선체가 기울어지는 것을 줄이는 데 도움이 됩니다.');
  }
  const wings = entries.filter(p => p.type === 'wing' && inside(p));
  if (wings.length && core && (!wings.some(p => p.x < core.x) || !wings.some(p => p.x > core.x))) {
    mobilityWarnings.push('날개가 코어 양쪽으로 펼쳐져 있지 않습니다. 양력과 무게가 한쪽으로 치우치지 않는지 확인하세요.');
  }
  if (wings.some(p => Number.isFinite(p.elevation) && p.elevation > 20)) {
    mobilityWarnings.push('날개 설치각이 큽니다. 저항과 실속을 고려해 먼저 기본 6도에서 비행을 시험해 보세요.');
  }
  if (mission?.objective === 'destroy' && !cannonCount) {
    mobilityWarnings.push('대포가 없어 사격할 수 없습니다. 표적을 파괴할 충각 구조나 무장을 준비하세요.');
  }
  const applicableWarnings = validation.warnings.filter(warning => {
    if (mission && mission.objective !== 'destroy' && warning === '대포가 없어 사격은 불가능합니다.') return false;
    if (mission?.objective === 'sandbox' && pistonCount && warning === '구동 바퀴가 없어 지상 주행이 어렵습니다.') return false;
    return true;
  });
  return { ...stats, ...validation, overBudget, ready: validation.valid && !overBudget,
    warnings: [...new Set([...applicableWarnings, ...mobilityWarnings])], mobilityWarnings,
    disconnectedIds: entries.filter(p => typeof p.id === 'string' && !reachable.has(p.id)).map(p => p.id), centerOfMass,
    wheelCount, cannonCount, floatCount, propellerCount, wingCount, pistonCount,
    connectionCount: links.length };
}
