import { PARTS, MISSIONS, makePreset, cloneParts, validateDesign, getConnections } from './parts.js';
import { Simulation } from './physics.js';
import { GameScene } from './scene.js';
import { normalizeBlueprint, planPlacement, planGroupTransform, analyzeDesign } from './editor.js';
import { scoreRun, normalizeProgress, recordCompletion, nextCampaignMission } from './campaign.js';
import { getControlProfile, readControls } from './input.js';
import { normalizeDesigns, saveDesignSlot, renameDesignSlot, deleteDesignSlot, getDesignSlot } from './designs.js';
import { createRunReport, recordRunEvent, sampleRunReport, snapshotRunReport, reportMatchesDesign,
  getReportIssues, reportAdvice, inspectSimulationPart, REPORT_SAMPLE_PERIOD } from './report.js';

const $ = (id) => document.getElementById(id);
const partOrder = ['wood', 'wheel', 'cannon', 'brace', 'hinge', 'core', 'float', 'propeller', 'wing', 'piston'];
const icons = {
  wood: '<path d="m5 7 8-4 7 4v11l-8 4-7-4zM5 7l7 5 8-5M12 12v10M8 5l8 5M8 9v10M15 11v9"/>',
  wheel: '<ellipse cx="11" cy="12" rx="8" ry="9"/><ellipse cx="11" cy="12" rx="4" ry="5"/><path d="M11 3v4M11 17v4M3 12h4M15 12h4M17 5l4 2v10l-4 3M8 9l6 6M14 9l-6 6"/>',
  cannon: '<path d="m4 13 11-9 6 6-11 9zM15 4l-1 5 7 1M5 13l6 6M3 21h17M6 21l2-6M16 21l-3-5"/><ellipse cx="18" cy="7" rx="2" ry="3" transform="rotate(-45 18 7)"/>',
  brace: '<path d="M4 4h16v16H4zM4 4l16 16M20 4 4 20M7 4l13 13M4 7l13 13M17 4 4 17M20 7 7 20"/>',
  hinge: '<ellipse cx="12" cy="7" rx="8" ry="4"/><path d="M4 7v10c0 5 16 5 16 0V7M4 12c0 5 16 5 16 0M12 3v8M8 16h8"/>',
  core: '<path d="m12 2 9 5v10l-9 5-9-5V7zM3 7l9 5 9-5M12 12v10"/><path d="m12 6 3 2-3 2-3-2zM6 12v4l3 2M15 15l3-2v4l-3 2z"/>',
  float: '<path d="M4 5h16v9H4zM8 5v9M16 5v9M2 18q3-3 5 0t5 0 5 0 5 0M2 22q3-3 5 0t5 0 5 0 5 0"/>',
  propeller: '<circle cx="12" cy="12" r="2"/><path d="M11 10C4 7 6 0 11 3l2 7M14 11c7-4 11 2 6 5l-6-2M11 14c0 8-7 8-7 3l5-5"/>',
  wing: '<path d="m2 14 20-7-2 7-16 5zM6 12l3 5M17 9l-2 7M11 6l2-3 2 3M13 3v6"/>',
  piston: '<path d="M5 12h14v9H5zM9 12V5h6v7M4 2h16v3H4zM2 23h20M9 15v3M15 15v3"/>'
};
const partIcon = (type) => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[type] || icons.wood}</svg>`;
const KEYS = new Set();
const touch = new Set();
const history = [], future = [];
let parts = makePreset('rover'), selected = null, tool = null, rotation = 0;
let selectedIds = new Set(), multiSelect = false, designs, activeSlotId = null;
let runReport = null, lastReport = null, lastReportSample = -Infinity, reviewVisible = false;
let stressMode = 'load';
let simulation = null, scene = null, mode = 'build', mission = 'outpost';
let paused = false, slow = false, connectionsVisible = false, soundOn = true, resultShown = false;
let mirrorOn = false, placement = null, diagnosticsVisible = false, aimVisible = true, stressVisible = false;
let flightAssist = true, touchWeaponMode = false;
let quality = matchMedia('(pointer: coarse)').matches ? 'low' : 'high', progress;
let sessionSerial = 0, outcomeTimer, lastDryToast = -10000;
let previousTime = performance.now(), lastReadout = 0, toastTimer, saveTimer, audioContext;
let idCounter = Date.now();
const STORAGE = { saved: 'ironwood.design.v1', designs: 'ironwood.designs.v1', draft: 'ironwood.draft.v1', backup: 'ironwood.previous.v1', prefs: 'ironwood.prefs.v1', progress: 'ironwood.campaign.v1' };
const currentMission = () => MISSIONS.find(m => m.id === mission) || MISSIONS[0];
const controlProfile = () => getControlProfile(parts, currentMission());
const designAnalysis = () => analyzeDesign(parts, currentMission().budget, currentMission());
const PRESET_NAMES = { rover: '척후 공성차', ram: '철갑 충각차', boat: '쌍동 항해선', plane: '개척 비행기', lift: '승강 시험대', blank: '빈 작업대' };
const lastSounds = new Map();

function storageGet(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } }
function storageSet(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } }
function designData() { return { format: 'ironwood-design', version: 1, mission, parts: cloneParts(parts), savedAt: new Date().toISOString() }; }
function flushDraft() { clearTimeout(saveTimer); storageSet(STORAGE.draft, designData()); }
function saveDraft() { clearTimeout(saveTimer); saveTimer = setTimeout(flushDraft, 150); }
function normalizeImported(data) {
  const result = normalizeBlueprint(data);
  return { ...result, mission: MISSIONS.some(m => m.id === result.mission) ? result.mission : 'outpost' };
}

function toast(message, warning = false) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').className = `toast show${warning ? ' warning' : ''}`;
  toastTimer = setTimeout(() => $('toast').classList.remove('show'), warning ? 5500 : 3300);
}

function wakeAudio() {
  if (!soundOn) return;
  try { audioContext ||= new (window.AudioContext || window.webkitAudioContext)(); if (audioContext.state === 'suspended') audioContext.resume(); } catch { /* Audio is optional. */ }
}
function sound(type) {
  if (!soundOn || !audioContext || audioContext.state !== 'running') return;
  const now = audioContext.currentTime;
  if (now - (lastSounds.get(type) ?? -100) < .07) return;
  lastSounds.set(type, now);
  const osc = audioContext.createOscillator(), gain = audioContext.createGain();
  osc.connect(gain); gain.connect(audioContext.destination);
  const table = { place: [450, 240, .06, .035], delete: [200, 90, .1, .03], fire: [95, 28, .3, .10], hit: [160, 48, .13, .035], break: [100, 35, .22, .045], win: [440, 880, .65, .05], fail: [220, 55, .7, .06], damage: [130, 65, .16, .035] };
  const [start, end, duration, volume] = table[type] || table.place;
  osc.type = type === 'fire' || type === 'break' ? 'sawtooth' : 'sine';
  osc.frequency.setValueAtTime(start, now); osc.frequency.exponentialRampToValueAtTime(end, now + duration);
  gain.gain.setValueAtTime(volume, now); gain.gain.exponentialRampToValueAtTime(.001, now + duration);
  osc.start(now); osc.stop(now + duration);
}

function setTool(next) {
  if (mode !== 'build') return;
  placement = null;
  scene.setExcludedPart(null);
  $('placement-notice').hidden = true;
  tool = next;
  if (next) { multiSelect = false; $('multi-select').setAttribute('aria-pressed', 'false'); }
  scene.setTool(next && next !== 'erase' ? next : null);
  scene.setMirror(mirrorOn);
  scene.setElevation(PARTS[next]?.defaultElevation ?? 0);
  document.querySelectorAll('.part-button').forEach(b => { const active = b.dataset.type === next; b.classList.toggle('active', active); b.setAttribute('aria-pressed', String(active)); });
  $('select-tool').classList.toggle('active', next === null);
  $('select-tool').setAttribute('aria-pressed', String(next === null));
  $('erase-tool').setAttribute('aria-pressed', String(next === 'erase'));
  if (next) selectPart(null);
  $('viewport').style.cursor = next === 'erase' ? 'crosshair' : next ? 'copy' : 'default';
}

function selectPart(id, { additive = false, preserveGroup = false } = {}) {
  const validId = parts.some(p => p.id === id) ? id : null;
  if (mode === 'play') {
    selected = validId; selectedIds = new Set(selected ? [selected] : []);
    scene.setSelections([...selectedIds], selected);
    $('runtime-inspector').hidden = !selected;
    document.body.dataset.inspecting = String(!!selected);
    if (selected && !paused && !simulation?.outcome) pauseToggle();
    updateInspection();
    return;
  }
  if (preserveGroup && validId) {
    selectedIds = new Set([...selectedIds].filter(key => parts.some(p => p.id === key)));
    selectedIds.add(validId); selected = validId;
  } else if (additive && validId) {
    if (selectedIds.has(validId)) selectedIds.delete(validId); else selectedIds.add(validId);
    selected = selectedIds.has(validId) ? validId : [...selectedIds].at(-1) || null;
  } else { selected = validId; selectedIds = new Set(selected ? [selected] : []); }
  scene.setSelections([...selectedIds], selected);
  const part = parts.find(p => p.id === selected);
  document.body.classList.toggle('has-selection', !!part && mode === 'build');
  $('inspector').hidden = !part || mode !== 'build';
  $('preflight').hidden = !!part || mode !== 'build';
  if (!part) return;
  const config = PARTS[part.type];
  $('selected-icon').innerHTML = partIcon(part.type);
  const group = selectedIds.size > 1;
  $('selected-name').textContent = group ? `${selectedIds.size}개 부품 선택` : config.name;
  $('selected-position').textContent = `X ${part.x} · Y ${part.y} · Z ${part.z} / ${part.rot * 90}°`;
  $('selected-description').textContent = group ? `기준 부품: ${config.name} · Shift 클릭으로 선택을 더하거나 뺄 수 있습니다.` : config.description;
  $('power-setting').hidden = group || !['wheel', 'cannon', 'hinge', 'propeller', 'wing', 'piston'].includes(part.type);
  $('power-label').textContent = part.type === 'wing' ? '날개 면적 배율' : part.type === 'piston' ? '구동 힘 배율' : '출력';
  $('binding-setting').hidden = group || !['wheel', 'propeller'].includes(part.type);
  $('binding-label').textContent = part.type === 'propeller' ? '추진 분배' : '구동 그룹';
  $('binding-auto').textContent = part.type === 'propeller' ? '공통 추진' : '자동 · 위치에 따라 좌 / 우';
  $('part-power').value = part.power ?? 1;
  $('power-value').value = `${Number(part.power ?? 1).toFixed(1)}×`;
  $('part-binding').value = part.binding || 'all';
  const containsCore = parts.some(p => selectedIds.has(p.id) && p.type === 'core');
  $('delete-selected').disabled = containsCore;
  $('move-selected').disabled = containsCore || group;
  $('copy-selected').disabled = containsCore || group;
  $('elevation-setting').hidden = group || !['cannon', 'wing'].includes(part.type);
  $('elevation-label').textContent = part.type === 'wing' ? '날개 설치각' : '포 고각';
  $('part-elevation').value = part.elevation ?? config.defaultElevation ?? 0;
  $('elevation-value').value = `${part.elevation ?? config.defaultElevation ?? 0}°`;
  $('stroke-setting').hidden = group || part.type !== 'piston';
  $('part-stroke').value = part.stroke ?? 1.5;
  $('stroke-value').value = `${Number(part.stroke ?? 1.5).toFixed(2)}m`;
  $('group-tools').hidden = !group;
  $('group-count').textContent = `${selectedIds.size}개 묶음 편집`;
  $('group-tools').querySelectorAll('button:not(#group-clear)').forEach(b => b.disabled = containsCore);
}

function groupTransform(kind, delta = null) {
  if (mode !== 'build') return;
  const pivot = parts.find(p => p.id === selected);
  if (!pivot) return toast('먼저 부품을 선택하세요.');
  const result = planGroupTransform(parts, [...selectedIds], { kind, delta, pivot, turns: 1, createId: () => `part-${++idCounter}` });
  if (!result.ok) return toast(result.error, true);
  if (result.changed === false) return;
  remember(); parts = result.parts; selectedIds = new Set(result.selectedIds);
  selected = selectedIds.has(selected) ? selected : [...selectedIds][0] || null;
  refreshDesign(); sound(kind === 'delete' ? 'delete' : 'place');
}

function nudgeGroup(value) {
  const [x, y, z] = value.split(',').map(Number);
  let delta = { x, y, z };
  const copyMode = $('group-copy-mode').checked;
  if (copyMode) {
    const group = parts.filter(p => selectedIds.has(p.id));
    const axis = x ? 'x' : y ? 'y' : 'z';
    const span = Math.max(...group.map(p => p[axis])) - Math.min(...group.map(p => p[axis])) + 1;
    delta[axis] *= span;
  }
  groupTransform(copyMode ? 'copy' : 'move', delta);
}

function remember(snapshot = parts) {
  history.push({ parts: cloneParts(snapshot), mission });
  if (history.length > 70) history.shift();
  future.length = 0;
}
function refreshDesign() {
  scene.setDesign(parts);
  scene.setRotation(rotation);
  scene.setConnectionsVisible(connectionsVisible);
  selectPart(selected, { preserveGroup: true });
  updateDesignStats();
  saveDraft();
  refreshReviewHighlights();
}
function edit(mutator) {
  if (mode !== 'build') return;
  remember(); mutator(); refreshDesign();
}
function updateDesignStats() {
  const check = designAnalysis();
  $('part-count').textContent = check.count;
  $('mass-value').textContent = check.mass.toFixed(1);
  $('build-cost').textContent = check.cost;
  $('footer-cost').textContent = `${check.cost}${currentMission().budget == null ? '' : `/${currentMission().budget}`}`;
  $('build-budget').textContent = currentMission().budget ?? '∞';
  $('budget-fill').style.width = `${currentMission().budget ? Math.min(100, 100 * check.cost / currentMission().budget) : 0}%`;
  $('budget-fill').classList.toggle('over', check.overBudget);
  $('ready-badge').textContent = check.ready ? '준비 완료' : check.overBudget ? '자재 초과' : '연결 필요';
  $('ready-badge').classList.toggle('warning', !check.ready);
  const profile = controlProfile();
  const mobility = profile.water ? `부력 ${check.floatCount || 0} · 추진 ${check.propellerCount || 0}` : profile.flight ? `날개 ${check.wingCount || 0} · 추진 ${check.propellerCount || 0}` : `구동 바퀴 ${check.wheelCount}개`;
  $('preflight-checks').innerHTML = `<span class="${check.valid ? 'check-ok' : 'check-warn'}">${check.valid ? '✓' : '!'} 코어 연결 ${check.count - check.disconnectedIds.length}/${check.count}</span><span class="check-info">${mobility}</span><span class="check-info">${check.cannonCount ? `대포 ${check.cannonCount}문` : profile.route ? '순서대로 관문 통과' : '충각 / 구조 시험 설계'}</span>`;
  const mobilityWarning = check.mobilityWarnings?.[0];
  $('mobility-warning').hidden = !mobilityWarning;
  $('mobility-warning').textContent = mobilityWarning || '';
  updateControlHints();
  const status = $('connection-status');
  const issue = check.errors?.[0] || (check.overBudget ? `제작 자재가 ${check.cost - currentMission().budget} 초과했습니다.` : null);
  status.classList.toggle('warning', !!issue);
  status.innerHTML = `<em></em>${issue ? (check.overBudget && check.valid ? '자재 초과' : '연결 필요') : '출격 준비'}`;
  status.title = issue || `${check.connectionCount}개 연결부 · 클릭해서 무게중심 확인`;
  $('undo-btn').disabled = !history.length;
  $('redo-btn').disabled = !future.length;
  document.querySelector('.part-button[data-type=core]').classList.toggle('present', parts.some(p => p.type === 'core'));
  scene.setDiagnostics(diagnosticsVisible ? { centerOfMass: check.centerOfMass, disconnectedIds: check.disconnectedIds } : { centerOfMass: null, disconnectedIds: [] });
}
function placePart(cell) {
  if (mode !== 'build' || !tool || tool === 'erase') return;
  const template = { type: tool, power: 1, binding: 'all', elevation: PARTS[tool]?.defaultElevation ?? 0, ...(placement?.template || {}), rot: rotation };
  const movingId = placement?.kind === 'move' ? placement.id : null;
  const result = planPlacement(parts, template, cell, { movingId, mirror: mirrorOn && !movingId, createId: () => `part-${++idCounter}` });
  if (!result.ok) return toast(result.error, true);
  remember(); parts = result.parts;
  if (movingId) { setTool(null); selected = movingId; }
  refreshDesign();
  sound('place');
}
function beginPlacement(kind) {
  const p = parts.find(p => p.id === selected);
  if (mode !== 'build' || !p) return toast('먼저 이동하거나 복사할 부품을 선택하세요.');
  if (selectedIds.size > 1) return toast('묶음 편집의 방향 버튼으로 이동하거나 복사하세요.');
  if (p.type === 'core') return toast('코어는 고정 기준점입니다. 다른 부품을 선택해 주세요.');
  setTool(p.type); placement = { kind, id: p.id, template: { ...p } }; rotation = p.rot;
  scene.setRotation(rotation); scene.setElevation(p.elevation || 0);
  scene.setExcludedPart(kind === 'move' ? p.id : null); scene.setMirror(kind !== 'move' && mirrorOn);
  $('rotation-label').textContent = `${rotation * 90}°`;
  $('placement-notice').hidden = false;
  $('placement-message').textContent = kind === 'move' ? '새 위치를 클릭하세요. 취소하면 원래 위치를 유지합니다.' : '복사할 위치를 클릭하세요. 부품 설정도 함께 복사합니다.';
}
function toggleMirror() {
  if (mode !== 'build') return;
  mirrorOn = !mirrorOn; scene.setMirror(mirrorOn && placement?.kind !== 'move');
  $('mirror-btn').setAttribute('aria-pressed', String(mirrorOn));
  toast(mirrorOn ? '좌우 대칭 배치 켜짐 · X=0 기준으로 함께 배치합니다.' : '좌우 대칭 배치를 껐습니다.');
}
function diagnose() {
  if (mode !== 'build') return;
  diagnosticsVisible = !diagnosticsVisible; updateDesignStats();
  const check = designAnalysis();
  if (diagnosticsVisible) { connectionsVisible = true; scene.setConnectionsVisible(true); $('connections-btn').setAttribute('aria-pressed', 'true'); toast(check.errors[0] || (check.overBudget ? `자재 ${check.cost} / ${currentMission().budget}. 부품을 줄이거나 자유 제작을 선택하세요.` : '십자 표시는 무게중심입니다. 주황색 부품은 코어에 연결되지 않았습니다.')); }
}
function deletePart(id = selected) {
  const p = parts.find(item => item.id === id);
  if (!p || mode !== 'build') return;
  if (id === selected && selectedIds.size > 1) return groupTransform('delete');
  if (p.type === 'core') return toast('코어는 설계의 기준점입니다. 다른 부품을 선택해 주세요.');
  edit(() => { parts = parts.filter(item => item.id !== id); if (selected === id) selected = null; });
  sound('delete');
}
function rotatePart() {
  if (mode !== 'build') return;
  if (!tool && selectedIds.size > 1) return groupTransform('rotate');
  const p = parts.find(item => item.id === selected);
  if (p && !tool) { edit(() => { p.rot = ((p.rot || 0) + 1) % 4; }); sound('place'); }
  else { rotation = (rotation + 1) % 4; scene.setRotation(rotation); $('rotation-label').textContent = `${rotation * 90}°`; }
}
function undo() {
  if (mode !== 'build' || !history.length) return;
  setTool(null);
  future.push({ parts: cloneParts(parts), mission });
  const previous = history.pop(), changedMission = mission !== previous.mission;
  parts = previous.parts; mission = previous.mission; selected = null; selectedIds.clear(); activeSlotId = null;
  refreshDesign(); if (changedMission) { updateMission(); scene.focus(); }
  toast('이전 설계와 작전으로 되돌렸습니다.');
}
function redo() {
  if (mode !== 'build' || !future.length) return;
  setTool(null);
  history.push({ parts: cloneParts(parts), mission });
  const next = future.pop(), changedMission = mission !== next.mission;
  parts = next.parts; mission = next.mission; selected = null; selectedIds.clear(); activeSlotId = null;
  refreshDesign(); if (changedMission) { updateMission(); scene.focus(); }
}

function updateMission() {
  const index = Math.max(0, MISSIONS.findIndex(m => m.id === mission));
  const m = MISSIONS[index];
  $('mission-title').textContent = m.name;
  $('mission-description').textContent = m.description;
  $('mission-number').textContent = String(index + 1).padStart(2, '0');
  $('mission-eyebrow').textContent = `${m.environment === 'water' ? 'SEA TRIAL' : m.environment === 'air' ? 'FLIGHT TEST' : 'SIEGE TEST'} ${String(index + 1).padStart(2, '0')}`;
  $('mission-select').value = mission;
  $('objective-label').textContent = m.objective === 'route' ? '통과한 관문' : m.objective === 'sandbox' ? '자유 시험' : '파괴한 표적';
  $('target-count').textContent = m.objective === 'route' ? m.checkpointCount : m.targetCount;
  $('destroyed-count').textContent = '0';
  $('goal-progress').style.width = '0%';
  $('brief-resource-label').textContent = m.objective === 'route' ? '관문' : '탄약';
  $('brief-ammo').textContent = m.objective === 'route' ? m.checkpointCount : m.ammo ?? '∞';
  $('brief-time').textContent = m.timeLimit == null ? '무제한' : formatTime(m.timeLimit);
  const stars = progress?.missions?.[mission]?.stars || 0;
  $('mission-stars').textContent = m.campaign ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : 'FREE';
  $('mission-stars').setAttribute('aria-label', `최고 기록 ${stars}개 별`);
  $('recommended-design').textContent = `${PRESET_NAMES[m.recommendedPreset] || PRESET_NAMES.rover} 불러오기 ↗`;
  $('recommended-design').title = '현재 설계는 이전 작업으로 보관됩니다.';
  document.body.dataset.environment = m.environment || 'land';
  document.body.dataset.objective = m.objective || 'destroy';
  $('route-brief').hidden = m.objective !== 'route';
  $('route-brief').textContent = m.environment === 'water' ? 'W 추진 · A/D 조타 · 코어 침수 주의' : m.environment === 'air' ? 'W 추진 · ↑/↓ 기수 · ←/→ 기울기' : 'W/S 구동 · A/D 선회 · B 감속 · 관문 순서 준수';
  scene.setMission(mission);
  updateDesignStats();
  refreshReviewHighlights();
}

function updateControlHints() {
  const profile = controlProfile();
  document.body.dataset.flight = String(profile.flight);
  const hasCannons = currentMission().ammo !== 0 && parts.some(p => p.type === 'cannon');
  if (!hasCannons) touchWeaponMode = false;
  $('flight-controls').hidden = !profile.flight || touchWeaponMode;
  $('mechanism-controls').hidden = !profile.mechanism;
  $('flight-assist').hidden = !(profile.flight || profile.water);
  $('flight-assist').setAttribute('aria-pressed', String(flightAssist));
  $('flight-assist').textContent = `자세 보조 ${flightAssist ? 'ON' : 'OFF'}`;
  $('route-telemetry').hidden = mode !== 'play' || !(profile.route || profile.powered || profile.flight);
  $('play-hint').innerHTML = profile.flight
    ? '<span><kbd>W S</kbd> 추진</span><span><kbd>↑ ↓</kbd> 기수</span><span><kbd>← →</kbd> 기울기</span><span><kbd>A D</kbd> 방향</span>'
    : profile.water ? '<span><kbd>W S</kbd> 추진</span><span><kbd>A D</kbd> 조타</span><span><kbd>B</kbd> 감속</span>'
    : profile.mechanism ? '<span><kbd>W S A D</kbd> 주행</span><span><kbd>Z X</kbd> 피스톤</span><span>부품 클릭 <b>점검</b></span>'
    : '<span><kbd>W S A D</kbd> 주행</span><span><kbd>Q E</kbd> 포탑</span><span><kbd>I K</kbd> 고각</span><span><kbd>F</kbd> 발사</span>';
  $('touch-weapons').hidden = (profile.flight && !touchWeaponMode) || !hasCannons;
  $('touch-mode').hidden = !profile.flight || !hasCannons;
  $('touch-mode').textContent = touchWeaponMode ? '비행 조작으로 전환' : '포격 조작으로 전환';
  $('touch-mode').setAttribute('aria-pressed', String(touchWeaponMode));
}

function applyRecommendedDesign() {
  const preset = currentMission().recommendedPreset || 'rover';
  loadDesign({ format: 'ironwood-design', version: 1, mission, parts: makePreset(preset) }, `${PRESET_NAMES[preset]} 준비 완료. 부품을 수정하거나 Space로 출격하세요.`);
}

function startSimulation() {
  if (mode === 'play') return resetSimulation();
  if (tool || placement) setTool(null);
  const check = designAnalysis();
  if (!check.ready) { diagnosticsVisible = true; updateDesignStats(); return toast(check.errors[0] || `제작 자재 ${check.cost} / ${currentMission().budget}. 부품을 줄이거나 자유 제작을 선택하세요.`, true); }
  if (check.warnings?.length) toast(check.warnings[0]);
  wakeAudio(); KEYS.clear(); touch.clear(); paused = false; slow = false; resultShown = false;
  clearTimeout(outcomeTimer); sessionSerial++;
  selectPart(null);
  runReport = createRunReport(parts, mission); lastReportSample = -Infinity;
  reviewVisible = false; scene.setReviewHighlights([]);
  try { simulation = new Simulation({ parts: cloneParts(parts), mission, onEvent: handleEvent }); }
  catch (error) { runReport = null; console.error(error); return toast('물리를 시작하지 못했습니다. 설계를 확인해 주세요.', true); }
  mode = 'play'; document.body.dataset.mode = mode;
  scene.setMode('play'); scene.setSimulation(simulation);
  scene.setAimVisible(aimVisible); scene.setStressVisible(stressVisible);
  scene.setStressMode(stressMode);
  $('test-tools').hidden = false; $('last-report-btn').hidden = true; $('runtime-inspector').hidden = true;
  $('build-panel').hidden = true; $('tool-dock').hidden = true; $('build-label').hidden = true;
  $('build-hint').hidden = true; $('play-hint').hidden = false; $('play-readout').hidden = false;
  $('mobile-controls').hidden = false; $('run-label').textContent = '조립으로 돌아가기';
  $('combat-hud').hidden = false; $('preflight').hidden = true;
  $('pause-top').hidden = false; $('pause-top').disabled = false; $('pause-top').textContent = 'Ⅱ'; $('pause-top').setAttribute('aria-label', '일시정지');
  $('run-btn').classList.add('running'); $('run-btn').querySelector('.run-icon').textContent = '↺';
  $('mode-pill').innerHTML = '<span></span>물리 시뮬레이션'; $('mode-pill').classList.add('playing');
  $('pause-btn').textContent = 'Ⅱ 일시정지'; $('slow-btn').textContent = '1× 속도'; $('slow-btn').setAttribute('aria-pressed', 'false');
  $('pause-btn').disabled = false;
  $('target-count').textContent = simulation.objectiveProgress?.total ?? simulation.targetCount;
  $('mission-select').disabled = true;
  captureReport(true); updateReadout(); updateTestTools();
  const profile = controlProfile();
  updateControlHints();
  toast(profile.mechanism ? 'Z 늘리기 · X 줄이기 · 부품을 클릭하면 멈추고 상태를 점검합니다.' : profile.flight ? 'W를 눌러 가속 · ↑/↓ 기수 · ←/→ 기울기 · 자세 보조 ON 권장' : profile.water ? 'W 추진 · A/D 조타 · 빛나는 관문을 순서대로 통과하세요.' : 'W A S D 주행 · B 제동 · 부품 클릭으로 일시정지 점검');
}
function resetSimulation({ silent = false } = {}) {
  if (mode === 'build') return;
  clearTimeout(outcomeTimer); sessionSerial++;
  $('result-dialog').close();
  captureReport(true); lastReport = snapshotRunReport(runReport) || lastReport; runReport = null;
  for (const id of ['report-dialog', 'design-dialog', 'help-dialog', 'campaign-dialog']) { $(id).dataset.resume = ''; $(id).close(); }
  mode = 'build'; document.body.dataset.mode = mode;
  KEYS.clear(); touch.clear();
  scene.setSimulation(null); simulation?.dispose(); simulation = null;
  scene.setMode('build'); scene.setDesign(parts); scene.setMission(mission); scene.focus();
  $('build-panel').hidden = false; $('tool-dock').hidden = false; $('build-label').hidden = false;
  $('build-hint').hidden = false; $('play-hint').hidden = true; $('play-readout').hidden = true; $('mobile-controls').hidden = true;
  $('combat-hud').hidden = true; $('preflight').hidden = false;
  $('pause-top').hidden = true;
  $('test-tools').hidden = true; $('runtime-inspector').hidden = true;
  document.body.dataset.inspecting = 'false';
  selected = null; selectedIds.clear(); reviewVisible = true;
  $('run-label').textContent = '시뮬레이션 시작'; $('run-btn').classList.remove('running'); $('run-btn').querySelector('.run-icon').textContent = '▶';
  $('mode-pill').innerHTML = '<span></span>설계 모드'; $('mode-pill').classList.remove('playing');
  $('destroyed-count').textContent = '0'; $('goal-progress').style.width = '0%'; $('mission-select').disabled = false;
  setTool(null); refreshDesign();
  scene.setStressVisible(false); updateMission();
  if (!silent) toast('시험 전 설계를 복원했습니다. 다시 만들어 보세요.');
}
function retryMission() { resetSimulation({ silent: true }); startSimulation(); }
function getInput() {
  return readControls(KEYS, touch, { ...controlProfile(), assist: flightAssist });
}
function handleEvent(event) {
  recordRunEvent(runReport, event);
  scene.effect(event);
  if (['fire', 'hit', 'break', 'win', 'fail', 'damage'].includes(event.type)) sound(event.type);
  if (event.type === 'enemy-fire') sound('fire');
  if (event.type === 'checkpoint') { sound('place'); toast(`관문 ${event.completed ?? event.index + 1} / ${event.total ?? currentMission().checkpointCount} 통과`); }
  if (event.type === 'dry-fire' && performance.now() - lastDryToast > 1800) { lastDryToast = performance.now(); toast(event.reason || '발사할 수 없습니다. 탄약과 대포의 연결을 확인하세요.'); }
}
function settleOutcome() {
  if (!simulation?.outcome || resultShown) return;
  resultShown = true;
  const run = simulation, token = sessionSerial;
  const stats = run.result || { won: run.won, elapsed: run.elapsed, shots: run.shots, integrity: run.integrity, cost: analyzeDesign(parts).cost };
  const score = scoreRun(mission, stats);
  if (run.won) { progress = recordCompletion(progress, mission, stats); if (!storageSet(STORAGE.progress, progress)) toast('기록을 저장할 수 없습니다. 브라우저 저장 공간을 확인해 주세요.', true); }
  outcomeTimer = setTimeout(() => {
    if (token !== sessionSerial || simulation !== run || mode !== 'play') return;
    for (const id of ['design-dialog', 'help-dialog', 'campaign-dialog', 'report-dialog']) { $(id).dataset.resume = ''; $(id).close(); }
    paused = true; KEYS.clear(); touch.clear();
    $('pause-btn').disabled = true; $('pause-btn').textContent = '작전 종료';
    $('pause-top').disabled = true;
    updateTestTools();
    $('result-dialog').classList.toggle('failed', !run.won);
    $('result-emblem').textContent = run.won ? '⚑' : '◇';
    $('result-eyebrow').textContent = run.won ? 'OPERATION COMPLETE' : 'RETURN TO THE WORKSHOP';
    $('result-title').textContent = run.won ? '작전을 완수했습니다.' : '다시 설계할 시간입니다.';
    const route = currentMission().objective === 'route';
    $('result-text').textContent = run.won ? route ? `${currentMission().name} · 관문 ${run.objectiveProgress?.total || currentMission().checkpointCount}개를 순서대로 통과했습니다.` : `${currentMission().name} · 표적 ${run.targetCount}개를 파괴했습니다.` : run.failReason || '기체가 작전을 계속할 수 없습니다.';
    $('result-stars').textContent = '★'.repeat(score.stars) + '☆'.repeat(3 - score.stars);
    $('result-stars').hidden = !run.won || !currentMission().campaign;
    $('result-criteria').hidden = !run.won || !currentMission().campaign;
    $('result-criteria').innerHTML = `<span class="earned">✓ 작전 완수</span><span class="${score.timeStar ? 'earned' : ''}">${score.timeStar ? '✓' : '·'} ${formatTime(currentMission().parTime || 0)} 이내</span><span class="${score.precisionStar ? 'earned' : ''}">${score.precisionStar ? '✓' : '·'} ${route ? '' : `${currentMission().parShots || 0}발 이내 · `}기체 75% 유지</span>`;
    $('result-time').textContent = formatTime(stats.elapsed);
    $('result-shots').textContent = route ? `${run.checkpointIndex}/${currentMission().checkpointCount}` : stats.shots;
    $('result-secondary-label').textContent = route ? '통과한 관문' : '발사 횟수';
    $('result-integrity').textContent = `${Math.round(stats.integrity * 100)}%`;
    const next = nextCampaignMission(mission);
    $('next-mission').hidden = !run.won;
    $('next-mission').textContent = next ? '다음 작전 →' : '캠페인 기록 보기 →';
    $('retry-btn').classList.toggle('secondary-button', run.won);
    $('result-dialog').showModal();
  }, run.won ? 700 : 450);
}
function formatTime(seconds) { seconds = Math.max(0, Number(seconds) || 0); return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`; }
function updateReadout() {
  if (!simulation) return;
  const route = currentMission().objective === 'route';
  const telemetry = simulation.telemetry || {};
  const objective = simulation.objectiveProgress || { completed: simulation.destroyedCount, total: simulation.targetCount };
  $('speed-value').textContent = Math.min(999, simulation.speed || 0).toFixed(1);
  $('time-value').textContent = formatTime(simulation.elapsed || 0);
  $('broken-count').textContent = simulation.brokenCount || 0;
  $('shot-count').textContent = simulation.shots || 0;
  $('integrity-value').textContent = `${Math.round(100 * (simulation.integrity ?? 1))}%`;
  $('core-hp').textContent = Math.ceil(simulation.coreHp ?? 100);
  $('core-fill').style.width = `${Math.max(0, 100 * simulation.coreHp / simulation.coreMaxHp)}%`;
  $('combat-hud').classList.toggle('critical', simulation.coreHp <= simulation.coreMaxHp * .3);
  $('hud-resource-label').textContent = route ? currentMission().environment === 'water' ? '수면 위 높이' : currentMission().environment === 'air' ? '고도' : '주행 속도' : '잔여 탄약';
  $('ammo-value').textContent = route ? (currentMission().environment === 'land' ? simulation.speed : telemetry.altitude || 0).toFixed(1) : simulation.ammoRemaining ?? '∞';
  $('remaining-time').textContent = simulation.timeRemaining == null ? formatTime(simulation.elapsed) : formatTime(Math.ceil(simulation.timeRemaining));
  $('aim-angle').textContent = route ? currentMission().environment === 'land' ? 'm/s' : 'm' : `${Math.round(simulation.aimElevation || 0)}°`;
  const guide = simulation.getAimGuide();
  const completion = objective.total ? Math.min(1, objective.completed / objective.total) : 0;
  $('reload-fill').style.width = `${100 * (route ? completion : guide?.reloadProgress ?? 0)}%`;
  $('reload-label').textContent = simulation.outcome ? '작전 종료' : route ? `관문 ${objective.completed}/${objective.total} · ${currentMission().environment === 'water' ? telemetry.submerged > .5 ? '침수 주의 · 코어를 수면 위로' : 'W 추진 · A/D 조타' : currentMission().environment === 'air' ? 'W 추진 · 방향키로 자세 조절' : 'W/S 구동 · A/D 선회 · B 감속'}` : simulation.ammoRemaining === 0 ? '탄약 소진 · 충각 공격 가능' : guide?.ready ? '발사 준비 · F' : guide?.points?.length ? '재장전 중' : controlProfile().mechanism ? 'Z 늘리기 · X 줄이기 · 중립에서 높이 유지' : controlProfile().powered ? 'W/S 추진 · B 감속' : '연결된 대포 없음';
  $('destroyed-count').textContent = objective.completed || 0;
  $('compact-objective-label').textContent = route ? '관문' : '표적';
  $('compact-destroyed').textContent = `${objective.completed || 0}/${objective.total}`;
  $('goal-progress').style.width = `${completion * 100}%`;
  $('route-speed').textContent = (telemetry.airspeed ?? simulation.speed ?? 0).toFixed(1);
  $('route-thrust').textContent = `${Math.round(Math.abs(telemetry.throttle || 0) * 100)}%`;
  const next = objective.next;
  const core = simulation.corePosition;
  const distance = next && core ? Math.hypot(next.position.x - core.x, next.position.y - core.y, next.position.z - core.z) : null;
  $('route-next').textContent = next ? `${objective.completed + 1}번 관문 · ${Math.ceil(distance)}m` : route ? '모든 관문 통과' : `${(telemetry.altitude || 0).toFixed(1)}m · 높이`;
  $('route-altitude').hidden = !Number.isFinite(next?.minAltitude);
  $('route-altitude').textContent = next?.minAltitude != null ? `관문 통과 고도 ${next.minAltitude.toFixed(1)}m 이상` : '';
  $('route-vertical').textContent = `${(telemetry.verticalSpeed || 0) >= 0 ? '+' : ''}${(telemetry.verticalSpeed || 0).toFixed(1)}`;
  $('route-telemetry').classList.toggle('submerged', (telemetry.submerged || 0) > .5);
  updateInspection(); updateTestTools();
}
function pauseToggle() {
  if (mode !== 'play' || simulation?.outcome) return;
  paused = !paused; KEYS.clear(); touch.clear();
  $('pause-btn').textContent = paused ? '▶ 계속하기' : 'Ⅱ 일시정지';
  $('pause-top').textContent = paused ? '▶' : 'Ⅱ'; $('pause-top').setAttribute('aria-label', paused ? '계속하기' : '일시정지');
  if (!paused) { selected = null; selectedIds.clear(); scene.setSelections([], null); $('runtime-inspector').hidden = true; document.body.dataset.inspecting = 'false'; }
  updateTestTools();
}

