'use strict';
const assert=require('node:assert/strict');
const {Game,Navigation,battlefield,clone}=require('../src/engine.js');
const tests=[];const test=(name,fn)=>{const time=performance.now();if(process.env.TRACE_TESTS)console.error('START',name);try{fn();tests.push({name,status:'PASS',ms:Math.round(performance.now()-time)});}catch(e){tests.push({name,status:'FAIL',message:e.message,stack:e.stack});console.error(name,e.message);}};
const until=(g,n)=>{for(let i=0;i<n&&g.mode==='battle';i++)g.tick();};
const fingerprint=g=>JSON.stringify({world:g.world,nextId:g.nextId});
const battle=()=>{const g=new Game();assert(g.startBattle(1));return g;};
test('새 캠페인 참조·ID·정원 무결성',()=>{const g=new Game();assert.equal(g.validate().units,148);});
test('군단 분할 병력 보존',()=>{const g=new Game(),ids=g.activeArmy.roster.map(u=>u.id).sort();g.split();assert.equal(g.world.armies.length,2);assert.deepEqual(g.world.armies.flatMap(a=>a.roster).map(u=>u.id).sort(),ids);g.validate();});
test('군단별 독립 위치 및 전환',()=>{const g=new Game();g.split();g.switchArmy(1);g.go(3);assert.equal(g.activeArmy.region,3);g.switchArmy(0);assert.equal(g.activeArmy.region,0);});
test('같은 거점 합류·정원 보존',()=>{const g=new Game();g.split();g.merge();assert.equal(g.world.armies.length,1);assert.equal(g.activeArmy.roster.length,26);g.validate();});
test('주력군 ↔ 예비군 편성',()=>{const g=new Game(),id=g.activeArmy.roster[0].id;assert(g.transfer(id,false));assert(g.world.reserve.some(u=>u.id===id));assert(g.transfer(id,true));g.validate();});
test('비인접 지역 출전 차단',()=>{const g=new Game();assert.equal(g.go(5),false);assert.equal(g.mode,'world');});
test('출전 중 재출전·전략 변경 차단',()=>{const g=battle(),id=g.battle.id,turn=g.world.turn;assert(!g.startBattle(2));assert(!g.advanceTurn());assert(!g.switchArmy(0));assert.equal(g.battle.id,id);assert.equal(g.world.turn,turn);});
test('일반 전투 자연 승패와 결과 무결성',()=>{const g=battle();until(g,12000);assert.equal(g.mode,'world');assert(g.report.time>0);g.validate();});
test('공성 AI가 실제 타격으로 성문 파괴',()=>{const g=new Game();g.startBattle(2,true);g.issue('siege',true);let destroyed=false;for(let i=0;i<12000&&g.mode==='battle';i++){g.tick();if(g.battle?.map.gate.destroyed)destroyed=true;}assert(destroyed);assert.equal(g.mode,'world');});
test('연습은 캠페인·ID를 수정하지 않음',()=>{const g=new Game(),before=fingerprint(g);g.startBattle(2,true);until(g,12000);assert.equal(fingerprint(g),before);});
test('독립 부대 명령: 주력 공성 / 지원 방어',()=>{const g=new Game();g.startBattle(2,true);g.issue('siege');g.selectGroup('g1');g.issue('hold');assert.equal(g.battle.groups[0].order,'siege');assert.equal(g.battle.groups[1].order,'hold');});
test('전군 명령은 아군에만 적용',()=>{const g=new Game();g.startBattle(2,true);const enemy=g.battle.groups.find(x=>x.team==='red'),prior=enemy.order;g.issue('regroup',true);assert(g.battle.groups.filter(x=>x.team==='blue').every(x=>x.order==='regroup'));assert.equal(enemy.order,prior);});
test('진형 설정은 선택 부대에만 적용',()=>{const g=new Game();g.startBattle(2,true);g.formation('wedge');assert.equal(g.battle.groups[0].formation,'wedge');assert.equal(g.battle.groups[1].formation,'line');});
test('일시정지 중 전투 시간 불변',()=>{const g=battle();g.paused=true;const b=JSON.stringify({...g.battle,nav:null});until(g,600);assert.equal(JSON.stringify({...g.battle,nav:null}),b);});
test('예비군 지연 도착·중복 투입 차단',()=>{const g=battle();assert(g.reinforce());assert(!g.reinforce());assert.equal(g.battle.groups.find(x=>x.sourceKind==='reserve').spawned,false);until(g,180);assert(g.battle.groups.find(x=>x.sourceKind==='reserve').spawned);assert.equal(new Set(g.battle.units.map(u=>u.id)).size,g.battle.units.length);});
test('지원군 사망·성장·귀속 보존',()=>{const g=new Game();g.split();g.toggleSupport(1);g.startBattle(1);const support=g.battle.groups.find(x=>x.sourceKind==='army'&&x.sourceId===1);g.spawnGroup(support);const u=g.battle.units.find(x=>x.groupId===support.id),id=u.id;g.hurt(u,10000,null);const survivor=g.battle.units.find(x=>x.groupId===support.id&&x.alive);survivor.exp=41;g.debugWin();assert.equal(g.world.armies.find(a=>a.id===1).roster.length,12);assert(!g.world.armies.flatMap(a=>a.roster).some(u=>u.id===id));assert.equal(g.world.armies.find(a=>a.id===1).roster.find(u=>u.id===survivor.id).exp,41);assert(g.world.graveyard.some(u=>u.id===id));g.validate();});
test('미도착 지원군 전투 결과 제외',()=>{const g=new Game();g.split();g.toggleSupport(1);const before=clone(g.world.armies[1]);g.startBattle(1);g.debugWin();assert.deepEqual(g.world.armies[1],before);});
test('전투 결과 중복 적용 방지',()=>{const g=battle();g.debugWin();const before=fingerprint(g);assert(!g.endBattle('victory'));assert.equal(fingerprint(g),before);});
test('방어전 진입 시 소유권 변경 없음',()=>{const g=new Game();g.world.enemyArmies[0].region=0;assert(g.startBattle(0));assert.equal(g.world.regions[0].owner,'blue');});
test('방어전 승리 후 적 군단 제거',()=>{const g=new Game();g.world.enemyArmies[0].region=0;g.startBattle(0);g.debugWin();assert.equal(g.world.regions[0].owner,'blue');assert(!g.world.enemyArmies.some(e=>e.id==='e0'));g.validate();});
test('방어전 철수·함락·생존자 안전거점 복귀',()=>{const g=new Game();g.world.regions[3].owner='blue';g.world.enemyArmies[0].region=0;g.startBattle(0);g.issue('retreat',true);until(g,3000);assert.equal(g.mode,'world');assert.equal(g.world.regions[0].owner,'red');assert.equal(g.activeArmy.region,3);assert(g.activeArmy.roster.length>0);g.validate();});
test('공격 실패 후 적 잔존 병력 보존',()=>{const g=battle();const initial=g.world.regions[1].garrison.length,targets=g.battle.units.filter(u=>u.team==='red').slice(0,2);for(const u of targets)g.hurt(u,10000,null);g.issue('retreat',true);until(g,3000);assert.equal(g.mode,'world');assert.equal(g.world.regions[1].garrison.length,initial-2);assert.equal(g.activeArmy.region,0);g.validate();});
test('성문 닫힘/열림과 A* 경로 동기화',()=>{const map=battlefield('fort'),nav=new Navigation([...map.obstacles,map.gate]),a={x:150,y:300},b={x:800,y:300};assert.equal(nav.path(a,b),null);nav.setBlocks(map.obstacles);assert(nav.path(a,b).length>0);assert(nav.clear(a,b));});
test('직접 이동도 지형 충돌 적용',()=>{const g=new Game();g.startBattle(2,true);const u=g.selected;u.x=560;u.y=300;for(let i=0;i<180;i++)g.move(u,{x:800,y:300},1,true);assert(u.x<575);});
test('부상 유닛 회복·스킬 재사용 대기',()=>{const g=battle(),u=g.selected;u.hp-=30;assert(g.healSpell());assert(u.hp>140);assert(!g.healSpell());assert.equal(g.battle.healCooldown,960);});
test('보병 방패 결속은 소속 부대에 적용',()=>{const g=new Game();g.startBattle(2,true);g.selectUnit(g.battle.units.find(u=>u.team==='blue'&&u.type==='infantry').id);assert(g.skill());assert(g.selectedGroup.shieldUntil>0);assert.equal(g.battle.groups[1].shieldUntil,0);});
test('JSON 저장·복원 완전 왕복',()=>{const g=new Game();g.split();g.switchArmy(1);g.go(3);g.recruit();const p=g.export(),h=new Game();h.import(JSON.parse(JSON.stringify(p)));assert.equal(fingerprint(h),fingerprint(g));});
test('중복 ID 가져오기 거절·현재 상태 보호',()=>{const g=new Game(),before=fingerprint(g),p=g.export();p.world.reserve[0].id=p.world.armies[0].roster[0].id;assert.throws(()=>g.import(p));assert.equal(fingerprint(g),before);});
test('비정상 HP·정원·활성 군단 검증',()=>{for(const alter of [p=>p.world.armies[0].roster[0].hp=NaN,p=>p.world.activeArmyId=500,p=>p.nextId=1,p=>p.world.enemyArmies[0].region=99]){const g=new Game(),p=g.export();alter(p);assert.throws(()=>g.import(p));g.validate();}});
test('v13 저장 마이그레이션·활성 군단 복구',()=>{const g=new Game();g.split();g.switchArmy(1);g.go(3);const w=clone(g.world),p={schemaVersion:13,game:'FirstQueen4_Web',uid:g.nextId,world:{regions:w.regions,armies:w.armies,reserve:w.reserve,roster:w.armies[0].roster,current:0,armyActiveId:1,strategicTurn:7,wins:2,enemyArmies:[{id:'old0',name:'구 원정대',region:5,strength:5}]}};const h=new Game();h.import(p);assert.equal(h.activeArmy.id,1);assert.equal(h.activeArmy.region,3);assert.equal(h.world.turn,7);assert.equal(h.world.enemyArmies[0].roster.length,5);h.validate();});
test('적 군단 실이동 및 무주둔 거점 점령',()=>{const g=new Game();g.world.enemyArmies[0].region=1;g.world.armies[0].region=3;g.advanceTurn();g.advanceTurn();assert.equal(g.world.regions[0].owner,'red');g.validate();});
test('동일 입력·초기 상태의 전투 재현',()=>{const a=battle(),b=battle();until(a,12000);until(b,12000);assert.deepEqual(a.report,b.report);assert.equal(fingerprint(a),fingerprint(b));});
test('전투 중 저장 허용',()=>{const g=battle();assert.equal(g.export().session.mode,'battle');});
test('새 게임은 이전 전투 상태 완전 초기화',()=>{const g=battle();g.paused=true;g.direct=true;g.newGame();assert.equal(g.battle,null);assert.equal(g.mode,'world');assert.equal(g.paused,false);assert.equal(g.direct,false);assert.equal(g.activeArmy.roster.length,26);g.validate();});
// v15 regression tests: snapshot state, transactional restore, custom campaign, new terrain.
const runtime=g=>JSON.stringify({world:g.world,nextId:g.nextId,battle:g.snapshotBattle(),selected:g.selectedUnitId,group:g.selectedGroupId,direct:g.direct});
const roundtrip=g=>{const h=new Game();h.import(JSON.parse(JSON.stringify(g.export())));return h;};
const training=(id=2)=>{const g=new Game();g.startBattle(id,true);return g;};
test('v15 전투 복원은 일시정지로 시작',()=>{const g=training();until(g,90);const h=roundtrip(g);assert.equal(h.mode,'battle');assert(h.paused);const tick=h.battle.tick;h.tick();assert.equal(h.battle.tick,tick);assert.equal(runtime(g),runtime(h));});
test('복원 후 900틱 동일 입력 · 난수와 전체 전투 상태 일치',()=>{const g=training();g.issue('siege',true);until(g,301);const h=roundtrip(g);h.paused=false;for(let i=0;i<900&&g.mode==='battle';i++){g.tick();h.tick();if(i%60===0)assert.equal(runtime(g),runtime(h));}assert.equal(runtime(g),runtime(h));});
test('공격 준비·투사체 비행 중 저장과 재개 일치',()=>{const g=training(1),u=g.battle.units.find(x=>x.type==='archer'&&x.team==='blue'),v=g.battle.units.find(x=>x.team==='red');u.x=300;u.y=300;v.x=410;v.y=300;u.cool=0;g.beginAttack(u,v);g.shoot(u,v,12);assert(u.action&&!u.action.done);const h=roundtrip(g);assert.equal(h.battle.projectiles.length,1);h.paused=false;for(let i=0;i<90;i++){g.tick();h.tick();}assert.equal(runtime(g),runtime(h));});
test('미도착 지원군의 도착 틱·부대 명령 유지',()=>{const g=training();g.selectGroup('g1');g.issue('hold');until(g,120);const h=roundtrip(g);h.paused=false;until(h,59);assert(!h.battle.groups[1].spawned);h.tick();assert(h.battle.groups[1].spawned);assert.equal(h.battle.groups[1].order,'hold');assert.equal(h.battle.groups[1].unitIds.length,12);});
test('성문 파괴·내비게이션 버전·경로 복원',()=>{const g=training();g.gateDamage(g.battle.map.gate.maxHp);const h=roundtrip(g);assert(h.battle.map.gate.destroyed);assert.equal(h.battle.nav.version,g.battle.nav.version);assert(!h.battle.nav.blocks.some(x=>x.id==='gate'));});
test('중간 피해·병사 스킬·부대 방패·회복 대기 보존',()=>{const g=training();const u=g.battle.units.find(x=>x.team==='blue'&&x.type==='infantry');g.selectUnit(u.id);g.skill();u.hp-=20;g.healSpell();until(g,12);const h=roundtrip(g);assert.equal(h.selected.skillCooldown,g.selected.skillCooldown);assert.equal(h.battle.healCooldown,g.battle.healCooldown);assert.equal(h.battle.groups[0].shieldUntil,g.battle.groups[0].shieldUntil);});
test('철수한 생존 병사와 손실을 체크포인트에 보존',()=>{const g=training();const u=g.battle.units[0];u.x=16;g.issue('retreat');g.tick();assert(u.evacuated);const h=roundtrip(g);assert(h.battle.units.find(x=>x.id===u.id).evacuated);assert.equal(runtime(g),runtime(h));});
test('전투 중 불러오기 · 현재 전투 전체 교체',()=>{const g=training(1);until(g,100);const saved=g.export();until(g,100);g.import(saved);assert.equal(g.battle.tick,100);assert(g.paused);});
test('수비대 없는 거점 직전 상태 저장 가능',()=>{const g=new Game();g.world.regions[1].garrison=[];g.startBattle(1);const h=roundtrip(g);h.paused=false;h.tick();assert.equal(h.report.outcome,'victory');});
for(const [name,alter] of [
 ['중복 전투 병사',p=>p.session.battle.units.push(clone(p.session.battle.units[0]))],
 ['잘못된 공격 타깃',p=>p.session.battle.units[0].action={kind:'attack',targetId:999999,start:0,hit:12,end:30,done:false}],
 ['성문 위치 변조',p=>p.session.battle.map.gate.x=9999],
 ['이미 적용된 전투',p=>p.session.battle.resultApplied=true],
 ['없는 소속 부대',p=>p.session.battle.groups[0].sourceId=999],
 ['미도착 부대에 런타임 유닛',p=>p.session.battle.groups[0].spawned=false],
 ['없는 선택 캐릭터',p=>p.session.selectedUnitId=99999],
 ['잘못된 내비게이션 버전',p=>p.session.battle.navVersion=-1],
 ['잘못된 전투 시간',p=>p.session.battle.time=999],
 ['비정상 투사체 수치',p=>p.session.battle.projectiles.push({attackerId:1,team:'blue',x:NaN})],
 ['잘못된 RNG',p=>p.session.battle.seed='random'],
 ['전투 일련번호 불일치',p=>p.session.battle.id='b999999'],
 ['손실 병사 명부 누락',p=>p.session.battle.units.pop()]
])test('잘못된 스냅샷 거부·현재 전투 보호: '+name,()=>{const g=training();until(g,90);const prior=runtime(g),p=g.export();alter(p);assert.throws(()=>g.import(p));assert.equal(runtime(g),prior);});
test('원래 군단·예비군·지원군 귀속 복원 뒤 한 번만 결과 반영',()=>{const g=new Game();g.split();g.toggleSupport(1);g.startBattle(1);g.reinforce();until(g,280);const h=roundtrip(g);h.debugWin();const w=JSON.stringify(h.world);assert.equal(h.endBattle('victory'),false);assert.equal(JSON.stringify(h.world),w);h.validate();assert.equal(h.world.armies.length,2);assert.equal(h.world.committedBattles.length,1);});
test('연습 전투 복원 후에도 캠페인 보상·손실 없음',()=>{const g=training(4);const before=fingerprint(g);until(g,300);const h=roundtrip(g);h.debugWin();assert.equal(fingerprint(h),before);assert.deepEqual(h.world.campaign.pending,[]);});
test('v14 저장 마이그레이션 · 기존 점령 보상 소급 없음',()=>{const g=new Game();g.go(3);let p=g.export();p.schemaVersion=14;delete p.session;delete p.world.campaign;const h=new Game();h.import(p);assert.deepEqual(h.world.campaign.pending,[]);assert(h.world.campaign.seen.includes(3));assert.equal(h.world.reserve.length,g.world.reserve.length);});
test('새 거점 보상 대기 · 숲 구호단 2명 Lv.2',()=>{const g=new Game();g.go(3);assert.deepEqual(g.world.campaign.pending,[3]);const n=g.world.reserve.length,id=g.nextId;assert(g.chooseReward(3,'healers'));assert.equal(g.world.reserve.length,n+2);assert(g.world.reserve.slice(-2).every(u=>u.type==='healer'&&u.level===2));assert.equal(g.nextId,id+2);g.validate();});
test('동일 보상 중복 지급·다른 선택지 재수령 차단',()=>{const g=new Game();g.go(3);g.chooseReward(3,'supplies');const before=fingerprint(g);assert(!g.chooseReward(3,'supplies'));assert(!g.chooseReward(3,'healers'));assert.equal(fingerprint(g),before);});
test('재점령 시 보상 재생성 없음',()=>{const g=new Game();g.go(3);g.chooseReward(3,'supplies');g.world.regions[3].owner='red';g.activeArmy.region=0;g.startBattle(3);g.debugWin();assert(!g.world.campaign.pending.includes(3));assert.equal(g.world.campaign.choices[3],'supplies');});
test('예비군 정원 부족 시 보상·ID·상태 변경 없음',()=>{const g=new Game();g.go(3);g.world.reserve.push(...g.makeRoster(108));const before=fingerprint(g);assert(!g.chooseReward(3,'healers'));assert.equal(fingerprint(g),before);assert(g.world.campaign.pending.includes(3));});
test('꽉 찬 예비군으로 편성 이동 차단',()=>{const g=new Game();g.world.reserve.push(...g.makeRoster(108));const before=fingerprint(g);assert(!g.transfer(g.activeArmy.roster[0].id,false));assert.equal(fingerprint(g),before);});
test('전투 중 캠페인 보상 변경 차단',()=>{const g=new Game();g.go(3);g.startBattle(4);assert(!g.chooseReward(3,'supplies'));});
test('강변 교역 보너스는 소유한 동안에만 적용',()=>{const g=new Game();g.world.enemyArmies=[];g.world.regions[4].owner='blue';g.processCampaign(g.world);g.chooseReward(4,'trade');let gold=g.world.gold;g.advanceTurn();assert.equal(g.world.gold-gold,36);g.world.regions[4].owner='red';gold=g.world.gold;g.advanceTurn();assert.equal(g.world.gold-gold,12);});
test('미결 보상·선택 기록 저장 왕복',()=>{const g=new Game();g.go(3);let h=roundtrip(g);assert.deepEqual(h.world.campaign.pending,[3]);h.chooseReward(3,'healers');const j=roundtrip(h);assert.equal(j.world.campaign.choices[3],'healers');});
test('캠페인 완료: 여섯 거점 + 적군 전멸 필요',()=>{const g=new Game();for(const r of g.world.regions)r.owner='blue';g.processCampaign(g.world);assert.equal(g.world.campaign.status,'active');g.world.enemyArmies=[];g.processCampaign(g.world);assert.equal(g.world.campaign.status,'won');g.validate();});
test('이미 받은 미결 보상 저장은 거절',()=>{const g=new Game();g.go(3);const p=g.export();p.world.campaign.choices['3']='healers';assert.throws(()=>g.import(p));assert(g.world.campaign.pending.includes(3));});
test('다섯 전장 모두 경로 존재 및 연습·복원 무결성',()=>{for(const id of [1,2,3,4,5]){const g=training(id),b=g.battle;if(b.map.gate)g.gateDamage(b.map.gate.hp);assert(b.nav.path({x:160,y:300},{x:820,y:300}),String(id));until(g,60);roundtrip(g).validate();}});
test('강변 두 다리 경로 · 강물 통과 금지',()=>{const g=training(4),b=g.battle;g.gateDamage(b.map.gate.hp);assert(!b.nav.clear({x:350,y:300},{x:550,y:300}));assert(b.nav.clear({x:350,y:210},{x:550,y:210}));assert(b.nav.clear({x:350,y:390},{x:550,y:390}));const path=b.nav.path({x:300,y:300},{x:560,y:300});assert(path.some(p=>p.y>=180&&p.y<=240||p.y>=360&&p.y<=420));for(const p of path)assert(!b.map.obstacles.some(r=>r.kind==='water'&&Math.abs(p.x-r.x)<r.w/2&&Math.abs(p.y-r.y)<r.h/2));});
test('강물 위 사선 허용·숲 나무는 차단',()=>{const g=training(4);assert(g.battle.nav.clear({x:350,y:300},{x:560,y:300},0));const f=training(3);assert(!f.battle.nav.clear({x:300,y:240},{x:400,y:240},0));});
test('수도 강화 성문 내구도 920',()=>{const g=training(5);assert.equal(g.battle.map.gate.maxHp,920);});

const result={suite:'engine',passed:tests.filter(x=>x.status==='PASS').length,failed:tests.filter(x=>x.status==='FAIL').length,tests};
console.log(JSON.stringify(result,null,2));if(process.argv.includes('--report'))require('node:fs').writeFileSync(require('node:path').join(__dirname,'engine-results.json'),JSON.stringify(result,null,2));if(result.failed)process.exitCode=1;
