import { TANKS, RULES, createBattle, stepBattle, getPlayer, aimStatus, issueOrder, setTargetLock, getLockedTarget, acquireTarget, issueFocusFire } from './engine.js';
import { MAPS, SURFACES, surfaceAt } from './maps.js';
import { OPERATIONS, sanitizeCareer, summarizeBattle, recordBattle, nextOperation } from './career.js';
import { BattleRenderer } from './renderer.js';
import { BattleAudio } from './audio.js';

const $ = (id) => document.getElementById(id);
const canvas = $('battlefield');
const renderer = new BattleRenderer(canvas, $('minimap'));
const audio = new BattleAudio();
const number = (value) => Math.round(Number(value) || 0).toLocaleString('ko-KR');
const clock = (value) => `${String(Math.floor(Math.max(0, value) / 60)).padStart(2, '0')}:${String(Math.floor(Math.max(0, value) % 60)).padStart(2, '0')}`;
const storage = {
  read(key, fallback) { try { const value = localStorage.getItem(`iron-front:${key}`); return value === null ? fallback : JSON.parse(value); } catch { return fallback; } },
  write(key, value) { try { localStorage.setItem(`iron-front:${key}`, JSON.stringify(value)); } catch { /* Storage is optional. */ } },
};
let selectedClass = storage.read('tank', 'medium');
if (!['scout', 'medium', 'heavy'].includes(selectedClass)) selectedClass = 'medium';
let selectedOperation = storage.read('operation', 'valley');
if (!['valley', 'depot', 'ridge'].includes(selectedOperation)) selectedOperation = 'valley';
const savedCareer = storage.read('career', null);
let career = sanitizeCareer(savedCareer ?? { battles: storage.read('battles', 0), bestDamage: storage.read('bestDamage', 0) });
if (savedCareer === null) storage.write('career', career);
let battleSummary = null;
let battleMode = 'standard';
let pauseReturnMode = 'battle';
let scoreboardReturnMode = 'battle';
let tacticalReturnMode = 'battle';
let tacticalCursor = null;
let tacticalTrigger = null;
let countdownRemaining = 0;
let zoomed = false;
let zoomScale = 1;
let actionSmoke = false;
let trainingTravel = 0;
let trainingPrevious = null;
let incomingUntil = 0;
let runtimeFailed = false;
let muted = storage.read('muted', false);
let mode = 'garage';
let state = null;
let lastFrame = performance.now();
let accumulated = 0;
let lastHud = 0;
let lastEventId = -1;
let lastHP = 0;
let didShowResult = false;
let helpReturnMode = 'garage';
let toastTimer;
let feedbackUntil = 0;
let flashUntil = 0;
let objectiveUntil = 0;
let tipUntil = 0;
let feed = [];
let actionRepair = false;
let selectedAmmo = 'AP';
let mouseFire = false;
let mousePointerId = null;
let firePointerId = null;
let pointerMoved = false;
let pointer = { x: window.innerWidth * .67, y: window.innerHeight * .5 };
let aimWorld = { x: 900, y: 800 };
let touchAimAngle = 0;
let touchAimUsed = false;
let fireTouch = false;
let currentTankName = '';
const keys = new Set();
const sticks = { move: { x: 0, y: 0, power: 0, active: false }, aim: { x: 0, y: 0, power: 0, active: false } };
const releaseInputs = [];
const touchMedia = window.matchMedia('(pointer: coarse)');
let isTouch = touchMedia.matches;
const classLabels = { scout: ['R-41', '고속 경전차', '◇'], medium: ['M-47', '다목적 중형전차', '◈'], heavy: ['H-90', '돌파 중전차', '◆'] };
const hud = Object.fromEntries(['timer','allied-count','enemy-count','allied-pips','enemy-pips','hp-label','hp-bar','speed-label','hud-name','hud-class','track-status','player-stats','reload-label','reload-seconds','reload-bar','reload-reticle','repair-label','repair-button','spotted-warning','capture-banner','capture-text','capture-progress','capture-percent','aim-label','reticle','spectator-panel','event-feed','combat-feedback','damage-flash'].map(id => [id,$(id)]));

