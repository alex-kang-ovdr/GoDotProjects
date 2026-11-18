import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, scryptSync, generateKeyPairSync, sign, createHash } from 'node:crypto';
import { createApp } from '../server/app.mjs';
import { retentionFromActivity, liveMetrics } from '../server/metrics.mjs';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../server/db.mjs';

const USER_ORIGIN = 'http://127.0.0.1:8080';
const ADMIN_ORIGIN = 'http://127.0.0.1:8081';
const PASSWORD = 'Test-only-random-admin-42!';
class Client {
  constructor(base,origin) { this.base=base;this.origin=origin;this.jar=new Map();this.csrf=null; }
  async call(path,{method='GET',body,headers={},csrf=true,origin=this.origin}={}) {
    const h={Origin:origin,...headers};
    if(this.jar.size) h.Cookie=[...this.jar].map(([k,v])=>`${k}=${v}`).join('; ');
    if(body!==undefined)h['Content-Type']='application/json';
    if(csrf&&this.csrf&&method!=='GET')h['X-CSRF-Token']=this.csrf;
    const response=await fetch(this.base+path,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body),redirect:'manual'});
    for(const line of response.headers.getSetCookie()) { const first=line.split(';')[0],at=first.indexOf('=');this.jar.set(first.slice(0,at),first.slice(at+1)); }
    const raw=await response.text();let data;
    try{data=JSON.parse(raw);}catch{data=raw;}
    if(data?.csrfToken)this.csrf=data.csrfToken;
    return {status:response.status,data,headers:response.headers};
  }
}

async function fixture(options={}) {
  const root=mkdtempSync(join(tmpdir(),'game-platform-test-'));
  mkdirSync(join(root,'catalog'));mkdirSync(join(root,'games'));
  const entries=['test-puzzle','other-puzzle'].map(id=>({id,path:`games/${id}`,enabled:true}));
  writeFileSync(join(root,'catalog/games.json'),JSON.stringify({schemaVersion:1,entries}));
  for(const {id,path}of entries) {mkdirSync(join(root,path),{recursive:true});writeFileSync(join(root,path,'game.manifest.json'),JSON.stringify({schemaVersion:1,id,entry:'index.html',version:'0.1.0',updatedOn:id==='test-puzzle'?'2026-11-16':'2026-11-31',title:{ko:id},summary:{ko:'테스트'},instructions:{ko:'테스트 조작'},tags:['puzzle'],controls:['keyboard'],save:{schemaVersion:1},media:{cover:'assets/cover.svg'}}));}
  let stamp=options.startAt ?? Date.parse('2026-11-16T03:00:00Z');
  const salt='abcdef0123456789abcdef0123456789';
  const config={publicHost:'127.0.0.1',publicPort:0,adminHost:'127.0.0.1',adminPort:0,userOrigins:[USER_ORIGIN],adminOrigins:[ADMIN_ORIGIN],userBaseUrl:USER_ORIGIN,publicBaseUrl:'http://127.0.0.1:8090',adminBaseUrl:ADMIN_ORIGIN,dataDir:join(root,'data'),secureCookies:false,admin:{username:'admin',salt,passwordHash:scryptSync(PASSWORD,salt,64).toString('hex')},google:options.google||{}};
  const deps={rootDir:root,clock:()=>stamp,...(options.fetch?{fetch:options.fetch}: {})};
  const app=createApp(config,deps);const addresses=await app.listen();
  const publicUrl=`http://127.0.0.1:${addresses.public.port}`,adminUrl=`http://127.0.0.1:${addresses.admin.port}`;
  return {root,config,deps,app,client:new Client(publicUrl,USER_ORIGIN),admin:new Client(adminUrl,ADMIN_ORIGIN),newClient:()=>new Client(publicUrl,USER_ORIGIN),now:()=>stamp,advance:n=>{stamp+=n;},async close(){await this.app.close();rmSync(root,{recursive:true,force:true});}};
}

async function ready(client,gameId='test-puzzle') {
  await client.call('/api/session');
  const response=await client.call('/api/play-sessions',{method:'POST',body:{gameId}});
  assert.equal(response.status,201,JSON.stringify(response.data));
  const play=response.data;
  const e=await client.call('/api/events',{method:'POST',body:{events:[{event_id:randomUUID(),event_name:'game_ready',play_session_id:play.id}]}});
  assert.equal(e.data.accepted.length,1,JSON.stringify(e.data));return play;
}
async function adminLogin(f) { await f.admin.call('/api/admin/session');const r=await f.admin.call('/api/admin/login',{method:'POST',body:{username:'admin',password:PASSWORD}});assert.equal(r.status,200,JSON.stringify(r.data));assert.match(r.headers.get('set-cookie'),/Max-Age=28800(?:;|$)/); }

