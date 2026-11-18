'use strict';
const assert=require('node:assert/strict');
require('../src/data.js');
const {KRWorld}=require('../src/engine.js');
const D=globalThis.KR_DATA;
let passed=0;
function test(name,fn){try{fn();passed++;console.log(`PASS ${name}`);}catch(error){console.error(`FAIL ${name}`);throw error;}}
function world(stage='southport',options={}){return new KRWorld(D,stage,{seed:42,...options});}
function advance(w,seconds){for(let i=0;i<seconds*60&&w.state==='playing';i++)w.update(1/60);}
function quiet(stage='southport'){const w=world(stage);w.state='playing';w.wave=w.totalWaves;w.pending.push({type:'spawn',time:1e6,enemyId:'goblin',pathIndex:0});return w;}
function makeTower(w,site,target){w.gold=10000;const def=D.towers[target];w.build(site,`${def.family}_1`);const t=w.towers.at(-1);while(t.defId!==target){const next=D.towers[t.defId].upgrades;if(next.includes(target))w.upgrade(t.id,target);else w.upgrade(t.id,next[0]);}return t;}

test('invalid purchases and upgrade paths are atomic',()=>{
 const w=world(),gold=w.gold;
 assert.equal(w.build(0,'rangers').ok,false);assert.equal(w.build(99,'archer_1').ok,false);assert.equal(w.gold,gold);
 assert.equal(w.build(0,'archer_1').ok,true);const t=w.towers[0],after=w.gold;
 assert.equal(w.build(0,'mage_1').ok,false);assert.equal(w.upgrade(t.id,'arcane').ok,false);assert.equal(w.buySkill(t.id,'poison_arrows').ok,false);assert.equal(w.gold,after);
 w.gold=0;assert.equal(w.upgrade(t.id,'archer_2').ok,false);assert.equal(t.defId,'archer_1');
});

test('every advanced branch and all eighteen abilities can be purchased',()=>{
 const skills=new Set();
 for(const d of Object.values(D.towers).filter(d=>d.tier===4)){
  const w=world(),t=makeTower(w,1,d.id);assert.equal(t.defId,d.id);
  for(const id of d.abilities){const a=D.abilities[id];for(let rank=1;rank<=a.maxLevel;rank++){assert.equal(w.buySkill(t.id,id).ok,true,`${id} rank ${rank}`);assert.equal(t.skills[id],rank);}const gold=w.gold;assert.equal(w.buySkill(t.id,id).ok,false);assert.equal(w.gold,gold);skills.add(id);}
 }
 assert.equal(skills.size,18);
});

test('building and selling soldiers never leaves orphan units',()=>{
 const w=world();w.build(4,'barracks_1');const t=w.towers[0];assert.equal(w.units.filter(u=>u.ownerId===t.id).length,3);
 const before=w.gold;assert.equal(w.sell(t.id).ok,true);assert.equal(w.gold,before+70);assert.equal(w.units.length,1);assert.equal(w.units[0],w.hero);
});

test('mode restrictions prevent disabled families and preserve gold',()=>{
 const w=world('southport',{mode:'iron'}),before=w.gold;assert.equal(w.maxLives,1);assert.equal(w.build(0,'archer_1').ok,false);assert.equal(w.gold,before);assert.equal(w.build(0,'artillery_1').ok,true);
});

test('physical, magic and explosive damage apply the appropriate resistance',()=>{
 const w=quiet(),e=w.spawn('dark_knight',0,400);e.hp=e.maxHp=1000;e.armor=.8;e.resist=.5;
 assert.ok(Math.abs(w.hit(e,100,'physical')-20)<1e-8);assert.equal(w.hit(e,100,'magic'),50);assert.equal(w.hit(e,100,'explosive'),60);assert.equal(w.hit(e,100,'true'),100);
});

test('ground-only artillery ignores air while archers acquire it',()=>{
 const w=quiet();w.gold=1000;w.build(1,'artillery_1');w.build(3,'archer_1');const e=w.spawn('gargoyle',0,400);for(const t of w.towers){e.x=t.x;e.y=t.y;assert.equal(!!w.target(t),D.towers[t.defId].family==='archer');}
});

test('spells enforce state, coordinates and cooldown, then expire reinforcements',()=>{
 const w=world();assert.equal(w.cast('meteor',300,300).ok,false);w.callWave();
 const before=w.units.length;assert.equal(w.cast('reinforcements',-5,0).ok,false);assert.equal(w.units.length,before);assert.equal(w.spells.reinforcements.remaining,0);
 assert.equal(w.cast('reinforcements',255,300).ok,true);assert.equal(w.units.filter(u=>u.kind==='reinforcement').length,2);assert.equal(w.cast('reinforcements',255,300).ok,false);
 assert.equal(w.cast('meteor',255,300).ok,true);assert.equal(w.pending.filter(e=>e.type==='meteor').length,3);assert.equal(w.cast('meteor',255,300).ok,false);
 advance(w,25);assert.equal(w.units.filter(u=>u.kind==='reinforcement').length,0);assert.equal(w.spells.reinforcements.remaining,0);
});

test('soldiers block ground enemies and respawn after their timer',()=>{
 const w=quiet();w.gold=1000;w.build(4,'barracks_1');const t=w.towers[0],p=w.nearestPath(t.rally.x,t.rally.y),e=w.spawn('ogre',p.pathIndex,p.progress);e.damage=0;e.hp=e.maxHp=10000;
 advance(w,2);const progress=e.progress;advance(w,3);assert.ok(e.progress-progress<2,'blocked enemy must stop moving');
 const u=w.units.find(u=>u.ownerId===t.id);w.hurtUnit(u,10000,'true');assert.equal(u.hp,0);advance(w,9);assert.equal(u.hp,0);advance(w,2);assert.ok(u.hp>0);
});

