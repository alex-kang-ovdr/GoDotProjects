import * as Core from './engine.js';
import * as Field from './expedition.js';
import { createRenderer } from './scene.js';
import * as Saves from './saves.js';
import { createBotRuntime } from './bot-runtime.js';
import { createBotUiController } from './bot-ui.js';

const $ = id => document.getElementById(id);
const PREF_KEY = 'last-light-preferences-v1';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const PATHS = {
  wood:'<path d="m5 7 13-3 3 5-13 3ZM5 7l3 5v8l-5-3V9Zm3 5 13-3v8L8 20"/><path d="m12 8 4-1M13 16l5-1"/>',
  parts:'<path d="m9 3 1-1h4l1 4 3 1 3-1 2 4-3 3v2l1 3-3 3-3-1-3 1-1 2H7l-1-4-3-1-2-4 2-3V8l3-2Z" transform="translate(1 0) scale(.9)"/><circle cx="12" cy="12" r="3"/>',
  water:'<path d="M12 3c-2 4-7 8-7 12a7 7 0 0 0 14 0c0-4-5-8-7-12Z"/><path d="M8 15a4 4 0 0 0 4 4"/>',
  raw:'<path d="M5 17c-5-6 1-14 9-13l6-1-1 7c0 9-9 14-14 7Z"/><path d="M3 21 16 8M7 17l1-7m3 3 6-1"/>',
  meal:'<path d="M3 11h18c0 6-4 9-9 9s-9-3-9-9ZM5 22h14M7 7c-2-2 2-3 0-5m5 5c-2-2 2-3 0-5m5 5c-2-2 2-3 0-5"/>',
  fuel:'<path d="M13 2c2 7 7 8 7 14a8 8 0 0 1-16 0c0-4 2-6 5-9 0 4 1 5 2 5 2-2 2-5 2-10Z"/><path d="M12 14c-1 2-3 3-3 5a3 3 0 0 0 6 0c0-2-2-3-3-5Z"/>',
  meds:'<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6Z"/>',
  bandage:'<path d="m4 11 7-7a4 4 0 0 1 6 0l3 3a4 4 0 0 1 0 6l-7 7a4 4 0 0 1-6 0l-3-3a4 4 0 0 1 0-6Z"/><path d="m8 8 8 8m-8-4 4-4m0 8 4-4"/>',
  cloth:'<path d="m8 3-6 4 3 6 3-2v10h8V11l3 2 3-6-6-4a4 4 0 0 1-8 0Z"/>',
  crowbar:'<path d="m5 22 9-14c-1-3 1-6 5-6l-1 4 3 2-4 3L8 23"/>',
  knife:'<path d="m3 21 6-6 3 3-6 6Zm6-6L21 2c3 8-2 12-9 16"/>',
  bed:'<path d="M3 8v13M21 7v14M3 17h18M3 11h18v6H3ZM6 8h5v3H6Z"/>',
  shield:'<path d="M12 2 3 6v6c0 6 9 10 9 10s9-4 9-10V6Z"/><path d="m8 12 3 3 5-6"/>',
  build:'<path d="m3 21 9-9m1-8 7 7-3 3-7-7Zm-4 0 5-2 8 8-2 5"/>',
  heart:'<path d="M20 5c-3-3-6-1-8 1-2-2-5-4-8-1-6 6 8 16 8 16S26 11 20 5Z"/>',
  talk:'<path d="M21 11a9 9 0 0 1-9 8H7l-5 3 2-7a9 9 0 1 1 17-4Z"/><path d="M7 10h10M7 14h6"/>',
  search:'<circle cx="10" cy="10" r="7"/><path d="m15 15 7 7"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 3"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>',
  snow:'<path d="M12 2v20M3 7l18 10M3 17 21 7M9 3l3 3 3-3M9 21l3-3 3 3M3 10l4-1-1-4M18 19l-1-4 4-1M3 14l4 1-1 4M18 5l-1 4 4 1"/>',
  moon:'<path d="M20 15A9 9 0 0 1 9 3a9 9 0 1 0 11 12Z"/>',
  play:'<path d="m8 4 12 8-12 8Z" fill="currentColor" stroke="none"/>',
  pause:'<path d="M7 4h3v16H7ZM14 4h3v16h-3Z" fill="currentColor" stroke="none"/>',
  sound:'<path d="m3 9 5 0 5-5v16l-5-5H3ZM17 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  mute:'<path d="m3 9 5 0 5-5v16l-5-5H3Zm14 0 6 6m0-6-6 6"/>',
  help:'<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 5 2c-2 1-2 1-2 4M12 18v.2"/>',
  settings:'<path d="M3 6h18M3 12h18M3 18h18M8 3v6m9 0v6M7 15v6"/>',
  exit:'<path d="M9 3H3v18h6m5-14 6 5-6 5m-7-5h13"/>',
  check:'<path d="m4 12 5 5L20 6"/>',
  alert:'<path d="m12 3 10 18H2ZM12 9v5m0 3v1"/>',
  bag:'<path d="M8 6V4a4 4 0 0 1 8 0v2M5 7h14l2 15H3ZM8 12h8v6H8Z"/>',
  door:'<path d="M5 22V3h14v19M3 22h18M8 22V6l8-2v18M12 14h1"/>',
  lamp:'<path d="M9 6V4a3 3 0 0 1 6 0v2M5 8h14M7 9 4 21h16L17 9M9 23h6"/><path d="M12 11c0 3 3 5 3 7a3 3 0 0 1-6 0c0-2 2-4 3-7Z"/>',
  radio:'<rect x="3" y="8" width="18" height="13" rx="2"/><path d="m6 8 12-6M6 12h12M6 16h6m-6 3h6"/><circle cx="17" cy="17" r="2"/>',
};
function icon(name){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(PATHS[name]||PATHS.parts)+'</svg>';}
function portrait(c){
 const colors={mira:['#617782','#293c46','#b2a492'],yun:['#7d7e69','#444735','#baa58c'],leo:['#796d63','#413e3a','#ac9583']};
 const p=colors[c.id]||colors.mira;const hair=c.id==='mira'?'<path d="M13 34C7 21 12 8 26 8c15 0 21 14 13 29L34 24l-4-9-13 11Z" fill="#283035"/>':c.id==='leo'?'<path d="M13 20c1-15 24-17 26 0l-8-3-9 2Z" fill="#263134"/><path d="m17 30 6 7 11-7-3 10-10 1Z" fill="#4a4740"/>':'<path d="M13 20c-1-16 28-17 26 1l-8-7-17 9Z" fill="#283033"/>';
 return '<span class="portrait"><svg viewBox="0 0 52 60"><rect width="52" height="60" fill="'+p[0]+'"/><path d="M2 60c0-14 12-19 24-19s24 6 24 19Z" fill="'+p[1]+'"/>'+hair+'<path d="M20 34h12v12H20Z" fill="'+p[2]+'"/><ellipse cx="26" cy="26" rx="12" ry="16" fill="'+p[2]+'"/>'+hair+'<path d="M18 26h4m8 0h4m-9 3-1 5h4m-6 4h8" stroke="#59594f" stroke-width="1"/><path d="m17 45 9 7 9-7" fill="none" stroke="#728083"/><path d="M2 0h16L5 60H0Z" fill="#ffffff09"/></svg></span>';
}
let preferences={sound:false,miniMap:true,reducedMotion:false};
try{preferences={...preferences,...JSON.parse(localStorage.getItem(PREF_KEY)||'{}')};}catch{}
let state=Core.createGame(Date.now()>>>0), expedition=null;
const ui={category:'survival',overlay:null,plan:null,sneak:false,dirty:true,lastSave:0,pointerDown:false,noticeUntil:0,soundContext:null,mutedResume:false,lastPhase:null,barter:{give:{},receive:{}},loadStatus:'empty',loadMessage:'',dawn:null,lastError:'',newCampaign:{difficulty:'standard',seed:''},encounterId:null,distractionAim:false,aimTarget:null,aimResume:true};
const keys={left:false,right:false,up:false,down:false,sneak:false,interact:false};
const pressedPointers=new Set(),movementPointers=new Map();
const dialog=$('game-dialog');
const renderer=createRenderer($('game-canvas'));
const botRuntime=createBotRuntime({getState:()=>state,getExpedition:()=>expedition});
let botUi=null;
let saveAvailable=true;
try{
 const restored=Saves.readCampaign(localStorage);ui.loadStatus=restored.status;ui.loadMessage=restored.message||'';
 if(restored.state){state=restored.state;expedition=restored.expedition;state.paused=true;}
}catch{saveAvailable=false;}
function save(silent=true){
 ui.lastSave=performance.now();
 try{
  Saves.writeCampaign(localStorage,state,expedition);
  saveAvailable=true;$('saved-status').textContent='진행 상황 저장됨';
  if(!silent)toast('현재 생존기를 이 기기에 저장했습니다.','good');
 }catch{saveAvailable=false;$('saved-status').textContent='자동 저장 불가';if(!silent)toast('기기 저장 공간을 확인하거나 저장 파일을 내려받으세요.','bad');}
}
function playSound(type='click'){
 if(!preferences.sound)return;
 try{
  const Audio=window.AudioContext||window.webkitAudioContext;
  if(!Audio)return;
  if(!ui.soundContext)ui.soundContext=new Audio();
  const ctx=ui.soundContext;if(ctx.state==='suspended')ctx.resume();
  const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type=type==='bad'?'triangle':'sine';
  osc.frequency.setValueAtTime(type==='good'?440:type==='bad'?100:260,ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(type==='good'?660:120,ctx.currentTime+.1);
  gain.gain.setValueAtTime(.035,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.18);
  osc.connect(gain);gain.connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+.2);
 }catch{}
}
function toast(text,type='info'){
 const el=document.createElement('div');el.className='toast '+type;el.textContent=text;$('toasts').appendChild(el);
 setTimeout(()=>el.remove(),3700);playSound(type);
}
function notice(text,seconds=3){
 if(!text)return;$('scene-notice').textContent=text;$('scene-notice').classList.add('show');ui.noticeUntil=performance.now()+seconds*1000;
}
function resultFeedback(r,successText){
 if(!r||r.ok===false){toast(r?.reason||'지금은 이 행동을 할 수 없습니다.','bad');return false;}
 if(successText)toast(successText,'good');else playSound('click');
 ui.dirty=true;save();return true;
}
function itemName(id){return Core.ITEMS[id]?.name||id;}
function itemText(items){return Object.entries(items||{}).filter(([,n])=>n>0).map(([k,n])=>itemName(k)+' '+n).join(' · ')||'없음';}
function costHtml(cost){const entries=Object.entries(cost||{}).filter(([,n])=>n>0);return entries.length?entries.map(([k,n])=>'<span class="cost-item">'+icon(k)+n+'</span>').join(''):'<span>재료 소모 없음</span>';}
function survivor(id=state.selectedId){return state.characters.find(c=>c.id===id)||state.characters.find(c=>c.alive)||state.characters[0];}
function charCondition(c){
 if(!c.alive)return '우리가 기억할 사람';
 if(c.job)return c.job.label||'작업 중';
 if(c.health<35)return '심한 부상 · 치료가 필요해요';
 if(c.illness>=45)return '몸이 좋지 않아요';
 if(c.hunger>70)return '많이 배고파요';
 if(c.fatigue>70)return '휴식이 필요해요';
 if(c.morale<25)return '누군가의 위로가 필요해요';
 return '잠시 숨을 고르는 중';
}
function stat(label,value,type){const val=Math.max(0,Math.min(100,value));return '<div class="stat-row" title="'+label+' '+Math.round(val)+' / 100"><span class="stat-label">'+label+'</span><span class="stat-track"><span class="stat-fill '+type+(val<30?' danger':'')+'" style="width:'+val+'%"></span></span><span class="stat-number">'+Math.round(val)+'</span></div>';}
function renderResources(){
 const ids=['meal','raw','water','wood','parts','fuel','meds','bandage','cloth','crowbar','knife'];
 $('resources').innerHTML=ids.map(id=>'<div class="resource '+((state.inventory[id]||0)===0?'low':'')+'" title="'+esc(Core.ITEMS[id]?.description||itemName(id))+'">'+icon(id)+'<div class="resource-data"><strong>'+(state.inventory[id]||0)+'</strong><span>'+esc(itemName(id))+'</span></div></div>').join('');
}
function renderCharacters(){
 $('characters').innerHTML=state.characters.map(c=>'<button class="character-card '+(c.id===state.selectedId?'selected ':'')+(!c.alive?'dead':'')+'" data-action="select-character" data-id="'+esc(c.id)+'" aria-pressed="'+(c.id===state.selectedId)+'" aria-label="'+esc(c.name)+' 선택" '+(!c.alive?'disabled':'')+'><span class="character-work">'+esc(c.job?.label||'대기 중')+'</span><header>'+portrait(c)+'<div><div class="character-name">'+esc(c.name)+'</div><div class="character-trait">'+esc(c.trait||c.role)+'</div></div></header><div class="character-stats">'+stat('건강',c.health,'health')+stat('포만',100-c.hunger,'hunger')+stat('기력',100-c.fatigue,'fatigue')+stat('사기',c.morale,'morale')+'</div><p class="character-condition '+(c.health<40||c.hunger>75||c.morale<25?'warning':'')+'">'+esc(charCondition(c))+'</p></button>').join('');
 $('alive-label').textContent=state.characters.filter(c=>c.alive).length+'명 생존';
}
const actionIcons={eat:'meal',rest:'bed',cook:'meal',water:'water',fuel:'fuel',heal:'meds',bandage:'bandage',talk:'talk',clear:'build',craftCrowbar:'crowbar',craftKnife:'knife',buildBed:'bed',buildCollector:'water',buildHeater:'fuel',buildBarricade:'shield',repairShelter:'build',buildTrap:'raw',upgradeStove:'meal',buildRadio:'radio',contactRelief:'radio',prepareEvacuation:'bag'};
function renderDayPanel(){
 const c=survivor(),actions=Core.getActions(state,c.id)||[];
 const cats={survival:'생활과 회복',craft:'제작',build:'시설'};
 let html='<div class="action-heading"><div><span class="eyebrow">지금 무엇을 할까요?</span><h2><i class="person-dot" style="background:'+(/^#[0-9a-f]{6}$/i.test(c.color)?c.color:'#a4b3bb')+'"></i>'+esc(c.name)+'<span>'+esc(c.role)+'</span></h2></div><button class="text-button person-details" data-action="character">상태 · 동료 치료 ↗</button></div>';
 if(c.job){
  const ratio=Math.max(0,Math.min(100,100*(1-c.job.remaining/c.job.total)));
  html+='<div class="job-card"><div class="job-top"><h3>'+esc(c.job.label)+'</h3><button class="cancel-button" data-action="cancel-job" data-id="'+esc(c.id)+'">중단</button></div><div class="job-progress"><span style="width:'+ratio+'%"></span></div><p>'+Math.ceil(c.job.remaining)+'분 남음 · 다음 작업을 최대 3개 예약할 수 있습니다.</p></div>';
 }
 if(c.queue?.length)html+='<ol class="job-queue">'+c.queue.map((id,i)=>'<li><span>'+String(i+1).padStart(2,'0')+'</span><strong>'+esc(actions.find(a=>a.id===id)?.name||id)+'</strong><button data-action="remove-queue" data-index="'+i+'" aria-label="'+esc(id)+' 예약 취소">×</button></li>').join('')+'</ol>';
 html+='<div class="tabs">'+Object.entries(cats).map(([key,name])=>'<button class="tab '+(ui.category===key?'active':'')+'" data-action="category" data-id="'+key+'">'+name+'</button>').join('')+'</div><div class="action-grid">';
 html+=actions.filter(a=>a.category===ui.category).map(a=>{
  const queue=!!c.job,can=queue?a.queueable:a.available,reason=queue?a.queueReason:a.reason,cost=queue?(a.queueCost||a.cost):a.cost,duration=queue?(a.queueDuration??a.duration):a.duration;
  return '<button class="action-card '+(queue&&can?'can-queue':'')+'" data-action="day-action" data-id="'+esc(a.id)+'" title="'+esc(a.description+(reason?' · '+reason:''))+'" '+(!can?'disabled':'')+'><span class="action-card-head">'+icon(actionIcons[a.id]||'build')+esc(a.name)+'</span><span class="cost-list">'+costHtml(cost)+'</span><span class="action-outcome">'+esc(a.output?'→ '+itemText(a.output):a.facility?Core.FACILITIES[a.facility].description:a.description)+'</span>'+(!can?'<span class="blocked-reason">'+esc(reason||'조건을 확인하세요')+'</span>':'<span class="duration">'+(queue?'+ 다음 작업 · ':'')+(duration?Math.round(duration)+'분':'즉시')+'</span>')+'</button>';
 }).join('');
 html+='</div><p class="panel-hint">'+(c.job?'예약은 실제 작업이 시작될 때 재료를 사용합니다. 재료가 부족해지면 해당 예약을 건너뜁니다.':ui.category==='build'?'시설 설명과 필요한 재료를 확인하세요. 난방은 밤에 남아 있는 연료를 사용합니다.':'작업 중에도 다른 사람을 선택해 일을 맡길 수 있습니다.')+'</p>';
 $('action-panel').innerHTML=html;
 $('visitor-banner').innerHTML=state.visitor?'<button class="visitor-card" data-action="visitor">'+icon('door')+'<span><strong>'+esc(state.visitor.title)+'</strong><small>시간을 멈추고 이야기를 들어보세요</small></span><span class="chevron">↗</span></button>':'';
}

function renderNightPanel(){
 const ex=expedition;if(!ex)return;
 const nearby=Field.getNearby(ex),remaining=Math.max(0,Math.ceil(ex.duration-ex.time)),slots=Core.usedSlots(ex.bag);
 const selectedLoot=ex.loot.find(l=>l.id===ex.activeLootId&&l.floor===ex.player.floor&&Math.abs(l.x-ex.player.x)<=82);
 const visible=Field.getVisibility?.(ex),visibleNPC=ex.npcs.filter(n=>n.health>0&&n.state!=='gone'&&(!visible||visible.npcIds.includes(n.id)));
 const danger=visibleNPC.some(n=>['chase','attack'].includes(n.state)),warning=visibleNPC.some(n=>n.state==='warn');
 let html='<div class="night-heading"><span class="eyebrow">SCAVENGING</span><h2>'+esc(ex.name)+'</h2><p>닫힌 문은 길과 시야를 막습니다. 열린 길을 기억하세요.</p><div class="night-timer '+(remaining<25?'urgent':'')+'">'+icon('clock')+'<span>새벽까지 '+remaining+'초</span><span class="night-timer-track"><span style="width:'+Math.max(0,100*(1-ex.time/ex.duration))+'%"></span></span></div></div>';
 html+='<div class="field-status '+(danger?'danger':warning?'warning':'')+'"><span>'+icon(ex.player.hidden?'shield':danger?'alert':'search')+(ex.player.hidden?'숨어 있습니다':danger?'추격당하고 있습니다':warning?'침입 경고를 받았습니다':'주변을 살피는 중')+'</span><strong>건강 '+Math.round(ex.player.health)+'</strong></div>';
 const nav=Field.getNavigation?.(ex);
 if(nav){
  const routeText=nav.exit.reached?'출입구에 도착했습니다':nav.exit.blockedDoorId?'귀환 길에 닫힌 문이 있습니다 · 가까이에서 E':nav.exit.knownRoute?'확인한 길을 따라 출입구로 돌아갈 수 있습니다':'아직 확인하지 않은 길이 있습니다. 왔던 길을 살피세요.';
  html+='<section class="navigation-card" aria-label="수색과 귀환 안내"><header><span>'+icon('search')+(ex.player.floor+1)+'층 · 탐색 '+Math.round(nav.exploredPercent)+'%</span><button class="text-button" data-action="toggle-minimap">지도 '+(preferences.miniMap?'숨기기':'보기')+'</button></header><p>'+esc(routeText)+'</p></section>';
 }
 const throwReady=(ex.bag.parts||0)>0&&!(ex.distractionCooldown>0)&&!ex.progress&&!ex.player.climb&&!ex.player.dodge&&!ex.player.attackCooldown;
 html+='<section class="distraction-card '+(ui.distractionAim?'aiming':'')+'"><button class="small-button" data-action="aim-distraction" '+(!throwReady&&!ui.distractionAim?'disabled':'')+'>'+icon('parts')+(ui.distractionAim?'조준 취소 · Esc':'소음 유인 · T')+'<span>'+(ex.distractionCooldown>0?Math.ceil(ex.distractionCooldown)+'초':'부품 1')+'</span></button><p>'+(ui.distractionAim?'같은 층의 밝게 보이는 곳을 클릭·탭하세요. 선택하는 동안 시간이 멈춥니다.':'부품을 던져 시선을 돌립니다. 이미 나를 보고 있는 적은 속지 않습니다.')+'</p></section>';
 const stamina=Math.round(ex.player.stamina??100),rules=Field.COMBAT_RULES||{attackStamina:22,dodgeStamina:28};
 html+='<div class="stamina-meter '+(stamina<rules.attackStamina?'exhausted':'')+'"><header><span>스태미나</span><strong>'+stamina+' / 100</strong></header><div><i style="width:'+stamina+'%"></i></div><small>공격 '+rules.attackStamina+' · 회피 '+rules.dodgeStamina+' 소모 · 잠시 쉬면 회복</small></div>';
 const encounter=Field.getEncounter?.(ex);
 if(encounter)html+='<button class="nearby-resident" data-action="encounter" data-id="'+esc(encounter.npcId)+'">'+icon('talk')+'<span><strong>'+esc(encounter.npcName)+'</strong><small>'+(encounter.resolved?'대화를 나눈 주민':'물자를 나누거나 통행을 부탁할 수 있습니다')+'</small></span><b>대화 · R</b></button>';
 if(ex.progress){const p=ex.progress;html+='<div class="job-card"><h3>'+esc(p.label||'응급처치 중')+'</h3><div class="job-progress"><span style="width:'+Math.max(0,100*(1-p.remaining/p.total))+'%"></span></div><p>'+(p.type==='bandage'?'움직이거나 공격받으면 중단됩니다. 완료할 때 붕대 1개를 사용합니다.':'움직이면 조사를 멈춥니다. 주변을 살피세요.')+'</p></div>';}
 if(selectedLoot?.searched){
  html+='<div class="loot-panel"><header><div><h3>'+esc(selectedLoot.label)+'</h3>'+(selectedLoot.owned?'<p class="owned">누군가의 물건 · 가져가면 절도와 사기 저하</p>':'')+'</div><button class="text-button" data-action="close-loot">닫기</button></header>';
  const entries=Object.entries(selectedLoot.items).filter(([,n])=>n>0);
  html+=entries.length?entries.map(([id,n])=>'<div class="loot-row"><span>'+icon(id)+esc(itemName(id))+' × '+n+'</span><button data-action="take-loot" data-loot="'+esc(selectedLoot.id)+'" data-id="'+id+'">담기</button></div>').join('')+'<button class="collect-all" data-action="take-all" data-loot="'+esc(selectedLoot.id)+'">가능한 만큼 담기 <span>'+slots+' / '+ex.capacity+'칸</span></button>':'<p class="bag-empty">남아 있는 물자가 없습니다.</p>';
  html+='</div>';
 }
 if(nearby.door)html+='<div class="door-control"><span>'+icon('door')+esc(nearby.door.label)+(nearby.door.locked?' · 잠김':'')+'</span><button class="small-button" data-action="toggle-door" data-id="'+esc(nearby.door.id)+'">'+(nearby.door.open?'문 닫기':'문 열기')+'</button></div>';
 html+='<div class="night-buttons"><button class="small-button" data-action="interact">'+(nearby.door&&!nearby.door.open?'문 열기 · E':nearby.loot?'살펴보기 · E':nearby.exit?'은신처로 귀환':nearby.hide?'숨기 / 나오기':'살펴보기 · E')+'</button><button class="small-button '+(ui.sneak?'active':'')+'" data-action="sneak">'+(ui.sneak?'은밀히 이동 중':'조심히 걷기')+'</button><button class="small-button danger" data-action="attack" '+(stamina<rules.attackStamina?'disabled':'')+'>공격 · F</button><button class="small-button dodge-action" data-action="dodge" '+(stamina<rules.dodgeStamina||ex.player.dodgeCooldown>0?'disabled':'')+'>회피 · '+(ex.player.dodgeCooldown>0?Math.ceil(ex.player.dodgeCooldown)+'초':'Q')+'</button><button class="small-button bandage-action" data-action="field-bandage" '+(!(ex.bag.bandage>0)||ex.player.health>=100||ex.progress||ex.bandageCooldown>0?'disabled':'')+'>'+icon('bandage')+'응급처치 · B · '+(ex.bandageCooldown>0?Math.ceil(ex.bandageCooldown)+'초':(ex.bag.bandage||0)+'개')+'</button></div>';
 html+='<div class="bag-section"><div class="bag-heading"><strong>나의 가방</strong><span>'+slots+' / '+ex.capacity+'칸</span></div><div class="capacity-track"><span style="width:'+Math.min(100,slots/ex.capacity*100)+'%"></span></div><div class="bag-grid">'+(Object.entries(ex.bag).filter(([,n])=>n>0).map(([id,n])=>'<span class="bag-item" title="'+esc(itemName(id))+' · '+Core.ITEMS[id].stack+'개당 1칸">'+icon(id)+n+'<button data-action="drop-item" data-id="'+id+'" aria-label="'+esc(itemName(id))+' 하나 내려놓기">−</button></span>').join('')||'<span class="bag-empty">꼭 필요한 물건부터 챙기세요.</span>')+'</div></div>';
 html+='<p class="night-warning">'+(ex.player.health<40?'부상이 심합니다. 안전한 곳에서 응급처치하거나 돌아가세요.':danger?'붉은 공격 예고가 보이면 Q로 회피하거나 거리를 벌리세요. 문과 어둠도 이용할 수 있습니다.':'상자 조사 → 물품 담기 → 출입구로 귀환')+'</p><button class="text-button emergency-return" data-action="evacuate">긴급 귀환 · 부상과 피로 감수</button>';
 $('action-panel').innerHTML=html;$('visitor-banner').innerHTML='';
}

function renderJournal(all=false){
 const entries=(state.logs||[]).slice(0,all?50:3);
 return entries.map(l=>'<div class="journal-entry '+esc(l.type||'info')+'"><time>DAY '+String(l.day||state.day).padStart(2,'0')+'</time><span class="log-dot"></span><span>'+esc(l.text)+'</span></div>').join('')||'<div class="journal-entry"><span class="log-dot"></span><span>세 사람이 이 낡은 집에 도착했습니다. 오늘을 살아낼 준비를 합니다.</span></div>';
}
function renderHUD(){
 const night=state.phase==='expedition'&&expedition;
 $('app').classList.toggle('is-expedition',!!night);
 $('day-label').textContent='DAY '+String(state.day).padStart(2,'0');
 $('days-left').textContent='12일 · '+(Core.DIFFICULTIES?.[state.difficulty]?.label||'표준');$('ceasefire-count').textContent=Math.max(0,13-state.day)+'일';
 $('campaign-dots').innerHTML=Array.from({length:12},(_,i)=>'<span class="'+(i+1<state.day?'past':i+1===state.day?'current':'')+'"></span>').join('');
 const weather=Core.getWeather?Core.getWeather(state):{cold:state.day>=4&&state.day<=8,temperature:state.day>=4&&state.day<=8?4:17};
 $('weather').innerHTML=icon(night?'moon':weather.cold?'snow':'sun')+'<span>'+(weather.temperature??17)+'°C · '+(weather.cold?'매서운 추위':night?'깊은 밤':'흐림')+'</span>';
 $('weather').classList.toggle('cold',!!weather.cold);
 $('scene-location').textContent=night?(expedition.name||'도시 수색'):'우리의 은신처';
 $('scene-description').textContent=night?'돌아올 길을 기억하며, 조용히 움직이세요.':weather.cold?'작은 불씨가 필요한 계절입니다.':'조용한 아침, 아직은 안전합니다.';
 $('scene-tag').textContent=night?'OUTSIDE · '+String(expedition.locationId).toUpperCase():'SHELTER · DISTRICT 07';
 $('phase-label').textContent=night?'NIGHTFALL':'DAYTIME';
 const minutes=night?(21*60+Math.min(480,expedition.time/expedition.duration*480))%1440:state.clock;
 $('clock-label').textContent=String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(Math.floor(minutes%60)).padStart(2,'0');
 const autoOn=botRuntime.isAutoPlayMode();
 $('pause-button').innerHTML=icon(state.paused?'play':'pause');$('pause-button').setAttribute('aria-label',state.paused?'재생':'일시정지');
 $('pause-button').disabled=autoOn;$('pause-button').hidden=autoOn;
 $('paused-banner').hidden=autoOn||!state.paused||!!ui.overlay||ui.distractionAim;
 $('pause-hint').textContent=night?'이동하거나 재생을 눌러 수색을 이어가세요.':'작업을 선택하거나 재생을 누르세요.';
 $('canvas-wrap').classList.toggle('distraction-aim',ui.distractionAim);
 $('night-pause-button').innerHTML=icon(state.paused?'play':'pause');$('night-pause-button').setAttribute('aria-label',state.paused?'재생':'일시정지');
 $('night-pause-button').disabled=autoOn;$('night-pause-button').hidden=autoOn;
 $('day-controls').hidden=!!night;$('night-controls').hidden=!night;$('touch-controls').hidden=!night;
 $('sneak-button').textContent=ui.sneak?'은밀히 이동 중':'조심히 걷기';$('sneak-button').classList.toggle('active',ui.sneak);
 $('distraction-button').textContent=ui.distractionAim?'조준 취소':'유인 · T';$('distraction-button').classList.toggle('active',ui.distractionAim);
 $('distraction-button').disabled=!!night&&!ui.distractionAim&&(!(expedition.bag.parts>0)||expedition.distractionCooldown>0||!!expedition.progress||!!expedition.player.climb||!!expedition.player.dodge||!!expedition.player.attackCooldown);
 document.querySelectorAll('[data-action="speed"]').forEach(el=>el.classList.toggle('active',Number(el.dataset.speed)===state.speed));
 const autoBtn=$('auto-sim-button');
 if(autoBtn){const on=botRuntime.isAutoPlayMode();autoBtn.classList.toggle('active',on);autoBtn.textContent=on?'🤖 봇 시뮬레이션 ON ('+state.speed+'×)':'🤖 봇 전용 시뮬레이션';}
 $('shelter-status').textContent=night?'건강 '+Math.round(expedition.player.health)+' · 소음 '+Math.round((expedition.player.noise||0)*100)+'%':'문 '+(state.facilities.barricade||0)+'단계 · 내구도 '+Math.round(state.shelterIntegrity??100)+'%' ;
 const c=survivor();
 if(night){$('objective-title').textContent='필요한 만큼, 무사히.';$('objective-description').textContent='욕심보다 귀환이 먼저입니다. 다른 사람의 물건과 움직임을 살펴보세요.';}
 else if(state.day===1){$('objective-title').textContent='오늘 밤도, 모두 함께.';$('objective-description').textContent='미라에게 조리를, 윤에게 집수기 제작을 맡기고 레오는 밤의 수색을 준비해 주세요.';}
 else if(weather.cold){$('objective-title').textContent='불씨가 꺼지지 않도록.';$('objective-description').textContent='연료와 난방을 준비하세요. 추운 밤은 아픈 사람에게 더 길게 느껴집니다.';}
 else{$('objective-title').textContent='아직, 포기하지 않았어요.';$('objective-description').textContent='배고픈 사람에게 식사를. 지친 사람에게 휴식을. 오늘의 작은 선택이 내일을 만듭니다.';}
 const relief=Core.getReliefStatus(state);
 $('relief-summary').innerHTML='<span>'+icon('radio')+'구호 연락망 <strong>'+relief.completed+' / '+relief.total+'</strong></span><small>'+esc(relief.prepared?'대피 물자 준비 완료 · 마지막 밤까지 함께':relief.next?.title||'구호 통로를 기다리는 중')+' ↗</small>';
 $('advance-button').dataset.action=night?'return-home':'end-day';
 $('advance-button').innerHTML='<span><small>'+(night?'COME BACK SAFE':'NEXT CHAPTER')+'</small><strong>'+(night?'출입구로 돌아가기':'밤을 준비하기')+'</strong></span><span class="advance-arrow">'+(night?'←':'↗')+'</span>';
 $('advance-button').disabled=state.phase!=='day'&&!night;
 $('quiet-note').textContent=night?'가방을 비워도, 살아 돌아오면 다시 시작할 수 있습니다.':'이 도시에서, 살아남는 것도 용기입니다.';
 $('sound-button').innerHTML=icon(preferences.sound?'sound':'mute');$('sound-button').setAttribute('aria-label',preferences.sound?'소리 끄기':'소리 켜기');
 $('help-button').innerHTML=icon('help');$('settings-button').innerHTML=icon('settings');
}
function render(){
 renderHUD();
 if(ui.pointerDown)return;
 renderGuidance();renderResources();renderCharacters();$('journal').innerHTML=renderJournal();
 if(state.phase==='expedition'&&expedition)renderNightPanel();else renderDayPanel();
 ui.dirty=false;
}
function heading(kicker,title,description,closable=true){
 return (closable?'<button class="dialog-close" data-action="close-dialog" aria-label="닫기">×</button>':'')+'<header class="dialog-heading"><span class="eyebrow">'+esc(kicker)+'</span><h2 id="dialog-title">'+esc(title)+'</h2><p>'+esc(description)+'</p></header>';
}
function openDialog(type){
 cancelDistractionAim();
 if(!ui.overlay&&!botRuntime.isAutoPlayMode()){ui.mutedResume=state.paused;state.paused=true;}
 resetKeys();
 ui.overlay=type;renderDialog();if(!dialog.open)dialog.showModal();ui.dirty=true;
}
function closeDialog(){
 if(['planning','report','ending'].includes(ui.overlay))return;
 ui.overlay=null;dialog.close();
 if(state.phase==='day'||state.phase==='expedition')state.paused=ui.mutedResume;
 ui.dirty=true;save();
}
function forceClose(){ui.overlay=null;if(dialog.open)dialog.close();ui.dirty=true;}
function initPlan(){
 const alive=state.characters.filter(c=>c.alive);
 const scav=alive.filter(c=>c.health>20&&c.fatigue<85).sort((a,b)=>b.capacity-a.capacity||a.fatigue-b.fatigue)[0]||alive[0];
 const guard=alive.filter(c=>c.id!==scav?.id).sort((a,b)=>(b.health-b.fatigue)-(a.health-a.fatigue))[0];
 const roles={};alive.forEach(c=>roles[c.id]=c.id===scav?.id?'scavenge':c.id===guard?.id?'guard':'sleep');
 if(alive.length>1&&!Object.values(roles).includes('guard')){const other=alive.find(c=>c.id!==scav.id);roles[other.id]='guard';}
 ui.plan={scavengerId:scav?.id||null,companionId:null,locationId:Field.LOCATIONS.find(l=>l.unlockDay<=state.day)?.id||'cottage',roles,loadout:{}};
}
function renderPlanning(){
 if(!ui.plan)initPlan();const p=ui.plan;
 let html=heading('NIGHT PLANNING','밤을 나누어 갖는 시간','한 사람은 내일을 찾아 나가고, 원하면 동료 AI 1명을 동행시킬 수 있습니다.',false);
 html+='<h3 class="subheading">01. 오늘 밤의 역할<span>수색자 1명 · 선택적으로 동행 AI 1명 배정 가능</span></h3><div class="plan-characters">';
 html+=state.characters.filter(c=>c.alive).map(c=>'<div class="plan-character"><header>'+portrait(c)+'<div><h3>'+esc(c.name)+'</h3><p>건강 '+Math.round(c.health)+' · 기력 '+Math.round(100-c.fatigue)+'</p></div></header><div class="role-buttons">'+[['scavenge','수색'],['companion','동행 AI'],['guard','경계'],['sleep','수면']].map(([r,l])=>'<button class="role-button '+(p.roles[c.id]===r?'selected':'')+'" data-action="plan-role" data-id="'+esc(c.id)+'" data-role="'+r+'">'+l+'</button>').join('')+'</div></div>').join('');
 html+='</div>';
 if(p.scavengerId){
 html+='<h3 class="subheading">02. 목적지<span>지역은 날이 지나면 새로 열립니다</span></h3><div class="locations-grid">';
 html+=Field.LOCATIONS.map(l=>{
  const intel=Field.getLocationIntel(state,l.id),locked=l.unlockDay>state.day;
  return '<button class="location-card '+(p.locationId===l.id?'selected':'')+'" data-action="plan-location" data-id="'+esc(l.id)+'" '+(locked?'disabled':'')+'><span class="risk risk-'+l.riskLevel+'">'+(locked?l.unlockDay+'일째 개방':'위험 '+esc(l.risk))+'</span><h3>'+esc(l.name)+'</h3><p>'+esc(l.subtitle)+'</p><span class="location-loot">'+esc(l.lootHint)+'</span>'+(!locked?'<span class="location-intel">'+(intel.cleared?'확인한 물자 모두 회수':intel.visits?'방문 '+intel.visits+'회 · 조사 '+intel.searched+'/'+intel.totalContainers:'미방문 · 내부 상태 미확인')+'</span>':'')+'</button>';
 }).join('')+'</div>';
 const selected=Field.LOCATIONS.find(l=>l.id===p.locationId),intel=Field.getLocationIntel(state,p.locationId);
 if(selected)html+='<div class="location-detail"><p>'+esc(selected.description)+'</p>'+(intel.visits?'<small>확인한 잔여 물자: '+esc(itemText(intel.remainingKnownItems))+' · 발견한 잠금 '+intel.lockedCount+'곳</small>':'<small>미방문 장소의 실제 물자 수량은 수색해야 알 수 있습니다.</small>')+'</div>';
 html+='<h3 class="subheading">03. 챙겨 갈 물건<span>도구·치료품·나눔 물자 · 부품은 유인에도 사용</span></h3><div class="loadout-row">';
 html+=['crowbar','knife','bandage','meds','water','meal','parts'].map(id=>'<div class="loadout-item">'+icon(id)+'<span>'+esc(itemName(id))+' <small>(보유 '+(state.inventory[id]||0)+')</small></span><div class="quantity-stepper"><button data-action="loadout" data-id="'+id+'" data-delta="-1" aria-label="'+esc(itemName(id))+' 줄이기" '+(!(p.loadout[id]>0)?'disabled':'')+'>−</button><span>'+(p.loadout[id]||0)+'</span><button data-action="loadout" data-id="'+id+'" data-delta="1" aria-label="'+esc(itemName(id))+' 추가" '+((p.loadout[id]||0)>=(state.inventory[id]||0)?'disabled':'')+'>+</button></div></div>').join('')+'</div>';
 html+='<p class="slots-label">사용 공간 <strong>'+Core.usedSlots(p.loadout)+' / '+survivor(p.scavengerId).capacity+'칸</strong> · 주민과 나눌 물자는 반출해야 합니다. 남은 공간에 발견한 물자를 가져옵니다.</p>';
 }else html+='<div class="report-summary" style="margin-top:22px">오늘 밤은 아무도 밖에 나가지 않습니다. 회복할 기회가 되지만 새 물자는 들어오지 않습니다.</div>';
 html+=forecastHtml(p);
 html+='<footer class="dialog-footer"><p>'+(!Object.values(p.roles).includes('guard')?'경계하는 사람이 없습니다. 약탈에 더 취약할 수 있습니다.':'낮에 시작한 작업은 정리되었습니다. 밤의 결정을 확정해 주세요.')+'</p><button class="primary-button" data-action="begin-night">'+(p.scavengerId?'수색 시작하기 →':'은신처에서 밤 보내기 →')+'</button></footer>';return html;
}
function renderReport(){
 const r=state.report||{};
 let html=heading('THE MORNING AFTER',r.title||'우리는 밤을 건넜습니다.',r.summary||'지난밤의 흔적을 살피고, 다시 하루를 준비합니다.',false);
 const items=Array.isArray(r.items)?r.items:[];
 html+='<div class="report-items">'+items.map(it=>'<div class="report-item '+esc(it.type||'info')+'">'+icon(it.type==='bad'?'alert':it.type==='good'?'check':'lamp')+'<span>'+esc(it.text)+'</span></div>').join('')+'</div>';
 if(r.supplyDelta){
  const changes=Object.entries(r.supplyDelta).filter(([,n])=>n!==0);
  html+='<section class="night-ledger"><h3 class="subheading">은신처 재고 변화<span>출발 직전 → 아침 · 반출·귀환·소비·피해 포함</span></h3><div class="ledger-items">'+(changes.length?changes.map(([id,n])=>'<span class="'+(n>0?'gain':'loss')+'">'+icon(id)+esc(itemName(id))+' <strong>'+(n>0?'+':'')+n+'</strong></span>').join(''):'<p>밤사이 재고 변화가 없습니다.</p>')+'</div></section>';
 }
 if(Array.isArray(r.characterChanges)){
  html+='<section class="condition-ledger"><h3 class="subheading">동료들이 보낸 밤<span>숫자는 밤사이 변화량입니다</span></h3><div class="condition-ledger-rows">'+r.characterChanges.map(change=>{
   const d=change.delta||{},chips=[['건강',d.health],['포만',-d.hunger],['기력',-d.fatigue],['사기',d.morale],['질병',d.illness,-1]].filter(([,n])=>Number.isFinite(n)&&Math.abs(n)>.01);
   return '<div><strong>'+esc(change.name||survivor(change.id).name)+'</strong><span>'+chips.map(([label,n,polarity=1])=>'<small class="'+(n*polarity>0?'gain':'loss')+'">'+label+' '+(n>0?'+':'')+Math.round(n)+'</small>').join('')+'</span></div>';
  }).join('')+'</div></section>';
 }
 if(r.loot&&Object.values(r.loot).some(n=>n>0))html+='<h3 class="subheading">밤에 가져온 물자</h3><div class="loot-summary">'+Object.entries(r.loot).filter(([,n])=>n>0).map(([k,n])=>'<span>'+esc(itemName(k))+' +'+n+'</span>').join('')+'</div>';
 html+='<div class="ending-characters">'+state.characters.map(c=>'<p><strong>'+esc(c.name)+'</strong>'+(!c.alive?'이제 우리 곁에 없습니다.':'건강 '+Math.round(c.health)+' · 포만 '+Math.round(100-c.hunger)+' · 기력 '+Math.round(100-c.fatigue)+' · 사기 '+Math.round(c.morale))+'</p>').join('')+'</div>';
 html+='<footer class="dialog-footer"><p>'+Math.max(0,12-state.day)+'번의 밤을 더 지나면 휴전입니다.</p><button class="primary-button" data-action="next-day">'+(state.day>=12?'마지막 장을 펼치기 →':'새 아침을 맞이하기 →')+'</button></footer>';return html;
}
function renderVisitor(){
 const v=state.visitor;if(!v)return heading('AT THE DOOR','조용해진 문 앞','방문자가 떠났습니다.')+'<button class="primary-button" data-action="close-dialog">돌아가기</button>';
 let html=heading('SOMEONE AT THE DOOR',v.title,'밖에도 오늘을 버티는 사람들이 있습니다.');
 html+='<p class="visitor-story">'+esc(v.body)+'</p>';
 if(v.kind==='trade'){
  html+=renderBarter();
  const stock=Core.getBarter(state).stock;
  html+='<details class="quick-trades"><summary>꾸러미 간편 교환</summary><div class="trade-offers">'+v.offers.map(o=>{
   const can=o.remaining>0&&Object.entries(o.give).every(([k,n])=>(state.inventory[k]||0)>=n)&&Object.entries(o.receive).every(([k,n])=>(stock[k]||0)>=n);
   return '<div class="trade-offer"><div><h3>'+esc(o.label)+'</h3><p>'+esc(itemText(o.give))+' → <strong>'+esc(itemText(o.receive))+'</strong></p></div><button class="small-button" data-action="trade" data-id="'+esc(o.id)+'" '+(!can?'disabled':'')+'>'+(o.remaining>0?'교환':'거래 완료')+'</button></div>';
  }).join('')+'</div></details>';
 }else html+='<div class="choice-grid">'+v.options.map(o=>{
  const enough=Object.entries(o.cost||{}).every(([k,n])=>(state.inventory[k]||0)>=n);
  return '<button class="choice-button" data-action="visitor-choice" data-id="'+esc(o.id)+'" '+(!enough?'disabled':'')+'><div><strong>'+esc(o.label)+'</strong><p>'+esc(o.description)+'</p></div><span>'+esc(o.cost?itemText(o.cost):'선택 →')+'</span></button>';
 }).join('')+'</div>';
 html+='<footer class="dialog-footer"><p>나눔과 거래는 동료들의 내일에 영향을 줍니다.</p><button class="secondary-button" data-action="close-dialog">은신처로 돌아가기</button></footer>';return html;
}
function renderEncounter(){
 const encounter=expedition&&Field.getEncounter?.(expedition,ui.encounterId);
 if(!encounter)return heading('PEOPLE OUTSIDE','지금은 대화할 수 없습니다.','주민에게 가까이 다가가세요. 문 너머나 교전 중에는 이야기할 수 없습니다.')+'<button class="primary-button" data-action="close-dialog">수색 계속하기</button>';
 return heading('A DIFFERENT WAY THROUGH',encounter.title,encounter.npcName)+
 '<p class="visitor-story">'+esc(encounter.body)+'</p><div class="encounter-permission"><span class="'+(encounter.permission?.area?'granted':'')+'">'+icon('door')+'통행 '+(encounter.permission?.area?'허락받음':'요청 가능')+'</span><span class="'+(encounter.permission?.loot?'granted':'')+'">'+icon('bag')+'사유 물자 '+(encounter.permission?.loot?'나눔 허락받음':'가져가면 절도')+'</span></div>'+
 '<div class="choice-grid encounter-choices">'+encounter.options.map(option=>'<button class="choice-button" data-action="encounter-choice" data-id="'+esc(option.id)+'" data-npc="'+esc(encounter.npcId)+'" '+(!option.available?'disabled':'')+'><div><strong>'+esc(option.label)+'</strong><p>'+esc(option.description)+'</p><div class="encounter-costs"><span>건넬 물자: '+esc(itemText(option.cost))+'</span><span>받을 물자: '+esc(itemText(option.reward))+'</span></div><small>'+esc(option.consequence||'')+'</small>'+(!option.available&&option.reason?'<p class="blocked-reason">'+esc(option.reason)+'</p>':'')+'</div><b>→</b></button>').join('')+'</div><footer class="dialog-footer"><p>물자는 수색 가방에서 사용합니다. 대화 중에는 시간이 멈춥니다.</p><button class="secondary-button" data-action="close-dialog">대화를 마치고 수색</button></footer>';
}
function openEncounter(npcId=null){
 if(!expedition||state.phase!=='expedition')return;
 const encounter=Field.getEncounter?.(expedition,npcId);
 if(!encounter){toast('보이는 주민에게 가까이 다가가세요. 교전 중에는 대화할 수 없습니다.','bad');return;}
 ui.encounterId=encounter.npcId;ui.pendingInteract=null;openDialog('encounter');
}
function dodgeInDirection(){
 if(!expedition||ui.overlay)return;
 cancelDistractionAim();
 resumeNight();ui.pendingInteract=null;
 const direction=keys.left!==keys.right?(keys.left?-1:1):expedition.player.facing;
 resultFeedback(Field.dodge(expedition,direction));
}
function cancelDistractionAim(restore=true){
 if(!ui.distractionAim)return;
 ui.distractionAim=false;ui.aimTarget=null;
 if(restore&&state.phase==='expedition')state.paused=ui.aimResume;
 ui.dirty=true;
}
function toggleDistractionAim(){
 if(!expedition||state.phase!=='expedition'||ui.overlay)return;
 if(ui.distractionAim){cancelDistractionAim();return;}
 const ex=expedition;
 const reason=!(ex.bag.parts>0)?'가방에 부품 1개가 필요합니다.':ex.distractionCooldown>0?'소음 유인 재사용을 기다려 주세요.':ex.progress||ex.player.climb||ex.player.dodge||ex.player.attackCooldown?'진행 중인 행동을 마친 뒤 던질 수 있습니다.':'';
 if(reason){toast(reason,'bad');return;}
 ui.aimResume=state.paused;state.paused=true;ui.distractionAim=true;ui.aimTarget=null;ui.pendingInteract=null;resetKeys();ui.dirty=true;
 notice('소음 유인 · 같은 층에 던질 곳을 클릭·탭하세요. T 또는 Esc로 취소합니다.',7);
}
function throwAt(clientX,clientY){
 const target=renderer.worldPoint?.(clientX,clientY);
 if(!target){toast('장면 안에서 던질 곳을 선택하세요.','bad');return;}
 ui.aimTarget={x:target.x,floor:target.floor};
 const result=Field.throwDistraction(expedition,target.x,target.floor);
 if(!result.ok){toast(result.reason,'bad');ui.dirty=true;return;}
 cancelDistractionAim(false);state.paused=false;ui.pendingInteract=null;
 resultFeedback(result,result.message||'부품을 던졌습니다. 움직임을 살피세요.');
}
function renderRelief(){
 const status=Core.getReliefStatus(state),actor=survivor(),actions=Core.getActions(state,actor.id);
 const statusNames={complete:'완료',locked:'준비 중',available:'진행 가능','in-progress':'작업 중'};
 let html=heading('A WAY OUT TOGETHER','구호 연락망','무전기를 복구하고, 도시 밖의 사람들과 연락해 마지막 길을 준비합니다. 12일 생존이 캠페인의 기본 목표입니다.');
 html+='<div class="relief-overview"><span>'+status.completed+' / '+status.total+' 준비 완료</span><strong>'+esc(status.routeLabel)+'</strong></div>';
 html+='<div class="relief-people" role="group" aria-label="구호 작업 담당자">'+state.characters.filter(c=>c.alive).map(c=>'<button class="small-button '+(c.id===actor.id?'active':'')+'" data-action="relief-person" data-id="'+esc(c.id)+'" aria-pressed="'+(c.id===actor.id)+'">'+esc(c.name)+(c.job?' · 작업 중':'')+'</button>').join('')+'</div>';
 html+='<ol class="relief-stages">'+status.stages.map((stage,index)=>{
  const action=actions.find(a=>a.id===stage.actionId),queue=!!actor.job,available=action&&(queue?action.queueable:action.available),done=stage.status==='complete',working=stage.status==='in-progress';
  const queuedBy=!done&&!working&&state.characters.find(c=>c.alive&&c.queue?.includes(stage.actionId)),worker=working&&state.characters.find(c=>c.id===stage.workerId);
  const reason=done?'우리의 준비에 남았습니다.':working?(worker?.name||'동료')+'이(가) 이 준비를 진행하고 있습니다.':queuedBy?queuedBy.name+'의 '+(queuedBy.queue.indexOf(stage.actionId)+1)+'번째 다음 작업입니다. 착수할 때 재료를 사용합니다.':(queue?action?.queueReason:action?.reason)||stage.reason||'필요한 물자와 시간이 준비되었습니다.';
  const cost=queue?action?.queueCost||stage.cost:action?.cost||stage.cost,duration=queue?action?.queueDuration??stage.duration:action?.duration??stage.duration;
  const timing=worker?Math.ceil(worker.job.remaining)+'분 남음 · '+worker.name:Math.round(duration)+'분 · '+actor.name;
  return '<li class="relief-stage '+esc(stage.status)+'"><span class="stage-number">'+(done?'✓':String(index+1).padStart(2,'0'))+'</span><section><header><h3>'+esc(stage.title)+'</h3><span>'+esc(queuedBy?'예약됨':statusNames[stage.status]||'준비 중')+'</span></header><p>'+esc(stage.description)+'</p><div class="relief-cost"><span>'+esc(itemText(cost))+'</span><span>'+esc(timing)+'</span></div><small>'+esc(reason)+'</small>'+(!done&&!working&&!queuedBy?'<button class="small-button" data-action="relief-action" data-id="'+esc(stage.actionId)+'" '+(!available?'disabled':'')+'>'+esc(actor.name)+'에게 '+(queue?'다음 작업 예약':'맡기기')+' →</button>':'')+'</section></li>';
 }).join('')+'</ol>';
 if(status.delivery.scheduled||status.delivery.delivered)html+='<div class="relief-delivery">'+icon('bag')+'<span><strong>'+(status.delivery.delivered?'구호 보급 도착':status.delivery.day+'일째 아침 보급 예정')+'</strong><small>'+esc(itemText(status.delivery.items))+'</small></span></div>';
 html+='<footer class="dialog-footer"><p>대피 준비는 한 번만 완료할 수 있습니다. 필요한 물자와 작업 시간을 확인하세요.</p><button class="primary-button" data-action="close-dialog">은신처로 돌아가기</button></footer>';
 return html;
}
function renderHelp(){
 return heading('FIELD NOTES','작은 선택으로, 하루 더.','낮에는 함께 사는 사람들을 돌보고, 밤에는 한 사람을 보내 필요한 물자를 찾으세요.')+
 '<div class="help-grid"><section class="help-box"><h3>01 · 낮을 준비하기</h3><p>생존자 카드를 선택한 뒤 작업을 맡깁니다. 여러 사람이 동시에 다른 일을 할 수 있습니다. 작업 중 다음 행동을 선택하면 최대 3개까지 예약합니다. 식사는 직접 배급하세요.</p><ul><li>미라: 자신·동료 치료에 회복 보너스, 가방 10칸</li><li>윤: 제작·시설 건설 시간이 20% 짧음, 가방 12칸</li><li>레오: 가방 15칸, 밤의 수색에 적합</li></ul></section>'+
 '<section class="help-box"><h3>02 · 밤의 역할 나누기</h3><p>수색은 한 사람만 갑니다. 남은 사람은 경계하거나 잡니다. 들고 간 도구는 가방을 차지하며, 그날 은신처 방어에 쓸 수 없습니다.</p></section>'+
 '<section class="help-box"><h3>03 · 수색하고 돌아오기</h3><p>화면을 눌러 이동하거나 WASD·방향키를 사용하세요. 닫힌 문은 길과 시야를 막습니다. 문을 누르거나 E로 여세요. 계단으로 층을 이동하고 물자 앞에서 E를 눌러 조사합니다. 발견한 물건은 ‘담기’로 가방에 넣습니다.</p><p>가방이 차면 불필요한 물건을 내려놓을 수 있습니다. 왼쪽 출입구로 무사히 돌아오세요.</p></section>'+
 '<section class="help-box"><h3>04 · 사람이 먼저입니다</h3><p>건강·포만·기력·사기는 높을수록 좋습니다. 부상은 붕대로, 병은 약으로 돌보세요. 4~8일의 추위에는 난로와 연료를 준비하고, 12번의 밤을 살아남으면 구호 통로가 열립니다.</p></section><section class="help-box"><h3>05 · 위험을 읽고 피하기</h3><p>적의 붉은 공격 예고를 보고 Q로 이동 방향으로 회피하세요. 방향키를 누르지 않으면 바라보는 쪽으로 피합니다. 공격과 회피는 스태미나를 사용합니다. 잠시 행동을 멈추면 회복하며, 안전한 곳에서 B로 붕대를 사용할 수 있습니다.</p></section><section class="help-box"><h3>06 · 돌아온 뒤의 선택</h3><p>진료소·정비소·아파트의 주민에게 R로 통행을 부탁하거나 물자를 나눌 수 있습니다. 사유물은 별도의 나눔 허락을 받아야 합니다. 은신처는 습격을 막아도 손상될 수 있습니다. 다음 날 시설 탭에서 수리하세요.</p></section><section class="help-box"><h3>07 · 다른 곳으로 시선 돌리기</h3><p>가방에 부품을 챙기고 T 또는 유인을 누르세요. 같은 층의 보이는 곳을 클릭하면 부품 1개를 던집니다. 나를 보지 못한 주민과 경비는 소리를 조사합니다. 조준 중에는 시간이 멈추고 Esc로 취소할 수 있습니다.</p></section><section class="help-box"><h3>08 · 마지막 길 준비하기</h3><p>구호 연락망에서 무전기 복구, 4일째 이후 교신, 9일째 이후 대피 물자 봉인을 진행하세요. 교신 다음 아침의 보급은 한 번만 도착합니다. 선택 목표를 마치지 않아도 12일을 생존하면 대피할 수 있습니다.</p></section></div>'+
 '<div class="help-controls"><span><b class="keycap">WASD / 방향키</b>이동</span><span><b class="keycap">E</b>살펴보기</span><span><b class="keycap">SHIFT</b>은밀한 이동</span><span><b class="keycap">F</b>공격</span><span><b class="keycap">Q</b>회피</span><span><b class="keycap">R</b>주민 대화</span><span><b class="keycap">B</b>응급처치</span><span><b class="keycap">T</b>소음 유인 조준</span><span><b class="keycap">ESC</b>조준 취소</span><span><b class="keycap">SPACE</b>일시정지</span></div>'+
 '<footer class="dialog-footer"><p>진행 상황은 이 브라우저에 자동 저장됩니다. 설정에서 저장 파일을 내보내 다른 기기로 옮길 수 있습니다.</p><button class="primary-button" data-action="close-dialog">살아갈 준비가 됐어요 →</button></footer>';
}
function renderSettings(){
 return heading('KEEP THE LIGHT','저장과 설정','현재 생존기를 보관하거나, 다른 기기에서 이어갈 수 있습니다.')+
 '<div class="settings-list"><div class="settings-row"><div><h3>현재 생존기 · '+esc(Core.DIFFICULTIES?.[state.difficulty]?.label||'표준')+'</h3><p>'+state.day+'일째 · '+state.characters.filter(c=>c.alive).length+'명 생존 · '+(saveAvailable?'자동 저장 사용 중':'기기 저장 제한: 파일 내보내기를 권장합니다')+'</p></div><button class="secondary-button" data-action="save-now">지금 저장</button></div>'+
 '<div class="settings-row"><div><h3>저장 파일</h3><p>JSON 파일로 보관하고 다른 브라우저에서 불러옵니다. 생존기 번호 '+state.seed+'</p></div><div class="button-row"><button class="small-button" data-action="export-save">내보내기</button><button class="small-button" data-action="import-save">불러오기</button></div></div>'+
 '<div class="settings-row"><div><h3>아침 기록 복구</h3><p>'+ (ui.dawn?ui.dawn.state.day+'일째 아침을 다시 준비할 수 있습니다.':'현재 생존기의 아침 기록이 없습니다.') +'</p></div><button class="small-button" data-action="restore-dawn" '+(!ui.dawn?'disabled':'')+'>아침으로 돌아가기</button></div>'+
 '<div class="settings-row"><div><h3>효과음</h3><p>선택과 결과를 알리는 작은 소리</p></div><button class="secondary-button" data-action="sound">'+(preferences.sound?'켜짐 · 끄기':'꺼짐 · 켜기')+'</button></div>'+
 '<div class="settings-row"><div><h3>탐색 지도</h3><p>발견한 장소와 현재 보이는 사람만 지도에 표시합니다.</p></div><button class="secondary-button" data-action="toggle-minimap">'+(preferences.miniMap?'켜짐 · 숨기기':'숨김 · 켜기')+'</button></div>'+
 '<div class="settings-row"><div><h3>화면 움직임 줄이기</h3><p>배경 입자와 장식 움직임을 줄입니다. 게임 시간과 판정은 같습니다.</p></div><button class="secondary-button" data-action="toggle-motion">'+(preferences.reducedMotion?'줄임 · 기본으로':'기본 · 줄이기')+'</button></div>'+
 '<div class="settings-row"><div><h3>새로운 생존기</h3><p>현재 진행은 덮어씁니다. 먼저 저장 파일을 내보낼 수 있습니다.</p></div><button class="small-button danger" data-action="confirm-new">새로 시작</button></div></div>'+
 '<p class="settings-note">이 게임의 저장 데이터는 서버로 전송되지 않습니다. 브라우저 데이터를 지우면 자동 저장도 사라지므로 필요한 생존기는 파일로 보관해 주세요.</p>'+
 '<footer class="dialog-footer">'+(document.documentElement?.dataset?.offline?'<span class="text-button">단일 HTML 실행 버전 · 전체 소스는 제공된 ZIP에서 확인</span>':'<div class="download-links"><a class="text-button" href="last-light.html" download>단일 HTML 실행 파일 ↗</a><a class="text-button" href="last-light-source.zip" download>전체 JavaScript 소스 ↗</a></div>')+'<button class="primary-button" data-action="close-dialog">게임으로 돌아가기</button></footer>';
}
function renderEnding(){
 const e=state.ending||{kind:state.characters.some(c=>c.alive)?'victory':'defeat',title:'마지막 불빛',body:'우리가 건넌 날들을 기억합니다.'};
 const alive=state.characters.filter(c=>c.alive).length,epilogues=Core.getEpilogues?.(state)||[];
 return heading(e.kind==='victory'?'THE WAR IS OVER':'THE LIGHT REMAINS',e.title,e.body,false)+
 '<div class="ending-art">'+icon(e.kind==='victory'?'sun':'lamp')+'</div>'+
 '<p class="campaign-stamp">'+esc(Core.DIFFICULTIES?.[state.difficulty]?.label||'표준')+' · 생존기 '+state.seed+' · 구호 준비 '+Core.getReliefStatus(state).completed+' / 3</p>'+
 '<div class="ending-stats"><div><strong>'+alive+'</strong><span>돌아온 사람</span></div><div><strong>'+Math.min(12,state.day)+'</strong><span>기억할 날들</span></div><div><strong>'+Math.round(state.characters.filter(c=>c.alive).reduce((a,c)=>a+c.morale,0)/Math.max(1,alive))+'</strong><span>남아 있는 희망</span></div></div>'+
 '<div class="epilogues">'+epilogues.map(ep=>'<article class="epilogue '+(!ep.alive?'lost':'')+'"><header>'+portrait(survivor(ep.id))+'<div><span>'+esc(ep.name)+'</span><h3>'+esc(ep.title)+'</h3></div></header><p>'+esc(ep.body)+'</p></article>').join('')+'</div>'+
 '<footer class="dialog-footer"><button class="secondary-button" data-action="export-save">생존 기록 보관</button><button class="primary-button" data-action="confirm-new">다시 불을 밝히기 →</button></footer>';
}
function forecastHtml(plan=ui.plan){
 const f=Core.getNightForecast(state,plan),safe=f.defense>=f.threatMax;
 const integrity=f.integrity??state.shelterIntegrity??100;
 const metrics=[['약탈 가능성',Math.round(f.raidChance*100)+'%',''],['우리의 방어력',Math.round(f.defense),safe?'good':''],['예상 침입 세기',Math.round(f.threatMin)+'–'+Math.round(f.threatMax),''],['문 내구도',Math.round(integrity)+'%',integrity<60?'bad':''],['난방 연료 / 필요',f.fuelAvailable+' / '+f.fuelNeeded,f.fuelAvailable<f.fuelNeeded?'bad':''],['침대 / 수면 인원',f.bedsAvailable+' / '+f.bedsNeeded,''],['경계 인원',f.guards+'명',''],['습격 시 문 손상',(f.wearMin??0)+'–'+(f.wearMax??0),'']];
 return '<section class="forecast-box"><div class="forecast-title"><span>'+icon('shield')+'오늘 밤의 준비</span><small>현재 배정과 반출 기준</small></div><div class="forecast-grid">'+metrics.map(([label,value,type])=>'<div><span>'+label+'</span><strong class="'+type+'">'+value+'</strong></div>').join('')+'</div>'+(f.warnings.length?'<ul class="forecast-warnings">'+f.warnings.map(w=>'<li>'+esc(w)+'</li>').join('')+'</ul>':'<p class="forecast-clear">필수 준비가 갖춰졌습니다. 수색자는 안전하게 돌아오세요.</p>')+'</section>';
}
function renderGuidance(){
 const panel=$('guidance-panel');panel.hidden=state.phase!=='day';if(panel.hidden)return;
 const advice=Core.getSurvivalAdvice(state),urgent=advice.some(a=>a.severity==='critical'||a.severity==='warning');
 const rows=advice.map(a=>{
  const person=a.characterId||state.characters.find(c=>c.id==='yun'&&c.alive)?.id||state.selectedId;
  const action=a.id==='relief'?'relief':a.actionId?'guide-step':'forecast';
  return '<button class="advice-row '+esc(a.severity)+'" data-action="'+action+'" data-person="'+esc(person)+'" data-category="'+esc(a.category||'survival')+'" data-hint="'+esc(a.description)+'"><span>'+icon(a.severity==='critical'?'alert':a.id==='relief'?'radio':'check')+'</span><div><strong>'+esc(a.title)+'</strong><small>'+esc(a.description)+'</small></div><b>↗</b></button>';
 }).join('');
 panel.innerHTML='<div class="guidance-heading"><span class="eyebrow">'+(urgent?'오늘의 우선순위':'함께 만드는 내일')+'</span><button class="text-button" data-action="forecast">밤 대비 ↗</button></div><div class="advice-list">'+rows+'</div><button class="shelter-integrity" data-action="guide-step" data-person="yun" data-category="build" data-hint="손상된 문은 시설 탭의 은신처 수리로 복구할 수 있습니다."><span>'+icon('shield')+'문 내구도 <strong>'+Math.round(state.shelterIntegrity??100)+'%</strong></span><span class="integrity-track"><i style="width:'+(state.shelterIntegrity??100)+'%"></i></span><small>'+((state.shelterIntegrity??100)<100?'손상 수리 ↗':'습격 뒤에는 손상을 확인하세요')+'</small></button><div class="supply-summary"><span>준비된 식사 <strong>'+state.inventory.meal+'끼</strong></span><span>가용 연료 <strong>'+state.inventory.fuel+'</strong></span></div>';
}
function renderCharacter(){
 const c=survivor();let html=heading('PEOPLE BEFORE SUPPLIES',c.name+' · '+c.role,c.trait+' · 수색 가방 '+c.capacity+'칸');
 html+='<div class="character-detail-stats">'+stat('건강',c.health,'health')+stat('포만',100-c.hunger,'hunger')+stat('기력',100-c.fatigue,'fatigue')+stat('사기',c.morale,'morale')+'</div><p class="care-note">질병 '+Math.round(c.illness)+' / 100 · 질병은 낮을수록 좋습니다. 약품은 질병과 건강, 붕대는 건강을 회복합니다.</p>';
 html+='<h3 class="subheading">동료를 돌보기<span>'+esc(c.name)+'가 치료를 담당합니다</span></h3><div class="care-list">';
 html+=state.characters.filter(t=>t.alive&&t.id!==c.id).map(t=>{
  const busy=!!c.job||state.phase!=='day';
  return '<div class="care-target"><div>'+portrait(t)+'<h3>'+esc(t.name)+'</h3><p>건강 '+Math.round(t.health)+' · 질병 '+Math.round(t.illness)+'</p></div><div class="button-row"><button class="small-button" data-action="care" data-id="'+esc(t.id)+'" data-kind="bandage" '+(busy||t.health>=100||!state.inventory.bandage?'disabled':'')+'>붕대 1 사용</button><button class="small-button" data-action="care" data-id="'+esc(t.id)+'" data-kind="meds" '+(busy||(t.health>=100&&t.illness<=0)||!state.inventory.meds?'disabled':'')+'>약품 1 사용</button></div></div>';
 }).join('');
 html+='</div><p class="panel-hint">'+(c.job?'현재 작업을 마치거나 중단하면 동료를 치료할 수 있습니다.':'치료 도중 중단하면 예약된 물품을 돌려받습니다. 미라가 치료하면 회복량이 늘어납니다.')+'</p>';return html;
}
function renderBarter(){
 const b=ui.barter,q=Core.getBarter(state,b.give,b.receive);
 function column(side,title,source){
  const other=side==='give'?'receive':'give';
  return '<section class="barter-column"><h3>'+title+'</h3><div class="barter-items">'+Object.entries(Core.ITEMS).filter(([id])=>(source[id]||0)>0||(b[side][id]||0)>0).map(([id,item])=>{
   const count=b[side][id]||0,stock=source[id]||0,price=q.prices?.[id]?.[side==='give'?'sell':'buy']??0;
   return '<div class="barter-item '+(count?'selected':'')+'"><span>'+icon(id)+'<b>'+esc(item.name)+'</b><small>보유 '+stock+' · 가치 '+price+'</small></span><div class="quantity-stepper"><button data-action="barter-count" data-id="'+id+'" data-side="'+side+'" data-delta="-1" aria-label="'+title+' '+esc(item.name)+' 줄이기" '+(!count?'disabled':'')+'>−</button><strong>'+count+'</strong><button data-action="barter-count" data-id="'+id+'" data-side="'+side+'" data-delta="1" aria-label="'+title+' '+esc(item.name)+' 늘리기" '+(count>=stock||b[other][id]>0?'disabled':'')+'>+</button></div></div>';
  }).join('')+'</div></section>';
 }
 return '<div class="barter-columns">'+column('give','내가 건넬 물자',state.inventory)+column('receive','가져올 물자',q.stock||{})+'</div><div class="barter-summary"><div><span>제공 가치 <strong>'+q.offerValue+'</strong> / 요구 가치 <strong>'+q.requestValue+'</strong></span><p class="'+(q.ok?'good':'')+'">'+esc(q.ok?'상인이 이 거래를 받아들입니다.':q.reason||'양쪽에서 물자를 골라 주세요.')+'</p></div><div class="button-row"><button class="text-button" data-action="barter-reset">비우기</button><button class="primary-button" data-action="barter-commit" '+(!q.ok?'disabled':'')+'>물자 교환</button></div></div>';
}
function campaignOptions(){
 const definitions=Core.DIFFICULTIES||{standard:{label:'표준',description:'세 사람의 일상을 돌보며 12일을 버팁니다.'},siege:{label:'봉쇄',description:'줄어든 물자와 강해진 습격 속에서 12일을 버팁니다.'}};
 return '<section class="campaign-setup"><h3 class="subheading">생존 환경 선택<span>시작한 뒤에는 바뀌지 않습니다</span></h3><div class="difficulty-options" role="group" aria-label="생존 난이도">'+Object.entries(definitions).map(([id,d])=>'<button class="difficulty-card '+(ui.newCampaign.difficulty===id?'selected':'')+'" data-action="choose-difficulty" data-id="'+esc(id)+'" aria-pressed="'+(ui.newCampaign.difficulty===id)+'"><span>'+icon(id==='siege'?'shield':'lamp')+'<strong>'+esc(d.label)+'</strong>'+(id==='standard'?'<small>첫 생존에 권장</small>':'')+'</span><p>'+esc(d.description)+'</p></button>').join('')+'</div><label class="seed-field">생존기 번호 <span>같은 번호와 난이도로 다시 도전할 수 있습니다</span><input id="campaign-seed" data-input="campaign-seed" type="text" inputmode="numeric" maxlength="10" placeholder="비워 두면 새로운 번호" value="'+esc(ui.newCampaign.seed)+'" autocomplete="off"></label></section>';
}
function renderIntro(){
 return heading('TWELVE NIGHTS. THREE PEOPLE.','마지막 불빛을 지켜 주세요.','12일 뒤 구호 통로가 열립니다. 함께 버틸 사람과 작은 은신처가 있습니다.')+campaignOptions()+'<div class="intro-steps"><section><span>01</span><h3>낮에는 함께 준비</h3><p>인물을 선택하고 조리·휴식·건설을 맡기세요. 다음 작업도 예약할 수 있습니다.</p></section><section><span>02</span><h3>밤에는 한 사람이 수색</h3><p>방어와 침대를 확인한 뒤 출발합니다. 상자를 조사하고 물품을 가방에 담으세요.</p></section><section><span>03</span><h3>살아서 돌아오기</h3><p>소음을 줄이고 문과 어둠을 이용하세요. 주민과 대화할 수도 있습니다. 100초 안에 출입구로 돌아갑니다.</p></section></div><div class="intro-controls"><span>클릭 / 탭 이동</span><span>WASD 이동</span><span>E 상호작용</span><span>Space 일시정지</span></div><footer class="dialog-footer"><p>식사는 자동으로 먹지 않습니다. 필요한 사람에게 직접 배급해 주세요.</p><button class="primary-button" data-action="begin-campaign">첫 아침 시작하기 →</button></footer>';
}
function renderDialog(){
 let html='';
 if(ui.overlay==='planning')html=renderPlanning();
 else if(ui.overlay==='report')html=renderReport();
 else if(ui.overlay==='visitor')html=renderVisitor();
 else if(ui.overlay==='encounter')html=renderEncounter();
 else if(ui.overlay==='relief')html=renderRelief();
 else if(ui.overlay==='help')html=renderHelp();
 else if(ui.overlay==='settings')html=renderSettings();
 else if(ui.overlay==='ending')html=renderEnding();
 else if(ui.overlay==='character')html=renderCharacter();
 else if(ui.overlay==='forecast')html=heading('BEFORE THE NIGHT','밤을 대비하는 시간','아래 값은 추천 역할 배정 기준입니다. 실제 출발 화면에서 역할과 장비를 바꾸면 함께 달라집니다.')+forecastHtml()+'<footer class="dialog-footer"><p>낮에 문을 보강하고 난방용 연료를 남겨 두세요.</p><button class="primary-button" data-action="close-dialog">낮의 준비 계속하기</button></footer>';
 else if(ui.overlay==='intro')html=renderIntro();
 else if(ui.overlay==='restore-dawn')html=heading('ONE MORE CHANCE','아침부터 다시 준비할까요?','현재 진행을 이 생존기의 '+(ui.dawn?.state.day||state.day)+'일째 아침 기록으로 바꿉니다. 필요한 현재 기록은 먼저 내보낼 수 있습니다.')+'<div class="button-row"><button class="secondary-button" data-action="export-save">현재 기록 내보내기</button><button class="primary-button" data-action="confirm-dawn" '+(!ui.dawn?'disabled':'')+'>아침으로 돌아가기</button></div>';
 else if(ui.overlay==='journal')html=heading('THINGS WE REMEMBER','우리가 지나온 날들','아주 작은 일도, 누군가에게는 살아갈 이유였습니다.')+'<div class="journal-list" style="gap:15px">'+renderJournal(true)+'</div>';
 else if(ui.overlay==='confirm-new')html=heading('A NEW BEGINNING','새로운 생존기를 시작할까요?','현재 자동 저장은 새 생존기로 바뀝니다. 필요한 기록을 먼저 내보내세요.')+campaignOptions()+'<footer class="dialog-footer"><button class="secondary-button" data-action="export-save">현재 기록 내보내기</button><button class="primary-button" data-action="begin-campaign">새로 시작하기 →</button></footer>';
 else if(ui.overlay==='evacuate')html=heading('EMERGENCY RETURN','급하게 빠져나갈까요?','출입구까지 이동할 여유가 없다면 긴급 귀환할 수 있습니다. 서둘러 달아나는 동안 부상과 피로가 늘어납니다.')+'<div class="button-row"><button class="secondary-button" data-action="close-dialog">계속 수색</button><button class="primary-button" data-action="force-return">위험을 감수하고 귀환</button></div>';
 $('dialog-content').innerHTML=html;
}

function resetKeys(){Object.keys(keys).forEach(k=>keys[k]=false);pressedPointers.clear();movementPointers.clear();ui.pointerDown=false;}
function syncPhase(){
 const required={planning:'planning',report:'report',ended:'ending'}[state.phase];
 if(required&&(ui.lastPhase!==state.phase||!ui.overlay)){
  if(required==='planning')initPlan();
  openDialog(required);save();
 }
 ui.lastPhase=state.phase;
}
function resolveExpedition(){
 if(!expedition?.done||state.phase!=='expedition')return;
 const result=Core.finishNight(state,Field.expeditionResult(expedition));
 if(!result.ok){state.paused=true;toast(result.reason,'bad');return;}
 cancelDistractionAim(false);expedition=null;ui.pendingInteract=null;resetKeys();forceClose();syncPhase();ui.dirty=true;playSound('good');
}
function resumeNight(){if(state.phase==='expedition'&&expedition&&!ui.overlay)state.paused=false;}
function togglePause(){
 if(botRuntime.isAutoPlayMode()){state.paused=false;ui.dirty=true;return;}
 if(ui.overlay||!['day','expedition'].includes(state.phase))return;
 if(ui.distractionAim){cancelDistractionAim();return;}
 state.paused=!state.paused;resetKeys();ui.dirty=true;save();
}
function changeRole(id,role){
 const p=ui.plan;if(!p||!state.characters.some(c=>c.id===id&&c.alive))return;
 if(role==='scavenge'){
  for(const key of Object.keys(p.roles))if(p.roles[key]==='scavenge')p.roles[key]='sleep';
  if(p.companionId===id)p.companionId=null;
  p.roles[id]='scavenge';p.scavengerId=id;p.locationId=p.locationId||'cottage';
  if(Core.usedSlots(p.loadout)>survivor(id).capacity)p.loadout={};
 }else if(role==='companion'){
  if(!p.scavengerId||p.scavengerId===id){toast('먼저 다른 생존자를 수색자로 지정해 주세요.','bad');return;}
  for(const key of Object.keys(p.roles))if(p.roles[key]==='companion')p.roles[key]='sleep';
  p.roles[id]='companion';p.companionId=id;
 }else{
  p.roles[id]=role;
  if(p.companionId===id)p.companionId=null;
  if(p.scavengerId===id){p.scavengerId=null;p.companionId=null;for(const key of Object.keys(p.roles))if(p.roles[key]==='companion')p.roles[key]='sleep';p.locationId=null;p.loadout={};}
 }
 renderDialog();
}
function startNight(){
 const before=structuredClone(state);
 const result=Core.beginNight(state,ui.plan);
 if(!result.ok){toast(result.reason,'bad');return;}
 if(!state.nightPlan.scavengerId){Core.finishNight(state,{bag:{},events:[]});forceClose();syncPhase();save();return;}
 try{expedition=Field.createExpedition(result.context,state);}catch(error){state=before;expedition=null;toast('수색을 준비하지 못했습니다. 밤 계획을 다시 확인해 주세요.','bad');console.error(error);return;}
 forceClose();resetKeys();ui.sneak=false;ui.pendingInteract=null;state.paused=false;state.selectedId=state.nightPlan.scavengerId;
 notice('상자를 클릭해 다가가세요. E로 살피고 필요한 물자를 담을 수 있습니다.',5);ui.dirty=true;save();
}
function startNewGame(){
 const raw=ui.newCampaign.seed.trim();
 if(raw&&!/^\d{1,10}$/.test(raw)||raw&&Number(raw)>4294967295){toast('생존기 번호는 0부터 4294967295 사이의 정수로 입력하세요.','bad');return;}
 const seed=raw?Number(raw):Date.now()>>>0;
 cancelDistractionAim(false);forceClose();state=Core.createGame(seed,{difficulty:ui.newCampaign.difficulty});expedition=null;ui.plan=null;ui.pendingInteract=null;ui.category='survival';ui.sneak=false;ui.lastError='';ui.encounterId=null;
 resetKeys();
 try{Saves.startCampaign(localStorage,state);}catch{saveAvailable=false;}
 save();render();notice('오늘의 준비를 시작하세요. 필요한 사람에게 식사를 배급하고, 다른 동료에게도 작업을 맡길 수 있습니다.',5);
}

function validateEnvelope(value){
 return Saves.decodeSnapshot(value);
}
function downloadSave(){
 const blob=new Blob([Saves.encodeSnapshot(state,expedition)],{type:'application/json'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='last-light-day-'+state.day+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 toast('저장 파일을 내려받았습니다. 다른 기기에서도 불러올 수 있습니다.','good');
}
function handleAction(button){
 const action=button.dataset.action,id=button.dataset.id;
 if(button.disabled)return;
 if(ui.distractionAim&&!['aim-distraction','toggle-minimap','sound','pause','save-now'].includes(action))cancelDistractionAim();
 if(action==='select-character'){state.selectedId=id;ui.dirty=true;playSound();}
 else if(action==='category'){ui.category=id;ui.dirty=true;}
 else if(action==='relief-person'){state.selectedId=id;renderDialog();ui.dirty=true;}
 else if(action==='relief-action'){
  const result=survivor().job?Core.enqueueAction(state,state.selectedId,id):Core.performAction(state,state.selectedId,id);
  if(resultFeedback(result)){ui.mutedResume=false;closeDialog();notice('구호 연락망 준비를 맡겼습니다. 동료들의 생활도 함께 살펴보세요.');}
 }
 else if(action==='day-action'){resultFeedback(survivor().job?Core.enqueueAction(state,state.selectedId,id):Core.performAction(state,state.selectedId,id));}
 else if(action==='remove-queue'){resultFeedback(Core.removeQueuedAction(state,state.selectedId,Number(button.dataset.index)));}
 else if(action==='care'){
  const r=Core.performCare(state,state.selectedId,id,button.dataset.kind);
  if(resultFeedback(r)){ui.mutedResume=false;closeDialog();notice('치료를 시작했습니다. 완료하면 동료가 회복합니다.');}
 }
 else if(action==='cancel-job'){resultFeedback(Core.cancelJob(state,id));}
 else if(action==='pause')togglePause();
 else if(action==='speed'){const s=Number(button.dataset.speed);if(Number.isFinite(s)&&s>=0.5&&s<=20){state.speed=s;ui.dirty=true;}}
 else if(action==='toggle-auto-sim'){
  const next=!botRuntime.isAutoPlayMode();
  botRuntime.setAutoPlayMode(next);
  if(next){
   if(ui.overlay==='intro')forceClose();
   if(state.phase==='day'||state.phase==='expedition')state.paused=false;
   toast('봇 전용 자동 시뮬레이션을 시작합니다 ('+state.speed+'× 배속).','good');
  }else{
   toast('봇 전용 자동 시뮬레이션을 중지했습니다.','info');
  }
  ui.dirty=true;botUi?.render();
 }
 else if(action==='sound'){
  preferences.sound=!preferences.sound;try{localStorage.setItem(PREF_KEY,JSON.stringify(preferences));}catch{}
  playSound();ui.dirty=true;if(ui.overlay==='settings')renderDialog();
 }
 else if(action==='toggle-minimap'||action==='toggle-motion'){
  const key=action==='toggle-minimap'?'miniMap':'reducedMotion';preferences[key]=!preferences[key];
  try{localStorage.setItem(PREF_KEY,JSON.stringify(preferences));}catch{}
  ui.dirty=true;if(ui.overlay==='settings')renderDialog();
 }
 else if(['help','settings','journal','visitor','confirm-new','evacuate','character','forecast','restore-dawn','relief'].includes(action)){
  if(action==='visitor')ui.barter={give:{},receive:{}};
  if(action==='confirm-new')ui.newCampaign={difficulty:state.difficulty||'standard',seed:''};
  if(action==='forecast')initPlan();
  if(action==='settings'||action==='restore-dawn'){try{ui.dawn=Saves.readDawn(localStorage,state.seed,state.difficulty);}catch{ui.dawn=null;}}
  openDialog(action);
 }
 else if(action==='guide-step'){state.selectedId=state.characters.find(c=>c.id===button.dataset.person&&c.alive)?.id||state.characters.find(c=>c.alive)?.id||state.selectedId;ui.category=button.dataset.category||'survival';notice(button.dataset.hint||'오른쪽 작업 목록에서 행동을 선택하세요.');ui.dirty=true;}
 else if(action==='close-dialog')closeDialog();
 else if(action==='end-day'){if(resultFeedback(Core.endDay(state))){resetKeys();syncPhase();}}
 else if(action==='plan-role')changeRole(id,button.dataset.role);
 else if(action==='plan-location'){ui.plan.locationId=id;renderDialog();}
 else if(action==='loadout'){
  const load=ui.plan.loadout,count=(load[id]||0)+Number(button.dataset.delta);
  if(count<0||count>(state.inventory[id]||0))return;
  const next={...load,[id]:count};if(!count)delete next[id];
  if(Core.usedSlots(next)>survivor(ui.plan.scavengerId).capacity){toast('가방의 빈칸이 부족합니다.','bad');return;}
  ui.plan.loadout=next;renderDialog();
 }
 else if(action==='begin-night')startNight();
 else if(action==='next-day'){
  if(resultFeedback(Core.nextDay(state))){forceClose();ui.plan=null;ui.pendingInteract=null;ui.category='survival';syncPhase();save();}
 }
 else if(action==='interact'&&expedition){resumeNight();ui.pendingInteract=null;resultFeedback(Field.interact(expedition));resolveExpedition();}
 else if(action==='encounter')openEncounter(id);
 else if(action==='encounter-choice'&&expedition){const r=Field.resolveEncounter(expedition,button.dataset.npc,id);if(resultFeedback(r,r.message))renderDialog();}
 else if(action==='dodge')dodgeInDirection();
 else if(action==='aim-distraction')toggleDistractionAim();
 else if(action==='sneak'){ui.sneak=!ui.sneak;ui.dirty=true;}
 else if(action==='attack'&&expedition){resumeNight();ui.pendingInteract=null;resultFeedback(Field.attack(expedition));resolveExpedition();}
 else if(action==='take-loot'&&expedition){resultFeedback(Field.takeLoot(expedition,button.dataset.loot,id,1));}
 else if(action==='take-all'&&expedition){resultFeedback(Field.takeAllLoot(expedition,button.dataset.loot));}
 else if(action==='field-bandage'&&expedition){resumeNight();ui.pendingInteract=null;resultFeedback(Field.useBandage(expedition));}
 else if(action==='toggle-door'&&expedition){resumeNight();ui.pendingInteract=null;resultFeedback(Field.interact(expedition,{type:'door',id}));}
 else if(action==='drop-item'&&expedition){resultFeedback(Field.dropItem(expedition,id,1));}
 else if(action==='close-loot'&&expedition){expedition.activeLootId=null;ui.dirty=true;}
 else if(action==='return-home'&&expedition){
  resumeNight();
  if(Field.getNearby(expedition).exit){resultFeedback(Field.returnHome(expedition));resolveExpedition();}
  else {Field.moveTo(expedition,85,0);ui.pendingInteract={type:'exit'};notice('출입구를 향해 이동합니다. 도착하면 귀환합니다.');}
 }
 else if(action==='force-return'&&expedition){forceClose();resultFeedback(Field.returnHome(expedition,true));resolveExpedition();}
 else if(action==='trade'){
  if(resultFeedback(Core.trade(state,id),'물자를 교환했습니다.'))renderDialog();
 }
 else if(action==='barter-count'){
  const side=button.dataset.side;if(!['give','receive'].includes(side))return;
  const q=Core.getBarter(state,ui.barter.give,ui.barter.receive);
  const limit=(side==='give'?state.inventory:q.stock)?.[id]||0;
  const value=Math.max(0,Math.min(limit,(ui.barter[side][id]||0)+Number(button.dataset.delta)));
  if(value)ui.barter[side][id]=value;else delete ui.barter[side][id];
  renderDialog();
 }
 else if(action==='barter-reset'){ui.barter={give:{},receive:{}};renderDialog();}
 else if(action==='barter-commit'){
  if(resultFeedback(Core.barter(state,ui.barter.give,ui.barter.receive),'선택한 물자를 교환했습니다.')){ui.barter={give:{},receive:{}};renderDialog();}
 }
 else if(action==='visitor-choice'){
  if(resultFeedback(Core.chooseVisitor(state,id))){closeDialog();ui.dirty=true;}
 }
 else if(action==='save-now')save(false);
 else if(action==='export-save')downloadSave();
 else if(action==='import-save')$('save-input').click();
 else if(action==='begin-campaign'||action==='new-game')startNewGame();
 else if(action==='choose-difficulty'&&Core.DIFFICULTIES?.[id]){ui.newCampaign.difficulty=id;renderDialog();}
 else if(action==='confirm-dawn'){
  const restored=Saves.readDawn(localStorage,state.seed,state.difficulty);if(!restored){toast('복구할 아침 기록이 없습니다.','bad');return;}
  forceClose();state=restored.state;expedition=null;state.paused=true;ui.plan=null;ui.pendingInteract=null;ui.category='survival';resetKeys();save();render();toast(state.day+'일째 아침으로 돌아왔습니다.','good');
 }
 ui.dirty=true;
}
document.addEventListener('input',event=>{if(event.target.dataset?.input==='campaign-seed')ui.newCampaign.seed=event.target.value;});
document.addEventListener('click',event=>{
 const button=event.target.closest('[data-action]');if(!button)return;
 try{handleAction(button);}catch(error){console.error(error);toast('동작을 마치지 못했습니다. 저장 기록을 확인해 주세요.','bad');state.paused=true;}
});
dialog.addEventListener('cancel',event=>{event.preventDefault();closeDialog();});
dialog.addEventListener('click',event=>{if(event.target===dialog)closeDialog();});
document.addEventListener('pointerdown',event=>{
 const direction=event.target.closest('[data-move]');
 if(event.target.closest('button')&&!direction)pressedPointers.add(event.pointerId);ui.pointerDown=pressedPointers.size>0;
 if(!direction)return;
 cancelDistractionAim();resumeNight();ui.pendingInteract=null;movementPointers.set(event.pointerId,direction.dataset.move);keys[direction.dataset.move]=true;direction.setPointerCapture(event.pointerId);event.preventDefault();
});
function releasePointer(event){
 pressedPointers.delete(event.pointerId);ui.pointerDown=pressedPointers.size>0;
 const direction=movementPointers.get(event.pointerId);movementPointers.delete(event.pointerId);
 if(direction&&!Array.from(movementPointers.values()).includes(direction))keys[direction]=false;
}
document.addEventListener('pointerup',releasePointer);
document.addEventListener('pointercancel',releasePointer);
document.addEventListener('lostpointercapture',releasePointer);
const movement={a:'left',d:'right',w:'up',s:'down',ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down'};
document.addEventListener('keydown',event=>{
 if(event.target.matches('input,textarea,select'))return;
 const key=event.key.length===1?event.key.toLowerCase():event.key;
 if(ui.overlay)return;
 if(key==='Escape'&&ui.distractionAim){event.preventDefault();cancelDistractionAim();return;}
 if(key===' '){event.preventDefault();if(!event.repeat)togglePause();return;}
 if(!expedition||state.phase!=='expedition')return;
 if(key==='t'&&!event.repeat){event.preventDefault();toggleDistractionAim();return;}
 if(ui.distractionAim&&(movement[key]||['e','f','q','r','b'].includes(key)))cancelDistractionAim();
 if(movement[key]){event.preventDefault();resumeNight();ui.pendingInteract=null;keys[movement[key]]=true;}
 else if(key==='Shift'){keys.sneak=true;}
 else if(key==='e'&&!event.repeat){event.preventDefault();resumeNight();ui.pendingInteract=null;resultFeedback(Field.interact(expedition));resolveExpedition();}
 else if(key==='f'&&!event.repeat){event.preventDefault();resumeNight();ui.pendingInteract=null;resultFeedback(Field.attack(expedition));}
 else if(key==='q'&&!event.repeat){event.preventDefault();dodgeInDirection();}
 else if(key==='r'&&!event.repeat){event.preventDefault();openEncounter();}
 else if(key==='b'&&!event.repeat){event.preventDefault();resumeNight();ui.pendingInteract=null;resultFeedback(Field.useBandage(expedition));}
});
document.addEventListener('keyup',event=>{
 const key=event.key.length===1?event.key.toLowerCase():event.key;
 if(movement[key])keys[movement[key]]=false;
 if(key==='Shift')keys.sneak=false;
});
window.addEventListener('blur',()=>{cancelDistractionAim(false);resetKeys();if(['day','expedition'].includes(state.phase))state.paused=true;ui.dirty=true;save();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelDistractionAim(false);resetKeys();state.paused=true;save();ui.dirty=true;}});
window.addEventListener('beforeunload',()=>save());
$('game-canvas').addEventListener('click',event=>{
 if(ui.overlay)return;
 if(ui.distractionAim&&expedition){throwAt(event.clientX,event.clientY);return;}
 const hit=renderer.hitTest(event.clientX,event.clientY);if(!hit)return;
 if(state.phase==='day'){
  if(hit.type==='character'){const c=state.characters.find(c=>c.id===hit.id);if(c?.alive)state.selectedId=c.id;}
  else if(hit.type==='facility'){
   if(hit.id==='door'&&state.visitor){openDialog('visitor');return;}
   if(hit.id==='radio'){openDialog('relief');return;}
   const facilities={kitchen:['survival','조리와 식사는 생활과 회복에서 맡겨 주세요.'],bed:['survival','선택한 사람에게 휴식을 맡길 수 있습니다.'],water:['survival','물을 모아 식사와 건강을 준비하세요.'],workshop:['craft','도구를 만들거나 시설 탭에서 은신처를 확장하세요.'],heater:['build','난로와 연료로 추운 밤을 준비하세요.'],rubble:['craft','잔해를 치우면 쓸 만한 재료가 나옵니다.'],radio:['build','무전기를 복구하고 구호팀과 연락해 대피를 준비하세요.'],door:['build','문 보강은 방어력을 높입니다. 습격으로 손상됐다면 은신처 수리로 복구하세요.']};
   const info=facilities[hit.id];if(info){ui.category=info[0];notice(info[1]);}
  }
 }else if(expedition){
  if(hit.type==='npc'){openEncounter(hit.id);ui.dirty=true;return;}
  resumeNight();
  if(hit.type==='loot'){
   const loot=expedition.loot.find(l=>l.id===hit.id);if(!loot)return;
   if(Field.getNearby(expedition).loot?.id===loot.id){resultFeedback(Field.interact(expedition,{type:'loot',id:loot.id}));ui.pendingInteract=null;}
   else {Field.moveTo(expedition,loot.x,loot.floor);ui.pendingInteract={type:'loot',id:loot.id};notice(loot.label+' 쪽으로 이동합니다.');}
  }else if(hit.type==='exit'){Field.moveTo(expedition,85,0);ui.pendingInteract={type:'exit'};}
  else if(hit.type==='door'){
   const door=expedition.doors?.find(d=>d.id===hit.id);if(door){
    if(expedition.player.floor===door.floor&&!expedition.player.climb&&Math.abs(expedition.player.x-door.x)<=70){resultFeedback(Field.interact(expedition,{type:'door',id:door.id}));ui.pendingInteract=null;}
    else {Field.moveTo(expedition,door.x,door.floor);ui.pendingInteract={type:'door',id:door.id};}
   }
  }else if(hit.type==='hide'){
   const spot=expedition.hides?.find(h=>h.id===hit.id);if(spot){Field.moveTo(expedition,spot.x,spot.floor);ui.pendingInteract={type:'hide',id:hit.id};}
  }else if(Number.isFinite(hit.x)&&Number.isInteger(hit.floor)){Field.moveTo(expedition,hit.x,hit.floor);ui.pendingInteract=null;}
 }
 ui.dirty=true;
});
$('game-canvas').addEventListener('pointermove',event=>{
 if(ui.distractionAim)ui.aimTarget=renderer.worldPoint?.(event.clientX,event.clientY)||null;
});
$('game-canvas').addEventListener('pointerleave',()=>{if(ui.distractionAim)ui.aimTarget=null;});
$('game-canvas').addEventListener('contextmenu',event=>{if(ui.distractionAim){event.preventDefault();cancelDistractionAim();}});
$('save-input').addEventListener('change',async event=>{
 const file=event.target.files?.[0];if(!file)return;
 try{
  if(file.size>2*1024*1024)throw new Error('저장 파일은 2MB 이하여야 합니다.');
  const next=validateEnvelope(JSON.parse(await file.text()));
  cancelDistractionAim(false);forceClose();state=next.state;expedition=next.expedition;state.paused=true;ui.plan=null;ui.pendingInteract=null;resetKeys();syncPhase();save();render();toast('생존 기록을 불러왔습니다. 재생을 누르면 이어집니다.','good');
 }catch(error){toast(error.message||'저장 파일을 읽을 수 없습니다.','bad');}
 event.target.value='';
});
function pendingInteraction(){
 if(!expedition||!ui.pendingInteract)return;
 const near=Field.getNearby(expedition),p=ui.pendingInteract;
 const target=p.type==='loot'?expedition.loot.find(l=>l.id===p.id):p.type==='hide'?expedition.hides?.find(h=>h.id===p.id):p.type==='door'?expedition.doors?.find(d=>d.id===p.id):null;
 const arrived=target&&expedition.player.floor===target.floor&&!expedition.player.climb&&Math.abs(expedition.player.x-target.x)<=70;
 if(arrived||(p.type==='exit'&&near.exit)){
  ui.pendingInteract=null;
  resultFeedback(p.type==='exit'?Field.returnHome(expedition):Field.interact(expedition,p));
 }
}
let previous=performance.now(),lastUI=0,lastNotice='',autoPhaseAt=0,lastAutoPhase='';
if(typeof document!=='undefined'&&$('playerbot-panel')){
 botUi=createBotUiController({container:$('playerbot-panel'),runtime:botRuntime,getState:()=>state,getExpedition:()=>expedition,onStateChanged:()=>{ui.dirty=true;save();},toast});
}
function stepAutoPlayTransitions(now){
 if(!botRuntime.isAutoPlayMode())return;
 if(state.phase!==lastAutoPhase){lastAutoPhase=state.phase;autoPhaseAt=now;}
 const waitMs=Math.max(120,900/Math.max(1,state.speed||1));
 if(ui.overlay==='intro'){forceClose();state.paused=false;return;}
 if((state.phase==='day'||state.phase==='expedition')&&state.paused){state.paused=false;return;}
 if(state.phase==='planning'&&now-autoPhaseAt>=waitMs){
  const autoPlan=botRuntime.buildAutoNightPlan(state);
  if(autoPlan){ui.plan=autoPlan;startNight();autoPhaseAt=now;}
  return;
 }
 if(state.phase==='report'&&now-autoPhaseAt>=waitMs){
  if(Core.nextDay(state).ok){forceClose();ui.plan=null;ui.pendingInteract=null;ui.category='survival';state.paused=false;syncPhase();save();ui.dirty=true;autoPhaseAt=now;}
  return;
 }
 if(state.phase==='ended'){
  botRuntime.setAutoPlayMode(false);
  toast('AI 시뮬레이션 봇이 12일 캠페인을 완료했습니다!','good');
  ui.dirty=true;botUi?.render();
 }
}
function frame(now){
 const dt=Math.min(.1,Math.max(0,(now-previous)/1000));previous=now;
 try{
  stepAutoPlayTransitions(now);
  if(!ui.overlay){
   if(state.phase==='day'){Core.tickDay(state,dt);botRuntime.step(dt);}
   else if(expedition&&!state.paused){
    const simScale=Number.isFinite(state.speed)&&state.speed>=0.5&&state.speed<=20?state.speed:1;
    const totalSimDt=dt*simScale;
    const subSteps=Math.max(1,Math.ceil(totalSimDt/0.05));
    const subDt=totalSimDt/subSteps;
    for(let s=0;s<subSteps;s++){
     if(!expedition||expedition.done||state.phase!=='expedition')break;
     Field.stepExpedition(expedition,subDt,botRuntime.isAutoPlayMode()?{}:{...keys,sneak:keys.sneak||ui.sneak});
     botRuntime.step(subDt/simScale);
     pendingInteraction();
     resolveExpedition();
    }
   }
  }
  syncPhase();
  const compSlot=expedition?.companion?botRuntime.bots[expedition.companion.id]:null;
  const botOverlay=compSlot?{hfsm_state:compSlot.hfsm_state}:null;
  const botToasts=botRuntime.getActiveToasts(now);
  renderer.render({state,expedition,time:now,selectedId:state.selectedId,distractionAim:ui.distractionAim,aimTarget:ui.aimTarget,miniMap:preferences.miniMap,reducedMotion:preferences.reducedMotion,botOverlay,botToasts});
  if(expedition?.notice&&expedition.notice!==lastNotice){lastNotice=expedition.notice;notice(typeof lastNotice==='string'?lastNotice:lastNotice.text);}
  if(now>ui.noticeUntil)$('scene-notice').classList.remove('show');
  if(ui.dirty||now-lastUI>350){render();botUi?.render();lastUI=now;}
  if(now-ui.lastSave>5000)save();
 }catch(error){if(ui.lastError!==error.message){console.error(error);toast('진행을 잠시 멈췄습니다. 설정에서 아침 기록을 복구할 수 있습니다.','bad');ui.lastError=error.message;}state.paused=true;}
 requestAnimationFrame(frame);
}
syncPhase();render();botUi?.render();save();requestAnimationFrame(frame);
const _urlParams=typeof location!=='undefined'?new URLSearchParams(location.search):null;
const _autoStart=_urlParams&&(_urlParams.get('autostart')==='1'||_urlParams.get('headless')==='1'||_urlParams.get('auto')==='1');
if(_autoStart){
 const _reqSpeed=Math.max(0.5,Math.min(20,Number(_urlParams.get('speed')||20)||20));
 state.speed=_reqSpeed;state.paused=false;
 botRuntime.setAutoPlayMode(true);
 forceClose();render();botUi?.render();
 toast(`무인 자동 시뮬레이션 시작 (${_reqSpeed}×)`,'good');
}else if(ui.loadStatus==='empty'&&state.phase==='day')openDialog('intro');
if(ui.loadMessage)toast(ui.loadMessage,ui.loadStatus==='recovered'?'good':'bad');
if(!_autoStart&&state.day===1&&state.phase==='day'&&state.clock===360)notice('미라에게 조리를, 윤에게 집수기 제작을 맡겨 보세요. ? 버튼에서 게임 방법을 확인할 수 있습니다.',7);
