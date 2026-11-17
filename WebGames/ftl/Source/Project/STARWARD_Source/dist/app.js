(() => {
  'use strict';
  const SW = globalThis.Starward;
  const game = globalThis.game = new SW.Game();
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pct = (n,d=100) => Math.max(0, Math.min(100, (Number(n)||0)/(Number(d)||1)*100));
  const round = n => Math.round(Number(n)||0);
  const STORE = 'starward-save-v1';
  const VIEW_STORE = 'starward-view-v1';
  let visualPrefs = {};
  try { visualPrefs = JSON.parse(localStorage.getItem(VIEW_STORE) || '{}') || {}; } catch (_) {}
  const UI = globalThis.StarwardUI = {selectedCrew:null,selectedCrewIds:[],selectedWeapon:null,selectedNode:null,modal:null,sound:false,lastMode:'',toastTimer:null,autoSaveError:false,multiSelect:false,intent:null,beamStart:null,arsenal:'weapons',doorsOpen:false,importCandidate:null,skillCrewId:null,swapCargoId:null,discardCargoId:null,layoutSide:'player',mapView:'local',selectedWorld:null,pointerDown:false,selectedTile:null,selectedEnemyCrewId:null,selectedSlotId:null,renderMode:visualPrefs.renderMode==='3d'?'3d':'2d',visualStyle:['stellar','lowpoly','blueprint'].includes(visualPrefs.visualStyle)?visualPrefs.visualStyle:'stellar'};
  const visualStyles = {stellar:{name:'현대 SF',detail:'금속 선체 · 발광 장비',friendly:'#81e5db',enemy:'#f4a171',floor:'#142c38',enemyFloor:'#352d2c',hull:'#284249',empty:'#8babc1'},lowpoly:{name:'로우폴리',detail:'각진 형태 · 선명한 색',friendly:'#c8e58d',enemy:'#ffad96',floor:'#35394c',enemyFloor:'#4c3544',hull:'#5c506e',empty:'#e0cc9a'},blueprint:{name:'청사진',detail:'설계선 · 높은 대비',friendly:'#8cddff',enemy:'#ffdd9b',floor:'#0b3251',enemyFloor:'#163951',hull:'#10476b',empty:'#acd1e5'}};
  // Share faction and warning colors with the 3D renderer. Materials and
  // silhouettes may change, but a friendly unit keeps the same meaning.
  for (const [id,style] of Object.entries(visualStyles)) {
    const colors=globalThis.Starward3D?.styles?.[id]?.colors||{friendly:'#80e1cc',enemy:'#f09d79',selected:'#ffe4a0',danger:'#f76d83',ion:'#91b7ff',hacking:'#c19af1',empty:'#668294'};
    for(const key of ['friendly','enemy','selected','danger','ion','hacking','empty'])style[key]=colors[key];
  }
  let renderer3d = null, rendererStyle = null;
  const icons = {engines:'⋙',shields:'⬡',weapons:'⌖',bridge:'◈',oxygen:'◉',medbay:'✚',drones:'⌘',teleporter:'↗',cloaking:'◌',hacking:'⌁',mind:'◎',battery:'ϟ'};
  const sysNames = {engines:'엔진',shields:'실드',weapons:'무기',bridge:'조타실',oxygen:'산소실',medbay:'의료실',drones:'드론',teleporter:'텔레포터',cloaking:'은폐',hacking:'해킹',mind:'정신 지배',battery:'보조 배터리'};
  const nodeNames = {combat:'교전',event:'미확인 신호',shop:'교역소',repair:'구조 신호',exit:'섹터 출구',boss:'반군 기함',start:'출발 지점',quest:'퀘스트',base:'연방 기지',empty:'빈 비콘'};
  const nodeSymbols = {combat:'×',event:'?',shop:'₴',repair:'+',exit:'↗',boss:'◆',start:'◇',quest:'!',base:'✦',empty:'·'};
  const skillNames = {piloting:'조타',engines:'엔진',weapons:'무기',shields:'실드',repair:'정비',combat:'근접전'};
  const speciesNames = {human:'인간',engi:'엔지',rock:'록',mantis:'맨티스',slug:'슬러그'};
  let toastId = 0, audioContext, lastFrame = 0, drawClock = 0, saveClock = 0, lastSoundLog = 0, autoSaveMode = '', modalSignature = '', returnFocus;

  const renderedMarkup = new WeakMap();
  function patch(el, html) {
    // Compare the generated markup, not the browser's normalized innerHTML.
    // Normalization otherwise replaces unchanged controls every frame and can
    // interrupt a key press or pointer interaction while the battle is paused.
    if (!el || renderedMarkup.get(el) === html || UI.pointerDown) return;
    const focus = el.contains(document.activeElement) ? document.activeElement?.getAttribute('data-focus') : null;
    el.innerHTML = html;
    renderedMarkup.set(el, html);
    if(focus) el.querySelector('[data-focus="'+CSS.escape(focus)+'"]')?.focus({preventScroll:true});
  }
  function toast(text) {
    const n = ++toastId; $('toast').textContent = text; $('toast').classList.add('show');
    setTimeout(() => {if(n===toastId)$('toast').classList.remove('show');}, 3200);
  }
  function sound(kind='click') {
    if(!UI.sound) return;
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      audioContext.resume();
      const osc=audioContext.createOscillator(),g=audioContext.createGain(),t=audioContext.currentTime;
      osc.type=kind==='hit'?'triangle':'sine';osc.frequency.setValueAtTime(kind==='hit'?120:kind==='win'?600:380,t);
      osc.frequency.exponentialRampToValueAtTime(kind==='hit'?40:kind==='win'?900:440,t+.11);
      g.gain.setValueAtTime(.035,t);g.gain.exponentialRampToValueAtTime(.0001,t+.16);
      osc.connect(g);g.connect(audioContext.destination);osc.start(t);osc.stop(t+.17);
    } catch (_) { UI.sound=false; }
  }
  function resultMessage(result, fallback) {
    if(result === false || result?.ok === false) toast(result?.message || fallback || '현재 상태에서는 실행할 수 없습니다.');
    else if(result?.message) toast(result.message);
    return result!==false && result?.ok!==false;
  }
  function clearSelection() {UI.selectedCrew=null;UI.selectedCrewIds=[];UI.selectedWeapon=null;UI.intent=null;UI.beamStart=null;UI.selectedTile=null;UI.selectedEnemyCrewId=null;}
  function selectedCrew() {return game.state.player.crew.filter(c=>c.hp>0&&!c.controlledBy&&UI.selectedCrewIds.includes(c.id));}
  function physicalCrew(side) {return game.getCrewOnShip?game.getCrewOnShip(side):(game.state[side]?.crew||[]).filter(c=>c.hp>0);}
  function chooseCrew(id, additive=false) {
    if(UI.intent==='mind'){order(()=>game.activateMindControl(id));UI.intent=null;render();return;}
    const crew=game.state.player.crew.find(c=>c.id===id&&c.hp>0);if(!crew)return;
    if(additive||UI.multiSelect){UI.selectedCrewIds=UI.selectedCrewIds.includes(id)?UI.selectedCrewIds.filter(x=>x!==id):[...UI.selectedCrewIds,id];}
    else UI.selectedCrewIds=UI.selectedCrewIds.length===1&&UI.selectedCrewIds[0]===id?[]:[id];
    UI.selectedCrew=UI.selectedCrewIds[0]||null;UI.selectedWeapon=null;UI.beamStart=null;UI.intent=UI.selectedCrew?'crew':null;render();sound();
  }
  function chooseWeapon(id) {clearSelection();UI.selectedWeapon=id;UI.intent='weapon';UI.arsenal='weapons';render();sound();}
  function commandRoom(side,roomId) {
    if(UI.intent==='hacking'&&side==='enemy'){if(resultMessage(game.launchHacking(roomId)))clearSelection();render();return;}
    if(UI.intent==='recall'&&side==='enemy'){const ids=game.state.player.crew.filter(c=>c.hp>0&&c.shipId==='enemy'&&c.roomId===roomId).map(c=>c.id);if(resultMessage(game.recallCrew(ids)))clearSelection();render();return;}
    if(UI.intent==='mind'){toast('정신 지배는 방 안의 승무원 또는 특수 시스템의 대상 목록을 선택하세요.');return;}
    if(UI.intent==='boarding'&&side==='enemy'){
      const r=game.teleportCrew(selectedCrew().map(c=>c.id),roomId);if(resultMessage(r)){UI.intent='crew';toast('침투 완료. 귀환 충전과 적 선체를 확인하세요.');}render();return;
    }
    if(UI.intent==='crew'&&UI.selectedCrewIds.length){
      const crew=selectedCrew().filter(c=>(c.shipId||'player')===side);
      if(!crew.length){toast(side==='enemy'?'적선 침투 버튼을 먼저 누르세요.':'적선의 승무원은 귀환 버튼으로 회수하세요.');return;}
      crew.forEach(c=>resultMessage(game.moveCrew(c.id,roomId,side)));render();sound();return;
    }
    if(side==='enemy'&&UI.selectedWeapon&&game.state.mode==='combat'){
      const w=game.state.player.weapons.find(w=>w.id===UI.selectedWeapon);if(!w)return;
      if(w.type==='beam'){
        if(!UI.beamStart){UI.beamStart=roomId;toast('빔 시작점: '+roomName(roomId,side)+' · 끝 방을 선택하세요.');render();return;}
        const r=game.targetBeam(w.id,UI.beamStart,roomId);if(resultMessage(r)){UI.beamStart=null;toast('빔 경로 지정 · '+(w.targetRooms?.length||1)+'개 방');}render();sound();return;
      }
      if(resultMessage(game.targetWeapon(w.id,roomId)))toast(w.name+' → '+roomName(roomId,side)+(w.fireMode==='manual'?' · 수동 사격 대기':' · 자동 사격'));
      render();sound();return;
    }
    if(side==='player'&&!UI.intent){const slot=game.getSystemSlots?.('player')?.find(item=>item.roomId===roomId);if(slot){openSystems(slot.id);return;}}
    toast(side==='enemy'?'무기를 선택해 조준하거나, 승무원을 선택해 침투하세요.':'승무원을 선택하고 이동할 사각 타일을 누르세요.');
  }

  function persistVisualPrefs() {try{localStorage.setItem(VIEW_STORE,JSON.stringify({renderMode:UI.renderMode,visualStyle:UI.visualStyle}));}catch(_){toast('화면 설정은 현재 창에 적용했습니다. 이 브라우저에는 설정을 저장할 수 없습니다.');}}
  function rendererUnavailable(message) {
    UI.renderMode='2d';persistVisualPrefs();toast(message||'이 환경에서 3D를 사용할 수 없어 2D 화면으로 돌아왔습니다.');
    requestAnimationFrame(()=>render());
  }
  function ensureRenderer() {
    if(renderer3d){if(renderer3d.supported===false){rendererUnavailable('3D 그래픽을 사용할 수 없어 2D 화면을 유지합니다.');return false;}return true;}
    $('scene3d-wrap').hidden=false;
    if(!globalThis.Starward3D?.create){rendererUnavailable('3D 화면을 준비하지 못했습니다. 2D에서 모든 명령을 계속 사용할 수 있습니다.');return false;}
    try{renderer3d=globalThis.Starward3D.create({canvas:$('battle-3d'),onPick:commandPick,onUnavailable:rendererUnavailable});}
    catch(_){rendererUnavailable('3D 그래픽을 초기화하지 못해 2D 화면을 유지합니다.');return false;}
    if(!renderer3d?.supported){rendererUnavailable('이 환경은 3D 그래픽을 지원하지 않습니다. 2D 화면을 유지합니다.');return false;}
    renderer3d.setStyle(UI.visualStyle);rendererStyle=UI.visualStyle;return true;
  }
  function setVisualPreference(kind,value) {
    if(kind==='mode'&&['2d','3d'].includes(value))UI.renderMode=value;
    if(kind==='style'&&Object.hasOwn(visualStyles,value))UI.visualStyle=value;
    if(UI.renderMode==='3d')ensureRenderer();
    if(renderer3d&&rendererStyle!==UI.visualStyle){renderer3d.setStyle(UI.visualStyle);rendererStyle=UI.visualStyle;}
    persistVisualPrefs();modalSignature='';render();renderer3d?.resize?.();
  }
  function visualControls(context) {
    return '<div class="render-mode-picker" role="group" aria-label="'+(context==='hangar'?'격납고 ':'')+'화면 차원 선택">'+['2d','3d'].map(id=>'<button class="view-mode-button '+(UI.renderMode===id?'active':'')+'" data-render-mode="'+id+'" data-focus="view-'+context+'-'+id+'" aria-pressed="'+(UI.renderMode===id)+'"><span aria-hidden="true">'+(id==='2d'?'▦':'⬡')+'</span> '+id.toUpperCase()+'</button>').join('')+'</div><div class="visual-style-picker" role="group" aria-label="그래픽 스타일">'+Object.entries(visualStyles).map(([id,style])=>'<button class="visual-style-button '+(UI.visualStyle===id?'active':'')+'" data-visual-style="'+id+'" data-focus="style-'+context+'-'+id+'" aria-pressed="'+(UI.visualStyle===id)+'" title="'+style.detail+'"><i class="style-swatch '+id+'" aria-hidden="true"></i>'+style.name+'</button>').join('')+'</div>';
  }
  function renderViewSettings() {
    if(UI.renderMode==='3d')ensureRenderer();
    document.body.dataset.renderMode=UI.renderMode;document.body.dataset.visualStyle=UI.visualStyle;
    for(const [property,key] of [['--cyan','friendly'],['--orange','enemy'],['--selected','selected'],['--red','danger'],['--ion','ion'],['--hacking','hacking']])document.body.style.setProperty(property,visualStyles[UI.visualStyle][key]);
    $('scene3d-wrap').hidden=UI.renderMode!=='3d';
    $('scene3d-title').textContent=renderer3d?.backend==='software'?'LIVE TACTICAL SPACE / 호환 3D':'LIVE TACTICAL SPACE / 3D';
    patch($('view-controls'),visualControls('battle'));
    const slots=game.getSystemSlots?.('player')||[];
    $('slot-count').textContent=slots.length?slots.filter(slot=>slot.unlocked&&!slot.systemId).length+' 빈칸':'기존 함선';
    $('scene3d-hint').textContent=UI.intent==='weapon'?'무기를 선택했습니다. 적 함선의 사각 타일을 눌러 해당 방을 조준하세요.':UI.intent==='mind'?'정신 지배 대상 승무원을 클릭하거나 대상 목록에서 선택하세요.':selectedCrew().length?'아군 '+selectedCrew().length+'명 선택 · 타일 클릭으로 이동/후퇴 · 적 승무원 클릭으로 교전':'승무원을 클릭해 선택 · 빈 베이 클릭으로 시스템 설치 · 드래그는 시점만 회전합니다.';
  }
  function allCrew() {return [...game.state.player.crew,...(game.state.enemy?.crew||[])];}
  function factionOf(crew) {return game.getEffectiveFaction?.(crew)||crew.controlledBy||crew.faction;}
  function tilesOf(side) {
    if(game.getShipTiles)return game.getShipTiles(side);
    const out=[];for(const room of game.state[side]?.rooms||[])for(let y=room.y;y<room.y+room.h;y++)for(let x=room.x;x<room.x+room.w;x++)out.push({id:room.id+':'+x+','+y,roomId:room.id,tileX:x,tileY:y,x:x+.5,y:y+.5,walkable:true});return out;
  }
  function commandTile(side,roomId,tileX,tileY) {
    if(!Number.isInteger(tileX)||!Number.isInteger(tileY))return;
    UI.selectedTile={shipId:side,roomId,tileX,tileY};
    if(UI.intent==='crew'&&selectedCrew().length){
      const crew=selectedCrew().filter(c=>c.shipId===side);
      if(!crew.length){toast('이 함선의 승무원을 선택하거나 먼저 전송하세요.');return;}
      const tiles=tilesOf(side),used=new Set();
      for(const [index,c] of crew.entries()){
        const tile=index===0?tiles.find(t=>t.tileX===tileX&&t.tileY===tileY):tiles.filter(t=>t.roomId===roomId&&!used.has(t.id)&&(!t.occupiedBy||t.occupiedBy===c.id)&&(!t.reservedBy||t.reservedBy===c.id)).sort((a,b)=>Math.abs(a.tileX-tileX)+Math.abs(a.tileY-tileY)-Math.abs(b.tileX-tileX)-Math.abs(b.tileY-tileY))[0];
        if(!tile){toast('선택한 방에 나머지 인원이 이동할 빈 타일이 없습니다.');break;}
        const result=game.moveCrewToTile?game.moveCrewToTile(c.id,tile.tileX,tile.tileY,side):game.moveCrew(c.id,roomId,side);
        if(resultMessage(result))used.add(tile.id);
      }
      render();sound();return;
    }
    commandRoom(side,roomId);
  }
  function attackSelected(targetId) {
    const target=allCrew().find(c=>c.id===targetId&&c.hp>0);if(!target)return;
    UI.selectedEnemyCrewId=targetId;
    const crew=selectedCrew().filter(c=>c.shipId===target.shipId);
    if(!crew.length){toast('대상과 같은 함선에 있는 아군 승무원을 먼저 선택하세요.');render();return;}
    for(const c of crew)resultMessage(game.attackCrew?.(c.id,targetId)||{ok:false,message:'현재 교전 명령을 실행할 수 없습니다.'});
    UI.intent='crew';UI.selectedWeapon=null;UI.beamStart=null;render();sound();
  }
  function commandCrew(id,shiftKey=false) {
    const crew=allCrew().find(c=>c.id===id&&c.hp>0);if(!crew)return;
    if(UI.intent==='mind'){if(resultMessage(game.activateMindControl(id)))clearSelection();render();return;}
    if(factionOf(crew)==='player'){
      if(game.state.player.crew.some(c=>c.id===id)&&!crew.controlledBy)chooseCrew(id,shiftKey);
      else{toast('정신 지배한 인원은 스스로 행동합니다.');render();}
      return;
    }
    if(UI.selectedWeapon||['boarding','recall','hacking'].includes(UI.intent)){commandRoom(crew.shipId,crew.roomId);return;}
    UI.selectedEnemyCrewId=id;
    if(selectedCrew().some(c=>c.shipId===crew.shipId))attackSelected(id);else render();
  }
  function commandPick(pick) {
    if(!$('modal').hidden||!pick)return;
    if(pick.kind==='crew')commandCrew(pick.crewId,pick.shiftKey);
    else if(pick.kind==='door'){if(pick.shipId==='player')order(()=>game.toggleDoor(pick.doorId));else toast('적 함선의 문은 승무원이 접근해 돌파합니다.');}
    else if(pick.kind==='tile')commandTile(pick.shipId,pick.roomId,pick.tileX,pick.tileY);
  }
  function openSystems(slotId=null) {UI.selectedSlotId=slotId;openManualModal('systems');}
  function save(manual=false) {
    try {localStorage.setItem(STORE,game.serialize()); if(manual)toast('현재 항해를 이 브라우저에 저장했습니다.');return true;}
    catch (_) {if(manual)toast('이 브라우저에서는 저장 공간을 사용할 수 없습니다.');UI.autoSaveError=true;return false;}
  }
  function hasSave() {try{return !!localStorage.getItem(STORE);}catch(_){return false;}}
  function loadSaved() {
    let value;try{value=localStorage.getItem(STORE);}catch(_){toast('저장 공간을 읽을 수 없습니다.');return;}
    if(!value){toast('저장된 항해가 없습니다.');return;}
    const ok=game.load(value);
    if(ok){clearSelection();UI.selectedNode=null;UI.modal=null;modalSignature='';game.setPaused(true);render();toast('항해를 불러왔습니다. 전투는 일시정지 상태로 복원됩니다.');}
    else toast('저장 데이터가 손상되었거나 호환되지 않습니다.');
  }
  function openManualModal(type) {
    if(type==='equipment'){UI.swapCargoId=null;UI.discardCargoId=null;}
    returnFocus=document.activeElement;UI.resumeAfterModal=game.state.mode==='combat'&&!game.state.paused;
    game.setPaused(true);UI.modal=type;modalSignature='';render();
  }
  function closeManualModal() {
    UI.modal=null;modalSignature='';if(UI.resumeAfterModal && game.state.mode==='combat')game.setPaused(false);UI.resumeAfterModal=false;render();returnFocus?.focus?.();
  }
  function newRun() {
    game.newRun((Date.now() ^ Math.floor(Math.random()*0xffffffff))>>>0,{loadoutId:game.state.loadoutId||'argo',difficulty:game.state.difficulty||'standard'});
    clearSelection();UI.selectedNode=null;UI.selectedWorld=null;UI.mapView='local';UI.modal=null;UI.importCandidate=null;modalSignature='';render();
  }
  function order(fn) {sound();const r=fn();resultMessage(r);render();}
  function startRun() {UI.modal=null;clearSelection();game.startRun();UI.arsenal=game.state.loadoutId==='atlas'?'drones':'weapons';render();save();toast(game.state.loadoutId==='atlas'?'공격 드론을 전개하고 이온과 레이저를 조준하세요.':game.state.loadoutId==='wraith'?'레이저와 빔 경로를 조준하세요. C로 은폐를 사용할 수 있습니다.':'무기 카드 → 적의 방 선택. 준비되면 ▶ 전투 시작.');}

  function layoutData(ship=game.state.player) {
    return (ship&&game.getLayout?.(ship))||SW.DATA.layouts?.[ship?.layoutId]||SW.DATA.layouts?.legacy||{
      id:'legacy',name:'기존 순항함 도면',description:'이 항해에 저장된 격실과 문 연결을 사용합니다.',width:7,height:4,rooms:ship?.rooms||SW.DATA.rooms,doors:ship?.doors||SW.DATA.doors
    };
  }
  function layoutMetrics(layout,width=600,height=340) {
    const rooms=layout.rooms||[],minX=Math.min(...rooms.map(r=>r.x)),minY=Math.min(...rooms.map(r=>r.y)),maxX=Math.max(...rooms.map(r=>r.x+r.w)),maxY=Math.max(...rooms.map(r=>r.y+r.h));
    const outline=layout.outline?.length?layout.outline:[[minX-.45,minY+.55],[minX+.4,minY-.45],[maxX-.6,minY-.45],[maxX+.65,(minY+maxY)/2],[maxX-.6,maxY+.45],[minX+.4,maxY+.45],[minX-.45,maxY-.55]];
    const left=Math.min(minX,...outline.map(p=>p[0])),right=Math.max(maxX,...outline.map(p=>p[0])),top=Math.min(minY,...outline.map(p=>p[1])),bottom=Math.max(maxY,...outline.map(p=>p[1]));
    const cell=Math.min((width-62)/Math.max(1,right-left),(height-64)/Math.max(1,bottom-top));
    return {layout,outline,cell,ox:width/2-(left+right)*cell/2,oy:height/2-(top+bottom)*cell/2,width,height};
  }
  function layoutMeta(ship) {
    return (ship.rooms?.length||6)+' 격실 · '+(ship.doors||[]).filter(d=>!d.airlock).length+' 통로 · '+(ship.doors||[]).filter(d=>d.airlock).length+' 에어록';
  }
  function blueprintSvg(layout,color,key,doors=layout.doors,labels=true,ship=null) {
    const {ox,oy,cell,outline}=layoutMetrics(layout);
    const label=id=>ship?roomName(id,ship.id):layout.rooms.find(room=>room.id===id)?.name||sysNames[id]||id;
    const icon=id=>icons[ship?game.getRoomSystem?.(ship,id)?.id||id:id]||'◇';
    const point=([x,y])=>(ox+x*cell).toFixed(1)+','+(oy+y*cell).toFixed(1);
    let svg='<svg class="layout-blueprint" viewBox="0 0 600 340" role="img" aria-label="'+esc(layout.name)+' 격실 배치"><defs><linearGradient id="blueprint-'+key+'" x1="0" y1="0" x2="1" y2="1"><stop stop-color="'+color+'" stop-opacity=".18"/><stop offset="1" stop-color="'+color+'" stop-opacity=".025"/></linearGradient></defs><polygon points="'+outline.map(point).join(' ')+'" fill="url(#blueprint-'+key+')" stroke="'+color+'" stroke-opacity=".55" stroke-width="1.4"/>';
    for(const r of layout.rooms){const x=ox+r.x*cell,y=oy+r.y*cell,w=r.w*cell,h=r.h*cell;svg+='<g><title>'+esc(r.name)+'</title><rect x="'+(x+3)+'" y="'+(y+3)+'" width="'+(w-6)+'" height="'+(h-6)+'" rx="3" fill="#10212d" stroke="'+color+'" stroke-opacity=".28"/><text x="'+(x+w/2)+'" y="'+(y+h/2+(labels?11:8))+'" text-anchor="middle" fill="'+color+'" font-size="'+(labels?26:32)+'" opacity=".55">'+icon(r.id)+'</text>'+(labels?'<text x="'+(x+w/2)+'" y="'+(y+20)+'" text-anchor="middle" fill="#c1d6dd" font-size="11">'+esc(label(r.id))+'</text>':'')+'</g>';}
    for(const d of doors||[]){const x=ox+d.x*cell,y=oy+d.y*cell,h=d.orientation==='horizontal',broken=Number.isFinite(d.hp)&&d.hp<=0,c=broken?'#eb8b77':d.open?'#81e5db':d.airlock?'#e0ae7b':'#8ba4af',len=Math.max(6,cell*.16);svg+='<g><title>'+esc((d.airlock?label(d.a)+' 에어록':label(d.a)+' ↔ '+label(d.b))+(broken?' · 파손':d.open?' · 열림':' · 닫힘'))+'</title><rect x="'+(x-(h?len:2.5))+'" y="'+(y-(h?2.5:len))+'" width="'+(h?len*2:5)+'" height="'+(h?5:len*2)+'" rx="1" fill="'+(d.open?'#0c1a24':c)+'" stroke="'+c+'" stroke-width="1.5"/>'+(d.airlock?'<circle cx="'+x+'" cy="'+y+'" r="'+(len+6)+'" fill="none" stroke="'+c+'" opacity=".4" stroke-dasharray="2 3"/>':'')+'</g>';}
    return svg+'</svg>';
  }
  function renderLayout() {
    const side=UI.layoutSide==='enemy'&&game.state.enemy?'enemy':'player',ship=game.state[side],layout=layoutData(ship),color=side==='enemy'?'#efad80':(SW.DATA.loadouts?.[game.state.loadoutId]?.accent||'#81e5db');
    const connections=ship.rooms.map(r=>{const neighbors=ship.doors.filter(d=>!d.airlock&&(d.a===r.id||d.b===r.id)).map(d=>roomName(d.a===r.id?d.b:d.a,side));const airlocks=ship.doors.filter(d=>d.airlock&&d.a===r.id).length;return '<div class="layout-room-row"><span class="layout-room-icon">'+(icons[game.getRoomSystem?.(ship,r.id)?.id||r.id]||'◇')+'</span><strong>'+esc(roomName(r.id,side))+'</strong><span>'+esc(neighbors.join(' · '))+'</span>'+(airlocks?'<b>↗ 에어록 '+airlocks+'</b>':'')+'</div>';}).join('');
    const auxLocations=Object.entries(ship.aux||{}).filter(([,system])=>system.level>0).map(([id,system])=>(sysNames[id]||system.name)+' → '+(ship.rooms.find(room=>room.id===(game.getSystemRoom?.(ship,id)||system.roomId))?.name||system.roomId)).join(' · ');
    return dialog(closeButton+'<span class="eyebrow">VESSEL SCHEMATICS / 07</span><div class="layout-dialog-heading"><div><h2>'+esc(ship.name)+'의 내부 구조</h2><p>'+esc(layout.name)+' · '+esc(layoutMeta(ship))+'</p></div><div class="layout-side-tabs" role="group" aria-label="도면 함선 선택"><button class="secondary-button '+(side==='player'?'active':'')+'" data-layout-side="player" aria-pressed="'+(side==='player')+'">본함</button>'+(game.state.enemy?'<button class="secondary-button '+(side==='enemy'?'active':'')+'" data-layout-side="enemy" aria-pressed="'+(side==='enemy')+'">적 함선</button>':'')+'</div></div><p class="layout-strategy">'+esc(layout.description)+'</p>'+(layout.id==='legacy'?'<p class="layout-legacy-note">이전 항해의 도면을 유지하고 있습니다. 새 항해에서는 선택한 함선의 고유 구조를 사용합니다.</p>':'')+'<div class="layout-inspection"><div class="layout-drawing">'+blueprintSvg(layout,color,'inspect-'+side,ship.doors,true,ship)+'<div class="layout-legend"><span><i class="closed"></i> 닫힌 문</span><span><i class="open"></i> 열린 문</span><span><i class="airlock"></i> 외부 에어록</span></div></div><section class="layout-connections"><h3>실제로 연결된 통로</h3>'+connections+'</section></div><div class="layout-rule-notes"><p><b>이동</b> 승무원은 사각 타일을 상하좌우로 이동하며 실제 문을 통과합니다. 점선은 남은 경로이고, 문 파괴 시간은 거리에 포함하지 않습니다.</p><p><b>격리</b> 닫힌 문은 산소와 화재의 확산을 차단합니다. 에어록은 외부 진공과 연결되므로 아군의 위치를 확인한 뒤 여세요.</p><p><b>설비 위치</b> '+esc(auxLocations||'설치된 보조 설비가 없습니다.')+'<br>손상된 설비는 표시된 실제 방에서 수리합니다. 빈 베이는 함선의 시스템 설치 화면에서 활용하세요.</p></div><div class="dialog-actions"><button class="primary-button" data-action="close-modal">지휘 화면으로 돌아가기</button></div>','layout-dialog wide');
  }
  function hullMarkup(ship) {
    if(!ship) return '<div class="hull-block"><div class="hull-head"><span>CONTACT LOST</span><strong>—</strong></div><div class="hull-segments">'+Array.from({length:20},()=>'<i></i>').join('')+'</div></div><div class="shield-block">SHIELDS<div class="shield-pips"><i class="empty"></i></div></div>';
    const segments = 30;
    const filled = Math.ceil(ship.hull/ship.maxHull*segments);
    return '<div class="hull-block"><div class="hull-head"><span>HULL INTEGRITY</span><strong>'+Math.max(0,round(ship.hull))+' <span>/ '+ship.maxHull+'</span></strong></div><div class="hull-segments '+(ship.hull/ship.maxHull<.35?'low':'')+'">'+Array.from({length:segments},(_,i)=>'<i class="'+(i<filled?'filled':'')+'"></i>').join('')+'</div></div><div class="shield-block">SHIELDS<div class="shield-pips">'+Array.from({length:Math.max(1,ship.maxShield||1)},(_,i)=>'<i class="'+(i<ship.shield?'full':'empty')+'"></i>').join('')+'</div></div>';
  }
  function shipSvg(ship,side) {
    const s=game.state,enemy=side==='enemy',palette=visualStyles[UI.visualStyle],color=enemy?palette.enemy:palette.friendly;
    if(!ship)return '<circle cx="300" cy="160" r="54" fill="none" stroke="#365463" stroke-dasharray="3 8"/><path d="M280 160h40m-20-20v40" stroke="#678895"/><text x="300" y="250" text-anchor="middle" class="empty-ship-label">항로가 열렸습니다</text>';
    const {ox,oy,cell,outline}=layoutMetrics(layoutData(ship));
    const xy=(x,y)=>`${ox+x*cell},${oy+y*cell}`,tiles=tilesOf(side),slots=game.getSystemSlots?.(side)||[];
    const hull=outline.map(([x,y])=>xy(x,y)).join(' '),midX=outline.reduce((n,p)=>n+p[0],0)/outline.length,midY=outline.reduce((n,p)=>n+p[1],0)/outline.length;
    let svg=`<defs><linearGradient id="hull-${side}" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${enemy?palette.enemyFloor:palette.hull}"/><stop offset="1" stop-color="${palette.floor}"/></linearGradient></defs><polygon points="${hull}" fill="url(#hull-${side})" stroke="${color}" stroke-opacity=".55" stroke-width="1.6"/>`;
    if(UI.visualStyle==='lowpoly')for(let i=0;i<outline.length;i++)svg+=`<polygon points="${xy(midX,midY)} ${xy(...outline[i])} ${xy(...outline[(i+1)%outline.length])}" fill="${i%2?color:'#14162b'}" opacity="${i%2?.12:.3}" pointer-events="none"/>`;
    if(UI.visualStyle==='blueprint')svg+=`<polygon points="${outline.map(([x,y])=>xy(midX+(x-midX)*1.045,midY+(y-midY)*1.045)).join(' ')}" fill="none" stroke="${color}" stroke-opacity=".35" stroke-dasharray="2 4" pointer-events="none"/>`;
    if(ship.shield>0){const xs=outline.map(p=>ox+p[0]*cell),ys=outline.map(p=>oy+p[1]*cell),cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2;svg+=`<ellipse cx="${cx}" cy="${cy}" rx="${Math.min(287,(Math.max(...xs)-Math.min(...xs))/2+12)}" ry="${Math.min(164,(Math.max(...ys)-Math.min(...ys))/2+11)}" fill="none" stroke="${color}" opacity=".3" stroke-dasharray="33 8 3 8"/>`;}
    const engineId=game.getSystemRoom?.(ship,'engines')||'engines',engine=ship.rooms.find(r=>r.id===engineId);
    if(engine){const x=ox+(engine.x-.27)*cell,y=oy+(engine.y+engine.h/2)*cell,live=s.mode==='combat'&&!s.paused,flame=(live?.5+Math.sin(s.time*20)*.08:.28)*cell;svg+=`<path d="M${x} ${y-10}L${x-flame} ${y}L${x} ${y+10}Z" fill="${color}" opacity="${live?.7:.3}"/><rect x="${x-1}" y="${y-12}" width="7" height="24" fill="${palette.hull}" stroke="${color}" stroke-opacity=".6"/>`;}
    for(const room of ship.rooms){
      const system=game.getRoomSystem?game.getRoomSystem(ship,room.id):ship.systems[room.id],slot=slots.find(item=>item.roomId===room.id),sysId=system?.id||slot?.systemId;
      const empty=!!slot&&!slot.systemId,locked=!!slot&&!slot.unlocked,name=roomName(room.id,side),x=ox+room.x*cell,y=oy+room.y*cell,w=room.w*cell,h=room.h*cell;
      const target=s.player.weapons.some(weapon=>enemy&&weapon.enabled&&(weapon.target===room.id||weapon.targetRooms?.includes(room.id)));
      const hacking=(enemy?s.player:s.enemy)?.hacking,hacked=hacking?.targetRoomId===room.id&&['attached','active','cooldown'].includes(hacking.phase);
      const danger=room.fire>0||room.breach||room.oxygen<25||system?.damage;
      const fill=room.fire>0?'#503024':room.oxygen<25?'#372736':system?.ionTimer>0?'#203e5a':enemy?palette.enemyFloor:palette.floor;
      const detail=empty?(locked?'마운트 확장 '+slot.expansionCost:'시스템 설치 가능'):system?.damage?'손상 '+system.damage:system?.ionTimer>0?'이온 '+system.ionTimer.toFixed(1)+'초':'산소 '+round(room.oxygen)+'%';
      svg+=`<g class="room-group ${empty?'empty-bay ':''}${locked?'locked-bay':''}" data-room="${room.id}" data-side="${side}"><title>${esc(name+' · '+detail)}</title><g class="room-art" pointer-events="none"><rect class="room-fill" x="${x+2}" y="${y+2}" width="${w-4}" height="${h-4}" rx="${UI.visualStyle==='stellar'?3:0}" fill="${fill}" stroke="${danger?'#da987f':empty?palette.empty:color}" stroke-opacity="${empty?.7:.42}" ${empty?'stroke-dasharray="4 3"':''}/><text class="room-name" x="${x+w/2}" y="${y+14}" text-anchor="middle">${esc(name)}</text><text x="${x+w/2}" y="${y+h/2+6}" text-anchor="middle" fill="${color}" font-family="monospace" font-size="${Math.min(25,cell*.7)}" opacity=".34">${empty?locked?'⊡':'+':icons[sysId]||icons[room.id]||'◇'}</text><text class="room-level" x="${x+7}" y="${y+h-7}">${esc(empty?locked?'확장 '+slot.expansionCost:'설치 가능':system?.damage?'DMG '+system.damage:system?.ionTimer>0?'ION '+system.ionTimer.toFixed(1)+'s':sysId==='bridge'?'NAV':sysId==='battery'?'LV '+system.level+' · 배터리':system?(system.power||0)+' / '+system.level:'빈 격실')}</text>`;
      if(room.oxygen<50)svg+=`<text x="${x+w-7}" y="${y+h-7}" text-anchor="end" fill="#e99bb0" font-size="8">O₂ ${round(room.oxygen)}</text>`;
      if(room.fire>0)svg+=`<path d="M${x+w-15} ${y+29}q-9-7 0-17q0 7 4 9q5-5 3-10q13 16-1 20Z" fill="#f7ac72" opacity="${.75+Math.sin(s.time*9)*.15}"/>`;
      if(room.breach)svg+=`<path d="M${x+12} ${y+27}l7-6 -2 8 7 3 -7 4 2 8 -8-4 -5 4 1-10 -5-4Z" fill="#08121d" stroke="#d69bac"/>`;
      if(hacked)svg+=`<rect x="${x+4}" y="${y+4}" width="${w-8}" height="${h-8}" fill="${hacking.phase==='active'?'#b383df22':'none'}" stroke="#bd9ee9" stroke-dasharray="4 3"/><text x="${x+w-10}" y="${y+16}" fill="#d9bbff" text-anchor="end">⌁</text>`;
      if(target)svg+=`<rect x="${x+4}" y="${y+4}" width="${w-8}" height="${h-8}" fill="none" stroke="#ffbc82" stroke-width="1.6" stroke-dasharray="11 7"/>`;
      svg+='</g>';
      for(const tile of tiles.filter(t=>t.roomId===room.id)){
        const chosen=UI.selectedTile?.shipId===side&&UI.selectedTile.tileX===tile.tileX&&UI.selectedTile.tileY===tile.tileY,reserved=UI.selectedCrewIds.includes(tile.reservedBy);
        const label=(enemy?'적 함선 ':'본함 ')+name+' 타일 '+(tile.tileX+1)+','+(tile.tileY+1)+(tile.occupiedBy?' · 승무원 위치':'')+(empty?' · '+(locked?'마운트 확장 필요':'시스템 설치 가능'):'');
        svg+=`<rect class="floor-tile ${chosen?'chosen ':''}${reserved?'reserved ':''}${tile.occupiedBy?'occupied':''}" data-tile="${esc(tile.id)}" data-side="${side}" data-room-id="${room.id}" data-tile-x="${tile.tileX}" data-tile-y="${tile.tileY}" data-focus="tile-${side}-${tile.tileX}-${tile.tileY}" role="button" tabindex="0" aria-label="${esc(label)}" x="${ox+tile.tileX*cell+1.4}" y="${oy+tile.tileY*cell+1.4}" width="${cell-2.8}" height="${cell-2.8}" rx="${UI.visualStyle==='stellar'?2:0}"/>`;
      }
      svg+='</g>';
    }
    for(const d of ship.doors||[]){
      const x=ox+d.x*cell,y=oy+d.y*cell,h=d.orientation==='horizontal',broken=d.hp<=0,lock=game.getDoorLockOwner?.(ship,d.id),dc=lock?'#d4b1ff':broken?'#e9907c':d.open?color:d.airlock?'#e4bc88':'#92b0bf';
      const label=(d.airlock?roomName(d.a,side)+' 에어록':roomName(d.a,side)+' ↔ '+roomName(d.b,side))+' · '+(lock?'해킹 봉쇄':broken?'파손':d.open?'열림':'닫힘');
      svg+=`<g class="door ${d.open?'open':''}" ${!enemy?`data-door="${d.id}" data-focus="door-${d.id}" role="button" tabindex="0" aria-label="${esc(label)}" aria-pressed="${d.open}"`:'pointer-events="none"'}><title>${esc(label)}</title>${!enemy?`<rect x="${x-(h?10:7)}" y="${y-(h?7:10)}" width="${h?20:14}" height="${h?14:20}" fill="transparent"/>`:''}<rect x="${x-(h?7:2.5)}" y="${y-(h?2.5:7)}" width="${h?14:5}" height="${h?5:14}" rx="1" fill="${d.open?'#0b1721':dc}" stroke="${dc}" stroke-width="1.3"/>${d.airlock?`<text x="${x+(h?13:-11)}" y="${y+3}" fill="${dc}" text-anchor="middle" font-size="8">↗</text>`:''}</g>`;
    }
    const crew=physicalCrew(side),ownIds=new Set(s.player.crew.map(c=>c.id));
    for(const c of crew){
      const friendly=factionOf(c)==='player',owned=ownIds.has(c.id),selected=UI.selectedCrewIds.includes(c.id)&&owned;
      const cx=ox+c.x*cell,cy=oy+c.y*cell,ccolor=c.controlledBy?'#dcb3ff':!friendly?palette.enemy:c.species==='engi'?'#decf9f':c.species==='rock'?'#cbb2f0':c.species==='mantis'?'#c2e59a':palette.friendly;
      if(selected){const route=game.getCrewRoute?.(c.id),points=route?.points||[];if(points.length>1)svg+=`<path class="crew-route-path" d="${points.map((p,i)=>(i?'L':'M')+(ox+p.x*cell).toFixed(1)+' '+(oy+p.y*cell).toFixed(1)).join(' ')}" stroke="${palette.friendly}" stroke-width="1.7" stroke-dasharray="3 4" fill="none" pointer-events="none"/>`;}
      if(c.attackFlash>0){const target=crew.find(t=>t.id===c.attackTargetId);svg+=`<g class="melee-flash" pointer-events="none"><circle cx="${cx}" cy="${cy}" r="16" fill="none" stroke="#fff1b8" stroke-width="2"/>${target?`<path d="M${cx} ${cy}L${ox+target.x*cell} ${oy+target.y*cell}" stroke="#ffe9a8" stroke-width="2.5"/>`:''}</g>`;}
      svg+=`<g class="crew-sprite ${friendly?'friendly':'hostile'}" ${UI.intent==='mind'?`data-mind-target="${c.id}" data-focus="mind-${c.id}"`:`data-crew-pick="${c.id}" data-focus="sprite-${c.id}"`} role="button" tabindex="0" aria-label="${esc((friendly?'아군 ':'적 ')+c.name+' · '+round(c.hp)+' HP · '+roomName(c.roomId,side)+(friendly?' 선택':' 교전 대상'))}"><title>${esc(c.name+' · '+round(c.hp)+' / '+c.maxHp+' HP · '+(c.task||roomName(c.roomId,side)))}</title><circle cx="${cx}" cy="${cy}" r="11" fill="transparent"/>`;
      if(selected)svg+=`<circle cx="${cx}" cy="${cy}" r="13" fill="none" stroke="${palette.friendly}" stroke-dasharray="3 3" stroke-width="1.6"/>`;
      if(c.controlledBy)svg+=`<circle cx="${cx}" cy="${cy}" r="16" fill="none" stroke="#dcb3ff" stroke-dasharray="2 3"/>`;
      if(UI.selectedEnemyCrewId===c.id)svg+=`<path d="M${cx-15} ${cy-8}v-7h7M${cx+8} ${cy-15}h7v7M${cx-15} ${cy+8}v7h7M${cx+8} ${cy+15}h7v-7" stroke="${palette.enemy}" fill="none" stroke-width="1.7"/>`;
      svg+=UI.visualStyle==='lowpoly'?`<polygon points="${cx},${cy-10} ${cx+5},${cy-4} ${cx},${cy} ${cx-5},${cy-4}" fill="${ccolor}"/><path d="M${cx} ${cy}l8 10h-16z" fill="${ccolor}"/>`:UI.visualStyle==='blueprint'?`<circle cx="${cx}" cy="${cy-5}" r="4" fill="none" stroke="${ccolor}" stroke-width="1.6"/><path d="M${cx-5} ${cy+1}h10v9h-10zM${cx-9} ${cy+4}h18" fill="none" stroke="${ccolor}" stroke-width="1.5"/>`:`<circle cx="${cx}" cy="${cy-4}" r="4.2" fill="${ccolor}" stroke="#0b1c24" stroke-width="1.3"/><path d="M${cx-5} ${cy+1}h10v8h-3v-4h-4v4h-3Z" fill="${ccolor}" stroke="#0b1c24" stroke-width=".7"/>`;
      svg+=`<rect x="${cx-8}" y="${cy+13}" width="16" height="2.4" fill="#14202a"/><rect x="${cx-8}" y="${cy+13}" width="${16*pct(c.hp,c.maxHp)/100}" height="2.4" fill="${ccolor}"/></g>`;
    }
    if(enemy){const beam=s.player.weapons.find(w=>w.id===UI.selectedWeapon&&w.type==='beam');if(beam){const a=ship.rooms.find(r=>r.id===(UI.beamStart||beam.beamFrom)),b=ship.rooms.find(r=>r.id===beam.beamTo);if(a){const ax=ox+(a.x+a.w/2)*cell,ay=oy+(a.y+a.h/2)*cell;svg+=`<circle cx="${ax}" cy="${ay}" r="10" fill="none" stroke="#ffe4aa" stroke-dasharray="2 3" pointer-events="none"/>`;if(b&&!UI.beamStart){let bx=ox+(b.x+b.w/2)*cell,by=oy+(b.y+b.h/2)*cell;const length=Math.hypot(bx-ax,by-ay),maximum=(beam.beamLength||4)*cell;if(length>maximum){bx=ax+(bx-ax)*maximum/length;by=ay+(by-ay)*maximum/length;}svg+=`<path d="M${ax} ${ay}L${bx} ${by}" fill="none" stroke="#ffe4aa" stroke-width="2.5" stroke-dasharray="5 4" pointer-events="none"/>`;}}}}
    for(const shot of s.projectiles||[]){if(shot.weaponType!=='beam'||shot.from===side||!shot.beamStart||!shot.beamEnd)continue;svg+=`<path d="M${ox+shot.beamStart.x*cell} ${oy+shot.beamStart.y*cell}L${ox+shot.beamEnd.x*cell} ${oy+shot.beamEnd.y*cell}" stroke="#fff0bb" stroke-width="4" stroke-linecap="round" opacity="${.35+.55*(shot.progress||0)}" pointer-events="none"/>`;}
    for(const ef of s.effects||[]){if(ef.ship!==side)continue;const room=ship.rooms.find(r=>r.id===ef.roomId);if(!room)continue;const cx=ox+(room.x+room.w/2)*cell,cy=oy+(room.y+room.h/2)*cell;svg+=`<circle cx="${cx}" cy="${cy}" r="${10+(1-Math.min(1,ef.ttl))*24}" fill="none" stroke="${ef.type==='hit'||ef.type==='fire'?'#f4b081':'#98e0e2'}" opacity="${Math.min(.9,ef.ttl)}" stroke-width="1.8" pointer-events="none"/>`;if(ef.text)svg+=`<text x="${cx}" y="${cy-22}" text-anchor="middle" fill="#ffd0a1" font-size="11" pointer-events="none">${esc(ef.text)}</text>`;}
    if(s.paused&&s.mode==='combat')svg+='<text x="26" y="24" class="paused-corner">Ⅱ SIMULATION PAUSED</text>';
    return svg;
  }
  function roomName(id,side='player') {
    const ship=typeof side==='string'?game.state[side]:side,room=ship?.rooms?.find(r=>r.id===id),system=ship&&game.getRoomSystem?.(ship,id);
    return sysNames[system?.id]||system?.name||room?.name||sysNames[id]||id||'대기';
  }
  function renderCrew() {
    const p=game.state.player,alive=p.crew.filter(c=>c.hp>0),selected=selectedCrew();
    $('crew-count').textContent=alive.length+' / 8';
    patch($('crew-list'),p.crew.map(c=>`<button class="crew-card ${UI.selectedCrewIds.includes(c.id)?'selected ':''}${c.hp<=0?'dead':''}" data-crew-select="${c.id}" data-focus="crew-${c.id}" aria-pressed="${UI.selectedCrewIds.includes(c.id)}" ${c.hp<=0||c.controlledBy?'disabled':''}><span class="crew-avatar ${c.species}">${c.species==='engi'?'⊞':c.species==='rock'?'◆':c.species==='mantis'?'⋈':'•'}</span><span class="crew-main"><span class="crew-name">${esc(c.name)}<small>${esc(speciesNames[c.species]||c.species)}</small>${crewRankBadge(c)}${c.shipId==='enemy'?'<b class="aboard-badge">적선</b>':''}</span><span class="crew-task">${esc(c.hp<=0?'전사':c.controlledBy?'정신 지배 · 자동 행동':c.task||(c.targetRoomId?'이동 → '+roomName(c.targetRoomId,c.shipId):roomName(c.roomId,c.shipId)+' 근무'))}</span></span><span class="crew-health">${Math.max(0,round(c.hp))}<span class="thin-track"><i style="width:${pct(c.hp,c.maxHp)}%"></i></span></span></button>`).join(''));
    $('multi-btn').setAttribute('aria-pressed',String(UI.multiSelect));$('multi-btn').classList.toggle('active',UI.multiSelect);
    $('crew-instruction').textContent=selected.length?selected.map(c=>c.name).join(', ')+' 선택 · 같은 함선의 타일을 눌러 이동 / 적 클릭으로 교전':'승무원 → 타일 선택 · Shift 또는 다중 선택으로 함께 지휘';
    const routes=selected.map(c=>({crew:c,route:game.getCrewRoute?.(c.id)})).filter(x=>x.route?.points?.length>1);
    $('crew-route-info').hidden=!routes.length;patch($('crew-route-info'),routes.map(({crew,route})=>'<div><strong>'+esc(crew.name)+'</strong><span>'+esc((route.roomIds||[]).map(id=>roomName(id,crew.shipId)).join(' → '))+'</span><b>'+Number(route.distance||0).toFixed(1)+'칸 남음</b></div>').join(''));
    const power=p.aux?.teleporter?.power||0,cooldown=p.teleportCooldown||0,capacity=p.teleportCapacity||2;
    const home=selected.filter(c=>(c.shipId||'player')==='player'),away=alive.filter(c=>c.shipId==='enemy');
    const staging=p.teleportRoomId||'medbay',staged=home.filter(c=>c.roomId===staging&&!c.targetRoomId);
    const canStage=home.length>0&&home.length<=capacity&&home.length===selected.length;
    const teleportChecks=(game.state.enemy?.rooms||[]).map(r=>game.getTeleportStatus?.('send',home.map(c=>c.id),r.id)).filter(Boolean);
    const status=teleportChecks.find(check=>check.ok)||teleportChecks[0];
    const ready=power>0&&cooldown<=0&&game.state.mode==='combat';
    $('teleport-status').textContent=cooldown>0?'전송 재충전 '+cooldown.toFixed(1)+'초 · 적선 '+away.length+'명':!p.aux?.teleporter?.level?'빈 베이에 텔레포터를 설치하세요.':power<=0?'텔레포터에 전력 1을 배분하세요.':home.length&&staged.length<home.length?'집결 명령 → '+roomName(staging)+'에 도착한 뒤 전송하세요.':status?.message||'송신실 '+roomName(staging)+' · 한 번에 '+capacity+'명';
    $('stage-btn').disabled=!canStage||!p.aux?.teleporter?.level;
    $('stage-btn').textContent='송신실 집결 ('+staged.length+'/'+capacity+')';
    $('board-btn').disabled=!ready||!canStage||staged.length!==home.length||status?.ok===false;
    $('board-btn').classList.toggle('active',UI.intent==='boarding');$('board-btn').textContent=UI.intent==='boarding'?'적의 방 선택…':'적선 전송 ↗';
    $('recall-btn').disabled=!ready||!away.length;
    $('recall-btn').textContent=UI.intent==='recall'?'귀환할 적 방 선택…':'↙ 귀환 ('+away.length+')';

  }
  function renderCrewCombat() {
    const hostiles=allCrew().filter(c=>c.hp>0&&factionOf(c)!=='player');
    let target=hostiles.find(c=>c.id===UI.selectedEnemyCrewId);
    if(UI.selectedEnemyCrewId&&!target)UI.selectedEnemyCrewId=null;
    const selected=selectedCrew(),eligible=target?selected.filter(c=>c.shipId===target.shipId):[];
    const actions=selected.map(c=>({crew:c,status:game.getCrewCombatStatus?.(c.id)})).filter(item=>item.status?.targetId);
    const states={idle:'대기',pursuing:'접근 중',moving:'접근 중',chasing:'추격 중',attacking:'근접 교전',cooldown:'다음 타격 준비',blocked:'경로 차단',in_range:'타격 거리',engaging:'교전 중'};
    const list=hostiles.map(c=>`<button class="hostile-crew-button ${UI.selectedEnemyCrewId===c.id?'selected':''}" data-hostile-crew="${c.id}" data-focus="hostile-${c.id}" aria-pressed="${UI.selectedEnemyCrewId===c.id}"><span class="hostile-marker" aria-hidden="true">⌖</span><span><strong>${esc(c.name)}</strong><small>${c.shipId==='player'?'본함 침입':'적 함선'} · ${esc(roomName(c.roomId,c.shipId))}${game.state.player.crew.some(owned=>owned.id===c.id)?' · 지배된 아군':''}</small></span><b>${round(c.hp)}<small> / ${c.maxHp}</small></b></button>`).join('');
    patch($('crew-combat-panel'),`<div class="combat-console-heading"><div><span class="eyebrow">CREW ENGAGEMENT</span><h3>선내 교전</h3></div><p>${selected.length?selected.map(c=>esc(c.name)).join(' · ')+' 선택 · 적 클릭으로 접근·공격':'아군 선택 → 같은 함선의 적 승무원 클릭'}</p></div>${hostiles.length?'<div class="hostile-crew-list">'+list+'</div>':'<p class="combat-empty">교전할 적 승무원이 없습니다. 승무원을 선택하고 사각 타일을 눌러 배치하세요.</p>'}${target?`<div class="combat-target-detail"><span><strong>목표 · ${esc(target.name)}</strong><small>${target.shipId==='player'?'본함':'적 함선'} · ${esc(roomName(target.roomId,target.shipId))} · ${round(target.hp)} / ${target.maxHp} HP</small></span><div class="target-hp"><i style="width:${pct(target.hp,target.maxHp)}%"></i></div><button class="secondary-button attack-button" data-attack-crew="${target.id}" data-focus="attack-${target.id}" ${eligible.length?'':'disabled'}>${eligible.length?eligible.length+'명 교전 지시':'같은 함선의 아군 선택'}</button></div>`:''}${actions.length?'<div class="combat-orders">'+actions.map(({crew,status})=>`<span><strong>${esc(crew.name)}</strong> → ${esc(status.targetName||'표적')} · ${esc(states[status.state]||'접근·교전')} · 다음 타격 ${Number(status.cooldown||0).toFixed(1)}초</span>`).join('')+'</div>':''}<p class="microcopy combat-retreat-hint">다른 타일로 이동하면 지정 공격을 취소하고 후퇴합니다. 닫힌 문과 벽 너머로는 타격하지 않습니다.</p>`);
  }
  function systemControlMarkup(systemId) {
    const p=game.state.player,system=p.aux?.[systemId]||p.systems[systemId];if(!system)return '';
    const status=game.getSystemUpgradeStatus?.(systemId)||{ok:false,message:'이 설비는 상점에서 강화합니다.'},available=Math.max(0,system.level-system.damage-(system.ionStacks||0)),spare=game.getReactorCapacity(p)-game.getPowerUsed();
    const location=game.getSystemRoom?.(p,systemId)||system.roomId;
    return `<div class="installed-system-heading"><span class="installation-icon">${icons[systemId]||'◇'}</span><div><span class="eyebrow">INSTALLED SYSTEM</span><h3>${esc(sysNames[systemId]||systemId)}</h3><p>${esc(p.rooms.find(room=>room.id===location)?.name||roomName(location))} · 단계 ${system.level}${system.damage?' · 손상 '+system.damage:''}</p></div></div><div class="install-power-summary"><span>현재 전력 <strong>${system.power} / ${available}</strong></span><span>예비 전력 <strong>${spare}</strong></span>${systemId==='battery'?'<small>배터리는 별도 전력 배분 없이 가동합니다.</small>':`<div><button class="adjust-button" data-power="${systemId}" data-delta="-1" data-focus="install-minus-${systemId}" aria-label="${esc(sysNames[systemId])} 전력 감소" ${system.power<=0?'disabled':''}>−</button><button class="adjust-button" data-power="${systemId}" data-delta="1" data-focus="install-plus-${systemId}" aria-label="${esc(sysNames[systemId])} 전력 연결" ${system.power>=available||spare<=0?'disabled':''}>＋ 전력 연결</button></div>`}</div><div class="system-upgrade-row"><div><strong>설비 단계 높이기</strong><p>${esc(status.message||'다음 단계로 강화합니다.')}</p></div><button class="primary-button" data-system-upgrade="${systemId}" data-focus="upgrade-${systemId}" ${status.ok?'':'disabled'}>${Number.isFinite(status.cost)?status.cost+' 스크랩 · ':''}강화</button></div><p class="microcopy">이 방의 손상은 이 설비에 적용됩니다. 수리할 승무원을 실제 방으로 보내세요.</p>`;
  }
  function renderSystemInstallation() {
    const s=game.state,p=s.player,slots=game.getSystemSlots?.('player')||[],canRefit=['briefing','map','shop','reward'].includes(s.mode);
    const selected=slots.find(slot=>slot.id===UI.selectedSlotId)||slots.find(slot=>slot.unlocked&&!slot.systemId)||slots[0];
    if(selected)UI.selectedSlotId=selected.id;
    const summary=`<div class="installation-heading"><div><span class="eyebrow">VESSEL SYSTEM FITTING / 07</span><h2>빈 격실을 다음 전력으로.</h2><p>방을 고르고 시스템을 설치하세요. 설치 후 전력을 연결해야 작동합니다.</p></div><div class="fitting-scrap">▧ <strong>${s.resources.scrap}</strong><span>스크랩</span></div></div>`;
    if(!slots.length){const installed=Object.entries(p.aux||{}).filter(([,sys])=>sys.level>0);return dialog(closeButton+summary+'<p class="installation-legacy">이전 항해의 함선 구조를 보존하고 있습니다. 새 항해의 함선에는 별도 설치 베이가 제공됩니다. 현재 설치된 설비는 계속 강화할 수 있습니다.</p>'+(!canRefit?'<p class="fitting-mode-note">교전·사건 중에는 설치와 강화를 할 수 없습니다.</p>':'')+'<div class="legacy-upgrades">'+installed.map(([id])=>'<section class="legacy-upgrade-card">'+systemControlMarkup(id)+'</section>').join('')+'</div><div class="dialog-actions"><button class="primary-button" data-action="close-modal">함선으로 돌아가기</button></div>','installation-dialog wide');}
    const room=p.rooms.find(room=>room.id===selected?.roomId);
    let detail='';
    if(selected&&!selected.unlocked){const status=game.getSlotExpansionStatus?.(selected.id)||{ok:false,message:'이 마운트를 확장할 수 없습니다.',cost:selected.expansionCost};detail=`<div class="empty-system-heading"><span class="installation-icon">⊡</span><h3>추가 마운트 확장</h3><p>${esc(room?.name||selected.roomId)} · ${room?.w||2}×${room?.h||2} 타일</p></div><p class="installation-copy">격실은 이미 이동할 수 있습니다. 마운트를 확장하면 이 방에 보조 시스템 하나를 설치할 수 있습니다.</p><div class="slot-expansion-offer"><strong>${status.cost??selected.expansionCost} 스크랩</strong><p>${esc(status.message||'확장 후 시스템을 선택하세요.')}</p><button class="primary-button" data-slot-expand="${selected.id}" data-focus="expand-${selected.id}" ${status.ok?'':'disabled'}>이 마운트 확장</button></div>`;}
    else if(selected?.systemId)detail=systemControlMarkup(selected.systemId);
    else if(selected){const offers=game.getInstallableSystems?.(selected.id)||[];detail=`<div class="empty-system-heading"><span class="installation-icon">＋</span><h3>${esc(room?.name||selected.roomId)} · 설치 가능</h3><p>${room?.w||2}×${room?.h||2} 타일 · 좌표 ${(room?.x||0)+1}, ${(room?.y||0)+1} · 신규 설비 단계1 / 전력0</p></div><div class="system-install-catalog">${offers.map(offer=>{const status=game.getSystemInstallStatus?.(selected.id,offer.id)||{ok:offer.ok,message:offer.reason,cost:offer.cost};return `<article class="install-offer ${status.ok?'available':'unavailable'}"><header><span>${icons[offer.id]||'◇'}</span><h4>${esc(offer.name||sysNames[offer.id]||offer.id)}</h4><b>${status.cost??offer.cost} ▧</b></header><p>${esc(status.message||offer.reason||'이 방에 설치할 수 있습니다.')}</p><button class="secondary-button" data-system-install="${offer.id}" data-slot-id="${selected.id}" data-focus="install-${selected.id}-${offer.id}" ${status.ok?'':'disabled'}>${status.ok?'설치 · '+(status.cost??offer.cost)+' 스크랩':'설치 불가'}</button></article>`;}).join('')}</div>`;}
    const list=slots.map(slot=>`<button class="system-slot-card ${selected?.id===slot.id?'selected ':''}${slot.systemId?'occupied':slot.unlocked?'available':'locked'}" data-slot-select="${slot.id}" data-focus="slot-${slot.id}" aria-pressed="${selected?.id===slot.id}"><span class="slot-symbol">${slot.systemId?icons[slot.systemId]||'◇':slot.unlocked?'+':'⊡'}</span><span><strong>${esc(p.rooms.find(room=>room.id===slot.roomId)?.name||slot.roomId)}</strong><small>${slot.systemId?esc(sysNames[slot.systemId]||slot.systemId):slot.unlocked?'시스템 설치 가능':'확장 '+slot.expansionCost+' 스크랩'}</small></span><b>${slot.systemId?'설치됨':slot.unlocked?'빈칸':'확장'}</b></button>`).join('');
    return dialog(closeButton+summary+(!canRefit?'<p class="fitting-mode-note">현재는 설비 열람만 가능합니다. 교전이나 사건을 마친 뒤 설치·확장·강화하세요.</p>':'')+`<div class="installation-layout"><aside class="system-slot-list"><h3>실제 설치 베이 <span>${slots.filter(slot=>slot.unlocked).length} / ${slots.length}</span></h3>${list}</aside><section class="system-install-detail">${detail}</section></div><div class="dialog-actions"><button class="secondary-button" data-action="open-equipment">장비·화물</button><button class="primary-button" data-action="close-modal">함선으로 돌아가기</button></div>`,'installation-dialog wide');
  }
  function renderSystems() {
    const p=game.state.player,used=game.getPowerUsed(),capacity=game.getReactorCapacity?game.getReactorCapacity(p):p.reactor;
    $('reactor-number').textContent=used+' / '+capacity;$('reactor-number').title='정격 반응로 '+p.reactor;
    $('power-status').textContent='예비 전력 '+Math.max(0,capacity-used)+(p.battery?.remaining>0?' · 배터리 '+Math.ceil(p.battery.remaining)+'초 남음':capacity<p.reactor?' · 정격 '+p.reactor+' / 폭풍 제한':p.venting?' · 환기 중':'');
    patch($('systems-list'),['shields','engines','weapons','oxygen','medbay','drones','teleporter','cloaking','hacking','mind'].filter(id=>p.systems[id]||(p.aux?.[id]?.level||0)>0).map(id=>{
      const sys=p.systems[id]||p.aux[id],usable=Math.max(0,sys.level-sys.damage-(sys.ionStacks||0));
      return `<div class="system-row ${p.aux?.[id]?'aux-row':''} ${sys.ionTimer>0?'ion-locked':''}"><span class="system-icon" aria-hidden="true">${icons[id]}</span><span class="system-name">${sysNames[id]}${p.aux?.[id]?'<small>'+esc(p.rooms.find(room=>room.id===(game.getSystemRoom?.(p,id)||sys.roomId))?.name||roomName(sys.roomId))+'</small>':''}${sys.ionTimer>0?'<small>'+sys.ionTimer.toFixed(1)+'s 잠금</small>':''}</span><div class="system-blocks" title="전력 ${sys.power}, 최대 ${sys.level}, 손상 ${sys.damage}, 이온 잠금 ${sys.ionStacks||0}">${sys.level?Array.from({length:sys.level},(_,i)=>'<span class="power-block '+(i>=sys.level-sys.damage?'damaged':i>=usable?'ion':i<sys.power?'on':'')+'"></span>').join(''):'<span class="system-uninstalled">빈 베이에 설치</span>'}</div><span class="system-detail">${sys.power}/${usable}</span><button class="adjust-button" data-power="${id}" data-delta="-1" data-focus="minus-${id}" aria-label="${sysNames[id]} 전력 감소" ${sys.power<=0?'disabled':''}>−</button><button class="adjust-button" data-power="${id}" data-delta="1" data-focus="plus-${id}" aria-label="${sysNames[id]} 전력 증가" ${sys.power>=usable||used>=capacity?'disabled':''}>+</button></div>`;
    }).join(''));
  }

  function renderWeapons(){
    const p=game.state.player,droneTab=UI.arsenal==='drones';
    $('fire-resume-btn').hidden=game.state.mode!=='combat'||!game.state.paused;
    $('weapons-list').hidden=droneTab;$('drones-list').hidden=!droneTab;
    $('weapons-tab').classList.toggle('active',!droneTab);$('weapons-tab').setAttribute('aria-pressed',String(!droneTab));
    $('drones-tab').classList.toggle('active',droneTab);$('drones-tab').setAttribute('aria-pressed',String(droneTab));
    $('drone-active-count').textContent=(p.drones||[]).filter(d=>d.enabled).length;
    const statusOf=w=>game.getWeaponFireStatus?.(w.id)||{ready:w.charge>=w.cooldown,canQueue:w.enabled&&w.powered&&!!w.target,queued:w.manualQueued,message:'조준 후 전투를 재개하세요.'};
    $('volley-btn').disabled=game.state.mode!=='combat'||!p.weapons.some(w=>statusOf(w).canQueue);
    patch($('weapons-list'),p.weapons.map((w,i)=>{
      const charge=pct(w.charge,w.cooldown),powered=w.powered!==false&&w.enabled,manual=w.fireMode==='manual',status=statusOf(w),ready=status.ready;
      const timer=!powered?'전력 없음':status.queued?'발사 예약됨':ready?'READY':Math.max(0,w.cooldown-w.charge).toFixed(1)+'s';
      const fireLabel=status.queued?'예약 취소':ready?(game.state.paused?'재개 시 발사':'발사 ↗'):'발사 예약';
      return `<article class="weapon-card ${UI.selectedWeapon===w.id?'selected ':''}${!powered?'off ':''}${ready?'ready ':''}${status.queued?'queued':''}"><div class="weapon-head"><button class="weapon-select weapon-name" data-weapon-select="${w.id}" data-focus="weapon-${w.id}" aria-label="${esc(w.name)} 선택" aria-pressed="${UI.selectedWeapon===w.id}"><kbd>${i+1}</kbd>${esc(w.name)}</button><button class="weapon-power ${!w.enabled?'off':''}" data-weapon-toggle="${w.id}" data-focus="toggle-${w.id}" aria-label="${esc(w.name)} 전력 ${w.enabled?'끄기':'켜기'}">${w.enabled?'ON':'OFF'} · ${w.power}</button></div><div class="weapon-details"><span>${w.type==='ion'?'이온 잠금 · '+(w.ionDuration||5)+'s':(w.type==='missile'?'실드 관통':w.type==='beam'?'빔 / 회피 불가':w.shots+'연발')+' · '+w.damage+' DMG'}</span><span>${timer}</span></div><div class="weapon-charge"><i style="width:${charge}%"></i></div><button class="weapon-target-select weapon-target ${!w.target?'none':''}" data-weapon-select="${w.id}" data-focus="target-${w.id}" aria-label="${esc(w.name)} 조준 변경">${w.target?'⌖ '+esc(roomName(w.target,'enemy'))+(w.type==='beam'?' · '+(w.targetRooms?.length||1)+'개 방':''):UI.selectedWeapon===w.id?'⌖ 적 함선의 방을 선택하세요':'⌖ 눌러서 표적 지정'}</button><div class="weapon-actions"><button class="fire-mode ${manual?'manual':''}" data-weapon-auto="${w.id}" data-focus="mode-${w.id}" aria-label="${esc(w.name)} ${manual?'자동':'수동'} 사격으로 전환">${manual?'수동 사격':'자동 사격'} ⇄</button><button class="fire-button" ${status.queued?'data-weapon-cancel':'data-weapon-fire'}="${w.id}" data-focus="fire-${w.id}" aria-label="${esc(w.name)} ${status.queued?'예약 취소':'한 번 발사'}" ${!status.queued&&!status.canQueue?'disabled':''}>${fireLabel}</button></div><p class="weapon-readiness ${status.canQueue?'valid':'blocked'}" data-fire-status="${w.id}">${esc(status.message)}</p></article>`;
    }).join(''));
    patch($('drones-list'),(p.drones||[]).map(d=>{
      const supported=(p.aux?.drones?.power||0)>=d.power,powered=d.enabled&&d.powered!==false&&supported;
      return `<div class="drone-card ${powered?'active':''}"><div class="weapon-head"><span class="weapon-name"><span class="drone-glyph">${d.type==='defense'?'⬡':'⌘'}</span>${esc(d.name)}</span><span class="microcopy">전력 ${d.power}</span></div><p>${d.type==='defense'?'접근하는 미사일을 요격합니다.':'적의 방을 자동 조준해 레이저로 공격합니다.'}</p><div class="drone-status"><span>${powered?'● 작동 중':d.enabled?'전력 부족':d.deployed?'전개됨 · 재가동 무료':'미전개 · 부품 1 필요'}</span><button class="secondary-button ${powered?'active':''}" data-drone="${d.id}" data-focus="drone-${d.id}" ${game.state.mode!=='combat'?'disabled':''}>${d.enabled?'중지':d.deployed?'재가동':'전개'}</button></div><div class="thin-track"><i style="width:${d.enabled?pct(d.charge,d.cooldown):0}%"></i></div></div>`;
    }).join('')||'<p class="microcopy">교역소에서 드론을 구입해 장착하세요. 드론 시스템은 빈 베이에 설치할 수 있습니다.</p>');
    const w=p.weapons.find(w=>w.id===UI.selectedWeapon);
    $('weapon-instruction').textContent=droneTab?'드론 전력 배분 → 전개 · 첫 전개에만 부품 1 소비':w?.type==='beam'?(UI.beamStart?'빔 시작점 지정됨 → 끝 방 선택':'빔 선택됨 → 시작 방, 끝 방 순서로 선택'):'무기 선택 → 적 방 조준 → Space로 재개 · 발사 예약은 완충 시 한 번 실행';
  }
  function renderTactics(){
    const p=game.state.player,e=game.state.enemy,doors=p.doors||[],airlocks=doors.filter(d=>d.airlock&&d.open),broken=doors.filter(d=>d.hp<=0),intruders=physicalCrew('player').filter(c=>!p.crew.some(own=>own.id===c.id)),away=p.crew.filter(c=>c.hp>0&&c.shipId==='enemy');
    $('doors-btn').setAttribute('aria-expanded',String(UI.doorsOpen));$('doors-btn').classList.toggle('active',UI.doorsOpen);$('door-list').hidden=!UI.doorsOpen;
    $('door-status').textContent=airlocks.length?'에어록 '+airlocks.length+'개 개방':broken.length?'문 '+broken.length+'개 파손':'에어록 밀폐';
    patch($('door-list'),doors.map(d=>`<button class="door-control ${d.open?'open':''} ${d.airlock?'airlock':''}" data-door="${d.id}" data-focus="door-list-${d.id}" aria-pressed="${d.open}" ${d.hp<=0?'disabled':''}><span>${esc(d.airlock?roomName(d.a)+' 에어록':roomName(d.a)+' ↔ '+roomName(d.b))}</span><b>${d.hp<=0?'파손':d.open?'열림':'닫힘'}</b></button>`).join('')+'<p class="microcopy">닫힌 문은 산소를 격리합니다. 아군은 자동 통과하고 침입자는 문을 부숩니다. 파손된 문은 다음 비컨에서 정비됩니다.</p>');
    const special=e?.special,threatNames={boarding:'적 침투',drone_surge:'드론 과충전',volley:'미사일 일제사격'};
    let alert='개별 문으로 화재와 침입자를 격리하세요.',danger=false;
    if(away.length){alert='적선에 아군 '+away.length+'명 · 파괴 전에 귀환시키세요';danger=true;}
    if(intruders.length){alert='선내 침입자 '+intruders.length+'명 · 승무원 집결 또는 격실 환기';danger=true;}
    if(special&&game.state.mode==='combat'){
      const active=(special.activeRemaining||0)>0,soon=special.warningActive||special.timer<=special.warning;
      const threat=(active?'진행 중: ':'')+(threatNames[special.kind]||'특수 공격')+' '+Math.ceil(active?special.activeRemaining:Math.max(0,special.timer))+'초';
      alert=(intruders.length||away.length?alert+' · ':'')+threat;danger=danger||soon||active;
    }
    if(p.venting&&!intruders.length&&!away.length&&!special){alert='환기 중 · 산소가 낮아집니다. 진압 후 전체 봉쇄';danger=true;}
    $('tactical-alert').textContent=alert;$('tactical-alert').classList.toggle('danger',danger);
  }
  function renderEnvironment(){
    const s=game.state,p=s.player,env=s.environment,definition=SW.DATA.environments?.[env?.kind];
    $('environment-strip').hidden=!definition||s.mode!=='combat';
    if(definition&&s.mode==='combat'){
      const timer=env.period>0?(env.warningActive?'접근 경고 ':'다음 발생 ')+Math.max(0,env.timer).toFixed(1)+'초':'가용 전력 '+(game.getReactorCapacity?game.getReactorCapacity(p):p.reactor)+' / '+p.reactor;
      $('environment-strip').className='environment-strip '+env.kind+(env.warningActive?' warning':'');
      patch($('environment-strip'),'<span class="environment-icon" aria-hidden="true">'+esc(definition.icon)+'</span><div><strong>'+esc(definition.name)+'</strong><p>'+esc(definition.description)+'</p></div><span class="environment-timer">'+esc(timer)+'</span>');
    }
    const cloak=p.aux?.cloaking,active=p.cloakRemaining>0,cooldown=p.cloakCooldown||0,power=cloak?.power||0;
    $('cloak-btn').disabled=s.mode!=='combat'||!cloak?.level||power<1||active||cooldown>0;
    $('cloak-btn').classList.toggle('active',active);
    patch($('cloak-btn'),active?'◌ 은폐 중 '+p.cloakRemaining.toFixed(1)+'s':'◌ 은폐 <kbd>C</kbd>');
    $('cloak-status').textContent=game.getAbilityStatus?.('cloaking')?.message||(!cloak?.level?'시스템 설치에서 장착':power<1?'은폐에 전력 필요':active?'회피 +60%p · 일반 사격은 지속시간 감소':cooldown>0?'재충전 '+cooldown.toFixed(1)+'초':'준비 · 지속 '+(5*power)+'초');
  }

  function useHacking(){
    const h=game.state.player.hacking;
    if(h?.targetRoomId&&h.phase!=='idle'){order(()=>game.activateHacking());return;}
    clearSelection();UI.intent='hacking';render();toast('해킹할 적 시스템의 방을 선택하세요. 발사에 드론 부품 1개를 씁니다.');
  }
  function useMind(){const wasMind=UI.intent==='mind';clearSelection();UI.intent=wasMind?null:'mind';render();toast('정신 지배할 승무원을 선택하세요. 보라색 대상 목록에서도 선택할 수 있습니다.');}
  function renderAbilities(){
    const p=game.state.player,s=game.state,defs=[
      {id:'hacking',name:'해킹',glyph:'⌁',key:'H',detail:'부착 → 문 봉쇄 → 시스템 교란',action:p.hacking?.targetRoomId?'해킹 펄스':'드론 발사',status:game.getAbilityStatus?.('hacking'),active:p.hacking?.phase==='active',remaining:p.hacking?.timer,cd:p.hacking?.cooldown},
      {id:'mind',name:'정신 지배',glyph:'◎',key:'M',detail:p.aux?.mind?.level>=3?'HP +30 · 근접 피해 +100%':p.aux?.mind?.level===2?'HP +15 · 근접 피해 +25%':'적 승무원 전향 · 아군 지배 해제',action:UI.intent==='mind'?'대상 선택 중…':'대상 선택',status:game.getAbilityStatus?.('mind'),active:p.mindControl?.remaining>0,remaining:p.mindControl?.remaining,cd:p.mindControl?.cooldown},
      {id:'battery',name:'보조 배터리',glyph:'ϟ',key:'B',detail:'30초 동안 임시 전력 +2 / +4',action:'배터리 가동',status:game.getAbilityStatus?.('battery'),active:p.battery?.remaining>0,remaining:p.battery?.remaining,cd:p.battery?.cooldown}
    ];
    patch($('advanced-abilities'),defs.map(d=>{
      const sys=p.aux?.[d.id],installed=(sys?.level||0)>0,blocked=!installed||s.mode!=='combat'||(d.status?.ok===false&&!['INVALID_TARGET','NOT_VISIBLE'].includes(d.status.code));
      const timer=d.active?'가동 '+Math.max(0,d.remaining||0).toFixed(1)+'s':d.cd>0?'재사용 '+d.cd.toFixed(1)+'s':installed?'LEVEL '+sys.level:'미설치';
      const target=d.id==='hacking'&&p.hacking?.targetRoomId?' · '+roomName(p.hacking.targetRoomId,'enemy'):'';
      return `<article class="ability-card ${d.active?'active':''} ${UI.intent===d.id?'aiming':''} ${installed?'':'uninstalled'}"><header><span class="ability-glyph">${d.glyph}</span><h3>${d.name}</h3><span class="ability-timer">${timer}</span></header><p class="ability-description">${d.detail}${esc(target)}</p><div class="ability-controls"><button class="secondary-button" data-ability="${d.id}" data-focus="ability-${d.id}" ${blocked?'disabled':''}>${d.action} <kbd>${d.key}</kbd></button><span class="ability-status">${esc(d.status?.message||'시스템 설치에서 장착')}</span></div></article>`;
    }).join(''));
    const targets=UI.intent==='mind'?[...(s.enemy?.crew||[]),...p.crew.filter(c=>c.controlledBy==='enemy')].filter(c=>c.hp>0):[];
    $('mind-targets').hidden=UI.intent!=='mind';
    patch($('mind-targets'),UI.intent==='mind'?'<div class="mind-target-heading"><strong>정신 지배 대상</strong><span>일시정지 중에도 명령 가능 · 지배된 인원은 자동 행동</span><button class="link-button" data-action="cancel-target">취소 ×</button></div><div class="mind-target-list">'+(targets.map(c=>{const st=game.getAbilityStatus?.('mind',c.id);return '<button data-mind-target="'+c.id+'" data-focus="mind-target-'+c.id+'" class="mind-target-button" '+(st?.ok===false?'disabled':'')+'><strong>'+esc(c.name)+(c.controlledBy==='enemy'?' · 지배 해제':'')+'</strong><span>'+esc(roomName(c.roomId,c.shipId))+' · '+round(c.hp)+' HP</span><small>'+esc(st?.message||'대상 지정')+'</small></button>';}).join('')||'<p>감지된 승무원이 없습니다.</p>')+'</div>':'');
  }
  function skillLevel(c,id){return game.getCrewSkillLevel?game.getCrewSkillLevel(c,id):(c.skills?.[id]>=120?2:c.skills?.[id]>=40?1:0);}
  function crewRankBadge(c){
    const best=Object.keys(skillNames).map(id=>({id,rank:skillLevel(c,id),xp:c.skills?.[id]||0})).sort((a,b)=>b.rank-a.rank||b.xp-a.xp)[0];
    return best?.rank?'<b class="mastery-badge" title="'+esc(skillNames[best.id]+' 숙련 '+best.rank+'단계')+'">'+esc(skillNames[best.id])+' '+(best.rank===2?'Ⅱ':'Ⅰ')+'</b>':'';
  }
  function renderEnemyIntent(){
    const e=game.state.enemy;
    if(!e){patch($('enemy-intel'),'<span>감지되는 적성 무기가 없습니다.</span><span>항해 지도를 열어 다음 목적지를 선택하세요.</span>');return;}
    const profile=SW.DATA.enemyProfiles?.[e.aiProfile||'raider'];
    const doctrine=profile?'<div class="enemy-doctrine"><span class="doctrine-mark" style="--doctrine-color:'+esc(profile.accent||'#e8ac87')+'">'+esc(profile.name)+'</span><p>'+esc(profile.description)+'</p></div>':'';
    patch($('enemy-intel'),doctrine+'<div class="enemy-armament">'+e.weapons.map(w=>'<div class="enemy-weapon"><header><span>'+esc(w.name)+'</span><span>'+(!w.powered?'정지':Math.max(0,w.cooldown-w.charge).toFixed(1)+'s')+'</span></header><div class="thin-track"><i style="width:'+pct(w.charge,w.cooldown)+'%"></i></div><div class="enemy-target-intent">⌖ '+(w.target?'다음 표적 · '+esc(roomName(w.target)):'표적 탐색 중')+'</div></div>').join('')+'</div>');
  }
  function renderEffects(){
    if(UI.renderMode==='3d'||innerWidth<=590){patch($('battle-fx'),'');return;}
    const bound=$('battle-grid').getBoundingClientRect(),out=[];
    const project=(side,x,y)=>{const svg=$(side+'-ship'),matrix=svg.getScreenCTM();if(!matrix)return null;const point=svg.createSVGPoint();point.x=x;point.y=y;const screen=point.matrixTransform(matrix);return {x:screen.x-bound.left,y:screen.y-bound.top};};
    for(const p of game.state.projectiles||[]){
      const from=p.from==='player'?'player':'enemy',to=from==='player'?'enemy':'player',source=game.state[from],target=game.state[to];if(!source||!target)continue;
      const room=target.rooms.find(r=>r.id===p.targetRoom)||target.rooms[0],gun=source.rooms.find(r=>r.id==='weapons')||source.rooms[0],a=layoutMetrics(layoutData(source)),b=layoutMetrics(layoutData(target));
      const start=project(from,a.ox+(gun.x+gun.w/2)*a.cell,a.oy+(gun.y+gun.h/2)*a.cell),end=project(to,b.ox+(room.x+room.w/2)*b.cell,b.oy+(room.y+room.h/2)*b.cell);if(!start||!end)continue;
      const progress=Math.max(0,Math.min(1,p.progress||0)),x=start.x+(end.x-start.x)*progress,y=start.y+(end.y-start.y)*progress,dx=end.x-start.x,dy=end.y-start.y,len=Math.hypot(dx,dy)||1,col=p.weaponType==='ion'?'#95bdff':from==='player'?'#a5efcf':'#f7a87a';
      out.push('<line x1="'+(x-dx/len*14)+'" y1="'+(y-dy/len*14)+'" x2="'+x+'" y2="'+y+'" stroke="'+col+'" stroke-width="'+(p.weaponType==='missile'?4:2)+'" stroke-linecap="round"/><circle cx="'+x+'" cy="'+y+'" r="3" fill="#effff0"/>');
    }
    patch($('battle-fx'),out.join(''));
  }
  function render(){
    if(UI.pointerDown)return;
    const s=game.state,p=s.player,e=s.enemy;
    renderViewSettings();
    if(s.mode!==UI.lastMode){UI.lastMode=s.mode;UI.hideMap=false;}
    if(s.campaign?.pendingSectorChoice&&!UI.wasPendingSector)UI.mapView='world';
    UI.wasPendingSector=!!s.campaign?.pendingSectorChoice;
    if(s.encounterId!==UI.lastEncounter){UI.lastEncounter=s.encounterId;clearSelection();}
    UI.selectedCrewIds=UI.selectedCrewIds.filter(id=>p.crew.some(c=>c.id===id&&c.hp>0&&!c.controlledBy));UI.selectedCrew=UI.selectedCrewIds[0]||null;
    const world=game.getWorldMap?.(),region=world?.nodes?.find(n=>n.id===world.currentId);
    $('sector-name').textContent=String(s.sector).padStart(2,'0')+' / '+(s.campaign?.totalSectors||3)+' · '+(region?.name||(SW.DATA.sectorNames||[])[s.sector-1]||'미지의 항로');
    $('jump-label').textContent='도약 '+String(s.stats?.jumps??s.jumpCount??0).padStart(2,'0');
    $('cargo-count').textContent=(s.cargo?.length||0)+'/6';
    $('player-name').textContent=p.name;$('player-class').textContent=(s.loadoutId||'argo').toUpperCase()+' CLASS';
    for(const [side,ship] of [['player',p],['enemy',e]]){const button=$(side+'-layout-btn');button.disabled=!ship;$(side+'-layout-name').textContent=ship?layoutData(ship).name:'접촉 대기';$(side+'-layout-meta').textContent=ship?layoutMeta(ship):'';}
    $('difficulty-badge').textContent=SW.DATA.difficulties?.[s.difficulty||'standard']?.name||'표준';$('difficulty-badge').classList.toggle('veteran',s.difficulty==='veteran');
    $('player-panel').classList.toggle('cloaked',p.cloakRemaining>0);$('enemy-panel').classList.toggle('cloaked',e?.cloakRemaining>0);
    patch($('resources'),[['scrap','▧','스크랩'],['fuel','◈','연료'],['missiles','↟','미사일'],['droneParts','⌘','드론 부품']].map(([key,icon,name])=>'<div class="resource '+key+' '+(s.resources[key]<=2?'low':'')+'"><span class="resource-icon">'+icon+'</span><div><strong>'+s.resources[key]+'</strong><small>'+name+'</small></div></div>').join(''));
    const isCombat=s.mode==='combat';
    $('encounter-kicker').textContent=isCombat?(s.bossPhase?'FINAL ENCOUNTER / PHASE '+s.bossPhase:'HOSTILE CONTACT'):'OPERATION LAST SIGNAL';
    $('encounter-title').textContent=isCombat?(s.bossPhase?'마지막 신호를 지켜라':'교전 중 · '+(e?.name||'미확인 함선')):s.mode==='briefing'?'연방의 마지막 항로':s.mode==='victory'?'신호 전달 완료':s.mode==='defeat'?'항해가 종료되었습니다':'다음 도약을 준비하세요';
    $('pause-label').textContent=s.paused?'● 전술 일시정지':'● 실시간 전투';$('pause-label').classList.toggle('running',!s.paused);
    $('pause-label').hidden=!isCombat;
    $('pause-btn').disabled=!isCombat;patch($('pause-btn'),s.paused?'<span>▶</span> 전투 시작 <kbd>SPACE</kbd>':'<span>Ⅱ</span> 일시정지 <kbd>SPACE</kbd>');
    $('speed-btn').textContent=(s.speed||1)+'×';$('speed-btn').disabled=!isCombat;
    patch($('player-vitals'),hullMarkup(p));patch($('enemy-vitals'),hullMarkup(e));
    $('player-condition').textContent=p.hull/p.maxHull<.35?'선체 위험':p.rooms.some(r=>r.fire)?'화재 발생':p.rooms.some(r=>r.breach)?'기압 손실':'선체 정상';$('player-condition').classList.toggle('danger',p.hull/p.maxHull<.35||p.rooms.some(r=>r.fire||r.breach));
    $('evasion-value').innerHTML=round(p.evasion)+'<small>%</small>';
    const oxygen=p.rooms.reduce((v,r)=>v+r.oxygen,0)/p.rooms.length;$('oxygen-value').innerHTML=round(oxygen)+'<small>%</small>';$('oxygen-value').style.color=oxygen<30?'var(--red)':'';
    $('vent-btn').classList.toggle('active',p.venting);$('vent-btn').setAttribute('aria-pressed',String(p.venting));$('vent-btn').textContent=p.venting?'◎ 환기 종료':'◎ 전체 환기';
    $('ftl-value').textContent=round(p.ftl)+'%';$('ftl-bar').style.width=pct(p.ftl)+'%';$('escape-btn').disabled=!isCombat||p.ftl<100||s.resources.fuel<1||game.getEscapeStatus?.().ok===false;
    $('enemy-name').textContent=e?.name||'접촉 없음';$('enemy-badge').textContent=e?'적대적':'안전';$('enemy-kicker').textContent=e?'HOSTILE VESSEL':'SCANNING DEEP SPACE';
    patch($('player-ship'),shipSvg(p,'player'));patch($('enemy-ship'),shipSvg(e,'enemy'));
    const selectedWeapon=p.weapons.find(w=>w.id===UI.selectedWeapon);
    $('target-callout').hidden=!e;$('target-callout').classList.toggle('aiming',!!UI.selectedWeapon||['boarding','recall','hacking','mind'].includes(UI.intent));
    $('target-callout').textContent=UI.intent==='hacking'?'⌁ 해킹할 적 시스템 선택 · 부품 1':UI.intent==='mind'?'◎ 지배할 적 승무원 선택':UI.intent==='recall'?'↙ 귀환시킬 아군이 있는 적 방 선택':UI.intent==='boarding'?'↗ 침투할 적의 방을 선택하세요':UI.intent==='crew'&&selectedCrew().some(c=>c.shipId==='enemy')?'적선의 아군 선택됨 → 타일 이동 / 적 클릭 교전':selectedWeapon?'⌖ '+selectedWeapon.name+' · '+(selectedWeapon.type==='beam'?(UI.beamStart?'빔 끝 방 선택':'빔 시작 방 선택'):'적의 방을 눌러 조준'):'무기 선택 → 적의 방을 눌러 조준';
    const activeRoute=UI.selectedCrew&&game.getCrewRoute?.(UI.selectedCrew);
    $('ship-hint').textContent=activeRoute?.points?.length>1?'점선은 실제 타일 경로 · '+Number(activeRoute.distance||0).toFixed(1)+'칸 남음':UI.selectedCrewIds.length?UI.selectedCrewIds.length+'명 선택 → 타일 이동 / 적 클릭 교전':'승무원 선택 → 타일 이동 · 빈 베이 → 설치';
    renderEnemyIntent();
    renderCrew();renderCrewCombat();renderSystems();renderWeapons();renderTactics();renderEnvironment();renderAbilities();renderEffects();
    const entries=s.log.slice(-2);patch($('log-stream'),entries.map(l=>'<div class="log-entry '+esc(l.type)+'"><time>'+String(Math.floor(l.time/60)).padStart(2,'0')+':'+String(Math.floor(l.time%60)).padStart(2,'0')+'</time><span>'+esc(l.text)+'</span></div>').join(''));
    const last=s.log.at(-1);if(last&&last.id!==lastSoundLog){if(UI.lastHull!==undefined&&p.hull<UI.lastHull)sound('hit');lastSoundLog=last.id;}UI.lastHull=p.hull;
    $('map-btn').disabled=isCombat||s.mode==='briefing'||s.mode==='defeat'||s.mode==='victory';
    $('load-btn').disabled=!hasSave();
    if(s.mode!==autoSaveMode){autoSaveMode=s.mode;if(s.mode!=='briefing')save();}
    $('quest-count').textContent=(game.getQuestLog?.()||s.campaign?.quests||[]).filter(q=>q.status==='active').length;
    renderModal();
  }

  function dialog(inner,extra=''){inner=inner.replace('<h2>','<h2 id="dialog-title">');return '<section class="dialog '+extra+'" role="dialog" aria-modal="true" aria-labelledby="dialog-title">'+inner+'</section>';}
  const closeButton='<button class="dialog-close" data-action="close-modal" aria-label="닫기">×</button>';
  function renderModal(){
    const s=game.state,mode=UI.modal||s.mode;
    const isMap=mode==='map'||mode==='escape-map';
    const detail=mode==='systems'?[s.mode,s.resources.scrap,s.player.aux,s.player.systems,s.player.reactor,game.getSystemSlots?.('player'),UI.selectedSlotId]:mode==='shop'?[s.resources,s.player.systems,s.player.aux,s.player.hull,s.player.reactor,s.player.crew.length,s.player.drones?.length,s.player.weapons.length,s.cargo,s.nodes.find(n=>n.id===s.currentNodeId)?.store]:mode==='layout'?[UI.layoutSide,s.player.layoutId,s.enemy?.layoutId,s[UI.layoutSide]?.doors,s[UI.layoutSide]?.aux]:mode==='equipment'?[s.mode,s.resources.scrap,s.player.weapons,s.player.drones,s.cargo,UI.swapCargoId,UI.discardCargoId]:isMap?[s.currentNodeId,UI.selectedNode,UI.mapView,UI.selectedWorld,s.sector,s.resources.fuel,s.fleet,s.campaign?.pendingSectorChoice,s.campaign?.quests,s.campaign?.finalStand]:mode==='event'?s.event:mode==='reward'?[s.reward,s.cargo?.length]:mode==='briefing'?[hasSave(),s.loadoutId,s.difficulty,UI.renderMode,UI.visualStyle,s.resources,s.player.aux]:mode==='quests'?s.campaign?.quests:mode==='skills'?UI.skillCrewId:mode==='log'?[s.log.length,s.log.at(-1)?.id]:mode==='files'?[UI.importCandidate?.name,UI.importError]:null;
    const signature=mode+'|'+Boolean(UI.hideMap)+'|'+JSON.stringify(detail);
    if(signature===modalSignature)return;
    modalSignature=signature;
    let html='';
    if(mode==='briefing')html=renderHangar();
    if(mode==='skills')html=renderSkills();
    if(mode==='quests')html=renderQuestJournal();
    if(mode==='escape-map')html=renderMap();
    if(mode==='layout')html=renderLayout();
    if(mode==='equipment')html=renderEquipment();
    if(mode==='systems')html=renderSystemInstallation();
    if(mode==='log')html=renderHistory();
    if(mode==='help')html=renderHelp();
    if(mode==='files')html=renderSaveFiles();
    if(mode==='restart')html=dialog(closeButton+'<span class="eyebrow">NEW VOYAGE</span><h2>새로운 항해를 시작할까요?</h2><p>현재 항해와 이 브라우저의 자동 저장이 새 항해로 바뀝니다. 보관하려면 먼저 저장 파일 관리에서 JSON 파일을 내보내세요.</p><div class="dialog-actions"><button class="secondary-button" data-action="close-modal">돌아가기</button><button class="primary-button orange" data-action="confirm-restart">새 항해 시작</button></div>');
    if(mode==='event'&&s.event)html=dialog('<span class="eyebrow">INCOMING TRANSMISSION</span><h2>'+esc(s.event.title)+'</h2><p>'+esc(s.event.body)+'</p><div class="choice-list">'+s.event.choices.map((c,i)=>'<button class="choice-button '+(c.style==='blue'||c.requiresSpecies||c.requiresSystem||c.requiresWeapon||c.requiresDrone||c.requiresSkill?'blue-choice':'')+'" data-choice="'+esc(c.id)+'" '+(c.disabled?'disabled':'')+'><div><strong><span class="choice-number">0'+(i+1)+'</span>'+esc(c.label)+'</strong>'+(c.description?'<small>'+esc(c.description)+'</small>':'')+(c.reason?'<small class="choice-reason">'+esc(c.reason)+'</small>':'')+'</div><span class="choice-arrow">→</span></button>').join('')+'</div>');
    if(mode==='reward'&&s.reward)html=renderReward();
    if(mode==='map'&&!UI.hideMap)html=renderMap();
    if(mode==='shop')html=renderShop();
    if(mode==='victory'||mode==='defeat')html=dialog('<span class="eyebrow">'+(mode==='victory'?'MISSION COMPLETE / SIGNAL RECEIVED':'MISSION LOST / SIGNAL FADING')+'</span><h2>'+(mode==='victory'?'당신의 신호가<br><em>연방에 도착했습니다.</em>':'별들 사이에<br>기록된 마지막 항해.')+'</h2><p>'+(mode==='victory'?'반군 기함이 침묵했습니다. 손상된 작은 함선과 살아남은 승무원들이 불가능해 보였던 항로를 완주했습니다.':esc(s.player.name)+'의 신호가 끊어졌습니다. 다음 항해에서는 더 일찍 적의 무기를 제압하고, 피해를 받은 방에 승무원을 배치해보세요.')+'</p><div class="end-stats">'+[[s.stats?.kills||0,'함선 격파'],[s.stats?.jumps||0,'FTL 도약'],[s.stats?.scrapEarned||0,'스크랩 획득'],[s.player.crew.filter(c=>c.hp>0).length,'생존 승무원'],[s.stats?.salvaged||0,'장비 회수'],[s.stats?.equipmentSold||0,'장비 판매']].map(([v,t])=>'<div class="end-stat">'+v+'<span>'+t+'</span></div>').join('')+'</div><div class="dialog-actions"><button class="primary-button" data-action="confirm-restart">새로운 항해 <span>↗</span></button></div>');
    const modal=$('modal');modal.hidden=!html;$('app').inert=!!html;
    if(html){const focusKey=document.activeElement?.getAttribute('data-focus');patch(modal,html);if(!focusKey)requestAnimationFrame(()=>modal.querySelector('button:not(:disabled)')?.focus({preventScroll:true}));}
    else {modal.innerHTML='';renderedMarkup.delete(modal);}
  }
  function miniShip(loadout){
    const layout=SW.DATA.layouts?.[loadout.spec.layoutId]||layoutData();
    return blueprintSvg(layout,loadout.accent||'#81e5db','hangar-'+loadout.id,layout.doors,false).replace('class="layout-blueprint"','class="hangar-ship"');
  }
  function renderHangar(){
    const s=game.state,loadouts=Object.values(SW.DATA.loadouts||{}),selected=SW.DATA.loadouts?.[s.loadoutId||'argo'],difficulty=SW.DATA.difficulties?.[s.difficulty||'standard'];
    const cards=loadouts.map((l,i)=>{
      const spec=l.spec,layout=SW.DATA.layouts?.[spec.layoutId]||layoutData(),weaponNames=spec.weaponDefs.map(w=>SW.DATA.weapons[typeof w==='string'?w:w.defId]?.name||w).join(' · ');
      return `<button class="loadout-card ${l.id===s.loadoutId?'selected':''}" data-loadout="${l.id}" data-focus="loadout-${l.id}" aria-label="${esc(l.name)} 선택" aria-pressed="${l.id===s.loadoutId}" style="--loadout-accent:${l.accent}"><span class="loadout-code">0${i+1} / ${l.id.toUpperCase()}<span>${l.id===s.loadoutId?'SELECTED':'AVAILABLE'}</span></span>${miniShip(l)}<span class="loadout-heading"><b>${esc(l.name)}</b><small>${esc(l.role)}</small></span><span class="loadout-tagline">${esc(l.tagline)}</span><span class="loadout-stats"><span>선체 <b>${spec.maxHull||spec.hull}</b></span><span>반응로 <b>${spec.reactor}</b></span><span>승무원 <b>${spec.crewTypes.length}</b></span></span><span class="loadout-weapons">${esc(weaponNames)}</span><span class="loadout-layout"><span>▥ ${esc(layout.name)}</span><span>${layout.doors.filter(d=>!d.airlock).length} 통로 · ${layout.doors.filter(d=>d.airlock).length} 에어록</span></span></button>`;
    }).join('');
    return dialog('<span class="eyebrow">EXPEDITION / 07 · HANGAR</span><h2>작은 함선.<br><em>서로 다른 생존 방식.</em></h2><p class="hangar-intro">여덟 섹터에서 항로를 선택하고, 신호를 따라 퀘스트를 완수하세요. 연방 기지에서 마지막 교전이 기다립니다. 함선과 난이도를 고르면 항해가 시작됩니다.</p><div class="hangar-visual-settings"><span class="eyebrow">화면 선택 · 항해 중에도 변경 가능</span><div class="view-controls">'+visualControls('hangar')+'</div></div><div class="loadout-grid">'+cards+'</div><div class="loadout-description"><span class="eyebrow">'+esc(selected?.role||'시작 함선')+'</span><p>'+esc(selected?.description||'')+'</p><p class="loadout-layout-description"><b>격실 전략</b> '+esc((SW.DATA.layouts?.[selected?.spec.layoutId]||layoutData()).description)+'</p><div class="loadout-resources">시작 보급 <span>▧ '+s.resources.scrap+' 스크랩</span><span>◈ '+s.resources.fuel+' 연료</span><span>↟ '+s.resources.missiles+' 미사일</span><span>⌘ '+s.resources.droneParts+' 부품</span></div></div><div class="difficulty-picker"><div class="difficulty-options" role="group" aria-label="난이도 선택">'+Object.values(SW.DATA.difficulties||{}).map(d=>'<button class="difficulty-option '+(d.id===s.difficulty?'active':'')+'" data-difficulty="'+d.id+'" data-focus="difficulty-'+d.id+'" aria-pressed="'+(d.id===s.difficulty)+'" aria-label="'+esc(d.name)+' 난이도">'+esc(d.name)+'</button>').join('')+'</div><p>'+esc(difficulty?.description||'')+'</p></div><div class="dialog-actions"><button class="secondary-button" data-action="open-systems" data-focus="hangar-systems">＋ 시스템 설치</button><button id="launch-btn" class="primary-button" data-action="start-run">'+esc(selected?.name||'아르고')+'로 출항 <span>↗</span></button>'+(hasSave()?'<button class="secondary-button" data-action="load">저장된 항해 이어가기</button>':'')+'</div><p class="dialog-note">Space 일시정지 · 1–4 조준 · F 일제사격 · C 은폐 · H 해킹 · M 정신 지배 · B 배터리<br>독립 전술 캠페인 · 자동 저장 · 장비·화물과 승무원 숙련은 이번 항해에 유지됩니다.</p>','hangar-dialog wide');
  }
  function renderSkills(){
    const crew=game.state.player.crew,c=crew.find(c=>c.id===UI.skillCrewId)||crew.find(c=>c.hp>0)||crew[0];
    const bonus={piloting:['기본 조타 보너스','회피 +3%p','회피 +6%p'],engines:['기본 엔진 운용','회피 +3%p','회피 +6%p'],weapons:['기본 무기 운용','충전 속도 +10%','충전 속도 +20%'],shields:['기본 실드 운용','재충전 시간 −8%','재충전 시간 −16%'],repair:['기본 종족 수리 속도','수리 속도 +15%','수리 속도 +30%'],combat:['기본 종족 공격력','근접 피해 +10%','근접 피해 +20%']};
    const names={piloting:'조타실 운용',engines:'엔진 운용',weapons:'무기 운용',shields:'실드 운용',repair:'사고 수습과 수리',combat:'실제 근접 교전'};
    return dialog(closeButton+'<span class="eyebrow">CREW MASTERY</span><h2>경험이 함선을 지킵니다.</h2><div class="skill-crew-tabs">'+crew.map(unit=>'<button class="secondary-button '+(unit.id===c?.id?'active':'')+'" data-skill-crew="'+unit.id+'" data-focus="skill-crew-'+unit.id+'">'+esc(unit.name)+(unit.hp<=0?' · 전사':'')+'</button>').join('')+'</div>'+(c?'<p>'+esc(c.name)+' · '+esc(speciesNames[c.species])+' · '+Math.max(0,round(c.hp))+' / '+c.maxHp+' HP</p><div class="mastery-grid">'+Object.keys(skillNames).map(id=>{const xp=c.skills?.[id]||0,rank=skillLevel(c,id),goal=rank>=2?120:rank===1?120:40,base=rank>=1?40:0;return '<div class="mastery-card"><header><strong>'+skillNames[id]+'</strong><span class="mastery-rank">'+['훈련 중','숙련 Ⅰ','숙련 Ⅱ'][rank]+'</span></header><div class="mastery-track"><i style="width:'+ (rank>=2?100:pct(xp-base,goal-base))+'%"></i></div><div class="mastery-progress"><span>'+Math.floor(xp)+' / '+goal+' XP</span><span>'+names[id]+'</span></div><p>'+bonus[id][rank]+'</p></div>';}).join('')+'</div>':'')+'<p class="dialog-note">경험치 40 / 120에서 두 단계로 성장합니다. 전투 중 전원이 들어온 담당 시설을 운용하거나, 실제 수리·근접전을 수행해야 경험치를 얻습니다. 같은 방에 여러 명을 배치해도 운용 효과는 중복되지 않습니다.</p><div class="dialog-actions"><button class="primary-button" data-action="close-modal">함선으로 돌아가기</button></div>','wide');
  }
  function renderHistory(){
    const s=game.state;
    return dialog(closeButton+'<span class="eyebrow">CAPTAIN’S LOG</span><h2>이번 항해의 기록</h2><p>'+esc(s.player.name)+' · '+esc(SW.DATA.difficulties?.[s.difficulty]?.name||'표준')+' · 섹터 '+s.sector+' · 도약 '+s.stats.jumps+'</p><div class="history-list">'+s.log.slice().reverse().map(l=>'<div class="history-entry '+esc(l.type)+'"><time>'+String(Math.floor(l.time/60)).padStart(2,'0')+':'+String(Math.floor(l.time%60)).padStart(2,'0')+'</time><p>'+esc(l.text)+'</p></div>').join('')+'</div><div class="dialog-actions"><button class="primary-button" data-action="close-modal">돌아가기</button></div>','wide');
  }
  function renderHelp(){
    const cards=[
      ['Ⅰ · 전술 시간','Space 또는 상단 버튼으로 전투를 멈춥니다. 일시정지 중에도 전력·이동·조준 명령을 준비할 수 있습니다. 재개하면 시간이 함께 흐릅니다.'],
      ['Ⅱ · 무기와 일제사격','1–4 또는 무기 카드 → 적의 방을 선택합니다. 자동은 충전 후 반복 발사, 수동은 충전 상태를 유지합니다. 충전 중 발사 예약을 누르면 완충 시 한 번 발사하며, F는 조준한 무기들의 한 번 발사를 예약합니다. 정지 중에는 Space로 재개해야 충전과 발사가 진행됩니다. 미사일은 실드를 관통합니다.'],
      ['Ⅲ · 빔의 경로','교역소에서 빔을 설치하면 시작 방과 끝 방을 순서대로 선택합니다. 경로가 지나는 방마다 한 번 피해를 주며, 남은 실드 층만큼 피해가 감소합니다. 먼저 레이저로 실드를 걷어내세요.'],
      ['Ⅳ · 문과 산소','함선의 문 또는 격실 문 목록을 눌러 열고 닫습니다. 닫힌 문은 산소와 화재를 격리하고, 침입자의 이동을 지연합니다. 전체 환기는 모든 통로와 에어록을 엽니다. 진압 후 전체 봉쇄하세요.'],
      ['Ⅴ · 침투와 귀환','승무원 선택 → 송신실 집결 → 실제 텔레포터 방 도착 → 텔레포터 전력 → 적선 전송 → 목적 방 선택 순서입니다. 송신 정원은 함선에 표시되며 기본 2명입니다. 20/15/10초 재충전 후 같은 적 방의 인원을 회수합니다. 은폐와 특수 실드는 전송을 차단하며, 적선이 파괴되면 남아 있는 아군도 전사합니다.'],
      ['Ⅵ · 드론과 전력','드론에 전력 2를 주고 드론 탭에서 전개합니다. 처음 전개할 때 부품 1개를 쓰며, 같은 교전에서 재가동은 무료입니다. 방어 드론은 미사일을 요격하고 공격 드론은 레이저를 발사합니다.'],
      ['Ⅶ · 승무원과 함선','아군 승무원은 화재·균열·시스템을 자동 수리하며, 의료실 전력이 있으면 그 방에서 치료받습니다. 적과 인접한 타일에서는 근접전이 우선하며 닫힌 문과 벽 너머로는 공격하지 않습니다. 선체 수리는 교역소·정비 비컨에서 가능합니다.'],
      ['Ⅷ · 항해와 기함','연결된 비컨으로 도약하며 연료 1을 씁니다. 교역·구조·사건에서 함선을 성장시키세요. 기함은 침투 → 드론 과충전 → 미사일 일제사격의 3단계이며, 경고 시간을 보고 대응할 수 있습니다.']
      ,['Ⅸ · 승무원 숙련','조타·엔진·무기·실드·정비·근접전의 여섯 숙련이 실제 행동으로 성장합니다. 경험치 40과 120에서 성능이 향상됩니다. 승무원 패널의 숙련 현황에서 효과와 진행도를 확인하세요.']
      ,['Ⅹ · 은폐와 이온','은폐에 전력을 배분하고 C를 누르면 회피가 크게 오르고 적 일반 무기 충전이 멈춥니다. 은폐는 5/10/15초 지속하며 일반 사격마다 최대 지속시간의 20%가 줄어듭니다. 빔 발사는 은폐 시간을 줄이지 않습니다. 이온은 실드가 있으면 실드를, 없으면 조준한 시스템을 일시적으로 잠그며 선체 피해는 주지 않습니다.']
      ,['Ⅺ · 위험 항로','소행성은 실드로 막고, 태양 플레어는 화재를 수습하며, 이온 폭풍에서는 줄어든 가용 전력을 재배분하세요. 지도에서 위험을 확인하고 경로를 선택합니다. 위험 교전에서 승리하면 추가 스크랩을 얻습니다.']
      ,['Ⅻ · 장비와 회수품','장비·화물에서 무기 4개·드론 2개를 장착하고 화물 6개를 보관합니다. 회수품은 화물에 넣거나 스크랩으로 분해합니다. 교전 밖에서 장착·교체하며 교역소에서 판매하세요. 무기 순서는 전력 배정 우선순위입니다.']
      ,['ⅩⅢ · 적의 다음 표적','적 함선 아래에 전술 성향과 각 무기의 다음 표적이 표시됩니다. 교란형은 이온으로 실드를, 포격형은 미사일로 기관과 방어를 압박합니다. 충전 중인 표적을 보고 수리 인원과 전력을 준비하세요.']
      ,['ⅩⅣ · 승무원 배치','각 승무원을 원하는 방에 이동시킨 뒤 배치 저장을 누르세요. 본함에 정지한 인원만 저장합니다. 복귀는 그 위치로 이동하는 명령이며 적선의 승무원을 순간이동시키지 않습니다.']
      ,['ⅩⅤ · 함선별 격실 구조','함선 상태 아래의 도면 이름을 누르면 실제 통로와 에어록을 확인합니다. 아르고·아틀라스·레이스와 적 함선은 서로 다른 구조를 사용합니다. 수리 인원의 이동 거리와 빔이 통과할 방을 도면에서 판단하세요.']
      ,['ⅩⅦ · 해킹과 정신 지배','해킹은 H → 적 시스템 선택으로 드론 부품 1개를 써서 부착합니다. 이후 펄스 버튼으로 4/7/10초 동안 해당 시스템을 교란하며 문을 봉쇄합니다. M → 승무원 선택은 적을 잠시 아군으로 바꾸며, 지배된 아군에게 사용하면 지배를 해제합니다.']
      ,['ⅩⅧ · 배터리와 재사용','B로 보조 배터리를 가동하면 30초 동안 2/4 전력이 추가됩니다. 종료 시 초과 배분이 회수되므로 산소·실드 전력을 확인하세요. 특수 능력은 효과가 끝난 뒤 재사용 시간을 갖습니다.']
      ,['ⅩⅨ · 월드 지도와 추격','섹터 지도에서 연결 비콘을 재방문할 수 있지만 매 도약에 연료와 추격 비용이 듭니다. 지나간 사건의 보상은 다시 나오지 않습니다. 붉은 전선에 점령된 비콘은 반군 교전으로 바뀝니다. 출구에서는 월드 지도의 다음 섹터를 고릅니다.']
      ,['ⅩⅩ · 연속 퀘스트','신호에서 임무를 수락하면 실제 지도에 목적지가 표시됩니다. 항해 일지에서 단계·목표·실패 조건을 확인하세요. 특수 장비나 종족으로 가능한 선택은 파란색입니다. 상점 재고와 퀘스트 결과는 저장 후에도 유지됩니다.']
      ,['ⅩⅥ · 실제 이동 경로','승무원 선택 → 사각 타일 선택 후 점선을 확인하세요. 상하좌우 타일 경로는 실제 문을 통과하며 남은 거리를 표시합니다. 다른 타일로 이동하면 지정 공격을 취소합니다. 적선 위 아군도 그 적선의 통로를 사용합니다. 이전 저장은 원래 도면을 유지해 계속 플레이할 수 있습니다.']
      ,['ⅩⅪ · 빈 베이와 시스템','＋ 시스템 설치 또는 빈 베이의 타일을 눌러 실제 방을 고르세요. 설비·가격을 확인하고 설치한 뒤 전력을 직접 연결합니다. 처음 네 베이를 사용할 수 있으며, 나머지 두 마운트는 40/60 스크랩으로 확장합니다. 교전과 사건 중에는 열람만 가능합니다.']
      ,['ⅩⅫ · 지정 근접전','같은 함선 위의 아군을 선택하고 적 승무원이나 선내 교전 목록을 누르세요. 승무원이 표적을 추격해 인접 타일에서 공격합니다. 목표 HP와 다음 타격 시간을 확인하고, 위험하면 빈 타일로 후퇴시키세요.']
      ,['ⅩⅩⅢ · 화면과 그래픽','격납고와 상단 화면 선택에서 2D/3D 및 현대 SF·로우폴리·청사진을 고릅니다. 선택한 승무원과 조준, 항해 상태는 그대로입니다. 3D는 드래그로 회전, 휠로 확대하고 시점 초기화로 복원합니다. 그래픽 설정은 브라우저에 따로 저장됩니다. 환경에 맞춰 호환 3D가 자동 선택될 수 있으며, 모든 명령은 같습니다.']
    ];
    return dialog(closeButton+'<span class="eyebrow">CAPTAIN’S FIELD GUIDE / 07</span><h2>멈추고, 배분하고, 살아남으세요.</h2><div class="help-grid">'+cards.map(([title,body])=>'<div class="help-card"><h3>'+title+'</h3><p>'+body+'</p></div>').join('')+'</div><div class="alert-inline">침투조의 귀환 전 적선을 파괴하지 않도록 사격을 조절하세요. 전체 환기 중에는 아군도 산소 피해를 받습니다.</div><p class="dialog-note">Space 일시정지 · 1–4 무기 선택 · F 일제사격 · C/H/M/B 특수 능력 · Shift 다중 선택 · Esc 선택 취소 · ? 안내<br>세이브는 자동 저장되며, ⇅ 저장 파일 관리에서 다른 브라우저로 옮길 수 있습니다.</p><div class="dialog-actions"><button class="primary-button" data-action="close-modal">함선으로 돌아가기</button></div>','wide');
  }
  function equipmentDefinition(item,kind=item.kind){return(kind==='drone'?SW.DATA.drones:SW.DATA.weapons)[item.defId];}
  function equipmentPrice(item,kind=item.kind){return SW.DATA.equipment?.[kind]?.[item.defId]?.sell||0;}
  function equipmentIcon(item,kind=item.kind){const def=equipmentDefinition(item,kind);return kind==='drone'?(def?.type==='defense'?'⬡':'⌘'):def?.type==='ion'?'ϟ':def?.type==='beam'?'╱':def?.type==='missile'?'↟':'⌖';}
  function equipmentSpec(item,kind=item.kind){
    const def=equipmentDefinition(item,kind);if(!def)return '';
    const detail=kind==='drone'?(def.type==='defense'?'미사일 요격':'레이저 피해 '+def.damage):def.type==='ion'?'이온 '+def.ionDamage+' · '+def.ionDuration+'초':def.type==='beam'?'방마다 피해 '+def.damage:def.shots+'발 × 피해 '+def.damage;
    return '전력 '+def.power+' · '+def.cooldown+'초 · '+detail;
  }
  function equipmentButton(action,item,label,disabled=false,kind='',extra=''){
    return '<button class="secondary-button" data-equipment="'+action+'" data-item="'+esc(item.id)+'" data-kind="'+esc(kind||item.kind||'')+'" data-focus="equipment-'+action+'-'+esc(item.id)+'" '+extra+' '+(disabled?'disabled':'')+'>'+label+'</button>';
  }
  function renderEquipment(){
    const s=game.state,p=s.player,cargo=s.cargo||[],limits=SW.DATA.equipmentLimits||{weapons:4,drones:2,cargo:6},editable=game.canManageEquipment?.()||false,shop=s.mode==='shop';
    const installed=(kind,list,max)=>{
      const cards=list.map((item,index)=>{
        const def=equipmentDefinition(item,kind),last=kind==='weapon'&&list.length===1;
        return '<article class="equipment-card installed"><div class="equipment-item-head"><span class="equipment-glyph '+(kind==='drone'?'drone':'')+'">'+equipmentIcon(item,kind)+'</span><div><span class="equipment-slot">'+(kind==='weapon'?'W':'D')+'0'+(index+1)+' · '+(kind==='weapon'?'장착 무기':'장착 드론')+'</span><h4>'+esc(def?.name||item.name)+'</h4></div><span class="equipment-value">▧ '+equipmentPrice(item,kind)+'</span></div><p class="equipment-spec">'+esc(equipmentSpec(item,kind))+'</p><div class="equipment-controls">'+(kind==='weapon'?'<div class="equipment-order">'+equipmentButton('up',item,'↑',!editable||index===0,kind,'aria-label="'+esc(def?.name)+' 우선순위 올리기"')+equipmentButton('down',item,'↓',!editable||index===list.length-1,kind,'aria-label="'+esc(def?.name)+' 우선순위 내리기"')+'</div>':'')+equipmentButton('stow',item,'화물 보관',!editable||cargo.length>=limits.cargo||last,kind,'title="'+(last?'무기 한 개는 장착 상태로 유지해야 합니다.':'충전과 표적은 초기화됩니다.')+'"')+equipmentButton('sell',item,'판매 +'+equipmentPrice(item,kind),!shop||last,kind,'aria-label="'+esc(def?.name)+' 판매 +'+equipmentPrice(item,kind)+' 스크랩"')+'</div></article>';
      });
      for(let i=list.length;i<max;i++)cards.push('<div class="equipment-empty-slot"><span>'+(kind==='weapon'?'W':'D')+'0'+(i+1)+'</span> 빈 장착 슬롯</div>');
      return cards.join('');
    };
    const cargoCards=cargo.map(item=>{
      const def=equipmentDefinition(item),list=item.kind==='weapon'?p.weapons:p.drones,hasSlot=list.length<(item.kind==='weapon'?limits.weapons:limits.drones);
      return '<article class="equipment-card cargo-card"><div class="equipment-item-head"><span class="equipment-glyph '+(item.kind==='drone'?'drone':'')+'">'+equipmentIcon(item)+'</span><div><span class="equipment-slot">'+(item.kind==='weapon'?'무기':'드론')+' · 보관 중</span><h4>'+esc(def?.name)+'</h4></div></div><p class="equipment-spec">'+esc(equipmentSpec(item))+'</p><div class="equipment-controls">'+equipmentButton('install',item,'장착',!editable||!hasSlot)+equipmentButton('swap',item,'교체',!editable||!list.length)+equipmentButton('sell',item,'판매 +'+equipmentPrice(item),!shop,'cargo')+equipmentButton('discard',item,'폐기',!editable)+'</div></article>';
    });
    for(let i=cargo.length;i<limits.cargo;i++)cargoCards.push('<div class="cargo-empty"><span>+</span><small>화물 '+(i+1)+' / '+limits.cargo+'</small></div>');
    const swap=cargo.find(item=>item.id===UI.swapCargoId),discard=cargo.find(item=>item.id===UI.discardCargoId);
    let prompt='';
    if(swap){const def=equipmentDefinition(swap),list=swap.kind==='weapon'?p.weapons:p.drones;prompt='<div class="equipment-confirm"><span class="eyebrow">REPLACE EQUIPMENT</span><h3>'+esc(def?.name)+' 장착</h3><p>교체할 장비를 선택하세요. 기존 장비는 이 화물칸으로 이동합니다. 두 장비의 충전과 표적은 초기화됩니다.</p><div class="swap-targets">'+list.map(item=>'<button class="secondary-button" data-equipment="replace" data-item="'+esc(swap.id)+'" data-replace="'+esc(item.id)+'">'+esc(item.name)+'와 교체 ↔</button>').join('')+'<button class="link-button" data-equipment="cancel">취소</button></div></div>';}
    if(discard)prompt='<div class="equipment-confirm danger"><span class="eyebrow">DISCARD CARGO</span><h3>'+esc(equipmentDefinition(discard)?.name)+' 폐기</h3><p>화물칸에서 제거하며 스크랩은 받지 않습니다. 교역소에서는 판매할 수 있습니다.</p><div class="swap-targets">'+equipmentButton('confirm-discard',discard,'폐기 확인',!editable)+'<button class="secondary-button" data-equipment="cancel">유지하기</button></div></div>';
    const noDamage=!p.weapons.some(w=>w.damage>0)&&!(p.drones||[]).some(d=>d.type==='combat');
    return dialog(closeButton+'<div class="equipment-heading"><div><span class="eyebrow">SHIP OUTFITTING / 05</span><h2>다음 교전을 준비하세요.</h2></div><span class="equipment-balance">▧ '+s.resources.scrap+'<small>보유 스크랩</small></span></div><div class="equipment-summary"><span>무기 <b>'+p.weapons.length+' / '+limits.weapons+'</b></span><span>드론 <b>'+(p.drones||[]).length+' / '+limits.drones+'</b></span><span>화물 <b>'+cargo.length+' / '+limits.cargo+'</b></span><span class="equipment-location '+(!editable?'locked':'')+'">'+(!editable?'교전·사건 중에는 열람만 가능':shop?'교역소 · 장착 / 판매 가능':'정비 가능 · 판매는 교역소에서')+'</span></div>'+(noDamage?'<p class="alert-inline">선체 피해를 주는 무기나 공격 드론이 없습니다. 이온은 다른 공격 수단과 함께 운용하세요.</p>':'')+prompt+'<div class="equipment-layout"><section><div class="equipment-section-title"><h3>장착 장비</h3><span>위에서부터 전력 우선 배정</span></div><div class="installed-equipment">'+installed('weapon',p.weapons,limits.weapons)+'</div><div class="equipment-section-title drone-title"><h3>드론 제어</h3><span>장착 후 전투에서 직접 전개</span></div><div class="installed-equipment">'+installed('drone',p.drones||[],limits.drones)+'</div></section><section><div class="equipment-section-title"><h3>화물칸</h3><span>보관 장비는 전력 사용 없음</span></div><div class="cargo-grid">'+cargoCards.join('')+'</div><div class="equipment-guide"><h4>장착과 전력은 별개입니다.</h4><p>장비를 장착한 뒤 전력 패널에서 필요한 전력을 배분하세요. 무기는 최소 1개를 유지하며, 교체는 화물칸이 가득 차 있어도 가능합니다.</p><p>판매가는 각 장비의 ▧ 숫자입니다. 판매 수입은 전투 보상 통계에 포함하지 않습니다.</p></div></section></div><div class="dialog-actions"><button class="primary-button" data-action="close-modal">'+(s.mode==='shop'?'거래소로 돌아가기':s.mode==='reward'?'보상 선택으로 돌아가기':'함선으로 돌아가기')+'</button></div>','equipment-dialog wide');
  }
  function handleEquipment(button){
    const action=button.dataset.equipment,id=button.dataset.item,kind=button.dataset.kind;
    if(action==='swap'||action==='discard'||action==='cancel'){
      UI.swapCargoId=action==='swap'?id:null;UI.discardCargoId=action==='discard'?id:null;modalSignature='';render();return;
    }
    let result;
    if(action==='stow')result=game.stowEquipment(kind,id);
    if(action==='install')result=game.installEquipment(id);
    if(action==='replace')result=game.installEquipment(id,button.dataset.replace);
    if(action==='sell')result=game.sellEquipment(kind,id);
    if(action==='confirm-discard')result=game.discardCargo(id);
    if(action==='up'||action==='down')result=game.moveWeapon(id,action==='up'?-1:1);
    if(resultMessage(result)){UI.swapCargoId=null;UI.discardCargoId=null;clearSelection();if(game.state.mode!=='briefing')save();sound();}
    modalSignature='';render();
  }
  function renderReward(){
    const s=game.state,r=s.reward,salvage=r.salvage,pending=salvage?.status==='pending';let gear='';
    if(salvage){const item=salvage.item,def=equipmentDefinition(item),full=(s.cargo?.length||0)>=6;
      gear='<section class="salvage-panel '+(!pending?'resolved':'')+'"><div class="salvage-heading"><span class="equipment-glyph">'+equipmentIcon(item)+'</span><div><span class="eyebrow">'+(pending?'RECOVERABLE EQUIPMENT':'SALVAGE RESOLVED')+'</span><h3>'+esc(def?.name)+'</h3></div><span class="salvage-kind">'+(item.kind==='weapon'?'무기':'드론')+'</span></div><p class="equipment-spec">'+esc(equipmentSpec(item))+'</p><p class="salvage-description">'+esc(def?.description)+'</p>'+(pending?'<div class="salvage-options"><button class="primary-button" data-salvage="claim" '+(full?'disabled':'')+'>화물칸으로 회수 <span>▣</span></button><button class="secondary-button" data-salvage="scrap">분해 · 스크랩 +'+salvage.scrapValue+'</button></div><p class="salvage-note">'+(full?'화물칸이 가득 찼습니다. 장비 관리에서 장착·교체·폐기하거나 이 장비를 분해하세요.':'회수하면 화물 '+((s.cargo?.length||0)+1)+' / 6 · 장비 관리에서 장착할 수 있습니다.')+'</p>':'<p class="salvage-result">✓ '+(salvage.status==='claimed'?'화물칸에 회수했습니다.':'분해 완료 · 스크랩 +'+salvage.scrapValue)+'</p>')+'</section>';
    }
    return dialog('<span class="eyebrow">'+(s.bossPhase?'FLAGSHIP ENGAGEMENT':'ENCOUNTER RESOLVED')+'</span><h2>'+esc(r.title||'항로를 확보했습니다')+'</h2><p>'+esc(r.body||'잔해에서 쓸 만한 자원을 회수했습니다. 다음 도약을 준비하세요.')+'</p><div class="reward-grid">'+[['scrap','스크랩'],['fuel','연료'],['missiles','미사일'],['droneParts','드론 부품']].map(([k,n])=>'<div class="reward-item"><strong>+'+(r[k]||0)+'</strong><span>'+n+'</span></div>').join('')+'</div>'+gear+'<div class="dialog-actions"><button class="secondary-button" data-action="open-equipment">장비·화물 관리</button><button class="secondary-button" data-action="open-systems" data-focus="reward-systems">시스템 설치</button><button class="primary-button" data-action="continue-reward" '+(pending?'disabled':'')+'>'+(pending?'회수품을 먼저 선택하세요':s.bossPhase&&s.bossPhase<3?'다음 교전 준비':'항해 계속')+' <span>↗</span></button></div>','reward-dialog');
  }
  function renderSaveFiles(){
    const candidate=UI.importCandidate,cs=candidate?.state;
    return dialog(closeButton+'<span class="eyebrow">VOYAGE ARCHIVE</span><h2>항해를 파일로 보관하세요.</h2><p>현재 항해를 JSON으로 내보내고, 다른 브라우저나 오프라인 버전에서 이어갈 수 있습니다. 이전 버전의 저장 파일도 자동 변환합니다.</p><div class="save-file-actions"><button class="secondary-button" data-action="export-save">현재 항해 내보내기 ↓</button><button class="secondary-button" data-action="pick-save">JSON 파일 선택 ↑</button></div>'+(UI.importError?'<p class="alert-inline">'+esc(UI.importError)+'</p>':'')+(candidate?'<div class="import-preview"><span class="eyebrow">파일 검증 완료</span><h3>'+esc(candidate.name)+'</h3><p>'+esc(cs.player.name)+' · '+esc(SW.DATA.difficulties?.[cs.difficulty]?.name||'표준')+' · 섹터 '+cs.sector+' · 선체 '+round(cs.player.hull)+' / '+cs.player.maxHull+' · 생존 승무원 '+cs.player.crew.filter(c=>c.hp>0).length+'명 · 스크랩 '+cs.resources.scrap+'</p><p class="microcopy">불러오면 현재 항해가 바뀝니다. 현재 항해의 복구용 사본은 이 브라우저에 보관됩니다.</p><button class="primary-button" data-action="import-save">이 항해 불러오기</button></div>':'')+'<div class="dialog-actions"><button class="secondary-button" data-action="export-backup">이전 가져오기 전 사본 ↓</button><button class="primary-button" data-action="close-modal">돌아가기</button></div>');
  }
  function downloadSave(value,name){
    const url=URL.createObjectURL(new Blob([value],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),15000);
  }
  function exportSave(){downloadSave(game.serialize(),'STARWARD_Sector'+game.state.sector+'_'+new Date().toISOString().slice(0,10)+'.json');toast('항해 저장 파일을 내보냈습니다.');}
  function importSave(){
    const candidate=UI.importCandidate;if(!candidate)return;
    try{localStorage.setItem(STORE+'-import-backup',game.serialize());}
    catch(_){toast('복구용 사본을 저장할 공간이 없습니다. 현재 항해를 먼저 내보내고 저장 공간을 확보하세요.');return;}
    if(!game.load(candidate.value)){toast('저장 파일을 불러올 수 없습니다. 현재 항해는 유지됩니다.');return;}
    clearSelection();UI.importCandidate=null;UI.importError=null;UI.modal=null;UI.resumeAfterModal=false;UI.selectedNode=null;modalSignature='';game.setPaused(true);save();render();toast('항해 파일을 불러왔습니다. 전투는 일시정지 상태입니다.');
  }

  function mapTabs(active){
    return '<nav class="navigation-tabs" aria-label="항해 지도 보기">'+[['local','섹터 지도'],['world','월드 항로'],['quests','퀘스트 일지']].map(([id,name])=>'<button class="'+(active===id?'active':'')+'" data-map-view="'+id+'" data-focus="map-tab-'+id+'" aria-pressed="'+(active===id)+'">'+name+'</button>').join('')+'</nav>';
  }
  function questCards(){
    const quests=game.getQuestLog?.()||game.state.campaign?.quests||[],states={active:'진행 중',completed:'완료',failed:'실패',abandoned:'포기'};
    if(!quests.length)return '<div class="quest-empty"><span>⌁</span><h3>아직 연결되지 않은 신호</h3><p>비콘의 미확인 신호와 구조 요청을 조사하세요.<br>임무를 수락하면 목적지와 진행 단계가 이곳에 기록됩니다.</p></div>';
    return '<div class="quest-journal">'+quests.map(q=>{
      const node=game.state.nodes.find(n=>n.id===q.targetNodeId),history=q.history||[];
      return '<article class="quest-entry '+esc(q.status)+'"><header><div><span class="eyebrow">'+esc(q.stageLabel||('STAGE '+q.stage))+'</span><h3>'+esc(q.title||q.name||q.definitionId||q.id)+'</h3></div><b class="quest-status">'+(states[q.status]||esc(q.status))+'</b></header><p>'+esc(q.objective||q.description||'지정된 신호에 접근해 다음 단계를 확인하세요.')+'</p><div class="quest-destination"><span>목적지</span><strong>'+esc(q.targetLabel||node?.label||(q.targetNodeId?'섹터 '+(q.targetSector||game.state.sector)+' · '+q.targetNodeId:'다음 섹터에서 좌표 확보'))+'</strong>'+(q.deadlineTurn!=null&&q.status==='active'?'<small>남은 도약 '+(q.turnsRemaining??Math.max(0,q.deadlineTurn-(game.state.campaign?.mapTurns||0)))+'회</small>':'')+'</div>'+(history.length?'<ol class="quest-history">'+history.slice(-5).map(h=>'<li>'+esc(typeof h==='string'?h:h.text||h.message||'진행 기록')+'</li>').join('')+'</ol>':'')+(q.status==='active'&&node?'<button class="link-button" data-quest-node="'+node.id+'">지도에서 목적지 보기 ↗</button>':'')+'</article>';
    }).join('')+'</div>';
  }
  function renderQuestJournal(){
    return dialog(closeButton+'<span class="eyebrow">MISSION JOURNAL</span><h2>신호는 목적지가 됩니다.</h2><p>수락한 임무, 다음 목적지, 선택의 결과를 확인하세요.</p>'+questCards()+'<div class="dialog-actions"><button class="primary-button" data-action="close-modal">지휘 화면으로 돌아가기</button></div>','wide');
  }
  function renderWorldMap(){
    const s=game.state,w=game.getWorldMap?.(),nodes=w?.nodes||[],pending=!!s.campaign?.pendingSectorChoice;
    if(s.campaign?.routeMode==='legacy'||!w||!nodes.length)return '<div class="legacy-route-note"><h3>이어가는 기존 항해</h3><p>이 저장은 기존 3섹터 항로를 유지합니다. 8섹터 월드와 신규 연속 퀘스트는 새 항해에서 시작합니다.</p></div>';
    const selected=nodes.find(n=>n.id===UI.selectedWorld),available=w.availableIds||[],current=nodes.find(n=>n.id===w.currentId);
    const xy=n=>({x:48+(n.depth-1)*126,y:68+([1,8].includes(n.depth)?1:n.lane??1)*88});
    const kinds={civilian:'민간',industrial:'산업',rebel:'반군',hostile:'적대',boarding:'강습',raider:'약탈선',mantis:'강습 함대',nebula:'성운',final:'최후 방어선'};
    const color=n=>n.color||(n.kind==='nebula'?'#b19ada':['rebel','hostile','boarding'].includes(n.kind)?'#e6a187':n.depth===8?'#efd8a8':'#8cd7c4');
    let svg='<defs><pattern id="world-stars" width="63" height="51" patternUnits="userSpaceOnUse"><circle cx="16" cy="23" r=".7" fill="#66889d" opacity=".35"/></pattern></defs><rect width="980" height="360" fill="url(#world-stars)"/>';
    for(let depth=1;depth<=8;depth++)svg+='<text class="world-depth" x="'+(48+(depth-1)*126)+'" y="27" text-anchor="middle">0'+depth+'</text>';
    for(const n of nodes){const a=xy(n);for(const id of n.links||[]){const d=nodes.find(v=>v.id===id);if(!d)continue;const b=xy(d),chosen=(w.route||[]).includes(n.id)&&(w.route||[]).includes(d.id);svg+='<path d="M'+a.x+' '+a.y+'L'+b.x+' '+b.y+'" stroke="'+(chosen?'#8de1cb':n.id===w.currentId?'#6e9997':'#2b3e4b')+'" stroke-width="'+(chosen?3:1.3)+'" fill="none" '+(chosen?'':'stroke-dasharray="4 5"')+'/>';}}
    for(const n of nodes){const a=xy(n),cur=n.id===w.currentId,reachable=available.includes(n.id),sel=n.id===UI.selectedWorld,c=color(n);svg+='<g data-world-node="'+n.id+'" data-focus="world-'+n.id+'" tabindex="0" role="button" aria-label="'+esc(n.name)+', 섹터 '+n.depth+', '+(cur?'현재 위치':reachable?'선택 가능한 항로':'항로 정보')+'" class="world-node '+(reachable?'reachable':'')+'">'+(cur||sel?'<circle cx="'+a.x+'" cy="'+a.y+'" r="26" stroke="'+c+'" fill="none" stroke-dasharray="3 5"/>':'')+'<circle cx="'+a.x+'" cy="'+a.y+'" r="17" fill="'+(cur?'#26534e':sel?'#354953':'#132330')+'" stroke="'+c+'" stroke-width="'+(cur||reachable?2:1)+'" opacity="'+(n.depth<s.sector&&!n.visited ? .65 : 1)+'"/><text x="'+a.x+'" y="'+(a.y+5)+'" text-anchor="middle" fill="'+c+'" font-size="16">'+(cur?'◆':n.visited?'✓':n.depth===8?'✦':n.kind==='nebula'?'☁':n.category==='hostile'?'×':'◇')+'</text><text x="'+a.x+'" y="'+(a.y+37)+'" text-anchor="middle" fill="'+c+'" font-size="10">'+esc([1,8].includes(n.depth)?n.name:(kinds[n.kind]||n.kind)+' 구역')+'</text></g>';}
    const active=selected||current,canAdvance=pending&&selected&&available.includes(selected.id);
    return '<div class="world-scroll"><svg class="world-map" viewBox="0 0 980 360" role="group" aria-label="8섹터 분기 월드 지도">'+svg+'</svg></div><div class="world-legend"><span><i class="civilian"></i>민간·교역</span><span><i class="hostile"></i>적대·강습</span><span><i class="nebula"></i>성운</span><span>이전 섹터로는 돌아갈 수 없습니다.</span></div><div class="map-detail"><div><strong>'+esc(active?.name||'항로를 선택하세요')+'</strong><p>'+esc(active?.description||((kinds[active?.kind]||active?.kind||'')+' 지역 · 사건과 적의 구성이 달라집니다.'))+'</p><p class="world-prompt">'+(pending?'출구에 도착했습니다. 연결된 다음 섹터를 선택하세요.':'현재 섹터의 출구에 도달하면 다음 지역으로 진입할 수 있습니다.')+'</p></div><button class="primary-button" data-action="advance-sector" '+(canAdvance?'':'disabled')+'>다음 섹터 진입 ↗</button></div>';
  }
  function renderLocalMap(escaping=false){
    const s=game.state,current=s.nodes.find(n=>n.id===s.currentNodeId),links=current?.links||[],selected=s.nodes.find(n=>n.id===UI.selectedNode);
    const maxCol=Math.max(4,...s.nodes.map(n=>n.col)),xy=n=>({x:55+n.col*870/maxCol,y:65+n.row*105});
    const fleet=game.getFleetInfo?.(selected?.id),front=fleet?55+fleet.frontCol*870/maxCol:-30,forecast=fleet?55+(fleet.frontCol+fleet.nextAdvance)*870/maxCol:-30;
    const status=selected?(game.getJumpStatus?.(selected.id,{escape:escaping})||{ok:links.includes(selected.id)&&!selected.visited,message:'연료 1 소비 · 반군 추격 진행'}):null;
    const canEngage=!escaping&&selected?.id===s.currentNodeId&&s.campaign?.finalStand?.bossNodeId===s.currentNodeId;
    const canJump=selected&&(canEngage||links.includes(selected.id))&&(status?.fuelCost===0||s.resources.fuel>0)&&(escaping?game.getEscapeStatus?.().ok!==false:status?.ok);
    let svg='<defs><pattern id="map-stars" width="47" height="43" patternUnits="userSpaceOnUse"><circle cx="12" cy="25" r=".7" fill="#638398" opacity=".35"/></pattern><linearGradient id="fleet-zone"><stop stop-color="#9c4033" stop-opacity=".35"/><stop offset="1" stop-color="#d77b5e" stop-opacity=".14"/></linearGradient></defs><rect width="980" height="365" fill="url(#map-stars)"/>';
    if(fleet&&!s.campaign?.finalStand){svg+='<rect width="'+Math.max(0,Math.min(980,front))+'" height="365" fill="url(#fleet-zone)"/>'+(front>0&&front<980?'<path d="M'+front+' 0V365" stroke="#dd9a79" stroke-width="2"/>':'')+(forecast>0&&forecast<980?'<path d="M'+forecast+' 0V365" stroke="#dd9a79" stroke-dasharray="4 6" opacity=".45"/>':'');}
    const drawn=new Set();
    for(const n of s.nodes){const a=xy(n);for(const id of n.links){const key=[n.id,id].sort().join('|');if(drawn.has(key))continue;drawn.add(key);const d=s.nodes.find(v=>v.id===id);if(!d)continue;const b=xy(d),active=n.id===s.currentNodeId||id===s.currentNodeId;svg+='<path d="M'+a.x+' '+a.y+'L'+b.x+' '+b.y+'" stroke="'+(active?'#5e8f90':'#2b4150')+'" stroke-width="'+(active?1.7:1)+'" '+(active?'':'stroke-dasharray="4 6"')+'/>';}}
    for(const n of s.nodes){const a=xy(n),reachable=links.includes(n.id),cur=n.id===s.currentNodeId,sel=n.id===UI.selectedNode,known=n.discovered!==false||n.visited||n.questId||['exit','boss','base'].includes(n.type)||reachable,quest=!!n.questId,c=n.occupied?'#e69b80':quest?'#b8acf0':cur?'#82e6dc':(n.type==='boss'||n.id===s.campaign?.finalStand?.bossNodeId)?'#e78e7d':n.type==='shop'&&known?'#d9bf84':reachable?'#a3c5cc':'#536e7f',label=n.id===s.campaign?.finalStand?.bossNodeId?'반군 기함':n.id===s.campaign?.finalStand?.baseNodeId?'연방 기지':cur?'현재 위치':quest?'퀘스트':known?n.label||nodeNames[n.type]:'미탐사';
      if(n.nebula)svg+='<ellipse cx="'+a.x+'" cy="'+a.y+'" rx="46" ry="33" fill="#826aa6" opacity=".13" pointer-events="none"/>';
      svg+='<g class="map-node" data-node="'+n.id+'" data-focus="node-'+n.id+'" tabindex="0" role="button" aria-label="'+esc((n.id===s.campaign?.finalStand?.bossNodeId?'반군 기함':n.id===s.campaign?.finalStand?.baseNodeId?'연방 기지':known?(n.label||nodeNames[n.type]||'비콘'):'미탐사 비콘')+(quest?' / 퀘스트':'')+(n.occupied?' / 반군 점령':''))+', '+(cur?'현재 위치':reachable?'도약 가능':'연결되지 않음')+'">'+(cur||sel?'<circle cx="'+a.x+'" cy="'+a.y+'" r="26" fill="none" stroke="'+c+'" stroke-dasharray="3 5"/>':'')+'<circle cx="'+a.x+'" cy="'+a.y+'" r="18" fill="'+(cur?'#1d4d4c':sel?'#27464d':n.occupied?'#412c29':'#111f2a')+'" stroke="'+c+'" stroke-width="'+(reachable||cur?2:1)+'"/><text x="'+a.x+'" y="'+(a.y+6)+'" text-anchor="middle" style="fill:'+c+';font-size:17px">'+(n.id===s.campaign?.finalStand?.bossNodeId?'◆':n.id===s.campaign?.finalStand?.baseNodeId?'✦':cur?'◆':n.occupied?'×':quest?'!':n.visited?'✓':known?nodeSymbols[n.type]||'◇':'?')+'</text><text x="'+a.x+'" y="'+(a.y+38)+'" text-anchor="middle" style="fill:'+c+';font-size:10px">'+esc(label.length>10?label.slice(0,9)+'…':label)+'</text></g>';
      const hazard=SW.DATA.environments?.[n.environment];if(hazard&&known)svg+='<text x="'+a.x+'" y="'+(a.y+53)+'" text-anchor="middle" class="map-hazard" pointer-events="none">'+esc(hazard.icon+' '+hazard.name)+'</text>';
    }
    const final=s.campaign?.finalStand,finalNote=final?'<div class="final-stand-status"><strong>최후 방어선 · 기함 '+(final.phase||s.bossPhase||1)+'단계</strong><span>기지 체류 '+(final.baseTurns||0)+' / '+(SW.DATA.campaignRules?.baseMaxTurns||3)+'턴 · 기함 위치를 따라 교전을 준비하세요.</span><button class="secondary-button" data-action="'+(final.bossNodeId===s.currentNodeId?'engage-flagship':'wait-final')+'">'+(final.bossNodeId===s.currentNodeId?'기함과 교전':'현 위치에서 대기')+'</button></div>':'';
    const hazard=SW.DATA.environments?.[selected?.environment];
    let note=canEngage?'현재 비콘의 기함과 교전합니다. 이동·연료 소비 없음.':selected?.id===s.currentNodeId?'현재 위치입니다.':canJump?'연료 1 · '+(status?.occupied?'반군 점령지 교전':selected.visited?'재방문 · 사건 보상은 반복되지 않습니다.':'새로운 비콘 탐사'):status?.message||'연결된 비콘을 선택하세요.';
    if(hazard)note+=' · '+hazard.name+': '+hazard.description;
    return finalNote+'<div class="local-map-scroll"><svg class="starmap expanded-map" viewBox="0 0 980 365" role="group" aria-label="섹터 항해 지도">'+svg+'</svg></div><div class="map-legend"><span>× 교전</span><span>₴ 교역</span><span>! 퀘스트</span><span>☁ 성운</span><span>↗ 출구</span><span class="pursuit-key">붉은 영역: 점령 / 점선: 다음 전선</span><b>연료 '+s.resources.fuel+'</b></div><div class="map-detail"><div><strong>'+esc(selected?.label||'연결된 항로를 선택하세요')+'</strong><p>'+esc(note)+'</p></div><div class="map-detail-actions">'+(!escaping?'<button class="secondary-button" data-action="open-equipment">장비·화물</button><button class="secondary-button" data-action="open-systems">시스템 설치</button>':'')+'<button class="primary-button '+(escaping?'orange':'')+'" data-action="'+(escaping?'escape-jump':'jump')+'" '+(!canJump?'disabled':'')+'>'+(canEngage?'기함 교전':escaping?'긴급 도약':'FTL 도약')+' ↗</button></div></div>'+(s.resources.fuel===0&&!escaping?'<div class="fuel-wait"><p>연료가 없습니다. 구조 신호를 보내면 추격이 진행됩니다.</p><button class="secondary-button" data-action="wait-fuel">구조 신호 보내기</button></div>':'');
  }
  function renderMap(){
    const s=game.state,escaping=UI.modal==='escape-map',w=game.getWorldMap?.(),region=w?.nodes?.find(n=>n.id===w.currentId),total=s.campaign?.totalSectors||3;
    const view=escaping?'local':UI.mapView;
    return dialog('<button class="dialog-close" data-action="'+(escaping?'close-modal':'close-map')+'" aria-label="함선으로 돌아가기">×</button><div class="map-heading"><div><span class="eyebrow">'+(escaping?'EMERGENCY FTL':'SECTOR NAVIGATION / EXPEDITION 07')+'</span><h2>'+esc(escaping?'탈출 목적지를 선택하세요':region?.name||(SW.DATA.sectorNames||[])[s.sector-1]||'섹터 '+s.sector)+'</h2></div><div class="map-meta">SECTOR '+String(s.sector).padStart(2,'0')+' / '+String(total).padStart(2,'0')+'<div class="sector-progress">'+Array.from({length:total},(_,i)=>'<i class="'+(i+1<=s.sector?'complete':'')+'"></i>').join('')+'</div></div></div>'+(escaping?'<p>연결된 비콘으로 실제 도약합니다. 적선에 남은 승무원은 함께 이동하지 못합니다.</p>':mapTabs(view))+(view==='world'?renderWorldMap():view==='quests'?questCards():renderLocalMap(escaping)),'navigation-dialog wide');
  }
  function renderShop(){
    const items=game.shopItems();return dialog('<div class="map-heading"><div><span class="eyebrow">ORBITAL TRADING POST</span><h2>잠시, 함선을 돌볼 시간.</h2></div><div class="shop-heading-tools"><span class="shop-balance">▧ '+game.state.resources.scrap+'</span><button class="secondary-button" data-action="open-equipment">장비·화물 / 판매</button><button class="secondary-button" data-action="open-systems">시스템 설치</button></div></div><p>보유한 스크랩으로 다음 교전을 준비하세요. 새 보조 시스템은 빈 베이에 설치되고 전력0으로 시작합니다. 시스템 설치 화면에서 위치·단계·전력 연결을 확인하세요.</p><div class="shop-grid">'+items.map(item=>'<div class="shop-item"><h3>'+esc(item.name)+'</h3><p>'+esc(item.description)+'</p>'+(Number.isFinite(item.stock)?'<span class="shop-stock">재고 '+item.stock+'</span>':'')+(item.reason?'<small class="shop-reason">'+esc(item.reason)+'</small>':'')+(item.destination?'<span class="shop-destination">'+(item.destination==='cargo'?'▣ 구매 시 화물칸으로':'⌖ 구매 시 장착 슬롯으로')+'</span>':'')+'<button class="secondary-button" data-buy="'+item.id+'" data-focus="buy-'+item.id+'" '+(item.disabled||game.state.resources.scrap<item.cost?'disabled':'')+'><span>'+ (item.stock===0?'품절':item.disabled?'구매 불가':'구매')+'</span><span>▧ '+item.cost+'</span></button></div>').join('')+'</div><div class="dialog-actions"><button class="primary-button" data-action="leave-shop">항해 계속 <span>↗</span></button></div>','wide');
  }

  document.addEventListener('pointerdown',()=>{UI.pointerDown=true;},{capture:true});
  document.addEventListener('click',()=>{UI.pointerDown=false;},{capture:true});
  const releasePointer=()=>setTimeout(()=>{UI.pointerDown=false;render();},0);
  document.addEventListener('pointerup',releasePointer,{capture:true});
  document.addEventListener('pointercancel',releasePointer,{capture:true});
  window.addEventListener('blur',()=>{UI.pointerDown=false;});
  document.addEventListener('click', ev=>{
    const target=ev.target;
    if(target.closest('.brand')){ev.preventDefault();return;}
    const viewMode=target.closest('button[data-render-mode]');if(viewMode){setVisualPreference('mode',viewMode.dataset.renderMode);return;}
    const style=target.closest('button[data-visual-style]');if(style){setVisualPreference('style',style.dataset.visualStyle);return;}
    const slotSelect=target.closest('[data-slot-select]');if(slotSelect){UI.selectedSlotId=slotSelect.dataset.slotSelect;modalSignature='';render();return;}
    const install=target.closest('[data-system-install]');if(install){if(resultMessage(game.installSystem(install.dataset.slotId,install.dataset.systemInstall)))save();modalSignature='';render();return;}
    const expand=target.closest('[data-slot-expand]');if(expand){if(resultMessage(game.expandSystemSlot(expand.dataset.slotExpand)))save();modalSignature='';render();return;}
    const upgrade=target.closest('[data-system-upgrade]');if(upgrade){if(resultMessage(game.upgradeSystem(upgrade.dataset.systemUpgrade)))save();modalSignature='';render();return;}
    const attack=target.closest('[data-attack-crew]');if(attack){attackSelected(attack.dataset.attackCrew);return;}
    const crewPick=target.closest('[data-crew-pick],[data-hostile-crew]');if(crewPick){commandCrew(crewPick.dataset.crewPick||crewPick.dataset.hostileCrew,ev.shiftKey);return;}
    const tile=target.closest('[data-tile]');if(tile){commandTile(tile.dataset.side,tile.dataset.roomId,Number(tile.dataset.tileX),Number(tile.dataset.tileY));return;}
    const loadout=target.closest('[data-loadout]');if(loadout){if(loadout.dataset.loadout===game.state.loadoutId)return;if(resultMessage(game.configureRun(loadout.dataset.loadout,game.state.difficulty))){clearSelection();UI.selectedNode=null;modalSignature='';render();sound();}return;}
    const difficulty=target.closest('[data-difficulty]');if(difficulty){if(difficulty.dataset.difficulty===game.state.difficulty)return;if(resultMessage(game.configureRun(game.state.loadoutId,difficulty.dataset.difficulty))){clearSelection();UI.selectedNode=null;modalSignature='';render();sound();}return;}
    const skillCrew=target.closest('[data-skill-crew]');if(skillCrew){UI.skillCrewId=skillCrew.dataset.skillCrew;modalSignature='';render();return;}
    const equipment=target.closest('[data-equipment]');if(equipment){handleEquipment(equipment);return;}
    const salvage=target.closest('[data-salvage]');if(salvage){if(resultMessage(game.resolveSalvage(salvage.dataset.salvage)))save();modalSignature='';render();sound('win');return;}
    const door=target.closest('[data-door]');if(door){order(()=>game.toggleDoor(door.dataset.door));return;}
    const cancelWeapon=target.closest('[data-weapon-cancel]');if(cancelWeapon){order(()=>game.cancelWeaponOrder(cancelWeapon.dataset.weaponCancel));return;}
    const ability=target.closest('[data-ability]');if(ability){if(ability.dataset.ability==='hacking')useHacking();else if(ability.dataset.ability==='mind')useMind();else order(()=>game.activateBattery());return;}
    const mindTarget=target.closest('[data-mind-target]');if(mindTarget){if(resultMessage(game.activateMindControl(mindTarget.dataset.mindTarget)))clearSelection();render();return;}
    const wt=target.closest('[data-weapon-toggle]');if(wt){order(()=>game.toggleWeapon(wt.dataset.weaponToggle));return;}
    const wa=target.closest('[data-weapon-auto]');if(wa){const w=game.state.player.weapons.find(w=>w.id===wa.dataset.weaponAuto);if(w)order(()=>game.setWeaponAuto(w.id,w.fireMode==='manual'));return;}
    const wf=target.closest('[data-weapon-fire]');if(wf){order(()=>game.fireWeapon(wf.dataset.weaponFire));return;}
    const drone=target.closest('[data-drone]');if(drone){order(()=>game.toggleDrone(drone.dataset.drone));return;}
    const power=target.closest('[data-power]');if(power){order(()=>game.allocatePower(power.dataset.power,Number(power.dataset.delta)));return;}
    const crew=target.closest('[data-crew-select],[data-crew]');if(crew){chooseCrew(crew.dataset.crewSelect||crew.dataset.crew,ev.shiftKey);return;}
    const room=target.closest('[data-room]');if(room){commandRoom(room.dataset.side,room.dataset.room);return;}
    const weapon=target.closest('[data-weapon-select]');if(weapon){chooseWeapon(weapon.dataset.weaponSelect);return;}
    const mapView=target.closest('[data-map-view]');if(mapView){UI.mapView=mapView.dataset.mapView;modalSignature='';render();return;}
    const worldNode=target.closest('[data-world-node]');if(worldNode){UI.selectedWorld=worldNode.dataset.worldNode;modalSignature='';render();return;}
    const questNode=target.closest('[data-quest-node]');if(questNode){UI.mapView='local';UI.selectedNode=questNode.dataset.questNode;if(UI.modal==='quests'){closeManualModal();if(game.state.mode==='map')UI.hideMap=false;else{toast('이 퀘스트의 목적지는 현재 섹터 지도에 표시되어 있습니다. 현재 조우를 마치고 지도를 여세요.');}}modalSignature='';render();return;}
    const node=target.closest('[data-node]');if(node){UI.selectedNode=node.dataset.node;render();sound();return;}
    const choice=target.closest('[data-choice]');if(choice){resultMessage(game.chooseEvent(choice.dataset.choice));modalSignature='';render();save();sound();return;}
    const buy=target.closest('[data-buy]');if(buy){const r=game.buy(buy.dataset.buy);if(resultMessage(r,'스크랩이나 구매 조건을 확인하세요.')){sound('win');toast('구매 완료. 함선 상태가 갱신되었습니다.');}modalSignature='';render();save();return;}
    const layoutSide=target.closest('[data-layout-side]')?.dataset.layoutSide;if(layoutSide){UI.layoutSide=layoutSide;modalSignature='';render();return;}
    const action=target.closest('[data-action]')?.dataset.action;
    if(action==='export-save')exportSave();
    if(action==='pick-save')$('save-file-input').click();
    if(action==='import-save')importSave();
    if(action==='export-backup'){try{const backup=localStorage.getItem(STORE+'-import-backup');if(backup)downloadSave(backup,'STARWARD_Import_Backup.json');else toast('아직 파일을 가져온 기록이 없습니다.');}catch(_){toast('복구용 사본을 읽을 수 없습니다.');}}
    if(action==='wait-final'){order(()=>game.waitAtBeacon());modalSignature='';render();save();}
    if(action==='engage-flagship'){order(()=>game.engageFlagship());modalSignature='';render();save();}
    if(action==='cancel-target'){clearSelection();render();}
    if(action==='advance-sector'){if(resultMessage(game.advanceSector(UI.selectedWorld))){UI.selectedWorld=null;UI.selectedNode=null;UI.mapView='local';UI.hideMap=false;save();}modalSignature='';render();}
    if(action==='escape-jump'&&UI.selectedNode){const r=game.escapeTo(UI.selectedNode);if(resultMessage(r)){UI.modal=null;UI.resumeAfterModal=false;UI.selectedNode=null;UI.hideMap=false;clearSelection();save();}modalSignature='';render();}
    if(action==='wait-fuel'){order(()=>game.waitForFuel());modalSignature='';render();save();}
    if(action==='start-run')startRun();
    if(action==='load')loadSaved();
    if(action==='close-modal')closeManualModal();
    if(action==='close-map'){UI.hideMap=true;modalSignature='';render();}
    if(action==='confirm-restart')newRun();
    if(action==='open-equipment')openManualModal('equipment');
    if(action==='open-systems')openSystems();
    if(action==='continue-reward'){UI.selectedNode=null;resultMessage(game.continueReward());modalSignature='';render();save();sound('win');}
    if(action==='jump'){if(UI.selectedNode){UI.modal=null;resultMessage(game.jump(UI.selectedNode),'해당 비컨으로 도약할 수 없습니다.');UI.selectedNode=null;modalSignature='';render();save();sound();}}
    if(action==='leave-shop'){game.leaveShop();UI.selectedNode=null;modalSignature='';render();save();}
  });
  $('pause-btn').addEventListener('click',()=>{if(game.state.mode==='combat'){game.togglePause();render();sound();}});
  $('speed-btn').addEventListener('click',()=>{game.setSpeed(game.state.speed===2?1:2);render();});
  $('vent-btn').addEventListener('click',()=>{game.toggleVent();render();toast(game.state.player.venting?'전체 환기: 통로와 에어록이 열렸습니다. 진압 후 봉쇄하세요.':'문을 봉쇄했습니다. 산소 시스템이 작동하면 회복합니다.');});
  $('escape-btn').addEventListener('click',()=>{if(game.state.campaign?.routeMode==='legacy'){order(()=>game.escape());save();return;}UI.selectedNode=null;openManualModal('escape-map');});
  $('doors-btn').addEventListener('click',()=>{UI.doorsOpen=!UI.doorsOpen;render();});
  $('open-doors-btn').addEventListener('click',()=>{order(()=>game.setDoors(true,false));toast('내부 통로를 열었습니다. 에어록 상태는 격실 문에서 확인하세요.');});
  $('seal-btn').addEventListener('click',()=>{order(()=>game.sealShip());toast('정상 문과 에어록을 봉쇄했습니다.');});
  $('multi-btn').addEventListener('click',()=>{UI.multiSelect=!UI.multiSelect;render();});
  $('stage-btn').addEventListener('click',()=>{order(()=>game.stageTeleport(selectedCrew().map(c=>c.id)));});
  $('board-btn').addEventListener('click',()=>{UI.intent=UI.intent==='boarding'?'crew':'boarding';UI.selectedWeapon=null;UI.beamStart=null;render();if(UI.intent==='boarding')toast('적 함선에서 침투할 방을 선택하세요.');});
  $('recall-btn').addEventListener('click',()=>{const crew=selectedCrew().filter(c=>c.shipId==='enemy');if(crew.length&&new Set(crew.map(c=>c.roomId)).size===1){order(()=>game.recallCrew(crew.map(c=>c.id)));return;}clearSelection();UI.intent='recall';render();toast('귀환할 아군이 모여 있는 적 방을 선택하세요.');});
  $('weapons-tab').addEventListener('click',()=>{UI.arsenal='weapons';render();});
  $('drones-tab').addEventListener('click',()=>{UI.arsenal='drones';render();});
  $('volley-btn').addEventListener('click',()=>order(()=>game.fireAllReady()));
  $('skills-btn').addEventListener('click',()=>{UI.skillCrewId=UI.selectedCrew||game.state.player.crew.find(c=>c.hp>0)?.id;openManualModal('skills');});
  $('history-btn').addEventListener('click',()=>openManualModal('log'));
  $('journal-btn').addEventListener('click',()=>openManualModal('quests'));
  $('fire-resume-btn').addEventListener('click',()=>{if(game.state.mode==='combat'){game.setPaused(false);render();sound();}});
  $('cloak-btn').addEventListener('click',()=>order(()=>game.activateCloak()));
  $('files-btn').addEventListener('click',()=>{UI.importCandidate=null;UI.importError=null;openManualModal('files');});
  $('save-file-input').addEventListener('change',async ev=>{
    const file=ev.target.files?.[0];ev.target.value='';if(!file)return;
    UI.importCandidate=null;UI.importError=null;
    try{if(file.size>3000000)throw new Error('저장 파일 크기가 너무 큽니다. 3MB 이하 JSON 파일을 선택하세요.');const value=await file.text(),probe=new SW.Game();if(!probe.load(value))throw new Error('손상되었거나 지원하지 않는 STARWARD 저장 파일입니다.');UI.importCandidate={name:file.name,value:probe.serialize(),state:probe.state};}
    catch(error){UI.importError=error.message||'파일을 읽을 수 없습니다.';}
    modalSignature='';render();
  });
  $('help-btn').addEventListener('click',()=>openManualModal('help'));
  $('restart-btn').addEventListener('click',()=>openManualModal('restart'));
  $('save-btn').addEventListener('click',()=>save(true));
  $('load-btn').addEventListener('click',loadSaved);
  $('map-btn').addEventListener('click',()=>{if(game.state.mode==='map'){UI.hideMap=false;modalSignature='';render();}else if(!['combat','briefing','victory','defeat'].includes(game.state.mode))toast('현재 비컨의 선택을 마친 뒤 항해할 수 있습니다.');});
  $('stations-btn').addEventListener('click',()=>order(()=>game.returnStations()));
  $('save-stations-btn').addEventListener('click',()=>{order(()=>game.saveStations());if(game.state.mode!=='briefing')save();});
  for(const side of ['player','enemy'])$(side+'-layout-btn').addEventListener('click',()=>{UI.layoutSide=side;openManualModal('layout');});
  $('equipment-btn').addEventListener('click',()=>openManualModal('equipment'));
  $('systems-btn').addEventListener('click',()=>openSystems());
  $('camera-reset-btn').addEventListener('click',()=>renderer3d?.resetCamera?.());
  $('sound-btn').addEventListener('click',()=>{UI.sound=!UI.sound;$('sound-btn').classList.toggle('active',UI.sound);$('sound-btn').setAttribute('aria-label',UI.sound?'소리 끄기':'소리 켜기');$('sound-btn').title=UI.sound?'소리 끄기':'소리 켜기';sound();});
  if(location.protocol==='file:'){$('source-btn').hidden=true;$('download-btn').hidden=true;}
  document.addEventListener('keydown',e=>{
    if(e.target?.closest('input,textarea,select,[contenteditable="true"]'))return;
    if(e.key==='Tab'&&!$('modal').hidden){const focusable=[...$('modal').querySelectorAll('button:not(:disabled),[tabindex="0"]')];const first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}return;}
    if(e.key==='Escape'){if(UI.modal){closeManualModal();}else if(game.state.mode==='map'&&!UI.hideMap){UI.hideMap=true;modalSignature='';render();}else{clearSelection();render();}return;}
    // Space belongs to the battle clock, even after a weapon/power/button click.
    if(e.code==='Space'&&$('modal').hidden&&game.state.mode==='combat'){e.preventDefault();if(!e.repeat){game.togglePause();render();sound();}return;}
    if((e.key==='Enter'||e.key===' ')&&document.activeElement?.matches('[data-tile],[data-crew-pick],[data-room],[data-crew],[data-node],[data-world-node],[data-door],[data-mind-target]:not(button)')){e.preventDefault();document.activeElement.dispatchEvent(new MouseEvent('click',{bubbles:true,shiftKey:e.shiftKey}));return;}
    if(e.key==='?'&&!UI.modal){e.preventDefault();openManualModal('help');return;}
    if(!$('modal').hidden||e.repeat)return;
    const key=e.key.toLowerCase();
    if(game.state.mode==='combat'){
      if(key==='c'){e.preventDefault();order(()=>game.activateCloak());}
      if(key==='f'){e.preventDefault();order(()=>game.fireAllReady());}
      if(key==='h'){e.preventDefault();useHacking();}
      if(key==='m'){e.preventDefault();useMind();}
      if(key==='b'){e.preventDefault();order(()=>game.activateBattery());}
    }
    if(/^[1-4]$/.test(e.key)){const w=game.state.player.weapons[Number(e.key)-1];if(w)chooseWeapon(w.id);}
  });
  document.addEventListener('keyup',e=>{if(e.code==='Space'&&$('modal').hidden&&game.state.mode==='combat'&&!e.target?.closest('input,textarea,select'))e.preventDefault();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&game.state.mode==='combat'){game.setPaused(true);save();render();}});
  window.addEventListener('beforeunload',()=>{if(game.state.mode!=='briefing')save();});
  window.addEventListener('resize',()=>{renderer3d?.resize?.();renderEffects();});
  function frame(ts){
    const dt=lastFrame?Math.min(.1,(ts-lastFrame)/1000):0;lastFrame=ts;
    if(!document.hidden){game.tick(dt);if(UI.renderMode==='3d'&&renderer3d?.supported)renderer3d.render(game,UI);}drawClock+=dt;saveClock+=dt;
    if(drawClock>=.1){drawClock=0;render();}
    if(saveClock>=15){saveClock=0;if(game.state.mode==='combat')save();}
    requestAnimationFrame(frame);
  }
  UI.render=render;UI.toast=toast;UI.save=save;UI.load=loadSaved;
  render();requestAnimationFrame(frame);
})();
