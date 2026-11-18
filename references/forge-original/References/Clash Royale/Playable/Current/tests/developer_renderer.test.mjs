import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, CARDS } from '../dist/js/engine.js';
import { ArenaRenderer } from '../dist/js/renderer.js';
import { ArenaRenderer3D } from '../dist/js/renderer3d.js';
import { withRendererEnvironment } from './fixtures/webgl-recorder.mjs';

const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const near=(a,b)=>assert.ok(Math.abs(a-b)<.002,`${a} ≈ ${b}`);
function setup(env,kind) {
  const renderer=kind==='2d'?new ArenaRenderer(env.hud):new ArenaRenderer3D(env.hud,env.surface);
  env.cleanup.push(()=>renderer.destroy());
  let captured;
  const method=kind==='2d'?'drawGhost':'_drawPreview',original=renderer[method];
  renderer[method]=function(...args){captured=kind==='2d'?args[4]:args[1];return original.apply(this,args);};
  return {renderer,preview:()=>captured};
}

test('both renderers query the acting team and preserve world input, authoritative formations, RNG and commands',()=>{
  for(const kind of ['2d','3d'])withRendererEnvironment(env=>{
    const {renderer,preview}=setup(env,kind);
    for(const orientation of ['portrait','landscape'])for(const team of ['player','enemy']) {
      Object.assign(env.rect,orientation==='landscape'?{width:813.5,height:492.25}:{width:431.25,height:590.5});
      renderer.setOrientation(orientation);
      const game=new Game({seed:91,rulesVersion:3}).start();
      game.state.hands[team][0]='goblins';game.state.elixir[team]=10;
      const x=240,y=team==='player'?420:220,card=game.getCard?.('goblins',team)||CARDS.goblins;
      const local=renderer.worldToScreen(x,y),world=renderer.screenToWorld(env.rect.left+local.x,env.rect.top+local.y);
      near(world.x,x);near(world.y,y);
      const query=game.previewDeployment.bind(game),expected=query(team,'goblins',world.x,world.y),requests=[];
      game.previewDeployment=(...args)=>{requests.push(args);return freeze(query(...args));};
      const before=JSON.stringify(game.exportSnapshot());
      renderer.draw(game,{selectedCard:card,deploymentTeam:team,pointer:{...world,valid:false},reducedMotion:true});
      assert.deepEqual(requests,[[team,'goblins',world.x,world.y]]);assert.equal(preview().team,team);assert.equal(preview().ok,true);
      const projected=kind==='2d'&&orientation==='landscape'
        ?expected.positions.map(p=>({...p,x:p.y,y:480-p.x})):expected.positions;
      assert.deepEqual(preview().positions,projected);
      assert.equal(JSON.stringify(game.exportSnapshot()),before,'rendering must not alter saved state or command/RNG history');
      assert.equal(game.playCard(team,0,world.x,world.y).ok,true);
      assert.deepEqual(game.state.units.map(u=>({x:u.x,y:u.y,radius:u.radius,flying:u.flying})),expected.positions);
      if(team==='enemy'&&kind==='3d') {
        const vertices=[...env.gl.buffers.values()].at(-1).data;
        assert.ok(Array.from({length:vertices.length/10},(_,i)=>i*10).some(i=>
          Math.abs(vertices[i+6]-239/255)<1e-5&&Math.abs(vertices[i+7]-132/255)<1e-5&&vertices[i+9]<1),
        'the enemy ghost uses the enemy material in the translucent batch');
      }
    }
  });
});

