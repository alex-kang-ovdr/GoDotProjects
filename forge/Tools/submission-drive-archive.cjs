"use strict";
const {ProjectDriveSync}=require('./project-drive-sync.cjs');
const {encodeSnapshot}=require('./drive-snapshot-store.cjs');
const fail=(code,status=503)=>Object.assign(new Error(code),{code,status});
const META='__playhub_submission__.json';
class SubmissionDriveArchive {
 constructor({enabled=false,directory,drive,resolveOwnedRelease}={}) {
  this.enabled=enabled===true;this.resolveOwnedRelease=resolveOwnedRelease;
  if(this.enabled&&(!directory||typeof resolveOwnedRelease!=='function'||!drive||typeof drive.getSnapshot!=='function'||typeof drive.putSnapshot!=='function'||typeof drive.allocateFileId!=='function'))throw fail('submission_archive_configuration_required');
  const verifiedDrive=drive&&{
   allocateFileId:()=>drive.allocateFileId(),
   putSnapshot:async input=>{
    const receipt=await drive.putSnapshot(input);
    // A POST receipt or local pending journal alone is NOT verified cloud storage.
    const remote=await drive.getSnapshot(input);
    const expected=encodeSnapshot(input);
    if(!remote||remote.accountKey!==input.accountKey||remote.projectId!==input.projectId||remote.revision!==input.revision||
      encodeSnapshot({...input,files:remote.files}).sha256!==expected.sha256)throw fail('submission_remote_integrity_failed',409);
    if(receipt?.fileId!==input.fileId||receipt?.sha256!==expected.sha256)throw fail('submission_receipt_mismatch',409);
    return receipt;
   }
  };
  this.sync=new ProjectDriveSync({enabled:this.enabled,directory,drive:verifiedDrive});
 }
 async resolve(input){
  if(!this.enabled)throw fail('submission_archive_disabled');
  if(!input||Object.keys(input).some(k=>!['accountKey','projectId','releaseId'].includes(k))||
    !/^[a-f0-9]{64}$/.test(input.accountKey||'')||!/^[a-f0-9]{24}$/.test(input.projectId||'')||!/^[a-f0-9]{24}$/.test(input.releaseId||''))throw fail('invalid_submission_identity',400);
  let release;
  try{release=await this.resolveOwnedRelease(input.accountKey,input.projectId,input.releaseId);}catch{throw fail('submission_not_found',404);}
  if(!release||release.accountKey!==input.accountKey||release.projectId!==input.projectId||release.releaseId!==input.releaseId)throw fail('submission_not_found',404);
  if(!Number.isSafeInteger(release.revision)||release.revision<1||!release.files||typeof release.files!=='object'||Array.isArray(release.files)||Object.hasOwn(release.files,META))throw fail('invalid_submission_release',400);
  const metadata={schemaVersion:1,artifactType:'release-source',projectId:input.projectId,releaseId:input.releaseId,revision:release.revision,publicationPending:true,runnableVerified:false};
  const canonical=encodeSnapshot({accountKey:input.accountKey,projectId:input.projectId,revision:release.revision,fileId:'unallocated',files:{...release.files,[META]:JSON.stringify(metadata)}});
  return {...JSON.parse(canonical.bytes),releaseId:input.releaseId,sha256:canonical.sha256};
 }
 publicStatus(release,row){
  if(row&&row.sha256!==release.sha256)throw fail('submission_revision_conflict',409);
  return {projectId:release.projectId,releaseId:release.releaseId,revision:release.revision,artifactType:'release-source',publicationPending:true,published:false,runnableVerified:false,
   localRecorded:!!row,cloudVerified:row?.state==='committed',state:row?.state||'not-recorded',sha256:row?.sha256||null,bytes:row?.bytes||0,attempts:row?.attempts||0,lastError:row?.lastError||null};
 }
 async archive(input){const release=await this.resolve(input);const row=await this.sync.syncSnapshot(release);return this.publicStatus(release,row);}
 async status(input){const release=await this.resolve(input);let row=null;try{row=this.sync.getVersion(release.accountKey,release.projectId,release.revision);}catch(e){if(e.code!=='version_not_found')throw e;}return this.publicStatus(release,row);}
}
module.exports={SubmissionDriveArchive};
