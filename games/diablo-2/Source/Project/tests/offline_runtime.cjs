// Offline workflow checks against the complete built HTML. No browser is used.
// Event dispatch, Storage, Canvas and downloads are explicit test doubles.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {createRuntime,memoryStorage}=require('./create_test_runtime.cjs');
const root=path.resolve(process.argv[2]||path.join(__dirname,'..'));
const output=path.resolve(process.argv[3]||path.join(__dirname,'offline_results_v28_1.json'));
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const key=html.match(/const KEY='([^']+)'/)?.[1];assert(key,'Built save key not found');const backup=key+'.backup',damaged=key+'.damaged';
const runtimes=[],results=[];
function runtime(options={}){const r=createRuntime(root,{eventful:true,...options});runtimes.push(r);return r;}
function q(rt){return rt.sandbox.DarkDescentQA;}
function same(a,b,message='values differ'){assert.equal(JSON.stringify(a),JSON.stringify(b),message);}
function writes(store){return store.calls.filter(c=>c.op==='set');}
function snapshot(rt){return JSON.stringify(q(rt).exportState());}
function state(raw){return JSON.parse(raw).state;}
function api(rt,name){assert.equal(typeof q(rt)[name],'function','Missing actual QA API '+name);return q(rt)[name];}
function validSave(hero,gold,seed){const rt=runtime({storage:memoryStorage().storage});assert(api(rt,'beginOfflineNew')(hero,seed));q(rt).S.p.gold=gold;return q(rt).export();}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
async function test(name,fn){const started=performance.now();try{const detail=await fn();results.push({name,pass:true,ms:Math.round(performance.now()-started),detail:detail??null});}catch(error){results.push({name,pass:false,ms:Math.round(performance.now()-started),error:error.stack});}}
function fakeGL(){return new Proxy({createShader:()=>({}),getShaderParameter:()=>true,createProgram:()=>({}),getProgramParameter:()=>true,createBuffer:()=>({}),getAttribLocation:()=>0,isContextLost:()=>false},{get:(t,k)=>k in t?t[k]:/^[A-Z_]+$/.test(String(k))?1:()=>{}});}
(async()=>{
 const primaryA=validSave('sorceress',54321,28001),priorB=validSave('druid',9876,28002),importC=validSave('amazon',2468,28003);
 await test('Existing v28 browser key and standalone resource contract stay intact',()=>{
  assert.equal(key,'dark-descent-xxviii','Offline UI must not silently abandon the v28 slot');
  const markup=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'');
  assert(!/<(?:script|img|iframe|audio|video|source)\b[^>]*\bsrc\s*=\s*["'](?:https?:|\/\/)/i.test(markup),'External resource source');
  assert(!/<link\b[^>]*\bhref\s*=\s*["'](?:https?:|\/\/)/i.test(markup),'External stylesheet');
  assert(!/<script\b[^>]*\bsrc\s*=/i.test(html),'Script is not embedded');
  for(const css of [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)])assert(!/@import\b|url\(\s*["']?(?:https?:|\/\/)/i.test(css[1]),'External CSS dependency');
  assert(markup.includes('id="offlineBootNote"'),'Readable initial boot note');assert(/<noscript\b/i.test(markup),'Scripts-disabled guidance');
 });
 await test('Boot inspects valid saves without writing or advancing a default character',()=>{
  const store=memoryStorage({[key]:primaryA,[backup]:priorB}),rt=runtime({storage:store.storage}),game=q(rt);
  assert.equal(game.offlineState.ready,false);assert.equal(game.paused,true);assert(rt.element('#offlineLauncher').open);assert.equal(rt.element('#offlineContinue').disabled,false);assert.equal(writes(store).length,0);
  const before=snapshot(rt),step=game.S.step;game.step(2701);api(rt,'inspectOfflineSlots')();same(snapshot(rt),before);assert.equal(game.S.step,step);assert.equal(store.values.get(key),primaryA);assert.equal(writes(store).length,0);
 });
 await test('Launcher blocks pause shortcut, movement and automatic saving until an explicit choice',()=>{
  const store=memoryStorage({[key]:primaryA}),rt=runtime({storage:store.storage}),before=snapshot(rt);
  rt.dispatch('window','keydown',{key:'p',code:'KeyP',target:rt.element('#hud')});rt.dispatch('#pause','click');rt.dispatch('window','keydown',{key:'d',code:'KeyD',target:rt.element('#hud')});q(rt).step(2701);
  assert.equal(q(rt).paused,true);same(snapshot(rt),before);assert.equal(q(rt).save(),false);assert.equal(writes(store).length,0);assert.equal(store.values.get(key),primaryA);
 });
 await test('Registered Continue button restores the real saved character without rewriting it',()=>{
  const store=memoryStorage({[key]:primaryA,[backup]:priorB}),rt=runtime({storage:store.storage});rt.dispatch('#offlineContinue','click');
  assert.equal(q(rt).offlineState.ready,true);assert.equal(q(rt).S.hero,'sorceress');assert.equal(q(rt).S.p.gold,54321);assert.equal(q(rt).S.runSeed,state(primaryA).runSeed);assert.equal(q(rt).S.rngState,state(primaryA).rngState);assert.equal(rt.element('#offlineLauncher').open,false);assert.equal(writes(store).length,0);
 });
 await test('Explicit new exploration uses the chosen class and protects the old slot until save',()=>{
  const store=memoryStorage({[key]:primaryA}),rt=runtime({storage:store.storage});rt.element('#offlineClass').value='assassin';rt.element('#offlineSeed').value='28011';rt.dispatch('#offlineNew','click');
  assert.equal(q(rt).S.hero,'assassin');assert.equal(q(rt).S.runSeed,28011);assert.equal(q(rt).offlineState.ready,true);assert.equal(store.values.get(key),primaryA);assert.equal(writes(store).length,0);
 });
 await test('Manual save backs up the previous valid primary before committing the candidate',()=>{
  const store=memoryStorage({[key]:primaryA,[backup]:priorB}),rt=runtime({storage:store.storage});api(rt,'continueOffline')('primary');q(rt).S.p.gold=55555;assert.equal(q(rt).save(),true);
  same(writes(store).map(x=>x.key),[backup,key]);assert.equal(store.values.get(backup),primaryA);assert.equal(state(store.values.get(key)).p.gold,55555);assert.equal(q(rt).offlineState.storage,'saved');
 });
 await test('A refused backup write leaves both existing slots untouched',()=>{
  const store=memoryStorage({[key]:primaryA,[backup]:priorB},{set(k){if(k===backup)throw Error('QuotaExceededError');}}),rt=runtime({storage:store.storage});api(rt,'continueOffline')('primary');q(rt).S.p.gold=55555;assert.equal(q(rt).save(),false);
  assert.equal(store.values.get(key),primaryA);assert.equal(store.values.get(backup),priorB);same(writes(store).map(x=>x.key),[backup]);assert.equal(q(rt).S.p.gold,55555);assert.match(rt.element('#offlineStatus').textContent,/JSON/);
 });
 await test('A refused primary commit retains the original primary and a valid previous copy',()=>{
  const store=memoryStorage({[key]:primaryA,[backup]:priorB},{set(k){if(k===key)throw Error('QuotaExceededError');}}),rt=runtime({storage:store.storage});api(rt,'continueOffline')('primary');q(rt).S.p.gold=55555;assert.equal(q(rt).save(),false);
  assert.equal(store.values.get(key),primaryA);assert.equal(store.values.get(backup),primaryA);assert.equal(q(rt).S.p.gold,55555);assert.equal(q(rt).offlineState.storage,'unavailable');
 });
 await test('Protected corrupt primary survives startup, new play and denied automatic save',()=>{
  const raw='{damaged save to preserve',store=memoryStorage({[key]:raw,[backup]:priorB}),rt=runtime({storage:store.storage});assert.equal(rt.element('#offlineContinue').disabled,true);assert.equal(q(rt).offlineState.writeBlocked,true);api(rt,'beginOfflineNew')('paladin',28);
  q(rt).step(2701);assert.equal(q(rt).save(),false);assert.equal(store.values.get(key),raw);assert.equal(writes(store).length,0);assert.equal(q(rt).offlineState.storage,'protected');
 });
 await test('Explicit damaged-save preservation writes the original before replacing the primary',()=>{
  const raw='{damaged save to preserve',store=memoryStorage({[key]:raw,[backup]:priorB}),rt=runtime({storage:store.storage});api(rt,'beginOfflineNew')('paladin',28);q(rt).S.p.gold=222;assert(api(rt,'preserveDamagedOffline')());
  same(writes(store).map(x=>x.key),[damaged,key]);assert.equal(store.values.get(damaged),raw);assert.equal(store.values.get(backup),priorB);assert.equal(state(store.values.get(key)).p.gold,222);
 });
 await test('Failed damaged-original preservation cannot overwrite the protected primary',()=>{
  const raw='{damaged save to preserve',store=memoryStorage({[key]:raw},{set(k){if(k===damaged)throw Error('QuotaExceededError');}}),rt=runtime({storage:store.storage});api(rt,'beginOfflineNew')('paladin',28);assert.equal(api(rt,'preserveDamagedOffline')(),false);assert.equal(store.values.get(key),raw);same(writes(store).map(x=>x.key),[damaged]);
 });
 await test('Explicit previous-save recovery preserves damaged original and restores the playable character',()=>{
  const raw='{damaged save to preserve',store=memoryStorage({[key]:raw,[backup]:priorB}),rt=runtime({storage:store.storage});assert(api(rt,'continueOffline')('backup'));assert.equal(q(rt).S.hero,'druid');assert.equal(q(rt).S.p.gold,9876);assert.equal(store.values.get(damaged),raw);assert.equal(state(store.values.get(key)).hero,'druid');assert.equal(store.values.get(backup),priorB);
 });
 for(const mode of ['getter','getItem','setItem'])await test(`Storage ${mode} rejection still permits memory-only play and visible JSON guidance`,()=>{
  const store=memoryStorage({},mode==='getItem'?{get(){throw Error('SecurityError');}}:mode==='setItem'?{set(){throw Error('QuotaExceededError');}}:{});
  const rt=runtime(mode==='getter'?{storageGetter(){throw Error('SecurityError');}}:{storage:store.storage});assert(api(rt,'beginOfflineNew')('paladin',29));const step=q(rt).S.step;q(rt).step(10);assert(q(rt).S.step>step);assert.equal(q(rt).save(),false);assert.match(rt.element('#offlineStatus').textContent,/JSON/);assert.equal(q(rt).offlineState.fatal,false);
 });
 await test('Registered physical-key movement works and modal editing cannot move the hero',()=>{
  const rt=runtime({storage:memoryStorage().storage});api(rt,'beginOfflineNew')('paladin',28031);const x=q(rt).S.p.x;
  rt.dispatch('window','keydown',{key:'ㅇ',code:'KeyD',target:rt.element('#hud')});q(rt).step(12);rt.dispatch('window','keyup',{key:'ㅇ',code:'KeyD',target:rt.element('#hud')});assert(q(rt).S.p.x>x,'Physical D code must move on a Korean keyboard');
  api(rt,'openOfflineTransfer')('import');const before=snapshot(rt);rt.dispatch('window','keydown',{key:'w',code:'KeyW',target:rt.element('#offlineJson')});rt.dispatch('window','keydown',{key:'p',code:'KeyP',target:rt.element('#offlineJson')});q(rt).step(20);same(snapshot(rt),before);assert.equal(q(rt).paused,true);assert(!q(rt).keys.w);
 });
 await test('Blur clears held movement and click destination before pausing',()=>{
  const rt=runtime({storage:memoryStorage().storage});api(rt,'beginOfflineNew')('paladin',28032);rt.dispatch('window','keydown',{key:'d',code:'KeyD',target:rt.element('#hud')});rt.dispatch('#hud','pointerdown',{clientX:600,clientY:312,button:0});assert(q(rt).pointer.down||q(rt).keys.d);rt.dispatch('window','blur');assert.equal(q(rt).paused,true);assert.equal(q(rt).pointer.down,false);assert.equal(q(rt).clickGoal,null);assert(!Object.values(q(rt).keys).some(Boolean));
 });
 for(const event of ['visibilitychange','pagehide'])await test(`${event} pauses, clears input and persists recent progress through the real listener`,()=>{
  const store=memoryStorage({[key]:primaryA}),rt=runtime({storage:store.storage});api(rt,'continueOffline')('primary');q(rt).S.p.gold=60000;rt.dispatch('window','keydown',{key:'d',code:'KeyD',target:rt.element('#hud')});
  if(event==='visibilitychange')rt.sandbox.document.hidden=true;rt.dispatch(event==='visibilitychange'?'document':'window',event);assert.equal(q(rt).paused,true);assert(!Object.values(q(rt).keys).some(Boolean));assert.equal(state(store.values.get(key)).p.gold,60000);assert.equal(store.values.get(backup),primaryA);
 });
 await test('Async local-file import pauses while reading and does not replace stored slots before explicit save',async()=>{
  const store=memoryStorage({[key]:primaryA}),rt=runtime({storage:store.storage});api(rt,'continueOffline')('primary');rt.dispatch('window','keydown',{key:'d',code:'KeyD',target:rt.element('#hud')});const pending=deferred(),job=api(rt,'importOfflineFile')({name:'save.json',size:importC.length,text:()=>pending.promise});
  assert.equal(q(rt).offlineState.busy,true);assert.equal(q(rt).paused,true);assert(!Object.values(q(rt).keys).some(Boolean));const before=snapshot(rt);q(rt).step(30);same(snapshot(rt),before);assert.equal(writes(store).length,0);pending.resolve(importC);assert.equal(await job,true);assert.equal(q(rt).S.hero,'amazon');assert.equal(q(rt).S.p.gold,2468);assert.equal(q(rt).paused,true);assert.equal(store.values.get(key),primaryA);assert.equal(writes(store).length,0);assert.equal(q(rt).save(),true);assert.equal(store.values.get(backup),primaryA);
 });
 await test('Invalid or unreadable file imports preserve all gameplay data and existing saved bytes',async()=>{
  const store=memoryStorage({[key]:primaryA}),rt=runtime({storage:store.storage});api(rt,'continueOffline')('primary');const before=snapshot(rt);
  assert.equal(await api(rt,'importOfflineFile')({size:4,text:async()=>'{bad'}),false);same(snapshot(rt),before);assert.equal(await api(rt,'importOfflineFile')({size:4,text:async()=>{throw Error('Read failed');}}),false);same(snapshot(rt),before);assert.equal(store.values.get(key),primaryA);assert.equal(writes(store).length,0);assert.match(rt.element('#offlineTransferMessage').textContent,/거부/);
 });
 await test('Oversize local files are refused before reading their contents',async()=>{
  const rt=runtime({storage:memoryStorage().storage});api(rt,'beginOfflineNew')('paladin',1);let reads=0;const before=snapshot(rt);assert.equal(await api(rt,'importOfflineFile')({size:20000001,text:async()=>{reads++;return importC;}}),false);assert.equal(reads,0);same(snapshot(rt),before);
 });
 await test('An older asynchronous file read cannot replace a later explicit new exploration',async()=>{
  const rt=runtime({storage:memoryStorage().storage});api(rt,'beginOfflineNew')('paladin',1);const pending=deferred(),job=api(rt,'importOfflineFile')({size:importC.length,text:()=>pending.promise});api(rt,'beginOfflineNew')('barbarian',321);const before=snapshot(rt);pending.resolve(importC);assert.equal(await job,false);same(snapshot(rt),before);assert.equal(q(rt).S.hero,'barbarian');assert.equal(q(rt).offlineState.busy,false);
 });
 await test('Registered JSON paste-import button uses the same validated migration path',()=>{
  const store=memoryStorage({[key]:primaryA}),rt=runtime({storage:store.storage});api(rt,'continueOffline')('primary');api(rt,'openOfflineTransfer')('import');rt.element('#offlineJson').value=importC;rt.dispatch('#offlineTextImport','click');assert.equal(q(rt).S.hero,'amazon');assert.equal(q(rt).S.p.gold,2468);assert.equal(q(rt).paused,true);assert.equal(store.values.get(key),primaryA);assert.equal(writes(store).length,0);
 });
 await test('JSON export requests a local Blob download and always leaves selectable backup text',async()=>{
  const rt=runtime({storage:memoryStorage().storage});api(rt,'beginOfflineNew')('sorceress',777);q(rt).S.p.gold=7777;const before=snapshot(rt);assert(api(rt,'exportOfflineBackup')());assert.equal(rt.downloads.length,1);assert.match(rt.downloads[0].name,/^dark_descent_sorceress_Lv1_.*\.json$/);const json=await rt.downloads[0].blob.text();assert.equal(state(json).p.gold,7777);assert.equal(rt.element('#offlineJson').value,json);assert.equal(rt.element('#offlineTransfer').open,true);same(snapshot(rt),before);rt.dispatch('#offlineSelectAll','click');assert.equal(rt.element('#offlineJson').selectionEnd,json.length);rt.flushTimers();assert(rt.revokedURLs.includes(rt.downloads[0].href));
 });
 await test('Denied download API leaves a usable JSON-text fallback and no uncaught exception',()=>{
  const rt=runtime({storage:memoryStorage().storage,downloadError:Error('Object URL unavailable')});api(rt,'beginOfflineNew')('paladin',55);const before=snapshot(rt);assert.equal(api(rt,'exportOfflineBackup')(),false);assert.equal(rt.downloads.length,0);assert.equal(state(rt.element('#offlineJson').value).hero,'paladin');assert.match(rt.element('#offlineTransferMessage').textContent,/복사/);assert.equal(rt.element('#offlineTransfer').open,true);same(snapshot(rt),before);assert.equal(q(rt).offlineState.fatal,false);
 });
 await test('Original damaged storage can be exported byte-for-byte without altering any slot',async()=>{
  const raw='{preserve this unreadable original',store=memoryStorage({[key]:raw}),rt=runtime({storage:store.storage});assert(api(rt,'exportStoredOffline')('primary'));assert.equal(rt.element('#offlineJson').value,raw);assert.equal(await rt.downloads[0].blob.text(),raw);assert.equal(store.values.get(key),raw);assert.equal(writes(store).length,0);
 });
 await test('Unavailable WebGL retains the playable 2D route instead of selecting an invalid mode',()=>{
  const rt=runtime({storage:memoryStorage().storage,webgl:Error('WebGL denied'),console:{...console,warn(){}}});api(rt,'beginOfflineNew')('paladin',1);assert.equal(q(rt).mode,'2d');assert.equal(api(rt,'toggleMode')(),false);assert.equal(q(rt).mode,'2d');q(rt).render();assert.equal(q(rt).offlineState.fatal,false);
 });
 await test('Context-loss event chooses 2D, clears input and leaves valid game data',()=>{
  const rt=runtime({storage:memoryStorage().storage,webgl:fakeGL()});api(rt,'beginOfflineNew')('paladin',1);assert.equal(q(rt).mode,'3d');const before=snapshot(rt);rt.dispatch('window','keydown',{key:'d',code:'KeyD',target:rt.element('#hud')});rt.dispatch('#view3d','webglcontextlost');assert.equal(q(rt).mode,'2d');assert.equal(q(rt).paused,true);assert(!Object.values(q(rt).keys).some(Boolean));assert.equal(rt.element('#mode').disabled,true);const now=q(rt).exportState(),old=JSON.parse(before);delete now.logs;delete old.logs;same(now,old);q(rt).render();assert.equal(q(rt).offlineState.fatal,false);
 });
 await test('An actual frame callback error becomes a stopped, readable fatal state',()=>{
  const rt=runtime({storage:memoryStorage().storage,canvasContext:()=>null,scheduleFrames:true,manualRender:false});rt.advanceFrames(1);assert.equal(q(rt).offlineState.fatal,true);assert.equal(q(rt).paused,true);assert.match(rt.element('#fatal').textContent,/JSON/);assert.equal(rt.element('#fatal').style.display,'block');
 });
 await test('All tested boot, save, input and backup paths attempted zero network requests',()=>{
  const attempts=runtimes.flatMap((r,index)=>r.networkAttempts.map(a=>({runtime:index,...a})));same(attempts,[]);return {runtimeInstances:runtimes.length,networkAttempts:0,networkAPIs:'fetch, XMLHttpRequest, WebSocket, EventSource, Worker, sendBeacon, serviceWorker.register denied before boot'};
 });
 const report={suite:'offline_runtime_v28_1',execution:'Node VM executing the unchanged built inline game. Eventful minimal DOM, memory/denied Storage, Canvas/WebGL, lifecycle and Blob-download test doubles. This is not a browser, layout, pixel, OS file-picker, actual download or file:// durability test.',node:process.version,htmlSHA256:crypto.createHash('sha256').update(html).digest('hex'),passed:results.filter(r=>r.pass).length,failed:results.filter(r=>!r.pass).length,total:results.length,results};
 fs.writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,failed:report.failed,total:report.total,output}));for(const result of results)if(!result.pass)console.log(result.name+'\n'+result.error);if(report.failed)process.exitCode=1;
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
