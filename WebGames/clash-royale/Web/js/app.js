import { Game, CARDS, DEFAULT_DECK } from './engine.js';
import { BattleAI } from './ai.js';
import { ArenaRenderer, cardIcon } from './renderer.js';
import { DECK_PRESETS, OPPONENTS } from './decks.js';
import { ReplayPlayer, FIXED_STEP, summarizeBattle, serializeReplayFile, parseReplayFile } from './session.js';
import { TrainingRun, TRAINING_MISSIONS } from './training.js';
import { CAMPAIGN_STAGES, CampaignProgress } from './campaign.js';
import { BattleHistory } from './history.js';

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
let game, ai, selectedIndex = null, pointer = null, drag = null;
let hoveredEntityId = null;
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
const renderer = new ArenaRenderer($('arena'));
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ deck, difficulty, opponentId, ...records, sound: soundEnabled,
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

function saveMatch() {
  if (!started || resultShown || replay || !game?.exportSnapshot) return false;
  pendingMatch = { version: 2, engine: game.exportSnapshot(), ai: ai.exportSnapshot(), opponentId: activeOpponentId, practice, practiceAI, practiceSpeed,
    training: training?.exportSnapshot() || null, campaign: campaignContext, matchId, arenaTheme, countdownRemaining };
  const persisted = storeValue(MATCH_KEY, pendingMatch);
  lastCheckpointTick = game.state.tick;
  return persisted;
}

function clearSavedMatch() { pendingMatch = null; storeValue(MATCH_KEY, null); $('continue-button').hidden = true; }

function refreshModeUI() {
  document.body.classList.toggle('is-replaying', Boolean(replay));
  document.body.classList.toggle('is-training', Boolean(training));
  document.body.classList.toggle('is-campaign', Boolean(campaignContext));
  $('practice-tools').hidden = !started || !practice || Boolean(replay) || Boolean(training) || resultShown;
  $('training-hud').hidden = !training || resultShown;
  $('replay-controls').hidden = !replay;
  $('continue-button').hidden = !pendingMatch;
  $('last-replay-button').disabled = false;
  $('enemy-name').textContent = training ? '훈련 상대' : activeOpponent().name.split(' ').at(-1);
  $('practice-ai').setAttribute('aria-pressed', String(practiceAI));
  $('practice-ai').textContent = practiceAI ? 'AI 끄기' : 'AI 켜기';
  $('practice-speed').textContent = `×${practiceSpeed} 속도`;
  const stage = currentStage();
  $('mode-caption').textContent = stage ? `CROWN ROAD · ${stage.name}` : training ? `DRILL ${training.mission.number} · 전술 훈련` : replay ? 'REPLAY · 기록된 전투' : practice ? 'PRACTICE · 자유 연습' : `1 VS AI · ${activeOpponent().subtitle}`;
  $('arena-name').textContent = { grove: 'GREENHAVEN', dusk: 'DUSK CITADEL', frost: 'FROST REACH' }[arenaTheme] || 'GREENHAVEN';
  $('campaign-battle-strip').hidden = !stage || resultShown || Boolean(replay);
  if (stage) {
    $('campaign-battle-name').textContent = `${CAMPAIGN_STAGES.indexOf(stage) + 1} / 6 · ${stage.name}`;
    $('campaign-battle-rules').textContent = `${difficultyName(stage.difficulty)} · 승리 / 타워 무손실 / 3분 내 승리`;
  }
  $('concede-button').hidden = !started || practice || Boolean(training) || Boolean(replay) || resultShown;
  $('pause-restart').textContent = campaignContext ? '이 단계 다시 시작' : training ? '이 훈련 다시 시작' : '새 전투';
  $('countdown-overlay').hidden = !countingDown || countdownRemaining <= 0;
  $('pause-button').disabled = !started || resultShown || Boolean(replay);
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
    practiceSpeed = pendingMatch.practiceSpeed === 2 ? 2 : 1;
    activeOpponentId = pendingMatch.opponentId;
    started = true; resultShown = false; selectedIndex = null; pointer = null;
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
  game = new Game(setup.config || { deck: [...deck], enemyDeck: [...opponent.deck], difficulty, seed: Date.now() >>> 0, practice });
  if (campaignContext && !campaign.bindGame(game, campaignContext)) throw new Error('도전을 시작할 수 없습니다.');
  ai = new BattleAI(game, { difficulty: game.difficulty, style: opponent.style });
  started = play; resultShown = false; selectedIndex = null; pointer = null; drag = null;
  hoveredEntityId = null;
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
  selectedIndex = null; pointer = null;
  if (drag && $('hand').hasPointerCapture(drag.pointerId)) $('hand').releasePointerCapture(drag.pointerId);
  drag = null;
  updateHand();
}

