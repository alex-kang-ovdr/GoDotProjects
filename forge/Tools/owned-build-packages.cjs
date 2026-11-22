"use strict";
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {PlatformStore}=require('./platform-store.cjs');
const {BuildQueue}=require('./build-queue.cjs');
const fail=(code,status=409)=>Object.assign(new Error(code),{code,status});
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
// Two modes share one verification algorithm (canonical sorted snapshot, sourceHash, artifactSha256):
// - per-account (Hub, legacy): one BuildQueue per account under <directory>/builds/<accountKey>.
// - shared queue (Forge Hub-auth mode): an injected BuildQueue whose jobs carry ownerKey; ownership is
//   checked on the job record instead of the directory layout. The caller owns and closes that queue.
class OwnedBuildPackages {
 constructor({root,directory,enabled=false,maxBytes=64*1024*1024,queue=null,storeFor=null}={}){
  this.root=root;this.maxBytes=maxBytes;this.queues=new Map();this.shared=queue||null;this.storeFor=typeof storeFor==='function'?storeFor:null;
  if(this.shared){if(typeof this.shared.enqueue!=='function'||typeof this.shared.get!=='function'||!this.shared.directory)throw new TypeError('A BuildQueue is required');if(!this.storeFor)throw new TypeError('storeFor is required with a shared queue');this.directory=directory?path.resolve(directory):null;this.enabled=true;}
  else{this.directory=path.resolve(directory);this.enabled=enabled===true;}
 }
 keys(key,project,id){if(!/^[a-f0-9]{64}$/.test(key)||!/^[a-f0-9]{24}$/.test(project)||(id!==undefined&&!/^[a-f0-9]{16}$/.test(id)))throw fail('invalid_build_key',404);}
 safe(parts){let p=this.directory;for(const part of ['',...parts]){p=path.join(p,part);if(fs.existsSync(p)&&fs.lstatSync(p).isSymbolicLink())throw fail('unsafe_build_path');}return p;}
 store(key){return this.storeFor?this.storeFor(key):new PlatformStore(this.root,this.safe(['accounts',key]));}
 snapshot(key,id,revision){this.keys(key,id);const project=this.store(key).read(id);const source=project.history.find(r=>r.revision===revision);if(!source)throw fail('revision_not_found',404);return {id,revision,files:Object.entries(source.files).sort(([a],[b])=>a.localeCompare(b,'en')).map(([path,content])=>({path,content}))};}
 queueFor(key){if(this.shared)return this.shared;let queue=this.queues.get(key);if(!queue){if(this.queues.size>=16)throw fail('build_capacity',503);queue=new BuildQueue(this.root,this.safe(['builds',key]));this.queues.set(key,queue);}return queue;}
 // Raw queue job (id, status, previewUrl, ...) for callers that expose BuildQueue's own job shape.
 enqueueJob(key,id,revision,options={}){if(!this.enabled)throw fail('private_builds_disabled',503);const snapshot=this.snapshot(key,id,revision);const payload={...snapshot,...(options&&options.buildProfile?{buildProfile:options.buildProfile}:{})};return this.queueFor(key).enqueue(this.shared?{...payload,ownerKey:key}:payload);}
 enqueue(key,id,revision,options={}){return this.publicJob(this.enqueueJob(key,id,revision,options));}
 publicJob(job){return {buildId:job.id,projectId:job.projectId,revision:job.revision,status:job.status,target:job.target,buildProfile:job.buildProfile||'playhub-publish',avatarIncluded:job.avatarIncluded!==false};}
 legacyJob(key,buildId){
  if(!this.directory)return null;
  const file=this.safe(['builds',key,buildId,'result.json']);
  if(!fs.existsSync(file)||fs.statSync(file).size>1024*1024)return null;
  return JSON.parse(fs.readFileSync(file,'utf8'));
 }
 job(key,id,buildId){
  this.keys(key,id,buildId);this.store(key).getProject(id);
  let job;
  if(this.shared){
   job=this.shared.get(buildId);
   if(job){if(job.ownerKey!==key)throw fail('build_not_found',404);}
   else{job=this.legacyJob(key,buildId);if(!job)throw fail('build_not_found',404);}
  }else{
   this.safe(['builds',key,buildId,'result.json']);
   job=this.queues.get(key)?.get(buildId)||this.legacyJob(key,buildId);
   if(!job)throw fail('build_not_found',404);
  }
  if(job.id!==buildId||job.projectId!==id)throw fail('build_not_found',404);return job;
 }
 packageFile(key,buildId){
  if(this.shared){
   const file=path.join(this.shared.directory,buildId,'output','PlayForge-Web.zip');
   if(fs.existsSync(file)){if(fs.lstatSync(file).isSymbolicLink())throw fail('unsafe_build_path');return file;}
   if(this.directory)return this.safe(['builds',key,buildId,'output','PlayForge-Web.zip']);
   return file;
  }
  return this.safe(['builds',key,buildId,'output','PlayForge-Web.zip']);
 }
 verified(key,id,buildId,revision){const job=this.job(key,id,buildId);const snapshot=this.snapshot(key,id,revision);if(job.buildProfile==='standard-godot'||job.avatarIncluded===false)throw fail('standard_export_not_publishable');if(job.status!=='succeeded'||job.target!=='web'||job.revision!==revision||job.sourceHash!==hash(JSON.stringify(snapshot.files)))throw fail('build_revision_mismatch');const file=this.packageFile(key,buildId);if(!fs.existsSync(file)||!fs.statSync(file).isFile()||fs.statSync(file).size>this.maxBytes)throw fail('build_package_unavailable');const bytes=fs.readFileSync(file);if(bytes.length>this.maxBytes||hash(bytes)!==job.artifactSha256)throw fail('build_package_integrity');return {job,bytes};}
 validate(key,buildId,id,revision){this.verified(key,id,buildId,revision);return {buildId};}
 validateDetailed(key,buildId,id,revision){const {job}=this.verified(key,id,buildId,revision);return {buildId:job.id||buildId,...(typeof job.previewUrl==='string'?{previewUrl:job.previewUrl}:{}),...(typeof job.downloadUrl==='string'?{downloadUrl:job.downloadUrl}:{}),...(typeof job.artifactSha256==='string'?{artifactSha256:job.artifactSha256}:{}),...(typeof job.sourceHash==='string'?{sourceHash:job.sourceHash}:{}),...(Number.isSafeInteger(job.bytes)?{bytes:job.bytes}:{}),...(Number.isSafeInteger(job.expandedBytes)?{expandedBytes:job.expandedBytes}:{})};}
 resolveWithMetadata(key,id,releaseId){this.keys(key,id);if(!/^[a-f0-9]{24}$/.test(releaseId))throw fail('release_not_found',404);const release=this.store(key).read(id).releases.find(r=>r.id===releaseId);if(!release?.build?.buildId)throw fail('release_not_found',404);const {job,bytes}=this.verified(key,id,release.build.buildId,release.revision);return {bytes,sha256:job.artifactSha256,release,job};}
 resolve(key,id,releaseId){return this.resolveWithMetadata(key,id,releaseId).bytes;}
 close(){for(const q of this.queues.values())q.close();this.queues.clear();}
}
module.exports={OwnedBuildPackages};
