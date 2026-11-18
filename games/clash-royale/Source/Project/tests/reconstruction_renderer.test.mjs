import test from 'node:test';
import assert from 'node:assert/strict';
import { CARDS } from '../dist/js/engine.js';
import { ArenaRenderer, cardIcon } from '../dist/js/renderer.js';
import { ArenaRenderer3D, projectGround } from '../dist/js/renderer3d.js';
import { withRendererEnvironment } from './fixtures/webgl-recorder.mjs';

const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const near=(actual,expected,tolerance=.002)=>assert.ok(Number.isFinite(actual)&&Math.abs(actual-expected)<tolerance,`${actual} != ${expected}`);
const project=(x,y,orientation)=>orientation==='landscape'?{x:y,y:480-x}:{x,y};
function unit(cardId='minion_giant',overrides={}) {
  return {...CARDS[cardId],id:`render-${cardId}`,cardId,team:'player',kind:'unit',x:180,y:420,
    hp:CARDS[cardId].hp,maxHp:CARDS[cardId].hp,active:true,deployRemaining:0,
    facing:-Math.PI/2,stunRemaining:0,groundedRemaining:0,...overrides};
}
const state=(units=[],extra={})=>({time:8,phase:'regulation',running:true,units,towers:[],projectiles:[],effects:[],areas:[],...extra});
function renderer3d(env) {
  const renderer=new ArenaRenderer3D(env.hud,env.surface);
  env.cleanup.push(()=>renderer.destroy());return renderer;
}
function drawMesh(renderer,env,scene,options={}) {
  const start=env.gl.calls.length,hudStart=env.hud.calls.length;
  renderer.draw({state:scene},{reducedMotion:true,...options});
  const upload=env.gl.calls.slice(start).find(c=>c.name==='bufferData'&&c.args[2]===env.gl.DYNAMIC_DRAW);
  return {vertices:upload?Array.from(env.gl.buffers.get(upload.buffer).data):[],hud:env.hud.calls.slice(hudStart)};
}
function heightBounds(vertices) {
  let min=Infinity,max=-Infinity;
  for(let i=1;i<vertices.length;i+=10){min=Math.min(min,vertices[i]);max=Math.max(max,vertices[i]);}
  return {min,max};
}
function finiteMesh(vertices) {
  assert.ok(vertices.length>0);assert.equal(vertices.length%30,0);
  assert.ok(vertices.every(Number.isFinite),'submitted triangle positions and normals must be finite');
  for(let i=0;i<vertices.length;i+=10)for(let k=6;k<10;k++)assert.ok(vertices[i+k]>=0&&vertices[i+k]<=1);
}
function clientAtHeight(renderer,rect,entity,height) {
  const p=projectGround(entity.x,entity.y,renderer.camera,height),scale=Math.min(rect.width/renderer.camera.width,rect.height/renderer.camera.height);
  return {x:rect.left+(rect.width-renderer.camera.width*scale)/2+p.x*scale,
    y:rect.top+(rect.height-renderer.camera.height*scale)/2+p.y*scale};
}

test('new card icons are distinct original static SVG with the existing safe fallback',()=>{
  const ids=['minion_giant','vines','minions','knight','poison'];
  assert.equal(new Set(ids.map(id=>cardIcon(id))).size,ids.length);
  for(const id of ['minion_giant','vines']) {
    const icon=cardIcon(id,64);
    assert.match(icon,/^<svg xmlns=/);assert.match(icon,/width="64" height="64"/);
    assert.doesNotMatch(icon,/<script|<foreignObject|(?:href|onload|onclick)=/i);
    assert.match(cardIcon(id,999),/width="256"/);
  }
  assert.equal(cardIcon('<script>bad</script>'),cardIcon('knight'));
});

