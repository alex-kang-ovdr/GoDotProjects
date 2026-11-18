import { Game, CARDS, DEFAULT_DECK } from './engine.js';
import { BattleAI } from './ai.js';
import { cardIcon } from './renderer.js';
import { ArenaView } from './view.js';
import { DeveloperPanel } from './devtools.js';
import { DECK_PRESETS, OPPONENTS } from './decks.js';
import { ReplayPlayer, FIXED_STEP, summarizeBattle, serializeReplayFile, parseReplayFile } from './session.js';
import { TrainingRun, TRAINING_MISSIONS } from './training.js';
import { CAMPAIGN_STAGES, CampaignProgress } from './campaign.js';
import { BattleHistory } from './history.js';
import { applyCheat, inspectTarget } from './debug.js';
import { DATA_PROFILES, DEFAULT_DATA_PROFILE } from './reconstruction.js';
import { evidenceMarkup } from './evidence-ui.js';

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = 'crownfall.v1';
const MATCH_KEY = 'crownfall.match.v2';
const REPLAY_KEY = 'crownfall.replay.v2';
const DIFFICULTIES = {
  easy: ['RECRUIT', '천천히 카드를 내는 상대와 기본 배치를 연습하세요.'],
  normal: ['TACTICIAN', '방어에 반응하고, 탱커 뒤에 지원 병력을 배치합니다.'],
  hard: ['VETERAN', '빠른 대응과 효율적인 주문으로 빈틈을 노립니다.'],
};
let saved = {};
try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; } catch { /* Storage may be unavailable in private browsing. */ }
const validDeck = (v) => Array.isArray(v) && v.length === 8 && new Set(v).size === 8 && v.every(id => typeof id === 'string' && Object.hasOwn(CARDS, id));
let deck = validDeck(saved.deck) ? saved.deck : [...DEFAULT_DECK];
let difficulty = Object.hasOwn(DIFFICULTIES, saved.difficulty) ? saved.difficulty : 'normal';
let opponentId = OPPONENTS.some(o => o.id === saved.opponentId) ? saved.opponentId : OPPONENTS[0].id;
let activeOpponentId = opponentId;
const recordCount = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
let records = { games: recordCount(saved.games), wins: Math.min(recordCount(saved.games), recordCount(saved.wins)) };
let campaign;
try { campaign = new CampaignProgress(saved.campaign); } catch { campaign = new CampaignProgress(); }
let history = new BattleHistory(saved.history);
let soundEnabled = saved.sound === true;
let orientation = saved.orientation === 'portrait' ? 'portrait' : 'landscape';
let renderMode = saved.renderMode === '3d' ? '3d' : '2d';
let dataProfile = typeof saved.dataProfile === 'string' && Object.hasOwn(DATA_PROFILES, saved.dataProfile) ? saved.dataProfile : DEFAULT_DATA_PROFILE;
let abilityGroupId = null, abilitySignature = '';
let game, ai, selectedIndex = null, pointer = null, drag = null;
let controlTeam = 'player', selectedDeveloperCard = null;
let hoveredEntityId = null;
let selectedEntityId = null, selectedEntityGame = null, inspectMode = false;
let inspectorMessage = '';
let started = false, practice = false, resultShown = false, showRanges = false;
let draftDeck = [], modalResume = false, deckStartsNewBattle = false;
let modalGame = null, modalWasReplay = false;
let activeModal = null;
let deckFilter = 'all', intelCardId = 'knight';
let practiceAI = false, practiceSpeed = 1;
let replay = null, replayPlaying = false, replaySpeed = 1;
let training = null, completedTraining = Array.isArray(saved.completedTraining) ? saved.completedTraining.filter(id => TRAINING_MISSIONS.some(m => m.id === id)) : [];
let resultReport = null;
let campaignContext = null, campaignResult = null, pendingStageId = null;
let deckReturnToStage = false;
let arenaTheme = 'grove', matchId = null, matchSequence = 0;
let countdownRemaining = 0, countingDown = false;
let reportRecord = null, replayRecord = null;
let pendingMatch = readStored(MATCH_KEY), lastReplay = readStored(REPLAY_KEY);
if (!history.list().length && lastReplay?.replay) {
  history = new BattleHistory({ version: 1, entries: [{ ...lastReplay, id: 'legacy-last', arenaTheme: 'grove' }] });
}
let lastCheckpointTick = 0, lastPhase = 'regulation', seeking = false;
let seekWasPlaying = false;
let handSignature = '', lastLogSignature = '', lastRate = 1, lastCrowns = 0;
let toastTimeout, noticeTimeout, audioContext;
const renderer = new ArenaView($('arena'), $('arena-3d'), { onFallback: message => {
  renderMode = '2d'; updateRenderModeUI(); persist(); toast(message);
} });
const developerPanel = new DeveloperPanel({ cards: CARDS, icon: cardIcon, getGame: () => game, getTeam: getControlTeam,
  getSelection: () => ({ team: getControlTeam(), index: selectedIndex, directCard: selectedDeveloperCard }),
  onStart: startDeveloperTest, onTeam: team => setControlTeam(team, true),
  onHand: (team, index) => { setControlTeam(team); closeSettingsPanel(); selectCard(index); renderHUD(); },
  onSpawn: selectDeveloperCard, onCheat: runCheat,
  onChange: () => { updateIntel(intelCardId); saveMatch(); renderHUD(); } });
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const desktopTools = matchMedia('(min-width:1100px) and (pointer:fine)');
const settingsPanel = $('workspace-settings-panel');
const settingsHome = document.createComment('external settings panel');
settingsPanel.before(settingsHome);

function closeSettingsPanel() {
  const dialog = $('workspace-settings-dialog');
  if (dialog.open) dialog.close();
  $('workspace-settings-open').setAttribute('aria-expanded', 'false');
}

function syncSettingsHost() {
  closeSettingsPanel();
  if (desktopTools.matches) settingsHome.after(settingsPanel);
  else $('workspace-settings-dialog').append(settingsPanel);
}

function openSettingsPanel() {
  if (desktopTools.matches) return;
  if (!$('workspace-settings-dialog').open) $('workspace-settings-dialog').showModal();
  $('workspace-settings-open').setAttribute('aria-expanded', 'true');
}

function updateRenderModeUI() {
  document.body.dataset.renderMode = renderMode;
  document.querySelectorAll('button[data-render-mode]').forEach(button => {
    const active = button.dataset.renderMode === renderMode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  $('render-mode-label').textContent = renderMode.toUpperCase();
  $('render-mode-note').textContent = renderMode === '3d'
    ? '입체 전장 · 전투 상태와 배치 규칙은 동일합니다.'
    : '탑뷰 전장 · 전투 중에도 3D로 전환할 수 있습니다.';
  updateViewportReadout();
}

function setRenderMode(value, notify = true) {
  if (game) cancelSelection();
  const requested = value === '3d' ? '3d' : '2d';
  renderMode = renderer.setMode(requested);
  updateRenderModeUI(); persist();
  if (notify && requested === renderMode) toast(`${renderMode.toUpperCase()} 전장으로 전환했습니다.`);
}

function updateDataProfileUI() {
  $('data-profile').value = dataProfile;
  const active = game?.dataProfile || 'prototype-v4';
  $('data-profile-current').textContent = `${DATA_PROFILES[active]?.name || active} · 규칙 ${game?.rulesVersion || 5}`;
  $('data-profile-note').textContent = active !== dataProfile
    ? `다음 전투: ${DATA_PROFILES[dataProfile].name}. 진행 중인 전투는 현재 수치를 유지합니다.`
    : '다음 새 전투부터 적용됩니다. 확인된 일부 수치와 자체 보완값을 함께 사용합니다.';
}

function setDataProfile(value) {
  if (!Object.hasOwn(DATA_PROFILES, value)) return;
  dataProfile = value; persist(); updateDataProfileUI();
  toast('선택한 카드 데이터는 다음 새 전투부터 적용됩니다.');
}
// Move the actual controls, preserving their listeners, state and portrait positions.
const mobileLayout = [...document.querySelectorAll('[data-landscape-slot]')].map(node => {
  const home = document.createComment('portrait position');
  node.before(home);
  return { node, home, slot: $(node.dataset.landscapeSlot) };
});

function arrangeMobileLayout() {
  const landscape = orientation === 'landscape';
  const focused = document.activeElement;
  const keepFocus = $('mobile-game').contains(focused);
  for (const { node, home, slot } of mobileLayout) {
    if (landscape) slot.append(node);
    else home.after(node);
  }
  $('landscape-hud').hidden = !landscape;
  $('landscape-actions').hidden = !landscape;
  document.querySelector('.elixir-track').setAttribute('aria-orientation', landscape ? 'vertical' : 'horizontal');
  if (keepFocus && !focused.closest('[hidden]')) focused.focus({ preventScroll: true });
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ deck, difficulty, opponentId, ...records, sound: soundEnabled, orientation, renderMode, dataProfile,
      completedTraining, campaign: campaign.exportSnapshot(), history: history.exportSnapshot() }));
    return true;
  } catch { return false; }
}

function readStored(key) {
  try { const text = localStorage.getItem(key); return text && text.length < 1500000 ? JSON.parse(text) : null; } catch { return null; }
}

