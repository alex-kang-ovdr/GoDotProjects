import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import http from 'node:http';
import {spawn,spawnSync} from 'node:child_process';
import {scryptSync} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {prepareInstance,readInstanceConfig,readPreparedInstance} from '../portable/prepare.mjs';
import {createAdminStaticServer} from '../portable/static-server.mjs';
import {runWorker} from '../portable/workers.mjs';
import {setupConfig} from '../tools/setup.mjs';
import {parseArgs} from '../portable/launch.mjs';

const appRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const workersUrl=pathToFileURL(path.join(appRoot,'portable/workers.mjs')).href;
const readJson=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const writeJson=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2));
async function fixture(t) {
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'playhub-portable-test-'));
  const closers=[];
  t.after(async()=>{
    for(const close of closers.reverse())await close();
    fs.rmSync(temporary,{recursive:true,force:true,maxRetries:3,retryDelay:120});
  });
  const instanceRoot=path.join(temporary,'instance');
  const prepared=await prepareInstance({appRoot,instanceRoot});
  return {...prepared,temporary,beforeCleanup:close=>closers.push(close)};
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
  assert.deepEqual(f.ports,{user:8080,admin:8081,publicApi:8090,adminApi:8091});
  assert.notEqual(f.userRoot,f.adminRoot);assert.equal(f.sites.user,f.userRoot);assert.equal(f.sites.admin,f.adminRoot);
  assert.equal(f.dataDir,path.join(f.instanceRoot,'private','data'));assert.equal(config.dataDir,f.dataDir);
  assert.equal(config.publicHost,'0.0.0.0');assert.equal(config.adminHost,'127.0.0.1');
  assert.equal(f.games,readJson(path.join(appRoot,'catalog','games.json')).entries.length);assert.equal(f.initialPassword.length,32);assert.equal('config' in f,false);
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

test('only explicit preparation creates deployment assets, and launch validation leaves them unchanged',async t=>{
  const f=await fixture(t);
  const empty=path.join(f.temporary,'unprepared');
  assert.throws(()=>readPreparedInstance({appRoot,instanceRoot:empty}),{code:'PORTABLE_DEPLOYMENT_REQUIRED'});
  assert.equal(fs.existsSync(empty),false);
  assert.deepEqual(parseArgs(['--prepare']),{prepare:true});
  assert.throws(()=>parseArgs(['--prepare','--self-test']),/COMMAND_CONFLICT/);

  const deployed={appRoot,instanceRoot:f.instanceRoot};
  const markerPath=path.join(f.userRoot,'playhub-ready.json');
  const before=fs.readFileSync(markerPath,'utf8');
  const sourceCatalog=path.join(f.workspaceRoot,'catalog','games.json');
  fs.writeFileSync(sourceCatalog,'invalid unprepared catalog');
  const first=readPreparedInstance(deployed);
  const second=readPreparedInstance(deployed);
  assert.equal(first.deploymentId,f.deploymentId);
  assert.deepEqual(second,first);
  assert.equal(fs.readFileSync(sourceCatalog,'utf8'),'invalid unprepared catalog');
  assert.equal(fs.readFileSync(markerPath,'utf8'),before);

  const config=readJson(f.configPath);
  writeJson(f.configPath,{...config,playforgeUrl:'http://127.0.0.1:9876/'});
  assert.throws(()=>readPreparedInstance(deployed),{code:'PORTABLE_DEPLOYMENT_REQUIRED'});
  writeJson(f.configPath,config);
  fs.unlinkSync(path.join(f.adminRoot,'admin.js'));
  assert.throws(()=>readPreparedInstance(deployed),{code:'PORTABLE_DEPLOYMENT_REQUIRED'});
});

test('normal Windows launch reports a missing deployment without creating an instance', {skip:process.platform!=='win32'},async t=>{
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'playhub-unprepared-start-'));
  t.after(()=>fs.rmSync(temporary,{recursive:true,force:true}));
  const instanceRoot=path.join(temporary,'instance');
  const launch=spawnSync(process.execPath,[path.join(appRoot,'portable/launch.mjs'),'--headless','--no-open','--data-dir',instanceRoot],{encoding:'utf8',timeout:15000});
  assert.equal(launch.status,1,launch.error?.message||launch.stderr);
  assert.match(launch.stderr,/PORTABLE_DEPLOYMENT_REQUIRED/);
  assert.match(launch.stderr,/PlayHub\.exe --prepare/);
  assert.equal(fs.existsSync(instanceRoot),false);
});

