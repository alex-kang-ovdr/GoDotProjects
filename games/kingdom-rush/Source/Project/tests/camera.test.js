'use strict';
const assert=require('node:assert/strict');
require('../src/camera.js');
const C=globalThis.KRCamera;
let checks=0;
function test(name,f){f();checks++;console.log('PASS '+name);}
function near(a,b){assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);}
test('390px touch coordinates address the same world target at 1x and 2.5x',()=>{
  const r={left:25,top:200,width:390,height:241.8},target={x:623,y:270};
  for(const c of [{zoom:1,x:0,y:0},{zoom:2.5,x:410,y:165}]){
    const p=C.worldToScreen(c,target),input=C.fromClient(r,r.left+p.x*r.width/1000,r.top+p.y*r.height/620),actual=C.screenToWorld(c,input);
    near(actual.x,target.x);near(actual.y,target.y);
  }
});
test('zoom keeps the touched map position under the finger away from bounds',()=>{
  const c={zoom:1.5,x:100,y:60},anchor={x:270,y:230},before=C.screenToWorld(c,anchor),after=C.screenToWorld(C.zoomAt(c,2.8,anchor),anchor);
  near(before.x,after.x);near(before.y,after.y);
});
test('drag movement scales with zoom and map cannot be panned beyond its bounds',()=>{
  const moved=C.panBy({zoom:2,x:200,y:100},80,-60);assert.deepEqual(moved,{zoom:2,x:160,y:130});
  assert.deepEqual(C.panBy(moved,-10000,-10000),{zoom:2,x:500,y:310});
  assert.deepEqual(C.panBy(moved,10000,10000),{zoom:2,x:0,y:0});
});
test('reset returns exact whole-map coordinates even after extreme panning',()=>{
  assert.deepEqual(C.zoomAt({zoom:3,x:666,y:413},1),{zoom:1,x:0,y:0});
  assert.deepEqual(C.normalize({zoom:Infinity,x:NaN,y:-Infinity}),{zoom:1,x:0,y:0});
});
console.log(`${checks} camera scenarios passed`);
