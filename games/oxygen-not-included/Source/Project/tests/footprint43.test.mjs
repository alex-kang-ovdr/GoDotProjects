import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUILDING_FOOTPRINTS, buildingBounds, buildingCells, buildingEvidence, buildingPort
} from '../../../Web/footprint.js';
import { Game } from '../../../Web/engine.js';
import { LEGACY_RULES, MODERN_RULES } from '../../../Web/rules.js';

test('installed building footprints match the audited ONI dimensions', () => {
  const expected={
    diffuser:[1,2], generator:[2,2], battery:[1,2], farm:[1,1], cot:[2,2],
    research:[2,2], pump:[2,2], coalgen:[3,3], toilet:[2,3], sink:[2,3],
    reservoir:[2,3], purifier:[4,3], electrolyzer:[2,2], hydrogenGen:[4,3],
    steamTurbine:[5,4], kitchen:[3,2], fridge:[1,2], storage:[1,2], mess:[1,1],
    door:[1,2], oxygenDock:[2,3], gasPump:[2,2], gasVent:[1,1],
    gasBridge:[3,1], liquidBridge:[3,1], liquidVent:[1,1], supercomputer:[3,3],
    planetarium:[4,4], steamRocket:[7,5]
  };
  for(const [type,[width,height]] of Object.entries(expected)){
    assert.equal(BUILDING_FOOTPRINTS[type].evidence,'installed-dll',`${type} source class is recorded`);
    assert.deepEqual(
      (({width,height})=>({width,height}))(buildingBounds({type,x:10,y:10})),
      {width,height},
      `${type} dimensions`
    );
  }
  assert.equal(buildingEvidence('core'),'web-approximation');
});

test('bounds and conduit offsets use lower-left placement anchors in a downward-y grid', () => {
  const purifier={type:'purifier',x:10,y:12};
  assert.deepEqual(buildingBounds(purifier),{x:10,y:10,width:4,height:3});
  assert.deepEqual(buildingPort(purifier,'power'),{x:13,y:12});
  assert.deepEqual(buildingPort(purifier,'liquidIn'),{x:10,y:10},
    'width-based origin conversion places the input on the left edge');
  assert.deepEqual(buildingPort(purifier,'liquidOut'),{x:13,y:10});
  const hydrogenGen={type:'hydrogenGen',x:10,y:12};
  assert.deepEqual(buildingPort(hydrogenGen,'gasIn'),{x:10,y:12},
    'the width-four input offset -1 maps to the left edge');
  assert.deepEqual(buildingPort(hydrogenGen,'power'),{x:12,y:12});
  assert.deepEqual(buildingPort({type:'planetarium',x:10,y:12},'power'),{x:11,y:12});
  assert.deepEqual(buildingPort({type:'reservoir',x:5,y:9},'liquidIn'),{x:6,y:7});
  assert.deepEqual(buildingPort({type:'reservoir',x:5,y:9},'liquidOut'),{x:5,y:9});
  assert.deepEqual(buildingCells({type:'pump',x:4,y:9}).at(-1),{x:5,y:9});
});

test('bridge rotation keeps its input and output on opposite endpoints', () => {
  const bridge={type:'gasBridge',x:8,y:12,rotation:0};
  assert.deepEqual(buildingPort(bridge,'gasIn'),{x:8,y:12});
  assert.deepEqual(buildingPort(bridge,'gasOut'),{x:10,y:12});
  bridge.rotation=1;
  assert.deepEqual(buildingBounds(bridge),{x:8,y:10,width:1,height:3});
  assert.deepEqual(buildingPort(bridge,'gasIn'),{x:8,y:10});
  assert.deepEqual(buildingPort(bridge,'gasOut'),{x:8,y:12});
  bridge.rotation=2;
  assert.deepEqual(buildingPort(bridge,'gasIn'),{x:10,y:12});
  assert.deepEqual(buildingPort(bridge,'gasOut'),{x:8,y:12});
  bridge.rotation=3;
  assert.deepEqual(buildingPort(bridge,'gasIn'),{x:8,y:12});
  assert.deepEqual(buildingPort(bridge,'gasOut'),{x:8,y:10});
  assert.equal(buildingPort({type:'battery',x:3,y:4,rotation:1},'power').x,3,
    'unsupported rotations are ignored for non-bridge buildings');
});