function selectCard(index) {
  const id = game.state.hands.player[index];
  if (!id) return;
  updateIntel(id);
  if (!started || resultShown || replay) return;
  if (!game.state.running) { toast('전투를 계속한 뒤 카드를 배치하세요.'); return; }
  selectedIndex = index;
  tone(520 + index * 50, .045, 'sine', .018);
  updateHand();
}

function getSelectedCard() { return selectedIndex === null ? null : CARDS[game.state.hands.player[selectedIndex]]; }

function pointerAt(x, y) {
  const point = renderer.screenToWorld(x, y);
  const card = getSelectedCard();
  if (!card) return null;
  const check = game.canDeploy('player', card.id, point.x, point.y);
  return { ...point, valid: check.ok && game.state.elixir.player >= card.cost, reason: check.reason };
}

function deploy(x, y) {
  if (selectedIndex === null || !game.state.running || resultShown || replay) return;
  const card = getSelectedCard();
  const result = game.playCard('player', selectedIndex, x, y);
  if (!result.ok) {
    const fallback = game.state.elixir.player < card.cost ? `엘릭서가 부족합니다. ${card.cost} 필요` : '파란색 아군 구역에 배치하세요.';
    toast(/^[a-z_ -]+$/i.test(result.reason || '') ? fallback : result.reason || fallback);
    tone(140, .07, 'triangle', .025);
    return;
  }
  tone(card.type === 'spell' ? 230 : 340, card.type === 'spell' ? .2 : .1, card.type === 'spell' ? 'sawtooth' : 'triangle', .035);
  selectedIndex = null; pointer = null;
  saveMatch();
  updateHand();
}

function togglePause(force) {
  if (replay) {
    if (replay.done) { replay.reset(); game = replay.game; handSignature = ''; lastCrowns = 0; lastRate = 1; lastPhase = 'regulation'; }
    replayPlaying = !replayPlaying; updateReplayUI(); return;
  }
  if (!started || resultShown || document.querySelector('dialog[open]')) return;
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
  const state = game.state;
  const signature = state.hands.player.join(',');
  if (signature !== handSignature) {
    handSignature = signature;
    $('hand').innerHTML = state.hands.player.map((id, index) => {
      const card = CARDS[id];
      return `<button class="hand-card" data-index="${index}" aria-label="${index + 1}번 ${card.name}, 엘릭서 ${card.cost}" aria-pressed="false"><span class="cost-badge">${card.cost}</span><span class="card-key">${index + 1}</span>${cardIcon(id, 64)}<span class="card-name">${card.name}</span><span class="card-wait" hidden></span></button>`;
    }).join('');
  }
  document.querySelectorAll('.hand-card').forEach((button, index) => {
    const card = CARDS[state.hands.player[index]];
    button.disabled = !started || resultShown || !state.running || Boolean(replay);
    button.classList.toggle('selected', selectedIndex === index);
    button.classList.toggle('unaffordable', state.elixir.player + .0001 < card.cost);
    button.setAttribute('aria-pressed', String(selectedIndex === index));
    const wait = button.querySelector('.card-wait');
    const missing = Math.max(0, card.cost - state.elixir.player);
    wait.hidden = missing < .0001 || !started || resultShown || Boolean(replay);
    if (!wait.hidden) wait.textContent = `약 ${Math.ceil(missing * 2.8 / game.getElixirMultiplier())}초`;
  });
  const selected = getSelectedCard();
  $('selection-hint').textContent = replay ? '기록된 카드 배치를 재생하고 있습니다' : selected ? `${selected.name} · ${selected.type === 'spell' ? '원하는 위치에 주문 사용' : '아군 구역을 눌러 배치'}` : '카드를 선택한 뒤, 아레나를 누르세요';
  $('cancel-selection').hidden = selectedIndex === null;
  $('selected-summary').hidden = !selected;
  if (selected) { $('selected-name').textContent = selected.name; $('selected-role').textContent = selected.role; }
  const nextId = state.queues.player[0];
  if ($('next-card-icon').dataset.card !== nextId && CARDS[nextId]) {
    $('next-card-icon').dataset.card = nextId;
    $('next-card-icon').innerHTML = cardIcon(nextId, 40);
    $('next-card-name').textContent = CARDS[nextId].name;
  }
}

