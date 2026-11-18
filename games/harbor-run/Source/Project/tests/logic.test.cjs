'use strict';
const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const L=require('../src/logic.js');const results=[];
function test(name,fn){try{fn();results.push({name,pass:true});}catch(e){results.push({name,pass:false,error:e.message});}}
const box={min:[-1,0,-1],max:[1,2,1]};
test('Ray hits first wall at correct distance',()=>assert.equal(L.rayBox([0,1,5],[0,0,-1],box),4));
test('Parallel ray outside box misses',()=>assert.equal(L.rayBox([2,1,5],[0,0,-1],box),null));
test('Ray starting inside obstacle returns zero',()=>assert.equal(L.rayBox([0,1,0],[0,0,-1],box),0));
test('Ray maximum range is respected',()=>assert.equal(L.rayBox([0,1,5],[0,0,-1],box,3),null));
test('Inflated collision protects camera near plane',()=>assert.equal(L.rayBox([0,1,5],[0,0,-1],box,10,.25),3.75));
test('Ray-sphere hit on head proxy',()=>assert.equal(L.raySphere([0,0,3],[0,0,-1],[0,0,0],1),2));
test('Ray-sphere miss',()=>assert.equal(L.raySphere([2,0,3],[0,0,-1],[0,0,0],1),null));
test('Diagonal input length is clamped',()=>assert.ok(Math.abs(Math.hypot(...L.normalizeInput(1,1))-1)<1e-12));
test('Analogue magnitude is retained',()=>assert.deepEqual(L.normalizeInput(.2,.3),[.2,.3]));
test('Armor absorbs without double reduction',()=>{let a={hp:100,armor:20};L.damage(a,30);assert.deepEqual(a,{hp:90,armor:0});});
test('Unprotected hit bypasses armor',()=>{let a={hp:100,armor:20};L.damage(a,30,false);assert.deepEqual(a,{hp:70,armor:20});});
test('Health and armor never go negative',()=>{let a={hp:5,armor:2};L.damage(a,100);assert.deepEqual(a,{hp:0,armor:0});});
test('One accepted shot consumes one round',()=>{let m=new L.Magazine(12,100);assert.equal(m.fire(),true);assert.equal(m.ammo,11);});
test('Empty magazine rejects fire',()=>{let m=new L.Magazine(1,0);m.fire();assert.equal(m.fire(),false);assert.equal(m.ammo,0);});
test('Reload blocks fire',()=>{let m=new L.Magazine(12,100);m.fire();m.startReload(2);assert.equal(m.fire(),false);});
test('Full magazine does not start reload',()=>assert.equal(new L.Magazine(12,100).startReload(2),false));
test('Pre-commit cancel retains ammo',()=>{let m=new L.Magazine(12,100);m.fire();m.startReload(2);m.update(.5);m.cancel();assert.equal(m.ammo,11);assert.equal(m.reserve,100);});
test('Post-commit cancel retains transferred ammo',()=>{let m=new L.Magazine(12,100);m.fire();m.startReload(2);m.update(1.5);m.cancel();assert.equal(m.ammo,12);assert.equal(m.reserve,99);});
test('Reload commit is idempotent across updates',()=>{let m=new L.Magazine(12,100);m.fire();m.startReload(2);for(let i=0;i<400;i++)m.update(.01);assert.equal(m.ammo,12);assert.equal(m.reserve,99);});
test('Partial reserve is conserved',()=>{let m=new L.Magazine(12,2);m.ammo=3;m.startReload(2);m.update(2);assert.equal(m.ammo,5);assert.equal(m.reserve,0);});
test('Seat reservation excludes rival actor',()=>{let s=new L.Seat();s.reserve('a',0,1);assert.equal(s.reserve('b',.5,1),null);});
test('Expired seat reservation cannot commit',()=>{let s=new L.Seat();const l=s.reserve('a',0,1);assert.equal(s.commit(l.token,2.1,1,true,0),false);});
test('Vehicle generation mismatch rejects stale commit',()=>{let s=new L.Seat();const l=s.reserve('a',0,1);assert.equal(s.commit(l.token,1,2,true,0),false);});
test('Dead entrant cannot gain control',()=>{let s=new L.Seat();const l=s.reserve('a',0,1);assert.equal(s.commit(l.token,1,1,false,0),false);});
test('Moving vehicle rejects entry commit',()=>{let s=new L.Seat();const l=s.reserve('a',0,1);assert.equal(s.commit(l.token,1,1,true,2),false);});
test('Old cancel cannot erase new lease',()=>{let s=new L.Seat();const a=s.reserve('a',0,1);const b=s.reserve('b',3,1);s.cancel(a.token);assert.equal(s.lease.token,b.token);});
test('Takeover keeps old occupant until commit',()=>{let s=new L.Seat();s.occupant='npc';const l=s.reserve('player',0,1,true);assert.equal(s.occupant,'npc');assert.equal(s.commit(l.token,1,1,true,0),true);assert.equal(s.occupant,'player');});
test('Cancelled takeover preserves original driver',()=>{let s=new L.Seat();s.occupant='npc';const l=s.reserve('player',0,1,true);s.cancel(l.token);assert.equal(s.occupant,'npc');});
test('Observed crime starts wanted state',()=>{let w=new L.Wanted();w.report('a',2,[1,0,2]);assert.equal(w.level,2);assert.deepEqual(w.lastKnown,[1,0,2]);});
test('Any remaining observer maintains pursuit',()=>{let w=new L.Wanted();w.report('a',2,[0,0,0]);w.update(1,['b'],[1,0,0]);assert.equal(w.state,'pursuit');assert.deepEqual(w.lastKnown,[1,0,0]);});
test('No observer does not update hidden location',()=>{let w=new L.Wanted();w.report('a',1,[0,0,0]);w.update(1,[],[99,0,99]);assert.deepEqual(w.lastKnown,[0,0,0]);assert.equal(w.state,'search');});
test('Search expires and clears wanted',()=>{let w=new L.Wanted();w.report('a',1,[0,0,0]);w.update(25,[],[0,0,0]);assert.equal(w.level,0);});
test('Duplicate old report cannot reactivate cleared event',()=>{let w=new L.Wanted();w.report('a',1,[0,0,0]);w.clear();assert.equal(w.report('a',2,[5,0,5]),false);assert.equal(w.level,0);});
test('Mission reward is committed once per run',()=>{let l=new L.RewardLedger();for(let i=0;i<10;i++)l.grant('same-run',750);assert.equal(l.wallet,750);assert.equal(l.keys.size,1);});
test('Restored ledger prevents reward duplication',()=>{let a=new L.RewardLedger();a.grant('run',750);let b=new L.RewardLedger(a.wallet,[...a.keys]);assert.equal(b.grant('run',750),false);assert.equal(b.wallet,750);});
const validDelivery={alive:true,targetHp:240,inTarget:true,inZone:true,speed:0,wanted:0};
test('Safe target stop is accepted',()=>assert.equal(L.canDeliver(validDelivery),true));
for(const[k,v]of Object.entries({alive:false,targetHp:0,inTarget:false,inZone:false,speed:2,wanted:1}))test('Delivery rejects invalid '+k,()=>assert.equal(L.canDeliver({...validDelivery,[k]:v}),false));
function save(){return {version:1,wallet:0,rewardKeys:[],player:{pos:[0,0,0],hp:100,armor:50,yaw:0,weapon:2,carId:null},cars:[{id:'target',kind:'coupe',x:0,z:0,yaw:0,hp:240,route:[],occupant:null}],phase:'reach',runId:'test',time:0,missionTime:0,npcs:[],mags:[12,30,30,6,8].map(n=>({ammo:n,reserve:50})),wanted:{level:0,lastKnown:[0,0,0],search:0,events:[]},events:[]};}
test('Well-formed save validates',()=>assert.equal(L.validateSave(save()).version,1));
for(const[name,mutate]of[
 ['bad version',s=>s.version=99],['missing target',s=>s.cars=[]],['duplicate car ID',s=>s.cars.push({...s.cars[0]})],['out-of-world coordinate',s=>s.cars[0].x=999],['NaN health',s=>s.player.hp=NaN],['foreign seat reference',s=>s.player.carId='missing'],['inconsistent seat ownership',s=>s.cars[0].occupant='player'],['ammo overflow',s=>s.mags[0].ammo=999],['wrong reward type',s=>s.rewardKeys=[{}]],['invalid NPC',s=>s.npcs=[{id:'n',type:'guard',pos:[NaN,0,0],home:[0,0,0],hp:10,yaw:0}]],['invalid route',s=>s.cars[0].route=[[0,0,'bad']]],['bad wanted level',s=>s.wanted.level=7]
])test('Save rejects '+name,()=>{const s=save();mutate(s);assert.throws(()=>L.validateSave(s));});
const report={suite:'Shared gameplay primitives',passed:results.filter(r=>r.pass).length,total:results.length,results};fs.mkdirSync(path.join(__dirname,'../reports'),{recursive:true});fs.writeFileSync(path.join(__dirname,'../reports/logic-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(report.passed!==report.total)process.exitCode=1;
