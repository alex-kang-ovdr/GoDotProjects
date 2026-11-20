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
 assert.equal(w.enemies.filter(e=>e.summonerId===n.id).length,5);assert.ok(w.enemies.filter(e=>e.summonerId===n.id).every(e=>['skeleton','skeleton_knight'].includes(e.defId)));assert.equal(w.enemies.filter(e=>e.defId==='spider_hatchling').length,3);assert.ok(w.enemies.filter(e=>e.summoned).every(e=>e.gold===0));
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


test('source difficulty HP is used while null boss difficulty remains an explicit fallback',()=>{
 for(const [difficulty,hp]of[['casual',16],['normal',20],['veteran',24]]){const w=world('southport',{difficulty});assert.equal(w.spawn('goblin').hp,hp);}
 const w=world('stormcloud',{difficulty:'casual'}),boss=w.spawn('jt');assert.ok(boss.hp>1000);assert.equal(boss.hpEvidence,'custom_difficulty_fallback');
});

test('reference restrictions disable heroes without respawning and gate wave-five Rangers',()=>{
 const w=world('southport',{ruleset:'reference'});assert.equal(w.gold,265);assert.equal(w.heroEnabled,false);assert.equal(w.units.length,0);assert.equal(w.moveHero(300,300).ok,false);w.callWave();advance(w,20);assert.equal(w.units.length,0);assert.equal(w.hero.hp,0);assert.equal(w.isTowerUnlocked('archer_2'),false);
 const s=world('silveroak',{ruleset:'reference'});assert.equal(s.isTowerUnlocked('rangers'),false);for(let n=1;n<=5;n++){s.callLock=0;s.callWave();assert.equal(s.isTowerUnlocked('rangers'),n===5);}
 const challenge=world('southport',{ruleset:'reference',mode:'heroic',upgrades:{mage:5}});assert.equal(challenge.permanent.mage,1);assert.equal(challenge.towerCost('mage_1'),100);assert.equal(challenge.modeDef.maxTier,4);
});

test('reference discounts charge actual gold and salvage refunds the actual investment',()=>{
 const w=world('dark_tower',{ruleset:'reference',upgrades:{mage:3,artillery:4,archer:1}});
 assert.equal(w.towerCost('mage_1'),90);assert.equal(w.towerCost('artillery_1'),112);assert.equal(w.towerCost('tesla'),337);
 const t=makeTower(w,0,'bertha');assert.equal(t.invested,958);assert.equal(w.abilityCost(t.id,'cluster_launcher'),187);const before=w.gold;assert.equal(w.buySkill(t.id,'cluster_launcher').ok,true);assert.equal(w.gold,before-187);assert.equal(t.invested,1145);
 w.wave=1;const gold=w.gold;assert.equal(w.refundFraction(t),.9);w.sell(t.id);assert.equal(w.gold,gold+1030);
});

test('reference barracks upgrades combine base HP additively and use the documented respawn candidate',()=>{
 const w=world('dark_tower',{ruleset:'reference',upgrades:{barracks:5}}),t=makeTower(w,0,'holy_order');w.buySkill(t.id,'shield_valor');const u=w.units.find(u=>u.ownerId===t.id);
 assert.equal(u.maxHp,240);assert.equal(u.armor,.75);assert.equal(u.respawn,11);assert.equal(w.rallyRange(t),204);
});

test('archer penetration is an armor point reduction and full resistance truly blocks damage',()=>{
 const w=world('dark_tower',{ruleset:'reference',upgrades:{archer:3}});w.gold=1000;w.build(0,'archer_1');const t=w.towers[0],e=w.spawn('brigand');e.hp=e.maxHp=1000;e.armor=.5;
 assert.equal(w.hit(e,100,'physical',t.id),60);e.armor=1;e.resist=1;assert.equal(w.hit(e,100,'magical'),0);assert.equal(w.hit(e,100,'physical'),0);assert.equal(w.hit(e,100,'explosive'),50);
});