function storeValue(key, value) {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

function selectedOpponent() { return OPPONENTS.find(o => o.id === opponentId) || OPPONENTS[0]; }
function activeOpponent() { return OPPONENTS.find(o => o.id === activeOpponentId) || OPPONENTS[0]; }
function currentStage() { return CAMPAIGN_STAGES.find(s => s.id === campaignContext?.stageId) || null; }
function newMatchId() { return `battle-${Date.now().toString(36)}-${++matchSequence}-${Math.random().toString(36).slice(2, 10)}`; }
function difficultyName(value) { return value === 'easy' ? '입문' : value === 'hard' ? '도전' : '보통'; }
function trainingText(text) {
  return orientation === 'landscape' ? text.replaceAll('왼쪽', '아래쪽').replaceAll('오른쪽', '위쪽') : text;
}

function setOrientation(value, notify = true) {
  orientation = value === 'landscape' ? 'landscape' : 'portrait';
  if (game) cancelSelection();
  document.body.dataset.orientation = orientation;
  arrangeMobileLayout();
  document.querySelectorAll('[data-orientation]').forEach(button => {
    if (button.tagName !== 'BUTTON') return;
    const active = button.dataset.orientation === orientation;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  $('orientation-label').textContent = orientation === 'landscape' ? 'LANDSCAPE' : 'PORTRAIT';
  $('orientation-note').textContent = orientation === 'landscape'
    ? '상대 왼쪽 · 아군 오른쪽. 정보는 좌측, 조작은 우측에 표시합니다.'
    : '아군 아래 · 상대 위. 전투 중에도 방향을 바꿀 수 있습니다.';
  renderer.setOrientation(orientation);
  if (training) {
    updateTrainingUI();
    if (resultShown) {
      $('result-reason').textContent = `${training.mission.name} · ${trainingText(training.reason)}`;
      $('result-tip').textContent = trainingText(training.mission.hint);
    }
  }
  updateViewportReadout();
  persist();
  if (notify) toast(`${orientation === 'landscape' ? '가로 화면 · 상대 왼쪽, 아군 오른쪽' : '세로 화면 · 아군은 아래쪽입니다.'}`);
}

function updateViewportReadout() {
  const rect = $('mobile-game').getBoundingClientRect();
  $('viewport-size').textContent = `${orientation === 'landscape' ? '가로' : '세로'} · ${renderMode.toUpperCase()} · ${Math.round(rect.width)} × ${Math.round(rect.height)}`;
}

function resetInspection(message = '') {
  selectedEntityId = null; selectedEntityGame = null; hoveredEntityId = null;
  inspectorMessage = message;
  setInspectMode(false);
}

function setInspectMode(enabled) {
  inspectMode = Boolean(enabled);
  if (inspectMode && game) cancelSelection();
  document.body.classList.toggle('is-inspecting', inspectMode);
  $('inspect-mode').setAttribute('aria-pressed', String(inspectMode));
  $('inspect-mode').innerHTML = `<span aria-hidden="true">⌖</span> ${inspectMode ? '대상 선택 중 · 다시 눌러 종료' : '대상 선택 도구'}`;
}

function isDeveloperGame() { return Boolean(game?.initialConfig?.developerMode && !training && !replay); }
function getControlTeam() { return isDeveloperGame() ? controlTeam : 'player'; }
function currentCard(id, team = getControlTeam()) {
  if (typeof id !== 'string' || !Object.hasOwn(CARDS, id)) return null;
  return game?.getCard ? game.getCard(id, team) : CARDS[id];
}

function setControlTeam(team, notify = false) {
  if (!isDeveloperGame() || !['player', 'enemy'].includes(team)) return;
  cancelSelection(); controlTeam = team; abilityGroupId = null; abilitySignature = '';
  handSignature = ''; updateIntel(intelCardId); renderHUD(); saveMatch();
  if (notify) toast(`${team === 'player' ? '아군' : '적군'}을 직접 제어합니다.`);
}

function startDeveloperTest(reconstructionDemo = false) {
  const demo = reconstructionDemo === true;
  const prior = !demo && isDeveloperGame() ? game.getDeveloperState() : null;
  const testDeck = demo ? DECK_PRESETS.find(preset => preset.id === 'reconstruction').cards : deck;
  modalResume = false;
  document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
  resetGame(true, true, { config: { deck: [...testDeck], enemyDeck: [...testDeck], difficulty,
    seed: 4501, practice: true, developerMode: true, dataProfile } });
  if (prior?.enabled) {
    for (const team of ['player', 'enemy']) for (const [id, patch] of Object.entries(prior.balance[team])) {
      game.setCardBalance(id, patch, { team, applyExisting: true });
    }
    game.setDeveloperCheats(prior.cheats);
  } else game.setDeveloperCheats({ infiniteElixir: { player: true, enemy: true } });
  setOrientation('landscape', false);
  developerPanel.message(demo ? '미니언 거인·덩굴 테스트 · 양 팀 무한 엘릭서. T로 진영을 바꾸고 카드를 직접 배치하세요.' : '양 팀 직접 제어 · 카드 수치와 치트를 바로 조절하세요.');
  if (demo) {
    developerPanel.cardId = 'vines'; $('balance-card').value = 'vines'; developerPanel.buildFields();
    selectDeveloperCard('player', 'minion_giant');
  }
  refreshModeUI(); renderHUD(); saveMatch();
  announce('개발자 테스트 · 양 팀 직접 제어');
}

function selectDeveloperCard(team, id) {
  if (!isDeveloperGame() || !Object.hasOwn(CARDS, id) || resultShown) return;
  if (!game.state.running) { toast('전투를 계속한 뒤 배치하세요.'); return; }
  setControlTeam(team); setInspectMode(false);
  selectedIndex = null; selectedDeveloperCard = id;
  pointer = { x: 120, y: team === 'player' ? 430 : 210, valid: false };
  updateIntel(id); closeSettingsPanel(); renderHUD();
  $('arena').focus({ preventScroll: true });
  announce(`${team === 'player' ? '아군' : '적군'} ${currentCard(id).name} · 필드를 눌러 배치`);
}

function canUseCheats() { return Boolean(started && practice && game?.practice && !training && !replay && !resultShown && game.state.phase !== 'finished'); }

function runCheat(action) {
  if (!canUseCheats()) { toast('좌측에서 치트 연습을 시작하세요.'); return; }
  const result = applyCheat(game, action, { training: Boolean(training), replay: Boolean(replay) });
  if (!result.ok) { toast(result.reason); return; }
  if (game.state.phase === 'finished') finishBattle();
  else { saveMatch(); renderHUD(); }
  const labels = { 'fill-elixir': '엘릭서를 충전했습니다.', 'heal-towers': '살아 있는 타워의 체력을 회복했습니다.', 'clear-units': '선택한 진영의 병력을 제거했습니다.', 'heal-target': '대상의 체력을 회복했습니다.', 'damage-target': '대상에 피해를 적용했습니다.', 'remove-target': '대상을 제거했습니다.', 'stun-target': '대상을 3초 동안 기절시켰습니다.', 'ready-target': '배치·공격 대기와 상태 이상을 해제했습니다.' };
  toast(labels[action.type] || '연습 도구를 적용했습니다.');
}

function renderWorkspace() {
  if (!game) return;
  if (selectedEntityGame && selectedEntityGame !== game) resetInspection();
  if (selectedEntityId && ![...game.state.units, ...game.state.towers].some(entity => entity.id === selectedEntityId && entity.hp > 0 && !entity.destroyed)) {
    selectedEntityId = null; selectedEntityGame = null;
    inspectorMessage = '선택한 대상이 전장에서 사라졌습니다. 다른 대상을 선택하세요.';
  }
  const allowed = canUseCheats();
  $('global-cheat-controls').disabled = !allowed;
  $('cheat-badge').textContent = allowed ? 'ACTIVE' : '연습 전용';
  $('cheat-badge').classList.toggle('enabled', allowed);
  $('cheat-status').textContent = allowed ? '자유 연습 · 치트 사용 결과는 일반 전적에 남지 않습니다.' : '자유 연습에서 자원과 전투 상태를 조절하세요.';
  $('debug-start').innerHTML = `${allowed ? '새 치트 연습' : '치트 연습 시작'} <span aria-hidden="true">↗</span>`;
  $('debug-ai').setAttribute('aria-pressed', String(practiceAI));
  $('debug-ai').textContent = practiceAI ? 'ON' : 'OFF';
  if (document.activeElement !== $('debug-speed')) $('debug-speed').value = String(practiceSpeed);

  if (!desktopTools.matches) return;

  const inspected = selectedEntityId ? inspectTarget(game, selectedEntityId) : null;
  if (selectedEntityId && !inspected) {
    selectedEntityId = null; selectedEntityGame = null;
    inspectorMessage = '선택한 대상이 전장에서 사라졌습니다. 다른 대상을 선택하세요.';
  }
  $('target-empty').hidden = Boolean(inspected);
  $('target-empty').textContent = inspectorMessage || '전장의 유닛이나 타워를 클릭하세요. Shift + 클릭으로 배치 대신 선택할 수 있습니다.';
  $('target-detail').hidden = !inspected;
  $('clear-target').disabled = !selectedEntityId;
  $('target-cheat-controls').disabled = !allowed || !inspected;
  $('target-cheat-note').textContent = !allowed ? '자유 연습에서 살아 있는 대상을 선택하세요.' : inspected ? '선택한 개체에만 적용됩니다. 일시정지 중에도 사용할 수 있습니다.' : '전장에서 유닛이나 타워를 선택하세요.';
  if (inspected) {
    const { entity, card } = inspected;
    $('target-name').textContent = card?.name || (entity.type === 'king' ? '킹 타워' : '프린세스 타워');
    $('target-identity').textContent = `${entity.id} · ${entity.kind === 'tower' ? '타워' : entity.isBuilding ? '건물' : entity.flying ? entity.groundedRemaining > 0 ? '접지된 공중 병력' : '공중 병력' : '지상 병력'}`;
    $('target-art').innerHTML = card ? cardIcon(card.id, 43) : '<span aria-hidden="true">♜</span>';
    $('target-team').textContent = entity.team === 'player' ? '아군' : '상대';
    $('target-team').className = entity.team;
    $('target-health').textContent = `${Math.ceil(entity.hp).toLocaleString()} / ${entity.maxHp.toLocaleString()}`;
    $('target-health-fill').style.width = `${100 * entity.hp / entity.maxHp}%`;
    const rows = [['피해 / 타', Math.round(entity.damage)], ['공격 간격', `${entity.attackInterval.toFixed(2)}s`], ['사거리', Math.round(entity.range)], ['이동 / 초', Math.round(entity.speed || 0)], ['공격 대기', `${Math.max(0, entity.attackCooldown).toFixed(2)}s`], ['배치 대기', `${Math.max(0, entity.deployRemaining || 0).toFixed(2)}s`], ['월드 X', entity.x.toFixed(1)], ['월드 Y', entity.y.toFixed(1)]];
    $('target-stats').innerHTML = rows.map(([name, value]) => `<div><dt>${name}</dt><dd>${value}</dd></div>`).join('');
    const status = [];
    if (entity.stunRemaining > 0) status.push(`기절 ${entity.stunRemaining.toFixed(1)}초`);
    if (entity.frostRemaining > 0) status.push(`동결 ${entity.frostRemaining.toFixed(1)}초`);
    if (entity.slowRemaining > 0) status.push(`감속 ${Math.round((1 - entity.slowFactor) * 100)}%`);
    if (entity.groundedRemaining > 0) status.push(`접지 ${entity.groundedRemaining.toFixed(1)}초 · 지상 공격에 노출`);
    if (entity.knockbackImmune) status.push('밀치기 면역');
    if (entity.lifetime != null) status.push(`수명 ${entity.lifetime.toFixed(1)}초`);
    if (entity.formationGroupId) {
      status.push(entity.formationState === 'charge' ? '돌격 · 공격 중' : game.rulesVersion >= 4 ? '방진 · 공격하지 않음' : '방진');
      if (entity.formationProtected) status.push(`받는 피해 ${Math.round((card?.damageReduction || 0) * 100)}% 감소`);
    }
    if (entity.kind === 'tower' && !entity.active) status.push('대기 중인 킹 타워');
    if (entity.targetId) status.push(`공격 대상 ${entity.targetId}`);
    $('target-state').textContent = status.join(' · ') || '정상 · 공격 대상을 탐색합니다.';
  }

  const s = game.state;
  $('stats-tick').textContent = `TICK ${s.tick.toLocaleString()}`;
  const units = team => s.units.filter(u => u.team === team && u.hp > 0 && !u.destroyed);
  const p = units('player'), e = units('enemy');
  const statRows = [
    ['엘릭서', s.elixir.player.toFixed(1), s.elixir.enemy.toFixed(1)],
    ['병력 수', p.filter(u => !u.isBuilding).length, e.filter(u => !u.isBuilding).length],
    ['건물 수', p.filter(u => u.isBuilding).length, e.filter(u => u.isBuilding).length],
    ['사용 카드', s.stats.player.cardsPlayed, s.stats.enemy.cardsPlayed],
    ['엘릭서 소비', s.stats.player.elixirSpent, s.stats.enemy.elixirSpent],
    ['누적 피해', Math.round(s.stats.player.damageDealt).toLocaleString(), Math.round(s.stats.enemy.damageDealt).toLocaleString()],
    ['크라운', s.crowns.player, s.crowns.enemy],
  ];
  $('live-stats-body').innerHTML = statRows.map(([name, player, enemy]) => `<tr><th scope="row">${name}</th><td>${player}</td><td>${enemy}</td></tr>`).join('');
}

function saveMatch() {
  if (!started || resultShown || replay || !game?.exportSnapshot) return false;
  pendingMatch = { version: 2, engine: game.exportSnapshot(), ai: ai.exportSnapshot(), opponentId: activeOpponentId, practice, practiceAI, practiceSpeed,
    training: training?.exportSnapshot() || null, campaign: campaignContext, matchId, arenaTheme, countdownRemaining,
    ...(isDeveloperGame() ? { controlTeam } : {}) };
  const persisted = storeValue(MATCH_KEY, pendingMatch);
  lastCheckpointTick = game.state.tick;
  return persisted;
}

function clearSavedMatch() { pendingMatch = null; storeValue(MATCH_KEY, null); $('continue-button').hidden = true; }

function refreshModeUI() {
  if (game && !currentCard(intelCardId)) intelCardId = game.deck[0];
  if (game) updateIntel(intelCardId);
  updateDataProfileUI();
  document.body.classList.toggle('is-replaying', Boolean(replay));
  document.body.classList.toggle('is-training', Boolean(training));
  document.body.classList.toggle('is-campaign', Boolean(campaignContext));
  document.body.classList.toggle('is-developer', isDeveloperGame());
  $('training-hud').hidden = !training || resultShown;
  $('training-hint-button').hidden = !training || resultShown;
  $('replay-controls').hidden = !replay;
  $('replay-time').hidden = !replay;
  $('continue-button').hidden = !pendingMatch;
  $('last-replay-button').disabled = false;
  $('enemy-name').textContent = isDeveloperGame() ? '적군' : training ? '훈련 상대' : activeOpponent().name.split(' ').at(-1);
  const stage = currentStage();
  $('mode-caption').textContent = stage ? `CROWN ROAD · ${stage.name}` : training ? `DRILL ${training.mission.number} · 전술 훈련` : replay ? 'REPLAY · 기록된 전투' : isDeveloperGame() ? 'DEV LAB · 양 팀 직접 제어' : practice ? 'PRACTICE · 자유 연습' : `1 VS AI · ${activeOpponent().subtitle}`;
  $('arena-name').textContent = { grove: 'GREENHAVEN', dusk: 'DUSK CITADEL', frost: 'FROST REACH' }[arenaTheme] || 'GREENHAVEN';
  $('campaign-battle-strip').hidden = !stage || resultShown || Boolean(replay);
  if (stage) {
    $('campaign-battle-name').textContent = `${CAMPAIGN_STAGES.indexOf(stage) + 1} / 6 · ${stage.name}`;
    $('campaign-battle-rules').textContent = `${difficultyName(stage.difficulty)} · 승리 / 타워 무손실 / 3분 내 승리`;
  }
  $('concede-button').hidden = !started || practice || Boolean(training) || Boolean(replay) || resultShown;
  $('pause-restart').textContent = isDeveloperGame() ? '수치를 유지하고 전장 초기화' : campaignContext ? '이 단계 다시 시작' : training ? '이 훈련 다시 시작' : '새 전투';
  $('countdown-overlay').hidden = !countingDown || countdownRemaining <= 0;
  $('pause-button').disabled = !started || resultShown || Boolean(replay);
  renderWorkspace();
}

function restoreMatch() {
  if (!pendingMatch) return;
  try {
    const restored = Game.fromSnapshot(pendingMatch.engine);
    if (restored.state.phase === 'finished') throw new Error('종료된 전투입니다.');
    const restoredAI = BattleAI.fromSnapshot(restored, pendingMatch.ai);
    const restoredTraining = pendingMatch.training ? TrainingRun.fromSnapshot(restored, pendingMatch.training) : null;
    const restoredCampaign = pendingMatch.campaign || null;
    if (restoredCampaign && !campaign.bindGame(restored, restoredCampaign, { training: Boolean(restoredTraining), replay: false })) throw new Error('도전 기록과 전투가 일치하지 않습니다.');
    game = restored; ai = restoredAI; replay = null;
    training = restoredTraining;
    campaignContext = restoredCampaign; campaignResult = null;
    matchId = typeof pendingMatch.matchId === 'string' && /^[a-zA-Z0-9_.:-]{1,96}$/.test(pendingMatch.matchId) ? pendingMatch.matchId : restoredCampaign?.battleId || newMatchId();
    arenaTheme = currentStage()?.arenaTheme || (['grove', 'dusk', 'frost'].includes(pendingMatch.arenaTheme) ? pendingMatch.arenaTheme : 'grove');
    countdownRemaining = Number.isFinite(pendingMatch.countdownRemaining) ? Math.max(0, Math.min(3, pendingMatch.countdownRemaining)) : 0;
    countingDown = countdownRemaining > 0;
    practice = restored.practice; practiceAI = Boolean(pendingMatch.practiceAI);
    practiceSpeed = [1, 2, 4].includes(pendingMatch.practiceSpeed) ? pendingMatch.practiceSpeed : 1;
    activeOpponentId = pendingMatch.opponentId;
    controlTeam = restored.initialConfig.developerMode && pendingMatch.controlTeam === 'enemy' ? 'enemy' : 'player';
    selectedDeveloperCard = null;
    started = true; resultShown = false; selectedIndex = null; pointer = null;
    resetInspection();
    handSignature = ''; lastLogSignature = ''; lastRate = game.getElixirMultiplier();
    lastCrowns = game.state.crowns.player + game.state.crowns.enemy; lastPhase = game.state.phase;
    lastCheckpointTick = game.state.tick;
    $('ready-overlay').hidden = true; $('pause-overlay').hidden = true; $('result-overlay').hidden = true;
    $('pause-button').setAttribute('aria-label', '일시정지');
    $('new-battle-button').firstElementChild.textContent = '새 자유 대전';
    if (!countingDown) game.resume();
    updateCountdownUI();
    refreshModeUI(); renderHUD(); saveMatch(); announce(training ? '저장한 훈련을 이어갑니다' : '저장한 전투를 이어갑니다');
  } catch { clearSavedMatch(); toast('이전 전투를 복원할 수 없습니다. 새 전투를 시작해 주세요.'); }
}

function returnToLobby() {
  if (!replay && started && !resultShown) { game.pause(); if (!saveMatch()) toast('브라우저 저장이 제한되어 이 화면을 닫으면 전투가 사라질 수 있습니다.'); }
  modalResume = false;
  document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
  resetGame(false);
}

function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('visible');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => $('toast').classList.remove('visible'), 2600);
}

function announce(message) {
  $('arena-notice').textContent = message;
  $('arena-notice').classList.add('visible');
  clearTimeout(noticeTimeout);
  noticeTimeout = setTimeout(() => $('arena-notice').classList.remove('visible'), 1900);
}

function tone(frequency, duration = .09, type = 'sine', gain = .045, delay = 0) {
  if (!soundEnabled) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume();
    const at = audioContext.currentTime + delay;
    const oscillator = audioContext.createOscillator();
    const volume = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, at);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * .65, at + duration);
    volume.gain.setValueAtTime(0, at);
    volume.gain.linearRampToValueAtTime(gain, at + .008);
    volume.gain.exponentialRampToValueAtTime(.001, at + duration);
    oscillator.connect(volume).connect(audioContext.destination);
    oscillator.start(at); oscillator.stop(at + duration + .02);
  } catch { /* Sound is optional. */ }
}

