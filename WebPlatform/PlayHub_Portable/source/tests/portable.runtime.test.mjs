import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {scryptSync} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {prepareInstance,readInstanceConfig} from '../portable/prepare.mjs';
import {createAdminStaticServer} from '../portable/static-server.mjs';
import {runWorker} from '../portable/workers.mjs';

const appRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const workersUrl=pathToFileURL(path.join(appRoot,'portable/workers.mjs')).href;
const readJson=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const writeJson=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2));
async function fixture(t) {
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'playhub-portable-test-'));
  t.after(()=>fs.rmSync(temporary,{recursive:true,force:true}));
  const instanceRoot=path.join(temporary,'instance');
  const prepared=await prepareInstance({appRoot,instanceRoot});
  return {...prepared,temporary};
}
function rawRequest(port,pathname,extra={}) {
  return new Promise((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port,path:pathname,method:extra.method||'GET',headers:extra.headers||{}},res=>{let body='';res.setEncoding('utf8');res.on('data',part=>body+=part);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}));});req.on('error',reject);req.end();});
}
class Client {
  constructor(base,origin){this.base=base;this.origin=origin;this.cookies=new Map();this.csrf='';}
  async call(route,{method='GET',body,headers={}}={}){
    const response=await fetch(this.base+route,{method,headers:{Origin:this.origin,Connection:'close',...(body!==undefined?{'Content-Type':'application/json'}:{}),...(this.cookies.size?{Cookie:[...this.cookies].map(([k,v])=>`${k}=${v}`).join('; ')}:{}),...(this.csrf&&method!=='GET'?{'X-CSRF-Token':this.csrf}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
    for(const line of response.headers.getSetCookie()){const first=line.split(';')[0],at=first.indexOf('=');this.cookies.set(first.slice(0,at),first.slice(at+1));}
    const data=await response.json();if(data.csrfToken)this.csrf=data.csrfToken;return {status:response.status,data};
  }
}
function startChild(role,instanceRoot) {
  const code=`const {runWorker}=await import(${JSON.stringify(workersUrl)});await runWorker(${JSON.stringify({role,appRoot,instanceRoot})});`;
  const child=spawn(process.execPath,['--input-type=module','--eval',code],{cwd:os.tmpdir(),stdio:['ignore','ignore','pipe','ipc']});
  let stderr='';child.stderr.setEncoding('utf8');child.stderr.on('data',chunk=>{stderr+=chunk;});
  const exited=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));});
  const ready=new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill();reject(new Error('Worker did not become ready.'));},15000);child.on('message',message=>{if(message?.type==='ready'){clearTimeout(timer);resolve(message);}});child.once('exit',()=>{clearTimeout(timer);reject(new Error('Worker exited before readiness: '+stderr.slice(0,200)));});child.once('error',error=>{clearTimeout(timer);reject(error);});});
  return {child,ready,exited};
}
async function boundedExit(worker){let timer;try{return await Promise.race([worker.exited,new Promise((_,reject)=>{timer=setTimeout(()=>{worker.child.kill();reject(new Error('Worker did not close after shutdown.'));},10000);})]);}finally{clearTimeout(timer);}}

