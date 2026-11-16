'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const E=require('../dist/engine.js');
const SAVE='breach_command_save_v1';
const PREF='breach_command_prefs_v1';
const copy=x=>JSON.parse(JSON.stringify(x));

// This harness exercises UI controllers and persistence, not browser layout.
function appHarness({save,prefs={},blockedKey}={}){
  const storage=new Map();
  if(save)storage.set(SAVE,JSON.stringify(save));
  storage.set(PREF,JSON.stringify({fast:true,...prefs}));
  const nodes=new Map(),listeners={},timers=[];
  function element(id){
    if(nodes.has(id))return nodes.get(id);
    const node={id,innerHTML:'',textContent:'',className:'',dataset:{},value:'',files:[],scrollLeft:0,scrollWidth:900,clientWidth:800,hidden:false,
      classList:{add(){},remove(){}},focus(){document.activeElement=node;},scrollIntoView(){},remove(){},click(){},
      addEventListener(type,fn){node[type]=fn;},querySelector(){return {focus(){}};},querySelectorAll(){return [];},contains(){return true;}};
    nodes.set(id,node);return node;
  }
  const document={getElementById:element,addEventListener(type,fn){listeners[type]=fn;},contains(){return true;},createElement(){return element('download-link');}};
  document.body=element('body');document.body.appendChild=()=>{};document.activeElement=document.body;
  const context={document,console,JSON,Date,Number,Math,String,Array,Object,Boolean,RegExp,Map,Set,WeakMap,Promise,URL,Blob,
    localStorage:{getItem:key=>storage.get(key)||null,setItem(key,value){if(key===blockedKey)throw Error('QuotaExceededError');storage.set(key,value);}},
    matchMedia:()=>({matches:false}),setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){},requestAnimationFrame:fn=>{fn();return 1;},cancelAnimationFrame(){}};
  context.window=context;vm.createContext(context);
  for(const file of ['campaign.js','engine.js','art.js','app.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist',file),'utf8'),context,{filename:file});
  function action(name,data={}){
    const button={dataset:{action:name,...data},disabled:false,closest(selector){return selector==='[data-action]'?button:null;}};
    listeners.click({target:button});
  }
  function tile(x,y){
    const node={dataset:{x:String(x),y:String(y)},closest(selector){return selector==='[data-action]'?null:selector==='[data-x][data-y]'?node:selector==='#board-stage'?element('board-stage'):null;}};
    listeners.click({target:node});
  }
  async function flush(){for(let i=0;i<100;i++){const todo=timers.splice(0);todo.forEach(fn=>fn());await Promise.resolve();if(!timers.length){await Promise.resolve();if(!timers.length)break;}}}
  return {action,tile,nodes,storage,context,flush,read:()=>JSON.parse(storage.get(SAVE)),html:()=>element('app').innerHTML,modal:()=>element('modal-root').innerHTML,
    async import(raw){element('save-import').files=[{size:JSON.stringify(raw).length,text:async()=>JSON.stringify(raw)}];element('save-import').change({target:element('save-import')});await flush();}};
}
function envelope(state){return {state,turnSnapshot:state.phase==='player'?copy(state):null,undoMoveSnapshot:null,resetsLeft:1,selectedId:'mech-1'};}

test('UI boots, switches all three squads, starts battle, and spends secondary through the same public command',()=>{
  const h=appHarness();assert.match(h.html(),/CAMPAIGN 2.0/);
  for(const squad of ['rift','control','gravity']){
    h.action('new');h.action('new-squad',{value:squad});h.action('new-difficulty',{value:'easy'});
    h.action('start-new');assert.equal(h.read().state.squad,squad);assert.equal(h.read().state.phase,'deploy');
    h.action('begin');const before=h.read().state;assert.equal(before.phase,'player');
    h.action('mode-secondary');const target=E.getTargets(before,'mech-1','secondary')[0];assert.ok(target);
    h.tile(target.x,target.y);const after=h.read().state,expected=E.command(before,{type:'attack',slot:'secondary',unitId:'mech-1',...target});
    assert.deepEqual(after,expected.state);assert.equal(after.units.find(u=>u.id==='mech-1').secondary.charges,0);
  }
});

