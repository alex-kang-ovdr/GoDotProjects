"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createLoginSessions}=require('../Tools/login-sessions.cjs');const {createPrivatePlatformServer}=require('../Tools/private-platform-server.cjs');
const pair=cookie=>cookie.split(';')[0];
test('one-use challenges, bounded sessions, rotation, expiry and no credential persistence',()=>{
 let now=1000000;const s=createLoginSessions({now:()=>now,maxEntries:2,sessionSeconds:10});const identity={iss:'accounts.google.com',sub:'a',exp:2000};
 const c=s.challenge();assert.match(c.setCookie,/HttpOnly; Secure; SameSite=Strict/);assert.equal(s.consumeChallenge(pair(c.setCookie)),c.nonce);assert.throws(()=>s.consumeChallenge(pair(c.setCookie)));
 const first=s.issue(identity);const old=pair(first.setCookie[0]);assert.equal(s.authenticate(old).identity.sub,'a');const second=s.issue(identity,old);assert.throws(()=>s.authenticate(old));
 const current=pair(second.setCookie[0]);now+=10001;assert.throws(()=>s.authenticate(current));s.close();
});
test('challenge capacity and duplicate-cookie identity are rejected',()=>{const s=createLoginSessions({maxEntries:1});s.challenge();assert.throws(()=>s.challenge(),e=>e.status===429);assert.throws(()=>s.authenticate('__Host-pf-session='+'a'.repeat(64)+'; __Host-pf-session='+'b'.repeat(64)));s.close();});
test('nonce login cookie works without bearer; CSRF, replay and logout are enforced',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pf-login-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 let expected;const origin='https://creator.example';const server=createPrivatePlatformServer({enabled:true,root,directory:path.join(root,'private'),publicOrigin:origin,verifyToken:async(token,opts)=>{if(token!=='test-token'||opts?.nonce!==expected)throw Object.assign(new Error('denied'),{status:401});return {iss:'accounts.google.com',sub:'user1',exp:Date.now()/1000+300};}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const base='http://127.0.0.1:'+server.address().port;
 async function req(route,method='GET',cookie,body,withOrigin=true){return fetch(base+route,{method,headers:{...(withOrigin?{Origin:origin}:{}),...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});}
 assert.equal((await req('/api/auth/challenge','POST',null,null,false)).status,403);
 const challenge=await req('/api/auth/challenge','POST');expected=(await challenge.json()).nonce;const c=pair(challenge.headers.getSetCookie()[0]);
 const login=await req('/api/auth/login','POST',c,{credential:'test-token'});assert.equal(login.status,200);const session=pair(login.headers.getSetCookie()[0]);
 assert.equal((await req('/api/auth/me','GET',session)).status,200);
 assert.equal((await req('/api/auth/login','POST',c,{credential:'test-token'})).status,401);
 assert.equal((await req('/api/platform/projects','POST',session,{name:'Owned'},false)).status,403);
 assert.equal((await req('/api/platform/projects','POST',session,{name:'Owned'})).status,201);
 assert.equal((await req('/api/auth/logout','POST',session)).status,200);
 assert.equal((await req('/api/auth/me','GET',session)).status,401);
});