function formatTime(seconds) {
  const value = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

function setDifficulty(next, notify = true) {
  difficulty = next;
  document.querySelectorAll('[data-difficulty]').forEach(button => {
    const active = button.dataset.difficulty === next;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  $('difficulty-tag').textContent = DIFFICULTIES[next][0];
  $('difficulty-note').textContent = DIFFICULTIES[next][1];
  $('mobile-difficulty').value = next;
  $('match-difficulty').textContent = `${next === 'easy' ? '입문' : next === 'hard' ? '도전' : '보통'} ⌄`;
  persist();
  if (notify && started && !resultShown) toast('변경한 난이도는 다음 전투에 적용됩니다.');
}

function resetGame(play = false, practiceMode = false, setup = {}) {
  practice = practiceMode;
  training = null; resultReport = null;
  campaignContext = setup.context || null; campaignResult = null; reportRecord = null; replayRecord = null;
  deckReturnToStage = false;
  arenaTheme = setup.arenaTheme || 'grove';
  countdownRemaining = 0; countingDown = false;
  matchId = play ? campaignContext?.battleId || newMatchId() : null;
  replay = null; replayPlaying = false; practiceAI = false; practiceSpeed = 1;
  activeOpponentId = setup.opponentId || opponentId;
  const opponent = activeOpponent();
  game = new Game(setup.config || { deck: [...deck], enemyDeck: [...opponent.deck], difficulty, seed: Date.now() >>> 0, practice, dataProfile });
  if (campaignContext && !campaign.bindGame(game, campaignContext)) throw new Error('도전을 시작할 수 없습니다.');
  ai = new BattleAI(game, { difficulty: game.difficulty, style: opponent.style });
  controlTeam = 'player'; selectedDeveloperCard = null;
  started = play; resultShown = false; selectedIndex = null; pointer = null; drag = null;
  hoveredEntityId = null;
  resetInspection();
  handSignature = ''; lastLogSignature = ''; lastRate = 1; lastCrowns = 0;
  lastCheckpointTick = 0; lastPhase = 'regulation';
  $('ready-overlay').hidden = play;
  $('pause-overlay').hidden = true;
  $('result-overlay').hidden = true;
  $('training-next-button').hidden = true;
  $('campaign-next-button').hidden = true;
  $('result-campaign').hidden = true;
  $('result-deck-button').hidden = false;
  $('result-report-button').hidden = false;
  $('rematch-button').innerHTML = '다시 도전 <span aria-hidden="true">↗</span>';
  $('pause-button').disabled = !play;
  $('pause-button').setAttribute('aria-label', '일시정지');
  $('new-battle-button').firstElementChild.textContent = play ? '새 자유 대전' : '자유 대전';
  $('event-log').innerHTML = '<li class="empty-log">전투를 시작하면<br>주요 이벤트가 여기에 표시됩니다.</li>';
  clearTimeout(noticeTimeout); $('arena-notice').classList.remove('visible');
  if (play) {
    clearSavedMatch();
    if (practice) { game.start(); announce('자유 연습 · AI 배치 없음'); }
    else { countdownRemaining = 3; countingDown = true; updateCountdownUI(); }
    saveMatch();
  }
  refreshModeUI();
  renderHUD();
}

function newBattle(training = false) {
  document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
  modalResume = false;
  resetGame(true, training);
  if (innerWidth <= 700) $('arena-wrap').scrollIntoView({ block: 'center', behavior: reducedMotion ? 'instant' : 'smooth' });
}

function updateCountdownUI() {
  $('countdown-number').textContent = String(Math.max(1, Math.ceil(countdownRemaining)));
  $('countdown-opponent').textContent = `${activeOpponent().name} · ${difficultyName(game.difficulty)}`;
  $('countdown-overlay').hidden = !countingDown || countdownRemaining <= 0;
}

function completeCountdown() {
  if (!started || resultShown || (!countingDown && countdownRemaining <= 0)) return;
  countdownRemaining = 0; countingDown = false;
  $('countdown-overlay').hidden = true; $('pause-overlay').hidden = true;
  game.start(); saveMatch(); announce('전투 시작!');
  tone(440, .14, 'triangle'); tone(660, .18, 'triangle', .045, .12);
  renderHUD();
}

function cancelSelection() {
  selectedIndex = null; selectedDeveloperCard = null; pointer = null;
  if (drag && $('hand').hasPointerCapture(drag.pointerId)) $('hand').releasePointerCapture(drag.pointerId);
  drag = null;
  updateHand();
}

function selectCard(index) {
  const id = game.state.hands[getControlTeam()][index];
  if (!id) return;
  updateIntel(id);
  if (!started || resultShown || replay) return;
  if (!game.state.running) { toast('전투를 계속한 뒤 카드를 배치하세요.'); return; }
  setInspectMode(false);
  selectedIndex = index; selectedDeveloperCard = null;
  tone(520 + index * 50, .045, 'sine', .018);
  updateHand();
}

function getSelectedCard() {
  const id = selectedDeveloperCard || (selectedIndex === null ? null : game.state.hands[getControlTeam()][selectedIndex]);
  return id ? currentCard(id) : null;
}

function pointerAt(x, y) {
  const point = renderer.screenToWorld(x, y);
  const card = getSelectedCard();
  if (!card) return null;
  const check = game.canDeploy(getControlTeam(), card.id, point.x, point.y);
  return { ...point, valid: check.ok, reason: check.reason };
}

function deploy(x, y) {
  const card = getSelectedCard(), team = getControlTeam();
  if (!card || !game.state.running || resultShown || replay) return;
  const result = selectedDeveloperCard
    ? game.spawnDeveloperCard(team, card.id, x, y) : game.playCard(team, selectedIndex, x, y);
  if (!result.ok) {
    const fallback = game.state.elixir[team] < card.cost ? `엘릭서가 부족합니다. ${card.cost} 필요` : `${team === 'player' ? '파란 아군' : '빨간 적군'} 구역에 배치하세요.`;
    toast(/^[a-z_ -]+$/i.test(result.reason || '') ? fallback : result.reason || fallback);
    tone(140, .07, 'triangle', .025);
    return;
  }
  tone(card.type === 'spell' ? 230 : 340, card.type === 'spell' ? .2 : .1, card.type === 'spell' ? 'sawtooth' : 'triangle', .035);
  selectedIndex = null;
  if (!selectedDeveloperCard) pointer = null;
  saveMatch();
  renderHUD();
}

function togglePause(force) {
  if (replay) {
    if (replay.done) { replay.reset(); game = replay.game; resetInspection(); handSignature = ''; lastCrowns = 0; lastRate = 1; lastPhase = 'regulation'; }
    replayPlaying = !replayPlaying; updateReplayUI(); return;
  }
  if (!started || resultShown || document.querySelector('dialog[open]:not(#workspace-settings-dialog)')) return;
  if (countdownRemaining > 0) {
    const pause = force === undefined ? countingDown : force;
    countingDown = !pause; $('pause-overlay').hidden = !pause;
    $('pause-button').setAttribute('aria-label', pause ? '전투 계속' : '일시정지');
    updateCountdownUI(); saveMatch(); return;
  }
  const pause = force === undefined ? game.state.running : force;
  if (pause) { game.pause(); cancelSelection(); saveMatch(); } else game.resume();
  $('pause-overlay').hidden = !pause;
  $('pause-button').setAttribute('aria-label', pause ? '전투 계속' : '일시정지');
  renderHUD();
}

function updateHand() {
  const state = game.state, team = getControlTeam(), hand = state.hands[team];
  $('mobile-game').dataset.controlTeam = team;
  const signature = `${team}:${hand.map(id => `${id}:${currentCard(id, team).cost}`).join(',')}`;
  if (signature !== handSignature) {
    handSignature = signature;
    $('hand').innerHTML = hand.map((id, index) => {
      const card = currentCard(id, team);
      return `<button class="hand-card" data-index="${index}" aria-label="${team === 'player' ? '아군' : '적군'} ${index + 1}번 ${card.name}, 엘릭서 ${card.cost}" aria-pressed="false"><span class="cost-badge">${card.cost}</span><span class="card-key">${index + 1}</span>${cardIcon(id, 64)}<span class="card-name">${card.name}</span><span class="card-wait" hidden></span></button>`;
    }).join('');
  }
  $('hand').querySelectorAll('.hand-card').forEach((button, index) => {
    const card = currentCard(hand[index], team);
    button.disabled = !started || resultShown || !state.running || Boolean(replay);
    button.classList.toggle('selected', selectedIndex === index);
    button.classList.toggle('unaffordable', state.elixir[team] + .0001 < card.cost);
    button.setAttribute('aria-pressed', String(selectedIndex === index));
    const wait = button.querySelector('.card-wait');
    const missing = Math.max(0, card.cost - state.elixir[team]);
    wait.hidden = missing < .0001 || !started || resultShown || Boolean(replay);
    if (!wait.hidden) wait.textContent = `약 ${Math.ceil(missing * 2.8 / game.getElixirMultiplier())}초`;
  });
  const selected = getSelectedCard();
  $('cancel-selection').hidden = !selected;
  $('selected-summary').hidden = !selected;
  $('selected-info-button').hidden = !selected;
  $('landscape-tools').hidden = !selected;
  if (selected) { $('selected-name').textContent = selected.name; $('selected-role').textContent = selected.role; }
  const nextId = state.queues[team][0];
  if ($('next-card-icon').dataset.card !== nextId && CARDS[nextId]) {
    $('next-card-icon').dataset.card = nextId;
    $('next-card-icon').innerHTML = cardIcon(nextId, 40);
    $('next-card-name').textContent = CARDS[nextId].name;
  }
}

function renderAbilities() {
  const abilities = started && !resultShown && !training ? game.getAbilities(getControlTeam()) : [];
  $('ability-panel').hidden = abilities.length === 0;
  if (!abilities.length) { abilityGroupId = null; abilitySignature = ''; return; }
  const picked = abilities.find(a => a.memberIds.includes(selectedEntityId));
  const selected = picked || abilities.find(a => a.groupId === abilityGroupId) || abilities.at(-1);
  abilityGroupId = selected.groupId;
  const signature = abilities.map(a => `${a.groupId}:${a.aliveCount}`).join('|');
  if (signature !== abilitySignature) {
    $('ability-group').replaceChildren(...abilities.map((ability, index) => {
      const option = document.createElement('option');
      option.value = ability.groupId;
      option.textContent = `${index + 1}분대 · ${ability.aliveCount}명`;
      return option;
    }));
    abilitySignature = signature;
  }
  $('ability-group').hidden = abilities.length < 2;
  $('ability-group').value = abilityGroupId;
  $('ability-button').disabled = Boolean(replay) || !selected.ready;
  const state = selected.chargeRemaining > 0 ? `돌격 ${selected.chargeRemaining.toFixed(1)}초`
    : selected.cooldownRemaining > 0 ? `대기 ${Math.ceil(selected.cooldownRemaining)}초`
    : replay ? '리플레이' : !game.state.running ? '일시정지'
    : game.state.elixir[getControlTeam()] < selected.cost ? '엘릭서 부족'
    : selected.ready ? `${selected.aliveCount}명 · 돌격 준비`
    : selected.reason?.includes('기절') ? '분대 기절 중' : '배치 준비 중';
  $('ability-state').textContent = state;
  $('ability-button').title = selected.ready && !replay
    ? `${selected.name} · 엘릭서 ${selected.cost} · ${selected.duration}초간 대형 해제 후 돌격 (E)` : selected.reason || state;
  $('ability-button').setAttribute('aria-label', `${getControlTeam() === 'player' ? '아군' : '적군'} ${selected.name} · ${state}`);
  $('ability-button').querySelector('small').innerHTML = `◆ ${selected.cost} <kbd>E</kbd>`;
  $('ability-panel').dataset.team = getControlTeam();
}

function activateSquadAbility() {
  if (!started || resultShown || training || replay || !abilityGroupId || !game.state.running) return;
  // Resolve the live selection at the action boundary, not on the next HUD tick.
  const picked = game.getAbilities(getControlTeam()).find(ability => ability.memberIds.includes(selectedEntityId));
  const result = game.activateAbility(getControlTeam(), picked?.groupId || abilityGroupId);
  if (!result.ok) { toast(result.reason); return; }
  tone(350, .12, 'triangle', .04);
  saveMatch(); renderHUD();
  announce('방패 돌격!');
}

function startPhalanxPractice() {
  const recipe = DECK_PRESETS.find(preset => preset.id === 'phalanx');
  modalResume = false;
  document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
  resetGame(true, true, { config: { deck: [...recipe.cards], enemyDeck: [...selectedOpponent().deck],
    difficulty, seed: 4301, practice: true, dataProfile } });
  setOrientation('landscape', false);
  runCheat({ type: 'fill-elixir', team: 'player' });
  const slot = game.state.hands.player.indexOf('phalanx');
  if (slot >= 0) selectCard(slot);
}

function updateIntel(id) {
  const c = currentCard(id);
  if (!c) return;
  intelCardId = id;
  $('intel-art').innerHTML = cardIcon(id, 100);
  $('intel-name').textContent = c.name;
  $('intel-cost').textContent = c.cost;
  $('intel-type').textContent = { troop: 'TROOP', spell: 'SPELL', building: 'BUILDING' }[c.type];
  $('intel-role').textContent = c.role;
  $('intel-description').textContent = c.formation
    ? `대형의 보호 조건을 충족하면 받는 피해를 ${Math.round(c.damageReduction * 100)}% 줄입니다. ${game.rulesVersion >= 4 ? '방진 중에는 공격하지 않고 방패 돌격 중에만 공격합니다.' : '방진을 유지하며 공격하고, 스킬로 대형을 풀어 돌격합니다.'}`
    : c.description;
  const rows = c.type === 'spell'
    ? [['총 피해량', c.totalDamage ?? c.damage, ''], ['타워 피해', c.totalCrownDamage ?? c.crownDamage ?? '—', ''], ['효과', c.persistent ? '지속·감속' : c.stunDuration ? '기절' : c.knockback ? '밀치기' : '광역 피해', ''], ['효과 시간', c.stunDuration || (c.persistent ? c.duration : '즉시'), c.stunDuration || c.persistent ? '초' : '']]
    : [['체력', c.hp, ''], ['피해량', c.damage, '/타'], ['공격 간격', c.attackInterval, '초'], ['배치 수', c.count || 1, '기']];
  if (c.formation) rows.push(['방진 피해 감소', Math.round(c.damageReduction * 100), '%'], ['공격 상태', game.rulesVersion >= 4 ? '돌격 중' : '방진·돌격', '']);
  if (c.targetSelection === 'highest-hp') rows.push(['최대 대상', c.maxTargets, '개'], ['접지 시간', c.groundingDuration, '초']);
  if (c.knockbackImmune) rows.push(['밀치기 면역', '있음', ''], ['공격 대상', '건물', '']);
  $('intel-stats').innerHTML = rows.map(([label, value, unit]) => `<div><span>${label}</span><strong>${value ?? '—'}<small>${unit}</small></strong></div>`).join('');
  $('intel-evidence').innerHTML = evidenceMarkup(id, game?.dataProfile || 'prototype-v4', c);
}

function showCardDetail() {
  const c = currentCard(getSelectedCard()?.id || intelCardId);
  if (!c) return;
  updateIntel(c.id);
  $('detail-name').textContent = `${c.name} · ${c.cost} 엘릭서`;
  $('detail-art').innerHTML = cardIcon(c.id, 110);
  $('detail-description').textContent = $('intel-description').textContent;
  $('detail-stats').innerHTML = $('intel-stats').innerHTML;
  $('detail-evidence').innerHTML = $('intel-evidence').innerHTML;
  $('detail-tip').textContent = c.formation && game.rulesVersion >= 4 ? `방진 중에는 공격하지 않고 받는 피해를 ${Math.round(c.damageReduction * 100)}% 줄입니다. 방패 돌격 중에만 공격하며, ${c.abilityDuration}초 후 다시 방진을 만듭니다.` : c.type === 'spell' ? '주문은 적·아군 구역 모두에 사용할 수 있습니다. 적 킹 타워를 맞히면 킹이 활성화됩니다.' : c.targets === 'buildings' ? '건물만 공격합니다. 적 병력은 지원 유닛으로 막아 주세요.' : c.flying ? '강을 바로 건너며 지상 전용 공격에 맞지 않습니다. 대공 유닛과 주문을 조심하세요.' : '아군 진영 또는 타워를 파괴해 열린 전진 구역에 배치할 수 있습니다.';
  openModal('card-dialog');
}

function renderOpponents() {
  const selected = selectedOpponent();
  $('opponent-name').textContent = selected.name;
  $('opponent-avatar').textContent = { bran: 'B', luna: 'L', sera: 'S' }[selected.id] || '★';
  $('opponent-avatar').dataset.opponent = selected.id;
  $('opponent-list').innerHTML = OPPONENTS.map(o => `<button class="opponent-option${o.id === opponentId ? ' active' : ''}" data-opponent="${o.id}" aria-pressed="${o.id === opponentId}"><span class="rival-portrait" data-opponent="${o.id}">${cardIcon(o.deck[0], 64)}</span><span class="rival-copy"><strong>${o.name}</strong><small>${o.subtitle}</small><span>${o.description}</span><span class="rival-deck">${o.deck.map(id => cardIcon(id, 25)).join('')}</span></span><span class="rival-check">${o.id === opponentId ? '✓' : '+'}</span></button>`).join('');
}

function renderCampaignSummary() {
  const summary = campaign.getSummary();
  $('campaign-summary').textContent = `${summary.completedStages} / 6 관문 완료 · ${summary.bestMedals} / 18 메달`;
  $('campaign-side-progress').textContent = `${summary.completedStages} / 6 완료`;
  $('ready-campaign-progress').textContent = summary.completedStages === 6 ? `모든 관문 완료 · 최고 ${summary.bestMedals}메달` : `${summary.completedStages + 1}번째 관문에 도전하세요`;
}

function openCampaign() {
  renderCampaignSummary();
  $('campaign-stages').innerHTML = CAMPAIGN_STAGES.map((stage, index) => {
    const p = campaign.getStageProgress(stage.id);
    const opponent = OPPONENTS.find(o => o.id === stage.opponentId);
    const medals = '◆'.repeat(p.bestMedals) + '◇'.repeat(3 - p.bestMedals);
    return `<button class="stage-option${p.completed ? ' completed' : ''}${p.unlocked ? '' : ' locked'}" data-stage="${stage.id}" data-theme="${stage.arenaTheme}" ${p.unlocked ? '' : 'disabled'} aria-label="${index + 1}단계 ${stage.name}, ${p.unlocked ? `${p.bestMedals}메달, 선택 가능` : '이전 단계 승리 후 해금'}"><span class="stage-number">${p.unlocked ? String(index + 1).padStart(2, '0') : '⌁'}</span><span class="stage-copy"><strong>${stage.name}</strong><small>${opponent.name} · ${difficultyName(stage.difficulty)}</small><span>${stage.description}</span><em>${p.unlocked ? p.completed ? `${medals} · 최고 ${formatTime(p.bestTime)}` : '승리하면 다음 관문이 열립니다' : '이전 관문에서 승리하면 열립니다'}</em></span><b aria-hidden="true">${p.unlocked ? '↗' : '—'}</b></button>`;
  }).join('');
  openModal('campaign-dialog');
}

function prepareStage(id) {
  const stage = CAMPAIGN_STAGES.find(s => s.id === id);
  if (!stage || !campaign.isUnlocked(id)) { toast('이전 관문에서 먼저 승리하세요.'); return; }
  pendingStageId = id;
  const opponent = OPPONENTS.find(o => o.id === stage.opponentId);
  $('stage-title').textContent = `${CAMPAIGN_STAGES.indexOf(stage) + 1}. ${stage.name}`;
  $('stage-description').textContent = stage.description;
  $('stage-opponent').textContent = `${opponent.name} · ${difficultyName(stage.difficulty)}`;
  $('stage-opponent-deck').innerHTML = stage.enemyDeck.map(id => `<span title="${CARDS[id].name}">${cardIcon(id, 35)}</span>`).join('');
  $('stage-player-deck').innerHTML = deck.map(id => `<span title="${CARDS[id].name}">${cardIcon(id, 40)}<small>${CARDS[id].cost}</small></span>`).join('');
  $('stage-average').textContent = `평균 ${(deck.reduce((sum, id) => sum + CARDS[id].cost, 0) / 8).toFixed(1)} 엘릭서`;
  $('stage-hint').textContent = stage.hint;
  openModal('stage-dialog');
}

function startCampaign(id) {
  const stage = CAMPAIGN_STAGES.find(s => s.id === id);
  if (!stage) return;
  try {
    const attempt = campaign.beginAttempt(id, [...deck], { dataProfile });
    modalResume = false; deckReturnToStage = false;
    document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
    const savedProgress = persist();
    resetGame(true, false, { ...attempt, opponentId: stage.opponentId, arenaTheme: stage.arenaTheme });
    renderCampaignSummary();
    if (!savedProgress) toast('이 브라우저에서 진행 기록을 저장할 수 없습니다. 현재 화면에서는 계속 플레이할 수 있습니다.');
    if (innerWidth <= 700) $('arena-wrap').scrollIntoView({ block: 'center', behavior: reducedMotion ? 'instant' : 'smooth' });
  } catch (error) { toast(error.message || '도전을 시작할 수 없습니다.'); }
}

function retryBattle() {
  if (isDeveloperGame()) { startDeveloperTest(); return; }
  if (training) startTraining(training.mission.id);
  else if (campaignContext) startCampaign(campaignContext.stageId);
  else newBattle(practice);
}

function openHistory() {
  const entries = history.list();
  $('history-empty').hidden = entries.length > 0;
  $('history-list').innerHTML = entries.map(entry => {
    const opponent = OPPONENTS.find(o => o.id === entry.opponentId) || OPPONENTS[0];
    const stage = CAMPAIGN_STAGES.find(s => s.id === entry.stageId);
    const winner = entry.replay.winner;
    const result = winner === 'player' ? '승리' : winner === 'draw' ? '무승부' : '패배';
    const crowns = entry.replay.result?.crowns;
    const when = entry.savedAt ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(entry.savedAt) : '이전 기록';
    return `<article class="history-row"><span class="history-result ${winner}">${result}</span><div><strong>${stage ? stage.name : '자유 대전'} · ${opponent.name}</strong><small>${when} · ${formatTime(entry.replay.finalTick * FIXED_STEP)} · ${crowns ? `${crowns.player}:${crowns.enemy}` : '이전 버전 기록'}${entry.replay.endAction ? ' · 항복 종료' : ''}</small><span>${entry.replay.config.deck.map(id => cardIcon(id, 22)).join('')}</span></div><button data-history-play="${entry.id}" aria-label="${opponent.name} 전투 다시 보기">다시 보기</button><button data-history-export="${entry.id}" aria-label="리플레이 파일 저장">↓</button></article>`;
  }).join('');
  $('history-summary').textContent = `최근 ${entries.length} / 8경기 · ${records.wins}승 / ${records.games}전`;
  openModal('history-dialog');
}

function openTraining() {
  $('training-list').innerHTML = TRAINING_MISSIONS.map(m => `<button class="training-option" data-training="${m.id}"><span class="training-number">${completedTraining.includes(m.id) ? '✓' : m.number}</span><span><strong>${m.name}</strong><small>${m.subtitle} · 제한 ${m.limit}초</small><span>${trainingText(m.description)}</span><span class="training-cards">${m.cards.map(id => `${cardIcon(id, 30)}<span>${CARDS[id].name}</span>`).join('')}</span></span><b aria-hidden="true">↗</b></button>`).join('');
  $('training-record').textContent = `${new Set(completedTraining).size} / ${TRAINING_MISSIONS.length} 훈련 완료`;
  openModal('training-dialog');
}

function startTraining(id) {
  const next = new TrainingRun(id, { dataProfile });
  modalResume = false;
  document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
  resetGame(false);
  training = next; game = next.game; controlTeam = 'player'; selectedDeveloperCard = null; practice = true; practiceAI = false; practiceSpeed = 1;
  matchId = newMatchId();
  ai = new BattleAI(game, { difficulty: 'normal' });
  started = true; resultShown = false; handSignature = ''; lastLogSignature = '';
  clearSavedMatch();
  $('ready-overlay').hidden = true;
  $('new-battle-button').firstElementChild.textContent = '새 자유 대전';
  refreshModeUI(); renderHUD(); saveMatch();
  announce(`훈련 ${next.mission.number} · ${next.mission.name}`);
}

function updateTrainingUI() {
  if (!training) return;
  $('training-title').textContent = `${training.mission.number} · ${training.mission.name}`;
  $('training-time').textContent = formatTime(training.mission.limit - game.state.time);
  const progress = training.progress;
  $('training-progress').replaceChildren(...progress.map(item => {
    const li = document.createElement('li'); li.classList.toggle('complete', item.complete);
    li.textContent = `${item.complete ? '✓' : '○'} ${trainingText(item.label)}`; return li;
  }));
  $('training-tip').textContent = trainingText(training.mission.hint);
}

function finishTraining() {
  if (!training?.done || resultShown) return;
  resultShown = true; cancelSelection();
  const { mission, success, reason } = training;
  $('result-eyebrow').textContent = success ? 'TACTIC MASTERED' : 'TRY THE TACTIC AGAIN';
  $('result-title').textContent = success ? '훈련 완료!' : '다시 연습해요';
  $('result-crowns').textContent = success ? '✓' : '↺';
  $('result-reason').textContent = `${mission.name} · ${trainingText(reason)}`;
  $('result-stats').innerHTML = `<div><strong>${formatTime(game.state.time)}</strong><span>훈련 시간</span></div><div><strong>${game.state.stats.player.cardsPlayed}</strong><span>사용한 카드</span></div><div><strong>${training.progress.filter(p => p.complete).length} / 2</strong><span>달성한 목표</span></div>`;
  $('result-tip').textContent = trainingText(mission.hint);
  $('rematch-button').textContent = '이 훈련 다시 도전';
  $('result-replay-button').hidden = true;
  $('result-deck-button').hidden = true;
  $('result-report-button').hidden = true;
  const next = TRAINING_MISSIONS[TRAINING_MISSIONS.findIndex(m => m.id === mission.id) + 1];
  $('training-next-button').hidden = !success;
  $('training-next-button').textContent = next ? `다음 훈련 · ${next.name}` : '훈련 완료 · AI 대전 시작';
  if (success && !completedTraining.includes(mission.id)) { completedTraining.push(mission.id); persist(); }
  $('result-overlay').hidden = false; $('pause-overlay').hidden = true;
  clearSavedMatch(); refreshModeUI(); renderHUD();
  tone(success ? 660 : 260, .25, 'triangle');
}

function showBattleReport() {
  const report = resultReport || summarizeBattle(game);
  $('report-summary').textContent = `카드 ${report.cards}장 · 스킬 ${report.abilities || 0}회 (${report.abilityElixirSpent || 0} 엘릭서) · 총 ${report.elixirSpent ?? 0} 엘릭서 · 카드 평균 비용 ${(report.averageCost || 0).toFixed(1)}`;
  $('report-resource').textContent = report.elixirLeak == null ? '자유 연습에서는 자원 효율을 계산하지 않습니다.' : `엘릭서 상한으로 생성되지 못한 자원: ${report.elixirLeak.toFixed(1)}. 생성량, 실제 사용량, 종료 시 잔여량으로 계산합니다.`;
  $('report-lanes').textContent = `레인 A ${report.left}회 · 레인 B ${report.right}회 · 주문 ${report.spells}회 (세로: 좌/우 · 가로: 아래/위)`;
  $('report-cards').innerHTML = (report.byCard || []).map(c => `<tr><th scope="row">${CARDS[c.id].name}</th><td>${c.count}</td><td>${c.spent}</td></tr>`).join('') || '<tr><td colspan="3">사용한 카드가 없습니다.</td></tr>';
  $('report-tip').textContent = report.tip;
  $('report-export').hidden = practice || !reportRecord;
  openModal('report-dialog');
}

function exportReplayFile(record = null) {
  record ||= replay ? replayRecord || { replay: replay.record, opponentId: activeOpponentId, savedAt: Date.now() } : reportRecord || lastReplay;
  if (!record) { toast('내보낼 전투 기록이 없습니다.'); return; }
  try {
    const blob = new Blob([serializeReplayFile(record)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = `crownfall-replay-${record.replay.config.seed}.json`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('리플레이 파일을 저장합니다.');
  } catch { toast('리플레이를 파일로 저장할 수 없습니다.'); }
}

function startReplay(record = lastReplay) {
  if (!record?.replay) { toast('완료한 AI 대전이 아직 없습니다.'); return; }
  try {
    const playback = new ReplayPlayer(record.replay);
    if (started && !resultShown && !replay) { game.pause(); saveMatch(); }
    modalResume = false;
    document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
    replay = playback; game = playback.game; replayPlaying = true; replaySpeed = 1; training = null;
    replayRecord = record; campaignContext = null; countdownRemaining = 0; countingDown = false;
    arenaTheme = ['grove', 'dusk', 'frost'].includes(record.arenaTheme) ? record.arenaTheme : 'grove';
    activeOpponentId = record.opponentId; practice = false; controlTeam = 'player'; selectedDeveloperCard = null;
    started = true; resultShown = false; selectedIndex = null; pointer = null; drag = null;
    resetInspection();
    handSignature = ''; lastLogSignature = ''; lastRate = 1; lastCrowns = 0; lastPhase = 'regulation';
    $('ready-overlay').hidden = true; $('result-overlay').hidden = true; $('pause-overlay').hidden = true;
    $('replay-seek').max = String(replay.duration); $('replay-seek').value = '0';
    refreshModeUI(); updateReplayUI(); renderHUD(); announce('리플레이 · 다시 보는 전투');
  } catch (error) { toast(error.message || '이 버전에서 재생할 수 없는 전투 기록입니다.'); }
}

function updateReplayUI() {
  if (!replay) return;
  $('replay-toggle').textContent = replay.done ? '처음부터' : replayPlaying ? '일시정지' : '재생';
  $('replay-speed').textContent = `×${replaySpeed}`;
  $('replay-time').textContent = `${formatTime(game.state.time)} / ${formatTime(replay.duration)}`;
  if (!seeking) $('replay-seek').value = String(game.state.time);
}

function renderDeckSummary() {
  $('deck-mini').innerHTML = deck.map(id => `<button class="mini-card" data-card="${id}" aria-label="${CARDS[id].name} 정보"><span class="mini-cost">${CARDS[id].cost}</span>${cardIcon(id, 42)}</button>`).join('');
  $('average-cost').textContent = `◆ 평균 ${(deck.reduce((n, id) => n + CARDS[id].cost, 0) / 8).toFixed(1)}`;
  $('record-summary').textContent = `${records.wins}승 · ${records.games}전`;
  renderCampaignSummary();
}

function renderHUD() {
  const s = game.state, team = getControlTeam();
  const infinite = isDeveloperGame() && game.getDeveloperState().cheats.infiniteElixir[team];
  $('match-time').textContent = formatTime(training ? training.mission.limit - s.time : game.getTimeRemaining());
  $('phase-label').textContent = replay ? replay.done ? '재생 완료' : replayPlaying ? '리플레이' : '재생 일시정지' : resultShown ? '전투 종료' : !started ? '준비 완료' : countdownRemaining > 0 ? '전투 준비' : !s.running ? '일시정지' : training ? '전술 훈련' : isDeveloperGame() ? `테스트 · ${team === 'player' ? '아군' : '적군'}` : s.phase === 'overtime' ? '서든 데스' : practice ? '자유 연습' : '정규전';
  const paused = replay ? !replayPlaying : countdownRemaining > 0 ? !countingDown : !s.running;
  $('pause-label').textContent = started && !resultShown && paused ? '계속하기' : '일시정지';
  document.querySelector('.clock').classList.toggle('overtime', s.phase === 'overtime');
  $('player-score').textContent = s.crowns.player;
  $('enemy-score').textContent = s.crowns.enemy;
  $('elixir-value').textContent = infinite ? '∞' : Math.floor(s.elixir[team] + .00001);
  $('elixir-fill').style.setProperty('--elixir-level', `${Math.max(0, Math.min(100, s.elixir[team] * 10))}%`);
  document.querySelector('.elixir-track').setAttribute('aria-valuenow', s.elixir[team].toFixed(1));
  const multiplier = game.getElixirMultiplier();
  $('rate-label').textContent = infinite ? '무한 엘릭서' : s.elixir[team] >= 9.999 && s.running && !replay ? 'MAX · 카드를 사용하세요' : `×${multiplier} 엘릭서`;
  $('rate-label').classList.toggle('at-cap', s.elixir[team] >= 9.999 && s.running && !replay);
  if (started && multiplier !== lastRate) { announce(`엘릭서 ${multiplier}배!`); lastRate = multiplier; }
  const crowns = s.crowns.player + s.crowns.enemy;
  if (crowns > lastCrowns) { lastCrowns = crowns; announce('타워 파괴!'); tone(220, .23, 'triangle', .06); tone(440, .2, 'triangle', .04, .12); }
  if (s.phase === 'overtime' && lastPhase !== 'overtime') announce('서든 데스 · 다음 타워로 승부!');
  lastPhase = s.phase;
  if (pointer && getSelectedCard()) {
    const selected = getSelectedCard();
    const check = game.canDeploy(team, selected.id, pointer.x, pointer.y);
    pointer.valid = check.ok; pointer.reason = check.reason;
  }
  $('placement-label').hidden = !pointer || !getSelectedCard() || !game.state.running;
  if (pointer && getSelectedCard()) {
    const label = $('placement-label');
    label.textContent = pointer.valid ? `${isDeveloperGame() ? `${team === 'player' ? '아군' : '적군'} · ` : ''}${drag?.moved ? '놓아서 배치' : '누르거나 Enter로 배치'}` : pointer.reason || '배치할 수 없는 위치';
    label.classList.toggle('invalid', !pointer.valid);
  }
  updateReplayUI();
  updateTrainingUI();
  const events = (s.events || []).slice(-5).reverse();
  const eventSignature = events.length ? events.map(e => `${e.time}:${e.text}`).join('|') : '__empty__';
  if (eventSignature !== lastLogSignature) {
    lastLogSignature = eventSignature;
    $('event-log').replaceChildren(...events.map(e => {
      const li = document.createElement('li'); li.className = `log-${e.team || 'system'}`;
      const time = document.createElement('time'); time.textContent = formatTime(e.time || 0);
      const span = document.createElement('span'); span.textContent = e.text || e.type;
      li.append(time, span); return li;
    }));
    if (!events.length) {
      const empty = document.createElement('li'); empty.className = 'empty-log';
      empty.textContent = started ? '첫 카드 배치를 기다리고 있습니다.' : '전투를 시작하면 주요 이벤트가 표시됩니다.';
      $('event-log').append(empty);
    }
  }
  updateHand();
  renderAbilities();
  renderWorkspace();
  developerPanel.render();
}

function finishBattle() {
  if (resultShown || replay || training) return;
  resultShown = true; selectedIndex = null; selectedDeveloperCard = null; pointer = null;
  countdownRemaining = 0; countingDown = false;
  const s = game.state;
  const win = s.winner === 'player', draw = s.winner === 'draw';
  $('result-title').textContent = draw ? '무승부' : win ? '승리!' : '다시, 한 수.';
  $('result-eyebrow').textContent = draw ? 'AN EVEN MATCH' : win ? 'THE CROWN IS YOURS' : 'EVERY BATTLE IS A LESSON';
  $('result-crowns').textContent = win ? '♛'.repeat(Math.max(1, s.crowns.player)) : draw ? '♛ — ♛' : '♛';
  const reasons = { king: '킹 타워가 무너졌습니다.', king_destroyed: '킹 타워가 무너졌습니다.', crowns: '정규전 크라운 수로 결정되었습니다.', regulation: '정규전 크라운 수로 결정되었습니다.', suddenDeath: '연장전에서 타워가 먼저 무너졌습니다.', sudden_death: '연장전에서 타워가 먼저 무너졌습니다.', tiebreaker: draw ? '남은 타워 체력까지 같습니다.' : '남은 타워의 최저 체력으로 결정되었습니다.', draw: '남은 타워 체력까지 같습니다.' };
  reasons.concede = s.winner === 'enemy' ? '항복으로 전투를 마쳤습니다.' : '상대의 항복으로 승리했습니다.';
  const explanation = reasons[s.reason] || (/^[a-z_ -]+$/i.test(s.reason || '') ? '전투가 종료되었습니다.' : s.reason || '전투가 종료되었습니다.');
  $('result-reason').textContent = `${s.crowns.player} : ${s.crowns.enemy} · ${explanation}`;
  const stats = s.stats.player;
  $('result-stats').innerHTML = `<div><strong>${stats.cardsPlayed || 0}</strong><span>사용한 카드</span></div><div><strong>${Math.round(stats.damageDealt || 0).toLocaleString()}</strong><span>누적 피해</span></div><div><strong>${formatTime(s.time)}</strong><span>전투 시간</span></div>`;
  $('result-overlay').hidden = false;
  $('pause-overlay').hidden = true;
  $('pause-button').disabled = true;
  const report = summarizeBattle(game);
  resultReport = report;
  $('result-tip').textContent = report.tip;
  $('result-replay-button').hidden = practice;
  if (!practice) {
    if (campaignContext) campaignResult = campaign.applyResult(game, campaignContext, { training: false, replay: false });
    matchId ||= newMatchId();
    const metadata = { id: matchId, opponentId: activeOpponentId, stageId: campaignContext?.stageId || null, arenaTheme, savedAt: Date.now() };
    const added = history.add(game, metadata);
    if (added) { records.games++; if (win) records.wins++; }
    lastReplay = history.get(matchId) || { ...metadata, replay: game.exportReplay() };
    reportRecord = lastReplay;
    if (!persist()) toast('전투는 끝났지만 브라우저 저장에 실패했습니다. 리플레이 파일로 기록을 보관할 수 있습니다.');
    storeValue(REPLAY_KEY, lastReplay);
    renderDeckSummary();
  }
  $('result-campaign').hidden = !campaignContext;
  if (campaignContext) {
    const medals = campaignResult?.ok ? campaignResult.medals : 0;
    $('result-campaign').textContent = !campaignResult?.ok ? '이 전투는 이미 기록되었거나 도전 기록과 일치하지 않습니다.' : win ? `${'◆'.repeat(medals)}${'◇'.repeat(3 - medals)} · ${campaignResult.newBest ? '최고 기록 갱신!' : '관문 통과!'}` : '다시 도전할 수 있습니다. 이전 최고 기록은 유지됩니다.';
    $('campaign-next-button').hidden = !win || !campaignResult?.ok;
    const next = CAMPAIGN_STAGES[CAMPAIGN_STAGES.findIndex(stage => stage.id === campaignContext.stageId) + 1];
    $('campaign-next-button').textContent = next ? `다음 관문 · ${next.name}` : '모든 관문 완료 · 도전 기록 보기';
    $('rematch-button').textContent = '이 관문 다시 도전';
  }
  clearSavedMatch(); refreshModeUI();
  if (win) { tone(523, .2, 'triangle'); tone(659, .2, 'triangle', .045, .13); tone(784, .4, 'triangle', .045, .26); }
  else tone(260, .35, 'triangle', .04);
  renderHUD();
}

function openModal(id) {
  closeSettingsPanel();
  const keepResume = Boolean(activeModal && modalResume && modalGame === game);
  const previousModal = activeModal;
  activeModal = null;
  if (previousModal?.open) previousModal.close();
  modalGame = game; modalWasReplay = Boolean(replay);
  modalResume = keepResume || (replay ? replayPlaying : started && game.state.running && !resultShown);
  if (replay) replayPlaying = false;
  else if (modalResume || countdownRemaining > 0) { game.pause(); saveMatch(); }
  cancelSelection();
  activeModal = $(id); activeModal.showModal();
  renderHUD();
}

function openDeck(startAfterSave = false) {
  deckStartsNewBattle = startAfterSave;
  draftDeck = [...deck];
  deckFilter = 'all';
  document.querySelectorAll('[data-filter]').forEach(button => { const selected = button.dataset.filter === 'all'; button.classList.toggle('active', selected); button.setAttribute('aria-pressed', String(selected)); });
  renderDraft();
  openModal('deck-dialog');
}

function renderDraft() {
  $('deck-presets').innerHTML = DECK_PRESETS.map(p => `<button data-preset="${p.id}" title="${p.description}"><strong>${p.name}</strong><small>${p.subtitle}</small></button>`).join('');
  $('card-pool').innerHTML = Object.values(CARDS).filter(c => deckFilter === 'all' || c.type === deckFilter).sort((a,b) => a.cost - b.cost).map(c => {
    const selected = draftDeck.includes(c.id);
    return `<button class="pool-card${selected ? ' selected' : ''}" data-card="${c.id}" title="${c.description}" aria-pressed="${selected}" aria-label="${c.name}, ${c.cost} 엘릭서, ${selected ? '덱에서 제거' : '덱에 추가'}"><span class="cost-badge">${c.cost}</span><span class="pool-check">${selected ? '✓' : '+'}</span>${cardIcon(c.id, 64)}<strong>${c.name}</strong><small>${c.role}</small></button>`;
  }).join('');
  $('deck-counter').textContent = `${draftDeck.length} / 8`;
  $('draft-average').textContent = `평균 엘릭서 ${draftDeck.length ? (draftDeck.reduce((sum, id) => sum + CARDS[id].cost, 0) / draftDeck.length).toFixed(1) : '—'}`;
  $('save-deck-button').disabled = draftDeck.length !== 8;
  $('save-deck-button').textContent = draftDeck.length !== 8 ? `${8 - draftDeck.length}장을 더 선택하세요` : deckStartsNewBattle ? '이 덱으로 새 전투' : '덱 저장 · 다음 전투에 적용';
  const draft = draftDeck.map(id => CARDS[id]);
  const advice = [];
  if (!draft.some(c => c.targets === 'buildings')) advice.push('타워를 우선 공격할 카드가 없습니다.');
  if (!draft.some(c => c.type !== 'spell' && c.targets === 'all')) advice.push('공중 유닛에 대응할 병력이 없습니다.');
  if (!draft.some(c => c.type === 'spell' || c.splashRadius > 0)) advice.push('작은 유닛 무리를 정리할 광역 카드가 없습니다.');
  $('deck-advice').textContent = advice.length ? advice.join(' ') : '타워 공략 · 대공 · 군집 대응을 갖춘 덱입니다.';
}

// Pointer events support both tap-to-place and dragging a card onto the arena.
$('hand').addEventListener('pointerdown', e => {
  if (drag && drag.pointerId !== e.pointerId) return;
  const button = e.target.closest('[data-index]');
  if (!button || button.disabled || e.button > 0) return;
  selectCard(Number(button.dataset.index));
  drag = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, moved: false, touch: e.pointerType === 'touch' };
  $('hand').setPointerCapture(e.pointerId);
  e.preventDefault();
});
$('hand').addEventListener('click', e => {
  if (e.detail !== 0) return;
  const button = e.target.closest('[data-index]');
  if (button && !button.disabled) selectCard(Number(button.dataset.index));
});
window.addEventListener('pointermove', e => {
  if (!drag || e.pointerId !== drag.pointerId) return;
  if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 8) drag.moved = true;
  if (drag.moved) pointer = pointerAt(e.clientX, e.clientY - (drag.touch ? 44 : 0));
});
window.addEventListener('pointerup', e => {
  if (!drag || e.pointerId !== drag.pointerId) return;
  if (drag.moved) {
    const rect = $('arena').getBoundingClientRect();
    const aimY = e.clientY - (drag.touch ? 44 : 0);
    if (e.clientX >= rect.left && e.clientX <= rect.right && aimY >= rect.top && aimY <= rect.bottom) {
      const p = renderer.screenToWorld(e.clientX, aimY); deploy(p.x, p.y);
    }
  }
  if ($('hand').hasPointerCapture(e.pointerId)) $('hand').releasePointerCapture(e.pointerId);
  drag = null; pointer = null;
});
window.addEventListener('pointercancel', e => { if (drag?.pointerId === e.pointerId) cancelSelection(); });
$('hand').addEventListener('lostpointercapture', () => { drag = null; pointer = null; });
function entityAt(clientX, clientY) {
  if (renderer.mode === '3d') return renderer.pickEntity(clientX, clientY, [...game.state.units, ...game.state.towers]);
  const point = renderer.screenToWorld(clientX, clientY);
  if (point.x < 0 || point.x > 480 || point.y < 0 || point.y > 640) return null;
  return [...game.state.units, ...game.state.towers].filter(u => u.hp > 0 && !u.destroyed && Math.hypot(u.x - point.x, u.y - point.y) <= u.radius + 12).sort((a,b) => Math.hypot(a.x - point.x, a.y - point.y) - Math.hypot(b.x - point.x, b.y - point.y))[0];
}
$('arena').addEventListener('pointermove', e => {
  if (drag) return;
  if (getSelectedCard()) { pointer = pointerAt(e.clientX, e.clientY); hoveredEntityId = null; }
  else hoveredEntityId = entityAt(e.clientX, e.clientY)?.id || null;
});
$('arena').addEventListener('pointerleave', () => { if (!drag) pointer = null; hoveredEntityId = null; });
$('arena').addEventListener('pointerdown', e => {
  if (e.button > 0 || drag) return;
  if (!getSelectedCard() || inspectMode || e.shiftKey) {
    if (e.shiftKey) cancelSelection();
    const entity = entityAt(e.clientX, e.clientY);
    if (entity && isDeveloperGame()) setControlTeam(entity.team);
    hoveredEntityId = entity?.id || null;
    selectedEntityId = entity?.id || null;
    selectedEntityGame = entity ? game : null;
    inspectorMessage = '';
    if (entity) {
      if (entity.cardId) updateIntel(entity.cardId);
      const name = currentCard(entity.cardId, entity.team)?.name || (entity.type === 'king' ? '킹 타워' : '프린세스 타워');
      if (!desktopTools.matches) toast(`${name} · 체력 ${Math.ceil(entity.hp)} / ${entity.maxHp}`);
    } else if (game.state.running && !replay && !inspectMode) toast('먼저 손패에서 카드를 선택하세요.');
    renderWorkspace();
    renderAbilities();
    return;
  }
  const point = renderer.screenToWorld(e.clientX, e.clientY); deploy(point.x, point.y); e.preventDefault();
});
window.addEventListener('keydown', e => {
  if (document.querySelector('dialog[open]') || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.isContentEditable || e.ctrlKey || e.metaKey || e.altKey) return;
  if (/^[1-4]$/.test(e.key)) {
    e.preventDefault(); selectCard(Number(e.key) - 1);
    if (selectedIndex !== null) { pointer ||= { x: 120, y: getControlTeam() === 'player' ? 420 : 220, valid: true }; $('arena').focus({ preventScroll: true }); }
  }
  else if (getSelectedCard() && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
    e.preventDefault(); const jump = e.shiftKey ? 4 : 16;
    pointer ||= { x: 120, y: getControlTeam() === 'player' ? 420 : 220, valid: true };
    const dx = e.key === 'ArrowRight' ? jump : e.key === 'ArrowLeft' ? -jump : 0;
    const dy = e.key === 'ArrowDown' ? jump : e.key === 'ArrowUp' ? -jump : 0;
    const screen = renderer.worldToScreen(pointer.x, pointer.y);
    const rect = $('arena').getBoundingClientRect();
    const next = renderer.screenToWorld(rect.left + screen.x + dx, rect.top + screen.y + dy);
    pointer.x = Math.max(0, Math.min(480, next.x));
    pointer.y = Math.max(0, Math.min(640, next.y));
    Object.assign(pointer, { valid: game.canDeploy(getControlTeam(), getSelectedCard().id, pointer.x, pointer.y).ok });
  }
  else if (e.key === 'Enter' && getSelectedCard() && pointer && !/BUTTON|A/.test(e.target.tagName)) { e.preventDefault(); deploy(pointer.x, pointer.y); }
  else if (e.key === 'Escape') { cancelSelection(); setInspectMode(false); }
  else if (e.key.toLowerCase() === 't' && !e.repeat && isDeveloperGame()) { e.preventDefault(); setControlTeam(getControlTeam() === 'player' ? 'enemy' : 'player', true); }
  else if (e.key.toLowerCase() === 'e' && !e.repeat) { e.preventDefault(); activateSquadAbility(); }
  else if (e.key.toLowerCase() === 'p' || (e.code === 'Space' && !/BUTTON|A/.test(e.target.tagName))) { e.preventDefault(); togglePause(); }
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  modalResume = false; countingDown = false; updateCountdownUI(); cancelSelection();
  if (replay) { replayPlaying = false; updateReplayUI(); }
  else if (started && !resultShown) { game.pause(); $('pause-overlay').hidden = false; $('pause-button').setAttribute('aria-label', '전투 계속'); saveMatch(); }
});
window.addEventListener('pagehide', saveMatch);

document.querySelectorAll('button[data-orientation]').forEach(button => button.addEventListener('click', () => setOrientation(button.dataset.orientation)));
document.querySelectorAll('button[data-render-mode]').forEach(button => button.addEventListener('click', () => setRenderMode(button.dataset.renderMode)));
$('data-profile').addEventListener('change', event => setDataProfile(event.target.value));
$('reconstruction-practice').addEventListener('click', () => startDeveloperTest(true));
$('workspace-settings-open').addEventListener('click', openSettingsPanel);
$('workspace-settings-close').addEventListener('click', closeSettingsPanel);
$('workspace-settings-dialog').addEventListener('close', () => $('workspace-settings-open').setAttribute('aria-expanded', 'false'));
$('ability-button').addEventListener('click', activateSquadAbility);
$('ability-group').addEventListener('change', () => {
  abilityGroupId = $('ability-group').value;
  selectedEntityId = null; selectedEntityGame = null;
  renderAbilities();
});
$('phalanx-practice').addEventListener('click', startPhalanxPractice);
$('inspect-mode').addEventListener('click', () => { setInspectMode(!inspectMode); renderWorkspace(); });
$('clear-target').addEventListener('click', () => { resetInspection(); renderWorkspace(); });
$('debug-start').addEventListener('click', () => { newBattle(true); announce('치트 연습 · PC 도구 활성화'); });
$('global-cheat-controls').addEventListener('click', e => {
  const button = e.target.closest('[data-global-cheat]');
  if (!button) return;
  const actions = { 'fill-player': { type: 'fill-elixir', team: 'player' }, 'fill-both': { type: 'fill-elixir', team: 'both' }, 'heal-towers': { type: 'heal-towers', team: 'both' }, 'clear-enemy': { type: 'clear-units', team: 'enemy' } };
  if (actions[button.dataset.globalCheat]) runCheat(actions[button.dataset.globalCheat]);
});
$('target-cheat-controls').addEventListener('click', e => {
  const button = e.target.closest('[data-target-cheat]');
  if (!button || !selectedEntityId || selectedEntityGame !== game) return;
  const action = { type: button.dataset.targetCheat, id: selectedEntityId };
  if (action.type === 'damage-target') action.amount = Number($('target-damage-amount').value);
  if (action.type === 'stun-target') action.duration = 3;
  runCheat(action);
});
function togglePracticeAI() {
  if (!canUseCheats()) return;
  practiceAI = !practiceAI; refreshModeUI(); saveMatch();
}
function setPracticeSpeed(value) {
  if (!canUseCheats()) return;
  practiceSpeed = [1, 2, 4].includes(value) ? value : 1;
  refreshModeUI(); saveMatch();
}
$('debug-ai').addEventListener('click', togglePracticeAI);
$('debug-speed').addEventListener('change', e => setPracticeSpeed(Number(e.target.value)));
desktopTools.addEventListener('change', () => { syncSettingsHost(); if (!desktopTools.matches) setInspectMode(false); renderWorkspace(); updateViewportReadout(); });
window.addEventListener('resize', updateViewportReadout, { passive: true });
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(updateViewportReadout).observe($('mobile-game'));

['start-button', 'new-battle-button'].forEach(id => $(id).addEventListener('click', () => newBattle(false)));
$('pause-restart').addEventListener('click', retryBattle);
$('rematch-button').addEventListener('click', retryBattle);
['campaign-button', 'campaign-side', 'mobile-campaign'].forEach(id => $(id).addEventListener('click', openCampaign));
$('campaign-stages').addEventListener('click', e => { const button = e.target.closest('[data-stage]'); if (button && !button.disabled) prepareStage(button.dataset.stage); });
$('stage-start').addEventListener('click', () => startCampaign(pendingStageId));
$('stage-back').addEventListener('click', openCampaign);
$('stage-edit-deck').addEventListener('click', () => { deckReturnToStage = true; openDeck(false); });
$('campaign-next-button').addEventListener('click', () => {
  const next = CAMPAIGN_STAGES[CAMPAIGN_STAGES.findIndex(stage => stage.id === campaignContext?.stageId) + 1];
  if (next && campaign.isUnlocked(next.id)) prepareStage(next.id); else openCampaign();
});
$('countdown-skip').addEventListener('click', completeCountdown);
$('concede-button').addEventListener('click', () => {
  if (started && !resultShown && !practice && !training && !replay) openModal('concede-dialog');
});
$('confirm-concede').addEventListener('click', () => {
  if (!started || resultShown || practice || training || replay) return;
  modalResume = false;
  $('concede-dialog').close();
  if (game.concede('player').ok) finishBattle();
});
$('history-list').addEventListener('click', e => {
  const play = e.target.closest('[data-history-play]'), download = e.target.closest('[data-history-export]');
  if (play) { const record = history.get(play.dataset.historyPlay); if (record) startReplay(record); }
  if (download) { const record = history.get(download.dataset.historyExport); if (record) exportReplayFile(record); }
});
$('history-import').addEventListener('click', () => $('replay-file').click());
['training-button', 'ready-training', 'mobile-training'].forEach(id => $(id).addEventListener('click', openTraining));
$('training-list').addEventListener('click', e => {
  const button = e.target.closest('[data-training]'); if (button) startTraining(button.dataset.training);
});
$('training-next-button').addEventListener('click', () => {
  if (!training?.success) return;
  const next = TRAINING_MISSIONS[TRAINING_MISSIONS.findIndex(m => m.id === training.mission.id) + 1];
  if (next) startTraining(next.id); else newBattle(false);
});
$('training-hint-button').addEventListener('click', () => { if (training) { $('training-hint-text').textContent = trainingText(training.mission.hint); openModal('training-hint-dialog'); } });
$('result-report-button').addEventListener('click', showBattleReport);
['replay-export', 'report-export'].forEach(id => $(id).addEventListener('click', () => exportReplayFile()));
$('import-replay-button').addEventListener('click', () => $('replay-file').click());
$('replay-file').addEventListener('change', async e => {
  const file = e.target.files?.[0]; e.target.value = '';
  if (!file) return;
  if (file.size > 1000000) { toast('리플레이 파일은 1MB 이하여야 합니다.'); return; }
  try { const record = parseReplayFile(await file.text()); startReplay(record); }
  catch (error) { toast(error.message || '리플레이 파일을 읽을 수 없습니다.'); }
});
['practice-button', 'mobile-practice'].forEach(id => $(id).addEventListener('click', () => newBattle(true)));
['help-button', 'ready-help'].forEach(id => $(id).addEventListener('click', () => openModal('help-dialog')));
$('deck-button').addEventListener('click', () => openDeck(false));
$('result-deck-button').addEventListener('click', () => openDeck(true));
$('pause-button').addEventListener('click', () => togglePause());
$('resume-button').addEventListener('click', () => togglePause(false));
$('continue-button').addEventListener('click', restoreMatch);
$('save-exit-button').addEventListener('click', returnToLobby);
document.querySelector('.brand').addEventListener('click', e => { e.preventDefault(); returnToLobby(); });
$('selected-info-button').addEventListener('click', showCardDetail);
['opponent-button', 'match-settings-button'].forEach(id => $(id).addEventListener('click', () => { renderOpponents(); openModal('opponent-dialog'); }));
$('opponent-list').addEventListener('click', e => {
  const button = e.target.closest('[data-opponent]');
  if (!button || !OPPONENTS.some(o => o.id === button.dataset.opponent)) return;
  opponentId = button.dataset.opponent; persist(); renderOpponents();
  if (started) toast('선택한 상대는 다음 전투에 적용됩니다.');
});
$('last-replay-button').addEventListener('click', openHistory);
$('result-replay-button').addEventListener('click', () => startReplay(reportRecord || lastReplay));
$('replay-close').addEventListener('click', returnToLobby);
$('replay-toggle').addEventListener('click', () => {
  if (!replay) return;
  if (replay.done) { replay.reset(); game = replay.game; resetInspection(); handSignature = ''; lastLogSignature = ''; lastCrowns = 0; lastRate = 1; lastPhase = 'regulation'; }
  replayPlaying = !replayPlaying; updateReplayUI();
});
$('replay-speed').addEventListener('click', () => { replaySpeed = replaySpeed === 1 ? 2 : replaySpeed === 2 ? 4 : 1; updateReplayUI(); });
$('replay-seek').addEventListener('input', () => {
  if (!replay) return;
  if (!seeking) seekWasPlaying = replayPlaying;
  seeking = true; replayPlaying = false;
  $('replay-time').textContent = `${formatTime(Number($('replay-seek').value))} / ${formatTime(replay.duration)}`;
});
$('replay-seek').addEventListener('change', () => {
  if (!replay) return;
  try {
    game = replay.seek(Number($('replay-seek').value));
    resetInspection();
    lastCrowns = game.state.crowns.player + game.state.crowns.enemy;
    lastRate = game.getElixirMultiplier(); lastPhase = game.state.phase;
    replayPlaying = seekWasPlaying && !replay.done;
    handSignature = ''; lastLogSignature = ''; seeking = false;
    updateReplayUI(); renderHUD();
  } catch { seeking = false; replayPlaying = false; toast('리플레이를 재생할 수 없습니다.'); }
});
$('cancel-selection').addEventListener('click', cancelSelection);
$('range-button').addEventListener('click', () => {
  showRanges = !showRanges;
  $('range-button').setAttribute('aria-pressed', String(showRanges));
  $('range-button').textContent = showRanges ? '사거리 숨기기' : '사거리 보기';
});
$('sound-button').addEventListener('click', () => {
  soundEnabled = !soundEnabled; persist(); updateSoundButton();
  if (soundEnabled) tone(660, .09);
});
function updateSoundButton() {
  $('sound-button').setAttribute('aria-pressed', String(soundEnabled));
  $('sound-button').setAttribute('aria-label', soundEnabled ? '효과음 끄기' : '효과음 켜기');
  $('sound-button').title = soundEnabled ? '효과음 끄기' : '효과음 켜기';
}
document.querySelectorAll('[data-difficulty]').forEach(button => button.addEventListener('click', () => setDifficulty(button.dataset.difficulty)));
$('mobile-difficulty').addEventListener('change', e => setDifficulty(e.target.value));
$('deck-mini').addEventListener('click', e => { const card = e.target.closest('[data-card]'); if (card) updateIntel(card.dataset.card); });
$('card-pool').addEventListener('click', e => {
  const card = e.target.closest('[data-card]'); if (!card) return;
  const id = card.dataset.card;
  if (draftDeck.includes(id)) draftDeck = draftDeck.filter(v => v !== id);
  else if (draftDeck.length < 8) draftDeck.push(id);
  else { toast('선택된 카드 한 장을 먼저 빼주세요.'); return; }
  renderDraft();
});
$('default-deck-button').addEventListener('click', () => { draftDeck = [...DEFAULT_DECK]; renderDraft(); });
$('deck-presets').addEventListener('click', e => {
  const button = e.target.closest('[data-preset]'); if (!button) return;
  const preset = DECK_PRESETS.find(p => p.id === button.dataset.preset);
  if (preset) { draftDeck = [...preset.cards]; renderDraft(); toast(`${preset.name} 덱을 선택했습니다. 저장하면 적용됩니다.`); }
});
document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
  deckFilter = button.dataset.filter;
  document.querySelectorAll('[data-filter]').forEach(b => { b.classList.toggle('active', b === button); b.setAttribute('aria-pressed', String(b === button)); });
  renderDraft();
}));
$('save-deck-button').addEventListener('click', () => {
  if (!validDeck(draftDeck)) return;
  deck = [...draftDeck]; persist(); renderDeckSummary();
  const restart = deckStartsNewBattle;
  const returnStage = deckReturnToStage ? pendingStageId : null;
  deckReturnToStage = false;
  $('deck-dialog').close();
  if (returnStage) prepareStage(returnStage);
  else if (restart) retryBattle();
  else if (!started) resetGame(false);
  toast(restart ? '새 덱으로 전투를 시작합니다.' : '덱을 저장했습니다. 다음 전투에 적용됩니다.');
});
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('close', () => {
  if (dialog !== activeModal) return;
  if (dialog.id === 'deck-dialog' && deckReturnToStage && pendingStageId) { deckReturnToStage = false; prepareStage(pendingStageId); return; }
  activeModal = null;
  if (modalResume && !document.hidden && game === modalGame && started && !resultShown) {
    if (modalWasReplay && replay) replayPlaying = !replay.done;
    else if (!replay) game.resume();
  }
  modalResume = false; renderHUD();
}));

