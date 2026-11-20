'use strict';
const assert=require('node:assert/strict');
require('../src/data.js');
const {KRWorld}=require('../src/engine.js');
const C=require('../src/checkpoint.js');
const D=globalThis.KR_DATA;
let passed=0;
function test(name,fn){try{fn();passed++;console.log(`PASS ${name}`);}catch(error){console.error(`FAIL ${name}`);throw error;}}
function world(stage='southport',options={}){return new KRWorld(D,stage,{seed:42,layout:'reconstructed',...options});}
function advance(w,seconds){for(let i=0;i<Math.round(seconds*60)&&w.state==='playing';i++)w.update(1/60);}
function copy(v){return JSON.parse(JSON.stringify(v));}
function freezeDeep(v){if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.freeze(v);for(const value of Object.values(v))freezeDeep(value);}return v;}
function resume(w){return C.restore(D,JSON.stringify(C.capture(w)));}
function signature(w){const raw={...w};for(const k of ['data','stage','waveDefs','modeDef'])delete raw[k];raw.availableTowerIds=[...w.availableTowerIds];return JSON.parse(JSON.stringify(raw,(_,v)=>v===Infinity?{$number:'Infinity'}:v));}
function equalWorlds(a,b){assert.deepEqual(signature(a),signature(b));assert.equal(a.heroEnabled?a.units.includes(a.hero):!a.units.includes(a.hero),true);assert.equal(b.heroEnabled?b.units.includes(b.hero):!b.units.includes(b.hero),true);}
function compareContinuation(a,b,seconds){for(let i=0;i<Math.round(seconds*60);i++){a.update(1/60);b.update(1/60);}equalWorlds(a,b);}
function build(w,siteId,defId){const site=w.stage.sites.findIndex(s=>s.id===siteId);assert.notEqual(site,-1);assert.equal(w.build(site,defId).ok,true);return w.towers.at(-1);}

test('ready saves round-trip every stage/mode with requested rule and geometry profiles',()=>{
  for(const stage of D.stages)for(const mode of ['campaign','heroic','iron'])for(const ruleset of ['assisted','reference']){
    const w=world(stage.id,{mode,ruleset,layout:mode==='heroic'?'authored':'reconstructed',difficulty:mode==='iron'?'veteran':'normal'});
    const restored=resume(w);equalWorlds(w,restored);assert.equal(restored.state,'ready');assert.ok(restored.availableTowerIds instanceof Set);
  }
});

test('disabled hero Infinity survives JSON and remains outside the units array',()=>{
  const w=world('southport',{ruleset:'reference',mode:'iron'});assert.equal(w.heroEnabled,false);
  const payload=C.capture(w);assert.deepEqual(payload.runtime.inactiveHero.deadUntil,{$number:'Infinity'});
  const restored=C.restore(D,copy(payload));assert.equal(restored.hero.deadUntil,Infinity);assert.equal(restored.units.includes(restored.hero),false);equalWorlds(w,restored);
});

test('campaign resumes with identical final result and RNG state without cheats',()=>{
  for(const ruleset of ['assisted','reference']){
    const w=world('southport',{ruleset});build(w,'B5','archer_1');build(w,'C3','mage_1');build(w,'B3','barracks_1');w.callWave();advance(w,17.35);
    const restored=resume(w);equalWorlds(w,restored);
    let purchased=false;
    for(let i=0;i<60*300&&w.state==='playing';i++){
      if(ruleset==='reference'&&!purchased&&w.gold>=100){build(w,'E3','mage_1');build(restored,'E3','mage_1');purchased=true;}
      w.update(1/60);restored.update(1/60);
    }
    assert.equal(w.state,'won');assert.equal(w.result.cheated,false);equalWorlds(w,restored);assert.deepEqual(restored.result,w.result);
  }
});

test('in-flight friendly/hostile projectiles, meteor queue, cooldowns and moving hero are preserved',()=>{
  const w=world('pagras');w.cheat('gold',5000);w.build(0,'archer_1');w.build(1,'barracks_1');w.callWave();
  const t=w.towers[0],pos=w.nearestPath(t.x,t.y),enemy=w.spawn('shadow_archer',pos.pathIndex,pos.progress);
  w.launch(t,enemy,17,'arrow','physical',{splash:0,poison:{dps:3,remaining:2},curse:false,mageHit:false});w.launchEnemy(enemy,w.hero);
  assert.equal(w.cast('meteor',pos.x,pos.y).ok,true);assert.equal(w.cast('reinforcements',pos.x,pos.y).ok,true);assert.equal(w.moveHero(920,510).ok,true);
  w.update(1/60);assert.ok(w.projectiles.some(p=>p.hostile));assert.ok(w.projectiles.some(p=>!p.hostile));assert.ok(w.pending.some(p=>p.type==='meteor'));assert.ok(w.pending.some(p=>p.type==='spawn'));
  const restored=resume(w);equalWorlds(w,restored);assert.equal(restored.hero,restored.units.find(u=>u.kind==='hero'));compareContinuation(w,restored,35);
});

