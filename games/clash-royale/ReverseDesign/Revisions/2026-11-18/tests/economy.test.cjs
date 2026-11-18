'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const economy = require('../lab/economy.js');
const read = name => JSON.parse(fs.readFileSync(path.join(__dirname, '../data/tables', name + '.json'), 'utf8'));
const progression = read('progression_rules');
const probabilities = read('reward_probability_tables');
const clone = x => JSON.parse(JSON.stringify(x));
const approx = (a, b, epsilon = 1e-12) => assert.ok(Math.abs(a - b) <= epsilon, `${a} is not close to ${b}`);
function freezeDeep(x) {if (x && typeof x === 'object') {Object.freeze(x); Object.values(x).forEach(freezeDeep);} return x;}

for (const [rarity, copies] of Object.entries({common:20500, rare:4100, epic:530, legendary:61, champion:41})) {
  test(`published recipe path ${rarity} level 11→16 retains exact source totals`, () => {
    const r = economy.planUpgrade(progression, {rarity, fromLevel:11, toLevel:16});
    assert.equal(r.ok, true); assert.equal(r.complete, true); assert.equal(r.blocked, false);
    assert.deepEqual(r.totals, {copies, gold:335000}); assert.equal(r.recipes.length, 5);
    assert.equal(r.recipes[0].fromLevel, 11); assert.equal(r.recipes[4].targetLevel, 16);
    assert.equal(r.affordable, null); assert.equal(r.deficits.copies, null);
    assert.ok(r.sourceIds.includes('ECON_SRC_UPGRADE_20251110'));
    assert.equal(r.liveGameVerified, false);
  });
}

test('known Epic 6→7 Gold gap remains null and cannot become free upgrade', () => {
  const r = economy.planUpgrade(progression, {rarity:'epic', fromLevel:6, toLevel:7, ownedCopies:1000, ownedGold:1000000});
  assert.equal(r.ok, true); assert.equal(r.complete, false); assert.equal(r.blocked, true);
  assert.equal(r.totals.copies, 2); assert.equal(r.totals.gold, null);
  assert.equal(r.knownSubtotal.gold, 0); assert.equal(r.deficits.gold, null); assert.equal(r.affordable, null);
  assert.ok(r.issues.some(i => i.code === 'unknown_cost' && i.field === 'gold'));
});

test('copy and Gold deficits are separate; zero balance is an explicit balance', () => {
  const r = economy.planUpgrade(progression, {rarity:'common', fromLevel:11, toLevel:16, ownedCopies:20550, ownedGold:25000});
  assert.deepEqual(r.deficits, {copies:0, gold:310000}); assert.equal(r.affordable, false);
  const empty = economy.planUpgrade(progression, {rarity:'rare', fromLevel:11, toLevel:12, ownedCopies:0, ownedGold:0});
  assert.deepEqual(empty.deficits, {copies:400, gold:25000});
});

test('equal level returns a genuine zero-cost no-op and does not add unlock copy', () => {
  const r = economy.planUpgrade(progression, {rarity:'legendary', fromLevel:9, toLevel:9, ownedCopies:0, ownedGold:0});
  assert.equal(r.complete, true); assert.deepEqual(r.totals, {copies:0, gold:0});
  assert.equal(r.recipes.length, 0); assert.equal(r.affordable, true);
});

test('reject impossible levels, nonnumeric inputs, negatives, and absent tables', () => {
  const cases = [
    {rarity:'epic', fromLevel:5, toLevel:7}, {rarity:'common', fromLevel:16, toLevel:17},
    {rarity:'common', fromLevel:5, toLevel:4}, {rarity:'common', fromLevel:'11', toLevel:16},
    {rarity:'common', fromLevel:11, toLevel:16, ownedGold:null},
    {rarity:'common', fromLevel:11, toLevel:16, ownedCopies:-1},
    {rarity:'common', fromLevel:11, toLevel:16, ownedGold:Infinity},
    {rarity:'common', fromLevel:NaN, toLevel:16}, {rarity:'mythic', fromLevel:11, toLevel:16}
  ];
  for (const opts of cases) assert.equal(economy.planUpgrade(progression, opts).ok, false);
  assert.equal(economy.planUpgrade([], {rarity:'common', fromLevel:11, toLevel:16}).ok, false);
  assert.equal(economy.planUpgrade(null, {}).ok, false);
});

