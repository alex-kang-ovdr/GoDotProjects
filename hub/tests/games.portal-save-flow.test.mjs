import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';

// Run the real portal functions with a small transport/DOM adapter. This is not
// a browser test: layout, iframe rendering and native UI remain E2E checks.
class Storage {
  getItem(key){return Object.hasOwn(this,key)?this[key]:null;}
  setItem(key,value){this[key]=String(value);}
  removeItem(key){delete this[key];}
}
class Element {
  constructor(){this.dataset={};this.hidden=false;this.disabled=false;this.textContent='';this.style={};this.classList={toggle(){},add(){}};this.children=[];this.listeners={};}
  addEventListener(name,fn){this.listeners[name]=fn;}
  append(...items){this.children.push(...items);}
  replaceChildren(...items){this.children=items;}
  querySelector(){return new Element();}
  querySelectorAll(){return [];}
  setAttribute(){}
  remove(){this.removed=true;}
  close(){this.open=false;}
  showModal(){this.open=true;}
  scrollIntoView(){}
}
function setup(){
  const elements=new Map();
  const winListeners={};
  const context={console,URL,URLSearchParams,Uint8Array,AbortController,Blob,MessageChannel,crypto:webcrypto,performance:{now:()=>1000},IntersectionObserver:class{observe(){}disconnect(){}},sessionStorage:new Storage(),localStorage:new Storage(),setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},addEventListener(name,fn){(winListeners[name]??=[]).push(fn);},confirm:()=>true,scrollTo(){},location:{hostname:'localhost',protocol:'http:',origin:'http://localhost:8080',pathname:'/',search:''},history:{pushState(){}},fetch:()=>{throw new Error('Unexpected fetch');},document:{hidden:false,getElementById(id){if(!elements.has(id))elements.set(id,new Element());return elements.get(id);},querySelectorAll(){return [];},querySelector(){return new Element();},createElement(){return new Element();},createTextNode(value){return value;},addEventListener(){},contains:()=>true,documentElement:new Element(),head:new Element()}};
  context.window=context;vm.createContext(context);
  vm.runInContext(readFileSync(new URL('../web/user/contracts.js',import.meta.url),'utf8'),context);
  let source=readFileSync(new URL('../web/user/app.js',import.meta.url),'utf8');
  const boot=/^  init\(\)\.catch\(.*$/m;assert.match(source,boot);
  source=source.replace(boot,'  window.portalTest={state,setSession,cacheSet,cacheGet,writeSave,loadSave,applySessionChange,restoreRecord,archiveTab,refreshConnection,applyTabSave,useServerSave,removeSavedSlot,normalizeGame,cardMarkup,isPublicGame,startPlay,renderCreator,renderDefaultRoute:renderRoute}; renderRoute=async()=>{};');
  vm.runInContext(source,context);
  const portal=context.portalTest;portal.setSession({kind:'guest',csrfToken:'session-A',googleEnabled:false});
  function active(extra={}){const a={id:'play-1',game:{id:'slide-puzzle',title:'Slide'},epoch:portal.state.sessionEpoch,cacheScope:portal.state.cacheScope,local:false,port:null,closed:false,saveBlocked:false,resolving:false,dirty:false,revision:2,etag:'"r2"',saveChain:Promise.resolve(),hostPending:new Map(),iframe:new Element(),ready:false,failed:false,activeMs:0,lastTick:1000,...extra};portal.state.active=a;return a;}
  return {context,portal,active,elements,winListeners};
}
const payload=score=>({gameId:'slide-puzzle',schemaVersion:1,state:{score,elapsed:10,status:'playing'}});
const response=(status,data,etag=null)=>({ok:status>=200&&status<300,status,headers:{get:()=>etag},json:async()=>data});

test('only a manifest opting into pointer lock grants it to the opaque game iframe',async()=>{
  for(const permission of [true,false,undefined,'true']){
    const {context,portal}=setup();
    const id='harbor-run';portal.state.allMetadata.set(id,{capabilities:{pointerLock:permission}});
    context.fetch=async()=>response(200,{id:'play-test',gameId:id,kind:'guest'});
    const game=portal.normalizeGame({id,title:'Harbor Run',enabled:true,pointerLock:true});
    await portal.startPlay(game);
    assert.ok(portal.state.active,'game session should start');
    const permissions=portal.state.active.iframe.sandbox.split(' ');
    assert.equal(permissions.includes('allow-pointer-lock'),permission===true);
    assert.deepEqual(permissions.filter(value=>value!=='allow-pointer-lock'),['allow-scripts']);
  }
});

