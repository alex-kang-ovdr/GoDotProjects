/* Nexus Front — browser input, UI and fixed-step game loop. No dependencies. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const all = selector => [...document.querySelectorAll(selector)];
  if (!globalThis.NexusGame || !globalThis.NexusRenderer || !globalThis.NexusHistory || !globalThis.NexusCheckpoint || !globalThis.NexusCoach || !globalThis.NexusControls) {
    $('load-error').hidden = false;
    return;
  }
  const { Game, HEROES, ITEMS, MAP, normalizeMapScale } = globalThis.NexusGame;
  const { Renderer } = globalThis.NexusRenderer;
  const History = globalThis.NexusHistory;
  const Checkpoint = globalThis.NexusCheckpoint;
  const normalizeSpeed = Checkpoint.normalizeSpeed;
  const Coach = globalThis.NexusCoach;
  const aimGesture = new globalThis.NexusControls.AimGesture();
  let aimCapture = null;
  const suppressedSkillClicks = new WeakMap();
  const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const timeLabel = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  const int = value => Math.floor(Number(value) || 0).toLocaleString('ko-KR');
  const coarse = () => matchMedia('(pointer: coarse), (max-width: 700px)').matches;
  const keyOf = event => /^Key[A-Z]$/.test(event.code) ? event.code.slice(3).toLowerCase() : /^Digit[0-9]$/.test(event.code) ? event.code.slice(5) : event.key.toLowerCase();
  const readStored = (key, fallback) => { try { const value = JSON.parse(localStorage.getItem(key) || 'null'); return value && typeof value === 'object' ? value : fallback; } catch (_) { return fallback; } };
  const prefs = readStored('nexus-front-prefs', {});
  let matchHistory = History.read();
  let savedMatch = Checkpoint.read(), journey = null, guidance = null;
  let nextSaveAt = 8, lastSaveAt = null, saveError = '', saveWarningShown = false;
  const starterByHero = prefs.starters && typeof prefs.starters === 'object' ? prefs.starters : {};
  let currentRecord = null, viewedRecord = null, reportFromHistory = false, renderedRecapAt = null;
  let heroId = HEROES.some(h => h.id === prefs.hero) ? prefs.hero : 'mage';
  let difficulty = prefs.difficulty === 'easy' ? 'easy' : 'normal';
  let mapScale = normalizeMapScale(prefs.mapScale);
  let soundEnabled = prefs.sound !== false;
  let attackRangeVisible = prefs.attackRange === true;
  let audioContext = null;
  let game = new Game({ hero: heroId, difficulty, mapScale, seed: 7231 });
  const canvas = $('battlefield');
  const renderer = new Renderer(canvas, game);
  let activeModal = null, modalWasPaused = false, selectedAbility = null, selectedCommand = null;
  let selectedInventory = -1;
  let selectedTargetId = null, speed = normalizeSpeed(prefs.speed), lastFrame = 0, accumulator = 0, nextUI = 0, nextMap = 0;
  let ended = false, frameFailed = false, tooltipSlot = null, scoreboardHeld = false;
  let joystickId = null, joyVector = { x: 0, y: 0 }, aim = { x: 800, y: 800 };
  let pointerScreen = { x: 0, y: 0 };
  let pointerInside = false, userMessages = [], seenEvents = new Set();
  const keys = new Set();
  const heroIcons = { mage: '✦', warrior: '⬡', ranger: '➶' };
  const extras = {
    d: { name: '점멸', description: '조준한 방향으로 즉시 짧은 거리를 이동합니다.', cooldown: 32, cost: 0, target: 'dash', range: 300, radius: 24 },
    f: { name: '회복', description: '자신의 체력을 즉시 회복합니다.', cooldown: 28, cost: 0, target: 'self', range: 0 },
    ward: { name: '시야 와드', description: '주변의 시야를 확보하는 와드를 설치합니다.', cooldown: 22, cost: 0, target: 'ground', range: 450, radius: 28 }
  };
  const buttons = Object.fromEntries(all('[data-skill]').map(button => [button.dataset.skill, button]));
  const ui = Object.fromEntries(['blue-score','red-score','clock','level','player-name','kda','health-fill','health-text','mana-fill','mana-text','xp-fill','gold','shop-gold','shop-location','respawn-banner','respawn-seconds','recall-banner','recall-progress','target-panel','target-kind','target-name','target-lock','target-fill','target-hp','objective-title','objective-sub','ward-label','inventory-count'].map(id => [id, $(id)]));
  function savePrefs() {
    try { localStorage.setItem('nexus-front-prefs', JSON.stringify({ hero: heroId, difficulty, mapScale, speed, sound: soundEnabled, starters: starterByHero, attackRange: attackRangeVisible })); } catch (_) { /* Private browsing is supported. */ }
  }
  function currentMap() { return game.map || MAP; }
  function renderMatchSettings() {
    all('[data-map-scale]').forEach(button => {
      const selected = Number(button.dataset.mapScale) === mapScale;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', selected);
    });
    for (const id of ['lobby-speed-choice', 'speed-button', 'pause-speed-choice']) $(id).value = String(speed);
    $('map-scale-label').textContent = `전장 · ${mapScale}배`;
    $('pause-map-size').textContent = `${mapScale}배 맵 · ${int(currentMap().width)} × ${int(currentMap().height)}`;
  }
  function setGameSpeed(value, announce = false) {
    speed = normalizeSpeed(Number(value));
    // Apply the newly selected rate only to wall time after this choice.
    lastFrame = performance.now();
    renderMatchSettings(); savePrefs();
    if (game.started && !game.over) {
      persistMatch();
      if (announce) notify(`진행 속도 ${speed}배 · 전투와 경기 시간이 함께 조절됩니다.`, 'info');
    }
  }
  function activateAudio() {
    if (!soundEnabled) return;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (Audio && !audioContext) audioContext = new Audio();
      if (audioContext?.state === 'suspended') audioContext.resume().catch(() => {});
    } catch (_) { /* Audio is optional. */ }
  }
  function tone(frequency = 440, duration = 0.09, gain = 0.028, type = 'sine') {
    if (!soundEnabled || !audioContext || audioContext.state !== 'running') return;
    try {
      const oscillator = audioContext.createOscillator(), envelope = audioContext.createGain();
      const now = audioContext.currentTime;
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, now);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.72, now + duration);
      envelope.gain.setValueAtTime(gain, now);
      envelope.gain.exponentialRampToValueAtTime(0.001, now + duration);
      oscillator.connect(envelope); envelope.connect(audioContext.destination);
      oscillator.start(now); oscillator.stop(now + duration);
    } catch (_) { /* Browser audio interruptions must not interrupt a match. */ }
  }
  function heroArt(id, color) {
    const common = `<ellipse cx="140" cy="164" rx="77" ry="15" fill="${color}" opacity=".12"/><circle cx="140" cy="89" r="67" fill="none" stroke="${color}" stroke-opacity=".16"/><path d="M53 89H77M203 89H227M140 2V25M140 153V176" stroke="${color}" stroke-opacity=".3"/>`;
    const figures = {
      mage: `<path d="M140 37L100 73 116 92 90 153 140 137 190 153 164 92 180 73Z" fill="#19383e" stroke="${color}" stroke-width="2"/><path d="M140 37L123 78 140 104 157 78Z" fill="${color}" opacity=".78"/><path d="M120 86L140 102 160 86 150 122H130Z" fill="#0b1d25"/><path d="M102 90L70 117 82 130 119 113M178 90L204 113 192 125 161 113" fill="#234c55" stroke="${color}" stroke-width="1.4"/><path d="M202 59V146" stroke="#a5d9d9" stroke-width="4"/><path d="M202 33L189 55 202 76 215 55Z" fill="${color}"/><circle cx="75" cy="111" r="13" fill="${color}" opacity=".15"/><path d="M75 95L79 107 91 111 79 115 75 127 71 115 59 111 71 107Z" fill="${color}"/>`,
      warrior: `<path d="M115 54L140 41 165 54 161 82 140 97 119 82Z" fill="#5a4934" stroke="${color}" stroke-width="2"/><path d="M124 57L140 52 156 57V69L140 77 124 69Z" fill="#1c2529"/><path d="M122 61H158M140 53V78" stroke="${color}" stroke-width="3"/><path d="M100 92L140 83 180 92 171 128 158 137 156 161 142 161 140 135 136 161 120 161 120 135 109 126Z" fill="#3c4140" stroke="${color}" stroke-width="2"/><path d="M98 85L78 96 85 122 111 115 116 96Z" fill="#695334" stroke="${color}" stroke-width="2"/><path d="M172 85L192 96 185 119 165 113 162 96Z" fill="#695334" stroke="${color}" stroke-width="2"/><path d="M193 39L204 56 196 120 186 120 186 56Z" fill="#d6d7b5"/><path d="M178 119H205M191 121V143" stroke="${color}" stroke-width="5"/><path d="M79 101L107 109 103 146 86 160 71 139Z" fill="#2c3d3b" stroke="${color}" stroke-width="2.5"/><path d="M89 113V144M80 126H99" stroke="${color}" stroke-width="2"/>`,
      ranger: `<path d="M140 41L114 62 115 87 140 101 165 87 166 62Z" fill="#264744" stroke="${color}" stroke-width="2"/><path d="M121 66L140 61 158 66 150 82 130 82Z" fill="#0e2828"/><path d="M126 69H133M147 69H154" stroke="${color}" stroke-width="2.5"/><path d="M114 92L140 85 164 92 158 124 150 135 161 158 145 165 133 132 124 162 108 157 118 125Z" fill="#285148" stroke="${color}" stroke-width="1.8"/><path d="M115 97L88 108 83 100 103 85M163 95L187 108 193 98 174 85" fill="#3f6c5b" stroke="${color}" stroke-width="2"/><path d="M194 48Q229 101 194 155L187 147Q213 102 187 57Z" fill="#5d7756" stroke="${color}" stroke-width="2"/><path d="M194 49L174 103 194 155M140 103H222M214 98L224 103 214 108" fill="none" stroke="#d1d7ae" stroke-width="1.8"/><path d="M112 49L101 38 105 103" stroke="#a6ad8c" stroke-width="3"/>`
    };
    return `<svg viewBox="0 0 280 190" aria-hidden="true">${common}${figures[id] || figures.mage}</svg>`;
  }
  function currentHero() { return HEROES.find(hero => hero.id === game.player.hero) || HEROES[0]; }
  function skillMeta(slot) { return ['q','w','e','r'].includes(slot) && game.getSkillInfo ? game.getSkillInfo(slot) : currentHero().skills?.[slot] || extras[slot]; }
  function renderHeroCards() {
    $('hero-cards').innerHTML = HEROES.map(hero => `<button class="hero-card ${hero.id === heroId ? 'selected' : ''}" data-hero="${esc(hero.id)}" style="--card-color:${esc(hero.color)}" aria-pressed="${hero.id === heroId}"><span class="selection-dot"></span><span class="role-tag">${esc(hero.role)}</span><div class="hero-illustration">${heroArt(hero.id, hero.color)}</div><span class="hero-title"><strong>${esc(hero.name)}</strong><small>${esc(hero.title)}</small></span><p class="hero-description">${esc(hero.description)}</p></button>`).join('');
    all('[data-hero]').forEach(button => button.addEventListener('click', () => {
      heroId = button.dataset.hero;
      savePrefs(); resetGame(false); activateAudio(); tone(390);
    }));
    all('[data-difficulty]').forEach(button => {
      const selected = button.dataset.difficulty === difficulty;
      button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', selected);
    });
  }
  function syncHeroHUD() {
    const hero = currentHero();
    ui['player-name'].textContent = hero.name;
    $('hud-avatar').textContent = heroIcons[hero.id] || '✦';
    $('hud-portrait').style.setProperty('--hero-color', hero.color);
    for (const slot of ['q','w','e','r']) {
      const meta = hero.skills[slot], button = buttons[slot];
      button.querySelector('.skill-art').textContent = meta.icon || {q:'✦',w:'◈',e:'➶',r:'✺'}[slot];
      button.querySelector('.skill-label').textContent = meta.name;
      button.setAttribute('aria-label', `${slot.toUpperCase()} ${meta.name}`);
    }
  }
  function clearInput() {
    if (aimGesture.active) setAim(null);
    const heldJoystick = joystickId;
    keys.clear(); joyVector = { x: 0, y: 0 }; joystickId = null;
    $('joystick-knob').style.transform = 'translate(-50%, -50%)';
    if (heldJoystick !== null && $('joystick').hasPointerCapture(heldJoystick)) $('joystick').releasePointerCapture(heldJoystick);
    game.setInputVector(0, 0);
  }
  function setAim(slot) {
    cancelTouchAim();
    selectedCommand = null;
    selectedAbility = slot;
    $('aim-cancel').hidden = !slot;
    if (slot) $('aim-text').textContent = `${skillMeta(slot)?.name || '스킬'} · 전장을 클릭해 시전`;
    Object.entries(buttons).forEach(([key, button]) => button.classList.toggle('armed', key === slot));
    $('attack-move-button').classList.remove('active');
    $('attack-move-button').setAttribute('aria-pressed', false);
  }
  function cancelTouchAim() {
    const captured = aimCapture;
    aimCapture = null;
    aimGesture.cancel();
    $('touch-aim-overlay').hidden = true;
    $('app').classList.remove('touch-aiming');
    if (captured) {
      suppressedSkillClicks.set(captured.button, performance.now() + 700);
      if (captured.button.hasPointerCapture(captured.pointerId)) captured.button.releasePointerCapture(captured.pointerId);
    }
  }
  function overAimCancel(event) {
    const rect = $('touch-aim-cancel').getBoundingClientRect();
    return event.clientX >= rect.left - 8 && event.clientX <= rect.right + 8 && event.clientY >= rect.top - 8 && event.clientY <= rect.bottom + 8;
  }
  function aimUnavailable(slot) {
    const p = game.player, meta = skillMeta(slot);
    return !gameplayAvailable() || !p.alive || p.stunnedUntil > game.time || p.cd?.[slot] > 0 || p.mana < (meta?.cost || 0) || (['q','w','e','r'].includes(slot) && !p.skillRanks?.[slot]);
  }
  function updateTouchAim() {
    if (!aimGesture.active) return null;
    if (!gameplayAvailable() || !game.player.alive) { setAim(null); return null; }
    const gesture = aimGesture.snapshot(game.player, skillMeta(selectedAbility));
    const stick = $('touch-aim-stick'), knob = $('touch-aim-knob');
    stick.style.left = `${gesture.origin.x}px`; stick.style.top = `${gesture.origin.y}px`;
    const offset = Math.min(72, gesture.distance);
    knob.style.transform = `translate(calc(-50% + ${gesture.direction.x * offset}px), calc(-50% + ${gesture.direction.y * offset}px))`;
    const blocked = gesture.canceled || aimUnavailable(gesture.slot);
    $('touch-aim-overlay').classList.toggle('canceling', gesture.canceled);
    $('touch-aim-overlay').classList.toggle('blocked', blocked);
    $('touch-aim-cancel-label').textContent = gesture.canceled ? '놓으면 취소' : '끌어와 취소';
    $('touch-aim-hint').textContent = gesture.canceled ? '손을 놓으면 시전하지 않습니다' : `${skillMeta(gesture.slot)?.name || '스킬'} · ${gesture.dragging ? '놓으면 시전' : '짧게 탭하면 자동 조준'}`;
    return { ...gesture, blocked };
  }
  function bindTouchAim(button, slot) {
    const handledPointers = new Set();
    button.addEventListener('pointerdown', event => {
      handledPointers.delete(event.pointerId);
      suppressedSkillClicks.delete(button);
      if (!(coarse() || ['touch','pen'].includes(event.pointerType)) || event.button !== 0 || skillMeta(slot)?.target === 'self') return;
      if (!gameplayAvailable() || !game.player.alive) return;
      event.preventDefault(); event.stopPropagation();
      handledPointers.add(event.pointerId);
      suppressedSkillClicks.set(button, Infinity);
      if (aimGesture.active) return;
      setAim(slot);
      if (!aimGesture.begin({pointerId:event.pointerId, slot, x:event.clientX, y:event.clientY})) { setAim(null); return; }
      aimCapture = {button, pointerId:event.pointerId};
      button.setPointerCapture(event.pointerId);
      pointerInside = false;
      $('touch-aim-overlay').hidden = false;
      $('aim-cancel').hidden = true;
      $('skill-tooltip').hidden = true;
      $('app').classList.add('touch-aiming');
      activateAudio(); updateTouchAim();
    });
    button.addEventListener('pointermove', event => {
      if (aimCapture?.button !== button || aimCapture.pointerId !== event.pointerId) return;
      event.preventDefault();
      aimGesture.move({pointerId:event.pointerId, x:event.clientX, y:event.clientY, cancel:overAimCancel(event)});
      updateTouchAim();
    });
    button.addEventListener('pointerup', event => {
      if (handledPointers.delete(event.pointerId)) suppressedSkillClicks.set(button, performance.now() + 700);
      if (aimCapture?.button !== button || aimCapture.pointerId !== event.pointerId) return;
      event.preventDefault();
      const result = aimGesture.finish({pointerId:event.pointerId, x:event.clientX, y:event.clientY, cancel:overAimCancel(event)}, game.player, skillMeta(slot));
      setAim(null);
      if (result.kind === 'tap') cast(slot, true);
      else if (result.kind === 'cast') castAt(slot, result.aim);
      canvas.focus({preventScroll:true});
    });
    const cancel = event => {
      if (handledPointers.has(event.pointerId)) suppressedSkillClicks.set(button, performance.now() + 700);
      if (event.type === 'pointercancel') handledPointers.delete(event.pointerId);
      if (aimCapture?.button === button && aimCapture.pointerId === event.pointerId) setAim(null);
    };
    button.addEventListener('pointercancel', cancel);
    button.addEventListener('lostpointercapture', cancel);
  }
  function skillClickSuppressed(event, button) {
    if (aimGesture.active) { event.preventDefault(); return true; }
    const suppress = event.detail !== 0 && performance.now() < (suppressedSkillClicks.get(button) || 0);
    suppressedSkillClicks.delete(button);
    if (suppress) {
      event.preventDefault(); return true;
    }
    return false;
  }
  function cycleFocus() {
    if (!gameplayAvailable() || !game.player.alive) return;
    const result = game.cycleFocusTarget();
    if (!result.ok) notify(result.reason || '시야 안의 가까운 적 영웅이 없습니다.', 'info', 2);
    else tone(590, .06, .015);
    updateTarget(); canvas.focus({preventScroll:true});
  }
  function releaseFocus() {
    const focus = game.getFocusTarget();
    if (focus?.id === selectedTargetId) selectedTargetId = null;
    game.setFocusTarget(null); updateTarget(); canvas.focus({preventScroll:true});
  }
  function toggleAttackRange() {
    if (!gameplayAvailable()) return;
    attackRangeVisible = !attackRangeVisible;
    savePrefs(); updateAttackUI(); canvas.focus({preventScroll:true});
  }
  function updateAttackUI() {
    const state = game.getAttackState(), player = game.player;
    const meter = $('attack-state'), label = $('attack-state-label'), detail = $('attack-state-time');
    const labels = {ready:'공격 가능', windup:'발사 준비', recovery:'재공격 대기', disabled:!player.alive ? '부활 대기' : player.recallLeft > 0 ? '귀환 중' : player.stunnedUntil > game.time ? '기절' : '공격 대기'};
    if (meter.dataset.phase !== state.phase) meter.dataset.phase = state.phase;
    const text = labels[state.phase] || labels.disabled;
    if (label.textContent !== text) label.textContent = text;
    const timer = state.phase === 'windup' || state.phase === 'recovery' ? `${state.remaining.toFixed(1)}초` : '';
    if (detail.textContent !== timer) detail.textContent = timer;
    $('attack-state-fill').style.transform = `scaleX(${clamp(state.progress, 0, 1)})`;
    meter.title = state.phase === 'windup' ? '발사 준비 중 이동·QWER·점멸을 쓰면 공격을 취소합니다.' : state.phase === 'recovery' ? '발사한 공격은 유지됩니다. 이동하며 다음 공격을 준비하세요.' : '기본 공격은 멈춘 상태에서 시작합니다. 공격 이동은 사거리 안에서 멈추어 공격합니다.';
    const range = $('attack-range-button');
    range.disabled = !game.started || game.over;
    range.classList.toggle('active', attackRangeVisible);
    range.setAttribute('aria-pressed', attackRangeVisible);
  }
  function setCommand(command) {
    if (!gameplayAvailable() || (!game.player.alive && command !== 'rally')) return;
    const previous = selectedCommand;
    setAim(null);
    if (previous === command) return;
    selectedCommand = command;
    $('aim-cancel').hidden = false;
    $('aim-text').textContent = command === 'rally' ? '집결 지시 · 전장 또는 미니맵에서 위치를 선택하세요' : '공격 이동 · 목적지를 선택하세요';
    $('attack-move-button').classList.toggle('active', command === 'attackmove');
    $('attack-move-button').setAttribute('aria-pressed', command === 'attackmove');
    $('tactics-panel').hidden = true;
    $('tactics-button').setAttribute('aria-expanded', false);
    canvas.focus({ preventScroll: true });
  }
  function issueAt(x, y) {
    const command = selectedCommand;
    clearInput();
    const result = command === 'rally' ? game.setTeamOrder('rally', x, y) : command === 'attackmove' ? game.commandAttackMove(x, y) : game.commandMove(x, y);
    if (result && !result.ok) notify(result.reason || '명령을 실행할 수 없습니다.', 'bad');
    selectedTargetId = null; setAim(null); updateUI();
  }
  function stopPlayer() {
    if (!gameplayAvailable()) return;
    clearInput(); setAim(null); selectedTargetId = null;
    game.stop(); canvas.focus({ preventScroll: true });
  }
  function upgrade(slot) {
    if (!game.started || game.over) return;
    const result = game.upgradeSkill(slot);
    if (!result?.ok) notify(result?.reason || '아직 강화할 수 없습니다.', 'info');
    else { tone(920, .13); persistMatch(); }
    updateUI(); canvas.focus({ preventScroll: true });
  }
  function updateGrowth() {
    const p = game.player, points = p.skillPoints || 0;
    $('growth-bar').hidden = !game.started || game.over || !points || !!activeModal;
    $('skill-points').textContent = points;
    $('app').classList.toggle('has-growth', game.started && !game.over && points > 0 && !activeModal);
    for (const button of all('[data-upgrade]')) {
      const slot = button.dataset.upgrade, meta = skillMeta(slot), rank = p.skillRanks?.[slot] || 0;
      button.disabled = !game.canUpgradeSkill?.(slot);
      const label = `${slot.toUpperCase()} <span>${rank >= (meta.maxRank || 5) ? 'MAX' : rank ? `${rank}→${rank + 1}` : '습득'}</span>`;
      if (button.innerHTML !== label) button.innerHTML = label;
      button.setAttribute('aria-label', `${meta.name} ${rank ? '강화' : '습득'} · 현재 ${rank}단계`);
      button.title = button.disabled ? `${meta.name} · 레벨 ${meta.nextUnlock || (slot === 'r' ? 6 : 1)} 또는 스킬 포인트 필요` : `${meta.name} · Shift + ${slot.toUpperCase()}`;
    }
  }
  function toggleTactics() {
    if (!gameplayAvailable()) return;
    const open = $('tactics-panel').hidden;
    $('tactics-panel').hidden = !open;
    $('tactics-button').setAttribute('aria-expanded', open);
    updateTactics();
  }
  function issueTeamOrder(type) {
    if (!gameplayAvailable()) return;
    if (type === 'rally') { setCommand('rally'); return; }
    setAim(null);
    const result = game.setTeamOrder(type);
    if (!result?.ok) { notify(result?.reason || '지시할 수 없습니다.', 'bad'); return; }
    $('tactics-panel').hidden = true; $('tactics-button').setAttribute('aria-expanded', false);
    updateTactics(); canvas.focus({preventScroll:true});
  }
  function updateTactics() {
    const names = { rally: '집결', push: '중앙 압박', defend: '기지 방어', dragon: '드래곤 공략', boss: '심연 거인 공략' };
    const order = game.order, remaining = Math.max(0, (order?.expiresAt || 0) - game.time);
    const text = remaining > 0 ? `${names[order.type] || '전술 지시'} · ${Math.ceil(remaining)}초 남음` : '각자 공격로를 지키고 있습니다.';
    $('team-order-status').textContent = text;
    $('order-chip').hidden = !game.started || game.over || remaining <= 0;
    $('order-chip').textContent = remaining > 0 ? `◎ ${text}` : '';
    $('clear-order-button').disabled = remaining <= 0;
    $('objective-track').hidden = !game.started || game.over;
    for (const kind of ['dragon','boss']) {
      const goal = game.entities.find(entity => entity.type === 'monster' && entity.kind === kind);
      const ready = !!goal?.alive;
      const label = ready ? '공략 가능' : `${timeLabel(goal?.respawnIn || 0)} 후 등장`;
      $(`${kind}-timer`).textContent = ready ? '공략 지시 ↗' : timeLabel(goal?.respawnIn || 0);
      $(`${kind}-order-state`).textContent = label;
      for (const button of all(`[data-order="${kind}"], [data-objective="${kind}"]`)) {
        button.disabled = !game.started || game.over || !ready;
        button.classList.toggle('ready', ready);
        button.classList.toggle('ordered', order?.type === kind && remaining > 0);
        button.title = `${goal?.name || kind} · ${label}`;
      }
    }
    if (!$('tactics-panel').hidden) {
      const buffs = game.teamBuffs?.[0];
      $('neutral-status').innerHTML = `<span class="eyebrow">팀 강화 효과</span><div><span>드래곤 ${buffs?.dragonStacks || 0}중첩</span><strong class="ready">피해 +${((buffs?.dragonStacks || 0) * 6.5).toFixed(1)}%</strong></div><div><span>거인 공성 강화</span><strong class="${buffs?.bossUntil > game.time ? 'ready' : ''}">${buffs?.bossUntil > game.time ? `${Math.ceil(buffs.bossUntil - game.time)}초 남음` : '미획득'}</strong></div><small>공략 지시는 아군 AI에게 적용됩니다. 직접 이동해 전투에 합류하세요.</small>`;
    }
  }
  function starterChoice() {
    const saved = starterByHero[heroId];
    return saved === 'none' || ITEMS.some(item => item.id === saved && !item.components?.length && item.cost <= 600) ? saved : Coach.starter(heroId);
  }
  function renderLoadout() {
    const selected = starterChoice();
    $('starter-choice').innerHTML = ITEMS.filter(item => !item.components?.length && item.cost <= 600).map(item => `<option value="${esc(item.id)}"${selected === item.id ? ' selected' : ''}>${esc(item.name)} · ${item.cost}G${Coach.starter(heroId) === item.id ? ' · 추천' : ''}</option>`).join('') + `<option value="none"${selected === 'none' ? ' selected' : ''}>장비 없이 시작 · 600G 보유</option>`;
    const item = ITEMS.find(entry => entry.id === selected);
    $('starter-icon').textContent = item?.icon || '◇';
    $('starter-icon').style.color = item?.color || '#b5c8b9';
    $('starter-description').textContent = item ? `${item.description} 출전 시 구매 · 잔여 ${600 - item.cost}G` : '시작 골드를 모두 보유합니다. 경기 중에는 기지 또는 부활 대기 중에 구매할 수 있습니다.';
  }
  function renderContinue() {
    const ready = savedMatch.status === 'ready';
    $('continue-card').hidden = !ready;
    $('checkpoint-notice').hidden = !['invalid','unavailable'].includes(savedMatch.status);
    $('checkpoint-notice').textContent = savedMatch.reason || '';
    $('start-button').innerHTML = `${ready ? '새 경기 시작' : '장비를 갖추고 출전'} <span>↗</span>`;
    $('new-match-note').hidden = !ready;
    if (!ready) return;
    const checkpoint = savedMatch.checkpoint, state = checkpoint.state.state;
    const player = state.entities.find(entity => entity.id === checkpoint.state.playerId);
    const hero = HEROES.find(entry => entry.id === player.hero) || HEROES[0];
    $('continue-title').textContent = `${hero.name} · ${timeLabel(state.time)} · Lv.${player.level}`;
    $('continue-detail').textContent = `${state.difficulty === 'easy' ? '훈련' : '표준'} · 맵 ${normalizeMapScale(state.mapScale)}배 · 속도 ${normalizeSpeed(checkpoint.ui?.speed)}배 · ${player.kills} / ${player.deaths} / ${player.assists} · ${new Date(checkpoint.savedAt).toLocaleTimeString('ko-KR', {hour:'2-digit',minute:'2-digit'})} 저장`;
  }
  function updateSaveStatus() {
    $('save-status').textContent = saveError || (lastSaveAt === null ? '게임 시간 8초마다 자동 저장됩니다.' : `${timeLabel(lastSaveAt)} 시점 저장됨 · 새로고침 후 이어 할 수 있습니다.`);
    $('save-status').classList.toggle('failed', !!saveError);
  }
  function persistMatch(announce = false) {
    if (!game.started || game.over) return false;
    guidance = Coach.read(game, journey); journey = guidance.journey;
    const result = Checkpoint.write(undefined, game, {journey, speed});
    nextSaveAt = game.time + 8;
    if (result.ok) {
      savedMatch = {status:'ready', checkpoint:result.checkpoint};
      lastSaveAt = game.time; saveError = ''; saveWarningShown = false;
      if (announce) notify('현재 경기를 저장했습니다.', 'good');
    } else {
      saveError = result.reason || '현재 경기를 저장하지 못했습니다.';
      if (announce || !saveWarningShown) notify(saveError, 'bad', 6);
      saveWarningShown = true;
    }
    updateSaveStatus();
    return result.ok;
  }
  function presentGame(playing) {
    renderer.setGame(game); renderer.follow = true;
    ended = false; selectedTargetId = null; selectedInventory = -1; accumulator = 0; lastFrame = 0;
    currentRecord = null; viewedRecord = null; reportFromHistory = false; renderedRecapAt = null;
    $('surrender-details').open = false;
    userMessages = []; seenEvents = new Set(); clearInput(); setAim(null);
    Object.assign(aimGesture.bounds, { minX: 28, minY: 28, maxX: currentMap().width - 28, maxY: currentMap().height - 28 });
    $('end-screen').hidden = true; $('lobby').hidden = playing;
    $('tactics-panel').hidden = true; $('tactics-button').setAttribute('aria-expanded', false);
    aim = { x: currentMap().width / 2, y: currentMap().height / 2 };
    renderMatchSettings();
    $('event-feed').innerHTML = ''; $('skill-tooltip').hidden = true;
    renderHeroCards(); renderLoadout(); renderContinue(); syncHeroHUD(); renderItemGrid();
    updateSaveStatus(); renderer.resize();
  }
  function resetGame(start) {
    if (activeModal) closeModal(false);
    game = new Game({ hero: heroId, difficulty, mapScale, seed: (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0 });
    journey = null; guidance = null; nextSaveAt = 8; lastSaveAt = null; saveError = ''; saveWarningShown = false;
    if (start && starterChoice() !== 'none') game.prepareItem(starterChoice());
    presentGame(!!start);
    if (start) {
      game.start(); canvas.focus({ preventScroll: true }); activateAudio(); tone(590, .17);
      persistMatch();
      notify('출전 준비 완료 · 길잡이에서 전투의 여섯 가지 기본을 익혀 보세요.', 'info', 6);
    }
    updateUI(); renderer.resize();
  }
  function continueMatch() {
    if (savedMatch.status !== 'ready') return;
    const restored = Checkpoint.restore(savedMatch.checkpoint);
    if (!restored.ok) {
      savedMatch = {status:'invalid', reason:restored.reason}; renderContinue(); return;
    }
    if (activeModal) closeModal(false);
    game = restored.game; heroId = game.player.hero; difficulty = game.difficulty; mapScale = game.mapScale;
    journey = restored.ui.journey || null; guidance = null; speed = normalizeSpeed(restored.ui.speed);
    nextSaveAt = game.time + 8; lastSaveAt = game.time; saveError = ''; saveWarningShown = false;
    presentGame(true); seenEvents = new Set(game.events.map(event => event.id)); savePrefs();
    openModal('pause'); modalWasPaused = false;
    $('pause-title').textContent = '저장한 전투를 불러왔습니다';
    $('pause-description').textContent = `${timeLabel(game.time)} 시점의 ${mapScale}배 맵과 ${speed}배 속도, 장비·성장·전장 상태를 복원했습니다. 계속하기를 누르면 전투가 재개됩니다.`;
    updateUI();
  }
  function notify(text, toneName = 'info', seconds = 3) {
    if (!text) return;
    const now = performance.now();
    if (userMessages.some(message => message.text === text && message.until > now)) return;
    userMessages.push({ text, tone: toneName, until: now + seconds * 1000 });
    userMessages = userMessages.slice(-6); renderEvents();
  }
  function renderEvents() {
    const now = performance.now();
    userMessages = userMessages.filter(message => message.until > now);
    const markup = userMessages.slice(-3).map(message => `<div class="event-message ${esc(message.tone)}">${esc(message.text)}</div>`).join('');
    if ($('event-feed').innerHTML !== markup) $('event-feed').innerHTML = markup;
  }
  function consumeEvents() {
    for (const event of game.events) {
      const id = event.id ?? `${event.at}:${event.text}`;
      if (seenEvents.has(id)) continue;
      seenEvents.add(id);
      if (game.started) {
        notify(event.text, event.tone, 4.2);
        if (event.tone === 'good') tone(680, .13, .018);
        else if (event.tone === 'bad') tone(155, .13, .018);
      }
    }
    if (seenEvents.size > 2000) seenEvents = new Set(game.events.map(event => event.id ?? `${event.at}:${event.text}`));
  }
  function openModal(name) {
    if (activeModal === name) { closeModal(); return; }
    if (activeModal) closeModal(false);
    activeModal = name; modalWasPaused = game.paused; clearInput(); setAim(null);
    $('tactics-panel').hidden = true; $('tactics-button').setAttribute('aria-expanded', false);
    if (['pause','help','guide'].includes(name)) game.paused = true;
    $(`${name}-modal`).hidden = false;
    $('skill-tooltip').hidden = true;
    if (name === 'shop') updateShop();
    if (name === 'scoreboard') updateScoreboard();
    if (name === 'history') renderHistory();
    if (name === 'recap') renderRecap();
    if (name === 'report') renderReport();
    if (name === 'guide') updateGuide();
    if (name === 'pause') {
      $('pause-title').textContent = '전투 일시정지';
      $('pause-description').textContent = '현재 경기를 저장하거나 준비 화면으로 돌아갈 수 있습니다.';
      persistMatch();
    }
    const first = $(`${name}-modal`).querySelector('button:not(:disabled)');
    first?.focus({ preventScroll: true });
  }
  function closeModal(focus = true) {
    if (!activeModal) return;
    const oldModal = activeModal;
    $(`${oldModal}-modal`).hidden = true;
    if (['pause','help','guide'].includes(oldModal)) game.paused = modalWasPaused;
    activeModal = null;
    scoreboardHeld = false;
    if (focus) {
      const destination = game.over ? $('again-button') : game.started ? canvas : $('start-button');
      destination.focus({ preventScroll: true });
    }
  }
  function gameplayAvailable() { return game.started && !game.over && !game.paused && !activeModal; }
  function cast(slot, automatic = false) {
    if (!gameplayAvailable()) return;
    if (pointerInside) aim = renderer.screenToWorld(pointerScreen.x, pointerScreen.y);
    return castAt(slot, automatic || !pointerInside ? null : aim);
  }
  function castAt(slot, target) {
    if (!gameplayAvailable()) return;
    activateAudio();
    const result = game.cast(slot, ...(target ? [target.x, target.y] : []));
    if (result?.ok) { tone(slot === 'r' ? 145 : slot === 'f' ? 770 : 440, slot === 'r' ? .22 : .08); setAim(null); }
    else notify(result?.reason || '지금은 사용할 수 없습니다.', 'bad', 2.3);
    updateUI();
    return result;
  }
  function recall() {
    if (!game.started || game.over || game.paused) return;
    if (activeModal) closeModal();
    clearInput(); setAim(null);
    const result = game.recall();
    if (!result?.ok) notify(result?.reason || '지금은 귀환할 수 없습니다.', 'bad');
    else tone(520, .18);
    canvas.focus({ preventScroll: true }); updateUI();
  }
  function toggleAutoAttack() {
    if (typeof game.setAutoAttack === 'function') game.setAutoAttack(!game.player.autoAttack);
    else game.player.autoAttack = !game.player.autoAttack;
    updateUI();
  }
  function updateInput() {
    if (!gameplayAvailable()) { game.setInputVector(0, 0); return; }
    let x = Number(keys.has('arrowright')) - Number(keys.has('arrowleft')) + joyVector.x;
    let y = Number(keys.has('arrowdown')) - Number(keys.has('arrowup')) + joyVector.y;
    const length = Math.hypot(x, y);
    if (length > 1) { x /= length; y /= length; }
    game.setInputVector(x, y);
  }
  function canShop() {
    const p = game.player;
    return !p.alive || Math.hypot(p.x - 165, p.y - 1435) <= 180;
  }
  function renderItemGrid() {
    $('item-grid').innerHTML = ITEMS.map(item => `<button class="item-card" data-item="${esc(item.id)}" style="--item-color:${esc(item.color || '#dbb973')}"><span class="item-icon">${esc(item.icon || '◆')}</span><strong>${esc(item.name)}${item.components?.length ? '<em class="recipe-tag">조합</em>' : ''}</strong><span class="item-description">${esc(item.description)}</span><span class="item-recipe"></span><span class="item-price">◆ ${int(item.cost)}</span><span class="buy-label">구매</span></button>`).join('');
    all('[data-item]').forEach(button => button.addEventListener('click', () => {
      purchaseItem(button.dataset.item);
    }));
  }
  function purchaseItem(itemId) {
    const result = game.buy(itemId);
    if (!result?.ok) notify(result?.reason || '구매할 수 없습니다.', 'bad');
    else { tone(880, .12); selectedInventory = -1; persistMatch(); }
    updateUI(); updateShop();
  }
  function updateShop() {
    const p = game.player, allowed = canShop();
    const recommended = Coach.recommend(game);
    const recommendedItem = ITEMS.find(item => item.id === recommended.itemId);
    $('recommended-icon').textContent = recommendedItem?.icon || '✓';
    $('recommended-icon').style.color = recommendedItem?.color || '#83d7b5';
    $('recommended-title').textContent = recommended.title;
    $('recommended-reason').textContent = recommended.reason;
    $('buy-recommended').hidden = recommended.complete || !recommendedItem;
    $('buy-recommended').disabled = !recommended.canBuy;
    $('buy-recommended').dataset.itemId = recommended.itemId || '';
    $('buy-recommended').textContent = !recommended.atShop ? '귀환 후 구매' : recommended.missingGold > 0 ? `${int(recommended.missingGold)}G 더 필요` : recommended.blockedBySlots ? '슬롯 확인' : `추천 구매 · ${int(recommended.cost)}G`;
    ui['shop-gold'].textContent = int(p.gold);
    ui['shop-location'].textContent = !p.alive ? '부활 대기 중 · 구매 가능' : allowed ? '아군 기지 · 구매 가능' : '기지 밖입니다 · B로 귀환 후 구매하세요';
    ui['shop-location'].classList.toggle('available', allowed);
    for (const button of all('[data-item]')) {
      const item = ITEMS.find(item => item.id === button.dataset.item);
      const purchase = game.getPurchaseInfo ? game.getPurchaseInfo(item.id) : { cost: item.cost, canBuy: allowed && p.gold >= item.cost && p.inventory.length < 6 && !game.over, consumedIndices: [] };
      const upgrading = purchase.consumedIndices?.length > 0;
      button.disabled = !purchase.canBuy;
      button.querySelector('.item-price').textContent = `◆ ${int(purchase.cost)}${upgrading ? ' · 차액' : ''}`;
      button.querySelector('.buy-label').textContent = !allowed ? '귀환 필요' : p.gold < purchase.cost ? '골드 부족' : p.inventory.length >= 6 && !upgrading ? '슬롯 가득 참' : upgrading ? '조합' : '구매';
      button.querySelector('.item-recipe').textContent = item.components?.length ? `${upgrading ? '보유 재료 사용' : '재료'} · ${item.components.map(id => ITEMS.find(other => other.id === id)?.name || id).join(' + ')}` : '';
      button.classList.toggle('can-combine', upgrading && purchase.canBuy);
      button.classList.toggle('recommended', button.dataset.item === recommended.itemId);
    }
    ui['inventory-count'].textContent = `${p.inventory.length} / 6`;
    const inventory = Array.from({ length: 6 }, (_, i) => {
      const owned = p.inventory[i], item = ITEMS.find(item => item.id === (typeof owned === 'string' ? owned : owned?.id));
      return item ? `<button class="inventory-slot filled ${selectedInventory === i ? 'selected' : ''}" data-inventory="${i}" aria-pressed="${selectedInventory === i}" aria-label="${esc(item.name)} 판매 정보 보기" title="${esc(item.name)} · ${esc(item.description)}"><span style="color:${esc(item.color || '#d3b36d')}">${esc(item.icon || '◆')}</span><small>${esc(item.name)}</small></button>` : '<div class="inventory-slot"><span>＋</span></div>';
    }).join('');
    if ($('inventory').innerHTML !== inventory) {
      const focusedSlot = document.activeElement?.closest('#inventory [data-inventory]')?.dataset.inventory;
      $('inventory').innerHTML = inventory;
      if (focusedSlot !== undefined) $('inventory').querySelector(`[data-inventory="${focusedSlot}"]`)?.focus({preventScroll:true});
    }
    const ownedId = p.inventory[selectedInventory], selected = ITEMS.find(item => item.id === (typeof ownedId === 'string' ? ownedId : ownedId?.id));
    $('inventory-inspector').hidden = !selected;
    if (selected) {
      $('sell-item-name').textContent = selected.name;
      $('sell-item-description').textContent = selected.description;
      $('sell-button').textContent = `판매 · ◆ ${int(Math.floor(selected.cost * .7))}`;
      $('sell-button').disabled = !allowed || game.over;
    }
    $('shop-recall').disabled = !p.alive || allowed;
    $('shop-recall').textContent = allowed ? '현재 위치에서 구매할 수 있습니다' : '기지로 귀환하기 (B)';
  }
  function updateScoreboard() {
    const p = game.player;
    $('scoreboard-content').innerHTML = [0,1].map(team => {
      const heroes = game.entities.filter(entity => entity.type === 'hero' && entity.team === team);
      return `<div class="score-team-title ${team ? 'red' : ''}"><span>${team ? '적군 · CORAL' : '아군 · CYAN'}</span><strong>${game.teamKills[team]} 처치</strong></div>${heroes.map(entity => {
        const hero = HEROES.find(hero => hero.id === entity.hero) || HEROES[0];
        return `<div class="score-row ${entity.id === p.id ? 'me' : ''}"><span class="score-icon" style="color:${esc(hero.color)}">${heroIcons[entity.hero] || '◇'}</span><span class="score-name">${esc(entity.name || hero.name)}<small>${entity.id === p.id ? '나' : 'AI'} · ${esc(({top:'상단',mid:'중단',bot:'하단',jungle:'정글'})[entity.lane] || hero.role)}</small></span><span class="score-level">Lv. ${entity.level || 1}</span><strong class="score-kda">${entity.kills || 0} / ${entity.deaths || 0} / ${entity.assists || 0}</strong>${entity.alive ? `<span class="score-health"><i class="${team ? 'red' : ''}" style="width:${clamp(entity.hp / entity.maxHp * 100, 0, 100)}%"></i></span>` : `<span class="score-dead">${Math.ceil(entity.respawnIn || 0)}초</span>`}</div>`;
      }).join('')}`;
    }).join('');
  }
  function renderHistory() {
    $('history-content').innerHTML = matchHistory.length ? matchHistory.map((record, index) => {
      const hero = HEROES.find(hero => hero.id === record.hero) || HEROES[0];
      const detailed = record.version >= 3 && record.teamStats?.length;
      const content = `<strong class="history-result">${record.winner === 0 ? '승리' : record.endReason === 'surrender' ? '항복' : '패배'}</strong><span class="history-hero">${esc(hero.name)}<small>${record.difficulty === 'easy' ? '훈련' : '표준'} · 맵 ${normalizeMapScale(record.mapScale)}배 · ${esc(new Date(record.at).toLocaleDateString('ko-KR'))}</small></span><span class="history-kda">${int(record.kills)} / ${int(record.deaths)} / ${int(record.assists)}<small>K / D / A</small></span><span class="history-time">${timeLabel(record.time)}<small>${detailed ? '상세 보기 ↗' : `${int(record.cs)} CS`}</small></span>`;
      return detailed ? `<button class="history-row ${record.winner === 0 ? 'won' : 'lost'}" data-record-index="${index}" aria-label="${esc(hero.name)} ${timeLabel(record.time)} 경기 상세 보기">${content}</button>` : `<div class="history-row ${record.winner === 0 ? 'won' : 'lost'}">${content}</div>`;
    }).join('') : '<div class="history-empty"><span>◇</span><strong>첫 경기를 기다리고 있습니다</strong><p>경기를 완료하면 결과와 전투 보고서가 여기에 남습니다.</p></div>';
  }
  function openRecap() {
    if (!game.getDeathRecap?.()) { notify('이번 경기의 사망 기록이 아직 없습니다.', 'info'); return; }
    openModal('recap');
  }
  function renderRecap() {
    const recap = game.getDeathRecap?.();
    if (!recap || renderedRecapAt === recap.at) return;
    renderedRecapAt = recap.at;
    const total = Math.max(1, recap.totalDamage || 0), sources = recap.sources || [];
    const dominant = sources[0];
    const hint = dominant?.sourceType === 'tower' ? '포탑의 연속 공격은 점점 강해집니다. 아군 미니언을 앞세우고 조준되면 사거리 밖으로 이동하세요.' : dominant?.sourceType === 'monster' ? '중립 목표물의 붉은 예고 범위를 벗어나세요. T로 아군에게 공략을 지시하고 함께 싸우면 안전합니다.' : '교전 전에 시야와 아군 위치를 확인하세요. 보호막·회복·점멸을 사용하고 체력이 낮을 때는 후퇴하세요.';
    $('recap-content').innerHTML = `<div class="recap-killer"><span>${timeLabel(recap.at)} · 최근 ${int(recap.windowSeconds || 10)}초</span><strong>${esc(recap.killerName || '전장')}에게 처치됨</strong></div><div class="recap-totals"><div><strong>${int(recap.totalDamage)}</strong><span>체력에 받은 피해</span></div><div><strong>${int(recap.totalAbsorbed)}</strong><span>보호막으로 흡수</span></div></div><div class="damage-legend"><span class="physical">물리</span><span class="magic">마법</span><span class="true">고정</span></div><div class="recap-sources">${sources.map(source => `<div class="recap-source"><div class="recap-source-title"><span class="recap-source-icon">${({hero:'◇',tower:'♜',minion:'◆',monster:'◈'})[source.sourceType] || '·'}</span><strong>${esc(source.sourceName || '전장')}</strong><span>${int(source.damage)} <small>· ${int(source.hits)}회</small></span></div><div class="damage-track"><i class="physical" style="width:${clamp((source.physical || 0) / total * 100,0,100)}%"></i><i class="magic" style="width:${clamp((source.magic || 0) / total * 100,0,100)}%"></i><i class="true" style="width:${clamp((source.true || 0) / total * 100,0,100)}%"></i></div>${source.absorbed > 0 ? `<small class="absorbed-note">추가로 보호막이 ${int(source.absorbed)} 흡수</small>` : ''}</div>`).join('') || '<p class="modal-note">기록된 피해가 없습니다.</p>'}</div><p class="recap-advice">${hint}</p>`;
  }
  function openReport(record, fromHistory = false) {
    if (!record?.teamStats?.length) { notify('이 경기에는 상세 통계가 저장되지 않았습니다.', 'info'); return; }
    viewedRecord = record; reportFromHistory = fromHistory; openModal('report');
  }
  function renderReport() {
    const record = viewedRecord;
    if (!record) return;
    const teams = record.teamStats || [];
    const totalDamage = teams.map(team => team.heroes.reduce((sum, hero) => sum + (hero.damage || 0), 0));
    const maxDamage = Math.max(1, ...teams.flatMap(team => team.heroes.map(hero => hero.damage || 0)));
    const total = Math.max(1, totalDamage.reduce((a,b) => a+b,0));
    const outcome = record.winner === 0 ? '승리' : record.endReason === 'surrender' ? '항복' : '패배';
    $('report-content').innerHTML = `<div class="report-summary"><strong class="${record.winner === 0 ? 'won' : 'lost'}">${outcome}</strong><span>${esc(new Date(record.at).toLocaleDateString('ko-KR'))} · ${timeLabel(record.time)} · ${record.difficulty === 'easy' ? '훈련' : '표준'} · 맵 ${normalizeMapScale(record.mapScale)}배</span><small>가한 피해는 영웅·미니언·몬스터·구조물·와드 등 모든 대상에 준 실제 체력 피해입니다.</small></div><div class="team-damage-total"><span>아군 ${int(totalDamage[0])}</span><span>적군 ${int(totalDamage[1])}</span><div><i style="width:${(totalDamage[0] || 0) / total * 100}%"></i></div></div>${teams.map(team => {
      const objective = record.objectives?.find(value => value.team === team.team);
      return `<section class="report-team ${team.team ? 'red' : 'blue'}"><div class="report-team-heading"><strong>${team.team ? '적군 · CORAL' : '아군 · CYAN'}</strong><span>${int(team.kills)} 처치 · 드래곤 ${int(objective?.dragonStacks)}중첩</span></div><div class="report-column-labels"><span>영웅</span><span>K / D / A</span><span>CS</span><span>피해</span></div>${team.heroes.map(hero => `<div class="report-hero ${hero.id === 'player' ? 'me' : ''}"><div class="report-hero-name"><span style="color:${esc(HEROES.find(h => h.id === hero.hero)?.color || '#d6c996')}">${heroIcons[hero.hero] || '◇'}</span><div><strong>${esc(hero.name || '영웅')}${hero.id === 'player' ? '<b>나</b>' : ''}</strong><small>Lv.${int(hero.level)} · ${hero.inventory?.map(id => ITEMS.find(item => item.id === id)?.icon || '◇').join(' ') || '장비 없음'}</small></div></div><span class="report-kda">${int(hero.kills)} / ${int(hero.deaths)} / ${int(hero.assists)}</span><span class="report-cs">${int(hero.cs)}</span><div class="report-damage"><strong>${int(hero.damage)}</strong><i style="width:${clamp((hero.damage || 0) / maxDamage * 100,0,100)}%"></i></div></div>`).join('')}</section>`;
    }).join('')}`;
    $('report-back-button').hidden = !reportFromHistory;
  }
  function updateObjective() {
    const enemies = game.entities.filter(entity => entity.team === 1);
    let title, description;
    if (enemies.some(entity => entity.type === 'inhibitor' && !entity.alive)) {
      const baseTowers = enemies.filter(entity => entity.type === 'tower' && (entity.structureTier === 'base' || entity.lane === 'base') && entity.alive);
      title = baseTowers.length ? '기지 포탑을 파괴하세요' : '적 넥서스를 파괴하세요';
      description = baseTowers.length ? '억제기가 무너졌습니다. 열린 라인으로 아군과 함께 진격하세요.' : '최종 목표가 열렸습니다. 넥서스 파괴가 승리 조건입니다.';
    } else {
      const aliveInner = enemies.filter(entity => entity.type === 'tower' && entity.structureTier === 'inner' && entity.alive);
      const deadOuter = enemies.some(entity => entity.type === 'tower' && entity.structureTier === 'outer' && !entity.alive);
      title = aliveInner.length < 3 ? '적 억제기를 파괴하세요' : deadOuter ? '안쪽 포탑을 돌파하세요' : '외곽 포탑을 돌파하세요';
      description = aliveInner.length < 3 ? '억제기를 무너뜨리면 강화 미니언과 함께 기지를 압박할 수 있습니다.' : '미니언과 함께 진입하세요. 혼자 포탑에 다가가면 위험합니다.';
    }
    ui['objective-title'].textContent = title; ui['objective-sub'].textContent = description;
    const advice = guidance?.advice;
    $('battle-tip').classList.toggle('danger', game.started && advice?.tone === 'danger');
    $('battle-tip').lastElementChild.textContent = !game.started ? '영웅과 출전 장비를 선택하세요' : advice ? `${advice.title} · ${advice.description}` : '미니언과 함께 진격하세요';
  }
  function updateGuide() {
    guidance = Coach.read(game, journey); journey = guidance.journey;
    const completed = guidance.milestones.filter(step => step.done).length;
    $('guide-count').textContent = `${completed}/${guidance.milestones.length}`;
    $('guide-button').disabled = !game.started || game.over;
    if (activeModal !== 'guide') return;
    const advice = guidance.advice;
    $('guide-advice').className = `guide-advice ${advice.tone}`;
    $('guide-advice-title').textContent = advice.title;
    $('guide-advice-description').textContent = advice.description;
    $('guide-progress').textContent = `${completed} / ${guidance.milestones.length} 완료`;
    $('guide-progress-fill').style.width = `${completed / guidance.milestones.length * 100}%`;
    const markup = guidance.milestones.map(step => `<li class="${step.done ? 'done' : ''}"><span class="milestone-check" aria-hidden="true">${step.done ? '✓' : '○'}</span><div><strong>${esc(step.title)}<small>${step.done ? '완료' : '도전'}</small></strong><p>${esc(step.description)}</p></div></li>`).join('');
    if ($('milestone-list').innerHTML !== markup) $('milestone-list').innerHTML = markup;
    const labels = {shop:'상점 열기',recall:'기지로 귀환',upgrade:'추천 스킬 배분',dragon:'드래곤 공략 지시',boss:'거인 공략 지시',push:'중앙 압박 지시',defend:'기지 방어 지시'};
    $('guide-action').hidden = !advice.action;
    $('guide-action').dataset.action = advice.action || '';
    $('guide-action').textContent = labels[advice.action] || '전투 계속하기';
  }
  function actOnGuide() {
    const action = $('guide-action').dataset.action;
    closeModal();
    if (action === 'shop') openModal('shop');
    else if (action === 'recall') recall();
    else if (action === 'upgrade') {
      game.autoAllocateSkills(); tone(920, .13); persistMatch(); updateUI();
    } else if (['dragon','boss','push','defend'].includes(action)) issueTeamOrder(action);
  }
  function updateTarget() {
    const focus = game.getFocusTarget();
    const target = focus || game.entities.find(entity => entity.id === selectedTargetId);
    const usable = game.started && !game.over && game.player.alive;
    $('focus-target-button').disabled = !usable;
    $('focus-target-button').classList.toggle('active', !!focus);
    $('focus-target-button').setAttribute('aria-pressed', !!focus);
    $('release-focus-button').hidden = !focus;
    ui['target-panel'].classList.toggle('focused', !!focus);
    const visible = !!target && target.alive && game.isVisible(target, game.player.team) && game.started && !game.over;
    $('app').classList.toggle('has-target', visible);
    if (!visible) { ui['target-panel'].hidden = true; return; }
    ui['target-panel'].hidden = false;
    ui['target-kind'].textContent = ({ hero:'적 영웅', minion:'미니언', tower:'포탑', inhibitor:'억제기', nexus:'넥서스', monster:'중립 몬스터', ward:'와드' })[target.type] || '대상';
    ui['target-name'].textContent = target.name || ui['target-kind'].textContent;
    ui['target-lock'].textContent = focus ? '고정' : game.isProtected(target) ? '선행 구조물 필요' : '';
    ui['target-fill'].style.width = `${clamp(target.hp / target.maxHp * 100, 0, 100)}%`;
    ui['target-hp'].textContent = `${int(Math.max(0, target.hp))} / ${int(target.maxHp)}`;
  }
  function updateUI() {
    const p = game.player;
    updateAttackUI();
    ui['blue-score'].textContent = game.teamKills[0]; ui['red-score'].textContent = game.teamKills[1];
    ui.clock.textContent = timeLabel(game.time); ui.level.textContent = p.level;
    ui.kda.textContent = `${p.kills || 0} / ${p.deaths || 0} / ${p.assists || 0}`;
    ui['health-fill'].style.width = `${clamp(p.hp / p.maxHp * 100, 0, 100)}%`;
    ui['health-text'].textContent = `${int(Math.max(0, p.hp))} / ${int(p.maxHp)}`;
    ui['mana-fill'].style.width = `${clamp(p.mana / p.maxMana * 100, 0, 100)}%`;
    ui['mana-text'].textContent = `${int(p.mana)} / ${int(p.maxMana)}`;
    ui['xp-fill'].style.width = `${clamp(p.xp / (p.nextXp || 1) * 100, 0, 100)}%`;
    ui.gold.textContent = int(p.gold);
    $('auto-button').classList.toggle('active', p.autoAttack);
    $('auto-button').setAttribute('aria-pressed', !!p.autoAttack);
    for (const [slot, button] of Object.entries(buttons)) {
      const meta = skillMeta(slot), cooldown = Math.max(0, p.cd?.[slot] || 0);
      const core = ['q','w','e','r'].includes(slot), rank = p.skillRanks?.[slot] ?? (slot === 'r' && p.level < 6 ? 0 : 1), unlearned = core && rank === 0;
      button.querySelector('.skill-cd').textContent = unlearned ? slot === 'r' && p.level < 6 ? 'Lv.6' : '미습득' : cooldown > 0 ? String(Math.ceil(cooldown)) : '';
      button.querySelector('.cooldown-shade').style.transform = `scaleY(${clamp(cooldown / (meta?.cooldown || 1), 0, 1)})`;
      button.disabled = !p.alive || !game.started || game.over || unlearned;
      button.classList.toggle('on-cooldown', cooldown > 0);
      button.classList.toggle('unlearned', unlearned);
      button.classList.toggle('no-mana', p.mana < (meta?.cost || 0));
      const pips = button.querySelector('.rank-pips');
      if (pips) {
        const markup = Array.from({length: meta.maxRank || (slot === 'r' ? 3 : 5)}, (_, i) => `<i class="${i < rank ? 'filled' : ''}"></i>`).join('');
        if (pips.innerHTML !== markup) pips.innerHTML = markup;
      }
    }
    ui['ward-label'].textContent = p.cd?.ward > 0 ? `${Math.ceil(p.cd.ward)}초` : '와드 · 4';
    $('ward-button').disabled = !game.started || !p.alive || game.over;
    $('recall-button').disabled = !game.started || !p.alive || game.over;
    $('pause-button').disabled = !game.started || game.over;
    $('scoreboard-button').disabled = !game.started;
    $('shop-button').disabled = !game.started || game.over;
    $('speed-button').disabled = !game.started || game.over;
    $('pause-speed-choice').disabled = !game.started || game.over;
    $('tactics-button').disabled = !game.started || game.over;
    $('attack-move-button').disabled = !game.started || game.over || !p.alive;
    $('stop-button').disabled = !game.started || game.over || !p.alive;
    ui['respawn-banner'].hidden = p.alive || !game.started || game.over;
    ui['respawn-seconds'].textContent = Math.ceil(p.respawnIn || 0);
    $('death-recap-button').disabled = !game.getDeathRecap?.();
    $('scoreboard-recap-button').hidden = !game.getDeathRecap?.();
    ui['recall-banner'].hidden = !p.recallLeft || !p.alive || game.over;
    ui['recall-progress'].style.width = `${clamp((4 - (p.recallLeft || 0)) / 4 * 100, 0, 100)}%`;
    if (activeModal === 'shop') updateShop();
    if (activeModal === 'scoreboard') updateScoreboard();
    if (activeModal === 'recap') renderRecap();
    updateTarget(); updateGuide(); updateObjective(); updateGrowth(); updateTactics(); consumeEvents(); renderEvents();
    if (game.over && !ended) showEnd();
  }
  function showEnd() {
    ended = true; closeModal(false); clearInput(); setAim(null);
    const clearedCheckpoint = Checkpoint.remove();
    savedMatch = {status:'empty'};
    $('tactics-panel').hidden = true; $('growth-bar').hidden = true; $('order-chip').hidden = true;
    $('end-screen').hidden = false;
    const victory = game.winner === 0;
    $('end-screen').classList.toggle('defeat', !victory);
    $('end-title').textContent = victory ? '승리' : '패배';
    $('end-eyebrow').textContent = victory ? 'VICTORY · NEXUS DESTROYED' : 'DEFEAT · ANOTHER BATTLE AWAITS';
    $('end-description').textContent = victory ? '전선을 돌파하고 상대 넥서스를 파괴했습니다.' : game.endReason === 'surrender' ? '항복으로 경기를 마쳤습니다. 전투 보고서를 확인하고 다시 도전하세요.' : '아군 넥서스가 파괴되었습니다. 다시 전장을 준비하세요.';
    $('end-stats').innerHTML = `<div class="end-stat"><strong>${timeLabel(game.time)}</strong><span>경기 시간</span></div><div class="end-stat"><strong>${game.player.kills} / ${game.player.deaths} / ${game.player.assists}</strong><span>K / D / A</span></div><div class="end-stat"><strong>${game.player.cs || 0}</strong><span>미니언 · 몬스터</span></div><div class="end-stat"><strong>${game.player.level}</strong><span>최종 레벨</span></div><div class="end-stat"><strong>${int(game.player.damageDealt)}</strong><span>가한 피해</span></div><div class="end-stat"><strong>${game.entities.filter(e => e.team === 1 && !e.alive && ['tower','inhibitor','nexus'].includes(e.type)).length}</strong><span>적 구조물 파괴 · 팀</span></div>`;
    currentRecord = History.makeRecord(game);
    const saved = currentRecord ? History.append(undefined, currentRecord) : {records:matchHistory,persisted:false};
    matchHistory = saved.persisted ? saved.records : currentRecord ? [currentRecord,...matchHistory.filter(record => record.id !== currentRecord.id)].slice(0,5) : matchHistory;
    $('history-save-status').textContent = saved.persisted ? '경기 결과와 전투 보고서가 저장되었습니다.' : '이번 세션에서 결과를 확인할 수 있습니다. 브라우저가 기록 저장을 허용하지 않았습니다.';
    if (!clearedCheckpoint.ok) $('history-save-status').textContent += ' 진행 중 경기 저장을 지우지 못했습니다.';
    $('end-report-button').disabled = !currentRecord;
    tone(victory ? 740 : 190, .5, .05);
    $('again-button').focus({ preventScroll: true });
  }
  function showSkillTooltip(slot, element) {
    if (coarse() || activeModal || !game.started) return;
    const meta = skillMeta(slot); if (!meta) return;
    tooltipSlot = slot;
    const tooltip = $('skill-tooltip'), rect = element.getBoundingClientRect();
    const damaging = ({ mage: ['q','w','r'], warrior: ['q','e','r'], ranger: ['q','e','r'] })[game.player.hero].includes(slot);
    tooltip.innerHTML = `<strong>${esc(meta.name)} <kbd>${slot.toUpperCase()}</kbd></strong><p>${esc(meta.description)}</p>${meta.maxRank ? `<div class="tooltip-rank">스킬 ${meta.rank} / ${meta.maxRank}단계${meta.rank > 1 ? ` · 재사용 -${(meta.rank - 1) * 4}%${damaging ? ` · 피해 +${Math.round((meta.damageMultiplier - 1) * 100)}%` : ''}` : ''}</div>` : ''}<small>재사용 ${Number(meta.cooldown.toFixed(1))}초${meta.cost ? ` · 마나 ${meta.cost}` : ''}${slot === 'r' ? ' · 6/11/16레벨 성장' : ''}</small>`;
    tooltip.hidden = false;
    tooltip.style.left = `${clamp(rect.left + rect.width / 2 - 145, 12, innerWidth - 302)}px`;
    tooltip.style.bottom = `${innerHeight - rect.top + 14}px`;
  }
  all('[data-difficulty]').forEach(button => button.addEventListener('click', () => {
    difficulty = button.dataset.difficulty; savePrefs(); resetGame(false);
  }));
  all('[data-map-scale]').forEach(button => button.addEventListener('click', () => {
    if (game.started && !game.over) return;
    mapScale = normalizeMapScale(Number(button.dataset.mapScale));
    savePrefs(); resetGame(false);
  }));
  $('lobby-speed-choice').addEventListener('change', event => setGameSpeed(event.target.value));
  $('start-button').addEventListener('click', () => resetGame(true));
  $('starter-choice').addEventListener('change', event => { starterByHero[heroId] = event.target.value; savePrefs(); renderLoadout(); });
  $('continue-button').addEventListener('click', continueMatch);
  $('again-button').addEventListener('click', () => resetGame(true));
  $('change-hero-button').addEventListener('click', () => resetGame(false));
  $('save-exit-button').addEventListener('click', () => { if (persistMatch()) { resetGame(false); $('continue-button').focus({preventScroll:true}); } });
  $('save-button').addEventListener('click', () => persistMatch(true));
  $('resume-button').addEventListener('click', () => closeModal());
  $('help-button').addEventListener('click', () => openModal('help'));
  $('guide-button').addEventListener('click', () => openModal('guide'));
  $('guide-action').addEventListener('click', actOnGuide);
  $('buy-recommended').addEventListener('click', () => purchaseItem($('buy-recommended').dataset.itemId));
  $('lobby-help').addEventListener('click', () => openModal('help'));
  $('history-button').addEventListener('click', () => openModal('history'));
  $('end-history-button').addEventListener('click', () => openModal('history'));
  $('end-report-button').addEventListener('click', () => openReport(currentRecord));
  $('report-back-button').addEventListener('click', () => openModal('history'));
  $('history-content').addEventListener('click', event => {
    const button = event.target.closest('[data-record-index]');
    if (button) openReport(matchHistory[Number(button.dataset.recordIndex)], true);
  });
  $('death-recap-button').addEventListener('click', openRecap);
  $('scoreboard-recap-button').addEventListener('click', openRecap);
  $('surrender-button').addEventListener('click', () => {
    const result = game.surrender?.();
    if (!result?.ok) { notify(result?.reason || '현재 경기를 종료할 수 없습니다.', 'bad'); return; }
    updateUI();
  });
  $('brand-home').addEventListener('click', event => { event.preventDefault(); openModal('help'); });
  $('pause-button').addEventListener('click', () => { if (game.started && !game.over) openModal('pause'); });
  $('shop-button').addEventListener('click', () => openModal('shop'));
  $('shop-recall').addEventListener('click', recall);
  $('scoreboard-button').addEventListener('click', () => openModal('scoreboard'));
  $('recall-button').addEventListener('click', recall);
  $('attack-move-button').addEventListener('click', () => setCommand('attackmove'));
  $('stop-button').addEventListener('click', stopPlayer);
  $('focus-target-button').addEventListener('click', cycleFocus);
  $('release-focus-button').addEventListener('click', releaseFocus);
  $('tactics-button').addEventListener('click', toggleTactics);
  $('close-tactics').addEventListener('click', () => { $('tactics-panel').hidden = true; $('tactics-button').setAttribute('aria-expanded', false); canvas.focus({preventScroll:true}); });
  all('[data-order]').forEach(button => button.addEventListener('click', () => issueTeamOrder(button.dataset.order)));
  all('[data-objective]').forEach(button => button.addEventListener('click', () => issueTeamOrder(button.dataset.objective)));
  $('clear-order-button').addEventListener('click', () => { setAim(null); game.setTeamOrder('clear'); updateTactics(); canvas.focus({preventScroll:true}); });
  all('[data-upgrade]').forEach(button => button.addEventListener('click', () => upgrade(button.dataset.upgrade)));
  $('auto-upgrade-button').addEventListener('click', () => { if (game.started && !game.over) { game.autoAllocateSkills(); tone(920, .13); persistMatch(); updateUI(); canvas.focus({preventScroll:true}); } });
  $('inventory').addEventListener('click', event => {
    const button = event.target.closest('[data-inventory]');
    if (!button) return;
    selectedInventory = Number(button.dataset.inventory); updateShop();
  });
  $('sell-button').addEventListener('click', () => {
    const result = game.sell(selectedInventory);
    if (!result?.ok) notify(result?.reason || '판매할 수 없습니다.', 'bad');
    else { selectedInventory = -1; tone(660, .1); persistMatch(); }
    updateUI(); updateShop();
  });
  $('auto-button').addEventListener('click', () => { if (gameplayAvailable()) toggleAutoAttack(); canvas.focus({ preventScroll: true }); });
  $('attack-range-button').addEventListener('click', toggleAttackRange);
  bindTouchAim($('ward-button'), 'ward');
  $('ward-button').addEventListener('click', event => {
    if (skillClickSuppressed(event, $('ward-button'))) return;
    cast('ward', coarse() || event.detail === 0); canvas.focus({ preventScroll: true });
  });
  $('follow-button').addEventListener('click', () => { renderer.follow = true; canvas.focus({ preventScroll: true }); });
  $('cancel-aim-button').addEventListener('click', () => setAim(null));
  $('speed-button').addEventListener('change', event => setGameSpeed(event.target.value, true));
  $('pause-speed-choice').addEventListener('change', event => setGameSpeed(event.target.value));
  function updateSoundButton() {
    $('sound-button').textContent = soundEnabled ? '♫' : '♪';
    $('sound-button').classList.toggle('muted', !soundEnabled);
    $('sound-button').setAttribute('aria-label', soundEnabled ? '소리 끄기' : '소리 켜기');
    $('sound-button').setAttribute('aria-pressed', soundEnabled);
  }
  $('sound-button').addEventListener('click', () => { soundEnabled = !soundEnabled; savePrefs(); activateAudio(); updateSoundButton(); if (game.started) canvas.focus({ preventScroll: true }); });
  all('[data-close]').forEach(button => button.addEventListener('click', () => closeModal()));
  all('.modal-layer').forEach(layer => layer.addEventListener('pointerdown', event => { if (event.target === layer) closeModal(); }));
  for (const [slot, button] of Object.entries(buttons)) {
    bindTouchAim(button, slot);
    button.addEventListener('click', event => {
      if (skillClickSuppressed(event, button) || !gameplayAvailable()) return;
      if (coarse() || event.pointerType === 'touch' || event.detail === 0 || slot === 'f' || skillMeta(slot)?.target === 'self') cast(slot, true);
      else {
        if (game.player.cd?.[slot] > 0) { notify(`${Math.ceil(game.player.cd[slot])}초 후 사용할 수 있습니다.`, 'info', 2); return; }
        setAim(selectedAbility === slot ? null : slot);
      }
      canvas.focus({ preventScroll: true });
    });
    button.addEventListener('pointerenter', () => showSkillTooltip(slot, button));
    button.addEventListener('pointerleave', () => { if (tooltipSlot === slot) $('skill-tooltip').hidden = true; });
  }
  canvas.addEventListener('contextmenu', event => event.preventDefault());
  canvas.addEventListener('pointermove', event => {
    if (aimGesture.active) return;
    const rect = canvas.getBoundingClientRect();
    pointerScreen = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    aim = renderer.screenToWorld(pointerScreen.x, pointerScreen.y); pointerInside = true;
  });
  canvas.addEventListener('pointerleave', () => { pointerInside = false; });
  canvas.addEventListener('pointerdown', event => {
    if (aimGesture.active) return;
    if (!gameplayAvailable() || (!game.player.alive && selectedCommand !== 'rally') || ![0,2].includes(event.button)) return;
    event.preventDefault(); canvas.focus({ preventScroll: true }); activateAudio();
    const rect = canvas.getBoundingClientRect();
    pointerScreen = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    aim = renderer.screenToWorld(pointerScreen.x, pointerScreen.y); pointerInside = true;
    if (selectedAbility && event.button === 0) { cast(selectedAbility); return; }
    if (selectedCommand && event.button === 0) { issueAt(aim.x, aim.y); return; }
    if (selectedAbility || selectedCommand) setAim(null);
    $('tactics-panel').hidden = true; $('tactics-button').setAttribute('aria-expanded', false);
    let target = null, nearest = Infinity;
    for (const entity of game.entities) {
      if (!entity.alive || entity.team === game.player.team || !game.isVisible(entity, 0)) continue;
      const distance = Math.hypot(entity.x - aim.x, entity.y - aim.y);
      if (distance <= (entity.r || 15) + (event.pointerType === 'touch' ? 28 : 13) && distance < nearest) { target = entity; nearest = distance; }
    }
    if (target) {
      const result = game.attackTarget(target.id);
      if (result.ok) selectedTargetId = target.id;
      else notify(result.reason || '공격할 수 없는 대상입니다.', 'info', 2);
    }
    else { selectedTargetId = null; game.commandMove(clamp(aim.x, 20, currentMap().width - 20), clamp(aim.y, 20, currentMap().height - 20)); }
    updateTarget();
  });
  $('minimap').addEventListener('pointerdown', event => {
    if (!gameplayAvailable() || (!game.player.alive && selectedCommand !== 'rally')) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const map = currentMap(), scale = Math.min((rect.width - 10) / map.width, (rect.height - 10) / map.height);
    if (!(scale > 0)) return;
    const ox = (rect.width - map.width * scale) / 2, oy = (rect.height - map.height * scale) / 2;
    const x = clamp((event.clientX - rect.left - ox) / scale, 20, map.width - 20);
    const y = clamp((event.clientY - rect.top - oy) / scale, 20, map.height - 20);
    issueAt(x, y); renderer.follow = true; canvas.focus({ preventScroll: true });
  });
  const joystick = $('joystick');
  function moveJoystick(event) {
    const rect = joystick.getBoundingClientRect(), radius = rect.width * .33;
    let x = event.clientX - rect.left - rect.width / 2, y = event.clientY - rect.top - rect.height / 2;
    const length = Math.hypot(x, y), ratio = length > radius ? radius / length : 1;
    x *= ratio; y *= ratio;
    joyVector = length < 5 ? { x: 0, y: 0 } : { x: x / radius, y: y / radius };
    $('joystick-knob').style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
  }
  joystick.addEventListener('pointerdown', event => {
    if (!gameplayAvailable() || !game.player.alive || joystickId !== null || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation(); joystickId = event.pointerId;
    joystick.setPointerCapture(event.pointerId); moveJoystick(event); activateAudio();
  });
  joystick.addEventListener('pointermove', event => { if (event.pointerId === joystickId) { event.preventDefault(); moveJoystick(event); } });
  const releaseJoystick = event => {
    if (event.pointerId !== joystickId) return;
    joystickId = null; joyVector = { x: 0, y: 0 };
    $('joystick-knob').style.transform = 'translate(-50%, -50%)';
    game.setInputVector(0, 0);
  };
  ['pointerup','pointercancel','lostpointercapture'].forEach(type => joystick.addEventListener(type, releaseJoystick));
  document.addEventListener('keydown', event => {
    const key = keyOf(event);
    if (event.ctrlKey || event.metaKey || event.altKey || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName) || event.target.isContentEditable) return;
    if (key === 'escape') {
      event.preventDefault();
      if (event.repeat) return;
      if (selectedAbility || selectedCommand) setAim(null);
      else if (!$('tactics-panel').hidden) { $('tactics-panel').hidden = true; $('tactics-button').setAttribute('aria-expanded', false); }
      else if (activeModal) closeModal();
      else if (game.started && !game.over) openModal('pause');
      return;
    }
    if (key === 'tab' && (activeModal || game.over) && !scoreboardHeld) {
      const modal = activeModal ? $(`${activeModal}-modal`) : $('end-screen');
      const focusable = [...modal.querySelectorAll('button:not(:disabled), a[href], summary, [tabindex="0"]')].filter(element => element.getClientRects().length > 0);
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (!focusable.includes(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      return;
    }
    if (key === 'c' && game.started && (!activeModal || activeModal === 'recap' || activeModal === 'scoreboard')) {
      event.preventDefault(); if (!event.repeat) openRecap(); return;
    }
    if (!game.started || game.over) return;
    if (key === 'g' && (!activeModal || activeModal === 'guide')) { event.preventDefault(); if (!event.repeat) openModal('guide'); return; }
    if (key === 'p' && (!activeModal || activeModal === 'shop')) { event.preventDefault(); if (!event.repeat) openModal('shop'); return; }
    if (key === 'b' && activeModal === 'shop') { event.preventDefault(); if (!event.repeat) recall(); return; }
    if (key === 't' && !activeModal) { event.preventDefault(); if (!event.repeat) toggleTactics(); return; }
    if (event.target.closest('button,a,[role="button"]') && !scoreboardHeld) return;
    if (key === 'tab' && (!activeModal || activeModal === 'scoreboard')) {
      event.preventDefault();
      if (!event.repeat && activeModal !== 'scoreboard') { openModal('scoreboard'); scoreboardHeld = true; }
      return;
    }
    if (activeModal || game.paused) return;
    if (['arrowup','arrowdown','arrowleft','arrowright'].includes(key)) { event.preventDefault(); keys.add(key); return; }
    if (['q','w','e','r','d','f','4','b',' ','a','s','z','v'].includes(key)) event.preventDefault();
    if (event.repeat) return;
    if (event.shiftKey && ['q','w','e','r'].includes(key)) upgrade(key);
    else if (key === 'a') setCommand('attackmove');
    else if (key === 's') stopPlayer();
    else if (key === 'z') cycleFocus();
    else if (key === 'v') toggleAttackRange();
    else if (['q','w','e','r','d','f'].includes(key)) cast(key);
    else if (key === '4') cast('ward');
    else if (key === 'b') recall();
    else if (key === ' ') toggleAutoAttack();
  });
  document.addEventListener('keyup', event => {
    const key = keyOf(event); keys.delete(key);
    if (key === 'tab' && scoreboardHeld && activeModal === 'scoreboard') { event.preventDefault(); closeModal(); }
  });
  window.addEventListener('blur', clearInput);
  document.addEventListener('visibilitychange', () => {
    accumulator = 0; lastFrame = 0; clearInput();
    if (document.hidden && game.started && !game.over && !activeModal) openModal('pause');
    else if (document.hidden) persistMatch();
  });
  window.addEventListener('pagehide', () => { clearInput(); persistMatch(); });
  window.addEventListener('resize', () => { if (aimGesture.active) setAim(null); renderer.resize(); $('skill-tooltip').hidden = true; });
  function frame(now) {
    if (frameFailed) return;
    try {
      const dt = lastFrame ? Math.min((now - lastFrame) / 1000, .1) : 0;
      lastFrame = now;
      if (!document.hidden) {
        updateInput();
        accumulator = Math.min(accumulator + dt * speed, .3);
        while (accumulator >= 1 / 60) { game.step(1 / 60); accumulator -= 1 / 60; }
        if (game.started && !game.over && game.time >= nextSaveAt) persistMatch();
        const gesture = updateTouchAim();
        if (pointerInside && !gesture) aim = renderer.screenToWorld(pointerScreen.x, pointerScreen.y);
        renderer.render(dt, { aim: gesture?.aim || (pointerInside ? aim : null), selectedAbility, aimBlocked: gesture ? gesture.blocked : !!selectedAbility && aimUnavailable(selectedAbility), attackRangeShown: attackRangeVisible || selectedCommand === 'attackmove' });
        updateAttackUI();
        if (now >= nextUI) { updateUI(); nextUI = now + 100; }
        if (now >= nextMap) { renderer.drawMinimap($('minimap')); nextMap = now + 130; }
      }
    } catch (error) {
      frameFailed = true;
      console.error('Nexus Front render error:', error);
      $('load-error').textContent = '게임 실행 중 오류가 발생했습니다. 새로고침하면 다시 시작할 수 있습니다.';
      $('load-error').hidden = false;
    }
    requestAnimationFrame(frame);
  }
  // Read-only diagnostics for development and support; no game state mutations.
  globalThis.NexusFront = Object.freeze({ version: '7.0.0', snapshot: () => game.getSnapshot(), settings: () => ({ mapScale, speed }) });
  updateSoundButton(); resetGame(false); requestAnimationFrame(frame);
})();
