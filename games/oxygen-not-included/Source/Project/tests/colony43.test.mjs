import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../../Web/engine.js';
import { selectResearch, RESEARCH_TECHS } from '../../../Web/research.js';
import { buildingPort } from '../../../Web/footprint.js';

test('a new colony mines and hauls research material, resumes mid-tech and builds a rotated bridge after the unlock',()=>{
  let g=new Game(73,'oni-4.3');
  assert.equal(g.ruleset,'oni-4.3');
  assert.equal(g.canPlace('gasBridge',17,14,1).ok,false);
  for(const [type,x,y] of [['storage',12,11],['research',15,16],['diffuser',30,16],['dig',11,11]]){
    assert.equal(g.queue(type,x,y).ok,true,type);
  }
  assert.equal(selectResearch(g,'GasPiping').ok,true);
  for(let second=0;second<480&&!g.researchProgress.completed.includes('GasPiping')&&!g.lost;second++){
    g.step(1);
    if(second===80){
      const progress=g.researchProgress.progressByTech.GasPiping?.basic;
      assert.ok(progress>0&&progress<15);
      const resumed=new Game(91);assert.equal(resumed.load(g.serialize()),true);
      assert.equal(resumed.researchProgress.progressByTech.GasPiping.basic,progress);g=resumed;
    }
  }
  assert.equal(g.stats.research,15);
  assert.ok(g.researchProgress.completed.includes('GasPiping'));
  assert.ok(g.crew.every(c=>c.health>0));
  assert.ok(g.production.oxygenProduced>0&&g.production.hauledItems>=700);
  assert.equal(g.queue('gasBridge',17,14,1).ok,true);
  for(let i=0;i<100&&g.buildings.find(b=>b.type==='gasBridge').progress<1;i++)g.step(1);
  const bridge=g.buildings.find(b=>b.type==='gasBridge');
  assert.equal(bridge.progress,1);assert.equal(bridge.rotation,1);
  const input=buildingPort(bridge,'gasIn'),output=buildingPort(bridge,'gasOut');
  assert.equal(input.x,output.x);assert.equal(Math.abs(input.y-output.y),2);
});

test('all base-game technologies can complete with the three point types and survive a final save round trip',()=>{
  const g=new Game(73,'oni-4.3');
  const labs=[
    g._addBuilding('research',14,16),
    g._addBuilding('supercomputer',18,16),
    g._addBuilding('planetarium',25,16)
  ];
  const reservoir=g._addBuilding('reservoir',32,16);
  const totals={basic:0,advanced:0,space:0};
  for(const tech of RESEARCH_TECHS){
    for(const [kind,n] of Object.entries(tech.costs))totals[kind]+=n;
    selectResearch(g,tech.id);
  }
  assert.equal(g.researchProgress.queue.length,86);
  g.resources.soil=totals.basic*50;g.resources.dataBank=totals.space;
  for(let iteration=0;iteration<1000&&g.researchProgress.selected;iteration++){
    // Provide a full physical water tank and controlled cooling for this
    // scheduler test. Real-time station work is covered by the colony above.
    reservoir.cleanWater=5000;
    for(const lab of labs){
      g._researchWork(lab,20000,g.crew[0]);
      g.cell(lab.x,lab.y).temp=22;
    }
  }
  assert.equal(g.researchProgress.completed.length,86);
  assert.equal(g.researchProgress.selected,null);
  assert.deepEqual(g.researchProgress.queue,[]);
  assert.equal(g.stats.research,totals.basic+totals.advanced+totals.space);
  assert.equal(g.resources.soil,0);
  assert.equal(g.resources.dataBank,0);
  g._syncFluidTotals();
  const restored=new Game(1);assert.equal(restored.load(g.serialize()),true);
  assert.deepEqual(restored.researchProgress,g.researchProgress);
});