test('active enemy status timers, summon provenance and boss phase remain deterministic',()=>{
  const w=world('dark_tower');w.cheat('invincible',true);w.callWave();
  for(const id of Object.keys(D.enemies))w.spawn(id,0,100);
  const enemy=w.enemies.find(e=>e.defId==='troll');enemy.poison={dps:2,remaining:7,source:null};enemy.wrath={dps:3,remaining:4,source:null};enemy.root=2;enemy.enrage=3;enemy.enrageArmor=.2;enemy.enrageDamage=4;enemy.enrageSpeed=20;
  const boss=w.enemies.find(e=>e.defId==='veznan');w.hit(boss,boss.hp+1,'true');assert.equal(boss.phase,2);
  const summoner=w.enemies.find(e=>e.defId==='necromancer');w.summon(summoner,'skeleton',2);advance(w,.5);
  const restored=resume(w);equalWorlds(w,restored);compareContinuation(w,restored,20);
});

test('sold tower telemetry and its in-flight projectile remain attributable after resume',()=>{
  const w=world('pagras');w.build(0,'archer_1');w.callWave();const t=w.towers[0],p=w.nearestPath(t.x,t.y),e=w.spawn('ogre',p.pathIndex,p.progress);
  w.launch(t,e,53,'arrow','physical');assert.equal(w.sell(t.id).ok,true);assert.equal(w.stats.retiredTowers.length,1);
  const restored=resume(w);compareContinuation(w,restored,2);assert.ok(restored.stats.retiredTowers[0].damage>0);
});

test('dead targets and removed reinforcement references are valid historical IDs',()=>{
  const w=world();w.build(0,'archer_1');w.callWave();const t=w.towers[0],e=w.spawn('goblin',0,40);w.launch(t,e,25,'arrow','physical');w.killEnemy(e,null);w.enemies=w.enemies.filter(e=>!e.dead);
  const hostile=w.spawn('shadow_archer',0,80),u=w.makeUnit('reinforcement',null,50,50,{expiresAt:1});w.units.push(u);w.launchEnemy(hostile,u);w.units=w.units.filter(v=>v!==u);
  const restored=resume(w);compareContinuation(w,restored,2);
});

test('repaired elf hall, living elves and non-respawning dead elves retain Infinity correctly',()=>{
  const w=world('silveroak');const f=w.facilities.find(f=>f.type==='sylvan_elf_hall');assert.ok(f);w.cheat('gold',5000);assert.equal(w.restoreFacility(f.id).ok,true);assert.equal(w.hireFacilityUnit(f.id).ok,true);assert.equal(w.hireFacilityUnit(f.id).ok,true);w.callWave();
  const elf=w.units.find(u=>u.kind==='elf');w.hurtUnit(elf,100000,'true');assert.equal(elf.deadUntil,Infinity);
  const payload=C.capture(w);assert.ok(payload.runtime.units.filter(u=>u.kind==='elf').every(u=>u.respawn.$number==='Infinity'));const restored=C.restore(D,payload);equalWorlds(w,restored);compareContinuation(w,restored,15);
});

test('sunray workers, facility cooldown, damage and hire statistics resume exactly',()=>{
  const w=world('stormcloud'),f=w.facilities.find(f=>f.type==='sunray_tower');w.cheat('gold',5000);for(let i=0;i<3;i++)assert.equal(w.hireFacilityUnit(f.id).ok,true);w.callWave();const e=w.spawn('magma_elemental',0,150);assert.equal(w.fireSunray(f.id,e.id).ok,true);advance(w,.3);
  const restored=resume(w);equalWorlds(w,restored);assert.ok(restored.facilities[0].cd>0);compareContinuation(w,restored,18);
});

test('Forsaken spawned event-only path, event state and repeated eruption survive restore',()=>{
  const w=world('forsaken');w.cheat('invincible',true);w.callWave();advance(w,400.2);assert.equal(w.state,'playing');assert.equal(w.stageEventState[0].occurrences,1);assert.equal(w.paths.length,w.stage.paths.length+1);
  const payload=C.capture(w);assert.equal(payload.runtime.eventRoutes.length,1);const restored=C.restore(D,payload);equalWorlds(w,restored);
  assert.equal(restored.stage.paths.length,D.stages.find(s=>s.id==='forsaken').referencePaths.length);assert.ok(restored.enemies.some(e=>e.sourceEventId==='forsaken_lava'));
  compareContinuation(w,restored,121);assert.equal(restored.stageEventState[0].occurrences,2);
});

