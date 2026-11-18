/* A normal-rules playability probe. Uses only player-facing actions, no cheats.
   This is an example policy, not proof that every strategy or mode is balanced. */
'use strict';
const fs=require('fs');
const path=require('path');
const ROOT=path.resolve(__dirname,'..');
require(path.join(ROOT,'src/data.js'));
require(path.join(ROOT,'src/engine.js'));
const DATA=globalThis.KR_DATA;
const DIST=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

function planFor(stage,variant=0){
 const slots=[3,4,5,1,7,0,9,8,6,2,10,11].filter(x=>x<stage.sites.length);
 const roles=['mage','artillery','archer','mage','mage','archer','mage','archer','barracks','artillery','archer','mage'];
 const tasks=[];
 const push=(slot,id)=>tasks.push({slot,id});
 const tier=(family,n)=>`${family}_${n}`;
 if(variant===3||variant===4){
   const compact=variant===3?
     [[0,'archer','rangers'],[1,'mage','arcane'],[3,'archer','rangers'],[4,'artillery','tesla'],[5,'mage','sorcerer'],[7,'mage','arcane'],[8,'archer','rangers'],[9,'mage','arcane'],[6,'barracks','holy_order'],[2,'archer','rangers'],[10,'mage','arcane'],[11,'archer','rangers']]:
     [[3,'mage','arcane'],[4,'mage','arcane'],[5,'mage','arcane'],[1,'archer','rangers'],[7,'mage','sorcerer'],[0,'barracks','holy_order'],[9,'mage','arcane'],[8,'archer','rangers'],[6,'mage','arcane'],[2,'artillery','tesla'],[10,'mage','arcane']];
   for(const [slot,family,advanced] of compact.filter(x=>x[0]<stage.sites.length)){
     for(let n=1;n<=3;n++)push(slot,tier(family,n));
     push(slot,advanced);
     if(advanced==='arcane')tasks.push({slot,skill:'death_ray'});
     if(advanced==='sorcerer')tasks.push({slot,skill:'polymorph'});
     if(advanced==='rangers')tasks.push({slot,skill:'poison_arrows'});
   }
   return tasks;
 }
 if(variant===2){
   const compact=[[3,'archer', 'rangers'],[4,'mage','sorcerer'],[5,'archer','rangers'],[1,'mage','arcane'],[7,'artillery','tesla'],[0,'barracks','holy_order'],[9,'mage','arcane'],[8,'archer','rangers'],[6,'mage','arcane'],[2,'archer','rangers'],[10,'mage','arcane'],[11,'archer','rangers']].filter(x=>x[0]<stage.sites.length);
   for(let i=0;i<3;i++){
    const [slot,family,advanced]=compact[i];
    for(let n=1;n<=3;n++)push(slot,tier(family,n));
    push(slot,advanced);
    if(i===0)tasks.push({slot,skill:'poison_arrows'});
   }
   tasks.push({slot:4,skill:'summon_elemental'});
   for(const [slot,family,advanced] of compact.slice(3)){
    for(let n=1;n<=3;n++)push(slot,tier(family,n));
    push(slot,advanced);
   }
   return tasks;
 }
 // First create a compact, mixed defense near the common path.
 for(let i=0;i<4;i++)push(slots[i],tier(roles[i],1));
 for(let i=0;i<4;i++)push(slots[i],tier(roles[i],2));
 for(let i=0;i<3;i++)push(slots[i],tier(roles[i],3));
 if(variant===1) {push(slots[0],'sorcerer');tasks.push({slot:slots[0],skill:'summon_elemental'});}
 else push(slots[0],'arcane');
 push(slots[1],'tesla');push(slots[2],'rangers');
 tasks.push({slot:slots[1],skill:'overcharge'});
 for(let i=4;i<slots.length;i++)push(slots[i],tier(roles[i],1));
 for(let i=3;i<slots.length;i++)push(slots[i],tier(roles[i],2));
 for(let i=3;i<slots.length;i++)push(slots[i],tier(roles[i],3));
 const endings={mage:'arcane',archer:'rangers',barracks:'holy_order',artillery:'tesla'};
 for(let i=3;i<slots.length;i++)push(slots[i],endings[roles[i]]);
 for(let i=0;i<3;i++)tasks.push({slot:slots[2],skill:'poison_arrows'});
 for(let i=0;i<3;i++)tasks.push({slot:slots[2],skill:'wrath_forest'});
 for(let i=1;i<3;i++)tasks.push({slot:slots[1],skill:'overcharge'});
 for(let i=0;i<3;i++)tasks.push({slot:slots[0],skill:variant===1?'polymorph':'death_ray'});
 return tasks;
}
function play(stageId,{variant=0,maxTime=2400,seed=20261118}={}){
 const world=new globalThis.KRWorld(DATA,stageId,{mode:'campaign',difficulty:'normal',seed,upgrades:{}});
 const tasks=planFor(world.stage,variant), actions=[], deaths=[];
 let nextTask=0,lastLeaks=0,lastWave=0,lastThink=-1;
 function buy(){
   for(let repeat=0;repeat<10&&nextTask<tasks.length;repeat++){
     const task=tasks[nextTask], tower=world.towers.find(t=>t.siteIndex===task.slot);
     if(!task.skill&&tower&&DATA.towers[tower.defId].tier>=DATA.towers[task.id].tier){nextTask++;continue;}
     const result=task.skill?world.buySkill(tower?.id,task.skill):tower?world.upgrade(tower.id,task.id):world.build(task.slot,task.id);
     if(!result.ok)break;
     actions.push({time:Math.round(world.time),wave:world.wave,...task});nextTask++;
   }
 }
 buy();
 const choke=world.nearestPath(world.stage.sites[3].x,world.stage.sites[3].y);
 world.moveHero(choke.x,choke.y);
 world.callWave();
 while(world.state==='playing'&&world.time<maxTime){
  if(world.time-lastThink>=.5){
   lastThink=world.time;
   const boss=world.enemies.find(e=>e.boss&&!e.dead);
   if(!boss||variant!==4)buy();
   else {
    // A normal player can move the hero and sell obsolete front-line defenses
    // during a slow boss encounter, then reinforce the remaining road.
    if(world.hero.hp>0&&DIST(world.hero,boss)>100)world.moveHero(boss.x,boss.y);
    const ahead=[];
    for(let d=boss.progress;d<world.paths[boss.pathIndex].length;d+=45)ahead.push(world.pathPosition(boss.pathIndex,d));
    for(const tower of [...world.towers]){
      if(ahead.every(p=>DIST(tower,p)>DATA.towers[tower.defId].range+30))world.sell(tower.id);
    }
    for(const tower of world.towers){
      const def=DATA.towers[tower.defId];
      if(def.family==='mage'&&def.tier<4)world.upgrade(tower.id,def.upgrades.includes('arcane')?'arcane':def.upgrades[0]);
    }
    const empty=world.stage.sites.map((s,i)=>({s,i,coverage:ahead.filter(p=>DIST(s,p)<195).length})).filter(x=>!world.towers.some(t=>t.siteIndex===x.i)&&x.coverage>0).sort((a,b)=>b.coverage-a.coverage);
    if(empty.length&&world.gold>=100)world.build(empty[0].i,'mage_1');
   }
   const enemies=world.enemies.filter(e=>!e.dead&&e.x>45&&e.x<960&&e.y>30&&e.y<590);
   const ground=enemies.filter(e=>!e.air);
   if(ground.length){
    const clusters=ground.map(e=>({e,score:ground.reduce((s,q)=>s+(DIST(e,q)<70?Math.min(q.hp,300):0),0)})).sort((a,b)=>b.score-a.score);
    if(world.spells.meteor.remaining<=0&&(clusters[0].score>180||ground.some(e=>e.boss)))world.cast('meteor',clusters[0].e.x,clusters[0].e.y);
    if(world.spells.reinforcements.remaining<=0){
     const threat=ground.filter(e=>e.progress>world.paths[e.pathIndex].length*.22).sort((a,b)=>b.progress/world.paths[b.pathIndex].length-a.progress/world.paths[a.pathIndex].length)[0];
     if(threat)world.cast('reinforcements',threat.x,threat.y);
    }
   }
   for(const e of enemies)if(e.transformed)world.tapEnemy(e.id);
   if(world.stats.leaks>lastLeaks){deaths.push({time:Math.round(world.time),wave:world.wave,lost:world.stats.leaks-lastLeaks});lastLeaks=world.stats.leaks;}
   if(world.wave!==lastWave)lastWave=world.wave;
  }
  world.update(1/60);
 }
 return {stageId,variant,state:world.state,wave:world.wave,totalWaves:world.totalWaves,time:Math.round(world.time),lives:world.lives,kills:world.stats.kills,leaks:world.stats.leaks,spent:world.stats.spent,gold:world.gold,cheated:world.stats.cheated,actions:actions.length,planProgress:`${nextTask}/${tasks.length}`,towerLevels:world.towers.map(t=>({site:t.siteIndex,id:t.defId})),leakEvents:deaths,result:world.result};
}
if(require.main===module){
 const stages=process.argv.slice(2).filter(x=>!x.startsWith('--'));
 const ids=stages.length?stages:['citadel','stormcloud','dark_tower'];
 const variant=process.argv.includes('--entry')?3:process.argv.includes('--ray')?4:process.argv.includes('--ranger')?2:process.argv.includes('--sorcerer')?1:0;
 const results=ids.map(id=>play(id,{variant}));
 console.log(JSON.stringify(results,null,2));
 if(process.env.BALANCE_REPORT)fs.writeFileSync(process.env.BALANCE_REPORT,JSON.stringify({kind:'normal-rules-autoplay-probe',difficulty:'normal',permanentUpgrades:0,cheats:false,seed:20261118,results},null,2)+'\n');
}
module.exports={play};
