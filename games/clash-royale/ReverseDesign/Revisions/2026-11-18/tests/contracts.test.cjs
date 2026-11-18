'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const C = require('../lab/contracts.js');
const scenarios = require('../data/contracts/reference_scenarios.json');
const deck = [...'ABCDEFGH'];
const profile = { initialAmount: 0, capacity: 10, baseIntervalSeconds: 2 };
const readPath = (value, dotted) => dotted.split('.').reduce((obj, key) => obj == null ? undefined : obj[key], value);
const near = (actual, expected, tolerance = 1e-9) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
  `expected ${actual} to be within ${tolerance} of ${expected}`);
function deepFreeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); }
  return value;
}

for (const scenario of scenarios.scenarios) {
  test(`reference scenario: ${scenario.scenario_id} — ${scenario.title}`, () => {
    assert.equal(scenario.original_observation.observed, false);
    assert.equal(scenario.original_observation.test_status, 'not_run');
    assert.equal(scenario.expected_scope, 'local_reference_contract_only');
    assert.equal(typeof C[scenario.operation], 'function');
    const original = JSON.stringify(scenario.args);
    const result = C[scenario.operation](...deepFreeze(structuredClone(scenario.args)));
    assert.equal(result.originalClientObserved, false);
    for (const assertion of scenario.assertions) {
      const actual = readPath(result, assertion.path);
      if ('equals' in assertion) assert.deepEqual(actual, assertion.equals, assertion.path);
      else near(actual, assertion.approx, assertion.tolerance);
    }
    assert.equal(JSON.stringify(scenario.args), original);
  });
}

test('cycle conserves every card exactly once across long mixed-slot sequences', () => {
  let state = C.createCycle(deck).state;
  for (let i = 0; i < 1024; i += 1) {
    const before = structuredClone(state);
    const result = C.playCycle(deepFreeze(state), (i * 13 + Math.floor(i / 7)) % 4);
    assert.equal(result.ok, true);
    assert.deepEqual(state, before);
    state = result.state;
    assert.deepEqual([...state.hand, ...state.queue].sort(), deck);
    assert.equal(state.plays, i + 1);
  }
});

test('cycle rejects damaged state, unsafe count, string slot, and duplicate identity', () => {
  const good = C.createCycle(deck).state;
  for (const bad of [null, {}, {...good, plays: -1}, {...good, plays: 0.5},
    {...good, hand: ['A','A','C','D']}, {...good, queue: ['A','F','G','H']}]) {
    assert.equal(C.playCycle(bad, 0).ok, false);
  }
  for (const slot of [-1,4,1.2,'0',NaN,Infinity]) assert.equal(C.playCycle(good, slot).ok, false);
  assert.equal(C.playCycle({...good, plays: Number.MAX_SAFE_INTEGER},0).error.code, 'PLAY_COUNT_OVERFLOW');
  assert.equal(C.runCycle(deck, [0,1,4]).ok, false);
  const sparseDeck=deck.slice(); delete sparseDeck[1];
  assert.equal(C.createCycle(sparseDeck).ok,false);
  assert.equal(C.runCycle(deck,new Array(2)).ok,false);
});

test('clock handles both sides of every boundary without deciding a winner', () => {
  for (const [time, phase, multiplier] of [[119.999999,'regular',1],[120,'regular',2],
    [179.999999,'regular',2],[180,'overtime',2],[239.999999,'overtime',2],
    [240,'overtime',3],[299.999999,'overtime',3],[300,'tiebreak_pending',0],[800,'tiebreak_pending',0]]) {
    const result = C.phaseAt(time);
    assert.equal(result.phase, phase);
    assert.equal(result.multiplier, multiplier);
    assert.equal(result.winnerEvaluated, false);
    assert.ok(result.remainingSeconds >= 0);
  }
  for (const invalid of [-1,'120',NaN,Infinity,null]) assert.equal(C.phaseAt(invalid).ok,false);
});