test('enemy ranged attacks stop movement and true ranged damage bypasses soldier armor',()=>{
 const w=quiet(),e=w.spawn('shadow_archer',0,100);w.hero.x=e.x+110;w.hero.y=e.y;w.hero.rally={x:w.hero.x,y:w.hero.y};w.hero.targetId=null;w.hero.moveOrder=0;e.cd=0;const before=w.hero.hp,progress=e.progress;
 w.tickEnemy(e,1/60);assert.equal(e.progress,progress);assert.equal(w.projectiles.length,1);assert.equal(w.projectiles[0].hostile,true);assert.equal(e.cd,1.4);w.tickProjectile(w.projectiles[0],1);assert.ok(Math.abs(w.hero.hp-(before-25.5*.7))<1e-7);
 w.hero.x=e.x+12;w.hero.targetId=e.id;e.cd=0;const shots=w.stats.enemyRangedAttacks;w.tickEnemy(e,1/60);assert.equal(w.stats.enemyRangedAttacks,shots);assert.equal(e.cd,1);
 const c=w.spawn('troll_champion',0,150);w.hero.x=c.x+100;w.hero.y=c.y;w.hero.armor=.9;w.hero.hp=300;w.hero.targetId=null;c.cd=0;w.tickEnemy(c,1/60);const p=w.projectiles.at(-1);assert.equal(p.type,'true');w.tickProjectile(p,1);assert.equal(w.hero.hp,239.5);
});

test('necromancers respect blocking, source child count and the per-caster live limit',()=>{
 const w=quiet(),e=w.spawn('necromancer',0,100);w.hero.x=e.x;w.hero.y=e.y;w.hero.targetId=e.id;w.hero.moveOrder=0;e.abilityCd=0;
 w.tickEnemy(e,1/60);assert.equal(w.enemies.filter(x=>x.summoned).length,0);
 w.hero.moveOrder=1;for(let n=0;n<8;n++){e.abilityCd=0;w.tickEnemy(e,1/60);}const children=w.enemies.filter(x=>x.summonerId===e.id);assert.equal(children.length,35);assert.ok(children.every(x=>['skeleton','skeleton_knight'].includes(x.defId)&&x.gold===0));
});

test('poison and polymorph respect plural immunity definitions',()=>{
 const w=quiet(),t=makeTower(w,0,'sorcerer');w.buySkill(t.id,'polymorph');const e=w.spawn('skeleton',0,100);e.x=t.x;e.y=t.y;e.hp=e.maxHp=1000;w.tickTower(t,1/60);assert.equal(!!e.transformed,false);
 const p={x:t.x,y:t.y,startX:t.x,startY:t.y,tx:e.x,ty:e.y,targetId:e.id,sourceId:t.id,damage:1,kind:'arrow',type:'physical',age:0,duration:.1,poison:{remaining:3,dps:5}};w.tickProjectile(p,1);assert.equal(e.poison,null);assert.equal(w.isImmune(e,'polymorph'),true);
});

test('regeneration uses discrete source pulses and source stun exceptions',()=>{
 const w=quiet(),t=w.spawn('troll',0,100),c=w.spawn('troll_champion',0,100);t.hp=c.hp=100;t.stunned=c.stunned=2;w.hero.x=900;w.hero.y=600;
 for(let n=0;n<60;n++){w.tickEnemy(t,1/60);w.tickEnemy(c,1/60);}assert.equal(t.hp,105);assert.equal(c.hp,100);
 t.hp=100;t.frozen=2;t.regenAccumulator=0;for(let n=0;n<60;n++)w.tickEnemy(t,1/60);assert.equal(t.hp,100);
});

test('infernal shields cap targets and charges without spending a charge on poison ticks',()=>{
 const w=quiet(),lord=w.spawn('demon_lord',0,100);for(let n=0;n<6;n++)w.spawn('demon_spawn',0,100+n*3);w.spawn('goblin',0,110);lord.abilityCd=0;w.tickEnemy(lord,1/60);
 const shielded=w.enemies.filter(e=>e.shield>0);assert.equal(shielded.length,4);assert.ok(shielded.every(e=>e.defId==='demon_spawn'&&e.shield===4));assert.equal(lord.abilityCd,6);
 const target=shielded[0],hp=target.hp;w.hit(target,5,'true',null,{dot:true});assert.equal(target.shield,4);assert.equal(target.hp,hp);w.hit(target,100,'physical');assert.equal(target.shield,3);w.hit(target,target.hp+1,'true',null,{instant:true});assert.equal(target.dead,true);
});