test('public/admin real HTTP security, guest save, telemetry, metrics and persistence',async t=>{
  const f=await fixture();t.after(()=>f.close());
  await t.test('listeners are isolated and catalog is public',async()=>{
    assert.equal((await f.client.call('/api/health')).data.service,'public');
    assert.equal((await f.admin.call('/api/health')).data.service,'admin');
    assert.equal((await f.client.call('/api/admin/metrics')).status,404);
    assert.equal((await f.admin.call('/api/session')).status,404);
    const games=(await f.client.call('/api/games')).data.games;
    assert.equal(games.length,2);
    assert.equal(games.find(game=>game.id==='test-puzzle').updatedOn,'2026-11-16');
    assert.equal(Object.hasOwn(games.find(game=>game.id==='other-puzzle'),'updatedOn'),false);
    assert.equal((await f.client.call('/api/games/test-puzzle')).data.updatedOn,'2026-11-16');
    const session=await f.client.call('/api/session');
    assert.equal(session.data.kind,'anonymous');assert.equal(session.data.googleEnabled,false);
    assert.equal(f.app.db.prepare('SELECT count(*) n FROM users').get().n,0);
    assert.match(session.headers.get('set-cookie'),/HttpOnly/);
    assert.match(session.headers.get('set-cookie'),/Path=\/api;/);
    assert.equal((await f.client.call('/api/auth/google/start')).status,503);
  });
  await t.test('CSRF and origin are required on mutations',async()=>{
    assert.equal((await f.client.call('/api/play-sessions',{method:'POST',body:{gameId:'test-puzzle'},csrf:false})).status,403);
    assert.equal((await f.client.call('/api/play-sessions',{method:'POST',body:{gameId:'test-puzzle'},origin:'https://evil.invalid'})).status,403);
  });
  const impression={event_id:randomUUID(),event_name:'game_impression',game_id:'test-puzzle',impression_id:randomUUID(),properties:{visible_fraction:.5,visible_duration_ms:1000,document_visible:true}};
  await t.test('pre-play anonymous impression and click deduplicate without users row',async()=>{
    let r=await f.client.call('/api/events',{method:'POST',body:{events:[impression,impression]}});
    assert.equal(r.data.accepted.length,1);assert.equal(r.data.duplicates.length,1);
    const click={event_id:randomUUID(),event_name:'game_card_click',game_id:'test-puzzle',impression_id:impression.impression_id,properties:{viewability_met:true}};
    r=await f.client.call('/api/events',{method:'POST',body:{events:[click,{...click,event_id:randomUUID()}]}});
    assert.equal(r.data.accepted.length,2);
    assert.equal(f.app.db.prepare('SELECT count(*) n FROM users').get().n,0);
  });
  const play=await ready(f.client);
  await t.test('first play promotes guest and save uses conditional writes',async()=>{
    assert.equal((await f.client.call('/api/session')).data.kind,'guest');
    assert.equal((await f.client.call('/api/saves/test-puzzle')).status,404);
    const request={method:'PUT',body:{payload:{level:3},schemaVersion:1},headers:{'If-None-Match':'*','Idempotency-Key':'test-save-create'}};
    const first=await f.client.call('/api/saves/test-puzzle',request);assert.equal(first.status,201);assert.equal(first.data.revision,1);
    const retry=await f.client.call('/api/saves/test-puzzle',request);assert.equal(retry.data.revision,1);
    const conflict=await f.client.call('/api/saves/test-puzzle',{method:'PUT',body:{payload:{level:4}},headers:{'If-Match':'"r0"'}});assert.equal(conflict.status,412);
    const update=await f.client.call('/api/saves/test-puzzle',{method:'PUT',body:{payload:{level:4}},headers:{'If-Match':'"r1"'}});assert.equal(update.data.revision,2);
    const other=f.newClient();await ready(other);assert.equal((await other.call('/api/saves/test-puzzle')).status,404);
  });
  await t.test('untrusted fields, milestones and cross-game sessions are rejected',async()=>{
    const r=await f.client.call('/api/events',{method:'POST',body:{events:[
      {event_id:randomUUID(),event_name:'active_play_10s',play_session_id:play.id},
      {event_id:randomUUID(),event_name:'game_ready',play_session_id:play.id,game_id:'other-puzzle'},
      {...impression,event_id:randomUUID(),subject_id:'forged'}
    ]}});assert.equal(r.data.rejected.length,3);
  });
  await t.test('server caps heartbeat elapsed time and produces 10s/60s once',async()=>{
    const heartbeat=async(seq,delta,visible=true)=>f.client.call('/api/events',{method:'POST',body:{events:[{event_id:randomUUID(),event_name:'play_heartbeat',play_session_id:play.id,properties:{sequence:seq,active_delta_ms:delta,document_visible:visible,paused:false,game_updating:true}}]}});
    await heartbeat(0,60000);assert.equal(f.app.db.prepare('SELECT active_ms FROM play_sessions WHERE id=?').get(play.id).active_ms,0);
    f.advance(15000);await heartbeat(1,15000);
    f.advance(15000);await heartbeat(2,15000,false);
    assert.equal(f.app.db.prepare('SELECT active_ms FROM play_sessions WHERE id=?').get(play.id).active_ms,15000);
    for(let i=3;i<=5;i++){f.advance(15000);await heartbeat(i,15000);}
    const bad=await heartbeat(5,15000);assert.equal(bad.data.rejected[0].code,'HEARTBEAT_INVALID');
    assert.equal(f.app.db.prepare("SELECT count(*) n FROM events WHERE name='active_play_10s' AND play_session_id=?").get(play.id).n,1);
    assert.equal(f.app.db.prepare("SELECT count(*) n FROM events WHERE name='active_play_60s' AND play_session_id=?").get(play.id).n,1);
  });
  await t.test('round duplicate and runtime errors are controlled',async()=>{
    const event={event_id:randomUUID(),event_name:'round_complete',play_session_id:play.id,properties:{run_id:randomUUID(),result:'win',score:100}};
    const r=await f.client.call('/api/events',{method:'POST',body:{events:[event,{...event,event_id:randomUUID()},{event_id:randomUUID(),event_name:'runtime_error',play_session_id:play.id,properties:{code:'TEST_ERROR',message:'do not persist arbitrary private text'}}]}});
    assert.equal(r.data.duplicates.length,1);assert.equal(r.data.accepted.length,2);
  });
  await t.test('administrator password and separate session required',async()=>{
    assert.equal((await f.admin.call('/api/admin/metrics')).status,401);
    assert.match((await f.admin.call('/api/admin/session')).headers.get('set-cookie'),/Path=\/api;/);
    assert.equal((await f.admin.call('/api/admin/login',{method:'POST',body:{username:'admin',password:PASSWORD},csrf:false})).status,403);
    assert.equal((await f.admin.call('/api/admin/login',{method:'POST',body:{username:'admin',password:'wrong'}})).status,401);
    await adminLogin(f);
  });
  await t.test('administrator cookies and public cookies cannot cross roles',async()=>{
    const publicWithAdmin=f.newClient();publicWithAdmin.jar=new Map([['poc_public_session',f.admin.jar.get('poc_admin_session')]]);
    assert.equal((await publicWithAdmin.call('/api/saves/test-puzzle')).status,401);
    const adminWithPublic=new Client(f.admin.base,ADMIN_ORIGIN);adminWithPublic.jar=new Map([['poc_admin_session',f.client.jar.get('poc_public_session')]]);
    assert.equal((await adminWithPublic.call('/api/admin/metrics')).status,401);
    assert.equal((await f.admin.call('/api/admin/metrics',{origin:USER_ORIGIN})).status,403);
    assert.equal((await f.admin.call('/api/admin/games/test-puzzle',{method:'PATCH',body:{enabled:false},csrf:false,headers:{'X-CSRF-Token':f.client.csrf}})).status,403);
  });
  await t.test('live metrics match events and demo does not modify live',async()=>{
    const before=(await f.admin.call('/api/admin/metrics?dataset=live')).data;
    assert.equal(before.summary.impressions,1);assert.equal(before.summary.clicks,1);assert.equal(before.summary.ctr,1);
    assert.equal(before.summary.active10sSessions,1);assert.equal(before.summary.active60sSessions,1);assert.equal(before.summary.roundsCompleted,1);
    const demo=(await f.admin.call('/api/admin/metrics?dataset=demo')).data;
    assert.equal(demo.retention.platform.d1.retained,74);assert.equal(demo.retention.platform.d1.cohortSize,240);
    assert.equal(demo.retention.platform.d7.rate,30/180);assert.equal(demo.retention.platform.d30.rate,9/100);
    const after=(await f.admin.call('/api/admin/metrics?dataset=live')).data;assert.deepEqual(after.summary,before.summary);
    assert.equal((await f.admin.call('/api/admin/errors')).data.errors[0].code,'TEST_ERROR');
  });
  await t.test('game disable affects list and new play but preserves saved data',async()=>{
    const r=await f.admin.call('/api/admin/games/test-puzzle',{method:'PATCH',body:{enabled:false}});assert.equal(r.data.game.enabled,false);
    assert.deepEqual((await f.client.call('/api/games')).data.games.map(game=>game.id),['other-puzzle']);
    assert.equal((await f.client.call('/api/games/test-puzzle')).status,404);
    assert.equal((await f.client.call('/api/play-sessions',{method:'POST',body:{gameId:'test-puzzle'}})).status,404);
    assert.equal((await f.client.call('/api/saves/test-puzzle')).data.payload.level,4);
    assert.ok((await f.admin.call('/api/admin/audit')).data.audit.some(a=>a.action==='game_enabled'));
  });
  await t.test('database survives app restart and logout revokes access',async()=>{
    await f.app.close();const replacement=createApp(f.config,f.deps);f.app=replacement;
    const addresses=await replacement.listen();f.client.base=`http://127.0.0.1:${addresses.public.port}`;
    assert.equal((await f.client.call('/api/saves/test-puzzle')).data.payload.level,4);
    const logout=await f.client.call('/api/auth/logout',{method:'POST',body:{}});
    assert.equal(logout.status,200);assert.match(logout.headers.get('set-cookie'),/Path=\/api;.*Max-Age=0/);
    assert.equal((await f.client.call('/api/saves/test-puzzle')).status,401);
    f.admin.base=`http://127.0.0.1:${addresses.admin.port}`;
    const adminLogout=await f.admin.call('/api/admin/logout',{method:'POST',body:{}});
    assert.equal(adminLogout.status,200);assert.match(adminLogout.headers.get('set-cookie'),/Path=\/api;.*Max-Age=0/);
    assert.equal((await f.admin.call('/api/admin/metrics')).status,401);
  });
});