test('missing interior recipe preserves known subtotal and blocks both complete totals', () => {
  const rows = progression.filter(r => r.record_id !== 'PROG_COST_COMMON_13');
  const r = economy.planUpgrade(rows, {rarity:'common', fromLevel:11, toLevel:16});
  assert.equal(r.ok, true); assert.equal(r.complete, false);
  assert.deepEqual(r.totals, {copies:null, gold:null});
  assert.deepEqual(r.knownSubtotal, {copies:18000, gold:295000});
  assert.ok(r.recipes.some(x => x.targetLevel === 13 && x.missing));
});

test('duplicate recipes and conflicting versions cannot silently choose a record', () => {
  const row = progression.find(r => r.record_id === 'PROG_COST_COMMON_12');
  const duplicate = economy.planUpgrade([...progression, clone(row)], {rarity:'common', fromLevel:11, toLevel:12});
  assert.equal(duplicate.ok, false); assert.equal(duplicate.totals.gold, null);
  const changed = progression.map(r => r === row ? {...r, version_note:'different_version'} : r);
  assert.equal(economy.planUpgrade(changed, {rarity:'common', fromLevel:11, toLevel:12}).ok, false);
});

test('invalid cost and predecessor are rejected without coercion', () => {
  for (const replacement of [{gold:'25000'}, {gold:-1}, {gold:NaN}, {from_level:10}]) {
    const rows = progression.map(r => r.record_id === 'PROG_COST_COMMON_12' ? {...r, value:{...r.value, ...replacement}} : r);
    assert.equal(economy.planUpgrade(rows, {rarity:'common', fromLevel:11, toLevel:12}).ok, false);
  }
});

test('probability analysis uses the exact family and starting-star condition', () => {
  const r = economy.analyzeProbabilityGroup(probabilities, 'magic__final_stars_given_start_1');
  assert.equal(r.ok, true); assert.equal(r.complete, true); assert.equal(r.rows.length, 5);
  approx(r.publishedSum, 1); approx(r.expectedFinalStars, 1.9976);
  assert.deepEqual(r.conditionalOn, {chest_family:'magic', starting_stars:1});
  assert.equal(r.normalization, 'none'); assert.equal(r.liveGameVerified, false);
  assert.equal(economy.analyzeProbabilityGroup(probabilities, 'magic__final_stars_given_start_5').expectedFinalStars, 5);
});

test('99.99%, 100.01%, and event-specific 99.9% are accepted within recorded tolerance without normalization', () => {
  const groups = ['magic__reward_type_given_final_3', 'standard_detailed__reward_type_given_final_4', 'shocktober_2026__snippet_rarity'];
  const expected = [1.0001,1.0001,0.999];
  groups.forEach((g, i) => {
    const r = economy.analyzeProbabilityGroup(probabilities, g);
    assert.equal(r.ok, true); assert.equal(r.complete, true); approx(r.publishedSum, expected[i]);
    assert.equal(r.normalization, 'none'); assert.equal(r.expectedFinalStars, null);
    assert.equal(r.roundedInputApproximation, true);
    const raw = probabilities.find(x => x.probability_group === g);
    assert.equal(r.rows[0].probability, raw.probability);
  });
  const source = probabilities.filter(r => r.probability_group === 'magic__final_stars_given_start_1').map(clone);
  source[0].probability -= 0.0001; source[0].value.probability = source[0].probability;
  const custom = economy.analyzeProbabilityGroup(source, 'magic__final_stars_given_start_1');
  assert.equal(custom.complete, true); approx(custom.publishedSum, 0.9999); approx(custom.expectedFinalStars, 1.9975);
});

test('unknown probability remains unknown and no mean is computed', () => {
  const rows = probabilities.filter(r => r.probability_group === 'magic__final_stars_given_start_1').map(clone);
  rows[0].probability = rows[0].value.probability = null;
  const r = economy.analyzeProbabilityGroup(rows, 'magic__final_stars_given_start_1');
  assert.equal(r.ok, true); assert.equal(r.complete, false); assert.equal(r.publishedSum, null);
  assert.equal(r.unknownCount, 1); approx(r.knownSubtotal, 0.6836); assert.equal(r.expectedFinalStars, null);
});

