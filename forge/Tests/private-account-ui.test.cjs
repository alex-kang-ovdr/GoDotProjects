"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createPrivatePlatformServer}=require('../Tools/private-platform-server.cjs');
test('opt-in UI exposes only fixed assets and disabled public configuration',async t=>{
 const server=createPrivatePlatformServer({accountUi:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const base='http://127.0.0.1:'+server.address().port;
 for(const p of ['/account','/account/','/account/app.js','/account/style.css']){const r=await fetch(base+p);assert.equal(r.status,200);assert.match(r.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.equal(r.headers.get('cache-control'),'no-store');}
 assert.deepEqual(await (await fetch(base+'/api/auth/config')).json(),{enabled:false,clientId:null,cloudSync:false,playHubDrafts:false});
 for(const p of ['/account/server.cjs','/account/../Tools/platform-store.cjs','/api/project','/api/platform/projects'])assert.equal((await fetch(base+p)).status,503);
});
test('UI does not persist credentials or interpolate user HTML',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../PrivateAccount/app.js'),'utf8');
 assert.doesNotMatch(source,/localStorage|sessionStorage|innerHTML|document\.cookie/);assert.match(source,/https:\/\/accounts.google.com\/gsi\/client/);assert.match(source,/nonce:challenge.nonce/);assert.match(source,/textContent=p.name/);
});
