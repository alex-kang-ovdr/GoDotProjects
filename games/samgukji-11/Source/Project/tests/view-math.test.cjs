'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {capture,apply}=require('../js/view-math.js');
function renderer(is3D,h=720){return {is3D,height:h,camera:{x:is3D?123:1066,y:is3D?87:767,zoom:1.2,yaw:.72,pitch:.83},updateCamera(){this.updated=true;}};}
function approx(a,b){assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);}
for(const [w,h]of [[1440,950],[390,844],[768,1024],[1920,1080]]){
 test(`camera center and scale 3D -> 2D -> 3D at ${w}x${h}`,()=>{const a=renderer(true,h),before={...a.camera},b=renderer(false,h);apply(capture(a),b);apply(capture(b),a);approx(a.camera.x,before.x);approx(a.camera.y,before.y);approx(a.camera.zoom,before.zoom);assert.equal(a.camera.yaw,before.yaw);assert.equal(a.camera.pitch,before.pitch);});
}
for(const view of [null,{}, {x:NaN,y:0,scale:1},{x:0,y:Infinity,scale:1},{x:0,y:0,scale:0},{x:0,y:0,scale:-1}])test(`invalid camera anchor safely rejected ${JSON.stringify(view)}`,()=>{const r=renderer(false),before={...r.camera};assert.equal(apply(view,r),false);assert.deepEqual(r.camera,before);});
test('camera capture is read-only',()=>{for(const v of [true,false]){const r=renderer(v),before=JSON.stringify(r);capture(r);assert.equal(JSON.stringify(r),before);}});
test('2D atlas supports expanded full-map zoom',()=>{const r=renderer(false);apply({x:50,y:30,scale:2.2},r);approx(r.camera.zoom,.1);});
test('3D clamp protects camera near and far planes',()=>{const r=renderer(true);apply({x:5,y:3,scale:1e6},r);assert.equal(r.camera.zoom,4.8);apply({x:5,y:3,scale:1e-9},r);assert.equal(r.camera.zoom,.065);});
test('2D clamp rejects unusable zoom while preserving center',()=>{const r=renderer(false);apply({x:5,y:3,scale:1e6},r);assert.equal(r.camera.zoom,8);apply({x:5,y:3,scale:1e-9},r);assert.equal(r.camera.zoom,.04);approx(capture(r).x,5);approx(capture(r).y,3);});
test('repeated 100 camera round trips have no observable center drift',()=>{const a=renderer(true),b=renderer(false),before=capture(a);for(let i=0;i<100;i++){apply(capture(a),b);apply(capture(b),a);}const after=capture(a);approx(after.x,before.x);approx(after.y,before.y);approx(after.scale,before.scale);});