test('public cards render the API or static-manifest release date and hide expired badges',()=>{
  const {context,portal}=setup();
  vm.runInContext("Date.now=()=>Date.parse('2026-11-17T00:00:00Z')",context);
  portal.state.locale='en';
  const id='slide-puzzle';
  portal.state.allMetadata.set(id,{updatedOn:'2026-11-17'});
  const fromManifest=portal.cardMarkup(portal.normalizeGame({id,enabled:true}));
  assert.match(fromManifest, /class="card-update">.*datetime="2026-11-17" data-no-translate>Nov 17, 2026<\/time>/);
  const fromApi=portal.cardMarkup(portal.normalizeGame({id,enabled:true,updatedOn:'2026-11-03'}));
  assert.match(fromApi, /class="card-update" hidden>.*datetime="2026-11-03"/);
  assert.doesNotMatch(portal.cardMarkup(portal.normalizeGame({id,updatedOn:'2026-11-31'})), /<time /);
  assert.equal(portal.isPublicGame({id,enabled:false}),false);
  const newCard=portal.cardMarkup(portal.normalizeGame({id,enabled:true,publishedOn:'2026-11-16'}));
  assert.match(newCard, /class="card-new"><span class="card-new-label">New<\/span><time datetime="2026-11-16"/);
  assert.match(newCard, /class="card-update" hidden>/);
});

test('the default route shows the whole catalog and its filters without an all-games button',async()=>{
  const {portal,elements}=setup();
  portal.state.games=Array.from({length:10},(_,index)=>portal.normalizeGame({id:'game-'+index}));
  await portal.renderDefaultRoute();
  const home=elements.get('app').innerHTML;
  assert.equal((home.match(/data-testid="game-card"/g)||[]).length,10);
  assert.match(home,/전체 게임/);
  assert.match(home,/id="browse-filters"/);
  assert.doesNotMatch(home,/모든 게임 보기/);
});