test('sorcerer curse deals four pulses and mage upgrades chip armor and slow eligible enemies',()=>{
 const w=world('dark_tower',{ruleset:'reference',upgrades:{mage:5}});w.state='playing';w.gold=1000;w.build(0,'mage_1');const t=w.towers[0],e=w.spawn('brigand',0,100);e.hp=e.maxHp=1000;e.armor=.5;
 w.launch(t,e,100,'bolt','magical',{mageHit:true});w.tickProjectile(w.projectiles.at(-1),1);assert.ok(Math.abs(e.armor-.47)<1e-8);assert.equal(e.slow,.5);assert.equal(e.slowMultiplier,.5);
 const curse=w.spawn('brigand',0,10);curse.hp=1000;curse.maxHp=1000;curse.curse=5;curse.curseInterval=1.25;curse.cursePulse=10;for(let n=0;n<300;n++)w.tickEnemy(curse,1/60);assert.equal(curse.hp,960);
});

test('reference fire and reinforcement trees apply every final-tier branch',()=>{
 const w=world('dark_tower',{ruleset:'reference',upgrades:{meteor:5,reinforcements:5}});w.callWave();assert.equal(w.cast('meteor',300,300).ok,true);assert.equal(w.pending.filter(p=>p.type==='meteor').length,10);assert.equal(w.pending.filter(p=>p.type==='burn').length,10);assert.ok(w.pending.filter(p=>p.type==='meteor').every(p=>p.damage===165&&p.radius===75));assert.equal(w.spells.meteor.remaining,60);
 const p=w.pathPosition(0,250);assert.equal(w.cast('reinforcements',p.x,p.y).ok,true);const u=w.units.find(u=>u.kind==='reinforcement');assert.equal(u.hp,110);assert.equal(u.damage,8);assert.equal(u.armor,.3);assert.equal(u.rangedDamage,32.5);assert.equal(u.rangedInterval,1.4);assert.equal(u.ranged,true);
});

test('reconstructed geometry is isolated per world and special sites reject generic construction',()=>{
 const stage={...D.stages[0],referencePaths:[[[0,100],[1000,100]]],referenceSites:[{x:200,y:180},{x:400,y:180,buildable:false}]},data={...D,stages:[stage]};
 const w=new KRWorld(data,stage.id,{layout:'reconstructed'});assert.equal(w.layout,'reconstructed');assert.equal(w.paths[0].length,1000);const gold=w.gold;assert.equal(w.build(1,'archer_1').ok,false);assert.equal(w.gold,gold);assert.equal(stage.paths,D.stages[0].paths);
 assert.equal(w.build(0,'archer_1').ok,true);const t=w.towers[0];assert.equal(w.setTargetMode(t.id,'strongest').ok,true);const weak=w.spawn('goblin',0,400),strong=w.spawn('orc',0,150);weak.x=strong.x=t.x;weak.y=strong.y=t.y;assert.equal(w.target(t),strong);assert.equal(w.setTargetMode(t.id,'first').ok,true);assert.equal(w.target(t),weak);
});

test('all reconstructed waves preserve counts and route source-labeled groups to the mapped entry',()=>{
 let slots=0,mappedGroups=0,unresolvedGroups=0;
 for(const stage of D.stages)for(const mode of ['campaign','heroic','iron']){
  const w=world(stage.id,{mode,layout:'reconstructed',ruleset:'reference'});assert.equal(w.layout,'reconstructed');
  for(const wave of w.waveDefs){w.callLock=0;assert.equal(w.callWave().ok,true);const events=w.pending.filter(p=>p.wave===w.wave);assert.equal(events.length,wave.reduce((n,g)=>n+g.count,0));let offset=0;
   for(const group of wave){const spawns=events.slice(offset,offset+group.count);if(Number.isInteger(group.referencePath)){mappedGroups++;for(const event of spawns)assert.equal(event.pathIndex,group.referencePath,`${stage.id}/${mode}/${w.wave}/${group.sourceEntryLabel}`);}else{unresolvedGroups++;for(const event of spawns){assert.equal(event.routingStatus,'custom_primary_route_distribution');const spec=stage.referenceGeometry.pathSpecs.find(p=>p.index===event.pathIndex);assert.notEqual(spec.id,'east_spiders');assert.equal(spec.entryLabels.some(label=>label.startsWith('cave')),false);}}offset+=group.count;}
   slots++;
  }
 }
 assert.equal(slots,260);assert.equal(mappedGroups,347);assert.equal(unresolvedGroups,450);
});

