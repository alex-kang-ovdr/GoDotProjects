import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Game} from '../../../Web/engine.js';
import {Renderer} from '../../../Web/renderer.js';

let calls=0;
let trace=null;
const record=(name,args,props)=>{if(trace)trace.push({name,args:[...args],fill:props.fillStyle,stroke:props.strokeStyle,lineWidth:props.lineWidth});};
const numeric=(name,args)=>{for(const n of args)if(typeof n==='number')assert.ok(Number.isFinite(n),`${name}: nonfinite coordinate`);};
function context(){
 const props={globalAlpha:1,lineWidth:1,font:'10px sans-serif'}, stack=[];
 const methods=new Map();
 const gradient=()=>({stops:[],addColorStop(offset,color){assert.ok(offset>=0&&offset<=1);assert.equal(typeof color,'string');this.stops.push([offset,color]);}});
 return new Proxy(props,{
  get(t,key){
   if(key in t)return t[key];
   if(key==='save')return()=>{stack.push({...props});calls++;record(key,[],props);};
   if(key==='restore')return()=>{record(key,[],props);assert.ok(stack.length,'balanced restore');for(const k of Object.keys(props))delete props[k];Object.assign(props,stack.pop());calls++;};
   if(key==='depth')return stack.length;
   if(key==='createLinearGradient'||key==='createRadialGradient')return(...args)=>{numeric(key,args);calls++;return gradient();};
   if(key==='measureText')return text=>({width:String(text).length*Number(String(props.font).match(/([\d.]+)px/)?.[1]||10)*.54});
   if(!methods.has(key))methods.set(key,(...args)=>{
    calls++;numeric(key,args);record(key,args,props);
    if(key==='roundRect'||key==='rect'||key==='fillRect'||key==='strokeRect'){assert.ok(args[2]>=0,`${key}: nonnegative width`);assert.ok(args[3]>=0,`${key}: nonnegative height`);}
    if(key==='arc')assert.ok(args[2]>=0,'nonnegative radius');
    if(key==='ellipse')assert.ok(args[2]>=0&&args[3]>=0,'nonnegative ellipse radii');
    if(key==='setLineDash')for(const n of args[0])assert.ok(Number.isFinite(n)&&n>=0);
   });
   return methods.get(key);
  },
  set(t,key,value){if(typeof value==='number')assert.ok(Number.isFinite(value),`finite ${key}`);if(key==='globalAlpha')assert.ok(value>=0&&value<=1,`alpha=${value}`);t[key]=value;return true;}
 });
}
class Canvas{
 constructor(w=900,h=650){this.clientWidth=w;this.clientHeight=h;this.left=12;this.top=30;this.width=w;this.height=h;this.ctx=context();this.ownerDocument={createElement:()=>new Canvas(64,64)};}
 getBoundingClientRect(){return{width:this.clientWidth,height:this.clientHeight,left:this.left,top:this.top};}
 getContext(){return this.ctx;}
}
globalThis.window={devicePixelRatio:1};
globalThis.OffscreenCanvas=Canvas;
const parse=name=>JSON.parse(readFileSync(new URL('../'+name,import.meta.url),'utf8'));
const initial=new Game(73, 'breath-4.1');
const sample=parse('examples/self-sustaining-colony.json').game;
const legacy=parse('tests/fixtures/v2-victory.json');
const variants=[initial.serialize(),sample,legacy];
let scenarios=0;
function renderCase(state,w=920,h=650,overlay='normal',selection={x:25,y:16}){
 const g=structuredClone(state);g.canPlace=()=>({ok:true});
 const before=JSON.stringify(g);
 const canvas=new Canvas(w,h),renderer=new Renderer(canvas,g);
 renderer.overlay=overlay;renderer.selection=selection;renderer.hover=selection;
 renderer.render(25);renderer.render(26);
 assert.equal(JSON.stringify(g),before,'renderer must not alter game state');
 assert.equal(canvas.ctx.depth,0,'render balances save/restore');
 const cell=renderer.screenToCell(canvas.left+renderer.offsetX+25.5*renderer.cellSize,canvas.top+renderer.offsetY+16.5*renderer.cellSize);
 assert.deepEqual(cell,{x:25,y:16});
 renderer.zoomAt(1.3,canvas.left+w/2,canvas.top+h/2);renderer.pan(-40,20);renderer.centerOn(23.5,16.5);renderer.render(27);
 assert.equal(canvas.ctx.depth,0);scenarios++;return{g,canvas,renderer};
}
for(const state of variants)for(const overlay of ['normal','oxygen','temperature','power','plumbing','logistics','rooms'])for(const [w,h,dpr] of [[920,650,1],[390,640,2],[844,280,1.5],[1440,900,2.5]]){window.devicePixelRatio=dpr;renderCase(state,w,h,overlay);}


