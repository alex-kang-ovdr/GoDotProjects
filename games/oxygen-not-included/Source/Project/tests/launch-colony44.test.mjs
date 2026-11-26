import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../../../Web/engine.js';
import {buildingPort} from '../../../Web/footprint.js';

test('workers build an accessible stack, board, take steam packets at the inlet and launch',()=>{
  const game=new Game(73);
  game.researchProgress.completed.push('BasicRocketry','GasPiping');
  Object.assign(game.resources,{rock:1000,metal:1000});
  // A prepared construction site with a maintenance ladder alongside the rocket.
  for(let y=0;y<=20;y++)for(let x=36;x<=44;x++){
    Object.assign(game.cell(x,y),{solid:null,water:0,frost:0,oxygen:2,co2:0,steam:0,hydrogen:0,revealed:true,temp:22});
  }
  for(let x=36;x<=44;x++)game.cell(x,21).solid='tile';
  for(let y=5;y<=20;y++)game._addBuilding('ladder',36,y);
  for(const y of [10,15])game._addBuilding('ladder',37,y);
  const pilot=game.crew[0];
  Object.assign(pilot,{x:36.5,y:20.5,role:'build',skillPoints:1});

  for(const [type,x,y] of [['steamRocket',37,20],['researchModule',38,15],['commandModule',38,10]]){
    const order=game.queue(type,x,y);
    assert.ok(order.ok,order.message);
    const building=game.buildings.find(b=>b.type===type);
    for(let i=0;i<1000&&building.progress<1;i++)game.step(.2);
    assert.equal(building.progress,1,type);
  }
  const engine=game.buildings.find(b=>b.type==='steamRocket');
  const pod=game.buildings.find(b=>b.type==='commandModule');
  assert.ok(game.certifyRocketPilot(pilot.id).ok);
  assert.ok(game.assignRocketPilot(pod.id,pilot.id).ok);
  for(let i=0;i<500&&!game.getRocketState(engine.id).pilotBoarded;i++)game.step(.2);
  assert.ok(game.getRocketState(engine.id).pilotBoarded);
  assert.equal(game.getRocketState(engine.id).ready,false);

  const port=buildingPort(engine,'gasIn');
  assert.ok(game.queue('gaspipe',port.x,port.y).ok);
  const inlet=game.cell(port.x,port.y);
  inlet.gasPacket={element:'hydrogen',mass:1,temp:150};
  game.step(.2);
  assert.equal(engine.steamFuel,0);
  assert.equal(inlet.gasPacket.element,'hydrogen');
  for(let i=0;i<900;i++){
    inlet.gasPacket={element:'steam',mass:1,temp:150};
    game.step(.1);
    assert.equal(inlet.gasPacket,null);
  }
  assert.equal(engine.steamFuel,900);
  assert.ok(game.getRocketState(engine.id).ready);
  assert.ok(game.launchResearchFlight(engine.id).ok);
  assert.equal(pilot.rocketFlightId,engine.id);
});
