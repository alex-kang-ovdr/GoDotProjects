'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const C=require('../src/core.js');
const {Profile}=require('../src/progression.js');
const tests=[];
function test(name,fn){try{fn();tests.push({name,passed:true});console.log('PASS',name)}catch(e){tests.push({name,passed:false,error:e.stack});console.error('FAIL',name,e.message)}}
const saved=(items,more={})=>({schema:15,namespace:'test-profile',gold:0,runs:0,escapes:0,nextInstance:1,nextRun:1,stash:items.map((x,i)=>({id:typeof x==='string'?x:x.id,instanceId:'s'+i,state:'Handled',...(typeof x==='object'?x:{})})),...more});
const result=(run,more={})=>({runId:run.runId,success:true,training:run.training,cheated:false,gold:0,extractedItems:[],extractedEquipment:{},...more});

test('Schema 13 migration preserves bank gold and statistics without fabricating loot',()=>{
 const p=new Profile(null,{schema:13,gold:80,runs:4,escapes:2});assert.equal(p.gold,80);assert.equal(p.runs,4);assert.equal(p.escapes,2);assert.deepEqual(p.stash,[]);assert.equal(p.serialize().schema,15);
});
test('Malformed saves are neutral and canonical item definitions override forged statistics',()=>{
 const p=new Profile(saved([{id:'steelSword',damage:99999,value:99999,name:'forged',uid:'i1'},{id:'missing'}],{gold:-1,runs:NaN,escapes:Infinity}));
 assert.equal(p.gold,0);assert.equal(p.runs,0);assert.equal(p.escapes,0);assert.equal(p.stash.length,1);assert.equal(p.stash[0].damage,C.ITEMS.steelSword.damage);assert.equal(p.stash[0].value,C.ITEMS.steelSword.value);assert.equal(p.stash[0].name,C.ITEMS.steelSword.name);
});
test('Restoring items mints unique runtime UIDs while retaining persistent identity',()=>{
 const raw=saved(['steelSword','gem']);const p=new Profile(raw),q=new Profile(p.serialize());assert.equal(q.stash[0].instanceId,p.stash[0].instanceId);assert.notEqual(q.stash[0].uid,p.stash[0].uid);assert.notEqual(q.stash[0].uid,C.makeItem('gem').uid);
});
test('Duplicate persistent item IDs in a saved stash produce one owner',()=>{
 const p=new Profile(saved([{id:'gem',instanceId:'same'},{id:'gem',instanceId:'same'}]));assert.equal(p.stash.length,1);
});
test('Selection validates slot and class and cannot equip one instance twice',()=>{
 const p=new Profile(saved(['steelSword','plate','gem']),null,{canEquip:(item,c)=>!(c==='wizard'&&item.id!=='gem')});
 assert.equal(p.select(p.stash[0].uid,'weapon','fighter').ok,true);assert.equal(p.select(p.stash[0].uid,'secondary','fighter').ok,false);assert.equal(p.select(p.stash[1].uid,'armor','wizard').ok,false);assert.equal(p.select(p.stash[2].uid,'weapon','fighter').ok,false);assert.equal(p.stash.length,3);
});
test('Kit selections survive reload through stable instance identity',()=>{
 const p=new Profile(saved(['steelSword']));assert.ok(p.select(p.stash[0].uid,'weapon','fighter').ok);const q=new Profile(p.serialize());assert.equal(q.getKit('fighter').weapon.instanceId,'s0');assert.equal(q.getSelectedSlots(q.stash[0].uid)[0].slot,'weapon');
});
test('Beginning an expedition removes only selected equipment and clears its other-kit references',()=>{
 const p=new Profile(saved(['steelSword','gem']));const uid=p.stash[0].uid;assert.ok(p.select(uid,'weapon','fighter').ok);
 if(p.canEquip(p.stash[0],'ranger','weapon'))assert.ok(p.select(uid,'weapon','ranger').ok);
 const run=p.beginRun('fighter');assert.ok(run.ok);assert.equal(run.equipment.weapon.instanceId,'s0');assert.equal(run.equipment.weapon.state,'Handled');assert.equal(p.stash.length,1);assert.equal(p.stash[0].id,'gem');assert.equal(p.getKit('fighter').weapon,null);assert.equal(p.getKit('ranger').weapon,null);assert.equal(p.pending.length,1);
});
test('A second run cannot withdraw more equipment before the active run is settled',()=>{
 const p=new Profile(saved(['steelSword','plate']));p.select(p.stash[0].uid,'weapon','fighter');p.beginRun('fighter');p.select(p.stash[0].uid,'armor','fighter');const before=p.serialize();assert.equal(p.beginRun('fighter').ok,false);assert.deepEqual(p.serialize(),before);
});
test('Failed kit validation rolls back the complete withdrawal',()=>{
 const p=new Profile(saved(['steelSword','plate']));p.select(p.stash[0].uid,'weapon','fighter');p.select(p.stash[1].uid,'armor','fighter');p.kits.fighter.armor='not-owned';const before=p.serialize();assert.equal(p.beginRun('fighter').ok,false);assert.deepEqual(p.serialize(),before);
});
test('Extraction deposits physical items and credits loose gold without selling their value',()=>{
 const p=new Profile(),run=p.beginRun('fighter');const gem=C.makeItem('gem');assert.ok(p.commitResult(result(run,{gold:7,extractedItems:[gem]})).ok);assert.equal(p.gold,7);assert.equal(p.stash.length,1);assert.equal(p.stash[0].id,'gem');assert.equal(p.stash[0].state,'Looted');assert.equal(p.runs,1);assert.equal(p.escapes,1);
});
test('Only an explicit successful sale converts the canonical item value to gold',()=>{
 const p=new Profile(saved(['gem']));const uid=p.stash[0].uid;assert.ok(p.sell(uid).ok);assert.equal(p.gold,C.ITEMS.gem.value);assert.equal(p.stash.length,0);assert.equal(p.sell(uid).ok,false);assert.equal(p.gold,C.ITEMS.gem.value);
});
test('Supplied gear survives extraction with zero value and cannot be sold',()=>{
 const p=new Profile(),run=p.beginRun('fighter');const sword={...C.makeItem('steelSword'),supplied:true,state:'Supplied',value:9999};assert.ok(p.commitResult(result(run,{extractedEquipment:{weapon:sword}})).ok);assert.equal(p.stash.length,1);assert.equal(p.stash[0].value,0);assert.equal(p.sell(p.stash[0].uid).ok,false);assert.equal(p.gold,0);
});
test('A returned loadout preserves its persistent identity and can be used again',()=>{
 const p=new Profile(saved(['steelSword']));p.select(p.stash[0].uid,'weapon','fighter');const run=p.beginRun('fighter');assert.ok(p.commitResult(result(run,{extractedEquipment:run.equipment})).ok);assert.equal(p.stash.length,1);assert.equal(p.stash[0].instanceId,'s0');assert.ok(p.select(p.stash[0].uid,'weapon','fighter').ok);assert.ok(p.beginRun('fighter').ok);
});
test('Duplicate references across inventory and equipment are deposited once',()=>{
 const p=new Profile(),run=p.beginRun('fighter'),it=C.makeItem('steelSword');assert.ok(p.commitResult(result(run,{extractedItems:[it,it],extractedEquipment:{weapon:it}})).ok);assert.equal(p.stash.length,1);
});
test('An extracted item claiming an already-owned identity cannot duplicate it',()=>{
 const p=new Profile(saved(['gem'])),run=p.beginRun('fighter');p.commitResult(result(run,{extractedItems:[{...C.makeItem('gem'),instanceId:'s0'}]}));assert.equal(p.stash.length,1);
});
test('Repeated settlement cannot award gold or items twice, including after reload',()=>{
 const p=new Profile(),run=p.beginRun('fighter'),r=result(run,{gold:5,extractedItems:[C.makeItem('gem')]});assert.ok(p.commitResult(r).ok);assert.equal(p.commitResult(r).duplicate,true);const q=new Profile(p.serialize());assert.equal(q.commitResult(r).duplicate,true);assert.equal(q.gold,5);assert.equal(q.stash.length,1);assert.equal(q.runs,1);
});
test('Unknown or inconsistent run results never alter ownership or balance',()=>{
 const p=new Profile(),run=p.beginRun('fighter'),before=p.serialize();assert.equal(p.commitResult({runId:'unknown',success:true,gold:999}).ok,false);assert.equal(p.commitResult(result(run,{training:true,gold:999})).ok,false);assert.deepEqual(p.serialize(),before);
});
test('Malformed extracted items and invalid gold reject the complete settlement',()=>{
 const p=new Profile(),run=p.beginRun('fighter'),before=p.serialize();assert.equal(p.commitResult(result(run,{gold:4,extractedItems:[C.makeItem('gem'),{id:'unknown'}]})).ok,false);assert.deepEqual(p.serialize(),before);assert.equal(p.commitResult(result(run,{gold:-2})).ok,false);assert.deepEqual(p.serialize(),before);
});
test('Inherited object-property names are never treated as canonical item IDs',()=>{
 const p=new Profile(saved(['__proto__','constructor','toString']));assert.equal(p.stash.length,0);const run=p.beginRun('fighter'),before=p.serialize();assert.equal(p.commitResult(result(run,{gold:3,extractedItems:[{id:'__proto__'}]})).ok,false);assert.deepEqual(p.serialize(),before);
});
test('Malformed item containers cannot silently discard extracted ownership',()=>{
 const p=new Profile(),run=p.beginRun('fighter'),before=p.serialize();assert.equal(p.commitResult(result(run,{extractedItems:{id:'gem'}})).ok,false);assert.equal(p.commitResult(result(run,{extractedEquipment:4})).ok,false);assert.deepEqual(p.serialize(),before);
});
test('Exhausted counters and oversized namespaces cannot repeat or freeze identities',()=>{
 const p=new Profile(saved([],{namespace:'x'.repeat(150),nextInstance:Number.MAX_SAFE_INTEGER,nextRun:Number.MAX_SAFE_INTEGER}));const run=p.beginRun('fighter');assert.ok(run.ok);assert.ok(p.commitResult(result(run,{extractedItems:[{id:'gem'},{id:'gem'}]})).ok);assert.equal(p.stash.length,2);assert.notEqual(p.stash[0].instanceId,p.stash[1].instanceId);assert.ok(p.stash.every(x=>x.instanceId.length<=160));const q=new Profile(p.serialize());assert.deepEqual(q.stash.map(x=>x.instanceId),p.stash.map(x=>x.instanceId));
});
test('Death loses withdrawn equipment while preserving unrelated stash and bank gold',()=>{
 const p=new Profile(saved(['steelSword','gem'],{gold:40}));p.select(p.stash[0].uid,'weapon','fighter');const run=p.beginRun('fighter');assert.ok(p.commitResult(result(run,{success:false,gold:1000,extractedEquipment:run.equipment})).ok);assert.equal(p.gold,40);assert.equal(p.stash.length,1);assert.equal(p.stash[0].id,'gem');assert.equal(p.runs,1);assert.equal(p.escapes,0);
});
test('Training never withdraws a selected kit or creates persistent rewards',()=>{
 const p=new Profile(saved(['steelSword']));p.select(p.stash[0].uid,'weapon','fighter');const run=p.beginRun('fighter',{training:true});assert.deepEqual(run.equipment,{});assert.equal(p.stash.length,1);assert.ok(p.commitResult(result(run,{gold:900,extractedItems:[C.makeItem('gem')]})).ok);assert.equal(p.stash.length,1);assert.equal(p.gold,0);assert.equal(p.runs,0);assert.equal(p.escapes,0);assert.equal(p.getKit('fighter').weapon.id,'steelSword');
});
test('Cheated normal runs cannot create gold or extracted items',()=>{
 const p=new Profile(),run=p.beginRun('fighter');assert.ok(p.commitResult(result(run,{cheated:true,gold:900,extractedItems:[C.makeItem('gem')]})).ok);assert.equal(p.gold,0);assert.equal(p.stash.length,0);assert.equal(p.runs,1);assert.equal(p.escapes,0);
});
test('Reloading a pending run forfeits withdrawn equipment exactly once',()=>{
 const p=new Profile(saved(['steelSword','gem']));p.select(p.stash[0].uid,'weapon','fighter');const run=p.beginRun('fighter');const q=new Profile(p.serialize());assert.equal(q.stash.length,1);assert.equal(q.stash[0].id,'gem');assert.equal(q.pending.length,0);assert.equal(q.runs,1);assert.equal(q.interruptedRuns,1);assert.equal(q.commitResult(result(run,{gold:99})).duplicate,true);const r=new Profile(q.serialize());assert.equal(r.runs,1);assert.equal(r.interruptedRuns,0);assert.ok(r.beginRun('fighter').ok);
});
test('Reloading an interrupted training run does not count a real run or lose its kit',()=>{
 const p=new Profile(saved(['steelSword']));p.select(p.stash[0].uid,'weapon','fighter');p.beginRun('fighter',{training:true});const q=new Profile(p.serialize());assert.equal(q.runs,0);assert.equal(q.stash.length,1);assert.equal(q.getKit('fighter').weapon.id,'steelSword');assert.equal(q.interruptedRuns,0);
});
test('Selling a selected item clears every kit reference and leaves no phantom equipment',()=>{
 const p=new Profile(saved(['steelSword']));const uid=p.stash[0].uid;p.select(uid,'weapon','fighter');assert.ok(p.sell(uid).ok);assert.equal(p.getKit('fighter').weapon,null);assert.deepEqual(p.getSelectedSlots(uid),[]);assert.deepEqual(p.beginRun('fighter').equipment,{});
});
test('Serialization is detached and omits mutable combat statistics and runtime UIDs',()=>{
 const p=new Profile(saved(['steelSword']));const out=p.serialize();assert.equal(out.stash[0].damage,undefined);assert.equal(out.stash[0].uid,undefined);out.stash[0].id='gem';out.kits.fighter.weapon='evil';assert.equal(p.stash[0].id,'steelSword');assert.equal(p.getKit('fighter').weapon,null);
});

const report={suite:'v15 persistent stash ownership and extraction transactions',total:tests.length,passed:tests.filter(t=>t.passed).length,failed:tests.filter(t=>!t.passed).length,results:tests};
fs.writeFileSync(path.join(__dirname,'progression_results.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({total:report.total,passed:report.passed,failed:report.failed}));process.exitCode=report.failed?1:0;
