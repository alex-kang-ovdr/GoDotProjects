/* v14: an explicit, isolated adaptation of selected R3 public-reference rules.
 * Base damage / projectile kinematics / cooldowns / AI / waves are DESIGN values.
 * No original client extraction, official art, live services or payment code.
 */
const MAIN_WEAPONS=REF_BALANCE.mainWeapons;
const refPassiveMap=REFERENCE_DB.maps.passives;
const refWeaponMap=REFERENCE_DB.maps.weapons;
const refSkills=Object.fromEntries(REFERENCE_DB.tables.skills.map(x=>[x.id,x]));
const refRecipeRows=REFERENCE_DB.tables.evolution_recipes.filter(r=>!r.secondary_skill_id||Object.values(refWeaponMap).includes(r.secondary_skill_id));
const refIcons={kunai:'🥷',bat:'🏏',katana:'⚔',shotgun:'💥',revolver:'🔫',guardian:'🛡',rocket:'🚀',lightning:'⚡',molotov:'🔥',drill:'🌀',droneA:'🛸',droneB:'🚁',destroyer:'✦',soccer:'⚽',brick:'🧱',boomerang:'🪃',forcefield:'◎',atk:'💥',speed:'👟',cooldown:'🔋',hp:'♥',magnet:'🧲',heal:'🥤',range:'⛽',duration:'🦾',projectile:'➤',xp:'📜',gold:'🪙',armor:'🦺'};
const refDescriptions={
 kunai:'가까운 적을 자동 조준하는 수리검',bat:'이동 방향으로 휘두르고 일반 적을 밀쳐냅니다',katana:'이동 방향 앞뒤로 관통 검기를 발사합니다',shotgun:'이동 방향으로 산탄 발사 · 적을 향해 돌아서 사격하세요',revolver:'자동 조준 6연발. 탄창 소진 후 재장전',
 guardian:'일정 시간 회전하며 일반 탄환을 차단합니다',rocket:'가까운 적에게 발사 후 광역 폭발',lightning:'가까운 적들에게 순차 낙뢰',molotov:'적의 진입 경로에 지속 화염 지대',drill:'여러 발의 빠른 관통 탄환',droneA:'회전 방사 탄환 · 정밀 유도는 부품 시험 옵션',droneB:'반대 방향 방사 폭격 · A형과 합체',destroyer:'A/B를 소모한 고밀도 폭격 · 1칸 반환',soccer:'적과 비행 범위 경계에서 튕기는 공',brick:'상향으로 벽돌을 투척합니다',boomerang:'전방 투척 후 플레이어에게 돌아옵니다',forcefield:'플레이어 주변에 주기적 범위 피해',
 atk:'공격력',speed:'이동속도',cooldown:'공격 간격 감소',hp:'최대 체력',magnet:'경험치·아이템 흡수 반경',heal:'5초마다 최대 체력 회복',range:'공격 범위',duration:'지속시간',projectile:'투사체 속도',xp:'경험치 획득량',gold:'전투 중 골드 픽업',armor:'받는 피해 감소'
};
for(const k of Object.keys(definitions))delete definitions[k];
for(const [k,id] of Object.entries(refWeaponMap))definitions[k]={name:refSkills[id].label_ko,icon:refIcons[k],desc:refDescriptions[k],kind:'weapon',max:5,hidden:k==='destroyer',main:MAIN_WEAPONS.includes(k),referenceId:id};
for(const [k,id] of Object.entries(refPassiveMap)){
 const p=REFERENCE_DB.tables.passives.find(x=>x.id===id),levels=REFERENCE_DB.tables.passive_levels.filter(x=>x.passive_id===id).sort((a,b)=>a.level-b.level);
 definitions[k]={name:p.label_ko,icon:refIcons[k],desc:`${refDescriptions[k]} · ${k==='heal'?'5초당 ':''}${Math.round(levels[0].total_value*100)}%/레벨`,kind:'passive',max:5,referenceId:id,values:levels.map(x=>x.total_value),sources:p.source_ids};
}
for(const k of Object.keys(weaponData))delete weaponData[k];Object.assign(weaponData,REF_BALANCE.weapons);
for(const k of Object.keys(evoPairs))delete evoPairs[k];for(const k of Object.keys(evolutionNames))delete evolutionNames[k];
const refReverseW=Object.fromEntries(Object.entries(refWeaponMap).map(([k,v])=>[v,k]));
const refReverseP=Object.fromEntries(Object.entries(refPassiveMap).map(([k,v])=>[v,k]));
for(const r of refRecipeRows){const k=r.secondary_skill_id?'destroyer':refReverseW[r.base_skill_id];if(r.required_passive_id)evoPairs[k]=refReverseP[r.required_passive_id];evolutionNames[k]=refSkills[r.result_skill_id].label_ko;}
Object.assign(evolutionDescriptions,{kunai:'고속 자동 추적 연사',bat:'전방 타격 범위·넉백 강화',katana:'강화된 양방향 검기',shotgun:'촘촘한 전방 연사',revolver:'쌍발 자동 사격 · 확대 탄창',guardian:'대기시간 없이 지속 회전 · 일반 탄환 차단',rocket:'대형 미사일·넓은 폭발',lightning:'추가 낙뢰와 연쇄 전격',molotov:'넓은 지속 화염 지대',drill:'자동 추적 관통 화살',soccer:'분산·반사되는 고속 양자 공',brick:'사방으로 발사되는 아령',boomerang:'두 개의 회전 다트',forcefield:'확장 방어막·근처 적 둔화',destroyer:'두 드론 합체 · 액티브 슬롯 하나 반환'});
// This build has fixed-base combat. R3 growth costs remain a reference, not live economy.
heroCatalog.assault.name='기본 생존자';heroCatalog.assault.skill='자동 공격';
chapters[0].name='도시 시험장';chapters[1].name='사막 시험장';chapters[2].name='빙결 시험장';
for(const c of chapters)c.desc='자체 전장 · 적 수치와 보스 패턴은 구현용';
let referenceOptions={duration:300,precision:false,phase:false,maintainer:false};
try{const o=JSON.parse(localStorage.getItem('survivor_reference_options_v14')||'null');if(o){referenceOptions.duration=[300,900].includes(o.duration)?o.duration:300;for(const k of ['precision','phase','maintainer'])referenceOptions[k]=o[k]===true;}}catch(e){}
function saveReferenceOptions(){try{localStorage.setItem('survivor_reference_options_v14',JSON.stringify(referenceOptions));}catch(e){}}
function refRun(){return player?.reference;}
function timelineDuration(){return refRun()?.duration||referenceOptions.duration;}
function passiveValue(k,p=player){const lv=p?.levels[k]||0;return lv>0?(definitions[k]?.values?.[lv-1]||0):0;}
function durationPower(){return 1+passiveValue('duration');}
function projectilePower(){return 1+passiveValue('projectile');}
function pickupRadius(){return REF_BALANCE.pickupRadius*(1+passiveValue('magnet'));}
function forcefieldRadius(){return (48+9*(player?.levels.forcefield||0)+(player?.evolved.forcefield?24:0))*rangePower();}
function guardianVisible(){return !!player?.levels.guardian&&(player.evolved.guardian||refRun()?.guardLeft>0);}
function guardianNodes(){if(!guardianVisible())return [];const lv=player.levels.guardian,n=2+Math.floor(lv/2)+(player.evolved.guardian?3:0),r=(55+lv*7)*rangePower();return Array.from({length:n},(_,i)=>{const a=player.rot+i*TAU/n;return{x:player.x+Math.cos(a)*r,y:player.y+Math.sin(a)*r};});}
baseHP=()=>REF_BALANCE.baseHP;
attackPower=()=>1+passiveValue('atk');
moveSpeed=()=>REF_BALANCE.baseMoveSpeed*(1+passiveValue('speed'));
rangePower=()=>1+passiveValue('range');
weaponDamage=k=>weaponData[k].damage[weaponLevel(k)-1]*attackPower()*(player.evolved[k]&&k!=='destroyer'?1.65:1);
weaponInterval=k=>{
 let cd=weaponData[k].cooldown;
 if(k==='rocket'&&refRun()?.maintainer)cd=Math.max(.1,cd+REFERENCE_DB.tables.tech_effects.find(x=>x.id==='te_006').value);
 if(player.evolved[k])cd*=({kunai:.24,shotgun:.16,revolver:.8,drill:.78,guardian:1,forcefield:.8}[k]||.78);
 return cd*(1-passiveValue('cooldown'));
};
// No prototype-specific dash, heroes, beacons or specialization in this ruleset.
dash=()=>false;castHeroSkill=()=>false;maybeOfferPerk=()=>false;hasPerk=()=>false;decorateElite=e=>e;updateTactics=()=>{};updateTacticalHud=()=>{};updatePerkHud=()=>{};
tickDoctrine=dt=>{for(const e of enemies)e.slow=Math.max(0,(e.slow||0)-dt);};
slowFactor=e=>e.slow>0?.8:1;
function initializeReferenceRun(){
 selectedHero=activeHero='assault';player.reference={...referenceOptions,regenClock:0,guardLeft:0,guardRest:0,goldFraction:0,ammo:REF_BALANCE.revolver.magazine,reload:0,fieldClock:0,main:startingWeapon};
}
function tickReferenceRecovery(dt){
 const r=refRun();if(!r)return;
 r.reload=Math.max(0,r.reload-dt);
 if(player.levels.heal){r.regenClock+=dt;while(r.regenClock>=5){r.regenClock-=5;const healed=Math.min(player.maxHp-player.hp,player.maxHp*passiveValue('heal'));player.hp+=healed;if(healed>0)floatText(player.x,player.y,'+'+healed.toFixed(1),'#b3ffd1');}}
 else r.regenClock=0;
}
function awardPickupGold(base){const r=refRun();r.goldFraction+=base*(1+passiveValue('gold'));const whole=Math.floor(r.goldFraction+1e-9);player.gold+=whole;r.goldFraction=Math.max(0,r.goldFraction-whole);}
const referenceBaseHurt=hurt;
hurt=function(amount,cause='other'){
 if(state!=='playing'||player.inv>0||!Number.isFinite(amount)||amount<=0)return false;
 amount=Math.max(1,amount*(1-passiveValue('armor')));const actual=Math.min(player.hp,amount);recordIncoming(actual,cause);player.hp-=actual;runStats.taken+=actual;player.inv=.65;shake=6;flash=.3;Sound.play('hurt');effect(player.x,player.y,'#ff7a83',10);
 if(player.hp<=0){player.hp=0;finish(false);}return true;
};
gainXp=function(n){if(!Number.isFinite(n)||n<=0||paidRun)return;player.xp+=n*(1+passiveValue('xp'));while(player.xp>=player.need&&player.lv<99){player.xp-=player.need;player.lv++;player.need=nextXp(player.lv);pendingLevels++;}if(player.lv===99)player.xp=Math.min(player.xp,player.need-1);if(pendingLevels&&state==='playing'){pendingLevels--;levelUp();}};
function isEvolutionToken(k){return typeof k==='string'&&k.startsWith('E:');}
function eligibleFor(p){const out=Object.keys(evoPairs).filter(k=>p.levels[k]===5&&p.levels[evoPairs[k]]>=1&&!p.evolved[k]);if(p.levels.droneA===5&&p.levels.droneB===5&&!p.levels.destroyer)out.push('destroyer');return out;}
evolutionEligible=()=>eligibleFor(player);
const originalEvolve=evolveWeapon;
evolveWeapon=function(k){const ok=originalEvolve(k);if(!ok)return false;player.cool[k]=0;if(k==='revolver'){refRun().ammo=REF_BALANCE.revolver.evolvedMagazine;refRun().reload=0;}if(k==='guardian')refRun().guardLeft=0;floatText(player.x,player.y,evolutionNames[k]+'!', '#fff0ac');return true;};
applyUpgrade=function(k){
 if(isEvolutionToken(k))return evolveWeapon(k.slice(2));
 const d=definitions[k];if(!d||d.hidden||(player.levels[k]||0)>=5||(d.main&&k!==startingWeapon))return false;
 if(!player.levels[k]&&owned(d.kind).length>=6)return false;if(player.levels.destroyer&&['droneA','droneB'].includes(k))return false;
 const old=player.maxHp;player.levels[k]=(player.levels[k]||0)+1;
 if(k==='hp'){player.maxHp=baseHP()*(1+passiveValue('hp'));player.hp=Math.min(player.maxHp,player.hp+player.maxHp-old);}
 if(k==='guardian'&&player.levels[k]===1){refRun().guardLeft=(REF_BALANCE.guardian.activeBase+REF_BALANCE.guardian.activePerLevel)*durationPower();refRun().guardRest=0;}
 if(k==='heal'&&player.levels[k]===1)refRun().regenClock=0;
 Sound.play('upgrade');return true;
};
upgradeOptions=function(){
 const w=owned('weapon').length,p=owned('passive').length;
 const pool=Object.keys(definitions).filter(k=>{const d=definitions[k];return !d.hidden&&(!d.main||k===startingWeapon)&&(player.levels[k]||0)<5&&!banished.has(k)&&(!player.levels.destroyer||!['droneA','droneB'].includes(k))&&(player.levels[k]||(d.kind==='weapon'?w:p)<6);});
 const out=[],ev=evolutionEligible();if(ev.length&&Math.random()<.45)out.push('E:'+ev[Math.floor(Math.random()*ev.length)]);
 const weight=k=>(player.levels[k]?2.1:1)+(Object.entries(evoPairs).some(([a,b])=>k===b&&player.levels[a]>=3)?1.4:0);
 while(pool.length&&out.length<3){let dice=Math.random()*pool.reduce((n,k)=>n+weight(k),0),i=0;for(;i<pool.length-1;i++){dice-=weight(pool[i]);if(dice<0)break;}out.push(pool.splice(i,1)[0]);}
 if(!out.length&&ev.length)out.push('E:'+ev[0]);return out;
};
function validReferenceDraft(s){
 const d=s.levelDraft,p=s.player;if(!Array.isArray(d)||d.length<1||d.length>3||new Set(d).size!==d.length)return false;
 return d.every(k=>{if(isEvolutionToken(k))return eligibleFor(p).includes(k.slice(2));const def=definitions[k];return def&&!def.hidden&&(!def.main||k===s.config.startingWeapon)&&(p.levels[k]||0)<5&&!s.banished.includes(k)&&(!p.levels.destroyer||!['droneA','droneB'].includes(k))&&(p.levels[k]||Object.keys(p.levels).filter(x=>definitions[x]?.kind===def.kind).length<6);});
}
function validateReferenceRun(s,err){
 const r=s.player.reference,n=(v,a,b)=>Number.isFinite(v)&&v>=a&&v<=b;
 if(!r||!MAIN_WEAPONS.includes(s.config.startingWeapon)||!s.player.levels[s.config.startingWeapon]||r.main!==s.config.startingWeapon||![300,900].includes(r.duration))err();
 for(const k of ['precision','phase','maintainer'])if(typeof r[k]!=='boolean')err();
 for(const [k,lo,hi] of [['regenClock',0,5],['guardLeft',0,20],['guardRest',0,10],['goldFraction',0,1],['ammo',0,10],['reload',0,4],['fieldClock',-1,2]])if(!n(r[k],lo,hi))err();
 if(!Number.isInteger(r.ammo)||MAIN_WEAPONS.some(k=>k!==r.main&&s.player.levels[k])||s.doctrine.taken.length||s.tactics.casts||s.tactics.beacons.length)err();
 if(s.player.levels.destroyer&&(s.player.levels.droneA||s.player.levels.droneB))err();
 if(s.player.maxHp!==REF_BALANCE.baseHP*(1+passiveValue('hp',s.player)))err();
 for(const b of s.shots){if(b.moveSpeed!==undefined&&!n(b.moveSpeed,0,10000))err();if(b.bounce!==undefined&&!n(b.bounce,0,30))err();if(b.orbit!==undefined&&typeof b.orbit!=='boolean')err();if(b.orbitAngle!==undefined&&!n(b.orbitAngle,-1e6,1e6))err();if(b.bound!==undefined&&(!n(b.bound,1,2000)||!n(b.originX,-1e7,1e9)||!n(b.originY,-1e7,1e9)))err();if(b.repeatTimer!==undefined&&!n(b.repeatTimer,-1,10))err();}
 for(const a of s.areas)if(a.kind==='slash'&&(!n(a.angle,-1e6,1e6)||!n(a.spread,0,TAU)))err();
}
// Directional attacks use the last movement heading, never the 3D camera basis.
projectile=function(kind,x,y,a,speed,dmg,more={}){
 const v=speed*projectilePower();shots.push({kind,x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,moveSpeed:v,r:6,life:2*durationPower(),dmg,source:kind,hit:new Set(),pierce:0,color:weaponData[kind].color,...more});
};
fire=function(kind,lv=weaponLevel(kind)){
 const target=nearest(player.x,player.y,720*rangePower()),ev=!!player.evolved[kind],dmg=weaponDamage(kind),range=rangePower(),duration=durationPower(),face=player.facing;
 const aim=target?Math.atan2(target.y-player.y,target.x-player.x):face;
 if(['kunai','rocket','lightning','revolver'].includes(kind)&&!target)return false;
 if(kind==='kunai'){
  const n=ev?3:lv>=4?2:1;for(let i=0;i<n;i++)projectile(kind,player.x,player.y,aim+(i-(n-1)/2)*.12,470,dmg,{homing:true,pierce:ev?1:0});
 }else if(kind==='bat'){
  const r=(85+lv*10+(ev?35:0))*range,spread=ev?Math.PI*1.6:Math.PI*1.15;areas.push({kind:'slash',x:player.x,y:player.y,r,angle:face,spread,life:.24,max:.24});
  for(const e of [...enemies]){if(e.hp<=0)continue;const dx=e.x-player.x,dy=e.y-player.y,a=Math.atan2(dy,dx),delta=Math.abs(Math.atan2(Math.sin(a-face),Math.cos(a-face)));if(Math.hypot(dx,dy)<=r+e.r&&delta<=spread/2){damage(e,dmg,kind);if(!['boss','elite'].includes(e.type)){const d=Math.max(1,Math.hypot(dx,dy));e.x+=dx/d*30;e.y+=dy/d*30;}}if(paidRun)break;}
 }else if(kind==='katana'){
  for(const dir of [face,face+Math.PI])projectile(kind,player.x,player.y,dir,420,dmg,{r:13+(ev?6:0),pierce:99,life:(.85+lv*.08)*duration});
 }else if(kind==='shotgun'){
  const n=ev?3:5+Math.floor(lv/2);for(let i=0;i<n;i++)projectile(kind,player.x,player.y,face+(i-(n-1)/2)*(ev?.055:.15),650,dmg,{r:4,life:.75*duration,pierce:ev?1:0});
 }else if(kind==='revolver'){
  const r=refRun();if(r.reload>0)return false;if(r.ammo<=0)r.ammo=ev?10:6;
  for(let i=0;i<(ev?2:1);i++)projectile(kind,player.x,player.y,aim+(i===1?.10:0),720,dmg,{r:7,pierce:ev?2:0});
  if(--r.ammo===0)r.reload=REF_BALANCE.revolver.reloadSeconds*(1-passiveValue('cooldown'));
 }else if(kind==='rocket')projectile(kind,player.x,player.y,aim,315,dmg,{r:9,life:3*duration,aoe:(65+lv*13+(ev?75:0))*range});
 else if(kind==='drill'){
  const n=ev?1:Math.min(3,1+Math.floor(lv/2));for(let i=0;i<n;i++)projectile(kind,player.x,player.y,aim+(i-(n-1)/2)*.25,580,dmg,{r:7,life:(ev?3.2:1.8)*duration,pierce:99,homing:ev});
 }else if(kind==='lightning'){
  const n=1+Math.floor(lv/2)+(ev?3:0)+(refRun().phase?REFERENCE_DB.tables.tech_effects.find(x=>x.id==='te_004').value:0);
  const list=enemies.filter(e=>e.hp>0&&Math.hypot(e.x-player.x,e.y-player.y)<700*range).sort((u,v)=>(u.x-player.x)**2+(u.y-player.y)**2-(v.x-player.x)**2-(v.y-player.y)**2).slice(0,n);
  for(const e of list){if(paidRun)break;damage(e,dmg,kind);areas.push({kind:'lightning',x:e.x,y:e.y,r:18,life:.25,max:.25});if(ev){const b=nearest(e.x,e.y,150*range,new Set([e.id]));if(b){damage(b,dmg*.4,kind);areas.push({kind:'link',x:e.x,y:e.y,x2:b.x,y2:b.y,r:8,life:.18,max:.18});}}}
 }else if(kind==='molotov'){
  const x=target?.x??player.x+Math.cos(face)*130,y=target?.y??player.y+Math.sin(face)*130,n=ev?4:1+Math.floor(lv/3);
  for(let i=0;i<n;i++){const a=i*TAU/n;areas.push({kind:'fire',x:x+Math.cos(a)*(i?70:0),y:y+Math.sin(a)*(i?70:0),r:(45+lv*11+(ev?20:0))*range,life:(3+lv*.4)*duration,max:(3+lv*.4)*duration,tick:0,dmg,source:kind});}
 }else if(['droneA','droneB','destroyer'].includes(kind)){
  const d=dronePositions().find(x=>x.kind===kind)||player,n=kind==='destroyer'?5:2+Math.floor(lv/2),homing=refRun().precision;
  const phase=player.rot*(kind==='droneB'?-1:1)+(kind==='droneB'?Math.PI:0);
  for(let i=0;i<n;i++)projectile(kind,d.x,d.y,homing?aim+(i-(n-1)/2)*.16:phase+i*TAU/n,kind==='droneB'?335:440,dmg,{life:1.5*duration,homing,aoe:kind==='destroyer'?35*range:kind==='droneB'?26*range:0,drone:true});
 }else if(kind==='soccer'){
  const n=1+Math.floor(lv/2)+(ev?2:0);for(let i=0;i<n;i++)projectile(kind,player.x,player.y,aim+i*TAU/n,ev?480:360,dmg,{r:10,life:(2.5+lv*.22)*duration,pierce:99,bounce:ev?14:7,repeatTimer:.22,originX:player.x,originY:player.y,bound:260*range});
 }else if(kind==='brick'){
  const n=ev?8:1+Math.floor(lv/2);for(let i=0;i<n;i++)projectile(kind,player.x,player.y,ev?i*TAU/n:-Math.PI/2+(i-(n-1)/2)*.2,ev?370:300,dmg,{r:11,life:1.25*duration,pierce:lv>=4||ev?99:1});
 }else if(kind==='boomerang'){
  const n=ev?2:1;for(let i=0;i<n;i++){const a=i*Math.PI,rad=125*range;projectile(kind,ev?player.x+Math.cos(a)*rad:player.x,ev?player.y+Math.sin(a)*rad:player.y,face,360,dmg,{r:12,life:2.5*duration,pierce:99,returning:!ev,returnAt:1.5*duration,orbit:ev,orbitAngle:a,repeatTimer:.35});}
 }else return false;
 Sound.play(kind==='rocket'?'rocket':kind==='lightning'?'zap':'shot');return true;
};
updateWeapons=function(dt){
 const r=refRun();
 for(const k of owned('weapon')){if(['guardian','forcefield'].includes(k))continue;player.cool[k]=Math.max(-1,(player.cool[k]||0)-dt);if(player.cool[k]<=0)player.cool[k]=fire(k)?weaponInterval(k):.08;if(state!=='playing')return;}
 if(player.levels.guardian){
  if(!player.evolved.guardian){if(r.guardLeft>0){r.guardLeft=Math.max(0,r.guardLeft-dt);if(r.guardLeft===0)r.guardRest=REF_BALANCE.guardian.rest*(1-passiveValue('cooldown'));}else{r.guardRest=Math.max(0,r.guardRest-dt);if(r.guardRest===0)r.guardLeft=(REF_BALANCE.guardian.activeBase+player.levels.guardian*REF_BALANCE.guardian.activePerLevel)*durationPower();}}
  for(const p of guardianNodes())for(const e of queryEnemies(p.x,p.y,p.x,p.y,65))if(e.hp>0&&Math.hypot(e.x-p.x,e.y-p.y)<e.r+14&&(e.guardHit===undefined||elapsed-e.guardHit>=REF_BALANCE.guardian.retargetInterval)){damage(e,weaponDamage('guardian'),'guardian');e.guardHit=elapsed;if(paidRun)return;}
 }
 if(player.levels.forcefield){r.fieldClock-=dt;if(r.fieldClock<=0){r.fieldClock=weaponInterval('forcefield');const radius=forcefieldRadius();for(const e of enemies)if(e.hp>0&&Math.hypot(e.x-player.x,e.y-player.y)<radius+e.r){damage(e,weaponDamage('forcefield'),'forcefield',true);if(player.evolved.forcefield&&e.hp>0)e.slow=.55;if(paidRun)return;}}}
};
updateProjectiles=function(dt){
 for(let i=shots.length-1;i>=0;i--){
  if(state!=='playing')return;const s=shots[i];s.life-=dt;if(s.life<=0){shots.splice(i,1);continue;}
  if(s.repeatTimer!==undefined){s.repeatTimer-=dt;if(s.repeatTimer<=0){s.hit.clear();s.repeatTimer=s.kind==='soccer'?.22:.35;}}
  const ox=s.x,oy=s.y;
  if(s.orbit){s.orbitAngle+=dt*3.2;const r=125*rangePower();s.x=player.x+Math.cos(s.orbitAngle)*r;s.y=player.y+Math.sin(s.orbitAngle)*r;s.vx=(s.x-ox)/dt;s.vy=(s.y-oy)/dt;}
  else{
   if(s.returning&&s.life<(s.returnAt||1.5)){const a=Math.atan2(player.y-s.y,player.x-s.x),speed=s.moveSpeed||360;s.vx+=(Math.cos(a)*speed-s.vx)*Math.min(1,dt*9);s.vy+=(Math.sin(a)*speed-s.vy)*Math.min(1,dt*9);if(Math.hypot(s.x-player.x,s.y-player.y)<22){shots.splice(i,1);continue;}}
   if(s.homing){const t=nearest(s.x,s.y,600,s.hit);if(t){const a=Math.atan2(t.y-s.y,t.x-s.x),v=s.moveSpeed||470;s.vx+=(Math.cos(a)*v-s.vx)*Math.min(1,dt*8);s.vy+=(Math.sin(a)*v-s.vy)*Math.min(1,dt*8);}}
   s.x+=s.vx*dt;s.y+=s.vy*dt;
   if(s.bound){if(Math.abs(s.x-s.originX)>s.bound){s.x=clamp(s.x,s.originX-s.bound,s.originX+s.bound);s.vx*=-1;}if(Math.abs(s.y-s.originY)>s.bound){s.y=clamp(s.y,s.originY-s.bound,s.originY+s.bound);s.vy*=-1;}}
  }
  let remove=false;const list=queryEnemies(ox,oy,s.x,s.y,65).filter(e=>e.hp>0&&!s.hit.has(e.id)&&segmentDistance(e.x,e.y,ox,oy,s.x,s.y)<s.r+e.r).sort((a,b)=>(a.x-ox)**2+(a.y-oy)**2-(b.x-ox)**2-(b.y-oy)**2);
  for(const e of list){if(e.hp<=0)continue;s.hit.add(e.id);if(s.aoe)explosion(e.x,e.y,s.aoe,s.dmg,s.source);else damage(e,s.dmg,s.source);
   if(s.bounce){const a=Math.atan2(s.y-e.y,s.x-e.x)+rand(-.5,.5);s.vx=Math.cos(a)*s.moveSpeed;s.vy=Math.sin(a)*s.moveSpeed;s.bounce--;if(s.bounce===0)remove=true;break;}
   if(s.pierce--<=0){remove=true;break;}if(paidRun)return;
  }
  if(remove)shots.splice(i,1);
 }
 const nodes=guardianNodes();
 for(let i=enemyShots.length-1;i>=0;i--){const s=enemyShots[i];if(s.life<=0){enemyShots.splice(i,1);continue;}const ox=s.x,oy=s.y;s.x+=s.vx*dt;s.y+=s.vy*dt;s.life-=dt;
  // Swept interception occurs before player damage, including high-speed shots.
  if(nodes.some(p=>segmentDistance(p.x,p.y,ox,oy,s.x,s.y)<s.r+18)){s.life=0;effect(s.x,s.y,'#b3f4e5',3);}
  if(s.life>0&&segmentDistance(player.x,player.y,ox,oy,s.x,s.y)<s.r+player.r){hurt(s.dmg,s.cause||'projectile');s.life=0;}
  if(s.life<=0)enemyShots.splice(i,1);if(state!=='playing')return;
 }
 if(shots.length>650)shots.splice(0,shots.length-650);if(enemyShots.length>350)enemyShots.splice(0,enemyShots.length-350);
};
const oldSpawnEnemy=spawnEnemy;
spawnEnemy=function(type,x,y,opts={}){const t=elapsed;elapsed=Math.min(elapsed/timelineDuration(),1)*300;const e=oldSpawnEnemy(type,x,y,opts);elapsed=t;return e;};
spawnBoss=function(final){const a=rand(0,TAU),e=spawnEnemy('boss',player.x+Math.cos(a)*260,player.y+Math.sin(a)*260,{role:final?'final':'mid',hpScale:final?2.5:.6});if(final){enemyShots.length=threats.length=0;for(let i=enemies.length-1;i>=0;i--)if(enemies[i]!==e)enemies.splice(i,1);}toast((final?'최종':'중간')+' 보스 · '+chapters[chapter].boss);return e;};
director=function(dt){
 if(stageEvents.has('disabled'))return;const duration=timelineDuration(),t=elapsed/duration*300;spawnTimer=Math.max(-1,spawnTimer-dt);
 if(elapsed<duration&&spawnTimer<=0&&enemies.length<260){const n=Math.min(8,1+Math.floor(t/38));for(let i=0;i<n&&enemies.length<260;i++){const r=Math.random(),type=t>180&&r<.06?'sniper':t>120&&r<.13?'splitter':t>95&&r<.22?'ranged':t>55&&r<.4?'tank':r<.56?'runner':'grunt';spawnRing(type);}spawnTimer=Math.max(.28,.8-t*.0015);}
 const events=[[.2,'elite1',()=>spawnRing('elite')],[.32,'supply1',supply],[.65,'supply2',supply],[.8,'elite2',()=>spawnRing('elite')],[.91,'supply3',supply],[1,'final',()=>spawnBoss(true)]];
 if(duration===900)events.push([1/3,'mid1',()=>spawnBoss(false)],[2/3,'mid2',()=>spawnBoss(false)]);else events.push([.5,'mid1',()=>spawnBoss(false)]);
 events.sort((a,b)=>a[0]-b[0]);for(const [ratio,id,fn] of events)if(elapsed>=duration*ratio&&!stageEvents.has(id)){stageEvents.add(id);fn();}
};
// Reconstructed/public combo gates, but actual sampling remains explicitly designed.
levelUp=function(restored=null){
 state='level';const opts=restored||upgradeOptions();levelDraft=[...opts];Sound.play('level');
 if(!opts.length){player.hp=Math.min(player.maxHp,player.hp+15);player.gold+=5*(pendingLevels+1);pendingLevels=0;resumePlay();return;}
 show(`<div class="eyebrow">BUILD YOUR SURVIVOR · LV.${player.lv}</div><h1>어떤 힘을 더할까요?</h1><div class="slot-summary">주무기 포함 액티브 ${owned('weapon').length}/6 · 보조 ${owned('passive').length}/6 · 남은 선택 ${pendingLevels+1}</div><div class="cards reference-cards">${opts.map((token,i)=>{const ev=isEvolutionToken(token),k=ev?token.slice(2):token,d=definitions[k];return `<button class="card ${ev?'ref-evo-card':''}" data-skill="${token}"><span class="keycap">${i+1}</span><span class="emoji">${d.icon}</span><b>${ev?evolutionNames[k]:d.name}</b><span class="tag">${ev?'★ 진화 / 합체':(player.levels[k]?'강화':'신규')+' · Lv.'+((player.levels[k]||0)+1)}</span><small>${ev?evolutionDescriptions[k]:d.desc}</small>${!ev&&d.kind==='weapon'?`<span class="pairhint">${evoPairs[k]?'진화: '+definitions[evoPairs[k]].name+(player.levels[evoPairs[k]]?' ✓':''):'A형 Lv.5 + B형 Lv.5'}</span>`:''}</button>`;}).join('')}</div><div class="menu-buttons"><button class="action secondary" id="reroll" ${rerolls<=0?'disabled':''}>다시 뽑기 R · ${rerolls}</button><button class="action secondary" id="saveChoice">선택 보류 · 저장 후 로비</button></div><p class="hint">공개 조합을 적용한 독립 구현 · 후보 확률·공격 수치는 구현용입니다.</p>`);
 $('reroll').onclick=()=>{if(state==='level'&&rerolls>0){rerolls--;levelUp();}};$('saveChoice').onclick=suspendRun;
 document.querySelectorAll('[data-skill]').forEach(b=>b.onclick=()=>{if(state!=='level')return;if(applyUpgrade(b.dataset.skill))resumePlay();});updateHud(true);saveRun();
};
function referenceStatsHTML(){return `<div class="ref-stat-grid"><div><small>공격 배율</small><b>×${attackPower().toFixed(2)}</b></div><div><small>공격 간격</small><b>×${(1-passiveValue('cooldown')).toFixed(2)}</b></div><div><small>경험치</small><b>+${Math.round(passiveValue('xp')*100)}%</b></div><div><small>흡수 반경</small><b>${pickupRadius().toFixed(0)}</b></div><div><small>범위 / 지속시간</small><b>×${rangePower().toFixed(1)} / ×${durationPower().toFixed(1)}</b></div><div><small>탄속 / 피해 감소</small><b>×${projectilePower().toFixed(1)} / ${Math.round(passiveValue('armor')*100)}%</b></div></div>`;}
buildMenu=function(){if(!player||paidRun)return;state='build';show(`<div class="eyebrow">REFERENCE LOADOUT / R3</div><h1>선택이 만드는 빌드.</h1>${referenceStatsHTML()}<div class="build-grid">${['weapon','passive'].map(kind=>`<section><h3>${kind==='weapon'?'액티브 · 장착 무기 포함':'보조'} ${owned(kind).length}/6</h3>${owned(kind).map(k=>`<div class="build-row"><span>${definitions[k].icon}</span><div><b>${player.evolved[k]?evolutionNames[k]:definitions[k].name}</b><small>${player.evolved[k]?'진화 완료':'Lv.'+player.levels[k]}${evoPairs[k]?' · '+definitions[evoPairs[k]].name+(player.levels[evoPairs[k]]?' ✓':' 필요'):''}</small></div></div>`).join('')}</section>`).join('')}</div><h3>무기별 실제 적용 피해</h3>${damageTable()}<p class="hint">이 실행본의 체력 피해 집계입니다. 원작 DPS 실측이 아닙니다.</p><button class="action" id="buildBack">전투 계속하기 · B</button><button class="action secondary" id="saveBuild">저장 후 로비</button>`);$('buildBack').onclick=resumePlay;$('saveBuild').onclick=suspendRun;saveRun();};
guideMenu=function(){state='menu';show(`<div class="eyebrow">REFERENCE CODEX</div><h1>진화 조합 · 구현 범위</h1><p>주무기 1칸을 포함해 액티브 6칸, 보조 6칸입니다. 조건을 만족하면 레벨업·보급 상자의 진화 후보가 됩니다.</p><div class="codex">${Object.entries(evolutionNames).map(([k,name])=>`<div><b>${definitions[k].icon} ${name}</b><small>${k==='destroyer'?'A형 드론 Lv.5 + B형 드론 Lv.5 → 액티브 1칸 반환':definitions[k].name+' Lv.5 + '+definitions[evoPairs[k]].name+' Lv.1 이상'}</small></div>`).join('')}</div><h3>12종 보조</h3><div class="codex">${Object.entries(refPassiveMap).map(([k])=>`<div><b>${definitions[k].icon} ${definitions[k].name}</b><small>${definitions[k].desc}</small></div>`).join('')}</div><p class="warning">R3의 공개 커뮤니티 참조 규칙입니다. 공격 계수·쿨다운·적 HP·전장·보스·드랍·카드 확률은 자체 구현값입니다. SS·신련·탈것·과금은 이 게임에 적용하지 않았습니다.</p><button class="action" id="guideBack">← 로비</button>`);$('guideBack').onclick=menu;};
const oldUpdateHud=updateHud;
updateHud=function(force=false){oldUpdateHud(force);if(!player)return;const duration=timelineDuration();$('wave').textContent=elapsed>=duration?'FINAL · 최종 보스':chapters[chapter].name+' · '+(duration===300?'5분':'15분');$('timelineFill').style.width=clamp(elapsed/duration*100,0,100)+'%';const times=duration===300?[150,300]:[300,600,900],next=times.find(t=>t>elapsed);$('timelineText').textContent=next?fmt(next)+(next===duration?' 최종 보스':' 중간 보스'):'최종 보스 처치';
 $('missionHUD').innerHTML=`<span class="mission-label">REFERENCE / PROTOTYPE</span><b>액티브 ${owned('weapon').length}/6 · 보조 ${owned('passive').length}/6</b><br>${player.levels.guardian?(guardianVisible()?'수호자 가동':'수호자 재전개 '+Math.ceil(refRun().guardRest)+'s'): '조합을 맞추어 진화하세요'}${startingWeapon==='revolver'?'<br>탄창 '+refRun().ammo+(refRun().reload>0?' · 재장전 '+refRun().reload.toFixed(1)+'s':''):''}`;
 const el=$('passiveHUD');if(el)el.innerHTML=owned('passive').map(k=>`<span class="passive-chip" title="${definitions[k].name}">${definitions[k].icon}<small>${player.levels[k]}</small></span>`).join('')+Array.from({length:6-owned('passive').length},()=>'<span class="passive-chip empty">·</span>').join('');
};
const oldDrawOverlay=drawOverlay;
drawOverlay=function(){oldDrawOverlay();if(player&&state!=='menu'&&(renderer3d.mode==='2D'||renderer3d.fallback)){
 ctx.save();ctx.translate(W/2-player.x,H/2-player.y);
 if(player.levels.forcefield){ctx.strokeStyle='#9de9cf';ctx.fillStyle='#83ddba18';ctx.lineWidth=2;ctx.beginPath();ctx.arc(player.x,player.y,forcefieldRadius(),0,TAU);ctx.fill();ctx.stroke();}
 for(const a of areas)if(a.kind==='slash'){ctx.strokeStyle='#d6fae7';ctx.lineWidth=6;ctx.globalAlpha=a.life/a.max;ctx.beginPath();ctx.arc(a.x,a.y,a.r,a.angle-a.spread/2,a.angle+a.spread/2);ctx.stroke();}ctx.restore();ctx.globalAlpha=1;
}};
finish=function(win,reason=''){
 if(paidRun||!player)return;if(profile.settledRuns.includes(runId)){paidRun=true;dropRunSave();menu();return;}checkMissions();paidRun=true;state=win?'win':'dead';clearInputs();
 const credit=player.gold+(win?100*(chapter+1):0);profile.gold+=credit;profile.best=Math.max(profile.best,player.kills);const c=profile.campaign[chapter];c.bestKills=Math.max(c.bestKills,player.kills);
 if(win){profile.wins++;c.clears++;c.stars=Math.max(c.stars,1+(runStats.evolutions>0?1:0)+(player.kills>500?1:0));profile.unlocked=Math.min(3,Math.max(profile.unlocked,chapter+2));}
 profile.settledRuns.push(runId);profile.settledRuns=profile.settledRuns.slice(-64);if(saveProfile())dropRunSave();updateHud(true);Sound.play(win?'win':'hurt');
 show(`<div class="eyebrow">${win?'SURVIVED':'RUN COMPLETE'} / REFERENCE PLAYABLE</div><h1>${win?'살아남았습니다.':reason||'다시, 더 나은 빌드로.'}</h1><p>${chapters[chapter].name} · ${fmt(elapsed)} · Lv.${player.lv} · ${player.kills} 처치</p><div class="reward-grid"><div><small>이번 전투 기록용 크레딧</small><b>+${credit}</b></div><div><small>진화 · 합체</small><b>${runStats.evolutions}회</b></div></div>${referenceStatsHTML()}<details class="damage-details" open><summary>무기별 피해량</summary>${damageTable()}</details>${recapPanel()}<div class="menu-buttons"><button class="action" id="again">다시 도전</button><button class="action secondary" id="resultLobby">로비</button></div><p class="hint">크레딧은 기록용입니다. 원작 장비 경제·결제·후기 성장은 미적용입니다.</p>${!storageAvailable?'<p class="warning">저장 실패 · 설정에서 기록을 백업하세요.</p>':''}`);$('again').onclick=reset;$('resultLobby').onclick=menu;
};
serializeBackup=()=>JSON.stringify({format:'SurvivorReference',version:14,profile},null,2);
parseBackup=function(text){if(typeof text!=='string'||text.length>100000)throw Error('백업 크기가 올바르지 않습니다.');const s=JSON.parse(text);if(s?.format!=='SurvivorReference'||s.version!==14||!s.profile)throw Error('참조 모드 v14 영구 기록만 가져올 수 있습니다. v13 저장은 커스텀 모드에서 여세요.');for(const k of ['gold','attack','hp','armor','wins','runs'])if(!Number.isFinite(s.profile[k])||s.profile[k]<0)throw Error('저장 수치 오류: '+k);return normalizeProfile(s.profile);};
menu=function(){
 state='menu';clearInputs();renderer3d.resetCamera(0,0);show(`<div class="eyebrow">SURVIVOR ARENA / V14 · R3 REFERENCE</div><h1 class="hero-title">움직이고. 조합하고.<br><span>끝까지 살아남으세요.</span></h1><p class="intro">블록 3D 서바이버 · 원작 공개 조합을 연결한 플레이어블<br>주무기 5종 · 전투 액티브 11종 · 보조 12종 · 진화·합체 15개</p><div id="continueSlot"></div><div class="ref-section-title">01 / 출전 주무기 <small>장착 무기가 첫 액티브 슬롯을 차지합니다.</small></div><div class="ref-weapons">${MAIN_WEAPONS.map(k=>`<button class="ref-weapon ${startingWeapon===k?'selected':''}" data-main="${k}" aria-pressed="${startingWeapon===k}"><span>${definitions[k].icon}</span><b>${definitions[k].name}</b><small>${k==='kunai'||k==='revolver'?'자동 조준':'이동 방향 조준'}</small></button>`).join('')}</div><p id="weaponHint" class="ref-weapon-hint"></p><div class="ref-section-title">02 / 전장 설정 <small>전장·웨이브·전투 수치는 자체 재구성</small></div><div class="menu-grid ref-options"><label class="field">전장<select id="chapter">${chapters.map((c,i)=>`<option value="${i}">${c.name}</option>`).join('')}</select></label><label class="field">시간축<select id="runDuration"><option value="300">5분 테스트</option><option value="900">15분 생존</option></select></label><label class="field">난이도<select id="difficulty"><option value="normal">일반</option><option value="hard">도전 · 적 ×1.5</option></select></label></div><details class="ref-tech"><summary>과학 부품 효과 시험 <span>선택 · 획득/등급 성장 미구현</span></summary><label><input type="checkbox" id="techPrecision"> 정밀 유도 · 드론 탄환 추적</label><label><input type="checkbox" id="techPhase"> 위상 변환 · 낙뢰 +2회</label><label><input type="checkbox" id="techMaintainer"> 고성능 유지 · 로켓 기본 간격 −0.5초</label></details><button class="action" id="start">전투 시작 →</button><div class="menu-buttons"><button class="action secondary" id="guide">조합 도감</button><button class="action secondary" id="settings">화면 · 소리 · 저장</button><a class="action secondary" href="custom/index.html" title="ZIP 패키지에서 실행">기존 v13 커스텀 ↗</a></div><div class="ref-meta"><span>${profile.runs}회 출전</span><span>${profile.wins}회 생존</span><span>최고 ${profile.best} 처치</span></div><div class="controls"><span><kbd>WASD</kbd>이동</span><span><kbd>1 · 2 · 3</kbd>강화 선택</span><span><kbd>B</kbd>빌드</span><span><kbd>P</kbd>일시정지</span><span><kbd>V</kbd>2D / 3D</span></div><p class="hint">독립 프로토타입 · 공개 참조 규칙 + 구현용 밸런스 · 원작 전체 복원 아님<br>기존 v13 저장과 완전히 분리됩니다. 커스텀 링크는 ZIP에서만 연결됩니다.</p>${!storageAvailable?'<p class="warning">브라우저 저장소 사용 불가 · 설정에서 JSON 백업을 보관하세요.</p>':''}`);
 const refresh=()=>{$('weaponHint').textContent=definitions[startingWeapon].desc;document.querySelectorAll('[data-main]').forEach(b=>{b.classList.toggle('selected',b.dataset.main===startingWeapon);b.setAttribute('aria-pressed',String(b.dataset.main===startingWeapon));});};
 document.querySelectorAll('[data-main]').forEach(b=>b.onclick=()=>{startingWeapon=b.dataset.main;refresh();});refresh();$('chapter').value=chapter;$('chapter').onchange=e=>chapter=+e.target.value;$('difficulty').value=difficulty;$('difficulty').onchange=e=>difficulty=e.target.value;
 $('runDuration').value=referenceOptions.duration;$('runDuration').onchange=e=>{referenceOptions.duration=+e.target.value;saveReferenceOptions();};
 for(const [id,k] of [['techPrecision','precision'],['techPhase','phase'],['techMaintainer','maintainer']]){$(id).checked=referenceOptions[k];$(id).onchange=e=>{referenceOptions[k]=e.target.checked;saveReferenceOptions();};}
 $('start').onclick=requestNewRun;$('guide').onclick=guideMenu;$('settings').onclick=settingsMenu;renderContinueCard();updateHud(true);
};
const passiveHUD=document.createElement('div');passiveHUD.id='passiveHUD';document.body.appendChild(passiveHUD);
// Rebind the development bridge after replacing rules. Absent outside #test.
if(window.__test)Object.assign(window.__test,{reset,menu,fire,spawnEnemy,spawnBoss,director,updateWeapons,updateProjectiles,applyUpgrade,evolutionEligible,evolveWeapon,upgradeOptions,gainXp,hurt,dash,castHeroSkill,finish,buildMenu,levelUp,guideMenu,updateHud,draw,saveRun,serializeRun,parseRunSave,restoreRun,serializeBackup,parseBackup,weaponDamage,weaponInterval,attackPower,moveSpeed,rangePower,durationPower,projectilePower,pickupRadius,passiveValue,tickReferenceRecovery,awardPickupGold,guardianNodes,guardianVisible,forcefieldRadius,projectile,validReferenceDraft,maybeOfferPerk,decorateElite,MAIN_WEAPONS,referenceOptions,refRecipeRows,REF_BALANCE,REFERENCE_DB});