test('real RSA OIDC validation, PKCE, state replay and explicit conflict-preserving merge',async t=>{
  const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const jwk={...publicKey.export({format:'jwk'}),kid:'test-key',alg:'RS256',use:'sig'};
  const codes=new Map();let currentNow;
  const fakeFetch=async(url,init={})=>{
    if(url==='https://www.googleapis.com/oauth2/v3/certs')return Response.json({keys:[jwk]});
    assert.equal(url,'https://oauth2.googleapis.com/token');
    const params=init.body, record=codes.get(params.get('code'));
    if(!record)return Response.json({error:'invalid_grant'},{status:400});
    assert.equal(createHash('sha256').update(params.get('code_verifier')).digest('base64url'),record.challenge);
    assert.equal(params.get('client_secret'),'test-client-secret');
    const sec=Math.floor(currentNow()/1000), header=Buffer.from(JSON.stringify({alg:'RS256',kid:'test-key'})).toString('base64url');
    const claims={iss:'https://accounts.google.com',aud:'test-client-id',sub:record.sub||'google-user-1',name:'테스트 계정',iat:sec,exp:sec+3600,nonce:record.nonce,...record.claims};
    const payload=Buffer.from(JSON.stringify(claims)).toString('base64url'),signed=`${header}.${payload}`;
    const signature=sign('RSA-SHA256',Buffer.from(signed),privateKey).toString('base64url');
    return Response.json({id_token:`${signed}.${record.badSignature?'AAAA':signature}`});
  };
  const f=await fixture({google:{clientId:'test-client-id',clientSecret:'test-client-secret',redirectUri:'http://127.0.0.1:8090/api/auth/google/callback'},fetch:fakeFetch});currentNow=f.now;t.after(()=>f.close());
  async function login(client,overrides={}) {
    await client.call('/api/session');const start=await client.call(`/api/auth/google/start?returnTo=${encodeURIComponent(USER_ORIGIN+'/')}`);
    assert.equal(start.status,302,JSON.stringify(start.data));
    const target=new URL(start.headers.get('location'));assert.equal(target.searchParams.get('code_challenge_method'),'S256');
    const code=randomUUID(),state=target.searchParams.get('state');codes.set(code,{nonce:target.searchParams.get('nonce'),challenge:target.searchParams.get('code_challenge'),...overrides});
    const callback=`/api/auth/google/callback?state=${encodeURIComponent(state)}&code=${code}`;
    return {callback,result:await client.call(callback)};
  }
  await t.test('invalid state and return origin fail without token exchange',async()=>{
    await f.client.call('/api/session');
    assert.equal((await f.client.call('/api/auth/google/callback?state=wrong&code=wrong')).status,400);
    assert.equal((await f.client.call('/api/auth/google/start?returnTo=https://evil.invalid/')).status,400);
  });
  await t.test('nonce, audience and signature are verified',async()=>{
    for(const overrides of [{claims:{nonce:'wrong'}},{claims:{aud:'wrong'}},{claims:{exp:1}},{badSignature:true}]) {
      const r=await login(f.newClient(),overrides);assert.equal(r.result.status,401);assert.equal(r.result.data.error.code,'GOOGLE_TOKEN_INVALID');
    }
  });
  await t.test('Google cancellation keeps original guest and its saved progress',async()=>{
    const visitor=f.newClient();await ready(visitor);
    await visitor.call('/api/saves/test-puzzle',{method:'PUT',body:{payload:{level:7}},headers:{'If-None-Match':'*'}});
    const oldCookie=visitor.jar.get('poc_public_session');
    const start=await visitor.call(`/api/auth/google/start?returnTo=${encodeURIComponent(USER_ORIGIN+'/')}`);
    const state=new URL(start.headers.get('location')).searchParams.get('state');
    const cancelled=await visitor.call(`/api/auth/google/callback?state=${state}&error=access_denied`);
    assert.equal(cancelled.status,302);assert.match(cancelled.headers.get('location'),/authError=GOOGLE_CANCELLED/);
    assert.equal(visitor.jar.get('poc_public_session'),oldCookie);
    assert.equal((await visitor.call('/api/session')).data.kind,'guest');
    assert.equal((await visitor.call('/api/saves/test-puzzle')).data.payload.level,7);
  });
  const registered=f.newClient();
  await t.test('valid code creates registered account and replay is rejected',async()=>{
    const logged=await login(registered);assert.equal(logged.result.status,302);assert.ok(logged.result.headers.get('location').startsWith(USER_ORIGIN));
    assert.match(logged.result.headers.get('set-cookie'),/Max-Age=2592000(?:;|$)/);
    const sessionHash=createHash('sha256').update(registered.jar.get('poc_public_session')).digest('hex');
    const original=f.app.db.prepare('SELECT created_at,expires_at FROM sessions WHERE id_hash=?').get(sessionHash);assert.equal(original.expires_at-original.created_at,30*86400000);
    f.advance(1000);
    const profile=await registered.call('/api/session');assert.equal(profile.data.kind,'registered');assert.equal(profile.data.displayName,'테스트 계정');
    assert.equal(profile.headers.get('set-cookie'),null);assert.equal(f.app.db.prepare('SELECT expires_at FROM sessions WHERE id_hash=?').get(sessionHash).expires_at,original.expires_at);
    assert.equal((await registered.call(logged.callback)).status,400);
    await ready(registered);
    assert.equal((await registered.call('/api/saves/test-puzzle',{method:'PUT',body:{payload:{level:20}},headers:{'If-None-Match':'*'}})).status,201);
  });
  const guest=f.newClient();await ready(guest);
  await guest.call('/api/saves/test-puzzle',{method:'PUT',body:{payload:{level:3}},headers:{'If-None-Match':'*'}});
  await t.test('guest login preserves conflict until explicit merge and revokes old guest session',async()=>{
    const oldCookie=new Map(guest.jar),oldCsrf=guest.csrf;
    assert.equal((await login(guest)).result.status,302);
    const profile=(await guest.call('/api/session')).data;assert.equal(profile.pendingMerge.conflicts.length,1);
    const old=f.newClient();old.jar=oldCookie;old.csrf=oldCsrf;
    assert.equal((await old.call('/api/saves/test-puzzle')).status,401);
    assert.equal((await guest.call('/api/saves/test-puzzle')).data.payload.level,20);
    const denied=await guest.call('/api/auth/merge',{method:'POST',body:{mergeId:profile.pendingMerge.id,consent:true,choices:[]}});assert.equal(denied.status,409);
    const merged=await guest.call('/api/auth/merge',{method:'POST',body:{mergeId:profile.pendingMerge.id,consent:true,linkAnalyticsHistory:true,choices:[{gameId:'test-puzzle',slot:'main',action:'keep_guest',expectedTargetRevision:1}]}});assert.equal(merged.status,200);
    assert.equal((await guest.call('/api/saves/test-puzzle')).data.payload.level,3);
    assert.equal(f.app.db.prepare('SELECT count(*) n FROM save_backups').get().n,2);
    assert.equal(f.app.db.prepare('SELECT count(*) n FROM analytics_links').get().n,1);
    assert.equal((await guest.call('/api/auth/merge',{method:'POST',body:{mergeId:profile.pendingMerge.id,consent:true}})).status,200);
  });
  await t.test('completed explicit merge grants recovery access to both preserved originals',async()=>{
    const listed=(await guest.call('/api/saves/test-puzzle/slots')).data;
    assert.equal(listed.backups.length,2);assert.deepEqual(new Set(listed.backups.map(row=>row.source)),new Set(['account','guest']));
    const account=listed.backups.find(row=>row.source==='account'),source=listed.backups.find(row=>row.source==='guest');
    const first=await guest.call('/api/saves/test-puzzle/restore',{method:'POST',body:{backupId:account.id,expectedMainRevision:listed.mainRevision},headers:{'Idempotency-Key':randomUUID()}});
    assert.equal(first.status,200);assert.equal(first.data.payload.level,20);
    const second=await guest.call('/api/saves/test-puzzle/restore',{method:'POST',body:{backupId:source.id,expectedMainRevision:first.data.revision},headers:{'Idempotency-Key':randomUUID()}});
    assert.equal(second.status,200);assert.equal(second.data.payload.level,3);
    const stranger=f.newClient();await ready(stranger);assert.deepEqual((await stranger.call('/api/saves/test-puzzle/slots')).data.backups,[]);
  });
  await t.test('guest merge cannot exceed the account save-slot quota and rolls back atomically',async()=>{
    for(let i=0;i<9;i++)assert.equal((await guest.call('/api/saves/test-puzzle?slot=occupied-'+i,{method:'PUT',body:{payload:{level:i}},headers:{'If-None-Match':'*'}})).status,201);
    const incoming=f.newClient();await ready(incoming);await incoming.call('/api/saves/test-puzzle?slot=incoming-only',{method:'PUT',body:{payload:{level:99}},headers:{'If-None-Match':'*'}});
    assert.equal((await login(incoming)).result.status,302);const pending=(await incoming.call('/api/session')).data.pendingMerge;
    const before=(await incoming.call('/api/saves/test-puzzle/slots')).data;
    const result=await incoming.call('/api/auth/merge',{method:'POST',body:{mergeId:pending.id,consent:true}});assert.equal(result.status,409);assert.equal(result.data.error.code,'SAVE_SLOT_LIMIT');
    const after=(await incoming.call('/api/saves/test-puzzle/slots')).data;assert.deepEqual(after,before);assert.equal((await incoming.call('/api/session')).data.pendingMerge.id,pending.id);
  });
});

