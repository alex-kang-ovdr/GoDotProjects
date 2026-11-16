'use strict';
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const context=vm.createContext({console});
const filename=path.resolve(__dirname,'../dist/operations.js');
vm.runInContext(fs.readFileSync(filename,'utf8'),context,{filename});
const {OPERATIONS:OPS,LOADOUTS:LOADS,Career:C}=context.IronTide;
let passed=0,failed=0;
const plain=value=>JSON.parse(JSON.stringify(value));
function test(name,fn){try{fn();passed++;console.log('PASS '+name);}catch(error){failed++;console.error('FAIL '+name+'\n  '+error.stack);}}
function fakeGame(overrides={}){
  return {
    operationId:'northern',difficulty:'normal',phase:'won',time:140,
    player:{classId:'cruiser',hp:12800,maxHp:32000},score:[800,350],
    stats:{damage:20000,kills:1,hits:12,shots:16,caps:1,citadels:1,torpHits:2},
    damageBreakdown:{HE:8000,AP:7000,TORP:3000,FIRE:1000,FLOOD:500,SECONDARY:500},
    ...overrides
  };
}
function solid(point,island,pad=0){
  const angle=island.rotation||0,dx=point.x-island.x,dy=point.y-island.y;
  const x=dx*Math.cos(angle)+dy*Math.sin(angle),y=-dx*Math.sin(angle)+dy*Math.cos(angle);
  return (x/(island.rx+pad))**2+(y/(island.ry+pad))**2<1;
}
function walkable(op,p){return p.x>=80&&p.y>=80&&p.x<=op.world.w-80&&p.y<=op.world.h-80&&!op.islands.some(i=>solid(p,i,80));}
function reachable(op,start,goal){
  const step=80,nx=Math.floor((op.world.w-160)/step)+1,ny=Math.floor((op.world.h-160)/step)+1;
  const coord=index=>({x:80+(index%nx)*step,y:80+Math.floor(index/nx)*step});
  const cells=[];
  for(let i=0;i<nx*ny;i++)if(walkable(op,coord(i)))cells.push(i);
  const nearest=p=>cells.reduce((best,i)=>Math.hypot(coord(i).x-p.x,coord(i).y-p.y)<Math.hypot(coord(best).x-p.x,coord(best).y-p.y)?i:best,cells[0]);
  const origin=nearest(start),dest=nearest(goal),allowed=new Set(cells),seen=new Set([origin]),queue=[origin];
  for(let head=0;head<queue.length;head++){
    const index=queue[head];if(index===dest)return true;
    const x=index%nx,y=Math.floor(index/nx);
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const xx=x+dx,yy=y+dy,next=yy*nx+xx;
      if(xx<0||xx>=nx||yy<0||yy>=ny||seen.has(next)||!allowed.has(next))continue;
      const a=coord(index),b=coord(next);let blocked=false;
      for(const t of [.25,.5,.75])if(!walkable(op,{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t})){blocked=true;break;}
      if(!blocked){seen.add(next);queue.push(next);}
    }
  }
  return false;
}