test('explicit Windows preparation deploys the sites without starting listeners or opening the database', {skip:process.platform!=='win32'},async t=>{
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'playhub-prepare-cli-'));
  t.after(()=>fs.rmSync(temporary,{recursive:true,force:true,maxRetries:3,retryDelay:120}));
  const instanceRoot=path.join(temporary,'instance');
  const deployment=spawnSync(process.execPath,[path.join(appRoot,'portable/launch.mjs'),'--prepare','--data-dir',instanceRoot],{encoding:'utf8',timeout:60000});
  assert.equal(deployment.status,0,deployment.error?.message||deployment.stderr);
  const prepared=readPreparedInstance({appRoot,instanceRoot});
  assert.equal(fs.existsSync(path.join(prepared.dataDir,'platform.sqlite')),false);
  assert.equal(fs.existsSync(path.join(instanceRoot,'reports','startup-report.json')),false);
  assert.equal(fs.existsSync(path.join(instanceRoot,'private','launcher.lock')),false);
});

test('Windows startup reports an occupied configured port and keeps the existing config and listener', {skip:process.platform!=='win32'},async t=>{
  const instanceRoot=fs.mkdtempSync(path.join(os.tmpdir(),'playhub-port-conflict-'));
  t.after(()=>fs.rmSync(instanceRoot,{recursive:true,force:true}));
  const blocker=net.createServer();
  await new Promise((resolve,reject)=>{blocker.once('error',reject);blocker.listen(0,'127.0.0.1',resolve);});
  t.after(()=>new Promise(resolve=>blocker.close(resolve)));
  const port=blocker.address().port,configPath=path.join(instanceRoot,'private','config','local.json');
  setupConfig({configPath,settings:{userPort:port,localOnly:false,dataDir:path.join(instanceRoot,'private','data'),adminPassword:'test-fixture-password'}});
  await prepareInstance({appRoot,instanceRoot});
  const config=fs.readFileSync(configPath,'utf8');
  const launch=spawnSync(process.execPath,[path.join(appRoot,'portable/launch.mjs'),'--headless','--no-open','--data-dir',instanceRoot],{encoding:'utf8',timeout:20000});
  assert.equal(launch.status,1,launch.error?.message||launch.stderr);
  assert.match(launch.stdout,new RegExp(`TCP[^\\n]*\\b${port}\\b[^\\n]*PID ${process.pid} \\(node.exe\\)`));
  assert.match(launch.stderr,/PORT_PREFLIGHT_FAILED/);
  assert.equal(fs.readFileSync(configPath,'utf8'),config);
  assert.equal(blocker.listening,true);
  assert.equal(fs.existsSync(path.join(instanceRoot,'reports','startup-report.json')),false);
});