const modern=structuredClone(variants[0]);
for(let y=8;y<=18;y++)for(let x=12;x<=38;x++)Object.assign(modern.cells[y*modern.w+x],{revealed:true,solid:null,oxygen:.8,co2:.1,water:0});
const flat=(x,y)=>y*modern.w+x;
const region=(x,y,w,h)=>Array.from({length:w*h},(_,i)=>flat(x+i%w,y+Math.floor(i/w)));
modern.rooms=[
{id:flat(17,10),type:'bedroom',name:'침실',cells:region(17,10,5,2),area:10,bounds:{x1:17,y1:10,x2:21,y2:11},valid:true,sealed:true,reasons:[],bonus:'침대 회복 +25%'},
{id:flat(23,15),type:'messhall',name:'식당',cells:region(23,15,5,2),area:10,bounds:{x1:23,y1:15,x2:27,y2:16},valid:true,sealed:true,reasons:[],bonus:'식사 스트레스 -3'},
{id:flat(31,15),type:'greenhouse',name:'온실',cells:region(31,15,5,2),area:10,bounds:{x1:31,y1:15,x2:35,y2:16},valid:true,sealed:true,reasons:[],bonus:'성장 +20%'},
{id:flat(12,15),type:'generic',name:'미분류',cells:region(12,15,4,2),area:8,bounds:{x1:12,y1:15,x2:15,y2:16},valid:false,sealed:false,reasons:['방 경계가 열려 있습니다. 문과 벽으로 밀폐하세요.'],bonus:''}
];
const door={id:90001,type:'door',x:22,y:11,progress:1,enabled:true,active:false,doorMode:'auto',doorOpen:false};
const dock={id:90002,type:'oxygenDock',x:25,y:16,progress:1,enabled:true,active:false,connected:true,oxygenStored:9,oxygenCapacity:18};
modern.buildings.push(door,dock);
Object.assign(modern.crew[0],{x:25.5,y:16.5,path:[],_job:{kind:'refillOxygen',targetId:dock.id},portableOxygen:2,portableCapacity:6,maskMode:'auto',usingPortable:false,level:4,skillPoints:1,skills:{dig:2,engineering:1,life:0},health:100});
Object.assign(modern.crew[1],{x:22.5,y:11.5,path:[],portableOxygen:4,portableCapacity:6,maskMode:'auto',usingPortable:true,level:6,skillPoints:0,skills:{dig:1,engineering:2,life:3},health:100});
Object.assign(modern.crew[2],{x:21.5,y:11.5,path:[],portableOxygen:1,portableCapacity:6,maskMode:'off',usingPortable:false,level:2,skillPoints:1,skills:{dig:0,engineering:0,life:1},health:100});
for(const state of [modern,{...modern,rooms:[]},{...modern,rooms:[{...modern.rooms[0],type:'generic',valid:false,reasons:['침실에 산업 시설이 있습니다.']}]}])for(const overlay of ['normal','oxygen','temperature','power','plumbing','logistics','rooms'])for(const [w,h,dpr] of [[920,650,1],[390,640,2],[844,280,1.5],[1440,900,2.5]]){window.devicePixelRatio=dpr;renderCase(state,w,h,overlay);}
const gasColony=new Game(73,'oni-base');
gasColony._addBuilding('gasPump',26,10);gasColony._addBuilding('gasVent',29,10);
for(const [offset,element] of ['oxygen','co2','hydrogen','steam'].entries()){
 const x=26+offset;assert.ok(gasColony.queue('gaspipe',x,10).ok);
 gasColony.cell(x,10).gasPacket={element,mass:0.5,temp:70};
}
gasColony.cell(26,10).hydrogen=1.2;
const gasState={...gasColony.serialize(),originalRules:true};
for(const [w,h,dpr] of [[920,650,1],[390,640,2],[844,280,1.5],[1440,900,2.5]]){
 window.devicePixelRatio=dpr;
 renderCase(gasState,w,h,'gas',{x:26,y:10});
}
const currentColony=new Game(73);
const currentState={...currentColony.serialize(),originalRules:true,modernRules:true,restoredRules:true};
for(const [type,x,y] of [['steamRocket',33,20],['researchModule',34,15],['commandModule',34,10]])currentState.buildings.push({type,x,y,progress:1,enabled:true});
for(const [x,type] of [[14,'gasBridge'],[20,'supercomputer'],[26,'planetarium']])currentState.buildings.push({type,x,y:16,rotation:1,progress:1,enabled:true});
for(const size of [[390,844],[1280,800]])for(const overlay of ['normal','gas','power','plumbing']){
 const {canvas,renderer}=renderCase(currentState,...size,overlay);
 renderer.tool='gasBridge';renderer.hover={x:18,y:16};renderer.render(5);assert.equal(canvas.ctx.depth,0);
}
let checks=0;
function capture(ctx,fn){ctx.save();ctx.fillStyle='#000';ctx.strokeStyle='#000';ctx.lineWidth=1;ctx.font='10px sans-serif';trace=[];fn();const out=trace;trace=null;ctx.restore();assert.equal(ctx.depth,0);checks++;return out;}
const g=structuredClone(modern);g.canPlace=()=>({ok:true});
const canvas=new Canvas(),renderer=new Renderer(canvas,g),ctx=canvas.ctx;
const same=(fn1,fn2)=>assert.deepEqual(capture(ctx,fn1),capture(ctx,fn2));
const different=(fn1,fn2)=>assert.notDeepEqual(capture(ctx,fn1),capture(ctx,fn2));
same(()=>renderer._machine(ctx,dock,2),()=>renderer._machine(ctx,dock,3));
different(()=>renderer._machine(ctx,{...dock,active:true},2),()=>renderer._machine(ctx,{...dock,active:true},3));
same(()=>renderer._machine(ctx,{...dock,active:true,enabled:false},2),()=>renderer._machine(ctx,{...dock,active:true,enabled:false},3));
for(const mode of ['auto','open','locked']){
 same(()=>renderer._machine(ctx,{...door,doorMode:mode},2),()=>renderer._machine(ctx,{...door,doorMode:mode},3));
 different(()=>renderer._machine(ctx,{...door,doorMode:mode,doorOpen:false},2),()=>renderer._machine(ctx,{...door,doorMode:mode,doorOpen:true},2));
}
for(const amount of [0,0.0000001,6,18])capture(ctx,()=>renderer._machine(ctx,{...dock,oxygenStored:amount},12));
assert.equal(capture(ctx,()=>renderer._portableMask(ctx,{health:100,usingPortable:false})).length,0);
assert.ok(capture(ctx,()=>renderer._portableMask(ctx,{health:100,usingPortable:true})).length>0);
assert.equal(capture(ctx,()=>renderer._portableMask(ctx,{health:0,usingPortable:true})).length,0);
assert.equal(capture(ctx,()=>renderer._portablePack(ctx,{portableOxygen:0,portableCapacity:6})).length,0);
for(const oxygen of [0.000001,3,6])capture(ctx,()=>renderer._portablePack(ctx,{portableOxygen:oxygen,portableCapacity:6,maskMode:'auto'}));
assert.equal(capture(ctx,()=>renderer._skillBadge(ctx,'dig',0,0,0,.15)).length,0);
for(const skill of ['dig','engineering','life'])for(const rank of [1,2,3])capture(ctx,()=>renderer._skillBadge(ctx,skill,rank,0,0,.15));
assert.equal(renderer._refillingDock(g.crew[0])?.id,dock.id,'arrived crew can have an attached hose with inactive compressor');
assert.equal(renderer._refillingDock({...g.crew[0],path:[{x:25,y:16}]}),null,'no hose before arrival');
assert.equal(renderer._refillingDock({...g.crew[0],x:12.5}),null,'no remote refilling');
assert.equal(renderer._refillingDock({...g.crew[0],maskMode:'off'}),null,'no refill with mask off');
assert.equal(renderer._refillingDock({...g.crew[0],health:0}),null,'no dead crew refill');
assert.equal(renderer._refillingDock({...g.crew[0],portableOxygen:6}),null,'no refill of a full portable tank');
checks+=6;
const fullStatus=capture(ctx,()=>renderer._machineStatus(ctx,{...dock,oxygenStored:18,status:'탱크 가득'},0));
assert.equal(fullStatus.some(op=>op.fill==='#623f38'),false,'full oxygen tank is normal standby');

