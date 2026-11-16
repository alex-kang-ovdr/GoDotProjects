import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server/app.mjs';

const ORIGIN='http://127.0.0.1:8080';
class Client {
  constructor(base){this.base=base;this.jar=new Map();this.csrf=null;}
  async call(path,{method='GET',body,csrf=true}={}){
    const headers={Origin:ORIGIN}; if(this.jar.size)headers.Cookie=[...this.jar].map(([k,v])=>`${k}=${v}`).join('; ');
    if(body!==undefined)headers['Content-Type']='application/json'; if(csrf&&this.csrf&&method!=='GET')headers['X-CSRF-Token']=this.csrf;
    const response=await fetch(this.base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
    for(const line of response.headers.getSetCookie()){const [pair]=line.split(';'),i=pair.indexOf('=');this.jar.set(pair.slice(0,i),pair.slice(i+1));}
    const data=await response.json();if(data.csrfToken)this.csrf=data.csrfToken;return {status:response.status,data};
  }
}
async function fixture(){
  const root=mkdtempSync(join(tmpdir(),'wishlist-http-'));mkdirSync(join(root,'catalog'));mkdirSync(join(root,'games'));
  const entries=['one','two'].map(id=>({id,path:`games/${id}`,enabled:true}));writeFileSync(join(root,'catalog/games.json'),JSON.stringify({schemaVersion:1,entries}));
  for(const {id,path} of entries){mkdirSync(join(root,path));writeFileSync(join(root,path,'game.manifest.json'),JSON.stringify({schemaVersion:1,id,entry:'index.html',version:'1.0.0',title:{en:id},summary:{en:id},instructions:{en:id},tags:[],controls:[],save:{schemaVersion:1},media:{cover:'cover.svg'}}));}
  const app=createApp({publicHost:'127.0.0.1',publicPort:0,adminHost:'127.0.0.1',adminPort:0,userOrigins:[ORIGIN],adminOrigins:['http://127.0.0.1:8081'],userBaseUrl:ORIGIN,publicBaseUrl:ORIGIN,adminBaseUrl:'http://127.0.0.1:8081',secureCookies:false,dataDir:join(root,'data')},{rootDir:root});
  const address=await app.listen();return {root,app,db:app.db,client:new Client(`http://127.0.0.1:${address.public.port}`),other:new Client(`http://127.0.0.1:${address.public.port}`),async close(){await app.close();for(let i=0;i<5;i++){try{rmSync(root,{recursive:true,force:true});break;}catch{await new Promise(r=>setTimeout(r,50));}}}};
}

test('wishlist and locale preferences use isolated HTTP state',async t=>{
  const f=await fixture();t.after(()=>f.close());
  assert.deepEqual((await f.client.call('/api/wishlist')).data,{items:[],kind:'anonymous'});
  assert.deepEqual((await f.client.call('/api/preferences')).data,{locale:null});
  await f.client.call('/api/session');
  assert.equal((await f.client.call('/api/wishlist/one',{method:'PUT',csrf:false})).status,403);
  assert.equal((await f.client.call('/api/wishlist/one',{method:'PUT',body:{}})).status,200);
  const first=(await f.client.call('/api/wishlist')).data;assert.equal(first.kind,'guest');assert.equal(first.items.length,1);assert.equal(first.items[0].available,true);assert.ok(Number.isFinite(Date.parse(first.items[0].addedAt)));
  await f.client.call('/api/wishlist/one',{method:'PUT',body:{}});assert.equal(f.db.prepare("SELECT count(*) n FROM events WHERE name='wishlist_add'").get().n,1);
  await f.other.call('/api/session');assert.equal((await f.other.call('/api/wishlist')).data.items.length,0);
  f.db.prepare('INSERT INTO game_overrides VALUES(?,?,?)').run('two',0,Date.now());
  assert.equal((await f.client.call('/api/wishlist/two',{method:'PUT',body:{}})).status,404);
  f.db.prepare('INSERT INTO wishlist_items VALUES(?,?,?)').run(f.db.prepare("SELECT principal_id FROM sessions WHERE kind='public' ORDER BY created_at LIMIT 1").get().principal_id,'two',Date.now());
  const listed=(await f.client.call('/api/wishlist')).data.items.find(x=>x.gameId==='two');assert.equal(listed.available,false);
  await f.client.call('/api/wishlist/two',{method:'DELETE'});await f.client.call('/api/wishlist/two',{method:'DELETE'});
  assert.equal(f.db.prepare("SELECT count(*) n FROM events WHERE name='wishlist_remove'").get().n,1);
  assert.equal((await f.client.call('/api/preferences',{method:'PUT',body:{locale:'ko'}})).data.locale,'ko');
  assert.equal((await f.client.call('/api/preferences')).data.locale,'ko');
  assert.equal((await f.client.call('/api/preferences',{method:'PUT',body:{locale:'xx'}})).status,422);
  // Exercise the same merge transaction via the public merge endpoint.
  const session=f.db.prepare("SELECT * FROM sessions WHERE kind='public' ORDER BY created_at LIMIT 1").get(), guest=session.principal_id;
  const account='registered-test';f.db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(account,'registered',null,Date.now());
  f.db.prepare('UPDATE sessions SET principal_id=? WHERE id_hash=?').run(account,session.id_hash);
  f.db.prepare('INSERT INTO user_preferences VALUES(?,?,?)').run(account,'fr',Date.now());
  f.db.prepare('INSERT INTO wishlist_items VALUES(?,?,?)').run(guest,'two',Date.now());
  f.db.prepare('INSERT INTO merge_requests VALUES(?,?,?,?,?,?,?,?)').run('merge-test',guest,account,'source-subject','target-subject','pending',Date.now()+60000,null);
  const merged=await f.client.call('/api/auth/merge',{method:'POST',body:{consent:true,mergeId:'merge-test'}});assert.equal(merged.status,200);
  assert.deepEqual(f.db.prepare('SELECT game_id FROM wishlist_items WHERE principal_id=? ORDER BY game_id').all(account).map(x=>x.game_id),['one','two']);
  assert.equal(f.db.prepare('SELECT locale FROM user_preferences WHERE principal_id=?').get(account).locale,'fr');
  f.db.prepare('DELETE FROM user_preferences WHERE principal_id=?').run(account);
  f.db.prepare('INSERT INTO merge_requests VALUES(?,?,?,?,?,?,?,?)').run('merge-locale',guest,account,'source-subject','target-subject','pending',Date.now()+60000,null);
  assert.equal((await f.client.call('/api/auth/merge',{method:'POST',body:{consent:true,mergeId:'merge-locale'}})).status,200);
  assert.equal((await f.client.call('/api/preferences')).data.locale,'ko');
  assert.equal((await f.client.call('/api/preferences',{method:'PUT',body:{locale:'hi'},csrf:false})).status,403);
  for(const locale of ['en','ja','zh-CN','fr','es','pt-BR','hi'])assert.equal((await f.client.call('/api/preferences',{method:'PUT',body:{locale}})).data.locale,locale);
});
