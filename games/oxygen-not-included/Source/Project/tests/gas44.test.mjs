import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { stepAtmosphere } from '../../../Web/atmosphere.js';
import { addAtmosphere } from '../../../Web/atmosphere.js';
import { Game } from '../../../Web/engine.js';

const TRACE_PATH = new URL('../../../References/OxygenNotIncluded/GasTicks/native-gas-traces-4.4.json', import.meta.url);
const GAS_FIELDS = Object.freeze({
  Oxygen:'oxygen', O2:'oxygen', oxygen:'oxygen',
  CarbonDioxide:'co2', CO2:'co2', carbonDioxide:'co2', co2:'co2',
  Hydrogen:'hydrogen', H2:'hydrogen', hydrogen:'hydrogen',
  Steam:'steam', steam:'steam'
});
const MASS_PER_UNIT=.5328;
const GAS_KEYS=['oxygen','co2','hydrogen','steam'];
const blank=()=>({solid:null,oxygen:0,co2:0,hydrogen:0,steam:0,water:0,frost:0,temp:20});
function makeWorld(trace,worldSpec={}){
  const width=trace.geometry.width,height=trace.geometry.height;
  const cells=Array.from({length:width*height},()=>({...blank(),solid:null,temp:worldSpec.background?.tempK?worldSpec.background.tempK-273.15:20}));
  const world={w:width,h:height,cells,time:0,modernRules:true,restoredRules:true,waterKgPerCell:1000,cycleSeconds:600,
    cell(x,y){return Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&y>=0&&x<width&&y<height?cells[y*width+x]:null;},
    _doorBlocksFluid(x,y){return !!this._doorMap?.get(y*width+x)&&!this._doorMap.get(y*width+x).doorOpen;}};
  for(const pos of trace.geometry.solidCells||[]){const [x,y]=Array.isArray(pos)?pos:[pos.x,pos.y];const c=world.cell(x,y);if(c)c.solid=trace.geometry.boundaryElement||'bedrock';}
  world._doorMap=new Map((trace.geometry.doors||[]).map(d=>[d.y*width+d.x,{doorOpen:!!d.open}]));
  for(const entry of trace.frames[0].cells){
    const x=entry.x-(trace.geometry.originX||0),y=entry.y-(trace.geometry.originY||0);
    const c=world.cell(x,y);assert.ok(c,`${trace.caseId}: initial cell inside geometry`);
    if(entry.cellState==='solid'){c.solid=entry.element||'bedrock';if(entry.tempC!=null)c.temp=entry.tempC;continue;}
    c.solid=null;
    const field=entry.element==null?null:GAS_FIELDS[entry.element];
    assert.ok(entry.element==null||field,`${trace.caseId}: known gas element ${entry.element}`);
    for(const f of GAS_KEYS)c[f]=0;
    if(field)c[field]=(field==='oxygen'||field==='co2'?entry.massKg/MASS_PER_UNIT:entry.massKg);
    if(entry.tempC!=null)c.temp=entry.tempC;
  }
  return world;
}
function gasMass(cell){return GAS_KEYS.reduce((sum,f)=>sum+(f==='oxygen'||f==='co2'?cell[f]*MASS_PER_UNIT:cell[f]),0);}
function compareFrame(world,frame,trace){
  const errors=[];
  for(const expected of frame.cells){
    const actual=world.cell(expected.x-(trace.geometry.originX||0),expected.y-(trace.geometry.originY||0));
    if(expected.cellState==='solid'){if(!actual?.solid)errors.push({cell:`${expected.x},${expected.y}`,kind:'solid'});continue;}
    const expectedField=expected.element==null?null:GAS_FIELDS[expected.element];
    const field=actual&&GAS_KEYS.find(f=>actual[f]>0);
    if((field||null)!==expectedField)errors.push({cell:`${expected.x},${expected.y}`,kind:'element',expected:expectedField,actual:field||null});
    const mass=expectedField?gasMass(actual):0,delta=mass-(expected.massKg||0);
    if(Math.abs(delta)>(expected.massToleranceKg??1e-6))errors.push({cell:`${expected.x},${expected.y}`,kind:'mass',expected:expected.massKg||0,actual:mass,delta});
    if(expected.tempC!=null&&Math.abs(actual.temp-expected.tempC)>(expected.temperatureToleranceC??1e-4))errors.push({cell:`${expected.x},${expected.y}`,kind:'temperature',expected:expected.tempC,actual:actual.temp,delta:actual.temp-expected.tempC});
  }
  return errors;
}
function totalNativeMass(frame){return frame.cells.reduce((sum,c)=>sum+(c.cellState==='gas'?c.massKg||0:0),0);}