function element(tag, text, className = '') {
  const node = document.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = String(text);
  if (className) node.className = className;
  return node;
}
function downloadJSON(value, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const a = element('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function captureReport(force = false) {
  if (!simulation || !runReport) return;
  if (!force && simulation.elapsed - lastReportSample < REPORT_SAMPLE_PERIOD) return;
  sampleRunReport(runReport, simulation); lastReportSample = simulation.elapsed;
}
function currentReport() { return simulation && runReport ? runReport : lastReport; }
function refreshReviewHighlights() {
  if (!scene) return;
  const same = reportMatchesDesign(lastReport, parts, mission);
  scene.setReviewHighlights(mode === 'build' && reviewVisible && same ? getReportIssues(lastReport).map(p => p.id) : []);
  $('last-report-btn').hidden = mode !== 'build' || !lastReport;
  $('last-report-btn').textContent = same ? '이전 시험 · 파손 위치와 보고서 ↗' : '이전 시험 보고서 · 설계 변경됨 ↗';
}
function updateTestTools() {
  if (!simulation) return;
  $('test-status').textContent = simulation.outcome ? '시험 종료' : paused ? '일시정지 · 점검 가능' : '시험 중 · 부품 클릭으로 점검';
  $('step-btn').disabled = !paused || !!simulation.outcome;
  $('test-slow-btn').setAttribute('aria-pressed', String(slow));
  $('test-load-btn').setAttribute('aria-pressed', String(stressVisible));
  $('stress-legend').hidden = !stressVisible;
  $('stress-legend').textContent = stressMode === 'damage'
    ? '초록 0% → 노랑 55% → 빨강 100% · 누적 연결 손상'
    : '초록 0% → 노랑 55% → 빨강 100% · 강도 대비 하중비';
}
function setStressVisibility(value) {
  stressVisible = value; scene.setStressVisible(stressVisible); scene.setStressMode(stressMode);
  $('stress-btn').setAttribute('aria-pressed', String(stressVisible)); updateTestTools();
}
function updateInspection() {
  if (!simulation || !selected || $('runtime-inspector').hidden) return;
  const state = inspectSimulationPart(simulation, selected);
  if (!state) { $('runtime-inspector').hidden = true; return; }
  $('runtime-part-name').textContent = PARTS[state.type].name;
  $('runtime-part-status').textContent = `${state.dead ? '파괴됨' : state.connected ? '코어 연결' : '코어 분리 · 구동 제어 불가'} · HP ${Math.ceil(state.hp)} / ${state.maxHp}`;
  const details = $('runtime-part-details'); details.replaceChildren();
  if (state.piston) {
    const extension = Math.abs(state.piston.extension) < .005 ? 0 : state.piston.extension;
    details.append(element('p', `실제 이동 ${extension.toFixed(2)}m / 목표 ${state.piston.target.toFixed(2)}m`));
    details.append(element('p', `최대 이동 ${state.piston.stroke.toFixed(2)}m · 구동 사용 ${Math.round(state.piston.load * 100)}%`));
  }
  const list = $('runtime-connections'); list.replaceChildren();
  for (const edge of state.connections) {
    const other = parts.find(p => p.id === edge.other);
    list.append(element('p', `${PARTS[other?.type]?.short || '부품'} · ${edge.broken ? '연결 파손' : `하중비 ${Math.round(edge.stress * 100)}% · 손상 ${Math.round((1 - edge.health) * 100)}%`}`, edge.broken ? 'damaged' : ''));
  }
  if (!state.connections.length) list.append(element('p', '연결부 없음'));
  $('inspection-resume').hidden = !!simulation.outcome;
}
function reportPartLabel(report, id) {
  const p = report.parts.find(p => p.id === id);
  return p ? `${PARTS[p.type]?.name || p.type} (${p.x}, ${p.y}, ${p.z})` : '알 수 없는 부품';
}
function openReport() {
  captureReport(true);
  const report = currentReport();
  if (!report) return toast('먼저 기체를 출격해 시험해 주세요.');
  $('result-dialog').close();
  renderReport(report); openOverlay('report-dialog');
}
function renderReport(report) {
  const m = MISSIONS.find(item => item.id === report.mission);
  const same = reportMatchesDesign(report, parts, mission);
  const outcome = report.outcome === 'won' ? '작전 완수' : report.outcome === 'failed' ? report.failReason : simulation ? '진행 중인 시험' : '조립으로 복귀한 시험';
  $('report-subtitle').textContent = `${m?.name || '시험'} · ${outcome}`;
  const metrics = $('report-metrics'); metrics.replaceChildren();
  for (const [label, value] of [['시험 시간', `${report.elapsed.toFixed(2)}s`], ['연결 유지', `${Math.round(report.integrity * 100)}%`],
    ['최고 속도 표본', `${report.peakSpeed.toFixed(1)}m/s`], ['파손 연결', report.connections.filter(e => e.broken).length]]) {
    const node = element('div'); node.append(element('b', value), element('span', label)); metrics.append(node);
  }
  $('report-design-state').textContent = same ? '이 시험의 원본 설계입니다. 관련 부품을 선택하거나 조립으로 돌아가 위치를 확인하세요.' : '시험 이후 설계 또는 작전이 달라졌습니다. 원본 기록만 표시하며 현재 기체에 위치를 잘못 표시하지 않습니다.';
  const advice = $('report-advice'); advice.replaceChildren(...reportAdvice(report).map(text => element('li', text)));
  const issues = getReportIssues(report), list = $('report-parts'); list.replaceChildren();
  for (const p of issues.slice(0, 12)) {
    const button = element('button'); button.disabled = !same;
    button.append(element('strong', reportPartLabel(report, p.id)), element('small',
      `${p.dead ? '파괴 · ' : !p.connected ? '분리 · ' : ''}${p.brokenLink ? '연결 파손 · ' : ''}HP ${Math.ceil(p.hp)}/${p.maxHp} · 최고 하중비 ${Math.round(p.maxStress * 100)}%`));
    button.addEventListener('click', () => {
      $('report-dialog').dataset.resume = ''; $('report-dialog').close();
      if (mode === 'build') setTool(null);
      selectPart(p.id); scene.focus();
    });
    list.append(button);
  }
  if (!issues.length) list.append(element('p', '손상·분리 또는 80% 이상의 표본 하중이 기록된 부품이 없습니다.'));
  if (issues.length > 12) list.append(element('small', `관련 부품 ${issues.length}개 중 12개 표시 · 전체 기록은 JSON에서 확인`));
  const reasons = { stress: '하중 초과', impact: '누적 충격', 'part-destroyed': '부품 HP 소진', unknown: '기록 없음' };
  const sources = { collision: '충돌', 'enemy-shell': '적 포탄', 'friendly-shell': '자체 포탄' };
  const events = $('report-events'); events.replaceChildren();
  if (report.firstBreak) events.append(element('li', `${report.firstBreak.time.toFixed(2)}s · 첫 파손: ${reportPartLabel(report, report.firstBreak.a)} ↔ ${reportPartLabel(report, report.firstBreak.b)} · ${reasons[report.firstBreak.reason] || '기타 원인'}`, 'first-break'));
  for (const event of report.events.slice(-24).reverse()) {
    let text;
    if (event.type === 'damage') text = `${reportPartLabel(report, event.partId)} · HP −${(event.damage || 0).toFixed(1)} · ${sources[event.source] || '충격'} `;
    else if (event.type === 'break') text = `${reportPartLabel(report, event.a)} ↔ ${reportPartLabel(report, event.b)} · ${reasons[event.reason] || '연결 파손'}`;
    else if (event.type === 'part-destroy') text = `${reportPartLabel(report, event.partId)} 파괴`;
    else if (event.type === 'checkpoint') text = `관문 ${event.completed}/${event.total} 통과`;
    else text = event.type === 'win' ? '작전 완수' : event.reason || '시험 실패';
    events.append(element('li', `${event.time.toFixed(2)}s · ${text}`));
  }
  if (!report.events.length) events.append(element('li', '손상·파손·관문 통과 사건이 아직 없습니다.'));
  if (report.droppedEvents || report.events.length > 24) events.append(element('li', '최근 24개 사건 표시 · 최초 파손과 부품별 누계는 별도 유지합니다.'));
  $('report-revise').disabled = !same;
}

function openCampaign() {
  $('campaign-list').innerHTML = MISSIONS.filter(m => m.campaign).map((m, i) => {
    const record = progress.missions[m.id];
    return `<button class="campaign-card" data-campaign="${m.id}" data-environment="${m.environment || 'land'}"><span class="campaign-index">0${i + 1}</span><span class="campaign-info"><strong>${m.name}</strong><small>${m.description}</small><em>자재 ${m.budget} · ${m.objective === 'route' ? `관문 ${m.checkpointCount}` : `탄약 ${m.ammo}`} · ${formatTime(m.timeLimit)}</em></span><span class="campaign-record"><b>${'★'.repeat(record.stars)}${'☆'.repeat(3 - record.stars)}</b><small>${record.bestTime == null ? '첫 기록을 남겨보세요' : `${formatTime(record.bestTime)}${m.objective === 'route' ? ` · ${record.clears}회 완주` : ` · 최소 ${record.bestShots ?? '—'}발`}`}</small></span></button>`;
  }).join('');
  $('campaign-list').querySelectorAll('[data-campaign]').forEach(b => b.addEventListener('click', () => chooseMission(b.dataset.campaign)));
  openOverlay('campaign-dialog');
}
function openOverlay(id) {
  const dialog = $(id);
  const resume = mode === 'play' && !paused && !simulation?.outcome;
  if (resume) pauseToggle();
  dialog.dataset.resume = resume ? String(sessionSerial) : '';
  dialog.showModal();
}
function chooseMission(id) {
  if (mode === 'play') resetSimulation({ silent: true });
  else setTool(null);
  mission = MISSIONS.some(m => m.id === id) ? id : 'outpost';
  $('campaign-dialog').close(); $('result-dialog').close(); updateMission(); saveDraft(); scene.focus();
  toast(`${currentMission().name} 준비 · ${currentMission().objective === 'route' ? '추천 설계를 불러오거나 직접 만든 기체로 도전하세요.' : '자재와 연결을 확인한 뒤 출격하세요.'}`);
}
function savePrefs() { storageSet(STORAGE.prefs, { soundOn, quality, aimVisible, flightAssist }); }

function openDesigns({ saving = false } = {}) {
  const saved = storageGet(STORAGE.saved);
  $('saved-info').textContent = saved?.parts ? `${saved.parts.length}개 부품 · ${new Date(saved.savedAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : '아직 저장한 설계가 없습니다.';
  $('restore-btn').disabled = !saved?.parts;
  const backup = storageGet(STORAGE.backup);
  $('backup-info').textContent = backup?.parts ? `${backup.parts.length}개 부품 · 설계를 바꾸기 전의 작업` : '설계를 바꾸면 이전 작업이 보관됩니다.';
  $('backup-btn').disabled = !backup?.parts;
  renderDesignSlots();
  if (!$('design-name').value.trim()) $('design-name').value = activeSlotId ? getDesignSlot(designs, activeSlotId)?.name || `${currentMission().name} 설계` : `${currentMission().name} 설계`;
  openOverlay('design-dialog');
  if (saving) { $('design-name').focus(); $('design-name').select(); $('design-name').scrollIntoView({ block: 'nearest' }); }
}
function applyDesignStore(result, message) {
  if (!result.ok) { $('design-storage-status').textContent = result.error; return toast(result.error, true); }
  if (!storageSet(STORAGE.designs, result.store)) {
    $('design-storage-status').textContent = '저장 공간을 사용할 수 없습니다. JSON으로 내보내세요.';
    return toast('설계 보관함을 저장하지 못했습니다. 현재 작업을 JSON으로 내보내세요.', true);
  }
  designs = result.store;
  if (result.slotId && getDesignSlot(designs, result.slotId)) activeSlotId = result.slotId;
  else if (activeSlotId && !getDesignSlot(designs, activeSlotId)) activeSlotId = null;
  renderDesignSlots(); $('design-storage-status').textContent = message; sound('place');
}
function renderDesignSlots() {
  $('design-slot-count').textContent = `${designs.slots.length} / 8`;
  const list = $('design-slots'); list.replaceChildren();
  for (const slot of designs.slots) {
    const row = element('section', null, 'design-slot');
    const name = element('input'); name.type = 'text'; name.maxLength = 40; name.value = slot.name;
    name.setAttribute('aria-label', `${slot.name} 이름 변경`);
    const m = MISSIONS.find(m => m.id === slot.blueprint.mission);
    const info = element('small', `${slot.blueprint.parts.length}개 부품 · ${m?.name || '돌초소'}${slot.id === activeSlotId ? ' · 현재 선택' : ''}`);
    const actions = element('div', null, 'design-slot-actions');
    const load = element('button', '불러오기'), rename = element('button', '이름 저장');
    const replace = element('button', '현재 설계로 덮어쓰기'), remove = element('button', '삭제', 'danger-text');
    load.addEventListener('click', () => {
      const current = getDesignSlot(designs, slot.id);
      if (!current) return toast('설계를 찾을 수 없습니다.', true);
      try { loadDesign(current.blueprint, `${current.name} 설계를 불러왔습니다.`); activeSlotId = current.id; $('design-name').value = current.name; }
      catch (e) { toast(e.message, true); }
    });
    rename.addEventListener('click', () => applyDesignStore(renameDesignSlot(designs, slot.id, name.value, { now: new Date().toISOString() }), '설계 이름을 변경했습니다.'));
    replace.addEventListener('click', () => applyDesignStore(saveDesignSlot(designs, designData(), { name: name.value, replaceId: slot.id, now: new Date().toISOString() }), '선택한 칸에 현재 설계를 저장했습니다.'));
    remove.addEventListener('click', () => applyDesignStore(deleteDesignSlot(designs, slot.id), '설계 보관함에서 삭제했습니다. 작업대의 기체는 유지됩니다.'));
    actions.append(load, rename, replace, remove); row.append(name, info, actions); list.append(row);
  }
  if (!designs.slots.length) list.append(element('p', '아직 이름을 붙인 설계가 없습니다. 위에서 첫 설계를 저장하세요.'));
}
function loadDesign(data, message) {
  const checked = normalizeImported(data);
  if (mode === 'play') resetSimulation({ silent: true });
  storageSet(STORAGE.backup, designData());
  remember(); parts = checked.parts; mission = checked.mission; selected = null; selectedIds.clear(); activeSlotId = null; rotation = 0;
  setTool(null); refreshDesign(); updateMission(); scene.focus(); $('design-dialog').close(); toast(message);
}
function bindEvents() {
  $('run-btn').addEventListener('click', startSimulation);
  $('select-tool').addEventListener('click', () => setTool(null));
  $('erase-tool').addEventListener('click', () => { setTool(tool === 'erase' ? null : 'erase'); if (tool === 'erase') toast('삭제할 부품을 클릭하세요. V로 선택 도구에 돌아갑니다.'); });
  $('rotate-tool').addEventListener('click', rotatePart); $('rotate-selected').addEventListener('click', rotatePart);
  $('delete-selected').addEventListener('click', () => deletePart()); $('close-inspector').addEventListener('click', () => selectPart(null));
  $('move-selected').addEventListener('click', () => beginPlacement('move'));
  $('copy-selected').addEventListener('click', () => beginPlacement('copy'));
  $('multi-select').addEventListener('click', () => { setTool(null); multiSelect = !multiSelect; $('multi-select').setAttribute('aria-pressed', String(multiSelect)); toast(multiSelect ? '여러 부품 선택 · 클릭할 때마다 선택에 추가하거나 뺍니다.' : '한 부품씩 선택합니다. Shift 클릭으로도 묶을 수 있습니다.'); });
  $('group-clear').addEventListener('click', () => selectPart(null));
  $('group-rotate').addEventListener('click', () => groupTransform('rotate'));
  $('group-mirror').addEventListener('click', () => groupTransform('mirror'));
  $('group-delete').addEventListener('click', () => groupTransform('delete'));
  document.querySelectorAll('[data-nudge]').forEach(button => button.addEventListener('click', () => nudgeGroup(button.dataset.nudge)));
  $('cancel-placement').addEventListener('click', () => setTool(null));
  $('mirror-btn').addEventListener('click', toggleMirror);
  $('diagnose-btn').addEventListener('click', diagnose); $('connection-status').addEventListener('click', diagnose);
  $('undo-btn').addEventListener('click', undo); $('redo-btn').addEventListener('click', redo);
  $('connections-btn').addEventListener('click', () => { connectionsVisible = !connectionsVisible; scene.setConnectionsVisible(connectionsVisible); $('connections-btn').setAttribute('aria-pressed', String(connectionsVisible)); });
  document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => { scene.setView(b.dataset.view); document.querySelectorAll('[data-view]').forEach(v => v.classList.toggle('active', v === b)); }));
  $('focus-btn').addEventListener('click', () => scene.focus());
  $('part-power').addEventListener('input', () => { $('power-value').value = `${Number($('part-power').value).toFixed(1)}×`; });
  $('part-power').addEventListener('change', () => { const p = parts.find(p => p.id === selected); if (!p) return; remember(); p.power = Number($('part-power').value); refreshDesign(); });
  $('part-binding').addEventListener('change', () => { const p = parts.find(p => p.id === selected); if (p) edit(() => { p.binding = $('part-binding').value; }); });
  $('part-elevation').addEventListener('input', () => { $('elevation-value').value = `${$('part-elevation').value}°`; });
  $('part-elevation').addEventListener('change', () => { const p = parts.find(p => p.id === selected); if (p) edit(() => { p.elevation = Number($('part-elevation').value); }); });
  $('part-stroke').addEventListener('input', () => { $('stroke-value').value = `${Number($('part-stroke').value).toFixed(2)}m`; });
  $('part-stroke').addEventListener('change', () => { const p = parts.find(p => p.id === selected); if (p?.type === 'piston') edit(() => { p.stroke = Number($('part-stroke').value); }); });
  $('mission-select').addEventListener('change', () => { chooseMission($('mission-select').value); $('mission-select').blur(); });
  $('part-binding').addEventListener('change', () => $('part-binding').blur());
  $('pause-btn').addEventListener('click', pauseToggle);
  $('pause-top').addEventListener('click', pauseToggle);
  $('slow-btn').addEventListener('click', () => { slow = !slow; $('slow-btn').textContent = slow ? '0.5× 속도' : '1× 속도'; $('slow-btn').setAttribute('aria-pressed', String(slow)); });
  $('test-slow-btn').addEventListener('click', () => { $('slow-btn').click(); updateTestTools(); });
  $('sound-btn').addEventListener('click', () => { soundOn = !soundOn; $('sound-btn').setAttribute('aria-pressed', String(soundOn)); $('sound-btn').setAttribute('aria-label', soundOn ? '소리 끄기' : '소리 켜기'); $('sound-btn').title = soundOn ? '소리 끄기' : '소리 켜기'; savePrefs(); if (soundOn) { wakeAudio(); sound('place'); } });
  $('quality-btn').addEventListener('click', () => { quality = quality === 'high' ? 'low' : 'high'; scene.setQuality(quality); $('quality-btn').textContent = quality === 'high' ? 'HD' : 'LOW'; $('quality-btn').setAttribute('aria-pressed', String(quality === 'low')); savePrefs(); toast(quality === 'low' ? '성능 우선 · 그림자와 화면 해상도를 줄였습니다.' : '화질 우선 · 그림자와 고해상도 표시를 켰습니다.'); });
  $('aim-btn').addEventListener('click', () => { aimVisible = !aimVisible; scene.setAimVisible(aimVisible); $('aim-btn').setAttribute('aria-pressed', String(aimVisible)); savePrefs(); });
  $('stress-btn').addEventListener('click', () => setStressVisibility(!stressVisible));
  $('test-load-btn').addEventListener('click', () => setStressVisibility(!stressVisible));
  $('stress-mode').addEventListener('change', () => { stressMode = $('stress-mode').value; setStressVisibility(true); $('stress-mode').blur(); });
  $('inspect-core').addEventListener('click', () => selectPart(parts.find(p => p.type === 'core')?.id));
  $('close-runtime-inspector').addEventListener('click', () => selectPart(null));
  $('inspection-resume').addEventListener('click', () => { if (paused) pauseToggle(); });
  $('step-btn').addEventListener('click', () => {
    if (!simulation || !paused || simulation.outcome) return;
    KEYS.clear(); touch.clear(); simulation.step(1 / 60, { assist: flightAssist });
    captureReport(true); updateReadout(); scene.update(0); settleOutcome();
  });
  for (const id of ['report-btn', 'last-report-btn', 'result-report']) $(id).addEventListener('click', openReport);
  $('report-revise').addEventListener('click', () => {
    $('report-dialog').dataset.resume = ''; $('report-dialog').close();
    if (mode === 'play') resetSimulation({ silent: true });
    reviewVisible = true; refreshReviewHighlights();
    toast('보고서의 관련 부품을 주황색으로 표시했습니다. 설계를 바꾸면 이전 위치 표시는 해제됩니다.');
  });
  $('export-report').addEventListener('click', () => downloadJSON(snapshotRunReport(currentReport()), `ironwood-test-${new Date().toISOString().slice(0, 10)}.json`));
  $('help-btn').addEventListener('click', () => openOverlay('help-dialog'));
  $('campaign-btn').addEventListener('click', openCampaign);
  $('recommended-design').addEventListener('click', applyRecommendedDesign);
  $('flight-assist').addEventListener('click', () => { flightAssist = !flightAssist; updateControlHints(); savePrefs(); toast(flightAssist ? '자세 보조 켜짐 · 힘과 토크로 기체의 흔들림을 줄입니다.' : '자세 보조 꺼짐 · 부품 배치와 조작으로 균형을 유지하세요.'); });
  $('touch-mode').addEventListener('click', () => {
    touchWeaponMode = !touchWeaponMode;
    for (const code of ['pitchUp', 'pitchDown', 'rollLeft', 'rollRight', 'turretLeft', 'turretRight', 'aimUp', 'aimDown', 'fire']) touch.delete(code);
    document.querySelectorAll('#flight-controls button,#touch-weapons button').forEach(b => b.classList.remove('pressed'));
    updateControlHints();
  });
  $('sandbox-btn').addEventListener('click', () => chooseMission('sandbox'));
  $('load-btn').addEventListener('click', openDesigns);
  $('save-btn').addEventListener('click', () => openDesigns({ saving: true }));
  $('save-new-slot').addEventListener('click', () => applyDesignStore(saveDesignSlot(designs, designData(), { name: $('design-name').value, now: new Date().toISOString() }), '새 이름의 설계를 저장했습니다.'));
  $('restore-btn').addEventListener('click', () => { try { loadDesign(storageGet(STORAGE.saved), '저장한 설계를 불러왔습니다.'); } catch (e) { toast(e.message, true); } });
  $('backup-btn').addEventListener('click', () => { try { loadDesign(storageGet(STORAGE.backup), '이전 작업을 복원했습니다.'); } catch (e) { toast(e.message, true); } });
  document.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => loadDesign({ format: 'ironwood-design', version: 1, parts: makePreset(b.dataset.preset), mission: b.dataset.mission || mission }, '새 설계를 작업대에 올렸습니다. 이전 작업은 설계 메뉴에서 복원할 수 있습니다.')));
  document.querySelectorAll('.modal-close').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
  document.querySelectorAll('dialog').forEach(d => d.addEventListener('click', e => { const r = d.getBoundingClientRect(); if (e.target === d && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) d.close(); }));
  for (const id of ['help-dialog', 'campaign-dialog', 'design-dialog', 'report-dialog']) $(id).addEventListener('close', () => { const dialog = $(id); if (dialog.dataset.resume === String(sessionSerial) && mode === 'play' && !simulation?.outcome && paused) pauseToggle(); dialog.dataset.resume = ''; });
  $('export-btn').addEventListener('click', () => { downloadJSON(designData(), `ironwood-design-${new Date().toISOString().slice(0, 10)}.json`); toast('설계 JSON 파일을 내보냈습니다.'); });
  $('import-btn').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', async e => { const file = e.target.files[0]; if (!file) return; try { if (file.size > 250000) throw new Error('250KB 이하의 설계 JSON을 선택해 주세요.'); loadDesign(JSON.parse(await file.text()), '가져온 설계를 작업대에 올렸습니다.'); } catch (e) { toast(e instanceof SyntaxError ? 'JSON 형식을 읽을 수 없습니다.' : e.message, true); } finally { $('import-file').value = ''; } });
  $('retry-btn').addEventListener('click', retryMission); $('quick-retry').addEventListener('click', retryMission);
  $('result-edit').addEventListener('click', () => resetSimulation());
  $('result-inspect').addEventListener('click', () => $('result-dialog').close());
  $('next-mission').addEventListener('click', () => { const next = nextCampaignMission(mission); if (next) chooseMission(next); else { resetSimulation({ silent: true }); openCampaign(); } });
  document.addEventListener('pointerdown', wakeAudio, { passive: true });
  document.querySelectorAll('[data-control]').forEach(b => {
    const release = () => { touch.delete(b.dataset.control); b.classList.remove('pressed'); };
    b.addEventListener('pointerdown', e => { e.preventDefault(); b.setPointerCapture(e.pointerId); touch.add(b.dataset.control); b.classList.add('pressed'); wakeAudio(); });
    b.addEventListener('pointerup', release); b.addEventListener('pointercancel', release); b.addEventListener('lostpointercapture', release);
  });
  const fireButton = $('touch-fire');
  fireButton.addEventListener('pointerdown', e => { e.preventDefault(); fireButton.setPointerCapture(e.pointerId); touch.add('fire'); fireButton.classList.add('pressed'); wakeAudio(); });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) fireButton.addEventListener(type, () => { touch.delete('fire'); fireButton.classList.remove('pressed'); });
  document.addEventListener('keydown', e => {
    if (document.querySelector('dialog[open]')) return;
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); if (!e.repeat) e.shiftKey ? redo() : undo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') { e.preventDefault(); $('save-btn').click(); return; }
    if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) { if (e.code === 'Escape' || (e.code === 'Space' && e.target.type === 'range')) e.target.blur(); else return; }
    if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Delete','Backspace'].includes(e.code)) e.preventDefault();
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    KEYS.add(e.code); wakeAudio();
    if (e.repeat) return;
    if (e.code === 'Space') { e.preventDefault(); startSimulation(); }
    if (e.code === 'KeyP' && mode === 'play') pauseToggle();
    if (mode !== 'build') return;
    if (e.code === 'KeyR') rotatePart();
    if (e.code === 'KeyV' || e.code === 'Escape') { setTool(null); selectPart(null); }
    if (e.code === 'KeyX') setTool(tool === 'erase' ? null : 'erase');
    if (e.code === 'KeyC') beginPlacement('copy');
    if (e.code === 'KeyG') beginPlacement('move');
    if (e.code === 'KeyM') toggleMirror();
    if (e.code === 'Delete' || e.code === 'Backspace') deletePart();
    const digit = e.key === '0' ? 10 : Number(e.key); if (digit >= 1 && digit <= partOrder.length) setTool(partOrder[digit - 1]);
  });
  document.addEventListener('keyup', e => KEYS.delete(e.code));
  window.addEventListener('blur', () => { KEYS.clear(); touch.clear(); });
  window.addEventListener('pagehide', flushDraft);
  document.addEventListener('visibilitychange', () => { KEYS.clear(); touch.clear(); if (document.hidden) flushDraft(); if (document.hidden && mode === 'play' && !paused) pauseToggle(); previousTime = performance.now(); });
  window.addEventListener('resize', () => scene.resize());
}

function frame(now) {
  const dt = Math.min((now - previousTime) / 1000, .05); previousTime = now;
  if (simulation && !paused) simulation.step(dt * (slow ? .5 : 1), getInput());
  captureReport(!!simulation?.outcome && !resultShown);
  settleOutcome();
  scene.update(dt);
  if (now - lastReadout > 110) { updateReadout(); lastReadout = now; }
  requestAnimationFrame(frame);
}

function init() {
  progress = normalizeProgress(storageGet(STORAGE.progress));
  designs = normalizeDesigns(storageGet(STORAGE.designs), { legacySaved: storageGet(STORAGE.saved) });
  storageSet(STORAGE.designs, designs);
  const prefs = storageGet(STORAGE.prefs); if (prefs?.soundOn === false) { soundOn = false; $('sound-btn').setAttribute('aria-pressed', 'false'); $('sound-btn').setAttribute('aria-label', '소리 켜기'); $('sound-btn').title = '소리 켜기'; }
  if (prefs?.quality === 'high' || prefs?.quality === 'low') quality = prefs.quality;
  if (prefs?.aimVisible === false) aimVisible = false;
  if (prefs?.flightAssist === false) flightAssist = false;
  try { const draft = storageGet(STORAGE.draft); if (draft) { const restored = normalizeImported(draft); parts = restored.parts; mission = restored.mission; } } catch { /* A malformed old draft must not prevent startup. */ }
  $('part-palette').innerHTML = partOrder.map((type, i) => `<button class="part-button" data-type="${type}" aria-pressed="false" title="${PARTS[type].description}"><span class="part-art">${partIcon(type)}</span><span class="part-info"><strong>${PARTS[type].name}</strong><small>${PARTS[type].short || PARTS[type].category}</small></span><kbd>${(i + 1) % 10}</kbd></button>`).join('');
  $('mission-select').innerHTML = MISSIONS.map((m, i) => `<option value="${m.id}">0${i + 1} — ${m.name}</option>`).join('');
  scene = new GameScene($('viewport'), { onCellClick: placePart, onSelect: (id, options = {}) => {
    if (mode === 'build' && tool === 'erase') return deletePart(id);
    const additive = mode === 'build' && (options.additive || multiSelect);
    if (additive && !id) return;
    selectPart(id, { additive });
  } });
  scene.setDesign(parts); scene.setMode('build'); scene.setTool(null); scene.setRotation(0);
  scene.setQuality(quality); scene.setAimVisible(aimVisible);
  $('quality-btn').textContent = quality === 'high' ? 'HD' : 'LOW'; $('quality-btn').setAttribute('aria-pressed', String(quality === 'low'));
  $('aim-btn').setAttribute('aria-pressed', String(aimVisible));
  document.querySelectorAll('.part-button').forEach(b => b.addEventListener('click', () => { setTool(tool === b.dataset.type ? null : b.dataset.type); }));
  bindEvents(); updateDesignStats(); updateMission(); document.body.dataset.mode = 'build';
  $('loading').classList.add('done'); setTimeout(() => $('loading').hidden = true, 600);
  requestAnimationFrame(frame);
  // Read-only, serializable diagnostics for bug reports and reproducible QA.
  window.ironwood = { getState: () => ({ version: '4.0', mode, paused, slow, mission, partCount: parts.length, parts: cloneParts(parts), valid: designAnalysis(), selected, selectedIds: [...selectedIds], tool, rotation, mirror: mirrorOn, placement: placement?.kind || null, flightAssist, controls: controlProfile(), progress: normalizeProgress(progress), designSlotCount: designs.slots.length, stressMode, report: snapshotRunReport(currentReport()), sim: simulation ? { elapsed: simulation.elapsed, speed: simulation.speed, shots: simulation.shots, broken: simulation.brokenCount, destroyed: simulation.destroyedCount, targets: simulation.targetCount, objective: simulation.objectiveProgress, telemetry: simulation.telemetry, won: simulation.won, failed: simulation.failed, outcome: simulation.outcome, ammo: simulation.ammoRemaining, coreHp: simulation.coreHp, integrity: simulation.integrity, core: { ...simulation.corePosition } } : null }) };
}

try { init(); } catch (error) {
  console.error('IRONWOOD startup failed:', error);
  $('loading').innerHTML = '<span class="loading-cube">◇</span><strong>3D 화면을 시작할 수 없습니다.</strong><span>WebGL을 지원하는 최신 브라우저에서 다시 열어 주세요.</span><button class="secondary-button" onclick="location.reload()">다시 시도</button>';
}
