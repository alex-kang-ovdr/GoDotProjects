import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// A DOM/canvas interface harness validates the real app controller and generated UI.
// It does not substitute for browser layout, accessibility or touch-device testing.
test('application integrates campaign setup, day jobs, scouting, encounters, barter and recovery',async t=>{
 const listeners=new Map(),nodes=new Map(),canvasListeners=new Map(),store=new Map();
 const original={document:globalThis.document,window:globalThis.window,localStorage:globalThis.localStorage,OffscreenCanvas:globalThis.OffscreenCanvas,requestAnimationFrame:globalThis.requestAnimationFrame,setTimeout:globalThis.setTimeout,error:console.error,performance:globalThis.performance};
 t.after(()=>{for(const [key,value]of Object.entries(original))if(key!=='error')globalThis[key]=value;console.error=original.error;});
 const listen=(map,key,fn)=>{const list=map.get(key)||[];list.push(fn);map.set(key,list)};
 const dispatch=(key,event)=>{for(const fn of listeners.get(key)||[])fn(event)};
 function element(id=''){
  return {id,dataset:{},style:{},innerHTML:'',textContent:'',hidden:false,disabled:false,open:false,classList:{add(){},remove(){},toggle(){}},setAttribute(){},appendChild(){},remove(){},click(){},matches(){return false},showModal(){this.open=true},close(){this.open=false},addEventListener:(n,f)=>listen(listeners,id+':'+n,f)};
 }
 function canvas(){
  const c=element();c.width=1280;c.height=720;c.getBoundingClientRect=()=>({left:0,top:0,width:1280,height:720});
  const ctx=new Proxy({canvas:c,measureText:s=>({width:String(s).length*7}),createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}}),createPattern:()=>null},{get:(obj,key)=>key in obj?obj[key]:()=>{}});
  c.getContext=()=>ctx;c.removeEventListener=()=>{};return c;
 }
 for(const match of readFileSync(new URL('../dist/index.html',import.meta.url),'utf8').matchAll(/id="([^"]+)"/g))nodes.set(match[1],element(match[1]));
 const gameCanvas=canvas();gameCanvas.addEventListener=(n,f)=>listen(canvasListeners,n,f);nodes.set('game-canvas',gameCanvas);
 globalThis.OffscreenCanvas=class{constructor(){return canvas()}};
 globalThis.window={devicePixelRatio:1,addEventListener:(n,f)=>listen(listeners,'window:'+n,f),removeEventListener(){}};
 globalThis.document={hidden:false,documentElement:{dataset:process.env.LAST_LIGHT_TEST_OFFLINE?{offline:'true'}:{}},getElementById:id=>{assert(nodes.has(id),'missing HTML id: '+id);return nodes.get(id)},createElement:tag=>tag==='canvas'?canvas():element(),querySelectorAll:()=>[],addEventListener:(n,f)=>listen(listeners,n,f)};
 globalThis.localStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)};
 globalThis.setTimeout=()=>0;
 let raf,now=performance.now();globalThis.performance={now:()=>now};globalThis.requestAnimationFrame=fn=>{raf=fn};
 const errors=[];console.error=(...args)=>errors.push(args.map(String).join(' '));
 if(process.env.LAST_LIGHT_TEST_OFFLINE){
  const html=readFileSync(new URL('../dist/last-light.html',import.meta.url),'utf8');
  const script=html.match(/<script>\n([\s\S]*?)\n<\/script>/)?.[1];assert(script,'standalone script exists');
  new vm.Script(script,{filename:'last-light.html'}).runInThisContext();
 }else await import('../dist/app.js');
 const tick=(count=1)=>{for(let i=0;i<count;i++){now+=100;raf(now)}};
 function click(action,data={}){
  const button={dataset:{action,...data},disabled:false,closest:()=>button};dispatch('click',{target:button});tick();assert.deepEqual(errors,[]);
 }
 const saved=()=>JSON.parse(store.get('last-light-campaign-v1'));
 assert(nodes.get('dialog-content').innerHTML.includes('마지막 불빛을 지켜'));
 click('close-dialog');click('day-action',{id:'cook'});click('day-action',{id:'cook'});
 assert.deepEqual(saved().state.characters[0].queue,['cook']);
 assert(nodes.get('action-panel').innerHTML.includes('job-queue'));
 click('select-character',{id:'yun'});click('category',{id:'build'});click('day-action',{id:'buildCollector'});
 click('end-day');assert.equal(saved().state.phase,'planning');assert.equal(saved().state.inventory.meal,7);
 assert(nodes.get('dialog-content').innerHTML.includes('우리의 방어력'));
 assert(nodes.get('dialog-content').innerHTML.includes('미방문'));
 click('plan-role',{id:'leo',role:'scavenge'});click('begin-night');
 const ex=saved().expedition,box=ex.loot.find(l=>l.floor===0&&!l.locked&&!l.owned);
 for(const fn of canvasListeners.get('click'))fn({clientX:box.x,clientY:580});tick(65);
 assert(nodes.get('action-panel').innerHTML.includes('가능한 만큼 담기'));
 click('take-all',{loot:box.id});assert(saved().expedition.bag.wood>0);
 click('return-home');tick(80);click('save-now');assert.equal(saved().state.phase,'report');
 click('next-day');assert.equal(saved().state.day,2);assert.equal(saved().state.paused,true);
 click('visitor');assert(nodes.get('dialog-content').innerHTML.includes('내가 건넬 물자'));assert(nodes.get('dialog-content').innerHTML.includes('가져올 물자'));
 click('barter-count',{id:'parts',side:'give',delta:'1'});click('barter-count',{id:'parts',side:'give',delta:'1'});click('barter-count',{id:'water',side:'receive',delta:'1'});click('barter-commit');assert(saved().state.stats.trades>0);
 click('close-dialog');click('settings');assert(nodes.get('dialog-content').innerHTML.includes(process.env.LAST_LIGHT_TEST_OFFLINE?'단일 HTML 실행 버전':'단일 HTML 실행 파일'));
 click('close-dialog');click('select-character',{id:'mira'});click('day-action',{id:'cook'});tick(10);click('settings');click('restore-dawn');click('confirm-dawn');assert.equal(saved().state.day,2);assert.equal(saved().state.clock,360);assert(saved().state.characters.every(c=>!c.job));
 click('end-day');for(const id of ['mira','yun','leo'])click('plan-role',{id,role:'sleep'});click('begin-night');assert.equal(saved().state.phase,'report');click('next-day');assert.equal(saved().state.day,3);assert.deepEqual(errors,[]);
 const imported=saved();imported.state.characters[0].name='<img src=x>';
 const file={size:1000,text:async()=>JSON.stringify(imported)},event={target:{files:[file],value:'save.json'}};
 await listeners.get('save-input:change')[0](event);tick();
 assert(nodes.get('characters').innerHTML.includes('&lt;img src=x&gt;'));assert(!nodes.get('characters').innerHTML.includes('<img src=x>'));
 click('select-character',{id:'yun'});click('character');assert(nodes.get('dialog-content').innerHTML.includes('&lt;img src=x&gt;'));assert(!nodes.get('dialog-content').innerHTML.includes('<img src=x>'));assert.deepEqual(errors,[]);
 // New-campaign setup is the same UI flow in the module and standalone builds.
 click('close-dialog');click('settings');click('confirm-new');
 assert(nodes.get('dialog-content').innerHTML.includes('생존 난이도'));
 click('choose-difficulty',{id:'siege'});
 dispatch('input',{target:{dataset:{input:'campaign-seed'},value:'4294967296'}});
 click('begin-campaign');assert.equal(saved().state.day,3,'invalid seed keeps the existing run');
 dispatch('input',{target:{dataset:{input:'campaign-seed'},value:'81'}});
 click('begin-campaign');assert.equal(saved().state.seed,81);assert.equal(saved().state.difficulty,'siege');
 assert.equal(JSON.parse(store.get('last-light-dawn-v1')).state.difficulty,'siege');
 assert(nodes.get('guidance-panel').innerHTML.includes('문 내구도'));
 // Campaign goals use the same scheduler as ordinary work and show actual worker time.
 click('relief');assert(nodes.get('dialog-content').innerHTML.includes('대피 물자 봉인'));
 click('relief-person',{id:'yun'});assert(nodes.get('dialog-content').innerHTML.includes('80분 · 윤'));
 const beforeRadio=saved().state.inventory.parts;
 click('relief-action',{id:'buildRadio'});assert.equal(saved().state.inventory.parts,beforeRadio-5);assert.equal(saved().state.characters[1].job.actionId,'buildRadio');
 click('relief');assert(nodes.get('dialog-content').innerHTML.includes('작업 중'));click('close-dialog');
 click('end-day');assert(nodes.get('dialog-content').innerHTML.includes('습격 시 문 손상'));
 assert.equal(saved().state.facilities.radio,1);assert(nodes.get('relief-summary').innerHTML.includes('1 / 3'));
 click('loadout',{id:'parts',delta:'1'});click('loadout',{id:'parts',delta:'1'});
 click('begin-night');assert(nodes.get('action-panel').innerHTML.includes('스태미나'));
 assert(nodes.get('action-panel').innerHTML.includes('수색과 귀환 안내'));
 click('aim-distraction');click('save-now');const aimTime=saved().expedition.time;tick(15);click('save-now');assert.equal(saved().expedition.time,aimTime,'aiming pauses the expedition clock');
 const aimBag=saved().expedition.bag.parts;
 for(const fn of canvasListeners.get('click'))fn({clientX:102,clientY:580});tick();click('save-now');assert.equal(saved().expedition.bag.parts,aimBag,'too-close throw never charges a part');assert(saved().state.paused);
 dispatch('keydown',{key:'Escape',repeat:false,target:{matches:()=>false},preventDefault(){}});tick();click('save-now');assert.equal(saved().state.paused,false,'cancel returns to pre-aim playback');
 click('aim-distraction');for(const fn of canvasListeners.get('click'))fn({clientX:300,clientY:580});tick();click('save-now');
 assert.equal(saved().expedition.bag.parts,aimBag-1);assert.equal(saved().expedition.stats.distractions,1);assert(saved().expedition.distractionCooldown>0);assert.equal(saved().state.paused,false);
 click('toggle-minimap');assert.equal(JSON.parse(store.get('last-light-preferences-v1')).miniMap,false);click('toggle-minimap');
 click('dodge');assert(saved().expedition.player.stamina<100);
 // Multiple fingers on one direction retain movement until the final pointer releases.
 const directionButton={dataset:{move:'right'},closest:()=>directionButton,setPointerCapture(){}};
 const pointer=id=>({pointerId:id,target:directionButton,preventDefault(){}});
 dispatch('pointerdown',pointer(41));dispatch('pointerdown',pointer(42));const movingPanel=nodes.get('action-panel').innerHTML;tick(15);assert.notEqual(nodes.get('action-panel').innerHTML,movingPanel,'held movement keeps night HUD updating');
 dispatch('pointerup',pointer(41));click('save-now');const movingX=saved().expedition.player.x;tick(3);click('save-now');assert(saved().expedition.player.x>movingX);
 dispatch('pointercancel',pointer(42));click('save-now');const stoppedX=saved().expedition.player.x;tick(3);click('save-now');assert.equal(saved().expedition.player.x,stoppedX);

 click('help');click('save-now');const pauseTime=saved().expedition.time;tick(10);click('save-now');
 assert.equal(saved().expedition.time,pauseTime,'dialog pauses expedition time');click('close-dialog');
 // A legal day-two field snapshot tests the real resident dialog without test-only UI hooks.
 const Core=await import('../dist/engine.js'),Field=await import('../dist/expedition.js');
 const camp=Core.createGame(81);Core.endDay(camp);Core.beginNight(camp,{scavengerId:null,locationId:null,roles:{mira:'sleep',yun:'sleep',leo:'sleep'},loadout:{}});Core.finishNight(camp,{});Core.nextDay(camp);Core.endDay(camp);
 const departure=Core.beginNight(camp,{scavengerId:'leo',locationId:'clinic',roles:{mira:'sleep',yun:'guard',leo:'scavenge'},loadout:{water:3,meds:1,meal:2,parts:3,bandage:1}});assert(departure.ok);
 const field=Field.createExpedition(departure.context,camp);Field.moveTo(field,840,1);
 for(let i=0;i<500&&!(field.player.floor===1&&!field.player.climb&&Math.abs(field.player.x-840)<1);i++)Field.stepExpedition(field,.1,{});
 assert.equal(field.player.floor,1);if(!field.doors.find(d=>d.id==='clinic_ward_door').open)assert(Field.interact(field,{type:'door',id:'clinic_ward_door'}).ok);
 Field.moveTo(field,field.npcs[0].x-120,1);for(let i=0;i<80&&!Field.getEncounter(field);i++)Field.stepExpedition(field,.1,{});
 const enc=Field.getEncounter(field);assert(enc,'reachable clinic resident can converse');
 const {encodeSnapshot}=await import('../dist/saves.js');
 await listeners.get('save-input:change')[0]({target:{files:[{size:10000,text:async()=>encodeSnapshot(camp,field)}],value:'clinic.json'}});tick();
 const resident=field.npcs.find(n=>n.id===enc.npcId);
 for(const fn of canvasListeners.get('click'))fn({clientX:resident.x,clientY:410-34});tick();
 assert(nodes.get('dialog-content').innerHTML.includes(enc.title),'canvas opens resident dialogue');
 click('close-dialog');assert.equal(saved().state.paused,true,'canvas dialogue preserves a paused expedition');
 click('encounter',{id:enc.npcId});assert(nodes.get('dialog-content').innerHTML.includes('통행 요청 가능'));
 click('encounter-choice',{id:'request',npc:enc.npcId});
 assert(nodes.get('dialog-content').innerHTML.includes('통행 허락받음'));
 const afterRequest=Field.getEncounter(saved().expedition,enc.npcId),option=afterRequest.options.find(o=>o.id!=='request'&&o.available);assert(option,'carried supplies support a resident choice');
 click('encounter-choice',{id:option.id,npc:enc.npcId});
 assert(nodes.get('dialog-content').innerHTML.includes('나눔 허락받음'));
 assert(Field.getEncounter(saved().expedition,enc.npcId).resolved);
 click('close-dialog');click('evacuate');click('force-return');
 assert.equal(saved().state.phase,'report');assert(nodes.get('dialog-content').innerHTML.includes('은신처 재고 변화'));assert(nodes.get('dialog-content').innerHTML.includes('동료들이 보낸 밤'));
 const finished=Core.createGame(909);
 for(let i=0;i<12&&finished.phase!=='ended';i++){
  Core.endDay(finished);const roles=Object.fromEntries(finished.characters.filter(c=>c.alive).map(c=>[c.id,'sleep']));
  assert(Core.beginNight(finished,{scavengerId:null,locationId:null,roles,loadout:{}}).ok);assert(Core.finishNight(finished,{}).ok);assert(Core.nextDay(finished).ok);
 }
 assert.equal(finished.phase,'ended');
 await listeners.get('save-input:change')[0]({target:{files:[{size:10000,text:async()=>encodeSnapshot(finished)}],value:'ending.json'}});tick();
 assert(nodes.get('dialog-content').innerHTML.includes('epilogues'));
 click('confirm-new');tick(3);assert(nodes.get('dialog-content').innerHTML.includes('생존 환경 선택'),'ending allows new-campaign settings');
 click('close-dialog');assert(nodes.get('dialog-content').innerHTML.includes('epilogues'),'cancel returns to the ending');
 click('confirm-new');click('begin-campaign');assert.equal(saved().state.phase,'day');assert.equal(saved().state.day,1);
 const normalWrite=localStorage.setItem;let failedWrites=0;
 localStorage.setItem=()=>{failedWrites++;throw new Error('simulated quota');};
 click('save-now');const writesAfterAttempt=failedWrites;assert(writesAfterAttempt>0);tick(20);assert.equal(failedWrites,writesAfterAttempt,'failed save is not retried each frame');
 tick(40);assert.equal(failedWrites,writesAfterAttempt*2,'failed automatic saves still respect the five-second interval');localStorage.setItem=normalWrite;
 assert.deepEqual(errors,[]);
});
