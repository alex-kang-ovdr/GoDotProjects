"use strict";
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const net=require('node:net');
const {createPrivatePlatformServer}=require('../Tools/private-platform-server.cjs');const {PlatformStore}=require('../Tools/platform-store.cjs');const {accountKey}=require('../Tools/account-platform-api.cjs');
async function start(t,options){const s=createPrivatePlatformServer(options);await new Promise(r=>s.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>s.close(r)));return {server:s,base:'http://127.0.0.1:'+s.address().port};}
test('disabled default returns 503 without exposing shared API or static files',async t=>{const {base}=await start(t,{});for(const p of ['/api/platform/projects','/api/project','/Saved/Platform/projects','/'])assert.equal((await fetch(base+p)).status,503);});
test('private gateway rejects anonymous/cross-origin/legacy routes and exports only own PlayHub draft',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'playforge-private-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const directory=path.join(root,'accounts');
 const alice={iss:'accounts.google.com',sub:'alice'},bob={iss:'accounts.google.com',sub:'bob'};
 const {base,server}=await start(t,{enabled:true,root,directory,publicOrigin:'https://creator.example',playHubDrafts:true,playHubDraftDirectory:path.join(root,'drafts'),verifyToken:async t=>t==='a'?alice:t==='b'?bob:null});
 const h={Authorization:'Bearer a'};
 assert.equal((await fetch(base+'/api/platform/projects')).status,401);
 assert.equal((await fetch(base+'/api/auth/me',{headers:h})).status,200);
 assert.equal((await fetch(base+'/api/auth/me',{headers:{...h,Origin:'https://evil.example'}})).status,403);
 for(const p of ['/api/project','/api/builds/123','/api/export/godot-project.zip','/play/123','/Saved/Platform/projects'])assert.equal((await fetch(base+p,{headers:h})).status,404);
 const store=new PlatformStore(root,path.join(directory,accountKey(alice)));const p=store.createProject({name:'Own project'});
 const route='/api/playhub/projects/'+p.id+'/export';assert.equal((await fetch(base+route,{headers:h})).status,409);
 await store.createRelease(p.id,{revision:1});
 const response=await fetch(base+route,{headers:h});assert.equal(response.status,200);const draft=await response.json();assert.equal(draft.catalogEntry.enabled,false);assert.equal(draft.publicationPending,true);assert.equal(draft.revision,1);
 const staged=await fetch(base+route.replace('/export','/draft'),{method:'POST',headers:h});assert.equal(staged.status,201);assert.equal((await staged.json()).catalogEntry.enabled,false);assert.ok(fs.existsSync(path.join(root,'drafts',accountKey(alice),p.id+'.json')));
 assert.equal((await fetch(base+route,{headers:{Authorization:'Bearer b'}})).status,404);
 const reply=await new Promise((resolve,reject)=>{const socket=net.connect(server.address().port,'127.0.0.1',()=>socket.write('GET /ws HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n'));socket.once('data',d=>{resolve(d.toString());socket.destroy();});socket.once('error',reject);});assert.match(reply,/403 Forbidden/);
});