test('portable preparation separates roots, emits no secret and preserves bundled/edited content',async t=>{
  const f=await fixture(t),config=readJson(f.configPath);
  assert.notEqual(f.userRoot,f.adminRoot);assert.equal(f.sites.user,f.userRoot);assert.equal(f.sites.admin,f.adminRoot);
  assert.equal(f.dataDir,path.join(f.instanceRoot,'private','data'));assert.equal(config.dataDir,f.dataDir);
  assert.equal(config.publicHost,'0.0.0.0');assert.equal(config.adminHost,'127.0.0.1');
  assert.equal(f.games,8);assert.equal(f.initialPassword.length,32);assert.equal('config' in f,false);
  assert.equal(scryptSync(f.initialPassword,config.admin.salt,64).toString('hex'),config.admin.passwordHash);
  for(const host of ['localhost','127.0.0.1'])assert.ok(config.userOrigins.includes(`http://${host}:${config.userPort}`));
  assert.deepEqual(config.adminOrigins,[`http://localhost:${config.adminUiPort}`,`http://127.0.0.1:${config.adminUiPort}`]);
  for(const root of [f.userRoot,f.adminRoot]){
    assert.equal(fs.existsSync(path.join(root,'web.config')),false);
    assert.match(fs.readFileSync(path.join(root,'index.html'),'utf8'),/http-equiv="Content-Security-Policy"/);
    assert.match(fs.readFileSync(path.join(root,'index.html'),'utf8'),/content="noindex,nofollow"/);
    assert.match(fs.readFileSync(path.join(root,'config.js'),'utf8'),/portable-rebex/);
    for(const name of ['server','private','data','local.json','platform.sqlite'])assert.equal(fs.existsSync(path.join(root,name)),false);
  }
  for(const name of ['games','catalog','shared','play','app.js','user.css'])assert.equal(fs.existsSync(path.join(f.adminRoot,name)),false);
  for(const name of ['admin.js','admin.css'])assert.equal(fs.existsSync(path.join(f.userRoot,name)),false);
  function files(directory){return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(path.join(directory,entry.name)):[path.join(directory,entry.name)]);}
  for(const file of files(f.instanceRoot))assert.equal(fs.readFileSync(file).includes(Buffer.from(f.initialPassword)),false,'Initial password was written to disk.');
  const game=path.join(f.workspaceRoot,'games','slide-puzzle','game.js');fs.appendFileSync(game,'\n// user-owned customization\n');
  fs.writeFileSync(path.join(f.workspaceRoot,'web','user','app.js'),'stale source');
  const again=await prepareInstance({appRoot,instanceRoot:f.instanceRoot});
  assert.equal(again.initialPassword,undefined);assert.deepEqual(readJson(f.configPath).admin,config.admin);
  assert.match(fs.readFileSync(game,'utf8'),/user-owned customization/);
  assert.notEqual(fs.readFileSync(path.join(f.workspaceRoot,'web','user','app.js'),'utf8'),'stale source');
});

test('first preparation selects another complete port set when the preferred set is occupied',async t=>{
  const blocker=net.createServer();let owned=false;
  try{await new Promise((resolve,reject)=>{blocker.once('error',reject);blocker.listen(8080,'0.0.0.0',()=>{owned=true;resolve();});});}catch(error){if(error.code!=='EADDRINUSE')throw error;}
  t.after(()=>owned?new Promise(resolve=>blocker.close(resolve)):undefined);
  const f=await fixture(t);
  assert.ok([18080,28080].includes(f.ports.user));
  assert.equal(f.ports.admin,f.ports.user+1);assert.equal(f.ports.publicApi,f.ports.user+10);assert.equal(f.ports.adminApi,f.ports.user+11);
  const again=await prepareInstance({appRoot,instanceRoot:f.instanceRoot});assert.deepEqual(again.ports,f.ports);
});

test('available IPv4 discovery populates exact origins and unavailable discovery remains explicit',async t=>{
  const mock=t.mock.method(os,'networkInterfaces',()=>({Ethernet:[{family:'IPv4',address:'192.0.2.17',internal:false},{family:'IPv4',address:'127.0.0.1',internal:true},{family:'IPv6',address:'2001:db8::1',internal:false}]}));
  const f=await fixture(t);assert.equal(f.networkDiscovery.status,'available');
  assert.ok(readJson(f.configPath).userOrigins.includes(`http://192.0.2.17:${f.ports.user}`));assert.ok(f.urls.lanUsers.includes(`http://192.0.2.17:${f.ports.user}/`));
  mock.mock.mockImplementation(()=>{throw new Error('Interface enumeration unavailable');});
  const again=await prepareInstance({appRoot,instanceRoot:f.instanceRoot});assert.deepEqual(again.networkDiscovery,{status:'unavailable',code:'INTERFACES_UNAVAILABLE'});
  assert.ok(readJson(f.configPath).userOrigins.includes(`http://127.0.0.1:${f.ports.user}`));
  const gameHtml=fs.readFileSync(path.join(again.userRoot,'games','slide-puzzle','index.html'),'utf8');assert.ok(gameHtml.indexOf('charset="utf-8"')<gameHtml.indexOf('Content-Security-Policy'));
});

