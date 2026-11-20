'use strict';
const assert=require('node:assert/strict');require('../src/camera.js');require('../src/picking.js');
const P=globalThis.KRPicking,C=globalThis.KRCamera;let checks=0;
function test(name,f){f();checks++;console.log('PASS '+name);}
const e=(id,x,y,extra={})=>({id,x,y,hp:40,defId:'goblin',radius:9,...extra});
test('22px mobile touch tolerance survives 1x, 2x and 3x map zoom',()=>{
  for(const zoom of [1,2,3]){const target=e(1,500,300),cam={zoom,x:300-300/zoom,y:200-200/zoom},point=P.enemyAnchor(target);point.x+=20/(.36*zoom);assert.equal(P.pickEnemy([target],point,cam,{width:360,height:223.2},'touch'),target);point.x+=10/(.36*zoom);assert.equal(P.pickEnemy([target],point,cam,{width:360,height:223.2},'touch'),null);}
});
test('nearest visible sprite wins regardless of spawn array order',()=>{
  const a=e(1,480,300),b=e(2,500,300),p=P.enemyAnchor(b);assert.equal(P.pickEnemy([a,b],p,{}, {width:360,height:223.2},'touch'),b);assert.equal(P.pickEnemy([b,a],p,{}, {width:360,height:223.2},'touch'),b);
});
test('air target follows visible body rather than ground shadow, and dead targets are excluded',()=>{
  const a=e(1,500,300,{air:true,defId:'gargoyle'});assert.equal(P.pickEnemy([a],{x:500,y:266},{},{}),a);assert.equal(P.pickEnemy([a],{x:500,y:300},{},{}),null);a.dead=true;assert.equal(P.pickEnemy([a],{x:500,y:266},{},{}),null);
});
test('off-camera enemies and invalid pointer values cannot intercept a target',()=>{
  const off=e(1,100,100),visible=e(2,600,350);assert.equal(P.pickEnemy([off],P.enemyAnchor(off),{zoom:3,x:500,y:250},{width:360,height:223.2},'touch'),null);assert.equal(P.pickEnemy([visible],{x:NaN,y:0},{},{}),null);
});
console.log(`${checks} picking scenarios passed`);
