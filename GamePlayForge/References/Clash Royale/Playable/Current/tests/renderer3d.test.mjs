import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, CARDS } from '../dist/js/engine.js';
import { ArenaRenderer, cardIcon } from '../dist/js/renderer.js';
import { ArenaRenderer3D, createCamera, projectGround, unprojectGround } from '../dist/js/renderer3d.js';
import { withRendererEnvironment } from './fixtures/webgl-recorder.mjs';

const near=(actual,expected,tolerance=.002)=>assert.ok(Number.isFinite(actual)&&Math.abs(actual-expected)<tolerance,
  `${actual} should be within ${tolerance} of ${expected}`);
const points=[[0,0],[480,640],[240,320],[120,150],[360,490],[240,65],[240,575],[18.25,404.75]];
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const submitted=calls=>calls.filter(c=>c.name==='drawArrays'||c.name==='drawElements');
const resourceLeaks=gl=>[...gl.buffers.values(),...gl.shaders.values(),...gl.programs.values()].filter(resource=>!resource.deleted&&!resource.invalidated);

function makeRenderer(env) {
  const renderer=new ArenaRenderer3D(env.hud,env.surface);
  env.cleanup.push(()=>renderer.destroy());
  return renderer;
}

// This projects independently from the actual GPU submission, including physical
// backing-store rounding and the bottom-left WebGL viewport origin.
function gpuCssPoint(gl,surface,rect,x,y,height=0) {
  const uniform=gl.uniforms.get('u_viewProjection');
  assert.ok(uniform,'the renderer must submit its camera matrix');
  const m=uniform.values[1],v=[x-240,height,y-320,1];
  assert.equal(m.length,16);
  const clip=[0,1,2,3].map(row=>v.reduce((sum,n,col)=>sum+m[col*4+row]*n,0));
  const viewport=gl.calls.findLast(call=>call.name==='viewport')?.args;
  assert.ok(viewport);
  const px=viewport[0]+(clip[0]/clip[3]+1)*viewport[2]/2;
  const py=viewport[1]+(clip[1]/clip[3]+1)*viewport[3]/2;
  return {x:px/surface.width*rect.width,y:(surface.height-py)/surface.height*rect.height};
}

test('3D ground camera preserves team sides and ray-plane picking in both orientations',()=>{
  for(const orientation of ['portrait','landscape']) {
    const camera=createCamera(orientation);
    assert.equal(camera.width,orientation==='landscape'?640:480);
    assert.equal(camera.height,orientation==='landscape'?480:640);
    assert.equal(camera.viewProjection.length,16);assert.equal(camera.inverseViewProjection.length,16);
    for(const [x,y]of [...points,[-80,720]]) {
      const p=projectGround(x,y,camera),back=unprojectGround(p.x,p.y,camera);
      near(back.x,x);near(back.y,y);
    }
    const enemy=projectGround(240,65,camera),player=projectGround(240,575,camera);
    if(orientation==='landscape'){assert.ok(enemy.x<player.x);near(enemy.y,player.y);}
    else{assert.ok(enemy.y<player.y);near(enemy.x,player.x);}
    const ground=projectGround(240,320,camera),raised=projectGround(240,320,camera,40);
    near(ground.x,camera.width/2);near(ground.y,camera.height/2);
    near(raised.x,ground.x);assert.ok(raised.y<ground.y-10,'height must project above the ground, not merely scale a flat picture');
  }
});

test('3D live rect, letterbox and DPR picking match the exact GL matrix and viewport',()=>withRendererEnvironment(env=>{
  const {rect,surface,gl}=env,renderer=makeRenderer(env);
  for(const orientation of ['portrait','landscape'])for(const [width,height,dpr]of [[400,560,1],[901.3,487.7,2],[327.25,611.5,3]]) {
    Object.assign(rect,{left:71.25,top:103.5,width,height});globalThis.window.devicePixelRatio=dpr;
    renderer.setOrientation(orientation);
    renderer.draw({state:{time:2}},{reducedMotion:true});
    for(const [x,y]of points) {
      const local=renderer.worldToScreen(x,y),gpu=gpuCssPoint(gl,surface,rect,x,y);
      near(local.x,gpu.x);near(local.y,gpu.y);
      const back=renderer.screenToWorld(rect.left+local.x,rect.top+local.y);
      near(back.x,x);near(back.y,y);
    }
  }
  // No ResizeObserver callback: both methods must use the changed rect already.
  Object.assign(rect,{left:15,top:29,width:1100,height:480});renderer.setOrientation('landscape');
  Object.assign(rect,{left:25,top:39,width:1200,height:500});
  const local=renderer.worldToScreen(125,443),back=renderer.screenToWorld(rect.left+local.x,rect.top+local.y);
  near(back.x,125);near(back.y,443);
  const outside=renderer.screenToWorld(rect.left+2,rect.top+rect.height/2);
  assert.ok(outside.y<0,'the left letterbox cannot become a legal enemy-end world point');
  renderer.draw({state:{}},{reducedMotion:true});
  const gpu=gpuCssPoint(gl,surface,rect,125,443);near(local.x,gpu.x);near(local.y,gpu.y);
}));