test('elixir requires all three profile fields and an explicit later start amount', () => {
  for (const key of Object.keys(profile)) {
    const incomplete = {...profile}; delete incomplete[key];
    const result = C.simulateElixir({fromSeconds:0,toSeconds:1,profile:incomplete});
    assert.equal(result.blocked,true);
    assert.ok(result.missingFields.includes(`profile.${key}`));
  }
  assert.equal(C.simulateElixir({fromSeconds:1,toSeconds:2,profile}).error.code,'MISSING_START_AMOUNT');
  const table = JSON.parse(fs.readFileSync(path.join(__dirname,'../data/tables/combat_rules.json'),'utf8'));
  for (const key of ['elixir.initial_amount','elixir.capacity','elixir.base_generation_interval']) {
    const row = table.find(row => row.key === key);
    assert.equal(row.value,null,`${key} must not be promoted from reference_value`);
    assert.equal(row.evidence_status,'unverified');
  }
});

test('elixir exact boundary affordability and rejected action accounting', () => {
  const result = C.simulateElixir({fromSeconds:0,toSeconds:3,profile:{initialAmount:0,capacity:10,baseIntervalSeconds:2.8},
    spends:[{atSeconds:2.8,cost:1},{atSeconds:2.8,cost:1}]});
  assert.equal(result.events[0].accepted,true);
  assert.equal(result.events[1].accepted,false);
  near(result.spent,1);
  near(result.generated,3/2.8);
  near(result.finalAmount,.2/2.8);
  near(result.conservationResidual,0);
});

test('a huge capacity cannot make an unaffordable cost pass tolerance', () => {
  const result = C.simulateElixir({fromSeconds:0,toSeconds:0,profile:{initialAmount:0,capacity:1e308,baseIntervalSeconds:2},
    spends:[{atSeconds:0,cost:1},{atSeconds:0,cost:1e-20}]});
  assert.deepEqual(result.events.map(event => event.accepted),[false,false]);
  assert.equal(result.finalAmount,0);
  assert.equal(result.spent,0);
});

test('elixir integration is invariant under segmentation at schedule boundaries', () => {
  const p = {initialAmount:0,capacity:10000,baseIntervalSeconds:2.8};
  const whole = C.simulateElixir({fromSeconds:0,toSeconds:300,profile:p});
  const expectedGenerated = (120 + 120*2 + 60*3)/2.8;
  near(whole.generated,expectedGenerated);
  let amount = 0;
  let generated = 0;
  for (const [fromSeconds,toSeconds] of [[0,75.7],[75.7,120],[120,180],[180,240],[240,299.5],[299.5,300]]) {
    const part = C.simulateElixir({fromSeconds,toSeconds,startAmount:amount,profile:p});
    assert.equal(part.ok,true);
    amount=part.finalAmount; generated+=part.generated;
  }
  near(amount,whole.finalAmount);
  near(generated,whole.generated);
});

test('elixir supports saturation, no-time intervals and immutable input', () => {
  const input = deepFreeze({fromSeconds:0,toSeconds:1,profile:{initialAmount:10,capacity:10,baseIntervalSeconds:2},spends:[]});
  const result = C.simulateElixir(input);
  near(result.generated,.5); near(result.overflow,.5); near(result.finalAmount,10);
  const zero = C.simulateElixir({fromSeconds:0,toSeconds:0,profile});
  assert.equal(zero.finalAmount,0); assert.equal(zero.generated,0); assert.equal(zero.segments.length,0);
});

test('elixir rejects invalid numeric and chronological inputs atomically', () => {
  for (const p of [{...profile,capacity:0},{...profile,initialAmount:11},{...profile,baseIntervalSeconds:0},
    {...profile,capacity:'10'},{...profile,initialAmount:NaN},{...profile,baseIntervalSeconds:Infinity}]) {
    assert.equal(C.simulateElixir({fromSeconds:0,toSeconds:1,profile:p}).ok,false);
  }
  for (const input of [{fromSeconds:-1,toSeconds:2},{fromSeconds:3,toSeconds:2},{fromSeconds:0,toSeconds:301},
    {fromSeconds:0,toSeconds:1,startAmount:11},{fromSeconds:0,toSeconds:1,spends:[{atSeconds:2,cost:1}]},
    {fromSeconds:0,toSeconds:1,spends:[{atSeconds:0,cost:-1}]},
    {fromSeconds:0,toSeconds:1,spends:[{atSeconds:0,cost:'1'}]}]) {
    const result=C.simulateElixir({...input,profile});
    assert.equal(result.ok,false); assert.equal('finalAmount' in result,false);
  }
  const overflow=C.simulateElixir({fromSeconds:0,toSeconds:300,profile:{initialAmount:0,capacity:10,baseIntervalSeconds:Number.MIN_VALUE}});
  assert.equal(overflow.error.code,'NUMERICAL_RANGE');
});

