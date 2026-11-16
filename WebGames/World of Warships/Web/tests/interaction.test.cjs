/* Regression checks for saved controls, target hit areas and event feedback. */
const assert=require('node:assert/strict');
require('../dist/operations.js');require('../dist/sim.js');require('../dist/interaction.js');require('../dist/render.js');
const IT=globalThis.IronTide,U=IT.Interaction;
let count=0;
function test(name,fn){fn();count++;console.log(`✓ ${name}`);}
const game=IT.createGame({shipClass:'cruiser',seed:44});
test('V2 envelope resumes the actual saved ship aim',()=>{game.player.aimX=1723;game.player.aimY=1182;const c=U.control(null,game);assert.equal(c.aimX,1723);assert.equal(c.aimY,1182);assert.equal(c.sessionType,'free');});
test('V3 controls retain weapon, spread, camera and target',()=>{const c=U.control({ammo:'TORP',spread:'wide',aimX:2000,aimY:1800,binocular:true,targetId:'red-dd'},game);assert.equal(c.ammo,'TORP');assert.equal(c.spread,'wide');assert.equal(c.binocular,true);assert.equal(c.targetId,'red-dd');});
test('Invalid controls cannot produce NaN, huge projection or friendly selection',()=>{const c=U.control({ammo:'HACK',aimX:NaN,aimY:1e99,binocular:'true',targetId:game.playerId,spread:'other'},game);assert.equal(c.ammo,'HE');assert.equal(c.aimX,game.player.aimX);assert.equal(c.aimY,game.world.h*2);assert.equal(c.targetId,null);assert.equal(c.binocular,false);});
test('Battleship cannot restore torpedo UI selection',()=>assert.equal(U.control({ammo:'TORP'},IT.createGame({shipClass:'battleship'})).ammo,'HE'));
test('Campaign context survives reload only with bounded valid metadata',()=>{const valid={sessionType:'campaign',campaignRunId:'run-123',campaignStage:1};assert.equal(U.control(valid,game).sessionType,'campaign');assert.equal(U.control({...valid,campaignStage:3},game).sessionType,'free');assert.equal(U.control({...valid,campaignRunId:'<script>'},game).sessionType,'free');assert.equal(U.control({sessionType:'training'},game).sessionType,'free');});
const hit=(extra={})=>({type:'hit',ownerId:game.playerId,secondary:false,ammo:'AP',result:'penetration',damage:300,...extra});
test('Zero-damage ricochet remains explicit feedback',()=>{const r=U.shotFeedback([hit({result:'ricochet',damage:0})],game.playerId);assert.equal(r.result,'ricochet');assert.equal(r.damage,0);assert.match(r.label,/도탄/);});
test('Grouped salvo reports total actual direct damage and strongest result',()=>{const r=U.shotFeedback([hit(),hit({result:'citadel',damage:1200}),hit({result:'ricochet',damage:0})],game.playerId);assert.equal(r.damage,1500);assert.equal(r.count,3);assert.equal(r.result,'citadel');});
test('Damage-over-time and secondary events never impersonate main-shell hits',()=>{assert.equal(U.shotFeedback([{type:'damage',damage:45,result:'fire'},hit({secondary:true,result:'secondary'}),hit({ownerId:'blue-dd'}),hit({visible:false})],game.playerId),null);assert.equal(U.shotFeedback([],game.playerId),null);});
const renderer=new IT.Renderer({getContext(){return {};},style:{}});renderer.resize(1000,700,1);
const s={id:'enemy',x:2000,y:1500,length:120,width:26,angle:0};
test('Pointer projection remains exact as camera and zoom change in the same frame',()=>{for(const [x,y,z]of[[1950,1500,.4],[2200,1800,1.35],[1700,1100,.17]]){renderer.setViewTransform(x,y,z);const world=renderer.screenToWorld(276,194),screen=renderer.worldToScreen(world.x,world.y);assert.ok(Math.abs(screen.x-276)<1e-9);assert.ok(Math.abs(screen.y-194)<1e-9);}});
test('Transform rejects invalid state and clamps valid zoom',()=>{renderer.setViewTransform(2000,1500,.5);renderer.setViewTransform(NaN,Infinity,NaN);assert.equal(renderer.cameraX,2000);assert.equal(renderer.zoom,.5);renderer.setViewTransform(2000,1500,99);assert.equal(renderer.zoom,3);renderer.setViewTransform(2000,1500,.5);});
test('Small targets keep a usable 48px hull touch area',()=>{const c=renderer.worldToScreen(s.x,s.y);assert.equal(U.pickTarget([s],{x:c.x,y:c.y+23},renderer),s);assert.equal(U.pickTarget([s],{x:c.x,y:c.y+60},renderer),null);});
test('Displayed nameplate selects ship, distant cursor does not',()=>{const c=renderer.worldToScreen(s.x,s.y),off=Math.max(21,s.length*renderer.zoom*.48+9);assert.equal(U.pickTarget([s],{x:c.x+20,y:c.y-off-9},renderer),s);assert.equal(U.pickTarget([s],{x:c.x+85,y:c.y},renderer),null);});
test('Rotated hull selection follows projected ship geometry',()=>{renderer.setViewTransform(2000,1500,1);const rotated={...s,angle:Math.PI/2},c=renderer.worldToScreen(s.x,s.y);assert.equal(U.pickTarget([rotated],{x:c.x,y:c.y+58},renderer),rotated);assert.equal(U.pickTarget([rotated],{x:c.x+60,y:c.y},renderer),null);});
test('Empty visible-contact input cannot select hidden ships',()=>assert.equal(U.pickTarget([],{x:500,y:350},renderer),null));
test('Short click waits for the later of near-ready reload and turret alignment',()=>{assert.ok(U.queueDuration({reload:.7,alignmentTime:0})>.7);assert.ok(U.queueDuration({reload:.2,alignmentTime:1.4})>1.4);assert.equal(U.queueDuration({reload:0,alignmentTime:20}),4.5);});
test('Short click never queues through a long reload or invalid timing',()=>{assert.equal(U.queueDuration({reload:3,alignmentTime:0}),0);assert.equal(U.queueDuration({reload:NaN}),0);});
console.log(`\n${count} interaction checks passed.`);
