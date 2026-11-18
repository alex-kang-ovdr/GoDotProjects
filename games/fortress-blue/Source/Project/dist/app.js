(function(){
 'use strict';
 const $=id=>document.getElementById(id),D=window.FortData;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));
 if(location.protocol==='file:')$('offline-download').hidden=true;
 if(!D||!window.FortEngine||!window.FortRenderer){$('fatal-error').hidden=false;return;}
 const storage={get(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}},set(key,val){try{localStorage.setItem(key,JSON.stringify(val));}catch{}}};
 const saved=storage.get('fortress-blue-prefs-v1',{});
 const prefs={profile:'classic',angleProfile:D.aiming.defaultAngleProfile,map:'highlands',playerTank:'catapult',opponentTank:'auto',teamSize:2,control:'ai',difficulty:'normal',guide:true,sound:false,quality:'high',reduceMotion:window.matchMedia('(prefers-reduced-motion: reduce)').matches,tuning:{},...saved};
 if(!D.catalogs[prefs.profile])prefs.profile='classic';
 if(!D.aiming.angleProfiles[prefs.angleProfile])prefs.angleProfile=D.aiming.defaultAngleProfile;
 if(!D.maps.some(m=>m.id===prefs.map))prefs.map=D.maps[0].id;
 if(!D.catalogs[prefs.profile].some(t=>t.id===prefs.playerTank))prefs.playerTank=D.catalogs[prefs.profile][0].id;
 prefs.teamSize=[1,2,4].includes(Number(prefs.teamSize))?Number(prefs.teamSize):2;
 prefs.control=['ai','hotseat'].includes(prefs.control)?prefs.control:'ai';prefs.difficulty=['easy','normal','hard'].includes(prefs.difficulty)?prefs.difficulty:'normal';
 if(!prefs.tuning||typeof prefs.tuning!=='object'||Array.isArray(prefs.tuning))prefs.tuning={};
 if(prefs.opponentTank!=='auto'&&!D.catalogs[prefs.profile].some(t=>t.id===prefs.opponentTank))prefs.opponentTank='auto';
 const tuningDefs=[['gravity','중력',150,600,10],['windAcceleration','바람 가속 계수',0,20,1],['maxLaunchSpeed','최대 발사속도',700,1500,25],['damageScale','피해 배율',0.3,1.5,0.05],['terrainScale','지형 파괴 배율',0.5,2,0.1],['turnTime','턴 시간(초)',15,60,5]];
 for(const [key,,min,max]of tuningDefs)if(prefs.tuning[key]!==undefined)prefs.tuning[key]=clamp(prefs.tuning[key],min,max);
 let game=null,renderer=null,started=false,matchConfig=null,history=storage.get('fortress-blue-history-v1',[]),zoom=1;
 if(!Array.isArray(history))history=[];
 const freshStats=()=>[{shots:0,damage:0,kills:0},{shots:0,damage:0,kills:0}];
 let stats=freshStats(),lastShots=new Map(),targetPowers=new Map(),lastPowers=new Map(),lastAction=null,resultSaved=false,uiAccumulator=0,lastFrame=performance.now(),feed=[],toastTimer=null;
 let activeKey='',weaponKey='',rosterKey='',itemKey='',inspectorKey='',summaryKey='',keys=new Set(),holdMove=0,charge=null,fireHoldTimer=null,firePointerId=null,pointerAim=null;
 let audioCtx=null,prevFocus=null,hintTimer=null,feedbackBounds=null;
 const itemIcons={
  repair:'<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>',
  shield:'<path d="M12 3 4 6v6c0 4 4 7 8 9 4-2 8-5 8-9V6z"/><path d="m8 12 3 3 5-6"/>',
  double:'<path d="m4 18 4-9 8-4-4 9zM12 20l3-7 7-3-3 7z"/>',
  teleport:'<ellipse cx="12" cy="17" rx="8" ry="4"/><path d="M12 15V3m-4 4 4-4 4 4"/>'
 };
 const weaponIcons={shell:'●',fire:'♨',poison:'◈',mine:'✦',laser:'ϟ',multi:'⋮',water:'≈',homing:'➤',shield:'⬡'};
 const savePrefs=()=>storage.set('fortress-blue-prefs-v1',prefs);
 function showToast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,2200);}
 function anyOverlay(){return !!document.querySelector('.overlay:not([hidden])');}
 function canAct(){return started&&game&&!game.state.paused&&!anyOverlay()&&game.state.phase==='aim'&&game.isHumanTurn();}
 function isSupportAction(){const w=game?.active?.def?.weapons?.[game.state.weaponIndex];return !!w&&(w.delivery==='self'||w.kind==='shield')&&!game.active.status?.teleport;}
 function focusArena(){if(!anyOverlay())$('arena').focus({preventScroll:true});}
 function releaseInputs(){keys.clear();holdMove=0;charge=null;pointerAim=null;firePointerId=null;clearTimeout(fireHoldTimer);fireHoldTimer=null;$('fire-button').classList.remove('charging');}
 function syncPause(){if(game)game.setPaused(anyOverlay());}
 function openOverlay(id){prevFocus=document.activeElement;releaseInputs();$(id).hidden=false;syncPause();setTimeout(()=>{const el=$(id).querySelector('button:not([hidden]),select,input');if(el)el.focus({preventScroll:true});},50);}
 function closeOverlay(id){if(id==='lobby-overlay'&&!started)return;$(id).hidden=true;syncPause();if(prevFocus&&typeof prevFocus.focus==='function')prevFocus.focus({preventScroll:true});}
 function closeAll(){document.querySelectorAll('.overlay').forEach(el=>el.hidden=true);releaseInputs();syncPause();}
 function sound(type){
  if(!prefs.sound)return;
  try{
   if(!audioCtx)audioCtx=new(window.AudioContext||window.webkitAudioContext)();
   if(audioCtx.state==='suspended')audioCtx.resume();
   const t=audioCtx.currentTime,g=audioCtx.createGain();g.connect(audioCtx.destination);
   if(type==='explosion'){
    const buffer=audioCtx.createBuffer(1,Math.floor(audioCtx.sampleRate*.22),audioCtx.sampleRate),a=buffer.getChannelData(0);for(let i=0;i<a.length;i++)a[i]=(Math.random()*2-1)*(1-i/a.length);
    const source=audioCtx.createBufferSource(),filter=audioCtx.createBiquadFilter();source.buffer=buffer;filter.type='lowpass';filter.frequency.setValueAtTime(850,t);source.connect(filter);filter.connect(g);g.gain.setValueAtTime(.12,t);g.gain.exponentialRampToValueAtTime(.001,t+.24);source.start(t);source.stop(t+.25);
   }else{
    const o=audioCtx.createOscillator();o.type=type==='shot'?'triangle':'sine';o.frequency.setValueAtTime(type==='shot'?240:type==='turn'?620:type==='heal'?740:440,t);o.frequency.exponentialRampToValueAtTime(type==='shot'?70:type==='heal'?1100:440,t+.11);o.connect(g);g.gain.setValueAtTime(type==='shot'?.09:.035,t);g.gain.exponentialRampToValueAtTime(.001,t+.16);o.start(t);o.stop(t+.18);
   }
  }catch{}
 }
 function handleEvent(e){
  if(renderer)renderer.handleEvent(e);
  if(e.type==='turn')releaseInputs();
  if(!started)return;
  if(e.type==='actionStart'&&e.ownerId){lastShots.set(e.ownerId,{...e});if(e.delivery==='projectile')lastPowers.set(e.ownerId,e.power);}
  if(e.type==='actionEnd'){lastAction={...e,at:performance.now()};summaryKey='';}
  if(e.type==='shot'&&stats[e.sourceTeam??e.team])stats[e.sourceTeam??e.team].shots++;
  if(e.type==='damage'){
   const victim=game?.state.tanks.find(t=>t.uid===e.tankId);
   const target=e.targetTeam??victim?.team;if(stats[e.sourceTeam]&&target!==e.sourceTeam)stats[e.sourceTeam].damage+=Math.max(0,Number(e.value??e.amount)||0);
  }
  if(e.type==='death'&&stats[e.sourceTeam]&&(e.targetTeam??e.team)!==e.sourceTeam)stats[e.sourceTeam].kills++;
  if(['shot','explosion','turn','heal','item'].includes(e.type))sound(e.type);
  if(e.text&&['damage','heal','death','item','message','turn'].includes(e.type)){
   if(e.type!=='turn'||game?.config.control==='hotseat')feed.unshift({text:e.text,type:e.type,at:performance.now()});
   feed=feed.slice(0,3);
  }
  if(e.type==='end')setTimeout(showResult,700);
 }
 function makeConfig(reuseSeed=false){
  const profile=D.profiles.find(p=>p.id===prefs.profile)||D.profiles[0],map=D.maps.find(m=>m.id===prefs.map)||D.maps[0],catalog=D.catalogs[prefs.profile];
  const foes=catalog.filter(t=>t.id!==prefs.playerTank),enemy=catalog.find(t=>t.id===prefs.opponentTank)||foes[(history.length+1)%Math.max(1,foes.length)]||catalog[0];
  return {profile:profile.id,angleProfile:prefs.angleProfile,map:map.id,teamSize:profile.id==='blue3'?4:Number(prefs.teamSize),playerTank:prefs.playerTank,opponentTank:enemy.id,control:prefs.control,difficulty:prefs.difficulty,seed:reuseSeed&&matchConfig?matchConfig.seed:((map.seed+Math.floor(Math.random()*99991))>>>0),tuning:{...D.tuningDefaults,...prefs.tuning},onEvent:handleEvent};
 }
 function createMatch(config,play=true){
  releaseInputs();started=play;stats=freshStats();lastShots.clear();targetPowers.clear();lastPowers.clear();lastAction=null;resultSaved=false;feed=[];activeKey='';weaponKey='';rosterKey='';itemKey='';inspectorKey='';summaryKey='';
  matchConfig={...config};game=new FortEngine(config);if(renderer)renderer.setGame(game);else renderer=new FortRenderer($('arena'),game);
  zoom=window.innerWidth<500?1.25:1;
  $('map-label').textContent=(D.maps.find(m=>m.id===config.map)||D.maps[0]).name;$('seed-label').textContent=String(config.seed).slice(-4);
  $('mode-label').textContent=config.profile==='blue3'?'3BLUE':'CLASSIC';
  $('close-lobby').hidden=!play;
  if(play){closeAll();$('arena').focus({preventScroll:true});$('first-hint').hidden=window.innerWidth<681;clearTimeout(hintTimer);hintTimer=setTimeout(()=>$('first-hint').hidden=true,6500);}else syncPause();
  updateUI(true);
 }
 function startMatch(){savePrefs();createMatch(makeConfig(),true);}
 function drawPortrait(canvas,def,team=0){if(canvas&&def)FortRenderer.drawPortrait(canvas,def,team);}
 function renderLobby(){
  const profile=D.profiles.find(p=>p.id===prefs.profile),catalog=D.catalogs[prefs.profile];
  $('profile-switch').innerHTML=D.profiles.map(p=>`<button type="button" class="profile-button ${p.id===prefs.profile?'selected':''}" data-profile="${esc(p.id)}" aria-pressed="${p.id===prefs.profile}"><span>${p.id==='classic'?'2':'3'}</span><div><b>${p.id==='classic'?'CLASSIC':'3BLUE'}</b><small>${p.id==='classic'?'13종 · 두 가지 무기':'4종 · 네 가지 스킬'}</small></div></button>`).join('');
  $('map-select').innerHTML=D.maps.map(m=>`<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('');$('map-select').value=prefs.map;
  $('control-select').value=prefs.control;$('difficulty-select').value=prefs.difficulty;
  if(!catalog.some(t=>t.id===prefs.opponentTank))prefs.opponentTank='auto';
  $('opponent-select').innerHTML='<option value="auto">자동 편성</option>'+catalog.map(t=>`<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');$('opponent-select').value=prefs.opponentTank;
  const turnTime=Number(prefs.tuning.turnTime??D.tuningDefaults.turnTime);$('turn-time-select').querySelectorAll('[data-custom]').forEach(o=>o.remove());if(![15,25,40,60].includes(turnTime)){const o=document.createElement('option');o.value=turnTime;o.textContent=turnTime+'초';o.dataset.custom='true';$('turn-time-select').append(o);}$('turn-time-select').value=String(turnTime);
  $('team-size-select').value=prefs.profile==='blue3'?'4':String(prefs.teamSize);$('team-size-select').disabled=prefs.profile==='blue3';
  renderAngleProfileControls();
  $('difficulty-select').disabled=prefs.control==='hotseat';$('catalog-count').textContent=catalog.length+' TYPES';
  $('tank-picker').innerHTML=catalog.map(t=>`<button type="button" class="tank-option ${t.id===prefs.playerTank?'selected':''}" data-tank="${esc(t.id)}" aria-label="${esc(t.name)} 선택" aria-pressed="${t.id===prefs.playerTank}"><canvas width="120" height="78"></canvas><span>${esc(t.name)}</span></button>`).join('');
  $('tank-picker').querySelectorAll('button').forEach((b,i)=>drawPortrait(b.querySelector('canvas'),catalog[i]));
  renderPicked();
 }
 function renderPicked(){
  const selected=D.catalogs[prefs.profile].find(t=>t.id===prefs.playerTank)||D.catalogs[prefs.profile][0];
  $('picked-name').textContent=selected.name;$('picked-hp').textContent=selected.hp.toLocaleString();$('picked-delay').textContent=selected.delay;
  const bounds=prefs.profile==='classic'?D.aiming.angleProfiles[prefs.angleProfile].bounds[selected.id]:null;
  $('picked-angle').textContent=bounds?bounds.min+'–'+bounds.max+'°':selected.aimMin+'–'+selected.aimMax+'°';
  $('picked-angle').title=bounds?D.aiming.angleProfiles[prefs.angleProfile].label:'3BLUE 원작 각도 미복구 · 현재 구현값';
  const playDescriptions={catapult:'넓은 사격각과 화염으로 전선을 장악합니다.',crossbow:'독으로 상대의 다음 턴까지 압박합니다.',cannon:'묵직한 포탄으로 지면을 파고듭니다.',carrot:'삼연발과 기동력으로 기회를 만듭니다.',duke:'두 가지 포탄으로 지형과 거리를 공략합니다.',mine_lander:'지뢰를 깔아 상대의 이동을 제한합니다.',missile:'유도 미사일로 상대의 위치를 추적합니다.',multi_missile:'연속 포격으로 넓은 구간을 제압합니다.',super_tank:'강한 연속 포격으로 적의 빈틈을 노립니다.',laser:'빠른 기동과 날카로운 포격이 강점입니다.',ion_attacker:'이온탄과 펄스로 전선을 압박합니다.',secwind:'빠르게 자리를 바꾸고 선공 기회를 만듭니다.',poseidon:'물폭탄으로 상대의 이동을 봉쇄합니다.',mecha_punch:'튼튼한 전선에서 묵직하게 밀어붙입니다.',evil_bella:'독과 흡혈, 강화 해제로 전세를 바꿉니다.',baseball_boy:'튀어 오르는 공과 유도로 지형을 공략합니다.'};
  $('picked-description').textContent=playDescriptions[selected.id]||'각도와 지형을 활용하는 전술 캐릭터입니다.';
  drawPortrait($('lobby-portrait'),selected,0);
 }
 function renderRoster(){
  if(!game)return;
  for(const team of [0,1]){
   const parent=$(team===0?'blue-roster':'red-roster'),units=game.state.tanks.filter(t=>t.team===team);
   parent.innerHTML=units.map(t=>`<article class="tank-state ${team===1?'red':''} ${t.uid===game.state.activeId?'active':''} ${t.alive?'':'dead'}" data-unit="${esc(t.uid)}"><div class="tank-state-top"><canvas width="110" height="70"></canvas><div class="tank-state-name">${esc(t.name)}<small>${t.uid===game.state.activeId?'CURRENT TURN':t.alive?'READY':'OUT'}</small></div></div><div class="hp-line"><i style="width:${clamp(t.hp/t.maxHp*100,0,100)}%"></i></div><div class="hp-numbers"><b>${Math.max(0,Math.ceil(t.hp)).toLocaleString()} <span>/ ${Math.ceil(t.maxHp).toLocaleString()}</span></b><span>${t.status?.shield?'◈':t.status?.poison?'◉':''}</span></div></article>`).join('');
   parent.querySelectorAll('canvas').forEach((c,i)=>drawPortrait(c,units[i].def,team));
   $(team===0?'blue-count':'red-count').textContent=units.filter(t=>t.alive).length+' / '+units.length;
  }
 }
 function renderWeapons(t){
  const weapons=t?.def?.weapons||[];
  $('weapon-bar').innerHTML=weapons.map((w,i)=>{const locked=game.state.round<(w.unlockRound||1);return `<button class="weapon-button ${i===game.state.weaponIndex?'selected':''}" data-weapon="${i}" aria-label="${esc(w.name)} 선택" aria-pressed="${i===game.state.weaponIndex}" title="${esc(w.description)}" ${locked?'disabled':''}><span class="weapon-icon">${weaponIcons[w.kind]||'●'}</span><span><b>${esc(w.name)}</b><small>${locked?'R'+w.unlockRound+' 해금':'DELAY +'+w.delay}</small></span><span class="slot-key">${i+1}</span></button>`;}).join('');
 }
 function renderItems(t){
  $('item-bar').innerHTML=D.items.map(item=>{const count=t?.inventory?.[item.id]??0,available=canAct()&&(typeof game.canUseItem==='function'?game.canUseItem(item.id):count&&!game.state.itemUsed&&(item.id!=='repair'||t.hp<t.maxHp));const reason=!count?'남은 수량 없음':game.state.itemUsed?'이번 턴 아이템 사용 완료':item.id==='repair'&&t.hp>=t.maxHp?'체력이 가득 찼습니다':item.description;return `<button class="item-button ${count?'':'used'}" data-item="${item.id}" aria-label="${esc(item.name)} 사용" title="${esc(item.name+' · '+reason)}" ${available?'':'disabled'}><svg viewBox="0 0 24 24">${itemIcons[item.id]}</svg><small>${count}</small></button>`;}).join('');
 }
 function actionPreview(){
  if(typeof game?.getActionPreview==='function')return game.getActionPreview();
  const t=game?.active,w=t?.def?.weapons?.[game.state.weaponIndex];if(!w)return null;
  const tele=!!t.status?.teleport,self=(w.delivery==='self'||w.kind==='shield')&&!tele,support=w.role==='support'||self;
  const repeat=tele||support?1:Math.max(t.status?.double||1,game.config.profile==='blue3'&&game.state.suddenDeath?3:1);
  return {aimMin:w.behavior?.aimMin??t.def.aimMin,aimMax:w.behavior?.aimMax??t.def.aimMax,role:support?'support':'attack',delivery:self?'self':'projectile',repeat,projectileCount:self?0:(tele?1:(w.shots||1)*repeat),teleportArmed:tele};
 }
 function renderInspector(t,human,force){
  const w=t?.def?.weapons?.[game.state.weaponIndex],p=actionPreview();if(!w||!p)return;
  const previous=lastShots.get(t.uid),key=[t.uid,w.id,game.state.suddenDeath,JSON.stringify(t.status),t._boundThisTurn,human,previous?.volleyId].join('|');
  if(!force&&key===inspectorKey)return;inspectorKey=key;
  const tags=[];if(t.status?.poison>0)tags.push(['독 '+t.status.poison+'회','bad']);if(t.status?.fire>0)tags.push(['화염 '+t.status.fire+'회','bad']);if(t.status?.bind>0||t._boundThisTurn)tags.push(['이동 봉쇄','bad']);if(t.status?.shield>0)tags.push(['방어막 '+t.status.shield+'회','good']);if(t.status?.barrier>0)tags.push(['흡수막 '+Math.ceil(t.status.barrier),'good']);if(t.status?.attackBuff)tags.push(['공격 강화','good']);if(t.status?.double)tags.push(['더블 준비','armed']);if(t.status?.teleport)tags.push(['이동탄 준비','armed']);
  $('status-strip').innerHTML=tags.map(([label,type])=>`<span class="status-chip ${type}">${esc(label)}</span>`).join('');
  const meta=p.teleportArmed?'이동탄 · 1발':p.delivery==='self'?'자신에게 사용':`${p.role==='support'?'지원탄':'공격'} · ${p.projectileCount}발${p.repeat>1?' / '+p.repeat+'회 포격':''}`;
  $('weapon-meta').textContent=meta;
  $('weapon-description').textContent=p.teleportArmed?'피해 없이 착탄 지점으로 이동합니다.':w.description;
  $('fire-button').querySelector('b').textContent=p.delivery==='self'?'사용':'발사';$('fire-button').querySelector('small').textContent=p.delivery==='self'?'SPACE 즉시':'SPACE 길게';
  const canRecall=!!previous&&previous.delivery!=='self';$('recall-shot').hidden=!canRecall;$('recall-shot').disabled=!human;
  if(canRecall){$('recall-shot').textContent=`직전 조준 ${Math.round(previous.angle)}° / ${Math.round(previous.power)}% ↺`;$('recall-shot').title=(previous.weaponId==='item_teleport'?'직전 이동탄의 각도·파워·방향을 복원합니다.':'이 캐릭터의 직전 각도·파워·무기·방향을 복원합니다.')+' 현재 바람과 지형을 확인하세요.';}
 }
 function renderActionSummary(){
  if(!lastAction){$('shot-summary').hidden=true;feedbackBounds=null;return;}
  const visible=performance.now()-lastAction.at<8500;$('shot-summary').hidden=!visible;if(!visible){feedbackBounds=null;return;}
  const key=lastAction.volleyId+':'+lastAction.at;if(summaryKey===key)return;summaryKey=key;
  const a=lastAction,damage=Math.round(a.damageToEnemy||0),friendly=Math.round(a.friendlyDamage||0),kills=Math.round(a.kills||0),heal=Math.round(a.heal||0);
  let outcome=a.delivery==='self'?'지원 효과 적용':a.reason==='teleport'?'이동 완료':a.reason==='mine_placed'?'지뢰 설치':a.reason==='support_hit'?'상대 강화 효과 해제':damage>0?'상대 피해 '+damage.toLocaleString():kills>0?kills+'기 격파':a.terrainRemoved>0?'지형 파괴':'직접 피해 없음';
  if(kills>0&&damage>0)outcome+=' · '+kills+'기 격파';if(friendly>0)outcome+=' · 아군 피해 '+friendly;if(heal>0)outcome+=' · 회복 +'+heal;
  $('shot-summary').classList.toggle('red',a.team===1);
  $('shot-summary').innerHTML=`<small>${a.team===1?'RED':'BLUE'} · ${esc(a.tankName||'전투 결과')}</small><b>${esc(outcome)}</b><span>${esc(a.weaponName||'공격')}${a.delivery==='self'?'':` · ${Math.round(a.angle||0)}° / ${Math.round(a.power||0)}% · ${Math.round(a.shots||0)}발`}</span>`;
  updateFeedbackBounds();
 }
 function updateFeedbackBounds(){const panel=$('shot-summary');if(panel.hidden){feedbackBounds=null;return;}const p=panel.getBoundingClientRect(),c=$('arena').getBoundingClientRect();feedbackBounds={x:p.left-c.left,y:p.top-c.top,width:p.width,height:p.height};}
 if(window.ResizeObserver){const summaryResize=new ResizeObserver(updateFeedbackBounds);summaryResize.observe($('shot-summary'));summaryResize.observe($('arena'));}else window.addEventListener('resize',updateFeedbackBounds);
 function updateUI(force=false){
  if(!game)return;const s=game.state,t=game.active,human=canAct();
  const newRoster=s.tanks.map(t=>[t.uid,Math.ceil(t.hp),t.alive,t.uid===s.activeId,JSON.stringify(t.status)].join(':')).join('|');
  if(force||newRoster!==rosterKey){rosterKey=newRoster;renderRoster();}
  $('round-label').textContent=(s.suddenDeath?'SUDDEN ':'ROUND ')+String(s.round||1).padStart(2,'0');
  const wind=Number(s.wind)||0;$('wind-value').textContent=Math.abs(Math.round(wind));$('wind-arrow').style.transform=wind<0?'rotate(180deg)':'none';
  $('wind-arrow').style.opacity=Math.abs(wind)<.5?'.35':'1';
  $('sudden-banner').hidden=!s.suddenDeath||s.phase==='gameover';
  $('sudden-description').textContent=game.config.profile==='blue3'?'공격 3회 · 지원과 이동탄은 1회':'매 라운드 전원에게 추가 피해';
  const ttl=Math.max(0,Math.ceil(s.timeLeft??game.tuning.turnTime));$('time-value').textContent=ttl;
  $('turn-timer').style.background=`conic-gradient(${ttl<6?'#f59082':'#ffd27b'} ${clamp(ttl/(game.tuning.turnTime||25)*100,0,100)}%,#102d3f99 0)`;
  $('turn-timer').style.opacity=s.phase==='aim'?'1':'.4';
  let label='출격 대기';
  if(started){label=s.phase==='gameover'?'전투 종료':s.paused?'전투 일시 정지':s.phase==='aim'?(game.isHumanTurn()?((t?.team===1?'레드':'블루')+' 팀 · '+(t?.name||'')+'의 차례'):'레드 팀 · 조준 중…'):s.phase==='projectile'?'포격 진행 중':s.phase==='settling'?'지형 변화 확인 중':'다음 차례를 준비합니다';}
  $('phase-label').innerHTML='<i></i>'+esc(label);$('phase-label').classList.toggle('ai',!!t&&t.team===1);
  if(t){
   if(force||activeKey!==t.uid){activeKey=t.uid;drawPortrait($('active-portrait'),t.def,t.team);$('active-name').textContent=t.name;$('active-team').textContent=t.team===0?'BLUE SQUAD':'RED SQUAD';$('active-team').style.color=t.team===0?'var(--cyan)':'var(--red)';}
   $('active-hp').textContent=Math.max(0,Math.ceil(t.hp)).toLocaleString()+' / '+Math.ceil(t.maxHp).toLocaleString()+' HP';
   const wk=t.uid+':'+s.weaponIndex+':'+s.round+':'+human;if(force||weaponKey!==wk){weaponKey=wk;renderWeapons(t);}
   $('weapon-bar').querySelectorAll('button').forEach((b,i)=>b.disabled=!human||(s.round<(t.def.weapons[i].unlockRound||1)));
   const aiming=game.getAimingState(),aim=Math.round(aiming.localAngle);$('angle-value').textContent=aim;$('angle-range').min=aiming.min;$('angle-range').max=aiming.max;$('angle-range').value=aim;
   const signed=v=>(v>=0?'+':'')+v.toFixed(1);
   $('angle-limits').textContent=aiming.min+'–'+aiming.max+'°';$('terrain-angle').textContent=signed(aiming.terrainAngle)+'°';$('actual-angle').textContent=aiming.actualElevation.toFixed(1)+'°';
   $('angle-reference').textContent=game.config.profile==='classic'?(game.config.angleProfile==='kr_reference'?'한국 참고':'JP 2003'):'구현값';
   const power=Math.round(aiming.power);$('power-value').textContent=power;$('power-range').min=aiming.powerMin;$('power-range').max=aiming.powerMax;$('power-range').step=aiming.powerStep;$('power-range').value=power;
   document.querySelectorAll('.power-markers i').forEach((mark,i)=>mark.textContent=Math.round(aiming.powerMin+(aiming.powerMax-aiming.powerMin)*i/5));
   if(!targetPowers.has(t.uid))targetPowers.set(t.uid,power);
   const target=clamp(targetPowers.get(t.uid),aiming.powerMin,aiming.powerMax),previous=lastPowers.get(t.uid),pct=v=>clamp((v-aiming.powerMin)/Math.max(1,aiming.powerMax-aiming.powerMin)*100,0,100);
   $('power-target').style.left=pct(target)+'%';$('power-previous').hidden=previous===undefined;if(previous!==undefined)$('power-previous').style.left=pct(previous)+'%';
   $('power-target-value').textContent=Math.round(target);$('power-previous-value').textContent=previous===undefined?'—':Math.round(previous);
   $('power-target').title='목표 '+Math.round(target)+'%';$('power-previous').title=previous===undefined?'직전 발사 없음':'직전 '+Math.round(previous)+'%';
   const move=clamp(t.moveLeft/Math.max(1,t.maxMove)*100,0,100);$('move-value').textContent=Math.round(move)+'%';$('move-fill').style.width=move+'%';
   $('face-button').textContent=t.face<0?'⇤':'⇥';$('face-button').title='발사 방향 전환 · 현재 '+(t.face<0?'왼쪽':'오른쪽');
   const ik=t.uid+':'+human+':'+s.itemUsed+':'+Math.ceil(t.hp)+':'+JSON.stringify(t.inventory);if(force||itemKey!==ik){itemKey=ik;renderItems(t);}
   renderInspector(t,human,force);
  }
  for(const id of ['fire-button','skip-button'])$(id).disabled=!human;
  for(const id of ['angle-range','power-range','face-button'])$(id).disabled=!human||isSupportAction();
  for(const id of ['move-left','move-right'])$(id).disabled=!human||!t?.moveLeft;
  const order=(s.turnOrder?.length?s.turnOrder:s.tanks.filter(t=>t.alive).sort((a,b)=>(a.nextDelay??0)-(b.nextDelay??0)).map(t=>t.uid));
  $('turn-order').innerHTML=order.slice(0,6).map((entry,i)=>{const id=typeof entry==='object'?(entry.uid??entry.id):entry,u=s.tanks.find(t=>t.uid===id);return u?`<span class="queue-token ${u.team?'red':''} ${i===0?'current':''}"><i></i>${esc(u.name)}</span>`:'';}).join('');
  const now=performance.now();feed=feed.filter(e=>now-e.at<5500);$('battle-feed').innerHTML=feed.map(e=>`<div class="feed-line ${e.type==='damage'?'damage':''}">${esc(e.text)}</div>`).join('');
  renderActionSummary();
  if(s.phase==='gameover'&&!resultSaved&&started)showResult();
 }
 function fire(){if(!canAct())return;const ok=game.fire();if(ok===false)showToast('지금은 발사할 수 없습니다.');$('first-hint').hidden=true;updateUI();}
 function useItem(id){if(!canAct())return;const ok=game.useItem(id);if(ok===false)showToast('지금은 이 아이템을 사용할 수 없습니다.');else showToast((D.items.find(i=>i.id===id)?.name||'아이템')+' 사용');updateUI(true);focusArena();}
 function setTargetPower(value){game.setPower(value);targetPowers.set(game.active.uid,game.state.power);}
 function beginCharge(){if(!canAct()||isSupportAction())return;if(!targetPowers.has(game.active.uid))targetPowers.set(game.active.uid,game.state.power);charge={elapsed:0};game.setPower(game.getChargePower(0));$('fire-button').classList.add('charging');$('first-hint').hidden=true;updateUI();}
 function endCharge(shoot=true){if(!charge)return;charge=null;$('fire-button').classList.remove('charging');if(shoot)fire();}
 function showResult(){
  if(!game||game.state.phase!=='gameover'||!started||resultSaved)return;
  resultSaved=true;releaseInputs();const winner=game.state.winner,draw=winner===null||winner===-1||winner==='draw';
  const team=winner&&typeof winner==='object'?winner.team:Number(winner);const won=team===0;
  $('result-title').textContent=draw?'DRAW':won?'VICTORY':'DEFEAT';$('result-kicker').textContent=draw?'BATTLE COMPLETE':(team===0?'BLUE':'RED')+' SQUAD WINS';
  $('result-description').textContent=draw?'서로의 전선을 끝까지 지켰습니다.':won?'전장의 마지막 한 발을 가져왔습니다.':'다음 전투에서는 새로운 각도를 찾아보세요.';
  $('victory-emblem').textContent=draw?'◆':won?'★':'◇';$('result-overlay').querySelector('.result-modal').classList.toggle('lost',!won&&!draw);
  const recordTeam=matchConfig.control==='hotseat'&&!draw?team:0,record=stats[recordTeam]||stats[0],teamLabel=recordTeam===0?'블루':'레드';
  $('result-damage').textContent=Math.round(record.damage).toLocaleString();$('result-shots').textContent=record.shots;$('result-turns').textContent=game.state.turnNumber||0;$('result-damage-label').textContent=teamLabel+'가 준 피해';$('result-shots-label').textContent=teamLabel+' 발사 탄 수';
  if(draw)$('result-description').textContent=game.state.endReason?.includes('simultaneous')?'두 팀이 동시에 전멸했습니다.':'제한 라운드 종료 시 두 팀의 체력 비율이 같습니다.';
  const rec={date:new Date().toISOString(),winner:draw?'draw':team,profile:matchConfig.profile,angleProfile:matchConfig.angleProfile,tank:matchConfig.playerTank,map:matchConfig.map,damage:Math.round(record.damage),shots:record.shots,recordTeam,teamStats:stats.map(s=>({...s})),turns:game.state.turnNumber,seed:matchConfig.seed,control:matchConfig.control};
  history.unshift(rec);history=history.slice(0,12);storage.set('fortress-blue-history-v1',history);openOverlay('result-overlay');
 }
 function renderHistory(){
  $('history-list').innerHTML=history.length?history.map(r=>{const tank=(D.catalogs[r.profile]||[]).find(t=>t.id===r.tank),map=D.maps.find(m=>m.id===r.map);return `<article class="history-card"><div><b class="${r.winner===1?'defeat':''}">${r.winner==='draw'?'무승부':r.winner===0?'블루 승리':'레드 승리'}</b><span>${esc(tank?.name||r.tank)} · ${esc(map?.name||r.map)}</span><span>${r.recordTeam===1?'레드':'블루'} 피해 ${Number(r.damage).toLocaleString()} · ${Number(r.turns)||0}턴</span></div><time>${new Date(r.date).toLocaleDateString('ko-KR',{month:'short',day:'numeric'})}</time></article>`;}).join(''):'<div class="empty-history">첫 번째 전투 기록을 남겨 보세요.</div>';
 }
 function renderAngleProfileControls(){
  const choices=Object.values(D.aiming.angleProfiles).map(p=>`<option value="${esc(p.id)}">${esc(p.label)}</option>`).join('');
  for(const id of ['lobby-angle-profile','angle-profile-select']){$(id).innerHTML=choices;$(id).value=prefs.angleProfile;$(id).disabled=prefs.profile!=='classic';}
  $('lobby-angle-note').textContent=prefs.profile==='classic'?(prefs.angleProfile==='kr_reference'?'한국 커뮤니티 보고값 · 적용 빌드 미확인':'일본 서비스 2003 문헌값 · 한국 BLUE와 판본 구분'):'3BLUE의 원작 발사각은 미복구이며 현재 구현값을 사용합니다.';
 }
 function renderAimingProvenance(profileId,tank){
  const profileKey=started?game.config.angleProfile:prefs.angleProfile,profile=D.aiming.angleProfiles[profileKey],bounds=profileId==='classic'?profile.bounds[tank.id]:null;
  const selected=profileId==='classic'?`${esc(profile.label)} · ${bounds.min}–${bounds.max}°`:'3BLUE 원작 각도 미복구 · 실행 범위는 구현값';
  const rows=D.catalogs.classic.map(t=>{const jp=D.aiming.angleProfiles.jp2003.bounds[t.id],kr=D.aiming.angleProfiles.kr_reference.bounds[t.id],diff=jp.min!==kr.min||jp.max!==kr.max;return `<tr${diff?' class="angle-difference"':''}><th scope="row">${esc(t.name)}</th><td>${jp.min}–${jp.max}°</td><td>${kr.min}–${kr.max}°</td></tr>`;}).join('');
  const sourceLinks=(bounds?.sourceRefs||[]).filter(url=>/^https?:\/\//.test(url)).map((url,i)=>`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">발사각 출처 ${i+1} ↗</a>`).join(' · ');
  return `<h3>현재 발사각 자료</h3><p><b>${selected}</b><br>사격각은 차체를 기준으로 제한합니다. 화면의 실제 고각은 차체 기울기와 발사 방향을 반영한 값입니다.</p><p>${sourceLinks}</p>${profileId==='classic'?'<p>발사각만 선택 자료를 적용합니다. HP·공격·딜레이는 기존 데이터 프로필을 따릅니다. 한국 참고값의 적용 빌드는 확인되지 않았습니다.</p>':''}<details class="angle-comparison"><summary>클래식 13종 발사각 비교</summary><table><thead><tr><th>탱크</th><th>JP 2003</th><th>한국 참고</th></tr></thead><tbody>${rows}</tbody></table><p>색이 표시된 5종은 자료 간 수치가 다릅니다. 한국 캐논 원문은 25–45°와 각폭 25°를 함께 적지만, 계산한 각폭은 20°입니다. 제한은 최소·최대값으로 적용합니다.</p></details><h3>발사 파워 · 복원 범위</h3><p>Space 충전과 목표·직전 파워 표식은 구 매뉴얼의 조작 설명을 참고했습니다. 원작의 탱크별 파워→탄속 곡선, 충전 시간, 탄중량·중력·풍력 계수는 <b>미복구</b>입니다.</p><p>현재 0–100%는 정규화한 조작 값입니다. 기본 모델은 초속 90–1050 월드 단위의 선형 변환, 초당 72%p 충전과 왕복 게이지를 사용합니다. 모두 구현값이며 탱크별 원작 탄속표가 아닙니다. 현재 전투의 튜닝은 별도로 적용됩니다.</p><p>원문 탱크 선택표의 POWER 1·2는 무기 공격력이며 발사 게이지의 힘과 다른 값입니다.</p><a class="dataset-download" href="datasets/Fortress_AnglePower_Recovery.json" download>각도·파워 복원 데이터 JSON ↓</a>`;
 }
 function renderProvenance(){
  const profileId=started?game.config.profile:prefs.profile;
  const tank=started&&game.active?game.active.def:D.catalogs[profileId].find(t=>t.id===prefs.playerTank)||D.catalogs[profileId][0],p=tank.provenance||{},profile=D.profiles.find(p=>p.id===profileId);
  const link=(url,i)=>/^https?:\/\//.test(url)?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">출처 ${i+1} ↗</a>`:'';
  const sourceRows=(p.statSources||[]).filter(s=>s.field!=='aimMin'&&s.field!=='aimMax').map(s=>`<li><b>${esc(s.field)} = ${esc(s.value)}</b> · ${esc(s.label)}<br><code>${esc(s.status)}</code></li>`).join('');
  const assumptions=[...(p.simulationAssumptions||[]),...(profile.provenance?.assumptions||[])].filter(a=>!a.includes('한국판 스탯과 혼합'));
  const attackModel=profileId==='classic'?'클래식의 다탄 공격 수치는 1발당·총합 여부가 확정되지 않아 구현용 피해 분배식을 적용합니다.':'3BLUE는 스킬별 원문 조건을 따로 보존했습니다. 예를 들어 맹독박쥐의 공격력 73은 원문에 1발당 값으로 명시되어 있습니다. 최종 피해에는 구현용 피해 배율과 충돌 판정을 적용합니다.';
  $('provenance-content').innerHTML=`<h3>${esc(tank.name)} · ${profileId==='classic'?'기본 스탯: 일본 2003 문헌':'F3 공식 공지 프로필'}</h3><ul>${sourceRows}</ul><p>${(p.sourceRefs||[]).map(link).join(' · ')}</p>${renderAimingProvenance(profileId,tank)}<h3>플레이를 위해 정한 규칙</h3><ul>${assumptions.map(a=>'<li>'+esc(a)+'</li>').join('')}</ul><h3>포격 모델</h3><p>중력·바람·발사속도·거리별 피해·충돌 반경은 조정 가능한 구현값입니다. ${attackModel}</p><h3>스킬별 근거</h3>${tank.weapons.map(w=>`<p><b>${esc(w.name)}</b> · 공격 입력 ${w.attack} · ${w.delivery==='self'?'자기 대상 지원':`기본 1회 ${w.shots}발`}<br>공격 수치: <code>${esc(w.attackStatus||'simulation_assumption')}</code><br>행동·효과: <code>${esc(w.behaviorStatus||'simulation_assumption')}</code><br>${(w.assumptions||[]).map(esc).join(' ')}</p>`).join('')}<h3>맵과 아이템</h3><p>맵 3개와 탱크 외형은 이 구현을 위해 제작했습니다. 원본 지형 마스크와 스폰 좌표는 미복구 상태입니다. 아이템 적용 조건은 각 프로필에 맞춘 모델이며 한 턴에 하나씩 사용할 수 있습니다.</p><h3>복원 자료</h3><p>v1.2.0 · 총 1,208행 복원본을 입력 자료로 사용했습니다. 이번 플레이에 필요한 값만 연결했으며 전체 1,208행이 모두 게임 로직에 구현된 것은 아닙니다.</p>`;
 }
 function renderSettings(){
  renderAngleProfileControls();
  $('guide-toggle').checked=!!prefs.guide;$('guide-button').setAttribute('aria-pressed',String(!!prefs.guide));$('motion-toggle').checked=!!prefs.reduceMotion;$('quality-select').value=prefs.quality;
  $('sound-button').classList.toggle('off',!prefs.sound);$('sound-button').setAttribute('aria-label',prefs.sound?'효과음 끄기':'효과음 켜기');
  $('tuning-controls').innerHTML=tuningDefs.map(([key,label,min,max,step])=>{const val=prefs.tuning[key]??D.tuningDefaults[key];return `<div class="tuning-row"><label for="tuning-${key}">${esc(label)}<output id="value-${key}">${esc(val)}</output></label><input id="tuning-${key}" type="range" data-tune="${key}" min="${min}" max="${max}" step="${step}" value="${val}"></div>`;}).join('');
 }
 $('profile-switch').addEventListener('click',e=>{const b=e.target.closest('[data-profile]');if(!b)return;prefs.profile=b.dataset.profile;if(!D.catalogs[prefs.profile].some(t=>t.id===prefs.playerTank))prefs.playerTank=D.catalogs[prefs.profile][0].id;renderLobby();});
 $('tank-picker').addEventListener('click',e=>{const b=e.target.closest('[data-tank]');if(!b)return;prefs.playerTank=b.dataset.tank;$('tank-picker').querySelectorAll('button').forEach(x=>{x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',String(x===b));});renderPicked();});
 $('map-select').addEventListener('change',e=>prefs.map=e.target.value);
 $('control-select').addEventListener('change',e=>{prefs.control=e.target.value;$('difficulty-select').disabled=prefs.control==='hotseat';});
 $('difficulty-select').addEventListener('change',e=>prefs.difficulty=e.target.value);
 $('team-size-select').addEventListener('change',e=>prefs.teamSize=Number(e.target.value));
 $('opponent-select').addEventListener('change',e=>prefs.opponentTank=e.target.value);
 $('turn-time-select').addEventListener('change',e=>prefs.tuning.turnTime=Number(e.target.value));
 for(const id of ['lobby-angle-profile','angle-profile-select'])$(id).addEventListener('change',e=>{if(!D.aiming.angleProfiles[e.target.value])return;prefs.angleProfile=e.target.value;savePrefs();renderAngleProfileControls();renderPicked();if(id==='angle-profile-select')showToast('다음 새 전투부터 선택한 발사각을 적용합니다.');});
 $('start-button').addEventListener('click',startMatch);
 $('close-lobby').addEventListener('click',()=>closeOverlay('lobby-overlay'));
 function toLobby(){renderLobby();$('close-lobby').hidden=!started;openOverlay('lobby-overlay');}
 $('brand-home').addEventListener('click',e=>{e.preventDefault();toLobby();});$('new-match-button').addEventListener('click',toLobby);
 $('pause-lobby-button').addEventListener('click',()=>{$('pause-overlay').hidden=true;toLobby();});
 $('result-lobby-button').addEventListener('click',()=>{$('result-overlay').hidden=true;toLobby();});
 $('rematch-button').addEventListener('click',()=>createMatch(makeConfig(),true));
 $('restart-button').addEventListener('click',()=>createMatch({...matchConfig,onEvent:handleEvent},true));
 $('resume-button').addEventListener('click',()=>closeOverlay('pause-overlay'));
 $('pause-button').addEventListener('click',()=>{if(started&&game.state.phase!=='gameover')openOverlay('pause-overlay');});
 $('help-button').addEventListener('click',()=>openOverlay('help-overlay'));
 document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>closeOverlay(b.dataset.close)));
 $('data-button').addEventListener('click',()=>{renderSettings();renderProvenance();renderHistory();openOverlay('data-overlay');});
 document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('selected',x===b));for(const name of ['settings','provenance','history'])$(name+'-tab').hidden=name!==b.dataset.tab;}));
 $('clear-history').addEventListener('click',()=>{history=[];storage.set('fortress-blue-history-v1',history);renderHistory();});
 $('guide-toggle').addEventListener('change',e=>{prefs.guide=e.target.checked;savePrefs();$('guide-button').setAttribute('aria-pressed',String(prefs.guide));});
 $('guide-button').addEventListener('click',()=>{prefs.guide=!prefs.guide;savePrefs();renderSettings();});
 $('motion-toggle').addEventListener('change',e=>{prefs.reduceMotion=e.target.checked;savePrefs();});
 $('quality-select').addEventListener('change',e=>{prefs.quality=e.target.value;savePrefs();});
 $('sound-button').addEventListener('click',()=>{prefs.sound=!prefs.sound;savePrefs();renderSettings();if(prefs.sound)sound('turn');});
 $('tuning-controls').addEventListener('input',e=>{const key=e.target.dataset.tune;if(!key)return;prefs.tuning[key]=Number(e.target.value);$('value-'+key).textContent=e.target.value;savePrefs();});
 $('reset-tuning').addEventListener('click',()=>{prefs.tuning={};savePrefs();renderSettings();showToast('다음 전투부터 기본 구현값을 사용합니다.');});
 $('fullscreen-button').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else showToast('이 브라우저는 전체 화면을 지원하지 않습니다.');}catch{showToast('전체 화면 전환을 사용할 수 없습니다.');}});
 $('zoom-in').addEventListener('click',()=>zoom=clamp(zoom+.2,1,2.4));$('zoom-out').addEventListener('click',()=>zoom=clamp(zoom-.2,1,2.4));$('zoom-fit').addEventListener('click',()=>zoom=1);
 $('angle-range').addEventListener('input',e=>{if(canAct()){game.setAngle(Number(e.target.value));updateUI();}});
 $('power-range').addEventListener('input',e=>{if(canAct()){setTargetPower(Number(e.target.value));updateUI();}});
 $('face-button').addEventListener('click',()=>{if(canAct()){game.setFacing(-game.active.face);updateUI();focusArena();}});
 $('weapon-bar').addEventListener('click',e=>{const b=e.target.closest('[data-weapon]');if(b&&canAct()){game.setWeapon(Number(b.dataset.weapon));updateUI(true);focusArena();}});
 $('item-bar').addEventListener('click',e=>{const b=e.target.closest('[data-item]');if(b)useItem(b.dataset.item);});
 $('recall-shot').addEventListener('click',()=>{if(!canAct())return;const a=lastShots.get(game.active.uid);if(!a||a.delivery==='self')return;const wi=game.active.def.weapons.findIndex(w=>w.id===a.weaponId);if(wi>=0)game.setWeapon(wi);game.setFacing(a.face);game.setAngle(a.angle);setTargetPower(a.power);updateUI(true);focusArena();showToast('직전 조준을 복원했습니다. 현재 바람과 지형을 확인하세요.');});
 $('skip-button').addEventListener('click',()=>{if(canAct()){game.skip();updateUI(true);}});
 $('fire-button').addEventListener('click',e=>{if(e.detail===0)fire();});
 $('fire-button').addEventListener('pointerdown',e=>{if(!canAct()||e.button>0||firePointerId!==null)return;firePointerId=e.pointerId;e.currentTarget.setPointerCapture(e.pointerId);clearTimeout(fireHoldTimer);if(!isSupportAction())fireHoldTimer=setTimeout(()=>{fireHoldTimer=null;beginCharge();},180);});
 $('fire-button').addEventListener('pointerup',e=>{if(firePointerId!==e.pointerId)return;firePointerId=null;clearTimeout(fireHoldTimer);fireHoldTimer=null;if(charge)endCharge(true);else fire();});
 function cancelFirePointer(){firePointerId=null;clearTimeout(fireHoldTimer);fireHoldTimer=null;endCharge(false);}
 $('fire-button').addEventListener('pointercancel',cancelFirePointer);$('fire-button').addEventListener('lostpointercapture',cancelFirePointer);
 for(const [id,dir]of [['move-left',-1],['move-right',1]]){
  $(id).addEventListener('pointerdown',e=>{if(!canAct())return;e.preventDefault();holdMove=dir;e.currentTarget.setPointerCapture(e.pointerId);game.setFacing(dir);});
  $(id).addEventListener('pointerup',()=>holdMove=0);$(id).addEventListener('pointercancel',()=>holdMove=0);$(id).addEventListener('lostpointercapture',()=>holdMove=0);
 }
 function aimAt(e){if(!canAct()||!renderer||isSupportAction())return;const pos=renderer.screenToWorld(e.clientX,e.clientY),t=game.active,dx=pos.x-t.x,dy=pos.y-(t.y-4);game.setAimAtWorld(pos.x,pos.y);if(Math.abs(dx)>80)setTargetPower(Math.hypot(dx,dy)/12);updateUI();}
 $('arena').addEventListener('pointerdown',e=>{if(!canAct())return;pointerAim=e.pointerId;e.currentTarget.setPointerCapture(e.pointerId);aimAt(e);});
 $('arena').addEventListener('pointermove',e=>{if(pointerAim===e.pointerId)aimAt(e);});
 $('arena').addEventListener('pointerup',()=>pointerAim=null);$('arena').addEventListener('pointercancel',()=>pointerAim=null);
 $('arena').addEventListener('lostpointercapture',()=>pointerAim=null);
 function cycleWeapon(dir){if(!canAct())return;const count=game.active.def.weapons.length;for(let i=1;i<=count;i++){const next=(game.state.weaponIndex+dir*i+count*2)%count;if((game.active.def.weapons[next].unlockRound||1)<=game.state.round){game.setWeapon(next);break;}}updateUI(true);}
 document.addEventListener('keydown',e=>{
  const overlay=document.querySelector('.overlay:not([hidden])');
  if(e.code==='Escape'){e.preventDefault();if(!$('data-overlay').hidden)closeOverlay('data-overlay');else if(!$('help-overlay').hidden)closeOverlay('help-overlay');else if(!$('pause-overlay').hidden)closeOverlay('pause-overlay');else if(!$('lobby-overlay').hidden){if(started)closeOverlay('lobby-overlay');}else if(started&&game.state.phase!=='gameover')openOverlay('pause-overlay');return;}
  if(overlay){if(e.code==='Tab'){const nodes=[...overlay.querySelectorAll('button:not([disabled]):not([hidden]),input:not([disabled]),select:not([disabled]),a[href]')].filter(n=>n.offsetParent!==null);if(nodes.length){const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}}return;}
  if(e.code==='KeyP'){e.preventDefault();if(started&&game.state.phase!=='gameover')openOverlay('pause-overlay');return;}
  if(!canAct())return;
  const formFocus=e.target.matches('input,select,textarea,[contenteditable=true]');
  if(formFocus&&e.code!=='Space')return;
  if(e.code==='Space'&&e.target.closest('button,a')&&e.target.id!=='fire-button')return;
  const battlefield=e.target===$('arena')||e.target===document.body;
  if(e.code==='Tab'){if(battlefield&&!e.shiftKey){e.preventDefault();cycleWeapon(1);}return;}
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space'].includes(e.code))e.preventDefault();
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyA','KeyD','KeyW','KeyS'].includes(e.code))keys.add(e.code);
  if(e.code==='Space'&&!e.repeat){if(isSupportAction())fire();else beginCharge();}
  if((e.code==='KeyQ'||e.code==='KeyE')&&!e.repeat){e.preventDefault();cycleWeapon(e.code==='KeyQ'?-1:1);}
  if(/^Digit[1-4]$/.test(e.code)){game.setWeapon(Number(e.code.slice(-1))-1);updateUI(true);}
 });
 document.addEventListener('keyup',e=>{keys.delete(e.code);if(e.code==='Space'&&charge){e.preventDefault();endCharge(true);}});
 window.addEventListener('blur',releaseInputs);
 document.addEventListener('visibilitychange',()=>{lastFrame=performance.now();if(document.hidden&&started&&!anyOverlay()&&game.state.phase!=='gameover')openOverlay('pause-overlay');});
 let loopErrors=0;
 function frame(now){
  const dt=Math.min(.25,Math.max(0,(now-lastFrame)/1000));lastFrame=now;
  try{
   if(game){
    if(canAct()){
     const dir=holdMove||((keys.has('ArrowRight')||keys.has('KeyD')?1:0)-(keys.has('ArrowLeft')||keys.has('KeyA')?1:0));if(dir)game.move(dir,dt);
     const aim=(keys.has('ArrowUp')||keys.has('KeyW')?1:0)-(keys.has('ArrowDown')||keys.has('KeyS')?1:0);if(aim)game.setAngle(game.active.angle+aim*34*dt);
     if(charge){charge.elapsed+=dt;game.setPower(game.getChargePower(charge.elapsed));}
    }else if(charge)endCharge(false);
    game.tick(dt);renderer.render(dt,{guide:prefs.guide,quality:prefs.quality,zoom,reduceMotion:prefs.reduceMotion,feedbackBounds});
    uiAccumulator+=dt;if(uiAccumulator>.08){uiAccumulator=0;updateUI();}
   }
  }catch(err){console.error('Frame error',err);loopErrors++;if(loopErrors>3){$('fatal-error').hidden=false;return;}}
  requestAnimationFrame(frame);
 }
 renderLobby();renderSettings();createMatch(makeConfig(),false);requestAnimationFrame(frame);
 window.FortApp={getGame:()=>game,getState:()=>game.getSnapshot(),getPreferences:()=>({...prefs}),version:'1.2.0'};
})();
