/* Combat uses +X=screen right, +Y=screen down. Renderer shares this basis. */
function reset(){
 resetTactics();doctrine=newDoctrine();
 for(const a of [enemies,shots,gems,particles,areas,enemyShots,texts,hazards,threats])a.length=0;
 elapsed=spawnTimer=bossStage=shake=flash=score=enemyId=hudTimer=0;pendingLevels=0;nextHazard=120;
 rerolls=3;banishes=2;banished.clear();stageEvents.clear();missionClaims.clear();dashCooldown=dashTime=0;dashVector={x:0,y:1};paidRun=false;
 runStats={damage:0,taken:0,chests:0,evolutions:0,elites:0,byWeapon:{},missionGold:0,bossPatterns:0};
 player={x:0,y:0,r:16,hp:baseHP(),maxHp:baseHP(),xp:0,need:12,lv:1,kills:0,gold:0,inv:1,
  levels:{[startingWeapon]:1},evolved:{},cool:{},facing:Math.PI/2,visualFacing:Math.PI/2,anim:0,moving:false,rot:0};
 initializeReferenceRun();clearInputs();renderer3d.resetCamera();state='playing';profile.runs++;saveProfile();hide();updateHud(true);Sound.unlock();
 toast('자동 공격 · 경험치를 모아 빌드를 완성하세요');saveRun();
}
function effect(x,y,color,count=8,force=1){
 for(let i=0;i<count;i++){let a=rand(0,TAU),v=rand(30,160)*force;particles.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:rand(.2,.65),max:.65,color,r:rand(2,5)});}
 if(particles.length>500)particles.splice(0,particles.length-500);
}
function floatText(x,y,text,color='#fff3b1'){if(texts.length<55)texts.push({x,y,text:String(text),color,life:.8,max:.8});}
function spawnEnemy(type,x,y,options={}){
 const t=enemyData[type];if(!t)return null;
 const scale=(1+elapsed/150)*(difficulty==='hard'?1.5:1)*chapters[chapter].mult;
 const e={id:++enemyId,type,x,y,r:t[3],hp:t[0]*scale,max:t[0]*scale,speed:t[1],dmg:t[2]*(difficulty==='hard'?1.5:1)*chapters[chapter].mult,
  color:t[4],xp:t[5],attack:rand(.8,2),hit:0,phase:1,charge:0,chargeX:0,chargeY:0,charging:0,busy:0,skillTimer:3,attackMode:0,age:0,seed:rand(0,TAU),...options};
 if(options.hpScale){e.hp*=options.hpScale;e.max=e.hp;}
 enemies.push(e);return e;
}
function spawnRing(type){
 const a=rand(0,TAU),half=renderer3d.mode==='2D'?{x:W/2,y:H/2}:renderer3d.visibleHalf();
 const rx=half.x+60,ry=half.y+80,c=Math.cos(a),s=Math.sin(a),d=Math.min(rx/Math.max(.001,Math.abs(c)),ry/Math.max(.001,Math.abs(s)));
 const e=spawnEnemy(type,player.x+c*d,player.y+s*d);if(type==='elite')decorateElite(e,['ward','frenzy','pulse'][(chapter+Math.floor(elapsed/120))%3]);return e;
}
function nearest(x,y,range=1e9,exclude=null){let best=null,bd=range*range;for(const e of enemies){if(e.hp<=0||exclude?.has(e.id))continue;const d=(e.x-x)**2+(e.y-y)**2;if(d<bd){bd=d;best=e;}}return best;}
function addXpGem(x,y,val){
 if(gems.length<580){gems.push({x,y,r:5+Math.min(3,val/20),val});return;}
 // Merge only into experience, never into a health/chest/bomb pickup.
 const g=gems.find(g=>g.val>0);if(g)g.val+=val;else gems.push({x,y,r:7,val});
}
function damage(e,amount,source='other',isDot=false){
 if(!e||e.hp<=0||!Number.isFinite(amount)||amount<=0||paidRun)return 0;
 amount=perkIncoming(e,amount,source,!isDot);if(amount<=0)return 0;
 const dealt=Math.min(e.hp,amount);runStats.damage+=dealt;runStats.byWeapon[source]=(runStats.byWeapon[source]||0)+dealt;e.hp-=amount;e.hit=.1;
 if(!e.textAt||elapsed-e.textAt>.24){floatText(e.x,e.y,Math.round(dealt));e.textAt=elapsed;}
 if(e.type==='boss'&&e.hp>0&&e.hp/e.max<=.5&&e.phase!==2){e.phase=2;toast('보스 2페이즈 · 공격 패턴 강화');Sound.play('warn');effect(e.x,e.y,'#f19ab0',25);}
 if(e.hp>0)return dealt;
 player.kills++;score++;perkOnKill(e,source);Sound.play('kill');effect(e.x,e.y,e.color,e.type==='boss'?40:6);addXpGem(e.x,e.y,e.xp);
 if(e.type==='splitter'&&enemies.length<255)for(let j=0;j<3;j++){const a=j*TAU/3;spawnEnemy('mini',e.x+Math.cos(a)*18,e.y+Math.sin(a)*18);}
 if(e.type==='elite'||e.type==='boss'){
  runStats.elites++;gems.push({x:e.x+20,y:e.y,r:13,val:0,chest:true});player.gold+=e.type==='boss'?70:25;
  if(e.type==='boss'&&e.role!=='final'){toast('중간 보스 격파! 보급 상자를 획득하세요');for(let i=0;i<8;i++)addXpGem(e.x+rand(-65,65),e.y+rand(-65,65),8);}
 }
 if(Math.random()<.07)gems.push({x:e.x+10,y:e.y,r:8,val:0,heal:15});
 if(Math.random()<.18)awardPickupGold(1);
 if(Math.random()<.008)gems.push({x:e.x,y:e.y+15,r:11,val:0,bomb:true});
 // No synthetic invulnerability pickup in reference mode.
 if(Math.random()<.004)gems.push({x:e.x,y:e.y-15,r:10,val:0,magnetAll:true});
 if(e.type==='boss'&&e.role==='final')finish(true);
 return dealt;
}
function hurt(amount,cause='other'){
 if(state!=='playing'||player.inv>0||dashTime>0||!Number.isFinite(amount)||amount<=0)return false;
 amount=Math.max(1,amount*(1-Math.min(.6,combatMeta().armor*.045))*(1-.08*(player.levels.armor||0)));
 if(blockIncoming(amount))return true;
 const actual=Math.min(player.hp,amount);recordIncoming(actual,cause);player.hp-=actual;runStats.taken+=actual;player.inv=.65;shake=8;flash=.3;effect(player.x,player.y,'#ff7a83',12);Sound.play('hurt');
 if(player.hp<=0){player.hp=0;finish(false);}return true;
}
function dash(){
 if(state!=='playing'||dashCooldown>0)return;
 const input=movementInput();if(input.len>.12)dashVector={x:input.x/input.len,y:input.y/input.len};
 dashCooldown=4.5*(hasPerk('dashPulse')?.75:1);dashTime=.23;player.inv=Math.max(player.inv,.32);effect(player.x,player.y,'#a5ffdb',10);Sound.play('dash');if(hasPerk('dashPulse'))explosion(player.x,player.y,110,60*attackPower(),'dash_pulse');
}
function checkMissions(){
 for(const m of missions)if(!missionClaims.has(m.id)&&m.value()>=m.goal){missionClaims.add(m.id);player.gold+=m.reward;runStats.missionGold+=m.reward;toast('임무 완료 · '+m.name+' +'+m.reward+' G');Sound.play('level');}
}
function finish(win,reason=''){
 if(paidRun||!player)return;
 if(profile.settledRuns.includes(runId)){paidRun=true;dropRunSave();menu();return;}
 checkMissions();paidRun=true;state=win?'win':'dead';clearInputs();
 const baseGold=player.gold,clearGold=win?100*(chapter+1):0,parts=Math.floor(Math.min(elapsed,300)/60)+(win?3:0)+(tactics.parts||0);
 profile.gold+=baseGold+clearGold;profile.parts+=parts;profile.best=Math.max(profile.best,player.kills);
 const drops=[];
 if(win||elapsed>=120){const count=win?2:1;for(let i=0;i<count;i++){const kind=Object.keys(gearCatalog)[Math.floor(Math.random()*3)],tier=win&&i===0?1:0;profile.inventory[kind][tier]++;drops.push({kind,tier});}}
 const c=profile.campaign[chapter];c.bestKills=Math.max(c.bestKills,player.kills);
 let stars=0;if(win){profile.wins++;c.clears++;stars=1+(player.kills>=500?1:0)+(runStats.evolutions>=1?1:0);c.stars=Math.max(c.stars,stars);c.bestTime=c.bestTime?Math.min(c.bestTime,Math.ceil(elapsed)):Math.ceil(elapsed);profile.unlocked=Math.min(3,Math.max(profile.unlocked,chapter+2));}
 profile.settledRuns.push(runId);profile.settledRuns=profile.settledRuns.slice(-64);if(saveProfile())dropRunSave();Sound.play(win?'win':'hurt');updateHud(true);resultMenu({win,reason,baseGold,clearGold,parts,drops,stars});
}
function applyUpgrade(k){
 if(!definitions[k]||player.levels[k]>=5)return false;
 if(!player.levels[k]&&owned(definitions[k].kind).length>=6)return false;
 const old=player.maxHp;player.levels[k]=(player.levels[k]||0)+1;
 if(k==='hp'){player.maxHp=baseHP()*(1+.15*player.levels.hp);player.hp=Math.min(player.maxHp,player.hp+player.maxHp-old);}
 Sound.play('upgrade');return true;
}
function upgradeOptions(){
 const w=owned('weapon').length,p=owned('passive').length;
 let list=Object.keys(definitions).filter(k=>!definitions[k].hidden&&(player.levels[k]||0)<5&&!banished.has(k)&&(!player.levels.destroyer||!['droneA','droneB'].includes(k))&&(player.levels[k]||((definitions[k].kind==='weapon'?w:p)<6)));
 // Weighted sampling without replacement: upgrades and synergy partners appear more often.
 function weight(k){let n=player.levels[k]?2.1:1;if(Object.entries(evoPairs).some(([a,b])=>b===k&&player.levels[a]>=3))n+=1.5;if((k==='droneA'&&player.levels.droneB)||(k==='droneB'&&player.levels.droneA))n+=1.5;return n;}
 const out=[];while(list.length&&out.length<3){const total=list.reduce((s,k)=>s+weight(k),0);let r=Math.random()*total,index=0;for(;index<list.length-1;index++){r-=weight(list[index]);if(r<0)break;}out.push(list.splice(index,1)[0]);}
 const ownedUpgrades=Object.keys(player.levels).filter(k=>definitions[k]?.kind==='weapon'&&!definitions[k].hidden&&player.levels[k]<5&&!banished.has(k));
 if(ownedUpgrades.length&&!out.some(k=>player.levels[k]&&definitions[k].kind==='weapon'))out[out.length-1]=ownedUpgrades[Math.floor(Math.random()*ownedUpgrades.length)];
 return out;
}
function gainXp(n){
 if(!Number.isFinite(n)||n<=0||paidRun)return;
 player.xp+=n*(1+.08*(player.levels.magnet||0))*(hasPerk('scavenger')?1.2:1);
 while(player.xp>=player.need&&player.lv<99){player.xp-=player.need;player.lv++;player.need=nextXp(player.lv);pendingLevels++;}
 if(player.lv===99)player.xp=Math.min(player.xp,player.need-1);
 if(pendingLevels&&state==='playing'){pendingLevels--;levelUp();}
}
function resumePlay(){levelDraft=null;chestDraft=null;state='playing';Sound.unlock();hide();updateHud(true);if(maybeOfferPerk())return;if(pendingLevels>0){pendingLevels--;levelUp();}saveRun();}
function evolveWeapon(k){
 if(!evolutionEligible().includes(k))return false;
 if(k==='destroyer'){delete player.levels.droneA;delete player.levels.droneB;delete player.cool.droneA;delete player.cool.droneB;player.levels.destroyer=5;}
 player.evolved[k]=true;runStats.evolutions++;Sound.play('evolve');effect(player.x,player.y,'#ffe7a6',40);checkMissions();return true;
}
function projectile(kind,x,y,a,speed,dmg,more={}){
 shots.push({kind,x,y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,r:6,life:2,dmg,source:kind,hit:new Set(),pierce:0,color:weaponData[kind].color,...more});
}
function dronePositions(){
 const out=[],t=player.rot*.65;
 for(const [k,i] of [['droneA',0],['droneB',1],['destroyer',2]])if(player.levels[k]){
  const a=t+(i===1?Math.PI:i===2?Math.PI/2:0),r=k==='destroyer'?62:49;
  out.push({kind:k,x:player.x+Math.cos(a)*r,y:player.y+Math.sin(a)*r,z:65+Math.sin(elapsed*3+i)*4});
 }return out;
}
function fire(kind,lv=weaponLevel(kind)){
 const target=nearest(player.x,player.y,700*rangePower());if(!target)return false;
 const a=Math.atan2(target.y-player.y,target.x-player.x),dmg=weaponDamage(kind),ev=player.evolved[kind],range=rangePower();
 if(kind==='kunai'){
  const n=ev?4:lv>=4?2:1;for(let i=0;i<n;i++)projectile(kind,player.x,player.y,a+(i-(n-1)/2)*.14,470,dmg,{homing:true,pierce:ev?6:lv>=5?2:0,chain:ev?2:0});
 }else if(kind==='rocket')projectile(kind,player.x,player.y,a,315,dmg,{r:9,life:2.8,aoe:(65+lv*13+(ev?65:0))*range,burn:!!ev});
 else if(kind==='drill'){
  const n=Math.min(3,1+Math.floor(lv/2));for(let i=0;i<n;i++)projectile(kind,player.x,player.y,a+(i-(n-1)/2)*.25,580,dmg,{r:7,life:1.8,pierce:99,returning:!!ev});
 }else if(kind==='lightning'){
  const list=enemies.filter(e=>e.hp>0&&Math.hypot(e.x-player.x,e.y-player.y)<700*range).sort((u,v)=>(u.x-player.x)**2+(u.y-player.y)**2-(v.x-player.x)**2-(v.y-player.y)**2).slice(0,1+Math.floor(lv/2)+(ev?3:0));
  for(const e of list){if(paidRun)break;damage(e,dmg,kind);areas.push({kind:'lightning',x:e.x,y:e.y,r:18,life:.25,max:.25});if(ev){const neighbor=nearest(e.x,e.y,160*range,new Set([e.id]));if(neighbor){damage(neighbor,dmg*.45,kind);areas.push({kind:'link',x:e.x,y:e.y,x2:neighbor.x,y2:neighbor.y,r:8,life:.18,max:.18});}}}
 }else if(kind==='molotov'){
  areas.push({kind:'fire',x:target.x,y:target.y,r:(50+lv*12+(ev?35:0))*range,life:3+lv*.4,max:3+lv*.4,tick:0,dmg,source:kind});
  if(ev)for(let i=0;i<3;i++){const an=i*TAU/3;areas.push({kind:'fire',x:target.x+Math.cos(an)*95,y:target.y+Math.sin(an)*95,r:(45+lv*5)*range,life:4,max:4,tick:0,dmg:dmg*.75,source:kind});}
 }else if(['droneA','droneB','destroyer'].includes(kind)){
  const d=dronePositions().find(x=>x.kind===kind)||player,an=Math.atan2(target.y-d.y,target.x-d.x);
  const n=kind==='destroyer'?2:kind==='droneB'?3:1+Math.floor(lv/3);
  for(let i=0;i<n;i++)projectile(kind,d.x,d.y,an+(i-(n-1)/2)*(kind==='droneB'?.27:.1),kind==='droneB'?340:480,dmg,{life:2.4,homing:kind==='destroyer'||kind==='droneA',aoe:kind==='destroyer'?40*range:kind==='droneB'?(22+lv*3)*range:0,drone:true});
 }
 Sound.play(kind==='rocket'?'rocket':kind==='lightning'?'zap':'shot');return true;
}
function explosion(x,y,r,dmg,source='rocket'){
 areas.push({kind:'blast',x,y,r,life:.3,max:.3});effect(x,y,'#ffb56e',14);shake=Math.max(shake,3);
 for(const e of enemies)if(e.hp>0&&Math.hypot(e.x-x,e.y-y)<r+e.r)damage(e,dmg,source);
}
function fireEnemy(e,angle,speed=220,spread=1,color='#f3849b'){
 for(let i=0;i<spread;i++){const a=angle+(i-(spread-1)/2)*.19;enemyShots.push({x:e.x,y:e.y,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,r:6,dmg:e.dmg*.8,life:4,color,cause:e.type});}
}
function addThreat(shape,opts){
 const t={shape,x:0,y:0,r:70,width:28,warn:1,duration:.25,age:0,damage:20,active:false,hit:false,color:'#ff9879',...opts};threats.push(t);return t;
}
function bossPattern(e,forced=null){
 if(!e||e.hp<=0)return;const phase=e.phase===2,step=e.attackMode++;
 const type=forced|| (chapter===0?['charge','shockwave','charge'][step%3]:chapter===1?['mortar','summon','mortar'][step%3]:['laser','ice','laser'][step%3]);
 runStats.bossPatterns++;e.currentPattern=type;e.busy=1.2;e.skillTimer=phase?3.3:4.7;
 if(type==='charge'){
  const a=Math.atan2(player.y-e.y,player.x-e.x),dist=Math.min(410,Math.hypot(player.x-e.x,player.y-e.y)+100),warn=phase?.8:1.15;
  addThreat('line',{kind:'charge',owner:e,x:e.x,y:e.y,x2:e.x+Math.cos(a)*dist,y2:e.y+Math.sin(a)*dist,width:e.r*1.7,warn,duration:.6,damage:e.dmg,color:'#ff947b'});e.busy=warn+.65;
 }else if(type==='shockwave'){
  addThreat('ring',{kind:'shock',owner:e,x:e.x,y:e.y,r:phase?270:225,width:16,warn:.95,duration:1.3,damage:e.dmg*.85,color:'#ffb477'});
 }else if(type==='mortar'){
  for(let i=0;i<(phase?5:3);i++){const a=i*2.399,dist=i===0?0:70+i*30;addThreat('circle',{kind:'mortar',owner:e,x:player.x+Math.cos(a)*dist,y:player.y+Math.sin(a)*dist,r:phase?65:58,warn:1.25+i*.17,duration:.4,damage:e.dmg*.8,color:'#ffc278'});}
 }else if(type==='summon'){
  addThreat('ring',{kind:'summon',owner:e,x:e.x,y:e.y,r:200,width:12,warn:1,duration:1.15,damage:e.dmg*.65,color:'#e5b7ff'});
 }else if(type==='laser'){
  const a=Math.atan2(player.y-e.y,player.x-e.x),len=Math.min(850,Math.max(420,Math.hypot(player.x-e.x,player.y-e.y)+220));
  for(let i=0;i<(phase?2:1);i++){const an=a+i*.48;addThreat('line',{kind:'laser',owner:e,x:e.x,y:e.y,x2:e.x+Math.cos(an)*len,y2:e.y+Math.sin(an)*len,width:phase?36:30,warn:1.3+i*.3,duration:.65,damage:e.dmg*.85,color:'#82ecff'});}e.busy=phase?2.3:2;
 }else if(type==='ice'){
  addThreat('circle',{kind:'ice',owner:e,x:e.x,y:e.y,r:100,warn:1,duration:.3,damage:0,color:'#8bdffc'});
 }
 Sound.play('warn');return type;
}
function spawnBoss(final){
 const a=rand(0,TAU),e=spawnEnemy('boss',player.x+Math.cos(a)*220,player.y+Math.sin(a)*220,{role:final?'final':'mid',hpScale:final?6:.38});
 if(final){enemyShots.length=0;threats.length=0;for(let i=enemies.length-1;i>=0;i--)if(enemies[i]!==e&&enemies[i].type!=='boss'&&enemies[i].type!=='elite')enemies.splice(i,1);}
 toast((final?'최종':'중간')+' 보스 출현 · '+chapters[chapter].boss);Sound.play('warn');return e;
}
function supply(){const a=rand(0,TAU);gems.push({x:player.x+Math.cos(a)*135,y:player.y+Math.sin(a)*135,r:13,val:0,chest:true});toast('보급 도착 · 금빛 상자를 획득하세요');}
function director(dt){
 if(stageEvents.has('disabled'))return;
 spawnTimer=Math.max(-1,spawnTimer-dt);
 if(elapsed<300&&spawnTimer<=0&&enemies.length<260){
  const n=Math.min(8,1+Math.floor(elapsed/35));for(let i=0;i<n&&enemies.length<260;i++){
   const r=Math.random();const type=elapsed>210&&r<.045?'medic':elapsed>175&&r<.09?'sniper':elapsed>110&&r<.17?'splitter':elapsed>85&&r<.23?'charger':elapsed>95&&r<.3?'ranged':elapsed>50&&r<.43?'tank':r<.58?'runner':'grunt';spawnRing(type);
  }spawnTimer=Math.max(.24,.85-elapsed*.0018);
 }
 const events=[[60,'elite1',()=>spawnRing('elite')],[95,'supply1',supply],[150,'mid',()=>spawnBoss(false)],[200,'supply2',supply],[240,'elite2',()=>spawnRing('elite')],[275,'supply3',supply],[300,'final',()=>spawnBoss(true)]];
 for(const [time,id,fn] of events)if(elapsed>=time&&!stageEvents.has(id)){stageEvents.add(id);fn();}
 if(elapsed>=nextHazard&&elapsed<290){nextHazard+=50;addThreat('circle',{kind:'zone',x:player.x+rand(-160,160),y:player.y+rand(-130,130),r:60,warn:1.5,duration:3,damage:9,color:'#f196b1'});}
}
function segmentDistance(x,y,ax,ay,bx,by){const dx=bx-ax,dy=by-ay,d=dx*dx+dy*dy;const t=d>0?clamp(((x-ax)*dx+(y-ay)*dy)/d,0,1):0;return Math.hypot(x-ax-t*dx,y-ay-t*dy);}
function updateThreats(dt){
 for(let i=threats.length-1;i>=0;i--){
  const h=threats[i];if(h.owner&&h.owner.hp<=0){threats.splice(i,1);continue;}h.age+=dt;
  if(h.age>=h.warn&&!h.active){
   h.active=true;Sound.play(h.kind==='laser'?'zap':'rocket');
   if(h.kind==='charge'&&h.owner){const e=h.owner;e.charging=h.duration;e.chargeFrom={x:h.x,y:h.y};e.chargeTo={x:h.x2,y:h.y2};e.chargeTotal=h.duration;}
   if(h.kind==='sniper'&&h.owner)fireEnemy(h.owner,Math.atan2(h.y2-h.y,h.x2-h.x),450);
   if(h.kind==='ice'&&h.owner){const n=h.owner.phase===2?20:14;for(let j=0;j<n;j++){// Every fifth ray is a deliberate escape gap.
     if(j%5===0)continue;const a=j*TAU/n+h.owner.attackMode*.2;enemyShots.push({x:h.x,y:h.y,vx:Math.cos(a)*210,vy:Math.sin(a)*210,r:7,dmg:h.owner.dmg*.65,life:3.5,color:'#85e8ff',cause:'ice'});}}
   if(h.kind==='summon'&&h.owner)for(let j=0;j<(h.owner.phase===2?7:4)&&enemies.length<260;j++){const a=j*TAU/7;spawnEnemy(j%3===0?'runner':'grunt',h.x+Math.cos(a)*85,h.y+Math.sin(a)*85);}
   if(h.kind==='mortar')effect(h.x,h.y,h.color,18);
  }
  const active=h.age-h.warn;
  if(h.active&&active<=h.duration&&!['charge','sniper','ice'].includes(h.kind)){
   let hit=false;
   if(h.shape==='circle')hit=Math.hypot(player.x-h.x,player.y-h.y)<h.r+player.r;
   else if(h.shape==='line')hit=segmentDistance(player.x,player.y,h.x,h.y,h.x2,h.y2)<h.width/2+player.r;
   else if(h.shape==='ring'){
    const r=h.r*clamp(active/h.duration,0,1),pr=h.r*clamp((active-dt)/h.duration,0,1),d=Math.hypot(player.x-h.x,player.y-h.y);
    hit=d>=pr-h.width-player.r&&d<=r+h.width+player.r;
   }
   if(h.kind==='zone'){h.tick=(h.tick||0)-dt;if(hit&&h.tick<=0){h.tick=.7;hurt(h.damage,h.kind);}}
   else if(hit&&!h.hit){h.hit=true;hurt(h.damage,h.kind);}
  }
  if(h.age>h.warn+h.duration)threats.splice(i,1);
  if(state!=='playing')return;
 }
}
function updateEnemies(dt){
 const initial=enemies.length;for(let index=0;index<initial;index++){
  const e=enemies[index];if(!e||e.hp<=0)continue;if(state!=='playing')return;
  e.age+=dt;e.hit=Math.max(0,e.hit-dt);e.busy=Math.max(0,e.busy-dt);e.attack-=dt;e.skillTimer-=dt;
  if(e.stun>0){e.stun=Math.max(0,e.stun-dt);continue;}
  let ex=player.x-e.x,ey=player.y-e.y,dist=Math.max(1,Math.hypot(ex,ey));
  if(e.charging>0){
   const px=e.x,py=e.y;e.charging=Math.max(0,e.charging-dt);const t=1-e.charging/e.chargeTotal;
   e.x=e.chargeFrom.x+(e.chargeTo.x-e.chargeFrom.x)*t;e.y=e.chargeFrom.y+(e.chargeTo.y-e.chargeFrom.y)*t;
   if(segmentDistance(player.x,player.y,px,py,e.x,e.y)<e.r+player.r)hurt(e.dmg,'charge');continue;
  }
  if(e.type==='boss'&&e.skillTimer<=0&&e.busy<=0)bossPattern(e);
  if(e.type==='charger'&&e.skillTimer<=0&&e.busy<=0&&dist<440){
   const len=Math.min(330,dist+60),x2=e.x+ex/dist*len,y2=e.y+ey/dist*len;
   addThreat('line',{kind:'charge',owner:e,x:e.x,y:e.y,x2,y2,width:28,warn:.9,duration:.5,damage:e.dmg,color:'#ffb081'});e.busy=1.45;e.skillTimer=5;
  }
  if(e.type==='sniper'&&e.attack<=0&&dist<730&&e.busy<=0){
   addThreat('line',{kind:'sniper',owner:e,x:e.x,y:e.y,x2:player.x,y2:player.y,width:4,warn:.85,duration:.12,damage:0,color:'#f59bb8'});e.busy=1;e.attack=3.5;
  }
  if(e.type==='medic'&&e.attack<=0){
   for(const a of enemies)if(a!==e&&a.hp>0&&a.type!=='boss'&&Math.hypot(a.x-e.x,a.y-e.y)<150)a.hp=Math.min(a.max,a.hp+a.max*.07);
   areas.push({kind:'healpulse',x:e.x,y:e.y,r:150,life:.65,max:.65});e.attack=3;
  }
  if(e.busy<=0){
   const retreat=(e.type==='ranged'&&dist<230)||(e.type==='sniper'&&dist<370)||(e.type==='medic'&&dist<210),v=e.speed*slowFactor(e)*dt*(retreat?-.5:1);
   e.x+=ex/dist*v;e.y+=ey/dist*v;
   if(e.type==='runner'){const sway=Math.sin(e.age*5+e.seed)*e.speed*slowFactor(e)*.32*dt;e.x-=ey/dist*sway;e.y+=ex/dist*sway;}
  }
  if(e.type==='ranged'&&e.attack<=0&&dist<650){fireEnemy(e,Math.atan2(ey,ex),185);e.attack=2.8;}
  // The boss uses explicit telegraphed moves, not invisible automatic fan attacks.
  if(Math.hypot(player.x-e.x,player.y-e.y)<e.r+player.r)hurt(e.dmg,e.type);
 }
}
const enemyGrid=new Map(),GRID=64;
function rebuildGrid(){enemyGrid.clear();for(const e of enemies){if(e.hp<=0)continue;const key=Math.floor(e.x/GRID)+','+Math.floor(e.y/GRID);if(!enemyGrid.has(key))enemyGrid.set(key,[]);enemyGrid.get(key).push(e);}}
function queryEnemies(ax,ay,bx=ax,by=ay,padding=55){const out=[];for(let x=Math.floor((Math.min(ax,bx)-padding)/GRID);x<=Math.floor((Math.max(ax,bx)+padding)/GRID);x++)for(let y=Math.floor((Math.min(ay,by)-padding)/GRID);y<=Math.floor((Math.max(ay,by)+padding)/GRID);y++){const a=enemyGrid.get(x+','+y);if(a)out.push(...a);}return out;}
function separateEnemies(){
 for(const a of enemies){if(a.hp<=0||a.charging>0)continue;for(const b of queryEnemies(a.x,a.y,a.x,a.y,55)){
  if(b.id<=a.id||b.hp<=0||b.charging>0)continue;const dx=b.x-a.x,dy=b.y-a.y,dd=dx*dx+dy*dy,min=(a.r+b.r)*.74;
  if(dd>.01&&dd<min*min){const d=Math.sqrt(dd),push=(min-d)*.17,nx=dx/d,ny=dy/d;a.x-=nx*push;a.y-=ny*push;b.x+=nx*push;b.y+=ny*push;}
 }}
}
function updateWeapons(dt){
 for(const k of owned('weapon')){
  if(k==='guardian')continue;player.cool[k]=(player.cool[k]||0)-dt;
  if(player.cool[k]<=0){if(fire(k))player.cool[k]=weaponInterval(k);else player.cool[k]=.08;}
  if(state!=='playing')return;
 }
 if(player.levels.guardian){
  const lv=player.levels.guardian,ev=player.evolved.guardian,n=2+Math.floor(lv/2)+(ev?3:0),r=(55+lv*7)*rangePower();
  for(let i=0;i<n;i++){const a=player.rot+i*TAU/n,x=player.x+Math.cos(a)*r,y=player.y+Math.sin(a)*r;
   if(ev)for(const b of enemyShots)if(b.life>0&&Math.hypot(b.x-x,b.y-y)<b.r+18){b.life=0;effect(b.x,b.y,'#a6eeec',3);}
   for(const e of queryEnemies(x,y,x,y,65))if(e.hp>0&&Math.hypot(e.x-x,e.y-y)<e.r+14&&(!e.guardHit||elapsed-e.guardHit>.3*(hasPerk('overclock')?.82:1))){damage(e,weaponDamage('guardian'),'guardian');e.guardHit=elapsed;}
  }
 }
}
function updateProjectiles(dt){
 for(let i=shots.length-1;i>=0;i--){
  if(state!=='playing')return;const s=shots[i];s.life-=dt;
  if(s.life<=0){shots.splice(i,1);continue;}
  if(s.returning&&s.life<.9){const a=Math.atan2(player.y-s.y,player.x-s.x);s.vx+=(Math.cos(a)*600-s.vx)*Math.min(1,dt*6);s.vy+=(Math.sin(a)*600-s.vy)*Math.min(1,dt*6);}
  if(s.homing){const t=nearest(s.x,s.y,430,s.hit);if(t){const a=Math.atan2(t.y-s.y,t.x-s.x),speed=s.drone?480:470;s.vx+=(Math.cos(a)*speed-s.vx)*Math.min(1,dt*7);s.vy+=(Math.sin(a)*speed-s.vy)*Math.min(1,dt*7);}}
  const ox=s.x,oy=s.y;s.x+=s.vx*dt;s.y+=s.vy*dt;let remove=false;
  const list=queryEnemies(ox,oy,s.x,s.y).filter(e=>e.hp>0&&!s.hit.has(e.id)&&segmentDistance(e.x,e.y,ox,oy,s.x,s.y)<s.r+e.r).sort((a,b)=>(a.x-ox)**2+(a.y-oy)**2-(b.x-ox)**2-(b.y-oy)**2);
  for(const e of list){if(e.hp<=0)continue;s.hit.add(e.id);
   if(s.aoe){explosion(e.x,e.y,s.aoe,s.dmg,s.source);if(s.burn)areas.push({kind:'fire',x:e.x,y:e.y,r:s.aoe*.65,life:2.5,max:2.5,tick:0,dmg:s.dmg*.12,source:s.source});}
   else{damage(e,s.dmg,s.source);if(s.chain){const visited=new Set([e.id]);let from=e;for(let n=0;n<s.chain;n++){const next=nearest(from.x,from.y,140,visited);if(!next)break;visited.add(next.id);damage(next,s.dmg*.45,s.source);areas.push({kind:'link',x:from.x,y:from.y,x2:next.x,y2:next.y,r:2,life:.13,max:.13});from=next;}}}
   if(s.pierce--<=0){remove=true;break;}
  }
  if(remove)shots.splice(i,1);
 }
 for(let i=enemyShots.length-1;i>=0;i--){
  const s=enemyShots[i];if(s.life<=0){enemyShots.splice(i,1);continue;}const ox=s.x,oy=s.y;s.x+=s.vx*dt;s.y+=s.vy*dt;s.life-=dt;
  if(segmentDistance(player.x,player.y,ox,oy,s.x,s.y)<s.r+player.r){hurt(s.dmg,s.cause||'projectile');s.life=0;}
  if(s.life<=0)enemyShots.splice(i,1);if(state!=='playing')return;
 }
 if(shots.length>650)shots.splice(0,shots.length-650);if(enemyShots.length>350)enemyShots.splice(0,enemyShots.length-350);
}
function updateAreas(dt){
 for(let i=areas.length-1;i>=0;i--){const a=areas[i];a.life-=dt;if(a.kind==='fire'){a.tick-=dt;if(a.tick<=0){a.tick=.3;for(const e of enemies)if(e.hp>0&&Math.hypot(e.x-a.x,e.y-a.y)<a.r+e.r)damage(e,a.dmg,a.source||'molotov',true);}}
 if(a.life<=0)areas.splice(i,1);if(state!=='playing')return;
 }
 if(areas.length>170)areas.splice(0,areas.length-170);
}
function updatePickups(dt){
 for(let i=gems.length-1;i>=0;i--){const g=gems[i],dx=player.x-g.x,dy=player.y-g.y,d=Math.hypot(dx,dy),range=pickupRadius();
  if(d<range||g.attract){const t=Math.min(1,dt*(g.attract?15:11));g.x+=dx*t;g.y+=dy*t;}
  if(d<player.r+g.r+5){
   gems.splice(i,1);
   if(g.chest)openChest();
   else if(g.bomb){for(const e of enemies)if(e.hp>0)damage(e,Math.max(80,e.max*.3),'bomb');effect(player.x,player.y,'#ffbb63',35);shake=7;Sound.play('rocket');}
   else if(g.shield){player.inv=Math.max(player.inv,5);effect(player.x,player.y,'#89f6e7',18);Sound.play('upgrade');}
   else if(g.magnetAll){for(const other of gems)if(other.val>0)other.attract=true;effect(player.x,player.y,'#c1a3ff',18);Sound.play('upgrade');}
   else if(g.heal){player.hp=Math.min(player.maxHp,player.hp+g.heal);floatText(player.x,player.y,'+'+g.heal,'#b3ffd1');}
   else gainXp(g.val);
   if(state!=='playing')break;
  }
 }
}
function movementInput(){const x=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0)+joy.dx,y=(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0)+joy.dy;return {x,y,len:Math.hypot(x,y)};}
function update(dt){
 if(state!=='playing'||!Number.isFinite(dt)||dt<=0)return;if(maybeOfferPerk())return;
 elapsed+=dt;dashCooldown=Math.max(0,dashCooldown-dt);player.inv=Math.max(0,player.inv-dt);player.rot+=dt*2.9;shake=Math.max(0,shake-dt*18);flash=Math.max(0,flash-dt);
 const input=movementInput();let dx=input.x,dy=input.y,len=input.len;player.moving=len>.1||dashTime>0;
 if(player.moving)player.anim+=dt*(dashTime>0?23:13);
 if(dashTime>0){const active=Math.min(dt,dashTime);player.x+=dashVector.x*moveSpeed()*3.6*active;player.y+=dashVector.y*moveSpeed()*3.6*active;dashTime=Math.max(0,dashTime-dt);player.facing=Math.atan2(dashVector.y,dashVector.x);}
 else if(len>.1){dx/=Math.max(1,len);dy/=Math.max(1,len);player.x+=dx*moveSpeed()*dt;player.y+=dy*moveSpeed()*dt;player.facing=Math.atan2(dy,dx);dashVector={x:dx/Math.max(.001,Math.hypot(dx,dy)),y:dy/Math.max(.001,Math.hypot(dx,dy))};}
 const da=Math.atan2(Math.sin(player.facing-player.visualFacing),Math.cos(player.facing-player.visualFacing));player.visualFacing+=da*Math.min(1,dt*16);
 tickReferenceRecovery(dt);
 director(dt);tickDoctrine(dt);if(state!=='playing')return;updateTactics(dt);if(state!=='playing')return;updateThreats(dt);if(state!=='playing')return;updateEnemies(dt);if(state!=='playing')return;
 rebuildGrid();separateEnemies();rebuildGrid();updateWeapons(dt);if(state!=='playing')return;updateProjectiles(dt);if(state!=='playing')return;updateAreas(dt);if(state!=='playing')return;updatePickups(dt);
 for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;if(p.life<=0)particles.splice(i,1);}
 for(let i=texts.length-1;i>=0;i--){texts[i].life-=dt;if(texts[i].life<=0)texts.splice(i,1);}
 for(let i=enemies.length-1;i>=0;i--){const e=enemies[i];if(e.hp<=0||(e.type!=='boss'&&e.type!=='elite'&&Math.hypot(e.x-player.x,e.y-player.y)>Math.max(W,H)*2.3))enemies.splice(i,1);}
 checkMissions();autosaveClock+=dt;if(autosaveClock>=5){saveRun();}hudTimer-=dt;if(hudTimer<=0){updateHud();hudTimer=.08;}
}
