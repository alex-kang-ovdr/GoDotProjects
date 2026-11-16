'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const context=vm.createContext({console});
for(const file of ['operations.js','sim.js','training.js']){
  const p=path.resolve(__dirname,'../dist',file);vm.runInContext(fs.readFileSync(p,'utf8'),context,{filename:p});
}
const N=context.IronTide,T=N.Training,DT=1/60;
let passed=0,failed=0;
const plain=x=>JSON.parse(JSON.stringify(x));
function test(name,fn){try{fn();passed++;console.log('PASS '+name);}catch(error){failed++;console.error('FAIL '+name+'\n  '+error.stack);}}
function target(session){return session.game.ships.find(s=>s.id===session.targetId);}
function run(session,seconds,controls){
  for(let i=0;i<Math.ceil(seconds/DT)&&!session.stageComplete&&!session.failed;i++){
    const input=typeof controls==='function'?controls(session,i):controls||{};
    T.tick(session,DT,{throttle:0,turn:0,fire:false,ammo:'HE',...input});
  }
  return session;
}
function shoot(session,ammo,seconds=12){
  return run(session,seconds,s=>{const t=target(s);return {aimX:t.x,aimY:t.y,ammo,fire:true,spread:'narrow'};});
}
function finishLesson(session){
  if(session.step===0)return run(session,20,{throttle:4});
  if(session.step>=1&&session.step<=3)return shoot(session,['','HE','AP','TORP'][session.step]);
  let braking=false;
  return run(session,45,s=>{
    if(s.game.player.y-s.checkpoint.y<95)braking=true;
    return {throttle:braking?0:2};
  });
}