test('a 412 blocks remote writes but keeps the latest subsequent local progress',async()=>{
  const {context,portal,active}=setup(),a=active();let requests=0;
  context.fetch=async()=>{requests++;return response(412,{error:{code:'SAVE_REVISION_CONFLICT'}});};
  await assert.rejects(portal.writeSave(a,payload(10)),e=>e.code==='SAVE_CONFLICT');
  assert.equal(a.saveBlocked,true);assert.equal(portal.cacheGet('slide-puzzle').value.state.score,10);
  await assert.rejects(portal.writeSave(a,payload(40)),e=>e.code==='SAVE_CONFLICT');
  assert.equal(requests,1);assert.equal(portal.cacheGet('slide-puzzle').value.state.score,40);assert.equal(portal.cacheGet('slide-puzzle').dirty,true);
});
test('temporary transport failure retries the same conditional write and idempotency key',async()=>{
  const {context,portal,active}=setup(),a=active(),calls=[];
  context.fetch=async(url,options)=>{calls.push({url,options});if(calls.length===1)throw new Error('offline');return response(200,{revision:3,payload:payload(50)},'"r3"');};
  const result=await portal.writeSave(a,payload(50));
  assert.equal(result.local,false);assert.equal(a.revision,3);assert.equal(a.dirty,false);
  assert.equal(calls[0].options.headers['Idempotency-Key'],calls[1].options.headers['Idempotency-Key']);
  assert.equal(calls[1].options.headers['If-Match'],'"r2"');assert.equal(calls[1].options.headers['X-CSRF-Token'],'session-A');
  assert.equal(portal.cacheGet('slide-puzzle').dirty,false);
});
test('loading divergent temporary progress preserves it and blocks main overwrite',async()=>{
  const {context,portal,active}=setup(),a=active();portal.cacheSet('slide-puzzle',payload(75),2,true);
  let headers;context.fetch=async(_,options)=>{headers=options.headers;return response(200,{revision:5,payload:payload(100)},'"r5"');};
  const result=await portal.loadSave(a);
  assert.equal(result.value.state.score,75);assert.equal(result.local,true);assert.equal(a.saveBlocked,true);assert.equal(a.revision,2);
  assert.equal(headers['X-CSRF-Token'],'session-A');assert.equal(portal.cacheGet('slide-puzzle').value.state.score,75);
});
test('temporary progress with a matching base revision can resume conditionally',async()=>{
  const {context,portal,active}=setup(),a=active();portal.cacheSet('slide-puzzle',payload(90),2,true);
  context.fetch=async()=>response(200,{revision:2,payload:payload(10)},'"r2"');
  const result=await portal.loadSave(a);assert.equal(result.value.state.score,90);assert.equal(a.saveBlocked,false);assert.equal(a.dirty,true);
});
test('an in-flight response cannot recreate an old account cache after session rotation',async()=>{
  const {context,portal,active}=setup(),a=active(),oldScope=a.cacheScope;let resolveFetch;
  context.fetch=()=>new Promise(resolve=>{resolveFetch=resolve;});
  const pending=portal.writeSave(a,payload(60));await Promise.resolve();await Promise.resolve();
  assert.equal(typeof resolveFetch,'function');portal.setSession({kind:'registered',csrfToken:'session-B',displayName:'Other',googleEnabled:true});
  resolveFetch(response(200,{revision:3,payload:payload(60)},'"r3"'));
  await assert.rejects(pending,e=>e.code==='SESSION_CHANGED');
  assert.equal(portal.cacheGet('slide-puzzle',false,oldScope),null);assert.equal(portal.cacheGet('slide-puzzle'),null);
});
test('an observed session change closes the old game without sending writes or events',async()=>{
  const {context,portal,active}=setup(),a=active();portal.cacheSet('slide-puzzle',payload(10),2,true);let calls=0;context.fetch=async()=>{calls++;throw new Error('Unexpected write');};
  await portal.applySessionChange({kind:'anonymous',csrfToken:'session-new',googleEnabled:false});
  assert.equal(calls,0);assert.equal(a.closed,true);assert.equal(a.iframe.removed,true);assert.equal(portal.state.active,null);assert.equal(portal.cacheGet('slide-puzzle'),null);assert.equal(portal.state.session.csrfToken,'session-new');
});
test('restore transport retains expected source/main revisions and a retry idempotency key',async()=>{
  const {context,portal}=setup(),calls=[],m={game:{id:'slide-puzzle'},server:{mainRevision:4},restoreAttempt:null};
  context.fetch=async(url,options)=>{calls.push({url,options});if(calls.length===1)throw new Error('timeout');return response(200,{revision:5,payload:payload(30)},'"r5"');};
  await portal.restoreRecord(m,{slot:'guest-copy',revision:2});
  assert.equal(calls[1].options.method,'POST');assert.deepEqual(JSON.parse(calls[1].options.body),{sourceSlot:'guest-copy',expectedSourceRevision:2,expectedMainRevision:4});
  assert.equal(calls[0].options.headers['Idempotency-Key'],calls[1].options.headers['Idempotency-Key']);
});
test('local game saves never call the API and remain available for explicit import',async()=>{
  const {context,portal,active}=setup(),a=active({local:true,cacheScope:'local-scope',revision:0});context.fetch=async()=>{throw new Error('No request allowed');};
  const result=await portal.writeSave(a,payload(99));assert.equal(result.local,true);assert.equal(portal.cacheGet('slide-puzzle',false,'local-scope').value.state.score,99);assert.equal(portal.cacheGet('slide-puzzle',false,'local-scope').dirty,true);
});
test('reconnection with blocked cookies does not terminate or clear an active local game',async()=>{
  const {context,portal,active}=setup(),a=active({local:true,cacheScope:'local-scope',revision:0});portal.state.limited=true;portal.state.session.kind='anonymous';portal.cacheSet('slide-puzzle',payload(88),0,true,false,'local-scope');let n=0;
  context.fetch=async url=>url.endsWith('/api/session')?response(200,{kind:'anonymous',csrfToken:'unstored-'+(++n),googleEnabled:false}):response(200,{games:[{id:'slide-puzzle'}]});
  await portal.refreshConnection(true);
  assert.equal(portal.state.active,a);assert.equal(a.closed,false);assert.equal(portal.state.limited,true);assert.equal(portal.cacheGet('slide-puzzle',false,'local-scope').value.state.score,88);
});
function saveManager(portal,a){const tab={gameId:'slide-puzzle',value:payload(70),baseRevision:2,updatedAt:1000,scope:a.cacheScope,backup:false,dirty:true};portal.cacheSet('slide-puzzle',tab.value,2,true);const m={game:a.game,epoch:portal.state.sessionEpoch,tab,server:{mainRevision:2,slotLimit:10,slots:[],backups:[]},busy:false,archive:null,restoreAttempt:null};portal.state.saveManager=m;a.resolving=true;return m;}
function handleAuxiliary(url,options){if(url.endsWith('/api/session'))return response(200,{kind:'guest',csrfToken:'session-A',googleEnabled:false});if(url.endsWith('/api/events'))return response(200,{accepted:JSON.parse(options.body).events.map(e=>e.event_id)});if(url.endsWith('/api/play-sessions'))return response(201,{id:'play-new',gameId:'slide-puzzle',kind:'guest'});throw new Error('Unexpected request '+url);}
test('keep-tab action archives first, conditionally restores main, then reloads the game',async()=>{
  const {context,portal,active}=setup(),a=active(),m=saveManager(portal,a),writes=[];
  context.fetch=async(url,options)=>{if(options.method==='PUT'){writes.push({operation:'archive',body:JSON.parse(options.body),headers:options.headers});return response(201,{revision:1});}if(url.endsWith('/restore')){writes.push({operation:'restore',body:JSON.parse(options.body)});return response(200,{slot:'main',revision:3,schemaVersion:1,payload:m.tab.value},'"r3"');}return handleAuxiliary(url,options);};
  await portal.applyTabSave(true);
  assert.deepEqual(writes.map(x=>x.operation),['archive','restore']);assert.equal(writes[0].headers['If-None-Match'],'*');assert.equal(writes[1].body.expectedMainRevision,2);assert.equal(writes[1].body.expectedSourceRevision,1);
  assert.equal(a.closed,true);assert.equal(portal.state.saveManager,null);assert.equal(portal.state.active.id,'play-new');assert.equal(portal.cacheGet('slide-puzzle').value.state.score,70);assert.equal(portal.cacheGet('slide-puzzle').dirty,false);
});
test('restore conflict leaves the new archive, current iframe and temporary progress intact',async()=>{
  const {context,portal,active,elements}=setup(),a=active(),m=saveManager(portal,a);let archives=0;
  context.fetch=async(url,options)=>{if(options.method==='PUT'){archives++;return response(201,{revision:1});}if(url.endsWith('/restore'))return response(412,{error:{code:'SAVE_REVISION_CONFLICT'}});return handleAuxiliary(url,options);};
  await portal.applyTabSave(true);
  assert.equal(archives,1);assert.equal(m.archive.revision,1);assert.equal(portal.state.active,a);assert.equal(a.closed,false);assert.equal(portal.cacheGet('slide-puzzle').value.state.score,70);assert.equal(portal.cacheGet('slide-puzzle').dirty,true);assert.match(elements.get('saves-error').textContent,/보존/);
});
test('choosing server main keeps unsynchronized tab progress as a separate temporary backup',async()=>{
  const {context,portal,active}=setup(),a=active();saveManager(portal,a);
  context.fetch=async(url,options)=>url.includes('?slot=main')?response(200,{slot:'main',revision:2,schemaVersion:1,payload:payload(20)},'"r2"'):handleAuxiliary(url,options);
  await portal.useServerSave();
  assert.equal(portal.cacheGet('slide-puzzle').value.state.score,20);assert.equal(portal.cacheGet('slide-puzzle').dirty,false);assert.equal(portal.cacheGet('slide-puzzle',true).value.state.score,70);assert.equal(a.closed,true);
});
test('removing an additional slot sends its revision and refreshes recoverable backup metadata',async()=>{
  const {context,portal,active}=setup(),a=active(),m=saveManager(portal,a),calls=[];
  context.fetch=async(url,options)=>{calls.push({url,options});if(options.method==='DELETE')return response(200,{ok:true,deletedSlot:'guest-copy',previousBackupId:'deleted-backup'});if(url.endsWith('/slots'))return response(200,{mainRevision:2,slotLimit:10,slots:[],backups:[{id:'deleted-backup',sourceSlot:'guest-copy',revision:4,schemaVersion:1,reason:'slot_deleted',createdAt:'2026-11-16T00:00:00Z'}]});throw new Error('Unexpected request');};
  await portal.removeSavedSlot({slot:'guest-copy',revision:4});
  assert.equal(calls[0].options.method,'DELETE');assert.equal(calls[0].options.headers['If-Match'],'"r4"');assert.equal(calls[0].options.headers['X-CSRF-Token'],'session-A');assert.equal(m.server.backups[0].reason,'slot_deleted');assert.equal(a.closed,false);
});
test('the save manager never offers deletion of main through its action handler',async()=>{
  const {context,portal,active,elements}=setup(),a=active();saveManager(portal,a);let calls=0;context.fetch=async()=>{calls++;throw new Error('Unexpected');};
  await portal.removeSavedSlot({slot:'main',revision:2});assert.equal(calls,0);assert.match(elements.get('saves-error').textContent,/제거할 수 없습니다/);
});
test('sameSession separates principal identity from csrfToken rotation and anonymous-to-guest promotion',()=>{
  const {context}=setup();
  const {sameSession}=context.PortalRules;
  assert.equal(sameSession({kind:'guest',sessionId:'s1',principalKey:'p1',csrfToken:'c1'},{kind:'guest',sessionId:'s1',principalKey:'p1',csrfToken:'c2'}),true);
  assert.equal(sameSession({kind:'anonymous',sessionId:'s1',principalKey:null,csrfToken:'c1'},{kind:'guest',sessionId:'s1',principalKey:'p1',csrfToken:'c1'}),true);
  assert.equal(sameSession({kind:'guest',sessionId:'s1',principalKey:'p1',csrfToken:'c1'},{kind:'registered',sessionId:'s2',principalKey:'p2',csrfToken:'c2'}),false);
  assert.equal(sameSession({kind:'guest',sessionId:'s1',principalKey:'p1',csrfToken:'c1'},{kind:'anonymous',sessionId:'s2',principalKey:null,csrfToken:'c2'}),false);
});
test('renderBrowse sorts by displayed localized title in English mode',async()=>{
  const {context,portal,elements}=setup();
  context.PlayHubLocale={translate:v=>({'지뢰 찾기':'Mines Grid','블록 드롭':'Block Drop','슬라이드 나인':'Slide Nine'}[v]||v)};
  context.location.search='?view=browse&sort=title';
  portal.state.locale='en';portal.state.view='library';portal.state.sort='title';
  portal.state.games=[
    portal.normalizeGame({id:'mines-grid',title:'지뢰 찾기',enabled:true}),
    portal.normalizeGame({id:'slide-puzzle',title:'슬라이드 나인',enabled:true}),
    portal.normalizeGame({id:'falling-blocks',title:'블록 드롭',enabled:true})
  ];
  await portal.renderDefaultRoute();
  const html=elements.get('app').innerHTML;
  const order=[...html.matchAll(/data-game-id="([^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual(order,['falling-blocks','mines-grid','slide-puzzle']);
});
test('renderCreator adapts sign-in prompt to enabled auth providers when Google is disabled',()=>{
  const {portal,elements}=setup();
  portal.setSession({kind:'guest',csrfToken:'session-A',googleEnabled:false,naverEnabled:false,emailEnabled:true});
  portal.renderCreator();
  const html=elements.get('app').innerHTML;
  assert.match(html,/이메일/);
  assert.doesNotMatch(html,/PlayHub에서 Google로 로그인하세요/);
  assert.doesNotMatch(html,/Google 계정으로 연결됩니다/);
});
test('fatal runtime_error prevents Hub from marking a failed game ready',async()=>{
  const {context,portal,active,elements,winListeners}=setup();
  const a=active({nonce:'a'.repeat(32),requestWindow:0,requestCount:0,inFlight:0});
  let initPort=null;
  a.iframe.contentWindow={postMessage(msg,_target,ports){if(msg.type==='playhub:init')initPort=ports[0];}};
  context.fetch=async()=>response(202,{accepted:[],duplicates:[],rejected:[]});
  for(const fn of winListeners.message||[])fn({source:a.iframe.contentWindow,origin:'null',data:{type:'playhub:connect',version:1,nonce:a.nonce}});
  assert.ok(initPort,'MessageChannel port should be transferred');
  const replies=[];
  initPort.onmessage=e=>replies.push(e.data);
  initPort.start();
  initPort.postMessage({id:'e1',type:'event',payload:{name:'runtime_error',properties:{code:'GODOT_MISSING_FEATURES',message:'WebGL2 missing',fatal:true}}});
  initPort.postMessage({id:'r1',type:'ready',payload:{version:1}});
  await new Promise(r=>setTimeout(r,50));
  initPort.close();
  a.port.close();
  assert.equal(a.failed,true);
  assert.equal(a.ready,false);
  assert.match(elements.get('save-indicator').textContent,/실행할 수 없습니다/);
  assert.equal(portal.state.events.some(e=>e.event_name==='runtime_error'),true);
  assert.equal(portal.state.events.some(e=>e.event_name==='game_ready'),false);
});
