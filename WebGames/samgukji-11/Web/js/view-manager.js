/* One Engine, two views. #world is a permanent, transparent input surface.
 * Canvas2D and WebGL2 use separate canvases; only the active renderer runs.
 * Mode selection is a local UI preference, not part of the game save/RNG.
 */
(function(root){
'use strict';
const PREF_KEY='rtk11-view-preferences-v3';
const transient=['selection','mode','reach','grid','fx','moves','ghosts','headings','unitCache','audio'];
function readPreferences(){try{const p=JSON.parse(localStorage.getItem(PREF_KEY)||'{}');return p&&typeof p==='object'?p:{};}catch{return {};}}
class ViewManager{
 constructor(input,mini,getState){
  this.input=input;this.mini=mini;this.getState=getState;this.views={};this.layers={};this.active=null;
  this.viewMode=null;this.unavailable3D=null;this.onModeChange=null;this.onError=null;this.disposed=false;
  this.preferences=readPreferences();this._quality=['low','medium','high'].includes(this.preferences.quality)?this.preferences.quality:(innerWidth<700?'low':'medium');
  this._sound=false;this.switchCount=0;
  this.switchMode(this.preferences.mode==='2d'?'2d':'3d',{persist:false,reason:'startup'});
  // The old UI and QA API delegate to whichever renderer is currently active.
  // Manager-owned operations (switchMode/reset/consume etc.) take precedence.
  return new Proxy(this,{
   get:(target,prop)=>{if(prop in target){const v=Reflect.get(target,prop,target);return typeof v==='function'?v.bind(target):v;}const r=target.active,v=r?.[prop];return typeof v==='function'?v.bind(r):v;},
   set:(target,prop,value)=>{if(prop in target||!target.active)return Reflect.set(target,prop,value,target);target.active[prop]=value;return true;}
  });
 }
 get is3D(){return this.viewMode==='3d';}
 get quality(){return this._quality;}
 get sound(){return this._sound;}
 set sound(value){this._sound=!!value;for(const r of Object.values(this.views))r.sound=this._sound;}
 savePreference(){try{localStorage.setItem(PREF_KEY,JSON.stringify({mode:this.preferences.mode||'3d',quality:this._quality}));return true;}catch{return false;}}
 setQuality(q){this._quality=['low','medium','high'].includes(q)?q:'medium';const r=this.views['3d'];if(r){r.quality=this._quality;if(r.active)r.setQuality(this._quality);}this.savePreference();}
 ensure(mode){
  if(this.views[mode])return this.views[mode];
  if(mode==='3d'&&this.unavailable3D)throw new Error(this.unavailable3D);
  const canvas=document.createElement('canvas');canvas.id='world-'+mode;canvas.className='world-layer';canvas.setAttribute('aria-hidden','true');this.input.before(canvas);this.layers[mode]=canvas;
  try{
   const Ctor=mode==='3d'?root.RTK3D.Renderer3D:root.RTK2DRenderer;
   const r=new Ctor(canvas,this.mini,this.getState,{autoStart:false});this.views[mode]=r;r.sound=this._sound;
   if(mode==='3d'){r.quality=this._quality;r.onError=err=>this.fail3D(err);}
   return r;
  }catch(err){canvas.__rtkRenderer?.dispose();canvas.remove();delete this.layers[mode];if(mode==='3d')this.unavailable3D=String(err.message||err);throw err;}
 }
 switchMode(requested,{persist=true,reason='user'}={}){
  if(!['2d','3d'].includes(requested))throw new TypeError('화면 모드는 2d 또는 3d여야 합니다.');
  if(this.disposed)return false;
  if(requested===this.viewMode){if(persist){this.preferences.mode=requested;this.savePreference();}return true;}
  const old=this.active,anchor=old?root.RTKViewMath.capture(old):null;
  let targetMode=requested,target,failed=null;
  try{target=this.ensure(targetMode);}catch(err){if(targetMode!=='3d')throw err;failed=err;targetMode='2d';target=this.ensure('2d');}
  if(old!==target){
   old?.setActive(false);
   if(old)for(const name of transient)if(old[name]!==undefined)target[name]=old[name];
   target.hover=null;this.active=target;this.viewMode=targetMode;
   target.sound=this._sound;target.setActive(true);
   if(anchor)root.RTKViewMath.apply(anchor,target);
   target.needs=true;target.updateCamera?.();this.switchCount++;
  }
  // An unavailable GPU must not overwrite the user's preference for a future reload.
  if(persist&&!failed){this.preferences.mode=requested;this.savePreference();}
  this.updateStatus();
  this.onModeChange?.({mode:this.viewMode,requested,reason,failed:!!failed});
  if(failed)this.onError?.(failed);
  return targetMode===requested;
 }
 fail3D(err){
  this.unavailable3D=String(err?.message||err||'3D 렌더링 오류');
  if(this.viewMode==='3d')this.switchMode('2d',{persist:false,reason:'gpu-fallback'});
  const failed=this.views['3d'];if(failed){failed.dispose();failed.canvas.remove();delete this.views['3d'];delete this.layers['3d'];}
  this.updateStatus();this.onError?.(err);
 }
 updateStatus(){
  const d=document,badge=d.getElementById('render-status');
  if(badge)badge.textContent=this.is3D?'3D · WEBGL2':this.unavailable3D?'2D · GPU 대체 모드':'2D · 전술 지도';
  d.body.dataset.viewMode=this.viewMode;d.body.classList.toggle('view-2d',!this.is3D);d.body.classList.toggle('fallback-2d',!!this.unavailable3D);
  for(const b of d.querySelectorAll('[data-view-mode]')){const selected=b.dataset.viewMode===this.viewMode;b.classList.toggle('on',selected);b.setAttribute('aria-pressed',String(selected));b.disabled=b.dataset.viewMode==='3d'&&!!this.unavailable3D;if(b.disabled)b.title='3D를 사용할 수 없습니다. JSON 저장 후 브라우저를 다시 열어 재시도하세요.';}
  for(const id of ['rotate-left','rotate-right','quality-select']){const el=d.getElementById(id);if(el)el.disabled=!this.is3D;}
  const fps=d.getElementById('fps-label');if(fps&&!this.is3D)fps.textContent='2D';
  this.input.setAttribute('aria-label',(this.is3D?'3D 입체 전장':'2D 전술 지도')+'. 도시와 부대를 클릭하세요. B 키로 화면 모드 전환.');
 }
 consume(effects){this.active.consume(effects);}
 reset(){for(const r of Object.values(this.views))r.reset();}
 resize(){this.active?.resize();}
 captureView(){return root.RTKViewMath.capture(this.active);}
 dispose(){if(this.disposed)return;this.disposed=true;const audio=new Set(Object.values(this.views).map(r=>r.audio).filter(Boolean));for(const r of Object.values(this.views)){r.dispose();r.canvas.remove();}for(const a of audio)a.close?.();this.views={};this.layers={};this.active=null;}
}
root.RTKRenderer=ViewManager;
root.RTKViews={ViewManager,PREF_KEY};
})(window);