test('retention exact-date, KST maturity, distinct and scope semantics',()=>{
  const rows=[{subject:'a',gameId:'one',date:'2026-11-01'},{subject:'a',gameId:'two',date:'2026-11-02'},{subject:'a',gameId:'two',date:'2026-11-02'},{subject:'b',gameId:'one',date:'2026-11-01'},{subject:'b',gameId:'one',date:'2026-11-08'}];
  const before=retentionFromActivity(rows,Date.parse('2026-11-09T14:59:59Z'));
  assert.equal(before.platform.d7.rate,null);
  const at=retentionFromActivity(rows,Date.parse('2026-11-09T15:00:00Z'));
  assert.equal(at.platform.d1.rate,.5);assert.equal(at.platform.d7.rate,.5);
  assert.equal(at.games.find(g=>g.gameId==='one').d1.rate,0);
  assert.equal(at.platform.d30.rate,null);
});

test('same frame resumed after KST midnight needs exactly 10 seconds on the return day',async t=>{
  const f=await fixture({startAt:Date.parse('2026-11-01T14:59:30Z')});t.after(()=>f.close());
  const play=await ready(f.client);
  const send=async(name,properties={})=>{
    const response=await f.client.call('/api/events',{method:'POST',body:{events:[{event_id:randomUUID(),event_name:name,play_session_id:play.id,properties}]}});
    assert.equal(response.data.accepted.length,1,JSON.stringify(response.data));
  };
  const heartbeat=(sequence,active_delta_ms)=>send('play_heartbeat',{sequence,active_delta_ms,document_visible:true,paused:false,game_updating:true});
  f.advance(10000);await heartbeat(0,10000);await send('game_pause');
  f.advance(20000);await send('game_resume');
  f.advance(9999);await heartbeat(1,9999);
  const matureAt=Date.parse('2026-11-04T00:00:00+09:00');
  let retention=liveMetrics(f.app.db,[],matureAt).retention;
  assert.equal(retention.platform.d1.cohortSize,1);assert.equal(retention.platform.d1.retained,0);
  f.advance(1);await heartbeat(2,1);
  assert.equal(f.app.db.prepare("SELECT count(*) n FROM events WHERE name='active_play_10s'").get().n,1);
  f.advance(matureAt-f.now());await adminLogin(f);
  retention=(await f.admin.call('/api/admin/metrics?dataset=live')).data.retention;
  assert.equal(retention.platform.d1.retained,1);assert.equal(retention.platform.d1.rate,1);
  assert.equal(retention.games.find(g=>g.gameId==='test-puzzle').d1.retained,1);
});

test('KST midnight splits verified intervals and overlapping tabs cannot double daily play time',async t=>{
  const f=await fixture({startAt:Date.parse('2026-11-01T14:59:35Z')});t.after(()=>f.close());
  const first=await ready(f.client),second=await ready(f.client);
  const heartbeat=async(play,sequence,active_delta_ms)=>{
    const response=await f.client.call('/api/events',{method:'POST',body:{events:[{
      event_id:randomUUID(),event_name:'play_heartbeat',play_session_id:play.id,
      occurred_at:'2026-11-01T14:59:35Z',
      properties:{sequence,active_delta_ms,document_visible:true,paused:false,game_updating:true,
        accepted_active_ms:60000,active_interval_start_at:0,active_interval_end_at:1}
    }]}});
    assert.equal(response.data.accepted.length,1,JSON.stringify(response.data));
  };
  f.advance(10000);await heartbeat(first,0,10000);await heartbeat(second,0,10000);
  f.advance(20000);await heartbeat(first,1,20000);await heartbeat(second,1,20000);
  const matureAt=Date.parse('2026-11-04T00:00:00+09:00');
  let metrics=liveMetrics(f.app.db,[],matureAt);
  assert.equal(metrics.summary.totalActiveSeconds,30);
  assert.equal(metrics.retention.platform.d1.retained,0,'two overlapping five-second return spans are five seconds');
  f.advance(5000);await heartbeat(first,2,5000);
  metrics=liveMetrics(f.app.db,[],matureAt);
  assert.equal(metrics.summary.totalActiveSeconds,35);
  assert.equal(metrics.retention.platform.d1.retained,1);
  const stored=JSON.parse(f.app.db.prepare("SELECT properties FROM events WHERE name='play_heartbeat' ORDER BY received_at DESC LIMIT 1").get().properties);
  assert.equal(stored.accepted_active_ms,5000);assert.equal(stored.active_interval_end_at,f.now());
  assert.equal(stored.active_interval_start_at,f.now()-5000);
});