test('4.4 native gas traces: strict calibration, full diagnostics, and mass budgets',()=>{
  const fixture=JSON.parse(readFileSync(fileURLToPath(TRACE_PATH),'utf8'));
  assert.equal(fixture.schemaVersion,1);
  assert.equal(String(fixture.gameBuild),'24423041','trace must identify installed build, not Steam target build');
  const traces=fixture.cases||[fixture];assert.ok(traces.length>0,'native traces present');
  const exactCases=new Set(['pair-horizontal-Oxygen','pair-vertical-Oxygen','pair-horizontal-Hydrogen','pair-vertical-Hydrogen','pair-vertical-CarbonDioxide','pair-vertical-Steam','hetero-vertical-Oxygen-Hydrogen','hetero-vertical-Oxygen-CarbonDioxide','hetero-vertical-Hydrogen-CarbonDioxide','buoyancy-stable-Hydrogen-Oxygen','buoyancy-stable-Hydrogen-CarbonDioxide','buoyancy-stable-Oxygen-CarbonDioxide','buoyancy-stable-Steam-Oxygen','buoyancy-inverted-Oxygen-Steam','buoyancy-inverted-CarbonDioxide-Oxygen']);
  const diagnostics=[];
  let strictCalibrationPassed=false;
  for(const trace of traces){
    assert.equal(trace.frames.length,trace.ticks+1,`${trace.caseId}: one frame per native tick plus initial`);
    const world=makeWorld(trace,fixture.world||{});
    assert.deepEqual(compareFrame(world,trace.frames[0],trace),[],`${trace.caseId}: initial state loads exactly`);
    const initialMass=totalNativeMass(trace.frames[0]);
    let mismatchCount=0,maxMassError=0,maxTempError=0,firstMismatch=null;
    for(let tick=1;tick<trace.frames.length;tick++){
      // The live 4.4 caller invokes after advancing its clock: .2, .4, ...
      world.time=trace.frames[tick].timeSeconds??tick*trace.dtSeconds;
      stepAtmosphere(world,trace.dtSeconds,world.cycleSeconds);
      const frame=trace.frames[tick],errors=compareFrame(world,frame,trace);
      mismatchCount+=errors.length;firstMismatch ||= errors[0]&&{tick,...errors[0]};
      for(const error of errors){if(error.kind==='mass')maxMassError=Math.max(maxMassError,Math.abs(error.delta));if(error.kind==='temperature')maxTempError=Math.max(maxTempError,Math.abs(error.delta));}
      const nativeMass=totalNativeMass(frame),modelMass=world.cells.reduce((sum,c)=>sum+gasMass(c),0);
      assert.ok(Math.abs(nativeMass-initialMass)<=Math.max(2e-6,initialMass*1e-6),`${trace.caseId} tick ${tick}: native isolated-grid mass budget`);
      assert.ok(Math.abs(modelMass-initialMass)<=Math.max(2e-6,initialMass*1e-6),`${trace.caseId} tick ${tick}: candidate isolated-grid mass budget`);
      // This first transfer is directly reproduced from the native 0.2 s sample.
      if(trace.caseId==='pair-horizontal-Oxygen'&&tick===1){
        assert.deepEqual(errors,[],`${trace.caseId}: first measured 0.2 s transfer`);
        strictCalibrationPassed=true;
      }
    }
    diagnostics.push({caseId:trace.caseId,mismatchCount,maxMassErrorKg:+maxMassError.toPrecision(4),maxTemperatureErrorC:+maxTempError.toPrecision(4),firstMismatch});
    if(exactCases.has(trace.caseId))assert.equal(mismatchCount,0,`${trace.caseId}: all recorded frames agree with native`);
    if(trace.caseId.startsWith('oxygen-isolated-mass-'))assert.equal(mismatchCount,0,`${trace.caseId}: isolated native input persists or is removed at the measured 1e-9 threshold`);
  }
  assert.ok(strictCalibrationPassed,'strict native oxygen calibration frame was compared');
  // Report every frame mismatch without broadening tolerances. Known whole-cell
  // swaps and density ordering remain visible as measured differences.
  console.info(`4.4 native trace diagnostics: ${JSON.stringify(diagnostics)}`);
});

test('4.4 independent x=15/y=15 oxygen anchor matches eight native ticks',()=>{
  const fixture=JSON.parse(readFileSync(new URL('../../../References/OxygenNotIncluded/GasTicks/native-gas-anchor-oxygen-15-16.json',import.meta.url),'utf8'));
  assert.equal(String(fixture.gameBuild),'24423041');
  const trace=fixture.cases[0],world=makeWorld(trace,fixture.world);
  assert.equal(trace.ticks,8);
  for(let tick=1;tick<trace.frames.length;tick++){
    world.time=trace.frames[tick].timeSeconds;
    stepAtmosphere(world,trace.dtSeconds,world.cycleSeconds);
    assert.deepEqual(compareFrame(world,trace.frames[tick],trace),[],`native anchor tick ${tick}`);
  }
});

