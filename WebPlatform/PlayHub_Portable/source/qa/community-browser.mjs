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
 const capture=async name=>{const shot=await send('Page.captureScreenshot',{format:'png',fromSurface:true});fs.writeFileSync(path.join(reportDir,'local-community-'+name+'.png'),Buffer.from(shot.data,'base64'));};


 await send('Page.enable');await send('Runtime.enable');await send('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:false,flatten:true});await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 const selector='[data-testid="community"]';
 const idle="document.querySelector('[data-testid=community]')&&!document.querySelector('[data-testid=community]').hasAttribute('aria-busy')";
 const navigate=async(url)=>{await send('Page.navigate',{url});await waitFor(idle);};
 const count=()=>evaluate("document.querySelectorAll('[data-testid=community-item]').length");
 const assert=(ok,message)=>{if(!ok)throw new Error(message);};
 await navigate(userUrl+'/play/rimworld/?lang=ko');
 await waitFor("document.querySelector('#play-button')&&!document.querySelector('#play-button').disabled");await evaluate("document.querySelector('#play-button').click()");await waitFor("document.querySelector('iframe[data-testid=game-frame]')");await evaluate("window.__communityFrame=document.querySelector('iframe[data-testid=game-frame]')");
 // Changing filters while an older HTTP request is pending must finish, retaining a draft.
 await send('Network.enable');await send('Network.emulateNetworkConditions',{offline:false,latency:250,downloadThroughput:-1,uploadThroughput:-1});
 await evaluate("document.querySelector('[data-testid=community-body]').value='draft survives';document.querySelector('[data-testid=community-tab-comment]').click();document.querySelector('[data-testid=community-tab-suggestion]').click();");
 await waitFor(idle);assert(await evaluate("document.querySelector('[data-testid=community-body]').value==='draft survives'"),'Filter discarded draft');
 await send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
 await evaluate("document.querySelector('[data-testid=community-tab-all]').click()");await waitFor(idle);
 const raw='<img src=x onerror="window.communityInjected=1"> 새 게임';
 await evaluate(`document.querySelector('[data-testid=community-body]').value=${JSON.stringify(raw)};document.querySelector('[data-testid=community-composer]').requestSubmit();`);
 await waitFor("document.querySelectorAll('[data-testid=community-item]').length===1");
 assert(await evaluate(`document.querySelector('.community-item-body').textContent===${JSON.stringify(raw)}&&!document.querySelector('.community-item-body img')&&!window.communityInjected`),'Raw comment was interpreted');
 await evaluate("document.querySelector('[data-action=edit]').click();var f=document.querySelector('[data-form=edit]');f.elements.body.value='수정된 의견';f.requestSubmit();");await waitFor("document.querySelector('.community-item-body').textContent==='수정된 의견'");
 const commentId=await evaluate("document.querySelector('[data-testid=community-item]').dataset.itemId");
 await evaluate("var f=document.querySelector('[data-testid=community-composer]');f.elements.kind.value='suggestion';f.elements.kind.dispatchEvent(new Event('change'));f.elements.title.value='새 게임';f.elements.body.value='키보드 조작을 개선해 주세요.';f.requestSubmit();");await waitFor("document.querySelectorAll('[data-testid=community-item]').length===2");
 const suggestionId=await evaluate("document.querySelector('[data-testid=community-vote]').dataset.itemId");
 await evaluate("document.querySelector('[data-testid=community-vote]').click()");await waitFor("document.querySelector('[data-testid=community-vote]').getAttribute('aria-pressed')==='true'");
 await evaluate("document.querySelector('#language-select').value='en';document.querySelector('#language-select').dispatchEvent(new Event('change',{bubbles:true}));");await delay(200);
 assert(await evaluate("document.querySelector('.community-item-title').textContent==='새 게임'"),'User content was translated');
 assert(await evaluate("document.querySelector('[data-testid=community-body]').placeholder==='Share your thoughts about the game.'"),'Placeholder not localized');
 assert(await evaluate("window.__communityFrame===document.querySelector('iframe[data-testid=game-frame]')"),'Community interaction replaced game iframe');
 for(const locale of ['ja','zh-CN','fr','es','pt-BR','hi','ko','en']){
   await evaluate(`document.querySelector('#language-select').value=${JSON.stringify(locale)};document.querySelector('#language-select').dispatchEvent(new Event('change',{bubbles:true}));`);await delay(50);
   assert(await evaluate(`document.documentElement.lang===${JSON.stringify(locale)}&&document.querySelector('.community-item-title').textContent==='새 게임'`),'Community language or raw content changed');
   if(locale!=='ko')assert(await evaluate("document.querySelector('[data-testid=community-body]').placeholder!=='게임에 대한 의견을 남겨 주세요.'"),'Field language not applied');
 }

 await evaluate("document.querySelector('[data-testid=community]').scrollIntoView({behavior:'instant',block:'start'})");await delay(400);await capture('desktop');
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(150);await evaluate("document.querySelector('[data-testid=community]').scrollIntoView({behavior:'instant',block:'start'})");await delay(400);await capture('mobile');assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Mobile overflow');
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await evaluate(`document.querySelector('[data-item-id="${commentId}"] [data-action=delete]').click();document.querySelector('[data-item-id="${commentId}"] [data-action=confirm-delete]').click();`);await waitFor("document.querySelectorAll('[data-testid=community-item]').length===1");
 results.push({scope:'author',createComment:true,edit:true,delete:true,suggestion:true,vote:true,rawText:true,draftAndFilterRace:true,mobile:true,locales:8,gameFramePreserved:true});
 await send('Network.clearBrowserCookies');await navigate(userUrl+'/play/rimworld/?lang=en');await waitFor("document.querySelectorAll('[data-testid=community-item]').length===1");assert(!await evaluate("Boolean(document.querySelector('[data-action=edit]'))"),'Other guest can edit');
 await evaluate("document.querySelector('[data-action=report]').click();var f=document.querySelector('[data-form=report]');f.elements.reason.value='검토가 필요합니다.';f.requestSubmit();");await waitFor("document.querySelector('[data-form=report]').hidden");
 await navigate(userUrl+'/play/ftl/?lang=en');assert(await count()===0,'Game posts leaked across games');results.push({scope:'reader',ownerIsolation:true,report:true,gameIsolation:true});
 await send('Page.navigate',{url:adminUrl+'/?lang=en'});await waitFor("document.querySelector('#login-form')");
 await evaluate(`document.querySelector('#username').value='test-admin';document.querySelector('#password').value=${JSON.stringify(password)};document.querySelector('#login-form').requestSubmit();`);
 await waitFor(`document.querySelector('[data-post-id="${suggestionId}"]')`);
 assert(await evaluate(`document.querySelector('[data-post-id="${suggestionId}"]').textContent.includes('검토가 필요합니다.')`),'Report reason unavailable to admin');
 await evaluate(`var a=document.querySelector('[data-post-id="${suggestionId}"]');a.querySelector('select[name=status]').value='planned';a.querySelector('select').value='hidden';a.querySelector('form').requestSubmit();`);
 await waitFor(`document.querySelector('[data-post-id="${suggestionId}"] select').value==='hidden'&&!document.querySelector('[data-post-id="${suggestionId}"] button[type=submit]').disabled`);
 await evaluate("document.querySelector('#community').scrollIntoView({behavior:'instant',block:'start'})");await delay(400);await capture('admin');
 await navigate(userUrl+'/play/rimworld/?lang=en');assert(await count()===0,'Hidden post visible');
 await send('Page.navigate',{url:adminUrl+'/?lang=en'});await waitFor(`document.querySelector('[data-post-id="${suggestionId}"]')`);
 await evaluate(`var a=document.querySelector('[data-post-id="${suggestionId}"]');a.querySelector('select').value='visible';a.querySelector('form').requestSubmit();`);await waitFor(`document.querySelector('[data-post-id="${suggestionId}"] select').value==='visible'&&!document.querySelector('[data-post-id="${suggestionId}"] button[type=submit]').disabled`);
 await navigate(userUrl+'/play/rimworld/?lang=en');await waitFor("document.querySelector('.community-status.status-planned')");
 results.push({scope:'moderation',reportReason:true,hidden:true,restored:true,status:'planned'});

}catch(error){results.push({scope:'fatal',error:error.stack});process.exitCode=1;}
finally{fs.writeFileSync(path.join(reportDir,'local-community-browser.json'),JSON.stringify({at:new Date().toISOString(),results,errors},null,2));console.log(JSON.stringify({passed:results.filter(x=>!x.error).length,failed:results.filter(x=>x.error).length,errors:errors.length}));if(results.some(x=>x.error)||errors.length)process.exitCode=1;socket?.close();for(const server of [user,admin])if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await app?.close();if(chrome)await new Promise(r=>{chrome.once('exit',r);if(chrome.exitCode!==null||!chrome.kill())r();});fs.rmSync(temp,{recursive:true,force:true,maxRetries:5,retryDelay:150});}
