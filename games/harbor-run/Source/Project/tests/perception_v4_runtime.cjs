'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createRuntime,ROOT}=require('./runtime_harness.cjs');
const runtime=createRuntime(),results=[];
function test(name,fn){try{const detail=runtime.evaluate(fn);assert.equal(detail.ok,true,JSON.stringify(detail));results.push({name,pass:true,detail});}catch(error){results.push({name,pass:false,error:error.message});}}
test('Ambient traffic collision never becomes player crime, kill or hostility',()=>{
  V4FIX.reset();const g=HARBOR,c=g.cars[0];c.x=-128;c.z=167;c.yaw=0;c.speed=8;c.traffic=true;
  const n=g.spawnNPC('civilian',[-128,0,166]);g.moveCar(c,0,0);
  const a=g.spawnNPC('guard',[-130,0,166]);g.damageNPC(a,25,false,false);
  return{ok:n.hp===0&&g.kills===0&&g.civilianCasualties===0&&g.reportQueue.pendingCount===0&&!a.alert,
    hp:n.hp,kills:g.kills,casualties:g.civilianCasualties,reports:g.reportQueue.pendingCount,guardAlert:a.alert};
});
test('Police vehicle outside common sight range cannot reveal current player position',()=>{
  V4FIX.reset();const g=HARBOR;HARBOR_TEST.position([-128,0,167]);
  const c=g.makeCar('policeCar8','police',-68,167,Math.PI/2,0);c.police=true;g.cars.push(c);
  g.wanted.report('known',1,[-80,0,140]);const known=g.wanted.lastKnown.slice();
  const obs=g.updateNPCs(1/60);g.wanted.update(1/60,obs.observers,obs.lastObserved||g.wanted.lastKnown);
  return{ok:obs.observers.length===0&&JSON.stringify(g.wanted.lastKnown)===JSON.stringify(known),observers:obs.observers,known:g.wanted.lastKnown};
});
test('Sitting in a car does not inherit the on-foot sneak visibility benefit',()=>{
  V4FIX.reset();const g=HARBOR;V4FIX.driver('starter',[-128,0,167]);g.player.sneak=true;
  const n=g.spawnNPC('guard',[-108,0,167]);n.yaw=-Math.PI/2;n.alert=false;
  const seated=g.canSeePlayer(n);V4FIX.exit();g.player.sneak=true;const onFoot=g.canSeePlayer(n);
  return{ok:seated&&!onFoot,seated,onFoot};
});
test('Restored patrol serials and exhausted search timers remain valid',()=>{
  V4FIX.reset();const g=HARBOR,c=g.makeCar('policeCar12','police',-68,167,0,0);c.police=true;g.cars.push(c);
  g.wanted.report('known',2,[-80,0,140]);g.wanted.search=0;const saved=g.capture();g.restore(saved);
  return{ok:g.policeSerial===13&&g.wanted.search===0&&g.wanted.maxSearch===25,serial:g.policeSerial,search:g.wanted.search,maxSearch:g.wanted.maxSearch};
});
test('Full live incident history compacts without losing theft dedup or new evidence',()=>{
  V4FIX.reset();const g=HARBOR,q=g.reportQueue,epoch=g.sessionEpoch,ids=['theft:'+g.runId];
  for(let i=1;i<4095;i++)ids.push('incident:'+epoch+':'+i);
  for(const id of ids){q.enqueue({incidentId:id,witnessId:'historic',witnessType:'police',level:1,pos:[0,0,0],observedAt:0});q.update(0,()=>true);g.wanted.report(id,1,[0,0,0]);}
  g.nextId=6000;const n=g.spawnNPC('civilian',[-104,0,98]);n.yaw=0;n.alert=false;g.time=2;g.crime(1,'gunfire');
  const repeats=q.enqueue({incidentId:'theft:'+g.runId,witnessId:n.id,witnessType:'civilian',level:1,pos:g.player.pos,observedAt:g.time});
  return{ok:q.incidentCount<1024&&q.pendingCount===1&&g.wanted.events.size<1024&&!repeats,
    incidents:q.incidentCount,pending:q.pendingCount,wantedHistory:g.wanted.events.size,theftRepeated:repeats};
});
const report={suite:'Actual-source perception integration with DOM/drawing/audio stubs',passed:results.filter(x=>x.pass).length,total:results.length,results,notTested:['WebGL','browser/native input','human playthrough']};
fs.writeFileSync(path.join(ROOT,'reports/perception-v4-runtime.json'),JSON.stringify(report,null,2)+'\n');
for(const r of results)console.log((r.pass?'PASS ':'FAIL ')+r.name+(r.error?' '+r.error:''));
console.log(report.passed+'/'+report.total);if(report.passed!==report.total)process.exitCode=1;