test('five lessons create fresh cruiser scenes with ordinary HP and no pre-awarded progress',()=>{
  for(let step=0;step<5;step++){
    const s=T.create({step,seed:711});
    assert.equal(s.step,step);assert.equal(s.game.trainingMode,true);assert.equal(s.game.player.classId,'cruiser');
    assert.equal(s.game.player.maxHp,N.CLASSES.cruiser.maxHp);assert.equal(s.game.player.hp,s.game.player.maxHp);
    assert.equal(s.stageComplete,false);assert.equal(s.failed,false);assert.equal(s.complete,false);assert.equal(T.brief(s).progress,0);
    assert.equal(T.brief(s).index,step+1);assert.ok(T.brief(s).instruction.length>10);
    const t=target(s);if(t){assert.equal(t.hp,N.CLASSES[t.classId].maxHp);assert.equal(t.armor,N.CLASSES[t.classId].armor);assert.equal(t.aiDisabled,true);assert.equal(t.secondaryRange,0);}
  }
});
test('navigation requires actual arrival, not starting the lesson or turning in place',()=>{
  const s=T.create();run(s,2,{throttle:0,turn:1});assert.equal(s.stageComplete,false);assert.equal(s.movedDistance,0);
  const fresh=T.create();finishLesson(fresh);assert.equal(fresh.stageComplete,true);assert.ok(fresh.movedDistance>200);
  assert.ok(Math.hypot(fresh.game.player.x-fresh.checkpoint.x,fresh.game.player.y-fresh.checkpoint.y)<=fresh.checkpoint.radius);
});
test('HE lesson completes through real shell flight and damaging main-battery impact',()=>{
  const s=T.create({step:1}),hp=target(s).hp;
  const t=target(s);T.tick(s,DT,{throttle:0,turn:0,fire:true,ammo:'HE',aimX:t.x,aimY:t.y});
  assert.equal(s.stageComplete,false);assert.equal(target(s).hp,hp);assert.ok(s.game.projectiles.length>0);
  shoot(s,'HE');assert.equal(s.stageComplete,true);assert.ok(target(s).hp<hp);
  assert.equal(s.hitEvidence.ammo,'HE');assert.equal(s.hitEvidence.ownerId,s.game.playerId);assert.ok(s.hitEvidence.damage>0);
});
test('AP lesson completes through an actual damaging AP result',()=>{
  const s=T.create({step:2}),hp=target(s).hp;shoot(s,'AP');
  assert.equal(s.stageComplete,true);assert.ok(target(s).hp<hp);assert.equal(s.hitEvidence.ammo,'AP');
  assert.ok(['penetration','citadel','overpen'].includes(s.hitEvidence.result));
});
test('torpedo target begins inside the real cruiser side arc and passes only on torpedo damage',()=>{
  const s=T.create({step:3}),t=target(s);
  const solution=N.getWeaponSolution(s.game,s.game.player,'TORP',t.x,t.y,'narrow');
  assert.equal(solution.arcValid,true);assert.equal(solution.ready,true);
  shoot(s,'TORP');assert.equal(s.stageComplete,true);assert.equal(s.hitEvidence.ammo,'TORP');assert.equal(s.hitEvidence.result,'torpedo');assert.ok(s.game.stats.torpHits>=1);
});
test('capture lesson requires actual movement into the zone and completed capture time',()=>{
  const s=T.create({step:4});run(s,15,{throttle:0});
  assert.equal(s.stageComplete,false);assert.equal(s.game.zones[0].owner,null);assert.equal(s.game.stats.caps,0);
  finishLesson(s);assert.equal(s.stageComplete,true);assert.equal(s.game.zones[0].owner,0);assert.equal(s.game.stats.caps,1);assert.ok(s.game.time>13);
});
test('all five lessons can be completed in order through normal inputs',()=>{
  let s=T.create({seed:716});const durations=[];
  for(let step=0;step<5;step++){
    assert.equal(s.step,step);finishLesson(s);assert.equal(s.stageComplete,true,`lesson${step+1} not complete`);assert.equal(s.failed,false);
    durations.push(Number(s.game.time.toFixed(2)));s=T.advance(s);
  }
  assert.equal(s.complete,true);assert.equal(s.step,4);assert.deepEqual(plain(T.progress(s)),{version:1,step:4,completed:true});
  console.log('  Actual-play lesson seconds:',durations.join(', '));
});
test('selecting or firing the wrong ammunition does not pass a gun lesson',()=>{
  const he=T.create({step:1});run(he,3,s=>{const t=target(s);return {fire:true,ammo:'AP',aimX:t.x,aimY:t.y};});
  assert.ok(he.game.stats.damage>0);assert.equal(he.stageComplete,false);assert.equal(he.failed,false);
  const ap=T.create({step:2});run(ap,3,s=>{const t=target(s);return {fire:true,ammo:'HE',aimX:t.x,aimY:t.y};});
  assert.ok(ap.game.stats.damage>0);assert.equal(ap.stageComplete,false);assert.equal(ap.failed,false);
});
test('hit metadata, not the ammo selected at impact time, determines lesson completion',()=>{
  const s=T.create({step:1}),t=target(s);
  T.tick(s,DT,{throttle:0,fire:true,ammo:'HE',aimX:t.x,aimY:t.y});
  run(s,3,{throttle:0,fire:false,ammo:'AP',aimX:t.x,aimY:t.y});
  assert.equal(s.stageComplete,true);assert.equal(s.hitEvidence.ammo,'HE');
  const wrong=T.create({step:1}),w=target(wrong);
  T.tick(wrong,DT,{throttle:0,fire:true,ammo:'AP',aimX:w.x,aimY:w.y});
  run(wrong,3,{throttle:0,fire:false,ammo:'HE',aimX:w.x,aimY:w.y});
  assert.equal(wrong.stageComplete,false);assert.ok(wrong.game.stats.damage>0);
});
test('automatic secondaries cannot pass the torpedo lesson',()=>{
  const s=T.create({step:3});run(s,6,{throttle:0,fire:false,ammo:'TORP'});
  assert.ok(s.game.stats.secondaryDamage>0,'real automatic secondary fire should hit nearby stationary target');
  assert.equal(s.stageComplete,false);assert.equal(s.game.stats.torpHits,0);assert.equal(s.failed,false);
});
test('wrong-weapon target destruction fails cleanly and retry restores a fresh real scene',()=>{
  const s=T.create({step:1,seed:721});shoot(s,'AP',180);
  assert.equal(s.failed,true);assert.equal(s.stageComplete,false);assert.equal(target(s).hp,0);assert.ok(T.brief(s).instruction.includes('다시'));
  const retry=T.restart(s);assert.notEqual(retry,s);assert.equal(retry.step,1);assert.equal(retry.failed,false);assert.equal(retry.game.stats.damage,0);assert.equal(target(retry).hp,N.CLASSES.cruiser.maxHp);
  shoot(retry,'HE');assert.equal(retry.stageComplete,true);
});
test('passing or failing freezes simulation until explicit next or retry',()=>{
  const passedSession=finishLesson(T.create({step:1}));
  const before=JSON.stringify(passedSession.game);
  for(let i=0;i<120;i++)T.tick(passedSession,DT,{throttle:4,fire:true,ammo:'HE'});
  assert.equal(JSON.stringify(passedSession.game),before);
  const failure=shoot(T.create({step:1,seed:725}),'AP',180);assert.equal(failure.failed,true);
  const failedTime=failure.game.time;T.tick(failure,1,{throttle:4});assert.equal(failure.game.time,failedTime);
});
test('advance cannot skip unfinished or failed lessons and next lesson has fresh counters',()=>{
  const s=T.create({step:1});assert.equal(T.advance(s),s);
  shoot(s,'HE');const next=T.advance(s);assert.equal(next.step,2);assert.notEqual(next.game,s.game);assert.equal(next.game.stats.damage,0);assert.equal(next.game.stats.hits,0);assert.equal(next.stageComplete,false);
  const failure=shoot(T.create({step:1,seed:727}),'AP',180);assert.equal(failure.failed,true);assert.equal(T.advance(failure),failure);
});
test('progress persists only completed lessons and reopens the unfinished lesson fresh',()=>{
  const s=T.create({step:2});assert.deepEqual(plain(T.progress(s)),{version:1,step:2,completed:false});
  shoot(s,'AP');const progress=T.progress(s);assert.deepEqual(plain(progress),{version:1,step:3,completed:false});
  const resumed=T.create(T.normalizeProgress(plain(progress)));assert.equal(resumed.step,3);assert.equal(resumed.stageComplete,false);assert.equal(resumed.game.stats.damage,0);
  const final=finishLesson(T.create({step:4}));assert.equal(final.complete,false);assert.deepEqual(plain(T.progress(final)),{version:1,step:4,completed:true});
});
test('malformed training progress and invalid scene options remain bounded',()=>{
  for(const value of [null,[],{}, {version:9,step:3},{version:1,step:Infinity},{version:1,step:-1},{version:1,step:'3'}]){
    const p=T.normalizeProgress(value);assert.equal(p.version,1);assert.ok(Number.isInteger(p.step)&&p.step>=0&&p.step<5);assert.equal(p.completed,false);
  }
  assert.deepEqual(plain(T.normalizeProgress({version:1,step:0,completed:true})),{version:1,step:4,completed:true});
  assert.equal(T.create({step:NaN,seed:NaN}).step,0);assert.equal(T.create({step:99}).step,0);
});
test('replaying a passed lesson preserves the next unfinished saved lesson',()=>{
  const passedLesson=finishLesson(T.create({step:2})),saved=T.progress(passedLesson);
  assert.equal(saved.step,3);
  const retry=T.restart(passedLesson);run(retry,1,{throttle:0});
  const merged=T.mergeProgress(saved,T.progress(retry));
  assert.deepEqual(plain(merged),{version:1,step:3,completed:false});
  assert.equal(retry.step,2);assert.equal(retry.stageComplete,false);
  assert.deepEqual(plain(saved),{version:1,step:3,completed:false});
});
test('graduation survives restarting the course or retrying its final lesson',()=>{
  const final=finishLesson(T.create({step:4})),graduated=T.progress(final);
  const replay=T.create(),retry=T.restart(final);
  for(const session of [replay,retry])assert.deepEqual(plain(T.mergeProgress(graduated,T.progress(session))),{version:1,step:4,completed:true});
  assert.equal(replay.step,0);assert.equal(replay.stageComplete,false);assert.equal(retry.stageComplete,false);
});
test('merged progress safely normalizes both inputs and never lowers valid achievement',()=>{
  const saved={version:1,step:3,completed:false};
  for(const value of [null,[],{}, {version:9,step:4,completed:true},{version:1,step:Infinity},{version:1,step:-1},{version:1,step:'4'}]){
    assert.deepEqual(plain(T.mergeProgress(value,null)),{version:1,step:0,completed:false});
    assert.deepEqual(plain(T.mergeProgress(saved,value)),saved);
    assert.deepEqual(plain(T.mergeProgress(value,saved)),saved);
  }
  assert.deepEqual(plain(T.mergeProgress(saved,{version:1,step:4,completed:false})),{version:1,step:4,completed:false});
});
test('training cannot create a regular snapshot or earn career XP, wins or campaign progress',()=>{
  const s=finishLesson(T.create({step:4}));assert.equal(N.serializeGame(s.game),null);
  const career=N.Career.startCampaign(N.Career.empty(),{runId:'outside-campaign',difficulty:'normal'});
  const summary=N.Career.summarize(s.game,{sessionType:'campaign',campaignRunId:'outside-campaign',campaignStage:0});
  assert.equal(summary.sessionType,'training');assert.equal(summary.xp,0);
  assert.deepEqual(plain(N.Career.record(career,summary,'training-identity')),plain(career));
});
test('running a complete training course leaves an existing regular battle untouched',()=>{
  const battle=N.createGame({seed:22,shipClass:'battleship',loadoutId:'survival',operationId:'bastion'});
  for(let i=0;i<120;i++)N.tickGame(battle,DT,{throttle:2,turn:0});
  const before=JSON.stringify(N.serializeGame(battle));
  let s=T.create();for(let i=0;i<5;i++){finishLesson(s);assert.equal(s.stageComplete,true);s=T.advance(s);}
  assert.equal(JSON.stringify(N.serializeGame(battle)),before);
});
test('brief exposes only copied checkpoint data and real lesson progress',()=>{
  const s=T.create();const b=T.brief(s);b.checkpoint.x=0;assert.notEqual(s.checkpoint.x,0);
  run(s,2,{throttle:4});const partial=T.brief(s);assert.ok(partial.progress>0&&partial.progress<1);assert.equal(partial.complete,false);
});

console.log(`\n${passed}/${passed+failed} checks passed.`);
if(failed)process.exitCode=1;
