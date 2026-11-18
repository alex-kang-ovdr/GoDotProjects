/* Offline ownership ledger: extraction keeps items; only an explicit sale creates gold.
 * This is a local prototype profile, not the original game's server or stash capacity. */
(function(root){
'use strict';
const C=typeof module!=='undefined'&&module.exports?require('./core.js'):root.CryptCore;
const SCHEMA=15,CLASSES=['fighter','ranger','wizard'],SLOTS=['weapon','secondary','shield','armor','trinket'];
const count=(value,fallback=0)=>Number.isSafeInteger(value)&&value>=0?value:fallback;
const token=value=>typeof value==='string'&&value.length>0&&value.length<=160&&!/[\x00-\x1f]/.test(value)?value:null;
const knownItem=value=>typeof value==='string'&&Object.prototype.hasOwnProperty.call(C.ITEMS,value);
const parse=value=>{if(typeof value!=='string')return value&&typeof value==='object'?value:null;try{return JSON.parse(value)}catch(_){return null}};
const copy=item=>item?{...item}:null;
function namespace(){try{if(root.crypto?.randomUUID)return root.crypto.randomUUID()}catch(_){}return Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,12)}
class Profile{
 constructor(raw=null,legacy=null,options={}){
  raw=parse(raw);legacy=parse(legacy);this._canEquipHook=options.canEquip||null;
  const saved=raw?.schema===SCHEMA?raw:null,old=saved||(raw?.schema===13?raw:legacy)||{};
  this.gold=count(old.gold);this.runs=count(old.runs);this.escapes=Math.min(this.runs,count(old.escapes));
  const savedNamespace=token(saved?.namespace);
  this.namespace=savedNamespace&&savedNamespace.length<=96?savedNamespace:namespace();this.nextInstance=Math.max(1,count(saved?.nextInstance,1));this.nextRun=Math.max(1,count(saved?.nextRun,1));
  this.stash=[];this.kits=Object.fromEntries(CLASSES.map(c=>[c,{}]));this._pending=new Map();this._completed=new Set();this.interruptedRuns=0;
  if(Array.isArray(saved?.completed))for(const id of saved.completed){const k=token(id);if(k)this._completed.add(k)}
  const identities=new Set();
  if(Array.isArray(saved?.stash))for(const rawItem of saved.stash){
   if(!rawItem||!knownItem(rawItem.id))continue;
   const existing=token(rawItem.instanceId);if(existing&&identities.has(existing))continue;
   const item=this._hydrate(rawItem,identities);identities.add(item.instanceId);this.stash.push(item);
  }
  for(const classId of CLASSES)for(const slot of SLOTS){
   const id=token(saved?.kits?.[classId]?.[slot]),item=this.stash.find(x=>x.instanceId===id);
   if(item&&this.canEquip(item,classId,slot)&&!Object.values(this.kits[classId]).includes(id))this.kits[classId][slot]=id;
  }
  // A persisted pending run means the page closed after its kit was withdrawn.
  // It is forfeited once; reopening never puts those items back into the stash.
  if(Array.isArray(saved?.pending))for(const p of saved.pending){
   const id=token(p?.runId);if(!id||this._completed.has(id))continue;
   this._completed.add(id);
   if(!p.training){this.runs=count(this.runs+1,this.runs);this.interruptedRuns++}
  }
 }
 _newInstance(used=new Set()){
  let id;do{
   if(!Number.isSafeInteger(this.nextInstance)||this.nextInstance>=Number.MAX_SAFE_INTEGER){this.namespace=namespace();this.nextInstance=1}
   id=this.namespace+':i'+this.nextInstance++;
  }while(used.has(id)||this.stash.some(it=>it.instanceId===id));return id;
 }
 _hydrate(raw,used=new Set(),defaultState='Handled'){
  const item=typeof C.hydrateItem==='function'?C.hydrateItem(raw):C.makeItem(raw.id);
  if(!item)throw Error('Unknown item '+raw.id);
  item.instanceId=token(raw.instanceId)||this._newInstance(used);
  item.supplied=raw.supplied===true||raw.state==='Supplied';
  item.state=item.supplied?'Supplied':['Looted','Handled'].includes(raw.state)?raw.state:defaultState;
  if(item.supplied)item.value=0;
  item.rotated=raw.rotated===true;item.x=-1;item.y=-1;
  return item;
 }
 get pending(){return [...this._pending.values()].map(x=>({...x}))}
 get(uid){return this.stash.find(it=>it.uid===uid||it.instanceId===uid)||null}
 canEquip(item,classId,slot){
  if(!item||!CLASSES.includes(classId)||!SLOTS.includes(slot))return false;
  const expected=slot==='secondary'?'weapon':slot;
  if(item.type!==expected)return false;
  if(this._canEquipHook)return !!this._canEquipHook(item,classId,slot);
  if(typeof C.canEquipItem==='function')return !!C.canEquipItem(item,classId,slot);
  const classes=item.allowedClasses||C.ITEMS[item.id]?.allowedClasses;
  return !Array.isArray(classes)||classes.some(c=>c===classId||c==='dad.class.'+classId);
 }
 getKit(classId='fighter'){
  const kit=this.kits[classId]||{};
  return Object.fromEntries(SLOTS.map(slot=>[slot,copy(this.stash.find(x=>x.instanceId===kit[slot]))]));
 }
 getSelectedSlots(uid){
  const item=this.get(uid);if(!item)return[];const out=[];
  for(const classId of CLASSES)for(const slot of SLOTS)if(this.kits[classId][slot]===item.instanceId)out.push({classId,slot});return out;
 }
 select(uid,slot,classId='fighter'){
  const item=this.get(uid);if(!item)return{ok:false,reason:'보관함에서 아이템을 찾을 수 없습니다.'};
  if(!this.canEquip(item,classId,slot))return{ok:false,reason:'이 직업 또는 장비 슬롯에서 사용할 수 없습니다.'};
  const kit=this.kits[classId];
  if(SLOTS.some(s=>s!==slot&&kit[s]===item.instanceId))return{ok:false,reason:'같은 아이템을 두 슬롯에 배치할 수 없습니다.'};
  kit[slot]=item.instanceId;return{ok:true,item:copy(item),slot,classId};
 }
 unselect(slot,classId='fighter'){
  if(!CLASSES.includes(classId)||!SLOTS.includes(slot))return{ok:false,reason:'잘못된 장비 슬롯입니다.'};
  delete this.kits[classId][slot];return{ok:true};
 }
 _clearSelections(instanceIds){for(const c of CLASSES)for(const s of SLOTS)if(instanceIds.has(this.kits[c][s]))delete this.kits[c][s]}
 beginRun(classId='fighter',{training=false}={}){
  if(!CLASSES.includes(classId))return{ok:false,reason:'지원하지 않는 직업입니다.'};
  if(this._pending.size)return{ok:false,reason:'진행 중인 출전을 먼저 마쳐 주세요.'};
  const equipment={},ids=new Set();
  if(!training)for(const slot of SLOTS){
   const id=this.kits[classId][slot];if(!id)continue;
   const item=this.stash.find(x=>x.instanceId===id);
   if(!item||ids.has(id)||!this.canEquip(item,classId,slot))return{ok:false,reason:'출전 장비 구성이 유효하지 않습니다.'};
   ids.add(id);equipment[slot]={...item,state:item.supplied?'Supplied':'Handled'};
  }
  let runId;do{
   if(!Number.isSafeInteger(this.nextRun)||this.nextRun>=Number.MAX_SAFE_INTEGER){this.namespace=namespace();this.nextRun=1}
   runId=this.namespace+':r'+this.nextRun++;
  }while(this._completed.has(runId)||this._pending.has(runId));
  this.stash=this.stash.filter(x=>!ids.has(x.instanceId));this._clearSelections(ids);
  this._pending.set(runId,{runId,classId,training:!!training});
  return{ok:true,runId,classId,equipment,items:[],training:!!training};
 }
 commitResult(result){
  const runId=token(result?.runId);
  if(!runId)return{ok:false,reason:'출전 식별자가 없습니다.'};
  if(this._completed.has(runId))return{ok:false,duplicate:true,reason:'이미 정산한 출전입니다.'};
  const pending=this._pending.get(runId);
  if(!pending)return{ok:false,reason:'정산할 출전을 찾을 수 없습니다.'};
  if(result.training!==undefined&&!!result.training!==pending.training)return{ok:false,reason:'출전 정보가 일치하지 않습니다.'};
  const award=result.success===true&&!pending.training&&!result.cheated;
  const looseGold=award?count(result.gold??0,NaN):0;
  if(!Number.isFinite(looseGold)||!Number.isSafeInteger(this.gold+looseGold))return{ok:false,reason:'골드 정산값이 올바르지 않습니다.'};
  if(award&&((result.extractedItems!==undefined&&!Array.isArray(result.extractedItems))||(result.extractedEquipment!==undefined&&(result.extractedEquipment===null||typeof result.extractedEquipment!=='object'))))return{ok:false,reason:'정산 아이템 목록이 올바르지 않습니다.'};
  const incoming=award?[...(Array.isArray(result.extractedItems)?result.extractedItems:[]),...(Array.isArray(result.extractedEquipment)?result.extractedEquipment:Object.values(result.extractedEquipment||{}))].filter(Boolean):[];
  if(incoming.some(it=>!it||typeof it!=='object'||!knownItem(it.id)))return{ok:false,reason:'정산 아이템 데이터가 올바르지 않습니다.'};
  const used=new Set(this.stash.map(x=>x.instanceId)),seenRuntime=new Set(),added=[];
  for(const raw of incoming){
   const id=token(raw.instanceId),uid=token(raw.uid);
   if((id&&used.has(id))||(uid&&seenRuntime.has(uid)))continue;
   if(uid)seenRuntime.add(uid);
   const item=this._hydrate(raw,used,'Looted');used.add(item.instanceId);added.push(item);
  }
  this.stash.push(...added);this.gold+=looseGold;
  if(!pending.training)this.runs=count(this.runs+1,this.runs);
  if(award)this.escapes=count(this.escapes+1,this.escapes);
  this._pending.delete(runId);this._completed.add(runId);
  return{ok:true,added:added.length,gold:looseGold,success:result.success===true,training:pending.training,cheated:!!result.cheated};
 }
 sell(uid){
  const item=this.get(uid);if(!item)return{ok:false,reason:'보관함에서 아이템을 찾을 수 없습니다.'};
  if(item.supplied||item.state==='Supplied')return{ok:false,reason:'지급 장비는 판매할 수 없습니다.'};
  const value=count(C.ITEMS[item.id]?.value);
  if(value<=0)return{ok:false,reason:'판매 가치가 없는 아이템입니다.'};
  if(!Number.isSafeInteger(this.gold+value))return{ok:false,reason:'보관 골드 한도를 초과합니다.'};
  this.stash=this.stash.filter(x=>x.instanceId!==item.instanceId);this._clearSelections(new Set([item.instanceId]));this.gold+=value;
  return{ok:true,gold:value,item:copy(item)};
 }
 serialize(){
  return{schema:SCHEMA,namespace:this.namespace,gold:this.gold,runs:this.runs,escapes:this.escapes,nextInstance:this.nextInstance,nextRun:this.nextRun,
   stash:this.stash.map(it=>({id:it.id,instanceId:it.instanceId,state:it.state,supplied:it.supplied===true,rotated:it.rotated===true})),
   kits:Object.fromEntries(CLASSES.map(c=>[c,{...this.kits[c]}])),pending:this.pending,completed:[...this._completed].slice(-512)};
 }
}
const api={Profile,SCHEMA,CLASSES,SLOTS};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CryptProgress=api;
})(typeof window!=='undefined'?window:globalThis);
