import test from 'node:test';
import assert from 'node:assert/strict';
import { ArenaRenderer } from '../dist/js/renderer.js';

function withRenderer(run) {
  const previous=new Map(['document','window','ResizeObserver'].map(k=>[k,globalThis[k]]));
  let serial=0;
  function canvas() {
    const calls=[],values={globalAlpha:1,font:'10px sans-serif'},stack=[];
    const ctx=new Proxy(values,{
      get(target,key) {
        if(key in target)return target[key];
        if(key==='createLinearGradient'||key==='createRadialGradient')return ()=>({addColorStop(){}});
        if(key==='measureText')return text=>({width:String(text).length*7});
        if(key==='save')return ()=>stack.push({...values});
        if(key==='restore')return ()=>{const prior=stack.pop();if(prior){for(const k of Object.keys(values))delete values[k];Object.assign(values,prior);}};
        return (...args)=>calls.push({name:key,args,fill:values.fillStyle,stroke:values.strokeStyle,font:values.font,alpha:values.globalAlpha});
      },set(target,key,value){target[key]=value;return true;}
    });
    return {id:++serial,width:1,height:1,calls,getContext:()=>ctx,
      getBoundingClientRect:()=>({left:10,top:20,width:400,height:400*640/480})};
  }
  globalThis.document={createElement:canvas};
  globalThis.window={devicePixelRatio:2,addEventListener(){},removeEventListener(){}};
  globalThis.ResizeObserver=class{observe(){}disconnect(){}};
  const surface=canvas();let renderer;
  try {renderer=new ArenaRenderer(surface);return run(renderer,surface.calls);}
  finally {renderer?.destroy();for(const[k,v]of previous){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}}
}

const tower=(hp=1000,maxHp=1000)=>({id:'player-left',type:'princess',kind:'tower',team:'player',x:120,y:490,
  hp,maxHp,radius:25,active:true,range:140});
const unit=(extra={})=>({id:'u',cardId:'knight',team:'player',x:200,y:400,hp:600,maxHp:1000,radius:10,...extra});

test('three themes use bounded reusable caches and preserve geometry/team/HP output',()=>withRenderer((renderer,calls)=>{
  const state={time:7,towers:[tower(),{...tower(800),id:'enemy-left',team:'enemy',y:150}],units:[unit()]};
  const before=JSON.stringify(state),backgrounds=[],signatures=[];
  const point=renderer.screenToWorld(210,20+400*640/480/2);
  for(const arenaTheme of ['grove','dusk','frost']) {
    calls.length=0;renderer.draw({state},{arenaTheme,reducedMotion:true,showRanges:true});
    backgrounds.push(renderer.background);
    signatures.push(calls.filter(c=>c.name==='fillText'||(c.name==='fill'&&['#55b9d0','#eb7b68'].includes(c.fill)))
      .map(c=>({name:c.name,args:c.args,fill:c.fill})));
    assert.deepEqual(renderer.screenToWorld(210,20+400*640/480/2),point);
  }
  assert.equal(new Set(backgrounds).size,3);
  assert.deepEqual(signatures[0],signatures[1]);assert.deepEqual(signatures[0],signatures[2]);
  renderer.draw({state},{arenaTheme:'dusk'});assert.equal(renderer.background,backgrounds[1]);
  renderer.draw({state},{arenaTheme:'__proto__'});assert.equal(renderer.background,backgrounds[0]);
  renderer.draw({state},{arenaTheme:'frost'});renderer.draw({state});
  assert.equal(renderer.arenaTheme,'grove');assert.equal(renderer.backgroundCache.size,3);
  assert.equal(JSON.stringify(state),before);
  renderer.destroy();assert.equal(renderer.backgroundCache.size,0);assert.equal(renderer.background,null);
}));

test('deployment progress uses actual duration and legacy snapshots show remaining seconds',()=>withRenderer((renderer,calls)=>{
  const pending=unit({deployDuration:.7,deployRemaining:.35});
  const state={time:1,units:[pending]};
  const before=JSON.stringify(state);
  renderer.draw({state},{reducedMotion:true});
  const progress=calls.find(c=>c.name==='arc'&&c.args[0]===200&&c.args[1]===400&&c.args[2]===15&&c.args[3]===-Math.PI/2);
  assert.ok(progress);assert.ok(Math.abs(progress.args[4]-Math.PI/2)<1e-10);
  assert.equal(JSON.stringify(state),before);
  calls.length=0;renderer.draw({state:{units:[unit({deployRemaining:.4})]}},{reducedMotion:true});
  assert.ok(calls.some(c=>c.name==='fillText'&&c.args[0]==='0.4s'));
  assert.ok(!calls.some(c=>c.name==='arc'&&c.args[0]===200&&c.args[1]===400&&c.args[2]===15&&c.args[3]===-Math.PI/2));
  calls.length=0;renderer.draw({state:{units:[unit({deployDuration:.7,deployRemaining:0})]}});
  assert.ok(!calls.some(c=>c.name==='arc'&&c.args[2]===15));
}));

test('tower danger indicates only living towers at or below 25 percent of actual HP',()=>withRenderer((renderer,calls)=>{
  for(const[hp,maxHp,warn]of[[251,1000,false],[250,1000,true],[1,1000,true],[0,1000,false],[5,undefined,false]]) {
    calls.length=0;
    renderer.draw({state:{towers:[{...tower(hp),maxHp}],projectiles:[{x:120,y:400,tx:120,ty:490,damage:9999,team:'enemy'}]}},{reducedMotion:true});
    assert.equal(calls.some(c=>c.name==='fillText'&&c.args[0]==='!'),warn,`${hp}/${maxHp}`);
  }
}));

test('dense damage labels avoid one another without changing effect state',()=>withRenderer((renderer,calls)=>{
  const effects=Array.from({length:8},(_,i)=>Object.freeze({id:`d${i}`,type:'damage',x:240,y:300,
    amount:50+i,team:'player',targetTeam:'enemy',maxLife:2,life:2-(.02+i*.205),age:.02+i*.205}));
  Object.freeze(effects);
  const state={time:10,effects},before=JSON.stringify(state);
  renderer.draw({state},{reducedMotion:true});
  const labels=calls.filter(c=>c.name==='strokeText');assert.equal(labels.length,8);
  const boxes=labels.map(c=>({x:c.args[1],y:c.args[2],w:String(c.args[0]).length*7+8,h:19}));
  for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++) {
    const a=boxes[i],b=boxes[j];
    assert.ok(Math.abs(a.x-b.x)>=(a.w+b.w)/2||Math.abs(a.y-b.y)>=(a.h+b.h)/2,'damage labels must not overlap');
  }
  assert.equal(JSON.stringify(state),before);
}));

test('reducedMotion freezes decorative movement while keeping live status data visible',()=>withRenderer((renderer,calls)=>{
  const state={time:2,towers:[tower(200)],units:[unit({cardId:'minions',flying:true,deployDuration:.7,deployRemaining:.2})]};
  const render=()=>{
    calls.length=0;renderer.draw({state},{arenaTheme:'frost',reducedMotion:true});
    return calls.filter(c=>['moveTo','lineTo','arc','ellipse','fillText','strokeText','translate','rotate'].includes(c.name));
  };
  const first=render();state.time=20;const second=render();assert.deepEqual(second,first);
}));
