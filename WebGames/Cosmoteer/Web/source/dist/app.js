/* STARFORGE — interface and input. No external dependencies. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const safe = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num = (v, fallback=0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
  const clamp = (n,min,max) => Math.min(max,Math.max(min,n));
  const fmt = n => Math.round(num(n)).toLocaleString('ko-KR');
  const qty = n => num(n).toLocaleString('ko-KR',{maximumFractionDigits:2});
  const SAVE_KEY = 'starforge.expedition.v1';
  const DESIGN_KEY = 'starforge.blueprints.v2';
  const metadata = {
    corridor:{category:'structure',en:'CORRIDOR'}, armor:{category:'structure',en:'ARMOR PLATING'}, cockpit:{category:'systems',en:'COMMAND BRIDGE'},
    reactor:{category:'systems',en:'REACTOR CORE'}, bunk:{category:'systems',en:'CREW QUARTERS'}, storage:{category:'systems',en:'AMMO STORAGE'},
    laser:{category:'weapons',en:'LASER EMITTER'}, cannon:{category:'weapons',en:'KINETIC CANNON'}, shield:{category:'systems',en:'SHIELD GENERATOR'},
    thruster:{category:'systems',en:'ION THRUSTER'}, radiator:{category:'systems',en:'HEAT RADIATOR'}
  };
  const iconPaths = {
    corridor:'<rect x="5" y="5" width="22" height="22" rx="2"/><path d="M12 5v22m8-22v22M5 12h22M5 20h22" opacity=".4"/><path d="M14 14h4v4h-4z"/>',
    armor:'<path d="m16 3 12 7v12l-12 7-12-7V10Z"/><path d="m16 8 7 4v8l-7 4-7-4v-8Z"/><path d="M16 8v16M9 12l14 8M23 12 9 20" opacity=".4"/>',
    cockpit:'<path d="M8 27 5 13 10 5h12l5 8-3 14Z"/><path d="M10 12h12l-2 8h-8Z" fill="currentColor" fill-opacity=".2"/><path d="M16 12v8M11 25h10"/>',
    reactor:'<circle cx="16" cy="16" r="11"/><circle cx="16" cy="16" r="6"/><circle cx="16" cy="16" r="2" fill="currentColor"/><path d="M16 2v4m0 20v4M2 16h4m20 0h4M6 6l3 3m14 14 3 3M6 26l3-3M23 9l3-3"/>',
    bunk:'<rect x="5" y="4" width="22" height="24" rx="2"/><path d="M16 4v24M8 8h5v7H8zm11 0h5v7h-5zM8 19h5v5H8zm11 0h5v5h-5z"/>',
    storage:'<path d="M5 8h22v20H5zM3 4h26v5H3z"/><path d="M12 9v19m8-19v19M13 16h6v5h-6z" opacity=".65"/>',
    laser:'<path d="M10 28V14l6-4 6 4v14Z"/><path d="M13 14V5h6v9M16 1v3M13 22h6M10 27h12"/><circle cx="16" cy="18" r="2" fill="currentColor"/>',
    cannon:'<path d="M8 28V17l5-4h6l5 4v11Z"/><path d="M13 15V3h6v12M11 3h10M7 24h18M11 18h10v4H11z"/>',
    shield:'<path d="M16 3 27 8v9c0 6-11 12-11 12S5 23 5 17V8Z"/><path d="m16 8 6 3v7l-6 6-6-6v-7Z" fill="currentColor" fill-opacity=".12"/>',
    thruster:'<path d="M11 3h10l3 16H8Z"/><path d="M11 19v5m5-5v10m5-10v5M9 11h14M13 6h6"/><path d="m12 24 4 6 4-6" opacity=".6"/>',
    radiator:'<rect x="4" y="5" width="24" height="22" rx="2"/><path d="M8 9v14m4-14v14m4-14v14m4-14v14m4-14v14"/>'
  };
  function icon(type){return `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[type] || iconPaths.cockpit}</svg>`;}
  if(!window.StarSim || !window.StarRenderer || !window.StarEditor){$('boot-error').hidden=false;return;}
  const game = new StarSim.Game();
  const renderer = new StarRenderer($('game-canvas'), game);
  const yard = new StarEditor.Shipyard(game);
  const ui={tool:'inspect',part:'laser',rot:0,filter:'all',selected:null,mode:null,salvaged:false,lastUI:0,lastFrame:0,toastTimer:null,saveTimer:null,sound:false,audio:null,drag:null,pointers:new Map(),pinch:null,dirty:false,modeChangedAt:0,mirror:false,blueprints:[],hover:null,hoverPlan:null,lastShotSound:0,lastShots:0};
  window.starforge = {game,renderer,yard};
  const missions=[
    {name:'변두리의 해적',description:'오리온 항로를 점거한 경비정을 무력화하세요.',difficulty:'낮은 위협'},
    {name:'잔해 지대의 포격함',description:'두꺼운 장갑을 뚫고 적의 포격 능력을 제거하세요.',difficulty:'중간 위협'},
    {name:'항로의 파수꾼',description:'적 지휘함을 격파하고 마지막 항로를 확보하세요.',difficulty:'높은 위협'}
  ];

  function sound(kind='click'){
    if(!ui.sound)return;
    try{
      ui.audio ||= new (window.AudioContext || window.webkitAudioContext)();
      if(ui.audio.state==='suspended')ui.audio.resume();
      const a=ui.audio,o=a.createOscillator(),g=a.createGain(),t=a.currentTime;
      o.type=kind==='win'?'sine':'triangle';
      o.frequency.setValueAtTime(kind==='error'?160:kind==='win'?440:740,t);
      o.frequency.exponentialRampToValueAtTime(kind==='win'?880:kind==='error'?90:480,t+.13);
      g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.035,t+.01);g.gain.exponentialRampToValueAtTime(.0001,t+.2);
      o.connect(g);g.connect(a.destination);o.start(t);o.stop(t+.22);
    }catch{ui.sound=false;}
  }
  function toast(text,error=false){
    if(!text)return;
    $('event-toast').textContent=String(text);$('event-toast').classList.toggle('error',error);$('event-toast').classList.add('visible');
    clearTimeout(ui.toastTimer);ui.toastTimer=setTimeout(()=>$('event-toast').classList.remove('visible'),error?3900:2800);sound(error?'error':'click');
  }
  function saveNow(announce=false){
    try{localStorage.setItem(SAVE_KEY,JSON.stringify(makeSave()));localStorage.setItem(DESIGN_KEY,JSON.stringify(ui.blueprints));$('save-status').textContent='진행 상황 저장됨';if(announce)toast('원정과 청사진을 저장했습니다.');return true;}
    catch{$('save-status').textContent='파일로 저장하세요';if(announce)toast('브라우저 저장이 제한되어 있습니다. 저장 파일을 내보내세요.',true);return false;}
  }
  function makeSave(){return {...game.exportSave(),designLibrary:ui.blueprints};}
  function readLibrary(value){
    if(!Array.isArray(value)||value.length>6)throw new Error('청사진 목록이 올바르지 않습니다.');
    const names=new Set();return value.map(item=>{const r=yard.validateBlueprint(item);if(!r.ok)throw new Error(r.message);if(names.has(r.design.name))throw new Error('청사진 이름이 중복됩니다.');names.add(r.design.name);return r.design;});
  }
  function autosave(){clearTimeout(ui.saveTimer);ui.saveTimer=setTimeout(()=>saveNow(),350);}
  function perform(method,...args){
    try{
      const result=game[method](...args);
      if(result?.ok===false){toast(result.message||'현재 상태에서는 실행할 수 없습니다.',true);updateUI();return result;}
      if(['launch','retreat','returnToDock','repairAll','restock','importSave','reset','selectContract','purchaseUpgrade','buyRepairSupplies'].includes(method))yard.clearHistory();
      if(result?.message)toast(result.message);
      autosave();updateUI();return result||{ok:true};
    }catch(error){console.error(`Action ${method}`,error);toast('명령을 완료하지 못했습니다. 현재 상태를 확인해 주세요.',true);return {ok:false,message:String(error)};}
  }
  function edit(method,...args){
    const result=yard[method](...args);toast(result.message,result.ok===false);
    if(result.ok){autosave();renderer.hoverCell=null;renderer.ghostCells=[];ui.hoverPlan=null;if(!findSelection())selectPart(null);}
    updateUI();return result;
  }
  function closePanels(){document.body.classList.remove('show-build','show-inspector');}
  function setTool(tool,part){
    ui.tool=tool;if(part)ui.part=part;
    document.body.classList.toggle('building',tool==='build');document.body.classList.toggle('erasing',tool==='erase');
    $('inspect-tool').classList.toggle('active',tool==='inspect');$('erase-tool').classList.toggle('active',tool==='erase');
    $('tool-icon').textContent=tool==='build'?'⊞':tool==='erase'?'⌫':'⌖';
    const def=StarSim.PARTS[ui.part];
    $('tool-label').textContent=tool==='build'?`${def?.name||ui.part} · ${fmt(def?.cost)} ◈ · ${['↑','→','↓','←'][ui.rot]}`:tool==='erase'?'삭제 도구':'선택 도구';
    $('tool-help').textContent=tool==='build'?'빈 격자에 배치 · R 회전 · Esc 취소':tool==='erase'?'모듈 클릭 삭제 · Esc 취소':'부품 선택 · 드래그 이동 · 휠 확대';
    $('parts-list').querySelectorAll('[data-part]').forEach(b=>b.classList.toggle('active',tool==='build'&&b.dataset.part===ui.part));
    if(tool!=='build'){renderer.hoverCell=null;renderer.ghostCells=[];ui.hoverPlan=null;}
    if(window.innerWidth<=680&&tool==='build'){closePanels();toast(`${def?.name}: 함선에 인접한 빈 격자를 누르세요.`);}
  }
  function renderPalette(){
    $('parts-list').innerHTML=Object.entries(StarSim.PARTS).filter(([id])=>metadata[id]&&(ui.filter==='all'||metadata[id].category===ui.filter)).map(([id,d])=>
      `<button class="part-button ${ui.tool==='build'&&ui.part===id?'active':''}" data-part="${safe(id)}" aria-label="${safe(d.name)} 배치, ${fmt(d.cost)} 크레딧" title="${safe(d.description||d.name)}"><span class="part-icon" style="--part-color:${safe(d.color||'#68e2c5')}">${icon(id)}</span><span class="part-label"><strong>${safe(d.name)}</strong><small>${metadata[id].en}</small></span><span class="part-price"><span>◈</span>${fmt(d.cost)}</span></button>`).join('');
    $('parts-list').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{if(game.mode!=='dock'){toast('함선 편집은 조선소에서 할 수 있습니다.',true);return;}setTool('build',b.dataset.part);sound();}));
  }
  function selectPart(hit){
    ui.selected=hit?{shipId:hit.ship.id,partId:hit.part.id}:null;
    renderer.selectedPartId=hit?.part.id||null;
    updateInspector();
  }
  function findSelection(){
    if(!ui.selected)return null;
    const ship=[game.player,game.enemy].filter(Boolean).find(s=>s.id===ui.selected.shipId);
    const part=ship?.parts.find(p=>p.id===ui.selected.partId);
    return part?{ship,part}:null;
  }
  function updateInspector(){
    const hit=findSelection();
    $('selected-actions').hidden=!hit||game.mode!=='dock'||hit.ship.faction!=='player';
    $('selected-service').hidden=!hit||game.mode!=='battle'||hit.ship.faction!=='player'||hit.part.hp<=0;
    if(!$('selected-service').hidden){
      const chosen=game.serviceTargetId===hit.part.id;
      $('service-part-button').textContent=chosen?'✓ 우선 정비 해제 (G)':'＋ 우선 정비 (G)';
      $('service-part-button').classList.toggle('active',chosen);
      $('selected-service-hint').textContent=chosen?'경로가 있는 작업자부터 배정합니다. 소화 후 자재를 사용해 수리합니다.':'승무원이 현장에 도착한 뒤 소화·수리합니다.';
    }
    if(!hit){
      $('selected-category').textContent='함선';$('selected-icon').innerHTML=icon('cockpit');$('selected-name').textContent='모듈을 선택하세요';
      $('selected-description').textContent='함선의 모듈을 누르면 기능·내구도·보급 상태를 확인할 수 있습니다.';
      const stats=game.getStats();$('selected-details').innerHTML=`<div><small>함선 가치</small><strong>${fmt(stats.shipCost)} ◈</strong></div><div><small>모듈 수</small><strong>${game.player.parts.length}</strong></div>`;return;
    }
    const {ship,part}=hit,d=StarSim.PARTS[part.type]||{};
    $('selected-category').textContent=ship.faction==='enemy'?'적 표적':part.connected===false?'연결 끊김':'선택된 모듈';
    $('selected-icon').innerHTML=icon(part.type);$('selected-icon').style.color=d.color||'#68e2c5';$('selected-name').textContent=d.name||part.type;
    $('selected-description').textContent=d.description||'함선을 구성하는 모듈입니다.';
    const details=[['내구도',`${Math.max(0,Math.round(num(part.hp)))} / ${Math.round(num(part.maxHp,d.hp))}`],['열 상태',`${num(part.heat).toFixed(0)}`]];
    if(num(part.fire)>0)details.push(['화재 강도',`${Math.ceil(num(part.fire)*100)}%`]);
    if(['laser','shield','thruster'].includes(part.type))details.push(['현지 전력',num(part.power).toFixed(1)]);
    if(['storage','cannon'].includes(part.type))details.push(['장치 탄약',fmt(part.ammo)]);
    if(part.type==='reactor'){details.push(['전지 비축',num(part.power).toFixed(0)]);details.push(['개량 적용 생산',`${(num(d.generation)*(ship.faction==='player'?1+num(game.upgrades?.reactor)*.1:1)).toFixed(2)} /s`]);}
    if(d.range)details.push(['사거리 / 사각',`${fmt(d.range)} m / ${Math.round(d.firingArc*180/Math.PI)}°`]);
    if(['laser','cannon','thruster'].includes(part.type))details.push(['설치 방향',['↑ 전방','→ 우현','↓ 후방','← 좌현'][part.rot]]);
    if(part.type==='thruster'&&game.mode==='battle')details.push(['출력',`${Math.round(num(part.throttle)*100)}%`]);
    $('selected-details').innerHTML=details.map(([k,v])=>`<div><small>${k}</small><strong>${safe(v)}</strong></div>`).join('')+`<div class="device-status">● ${safe(part.status || (part.connected===false?'조종실 연결 끊김':'정상 작동'))}</div>`;
  }
  function setOverlay(name){renderer.overlay=name;document.querySelectorAll('[data-overlay]').forEach(b=>b.classList.toggle('active',b.dataset.overlay===name));sound();}
  function showLog(){
    $('log-list').innerHTML=(game.log||[]).slice().reverse().map(e=>`<div class="log-item ${safe(e.type||'')}"><time>${String(Math.floor(num(e.time)/60)).padStart(2,'0')}:${String(Math.floor(num(e.time)%60)).padStart(2,'0')}</time><span>${safe(e.text||e.message||'')}</span></div>`).join('')||'<p class="muted">아직 기록된 사건이 없습니다. 첫 출격을 준비하세요.</p>';
    $('log-dialog').showModal();
  }
  function modeChanged(){
    if(ui.mode===game.mode)return;
    const previous=ui.mode;ui.mode=game.mode;ui.modeChangedAt=performance.now();ui.salvaged=!!game.salvaged;
    renderer.hoverCell=null;renderer.ghostCells=[];ui.hoverPlan=null;selectPart(null);yard.clearHistory();
    const combat=['battle','victory','defeat'].includes(game.mode);document.body.classList.toggle('combat-mode',combat);
    updateInsets();
    renderer.targetPartId=game.targetPartId||null;
    renderer.setMode(['dock','complete'].includes(game.mode)?'build':'combat');
    if(!previous&&!['dock','complete'].includes(game.mode))renderer.fitBattle();
    if(game.mode==='dock'){
      renderer.setMode('build');renderer.focusPlayer();$('launch-label').textContent='작전 출격';setTool('inspect');
      if(previous)toast('함선 복구 완료. 탄약과 설계를 정비하고 다음 작전을 선택하세요.');
    }else if(game.mode==='battle'){
      renderer.setMode('combat');renderer.fitBattle();setTool('inspect');closePanels();toast('교전 시작 · 적 모듈을 눌러 집중 공격하세요.');
    }else if(game.mode==='victory'){sound('win');closePanels();}
    else if(game.mode==='defeat'){sound('error');closePanels();}
    if(previous)autosave();
  }
  function updateInsets(){
    const combat=['battle','victory','defeat'].includes(game.mode),mobile=window.innerWidth<=680;
    renderer.safeInsets={top:combat?(mobile?190:165):105,right:mobile?16:26,bottom:combat?250:105,left:mobile?16:26};
  }
  function updateUI(){
    modeChanged();
    const stats=game.getStats(),sector=clamp(Math.floor(num(game.sector,1)),1,3),mission=missions[sector-1];
    $('credits').textContent=fmt(game.credits);$('crew-count').textContent=fmt(stats.crewTotal??game.player.crew.length);
    $('mode-label').textContent=game.mode==='dock'?'DRYDOCK / 조립 모드':game.mode==='battle'?(game.paused?'TACTICAL PAUSE / 일시정지':'IN COMBAT / 교전 중'):game.mode==='defeat'?'DISTRESS / 구조 대기':game.mode==='complete'?'EXPEDITION COMPLETE / 원정 완료':'SECTOR SECURED / 항로 확보';
    $('sector-label').textContent=`ORION BELT — SECTOR 0${sector}`;
    $('ship-name').textContent=game.player.name||'AURORA';$('ship-caption').textContent=game.mode==='dock'?'YOUR VESSEL / 함선 설계':'YOUR VESSEL / 작전 수행';
    $('design-note').textContent=game.mode==='dock'?`모듈 ${game.player.parts.length}개 · ${fmt(stats.shipCost)} 크레딧`:`${num(stats.dps).toFixed(1)} DPS · ${Math.floor(num(game.time))}s`;
    const hull=clamp(num(stats.hullPercent,100),0,100),energy=clamp(num(stats.energyPercent),0,100);
    $('hull-value').innerHTML=`${Math.round(hull)}<small>%</small>`;$('hull-meter').style.width=`${hull}%`;$('hull-meter').style.background=hull<35?'#eb7e75':'#68e2c5';
    $('energy-value').innerHTML=`${Math.round(energy)}<small>%</small>`;$('energy-meter').style.width=`${energy}%`;
    $('ammo-value').textContent=fmt(stats.ammoTotal);$('heat-value').textContent=num(stats.heatMax,stats.heatAvg).toFixed(0);$('heat-value').style.color=num(stats.heatMax,stats.heatAvg)>65?'#edb16e':'';
    const crew=Math.floor(num(stats.crewTotal,game.player.crew.length)),busy=Math.floor(num(stats.crewBusy));
    const jobs={power:'전지 운송',ammo:'탄약 운송',repair:'현장 수리',extinguish:'소화 작업'};
    $('crew-pips').innerHTML=game.player.crew.filter(c=>c.alive!==false).slice(0,20).map(c=>`<i class="${c.job?'active ':''}${safe(c.job?.kind||'idle')}" title="${safe(jobs[c.job?.kind]||'대기')}"></i>`).join('');
    $('crew-activity-label').textContent=`${busy} / ${crew} 작업 중`;
    $('delivery-count').textContent=`보급량 ${fmt(num(stats.powerDelivered)+num(stats.ammoDelivered))}`;
    $('fire-count').textContent=fmt(stats.fireCount);$('fire-count').classList.toggle('on-fire',num(stats.fireCount)>0);
    $('service-workers').textContent=`${fmt(num(stats.repairWorkers)+num(stats.firefighters))}명`;
    $('service-workers').title=`소화 ${fmt(stats.firefighters)}명 · 수리 ${fmt(stats.repairWorkers)}명`;
    $('repair-stock-value').textContent=fmt(stats.repairStock);
    $('repair-stock-value').classList.toggle('low-stock',num(stats.repairStock)<20);
    $('field-repair-state').textContent=`자재 ${fmt(stats.repairStock)} · 화재 ${fmt(stats.fireCount)}`;
    $('field-repair-state').classList.toggle('on-fire',num(stats.fireCount)>0);
    document.querySelectorAll('[data-repair-policy]').forEach(b=>{const active=b.dataset.repairPolicy===game.repairPolicy;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
    const servicePart=game.player.parts.find(p=>p.id===game.serviceTargetId&&p.hp>0);
    $('service-order').hidden=game.mode!=='battle'||!servicePart;
    if(servicePart)$('service-order-label').textContent=`＋ 우선 정비 · ${StarSim.PARTS[servicePart.type].name}`;
    const contract=(game.getContracts?.()||[]).find(c=>c.id===(game.contractId||game.contract));
    $('mission-number').textContent=`0${sector} / 03`;$('mission-title').textContent=contract?.name||mission.name;$('mission-description').textContent=contract?.description||mission.description;
    $('mission-difficulty').innerHTML=[1,2,3].map(i=>`<i class="${i>sector?'dim':''}"></i>`).join('')+' '+safe(contract?.risk||mission.difficulty);
    $('mission-reward').textContent=num(stats.reward||game.reward)>0?`+ ${fmt(stats.reward||game.reward)} ◈`:'계약 + 잔해';
    const issues=Array.isArray(stats.issues)?stats.issues:[];
    $('warnings').innerHTML=issues.slice(0,3).map(i=>`<div>△ ${safe(typeof i==='string'?i:i.message||i.text||'운용 상태 확인')}</div>`).join('');
    $('hull-tag').classList.toggle('warning',hull<60||issues.length>0);
    $('hull-tag').innerHTML=`<span class="status-led small"></span> ${game.player.dead?'제어 상실':hull<40?'수리 필요':issues.length?'운용 점검':'운용 가능'}`;
    const dock=game.mode==='dock';
    $('mission-button').disabled=!dock;$('mirror-button').disabled=!dock;$('blueprints-button').disabled=!dock;
    $('nav-upgrades').disabled=!dock;$('workshop-button').disabled=!dock;$('supplies-overview').disabled=!dock;
    $('undo-button').disabled=!yard.canUndo;$('redo-button').disabled=!yard.canRedo;
    $('mirror-button').setAttribute('aria-pressed',String(ui.mirror));$('mirror-state').textContent=ui.mirror?'ON':'OFF';renderer.mirrorMode=ui.mirror&&dock;
    $('progress-pips').innerHTML=[1,2,3].map(i=>`<span class="${game.mode==='complete'||i<sector?'done':i===sector?'current':''}"><i>${game.mode==='complete'||i<sector?'✓':`0${i}`}</i><small>${['외곽 항로','잔해 지대','중앙 관문'][i-1]}</small></span>`).join('');
    $('tactical-bar').hidden=game.mode!=='battle';
    document.querySelectorAll('[data-tactic]').forEach(b=>{b.classList.toggle('active',b.dataset.tactic===game.tactic);b.setAttribute('aria-pressed',String(b.dataset.tactic===game.tactic));});
    if(document.activeElement!==$('target-priority'))$('target-priority').value=game.targetPriority||'weapons';
    $('clear-target').disabled=!game.targetPartId;
    $('repair-button').disabled=!dock;$('restock-button').disabled=!dock;$('erase-tool').disabled=!dock;$('rotate-tool').disabled=!dock;
    $('launch-label').textContent=game.mode==='battle'?'긴급 철수':game.mode==='victory'?'조선소 귀환':game.mode==='defeat'?'구조 요청':game.mode==='complete'?'새 원정':'작전 선택';
    $('nav-dock').textContent=dock?'조선소':'작전';
    $('pause-button').textContent=game.paused?'▶':'Ⅱ';$('pause-button').setAttribute('aria-label',game.paused?'계속 진행':'일시정지');
    document.querySelectorAll('[data-speed]').forEach(b=>b.classList.toggle('active',num(b.dataset.speed)===game.speed));
    document.querySelectorAll('[data-policy]').forEach(b=>b.classList.toggle('active',b.dataset.policy===game.crewPolicy));
    $('overclock-button').classList.toggle('active',!!game.overclock);$('overclock-button').setAttribute('aria-pressed',String(!!game.overclock));$('overclock-state').textContent=game.overclock?'ON':'OFF';
    $('zoom-label').textContent=`${Math.round(num(renderer.view?.zoom,1)*100)}%`;
    const enemy=game.enemy;$('battle-objective').hidden=game.mode!=='battle'||!enemy;
    if(enemy){
      $('enemy-title').textContent=enemy.name||'적 함선';
      const hp=enemy.parts.reduce((n,p)=>n+Math.max(0,num(p.hp)),0),max=enemy.launchHullMax||enemy.parts.reduce((n,p)=>n+num(p.maxHp,StarSim.PARTS[p.type]?.hp||100),0);
      $('enemy-health-bar').style.width=`${max?clamp(hp/max*100,0,100):0}%`;
      $('range-readout').textContent=`${fmt(Math.hypot(enemy.x-game.player.x,enemy.y-game.player.y))} m`;
      const target=enemy.parts.find(p=>p.id===game.targetPartId&&p.hp>0);
      $('battle-hint').textContent=target?`지정 표적: ${StarSim.PARTS[target.type].name} · ${Math.ceil(target.hp)} HP`:`자동 표적 · ${{weapons:'무장',reactor:'원자로',cockpit:'조종실',shield:'실드'}[game.targetPriority]||'무장'} 우선`;
    }
    $('mode-hint').textContent=dock?(ui.tool==='build'?`${StarSim.PARTS[ui.part]?.name} ${ui.mirror?'· 대칭':''} · ${ui.hoverPlan?.message||'인접한 빈 격자에 배치'} · ${['↑','→','↓','←'][ui.rot]}`:'대칭 M · 되돌리기 Ctrl+Z · 청사진 B · 작전 선택으로 출격'):game.mode==='battle'?(game.paused?'전술 정지 · 표적과 교전 방식을 조정하세요.':'적 모듈: 공격 · 아군 모듈 + G: 정비 · Space: 정지'):'다음 항로를 향한 설계를 준비하세요.';
    const ended=['victory','defeat','complete'].includes(game.mode);$('result-panel').hidden=!ended;
    if(ended){
      const defeat=game.mode==='defeat',complete=game.mode==='complete';
      $('result-panel').classList.toggle('defeat',defeat);$('result-symbol').textContent=defeat?'⌁':complete?'✧':'✦';
      $('result-eyebrow').textContent=defeat?'EMERGENCY RECOVERY':complete?'EXPEDITION COMPLETE':'SECTOR SECURED';
      $('result-title').textContent=defeat?'함선의 신호를 잃었습니다.':complete?'오리온 항로가 열렸습니다.':'항로를 확보했습니다.';
      $('result-description').textContent=defeat?`구조팀과 조선소로 돌아가 다시 준비하세요. 복구비 ${fmt(stats.repairCost)} C는 보유 크레딧 안에서 정산됩니다.`:complete?'세 개의 작전을 완수했습니다. 더 나은 설계로 새로운 원정에 도전하세요.':`잔해를 회수하고 함선 증설을 준비하세요. 귀환 시 설계 복구비 ${fmt(stats.repairCost)} C가 정산됩니다.`;
      $('result-stats').innerHTML=`<div><small>선체 상태</small><strong>${Math.round(hull)}%</strong></div><div><small>${defeat?'남은 크레딧':complete?'확보 항로':game.salvaged?'회수한 보상':'회수 보상'}</small><strong>${complete?'3 / 3':defeat?fmt(game.credits):`+ ${fmt(stats.reward||game.reward)}`}</strong></div>`;
      $('battle-report').innerHTML=`<div><small>${complete?'누적 회수':'누적 교전 시간'}</small><strong>${complete?fmt(game.metrics.salvageEarned)+' C':fmt(game.metrics.battleTime)+'s'}</strong></div><div><small>누적 가한 피해</small><strong>${fmt(game.metrics.damageDealt)}</strong></div><div><small>누적 피격 피해</small><strong>${fmt(game.metrics.damageTaken)}</strong></div><div><small>승무원</small><strong>${crew}명</strong></div><div><small>누적 현장 수리</small><strong>${fmt(game.metrics.hullRepaired)} HP</strong></div><div><small>누적 진압 화재</small><strong>${fmt(game.metrics.firesExtinguished)}건</strong></div>`;
      $('salvage-button').hidden=defeat||complete;$('salvage-button').disabled=ui.salvaged||!!game.salvaged;
      $('salvage-button').textContent=ui.salvaged||game.salvaged?'회수 완료 ✓':'잔해 회수';
      $('return-button').textContent=complete?'새 원정 시작':defeat?'구조 요청 · 조선소 복귀':'조선소로 귀환';
    }
    updateInspector();
    if($('analysis-dialog').open)renderEngineering(stats);
    if($('workshop-dialog').open)renderWorkshop(stats);
    if($('mission-dialog').open)renderPreflight(stats);
  }

  function tryPlace(cell){
    if(game.mode!=='dock'||!cell)return;
    const r=edit('place',ui.part,cell.x,cell.y,ui.rot,ui.mirror);
    if(r.ok!==false)ui.dirty=true;
  }
  function pointerAction(e){
    const hit=renderer.pickPart?.(e.clientX,e.clientY);
    if(game.mode==='dock'){
      const cell=renderer.screenToGrid(e.clientX,e.clientY);
      if(e.button===2||ui.tool==='erase'){if(hit?.ship.faction==='player')edit('erase',hit.part.x,hit.part.y,ui.mirror);return;}
      if(ui.tool==='build'){tryPlace(cell);return;}
      selectPart(hit);
      if(hit&&window.innerWidth<=680)document.body.classList.add('show-inspector');
    }else if(game.mode==='battle'){
      if(hit?.ship.faction==='enemy'){perform('setTarget',hit.part.id);renderer.targetPartId=hit.part.id;selectPart(hit);toast(`${StarSim.PARTS[hit.part.type]?.name||'적 부품'} 집중 공격`);}
      else if(hit){selectPart(hit);if(window.innerWidth<=940)document.body.classList.add('show-inspector');}
      else {const w=renderer.screenToWorld(e.clientX,e.clientY);perform('setMoveTarget',w.x,w.y);renderer.targetPartId=game.targetPartId||null;}
    }else selectPart(hit);
  }
  function hover(e){
    const cell=renderer.screenToGrid(e.clientX,e.clientY);
    if(cell){const coord=n=>`${n<0?'−':'+'}${String(Math.abs(n)).padStart(2,'0')}`;$('view-coordinates').textContent=`X ${coord(cell.x)} / Y ${coord(cell.y)}`;}
    if(ui.tool==='build'&&game.mode==='dock'&&cell){
      ui.hover=cell;ui.hoverPlan=yard.preview(ui.part,cell.x,cell.y,ui.rot,ui.mirror);
      renderer.hoverCell=null;renderer.ghostCells=ui.hoverPlan.cells;
    }else{renderer.hoverCell=null;renderer.ghostCells=[];ui.hoverPlan=null;}
  }
  function refreshGhost(){
    if(ui.hover&&ui.tool==='build'&&game.mode==='dock'){ui.hoverPlan=yard.preview(ui.part,ui.hover.x,ui.hover.y,ui.rot,ui.mirror);renderer.hoverCell=null;renderer.ghostCells=ui.hoverPlan.cells;}
  }
  function toggleMirror(){if(game.mode!=='dock')return;ui.mirror=!ui.mirror;refreshGhost();updateUI();toast(ui.mirror?'좌우 대칭 켜짐 · 두 칸의 비용을 함께 확인합니다.':'좌우 대칭 꺼짐');}
  function copySelected(){
    const hit=findSelection();if(game.mode!=='dock'||!hit||hit.ship.faction!=='player'){toast('복제할 아군 부품을 먼저 선택하세요.',true);return;}
    ui.rot=hit.part.rot;setTool('build',hit.part.type);toast(`${StarSim.PARTS[hit.part.type].name} 복제 · 빈 칸에 배치하세요.`);refreshGhost();
  }
  function renderPreflight(s=game.getStats()){
    const issues=s.issues||[];
    $('preflight-status').textContent=issues.length?issues.slice(0,3).map(x=>typeof x==='string'?x:x.message).join(' · '):`모듈 ${game.player.parts.length}개 · 승무원 ${s.crewTotal}명 · 선체 ${Math.round(s.hullPercent)}%`;
    $('preflight-status').classList.toggle('warning-text',issues.length>0);
    const info=[['무장 준비',`${fmt(s.weaponReady)}문`,num(s.weaponReady)===0],['정비 자재',`${fmt(s.repairStock)}`,num(s.repairStock)<20],['활성 화재',`${fmt(s.fireCount)}곳`,num(s.fireCount)>0]];
    $('preflight-details').innerHTML=info.map(([label,value,warn])=>`<span class="${warn?'warning-text':''}">${label} <strong>${value}</strong></span>`).join('');
  }
  function renderContracts(){
    const contracts=game.getContracts?.()||[],selected=game.contractId||game.contract||'patrol';
    $('route-progress').innerHTML=[1,2,3].map(i=>`<div class="${i<game.sector?'done':i===game.sector?'current':''}"><span>${i<game.sector?'✓':`0${i}`}</span><strong>${['외곽 항로','잔해 지대','중앙 관문'][i-1]}</strong><small>${i<game.sector?'확보 완료':i===game.sector?'현재 항로':'미개척 항로'}</small></div>`).join('');
    $('contracts-list').innerHTML=contracts.map((c,i)=>`<button class="contract-option ${c.id===selected?'active':''}" data-contract="${safe(c.id)}" aria-pressed="${c.id===selected}"><span class="contract-mark">${['⌖','▰','↗'][i]||'◇'}</span><span class="eyebrow">CONTRACT 0${i+1}</span><h3>${safe(c.name)}</h3><p>${safe(c.description)}</p><div class="contract-style">${safe(({patrol:'균형형 · 중거리 교전',siege:'중포형 · 장거리 교전',hunter:'기동형 · 근거리 교전'})[c.enemyStyle]||'적 함선 교전')}</div><div class="contract-price"><span>${safe(c.risk||'작전')}</span><strong>+ ${fmt(c.reward)} C</strong></div></button>`).join('');
    renderPreflight();
  }
  function toggleServiceTarget(){
    const hit=findSelection();
    if(game.mode!=='battle'||!hit||hit.ship.faction!=='player'||hit.part.hp<=0){toast('전투 중 정비할 아군 부품을 먼저 선택하세요.',true);return;}
    const r=game.serviceTargetId===hit.part.id?perform('clearServiceTarget'):perform('setServiceTarget',hit.part.id);
    if(r.ok)setOverlay('damage');
  }
  function renderWorkshop(s=game.getStats()){
    const dock=game.mode==='dock',upgrades=game.getUpgrades(),signature=JSON.stringify([dock,game.credits,upgrades]);
    $('workshop-credits').textContent=`${fmt(game.credits)} C`;
    if(signature!==ui.workshopSignature){
      ui.workshopSignature=signature;
      const symbols={reactor:'reactor',logistics:'bunk',drive:'thruster'};
      const captions={reactor:'POWER GENERATION',logistics:'CREW LOGISTICS',drive:'THRUST CONTROL'};
      $('upgrade-cards').innerHTML=upgrades.map(u=>{
        const maxed=u.level>=u.maxLevel,affordable=game.credits>=u.cost;
        return `<article class="upgrade-card ${maxed?'maxed':''}"><div class="upgrade-card-top"><span class="upgrade-icon">${icon(symbols[u.id]||'reactor')}</span><span class="upgrade-level">Lv. ${u.level} <small>/ ${u.maxLevel}</small></span></div><span class="eyebrow">${safe(captions[u.id]||'ENGINEERING')}</span><h3>${safe(u.name)}</h3><p>${safe(u.description)}</p><div class="upgrade-steps" aria-label="${u.maxLevel}단계 중 ${u.level}단계">${Array.from({length:u.maxLevel},(_,i)=>`<i class="${i<u.level?'filled':''}"></i>`).join('')}</div><div class="upgrade-effect"><small>현재 효과</small><strong>${safe(u.currentEffect)}</strong></div><div class="upgrade-next"><span>${maxed?'개량 완료':safe(u.nextEffect)}</span><strong>${maxed?'MAX':`${fmt(u.cost)} C`}</strong></div><button class="secondary-button" data-buy-upgrade="${safe(u.id)}" ${!dock||maxed||!affordable?'disabled':''}>${!dock?'도크에서 개량':maxed?'최대 단계 도달':!affordable?'크레딧 부족':`${u.level+1}단계 개량 →`}</button></article>`;
      }).join('');
    }
    const amount=num(s.repairSupplyAmount),cost=num(s.repairSupplyCost),stock=num(s.repairStock),cap=num(s.repairStockMax,240);
    $('workshop-stock').textContent=`${fmt(stock)} / ${fmt(cap)}`;
    $('workshop-stock-meter').style.width=`${clamp(stock/cap*100,0,100)}%`;
    $('buy-repair-supplies').disabled=!dock||amount<=0||game.credits<cost;
    $('buy-repair-supplies').textContent=amount<=0?'정비 자재 가득 참':`${qty(amount)} 보급 · ${fmt(cost)} C`;
    $('supply-explanation').textContent='자재 1로 최대 4 HP를 수리합니다. 파괴된 부품은 도크에서 복구하며, 소화 작업은 자재를 쓰지 않습니다.';
    const advice=[];
    if(stock<20)advice.push('정비 자재가 적습니다. 다음 교전을 준비할 때 보급량을 확인하세요.');
    if(num(s.powerDemand)>num(s.powerProduction))advice.push(`최대 가동 전력 ${num(s.powerDemand).toFixed(1)}/s · 생산 ${num(s.powerProduction).toFixed(1)}/s. 발전량과 전지 운송을 함께 점검하세요.`);
    advice.push('기술 개량은 현재 원정의 모든 아군 부품에 적용됩니다. 새 원정을 시작하면 초기화됩니다.');
    $('workshop-advice').innerHTML=advice.map(t=>`<p>${safe(t)}</p>`).join('');
  }
  function showWorkshop(){
    if(game.mode!=='dock'){toast('기술 개량과 정비 자재 보급은 도크에서 가능합니다.',true);return;}
    closePanels();ui.workshopSignature=null;renderWorkshop();$('workshop-dialog').showModal();
  }
  function showMission(){if(game.mode!=='dock')return;closePanels();renderContracts();$('mission-dialog').showModal();}
  function miniShip(design){
    const ps=design.parts||[];if(!ps.length)return '';
    const xs=ps.map(p=>p.x),ys=ps.map(p=>p.y),minx=Math.min(...xs)-1,miny=Math.min(...ys)-1,w=Math.max(...xs)-minx+2,h=Math.max(...ys)-miny+2;
    return `<svg class="blueprint-preview" viewBox="${minx*9} ${miny*9} ${w*9} ${h*9}" role="img" aria-label="${safe(design.name)} 함선 배치">${ps.map(p=>`<g><rect x="${p.x*9}" y="${p.y*9}" width="8" height="8" rx="1" fill="${safe(StarSim.PARTS[p.type]?.color||'#4f7780')}" stroke="#acc9d1" stroke-opacity=".2" stroke-width=".6"/>${['laser','cannon','thruster'].includes(p.type)?`<path d="M${p.x*9+4} ${p.y*9+4} l${[0,4,0,-4][p.rot]} ${[-4,0,4,0][p.rot]}" stroke="#e7f4f0" stroke-width="1.1"/>`:''}</g>`).join('')}</svg>`;
  }
  function renderLibrary(){
    ui.designChoices=yard.getPresets();
    $('preset-list').innerHTML=ui.designChoices.map((d,i)=>{const q=yard.quote(d);return `<article class="design-card">${miniShip(d)}<span class="eyebrow">SHIP DESIGN / 0${i+1}</span><h3>${safe(d.name)}</h3><p>${safe(d.description)}</p><div class="design-quote"><span>${d.parts.length} 모듈</span><span>가치 ${fmt(d.parts.reduce((n,p)=>n+StarSim.PARTS[p.type].cost,0))} C</span></div><button class="secondary-button" data-apply-preset="${i}" ${!q.ok?'disabled':''} title="${safe(q.message)}">${game.mode!=='dock'?'도크에서 적용':q.ok?(q.netCost>0?`${fmt(q.netCost)} C로 적용`:q.netCost<0?`${fmt(-q.netCost)} C 환급 · 적용`:'부품 재사용 · 적용'):'크레딧 부족'}</button></article>`;}).join('');
    $('saved-blueprints').innerHTML=ui.blueprints.length?`<h3>저장한 설계 <span>${ui.blueprints.length} / 6</span></h3>`+ui.blueprints.map((d,i)=>{const q=yard.quote(d);return `<div class="saved-design">${miniShip(d)}<div><strong>${safe(d.name)}</strong><small>${d.parts.length} 모듈 · ${game.mode!=='dock'?'도크에서 견적 확인':q.netCost>=0?fmt(q.netCost)+' C 필요':fmt(-q.netCost)+' C 환급'}</small></div><button class="secondary-button" data-apply-saved="${i}" ${!q.ok?'disabled':''}>적용</button><button class="text-button" data-delete-saved="${i}" aria-label="${safe(d.name)} 청사진 삭제">✕</button></div>`;}).join(''):'<div class="empty-blueprints">아직 저장한 청사진이 없습니다. 지금의 설계에 이름을 붙여 보관하세요.</div>';
    $('save-blueprint').disabled=game.mode!=='dock';
  }
  function showLibrary(){closePanels();renderLibrary();$('blueprint-name').value=game.player.name||'';$('blueprints-dialog').showModal();}
  function applyDesign(design){const r=edit('apply',design);if(r.ok){selectPart(null);renderer.focusPlayer();renderLibrary();}}
  function renderEngineering(s=game.getStats()){
    const pairs=[['설계 질량',fmt(game.player.mass)],['이론 화력',`${num(s.estimatedDps).toFixed(1)} /s`],['전력 생산',`${num(s.powerProduction).toFixed(1)} /s`],['최대 가동 전력',`${num(s.powerDemand).toFixed(1)} /s`],['최대 사격 탄약',`${num(s.ammoDemand).toFixed(1)} /s`],['공급 충족 / 사선 차폐',`${fmt(s.weaponReady)} / ${fmt(s.weaponBlocked)} 문`],['전진 가속 ↑',`${num(s.forwardThrust).toFixed(1)} m/s²`],['후진 가속 ↓',`${num(s.reverseThrust).toFixed(1)} m/s²`],['좌현 가속 ←',`${num(s.leftThrust).toFixed(1)} m/s²`],['우현 가속 →',`${num(s.rightThrust).toFixed(1)} m/s²`],['선회 가속',`${num(s.turnAuthority).toFixed(2)} rad/s²`],['승무원',`${s.crewTotal}명`],['정비 자재',`${fmt(s.repairStock)} / ${fmt(s.repairStockMax)}`],['활성 화재',`${fmt(s.fireCount)}곳`],['소화 / 수리 인원',`${fmt(s.firefighters)} / ${fmt(s.repairWorkers)}명`],['발전 개량',`Lv. ${num(game.upgrades?.reactor)}`],['물류 개량',`Lv. ${num(game.upgrades?.logistics)}`],['추진 개량',`Lv. ${num(game.upgrades?.drive)}`]];
    $('engineering-stats').innerHTML=pairs.map(([label,value])=>`<div><small>${label}</small><strong>${value}</strong></div>`).join('');
    const issues=s.issues||[];$('engineering-issues').innerHTML=issues.length?issues.map(x=>`<p class="warning-text">△ ${safe(typeof x==='string'?x:x.message)}</p>`).join(''):'<p class="ready-text">✓ 현재 설계에서 운용상 문제가 발견되지 않았습니다.</p>';
  }
  function showEngineering(){renderEngineering();$('analysis-dialog').showModal();}
  const canvas=$('game-canvas');
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  canvas.addEventListener('pointerdown',e=>{
    canvas.setPointerCapture(e.pointerId);ui.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(ui.pointers.size===2){const p=[...ui.pointers.values()];ui.pinch={distance:Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y),x:(p[0].x+p[1].x)/2,y:(p[0].y+p[1].y)/2};if(ui.drag)ui.drag.moved=true;return;}
    ui.drag={id:e.pointerId,startX:e.clientX,startY:e.clientY,x:e.clientX,y:e.clientY,moved:false,button:e.button};hover(e);
  });
  canvas.addEventListener('pointermove',e=>{
    if(ui.pointers.has(e.pointerId))ui.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(ui.pointers.size===2&&ui.pinch){
      const p=[...ui.pointers.values()],distance=Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y),x=(p[0].x+p[1].x)/2,y=(p[0].y+p[1].y)/2;
      if(ui.pinch.distance>0)renderer.zoomBy(distance/ui.pinch.distance);
      renderer.pan(x-ui.pinch.x,y-ui.pinch.y);ui.pinch={distance,x,y};return;
    }
    if(ui.drag&&ui.drag.id===e.pointerId){
      const d=ui.drag,dx=e.clientX-d.x,dy=e.clientY-d.y;
      if(Math.hypot(e.clientX-d.startX,e.clientY-d.startY)>6)d.moved=true;
      if(d.moved){renderer.pan(dx,dy);document.body.classList.add('dragging');}
      d.x=e.clientX;d.y=e.clientY;
    }
    hover(e);
  });
  canvas.addEventListener('pointerup',e=>{
    const d=ui.drag;if(d&&d.id===e.pointerId&&!d.moved&&!ui.pinch)pointerAction({...e,clientX:e.clientX,clientY:e.clientY,button:d.button});
    ui.pointers.delete(e.pointerId);if(ui.pointers.size<2)ui.pinch=null;if(d?.id===e.pointerId)ui.drag=null;document.body.classList.remove('dragging');
    if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointercancel',e=>{ui.pointers.delete(e.pointerId);ui.drag=null;ui.pinch=null;document.body.classList.remove('dragging');});
  canvas.addEventListener('pointerleave',()=>{if(!ui.drag){renderer.hoverCell=null;renderer.ghostCells=[];ui.hoverPlan=null;ui.hover=null;}});
  canvas.addEventListener('wheel',e=>{e.preventDefault();renderer.zoomBy(Math.exp(-e.deltaY*.001));updateUI();},{passive:false});

  $('part-filters').addEventListener('click',e=>{const b=e.target.closest('[data-filter]');if(!b)return;ui.filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x===b));renderPalette();});
  $('inspect-tool').onclick=()=>setTool('inspect');$('erase-tool').onclick=()=>setTool('erase');
  function rotate(){
    if(game.mode!=='dock')return;
    const selected=findSelection();if(ui.tool==='inspect'&&selected?.ship.faction==='player'){edit('rotate',selected.part.x,selected.part.y,1,ui.mirror);return;}
    ui.rot=(ui.rot+1)%4;if(ui.tool==='build')setTool('build');refreshGhost();updateUI();sound();
  }
  $('rotate-tool').onclick=rotate;$('repair-button').onclick=()=>perform('repairAll');$('restock-button').onclick=()=>perform('restock');
  $('launch-button').onclick=()=>{
    if(game.mode==='dock')showMission();else if(game.mode==='battle')perform('retreat');else if(game.mode==='complete')$('confirm-dialog').showModal();
    else if(game.mode==='victory'){if(!ui.salvaged&&!game.salvaged){const r=perform('salvage');if(r.ok!==false)ui.salvaged=true;}perform('returnToDock');}
    else perform('returnToDock');
  };
  $('salvage-button').onclick=()=>{const r=perform('salvage');if(r.ok!==false)ui.salvaged=true;updateUI();};
  $('return-button').onclick=()=>{if(game.mode==='complete')$('confirm-dialog').showModal();else {if(game.mode==='victory'&&!ui.salvaged&&!game.salvaged){const r=perform('salvage');if(r.ok!==false)ui.salvaged=true;}perform('returnToDock');}};
  $('nav-dock').onclick=()=>{if(game.mode==='dock'){renderer.focusPlayer();closePanels();}else toast('전투 중에는 함선의 표적과 이동 명령을 조정할 수 있습니다.');};
  $('nav-log').onclick=showLog;$('help-button').onclick=()=>$('help-dialog').showModal();$('brand-home').onclick=e=>{e.preventDefault();$('help-dialog').showModal();};
  $('mirror-button').onclick=toggleMirror;$('undo-button').onclick=()=>edit('undo');$('redo-button').onclick=()=>edit('redo');
  $('blueprints-button').onclick=showLibrary;$('nav-blueprints').onclick=showLibrary;
  $('copy-part-button').onclick=copySelected;$('rotate-part-button').onclick=rotate;
  $('analysis-button').onclick=showEngineering;$('preflight-analysis').onclick=showEngineering;
  $('nav-upgrades').onclick=showWorkshop;$('workshop-button').onclick=showWorkshop;$('preflight-workshop').onclick=showWorkshop;
  $('supplies-overview').onclick=showWorkshop;$('service-overview').onclick=()=>setOverlay('damage');
  $('workshop-analysis').onclick=showEngineering;
  $('upgrade-cards').onclick=e=>{const button=e.target.closest('[data-buy-upgrade]');if(button)perform('purchaseUpgrade',button.dataset.buyUpgrade);};
  $('buy-repair-supplies').onclick=()=>perform('buyRepairSupplies');
  $('service-part-button').onclick=toggleServiceTarget;$('clear-service-button').onclick=()=>perform('clearServiceTarget');
  document.querySelectorAll('[data-repair-policy]').forEach(b=>b.onclick=()=>perform('setRepairPolicy',b.dataset.repairPolicy));
  $('mission-button').onclick=showMission;
  $('contracts-list').onclick=e=>{const b=e.target.closest('[data-contract]');if(b){perform('selectContract',b.dataset.contract);renderContracts();}};
  $('deploy-confirm').onclick=()=>{const r=perform('launch');if(r.ok)$('mission-dialog').close();};
  document.querySelectorAll('[data-tactic]').forEach(b=>b.onclick=()=>perform('setTactic',b.dataset.tactic));
  $('target-priority').onchange=e=>perform('setTargetPriority',e.target.value);
  $('clear-target').onclick=()=>perform('clearTarget');
  $('preset-list').onclick=e=>{const b=e.target.closest('[data-apply-preset]');if(b)applyDesign(ui.designChoices[Number(b.dataset.applyPreset)]);};
  $('saved-blueprints').onclick=e=>{const apply=e.target.closest('[data-apply-saved]'),remove=e.target.closest('[data-delete-saved]');if(apply)applyDesign(ui.blueprints[Number(apply.dataset.applySaved)]);if(remove){ui.blueprints.splice(Number(remove.dataset.deleteSaved),1);saveNow();renderLibrary();toast('청사진을 목록에서 삭제했습니다.');}};
  $('save-blueprint').onclick=()=>{
    if(game.mode!=='dock')return;const design=yard.capture($('blueprint-name').value),validation=yard.validateBlueprint(design);if(!validation.ok){toast(validation.message,true);return;}
    const i=ui.blueprints.findIndex(d=>d.name===design.name);if(i<0&&ui.blueprints.length>=6){toast('청사진은 6개까지 보관할 수 있습니다. 기존 설계를 삭제하거나 같은 이름으로 저장하세요.',true);return;}
    if(i<0)ui.blueprints.push(design);else ui.blueprints[i]=design;saveNow();renderLibrary();toast('청사진을 저장했습니다. 원정 파일 내보내기에도 포함됩니다.');
  };
  document.querySelectorAll('[data-close-dialog]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
  document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
  document.querySelectorAll('[data-overlay]').forEach(b=>b.onclick=()=>setOverlay(b.dataset.overlay));
  document.querySelectorAll('[data-policy]').forEach(b=>b.onclick=()=>perform('setCrewPolicy',b.dataset.policy));
  document.querySelectorAll('[data-speed]').forEach(b=>b.onclick=()=>{game.speed=Number(b.dataset.speed);game.paused=false;updateUI();sound();});
  $('pause-button').onclick=()=>{game.paused=!game.paused;updateUI();sound();};
  $('overclock-button').onclick=()=>perform('toggleOverclock');
  $('zoom-out').onclick=()=>{renderer.zoomBy(.84);updateUI();};$('zoom-in').onclick=()=>{renderer.zoomBy(1.19);updateUI();};
  $('focus-button').onclick=()=>{game.mode==='dock'?renderer.focusPlayer():renderer.fitBattle();updateUI();};
  $('toggle-build').onclick=()=>{document.body.classList.remove('show-inspector');document.body.classList.toggle('show-build');};
  $('toggle-info').onclick=()=>{document.body.classList.remove('show-build');document.body.classList.toggle('show-inspector');};
  $('close-build').onclick=()=>document.body.classList.remove('show-build');$('close-info').onclick=()=>document.body.classList.remove('show-inspector');
  $('sound-button').onclick=()=>{ui.sound=!ui.sound;$('sound-button').classList.toggle('on',ui.sound);$('sound-button').setAttribute('aria-label',ui.sound?'소리 끄기':'소리 켜기');$('sound-button').title=ui.sound?'소리 끄기':'소리 켜기';sound();};
  $('menu-button').onclick=e=>{e.stopPropagation();$('menu-popover').hidden=!$('menu-popover').hidden;};
  document.addEventListener('click',e=>{if(!e.target.closest('#menu-popover')&&!e.target.closest('#menu-button'))$('menu-popover').hidden=true;});
  $('menu-workshop').onclick=()=>{$('menu-popover').hidden=true;showWorkshop();};
  $('menu-log').onclick=()=>{$('menu-popover').hidden=true;showLog();};
  $('save-button').onclick=()=>{saveNow(true);$('menu-popover').hidden=true;};
  $('export-button').onclick=()=>{
    const blob=new Blob([JSON.stringify(makeSave(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=`starforge-sector-${game.sector}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('menu-popover').hidden=true;toast('원정 저장 파일을 내보냈습니다.');
  };
  $('import-button').onclick=()=>{$('menu-popover').hidden=true;$('import-file').click();};
  $('import-file').onchange=async e=>{
    const file=e.target.files?.[0];if(!file)return;
    try{
      if(file.size>512000)throw new Error('파일이 너무 큽니다.');
      const data=JSON.parse(await file.text()),designs=data.designLibrary===undefined?ui.blueprints:readLibrary(data.designLibrary),r=perform('importSave',data);
      if(r.ok!==false){ui.blueprints=designs;ui.mode=null;ui.selected=null;modeChanged();game.mode==='dock'?renderer.focusPlayer():renderer.fitBattle();toast('원정과 청사진을 불러왔습니다.');saveNow();}
    }catch(error){toast(`불러오기 실패: ${error.message||'유효한 STARFORGE 저장 파일을 선택해 주세요.'}`,true);}finally{e.target.value='';}
  };
  $('new-button').onclick=()=>{$('menu-popover').hidden=true;$('confirm-dialog').showModal();};
  $('confirm-new').onclick=()=>{perform('reset');ui.mode=null;ui.selected=null;ui.salvaged=false;modeChanged();renderer.focusPlayer();$('confirm-dialog').close();saveNow();updateUI();};
  window.addEventListener('keydown',e=>{
    if(e.target.matches('input,textarea,select')||document.querySelector('dialog[open]'))return;
    const key=e.key.toLowerCase();
    if(e.ctrlKey||e.metaKey){if(key==='z'){e.preventDefault();edit(e.shiftKey?'redo':'undo');}else if(key==='y'){e.preventDefault();edit('redo');}return;}
    if(e.code==='Space'){e.preventDefault();$('pause-button').click();}
    else if(['1','2','3'].includes(key)){game.speed=Number(key);game.paused=false;updateUI();}
    else if(key==='r'&&game.mode==='dock')rotate();
    else if(key==='m'&&game.mode==='dock')toggleMirror();
    else if(key==='b')showLibrary();
    else if(key==='u')showWorkshop();
    else if(key==='g')toggleServiceTarget();
    else if(key==='v'&&game.mode==='dock')copySelected();
    else if(key==='f'){$('focus-button').click();}
    else if(key==='h'){$('help-dialog').showModal();}
    else if(key==='c'){const names=['normal','logistics','heat','damage','tactical'];setOverlay(names[(names.indexOf(renderer.overlay)+1)%names.length]);}
    else if(key==='escape'){setTool('inspect');closePanels();$('menu-popover').hidden=true;}
    else if((key==='delete'||key==='backspace')&&game.mode==='dock'){const s=findSelection();if(s?.ship.faction==='player'){e.preventDefault();edit('erase',s.part.x,s.part.y,ui.mirror);selectPart(null);}}
    else if(['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d'].includes(key)){e.preventDefault();renderer.pan(['a','arrowleft'].includes(key)?35:['d','arrowright'].includes(key)?-35:0,['w','arrowup'].includes(key)?35:['s','arrowdown'].includes(key)?-35:0);}
  });
  window.addEventListener('beforeunload',()=>saveNow());
  let restored=false;
  try{const library=localStorage.getItem(DESIGN_KEY);if(library)ui.blueprints=readLibrary(JSON.parse(library));}catch{}
  try{const raw=localStorage.getItem(SAVE_KEY);if(raw){const data=JSON.parse(raw),designs=data.designLibrary===undefined?ui.blueprints:readLibrary(data.designLibrary),r=game.importSave(data);restored=r?.ok!==false;if(restored)ui.blueprints=designs;}}catch{}
  renderPalette();
  const resize=()=>{updateInsets();renderer.resize();};
  new ResizeObserver(resize).observe($('viewport'));resize();updateUI();
  if(restored)setTimeout(()=>toast('저장된 원정을 이어서 진행합니다.'),500);
  let saveAccumulator=0;
  function frame(t){
    const dt=ui.lastFrame?Math.min((t-ui.lastFrame)/1000,.05):0;ui.lastFrame=t;
    if(!document.hidden){
      game.update(dt);renderer.draw(dt);saveAccumulator+=dt;
      if(t-ui.lastUI>160){updateUI();ui.lastUI=t;}
      if(saveAccumulator>20){saveAccumulator=0;saveNow();}
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