function updateIntel(id) {
  const c = CARDS[id];
  if (!c) return;
  intelCardId = id;
  $('intel-art').innerHTML = cardIcon(id, 100);
  $('intel-name').textContent = c.name;
  $('intel-cost').textContent = c.cost;
  $('intel-type').textContent = { troop: 'TROOP', spell: 'SPELL', building: 'BUILDING' }[c.type];
  $('intel-role').textContent = c.role;
  $('intel-description').textContent = c.description;
  const rows = c.type === 'spell'
    ? [['총 피해량', c.totalDamage || c.damage, ''], ['타워 피해', c.totalCrownDamage || c.crownDamage || '—', ''], ['효과', c.persistent ? '지속·감속' : c.stunDuration ? '기절' : c.knockback ? '밀치기' : '광역 피해', ''], ['효과 시간', c.stunDuration || (c.persistent ? c.duration : '즉시'), c.stunDuration || c.persistent ? '초' : '']]
    : [['체력', c.hp, ''], ['피해량', c.damage, '/타'], ['공격 간격', c.attackInterval, '초'], ['배치 수', c.count || 1, '기']];
  $('intel-stats').innerHTML = rows.map(([label, value, unit]) => `<div><span>${label}</span><strong>${value ?? '—'}<small>${unit}</small></strong></div>`).join('');
}

function showCardDetail() {
  const c = CARDS[getSelectedCard()?.id || intelCardId];
  updateIntel(c.id);
  $('detail-name').textContent = `${c.name} · ${c.cost} 엘릭서`;
  $('detail-art').innerHTML = cardIcon(c.id, 110);
  $('detail-description').textContent = c.description;
  $('detail-stats').innerHTML = $('intel-stats').innerHTML;
  $('detail-tip').textContent = c.type === 'spell' ? '주문은 적·아군 구역 모두에 사용할 수 있습니다. 적 킹 타워를 맞히면 킹이 활성화됩니다.' : c.targets === 'buildings' ? '건물만 공격합니다. 적 병력은 지원 유닛으로 막아 주세요.' : c.flying ? '강을 바로 건너며 지상 전용 공격에 맞지 않습니다. 대공 유닛과 주문을 조심하세요.' : '아군 진영 또는 타워를 파괴해 열린 전진 구역에 배치할 수 있습니다.';
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
    const attempt = campaign.beginAttempt(id, [...deck]);
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
  $('training-list').innerHTML = TRAINING_MISSIONS.map(m => `<button class="training-option" data-training="${m.id}"><span class="training-number">${completedTraining.includes(m.id) ? '✓' : m.number}</span><span><strong>${m.name}</strong><small>${m.subtitle} · 제한 ${m.limit}초</small><span>${m.description}</span><span class="training-cards">${m.cards.map(id => `${cardIcon(id, 30)}<span>${CARDS[id].name}</span>`).join('')}</span></span><b aria-hidden="true">↗</b></button>`).join('');
  $('training-record').textContent = `${new Set(completedTraining).size} / ${TRAINING_MISSIONS.length} 훈련 완료`;
  openModal('training-dialog');
}

