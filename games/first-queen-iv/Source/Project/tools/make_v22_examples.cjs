'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {Game,DATA}=require('../src/engine.js');
const root=path.resolve(__dirname,'..'),records=JSON.stringify(DATA.records),examples=[];
function save(name,g,description){
 const p=g.export(),h=new Game();h.import(p);
 assert.equal(JSON.stringify(h.snapshotBattle()),JSON.stringify(g.snapshotBattle()));
 assert.equal(JSON.stringify(h.world),JSON.stringify(g.world));
 assert.equal(p.schemaVersion,22);
 fs.writeFileSync(path.join(root,'examples',name),JSON.stringify(p,null,2));
 examples.push({file:name,description,schema:22,battle:p.session.battle?.map.kind||null});
}
let g=new Game();g.newGame('hybrid-repoN-v19');save('observed-campaign-v22.json',g,'관측 수치 적용 새 캠페인. 실행 규칙과 편성은 자체 설계.');
g.startBattle(2,true);g.issue('rest');
for(const u of g.battle.units.filter(u=>u.team==='blue')){u.fatigue=70;u.hp=Math.max(1,u.maxHp-70);}
save('field-rest-v22.json',g,'피로70/HP최대값에서70감소로 만든 휴식 훈련. 원작 초기 상태가 아님. 불러오면 정지, P로 집결/회복을 관찰.');
g=new Game();g.newGame('hybrid-repoN-v19');
g.activeArmy.region=4;g.world.regions[4].owner='blue';
g.world.enemyArmies[0].region=4;
g.world.enemyArmies[0].roster.push(...g.world.regions[4].garrison);
g.world.regions[4].garrison=[];g.processCampaign(g.world);g.startBattle(4,false);
save('defend-river-v22.json',g,'아군 소유 강변 요새의 실제 방어전 예제. 아군은 성문 안쪽, 적은 다리 바깥쪽. 이 예제는 전투 결과가 해당 캠페인에 반영됨.');
assert.equal(JSON.stringify(DATA.records),records);
fs.writeFileSync(path.join(root,'examples','v22-examples.json'),JSON.stringify({scope:'CUSTOM_SIMULATION_FIXTURES',original_game_save:false,examples},null,2));
console.log(JSON.stringify({generated:examples.length,roundtrips:'passed',observations:'unchanged'},null,2));