test('3D renderer submits finite lit meshes with height, depth testing and upright HUD text',()=>withRendererEnvironment(env=>{
  const {gl,hud}=env,renderer=makeRenderer(env),game=new Game({seed:45}).start();
  game.state.units=[{...CARDS.knight,id:'test-unit',cardId:'knight',team:'player',x:120,y:410,
    hp:620,maxHp:CARDS.knight.hp,facing:-Math.PI/2,deployRemaining:.3,deployDuration:.65}];
  game.state.areas=[{id:'zone',team:'enemy',x:350,y:390,radius:65,life:4,maxLife:8}];
  const before=JSON.stringify(game.exportSnapshot());
  renderer.setOrientation('landscape');renderer.draw(game,{selectedEntityId:'test-unit',reducedMotion:true});
  assert.ok(gl.calls.some(c=>c.name==='compileShader'));assert.ok(gl.calls.some(c=>c.name==='linkProgram'));
  assert.ok(gl.calls.some(c=>c.name==='enable'&&c.args[0]===gl.DEPTH_TEST));
  assert.ok(submitted(gl.calls).some(c=>c.args[0]===gl.TRIANGLES&&(c.name==='drawArrays'?c.args[2]:c.args[1])>0));
  const meshes=[...gl.buffers.values()].map(b=>b.data).filter(data=>data instanceof Float32Array&&data.length);
  assert.ok(meshes.length>0);
  let maxHeight=-Infinity;
  for(const vertices of meshes) {
    assert.equal(vertices.length%10,0,'position, normal, RGBA use a ten-float vertex');
    assert.ok(vertices.every(Number.isFinite));
    for(let i=0;i<vertices.length;i+=10){maxHeight=Math.max(maxHeight,vertices[i+1]);
      for(let j=6;j<10;j++)assert.ok(vertices[i+j]>=0&&vertices[i+j]<=1,'mesh colors must be finite normalized values');}
  }
  assert.ok(maxHeight>20,'tower/unit geometry must have real height');
  const sources=[...gl.shaders.values()].map(s=>s.source).join('\n');
  assert.match(sources,/a_normal/);assert.match(sources,/u_viewProjection/);
  assert.ok(hud.calls.some(c=>c.name==='fillText'&&String(c.args[0]).includes('3100')),'tower HP must remain on the text HUD');
  assert.ok(!hud.calls.some(c=>c.name==='rotate'&&Math.abs(c.args[0])>.01),'the text HUD must not inherit the map rotation');
  assert.equal(JSON.stringify(game.exportSnapshot()),before);
}));

test('3D uses authoritative frozen previews and switching renderers cannot change commands, RNG or combat state',()=>withRendererEnvironment(env=>{
  const renderer=makeRenderer(env),flat=new ArenaRenderer(env.makeCanvas());env.cleanup.push(()=>flat.destroy());
  for(const rulesVersion of [2,3]) {
    const game=new Game({seed:123,rulesVersion}).start();game.state.elixir.player=10;game.state.hands.player[0]='goblins';
    const requests=[],query=game.previewDeployment.bind(game);
    game.previewDeployment=(...args)=>{const plan=freeze(query(...args));requests.push({args,plan});return plan;};
    const before=JSON.stringify(game.exportSnapshot());freeze(game.state);
    for(const orientation of ['portrait','landscape']) {
      renderer.setOrientation(orientation);flat.setOrientation(orientation);
      for(const [cardId,x,y]of [['goblins',240,420],['fireball',186,150],['goblins',240,240]]) {
        const options={selectedCard:CARDS[cardId],pointer:freeze({x,y,valid:cardId==='goblins'&&y===240}),reducedMotion:true,
          trainingTarget:freeze({x:240,y:410,radius:26,label:'중앙 목표'}),arenaTheme:'frost'};
        const baseCalls=env.hud.calls.length,baseRequests=requests.length;
        renderer.draw(game,options);
        assert.ok(requests.length>baseRequests,'3D preview must consult the authoritative engine');
        const request=requests.at(-1);assert.deepEqual(request.args,['player',cardId,x,y]);
        assert.equal(request.plan.ok,!(cardId==='goblins'&&y===240));
        if(cardId==='goblins'&&y===420)assert.equal(request.plan.positions.length,3);
        if(cardId==='fireball')assert.ok(request.plan.affectedTargets.some(target=>target.id==='enemy-left'));
        assert.ok(env.hud.calls.length>baseCalls,'3D HUD overlays must still be drawn');
        flat.draw(game,options);
        const local=renderer.worldToScreen(x,y),world=renderer.screenToWorld(env.rect.left+local.x,env.rect.top+local.y);
        near(world.x,x);near(world.y,y);
      }
    }
    assert.equal(JSON.stringify(game.exportSnapshot()),before);
  }
}));

