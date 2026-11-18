'use strict';
// Canvas API contract check: catches missing v4 fields, non-finite coordinates
// and accidental simulation mutation. This is not a screenshot/layout test.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const Sim=require('../dist/sim.js');
const {Shipyard}=require('../dist/editor.js');
function rendererFor(game,width,height){
  let calls=0;
  const ctx=new Proxy({},{
    get(object,name){
      if(name in object)return object[name];
      if(name==='measureText')return text=>({width:String(text).length*6});
      if(name==='createLinearGradient'||name==='createRadialGradient')return (...values)=>{
        values.forEach(v=>assert.ok(Number.isFinite(v),'finite gradient coordinate'));
        return {addColorStop(){}};
      };
      return (...values)=>{
        calls++;
        for(const value of values.flat())if(typeof value==='number')assert.ok(Number.isFinite(value),'finite canvas '+String(name)+' argument');
      };
    },
    set(object,name,value){if(typeof value==='number')assert.ok(Number.isFinite(value),'finite canvas property '+String(name));object[name]=value;return true;}
  });
  const canvas={width:0,height:0,clientWidth:width,clientHeight:height,getContext:()=>ctx,getBoundingClientRect:()=>({width,height,left:0,top:0})};
  const sandbox={window:{StarSim:Sim,devicePixelRatio:1},console};
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/render.js'),'utf8'),sandbox);
  return {renderer:new sandbox.window.StarRenderer(canvas,game),calls:()=>calls};
}
test('v4 renderer consumes real industrial and combat state without invalid draw arguments or changing the game',()=>{
  const game=new Sim.Game(),yard=new Shipyard(game);
  assert.equal(yard.apply(yard.getPresets().find(p=>p.id==='industrial')).ok,true);
  for(let i=0;i<1200;i++)game.update(1/60);
  const factory=game.player.parts.find(p=>p.type==='ammo_factory');
  assert.ok(factory.production.batchActive);
  // Extra tier parts belong only to this renderer fixture, not to the campaign.
  game.credits=2500;
  assert.equal(game.place('reactor_medium',-4,0).ok,true);
  assert.equal(game.place('reactor_large',4,0).ok,true);
  for(const [width,height] of [[1440,900],[390,844]]){
    const {renderer,calls}=rendererFor(game,width,height);
    const before=JSON.stringify(game.exportSave());
    renderer.selectedPartId=factory.id;
    for(const overlay of ['normal','logistics','heat','damage','tactical']){renderer.overlay=overlay;renderer.draw(1/60);}
    assert.ok(calls()>100);
    assert.equal(JSON.stringify(game.exportSave()),before,'drawing must not change inventory, jobs or production');
    assert.equal(game.setFactoryEnabled(factory.id,false).ok,true);
    renderer.draw(1/60);
    assert.equal(game.setFactoryEnabled(factory.id,true).ok,true);
  }
  assert.equal(game.launch().ok,true);
  for(let i=0;i<1200&&game.mode==='battle';i++)game.update(1/60);
  const {renderer}=rendererFor(game,1440,900);
  renderer.setMode('combat');renderer.fitBattle();
  const before=JSON.stringify(game.exportSave());
  for(const overlay of ['normal','logistics','damage','tactical']){renderer.overlay=overlay;renderer.draw(1/60);}
  assert.equal(JSON.stringify(game.exportSave()),before);
});