test('capture, metadata and restore never mutate a caller payload or live world',()=>{
  const w=world();w.callWave();advance(w,3.5);const before=signature(w),payload=C.capture(w),serialized=JSON.stringify(payload);freezeDeep(payload);const meta=C.describe(D,payload);const restored=C.restore(D,payload);
  assert.equal(meta.valid,true);assert.equal(meta.stageName,w.stage.nameKo);assert.equal(meta.wave,w.wave);assert.equal(meta.time,w.time);assert.equal(JSON.stringify(payload),serialized);assert.deepEqual(signature(w),before);
  restored.hero.hp=12;restored.stats.killsByEnemy.goblin=50;assert.notEqual(w.hero.hp,12);assert.equal(payload.runtime.stats.killsByEnemy.goblin,undefined);
});

test('combat fingerprint rejects changed tower, wave, geometry or version data',()=>{
  const payload=C.capture(world());for(const mutate of [d=>d.towers.archer_1.damageMin++,d=>d.stages[0].waves.campaign[0][0].count++,d=>d.stages[0].referencePaths[0][0][0]++,d=>d.version='999.0.0']){
    const changed=copy(D);mutate(changed);assert.throws(()=>C.restore(changed,payload),e=>e.code==='CHECKPOINT_DATA_MISMATCH');assert.equal(C.describe(changed,payload).valid,false);
  }
  // Capture uses a per-battle cache, but restore/describe must never reuse it as validation.
  const mutable=copy(D),w=new KRWorld(mutable,'southport',{seed:42,layout:'reconstructed'}),saved=C.capture(w);mutable.towers.archer_1.damageMin++;
  assert.throws(()=>C.restore(mutable,saved),e=>e.code==='CHECKPOINT_DATA_MISMATCH');assert.equal(C.describe(mutable,saved).valid,false);
  const newBattle=new KRWorld(mutable,'southport',{seed:42,layout:'reconstructed'});assert.equal(C.describe(mutable,C.capture(newBattle)).valid,true);
});

test('unknown versions, invalid profiles, impossible IDs and nonfinite values are rejected safely',()=>{
  const source=world();source.build(0,'archer_1');source.callWave();const original=C.capture(source);
  const mutations=[p=>p.version=17,p=>p.format='other',p=>p.stageId='unknown',p=>p.options.mode='custom',p=>p.options.ruleset='forged',p=>p.options.layout='none',p=>p.options.difficulty='hardest',p=>p.runtime.gold=NaN,p=>p.runtime.time=Infinity,p=>p.runtime.seed=-1,p=>p.runtime.units[0].x=1e50,p=>p.runtime.units[0].kind='constructor',p=>p.runtime.units[0].id=p.runtime.towers[0].id,p=>p.runtime.units[0].targetId=p.runtime.serial+1,p=>p.runtime.towers[0].defId='unknown',p=>p.runtime.towers[0].siteIndex=999,p=>p.runtime.availableTowerIds.push('unknown'),p=>p.runtime.heroId=123456,p=>p.runtime.wave=1000,p=>p.runtime.stats.waves=[],p=>p.runtime.units[0].deadUntil={$number:'Infinity'},p=>p.runtime.units[0].ownerId=p.runtime.towers[0].id,p=>p.runtime.stats.leaksByEnemy.unknown=3,p=>p.runtime.stats.retiredTowers.push({id:p.runtime.towers[0].id,defId:'archer_1',nameKo:'x',kind:'tower',sold:true,damage:0,kills:0,invested:70}),p=>delete p.runtime.stats.retiredTowers,p=>p.runtime.state='won'];
  for(const mutate of mutations){const payload=copy(original);mutate(payload);assert.throws(()=>C.restore(D,payload),/./);assert.equal(C.describe(D,payload).valid,false);}
  const polluted=JSON.parse(JSON.stringify(original).replace('"runtime":{','"runtime":{"__proto__":{"injected":true},'));assert.equal(C.describe(D,polluted).valid,false);assert.equal({}.injected,undefined);
});

test('oversized arrays, nested payloads, cycles and getters do not enter the engine',()=>{
  const original=C.capture(world());const many=copy(original);many.runtime.pending=new Array(12001).fill(null);assert.throws(()=>C.restore(D,many));
  assert.equal(C.describe(D,' '.repeat(2000001)).valid,false);const cycle=copy(original);cycle.runtime.loop=cycle;assert.equal(C.describe(D,cycle).valid,false);
  const getter=copy(original);let invoked=false;Object.defineProperty(getter.runtime,'gold',{get(){invoked=true;return 100;},enumerable:true});assert.equal(C.describe(D,getter).valid,false);assert.equal(invoked,false);
  const deep=copy(original);let node=deep;for(let i=0;i<20;i++)node=node.extra={};assert.equal(C.describe(D,deep).valid,false);
});

test('ended worlds cannot overwrite a resumable battle save',()=>{
  const w=world();w.finish(false);assert.throws(()=>C.capture(w),e=>e.code==='CHECKPOINT_TERMINAL');assert.equal(C.describe(D,null).valid,false);assert.equal(C.supportedVersion,18);
});

console.log(`\n${passed} checkpoint checks passed.`);
