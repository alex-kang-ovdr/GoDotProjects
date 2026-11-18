"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const { DriveSnapshotStore, encodeSnapshot, MAX_BYTES } = require('../Tools/drive-snapshot-store.cjs');
const input = { fileId:'reserved_123',accountKey:'a'.repeat(64),projectId:'b'.repeat(24),revision:1,files:{'project.godot':'config_version=5\n'} };
const json = (data,status=200) => new Response(JSON.stringify(data),{status});
function setup(responses) {
  const calls=[];
  const store=new DriveSnapshotStore({enabled:true,folderId:'owner_folder',getAccessToken:async()=> 'test-only-token',fetchImpl:async(url,options)=>{
    calls.push({url,options}); const r=responses.shift(); if(r instanceof Error)throw r; return r;
  }});
  return {store,calls};
}
function metadata(hash=encodeSnapshot(input).sha256) {
  return {id:input.fileId,parents:['owner_folder'],size:String(encodeSnapshot(input).bytes.length),appProperties:{pfAccount:input.accountKey,pfProject:input.projectId,pfRevision:'1',pfSha256:hash}};
}
test('disabled by default and missing configuration fail before any token/network use',async()=>{
  let used=false;const store=new DriveSnapshotStore({getAccessToken:()=>{used=true;}});
  await assert.rejects(store.allocateFileId(),{code:'drive_disabled'});await assert.rejects(store.putSnapshot(input),{code:'drive_disabled'});
  assert.equal(used,false);assert.throws(()=>new DriveSnapshotStore({enabled:true}),{code:'drive_configuration_required'});
});
test('allocates server-generated ID and creates immutable multipart in explicit folder',async()=>{
  const {store,calls}=setup([json({ids:['reserved_123']}),json({id:'reserved_123'})]);
  assert.equal(await store.allocateFileId(),'reserved_123');const result=await store.putSnapshot(input);
  assert.equal(result.reused,false);assert.equal(calls[1].options.method,'POST');
  const body=calls[1].options.body.toString();assert.match(body,/"parents":\["owner_folder"\]/);assert.match(body,/"id":"reserved_123"/);
  assert.equal(calls[1].options.redirect,'error');assert.equal(calls[1].options.headers.Authorization,'Bearer test-only-token');
  assert.ok(!JSON.stringify(result).includes('token'));
});
test('same reserved ID and content after conflict is idempotent; changed content never overwrites',async()=>{
  const a=setup([json({},409),json(metadata())]);assert.equal((await a.store.putSnapshot(input)).reused,true);
  assert.ok(a.calls.every(c=>c.options.method!=='PATCH'));
  const b=setup([json({},409),json(metadata())]);await assert.rejects(b.store.putSnapshot({...input,files:{'project.godot':'changed'}}),{code:'snapshot_identity_conflict'});
});
test('foreign account/folder snapshots cannot be read and media is not requested',async()=>{
  for(const meta of [{...metadata(),parents:['other']},{...metadata(),appProperties:{...metadata().appProperties,pfAccount:'c'.repeat(64)}}]) {
    const {store,calls}=setup([json(meta)]);await assert.rejects(store.getSnapshot(input),{code:'snapshot_identity_conflict'});assert.equal(calls.length,1);
  }
});
test('download checks owner metadata and content hash',async()=>{
  const d=encodeSnapshot(input);const a=setup([json(metadata()),new Response(d.bytes)]);
  assert.deepEqual((await a.store.getSnapshot(input)).files,input.files);
  const b=setup([json(metadata()),new Response('tampered')]);await assert.rejects(b.store.getSnapshot(input),{code:'snapshot_integrity_failed'});
});
test('oversize, path traversal and invalid identifiers fail before network',async()=>{
  const {store,calls}=setup([]);
  await assert.rejects(store.putSnapshot({...input,files:{'../secret':'x'}}),{code:'invalid_files'});
  await assert.rejects(store.putSnapshot({...input,files:{'large.gd':'x'.repeat(MAX_BYTES)}}),{code:'snapshot_too_large'});
  await assert.rejects(store.putSnapshot({...input,fileId:'../../escape'}),{code:'invalid_snapshot'});assert.equal(calls.length,0);
});
test('token/network errors are redacted; no automatic uncertain write retry',async()=>{
  const a=setup([new Error('sensitive token or response')]);await assert.rejects(a.store.putSnapshot(input),{message:'drive_transport_failed'});assert.equal(a.calls.length,1);
  const b=setup([json({error:'sensitive'},403)]);await assert.rejects(b.store.putSnapshot(input),{message:'drive_request_failed'});
});

test('untrusted endpoint cannot receive operator token',async()=>{
  const {store,calls}=setup([]);
  await assert.rejects(store.request('https://evil.example/drive/v3/files'),{code:'invalid_drive_endpoint'});
  await assert.rejects(store.request('https://www.googleapis.com.evil.example/drive/v3/files'),{code:'invalid_drive_endpoint'});
  assert.equal(calls.length,0);
});