test('QA sessions isolate events, play, saves and errors from live aggregates without privilege bypass',async t=>{
  const f=await fixture();t.after(()=>f.close());let qaId,qaPlay,livePlay;
  await t.test('QA requires CSRF, rotates fresh anonymous identity and is idempotent before play',async()=>{
    const first=await f.client.call('/api/session');assert.equal(first.data.trafficType,'live');assert.equal(first.data.qaRunId,null);
    const original=f.client.jar.get('poc_public_session');
    assert.equal((await f.client.call('/api/qa/session',{method:'POST',body:{},csrf:false})).status,403);
    assert.equal((await f.client.call('/api/qa/session',{method:'POST',body:{},origin:'https://bad.invalid'})).status,403);
    assert.equal((await f.client.call('/api/qa/session',{method:'POST',body:{qaRunId:'client-chosen'}})).status,422);
    const created=await f.client.call('/api/qa/session',{method:'POST',body:{}});assert.equal(created.status,201);assert.equal(created.data.kind,'anonymous');assert.equal(created.data.trafficType,'qa');qaId=created.data.qaRunId;assert.match(qaId,/^[a-f0-9-]{36}$/);assert.notEqual(f.client.jar.get('poc_public_session'),original);
    const again=await f.client.call('/api/qa/session',{method:'POST',body:{}});assert.equal(again.status,200);assert.equal(again.data.qaRunId,qaId);assert.equal(f.app.db.prepare('SELECT count(*) n FROM users').get().n,0);
    const stale=f.newClient();stale.jar.set('poc_public_session',original);stale.csrf=first.data.csrfToken;
    assert.equal((await stale.call('/api/play-sessions',{method:'POST',body:{gameId:'test-puzzle'}})).status,401);
    assert.equal((await f.client.call('/api/auth/google/start')).data.error.code,'QA_GOOGLE_DISABLED');
    assert.equal((await f.client.call('/api/admin/metrics')).status,404);
  });
  const live=f.newClient(),otherQa=f.newClient();
  await t.test('QA guest uses normal save scope and cannot reclassify an existing guest',async()=>{
    qaPlay=await ready(f.client);livePlay=await ready(live);
    assert.equal((await f.client.call('/api/session')).data.trafficType,'qa');
    assert.equal((await f.client.call('/api/qa/session',{method:'POST',body:{}})).status,409);
    assert.equal((await live.call('/api/qa/session',{method:'POST',body:{}})).data.error.code,'QA_REQUIRES_FRESH_SESSION');
    await f.client.call('/api/saves/test-puzzle',{method:'PUT',body:{payload:{level:9}},headers:{'If-None-Match':'*'}});
    assert.equal((await live.call('/api/saves/test-puzzle')).status,404);
    await live.call('/api/saves/test-puzzle',{method:'PUT',body:{payload:{level:1}},headers:{'If-None-Match':'*'}});
    await otherQa.call('/api/session');await otherQa.call('/api/qa/session',{method:'POST',body:{}});await ready(otherQa);
  });
  await t.test('server classifications survive forged event properties and separate exact QA run metrics',async()=>{
    f.advance(10000);
    for(const [client,play,code] of [[f.client,qaPlay,'QA_ONLY'],[live,livePlay,'LIVE_ONLY']]){
      const result=await client.call('/api/events',{method:'POST',body:{events:[
        {event_id:randomUUID(),event_name:'play_heartbeat',play_session_id:play.id,properties:{sequence:0,active_delta_ms:10000,document_visible:true,paused:false,game_updating:true,traffic_type:'live',qa_run_id:'forged'}},
        {event_id:randomUUID(),event_name:'runtime_error',play_session_id:play.id,properties:{code}},
        {event_id:randomUUID(),event_name:'game_impression',game_id:'test-puzzle',impression_id:randomUUID(),properties:{visible_fraction:1,visible_duration_ms:1000,document_visible:true,qa_run:'fake'}},
        {event_id:randomUUID(),event_name:'game_ready',play_session_id:play.id,traffic_type:'qa'}
      ]}});assert.equal(result.data.accepted.length,3);assert.equal(result.data.rejected[0].code,'EVENT_FIELDS_INVALID');
    }
    await adminLogin(f);
    const real=(await f.admin.call('/api/admin/metrics')).data,qa=(await f.admin.call('/api/admin/metrics?dataset=qa')).data,run=(await f.admin.call('/api/admin/metrics?dataset=qa&qaRunId='+qaId)).data;
    assert.equal(real.dataset,'live');assert.equal(real.summary.playSessions,1);assert.equal(real.summary.active10sSessions,1);assert.equal(real.summary.saveWrites,1);assert.equal(real.summary.impressions,1);
    assert.equal(qa.summary.playSessions,2);assert.equal(run.summary.playSessions,1);assert.equal(run.summary.active10sSessions,1);assert.equal(run.summary.saveWrites,1);assert.equal(run.filters.qaRunId,qaId);
    assert.equal((await f.admin.call('/api/admin/metrics?dataset=live&qaRunId='+qaId)).status,400);
    assert.equal(f.app.db.prepare('SELECT traffic_type,qa_run_id FROM play_sessions WHERE id=?').get(qaPlay.id).qa_run_id,qaId);
    assert.equal(f.app.db.prepare('SELECT count(*) n FROM events WHERE play_session_id=? AND (traffic_type<>? OR qa_run_id<>?)').get(qaPlay.id,'qa',qaId).n,0);
    assert.equal((await f.admin.call('/api/admin/errors')).data.errors[0].code,'LIVE_ONLY');
    const errors=(await f.admin.call('/api/admin/errors?dataset=qa&qaRunId='+qaId)).data.errors;assert.equal(errors.length,1);assert.equal(errors[0].code,'QA_ONLY');
  });
  await t.test('logout does not erase classification of prior QA traffic',async()=>{
    await f.client.call('/api/auth/logout',{method:'POST',body:{}});const fresh=await f.client.call('/api/session');assert.equal(fresh.data.trafficType,'live');assert.equal(fresh.data.qaRunId,null);
    assert.equal((await f.admin.call('/api/admin/metrics?dataset=qa&qaRunId='+qaId)).data.summary.playSessions,1);
    assert.equal((await f.admin.call('/api/admin/metrics?dataset=live')).data.summary.playSessions,1);
  });
});

