/* Browser controls, accessible menus, local progression and audio. No network. */
(function () {
  'use strict';
  const D=globalThis.KR_DATA, $=id=>document.getElementById(id), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clamp=(v,a,b)=>Math.min(b,Math.max(a,v)), modeNames={campaign:'캠페인',heroic:'영웅 도전',iron:'강철 도전'}, familyNames={archer:'궁수',barracks:'병영',mage:'마법',artillery:'포병'};
  const icons={
    book:'<path d="M3 4h6q3 0 3 3 0-3 3-3h6v16h-6q-3 0-3 2 0-2-3-2H3zM12 7v15M6 8h3m6 0h3M6 12h3m6 0h3"/>',
    map:'<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2zM9 3v16M15 5v16"/>',
    star:'<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/>',
    settings:'<path d="m9 3-1 3-3 1 1 4-2 3 3 3 3-1 3 3 3-2 1-3 3-1-1-4-3-1-1-3z"/><circle cx="12" cy="11" r="3"/>',
    heart:'<path d="M20 4c-3-2-6 0-8 3-2-3-5-5-8-3-5 4 0 11 8 17C20 15 25 8 20 4Z"/>',
    coin:'<circle cx="12" cy="12" r="9"/><path d="M12 6v12m3-10h-5a2 2 0 0 0 0 4h4a2 2 0 0 1 0 4H9"/>',
    flag:'<path d="M5 22V3m0 1c6-4 8 4 15 0v10c-7 4-9-4-15 0"/>',
    pause:'<path d="M8 4v16M16 4v16" stroke-width="4"/>',
    play:'<path d="m8 4 12 8-12 8z"/>',
    volumeOff:'<path d="M11 4 5 9H2v6h3l6 5zM16 9l6 6m0-6-6 6"/>',
    volume:'<path d="M11 4 5 9H2v6h3l6 5zM15 7c4 2 4 8 0 10m3-13c7 4 7 12 0 16"/>',
    expand:'<path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6"/>',
    hammer:'<path d="m8 4 5-2 8 8-4 4-5-5-8 12-3-3 9-11z"/>',
    soldiers:'<path d="M2 21v-5l5-3 5 3v5M12 18l6-5 4 3v5M3 6l4-3 4 3v4l-4 3-4-3zM15 6l3-2 3 2v4l-3 3-3-3z"/>',
    flame:'<path d="M12 2c1 7 5 5 4 10 4-1 3-4 3-4 7 10 0 15-7 14C1 21 1 12 6 8c0 4 3 4 3 4-2-5 2-8 3-10Z"/><path d="M11 13c-5 6-1 9 3 7 3-2 0-5 0-5 0 3-2 2-3-2Z"/>',
    restart:'<path d="M3 10a9 9 0 1 1 1 9M3 3v7h7"/>',
    help:'<circle cx="12" cy="12" r="9"/><path d="M9 8c0-3 6-3 6 0 0 2-3 2-3 5m0 3v1"/>',
    target:'<circle cx="12" cy="12" r="7"/><path d="M12 1v7m0 8v7M1 12h7m8 0h7"/>',
    arrow:'<path d="M3 12h17m-6-7 7 7-7 7"/>',
    trash:'<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
    sword:'<path d="m4 21 6-6m-5-3 7 7m-4-7 10-10h4v4L12 16z"/>',
    shield:'<path d="M3 4h18v9c-1 5-5 8-9 10-4-2-8-5-9-10zM8 12l3 3 6-7"/>',
    close:'<path d="m5 5 14 14M19 5 5 19"/>'
  };
  const icon=(name)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]||icons.star}</svg>`;
  document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));
  function towerIcon(def) {
    const f=def.family,t=def.tier||1,c=f==='archer'?'#89aa57':f==='barracks'?'#6b8eaa':f==='mage'?'#9981c5':'#b48353';
    let art='';
    if(f==='archer')art=`<path d="M21 57V29h29v28" fill="#b0a480"/><path d="M18 31V18h7v5h6v-5h7v5h6v-5h8v13z" fill="#d0c197"/><path d="M18 31h35v5H18z" fill="${c}"/><path d="M29 41h8v16h-8z" fill="#39443c"/><path d="m43 28 9-13m-9 0c8 0 12 9 8 15m-8-15 8 15" fill="none" stroke="#ddc68b" stroke-width="2"/>`;
    if(f==='barracks')art=`<path d="M12 37h48v23H12z" fill="#b5ac8c"/><path d="M7 38 22 15h28l15 23z" fill="${c}"/><path d="m22 15 14 23h29L50 15z" fill="#47677b"/><path d="M29 44q7-7 14 0v16H29z" fill="#344740"/><path d="M17 44h6v9h-6zM49 44h6v9h-6z" fill="#d4bf7f"/><path d="M37 13V2l15 5-15 5" fill="#d3b765" stroke="#5b6351" stroke-width="1.5"/>`;
    if(f==='mage')art=`<path d="M23 60 26 27h20l4 33" fill="#a0a6a8"/><path d="m19 28 17-22 17 22z" fill="${c}"/><path d="m36 5 6 15-6 4-6-4z" fill="#c1dff2"/><path d="M31 37q5-7 10 0v9H31z" fill="#a0d9e6"/><path d="M21 48h29v5H21z" fill="#8274a0"/><circle cx="36" cy="10" r="4" fill="#c2f6ef"/>`;
    if(f==='artillery')art=`<path d="M12 57V38l10-10h28l12 10v19z" fill="#a89d7b"/><ellipse cx="36" cy="45" rx="25" ry="13" fill="#6e7873"/><path d="m25 44 8-26 14 3-4 27z" fill="#5e6d69"/><ellipse cx="40" cy="20" rx="8" ry="5" fill="#a5b0a1"/><ellipse cx="40" cy="20" rx="5" ry="3" fill="#253c35"/><path d="M16 52v7m40-7v7" stroke="#655946" stroke-width="6"/>`;
    const stars=t>1?`<text x="36" y="66" text-anchor="middle" fill="#f6d483" font-size="8" letter-spacing="2">${'◆'.repeat(t-1)}</text>`:'';
    return `<svg class="tower-icon" viewBox="0 0 72 70" aria-hidden="true"><ellipse cx="36" cy="60" rx="29" ry="6" fill="#0b1d1d66"/>${art}${stars}</svg>`;
  }
  const SAVE_KEY='kr_frontier_v18_progress',BATTLE_KEY='kr_frontier_v18_battle',LEGACY_KEYS=['kr_frontier_v17_progress','kr_frontier_v16_progress','kr_frontier_v15_progress'];
  let save=KRProgress.empty(),storageOK=true,battleStorageOK=true,lastBattleTime=-5,lastSavedAt=null,checkpointError='',pendingImport=null;
  try {save=KRProgress.normalize(D,JSON.parse(localStorage.getItem(SAVE_KEY)||LEGACY_KEYS.map(k=>localStorage.getItem(k)).find(Boolean)||'null'));}catch(e){storageOK=false;}
  const formatTime=t=>`${String(Math.floor(Math.max(0,t)/60)).padStart(2,'0')}:${String(Math.floor(Math.max(0,t)%60)).padStart(2,'0')}`;
  function syncStorageStatus(){
    $('saveStatus').textContent=storageOK&&battleStorageOK?'활성화':'현재 세션만';
    const el=$('autoSaveLabel');if(!el)return;
    el.dataset.state=storageOK&&battleStorageOK?'saved':'error';
    el.textContent=!battleStorageOK?'전투 저장 불가 · 설정에서 백업':!storageOK?'기록 저장 불가 · 설정에서 백업':world?.result?'전투 종료':lastSavedAt?`저장됨 · ${formatTime(lastBattleTime)}`:'저장 대기';
    el.title=!battleStorageOK?checkpointError:!storageOK?'별 기록과 설정을 브라우저에 저장하지 못했습니다. 설정에서 백업을 내려받으세요.':lastSavedAt?`최근 저장: ${new Date(lastSavedAt).toLocaleString('ko-KR')}`:'전투 명령과 전투 시간 5초마다 저장합니다.';
  }
  function persist(){try{localStorage.setItem(SAVE_KEY,JSON.stringify(save));storageOK=true;}catch(e){storageOK=false;}syncStorageStatus();}
  function sessionSnapshot(){return{format:'kingdom-rush-session',version:18,battle:KRCheckpoint.capture(world),camera:Cam.normalize(ui.camera)};}
  function writeBattle(){
    if(!world||!['ready','playing'].includes(world.state))return false;
    lastBattleTime=world.time;
    try{const session=sessionSnapshot();localStorage.setItem(BATTLE_KEY,JSON.stringify(session));lastSavedAt=session.battle.capturedAt;battleStorageOK=true;checkpointError='';}
    catch(e){battleStorageOK=false;checkpointError=e.message||'브라우저 저장에 실패했습니다.';}
    syncStorageStatus();return battleStorageOK;
  }
  function clearBattle(){try{localStorage.removeItem(BATTLE_KEY);battleStorageOK=true;lastSavedAt=null;}catch(e){battleStorageOK=false;checkpointError='완료된 전투 저장을 지울 수 없습니다.';}syncStorageStatus();}
  function earnedStars(){return Object.values(save.best).reduce((n,v)=>n+clamp(Number(v?.stars)||0,0,3),0);}
  function starTree(k){return(D.starUpgrades||[]).filter(u=>u.runtimeTree===k).sort((a,b)=>a.tier-b.tier);}
  function spentStars(profile=save.settings.ruleset){return profile==='reference'?Object.entries(save.referenceUpgrades).reduce((n,[k,r])=>n+starTree(k).filter(u=>u.tier<=r).reduce((a,u)=>a+u.costStars,0),0):Object.values(save.upgrades).reduce((n,r)=>n+r*(r+1)/2,0);}
  const profileNames={assisted:'웹 지원 규칙',reference:'자료 기준 규칙'},layoutNames={reconstructed:'복원 지도',authored:'웹 전용 지도'};
  const canvas=$('battleCanvas'), renderer=new KRRenderer(canvas,D);
  const ui={selectedSite:null,selectedTowerId:null,placementMode:null,pointer:null,selectedHero:false,selectedEnemyId:null,selectedFacilityId:null,camera:{zoom:1,x:0,y:0},showTactics:!!save.settings.tactics,viewport:{width:1000,height:620},pointerType:'mouse'};
  let world,pendingResultWorld=null,resultReadyAt=0,paused=false,modalKind=null,modalPriorFocus=null,finished=false,acc=0,last=0,lastUI=0,selectionKey='',nextKey='',speed=save.settings.speed,sound=!!save.settings.sound;
  let atlas,upgradeProfile=save.settings.ruleset,mapStage=D.stages[0].id,mapMode='campaign',audioCtx=null,ambienceAt=0,toastAt=0;
  function tone(freq,dur=.06,type='sine',gain=.035,slide=0){
    if(!sound)return;
    try{audioCtx=audioCtx||new(window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==='suspended')audioCtx.resume();const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=type;o.frequency.setValueAtTime(freq,audioCtx.currentTime);if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(20,freq+slide),audioCtx.currentTime+dur);g.gain.setValueAtTime(gain,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+dur);o.connect(g);g.connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+dur);}catch(e){}
  }
  function notify(text,warn=false){if(!text)return;const el=document.createElement('div');el.className='toast'+(warn?' warn':'');el.textContent=text;$('toasts').append(el);setTimeout(()=>el.remove(),2800);while($('toasts').children.length>3)$('toasts').firstChild.remove();}
  function command(result,quiet=false){if(result?.ok){if(!quiet)notify(result.message);tone(520,.07,'triangle',.035,140);selectionKey='';refresh(true);writeBattle();}else{notify(result?.message||'지금은 사용할 수 없습니다.',true);tone(160,.1,'triangle',.03,-40);}return !!result?.ok;}
  function activateWorld(nextWorld,resumed=false,camera){
    closeModal();world=nextWorld;
    paused=resumed;finished=false;pendingResultWorld=null;acc=0;last=0;pointers.clear();selectionKey='';nextKey='';lastBattleTime=world.time;
    Object.assign(ui,{selectedSite:null,selectedTowerId:null,placementMode:null,pointer:null,selectedHero:false,selectedEnemyId:null,selectedFacilityId:null,camera:Cam.normalize(camera)});updateZoomControls();
    mapStage=world.stage.id;mapMode=world.mode;
    $('stageName').textContent=world.stage.nameKo;$('stageEyebrow').textContent=`${world.mode==='campaign'?'CAMPAIGN':world.mode==='heroic'?'HEROIC CHALLENGE':'IRON CHALLENGE'} · ${String(world.stage.order).padStart(2,'0')}`;
    $('heroLabel').textContent=world.heroEnabled?'아렌 · 왕국의 수호자':'영웅 출전 제한';$('stageEyebrow').textContent+=` · ${profileNames[world.ruleset]} · ${layoutNames[world.layout]}`;$('tutorialHint').classList.toggle('hidden',save.tutorial||world.stage.order!==1);$('pauseOverlay').classList.toggle('hidden',!paused);
    updateTarget();refresh(true);renderer.resize();
  }
  function startStage(id,mode='campaign'){
    activateWorld(new KRWorld(D,id,{mode,difficulty:save.settings.difficulty,ruleset:save.settings.ruleset,layout:save.settings.layout,upgrades:{...(save.settings.ruleset==='reference'?save.referenceUpgrades:save.upgrades)},seed:15137}));writeBattle();
  }
  function openResume(){
    const cheats=world.stats.cheated?'<p class="source-note">실험실이 사용된 전투입니다. 완료해도 별 기록에 포함되지 않습니다.</p>':'';
    openModal('resume',heading('WELCOME BACK','지휘하던 전장으로','타워 배치, 적의 위치, 충전 시간까지 저장된 지점에서 이어집니다.')+`<div class="resume-summary"><h3>${esc(world.stage.nameKo)}</h3><p>${modeNames[world.mode]} · ${profileNames[world.ruleset]} · ${layoutNames[world.layout]}</p><div class="result-stats"><div><strong>${world.wave} / ${world.totalWaves}</strong><span>웨이브</span></div><div><strong>${world.lives}</strong><span>남은 생명</span></div><div><strong>${formatTime(world.time)}</strong><span>전투 시간</span></div></div><p>${Math.floor(world.gold).toLocaleString()} 골드 · 타워 ${world.towers.length}개 · 진격 중인 적 ${world.enemies.filter(e=>!e.dead).length}기</p></div>${cheats}<div class="session-actions"><button class="secondary-btn" data-modal="campaign">다른 전장 선택</button><button class="primary-btn" data-modal="continue">전투 이어하기</button></div><p class="source-note">전투는 일시정지 상태입니다. 다른 전장에 출전하면 이 전투 저장을 교체합니다.</p>`,true);
  }
  function chooseSite(i){ui.selectedSite=i;ui.selectedTowerId=world.towers.find(t=>t.siteIndex===i)?.id??null;ui.selectedFacilityId=world.getFacilityAtSite?.(i)?.id??null;ui.selectedHero=false;ui.selectedEnemyId=null;selectionKey='';refresh(true);tone(380,.035,'triangle',.02);}
  function selectTarget(mode){
    if(finished)return;
    if(mode==='hero'&&!world.heroEnabled){notify('이 전장의 자료 기준 규칙에서는 영웅을 사용할 수 없습니다.',true);return;}
    if(ui.placementMode===mode){cancelTarget();return;}
    if(['meteor','reinforcements'].includes(mode)){
      if(world.state!=='playing'){notify('먼저 웨이브를 시작하세요.',true);return;}
      if(world.spells[mode].remaining>0){notify('스킬이 충전 중입니다.',true);return;}
    }
    ui.placementMode=mode;ui.selectedHero=mode==='hero';updateTarget();tone(600,.06,'sine');
  }
  function cancelTarget(){ui.placementMode=null;ui.selectedHero=false;updateTarget();}
  function updateTarget(){const mode=ui.placementMode;$('targetBanner').classList.toggle('hidden',!mode);$('targetText').textContent=({meteor:'불의 비를 내릴 위치를 선택하세요',reinforcements:'길 위에 지원군을 배치하세요',hero:'아렌이 이동할 위치를 선택하세요',rally:'병영 가까운 길에 집결 지점을 지정하세요',facility_rally:'훈련소 가까운 길에 엘프 집결 위치를 지정하세요',sunray:'선레이로 공격할 적을 선택하세요'})[mode]||'';canvas.style.cursor=mode?'crosshair':ui.camera.zoom>1?'grab':'default';$('heroBtn').classList.toggle('selected',mode==='hero');$('reinforceBtn').classList.toggle('selected',mode==='reinforcements');$('meteorBtn').classList.toggle('selected',mode==='meteor');}
  const Cam=globalThis.KRCamera,pointers=new Map();
  function screenPoint(e){return Cam.fromClient(canvas.getBoundingClientRect(),e.clientX,e.clientY);}
  function pointFromEvent(e){const rect=canvas.getBoundingClientRect();ui.viewport={width:rect.width,height:rect.height};ui.pointerType=e.pointerType||ui.pointerType;return Cam.screenToWorld(ui.camera,Cam.fromClient(rect,e.clientX,e.clientY));}
  function enemyAt(p){return KRPicking.pickEnemy(world.enemies,p,ui.camera,ui.viewport,ui.pointerType);}
  function updateZoomControls(){
    $('zoomValue').textContent=Math.round(ui.camera.zoom*100)+'%';
    $('zoomOutBtn').disabled=ui.camera.zoom<=1.001;$('zoomInBtn').disabled=ui.camera.zoom>=2.999;
    $('zoomResetBtn').disabled=ui.camera.zoom<=1.001;
    $('cameraHint').textContent=ui.camera.zoom>1.001?'드래그 또는 작은 지도로 이동':'휠·두 손가락으로 확대';
    $('miniMap').classList.toggle('hidden',ui.camera.zoom<=1.001);
    canvas.classList.toggle('zoomed',ui.camera.zoom>1.001);canvas.style.cursor=ui.placementMode?'crosshair':ui.camera.zoom>1.001?'grab':'default';
  }
  function setZoom(value,anchor){ui.camera=Cam.zoomAt(ui.camera,value,anchor);updateZoomControls();}
  function recenterMiniMap(e){if(modalKind)return;const r=$('miniMap').getBoundingClientRect(),x=clamp((e.clientX-r.left)/r.width,0,1)*1000,y=clamp((e.clientY-r.top)/r.height,0,1)*620;ui.camera=Cam.normalize({...ui.camera,x:x-500/ui.camera.zoom,y:y-310/ui.camera.zoom});ui.pointer=null;}
  $('miniMap').addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();$('miniMap').focus({preventScroll:true});$('miniMap').setPointerCapture(e.pointerId);recenterMiniMap(e);});
  $('miniMap').addEventListener('pointermove',e=>{if($('miniMap').hasPointerCapture(e.pointerId))recenterMiniMap(e);});
  $('miniMap').addEventListener('pointerup',e=>{if($('miniMap').hasPointerCapture(e.pointerId))$('miniMap').releasePointerCapture(e.pointerId);});
  $('miniMap').addEventListener('keydown',e=>{const d={ArrowLeft:[-50,0],ArrowRight:[50,0],ArrowUp:[0,-35],ArrowDown:[0,35]}[e.key];if(!d||modalKind)return;e.preventDefault();e.stopPropagation();ui.camera=Cam.normalize({...ui.camera,x:ui.camera.x+d[0]/ui.camera.zoom,y:ui.camera.y+d[1]/ui.camera.zoom});});
  function drawMiniMap(){
    const el=$('miniMap');if(el.classList.contains('hidden'))return;
    const c=el.getContext('2d'),sx=el.width/1000,sy=el.height/620;c.setTransform(sx,0,0,sy,0,0);c.fillStyle=world.stage.biome==='snow'?'#849e97':world.stage.biome==='ash'?'#655443':'#40533b';c.fillRect(0,0,1000,620);
    c.strokeStyle='#c3ad7f';c.lineWidth=17;c.lineCap='round';for(const path of world.paths){c.beginPath();path.points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.stroke();}
    c.fillStyle='#e4cf8c';for(const t of world.towers)c.fillRect(t.x-9,t.y-9,18,18);
    for(const e of world.enemies){if(e.dead||e.hp<=0)continue;c.fillStyle=e.air?'#b0dce9':'#f18b6b';c.beginPath();c.arc(e.x,e.y,e.boss?12:7,0,Math.PI*2);c.fill();}
    if(world.heroEnabled&&world.hero.hp>0){c.fillStyle='#96d7e8';c.fillRect(world.hero.x-11,world.hero.y-11,22,22);}
    const cam=Cam.normalize(ui.camera);c.fillStyle='rgba(250,235,171,.12)';c.fillRect(cam.x,cam.y,1000/cam.zoom,620/cam.zoom);c.strokeStyle='#fff0bd';c.lineWidth=9;c.strokeRect(cam.x,cam.y,1000/cam.zoom,620/cam.zoom);
  }
  $('zoomInBtn').onclick=()=>setZoom(ui.camera.zoom+.5);
  $('zoomOutBtn').onclick=()=>setZoom(ui.camera.zoom-.5);
  $('zoomResetBtn').onclick=()=>setZoom(1);
  canvas.addEventListener('wheel',e=>{if(modalKind)return;e.preventDefault();const dy=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?620:1);setZoom(ui.camera.zoom*Math.exp(-clamp(dy,-200,200)*.002),screenPoint(e));ui.pointer=pointFromEvent(e);},{passive:false});
  canvas.addEventListener('pointerdown',e=>{
    if(e.button!==0&&e.button!==1)return;
    const p={clientX:e.clientX,clientY:e.clientY,startX:e.clientX,startY:e.clientY,moved:e.button===1};
    pointers.set(e.pointerId,p);if(pointers.size>1)for(const v of pointers.values())v.moved=true;
    canvas.setPointerCapture(e.pointerId);canvas.focus({preventScroll:true});
  });
  canvas.addEventListener('pointermove',e=>{
    ui.pointer=pointFromEvent(e);const p=pointers.get(e.pointerId);if(!p)return;
    const before=[...pointers.values()].slice(0,2).map(v=>({...v}));
    const dx=e.clientX-p.clientX,dy=e.clientY-p.clientY;p.clientX=e.clientX;p.clientY=e.clientY;
    if(pointers.size>=2){
      const after=[...pointers.values()].slice(0,2),r=canvas.getBoundingClientRect();
      const mid=a=>({clientX:(a[0].clientX+a[1].clientX)/2,clientY:(a[0].clientY+a[1].clientY)/2});
      const b=mid(before),a=mid(after),bp=Cam.fromClient(r,b.clientX,b.clientY),ap=Cam.fromClient(r,a.clientX,a.clientY);
      const dist=a=>Math.hypot(a[0].clientX-a[1].clientX,a[0].clientY-a[1].clientY);
      if(dist(before)>2)ui.camera=Cam.zoomAt(ui.camera,ui.camera.zoom*dist(after)/dist(before),bp);
      ui.camera=Cam.panBy(ui.camera,ap.x-bp.x,ap.y-bp.y);for(const v of pointers.values())v.moved=true;
      updateZoomControls();ui.pointer=null;return;
    }
    if(Math.hypot(e.clientX-p.startX,e.clientY-p.startY)>8)p.moved=true;
    if(p.moved&&ui.camera.zoom>1){const r=canvas.getBoundingClientRect();ui.camera=Cam.panBy(ui.camera,dx*1000/r.width,dy*620/r.height);ui.pointer=pointFromEvent(e);}
  });
  canvas.addEventListener('pointerleave',()=>{if(!pointers.size)ui.pointer=null;$('floatTip').classList.add('hidden');});
  canvas.addEventListener('pointercancel',e=>{pointers.delete(e.pointerId);for(const v of pointers.values())v.moved=true;ui.pointer=null;});
  canvas.addEventListener('lostpointercapture',e=>pointers.delete(e.pointerId));
  canvas.addEventListener('pointerup',e=>{
    const p0=pointers.get(e.pointerId);pointers.delete(e.pointerId);if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
    if(!p0||p0.moved||pointers.size||Math.hypot(e.clientX-p0.startX,e.clientY-p0.startY)>8)return;
    if(paused||modalKind||finished)return;const p=pointFromEvent(e);ui.pointer=p;
    if(ui.placementMode){let result;
      if(ui.placementMode==='hero')result=world.moveHero(p.x,p.y);
      else if(ui.placementMode==='rally')result=world.setRally(ui.selectedTowerId,p.x,p.y);
      else if(ui.placementMode==='facility_rally')result=world.setFacilityRally(ui.selectedFacilityId,p.x,p.y);
      else if(ui.placementMode==='sunray'){const enemy=enemyAt(p);result=enemy?world.fireSunray(ui.selectedFacilityId,enemy.id):{ok:false,message:'공격할 적의 몸체를 선택하세요.'};}
      else result=world.cast(ui.placementMode,p.x,p.y);
      if(command(result,true)){if(ui.placementMode==='meteor')tone(100,.5,'sawtooth',.025,-70);if(ui.placementMode==='sunray')tone(880,.18,'sine',.035,-500);cancelTarget();}return;
    }
    const bodyTower=[...world.towers].reverse().find(t=>Math.abs(t.x-p.x)<38&&p.y>t.y-88&&p.y<t.y+22);
    if(bodyTower){chooseSite(bodyTower.siteIndex);return;}
    const special=world.facilities?.find(f=>Math.abs(f.x-p.x)<35&&p.y>f.y-58&&p.y<f.y+32);
    if(special){chooseSite(special.siteIndex);return;}
    let best=-1,dist=42;world.stage.sites.forEach((s,i)=>{let d=Math.hypot(s.x-p.x,s.y-p.y);if(d<dist){best=i;dist=d;}});if(best>=0){chooseSite(best);return;}
    const enemy=enemyAt(p);
    if(enemy){if((enemy.sheep||enemy.polymorphed)&&typeof world.tapEnemy==='function')command(world.tapEnemy(enemy.id),true);else{ui.selectedEnemyId=enemy.id;ui.selectedSite=null;ui.selectedTowerId=null;ui.selectedFacilityId=null;selectionKey='';refresh(true);}return;}
    if(world.hero.hp>0&&Math.hypot(world.hero.x-p.x,world.hero.y-p.y)<30){selectTarget('hero');return;}
    ui.selectedSite=null;ui.selectedTowerId=null;ui.selectedFacilityId=null;ui.selectedEnemyId=null;selectionKey='';refresh(true);
  });
  canvas.addEventListener('contextmenu',e=>{e.preventDefault();cancelTarget();});
  function title(eyebrow,name,sub){$('panelEyebrow').textContent=eyebrow;$('panelTitle').textContent=name;$('panelSubtitle').textContent=sub;}
  function facilityHTML(f){
    const info=world.facilityInfo(f),def=D.specialComponents?.facilities?.[f.type],elf=f.type==='sylvan_elf_hall',cost=info.hireCost,cap=elf?info.maxUnits:info.maxWorkers;
    title('SPECIAL FACILITY · '+world.stage.sites[f.siteIndex].label,def?.name||'특수 시설',elf?'궁술과 근접전에 능한 숲의 수호자':'전장 어디든 직접 조준하는 태양 광선');
    if(!f.restored)return `<div class="facility-emblem elf">${icon('soldiers')}</div><p class="facility-description">오래된 훈련소를 수리하면 엘프를 고용할 수 있습니다. 최대 4명이 길을 지키고 공중의 적에게도 활을 쏩니다.</p><button id="facilityRepairBtn" class="primary-btn facility-main" data-facility="restore" ${world.gold<info.repairCost||finished?'disabled':''}>훈련소 수리 <span>${info.repairCost} G</span></button><p class="build-footnote">수리한 시설은 판매할 수 없습니다.</p><button class="secondary-btn facility-data" data-open-atlas="components">시설 능력·자료 보기</button>`;
    const count=elf?info.count:info.workers,filled=count>=cap,damage=info.damage||[0,0],pct=elf?100:info.workers?Math.max(0,100*(1-info.remaining/Math.max(1,info.cooldown))):0;
    const units=elf?world.units.filter(u=>u.ownerId===f.id&&u.hp>0):[];
    return `<div class="facility-header"><div class="facility-emblem ${elf?'elf':'sunray'}">${icon(elf?'soldiers':'target')}</div><div><strong>${elf?'고용한 엘프':'집중하는 마법사'}</strong><span class="facility-slots">${'●'.repeat(count)}${'○'.repeat(Math.max(0,cap-count))}</span><small>${count} / ${cap}명</small></div></div><div class="tower-stats facility-stats"><span>${elf?'엘프 체력':'고정 피해'} <b>${elf?info.hp:count?damage.join('–'):'마법사 필요'}</b></span><span>${elf?'근접 공격':'충전 시간'} <b>${elf?damage.join('–'):count?info.cooldown+'초':'—'}</b></span><span>${elf?'집결 범위':'공격 범위'} <b>${elf?Math.round(info.rallyRange):'전장 전체'}</b></span></div>${elf?`<div class="elf-roster">${units.map((u,i)=>`<div><span>엘프 ${i+1}</span><i><b style="width:${clamp(u.hp/u.maxHp*100,0,100)}%"></b></i><small>${Math.ceil(u.hp)}</small></div>`).join('')||'<p>첫 엘프를 고용해 방어선을 강화하세요.</p>'}</div>`:`<div class="facility-charge"><span>${!count?'마법사를 배치하세요':info.remaining>.01?`충전 중 · ${Math.ceil(info.remaining)}초`:'발사 준비 완료'}</span><i><b style="width:${pct}%"></b></i></div>`}<button id="facilityHireBtn" class="upgrade-option facility-hire" data-facility="hire" ${filled||world.gold<cost||finished?'disabled':''}><div><strong>${filled?'최대 인원 배치':elf?'엘프 고용':'마법사 추가'}</strong><small>${elf?'자동 부활 없음 · 사망하면 재고용':'인원마다 피해 상승 · 충전 단축'}</small></div><span class="price">${filled?'MAX':cost+' G'}</span></button>${elf?`<button id="facilityRallyBtn" class="secondary-btn facility-main" data-facility="rally" ${finished?'disabled':''}>${icon('flag')} 엘프 집결 위치</button>`:`<button id="facilityFireBtn" class="primary-btn facility-main" data-facility="fire" ${!info.ready||finished?'disabled':''}>${icon('target')} ${world.state==='ready'?'전투 시작 후 조준':info.remaining>.01?`충전 중 · ${Math.ceil(info.remaining)}초`:'선레이 조준'}</button><p class="build-footnote">버튼을 누른 뒤 적을 선택하세요. 지상·공중의 적 하나를 공격합니다.</p>`}<div class="tower-telemetry"><span>누적 피해 <b>${Math.round(f.damage||0).toLocaleString()}</b></span><span>처치 <b>${f.kills||0}</b></span></div><button class="secondary-btn facility-data" data-open-atlas="components">시설 능력·자료 보기</button>`;
  }
  function refreshFieldEvents(){
    const states=(world.stageEventState||[]).filter(e=>e.enabled),panel=$('fieldEventPanel');
    panel.classList.toggle('hidden',!states.length);if(!states.length)return;
    const rows=states.map(e=>{const remaining=Math.max(0,Math.ceil(e.remaining||0)),time=e.status==='waiting'?'첫 웨이브 이후 시작':e.status==='stopped'?'이벤트 종료':`${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')} 후 분출`;return `<div class="field-event ${e.status==='armed'&&remaining<=10?'imminent':''}"><span>${icon('flame')} ${esc(e.nameKo||'전장 이벤트')}</span><strong>${time}</strong><small>추가 출현 ${e.count||0}회 · 일반 웨이브와 별도</small></div>`;}).join('');
    if(panel.innerHTML!==rows)panel.innerHTML=rows;
  }
  function selectionHTML(){
    const enemy=world.enemies.find(e=>e.id===ui.selectedEnemyId&&!e.dead);
    if(enemy){const d=D.enemies[enemy.defId];title(enemy.boss?'BOSS ENCOUNTER':'ENEMY INTELLIGENCE',d.nameKo||d.name,enemy.air?'공중 · 지상 병력으로 저지할 수 없음':'지상 · 경로를 따라 진격');return`<div class="tower-detail"><div class="tower-stats"><span>체력 <b>${Math.ceil(enemy.hp)} / ${Math.ceil(enemy.maxHp)}</b></span><span>물리 방어 <b>${Math.round(enemy.armor*100)}%</b></span><span>마법 저항 <b>${Math.round(enemy.resist*100)}%</b></span><span>처치 보상 <b>${d.gold} G</b></span></div></div><p class="source-note">${enemy.armor>.3?'마법 타워로 높은 물리 방어를 공략하세요.':enemy.resist>.3?'궁수와 포병으로 마법 저항을 돌파하세요.':enemy.air?'궁수와 마법 타워로 공중 경로를 방어하세요.':'병영과 지원군으로 적을 붙잡고 타워의 공격을 집중하세요.'}${d.ranged?' 이 적은 사거리 안의 아군에게 원거리 공격을 합니다.':''}</p><button class="secondary-btn" data-open-enemy="${d.id}">능력·출현 전장 보기</button><button class="secondary-btn" data-action="deselect">건설 메뉴</button>`;}
    if(ui.selectedEnemyId)ui.selectedEnemyId=null;
    const t=world.towers.find(t=>t.id===ui.selectedTowerId),site=world.stage.sites[ui.selectedSite];
    if(!t){
      const picked=ui.selectedSite!==null;title('BUILD YOUR DEFENSE',picked?`건설 지점 ${site?.label||String(ui.selectedSite+1).padStart(2,'0')}`:'방어선 구축',picked?'이곳에 세울 타워를 선택하세요.':'길 옆의 + 건설 터를 선택하세요.');
      if(site?.buildable===false&&world.getFacilityAtSite?.(ui.selectedSite))return facilityHTML(world.getFacilityAtSite(ui.selectedSite));
      if(site?.buildable===false){title('SPECIAL LOCATION',site.specialStructureName||'특수 시설','고유 기능과 위치를 확인하세요.');return`<div class="special-site-card"><div class="result-crest">${icon('flag')}</div><h3>${esc(site.specialStructureName||'특수 시설')}</h3><p>지도 자료에서 확인한 특수 시설입니다. 이 버전에는 위치를 복원했으며, 고유 작동 규칙은 아직 구현하지 않았습니다.</p><button class="secondary-btn" data-open-atlas="levels">전장 도감에서 보기</button></div>`;}
      const info={archer:'빠른 공격 · 지상/공중',barracks:'병사 3명 · 진로 차단',mage:'마법 공격 · 방어 관통',artillery:'범위 피해 · 지상 공격'};
      return `<div class="build-grid">${Object.values(D.towers).filter(d=>d.tier===1).map(d=>{const available=world.getAvailability(d.id),cost=world.towerCost(d.id);return`<button class="build-card ${picked?'':'unselected'}" data-build="${d.id}" ${(!available.ok||picked&&world.gold<cost)?'disabled':''} title="${esc(available.ok?info[d.family]:available.message)}">${towerIcon(d)}<strong>${esc(familyNames[d.family])} ${d.family==='barracks'?'':'타워'}</strong><span class="family-tag">${available.ok?info[d.family]:esc(available.message)}</span><span class="price">${icon('coin')}${cost}</span></button>`;}).join('')}</div><p class="build-footnote">${world.ruleset==='reference'?'타워 해금 순서와 이 도전의 사용 제한이 적용됩니다.':picked?'각 타워는 3단계를 거쳐 두 가지 전문 타워로 진화합니다.':'첫 방어선: 궁수로 길을 덮고 병영으로 적을 붙잡으세요.'}</p>`;
    }
    const d=D.towers[t.defId],rally=d.family==='barracks'||t.skills.summon_elemental;
    title(`TOWER · TIER ${d.tier} · ${site?.label||String(t.siteIndex+1).padStart(2,'0')}`,d.nameKo,({archer:'빠르고 정확한 원거리 공격',barracks:'전선을 지키는 왕국의 병사',mage:'단단한 방어를 깨는 마법',artillery:'밀집한 적을 무너뜨리는 화력'})[d.family]);
    const liveSoldier=world.units.find(u=>u.ownerId===t.id),stat=d.family==='barracks'?`<span>병사 체력 <b>${Math.ceil(liveSoldier?.maxHp||d.soldierHp)}</b></span><span>기본 공격 <b>${d.damageMin}–${d.damageMax}</b></span><span>집결 범위 <b>${Math.round(world.rallyRange(t))}</b></span>`:`<span>기본 공격 <b>${d.damageMin}–${d.damageMax}</b></span><span>공격 간격 <b>${d.interval}초</b></span><span>현재 사거리 <b>${Math.round(world.range(t))}</b></span>`;
    const targets={first:'선두 우선',strongest:'최대 체력 우선',closest:'가까운 적 우선',air:'공중 우선'};
    return `<div class="tower-detail">${towerIcon(d)}<div class="tower-stats">${stat}</div></div><div class="tower-telemetry"><span>누적 피해 <b>${Math.round(t.damage||0).toLocaleString()}</b></span><span>처치 <b>${t.kills||0}</b></span></div>${d.family!=='barracks'?`<label class="target-controls">공격 우선순위<select id="targetMode" class="target-select" aria-label="타워 공격 우선순위">${Object.entries(targets).map(([k,n])=>`<option value="${k}" ${(t.targetMode||'first')===k?'selected':''}>${n}</option>`).join('')}</select></label>`:''}${d.upgrades.map(id=>{const n=D.towers[id],availability=world.getAvailability(id),cost=world.towerCost(id);return`<button class="upgrade-option" data-upgrade="${id}" ${!availability.ok||world.gold<cost?'disabled':''}>${towerIcon(n)}<div><strong>${esc(n.nameKo)}</strong><small>${availability.ok?n.tier===4?'전문 타워로 진화':'타워 강화 · 단계 '+n.tier:esc(availability.message)}</small></div><span class="price">${icon('coin')}${cost}</span></button>`;}).join('')}${(d.abilities||[]).map(id=>{const a=D.abilities[id],rank=t.skills[id]||0,max=a.maxLevel,cost=world.abilityCost(t.id,id);return`<button class="skill-option" data-skill="${id}" ${rank>=max||world.gold<cost?'disabled':''} title="${esc(a.description)}"><div><strong>${esc(a.nameKo)} <span class="skill-dots">${'●'.repeat(rank)}${'○'.repeat(max-rank)}</span></strong><small>${esc(a.description)}</small></div><span class="price">${rank>=max?'MAX':icon('coin')+cost}</span></button>`;}).join('')}${d.tier===4?'<div class="max-label">전문 타워 · 능력을 강화하세요</div>':''}<div class="tower-actions">${rally?`<button data-action="rally">${icon('flag')}집결 위치</button>`:''}<button class="sell-btn" data-action="sell">${icon('coin')}판매 +${Math.floor(t.invested*world.refundFraction(t))}</button></div><p class="build-footnote">현재 환급률 ${Math.round(world.refundFraction(t)*100)}% · 전투 전에는 100% 환급</p><button class="secondary-btn" data-open-tower="${d.id}">능력·자료 상세 보기</button>`;
  }
  $('selectionPanel').addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b||b.disabled)return;
    if(b.dataset.openEnemy){atlas.show('enemies',b.dataset.openEnemy);return;}
    if(b.dataset.openTower){atlas.show('towers',b.dataset.openTower);return;}
    if(b.dataset.openAtlas){atlas.show(b.dataset.openAtlas);return;}
    if(b.dataset.facility){const f=world.getFacility(ui.selectedFacilityId);if(!f)return;if(b.dataset.facility==='restore')command(world.restoreFacility(f.id));if(b.dataset.facility==='hire')command(world.hireFacilityUnit(f.id));if(b.dataset.facility==='rally')selectTarget('facility_rally');if(b.dataset.facility==='fire'&&world.facilityInfo(f).ready)selectTarget('sunray');return;}
    if(b.dataset.build){if(ui.selectedSite===null){notify('먼저 전장의 + 건설 터를 선택하세요.');return;}if(command(world.build(ui.selectedSite,b.dataset.build))){ui.selectedTowerId=world.towers.find(t=>t.siteIndex===ui.selectedSite).id;save.tutorial=true;$('tutorialHint').classList.add('hidden');persist();selectionKey='';refresh(true);}}
    if(b.dataset.upgrade)command(world.upgrade(ui.selectedTowerId,b.dataset.upgrade));
    if(b.dataset.skill)command(world.buySkill(ui.selectedTowerId,b.dataset.skill));
    if(b.dataset.action==='rally')selectTarget('rally');
    if(b.dataset.action==='sell'){if(command(world.sell(ui.selectedTowerId))){if(ui.placementMode==='rally')cancelTarget();ui.selectedTowerId=null;selectionKey='';refresh(true);}}
    if(b.dataset.action==='deselect'){ui.selectedEnemyId=null;selectionKey='';refresh(true);}
  });
  $('selectionPanel').addEventListener('change',e=>{if(e.target.id==='targetMode')command(world.setTargetMode(ui.selectedTowerId,e.target.value),true);});
  function refresh(force=false){
    if(!world)return;
    $('goldValue').textContent=Math.floor(world.gold).toLocaleString();$('livesValue').textContent=Math.max(0,world.lives);$('waveValue').textContent=`${world.wave} / ${world.totalWaves}`;
    $('combatClock').textContent=formatTime(world.time);$('continueBtn').classList.toggle('hidden',!paused||finished);
    $('mapStatus').textContent=(canvas.clientWidth<600?world.stage.nameKo+' · ':'')+(world.state==='ready'?'방어선 준비':world.state==='won'?'왕국을 지켜냈습니다':world.state==='lost'?'방어선 붕괴':`전투 중 · ${world.enemies.filter(e=>!e.dead).length}기 진격`);
    $('speedBtn').textContent=speed+'×';$('pauseBtn').innerHTML=icon(paused?'play':'pause');$('pauseBtn').setAttribute('aria-label',paused?'계속하기':'일시정지');$('soundBtn').innerHTML=icon(sound?'volume':'volumeOff');$('soundBtn').setAttribute('aria-label',sound?'소리 끄기':'소리 켜기');
    $('tacticsBtn').classList.toggle('active',ui.showTactics);$('tacticsBtn').setAttribute('aria-pressed',String(ui.showTactics));
    $('heroHealth').style.width=(world.heroEnabled?clamp(world.hero.hp/world.hero.maxHp*100,0,100):0)+'%';$('heroLevel').textContent=world.heroEnabled?'LV '+world.hero.level:'—';
    $('heroState').textContent=!world.heroEnabled?'이 전장의 규칙에서 사용할 수 없음':world.hero.hp<=0?`회복 중 · ${Math.ceil(Math.max(0,world.hero.deadUntil-world.time))}초`:`체력 ${Math.ceil(world.hero.hp)} / ${Math.ceil(world.hero.maxHp)}`;
    $('heroBtn').disabled=!world.heroEnabled||world.hero.hp<=0||finished;
    for(const [id,short]of[['reinforcements','reinforce'],['meteor','meteor']]){const s=world.spells[id];$(short+'State').textContent=s.remaining>.1?`${Math.ceil(s.remaining)}초`:'준비 완료';$(short+'Shade').style.height=clamp(s.remaining/s.total*100,0,100)+'%';$(short+'Btn').disabled=s.remaining>.1||finished;}
    const tower=world.towers.find(t=>t.id===ui.selectedTowerId),enemy=world.enemies.find(e=>e.id===ui.selectedEnemyId&&!e.dead);
    const facility=world.getFacility?.(ui.selectedFacilityId),facilityInfo=facility?world.facilityInfo(facility):null;
    const key=[facility?.restored,facilityInfo?.count,facilityInfo?.workers,Math.ceil(facilityInfo?.remaining||0),facility?.kills,Math.floor(facility?.damage||0),facilityInfo?.ready,facility?world.units.filter(u=>u.ownerId===facility.id&&u.hp>0).map(u=>Math.ceil(u.hp)).join(','):'',ui.selectedSite,ui.selectedTowerId,world.gold,tower?.defId,JSON.stringify(tower?.skills),enemy?.id,enemy?Math.ceil(enemy.hp):'',world.wave,world.state,tower?.targetMode,Math.floor((tower?.damage||0)/5),tower?.kills].join('|');
    if((force||selectionKey!==key)&&document.activeElement?.id!=='targetMode'){selectionKey=key;const focused=document.activeElement,focusId=$('selectionPanel').contains(focused)?focused?.id:null;$('selectionPanel').innerHTML=selectionHTML();if(focusId)document.getElementById(focusId)?.focus({preventScroll:true});}
    const next=world.waveDefs[Math.min(world.wave,world.totalWaves-1)]||[];
    const nk=world.stage.id+world.mode+world.wave;
    if(force||nextKey!==nk){nextKey=nk;$('nextWaveNumber').textContent=world.wave>=world.totalWaves?'FINAL WAVE':`WAVE ${String(world.wave+1).padStart(2,'0')}`;const totals={};for(const g of next)totals[g.enemy]=(totals[g.enemy]||0)+g.count;$('nextEnemies').innerHTML=Object.entries(totals).map(([id,n])=>`<span class="enemy-chip ${D.enemies[id]?.air?'air':''}" title="${esc(D.enemies[id]?.name||id)}">${esc(D.enemies[id]?.nameKo||id)}<b>${n}</b></span>`).join('');}
    const final=world.wave>=world.totalWaves;
    $('waveBtn').disabled=finished||!world.canCallWave||final;
    $('waveButtonLabel').textContent=world.wave===0?'전투 시작':final?'마지막 방어전':'다음 웨이브 호출';
    $('waveButtonSub').textContent=world.wave===0?'준비가 되면 출발하세요':final?'남은 적을 모두 처치하세요':world.canCallWave?`조기 호출 +${Math.floor(world.nextWaveIn*.65)} 골드`:'적이 진입하고 있습니다';
    $('waveTip').textContent=world.wave===0?'배치를 마치면 첫 웨이브를 시작하세요.':final?'끝까지 버티세요. 마지막 적까지 막으면 승리합니다.':`다음 공격까지 ${Math.ceil(Math.max(0,world.nextWaveIn))}초 · 조기 호출하면 골드와 스킬 충전을 얻습니다.`;
    refreshFieldEvents();
    while(world.notifications?.length){const message=world.notifications.shift();if(world.state!=='ready')notify(message);}
    if(world.result&&!finished){finished=true;paused=false;cancelTarget();$('pauseOverlay').classList.add('hidden');$('continueBtn').classList.add('hidden');if(world.result.won&&!world.result.cheated){const k=world.stage.id+':'+world.mode,incoming=KRProgress.empty();incoming.best[k]={stars:world.result.stars,bestKills:world.result.kills};incoming.records[[k,world.ruleset,world.layout,world.difficulty].join(':')]={...world.result};save=KRProgress.merge(D,save,incoming);persist();}clearBattle();pendingResultWorld=world;resultReadyAt=performance.now()+650;}
  }
  function togglePause(value){if(finished)return;paused=value===undefined?!paused:!!value;acc=0;$('pauseOverlay').classList.toggle('hidden',!paused);refresh(true);writeBattle();}
  function openModal(kind,html,compact=false){writeBattle();const focusId=document.activeElement?.id;modalKind=kind;acc=0;if(!modalPriorFocus)modalPriorFocus=document.activeElement;$('modalRoot').innerHTML=`<div class="modal ${compact?'compact':''} ${kind==='atlas'?'atlas-modal':''}">${html}</div>`;$('modalRoot').classList.remove('hidden');$('modalRoot').setAttribute('aria-label',({campaign:'원정 지도',settings:'설정',upgrades:'왕국 강화',help:'플레이 가이드',data:'구현 및 데이터 안내',result:'전투 결과',restart:'다시 시작',atlas:'전장 도감',resume:'저장된 전투',import:'기록 가져오기'})[kind]||'게임 메뉴');document.body.style.overflow='hidden';setTimeout(()=>{const old=focusId&&document.getElementById(focusId);(old&&$('modalRoot').contains(old)?old:$('modalRoot').querySelector('button,select'))?.focus({preventScroll:true});},0);}
  function closeModal(){if(!modalKind)return;modalKind=null;$('modalRoot').classList.add('hidden');$('modalRoot').innerHTML='';document.body.style.overflow='';acc=0;modalPriorFocus?.focus?.({preventScroll:true});modalPriorFocus=null;}
  const heading=(tag,name,sub='')=>`<div class="modal-head"><div><span class="eyebrow">${tag}</span><h2>${name}</h2>${sub?`<p>${sub}</p>`:''}</div><button class="close-btn" data-modal="close" aria-label="닫기">×</button></div>`;
  function mapArt(s){const snow=s.biome==='snow',ash=s.biome==='ash',base=snow?'#a7babe':ash?'#6a6352':'#789759',path=snow?'#d6d4bd':ash?'#97866a':'#c8b37e',tree=snow?'#5e8279':ash?'#4f5545':'#456e42';const geo=stageGeometry(s);const paths=geo.paths.map(p=>`<polyline points="${p.map(x=>x.join(',')).join(' ')}" fill="none" stroke="${path}" stroke-width="37" stroke-linejoin="round"/>`).join('');return `<svg viewBox="0 0 1000 620" preserveAspectRatio="xMidYMid slice"><rect width="1000" height="620" fill="${base}"/>${paths}${geo.sites.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="20" fill="#dbd1ae" stroke="#776e4f" stroke-width="5"/>`).join('')}<path d="M60 410 10 510h100zm100-370-45 100h90zM470 35l-45 100h90zM740 480l-50 110h100zM900 20l-45 90h90z" fill="${tree}"/></svg>`;}
  function stageGeometry(s){return save.settings.layout==='reconstructed'&&s.referencePaths?.length?{paths:s.referencePaths,sites:s.referenceSites}:{paths:s.paths,sites:s.sites};}
  function profileControls(){return`<div class="profile-selects"><label>전투 규칙<select id="rulesetSelect" aria-label="전투 규칙">${Object.entries(profileNames).map(([k,n])=>`<option value="${k}" ${save.settings.ruleset===k?'selected':''}>${n}</option>`).join('')}</select></label><label>지도 구성<select id="layoutSelect" aria-label="지도 구성">${Object.entries(layoutNames).map(([k,n])=>`<option value="${k}" ${save.settings.layout===k?'selected':''}>${n}</option>`).join('')}</select></label></div>`;}
  function campaign(){
    const st=D.stages.find(s=>s.id===mapStage)||D.stages[0],geo=stageGeometry(st),isRef=save.settings.ruleset==='reference',m=isRef?st.originalModes?.[mapMode]||st.modes[mapMode]:st.modes[mapMode],gold=m.resolvedStartingGold??m.startingGold,available=(st.availableTowerIdsAtStart||[]).length;
    openModal('campaign',heading('THE KINGDOM AWAITS','왕국의 방어선','숲을 지나 설원과 잿빛 황무지까지. 다음 전장을 선택하세요.')+profileControls()+`<div class="campaign-cards">${D.stages.map(s=>{const stars=save.best[s.id+':'+mapMode]?.stars||0;return`<button class="stage-card ${s.id===mapStage?'selected':''}" data-stage="${s.id}"><div class="stage-art">${mapArt(s)}<span class="stage-index">${String(s.order).padStart(2,'0')}</span></div><strong>${esc(s.nameKo)}</strong><span class="stars ${stars?'':'empty'}">${'★'.repeat(stars)}${'☆'.repeat((mapMode==='campaign'?3:1)-Math.min(stars,mapMode==='campaign'?3:1))}</span></button>`;}).join('')}</div><div class="campaign-brief"><div><strong>${geo.paths.length}</strong><span>진입 경로</span></div><div><strong>${geo.sites.filter(s=>s.buildable!==false).length}</strong><span>타워 지점</span></div><div><strong>${gold??'미확정'}</strong><span>시작 골드${!isRef&&save.settings.difficulty==='casual'?' + 120':''}</span></div><div><strong>${m.heroAllowed===false?'제한':'출전'}</strong><span>영웅</span></div></div><div class="campaign-bottom"><div><div class="mode-options">${Object.entries(modeNames).map(([id,n])=>`<button data-mode="${id}" class="${id===mapMode?'active':''}">${n}</button>`).join('')}</div><p style="font-size:13px;margin:8px 0 0">${m.lives||20} 생명 · ${st.waves[mapMode].length} 웨이브${isRef&&m.starUpgradeTierCap?` · 별 강화 ${m.starUpgradeTierCap}단계 제한`:''}</p></div><button class="primary-btn" data-modal="start">${esc(st.nameKo)} 출전</button></div><p class="source-note">${isRef?'자료 기준 규칙: 기록된 시작 골드, 타워 해금, 영웅 제한, 별 강화를 적용합니다. 좌표·생성 시간·미확정 규칙은 웹 구현 보완값을 사용합니다.':'웹 지원 규칙: 시작 골드 보정, 영웅 아렌, 자유로운 타워 진화로 플레이합니다.'}${save.settings.layout==='reconstructed'?' 복원 지도는 기록된 건설 위치와 화면에서 추정한 경로를 사용합니다.':''} ${world.wave>0&&!finished?'출전하면 현재 전투의 저장을 교체합니다.':''}</p>`);
  }
  const permanentDescriptions={archer:'궁수 공격력 +5.5%, 사거리 +2.5% / 단계',barracks:'병사 체력 +6%, 방어 +2.5%p / 단계',mage:'마법 공격력 +5.5%, 사거리 +2.5% / 단계',artillery:'포병 공격력 +5.5%, 사거리 +2.5% / 단계',meteor:'유성 피해 +24, 범위 +3 / 단계 · 3단계에 유성 추가',reinforcements:'지원군 체력 +32, 공격 +3 / 단계 · 3단계에 원거리 공격'};
  function upgrades(profile){
    if(profile)upgradeProfile=profile;
    const ref=upgradeProfile==='reference',ranks=ref?save.referenceUpgrades:save.upgrades,available=earnedStars()-spentStars(upgradeProfile);
    const cards=Object.keys(ranks).map(k=>{const r=ranks[k],name=familyNames[k]||({meteor:'불의 비',reinforcements:'지원군'})[k];
      if(ref){const tree=starTree(k),next=tree.find(u=>u.tier===r+1);return`<div class="kingdom-upgrade"><strong>${name}</strong><span class="ranks">${'◆'.repeat(r)}${'◇'.repeat(5-r)}</span><div class="ref-upgrade-list">${tree.map(u=>`<div class="ref-upgrade-row ${u.tier<=r?'bought':''}"><strong>${u.tier<=r?'✓ ':u.tier+'. '}${esc(u.nameKo)} <span>★ ${u.costStars}</span></strong><p>${esc(u.descriptionKo)}</p></div>`).join('')}</div><button data-permanent="${k}" ${!next||available<next.costStars?'disabled':''}>${next?`다음 강화 · ★ ${next.costStars}`:'최대 강화'}</button></div>`;}
      return`<div class="kingdom-upgrade"><strong>${name}</strong><span class="ranks">${'◆'.repeat(r)}${'◇'.repeat(3-r)}</span><p>${permanentDescriptions[k]}</p><button data-permanent="${k}" ${r>=3||available<r+1?'disabled':''}>${r>=3?'최대 강화':`강화하기 · ★ ${r+1}`}</button></div>`;
    }).join('');
    openModal('upgrades',heading('POWER OF THE KINGDOM','왕국 강화',`사용 가능한 별 <b class="star-total">★ ${Math.max(0,available)}</b> &nbsp; / &nbsp; 획득한 별 ${earnedStars()}`)+`<div class="upgrades-profile-tabs"><button data-upgrade-profile="assisted" class="${!ref?'active':''}">웹 강화 · 18단계</button><button data-upgrade-profile="reference" class="${ref?'active':''}">복원 강화 · 30개</button></div><div class="upgrades-grid ${ref?'reference-upgrades-grid':''}">${cards}</div><p class="source-note">${ref?'각 계열을 순서대로 강화합니다. 도전 모드의 단계 제한이 있으면 그 이하만 전투에 적용됩니다.':'웹 지원 규칙에서 적용하는 별 강화입니다.'} 두 규칙의 별 배분은 각각 저장되며 같은 획득 별을 사용할 수 있습니다. 다음 전투부터 적용되고, 언제든 무료로 다시 배분할 수 있습니다.</p><button class="secondary-btn" data-modal="reset-upgrades">이 규칙의 강화 초기화 · 별 돌려받기</button>`);
  }
  function settings(){openModal('settings',heading('MAKE IT YOURS','게임 설정','전투 중 메뉴를 열면 시간이 멈춥니다.')+profileControls()+`<p class="source-note">전투 규칙·지도·난이도는 다음 출전부터 적용됩니다. 현재: ${profileNames[world.ruleset]} / ${layoutNames[world.layout]}</p><div class="settings-row"><div><strong>난이도</strong><small>다음 전투부터 적용</small></div><select id="difficultySelect" aria-label="난이도"><option value="casual" ${save.settings.difficulty==='casual'?'selected':''}>캐주얼</option><option value="normal" ${save.settings.difficulty==='normal'?'selected':''}>일반</option><option value="veteran" ${save.settings.difficulty==='veteran'?'selected':''}>베테랑</option></select></div><div class="settings-row"><div><strong>효과음</strong><small>간단한 합성 전투 효과음</small></div><button class="toggle-btn ${sound?'on':''}" data-modal="sound">${sound?'켜짐':'꺼짐'}</button></div><div class="settings-row"><div><strong>전투 속도</strong><small>0.75× · 1× · 1.5× · 2×</small></div><button class="toggle-btn" data-modal="speed">${speed}×</button></div><div class="settings-row"><div><strong>전술 표시</strong><small>경로 방향·입구·건설 지점 번호</small></div><button class="toggle-btn ${ui.showTactics?'on':''}" data-modal="tactics">${ui.showTactics?'켜짐':'꺼짐'}</button></div><div class="settings-row"><div><strong>저장된 원정</strong><small>최고 별 기록과 설정을 이 브라우저에 저장</small></div><span class="star-total">★ ${earnedStars()}</span></div><section class="backup-section"><h3>기록과 전투 보관</h3><p class="source-note">전투 시간 5초마다, 명령 실행과 메뉴 열기 시점에 자동 저장합니다. 백업 파일에는 별 기록과 진행 중인 전투가 함께 들어갑니다.</p><div class="backup-row"><button class="secondary-btn" data-modal="backup-export">백업 내려받기</button><button class="secondary-btn" data-modal="backup-import">백업 가져오기</button></div><p class="source-note">가져온 최고 기록은 현재 기록과 합칩니다. 조작 설정과 별 배분은 유지됩니다. 새 브라우저에서 별을 다시 배분하려면 왕국 강화를 여세요.</p></section><details style="margin-top:20px"><summary style="cursor:pointer;font-size:14px;color:#c9b089">실험실 · 전투 테스트 도구</summary><p style="font-size:13px">적용한 전투는 별 기록에 포함되지 않습니다.</p><div class="cheat-grid"><button data-cheat="gold">+1,000 골드</button><button data-cheat="cooldowns">스킬 충전</button><button data-cheat="invincible">성문 무적 ${world.invincible?'해제':'켜기'}</button><button data-cheat="clear">현재 적 처치</button></div></details>`,true);}
  function help(){openModal('help',heading('FIELD MANUAL','전장의 지휘관에게','배치, 저지, 집중 공격. 세 가지를 기억하세요.')+`<div class="help-grid"><div class="help-card"><b>01 · 방어선 구축</b><p>길 옆의 + 건설 터를 누른 뒤 오른쪽 패널에서 타워를 고릅니다. 첫 웨이브 전에는 타워 판매 시 전액을 돌려받습니다.</p></div><div class="help-card"><b>02 · 적에 맞춘 조합</b><p>궁수는 빠르게 공격하고, 마법은 물리 방어를 무시합니다. 포병은 지상 범위 피해를 주며, 병영은 적을 붙잡습니다.</p></div><div class="help-card"><b>03 · 전술 지휘</b><p>영웅을 선택하고 이동할 곳을 누르세요. 병영을 선택하면 집결 위치를 옮길 수 있습니다. 지원군과 불의 비로 빈틈을 메우세요.</p></div><div class="help-card"><b>04 · 도감과 별 강화</b><p>상단 전장 도감에서 12개 지도와 모든 타워·몬스터·웨이브를 확인하세요. 자료 기준 규칙에서는 타워가 순서대로 해금됩니다. 승리로 얻은 별로 다음 전투를 강화하세요.</p></div><div class="help-card"><b>05 · 전장 확대</b><p>+ / − 버튼이나 마우스 휠로 최대 3배 확대하세요. 확대 후 드래그로 이동합니다. 모바일에서는 두 손가락으로 확대하고 한 손가락으로 이동할 수 있습니다.</p></div><div class="help-card"><b>06 · 특수 시설</b><p>실버오크의 훈련소를 수리해 엘프를 고용하세요. 폭풍구름 사원의 태양광선 탑에 마법사를 배치하면 선레이 조준으로 적 하나를 공격할 수 있습니다. 복원 지도에서 이용하세요.</p></div></div><table class="key-table"><tr><td><kbd>1</kbd> / <kbd>2</kbd></td><td>지원군 / 불의 비 → 전장 클릭</td></tr><tr><td><kbd>H</kbd></td><td>영웅 선택 → 이동 위치 클릭</td></tr><tr><td><kbd>N</kbd></td><td>첫 웨이브 시작 / 다음 웨이브 조기 호출</td></tr><tr><td><kbd>Space</kbd> / <kbd>P</kbd></td><td>일시정지 / 재개</td></tr><tr><td><kbd>F</kbd></td><td>전투 배속 변경</td></tr><tr><td><kbd>T</kbd></td><td>경로·건설 지점 전술 표시</td></tr><tr><td><kbd>+</kbd> / <kbd>−</kbd> / <kbd>0</kbd></td><td>확대 / 축소 / 전장 전체 보기</td></tr><tr><td><kbd>Esc</kbd> / 우클릭</td><td>선택 취소 · 메뉴 닫기</td></tr></table><p class="source-note">전투는 5초 간격과 명령 실행 시 자동 저장하며, 다시 열면 일시정지 상태로 복원합니다. 설정에서 JSON 백업을 내려받으면 다른 브라우저로 기록과 전투를 옮길 수 있습니다. 확대 중에는 작은 지도를 눌러 시야를 이동하세요. 브라우저 저장이 제한된 경우 설정의 백업을 사용하세요.</p>`);}
  function dataInfo(){openModal('data',heading('ABOUT THIS BUILD · 18','구현·데이터 안내','복원 자료와 직접 관측 지도에 기반한 독립 웹 플레이 구현')+`<p>12개 스테이지, 260개 웨이브 슬롯, 적 34종(보스 3종 포함), 타워 20종, 전문 능력 18종, 별 강화 30개를 연결했습니다. 상충하는 13개 웨이브는 기록된 후보 하나를 선택했습니다.</p><p>지도는 공개 플레이 기록의 건설 위치 155개와 스크린샷에서 추정한 27개 경로를 복원했습니다. 일반 건설 지점·기존 타워·특수 시설을 구분합니다. 엘프 훈련소의 수리·고용·집결과 선레이 타워의 마법사 배치·충전·수동 공격을 지원합니다.</p><p>자료 기준 규칙에서는 원본 자료의 시작 골드·해금 순서·영웅 제한·별 업그레이드를 사용합니다. 웹 지원 규칙에는 시작 골드 보정, 영웅 아렌, 자유로운 진화가 있습니다. 원거리 적, 회복·소환·재생·폭발·면역을 전투에 반영했습니다.</p><p>특수 시설 수치는 커뮤니티 자료의 후보 값이며 대상 원작 빌드 실측으로 검증하지 않았습니다. 버려진 계곡의 마그마 이벤트는 첫 웨이브 뒤 400초, 이후 120초 주기로 반영했습니다. 생성 경로, 좌표 변환, 일부 스킬과 나머지 보스·스테이지 이벤트에는 웹 보완 규칙이 있습니다. 자료 복원과 원작 실행 파일 재현은 범위가 다릅니다. 전장 도감에서 원본 값과 근거를 확인할 수 있습니다.</p><div class="source-note">참조: 제공된 <b>KingdomRush_Reconstructed_v14.zip</b>, Scott Louvau의 공개 플레이·지도 기록. 선택 근거는 소스 ZIP의 <b>data/provenance.json</b>, <b>data/DATA_NOTES.md</b>, <b>docs/LEVEL_RECONSTRUCTION_v16.md</b>, <b>docs/SPECIAL_COMPONENTS_v17.md</b>에 있습니다. 그래픽은 코드로 새로 그렸으며 외부 이미지·음원·폰트 없이 실행됩니다. v18의 저장 복원·백업·선택 보정·전투 분석은 웹 플레이 편의 기능이며 기존 원작 후보 수치를 바꾸지 않습니다.</div><p style="font-size:13px">Kingdom Rush 및 관련 명칭은 원 권리자에게 귀속됩니다. 비공식 분석·플레이 프로토타입입니다.</p>`,true);}
  function restart(){openModal('restart',heading('A FRESH START','전투를 다시 시작할까요?')+`<p>현재 배치와 전투 진행이 초기화됩니다. 저장된 별과 왕국 강화는 유지됩니다.</p><div class="result-actions"><button class="secondary-btn" data-modal="close">전투로 돌아가기</button><button class="primary-btn" data-modal="retry">다시 시작</button></div>`,true);}
  function resultRows(items,total){return items.map(([name,value])=>`<div class="result-row"><span>${esc(name)}</span><strong>${Math.round(value).toLocaleString()}</strong></div><div class="result-bar"><span style="width:${clamp(value/Math.max(1,total)*100,0,100)}%"></span></div>`).join('');}
  function resultRecommendation(r){
    const leaks=Object.entries(r.leaksByEnemy||{}).sort((a,b)=>((r.lifeLossByEnemy?.[b[0]]||0)-(r.lifeLossByEnemy?.[a[0]]||0))||b[1]-a[1]);
    if(!leaks.length)return r.won?'적을 모두 막아냈습니다. 원정 지도에서 다음 전장이나 새로운 도전 모드를 선택하세요.':'방어선이 무너지기 전에 병영 집결을 타워 사거리 안으로 모으고, 지원군으로 마지막 출구를 지켜보세요.';
    const [id,count]=leaks[0],e=D.enemies[id],name=e?.nameKo||id;
    const advice=e?.air?'궁수와 마법 타워로 공중 경로를 함께 덮으세요.':e?.armor>=.3?'마법 타워를 저지 지점 가까이에 배치해 물리 방어를 공략하세요.':e?.resist>=.3?'궁수와 포병의 물리·폭발 피해를 늘려 마법 저항에 대응하세요.':'병영의 집결 위치를 타워 사거리 안에 두고 지원군으로 빠져나가는 적을 붙잡으세요.';
    return `${name} ${count}기를 놓쳤습니다. ${advice}`;
  }
  function openResult(){
    const r=world.result;if(!r)return;const next=D.stages.find(s=>s.order===world.stage.order+1),damageNames={physical:'물리',magic:'마법',magical:'마법',explosive:'폭발',true:'고정'};
    const damageTotals={...r.damageByType};if(damageTotals.magic){damageTotals.magical=(damageTotals.magical||0)+damageTotals.magic;delete damageTotals.magic;}
    const damage=Object.entries(damageTotals).sort((a,b)=>b[1]-a[1]),damageTotal=damage.reduce((n,x)=>n+x[1],0),leaks=Object.entries(r.leaksByEnemy||{}).sort((a,b)=>b[1]-a[1]),maxLeaks=Math.max(1,...leaks.map(x=>x[1])),leaders=(r.towerPerformance||[]).filter(t=>t.damage>0).slice(0,4);
    openModal('result',`<div class="result"><div class="result-crest">${r.won?'♜':'◇'}</div><span class="eyebrow">${r.won?'THE KINGDOM STANDS':'THE KINGDOM NEEDS YOU'}</span><h2>${r.won?'방어 성공':'다시 일어설 시간'}</h2><p>${esc(world.stage.nameKo)} · ${modeNames[world.mode]} · ${profileNames[world.ruleset]}</p>${r.won?`<div class="result-stars" aria-label="획득한 별 ${r.stars}개">${'★'.repeat(r.stars)}${'☆'.repeat((world.mode==='campaign'?3:1)-r.stars)}</div>`:''}<div class="result-stats"><div><strong>${r.kills}</strong><span>처치한 적</span></div><div><strong>${Math.max(0,r.lives)}</strong><span>남은 생명</span></div><div><strong>${formatTime(r.duration)}</strong><span>전투 시간</span></div></div><div class="result-extra"><span>누적 지출 <b>${Math.round(r.spent||0).toLocaleString()} G</b></span><span>통과한 적 <b>${r.escapedEnemies||0}기</b></span><span>잃은 생명 <b>${r.lifeLoss||0}</b></span></div><div class="results-grid"><section class="result-breakdown"><h3>피해 구성</h3>${damage.length?resultRows(damage.map(([id,n])=>[damageNames[id]||id,n]),damageTotal):'<p>공격 기록이 없습니다.</p>'}</section><section class="result-breakdown"><h3>통과한 적</h3>${leaks.length?resultRows(leaks.slice(0,5).map(([id,n])=>[D.enemies[id]?.nameKo||id,n]),maxLeaks):'<p class="clean-defense">모든 진입을 막았습니다.</p>'}</section></div>${leaders.length?`<section class="result-breakdown"><h3>활약한 방어 시설</h3>${leaders.map(t=>`<div class="result-row"><span>${esc(t.nameKo)}${t.sold?' · 판매됨':''}</span><strong>${Math.round(t.damage).toLocaleString()} 피해 · ${t.kills} 처치</strong></div>`).join('')}</section>`:''}<p class="result-recommendation">${esc(resultRecommendation(r))}</p><div class="result-extra"><span>지원군 <b>${r.spellCasts?.reinforcements||0}회</b></span><span>불의 비 <b>${r.spellCasts?.meteor||0}회</b></span>${r.facilityHires?`<span>시설 고용 <b>${r.facilityHires}회</b></span>`:''}${r.sunrayShots?`<span>선레이 <b>${r.sunrayShots}발</b></span>`:''}${r.stageEventSpawns?`<span>이벤트 적 <b>${r.stageEventSpawns}기</b></span>`:''}</div>${r.cheated?'<p class="source-note">실험실을 사용한 전투입니다. 별 기록은 저장하지 않습니다.</p>':''}<div class="session-actions"><button class="secondary-btn" data-modal="campaign">원정 지도</button>${r.won&&next?'<button class="secondary-btn" data-modal="retry">다시 플레이</button>':''}<button class="primary-btn" data-modal="${r.won&&next?'next':'retry'}">${r.won&&next?'다음 전장':'다시 도전'}</button></div></div>`);
    if(r.won){tone(520,.18,'triangle');setTimeout(()=>tone(660,.2,'triangle'),150);setTimeout(()=>tone(780,.4,'triangle'),300);}else tone(180,.7,'triangle',.035,-80);
  }
  function exportBackup(){
    try{const session=world&&['ready','playing'].includes(world.state)?sessionSnapshot():null,payload=KRProgress.backup(KRProgress.normalize(D,save),session),blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`KingdomRush_Save_v18_${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('현재 기록과 전투를 백업 파일로 내보냈습니다.');}catch(e){notify('백업을 만들지 못했습니다: '+e.message,true);}
  }
  function chooseBackup(){
    const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.setAttribute('aria-label','Kingdom Rush 백업 파일');input.onchange=async()=>{
      const file=input.files?.[0];if(!file)return;try{if(file.size>8*1024*1024)throw new Error('백업 파일은 8MB 이하여야 합니다.');pendingImport=KRProgress.parseBackup(D,await file.text());const info=pendingImport.session?KRCheckpoint.describe(D,pendingImport.session.battle):null;
        openModal('import',heading('RESTORE YOUR CAMPAIGN','가져올 기록을 확인하세요')+`<div class="resume-summary"><h3>별 ${pendingImport.stars}개 · 전장 기록 ${pendingImport.stageCount}개</h3><p>현재 별 ${earnedStars()}개와 비교하여 더 높은 최고 기록을 남깁니다. 현재 설정과 별 배분은 유지됩니다.</p>${info?`<p><strong>${esc(info.stageName)}</strong> · ${modeNames[info.mode]}<br>웨이브 ${info.wave} / ${info.totalWaves} · 생명 ${info.lives} · ${formatTime(info.time)}</p><p class="source-note">전투까지 가져오면 현재 전투를 교체하고 일시정지 상태로 엽니다.</p>`:'<p>이 백업에는 진행 중인 전투가 없습니다.</p>'}</div><div class="session-actions"><button class="secondary-btn" data-modal="import-progress">기록만 합치기</button>${info?'<button class="primary-btn" data-modal="import-all">기록과 전투 가져오기</button>':''}</div>`,true);
      }catch(e){pendingImport=null;notify(e.message||'백업을 읽지 못했습니다.',true);}
    };input.click();
  }
  function applyImport(withBattle){
    if(!pendingImport)return;try{const imported=pendingImport,next=withBattle&&imported.session?KRCheckpoint.restore(D,imported.session.battle):null;save=KRProgress.merge(D,save,imported.progress);pendingImport=null;persist();if(next){activateWorld(next,true,imported.session.camera);writeBattle();openResume();}else{settings();}notify(storageOK&&battleStorageOK?'백업 기록을 가져왔습니다.':'백업을 세션에 가져왔습니다. 브라우저 저장은 제한되어 있습니다.',!storageOK||!battleStorageOK);}catch(e){notify('가져오지 못했습니다: '+e.message,true);}
  }
  $('modalRoot').addEventListener('click',e=>{
    if(e.target===$('modalRoot')&&modalKind!=='result'){closeModal();return;}const b=e.target.closest('button');if(!b||b.disabled)return;
    if(b.dataset.stage){mapStage=b.dataset.stage;campaign();return;}
    if(b.dataset.mode){mapMode=b.dataset.mode;campaign();return;}
    if(b.dataset.upgradeProfile){upgrades(b.dataset.upgradeProfile);return;}
    if(b.dataset.permanent){const k=b.dataset.permanent,ref=upgradeProfile==='reference',ranks=ref?save.referenceUpgrades:save.upgrades,r=ranks[k],cost=ref?starTree(k).find(u=>u.tier===r+1)?.costStars:r+1;if(r<(ref?5:3)&&cost!==undefined&&earnedStars()-spentStars(upgradeProfile)>=cost){ranks[k]++;persist();tone(660,.12,'triangle');upgrades();}return;}
    if(b.dataset.cheat){command(world.cheat(b.dataset.cheat,b.dataset.cheat==='gold'?1000:undefined));closeModal();return;}
    const a=b.dataset.modal;
    if(a==='close')closeModal();
    if(a==='continue'){closeModal();togglePause(false);}
    if(a==='backup-export')exportBackup();
    if(a==='backup-import')chooseBackup();
    if(a==='import-progress')applyImport(false);
    if(a==='import-all')applyImport(true);
    if(a==='start')startStage(mapStage,mapMode);
    if(a==='campaign'){mapStage=world.stage.id;mapMode=world.mode;campaign();}
    if(a==='retry')startStage(world.stage.id,world.mode);
    if(a==='next'){const next=D.stages.find(s=>s.order===world.stage.order+1);if(next)startStage(next.id,world.mode);}
    if(a==='sound'){toggleSound();settings();}
    if(a==='speed'){cycleSpeed();settings();}
    if(a==='tactics'){toggleTactics();settings();}
    if(a==='reset-upgrades'){const ranks=upgradeProfile==='reference'?save.referenceUpgrades:save.upgrades;for(const k in ranks)ranks[k]=0;persist();upgrades();notify('별을 모두 돌려받았습니다.');}
  });
  $('modalRoot').addEventListener('change',e=>{if(e.target.id==='difficultySelect')save.settings.difficulty=e.target.value;else if(e.target.id==='rulesetSelect')save.settings.ruleset=e.target.value;else if(e.target.id==='layoutSelect')save.settings.layout=e.target.value;else return;persist();if(modalKind==='campaign')campaign();});
  function toggleTactics(value){ui.showTactics=value===undefined?!ui.showTactics:!!value;save.settings.tactics=ui.showTactics;persist();refresh(true);}
  function toggleSound(){sound=!sound;save.settings.sound=sound;persist();tone(440,.15,'triangle');refresh(true);}
  function cycleSpeed(){const speeds=[.75,1,1.5,2];speed=speeds[(speeds.indexOf(speed)+1)%speeds.length];save.settings.speed=speed;persist();refresh(true);}
  function callWave(){if(!paused&&!modalKind)command(world.callWave(),true);}
  function openCampaign(){mapStage=world.stage.id;mapMode=world.mode;campaign();}
  $('campaignBtn').onclick=openCampaign;$('brandBtn').onclick=openCampaign;$('upgradesBtn').onclick=()=>upgrades(save.settings.ruleset);$('atlasBtn').onclick=()=>atlas.show('levels');$('waveInspectBtn').onclick=()=>atlas.show('waves');$('tacticsBtn').onclick=()=>toggleTactics();$('settingsBtn').onclick=settings;$('helpBtn').onclick=help;$('dataInfoBtn').onclick=dataInfo;$('restartBtn').onclick=restart;
  $('continueBtn').onclick=()=>{closeModal();togglePause(false);};
  $('waveBtn').onclick=callWave;$('heroBtn').onclick=()=>selectTarget('hero');$('reinforceBtn').onclick=()=>selectTarget('reinforcements');$('meteorBtn').onclick=()=>selectTarget('meteor');$('cancelTarget').onclick=cancelTarget;$('pauseBtn').onclick=()=>togglePause();$('resumeBtn').onclick=()=>togglePause(false);$('soundBtn').onclick=toggleSound;$('speedBtn').onclick=cycleSpeed;
  $('dismissHint').onclick=()=>{save.tutorial=true;persist();$('tutorialHint').classList.add('hidden');};
  $('fullscreenBtn').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if($('gameApp').requestFullscreen)await $('gameApp').requestFullscreen();else notify('이 브라우저에서는 전체 화면을 지원하지 않습니다.');}catch(e){notify('전체 화면으로 전환할 수 없습니다.');}};
  document.addEventListener('keydown',e=>{
    if(modalKind){if(e.key==='Escape'&&modalKind!=='result'){e.preventDefault();closeModal();}if(e.key==='Tab'){const els=[...$('modalRoot').querySelectorAll('button:not(:disabled),select,input,summary,a[href],[tabindex="0"]')].filter(el=>el.getClientRects().length>0);const first=els[0],last=els.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}return;}
    if(['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName))return;
    const k=e.key.toLowerCase();if(e.target.closest?.('button')&&(k===' '||k==='enter'))return;if([' ','p','1','2','h','n','f','t','+','=','-','0','escape'].includes(k))e.preventDefault();
    if(k==='+'||k==='=')setZoom(ui.camera.zoom+.5);if(k==='-')setZoom(ui.camera.zoom-.5);if(k==='0')setZoom(1);
    if(k===' '||k==='p')togglePause();if(k==='1')selectTarget('reinforcements');if(k==='2')selectTarget('meteor');if(k==='h')selectTarget('hero');if(k==='n')callWave();if(k==='f')cycleSpeed();if(k==='t')toggleTactics();if(k==='escape'){if(ui.placementMode)cancelTarget();else if(ui.selectedSite!==null||ui.selectedEnemyId){ui.selectedSite=null;ui.selectedTowerId=null;ui.selectedFacilityId=null;ui.selectedEnemyId=null;selectionKey='';refresh(true);}else togglePause();}
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden){if(world.state==='playing'&&!finished&&!modalKind)togglePause(true);writeBattle();}last=0;acc=0;});
  window.addEventListener('pagehide',()=>{writeBattle();persist();});
  window.addEventListener('resize',()=>renderer.resize());
  function frame(ms){
    const dt=last?Math.min((ms-last)/1000,.12):0;last=ms;
    if(!paused&&!modalKind&&!finished){acc+=dt*speed;let n=0;while(acc>=1/60&&n<16){world.update(1/60);acc-=1/60;n++;}}
    renderer.draw(world,ui,ms/1000);
    if(ms-lastUI>110){refresh();drawMiniMap();lastUI=ms;if(world.state==='playing'&&world.time-lastBattleTime>=5)writeBattle();}
    if(pendingResultWorld===world&&!modalKind&&ms>=resultReadyAt){pendingResultWorld=null;openResult();}
    if(sound&&world.state==='playing'&&!paused&&!modalKind&&world.projectiles.length&&ms-ambienceAt>420){tone(230+(world.projectiles.length%6)*65,.025,'triangle',.009,-80);ambienceAt=ms;}
    requestAnimationFrame(frame);
  }
  atlas=new KRAtlas(D,{world:()=>world,settings:()=>save.settings,open:openModal,heading,towerIcon,tactics:()=>{closeModal();toggleTactics(true);}});
  let restoredSession=null;
  try{const raw=localStorage.getItem(BATTLE_KEY);if(raw){if(raw.length>8*1024*1024)throw new Error('전투 저장이 너무 큽니다.');const candidate=JSON.parse(raw);if(candidate.format!=='kingdom-rush-session'||candidate.version!==18)throw new Error('전투 저장 버전이 다릅니다.');const restored=KRCheckpoint.restore(D,candidate.battle);restoredSession={world:restored,camera:candidate.camera,capturedAt:candidate.battle.capturedAt};}}
  catch(e){notify('저장된 전투를 복원하지 못해 새 준비 화면을 엽니다. 별 기록은 유지됩니다.',true);}
  if(restoredSession){activateWorld(restoredSession.world,true,restoredSession.camera);lastSavedAt=restoredSession.capturedAt;openResume();}else startStage(D.stages[0].id);
  persist();requestAnimationFrame(frame);
  globalThis.KR_APP={get world(){return world;},get ui(){return ui;},get paused(){return paused;},startStage,pause:togglePause,atlas,version:'18.0.0'};
})();
