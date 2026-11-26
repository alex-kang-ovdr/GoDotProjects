import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../../Web/engine.js';
import { GAS_KG_PER_UNIT, stepEnvironment } from '../../../Web/environment.js';
import { ELEMENTS } from '../../../Web/elements.js';
import { atmosphereOf, addAtmosphere, emitAtmosphere, emitAtmosphereBatch, recordRespirationCO2, takeAtmosphere, stepAtmosphere } from '../../../Web/atmosphere.js';
import { close } from './helpers.mjs';

const gasFields=['oxygen','co2','hydrogen','steam'];
const blank=()=>({solid:null,oxygen:0,co2:0,hydrogen:0,steam:0,water:0,frost:0,temp:20,revealed:true,wire:false});
function chamber(w,h){
  const cells=Array.from({length:w*h},blank);
  return {w,h,cells,time:0,waterKgPerCell:1000,cycleSeconds:600,modernRules:true,cell(x,y){return x>=0&&y>=0&&x<w&&y<h?cells[y*w+x]:null;}};
}
function gasMass(cells,element){return cells.reduce((sum,c)=>sum+(element==='oxygen'||element==='co2'?(c[element]||0)*GAS_KG_PER_UNIT:(c[element]||0)),0);}
function gasTotal(cells){return gasFields.reduce((sum,f)=>sum+gasMass(cells,f),0);}
function assertCellInvariant(cells){
  for(const c of cells){
    assert.ok(gasFields.filter(f=>(c[f]||0)>1e-9).length<=1,'at most one atmospheric element per cell');
    if(atmosphereOf(c))assert.ok(c.water<=1e-9&&(c.frost||0)<=1e-9,'gas cells contain no liquid or ice');
  }
}
function enthalpy(cells){
  return cells.reduce((sum,c)=>{
    const state=atmosphereOf(c),gasCp=state?ELEMENTS[state.element==='co2'?'CarbonDioxide':state.element==='hydrogen'?'Hydrogen':state.element==='steam'?'Steam':'Oxygen'].specificHeatCapacity*state.massKg:0;
    return sum+c.temp*(.05+gasCp+c.water*1000*ELEMENTS.Water.specificHeatCapacity+(c.frost||0)*1000*ELEMENTS.Ice.specificHeatCapacity);
  },0);
}

test('4.3 fresh state and save/load preserve a single atmosphere and reject mixed-gas/liquid corruption atomically',()=>{
  const game=new Game(73,'oni-4.3');
  assertCellInvariant(game.cells);
  const saved=game.serialize(),restored=new Game(9,'oni-4.3');
  assert.equal(restored.load(structuredClone(saved)),true);
  assert.deepEqual(restored.cells,saved.cells,'cell masses and temperatures survive round trip');
  assert.equal(restored.time,saved.time);assert.equal(restored.ruleset,saved.ruleset);
  const before=restored.serialize(),bad=structuredClone(before),i=bad.cells.findIndex(c=>c.oxygen>0);
  bad.cells[i].co2=.01;
  assert.throws(()=>restored.load(bad));
  assert.deepEqual(restored.serialize(),before);
  const mixed=structuredClone(before),wet=mixed.cells.findIndex(c=>c.water>0);
  mixed.cells[wet].oxygen=.01;
  assert.throws(()=>restored.load(mixed));
  assert.deepEqual(restored.serialize(),before);
});

test('4.3 gas diffusion conserves each species and thermal energy; CO2 sinks while hydrogen and steam rise',()=>{
  for(const [element,start,expected] of [['co2',[0,1],'down'],['hydrogen',[1,0],'up'],['steam',[1,0],'up']]){
    const g=chamber(1,2),top=g.cells[0],bottom=g.cells[1];
    if(element==='co2')top.co2=1/GAS_KG_PER_UNIT;else bottom[element]=1;
    top.temp=4;bottom.temp=element==='steam'?200:43;
    const initial=gasMass(g.cells,element),heat=enthalpy(g.cells);
    for(let i=0;i<30;i++){g.time+=.2;stepAtmosphere(g,.2);assertCellInvariant(g.cells);}
    close(gasMass(g.cells,element),initial,`${element} mass`);
    close(enthalpy(g.cells),heat,`${element} heat`,1e-7);
    if(expected==='down')assert.ok(bottom[element]>top[element],`${element} settles`);
    else assert.ok(top[element]>bottom[element],`${element} rises`);
  }
  const g=chamber(2,1);g.cells[0].oxygen=1/GAS_KG_PER_UNIT;g.cells[0].temp=5;g.cells[1].temp=45;
  const mass=gasMass(g.cells,'oxygen'),heat=enthalpy(g.cells);
  for(let i=0;i<20;i++)stepAtmosphere(g,.2);
  close(gasMass(g.cells,'oxygen'),mass,'oxygen diffusion');close(enthalpy(g.cells),heat,'oxygen heat',1e-7);
});

