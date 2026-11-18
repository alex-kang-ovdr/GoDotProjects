"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { accountKey, createAccountPlatformApi } = require('../Tools/account-platform-api.cjs');

test('requires verifier; uses stable Google sub, never email or path', () => {
  assert.throws(() => createAccountPlatformApi({}), /verifier/);
  assert.equal(accountKey({iss:'accounts.google.com',sub:'123',email:'old'}), accountKey({iss:'https://accounts.google.com',sub:'123',email:'new'}));
  assert.notEqual(accountKey({iss:'accounts.google.com',sub:'123'}), accountKey({iss:'accounts.google.com',sub:'456'}));
  assert.throws(() => accountKey({iss:'evil',sub:'123'}));
  assert.throws(() => accountKey({iss:'accounts.google.com',email:'a@b'}));
  assert.match(accountKey({iss:'accounts.google.com',sub:'../../not-a-path'}), /^[a-f0-9]{64}$/);
});

test('account isolation, spoof rejection, conflict and restore preserve other accounts', async t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'playforge-accounts-'));
  // Mock session verifier for tests only; production must verify Google/session.
  const sessions=new Map([['session-a',{iss:'accounts.google.com',sub:'101'}],['session-b',{iss:'accounts.google.com',sub:'202'}]]);
  const api=createAccountPlatformApi({root,directory:path.join(root,'private'),verifyIdentity:async req=>sessions.get(req.headers.authorization)});
  const server=http.createServer(async(req,res)=>{if(!await api(req,res,req.url))res.writeHead(404).end();});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(async()=>{api.close();await new Promise(r=>server.close(r));fs.rmSync(root,{recursive:true,force:true});});
  const base='http://127.0.0.1:'+server.address().port;
  async function request(session,route,method='GET',body) {
    const r=await fetch(base+route,{method,headers:{...(session?{authorization:session}:{}),'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    return {status:r.status,body:await r.json()};
  }
  const route='/api/platform/projects';
  assert.equal((await request(null,route)).status,401);
  assert.equal((await request('invented',route)).status,401);
  const a=await request('session-a',route,'POST',{name:'Private A',ownerId:'202'});
  assert.equal(a.status,201);const id=a.body.project.id;const target=route+'/'+id;
  assert.equal((await request('session-b',route)).body.projects.length,0);
  for(const suffix of ['', '/history','/releases']) assert.equal((await request('session-b',target+suffix)).status,404);
  const files=[...a.body.files,{path:'scripts/new.gd',content:'extends Node\n'}];
  assert.equal((await request('session-b',target,'PUT',{baseRevision:1,files})).status,404);
  assert.equal((await request('session-a',target,'PUT',{baseRevision:1,files})).body.revision,2);
  assert.equal((await request('session-b',target+'/restore','POST',{revision:1,baseRevision:2})).status,404);
  const restore=await request('session-a',target+'/restore','POST',{revision:1,baseRevision:2});
  assert.equal(restore.status,200);assert.equal(restore.body.revision,3);
  assert.ok(!restore.body.files.some(f=>f.path==='scripts/new.gd'));
  assert.equal((await request('session-a',target+'/restore','POST',{revision:1,baseRevision:2})).status,409);
  assert.equal((await request('session-a',target+'/history')).body.history.length,3);
  const privateDirs=fs.readdirSync(path.join(root,'private'));
  assert.equal(privateDirs.length,2);assert.ok(privateDirs.every(x=>/^[a-f0-9]{64}$/.test(x)));
});
