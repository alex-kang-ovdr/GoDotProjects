'use strict';
// Pure renderer mathematics and scene construction; this is not a browser/GPU test.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const FQ=require('../src/engine.js'),context={FQ};
vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/renderer.js'),'utf8'),context);
const results=[];
function test(name,fn){try{fn();results.push({name,status:'PASS'});}catch(e){results.push({name,status:'FAIL',message:e.message});}}
function renderer(view3D=true,yaw=.65,pitch=.86,zoom=1){const r=Object.create(context.FQRenderer.prototype);r.camera={yaw,pitch,zoom,focusX:480,focusY:300};r.view3D=view3D;r.quality='low';r.gl=null;r.matrices();return r;}
function screenDelta(r,h,v){const d=r.movement(h,v),a=r.project(480,300),b=r.project(480+d.x*10,300+d.y*10);return {x:b.x-a.x,y:b.y-a.y};}
function close(a,b,tol=1e-5){assert(Math.abs(a-b)<tol,`${a} differs from ${b}`);}
for(const [key,h,v,x,y] of [['W',0,-1,0,-10],['S',0,1,0,10],['A',-1,0,-10,0],['D',1,0,10,0]])test(`2D ${key} follows its screen direction`,()=>{const d=screenDelta(renderer(false),h,v);close(d.x,x);close(d.y,y);});
test('3D WASD stays aligned with the screen across camera rotation, pitch and zoom',()=>{
 for(const yaw of [0,.65,Math.PI/2,Math.PI,-Math.PI/2,5.8])for(const pitch of [.45,.86,1.35])for(const zoom of [.46,1,1.6]){
  const r=renderer(true,yaw,pitch,zoom),w=screenDelta(r,0,-1),s=screenDelta(r,0,1),a=screenDelta(r,-1,0),d=screenDelta(r,1,0);
  assert(w.y<0&&s.y>0&&a.x<0&&d.x>0,`directions at ${yaw},${pitch},${zoom}`);close(w.x,0);close(s.x,0);close(a.y,0);close(d.y,0);
 }
});
test('camera rotation preserves normalized diagonal movement speed',()=>{for(const yaw of [0,.65,Math.PI/2,Math.PI]){const r=renderer(true,yaw),p=r.movement(Math.SQRT1_2,-Math.SQRT1_2);close(Math.hypot(p.x,p.y),1);}});
test('screen ground picking is consistent with directional movement',()=>{
 for(const view3D of [false,true]){const r=renderer(view3D),origin=r.project(480,300),up=r.ground(origin.x,origin.y-10),w=r.movement(0,-1);assert((up.x-480)*w.x+(up.y-300)*w.y>0);}
});
function scene(kind,defenderTeam){const r=renderer(),boxes=[],map=FQ.battlefield(kind,defenderTeam),b={map,defenderTeam,time:0,nav:{blocks:[...map.obstacles,...(map.gate?[map.gate]:[])]}};r.box=(...args)=>boxes.push(args);r.terrain(b);return {boxes,map};}
test('river bridges track both attacking and defending river positions',()=>{
 for(const team of ['red','blue']){const {boxes,map}=scene('river',team),bridges=boxes.filter(a=>a[6]==='#aa9572'),x=(map.obstacles.find(r=>r.id==='water-n').x-480)*.1;assert.equal(bridges.length,2);for(const bridge of bridges)close(bridge[0],x);}
});
test('fortress flags use the actual defending team',()=>{
 for(const [team,color,other] of [['red','#984e50','#5797b8'],['blue','#5797b8','#984e50']]){const {boxes}=scene('fort',team);assert.equal(boxes.filter(a=>a[6]===color).length,2);assert.equal(boxes.filter(a=>a[6]===other).length,0);}
});
const report={suite:'v22-input-and-defender-scene',scope:'Node renderer math and generated scene geometry; no browser or GPU verification',passed:results.filter(x=>x.status==='PASS').length,failed:results.filter(x=>x.status==='FAIL').length,tests:results};
fs.writeFileSync(path.join(__dirname,'input-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(report.failed)process.exitCode=1;