test('gas displacement keeps elemental exclusivity, preserves liquid markers and defers when neighboring capacity is insufficient',()=>{
  const g=chamber(3,1),origin=g.cells[1],left=g.cells[0],right=g.cells[2];
  origin.co2=2/GAS_KG_PER_UNIT;origin.temp=25;
  left.oxygen=9.5/GAS_KG_PER_UNIT;right.hydrogen=9.5;
  const before=structuredClone(g.cells);
  assert.equal(addAtmosphere(g,origin,'steam',1,25),0,'cannot displace into two incompatible nearly full neighbors');
  assert.deepEqual(g.cells,before);
  left.oxygen=0;right.hydrogen=0;
  assert.equal(addAtmosphere(g,origin,'steam',1,25),1);
  assert.equal(atmosphereOf(origin).element,'steam');
  assert.ok([left,right].some(c=>atmosphereOf(c)?.element==='co2'));
  close(gasMass(g.cells,'co2'),2,'displaced CO2 mass');
  assertCellInvariant(g.cells);
});

test('a two-product electrolyzer output reserves both gases together when blocked, one-sided or partially open',()=>{
  const output=[{x:1,y:1,element:'oxygen',kg:.888,tempC:70},{x:1,y:1,element:'hydrogen',kg:.112,tempC:70}];
  const blocked=chamber(3,3);
  for(let y=0;y<3;y++)for(let x=0;x<3;x++)Object.assign(blocked.cell(x,y),{co2:10/GAS_KG_PER_UNIT});
  const snapshot=structuredClone(blocked.cells);
  assert.equal(emitAtmosphereBatch(blocked,output),0);
  assert.deepEqual(blocked.cells,snapshot,'blocked output consumes no gas capacity');
  const oneOpen=chamber(3,3);
  for(let y=0;y<3;y++)for(let x=0;x<3;x++)if(!(x===0&&y===1))Object.assign(oneOpen.cell(x,y),{co2:10/GAS_KG_PER_UNIT});
  const oneBefore=structuredClone(oneOpen.cells);
  assert.ok(emitAtmosphereBatch(oneOpen,output)<1,'one open cell cannot hold two species');
  assert.deepEqual(oneOpen.cells,oneBefore,'partial output remains uncommitted');
  const partial=chamber(3,3),o=partial.cell(0,1),h=partial.cell(2,1);
  for(let y=0;y<3;y++)for(let x=0;x<3;x++)if(!((x===0&&y===1)||(x===2&&y===1)))partial.cell(x,y).solid='bedrock';
  o.oxygen=(10-.1)/GAS_KG_PER_UNIT;h.hydrogen=10-.05;
  const split=[{x:0,y:1,element:'oxygen',kg:.888,tempC:70},{x:2,y:1,element:'hydrogen',kg:.112,tempC:70}];
  const partialBefore=structuredClone(partial.cells),scale=emitAtmosphereBatch(partial,split);
  assert.ok(scale>0&&scale<1,'partially open network reports an exact feasible ratio');
  assert.deepEqual(partial.cells,partialBefore,'partial reservation does not mutate');
  const reduced=split.map(e=>({...e,kg:e.kg*scale}));
  assert.equal(emitAtmosphereBatch(partial,reduced),1,'reduced paired output commits atomically');
  close(gasMass(partial.cells,'oxygen')-gasMass(partialBefore,'oxygen'),.888*scale,'paired oxygen');
  close(gasMass(partial.cells,'hydrogen')-gasMass(partialBefore,'hydrogen'),.112*scale,'paired hydrogen');
  assertCellInvariant(partial.cells);
});

