() => {
'use strict';
const q=DarkDescentQA,results=[];
const clone=v=>JSON.parse(JSON.stringify(v));
function assert(ok,message='assertion failed'){if(!ok)throw Error(message);}
function equal(a,b,message='values differ'){assert(JSON.stringify(a)===JSON.stringify(b),message+': '+JSON.stringify(a)+' != '+JSON.stringify(b));}
function near(a,b,message='values differ'){assert(Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<1e-7,message+': '+a+' != '+b);}
function test(name,fn){const start=performance.now();try{const detail=fn();results.push({name,pass:true,ms:Math.round(performance.now()-start),detail:detail??null});}catch(error){results.push({name,pass:false,error:error.stack});}}
function fresh(hero='paladin',seed=28028){document.querySelector('#modal').close();q.paused=false;q.newGame(hero,seed);}
function snapshot(){return JSON.stringify(q.exportState());}
function rejectAtomic(state,label){const before=snapshot();let error=null;try{q.restore(JSON.stringify(state));}catch(e){error=e;}assert(error,label+' must be rejected');equal(snapshot(),before,label+' must leave live state unchanged');}
function fixture(){assert(typeof window.__DD_V27_FIXTURE__==='string','Load tests/v27_fixture.json into window.__DD_V27_FIXTURE__ before this suite');const obj=JSON.parse(window.__DD_V27_FIXTURE__);assert(obj.state?.version===27,'Fixture must be the genuine v27 export');return obj;}
function field(){fresh();q.enterArea('a1_blood_moor');assert(q.S.enemies.length>0);return q.S.enemies[0];}
function learnBranch(id){const sk=q.data.skills.find(s=>s.id===id);for(const pre of sk.requires||[])if(!q.S.p.skills[pre])learnBranch(pre);if(!q.S.p.skills[id])assert(q.learnSkill(id),'learn '+id);}

test('Current save exports schema 28 and restores without a second migration',()=>{fresh();const first=q.exportState(),raw=JSON.parse(q.export());equal(raw.schema,28);equal(raw.state.version,28);q.restore(JSON.stringify(raw));equal(q.exportState(),first);});
test('Genuine v27 save migrates character, area geometry, RNG and item identities',()=>{
 fresh();const old=fixture().state;q.restore(window.__DD_V27_FIXTURE__);equal(q.S.version,28);equal(q.S.hero,old.hero);equal(q.S.runSeed,old.runSeed);equal(q.S.rngState,old.rngState);equal(q.S.nextId,old.nextId);equal(q.S.world.areaId,old.world.areaId);equal(q.S.map,old.map);equal(q.S.world.visited,old.world.visited);equal(q.S.world.flags,old.world.flags);equal(q.S.world.claims,old.world.claims);
 for(const key of ['level','xp','gold','attributes','points','statPoints','skills','skillBindings'])equal(q.S.p[key],old.p[key],key);
 equal(q.S.p.eq.weapon.id,old.p.eq.weapon.id);equal(q.S.stash.map(i=>i.id),old.stash.map(i=>i.id));equal(q.S.p.inv.map(i=>i.id),old.p.inv.map(i=>i.id));q.validateState(q.exportState());
});
test('Genuine v27 Steel and Strength activate new combat effects once',()=>{
 fresh();q.restore(window.__DD_V27_FIXTURE__);const steel=q.S.p.eq.weapon,strength=q.S.stash.find(i=>i.runewordId==='strength');equal(steel.runewordId,'steel');equal(steel.mods.openWounds,50);equal(strength.mods.crushingBlow,25);assert(!steel.deferredEffects.some(p=>p.stat==='open_wounds_chance_percent'));assert(!strength.deferredEffects.some(p=>p.stat==='crushing_blow_percent'));
 const before=JSON.stringify([steel,strength]);q.restore(q.export());equal(JSON.stringify([q.S.p.eq.weapon,q.S.stash.find(i=>i.id===strength.id)]),before,'No duplicated rune or word modifiers after v28 reload');
});
test('Legacy socket migration includes active drops and cached-region drops',()=>{
 fresh();const obj=fixture(),s=obj.state,steel=s.p.eq.weapon,strength=s.stash.shift();s.p.eq.weapon=null;
 s.drops.push({x:s.p.x,y:s.p.y,item:steel});const cached=s.world.states.a1_rogue_encampment;assert(cached,'Fixture retains the town snapshot');cached.drops.push({x:cached.rooms[0].c.x*32+16,y:cached.rooms[0].c.y*32+16,item:strength});
 q.restore(JSON.stringify(obj));equal(q.S.drops.find(d=>d.item.id===steel.id).item.mods.openWounds,50);equal(q.S.world.states.a1_rogue_encampment.drops.find(d=>d.item.id===strength.id).item.mods.crushingBlow,25);equal(q.S.rngState,s.rngState);q.validateState(q.exportState());
});
test('Legacy poison pending tick and chill time survive migration',()=>{
 fresh();const old=fixture().state,target=old.enemies.find(e=>e.poison);assert(target&&target.chill>0);q.restore(window.__DD_V27_FIXTURE__);const actual=q.S.enemies.find(e=>e.id===target.id);equal(actual.poison,target.poison);equal(actual.chill,target.chill);equal(actual.hp,target.hp);q.restore(q.export());equal(q.S.enemies.find(e=>e.id===target.id).poison,target.poison);
});
test('Legacy migration preserves the next real v27 item roll',()=>{
 fresh();q.restore(window.__DD_V27_FIXTURE__);
 const expected={"id":"item-54","baseId":"short_sword","kind":"sword","slot":"weapon","rarity":"rare","name":"Storm Song · Short Sword","symbol":"⚔","ilvl":30,"qlvl":1,"alvl":30,"reqLevel":4,"requirements":{"strength":0,"dexterity":0},"damage":[2,7],"atk":5,"def":0,"mods":{"poisonRes":10,"leech":5,"ed":12},"affixes":[{"id":"beryl","name":"Beryl","side":"prefix","group":"poisonRes","properties":{"poisonRes":10},"reqLevel":3},{"id":"leech","name":"the Leech","side":"suffix","group":"lifeSteal","properties":{"leech":5},"reqLevel":4},{"id":"jagged","name":"Jagged","side":"prefix","group":"ed","properties":{"ed":12},"reqLevel":0}],"sockets":0,"gems":[],"ethereal":false,"durability":24,"maxDurability":24,"value":390,"staffmods":{},"ruleProfile":"web-selected-subset-v26"};
 const actual=q.generateItem({baseId:'short_sword',ilvl:30,quality:'rare'});delete actual.ruleProfile;delete expected.ruleProfile;equal(actual,expected,'Expected gameplay roll captured from the unchanged v27 runtime');
});
test('Tampered v27 socket totals are rejected before migration changes anything',()=>{fresh();const s=fixture().state;s.p.eq.weapon.mods.ed+=123;rejectAtomic(s,'Legacy socket mismatch');});
test('Tampered v28 socket effects and unknown rune IDs are rejected atomically',()=>{
 fresh();q.restore(window.__DD_V27_FIXTURE__);let s=q.exportState();s.p.eq.weapon.mods.openWounds=100;rejectAtomic(s,'Current socket mismatch');s=q.exportState();s.stash[0].gems[0]='not-a-rune';rejectAtomic(s,'Unknown socket rune');
});
test('Newer unknown save versions are rejected atomically',()=>{fresh();const s=q.exportState();s.version=999;rejectAtomic(s,'Future version');});

test('Real buff and shape casts remain valid through JSON roundtrip',()=>{
 const cases=[['barbarian','barbarian_battle_orders','orders'],['assassin','assassin_burst_of_speed','speed'],['sorceress','sorceress_frozen_armor','frozenarmor'],['druid','druid_werewolf','shape']];
 for(const [hero,id,key] of cases){fresh(hero);q.S.p.xp=q.data.experience[29].total_experience;q.levelCheck();learnBranch(id);assert(q.castSkill(id,{x:q.S.p.x+40,y:q.S.p.y}),id+' cast');assert(q.S.p.buffs[key],key+' created');const buffs=clone(q.S.p.buffs),cooldowns=clone(q.S.p.skillCooldowns),cd=q.S.p.cd;q.restore(q.export());equal(q.S.p.buffs,buffs);equal(q.S.p.skillCooldowns,cooldowns);equal(q.S.p.cd,cd);assert(Number.isFinite(q.S.p.hp)&&Number.isFinite(q.S.p.maxHp));}
 return {actualCastCases:cases.length};
});
test('A real idle summoned pet remains saveable after its first cooldown expires',()=>{
 fresh('druid');q.S.p.xp=q.data.experience[1].total_experience;q.levelCheck();assert(q.learnSkill('druid_raven'));assert(q.castSkill('druid_raven',{x:q.S.p.x+30,y:q.S.p.y}));q.step(180);
 const pet=q.S.minions[0];assert(pet&&pet.hp>0&&pet.left>0);equal(pet.cd,0,'Expired idle cooldown is clamped');const expected=clone(pet);q.restore(q.export());const actual=q.S.minions.find(m=>m.id===pet.id);assert(actual);for(const key of ['skillId','pet','hp','maxHp','rank','left','cd'])equal(actual[key],expected[key]);
});
test('Genuine v27 idle minion migrates its elapsed negative cooldown safely',()=>{
 fresh();assert(typeof window.__DD_V27_MINION_FIXTURE__==='string','Load tests/v27_minion_fixture.json before this suite');const original=JSON.parse(window.__DD_V27_MINION_FIXTURE__).state;equal(original.version,27);assert(original.minions[0].cd < -1,'Genuine legacy idle timer');q.restore(window.__DD_V27_MINION_FIXTURE__);equal(q.S.version,28);equal(q.S.rngState,original.rngState);equal(q.S.nextId,original.nextId);equal(q.S.minions.length,1);const before=original.minions[0],after=q.S.minions[0];for(const key of ['id','skillId','pet','hp','maxHp','rank','left'])equal(after[key],before[key]);equal(after.cd,0);q.validateState(q.exportState());
});
test('Death before pet cleanup still exports a valid save without mutating live pets',()=>{
 fresh('druid');q.S.p.xp=q.data.experience[1].total_experience;q.levelCheck();assert(q.learnSkill('druid_raven'));assert(q.castSkill('druid_raven',{x:q.S.p.x+30,y:q.S.p.y}));q.enterArea('a1_blood_moor');const pet=q.S.minions[0];pet.hp=1;
 const attacker=q.makeEnemy(pet.x,pet.y,'grunt');attacker.atk=20;attacker.windup={kind:'melee',left:0,total:.43,angle:0,reach:20};q.S.enemies.push(attacker);q.resolveWindup(attacker);assert(pet.hp<=0,'Actual melee killed pet');q.S.p.invuln=0;q.damagePlayer(10000,'physical',{noBlock:true});assert(q.S.p.dead,'Player dies before status cleanup');
 const before=JSON.stringify(q.S.minions),saved=q.export();equal(JSON.stringify(q.S.minions),before,'Export only sanitizes the snapshot');equal(JSON.parse(saved).state.minions,[]);q.restore(saved);assert(q.S.p.dead);equal(q.S.minions,[]);q.revive();assert(!q.S.p.dead&&q.S.p.hp>0&&q.atTown(),'Dead save still revives correctly');
});
test('Null buff entries cannot import and crash the next update',()=>{fresh();const s=q.exportState();s.p.buffs.orders=null;rejectAtomic(s,'Null buff');});
test('Malformed buff rank or duration cannot create NaN resources',()=>{
 fresh();for(const buff of [{rank:'garbage',left:20},{rank:1.5,left:20},{rank:1,left:null},{rank:1,left:-1},{rank:1,left:1e12}]){const s=q.exportState();s.p.buffs.orders=buff;rejectAtomic(s,'Malformed buff');}
 assert(Number.isFinite(q.S.p.hp)&&Number.isFinite(q.S.p.maxHp));
});
test('Unknown buff keys and invalid shape IDs or forms are rejected',()=>{
 fresh();let s=q.exportState();s.p.buffs.unknown={rank:1,left:10};rejectAtomic(s,'Unknown buff');s=q.exportState();s.p.buffs.shape={id:'druid_werewolf',form:'wolf',left:10};rejectAtomic(s,'Other class shape');fresh('druid');for(const shape of [{id:'missing_skill',form:'wolf',left:10},{id:'druid_werewolf',form:'invalid',left:10}]){s=q.exportState();s.p.buffs.shape=shape;rejectAtomic(s,'Malformed shape');}
});
test('Cooldown strings, nulls, negatives and unknown skill IDs are rejected',()=>{
 fresh('sorceress');for(const value of ['0',null,-.1,1e12]){const s=q.exportState();s.p.skillCooldowns.sorceress_fire_bolt=value;rejectAtomic(s,'Malformed skill cooldown');}const s=q.exportState();s.p.skillCooldowns.missing_skill=0;rejectAtomic(s,'Unknown skill cooldown');
});
test('Zero cooldowns and ordinary action timers retain their exact values',()=>{fresh('sorceress');q.S.p.skillCooldowns.sorceress_fire_bolt=0;q.S.p.cd=.2;q.S.p.slow=1.5;const s=q.export();q.restore(s);equal(q.S.p.skillCooldowns.sorceress_fire_bolt,0);equal(q.S.p.cd,.2);equal(q.S.p.slow,1.5);});
test('Malformed action and recovery timers are rejected atomically',()=>{
 fresh();for(const key of ['cd','dashCd','globalCd','ultimateCd','guard','slow','invuln','attackAnim','flash']){const s=q.exportState();s.p[key]='0';rejectAtomic(s,'Malformed '+key);}for(const value of [-1,null,1e12]){const s=q.exportState();s.p.cd=value;rejectAtomic(s,'Invalid action cooldown');}
});
test('Malformed poison DPS, duration and fractional tick buffers are rejected',()=>{
 field();const variants=[{dps:'3',left:2},{dps:3,left:null},{dps:-3,left:2},{dps:3,left:2,pending:'1',timer:.1},{dps:3,left:2,pending:0,timer:-1}];for(const poison of variants){const s=q.exportState();s.enemies[0].poison=poison;rejectAtomic(s,'Malformed poison');}
});
test('Malformed open wounds fields and chill cannot poison simulation state',()=>{
 field();const base={dps:12,left:3.5,pending:1.5,timer:.125,sourceLevel:30};for(const [key,value] of [['dps','12'],['left',null],['pending',-1],['timer','0.1'],['sourceLevel','30'],['left',1e12]]){const s=q.exportState();s.enemies[0].openWounds={...base,[key]:value};rejectAtomic(s,'Malformed open wounds '+key);}for(const chill of ['3',null,-1,1e12]){const s=q.exportState();s.enemies[0].chill=chill;rejectAtomic(s,'Malformed chill');}
});
test('Status validation covers cached regions as well as the current field',()=>{
 field();q.enterArea('a1_rogue_encampment');const s=q.exportState();assert(s.world.states.a1_blood_moor.enemies.length>0);s.world.states.a1_blood_moor.enemies[0].poison={dps:'bad',left:3};rejectAtomic(s,'Cached poison');
});
test('Partial open wounds tick saves and resumes without lost or duplicated damage',()=>{
 const e=field();e.hp=e.maxHp=5000;e.openWounds={dps:12,left:3.5,pending:1.5,timer:.125,sourceLevel:30};assert(typeof q.updateCombatStatuses==='function','Expose the real combat status tick helper');
 for(let i=0;i<3;i++)q.updateCombatStatuses(.25);const saved=q.export(),remaining=clone(e.openWounds),atSave=e.hp,rng=q.S.rngState;assert(remaining.left>0);for(let i=0;i<11;i++)q.updateCombatStatuses(.25);const expectedHp=e.hp,expectedRng=q.S.rngState;assert(!e.openWounds,'Bleed expires after remaining duration');near(expectedHp,5000-43.5,'Only the saved pending fraction plus remaining DPS is applied');
 q.restore(saved);const restored=q.S.enemies.find(x=>x.id===e.id);equal(restored.openWounds,remaining);equal(restored.hp,atSave);equal(q.S.rngState,rng);for(let i=0;i<11;i++)q.updateCombatStatuses(.25);near(restored.hp,expectedHp);equal(q.S.rngState,expectedRng);assert(!restored.openWounds,'Restored bleed expires exactly once');q.validateState(q.exportState());
});

return {version:28,passed:results.filter(r=>r.pass).length,failed:results.filter(r=>!r.pass).length,results};
}
