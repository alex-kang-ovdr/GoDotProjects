(function () {
  'use strict';

  const E = window.BreachEngine;
  const A = window.BreachArt;
  const C = window.BreachCampaign;
  const app = document.getElementById('app');
  const modalRoot = document.getElementById('modal-root');
  const SAVE_KEY = 'breach_command_save_v1';
  const PREF_KEY = 'breach_command_prefs_v1';
  const PROFILE_KEY = 'breach_command_profile_v2';
  const clone = value => JSON.parse(JSON.stringify(value));
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  const coord = (x, y) => String.fromCharCode(65 + x) + (y + 1);
  const sameTile = (a, b) => !!a && !!b && a.x === b.x && a.y === b.y;
  const isAt = (p, x, y) => p.x === x && p.y === y;
  const alive = u => u.hp > 0 && u.x >= 0 && u.y >= 0;
  const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const terrainNames = {ground:'평지', forest:'숲', sand:'모래', water:'물', mountain:'산', building:'도시', chasm:'구덩이', ice:'얼음'};
  const terrainHelp = {ground:'이동과 공격에 제약이 없는 지형입니다.', forest:'무기 피해를 받으면 불이 붙습니다.', sand:'무기 피해를 받으면 연막이 발생합니다.', water:'지상 적은 물에 빠지면 제거됩니다. 지상 메크는 물 안에서 공격할 수 없습니다.', mountain:'이동과 직선 포격을 막는 장애물입니다.', building:'도시의 피해는 공용 전력을 감소시킵니다. 밀치기로 충돌하지 않도록 주의하세요.', chasm:'비행하지 않는 유닛이 빠지면 즉시 제거됩니다.', ice:'충격을 받으면 깨져 물로 변합니다.'};


  if (!E || !A || !C) {
    app.innerHTML = '<div class="boot-screen"><h1>게임을 불러오지 못했습니다</h1><p>페이지를 새로고침해 주세요. 오프라인 파일은 다운로드한 HTML 전체를 열어야 합니다.</p></div>';
    return;
  }

  let preferences = {sound:false, hint:true, fast:false, zoom:false, confirm:false};
  try { preferences = {...preferences, ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}')}; } catch (_) {}
  let state, turnSnapshot = null, undoMoveSnapshot = null, resetsLeft = 1, selectedId = 'mech-1';
  let mode = 'move', hover = null, showThreats = true, busy = false, modalType = '', newSquad = 'rift', newDifficulty = 'normal';
  let toastTimer, hoverFrame, effectTimer, audioContext, keyboardCell = {x:3,y:5};
  let lastSaved = false, modalReturnFocus = null;
  let previewResult = null;
  let lastTouch = false, armedTarget = null;
  let weaponSlot = 'primary', selectedRoute = null, hangarTab = 'upgrade';
  let newUseVeteran = false, newSeed = '', replayLabel = '', activeEvents = [], activeUnitId = null, skipReplay = false;
  let loadNotice = '', importedNotice = '';
  let profile = {version:2, veteran:null, records:[]};
  try { profile = sanitizeProfile(JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}')); } catch (_) {}
  const forecastCache = new WeakMap();

  function validState(s) { return !!s && !!E.validateState(s).valid; }
  function migrated(s) { if (!s) return null; const r=E.migrateState(s); return r.error?null:r.state; }
  function matchingSnapshot(s, current) { return s && s.phase==='player' && current.phase==='player' && s.seed===current.seed && s.squad===current.squad && s.turn===current.turn && s.missionIndex===current.missionIndex && s.mission?.operationId===current.mission?.operationId; }

  function sanitizeProfile(raw) {
    const p={version:2,veteran:null,records:[]};
    if (raw?.veteran && C.PILOTS[raw.veteran.id]) p.veteran={id:raw.veteran.id,xp:Math.max(0,Math.min(4,Math.floor(num(raw.veteran.xp)))),runId:String(raw.veteran.runId||'').slice(0,100)};
    if(Array.isArray(raw?.records)) p.records=raw.records.slice(0,30).filter(r=>r&&typeof r.id==='string'&&E.SQUADS[r.squad]).map(r=>({id:r.id.slice(0,100),won:!!r.won,squad:r.squad,difficulty:r.difficulty==='easy'?'easy':'normal',score:Math.max(0,Math.min(100000,Math.floor(num(r.score)))),missions:Math.max(0,Math.min(5,Math.floor(num(r.missions)))),date:String(r.date||'').slice(0,30)}));
    return p;
  }

  function restoreEnvelope(saved) {
    const restored=migrated(saved?.state);
    if(!restored) return false;
    state=restored;
    const snap=migrated(saved.turnSnapshot), undo=migrated(saved.undoMoveSnapshot?.state);
    turnSnapshot=matchingSnapshot(snap,state)?snap:null;
    undoMoveSnapshot=matchingSnapshot(undo,state)?{state:undo,selectedId:state.units.some(u=>u.id===saved.undoMoveSnapshot?.selectedId)?saved.undoMoveSnapshot.selectedId:'mech-1'}:null;
    resetsLeft=Math.max(0,Math.min(1,Math.floor(num(saved.resetsLeft,1))));
    selectedId=state.units.some(u=>u.id===saved.selectedId&&u.team==='player')?saved.selectedId:'mech-1';
    return true;
  }

  function restore() {
    let raw=null;
    try {
      raw=localStorage.getItem(SAVE_KEY);
      const saved=JSON.parse(raw||'null');
      if(saved && restoreEnvelope(saved)) {
        if(saved.state.schema===1){try{localStorage.setItem('breach_command_legacy_backup',raw);}catch(_){}loadNotice='이전 작전을 복원했습니다. 새 장비와 파일럿 시스템이 적용되었습니다.';}
        lastSaved=true;
        return;
      }
    } catch (_) {}
    if(raw){try{localStorage.setItem('breach_command_recovery',raw);}catch(_){}loadNotice='저장을 읽을 수 없어 복구용 사본을 남겼습니다. 새 작전으로 시작합니다.';}
    state = E.createRun({squad:'rift', difficulty:'normal', seed:Date.now()});
  }

  function saveEnvelope(saveState=state) { return {schema:2,state:saveState,turnSnapshot,undoMoveSnapshot,resetsLeft,selectedId,savedAt:Date.now()}; }
  function persist(saveState=state) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(saveEnvelope(saveState)));
      localStorage.setItem(PROFILE_KEY,JSON.stringify(profile));
      lastSaved = true;
    } catch (_) { lastSaved = false; }
  }

  function savePrefs() { try {localStorage.setItem(PREF_KEY, JSON.stringify(preferences));} catch (_) {} }
  function players() { return state.units.filter(u => u.team === 'player'); }
  function selected() { return state.units.find(u => u.id === selectedId && u.team === 'player'); }
  function unitAt(x, y) { return state.units.find(u => alive(u) && isAt(u,x,y)); }
  function mission() { return state.mission || E.MISSIONS[state.missionIndex] || {}; }
  function missionName() { return mission().name || mission().title || ['해안 교두보','산림 관측소','황무지 전초기지','빙하 발전소','심층 균열'][state.missionIndex]; }
  function objectiveText() { return state.missionIndex === 4 ? '폭탄과 도시 전력을 지키며 5턴을 버티세요.' : `도시 전력을 지키며 ${state.turnLimit || 4}턴을 버티세요.`; }
  function getWeapon(u,slot=weaponSlot) {
    const info=slot==='secondary'?C.GEAR[u?.secondary?.id]:E.WEAPONS[u?.weapon];
    const description=slot==='primary'&&['fist','cannon','artillery','smoke','laser'].includes(u?.weapon)?info?.description.replace(/피해 [0-9]+/g,`피해 ${u.damage}`):info?.description;
    return {name:info?.name||'무기 없음',tag:slot==='secondary'?`보조 장비 · ${u?.secondary?.charges||0}/${u?.secondary?.maxCharges||1}회`:info?.range||'주무기',desc:description||'장비를 선택하세요.'};
  }
  function weaponReady(u,slot=weaponSlot) { return !!u && state.phase==='player' && !busy && E.getTargets(state,u.id,slot).length>0; }
  function webbed(u,s=state) { return !!u && !!E.getWebbedBy?.(s,u.id).length; }
  function pilotInfo(u) { const def=C.PILOTS[u?.pilot?.id];return {...def,xp:u?.pilot?.xp||0,rank:u?.pilot?.rank||0}; }
  function squadName(id=state.squad) { return ({rift:'강습 방어 편대',control:'기상 제어 편대',gravity:'중력 타격 편대'})[id]||E.SQUADS[id]?.name||id; }
  function getForecast(s = state) {
    if (s.phase !== 'player') return {gridDamage:0,playerDamage:0,enemyKills:0,buildingHits:[],state:s,events:[]};
    if (!forecastCache.has(s)) forecastCache.set(s, E.forecast(s));
    return forecastCache.get(s);
  }

  function announce(text) { document.getElementById('announcer').textContent = text; }
  function toast(text, error = false) {
    const el = document.getElementById('toast');
    el.textContent = text;
    el.className = 'show' + (error ? ' error' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = ''; }, error ? 3700 : 2300);
    announce(text);
  }

  function sound(type) {
    if (!preferences.sound) return;
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === 'suspended') audioContext.resume();
      const start = audioContext.currentTime;
      const tones = type === 'attack' ? [110,65] : type === 'reward' ? [330,440,660] : type === 'move' ? [280,360] : [220];
      tones.forEach((freq,i) => {
        const osc = audioContext.createOscillator(), gain = audioContext.createGain();
        osc.type = type === 'attack' ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(freq, start+i*.07);
        gain.gain.setValueAtTime(0, start+i*.07);
        gain.gain.linearRampToValueAtTime(.07, start+i*.07+.008);
        gain.gain.exponentialRampToValueAtTime(.001, start+i*.07+.19);
        osc.connect(gain); gain.connect(audioContext.destination);
        osc.start(start+i*.07); osc.stop(start+i*.07+.21);
      });
    } catch (_) {}
  }

  function render() {
    const restoreBoardFocus = document.activeElement?.id === 'board-stage';
    const previousScroll = document.getElementById('board-scroll')?.scrollLeft||0;
    const u = selected(), isDeploy = state.phase === 'deploy';
    if (!u || !alive(u)) selectedId = players().find(alive)?.id || 'mech-1';
    const turn = Math.min(state.turn || 1, state.turnLimit || 4);
    const squad = squadName();
    app.innerHTML = `
      <div class="shell">
        <header class="topbar">
          <div class="brand"><div class="brand-mark">B<span>/</span>C</div><div><h1>BREACH COMMAND</h1><p>전술 방어 작전 <span class="version-mark">/ 02</span></p></div></div>
          <div class="top-actions">
            <button class="connection record-link" data-action="records"><i class="status-dot"></i> ${profile.records.filter(r=>r.won).length} VICTORIES</button><span class="tiny-separator"></span>
            <button class="text-button new-run-button" data-action="new" title="새 캠페인 시작">${A.icon('reset',16)}<span>새 작전</span></button>
            <a class="icon-button" href="./breach-command-offline.html" download="Breach_Command.html" title="오프라인 HTML 다운로드" aria-label="오프라인 HTML 다운로드">${A.icon('download',19)}</a>
            <button class="icon-button" data-action="storage" title="저장 내보내기·불러오기" aria-label="저장 관리">${A.icon('save',19)}</button>
            <button class="icon-button" data-action="sound" title="효과음 ${preferences.sound?'끄기':'켜기'}" aria-label="효과음 ${preferences.sound?'끄기':'켜기'}" aria-pressed="${preferences.sound}">${A.icon(preferences.sound?'volume':'muted',20)}</button>
            <button class="icon-button" data-action="help" title="플레이 가이드 (H)" aria-label="플레이 가이드">${A.icon('help',20)}</button>
          </div>
        </header>
        <section class="campaign-bar" aria-label="캠페인 진행과 공용 자원">
          <div class="mission-heading"><span class="mission-code">${String(state.missionIndex+1).padStart(2,'0')}</span><div><span class="eyebrow">OPERATION / ${state.missionIndex===4?'FINAL DEFENSE':'CITY DEFENSE'}</span><h2>${esc(missionName())}</h2></div>
            <div class="campaign-progress" aria-label="5개 임무 중 ${state.missionIndex+1}번째">${Array.from({length:5},(_,i)=>`<span class="progress-node ${i<state.missionIndex?'done':i===state.missionIndex?'active':''}" title="임무 ${i+1}">${i<state.missionIndex?A.icon('check',10):String(i+1).padStart(2,'0')}</span>`).join('')}</div>
          </div>
          <div class="run-stats">
            <div class="grid-panel"><div class="grid-label">${A.icon('bolt',13)} 공용 전력</div><div class="grid-reading"><div class="grid-pips">${Array.from({length:state.maxGrid||7},(_,i)=>`<i class="grid-pip ${i<state.grid?'on':''} ${state.grid<=2?'danger':''}"></i>`).join('')}</div><span class="grid-number">${state.grid}<small> / ${state.maxGrid||7}</small></span></div></div>
            <div class="counter core"><span class="eyebrow">${A.icon('core',13)} 강화 코어</span><strong>${String(state.cores||0).padStart(2,'0')}</strong></div>
            <div class="counter desktop-only"><span class="eyebrow">작전 난이도</span><strong class="difficulty-label">${state.difficulty==='easy'?'안정':'표준'}</strong></div>
          </div>
        </section>
        ${preferences.hint && state.missionIndex===0 ? `<div class="hint-banner">${A.icon('target',19)}<div><strong>${isDeploy?'첫 작전을 준비하세요.':'적의 다음 공격은 이미 공개되어 있습니다.'}</strong><span>${isDeploy?'메크를 선택해 아래쪽 배치 구역에 놓은 뒤 「작전 시작」을 누르세요. 기본 배치로 바로 시작할 수도 있습니다.':'메크 선택 → 이동 → 주무기 또는 보조 장비. 적과 환경 위험을 함께 활용해 도시를 지키세요.'}</span></div><button class="icon-button" data-action="dismiss-hint" aria-label="안내 닫기">${A.icon('close',16)}</button></div>`:''}
        <main class="game-layout">
          <div class="left-field">
            <section class="board-panel" aria-label="전술 전장">
              <div class="board-top"><div class="board-location"><span class="phase-tag ${busy?'enemy':''}">${busy?'적 행동 중':isDeploy?'배치 단계':state.phase==='player'?'플레이어 턴':state.phase==='reward'?'임무 완료':state.phase==='won'?'작전 성공':'작전 종료'}</span><span>${esc(squad)}</span></div><div class="turn-display"><span>TURN <strong>${turn}</strong> / ${state.turnLimit||4}</span><div class="turn-pips">${Array.from({length:state.turnLimit||4},(_,i)=>`<i class="${i+1<turn?'done':i+1===turn?'current':''}"></i>`).join('')}</div></div></div>
              <div class="tactical-tools"><button data-action="briefing">${A.icon('flag',14)} 작전 브리핑</button><button class="${preferences.fast?'on':''}" data-action="fast" aria-pressed="${!!preferences.fast}">${A.icon('fast',14)} ${preferences.fast?'빠른 재생':'순서대로 재생'}</button><button class="${preferences.zoom?'on':''}" data-action="zoom" aria-pressed="${!!preferences.zoom}">${A.icon('zoom',14)} ${preferences.zoom?'전체 보기':'전장 확대'}</button></div>
              <div class="board-scroll ${preferences.zoom?'zoomed':''}" id="board-scroll"><div class="board-stage" id="board-stage" tabindex="0" role="application" aria-label="전술 전장. 방향키로 칸을 고르고 Enter로 선택할 수 있습니다.">
                <div class="board-annotation"><span class="tiny-label">LIVE TACTICAL FEED</span><span class="tiny-value">SECTOR ${String(state.missionIndex+1).padStart(2,'0')} <i></i> 8 × 8</span></div>
                <button class="board-toggle ${showThreats?'on':''}" data-action="threats" aria-pressed="${showThreats}">${A.icon('eye',14)} 공격 예고</button>
                <div class="board-svg" id="board-svg"></div><div class="effect-layer" id="effect-layer" aria-hidden="true"></div>
                <div class="compass">${A.icon('target',22)}<span>TACTICAL GRID</span></div><div id="aim-controls" class="aim-controls"></div>
                ${busy?`<div class="replay-banner"><span>${esc(replayLabel||'적 공세 진행')}</span><button data-action="skip-replay">결과 보기 ${A.icon('fast',14)}</button></div>`:''}
              </div></div>
              <div class="board-bottom"><div class="tile-caption" id="tile-caption"></div><div class="legend"><span><i></i>아군</span><span><i class="enemy"></i>적</span><span><i class="spawn"></i>출현</span></div></div>
              ${state.phase==='player'?`<div class="mobile-commandbar"><button data-action="mode-move" class="${mode==='move'?'active':''}" ${busy||selected()?.moved||selected()?.acted||selected()?.frozen||webbed(selected())?'disabled':''}>${A.icon('move',16)} 이동</button><button data-action="mode-attack" class="${mode==='attack'&&weaponSlot==='primary'?'active':''}" ${weaponReady(selected(),'primary')?'':'disabled'}>${A.icon('attack',16)} 무기</button><button data-action="mode-secondary" class="${mode==='attack'&&weaponSlot==='secondary'?'active':''}" ${weaponReady(selected(),'secondary')?'':'disabled'}>${A.icon('gear',16)} 보조 ${selected()?.secondary?.charges||0}</button><button data-action="repair" ${busy||selected()?.acted?'disabled':''}>${A.icon('repair',16)} ${selected()?.frozen?'해동':'수리'}</button></div><div class="mobile-forecast" id="mobile-forecast"></div>`:''}
            </section>
            <div class="section-row"><h3>MECH SQUAD <span>메크 편대</span></h3><span>SELECT <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd></span></div>
            <div class="squad-grid">${players().map((m,i)=>unitCard(m,i)).join('')}</div>
            ${objectivePanel()}
          </div>
          <aside class="right-rail" aria-label="유닛 명령과 적 행동">
            <section class="panel command-panel"><div class="panel-header"><h3>COMMAND</h3><span class="tiny">${isDeploy?'메크 배치':'유닛 명령'}</span></div><div id="command-content" class="command-content">${commandPanel()}</div></section>
            <section class="panel turn-actions"><div class="turn-action-inner">${turnActions()}</div><div id="forecast"></div></section>
            <section class="panel"><div class="panel-header"><h3>ENEMY INTENT</h3><span class="tiny" id="intent-label">행동 순서</span></div><div class="hazard-summary" id="hazard-summary"></div><div class="threat-list" id="threat-list">${threatList()}</div><div class="spawn-summary">${A.icon('target',14)} 다음 출현 <strong>${(state.spawn||[]).length}</strong><span>표식 위에 서면 피해 1을 받고 출현을 막습니다</span></div></section>
            <section class="panel log-panel"><div class="panel-header"><h3>FIELD LOG</h3><span class="tiny">전장 기록</span></div><div class="log-list">${logLines()}</div></section>
          </aside>
        </main>
        <footer class="bottom-bar"><span class="save-mark"><i class="status-dot"></i>${lastSaved?'자동 저장됨':'저장 불가 · 내보내기를 이용하세요'}<span class="footer-divider">/</span>CAMPAIGN 2.0</span><span class="shortcut-hint"><kbd>M</kbd> 이동 <kbd>A</kbd> 주무기 <kbd>Q</kbd> 보조 장비 <kbd>Space</kbd> 턴 종료</span><button class="text-button" data-action="codex">전술 도감 ${A.icon('arrow',13)}</button></footer>
      </div>`;
    renderBoard();
    renderForecast();
    renderCaption();
    renderIntents();
    if (modalType) renderModal();
    const scroller=document.getElementById('board-scroll'); if(scroller)scroller.scrollLeft=previousScroll;
    if (restoreBoardFocus && !modalType) document.getElementById('board-stage')?.focus({preventScroll:true});
  }

  function unitCard(u, i) {
    const dead=!alive(u), p=pilotInfo(u), statuses=[u.frozen?'빙결':null,webbed(u)?'구속':null,u.fire?'화염':null,u.acid?'산성':null,u.shield?'보호막':null].filter(Boolean);
    return `<button class="unit-card ${selectedId===u.id?'selected':''} ${u.acted?'done':''} ${dead?'disabled-unit':''}" data-action="select" data-id="${esc(u.id)}" ${dead||busy?'disabled':''} aria-pressed="${selectedId===u.id}"><div class="unit-card-top"><div class="unit-portrait">${A.unitIcon(u.kind,'player',62)}</div><div class="unit-title"><span class="eyebrow">${esc(p.name||'PILOT')} · RANK ${p.rank}</span><h3>${esc(u.name)}</h3></div><kbd class="unit-key">${i+1}</kbd></div><div class="unit-card-bottom"><div class="hp-row"><div class="hp-pips">${Array.from({length:u.maxHp},(_,j)=>`<i class="hp-pip ${j<u.hp?'on':''}"></i>`).join('')}</div><span class="hp-label">${Math.max(0,u.hp)}/${u.maxHp}</span></div><div class="action-dots"><span class="${!u.moved&&!u.acted&&!dead?'ready':'spent'}">${A.icon('move',11)} 이동</span><span class="${!u.acted&&!dead?'ready':'spent'}">${A.icon('attack',11)} 행동</span></div></div><div class="unit-state-label">${dead?'전투 불능 · 다음 임무에서 복구':statuses.length?statuses.join(' · '):u.acted?'행동 완료':state.phase==='deploy'?'배치 변경 가능':`보조 ${u.secondary?.charges||0}회 · 명령 대기`}</div></button>`;
  }

  function pilotStrip(u) {
    const p=pilotInfo(u);
    return `<div class="pilot-strip"><span class="pilot-badge">${A.icon('pilot',17)}</span><div><strong>${esc(p.name||'파일럿')} <small>${esc(p.role||'')} · R${p.rank}</small></strong><p>${esc(p.rank>=1?p.trait+' 활성':p.trait+' · XP 2에 해금')}${p.rank>=2?' · 내구 +1':''}</p></div><div class="xp-track" title="임무 완료마다 XP +1. XP 2에 특성, XP 4에 최대 내구도 +1.">${Array.from({length:4},(_,i)=>`<i class="${i<p.xp?'on':''}"></i>`).join('')}<span>${p.rank>=2?'MAX':`XP ${p.xp}/4`}</span></div></div>`;
  }

  function commandPanel() {
    const u=selected();
    if(!u)return '<div class="command-prompt">전장에서 메크를 선택하세요.</div>';
    const w=getWeapon(u),active=state.phase==='player'&&!busy&&alive(u),canMove=active&&!u.moved&&!u.acted&&!u.frozen&&!webbed(u),tile=alive(u)?state.tiles[u.y*8+u.x]:null;
    const blockedReason=active&&!u.acted?(u.frozen?'빙결 중입니다. 수리로 해동하세요.':tile?.smoke?'연막 안에서는 공격할 수 없습니다.':tile?.type==='water'&&!u.flying?'물 밖으로 이동한 뒤 공격하세요.':webbed(u)?'거미줄 구속: 거미를 밀치거나 무력화하면 이동할 수 있습니다.':''):'';
    return `<div class="selected-overview"><div class="unit-portrait">${A.unitIcon(u.kind,'player',66)}</div><div><span class="eyebrow">${state.phase==='deploy'?'READY TO DEPLOY':'SELECTED UNIT'}</span><h2>${esc(u.name)}</h2><p>${alive(u)?coord(u.x,u.y):'전투 불능'} <span>·</span> ${u.flying?'비행형':'지상형'}</p></div></div>${pilotStrip(u)}
      <div class="unit-metrics"><span>내구도 <strong>${Math.max(0,u.hp)}<small>/${u.maxHp}</small></strong></span><span>이동 <strong>${u.move}</strong></span><span>주무기 피해 <strong>${u.damage||0}</strong></span></div>
      ${state.phase==='deploy'?`<div class="deployment-note">${A.icon('move',17)}<p>메크를 선택하고 <strong>연두색 배치 칸</strong>을 누르세요. 기본 배치로 바로 출격할 수 있습니다.</p></div>`:`<div class="mode-buttons three"><button class="mode-btn ${mode==='move'?'active move':''}" data-action="mode-move" ${canMove?'':'disabled'}>${A.icon('move',18)}<span>이동</span><kbd>M</kbd></button><button class="mode-btn ${mode==='attack'&&weaponSlot==='primary'?'active attack':''}" data-action="mode-attack" ${weaponReady(u,'primary')?'':'disabled'}>${A.icon('attack',18)}<span>주무기</span><kbd>A</kbd></button><button class="mode-btn ${mode==='attack'&&weaponSlot==='secondary'?'active attack':''}" data-action="mode-secondary" ${weaponReady(u,'secondary')?'':'disabled'}>${A.icon('gear',18)}<span>보조 ${u.secondary?.charges||0}</span><kbd>Q</kbd></button></div>`}
      <div class="weapon-info"><div class="weapon-label"><strong>${esc(w.name)}</strong><span class="weapon-badge">${esc(w.tag)}</span></div><p>${esc(w.desc)}</p>${blockedReason?`<p class="blocked-reason">${blockedReason}</p>`:''}</div>
      ${state.phase!=='deploy'?`<button class="repair-button" data-action="repair" ${active&&!u.acted?'':'disabled'}>${A.icon('repair',17)}<span>${u.frozen?'빙결 해제':`수리 +${u.pilot?.id==='engineer'&&u.pilot.rank>=1?2:1}`} <small>상태 해제 · 행동 소모</small></span><kbd>R</kbd></button>`:''}`;
  }

  function objectivePanel() {
    const goals=E.getObjectives?.(state)||C.evaluateObjectives(state);
    return `<section class="objectives"><div class="objective-main">${A.icon('flag',20)}<div><strong>${objectiveText()}</strong><p>화염 → 환경 → 적 공격 → 출현 순서로 판정됩니다.</p></div><button class="text-button" data-action="briefing">브리핑 ${A.icon('arrow',13)}</button></div>${goals.length?`<div class="objective-goals">${goals.map(g=>`<div class="goal ${g.status}" title="${esc(g.description)}"><span>${A.icon(g.status==='complete'?'check':g.status==='failed'?'close':'target',14)}</span><div><strong>${esc(g.name)}</strong><small>${g.status==='complete'?'달성':g.status==='failed'?'실패':`${g.current}/${g.target}`}${g.reward?` · 코어 +${g.reward}`:''}</small></div></div>`).join('')}</div>`:''}</section>`;
  }

  function turnActions() {
    const phase = state.phase;
    if (phase === 'deploy') return `<button class="main-action" data-action="begin">${A.icon('play',19)}<span class="action-text">작전 시작<small>기본 배치로 바로 출격할 수 있습니다</small></span><kbd>↵</kbd></button>`;
    if (phase === 'reward') return `<button class="main-action" data-action="reward">${A.icon('core',20)}<span class="action-text">메크 정비<small>강화 후 다음 임무로</small></span>${A.icon('arrow',18)}</button>`;
    if (phase === 'won' || phase === 'lost') return `<button class="main-action ${phase==='lost'?'orange':''}" data-action="result">${A.icon(phase==='won'?'flag':'reset',20)}<span class="action-text">${phase==='won'?'작전 결과':'다시 도전하기'}<small>${phase==='won'?'도시를 지켰습니다':'새로운 전략으로 출격하세요'}</small></span>${A.icon('arrow',18)}</button>`;
    const remaining = players().filter(u=>alive(u)&&!u.acted).length;
    return `<button class="main-action" data-action="end-turn" ${busy?'disabled':''}>${A.icon('arrow',20)}<span class="action-text">${busy?'적 행동 진행 중':'턴 종료'}<small>${remaining?`미행동 메크 ${remaining}대 · 종료 시 대기`:'모든 메크가 행동을 마쳤습니다'}</small></span><kbd>SPACE</kbd></button><div class="secondary-actions"><button data-action="undo" ${undoMoveSnapshot&&!busy?'':'disabled'}>${A.icon('undo',14)} 이동 취소 <kbd>U</kbd></button><button data-action="reset-turn" ${resetsLeft&&turnSnapshot&&!busy?'':'disabled'}>${A.icon('reset',14)} 턴 초기화 <span>${resetsLeft}/1</span></button></div>`;
  }

  function projectedState() { return previewResult?.state||state; }
  function projectedThreats(s=projectedState()) { return (s.phase==='player'&&!busy&&E.resolvedThreats?E.resolvedThreats(s):E.threats(s)).map(t=>({...t,targets:t.actualTargets||t.targets})); }
  function threatList(s=state) {
    const threats=projectedThreats(s);
    if(!threats.length)return '<div class="threat-empty">현재 예고된 공격이 없습니다.</div>';
    return threats.map((t,i)=>{
      const enemy=s.units.find(u=>u.id===t.unitId),aura=t.kind==='aura'||enemy?.kind==='psion',destination=(t.targets||[]).map(p=>coord(p.x,p.y)).join(', ');
      const why=t.reason||t.cancelReason||'공격 전에 무력화';
      return `<button class="threat-row ${t.canceled&&!aura?'canceled':''}" data-action="inspect-enemy" data-id="${esc(t.unitId)}"><span class="threat-order">${aura?'+':String(i+1).padStart(2,'0')}</span><span class="threat-icon">${A.unitIcon(enemy?.kind||'scorpion','enemy',33)}</span><span class="threat-description"><strong>${enemy?.alpha?'α ':''}${esc(enemy?.name||t.label||'외계 생물')}</strong><p>${aura?'다른 적에게 장갑 +1':t.canceled?esc(why):`${esc(destination||'공격 준비')} · ${esc(t.label||'공격')}`}</p></span><span class="threat-damage ${t.canceled?'safe':''}">${aura?A.icon('shield',14):t.canceled?'—':t.damage?`−${t.damage}`:'+'}</span></button>`;
    }).join('');
  }
  function renderIntents() {
    const s=projectedState(),el=document.getElementById('threat-list'),label=document.getElementById('intent-label'),hazard=document.getElementById('hazard-summary');
    if(el)el.innerHTML=threatList(s);
    if(label)label.textContent=previewResult?'행동 적용 후 예상':'행동 순서';
    if(hazard){const hs=s.hazards||[];hazard.innerHTML=hs.length?`<strong>${A.icon('target',14)} 환경: ${esc(hs[0].label||'위험 구역')}</strong><span>${hs.map(h=>coord(h.x,h.y)).join(' · ')} / 적 공격보다 먼저 발동</span>`:'';hazard.hidden=!hs.length;}
  }

  function logLines() {
    const logs = (state.log||[]).slice(-4).reverse();
    return logs.length?logs.map((l,i)=>`<div class="log-line"><span>${String((state.turn||1)).padStart(2,'0')}</span><p>${esc(typeof l==='string'?l:l.text||l.message||'상태 갱신')}</p>${i===0?'<i></i>':''}</div>`).join(''):'<div class="log-line"><span>00</span><p>작전 통신 연결. 메크 편대가 대기 중입니다.</p></div>';
  }

  function calculatePreview() {
    previewResult=null;
    const u=selected();
    if(!hover||!u||state.phase!=='player'||busy)return;
    const candidates=mode==='attack'?E.getTargets(state,u.id,weaponSlot):mode==='move'?E.getMoves(state,u.id):[];
    if(!candidates.some(p=>sameTile(p,hover)))return;
    const r=E.preview(state,{type:mode==='attack'?'attack':'move',slot:weaponSlot,unitId:u.id,x:hover.x,y:hover.y});
    if(!r.error)previewResult=r;
  }

  function renderBoard() {
    const container=document.getElementById('board-svg');if(!container)return;
    const u=selected();calculatePreview();
    container.innerHTML=A.board(state,{
      selectedId,hover,mode:state.phase==='deploy'?'deploy':mode,
      moves:!busy&&state.phase==='player'&&mode==='move'&&u?E.getMoves(state,u.id):[],
      targets:!busy&&state.phase==='player'&&mode==='attack'&&u?E.getTargets(state,u.id,weaponSlot):[],
      deploymentTiles:state.phase==='deploy'&&u?E.getDeploymentTiles(state,u.id):[],
      threats:projectedThreats(),showThreats,webLinks:E.webLinks?.(projectedState())||[],
      movePath:!busy&&hover&&mode==='move'&&u?E.getMovePath?.(state,u.id,hover.x,hover.y)||[]:[],
      markerScale:matchMedia('(max-width: 900px)').matches&&!preferences.zoom?1.4:1,
      activeEvents,activeUnitId,previewState:previewResult?.state||null,previewEvents:previewResult?.events||[]
    });
    const aim=document.getElementById('aim-controls');
    if(aim)aim.innerHTML=(lastTouch||preferences.confirm)&&armedTarget&&previewResult?`<button data-action="confirm-attack">${A.icon('attack',16)} ${coord(armedTarget.x,armedTarget.y)} 공격 확정</button>`:'';
  }

  function renderForecast() {
    const elements=[document.getElementById('forecast'),document.getElementById('mobile-forecast')].filter(Boolean);
    if(state.phase!=='player'||busy){elements.forEach(el=>el.innerHTML='');return;}
    const base=projectedState(),f=getForecast(base),loss=f.state?.phase==='lost',bomb=base.units.find(u=>u.kind==='bomb'),nextBomb=f.state?.units.find(u=>u.kind==='bomb');
    const bombDamage=bomb?Math.max(0,bomb.hp-(nextBomb?.hp||0)):0,danger=f.gridDamage>0||loss||bombDamage>0;
    const lossReason=loss?(f.state.grid<=0?'전력 소진':bomb&&nextBomb?.hp<=0?'폭탄 파괴':'메크 전멸'):'';
    const html=`<div class="forecast ${danger?'danger':''}"><div>${A.icon(danger?'bolt':'shield',16)}<span>${previewResult?'이 행동 후 턴 종료 시':'지금 턴을 종료하면'}</span></div><strong class="forecast-value">${loss?'작전 실패 예상':f.gridDamage>0?`전력 −${f.gridDamage}`:bombDamage>0?`폭탄 −${bombDamage}`:'전력 안전'}<small>${loss?lossReason:`메크 피해 ${f.playerDamage||0}${bombDamage?` · 폭탄 −${bombDamage}`:''}${f.enemyKills?` · 적 제거 ${f.enemyKills}`:''}`}</small></strong></div>`;
    elements.forEach(el=>el.innerHTML=html);
  }

  function renderCaption() {
    const el = document.getElementById('tile-caption');
    if (!el) return;
    if (!hover) {el.innerHTML = `<strong>${state.phase==='deploy'?'배치할 메크를 선택하세요':mode==='attack'?'무기 목표를 선택하세요':'메크를 선택하고 이동하세요'}</strong><p>${state.phase==='deploy'?'연두색 칸: 배치 가능 구역':mode==='attack'?'목표에 마우스를 올리면 결과가 미리 표시됩니다.':'파란 칸: 이동 가능 · 주황 화살표: 적 공격 예고'}</p>`;return;}
    const t = state.tiles[hover.y*8+hover.x], u=unitAt(hover.x,hover.y);
    let text = u?`${u.name} · 내구도 ${u.hp}/${u.maxHp}${u.frozen?' · 빙결':''}${u.fire?' · 화염':''}`:(terrainNames[t.type]||t.type);
    let description = terrainHelp[t.type] || '';
    if(t.item==='pod')description='구조 포드: 메크로 수집하면 작전 완료 시 코어 +1. 공격받거나 적이 밟으면 파괴됩니다.';
    if(t.objective)description='보호 시설: 작전 종료까지 건물이 남아 있으면 보조 목표 달성.';
    const hazard=state.hazards?.find(h=>sameTile(h,hover));if(hazard)description=`${hazard.label} · 이번 턴 종료 발동. ${description}`;
    if (previewResult) {
      const messages = previewResult.events.filter(e=>e.text).map(e=>e.text);
      description = messages.slice(0,2).join(' · ') || (mode==='move'?'이 칸으로 이동합니다.':'선택한 무기를 사용합니다.');
    } else if (u?.team==='enemy') description = E.threats(state).find(v=>v.unitId===u.id)?.label || '공격 순서와 예고 위치를 확인하세요.';
    el.innerHTML = `<span class="tile-coord">${coord(hover.x,hover.y)}</span><div><strong>${esc(text)}</strong><p>${esc(description)}</p></div>`;
  }

  function setHover(next) {
    if (sameTile(hover,next)||(!hover&&!next)||busy) return;
    if(armedTarget&&!sameTile(armedTarget,next))armedTarget=null;
    hover = next;
    cancelAnimationFrame(hoverFrame);
    hoverFrame=requestAnimationFrame(()=>{renderBoard();renderCaption();renderForecast();renderIntents();});
  }

  function selectUnit(id) {
    const u=state.units.find(v=>v.id===id&&v.team==='player');
    if (!u||!alive(u)||busy) return;
    selectedId=id; hover=null; armedTarget=null; weaponSlot='primary'; keyboardCell={x:u.x,y:u.y}; mode=u.moved&&!u.acted?'attack':'move';
    render();sound('select');announce(`${u.name} 선택. 이동 ${u.move}, 내구도 ${u.hp}.`);
  }

  function accept(result, options = {}) {
    if (result.error) {toast(result.error,true);return false;}
    state=result.state;hover=null;previewResult=null;armedTarget=null;
    if (options.newTurn) {turnSnapshot=clone(state);undoMoveSnapshot=null;}
    recordOutcome();persist();render();
    if(options.animate!==false)effects(result.events||[]);
    if (options.sound) sound(options.sound);
    const last = (result.events||[]).filter(e=>e.text).slice(-1)[0];
    if (last) announce(last.text);
    if (['reward','won','lost'].includes(state.phase)) {
      modalType=state.phase==='reward'?'reward':'result';
      if(state.phase==='reward'){hangarTab='upgrade';selectedRoute=null;}
      renderModal();sound(state.phase==='lost'?'attack':'reward');
    }
    return true;
  }

  function effects(events) {
    const layer=document.getElementById('effect-layer');if(!layer)return;
    clearTimeout(effectTimer);
    layer.innerHTML=A.effects?A.effects(events,{duration:preferences.fast?220:650,stagger:24,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,state}):'';
    effectTimer=setTimeout(()=>{const el=document.getElementById('effect-layer');if(el)el.innerHTML='';},1100);
  }

  function clickTile(x,y) {
    if (busy||modalType) return;
    keyboardCell={x,y};
    const at=unitAt(x,y), u=selected();
    if (state.phase==='deploy') {
      if(at?.team==='player') {selectUnit(at.id);return;}
      if(u)accept(E.deploy(state,u.id,x,y),{sound:'move'});
      return;
    }
    if(state.phase!=='player'){setHover({x,y});return;}
    if (mode==='attack'&&u&&!u.acted) {
      const targets=E.getTargets(state,u.id,weaponSlot);
      if(targets.some(p=>isAt(p,x,y))){
        if((lastTouch||preferences.confirm)&&!sameTile(armedTarget,{x,y})){armedTarget={x,y};hover={x,y};renderBoard();renderCaption();renderForecast();renderIntents();toast('예상 결과를 확인한 뒤 공격 확정 또는 같은 목표를 한 번 더 누르세요.');return;}
        const result=E.command(state,{type:'attack',slot:weaponSlot,unitId:u.id,x,y});
        if(!result.error){undoMoveSnapshot=null;mode='move';}
        accept(result,{sound:'attack'});return;
      }
    }
    if(at?.team==='player'){selectUnit(at.id);return;}
    if(mode==='move'&&u&&E.getMoves(state,u.id).some(p=>isAt(p,x,y))){
      const before=clone(state), result=E.command(state,{type:'move',unitId:u.id,x,y});
      if(!result.error){undoMoveSnapshot={state:before,selectedId};mode='attack';weaponSlot='primary';}
      accept(result,{sound:'move'});return;
    }
    setHover({x,y});
    if(at?.team==='enemy') toast(`${at.name}: ${E.threats(state).find(t=>t.unitId===at.id)?.label||'공격 예고를 확인하세요.'}`);
    else if(mode==='attack')toast('주황색으로 표시된 유효 목표를 선택하세요.');
    else if(u?.moved)toast('이미 이동했습니다. 무기를 사용하거나 턴을 종료하세요.');
  }

  function beginBattle() {
    if(state.phase!=='deploy')return;
    mode='move';
    accept(E.beginBattle(state),{newTurn:true,sound:'reward'});
    toast('공격 예고를 확인하고 도시를 지키세요.');
  }

  async function endTurn() {
    if(state.phase!=='player'||busy||modalType)return;
    const result=E.endTurn(state,{trace:true});
    if(result.error){toast(result.error,true);return;}
    busy=true;skipReplay=false;hover=null;armedTarget=null;previewResult=null;undoMoveSnapshot=null;
    // Store the resolved turn first. Reloading during playback never replays or pays rewards twice.
    turnSnapshot=result.state.phase==='player'?clone(result.state):null;
    persist(result.state);
    const frames=result.frames||[];
    if(!preferences.fast&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
      for(const frame of frames){
        if(skipReplay)break;
        state=frame.state;replayLabel=frame.label;activeEvents=frame.events||[];
        activeUnitId=activeEvents.find(e=>e.type==='attack'||e.type==='enemyAttack')?.unitId||null;
        render();effects(activeEvents);
        if(activeEvents.some(e=>/attack|damage|explosion/.test(e.type)))sound('attack');
        await new Promise(resolve=>setTimeout(resolve,activeEvents.length?650:230));
      }
    }
    busy=false;activeEvents=[];activeUnitId=null;replayLabel='';mode='move';weaponSlot='primary';
    if(result.state.phase==='player')selectedId=result.state.units.find(u=>u.team==='player'&&alive(u))?.id||selectedId;
    accept(result,{newTurn:result.state.phase==='player',animate:preferences.fast});
  }

  function repair() {
    const u=selected();if(!u||busy||state.phase!=='player')return;
    const result=E.command(state,{type:'repair',unitId:u.id});
    if(!result.error){undoMoveSnapshot=null;mode='move';}
    accept(result,{sound:'reward'});
  }

  function undoMove() {
    if(!undoMoveSnapshot||busy||state.phase!=='player')return;
    state=clone(undoMoveSnapshot.state);selectedId=undoMoveSnapshot.selectedId;undoMoveSnapshot=null;mode='move';weaponSlot='primary';hover=null;armedTarget=null;
    persist();render();toast('마지막 이동을 취소했습니다.');
  }

  function resetTurn() {
    if(!turnSnapshot||!resetsLeft||busy||state.phase!=='player')return;
    state=clone(turnSnapshot);resetsLeft--;undoMoveSnapshot=null;hover=null;armedTarget=null;mode='move';weaponSlot='primary';
    persist();render();toast('현재 턴의 시작 상태로 돌아왔습니다. 임무당 1회 사용할 수 있습니다.');
  }

  function openModal(type) {
    modalReturnFocus=document.activeElement;
    modalType=type;
    if(type==='new'){newSquad=state.squad;newDifficulty=state.difficulty;newUseVeteran=!!profile.veteran;newSeed='';}
    renderModal();
    setTimeout(()=>modalRoot.querySelector('button:not([disabled])')?.focus(),0);
  }

  function closeModal() {
    modalType='';modalRoot.innerHTML='';document.body.classList.remove('modal-open');
    if(modalReturnFocus&&document.contains(modalReturnFocus))modalReturnFocus.focus();
    else document.getElementById('board-stage')?.focus({preventScroll:true});
  }

  function modalShell(title,subtitle,body,footer='',wide=false) {
    return `<div class="modal-backdrop" data-action="backdrop"><section class="modal ${wide?'wide':''}" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header class="modal-top"><div><span class="eyebrow">BREACH COMMAND</span><h2 id="modal-title">${esc(title)}</h2><p>${esc(subtitle)}</p></div><button class="icon-button modal-close" data-action="close-modal" aria-label="창 닫기">${A.icon('close',22)}</button></header><div class="modal-body">${body}</div>${footer?`<footer class="modal-footer">${footer}</footer>`:''}</section></div>`;
  }

  function renderModal() {
    if(!modalType)return;
    document.body.classList.add('modal-open');
    const views={help:helpModal,new:newRunModal,reward:hangarModal,result:resultModal,storage:storageModal,records:recordsModal,codex:codexModal,briefing:briefingModal};
    modalRoot.innerHTML=(views[modalType]||helpModal)();
  }

  function helpModal() {
    const tips=[['eye','다음 결과를 먼저 보세요','적의 목표와 순서가 공개됩니다. 이동·공격 목표에 올리면 바뀐 공격 예고와 턴 종료 피해를 함께 확인할 수 있습니다.'],['move','이동 후, 한 번의 행동','메크마다 이동 1회와 행동 1회. 주무기·보조 장비·수리가 행동을 공유합니다. 공격 후에는 이동할 수 없습니다.'],['gear','보조 장비를 아껴 쓰세요','주변 밀치기, 보호막, 산성 투사기. 각 장비는 임무당 1회 사용하며 다음 임무에서 충전됩니다.'],['target','환경도 공격 수단입니다','화염, 환경 위험, 적 공격, 출현 순서로 처리합니다. 적을 위험 구역으로 밀거나 거미줄·폭발을 활용하세요.'],['pod','보상과 위험을 선택하세요','메크로 구조 포드를 수집하면 코어를 얻습니다. 보조 목표와 작전 위험을 비교해 다음 경로를 선택하세요.'],['pilot','파일럿을 성장시키세요','임무마다 XP +1. XP 2에 고유 특성, XP 4에 내구도 +1. 종료 후 생존 파일럿 한 명을 다음 작전에 데려갈 수 있습니다.']];
    const body=`<div class="help-grid">${tips.map(([icon,title,text])=>`<div class="help-item"><span>${A.icon(icon,23)}</span><div><h3>${title}</h3><p>${text}</p></div></div>`).join('')}</div><div class="help-shortcuts"><span><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> 메크</span><span><kbd>M</kbd> 이동</span><span><kbd>A</kbd> 주무기</span><span><kbd>Q</kbd> 보조</span><span><kbd>R</kbd> 수리</span><span><kbd>U</kbd> 이동 취소</span><span><kbd>Z</kbd> 턴 초기화</span><span><kbd>Space</kbd> 턴 종료</span></div><div class="help-footnote"><strong>계획을 바꿀 수 있습니다</strong><p>무기를 사용하기 전 마지막 이동을 취소할 수 있습니다. 임무당 1회는 현재 턴 전체를 초기화합니다. 모바일에서는 목표를 한 번 눌러 미리 보고, 같은 칸 또는 공격 확정을 눌러 실행하세요. 작은 화면은 전장 확대를 이용할 수 있습니다.</p><p>3개 편대, 8개 작전, 5연전으로 구성된 독립적인 전술 게임입니다. 전력 방어 확률은 없으며 같은 시드·경로·행동은 같은 결과를 만듭니다. 전투 규칙의 세부 사항은 전술 도감에서 확인하세요.</p></div>`;
    return modalShell('전장을 바꾸는 세 번의 명령','공격을 읽고, 위치를 바꾸고, 도시를 지키세요.',body,`<button class="text-button" data-action="codex">전술 도감</button><button class="main-action" data-action="close-modal">작전으로 돌아가기 ${A.icon('arrow',18)}</button>`,true);
  }

  function newRunModal() {
    const squads=[{id:'rift',tag:'균형 · 추천',units:['combat','cannon','artillery'],text:'근접·직선·곡사 공격. 피해와 밀치기로 전장을 정리합니다.'},{id:'control',tag:'제어 · 전술',units:['combat','smoke','cryo'],text:'연기와 빙결로 적 공격을 취소하고 위험한 턴을 넘깁니다.'},{id:'gravity',tag:'유도 · 관통',units:['combat','pull','laser'],text:'견인으로 적을 당기고 관통 레이저로 일렬의 대상을 공격합니다.'}];
    const v=profile.veteran,def=C.PILOTS[v?.id];
    const body=`<div class="squad-options three">${squads.map(s=>`<button class="squad-option ${newSquad===s.id?'active':''}" data-action="new-squad" data-value="${s.id}" aria-pressed="${newSquad===s.id}"><div class="option-art">${s.units.map(k=>A.unitIcon(k,'player',58)).join('')}</div><span class="tag">${s.tag}</span><h3>${squadName(s.id)}</h3><p>${s.text}</p></button>`).join('')}</div><div class="section-row"><h3>DIFFICULTY <span>난이도</span></h3></div><div class="difficulty-row"><button class="difficulty-button ${newDifficulty==='easy'?'active':''}" data-action="new-difficulty" data-value="easy"><strong>안정</strong><span>내구도 +1 · 임무 후 전력 +2</span></button><button class="difficulty-button ${newDifficulty==='normal'?'active':''}" data-action="new-difficulty" data-value="normal"><strong>표준</strong><span>임무 후 전력 +1</span></button></div><div class="new-run-options"><label class="seed-field">작전 시드 <input id="new-seed" type="text" inputmode="numeric" maxlength="10" placeholder="비워 두면 새로운 전장" value="${esc(newSeed)}"><small>같은 시드로 전략을 다시 시험할 수 있습니다.</small></label>${v?`<button class="veteran-option ${newUseVeteran?'active':''}" data-action="toggle-veteran" aria-pressed="${newUseVeteran}">${A.icon('pilot',21)}<span><strong>${esc(def.name)} · XP ${v.xp}</strong><small>첫 번째 메크에 베테랑 배치 ${newUseVeteran?'ON':'OFF'}</small></span>${A.icon(newUseVeteran?'check':'plus',18)}</button>`:'<p class="veteran-empty">작전 종료 후 생존 파일럿을 선택하면 다음 출격에 함께할 수 있습니다.</p>'}</div><p class="new-run-note">새 작전을 시작하면 현재 진행을 교체합니다. 보관할 진행은 저장 관리에서 내보내세요.</p>`;
    return modalShell('새로운 작전','편대와 파일럿을 준비하고 다섯 구역을 방어하세요.',body,`<button class="text-button" data-action="close-modal">취소</button><button class="main-action" data-action="start-new">출격 준비 ${A.icon('arrow',18)}</button>`,true);
  }

  function routeCards() {
    const choices=E.getMissionChoices(state);
    return `<div class="route-cards">${choices.map(op=>`<button class="route-card ${selectedRoute===op.id?'selected':''}" data-action="route" data-id="${esc(op.id)}" aria-pressed="${selectedRoute===op.id}"><div class="route-top"><span class="risk ${op.risk}">${({low:'안정 작전',medium:'경계 작전',high:'고위험 작전'})[op.risk]}</span><span>${selectedRoute===op.id?A.icon('check',18):A.icon('route',18)}</span></div><span class="eyebrow">SECTOR ${String(op.index+1).padStart(2,'0')} / ${esc(op.subtitle||'')}</span><h3>${esc(op.name)}</h3><p>${esc(op.briefing)}</p><div class="route-tags">${op.hazardKind?`<span>환경 ${({airstrike:'공습',tide:'침수',storm:'폭풍'})[op.hazardKind]}</span>`:'<span>환경 위험 없음</span>'}${op.pod?'<span>구조 포드</span>':''}<span>기본 코어 ${op.baseReward+(op.bonusCores||0)}</span></div><ul>${op.objectives.map(g=>`<li>${esc(g.name)} ${g.reward?`<em>+${g.reward} 코어</em>`:''}</li>`).join('')}</ul></button>`).join('')}</div>`;
  }

  function equipmentRows() {
    return players().map(u=>`<section class="equipment-unit"><div class="equipment-title">${A.unitIcon(u.kind,'player',46)}<div><h3>${esc(u.name)}</h3><p>현재: ${esc(C.GEAR[u.secondary?.id]?.name||'없음')} · 다음 임무 1회 충전</p></div></div><div class="gear-options">${Object.values(C.GEAR).map(g=>`<button data-action="equip" data-unit="${esc(u.id)}" data-gear="${g.id}" class="gear-option ${u.secondary?.id===g.id?'equipped':''}" ${u.secondary?.id===g.id||state.cores<g.cost?'disabled':''}><strong>${esc(g.name)} <span>${u.secondary?.id===g.id?'장착 중':`${g.cost} 코어`}</span></strong><p>${esc(g.description)}</p></button>`).join('')}</div></section>`).join('');
  }

  function hangarModal() {
    const report=mission().rewardBreakdown||mission().report||C.quoteReward(state),goals=E.getObjectives?.(state)||C.evaluateObjectives(state),choices=E.getMissionChoices(state);
    if(choices.length===1&&!selectedRoute)selectedRoute=choices[0].id;
    const route=choices.find(op=>op.id===selectedRoute);
    const body=`<div class="reward-summary"><div class="reward-stat"><span>획득 코어</span><strong>+${report.total||mission().reward||0}</strong></div><div class="reward-stat"><span>보조 목표</span><strong>${goals.filter(g=>g.success).length}<small> / ${goals.length}</small></strong></div><div class="reward-stat"><span>남은 전력</span><strong>${state.grid}<small> / ${state.maxGrid||7}</small></strong></div></div><div class="reward-details">${(report.details||[]).filter(d=>d.cores).map(d=>`<span>${esc(d.label)} <strong>+${d.cores}</strong></span>`).join('')}<span>파일럿 XP <strong>+1</strong></span></div><nav class="hangar-tabs" aria-label="정비 메뉴">${[['upgrade','메크 강화','core'],['equipment','장비 교체','gear'],['route','다음 작전','route']].map(([id,label,icon])=>`<button data-action="hangar-tab" data-id="${id}" class="${hangarTab===id?'active':''}" aria-pressed="${hangarTab===id}">${A.icon(icon,16)} ${label}${id==='route'&&!route?'<i></i>':''}</button>`).join('')}</nav><div class="hangar-content">${hangarTab==='upgrade'?`${players().map(upgradeRow).join('')}<p class="panel-note">모든 메크는 다음 임무에서 수리됩니다. 강화와 장비 교체는 같은 코어를 사용하며, 남은 코어는 이월됩니다.</p>`:hangarTab==='equipment'?equipmentRows():routeCards()}</div>`;
    const footer=`<span class="upgrade-budget">${A.icon('core',19)} 보유 <strong>${state.cores||0}</strong></span>${route?`<button class="main-action" data-action="next-mission">${esc(route.name)} 출격 ${A.icon('arrow',18)}</button>`:`<button class="main-action" data-action="hangar-tab" data-id="route">다음 작전 선택 ${A.icon('route',18)}</button>`}`;
    return modalShell(`${missionName()} 방어 완료`,'정비하고, 경로를 선택하고, 다시 출격하세요.',body,footer,true);
  }

  function runId() { return `${state.seed}-${state.squad}-${state.difficulty}`; }
  function runScore() { const r=state.runStats||{};return num(r.missions)*1000+state.grid*100+num(r.kills)*25+num(r.pods)*150+(state.cores||0)*20; }
  function recordOutcome() {
    if(!['won','lost'].includes(state.phase)||profile.records.some(r=>r.id===runId()))return;
    profile.records.unshift({id:runId(),won:state.phase==='won',squad:state.squad,difficulty:state.difficulty,score:runScore(),missions:num(state.runStats?.missions,state.phase==='won'?5:state.missionIndex),date:new Date().toISOString()});
    profile.records=profile.records.slice(0,30);
  }

  function resultModal() {
    const won=state.phase==='won',stats=state.runStats||{},survivors=players().filter(alive),chosen=profile.veteran?.runId===runId();
    const body=`<div class="result-hero ${won?'':'lost'}"><div class="result-emblem">${A.icon(won?'shield':'skull',52)}</div><span class="eyebrow">${won?'OPERATION COMPLETE':'TIMELINE CLOSED'}</span><h3>${won?'도시의 내일을 지켰습니다':'다음 작전은 달라질 수 있습니다'}</h3><p>${won?'균열 봉쇄 완료. 다섯 구역의 방어선이 버텨냈습니다.':state.grid<=0?'도시의 공용 전력이 모두 소진되었습니다. 이동과 공격 순서를 바꿔 다른 해답을 찾아보세요.':'핵심 방어 목표를 잃었습니다. 새로운 편대와 경로로 다시 도전할 수 있습니다.'}</p></div><div class="result-score"><span>OPERATION SCORE</span><strong>${runScore().toLocaleString('ko-KR')}</strong></div><div class="result-summary"><div><strong>${stats.missions||0}</strong><span>완료 임무</span></div><div><strong>${stats.kills||0}</strong><span>적 제거</span></div><div><strong>${stats.pods||0}</strong><span>구조 포드</span></div><div><strong>${state.grid}</strong><span>남은 전력</span></div></div>${survivors.length?`<section class="carry-section"><h3>다음 작전에 동행할 파일럿</h3><p>생존자 한 명의 경험을 최대 XP 4까지 보존합니다. 다음 출격에서 배치를 선택할 수 있습니다.</p><div class="carry-options">${survivors.map(u=>{const p=pilotInfo(u),active=chosen&&profile.veteran.id===u.pilot.id;return `<button data-action="carry-pilot" data-id="${esc(u.id)}" class="${active?'selected':''}">${A.icon(active?'check':'pilot',20)}<strong>${esc(p.name)}</strong><span>R${p.rank} · XP ${p.xp}</span></button>`;}).join('')}</div></section>`:''}<p class="score-rule">점수: 완료 임무 × 1,000 + 남은 전력 × 100 + 처치 × 25 + 포드 × 150 + 남은 코어 × 20</p>`;
    return modalShell(won?'작전 성공':'작전 종료',`시드 ${state.seed} · ${squadName()} · ${state.difficulty==='easy'?'안정':'표준'}`,body,`<button class="text-button" data-action="close-modal">전장 확인</button><button class="main-action" data-action="new">새 작전 준비 ${A.icon('arrow',18)}</button>`,true);
  }

  function storageModal() {
    const body=`<div class="storage-status">${A.icon('save',28)}<div><strong>${lastSaved?'진행이 자동 저장되어 있습니다':'자동 저장을 사용할 수 없습니다'}</strong><p>임무 ${state.missionIndex+1} · ${esc(missionName())} · 턴 ${state.turn||1} · 시드 ${esc(state.seed)}</p></div></div><div class="storage-actions"><button data-action="export-save">${A.icon('export',22)}<strong>진행 내보내기</strong><span>작전·되돌리기 상태·기록을 JSON으로 저장</span></button><button data-action="import-save">${A.icon('import',22)}<strong>진행 불러오기</strong><span>파일 검사 후 현재 진행을 교체</span></button></div>${importedNotice?`<p class="panel-note">${esc(importedNotice)}</p>`:''}<div class="settings-list"><button data-action="confirm-setting" aria-pressed="${!!preferences.confirm}"><span>마우스 공격에도 확정 단계 사용</span><strong>${preferences.confirm?'ON':'OFF'}</strong></button><button data-action="fast" aria-pressed="${!!preferences.fast}"><span>적 행동 빠른 재생</span><strong>${preferences.fast?'ON':'OFF'}</strong></button></div><div class="download-links"><a href="./breach-command-offline.html" download="Breach_Command.html">${A.icon('download',16)} 오프라인 실행 HTML</a><a href="./breach-command-source.zip" download>${A.icon('download',16)} 전체 JavaScript 소스</a></div><p class="panel-note">저장은 현재 브라우저에 보관됩니다. 다른 기기나 오프라인 파일로 옮길 때는 내보낸 JSON을 불러오세요.</p>`;
    return modalShell('저장과 플레이 설정','언제든 이어서 플레이할 수 있도록 진행을 보관하세요.',body);
  }

  function recordsModal() {
    const body=profile.records.length?`<div class="records-list">${profile.records.map(r=>`<div class="record-row"><span class="record-result ${r.won?'won':''}">${r.won?'VICTORY':'ENDED'}</span><div><strong>${esc(squadName(r.squad))}</strong><p>${r.difficulty==='easy'?'안정':'표준'} · ${r.missions}/5 임무 · ${esc(r.date.slice(0,10))}</p></div><b>${r.score.toLocaleString('ko-KR')}</b></div>`).join('')}</div>`:'<div class="empty-state">아직 완료된 작전이 없습니다.<br>작전 결과는 이곳에 최대 30개 보관됩니다.</div>';
    return modalShell('작전 기록',`${profile.records.filter(r=>r.won).length}회 방어 성공 · 같은 시드의 결과는 한 번 기록됩니다.`,body);
  }

  function briefingModal() {
    const op=C.getOperation(mission().operationId)||C.defaultOperation(state.missionIndex),goals=E.getObjectives?.(state)||C.evaluateObjectives(state);
    const body=`<div class="briefing-lead"><span class="eyebrow">${esc(op.subtitle||'CITY DEFENSE')}</span><p>${esc(op.briefing||objectiveText())}</p></div><div class="briefing-rule"><strong>필수 목표</strong><p>${objectiveText()} 전력 0, 메크 전멸 또는 최종 폭탄 파괴 시 실패합니다.</p></div>${goals.map(g=>`<div class="briefing-rule"><strong>${esc(g.name)} ${g.reward?`<span>+${g.reward} 코어</span>`:''}</strong><p>${esc(g.description)} · ${g.current}/${g.target}</p></div>`).join('')}<div class="briefing-rule"><strong>환경 · ${op.hazardKind?({airstrike:'공습',tide:'침수',storm:'폭풍'})[op.hazardKind]:'특이 사항 없음'}</strong><p>${op.hazardKind?'황색 표식은 이번 턴 종료에 발동합니다. 피해 예고에 이미 포함되어 있습니다. 환경은 적 공격보다 먼저 처리됩니다.':'예고된 적 공격과 출현 표식을 확인하세요.'}</p></div>${op.pod?'<div class="briefing-rule"><strong>구조 포드 · 코어 +1</strong><p>메크로 포드 칸에 들어가면 수집합니다. 적이 밟거나 공격 피해를 받으면 파괴됩니다.</p></div>':''}`;
    return modalShell(missionName(),'현재 작전의 목표와 현장 정보를 확인하세요.',body,`<button class="main-action" data-action="close-modal">확인 ${A.icon('check',18)}</button>`);
  }

  function codexModal() {
    const entries=[['이동과 공격','주무기·보조·수리는 행동 1회를 공유합니다. 공격을 쓰면 남은 이동도 종료됩니다. 이동 경로 위의 지형 효과가 적용됩니다. 거미줄 구속은 자발적 이동을 막지만 밀치기는 가능합니다.'],['피해와 충돌','밀린 유닛이 다른 유닛·산·도시에 막히면 충돌 피해가 발생합니다. 도시 피해는 공용 전력을 줄입니다. 산과 도시는 직선 포탄을 막습니다. 전장 밖으로는 밀리지 않습니다.'],['보호막 · 빙결 · 산성','보호막과 빙결은 피해 한 번을 막고 해제됩니다. 빙결은 공격과 이동도 막으며 수리로 해동할 수 있습니다. 산성은 일반 피해를 2배로 계산한 뒤 장갑을 차감합니다. 충돌·화염·출현 차단 피해에는 증폭이 없습니다.'],['숲 · 모래 · 얼음','피해를 받은 숲은 불이 붙고 모래는 연막을 만듭니다. 얼음은 충격으로 깨져 물이 됩니다. 화염은 턴 종료 시 피해를 줍니다. 연막은 공격을 막고 불을 끕니다.'],['물 · 구덩이','비행하지 않는 적은 물·구덩이에 빠지면 제거됩니다. 지상 메크는 물에서 살아남지만 공격할 수 없습니다. 구덩이는 메크도 파괴합니다.'],['거미 · 폭발체 · 지휘 개체','거미는 예고한 인접 메크를 구속합니다. 거미를 이동시키거나 연막·빙결·처치로 무력화하면 해제됩니다. 폭발체는 사망 시 상하좌우에 피해 1을 주며 연쇄 폭발할 수 있습니다. 지휘 개체는 전방 두 칸을 공격합니다.'],['환경과 출현','화염 → 환경 → 적 공격 순서입니다. 마지막 턴은 공격까지 버티면 임무를 완료합니다. 그 외 턴에는 출현을 처리하며 표식 위 유닛은 피해 1을 받고 적 출현을 막습니다.'],['파일럿 성장','완료한 임무마다 XP +1. 하린은 XP 2에 임무 시작 보호막, 태오는 한 번에 내구도 2 수리, 서윤은 이동 +1. XP 4에는 다음 임무부터 내구도 +1이 적용됩니다. 능력은 중복 누적되지 않습니다.'],['견인과 레이저','견인기는 두 칸 이상 떨어진 첫 유닛을 자신 쪽으로 한 칸 당깁니다. 레이저는 같은 방향의 모든 유닛과 도시를 관통하며 산을 만나면 멈춥니다. 아군과 도시 피해도 미리 확인하세요.']];
    return modalShell('전술 도감','전장을 해석하는 데 필요한 규칙입니다.',`<div class="codex-list">${entries.map(([title,text],i)=>`<article><span>${String(i+1).padStart(2,'0')}</span><div><h3>${title}</h3><p>${text}</p></div></article>`).join('')}</div>`,`<button class="main-action" data-action="close-modal">작전으로 돌아가기 ${A.icon('arrow',18)}</button>`,true);
  }

  function upgradeRow(u) {
    return `<div class="upgrade-unit"><div class="upgrade-unit-info">${A.unitIcon(u.kind,'player',58)}<div><h3>${esc(u.name)}</h3><p>피해 ${u.damage||0} · 이동 ${u.move} · 내구도 ${u.maxHp}</p><p>${esc(pilotInfo(u).name)} · R${pilotInfo(u).rank} · XP ${pilotInfo(u).xp}</p></div></div><div class="upgrade-buttons">${[['damage','화력','피해 +1'],['move','기동','이동 +1'],['hp','내구','최대 내구도 +2']].map(([stat,label,desc])=>{
      const cost=E.getUpgradeCost?E.getUpgradeCost(state,u.id,stat):stat==='damage'?2:1;
      const valid=typeof cost==='number'&&Number.isFinite(cost)&&cost>0;
      const cap=!valid;
      return `<button class="upgrade-button" data-action="upgrade" data-id="${esc(u.id)}" data-stat="${stat}" ${!cap&&state.cores>=cost?'':'disabled'}><strong>${label} ${cap?'MAX':`${A.icon('core',12)} ${cost}`}</strong><small>${cap?'강화 불가':desc}</small></button>`;
    }).join('')}</div></div>`;
  }

  function startNew() {
    const input=document.getElementById('new-seed');if(input)newSeed=input.value.trim();
    if(newSeed&&!/^\d{1,10}$/.test(newSeed)){toast('시드는 0부터 4294967295 사이의 정수로 입력하세요.',true);return;}
    if(newSeed&&Number(newSeed)>4294967295){toast('시드는 4294967295 이하로 입력하세요.',true);return;}
    state=E.createRun({squad:newSquad,difficulty:newDifficulty,seed:newSeed?Number(newSeed):Date.now(),...(newUseVeteran&&profile.veteran?{veteran:{id:profile.veteran.id,xp:profile.veteran.xp,slot:0}}:{})});
    selectedId='mech-1';mode='move';weaponSlot='primary';hover=null;armedTarget=null;previewResult=null;turnSnapshot=null;undoMoveSnapshot=null;resetsLeft=1;busy=false;selectedRoute=null;
    closeModal();persist();render();sound('reward');toast('새 작전을 시작했습니다. 메크를 배치하세요.');
  }

  function nextMission() {
    if(!selectedRoute){hangarTab='route';renderModal();return;}
    const result=E.nextMission(state,selectedRoute);
    if(result.error){toast(result.error,true);return;}
    resetsLeft=1;turnSnapshot=null;undoMoveSnapshot=null;selectedId='mech-1';mode='move';weaponSlot='primary';selectedRoute=null;closeModal();
    accept(result,{sound:'reward'});
  }

  function exportSave() {
    const data={format:'breach-command',version:2,...saveEnvelope(),profile:clone(profile)};
    const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download=`Breach_Command_Save_${state.seed}.json`;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);toast('진행 파일을 내보냈습니다.');
  }

  async function importSave(file) {
    if(!file)return;
    if(file.size>2000000){toast('2MB 이하의 저장 JSON 파일을 선택하세요.',true);return;}
    try{
      const raw=JSON.parse(await file.text());
      if(raw.format&&raw.format!=='breach-command')throw Error('Breach Command 저장 파일이 아닙니다.');
      const checked=E.migrateState(raw.state);
      if(checked.error||!checked.state)throw Error(checked.error||'유효하지 않은 게임 상태입니다.');
      // No changes until the full game state has passed engine validation.
      if(!restoreEnvelope(raw))throw Error('저장 상태를 복원할 수 없습니다.');
      if(raw.profile)profile=sanitizeProfile(raw.profile);
      if(state.phase==='player'&&!turnSnapshot)turnSnapshot=clone(state);
      weaponSlot='primary';mode='move';hover=null;armedTarget=null;selectedRoute=null;
      recordOutcome();persist();closeModal();render();
      importedNotice=`시드 ${state.seed}의 작전을 복원했습니다.`;toast(importedNotice);
      if(['reward','won','lost'].includes(state.phase))openModal(state.phase==='reward'?'reward':'result');
    }catch(error){toast(`불러오기 실패: ${error.message||'올바른 JSON 파일을 선택하세요.'}`,true);}
  }

  function setMode(next,slot='primary') {
    const u=selected();if(!u||busy||state.phase!=='player')return;
    if(next==='move'&&(u.moved||u.acted||u.frozen||webbed(u)))return;
    if(next==='attack'&&!weaponReady(u,slot))return;
    mode=next;weaponSlot=slot;hover=null;armedTarget=null;render();
  }

  function action(name,el) {
    if(busy&&!['help','sound','close-modal','backdrop','skip-replay','fast','codex'].includes(name))return;
    switch(name){
      case 'select':selectUnit(el.dataset.id);break;
      case 'mode-move':setMode('move');break;
      case 'mode-attack':setMode('attack','primary');break;
      case 'mode-secondary':setMode('attack','secondary');break;
      case 'confirm-attack':if(armedTarget)clickTile(armedTarget.x,armedTarget.y);break;
      case 'begin':beginBattle();break;
      case 'end-turn':endTurn();break;
      case 'skip-replay':skipReplay=true;break;
      case 'repair':repair();break;
      case 'undo':undoMove();break;
      case 'reset-turn':resetTurn();break;
      case 'threats':showThreats=!showThreats;render();break;
      case 'help':case 'new':case 'storage':case 'records':case 'codex':case 'briefing':openModal(name);break;
      case 'reward':if(state.phase==='reward')openModal('reward');break;
      case 'result':if(['lost','won'].includes(state.phase))openModal('result');break;
      case 'close-modal':closeModal();break;
      case 'backdrop':if(el===eventTarget)closeModal();break;
      case 'new-squad':newSquad=el.dataset.value;renderModal();break;
      case 'new-difficulty':newDifficulty=el.dataset.value;renderModal();break;
      case 'toggle-veteran':newUseVeteran=!newUseVeteran;renderModal();break;
      case 'start-new':startNew();break;
      case 'next-mission':nextMission();break;
      case 'hangar-tab':hangarTab=el.dataset.id;renderModal();break;
      case 'route':if(E.getMissionChoices(state).some(op=>op.id===el.dataset.id)){selectedRoute=el.dataset.id;renderModal();}break;
      case 'equip':{
        const result=E.equipSecondary(state,el.dataset.unit,el.dataset.gear);
        if(!result.error){state=result.state;persist();render();sound('reward');toast('장비를 교체했습니다. 다음 임무에서 충전됩니다.');}else toast(result.error,true);
        break;
      }
      case 'upgrade':{
        const result=E.upgrade(state,el.dataset.id,el.dataset.stat);
        if(!result.error){state=result.state;persist();render();sound('reward');}else toast(result.error,true);
        break;
      }
      case 'carry-pilot':{
        const u=players().find(v=>v.id===el.dataset.id&&alive(v));
        if(u&&['won','lost'].includes(state.phase)){profile.veteran={id:u.pilot.id,xp:Math.min(4,u.pilot.xp),runId:runId()};persist();renderModal();toast(`${pilotInfo(u).name}의 경험을 보존했습니다.`);}
        break;
      }
      case 'export-save':exportSave();break;
      case 'import-save':document.getElementById('save-import').click();break;
      case 'confirm-setting':preferences.confirm=!preferences.confirm;savePrefs();renderModal();break;
      case 'fast':preferences.fast=!preferences.fast;if(busy&&preferences.fast)skipReplay=true;savePrefs();render();break;
      case 'zoom':preferences.zoom=!preferences.zoom;savePrefs();render();if(preferences.zoom){const s=document.getElementById('board-scroll');if(s)s.scrollLeft=(s.scrollWidth-s.clientWidth)/2;}break;
      case 'sound':preferences.sound=!preferences.sound;savePrefs();render();sound('select');toast(`효과음 ${preferences.sound?'켜짐':'꺼짐'}`);break;
      case 'dismiss-hint':preferences.hint=false;savePrefs();render();break;
      case 'inspect-enemy':{
        const u=state.units.find(v=>v.id===el.dataset.id&&alive(v));
        if(u){setHover({x:u.x,y:u.y});document.getElementById('board-stage')?.scrollIntoView({behavior:'smooth',block:'nearest'});}
        break;
      }
    }
  }

  let eventTarget=null;
  document.addEventListener('pointerdown',event=>{lastTouch=event.pointerType==='touch';});
  document.addEventListener('click',event=>{
    eventTarget=event.target;
    const button=event.target.closest('[data-action]');
    if(button){if(!button.disabled)action(button.dataset.action,button);return;}
    const tile=event.target.closest('[data-x][data-y]');
    if(tile&&tile.closest('#board-stage'))clickTile(Number(tile.dataset.x),Number(tile.dataset.y));
  });
  document.addEventListener('pointermove',event=>{
    if(event.pointerType==='touch'||modalType)return;
    const tile=event.target.closest('[data-x][data-y]');
    if(tile&&tile.closest('#board-stage'))setHover({x:Number(tile.dataset.x),y:Number(tile.dataset.y)});
  });
  document.addEventListener('pointerout',event=>{
    if(event.pointerType==='touch')return;
    if(!event.target.closest?.('#board-stage'))return;
    if(event.relatedTarget?.closest?.('#board-stage'))return;
    setHover(null);
  });
  document.addEventListener('keydown',event=>{
    lastTouch=false;
    const key=event.key.toLowerCase();
    if(modalType){
      if(key==='escape'){event.preventDefault();closeModal();}
      if(key==='tab'){
        const items=[...modalRoot.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),[tabindex="0"]')];
        if(items.length){const first=items[0],last=items[items.length-1];if(event.shiftKey&&(document.activeElement===first||!modalRoot.contains(document.activeElement))){event.preventDefault();last.focus();}else if(!event.shiftKey&&(document.activeElement===last||!modalRoot.contains(document.activeElement))){event.preventDefault();first.focus();}}
      }
      return;
    }
    if(busy&&key===' '){event.preventDefault();skipReplay=true;return;}
    if(event.ctrlKey||event.metaKey||event.altKey||/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)||busy)return;
    if(['1','2','3'].includes(key)){event.preventDefault();const u=players()[Number(key)-1];if(u)selectUnit(u.id);document.getElementById('board-stage')?.focus({preventScroll:true});return;}
    const bindings={m:'mode-move',a:'mode-attack',q:'mode-secondary',r:'repair',u:'undo',z:'reset-turn',h:'help'};
    if(bindings[key]){event.preventDefault();action(bindings[key],{dataset:{}});if(key!=='h')document.getElementById('board-stage')?.focus({preventScroll:true});return;}
    if(key===' '&&!['BUTTON','A'].includes(event.target.tagName)){event.preventDefault();endTurn();return;}
    if(key==='enter'&&state.phase==='deploy'&&event.target===document.body){event.preventDefault();beginBattle();return;}
    if(event.target.id==='board-stage'){
      const deltas={arrowup:[0,-1],arrowdown:[0,1],arrowleft:[-1,0],arrowright:[1,0]};
      if(deltas[key]){event.preventDefault();keyboardCell={x:Math.max(0,Math.min(7,keyboardCell.x+deltas[key][0])),y:Math.max(0,Math.min(7,keyboardCell.y+deltas[key][1]))};setHover({...keyboardCell});announce(`${coord(keyboardCell.x,keyboardCell.y)} ${terrainNames[state.tiles[keyboardCell.y*8+keyboardCell.x].type]}`);}
      if(key==='enter'){event.preventDefault();clickTile(keyboardCell.x,keyboardCell.y);document.getElementById('board-stage')?.focus({preventScroll:true});}
    }
    if(key==='escape'){hover=null;armedTarget=null;weaponSlot='primary';mode='move';render();}
  });

  document.addEventListener('input',event=>{if(event.target.id==='new-seed')newSeed=event.target.value;});
  document.getElementById('save-import').addEventListener('change',event=>{const file=event.target.files[0];event.target.value='';importSave(file);});

  restore();
  if(state.phase==='player'&&!turnSnapshot)turnSnapshot=clone(state);
  if(['reward','won','lost'].includes(state.phase))modalType=state.phase==='reward'?'reward':'result';
  recordOutcome();persist();render();
  if(loadNotice)setTimeout(()=>toast(loadNotice),200);
})();
