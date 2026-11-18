(function(){'use strict';
const $=id=>document.getElementById(id),game=new FQ.Game(),renderer=new FQRenderer($('scene'),$('webgl'),$('hud')),keys=new Set();
const state={last:performance.now(),acc:0,uiTime:0,dirty:true,lastMode:'world',fps:0,frameCount:0,fpsTime:0,reportSeen:null,toastTimer:0,quickMemory:null,checkpointMemory:null,moveTarget:false,attackMoveTarget:false,focusTarget:false,focus:false};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(text){$('toast').textContent=text;$('toast').classList.add('visible');clearTimeout(state.toastTimer);state.toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3200);}
function safe(fn){try{const result=fn();state.dirty=true;return result;}catch(e){toast(e.message);game.note('오류: '+e.message);return false;}}
function bind(id,fn){$(id).onclick=()=>safe(fn);}
function worldOnly(fn){if(game.mode!=='world'){toast('전투 종료 후 사용할 수 있습니다.');return false;}return fn();}
function togglePause(){if(game.mode==='battle'){game.paused=!game.paused;keys.clear();state.acc=0;state.dirty=true;}}
function cancelTargeting(){state.moveTarget=false;state.attackMoveTarget=false;state.focusTarget=false;state.dirty=true;}
function command(order,all=$('allOrders').checked){cancelTargeting();return game.issue(order,all);}
function selectControl(fn){cancelTargeting();return fn();}
function renderUnitCard(u){
 if(!u?.alive||u.evacuated)return '<p class="muted">아군 병사를 선택하세요.</p>';
 const effects=FQ.fatigueEffects(u),s=FQ.stats(u),rest=game.restStatus(u),fatigue=FQ.clamp(u.fatigue,0,100),group=game.battle.groups.find(g=>g.id===u.groupId);
 const resting=group?.order==='rest',seconds=Math.max(0,(rest.neededTicks-rest.safeTicks)/60),status=rest.state==='settling'?`${rest.label} · ${seconds.toFixed(1)}초`:rest.label;
 const behavior=u.individualRetreat||group?.order==='retreat'?'철수 중':game.direct&&game.selectedUnitId===u.id?'직접 조작 중':u.action?.kind==='heal'?'아군 치료 중':u.action?'공격 준비 / 실행':FQ.ORDERS[group?.order]||'대기';
 return `<h3>${esc(FQ.unitLabel(u))} <small>${u.origin?'훈련 '+(u.level-1):'Lv.'+u.level}</small></h3><div class="unitState">${esc(behavior)}</div><div class="muted">HP ${Math.ceil(u.hp)} / ${u.maxHp}</div><div class="bar"><i style="width:${100*u.hp/u.maxHp}%"></i></div><div class="fatigueHeader"><span>피로 FT</span><strong>${Math.floor(fatigue)} / 100</strong></div><div class="bar fatigueBar ${fatigue>=70?'high':fatigue>=40?'medium':''}" role="progressbar" aria-label="선택 병사 피로" aria-valuenow="${Math.floor(fatigue)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${fatigue}%"></i></div><div class="combatReadout" title="피로의 전투 보정과 역할별 속도·사거리는 자체 설계입니다. 공격 간격은 높을수록 다음 공격이 늦어집니다."><div><small>현재 공격 AT</small><strong>${Math.round(FQ.attackPower(u)*10)/10}</strong></div><div><small>이동 속도</small><strong>${Math.round(effects.movementMultiplier*100)}%</strong></div><div><small>공격 간격</small><strong>${Math.round(effects.attackIntervalMultiplier*100)}%</strong></div><div><small>회복 HR${u.origin?' · 관측':''}</small><strong>${s.HR}</strong></div></div><p class="combatCaption">피로 보정은 자체 규칙 · 공격 간격이 길수록 느려짐</p>${resting?`<div class="recoveryStatus ${rest.state}" data-recovery-state="${rest.state}"><strong>${esc(status)}</strong><small>안전하게 3초 정지 후 피로 4/초 회복 · HR 회복 2배</small></div>`:''}<div class="muted">${esc(FQ.CLASSES[u.type].skill)} · ${u.skillCooldown?Math.ceil(u.skillCooldown/60)+'초':'준비'}<br>사거리 ${FQ.CLASSES[u.type].range} · 훈련 경험 ${u.exp} / ${u.level*60}</div>${u.origin?`<div class="sourceBadge">${esc(u.origin.recordId)} · 관측 원시 Lv.${FQ.source(u).raw.level}</div><div class="statStrip">기준 AT ${Math.round(s.AT)} · AR ${Math.round(s.AR)} · DF ${Math.round(s.DF)} · DR ${Math.round(s.DR)}</div>`:''}`;
}
game.onChange=()=>state.dirty=true;game.newGame('hybrid-repoN-v19');
function updateUI(){
 const w=game.world,b=game.battle,battle=game.mode==='battle',a=game.activeArmy;
 const selectionKey=`${game.mode}:${game.selectedGroupId}:${game.selectedUnitId}`;
 if(state.selectionKey!==undefined&&state.selectionKey!==selectionKey)cancelTargeting();state.selectionKey=selectionKey;
 $('phase').textContent=battle?'TACTICAL BATTLE':'STRATEGIC CAMPAIGN';$('renderStatus').textContent=battle?(renderer.view3D?(renderer.gl?'WebGL 3D':'호환 3D · CPU'):'전술 2D'):'v22 · 전술 휴식 / 피로 관리 / 부대 지휘';
 for(const id of ['worldTools','worldPanel'])$(id).hidden=battle;for(const id of ['battleTools','battlePanel'])$(id).hidden=!battle;
 for(const id of ['saveBtn','loadBtn','exportBtn','importBtn','checkpointBtn'])$(id).disabled=false;
 const hybrid=w.profile?.id==='hybrid-repoN-v19';$('profileLabel').textContent=hybrid?'관측 데이터 적용 캠페인':'기존 커스텀 캠페인';$('profileNote').textContent=hybrid?'원시 관측값 사용 · 공식/지도/역할은 자체 설계':'v15 규칙 유지 · 원작 복원 데이터와 분리';$('armoryBtn').disabled=battle;
 document.body.classList.toggle('focusBattle',battle&&state.focus);$('focusBtn').disabled=!battle;$('focusBtn').textContent=state.focus?'기본 화면':'전장 집중';
 $('gold').textContent=w.gold+' G';$('enemyAuto').checked=game.options.enemyAuto;
 $('contextHint').textContent=battle?'적 우클릭: 집중 · T: 교전 이동 · R: 휴식 · C/V: 구조':'거점을 선택한 뒤 이동 / 출전 · 전장 연습은 캠페인에 영향을 주지 않습니다.';
 $('viewBtn').textContent=renderer.view3D?'3D':'2D';$('followBtn').textContent='추적 '+(renderer.camera.follow?'ON':'OFF');
 if(!battle){
  const captured=w.regions.filter(r=>r.owner==='blue').length,foes=w.enemyArmies.reduce((n,e)=>n+e.roster.length,0),pending=w.campaign.pending.length;
  $('campaignTitle').textContent=w.campaign.status==='won'?'캠페인 완료':'재구축 전선 확보';$('campaignProgress').textContent=`거점 ${captured}/6 · 남은 적 군단 ${w.enemyArmies.length}개 (${foes}명)`;$('campaignBar').style.width=(captured/6*100)+'%';
  $('rewardsBtn').textContent=pending?`미결 거점 보상 ${pending}건`:'작전 일지 / 목표 확인';
  $('armyCards').innerHTML=w.armies.map(ar=>`<button class="card ${ar.id===a.id?'selected':''}" data-army="${ar.id}"><strong>${esc(ar.name)}</strong><span>${esc(FQ.REGIONS[ar.region].name)} · ${ar.roster.length}명</span></button>`).join('');
  const r=w.regions[game.selectedRegion]||w.regions[a.region],adj=a.region===r.id||FQ.REGIONS[a.region].links.includes(r.id),enemy=w.enemyArmies.filter(e=>e.region===r.id).reduce((s,e)=>s+e.roster.length,0),hostile=r.owner==='red'||enemy>0;
  $('regionName').textContent=FQ.REGIONS[r.id].name;$('regionInfo').textContent=`${r.owner==='blue'?'아군':r.owner==='red'?'적군':'중립'} 거점 · 수비대 ${r.garrison.length} · 적 군단 ${enemy}명`;
  $('regionTerrain').textContent=FQ.MAP_INFO[FQ.REGIONS[r.id].kind].title+' — '+FQ.MAP_INFO[FQ.REGIONS[r.id].kind].hint;
  $('goBtn').textContent=!adj?'인접한 거점을 선택하세요':hostile?(r.owner==='blue'?'거점 방어':'출전'):'이동 / 확보';$('goBtn').disabled=!adj||!a.roster.length||(!hostile&&a.region===r.id);
  $('supportList').innerHTML=game.eligibleSupport(r.id).map(s=>`<label class="check"><input type="checkbox" data-support="${s.id}" ${game.supportIds.includes(s.id)?'checked':''}>${esc(s.name)} 지원 (${s.roster.length})</label>`).join('');
  $('enemyInfo').innerHTML=w.enemyArmies.map(e=>`<div>${esc(e.name)} · ${esc(FQ.REGIONS[e.region].name)} · ${e.roster.length}명</div>`).join('')||'남은 적 군단이 없습니다.';
 }else{
  $('autoBtn').textContent=game.direct?'직접 조작 → 자동':'자동 전투 → 직접';$('pauseBtn').textContent=game.paused?'계속 P':'일시정지 P';
  $('groupCards').innerHTML=b.groups.filter(g=>g.team==='blue').map(g=>{const active=b.units.filter(u=>u.groupId===g.id&&u.alive&&!u.evacuated),ft=active.length?Math.round(active.reduce((sum,u)=>sum+u.fatigue,0)/active.length):0;return `<button class="card ${g.id===game.selectedGroupId?'selected':''}" data-group="${g.id}"><strong>${esc(g.name)}</strong><span>${g.spawned?active.length+'명 · '+FQ.ORDERS[g.order]+(g.focusTargetId!==null?' / 집중':g.engagement?' / 교전':'')+' · FT '+ft:'도착 '+Math.max(0,Math.ceil((g.arrival-b.tick)/60))+'초 전'}</span></button>`;}).join('');
  $('formation').value=game.selectedGroup?.formation||'line';const u=game.selected;
  const group=game.selectedGroup,queue=group?.waypoints||[],critical=game.criticalUnits();
  $('battleRestBtn').disabled=!group;
  $('restGroupInfo').hidden=group?.order!=='rest';
  if(group?.order==='rest'){const units=b.units.filter(x=>x.groupId===group.id&&x.alive&&!x.evacuated),counts=units.reduce((n,x)=>{const s=game.restStatus(x).state;n[s]=(n[s]||0)+1;return n;},{});$('restGroupInfo').textContent=group.spawned?`휴식 지휘 · 회복 ${counts.recovering||0}/${units.length}명 · 안전 대기 ${counts.settling||0} · 위협 ${counts.threat||0}${counts.positioning?' · 집결 '+counts.positioning:''}${counts.manual?' · 직접 '+counts.manual:''}`:'지원군 도착 후 휴식 지점으로 집결합니다.';}
  $('autoRetreat').checked=group?.autoRetreat===true;$('autoRetreat').disabled=!group;
  $('waypointInfo').textContent=group?`${['move','attackmove'].includes(group.order)?FQ.ORDERS[group.order]+' 중 · ':''}후속 예약 ${queue.length}/8${queue.length?' · '+queue.map((p,i)=>`${i+1}: ${Math.round(p.x)},${Math.round(p.y)}`).join(' → '):''}`:'지휘할 부대를 선택하세요.';
  $('clearQueueBtn').disabled=!queue.length;$('criticalBtn').textContent=`위험 병사 ${critical.length} · C`;$('criticalBtn').disabled=!critical.length;
  $('unitRetreatBtn').textContent=u?.individualRetreat?'철수 취소 V':'선택 철수 V';$('unitRetreatBtn').disabled=!u?.alive||u?.evacuated;
  $('moveTargetBtn').textContent=state.moveTarget?'이동 지정 ON':'이동 지정';$('moveTargetBtn').classList.toggle('active',state.moveTarget);
  $('attackMoveBtn').textContent=state.attackMoveTarget?'교전 이동 지정 ON':'교전 이동 T';$('attackMoveBtn').classList.toggle('active',state.attackMoveTarget);
  $('focusTargetBtn').textContent=state.focusTarget?'적 표적 선택 중':'집중 표적 X';$('focusTargetBtn').classList.toggle('active',state.focusTarget);
  const focus=group?.focusTargetId!==null?b.units.find(e=>e.id===group?.focusTargetId):null;
  $('focusTargetInfo').textContent=focus?`집중 #${focus.id} ${FQ.CLASSES[focus.type].name} · HP ${Math.ceil(focus.hp)}/${focus.maxHp} · 종료 후 ${FQ.ORDERS[group.order]} 복귀`:group?.engagement?'교전 이동: 근처 적과 교전 중 · 정리 후 경로 재개':'지정 표적 없음 · 적 우클릭 / X 후 적 탭';
  $('clearFocusBtn').disabled=!focus;
  $('targetModeHint').hidden=!(state.moveTarget||state.attackMoveTarget||state.focusTarget);
  $('targetModeHint').textContent=state.focusTarget?'집중 공격: 적 병사를 클릭·탭하세요. Esc 취소':state.attackMoveTarget?'교전 이동: 목적지를 클릭·탭하세요. Shift로 후속 예약 · Esc 취소':'일반 이동: 목적지를 클릭·탭하세요. Esc 취소';
  $('skillBtn').disabled=game.paused||!u?.alive||u?.evacuated||u?.skillCooldown>0;
  $('healBtn').disabled=game.paused||!u?.alive||u?.evacuated||b.healCooldown>0;
  $('unitInfo').innerHTML=renderUnitCard(u);
  $('healBtn').textContent=b.healCooldown?`회복 ${Math.ceil(b.healCooldown/60)}초`:'전술 회복 H';$('skillBtn').textContent=u?FQ.CLASSES[u.type].skill+' F':'고유 스킬 F';
  $('reinforceBtn').disabled=b.groups.some(g=>g.sourceKind==='reserve')||!w.reserve.length||game.paused;
  document.querySelectorAll('[data-order]').forEach(btn=>btn.classList.toggle('active',btn.dataset.order===game.selectedGroup?.order));
 }
 $('log').innerHTML=game.log.slice(0,25).map(x=>`<div>${esc(x.message)}</div>`).join('');
 if(game.report&&game.report!==state.reportSeen){state.reportSeen=game.report;showReport(game.report);}
}
function showReport(r){if(!r.training)checkpoint('전투 종료');$('resultTitle').textContent=(r.training?'전장 연습 · ':'')+(r.outcome==='victory'?'승리':'철수 / 패배');const lost=r.groups.reduce((s,g)=>s+g.lost,0),survived=r.groups.reduce((s,g)=>s+g.survived,0);
 $('resultBody').innerHTML=`<p class="muted">${esc(r.region)} · ${Math.floor(r.time/60)}분 ${Math.floor(r.time%60)}초${r.training?' · 캠페인 변경 없음':''}</p><div class="resultMetrics"><div><strong>${survived}</strong><span>생존 병력</span></div><div><strong>${lost}</strong><span>전사 병력</span></div><div><strong>${Math.round(r.damage)}</strong><span>총 피해</span></div></div>${r.groups.map(g=>`<div class="resultRow"><b>${esc(g.name)}</b><span>${g.joined?`생존 ${g.survived} · 전사 ${g.lost} · 철수 ${g.retreated}`:'미도착 · 원래 병력 유지'}</span></div>`).join('')}<p class="muted">${r.training?'연습이므로 사망과 성장은 기록하지 않았습니다.':'생존 병력의 체력·피로·경험치를 소속 군단에 반영했습니다.'}</p>`;
 if(r.attempts)$('resultBody').innerHTML+=`<div class="statStrip">공격 판정 ${r.attempts} · 명중 ${r.hits||0} · 회피 ${r.misses||0} · 자체 공식</div>`;
 if(r.newEvents?.length)$('resultBody').innerHTML+=`<p class="journalWin">새 거점 보상 ${r.newEvents.length}건이 열렸습니다. 전략 맵의 미결 보상에서 선택하세요.</p>`;
 if(r.campaignWon)$('resultBody').innerHTML+='<p class="journalWin">캠페인 완료 · 모든 거점을 확보하고 적 군단을 격퇴했습니다.</p>';
 if(r.units?.length){const rows=r.units.slice().sort((a,b)=>b.damage-a.damage||a.id-b.id).slice(0,5);$('resultBody').innerHTML+=`<h3>아군 전과 상위 병사</h3><p class="muted">${r.metricsSinceTick?'이전 저장 복원 이후 '+(r.metricsSinceTick/60).toFixed(1)+'초부터 집계':'전투 시작부터 누적'} · 피해뿐 아니라 치유·공성 기여는 상세 전과에서 확인</p><div class="tableScroll"><table class="catalogTable"><thead><tr><th>병사</th><th>상태</th><th>피해</th><th>치유</th><th>성문</th></tr></thead><tbody>${rows.map(u=>`<tr><td>#${u.id} ${esc(u.label)}</td><td>${statusName(u.status)}</td><td>${Math.round(u.damage)}</td><td>${Math.round(u.healing)}</td><td>${Math.round(u.gateDamage)}</td></tr>`).join('')}</tbody></table></div>`;}
 $('reportDialog').showModal();
}
function renderRoster(){
 const unitText=u=>`#${u.id} ${FQ.unitLabel(u)} · ${FQ.CLASSES[u.type].name} · HP ${Math.ceil(u.hp)}/${FQ.maxHP(u)} · AT ${FQ.stats(u).AT} · FT ${Math.round(u.fatigue)}`;
 $('mainRosterTitle').textContent=`${game.activeArmy.name} ${game.activeArmy.roster.length}/40`;$('reserveRosterTitle').textContent=`예비군 ${game.world.reserve.length}/120`;
 const filter=$('rosterFilter').value,sort=$('rosterSort').value;
 for(const [id,roster] of [['mainRoster',game.activeArmy.roster],['reserveRoster',game.world.reserve]]){
  const old=new Set([...$(id).selectedOptions].map(o=>Number(o.value)));
  const list=roster.filter(u=>filter==='all'||u.type===filter).slice().sort((a,b)=>sort==='hp'?a.hp/FQ.maxHP(a)-b.hp/FQ.maxHP(b)||a.id-b.id:sort==='at'?FQ.stats(b).AT-FQ.stats(a).AT||a.id-b.id:sort==='fatigue'?b.fatigue-a.fatigue||a.id-b.id:a.id-b.id);
  $(id).replaceChildren(...list.map(u=>{const o=document.createElement('option');o.value=u.id;o.textContent=unitText(u);o.selected=old.has(u.id);return o;}));
  if(list.length&&!$(id).selectedOptions.length)$(id).options[0].selected=true;
 }
}
function transferSelected(toMain){const el=$(toMain?'reserveRoster':'mainRoster'),ids=[...el.selectedOptions].map(o=>Number(o.value));if(!game.transferMany(ids,toMain))toast('전체 병력을 옮길 정원과 선택 상태를 확인하세요.');renderRoster();}
bind('trainingBtn',()=>{game.startBattle(Number($('trainingMap').value),true);renderer.resetCamera();});
bind('recoveryTrainingBtn',()=>worldOnly(()=>{
 if(!game.startBattle(2,true))return false;
 const b=game.battle,main=b.groups.find(g=>g.sourceKind==='army'&&g.sourceId===b.activeArmyId);
 for(const u of b.units)if(u.team==='blue'&&u.groupId===main.id){u.fatigue=70;u.hp=Math.max(1,u.maxHp-70);}
 game.selectGroup(main.id);command('rest',false);game.paused=true;keys.clear();state.acc=0;renderer.resetCamera();
 game.note('휴식 연습 · 부상과 피로 70은 자체 훈련용 초기상태입니다. P로 재개하면 집결 후 안전한 곳에서 회복합니다.');
 toast('휴식 연습 · 피로 70/부상 상태로 시작, 캠페인 영향 없음 · P로 재개');return true;
}));bind('goBtn',campaignGo);bind('splitBtn',()=>game.split());bind('mergeBtn',()=>game.merge());bind('restBtn',()=>game.rest());bind('recruitBtn',()=>game.recruit());bind('turnBtn',()=>game.advanceTurn());
bind('rosterBtn',()=>worldOnly(()=>{renderRoster();$('rosterDialog').showModal();}));bind('toReserve',()=>transferSelected(false));bind('toArmy',()=>transferSelected(true));
$('rosterFilter').onchange=renderRoster;$('rosterSort').onchange=renderRoster;
bind('selectMainAll',()=>{for(const o of $('mainRoster').options)o.selected=true;});bind('selectReserveAll',()=>{for(const o of $('reserveRoster').options)o.selected=true;});
$('armyCards').onclick=e=>{const btn=e.target.closest('[data-army]');if(btn)safe(()=>game.switchArmy(Number(btn.dataset.army)));};$('groupCards').onclick=e=>{const btn=e.target.closest('[data-group]');if(btn)safe(()=>selectControl(()=>game.selectGroup(btn.dataset.group)));};
$('supportList').onchange=e=>{if(e.target.dataset.support)safe(()=>game.toggleSupport(Number(e.target.dataset.support)));};
document.querySelectorAll('[data-order]').forEach(btn=>btn.onclick=()=>safe(()=>command(btn.dataset.order)));
$('formation').onchange=e=>safe(()=>game.formation(e.target.value));bind('autoBtn',()=>{if(game.mode==='battle'){cancelTargeting();game.direct=!game.direct;keys.clear();}});bind('pauseBtn',togglePause);bind('reinforceBtn',()=>game.reinforce());bind('skillBtn',()=>game.skill());bind('healBtn',()=>game.healSpell());bind('withdrawBtn',()=>command('retreat',true));bind('viewBtn',()=>{renderer.view3D=!renderer.view3D;});bind('cameraBtn',()=>renderer.resetCamera());bind('followBtn',()=>{renderer.camera.follow=!renderer.camera.follow;});bind('enemyInfoBtn',()=>$('enemyInfo').hidden=!$('enemyInfo').hidden);
$('speed').onchange=e=>game.options.speed=Number(e.target.value);$('enemyAuto').onchange=e=>{game.options.enemyAuto=e.target.checked;game.autoClock=0;};$('health').onchange=e=>renderer.health=e.target.checked;$('effects').onchange=e=>renderer.effects=e.target.checked;$('paths').onchange=e=>renderer.paths=e.target.checked;$('dev').onchange=e=>$('devTools').hidden=!e.target.checked;
bind('gateBtn',()=>{if(game.mode==='battle'&&!game.paused)game.gateToggle();});bind('winBtn',()=>game.debugWin());bind('loseBtn',()=>game.debugLose());bind('healAll',()=>{if(game.battle)for(const u of game.battle.units)if(u.team==='blue'&&u.alive){u.hp=u.maxHp;u.fatigue=0;}});
bind('auditBtn',()=>{const report=game.validate();if(game.battle)game.export();toast(`무결성 검사 통과 · 군단 ${report.armies}개 / 전체 생존 병사 ${report.units}명`);});
bind('focusBtn',()=>{state.focus=!state.focus;});
bind('moveTargetBtn',()=>{state.moveTarget=!state.moveTarget;state.attackMoveTarget=false;state.focusTarget=false;});
bind('attackMoveBtn',()=>{state.attackMoveTarget=!state.attackMoveTarget;state.moveTarget=false;state.focusTarget=false;});
bind('focusTargetBtn',()=>{state.focusTarget=!state.focusTarget;state.moveTarget=false;state.attackMoveTarget=false;});
bind('clearFocusBtn',()=>{cancelTargeting();game.clearFocus($('allOrders').checked);});
bind('criticalBtn',()=>{cancelTargeting();if(game.selectCritical()&&game.selected){renderer.camera.focusX=game.selected.x;renderer.camera.focusY=game.selected.y;renderer.camera.follow=true;}});
bind('unitRetreatBtn',()=>{cancelTargeting();if(game.selected)game.retreatUnit(game.selected.id,!game.selected.individualRetreat);});
bind('clearQueueBtn',()=>game.clearWaypoints($('allOrders').checked));
$('autoRetreat').onchange=e=>safe(()=>game.setAutoRetreat(e.target.checked,$('allOrders').checked));
$('quality').onchange=e=>{renderer.quality=e.target.value;};
bind('helpBtn',()=>$('helpDialog').showModal());for(const btn of document.querySelectorAll('[data-close]'))btn.onclick=()=>$(btn.dataset.close).close();
// Persistence keeps the authoritative simulation in the engine and camera/preferences in the UI envelope.
function bundle(){const data=game.export();data.view={camera:{...renderer.camera},view3D:renderer.view3D,health:renderer.health,paths:renderer.paths,effects:renderer.effects,quality:renderer.quality};return data;}
function applySave(data){
 game.import(data);keys.clear();state.acc=0;state.reportSeen=null;state.lastMode=game.mode;
 for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();
 renderer.resetCamera();const v=data.view;
 if(v&&typeof v==='object'){
  for(const key of ['view3D','health','paths','effects'])if(typeof v[key]==='boolean')renderer[key]=v[key];
  if(['auto','high','low'].includes(v.quality))renderer.quality=v.quality;
  const c=v.camera;if(c){for(const [key,lo,hi] of [['yaw',-100,100],['pitch',.45,1.35],['zoom',.46,1.6],['focusX',0,960],['focusY',0,600]])if(Number.isFinite(c[key]))renderer.camera[key]=FQ.clamp(c[key],lo,hi);renderer.camera.follow=c.follow===true;}
 }
 $('quality').value=renderer.quality;state.moveTarget=false;state.attackMoveTarget=false;state.focusTarget=false;
 $('speed').value=String(game.options.speed);for(const key of ['health','paths','effects'])$(key).checked=renderer[key];
 state.dirty=true;$('saveState').textContent=game.mode==='battle'?`전투 복원 · ${Math.floor(game.battle.time)}초 · P로 재개`:'캠페인 복원 완료';
}
function checkpoint(label){
 try{const data=bundle();data.checkpointLabel=label;state.checkpointMemory=data;try{localStorage.setItem('fq4_checkpoint_v22',JSON.stringify(data));$('saveState').textContent='자동 체크포인트 · '+label;}catch{$('saveState').textContent='체크포인트 · '+label+' (이 탭 메모리만)';}}catch(e){toast('체크포인트 저장 실패: '+e.message);}
}
function campaignGo(){if(game.mode==='world')checkpoint('이동 / 출전 직전');game.go(game.selectedRegion);renderer.resetCamera();}
function save(){
 const data=bundle();state.quickMemory=data;
 try{localStorage.setItem('fq4_proto_v22',JSON.stringify(data));game.note(game.mode==='battle'?'전투 상태 저장 완료':'캠페인 저장 완료');toast('저장했습니다.');$('saveState').textContent=`빠른 저장 · ${game.mode==='battle'?'전투 '+Math.floor(game.battle.time)+'초':'전략 턴 '+game.world.turn}`;}
 catch{toast('브라우저 저장 제한: 현재 탭에만 보관했습니다. JSON 내보내기로 파일을 보관하세요.');$('saveState').textContent='탭 메모리 저장 · 종료 전 JSON 내보내기 필요';}
 return true;
}
function load(useCheckpoint=false){
 let data=useCheckpoint?state.checkpointMemory:state.quickMemory;
 try{const json=!data&&(localStorage.getItem(useCheckpoint?'fq4_checkpoint_v22':'fq4_proto_v22')||localStorage.getItem(useCheckpoint?'fq4_checkpoint_v21':'fq4_proto_v21')||(!useCheckpoint&&(localStorage.getItem('fq4_proto_v20')||localStorage.getItem('fq4_proto_v19')||localStorage.getItem('fq4_proto_v15')||localStorage.getItem('fq4_proto_v14')||localStorage.getItem('fq4_proto_v1'))));if(json)data=JSON.parse(json);}catch(e){if(!data)throw Error('브라우저 저장을 읽을 수 없습니다. JSON 파일을 가져오세요.');}
 if(!data)throw Error('저장된 '+(useCheckpoint?'체크포인트':'게임')+'가 없습니다.');
 if(game.mode==='battle'&&!confirm('진행 중인 전투를 저장된 상태로 교체할까요?'))return false;
 applySave(data);toast(game.mode==='battle'?'전투 복원 완료 · P로 재개하세요.':'캠페인을 복원했습니다.');return true;
}
bind('saveBtn',save);bind('loadBtn',()=>load());bind('checkpointBtn',()=>load(true));
bind('exportBtn',()=>{const data=JSON.stringify(bundle(),null,2),url=URL.createObjectURL(new Blob([data],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download=game.mode==='battle'?'firstqueen4-battle-v22.json':'firstqueen4-campaign-v22.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),3000);toast('현재 상태를 JSON 파일로 내보냈습니다.');});
bind('importBtn',()=>{if(game.mode==='battle')game.paused=true;keys.clear();$('importFile').click();});
$('importFile').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{if(f.size>4e6)throw Error('파일 크기는 최대 4MB입니다.');const data=JSON.parse(await f.text());if(game.mode==='battle'&&!confirm('현재 전투를 가져온 파일의 상태로 교체할까요?'))return;applySave(data);toast(game.mode==='battle'?'전투를 복원했습니다. P로 재개하세요.':'캠페인을 복원했습니다.');}catch(err){toast('가져오기 실패: '+err.message);}finally{e.target.value='';}};
function renderJournal(){
 const w=game.world,c=w.campaign;$('journalBody').innerHTML=(c.status==='won'?'<p class="journalWin">캠페인 완료 · 6개 거점과 전선을 모두 확보했습니다.</p>':'')+FQ.REGIONS.map(r=>{
  const owner=w.regions[r.id].owner,e=FQ.CAMPAIGN_EVENTS[r.id],choice=e?.choices.find(x=>x.id===c.choices[r.id]),pending=c.pending.includes(r.id);
  return `<div class="journalRow"><span class="number">${String(r.id+1).padStart(2,'0')}</span><div><strong>${esc(r.name)} · ${owner==='blue'?'확보':owner==='red'?'적 점령':'미확보'}</strong><small>${esc(FQ.MAP_INFO[r.kind].title)}${choice?' / '+esc(choice.label)+' 수령':''}${pending?' / 선택 보상 대기':''}</small></div>${pending?`<button data-reward="${r.id}">보상 선택</button>`:'<span class="muted">'+(owner==='blue'?'✓':'—')+'</span>'}</div>`;
 }).join('')+`<p class="muted">남은 적 군단 ${w.enemyArmies.length}개 · 재점령 보상 중복 없음 · v14에서 가져온 이미 확보한 거점에는 보상이 소급되지 않습니다.</p>`;
}
function openJournal(){if(game.mode!=='world')return;renderJournal();$('journalDialog').showModal();}
function openReward(id){if(game.mode!=='world'||!game.world.campaign.pending.includes(id))return;const e=FQ.CAMPAIGN_EVENTS[id];$('rewardTitle').textContent=e.title;$('rewardText').textContent=e.text;$('rewardChoices').innerHTML=e.choices.map(c=>`<button data-choice="${c.id}" data-region="${id}"><strong>${esc(c.label)}</strong><span>${esc(c.detail)}</span></button>`).join('');if(!$('rewardDialog').open)$('rewardDialog').showModal();}
bind('journalBtn',openJournal);bind('rewardsBtn',()=>game.world.campaign.pending.length?openReward(game.world.campaign.pending[0]):openJournal());
$('journalBody').onclick=e=>{const button=e.target.closest('[data-reward]');if(button){$('journalDialog').close();openReward(Number(button.dataset.reward));}};
$('rewardChoices').onclick=e=>{const button=e.target.closest('[data-choice]');if(button)safe(()=>{if(game.chooseReward(Number(button.dataset.region),button.dataset.choice)){$('rewardDialog').close();checkpoint('거점 보상 수령');toast('보상을 수령했습니다.');}else toast('보상을 받지 못했습니다. 예비군의 빈자리를 확인하세요.');});};
bind('resetBtn',()=>{if(confirm('진행 중인 상태를 초기화하고 새 캠페인을 시작할까요? 기존 저장 파일은 지우지 않습니다.')){game.newGame($('profileSelect').value);state.reportSeen=null;keys.clear();state.acc=0;renderer.resetCamera();}});
function modalOpen(){return !!document.querySelector('dialog[open]');}
function keyAction(code){if(code==='F5'){save();return;}if(code==='F9'){load();return;}if(game.mode!=='battle')return;if(code==='KeyT'){$('attackMoveBtn').click();return;}if(code==='KeyX'){$('focusTargetBtn').click();return;}if(code==='Escape'){cancelTargeting();return;}if(code==='KeyP'){togglePause();return;}if(code==='KeyQ')selectControl(()=>game.cycleUnit(-1));if(code==='KeyE')selectControl(()=>game.cycleUnit(1));if(code==='Tab')selectControl(()=>game.cycleGroup());const orders={Digit1:'attack',Digit2:'regroup',Digit3:'hold',Digit4:'retreat',KeyG:'siege',KeyR:'rest'};if(orders[code])command(orders[code]);if(code==='KeyC')$('criticalBtn').click();if(code==='KeyV')$('unitRetreatBtn').click();if(code==='KeyF')game.skill();if(code==='KeyH')game.healSpell();state.dirty=true;}
window.addEventListener('keydown',e=>{const target=e.target;const typing=target.isContentEditable||target.matches?.('textarea,select,input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit])');if(modalOpen()||typing||e.ctrlKey||e.metaKey)return;if(e.code==='Space'&&target.matches?.('input[type=checkbox],input[type=radio]'))return;if(['F5','F9'].includes(e.code)){e.preventDefault();if(!e.repeat)safe(()=>keyAction(e.code));return;}if(game.mode!=='battle')return;if(['Space','Tab','KeyW','KeyA','KeyS','KeyD'].includes(e.code))e.preventDefault();keys.add(e.code);if(['KeyW','KeyA','KeyS','KeyD','Space'].includes(e.code)&&!game.paused){cancelTargeting();game.direct=true;state.dirty=true;}if(!e.repeat)safe(()=>keyAction(e.code));});window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{keys.clear();if(game.mode==='battle'){game.paused=true;state.dirty=true;}});document.addEventListener('visibilitychange',()=>{keys.clear();if(document.hidden&&game.mode==='battle'){game.paused=true;state.dirty=true;}});
const stage=$('stage');let pointer=null;
function pos(e){const r=stage.getBoundingClientRect();return {x:(e.clientX-r.left)/r.width*960,y:(e.clientY-r.top)/r.height*600};}
stage.addEventListener('contextmenu',e=>e.preventDefault());stage.addEventListener('pointerdown',e=>{if(modalOpen())return;pointer={x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY,id:e.pointerId,button:e.button,shift:e.shiftKey,moved:false};stage.setPointerCapture(e.pointerId);});stage.addEventListener('pointermove',e=>{if(!pointer||e.pointerId!==pointer.id)return;const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;if(Math.hypot(e.clientX-pointer.sx,e.clientY-pointer.sy)>4)pointer.moved=true;if(pointer.moved&&game.mode==='battle'&&renderer.view3D&&pointer.button===0&&!state.moveTarget&&!state.attackMoveTarget&&!state.focusTarget&&!renderer.miniPoint(pos(e).x,pos(e).y)){renderer.camera.yaw+=dx*.007;renderer.camera.pitch=FQ.clamp(renderer.camera.pitch+dy*.005,.45,1.35);renderer.camera.follow=false;}pointer.x=e.clientX;pointer.y=e.clientY;});
stage.addEventListener('pointerup',e=>{
 if(!pointer||e.pointerId!==pointer.id)return;
 const p=pos(e),click=!pointer.moved,button=pointer.button,append=pointer.shift||e.shiftKey||$('queueMove').checked;pointer=null;
 safe(()=>{if(!click)return;if(game.mode==='world'){const r=FQ.REGIONS.find(r=>Math.hypot(r.x-p.x,r.y-p.y)<38);if(r){game.selectedRegion=r.id;state.dirty=true;}return;}
  const mini=renderer.miniPoint(p.x,p.y);
  const enemy=!mini?renderer.pick(game.battle,p.x,p.y,'red'):null;
  if(state.focusTarget){if(enemy){game.focusEnemy(enemy.id,$('allOrders').checked);state.focusTarget=false;}else toast('표적으로 지정할 적 병사를 선택하세요.');return;}
  if(state.attackMoveTarget){game.issue('attackmove',$('allOrders').checked,mini||renderer.ground(p.x,p.y),append);return;}
  if(button===2&&!state.moveTarget&&!append&&enemy){game.focusEnemy(enemy.id,$('allOrders').checked);return;}
  if(button===2||state.moveTarget){const target=mini||renderer.ground(p.x,p.y);game.issue('move',$('allOrders').checked,target,append);return;}
  if(mini){renderer.camera.focusX=mini.x;renderer.camera.focusY=mini.y;renderer.camera.follow=false;return;}
  const u=renderer.pick(game.battle,p.x,p.y);if(u)game.selectUnit(u.id);
 });
});stage.addEventListener('pointercancel',()=>pointer=null);
stage.addEventListener('dblclick',e=>{if(game.mode==='world')safe(campaignGo);});stage.addEventListener('wheel',e=>{if(game.mode!=='battle')return;e.preventDefault();renderer.camera.zoom=FQ.clamp(renderer.camera.zoom*Math.exp(e.deltaY*.001),.46,1.6);},{passive:false});
for(const btn of document.querySelectorAll('[data-key]')){btn.onpointerdown=e=>{e.preventDefault();btn.setPointerCapture(e.pointerId);keys.add(btn.dataset.key);if(game.mode==='battle'&&!game.paused){cancelTargeting();game.direct=true;}};for(const ev of ['pointerup','pointercancel','lostpointercapture'])btn.addEventListener(ev,()=>keys.delete(btn.dataset.key));}bind('touchSwitch',()=>selectControl(()=>game.cycleUnit(1)));bind('touchSkill',()=>game.skill());

let sourcePage=0,sourceSelected=FQ.DATA.records[0].id,inspectedId=null,armorySelected=null;
const roleOptions=selected=>Object.entries(FQ.CLASSES).map(([id,c])=>`<option value="${id}" ${id===selected?'selected':''}>${esc(c.name)} (자체 역할)</option>`).join('');
const rawNames={name:'이름코드',grow:'성장코드',leadership:'지휘값',element:'원소코드',fatigue:'FT',exp:'경험 원시',job:'클래스코드',team:'진영코드',arrowAvoid:'AA',arrowDef:'AD',magicDef:'MD',item:'장비코드',level:'레벨 원시',hpRate:'HR',hitPoint:'HP (LE)',attack:'AT',attackRate:'AR',defence:'DF',defenceRate:'DR',roleId:'역할ID'};
function openDialog(id){keys.clear();state.acc=0;$(id).showModal();}
function downloadJSON(data,name){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);}
function filteredSources(){const q=$('sourceSearch').value.trim().toLowerCase(),f=$('sourceFilter').value;return FQ.DATA.records.filter(r=>{if(f==='team16'&&r.raw.team!==16)return false;if(f!=='all'&&f!=='team16'&&FQ.DATA.role(r)!==f)return false;if(q.startsWith('role:'))return String(r.raw.roleId)===q.slice(5);return !q||[r.id,r.offset,'0x'+r.offset.slice(2).replace(/^0+/,''),r.label,String(r.raw.name),'role:'+r.raw.roleId].join(' ').toLowerCase().includes(q);});}
function renderSources(){const rows=filteredSources(),pages=Math.max(1,Math.ceil(rows.length/24));sourcePage=FQ.clamp(sourcePage,0,pages-1);if(rows.length&&!rows.some(r=>r.id===sourceSelected))sourceSelected=rows[0].id;$('sourceCount').textContent=`${rows.length}개 기록`;
 $('sourceRows').innerHTML=rows.slice(sourcePage*24,sourcePage*24+24).map(r=>`<tr class="${sourceSelected===r.id?'selected':''}" data-record="${r.id}"><td><button class="textButton">${r.offset}</button></td><td>${esc(r.label||'미확인')} <small>N${r.raw.name}</small></td><td>${r.raw.level}</td><td>${r.raw.hitPoint}</td><td>${r.raw.attack}/${r.raw.attackRate}/${r.raw.defence}/${r.raw.defenceRate}</td></tr>`).join('');$('sourcePage').textContent=`${sourcePage+1} / ${pages}`;$('sourcePrev').disabled=sourcePage===0;$('sourceNext').disabled=sourcePage===pages-1;if(rows.length)renderSourceDetail();else $('sourceDetail').innerHTML='<p class="muted">검색 결과가 없습니다.</p>';}
function renderSourceDetail(){const r=FQ.DATA.get(sourceSelected);if(!r)return;const type=FQ.DATA.role(r);$('sourceDetail').innerHTML=`<span class="eyebrow">OBSERVATION · NOT INITIAL-STATE CERTIFIED</span><h3>${esc(r.label||'미확인')} · N${r.raw.name}</h3><p class="sourceBadge">${r.offset} / roleId ${r.raw.roleId} / job 0x${r.raw.job.toString(16).padStart(2,'0')}</p><div class="rawGrid">${Object.entries(r.raw).map(([k,v])=>`<div><small>${rawNames[k]||k}</small><strong>${v}</strong></div>`).join('')}</div><p class="muted">HP를 최대체력으로 사용하는 것은 실행 가정입니다. 원시 레벨·성장·경험·장비코드·원소·지휘값은 보존하되 해당 원작 규칙은 적용하지 않습니다.</p><label>플레이 역할 선택<select id="sourceRole">${roleOptions(type)}</select></label><button id="enlistBtn" class="primary full" ${game.mode!=='world'||game.world.profile?.id!=='hybrid-repoN-v19'?'disabled':''}>이 기록으로 예비병 모집 · ${game.recordCost(r.id)}G</button><p class="muted">역할·배치·비용과 반복 모집은 자체 설계입니다. 같은 기록도 서로 다른 런타임 병사 ID로 보존합니다.</p><details><summary>원시 32바이트 / 지문</summary><code>${r.hex.match(/.{2}/g).join(' ')}</code><code>SHA256 ${r.hash}</code></details><button id="sourceExport" class="full">관측 기록 JSON</button><a class="sourceLink" href="${esc(FQ.DATA.manifest.sourceURL)}" target="_blank" rel="noopener noreferrer">고정 커밋의 원본 자료 ↗</a>`;
 $('enlistBtn').onclick=()=>safe(()=>{if(game.enlistRecord(r.id,$('sourceRole').value)){toast('예비군에 합류했습니다. 부대 편성에서 주력군으로 이동하세요.');renderSources();}else toast('복원 프로필·금화·예비군 정원을 확인하세요.');});$('sourceExport').onclick=()=>downloadJSON({manifest:FQ.DATA.manifest,observation:r,playRole:FQ.DATA.role(r),roleStatus:'CUSTOM'},'fq4-observation-'+r.offset+'.json');}
bind('sourceBtn',()=>{renderSources();openDialog('sourceDialog');});$('sourceSearch').oninput=()=>{sourcePage=0;renderSources();};$('sourceFilter').onchange=()=>{sourcePage=0;renderSources();};$('sourcePrev').onclick=()=>{sourcePage--;renderSources();};$('sourceNext').onclick=()=>{sourcePage++;renderSources();};$('sourceRows').onclick=e=>{const row=e.target.closest('[data-record]');if(row){sourceSelected=row.dataset.record;renderSources();}};
function inspectUnit(id=null){let u;if(game.mode==='battle')u=id!==null?game.battle.units.find(x=>x.id===id):game.selected;else u=[...game.activeArmy.roster,...game.world.reserve].find(x=>x.id===(id??inspectedId))||game.activeArmy.roster[0];if(!u){toast('선택 가능한 병사가 없습니다.');return;}inspectedId=u.id;const r=FQ.source(u),st=FQ.stats(u),item=FQ.DATA.item(u.equipmentId);$('inspectTitle').textContent=FQ.unitLabel(u);const map={HP:'hitPoint',AT:'attack',AR:'attackRate',DF:'defence',DR:'defenceRate',AA:'arrowAvoid',AD:'arrowDef',MD:'magicDef',HR:'hpRate'};
 $('inspectBody').innerHTML=`<p class="sourceBadge">런타임 #${u.id} · ${FQ.CLASSES[u.type].name} 역할 · ${r?'관측 원시 Lv.'+r.raw.level+' / 추가 훈련 '+(u.level-1):'커스텀 Lv.'+u.level}</p><p>현재 HP ${Math.ceil(u.hp)} / ${FQ.maxHP(u)} · FT ${Math.floor(u.fatigue)} · ${esc(item?.name||'추가 장비 없음')}</p><table class="catalogTable"><thead><tr><th>항목</th><th>원시 관측</th><th>런타임 적용</th></tr></thead><tbody>${Object.entries(map).map(([key,raw])=>`<tr><td>${key}</td><td>${r?r.raw[raw]:'—'}</td><td>${Math.round(st[key]*100)/100}</td></tr>`).join('')}</tbody></table><p class="notice">${r?'관측 HP를 최대체력으로 사용합니다. AR/DR·AA의 명중식, DF·AD·MD의 피해식, HR의 안전구역 회복은 자체 근사식입니다. 원작 성장코드와 레벨은 새 훈련 단계로 변환하지 않습니다.':'기존 커스텀 능력치입니다. 원작 데이터와 연결되지 않았습니다.'}</p>${r?`<p class="muted">${r.id} · 이름코드 ${r.raw.name} · 역할ID ${r.raw.roleId}<br>원시 장비코드 ${r.raw.item} (해석 미적용) · 지휘 ${r.raw.leadership} · 성장 ${r.raw.grow}</p><code>${r.hash}</code><button id="inspectToSource" class="full">원시 관측 기록 열기</button>`:''}`;
 if(r)$('inspectToSource').onclick=()=>{$('inspectDialog').close();sourceSelected=r.id;$('sourceSearch').value='';$('sourceFilter').value='all';sourcePage=Math.floor(FQ.DATA.records.findIndex(x=>x.id===r.id)/24);renderSources();openDialog('sourceDialog');};openDialog('inspectDialog');}
bind('inspectBtn',()=>inspectUnit());bind('rosterInspect',()=>{const id=Number($('mainRoster').value);inspectUnit(id);});
function armoryUnits(){return [...game.activeArmy.roster,...game.world.reserve];}
function renderArmory(){const list=armoryUnits();if(!list.some(u=>u.id===armorySelected))armorySelected=list[0]?.id;const u=list.find(u=>u.id===armorySelected);$('armoryGold').textContent=game.world.gold+' G';$('armoryUnit').innerHTML=list.map(u=>`<option value="${u.id}" ${u.id===armorySelected?'selected':''}>#${u.id} ${esc(FQ.unitLabel(u))}</option>`).join('');$('unequipBtn').disabled=!u?.equipmentId;
 $('armoryStats').textContent=u?`AT ${FQ.stats(u).AT} / AR ${FQ.stats(u).AR} / DF ${FQ.stats(u).DF} / DR ${FQ.stats(u).DR} · ${FQ.DATA.item(u.equipmentId)?.name||'추가 장비 없음'}`:'선택 병사가 없습니다.';
 $('equipmentList').innerHTML=FQ.DATA.items.map(it=>{const n=game.world.equipmentStock?.[it.id]||0,preview=u?game.equipmentPreview(u.id,it.id):null;return `<article class="equipmentCard"><span class="eyebrow">REPORTED MODIFIERS</span><h3>${esc(it.name)}</h3><p>${Object.entries(it.mods).map(([k,v])=>k+' '+(v>0?'+':'')+v).join(' · ')}</p><small>${esc(it.edition)} / ${esc(it.sourceIds.join(', '))}</small>${preview?`<div class="equipPreview"><small>장착 예상 · 현재 장비 교체</small>${['AT','AR','DF','DR'].map(k=>`<span>${k} <b>${preview.projected[k]}</b> <em class="${preview.delta[k]>0?'up':preview.delta[k]<0?'down':''}">${preview.delta[k]>0?'+':''}${preview.delta[k]}</em></span>`).join('')}</div>`:''}<div class="equipmentActions"><button data-buy="${it.id}" ${game.world.gold<it.price?'disabled':''}>구매 ${it.price}G</button><button data-equip="${it.id}" ${!n||!u||u.equipmentId===it.id?'disabled':''}>장착 (${n})</button></div><small>가격·슬롯 자체 설계${it.specialExcluded?' · 특수효과 제외':''}</small></article>`;}).join('');}
bind('armoryBtn',()=>worldOnly(()=>{renderArmory();openDialog('armoryDialog');}));$('armoryUnit').onchange=()=>{armorySelected=Number($('armoryUnit').value);renderArmory();};$('equipmentList').onclick=e=>safe(()=>{const buy=e.target.closest('[data-buy]'),equip=e.target.closest('[data-equip]');if(buy)game.buyEquipment(buy.dataset.buy);if(equip)game.equip(armorySelected,equip.dataset.equip);renderArmory();});bind('unequipBtn',()=>{game.equip(armorySelected,null);renderArmory();});
function renderCombatLog(){const b=game.battle;if(!b)return;const s=b.stats;$('combatSummary').textContent=`시도 ${s.attempts||0} · 명중 ${s.hits||0} · 회피 ${s.misses||0} / 저장 가능한 최근 120건`;$('combatRows').innerHTML=(b.combatLog||[]).slice().reverse().map(e=>`<div><span>${(e.tick/60).toFixed(2)}s</span><b>${e.type==='hit'?'명중':e.type==='miss'?'회피':'회복'}</b><span>#${e.actorId??'자동'} → #${e.targetId} ${e.amount!==undefined?' · '+Math.round(e.amount*10)/10:''} ${e.chance!==undefined?' · P '+Math.round(e.chance*100)+'%':''}</span></div>`).join('')||'<p>아직 판정이 없습니다.</p>';}
bind('combatLogBtn',()=>{if(game.mode==='battle'){renderCombatLog();openDialog('combatDialog');}});bind('exportCombat',()=>{if(game.battle)downloadJSON({ruleset:game.world.profile,dataset:FQ.DATA.manifest.datasetRevision,stats:game.battle.stats,events:game.battle.combatLog},'fq4-combat-trace-v22.json');});

function statusName(s){return {active:'생존',dead:'전사',retreated:'철수'}[s]||s;}
function performancePayload(){
 const b=game.battle,r=game.report;
 return {format:'fq4-performance-v22',ruleset:game.world.profile,scope:'CUSTOM_SIMULATION',mode:b?'live':'result',tick:b?.tick??Math.round((r?.time||0)*60),metricsSinceTick:b?.metricsSinceTick??r?.metricsSinceTick??0,region:b?FQ.REGIONS[b.regionId].name:r?.region,rows:b?game.performanceRows():r?.units||[]};
}
function renderPerformance(){
 const payload=performancePayload(),rows=payload.rows.slice(),sort=$('performanceSort').value;
 rows.sort((a,b)=>sort==='id'?a.id-b.id:(b[sort]||0)-(a[sort]||0)||a.id-b.id);
 const totals=rows.reduce((n,u)=>{for(const k of ['damage','healing','gateDamage','received','kills'])n[k]+=u[k];return n;},{damage:0,healing:0,gateDamage:0,received:0,kills:0});
 $('performanceSummary').textContent=`아군 ${rows.length}명 · 피해 ${Math.round(totals.damage)} · 유효 치유 ${Math.round(totals.healing)} · 성문 ${Math.round(totals.gateDamage)} · 처치 ${totals.kills}`;
 $('performanceScope').textContent=payload.metricsSinceTick?`이전 저장에는 기여도 기록이 없어 ${(payload.metricsSinceTick/60).toFixed(1)}초 복원 시점부터 집계합니다.`:'전투 시작부터 누적합니다. 최근 120개 판정 로그 제한과 무관합니다. 자동 자연 회복은 치료사에게 가산하지 않습니다.';
 $('performanceRows').innerHTML=rows.map(u=>`<tr><td><b>#${u.id}</b> ${esc(u.label)}<small>${esc(u.group)} · ${FQ.CLASSES[u.type].name}</small></td><td>${statusName(u.status)}</td><td>${Math.round(u.damage)}</td><td>${Math.round(u.healing)}</td><td>${Math.round(u.gateDamage)}</td><td>${Math.round(u.received)}</td><td>${u.kills}</td><td>${u.hits}/${u.hits+u.misses}</td></tr>`).join('')||'<tr><td colspan="8">집계할 전투 기록이 없습니다.</td></tr>';
}
function openPerformance(){renderPerformance();openDialog('performanceDialog');}
bind('performanceBtn',openPerformance);bind('resultPerformanceBtn',openPerformance);
$('performanceSort').onchange=renderPerformance;
bind('exportPerformance',()=>downloadJSON(performancePayload(),'fq4-performance-v22.json'));

function loop(now){const delta=Math.min(.1,(now-state.last)/1000);state.last=now;try{
  if(game.mode!==state.lastMode){state.moveTarget=false;state.attackMoveTarget=false;state.focusTarget=false;$('queueMove').checked=false;$('targetModeHint').hidden=true;state.acc=0;keys.clear();state.lastMode=game.mode;state.dirty=true;}
  if(game.mode==='battle'&&!game.paused&&!modalOpen()){
   state.acc+=delta*game.options.speed;const h=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0),v=(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0),len=Math.hypot(h,v);const input={move:len?renderer.movement(h/len,v/len):null,attack:keys.has('Space')};let count=0;while(state.acc>=FQ.STEP&&count++<24&&game.mode==='battle'){game.tick(input);state.acc-=FQ.STEP;}
  }else state.acc=0;
  if(game.mode==='world'&&game.options.enemyAuto&&!modalOpen()){game.autoClock+=delta;if(game.autoClock>=18){game.autoClock=0;game.advanceTurn();}}
  renderer.render(game);state.uiTime+=delta;if(state.dirty||state.uiTime>.4){state.dirty=false;state.uiTime=0;updateUI();}state.frameCount++;state.fpsTime+=delta;if(state.fpsTime>=1){state.fps=Math.round(state.frameCount/state.fpsTime);state.frameCount=0;state.fpsTime=0;$('performance').textContent=game.mode==='battle'?`${renderer.view3D?(renderer.gl?'WEBGL':'CPU 3D'):'2D'} / ${state.fps} FPS`:'OFFLINE / NO DEPENDENCIES';}
 }catch(e){game.paused=true;keys.clear();console.error(e);toast('실행 오류: '+e.message);}requestAnimationFrame(loop);}
// Stable, explicit test hook. No gameplay state exists outside Game / Renderer.
window.FQ22=window.FQ21=window.FQ20=window.FQ19=window.FQ15={game,renderer,save,load,bundle,applySave,checkpoint,refresh:()=>{state.dirty=true;updateUI();renderer.render(game);},advance:n=>{for(let i=0;i<n&&game.mode==='battle';i++)game.tick();state.dirty=true;},keyAction};
updateUI();renderer.render(game);requestAnimationFrame(loop);
})();
