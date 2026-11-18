"use strict";
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {validateDeploymentZip,MAX_ZIP_BYTES}=require('./deployment-zip-validator.cjs');
const queues=new Map();const fail=(code,status=503)=>Object.assign(new Error(code),{code,status});
function keys(k){if(!k||Object.keys(k).some(x=>!['accountKey','projectId','releaseId'].includes(x))||typeof k.accountKey!=='string'||!/^[a-f0-9]{64}$/.test(k.accountKey)||typeof k.projectId!=='string'||!/^[a-f0-9]{24}$/.test(k.projectId)||typeof k.releaseId!=='string'||!/^[a-f0-9]{24}$/.test(k.releaseId))throw fail('invalid_package_identity',400);}
function atomic(file,data){const temp=file+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';let fd;try{fd=fs.openSync(temp,'wx',0o600);fs.writeFileSync(fd,data);fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;fs.renameSync(temp,file);}finally{if(fd!==undefined)fs.closeSync(fd);if(fs.existsSync(temp))fs.unlinkSync(temp);}}
class DeploymentZipArchive {
 constructor({enabled=false,directory,drive,resolveOwnedPackage}={}){this.enabled=enabled===true;if(this.enabled&&(!directory||!path.isAbsolute(directory)||typeof resolveOwnedPackage!=='function'||!drive||['allocateFileId','putPackage','getPackage'].some(k=>typeof drive[k]!=='function')))throw fail('package_archive_configuration_required');this.directory=directory;this.drive=drive;this.resolveOwnedPackage=resolveOwnedPackage;}
 async resolve(k){if(!this.enabled)throw fail('package_archive_disabled');keys(k);let value;try{value=await this.resolveOwnedPackage(k.accountKey,k.projectId,k.releaseId);}catch{throw fail('package_not_found',404);}if(!Buffer.isBuffer(value)||value.length>MAX_ZIP_BYTES)throw fail('package_not_found',404);const buffer=Buffer.from(value);return {buffer,...validateDeploymentZip(buffer)};}
 location(k,create=false){let dir=this.directory;for(const segment of ['',k.accountKey,k.projectId,k.releaseId]){if(segment)dir=path.join(dir,segment);if(create)fs.mkdirSync(dir,{recursive:true,mode:0o700});if(fs.existsSync(dir)&&fs.lstatSync(dir).isSymbolicLink())throw fail('unsafe_package_path');}return dir;}
 read(dir,k){const file=path.join(dir,'manifest.json');if(!fs.existsSync(file))return null;if(fs.lstatSync(file).isSymbolicLink())throw fail('unsafe_package_path');let r;try{r=JSON.parse(fs.readFileSync(file,'utf8'));}catch{throw fail('package_manifest_corrupt');}
  if(![null,'package_cloud_operation_failed'].includes(r.lastError)||r.schemaVersion!==1||r.accountKey!==k.accountKey||r.projectId!==k.projectId||r.releaseId!==k.releaseId||!['pending','reserved','uploading','failed','committed'].includes(r.state)||!/^[a-f0-9]{64}$/.test(r.sha256)||!Number.isSafeInteger(r.bytes)||r.bytes<22||r.bytes>MAX_ZIP_BYTES||!Number.isSafeInteger(r.attempts)||r.attempts<0||r.fileId!==null&&(typeof r.fileId!=='string'||!/^[A-Za-z0-9_-]{1,200}$/.test(r.fileId))||r.state==='committed'&&!r.fileId)throw fail('package_manifest_corrupt');return r;}
 summary(k,r){return {projectId:k.projectId,releaseId:k.releaseId,artifactType:'deployment-zip',state:r?.state||'not-recorded',localRecorded:!!r,cloudVerified:r?.state==='committed',publicationPending:true,published:false,runnableVerified:false,sha256:r?.sha256||null,bytes:r?.bytes||0,attempts:r?.attempts||0,lastError:r?.lastError||null};}
 async status(k){const value=await this.resolve(k),row=this.read(this.location(k),k);if(row&&row.sha256!==value.sha256)throw fail('package_content_conflict',409);return this.summary(k,row);}
 async archive(k){const value=await this.resolve(k),dir=this.location(k,true),previous=queues.get(dir)||Promise.resolve();const work=previous.catch(()=>{}).then(()=>this.upload(k,dir,value));queues.set(dir,work);try{return await work;}finally{if(queues.get(dir)===work)queues.delete(dir);}}
 async upload(k,dir,value){const manifest=path.join(dir,'manifest.json'),payload=path.join(dir,'package.zip');let row=this.read(dir,k);if(row&&row.sha256!==value.sha256)throw fail('package_content_conflict',409);
  if(fs.existsSync(payload)){if(fs.lstatSync(payload).isSymbolicLink()||fs.statSync(payload).size!==value.bytes||crypto.createHash('sha256').update(fs.readFileSync(payload)).digest('hex')!==value.sha256)throw fail('package_local_integrity_failed');}else atomic(payload,value.buffer);
  if(row?.state==='committed')return this.summary(k,row);
  const save=()=>{row.updatedAt=new Date().toISOString();atomic(manifest,JSON.stringify(row));};
  if(!row){row={schemaVersion:1,...k,sha256:value.sha256,bytes:value.bytes,state:'pending',fileId:null,attempts:0,lastError:null};save();}
  try{
   if(!row.fileId){const id=await this.drive.allocateFileId();if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,200}$/.test(id))throw fail('package_reserved_id_invalid');row.fileId=id;row.state='reserved';save();}
   row.state='uploading';row.attempts++;row.lastError=null;save();
   const descriptor={...k,fileId:row.fileId,sha256:value.sha256};const receipt=await this.drive.putPackage({...descriptor,buffer:value.buffer});
   const remote=await this.drive.getPackage(descriptor);
   if(receipt?.fileId!==row.fileId||receipt?.sha256!==value.sha256||!Buffer.isBuffer(remote)||!remote.equals(value.buffer))throw fail('package_remote_verification_failed');
   row.state='committed';save();return this.summary(k,row);
  }catch{row.state='failed';row.lastError='package_cloud_operation_failed';save();throw fail('package_cloud_operation_failed');}
 }
}
module.exports={DeploymentZipArchive};
