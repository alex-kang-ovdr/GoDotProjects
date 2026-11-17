'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {BuildQueue}=require('../Tools/build-queue.cjs');
test('multiplayer participants reuse the same queued, running and completed project build',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'build-reuse-')),queue=new BuildQueue(path.resolve(__dirname,'..'),dir);
 t.after(()=>{queue.close();fs.rmSync(dir,{recursive:true,force:true});});
 let finish;const wait=new Promise(r=>finish=r);
 queue.build=async job=>{await wait;const output=path.join(dir,job.id,'output');fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'index.html'),'ok');job.files=['index.html'];};
 const snapshot={id:'a'.repeat(24),revision:1,files:[{path:'project.godot',content:'one'}]};
 const first=queue.enqueue(snapshot);assert.equal(queue.enqueue(snapshot).id,first.id);
 await new Promise(r=>setImmediate(r));assert.equal(queue.get(first.id).status,'running');assert.equal(queue.enqueue(snapshot).id,first.id);
 const changed=queue.enqueue({...snapshot,files:[{path:'project.godot',content:'two'}]});assert.notEqual(changed.id,first.id);
 finish();while(queue.running)await new Promise(r=>setTimeout(r,10));
 assert.equal(queue.enqueue(snapshot).id,first.id);
 assert.notEqual(queue.enqueue({...snapshot,revision:2}).id,first.id);
 await new Promise(r=>setImmediate(r));while(queue.running)await new Promise(r=>setTimeout(r,10));
});