test('conduit bridges rotate in free space and overlay buildings without hiding them', () => {
  const game=new Game(73,MODERN_RULES);
  game.researchProgress.completed.push('GasPiping');
  game.researchProgress.progressByTech.GasPiping={basic:15};game.stats.research=15;
  const result=game.queue('gasBridge',24,11,1);
  assert.equal(result.ok,true,result.message);
  const bridge=game.buildings.find(building=>building.type==='gasBridge');
  assert.equal(bridge.rotation,1);
  assert.deepEqual(buildingBounds(bridge),{x:24,y:9,width:1,height:3});
  assert.equal(game._buildingAt(24,10)?.type,'core',
    'a utility-layer bridge does not replace the building returned for a shared cell');
  const loaded=new Game(1,MODERN_RULES);
  assert.equal(loaded.load(game.serialize()),true,
    'the validator accepts conduit-only overlap with a structure');
  const restoredBridge=loaded.buildings.find(building=>building.type==='gasBridge');
  assert.equal(restoredBridge?.rotation,1);
  const remove=loaded.queue('removeGasBridge',24,10);
  assert.equal(remove.ok,true,remove.message);
  const task=loaded.tasks.find(item=>item.type==='deconstruct');
  assert.equal(task.buildingId,restoredBridge.id,'removal targets the overlay despite physical selection priority');
  loaded._completeTask(task);
  assert.equal(loaded.buildings.some(building=>building.type==='gasBridge'),false);
  assert.equal(loaded.buildings.some(building=>building.type==='core'),true,
    'removing a conduit bridge leaves the overlapped building intact');
});

test('modern placement reserves a pump footprint and ignores unsupported rotation', () => {
  const modern=new Game(73,MODERN_RULES);
  modern.researchProgress.completed.push('LiquidPiping');
  modern.researchProgress.progressByTech.LiquidPiping={basic:15};modern.stats.research=15;
  assert.equal(modern.buildings.find(b=>b.type==='generator').connected,true,
    'starter generator power port touches the starter wire network');
  assert.equal(modern._buildingAt(24,10)?.type,'core',
    'any occupied cell resolves to its multi-cell building');
  const result=modern.queue('pump',33,11,3);
  assert.equal(result.ok,true,result.message);
  const pump=modern.buildings.find(b=>b.type==='pump');
  assert.equal(pump.rotation,0,'the installed LiquidPumpConfig does not permit rotation');
  assert.equal(modern._buildingAt(34,10)?.id,pump.id);
  const loaded=new Game(1,MODERN_RULES);
  assert.equal(loaded.load(modern.serialize()),true);
  assert.equal(loaded.buildings.find(b=>b.id===pump.id).rotation,0);
});

test('crew can walk through buildings to reach a new multi-cell research station', () => {
  const game=new Game(73,MODERN_RULES);
  assert.equal(game.queue('research',15,16).ok,true);
  const goals=game._workGoals(15,16);
  assert.equal(game.crew.every(crew=>game._path(crew,goals)!==null),true,
    'machine and cot footprints reserve building space without blocking crew movement');
  game.step(25);
  assert.equal(game.buildings.find(building=>building.type==='research')?.progress,1,
    'a reachable crew completes the placed research building');
});

test('legacy placement continues using the anchor cell only', () => {
  const legacy=new Game(73,LEGACY_RULES);
  assert.equal(legacy._buildingAt(15,11)?.type,'cot');
  assert.equal(legacy._buildingAt(18,11),undefined,
    'legacy overlapping cot anchors are intentionally not footprint-expanded');
});