const roomsBefore=g.rooms;
g.rooms=[{id:flat(20,10),type:'bedroom',name:'침실',cells:[flat(20,10),flat(20,11),flat(21,11),flat(22,11)],area:4,bounds:{x1:20,y1:10,x2:22,y2:11},valid:true,sealed:true,reasons:[]}];
g.cells[flat(22,11)].revealed=false;
renderer.overlay='rooms';renderer.selection={x:20,y:10};
let drawn;
const roomTrace=capture(ctx,()=>{drawn=renderer._roomsOverlay(ctx,10,8,35,19);});
const fill=roomTrace.filter(op=>op.name==='fillRect'&&op.fill==='rgba(177,151,212,.16)').map(op=>op.args);
assert.deepEqual(fill,[[20,10,1,1],[20,11,1,1],[21,11,1,1]],'actual L-shaped cells only, no bounding box or hidden member tint');
assert.equal(drawn[0].selected,true,'selected room emphasized');
assert.ok(roomTrace.some(op=>op.name==='lineTo'&&op.args[0]===20.965&&op.args[1]===10.975),'concave internal boundary outlined');
assert.equal(roomTrace.find(op=>op.name==='stroke').lineWidth,.075,'selected outline has its own width');
capture(ctx,()=>renderer._roomLabels(ctx,drawn));
g.rooms=roomsBefore;g.cells[flat(22,11)].revealed=true;
checks+=4;
// Cosmetic atmosphere/cursor glows may use wall time. Gameplay rendering must
// stay exactly still when game.time and state are unchanged.
renderer._dust=()=>{};renderer._ambientLight=()=>{};renderer._fog=()=>{};renderer._interaction=()=>{};
renderer.game.time=201.5;renderer.render(100);renderer.render(101);
const pausedA=capture(ctx,()=>renderer.render(102)),pausedB=capture(ctx,()=>renderer.render(300));
assert.ok(JSON.stringify(pausedA)===JSON.stringify(pausedB),'gameplay animations freeze at unchanged simulation time');

const frozen=structuredClone(modern);frozen.canPlace=()=>({ok:true});
function freeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);for(const item of Object.values(value))freeze(item);}return value;}
freeze(frozen);
const frozenRenderer=new Renderer(new Canvas(920,650),frozen);
for(const overlay of ['normal','oxygen','rooms']){frozenRenderer.overlay=overlay;frozenRenderer.selection={x:25,y:16};frozenRenderer.render(30);checks++;}
console.log(JSON.stringify({scenarios,checks,calls,stateInvariant:true,gameplayPauseInvariant:true,geometryFinite:true,canvasBalanced:true}));

const live=new Game(73, 'breath-4.1');live.step(3);
const liveBefore=JSON.stringify(live),liveRenderer=new Renderer(new Canvas(920,650),live);
for(const overlay of ['normal','oxygen','rooms']){liveRenderer.overlay=overlay;liveRenderer.render(99);}
assert.equal(JSON.stringify(live),liveBefore,'rendering real v4 Game instance is read-only');
console.log(JSON.stringify({realGameVersion:live.version,rooms:live.rooms.length,realGameStateInvariant:true}));