function announce(text) {
  $('toast').textContent = text;
  $('toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 2500);
}

function resize() {
  renderer.resize(window.innerWidth, window.innerHeight, Math.min(window.devicePixelRatio || 1, 2));
  pointer.x = Math.max(0, Math.min(window.innerWidth, pointer.x));
  pointer.y = Math.max(0, Math.min(window.innerHeight, pointer.y));
  if (mode === 'tactical') renderTacticalView();
}
window.addEventListener('resize', resize);
resize();

function updateSoundButtons() {
  audio.setMuted(muted);
  document.querySelectorAll('.sound-button').forEach(button => {
    button.classList.toggle('is-muted', muted);
    button.setAttribute('aria-label', muted ? '소리 켜기' : '소리 끄기');
    button.setAttribute('aria-pressed', String(!muted));
    button.title = muted ? '소리 켜기 (M)' : '소리 끄기 (M)';
  });
}
function toggleSound() {
  audio.unlock();
  muted = !muted;
  storage.write('muted', muted);
  updateSoundButtons();
  announce(muted ? '소리를 껐습니다' : '소리를 켰습니다');
}
document.querySelectorAll('.sound-button').forEach(button => button.addEventListener('click', toggleSound));
updateSoundButtons();

function chooseTank(type, audible = true) {
  selectedClass = type;
  storage.write('tank', type);
  document.querySelectorAll('[data-tank]').forEach(button => {
    const selected = button.dataset.tank === type;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  $('scene-tank-name').textContent = classLabels[type][0];
  $('scene-tank-type').textContent = classLabels[type][1];
  $('spec-hp').textContent = number(TANKS[type].hp);
  $('spec-speed').textContent = `${Math.round(TANKS[type].speed * .36)} km/h`;
  $('spec-penetration').textContent = `${TANKS[type].penetration} mm`;
  $('spec-armor').textContent = `${TANKS[type].armor.front} mm`;
  if (audible) { audio.unlock(); audio.play('select'); }
}
document.querySelectorAll('[data-tank]').forEach(button => button.addEventListener('click', () => chooseTank(button.dataset.tank)));
chooseTank(selectedClass, false);
const savedDifficulty = storage.read('difficulty', 'normal');
$('difficulty').value = ['easy','normal','hard'].includes(savedDifficulty) ? savedDifficulty : 'normal';
$('difficulty').addEventListener('change', () => storage.write('difficulty', $('difficulty').value));

function resetControls() {
  keys.clear(); mouseFire = false; fireTouch = false; actionRepair = false; actionSmoke = false;
  releaseInputs.forEach(release => release());
  for (const [key, stick] of Object.entries(sticks)) {
    stick.x = 0; stick.y = 0; stick.power = 0; stick.active = false;
    $(`${key}-stick`).querySelector('.stick-knob').style.transform = '';
  }
}
function hideModals() {
  $('modal-backdrop').hidden = true;
  document.querySelectorAll('.modal').forEach(element => element.hidden = true);
  $('garage').inert = false; $('battle-ui').inert = false; $('menu-header').inert = false;
}
function focusableControls(modal) {
  return [...modal.querySelectorAll('button:not([disabled]),a[href],select:not([disabled]),[tabindex="0"]')].filter(control => !control.hidden && control.getClientRects().length > 0);
}
function openModal(id) {
  hideModals();
  $('modal-backdrop').hidden = false;
  $(id).hidden = false;
  $('garage').inert = true; $('battle-ui').inert = true; $('menu-header').inert = true;
  resetControls();
  requestAnimationFrame(() => focusableControls($(id))[0]?.focus({ preventScroll: true }));
}
function startBattle(settings = {}) {
  audio.unlock();
  battleMode = settings.mode === 'training' ? 'training' : 'standard';
  if (settings.mapId && ['valley','depot','ridge'].includes(settings.mapId)) selectOperation(settings.mapId, false);
  state = createBattle({ tankClass: selectedClass, difficulty: $('difficulty').value, mapId: selectedOperation, mode: battleMode, seed: (Date.now() ^ Math.floor(Math.random() * 1e7)) >>> 0 });
  state.battleId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  state.paused = true;
  countdownRemaining = battleMode === 'training' ? 1.5 : 3;
  battleSummary = null;
  runtimeFailed = false;
  trainingTravel = 0;
  applyZoom(false);
  selectedAmmo = 'AP';
  const player = getPlayer(state);
  trainingPrevious = { x: player.x, y: player.y };
  lastHP = player.hp;
  currentTankName = TANKS[selectedClass].name;
  lastEventId = -1;
  didShowResult = false;
  feed = [];
  feedbackUntil = 0; flashUntil = 0; incomingUntil = 0;
  hud['combat-feedback'].replaceChildren();
  hud['combat-feedback'].classList.remove('active');
  hud['damage-flash'].classList.remove('active');
  $('incoming-hit').classList.remove('active');
  accumulated = 0;
  lastHud = 0;
  touchAimAngle = 0;
  touchAimUsed = false;
  pointerMoved = false;
  pointer = { x: window.innerWidth * .67, y: window.innerHeight * .5 };
  aimWorld = { x: player.x + 500, y: player.y };
  mode = 'countdown';
  hideModals();
  resetControls();
  $('garage').hidden = true;
  $('menu-header').hidden = true;
  $('battle-ui').hidden = false;
  $('app').classList.add('in-battle');
  hud['spectator-panel'].hidden = true;
  hud['spectator-panel'].classList.remove('observing');
  hud['spectator-panel'].querySelector('p').textContent = '아군이 전투를 이어갑니다.';
  hud['event-feed'].replaceChildren();
  $('battle-tip').hidden = battleMode === 'training';
  $('battle-tip').querySelector('p').textContent = state.map.tacticalTip || MAPS[selectedOperation]?.tacticalTip || '엄폐물을 이용하고 적의 측면을 노리세요.';
  $('training-panel').hidden = battleMode !== 'training';
  $('order-controls').hidden = battleMode === 'training';
  $('battle-map-name').textContent = state.map.name;
  $('objective-text').textContent = battleMode === 'training' ? '이동과 조준을 익히고 표적 3대를 격파하세요' : '적 전차를 모두 격파하거나 적 기지를 점령하세요';
  $('countdown-mission').textContent = state.map.name;
  $('deployment-countdown').hidden = false;
  $('countdown-number').textContent = Math.ceil(countdownRemaining);
  tipUntil = 13;
  objectiveUntil = 12;
  $('objective').hidden = false;
  $('capture-banner').hidden = true;
  selectAmmo('AP', false);
  renderer.render(state, { aim: aimWorld, time: 0, zoom: 1 });
  updateHUD();
  audio.play('select');
}
function returnGarage() {
  mode = 'garage';
  if (state) state.paused = true;
  audio.update({ phase: 'garage' });
  resetControls();
  hideModals();
  $('garage').hidden = false;
  $('menu-header').hidden = false;
  $('battle-ui').hidden = true;
  $('app').classList.remove('in-battle');
  $('deployment-countdown').hidden = true;
  applyZoom(false);
  updateGarageRecord();
  $('start-button').focus({ preventScroll: true });
}
function pauseBattle() {
  if (!['battle','countdown'].includes(mode) || !state || state.phase !== 'playing') return;
  pauseReturnMode = mode;
  mode = 'paused'; state.paused = true;
  audio.update(state);
  openModal('pause-modal');
}
function resumeBattle() {
  if (!state || state.phase !== 'playing') return;
  audio.unlock(); mode = countdownRemaining > 0 ? 'countdown' : 'battle'; state.paused = mode !== 'battle';
  accumulated = 0;
  hideModals();
  resetControls();
}
function showHelp() {
  if (mode === 'help') return;
  helpReturnMode = mode;
  if (state) state.paused = true;
  audio.update(state || {phase:'garage'});
  mode = 'help';
  openModal('help-modal');
}
function closeHelp() {
  if (helpReturnMode === 'battle' || helpReturnMode === 'countdown') { resumeBattle(); return; }
  mode = helpReturnMode;
  if (mode === 'paused') openModal('pause-modal');
  else if (mode === 'result') openModal('result-modal');
  else if (mode === 'scoreboard') openModal('scoreboard-modal');
  else if (mode === 'career') openModal('career-modal');
  else if (mode === 'tactical') { openModal('tactical-modal'); renderTacticalView(); requestAnimationFrame(() => $('tactical-map').focus({ preventScroll: true })); }
  else hideModals();
}
function showResult() {
  if (didShowResult) return;
  didShowResult = true; mode = 'result'; state.paused = true;
  $('deployment-countdown').hidden = true;
  const recorded = recordBattle(career, state);
  career = recorded.career;
  battleSummary = recorded.summary;
  if (recorded.recorded) storage.write('career', career);
  const stats = state.statistics;
  const victory = state.winner === 0;
  const draw = state.winner === null;
  $('result-title').textContent = battleMode === 'training' ? (victory ? '훈련 완료' : '훈련 종료') : draw ? '무승부' : victory ? '승리' : '패배';
  $('result-eyebrow').textContent = draw ? 'OPERATION ENDED' : victory ? 'MISSION ACCOMPLISHED' : 'MISSION FAILED';
  $('result-modal').classList.toggle('defeat', !victory && !draw);
  $('result-reason').textContent = state.resultReason || (victory ? '전선을 확보했습니다.' : '다음 작전을 준비하세요.');
  $('result-damage').textContent = number(stats.damage);
  $('result-kills').textContent = number(stats.kills);
  $('result-accuracy').textContent = `${stats.shots ? Math.min(100,Math.round(stats.hits / stats.shots * 100)) : 0}%`;
  $('result-survivors').textContent = `${state.tanks.filter(t => t.team === 0 && t.alive).length} / ${state.tanks.filter(t => t.team === 0).length}`;
  $('result-duration').textContent = clock(state.elapsed);
  $('result-best').textContent = number(career.bestDamage);
  $('result-assisted').textContent = number(battleSummary.assisted);
  $('result-blocked').textContent = number(battleSummary.blocked);
  $('result-score').textContent = number(battleSummary.score);
  $('result-medal').textContent = battleSummary.medal.label;
  $('result-medal').className = `result-medal ${battleSummary.medal.tier}`;
  renderObjectives($('result-objectives'), battleSummary.objectives);
  $('next-operation-button').hidden = !victory || battleMode === 'training' || !nextOperation(state.mapId);
  $('play-again').replaceChildren(document.createTextNode(battleMode === 'training' ? '사격장 다시 시작' : '같은 전장 재도전'), Object.assign(document.createElement('span'), { textContent: '↗' }));
  $('result-garage').textContent = battleMode === 'training' && victory ? '차고로 돌아가 작전 출격' : '차고로 돌아가기';
  audio.play(victory ? 'victory' : 'defeat');
  audio.update(state);
  openModal('result-modal');
}
function selectAmmo(ammo, audible = true) {
  if (!['AP', 'HE'].includes(ammo) || state && !getPlayer(state)?.alive) return;
  const changed = ammo !== selectedAmmo;
  selectedAmmo = ammo;
  for (const type of ['AP', 'HE']) {
    const element = $(`ammo-${type.toLowerCase()}`);
    element.classList.toggle('selected', type === ammo);
    element.setAttribute('aria-pressed', String(type === ammo));
  }
  if (audible && changed) { audio.play('select'); if (mode === 'battle') announce(`${ammo} 장전 시작`); }
}
function requestRepair() {
  if (mode !== 'battle') return;
  const player = getPlayer(state);
  if (player.repairCooldown > 0) { announce(`수리 도구 준비 중 · ${Math.ceil(player.repairCooldown)}초`); return; }
  if (!player.alive) return;
  if (player.trackDisabled <= 0 && !(player.modules?.engine > 0) && !(player.modules?.ammoRack > 0)) { announce('수리가 필요한 부품이 없습니다'); return; }
  actionRepair = true;
}
function spectateNext() {
  const alive = state?.tanks.filter(t => t.team === 0 && t.alive) || [];
  if (!alive.length) return;
  const index = alive.findIndex(t => t.id === state.spectateId);
  state.spectateId = alive[(index + 1) % alive.length].id;
  hud['spectator-panel'].classList.add('observing');
  announce(`${alive[(index + 1) % alive.length].name} 관전`);
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function selectOperation(id, audible = true) {
  if (!['valley','depot','ridge'].includes(id)) return;
  selectedOperation = id;
  storage.write('operation', id);
  updateGarageRecord();
  if (audible) audio.play('select');
}
function updateGarageRecord() {
  $('operation-select').value = selectedOperation;
  const operation = OPERATIONS.find(item => item.id === selectedOperation);
  const progress = career.operations[selectedOperation];
  $('garage-operation-code').textContent = `OPERATION / ${String(OPERATIONS.findIndex(item=>item.id===selectedOperation)+1).padStart(2,'0')}`;
  $('mission-brief').replaceChildren(document.createTextNode(operation.brief), element('small', '', `보조 목표 · ${operation.goalText}`));
  $('operation-badge').textContent = progress.wins ? `${progress.wins} WIN` : progress.played ? 'RETRY' : 'NEW OPS';
  $('operation-badge').classList.toggle('completed', progress.wins > 0);
  $('scene-map-label').textContent = MAPS[selectedOperation]?.subtitle || selectedOperation.toUpperCase();
  for (const option of $('operation-select').options) {
    const op = OPERATIONS.find(item => item.id === option.value);
    option.textContent = `${String(OPERATIONS.indexOf(op)+1).padStart(2,'0')} · ${op.title}${career.operations[op.id].wins ? ' ✓' : ''}`;
  }
}
function applyZoom(enabled) {
  zoomed = enabled;
  if (!enabled) zoomScale = 1;
  $('scope-button').setAttribute('aria-pressed', String(enabled));
  $('scope-button').classList.toggle('active', enabled);
  $('scope-button').querySelector('b').textContent = enabled ? '1.55×' : '1×';
  $('scope-vignette').hidden = !enabled;
}
function toggleZoom() {
  if (!['battle','countdown'].includes(mode) || !getPlayer(state)?.alive) return;
  applyZoom(!zoomed); audio.play('select');
}
function requestSmoke() {
  if (mode !== 'battle') return;
  const player = getPlayer(state);
  if (!player.alive) return;
  if (player.smokeCharges <= 0) { announce('연막을 모두 사용했습니다'); return; }
  if (player.smokeCooldown > 0) { announce(`연막 준비 중 · ${Math.ceil(player.smokeCooldown)}초`); return; }
  actionSmoke = true;
}
function giveOrder(type) {
  if (mode !== 'battle') return;
  if (issueOrder(state, type)) {
    const labels = { attack: '분대 · 적 기지로 진격', defend: '분대 · 아군 기지 방어', follow: '분대 · 내 위치 지원' };
    announce(labels[type]); audio.play('order');
  }
}

function targetingPoint() {
  const player = getPlayer(state);
  const locked = getLockedTarget(state);
  if (locked) return { x: locked.x, y: locked.y };
  if (player && (touchAimUsed || isTouch && !pointerMoved)) {
    const bearing = Math.atan2(aimWorld.y - player.y, aimWorld.x - player.x);
    return { x: player.x + Math.cos(bearing) * RULES.maxRange, y: player.y + Math.sin(bearing) * RULES.maxRange };
  }
  return aimWorld;
}
function selectedTarget() {
  if (!state) return null;
  const point = targetingPoint();
  return getLockedTarget(state) || aimStatus(state, point.x, point.y).target || acquireTarget(state, aimWorld.x, aimWorld.y);
}
function toggleTargetLock() {
  if (mode !== 'battle' || !getPlayer(state)?.alive) return;
  if (state.lockTargetId) {
    setTargetLock(state, null); audio.play('select'); announce('목표 고정 해제 · 자유 조준');
    return;
  }
  const target = selectedTarget();
  if (!target || !setTargetLock(state, target.id)) { announce('조준 방향에 고정할 수 있는 적이 없습니다'); return; }
  aimWorld = { x: target.x, y: target.y };
  audio.play('select'); announce(`${target.name} 고정 · 발사를 누르면 정렬 후 사격`);
}
function giveFocus(target = selectedTarget()) {
  if (mode !== 'battle' || !target) { if (mode === 'battle') announce('발견한 적을 조준한 뒤 집중사격을 지시하세요'); return false; }
  if (!issueFocusFire(state, target.id)) return false;
  announce(`분대 · ${target.name}에 15초간 집중사격`); audio.play('order');
  return true;
}
function canCommandFromMap() {
  return state?.phase === 'playing' && getPlayer(state)?.alive && battleMode !== 'training' && countdownRemaining === 0;
}
function renderTacticalView() {
  if (!state || $('tactical-modal').hidden) return;
  renderer.renderTacticalMap(state, $('tactical-map'), { cursor: tacticalCursor });
  $('tactical-coordinate').textContent = tacticalCursor ? `지점 ${Math.round(tacticalCursor.x / 10)}, ${Math.round(tacticalCursor.y / 10)}m · 방향키 이동 / Enter 선택` : '방향키 · Enter로도 명령할 수 있습니다.';
}
function showTacticalMap() {
  if (!state || !['battle','countdown','paused'].includes(mode)) return;
  tacticalReturnMode = mode;
  tacticalTrigger = document.activeElement;
  const player = getPlayer(state);
  tacticalCursor = state.order?.type === 'move' && state.order.until > state.elapsed ? { x: state.order.x, y: state.order.y } : { x: player.x, y: player.y };
  mode = 'tactical'; state.paused = true; audio.update(state);
  $('tactical-note').textContent = canCommandFromMap() ? '빈 지점을 누르면 분대 이동, 발견한 적을 누르면 집중사격합니다. 선택하면 전투를 계속합니다.' : battleMode === 'training' ? '훈련장 지형과 표적을 확인하세요. 분대 명령은 일반 작전에서 사용할 수 있습니다.' : !player.alive ? '아군 위치와 마지막으로 관측한 적을 확인할 수 있습니다. 격파된 상태에서는 명령할 수 없습니다.' : '출격 대기 중입니다. 전투가 시작되면 이동·집중사격 명령을 내릴 수 있습니다.';
  openModal('tactical-modal');
  renderTacticalView();
  requestAnimationFrame(() => { if (mode === 'tactical') { renderTacticalView(); $('tactical-map').focus({ preventScroll: true }); } });
}
function closeTacticalMap() {
  if (mode !== 'tactical') return;
  if (tacticalReturnMode === 'paused') { mode = 'paused'; openModal('pause-modal'); }
  else {
    resumeBattle();
    const trigger = tacticalTrigger?.getClientRects().length ? tacticalTrigger : $('map-button');
    trigger.focus({ preventScroll: true });
  }
}
function commitTacticalPoint(point) {
  if (mode !== 'tactical' || !point) return;
  tacticalCursor = point;
  if (!canCommandFromMap()) { renderTacticalView(); return; }
  const mapCanvas = $('tactical-map');
  const fittedWidth = Math.min(mapCanvas.clientWidth - 24, (mapCanvas.clientHeight - 24) * state.map.width / state.map.height);
  const pickRadius = Math.max(48, state.map.width / Math.max(1, fittedWidth) * 18);
  const target = state.tanks.filter(tank => tank.alive && tank.team !== 0 && tank.visibleToPlayer && Math.hypot(tank.x - point.x, tank.y - point.y) <= pickRadius)
    .sort((a,b) => Math.hypot(a.x - point.x, a.y - point.y) - Math.hypot(b.x - point.x, b.y - point.y))[0];
  resumeBattle();
  if (target) giveFocus(target);
  else if (issueOrder(state, 'move', point)) { announce(`분대 이동 · ${Math.round(state.order.x / 10)}, ${Math.round(state.order.y / 10)}m`); audio.play('order'); }
  else { announce('이동할 수 있는 가까운 지점을 찾지 못했습니다. 다른 지점을 선택하세요.'); showTacticalMap(); }
}
function renderObjectives(container, objectives) {
  container.replaceChildren(...objectives.map(objective => {
    const row = element('div', `objective-result${objective.complete ? ' complete' : ''}`);
    const copy = element('div', 'objective-result-copy');
    copy.append(element('strong', '', objective.label), element('small', '', objective.display || `${objective.value} / ${objective.target}`));
    const track = element('div', 'objective-result-track');
    const fill = element('i'); fill.style.width = `${Math.max(0,Math.min(1,objective.progress || 0))*100}%`; track.append(fill);
    copy.append(track); row.append(element('span', 'objective-check', objective.complete ? '✓' : '○'), copy);
    return row;
  }));
}
function showScoreboard() {
  if (!state || !['battle','countdown','paused','result'].includes(mode)) return;
  scoreboardReturnMode = mode;
  state.paused = true; mode = 'scoreboard'; audio.update(state);
  const ended = state.phase === 'ended';
  $('scoreboard-title').textContent = ended ? '분대 전적' : '전투 현황';
  $('scoreboard-note').textContent = ended ? `${state.map.name} · ${state.resultReason}` : '전투 일시 정지 · 미발견 적의 내구도는 표시하지 않습니다.';
  const fragments = [];
  for (const team of [0,1]) {
    const heading = element('h3', team === 0 ? 'allied-title' : 'enemy-title', team === 0 ? '아군 분대' : '적군 분대');
    const wrapper = element('div', 'score-table-wrap'); const table = element('table', 'score-table');
    const head = element('thead'); const headRow = element('tr');
    for (const title of ['전차','격파','피해','지원','방어','내구도']) headRow.append(element('th','',title));
    head.append(headRow); table.append(head);
    const body = element('tbody');
    const tanks = state.tanks.filter(tank => tank.team === team).sort((a,b)=>(b.stats?.damage||0)-(a.stats?.damage||0));
    for (const tank of tanks) {
      const row = element('tr', `${tank.isPlayer ? 'own-row ' : ''}${!tank.alive ? 'destroyed-row' : ''}`);
      const name = element('td'); name.append(element('strong','',tank.isPlayer?'당신':tank.name),element('small','',TANKS[tank.type]?.name||tank.type));
      row.append(name);
      for (const key of ['kills','damage','assisted','blocked']) row.append(element('td','',number(tank.stats?.[key]||0)));
      row.append(element('td','',!tank.alive ? '격파' : team === 0 || ended || tank.visibleToPlayer ? `${number(tank.hp)}` : '미확인'));
      body.append(row);
    }
    table.append(body); wrapper.append(table); fragments.push(heading,wrapper);
  }
  if (battleMode !== 'training') { const goals=element('div','scoreboard-goals'); renderObjectives(goals,summarizeBattle(state).objectives); fragments.push(goals); }
  $('scoreboard-content').replaceChildren(...fragments);
  openModal('scoreboard-modal');
}
function closeScoreboard() {
  if (scoreboardReturnMode === 'result') { mode='result'; openModal('result-modal'); }
  else if (scoreboardReturnMode === 'paused') { mode='paused'; openModal('pause-modal'); }
  else resumeBattle();
}
function showCareer() {
  if (mode !== 'garage') return;
  mode = 'career';
  const knownBattles = Object.values(career.operations).reduce((sum, operation) => sum + operation.played, 0);
  const knownWins = Object.values(career.operations).reduce((sum, operation) => sum + operation.wins, 0);
  const rate = knownBattles ? `${Math.round(knownWins / knownBattles * 100)}%` : '—';
  $('career-note').textContent = `기록은 현재 브라우저에 저장됩니다. 훈련장과 중도 종료한 전투는 제외됩니다.${career.battles > knownBattles ? ` 이전 버전의 승패 미확인 ${career.battles - knownBattles}전은 총 전투 수에만 포함하며, 승률은 승패가 확인된 ${knownBattles}전으로 계산합니다.` : ''}`;
  $('career-totals').replaceChildren(...[['전투',career.battles],['승률',rate],['최고 피해',number(career.bestDamage)],['총 격파',career.totalKills]].map(([label,value]) => {
    const item=element('div'); item.append(element('strong','',value),element('small','',label));return item;
  }));
  const medalNames={none:'미획득',bronze:'동장',silver:'은장',gold:'금장'};
  $('career-operations').replaceChildren(...OPERATIONS.map((operation,index)=>{
    const progress=career.operations[operation.id]; const button=element('button',`career-operation ${progress.bestMedal}`);
    const copy=element('div');copy.append(element('strong','',`${String(index+1).padStart(2,'0')} / ${operation.title}`),element('small','',`${progress.played}전 · ${progress.wins}승 · 최고 ${number(progress.bestScore)}점`));
    button.append(copy,element('span','',medalNames[progress.bestMedal]));
    button.addEventListener('click',()=>{selectOperation(operation.id);closeCareer();});return button;
  }));
  const resultNames={victory:'승리',defeat:'패배',draw:'무승부'};
  $('career-history').replaceChildren(...(career.history.length ? career.history.map(entry=>{
    const row=element('div',`history-row ${entry.result}`);
    row.append(element('b','',resultNames[entry.result]),element('span','',MAPS[entry.mapId]?.name||entry.mapId),element('small','',`${number(entry.damage)} 피해 · ${entry.kills} 격파`),element('strong','',`${number(entry.score)}점`));return row;
  }) : [element('p','empty-record','첫 작전을 완료하면 이곳에 전투 기록이 남습니다.')]));
  openModal('career-modal');
}
function closeCareer() { mode='garage'; hideModals(); updateGarageRecord(); $('career-button').focus({preventScroll:true}); }

$('operation-select').addEventListener('change',()=>selectOperation($('operation-select').value));
$('training-button').addEventListener('click',()=>startBattle({mode:'training'}));
$('start-button').addEventListener('click',()=>startBattle({mode:'standard'}));
['restart-button','play-again','retry-button'].forEach(id => $(id).addEventListener('click',()=>startBattle({mode:battleMode})));
$('next-operation-button').addEventListener('click',()=>{const next=nextOperation(state.mapId);if(next)startBattle({mode:'standard',mapId:next});});
$('career-button').addEventListener('click',showCareer);
$('career-close').addEventListener('click',closeCareer);
['scoreboard-button','result-scoreboard'].forEach(id=>$(id).addEventListener('click',showScoreboard));
['scoreboard-close','scoreboard-return'].forEach(id=>$(id).addEventListener('click',closeScoreboard));
$('scope-button').addEventListener('click',toggleZoom);
$('smoke-button').addEventListener('click',requestSmoke);
$('lock-button').addEventListener('click',toggleTargetLock);
$('focus-button').addEventListener('click',()=>giveFocus());
$('map-button').addEventListener('click',showTacticalMap);
$('minimap').addEventListener('click',showTacticalMap);
$('minimap').addEventListener('keydown',event=>{ if (['Enter','Space'].includes(event.code)) { event.preventDefault(); event.stopPropagation(); showTacticalMap(); } });
['tactical-close','tactical-return'].forEach(id=>$(id).addEventListener('click',closeTacticalMap));
$('tactical-map').addEventListener('click',event=>{
  const rect = $('tactical-map').getBoundingClientRect();
  commitTacticalPoint(renderer.tacticalMapToWorld($('tactical-map'), event.clientX - rect.left, event.clientY - rect.top));
});
document.querySelectorAll('[data-order]').forEach(button=>button.addEventListener('click',()=>giveOrder(button.dataset.order)));
updateGarageRecord();
['garage-button','result-garage'].forEach(id => $(id).addEventListener('click', returnGarage));
$('pause-button').addEventListener('click', pauseBattle);
$('resume-button').addEventListener('click', resumeBattle);
document.querySelectorAll('.help-button').forEach(button => button.addEventListener('click', showHelp));
$('about-button').addEventListener('click', showHelp);
$('help-close').addEventListener('click', closeHelp);
$('ammo-ap').addEventListener('click', () => selectAmmo('AP'));
$('ammo-he').addEventListener('click', () => selectAmmo('HE'));
$('repair-button').addEventListener('click', requestRepair);
$('next-ally').addEventListener('click', spectateNext);
$('tip-close').addEventListener('click', () => { $('battle-tip').hidden = true; tipUntil = 0; });

const continuousKeys = new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space']);
const gameKeys = [...continuousKeys,'Digit1','Digit2','KeyE','KeyQ','KeyZ','KeyX','KeyC','KeyR','KeyF','KeyT','ShiftLeft','ShiftRight','Escape','KeyP','KeyM','KeyH'];
window.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLSelectElement) return;
  if (gameKeys.includes(event.code) && ['battle','countdown'].includes(mode)) event.preventDefault();
  if (event.code === 'Tab' && ['battle','countdown'].includes(mode)) { event.preventDefault(); showScoreboard(); return; }
  if (event.code === 'Tab' && ['paused','help','result','scoreboard','career','tactical'].includes(mode)) {
    const activeModal = document.querySelector('.modal:not([hidden])');
    const buttons = activeModal ? focusableControls(activeModal) : [];
    const first = buttons[0], last = buttons.at(-1);
    if (first && event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (first && !event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  if (mode === 'tactical' && ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code)) {
    event.preventDefault();
    $('tactical-map').focus({ preventScroll: true });
    const distance = event.shiftKey ? 160 : 80;
    tacticalCursor.x = Math.max(0, Math.min(state.map.width, tacticalCursor.x + (event.code === 'ArrowRight' ? distance : event.code === 'ArrowLeft' ? -distance : 0)));
    tacticalCursor.y = Math.max(0, Math.min(state.map.height, tacticalCursor.y + (event.code === 'ArrowDown' ? distance : event.code === 'ArrowUp' ? -distance : 0)));
    renderTacticalView(); return;
  }
  if (mode === 'tactical' && event.code === 'Enter' && document.activeElement === $('tactical-map')) { event.preventDefault(); if (!event.repeat) commitTacticalPoint(tacticalCursor); return; }
  if (['battle','countdown'].includes(mode) && continuousKeys.has(event.code)) keys.add(event.code);
  if (event.repeat) return;
  if (event.code === 'KeyM') { toggleSound(); return; }
  if (event.code === 'KeyH') { if (mode === 'help') closeHelp(); else showHelp(); return; }
  if (event.code === 'Escape' || event.code === 'KeyP') {
    if (mode === 'battle' || mode === 'countdown') pauseBattle();
    else if (mode === 'paused') resumeBattle();
    else if (mode === 'help') closeHelp();
    else if (mode === 'scoreboard') closeScoreboard();
    else if (mode === 'career') closeCareer();
    else if (mode === 'tactical') closeTacticalMap();
    return;
  }
  if (event.code === 'KeyT') { event.preventDefault(); if (mode === 'tactical') closeTacticalMap(); else showTacticalMap(); return; }
  if (mode !== 'battle') return;
  if (event.code === 'Digit1') selectAmmo('AP');
  if (event.code === 'Digit2') selectAmmo('HE');
  if (event.code === 'KeyE') requestRepair();
  if (event.code === 'KeyQ') requestSmoke();
  if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') toggleZoom();
  if (event.code === 'KeyZ') giveOrder('attack');
  if (event.code === 'KeyX') giveOrder('defend');
  if (event.code === 'KeyC') giveOrder('follow');
  if (event.code === 'KeyR') toggleTargetLock();
  if (event.code === 'KeyF') giveFocus();
});
window.addEventListener('keyup', event => keys.delete(event.code));
window.addEventListener('blur', () => { resetControls(); pauseBattle(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { resetControls(); pauseBattle(); } });

canvas.addEventListener('pointermove', (event) => {
  if (!['battle','countdown'].includes(mode) || mousePointerId !== null && event.pointerId !== mousePointerId) return;
  const rect = canvas.getBoundingClientRect();
  pointer.x = event.clientX - rect.left; pointer.y = event.clientY - rect.top;
  pointerMoved = true;
  if (event.pointerType !== 'touch') touchAimUsed = false;
});
canvas.addEventListener('pointerdown', (event) => {
  if (['battle','countdown'].includes(mode) && event.button === 2) { event.preventDefault(); toggleZoom(); return; }
  if (!['battle','countdown'].includes(mode) || event.button !== 0 || mousePointerId !== null || !getPlayer(state)?.alive) return;
  audio.unlock();
  const rect = canvas.getBoundingClientRect();
  pointer.x = event.clientX - rect.left; pointer.y = event.clientY - rect.top;
  pointerMoved = true; touchAimUsed = false; mouseFire = true; mousePointerId = event.pointerId;
  canvas.setPointerCapture(event.pointerId);
  event.preventDefault();
});
canvas.addEventListener('contextmenu', event => event.preventDefault());
function releaseCanvasPointer(event) {
  if (event && event.pointerId !== mousePointerId) return;
  const owner = mousePointerId;
  mousePointerId = null; mouseFire = false;
  if (owner !== null && canvas.hasPointerCapture(owner)) canvas.releasePointerCapture(owner);
}
window.addEventListener('pointerup', releaseCanvasPointer);
canvas.addEventListener('pointercancel', releaseCanvasPointer);
canvas.addEventListener('lostpointercapture', releaseCanvasPointer);
releaseInputs.push(() => releaseCanvasPointer());

function bindStick(id, key) {
  const element = $(id), stick = sticks[key], knob = element.querySelector('.stick-knob');
  let activePointer = null;
  releaseInputs.push(() => {
    if (activePointer !== null && element.hasPointerCapture(activePointer)) element.releasePointerCapture(activePointer);
    activePointer = null;
  });
  function move(event) {
    if (activePointer !== event.pointerId) return;
    const rect = element.getBoundingClientRect();
    const radius = rect.width * .36;
    let dx = event.clientX - rect.left - rect.width / 2;
    let dy = event.clientY - rect.top - rect.height / 2;
    const length = Math.hypot(dx, dy);
    if (length > radius) { dx *= radius / length; dy *= radius / length; }
    stick.x = dx / radius; stick.y = dy / radius; stick.power = Math.min(1, length / radius);
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    if (key === 'aim' && stick.power > .13) {
      touchAimAngle = Math.atan2(stick.y, stick.x); touchAimUsed = true;
      if (state?.lockTargetId) setTargetLock(state, null);
    }
    event.preventDefault();
  }
  element.addEventListener('pointerdown', (event) => {
    if (!['battle','countdown'].includes(mode) || activePointer !== null || !getPlayer(state)?.alive) return;
    activePointer = event.pointerId; stick.active = true; isTouch = true;
    element.setPointerCapture(event.pointerId); audio.unlock(); move(event);
  });
  element.addEventListener('pointermove', move);
  const end = (event) => { if (event.pointerId !== activePointer) return; activePointer = null; stick.active = false; stick.power = 0; stick.x = 0; stick.y = 0; knob.style.transform = ''; };
  element.addEventListener('pointerup', end);
  element.addEventListener('pointercancel', end);
  element.addEventListener('lostpointercapture', end);
}
bindStick('move-stick', 'move');
bindStick('aim-stick', 'aim');
$('touch-fire').addEventListener('pointerdown', (event) => {
  if (!['battle','countdown'].includes(mode) || firePointerId !== null || !getPlayer(state)?.alive) return;
  audio.unlock(); fireTouch = true; firePointerId = event.pointerId;
  $('touch-fire').setPointerCapture(event.pointerId); event.preventDefault();
});
function releaseFirePointer(event) {
  if (event && event.pointerId !== firePointerId) return;
  const owner = firePointerId;
  firePointerId = null; fireTouch = false;
  if (owner !== null && $('touch-fire').hasPointerCapture(owner)) $('touch-fire').releasePointerCapture(owner);
}
['pointerup','pointercancel','lostpointercapture'].forEach(type => $('touch-fire').addEventListener(type, releaseFirePointer));
releaseInputs.push(() => releaseFirePointer());

function readInput() {
  const player = getPlayer(state);
  if (touchAimUsed) {
    const reach = Math.max(150, Math.min(window.innerWidth, window.innerHeight) * .34 / renderer.camera.scale);
    aimWorld = { x: player.x + Math.cos(touchAimAngle) * reach, y: player.y + Math.sin(touchAimAngle) * reach };
  }
  else if (pointerMoved) aimWorld = renderer.screenToWorld(pointer.x, pointer.y);
  else aimWorld = { x: player.x + (isTouch ? Math.max(150, Math.min(window.innerWidth, window.innerHeight) * .34 / renderer.camera.scale) : 500), y: player.y };
  const locked = getLockedTarget(state);
  if (locked) aimWorld = { x: locked.x, y: locked.y };
  const movingTouch = sticks.move.active && sticks.move.power > .12;
  const input = {
    throttle: (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0),
    steer: (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0),
    moveAngle: movingTouch ? Math.atan2(sticks.move.y, sticks.move.x) : null,
    movePower: movingTouch ? sticks.move.power : 0,
    aimX: aimWorld.x, aimY: aimWorld.y,
    fire: mouseFire || keys.has('Space') || fireTouch || (sticks.aim.active && sticks.aim.power > .3),
    repair: actionRepair,
    smoke: actionSmoke,
    ammo: selectedAmmo,
  };
  return input;
}

function feedback(title, detail = '', danger = false) {
  hud['combat-feedback'].replaceChildren(document.createTextNode(title));
  if (detail) { const small = document.createElement('small'); small.textContent = detail; hud['combat-feedback'].append(small); }
  hud['combat-feedback'].style.color = danger ? 'var(--enemy)' : 'var(--accent)';
  hud['combat-feedback'].classList.add('active');
  feedbackUntil = performance.now() + 1600;
}
function processEvents() {
  const player = getPlayer(state);
  for (const event of state.events) {
    if (event.id <= lastEventId) continue;
    lastEventId = event.id;
    const related = event.actor === player.id || event.target === player.id;
    const distant = Number.isFinite(event.x) && Math.hypot(event.x - player.x, event.y - player.y) > 700;
    const actor = state.tanks.find(tank=>tank.id===event.actor);
    const audibleEvent = event.type === 'destroyed' ? event.visibleToPlayer : event.type === 'fire' && actor?.visibleToPlayer;
    if (related || !distant && audibleEvent) audio.play(event);
    if (event.type === 'hit' && event.actor === player.id) {
      if (event.damage > 0) feedback(`−${number(event.damage)}`, event.text || (selectedAmmo === 'HE' ? '고폭탄 명중' : '장갑 관통'));
      else if (event.text) feedback(event.text);
    }
    if (event.type === 'bounce' && event.actor === player.id) feedback('관통 실패', event.text || '장갑의 각도를 바꿔 노리세요', true);
    if (event.type === 'destroyed' && event.actor === player.id && event.target !== player.id) feedback('적 전차 격파', event.text || '목표 무력화');
    if (event.type === 'repair' && related) feedback('부품 수리 완료', '차량 성능이 복구되었습니다');
    if (event.type === 'smoke' && event.actor === player.id) feedback('연막 살포', '시야를 가리고 엄폐물로 이동하세요');
    if (event.type === 'hit' && event.target === player.id) {
      $('incoming-hit').style.transform = `rotate(${(player.lastHitAngle || 0) - Math.PI / 2}rad)`;
      $('incoming-hit').classList.add('active'); incomingUntil = performance.now() + 1600;
    }
    if (event.type === 'destroyed' || event.type === 'capture') feed.unshift({ ...event });
  }
  if (player.hp < lastHP) {
    hud['damage-flash'].classList.add('active'); flashUntil = performance.now() + 130;
  }
  lastHP = player.hp;
  feed = feed.filter(event => state.elapsed - event.time < 8).slice(0, 4);
}

function updateHUD() {
  if (!state) return;
  const player = getPlayer(state);
  const allies = state.tanks.filter(t => t.team === 0), enemies = state.tanks.filter(t => t.team === 1);
  hud['allied-count'].textContent = allies.filter(t => t.alive).length;
  hud['enemy-count'].textContent = enemies.filter(t => t.alive).length;
  for (const [id, list] of [['allied-pips',allies],['enemy-pips',enemies]]) {
    const alive = list.filter(t => t.alive).length;
    const pipKey = `${list.length}:${alive}`;
    if (hud[id].dataset.count !== pipKey) {
      hud[id].dataset.count = pipKey;
      hud[id].replaceChildren(...list.map((_, index) => { const pip = document.createElement('i'); if (index >= alive) pip.className = 'dead'; return pip; }));
    }
  }
  hud.timer.textContent = clock(state.timeRemaining);
  hud.timer.parentElement.classList.toggle('urgent', state.timeRemaining <= 60);
  hud['hud-name'].textContent = currentTankName;
  hud['hud-class'].textContent = classLabels[selectedClass][2];
  hud['hp-label'].textContent = `${number(player.hp)} / ${number(player.maxHp)}`;
  hud['hp-bar'].style.width = `${Math.max(0, player.hp / player.maxHp * 100)}%`;
  hud['hp-bar'].classList.toggle('low', player.hp < player.maxHp * .3);
  hud['speed-label'].innerHTML = `${Math.round(Math.abs(player.speed) * .36)} <small>km/h</small>`;
  hud['track-status'].textContent = player.trackDisabled > 0 ? `궤도 파손 · ${player.trackDisabled.toFixed(1)}초` : player.alive ? '궤도 정상' : '전차 격파됨';
  hud['track-status'].classList.toggle('damaged', player.trackDisabled > 0 || !player.alive);
  hud['player-stats'].textContent = `피해 ${number(state.statistics.damage)} · 지원 ${number(state.statistics.assisted)}`;
  for (const indicator of $('module-indicators').children) {
    const key = indicator.dataset.module;
    const duration = key === 'track' ? player.trackDisabled : player.modules?.[key] || 0;
    indicator.classList.toggle('damaged', duration > 0);
    const label = { track:'궤도',engine:'엔진',ammoRack:'탄약고' }[key];
    indicator.textContent = duration > 0 ? `${label} ${Math.ceil(duration)}s` : label;
  }
  const surface = SURFACES[player.surfaceId] || surfaceAt(state.map, player.x, player.y);
  $('terrain-status').dataset.surface = surface.id;
  $('terrain-label').textContent = surface.label;
  $('terrain-factor').textContent = `속도 ${Math.round(surface.speedMultiplier * 100)}%`;
  $('terrain-status').title = `지형 계수 · 최고 속도 ${Math.round(surface.speedMultiplier * 100)}% / 가속 ${Math.round(surface.accelerationMultiplier * 100)}% / 선회 ${Math.round(surface.turnMultiplier * 100)}%`;
  $('terrain-icon').textContent = { plain:'◇', road:'═', mud:'≈', rough:'▵' }[surface.id];
  const reloading = player.reloadLeft > .02;
  hud['reload-label'].textContent = !player.alive ? '주포 작동 불가' : reloading ? '재장전 중' : '사격 준비';
  hud['reload-seconds'].textContent = !player.alive ? 'OFFLINE' : reloading ? `${player.reloadLeft.toFixed(1)}s` : 'READY';
  hud['reload-bar'].style.width = `${Math.min(100,Math.max(0,(1 - player.reloadLeft / (player.reloadTime || TANKS[player.type].reload)) * 100))}%`;
  hud['repair-label'].textContent = player.repairCooldown > 0 ? `${Math.ceil(player.repairCooldown)}s` : '수리';
  hud['repair-button'].disabled = !player.alive || player.repairCooldown > 0;
  hud['repair-button'].classList.toggle('available', (player.trackDisabled > 0 || player.modules?.engine > 0 || player.modules?.ammoRack > 0) && player.repairCooldown <= 0);
  $('smoke-label').textContent = player.smokeCooldown > 0 ? `${Math.ceil(player.smokeCooldown)}s` : `${player.smokeCharges || 0}`;
  $('smoke-button').disabled = !player.alive || player.smokeCharges <= 0 || player.smokeCooldown > 0;
  $('scope-button').disabled = !player.alive;
  $('ammo-ap').disabled = !player.alive;
  $('ammo-he').disabled = !player.alive;
  $('touch-fire').disabled = !player.alive;
  const locked = getLockedTarget(state);
  $('lock-button').disabled = !player.alive || mode !== 'battle';
  $('lock-button').classList.toggle('active', Boolean(locked));
  $('lock-button').setAttribute('aria-pressed', String(Boolean(locked)));
  $('lock-label').textContent = locked ? '⌖ 해제' : '⌖ 고정';
  for (const button of $('order-controls').querySelectorAll('[data-order]')) {
    const active = state.order?.type === button.dataset.order && state.order.until > state.elapsed;
    button.classList.toggle('active', active); button.setAttribute('aria-pressed',String(active));
    button.disabled = !player.alive || mode !== 'battle';
  }
  $('order-timer').textContent = state.order?.until > state.elapsed ? `${state.order.type === 'move' ? '이동 ' : ''}${Math.ceil(state.order.until - state.elapsed)}s` : '';
  const focusActive = Boolean(state.focusTarget && state.focusTarget.until > state.elapsed);
  $('focus-button').disabled = !player.alive || mode !== 'battle' || battleMode === 'training';
  $('focus-button').classList.toggle('active', focusActive);
  $('focus-button').setAttribute('aria-pressed', String(focusActive));
  $('focus-timer').textContent = focusActive ? `${Math.ceil(state.focusTarget.until - state.elapsed)}s` : '';
  hud['spotted-warning'].hidden = !player.spotted || !player.alive || battleMode === 'training';
  $('objective').hidden = battleMode !== 'training' && state.elapsed > objectiveUntil;
  if (state.elapsed > tipUntil || !player.alive || battleMode === 'training') $('battle-tip').hidden = true;
  if (battleMode === 'training') {
    const traveled = state.statistics.distanceTravelled ?? trainingTravel;
    const steps = [traveled >= 100, state.statistics.hits > 0, state.statistics.kills >= 3];
    ['training-move','training-hit','training-kill'].forEach((id,index)=>$(id).classList.toggle('complete',steps[index]));
    $('training-move').textContent = `기동 ${Math.min(10,Math.floor(traveled/10))} / 10m`;
    $('training-hit').textContent = `표적 명중 ${steps[1] ? '완료' : '대기'}`;
    $('training-kill').textContent = `표적 격파 ${state.statistics.kills} / 3`;
    $('training-hint').textContent = !steps[0] ? (isTouch ? '왼쪽 스틱을 오른쪽으로 밀어 전차를 움직이세요.' : 'W/S로 움직이고 A/D로 차체를 돌리세요. 표적은 오른쪽에 있습니다.') : !steps[1] ? (isTouch ? '표적 방향으로 조준한 뒤 고정 버튼과 발사 버튼을 사용해 보세요.' : '표적을 조준하고 R로 고정하세요. Space를 누르면 포탑 정렬 후 발사합니다.') : '측면·후면에서 AP 관통이 유리합니다. T로 지형을 확인하고 도로와 진흙의 주행 차이도 비교하세요.';
  }
  const captures = state.bases.filter(base => base.capture > .5).sort((a,b) => b.capture - a.capture);
  const capture = captures.find(base => base.team === 0) || captures[0];
  $('battle-ui').classList.toggle('has-capture', Boolean(capture));
  hud['capture-banner'].hidden = !capture;
  if (capture) {
    hud['capture-banner'].classList.toggle('danger', capture.team === 0);
    hud['capture-text'].textContent = capture.contested ? '기지 내 교전 · 점령 정지' : capture.team === 0 ? '아군 기지 방어 필요' : '적 기지 점령 중';
    hud['capture-progress'].style.width = `${capture.capture}%`;
    hud['capture-percent'].textContent = `${Math.floor(capture.capture)}%`;
  }
  hud['spectator-panel'].hidden = player.alive;
  if (!player.alive && !state.tanks.some(t => t.id === state.spectateId && t.alive)) state.spectateId = allies.find(t => t.alive)?.id;
  if (!player.alive && hud['spectator-panel'].classList.contains('observing')) hud['spectator-panel'].querySelector('p').textContent = `${state.tanks.find(t => t.id === state.spectateId)?.name || '아군'} 관전 중`;
  hud.reticle.hidden = !player.alive;
  const eventKey = feed.map(e=>e.id).join(',');
  if (hud['event-feed'].dataset.events !== eventKey) {
    hud['event-feed'].dataset.events = eventKey;
    hud['event-feed'].replaceChildren(...feed.map(event => {
      const row = document.createElement('div'); row.className = `feed-row${event.team === 1 ? ' enemy' : ''}`;
      const time = document.createElement('small'); time.textContent = clock(event.time); row.append(time, document.createTextNode(event.text || (event.type === 'destroyed' ? '전차 격파' : '기지 점령'))); return row;
    }));
  }
}

function updateReticle() {
  if (!state || !getPlayer(state).alive) { $('target-panel').hidden = true; $('battle-ui').classList.remove('has-target'); return; }
  const locked = getLockedTarget(state);
  if (locked) aimWorld = { x: locked.x, y: locked.y };
  else if (pointerMoved && !touchAimUsed) aimWorld = renderer.screenToWorld(pointer.x, pointer.y);
  const screen = !locked && pointerMoved && !touchAimUsed ? pointer : renderer.worldToScreen(aimWorld.x, aimWorld.y);
  hud.reticle.style.left = `${screen.x}px`; hud.reticle.style.top = `${screen.y}px`;
  const player = getPlayer(state);
  const point = targetingPoint();
  const aim = aimStatus(state, point.x, point.y);
  const reloading = player.reloadLeft > .02;
  hud.reticle.classList.toggle('reloading', reloading);
  hud.reticle.classList.toggle('blocked', Boolean(aim.blocked || aim.target && aim.penetrable === false));
  hud.reticle.classList.toggle('penetrable', Boolean(aim.target && aim.penetrable && !aim.blocked));
  hud['reload-reticle'].textContent = reloading ? `${player.reloadLeft.toFixed(1)} s` : '';
  const spread = Math.max(20,Math.min(110,(player.dispersion || .006) * Math.max(100,aim.distance) * renderer.camera.scale * 2.3));
  hud.reticle.style.setProperty('--aim-size',`${spread}px`);
  $('aim-alignment').textContent = aim.aligned === false && !reloading ? '포탑 회전 중' : '';
  hud.reticle.classList.toggle('unaligned',aim.aligned === false);
  const zones = {front:'전면',side:'측면',rear:'후면'};
  const target = locked || aim.target;
  $('battle-ui').classList.toggle('has-target', Boolean(target));
  $('target-panel').hidden = !target;
  if (target) {
    const hasArmorReading = aim.target?.id === target.id;
    $('target-panel').classList.toggle('locked', Boolean(locked));
    $('target-panel').classList.toggle('blocked', Boolean(aim.blocked));
    $('target-panel').classList.toggle('ready', hasArmorReading && !aim.blocked && aim.aligned && !reloading);
    $('target-lock-state').textContent = locked ? '목표 고정' : '조준 표적';
    $('target-name').textContent = target.name;
    $('target-range').textContent = `${Math.round(Math.hypot(target.x - player.x, target.y - player.y) / 10)}m`;
    $('target-health-fill').style.width = `${Math.max(0, target.hp / target.maxHp * 100)}%`;
    const armor = hasArmorReading ? `${zones[aim.hitZone] || ''} ${Math.round(aim.effectiveArmor)}mm` : '사선 확인 필요';
    $('target-details').textContent = `${number(target.hp)} / ${number(target.maxHp)} HP · ${armor}`;
    $('target-readiness').textContent = aim.blocked ? (aim.blockedReason === 'ally' ? '아군이 사선을 가림 · 이동해 사선을 확보하세요' : '엄폐물이 사선을 가림 · 측면으로 이동하세요') : !hasArmorReading ? '다른 적이 사선을 가림 · 고정 표적의 관통률 확인 불가' : reloading ? `재장전 ${player.reloadLeft.toFixed(1)}초` : !aim.aligned ? '포탑 회전 중 · 정렬 대기' : player.ammo === 'HE' ? `사격 준비 · 예상 폭발 피해 ${number(aim.estimatedDamage)}` : `사격 준비 · 예상 관통 ${Math.round((aim.penetrationChance || 0) * 100)}%`;
  }
  if (aim.target) {
    const reading = aim.blocked ? (aim.blockedReason === 'ally' ? '아군이 사선을 가림' : '엄폐물이 사선을 가림') : player.ammo === 'HE' ? `예상 폭발 피해 ${number(aim.estimatedDamage)}` : `예상 관통 ${Math.round((aim.penetrationChance || 0)*100)}%`;
    hud['aim-label'].textContent = `${zones[aim.hitZone] || ''} ${Math.round(aim.effectiveArmor)}mm · ${reading}`;
  } else hud['aim-label'].textContent = aim.blocked ? (aim.blockedReason === 'ally' ? '아군 사선 주의' : '엄폐물에 가려짐') : '';
}

function loop(now) {
  const delta = Math.min((now - lastFrame) / 1000, .25);
  lastFrame = now;
  try {
    if (['garage','career'].includes(mode) || mode === 'help' && ['garage','career'].includes(helpReturnMode)) {
      renderer.renderGarage(selectedClass, now / 1000);
    } else if (state) {
      if (mode === 'countdown') {
        countdownRemaining = Math.max(0,countdownRemaining - delta);
        $('countdown-number').textContent = Math.ceil(countdownRemaining) || 'GO';
        if (countdownRemaining === 0) { mode='battle'; state.paused=false; accumulated=0; $('deployment-countdown').hidden=true; audio.play('order'); }
      }
      if (mode === 'battle') {
        accumulated += delta;
        const input = readInput();
        let safety = 0;
        while (accumulated >= 1 / 60 && safety < 15 && state.phase === 'playing') {
          stepBattle(state, input, 1 / 60);
          if (input.repair) actionRepair = false;
          if (input.smoke) actionSmoke = false;
          input.repair = false;
          input.smoke = false;
          accumulated -= 1 / 60; safety++;
        }
        if (safety >= 15) accumulated = 0;
        if (battleMode === 'training') {
          const player=getPlayer(state);
          if (trainingPrevious) trainingTravel += Math.hypot(player.x-trainingPrevious.x,player.y-trainingPrevious.y);
          trainingPrevious={x:player.x,y:player.y};
        }
        processEvents();
        audio.update(state);
        if (state.phase === 'ended') showResult();
      }
      zoomScale += ((zoomed ? 1.55 : 1) - zoomScale) * Math.min(1,delta * 12);
      renderer.render(state, { aim: aimWorld, time: now / 1000, zoom:zoomScale, showArmor:zoomed });
      if (now - lastHud > 90) { updateHUD(); lastHud = now; }
      updateReticle();
      if (now > feedbackUntil) hud['combat-feedback'].classList.remove('active');
      if (now > flashUntil) hud['damage-flash'].classList.remove('active');
      if (now > incomingUntil) $('incoming-hit').classList.remove('active');
    }
  } catch (error) {
    if (!runtimeFailed) {
      runtimeFailed = true;
      console.error('IRON FRONT runtime error', error);
      if (mode === 'battle' || mode === 'countdown') pauseBattle();
      announce('화면 처리 중 오류가 발생했습니다. 차고에서 다시 출격해 주세요.');
    }
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
$('loading').classList.add('loaded');
setTimeout(() => $('loading').hidden = true, 400);
window.addEventListener('pagehide', () => { audio.update({phase:'garage'}); resetControls(); });