test('save slot listing and conditional restore preserve ownership, history and retry behavior',async t=>{
  const f=await fixture();t.after(()=>f.close());await ready(f.client);
  const save=(slot,payload,headers)=>f.client.call('/api/saves/test-puzzle?slot='+slot,{method:'PUT',body:{payload},headers});
  await save('main',{level:2},{'If-None-Match':'*'});await save('recovery-tab',{level:9},{'If-None-Match':'*'});
  const restore=(body,key=randomUUID(),headers={})=>f.client.call('/api/saves/test-puzzle/restore',{method:'POST',body,headers:{'Idempotency-Key':key,...headers}});
  let backupId;
  await t.test('lists only own metadata and optional GET CSRF detects another-tab identity changes',async()=>{
    const response=await f.client.call('/api/saves/test-puzzle/slots');assert.equal(response.status,200);assert.equal(response.data.mainRevision,1);assert.equal(response.data.slotLimit,10);assert.equal(response.data.slots.length,2);assert.deepEqual(response.data.backups,[]);assert.ok(response.data.slots.every(row=>!('payload'in row)));
    for(const url of ['/api/saves/test-puzzle','/api/saves/test-puzzle/slots'])assert.equal((await f.client.call(url,{headers:{'X-CSRF-Token':'stale-tab'}})).data.error.code,'CSRF_INVALID');
    assert.equal((await f.client.call('/api/saves/test-puzzle',{headers:{'X-CSRF-Token':f.client.csrf}})).status,200);
    const other=f.newClient();await ready(other);assert.equal((await other.call('/api/saves/test-puzzle/slots')).data.slots.length,0);
    assert.equal((await other.call('/api/saves/test-puzzle',{headers:{'X-CSRF-Token':f.client.csrf}})).status,403);
  });
  await t.test('missing key, stale target and stale source do not write or create backups',async()=>{
    const body={sourceSlot:'recovery-tab',expectedSourceRevision:1,expectedMainRevision:1};
    assert.equal((await f.client.call('/api/saves/test-puzzle/restore',{method:'POST',body})).data.error.code,'IDEMPOTENCY_KEY_REQUIRED');
    assert.equal((await restore({...body,expectedMainRevision:0})).status,412);
    assert.equal((await restore({...body,expectedSourceRevision:2})).data.error.code,'SOURCE_REVISION_CONFLICT');
    assert.equal((await restore({...body,sourceSlot:'main'})).status,422);
    assert.equal((await f.client.call('/api/saves/test-puzzle')).data.payload.level,2);assert.equal(f.app.db.prepare('SELECT count(*) n FROM save_backups').get().n,0);
  });
  await t.test('restore archives previous main, advances revision and retries exactly once',async()=>{
    const body={sourceSlot:'recovery-tab',expectedSourceRevision:1,expectedMainRevision:1},key=randomUUID();
    const result=await restore(body,key);assert.equal(result.status,200);assert.equal(result.data.payload.level,9);assert.equal(result.data.revision,2);assert.equal(result.headers.get('etag'),'"r2"');backupId=result.data.previousBackupId;
    const retry=await restore(body,key);assert.deepEqual(retry.data,result.data);assert.equal(f.app.db.prepare('SELECT count(*) n FROM save_backups').get().n,1);
    assert.equal((await restore({...body,expectedMainRevision:2},key)).status,409);
    const list=(await f.client.call('/api/saves/test-puzzle/slots')).data;assert.equal(list.backups[0].id,backupId);assert.equal(list.backups[0].reason,'restore_previous');assert.equal(list.backups[0].source,'account');assert.ok(!('payload'in list.backups[0]));
    assert.equal((await f.client.call('/api/saves/test-puzzle?slot=recovery-tab')).data.revision,1);
  });
  await t.test('restores an owned backup while another principal cannot access it',async()=>{
    const other=f.newClient();await ready(other);await other.call('/api/saves/test-puzzle',{method:'PUT',body:{payload:{level:50}},headers:{'If-None-Match':'*'}});
    const denied=await other.call('/api/saves/test-puzzle/restore',{method:'POST',body:{backupId,expectedMainRevision:1},headers:{'Idempotency-Key':randomUUID()}});assert.equal(denied.status,404);assert.equal((await other.call('/api/saves/test-puzzle')).data.payload.level,50);
    const result=await restore({backupId,expectedMainRevision:2});assert.equal(result.data.payload.level,2);assert.equal(result.data.revision,3);
    assert.equal((await save('main',{level:0},{'If-Match':'"r1"'})).status,412);
  });
  await t.test('restore works within slot quota but mismatched schemas fail without overwriting',async()=>{
    for(let i=0;i<8;i++)assert.equal((await save('archive-'+i,{level:i},{'If-None-Match':'*'})).status,201);
    assert.equal((await save('too-many',{level:0},{'If-None-Match':'*'})).data.error.code,'SAVE_SLOT_LIMIT');
    assert.equal((await restore({sourceSlot:'recovery-tab',expectedSourceRevision:1,expectedMainRevision:3})).data.revision,4);
    f.app.db.prepare('UPDATE save_slots SET schema_version=2 WHERE slot=?').run('recovery-tab');
    assert.equal((await restore({sourceSlot:'recovery-tab',expectedSourceRevision:1,expectedMainRevision:4})).data.error.code,'SAVE_SCHEMA_MISMATCH');
    assert.equal((await f.client.call('/api/saves/test-puzzle')).data.revision,4);
    f.app.db.prepare('UPDATE save_slots SET schema_version=1 WHERE slot=?').run('recovery-tab');
  });
  await t.test('explicit restore history retains at most twenty recent recovery versions',async()=>{
    f.advance(60001);let revision=4;
    for(let i=0;i<22;i++){
      f.advance(3100);const result=await restore({sourceSlot:'recovery-tab',expectedSourceRevision:1,expectedMainRevision:revision});assert.equal(result.status,200);revision=result.data.revision;
    }
    const list=(await f.client.call('/api/saves/test-puzzle/slots')).data;
    assert.equal(list.backups.filter(row=>row.reason==='restore_previous').length,20);assert.equal(list.mainRevision,revision);
  });
});

test('metrics date and game filters preserve full-history cohorts and returns outside the display period',async t=>{
  const f=await fixture({startAt:Date.parse('2026-11-01T03:00:00Z')});t.after(()=>f.close());const second=f.newClient();
  const active=async(client,gameId)=>{const play=await ready(client,gameId);f.advance(10000);const result=await client.call('/api/events',{method:'POST',body:{events:[{event_id:randomUUID(),event_name:'play_heartbeat',play_session_id:play.id,properties:{sequence:0,active_delta_ms:10000,document_visible:true,paused:false,game_updating:true}}]}});assert.equal(result.data.accepted.length,1);};
  await active(f.client,'test-puzzle');f.advance(Date.parse('2026-11-02T03:00:00Z')-f.now());await active(f.client,'other-puzzle');await active(second,'test-puzzle');f.advance(Date.parse('2026-11-03T03:00:00Z')-f.now());await active(second,'test-puzzle');f.advance(Date.parse('2026-11-05T03:00:00Z')-f.now());await adminLogin(f);
  await t.test('cohort filter does not reclassify a returning user as newly acquired',async()=>{
    const data=(await f.admin.call('/api/admin/metrics?from=2026-11-02&to=2026-11-02')).data;
    assert.equal(data.summary.playSessions,2);assert.equal(data.summary.activePlayers,2);assert.equal(data.retention.platform.d1.cohortSize,1);assert.equal(data.retention.platform.d1.retained,1);
    assert.ok(data.retention.platform.cohorts.every(row=>row.cohortDate==='2026-11-02'));assert.equal(data.retentionScope,'platform');assert.deepEqual(data.retention.selected,data.retention.platform);
  });
  await t.test('game filter has explicit selected retention and does not alter platform first dates',async()=>{
    const data=(await f.admin.call('/api/admin/metrics?from=2026-11-02&to=2026-11-02&gameId=other-puzzle')).data;
    assert.equal(data.games.length,1);assert.equal(data.games[0].id,'other-puzzle');assert.equal(data.summary.playSessions,1);assert.equal(data.filters.gameId,'other-puzzle');assert.equal(data.retentionScope,'game');assert.equal(data.retention.selected.d1.cohortSize,1);assert.equal(data.retention.selected.d1.retained,0);assert.equal(data.retention.platform.d1.retained,1);
  });
  await t.test('invalid calendar, reversed range and filtered fixed demo return explicit errors',async()=>{
    for(const query of ['from=2026-02-30','from=2026-11-03&to=2026-11-02','dataset=demo&from=2026-11-01','dataset=live&qaRunId='+randomUUID()])assert.equal((await f.admin.call('/api/admin/metrics?'+query)).status,400);
    assert.equal((await f.admin.call('/api/admin/metrics?gameId=missing-game')).status,404);
  });
});