test('an added ninth catalog game survives preparation and is exposed by the unchanged API',async t=>{
  const f=await fixture(t),id='portable-extra',source=path.join(f.workspaceRoot,'games','slide-puzzle'),destination=path.join(f.workspaceRoot,'games',id);
  fs.cpSync(source,destination,{recursive:true});
  const manifest=readJson(path.join(destination,'game.manifest.json'));manifest.id=id;manifest.slug=id;manifest.title.ko='추가 게임';writeJson(path.join(destination,'game.manifest.json'),manifest);
  const catalog=readJson(path.join(f.workspaceRoot,'catalog','games.json'));catalog.entries.push({id,path:`games/${id}`,enabled:true});writeJson(path.join(f.workspaceRoot,'catalog','games.json'),catalog);
  const next=await prepareInstance({appRoot,instanceRoot:f.instanceRoot});assert.equal(next.games,9);
  assert.equal(fs.existsSync(path.join(next.userRoot,'play',id,'index.html')),true);
  assert.equal(fs.existsSync(path.join(next.adminRoot,'games')),false);
  const worker=await runWorker({role:'api',appRoot,instanceRoot:f.instanceRoot});t.after(()=>worker.close());
  const r=await fetch(`http://127.0.0.1:${f.ports.publicApi}/api/games`);assert.equal(r.status,200);const data=await r.json();assert.equal(data.games.length,9);assert.equal(data.games.find(g=>g.id===id).title,'추가 게임');
});

test('API worker restart retains guest save, Google config, admin hash and selected ports',async t=>{
  const f=await fixture(t),original=readJson(f.configPath);
  original.google={clientId:'configured-client.example',clientSecret:'test-only-preserved-secret',redirectUri:`http://localhost:${f.ports.publicApi}/api/auth/google/callback`};writeJson(f.configPath,original);
  let worker=await runWorker({role:'api',appRoot,instanceRoot:f.instanceRoot});t.after(async()=>{if(worker)await worker.close();});
  const client=new Client(`http://127.0.0.1:${f.ports.publicApi}`,`http://localhost:${f.ports.user}`);
  await client.call('/api/session');assert.equal((await client.call('/api/play-sessions',{method:'POST',body:{gameId:'slide-puzzle'}})).status,201);
  const saved=await client.call('/api/saves/slide-puzzle',{method:'PUT',headers:{'If-None-Match':'*'},body:{schemaVersion:1,payload:{moves:17,board:[1,2,3,4,5,6,7,0,8]}}});assert.equal(saved.status,201);
  const admin=new Client(`http://127.0.0.1:${f.ports.adminApi}`,`http://127.0.0.1:${f.ports.admin}`);await admin.call('/api/admin/session');assert.equal((await admin.call('/api/admin/login',{method:'POST',body:{username:'admin',password:f.initialPassword}})).status,200);
  await worker.close();worker=null;
  const next=await prepareInstance({appRoot,instanceRoot:f.instanceRoot}),config=readJson(f.configPath);
  assert.deepEqual(config.google,original.google);assert.deepEqual(config.admin,original.admin);assert.deepEqual(next.ports,f.ports);assert.equal(next.initialPassword,undefined);
  worker=await runWorker({role:'api',appRoot,instanceRoot:f.instanceRoot});
  const restored=await client.call('/api/saves/slide-puzzle');assert.equal(restored.status,200);assert.equal(restored.data.payload.moves,17);assert.equal(restored.data.revision,saved.data.revision);
  assert.equal((await client.call('/api/admin/metrics')).status,404);assert.equal((await admin.call('/api/session')).status,404);
  assert.equal((await fetch(`http://127.0.0.1:${f.ports.publicApi}/api/games`,{headers:{Origin:'http://evil.invalid'}})).status,403);
});

test('administrator static server binds loopback, serves safe MIME and denies cross-root paths',async t=>{
  const f=await fixture(t),app=createAdminStaticServer({root:f.adminRoot,port:0,adminApiPort:f.ports.adminApi}),address=await app.listen();t.after(()=>app.close());
  assert.equal(address.address,'127.0.0.1');
  const index=await rawRequest(address.port,'/');assert.equal(index.status,200);assert.match(index.body,/ADMINISTRATION/);assert.match(index.headers['content-security-policy'],/frame-ancestors 'none'/);assert.equal(index.headers['x-frame-options'],'DENY');assert.equal(index.headers['x-content-type-options'],'nosniff');
  assert.deepEqual(JSON.parse((await rawRequest(address.port,'/__playhub/health')).body),{ok:true,service:'admin-static'});
  assert.match((await rawRequest(address.port,'/admin.js')).headers['content-type'],/^text\/javascript/);
  assert.equal((await rawRequest(address.port,'/admin.css',{method:'HEAD'})).body,'');
  assert.equal((await rawRequest(address.port,'/',{method:'POST'})).status,405);
  for(const route of ['/api/admin/session','/games/slide-puzzle/index.html','/private/config/local.json','/../private/config/local.json','/%2e%2e/private/config/local.json','/%252e%252e/private/config/local.json','/..%5cprivate%5cconfig%5clocal.json','//index.html','/admin.js:stream','/.env','/platform.sqlite','/config.json','/web.config'])assert.equal((await rawRequest(address.port,route)).status,404,route);
  assert.equal((await rawRequest(address.port,'/',{headers:{Host:`evil.invalid:${address.port}`}})).status,403);
  fs.writeFileSync(path.join(f.adminRoot,'private.json'),'should-not-serve');assert.equal((await rawRequest(address.port,'/private.json')).status,404);
  fs.mkdirSync(path.join(f.adminRoot,'assets'));fs.symlinkSync(f.configPath,path.join(f.adminRoot,'assets','leak.txt'));assert.equal((await rawRequest(address.port,'/assets/leak.txt')).status,404);
  assert.throws(()=>createAdminStaticServer({root:f.adminRoot,port:0,adminApiPort:f.ports.adminApi}),/unsupported|links/);
});