function clientAtHeight(renderer,rect,entity,height) {
  const camera=renderer.camera,p=projectGround(entity.x,entity.y,camera,height);
  const scale=Math.min(rect.width/camera.width,rect.height/camera.height);
  return {x:rect.left+(rect.width-camera.width*scale)/2+p.x*scale,
    y:rect.top+(rect.height-camera.height*scale)/2+p.y*scale};
}

test('3D picking selects actual tower and troop head/torso triangles while excluding empty, dead and outside points',()=>withRendererEnvironment(env=>{
  const renderer=makeRenderer(env),king=freeze({id:'king',type:'king',kind:'tower',team:'player',x:240,y:575,
    radius:29,hp:3100,maxHp:3100,active:true});
  const knight=freeze({...CARDS.knight,id:'knight',cardId:'knight',team:'player',x:145,y:390,maxHp:1000,facing:-Math.PI/2});
  const minion=freeze({...CARDS.minions,id:'minion',cardId:'minions',team:'enemy',x:345,y:220,maxHp:200,facing:Math.PI/2});
  const entities=freeze([king,knight,minion]),before=JSON.stringify(entities);
  for(const orientation of ['portrait','landscape']) {
    Object.assign(env.rect,{width:1000,height:520,left:63,top:95});renderer.setOrientation(orientation);
    renderer.draw({state:{time:3,towers:[king],units:[knight,minion]}},{reducedMotion:true});
    // Simulate a responsive layout move before the resize observer callback.
    Object.assign(env.rect,{width:1040.5,height:515.25,left:77.5,top:108.25});
    for(const [entity,height]of [[king,44],[king,21],[knight,31*14/12],[knight,17],[minion,46]]) {
      const p=clientAtHeight(renderer,env.rect,entity,height);
      assert.equal(renderer.pickEntity(p.x,p.y,entities),entity,`${orientation}/${entity.id}/height ${height}`);
    }
    const empty=clientAtHeight(renderer,env.rect,{x:40,y:65},0);
    assert.equal(renderer.pickEntity(empty.x,empty.y,entities),null);
    assert.equal(renderer.pickEntity(env.rect.left-1,env.rect.top+200,entities),null);
    assert.equal(renderer.pickEntity(env.rect.left+env.rect.width+1,env.rect.top+200,entities),null);
    assert.equal(renderer.pickEntity(env.rect.left+200,env.rect.top-1,entities),null);
    assert.equal(renderer.pickEntity(env.rect.left+3,env.rect.top+env.rect.height/2,entities),null,'letterbox is not an entity');
    const head=clientAtHeight(renderer,env.rect,king,44);
    assert.equal(renderer.pickEntity(head.x,head.y,[{...king,hp:0},{...king,id:'destroyed',destroyed:true}]),null);
  }
  assert.equal(JSON.stringify(entities),before);
}));

test('3D overlapping model picking uses camera depth rather than entity list order',()=>withRendererEnvironment(env=>{
  const renderer=makeRenderer(env);
  for(const orientation of ['portrait','landscape']) {
    renderer.setOrientation(orientation);
    const lift=23,shift=lift/Math.tan(renderer.camera.elevation);
    // Two copies of the same mesh are separated exactly along the camera ray.
    // The elevated copy projects to the same triangles and must be picked first.
    const far=freeze({...CARDS.knight,id:'far',cardId:'knight',team:'player',x:240,y:400,radius:12,
      hp:1000,maxHp:1000,flying:false,facing:-Math.PI/2});
    const nearEntity=freeze({...far,id:'near',flying:true,
      x:orientation==='landscape'?far.x-shift:far.x,y:orientation==='portrait'?far.y+shift:far.y});
    renderer.draw({state:{time:0,units:[far,nearEntity]}},{reducedMotion:true});
    const p=clientAtHeight(renderer,env.rect,far,31),pNear=clientAtHeight(renderer,env.rect,nearEntity,31+lift);
    near(p.x,pNear.x);near(p.y,pNear.y);
    const m=renderer.camera.viewProjection;
    const depth=(entity,height)=>m[2]*(entity.x-240)+m[6]*height+m[10]*(entity.y-320)+m[14];
    assert.ok(depth(nearEntity,31+lift)<depth(far,31));
    assert.equal(renderer.pickEntity(p.x,p.y,[far]),far);
    assert.equal(renderer.pickEntity(p.x,p.y,[nearEntity]),nearEntity);
    assert.equal(renderer.pickEntity(p.x,p.y,[far,nearEntity]),nearEntity);
    assert.equal(renderer.pickEntity(p.x,p.y,[nearEntity,far]),nearEntity);
  }
}));

