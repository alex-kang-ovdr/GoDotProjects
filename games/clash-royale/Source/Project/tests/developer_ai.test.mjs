import test from 'node:test';
import assert from 'node:assert/strict';
import { CARDS } from '../dist/js/engine.js';
import { BattleAI } from '../dist/js/ai.js';

function world({hand=['knight'],elixir=10,units=[],balance={},rulesVersion=4,towerHp=1850}={}) {
  const plays=[],queries=[],hands={enemy:[...hand]},resources={enemy:elixir};
  Object.defineProperty(hands,'player',{get(){throw new Error('hidden opponent hand');}});
  Object.defineProperty(resources,'player',{get(){throw new Error('hidden opponent elixir');}});
  const game={seed:52,rulesVersion,plays,queries,
    state:{time:5,running:true,phase:'regulation',winner:null,hands,elixir:resources,units,
      crowns:{enemy:0,player:0},towers:['player','enemy'].flatMap(team=>[120,360].map(x=>({
        id:`${team}-${x}`,team,type:'princess',kind:'tower',isBuilding:true,x,y:team==='player'?490:150,
        radius:25,hp:team==='player'?towerHp:1850,maxHp:1850})))},
    getCard(id,team='player'){queries.push({id,team});return CARDS[id]?{...CARDS[id],...balance[team]?.[id]}:null;},
    canDeploy(team,id,x,y){const c=this.getCard(id,team);return {ok:team==='enemy'&&c&&c.cost<=resources.enemy&&
      x>=0&&x<=480&&y>=0&&y<=640&&(c.type==='spell'||y<=300)};},
    playCard(team,index,x,y){const id=hands.enemy[index];assert.equal(this.canDeploy(team,id,x,y).ok,true);
      const cost=this.getCard(id,team).cost;resources.enemy-=cost;plays.push({id,x,y,cost});return {ok:true};}
  };
  return game;
}
const troop=(id,cardId,team,x,y,extra={})=>({...CARDS[cardId],id,cardId,team,x,y,
  hp:CARDS[cardId].hp,maxHp:CARDS[cardId].hp,isBuilding:CARDS[cardId].type==='building',...extra});
function decide(game) {
  const ai=new BattleAI(game,{difficulty:'hard',seed:41});ai.lastTime=game.state.time;
  for(const unit of game.state.units.filter(u=>u.team==='player'))ai.seenThreats.set(unit.id,0);
  ai.think(game.state);return ai;
}

test('AI affordability and instant spell finishers use the enemy resolved card, not player tuning or base costs',()=>{
  const low=world({hand:['fireball'],elixir:1,towerHp:100,
    balance:{enemy:{fireball:{cost:1,crownDamage:120}},player:{fireball:{cost:9,crownDamage:1}}}});
  assert.equal(decide(low).lastDecision?.intent,'finish-tower');assert.equal(low.plays[0].cost,1);
  assert.equal(low.state.elixir.enemy,0);assert.ok(low.queries.some(q=>q.id==='fireball'&&q.team==='enemy'));
  const high=world({hand:['fireball'],elixir:8,towerHp:100,balance:{enemy:{fireball:{cost:9,crownDamage:120}}}});
  decide(high);assert.equal(high.plays.length,0);
  const weak=world({hand:['fireball'],elixir:4,towerHp:100,balance:{enemy:{fireball:{crownDamage:40}}}});
  decide(weak);assert.equal(weak.plays.length,0,'reduced crown damage cannot be treated as a guaranteed finisher');
});

test('AI spell clustering follows the current radius and evaluates actual target HP',()=>{
  const units=[80,240,400].map((x,i)=>troop(`a${i}`,'archers','player',x,240,{hp:200,maxHp:300}));
  const normal=world({hand:['fireball'],elixir:2,units,balance:{enemy:{fireball:{cost:2,spellRadius:30}}}});
  decide(normal);assert.equal(normal.plays.length,0,'an isolated low-value archer is not a useful small spell');
  const broad=world({hand:['fireball'],elixir:2,units,balance:{enemy:{fireball:{cost:2,spellRadius:190}}}});
  const ai=decide(broad);assert.equal(ai.lastDecision?.intent,'cluster-spell');
  assert.ok(units.filter(u=>Math.hypot(u.x-broad.plays[0].x,u.y-broad.plays[0].y)<=190+u.radius).length>=2);
});

