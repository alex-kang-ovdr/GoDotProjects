import test from 'node:test';
import assert from 'node:assert/strict';
import { ArenaRenderer } from '../dist/js/renderer.js';
import { Game, CARDS } from '../dist/js/engine.js';

const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} ≈ ${expected}`);
const projected=p=>({...p,x:p.y,y:480-p.x});
const multiply=(a,b)=>[
  a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],
  a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],
  a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]
];

function withRenderer(run) {
  const previous=new Map(['document','window','ResizeObserver'].map(k=>[k,globalThis[k]]));
  const rect={left:38,top:61,width:480,height:640};
  function makeCanvas() {
    const calls=[],values={globalAlpha:1,font:'10px sans-serif'},stack=[];
    let matrix=[1,0,0,1,0,0],path=[];
    const record=(op,args)=>calls.push({op,args,matrix:matrix.slice(),path:path.map(p=>p.slice()),
      fill:values.fillStyle,stroke:values.strokeStyle,font:values.font,alpha:values.globalAlpha});
    const ctx=new Proxy(values,{
      get(target,key) {
        if(key in target)return target[key];
        if(key==='createLinearGradient'||key==='createRadialGradient')return ()=>({addColorStop(){}});
        if(key==='measureText')return text=>({width:String(text).length*7});
        if(key==='save')return ()=>stack.push({values:{...values},matrix:matrix.slice()});
        if(key==='restore')return ()=>{
          const prior=stack.pop();if(!prior)return;
          for(const k of Object.keys(values))delete values[k];Object.assign(values,prior.values);matrix=prior.matrix;
        };
        if(key==='setTransform')return (...args)=>{matrix=args.slice();record(key,args);};
        if(key==='transform')return (...args)=>{matrix=multiply(matrix,args);record(key,args);};
        if(key==='translate')return (x,y)=>{matrix=multiply(matrix,[1,0,0,1,x,y]);record(key,[x,y]);};
        if(key==='scale')return (x,y)=>{matrix=multiply(matrix,[x,0,0,y,0,0]);record(key,[x,y]);};
        if(key==='rotate')return angle=>{const c=Math.cos(angle),s=Math.sin(angle);matrix=multiply(matrix,[c,s,-s,c,0,0]);record(key,[angle]);};
        if(key==='beginPath')return ()=>{path=[];};
        return (...args)=>{
          if(['arc','ellipse','moveTo','lineTo','arcTo','rect'].includes(key))path.push([key,...args]);
          record(key,args);
        };
      },set(target,key,value){target[key]=value;return true;}
    });
    return {width:1,height:1,calls,getContext:()=>ctx,getBoundingClientRect:()=>({...rect})};
  }
  globalThis.document={createElement:makeCanvas};
  globalThis.window={devicePixelRatio:2,addEventListener(){},removeEventListener(){}};
  globalThis.ResizeObserver=class{observe(){}disconnect(){}};
  const surface=makeCanvas();let renderer;
  try {renderer=new ArenaRenderer(surface);return run(renderer,surface.calls,rect,surface);}
  finally {renderer?.destroy();for(const[k,v]of previous){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}}
}

const unit=(extra={})=>({id:'selected',cardId:'knight',team:'player',x:120,y:400,hp:620,maxHp:1000,
  radius:10,range:20,facing:-Math.PI/2,...extra});
const tower=(extra={})=>({id:'player-king',kind:'tower',type:'king',team:'player',x:240,y:575,
  radius:29,hp:3100,maxHp:3100,active:false,range:140,...extra});

test('both orientations round-trip live CSS coordinates with letterboxing independent of DPR',()=>withRenderer((renderer,calls,rect)=>{
  for(const orientation of ['portrait','landscape'])for(const [width,height]of [[480,640],[640,480],[1000,600],[300,600],[420,290]]) {
    Object.assign(rect,{width,height,left:27.25,top:83.75});renderer.setOrientation(orientation);
    const vw=orientation==='landscape'?640:480,vh=orientation==='landscape'?480:640;
    const scale=Math.min(width/vw,height/vh),ox=(width-vw*scale)/2,oy=(height-vh*scale)/2;
    for(const [x,y]of [[0,0],[480,640],[240,320],[120,150],[360,490],[240,575],[19.5,407.25]]) {
      const p=renderer.worldToScreen(x,y),vx=orientation==='landscape'?y:x,vy=orientation==='landscape'?480-x:y;
      near(p.x,ox+vx*scale);near(p.y,oy+vy*scale);
      const back=renderer.screenToWorld(rect.left+p.x,rect.top+p.y);
      near(back.x,x);near(back.y,y);
    }
    assert.equal(renderer.viewWidth,vw);assert.equal(renderer.viewHeight,vh);
  }
  Object.assign(rect,{width:640,height:480});renderer.setOrientation('landscape');
  assert.deepEqual(renderer.worldToScreen(240,575),{x:575,y:240},'player king is on the right');
  assert.deepEqual(renderer.worldToScreen(240,65),{x:65,y:240},'enemy king is on the left');
  assert.deepEqual(renderer.worldToScreen(120,320),{x:320,y:360});
  assert.deepEqual(renderer.worldToScreen(360,320),{x:320,y:120});
  const before=renderer.worldToScreen(100,400);globalThis.window.devicePixelRatio=3;renderer.resize();
  assert.deepEqual(renderer.worldToScreen(100,400),before);
  assert.equal(renderer.setOrientation('invalid'),renderer);assert.equal(renderer.orientation,'portrait');
}));

test('layout changes before ResizeObserver keep input and drawing aligned without snapping letterbox clicks',()=>withRenderer((renderer,calls,rect,surface)=>{
  renderer.setOrientation('landscape');
  Object.assign(rect,{left:201,top:95,width:1000,height:480});
  const p=renderer.worldToScreen(80,430),back=renderer.screenToWorld(rect.left+p.x,rect.top+p.y);
  near(back.x,80);near(back.y,430);
  const outside=renderer.screenToWorld(rect.left+8,rect.top+240);
  assert.ok(outside.y<0,'left letterbox must remain outside the enemy end of the arena');
  const outsideRight=renderer.screenToWorld(rect.left+rect.width-8,rect.top+240);
  assert.ok(outsideRight.y>640,'right letterbox must remain outside the player end of the arena');
  renderer.draw({state:{}},{reducedMotion:true});
  assert.equal(renderer.width,1000);assert.equal(renderer.height,480);
  assert.equal(renderer.offsetX,180);assert.equal(renderer.offsetY,0);
  assert.equal(surface.width,2000);assert.equal(surface.height,960);
  const terrain=calls.findLast(c=>c.op==='drawImage');
  assert.deepEqual(terrain.matrix,[0,-2,2,0,360,960]);
}));

test('landscape click, exact group preview, and actual spawn agree for both replay rule versions',()=>withRenderer((renderer,calls,rect)=>{
  Object.assign(rect,{width:730,height:470});renderer.setOrientation('landscape');
  let renderedPreview;
  const drawGhost=renderer.drawGhost;
  renderer.drawGhost=function(card,pointer,t,reducedMotion,preview){renderedPreview={pointer,preview};return drawGhost.call(this,card,pointer,t,reducedMotion,preview);};
  for(const rulesVersion of [2,3])for(const [cardId,x,y]of [['goblins',240,340],['archers',240,420],['minions',20,400]]) {
    const game=new Game({seed:44,rulesVersion}).start();
    game.state.elixir.player=10;game.state.hands.player[0]=cardId;
    const local=renderer.worldToScreen(x,y),world=renderer.screenToWorld(rect.left+local.x,rect.top+local.y);
    const expected=game.previewDeployment('player',cardId,world.x,world.y),before=JSON.stringify(game.exportSnapshot());
    assert.equal(expected.ok,true,`${rulesVersion} ${cardId}`);
    renderer.draw(game,{selectedCard:CARDS[cardId],pointer:{...world,valid:false},reducedMotion:true});
    assert.equal(renderedPreview.pointer.valid,true);
    assert.deepEqual(renderedPreview.preview.positions,expected.positions.map(projected));
    near(renderedPreview.pointer.x,world.y);near(renderedPreview.pointer.y,480-world.x);
    assert.equal(JSON.stringify(game.exportSnapshot()),before,'view projection may not change commands, RNG, or simulation');
    assert.equal(game.playCard('player',0,world.x,world.y).ok,true);
    assert.deepEqual(game.state.units.map(u=>({x:u.x,y:u.y,radius:u.radius,flying:u.flying})),expected.positions);
  }
}));

test('terrain rotates while tower art, unit art, health text, damage, timers and training labels stay upright',()=>withRenderer((renderer,calls,rect)=>{
  const state={time:5,towers:[tower()],units:[unit({deployRemaining:.35,deployDuration:.7})],
    effects:[{id:'d',type:'damage',x:240,y:575,amount:90,targetTeam:'player',age:.1,life:.6,maxLife:.7}],
    areas:[{id:'a',team:'enemy',x:120,y:400,radius:60,life:4,maxLife:8}]};
  const before=JSON.stringify(state),art=[];
  for(const orientation of ['portrait','landscape']) {
    Object.assign(rect,orientation==='portrait'?{width:480,height:640}:{width:640,height:480});
    renderer.setOrientation(orientation);calls.length=0;
    renderer.draw({state},{reducedMotion:true,selectedEntityId:'selected',trainingTarget:{x:240,y:410,radius:25,label:'훈련 목표'}});
    const bg=calls.find(c=>c.op==='drawImage');
    if(orientation==='landscape'){near(bg.matrix[0],0);near(bg.matrix[1],-2);near(bg.matrix[2],2);}
    else assert.deepEqual(bg.matrix.slice(0,4),[2,0,0,2]);
    const texts=calls.filter(c=>c.op==='fillText'||c.op==='strokeText');
    for(const text of texts){near(text.matrix[1],0);near(text.matrix[2],0);assert.ok(text.matrix[0]>0&&text.matrix[3]>0);}
    for(const expected of ['3100','−90','4s','훈련 목표','620 / 1000'])assert.ok(texts.some(c=>String(c.args[0])===expected),expected);
    art.push(['#e9bc91','#a9bfcb'].map(color=>calls.find(c=>c.op==='fill'&&c.fill===color)?.matrix.slice(0,4)));
    assert.ok(art.at(-1).every(Boolean),'both tower face and unit helmet were rendered');
    if(orientation==='landscape')for(const c of texts.filter(c=>c.matrix[4]===0&&c.matrix[5]===0)) {
      assert.ok(c.args[1]>=0&&c.args[1]<=640);assert.ok(c.args[2]>=0&&c.args[2]<=480);
    }
  }
  assert.deepEqual(art[0],art[1],'changing orientation must not rotate sprite artwork');
  assert.equal(JSON.stringify(state),before);
}));

test('persistent selection remains visible with no hover and independently highlights a different hovered target',()=>withRenderer((renderer,calls,rect)=>{
  Object.assign(rect,{width:640,height:480});renderer.setOrientation('landscape');
  const state={units:[unit({targetId:'other'}),unit({id:'other',team:'enemy',x:120,y:350,hp:500})]};
  for(const hoveredEntityId of [null,'other']) {
    calls.length=0;renderer.draw({state},{selectedEntityId:'selected',hoveredEntityId,reducedMotion:true});
    const selected=calls.find(c=>c.op==='stroke'&&c.stroke==='#f7d179');
    assert.ok(selected?.path.some(p=>p[0]==='arc'&&p[1]===400&&p[2]===360&&p[3]===17));
    const link=calls.find(c=>c.op==='stroke'&&c.stroke==='rgba(255,238,169,.9)');
    assert.ok(link?.path.some(p=>p[0]==='lineTo'&&p[1]===350&&p[2]===360));
    assert.ok(calls.some(c=>c.op==='fillText'&&c.args[0]==='620 / 1000'));
    if(hoveredEntityId)assert.ok(calls.some(c=>c.op==='stroke'&&c.stroke==='#fff0a8'&&c.path.some(p=>p[0]==='arc'&&p[1]===350)));
  }
  calls.length=0;renderer.draw({state},{selectedEntityId:'gone',reducedMotion:true});
  assert.ok(!calls.some(c=>c.op==='stroke'&&c.stroke==='#f7d179'));
}));

test('spell targets, projectile direction and terrain caches remain correct across orientation and theme changes',()=>withRenderer((renderer,calls,rect)=>{
  Object.assign(rect,{width:640,height:480});renderer.setOrientation('landscape');
  const game=new Game({seed:19});game.state.elixir.player=10;
  game.state.projectiles=[{id:'p',kind:'arrow',cardId:'archers',team:'player',x:120,y:400,tx:120,ty:300,radius:2}];
  let captured;renderer.drawGhost=(card,pointer,t,reducedMotion,preview)=>{captured=preview;};
  const original=game.previewDeployment('player','fireball',186,150),before=JSON.stringify(game.exportSnapshot());
  const cache=[];
  for(const arenaTheme of ['grove','dusk','frost']) {
    calls.length=0;renderer.draw(game,{arenaTheme,selectedCard:CARDS.fireball,pointer:{x:186,y:150},reducedMotion:true});
    cache.push(renderer.background);
    assert.deepEqual(captured.affectedTargets,original.affectedTargets.map(projected));
    assert.ok(calls.some(c=>c.op==='rotate'&&c.args[0]===Math.PI),'a north-going world arrow travels left in landscape');
    renderer.setOrientation('portrait');renderer.draw(game,{arenaTheme,reducedMotion:true});
    assert.equal(renderer.background,cache.at(-1));renderer.setOrientation('landscape');
  }
  assert.equal(new Set(cache).size,3);assert.equal(renderer.backgroundCache.size,3);
  assert.equal(JSON.stringify(game.exportSnapshot()),before);
}));

test('landscape deployment, forward territory, collision halos and area markers agree on battlefield sides',()=>withRenderer((renderer,calls,rect)=>{
  Object.assign(rect,{width:640,height:480});renderer.setOrientation('landscape');
  const state={towers:[tower(),tower({id:'enemy-left',team:'enemy',type:'princess',x:120,y:150,hp:0,destroyed:true})],
    areas:[{id:'poison-zone',team:'enemy',x:360,y:210,radius:55,life:4,maxLife:8}]};
  calls.length=0;
  renderer.draw({state},{selectedCard:CARDS.knight,reducedMotion:true,
    trainingTarget:{x:120,y:370,radius:25,label:'배치 목표'}});
  const renderedPoint=(call,x,y)=>{
    assert.ok(call,'the expected overlay was drawn');
    const [a,b,c,d,e,f]=call.matrix;
    return {x:(a*x+c*y+e)/renderer.dpr,y:(b*x+d*y+f)/renderer.dpr};
  };
  const rectCorners=fill=>{
    const call=calls.find(c=>c.op==='fillRect'&&c.fill===fill);
    assert.ok(call,`missing deployment tint ${fill}`);
    const [x,y,w,h]=call.args;
    return [[x,y],[x+w,y],[x,y+h],[x+w,y+h]].map(p=>renderedPoint(call,...p));
  };
  assert.ok(rectCorners('rgba(67,171,203,.105)').every(p=>p.x>320),'normal player territory is to the right of the river');
  assert.ok(rectCorners('rgba(25,45,48,.105)').every(p=>p.x<320),'enemy territory is to the left of the river');
  assert.ok(rectCorners('rgba(67,171,203,.11)').every(p=>p.x<320&&p.y>240),
    'destroying the world left enemy tower opens the lower-left forward pocket');
  const halo=calls.find(c=>c.op==='fill'&&c.fill==='rgba(44,61,64,.09)'&&
    c.path.some(p=>p[0]==='arc'&&p[1]===240&&p[2]===575));
  assert.deepEqual(renderedPoint(halo,240,575),{x:575,y:240},'placement collision halo follows the player king');
  const area=calls.find(c=>c.op==='fill'&&c.fill==='rgba(77,73,103,.18)');
  assert.deepEqual(renderedPoint(area,0,0),{x:210,y:120},'poison area remains attached to its world position');
  const target=calls.find(c=>c.op==='stroke'&&c.stroke==='rgba(255,233,166,.78)');
  const targetArc=target?.path.find(p=>p[0]==='arc');
  assert.ok(targetArc,'the training target circle was drawn');
  assert.deepEqual(renderedPoint(target,targetArc[1],targetArc[2]),{x:370,y:360});
}));
