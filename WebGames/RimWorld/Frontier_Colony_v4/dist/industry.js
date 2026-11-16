/** Crafting/equipment state rules. Physical movement and work stay in engine.js. */
import { EXTRA_RESOURCE_LABELS, RECIPES, EQUIPMENT } from './economy-data.js?v=4.0.0';
const record=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const SLOT_ITEMS=Object.freeze({weapon:'rifle',armor:'armor',tool:'tool'});

export function initializeIndustry(game,{migration=false}={}){
  const s=game.state;
  for(const key of Object.keys(EXTRA_RESOURCE_LABELS))if(migration||s.resources[key]===undefined)s.resources[key]=key==='silver'&&!migration?60:0;
  if(migration||!record(s.industry))s.industry={bills:{},crafted:{}};
  for(const id of Object.keys(RECIPES)){
    if(s.industry.bills[id]===undefined)s.industry.bills[id]={mode:'count',target:0,paused:false};
    if(s.industry.crafted[id]===undefined)s.industry.crafted[id]=0;
  }
  for(const c of s.colonists){
    if(migration||c.equipment===undefined)c.equipment={weapon:null,armor:null,tool:null};
    if(migration||c.skills.craft===undefined)c.skills.craft=c.name==='서윤'?10:c.name==='도현'?7:6;
    if(migration||c.priorities.craft===undefined)c.priorities.craft=3;
  }
}

export function ownedCount(state,type,{includeCraft=false}={}){
  let total=state.resources[type]||0;
  for(const item of state.items)if(item.type===type)total+=item.count;
  for(const c of state.colonists){
    if(c.carry?.type===type&&c.carry.source!=='construction')total+=c.carry.count;
    if(c.equipment)for(const item of Object.values(c.equipment))if(item===type)total++;
    if(includeCraft&&c.job?.type==='craft'&&RECIPES[c.job.recipeId]?.output===type)total+=RECIPES[c.job.recipeId].count;
  }
  return total;
}

export function canStartCraft(state,recipeId){
  const recipe=RECIPES[recipeId],bill=state.industry.bills[recipeId];if(!recipe||!bill||bill.paused||bill.target<=0)return false;
  const active=state.colonists.filter(c=>c.job?.type==='craft');
  if(bill.mode==='count'&&active.filter(c=>c.job.recipeId===recipeId).length>=bill.target)return false;
  if(bill.mode==='maintain'&&ownedCount(state,recipe.output,{includeCraft:true})>=bill.target)return false;
  // These quantities remain in the stockpile, but already-started jobs have
  // first claim to their uncollected inputs. This prevents two partial kits
  // from unnecessarily exhausting each other's supply; pickup still rechecks.
  for(const [type,count]of Object.entries(recipe.cost)){
    let committed=0;
    for(const c of active){const cost=RECIPES[c.job.recipeId]?.cost[type]||0,delivered=c.job.materials?.[type]||0,carried=c.carry?.source==='craft'&&c.carry.type===type?c.carry.count:0;committed+=Math.max(0,cost-delivered-carried);}
    if(state.resources[type]-committed<count)return false;
  }
  return true;
}

export function equipmentStats(c){
  const weapon=c?.equipment?.weapon==='rifle'?EQUIPMENT.rifle:null;
  return {range:weapon?.range??7.5,damage:weapon?.damage??1,accuracy:weapon?.accuracy??0,cooldown:weapon?.cooldown??1.35,damageTaken:c?.equipment?.armor==='armor'?EQUIPMENT.armor.damageTaken:1,workSpeed:c?.equipment?.tool==='tool'?EQUIPMENT.tool.workSpeed:1};
}

