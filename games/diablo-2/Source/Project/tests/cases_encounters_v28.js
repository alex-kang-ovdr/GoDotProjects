() => {
 'use strict';
 const q=DarkDescentQA,results=[];
 function assert(ok,msg='assertion failed'){if(!ok)throw Error(msg);}
 function approx(a,b,eps=1e-8){assert(Math.abs(a-b)<=eps,`${a} != ${b}`);}
 function equal(a,b,msg='values differ'){assert(JSON.stringify(a)===JSON.stringify(b),msg);}
 function test(name,fn){const start=performance.now();try{const detail=fn();results.push({name,pass:true,ms:Math.round(performance.now()-start),detail:detail??null});}catch(e){results.push({name,pass:false,error:e.stack});}}
 function fresh(){
  document.querySelector('#modal').close();q.newGame('paladin',28061);q.enterArea('a1_blood_moor');q.paused=false;
  const s=q.S,p=s.p;for(const key of Object.keys(p.eq))p.eq[key]=null;
  s.enemies=[];s.minions=[];s.hazards=[];s.shots=[];s.fields=[];s.barriers=[];s.roomProgress={};s.director.objects=[];
  const c=s.rooms[0].c;p.x=(c.x+.5)*32;p.y=(c.y+.5)*32;p.invuln=0;p.slow=0;p.boneArmor=0;
  q.recalcResources();p.hp=p.maxHp;q.reveal();return s;
 }
 function gear(mods){const it=q.generateItem({baseId:'ring',quality:'normal',ilvl:1,noSockets:true,noEthereal:true,noStaffmods:true});it.mods=mods;q.S.p.eq.ring=it;q.recalcResources();return it;}
 function enemy(flag=null,type='boss',extra={}){
  const e=q.scaleEnemy(q.makeEnemy(q.S.p.x-80,q.S.p.y,type,{questFlag:flag,bossName:flag||type,activated:true,...extra}),10);
  e.atk=20;e.skillCd=0;e.cd=0;e.phase=0;e.hp=e.maxHp;q.S.enemies.push(e);return e;
 }
 const bosses=[['andariel','poison','poison',{poison:50}],['duriel','cold','cold',{cold:40,physical:10}],['mephisto','lightning','cold',{lightning:40,cold:25}],['diablo','lightning','fire',{fire:50,lightning:25}],['baal','cold','fire',{cold:40,fire:25}]];
 test('Five boss web profiles are deterministic and bounded; inspection consumes no RNG',()=>{
  fresh();const before=q.S.rngState;
  for(const [flag,shot,hazard,res]of bosses){const a=q.encounterProfile28({questFlag:flag}),b=q.encounterProfile28({questFlag:flag});equal(a,b);equal(a.shotElement,shot);equal(a.hazardElement,hazard);equal(a.resistances,res);assert(a.adapter===true);for(const v of Object.values(res))assert(v>=0&&v<=50);}
  equal(q.S.rngState,before);
 });
 test('New boss and elite resistance profiles are applied by actual spawn scaling',()=>{
  fresh();for(const [flag,,,res]of bosses){const e=enemy(flag);for(const [key,value]of Object.entries(res))equal(e.resists[key],value);assert(Object.values(e.resists).every(v=>v<100));}
  for(const [modifier,element,value]of [['armored','physical',20],['frost','cold',40],['volatile','fire',40]]){const e=enemy(null,'elite',{modifier});equal(e.resists[element],value);}
 });
 for(const [flag,element]of bosses)test(`${flag}: actual hostile projectile collision respects ${element} resistance`,()=>{
  function damage(resist){fresh();if(resist)gear({[element+'Res']:resist});const e=enemy(flag);q.fireShot(e,0,190,20,'shadow',false);const shot=q.S.shots.at(-1);equal(shot.element,element);shot.x=q.S.p.x;shot.y=q.S.p.y;const before=q.S.p.hp;q.updateProjectiles(1/60);assert(q.S.shots.length===0,'projectile did not collide');return before-q.S.p.hp;}
  approx(damage(0),20);approx(damage(50),10);
 });
 test('Boss AI tags its existing hazard without changing telegraph delay, radius or raw damage',()=>{
  fresh();const e=enemy('diablo');const rng=q.S.rngState;q.ai(e,0);equal(q.S.rngState,rng,'tagging consumed RNG');
  assert(q.S.hazards.length===1);const hazard=q.S.hazards[0];equal(hazard.element,'fire');approx(hazard.delay,1.15);approx(hazard.total,1.15);approx(hazard.damage,30);equal(hazard.r,53);equal(e.windup.kind,'bossFan');approx(e.windup.total,.65);equal(e.windup.element,'lightning');
 });
 test('Boss hazard uses actual update collision and fire resistance; no repeated damage',()=>{
  function damage(resist){fresh();if(resist)gear({fireRes:resist});const e=enemy('diablo');q.ai(e,0);q.S.enemies=[];const hp=q.S.p.hp;q.step(70);assert(!q.S.hazards.length,'hazard not consumed');const loss=hp-q.S.p.hp;q.step(10);approx(hp-q.S.p.hp,loss);return loss;}
  approx(damage(0),30);approx(damage(50),15);
 });
 test('Sealed Diablo neither schedules hazards nor releases queued projectiles',()=>{
  fresh();const e=enemy('diablo');e.sealed=true;e.windup={kind:'bossFan',left:0,total:.65,angle:0,reach:20};const rng=q.S.rngState;
  q.ai(e,.5);q.resolveWindup(e);q.fireShot(e,0,180,20,'shadow',false);equal(q.S.shots.length,0);equal(q.S.hazards.length,0);equal(q.S.rngState,rng);assert(e.sealed);
 });
 function meleeUntilHit(e,max=12){
  const hp=q.S.p.hp;for(let i=0;i<max&&q.S.p.hp===hp;i++){e.windup={kind:'melee',left:0,total:.43,angle:0,reach:20};q.resolveWindup(e);}assert(q.S.p.hp<hp,'deterministic melee fixture did not hit');return hp-q.S.p.hp;
 }
 test('Frost elite applies chill only on real damage; CBF and invulnerability protect',()=>{
  fresh();let e=enemy(null,'elite',{modifier:'frost'});e.x=q.S.p.x-24;meleeUntilHit(e);approx(q.S.p.slow,1.4);
  fresh();gear({cannotBeFrozen:1});e=enemy(null,'elite',{modifier:'frost'});e.x=q.S.p.x-24;meleeUntilHit(e);approx(q.S.p.slow,0);
  fresh();e=enemy(null,'elite',{modifier:'frost'});e.x=q.S.p.x-24;q.S.p.invuln=2;const hp=q.S.p.hp;
  for(let i=0;i<5;i++){e.windup={kind:'melee',left:0,total:.43,angle:0,reach:20};q.resolveWindup(e);}approx(q.S.p.hp,hp);approx(q.S.p.slow,0);
 });
 test('Vampiric elite heals from actual melee damage, never invulnerable or overkill health',()=>{
  fresh();let e=enemy(null,'elite',{modifier:'vampiric'});e.x=q.S.p.x-24;e.hp=100;e.maxHp=200;const loss=meleeUntilHit(e);approx(e.hp,100+loss*.18);
  q.S.p.invuln=2;const healed=e.hp;for(let i=0;i<5;i++){e.windup={kind:'melee',left:0,total:.43,angle:0,reach:20};q.resolveWindup(e);}approx(e.hp,healed);
  fresh();e=enemy(null,'elite',{modifier:'vampiric'});e.x=q.S.p.x-24;e.hp=100;e.maxHp=200;
  const pet={x:e.x,y:e.y,hp:10,r:9};q.S.minions=[pet];const hp=q.S.p.hp;e.windup={kind:'melee',left:0,total:.43,angle:0,reach:20};q.resolveWindup(e);
  assert(pet.hp<=0);approx(q.S.p.hp,hp);approx(e.hp,101.8);
 });
 test('Boss phase transition still summons two guards, keeps four-guard cap and quest flags',()=>{
  fresh();const e=enemy('andariel');e.hp=e.maxHp*.5;e.skillCd=5;const flags=JSON.stringify(q.S.world.flags);
  q.ai(e,0);equal(e.phase,1);equal(q.S.enemies.filter(x=>x.summoned).length,2);
  e.hp=e.maxHp*.25;q.ai(e,0);equal(e.phase,2);equal(q.S.enemies.filter(x=>x.summoned).length,4);
  q.spawnBossAdds(e);equal(q.S.enemies.filter(x=>x.summoned).length,4);equal(JSON.stringify(q.S.world.flags),flags);
 });
 test('Restored region snapshots retain existing resistance values without reprofiling',()=>{
  fresh();const e=enemy('andariel'),id=e.id;e.resists={fire:0,cold:0,lightning:0,poison:0,magic:0,physical:0};const original=JSON.stringify(e.resists);
  q.enterArea(q.data.world.towns[1]);q.enterArea('a1_blood_moor');const restored=q.S.enemies.find(x=>x.id===id);assert(restored);equal(JSON.stringify(restored.resists),original);equal(q.encounterProfile28(restored).shotElement,'poison');
 });
 test('Pressure and volatile blast classification preserves damage and timers',()=>{
  fresh();q.S.hazards.push({x:q.S.p.x+100,y:q.S.p.y,r:53,delay:.95,total:.95,damage:28,kind:'blast'});q.updateRestoredSystems(0);
  const hazard=q.S.hazards[0];equal(hazard.element,'fire');approx(hazard.damage,28);approx(hazard.delay,.95);approx(hazard.total,.95);
 });
 test('Friendly projectiles keep their packet semantics and enemy warning renders are pure',()=>{
  fresh();const e=enemy('mephisto');q.fireShot(q.S.p,0,190,10,'arrow',true);const friendly=q.S.shots.at(-1);equal(friendly.kind,'arrow');assert(!friendly.element&&!friendly.encounterAdapter);
  q.ai(e,0);q.resolveWindup(e);q.reveal();const rng=q.S.rngState,before=JSON.stringify(q.exportState());q.render();equal(q.S.rngState,rng);equal(JSON.stringify(q.exportState()),before,'render changed gameplay state');
 });
 return {suite:'encounters_v28',passed:results.filter(x=>x.pass).length,failed:results.filter(x=>!x.pass).length,total:results.length,results};
}