test('live HP, damage, attack interval and range tuning can change the chosen defender',()=>{
  const units=[troop('tank','giant','player',120,250)];
  const original=world({hand:['knight','duelist'],elixir:4,units});
  assert.equal(decide(original).lastDecision?.cardId,'duelist');
  const tuned=world({hand:['knight','duelist'],elixir:4,units,
    balance:{enemy:{knight:{hp:5000,damage:700,attackInterval:.5,range:100}}}});
  assert.equal(decide(tuned).lastDecision?.cardId,'knight');
});

test('rules 4 non-charging phalanxes are not defensive firepower and actual unit DPS takes precedence',()=>{
  const threat=troop('t','knight','player',120,250),game=world(),ai=new BattleAI(game,{difficulty:'hard',seed:3});
  ai.lastTime=5;
  const guards=Array.from({length:6},(_,i)=>troop(`g${i}`,'phalanx','enemy',120+i,225,
    {formationState:'guard',formationProtected:true}));
  const score=(members)=>{const out=[];ai.defenseCandidates(out,0,'knight',game.getCard('knight','enemy'),
    {defense:3.1},[threat],members,game.state.towers.filter(t=>t.team==='enemy'));return out[0]?.score??-Infinity;};
  const baseline=score([]),guardScore=score(guards);
  assert.equal(guardScore,baseline);
  for(const formationState of ['forming','regroup'])assert.equal(score(guards.map(u=>({...u,formationState}))),baseline);
  const charging=guards.map(u=>({...u,formationState:'charge'}));
  assert.ok(score(charging)<baseline,'charging squad can supply real defensive damage');
  assert.equal(score(charging.map(u=>({...u,damage:0}))),baseline,'actual zero damage overrides published card DPS');
  game.rulesVersion=3;assert.ok(score(guards)<baseline,'legacy guard attacks retain their previous meaning');
});

test('defensive coverage uses actual unit range rather than a changed card definition alone',()=>{
  const game=world({balance:{enemy:{musketeer:{range:300}}}}),ai=new BattleAI(game,{difficulty:'hard',seed:9});
  const threat=troop('target','knight','player',120,250);
  const defenders=Array.from({length:3},(_,i)=>troop(`m${i}`,'musketeer','enemy',320+i,250,{range:20}));
  const candidates=units=>{const out=[];ai.defenseCandidates(out,0,'knight',game.getCard('knight','enemy'),
    {defense:3.1},[threat],units,game.state.towers.filter(t=>t.team==='enemy'));return out;};
  assert.ok(candidates(defenders).length>0,'distant short-range units cannot cover the skirmish');
  assert.equal(candidates(defenders.map(u=>({...u,range:300}))).length,0,'visible long-range defenders already cover it');
});

test('rules 4 AI charges to attack a nearby foe while legacy guard policy is preserved',()=>{
  for(const rulesVersion of [3,4]) {
    const members=Array.from({length:6},(_,i)=>troop(`g${i}`,'phalanx','enemy',120+i,240,
      {formationState:'guard',formationGroupId:'g1'}));
    const game=world({hand:['fireball'],elixir:1,rulesVersion,units:[...members,troop('near','knight','player',120,270)]});
    const activations=[];game.getAbilities=()=>[{ready:true,aliveCount:6,memberIds:members.map(u=>u.id),
      groupId:'g1',x:120,y:240,cost:1}];
    game.activateAbility=(team,id)=>{activations.push({team,id});return {ok:true};};
    decide(game);assert.equal(activations.length,rulesVersion===4?1:0);
    if(rulesVersion===4)assert.deepEqual(activations[0],{team:'enemy',id:'g1'});
  }
});
