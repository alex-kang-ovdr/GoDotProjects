/* Checkpoints are a separate versioned record. Permanent rewards + settled-run IDs
   are written together in one localStorage value, before deleting a checkpoint.
   One active game window per origin is assumed (not a cross-device cloud save). */
const RUN_KEY='survivor_run_v12';
let runId='',runMeta=null,levelDraft=null,chestDraft=null,autosaveClock=0;
let runMemory=null,runSaveOK=true,runSaveError='';
function serializeRun(){
 if(!player||paidRun||!runId||!['playing','paused','build','level','chest','perk'].includes(state))return null;
 return JSON.stringify({format:'SurvivorArenaRun',version:13,id:runId,savedAt:new Date().toISOString(),
  mode:state==='perk'?'perk':state==='level'?'level':state==='chest'?'chest':'playing',config:{chapter,difficulty,startingWeapon,hero:activeHero},
  timers:{elapsed,spawnTimer,bossStage,nextHazard,score,enemyId,pendingLevels,rerolls,banishes,dashCooldown,dashTime,dashVector},
  player,meta:runMeta,runStats,stageEvents:[...stageEvents],missionClaims:[...missionClaims],banished:[...banished],
  enemies:enemies.filter(e=>e.hp>0),shots:shots.map(s=>({...s,hit:[...s.hit]})),gems,areas,enemyShots,
  threats:threats.map(t=>{const {owner,...rest}=t;return {...rest,ownerId:owner?.id||null};}),
  tactics,doctrine,levelDraft,chestDraft});
}
function saveRun(){
 const text=serializeRun();if(!text)return false;
 runMemory=text;autosaveClock=0;
 try{localStorage.setItem(RUN_KEY,text);runSaveOK=true;runSaveError='';return true;}
 catch(e){const first=runSaveOK;runSaveOK=false;runSaveError='브라우저 저장 공간에 기록하지 못했습니다. 이 창을 닫으면 전투가 사라질 수 있습니다.';if(first)toast(runSaveError);return false;}
}
function dropRunSave(){runMemory=null;try{localStorage.removeItem(RUN_KEY);}catch(e){} }
function parseRunSave(text){
 if(typeof text!=='string'||text.length>4_000_000)throw Error('전투 저장 크기가 올바르지 않습니다.');
 const s=JSON.parse(text),err=()=>{throw Error('전투 저장 데이터가 손상되었거나 지원하지 않는 버전입니다.');};
 const own=(obj,k)=>Object.hasOwn(obj,k),num=(n,lo=-1e7,hi=1e9)=>typeof n==='number'&&Number.isFinite(n)&&n>=lo&&n<=hi;
 if(!s||s.format!=='SurvivorArenaRun'||![12,13].includes(s.version)||!/^run_[a-zA-Z0-9_-]{1,90}$/.test(s.id)||!['playing','level','chest','perk'].includes(s.mode))err();
 const c=s.config,t=s.timers,p=s.player;
 if(!c||![0,1,2].includes(c.chapter)||!['normal','hard'].includes(c.difficulty)||!own(heroCatalog,c.hero)||!own(weaponData,c.startingWeapon)||c.startingWeapon==='destroyer')err();
 if(!t||!num(t.elapsed,0,36000)||!num(t.spawnTimer,-10,1e6)||!num(t.nextHazard,0,36050)||!num(t.enemyId,0,1e8)||!num(t.score,0,1e8)||!num(t.bossStage,0,20)||!num(t.pendingLevels,0,99)||!num(t.rerolls,0,3)||!num(t.banishes,0,2)||!num(t.dashCooldown,0,5)||!num(t.dashTime,0,.3)||!t.dashVector||!num(t.dashVector.x,-1,1)||!num(t.dashVector.y,-1,1))err();
 if(!p||!p.levels||!p.evolved||!p.cool||!num(p.x)||!num(p.y)||!num(p.maxHp,1,1e7)||!num(p.hp,.000001,p.maxHp)||!num(p.r,1,50)||!num(p.lv,1,99)||!num(p.need,1,1e7)||!num(p.xp,0,1e9)||!num(p.gold,0,1e9)||!num(p.kills,0,1e8)||!num(p.inv,0,36000)||!num(p.rot,0,1e9)||!num(p.anim,0,1e9)||!num(p.facing,-1e9,1e9)||!num(p.visualFacing,-1e9,1e9))err();
 for(const [k,n] of Object.entries(p.levels))if(!own(definitions,k)||!Number.isInteger(n)||n<1||n>5)err();
 if(!Object.keys(p.levels).length||['weapon','passive'].some(kind=>Object.keys(p.levels).filter(k=>definitions[k].kind===kind).length>6))err();
 for(const [k,v] of Object.entries(p.evolved))if(!own(weaponData,k)||typeof v!=='boolean'||!p.levels[k]||p.levels[k]!==5)err();
 for(const [k,v] of Object.entries(p.cool))if(!own(weaponData,k)||!num(v,-10,100))err();
 const sources=[...Object.keys(weaponData),'turret','hero_burst','bomb','other','dash_pulse','perk_blast'];
 if(!s.runStats||!s.runStats.byWeapon)err();
 for(const k of ['damage','taken','chests','evolutions','elites','missionGold','bossPatterns'])if(!num(s.runStats[k],0,1e14))err();
 for(const [k,v] of Object.entries(s.runStats.byWeapon))if(!sources.includes(k)||!num(v,0,1e14))err();
 const list=(name,max)=>{if(!Array.isArray(s[name])||s[name].length>max)err();return s[name];};
 const color=v=>v===undefined||/^#[0-9a-fA-F]{6}$/.test(v),xy=e=>e&&num(e.x)&&num(e.y),integer=n=>Number.isInteger(n)&&n>=0;
 const ids=new Set();
 for(const e of list('enemies',600)){
  if(!xy(e)||!own(enemyData,e.type)||!integer(e.id)||ids.has(e.id)||e.id>t.enemyId||!num(e.hp,.000001,1e10)||!num(e.max,e.hp,1e10)||!num(e.r,1,60)||!num(e.speed,0,2000)||!num(e.dmg,0,1e8)||!num(e.xp,0,1e6)||!num(e.age,0,36000)||!num(e.seed,0,10)||!color(e.color)||!num(e.attack,-36000,36000)||!num(e.busy,0,100)||!num(e.skillTimer,-36000,36000)||!num(e.charging,0,10)||!num(e.hit,0,10))err();
  if(e.stun!==undefined&&!num(e.stun,0,10))err();
  if(e.slow!==undefined&&!num(e.slow,0,1.5))err();
  if(e.affix!==undefined&&(!Object.hasOwn(eliteAffixes,e.affix)||e.type!=='elite'||!num(e.wardMax,0,1e10)||!num(e.ward,0,e.wardMax)||!num(e.affixClock,0,5.5)))err();
  if(e.charging>0&&(!e.chargeFrom||!xy(e.chargeFrom)||!xy(e.chargeTo)||!num(e.chargeTotal,.01,10)))err();
  ids.add(e.id);
 }
 for(const b of list('shots',850))if(!xy(b)||!num(b.vx,-10000,10000)||!num(b.vy,-10000,10000)||!num(b.r,0,100)||!num(b.dmg,0,1e10)||!num(b.life,-1,60)||!Array.isArray(b.hit)||b.hit.length>600||!b.hit.every(integer)||!sources.includes(b.source)||!['turret',...Object.keys(weaponData)].includes(b.kind)||!color(b.color))err();
 for(const b of list('enemyShots',600))if(!xy(b)||!num(b.vx,-10000,10000)||!num(b.vy,-10000,10000)||!num(b.life,-1,60)||!num(b.r,0,100)||!num(b.dmg,0,1e10)||!color(b.color))err();
 for(const g of list('gems',5000))if(!xy(g)||!num(g.r,1,30)||!num(g.val,0,1e8)||(g.heal!==undefined&&!num(g.heal,0,1e7)))err();
 for(const a of list('areas',300))if(!xy(a)||!['fire','blast','lightning','link','healpulse','heroPulse'].includes(a.kind)||!num(a.r,0,3000)||!num(a.life,-1,60)||!num(a.max,.001,60)||(a.kind==='link'&&(!num(a.x2)||!num(a.y2)))||(a.kind==='fire'&&(!num(a.dmg,0,1e10)||!num(a.tick,-1,60))))err();
 for(const h of list('threats',200)){
  if(!xy(h)||!['line','circle','ring'].includes(h.shape)||!['charge','shock','mortar','summon','laser','ice','sniper','zone','elitePulse'].includes(h.kind)||!num(h.age,0,120)||!num(h.warn,0,60)||!num(h.duration,.001,60)||!num(h.damage,0,1e10)||!num(h.r,0,2000)||!num(h.width,0,500)||!color(h.color))err();
  if(h.shape==='line'&&(!num(h.x2)||!num(h.y2)))err();
  if(h.ownerId!==null&&!integer(h.ownerId))err();
 }
 for(const k of ['stageEvents','missionClaims','banished'])if(!Array.isArray(s[k])||s[k].length>80||s[k].some(x=>typeof x!=='string'||x.length>50))err();
 if(s.banished.some(k=>!own(definitions,k))||s.missionClaims.some(k=>!missions.some(m=>m.id===k)))err();
 const q=s.tactics;
 if(!q||!num(q.cooldown,0,30)||!integer(q.casts)||!num(q.completed,0,20)||!num(q.parts,0,40)||!Array.isArray(q.turrets)||q.turrets.length>4||!Array.isArray(q.fields)||q.fields.length>4||!Array.isArray(q.beacons)||q.beacons.length>20)err();
 for(const b of q.beacons)if(!xy(b)||typeof b.id!=='string'||!/^[a-zA-Z0-9_]{1,40}$/.test(b.id)||!['active','complete','expired'].includes(b.status)||!num(b.r,1,200)||!num(b.goal,1,60)||!num(b.progress,0,b.goal)||!num(b.expires,0,36100)||!num(b.completedAt,0,36000)||typeof b.engaged!=='boolean'||typeof b.contested!=='boolean')err();
 for(const a of [...q.turrets,...q.fields])if(!xy(a)||!num(a.life,0,15)||!num(a.max,1,15))err();
 for(const a of q.turrets)if(!num(a.cool,-1,5)||!num(a.dmg,0,1e9)||!num(a.yaw,-1e9,1e9))err();
 for(const a of q.fields)if(!num(a.r,1,500))err();
 if(s.mode==='level'&&(!Array.isArray(s.levelDraft)||s.levelDraft.length<1||s.levelDraft.length>3||new Set(s.levelDraft).size!==s.levelDraft.length||s.levelDraft.some(k=>!own(definitions,k)||definitions[k].hidden||(p.levels[k]||0)>=5||s.banished.includes(k)||(!p.levels[k]&&Object.keys(p.levels).filter(x=>definitions[x].kind===definitions[k].kind).length>=6))))err();
 if(s.mode==='chest'){
  const d=s.chestDraft;if(!d||!Array.isArray(d.eligible)||d.eligible.length>7||d.eligible.some(k=>!own(evolutionNames,k))||!num(d.reward,0,3000)||(d.eligible.length&&!d.eligible.includes(d.chosen))||(d.up!==null&&(!own(weaponData,d.up)||(p.levels[d.up]||0)>=5||!p.levels[d.up])))err();
  for(const k of d.eligible)if(k==='destroyer'?(p.levels.droneA!==5||p.levels.droneB!==5||p.levels.destroyer):(p.levels[k]!==5||!p.levels[evoPairs[k]]||p.evolved[k]))err();
 }
 validateDoctrine(s,err);if(s.version===12&&s.mode==='perk')err();
 if(!s.meta||s.meta.schema!==12)err();s.meta=normalizeProfile(s.meta);return s;
}
function readRunSave(){
 let text=null;try{text=localStorage.getItem(RUN_KEY);}catch(e){text=runMemory;}
 if(!text)return null;
 try{const s=parseRunSave(text);if(profile.settledRuns.includes(s.id)){dropRunSave();return null;}return s;}
 catch(e){runSaveError='이어하기 데이터를 읽을 수 없습니다. 새 전투를 시작하거나 영구 기록을 백업하세요.';return null;}
}
function restoreRun(snapshot=readRunSave()){
 if(!snapshot)return false;
 let s;try{s=parseRunSave(typeof snapshot==='string'?snapshot:JSON.stringify(snapshot));}catch(e){toast(e.message);return false;}
 if(profile.settledRuns.includes(s.id)){dropRunSave();toast('이미 정산된 전투입니다.');return false;}
 // Validation above completes before any live state is changed.
 runId=s.id;runMeta=s.meta;activeHero=s.config.hero;chapter=s.config.chapter;difficulty=s.config.difficulty;startingWeapon=s.config.startingWeapon;
 ({elapsed,spawnTimer,bossStage,nextHazard,score,enemyId,pendingLevels,rerolls,banishes,dashCooldown,dashTime,dashVector}=s.timers);
 player=s.player;runStats=s.runStats;tactics=s.tactics;doctrine=s.doctrine;paidRun=false;flash=shake=hudTimer=autosaveClock=0;simAccumulator=0;
 for(const [dest,src] of [[enemies,s.enemies],[shots,s.shots],[gems,s.gems],[areas,s.areas],[enemyShots,s.enemyShots]]){dest.length=0;dest.push(...src);}
 for(const b of shots)b.hit=new Set(b.hit);
 threats.length=0;const owners=new Map(enemies.map(e=>[e.id,e]));
 for(const t of s.threats){const {ownerId,...rest}=t;if(ownerId&&!owners.has(ownerId))continue;threats.push({...rest,owner:owners.get(ownerId)});}
 particles.length=texts.length=hazards.length=0;
 stageEvents=new Set(s.stageEvents);missionClaims=new Set(s.missionClaims);banished=new Set(s.banished);levelDraft=s.levelDraft;chestDraft=s.chestDraft;
 clearInputs();rebuildGrid();renderer3d.resetCamera(player.x,player.y);state='playing';
 if(s.mode==='perk')perkMenu();else if(s.mode==='level')levelUp(levelDraft);else if(s.mode==='chest')openChest(chestDraft);else{
  state='paused';show(`<div class="eyebrow">CHECKPOINT RESTORED</div><h1>전투를 이어갈 준비 완료.</h1><p>${chapters[chapter].name} · ${fmt(elapsed)} · ${heroCatalog[activeHero].name}<br>위치·체력·쿨다운·적·보급·거점 진행을 복원했습니다.<br>아래 버튼을 누를 때까지 전투는 멈춰 있습니다.</p><button class="action" id="resume">전투 계속하기 →</button><button class="action secondary" id="suspendRun">로비</button>`);
  $('resume').onclick=resumePlay;$('suspendRun').onclick=suspendRun;
 }
 updateHud(true);return true;
}
function suspendRun(){
 if(!saveRun()){toast(runSaveError);return false;}
 Sound.suspend();clearInputs();menu();return true;
}
function renderContinueCard(){
 const el=$('continueSlot');if(!el)return;const s=readRunSave();
 if(!s){el.innerHTML=runSaveError?'<p class="warning">'+runSaveError+'</p>':'';return;}
 el.innerHTML=`<div class="continue-card"><div><span class="eyebrow">SAVED RUN</span><b>${chapters[s.config.chapter].name} · ${fmt(s.timers.elapsed)}</b><small>${heroCatalog[s.config.hero].name} · Lv.${s.player.lv} · ${s.player.kills} 처치</small></div><button class="action" id="continueRun">이어하기 →</button></div>`;
 $('continueRun').onclick=()=>restoreRun();
}
function requestNewRun(){
 if(!readRunSave()){dropRunSave();reset();return;}
 state='menu';show(`<div class="eyebrow">NEW RUN</div><h1>저장된 전투가 있습니다.</h1><p>새로 시작하면 미정산 골드와 진행 중인 전투가 삭제됩니다.<br>기존 영구 성장과 장비는 유지됩니다.</p><button class="action" id="keepSavedRun">기존 전투 이어하기</button><button class="action secondary" id="replaceSavedRun">포기하고 새로 시작</button><button class="action secondary" id="cancelNewRun">취소</button>`);
 $('keepSavedRun').onclick=()=>restoreRun();$('replaceSavedRun').onclick=()=>{dropRunSave();reset();};$('cancelNewRun').onclick=menu;
}