test('observed preplaced Silveroak tower belongs only to its campaign mode',()=>{
 const campaign=world('silveroak',{layout:'reconstructed',ruleset:'reference'}),site=campaign.stage.sites.findIndex(s=>s.label==='E7'),tower=campaign.towers.find(t=>t.siteIndex===site);
 assert.equal(tower.defId,'archer_3');assert.equal(tower.preplaced,true);assert.equal(campaign.gold,700);assert.equal(campaign.stats.spent,0);assert.equal(campaign.build(site,'archer_1').ok,false);
 for(const mode of ['heroic','iron'])assert.equal(world('silveroak',{layout:'reconstructed',ruleset:'reference',mode}).towers.length,0);
 const elf=campaign.stage.sites.findIndex(s=>s.specialStructure==='sylvan_elf_hall');assert.equal(campaign.build(elf,'archer_1').ok,false);
});

test('reconstructed Southport is playable with both assisted and source economy settings',()=>{
 for(const ruleset of ['assisted','reference']){
  const w=world('southport',{layout:'reconstructed',ruleset});for(const [label,id]of[['B5','archer_1'],['C3','mage_1'],['B3','barracks_1']])assert.equal(w.build(w.stage.sites.findIndex(s=>s.label===label),id).ok,true);
  assert.equal(w.callWave().ok,true);let fourthTower=false;
  for(let tick=0;tick<60*600&&w.state==='playing';tick++){
   if(ruleset==='reference'&&!fourthTower&&w.gold>=100){assert.equal(w.build(w.stage.sites.findIndex(s=>s.label==='E3'),'mage_1').ok,true);fourthTower=true;}
   w.update(1/60);
  }
  assert.equal(w.state,'won');assert.equal(w.result.stars,3);assert.ok(w.result.lives>=18);assert.equal(w.result.cheated,false);assert.equal(w.stats.kills+w.stats.leaks,56);assert.equal(w.result.layout,'reconstructed');
  console.log('  V16_RECONSTRUCTED_PLAY',JSON.stringify(w.result));
 }
});

test('special facilities appear only at documented reconstructed sites in supported modes',()=>{
 assert.ok(D.specialComponents?.facilities?.sylvan_elf_hall,'bundled data must contain the v17 facility component');
 for(const [stage,type]of[['silveroak','sylvan_elf_hall'],['stormcloud','sunray_tower']])for(const mode of ['campaign','heroic','iron']){
  const w=world(stage,{layout:'reconstructed',mode}),f=w.facilities[0];assert.equal(w.facilities.length,1);assert.equal(f.type,type);assert.equal(w.getFacilityAtSite(f.siteIndex),f);assert.equal(w.stage.sites[f.siteIndex].specialStructure,type);assert.equal(f.restored,type==='sunray_tower');
  assert.equal(world(stage,{layout:'authored',mode}).facilities.length,0);
 }
 assert.equal(world('southport',{layout:'reconstructed'}).facilities.length,0);
});

test('elf repair, hiring limits and permanent casualties preserve atomic gold semantics',()=>{
 const w=world('silveroak',{layout:'reconstructed',ruleset:'reference'}),f=w.facilities[0];
 const start=w.gold;assert.equal(w.hireFacilityUnit(f.id).ok,false);assert.equal(w.restoreFacility(-1).ok,false);assert.equal(w.gold,start);
 w.gold=99;assert.equal(w.restoreFacility(f.id).ok,false);assert.equal(f.restored,false);assert.equal(w.gold,99);
 w.gold=600;assert.equal(w.restoreFacility(f.id).ok,true);assert.equal(w.gold,500);assert.equal(w.restoreFacility(f.id).ok,false);assert.equal(w.gold,500);
 for(let n=0;n<4;n++)assert.equal(w.hireFacilityUnit(f.id).ok,true);assert.equal(w.gold,100);assert.equal(w.facilityInfo(f).count,4);assert.equal(w.hireFacilityUnit(f.id).ok,false);assert.equal(w.gold,100);
 const elf=w.units.find(u=>u.kind==='elf');assert.equal(elf.maxHp,100);w.hurtUnit(elf,1000,'true');assert.equal(w.facilityInfo(f).count,3);w.time=100;w.tickUnit(elf,1);assert.equal(elf.hp,0);assert.equal(elf.expired,true);assert.equal(w.facilityInfo(f).count,3);
 assert.equal(w.hireFacilityUnit(f.id).ok,true);assert.equal(w.gold,0);assert.equal(w.facilityInfo(f).count,4);assert.equal(w.units.filter(u=>u.kind==='elf'&&u.hp>0).length,4);assert.equal(w.stats.facilityHires,5);
 const casual=world('silveroak',{layout:'reconstructed',difficulty:'casual'}),cf=casual.facilities[0];casual.restoreFacility(cf.id);casual.hireFacilityUnit(cf.id);assert.equal(casual.units.find(u=>u.kind==='elf').maxHp,120);
});

