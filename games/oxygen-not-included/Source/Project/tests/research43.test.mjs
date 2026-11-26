import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, BUILDINGS } from '../../../Web/engine.js';
import { RESEARCH_TECHS, RESEARCH_UNLOCKS, selectResearch, clearResearchQueue, researchTechName } from '../../../Web/research.js';

function poweredLab(game, type='research') {
  const lab=game._addBuilding(type,15,16,true);
  lab.connected=true;
  return {lab};
}

test('base-game tree contains installed tech graph, tier costs, and mapped supported building unlocks',()=>{
  assert.equal(RESEARCH_TECHS.length,86);
  assert.deepEqual(RESEARCH_TECHS.find(t=>t.id==='FarmingTech').costs,{basic:15});
  assert.deepEqual(RESEARCH_TECHS.find(t=>t.id==='AdvancedPowerRegulation').prerequisites,['Combustion']);
  assert.deepEqual(RESEARCH_TECHS.find(t=>t.id==='AdvancedPowerRegulation').costs,{basic:30,advanced:20});
  assert.deepEqual(RESEARCH_TECHS.find(t=>t.id==='CargoI').costs,{basic:70,advanced:100,space:200});
  for(const key of ['supercomputer','planetarium','gasBridge','liquidBridge','liquidVent'])assert.ok(RESEARCH_UNLOCKS[key]);
  assert.equal(researchTechName('FarmingTech'), '기본 재배');
  assert.equal(BUILDINGS.supercomputer.power,120);assert.equal(BUILDINGS.planetarium.power,120);
});

test('higher research selection queues unmet prerequisite path in order and clear preserves earned progress',()=>{
  const game=new Game(73,'oni-4.3');
  const queued=selectResearch(game,'Agriculture');
  assert.equal(queued.ok,true);
  assert.deepEqual(game.researchProgress.queue,['FarmingTech','FineDining','Agriculture']);
  assert.equal(game.researchProgress.selected,'FarmingTech');
  game.researchProgress.progressByTech.FarmingTech={basic:7};
  assert.equal(clearResearchQueue(game),true);
  assert.equal(game.researchProgress.selected,null);assert.deepEqual(game.researchProgress.queue,[]);
  assert.equal(game.researchProgress.progressByTech.FarmingTech.basic,7);
  const parallel=new Game(74,'oni-4.3');selectResearch(parallel,'Screens');
  const tiers=parallel.researchProgress.queue.map(id=>RESEARCH_TECHS.find(tech=>tech.id===id).tier);
  assert.deepEqual(tiers,[...tiers].sort((a,b)=>a-b));
});

test('research center assigns real crew work and carries fractional mass across saves',()=>{
  const game=new Game(73,'oni-4.3');game.resources.soil=1000;
  assert.equal(selectResearch(game,'FarmingTech').ok,true);
  const {lab}=poweredLab(game);
  assert.equal(game._researchCanWork(lab),true);
  game._researchWork(lab,2,game.crew[0]);
  assert.ok(game.stats.research===0,'fractional research mass does not mint a point');
  assert.ok(lab.researchRemainder>0&&lab.researchRemainder<1);
  const spent=game.resources.soil;
  const saved=game.serialize();
  const resumed=new Game(73,'oni-4.3');assert.equal(resumed.load(saved),true);
  const restored=resumed.buildings.find(b=>b.id===lab.id);
  assert.equal(restored.researchRemainder,lab.researchRemainder);
  resumed._researchWork(restored,25,resumed.crew[0]);assert.ok(resumed.resources.soil<spent);
  assert.ok(resumed.stats.research>0,'continued research completes an integer point');
});

test('supercomputer consumes stored water for advanced research without a pipe port',()=>{
  const game=new Game(73,'oni-4.3');
  game.researchProgress.completed=['FarmingTech','FineDining'];
  game.researchProgress.progressByTech={FarmingTech:{basic:15},FineDining:{basic:20}};game.stats.research=35;
  assert.equal(selectResearch(game,'Agriculture').ok,true);
  const {lab}=poweredLab(game,'supercomputer');
  assert.equal(game._researchCanWork(lab),true);
  const before=game.resources.water;game._researchWork(lab,30,game.crew[0]);
  assert.ok(game.resources.water<before);
  assert.ok(game.researchProgress.progressByTech.Agriculture?.advanced>0);
});

test('planetarium spends real data banks to produce space points and completes late-tier research',()=>{
  const game=new Game(73,'oni-4.3');game.resources.dataBank=20;
  game.researchProgress.completed=RESEARCH_TECHS.filter(t=>t.id!=='CargoI'&&t.tier<8).map(t=>t.id);
  game.researchProgress.queue=['CargoI'];game.researchProgress.selected='CargoI';
  const {lab}=poweredLab(game,'planetarium');
  const before=game.resources.dataBank;game._researchWork(lab,20,game.crew[0]);
  assert.ok(game.resources.dataBank<before);
  assert.ok(game.researchProgress.progressByTech.CargoI.space>0);
});

test('4.1 profiles keep their old numeric research and cannot place new research centers',()=>{
  for(const ruleset of ['oni-base','breath-4.1']){
    const game=new Game(73,ruleset);
    assert.equal(game.modernRules,false);
    assert.equal(game.canPlace('supercomputer',25,10).ok,false);
    assert.equal(game.canPlace('planetarium',25,10).ok,false);
    assert.equal(game.researchProgress,undefined);
  }
});

test('invalid research saves fail before changing the receiving colony',()=>{
  const source=new Game(73,'oni-4.3');selectResearch(source,'Agriculture');
  const valid=source.serialize();
  const mutations=[
    save=>{save.researchProgress.completed=['Agriculture'];},
    save=>{save.researchProgress.queue=['Agriculture','FarmingTech','FineDining'];save.researchProgress.selected='Agriculture';},
    save=>{save.stats.research=1;},
    save=>{save.buildings[0].researchRemainder=.5;},
  ];
  for(const mutate of mutations){
    const receiving=new Game(19,'oni-4.3'),before=receiving.serialize(),bad=structuredClone(valid);mutate(bad);
    assert.throws(()=>receiving.load(bad),/연구 대기열 또는 연구 진행 데이터/);
    assert.equal(receiving.serialize().seed,before.seed);
    assert.equal(receiving.serialize().time,before.time);
  }
});