test('three operations implement distinct objective structures',()=>{
  assert.deepEqual(Object.keys(OPS),['northern','bastion','openwater']);
  assert.equal(OPS.northern.mode,'domination');assert.equal(OPS.northern.zones.length,3);
  assert.equal(OPS.bastion.mode,'control');assert.equal(OPS.bastion.zones.length,1);
  assert.equal(OPS.bastion.targetScore,640);assert.equal(OPS.bastion.duration,420);assert.equal(OPS.bastion.initialScore,180);
  assert.equal(OPS.openwater.mode,'elimination');assert.equal(OPS.openwater.zones.length,0);assert.equal(OPS.openwater.duration,300);assert.equal(OPS.openwater.initialScore,0);
  assert.equal(new Set(Object.values(OPS).map(o=>JSON.stringify(o.islands))).size,3);
});
test('original northern map, team spawns and objectives are preserved',()=>{
  assert.equal(OPS.northern.islands.length,9);
  assert.deepEqual(plain(OPS.northern.spawns.blue),[{x:2100,y:2510},{x:920,y:2450},{x:3270,y:2490}]);
  assert.deepEqual(plain(OPS.northern.spawns.red),[{x:850,y:650},{x:2190,y:710},{x:3270,y:650}]);
  assert.deepEqual(plain(OPS.northern.zones.map(z=>z.id)),['A','B','C']);
});
test('all operation coordinates and metadata are finite and bounded',()=>{
  for(const op of Object.values(OPS)){
    assert.equal(op.id, Object.keys(OPS).find(k=>OPS[k]===op));
    assert.ok(op.name.length>0&&op.description.length>20&&op.subtitle.length>0);
    for(const island of op.islands){
      for(const k of ['x','y','rx','ry','rotation','seed'])assert.ok(Number.isFinite(island[k]));
      assert.ok(island.x>0&&island.x<op.world.w&&island.y>0&&island.y<op.world.h);
      assert.ok(island.rx>0&&island.ry>0);
    }
    for(const z of op.zones){assert.ok(Number.isFinite(z.x)&&Number.isFinite(z.y)&&z.radius>0);assert.equal(z.progress,0);assert.equal(z.owner,null);assert.equal(z.contested,false);}
  }
});
test('all six spawns are clear of islands with battleship-sized clearance',()=>{
  for(const op of Object.values(OPS)){
    assert.equal(op.spawns.blue.length,3);assert.equal(op.spawns.red.length,3);
    const all=[...op.spawns.blue,...op.spawns.red];
    for(const spawn of all){assert.ok(walkable(op,spawn),`${op.id} spawn obstructed ${JSON.stringify(spawn)}`);}
    for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++)assert.ok(Math.hypot(all[i].x-all[j].x,all[i].y-all[j].y)>180);
  }
});
test('all spawns can navigate to every objective without crossing land',()=>{
  for(const op of Object.values(OPS)){
    const goals=op.zones.length?op.zones:[{x:op.world.w/2,y:op.world.h/2}];
    for(const goal of goals){assert.ok(walkable(op,goal));for(const spawn of [...op.spawns.blue,...op.spawns.red])assert.ok(reachable(op,spawn,goal),`${op.id} has unreachable objective`);}
  }
});
test('operation data is deeply immutable and isolated from round copies',()=>{
  assert.ok(Object.isFrozen(OPS)&&Object.isFrozen(OPS.northern)&&Object.isFrozen(OPS.northern.zones[0]));
  assert.throws(()=>{OPS.northern.zones[0].owner=0;},TypeError);
  const a=plain(OPS.northern),b=plain(OPS.northern);a.zones[0].owner=1;a.spawns.blue[0].x=0;
  assert.equal(b.zones[0].owner,null);assert.equal(OPS.northern.spawns.blue[0].x,2100);
});
test('four loadouts expose explicit benefits and costs without changing base data',()=>{
  assert.deepEqual(Object.keys(LOADS),['balanced','artillery','survival','maneuver']);
  assert.deepEqual(plain(LOADS.balanced.modifiers),{reload:1,maxHp:1,maxSpeed:1,turnRate:1});
  assert.equal(LOADS.artillery.modifiers.reload,.88);assert.equal(LOADS.artillery.modifiers.maxSpeed,.94);
  assert.equal(LOADS.survival.modifiers.maxHp,1.10);assert.equal(LOADS.survival.modifiers.reload,1.08);
  assert.equal(LOADS.maneuver.modifiers.maxSpeed,1.10);assert.equal(LOADS.maneuver.modifiers.turnRate,1.15);assert.equal(LOADS.maneuver.modifiers.maxHp,.92);
  for(const l of Object.values(LOADS)){assert.ok(Object.isFrozen(l.modifiers));for(const v of Object.values(l.modifiers))assert.ok(Number.isFinite(v)&&v>0&&v<2);}
});