test('elves block ground enemies, shoot air, regenerate out of combat and obey rally limits',()=>{
 const w=world('silveroak',{layout:'reconstructed',ruleset:'reference',upgrades:{barracks:5}}),f=w.facilities[0];w.restoreFacility(f.id);w.hireFacilityUnit(f.id);const u=w.units.find(u=>u.kind==='elf');
 assert.equal(w.facilityRallyRange(f),174);const rally={...f.rally};assert.equal(w.setFacilityRally(f.id,NaN,10).ok,false);assert.equal(w.setFacilityRally(f.id,999,600).ok,false);assert.deepEqual(f.rally,rally);
 assert.equal(w.setFacilityRally(f.id,rally.x,rally.y).ok,true);u.x=rally.x;u.y=rally.y;u.moveOrder=0;
 const air=w.spawn('gargoyle',0,100);air.x=u.x+100;air.y=u.y;air.hp=air.maxHp=1000;const before=air.hp;u.axeCd=0;w.tickUnit(u,1/60);const arrow=w.projectiles.at(-1);assert.equal(arrow.kind,'arrow');assert.equal(arrow.sourceId,f.id);w.tickProjectile(arrow,1);assert.ok(air.hp<before);assert.ok(f.damage>0);assert.equal(f.shots,1);
 air.dead=true;w.enemies=[];u.hp=30;u.lastCombat=0;w.time=1;w.tickUnit(u,.5);assert.equal(u.hp,30);w.time=3;w.tickUnit(u,.5);assert.equal(u.hp,40);
 const p=w.nearestPath(rally.x,rally.y),ground=w.spawn('orc',p.pathIndex,p.progress);ground.x=u.x;ground.y=u.y;ground.hp=ground.maxHp=1000;ground.damage=0;u.targetId=ground.id;u.cd=0;const groundHp=ground.hp;w.tickUnit(u,1/60);assert.ok(ground.hp<groundHp);const progress=ground.progress;w.tickEnemy(ground,1/60);assert.equal(ground.progress,progress);
 const hp=ground.hp;w.hurtUnit(u,10,'physical');assert.equal(ground.hp,hp-1,'source candidate Spiked Armor applies to elves');u.hp=5;const lowHpTarget=ground.hp;w.hurtUnit(u,50,'physical');assert.equal(ground.hp,lowHpTarget-5,'elf reflection uses incoming damage, even when fatal');
});

test('Sunray enforces purchase, state and cooldown while true single-target damage reaches air globally',()=>{
 const w=world('stormcloud',{layout:'reconstructed',ruleset:'reference'}),f=w.facilities[0],before=w.gold;
 assert.equal(f.restored,true);assert.equal(w.restoreFacility(f.id).ok,false);assert.equal(w.gold,before);assert.equal(w.fireSunray(f.id,1).ok,false);
 w.gold=99;assert.equal(w.hireFacilityUnit(f.id).ok,false);assert.equal(f.workers,0);assert.equal(w.gold,99);
 w.gold=600;assert.equal(w.hireFacilityUnit(f.id).ok,true);assert.equal(w.gold,500);assert.equal(w.fireSunray(f.id,1).ok,false);assert.equal(f.cd,0);w.callWave();w.pending=[];w.pending.push({type:'spawn',time:1e6,enemyId:'goblin',pathIndex:0});
 const air=w.spawn('gargoyle',0,0),nearby=w.spawn('goblin',0,0);air.x=990;air.y=80;nearby.x=988;nearby.y=80;air.hp=air.maxHp=1000;nearby.hp=1000;air.armor=air.resist=1;
 assert.equal(w.fireSunray(f.id,NaN,20).ok,false);assert.equal(w.fireSunray(f.id,500,610).ok,false);assert.equal(f.cd,0);assert.equal(f.shots,0);
 assert.equal(w.fireSunray(f.id,air.id).ok,true);assert.equal(air.hp,899.5);assert.equal(nearby.hp,1000);assert.equal(f.cd,19);assert.equal(f.damage,100.5);assert.equal(f.shots,1);
 const hp=air.hp;assert.equal(w.fireSunray(f.id,air.id).ok,false);assert.equal(air.hp,hp);assert.equal(f.cd,19);
 assert.equal(w.hireFacilityUnit(f.id).ok,true);assert.equal(f.cd,0);assert.equal(f.cooldown,16);assert.equal(w.fireSunray(f.id,air.x,air.y-25).ok,true);assert.equal(air.hp,hp-150.5);assert.equal(f.cd,16);
 for(let n=0;n<2;n++)assert.equal(w.hireFacilityUnit(f.id).ok,true);assert.equal(f.workers,4);assert.equal(f.cooldown,10);const gold=w.gold;assert.equal(w.hireFacilityUnit(f.id).ok,false);assert.equal(w.gold,gold);
 assert.equal(w.fireSunray(f.id,air.id).ok,true);assert.equal(f.cd,10);assert.equal(w.stats.sunrayShots,3);
 w.update(.05);assert.ok(f.cd<10&&f.cd>9.9);w.finish(true);const cooldown=f.cd;w.update(1);assert.equal(f.cd,cooldown);assert.equal(w.hireFacilityUnit(f.id).ok,false);assert.equal(w.fireSunray(f.id,air.id).ok,false);
});

