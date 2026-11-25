(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const { Game, HEROES, MODES } = globalThis.BrawlCore;
  const canvas = $('gameCanvas');
  const renderer = new globalThis.BrawlRenderer(canvas);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (_) { return fallback; } };
  const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* Play remains available without storage. */ } };
  const stored = read('brawl-lab-settings-v1', {});
  const isTouch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  const config = { mode: MODES[stored.mode] ? stored.mode : 'gem', hero: HEROES[stored.hero] ? stored.hero : 'ranger', difficulty: ['easy', 'normal', 'hard'].includes(stored.difficulty) ? stored.difficulty : 'normal' };
  const rawRecords = read('brawl-lab-records-v1', {});
  const records = { games: Number.isFinite(rawRecords.games) ? rawRecords.games : 0, wins: Number.isFinite(rawRecords.wins) ? rawRecords.wins : 0 };
  let soundEnabled = stored.sound === true;
  const preferences = { aimGuide: stored.aimGuide !== false, reducedEffects: typeof stored.reducedEffects === 'boolean' ? stored.reducedEffects : matchMedia('(prefers-reduced-motion: reduce)').matches, haptics: stored.haptics === true, coachTips: stored.coachTips !== false, camera: ['overview', 'follow'].includes(stored.camera) ? stored.camera : isTouch ? 'follow' : 'overview' };
  let game, preview, playing = false, paused = false, resultShown = false, helpWasRunning = false, statsWasRunning = false;
  let accumulator = 0, previousTime = performance.now(), countIn = 0, lastEvent = -1, hudTick = 0, fps = 60;
  let mouseDown = false, mouseSeen = false, spaceDown = false, superQueued = false, gadgetQueued = false, tapFire = 0, toastTimer;
  let lastFeedKey = '', lastHaptic = 0;
  let spectatorId = null, lastRoundNumber = 0, lastRoundPhase = '', lastPlayerAlive = true;
  const mobileSticks = {};
  const keys = new Set();
  const pointerAim = { x: 960, y: 400 };
  const pointerScreen = { x: 0, y: 0 };
  const touchMove = { x: 0, y: 0 }, touchAim = { x: 0, y: 0, active: false };
  const stickResets = [];
  const errors = [];
  document.body.classList.toggle('touch', isTouch);
  const ui = {
    gem: { map: 'CRYSTAL GARDEN', format: '3 VS 3 · GEM GRAB', badge: 'GEM GRAB', title: '보석을 모으고.<br>끝까지 지키고.', description: '10개의 보석, 마지막 15초.<br>승리는 가장 잘 지킨 팀의 것.', footer: '중앙 광산을 차지하고, 팀원과 함께 보석을 지키세요.', objective: '보석 10개를 모아 15초 유지', icon: 'gem', number: '01 / 07' },
    showdown: { map: 'DUSTY OUTPOST', format: '8 PLAYERS · SURVIVAL', badge: 'SHOWDOWN', title: '끝까지 살아남은.<br>단 한 명.', description: '성장하고, 숨고, 기회를 잡으세요.<br>좁아지는 전장에서 마지막까지.', footer: '상자를 부수고 파워를 모으세요. 독가스 안쪽으로 이동하세요.', objective: '독가스를 피하고 마지막까지 생존', icon: 'target', number: '02 / 07' },
    ball: { map: 'NEON STADIUM', format: '3 VS 3 · BRAWL BALL', badge: 'BRAWL BALL', title: '길을 열고.<br>골을 넣고.', description: '오른쪽 골문을 향해 전진.<br>두 골이면 충분합니다.', footer: '3분 동점이면 엄폐물이 사라지는 연장전. 다음 골이 승리입니다.', objective: '오른쪽 골문에 두 골 넣기', icon: 'ball', number: '03 / 07' },
    hotzone: { map: 'TWIN SIGNAL', format: '3 VS 3 · HOT ZONE', badge: 'HOT ZONE', title: '자리를 지키고.<br>영역을 완성하고.', description: '두 개의 거점, 함께 쌓는 시간.<br>끝낸 구역에서 다음 구역으로.', footer: 'A와 B를 모두 100%로 채우세요. 양 팀은 같은 구역에서도 함께 점유할 수 있습니다.', objective: 'A·B 구역을 모두 100% 점유', icon: 'zone', number: '04 / 07' },
    heist: { map: 'VAULT DISTRICT', format: '3 VS 3 · HEIST', badge: 'HEIST', title: '금고를 지키고.<br>빈틈을 돌파하고.', description: '공격과 수비, 한 번의 선택.<br>상대 금고를 먼저 파괴하세요.', footer: '금고가 75·50·25%에 닿으면 잠시 보호됩니다. 보호막이 끝나는 순간을 노리세요.', objective: '우리 금고를 지키며 상대 금고 파괴', icon: 'safe', number: '05 / 07' },
    knockout: { map: 'LAST LIGHT', format: '3 VS 3 · KNOCKOUT', badge: 'KNOCKOUT', title: '한 번의 기회.<br>마지막까지 함께.', description: '이번 라운드의 생명은 하나.<br>두 번의 승리로 끝내세요.', footer: '사망하면 아군을 관전하고 다음 라운드에 복귀합니다. 좁아지는 독구름을 주의하세요.', objective: '2라운드 선승 · 라운드 중 부활 없음', icon: 'knockout', number: '06 / 07' },
    bounty: { map: 'STARFALL RIDGE', format: '3 VS 3 · BOUNTY', badge: 'BOUNTY', title: '별을 빼앗고.<br>가치를 지키고.', description: '처치할수록 커지는 현상금.<br>파란 별 하나가 승부를 가릅니다.', footer: '20별을 먼저 모으세요. 2분 종료 동점은 파란 별 소유 팀이 승리합니다.', objective: '20별 선취 · 동점은 파란 별', icon: 'star', number: '07 / 07' },
    training: { map: 'THE TARGET LAB', format: 'FREE PLAY · PRACTICE', badge: 'TRAINING RANGE', title: '쏘고, 익히고.<br>바로 실전에.', description: '세 가지 스킬, 세 가지 표적.<br>나만의 거리를 찾아보세요.', footer: '특수 공격과 가젯을 바로 시험하세요. R로 연습장을 초기화합니다.', objective: 'R 초기화 · Q 가젯 · E 특수 공격', icon: 'target', number: 'FREE PLAY' }
  };

  class Sound {
    constructor() { this.ctx = null; this.lastShot = 0; this.nodes = 0; }
    wake() {
      if (!soundEnabled) return;
      try {
        if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      } catch (_) { soundEnabled = false; updateSoundButton(); }
    }
    tone(freq, end, duration, type = 'sine', volume = .035, delay = 0) {
      if (!soundEnabled || !this.ctx || this.ctx.state !== 'running' || this.nodes > 16) return;
      const t = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator(), gain = this.ctx.createGain();
      osc.type = type; osc.frequency.setValueAtTime(freq, t); osc.frequency.exponentialRampToValueAtTime(Math.max(20, end), t + duration);
      gain.gain.setValueAtTime(.0001, t); gain.gain.exponentialRampToValueAtTime(volume, t + .008); gain.gain.exponentialRampToValueAtTime(.0001, t + duration);
      osc.connect(gain); gain.connect(this.ctx.destination); osc.start(t); osc.stop(t + duration + .02); this.nodes++;
      osc.onended = () => { osc.disconnect(); gain.disconnect(); this.nodes--; };
    }
    play(type, event) {
      if (!soundEnabled) return;
      if (['shot', 'shoot', 'fire'].includes(type)) {
        if (performance.now() - this.lastShot < 95) return;
        this.lastShot = performance.now(); this.tone(230, 65, .09, 'triangle', .025);
      } else if (['gem', 'pickup', 'power', 'collect', 'blueStar', 'bountyScore'].includes(type)) {
        this.tone(750, 1100, .1, 'sine', .04); this.tone(1200, 1500, .11, 'sine', .025, .08);
      } else if (['super', 'dash'].includes(type)) this.tone(160, 760, .25, 'sawtooth', .025);
      else if (type === 'gadget') { this.tone(450, 900, .15, 'sine', .03); this.tone(1100, 700, .1, 'triangle', .02, .09); }
      else if (type === 'overtime') [300, 300, 600].forEach((n, i) => this.tone(n, n, .16, 'triangle', .03, i * .17));
      else if (type === 'safeShield') { this.tone(340, 900, .25, 'sine', .025); this.tone(920, 600, .15, 'triangle', .02, .12); }
      else if (type === 'roundStart') [440, 660, 880].forEach((n, i) => this.tone(n, n, .12, 'sine', .03, i * .12));
      else if (type === 'roundEnd') [330, 440, 550].forEach((n, i) => this.tone(n, n, .17, 'triangle', .03, i * .11));
      else if (['death', 'kill'].includes(type)) this.tone(220, 45, .22, 'triangle', .045);
      else if (['goal', 'win', 'end', 'victory'].includes(type)) [440, 550, 660, 880].forEach((n, i) => this.tone(n, n, .2, 'triangle', .035, i * .1));
      else if (['hit', 'damage', 'explosion'].includes(type)) this.tone(type === 'explosion' ? 120 : 180, 40, .09, 'triangle', .02);
      else if (type === 'start') [330, 440, 660].forEach((n, i) => this.tone(n, n, .13, 'sine', .035, i * .1));
      else if (type === 'select') this.tone(650, 800, .06, 'sine', .02);
    }
  }
  const sound = new Sound();

  function saveSettings() { write('brawl-lab-settings-v1', { ...config, ...preferences, sound: soundEnabled }); }
  function toast(message) {
    $('toast').textContent = message; $('toast').classList.add('visible'); clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 2800);
  }
  function updateSoundButton() {
    const text = soundEnabled ? '소리 끄기' : '소리 켜기';
    $('soundBtn').setAttribute('aria-label', text); $('soundBtn').title = text;
    $('soundBtn').querySelector('use').setAttribute('href', soundEnabled ? '#i-sound' : '#i-mute');
  }
  function updateRecords() { $('recordWins').textContent = records.wins; $('recordGames').textContent = records.games; }
  function updateCameraButton() {
    const follow = preferences.camera === 'follow';
    $('cameraLabel').textContent = follow ? '추적' : '전체';
    $('cameraBtn').setAttribute('aria-pressed', String(follow));
    $('cameraBtn').setAttribute('aria-label', follow ? '전체 전장 보기로 전환' : '캐릭터 추적 보기로 전환');
    $('cameraBtn').title = (follow ? '전체 전장 보기' : '캐릭터 추적 보기') + ' · C';
    $('followCameraCheck').checked = follow;
  }
  function toggleCamera() {
    preferences.camera = preferences.camera === 'follow' ? 'overview' : 'follow';
    updateCameraButton(); saveSettings();
    if (playing) toast(preferences.camera === 'follow' ? '캐릭터 추적 · 미니맵으로 목표를 확인하세요' : '전체 전장 · C로 다시 확대할 수 있어요');
  }
  function refreshPointerAim() {
    if (!mouseSeen) return;
    const point = renderer.screenToWorld(pointerScreen.x, pointerScreen.y);
    pointerAim.x = point.x; pointerAim.y = point.y;
  }
  function updateSelection() {
    document.querySelectorAll('[data-mode]').forEach(el => { const yes = el.dataset.mode === config.mode; el.classList.toggle('selected', yes); el.setAttribute('aria-pressed', String(yes)); });
    document.querySelectorAll('[data-hero]').forEach(el => { const yes = el.dataset.hero === config.hero; el.classList.toggle('selected', yes); el.setAttribute('aria-pressed', String(yes)); });
    document.querySelectorAll('[data-difficulty]').forEach(el => { const yes = el.dataset.difficulty === config.difficulty; el.classList.toggle('selected', yes); el.setAttribute('aria-pressed', String(yes)); });
    const mode = ui[config.mode], hero = HEROES[config.hero];
    $('mapTitle').textContent = mode.map; $('mapFormat').textContent = mode.format; $('modeBadge').textContent = mode.badge;
    $('previewTitle').innerHTML = mode.title; $('previewDescription').innerHTML = mode.description;
    $('mapFooter').textContent = mode.footer; $('mapNumber').textContent = mode.number;
    $('heroSuper').textContent = hero.superName; $('heroDescription').textContent = hero.superDescription || hero.description;
    $('heroGadget').textContent = hero.gadgetName || '가젯'; $('heroGadgetDescription').textContent = hero.gadgetDescription || '';
    $('gadgetCooldownLabel').textContent = `${config.mode === 'training' ? 3 : hero.gadgetCooldown || 12}초`;
    $('difficultyList').querySelectorAll('button').forEach(el => { el.disabled = config.mode === 'training'; });
    $('startBtn').querySelector('span').firstChild.textContent = config.mode === 'training' ? '연습장 입장' : '플레이 시작';
    $('startBtn').querySelector('small').textContent = config.mode === 'training' ? 'FREE PLAY · 스킬을 자유롭게' : 'YOU + BOTS · 바로 입장';
    document.documentElement.dataset.mode = config.mode;
    preview = new Game({ ...config, seed: 48271 });
    // A short simulated opening supplies a representative, then frozen, battle composition.
    for (let i = 0; i < 135; i++) preview.update(1 / 60, { moveX: .8, moveY: -.35, aimX: 900, aimY: 400, fire: i % 45 < 9 });
    saveSettings();
  }
  function clearInput() {
    keys.clear(); mouseDown = false; spaceDown = false; superQueued = false; gadgetQueued = false; tapFire = 0;
    touchMove.x = touchMove.y = 0; touchAim.x = touchAim.y = 0; touchAim.active = false;
    stickResets.forEach(reset => reset());
  }
  function livingAllies() {
    return game ? game.state.actors.filter(a => a.alive && a.team === game.player.team && a.id !== game.player.id) : [];
  }
  function syncMatchFlow() {
    if (!game) return;
    const round = game.state.round, p = game.player;
    if (round && (round.number !== lastRoundNumber || round.phase !== lastRoundPhase || p.alive !== lastPlayerAlive)) clearInput();
    const spectating = game.state.mode === 'knockout' && !p.alive && round && round.phase === 'active' && game.state.status === 'playing';
    const allies = spectating ? livingAllies() : [];
    if (!allies.some(a => a.id === spectatorId)) spectatorId = allies.length ? allies[0].id : null;
    document.body.classList.toggle('spectating', !!spectating);
    document.body.classList.toggle('round-break', !!round && round.phase === 'break' && game.state.status === 'playing');
    lastRoundNumber = round ? round.number : 0; lastRoundPhase = round ? round.phase : ''; lastPlayerAlive = p.alive;
  }
  function cycleSpectator() {
    if (!playing || paused || resultShown || game.state.mode !== 'knockout' || game.player.alive || game.state.round?.phase !== 'active') return;
    const allies = livingAllies();
    if (!allies.length) { spectatorId = null; return; }
    const index = allies.findIndex(a => a.id === spectatorId);
    spectatorId = allies[(index + 1) % allies.length].id;
    updateRoundUI(); sound.play('select'); canvas.focus({ preventScroll: true });
  }
  function controlsAvailable() {
    return playing && !paused && !resultShown && game.player.alive && (!game.state.round || game.state.round.phase === 'active');
  }
  function closeDialogs() { ['pauseDialog', 'resultDialog', 'helpDialog', 'statsDialog'].forEach(id => { if ($(id).open) $(id).close(); }); }
  function showDialog(id) { if (!$(id).open) $(id).showModal(); }
  function startGame() {
    closeDialogs(); clearInput();
    game = new Game({ ...config, seed: (Date.now() ^ Math.floor(performance.now() * 997)) >>> 0 });
    playing = true; paused = false; resultShown = false; helpWasRunning = false; statsWasRunning = false; countIn = config.mode === 'training' ? .5 : 1.8; accumulator = 0; lastEvent = -1; lastFeedKey = '';
    spectatorId = null; lastRoundNumber = 0; lastRoundPhase = ''; lastPlayerAlive = true; syncMatchFlow();
    mouseSeen = false; pointerAim.x = game.player.x + 400; pointerAim.y = game.player.y;
    document.body.classList.add('playing');
    document.body.classList.toggle('training', config.mode === 'training');
    document.body.classList.toggle('objective-mode', ['hotzone', 'heist', 'knockout', 'bounty'].includes(config.mode));
    $('sessionLabel').textContent = `${MODES[config.mode].name} · ${HEROES[config.hero].name}`;
    $('hudMode').textContent = MODES[config.mode].name;
    $('playerName').textContent = HEROES[config.hero].name; $('playerRole').textContent = HEROES[config.hero].role;
    $('playerAvatar').textContent = HEROES[config.hero].name.slice(0, 1);
    $('playerAvatar').style.color = HEROES[config.hero].color || '#9fe7f5';
    $('blueLabel').textContent = config.mode === 'training' ? '누적 피해' : config.mode === 'showdown' ? '생존' : config.mode === 'heist' ? '우리 금고' : config.mode === 'knockout' ? '우리 승수' : config.mode === 'bounty' ? '우리 별' : '우리 팀';
    $('redLabel').textContent = config.mode === 'training' ? '표적 처치' : config.mode === 'showdown' ? '파워' : config.mode === 'heist' ? '상대 금고' : config.mode === 'knockout' ? '상대 승수' : config.mode === 'bounty' ? '상대 별' : '상대 팀';
    $('scoreIconBlue').querySelector('use').setAttribute('href', '#i-' + ui[config.mode].icon);
    $('scoreIconRed').querySelector('use').setAttribute('href', config.mode === 'showdown' ? '#i-bolt' : '#i-' + ui[config.mode].icon);
    $('matchObjective').textContent = ui[config.mode].objective;
    sound.wake(); sound.play('start');
    window.scrollTo({ top: 0, behavior: 'instant' });
    canvas.focus({ preventScroll: true }); updateHud();
    if (isTouch && innerHeight > innerWidth) toast('기기를 가로로 돌리면 전장이 더 넓게 보여요.');
  }
  function returnToLobby() {
    closeDialogs(); playing = false; paused = false; clearInput(); accumulator = 0;
    document.body.classList.remove('playing', 'training', 'objective-mode', 'spectating', 'round-break'); $('sessionLabel').textContent = 'SOLO PLAYER · BOT ARENA';
    spectatorId = null; $('spectatorBar').style.display = 'none'; $('roundPanel').style.display = 'none'; $('objectiveStrip').style.display = 'none';
    $('matchAlert').classList.remove('visible'); $('respawn').style.display = 'none';
    $('coachTip').classList.remove('visible'); $('killFeed').replaceChildren();
    updateSelection(); updateRecords(); $('startBtn').focus({ preventScroll: true });
  }
  function pause() {
    if (!playing || paused || resultShown) return;
    paused = true; clearInput(); showDialog('pauseDialog');
  }
  function resume() {
    if (!playing || resultShown) return;
    closeDialogs(); paused = false; accumulator = 0; previousTime = performance.now(); clearInput(); sound.wake(); canvas.focus({ preventScroll: true });
  }
  function openHelp() {
    helpWasRunning = playing && !paused && !resultShown;
    if (helpWasRunning) { paused = true; clearInput(); }
    showDialog('helpDialog');
  }
  function closeHelp() {
    $('helpDialog').close();
    if (helpWasRunning) { paused = false; accumulator = 0; clearInput(); canvas.focus({ preventScroll: true }); }
    helpWasRunning = false;
  }
  function useGadget() {
    if (!controlsAvailable()) return;
    sound.wake();
    if ((game.player.gadgetCooldown || 0) <= .001) {
      gadgetQueued = true;
      if (isTouch && !touchAim.active) { const a = autoAim(); pointerAim.x = a.x; pointerAim.y = a.y; }
    }
    else toast(`${HEROES[config.hero].gadgetName} · ${Math.ceil(game.player.gadgetCooldown)}초 후 준비`);
  }
  function useSuper() {
    if (!controlsAvailable()) return;
    sound.wake();
    if (game.player.superCharge >= .999) { superQueued = true; if (isTouch && !touchAim.active) { const a = autoAim(); pointerAim.x = a.x; pointerAim.y = a.y; } }
    else toast('적에게 피해를 입히면 특수 공격이 충전돼요.');
  }
  function autoAim() {
    if (typeof game.getAutoAim === 'function') return game.getAutoAim(0);
    const p = game.player;
    if (game.state.ball && game.state.ball.carrierId === p.id) return { x: game.state.width - 5, y: game.state.height / 2 };
    let nearest = null, min = Infinity;
    game.state.actors.forEach(a => { if (!a.alive || a.id === p.id || a.team === p.team || a.hidden) return; const d = (a.x - p.x) ** 2 + (a.y - p.y) ** 2; if (d < min) { min = d; nearest = a; } });
    if (nearest) return { x: nearest.x, y: nearest.y };
    // When no fighter is visible, automatic fire can break a nearby power crate.
    if (config.mode === 'showdown') game.state.walls.forEach(w => { if (!w.destructible || w.hp <= 0) return; const x = w.x + w.w / 2, y = w.y + w.h / 2, d = (x - p.x) ** 2 + (y - p.y) ** 2; if (d < min) { min = d; nearest = { x, y }; } });
    return nearest || { x: p.x + Math.cos(p.angle || 0) * 400, y: p.y + Math.sin(p.angle || 0) * 400 };
  }
  function getInput(dt) {
    if (game.state.mode === 'knockout' && (!game.player.alive || game.state.round?.phase !== 'active')) {
      superQueued = false; gadgetQueued = false; tapFire = 0;
      return { moveX: 0, moveY: 0, fire: false, super: false, gadget: false };
    }
    refreshPointerAim();
    let mx = touchMove.x + (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    let my = touchMove.y + (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
    const n = Math.hypot(mx, my); if (n > 1) { mx /= n; my /= n; }
    let aim = pointerAim;
    const auto = spaceDown || tapFire > 0;
    if (touchAim.active) aim = { x: game.player.x + touchAim.x * 550, y: game.player.y + touchAim.y * 550 };
    else if (auto) aim = autoAim();
    else if (!mouseSeen && !isTouch) aim = { x: game.player.x + 400, y: game.player.y };
    const input = { moveX: mx, moveY: my, aimX: aim.x, aimY: aim.y, fire: mouseDown || auto || touchAim.active, super: superQueued, gadget: gadgetQueued };
    superQueued = false; gadgetQueued = false; tapFire = Math.max(0, tapFire - dt);
    return input;
  }
  function formatTime(seconds) { const n = Math.max(0, Math.ceil(seconds)); return Math.floor(n / 60).toString().padStart(2, '0') + ':' + (n % 60).toString().padStart(2, '0'); }
  function compactNumber(n) { return n >= 10000 ? `${(n / 1000).toFixed(1)}k` : Math.round(n).toLocaleString('ko-KR'); }
  function renderScoreboard(targetId) {
    const s = game.state, table = document.createElement('table'); table.className = 'scoreboard';
    const head = table.createTHead().insertRow();
    for (const text of ['플레이어', 'K / D / A', '전투 피해', '목표 기여']) { const th = document.createElement('th'); th.scope = 'col'; th.textContent = text; head.append(th); }
    const body = table.createTBody();
    const actors = [...s.actors].sort((a, b) => s.mode === 'showdown' ? Number(b.alive) - Number(a.alive) || b.kills - a.kills || a.id - b.id : a.team - b.team || a.id - b.id);
    for (const a of actors) {
      const row = body.insertRow(); row.className = a.team === game.player.team ? 'ally-row' : 'enemy-row';
      if (a.isPlayer) row.classList.add('self-row');
      const cell = row.insertCell(), name = document.createElement('strong'), label = document.createElement('small');
      name.textContent = a.isPlayer ? `나 · ${HEROES[a.hero].name}` : a.name;
      label.textContent = a.isDummy ? '연습 표적' : HEROES[a.hero].name + (a.alive ? '' : ['knockout', 'showdown'].includes(s.mode) ? ' · 탈락' : ' · 대기');
      cell.append(name, label);
      row.insertCell().textContent = `${a.kills || 0} / ${a.deaths || 0} / ${a.assists || 0}`;
      row.insertCell().textContent = Math.round(a.damage || 0).toLocaleString('ko-KR');
      row.insertCell().textContent = s.mode === 'gem' ? `${a.gemsCollected || 0} 회수` : s.mode === 'ball' ? `${a.goals || 0} 골` : s.mode === 'showdown' ? `${a.power || 0} 파워` : s.mode === 'hotzone' ? `${(a.captureTime || 0).toFixed(1)}초 점유` : s.mode === 'heist' ? `${Math.round(a.objectiveDamage || 0).toLocaleString('ko-KR')} 금고` : s.mode === 'bounty' ? `★${a.starsEarned || 0} 획득 / ${a.starsLost || 0} 허용` : s.mode === 'knockout' ? `${a.roundSurvivals || 0}회 승리 생존` : '—';
    }
    $(targetId).replaceChildren(table);
  }
  function openStats() {
    if (!playing || resultShown) return;
    statsWasRunning = !paused;
    paused = true; clearInput(); renderScoreboard('liveScoreboard');
    $('statsTitle').textContent = config.mode === 'training' ? '나의 연습 기록.' : '지금, 전장의 흐름.';
    $('statsSubtitle').textContent = `${MODES[config.mode].name} · ${formatTime(game.state.elapsed)} · 확인하는 동안 일시정지`;
    showDialog('statsDialog');
  }
  function closeStats() {
    $('statsDialog').close();
    if (statsWasRunning && !resultShown) { paused = false; accumulator = 0; clearInput(); canvas.focus({ preventScroll: true }); }
    statsWasRunning = false;
  }
  function updateFeed() {
    const s = game.state;
    const feed = (s.killFeed || []).filter(e => s.elapsed - e.time < 5).slice(-3);
    const key = feed.map(e => `${e.id}:${e.stars || 0}`).join('|'); if (key === lastFeedKey) return;
    lastFeedKey = key;
    const entries = feed.map(e => {
      const el = document.createElement('div'), killer = s.actors.find(a => a.id === e.killerId), victim = s.actors.find(a => a.id === e.victimId);
      el.className = 'feed-entry';
      const left = document.createElement('b'), arrow = document.createElement('i'), right = document.createElement('span');
      left.textContent = killer ? killer.isPlayer ? 'YOU' : killer.name : e.kind === 'poison' ? '독가스' : '환경';
      left.className = killer && killer.team === game.player.team ? 'ally' : 'enemy';
      arrow.textContent = '›'; right.textContent = victim ? victim.isPlayer ? 'YOU' : victim.name : '표적';
      right.className = victim && victim.team === game.player.team ? 'ally' : 'enemy';
      el.append(left, arrow, right);
      if (s.mode === 'bounty' && e.stars > 0) { const stars = document.createElement('small'); stars.className = 'feed-stars'; stars.textContent = `+${e.stars}★`; el.append(stars); }
      return el;
    });
    $('killFeed').replaceChildren(...entries);
  }
  function updateCoach() {
    if (!preferences.coachTips) { $('coachTip').classList.remove('visible'); return; }
    const p = game.player, s = game.state;
    if (!p.alive || s.round?.phase === 'break') { $('coachTip').classList.remove('visible'); return; }
    let hint = '';
    if (s.elapsed < 12 && countIn <= 0) hint = config.mode === 'training' ? 'Q 가젯 · E 특수 공격을 바로 시험해 보세요. R은 연습장 초기화입니다.' : isTouch ? '빈 전장의 왼쪽을 드래그하면 이동, 오른쪽을 드래그하면 조준·사격합니다.' : 'WASD 이동 · Space 자동 조준 · Q 가젯 · E 특수 공격';
    else if (p.alive && p.gems >= 5 && config.mode === 'gem') hint = '보석을 많이 들고 있어요. 아군 뒤에서 퇴로를 확보하세요.';
    else if (s.elapsed < 28 && config.mode === 'hotzone') hint = '적이 같은 구역에 있어도 양 팀의 점유가 함께 쌓여요. 완료한 구역에서는 이동하세요.';
    else if (s.elapsed < 28 && config.mode === 'heist') hint = '금고 보호막이 켜진 동안 재장전하고 수비수를 압박하세요. 목표 피해는 전황에 따로 기록됩니다.';
    else if (s.elapsed < 28 && config.mode === 'knockout') hint = '이번 라운드는 부활하지 않아요. 아군과 사격각을 나누고, 25초부터 좁아지는 독구름을 피하세요.';
    else if (s.elapsed < 28 && config.mode === 'bounty') hint = '처치할수록 내 현상금도 커져요. 높은 현상금을 지키고, 동점일 때는 파란 별을 확보하세요.';
    else if (p.alive && p.hp / p.maxHp < .3 && s.elapsed < 40) hint = '잠시 공격을 멈추고 피해를 피하면 체력이 회복됩니다.';
    $('coachText').textContent = hint; $('coachTip').classList.toggle('visible', !!hint && !paused);
  }
  function updateObjectives() {
    const s = game.state, hotzone = s.mode === 'hotzone', heist = s.mode === 'heist', knockout = s.mode === 'knockout', bounty = s.mode === 'bounty';
    $('objectiveStrip').style.display = hotzone || heist || knockout || bounty ? 'flex' : 'none';
    for (let i = 0; i < 2; i++) {
      const letter = i === 0 ? 'A' : 'B', zone = (s.captureZones || [])[i];
      $('zone' + letter + 'Status').style.display = hotzone ? 'flex' : 'none';
      if (hotzone && zone) {
        $('zone' + letter + 'Blue').textContent = `${Math.floor(clamp(zone.progress[0], 0, 100))}%`;
        $('zone' + letter + 'Red').textContent = `${Math.floor(clamp(zone.progress[1], 0, 100))}%`;
        $('zone' + letter + 'Status').classList.toggle('both-active', zone.occupants[0] > 0 && zone.occupants[1] > 0);
        $('zone' + letter + 'Status').title = `구역 ${letter} · 우리 ${zone.occupants[0]}명 / 상대 ${zone.occupants[1]}명 · 양 팀 독립 점유`;
      }
      const safe = (s.safes || []).find(item => item.team === i), id = i === 0 ? 'safeBlueState' : 'safeRedState';
      $(id).style.display = heist ? 'flex' : 'none';
      if (heist && safe) {
        const label = i === 0 ? '우리' : '상대';
        $(id).textContent = safe.shieldTime > 0 ? `${label} 보호막 ${safe.shieldTime.toFixed(1)}s` : `${label} ${Math.ceil(safe.hp).toLocaleString('ko-KR')} HP`;
        $(id).classList.toggle('shield-active', safe.shieldTime > 0);
      }
    }
    for (const [id, visible] of [['knockoutAliveState', knockout], ['knockoutRoundState', knockout], ['bountyBlueState', bounty], ['bountyValueState', bounty]]) $(id).style.display = visible ? 'flex' : 'none';
    if (knockout && s.round) {
      const alive = [0, 1].map(team => s.actors.filter(a => a.alive && a.team === team).length);
      $('knockoutAliveState').textContent = `생존 ${alive[0]} : ${alive[1]}`;
      $('knockoutRoundState').textContent = `R${s.round.number} · 2선승`;
    }
    if (bounty && s.bounty) {
      const blue = s.bounty.blueStar, team = blue.onGround ? null : blue.team;
      $('bountyBlueState').textContent = `파란 별 · ${team === null ? '전장' : team === game.player.team ? '우리' : '상대'}`;
      $('bountyBlueState').classList.toggle('ally', team === game.player.team);
      $('bountyBlueState').classList.toggle('enemy', team !== null && team !== game.player.team);
      $('bountyValueState').textContent = `내 현상금 ★${game.player.bountyValue || 2}`;
    }
  }
  function updateRoundUI() {
    const s = game.state, round = s.round;
    const inBreak = s.mode === 'knockout' && round && round.phase === 'break' && s.status === 'playing' && !resultShown;
    $('roundPanel').style.display = inBreak ? 'block' : 'none';
    if (inBreak) {
      const texts = {
        roundEyebrow: `ROUND ${round.number} COMPLETE`,
        roundTitle: round.lastWinner === null ? '라운드 무승부' : round.lastWinner === game.player.team ? '라운드 승리!' : '라운드 패배',
        roundSummary: `${s.score[0]} : ${s.score[1]} · ${round.lastReason || '다음 라운드를 준비하세요'}`,
        roundCountdown: `${Math.max(1, Math.ceil(round.breakRemaining))}초 후 다음 라운드`
      };
      for (const [id, value] of Object.entries(texts)) if ($(id).textContent !== value) $(id).textContent = value;
      $('roundPanel').classList.toggle('won', round.lastWinner === game.player.team);
    }
    const target = s.actors.find(a => a.id === spectatorId && a.alive && a.team === game.player.team);
    const watching = s.mode === 'knockout' && !game.player.alive && round?.phase === 'active' && target && s.status === 'playing' && !resultShown;
    $('spectatorBar').style.display = watching ? 'flex' : 'none';
    if (watching) {
      $('spectatorName').textContent = `${target.name} · ${HEROES[target.hero].name}`;
      $('nextSpectatorBtn').disabled = livingAllies().length < 2;
    }
  }
  function updateHud() {
    if (!game) return;
    const s = game.state, p = game.player;
    const roundRemaining = s.round ? s.round.phase === 'break' ? s.round.breakRemaining : s.round.timeLimit - s.round.elapsed : null;
    const remaining = s.round ? Math.min(roundRemaining, s.timeLimit - s.elapsed) : s.timeLimit - s.elapsed;
    $('matchTime').textContent = config.mode === 'training' ? '∞' : formatTime(remaining);
    $('matchTime').style.color = config.mode !== 'training' && (s.overtime || remaining < 30) ? '#ffcb80' : '';
    $('hudMode').textContent = MODES[config.mode].name + (s.round ? ` · R${s.round.number}` : s.overtime ? ' · 연장전' : '');
    $('matchObjective').textContent = s.overtime ? '다음 골을 넣는 팀이 승리합니다' : s.round && s.timeLimit - s.elapsed < roundRemaining ? '경기 제한 · 라운드 승수로 판정' : ui[config.mode].objective;
    const percent = n => config.mode === 'hotzone' ? `${Math.floor(clamp(n, 0, 100))}%` : `${Math.ceil(clamp(n, 0, 100) * 10) / 10}%`;
    $('blueScore').textContent = config.mode === 'training' ? compactNumber(p.damage || 0) : config.mode === 'showdown' ? s.actors.filter(a => a.alive).length : ['hotzone', 'heist'].includes(config.mode) ? percent(s.score[0]) : s.score[0];
    $('redScore').textContent = config.mode === 'training' ? p.kills || 0 : config.mode === 'showdown' ? p.power || 0 : ['hotzone', 'heist'].includes(config.mode) ? percent(s.score[1]) : s.score[1];
    updateObjectives(); updateRoundUI();
    $('hpText').textContent = `${Math.max(0, Math.ceil(p.hp))} / ${p.maxHp}`;
    $('healthFill').style.width = `${clamp(p.hp / p.maxHp, 0, 1) * 100}%`;
    $('healthFill').style.background = p.hp / p.maxHp < .3 ? '#f28a95' : '#79d3ae';
    document.querySelectorAll('.ammo-slots i').forEach((el, i) => el.style.setProperty('--fill', `${clamp(p.ammo - i, 0, 1) * 100}%`));
    const charge = Math.floor(clamp(p.superCharge, 0, 1) * 100);
    const ready = p.superCharge >= .999;
    $('superBtn').style.setProperty('--charge', ready ? 100 : charge); $('superBtn').classList.toggle('ready', ready);
    $('superPercent').textContent = ready ? 'READY' : `${charge}%`;
    $('superBtn').setAttribute('aria-label', `${HEROES[config.hero].superName} ${charge}% 충전`);
    $('superBtn').disabled = !p.alive || !!s.round && s.round.phase !== 'active';
    const cooldown = Math.max(0, p.gadgetCooldown || 0), gadgetReady = cooldown <= .001;
    const fullCooldown = config.mode === 'training' ? 3 : HEROES[config.hero].gadgetCooldown || 12;
    $('gadgetBtn').style.setProperty('--charge', gadgetReady ? 100 : (1 - clamp(cooldown / fullCooldown, 0, 1)) * 100);
    $('gadgetBtn').classList.toggle('ready', gadgetReady && p.alive);
    $('gadgetTime').textContent = gadgetReady ? 'READY' : `${Math.ceil(cooldown)}s`;
    $('gadgetBtn').setAttribute('aria-label', `${HEROES[config.hero].gadgetName || '가젯'} ${gadgetReady ? '사용 가능' : Math.ceil(cooldown) + '초 대기'}`);
    $('gadgetBtn').disabled = !p.alive || !!s.round && s.round.phase !== 'active';
    $('respawn').style.display = !p.alive && !['showdown', 'knockout'].includes(config.mode) && s.status !== 'ended' ? 'block' : 'none';
    $('respawnTime').textContent = Math.max(1, Math.ceil(p.respawnIn || 0));
    let alert = '', danger = false;
    if (countIn > 0) alert = countIn > .8 ? '준비하세요!' : 'GO!';
    else if (s.round && (s.round.phase === 'break' || !p.alive)) alert = '';
    else if (s.overtime && s.elapsed < 184) alert = '연장전! 다음 골을 넣는 팀이 승리';
    else if (s.goalPause > 0) alert = 'GOAL! · 중앙에서 다시 시작합니다';
    else if (s.countdown) { alert = `${s.countdown.team === p.team ? '우리 팀' : '상대 팀'} 보석 유지 · ${Math.ceil(s.countdown.remaining)}초`; danger = s.countdown.team !== p.team; }
    else if (s.zone && Math.hypot(p.x - s.zone.x, p.y - s.zone.y) > s.zone.r && p.alive) { alert = '독가스! 안전 구역으로 이동하세요'; danger = true; }
    else if (config.mode === 'heist' && (s.safes || []).some(safe => safe.team === p.team && safe.lastHitTime >= 0 && s.elapsed - safe.lastHitTime < 1.2)) { alert = '우리 금고가 공격받고 있어요!'; danger = true; }
    else if (s.elapsed < 5) alert = ui[config.mode].objective;
    $('matchAlert').textContent = alert; $('matchAlert').classList.toggle('visible', !!alert); $('matchAlert').classList.toggle('danger', danger);
    updateFeed(); updateCoach();
  }
  function finishGame() {
    if (resultShown) return;
    resultShown = true; paused = true; clearInput();
    const s = game.state, p = game.player, r = s.result || {}, won = r.won === true || (r.won == null && r.winner === p.team);
    if (config.mode !== 'training') { records.games++; if (won) records.wins++; write('brawl-lab-records-v1', records); updateRecords(); }
    $('resultEyebrow').textContent = won ? 'VICTORY IS YOURS' : r.winner == null && config.mode !== 'showdown' ? 'EVENLY MATCHED' : 'ONE MORE ROUND?';
    $('resultTitle').textContent = r.title || (won ? '멋진 승리!' : '다음 판은 우리 차례.');
    $('resultTitle').style.color = won ? '#ffe39a' : '#d8c7ff';
    $('resultReason').textContent = r.reason || (config.mode === 'showdown' ? '끝까지 집중한 한 판이었어요.' : `${s.score[0]} : ${s.score[1]} · ${MODES[config.mode].name}`);
    $('resultKills').textContent = p.kills || 0; $('resultDamage').textContent = Math.round(p.damage || 0).toLocaleString('ko-KR'); $('resultTime').textContent = formatTime(s.elapsed);
    renderScoreboard('resultScoreboard'); $('coachTip').classList.remove('visible');
    sound.play(won ? 'win' : 'death'); showDialog('resultDialog');
  }
  function events() {
    for (const e of game.state.events || []) {
      const eventNumber = typeof e.id === 'number' ? e.id : Number(String(e.id).replace(/^\D+/, ''));
      if (!Number.isFinite(eventNumber) || eventNumber <= lastEvent) continue;
      lastEvent = eventNumber;
      if (e.type === 'win' || e.type === 'end') continue;
      if (preferences.haptics && navigator.vibrate && isTouch && e.type === 'hit' && e.team === game.player.team && performance.now() - lastHaptic > 160 && Math.hypot(e.x - game.player.x, e.y - game.player.y) < game.player.r + 1) { navigator.vibrate(12); lastHaptic = performance.now(); }
      if (!['shot', 'shoot', 'fire'].includes(e.type) || e.ownerId === 0 || e.actorId === 0 || Math.hypot((e.x || 0) - game.player.x, (e.y || 0) - game.player.y) < 400) sound.play(e.type, e);
    }
  }

  document.querySelectorAll('[data-mode]').forEach(el => el.addEventListener('click', () => { config.mode = el.dataset.mode; updateSelection(); sound.wake(); sound.play('select'); }));
  document.querySelectorAll('[data-hero]').forEach(el => el.addEventListener('click', () => { config.hero = el.dataset.hero; updateSelection(); sound.wake(); sound.play('select'); }));
  document.querySelectorAll('[data-difficulty]').forEach(el => el.addEventListener('click', () => { config.difficulty = el.dataset.difficulty; updateSelection(); }));
  $('startBtn').addEventListener('click', startGame); $('againBtn').addEventListener('click', startGame); $('restartBtn').addEventListener('click', startGame);
  $('lobbyBtn').addEventListener('click', returnToLobby); $('changeBtn').addEventListener('click', returnToLobby); $('resumeBtn').addEventListener('click', resume); $('pauseBtn').addEventListener('click', pause);
  $('helpBtn').addEventListener('click', openHelp); $('gotItBtn').addEventListener('click', closeHelp); $('closeHelpBtn').addEventListener('click', closeHelp);
  $('statsBtn').addEventListener('click', openStats); $('closeStatsBtn').addEventListener('click', closeStats); $('continueStatsBtn').addEventListener('click', closeStats);
  $('practiceResetBtn').addEventListener('click', () => { if (playing && config.mode === 'training') startGame(); });
  $('cameraBtn').addEventListener('click', () => { toggleCamera(); if (playing && !paused) canvas.focus({ preventScroll: true }); });
  $('nextSpectatorBtn').addEventListener('click', cycleSpectator);
  $('followCameraCheck').addEventListener('change', () => { preferences.camera = $('followCameraCheck').checked ? 'follow' : 'overview'; updateCameraButton(); saveSettings(); });
  $('closeCoachBtn').addEventListener('click', () => { preferences.coachTips = false; $('coachTipsCheck').checked = false; $('coachTip').classList.remove('visible'); saveSettings(); canvas.focus({ preventScroll: true }); });
  $('brandLink').addEventListener('click', e => { e.preventDefault(); if (playing) pause(); else window.scrollTo({ top: 0, behavior: 'smooth' }); });
  $('soundBtn').addEventListener('click', () => { soundEnabled = !soundEnabled; updateSoundButton(); saveSettings(); sound.wake(); sound.play('select'); });
  $('fullscreenBtn').addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else toast('이 브라우저에서는 기기를 가로로 돌려 플레이해 주세요.');
    } catch (_) { toast('전체 화면을 사용할 수 없어요. 브라우저 화면에서 계속 플레이할 수 있습니다.'); }
  });
  $('superBtn').addEventListener('pointerdown', e => { e.preventDefault(); useSuper(); });
  $('superBtn').addEventListener('click', e => { if (e.detail === 0) useSuper(); });
  $('gadgetBtn').addEventListener('pointerdown', e => { e.preventDefault(); useGadget(); });
  $('gadgetBtn').addEventListener('click', e => { if (e.detail === 0) useGadget(); });
  $('pauseDialog').addEventListener('cancel', e => { e.preventDefault(); resume(); });
  $('helpDialog').addEventListener('cancel', e => { e.preventDefault(); closeHelp(); });
  $('resultDialog').addEventListener('cancel', e => { e.preventDefault(); returnToLobby(); });
  $('statsDialog').addEventListener('cancel', e => { e.preventDefault(); closeStats(); });
  for (const [id, property] of [['aimGuideCheck', 'aimGuide'], ['reducedEffectsCheck', 'reducedEffects'], ['hapticsCheck', 'haptics'], ['coachTipsCheck', 'coachTips']]) {
    $(id).checked = preferences[property];
    $(id).addEventListener('change', () => { preferences[property] = $(id).checked; saveSettings(); });
  }
  if (!navigator.vibrate) $('hapticsCheck').disabled = true;

  window.addEventListener('keydown', e => {
    if (e.code === 'Escape') { if (playing && !paused) { e.preventDefault(); pause(); } return; }
    if (e.code === 'KeyP' && playing && !$('helpDialog').open && !$('statsDialog').open && !resultShown) { e.preventDefault(); if (!e.repeat) paused ? resume() : pause(); return; }
    if (e.code === 'KeyT' && playing && !$('helpDialog').open && !$('pauseDialog').open && !resultShown) { e.preventDefault(); if (!e.repeat) $('statsDialog').open ? closeStats() : openStats(); return; }
    if (e.code === 'KeyR' && playing && !paused && config.mode === 'training') { e.preventDefault(); if (!e.repeat) startGame(); return; }
    if (e.code === 'KeyC' && playing && !paused) { e.preventDefault(); if (!e.repeat) toggleCamera(); return; }
    if (e.code === 'Tab' && playing && !paused && !resultShown && config.mode === 'knockout' && !game.player.alive) { e.preventDefault(); if (!e.repeat) cycleSpectator(); return; }
    if (!playing || paused || resultShown) return;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyQ', 'ShiftLeft', 'ShiftRight'].includes(e.code)) e.preventDefault();
    keys.add(e.code);
    if (e.code === 'Space') spaceDown = true;
    if (e.code === 'KeyE' && !e.repeat) useSuper();
    if (['KeyQ', 'ShiftLeft', 'ShiftRight'].includes(e.code) && !e.repeat) useGadget();
    sound.wake();
  });
  window.addEventListener('keyup', e => { keys.delete(e.code); if (e.code === 'Space') { spaceDown = false; if (playing) e.preventDefault(); } });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') { mobileSticks.move.move(e); mobileSticks.aim.move(e); return; }
    pointerScreen.x = e.clientX; pointerScreen.y = e.clientY; mouseSeen = true; refreshPointerAim();
  });
  canvas.addEventListener('pointerdown', e => {
    if (!controlsAvailable()) return;
    if (e.pointerType === 'touch') {
      const rect = canvas.getBoundingClientRect();
      const side = e.clientX < rect.left + rect.width * .5 ? 'move' : 'aim';
      mobileSticks[side].begin(e, canvas, true); return;
    }
    e.preventDefault(); canvas.focus({ preventScroll: true }); sound.wake();
    pointerScreen.x = e.clientX; pointerScreen.y = e.clientY; mouseSeen = true; refreshPointerAim();
    if (e.button === 0) { mouseDown = true; canvas.setPointerCapture(e.pointerId); }
    if (e.button === 2) useSuper();
  });
  window.addEventListener('pointerup', e => { if (e.button === 0 && e.pointerType !== 'touch') mouseDown = false; });
  canvas.addEventListener('pointerup', e => { if (e.pointerType === 'touch') { mobileSticks.move.end(e); mobileSticks.aim.end(e); } });
  canvas.addEventListener('pointercancel', e => { mouseDown = false; mobileSticks.move.cancel(e); mobileSticks.aim.cancel(e); });
  canvas.addEventListener('lostpointercapture', e => { if (e.pointerType !== 'touch') mouseDown = false; });

  function bindStick(id, kind) {
    const zone = $(id), knob = zone.querySelector('.stick-knob');
    let pointerId = null, originX = 0, originY = 0, started = 0, maxTravel = 0, radius = 36;
    const reset = () => {
      pointerId = null; knob.style.transform = ''; zone.classList.remove('active');
      for (const key of ['left', 'top', 'right', 'bottom']) zone.style[key] = '';
      if (kind === 'move') touchMove.x = touchMove.y = 0; else { touchAim.active = false; touchAim.x = touchAim.y = 0; }
    };
    stickResets.push(reset);
    const move = e => {
      if (e.pointerId !== pointerId) return;
      let dx = e.clientX - originX, dy = e.clientY - originY; const len = Math.hypot(dx, dy); maxTravel = Math.max(maxTravel, len);
      if (len > radius) { dx *= radius / len; dy *= radius / len; }
      knob.style.transform = `translate(${dx}px,${dy}px)`;
      if (kind === 'move') { touchMove.x = dx / radius; touchMove.y = dy / radius; }
      else { touchAim.x = dx / radius; touchAim.y = dy / radius; touchAim.active = len > 8; }
    };
    const begin = (e, capture = zone, floating = false) => {
      if (!controlsAvailable() || pointerId !== null) return;
      e.preventDefault(); document.body.classList.add('touch');
      pointerId = e.pointerId; originX = e.clientX; originY = e.clientY; started = performance.now(); maxTravel = 0;
      if (floating) {
        const arenaRect = $('arena').getBoundingClientRect(), zoneRect = zone.getBoundingClientRect();
        const zw = zoneRect.width || 96, zh = zoneRect.height || 96;
        zone.style.left = `${e.clientX - arenaRect.left - zw / 2}px`;
        zone.style.top = `${e.clientY - arenaRect.top - zh / 2}px`; zone.style.bottom = 'auto'; zone.style.right = 'auto';
      }
      radius = Math.max(20, (zone.querySelector('.stick-base').getBoundingClientRect().width || 72) * .43);
      try { capture.setPointerCapture(e.pointerId); } catch (_) {}
      zone.classList.add('active'); sound.wake();
    };
    const end = e => { if (e.pointerId !== pointerId) return; if (kind === 'aim' && maxTravel < 12 && performance.now() - started < 350) tapFire = .12; reset(); };
    const cancel = e => { if (e.pointerId === pointerId) reset(); };
    zone.addEventListener('pointerdown', e => { e.stopPropagation(); begin(e); });
    zone.addEventListener('pointermove', move);
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', cancel);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', cancel);
    return { begin, move, end, cancel };
  }
  mobileSticks.move = bindStick('moveZone', 'move'); mobileSticks.aim = bindStick('aimZone', 'aim');
  window.addEventListener('blur', () => { clearInput(); if (playing && !paused) pause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && playing && !paused) pause(); previousTime = performance.now(); accumulator = 0; });
  window.addEventListener('error', e => { errors.push(String(e.message)); if (errors.length > 5) errors.shift(); });

  function frame(now) {
    const dt = clamp((now - previousTime) / 1000, 0, .1); previousTime = now;
    if (dt > 0) fps = fps * .95 + Math.min(120, 1 / dt) * .05;
    try {
      if (playing && !paused) {
        syncMatchFlow();
        if (countIn > 0) countIn = Math.max(0, countIn - dt);
        else {
          accumulator += dt;
          while (accumulator >= 1 / 60) {
            game.update(1 / 60, getInput(1 / 60)); syncMatchFlow(); accumulator -= 1 / 60;
            if (game.state.status === 'ended') { finishGame(); accumulator = 0; break; }
          }
          events();
        }
        hudTick += dt; if (hudTick > .05) { updateHud(); hudTick = 0; }
      }
      const state = playing ? game.state : preview.state;
      refreshPointerAim();
      const aim = playing && (spaceDown || tapFire > 0) ? autoAim() : touchAim.active && playing ? { x: game.player.x + touchAim.x * 550, y: game.player.y + touchAim.y * 550 } : pointerAim;
      renderer.render(state, { aimX: aim.x, aimY: aim.y, showAim: preferences.aimGuide && playing && !paused && game.player.alive && (!state.round || state.round.phase === 'active') && (mouseSeen || touchAim.active || spaceDown), time: now / 1000, menu: !playing, reducedEffects: preferences.reducedEffects, camera: preferences.camera, focusId: playing ? spectatorId : null });
    } catch (err) {
      paused = true; if (!errors.includes(err.message)) { errors.push(err.message); console.error('Brawl Lab:', err); toast('화면 처리 중 문제가 발생했습니다. 새로고침해 다시 시작해 주세요.'); }
    }
    requestAnimationFrame(frame);
  }
  // Read-only diagnostics are useful when checking an embedded or mobile browser.
  globalThis.BrawlLab = Object.freeze({ version: '4.0.0', snapshot: () => {
    const s = (playing ? game : preview).state, p = (playing ? game : preview).player;
    return { mode: s.mode, hero: config.hero, difficulty: config.difficulty, camera: preferences.camera, spectatorId, playing, paused, countIn, status: s.status, elapsed: s.elapsed, overtime: !!s.overtime, score: [...s.score], actorCount: s.actors.length, projectileCount: s.projectiles.length, fieldCount: (s.fields || []).length,
      round: s.round ? { ...s.round, history: s.round.history.map(item => ({ ...item })) } : null,
      bounty: s.bounty ? { target: s.bounty.target, blueStar: { ...s.bounty.blueStar } } : null,
      captureZones: (s.captureZones || []).map(z => ({ id: z.id, progress: [...z.progress], occupants: [...z.occupants] })), safes: (s.safes || []).map(o => ({ team: o.team, hp: o.hp, maxHp: o.maxHp, shieldTime: o.shieldTime })), player: { x: p.x, y: p.y, hp: p.hp, ammo: p.ammo, superCharge: p.superCharge, gadgetCooldown: p.gadgetCooldown, shieldTime: p.shieldTime, alive: p.alive, kills: p.kills, damage: p.damage, objectiveDamage: p.objectiveDamage || 0, captureTime: p.captureTime || 0, bountyValue: p.bountyValue || 2, starsEarned: p.starsEarned || 0, starsLost: p.starsLost || 0, roundSurvivals: p.roundSurvivals || 0, gems: p.gems, power: p.power }, result: s.result ? { ...s.result } : null, fps: Math.round(fps), errors: [...errors] };
  } });
  updateSelection(); updateRecords(); updateSoundButton(); updateCameraButton(); requestAnimationFrame(frame);
})();
