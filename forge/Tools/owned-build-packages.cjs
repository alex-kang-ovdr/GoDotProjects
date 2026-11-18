"use strict";
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {PlatformStore}=require('./platform-store.cjs');
const {BuildQueue}=require('./build-queue.cjs');
const fail=(code,status=409)=>Object.assign(new Error(code),{code,status});
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
class OwnedBuildPackages {
 constructor({root,directory,enabled=false,maxBytes=64*1024*1024}={}){this.root=root;this.directory=path.resolve(directory);this.enabled=enabled===true;this.maxBytes=maxBytes;this.queues=new Map();}
 keys(key,project,id){if(!/^[a-f0-9]{64}$/.test(key)||!/^[a-f0-9]{24}$/.test(project)||(id!==undefined&&!/^[a-f0-9]{16}$/.test(id)))throw fail('invalid_build_key',404);}
 safe(parts){let p=this.directory;for(const part of ['',...parts]){p=path.join(p,part);if(fs.existsSync(p)&&fs.lstatSync(p).isSymbolicLink())throw fail('unsafe_build_path');}return p;}
 store(key){return new PlatformStore(this.root,this.safe(['accounts',key]));}
 snapshot(key,id,revision){this.keys(key,id);const project=this.store(key).read(id);const source=project.history.find(r=>r.revision===revision);if(!source)throw fail('revision_not_found',404);return {id,revision,files:Object.entries(source.files).sort(([a],[b])=>a.localeCompare(b,'en')).map(([path,content])=>({path,content}))};}
 enqueue(key,id,revision){if(!this.enabled)throw fail('private_builds_disabled',503);const snapshot=this.snapshot(key,id,revision);let queue=this.queues.get(key);if(!queue){if(this.queues.size>=16)throw fail('build_capacity',503);queue=new BuildQueue(this.root,this.safe(['builds',key]));this.queues.set(key,queue);}return this.publicJob(queue.enqueue(snapshot));}
 publicJob(job){return {buildId:job.id,projectId:job.projectId,revision:job.revision,status:job.status,target:job.target};}
 job(key,id,buildId){this.keys(key,id,buildId);this.store(key).getProject(id);this.safe(['builds',key,buildId,'result.json']);let job=this.queues.get(key)?.get(buildId);if(!job){const file=this.safe(['builds',key,buildId,'result.json']);if(!fs.existsSync(file)||fs.statSync(file).size>1024*1024)throw fail('build_not_found',404);job=JSON.parse(fs.readFileSync(file,'utf8'));}if(job.id!==buildId||job.projectId!==id)throw fail('build_not_found',404);return job;}
 verified(key,id,buildId,revision){const job=this.job(key,id,buildId);const snapshot=this.snapshot(key,id,revision);if(job.status!=='succeeded'||job.target!=='web'||job.revision!==revision||job.sourceHash!==hash(JSON.stringify(snapshot.files)))throw fail('build_revision_mismatch');const file=this.safe(['builds',key,buildId,'output','PlayForge-Web.zip']);if(!fs.existsSync(file)||!fs.statSync(file).isFile()||fs.statSync(file).size>this.maxBytes)throw fail('build_package_unavailable');const bytes=fs.readFileSync(file);if(bytes.length>this.maxBytes||hash(bytes)!==job.artifactSha256)throw fail('build_package_integrity');return {job,bytes};}
 validate(key,buildId,id,revision){this.verified(key,id,buildId,revision);return {buildId};}
 resolve(key,id,releaseId){this.keys(key,id);if(!/^[a-f0-9]{24}$/.test(releaseId))throw fail('release_not_found',404);const release=this.store(key).read(id).releases.find(r=>r.id===releaseId);if(!release?.build?.buildId)throw fail('release_not_found',404);return this.verified(key,id,release.build.buildId,release.revision).bytes;}
 close(){for(const q of this.queues.values())q.close();this.queues.clear();}
}
module.exports={OwnedBuildPackages};