test('unsupported WebGL and shader/link failures are explicit and release partial resources',()=>{
  for(const options of [{supported:false},{compile:false},{link:false}])withRendererEnvironment(({hud,surface,gl,observers})=>{
    assert.throws(()=>new ArenaRenderer3D(hud,surface));
    assert.equal(resourceLeaks(gl).length,0,'failed constructors must not leave GL allocations alive');
    assert.ok(observers.every(observer=>observer.disconnected));
    assert.ok([...surface.listeners.values()].every(listeners=>listeners.size===0));
  },options);
});

test('context loss is reported for facade fallback; restore and destroy release resources cleanly',()=>withRendererEnvironment(env=>{
  const {surface,gl,observers}=env,renderer=makeRenderer(env),game=new Game({seed:77});
  const before=JSON.stringify(game.exportSnapshot());let lostNotifications=0;
  renderer.onContextLost=()=>lostNotifications++;
  renderer.draw(game,{reducedMotion:true});const drawCount=submitted(gl.calls).length;
  gl.setLost(true);assert.equal(surface.dispatch('webglcontextlost'),true);
  assert.equal(renderer.contextLost,true);assert.equal(lostNotifications,1);
  assert.throws(()=>renderer.draw(game),/context|WebGL/i);
  assert.equal(submitted(gl.calls).length,drawCount);
  gl.setLost(false);surface.dispatch('webglcontextrestored');
  assert.equal(renderer.contextLost,false);renderer.draw(game,{reducedMotion:true});
  assert.ok(submitted(gl.calls).length>drawCount);
  assert.equal(JSON.stringify(game.exportSnapshot()),before);
  renderer.destroy();renderer.destroy();
  assert.equal(resourceLeaks(gl).length,0);
  assert.ok(observers.every(observer=>observer.disconnected));
  assert.ok([...surface.listeners.values()].every(listeners=>listeners.size===0));
}));

test('phalanx 2D artwork and one-per-squad badges reflect actual protection and charge fields',()=>withRendererEnvironment(env=>{
  const icon=cardIcon('phalanx');assert.notEqual(icon,cardIcon('knight'));
  assert.match(icon,/^<svg xmlns=/);assert.doesNotMatch(icon,/<script|<foreignObject|(?:href|onload|onclick)=/i);
  const renderer=new ArenaRenderer(env.hud);env.cleanup.push(()=>renderer.destroy());renderer.setOrientation('landscape');
  const offsets=[[-17,-10],[0,-10],[17,-10],[-17,10],[0,10],[17,10]];
  for(const [formationState,protectedCount,chargeRemaining,expected]of [
    ['guard',6,0,'방진'],['guard',3,0,'방어 3/6'],['guard',0,0,null],['charge',0,4.2,'돌격 · 5s'],['regroup',0,0,'재집결']
  ]) {
    const units=offsets.map(([dx,dy],i)=>({id:`p${i}`,cardId:'phalanx',team:'player',x:240+dx,y:420+dy,
      radius:8,hp:340,maxHp:340,formationGroupId:'squad',formationSlot:i,formationState,
      formationProtected:i<protectedCount,chargeRemaining,facing:-Math.PI/2}));
    const state=freeze({time:3,units}),before=JSON.stringify(state);env.hud.calls.length=0;
    renderer.draw({state},{reducedMotion:true});
    const badges=env.hud.calls.filter(c=>c.name==='fillText'&&/방진|방어|돌격|재집결/.test(String(c.args[0])));
    assert.equal(badges.length,expected?1:0,'a state badge represents the squad, not six overlapping labels');
    if(expected)assert.equal(badges[0].args[0],expected);
    assert.equal(JSON.stringify(state),before);
  }
  env.hud.calls.length=0;
  renderer.draw({state:{}},{selectedCard:{id:'phalanx',type:'troop',count:6,radius:8},pointer:{x:240,y:420},reducedMotion:true});
  assert.ok(env.hud.calls.some(c=>c.name==='fillText'&&c.args[0]==='×6'));
}));
