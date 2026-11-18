'use strict';
/* Executes the shipped app.js + touch.js + Game in Node. The DOM fixture models
 * event propagation and pointer capture only. It is not a browser, CSS layout,
 * WebGL, real-device, or content:// test. No production input logic is copied. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {performance}=require('node:perf_hooks');
const C=require('../src/core.js');
const {Game}=require('../src/game.js');
const ROOT=path.resolve(__dirname,'..');
const template=fs.readFileSync(path.join(ROOT,'src/template.html'),'utf8');
const appSource=fs.readFileSync(path.join(ROOT,'src/app.js'),'utf8');
const touchSource=fs.readFileSync(path.join(ROOT,'src/touch.js'),'utf8');
const results=[];
function test(name,fn){try{fn();results.push({name,passed:true});console.log('PASS',name)}catch(e){results.push({name,passed:false,error:e.stack});console.error('FAIL',name,e.stack)}}
const near=(a,b,eps=1e-6)=>assert.ok(Math.abs(a-b)<=eps,`${a} != ${b}`);

class Target {
 constructor(){this.listeners=new Map();this.parentNode=null}
 addEventListener(type,fn,options={}){const list=this.listeners.get(type)||[];list.push({fn,capture:options===true||!!options.capture});this.listeners.set(type,list)}
 removeEventListener(type,fn){this.listeners.set(type,(this.listeners.get(type)||[]).filter(x=>x.fn!==fn))}
 dispatchEvent(event){
  const e=Object.assign({bubbles:true,cancelable:true,defaultPrevented:false,isTrusted:false,detail:0,
   preventDefault(){this.defaultPrevented=true},stopPropagation(){this.stopped=true}},event);
  e.target=e.target||this;
  const chain=[];for(let p=this;p;p=p.parentNode)chain.push(p);
  const call=(target,capture)=>{e.currentTarget=target;for(const x of [...(target.listeners.get(e.type)||[])])if(x.capture===capture)x.fn(e);if(!capture&&typeof target['on'+e.type]==='function')target['on'+e.type](e)};
  for(let i=chain.length-1;i>=0;i--){call(chain[i],true);if(e.stopped)return !e.defaultPrevented}
  for(let i=0;i<chain.length;i++){call(chain[i],false);if(e.stopped||!e.bubbles)break}
  return !e.defaultPrevented;
 }
}
class Classes {
 constructor(el){this.el=el}
 has(name){return this.el.className.split(/\s+/).includes(name)}
 contains(name){return this.has(name)}
 add(...names){this.el.className=[...new Set([...this.el.className.split(/\s+/).filter(Boolean),...names])].join(' ')}
 remove(...names){this.el.className=this.el.className.split(/\s+/).filter(x=>!names.includes(x)).join(' ')}
 toggle(name,on){if(on===undefined)on=!this.has(name);on?this.add(name):this.remove(name);return on}
}
class Element extends Target {
 constructor(tag,doc){super();this.tagName=tag.toUpperCase();this.ownerDocument=doc;this.children=[];this.dataset={};this.style={};this.attributes={};this.className='';this.classList=new Classes(this);this.hidden=false;this.checked=false;this.disabled=false;this.value='';this.width=186;this.height=186;this.id='';this.textContent='';this._html=''}
 set innerHTML(v){this._html=v;this.children=[]}
 get innerHTML(){return this._html}
 setAttribute(name,value){value=String(value);this.attributes[name]=value;if(name==='id'){this.id=value;this.ownerDocument.ids.set(value,this)}else if(name==='class')this.className=value;else if(name.startsWith('data-'))this.dataset[name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=value;else if(name==='hidden')this.hidden=true;else if(name==='checked')this.checked=true;else if(name==='value')this.value=value;else if(name==='width'||name==='height')this[name]=Number(value)}
 getAttribute(name){return this.attributes[name]??null}
 appendChild(el){el.parentNode=this;this.children.push(el);return el}
 append(...els){for(const el of els)this.appendChild(el)}
 replaceChildren(...els){this.children=[];this.append(...els)}
 remove(){if(this.parentNode?.children)this.parentNode.children=this.parentNode.children.filter(x=>x!==this);this.parentNode=null}
 matches(sel){if(sel[0]==='#')return this.id===sel.slice(1);if(sel[0]==='.')return this.classList.has(sel.slice(1));const attr=sel.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);if(attr)return this.attributes[attr[1]]!==undefined&&(attr[2]===undefined||this.attributes[attr[1]]===attr[2]);return this.tagName.toLowerCase()===sel.toLowerCase()}
 querySelectorAll(sel){const out=[];for(const child of this.children){if(child.matches(sel))out.push(child);out.push(...child.querySelectorAll(sel))}return out}
 querySelector(sel){return this.querySelectorAll(sel)[0]||null}
 closest(sel){for(let p=this;p instanceof Element;p=p.parentNode)if(p.matches(sel))return p;return null}
 getBoundingClientRect(){return this.rect||{left:0,top:0,x:0,y:0,width:100,height:100,right:100,bottom:100}}
 setPointerCapture(id){this.ownerDocument.captures.set(id,this)}
 hasPointerCapture(id){return this.ownerDocument.captures.get(id)===this}
 releasePointerCapture(id){if(!this.hasPointerCapture(id))return;this.ownerDocument.captures.delete(id);this.dispatchEvent({type:'lostpointercapture',pointerId:id,pointerType:'touch'})}
 getContext(){return new Proxy({},{get:(o,key)=>o[key]||(()=>{}),set:(o,key,val)=>(o[key]=val,true)})}
 requestPointerLock(){this.ownerDocument.pointerLockElement=this;this.ownerDocument.dispatchEvent({type:'pointerlockchange'});return Promise.resolve()}
 click(detail=0){this.dispatchEvent({type:'click',detail})}
}
class Document extends Target {
 constructor(win){super();this.parentNode=win;this.ids=new Map();this.captures=new Map();this.hidden=false;this.pointerLockElement=null;this.children=[]}
 createElement(tag){return new Element(tag,this)}
 createDocumentFragment(){return this.createElement('fragment')}
 getElementById(id){const el=this.ids.get(id);if(!el)throw Error('Fixture element missing from actual template: '+id);return el}
 querySelectorAll(sel){return this.documentElement.querySelectorAll(sel)}
 exitPointerLock(){this.pointerLockElement=null;this.dispatchEvent({type:'pointerlockchange'})}
}
function parseTemplate(doc){
 const stack=[doc],voids=new Set(['meta','input','br','hr','img','link','wbr']);
 for(const m of template.matchAll(/<(\/?)([a-zA-Z][\w:-]*)([^>]*)>/g)){
  const [,,name,raw]=m,tag=name.toLowerCase();
  if(m[1]){while(stack.length>1){const ended=stack.pop();if(ended.tagName.toLowerCase()===tag)break}continue}
  const el=doc.createElement(tag);
  for(const a of raw.matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g))el.setAttribute(a[1],a[2]??a[3]??a[4]??'');
  const parent=stack[stack.length-1];el.parentNode=parent;parent.children.push(el);
  if(tag==='html')doc.documentElement=el;if(tag==='body')doc.body=el;
  if(!voids.has(tag)&&!raw.trimEnd().endsWith('/'))stack.push(el);
 }
}
class Renderer {
 constructor(){this.options={particles:false,shadows:false,bloom:false,exposure:1};this.frames=0;this.vertexCount=0;this.drawCalls=0;this.texturesReady=0;this.preset='test-stub'}
 upload(){}
 draw(){this.frames++}
 project(){return null}
 setPreset(name){this.preset=name}
}
function fixture(coarse=true){
 const win=new Target(),doc=new Document(win),media=new Target();media.matches=coarse;
 win.navigator={maxTouchPoints:coarse?5:0};win.matchMedia=query=>query.includes('coarse')?media:{matches:!coarse,addEventListener(){}};
 parseTemplate(doc);doc.getElementById('seed').value='TOUCH-REGRESSION';doc.getElementById('difficulty').value='normal';
 doc.getElementById('touchMove').rect={left:0,top:0,x:0,y:0,width:100,height:100,right:100,bottom:100};
 doc.getElementById('touchLook').rect={left:200,top:0,x:200,y:0,width:100,height:100,right:300,bottom:100};
 const storage=new Map();
 Object.assign(win,{window:win,document:doc,console,performance,requestAnimationFrame:()=>1,cancelAnimationFrame:()=>{},
  CryptCore:C,CryptGame:{Game},CryptRender:{Renderer,buildDungeonMesh:()=>({})},CryptScene:{scene:()=>({})},
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)}});
 const context=vm.createContext(win);
 vm.runInContext(touchSource,context,{filename:'src/touch.js'});
 vm.runInContext(appSource,context,{filename:'src/app.js'});
 const d=win.cryptDebug;assert.ok(d,'actual app initialized');d.setAuto(false);d.setRenderAuto(false);d.start(true);d.game.aiFrozen=true;d.game.god=true;d.game.enemies=[];
 const el=id=>doc.getElementById(id),btn=action=>el('touchControls').querySelectorAll('[data-touch-action]').find(x=>x.dataset.touchAction===action);
 const send=(target,type,id,x=50,y=50,extra={})=>{
  const captured=type==='pointerdown'?null:doc.captures.get(id);
  (captured||target).dispatchEvent({type,pointerId:id,pointerType:'touch',button:0,clientX:x,clientY:y,...extra});
 };
 const down=(name,id=1,x=50,y=50)=>send(name==='move'?el('touchMove'):name==='look'?el('touchLook'):btn(name),'pointerdown',id,x,y);
 const move=(id,x,y)=>send(el('gl'),'pointermove',id,x,y);
 const up=id=>send(el('gl'),'pointerup',id);
 const cancel=id=>send(el('gl'),'pointercancel',id);
 const tap=(name,id=9)=>{down(name,id);up(id)};
 const key=(code,held)=>doc.body.dispatchEvent({type:held?'keydown':'keyup',code,repeat:false});
 const neutral=()=>{const s=d.touchState(),i=d.getInput();return s.pointerCount===0&&!s.forward&&!s.strafe&&!s.guard&&!s.jump&&!s.sprint&&!s.interact&&!i.forward&&!i.strafe&&!i.interact&&!d.game.player.guard};
 const position=()=>({x:d.game.player.x,z:d.game.player.z,yaw:d.game.player.yaw});
 return {win,doc,media,d,el,btn,send,down,move,up,cancel,tap,key,neutral,position};
}
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);

test('Actual application initializes touch controls without requesting Pointer Lock',()=>{const f=fixture();assert.equal(f.d.touchState().enabled,true);assert.equal(f.d.touchState().active,true);assert.equal(f.doc.pointerLockElement,null);assert.equal(f.el('touchControls').hidden,false)});
test('Analog joystick dead zone yields zero, partial input retains partial movement speed',()=>{const f=fixture();f.down('move');f.move(1,50,48);near(f.d.getInput().forward,0);f.move(1,50,34);const a=f.d.getInput().forward;assert.ok(a>.2&&a<.8);const p=f.position();f.d.stepInput(.2);near(distance(p,f.position()),2.8*.2*a);f.up(1);assert.ok(f.neutral())});
test('Oversized diagonal joystick input clamps to unit speed without diagonal boost',()=>{const f=fixture();f.down('move');f.move(1,150,-50);const i=f.d.getInput();near(Math.hypot(i.forward,i.strafe),1);const p=f.position();f.d.stepInput(.2);near(distance(p,f.position()),2.8*.2)});
test('A second movement finger cannot steal the joystick or release its owner',()=>{const f=fixture();f.down('move',1,50,20);const before=f.d.getInput().forward;f.down('move',2,50,90);f.move(2,50,99);near(f.d.getInput().forward,before);assert.equal(f.d.touchState().moveId,1);f.up(2);near(f.d.getInput().forward,before);f.up(1);assert.ok(f.neutral())});
test('Actual app handles move, look, and attack concurrently with independent pointers',()=>{const f=fixture();f.down('move',1,50,15);f.down('look',2,250,50);const start=f.position();f.move(2,275,40);f.down('attack',3);f.d.stepInput(.15);assert.ok(distance(start,f.position())>.1);assert.ok(f.position().yaw>start.yaw);assert.equal(f.d.game.stats.swings,1);assert.equal(f.d.touchState().pointerCount,3);f.up(3);f.up(2);assert.ok(f.d.getInput().forward>.5);f.up(1);f.d.stepInput(1);assert.ok(f.neutral());assert.equal(f.d.game.stats.swings,1)});
test('Unknown pointer movements cannot rotate the camera; pitch remains clamped',()=>{const f=fixture();const yaw=f.position().yaw;f.move(99,999,999);near(f.position().yaw,yaw);f.down('look',2,250,50);f.move(2,250,-99999);near(f.d.game.player.pitch,1.2);f.move(2,250,99999);near(f.d.game.player.pitch,-1.2)});
test('Touch release clears only the released guard while movement stays active',()=>{const f=fixture();f.down('move',1,50,15);f.down('guard',2);assert.ok(f.d.game.player.guard);f.up(2);assert.equal(f.d.game.player.guard,false);assert.ok(f.d.getInput().forward>.5);f.up(1);assert.ok(f.neutral())});
test('Second finger on a held button cannot cancel the first finger guard',()=>{const f=fixture();f.down('guard',1);f.down('guard',2);assert.equal(f.d.touchState().pointerCount,1);f.up(2);assert.ok(f.d.game.player.guard);f.up(1);assert.ok(f.neutral());assert.equal(f.btn('guard').getAttribute('aria-pressed'),'false')});
test('Pointer cancel and off-control release clear matching holds and visual state',()=>{const f=fixture();f.down('move',1,50,15);f.down('guard',2);f.cancel(1);near(f.d.getInput().forward,0);assert.ok(f.d.game.player.guard);f.cancel(2);assert.ok(f.neutral());assert.equal(f.el('touchMove').classList.contains('pressed'),false);assert.equal(f.btn('guard').classList.contains('pressed'),false)});
test('Lost capture clears one pointer and remains safe under synchronous capture release',()=>{const f=fixture();f.down('move',1,50,15);f.down('look',2,250,50);f.el('touchMove').releasePointerCapture(1);near(f.d.getInput().forward,0);assert.equal(f.d.touchState().lookId,2);f.up(2);assert.ok(f.neutral())});
test('Pointer compatibility click is ignored; keyboard-activated action still works',()=>{const f=fixture();f.tap('attack');f.btn('attack').click(1);f.d.stepInput(1);assert.equal(f.d.game.stats.swings,1);f.btn('attack').click(0);assert.equal(f.d.game.stats.swings,2)});
test('Pause and resume clear all active pointers, guard, keyboard and queued interaction',()=>{const f=fixture();f.key('KeyW',true);f.down('move',1,50,15);f.down('guard',2);f.tap('pause');assert.ok(f.d.game.paused);assert.ok(f.neutral());assert.equal(f.el('touchControls').hidden,true);f.el('resume').click();assert.equal(f.d.game.paused,false);assert.ok(f.neutral());assert.equal(f.d.touchState().active,true)});
test('Inventory opening clears holds and closing restores neutral touch controls',()=>{const f=fixture();f.down('move',1,50,15);f.down('guard',2);f.tap('inventory');assert.equal(f.el('inventoryPanel').hidden,false);assert.ok(f.neutral());assert.equal(f.d.touchState().active,false);f.el('closeInventory').click();assert.equal(f.d.touchState().active,true);assert.ok(f.neutral())});
test('Actual held search progresses, release cancels, full hold opens starter loot',()=>{const f=fixture();assert.equal(f.d.game.getInteraction().kind,'container');f.down('interact',1);f.d.stepInput(.3);assert.equal(f.d.game.action.kind,'container');assert.ok(f.d.game.action.t>=.29);f.up(1);assert.equal(f.d.game.action,null);f.down('interact',1);f.d.stepInput(1.1);assert.equal(f.el('inventoryPanel').hidden,false);assert.ok(f.d.game.openContainer.searched);assert.ok(f.neutral())});
test('Touch release preserves a physically held keyboard move key',()=>{const f=fixture();f.key('KeyW',true);f.down('move',1,50,75);assert.ok(f.d.getInput().forward<.9);f.up(1);near(f.d.getInput().forward,1);f.key('KeyW',false);assert.ok(f.neutral())});
test('Search held by keyboard survives touch release, then cancels on final key release',()=>{const f=fixture();f.key('KeyE',true);f.down('interact',1);f.d.stepInput(.2);f.up(1);assert.ok(f.d.game.action);assert.ok(f.d.getInput().interact);f.key('KeyE',false);assert.equal(f.d.game.action,null);assert.ok(f.neutral())});
test('Search held by touch survives keyboard release, then cancels on final touch release',()=>{const f=fixture();f.down('interact',1);f.key('KeyE',true);f.d.stepInput(.2);f.key('KeyE',false);assert.ok(f.d.game.action);assert.ok(f.d.getInput().interact);f.up(1);assert.equal(f.d.game.action,null);assert.ok(f.neutral())});
for(const type of ['resize','orientationchange','blur'])test(type+' clears all touch state through actual app listeners',()=>{const f=fixture();f.down('move',1,50,15);f.down('guard',2);f.win.dispatchEvent({type});assert.ok(f.neutral());f.move(1,50,10);near(f.d.getInput().forward||0,0)});
test('Hidden document clears touch state and pauses the actual game',()=>{const f=fixture();f.down('move',1,50,15);f.down('guard',2);f.doc.hidden=true;f.doc.dispatchEvent({type:'visibilitychange'});assert.ok(f.neutral());assert.ok(f.d.game.paused)});
test('Restart clears stale pointers and ignores their later move/up events',()=>{const f=fixture();f.down('move',1,50,15);f.down('guard',2);f.d.start(true);assert.ok(f.neutral());f.move(1,50,10);f.up(2);assert.ok(f.neutral())});
test('Manual off clears holds, manual on restores controls, invalid setting is ignored',()=>{const f=fixture();f.down('move',1,50,15);f.el('touchControlsMode').onchange({target:{value:'off'}});assert.equal(f.d.touchState().enabled,false);assert.ok(f.neutral());f.el('touchControlsMode').onchange({target:{value:'on'}});assert.equal(f.d.touchState().enabled,true);assert.ok(f.neutral());f.el('touchControlsMode').onchange({target:{value:'invalid'}});assert.equal(f.d.touchState().mode,'on')});
test('Actual touch weapon attacks and timed reload consume the correct resources once',()=>{const f=fixture();f.tap('bow');f.tap('attack');assert.equal(f.d.game.player.arrows,15);assert.equal(f.d.game.projectiles.length,1);f.d.stepInput(1);f.tap('reload');assert.equal(f.d.game.action.kind,'reload');f.d.stepInput(1.2);assert.equal(f.d.game.player.arrows,16);assert.equal(f.d.game.player.reserve,23);f.tap('magic');const mana=f.d.game.player.mana;f.tap('attack');near(f.d.game.player.mana,mana-24);assert.equal(f.d.game.stats.shots,2)});
test('Touch healing, sprint, jump and dodge are routed through actual app actions',()=>{const f=fixture();f.d.game.player.hp=60;f.tap('heal');f.d.stepInput(1);assert.equal(f.d.game.player.hp,98);assert.equal(f.d.game.player.potions,2);f.down('move',1,50,15);f.down('sprint',2);const start=f.position();f.d.stepInput(.2);assert.ok(distance(start,f.position())>.8);assert.ok(f.d.game.player.stamina<100);f.up(2);f.down('jump',3);f.d.stepInput(.1);assert.ok(f.d.game.player.jump>.1);f.up(3);f.tap('dodge');assert.ok(f.d.game.player.dodge>0);f.up(1);f.d.stepInput(1);assert.ok(f.neutral());near(f.d.game.player.jump,0)});
test('Desktop WASD and mouse attack/guard adapters remain functional',()=>{const f=fixture(false);assert.equal(f.d.touchState().enabled,false);const start=f.position();f.key('KeyW',true);f.key('KeyD',true);f.d.stepInput(.2);near(distance(start,f.position()),2.8*.2);f.key('KeyW',false);f.key('KeyD',false);f.el('gl').dispatchEvent({type:'mousedown',button:0});assert.equal(f.d.game.stats.swings,1);f.d.stepInput(1);f.el('gl').dispatchEvent({type:'mousedown',button:2});assert.ok(f.d.game.player.guard);f.doc.dispatchEvent({type:'mouseup',button:2});assert.equal(f.d.game.player.guard,false)});
test('Desktop fallback arrow keys rotate the camera through actual merged input',()=>{const f=fixture(false);const yaw=f.position().yaw;f.key('ArrowRight',true);f.d.stepInput(.2);f.key('ArrowRight',false);near(f.position().yaw-yaw,.32)});
test('First touch enables controls on a hybrid device without stealing keyboard keys',()=>{const f=fixture(false);f.key('KeyW',true);f.doc.body.dispatchEvent({type:'pointerdown',pointerType:'touch',pointerId:44,clientX:100,clientY:100,button:0});assert.equal(f.d.touchState().enabled,true);near(f.d.getInput().forward,1);f.key('KeyW',false);assert.ok(f.neutral())});

const report={suite:'Actual app + touch controller + Game input integration (Node DOM fixture)',
 scope:'Production input and simulation modules executed; event/capture DOM fixture and renderer/scene stubs. No browser layout, WebGL, Android device or content:// validation.',
 node:process.version,total:results.length,passed:results.filter(x=>x.passed).length,failed:results.filter(x=>!x.passed).length,results};
fs.writeFileSync(path.join(__dirname,'touch_unit_results.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({total:report.total,passed:report.passed,failed:report.failed}));
process.exitCode=report.failed?1:0;