test('2D flight elevation and ground shadow follow temporary grounding and restore without changing units',()=>withRendererEnvironment(env=>{
  const renderer=new ArenaRenderer(env.hud);env.cleanup.push(()=>renderer.destroy());
  for(const orientation of ['portrait','landscape'])for(const id of ['minions','minion_giant']) {
    renderer.setOrientation(orientation);
    const flying=freeze(unit(id)),bound=freeze({...flying,groundedRemaining:1.5,stunRemaining:1.5});
    const point=project(flying.x,flying.y,orientation),before=JSON.stringify([flying,bound]);
    const draw=entity=>{const start=env.hud.calls.length;renderer.draw({state:freeze(state([entity]))},{reducedMotion:true,selectedEntityId:entity.id});return env.hud.calls.slice(start);};
    const flight=draw(flying),ground=draw(bound),restored=draw(flying);
    const origin=(calls,y)=>calls.some(c=>c.name==='translate'&&c.args[0]===point.x&&c.args[1]===y);
    assert.ok(origin(flight,point.y-7));assert.ok(origin(ground,point.y));assert.ok(origin(restored,point.y-7));
    assert.ok(!origin(ground,point.y-7),'a grounded sprite must not keep the airborne offset');
    const shadow=calls=>calls.find(c=>c.name==='ellipse'&&c.args[0]===point.x+1.5&&c.args[1]===point.y+4);
    assert.ok(shadow(ground).args[2]<shadow(flight).args[2],'the ground contact shadow is tighter');
    assert.deepEqual(shadow(flight),shadow(restored));
    assert.ok(ground.some(c=>c.name==='stroke'&&c.stroke==='#c3e49c'),'grounding retains a visible vine binding');
    assert.ok(!restored.some(c=>c.name==='stroke'&&c.stroke==='#c3e49c'));
    assert.equal(JSON.stringify([flying,bound]),before);assert.equal(bound.flying,true);
  }
}));

test('3D grounding moves mesh, health HUD and triangle picking together, then restores the flying model',()=>withRendererEnvironment(env=>{
  const renderer=renderer3d(env);
  for(const orientation of ['portrait','landscape'])for(const id of ['minions','minion_giant']) {
    renderer.setOrientation(orientation);
    const flying=freeze(unit(id)),bound=freeze({...flying,groundedRemaining:1,stunRemaining:1});
    const before=JSON.stringify([flying,bound]);
    const flight=drawMesh(renderer,env,freeze(state([flying]))),fb=heightBounds(flight.vertices);
    const headHeight=id==='minion_giant'?60:47;
    const raised=clientAtHeight(renderer,env.rect,flying,headHeight);
    assert.equal(renderer.pickEntity(raised.x,raised.y,[flying]),flying,`${orientation}/${id} flying head`);
    const ground=drawMesh(renderer,env,freeze(state([bound]))),gb=heightBounds(ground.vertices);
    const lowered=clientAtHeight(renderer,env.rect,bound,headHeight-23);
    assert.equal(renderer.pickEntity(lowered.x,lowered.y,[bound]),bound,`${orientation}/${id} grounded head`);
    assert.equal(renderer.pickEntity(raised.x,raised.y,[bound]),null,'picking must not retain the elevated model');
    near(fb.max-gb.max,23);assert.ok(gb.min<3,'bound model contacts the ground');
    const health=frame=>frame.hud.find(c=>c.name==='fillRect'&&c.fill==='#79d8ea'&&c.args[3]===4);
    assert.ok(health(ground).args[1]>health(flight).args[1],'the health bar follows the lowered mesh');
    assert.ok(ground.hud.some(c=>c.name==='fillText'&&c.args[0]==='접지'));
    const restored=drawMesh(renderer,env,freeze(state([flying])));
    assert.deepEqual(restored.vertices,flight.vertices);
    assert.deepEqual(health(restored),health(flight));
    assert.equal(renderer.pickEntity(raised.x,raised.y,[flying]),flying);
    finiteMesh(flight.vertices);finiteMesh(ground.vertices);
    assert.ok(ground.vertices.length/30<500,'the added model and roots stay a bounded low-poly mesh');
    assert.equal(JSON.stringify([flying,bound]),before);assert.equal(bound.flying,true);
  }
}));

test('Minion Giant has a larger distinct 3D silhouette and its ranged projectile is not the generic bullet',()=>withRendererEnvironment(env=>{
  const renderer=renderer3d(env);renderer.setOrientation('landscape');
  const small=drawMesh(renderer,env,freeze(state([unit('minions')])));
  const large=drawMesh(renderer,env,freeze(state([unit('minion_giant')])));
  assert.ok(heightBounds(large.vertices).max>heightBounds(small.vertices).max+10);
  assert.ok(large.vertices.length>small.vertices.length);
  const projectile=freeze({id:'orb',cardId:'minion_giant',team:'player',x:220,y:410,tx:220,ty:150,radius:3});
  const orb=drawMesh(renderer,env,freeze(state([],{projectiles:[projectile]})));
  finiteMesh(orb.vertices);assert.ok(heightBounds(orb.vertices).min>20);
  const flat=new ArenaRenderer(env.makeCanvas());env.cleanup.push(()=>flat.destroy());
  flat.draw({state:freeze(state([],{projectiles:[projectile]}))},{reducedMotion:true});
  assert.ok(flat.canvas.calls.some(c=>c.name==='fill'&&c.fill==='#9c9ed3'));
}));

