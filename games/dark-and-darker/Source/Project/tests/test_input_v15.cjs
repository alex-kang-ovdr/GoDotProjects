'use strict';
/* v15 adapter integration. Reuses the v14.1 DOM/event/pointer-capture fixture,
 * but runs the actual core, rules, game, progression, touch and app modules in
 * one fresh VM per scenario. Only renderer/scene/audio/scheduling and browser
 * APIs are fixtures. No input or simulation implementation is copied here.
 * This is NOT browser layout, WebGL, Android, or content:// validation. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {performance}=require('node:perf_hooks');
const ROOT=path.resolve(__dirname,'..');
const template=fs.readFileSync(path.join(ROOT,'src/template.html'),'utf8');
const modules=['core','rules','game','progression','touch','app'].map(name=>({name,source:fs.readFileSync(path.join(ROOT,'src',name+'.js'),'utf8')}));
const cases=[],results=[];
function test(name,fn){cases.push({name,fn})}
const near=(a,b,eps=1e-6)=>assert.ok(Math.abs(a-b)<=eps,`${a} != ${b}`);
const plain=value=>JSON.parse(JSON.stringify(value));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const flush=()=>new Promise(resolve=>setImmediate(resolve));
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
 requestPointerLock(){const d=this.ownerDocument;d.lockRequests++;if(d.lockBehavior==='throw')throw new Error('Pointer Lock fixture denial');if(d.lockBehavior==='reject')return Promise.reject(new Error('Pointer Lock fixture denial'));d.pointerLockElement=this;d.dispatchEvent({type:'pointerlockchange'});return Promise.resolve()}
 click(detail=0){if(!this.disabled)this.dispatchEvent({type:'click',detail})}
}
class Document extends Target {
 constructor(win){super();this.parentNode=win;this.ids=new Map();this.captures=new Map();this.hidden=false;this.pointerLockElement=null;this.lockRequests=0;this.lockBehavior='ok';this.children=[]}
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

function fixture({coarse=true,classId='fighter',training=true,autoStart=true,storage=new Map(),lock='ok'}={}){
 const win=new Target(),doc=new Document(win),media=new Target();media.matches=coarse;doc.lockBehavior=lock;
 win.navigator={maxTouchPoints:coarse?5:0};win.matchMedia=query=>query.includes('coarse')?media:{matches:!coarse,addEventListener(){}};
 parseTemplate(doc);doc.getElementById('seed').value='V15-INPUT-REGRESSION';doc.getElementById('difficulty').value='normal';doc.getElementById('classSelect').value=classId;
 doc.getElementById('touchMove').rect={left:0,top:0,x:0,y:0,width:100,height:100,right:100,bottom:100};
 doc.getElementById('touchLook').rect={left:200,top:0,x:200,y:0,width:100,height:100,right:300,bottom:100};
 if(lock==='missing')doc.getElementById('gl').requestPointerLock=undefined;
 Object.assign(win,{window:win,document:doc,console,performance,requestAnimationFrame:()=>1,cancelAnimationFrame:()=>{},
  CryptRender:{Renderer,buildDungeonMesh:()=>({})},CryptScene:{scene:()=>({})},
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)}});
 const context=vm.createContext(win);
 for(const {name,source} of modules)vm.runInContext(source,context,{filename:'src/'+name+'.js'});
 const d=win.cryptDebug;assert.ok(d,'actual app initialized');d.setAuto(false);d.setRenderAuto(false);
 const el=id=>doc.getElementById(id),btn=action=>el('touchControls').querySelectorAll('[data-touch-action]').find(x=>x.dataset.touchAction===action);
 const quiet=()=>{d.game.aiFrozen=true;d.game.enemies=[];d.game.boss=null;d.game.god=true};
 if(autoStart){el(training?'training':'start').click();quiet()}
 const send=(target,type,id,x=50,y=50,extra={})=>{
  assert.ok(target,'known event target');const captured=type==='pointerdown'?null:doc.captures.get(id);
  (captured||target).dispatchEvent({type,pointerId:id,pointerType:'touch',button:0,clientX:x,clientY:y,...extra});
 };
 const down=(name,id=1,x=50,y=50)=>send(name==='move'?el('touchMove'):name==='look'?el('touchLook'):btn(name),'pointerdown',id,x,y);
 const move=(id,x,y)=>send(el('gl'),'pointermove',id,x,y);
 const up=id=>send(el('gl'),'pointerup',id);
 const cancel=id=>send(el('gl'),'pointercancel',id);
 const tap=(name,id=9)=>{down(name,id);up(id)};
 const key=(code,held=true,{repeat=false,target=doc.body}={})=>target.dispatchEvent({type:held?'keydown':'keyup',code,repeat});
 const press=code=>{key(code,true);key(code,false)};
 const mouseDown=(button=0)=>el('gl').dispatchEvent({type:'mousedown',button});
 const mouseUp=(button=0)=>doc.dispatchEvent({type:'mouseup',button});
 const mouseMove=(x,y)=>doc.dispatchEvent({type:'mousemove',movementX:x,movementY:y});
 const neutral=()=>{const s=d.touchState(),i=d.getInput(),p=d.game.player;return s.pointerCount===0&&!s.forward&&!s.strafe&&!s.attack&&!s.secondary&&!s.walk&&!s.crouch&&!s.jump&&!s.interact&&!i.forward&&!i.strafe&&!i.interact&&!i.walk&&!i.crouch&&!i.jump&&!p.guard&&!p.primaryHeld&&!p.secondaryHeld&&!p.cast&&!p.draw};
 const position=()=>({x:d.game.player.x,z:d.game.player.z,yaw:d.game.player.yaw,pitch:d.game.player.pitch});
 const start=(id=classId,practice=training)=>{el('classSelect').value=id;el('classSelect').dispatchEvent({type:'change'});el(practice?'training':'start').click();quiet()};
 const chooseSpell=(id='fireball')=>{tap('skill1');assert.equal(el('spellWheel').hidden,false);const b=el('spellChoices').children.find(e=>e.dataset.spell===id);assert.ok(b);b.click();assert.equal(d.game.selectedSpellId,id);assert.equal(el('spellWheel').hidden,true)};
 return {win,doc,media,d,el,btn,send,down,move,up,cancel,tap,key,press,mouseDown,mouseUp,mouseMove,neutral,position,start,quiet,storage,C:win.CryptCore,R:win.CryptRules,chooseSpell};
}
function nearExit(f){
 const g=f.d.game,exit=g.map.exit;
 const pair=[[0,1],[0,-1],[1,0],[-1,0]].map(([dx,dz])=>({x:exit.x+dx,z:exit.z+dz})).find(p=>f.C.free(g.map,p.x,p.z)&&f.C.lineClear(g.map,p.x,p.z,exit.x,exit.z));
 assert.ok(pair,'fixture can stand beside the generated exit');Object.assign(g.player,pair);g.player.yaw=Math.atan2(exit.x-pair.x,-(exit.z-pair.z));
 assert.equal(g.getInteraction()?.kind,'exit');
}

// Original keyboard controls and class-specific resources.
test('All six production modules initialize against the shipped v15 DOM contract',()=>{
 const f=fixture();assert.equal(f.win.CryptRules.version,'15');assert.equal(f.d.game.classId,'fighter');
 assert.equal(f.el('touchControls').querySelectorAll('[data-touch-action]').length,18);
 assert.equal(f.el('keyboardLook').checked,false);assert.equal(f.doc.pointerLockElement,null);
 assert.equal(f.d.touchState().active,true);assert.equal(f.el('fatal').hidden,true);
 assert.ok(f.win.CryptProgress.Profile&&f.win.CryptGame.Game&&f.win.CryptTouch.TouchControls);
});
for(const classId of ['fighter','ranger','wizard'])test('Class selector starts the actual '+classId+' kit and matching skills',()=>{
 const f=fixture({autoStart:false});f.start(classId);
 const g=f.d.game,c=f.R.classes[classId];assert.equal(g.classId,classId);near(g.player.hp,c.maxHealth);
 assert.equal(g.equipment.weapon.id,c.weapon);assert.equal(g.equipment.secondary.id,c.secondary);
 assert.deepEqual(Object.keys(g.player.skills),Array.from(c.skills));assert.ok(f.el('classSummary').textContent.includes(c.name));
 assert.equal(f.el('classHudName').textContent,c.name.toUpperCase());
});
test('WASD moves in camera-relative directions without rotating the camera',()=>{
 for(const [code,xSign,zSign] of [['KeyW',0,-1],['KeyS',0,1],['KeyA',-1,0],['KeyD',1,0]]){
  const f=fixture({coarse:false}),p=f.position();f.key(code);f.d.stepInput(.2);f.key(code,false);const q=f.position();
  assert.ok(distance(p,q)>.2);near(q.yaw,p.yaw);if(xSign)assert.ok((q.x-p.x)*xSign>0);else near(q.x,p.x);if(zSign)assert.ok((q.z-p.z)*zSign>0);else near(q.z,p.z);assert.ok(f.neutral());
 }
});
test('Diagonal keyboard movement is normalized to the same forward speed',()=>{
 const forward=fixture({coarse:false}),diagonal=fixture({coarse:false});const a=forward.position(),b=diagonal.position();
 forward.key('KeyW');diagonal.key('KeyW');diagonal.key('KeyD');forward.d.stepInput(.2);diagonal.d.stepInput(.2);
 near(distance(a,forward.position()),distance(b,diagonal.position()));
});
test('Shift slows to walking and Ctrl crouches; neither activates a class skill',()=>{
 const normal=fixture({coarse:false}),walk=fixture({coarse:false}),crouch=fixture({coarse:false});const a=normal.position(),b=walk.position(),c=crouch.position();
 for(const f of [normal,walk,crouch])f.key('KeyW');walk.key('ShiftLeft');crouch.key('ControlLeft');
 for(const f of [normal,walk,crouch])f.d.stepInput(.2);
 near(distance(b,walk.position())/distance(a,normal.position()),.65);near(distance(c,crouch.position())/distance(a,normal.position()),.6);
 assert.ok(walk.d.game.player.walking);assert.ok(crouch.d.game.player.crouching);assert.ok(crouch.d.game.getEye()[1]<normal.d.game.getEye()[1]);
 for(const f of [walk,crouch])near(f.d.game.player.skills.sprint.cooldown,0);
 walk.key('ShiftLeft',false);crouch.key('ControlLeft',false);walk.d.stepInput(1/60);crouch.d.stepInput(1/60);assert.equal(walk.d.game.player.walking,false);assert.equal(crouch.d.game.player.crouching,false);
});
test('Q activates Fighter Sprint, E consumes Second Wind once, key repeat does not retrigger',()=>{
 const f=fixture({coarse:false}),g=f.d.game;f.press('KeyQ');assert.equal(g.player.skills.sprint.remaining,6);assert.equal(g.player.skills.sprint.cooldown,28);assert.equal(g.player.backStep,0);
 g.player.hp=40;f.key('KeyE');assert.equal(g.player.skills.secondWind.charges,0);assert.equal(g.action,null);f.key('KeyE',true,{repeat:true});f.key('KeyE',false);f.d.stepInput(12);
 near(g.player.hp,90);f.press('KeyE');assert.equal(g.player.skills.secondWind.charges,0);near(g.player.hp,90);
});
test('Ranger Q is Back Step and E is timed Field Ration, with class-specific charges',()=>{
 const f=fixture({coarse:false,classId:'ranger'}),g=f.d.game;const before=f.position();f.press('KeyQ');f.d.stepInput(.2);assert.ok(distance(before,f.position())>3.9);assert.equal(g.player.skills.backStep.cooldown>0,true);
 g.player.hp=20;f.press('KeyE');assert.equal(g.action.kind,'ration');assert.equal(g.player.skills.fieldRation.charges,2);f.d.stepInput(1.5);near(g.player.hp,60);assert.equal(g.player.skills.fieldRation.charges,1);
});
test('F hold searches, release cancels, completed hold opens loot; Tab toggles inventory',()=>{
 const f=fixture({coarse:false}),g=f.d.game;assert.equal(g.getInteraction().kind,'container');f.key('KeyF');f.d.stepInput(.3);assert.equal(g.action.kind,'container');f.key('KeyF',false);assert.equal(g.action,null);
 f.key('KeyF');f.d.stepInput(1.1);assert.equal(f.el('inventoryPanel').hidden,false);assert.ok(g.openContainer.searched);assert.ok(f.neutral());assert.equal(g.paused,false);
 const t=g.time;f.d.stepInput(.2);assert.ok(g.time>t);f.press('Tab');assert.equal(f.el('inventoryPanel').hidden,true);f.press('Tab');assert.equal(f.el('inventoryPanel').hidden,false);f.press('Tab');assert.equal(f.el('inventoryPanel').hidden,true);
});
test('Old I/H bindings do not open the bag or consume a potion',()=>{
 const f=fixture({coarse:false});f.d.game.player.hp=40;const count=f.d.game.player.potions;f.press('KeyI');f.press('KeyH');assert.equal(f.el('inventoryPanel').hidden,true);assert.equal(f.d.game.action,null);assert.equal(f.d.game.player.potions,count);
});
test('X sheath changes equipment state, G rests within recoverable HP, movement wakes',()=>{
 const f=fixture({coarse:false}),g=f.d.game;f.press('KeyX');assert.ok(g.player.sheathed);f.press('KeyX');assert.equal(g.player.sheathed,false);
 g.player.hp=70;g.player.recoverableHp=.5;f.press('KeyG');assert.ok(g.player.resting&&g.player.sheathed);f.d.stepInput(3);near(g.player.hp,70.5);near(g.player.recoverableHp,0);
 f.key('KeyW');f.d.stepInput(.1);assert.equal(g.player.resting,false);f.key('KeyW',false);f.press('KeyG');assert.ok(g.player.resting);f.press('KeyG');assert.equal(g.player.resting,false);
});
test('1/2 select weapon sets and 3/4 select utilities; a potion requires a timed primary action',()=>{
 const f=fixture({coarse:false}),g=f.d.game;f.press('Digit2');assert.equal(g.weaponSetIndex,1);assert.equal(g.activeWeapon.weaponKind,'crossbow');
 f.press('Digit3');assert.equal(g.selectedUtility,0);assert.equal(g.mode,'utility');g.player.hp=40;const potions=g.player.potions;f.mouseDown();f.mouseUp();assert.equal(g.action.kind,'heal');f.d.stepInput(2);assert.equal(g.player.potions,potions);f.d.stepInput(1.1);assert.equal(g.player.potions,potions-1);assert.ok(g.player.potionEffect>0);
 f.press('Digit4');assert.equal(g.selectedUtility,1);assert.equal(g.mode,'utility');f.press('Digit1');assert.equal(g.weaponSetIndex,0);assert.equal(g.selectedUtility,null);assert.equal(g.activeWeapon.weaponKind,'melee');
});
test('Space jumps and R reloads the selected crossbow using reserve ammunition',()=>{
 const f=fixture({coarse:false}),g=f.d.game;f.key('Space');f.d.stepInput(.1);assert.ok(g.player.jump>.1);f.key('Space',false);f.d.stepInput(1);near(g.player.jump,0);
 f.press('Digit2');const before=g.player.arrows,reserve=g.player.reserve;f.mouseDown();f.mouseUp();assert.equal(g.player.arrows,before-1);assert.equal(g.stats.shots,1);f.press('KeyR');assert.equal(g.action.kind,'reload');f.d.stepInput(g.activeWeapon.reloadTime+.1);assert.equal(g.player.arrows,before);assert.equal(g.player.reserve,reserve-1);
});
test('Typing into home fields does not leak WASD or action key input into the game',()=>{
 const f=fixture({coarse:false});f.key('KeyW',true,{target:f.el('seed')});f.key('KeyQ',true,{target:f.el('seed')});near(f.d.getInput().forward,0);near(f.d.game.player.skills.sprint.cooldown,0);
});

// Desktop view, pointer-lock fallback, and mixed input ownership.
test('Captured mouse moves yaw/pitch, clamps pitch, and ignores movement after pause',()=>{
 const f=fixture({coarse:false});assert.equal(f.doc.pointerLockElement,f.el('gl'));const p=f.position();f.mouseMove(100,-25);near(f.position().yaw-p.yaw,.23);near(f.position().pitch-p.pitch,.0575);f.mouseMove(0,-99999);near(f.position().pitch,1.2);
 f.d.pause();const q=f.position();f.mouseMove(100,10);near(f.position().yaw,q.yaw);assert.ok(f.neutral());
});
test('A desktop canvas click first captures the mouse without making an accidental attack',()=>{
 const f=fixture({coarse:false});f.doc.pointerLockElement=null;const calls=f.doc.lockRequests;f.mouseDown();assert.equal(f.doc.lockRequests,calls+1);assert.equal(f.d.game.stats.swings,0);f.mouseUp();f.mouseDown();f.mouseUp();assert.equal(f.d.game.stats.swings,1);
});
test('Arrow-key look defaults off and only the explicit web option enables it',()=>{
 const f=fixture({coarse:false});const p=f.position();f.key('ArrowRight');f.key('ArrowUp');f.d.stepInput(.2);near(f.position().yaw,p.yaw);near(f.position().pitch,p.pitch);
 f.el('keyboardLook').onchange({target:{checked:true}});f.d.stepInput(.2);near(f.position().yaw-p.yaw,.32);near(f.position().pitch-p.pitch,.2);
 f.el('keyboardLook').onchange({target:{checked:false}});const q=f.position();f.d.stepInput(.2);near(f.position().yaw,q.yaw);f.key('ArrowRight',false);f.key('ArrowUp',false);
});
for(const lock of ['throw','reject','missing'])test('Pointer Lock '+lock+' enables arrow fallback without pausing gameplay',async()=>{
 const f=fixture({coarse:false,lock});await flush();assert.equal(f.d.game.paused,false);assert.equal(f.doc.pointerLockElement,null);const yaw=f.position().yaw;f.key('ArrowRight');f.d.stepInput(.2);f.key('ArrowRight',false);near(f.position().yaw-yaw,.32);f.mouseDown();f.mouseUp();assert.equal(f.d.game.stats.swings,1);
});
test('Pointer-lock error fallback is cleared after a successful capture',async()=>{
 const f=fixture({coarse:false});f.doc.pointerLockElement=null;f.doc.dispatchEvent({type:'pointerlockerror'});f.key('ArrowLeft');assert.equal(f.d.getInput().lookX,-1);f.key('ArrowLeft',false);
 f.el('gl').requestPointerLock();await flush();f.key('ArrowLeft');assert.equal(f.d.getInput().lookX,0);f.key('ArrowLeft',false);
});
test('Unexpected Pointer Lock loss pauses and clears held mouse and keyboard input',()=>{
 const f=fixture({coarse:false});f.key('KeyW');f.mouseDown(2);assert.ok(f.d.game.player.guard);f.doc.exitPointerLock();assert.ok(f.d.game.paused);assert.ok(f.neutral());assert.equal(f.el('pause').hidden,false);
});
test('First touch enables a hybrid device without discarding a held keyboard move',()=>{
 const f=fixture({coarse:false});f.key('KeyW');f.doc.body.dispatchEvent({type:'pointerdown',pointerType:'touch',pointerId:44,clientX:100,clientY:100,button:0});assert.equal(f.d.touchState().enabled,true);assert.equal(f.doc.pointerLockElement,null);assert.equal(f.d.game.paused,false);near(f.d.getInput().forward,1);f.key('KeyW',false);
});

// Independent pointer ownership and cancellation.
test('Joystick dead zone, proportional movement and oversized diagonal clamping use actual input',()=>{
 const f=fixture();f.down('move');f.move(1,50,48);near(f.d.getInput().forward,0);f.move(1,50,34);const input=f.d.getInput().forward;assert.ok(input>.2&&input<.8);
 const full=fixture(),a=f.position(),b=full.position();full.down('move',1,50,-50);f.d.stepInput(.2);full.d.stepInput(.2);near(distance(a,f.position())/distance(b,full.position()),input);
 f.move(1,150,-50);near(Math.hypot(f.d.getInput().forward,f.d.getInput().strafe),1);f.up(1);assert.ok(f.neutral());
});
test('A second movement or look pointer cannot steal or release the original owner',()=>{
 const f=fixture();f.down('move',1,50,20);const before=f.d.getInput().forward;f.down('move',2,50,90);f.move(2,50,99);near(f.d.getInput().forward,before);f.up(2);assert.equal(f.d.touchState().moveId,1);
 f.down('look',3,250,50);f.down('look',4,250,50);const yaw=f.position().yaw;f.move(4,290,50);near(f.position().yaw,yaw);f.up(4);assert.equal(f.d.touchState().lookId,3);f.move(3,270,50);assert.ok(f.position().yaw>yaw);f.up(3);f.up(1);assert.ok(f.neutral());
});
test('Move, look and attack work concurrently and release independently',()=>{
 const f=fixture();f.down('move',1,50,15);f.down('look',2,250,50);const p=f.position();f.move(2,275,40);f.down('attack',3);f.d.stepInput(.15);assert.ok(distance(p,f.position())>.1);assert.ok(f.position().yaw>p.yaw);assert.equal(f.d.game.stats.swings,1);assert.equal(f.d.touchState().pointerCount,3);
 f.up(3);f.up(2);assert.ok(f.d.getInput().forward>.5);f.up(1);f.d.stepInput(2);assert.ok(f.neutral());assert.equal(f.d.game.stats.swings,1);
});
test('Unknown pointer motion cannot look; owned look clamps vertical rotation',()=>{
 const f=fixture();const yaw=f.position().yaw;f.move(88,99999,99999);near(f.position().yaw,yaw);f.down('look',1,250,50);f.move(1,250,-99999);near(f.position().pitch,1.2);f.move(1,250,99999);near(f.position().pitch,-1.2);f.up(1);
});
test('A second secondary-action finger cannot cancel the first finger shield hold',()=>{
 const f=fixture();f.down('secondary',1);f.down('secondary',2);assert.equal(f.d.touchState().pointerCount,1);f.up(2);assert.ok(f.d.game.player.guard);f.up(1);assert.ok(f.neutral());assert.equal(f.btn('secondary').getAttribute('aria-pressed'),'false');
});
test('Pointer cancellation and lost capture clear only the matching pointer record',()=>{
 const f=fixture();f.down('move',1,50,15);f.down('secondary',2);f.down('look',3,250,50);f.cancel(1);near(f.d.getInput().forward,0);assert.ok(f.d.game.player.guard);assert.equal(f.d.touchState().lookId,3);
 f.el('touchLook').releasePointerCapture(3);assert.equal(f.d.touchState().lookId,null);assert.ok(f.d.game.player.guard);f.cancel(2);assert.ok(f.neutral());assert.equal(f.btn('secondary').classList.contains('pressed'),false);
});
test('Touch movement release preserves a held keyboard direction',()=>{
 const f=fixture();f.key('KeyW');f.down('move',1,50,75);assert.ok(f.d.getInput().forward<.9);f.up(1);near(f.d.getInput().forward,1);f.key('KeyW',false);assert.ok(f.neutral());
});
for(const release of ['keyboard','touch'])test('F search held by keyboard and touch continues until the final '+release+' release',()=>{
 const f=fixture();f.key('KeyF');f.down('interact',1);f.d.stepInput(.2);
 if(release==='keyboard'){f.up(1);assert.ok(f.d.game.action);assert.ok(f.d.getInput().interact);f.key('KeyF',false)}
 else{f.key('KeyF',false);assert.ok(f.d.game.action);assert.ok(f.d.getInput().interact);f.up(1)}
 assert.equal(f.d.game.action,null);assert.ok(f.neutral());
});
test('Walk, crouch and jump touch holds feed distinct stance inputs',()=>{
 const f=fixture();f.down('move',1,50,10);f.down('walk',2);f.down('crouch',3);assert.ok(f.d.getInput().walk&&f.d.getInput().crouch);f.d.stepInput(.1);assert.ok(f.d.game.player.walking&&f.d.game.player.crouching);
 f.up(2);assert.equal(f.d.getInput().walk,false);assert.ok(f.d.getInput().crouch);f.down('jump',4);f.d.stepInput(.1);assert.ok(f.d.game.player.jump>.1);f.up(4);f.up(3);f.up(1);assert.ok(f.neutral());
});
test('Pause and inventory screen transitions cancel all held controls and restore neutral input',()=>{
 for(const action of ['pause','inventory']){
  const f=fixture();f.key('KeyW');f.down('move',1,50,15);f.down('secondary',2);f.tap(action);assert.ok(f.neutral());assert.equal(f.d.touchState().active,false);assert.equal(f.el('touchControls').hidden,true);
  if(action==='pause'){assert.ok(f.d.game.paused);f.el('resume').click()}else{assert.equal(f.d.game.paused,false);f.el('closeInventory').click()}
  assert.ok(f.neutral());assert.equal(f.d.touchState().active,true);f.move(1,50,10);f.up(2);assert.ok(f.neutral());
 }
});
for(const type of ['resize','orientationchange','blur'])test(type+' clears controls and stale touch events cannot resume movement',()=>{
 const f=fixture();f.key('KeyW');f.down('move',1,50,15);f.down('secondary',2);f.win.dispatchEvent({type});assert.ok(f.neutral());f.move(1,50,10);f.up(2);assert.ok(f.neutral());if(type==='blur')assert.ok(f.d.game.paused);
});
test('Hidden document pauses and restart discards all pointers from the previous run',()=>{
 const f=fixture();f.down('move',1,50,15);f.down('secondary',2);f.doc.hidden=true;f.doc.dispatchEvent({type:'visibilitychange'});assert.ok(f.neutral());assert.ok(f.d.game.paused);f.doc.hidden=false;f.start();f.move(1,50,10);f.up(2);assert.ok(f.neutral());assert.equal(f.d.game.paused,false);
});
test('Touch mode off resets held input, on re-enables it, and invalid values do not replace mode',()=>{
 const f=fixture();f.down('move',1,50,15);f.down('secondary',2);f.el('touchControlsMode').onchange({target:{value:'off'}});assert.equal(f.d.touchState().enabled,false);assert.ok(f.neutral());f.el('touchControlsMode').onchange({target:{value:'on'}});assert.equal(f.d.touchState().enabled,true);assert.ok(f.neutral());f.el('touchControlsMode').onchange({target:{value:'invalid'}});assert.equal(f.d.touchState().mode,'on');
});

// Charged weapons/spells must fire on the final release and never on cancellation.
for(const source of ['touch','mouse'])test(source+' bow: early release cancels; fully drawn hold fires exactly once on release',()=>{
 const f=fixture({coarse:source==='touch',classId:'ranger'}),g=f.d.game;const down=()=>source==='touch'?f.down('attack',1):f.mouseDown(),up=()=>source==='touch'?f.up(1):f.mouseUp();const arrows=g.player.arrows;
 down();assert.ok(g.player.draw);f.d.stepInput(.1);up();assert.equal(g.player.draw,null);assert.equal(g.stats.shots,0);assert.equal(g.player.arrows,arrows);
 down();f.d.stepInput(g.activeWeapon.drawTime+.5);assert.ok(g.player.draw.ready);assert.equal(g.stats.shots,0);up();assert.equal(g.stats.shots,1);assert.equal(g.player.arrows,arrows-1);up();assert.equal(g.stats.shots,1);assert.equal(g.player.primaryHeld,false);
});
for(const event of ['pointercancel','lostpointercapture','blur','inventory','pause'])test('Ready bow '+event+' cancellation never fires or spends ammunition',()=>{
 const f=fixture({classId:'ranger'}),g=f.d.game;const count=g.player.arrows;f.down('attack',1);f.d.stepInput(g.activeWeapon.drawTime+.1);assert.ok(g.player.draw.ready);
 if(event==='pointercancel')f.cancel(1);else if(event==='lostpointercapture')f.btn('attack').releasePointerCapture(1);else if(event==='blur')f.win.dispatchEvent({type:'blur'});else f.tap(event);
 assert.equal(g.player.draw,null);assert.equal(g.stats.shots,0);assert.equal(g.player.arrows,count);f.up(1);assert.equal(g.stats.shots,0);
});
test('Mixed mouse/touch bow ownership preserves draw until the final normal release',()=>{
 const f=fixture({classId:'ranger'}),g=f.d.game;f.down('attack',1);f.mouseDown();f.d.stepInput(g.activeWeapon.drawTime+.1);f.up(1);assert.ok(g.player.draw?.ready);assert.equal(g.stats.shots,0);f.mouseUp();assert.equal(g.stats.shots,1);assert.equal(g.player.draw,null);
});
test('Cancelling a secondary touch must preserve the mouse-owned ready bow draw',()=>{
 const f=fixture({classId:'ranger'}),g=f.d.game;f.mouseDown();f.d.stepInput(g.activeWeapon.drawTime+.1);assert.ok(g.player.draw?.ready);f.down('secondary',2);f.cancel(2);assert.ok(g.player.draw?.ready,'unrelated secondary cancellation must not discard primary owner');assert.equal(g.stats.shots,0);f.mouseUp();assert.equal(g.stats.shots,1);
});
test('Keyboard Q spell picker selects by hover and releases without pausing dungeon time',()=>{
 const f=fixture({coarse:false,classId:'wizard'}),g=f.d.game;f.key('KeyQ');assert.equal(f.el('spellWheel').hidden,false);assert.equal(g.paused,false);assert.equal(f.doc.pointerLockElement,null);assert.equal(f.el('spellChoices').children.length,3);
 const time=g.time;f.key('KeyW');f.d.stepInput(.2);assert.ok(g.time>time);near(f.d.getInput().forward||0,0);const choice=f.el('spellChoices').children[1];choice.dispatchEvent({type:'pointerenter'});assert.equal(g.selectedSpellId,choice.dataset.spell);f.key('KeyQ',false);assert.equal(f.el('spellWheel').hidden,true);assert.ok(f.neutral());assert.equal(f.doc.pointerLockElement,f.el('gl'));
});
test('Spell picker number keys choose spells instead of changing weapon sets or utilities',()=>{
 const f=fixture({coarse:false,classId:'wizard'}),g=f.d.game;f.key('KeyQ');f.press('Digit3');assert.equal(g.selectedSpellId,'zap');assert.equal(g.weaponSetIndex,0);assert.equal(g.selectedUtility,null);assert.equal(f.el('spellWheel').hidden,true);f.key('KeyQ',false);
});
test('Touch skill opens spell picker, cancels movement, and a choice restores neutral controls',()=>{
 const f=fixture({classId:'wizard'});f.down('move',1,50,15);f.tap('skill1');assert.equal(f.el('spellWheel').hidden,false);assert.ok(f.neutral());assert.equal(f.d.touchState().active,false);f.el('spellChoices').children[0].click();assert.equal(f.el('spellWheel').hidden,true);assert.equal(f.d.game.selectedSpellId,'fireball');assert.equal(f.d.touchState().active,true);assert.ok(f.neutral());
});
for(const source of ['touch','mouse'])test(source+' spell: early release does not spend a charge, ready release casts once',()=>{
 const f=fixture({coarse:source==='touch',classId:'wizard'}),g=f.d.game;
 if(source==='touch')f.chooseSpell('fireball');else{f.key('KeyQ');f.press('Digit1');f.key('KeyQ',false)}
 const down=()=>source==='touch'?f.down('secondary',1):f.mouseDown(2),up=()=>source==='touch'?f.up(1):f.mouseUp(2);const count=g.player.charges.fireball;
 down();assert.ok(g.player.cast);f.d.stepInput(.1);up();assert.equal(g.player.cast,null);assert.equal(g.player.charges.fireball,count);assert.equal(g.stats.shots,0);
 down();f.d.stepInput(2.2);assert.ok(g.player.cast.ready);assert.equal(g.player.charges.fireball,count);assert.equal(g.stats.shots,0);up();assert.equal(g.player.charges.fireball,count-1);assert.equal(g.stats.shots,1);up();assert.equal(g.stats.shots,1);assert.equal(g.player.secondaryHeld,false);
});
for(const event of ['pointercancel','lostpointercapture','blur','inventory','pause','special'])test('Ready spell '+event+' cancellation never casts or spends a charge',()=>{
 const f=fixture({classId:'wizard'}),g=f.d.game;f.chooseSpell();const count=g.player.charges.fireball;f.down('secondary',1);f.d.stepInput(2.1);assert.ok(g.player.cast.ready);
 if(event==='pointercancel')f.cancel(1);else if(event==='lostpointercapture')f.btn('secondary').releasePointerCapture(1);else if(event==='blur')f.win.dispatchEvent({type:'blur'});else f.tap(event);
 assert.equal(g.player.cast,null);assert.equal(g.stats.shots,0);assert.equal(g.player.charges.fireball,count);f.up(1);assert.equal(g.stats.shots,0);if(event==='special')assert.equal(g.selectedSpellId,null);
});
test('Wizard E meditation restores spent charges and movement interrupts the channel',()=>{
 const f=fixture({coarse:false,classId:'wizard'}),g=f.d.game;g.player.charges.fireball--;f.press('KeyE');assert.equal(g.action.kind,'meditate');assert.ok(g.player.resting);f.d.stepInput(6);assert.equal(g.player.charges.fireball,4);f.key('KeyW');f.d.stepInput(.1);assert.equal(g.action,null);assert.equal(g.player.resting,false);f.key('KeyW',false);
});
test('Pointer compatibility click cannot double-activate a physical touch attack',()=>{
 const f=fixture();f.tap('attack');f.btn('attack').click(1);f.d.stepInput(2);assert.equal(f.d.game.stats.swings,1);assert.equal(f.d.game.player.primaryHeld,false);
});
test('Synthetic click on a hold-only touch button is ignored, while discrete buttons remain keyboard-activatable',()=>{
 const f=fixture();for(const action of ['attack','secondary','walk','crouch'])f.btn(action).click(0);f.d.stepInput(3);assert.equal(f.d.game.stats.swings,0);assert.ok(f.neutral(),'a click cannot create an unreleasable hold');f.btn('skill1').click(0);assert.equal(f.d.game.player.skills.sprint.remaining,6);
});

test('Cancelling touch primary preserves an independently held touch shield',()=>{
 const f=fixture(),g=f.d.game;f.down('secondary',1);assert.ok(g.player.guard);f.down('attack',2);assert.equal(g.stats.swings,0);f.cancel(2);assert.ok(g.player.guard,'primary cancellation must not release secondary guard');assert.ok(f.d.touchState().secondary);f.up(1);assert.ok(f.neutral());
});
test('Cancelled touch primary hands the shared bow hold back to its mouse owner',()=>{
 const f=fixture({classId:'ranger'}),g=f.d.game;f.down('attack',1);f.mouseDown();f.d.stepInput(g.activeWeapon.drawTime+.1);f.cancel(1);assert.ok(g.player.draw?.ready,'mouse still owns primary');assert.equal(g.stats.shots,0);f.mouseUp();assert.equal(g.stats.shots,1);
});
test('Cancelled touch secondary hands the shared spell hold back to its mouse owner',()=>{
 const f=fixture({classId:'wizard'}),g=f.d.game;f.chooseSpell();f.down('secondary',1);f.mouseDown(2);f.d.stepInput(2.1);const count=g.player.charges.fireball;f.cancel(1);assert.ok(g.player.cast?.ready,'mouse still owns secondary');assert.equal(g.player.charges.fireball,count);f.mouseUp(2);assert.equal(g.stats.shots,1);assert.equal(g.player.charges.fireball,count-1);
});
test('Keyboard R dispatches an axe special attack and cancels a prepared Wizard spell',()=>{
 const f=fixture({coarse:false}),g=f.d.game,axe=f.C.makeItem('axe');assert.ok(g.inventory.add(axe));assert.ok(g.equip(axe.uid));f.press('KeyR');assert.ok(g.player.attack?.special);
 const w=fixture({coarse:false,classId:'wizard'});w.key('KeyQ');w.press('Digit1');w.key('KeyQ',false);w.mouseDown(2);w.d.stepInput(2.1);assert.ok(w.d.game.player.cast.ready);w.press('KeyR');assert.equal(w.d.game.player.cast,null);assert.equal(w.d.game.selectedSpellId,null);w.mouseUp(2);assert.equal(w.d.game.stats.shots,0);assert.equal(w.d.game.player.charges.fireball,4);
});

// Actual app result events must settle the persisted ownership ledger.
test('Full-run F extraction retains real loot and only explicit stash sale turns its value into gold',()=>{
 const f=fixture({coarse:false,training:false}),g=f.d.game;assert.equal(f.d.profile.pending.length,1);const runId=g.runId;
 f.key('KeyF');f.d.stepInput(1.1);f.key('KeyF',false);assert.equal(f.el('inventoryPanel').hidden,false);const first=f.el('lootList').children[0];assert.ok(first);first.click();assert.equal(g.inventory.items.length,1);const item=g.inventory.items[0],value=item.value;assert.ok(value>0);const looseGold=g.player.gold;f.el('closeInventory').click();
 nearExit(f);f.key('KeyF');f.d.stepInput(2.3);f.key('KeyF',false);assert.ok(g.ended&&g.result.success);assert.equal(f.el('home').hidden,false);assert.equal(f.d.profile.pending.length,0);assert.equal(f.d.profile.runs,1);assert.equal(f.d.profile.escapes,1);assert.equal(f.d.profile.gold,looseGold);assert.ok(f.d.profile.stash.some(x=>x.instanceId===item.instanceId));
 const stored=JSON.parse(f.storage.get('crypt_v15_profile'));assert.equal(stored.gold,looseGold);assert.ok(stored.completed.includes(runId));assert.equal(stored.pending.length,0);assert.equal(stored.stash.filter(x=>x.instanceId===item.instanceId).length,1);
 const before=f.d.profile.stash.length;g.finish(true,'duplicate');assert.equal(f.d.profile.stash.length,before);assert.equal(f.d.profile.runs,1);
 f.el('openStash').click();assert.equal(f.el('stashPanel').hidden,false);const sale=f.el('stashList').children.flatMap(x=>x.querySelectorAll('button')).find(x=>x.textContent==='판매 '+value+' G');assert.ok(sale);sale.click();assert.equal(f.d.profile.gold,looseGold+value);assert.equal(f.d.profile.stash.some(x=>x.instanceId===item.instanceId),false);assert.equal(JSON.parse(f.storage.get('crypt_v15_profile')).gold,looseGold+value);
});
function ownedProfile(){return {schema:15,namespace:'input-v15-owned',gold:77,runs:2,escapes:1,nextInstance:3,nextRun:1,stash:[{id:'steelSword',instanceId:'owned:sword',state:'Looted',supplied:false},{id:'gem',instanceId:'owned:gem',state:'Looted',supplied:false}],kits:{fighter:{},ranger:{},wizard:{}},pending:[],completed:[]}}
test('Stash selection feeds the next real loadout; departure withdraws once and death loses that gear',()=>{
 const storage=new Map([['crypt_v15_profile',JSON.stringify(ownedProfile())]]),f=fixture({autoStart:false,coarse:false,storage});f.el('openStash').click();
 const row=f.el('stashList').children.find(x=>x.querySelector('b').textContent===f.C.ITEMS.steelSword.name);assert.ok(row);row.querySelectorAll('button').find(x=>x.textContent==='주무기 세트').click();assert.equal(f.d.profile.getKit('fighter').weapon.instanceId,'owned:sword');
 f.el('closeStash').click();f.start('fighter',false);assert.equal(f.d.game.equipment.weapon.instanceId,'owned:sword');assert.equal(f.d.profile.get('owned:sword'),null);assert.equal(JSON.parse(storage.get('crypt_v15_profile')).stash.some(x=>x.instanceId==='owned:sword'),false);
 f.d.game.finish(false,'test defeat');assert.equal(f.d.profile.get('owned:sword'),null);assert.ok(f.d.profile.get('owned:gem'));assert.equal(f.d.profile.gold,77);assert.equal(f.d.profile.runs,3);assert.equal(f.d.profile.escapes,1);
});
test('Training never withdraws selected stored gear and does not change extraction statistics',()=>{
 const saved=ownedProfile();saved.kits.fighter.weapon='owned:sword';const f=fixture({autoStart:false,storage:new Map([['crypt_v15_profile',JSON.stringify(saved)]])});f.start('fighter',true);assert.ok(f.d.profile.get('owned:sword'));assert.notEqual(f.d.game.equipment.weapon.instanceId,'owned:sword');f.d.game.player.gold=999;f.d.game.inventory.add(f.C.makeItem('gem'));f.d.game.finish(true,'practice complete');assert.equal(f.d.profile.gold,77);assert.equal(f.d.profile.runs,2);assert.equal(f.d.profile.escapes,1);assert.equal(f.d.profile.stash.length,2);assert.equal(f.d.profile.pending.length,0);
});
test('Reloaded pending departure is forfeited once and cannot duplicate withdrawn equipment',()=>{
 const saved=ownedProfile();saved.kits.fighter.weapon='owned:sword';const storage=new Map([['crypt_v15_profile',JSON.stringify(saved)]]),first=fixture({autoStart:false,storage});first.start('fighter',false);assert.equal(first.d.profile.get('owned:sword'),null);
 const reloaded=fixture({autoStart:false,storage});assert.equal(reloaded.d.profile.runs,3);assert.equal(reloaded.d.profile.interruptedRuns,1);assert.equal(reloaded.d.profile.get('owned:sword'),null);assert.equal(reloaded.d.profile.pending.length,0);assert.ok(reloaded.el('storageNotice').textContent.includes('1'));
 const again=fixture({autoStart:false,storage});assert.equal(again.d.profile.runs,3);assert.equal(again.d.profile.interruptedRuns,0);assert.equal(again.d.profile.get('owned:sword'),null);
});

(async()=>{
 for(const {name,fn} of cases){try{await fn();results.push({name,passed:true});console.log('PASS',name)}catch(e){results.push({name,passed:false,error:e.stack});console.error('FAIL',name,e.stack)}}
 const report={suite:'v15 production app + touch + core + rules + game + progression input integration',scope:'Actual six production modules in fresh Node VMs. DOM event/capture, renderer/scene/audio and scheduling fixtures only. No browser layout, WebGL, real Android, or content:// validation.',node:process.version,total:results.length,passed:results.filter(x=>x.passed).length,failed:results.filter(x=>!x.passed).length,results};
 fs.writeFileSync(path.join(__dirname,'input_v15_results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({total:report.total,passed:report.passed,failed:report.failed}));process.exitCode=report.failed?1:0;
})().catch(e=>{console.error(e);process.exitCode=1});
