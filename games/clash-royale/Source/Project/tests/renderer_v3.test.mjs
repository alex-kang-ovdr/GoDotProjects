import test from 'node:test';
import assert from 'node:assert/strict';
import { ArenaRenderer } from '../dist/js/renderer.js';
import { Game, CARDS } from '../dist/js/engine.js';

function withRenderer(run) {
  const previous=new Map(['document','window','ResizeObserver'].map(key=>[key,globalThis[key]]));
  const calls=[],gradient={addColorStop(){}};
  const context=new Proxy({}, {
    get(target,key) {
      if(key in target)return target[key];
      if(key==='createLinearGradient'||key==='createRadialGradient')return ()=>gradient;
      return (...args)=>calls.push([key,...args]);
    },
    set(target,key,value){target[key]=value;return true;}
  });
  const makeCanvas=()=>({width:480,height:640,getContext:()=>context,
    getBoundingClientRect:()=>({left:0,top:0,width:400,height:400*640/480})});
  globalThis.document={createElement:makeCanvas};
  globalThis.window={devicePixelRatio:2,addEventListener(){},removeEventListener(){}};
  globalThis.ResizeObserver=class {observe(){} disconnect(){}};
  let renderer;
  try {renderer=new ArenaRenderer(makeCanvas());return run(renderer,calls);}
  finally {
    renderer?.destroy();
    for(const [key,value]of previous){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}
  }
}

function capturePreview(renderer) {
  let captured;
  const original=renderer.drawGhost;
  renderer.drawGhost=function(card,pointer,time,reducedMotion,preview){
    captured={pointer,preview};
    return original.call(this,card,pointer,time,reducedMotion,preview);
  };
  return ()=>captured;
}

test('live engine legality overrides stale pointer.valid in both directions',()=>withRenderer(renderer=>{
  const game=new Game({seed:18});game.state.elixir.player=10;
  const captured=capturePreview(renderer),card=CARDS.knight;
  renderer.draw(game,{selectedCard:card,pointer:{x:240,y:240,valid:true}});
  assert.equal(captured().pointer.valid,false);
  assert.deepEqual(captured().preview.positions,[]);
  renderer.draw(game,{selectedCard:card,pointer:{x:240,y:420,valid:false}});
  assert.equal(captured().pointer.valid,true);
  game.state.elixir.player=0;
  renderer.draw(game,{selectedCard:card,pointer:{x:240,y:420,valid:true}});
  assert.equal(captured().pointer.valid,false);
}));

test('legacy and current group ghosts use the exact plan subsequently spawned by the engine',()=>withRenderer(renderer=>{
  const captured=capturePreview(renderer);
  for(const rulesVersion of [2,3])for(const [cardId,x,y]of [
    ['goblins',240,340],['goblins',8,400],['archers',240,420],['minions',240,340]
  ]) {
    const game=new Game({seed:42,rulesVersion}).start();
    game.state.elixir.player=10;game.state.hands.player[0]=cardId;
    const before=JSON.stringify(game.exportSnapshot());
    renderer.draw(game,{selectedCard:CARDS[cardId],pointer:{x,y,valid:true},reducedMotion:true});
    const preview=captured().preview;
    assert.equal(preview.ok,true,`${rulesVersion}/${cardId} should have a legal plan`);
    assert.equal(JSON.stringify(game.exportSnapshot()),before,'preview must not alter state, random seed or commands');
    const result=game.playCard('player',0,x,y);
    assert.equal(result.ok,true);
    assert.deepEqual(preview.positions,game.state.units.map(u=>({x:u.x,y:u.y,radius:u.radius,flying:u.flying})));
    assert.equal(preview.positions.length,CARDS[cardId].count);
  }
}));

test('spell preview includes body-edge hits, excludes allies, and displays poison per-tick crown damage',()=>withRenderer((renderer,calls)=>{
  const game=new Game({seed:42});game.state.elixir.player=10;
  const x=186,y=150,edge=x+CARDS.fireball.spellRadius+10*.65;
  const unit=(id,px,team)=>({id,cardId:'knight',kind:'troop',type:'troop',team,x:px,y,radius:10,
    hp:700,maxHp:700,flying:false,isBuilding:false});
  game.state.units=[unit('edge',edge,'enemy'),unit('outside',edge+.01,'enemy'),unit('ally',x,'player')];
  const captured=capturePreview(renderer);
  const before=JSON.stringify(game.exportSnapshot());
  renderer.draw(game,{selectedCard:CARDS.fireball,pointer:{x,y}});
  let targets=captured().preview.affectedTargets;
  assert.ok(targets.some(t=>t.id==='edge'));
  assert.ok(!targets.some(t=>t.id==='outside'||t.id==='ally'));
  assert.equal(targets.find(t=>t.id==='enemy-left').damage,game.getCard('fireball').crownDamage);
  assert.ok(calls.some(c=>c[0]==='fillText'&&c[1]===`−${game.getCard('fireball').crownDamage}`));
  renderer.draw(game,{selectedCard:CARDS.poison,pointer:{x,y}});
  targets=captured().preview.affectedTargets;
  assert.equal(targets.find(t=>t.id==='enemy-left').damage,game.getCard('poison').crownDamage);
  assert.ok(calls.some(c=>c[0]==='fillText'&&c[1]===`−${game.getCard('poison').crownDamage}/초`));
  assert.equal(JSON.stringify(game.exportSnapshot()),before);
}));

test('training target is an independent overlay and cannot authorize an illegal placement',()=>withRenderer((renderer,calls)=>{
  const game=new Game({seed:42}),captured=capturePreview(renderer);
  const trainingTarget=Object.freeze({x:240,y:200,radius:32,label:'중앙 방어 목표'});
  const stateBefore=JSON.stringify(game.state);
  renderer.draw(game,{selectedCard:CARDS.knight,pointer:{x:240,y:200,valid:true},trainingTarget});
  assert.equal(captured().preview.ok,false);
  assert.ok(calls.some(c=>c[0]==='fillText'&&c[1]===trainingTarget.label));
  assert.equal(JSON.stringify(game.state),stateBefore);
}));

test('range debug includes attacker body and area timers are painted after entity sprites',()=>withRenderer((renderer,calls)=>{
  const unit={id:'c',team:'player',cardId:'cannon',kind:'building',isBuilding:true,x:240,y:420,radius:20,
    hp:1050,maxHp:1050,range:120,active:true};
  const state={time:2,towers:[],units:[unit],effects:[],areas:[
    {id:'a',cardId:'poison',team:'enemy',x:240,y:420,radius:72,life:4,maxLife:8}
  ]};
  renderer.draw({state},{showRanges:true,hoveredEntityId:'c'});
  assert.ok(calls.some(c=>c[0]==='arc'&&c[3]===140),'attack edge ring should include 20px cannon body');
  const timer=calls.findLastIndex(c=>c[0]==='fillText'&&c[1]==='4s');
  const hp=calls.findLastIndex(c=>c[0]==='fillText'&&c[1]==='1050 / 1050');
  assert.ok(timer>hp&&hp>=0,'persistent-zone timer must remain above unit/tower rendering');
}));
