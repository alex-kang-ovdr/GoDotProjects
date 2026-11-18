"use strict";
// Pure planning only. No filesystem, credentials, network or delete API.
const failure=code=>Object.assign(new Error(code),{code,status:400});
const nonnegative=n=>Number.isSafeInteger(n)&&n>=0;
function planDriveRetention({versions=[],quota,incomingBytes=0,now=Date.now(),keepLatest=20,minAgeDays=30,reserveBytes=0,maxQuotaAgeMs=300000}={}){
 if(!Array.isArray(versions)||versions.length>100000||!nonnegative(incomingBytes)||!nonnegative(reserveBytes)||!Number.isSafeInteger(keepLatest)||keepLatest<1||
    !Number.isFinite(now)||!Number.isFinite(minAgeDays)||minAgeDays<0||!nonnegative(maxQuotaAgeMs))throw failure('invalid_retention_input');
 const blocked=reason=>({dryRun:true,executable:false,canUpload:false,reason,candidates:[],estimatedReclaimBytes:0});
 if(!quota||!nonnegative(quota.limitBytes)||!nonnegative(quota.usedBytes)||!Number.isFinite(quota.observedAt))return blocked('quota_unknown');
 if(quota.observedAt>now||now-quota.observedAt>maxQuotaAgeMs)return blocked('quota_stale');
 const groups=new Map(),unique=new Set();
 for(const v of versions){
  if(!v||typeof v.accountKey!=='string'||!/^[a-f0-9]{64}$/.test(v.accountKey)||typeof v.projectId!=='string'||!/^[a-f0-9]{24}$/.test(v.projectId)||
     !Number.isSafeInteger(v.revision)||v.revision<1||!nonnegative(v.bytes)||!['pending','reserved','uploading','committed','failed'].includes(v.state)||
     !Number.isFinite(v.createdAt)||v.createdAt>now||
     !((v.fileId===null&&['pending','failed'].includes(v.state))||(typeof v.fileId==='string'&&/^[A-Za-z0-9_-]{1,200}$/.test(v.fileId)))||
     ['pinned','published','activeRelease'].some(k=>v[k]!==undefined&&typeof v[k]!=='boolean'))throw failure('invalid_version_record');
  if(v.fileId!==null){if(unique.has(v.fileId))throw failure('duplicate_file_id');unique.add(v.fileId);}
  const key=v.accountKey+':'+v.projectId;const group=groups.get(key)||[];
  if(group.some(x=>x.revision===v.revision))throw failure('duplicate_project_revision');group.push(v);groups.set(key,group);
 }
 const candidates=[];
 for(const group of groups.values()){
  group.sort((a,b)=>b.revision-a.revision);
  const protectedSet=new Set([...group.slice(0,keepLatest),...group.filter(v=>v.state==='committed').slice(0,keepLatest)]);
  for(const v of group){
   if(protectedSet.has(v)||v.state!=='committed'||v.pinned===true||v.published===true||v.activeRelease===true||now-v.createdAt<minAgeDays*86400000)continue;
   candidates.push({accountKey:v.accountKey,projectId:v.projectId,revision:v.revision,fileId:v.fileId,bytes:v.bytes,createdAt:v.createdAt,action:'review_retention'});
  }
 }
 candidates.sort((a,b)=>a.createdAt-b.createdAt||a.fileId.localeCompare(b.fileId));
 const estimated=candidates.reduce((sum,x)=>sum+BigInt(x.bytes),0n);
 const free=BigInt(quota.limitBytes)-BigInt(quota.usedBytes)-BigInt(reserveBytes);
 const canUpload=free>=BigInt(incomingBytes);
 return {dryRun:true,executable:false,canUpload,reason:canUpload?'capacity_available':'insufficient_capacity',
  availableBytes:Number(free>0n?free:0n),incomingBytes,candidates,estimatedReclaimBytes:estimated<=BigInt(Number.MAX_SAFE_INTEGER)?Number(estimated):null,
  note:'Candidates are not deleted and do not count as free capacity. Re-query quota after any separately approved cleanup.'};
}
module.exports={planDriveRetention};
