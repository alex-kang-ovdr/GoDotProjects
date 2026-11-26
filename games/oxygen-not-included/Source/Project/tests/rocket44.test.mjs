import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../../Web/engine.js';
import {
  buildingAttachmentPoint, buildingAttachableCell, buildingBounds
} from '../../../Web/footprint.js';

const ROCKET_RULES='oni-4.4';

function unlockRocketry(game){
  game.researchProgress.completed.push('BasicRocketry');
}

function clearRocketFixture(game){
  for(let y=0;y<game.h;y++)for(let x=37;x<=43;x++){
    const cell=game.cell(x,y);
    if(cell)cell.revealed=true;
  }
  // Tests prepare an excavated launch site and shaft; reset itself only opens
  // the seven ceiling cells, leaving all underground terrain for the player.
  for(let y=0;y<=27;y++)for(let x=37;x<=43;x++){
    const cell=game.cell(x,y);
    if(cell){cell.solid=null;cell.water=0;cell.oxygen=0;cell.co2=0;cell.hydrogen=0;cell.steam=0;}
  }
  for(let x=37;x<=43;x++)game.cell(x,23).solid='tile';
}

function builtRocket(game,{researchCount=1}={}){
  clearRocketFixture(game);
  const engine=game._addBuilding('steamRocket',37,22,true);
  const researchModules=[];
  let host=engine;
  for(let index=0;index<researchCount;index++){
    const hostPoint=buildingAttachmentPoint(host);
    const childAttach=buildingAttachableCell({type:'researchModule',x:0,y:0});
    const position={x:hostPoint.x-childAttach.x,y:hostPoint.y+childAttach.y};
    const module=game._addBuilding('researchModule',position.x,position.y,true);
    researchModules.push(module);
    host=module;
  }
  const hostPoint=buildingAttachmentPoint(host);
  const childAttach=buildingAttachableCell({type:'commandModule',x:0,y:0});
  const position={x:hostPoint.x-childAttach.x,y:hostPoint.y+childAttach.y};
  const command=game._addBuilding('commandModule',position.x,position.y,true);
  engine.steamFuel=900;
  return{engine,researchModules,command};
}

function addBoardingLadder(game,pilot){
  for(let y=7;y<=22;y++){
    const cell=game.cell(36,y);
    cell.solid=null;
    cell.revealed=true;
    game._addBuilding('ladder',36,y,true);
  }
  game.cell(36,23).solid='tile';
  game.cell(37,8).solid='tile';
  pilot.x=36.5;
  pilot.y=22.5;
}

test('4.4 uses stacked research modules, optional research payload, and profile-specific engine definition',()=>{
  const legacy=new Game(73,'oni-4.3');
  assert.deepEqual(legacy.buildingDefinition('steamRocket').cost,{metal:160,rock:100});
  assert.equal(legacy.buildingDefinition('steamRocket').name,'증기 연구 로켓');
  assert.equal(legacy.canPlace('researchModule',38,17).ok,false);

  const game=new Game(73,ROCKET_RULES);
  const {engine,researchModules,command}=builtRocket(game,{researchCount:2});
  const state=game.getRocketState(researchModules[1].id);
  assert.equal(state.engineId,engine.id);
  assert.deepEqual(state.researchIds,researchModules.map(module=>module.id));
  assert.equal(state.researchModuleCount,2);
  assert.equal(state.commandId,command.id);
  assert.equal(state.expectedResearchPosition.y,7,
    'the next module anchor follows the last research-module hardpoint');
  assert.deepEqual(buildingBounds(engine),{x:37,y:18,width:7,height:5});
  assert.equal(game.buildingDefinition('steamRocket').cost.metal,40);

  const withoutResearch=new Game(73,ROCKET_RULES);
  const assembly=builtRocket(withoutResearch,{researchCount:0});
  assert.equal(withoutResearch.getRocketState(assembly.command.id).researchModuleCount,0,
    'the command module may attach directly to the engine');
});

