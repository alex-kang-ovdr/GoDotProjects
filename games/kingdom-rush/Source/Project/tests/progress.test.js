'use strict';
const assert=require('node:assert/strict');require('../src/data.js');require('../src/camera.js');require('../src/progress.js');
const D=globalThis.KR_DATA,P=globalThis.KRProgress;let checks=0;
function test(name,f){f();checks++;console.log('PASS '+name);}
test('legacy v17 progress migrates with known keys and per-mode star limits',()=>{
  const input={version:17,best:{'southport:campaign':{stars:3,bestKills:56},'southport:iron':{stars:99},'unknown:campaign':{stars:999}},upgrades:{archer:2},referenceUpgrades:{mage:1},settings:{difficulty:'veteran',sound:true,layout:'reconstructed'},tutorial:true};
  const s=P.normalize(D,input);assert.equal(s.version,18);assert.equal(P.earned(s),4);assert.equal(s.best['southport:iron'].stars,1);assert.equal(s.upgrades.archer,2);assert.equal(s.settings.difficulty,'veteran');assert.equal(s.tutorial,true);assert.equal(input.version,17);
});
test('invalid ranks and non-finite settings cannot overspend earned stars',()=>{
  const s=P.normalize(D,{version:18,best:{'southport:campaign':{stars:2}},upgrades:{archer:Infinity,mage:3,barracks:3},referenceUpgrades:{archer:5,mage:5},settings:{speed:Infinity,sound:'yes',difficulty:'impossible'}});
  assert.ok(Object.values(s.upgrades).reduce((n,r)=>n+r*(r+1)/2,0)<=2);assert.ok(Object.entries(s.referenceUpgrades).reduce((n,[k,r])=>n+D.starUpgrades.filter(u=>u.runtimeTree===k&&u.tier<=r).reduce((n,u)=>n+u.costStars,0),0)<=2);assert.equal(s.settings.speed,1);assert.equal(s.settings.sound,false);assert.equal(s.settings.difficulty,'normal');
});
test('import merges best achievements while preserving current controls and allocations',()=>{
  const current=P.empty();current.best['southport:campaign']={stars:3,bestKills:56};current.upgrades.archer=1;current.settings.sound=true;
  const incoming=P.empty();incoming.best['southport:campaign']={stars:1,bestKills:70};incoming.best['outskirts:campaign']={stars:2,bestKills:100};incoming.upgrades.mage=1;
  const merged=P.merge(D,current,incoming);assert.equal(P.earned(merged),5);assert.equal(merged.best['southport:campaign'].bestKills,70);assert.equal(merged.upgrades.archer,1);assert.equal(merged.upgrades.mage,0);assert.equal(merged.settings.sound,true);assert.equal(current.best['outskirts:campaign'],undefined);
});
test('lower-scoring replay cannot overwrite the best profile-specific result',()=>{
  const key='southport:campaign:assisted:reconstructed:normal',a=P.empty(),b=P.empty();a.records[key]={won:true,cheated:false,stars:3,lives:20,duration:200,kills:56};b.records[key]={won:true,cheated:false,stars:2,lives:15,duration:150,kills:52};assert.equal(P.merge(D,a,b).records[key].stars,3);b.records[key].stars=3;b.records[key].lives=20;assert.equal(P.merge(D,a,b).records[key].duration,150);
});
test('backup rejects wrong formats, oversized text, malformed JSON and poisoned keys',()=>{
  for(const text of ['{}','{broken',JSON.stringify({format:'kingdom-rush-backup',version:19,progress:P.empty()}),' '.repeat(8*1024*1024+1)])assert.throws(()=>P.parseBackup(D,text));
  const p=JSON.parse('{"version":18,"best":{"__proto__":{"stars":999},"southport:campaign":{"stars":2}},"settings":{"__proto__":{"polluted":true}}}');const parsed=P.parseBackup(D,JSON.stringify(P.backup(p,null)));assert.equal(parsed.stars,2);assert.equal({}.polluted,undefined);assert.equal(Object.hasOwn(parsed.progress.best,'__proto__'),false);
});
test('record sanitization preserves useful telemetry but excludes cheated runs and unknown IDs',()=>{
  const key='southport:campaign:assisted:reconstructed:normal',input=P.empty();input.records[key]={won:true,cheated:false,stars:3,lives:20,leaksByEnemy:{goblin:2,bogus:55},damageByType:{physical:123,magical:456,unknown:999},spellCasts:{meteor:2},towerPerformance:[{id:2,defId:'archer_1',nameKo:'<img onerror=bad>',damage:123,kills:4,invested:70},{id:3,defId:'unknown'},{id:4,defId:'toString'}]};const s=P.normalize(D,input);assert.deepEqual(s.records[key].leaksByEnemy,{goblin:2});assert.deepEqual(s.records[key].damageByType,{physical:123,magical:456});assert.equal(s.records[key].towerPerformance.length,1);assert.equal(s.records[key].towerPerformance[0].nameKo,D.towers.archer_1.nameKo);input.records[key].cheated=true;assert.equal(P.normalize(D,input).records[key],undefined);
});
test('portable JSON backup restores the exact in-flight battle while retaining current user controls',()=>{
  require('../src/engine.js');require('../src/checkpoint.js');
  const w=new globalThis.KRWorld(D,'southport',{ruleset:'assisted',layout:'reconstructed',seed:42});w.build(2,'archer_1');w.callWave();for(let i=0;i<600;i++)w.update(1/60);
  const cam={zoom:2,x:250,y:140},session={format:'kingdom-rush-session',version:18,battle:globalThis.KRCheckpoint.capture(w),camera:cam};
  const out=P.parseBackup(D,JSON.stringify(P.backup(P.empty(),session))),resumed=globalThis.KRCheckpoint.restore(D,out.session.battle);assert.deepEqual(out.session.camera,cam);assert.equal(resumed.time,w.time);assert.equal(resumed.gold,w.gold);assert.equal(resumed.hero,resumed.units.find(u=>u.kind==='hero'));
  for(let i=0;i<900;i++){w.update(1/60);resumed.update(1/60);}assert.deepEqual(resumed.stats,w.stats);assert.deepEqual(resumed.enemies,w.enemies);assert.equal(resumed.seed,w.seed);
  session.battle.dataFingerprint='wrong';assert.throws(()=>P.parseBackup(D,JSON.stringify(P.backup(P.empty(),session))),/전투 복원 실패/);
});
console.log(`${checks} progression scenarios passed`);
