"use strict";
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { encodeSnapshot } = require('./drive-snapshot-store.cjs');
// All instances in this process share queues. This is NOT a cross-process lock.
const pending = new Map();
const error = (code,status=503) => Object.assign(new Error(code),{code,status});
function keys(accountKey,projectId,revision) {
  if(typeof accountKey!=='string'||!/^[a-f0-9]{64}$/.test(accountKey)||typeof projectId!=='string'||!/^[a-f0-9]{24}$/.test(projectId)||
      (revision!==undefined&&(!Number.isSafeInteger(revision)||revision<1)))throw error('invalid_version_key',400);
}
function summary(row) {
  const { schemaVersion,accountKey,projectId,revision,sha256,bytes,state,fileId,attempts,createdAt,updatedAt,lastError }=row;
  return {schemaVersion,accountKey,projectId,revision,sha256,bytes,state,fileId,attempts,createdAt,updatedAt,lastError};
}
function atomicJson(file,value) {
  const tmp=file+'.'+crypto.randomBytes(12).toString('hex')+'.tmp';
  let fd;
  try {
    fd=fs.openSync(tmp,'wx',0o600);fs.writeFileSync(fd,JSON.stringify(value));fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;
    fs.renameSync(tmp,file);
  } finally { if(fd!==undefined)fs.closeSync(fd);if(fs.existsSync(tmp))fs.unlinkSync(tmp); }
}
class ProjectDriveSync {
  constructor({enabled=false,directory,drive}={}) {
    this.enabled=enabled===true;
    if(this.enabled&&(!directory||!drive||typeof drive.allocateFileId!=='function'||typeof drive.putSnapshot!=='function'))throw error('sync_configuration_required');
    this.directory=directory?path.resolve(directory):null;this.drive=drive;this.attached=new WeakMap();
  }
  ensureEnabled(){if(!this.enabled)throw error('drive_sync_disabled');}
  projectDirectory(accountKey,projectId,create=false){
    this.ensureEnabled();keys(accountKey,projectId);
    const target=path.join(this.directory,accountKey,projectId);
    // The explicit private root is trusted configuration; generated descendants
    // must never resolve through symlinks/junctions into another location.
    for(const part of [this.directory,path.join(this.directory,accountKey),target]){
      if(create)fs.mkdirSync(part,{recursive:true,mode:0o700});
      if(fs.existsSync(part)&&fs.lstatSync(part).isSymbolicLink())throw error('unsafe_manifest_path');
    }
    return target;
  }
  file(accountKey,projectId,revision,create=false){keys(accountKey,projectId,revision);return path.join(this.projectDirectory(accountKey,projectId,create),revision+'.json');}
  read(file,expected){
    if(!fs.existsSync(file))return null;
    if(fs.lstatSync(file).isSymbolicLink())throw error('unsafe_manifest_path');
    let row;
    try { row=JSON.parse(fs.readFileSync(file,'utf8')); }catch{throw error('manifest_corrupt');}
    if(row.schemaVersion!==1||row.accountKey!==expected.accountKey||row.projectId!==expected.projectId||row.revision!==expected.revision||
       !['pending','reserved','uploading','committed','failed'].includes(row.state)||!Number.isSafeInteger(row.attempts)||row.attempts<0||
       (row.fileId!==null&&(typeof row.fileId!=='string'||!/^[A-Za-z0-9_-]{1,200}$/.test(row.fileId))))throw error('manifest_corrupt');
    let canonical;try{canonical=encodeSnapshot({...expected,fileId:row.fileId||'unallocated',files:row.files});}catch{throw error('manifest_corrupt');}
    if(canonical.sha256!==row.sha256||canonical.bytes.length!==row.bytes)throw error('manifest_corrupt');
    if(row.state==='committed'&&!row.fileId)throw error('manifest_corrupt');
    return row;
  }
  async syncSnapshot(input){
    this.ensureEnabled();
    const canonical=encodeSnapshot({...input,fileId:'unallocated'});
    const snapshot=JSON.parse(canonical.bytes);
    const file=this.file(snapshot.accountKey,snapshot.projectId,snapshot.revision,true);
    const current=this.read(file,snapshot);
    if(current&&current.sha256!==canonical.sha256)throw error('revision_content_conflict',409);
    if(!current){
      const now=new Date().toISOString();
      atomicJson(file,{...snapshot,sha256:canonical.sha256,bytes:canonical.bytes.length,state:'pending',fileId:null,attempts:0,createdAt:now,updatedAt:now,lastError:null});
    }
    const previous=pending.get(file)||Promise.resolve();
    const operation=previous.catch(()=>{}).then(()=>this.upload(file,snapshot,canonical));
    pending.set(file,operation);
    try{return await operation;}finally{if(pending.get(file)===operation)pending.delete(file);}
  }
  async upload(file,snapshot,canonical){
    let row=this.read(file,snapshot);
    if(row&&row.sha256!==canonical.sha256)throw error('revision_content_conflict',409);
    if(row?.state==='committed')return summary(row);
    const now=()=>new Date().toISOString();
    if(!row){row={...snapshot,sha256:canonical.sha256,bytes:canonical.bytes.length,state:'pending',fileId:null,attempts:0,createdAt:now(),updatedAt:now(),lastError:null};atomicJson(file,row);}
    try{
      if(!row.fileId){
        const id=await this.drive.allocateFileId();
        if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,200}$/.test(id))throw error('invalid_reserved_id');
        row.fileId=id;row.state='reserved';row.updatedAt=now();atomicJson(file,row);
      }
      // Reserved ID is durable before the first upload. Crash/timeout retries
      // always reuse this ID and the immutable payload.
      row.state='uploading';row.attempts++;row.lastError=null;row.updatedAt=now();atomicJson(file,row);
      const result=await this.drive.putSnapshot({...snapshot,fileId:row.fileId});
      if(result?.fileId!==row.fileId||result?.sha256!==row.sha256)throw error('upload_receipt_mismatch');
      row.state='committed';row.updatedAt=now();atomicJson(file,row);return summary(row);
    }catch(e){
      row.state='failed';row.lastError= typeof e?.code==='string'&&/^[a-z_]{1,64}$/.test(e.code)?e.code:'drive_sync_failed';row.updatedAt=now();
      atomicJson(file,row);throw error(row.lastError,e?.status>=400&&e.status<=599?e.status:503);
    }
  }
  getVersion(accountKey,projectId,revision){
    const row=this.read(this.file(accountKey,projectId,revision),{accountKey,projectId,revision});
    if(!row)throw error('version_not_found',404);return summary(row);
  }
  listVersions(accountKey,projectId){
    const dir=this.projectDirectory(accountKey,projectId);
    if(!fs.existsSync(dir))return [];
    return fs.readdirSync(dir).filter(n=>/^[1-9][0-9]*\.json$/.test(n)).map(n=>{
      const revision=Number(n.slice(0,-5));keys(accountKey,projectId,revision);
      return this.getVersion(accountKey,projectId,revision);
    }).sort((a,b)=>a.revision-b.revision);
  }
  retryVersion(accountKey,projectId,revision){
    const row=this.read(this.file(accountKey,projectId,revision),{accountKey,projectId,revision});
    if(!row)throw error('version_not_found',404);
    return this.syncSnapshot({accountKey,projectId,revision,files:row.files});
  }
  syncProject(store,accountKey,projectId){
    keys(accountKey,projectId);
    const project=store.getProject(projectId);
    return this.syncSnapshot({accountKey,projectId,revision:project.revision,files:project.files});
  }
  attachStore(accountKey,store,{onError}={}){
    this.ensureEnabled();keys(accountKey,'0'.repeat(24));
    if(!store||typeof store.emit!=='function'||typeof onError!=='function')throw error('invalid_store_hook',400);
    const old=this.attached.get(store);
    if(old){if(old.accountKey!==accountKey)throw error('store_account_mismatch',409);return old.dispose;}
    const original=store.emit;const sync=this;const tasks=new Set();
    const wrapper=function(id,event){
      if(event?.project?.id===id&&['created','project'].includes(event.type)){
        // syncSnapshot durably queues the payload synchronously before its first
        // await; remote work remains async and does not pretend to be local save.
        const task=sync.syncSnapshot({accountKey,projectId:id,revision:event.project.revision,files:event.project.files});
        tasks.add(task);
        task.catch(e=>{try{onError({code:e.code||'drive_sync_failed',projectId:id,revision:event.project.revision});}catch{}})
          .finally(()=>tasks.delete(task));
      }
      return original.apply(this,arguments);
    };
    store.emit=wrapper;
    const dispose=()=>{if(store.emit===wrapper)store.emit=original;sync.attached.delete(store);};
    dispose.flush=async()=>{while(tasks.size)await Promise.allSettled([...tasks]);};
    this.attached.set(store,{accountKey,dispose});return dispose;
  }
  subscribeProject(store,{accountKey,projectId,onError}){
    this.ensureEnabled();keys(accountKey,projectId);
    if(typeof onError!=='function')throw error('invalid_error_handler',400);
    return store.subscribe(projectId,event=>{
      if(!event?.project||event.project.id!==projectId||!['created','project'].includes(event.type))return;
      this.syncSnapshot({accountKey,projectId,revision:event.project.revision,files:event.project.files}).catch(e=>{
        // Never pass credentials, payloads, Drive response bodies, or user text.
        try{onError({code:e.code||'drive_sync_failed',projectId,revision:event.project.revision});}catch{}
      });
    });
  }
}
module.exports={ProjectDriveSync};
