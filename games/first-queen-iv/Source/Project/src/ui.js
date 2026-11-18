(function(){'use strict';
const $=id=>document.getElementById(id),game=new FQ.Game(),renderer=new FQRenderer($('scene'),$('webgl'),$('hud')),keys=new Set();
const state={last:performance.now(),acc:0,uiTime:0,dirty:true,lastMode:'world',fps:0,frameCount:0,fpsTime:0,reportSeen:null,toastTimer:0};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(text){$('toast').textContent=text;$('toast').classList.add('visible');clearTimeout(state.toastTimer);state.toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3200);}
function safe(fn){try{const result=fn();state.dirty=true;return result;}catch(e){toast(e.message);game.note('오류: '+e.message);return false;}}
function bind(id,fn){$(id).onclick=()=>safe(fn);}
function worldOnly(fn){if(game.mode!=='world'){toast('전투 종료 후 사용할 수 있습니다.');return false;}return fn();}
function togglePause(){if(game.mode==='battle'){game.paused=!game.paused;keys.clear();state.acc=0;state.dirty=true;}}
game.onChange=()=>state.dirty=true;
function updateUI(){
 const w=game.world,b=game.battle,battle=game.mode==='battle',a=game.activeArmy;
 $('phase').textContent=battle?'TACTICAL BATTLE':'STRATEGIC CAMPAIGN';$('renderStatus').textContent=battle?(renderer.view3D?(renderer.gl?'WebGL 3D':'호환 3D · CPU'):'전술 2D'):'v14 · 독립 군단 지휘';
 for(const id of ['worldTools','worldPanel'])$(id).hidden=battle;for(const id of ['battleTools','battlePanel'])$(id).hidden=!battle;
 for(const id of ['saveBtn','loadBtn','exportBtn','importBtn'])$(id).disabled=battle;
 $('gold').textContent=w.gold+' G';$('enemyAuto').checked=game.options.enemyAuto;
 $('contextHint').textContent=battle?'클릭: 병사 선택 · 우클릭: 부대 이동 · 드래그: 회전 · WASD: 직접 조작':'거점을 선택한 뒤 이동 / 출전 · 공성 연습은 캠페인에 영향을 주지 않습니다.';
 $('viewBtn').textContent=renderer.view3D?'3D':'2D';$('followBtn').textContent='추적 '+(renderer.camera.follow?'ON':'OFF');
 if(!battle){
  $('armyCards').innerHTML=w.armies.map(ar=>`<button class="card ${ar.id===a.id?'selected':''}" data-army="${ar.id}"><strong>${esc(ar.name)}</strong><span>${esc(FQ.REGIONS[ar.region].name)} · ${ar.roster.length}명</span></button>`).join('');
  const r=w.regions[game.selectedRegion]||w.regions[a.region],adj=a.region===r.id||FQ.REGIONS[a.region].links.includes(r.id),enemy=w.enemyArmies.filter(e=>e.region===r.id).reduce((s,e)=>s+e.roster.length,0),hostile=r.owner==='red'||enemy>0;
  $('regionName').textContent=FQ.REGIONS[r.id].name;$('regionInfo').textContent=`${r.owner==='blue'?'아군':r.owner==='red'?'적군':'중립'} 거점 · 수비대 ${r.garrison.length} · 적 군단 ${enemy}명`;
  $('goBtn').textContent=!adj?'인접한 거점을 선택하세요':hostile?(r.owner==='blue'?'거점 방어':'출전'):'이동 / 확보';$('goBtn').disabled=!adj||!a.roster.length||(!hostile&&a.region===r.id);
  $('supportList').innerHTML=game.eligibleSupport(r.id).map(s=>`<label class="check"><input type="checkbox" data-support="${s.id}" ${game.supportIds.includes(s.id)?'checked':''}>${esc(s.name)} 지원 (${s.roster.length})</label>`).join('');
  $('enemyInfo').innerHTML=w.enemyArmies.map(e=>`<div>${esc(e.name)} · ${esc(FQ.REGIONS[e.region].name)} · ${e.roster.length}명</div>`).join('')||'남은 적 군단이 없습니다.';
 }else{
  $('autoBtn').textContent=game.direct?'직접 조작 → 자동':'자동 전투 → 직접';$('pauseBtn').textContent=game.paused?'계속 P':'일시정지 P';
  $('groupCards').innerHTML=b.groups.filter(g=>g.team==='blue').map(g=>{const active=b.units.filter(u=>u.groupId===g.id&&u.alive&&!u.evacuated).length;return `<button class="card ${g.id===game.selectedGroupId?'selected':''}" data-group="${g.id}"><strong>${esc(g.name)}</strong><span>${g.spawned?active+'명 · '+FQ.ORDERS[g.order]:'도착 '+Math.max(0,Math.ceil((g.arrival-b.tick)/60))+'초 전'}</span></button>`;}).join('');
  $('formation').value=game.selectedGroup?.formation||'line';const u=game.selected;
  $('unitInfo').innerHTML=u&&u.alive?`<h3>${esc(FQ.CLASSES[u.type].name)} #${u.id} <small>Lv.${u.level}</small></h3><div class="muted">HP ${Math.ceil(u.hp)} / ${u.maxHp} · 피로 ${Math.floor(u.fatigue)}%</div><div class="bar"><i style="width:${100*u.hp/u.maxHp}%"></i></div><div class="muted">${esc(FQ.CLASSES[u.type].skill)} · ${u.skillCooldown?Math.ceil(u.skillCooldown/60)+'초':'준비'}<br>경험치 ${u.exp} / ${u.level*60}</div>`:'<p class="muted">아군 병사를 선택하세요.</p>';
  $('healBtn').textContent=b.healCooldown?`회복 ${Math.ceil(b.healCooldown/60)}초`:'전술 회복 H';$('skillBtn').textContent=u?FQ.CLASSES[u.type].skill+' F':'고유 스킬 F';
  $('reinforceBtn').disabled=b.groups.some(g=>g.sourceKind==='reserve')||!w.reserve.length||game.paused;
  document.querySelectorAll('[data-order]').forEach(btn=>btn.classList.toggle('active',btn.dataset.order===game.selectedGroup?.order));
 }
 $('log').innerHTML=game.log.slice(0,25).map(x=>`<div>${esc(x.message)}</div>`).join('');
 if(game.report&&game.report!==state.reportSeen){state.reportSeen=game.report;showReport(game.report);}
}
function showReport(r){$('resultTitle').textContent=(r.training?'공성 연습 · ':'')+(r.outcome==='victory'?'승리':'철수 / 패배');const lost=r.groups.reduce((s,g)=>s+g.lost,0),survived=r.groups.reduce((s,g)=>s+g.survived,0);
 $('resultBody').innerHTML=`<p class="muted">${esc(r.region)} · ${Math.floor(r.time/60)}분 ${Math.floor(r.time%60)}초${r.training?' · 캠페인 변경 없음':''}</p><div class="resultMetrics"><div><strong>${survived}</strong><span>생존 병력</span></div><div><strong>${lost}</strong><span>전사 병력</span></div><div><strong>${Math.round(r.damage)}</strong><span>총 피해</span></div></div>${r.groups.map(g=>`<div class="resultRow"><b>${esc(g.name)}</b><span>${g.joined?`생존 ${g.survived} · 전사 ${g.lost} · 철수 ${g.retreated}`:'미도착 · 원래 병력 유지'}</span></div>`).join('')}<p class="muted">${r.training?'연습이므로 사망과 성장은 기록하지 않았습니다.':'생존 병력의 체력·피로·경험치를 소속 군단에 반영했습니다.'}</p>`;
 $('reportDialog').showModal();
}
function renderRoster(){const unitText=u=>`#${u.id} ${FQ.CLASSES[u.type].name} Lv.${u.level} · HP ${Math.ceil(u.hp)}/${FQ.maxHP(u)}`;
 $('mainRosterTitle').textContent=`${game.activeArmy.name} ${game.activeArmy.roster.length}/40`;$('reserveRosterTitle').textContent=`예비군 ${game.world.reserve.length}/120`;
 for(const [id,roster] of [['mainRoster',game.activeArmy.roster],['reserveRoster',game.world.reserve]]){$(id).replaceChildren(...roster.map(u=>{const o=document.createElement('option');o.value=u.id;o.textContent=unitText(u);return o;}));if(roster.length)$(id).selectedIndex=0;}}
bind('trainingBtn',()=>{game.startBattle(2,true);renderer.resetCamera();});bind('goBtn',()=>{game.go(game.selectedRegion);renderer.resetCamera();});bind('splitBtn',()=>game.split());bind('mergeBtn',()=>game.merge());bind('restBtn',()=>game.rest());bind('recruitBtn',()=>game.recruit());bind('turnBtn',()=>game.advanceTurn());
bind('rosterBtn',()=>worldOnly(()=>{renderRoster();$('rosterDialog').showModal();}));bind('toReserve',()=>{game.transfer(Number($('mainRoster').value),false);renderRoster();});bind('toArmy',()=>{game.transfer(Number($('reserveRoster').value),true);renderRoster();});
$('armyCards').onclick=e=>{const btn=e.target.closest('[data-army]');if(btn)safe(()=>game.switchArmy(Number(btn.dataset.army)));};$('groupCards').onclick=e=>{const btn=e.target.closest('[data-group]');if(btn)safe(()=>game.selectGroup(btn.dataset.group));};
$('supportList').onchange=e=>{if(e.target.dataset.support)safe(()=>game.toggleSupport(Number(e.target.dataset.support)));};
document.querySelectorAll('[data-order]').forEach(btn=>btn.onclick=()=>safe(()=>game.issue(btn.dataset.order,$('allOrders').checked)));
$('formation').onchange=e=>safe(()=>game.formation(e.target.value));bind('autoBtn',()=>{if(game.mode==='battle'){game.direct=!game.direct;keys.clear();}});bind('pauseBtn',togglePause);bind('reinforceBtn',()=>game.reinforce());bind('skillBtn',()=>game.skill());bind('healBtn',()=>game.healSpell());bind('withdrawBtn',()=>game.issue('retreat',true));bind('viewBtn',()=>{renderer.view3D=!renderer.view3D;});bind('cameraBtn',()=>renderer.resetCamera());bind('followBtn',()=>{renderer.camera.follow=!renderer.camera.follow;});bind('enemyInfoBtn',()=>$('enemyInfo').hidden=!$('enemyInfo').hidden);
$('speed').onchange=e=>game.options.speed=Number(e.target.value);$('enemyAuto').onchange=e=>{game.options.enemyAuto=e.target.checked;game.autoClock=0;};$('health').onchange=e=>renderer.health=e.target.checked;$('effects').onchange=e=>renderer.effects=e.target.checked;$('paths').onchange=e=>renderer.paths=e.target.checked;$('dev').onchange=e=>$('devTools').hidden=!e.target.checked;
bind('gateBtn',()=>{if(game.mode==='battle'&&!game.paused)game.gateToggle();});bind('winBtn',()=>game.debugWin());bind('loseBtn',()=>game.debugLose());bind('healAll',()=>{if(game.battle)for(const u of game.battle.units)if(u.team==='blue'&&u.alive){u.hp=u.maxHp;u.fatigue=0;}});
bind('auditBtn',()=>{const report=game.validate();toast(`무결성 검사 통과 · 군단 ${report.armies}개 / 전체 생존 병사 ${report.units}명`);});
bind('helpBtn',()=>$('helpDialog').showModal());for(const btn of document.querySelectorAll('[data-close]'))btn.onclick=()=>$(btn.dataset.close).close();
function save(){return worldOnly(()=>{const json=JSON.stringify(game.export());try{localStorage.setItem('fq4_proto_v14',json);game.note('로컬 캠페인 저장 완료');toast('저장했습니다.');}catch{toast('브라우저 저장이 제한되어 있습니다. JSON 내보내기를 사용하세요.');}});}
function load(){return worldOnly(()=>{let json;try{json=localStorage.getItem('fq4_proto_v14')||localStorage.getItem('fq4_proto_v1');}catch{throw Error('브라우저 저장 접근이 제한되어 있습니다. JSON을 가져오세요.');}if(!json)throw Error('저장된 캠페인이 없습니다.');game.import(JSON.parse(json));keys.clear();renderer.resetCamera();});}
bind('saveBtn',save);bind('loadBtn',load);
bind('exportBtn',()=>{const data=JSON.stringify(game.export(),null,2),url=URL.createObjectURL(new Blob([data],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='firstqueen4-campaign-v14.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),3000);toast('캠페인 JSON을 내보냈습니다.');});
bind('importBtn',()=>worldOnly(()=>$('importFile').click()));$('importFile').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{if(f.size>2e6)throw Error('파일 크기는 최대 2MB입니다.');const data=JSON.parse(await f.text());game.import(data);keys.clear();renderer.resetCamera();state.dirty=true;toast('캠페인을 복원했습니다.');}catch(err){toast('가져오기 실패: '+err.message);}finally{e.target.value='';}};
bind('resetBtn',()=>{if(confirm('진행 중인 상태를 초기화하고 새 캠페인을 시작할까요? 기존 저장 파일은 지우지 않습니다.')){game.newGame();state.reportSeen=null;keys.clear();state.acc=0;renderer.resetCamera();}});
function modalOpen(){return !!document.querySelector('dialog[open]');}
function keyAction(code){if(game.mode!=='battle')return;const all=$('allOrders').checked;if(code==='KeyP'){togglePause();return;}if(code==='KeyQ')game.cycleUnit(-1);if(code==='KeyE')game.cycleUnit(1);if(code==='Tab')game.cycleGroup();const orders={Digit1:'attack',Digit2:'regroup',Digit3:'hold',Digit4:'retreat',KeyG:'siege',KeyR:'regroup'};if(orders[code])game.issue(orders[code],all);if(code==='KeyF')game.skill();if(code==='KeyH')game.healSpell();state.dirty=true;}
window.addEventListener('keydown',e=>{if(modalOpen()||['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)||e.ctrlKey||e.metaKey)return;if(game.mode!=='battle')return;if(['Space','Tab','KeyW','KeyA','KeyS','KeyD'].includes(e.code))e.preventDefault();keys.add(e.code);if(['KeyW','KeyA','KeyS','KeyD','Space'].includes(e.code)&&!game.paused){game.direct=true;state.dirty=true;}if(!e.repeat)safe(()=>keyAction(e.code));});window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{keys.clear();if(game.mode==='battle'){game.paused=true;state.dirty=true;}});document.addEventListener('visibilitychange',()=>{keys.clear();if(document.hidden&&game.mode==='battle'){game.paused=true;state.dirty=true;}});
const stage=$('stage');let pointer=null;
function pos(e){const r=stage.getBoundingClientRect();return {x:(e.clientX-r.left)/r.width*960,y:(e.clientY-r.top)/r.height*600};}
stage.addEventListener('contextmenu',e=>e.preventDefault());stage.addEventListener('pointerdown',e=>{if(modalOpen())return;pointer={x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY,id:e.pointerId,button:e.button,moved:false};stage.setPointerCapture(e.pointerId);});stage.addEventListener('pointermove',e=>{if(!pointer)return;const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;if(Math.hypot(e.clientX-pointer.sx,e.clientY-pointer.sy)>4)pointer.moved=true;if(pointer.moved&&game.mode==='battle'&&renderer.view3D&&pointer.button===0){renderer.camera.yaw+=dx*.007;renderer.camera.pitch=FQ.clamp(renderer.camera.pitch+dy*.005,.45,1.35);renderer.camera.follow=false;}pointer.x=e.clientX;pointer.y=e.clientY;});
stage.addEventListener('pointerup',e=>{if(!pointer)return;const p=pos(e),click=!pointer.moved,button=pointer.button;pointer=null;safe(()=>{if(!click)return;if(game.mode==='world'){const r=FQ.REGIONS.find(r=>Math.hypot(r.x-p.x,r.y-p.y)<38);if(r){game.selectedRegion=r.id;state.dirty=true;}}else if(button===2){game.issue('move',$('allOrders').checked,renderer.ground(p.x,p.y));}else {const u=renderer.pick(game.battle,p.x,p.y);if(u)game.selectUnit(u.id);}});});stage.addEventListener('pointercancel',()=>pointer=null);
stage.addEventListener('dblclick',e=>{if(game.mode==='world')safe(()=>{game.go(game.selectedRegion);renderer.resetCamera();});});stage.addEventListener('wheel',e=>{if(game.mode!=='battle')return;e.preventDefault();renderer.camera.zoom=FQ.clamp(renderer.camera.zoom*Math.exp(e.deltaY*.001),.46,1.6);},{passive:false});
for(const btn of document.querySelectorAll('[data-key]')){btn.onpointerdown=e=>{e.preventDefault();btn.setPointerCapture(e.pointerId);keys.add(btn.dataset.key);if(game.mode==='battle'&&!game.paused)game.direct=true;};for(const ev of ['pointerup','pointercancel','lostpointercapture'])btn.addEventListener(ev,()=>keys.delete(btn.dataset.key));}bind('touchSwitch',()=>game.cycleUnit(1));bind('touchSkill',()=>game.skill());
function loop(now){const delta=Math.min(.1,(now-state.last)/1000);state.last=now;try{
  if(game.mode!==state.lastMode){state.acc=0;keys.clear();state.lastMode=game.mode;state.dirty=true;}
  if(game.mode==='battle'&&!game.paused&&!modalOpen()){
   state.acc+=delta*game.options.speed;const h=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0),v=(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0),len=Math.hypot(h,v);const input={move:len?renderer.movement(h/len,v/len):null,attack:keys.has('Space')};let count=0;while(state.acc>=FQ.STEP&&count++<24&&game.mode==='battle'){game.tick(input);state.acc-=FQ.STEP;}
  }else state.acc=0;
  if(game.mode==='world'&&game.options.enemyAuto&&!modalOpen()){game.autoClock+=delta;if(game.autoClock>=18){game.autoClock=0;game.advanceTurn();}}
  renderer.render(game);state.uiTime+=delta;if(state.dirty||state.uiTime>.4){state.dirty=false;state.uiTime=0;updateUI();}state.frameCount++;state.fpsTime+=delta;if(state.fpsTime>=1){state.fps=Math.round(state.frameCount/state.fpsTime);state.frameCount=0;state.fpsTime=0;$('performance').textContent=game.mode==='battle'?`${renderer.view3D?(renderer.gl?'WEBGL':'CPU 3D'):'2D'} / ${state.fps} FPS`:'OFFLINE / NO DEPENDENCIES';}
 }catch(e){game.paused=true;keys.clear();console.error(e);toast('실행 오류: '+e.message);}requestAnimationFrame(loop);}
// Stable, explicit test hook. No gameplay state exists outside Game / Renderer.
window.FQ14={game,renderer,save,load,refresh:()=>{state.dirty=true;updateUI();renderer.render(game);},advance:n=>{for(let i=0;i<n&&game.mode==='battle';i++)game.tick();state.dirty=true;},keyAction};
updateUI();renderer.render(game);requestAnimationFrame(loop);
})();
