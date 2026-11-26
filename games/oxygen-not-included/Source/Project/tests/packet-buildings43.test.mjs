import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../../Web/engine.js';
import { buildingPort } from '../../../Web/footprint.js';

function cellAt(g,b,key){
  const p=buildingPort(b,key);assert.ok(p,key);return g.cell(p.x,p.y);
}
function ticks(g,n,fn){
  for(let i=0;i<n;i++){g.time+=.1;fn(.1);}
}
function close(a,b){assert.ok(Math.abs(a-b)<1e-6,`${a} ≠ ${b}`);}

test('installed gas output feeds a tee and two vents without taking gases from the pipes under its anchor',()=>{
  const g=new Game(73),pump=g._addBuilding('gasPump',14,16),v1=g._addBuilding('gasVent',20,15),v2=g._addBuilding('gasVent',17,13);
  for(let x=15;x<=20;x++)g.cell(x,15).gasPipe=true;
  for(let y=13;y<=15;y++)g.cell(17,y).gasPipe=true;
  const points=[pump,v1,v2];
  for(const b of points){b.enabled=true;Object.assign(g.cell(b.x,b.y),{oxygen:0,co2:0,hydrogen:0,steam:0,water:0});}
  // Empty the inlet neighborhood so all produced mass comes from the source.
  for(let y=15;y<=17;y++)for(let x=13;x<=15;x++)Object.assign(g.cell(x,y),{oxygen:0,co2:0,hydrogen:0,steam:0});
  g.cell(14,16).hydrogen=6;g.cell(14,16).temp=72;pump.active=true;g._packetDirty=true;
  ticks(g,120,dt=>g._gasProcess(dt));
  const first=g.cell(v1.x,v1.y).hydrogen,second=g.cell(v2.x,v2.y).hydrogen;
  assert.ok(first>0&&second>0);
  close(g.cells.reduce((n,c)=>n+(c.hydrogen||0)+(c.gasPacket?.mass||0),0),6);
  assert.ok(g.cells.every(c=>['oxygen','co2','steam','hydrogen'].filter(k=>c[k]>1e-9).length<=1));
  assert.equal(g.cell(pump.x,pump.y).gasPipe,undefined);
});

test('one liquid conduit carries polluted water to a vent, with preserved pipe temperature after load',()=>{
  const g=new Game(73),tank=g._addBuilding('reservoir',16,16),vent=g._addBuilding('liquidVent',20,16);
  const out=buildingPort(tank,'liquidOut');for(let x=out.x;x<=20;x++)g.cell(x,16).pipe=true;
  Object.assign(tank,{cleanWater:0,dirtyWater:20,dirtyWaterTemp:56});g._fluidDirty=g._packetDirty=true;
  const run=(g,n)=>ticks(g,n,dt=>{g._startUtilities(dt);g._finishUtilities(dt);});
  run(g,14);const saved=g.serialize(),h=new Game(73);
  assert.equal(h.load(saved),true);
  for(const colony of [g,h]){
    assert.ok(colony.cells.some(c=>c.pipe&&c.dirtyWater>0&&c.liquidPacketTemp===56));
    run(colony,65);
    const dst=colony.cell(vent.x,vent.y);
    assert.equal(dst.liquidElement,'dirtyWater');
    close(dst.water*colony.waterKgPerCell,20);close(dst.temp,56);
    assert.ok(colony.cells.every(c=>!(c.cleanWater>0&&c.dirtyWater>0)));
  }
});

test('a research expedition only returns data once after loading a flight in progress',()=>{
  const g=new Game(29,'oni-4.3'),b=g._addBuilding('steamRocket',14,16);
  for(let y=12;y<=16;y++)for(let x=14;x<21;x++)g.cell(x,y).solid=null;
  const p=cellAt(g,b,'gasIn');p.gasPipe=true;g._packetDirty=true;
  assert.equal(g.launchResearchFlight(b.id).ok,false);
  for(let i=0;i<100;i++){p.gasPacket={element:'steam',mass:1,temp:160};g.time+=.1;g._finishUtilities(.1);}
  close(b.steamFuel,100);assert.equal(g.launchResearchFlight(b.id).ok,true);
  assert.equal(g.launchResearchFlight(b.id).ok,false);
  const h=new Game(1);h.load(g.serialize());
  const rocket=h.buildings.find(v=>v.id===b.id);h.time=rocket.returnAt-.1;h._finishUtilities(.1);assert.equal(h.resources.dataBank,0);
  h.time=rocket.returnAt;h._finishUtilities(.1);h._finishUtilities(.1);
  assert.equal(h.resources.researchFlights,1);assert.equal(h.resources.dataBank,60);
});