test('conditional archive-slot deletion frees quota, preserves recovery and prevents stale revision reuse',async t=>{
  const f=await fixture();t.after(()=>f.close());await ready(f.client);
  const put=(slot,level,key)=>f.client.call('/api/saves/test-puzzle?slot='+slot,{method:'PUT',body:{payload:{level}},headers:{'If-None-Match':'*',...(key?{'Idempotency-Key':key}:{})}});
  const remove=(slot,revision,options={})=>f.client.call('/api/saves/test-puzzle?slot='+slot,{method:'DELETE',headers:revision===null?{}:{'If-Match':`"r${revision}"`},...options});
  const key=randomUUID();await put('main',1);await put('recovery-one',2,key);for(let i=0;i<8;i++)await put('archive-'+i,i);
  let deletedBackup;
  await t.test('main is protected and delete requires current session, CSRF and revision',async()=>{
    assert.equal((await remove('main',1)).data.error.code,'MAIN_SLOT_DELETE_FORBIDDEN');
    assert.equal((await remove('recovery-one',1,{csrf:false})).status,403);
    assert.equal((await remove('recovery-one',null)).status,428);assert.equal((await remove('recovery-one',0)).status,412);
    const other=f.newClient();await ready(other);assert.equal((await other.call('/api/saves/test-puzzle?slot=recovery-one',{method:'DELETE',headers:{'If-Match':'"r1"'}})).status,412);
    assert.equal((await f.client.call('/api/saves/test-puzzle/slots')).data.slots.length,10);
    const preflight=await f.client.call('/api/saves/test-puzzle?slot=recovery-one',{method:'OPTIONS',headers:{'Access-Control-Request-Method':'DELETE','Access-Control-Request-Headers':'x-csrf-token,if-match'}});assert.equal(preflight.status,204);assert.match(preflight.headers.get('access-control-allow-methods'),/DELETE/);
  });
  await t.test('successful deletion preserves the archived payload as a recoverable backup',async()=>{
    const response=await remove('recovery-one',1);assert.equal(response.status,200);assert.equal(response.data.deletedSlot,'recovery-one');deletedBackup=response.data.previousBackupId;
    const list=(await f.client.call('/api/saves/test-puzzle/slots')).data;assert.equal(list.slots.length,9);assert.equal(list.backups.find(row=>row.id===deletedBackup).reason,'slot_deleted');assert.equal((await f.client.call('/api/saves/test-puzzle')).data.payload.level,1);
    const restored=await f.client.call('/api/saves/test-puzzle/restore',{method:'POST',body:{backupId:deletedBackup,expectedMainRevision:1},headers:{'Idempotency-Key':randomUUID()}});assert.equal(restored.status,200);assert.equal(restored.data.payload.level,2);
  });
  await t.test('recreated slot advances revision and an old delete cannot remove the new save',async()=>{
    const response=await put('recovery-one',30,key);assert.equal(response.status,201);assert.equal(response.data.revision,2);assert.equal(response.data.payload.level,30);
    assert.equal((await remove('recovery-one',1)).status,412);assert.equal((await f.client.call('/api/saves/test-puzzle?slot=recovery-one')).data.payload.level,30);
    assert.equal((await put('eleventh',1)).data.error.code,'SAVE_SLOT_LIMIT');assert.equal((await remove('recovery-one',2)).status,200);assert.equal((await put('eleventh',1)).status,201);
  });
});

test('metrics clips verified active intervals at KST date boundaries instead of dropping crossing heartbeats',async t=>{
  const f=await fixture({startAt:Date.parse('2026-11-01T14:59:55Z')});t.after(()=>f.close());const play=await ready(f.client);f.advance(10000);
  await f.client.call('/api/events',{method:'POST',body:{events:[{event_id:randomUUID(),event_name:'play_heartbeat',play_session_id:play.id,properties:{sequence:0,active_delta_ms:10000,document_visible:true,paused:false,game_updating:true}}]}});await adminLogin(f);
  const before=(await f.admin.call('/api/admin/metrics?from=2026-11-01&to=2026-11-01')).data,after=(await f.admin.call('/api/admin/metrics?from=2026-11-02&to=2026-11-02')).data;
  assert.equal(before.summary.totalActiveSeconds,5);assert.equal(after.summary.totalActiveSeconds,5);assert.equal(before.summary.active10sSessions,0);assert.equal(after.summary.active10sSessions,1);
});

test('legacy SQLite migration preserves rows, rejects future versions and maintenance blocks opening before creation',async t=>{
  const root=mkdtempSync(join(tmpdir(),'platform-migration-'));t.after(()=>rmSync(root,{recursive:true,force:true}));const filename=join(root,'platform.sqlite');
  let legacy=new DatabaseSync(filename);
  legacy.exec(`CREATE TABLE sessions(id_hash TEXT PRIMARY KEY,kind TEXT NOT NULL,principal_id TEXT,analytics_subject TEXT NOT NULL,csrf TEXT NOT NULL,admin_authenticated INTEGER NOT NULL DEFAULT 0,admin_username TEXT,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL);
    CREATE TABLE events(id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,name TEXT NOT NULL,subject_id TEXT NOT NULL,visit_id TEXT NOT NULL,play_session_id TEXT,game_id TEXT,impression_id TEXT,occurred_at INTEGER NOT NULL,received_at INTEGER NOT NULL,properties TEXT NOT NULL,source TEXT NOT NULL);
    CREATE TABLE save_backups(id TEXT PRIMARY KEY,merge_id TEXT NOT NULL,principal_id TEXT NOT NULL,game_id TEXT NOT NULL,slot TEXT NOT NULL,schema_version INTEGER NOT NULL,revision INTEGER NOT NULL,payload TEXT NOT NULL,created_at INTEGER NOT NULL);`);
  legacy.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?,?,?,?)').run('legacy','public',null,'legacy-subject','legacy-csrf',0,null,1,2);
  legacy.prepare('INSERT INTO events VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run('old-event','fingerprint','game_impression','legacy-subject','legacy',null,'test-puzzle','old-impression',1,1,'{}','portal');
  legacy.prepare('INSERT INTO save_backups VALUES(?,?,?,?,?,?,?,?,?)').run('backup','merge','owner','test-puzzle','main',1,2,'{"level":4}',1);legacy.close();
  await t.test('version zero is upgraded idempotently with conservative live classification',()=>{
    for(let i=0;i<2;i++){const db=openDatabase(root);try{assert.equal(db.prepare('PRAGMA user_version').get().user_version,1);assert.equal(db.prepare('SELECT traffic_type FROM events').get().traffic_type,'live');assert.equal(db.prepare('SELECT qa_run_id FROM sessions').get().qa_run_id,null);assert.equal(db.prepare('SELECT payload,reason FROM save_backups').get().payload,'{"level":4}');assert.equal(db.prepare('SELECT reason FROM save_backups').get().reason,'merge_conflict');}finally{db.close();}}
  });
  await t.test('future schema and maintenance marker fail closed without reading lock contents',()=>{
    const db=new DatabaseSync(filename);db.exec('PRAGMA user_version=99');db.close();assert.throws(()=>openDatabase(root),/newer/);
    const paused=join(root,'paused');mkdirSync(paused);writeFileSync(join(paused,'maintenance.lock'),'sensitive-lock-content');assert.throws(()=>openDatabase(paused),error=>/maintenance/.test(error.message)&&!error.message.includes('sensitive-lock-content'));assert.equal(existsSync(join(paused,'platform.sqlite')),false);
  });
});

