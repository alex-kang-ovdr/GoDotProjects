/* Pointer-owned mobile controls. No synthetic keyboard or mouse events. */
(function(root){
'use strict';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
class TouchControls{
 constructor({document,window,canUse,onAction,onLook,onMode}){
  this.doc=document;this.win=window;this.canUse=canUse;this.onAction=onAction;this.onLook=onLook;this.onMode=onMode;
  this.root=document.getElementById('touchControls');this.move=document.getElementById('touchMove');this.stick=document.getElementById('touchStick');this.look=document.getElementById('touchLook');
  this.mode='auto';this.detected=false;this.enabled=false;this.active=false;this.sensitivity=.006;this.forward=0;this.strafe=0;this.pointers=new Map();this.buttons=new Map();this.moveId=null;this.lookId=null;
  this.media=window.matchMedia('(any-pointer: coarse)');
  this.detected=this.media.matches||(window.navigator.maxTouchPoints>0&&!window.matchMedia('(hover: hover)').matches);
  this.bindSurface(this.move,'move');this.bindSurface(this.look,'look');
  for(const el of this.root.querySelectorAll('[data-touch-action]'))this.bindSurface(el,'button',el.dataset.touchAction);
  this.doc.addEventListener('pointerdown',e=>{
   if(e.pointerType==='touch'&&!this.detected){this.detected=true;this.configure()}
  },true);
  // Capture keeps each finger attached to its original role, including off-pad release.
  this.doc.addEventListener('pointermove',e=>this.pointerMove(e),{passive:false});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])this.doc.addEventListener(type,e=>this.pointerEnd(e),true);
  this.root.addEventListener('contextmenu',e=>e.preventDefault());
  this.root.addEventListener('click',e=>{
   // Physical pointers act on pointerdown. A keyboard-activated button has detail=0.
   const el=e.target.closest?.('[data-touch-action]');
   if(el&&e.detail===0&&this.active&&!['attack','secondary','interact','jump','walk','crouch'].includes(el.dataset.touchAction))this.onAction(el.dataset.touchAction,true);
   e.preventDefault();
  });
  this.media.addEventListener?.('change',()=>{if(this.mode==='auto')this.configure()});
  this.win.addEventListener('resize',()=>this.reset());
  this.win.addEventListener('orientationchange',()=>this.reset());
  this.win.addEventListener('blur',()=>this.reset());
  this.doc.addEventListener('visibilitychange',()=>{if(this.doc.hidden)this.reset()});
  this.configure();
 }
 setMode(mode){if(!['auto','on','off'].includes(mode))return;this.mode=mode;this.configure()}
 configure(){
  const enabled=this.mode==='on'||(this.mode==='auto'&&(this.detected||this.media.matches));
  if(enabled!==this.enabled){this.reset();this.enabled=enabled;this.doc.body.classList.toggle('touchMode',enabled);this.onMode?.(enabled)}
  this.sync();
 }
 sync(){
  const active=this.enabled&&this.canUse();
  if(this.active&&!active)this.reset();
  this.active=active;this.root.hidden=!active;this.doc.body.classList.toggle('touchPlaying',active);
 }
 bindSurface(el,kind,action){
  el.addEventListener('pointerdown',e=>{
   if(!this.active||!this.canUse()||(e.pointerType==='mouse'&&e.button!==0))return;
   e.preventDefault();e.stopPropagation();
   if(this.pointers.has(e.pointerId)||(kind==='move'&&this.moveId!==null)||(kind==='look'&&this.lookId!==null)||(kind==='button'&&this.buttons.has(action)))return;
   const record={kind,action,el,x:e.clientX,y:e.clientY};
   if(kind==='move'){
    const r=el.getBoundingClientRect();record.cx=r.left+r.width/2;record.cy=r.top+r.height/2;record.radius=Math.max(24,Math.min(r.width,r.height)*.32);this.moveId=e.pointerId;
   }else if(kind==='look')this.lookId=e.pointerId;
   else{this.buttons.set(action,e.pointerId);el.classList.add('pressed');if(['attack','secondary','walk','crouch','interact','jump'].includes(action))el.setAttribute('aria-pressed','true')}
   this.pointers.set(e.pointerId,record);
   try{el.setPointerCapture(e.pointerId)}catch(_){}
   if(kind==='move')this.updateMove(record,e.clientX,e.clientY);
   if(kind==='button')this.onAction(action,true);
  },{passive:false});
 }
 updateMove(record,x,y){
  const dx=x-record.cx,dy=y-record.cy,distance=Math.hypot(dx,dy),radius=record.radius;
  const amount=clamp((distance/radius-.14)/.86,0,1),divisor=distance||1;
  this.strafe=dx/divisor*amount;this.forward=-dy/divisor*amount;
  const scale=Math.min(1,radius/divisor);
  this.stick.style.transform=`translate(${(dx*scale).toFixed(2)}px,${(dy*scale).toFixed(2)}px)`;
  this.move.classList.toggle('pressed',amount>0);
 }
 pointerMove(e){
  const record=this.pointers.get(e.pointerId);if(!record)return;
  if(!this.active||!this.canUse()){this.reset();return}
  e.preventDefault();
  if(record.kind==='move')this.updateMove(record,e.clientX,e.clientY);
  else if(record.kind==='look'){
   const dx=e.clientX-record.x,dy=e.clientY-record.y;
   record.x=e.clientX;record.y=e.clientY;
   this.onLook(dx*this.sensitivity,dy*this.sensitivity);
  }
 }
 pointerEnd(e){
  const record=this.pointers.get(e.pointerId);if(!record)return;
  this.pointers.delete(e.pointerId);
  if(record.kind==='move'){this.moveId=null;this.forward=0;this.strafe=0;this.stick.style.transform='translate(0px,0px)';this.move.classList.remove('pressed')}
  else if(record.kind==='look')this.lookId=null;
  else{this.buttons.delete(record.action);record.el.classList.remove('pressed');if(['attack','secondary','walk','crouch','interact','jump'].includes(record.action))record.el.setAttribute('aria-pressed','false');this.onAction(record.action,false,{cancelled:e.type!=='pointerup'})}
  try{if(record.el.hasPointerCapture(e.pointerId))record.el.releasePointerCapture(e.pointerId)}catch(_){}
 }
 held(action){return this.buttons.has(action)}
 reset(){
  // Clear state before callbacks/release: lostpointercapture may fire synchronously.
  const records=[...this.pointers.entries()],held=[...this.buttons.keys()];
  this.pointers.clear();this.buttons.clear();this.moveId=null;this.lookId=null;this.forward=0;this.strafe=0;
  this.move.classList.remove('pressed');this.stick.style.transform='translate(0px,0px)';
  for(const [id,record] of records){record.el.classList.remove('pressed');if(record.kind==='button'&&['attack','secondary','walk','crouch','interact','jump'].includes(record.action))record.el.setAttribute('aria-pressed','false');try{if(record.el.hasPointerCapture(id))record.el.releasePointerCapture(id)}catch(_){}}
  for(const action of held)this.onAction(action,false,{cancelled:true});
 }
 snapshot(){return{enabled:this.enabled,active:this.active,mode:this.mode,forward:this.forward,strafe:this.strafe,attack:this.held('attack'),secondary:this.held('secondary'),guard:this.held('secondary'),interact:this.held('interact'),jump:this.held('jump'),walk:this.held('walk'),crouch:this.held('crouch'),pointerCount:this.pointers.size,moveId:this.moveId,lookId:this.lookId}}
}
root.CryptTouch={TouchControls};
if(typeof module!=='undefined'&&module.exports)module.exports=root.CryptTouch;
})(typeof window!=='undefined'?window:globalThis);
