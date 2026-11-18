() => {
 'use strict';
 const q=DarkDescentQA,results=[];
 function assert(v,m='assertion failed'){if(!v)throw Error(m);}
 function near(a,b){assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);}
 function test(name,fn){try{fn();results.push({name,pass:true});}catch(e){results.push({name,pass:false,error:e.stack});}}
 function fresh(hero='paladin'){document.querySelector('#modal').close();q.paused=false;q.newGame(hero,28123);}
 test('Mana regeneration uses published fixed point order at boundary values',()=>{
  near(q.manaRegenPerSecond28(15),25/256);
  near(q.manaRegenPerSecond28(100),200/256);
  near(q.manaRegenPerSecond28(120,15),275/256);
  near(q.manaRegenPerSecond28(120,100),500/256);
  near(q.manaRegenPerSecond28(0,100),0);
 });
 test('Live equipped mana and Warmth bonuses feed regeneration',()=>{
  fresh('sorceress');q.S.p.xp=q.data.experience[9].total_experience;q.levelCheck();assert(q.learnSkill('sorceress_warmth'));
  const item=q.generateItem({baseId:'cap',ilvl:10,quality:'normal',noEthereal:true,noSockets:true,noStaffmods:true});
  item.mods={mana:40,maxManaPercent:20,manaRegen:15};q.S.p.eq.helm=item;q.recalcResources();
  const st=q.stats(),warmth=q.skillValues('sorceress_warmth').row.mana_regeneration_percent;
  near(st.regen,q.manaRegenPerSecond28(st.mana,warmth+15));
  const p=q.S.p;p.mp=1;const expected=p.mp+st.regen/60;q.step();near(p.mp,expected);
 });
 test('Combat target readout reports actual health, resistance and status durations without mutation',()=>{
  fresh();q.enterArea('a1_blood_moor');const e=q.S.enemies[0];e.resists.fire=40;e.hp=20;e.maxHp=50;e.openWounds={dps:2,left:5,pending:0,timer:0,sourceLevel:10};e.poison={dps:1,left:2};e.chill=3;
  const before=JSON.stringify(q.exportState()),view=q.combatTargetSummary28(e);
  assert(view.hp===20&&view.maxHp===50&&view.resists.fire===40);assert(view.statuses.some(v=>v.label==='출혈'&&v.seconds===5));assert(view.statuses.some(v=>v.label==='중독'&&v.seconds===2));assert(view.statuses.some(v=>v.label==='둔화'&&v.seconds===3));
  assert(JSON.stringify(q.exportState())===before,'UI read consumes no RNG or state');
 });
 test('Player readout only reports active eligible equipment modifiers',()=>{
  fresh();const item=q.generateItem({baseId:'short_sword',ilvl:10,quality:'normal',noEthereal:true,noSockets:true,noStaffmods:true});item.mods={crushingBlow:25,openWounds:50};item.reqLevel=20;q.S.p.eq.weapon=item;
  assert(!q.combatReadout28().effects.some(v=>v.includes('강타')),'unusable equipment grants no effects');
  q.S.p.xp=q.data.experience[19].total_experience;q.levelCheck();
  assert(q.combatReadout28().effects.includes('강타 25%'));assert(q.combatReadout28().effects.includes('상처 악화 50%'));
 });
 test('Town target is empty and unexposed enemies do not leak to target selection',()=>{
  fresh();assert(q.combatTarget28()===null);q.enterArea('a1_blood_moor');q.S.visible=Array.from({length:50},()=>Array(85).fill(false));assert(q.combatTarget28()===null);
 });
 return {version:28,passed:results.filter(t=>t.pass).length,failed:results.filter(t=>!t.pass).length,results};
}
