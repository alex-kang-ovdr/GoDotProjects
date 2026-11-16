import test from 'node:test';
import assert from 'node:assert/strict';
import { ArenaRenderer, cardIcon } from '../dist/js/renderer.js';

const cardIds = ['knight','archers','giant','goblins','fireball','arrows','musketeer','bomber','minions',
  'cannon','valkyrie','skeletons','hog_rider','spear_goblins','duelist','zap','poison','ice_spirit'];

test('all 18 icons are distinct static SVG and untrusted IDs cannot inject markup', () => {
  const icons = cardIds.map(id => cardIcon(id));
  assert.equal(new Set(icons).size, 18);
  for (const svg of icons) {
    assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
    assert.match(svg, /viewBox="0 0 64 64"/);
    assert.match(svg, /<\/svg>$/);
    assert.doesNotMatch(svg, /<script|<foreignObject|(?:href|onload|onclick)=/i);
  }
  assert.equal(cardIcon('<script>alert(1)</script>'),cardIcon('knight'));
  assert.equal(cardIcon('__proto__'),cardIcon('knight'));
  assert.match(cardIcon('zap',10000),/width="256" height="256"/);
  assert.match(cardIcon('zap','" onload="bad'),/width="48" height="48"/);
});

function environment(rect, dpr = 2) {
  const previous = new Map(['document','window','ResizeObserver'].map(key=>[key,globalThis[key]]));
  const calls = [], gradient = {addColorStop(){}};
  const context = new Proxy({}, {
    get(target,key) {
      if (key in target) return target[key];
      if (key==='createLinearGradient' || key==='createRadialGradient') return ()=>gradient;
      return (...args)=>{ calls.push([key,...args]); };
    },
    set(target,key,value) { target[key]=value; return true; }
  });
  const makeCanvas = ()=>({width:1,height:1,getContext:()=>context,getBoundingClientRect:()=>rect});
  let disconnected = false;
  globalThis.document={createElement:makeCanvas};
  globalThis.window={devicePixelRatio:dpr,addEventListener(){},removeEventListener(){}};
  globalThis.ResizeObserver=class {observe(){} disconnect(){disconnected=true;}};
  return {canvas:makeCanvas(),calls,disconnected:()=>disconnected,
    restore(){for(const [key,value]of previous){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}};
}

test('DPI backing store and live letterboxed pointer coordinates remain independent', () => {
  const rect={left:30,top:20,width:600,height:640};
  const env=environment(rect,2);
  let renderer;
  try {
    renderer=new ArenaRenderer(env.canvas);
    assert.equal(env.canvas.width,1200);
    assert.equal(env.canvas.height,1280);
    assert.deepEqual(renderer.screenToWorld(330,340),{x:240,y:320});
    assert.deepEqual(renderer.screenToWorld(90,20),{x:0,y:0});
    // A CSS layout can change before ResizeObserver fires.
    rect.width=240; rect.height=360;
    assert.deepEqual(renderer.screenToWorld(150,200),{x:240,y:320});
    assert.deepEqual(renderer.screenToWorld(30,40),{x:0,y:0});
    renderer.resize();
    assert.equal(env.canvas.width,480);
    assert.equal(env.canvas.height,720);
  } finally {renderer?.destroy();env.restore();}
  assert.equal(env.disconnected(),true);
});

test('v2 feedback renders without mutating simulation state or requiring optional collections', () => {
  const env=environment({left:0,top:0,width:400,height:400*640/480});
  let renderer;
  try {
    renderer=new ArenaRenderer(env.canvas);
    const units=cardIds.filter(id=>!['fireball','arrows','zap','poison'].includes(id)).map((id,i)=>({
      id:`u${i}`,cardId:id,team:i%2?'enemy':'player',x:70+i*20,y:420,hp:80,maxHp:100,radius:10,
      targetId:`u${(i+1)%14}`,range:80,facing:-Math.PI/2,attackFlash:.7,
      stunRemaining:i===0?1:0,frostRemaining:i===1?1:0,slowRemaining:i===2?1:0
    }));
    const effects=['cast','attack','spell','freeze','zap','stun','death','hit','spawn','towerDown','kingActive']
      .map((type,i)=>({id:`fx${i}`,type,cardId:i%2?'zap':'poison',team:'player',x:200,y:280,radius:40,life:.3,maxLife:.7}));
    for(let i=0;i<30;i++)effects.push({id:`d${i}`,type:'damage',team:'player',targetTeam:'enemy',x:100+i*8,
      y:250+(i%3)*40,amount:50,life:.5,maxLife:.7,age:.2});
    const state={time:12,units,towers:[{id:'player-king',type:'king',team:'player',x:240,y:575,hp:3100,maxHp:3100}],
      projectiles:[],effects,areas:[{id:'a',cardId:'poison',team:'player',x:240,y:260,radius:60,life:4,maxLife:8}]};
    const before=JSON.stringify(state);
    renderer.draw({state},{hoveredEntityId:'u0',showRanges:true,reducedMotion:true});
    assert.equal(JSON.stringify(state),before);
    renderer.draw({},{});
    renderer.draw({state,canDeploy:()=>({ok:false})},{selectedCard:{id:'spear_goblins',type:'troop',radius:8,count:3},pointer:{x:230,y:200}});
    assert.ok(env.calls.some(call=>call[0]==='strokeText'),'damage feedback should be drawn');
    // Damage labels are capped per frame, even for many simultaneous impacts.
    assert.ok(env.calls.filter(call=>call[0]==='strokeText').length<=16);
    const kingLabels=env.calls.filter(call=>call[0]==='fillText' && call[1]==='3100');
    assert.ok(kingLabels.length>0);
    assert.ok(kingLabels.every(call=>call[3]+8<=620),'bottom king HP readout must fit above the lower frame');
  } finally {renderer?.destroy();env.restore();}
});