test('magma starts 400 simulation seconds after the first call and repeats on a separate visual connector',()=>{
 for(const mode of ['campaign','heroic','iron'])assert.equal(world('forsaken',{mode}).stageEventState.length,1);
 assert.equal(world('wastes').stageEventState.length,0,'unresolved graveyard event must not activate');
 const w=world('forsaken',{layout:'reconstructed',ruleset:'reference'}),s=w.stageEventState[0],stagePaths=w.stage.paths,primary=[...w.primaryPathIndices];
 w.update(1);assert.equal(w.time,0);assert.equal(s.nextAt,null);assert.equal(s.status,'waiting');w.time=75;w.callWave();assert.equal(s.nextAt,475);assert.equal(w.battleStartedAt,75);
 w.wave=w.totalWaves;w.pending=[{type:'spawn',time:1e6,enemyId:'goblin',pathIndex:0}];w.enemies=[];w.towers=[];w.units=[];
 advance(w,399.9);assert.equal(s.count,0);assert.ok(s.remaining>.05&&s.remaining<.2);const pausedTime=w.time,remaining=s.remaining;w.update(0);w.update(NaN);assert.equal(w.time,pausedTime);assert.equal(s.remaining,remaining);
 advance(w,.2);assert.equal(s.count,1);assert.equal(w.stats.stageEventSpawns,1);assert.ok(Math.abs(w.eventLog[0].time-475)<.02);const e=w.enemies.find(e=>e.sourceEventId==='forsaken_lava');assert.ok(e);assert.equal(e.sourceWave,null);assert.equal(e.gold,D.enemies.magma_elemental.gold);assert.equal(e.routingStatus,'custom_visual_route_adaptation');assert.equal(w.paths.length,3);assert.equal(w.paths[e.pathIndex].eventOnly,true);assert.equal(w.stage.paths,stagePaths);assert.equal(stagePaths.length,2);assert.deepEqual(w.primaryPathIndices,primary);
 const route=w.paths[e.pathIndex],connector=w.stage.referenceGeometry.terrainFeatures.find(f=>f.id==='volcano_connector').points;assert.deepEqual(route.points[0],{x:connector[0][0],y:connector[0][1]});assert.deepEqual(route.points.at(-1),w.paths[0].points.at(-1));e.speed=0;e.damage=0;
 advance(w,119.7);assert.equal(s.count,1);advance(w,.3);assert.equal(s.count,2);assert.equal(s.occurrences,2);assert.equal(w.paths.length,3,'event path is cached, never appended each cycle');assert.equal(w.eventLog.length,2);assert.ok(Math.abs(w.eventLog[1].time-595)<.02);
 const second=w.enemies.find(e=>e.id!==w.enemies[0].id);assert.ok(second);const eventGold=w.gold;w.hit(e,1e6,'true');assert.equal(w.gold,eventGold+D.enemies.magma_elemental.gold);
 w.finish(false);const elapsed=w.time,spawned=s.count;w.update(1);assert.equal(w.time,elapsed);assert.equal(s.count,spawned);assert.equal(s.remaining,null);assert.equal(s.status,'stopped');
});