test('both renderers highlight only the authoritative three Vines preview targets for both teams and orientations',()=>withRendererEnvironment(env=>{
  const raised=renderer3d(env),flat=new ArenaRenderer(env.makeCanvas());env.cleanup.push(()=>flat.destroy());
  const units=freeze([[200,290],[240,310],[275,330],[220,355]].map(([x,y],i)=>unit('knight',{id:`target-${i}`,x,y,radius:9,team:'enemy'})));
  const chosen=freeze([units[2],units[0],units[3]].map(u=>({id:u.id,x:u.x,y:u.y,radius:u.radius,kind:'unit',damage:90})));
  const preview=freeze({ok:true,positions:[],affectedTargets:chosen});
  const scene=freeze(state(units)),before=JSON.stringify(scene),requests=[];
  const game={state:scene,previewDeployment:(...args)=>{requests.push(args);return preview;}};
  const options={selectedCard:CARDS.vines,pointer:freeze({x:240,y:320}),reducedMotion:true};
  for(const orientation of ['portrait','landscape'])for(const team of ['player','enemy']) {
    flat.setOrientation(orientation);raised.setOrientation(orientation);
    const start=flat.canvas.calls.length;
    flat.draw(game,{...options,deploymentTeam:team});
    assert.deepEqual(requests.at(-1),[team,'vines',240,320]);
    const circles=flat.canvas.calls.slice(start).filter(c=>c.name==='arc'&&c.args[2]===14);
    assert.equal(circles.length,3);
    assert.deepEqual(circles.map(c=>c.args.slice(0,2)),chosen.map(t=>{const p=project(t.x,t.y,orientation);return [p.x,p.y];}));
    const rings=[],ring=raised._ring.bind(raised);raised._ring=(...args)=>{rings.push(args);return ring(...args);};
    const hudStart=env.hud.calls.length;raised.draw(game,{...options,deploymentTeam:team});raised._ring=ring;
    assert.deepEqual(requests.at(-1),[team,'vines',240,320]);
    const impacts=rings.filter(args=>args[2]===13&&args[3]===(team==='player'?'#c5ed9b':'#ffc3ae'));
    assert.deepEqual(impacts.map(args=>args.slice(0,2)),chosen.map(t=>[t.x,t.y]));
    assert.ok(env.hud.calls.slice(hudStart).some(c=>c.name==='fillText'&&c.args[0]==='최고 HP · 3/3 대상'));
  }
  assert.equal(JSON.stringify(scene),before);assert.equal(preview.affectedTargets.length,3);
}));

test('Vines cast effects bind the recorded targets with landscape coordinates and never mutate the effect snapshot',()=>withRendererEnvironment(env=>{
  const flat=new ArenaRenderer(env.makeCanvas());env.cleanup.push(()=>flat.destroy());
  const raised=renderer3d(env),targets=freeze([[110,180],[150,220],[90,210]].map(([x,y],i)=>({id:`bound-${i}`,x,y,radius:9,flying:i===0})));
  const effect=freeze({id:'vines-cast',type:'spell',cardId:'vines',team:'player',x:120,y:200,radius:80,life:.4,maxLife:.65,selectedTargets:targets});
  const scene=freeze(state([],{effects:[effect]})),before=JSON.stringify(scene);
  for(const orientation of ['portrait','landscape']) {
    flat.setOrientation(orientation);raised.setOrientation(orientation);
    const start=flat.canvas.calls.length;flat.draw({state:scene},{reducedMotion:true});
    // Each binding starts with one contact ellipse; its stem is rendered after it.
    const ellipses=flat.canvas.calls.slice(start).filter(c=>c.name==='ellipse'&&c.args[2]===13);
    assert.equal(ellipses.length,3);
    const origin=project(effect.x,effect.y,orientation);
    assert.deepEqual(ellipses.map(c=>c.args.slice(0,2)),targets.map(t=>{const p=project(t.x,t.y,orientation);return [p.x-origin.x,p.y-origin.y+3];}));
    const full=drawMesh(raised,env,scene);finiteMesh(full.vertices);
    const single=drawMesh(raised,env,freeze(state([],{effects:[{...effect,selectedTargets:[targets[0]]}]})));
    assert.equal(full.vertices.length,single.vertices.length*3,'only the recorded targets add root geometry');
    assert.ok(full.vertices.length/30<450);
  }
  assert.equal(JSON.stringify(scene),before);
}));