test('guest idle sessions preserve D30 identity and saves while expired or logged-out sessions never revive',async t=>{
  const day=86400000,firstPlayAt=Date.parse('2026-10-01T03:00:00Z');
  const f=await fixture({startAt:firstPlayAt-20*day});t.after(()=>f.close());
  const rowFor=client=>f.app.db.prepare('SELECT * FROM sessions WHERE id_hash=?').get(createHash('sha256').update(client.jar.get('poc_public_session')).digest('hex'));
  const heartbeat=async(client,play)=>{f.advance(10000);const result=await client.call('/api/events',{method:'POST',body:{events:[{event_id:randomUUID(),event_name:'play_heartbeat',play_session_id:play.id,properties:{sequence:0,active_delta_ms:10000,document_visible:true,paused:false,game_updating:true}}]}});assert.equal(result.data.accepted.length,1);};
  let originalIdentity,originalToken,originalCsrf;
  await t.test('anonymous creation and first promotion both issue matching 90-day cookie and server expiry',async()=>{
    const anonymous=await f.client.call('/api/session');assert.equal(anonymous.data.kind,'anonymous');assert.match(anonymous.headers.get('set-cookie'),/Max-Age=7776000(?:;|$)/);assert.equal(rowFor(f.client).expires_at,f.now()+90*day);
    f.advance(20*day);
    const launch=await f.client.call('/api/play-sessions',{method:'POST',body:{gameId:'test-puzzle'}});assert.equal(launch.status,201);assert.match(launch.headers.get('set-cookie'),/Max-Age=7776000(?:;|$)/);
    originalIdentity=rowFor(f.client);originalToken=f.client.jar.get('poc_public_session');originalCsrf=f.client.csrf;
    assert.equal(originalIdentity.expires_at,firstPlayAt+90*day);
    await f.client.call('/api/events',{method:'POST',body:{events:[{event_id:randomUUID(),event_name:'game_ready',play_session_id:launch.data.id}]}});await heartbeat(f.client,launch.data);
    assert.equal((await f.client.call('/api/saves/test-puzzle',{method:'PUT',body:{payload:{level:17}},headers:{'If-None-Match':'*'}})).status,201);
  });
  await t.test('return after the old 30-day expiry retains identity, renews idle TTL and produces matured D30 retention',async()=>{
    f.advance(30*day+1000);
    const revisited=await f.client.call('/api/session');assert.equal(revisited.data.kind,'guest');assert.equal(f.client.jar.get('poc_public_session'),originalToken);assert.equal(revisited.data.csrfToken,originalCsrf);assert.match(revisited.headers.get('set-cookie'),/Max-Age=7776000(?:;|$)/);
    const renewed=rowFor(f.client);assert.equal(renewed.principal_id,originalIdentity.principal_id);assert.equal(renewed.analytics_subject,originalIdentity.analytics_subject);assert.equal(renewed.expires_at,f.now()+90*day);
    assert.equal((await f.client.call('/api/saves/test-puzzle')).data.payload.level,17);
    const returningPlay=await ready(f.client);await heartbeat(f.client,returningPlay);
    await adminLogin(f);assert.equal((await f.admin.call('/api/admin/metrics')).data.retention.platform.d30.rate,null);
    f.advance(Date.parse('2026-11-02T00:00:00+09:00')-f.now());await adminLogin(f);
    const retention=(await f.admin.call('/api/admin/metrics')).data.retention;
    assert.equal(retention.platform.d30.cohortSize,1);assert.equal(retention.platform.d30.retained,1);assert.equal(retention.platform.d30.rate,1);assert.equal(retention.games.find(row=>row.gameId==='test-puzzle').d30.retained,1);
    assert.equal(f.app.db.prepare('SELECT count(*) n FROM users').get().n,1);
  });
  await t.test('an unexpired legacy guest with a shorter expiry renews without changing principal or CSRF',async()=>{
    const visitor=f.newClient();await ready(visitor);const prior=rowFor(visitor),token=visitor.jar.get('poc_public_session'),csrf=visitor.csrf;
    f.app.db.prepare('UPDATE sessions SET expires_at=? WHERE id_hash=?').run(f.now()+60000,prior.id_hash);
    f.advance(30000);const result=await visitor.call('/api/session');assert.equal(result.data.kind,'guest');assert.equal(visitor.jar.get('poc_public_session'),token);assert.equal(result.data.csrfToken,csrf);assert.equal(rowFor(visitor).principal_id,prior.principal_id);assert.equal(rowFor(visitor).expires_at,f.now()+90*day);assert.match(result.headers.get('set-cookie'),/Max-Age=7776000(?:;|$)/);
  });
  await t.test('expiry creates a fresh anonymous identity and cannot renew or authorize the old cookie',async()=>{
    const visitor=f.newClient();await ready(visitor);const old=rowFor(visitor),stale=f.newClient();stale.jar=new Map(visitor.jar);stale.csrf=visitor.csrf;
    f.advance(old.expires_at-f.now());assert.equal((await stale.call('/api/saves/test-puzzle')).status,401);assert.equal((await stale.call('/api/play-sessions',{method:'POST',body:{gameId:'test-puzzle'}})).status,401);
    const session=await visitor.call('/api/session');assert.equal(session.data.kind,'anonymous');assert.notEqual(rowFor(visitor).id_hash,old.id_hash);assert.notEqual(rowFor(visitor).analytics_subject,old.analytics_subject);assert.equal(f.app.db.prepare('SELECT expires_at FROM sessions WHERE id_hash=?').get(old.id_hash).expires_at,old.expires_at);
  });
  await t.test('logout deletes the session and subsequent visits cannot revive the old guest',async()=>{
    const visitor=f.newClient();await ready(visitor);const old=rowFor(visitor),stale=f.newClient();stale.jar=new Map(visitor.jar);stale.csrf=visitor.csrf;
    const logout=await visitor.call('/api/auth/logout',{method:'POST',body:{}});assert.equal(logout.status,200);assert.match(logout.headers.get('set-cookie'),/Max-Age=0(?:;|$)/);assert.equal(f.app.db.prepare('SELECT id_hash FROM sessions WHERE id_hash=?').get(old.id_hash),undefined);
    assert.equal((await stale.call('/api/play-sessions',{method:'POST',body:{gameId:'test-puzzle'}})).status,401);
    const session=await stale.call('/api/session');assert.equal(session.data.kind,'anonymous');assert.notEqual(rowFor(stale).analytics_subject,old.analytics_subject);assert.equal(f.app.db.prepare('SELECT id_hash FROM sessions WHERE id_hash=?').get(old.id_hash),undefined);
  });
});