test('preparation refuses links, unsafe config and maintenance without changing data',async t=>{
  const f=await fixture(t),config=readJson(f.configPath);
  fs.writeFileSync(path.join(f.dataDir,'maintenance.lock'),'maintenance');
  await assert.rejects(()=>prepareInstance({appRoot,instanceRoot:f.instanceRoot}),/maintenance/);
  await assert.rejects(()=>runWorker({role:'api',appRoot,instanceRoot:f.instanceRoot}),/maintenance/);
  assert.equal(fs.existsSync(path.join(f.dataDir,'platform.sqlite')),false);fs.unlinkSync(path.join(f.dataDir,'maintenance.lock'));
  writeJson(f.configPath,{...config,adminHost:'0.0.0.0'});await assert.rejects(()=>prepareInstance({appRoot,instanceRoot:f.instanceRoot}),/bindings/);
  assert.equal(readJson(f.configPath).adminHost,'0.0.0.0');writeJson(f.configPath,config);
  const link=path.join(f.workspaceRoot,'games','linked');fs.symlinkSync(f.adminRoot,link,'dir');await assert.rejects(()=>prepareInstance({appRoot,instanceRoot:f.instanceRoot}),/links/i);fs.unlinkSync(link);
  assert.equal(readJson(f.configPath).admin.passwordHash,config.admin.passwordHash);
});

test('first-run build failure never commits an unseen generated administrator password',async t=>{
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'playhub-portable-failure-'));t.after(()=>fs.rmSync(temporary,{recursive:true,force:true}));
  const instanceRoot=path.join(temporary,'instance');fs.mkdirSync(path.join(instanceRoot,'workspace','catalog'),{recursive:true});writeJson(path.join(instanceRoot,'workspace','catalog','games.json'),{schemaVersion:1,entries:[]});
  await assert.rejects(()=>prepareInstance({appRoot,instanceRoot}),/catalog/i);
  assert.equal(fs.existsSync(path.join(instanceRoot,'private','config','local.json')),false);
  assert.deepEqual(fs.readdirSync(path.join(instanceRoot,'private','config')),[]);
});

test('independent child workers announce readiness, close on IPC shutdown and parent disconnect',async t=>{
  const f=await fixture(t),api=startChild('api',f.instanceRoot);t.after(()=>{if(api.child.exitCode===null)api.child.kill();});
  const apiReady=await api.ready;assert.equal(apiReady.role,'api');assert.equal(apiReady.admin.address,'127.0.0.1');assert.equal(apiReady.public.port,f.ports.publicApi);
  assert.equal((await fetch(`http://127.0.0.1:${f.ports.publicApi}/api/health`)).status,200);
  const admin=startChild('admin',f.instanceRoot);t.after(()=>{if(admin.child.exitCode===null)admin.child.kill();});
  const adminReady=await admin.ready;assert.equal(adminReady.service,'admin-static');assert.equal(adminReady.address,'127.0.0.1');
  assert.equal((await rawRequest(f.ports.admin,'/__playhub/health')).status,200);
  api.child.send({type:'shutdown'});assert.deepEqual(await boundedExit(api),{code:0,signal:null});
  admin.child.disconnect();assert.deepEqual(await boundedExit(admin),{code:0,signal:null});
  const db=new DatabaseSync(path.join(f.dataDir,'platform.sqlite'),{readOnly:true});try{assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');}finally{db.close();}
  assert.equal(readInstanceConfig({appRoot,instanceRoot:f.instanceRoot}).config.adminPort,f.ports.adminApi);
});