test('4.4 launch validates certification, saves an in-flight pilot, and returns each module reward once',()=>{
  const game=new Game(73,ROCKET_RULES);
  const {engine,researchModules,command}=builtRocket(game,{researchCount:2});
  const pilot=game.crew[0];
  addBoardingLadder(game,pilot);
  pilot.skillPoints=1;
  assert.equal(game.certifyRocketPilot(pilot.id).ok,true);
  assert.equal(game.assignRocketPilot(command.id,pilot.id).ok,true);
  assert.equal(game.getRocketState(engine.id).ready,false,
    'certification and assignment do not count as boarding');
  assert.equal(game.launchResearchFlight(researchModules[0].id).ok,false);
  for(let tick=0;tick<5;tick++)game._crewStep(pilot,.1);
  assert.equal(game.getRocketState(command.id).pilotBoarding,true);

  const saved=game.serialize();
  const loaded=new Game(1,ROCKET_RULES);
  assert.equal(loaded.load(saved),true);
  const resumed=loaded.buildings.find(building=>building.id===engine.id);
  const loadedPilot=loaded.crew.find(crew=>crew.id===pilot.id);
  assert.equal(loaded.getRocketState(command.id).pilotBoarding,true,
    'boarding movement survives a mid-route save');
  for(let tick=0;tick<120;tick++)loaded._crewStep(loadedPilot,.1);
  assert.equal(loaded.getRocketState(engine.id).pilotBoarded,true);
  assert.equal(loaded.getRocketState(engine.id).ready,true);
  assert.equal(loaded.launchResearchFlight(researchModules[0].id).ok,true);
  assert.equal(loaded.getRocketState(command.id).missionState,'inFlight');
  assert.equal(loadedPilot.rocketFlightId,engine.id);

  const savedFlight=loaded.serialize();
  const flightResume=new Game(1,ROCKET_RULES);
  assert.equal(flightResume.load(savedFlight),true);
  const flightEngine=flightResume.buildings.find(building=>building.id===engine.id);
  flightResume.time=flightEngine.returnAt;
  flightResume._finishUtilities(.1);
  flightResume._finishUtilities(.1);
  assert.equal(flightResume.resources.dataBank,120,
    'two modules each return 10 kg evergreen data and one 50 kg first-discovery bonus');
  assert.equal(flightResume.resources.researchOpportunitiesByDestination['fixed:0'],2);
  assert.equal(flightResume.crew.find(crew=>crew.id===pilot.id).rocketFlightId,undefined);
  assert.equal(flightEngine.missionState,'grounded');

  flightEngine.steamFuel=900;
  assert.equal(flightResume.setRocketTarget(command.id,1).ok,true);
  assert.equal(flightResume.getRocketState(engine.id).targetId,1);
  assert.equal(flightResume.getRocketState(engine.id).targetName,'탄소질 소행성 2');
  assert.equal(flightResume.launchResearchFlight(engine.id).ok,false,
    'the returned pilot must reach the boarding point again');
  const returnedPilot=flightResume.crew.find(crew=>crew.id===pilot.id);
  for(let tick=0;tick<120;tick++)flightResume._crewStep(returnedPilot,.1);
  assert.equal(flightResume.getRocketState(engine.id).pilotBoarded,true);
  assert.equal(flightResume.launchResearchFlight(engine.id).ok,true);
  flightResume.time=flightEngine.returnAt;
  flightResume._finishUtilities(.1);
  assert.equal(flightResume.resources.researchOpportunitiesByDestination['fixed:1'],2,
    'the second fixed target has an independent discovery counter');
  assert.equal(flightResume.resources.dataBank,240);
});