// Fixed 60 Hz simulation, independent of render rate. Hidden tabs pause instead of catching up.
const STEP = FIXED_STEP;
let previous = performance.now(), accumulator = 0, hudElapsed = 0;
function frame(now) {
  const delta = Math.min((now - previous) / 1000, .12); previous = now;
  if (countingDown && countdownRemaining > 0 && !document.hidden && !document.querySelector('dialog[open]:not(#workspace-settings-dialog)')) {
    const before = Math.ceil(countdownRemaining);
    countdownRemaining = Math.max(0, countdownRemaining - delta);
    if (countdownRemaining <= 0) completeCountdown();
    else if (Math.ceil(countdownRemaining) !== before) { updateCountdownUI(); tone(440, .055, 'sine', .02); }
  }
  const playing = replay ? replayPlaying && !replay.done : game.state.running && !resultShown;
  if (playing) {
    accumulator += delta * (replay ? replaySpeed : practice ? practiceSpeed : 1);
    while (accumulator >= STEP) {
      if (replay) {
        try { replay.step(); game = replay.game; }
        catch { replayPlaying = false; accumulator = 0; toast('리플레이 데이터가 현재 전투 규칙과 일치하지 않습니다.'); break; }
        if (replay.done) { replayPlaying = false; accumulator = 0; updateReplayUI(); announce('리플레이 종료'); break; }
      } else if (training) {
        training.step(STEP);
        if (training.done) { finishTraining(); accumulator = 0; break; }
      } else {
        if (!practice || practiceAI) ai.update(STEP);
        game.update(STEP);
      }
      accumulator -= STEP;
      if (!replay && (game.state.phase === 'finished' || game.state.winner)) { finishBattle(); accumulator = 0; break; }
    }
    if (!replay && game.state.tick - lastCheckpointTick >= 300) saveMatch();
  } else accumulator = 0;
  renderer.draw(game, { deploymentTeam: getControlTeam(), selectedCard: getSelectedCard(), pointer, showRanges, reducedMotion, hoveredEntityId, selectedEntityId, arenaTheme, trainingTarget: training && !resultShown ? training.target : null });
  hudElapsed += delta;
  if (hudElapsed >= .1) { renderHUD(); hudElapsed = 0; }
  requestAnimationFrame(frame);
}

setDifficulty(difficulty, false);
try { if (lastReplay) new ReplayPlayer(lastReplay.replay); } catch { lastReplay = null; storeValue(REPLAY_KEY, null); }
try { if (pendingMatch) { Game.fromSnapshot(pendingMatch.engine); if (pendingMatch.engine.state.phase === 'finished') pendingMatch = null; } } catch { pendingMatch = null; storeValue(MATCH_KEY, null); }
renderDeckSummary(); renderOpponents(); updateSoundButton();
resetGame(false);
syncSettingsHost();
setOrientation(orientation, false);
setRenderMode(renderMode, false);
requestAnimationFrame(frame);
