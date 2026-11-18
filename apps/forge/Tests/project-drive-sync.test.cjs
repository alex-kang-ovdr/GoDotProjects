"use strict";
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {ProjectDriveSync}=require('../Tools/project-drive-sync.cjs');
const {encodeSnapshot}=require('../Tools/drive-snapshot-store.cjs');
const input={accountKey:'a'.repeat(64),projectId:'b'.repeat(24),revision:1,files:{'project.godot':'config_version=5\n'}};
function fixture(t){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'pf-drive-journal-'));
 t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const calls={allocate:0,put:[]};let fail=false;
 const drive={allocateFileId:async()=>{calls.allocate++;return 'reserved_'+calls.allocate;},putSnapshot:async value=>{
  calls.put.push(value);const row=JSON.parse(fs.readFileSync(path.join(directory,value.accountKey,value.projectId,value.revision+'.json'),'utf8'));
  assert.equal(row.fileId,value.fileId);assert.equal(row.state,'uploading');
  if(fail)throw Object.assign(new Error('secret token MUST NOT persist'),{code:'drive_transport_failed'});
  return {fileId:value.fileId,sha256:encodeSnapshot(value).sha256};
 }};
 return {directory,drive,calls,setFail:value=>{fail=value;},sync:()=>new ProjectDriveSync({enabled:true,directory,drive})};
}
test('default disabled; no implicit shared-store fallback',async()=>{
 const sync=new ProjectDriveSync();await assert.rejects(sync.syncSnapshot(input),{code:'drive_sync_disabled'});
 assert.throws(()=>new ProjectDriveSync({enabled:true}),{code:'sync_configuration_required'});
});
test('durable reservation precedes upload; restart reuses committed manifest',async t=>{
 const f=fixture(t);const a=await f.sync().syncSnapshot(input);assert.equal(a.state,'committed');assert.equal(a.attempts,1);
 const b=await f.sync().syncSnapshot(input);assert.equal(b.fileId,a.fileId);assert.equal(f.calls.allocate,1);assert.equal(f.calls.put.length,1);
 assert.equal(f.sync().listVersions(input.accountKey,input.projectId).length,1);
});
test('failed upload retries after restart with same ID and redacted failure state',async t=>{
 const f=fixture(t);f.setFail(true);await assert.rejects(f.sync().syncSnapshot(input),{code:'drive_transport_failed'});
 const row=f.sync().getVersion(input.accountKey,input.projectId,1);assert.equal(row.state,'failed');assert.equal(row.fileId,'reserved_1');
 assert.ok(!JSON.stringify(row).includes('secret'));f.setFail(false);
 const result=await f.sync().retryVersion(input.accountKey,input.projectId,1);assert.equal(result.state,'committed');assert.equal(result.attempts,2);
 assert.equal(f.calls.allocate,1);assert.deepEqual(f.calls.put.map(x=>x.fileId),['reserved_1','reserved_1']);
});
test('same revision different content conflicts without overwrite; distinct versions persist',async t=>{
 const f=fixture(t);await f.sync().syncSnapshot(input);
 await assert.rejects(f.sync().syncSnapshot({...input,files:{'project.godot':'changed'}}),{code:'revision_content_conflict'});
 await f.sync().syncSnapshot({...input,revision:2,files:{'project.godot':'changed'}});
 assert.deepEqual(f.sync().listVersions(input.accountKey,input.projectId).map(x=>x.revision),[1,2]);assert.equal(f.calls.put.length,2);
 assert.deepEqual(f.sync().listVersions('c'.repeat(64),input.projectId),[]);
});
test('parallel instances share per-version queue in one process',async t=>{
 const f=fixture(t);await Promise.all([f.sync().syncSnapshot(input),f.sync().syncSnapshot(input),f.sync().syncSnapshot(input)]);
 assert.equal(f.calls.allocate,1);assert.equal(f.calls.put.length,1);
});
test('corrupt journal fails closed and no allocation occurs',async t=>{
 const f=fixture(t);await f.sync().syncSnapshot(input);const file=path.join(f.directory,input.accountKey,input.projectId,'1.json');fs.writeFileSync(file,'{');
 await assert.rejects(f.sync().syncSnapshot(input),{code:'manifest_corrupt'});assert.equal(f.calls.allocate,1);
});
test('explicit store sync and subscription capture revisions without modifying store',async t=>{
 const f=fixture(t);let listener;let unsub=false;const project={id:input.projectId,revision:1,files:input.files};
 const store={getProject:id=>{assert.equal(id,project.id);return project;},subscribe:(id,fn)=>{listener=fn;return()=>{unsub=true;};}};
 const sync=f.sync();await sync.syncProject(store,input.accountKey,input.projectId);
 const close=sync.subscribeProject(store,{accountKey:input.accountKey,projectId:input.projectId,onError:e=>assert.fail(e.code)});
 listener({type:'project',project:{...project,revision:2}});
 await sync.syncSnapshot({...input,revision:2});assert.equal(f.calls.put.length,2);close();assert.equal(unsub,true);assert.equal(project.revision,1);
});

test('store hook queues new projects durably before broadcast and retains failure visibility',async t=>{
 const f=fixture(t);let broadcasts=0;const errors=[];
 const store={emit(id,event){broadcasts++;const file=path.join(f.directory,input.accountKey,id,event.project.revision+'.json');assert.ok(fs.existsSync(file));}};
 const original=store.emit;const sync=f.sync();const detach=sync.attachStore(input.accountKey,store,{onError:e=>errors.push(e)});
 assert.equal(sync.attachStore(input.accountKey,store,{onError:e=>errors.push(e)}),detach);
 assert.throws(()=>sync.attachStore('c'.repeat(64),store,{onError:e=>errors.push(e)}),{code:'store_account_mismatch'});
 f.setFail(true);store.emit(input.projectId,{type:'created',project:{id:input.projectId,revision:1,files:input.files}});
 assert.equal(broadcasts,1);await detach.flush();assert.equal(errors.length,1);assert.equal(errors[0].code,'drive_transport_failed');
 assert.equal(sync.getVersion(input.accountKey,input.projectId,1).state,'failed');detach();assert.equal(store.emit,original);
});

test('subscription hooks require an explicit error reporting callback',t=>{
 const f=fixture(t);const sync=f.sync();const store={emit(){},subscribe(){}};
 assert.throws(()=>sync.attachStore(input.accountKey,store),{code:'invalid_store_hook'});
 assert.throws(()=>sync.subscribeProject(store,{accountKey:input.accountKey,projectId:input.projectId}),{code:'invalid_error_handler'});
});
