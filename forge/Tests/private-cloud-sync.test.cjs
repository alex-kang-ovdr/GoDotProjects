"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {ProjectDriveSync}=require('../Tools/project-drive-sync.cjs');const {encodeSnapshot}=require('../Tools/drive-snapshot-store.cjs');const {createPrivatePlatformServer}=require('../Tools/private-platform-server.cjs');
test('account save queues durable cloud version; failure is visible and same-ID retry succeeds',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pf-cloud-api-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));let failures=true,allocations=0;const uploads=[];
 const drive={allocateFileId:async()=> 'reserved-'+(++allocations),putSnapshot:async input=>{uploads.push(input.fileId);if(failures)throw Object.assign(new Error('not exposed'),{code:'drive_transport_failed'});const e=encodeSnapshot(input);return {fileId:input.fileId,sha256:e.sha256};}};
 const sync=new ProjectDriveSync({enabled:true,directory:path.join(root,'outbox'),drive});
 const server=createPrivatePlatformServer({enabled:true,root,directory:path.join(root,'private'),publicOrigin:'https://creator.example',projectSync:sync,verifyToken:async token=>({iss:'accounts.google.com',sub:token})});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const base='http://127.0.0.1:'+server.address().port;
 async function req(url,method='GET',body,user='alice'){const r=await fetch(base+url,{method,headers:{Authorization:'Bearer '+user,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};}
 const created=await req('/api/platform/projects','POST',{name:'Cloud test'});assert.equal(created.status,201);const route='/api/platform/projects/'+created.body.project.id+'/cloud';
 let status;for(let i=0;i<30;i++){status=await req(route+'/history');if(status.body.versions?.[0]?.state==='failed')break;await new Promise(r=>setTimeout(r,10));}
 assert.equal(status.body.versions[0].state,'failed');assert.equal(status.body.versions[0].revision,1);assert.ok(!JSON.stringify(status.body).includes('reserved-1'));
 assert.equal((await req(route+'/history','GET',null,'bob')).status,404);
 failures=false;const retry=await req(route+'/retry/1','POST');assert.equal(retry.status,200);assert.equal(retry.body.cloudCommitted,true);assert.equal(allocations,1);assert.deepEqual(uploads,['reserved-1','reserved-1']);
 const read=await req(route.replace('/cloud',''));assert.equal(read.status,200);assert.equal(read.body.revision,1);
});