test('the real electrolyzer consumes water only when both atmospheric products can be placed',()=>{
  function setup(openCount){
    const g=new Game(73,'oni-4.3'),b=g._addBuilding('electrolyzer',28,11,true),port=g._liquidPort(b,'water'),pipe=g.cell(port.x,port.y);
    for(const c of g.cells){c.oxygen=0;c.co2=c.solid?0:10/GAS_KG_PER_UNIT;c.hydrogen=0;c.steam=0;c.water=0;c.frost=0;}
    const outputs=[[28,10],[29,11],[28,12],[27,11]];
    for(const [x,y] of outputs.slice(0,openCount)){const c=g.cell(x,y);c.solid=null;c.co2=0;}
    pipe.pipe=true;pipe.cleanWater=.018;g._fluidDirty=true;g._rebuildFluids();g._syncFluidTotals();
    b.active=true;b.activeFraction=1;
    return {g,b,pipe};
  }
  for(const openCount of [0,1]){
    const {g,b,pipe}=setup(openCount),water=pipe.cleanWater,oxygen=gasMass(g.cells,'oxygen'),hydrogen=gasMass(g.cells,'hydrogen');
    g._finishUtilities(.1);
    close(pipe.cleanWater,water,`blocked water input with ${openCount} output cells`);
    close(gasMass(g.cells,'oxygen'),oxygen,'blocked electrolyzer oxygen');
    close(gasMass(g.cells,'hydrogen'),hydrogen,'blocked electrolyzer hydrogen');
  }
  const {g,b,pipe}=setup(2),water=pipe.cleanWater,oxygen=gasMass(g.cells,'oxygen'),hydrogen=gasMass(g.cells,'hydrogen');
  g._finishUtilities(.1);
  close(water-pipe.cleanWater,.018,'electrolyzer water input');
  close(gasMass(g.cells,'oxygen')-oxygen,.018*.888,'electrolyzer oxygen output');
  close(gasMass(g.cells,'hydrogen')-hydrogen,.018*.112,'electrolyzer hydrogen output');
  assertCellInvariant(g.cells);
});

test('breathing consumes oxygen once, buffers blocked CO2 and emits it when a compatible destination opens',()=>{
  const g=chamber(2,1),cell=g.cells[0],crew={co2BufferKg:0};cell.oxygen=1/GAS_KG_PER_UNIT;
  const oxygenBefore=gasMass(g.cells,'oxygen');
  const used=takeAtmosphere(cell,.1);recordRespirationCO2(g,crew,cell,0,0,used);
  close(gasMass(g.cells,'oxygen'),oxygenBefore-.1,'oxygen used for breath');
  close(gasMass(g.cells,'co2'),.002,'exhaled carbon dioxide');
  close(crew.co2BufferKg,0,'CO2 emitted without loss');
  const blocked=chamber(1,1),lonely=blocked.cells[0];lonely.oxygen=1/GAS_KG_PER_UNIT;
  const consumed=takeAtmosphere(lonely,.1);recordRespirationCO2(blocked,crew,lonely,0,0,consumed);
  close(crew.co2BufferKg,.002,'blocked CO2 remains buffered');
});

