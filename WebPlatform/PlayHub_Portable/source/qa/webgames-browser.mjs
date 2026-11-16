import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {scryptSync} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {build}=await import(pathToFileURL(path.join(root,'tools/build.mjs')));
const {createApp}=await import(pathToFileURL(path.join(root,'server/app.mjs')));
const {createStaticServer}=await import(pathToFileURL(path.join(root,'tools/dev.mjs')));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'playhub-integrated-'));
const fixtureRoot=path.join(temp,'package');fs.mkdirSync(fixtureRoot);for(const name of ['web','shared','games','catalog'])fs.cpSync(path.join(root,name),path.join(fixtureRoot,name),{recursive:true});
const reportDir=path.join(root,'reports');fs.mkdirSync(reportDir,{recursive:true});
let app,user,admin,chrome,socket;
const results=[],errors=[];
try{
 build({root:fixtureRoot});user=createStaticServer(path.join(fixtureRoot,'dist/user'));admin=createStaticServer(path.join(fixtureRoot,'dist/admin'));
 for(const server of [user,admin])await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const userUrl=`http://127.0.0.1:${user.address().port}`,adminUrl=`http://127.0.0.1:${admin.address().port}`;
 const password='isolated-browser-test-only',salt='a'.repeat(32);
 app=createApp({publicHost:'127.0.0.1',publicPort:0,adminHost:'127.0.0.1',adminPort:0,userOrigins:[userUrl],adminOrigins:[adminUrl],userBaseUrl:userUrl,publicBaseUrl:userUrl,adminBaseUrl:adminUrl,secureCookies:false,dataDir:path.join(temp,'data'),admin:{username:'test-admin',salt,passwordHash:scryptSync(password,salt,64).toString('hex')}},{rootDir:fixtureRoot});
 const ports=await app.listen();
 fs.writeFileSync(path.join(fixtureRoot,'dist/user/config.js'),'window.PLAYHUB_CONFIG='+JSON.stringify({apiPort:ports.public.port})+';');
 fs.writeFileSync(path.join(fixtureRoot,'dist/admin/config.js'),'window.PLAYHUB_ADMIN_CONFIG='+JSON.stringify({apiPort:ports.admin.port})+';');
 const profile=path.join(temp,'chrome');chrome=spawn(process.env.PLAYHUB_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
 const portFile=path.join(profile,'DevToolsActivePort');for(let i=0;i<100&&!fs.existsSync(portFile);i++)await delay(100);
 const port=Number(fs.readFileSync(portFile,'utf8').split('\n')[0]);const tab=await(await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();socket=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true});});
 let serial=0;const jobs=new Map(),contexts=new Map();socket.addEventListener('message',({data})=>{const m=JSON.parse(data);if(jobs.has(m.id)){const job=jobs.get(m.id);jobs.delete(m.id);m.error?job.reject(new Error(m.error.message)):job.resolve(m.result);}if(m.method==='Runtime.executionContextCreated')contexts.set((m.sessionId||'')+':'+m.params.context.id,{...m.params.context,sessionId:m.sessionId});if(m.method==='Runtime.executionContextDestroyed')contexts.delete((m.sessionId||'')+':'+m.params.executionContextId);if(m.method==='Runtime.executionContextsCleared'){for(const [key,c] of contexts)if(c.sessionId===m.sessionId)contexts.delete(key);}if(m.method==='Target.detachedFromTarget'){for(const [key,c] of contexts)if(c.sessionId===m.params.sessionId)contexts.delete(key);}if(m.method==='Target.attachedToTarget')void send('Runtime.enable',{},m.params.sessionId).catch(()=>{});if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++serial;const timer=setTimeout(()=>{jobs.delete(id);reject(new Error('timeout '+method));},20000);jobs.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
 const evaluate=async(expression,context)=>{const v=await send('Runtime.evaluate',{expression,contextId:context?.id,returnByValue:true,awaitPromise:true},context?.sessionId);if(v.exceptionDetails)throw new Error(v.exceptionDetails.exception?.description||v.exceptionDetails.text);return v.result.value;};
 const waitFor=async(expression,timeout=10000)=>{for(let start=Date.now();Date.now()-start<timeout;){try{const v=await evaluate(expression);if(v)return v;}catch{}await delay(100);}throw new Error('Wait timed out '+expression);};
 const capture=async name=>{const shot=await send('Page.captureScreenshot',{format:'png',fromSurface:true});fs.writeFileSync(path.join(reportDir,'local-'+name+'.png'),Buffer.from(shot.data,'base64'));};
 await send('Page.enable');await send('Runtime.enable');await send('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:false,flatten:true});await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:userUrl+'/?lang=ko'});await waitFor("document.querySelectorAll('[data-testid=game-card]').length===21");
 const ids=await evaluate("[...document.querySelectorAll('[data-testid=game-card]')].map(x=>x.dataset.gameId)");if(ids.slice(0,13).some(id=>['match3-garden','brick-breaker','mines-grid'].includes(id)))throw new Error('Import ordering');
 await capture('portal-desktop');await waitFor("!document.querySelector('[data-wishlist-game]').disabled");await evaluate("document.querySelector('[data-wishlist-game]').click()");await waitFor("document.querySelector('[data-wishlist-game]').getAttribute('aria-pressed')==='true'");
 if(app.db.prepare('SELECT count(*) n FROM wishlist_items').get().n!==1)throw new Error('Wishlist did not persist');
 for(const locale of ['en','ja','zh-CN','fr','es','pt-BR','hi','ko']){await evaluate(`document.querySelector('#language-select').value=${JSON.stringify(locale)};document.querySelector('#language-select').dispatchEvent(new Event('change',{bubbles:true}));`);await delay(150);if(await evaluate('document.documentElement.lang')!==locale)throw new Error('Host locale '+locale);}
 await delay(200);results.push({scope:'portal',cards:ids.length,first:ids[0],wishlist:true,locales:8});
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(150);await capture('portal-mobile');const mobile=await evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth})');if(mobile.scroll>mobile.width+1)throw new Error('Mobile horizontal overflow '+JSON.stringify(mobile));
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 for(const id of ids.filter(id=>!process.env.PLAYHUB_TEST_GAME||id===process.env.PLAYHUB_TEST_GAME)){const before=errors.length;try{await send('Page.navigate',{url:userUrl+'/play/'+id+'/?lang=en'});await waitFor("document.querySelector('#play-button')&&!document.querySelector('#play-button').disabled");await evaluate("document.querySelector('#play-button').click()");await waitFor("document.querySelector('iframe[data-testid=game-frame]')");
  const start=Date.now();while(Date.now()-start<16000&&!app.db.prepare('SELECT 1 FROM play_sessions WHERE game_id=? AND ready_at IS NOT NULL').get(id))await delay(100);
  if(!app.db.prepare('SELECT 1 FROM play_sessions WHERE game_id=? AND ready_at IS NOT NULL').get(id))throw new Error('SDK ready timed out');
  const tree=await send('Page.getFrameTree');const frameId=tree.frameTree.childFrames?.[0]?.frame.id;const context=[...contexts.values()].find(c=>(frameId?c.auxData?.frameId===frameId:!!c.sessionId)&&c.auxData?.isDefault);
  if(!context)throw new Error('Game context missing');
  const initial=await evaluate("({lang:document.documentElement.lang,title:document.title,instance:globalThis.__localeProbe=crypto.randomUUID(),sdk:!!globalThis.GameSDK,body:document.body.innerText.slice(0,100)})",context);if(initial.lang!=='en')throw new Error('Initial language '+JSON.stringify(initial));
  await evaluate("document.querySelector('#language-select').value='hi';document.querySelector('#language-select').dispatchEvent(new Event('change',{bubbles:true}));");await delay(100);
  const changed=await evaluate("({lang:document.documentElement.lang,instance:globalThis.__localeProbe})",context);if(changed.lang!=='hi'||changed.instance!==initial.instance)throw new Error('Live language reset');
  if(id==='match3-garden'){await evaluate("document.querySelector('#primary').click();document.querySelector('#pause').click();",context);await delay(800);if(!app.db.prepare('SELECT 1 FROM save_slots WHERE game_id=?').get(id))throw new Error('Native save missing');await capture('game-hindi');}
  results.push({id,ready:true,autoLocale:initial.lang,liveLocale:changed.lang,preserved:true,errors:errors.slice(before)});console.log(JSON.stringify(results.at(-1)));
 }catch(e){await capture('failure-'+id);const screen=await evaluate('document.body.innerText.slice(0,900)');results.push({id,error:e.message,screen,errors:errors.slice(before)});console.log(JSON.stringify(results.at(-1)));}}
 await send('Page.navigate',{url:adminUrl+'/?lang=en'});await waitFor("document.querySelector('#login-form')");
 await evaluate(`document.querySelector('input[name=username],#username').value='test-admin';document.querySelector('input[type=password]').value=${JSON.stringify(password)};document.querySelector('#login-form').requestSubmit();`);await waitFor("document.querySelector('#dashboard')&&!document.querySelector('#dashboard').hidden");await delay(400);if(await evaluate('document.documentElement.lang')!=='en')throw new Error('Admin URL language ignored');for(const locale of ['ja','zh-CN','fr','es','pt-BR','hi','ko','en']){await evaluate(`document.querySelector('#language-select').value=${JSON.stringify(locale)};document.querySelector('#language-select').dispatchEvent(new Event('change',{bubbles:true}));`);await delay(100);if(await evaluate('document.documentElement.lang')!==locale)throw new Error('Admin locale '+locale);}await capture('admin-desktop');results.push({scope:'admin',loggedIn:true,locales:8,urlLocale:true});
}catch(error){results.push({scope:'fatal',error:error.stack});process.exitCode=1;}
finally{fs.writeFileSync(path.join(reportDir,'local-browser-integration.json'),JSON.stringify({at:new Date().toISOString(),results,errors},null,2));console.log(JSON.stringify({passed:results.filter(x=>!x.error).length,failed:results.filter(x=>x.error).length,errors:errors.length}));if(results.some(x=>x.error)||errors.length)process.exitCode=1;socket?.close();for(const server of [user,admin])if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await app?.close();if(chrome)await new Promise(r=>{chrome.once('exit',r);if(chrome.exitCode!==null||!chrome.kill())r();});fs.rmSync(temp,{recursive:true,force:true,maxRetries:5,retryDelay:150});}