test('reward UI shows itemized settlement, equips gear, and commits the explicitly selected route',()=>{
  let s=E.beginBattle(E.createRun({seed:66})).state;
  s.units=s.units.filter(u=>u.team!=='enemy');s.spawn=[];s.turn=s.turnLimit;
  s=E.endTurn(s).state;assert.equal(s.phase,'reward');
  const h=appHarness({save:envelope(s)});
  assert.match(h.modal(),/획득 코어/);assert.match(h.modal(),/파일럿 XP/);
  h.action('hangar-tab',{id:'equipment'});assert.match(h.modal(),/장착 중/);
  const cores=h.read().state.cores;h.action('equip',{unit:'mech-1',gear:'shield'});
  assert.equal(h.read().state.cores,cores-2);assert.equal(h.read().state.units[0].secondary.id,'shield');
  h.action('hangar-tab',{id:'route'});assert.match(h.modal(),/침수 지대 회수/);
  h.action('route',{id:'forest_salvage'});h.action('next-mission');
  const next=h.read().state;assert.equal(next.phase,'deploy');assert.equal(next.mission.operationId,'forest_salvage');assert.equal(next.units[0].secondary.charges,1);
});

test('a full legacy-backup store cannot discard an otherwise valid restored campaign',()=>{
  const s=E.beginBattle(E.createRun({squad:'control',seed:314159})).state;s.schema=1;
  const h=appHarness({save:envelope(s),blockedKey:'breach_command_legacy_backup'});
  const restored=h.read().state;assert.equal(restored.seed,314159);assert.equal(restored.phase,'player');assert.equal(restored.squad,'control');assert.equal(restored.schema,2);
});

test('save import rejects malformed terrain atomically and restores a valid campaign plus undo budget',async()=>{
  const h=appHarness(),before=h.read(),bad=copy(before);bad.state.tiles[0]=null;
  await h.import(bad);assert.deepEqual(h.read(),before);assert.match(h.nodes.get('toast').textContent,/불러오기 실패/);
  const good=envelope(E.beginBattle(E.createRun({squad:'gravity',seed:2026})).state);good.resetsLeft=0;
  await h.import(good);assert.equal(h.read().state.squad,'gravity');assert.equal(h.read().state.seed,2026);assert.equal(h.read().resetsLeft,0);
});

test('combat replay persists the final resolved turn before animation and does not overwrite it with frames',async()=>{
  const s=E.beginBattle(E.createRun({seed:77})).state,h=appHarness({save:envelope(s),prefs:{fast:false}}),expected=E.endTurn(s).state;
  h.action('end-turn');assert.deepEqual(h.read().state,expected,'reload during animation must resume the resolved state');
  h.action('new');assert.equal(h.modal(),'','new-run action must be blocked during animation');
  await h.flush();assert.deepEqual(h.read().state,expected);assert.deepEqual(h.read().turnSnapshot,expected);
});

test('terminal run records are idempotent and a selected surviving pilot carries into the next run',()=>{
  const s=E.createRun({seed:989});s.phase='lost';s.grid=0;s.units[0].pilot.xp=3;s.units[0].pilot.rank=1;
  const h=appHarness({save:envelope(s)});assert.match(h.modal(),/다음 작전에 동행할 파일럿/);
  h.action('carry-pilot',{id:'mech-1'});const profile=JSON.parse(h.storage.get('breach_command_profile_v2'));
  assert.equal(profile.records.length,1);assert.equal(profile.veteran.xp,3);
  h.action('result');assert.equal(JSON.parse(h.storage.get('breach_command_profile_v2')).records.length,1);
  h.action('new');h.action('start-new');const next=h.read().state;assert.equal(next.units[0].pilot.xp,3);assert.equal(next.units[0].pilot.id,profile.veteran.id);
});