test('future magma repeats never delay final-wave victory and authored fallback stays explicit',()=>{
 const w=world('forsaken',{layout:'reconstructed'});w.callWave();w.wave=w.totalWaves;w.pending=[];w.enemies=[];w.time=400;w.update(1/60);assert.equal(w.state,'won');assert.equal(w.stats.stageEventSpawns,0);assert.equal(w.result.stageEventSpawns,0);
 const authored=world('forsaken',{layout:'authored'});authored.callWave();authored.wave=authored.totalWaves;authored.pending=[{type:'spawn',time:1e6,enemyId:'goblin',pathIndex:0}];authored.time=400;authored.update(1/60);const e=authored.enemies.find(e=>e.sourceEventId==='forsaken_lava');assert.ok(e);assert.equal(e.pathIndex,0);assert.equal(e.routingStatus,'custom_authored_primary_entry');assert.equal(authored.paths.length,authored.stage.paths.length);
});

test('reconstructed Silveroak wins a complete normal campaign with paid elves and no cheats',()=>{
 const w=world('silveroak',{layout:'reconstructed',ruleset:'assisted'}),f=w.facilities[0];assert.equal(w.restoreFacility(f.id).ok,true);assert.equal(w.hireFacilityUnit(f.id).ok,true);
 const plans=[['G7','mage_1'],['C6','barracks_1'],['E9','mage_1'],['F4','artillery_1'],['F1','archer_1'],['A7','mage_1']];
 const buy=()=>{for(const [label,id]of plans){const si=w.stage.sites.findIndex(s=>s.label===label);if(!w.towers.some(t=>t.siteIndex===si)&&w.gold>=w.towerCost(id))assert.equal(w.build(si,id).ok,true);}};
 buy();w.callWave();
 for(let tick=0;tick<60*900&&w.state==='playing';tick++){
  if(tick%30===0){
   buy();for(const t of w.towers){const d=D.towers[t.defId];if(d.tier<3&&w.gold>=w.towerCost(d.upgrades[0]))assert.equal(w.upgrade(t.id,d.upgrades[0]).ok,true);}
   if(w.facilityInfo(f).count<4&&w.gold>=100)assert.equal(w.hireFacilityUnit(f.id).ok,true);
   const e=w.enemies.filter(e=>!e.dead&&!e.air).sort((a,b)=>(w.paths[a.pathIndex].length-a.progress)-(w.paths[b.pathIndex].length-b.progress))[0];
   if(e){if(w.spells.meteor.remaining<=0)w.cast('meteor',e.x,e.y);if(w.spells.reinforcements.remaining<=0)w.cast('reinforcements',e.x,e.y);}
  }
  w.update(1/60);
 }
 assert.equal(w.state,'won');assert.equal(w.result.cheated,false);assert.equal(w.result.stars,3);assert.equal(w.result.lives,20);assert.ok(f.kills>100);assert.ok(f.damage>8000);assert.ok(w.stats.facilityHires>4,'real casualties must be replaced with paid hires');assert.equal(w.result.facilityHires,w.stats.facilityHires);assert.ok(w.result.duration<600);
 console.log('  V17_FACILITY_PLAY',JSON.stringify({result:w.result,facility:{damage:f.damage,kills:f.kills,shots:f.shots}}));
});

test('escape telemetry separates enemy counts, nominal costs and actual lives at each route exit',()=>{
 const stage={...D.stages[0],paths:[[[10,150],[1000,150]],[[700,0],[700,620]]]};
 const w=new KRWorld({...D,stages:[stage]},stage.id,{seed:42});w.state='playing';w.units=[];w.lives=2;
 const first=w.spawn('goblin',0,w.paths[0].length-.01);w.tickEnemy(first,1/60);
 assert.equal(first.escaped,true);assert.equal(w.lives,1);assert.equal(w.effects.at(-1).x,968);assert.equal(w.effects.at(-1).y,126);
 const second=w.spawn('ogre',1,w.paths[1].length-.01);w.tickEnemy(second,1/60);w.tickEnemy(second,1/60);
 assert.equal(w.lives,0);assert.equal(w.stats.leaks,4,'nominal costs preserve the original counter, including overkill');
 assert.equal(w.stats.escapedEnemies,2);assert.equal(w.stats.lifeLoss,2,'actual lives cannot exceed what remained');
 assert.deepEqual(w.stats.leaksByEnemy,{goblin:1,ogre:1});assert.deepEqual(w.stats.lifeLossByEnemy,{goblin:1,ogre:1});
 assert.equal(w.effects.at(-1).x,700);assert.equal(w.effects.at(-1).y,592);assert.equal(w.effects.at(-1).text,'−1 ♥');
 w.finish(false);assert.equal(w.result.lifeLoss,2);assert.equal(w.result.leaks,4);assert.equal(w.result.escapedEnemies,2);assert.deepEqual(w.result.leaksByEnemy,{goblin:1,ogre:1});
 const protectedWorld=quiet();protectedWorld.units=[];protectedWorld.invincible=true;const e=protectedWorld.spawn('ogre',0,protectedWorld.paths[0].length-.01);protectedWorld.tickEnemy(e,1/60);
 assert.equal(protectedWorld.lives,protectedWorld.maxLives);assert.equal(protectedWorld.stats.leaks,3);assert.equal(protectedWorld.stats.escapedEnemies,1);assert.equal(protectedWorld.stats.lifeLoss,0);assert.deepEqual(protectedWorld.stats.lifeLossByEnemy,{ogre:0});
});