test('enemy territory and captured forward pockets mirror correctly, while enabled free placement colors both banks',()=>{
  for(const kind of ['2d','3d'])withRendererEnvironment(env=>{
    const {renderer,preview}=setup(env,kind);renderer.setOrientation('landscape');
    const game=new Game({seed:44,rulesVersion:3});game.state.elixir.enemy=10;
    for(const id of ['player-left','enemy-right'])Object.assign(game.state.towers.find(t=>t.id===id),{hp:0,destroyed:true});
    let enabled=true,freePlacement=false,polygons=[];
    game.getDeveloperState=()=>({enabled,cheats:{freePlacement}});
    if(kind==='3d') {
      const original=renderer._polygon;renderer._polygon=function(points,fill,...rest){polygons.push({points,fill});return original.call(this,points,fill,...rest);};
    }
    const render=()=>{env.hud.calls.length=0;polygons=[];
      renderer.draw(game,{selectedCard:CARDS.knight,deploymentTeam:'enemy',pointer:{x:240,y:430,valid:true},reducedMotion:true});};
    render();
    assert.equal(preview().ok,false,'the closed opposing lane cannot be authorized by a stale pointer');
    if(kind==='2d') {
      const fills=env.hud.calls.filter(c=>c.name==='fillRect');
      assert.ok(fills.some(c=>c.fill==='rgba(231,123,104,.105)'&&c.args[1]===21&&c.args[3]===279));
      assert.deepEqual(fills.filter(c=>c.fill==='rgba(231,123,104,.11)').map(c=>c.args),[[43,340,154,185]]);
    } else {
      assert.ok(polygons.some(p=>p.fill==='rgba(239,132,112,.075)'&&p.points[0][1]===21&&p.points[2][1]===300));
      assert.deepEqual(polygons.filter(p=>p.fill==='rgba(239,132,112,.09)').map(p=>p.points),
        [[[43,340],[197,340],[197,525],[43,525]]]);
    }
    freePlacement=true;render();
    // This view-only fixture advertises a cheat, but the original engine query
    // still rejects this point: the renderer must never override its result.
    assert.equal(preview().ok,false);
    if(kind==='2d') {
      assert.equal(env.hud.calls.filter(c=>c.name==='fillRect'&&c.fill==='rgba(231,123,104,.105)').length,2);
      assert.ok(!env.hud.calls.some(c=>c.name==='fillRect'&&c.fill==='rgba(25,45,48,.105)'));
    } else {
      assert.equal(polygons.filter(p=>p.fill==='rgba(239,132,112,.075)').length,2);
      assert.ok(!polygons.some(p=>p.fill==='rgba(16,35,45,.12)'));
    }
    enabled=false;render();
    assert.ok(kind==='2d'?env.hud.calls.some(c=>c.name==='fillRect'&&c.fill==='rgba(25,45,48,.105)'):
      polygons.some(p=>p.fill==='rgba(16,35,45,.12)'),'a disabled developer flag cannot open both territory overlays');
  });
});

test('current team spell radius and returned impact damage are rendered without old caps or cross-team queries',()=>{
  for(const kind of ['2d','3d'])withRendererEnvironment(env=>{
    const {renderer,preview}=setup(env,kind);renderer.setOrientation('landscape');
    const game=new Game({seed:17,rulesVersion:3}),requests=[];
    const enemyCard=freeze({...CARDS.fireball,spellRadius:160,crownDamage:73}),playerCard=freeze({...CARDS.fireball,spellRadius:42,crownDamage:190});
    game.getCard=(id,team='player')=>team==='enemy'?enemyCard:playerCard;
    game.previewDeployment=(team,id,x,y)=>{requests.push({team,id,x,y});return freeze({ok:true,positions:[],affectedTargets:[{
      id:`${team}-impact`,kind:'tower',type:'princess',team:team==='enemy'?'player':'enemy',x:240,y:team==='enemy'?490:150,
      radius:25,hp:1000,damage:team==='enemy'?73:190}]});};
    let rings=[];
    if(kind==='3d'){const original=renderer._ring;renderer._ring=function(x,y,r,...rest){rings.push({x,y,r});return original.call(this,x,y,r,...rest);};}
    const before=JSON.stringify(game.exportSnapshot());
    for(const team of ['enemy','player']) {
      env.hud.calls.length=0;rings=[];
      renderer.draw(game,{selectedCard:game.getCard('fireball',team),deploymentTeam:team,pointer:{x:240,y:400},reducedMotion:true});
      const radius=team==='enemy'?160:42,damage=team==='enemy'?73:190;
      assert.equal(preview().team,team);assert.equal(preview().affectedTargets[0].damage,damage);
      assert.ok(kind==='2d'?env.hud.calls.some(c=>c.name==='arc'&&c.args[2]===radius):rings.some(r=>r.r===radius));
      assert.ok(env.hud.calls.some(c=>c.name==='fillText'&&c.args[0]===`−${damage}`));
    }
    assert.deepEqual(requests.map(r=>r.team),['enemy','player']);assert.equal(JSON.stringify(game.exportSnapshot()),before);
  });
});