test('different conditions, duplicate outcomes, version conflicts, and inconsistent nested values fail closed', () => {
  const g = 'magic__final_stars_given_start_1';
  for (const edit of [
    rs => {rs[0].conditional_on.starting_stars = 2;},
    rs => {rs[0].value.outcome = clone(rs[1].value.outcome);},
    rs => {rs[0].version_note = 'different_version';},
    rs => {rs[0].value.probability = 0;},
    rs => {rs[0].probability = rs[0].value.probability = -0.1;},
    rs => {rs[0].probability = rs[0].value.probability = '0.3';},
    rs => {rs[0].probability = rs[0].value.probability = Infinity;},
    rs => {rs[0].probability_sum_tolerance = 0.1;},
    rs => {rs[0].record_id = rs[1].record_id;}
  ]) {
    const rows = probabilities.filter(r => r.probability_group === g).map(clone); edit(rows);
    const r = economy.analyzeProbabilityGroup(rows, g);
    assert.equal(r.ok, false); assert.equal(r.expectedFinalStars, null);
  }
});

test('non-exhaustive groups and missing rows never produce a complete expected distribution', () => {
  const g = 'magic__final_stars_given_start_1';
  const rows = probabilities.filter(r => r.probability_group === g).slice(0, 2).map(r => ({...r, exhaustive_group:false}));
  const r = economy.analyzeProbabilityGroup(rows, g);
  assert.equal(r.ok, true); assert.equal(r.complete, false); assert.equal(r.expectedFinalStars, null);
  assert.equal(economy.analyzeProbabilityGroup(probabilities.filter(r => r.record_id !== 'REWARD_MAGIC_START1_FINAL1'), g).ok, false);
  assert.equal(economy.analyzeProbabilityGroup(probabilities, 'not-a-group').ok, false);
  assert.equal(economy.analyzeProbabilityGroup(probabilities, null).ok, false);
});

test('historical Hero fragment and seasonal groups retain their historical scope', () => {
  assert.equal(economy.analyzeProbabilityGroup(probabilities, 'legacy_hero_fragment_box__final_stars_given_start_2').historicalOnly, true);
  assert.equal(economy.analyzeProbabilityGroup(probabilities, 'shocktober_2026__snippet_rarity').historicalOnly, true);
  assert.equal(economy.analyzeProbabilityGroup(probabilities, 'magic__final_stars_given_start_1').historicalOnly, false);
});

test('repeated probability respects zero attempts, certainty, independence, and numerical stability', () => {
  assert.equal(economy.probabilityAtLeastOne(1,0).probability,0);
  assert.equal(economy.probabilityAtLeastOne(0,20).probability,0);
  assert.equal(economy.probabilityAtLeastOne(1,20).probability,1);
  approx(economy.probabilityAtLeastOne(0.5,3).probability,0.875);
  const tiny = economy.probabilityAtLeastOne(1e-15,1000000);
  assert.ok(tiny.probability > 0); approx(tiny.probability,1e-9,1e-17);
  assert.equal(tiny.independence_assumed,true); assert.equal(tiny.liveGameVerified,false);
  for (const [p,n] of [[null,1],['0.1',1],[NaN,1],[Infinity,1],[-1,1],[1.1,1],[0.1,-1],[0.1,1.5],[0.1,'5']]) {
    assert.equal(economy.probabilityAtLeastOne(p,n).ok,false);
  }
});

test('all public functions leave frozen source tables and caller options unchanged', () => {
  const rows = freezeDeep(clone(progression)); const probs = freezeDeep(clone(probabilities));
  const options = freezeDeep({rarity:'common',fromLevel:11,toLevel:16,ownedGold:0,ownedCopies:0});
  const before = JSON.stringify({rows,probs,options});
  const r = economy.planUpgrade(rows, options);
  const p = economy.analyzeProbabilityGroup(probs,'magic__final_stars_given_start_1');
  r.recipes[0].sourceIds.push('caller-change'); p.rows[0].outcome.final_stars = 99;
  assert.equal(JSON.stringify({rows,probs,options}),before);
});

test('same UMD code can be loaded without Node or a browser DOM', () => {
  const sandbox = {}; vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../lab/economy.js'),'utf8'),sandbox);
  assert.equal(typeof sandbox.RoyaleEconomy.planUpgrade,'function');
  assert.equal(sandbox.RoyaleEconomy.probabilityAtLeastOne(0.5,2).probability,0.75);
});