test('4.4 native isolated oxygen mass probes match through 1,000,000 kg',()=>{
  const fixture=JSON.parse(readFileSync(new URL('../../../References/OxygenNotIncluded/GasTicks/native-gas-max-mass-4.4.json',import.meta.url),'utf8'));
  assert.equal(String(fixture.gameBuild),'24423041');
  for(const trace of fixture.cases){
    const world=makeWorld(trace,fixture.world);
    for(let tick=1;tick<trace.frames.length;tick++){
      world.time=trace.frames[tick].timeSeconds;
      stepAtmosphere(world,trace.dtSeconds,world.cycleSeconds);
      assert.deepEqual(compareFrame(world,trace.frames[tick],trace),[],`${trace.caseId}: native 0.2 s frame ${tick}`);
    }
  }
});

test('4.4 diagonal gas exchange requires both orthogonal corner cells to be open',()=>{
  const makeCorner=(openMiddleCount,doorOnOpenMiddle=false)=>{
    const w=3,h=3,cells=Array.from({length:9},()=>({...blank(),solid:'Unobtanium'}));
    const world={w,h,cells,time:.2,restoredRules:true,cycleSeconds:600,waterKgPerCell:1000,
      cell(x,y){return x>=0&&y>=0&&x<w&&y<h?cells[y*w+x]:null;},
      _doorBlocksFluid(x,y){const d=this._doorMap.get(y*w+x);return !!d&&!d.doorOpen;},_doorMap:new Map()};
    const open=(x,y)=>{const c=world.cell(x,y);c.solid=null;c.temp=20;};
    open(1,1);open(2,0); // southwest donor and northeast receiver, y-down grid
    open(1,0);if(openMiddleCount===2)open(2,1);
    if(doorOnOpenMiddle)world._doorMap.set(1,{doorOpen:false});
    world.cell(1,1).oxygen=2/MASS_PER_UNIT;
    return world;
  };
  const amount=(world,x,y)=>world.cell(x,y).oxygen*MASS_PER_UNIT;
  const sealed=makeCorner(0);stepAtmosphere(sealed,.2);assert.equal(amount(sealed,2,0),0);
  const onePath=makeCorner(1);stepAtmosphere(onePath,.2);assert.equal(amount(onePath,2,0),0);assert.ok(Math.abs(amount(onePath,1,0)-.24)<1e-9);
  onePath.time=.4;stepAtmosphere(onePath,.2);assert.ok(Math.abs(amount(onePath,2,0)-.0288)<1e-8);
  const bothPaths=makeCorner(2);stepAtmosphere(bothPaths,.2);assert.ok(Math.abs(amount(bothPaths,2,0)-.24)<1e-8);
  const closedDoor=makeCorner(2,true);stepAtmosphere(closedDoor,.2);assert.equal(amount(closedDoor,2,0),0);
});

test('4.4 native corner-opening traces reproduce closed, one-open, and two-open paths',()=>{
  const files=['native-gas-corner-0-4.4.json','native-gas-corner-1-4.4.json','native-gas-corner-2-4.4.json'];
  const ticks=[2,2,1];
  for(let i=0;i<files.length;i++){
    const fixture=JSON.parse(readFileSync(new URL(`../../../References/OxygenNotIncluded/GasTicks/${files[i]}`,import.meta.url),'utf8'));
    assert.equal(String(fixture.gameBuild),'24423041');
    const trace=fixture.cases[0],world=makeWorld(trace,fixture.world);
    for(let tick=1;tick<=ticks[i];tick++){
      world.time=trace.frames[tick].timeSeconds;
      stepAtmosphere(world,trace.dtSeconds,world.cycleSeconds);
      assert.deepEqual(compareFrame(world,trace.frames[tick],trace),[],`${trace.caseId}: native corner geometry tick ${tick}`);
    }
  }
});

test('4.4 high-pressure oxygen survives save/load and a normal 0.2 s engine update',()=>{
  const game=new Game(73,'oni-4.4');
  for(const cell of game.cells){cell.oxygen=0;cell.co2=0;cell.hydrogen=0;cell.steam=0;cell.water=0;cell.frost=0;delete cell.liquidElement;delete cell.steamVent;delete cell.ventOutput;}
  const cell=game.cells.find(c=>!c.solid);
  assert.ok(cell,'test world has an open gas cell');
  const accepted=addAtmosphere(game,cell,'oxygen',1_000_000,20);
  assert.equal(accepted,1_000_000,'4.4 source API preserves the largest tested native isolated-cell input');
  const originalMass=game.cells.reduce((sum,c)=>sum+gasMass(c),0);
  const restored=new Game(9,'oni-4.4');for(const c of restored.cells){delete c.steamVent;delete c.ventOutput;}restored.load(game.serialize());
  restored._crewStep=()=>{};
  const loadedMass=restored.cells.reduce((sum,c)=>sum+gasMass(c),0);
  assert.ok(Math.abs(loadedMass-1_000_000)<1e-5,'1,000,000 kg cell survives measured-range save validation');
  restored.step(.2);
  const steppedMass=restored.cells.reduce((sum,c)=>sum+gasMass(c),0);
  assert.ok(Math.abs(steppedMass-originalMass)<1e-5,`normal engine environment update conserves high-pressure gas (${originalMass} → ${steppedMass})`);
});