test('sold towers retain prior damage and later projectile or poison attribution without changing combat',()=>{
 const w=quiet();assert.equal(w.build(0,'archer_1').ok,true);const t=w.towers[0],paid=t.invested;
 const e=w.spawn('goblin',0,100);e.hp=e.maxHp=20;assert.equal(w.hit(e,12,'physical',t.id),12);
 w.launch(t,e,25,'arrow','physical');const projectile=w.projectiles.at(-1);assert.equal(w.sell(t.id).ok,true);assert.equal(w.getTower(t.id),null);
 w.tickProjectile(projectile,1);assert.equal(e.dead,true);assert.equal(w.stats.retiredTowers[0].damage,20);assert.equal(w.stats.retiredTowers[0].kills,1);
 const poisoned=w.spawn('goblin',0,20);poisoned.hp=poisoned.maxHp=10;poisoned.poison={remaining:2,dps:30,source:t.id};for(let n=0;n<60&&!poisoned.dead;n++)w.tickEnemy(poisoned,1/60);
 assert.equal(poisoned.dead,true);assert.equal(w.stats.retiredTowers[0].damage,30);assert.equal(w.stats.retiredTowers[0].kills,2);
 assert.equal(w.cast('meteor',300,300).ok,true);w.finish(true);const row=w.result.towerPerformance[0];
 assert.deepEqual(row,{id:t.id,defId:'archer_1',nameKo:D.towers.archer_1.nameKo||D.towers.archer_1.name,kind:'tower',sold:true,damage:30,kills:2,invested:paid});
 assert.equal(w.result.spent,paid);assert.equal(w.result.damage,30);assert.deepEqual(w.result.spellCasts,{meteor:1});assert.equal(w.result.stageId,'southport');assert.equal(w.result.mode,'campaign');assert.equal(w.result.difficulty,'normal');assert.equal(w.result.maxLives,20);
 w.stats.retiredTowers[0].damage=999;w.stats.damageByType.physical=999;w.stats.spellCasts.meteor=99;w.stats.leaksByEnemy.goblin=4;
 assert.equal(row.damage,30);assert.equal(w.result.damageByType.physical,20);assert.equal(w.result.spellCasts.meteor,1);assert.equal(w.result.leaksByEnemy.goblin,undefined,'finished results own independent snapshots');
});

test('result performance ranks active facilities and towers by effective damage with stable identities',()=>{
 const w=world('stormcloud',{layout:'reconstructed',ruleset:'reference',difficulty:'veteran'}),f=w.facilities[0];
 assert.equal(w.hireFacilityUnit(f.id).ok,true);const site=w.stage.sites.findIndex(s=>s.buildable!==false);assert.equal(w.build(site,'archer_1').ok,true);const t=w.towers[0];w.callWave();
 const e=w.spawn('gargoyle',0,100);e.hp=e.maxHp=200;w.hit(e,7,'true',t.id);assert.equal(w.fireSunray(f.id,e.id).ok,true);w.finish(true);
 const [facility,tower]=w.result.towerPerformance;assert.equal(facility.id,f.id);assert.equal(facility.defId,'sunray_tower');assert.equal(facility.kind,'facility');assert.equal(facility.damage,100.5);assert.equal(facility.invested,100);assert.equal(facility.sold,false);
 assert.equal(tower.id,t.id);assert.equal(tower.kind,'tower');assert.equal(tower.damage,7);assert.equal(tower.sold,false);assert.equal(w.result.damage,107.5);assert.equal(w.result.spent,100+t.invested);assert.equal(w.result.difficulty,'veteran');
 f.damage=0;t.damage=0;assert.equal(facility.damage,100.5);assert.equal(tower.damage,7);
});

console.log(`\n${passed} engine tests passed.`);
