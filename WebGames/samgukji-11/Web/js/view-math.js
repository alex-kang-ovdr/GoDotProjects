/* Projection-independent camera anchor. Never reads or writes simulation state. */
(function(root){
'use strict';
const R2=22,PAD=45,R3=2.65,TAN_HALF_FOV=Math.tan(.35);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function capture(r){
 const c=r.camera;
 return r.is3D
  ?{x:c.x/R3,y:c.y/R3,scale:r.height*c.zoom*R3/(92*TAN_HALF_FOV)}
  :{x:(c.x-PAD)/R2,y:(c.y-PAD)/R2,scale:c.zoom*R2};
}
function apply(view,r){
 if(!view||![view.x,view.y,view.scale].every(Number.isFinite)||view.scale<=0)return false;
 const c=r.camera;
 if(r.is3D){c.x=view.x*R3;c.y=view.y*R3;c.zoom=clamp(view.scale*92*TAN_HALF_FOV/(Math.max(1,r.height)*R3),.065,4.8);}
 else{c.x=PAD+view.x*R2;c.y=PAD+view.y*R2;c.zoom=clamp(view.scale/R2,.04,8);}
 r.updateCamera?.();r.needs=true;return true;
}
const api={capture,apply,R2,PAD,R3};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
else root.RTKViewMath=api;
})(typeof globalThis!=='undefined'?globalThis:this);