test('4.4 density inversion uses a deterministic 1-in-16 event sample and preserves stable layers',()=>{
  const makePairs=(upper,lower)=>{
    const w=32,h=32,cells=Array.from({length:w*h},()=>({...blank(),solid:'Unobtanium'}));
    const world={w,h,cells,time:0,seed:73,restoredRules:true,cycleSeconds:600,waterKgPerCell:1000,
      cell(x,y){return x>=0&&y>=0&&x<w&&y<h?cells[y*w+x]:null;},_doorBlocksFluid(){return false;}};
    const pairs=[];
    for(let y=2;y<=29;y+=3)for(let x=2;x<=28;x+=2){
      const top=world.cell(x,y),bottom=world.cell(x,y+1);top.solid=null;bottom.solid=null;
      top[upper]=upper==='oxygen'||upper==='co2'?2/MASS_PER_UNIT:2;
      bottom[lower]=lower==='oxygen'||lower==='co2'?2/MASS_PER_UNIT:2;
      top.temp=bottom.temp=150;pairs.push({x,y,top,bottom});
    }
    return {world,pairs};
  };
  const run=(upper,lower,limit=120)=>{
    const {world,pairs}=makePairs(upper,lower),flips=new Array(pairs.length).fill(0);
    for(let tick=1;tick<=limit;tick++){
      world.time=tick*.2;stepAtmosphere(world,.2);
      for(let i=0;i<pairs.length;i++)if(!flips[i]&&pairs[i].top[lower]>0)flips[i]=tick;
    }
    return flips;
  };
  for(const[upper,lower]of[['oxygen','hydrogen'],['co2','oxygen']]){
    const flips=run(upper,lower);assert.equal(flips.filter(Boolean).length,140,`${upper}/${lower}: every measured inverted pair eventually exchanges`);
    const ordered=flips.slice().sort((a,b)=>a-b),mean=flips.reduce((a,b)=>a+b,0)/flips.length,median=(ordered[69]+ordered[70])/2;
    assert.ok(mean>=12&&mean<=20,`${upper}/${lower}: fitted first-exchange mean near 15.47 ticks (${mean})`);
    assert.ok(median>=8&&median<=16,`${upper}/${lower}: fitted median near 11 ticks (${median})`);
    console.info(`4.4 density sample ${upper}/${lower}: first-flips=140/140 mean=${mean.toFixed(3)} median=${median.toFixed(1)} range=${ordered[0]}–${ordered.at(-1)}; deterministic fit, not native PRNG`);
    assert.equal(run(upper,lower).join(','),flips.join(','),`${upper}/${lower}: seed and position determine replay sequence`);
  }
  assert.equal(run('hydrogen','oxygen').filter(Boolean).length,0,'light H₂ over heavier O₂ is stable');
  assert.equal(run('oxygen','steam').filter(Boolean).length,0,'lighter O₂ over heavier steam is stable by installed molar mass');
});

test('4.4 density events replay identically after a real Game serialize/load checkpoint',()=>{
  const game=new Game(73,'oni-4.4');
  for(const c of game.cells){c.solid='bedrock';c.oxygen=0;c.co2=0;c.hydrogen=0;c.steam=0;c.water=0;c.frost=0;delete c.liquidElement;delete c.steamVent;delete c.ventOutput;c.temp=150;}
  for(let y=2;y<=25;y+=3)for(let x=2;x<=28;x+=2){
    const top=game.cell(x,y),bottom=game.cell(x,y+1);top.solid=bottom.solid=null;
    top.oxygen=2/MASS_PER_UNIT;bottom.hydrogen=2;
  }
  game._crewStep=()=>{};game._buildingStep=()=>{};
  for(let i=0;i<7;i++)game.step(.2);
  const resumed=new Game(1,'oni-4.4');resumed.load(game.serialize());
  resumed._crewStep=()=>{};resumed._buildingStep=()=>{};
  for(let i=0;i<113;i++){game.step(.2);resumed.step(.2);}
  assert.equal(resumed.time,game.time);
  assert.deepEqual(resumed.cells.map(c=>[c.oxygen,c.co2,c.hydrogen,c.steam,c.temp]),game.cells.map(c=>[c.oxygen,c.co2,c.hydrogen,c.steam,c.temp]));
});
