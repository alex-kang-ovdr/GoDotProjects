'use strict';
// Executes the actual software renderer with a native Canvas implementation.
// This is NOT a browser, WebGL, responsive-layout, or real-device test.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const FQ=require('../src/engine.js');
const paths=[process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,process.cwd()].filter(Boolean);
let canvas;
try{canvas=require(require.resolve('@napi-rs/canvas',{paths}));}catch(e){throw Error('Optional test dependency @napi-rs/canvas is required. The game itself needs no packages.');}
const {createCanvas}=canvas;
// Match the browser's CJK-capable system-ui fallback for this native test only.
const testFont=process.env.FQ_TEST_FONT||'/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc';
if(fs.existsSync(testFont))canvas.GlobalFonts.registerFromPath(testFont,'system-ui');
const root=path.resolve(__dirname,'..'),out=path.join(__dirname,'software-renders');fs.mkdirSync(out,{recursive:true});
const scope={FQ,window:{devicePixelRatio:1}};
vm.createContext(scope);vm.runInContext(fs.readFileSync(path.join(root,'src/renderer.js'),'utf8'),scope);
function renderer(){
 const scene=createCanvas(960,600),hud=createCanvas(960,600);
 for(const c of [scene,hud]){c.style={};c.parentElement={clientWidth:960};}
 const gl={width:960,height:600,style:{},getContext:()=>null,addEventListener:()=>{}};
 return {r:new scope.FQRenderer(scene,gl,hud),scene,hud};
}
function battle(id=4,defense=false){
 const g=new FQ.Game();g.newGame('hybrid-repoN-v19');
 if(defense){g.activeArmy.region=id;g.world.regions[id].owner='blue';g.world.regions[id].garrison=[];g.world.enemyArmies[0].region=id;g.processCampaign(g.world);}
 assert(g.startBattle(id,!defense));g.paused=true;return g;
}
function capture(v,name){const c=createCanvas(960,600),ctx=c.getContext('2d');ctx.drawImage(v.scene,0,0);ctx.drawImage(v.hud,0,0);fs.writeFileSync(path.join(out,name),c.toBuffer('image/png'));}
const tests=[];
function test(name,fn){try{fn();tests.push({name,status:'PASS'});}catch(e){tests.push({name,status:'FAIL',message:e.stack});}}
test('Actual CPU 3D renderer draws observed battle without mutating simulation',()=>{
 const g=battle(),v=renderer(),before=JSON.stringify(g.snapshotBattle());v.r.render(g);
 assert.equal(v.r.gl,null);assert(v.r.boxes.length>100);assert.equal(JSON.stringify(g.snapshotBattle()),before);
 for(const b of v.r.boxes)assert(b.m.every(Number.isFinite)&&b.color.every(Number.isFinite));
 const image=v.scene.getContext('2d').getImageData(0,0,960,600).data;assert(image.some((n,i)=>i%4!==3&&n>0));
});
test('Mirrored defensive river bridges align with collision water coordinates',()=>{
 for(const defense of [false,true]){const g=battle(4,defense),v=renderer();v.r.render(g);
  const x=(g.battle.map.obstacles.find(o=>o.id==='water-n').x-480)*.1;
  const slabs=v.r.boxes.filter(b=>Math.abs(b.m[13]-.08)<1e-6&&Math.abs(b.m[0]-12)<1e-6);
  assert.equal(slabs.length,2);assert(slabs.every(b=>Math.abs(b.m[12]-x)<1e-5));
  if(defense){assert.equal(g.battle.defenderTeam,'blue');capture(v,'defense-cpu-v22.png');}
 }
});
test('CPU detailed and simplified geometry keep identical game state',()=>{
 const g=battle(2),v=renderer(),before=JSON.stringify(g.snapshotBattle());v.r.quality='high';v.r.render(g);const high=v.r.boxes.length;
 v.r.quality='low';v.r.render(g);assert(v.r.boxes.length<high);assert.equal(JSON.stringify(g.snapshotBattle()),before);
});
test('Actual 2D renderer handles mirrored defense and retreat indicators',()=>{
 const g=battle(4,true),v=renderer();g.selected.hp=g.selected.maxHp*.2;g.retreatUnit();v.r.view3D=false;v.r.render(g);
 assert.equal(v.scene.style.display,'block');assert.equal(v.r.glCanvas.style.display,'none');capture(v,'defense-2d-v22.png');
});
test('Rest recovery HUD and field rendering run on a simulated resting formation',()=>{
 const g=battle(2),v=renderer();g.paused=false;g.issue('rest');
 for(const u of g.battle.units.filter(u=>u.team==='blue')){u.fatigue=70;u.hp=Math.max(1,u.maxHp-70);const p=g.slot(u,g.selectedGroup);u.x=p.x;u.y=p.y;}
 for(let i=0;i<420;i++)g.tick();g.paused=true;assert.equal(g.restStatus(g.selected).state,'recovering');
 const before=JSON.stringify(g.snapshotBattle());v.r.quality='high';v.r.render(g);capture(v,'rest-cpu-v22.png');assert.equal(JSON.stringify(g.snapshotBattle()),before);
});
const report={suite:'v22-native-canvas-software-renderer',environment:'Node VM + @napi-rs/canvas; no browser / WebGL',passed:tests.filter(t=>t.status==='PASS').length,failed:tests.filter(t=>t.status==='FAIL').length,tests};
fs.writeFileSync(path.join(__dirname,'render-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(report.failed)process.exitCode=1;