test('new career begins empty and independent of other new careers',()=>{
  const a=C.empty(),b=C.empty();
  assert.equal(a.version,3);assert.equal(a.xp,0);assert.equal(a.battles,0);assert.equal(a.wins,0);
  a.history.push({id:'mutation'});a.operations.northern={wins:5};
  assert.equal(b.history.length,0);assert.equal(Object.keys(b.operations).length,0);
});
test('rank thresholds and maximum-rank progress are exact',()=>{
  const first=C.rank(0);assert.equal(first.name,'소위');assert.equal(first.level,1);assert.equal(first.current,0);assert.equal(first.next,350);assert.equal(first.progress,0);
  assert.equal(C.rank(349).level,1);assert.equal(C.rank(350).level,2);assert.equal(C.rank(350).current,0);assert.equal(C.rank(350).next,550);
  assert.equal(C.rank(900).level,3);assert.equal(C.rank(1800).level,4);assert.equal(C.rank(3200).level,5);
  const last=C.rank(5200);assert.equal(last.name,'대령');assert.equal(last.level,6);assert.equal(last.next,0);assert.equal(last.progress,1);
});
test('rank and normalize reject nonfinite and wrong-type numeric inputs',()=>{
  for(const x of [NaN,Infinity,-Infinity,'2000',null,undefined]){assert.equal(C.rank(x).level,1);}
  const c=C.normalize({xp:Infinity,battles:-2,wins:20,bestDamage:NaN,history:'bad',operations:[]});
  assert.equal(c.xp,0);assert.equal(c.battles,0);assert.equal(c.wins,0);assert.equal(c.bestDamage,0);assert.equal(c.history.length,0);
  assert.equal(C.normalize(null).version,3);assert.equal(C.normalize([]).version,3);
});
test('summary derives accuracy, rewards, stars and authentic achievements',()=>{
  const s=C.summarize(fakeGame());
  assert.equal(s.won,true);assert.equal(s.phase,'won');assert.equal(s.accuracy,.75);
  assert.equal(s.xp,355);assert.equal(s.stars,3);assert.equal(s.hpRatio,.4);
  const ids=s.achievements.map(a=>a.id);
  assert.ok(ids.includes('citadel')&&ids.includes('torpedo_expert')&&ids.includes('marksman'));
  assert.ok(!ids.includes('objective')&&!ids.includes('survivor'));
  assert.equal(Object.values(s.damageBreakdown).reduce((a,b)=>a+b,0),20000);
});
test('a defeat cannot grant three stars even after high damage',()=>{
  const s=C.summarize(fakeGame({phase:'lost',stats:{damage:100000,kills:2,hits:25,shots:25,caps:3},player:{classId:'cruiser',hp:25000,maxHp:32000}}));
  assert.equal(s.won,false);assert.equal(s.stars,1);assert.ok(s.xp>0&&s.xp<1200);
});
test('playing rounds have no reward and cannot be recorded',()=>{
  const s=C.summarize(fakeGame({phase:'playing'}));
  assert.equal(s.xp,0);assert.equal(s.stars,0);assert.equal(s.achievements.length,0);
  assert.equal(C.record(C.empty(),s,'still-playing').battles,0);
});
test('difficulty modifies XP while loadout HP does not inflate damage-star threshold',()=>{
  const easy=C.summarize(fakeGame({difficulty:'easy'})),normal=C.summarize(fakeGame()),hard=C.summarize(fakeGame({difficulty:'hard'}));
  assert.ok(easy.xp<normal.xp&&normal.xp<hard.xp);
  const survival=C.summarize(fakeGame({player:{classId:'cruiser',hp:14000,maxHp:35200},stats:{damage:16000,kills:0,hits:1,shots:2,caps:0}}));
  assert.equal(survival.stars,3);
});
test('summary safely bounds malformed counters and cannot reward forged achievements',()=>{
  const s=C.summarize(fakeGame({stats:{damage:Infinity,kills:1e30,hits:500,shots:0,caps:NaN,citadels:-1,torpHits:'999'},player:{classId:'unknown',hp:NaN,maxHp:0},score:[NaN,-20],damageBreakdown:{HE:Infinity,AP:-1}}));
  assert.equal(s.damage,0);assert.equal(s.kills,3);assert.equal(s.accuracy,0);assert.equal(s.hpRatio,0);
  assert.equal(s.shipClass,'cruiser');assert.deepEqual(plain(s.score),[0,0]);assert.ok(Number.isFinite(s.xp)&&s.xp<=1200);
  assert.ok(!s.achievements.some(a=>a.id==='citadel'||a.id==='torpedo_expert'));
});
test('breakdown cannot exceed total applied damage after import normalization',()=>{
  const s=C.summarize(fakeGame({stats:{damage:100,hits:2,shots:2},damageBreakdown:{HE:90,AP:90,TORP:90,SECONDARY:90}}));
  const total=Object.values(s.damageBreakdown).reduce((a,b)=>a+b,0);
  assert.ok(Math.abs(total-100)<1e-8);
});
test('record returns a new career, updates totals and preserves its inputs',()=>{
  const before=C.empty(),s=C.summarize(fakeGame()),snapshot=JSON.stringify({before,s});
  const after=C.record(before,s,'match-1');
  assert.notEqual(after,before);assert.equal(after.battles,1);assert.equal(after.wins,1);assert.equal(after.xp,s.xp);assert.equal(after.bestDamage,s.damage);
  assert.equal(after.operations.northern.bestStars,3);assert.equal(after.operations.northern.bestTime,140);
  assert.equal(after.history[0].id,'match-1');assert.ok(Number.isFinite(Date.parse(after.history[0].date)));
  assert.equal(JSON.stringify({before,s}),snapshot);
});
test('duplicate match completion grants no XP, win, history or operation progress twice',()=>{
  const s=C.summarize(fakeGame()),once=C.record(C.empty(),s,'same-match'),twice=C.record(once,s,'same-match');
  assert.deepEqual(plain(twice),plain(once));
});
test('history remains20 while a forgotten display row remains idempotent',()=>{
  let c=C.empty();const s=C.summarize(fakeGame());
  for(let i=0;i<35;i++)c=C.record(c,s,'match-'+i);
  assert.equal(c.history.length,20);assert.equal(c.history[0].id,'match-34');assert.equal(c.history[19].id,'match-15');
  assert.equal(c.recordedMatchIds.length,35);
  const again=C.record(c,s,'match-0');assert.equal(again.battles,35);assert.equal(again.xp,c.xp);assert.deepEqual(plain(again.history),plain(c.history));
});
test('an independent ledger persists through a storage JSON roundtrip',()=>{
  let c=C.empty(),s=C.summarize(fakeGame());for(let i=0;i<22;i++)c=C.record(c,s,'persist-'+i);
  const restored=C.normalize(JSON.parse(JSON.stringify(c)));
  assert.equal(C.record(restored,s,'persist-0').battles,22);
});
test('operation progression is separate and winning best-time only improves',()=>{
  let c=C.record(C.empty(),C.summarize(fakeGame()),'op-1');
  c=C.record(c,C.summarize(fakeGame({operationId:'bastion',time:80})),'op-2');
  c=C.record(c,C.summarize(fakeGame({time:190})),'op-3');
  c=C.record(c,C.summarize(fakeGame({phase:'lost',time:20})),'op-4');
  assert.equal(c.operations.northern.battles,3);assert.equal(c.operations.northern.wins,2);assert.equal(c.operations.northern.bestTime,140);
  assert.equal(c.operations.bastion.battles,1);assert.equal(c.operations.bastion.bestTime,80);assert.equal(c.operations.openwater,undefined);
});
test('normalization drops unknown operation keys and clamps impossible aggregates',()=>{
  const c=C.normalize({battles:5,wins:12,xp:1200,operations:{northern:{battles:2,wins:8,bestStars:99,bestDamage:-1,bestTime:Infinity},bogus:{battles:999}}});
  assert.equal(c.wins,5);assert.deepEqual(Object.keys(c.operations),['northern']);assert.equal(c.operations.northern.wins,2);assert.equal(c.operations.northern.bestStars,3);assert.equal(c.operations.northern.bestDamage,0);assert.equal(c.operations.northern.bestTime,0);
});
test('normalization deduplicates history and imports valid existing match IDs',()=>{
  const s=C.summarize(fakeGame()),entry={...s,id:'imported',date:'2026-11-14T00:00:00.000Z'};
  const c=C.normalize({history:[entry,entry,{...entry,id:'other',phase:'playing'}],recordedMatchIds:['imported','imported','bad id']});
  assert.equal(c.history.length,1);assert.deepEqual(plain(c.recordedMatchIds),['imported']);assert.equal(C.record(c,s,'imported').battles,0);
});
test('unsafe match IDs, nonterminal summaries and malformed summaries do not mutate totals',()=>{
  const c=C.empty(),s=C.summarize(fakeGame());
  for(const id of ['',null,{},'bad id','x'.repeat(200),'__proto__'])assert.equal(C.record(c,s,id).battles,0);
  assert.equal(C.record(c,null,'null-summary').battles,0);assert.equal(C.record(c,{phase:'playing'},'not-done').battles,0);
});
test('rewards supplied by caller are recalculated from verified summary fields',()=>{
  const s=C.summarize(fakeGame());s.xp=1e9;s.stars=999;s.achievements=[{id:'forged',label:'fake'}];
  const c=C.record(C.empty(),s,'untrusted-reward');
  assert.equal(c.xp,355);assert.equal(c.history[0].stars,3);assert.ok(!c.history[0].achievements.some(a=>a.id==='forged'));
});
test('optional storage helpers handle corrupt JSON and denied storage access',()=>{
  const store=new Map(),storage={getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)};
  const c=C.record(C.empty(),C.summarize(fakeGame()),'stored');assert.equal(C.write(storage,c),true);assert.deepEqual(plain(C.read(storage)),plain(c));
  store.set(C.storageKey,'{broken');assert.equal(C.read(storage).battles,0);
  const denied={getItem(){throw new Error('denied');},setItem(){throw new Error('denied');}};
  assert.equal(C.read(denied).version,3);assert.equal(C.write(denied,c),false);
});