test('Windows port preflight requires confirmation and verifies ownership before force-stopping', {skip:process.platform!=='win32'},()=>{
  const powershell=path.join(process.env.WINDIR||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
  const result=spawnSync(powershell,['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(appRoot,'tests/preview-ports.windows.ps1')],{encoding:'utf8',timeout:20000});
  assert.equal(result.status,0,result.error?.message||result.stdout+result.stderr);
  assert.match(result.stdout,/PlayHub port policy passed/);
});

test('Windows concurrent restarts preserve the lock claimed by one launcher', {skip:process.platform!=='win32',timeout:20000},async t=>{
  const instanceRoot=fs.mkdtempSync(path.join(os.tmpdir(),'playhub-launcher-lock-'));
  const lockPath=path.join(instanceRoot,'private','launcher.lock'),resumePath=path.join(instanceRoot,'resume');
  fs.mkdirSync(path.dirname(lockPath));
  writeJson(lockPath,{product:'playhub-portable',pid:0,runId:'stale-launcher'});
  const launchUrl=pathToFileURL(path.join(appRoot,'portable','launch.mjs')).href;
  const acquireCode="const {instanceLock}=await import("+JSON.stringify(launchUrl)+");\n"+
    "const lock=await instanceLock("+JSON.stringify(instanceRoot)+");\n";
  const pauseAtStaleRemoval=[
    "import fs from 'node:fs';",
    "const unlink=fs.unlinkSync;",
    "fs.unlinkSync=file=>{",
    "  if(file==="+JSON.stringify(lockPath)+"){",
    "    process.send({phase:'before-stale-removal'});",
    "    const wait=new Int32Array(new SharedArrayBuffer(4)),deadline=Date.now()+10000;",
    "    while(!fs.existsSync("+JSON.stringify(resumePath)+")){",
    "      if(Date.now()>deadline)throw new Error('Test resume timed out');",
    "      Atomics.wait(wait,0,0,25);",
    "    }",
    "  }",
    "  return unlink(file);",
    "};"
  ].join('\n');
  const winnerCode=pauseAtStaleRemoval+'\n'+acquireCode+
    "process.send({phase:'acquired',running:lock.running===true,runId:lock.runId},()=>process.disconnect());";
  const first=spawn(process.execPath,['--input-type=module','--eval',winnerCode],{stdio:['ignore','ignore','inherit','ipc']});
  const closed=new Promise(resolve=>first.once('close',resolve));
  t.after(async()=>{
    fs.writeFileSync(resumePath,'');
    await closed;
    fs.rmSync(instanceRoot,{recursive:true,force:true});
  });
  function waitFor(phase){
    return new Promise((resolve,reject)=>{
      const onClose=code=>reject(new Error('Launcher exited with code '+code+' before '+phase));
      const onMessage=message=>{
        if(message.phase!==phase)return;
        first.off('close',onClose);
        first.off('message',onMessage);
        resolve(message);
      };
      first.once('close',onClose);
      first.on('message',onMessage);
    });
  }
  const acquired=waitFor('acquired');
  await waitFor('before-stale-removal');
  const contenderCode=acquireCode+"console.log(JSON.stringify({running:lock.running===true}));";
  const contender=spawnSync(process.execPath,['--input-type=module','--eval',contenderCode],{encoding:'utf8',timeout:5000});
  assert.equal(contender.status,0,contender.error?.message||contender.stdout+contender.stderr);
  assert.equal(JSON.parse(contender.stdout).running,true);
  assert.equal(readJson(lockPath).runId,'stale-launcher');
  fs.writeFileSync(resumePath,'');
  const winner=await acquired;
  assert.equal(winner.running,false);
  assert.equal(readJson(lockPath).runId,winner.runId);
  assert.equal(await closed,0);
});

test('explicit self-test ports require self-test and preserve the supplied port order',()=>{
  const option=['--self-test-ports','28080,28081,28090,28091'];
  assert.throws(()=>parseArgs(option),/SELF_TEST_PORTS_REQUIRE_SELF_TEST/);
  assert.throws(()=>parseArgs(['--self-test','--self-test-ports','28080,28080,28090,28091']),/SELF_TEST_PORTS_INVALID/);
  assert.deepEqual(parseArgs(['--self-test',...option]).self_test_ports,{userPort:28080,adminUiPort:28081,publicPort:28090,adminPort:28091});
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

test('an added catalog game survives preparation and is exposed by the unchanged API',async t=>{
  const f=await fixture(t),id='portable-extra',source=path.join(f.workspaceRoot,'games','slide-puzzle'),destination=path.join(f.workspaceRoot,'games',id);
  const reservedPorts=[net.createServer(),net.createServer()];
  for(const server of reservedPorts){
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    f.beforeCleanup(()=>server.listening?new Promise(resolve=>server.close(resolve)):undefined);
  }
  const config=readJson(f.configPath);
  [config.publicPort,config.adminPort]=reservedPorts.map(server=>server.address().port);
  config.publicBaseUrl=`http://localhost:${config.publicPort}`;
  writeJson(f.configPath,config);
  fs.cpSync(source,destination,{recursive:true});
  const manifest=readJson(path.join(destination,'game.manifest.json'));manifest.id=id;manifest.slug=id;manifest.title.ko='추가 게임';writeJson(path.join(destination,'game.manifest.json'),manifest);
  const catalog=readJson(path.join(f.workspaceRoot,'catalog','games.json'));catalog.entries.push({id,path:`games/${id}`,enabled:true});writeJson(path.join(f.workspaceRoot,'catalog','games.json'),catalog);
  const next=await prepareInstance({appRoot,instanceRoot:f.instanceRoot});assert.equal(next.games,f.games+1);
  assert.equal(fs.existsSync(path.join(next.userRoot,'play',id,'index.html')),true);
  assert.equal(fs.existsSync(path.join(next.adminRoot,'games')),false);
  fs.writeFileSync(path.join(f.workspaceRoot,'catalog','games.json'),'unprepared draft');
  await Promise.all(reservedPorts.map(server=>new Promise(resolve=>server.close(resolve))));
  const worker=await runWorker({role:'api',appRoot,instanceRoot:f.instanceRoot});f.beforeCleanup(()=>worker.close());
  const r=await fetch(`http://127.0.0.1:${next.ports.publicApi}/api/games`);assert.equal(r.status,200);const data=await r.json();assert.equal(data.games.length,f.games+1);assert.equal(data.games.find(g=>g.id===id).title,'추가 게임');
});

test('API worker restart retains guest save, Google config, admin hash and selected ports',async t=>{
  const f=await fixture(t),original=readJson(f.configPath);
  original.google={clientId:'configured-client.example',clientSecret:'test-only-preserved-secret',redirectUri:`http://localhost:${f.ports.publicApi}/api/auth/google/callback`};writeJson(f.configPath,original);
  let worker=await runWorker({role:'api',appRoot,instanceRoot:f.instanceRoot});f.beforeCleanup(async()=>{if(worker)await worker.close();});
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
  const f=await fixture(t),app=createAdminStaticServer({root:f.adminRoot,port:0,adminApiPort:f.ports.adminApi}),address=await app.listen();f.beforeCleanup(()=>app.close());
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
  const f=await fixture(t),config=readJson(f.configPath),probe=net.createServer();
  await new Promise((resolve,reject)=>{probe.once('error',reject);probe.listen(0,'127.0.0.1',resolve);});
  f.ports.admin=probe.address().port;
  await new Promise(resolve=>probe.close(resolve));
  config.adminUiPort=f.ports.admin;
  config.adminBaseUrl=`http://localhost:${f.ports.admin}`;
  config.adminOrigins=[config.adminBaseUrl,`http://127.0.0.1:${f.ports.admin}`];
  writeJson(f.configPath,config);
  const api=startChild('api',f.instanceRoot);f.beforeCleanup(async()=>{if(api.child.exitCode===null){api.child.kill();await api.exited;}});
  const apiReady=await api.ready;assert.equal(apiReady.role,'api');assert.equal(apiReady.admin.address,'127.0.0.1');assert.equal(apiReady.public.port,f.ports.publicApi);
  assert.equal((await fetch(`http://127.0.0.1:${f.ports.publicApi}/api/health`)).status,200);
  const admin=startChild('admin',f.instanceRoot);f.beforeCleanup(async()=>{if(admin.child.exitCode===null){admin.child.kill();await admin.exited;}});
  const adminReady=await admin.ready;assert.equal(adminReady.service,'admin-static');assert.equal(adminReady.address,'127.0.0.1');
  assert.equal((await rawRequest(f.ports.admin,'/__playhub/health')).status,200);
  api.child.send({type:'shutdown'});assert.deepEqual(await boundedExit(api),{code:0,signal:null});
  admin.child.disconnect();assert.deepEqual(await boundedExit(admin),{code:0,signal:null});
  const db=new DatabaseSync(path.join(f.dataDir,'platform.sqlite'),{readOnly:true});try{assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');}finally{db.close();}
  assert.equal(readInstanceConfig({appRoot,instanceRoot:f.instanceRoot}).config.adminPort,f.ports.adminApi);
});