test('dirty water flows with its marker, does not mix, stays liquid through boiling and keeps its kind through freeze/thaw',()=>{
  const g=chamber(3,4),source=g.cell(1,1),target=g.cell(1,2);
  source.water=.4;source.liquidElement='dirtyWater';
  const before=(source.water+target.water)*g.waterKgPerCell;
  stepEnvironment(g,.2,600);
  close((source.water+target.water)*g.waterKgPerCell,before,'dirty liquid movement mass');
  assert.equal(target.liquidElement,'dirtyWater');
  const clean=g.cell(1,0),dirtyNeighbor=g.cell(1,1);clean.water=.3;dirtyNeighbor.water=.4;dirtyNeighbor.liquidElement='dirtyWater';
  stepEnvironment(g,.2,600);
  assert.ok(clean.water===0||dirtyNeighbor.water===0||clean.liquidElement!== 'dirtyWater','clean and dirty water never acquire a shared cell');
  const hot=chamber(2,1),polluted=hot.cell(0,0);polluted.water=.05;polluted.liquidElement='dirtyWater';polluted.temp=130;
  stepEnvironment(hot,.2,600);
  close(polluted.water*1000,.05*1000,'dirty water is not converted into clean steam');
  assert.equal(gasMass(hot.cells,'steam'),0);
  const cold=chamber(1,1),frozen=cold.cells[0];frozen.water=.25;frozen.liquidElement='dirtyWater';frozen.temp=-10;
  stepEnvironment(cold,.2,600);assert.equal(frozen.water,0);assert.equal(frozen.liquidElement,'dirtyWater');
  close(frozen.frost,.25,'dirty ice mass');frozen.temp=10;stepEnvironment(cold,.2,600);
  close(frozen.water,.25,'dirty water after thaw');assert.equal(frozen.liquidElement,'dirtyWater');
});

test('clean water boiling and steam condensation conserve total water, while water displaces gas without overlap',()=>{
  const hot=chamber(2,1),water=hot.cell(0,0);water.water=.05;water.temp=130;
  stepEnvironment(hot,.2,600);
  close(water.water*1000+gasMass(hot.cells,'steam'),50,'boiling mass');
  assertCellInvariant(hot.cells);
  const wet=chamber(2,1),source=wet.cell(0,0),neighbor=wet.cell(1,0);source.water=.4;source.liquidElement='dirtyWater';source.temp=20;
  const liquidBefore=source.water*1000;
  const heatBefore=enthalpy(wet.cells);
  assert.equal(addAtmosphere(wet,source,'oxygen',.5,20),.5);
  close((source.water+neighbor.water)*1000,liquidBefore,'displaced dirty liquid');
  assert.equal(neighbor.liquidElement,'dirtyWater');
  assertCellInvariant(wet.cells);
  const mass=gasMass(wet.cells,'oxygen'),temperature=neighbor.temp;
  close(mass,.5,'oxygen after displacing water');assert.ok(Number.isFinite(temperature));
  // The newly introduced oxygen carries its own heat; displacement itself keeps the liquid enthalpy.
  const expected=heatBefore+.5*ELEMENTS.Oxygen.specificHeatCapacity*20;
  close(enthalpy(wet.cells),expected,'liquid displacement and gas heat',1e-6);
  const cool=chamber(2,1),steam=cool.cell(0,0);steam.steam=5;steam.temp=80;
  stepEnvironment(cool,.2,600);
  close(steam.steam+cool.cells.reduce((sum,c)=>sum+c.water*1000,0),5,'steam condensation');
  assertCellInvariant(cool.cells);
});

test('a water pump and liquid vent preserve polluted-water identity and mass',()=>{
  const game=new Game(73,'oni-4.3'),pump=game._addBuilding('pump',40,12,true),port=game._liquidPort(pump,'water'),pipe=game.cell(port.x,port.y);
  pipe.pipe=true;game._fluidDirty=true;game._rebuildFluids();
  const puddle=game.cell(39,12);puddle.solid=null;puddle.water=.02;puddle.liquidElement='dirtyWater';
  game._pumpWater(pump,.1);
  close(puddle.water*1000+pump.dirtyWater,.02*1000,'polluted water pump mass');
  close(pump.cleanWater,0,'polluted water not relabeled clean');
  assert.ok(pump.dirtyWater>0);

  const ventGame=new Game(73,'oni-4.3'),vent=ventGame._addBuilding('liquidVent',26,11,true),inlet=ventGame.cell(vent.x,vent.y);
  inlet.oxygen=0;inlet.co2=0;inlet.hydrogen=0;inlet.steam=0;
  inlet.pipe=true;inlet.dirtyWater=.5;inlet.liquidPacketTemp=22;ventGame._fluidDirty=true;ventGame._rebuildFluids();
  const before=inlet.dirtyWater+inlet.water*ventGame.waterKgPerCell;
  ventGame._finishUtilities(.1);
  close(inlet.dirtyWater+inlet.water*ventGame.waterKgPerCell,before,'polluted liquid vent mass');
  assert.equal(inlet.liquidElement,'dirtyWater');
  assertCellInvariant(ventGame.cells);
});

