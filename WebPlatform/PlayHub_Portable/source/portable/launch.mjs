import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {randomBytes,randomUUID,scryptSync} from 'node:crypto';
import readline from 'node:readline';
import {prepareRebex,launchRebex,protectInstance} from './rebex.mjs';

const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const boundedError=error=>/^[A-Z][A-Z0-9_:-]{2,100}$/.test(error?.message||'')?error.message:'STARTUP_FAILED';
function atomicJson(file,value){fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});const temporary=file+'.new';fs.writeFileSync(temporary,JSON.stringify(value,null,2)+'\n',{mode:0o600});fs.renameSync(temporary,file);}
export function parseArgs(args){
  const options={};
  for(let i=0;i<args.length;i++){
    const arg=args[i];
    if(['--help','--no-open','--headless','--check-http','--self-test','--with-admin','--reset-admin-password'].includes(arg))options[arg.slice(2).replaceAll('-','_')]=true;
    else if(arg.startsWith('--worker=')){const role=arg.slice(9);if(!['api','admin'].includes(role))throw new Error('WORKER_ROLE_INVALID');options.worker=role;}
    else if(arg==='--rebex'&&args[i+1]&&!args[i+1].startsWith('--'))options.rebex=args[++i];
    else throw new Error('UNKNOWN_OPTION');
  }
  if(options.check_http&&options.self_test)throw new Error('COMMAND_CONFLICT');
  return options;
}
async function readCredentials(){
  if(process.stdin.isTTY)return {};
  let value='',bytes=0;
  for await(const data of process.stdin){bytes+=data.length;if(bytes>8192)throw new Error('CREDENTIAL_INPUT_TOO_LARGE');value+=data.toString('utf8');}
  if(!value.trim())return {};
  let parsed;try{parsed=JSON.parse(value.replace(/^\uFEFF/,''));}catch{throw new Error('CREDENTIAL_JSON_INVALID');}
  if(!parsed||Array.isArray(parsed)||Object.keys(parsed).some(key=>!['username','password'].includes(key)))throw new Error('CREDENTIAL_JSON_INVALID');
  if(typeof parsed.username!=='string'||typeof parsed.password!=='string')throw new Error('CREDENTIAL_JSON_INVALID');
  return parsed;
}
function contained(parent,child){const a=path.resolve(parent),b=path.resolve(child);return a===b||b.startsWith(a+path.sep);}
function liveProcess(pid){if(!Number.isInteger(pid)||pid<=0)return false;try{process.kill(pid,0);return true;}catch(error){return error.code!=='ESRCH';}}
function instanceLock(instanceRoot){
  const file=path.join(instanceRoot,'private/launcher.lock');fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  if(fs.existsSync(file)){
    if(fs.lstatSync(file).isSymbolicLink())throw new Error('INSTANCE_LOCK_INVALID');
    let old;try{old=JSON.parse(fs.readFileSync(file,'utf8'));}catch{throw new Error('INSTANCE_LOCK_INVALID');}
    if(old.product!=='playhub-portable'||typeof old.runId!=='string')throw new Error('INSTANCE_LOCK_INVALID');
    if(liveProcess(old.pid))return {running:true,previous:old};
    fs.unlinkSync(file);
  }
  const value={product:'playhub-portable',runId:randomUUID(),pid:process.pid,startedAt:new Date().toISOString()};
  fs.writeFileSync(file,JSON.stringify(value),{flag:'wx',mode:0o600});
  return {...value,release(){try{const current=JSON.parse(fs.readFileSync(file,'utf8'));if(current.runId===value.runId)fs.unlinkSync(file);}catch{}}};
}
function openUrl(url){
  if(process.platform!=='win32')return;
  const parsed=new URL(url);if(!['http:','https:'].includes(parsed.protocol)||!['localhost','127.0.0.1'].includes(parsed.hostname))return;
  const child=spawn('rundll32.exe',['url.dll,FileProtocolHandler',parsed.href],{detached:true,stdio:'ignore',windowsHide:true});child.on('error',()=>{});child.unref();
}
export function startWorker(context,role,instanceRoot){
  const args=[...(context.sea?[]:[path.join(context.appRoot,'portable/launch.mjs')]),`--worker=${role}`,'--data-dir',instanceRoot];
  const child=spawn(context.executable||process.execPath,args,{cwd:instanceRoot,windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});
  child.stdout.resume();child.stderr.resume();
  const ready=new Promise((resolve,reject)=>{
    let complete=false;const fail=()=>{if(!complete){complete=true;reject(new Error('WORKER_'+role.toUpperCase()+'_FAILED'));}};
    const timer=setTimeout(()=>{fail();try{child.kill();}catch{}},25000);
    child.once('error',fail);child.once('exit',()=>{clearTimeout(timer);fail();});
    child.on('message',message=>{if(!complete&&message?.type==='ready'&&message.role===role){complete=true;clearTimeout(timer);resolve({role,pid:child.pid,address:message.address||null,port:message.port||null});}else if(!complete&&message?.type==='error'){clearTimeout(timer);fail();}});
  });
  return {child,ready,async stop(){if(child.exitCode!==null)return;try{child.send({type:'shutdown'});}catch{}await Promise.race([new Promise(resolve=>child.once('exit',resolve)),pause(4500)]);if(child.exitCode===null)child.kill();}};
}
async function http(url,status=200){const response=await fetch(url,{signal:AbortSignal.timeout(2500),redirect:'manual'});if(response.status!==status)throw new Error('HTTP_READY_STATUS_MISMATCH');return response;}
async function waitHttp(url,test,isClosing=()=>false){
  for(let i=0;i<40;i++){if(isClosing())throw new Error('STARTUP_INTERRUPTED');try{const response=await http(url);if(!test||await test(response))return;}catch{}await pause(250);}
  throw new Error('HTTP_READY_TIMEOUT');
}
async function resetPassword(configPath){
  const config=JSON.parse(fs.readFileSync(configPath,'utf8')),password=randomBytes(18).toString('base64url'),salt=randomBytes(16).toString('hex');
  config.admin={username:config.admin?.username||'admin',salt,passwordHash:scryptSync(password,salt,64).toString('hex')};
  const database=path.join(config.dataDir,'platform.sqlite');
  if(fs.existsSync(database)){const {DatabaseSync}=await import('node:sqlite');const db=new DatabaseSync(database);try{db.prepare("DELETE FROM sessions WHERE kind='admin'").run();}finally{db.close();}}
  atomicJson(configPath,config);return password;
}
async function smoke(context,options){
  const reportPath=path.join(context.instanceRoot,'reports/portable-http.json'),startup=JSON.parse(fs.readFileSync(path.join(context.instanceRoot,'reports/startup-report.json'),'utf8'));
  if(startup.mode!=='portable-rebex'||startup.status!=='running'||!liveProcess(startup.mainPid))throw new Error('RUNNING_INSTANCE_REQUIRED');
  const credentials=await readCredentials();if(options.with_admin&&!credentials.password)throw new Error('ADMIN_STDIN_REQUIRED');
  const {runSmoke}=await import(pathToFileURL(path.join(context.appRoot,'tools/smoke.mjs')).href);
  const report=await runSmoke({user:startup.urls.user,admin:startup.urls.admin,publicApi:startup.urls.publicApi,adminApi:startup.urls.adminApi,rebex:true,report:reportPath},credentials);
  console.log(JSON.stringify({ok:report.ok,summary:report.summary,report:reportPath}));process.exitCode=report.ok?0:1;
}
export async function selfTest(context){
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'playhub-exe-test-'));let api,admin,user,layout;
  const checks=[];const check=(id,condition)=>{checks.push({id,status:condition?'pass':'fail'});if(!condition)throw new Error('SELF_TEST_'+id);};
  try{
    const {prepareInstance}=await import(pathToFileURL(path.join(context.appRoot,'portable/prepare.mjs')).href);
    layout=await prepareInstance({appRoot:context.appRoot,instanceRoot:path.join(temporary,'instance')});
    check('ROOTS_SEPARATE',!contained(layout.userRoot,layout.adminRoot)&&!contained(layout.adminRoot,layout.userRoot));
    check('DATABASE_PRIVATE',![layout.userRoot,layout.adminRoot].some(root=>contained(root,layout.dataDir)||contained(root,layout.configPath)));
    api=startWorker(context,'api',layout.instanceRoot);const apiReady=await api.ready;
    admin=startWorker(context,'admin',layout.instanceRoot);const adminReady=await admin.ready;
    check('PROCESSES_SEPARATE',apiReady.pid!==adminReady.pid&&apiReady.pid!==process.pid&&adminReady.pid!==process.pid);
    const {createStaticServer}=await import(pathToFileURL(path.join(context.appRoot,'tools/dev.mjs')).href);
    user=createStaticServer(layout.userRoot);await new Promise((resolve,reject)=>{user.once('error',reject);user.listen(layout.ports.user,'127.0.0.1',resolve);});
    const {runSmoke}=await import(pathToFileURL(path.join(context.appRoot,'tools/smoke.mjs')).href);
    const result=await runSmoke({user:layout.urls.user,admin:layout.urls.admin,publicApi:layout.urls.publicApi,adminApi:layout.urls.adminApi,report:path.join(context.instanceRoot,'reports/selftest-http.json')},{username:'admin',password:layout.initialPassword});
    check('API_AND_STATIC_HTTP',result.ok);
    await api.stop();api=null;await admin.stop();admin=null;
    user.closeAllConnections();await new Promise(resolve=>user.close(resolve));user=null;
    const again=await prepareInstance({appRoot:context.appRoot,instanceRoot:layout.instanceRoot});
    check('EXISTING_PASSWORD_PRESERVED',again.initialPassword===undefined);
    const report={schemaVersion:1,tool:'playhub-portable-selftest',version:'0.3.0',generatedAt:new Date().toISOString(),ok:checks.every(row=>row.status==='pass'),environment:{platform:process.platform,node:process.version,sea:context.sea===true},checks,httpSummary:result.summary,excluded:{realRebex:'not_run',browser:'not_run',google:'not_run',windows:process.platform==='win32'?'Node runtime only; Rebex/browser pending':'not_run'}};
    atomicJson(path.join(context.instanceRoot,'reports/exe-selftest.json'),report);console.log(JSON.stringify(report,null,2));return report;
  }finally{
    if(user){user.closeAllConnections();await new Promise(resolve=>user.close(resolve));}
    if(admin)await admin.stop();if(api)await api.stop();fs.rmSync(temporary,{recursive:true,force:true});
  }
}
export async function run(context){
  context={...context,appRoot:path.resolve(context.appRoot),instanceRoot:path.resolve(context.instanceRoot),executable:path.resolve(context.executable||process.execPath)};
  const options=parseArgs(context.args||[]);
  if(options.help){console.log('PlayHub 0.3 portable\nDouble-click PlayHub.exe beside your installed RebexTinyWebServer.exe.\nOptional: --data-dir PATH --rebex PATH --no-open --headless --reset-admin-password\nChecks: --self-test; --check-http [--with-admin] reads credentials JSON only from stdin.');return;}
  if(options.worker){if(!process.send)throw new Error('WORKER_PARENT_REQUIRED');const {runWorker}=await import(pathToFileURL(path.join(context.appRoot,'portable/workers.mjs')).href);await runWorker({role:options.worker,appRoot:context.appRoot,instanceRoot:context.instanceRoot});return;}
  if(options.self_test)return await selfTest(context);
  if(options.check_http)return await smoke(context,options);
  if(process.platform!=='win32')throw new Error('WINDOWS_REQUIRED_FOR_REBEX');
  fs.mkdirSync(context.instanceRoot,{recursive:true,mode:0o700});const acl=await protectInstance(context.instanceRoot);
  const lock=instanceLock(context.instanceRoot);
  if(lock.running){const prior=JSON.parse(fs.readFileSync(path.join(context.instanceRoot,'reports/startup-report.json'),'utf8'));if(prior.runId!==lock.previous.runId||prior.status!=='running')throw new Error('INSTANCE_ALREADY_STARTING');console.log('PlayHub is already running: '+prior.urls.user);if(!options.no_open)openUrl(prior.urls.user);return;}
  let api,admin,rebexProcess,closing=false,stopPromise,reportPath=path.join(context.instanceRoot,'reports/startup-report.json'),read;
  let report={schemaVersion:1,version:'0.3.0',mode:'portable-rebex',runId:lock.runId,status:'starting',generatedAt:new Date().toISOString(),environment:{platform:process.platform,node:process.version,sea:context.sea===true,windowsExecuted:true},mainPid:process.pid,paths:{instanceRoot:context.instanceRoot,appRoot:context.appRoot,executable:context.executable},children:[],checks:[]};
  let wake;const stopped=new Promise(resolve=>{wake=resolve;});
  const update=()=>{if(report){report.generatedAt=new Date().toISOString();atomicJson(reportPath,report);}};
  const stop=(error=null)=>{
    if(stopPromise)return stopPromise;closing=true;
    stopPromise=(async()=>{
      try{
        if(read)read.close();
        for(const component of [rebexProcess,admin,api])if(component)try{await component.stop();}catch{process.exitCode=1;}
        report.status=error?'failed':'stopped';report.children=report.children.map(child=>({...child,status:'stopped'}));if(error)report.error={code:boundedError(error)};
        try{update();}catch{process.exitCode=1;}
      }finally{lock.release();wake();}
    })();return stopPromise;
  };
  const ensureStarting=()=>{if(closing)throw new Error('STARTUP_INTERRUPTED');};
  try{
    update();
    const {prepareInstance}=await import(pathToFileURL(path.join(context.appRoot,'portable/prepare.mjs')).href);
    const layout=await prepareInstance({appRoot:context.appRoot,instanceRoot:context.instanceRoot});
    const password=options.reset_admin_password?await resetPassword(layout.configPath):layout.initialPassword;
    if(password)console.log('\nAdministrator: admin\nInitial password (shown only here): '+password+'\n');
    const rebex=await prepareRebex({appRoot:context.appRoot,instanceRoot:context.instanceRoot,executable:context.executable,rebexPath:options.rebex,interactive:!options.headless});
    report={schemaVersion:1,version:'0.3.0',mode:'portable-rebex',runId:lock.runId,status:'starting',generatedAt:new Date().toISOString(),environment:{platform:process.platform,node:process.version,sea:context.sea===true,windowsExecuted:process.platform==='win32'},mainPid:process.pid,paths:{instanceRoot:layout.instanceRoot,appRoot:context.appRoot,executable:context.executable,workspaceRoot:layout.workspaceRoot,userRoot:layout.userRoot,adminRoot:layout.adminRoot,configPath:layout.configPath,dataDir:layout.dataDir},ports:layout.ports,urls:layout.urls,children:[],rebex:{version:rebex.version,sha256:rebex.sha256,bytes:rebex.bytes,redistributed:false},security:{adminWebHost:'127.0.0.1',adminApiHost:'127.0.0.1',privateOutsideWebRoots:![layout.userRoot,layout.adminRoot].some(root=>contained(root,layout.dataDir)||contained(root,layout.configPath)),acl},checks:[]};update();
    const watch=(component,role)=>component.child.once('exit',()=>{if(!closing){console.error(role+' stopped. Shutting down owned services.');process.exitCode=1;void stop(new Error('CHILD_EXITED_'+role.toUpperCase().replaceAll('-','_')));}});
    api=startWorker(context,'api',layout.instanceRoot);watch(api,'api');const a=await api.ready;ensureStarting();report.children.push({role:'api',pid:a.pid,status:'ready'});
    admin=startWorker(context,'admin',layout.instanceRoot);watch(admin,'admin');const b=await admin.ready;ensureStarting();report.children.push({role:'admin',pid:b.pid,status:'ready'});
    fs.writeFileSync(path.join(layout.userRoot,'playhub-ready.json'),JSON.stringify({product:'playhub',runId:lock.runId}));
    rebexProcess=launchRebex({appRoot:context.appRoot,rebex,userRoot:layout.userRoot,userPort:layout.ports.user});watch(rebexProcess,'rebex-supervisor');const r=await rebexProcess.started;ensureStarting();
    report.children.push({role:'rebex-user',pid:r.pid,status:'ready'},{role:'rebex-supervisor',pid:r.supervisorPid,status:'ready'});
    await waitHttp(new URL('playhub-ready.json',layout.urls.user).href,async response=>(await response.json()).runId===lock.runId,()=>closing);
    await waitHttp(new URL('__playhub/health',layout.urls.admin).href,async response=>(await response.json()).service==='admin-static',()=>closing);
    await waitHttp(layout.urls.publicApi+'/api/health',async response=>(await response.json()).service==='public',()=>closing);
    await waitHttp(layout.urls.adminApi+'/api/health',async response=>(await response.json()).service==='admin',()=>closing);
    await http(layout.urls.publicApi+'/api/admin/metrics',404);
    for(const forbidden of ['private/config/local.json','server/app.mjs','admin/index.html'])await http(new URL(forbidden,layout.urls.user).href,404);
    ensureStarting();
    report.checks=[{id:'SEPARATE_SITES',status:'pass',message:'Distinct physical roots and independent user/admin processes.'},{id:'HTTP_READY',status:'pass',message:'Both sites and both API services answered on their configured ports.'},{id:'PUBLIC_BOUNDARY',status:'pass',message:'Public admin API, config, server source and administrator document paths rejected.'}];
    report.status='running';update();
    console.log('PlayHub 0.3 is running.\nUser: '+layout.urls.user+'\nAdministrator (this PC): '+layout.urls.admin);
    for(const url of layout.urls.lanUsers||[])console.log('LAN: '+url);
    console.log('Game folders and catalog: '+layout.workspaceRoot+'\nReport: '+reportPath+'\nEnter Q to stop, A for administrator, U for user. Closing this launcher stops its services.');
    if(!options.no_open)openUrl(layout.urls.user);
    const interrupt=()=>{void stop();};process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt);if(process.platform==='win32')process.once('SIGBREAK',interrupt);
    if(process.stdin.isTTY){read=readline.createInterface({input:process.stdin,output:process.stdout});read.on('line',line=>{const command=line.trim().toLowerCase();if(command==='q')void stop();else if(command==='a')openUrl(layout.urls.admin);else if(command==='u')openUrl(layout.urls.user);});read.on('close',()=>{if(!closing)void stop();});}
    await stopped;
  }catch(error){await stop(error);throw error;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);let instanceRoot=process.env.LOCALAPPDATA?path.join(process.env.LOCALAPPDATA,'PlayHub'):path.join(os.homedir(),'.local/share/PlayHub');
  const at=args.indexOf('--data-dir');if(at>=0){if(!args[at+1])throw new Error('DATA_DIR_REQUIRED');instanceRoot=path.resolve(args[at+1]);args.splice(at,2);}
  run({appRoot:path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),instanceRoot,args,executable:process.execPath,sea:false}).catch(error=>{console.error('PlayHub: '+boundedError(error));process.exitCode=1;});
}