export function validateIndustry(data,bad){
  const number=(v,a,b,label)=>{if(!Number.isFinite(v)||v<a||v>b)bad(label);};
  const count=(v,max,label)=>{if(!Number.isSafeInteger(v)||v<0||v>max)bad(label);};
  const industry=data.industry;
  for(const key of Object.keys(EXTRA_RESOURCE_LABELS))count(data.resources[key],1e8,'추가 자원 수량');
  if(!record(industry)||!record(industry.bills)||!record(industry.crafted))bad('제작 주문 상태');
  if(Object.keys(industry.bills).some(id=>!Object.hasOwn(RECIPES,id))||Object.keys(industry.crafted).some(id=>!Object.hasOwn(RECIPES,id)))bad('알 수 없는 제작 주문');
  for(const id of Object.keys(RECIPES)){
    const bill=industry.bills[id];if(!record(bill)||!['count','maintain'].includes(bill.mode)||typeof bill.paused!=='boolean')bad('제작 주문 설정');
    count(bill.target,99,'제작 목표');count(industry.crafted[id],1e12,'제작 통계');
    const active=data.colonists.filter(c=>c.job?.type==='craft'&&c.job.recipeId===id).length;
    if(active&&(bill.paused||bill.target===0||bill.mode==='count'&&active>bill.target))bad('제작 주문과 진행 작업 불일치');
  }
  for(const c of data.colonists){
    if(!record(c.equipment)||Object.keys(c.equipment).length!==3)bad('장비 슬롯');
    for(const [slot,item]of Object.entries(SLOT_ITEMS))if(c.equipment[slot]!==null&&c.equipment[slot]!==item)bad('장비 슬롯과 품종');
    if(c.dead&&Object.values(c.equipment).some(Boolean))bad('사망 주민의 장착 장비');
    const j=c.job;
    if(j&&['craft','equip'].includes(j.type)&&(c.dead||c.drafted||data.reservations[j.key]?.owner!==c.id))bad('제작·장착 작업 소유자');
    if(j?.type==='craft'){
      if(!Object.hasOwn(RECIPES,j.recipeId)||!record(j.materials)||!['fetch','deliver','work'].includes(j.stage))bad('제작 작업');
      const recipe=RECIPES[j.recipeId],bench=data.tiles.find(t=>t.building?.id===j.targetId);
      if(!bench?.building.complete||bench.building.type!=='workbench'||j.tx!==bench.x||j.ty!==bench.y||j.key!==`craft:${j.targetId}`)bad('제작 작업대 참조');
      if(j.total!==recipe.work)bad('제작 작업량');number(j.progress,0,recipe.work,'제작 진행');
      for(const [type,n]of Object.entries(j.materials)){if(!Object.hasOwn(recipe.cost,type))bad('제작 재료 종류');count(n,recipe.cost[type],'제작 전달 재료');}
      if(j.stage==='work'&&(c.carry||Object.entries(recipe.cost).some(([type,n])=>(j.materials[type]||0)!==n)))bad('제작 재료 준비 상태');
      if(j.stage==='fetch'&&c.carry)bad('자재 수령 전 운반물 충돌');
      if(j.stage==='deliver'&&(!c.carry||c.carry.source!=='craft'))bad('제작 자재 운반 상태');
    }
    if(c.carry?.source==='craft'){
      if(j?.type!=='craft'||c.carry.recipeId!==j.recipeId||c.carry.benchId!==j.targetId||j.stage!=='deliver')bad('운반 중 제작 자재 참조');
      const cost=RECIPES[j.recipeId].cost[c.carry.type];if(!cost||c.carry.count+(j.materials[c.carry.type]||0)>cost)bad('제작 자재 중복 수량');
    }
    if(j?.type==='equip'){
      if(!Object.hasOwn(EQUIPMENT,j.item)||j.slot!==EQUIPMENT[j.item].slot||!['fetch','work'].includes(j.stage)||j.total!==1.5||j.key!==`equip:${c.id}`||c.equipment[j.slot]!==null)bad('장비 장착 작업');
      if(j.stage==='work'&&(c.carry?.type!==j.item||c.carry.count!==1))bad('장착할 장비 운반');
      if(j.stage==='fetch'&&c.carry)bad('장비 수령 전 운반물 충돌');
    }
  }
}