function startTraining(id) {
  const next = new TrainingRun(id);
  modalResume = false;
  document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
  resetGame(false);
  training = next; game = next.game; practice = true; practiceAI = false; practiceSpeed = 1;
  matchId = newMatchId();
  ai = new BattleAI(game, { difficulty: 'normal' });
  started = true; resultShown = false; handSignature = ''; lastLogSignature = '';
  clearSavedMatch();
  $('ready-overlay').hidden = true;
  $('new-battle-button').firstElementChild.textContent = '새 자유 대전';
  refreshModeUI(); renderHUD(); saveMatch();
  announce(`훈련 ${next.mission.number} · ${next.mission.name}`);
  if (innerWidth <= 700) $('training-hud').scrollIntoView({ block: 'start', behavior: reducedMotion ? 'instant' : 'smooth' });
}

function updateTrainingUI() {
  if (!training) return;
  $('training-title').textContent = `${training.mission.number} · ${training.mission.name}`;
  $('training-time').textContent = formatTime(training.mission.limit - game.state.time);
  const progress = training.progress;
  $('training-progress').replaceChildren(...progress.map(item => {
    const li = document.createElement('li'); li.classList.toggle('complete', item.complete);
    li.textContent = `${item.complete ? '✓' : '○'} ${item.label}`; return li;
  }));
  $('training-tip').textContent = training.mission.hint;
}

