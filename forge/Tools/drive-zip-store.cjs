"use strict";
const {DriveSnapshotStore}=require('./drive-snapshot-store.cjs');
const {validateDeploymentZip,MAX_ZIP_BYTES}=require('./deployment-zip-validator.cjs');
const crypto=require('node:crypto');
const fail=(code,status=503)=>Object.assign(new Error(code),{code,status});
const idOK=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,200}$/.test(v);
function identity(d){if(!d||!idOK(d.fileId)||typeof d.accountKey!=='string'||!/^[a-f0-9]{64}$/.test(d.accountKey)||typeof d.projectId!=='string'||!/^[a-f0-9]{24}$/.test(d.projectId)||typeof d.releaseId!=='string'||!/^[a-f0-9]{24}$/.test(d.releaseId))throw fail('invalid_package_identity',400);}
class DriveZipStore {
 constructor(options={}){this.transport=new DriveSnapshotStore(options);this.folderId=options.folderId;}
 allocateFileId(){return this.transport.allocateFileId();}
 async metadata(d){identity(d);return this.transport.json(await this.transport.request('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(d.fileId)+'?fields=id,mimeType,size,parents,trashed,appProperties'));}
 assertMeta(m,d,sha){const p=m?.appProperties||{};if(m?.id!==d.fileId||m.trashed||m.mimeType!=='application/zip'||!m.parents?.includes(this.folderId)||p.pfAccount!==d.accountKey||p.pfProject!==d.projectId||p.pfRelease!==d.releaseId||p.pfKind!=='deployment-zip'||!/^[a-f0-9]{64}$/.test(p.pfSha256||'')||sha&&p.pfSha256!==sha)throw fail('package_identity_conflict',409);return p.pfSha256;}
 async getPackage(d){this.transport.ensureEnabled();identity(d);const m=await this.metadata(d),sha=this.assertMeta(m,d,d.sha256);const size=Number(m.size);if(!Number.isSafeInteger(size)||size<22||size>MAX_ZIP_BYTES)throw fail('package_size_invalid',413);
  const response=await this.transport.request('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(d.fileId)+'?alt=media');if(!response.ok)throw fail('package_download_failed');
  let length=0;const chunks=[];try{for await(const c of response.body){length+=c.length;if(length>MAX_ZIP_BYTES||length>size)throw fail('package_size_invalid',413);chunks.push(Buffer.from(c));}}catch{throw fail('package_download_failed');}
  const buffer=Buffer.concat(chunks);if(buffer.length!==size||crypto.createHash('sha256').update(buffer).digest('hex')!==sha)throw fail('package_integrity_failed',409);validateDeploymentZip(buffer);return buffer;
 }
 async putPackage(d){this.transport.ensureEnabled();identity(d);const valid=validateDeploymentZip(d.buffer);const metadata={id:d.fileId,name:d.projectId+'-'+d.releaseId+'.zip',mimeType:'application/zip',parents:[this.folderId],appProperties:{pfAccount:d.accountKey,pfProject:d.projectId,pfRelease:d.releaseId,pfKind:'deployment-zip',pfSha256:valid.sha256}};
  const response=await this.transport.request('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id',{method:'POST',headers:{'Content-Type':'application/json','X-Upload-Content-Type':'application/zip','X-Upload-Content-Length':String(d.buffer.length)},body:JSON.stringify(metadata)});
  if(response.status!==409){
   if(!response.ok)throw fail('package_upload_failed');
   let location;try{location=new URL(response.headers.get('location'));}catch{throw fail('package_session_invalid');}
   if(location.origin!=='https://www.googleapis.com'||location.pathname!=='/upload/drive/v3/files'||location.username||location.password||!location.searchParams.get('upload_id'))throw fail('package_session_invalid');
   const uploaded=await this.transport.request(location.href,{method:'PUT',headers:{'Content-Type':'application/zip','Content-Length':String(d.buffer.length)},body:d.buffer});
   if(uploaded.status!==409){const result=await this.transport.json(uploaded);if(result.id!==d.fileId)throw fail('package_receipt_invalid');}
  }
  // Includes recovery after ambiguous prior upload or 409: never overwrite existing ID.
  const remote=await this.getPackage({...d,sha256:valid.sha256});if(!remote.equals(d.buffer))throw fail('package_integrity_failed',409);
  return {fileId:d.fileId,sha256:valid.sha256,bytes:valid.bytes,cloudVerified:true};
 }
}
module.exports={DriveZipStore};
