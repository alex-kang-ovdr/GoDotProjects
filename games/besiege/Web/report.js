/** Bounded, browser-independent records of observed experiments. No replay or physics mutation. */
import { PARTS, cloneParts } from './parts.js';

export const REPORT_SAMPLE_PERIOD = 1 / 12;
export const REPORT_EVENT_LIMIT = 100;
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const clamp = (n, low, high) => Math.max(low, Math.min(high, finite(n)));
const pairKey = (a, b) => JSON.stringify([a, b].sort());
const copy = value => JSON.parse(JSON.stringify(value));

export function designSignature(parts) {
  return JSON.stringify((Array.isArray(parts) ? parts : []).map(p => [p.id, p.type, p.x, p.y, p.z, p.rot,
    p.power ?? 1, p.binding ?? 'all', p.elevation ?? PARTS[p.type]?.defaultElevation ?? 0,
    p.type === 'piston' ? p.stroke ?? 1.5 : null]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
}

export function createRunReport(parts, mission) {
  return { version: 1, mission, signature: designSignature(parts), blueprint: cloneParts(parts),
    elapsed: 0, outcome: null, failReason: '', samples: 0, samplePeriod: REPORT_SAMPLE_PERIOD,
    peakSpeed: 0, shots: 0, checkpoints: 0, integrity: 1, coreHp: 100,
    firstBreak: null, events: [], droppedEvents: 0, connections: [],
    parts: parts.map(p => ({ id: p.id, type: p.type, x: p.x, y: p.y, z: p.z,
      hp: PARTS[p.type].maxHp, maxHp: PARTS[p.type].maxHp, dead: false, connected: true,
      damage: 0, maxStress: 0, firstDamageAt: null, lastSource: null })) };
}

/** Copy only known primitive fields. External event objects never become report references. */
export function recordRunEvent(report, event) {
  if (!report || !event || !['damage', 'break', 'part-destroy', 'checkpoint', 'win', 'fail'].includes(event.type)) return;
  const entry = { type: event.type, time: Math.max(0, finite(event.time)) };
  for (const key of ['partId', 'a', 'b', 'reason', 'source']) if (typeof event[key] === 'string') entry[key] = event[key];
  for (const key of ['damage', 'hp', 'maxHp', 'stress', 'health', 'completed', 'total']) {
    if (Number.isFinite(event[key])) entry[key] = event[key];
  }
  if (event.type === 'break' && !report.firstBreak) report.firstBreak = { ...entry };
  if (event.type === 'break') {
    const edge = report.connections.find(item => pairKey(item.a, item.b) === pairKey(event.a, event.b));
    if (edge) {
      edge.broken = true; edge.breakAt = entry.time; edge.reason = entry.reason || 'unknown';
      edge.peakStress = Math.max(edge.peakStress, finite(entry.stress));
      if (Number.isFinite(entry.health)) edge.health = clamp(entry.health, 0, 1);
    }
  }
  const part = report.parts.find(p => p.id === event.partId);
  if (part && event.type === 'damage') {
    part.damage += Math.max(0, finite(event.damage));
    part.hp = clamp(event.hp, 0, part.maxHp);
    part.firstDamageAt ??= entry.time;
    part.lastSource = entry.source || null;
  }
  if (part && event.type === 'part-destroy') { part.dead = true; part.connected = false; part.hp = 0; }
  if (event.type === 'win' || event.type === 'fail') {
    report.outcome = event.type === 'win' ? 'won' : 'failed';
    report.failReason = event.type === 'fail' ? entry.reason || '' : '';
  }
  report.events.push(entry);
  if (report.events.length > REPORT_EVENT_LIMIT) { report.events.shift(); report.droppedEvents++; }
}

/** Called at 12 Hz and once at terminal/reset; peak values are sampled, not continuous maxima. */
export function sampleRunReport(report, simulation) {
  if (!report || !simulation) return;
  report.elapsed = Math.max(0, finite(simulation.elapsed));
  report.samples++;
  report.peakSpeed = Math.max(report.peakSpeed, Math.max(0, finite(simulation.speed)));
  report.shots = Math.max(0, finite(simulation.shots));
  report.checkpoints = Math.max(0, finite(simulation.checkpointIndex));
  report.coreHp = Math.max(0, finite(simulation.coreHp));
  report.integrity = clamp(simulation.integrity, 0, 1);
  if (simulation.outcome) { report.outcome = simulation.outcome; report.failReason = simulation.failReason || ''; }
  for (const part of report.parts) {
    const state = simulation.partStates.get(part.id);
    if (!state) continue;
    part.hp = clamp(state.hp, 0, part.maxHp);
    part.dead = !!state.dead;
    part.connected = !!state.connected;
  }
  const known = new Map(report.connections.map(edge => [pairKey(edge.a, edge.b), edge]));
  const partsById = new Map(report.parts.map(part => [part.id, part]));
  for (const edge of simulation.connections) {
    if (!partsById.has(edge.a) || !partsById.has(edge.b)) continue;
    const key = pairKey(edge.a, edge.b);
    let item = known.get(key);
    if (!item) {
      item = { a: edge.a, b: edge.b, kind: edge.kind, peakStress: 0, currentStress: 0, health: 1,
        broken: false, breakAt: null, reason: null };
      report.connections.push(item); known.set(key, item);
    }
    item.currentStress = Math.max(0, finite(edge.stress));
    item.peakStress = Math.max(item.peakStress, item.currentStress);
    item.health = clamp(edge.health ?? 1, 0, 1);
    if (edge.broken && !item.broken) {
      const exact = report.events.find(e => e.type === 'break' && pairKey(e.a, e.b) === key);
      item.breakAt = exact?.time ?? report.elapsed; item.reason = exact?.reason || 'unknown';
      item.peakStress = Math.max(item.peakStress, finite(exact?.stress));
    }
    item.broken = !!edge.broken;
    for (const id of [item.a, item.b]) partsById.get(id).maxStress = Math.max(partsById.get(id).maxStress, item.peakStress);
  }
}

export function snapshotRunReport(report) { return report ? copy(report) : null; }
export function reportMatchesDesign(report, parts, mission) {
  return !!report && report.mission === mission && report.signature === designSignature(parts);
}

export function getReportIssues(report) {
  if (!report) return [];
  const brokenIds = new Set(report.connections.filter(e => e.broken).flatMap(e => [e.a, e.b]));
  return report.parts.filter(p => p.dead || !p.connected || p.damage > 0 || p.maxStress >= .8 || brokenIds.has(p.id))
    .map(p => ({ ...p, brokenLink: brokenIds.has(p.id) }))
    .sort((a, b) => Number(b.dead) - Number(a.dead) || Number(a.connected) - Number(b.connected)
      || Number(b.brokenLink) - Number(a.brokenLink) || b.damage - a.damage || b.maxStress - a.maxStress);
}

export function reportAdvice(report) {
  if (!report) return ['시험을 시작하면 부품 손상과 연결 상태가 기록됩니다.'];
  const advice = [];
  if (report.failReason.includes('물속')) advice.push('코어가 침수되었습니다. 부유체 수와 배치, 상부 하중을 확인하세요.');
  if (report.coreHp <= 0) advice.push('코어가 파괴되었습니다. 코어 앞의 보호 구조와 적의 공격 예고에 대응하는 이동 경로를 검토하세요.');
  if (report.firstBreak?.reason === 'stress') advice.push('첫 연결은 하중으로 파단되었습니다. 연결 위 하중을 줄이거나 보강 부품과 지지 경로를 추가해 보세요.');
  if (report.firstBreak?.reason === 'impact') advice.push('첫 연결은 누적 충격 손상으로 끊어졌습니다. 반동·근거리 폭발과 충돌 지점을 확인하세요.');
  if (report.firstBreak?.reason === 'part-destroyed') advice.push('부품 HP 소진이 연결 파손으로 이어졌습니다. 해당 부품의 보호와 충돌 속도를 확인하세요.');
  if (report.parts.some(p => !p.connected && !p.dead)) advice.push('HP가 남아도 코어에서 떨어진 구동 장치는 작동하지 않습니다. 표시된 부품의 연결 경로를 점검하세요.');
  if (report.connections.some(e => e.peakStress >= .8 && !e.broken)) advice.push('표본 하중비가 80%를 넘은 연결이 있습니다. 하중 표시로 위치를 확인하고 반복 시험해 보세요.');
  if (!advice.length) advice.push(report.outcome === 'won' ? '이번 시험에서 뚜렷한 구조 손실이 기록되지 않았습니다. 시간·자재·출력을 조정해 다음 설계를 비교해 보세요.' : '이번 시험에서 뚜렷한 구조 손실이 기록되지 않았습니다. 목표 경로와 구동 방향을 확인해 보세요.');
  return advice.slice(0, 4);
}

export function inspectSimulationPart(simulation, partId) {
  const body = simulation?.bodies.get(partId), state = simulation?.partStates.get(partId);
  if (!body || !state) return null;
  return { id: partId, type: body.userData.type, hp: finite(state.hp), maxHp: finite(state.maxHp),
    dead: !!state.dead, connected: !!state.connected,
    piston: simulation.getPistonState?.(partId) || null,
    connections: simulation.connections.filter(e => e.a === partId || e.b === partId).map(e => ({
      other: e.a === partId ? e.b : e.a, kind: e.kind, stress: Math.max(0, finite(e.stress)),
      health: clamp(e.health ?? 1, 0, 1), broken: !!e.broken })) };
}