test('4.4 placement follows actual attachment points and confines fresh-map opening to the ceiling exit',()=>{
  const game=new Game(73,ROCKET_RULES);
  const outside=game.cell(36,0),inside=game.cell(40,0);
  assert.ok(outside.solid,'the shaft does not widen the permanent ceiling opening');
  assert.equal(inside.solid,null);

  unlockRocketry(game);
  clearRocketFixture(game);
  const engine=game._addBuilding('steamRocket',37,22,true);
  const attach=buildingAttachableCell({type:'researchModule',x:38,y:17});
  assert.deepEqual(attach,buildingAttachmentPoint(engine));
  assert.equal(game.canPlace('researchModule',38,17).ok,true);
  assert.equal(game.canPlace('researchModule',38,16).ok,false);
  assert.equal(game.buildingDefinition('steamRocket').description.includes('900 kg'),true);

  const placementGame=new Game(73,ROCKET_RULES);
  unlockRocketry(placementGame);
  clearRocketFixture(placementGame);
  placementGame.resources.metal=1000;
  placementGame.resources.rock=1000;
  const before={metal:placementGame.resources.metal,rock:placementGame.resources.rock};
  assert.equal(placementGame.queue('steamRocket',37,22).ok,true);
  const queued=placementGame.buildings.find(building=>building.type==='steamRocket');
  assert.deepEqual(queued.paidCost,{metal:40,rock:30});
  assert.equal(before.metal-placementGame.resources.metal,40);
  assert.equal(before.rock-placementGame.resources.rock,30);

  const legacy=new Game(73,'oni-4.3');
  unlockRocketry(legacy);
  clearRocketFixture(legacy);
  legacy.resources.metal=1000;
  legacy.resources.rock=1000;
  assert.equal(legacy.queue('steamRocket',37,22).ok,true);
  assert.deepEqual(legacy.buildings.find(building=>building.type==='steamRocket').paidCost,
    {metal:160,rock:100},'the integrated 4.3 rocket keeps its archived purchase cost');
});

test('4.4 prevents removing or cancelling a rocket parent before its attached children',()=>{
  const game=new Game(73,ROCKET_RULES);
  const {engine,researchModules,command}=builtRocket(game,{researchCount:2});
  engine.steamFuel=0;
  assert.equal(game.canPlace('deconstruct',engine.x,engine.y).ok,false,
    'the engine cannot be removed while it supports modules');
  assert.equal(game.canPlace('deconstruct',researchModules[1].x,researchModules[1].y).ok,false,
    'a research module cannot be removed while command module remains attached');
  assert.equal(game.canPlace('deconstruct',command.x,command.y).ok,true,
    'the top module can be removed first');

  const blueprintGame=new Game(73,ROCKET_RULES);
  const blueprint=builtRocket(blueprintGame,{researchCount:1});
  blueprint.engine.progress=.5;
  assert.equal(blueprintGame.canPlace('cancel',blueprint.engine.x,blueprint.engine.y).ok,false,
    'a partially built parent cannot be cancelled while attached children exist');
});

test('4.4 blocks launch from an unreachable boarding point and clears the assigned route on unassignment',()=>{
  const game=new Game(73,ROCKET_RULES);
  const {engine,command}=builtRocket(game,{researchCount:1});
  for(let y=0;y<game.h;y++)game.cell(35,y).solid='rock';
  const pilot=game.crew[0];
  game.cell(10,10).solid=null;
  game.cell(10,11).solid='tile';
  pilot.x=10.5;
  pilot.y=10.5;
  pilot.skillPoints=1;
  game.certifyRocketPilot(pilot.id);
  game.assignRocketPilot(command.id,pilot.id);
  game._crewStep(pilot,.1);
  const state=game.getRocketState(engine.id);
  assert.equal(state.pilotBoardBlocked,true);
  assert.equal(state.ready,false);
  assert.match(state.reason,/접근할 수 없습니다/);
  assert.equal(game.launchResearchFlight(engine.id).ok,false);

  assert.equal(game.assignRocketPilot(command.id,null).ok,true);
  assert.equal(pilot.rocketBoardingId,undefined);
  assert.equal(pilot.rocketBoardBlocked,undefined);
  assert.equal(pilot._job?.kind==='rocketBoard',false,
    'unassigning the pilot releases any automatic boarding walk');
});
