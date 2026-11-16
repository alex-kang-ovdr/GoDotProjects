(() => {
  'use strict';
  const SW = globalThis.Starward;
  const game = globalThis.game = new SW.Game();
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pct = (n,d=100) => Math.max(0, Math.min(100, (Number(n)||0)/(Number(d)||1)*100));
  const round = n => Math.round(Number(n)||0);
  const STORE = 'starward-save-v1';
  const UI = globalThis.StarwardUI = {selectedCrew:null,selectedCrewIds:[],selectedWeapon:null,selectedNode:null,modal:null,sound:false,lastMode:'',toastTimer:null,autoSaveError:false,multiSelect:false,intent:null,beamStart:null,arsenal:'weapons',doorsOpen:false,importCandidate:null,skillCrewId:null,swapCargoId:null,discardCargoId:null,layoutSide:'player'};
  const icons = {engines:'⋙',shields:'⬡',weapons:'⌖',bridge:'◈',oxygen:'◉',medbay:'✚',drones:'⌘',teleporter:'↗',cloaking:'◌'};
  const sysNames = {engines:'엔진',shields:'실드',weapons:'무기',bridge:'조타실',oxygen:'산소실',medbay:'의료실',drones:'드론',teleporter:'텔레포터',cloaking:'은폐'};
  const nodeNames = {combat:'교전',event:'미확인 신호',shop:'교역소',repair:'구조 신호',exit:'섹터 출구',boss:'반군 기함',start:'출발 지점'};
  const nodeSymbols = {combat:'×',event:'?',shop:'₴',repair:'+',exit:'↗',boss:'◆',start:'◇'};
  const skillNames = {piloting:'조타',engines:'엔진',weapons:'무기',shields:'실드',repair:'정비',combat:'근접전'};
  const speciesNames = {human:'인간',engi:'엔지',rock:'록',mantis:'맨티스'};
  let toastId = 0, audioContext, lastFrame = 0, drawClock = 0, saveClock = 0, lastSoundLog = 0, autoSaveMode = '', modalSignature = '', returnFocus;

  function patch(el, html) {
    if (!el || el.innerHTML === html) return;
    const focus = el.contains(document.activeElement) ? document.activeElement?.getAttribute('data-focus') : null;
    el.innerHTML = html;
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
  function clearSelection() {UI.selectedCrew=null;UI.selectedCrewIds=[];UI.selectedWeapon=null;UI.intent=null;UI.beamStart=null;}
  function selectedCrew() {return game.state.player.crew.filter(c=>c.hp>0&&UI.selectedCrewIds.includes(c.id));}
  function physicalCrew(side) {return game.getCrewOnShip?game.getCrewOnShip(side):(game.state[side]?.crew||[]).filter(c=>c.hp>0);}
  function chooseCrew(id, additive=false) {
    const crew=game.state.player.crew.find(c=>c.id===id&&c.hp>0);if(!crew)return;
    if(additive||UI.multiSelect){UI.selectedCrewIds=UI.selectedCrewIds.includes(id)?UI.selectedCrewIds.filter(x=>x!==id):[...UI.selectedCrewIds,id];}
    else UI.selectedCrewIds=UI.selectedCrewIds.length===1&&UI.selectedCrewIds[0]===id?[]:[id];
    UI.selectedCrew=UI.selectedCrewIds[0]||null;UI.selectedWeapon=null;UI.beamStart=null;UI.intent=UI.selectedCrew?'crew':null;render();sound();
  }
  function chooseWeapon(id) {clearSelection();UI.selectedWeapon=id;UI.intent='weapon';UI.arsenal='weapons';render();sound();}
  function commandRoom(side,roomId) {
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
        if(!UI.beamStart){UI.beamStart=roomId;toast('빔 시작점: '+roomName(roomId)+' · 끝 방을 선택하세요.');render();return;}
        const r=game.targetBeam(w.id,UI.beamStart,roomId);if(resultMessage(r)){UI.beamStart=null;toast('빔 경로 지정 · '+(w.targetRooms?.length||1)+'개 방');}render();sound();return;
      }
      if(resultMessage(game.targetWeapon(w.id,roomId)))toast(w.name+' → '+roomName(roomId)+(w.fireMode==='manual'?' · 수동 사격 대기':' · 자동 사격'));
      render();sound();return;
    }
    toast(side==='enemy'?'무기를 선택해 조준하거나, 승무원을 선택해 침투하세요.':'승무원을 선택하고 이동할 방을 누르세요.');
  }
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
    clearSelection();UI.selectedNode=null;UI.modal=null;UI.importCandidate=null;modalSignature='';render();
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
  function blueprintSvg(layout,color,key,doors=layout.doors,labels=true) {
    const {ox,oy,cell,outline}=layoutMetrics(layout);
    const point=([x,y])=>(ox+x*cell).toFixed(1)+','+(oy+y*cell).toFixed(1);
    let svg='<svg class="layout-blueprint" viewBox="0 0 600 340" role="img" aria-label="'+esc(layout.name)+' 격실 배치"><defs><linearGradient id="blueprint-'+key+'" x1="0" y1="0" x2="1" y2="1"><stop stop-color="'+color+'" stop-opacity=".18"/><stop offset="1" stop-color="'+color+'" stop-opacity=".025"/></linearGradient></defs><polygon points="'+outline.map(point).join(' ')+'" fill="url(#blueprint-'+key+')" stroke="'+color+'" stroke-opacity=".55" stroke-width="1.4"/>';
    for(const r of layout.rooms){const x=ox+r.x*cell,y=oy+r.y*cell,w=r.w*cell,h=r.h*cell;svg+='<g><title>'+esc(r.name)+'</title><rect x="'+(x+3)+'" y="'+(y+3)+'" width="'+(w-6)+'" height="'+(h-6)+'" rx="3" fill="#10212d" stroke="'+color+'" stroke-opacity=".28"/><text x="'+(x+w/2)+'" y="'+(y+h/2+(labels?11:8))+'" text-anchor="middle" fill="'+color+'" font-size="'+(labels?26:32)+'" opacity=".55">'+(icons[r.id]||'◇')+'</text>'+(labels?'<text x="'+(x+w/2)+'" y="'+(y+20)+'" text-anchor="middle" fill="#c1d6dd" font-size="11">'+esc(roomName(r.id))+'</text>':'')+'</g>';}
    for(const d of doors||[]){const x=ox+d.x*cell,y=oy+d.y*cell,h=d.orientation==='horizontal',broken=Number.isFinite(d.hp)&&d.hp<=0,c=broken?'#eb8b77':d.open?'#81e5db':d.airlock?'#e0ae7b':'#8ba4af',len=Math.max(6,cell*.16);svg+='<g><title>'+esc((d.airlock?roomName(d.a)+' 에어록':roomName(d.a)+' ↔ '+roomName(d.b))+(broken?' · 파손':d.open?' · 열림':' · 닫힘'))+'</title><rect x="'+(x-(h?len:2.5))+'" y="'+(y-(h?2.5:len))+'" width="'+(h?len*2:5)+'" height="'+(h?5:len*2)+'" rx="1" fill="'+(d.open?'#0c1a24':c)+'" stroke="'+c+'" stroke-width="1.5"/>'+(d.airlock?'<circle cx="'+x+'" cy="'+y+'" r="'+(len+6)+'" fill="none" stroke="'+c+'" opacity=".4" stroke-dasharray="2 3"/>':'')+'</g>';}
    return svg+'</svg>';
  }
  function renderLayout() {
    const side=UI.layoutSide==='enemy'&&game.state.enemy?'enemy':'player',ship=game.state[side],layout=layoutData(ship),color=side==='enemy'?'#efad80':(SW.DATA.loadouts?.[game.state.loadoutId]?.accent||'#81e5db');
    const connections=ship.rooms.map(r=>{const neighbors=ship.doors.filter(d=>!d.airlock&&(d.a===r.id||d.b===r.id)).map(d=>roomName(d.a===r.id?d.b:d.a));const airlocks=ship.doors.filter(d=>d.airlock&&d.a===r.id).length;return '<div class="layout-room-row"><span class="layout-room-icon">'+(icons[r.id]||'◇')+'</span><strong>'+esc(roomName(r.id))+'</strong><span>'+esc(neighbors.join(' · '))+'</span>'+(airlocks?'<b>↗ 에어록 '+airlocks+'</b>':'')+'</div>';}).join('');
    return dialog(closeButton+'<span class="eyebrow">VESSEL SCHEMATICS / 05</span><div class="layout-dialog-heading"><div><h2>'+esc(ship.name)+'의 내부 구조</h2><p>'+esc(layout.name)+' · '+esc(layoutMeta(ship))+'</p></div><div class="layout-side-tabs" role="group" aria-label="도면 함선 선택"><button class="secondary-button '+(side==='player'?'active':'')+'" data-layout-side="player" aria-pressed="'+(side==='player')+'">본함</button>'+(game.state.enemy?'<button class="secondary-button '+(side==='enemy'?'active':'')+'" data-layout-side="enemy" aria-pressed="'+(side==='enemy')+'">적 함선</button>':'')+'</div></div><p class="layout-strategy">'+esc(layout.description)+'</p>'+(layout.id==='legacy'?'<p class="layout-legacy-note">이전 항해의 도면을 유지하고 있습니다. 새 항해에서는 선택한 함선의 고유 구조를 사용합니다.</p>':'')+'<div class="layout-inspection"><div class="layout-drawing">'+blueprintSvg(layout,color,'inspect-'+side,ship.doors)+'<div class="layout-legend"><span><i class="closed"></i> 닫힌 문</span><span><i class="open"></i> 열린 문</span><span><i class="airlock"></i> 외부 에어록</span></div></div><section class="layout-connections"><h3>실제로 연결된 통로</h3>'+connections+'</section></div><div class="layout-rule-notes"><p><b>이동</b> 승무원은 문을 통과합니다. 선택한 승무원의 점선은 남은 이동 경로이며, 문 파괴에 걸리는 시간은 남은 거리에 포함하지 않습니다.</p><p><b>격리</b> 닫힌 문은 산소와 화재의 확산을 차단합니다. 에어록은 외부 진공과 연결되므로 아군의 위치를 확인한 뒤 여세요.</p><p><b>설비 위치</b> 드론 관제는 무기실, 텔레포터는 의료실, 은폐 장비는 기관실에서 수리합니다.</p></div><div class="dialog-actions"><button class="primary-button" data-action="close-modal">지휘 화면으로 돌아가기</button></div>','layout-dialog wide');
  }
  function hullMarkup(ship) {
    if(!ship) return '<div class="hull-block"><div class="hull-head"><span>CONTACT LOST</span><strong>—</strong></div><div class="hull-segments">'+Array.from({length:20},()=>'<i></i>').join('')+'</div></div><div class="shield-block">SHIELDS<div class="shield-pips"><i class="empty"></i></div></div>';
    const segments = 30;
    const filled = Math.ceil(ship.hull/ship.maxHull*segments);
    return '<div class="hull-block"><div class="hull-head"><span>HULL INTEGRITY</span><strong>'+Math.max(0,round(ship.hull))+' <span>/ '+ship.maxHull+'</span></strong></div><div class="hull-segments '+(ship.hull/ship.maxHull<.35?'low':'')+'">'+Array.from({length:segments},(_,i)=>'<i class="'+(i<filled?'filled':'')+'"></i>').join('')+'</div></div><div class="shield-block">SHIELDS<div class="shield-pips">'+Array.from({length:Math.max(1,ship.maxShield||1)},(_,i)=>'<i class="'+(i<ship.shield?'full':'empty')+'"></i>').join('')+'</div></div>';
  }
  function shipSvg(ship, side) {
    const enemy=side==='enemy', s=game.state;
    const {ox,oy,cell,outline}=layoutMetrics(layoutData(ship));
    const color=enemy?'#db946d':(SW.DATA.loadouts?.[s.loadoutId]?.accent||'#7dd7ce');
    if(!ship) return '<defs><radialGradient id="emptyGlow"><stop stop-color="#284855"/><stop offset="1" stop-color="#0e1723" stop-opacity="0"/></radialGradient></defs><ellipse cx="300" cy="165" rx="190" ry="125" fill="url(#emptyGlow)"/><path d="M270 165h60m-30-30v60" stroke="#3c5969" stroke-width="1"/><circle cx="300" cy="165" r="47" fill="none" stroke="#334957" stroke-dasharray="3 7"/><text x="300" y="250" text-anchor="middle" class="empty-ship-label">항로가 열렸습니다</text>';
    let svg = '<defs><linearGradient id="hull-'+side+'" x1="0" y1="0" x2="1" y2="1"><stop stop-color="'+(enemy?'#41352f':'#284249')+'"/><stop offset=".55" stop-color="'+(enemy?'#28252a':'#1b2b36')+'"/><stop offset="1" stop-color="#12202a"/></linearGradient><pattern id="hatch-'+side+'" width="7" height="7" patternUnits="userSpaceOnUse"><path d="M0 7L7 0" stroke="'+color+'" stroke-opacity=".13"/></pattern></defs>';
    const hullPoints=outline.map(([x,y])=>(ox+x*cell).toFixed(1)+','+(oy+y*cell).toFixed(1)).join(' ');
    const hullXs=outline.map(p=>ox+p[0]*cell),hullYs=outline.map(p=>oy+p[1]*cell),left=Math.min(...hullXs),right=Math.max(...hullXs),top=Math.min(...hullYs),bottom=Math.max(...hullYs),midX=(left+right)/2,midY=(top+bottom)/2;
    if(ship.shield>0)svg+='<ellipse cx="'+midX+'" cy="'+midY+'" rx="'+Math.min(281,(right-left)/2+16)+'" ry="'+Math.min(157,(bottom-top)/2+15)+'" fill="none" stroke="'+(enemy?'#9ab0c5':'#8ac6e7')+'" stroke-width="1" opacity=".25"/><ellipse cx="'+midX+'" cy="'+midY+'" rx="'+Math.min(275,(right-left)/2+9)+'" ry="'+Math.min(151,(bottom-top)/2+9)+'" fill="none" stroke="'+color+'" stroke-width=".5" opacity=".15" stroke-dasharray="50 10 5 10"/>';
    svg+='<polygon points="'+hullPoints+'" fill="url(#hull-'+side+')" stroke="'+color+'" stroke-opacity=".5" stroke-width="1.5"/><polygon points="'+hullPoints+'" fill="url(#hatch-'+side+')" opacity=".6"/><polygon points="'+outline.map(([x,y])=>(midX+(ox+x*cell-midX)*.95).toFixed(1)+','+(midY+(oy+y*cell-midY)*.95).toFixed(1)).join(' ')+'" fill="none" stroke="'+color+'" stroke-opacity=".18"/>';
    const live=s.mode==='combat'&&!s.paused,engineRoom=ship.rooms.find(r=>r.id==='engines'),ex=ox+(engineRoom.x-.27)*cell,ey=oy+(engineRoom.y+engineRoom.h/2)*cell,flame=(live?.55+Math.sin(s.time*20)*.08:.3)*cell;
    svg+='<path d="M'+ex+' '+(ey-15)+'L'+(ex-flame)+' '+(ey-6)+'L'+ex+' '+(ey+3)+'ZM'+ex+' '+(ey+6)+'L'+(ex-flame*.9)+' '+(ey+15)+'L'+ex+' '+(ey+23)+'Z" fill="'+(enemy?'#f3a575':'#6fdadf')+'" opacity="'+(live?.7:.25)+'"/><rect x="'+(ex-1)+'" y="'+(ey-16)+'" width="9" height="20" rx="2" fill="#314651" stroke="#576d73"/><rect x="'+(ex-1)+'" y="'+(ey+5)+'" width="9" height="20" rx="2" fill="#314651" stroke="#576d73"/>';
    for(const room of ship.rooms) {
      const sys=ship.systems[room.id];const x=ox+room.x*cell,y=oy+room.y*cell,w=room.w*cell,h=room.h*cell;
      const aiming=enemy&&UI.selectedWeapon, crew= !enemy&&UI.selectedCrew;
      const targeted=enemy&&s.player.weapons.some(v=>(v.target===room.id||v.targetRooms?.includes(room.id))&&v.enabled);
      const selected=selectedCrew().some(c=>(c.shipId||'player')===side&&c.targetRoomId===room.id)||(enemy&&UI.beamStart===room.id);
      const danger=room.oxygen<25||room.fire>0||sys?.damage>0;
      let fill=room.fire>0?'#442e25':room.oxygen<25?'#352b38':sys?.ionTimer>0?'#203b57':'#152935';
      if(enemy)fill=room.fire>0?'#503024':room.oxygen<25?'#302331':sys?.ionTimer>0?'#25344b':'#2c2a2a';
      svg+='<g data-room="'+room.id+'" data-side="'+side+'" data-focus="room-'+side+'-'+room.id+'" role="button" tabindex="0" aria-label="'+esc((enemy?'적 ':'')+room.name+', 산소 '+round(room.oxygen)+'%, 시스템 손상 '+(sys?.damage||0))+'"><title>'+esc(room.name+' · 산소 '+round(room.oxygen)+'% · '+(sys?.damage?'손상 '+sys.damage:'정상')+(room.fire?' · 화재':'')+(room.breach?' · 선체 균열':''))+'</title><rect class="room-fill" x="'+(x+3)+'" y="'+(y+3)+'" width="'+(w-6)+'" height="'+(h-6)+'" rx="3" fill="'+fill+'" stroke="'+(selected?'#81e5db':sys?.ionTimer>0?'#86b8f2':danger?'#7f574c':enemy?'#645044':'#425e68')+'" stroke-width="'+(selected?2:1)+'"/>';
      for(let i=1;i<room.w;i++)svg+='<path d="M'+(x+i*cell)+' '+(y+6)+'v'+(h-12)+'" stroke="'+(enemy?'#b99c81':'#8caab9')+'" opacity=".06"/>';
      for(let i=1;i<room.h;i++)svg+='<path d="M'+(x+6)+' '+(y+i*cell)+'h'+(w-12)+'" stroke="'+(enemy?'#b99c81':'#8caab9')+'" opacity=".06"/>';
      svg+='<text class="room-name" x="'+(x+w/2)+'" y="'+(y+20)+'" text-anchor="middle">'+esc(sysNames[room.id]||room.name)+'</text><text x="'+(x+w/2)+'" y="'+(y+h/2+6)+'" text-anchor="middle" fill="'+(enemy?'#715b4f':'#41626e')+'" font-size="29" font-family="monospace" opacity=".7">'+(icons[room.id]||'◇')+'</text>';
      svg+='<text class="room-level" x="'+(x+10)+'" y="'+(y+h-9)+'">'+(sys?.ionTimer>0?'ION '+sys.ionTimer.toFixed(1)+'s':sys?.damage?'DMG '+sys.damage:room.id==='bridge'?'NAV':(sys?.power||0)+' / '+(sys?.level||1))+'</text>';
      if(room.oxygen<50)svg+='<text x="'+(x+w-8)+'" y="'+(y+h-9)+'" text-anchor="end" fill="#dc7d93" font-size="8">O₂ '+round(room.oxygen)+'</text>';
      if(room.fire>0)svg+='<path d="M'+(x+w-20)+' '+(y+23)+'q-10-8 0-18q-1 8 5 10q5-5 3-10q15 17-1 21Z" fill="#f6a165" opacity="'+(.7+Math.sin(s.time*9)*.2)+'"/>';
      if(room.breach)svg+='<path d="M'+(x+12)+' '+(y+32)+'l8-10 -3 10 9 4 -9 5 3 10 -9-5 -6 6 1-13 -7-5Z" fill="#08111b" stroke="#c08192" stroke-width="1"/>';
      if(sys?.damage)svg+='<path class="room-damage-line" d="M'+(x+w-17)+' '+(y+h-13)+'l7-7m-7 0l7 7"/>';
      if(targeted)svg+='<g stroke="#f6af78" fill="none" stroke-width="1.5" opacity=".9"><path d="M'+(x+7)+' '+(y+17)+'v-10h10M'+(x+w-17)+' '+(y+7)+'h10v10M'+(x+7)+' '+(y+h-17)+'v10h10M'+(x+w-17)+' '+(y+h-7)+'h10v-10"/></g>';
      svg+='</g>';
    }
    for(const d of ship.doors||[]) {
      const dx=ox+d.x*cell,dy=oy+d.y*cell,h=d.orientation==='horizontal',broken=d.hp<=0;
      const dc=broken?'#e9907c':d.open?'#81e5db':d.airlock?'#dda375':'#718e9b';
      const label=(d.airlock?roomName(d.a)+' 에어록':roomName(d.a)+' ↔ '+roomName(d.b))+' · '+(broken?'파손':d.open?'열림':'닫힘');
      svg+='<g class="door '+(d.open?'open':'')+'" '+(!enemy?'data-door="'+d.id+'" data-focus="door-'+d.id+'" role="button" tabindex="0" aria-label="'+esc(label)+'" aria-pressed="'+d.open+'"':'pointer-events="none"')+'><title>'+esc(label)+'</title>';
      if(!enemy)svg+='<rect x="'+(dx-(h?15:10))+'" y="'+(dy-(h?10:15))+'" width="'+(h?30:20)+'" height="'+(h?20:30)+'" fill="transparent"/>';
      svg+='<rect x="'+(dx-(h?10:3))+'" y="'+(dy-(h?3:10))+'" width="'+(h?20:6)+'" height="'+(h?6:20)+'" rx="1" fill="'+(d.open?'#0b1721':dc)+'" stroke="'+dc+'" stroke-width="1.5"/>';
      if(d.open)svg+='<path d="M'+(dx-(h?5:0))+' '+(dy-(h?0:5))+'l'+(h?10:0)+' '+(h?0:10)+'" stroke="'+dc+'" stroke-width="1" stroke-dasharray="2 3"/>';
      if(d.airlock)svg+='<text x="'+(dx+(h?18:-13))+'" y="'+(dy+3)+'" text-anchor="middle" fill="'+dc+'" font-size="9">↗</text>';
      svg+='</g>';
    }
    const localCrew=physicalCrew(side),ownIds=new Set(s.player.crew.map(c=>c.id));
    for(const c of localCrew) {
      const friendly=ownIds.has(c.id),r=ship.rooms.find(r=>r.id===c.roomId)||ship.rooms[0];
      let cx=ox+(Number.isFinite(c.x)?c.x:r.x+r.w/2)*cell,cy=oy+(Number.isFinite(c.y)?c.y:r.y+r.h/2)*cell;
      const peers=localCrew.filter(d=>d.roomId===c.roomId&&!d.targetRoomId),idx=peers.findIndex(p=>p.id===c.id);
      if(peers.length>1&&!c.targetRoomId)cx+=(idx-(peers.length-1)/2)*15;
      const selected=UI.selectedCrewIds.includes(c.id)&&friendly;
      const ccolor=!friendly?'#f48b7d':c.species==='engi'?'#d9c994':c.species==='rock'?'#c6aceb':c.species==='mantis'?'#b0d888':'#a8e3d5';
      svg+='<g class="crew-sprite" '+(friendly?'data-crew="'+c.id+'" data-focus="sprite-'+c.id+'" role="button" tabindex="0" aria-label="'+esc(c.name)+' 선택"':'pointer-events="none"')+'><title>'+esc(c.name+' · '+round(c.hp)+' HP · '+(friendly?'아군':'적군')+' · '+(c.task||roomName(c.roomId)))+'</title>';
      if(selected)svg+='<circle cx="'+cx+'" cy="'+cy+'" r="14" fill="none" stroke="#81e5db" stroke-width="1.5" stroke-dasharray="4 3"/>';
      if(friendly&&enemy)svg+='<circle cx="'+cx+'" cy="'+cy+'" r="17" fill="none" stroke="#81e5db" opacity=".35"/>';
      if(!friendly&&!enemy)svg+='<path d="M'+(cx-12)+' '+(cy-12)+'h24v26h-24z" fill="none" stroke="#f48b7d" stroke-width="1" stroke-dasharray="3 3"/>';
      if(c.targetRoomId&&friendly&&selected){const route=game.getCrewRoute?.(c.id),points=route?.points||[];if(points.length>1){const end=points.at(-1);svg+='<path class="crew-route-path" d="'+points.map((p,i)=>(i?'L':'M')+(ox+p.x*cell).toFixed(1)+' '+(oy+p.y*cell).toFixed(1)).join(' ')+'" stroke="#81e5db" stroke-width="2" stroke-dasharray="4 4" fill="none" opacity=".8" pointer-events="none"/><circle cx="'+(ox+end.x*cell)+'" cy="'+(oy+end.y*cell)+'" r="7" fill="none" stroke="#81e5db" opacity=".7" pointer-events="none"/>';}}
      svg+='<circle cx="'+cx+'" cy="'+(cy-4)+'" r="4.4" fill="'+ccolor+'" stroke="#0b1c24" stroke-width="1.3"/><path d="M'+(cx-5)+' '+(cy+1)+'h10v8h-3v-4h-4v4h-3Z" fill="'+ccolor+'" stroke="#0b1c24" stroke-width=".7"/><rect x="'+(cx-7)+'" y="'+(cy+14)+'" width="14" height="2" fill="#14202a"/><rect x="'+(cx-7)+'" y="'+(cy+14)+'" width="'+(14*pct(c.hp,c.maxHp)/100)+'" height="2" fill="'+ccolor+'"/></g>';
    }
    if(enemy){
      const beam=s.player.weapons.find(w=>w.id===UI.selectedWeapon&&w.type==='beam');
      if(beam){const a=ship.rooms.find(r=>r.id===(UI.beamStart||beam.beamFrom)),b=ship.rooms.find(r=>r.id===beam.beamTo);if(a){const ax=ox+(a.x+a.w/2)*cell,ay=oy+(a.y+a.h/2)*cell;svg+='<circle cx="'+ax+'" cy="'+ay+'" r="12" fill="none" stroke="#ffe2a1" stroke-dasharray="2 3" pointer-events="none"/>';if(b&&!UI.beamStart){let bx=ox+(b.x+b.w/2)*cell,by=oy+(b.y+b.h/2)*cell;const len=Math.hypot(bx-ax,by-ay),max=(beam.beamLength||4)*cell;if(len>max){bx=ax+(bx-ax)*max/len;by=ay+(by-ay)*max/len;}svg+='<path d="M'+ax+' '+ay+'L'+bx+' '+by+'" stroke="#ffe2a1" stroke-width="3" opacity=".8" stroke-dasharray="5 4" pointer-events="none"/>';}}}
    }
    for(const projectile of s.projectiles||[]){
      if(projectile.weaponType!=='beam'||projectile.from===side||!projectile.beamStart||!projectile.beamEnd)continue;
      const a=projectile.beamStart,b=projectile.beamEnd;
      svg+='<path d="M'+(ox+a.x*cell)+' '+(oy+a.y*cell)+'L'+(ox+b.x*cell)+' '+(oy+b.y*cell)+'" stroke="#fff0bb" stroke-width="5" stroke-linecap="round" opacity="'+(.35+.55*(projectile.progress||0))+'" pointer-events="none"/>';
    }
    for(const ef of s.effects||[]){if(ef.ship!==side)continue;const r=ship.rooms.find(r=>r.id===ef.roomId);if(!r)continue;const cx=ox+(r.x+r.w/2)*cell,cy=oy+(r.y+r.h/2)*cell;const hit=ef.type==='hit'||ef.type==='fire';svg+='<circle cx="'+cx+'" cy="'+cy+'" r="'+(12+(1-Math.min(1,ef.ttl))*28)+'" fill="none" stroke="'+(hit?'#f5ac7b':'#98e0e2')+'" opacity="'+Math.min(.9,ef.ttl)+'" stroke-width="2"/>';if(ef.text)svg+='<text x="'+cx+'" y="'+(cy-28)+'" text-anchor="middle" fill="#f6c08a" font-family="monospace" font-size="13">'+esc(ef.text)+'</text>';}
    if(s.paused&&s.mode==='combat')svg+='<text x="37" y="30" class="paused-corner">Ⅱ SIMULATION PAUSED</text>';
    return svg;
  }
  function roomName(id){return sysNames[id]||id||'대기';}
  function renderCrew() {
    const p=game.state.player,alive=p.crew.filter(c=>c.hp>0),selected=selectedCrew();
    $('crew-count').textContent=alive.length+' / 8';
    patch($('crew-list'),p.crew.map(c=>`<button class="crew-card ${UI.selectedCrewIds.includes(c.id)?'selected ':''}${c.hp<=0?'dead':''}" data-crew-select="${c.id}" data-focus="crew-${c.id}" aria-pressed="${UI.selectedCrewIds.includes(c.id)}" ${c.hp<=0?'disabled':''}><span class="crew-avatar ${c.species}">${c.species==='engi'?'⊞':c.species==='rock'?'◆':c.species==='mantis'?'⋈':'•'}</span><span class="crew-main"><span class="crew-name">${esc(c.name)}<small>${esc(speciesNames[c.species]||c.species)}</small>${crewRankBadge(c)}${c.shipId==='enemy'?'<b class="aboard-badge">적선</b>':''}</span><span class="crew-task">${esc(c.hp<=0?'전사':c.task||(c.targetRoomId?'이동 → '+roomName(c.targetRoomId):roomName(c.roomId)+' 근무'))}</span></span><span class="crew-health">${Math.max(0,round(c.hp))}<span class="thin-track"><i style="width:${pct(c.hp,c.maxHp)}%"></i></span></span></button>`).join(''));
    $('multi-btn').setAttribute('aria-pressed',String(UI.multiSelect));$('multi-btn').classList.toggle('active',UI.multiSelect);
    $('crew-instruction').textContent=selected.length?selected.map(c=>c.name).join(', ')+' 선택 · 같은 함선의 방을 눌러 이동':'승무원 → 방 선택 · Shift 또는 다중 선택으로 함께 지휘';
    const routes=selected.map(c=>({crew:c,route:game.getCrewRoute?.(c.id)})).filter(x=>x.route?.points?.length>1);
    $('crew-route-info').hidden=!routes.length;patch($('crew-route-info'),routes.map(({crew,route})=>'<div><strong>'+esc(crew.name)+'</strong><span>'+esc((route.roomIds||[]).map(roomName).join(' → '))+'</span><b>'+Number(route.distance||0).toFixed(1)+'칸 남음</b></div>').join(''));
    const power=p.aux?.teleporter?.power||0,cooldown=p.teleportCooldown||0,ready=power>0&&cooldown<=0&&game.state.mode==='combat';
    const home=selected.filter(c=>(c.shipId||'player')==='player'),away=alive.filter(c=>c.shipId==='enemy');
    $('teleport-status').textContent=power<=0?'↗ 텔레포터에 전력 1을 배분하세요':cooldown>0?'↗ 귀환 충전 '+cooldown.toFixed(1)+'초'+(away.length?' · 적선에 '+away.length+'명':''):'↗ 전송 준비 · 한 번에 최대 2명'+(away.length?' · 적선에 '+away.length+'명':'');
    $('board-btn').disabled=!ready||home.length<1||home.length>2||home.length!==selected.length;
    $('board-btn').classList.toggle('active',UI.intent==='boarding');$('board-btn').textContent=UI.intent==='boarding'?'적의 방 선택…':'적선 침투 ↗';
    $('recall-btn').disabled=!ready||!away.length;
  }
  function renderSystems() {
    const p=game.state.player,used=game.getPowerUsed(),capacity=game.getReactorCapacity?game.getReactorCapacity(p):p.reactor;
    $('reactor-number').textContent=used+' / '+capacity;$('reactor-number').title='정격 반응로 '+p.reactor;
    $('power-status').textContent='예비 전력 '+Math.max(0,capacity-used)+(capacity<p.reactor?' · 정격 '+p.reactor+' / 폭풍 제한':p.venting?' · 환기 중':'');
    patch($('systems-list'),['shields','engines','weapons','oxygen','medbay','drones','teleporter','cloaking'].filter(id=>p.systems[id]||p.aux?.[id]).map(id=>{
      const sys=p.systems[id]||p.aux[id],usable=Math.max(0,sys.level-sys.damage-(sys.ionStacks||0));
      return `<div class="system-row ${p.aux?.[id]?'aux-row':''} ${sys.ionTimer>0?'ion-locked':''}"><span class="system-icon" aria-hidden="true">${icons[id]}</span><span class="system-name">${sysNames[id]}${sys.ionTimer>0?'<small>'+sys.ionTimer.toFixed(1)+'s 잠금</small>':''}</span><div class="system-blocks" title="전력 ${sys.power}, 최대 ${sys.level}, 손상 ${sys.damage}, 이온 잠금 ${sys.ionStacks||0}">${sys.level?Array.from({length:sys.level},(_,i)=>'<span class="power-block '+(i>=sys.level-sys.damage?'damaged':i>=usable?'ion':i<sys.power?'on':'')+'"></span>').join(''):'<span class="system-uninstalled">교역소에서 설치</span>'}</div><span class="system-detail">${sys.power}/${usable}</span><button class="adjust-button" data-power="${id}" data-delta="-1" data-focus="minus-${id}" aria-label="${sysNames[id]} 전력 감소" ${sys.power<=0?'disabled':''}>−</button><button class="adjust-button" data-power="${id}" data-delta="1" data-focus="plus-${id}" aria-label="${sysNames[id]} 전력 증가" ${sys.power>=usable||used>=capacity?'disabled':''}>+</button></div>`;
    }).join(''));
  }
  function renderWeapons(){
    const p=game.state.player,droneTab=UI.arsenal==='drones';
    $('weapons-list').hidden=droneTab;$('drones-list').hidden=!droneTab;
    $('weapons-tab').classList.toggle('active',!droneTab);$('weapons-tab').setAttribute('aria-pressed',String(!droneTab));
    $('drones-tab').classList.toggle('active',droneTab);$('drones-tab').setAttribute('aria-pressed',String(droneTab));
    $('drone-active-count').textContent=(p.drones||[]).filter(d=>d.enabled).length;
    $('volley-btn').disabled=game.state.mode!=='combat'||!p.weapons.some(w=>w.enabled&&w.powered!==false&&w.charge>=w.cooldown&&w.target);
    patch($('weapons-list'),p.weapons.map((w,i)=>{
      const charge=pct(w.charge,w.cooldown),powered=w.powered!==false&&w.enabled,manual=w.fireMode==='manual',ready=charge>=99.9;
      return `<div class="weapon-card ${UI.selectedWeapon===w.id?'selected ':''}${!powered?'off ':''}${ready?'ready':''}" data-weapon-select="${w.id}" data-focus="weapon-${w.id}" role="button" tabindex="0" aria-label="${esc(w.name)} 선택"><div class="weapon-head"><span class="weapon-name"><kbd>${i+1}</kbd>${esc(w.name)}</span><button class="weapon-power ${!w.enabled?'off':''}" data-weapon-toggle="${w.id}" data-focus="toggle-${w.id}" aria-label="${esc(w.name)} 전력 ${w.enabled?'끄기':'켜기'}">${w.enabled?'ON':'OFF'} · ${w.power}</button></div><div class="weapon-details"><span>${w.type==='ion'?'이온 잠금 · '+(w.ionDuration||5)+'s':(w.type==='missile'?'실드 관통':w.type==='beam'?'빔 / 회피 불가':w.shots+'연발')+' · '+w.damage+' DMG'}</span><span>${powered?w.manualQueued?'예약됨':ready?'READY':Math.max(0,w.cooldown-w.charge).toFixed(1)+'s':'NO POWER'}</span></div><div class="weapon-charge"><i style="width:${charge}%"></i></div><div class="weapon-target ${!w.target?'none':''}">${w.target?'⌖ '+esc(roomName(w.target))+(w.type==='beam'?' · '+(w.targetRooms?.length||1)+'개 방':''):UI.selectedWeapon===w.id?'⌖ 적 함선의 방을 선택하세요':'대상 미지정'}</div><div class="weapon-actions"><button class="fire-mode ${manual?'manual':''}" data-weapon-auto="${w.id}" data-focus="mode-${w.id}" aria-label="${esc(w.name)} ${manual?'자동':'수동'} 사격으로 전환">${manual?'수동 사격':'자동 사격'} ⇄</button><button class="fire-button" data-weapon-fire="${w.id}" data-focus="fire-${w.id}" aria-label="${esc(w.name)} 한 번 발사" ${!powered||!ready||!w.target||game.state.mode!=='combat'?'disabled':''}>발사 ↗</button></div></div>`;
    }).join(''));
    patch($('drones-list'),(p.drones||[]).map(d=>{
      const supported=(p.aux?.drones?.power||0)>=d.power,powered=d.enabled&&d.powered!==false&&supported;
      return `<div class="drone-card ${powered?'active':''}"><div class="weapon-head"><span class="weapon-name"><span class="drone-glyph">${d.type==='defense'?'⬡':'⌘'}</span>${esc(d.name)}</span><span class="microcopy">전력 ${d.power}</span></div><p>${d.type==='defense'?'접근하는 미사일을 요격합니다.':'적의 방을 자동 조준해 레이저로 공격합니다.'}</p><div class="drone-status"><span>${powered?'● 작동 중':d.enabled?'전력 부족':d.deployed?'전개됨 · 재가동 무료':'미전개 · 부품 1 필요'}</span><button class="secondary-button ${powered?'active':''}" data-drone="${d.id}" data-focus="drone-${d.id}" ${game.state.mode!=='combat'?'disabled':''}>${d.enabled?'중지':d.deployed?'재가동':'전개'}</button></div><div class="thin-track"><i style="width:${d.enabled?pct(d.charge,d.cooldown):0}%"></i></div></div>`;
    }).join('')||'<p class="microcopy">교역소에서 드론을 설치하세요.</p>');
    const w=p.weapons.find(w=>w.id===UI.selectedWeapon);
    $('weapon-instruction').textContent=droneTab?'드론 전력 배분 → 전개 · 첫 전개에만 부품 1 소비':w?.type==='beam'?(UI.beamStart?'빔 시작점 지정됨 → 끝 방 선택':'빔 선택됨 → 시작 방, 끝 방 순서로 선택'):'수동은 충전 후 발사 · 일시정지 중 발사 명령은 재개 시 실행';
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
    $('cloak-status').textContent=!cloak?.level?'교역소에서 설치':power<1?'은폐에 전력 필요':active?'사격하면 즉시 해제':cooldown>0?'재충전 '+cooldown.toFixed(1)+'초':'준비 · 지속 '+(4+2*power)+'초';
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
    if(innerWidth<=590){$('battle-fx').innerHTML='';return;}
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
    const s=game.state,p=s.player,e=s.enemy;
    if(s.mode!==UI.lastMode){UI.lastMode=s.mode;UI.hideMap=false;}
    if(s.encounterId!==UI.lastEncounter){UI.lastEncounter=s.encounterId;clearSelection();}
    UI.selectedCrewIds=UI.selectedCrewIds.filter(id=>p.crew.some(c=>c.id===id&&c.hp>0));UI.selectedCrew=UI.selectedCrewIds[0]||null;
    $('sector-name').textContent=String(s.sector).padStart(2,'0')+' · '+((SW.DATA.sectorNames||[])[s.sector-1]||'미지의 항로');
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
    $('ftl-value').textContent=round(p.ftl)+'%';$('ftl-bar').style.width=pct(p.ftl)+'%';$('escape-btn').disabled=!isCombat||p.ftl<100||s.resources.fuel<1;
    $('enemy-name').textContent=e?.name||'접촉 없음';$('enemy-badge').textContent=e?'적대적':'안전';$('enemy-kicker').textContent=e?'HOSTILE VESSEL':'SCANNING DEEP SPACE';
    patch($('player-ship'),shipSvg(p,'player'));patch($('enemy-ship'),shipSvg(e,'enemy'));
    const selectedWeapon=p.weapons.find(w=>w.id===UI.selectedWeapon);
    $('target-callout').hidden=!e;$('target-callout').classList.toggle('aiming',!!UI.selectedWeapon||UI.intent==='boarding');
    $('target-callout').textContent=UI.intent==='boarding'?'↗ 침투할 적의 방을 선택하세요':UI.intent==='crew'&&selectedCrew().some(c=>c.shipId==='enemy')?'적선의 아군 선택됨 → 이동할 방 선택':selectedWeapon?'⌖ '+selectedWeapon.name+' · '+(selectedWeapon.type==='beam'?(UI.beamStart?'빔 끝 방 선택':'빔 시작 방 선택'):'적의 방을 눌러 조준'):'무기 선택 → 적의 방을 눌러 조준';
    const activeRoute=UI.selectedCrew&&game.getCrewRoute?.(UI.selectedCrew);
    $('ship-hint').textContent=activeRoute?.points?.length>1?'점선은 실제 문 경로 · '+Number(activeRoute.distance||0).toFixed(1)+'칸 남음':UI.selectedCrewIds.length?UI.selectedCrewIds.length+'명 선택 → 이동할 방 선택':'승무원 선택 → 이동할 방 선택';
    renderEnemyIntent();
    renderCrew();renderSystems();renderWeapons();renderTactics();renderEnvironment();renderEffects();
    const entries=s.log.slice(-2);patch($('log-stream'),entries.map(l=>'<div class="log-entry '+esc(l.type)+'"><time>'+String(Math.floor(l.time/60)).padStart(2,'0')+':'+String(Math.floor(l.time%60)).padStart(2,'0')+'</time><span>'+esc(l.text)+'</span></div>').join(''));
    const last=s.log.at(-1);if(last&&last.id!==lastSoundLog){if(UI.lastHull!==undefined&&p.hull<UI.lastHull)sound('hit');lastSoundLog=last.id;}UI.lastHull=p.hull;
    $('map-btn').disabled=isCombat||s.mode==='briefing'||s.mode==='defeat'||s.mode==='victory';
    $('load-btn').disabled=!hasSave();
    if(s.mode!==autoSaveMode){autoSaveMode=s.mode;if(s.mode!=='briefing')save();}
    renderModal();
  }

  function dialog(inner,extra=''){inner=inner.replace('<h2>','<h2 id="dialog-title">');return '<section class="dialog '+extra+'" role="dialog" aria-modal="true" aria-labelledby="dialog-title">'+inner+'</section>';}
  const closeButton='<button class="dialog-close" data-action="close-modal" aria-label="닫기">×</button>';
  function renderModal(){
    const s=game.state,mode=UI.modal||s.mode;
    const signature=mode+'|'+Boolean(UI.hideMap)+'|'+(mode==='shop'?s.resources.scrap+'|'+JSON.stringify(s.player.systems)+'|'+JSON.stringify(s.player.aux)+'|'+s.player.hull+'|'+s.player.reactor+'|'+s.player.crew.length+'|'+s.player.drones?.length+'|'+s.player.weapons.length+'|'+JSON.stringify(s.cargo):mode==='layout'?UI.layoutSide+'|'+s.player.layoutId+'|'+s.enemy?.layoutId+'|'+JSON.stringify(s[UI.layoutSide]?.doors):mode==='equipment'?s.mode+'|'+s.resources.scrap+'|'+JSON.stringify(s.player.weapons)+'|'+JSON.stringify(s.player.drones)+'|'+JSON.stringify(s.cargo)+'|'+UI.swapCargoId+'|'+UI.discardCargoId:mode==='map'?s.currentNodeId+'|'+UI.selectedNode+'|'+s.sector+'|'+s.resources.fuel+'|'+s.fleet:mode==='event'?JSON.stringify(s.event):mode==='reward'?JSON.stringify(s.reward)+'|'+(s.cargo?.length||0):mode==='briefing'?hasSave()+'|'+s.loadoutId+'|'+s.difficulty:mode==='skills'?UI.skillCrewId:mode==='log'?s.log.length+'|'+s.log.at(-1)?.id:mode==='files'?String(UI.importCandidate?.name||'')+'|'+String(UI.importError||''):'');
    if(signature===modalSignature)return;
    modalSignature=signature;
    let html='';
    if(mode==='briefing')html=renderHangar();
    if(mode==='skills')html=renderSkills();
    if(mode==='layout')html=renderLayout();
    if(mode==='equipment')html=renderEquipment();
    if(mode==='log')html=renderHistory();
    if(mode==='help')html=renderHelp();
    if(mode==='files')html=renderSaveFiles();
    if(mode==='restart')html=dialog(closeButton+'<span class="eyebrow">NEW VOYAGE</span><h2>새로운 항해를 시작할까요?</h2><p>현재 항해와 이 브라우저의 자동 저장이 새 항해로 바뀝니다. 보관하려면 먼저 저장 파일 관리에서 JSON 파일을 내보내세요.</p><div class="dialog-actions"><button class="secondary-button" data-action="close-modal">돌아가기</button><button class="primary-button orange" data-action="confirm-restart">새 항해 시작</button></div>');
    if(mode==='event'&&s.event)html=dialog('<span class="eyebrow">INCOMING TRANSMISSION</span><h2>'+esc(s.event.title)+'</h2><p>'+esc(s.event.body)+'</p><div class="choice-list">'+s.event.choices.map((c,i)=>'<button class="choice-button" data-choice="'+esc(c.id)+'" '+(c.disabled?'disabled':'')+'><div><strong><span class="choice-number">0'+(i+1)+'</span>'+esc(c.label)+'</strong>'+(c.description?'<small>'+esc(c.description)+'</small>':'')+(c.reason?'<small>'+esc(c.reason)+'</small>':'')+'</div><span class="choice-arrow">→</span></button>').join('')+'</div>');
    if(mode==='reward'&&s.reward)html=renderReward();
    if(mode==='map'&&!UI.hideMap)html=renderMap();
    if(mode==='shop')html=renderShop();
    if(mode==='victory'||mode==='defeat')html=dialog('<span class="eyebrow">'+(mode==='victory'?'MISSION COMPLETE / SIGNAL RECEIVED':'MISSION LOST / SIGNAL FADING')+'</span><h2>'+(mode==='victory'?'당신의 신호가<br><em>연방에 도착했습니다.</em>':'별들 사이에<br>기록된 마지막 항해.')+'</h2><p>'+(mode==='victory'?'반군 기함이 침묵했습니다. 손상된 작은 함선과 살아남은 승무원들이 불가능해 보였던 항로를 완주했습니다.':esc(s.player.name)+'의 신호가 끊어졌습니다. 다음 항해에서는 더 일찍 적의 무기를 제압하고, 피해를 받은 방에 승무원을 배치해보세요.')+'</p><div class="end-stats">'+[[s.stats?.kills||0,'함선 격파'],[s.stats?.jumps||0,'FTL 도약'],[s.stats?.scrapEarned||0,'스크랩 획득'],[s.player.crew.filter(c=>c.hp>0).length,'생존 승무원'],[s.stats?.salvaged||0,'장비 회수'],[s.stats?.equipmentSold||0,'장비 판매']].map(([v,t])=>'<div class="end-stat">'+v+'<span>'+t+'</span></div>').join('')+'</div><div class="dialog-actions"><button class="primary-button" data-action="confirm-restart">새로운 항해 <span>↗</span></button></div>');
    const modal=$('modal');modal.hidden=!html;$('app').inert=!!html;
    if(html){const focusKey=document.activeElement?.getAttribute('data-focus');patch(modal,html);if(!focusKey)requestAnimationFrame(()=>modal.querySelector('button:not(:disabled)')?.focus({preventScroll:true}));}
    else modal.innerHTML='';
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
    return dialog('<span class="eyebrow">EXPEDITION / 05 · HANGAR</span><h2>작은 함선.<br><em>서로 다른 생존 방식.</em></h2><p class="hangar-intro">세 개의 섹터를 건너 연방에 마지막 신호를 전하세요. 함선과 난이도를 고르면 항해가 시작됩니다.</p><div class="loadout-grid">'+cards+'</div><div class="loadout-description"><span class="eyebrow">'+esc(selected?.role||'시작 함선')+'</span><p>'+esc(selected?.description||'')+'</p><p class="loadout-layout-description"><b>격실 전략</b> '+esc((SW.DATA.layouts?.[selected?.spec.layoutId]||layoutData()).description)+'</p><div class="loadout-resources">시작 보급 <span>▧ '+s.resources.scrap+' 스크랩</span><span>◈ '+s.resources.fuel+' 연료</span><span>↟ '+s.resources.missiles+' 미사일</span><span>⌘ '+s.resources.droneParts+' 부품</span></div></div><div class="difficulty-picker"><div class="difficulty-options" role="group" aria-label="난이도 선택">'+Object.values(SW.DATA.difficulties||{}).map(d=>'<button class="difficulty-option '+(d.id===s.difficulty?'active':'')+'" data-difficulty="'+d.id+'" data-focus="difficulty-'+d.id+'" aria-pressed="'+(d.id===s.difficulty)+'" aria-label="'+esc(d.name)+' 난이도">'+esc(d.name)+'</button>').join('')+'</div><p>'+esc(difficulty?.description||'')+'</p></div><div class="dialog-actions"><button id="launch-btn" class="primary-button" data-action="start-run">'+esc(selected?.name||'아르고')+'로 출항 <span>↗</span></button>'+(hasSave()?'<button class="secondary-button" data-action="load">저장된 항해 이어가기</button>':'')+'</div><p class="dialog-note">Space 일시정지 · 1–4 조준 · F 일제사격 · C 은폐<br>독립 전술 캠페인 · 자동 저장 · 장비·화물과 승무원 숙련은 이번 항해에 유지됩니다.</p>','hangar-dialog wide');
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
      ['Ⅱ · 무기와 일제사격','1–4 또는 무기 카드 → 적의 방을 선택합니다. 자동은 충전 후 반복 발사, 수동은 충전 상태를 유지합니다. 발사 또는 F로 준비된 무기를 함께 발사하세요. 미사일은 실드를 관통합니다.'],
      ['Ⅲ · 빔의 경로','교역소에서 빔을 설치하면 시작 방과 끝 방을 순서대로 선택합니다. 경로가 지나는 방마다 한 번 피해를 주며, 남은 실드 층만큼 피해가 감소합니다. 먼저 레이저로 실드를 걷어내세요.'],
      ['Ⅳ · 문과 산소','함선의 문 또는 격실 문 목록을 눌러 열고 닫습니다. 닫힌 문은 산소와 화재를 격리하고, 침입자의 이동을 지연합니다. 전체 환기는 모든 통로와 에어록을 엽니다. 진압 후 전체 봉쇄하세요.'],
      ['Ⅴ · 침투와 귀환','승무원을 선택 → 텔레포터에 전력 1 → 적선 침투 → 적의 방을 선택합니다. 한 번에 2명까지 이동합니다. 다중 선택 또는 Shift를 사용하세요. 귀환은 충전 후 가능하며, 적선이 파괴되면 남아 있는 아군도 전사합니다.'],
      ['Ⅵ · 드론과 전력','드론에 전력 2를 주고 드론 탭에서 전개합니다. 처음 전개할 때 부품 1개를 쓰며, 같은 교전에서 재가동은 무료입니다. 방어 드론은 미사일을 요격하고 공격 드론은 레이저를 발사합니다.'],
      ['Ⅶ · 승무원과 함선','아군 승무원은 화재·균열·시스템을 자동 수리하며, 의료실 전력이 있으면 그 방에서 치료받습니다. 적과 같은 방에서는 근접전이 우선합니다. 선체 수리는 교역소·정비 비컨에서 가능합니다.'],
      ['Ⅷ · 항해와 기함','연결된 비컨으로 도약하며 연료 1을 씁니다. 교역·구조·사건에서 함선을 성장시키세요. 기함은 침투 → 드론 과충전 → 미사일 일제사격의 3단계이며, 경고 시간을 보고 대응할 수 있습니다.']
      ,['Ⅸ · 승무원 숙련','조타·엔진·무기·실드·정비·근접전의 여섯 숙련이 실제 행동으로 성장합니다. 경험치 40과 120에서 성능이 향상됩니다. 승무원 패널의 숙련 현황에서 효과와 진행도를 확인하세요.']
      ,['Ⅹ · 은폐와 이온','은폐에 전력을 배분하고 C를 누르면 회피가 크게 오르고 적 일반 무기 충전이 멈춥니다. 자신의 사격은 은폐를 해제합니다. 이온은 실드가 있으면 실드를, 없으면 조준한 시스템을 일시적으로 잠그며 선체 피해는 주지 않습니다.']
      ,['Ⅺ · 위험 항로','소행성은 실드로 막고, 태양 플레어는 화재를 수습하며, 이온 폭풍에서는 줄어든 가용 전력을 재배분하세요. 지도에서 위험을 확인하고 경로를 선택합니다. 위험 교전에서 승리하면 추가 스크랩을 얻습니다.']
      ,['Ⅻ · 장비와 회수품','장비·화물에서 무기 4개·드론 2개를 장착하고 화물 6개를 보관합니다. 회수품은 화물에 넣거나 스크랩으로 분해합니다. 교전 밖에서 장착·교체하며 교역소에서 판매하세요. 무기 순서는 전력 배정 우선순위입니다.']
      ,['ⅩⅢ · 적의 다음 표적','적 함선 아래에 전술 성향과 각 무기의 다음 표적이 표시됩니다. 교란형은 이온으로 실드를, 포격형은 미사일로 기관과 방어를 압박합니다. 충전 중인 표적을 보고 수리 인원과 전력을 준비하세요.']
      ,['ⅩⅣ · 승무원 배치','각 승무원을 원하는 방에 이동시킨 뒤 배치 저장을 누르세요. 본함에 정지한 인원만 저장합니다. 복귀는 그 위치로 이동하는 명령이며 적선의 승무원을 순간이동시키지 않습니다.']
      ,['ⅩⅤ · 함선별 격실 구조','함선 상태 아래의 도면 이름을 누르면 실제 통로와 에어록을 확인합니다. 아르고·아틀라스·레이스와 적 함선은 서로 다른 구조를 사용합니다. 수리 인원의 이동 거리와 빔이 통과할 방을 도면에서 판단하세요.']
      ,['ⅩⅥ · 실제 이동 경로','승무원 선택 → 방 선택 후 점선을 확인하세요. 경로는 문을 통과하며 남은 거리를 표시합니다. 적선 위 아군도 그 적선의 통로를 사용합니다. 이전 저장은 원래 도면을 유지해 계속 플레이할 수 있습니다.']
    ];
    return dialog(closeButton+'<span class="eyebrow">CAPTAIN’S FIELD GUIDE / 05</span><h2>멈추고, 배분하고, 살아남으세요.</h2><div class="help-grid">'+cards.map(([title,body])=>'<div class="help-card"><h3>'+title+'</h3><p>'+body+'</p></div>').join('')+'</div><div class="alert-inline">침투조의 귀환 전 적선을 파괴하지 않도록 사격을 조절하세요. 전체 환기 중에는 아군도 산소 피해를 받습니다.</div><p class="dialog-note">Space 일시정지 · 1–4 무기 선택 · F 일제사격 · C 은폐 · Shift 다중 선택 · Esc 선택 취소 · ? 안내<br>세이브는 자동 저장되며, ⇅ 저장 파일 관리에서 다른 브라우저로 옮길 수 있습니다.</p><div class="dialog-actions"><button class="primary-button" data-action="close-modal">함선으로 돌아가기</button></div>','wide');
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
    return dialog('<span class="eyebrow">'+(s.bossPhase?'FLAGSHIP ENGAGEMENT':'ENCOUNTER RESOLVED')+'</span><h2>'+esc(r.title||'항로를 확보했습니다')+'</h2><p>'+esc(r.body||'잔해에서 쓸 만한 자원을 회수했습니다. 다음 도약을 준비하세요.')+'</p><div class="reward-grid">'+[['scrap','스크랩'],['fuel','연료'],['missiles','미사일'],['droneParts','드론 부품']].map(([k,n])=>'<div class="reward-item"><strong>+'+(r[k]||0)+'</strong><span>'+n+'</span></div>').join('')+'</div>'+gear+'<div class="dialog-actions"><button class="secondary-button" data-action="open-equipment">장비·화물 관리</button><button class="primary-button" data-action="continue-reward" '+(pending?'disabled':'')+'>'+(pending?'회수품을 먼저 선택하세요':s.bossPhase&&s.bossPhase<3?'다음 교전 준비':'항해 계속')+' <span>↗</span></button></div>','reward-dialog');
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
  function renderMap(){
    const s=game.state;const current=s.nodes.find(n=>n.id===s.currentNodeId);const links=current?.links||[];const selected=s.nodes.find(n=>n.id===UI.selectedNode);const canJump=selected&&links.includes(selected.id)&&!selected.visited;
    const maxCol=Math.max(4,...s.nodes.map(n=>n.col));const xy=n=>({x:65+n.col*630/maxCol,y:55+n.row*90});
    let svg='<defs><pattern id="map-stars" width="47" height="43" patternUnits="userSpaceOnUse"><circle cx="12" cy="25" r=".7" fill="#638398" opacity=".35"/></pattern></defs><rect width="760" height="300" fill="url(#map-stars)"/>';
    for(const n of s.nodes){const a=xy(n);for(const dest of n.links){const d=s.nodes.find(m=>m.id===dest);if(!d)continue;const b=xy(d);const active=n.id===s.currentNodeId;svg+='<path d="M'+a.x+' '+a.y+'L'+b.x+' '+b.y+'" fill="none" stroke="'+(active?'#5d8d8b':'#2b4150')+'" stroke-width="'+(active?1.5:1)+'" '+(active?'':'stroke-dasharray="4 6"')+'/>';}}
    for(const n of s.nodes){const p=xy(n),reachable=links.includes(n.id)&&!n.visited,cur=n.id===s.currentNodeId,sel=n.id===UI.selectedNode;const color=cur?'#82e6dc':n.type==='boss'?'#e78e7d':n.type==='shop'?'#d9bf84':reachable?'#95bec4':'#405665';
      svg+='<g class="map-node" data-node="'+n.id+'" data-focus="node-'+n.id+'" tabindex="0" role="button" aria-label="'+esc((n.label||nodeNames[n.type])+(n.environment?' / '+(SW.DATA.environments?.[n.environment]?.name||'환경 위험'):''))+', '+(cur?'현재 위치':reachable?'도약 가능':'도약 불가')+'">'+(cur||sel?'<circle cx="'+p.x+'" cy="'+p.y+'" r="25" fill="none" stroke="'+color+'" stroke-width="1" stroke-dasharray="3 5"/>':'')+'<circle cx="'+p.x+'" cy="'+p.y+'" r="16" fill="'+(cur?'#1d4d4c':sel?'#27464d':'#111f2a')+'" stroke="'+color+'" stroke-width="'+(reachable||cur?1.8:1)+'"/><text x="'+p.x+'" y="'+(p.y+5)+'" text-anchor="middle" style="fill:'+color+';font-size:16px">'+(cur?'◆':n.visited?'✓':nodeSymbols[n.type]||'◇')+'</text><text x="'+p.x+'" y="'+(p.y+37)+'" text-anchor="middle" style="fill:'+color+';font-size:10px">'+esc(cur?'현재 위치':n.label||nodeNames[n.type])+'</text></g>';
    }
    for(const n of s.nodes){const hazard=SW.DATA.environments?.[n.environment];if(!hazard)continue;const p=xy(n);svg+='<text x="'+p.x+'" y="'+(p.y+53)+'" text-anchor="middle" class="map-hazard" pointer-events="none">'+esc(hazard.icon+' '+hazard.name)+'</text>';}
    let note=canJump?'연료 1 소비 · 반군 추격 1 진행':selected?.id===s.currentNodeId?s.player.name+'의 현재 위치입니다.':'밝게 표시된 연결 비컨을 선택하세요.';
    const hazard=SW.DATA.environments?.[selected?.environment];if(hazard)note+=' · '+hazard.name+': '+hazard.description;
    return dialog('<button class="dialog-close" data-action="close-map" aria-label="함선으로 돌아가기">×</button>'+'<div class="map-heading"><div><span class="eyebrow">SECTOR NAVIGATION</span><h2>'+esc((SW.DATA.sectorNames||[])[s.sector-1]||'섹터 '+s.sector)+'</h2></div><div class="map-meta">SECTOR 0'+s.sector+' / 03<div class="sector-progress">'+[1,2,3].map(n=>'<i class="'+(n<=s.sector?'complete':'')+'"></i>').join('')+'</div></div></div><p>다음 비컨을 선택하세요. 교전은 자원을, 우회는 새로운 가능성을 남깁니다.</p><svg class="starmap" viewBox="0 0 760 300" role="group" aria-label="섹터 항해 지도">'+svg+'</svg><div class="map-legend"><span>× 교전</span><span>? 미확인 신호</span><span>₴ 교역소</span><span>+ 보급</span><span class="hazard-legend">☄ 환경 위험</span><span>↗ 출구</span><span style="color:var(--orange)">추격 '+s.fleet+'</span><span>연료 '+s.resources.fuel+'</span></div><div class="map-detail"><div><strong>'+esc(selected?.label|| (selected?nodeNames[selected.type]:'연결된 항로를 선택하세요'))+'</strong><p>'+esc(note)+'</p></div><div class="map-detail-actions"><button class="secondary-button" data-action="open-equipment">장비·화물</button><button class="primary-button" data-action="jump" '+(!canJump?'disabled':'')+'>FTL 도약 <span>↗</span></button></div></div>','wide');
  }
  function renderShop(){
    const items=game.shopItems();return dialog('<div class="map-heading"><div><span class="eyebrow">ORBITAL TRADING POST</span><h2>잠시, 함선을 돌볼 시간.</h2></div><div class="shop-heading-tools"><span class="shop-balance">▧ '+game.state.resources.scrap+'</span><button class="secondary-button" data-action="open-equipment">장비·화물 / 판매</button></div></div><p>보유한 스크랩으로 다음 교전을 준비하세요. 시스템 확장 시 여유 전력이 연결됩니다. 필요하면 전력을 다시 배분하세요.</p><div class="shop-grid">'+items.map(item=>'<div class="shop-item"><h3>'+esc(item.name)+'</h3><p>'+esc(item.description)+'</p>'+(item.destination?'<span class="shop-destination">'+(item.destination==='cargo'?'▣ 구매 시 화물칸으로':'⌖ 구매 시 장착 슬롯으로')+'</span>':'')+'<button class="secondary-button" data-buy="'+item.id+'" data-focus="buy-'+item.id+'" '+(item.disabled||game.state.resources.scrap<item.cost?'disabled':'')+'><span>'+ (item.disabled?'구매 불가':'구매')+'</span><span>▧ '+item.cost+'</span></button></div>').join('')+'</div><div class="dialog-actions"><button class="primary-button" data-action="leave-shop">항해 계속 <span>↗</span></button></div>','wide');
  }

  document.addEventListener('click', ev=>{
    const target=ev.target;
    if(target.closest('.brand')){ev.preventDefault();return;}
    const loadout=target.closest('[data-loadout]');if(loadout){if(resultMessage(game.configureRun(loadout.dataset.loadout,game.state.difficulty))){clearSelection();UI.selectedNode=null;modalSignature='';render();sound();}return;}
    const difficulty=target.closest('[data-difficulty]');if(difficulty){if(resultMessage(game.configureRun(game.state.loadoutId,difficulty.dataset.difficulty))){clearSelection();UI.selectedNode=null;modalSignature='';render();sound();}return;}
    const skillCrew=target.closest('[data-skill-crew]');if(skillCrew){UI.skillCrewId=skillCrew.dataset.skillCrew;modalSignature='';render();return;}
    const equipment=target.closest('[data-equipment]');if(equipment){handleEquipment(equipment);return;}
    const salvage=target.closest('[data-salvage]');if(salvage){if(resultMessage(game.resolveSalvage(salvage.dataset.salvage)))save();modalSignature='';render();sound('win');return;}
    const door=target.closest('[data-door]');if(door){order(()=>game.toggleDoor(door.dataset.door));return;}
    const wt=target.closest('[data-weapon-toggle]');if(wt){order(()=>game.toggleWeapon(wt.dataset.weaponToggle));return;}
    const wa=target.closest('[data-weapon-auto]');if(wa){const w=game.state.player.weapons.find(w=>w.id===wa.dataset.weaponAuto);if(w)order(()=>game.setWeaponAuto(w.id,w.fireMode==='manual'));return;}
    const wf=target.closest('[data-weapon-fire]');if(wf){order(()=>game.fireWeapon(wf.dataset.weaponFire));return;}
    const drone=target.closest('[data-drone]');if(drone){order(()=>game.toggleDrone(drone.dataset.drone));return;}
    const power=target.closest('[data-power]');if(power){order(()=>game.allocatePower(power.dataset.power,Number(power.dataset.delta)));return;}
    const crew=target.closest('[data-crew-select],[data-crew]');if(crew){chooseCrew(crew.dataset.crewSelect||crew.dataset.crew,ev.shiftKey);return;}
    const room=target.closest('[data-room]');if(room){commandRoom(room.dataset.side,room.dataset.room);return;}
    const weapon=target.closest('[data-weapon-select]');if(weapon){chooseWeapon(weapon.dataset.weaponSelect);return;}
    const node=target.closest('[data-node]');if(node){UI.selectedNode=node.dataset.node;render();sound();return;}
    const choice=target.closest('[data-choice]');if(choice){resultMessage(game.chooseEvent(choice.dataset.choice));modalSignature='';render();save();sound();return;}
    const buy=target.closest('[data-buy]');if(buy){const r=game.buy(buy.dataset.buy);if(resultMessage(r,'스크랩이나 구매 조건을 확인하세요.')){sound('win');toast('구매 완료. 함선 상태가 갱신되었습니다.');}modalSignature='';render();save();return;}
    const layoutSide=target.closest('[data-layout-side]')?.dataset.layoutSide;if(layoutSide){UI.layoutSide=layoutSide;modalSignature='';render();return;}
    const action=target.closest('[data-action]')?.dataset.action;
    if(action==='export-save')exportSave();
    if(action==='pick-save')$('save-file-input').click();
    if(action==='import-save')importSave();
    if(action==='export-backup'){try{const backup=localStorage.getItem(STORE+'-import-backup');if(backup)downloadSave(backup,'STARWARD_Import_Backup.json');else toast('아직 파일을 가져온 기록이 없습니다.');}catch(_){toast('복구용 사본을 읽을 수 없습니다.');}}
    if(action==='start-run')startRun();
    if(action==='load')loadSaved();
    if(action==='close-modal')closeManualModal();
    if(action==='close-map'){UI.hideMap=true;modalSignature='';render();}
    if(action==='confirm-restart')newRun();
    if(action==='open-equipment')openManualModal('equipment');
    if(action==='continue-reward'){UI.selectedNode=null;resultMessage(game.continueReward());modalSignature='';render();save();sound('win');}
    if(action==='jump'){if(UI.selectedNode){UI.modal=null;resultMessage(game.jump(UI.selectedNode),'해당 비컨으로 도약할 수 없습니다.');UI.selectedNode=null;modalSignature='';render();save();sound();}}
    if(action==='leave-shop'){game.leaveShop();UI.selectedNode=null;modalSignature='';render();save();}
  });
  $('pause-btn').addEventListener('click',()=>{if(game.state.mode==='combat'){game.togglePause();render();sound();}});
  $('speed-btn').addEventListener('click',()=>{game.setSpeed(game.state.speed===2?1:2);render();});
  $('vent-btn').addEventListener('click',()=>{game.toggleVent();render();toast(game.state.player.venting?'전체 환기: 통로와 에어록이 열렸습니다. 진압 후 봉쇄하세요.':'문을 봉쇄했습니다. 산소 시스템이 작동하면 회복합니다.');});
  $('escape-btn').addEventListener('click',()=>{resultMessage(game.escape(),'FTL 충전과 연료를 확인하세요.');render();save();});
  $('doors-btn').addEventListener('click',()=>{UI.doorsOpen=!UI.doorsOpen;render();});
  $('open-doors-btn').addEventListener('click',()=>{order(()=>game.setDoors(true,false));toast('내부 통로를 열었습니다. 에어록 상태는 격실 문에서 확인하세요.');});
  $('seal-btn').addEventListener('click',()=>{order(()=>game.sealShip());toast('정상 문과 에어록을 봉쇄했습니다.');});
  $('multi-btn').addEventListener('click',()=>{UI.multiSelect=!UI.multiSelect;render();});
  $('board-btn').addEventListener('click',()=>{UI.intent=UI.intent==='boarding'?'crew':'boarding';UI.selectedWeapon=null;UI.beamStart=null;render();if(UI.intent==='boarding')toast('적 함선에서 침투할 방을 선택하세요.');});
  $('recall-btn').addEventListener('click',()=>{const ids=selectedCrew().filter(c=>c.shipId==='enemy').map(c=>c.id);const r=game.recallCrew(ids.length?ids:undefined);if(resultMessage(r)){UI.intent='crew';toast('침투조가 의료실로 귀환했습니다.');}render();});
  $('weapons-tab').addEventListener('click',()=>{UI.arsenal='weapons';render();});
  $('drones-tab').addEventListener('click',()=>{UI.arsenal='drones';render();});
  $('volley-btn').addEventListener('click',()=>order(()=>game.fireAllReady()));
  $('skills-btn').addEventListener('click',()=>{UI.skillCrewId=UI.selectedCrew||game.state.player.crew.find(c=>c.hp>0)?.id;openManualModal('skills');});
  $('history-btn').addEventListener('click',()=>openManualModal('log'));
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
  $('sound-btn').addEventListener('click',()=>{UI.sound=!UI.sound;$('sound-btn').classList.toggle('active',UI.sound);$('sound-btn').setAttribute('aria-label',UI.sound?'소리 끄기':'소리 켜기');$('sound-btn').title=UI.sound?'소리 끄기':'소리 켜기';sound();});
  if(location.protocol==='file:'){$('source-btn').hidden=true;$('download-btn').hidden=true;}
  document.addEventListener('keydown',e=>{
    if(e.key==='Tab'&&!$('modal').hidden){const focusable=[...$('modal').querySelectorAll('button:not(:disabled),[tabindex="0"]')];const first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}return;}
    if(e.key==='Escape'){if(UI.modal){closeManualModal();}else if(game.state.mode==='map'&&!UI.hideMap){UI.hideMap=true;modalSignature='';render();}else{clearSelection();render();}return;}
    if((e.key==='Enter'||e.key===' ')&&document.activeElement?.matches('[data-room],[data-crew],[data-weapon-select],[data-node],[data-door]')){e.preventDefault();document.activeElement.dispatchEvent(new MouseEvent('click',{bubbles:true,shiftKey:e.shiftKey}));return;}
    if(e.key==='?'&&!UI.modal){e.preventDefault();openManualModal('help');return;}
    if(!$('modal').hidden)return;
    if(e.code==='Space'&&game.state.mode==='combat'&&!e.repeat&&(!document.activeElement?.matches('button')||document.activeElement?.id==='pause-btn')){e.preventDefault();game.togglePause();render();sound();}
    if(e.key.toLowerCase()==='c'&&!e.repeat&&game.state.mode==='combat'){e.preventDefault();order(()=>game.activateCloak());}
    if(e.key.toLowerCase()==='f'&&!e.repeat&&game.state.mode==='combat'){e.preventDefault();order(()=>game.fireAllReady());}
    if(/^[1-4]$/.test(e.key)){const w=game.state.player.weapons[Number(e.key)-1];if(w)chooseWeapon(w.id);}
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&game.state.mode==='combat'){game.setPaused(true);save();render();}});
  window.addEventListener('beforeunload',()=>{if(game.state.mode!=='briefing')save();});
  window.addEventListener('resize',()=>renderEffects());
  function frame(ts){
    const dt=lastFrame?Math.min(.1,(ts-lastFrame)/1000):0;lastFrame=ts;
    if(!document.hidden)game.tick(dt);drawClock+=dt;saveClock+=dt;
    if(drawClock>=.1){drawClock=0;render();}
    if(saveClock>=15){saveClock=0;if(game.state.mode==='combat')save();}
    requestAnimationFrame(frame);
  }
  UI.render=render;UI.toast=toast;UI.save=save;UI.load=loadSaved;
  render();requestAnimationFrame(frame);
})();