test('hero movement and respawn remain deterministic',()=>{
 const w=quiet();const old={x:w.hero.x,y:w.hero.y};w.moveHero(40,580);advance(w,1);assert.ok(Math.hypot(w.hero.x-old.x,w.hero.y-old.y)>100);w.hurtUnit(w.hero,10000,'true');assert.equal(w.hero.hp,0);advance(w,14);assert.equal(w.hero.hp,0);advance(w,2);assert.equal(w.hero.hp,w.hero.maxHp);
});

test('summoners create valid data IDs and zero-reward children',()=>{
 const w=quiet(),n=w.spawn('necromancer',0,10),s=w.spawn('spider_matriarch',0,25);n.abilityCd=0;s.abilityCd=0;w.update(1/60);
 assert.equal(w.enemies.filter(e=>e.defId==='skeleton').length,3);assert.equal(w.enemies.filter(e=>e.defId==='spider_hatchling').length,3);assert.ok(w.enemies.filter(e=>e.summoned).every(e=>e.gold===0));
});

test('regeneration, healing and demon explosions change the right HP pools',()=>{
 const w=quiet(),t=w.spawn('troll',0,20),s=w.spawn('shaman',0,20);t.hp-=100;s.healCd=0;const hp=t.hp;w.update(1/60);assert.ok(t.hp>hp+40);
 const demon=w.spawn('demon_spawn',0,20);w.hero.x=demon.x;w.hero.y=demon.y;const heroHp=w.hero.hp;w.hit(demon,1e4,'true');assert.ok(w.hero.hp<heroHp);
});

test('Veznan phase transition survives a killing poison tick',()=>{
 const w=quiet('dark_tower'),boss=w.spawn('veznan',0,10);boss.hp=.01;boss.poison={remaining:2,dps:10,source:null};w.update(1/60);assert.equal(boss.phase,2);assert.ok(boss.hp>0);assert.equal(w.state,'playing');assert.equal(w.stats.kills,0);
 w.hit(boss,boss.hp+1,'true');assert.equal(boss.dead,true);assert.equal(w.stats.kills,1);
});

test('final campaign boss is included before victory, challenges skip post-boss',()=>{
 for(const mode of ['campaign','heroic']){const w=world('dark_tower',{mode});w.state='playing';w.wave=w.totalWaves;w.update(1/60);if(mode==='campaign'){assert.equal(w.state,'playing');assert.equal(w.enemies[0].defId,'veznan');w.hit(w.enemies[0],1e6,'true');w.hit(w.enemies[0],1e6,'true');w.update(1/60);assert.equal(w.state,'won');}else assert.equal(w.state,'won');}
});

test('polymorphed enemies take three clicks and keep reward semantics',()=>{
 const w=quiet(),e=w.spawn('orc',0,10),before=w.gold;assert.equal(w.tapEnemy(e.id).ok,false);e.transformed=true;e.hp=e.maxHp=90;
 assert.equal(w.tapEnemy(e.id).ok,true);assert.equal(w.tapEnemy(e.id).ok,true);assert.equal(e.dead,false);assert.equal(w.tapEnemy(e.id).ok,true);assert.equal(e.dead,true);assert.equal(w.gold,before+e.gold);
});

test('manual wave queue exactly preserves the source inventory',()=>{
 for(const s of D.stages)for(const mode of ['campaign','heroic','iron']){const w=world(s.id,{mode});for(const wave of w.waveDefs){w.callLock=0;assert.equal(w.callWave().ok,true);const index=w.wave,count=wave.reduce((sum,g)=>sum+g.count,0);assert.equal(w.pending.filter(p=>p.wave===index).length,count,`${s.id}/${mode}/${index}`);}}
});

test('a seed and command replay reproduce all game outcomes',()=>{
 function replay(){const w=world();w.build(1,'archer_1');w.build(3,'mage_1');w.build(4,'barracks_1');w.callWave();advance(w,80);return JSON.stringify({gold:w.gold,lives:w.lives,kills:w.stats.kills,enemies:w.enemies.map(e=>[e.defId,e.hp,e.progress]),hero:[w.hero.hp,w.hero.level],wave:w.wave});}
 assert.equal(replay(),replay());
});

test('normal stage one wins without cheats using three towers and one upgrade',()=>{
 const w=world();w.build(1,'archer_1');w.build(3,'mage_1');w.build(4,'barracks_1');w.callWave();
 for(let tick=0;tick<60*600&&w.state==='playing';tick++){if(tick%60===0&&w.gold>=110){const t=w.towers.find(t=>t.defId==='archer_1');if(t)w.upgrade(t.id,'archer_2');}w.update(1/60);}
 assert.equal(w.state,'won');assert.equal(w.result.stars,3);assert.equal(w.result.lives,20);assert.equal(w.result.kills,56);assert.equal(w.result.cheated,false);assert.ok(w.result.duration>100&&w.result.duration<240);
 console.log('  BALANCE',JSON.stringify(w.result));
});

test('unprotected exit produces terminal defeat and stops time',()=>{
 const w=world();w.moveHero(40,590);w.callWave();advance(w,500);assert.equal(w.state,'lost');assert.equal(w.result.won,false);assert.equal(w.lives,0);const time=w.time;w.update(1);assert.equal(w.time,time);assert.equal(w.callWave().ok,false);
});

console.log(`\n${passed} engine tests passed.`);
