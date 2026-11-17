import test from 'node:test';
import assert from 'node:assert/strict';
import { ArenaView } from '../dist/js/view.js';
import { Game, CARDS } from '../dist/js/engine.js';
import { withRendererEnvironment } from './fixtures/webgl-recorder.mjs';

const near=(a,b)=>assert.ok(Math.abs(a-b)<.002,`${a} ≈ ${b}`);
function createView(env,onFallback=()=>{}) {
  const view=new ArenaView(env.hud,env.surface,{onFallback});
  env.cleanup.push(()=>{view.threeD?.destroy();view.twoD.destroy();});
  return view;
}

test('view initializes transparent HUD first and switches render mode without changing battle or orientation',()=>withRendererEnvironment(env=>{
  const messages=[],view=createView(env,message=>messages.push(message));
  assert.equal(env.hud.contextRequests[0].type,'2d');
  assert.equal(env.hud.contextRequests[0].settings.alpha,true);
  assert.equal(env.hud.getContext('2d').getContextAttributes().alpha,true,
    'the later 2D renderer request cannot change the lifetime alpha setting');
  assert.equal(view.mode,'2d');assert.equal(env.surface.hidden,true);
  assert.equal(view.active.orientation,view.orientation,'facade and initial active renderer must agree');
  const game=new Game({seed:163}).start();game.state.elixir.player=10;
  const before=JSON.stringify(game.exportSnapshot());
  for(const orientation of ['portrait','landscape']) {
    view.setOrientation(orientation);
    for(const mode of ['2d','3d','3d','2d']) {
      assert.equal(view.setMode(mode),mode);assert.equal(view.mode,mode);
      assert.equal(env.surface.hidden,mode!=='3d');
      assert.equal(view.active.orientation,orientation);
      view.draw(game,{selectedCard:CARDS.goblins,pointer:{x:240,y:420},reducedMotion:true,arenaTheme:'frost'});
      const local=view.worldToScreen(123.5,440.25),world=view.screenToWorld(env.rect.left+local.x,env.rect.top+local.y);
      near(world.x,123.5);near(world.y,440.25);
    }
  }
  assert.equal(view.setMode('unsupported'),'2d');assert.equal(env.surface.hidden,true);
  assert.equal(JSON.stringify(game.exportSnapshot()),before);assert.deepEqual(messages,[]);
}));

test('unavailable WebGL falls back to visible 2D with one callback and unchanged game',()=>withRendererEnvironment(env=>{
  const messages=[];let view;
  view=createView(env,message=>messages.push({message,mode:view.mode,hidden:env.surface.hidden}));
  view.setOrientation('landscape');const game=new Game({seed:152}),before=JSON.stringify(game.exportSnapshot());
  assert.equal(view.setMode('3d'),'2d');assert.equal(view.threeD,null);
  assert.equal(view.active,view.twoD);assert.equal(env.surface.hidden,true);
  assert.equal(messages.length,1);assert.ok(messages[0].message.length>0);
  assert.deepEqual({mode:messages[0].mode,hidden:messages[0].hidden},{mode:'2d',hidden:true});
  assert.doesNotThrow(()=>view.draw(game,{reducedMotion:true}));
  assert.ok(env.hud.calls.some(c=>c.name==='drawImage'),'fallback paints the 2D arena');
  assert.equal(JSON.stringify(game.exportSnapshot()),before);assert.equal(messages.length,1);
},{supported:false}));

test('runtime draw failure and context loss hide WebGL, dispose 3D and keep the same battle running in 2D',()=>withRendererEnvironment(env=>{
  const messages=[],view=createView(env,message=>messages.push(message));
  const game=new Game({seed:444}).start(),before=JSON.stringify(game.exportSnapshot());
  view.setOrientation('landscape');assert.equal(view.setMode('3d'),'3d');
  const failed=view.threeD;failed.draw=()=>{throw new Error('test draw failure');};
  const prior2D=env.hud.calls.filter(c=>c.name==='drawImage').length;
  assert.doesNotThrow(()=>view.draw(game,{reducedMotion:true}));
  assert.equal(view.mode,'2d');assert.equal(view.threeD,null);assert.equal(env.surface.hidden,true);
  assert.equal(failed.destroyed,true);assert.equal(messages.length,1);
  assert.ok(env.hud.calls.filter(c=>c.name==='drawImage').length>prior2D);
  assert.equal(view.setMode('3d'),'3d');const lost=view.threeD;
  env.gl.setLost(true);assert.equal(env.surface.dispatch('webglcontextlost'),true);
  assert.equal(view.mode,'2d');assert.equal(view.threeD,null);assert.equal(env.surface.hidden,true);
  assert.equal(lost.destroyed,true);assert.equal(messages.length,2);
  assert.doesNotThrow(()=>view.draw(game,{reducedMotion:true}));assert.equal(messages.length,2);
  assert.equal(JSON.stringify(game.exportSnapshot()),before);
}));
