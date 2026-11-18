/* Harbor perception: proposed tuning, not recovered GTA V internal data.
 * Geometry is supplied by the caller. A failed visual query exposes no target
 * position, and report candidates capture their evidence position by value.
 */
'use strict';
const HarborPerception=(()=>{
 const DEFAULTS=Object.freeze({range:34,sneakRange:14,fovDegrees:110,alertRange:45,alertFovDegrees:360,civilianDelay:1.4});
 const point=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
 const text=s=>typeof s==='string'&&s.length>0&&s.length<=160;
 const nonnegative=n=>Number.isFinite(n)&&n>=0;
 const validEpoch=n=>Number.isSafeInteger(n)&&n>=1;
 const clone=x=>JSON.parse(JSON.stringify(x));
 const need=(v,message)=>{if(!v)throw Error(message);};
 function visualEvidence(observer,target,options={}){
  if(!observer||!target||!point(observer.pos)||!point(target.pos)||!Number.isFinite(observer.yaw))return {observed:false,reason:'invalid_actor'};
  if((Number.isFinite(observer.hp)&&observer.hp<=0)||(Number.isFinite(target.hp)&&target.hp<=0))return {observed:false,reason:'dead'};
  const alerted=options.alerted??observer.alert??false,sneaking=options.sneaking??target.sneaking??false;
  const range=options.range??(alerted?DEFAULTS.alertRange:sneaking?DEFAULTS.sneakRange:DEFAULTS.range);
  const fov=options.fovDegrees??(alerted?DEFAULTS.alertFovDegrees:DEFAULTS.fovDegrees);
  if(!nonnegative(range)||!Number.isFinite(fov)||fov<=0||fov>360)return {observed:false,reason:'invalid_limits'};
  const dx=target.pos[0]-observer.pos[0],dy=target.pos[1]-observer.pos[1],dz=target.pos[2]-observer.pos[2];
  const distance=Math.hypot(dx,dy,dz),flat=Math.hypot(dx,dz);
  if(distance>range+1e-9)return {observed:false,reason:'range',distance};
  if(fov<360&&flat>1e-8){
   const dot=(Math.sin(observer.yaw)*dx-Math.cos(observer.yaw)*dz)/flat;
   if(dot<Math.cos(fov*Math.PI/360)-1e-12)return {observed:false,reason:'fov',distance};
  }
  const eye=[observer.pos[0],observer.pos[1]+(options.eyeHeight??1.65),observer.pos[2]];
  const aim=[target.pos[0],target.pos[1]+(options.targetHeight??1.35),target.pos[2]];
  if(!point(eye)||!point(aim))return {observed:false,reason:'invalid_height',distance};
  const clear=typeof options.los==='function'?options.los(eye,aim)===true:options.los===true;
  if(!clear)return {observed:false,reason:'occluded',distance};
  const result={observed:true,reason:'visual',distance,position:target.pos.slice()};
  if(nonnegative(options.observedAt))result.observedAt=options.observedAt;
  return result;
 }
 const canIdentify=(observer,target,options)=>visualEvidence(observer,target,options).observed;
 function hearingEvidence(observer,source,{range=48,occlusionScale=1}={}){
  if(!observer||!point(observer.pos)||!point(source)||!nonnegative(range)||!nonnegative(occlusionScale)||occlusionScale>1||observer.hp<=0)return {heard:false,identified:false};
  const distance=Math.hypot(...observer.pos.map((v,i)=>v-source[i]));
  // An acoustic stimulus never supplies an identified suspect or a sight record.
  return {heard:distance<=range*occlusionScale,identified:false,distance};
 }
 class ReportQueue{
  constructor({epoch=1,civilianDelay=DEFAULTS.civilianDelay,maxPending=256,maxIncidents=4096}={}){
   need(validEpoch(epoch),'Invalid report epoch');need(nonnegative(civilianDelay)&&civilianDelay<=30,'Invalid report delay');
   need(Number.isSafeInteger(maxPending)&&maxPending>0&&Number.isSafeInteger(maxIncidents)&&maxIncidents>0,'Invalid report capacity');
   this.epoch=epoch;this.civilianDelay=civilianDelay;this.maxPending=maxPending;this.maxIncidents=maxIncidents;
   this._incidents=new Map();this._pending=new Map();
  }
  get pendingCount(){return this._pending.size;}
  get pending(){return [...this._pending.values()].map(clone);}
  get acceptedCount(){return [...this._incidents.values()].filter(x=>x.accepted).length;}
  get incidentCount(){return this._incidents.size;}
  // Explicit maintenance only: callers must guarantee removed IDs will never be
  // generated again. Ordinary enqueue/update/load keep their original dedup rules.
  // retainCount counts all accepted entries; protected IDs may exceed that target.
  pruneAccepted({keepIds=[],retainCount=512,reclaimUnacceptedPrefix=null}={}){
   need(Number.isSafeInteger(retainCount)&&retainCount>=0,'Invalid retained history count');
   need(keepIds&&typeof keepIds!=='string'&&typeof keepIds[Symbol.iterator]==='function','Invalid protected report IDs');
   const protectedIds=new Set(keepIds);for(const id of protectedIds)need(text(id),'Invalid protected report identity');
   need(reclaimUnacceptedPrefix===null||reclaimUnacceptedPrefix==='incident:'+this.epoch+':','Invalid generated report prefix');
   for(const event of this._pending.values())protectedIds.add(event.incidentId);
   let removeAccepted=Math.max(0,this.acceptedCount-retainCount);
   const removedAcceptedIds=[],reclaimedUnacceptedIds=[];
   // Map insertion order preserves first-recorded order across snapshot/load.
   for(const [id,incident]of this._incidents){
    if(protectedIds.has(id))continue;
    if(incident.accepted&&removeAccepted>0){
     this._incidents.delete(id);removedAcceptedIds.push(id);removeAccepted--;
    }else if(!incident.accepted&&reclaimUnacceptedPrefix&&id.startsWith(reclaimUnacceptedPrefix)){
     const suffix=id.slice(reclaimUnacceptedPrefix.length);
     if(/^[1-9]\d*$/.test(suffix)&&Number.isSafeInteger(Number(suffix))){this._incidents.delete(id);reclaimedUnacceptedIds.push(id);}
    }
   }
   return{removedIds:[...removedAcceptedIds,...reclaimedUnacceptedIds],removedAcceptedIds,reclaimedUnacceptedIds,
    acceptedCount:this.acceptedCount,incidentCount:this.incidentCount};
  }
  _key(id,witness){return JSON.stringify([id,witness]);}
  enqueue({incidentId,witnessId,witnessType='civilian',level,pos,observedAt,epoch=this.epoch}){
   need(text(incidentId)&&text(witnessId),'Invalid report identity');need(['civilian','guard','police'].includes(witnessType),'Invalid witness type');
   need(Number.isInteger(level)&&level>=1&&level<=3&&point(pos)&&nonnegative(observedAt),'Invalid report evidence');
   need(validEpoch(epoch),'Invalid report epoch');if(epoch!==this.epoch)return false;
   const old=this._incidents.get(incidentId);if(old){if(old.accepted)return false;need(old.level===level,'Incident severity mismatch');}
   const key=this._key(incidentId,witnessId);if(this._pending.has(key))return false;
   need(this._pending.size<this.maxPending,'Report queue capacity exceeded');
   need(old||this._incidents.size<this.maxIncidents,'Incident history capacity exceeded');
   const event={id:incidentId,incidentId,witness:witnessId,witnessType,level,pos:pos.slice(),observedAt,time:observedAt+(witnessType==='police'?0:this.civilianDelay),epoch};
   if(!old)this._incidents.set(incidentId,{id:incidentId,level,accepted:false});
   this._pending.set(key,event);return true;
  }
  update(now,isWitnessAlive){
   need(nonnegative(now)&&typeof isWitnessAlive==='function','Invalid report update');
   const accepted=[];
   // Evidence captured earlier stays pending when sight is lost. Death before
   // acceptance removes only that witness; another living witness can still report.
   const ordered=[...this._pending.entries()].sort((a,b)=>a[1].time-b[1].time||a[0].localeCompare(b[0]));
   for(const [key,event]of ordered){
    if(!this._pending.has(key))continue;
    const incident=this._incidents.get(event.incidentId);
    if(event.epoch!==this.epoch||!incident||incident.accepted||isWitnessAlive(event.witness)!==true){this._pending.delete(key);continue;}
    if(event.time>now+1e-9)continue;
    incident.accepted=true;this._pending.delete(key);accepted.push({...clone(event),time:now});
    for(const [otherKey,other]of this._pending)if(other.incidentId===event.incidentId)this._pending.delete(otherKey);
   }
   return accepted;
  }
  replacePending(entries,{now=null,epoch=this.epoch}={}){
   need(Array.isArray(entries)&&entries.length<=this.maxPending,'Invalid pending reports');
   need(validEpoch(epoch)&&epoch===this.epoch,'Pending epoch mismatch');
   if(now!==null)need(nonnegative(now),'Invalid restore time');
   const incidents=new Map([...this._incidents].map(([k,v])=>[k,{...v}])),pending=new Map();
   for(const input of entries){
    need(input&&typeof input==='object','Invalid pending report');
    need(input.epoch===undefined||input.epoch===epoch,'Stale pending epoch');
    const id=input.incidentId??input.id,witness=input.witness??input.witnessId;
    need(text(id)&&text(witness)&&(!input.id||input.id===id),'Invalid pending identity');
    need(Number.isInteger(input.level)&&input.level>=1&&input.level<=3&&point(input.pos)&&nonnegative(input.time),'Invalid pending evidence');
    const witnessType=input.witnessType??'legacy';need(['civilian','guard','police','legacy'].includes(witnessType),'Invalid pending witness type');
    const observedAt=input.observedAt??null;
    need(observedAt===null||(nonnegative(observedAt)&&observedAt<=input.time+1e-9),'Invalid observation time');
    if(now!==null&&observedAt!==null)need(observedAt<=now+1e-9,'Future report observation');
    const old=incidents.get(id);if(old?.accepted)continue;
    need(!old||old.level===input.level,'Incident severity mismatch');
    const key=this._key(id,witness);need(!pending.has(key),'Duplicate pending witness');
    if(!old){need(incidents.size<this.maxIncidents,'Incident history capacity exceeded');incidents.set(id,{id,level:input.level,accepted:false});}
    pending.set(key,{id,incidentId:id,witness,witnessType,level:input.level,pos:input.pos.slice(),observedAt,time:input.time,epoch});
   }
   this._incidents=incidents;this._pending=pending;return this;
  }
  setEpoch(epoch){need(validEpoch(epoch)&&epoch>this.epoch,'Epoch must increase');this._pending.clear();this.epoch=epoch;return this;}
  snapshot(){return {version:1,epoch:this.epoch,civilianDelay:this.civilianDelay,incidents:[...this._incidents.values()].map(clone),pending:this.pending};}
  load(snapshot,{epoch=snapshot?.epoch,now=null}={}){
   need(snapshot&&snapshot.version===1&&validEpoch(snapshot.epoch)&&validEpoch(epoch),'Invalid report snapshot');
   need(nonnegative(snapshot.civilianDelay)&&snapshot.civilianDelay<=30,'Invalid stored delay');
   need(Array.isArray(snapshot.incidents)&&snapshot.incidents.length<=this.maxIncidents,'Invalid incident history');
   const staged=new ReportQueue({epoch,civilianDelay:snapshot.civilianDelay,maxPending:this.maxPending,maxIncidents:this.maxIncidents});
   for(const incident of snapshot.incidents){
    need(incident&&text(incident.id)&&Number.isInteger(incident.level)&&incident.level>=1&&incident.level<=3&&typeof incident.accepted==='boolean','Invalid stored incident');
    need(!staged._incidents.has(incident.id),'Duplicate stored incident');staged._incidents.set(incident.id,{id:incident.id,level:incident.level,accepted:incident.accepted});
   }
   need(Array.isArray(snapshot.pending),'Invalid stored pending');
   for(const event of snapshot.pending){
    need(event&&event.epoch===snapshot.epoch&&staged._incidents.has(event.incidentId??event.id),'Dangling or stale pending report');
    need(!staged._incidents.get(event.incidentId??event.id).accepted,'Accepted report cannot remain pending');
   }
   staged.replacePending(snapshot.pending.map(event=>({...event,epoch})),{epoch,now});
   // Commit only after every field and reference has validated successfully.
   this.epoch=epoch;this.civilianDelay=staged.civilianDelay;this._incidents=staged._incidents;this._pending=staged._pending;return this;
  }
 }
 return {DEFAULTS,visualEvidence,canIdentify,hearingEvidence,ReportQueue};
})();
if(typeof window!=='undefined')window.HarborPerception=HarborPerception;
if(typeof module!=='undefined')module.exports=HarborPerception;