function campaignSummary(stage,phase='won',options={}){
  const g=fakeGame({operationId:['northern','bastion','openwater'][stage],difficulty:'normal',phase,...options});
  return C.summarize(g,{sessionType:'campaign',campaignRunId:'voyage-1',campaignStage:stage});
}
function activeCampaign(){return C.startCampaign(C.empty(),{runId:'voyage-1',difficulty:'normal'});}

test('V3 preserves the same storage key and exports immutable campaign stages',()=>{
  assert.equal(C.storageKey,'iron-tide.career.v2');
  assert.deepEqual(plain(context.IronTide.CAMPAIGN_STAGES),['northern','bastion','openwater']);
  assert.ok(Object.isFrozen(context.IronTide.CAMPAIGN_STAGES));
});
test('V2 migration preserves totals and identities without guessing aggregate-star difficulty',()=>{
  const old={version:2,xp:500,battles:9,wins:4,bestDamage:40000,history:[],recordedMatchIds:['v2-round'],operations:{northern:{battles:9,wins:4,bestStars:3,bestDamage:40000,bestTime:100}}};
  const migrated=C.normalize(old);
  assert.equal(migrated.version,3);assert.equal(migrated.xp,500);assert.equal(migrated.battles,9);assert.equal(migrated.wins,4);
  assert.deepEqual(plain(migrated.recordedMatchIds),['v2-round']);assert.equal(migrated.operations.northern.bestStars,3);
  assert.deepEqual(plain(migrated.operations.northern.bestByDifficulty),{easy:0,normal:0,hard:0});
  assert.equal(migrated.campaign.status,'idle');assert.equal(migrated.campaignCompletions,0);
  assert.deepEqual(plain(C.normalize(migrated)),plain(migrated));
});
test('known V2 history supplies loadout defaults, class samples and actual difficulty mastery',()=>{
  const legacy=C.summarize(fakeGame({difficulty:'hard'}));delete legacy.loadoutId;delete legacy.sessionType;delete legacy.campaignRunId;delete legacy.campaignStage;
  const migrated=C.normalize({version:2,xp:700,battles:10,wins:6,history:[{...legacy,id:'legacy-history',date:'2026-11-14T00:00:00.000Z'}],operations:{northern:{battles:10,wins:6,bestStars:3,bestDamage:35000,bestTime:120}}});
  assert.equal(migrated.history[0].loadoutId,'balanced');assert.equal(migrated.history[0].sessionType,'free');
  assert.equal(migrated.operations.northern.bestByDifficulty.hard,3);assert.equal(migrated.operations.northern.bestByDifficulty.normal,0);
  assert.equal(migrated.classes.cruiser.battles,1);assert.equal(migrated.classes.cruiser.wins,1);assert.equal(migrated.battles,10);
  assert.deepEqual(plain(C.normalize(migrated)),plain(migrated));
});
test('summary retains actual loadout and validates session metadata',()=>{
  const s=C.summarize(fakeGame({loadoutId:'survival'}),{loadoutId:'artillery',sessionType:'campaign',campaignRunId:'voyage-1',campaignStage:1});
  assert.equal(s.loadoutId,'survival');assert.equal(s.sessionType,'campaign');assert.equal(s.campaignRunId,'voyage-1');assert.equal(s.campaignStage,1);
  const invalid=C.summarize(fakeGame({loadoutId:'bad'}),{sessionType:'bad',campaignRunId:'bad id',campaignStage:99});
  assert.equal(invalid.loadoutId,'balanced');assert.equal(invalid.sessionType,'free');assert.equal(invalid.campaignRunId,null);assert.equal(invalid.campaignStage,null);
});
test('training receives no XP or stars and record adds neither battles nor identities',()=>{
  const before=activeCampaign();
  const s=C.summarize(fakeGame({trainingMode:true}),{sessionType:'campaign',campaignRunId:'voyage-1',campaignStage:0});
  assert.equal(s.sessionType,'training');assert.equal(s.xp,0);assert.equal(s.stars,0);assert.equal(s.achievements.length,0);
  const after=C.record(before,s,'training-match');assert.deepEqual(plain(after),plain(before));
  assert.equal(after.recordedMatchIds.includes('training-match'),false);
});
test('an explicit training context also excludes results without relying on controller guards',()=>{
  const s=C.summarize(fakeGame(),{sessionType:'training'});assert.equal(s.xp,0);
  assert.equal(C.record(C.empty(),s,'training-context').battles,0);
});
test('class statistics and per-difficulty mastery update once per completed battle',()=>{
  let c=C.record(C.empty(),C.summarize(fakeGame({difficulty:'easy',loadoutId:'maneuver'})),'class-1');
  const other=C.summarize(fakeGame({difficulty:'hard',phase:'lost',player:{classId:'destroyer',hp:0,maxHp:18000}}));
  c=C.record(c,other,'class-2');
  assert.equal(c.classes.cruiser.battles,1);assert.equal(c.classes.cruiser.wins,1);assert.equal(c.classes.destroyer.battles,1);assert.equal(c.classes.destroyer.wins,0);
  assert.equal(c.operations.northern.bestByDifficulty.easy,3);assert.equal(c.operations.northern.bestByDifficulty.hard,1);assert.equal(c.operations.northern.bestByDifficulty.normal,0);
  assert.equal(c.history[1].loadoutId,'maneuver');assert.deepEqual(plain(C.record(c,other,'class-2')),plain(c));
});
test('starting a campaign is immutable and retains an already active run',()=>{
  const before=C.empty(),a=C.startCampaign(before,{runId:'voyage-1',difficulty:'hard'});
  assert.equal(before.campaign.status,'idle');assert.equal(a.campaign.status,'active');assert.equal(a.campaign.stage,0);assert.equal(a.campaign.difficulty,'hard');
  const keep=C.startCampaign(a,{runId:'voyage-2',difficulty:'easy'});assert.deepEqual(plain(keep),plain(a));
  assert.equal(C.startCampaign(before,{runId:'bad id'}).campaign.status,'idle');
});
test('free victories never advance a campaign',()=>{
  const c=C.record(activeCampaign(),C.summarize(fakeGame()),'free-victory');
  assert.equal(c.battles,1);assert.equal(c.wins,1);assert.equal(c.campaign.stage,0);assert.equal(c.campaign.attempts,0);assert.equal(c.campaign.results.length,0);
});
test('campaign losses and draws record attempts without advancing the stage',()=>{
  let c=C.record(activeCampaign(),campaignSummary(0,'lost'),'attempt-loss');
  c=C.record(c,campaignSummary(0,'draw'),'attempt-draw');
  assert.equal(c.campaign.stage,0);assert.equal(c.campaign.results.length,0);assert.equal(c.campaign.attempts,2);assert.equal(c.battles,2);assert.equal(c.wins,0);
  assert.ok(c.campaign.totalDamage>0&&c.campaign.totalXp>0);
  c=C.record(c,campaignSummary(0),'attempt-win');assert.equal(c.campaign.stage,1);assert.equal(c.campaign.attempts,3);assert.equal(c.campaign.results.length,1);
});
test('three matching wins complete the campaign atomically with no bonus XP',()=>{
  let c=activeCampaign(),expectedXp=0;
  for(let stage=0;stage<3;stage++){const summary=campaignSummary(stage);expectedXp+=summary.xp;c=C.record(c,summary,'campaign-win-'+stage);assert.equal(c.campaign.stage,stage+1);}
  assert.equal(c.campaign.status,'completed');assert.equal(c.campaignCompletions,1);assert.equal(c.campaign.results.length,3);
  assert.equal(c.xp,expectedXp);assert.equal(c.campaign.totalXp,expectedXp);assert.equal(c.battles,3);assert.equal(c.wins,3);
  assert.deepEqual(plain(c.campaign.results.map(r=>r.matchId)),['campaign-win-0','campaign-win-1','campaign-win-2']);
});
test('duplicate stage and final results cannot advance or complete the campaign twice',()=>{
  let c=activeCampaign();for(let i=0;i<3;i++)c=C.record(c,campaignSummary(i),'dedup-stage-'+i);
  const same=C.record(C.normalize(plain(c)),campaignSummary(2),'dedup-stage-2');assert.deepEqual(plain(same),plain(c));
  const earlier=C.record(same,campaignSummary(0),'dedup-stage-0');assert.equal(earlier.campaignCompletions,1);assert.equal(earlier.battles,3);
});
test('wrong run, stage, operation or difficulty cannot move campaign progression',()=>{
  const variants=[{campaignRunId:'another-run'},{campaignStage:1},{operationId:'bastion'},{difficulty:'hard'}];
  for(const [i,change] of variants.entries()){
    const summary={...campaignSummary(0),...change},c=C.record(activeCampaign(),summary,'invalid-context-'+i);
    assert.equal(c.campaign.stage,0);assert.equal(c.campaign.attempts,0);assert.equal(c.campaign.totalXp,0);assert.equal(c.battles,1);
  }
});
test('an obsolete stage attempt cannot roll back or skip current campaign progress',()=>{
  let c=C.record(activeCampaign(),campaignSummary(0),'stage-advance');
  c=C.record(c,campaignSummary(0),'stale-other-match');
  assert.equal(c.campaign.stage,1);assert.equal(c.campaign.attempts,1);assert.equal(c.campaign.results.length,1);
});
test('a completed run can start a new unique run without losing career progress',()=>{
  let c=activeCampaign();for(let i=0;i<3;i++)c=C.record(c,campaignSummary(i),'finished-'+i);
  assert.equal(C.startCampaign(c,{runId:'voyage-1'}).campaign.status,'completed');
  const next=C.startCampaign(c,{runId:'voyage-2',difficulty:'hard'});assert.equal(next.campaign.status,'active');assert.equal(next.campaign.stage,0);assert.equal(next.campaign.difficulty,'hard');assert.equal(next.campaignCompletions,1);assert.equal(next.xp,c.xp);assert.equal(next.history.length,3);
});
test('campaign normalization requires a valid sequential victory chain',()=>{
  const forged=C.normalize({campaign:{runId:'voyage-1',status:'completed',stage:3,difficulty:'normal',attempts:999,results:[]}});
  assert.equal(forged.campaign.stage,0);assert.equal(forged.campaign.status,'active');assert.equal(forged.campaignCompletions,0);
  const wrong={...campaignSummary(1),matchId:'wrong-first'};
  assert.equal(C.normalize({campaign:{runId:'voyage-1',status:'active',stage:2,difficulty:'normal',results:[wrong]}}).campaign.stage,0);
  assert.equal(C.normalize({campaign:{runId:'__proto__',status:'active'}}).campaign.status,'idle');
});

console.log(`\n${passed}/${passed+failed} checks passed.`);
if(failed)process.exitCode=1;