function finishTraining() {
  if (!training?.done || resultShown) return;
  resultShown = true; cancelSelection();
  const { mission, success, reason } = training;
  $('result-eyebrow').textContent = success ? 'TACTIC MASTERED' : 'TRY THE TACTIC AGAIN';
  $('result-title').textContent = success ? '훈련 완료!' : '다시 연습해요';
  $('result-crowns').textContent = success ? '✓' : '↺';
  $('result-reason').textContent = `${mission.name} · ${reason}`;
  $('result-stats').innerHTML = `<div><strong>${formatTime(game.state.time)}</strong><span>훈련 시간</span></div><div><strong>${game.state.stats.player.cardsPlayed}</strong><span>사용한 카드</span></div><div><strong>${training.progress.filter(p => p.complete).length} / 2</strong><span>달성한 목표</span></div>`;
  $('result-tip').textContent = mission.hint;
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
  $('report-summary').textContent = `${report.cards}장 사용 · ${report.elixirSpent ?? 0} 엘릭서 사용 · 평균 비용 ${(report.averageCost || 0).toFixed(1)}`;
  $('report-resource').textContent = report.elixirLeak == null ? '자유 연습에서는 자원 효율을 계산하지 않습니다.' : `엘릭서 상한으로 생성되지 못한 자원: ${report.elixirLeak.toFixed(1)}. 생성량, 실제 사용량, 종료 시 잔여량으로 계산합니다.`;
  $('report-lanes').textContent = `왼쪽 ${report.left}회 · 오른쪽 ${report.right}회 · 주문 ${report.spells}회`;
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
    activeOpponentId = record.opponentId; practice = false;
    started = true; resultShown = false; selectedIndex = null; pointer = null; drag = null;
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
  const s = game.state;
  $('match-time').textContent = formatTime(game.getTimeRemaining());
  $('phase-label').textContent = replay ? replay.done ? '재생 완료' : replayPlaying ? '리플레이' : '재생 일시정지' : resultShown ? '전투 종료' : !started ? '준비 완료' : countdownRemaining > 0 ? '전투 준비' : !s.running ? '일시정지' : s.phase === 'overtime' ? '서든 데스' : practice ? '자유 연습' : '정규전';
  document.querySelector('.clock').classList.toggle('overtime', s.phase === 'overtime');
  $('player-score').textContent = s.crowns.player;
  $('enemy-score').textContent = s.crowns.enemy;
  $('elixir-value').textContent = Math.floor(s.elixir.player + .00001);
  $('elixir-fill').style.width = `${Math.max(0, Math.min(100, s.elixir.player * 10))}%`;
  document.querySelector('.elixir-track').setAttribute('aria-valuenow', s.elixir.player.toFixed(1));
  const multiplier = game.getElixirMultiplier();
  $('rate-label').textContent = s.elixir.player >= 9.999 && s.running && !replay ? 'MAX · 카드를 사용하세요' : `×${multiplier} 엘릭서`;
  $('rate-label').classList.toggle('at-cap', s.elixir.player >= 9.999 && s.running && !replay);
  if (started && multiplier !== lastRate) { announce(`엘릭서 ${multiplier}배!`); lastRate = multiplier; }
  const crowns = s.crowns.player + s.crowns.enemy;
  if (crowns > lastCrowns) { lastCrowns = crowns; announce('타워 파괴!'); tone(220, .23, 'triangle', .06); tone(440, .2, 'triangle', .04, .12); }
  if (s.phase === 'overtime' && lastPhase !== 'overtime') announce('서든 데스 · 다음 타워로 승부!');
  lastPhase = s.phase;
  if (pointer && selectedIndex !== null) {
    const selected = getSelectedCard();
    const check = game.canDeploy('player', selected.id, pointer.x, pointer.y);
    pointer.valid = check.ok; pointer.reason = check.reason;
  }
  $('placement-label').hidden = !pointer || !getSelectedCard() || !game.state.running;
  if (pointer && getSelectedCard()) {
    const label = $('placement-label');
    label.textContent = pointer.valid ? drag?.moved ? '놓아서 배치' : '누르거나 Enter로 배치' : pointer.reason || '배치할 수 없는 위치';
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
}

function finishBattle() {
  if (resultShown || replay || training) return;
  resultShown = true; selectedIndex = null; pointer = null;
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
  const point = renderer.screenToWorld(clientX, clientY);
  return [...game.state.units, ...game.state.towers].filter(u => u.hp > 0 && !u.destroyed && Math.hypot(u.x - point.x, u.y - point.y) <= u.radius + 12).sort((a,b) => Math.hypot(a.x - point.x, a.y - point.y) - Math.hypot(b.x - point.x, b.y - point.y))[0];
}
$('arena').addEventListener('pointermove', e => {
  if (drag) return;
  if (selectedIndex !== null) { pointer = pointerAt(e.clientX, e.clientY); hoveredEntityId = null; }
  else hoveredEntityId = entityAt(e.clientX, e.clientY)?.id || null;
});
$('arena').addEventListener('pointerleave', () => { if (!drag) pointer = null; hoveredEntityId = null; });
$('arena').addEventListener('pointerdown', e => {
  if (e.button > 0 || drag) return;
  if (selectedIndex === null) {
    const entity = entityAt(e.clientX, e.clientY);
    hoveredEntityId = entity?.id || null;
    if (entity) {
      if (entity.cardId) updateIntel(entity.cardId);
      const name = CARDS[entity.cardId]?.name || (entity.type === 'king' ? '킹 타워' : '프린세스 타워');
      toast(`${name} · 체력 ${Math.ceil(entity.hp)} / ${entity.maxHp}`);
    } else if (game.state.running && !replay) toast('먼저 아래에서 카드를 선택하세요.');
    return;
  }
  const point = renderer.screenToWorld(e.clientX, e.clientY); deploy(point.x, point.y); e.preventDefault();
});
window.addEventListener('keydown', e => {
  if (document.querySelector('dialog[open]') || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  if (/^[1-4]$/.test(e.key)) {
    e.preventDefault(); selectCard(Number(e.key) - 1);
    if (selectedIndex !== null) { pointer ||= { x: 120, y: 420, valid: true }; $('arena').focus({ preventScroll: true }); }
  }
  else if (selectedIndex !== null && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
    e.preventDefault(); const jump = e.shiftKey ? 4 : 16;
    pointer ||= { x: 120, y: 420, valid: true };
    pointer.x = Math.max(0, Math.min(480, pointer.x + (e.key === 'ArrowRight' ? jump : e.key === 'ArrowLeft' ? -jump : 0)));
    pointer.y = Math.max(0, Math.min(640, pointer.y + (e.key === 'ArrowDown' ? jump : e.key === 'ArrowUp' ? -jump : 0)));
    Object.assign(pointer, { valid: game.canDeploy('player', getSelectedCard().id, pointer.x, pointer.y).ok });
  }
  else if (e.key === 'Enter' && selectedIndex !== null && pointer && !/BUTTON|A/.test(e.target.tagName)) { e.preventDefault(); deploy(pointer.x, pointer.y); }
  else if (e.key === 'Escape') cancelSelection();
  else if (e.key.toLowerCase() === 'p' || (e.code === 'Space' && !/BUTTON|A/.test(e.target.tagName))) { e.preventDefault(); togglePause(); }
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  modalResume = false; countingDown = false; updateCountdownUI(); cancelSelection();
  if (replay) { replayPlaying = false; updateReplayUI(); }
  else if (started && !resultShown) { game.pause(); $('pause-overlay').hidden = false; $('pause-button').setAttribute('aria-label', '전투 계속'); saveMatch(); }
});
window.addEventListener('pagehide', saveMatch);

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
$('training-hint-button').addEventListener('click', () => { if (training) { $('training-hint-text').textContent = training.mission.hint; openModal('training-hint-dialog'); } });
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
['deck-button', 'mobile-deck-button'].forEach(id => $(id).addEventListener('click', () => openDeck(false)));
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
  if (replay.done) { replay.reset(); game = replay.game; handSignature = ''; lastLogSignature = ''; lastCrowns = 0; lastRate = 1; lastPhase = 'regulation'; }
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
    lastCrowns = game.state.crowns.player + game.state.crowns.enemy;
    lastRate = game.getElixirMultiplier(); lastPhase = game.state.phase;
    replayPlaying = seekWasPlaying && !replay.done;
    handSignature = ''; lastLogSignature = ''; seeking = false;
    updateReplayUI(); renderHUD();
  } catch { seeking = false; replayPlaying = false; toast('리플레이를 재생할 수 없습니다.'); }
});
$('practice-elixir').addEventListener('click', () => {
  if (!practice || training || replay || resultShown) return;
  game.state.elixir.player = 10; saveMatch(); renderHUD(); tone(720, .1, 'triangle');
});
$('practice-ai').addEventListener('click', () => {
  if (!practice || training || replay || resultShown) return;
  practiceAI = !practiceAI; refreshModeUI(); saveMatch();
});
$('practice-speed').addEventListener('click', () => {
  if (!practice || training || replay || resultShown) return;
  practiceSpeed = practiceSpeed === 1 ? 2 : 1; refreshModeUI(); saveMatch();
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
  if (countingDown && countdownRemaining > 0 && !document.hidden && !document.querySelector('dialog[open]')) {
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
  renderer.draw(game, { selectedCard: getSelectedCard(), pointer, showRanges, reducedMotion, hoveredEntityId, arenaTheme, trainingTarget: training && !resultShown ? training.target : null });
  hudElapsed += delta;
  if (hudElapsed >= .1) { renderHUD(); hudElapsed = 0; }
  requestAnimationFrame(frame);
}

setDifficulty(difficulty, false);
try { if (lastReplay) new ReplayPlayer(lastReplay.replay); } catch { lastReplay = null; storeValue(REPLAY_KEY, null); }
try { if (pendingMatch) { Game.fromSnapshot(pendingMatch.engine); if (pendingMatch.engine.state.phase === 'finished') pendingMatch = null; } } catch { pendingMatch = null; storeValue(MATCH_KEY, null); }
renderDeckSummary(); renderOpponents(); updateSoundButton(); updateIntel('knight');
resetGame(false);
requestAnimationFrame(frame);
