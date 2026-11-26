import test from 'node:test';
import assert from 'node:assert/strict';
import {buildConduitGraph,cellConduitAdapter,advanceConduits,pipeDue} from '../../../Web/conduits.js';

function pipes(nodes,sources,sinks,layer='gas') {
  const cells=Array.from({length:70},()=>({cleanWater:0,dirtyWater:0,temp:20,pipeFlow:0}));
  const graph=buildConduitGraph(10,nodes,sources,sinks);
  const adapter=cellConduitAdapter(cells,layer);
  return {cells,graph,step:()=>advanceConduits(graph,adapter)};
}
test('a gas tee alternates whole packets between unequal length eligible branches',()=>{
  const net=pipes([31,32,33,34,35,22,12,2],[31],[35,2]);
  let a=0,b=0,sent=0;
  for(let tick=0;tick<60;tick++){
    if(!net.cells[31].gasPacket){net.cells[31].gasPacket={element:'hydrogen',mass:0.5,temp:40};sent+=.5;}
    net.step();
    for(const i of [35,2]){
      const p=net.cells[i].gasPacket;
      if(p){if(i===35)a+=p.mass;else b+=p.mass;delete net.cells[i].gasPacket;}
    }
  }
  assert.ok(Math.abs(a-b)<=.5&&a>=13&&b>=13);
  assert.equal(a+b+net.cells.reduce((n,c)=>n+(c.gasPacket?.mass||0),0),sent);
});
test('blocked outlets keep their packet and the other leg keeps flowing',()=>{
  const n=pipes([31,32,33,22],[31],[33,22]);
  n.cells[22].gasPacket={element:'co2',mass:.75,temp:12};
  let count=0;
  for(let t=0;t<10;t++){
    if(!n.cells[31].gasPacket)n.cells[31].gasPacket={element:'oxygen',mass:1,temp:30};
    n.step();if(n.cells[33].gasPacket){count++;delete n.cells[33].gasPacket;}
  }
  assert.deepEqual(n.cells[22].gasPacket,{element:'co2',mass:.75,temp:12});
  assert.ok(count>=8);
});
test('two liquid inputs take turns at a merge and resuming from copied pipe state preserves the next turn',()=>{
  const n=pipes([31,32,33,22],[31,22],[33],'liquid');
  const seen=[];
  function cycle(g){
    if(!g.cells[31].cleanWater)g.cells[31].cleanWater=10;
    if(!g.cells[22].dirtyWater)g.cells[22].dirtyWater=10;
    g.step();const c=g.cells[33];const e=c.cleanWater?'cleanWater':c.dirtyWater?'dirtyWater':'';
    if(e)c[e]=0;return e;
  }
  for(let t=0;t<15;t++){const e=cycle(n);if(e)seen.push(e);}
  assert.ok(seen.length>=12);
  for(let i=1;i<seen.length;i++)assert.notEqual(seen[i],seen[i-1]);
  const restored=pipes([31,32,33,22],[31,22],[33],'liquid');
  for(let i=0;i<n.cells.length;i++)Object.assign(restored.cells[i],structuredClone(n.cells[i]));
  for(let t=0;t<8;t++)assert.equal(cycle(restored),cycle(n));
});
test('packets move just one cell per conduit update and rates observe the two phase offsets',()=>{
  const g=pipes([31,32,33,34],[31],[34]);
  g.cells[31].gasPacket={element:'steam',mass:.4,temp:150};g.step();
  assert.equal(g.cells[32].gasPacket.mass,.4);assert.equal(g.cells[33].gasPacket,undefined);
  assert.equal(pipeDue(.8,.1,.25),true);assert.equal(pipeDue(.8,.1,.75),false);
  assert.equal(pipeDue(.3,.1,.75),true);
});

test('bridge inlet prefers the bridge, its outlet yields to the through line, and a full outlet allows overflow',()=>{
  const n=pipes([11,12,13,31,32,33],[11,31,32],[12,13,33]);
  const io=cellConduitAdapter(n.cells,'gas');
  const put=(i,element)=>{n.cells[i].gasPacket={element,mass:1,temp:20};};
  const pulse=()=>advanceConduits(n.graph,io,[{from:12,to:32}]);
  put(12,'hydrogen');pulse();
  assert.equal(n.cells[32].gasPacket?.element,'hydrogen');
  assert.ok(!n.cells[13].gasPacket);
  delete n.cells[32].gasPacket;
  put(12,'co2');put(31,'steam');pulse();
  assert.equal(n.cells[32].gasPacket?.element,'steam');
  assert.equal(n.cells[13].gasPacket?.element,'co2');
});

test('a disconnected dead-end drains an old packet towards a plumbed inlet',()=>{
  const n=pipes([31,32,33,22,12],[31],[33]);
  n.cells[12].gasPacket={element:'oxygen',mass:1,temp:22};
  for(let i=0;i<3;i++)n.step();
  assert.deepEqual(n.cells[33].gasPacket,{element:'oxygen',mass:1,temp:22});
});

test('a tee fills the free space in one outlet and sends the remaining original mass down the other',()=>{
  const n=pipes([31,32,33,22],[31],[33,22]);
  n.cells[32].gasPacket={element:'steam',mass:1,temp:130};
  n.cells[33].gasPacket={element:'steam',mass:.75,temp:170};
  n.step();
  assert.deepEqual(n.cells[33].gasPacket,{element:'steam',mass:1,temp:160});
  assert.deepEqual(n.cells[22].gasPacket,{element:'steam',mass:.75,temp:130});
  assert.equal(n.cells[32].gasPacket,null);
});
