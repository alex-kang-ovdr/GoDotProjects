/* Single-authority offline simulation. No DOM, timers, or renderer mutation in this module. */
(function(root){
'use strict';
const C=typeof module!=='undefined'&&module.exports?require('./core.js'):CryptCore;
const R=typeof module!=='undefined'&&module.exports?require('./rules.js'):CryptRules;
const{V,clamp,lerp,rng,angleDelta,yawAxes,localPoint,segmentSphere,segmentOBB,wallHit,lineClear,findPath,free,TILE,N,generateDungeon,Inventory,makeItem,PROFILES,bladePose,attackPhase}=C;
const ENEMIES={
 skeleton:{name:'묘지의 검사',hp:74,speed:1.55,damage:15,windup:.70,active:.32,recovery:.85,scale:1,range:2.15},
 archer:{name:'잿빛 궁수',hp:57,speed:1.15,damage:13,windup:1.0,active:.12,recovery:1.2,scale:1,range:10},
 guardian:{name:'철갑 수호자',hp:130,speed:1.05,damage:25,windup:.98,active:.38,recovery:1.1,scale:1.12,range:2.45},
 warden:{name:'몰락한 지하 군주',hp:620,speed:.95,damage:32,windup:1.05,active:.42,recovery:1.1,scale:1.52,range:3.2}
};
class Game{
 constructor(onEvent=()=>{}){this.onEvent=onEvent;this.reset('ASHEN-13','normal',false);this.running=false}
 emit(type,data={}){this.onEvent({type,...data})}
 reset(seed,difficulty='normal',training=false,options={}){
  this.seed=String(seed);this.difficulty=difficulty;this.training=training;this.cheated=false;this.god=false;this.aiFrozen=false;this.random=rng(seed+'game');this.map=generateDungeon(seed,training);this.time=0;this.remaining=900;this.running=true;this.paused=false;this.ended=false;this.result=null;this.mode='melee';this.combo=0;this.comboReset=0;
  this.classId=R.classes[options.classId]?options.classId:'fighter';this.classDef=R.classes[this.classId];this.runId=options.runId||null;this.weaponSetIndex=0;this.selectedUtility=null;this.selectedSpellId=null;this.mode='melee';this.ammo={};this.restElapsed=0;
  this.inventory=new Inventory();this.equipment={weapon:null,secondary:null,shield:null,armor:null,trinket:null};
  for(const slot of Object.keys(this.equipment)){
   const raw=options.equipment?.[slot],candidate=C.hydrateItem(raw);
   if(candidate&&C.canEquipItem(candidate,this.classId,slot))this.equipment[slot]=candidate;
   else if(this.classDef[slot]){const item=makeItem(this.classDef[slot]);item.supplied=true;item.state='Supplied';item.value=0;this.equipment[slot]=item}
  }
  if(!this.equipment.weapon){const item=makeItem(this.classDef.weapon);Object.assign(item,{supplied:true,state:'Supplied',value:0});this.equipment.weapon=item}
  for(const raw of options.items||[]){const item=C.hydrateItem(raw);if(item)this.inventory.add(item)}
  const skillState={};for(const id of this.classDef.skills)skillState[id]={cooldown:0,remaining:0,charges:R.skills[id].charges??null};
  this.player={x:this.map.spawn.x,z:this.map.spawn.z,jump:0,vy:0,yaw:0,pitch:0,hp:this.classDef.maxHealth,maxHp:this.classDef.maxHealth,recoverableHp:0,gold:0,potions:2,arrows:0,reserve:24,guard:false,guardAt:-100,guardReleasedAt:-100,blockRecovery:0,stagger:0,attack:null,shotCooldown:0,moveAmount:0,walkPhase:0,crouching:false,sheathed:false,resting:false,walking:false,primaryHeld:false,secondaryHeld:false,cast:null,draw:null,backStep:0,backStepDir:[0,0],skills:skillState,charges:Object.fromEntries(Object.values(R.spells).map(sp=>[sp.id,sp.charges])),potionEffect:0,secondWindEffect:0};
  for(const item of [this.equipment.weapon,this.equipment.secondary])if(item?.quiver)this.ammo[item.instanceId]=item.quiver;
  this.syncWeapon();
  this.enemies=[];this.containers=[];this.projectiles=[];this.effects=[];this.numbers=[];this.explored=new Set();this.visible=new Set();this.action=null;this.openContainer=null;this.boss=null;this.uid=0;this.fogTimer=0;
  this.stats={swings:0,hits:0,headshots:0,damage:0,kills:0,blocks:0,parries:0,dodges:0,wallHits:0,shots:0,searchCancels:0,searches:0,transfers:0,paths:0,bossAttacks:0,damageTaken:0};
  const s=this.player;
  if(!training){const path=findPath(this.map,s.x,s.z,this.map.exit.x,this.map.exit.z),next=path.find(q=>Math.hypot(q[0]-s.x,q[1]-s.z)>.4);if(next)s.yaw=Math.atan2(next[0]-s.x,-(next[1]-s.z))}
  const facing=yawAxes(s.yaw),chestPos=localPoint([s.x,0,s.z],facing,[1.15,0,1.6]);
  this.addContainer(chestPos[0],chestPos[2],'보급품 상자',['dagger','axe','leather','potion'],8,false);
  if(training){this.spawnEnemy('skeleton',s.x,s.z-5);this.spawnEnemy('guardian',s.x-5,s.z-7);this.spawnEnemy('archer',s.x+5,s.z-9)}else{
   for(let i=1;i<this.map.rooms.length;i++){
    const r=this.map.rooms[i],cx=(r.cx+.5)*TILE,cz=(r.cz+.5)*TILE;
    for(let k=0;k<2+(i%3===0?1:0);k++){const x=cx+(k-1)*1.6,z=cz+1.5;let type=k===1?'archer':i%3===0?'guardian':'skeleton';if(free(this.map,x,z,.35)&&Math.hypot(x-s.x,z-s.z)>7)this.spawnEnemy(type,x,z)}
    this.addContainer((r.x+1)*TILE,(r.z+1)*TILE,i%2?'잊힌 보물 상자':'철제 금고',this.loot(i>3?3:2),15+Math.floor(this.random()*25),false,i>3);
   }
   const r=this.map.bossRoom;this.boss=this.spawnEnemy('warden',(r.cx-.6)*TILE,(r.cz+.5)*TILE);
  }
  this.reveal();this.emit('reset');
 }
 loot(count){const ids=['silver','gem','relic','potion','arrows','steelSword','plate','amulet'];return Array.from({length:count},()=>ids[Math.floor(this.random()*ids.length)])}
 spawnEnemy(type,x,z){const d=ENEMIES[type],mult=this.difficulty==='hard'?1.35:this.difficulty==='casual'?.70:1,e={id:'e'+(++this.uid),type,...d,x,z,home:[x,z],hp:Math.ceil(d.hp*mult),maxHp:Math.ceil(d.hp*mult),yaw:Math.PI,state:'idle',stateTime:0,attack:null,cooldown:1,path:[],repath:0,memory:0,lastKnown:[x,z],walk:0,speedNow:0,stagger:0,hitFlash:0,deathTime:0,attackCount:0,phase:1};this.enemies.push(e);return e}
 addContainer(x,z,name,ids=[],gold=0,searched=false,rare=false){const c={id:'c'+(++this.uid),x,z,name,items:ids.map(id=>typeof id==='string'?makeItem(id):id),gold,searched,rare,corpse:false};this.containers.push(c);return c}
 get maxHealth(){return this.classDef.maxHealth}
 get maxMana(){return 0} // Legacy query only: the v15 rules have no mana pool.
 get activeWeapon(){return this.equipment[this.weaponSetIndex===1?'secondary':'weapon']||this.equipment.weapon}
 get profileId(){return this.activeWeapon?.profile||'sword'}
 get armor(){return this.equipment.armor?.armor||0}
 get currentSpell(){return R.spells[this.selectedSpellId]||null}
 getEye(){return[this.player.x,(this.player.crouching?R.movement.crouchEye:R.movement.standingEye)+this.player.jump,this.player.z]}
 canAct(){return this.running&&!this.paused&&!this.ended&&this.player.stagger<=0}
 canEquip(item,slot){return C.canEquipItem(item,this.classId,slot)}
 syncWeapon(){const w=this.activeWeapon;this.mode=this.selectedUtility!==null?'utility':['bow','crossbow'].includes(w?.weaponKind)?'bow':w?.weaponKind==='staff'?'magic':'melee';this.player.arrows=w?.quiver?(this.ammo[w.instanceId]??0):0}
 skillInfo(){return this.classDef.skills.map((id,i)=>{const def=R.skills[id],state=this.player.skills[id];return{id,name:def.name,key:i===0?'Q':'E',charges:state.charges,maxCharges:def.charges??null,cooldown:state.cooldown,remaining:state.remaining,active:state.remaining>0||(id==='meditation'&&this.action?.kind==='meditate')}})}
 spellInfo(){return Object.values(R.spells).map(sp=>({...sp,remaining:this.player.charges[sp.id],selected:this.selectedSpellId===sp.id}))}
 selectSpell(value){if(this.classId!=='wizard')return false;const id=typeof value==='number'?Object.keys(R.spells)[value]:value;if(!R.spells[id])return false;this.player.cast=null;this.selectedSpellId=id;this.emit('notice',{text:R.spells[id].name+' 선택 · 지팡이 우클릭 유지 후 놓기'});return true}
 selectWeaponSet(index){if(![0,1].includes(index)||!this.equipment[index?'secondary':'weapon']||!this.canAct()||this.player.attack)return false;this.cancelInputs();this.cancelAction();this.setResting(false);this.player.sheathed=false;this.selectedUtility=null;this.weaponSetIndex=index;this.syncWeapon();this.emit('mode',{mode:this.mode});return true}
 selectUtility(index){if(![0,1].includes(index)||!this.canAct()||this.player.attack)return false;this.cancelInputs();this.cancelAction();this.setResting(false);this.player.sheathed=false;this.selectedUtility=index;this.syncWeapon();this.emit('mode',{mode:this.mode});return true}
 changeMode(mode){if(mode==='melee'||mode==='bow'||mode==='magic'){const kind=mode==='melee'?['melee']:mode==='bow'?['bow','crossbow']:['staff'];const i=[this.equipment.weapon,this.equipment.secondary].findIndex(it=>kind.includes(it?.weaponKind));return i<0?false:this.selectWeaponSet(i)}return false}
 toggleSheath(){if(!this.canAct()||this.player.attack)return false;this.cancelInputs();this.cancelAction();this.setResting(false);this.player.sheathed=!this.player.sheathed;return true}
 setResting(on){this.player.resting=!!on;this.restElapsed=0}
 toggleRest(){if(!this.canAct()||this.player.attack)return false;const resting=!this.player.resting;this.cancelInputs();this.cancelAction();this.setResting(resting);if(resting)this.player.sheathed=true;return true}
 cancelInputs(){const p=this.player;p.primaryHeld=false;p.secondaryHeld=false;p.cast=null;p.draw=null;this.setGuard(false)}
 useSkill(slot){if(!this.canAct())return false;const id=this.classDef.skills[slot],def=R.skills[id],st=this.player.skills[id];if(!def)return false;if(id==='spellMemory'){this.emit('spellMenu');return true}if(st.cooldown>0||st.charges===0){this.emit('notice',{text:st.charges===0?'사용 횟수가 없습니다':'재사용 대기 중'});return false}if(this.player.attack||this.action)return false;this.cancelInputs();this.setResting(false);
  if(id==='sprint'){st.cooldown=def.cooldown;st.remaining=def.duration}
  else if(id==='secondWind'){if(this.player.hp>=this.maxHealth)return false;st.charges--;st.remaining=def.duration;this.player.secondWindEffect=def.duration}
  else if(id==='backStep'){st.cooldown=def.cooldown;st.remaining=def.duration;this.player.backStep=def.duration;const f=yawAxes(this.player.yaw)[2];this.player.backStepDir=[-f[0],-f[2]]}
  else if(id==='fieldRation'){if(this.player.hp>=this.maxHealth)return false;this.action={kind:'ration',t:0,duration:def.useTime,start:[this.player.x,this.player.z]}}
  else if(id==='meditation'){st.cooldown=def.cooldown;this.setResting(true);this.player.sheathed=true;this.action={kind:'meditate',t:0,duration:def.duration,recharge:0,start:[this.player.x,this.player.z]}}
  this.emit('notice',{text:def.name});return true;
 }
 getGuardKind(){if(!this.player.guard||this.player.sheathed||this.selectedUtility!==null)return null;return this.activeWeapon?.hands===1&&this.equipment.shield?'shield':'weapon'}
 setGuard(on){const p=this.player,allowed=this.selectedUtility===null&&!p.sheathed&&!p.attack&&!p.cast&&!p.draw&&!this.action&&!p.resting;p.guard=!!on&&allowed&&this.canAct();if(p.guard)p.guardAt=this.time}
 primaryDown(){if(!this.canAct())return false;const p=this.player;if(p.resting){this.setResting(false);if(this.action?.kind==='meditate')this.cancelAction()}p.primaryHeld=true;if(p.sheathed)p.sheathed=false;if(this.selectedUtility===0)return this.heal();if(this.selectedUtility===1)return false;if(p.guard||this.action)return false;const w=this.activeWeapon;
  if(w.weaponKind==='bow'){if(p.shotCooldown>0||p.draw)return false;if(p.arrows<=0){this.emit('notice',{text:'R로 화살을 장전하세요'});return false}p.draw={t:0,duration:w.drawTime,ready:false,kind:'bow'};return true}
  if(w.weaponKind==='crossbow')return this.fireArrow();
  return this.beginMelee();
 }
 primaryUp(){const p=this.player;p.primaryHeld=false;if(p.draw){const ready=p.draw.ready;p.draw=null;return ready?this.fireArrow():false}return false}
 secondaryDown(){if(!this.canAct())return false;const p=this.player;p.secondaryHeld=true;if(p.resting){this.setResting(false);if(this.action?.kind==='meditate')this.cancelAction()}if(p.sheathed)p.sheathed=false;
  if(this.classId==='wizard'&&this.activeWeapon.weaponKind==='staff'&&this.currentSpell&&this.selectedUtility===null){if(p.attack||this.action||p.cast)return false;const sp=this.currentSpell;if(p.charges[sp.id]<=0){this.emit('notice',{text:'주문 사용 횟수 없음 · E 명상'});return false}this.setGuard(false);p.cast={spellId:sp.id,t:0,duration:sp.castTime,ready:false};return true}
  this.setGuard(true);return p.guard;
 }
 secondaryUp(){const p=this.player;p.secondaryHeld=false;this.setGuard(false);if(p.cast){const cast=p.cast;p.cast=null;if(cast.ready)return this.castSpell(cast.spellId)}return false}
 attack(){return this.primaryDown()}
 beginMelee(special=false){const p=this.player;if(!this.canAct()||p.guard||p.sheathed||this.selectedUtility!==null||this.action||p.blockRecovery>0)return false;if(p.attack){p.attack.queued=true;return false}const steps=R.attackSteps[this.profileId]||R.attackSteps.sword,sequence=steps.filter(a=>!!a.special===!!special);if(!sequence.length)return false;if(this.time>this.comboReset)this.combo=0;const index=this.combo++%sequence.length,step=sequence[index];p.attack={t:0,id:this.profileId,index,special,step,profile:{windup:step.windup,active:step.active,recovery:step.finish||step.recover||.5},hit:new Set(),queued:false,stopped:false,branched:false,power:this.activeWeapon.damage*step.multiplier};this.stats.swings++;this.emit('sound',{name:'swing'});return true}
 fireArrow(){const p=this.player,w=this.activeWeapon;if(!this.canAct()||this.action||p.shotCooldown>0||p.arrows<=0)return false;p.arrows--;this.ammo[w.instanceId]=p.arrows;p.shotCooldown=w.weaponKind==='crossbow'?.8:.5;const axes=yawAxes(p.yaw,p.pitch),o=localPoint(this.getEye(),axes,[.10,-.08,.20]);this.projectiles.push({pos:o,vel:V.mul(axes[2],20),magic:false,owner:'player',power:w.damage,life:3.5});this.stats.shots++;this.emit('sound',{name:'bow'});return true}
 castSpell(id){const sp=R.spells[id],p=this.player;if(!sp||this.classId!=='wizard'||this.activeWeapon.weaponKind!=='staff'||!this.canAct()||p.charges[id]<=0)return false;p.charges[id]--;const axes=yawAxes(p.yaw,p.pitch),o=localPoint(this.getEye(),axes,[.10,-.08,.20]);
  if(id==='zap'){const end=V.add(o,V.mul(axes[2],sp.range)),hit=this.firstHit(o,end,.05,'player');if(hit?.kind==='body'){this.hit(hit.target,sp.direct,p,hit.point);this.addBurn(hit.target,sp.burn,sp.burnDuration)}this.effects.push({pos:o,vel:V.mul(axes[2],8),color:[.65,.85,1],life:.18})}
  else this.projectiles.push({pos:o,vel:V.mul(axes[2],sp.speed),magic:true,spellId:id,owner:'player',power:sp.direct,life:3.5});this.stats.shots++;this.emit('sound',{name:'magic'});return true;
 }
 addBurn(target,total,duration){if(target===this.player||target.hp<=0)return;target.burn={remaining:duration,tick:0,rate:total/duration}}
 dodge(){this.emit('notice',{text:'공통 무적 회피는 없습니다. 레인저 Q가 백스텝입니다.'});return false}
 heal(){if(!this.canAct()||this.action||this.player.attack||this.player.potions<=0||this.player.hp>=this.maxHealth)return false;this.setGuard(false);this.action={kind:'heal',t:0,duration:R.healing.potionUse,start:[this.player.x,this.player.z]};return true}
 applyHeal(amount,onlyRecoverable=false){const p=this.player,added=Math.min(amount,this.maxHealth-p.hp,onlyRecoverable?p.recoverableHp:Infinity);p.hp+=added;p.recoverableHp=Math.max(0,p.recoverableHp-added);return added}
 reload(){const p=this.player,w=this.activeWeapon;if(!this.canAct()||this.selectedUtility!==null||p.sheathed||!w?.quiver||this.action||p.attack||p.reserve<=0||p.arrows>=w.quiver)return false;this.cancelInputs();this.action={kind:'reload',t:0,duration:w.reloadTime,start:[p.x,p.z]};return true}
 specialAction(){if(!this.canAct()||this.selectedUtility!==null)return false;if(this.activeWeapon.quiver)return this.reload();if(this.classId==='wizard'&&this.activeWeapon.weaponKind==='staff'&&(this.player.cast||this.selectedSpellId)){this.cancelInputs();this.selectedSpellId=null;return true}if(this.profileId==='axe')return this.beginMelee(true);return false}
 getBlade(actor,a,time=a?.t||0){
  const isPlayer=actor===this.player,profile=a?.id||(isPlayer?this.profileId:'sword'),phase=a?attackPhase({...a,t:time}):['recovery',1];
  let pose=bladePose(profile,a?.index||0,phase[0],phase[1]);
  if(!a&&isPlayer)pose={hilt:[.43,-.43,.80],tip:profile==='dagger'?[.48,-.05,1.25]:[.56,.39,1.36]};
  if(a&&isPlayer&&phase[0]==='recovery'&&phase[1]>.65){const t=(phase[1]-.65)/.35;pose={hilt:V.mix(pose.hilt,[.43,-.43,.80],t),tip:V.mix(pose.tip,profile==='dagger'?[.48,-.05,1.25]:[.56,.39,1.36],t)}}
  const scale=isPlayer?1:actor.scale,origin=isPlayer?this.getEye():[actor.x,1.60*scale,actor.z],axes=yawAxes(actor.yaw,isPlayer?actor.pitch:0);
  return{hilt:localPoint(origin,axes,V.mul(pose.hilt,scale)),tip:localPoint(origin,axes,V.mul(pose.tip,scale)),axes};
 }
 shieldBox(actor){
  const isPlayer=actor===this.player;if(isPlayer){if(!actor.guard||actor.sheathed||this.selectedUtility!==null||actor.stagger>0)return null;const axes=yawAxes(actor.yaw,actor.pitch),shield=this.getGuardKind()==='shield';return{center:localPoint(this.getEye(),axes,shield?[-.12,-.27,.67]:[.10,-.14,.83]),axes,half:shield?[.39,.49,.075]:[.16,.48,.07],weapon:!shield}}
  if(actor.type!=='guardian'||actor.hp<=0||actor.attack||actor.stagger>0)return null;const axes=yawAxes(actor.yaw),sc=actor.scale;return{center:localPoint([actor.x,0,actor.z],axes,[-.17*sc,1.22*sc,.52*sc]),axes,half:[.36*sc,.49*sc,.08]};
 }
 bodies(actor){const isPlayer=actor===this.player,s=isPlayer?(actor.crouching?.64:1):actor.scale,j=isPlayer?actor.jump:0;return[{part:'head',center:[actor.x,1.74*s+j,actor.z],radius:.235*s},{part:'body',center:[actor.x,1.13*s+j,actor.z],radius:.37*s},{part:'leg',center:[actor.x,.54*s+j,actor.z],radius:.29*s}]}
 firstHit(a,b,r,owner,ignore=new Set()){
  const wt=wallHit(this.map,a,b,r);let best=wt===null?null:{kind:'wall',t:wt,point:V.mix(a,b,wt)};
  const targets=owner==='player'?this.enemies.filter(e=>e.hp>0):[this.player];
  for(const target of targets){const id=target===this.player?'player':target.id;if(ignore.has(id))continue;const shield=this.shieldBox(target);if(shield){let t=segmentOBB(a,b,shield,r);if(t!==null&&(!best||t<best.t))best={kind:'shield',t,target,point:V.mix(a,b,t)}}
   for(const body of this.bodies(target)){let t=segmentSphere(a,b,body.center,body.radius+r);if(t!==null&&(!best||t<best.t))best={kind:'body',t,target,part:body.part,point:V.mix(a,b,t)}}
  }return best;
 }
 swingSweep(actor,a,from,to){
  const lo=Math.max(from,a.profile.windup),hi=Math.min(to,a.profile.windup+a.profile.active);if(hi<=lo||a.stopped)return;
  const owner=actor===this.player?'player':actor.id,steps=Math.max(1,Math.ceil((hi-lo)/.006));
  for(let k=0;k<steps&&!a.stopped;k++){
   const b0=this.getBlade(actor,a,lerp(lo,hi,k/steps)),b1=this.getBlade(actor,a,lerp(lo,hi,(k+1)/steps)),samples=Math.ceil(V.len(V.sub(b0.tip,b0.hilt))/.12);let best=null;
   for(let j=0;j<=samples;j++){const p0=V.mix(b0.hilt,b0.tip,j/samples),p1=V.mix(b1.hilt,b1.tip,j/samples),hit=this.firstHit(p0,p1,.055,owner,a.hit);if(hit&&(!best||hit.t<best.t))best=hit}
   if(best){if(best.kind==='wall'){a.stopped=true;this.spark(best.point,[.7,.65,.5]);if(owner==='player'){this.stats.wallHits++;this.emit('notice',{text:'벽에 무기가 부딪혔습니다'});this.emit('sound',{name:'block'})}}
    else{const id=best.target===this.player?'player':best.target.id;a.hit.add(id);if(best.kind==='shield'){a.stopped=true;this.resolveShield(best.target,actor,a.power,best.point)}else this.hit(best.target,a.power*(best.part==='head'?1.45:best.part==='leg'?.72:1),actor,best.point,best.part)}
   }
  }
 }
 resolveShield(target,source,power,point){
  this.spark(point,[.9,.75,.32]);this.emit('sound',{name:'block'});
  if(target!==this.player){target.cooldown=Math.max(target.cooldown,.4);this.emit('notice',{text:'방어에 막혔습니다 · 측면을 노리세요'});return}
  this.stats.blocks++;this.player.blockRecovery=this.getGuardKind()==='shield'?.25:.4;this.emit('guard',{perfect:false});
 }
 hit(target,power,source,point,part='body'){
  if(target===this.player){if(!this.running||target.hp<=0)return;if(this.god)return;
   const scale=this.difficulty==='casual'?.65:this.difficulty==='hard'?1.22:1,amount=Math.max(1,Math.round(power*scale*100/(100+this.armor*2)));const actual=Math.min(target.hp,amount);target.hp=Math.max(0,target.hp-amount);target.recoverableHp=Math.min(this.maxHealth-target.hp,target.recoverableHp+actual*R.healing.recoverableFraction);this.setResting(false);target.cast=null;target.draw=null;this.stats.damageTaken+=amount;this.cancelAction(true);this.emit('hurt',{amount});this.emit('sound',{name:'hurt'});if(target.hp<=0)this.finish(false,'던전에서 쓰러졌습니다');return;
  }
  if(target.hp<=0)return;let amount=Math.round(power*(target.type==='guardian'?.85:1));const actual=Math.min(target.hp,amount);target.hp=Math.max(0,target.hp-amount);target.hitFlash=.2;target.memory=5;target.lastKnown=[this.player.x,this.player.z];if(!target.attack&&target.type!=='warden')target.stagger=.12;
  this.stats.hits++;this.stats.damage+=actual;if(part==='head')this.stats.headshots++;this.numbers.push({pos:point||[target.x,1.8,target.z],text:String(amount)+(part==='head'?'!':''),life:.8,head:part==='head'});this.spark(point||[target.x,1.2,target.z],[.67,.18,.09]);this.emit('hit',{part,amount});this.emit('sound',{name:'hit'});
  if(target.hp<=0){target.state='dead';target.deathTime=0;target.attack=null;this.stats.kills++;const ids=target.type==='warden'?['crown','steelSword','amulet']:this.loot(1),c=this.addContainer(target.x,target.z,target.type==='warden'?'군주의 유해':target.name+'의 유해',ids,target.type==='warden'?180:8+Math.floor(this.random()*13));c.corpse=true;c.enemyId=target.id;if(target.type==='warden')this.emit('notice',{text:'군주 격파 · 유해에서 왕관을 회수하세요'})}
 }
 spark(pos,color){for(let i=0;i<5;i++)this.effects.push({pos:[...pos],vel:[(this.random()-.5)*2,this.random()*2,(this.random()-.5)*2],color,life:.28})}
 move(actor,dx,dz,r=.28){const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.10));for(let i=0;i<steps;i++){const nx=actor.x+dx/steps,nz=actor.z+dz/steps;
  const allowed=(x,z)=>free(this.map,x,z,r)&&(actor!==this.player||!this.enemies.some(e=>e.hp>0&&Math.hypot(e.x-x,e.z-z)<r+.27*e.scale));if(allowed(nx,actor.z))actor.x=nx;if(allowed(actor.x,nz))actor.z=nz}}
 tick(dt,input={}){
  if(!this.running||this.paused||this.ended)return;dt=clamp(dt,0,.05);this.time+=dt;this.remaining-=dt;if(this.remaining<=0){this.finish(false,'시간이 다 되었습니다');return}const p=this.player;
  p.shotCooldown=Math.max(0,p.shotCooldown-dt);p.stagger=Math.max(0,p.stagger-dt);p.blockRecovery=Math.max(0,p.blockRecovery-dt);
  for(const st of Object.values(p.skills)){st.cooldown=Math.max(0,st.cooldown-dt);st.remaining=Math.max(0,st.remaining-dt)}
  if(p.potionEffect>0){const healDt=Math.min(dt,p.potionEffect);this.applyHeal(healDt*R.healing.potionTotal/R.healing.potionDuration);p.potionEffect-=healDt}
  if(p.secondWindEffect>0){const healDt=Math.min(dt,p.secondWindEffect);this.applyHeal(healDt*this.maxHealth*.5/12);p.secondWindEffect-=healDt}
  let f=input.forward||0,st=input.strafe||0,len=Math.max(1,Math.hypot(f,st));f/=len;st/=len;
  if(input.lookX)p.yaw+=input.lookX*dt*1.6;if(input.lookY)p.pitch=clamp(p.pitch+input.lookY*dt,-1.2,1.2);
  if(p.resting&&(f||st||input.jump)){this.setResting(false);if(this.action?.kind==='meditate')this.cancelAction()}
  p.crouching=!!input.crouch||p.resting;p.walking=!!input.walk;
  if(p.resting){this.restElapsed+=dt;while(this.restElapsed>=R.healing.restInterval-1e-8){this.restElapsed=Math.max(0,this.restElapsed-R.healing.restInterval);this.applyHeal(R.healing.restAmount,true)}}else this.restElapsed=0;
  if(p.cast){p.cast.t=Math.min(p.cast.duration,p.cast.t+dt);p.cast.ready=p.cast.t>=p.cast.duration-1e-8}
  if(p.draw){p.draw.t=Math.min(p.draw.duration,p.draw.t+dt);p.draw.ready=p.draw.t>=p.draw.duration-1e-8}
  const weaponPenalty=p.sheathed?0:this.selectedUtility!==null?-10:(this.activeWeapon.moveSpeed||0)+(this.activeWeapon.hands===1?(this.equipment.shield?.moveSpeed||0):0);
  let rating=R.movement.baseRating+(this.equipment.armor?.moveSpeed||0)+weaponPenalty+(p.skills.sprint?.remaining>0?50:0),speed=Math.max(.4,rating*R.movement.ratingToMps);
  if(p.walking)speed*=R.movement.walkMultiplier;if(p.crouching)speed*=R.movement.crouchMultiplier;if(f<0)speed*=R.movement.backwardMultiplier;
  if(p.guard)speed*=.75;if(p.attack)speed*=attackPhase(p.attack)[0]==='active'?.6:.875;if(p.cast||p.draw)speed*=.65;
  if(['heal','ration','reload'].includes(this.action?.kind))speed*=.5;if((this.action&&!['heal','ration','reload'].includes(this.action.kind))||p.stagger>0||p.resting){f=0;st=0}const axes=yawAxes(p.yaw),before=[p.x,p.z];
  if(p.backStep>0){const step=Math.min(dt,p.backStep);this.move(p,p.backStepDir[0]*20*step,p.backStepDir[1]*20*step);p.backStep-=step}else this.move(p,(axes[2][0]*f+axes[0][0]*st)*speed*dt,(axes[2][2]*f+axes[0][2]*st)*speed*dt);
  p.moveAmount=Math.hypot(p.x-before[0],p.z-before[1])/Math.max(dt,.001);p.walkPhase+=p.moveAmount*dt*3.5;
  if(input.jump&&p.jump===0&&!this.action&&!p.resting){p.vy=4.2;p.jump=.001}if(p.jump>0){p.jump+=p.vy*dt;p.vy-=12*dt;if(p.jump<0){p.jump=0;p.vy=0}}
  if(p.attack){const a=p.attack,old=a.t;a.t+=dt;this.swingSweep(p,a,old,a.t);if(!a.branched&&a.t>=a.profile.windup+a.profile.active){a.branched=true;a.continue=!a.special&&p.primaryHeld&&a.step.recover!==null&&!a.stopped;a.profile.recovery=a.continue?a.step.recover:(a.step.finish||.5)}if(a.stopped)a.t=Math.max(a.t,a.profile.windup+a.profile.active);if(a.t>=a.profile.windup+a.profile.active+a.profile.recovery){p.attack=null;this.comboReset=this.time+.8;if(a.continue&&p.primaryHeld)this.beginMelee()}}
  for(const e of this.enemies){if(e.hp<=0)continue;if(e.slowTime>0)e.slowTime=Math.max(0,e.slowTime-dt);if(e.burn){const burn=e.burn,part=Math.min(dt,burn.remaining);burn.remaining-=part;burn.tick+=part;if(burn.tick>=1-1e-8||burn.remaining<=1e-8){this.hit(e,burn.rate*burn.tick,p,[e.x,1.2,e.z]);burn.tick=0}if(burn.remaining<=1e-8)e.burn=null}if(!this.aiFrozen)this.tickEnemy(e,dt);if(!this.running)break}
  if(!this.running)return;this.tickProjectiles(dt);if(!this.running)return;this.tickAction(dt,input);
  for(const fx of this.effects){fx.life-=dt;fx.pos=V.add(fx.pos,V.mul(fx.vel,dt));fx.vel[1]-=dt*5}this.effects=this.effects.filter(e=>e.life>0);for(const n of this.numbers)n.life-=dt;this.numbers=this.numbers.filter(n=>n.life>0);
  this.fogTimer-=dt;if(this.fogTimer<=0){this.fogTimer=.16;this.reveal()}
 }
 tickEnemy(e,dt){
  e.stateTime+=dt;e.hitFlash=Math.max(0,e.hitFlash-dt);e.speedNow=0;if(e.hp<=0){e.deathTime+=dt;return}if(e.stagger>0){e.stagger=Math.max(0,e.stagger-dt);e.state='stagger';return}
  const p=this.player,dx=p.x-e.x,dz=p.z-e.z,dist=Math.hypot(dx,dz),sees=dist<12&&lineClear(this.map,e.x,e.z,p.x,p.z),desired=Math.atan2(dx,-dz);
  e.phase=e.type==='warden'&&e.hp<e.maxHp*.5?2:1;
  if(sees){e.memory=5;e.lastKnown=[p.x,p.z]}else e.memory=Math.max(0,e.memory-dt);
  if(e.attack){
   const a=e.attack,old=a.t;a.t+=dt;const[phase]=attackPhase(a);e.state=phase;
   if(phase==='windup'&&a.t<a.profile.windup-.2)e.yaw+=clamp(angleDelta(desired,e.yaw),-dt*1.5,dt*1.5);
   if(a.kind==='shot'&&old<a.profile.windup&&a.t>=a.profile.windup){const start=localPoint([e.x,1.35*e.scale,e.z],yawAxes(e.yaw),[0,0,.35]),dir=V.norm(V.sub([p.x,1.1+p.jump,p.z],start));this.projectiles.push({pos:start,vel:V.mul(dir,13),owner:e.id,magic:false,power:e.damage,life:3.5})}
   else if(a.kind==='pulse'&&old<a.profile.windup&&a.t>=a.profile.windup){this.effects.push({ring:true,pos:[e.x,.1,e.z],vel:[0,0,0],life:.5,color:[.2,.55,.9]});if(dist<4.5&&p.jump<.55&&lineClear(this.map,e.x,e.z,p.x,p.z))this.hit(p,30,e,[p.x,1,p.z]);this.emit('sound',{name:'magic'})}
   else if(a.kind!=='shot'&&a.kind!=='pulse')this.swingSweep(e,a,old,a.t);
   if(a.stopped)a.t=Math.max(a.t,a.profile.windup+a.profile.active);if(a.t>=a.profile.windup+a.profile.active+a.profile.recovery){e.attack=null;e.cooldown=e.phase===2?.5:.85;e.state='chase'}return;
  }
  e.cooldown=Math.max(0,e.cooldown-dt);if(e.memory<=0){e.state='idle';return}e.yaw+=clamp(angleDelta(desired,e.yaw),-dt*3,dt*3);
  const range=e.type==='archer'?9.5:e.range;
  if(sees&&dist<range&&e.cooldown<=0){
   let kind=e.type==='archer'?'shot':e.type==='guardian'?'slam':'sweep';if(e.type==='warden'){kind=e.phase===2&&e.attackCount%3===2?'pulse':e.attackCount%2?'sweep':'slam';this.stats.bossAttacks++}
   const id=kind==='slam'?'axe':'sword',profile={windup:kind==='pulse'?1.35:e.windup/(e.phase===2?1.15:1),active:e.active,recovery:e.recovery};e.attack={kind,id,index:kind==='slam'?2:0,profile,t:0,hit:new Set(),stopped:false,power:e.damage*(kind==='slam'?1.3:1)};e.attackCount++;e.state='windup';this.emit('enemyAttack',{id:e.id,kind});return;
  }
  if(e.type==='archer'&&sees&&dist<4){this.move(e,-dx/(dist||1)*e.speed*(e.slowTime>0?.8:1)*dt,-dz/(dist||1)*e.speed*(e.slowTime>0?.8:1)*dt,.3);e.speedNow=e.speed;e.walk+=dt*5;return}
  if(dist<(e.type==='archer'?6:1.60*e.scale)&&sees){e.state='idle';return}
  e.state='chase';e.repath-=dt;if(e.repath<=0){e.path=findPath(this.map,e.x,e.z,...e.lastKnown);e.repath=.55+this.random()*.25;this.stats.paths++}
  let dest=e.path[0];if(dest&&Math.hypot(dest[0]-e.x,dest[1]-e.z)<.22){e.path.shift();dest=e.path[0]}if(sees&&lineClear(this.map,e.x,e.z,p.x,p.z,.31))dest=[p.x,p.z];if(dest){const vx=dest[0]-e.x,vz=dest[1]-e.z,d=Math.hypot(vx,vz)||1,before=[e.x,e.z];this.move(e,vx/d*e.speed*(e.slowTime>0?.8:1)*dt,vz/d*e.speed*(e.slowTime>0?.8:1)*dt,.30);e.speedNow=Math.hypot(e.x-before[0],e.z-before[1])/dt;e.walk+=e.speedNow*dt*4}
 }
 tickProjectiles(dt){for(const p of this.projectiles){const start=p.pos,end=V.add(start,V.mul(p.vel,dt)),hit=this.firstHit(start,end,p.magic?.14:.035,p.owner);p.life-=dt;if(hit){p.pos=hit.point;p.life=0;const source=p.owner==='player'?this.player:this.enemies.find(e=>e.id===p.owner),sp=R.spells[p.spellId];
   if(p.spellId==='fireball'){
    if(hit.kind==='body'){this.hit(hit.target,sp.direct,source,hit.point);this.addBurn(hit.target,sp.burn,sp.burnDuration)}
    else if(hit.kind==='shield')this.resolveShield(hit.target,source,sp.direct,hit.point);
    for(const e of this.enemies){if(e.hp<=0)continue;const d=V.len(V.sub([e.x,1.2*e.scale,e.z],hit.point));if(d<sp.radius&&lineClear(this.map,hit.point[0],hit.point[2],e.x,e.z))this.hit(e,sp.splash,source,[e.x,1.2,e.z])}this.spark(hit.point,[1,.4,.09]);
   }else if(hit.kind==='shield')this.resolveShield(hit.target,source,p.power,hit.point);
   else if(hit.kind==='body'){this.hit(hit.target,p.power*(p.magic?1:hit.part==='head'?1.4:1),source,hit.point,hit.part);if(p.spellId==='icebolt')hit.target.slowTime=sp.slowDuration}
   else this.spark(hit.point,p.magic?[.3,.7,1]:[.65,.55,.35]);
  }else{p.pos=end;if(!p.magic)p.vel[1]-=.75*dt}}
  this.projectiles=this.projectiles.filter(p=>p.life>0)
 }
 getInteraction(){
  const p=this.player,candidates=this.containers.filter(c=>c.items.length||c.gold).map(c=>({kind:'container',object:c,distance:Math.hypot(c.x-p.x,c.z-p.z)}));candidates.push({kind:'exit',object:this.map.exit,distance:Math.hypot(this.map.exit.x-p.x,this.map.exit.z-p.z)});
  return candidates.filter(t=>t.distance<2.1&&Math.abs(angleDelta(Math.atan2(t.object.x-p.x,-(t.object.z-p.z)),p.yaw))<.85&&lineClear(this.map,p.x,p.z,t.object.x,t.object.z)).sort((a,b)=>a.distance-b.distance)[0]||null;
 }
 interact(){if(!this.canAct()||this.player.attack||this.action)return false;const target=this.getInteraction();if(!target)return false;if(target.kind==='container'&&target.object.searched){this.openLoot(target.object);return true}this.cancelInputs();this.setResting(false);this.action={kind:target.kind,target:target.object,t:0,duration:target.kind==='exit'?2.2:target.object.corpse?.8:target.object.rare?1.5:1.0,start:[this.player.x,this.player.z]};return true}
 cancelAction(damage=false){if(!this.action)return;if(this.action.kind==='meditate')this.setResting(false);const searched=['container','exit'].includes(this.action.kind);this.action=null;if(damage){this.stats.searchCancels++;this.emit('notice',{text:searched?'피격으로 수색 / 탈출 중단':'피격으로 사용 중단'})}}
 tickAction(dt,input){const a=this.action;if(!a)return;
  if(['container','exit'].includes(a.kind)&&(!input.interact||input.forward||input.strafe||Math.hypot(this.player.x-a.start[0],this.player.z-a.start[1])>.4)){this.cancelAction();return}
  if(a.kind==='meditate'&&(input.forward||input.strafe||input.jump)){this.cancelAction();return}
  a.t+=dt;
  if(a.kind==='meditate'){a.recharge+=dt;if(a.recharge>=R.skills.meditation.chargeInterval-1e-8){a.recharge-=R.skills.meditation.chargeInterval;const missing=Object.values(R.spells).find(sp=>this.player.charges[sp.id]<sp.charges);if(missing)this.player.charges[missing.id]++}}
  if(a.t<a.duration-1e-8)return;this.action=null;
  if(a.kind==='heal'){this.player.potions--;this.player.potionEffect=R.healing.potionDuration;this.emit('sound',{name:'heal'});this.emit('notice',{text:'치유 물약 · 20초 동안 20 회복'})}
  else if(a.kind==='ration'){const st=this.player.skills.fieldRation;if(st&&st.charges>0){st.charges--;st.cooldown=R.skills.fieldRation.cooldown;this.applyHeal(40);this.emit('sound',{name:'heal'})}}
  else if(a.kind==='reload'){const w=this.activeWeapon,n=Math.min(w.quiver-this.player.arrows,this.player.reserve);this.player.arrows+=n;this.player.reserve-=n;this.ammo[w.instanceId]=this.player.arrows;this.emit('sound',{name:'bow'})}
  else if(a.kind==='meditate')this.setResting(false);
  else if(a.kind==='exit')this.finish(true,'살아서 돌아왔습니다');
  else{a.target.searched=true;this.stats.searches++;this.openLoot(a.target);this.emit('sound',{name:'loot'})}
 }
 openLoot(c){this.player.gold+=c.gold;c.gold=0;this.openContainer=c;this.emit('loot',{container:c})}
 transfer(uid){const c=this.openContainer;if(!this.running||!c||Math.hypot(c.x-this.player.x,c.z-this.player.z)>2.3||!lineClear(this.map,c.x,c.z,this.player.x,this.player.z))return false;const i=c.items.findIndex(it=>it.uid===uid);if(i<0)return false;const it=c.items[i];if(!this.inventory.add(it)){this.emit('notice',{text:'가방 공간 부족 · 아이템은 상자에 남습니다'});return false}c.items.splice(i,1);this.stats.transfers++;this.emit('inventory');return true}
 equip(uid,slot){if(!this.canAct()||this.player.attack||this.action)return false;const item=this.inventory.get(uid);if(!item)return false;slot=slot||(item.type==='weapon'?(this.weaponSetIndex?'secondary':'weapon'):item.type);if(!this.canEquip(item,slot)){this.emit('notice',{text:'이 클래스가 사용할 수 없는 장비입니다'});return false}const previous=this.equipment[slot],saved=this.inventory.items.map(it=>({...it}));this.inventory.remove(uid);if(previous&&!this.inventory.add(previous)){this.inventory.items=saved;this.emit('notice',{text:'교체 장비를 넣을 공간이 부족합니다'});return false}this.equipment[slot]=item;this.cancelInputs();if(item.quiver&&this.ammo[item.instanceId]===undefined)this.ammo[item.instanceId]=0;this.syncWeapon();this.emit('inventory');this.emit('sound',{name:'loot'});return true}
 consume(uid){const it=this.inventory.get(uid);if(!it||it.type!=='consumable'||!this.running)return false;if(it.id==='potion')this.player.potions++;if(it.id==='arrows')this.player.reserve+=8;this.inventory.remove(uid);this.emit('inventory');return true}
 drop(uid){if(!this.running)return false;const item=this.inventory.remove(uid);if(!item)return false;const p=this.player;this.addContainer(p.x,p.z,'내려놓은 전리품',[item],0,true);this.emit('inventory');return true}
 reveal(){this.visible.clear();const p=this.player,x=Math.floor(p.x/TILE),z=Math.floor(p.z/TILE);for(let j=Math.max(0,z-5);j<=Math.min(N-1,z+5);j++)for(let i=Math.max(0,x-5);i<=Math.min(N-1,x+5);i++){const wx=(i+.5)*TILE,wz=(j+.5)*TILE;if(Math.hypot(wx-p.x,wz-p.z)<10.2&&lineClear(this.map,p.x,p.z,wx,wz)){this.visible.add(j*N+i);this.explored.add(j*N+i);if(!this.map.grid[j][i])for(const[dx,dz]of[[1,0],[-1,0],[0,1],[0,-1]])if(this.map.grid[j+dz]?.[i+dx])this.explored.add((j+dz)*N+i+dx)}}}
 finish(success,reason){if(this.ended)return this.result;this.cancelInputs();this.ended=true;this.running=false;this.action=null;this.setResting(false);this.player.attack=null;const lootValue=this.inventory.value()+Object.values(this.equipment).reduce((n,it)=>n+(it?.value||0),0),retain=success&&!this.training&&!this.cheated;this.result={runId:this.runId,classId:this.classId,success,reason,lootValue,gold:this.player.gold,reward:retain?this.player.gold:0,extractedItems:retain?this.inventory.items.map(it=>({...it})):[],extractedEquipment:retain?Object.fromEntries(Object.entries(this.equipment).map(([slot,it])=>[slot,it?{...it}:null])):{},training:this.training,cheated:this.cheated,stats:{...this.stats},time:this.time};this.emit('finish',{result:this.result});return this.result}
 snapshot(){return{version:15,classId:this.classId,weaponSetIndex:this.weaponSetIndex,selectedUtility:this.selectedUtility,selectedSpellId:this.selectedSpellId,running:this.running,paused:this.paused,ended:this.ended,seed:this.seed,time:this.time,player:{...this.player,attack:this.player.attack?{t:this.player.attack.t,id:this.player.attack.id,phase:attackPhase(this.player.attack)[0]}:null},enemies:this.enemies.map(e=>({id:e.id,type:e.type,x:e.x,z:e.z,hp:e.hp,state:e.state,phase:e.phase,attack:e.attack?.kind||null})),inventory:this.inventory.items.map(it=>({...it})),equipment:this.equipment,stats:{...this.stats},projectiles:this.projectiles.length,action:this.action?.kind||null}}
}
const exports={Game,ENEMIES,RULES:R};if(typeof module!=='undefined'&&module.exports)module.exports=exports;else root.CryptGame=exports;
})(typeof window!=='undefined'?window:globalThis);