test('shield policies conserve damage through shield, body, discard, overkill and ignored pools', () => {
  for (const policy of ['discard','spill']) for (const bodyHp of [0,1,100]) for (const shieldHp of [0,1,50]) for (const damage of [0,1,50,100,1000]) {
    const input = deepFreeze({bodyHp,shieldHp,damage,overflowPolicy:policy});
    const result=C.resolveShield(input);
    assert.equal(result.ok,true);
    near(result.bodyDamage+result.shieldDamage+result.discarded+result.overkill+result.ignoredDamage,damage);
    near(result.bodyHp+result.bodyDamage,bodyHp);
    near(result.shieldHp+result.shieldDamage,shieldHp);
    assert.ok(result.bodyHp>=0 && result.shieldHp>=0);
  }
});

test('unknown shield policy never yields a disguised result; invalid values are rejected', () => {
  for (const policy of [undefined,null,'unknown']) {
    const result=C.resolveShield({bodyHp:100,shieldHp:20,damage:50,overflowPolicy:policy});
    assert.equal(result.blocked,true); assert.equal('bodyDamage' in result,false);
  }
  for (const patch of [{bodyHp:-1},{shieldHp:NaN},{damage:Infinity},{damage:'50'},{overflowPolicy:'guess'}]) {
    const result=C.resolveShield({bodyHp:100,shieldHp:20,damage:50,overflowPolicy:'spill',...patch});
    assert.equal(result.ok,false);
  }
});

test('three separated shield waves do not collapse into one hit under discard policy', () => {
  const one=C.resolveShield({bodyHp:500,shieldHp:50,damage:120,overflowPolicy:'discard'});
  let bodyHp=500,shieldHp=50;
  for (let i=0;i<3;i++) {
    const wave=C.resolveShield({bodyHp,shieldHp,damage:40,overflowPolicy:'discard'});
    bodyHp=wave.bodyHp;shieldHp=wave.shieldHp;
  }
  assert.equal(one.bodyHp,500); assert.equal(bodyHp,460);
});

test('custom phalanx defense and attack are mutually exclusive in all aggregate conditions', () => {
  for (const state of ['forming','guard','regroup','charge']) for (let aliveCount=0;aliveCount<=6;aliveCount++)
    for (const aligned of [false,true]) for (const deployed of [false,true]) for (const stunned of [false,true]) {
      const result=C.phalanx({state,aliveCount,aligned,deployed,stunned,incomingDamage:100});
      assert.equal(result.ok,true);
      assert.equal(result.evidenceStatus,'custom_only');
      assert.equal(result.originalCardId,null);
      assert.equal(result.originalClientObserved,false);
      assert.ok(!(result.defenseActive && result.canAttack));
      if (state !== 'charge') assert.equal(result.canAttack,false);
      if (aliveCount<3 || !aligned || !deployed || stunned) assert.equal(result.defenseActive,false);
    }
});

test('phalanx aggregate inputs reject missing booleans, impossible counts and non-finite damage', () => {
  const base={state:'guard',aliveCount:6,aligned:true,deployed:true,stunned:false,incomingDamage:100};
  for (const patch of [{state:'attack'},{aliveCount:7},{aliveCount:-1},{aliveCount:3.5},{aligned:'true'},
    {deployed:undefined},{stunned:0},{incomingDamage:NaN},{incomingDamage:-1}]) {
    assert.equal(C.phalanx({...base,...patch}).ok,false);
  }
});

test('browser global build has the same contract API without requiring fetch, DOM or Node', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../lab/contracts.js'),'utf8'),context);
  assert.equal(context.RoyaleContracts.VERSION,C.VERSION);
  assert.equal(context.RoyaleContracts.phaseAt(240).multiplier,3);
  assert.equal(context.RoyaleContracts.createCycle(deck).state.hand.length,4);
  assert.equal(context.RoyaleContracts.resolveShield({bodyHp:500,shieldHp:50,damage:120,overflowPolicy:'unknown'}).blocked,true);
});