test('closed doors block atmospheric transfer and emission; opening the door permits both',()=>{
  const g=chamber(2,1),source=g.cell(0,0),door=g.cell(1,0);source.oxygen=2/GAS_KG_PER_UNIT;
  const doorBuilding={doorOpen:false};g._doorMap=new Map([[1,doorBuilding]]);g._doorBlocksFluid=(x,y)=>x===1&&!doorBuilding.doorOpen;
  const mass=gasMass(g.cells,'oxygen');stepAtmosphere(g,.5);close(gasMass(g.cells,'oxygen'),mass,'closed-door gas total');assert.equal(door.oxygen,0);
  assert.equal(emitAtmosphere(g,0,0,'co2',.1,20),0,'closed door blocks neighbor discharge');
  doorBuilding.doorOpen=true;stepAtmosphere(g,.5);assert.ok(door.oxygen>0,'open door permits gas diffusion');
  assert.ok(emitAtmosphere(g,0,0,'co2',.1,20)>0,'open door permits adjacent gas discharge');
  assertCellInvariant(g.cells);
});

test('a mapped steam vent resumes after its local pressure falls instead of stopping at its cumulative output',()=>{
  const g=chamber(5,5),vent=g.cell(2,2);vent.steamVent=true;vent.ventOutput=0;
  for(let i=0;i<180;i++){g.time+=.2;stepAtmosphere(g,.2,600);}
  const first=vent.ventOutput;assert.ok(first>2.5,'vent can output more than its first local pressure fill');
  for(const c of g.cells)takeAtmosphere(c,100);
  g.time=600;
  for(let i=0;i<180;i++){g.time+=.2;stepAtmosphere(g,.2,600);}
  assert.ok(vent.ventOutput>first,'local pressure recovery restarts the vent');
});

test('a diffuser colony keeps breathing for 90 seconds while emitted CO2 stays out of the breathing cell',()=>{
  const game=new Game(73,'oni-4.3');
  game.researchProgress.completed.push('FarmingTech');
  const placed=game.queue('diffuser',30,16);assert.ok(placed.ok,placed.message);
  for(let i=0;i<90;i++){game.step(1);assertCellInvariant(game.cells);}
  assert.equal(game.crew.filter(c=>c.health>0).length,3,'all three duplicants remain alive');
  assert.ok(game.crew.every(c=>c.breath>20),'duplicants retain breathing reserve');
  for(const c of game.crew){const room=game.cell(Math.floor(c.x),Math.floor(c.y));assert.notEqual(atmosphereOf(room)?.element,'co2','CO2 does not displace the duplicant\'s oxygen immediately');}
});

test('4.2-era saves keep mixed legacy room gas and load without 4.3 normalization',()=>{
  const old=new Game(73,'oni-base'),cell=old.cell(24,11);cell.oxygen=.2;cell.co2=.1;
  const save=old.serialize(),restored=new Game(1,'oni-base');assert.equal(restored.load(structuredClone(save)),true);
  close(restored.cell(24,11).oxygen,.2,'legacy O2 units');close(restored.cell(24,11).co2,.1,'legacy CO2 units');
  assert.equal(restored.modernRules,false);assert.equal('liquidElement' in restored.cell(24,11),false);
});

test('batch gas emission commits displaced water and its element as part of the same update',()=>{
  const g=chamber(4,1);
  Object.assign(g.cells[0],{water:.25,liquidElement:'dirtyWater'});
  Object.assign(g.cells[1],{water:.5,liquidElement:'dirtyWater'});
  const scale=emitAtmosphereBatch(g,[{x:0,y:0,element:'oxygen',kg:.888,tempC:70},{x:3,y:0,element:'hydrogen',kg:.112,tempC:70}]);
  assert.equal(scale,1);
  assertCellInvariant(g.cells);
  assert.equal(g.cells[0].water,0);assert.equal(g.cells[1].water,.75);
  assert.equal(g.cells[1].liquidElement,'dirtyWater');
});
