'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const Data = require('../dist/data.js');
const root = path.resolve(__dirname, '..');
const snapshotText = fs.readFileSync(path.join(root, 'data/analysis-snapshot.json'), 'utf8');
const snapshot = JSON.parse(snapshotText);

test('unverified and contradictory observations cannot become executable source values', () => {
  for (const [id, field] of [
    ['small_reactor_core', 'battery_charge_s'],
    ['crew_bunk', 'value_credits'],
    ['chaingun', 'construction_resources'],
    ['recipe_steel', 'inputs'],
    ['recipe_he_missile_parts', 'input_rates_per_s'],
    ['recipe_ammo', 'actual_batch_size'],
    ['sulfur', 'mass_t_per_item']
  ]) {
    assert.equal(Data.getEvidence(id, field).value, null, id + '.' + field + ' stays unknown');
    assert.throws(() => Data.readKnown(id, field), /Unverified analysis field/);
  }
  assert.throws(() => Data.readKnown('sulfur', 'base_price_credits', 'tonne/item'), /unit mismatch/);
  assert.throws(() => Data.readKnown('__proto__', 'anything'), /Unverified analysis field/);
  assert.equal(Data.SOURCE_METADATA.exactGameBuild, null, 'the original installed build is not invented');
  assert.equal(Data.getEvidence('small_reactor_core', 'battery_charge_s').observations.length, 2, 'contradictory raw observations remain reviewable');
});

test('the 14 module links resolve to attributable public observations without adopting the rejected bunk', () => {
  assert.equal(Object.keys(Data.PART_REFERENCES).length, 14);
  assert.equal(Data.PART_REFERENCES.bunk, 'crew_quarters');
  assert.equal(Data.readKnown('crew_quarters', 'crew_beds'), 6);
  for (const type of Object.keys(Data.PART_REFERENCES)) {
    const reference = Data.getPartReference(type);
    assert.ok(reference.record, type + ' source exists');
    assert.equal(reference.sourceRecordId, Data.PART_REFERENCES[type]);
    for (const [field, ids] of Object.entries(reference.record.evidence)) {
      for (const id of ids) assert.ok(Data.SOURCES[id]?.url?.startsWith('https://'), type + '.' + field + ' source resolves');
    }
  }
  assert.equal(Data.getPartReference('crew_bunk'), null);
  assert.equal(Data.getPartReference('chaingun'), null);
  assert.deepEqual(Data.getPartReference('reactor_medium').mappings.map(x => x.target).sort(),
    ['batteryPack', 'generation', 'cost', 'hp', 'mass', 'powerCapacity'].map(k => 'parts.reactor_medium.' + k).sort());
});

test('reactor tiers preserve the documented relative production and battery sizes with explicit independent scales', () => {
  const tiers = ['reactor', 'reactor_medium', 'reactor_large'];
  const defs = tiers.map(id => Data.PART_OVERRIDES[id]);
  assert.deepEqual(defs.map(d => d.batteryPack), [6, 12, 18]);
  assert.deepEqual(defs.map(d => d.generation), [10.5, 31.5, 94.5]);
  assert.deepEqual(defs.map(d => d.powerCapacity), [100, 200, 300]);
  assert.deepEqual(defs.map(d => d.cost), [350, 700, 1050]);
  assert.deepEqual(defs.map(d => d.mass), [4.2, 9.45, 16.8]);
  for (const type of tiers) {
    const sourceId = Data.PART_REFERENCES[type];
    assert.equal(Data.PART_OVERRIDES[type].batteryPack / Data.readKnown(sourceId, 'battery_size'), 6);
    assert.equal(Data.PART_OVERRIDES[type].generation / Data.readKnown(sourceId, 'power_generation_per_s'), 7);
    assert.equal(Data.PART_OVERRIDES[type].powerCapacity / Data.readKnown(sourceId, 'power_capacity'), 12.5);
    assert.equal(Data.getMapping('parts.' + type + '.generation').mode, 'prototype_scale');
  }
});

test('ammunition manufacture keeps the known material ratio while labeling its unknown original batch timing', () => {
  const i = Data.INDUSTRY;
  assert.equal(i.sulfurPerBatch, 1);
  assert.equal(i.ammoPerBatch, 20);
  assert.equal(i.ammoPerBatch / i.batchSeconds, Data.readKnown('recipe_ammo', 'production_rate_per_s'));
  assert.equal(Data.getMapping('industry.batchSeconds').mode, 'prototype_tuning');
  assert.equal(Data.getMapping('industry.batchSeconds').sourceValue, null);
  assert.equal(Data.getEvidence('recipe_ammo', 'processing_time_s').value, null);
  assert.equal(Data.getEvidence('recipe_ammo', 'actual_batch_size').value, null);
  assert.equal(Data.readKnown('recipe_ammo', 'power_use_per_s'), 0.08);
  assert.equal(i.powerPerSecond, 0.48);
  assert.equal(Data.getMapping('industry.powerPerSecond').factor, 6);
  assert.equal(i.sulfurUnitPrice, 2);
  assert.equal(Data.getMapping('industry.sulfurUnitPrice').sourceValue, 20);
  assert.equal(Data.getMapping('industry.salvagePerSector').mode, 'prototype_tuning');
  assert.equal(Data.readKnown('steel', 'base_price_credits'), 25, 'reference data is available without inventing a steel mechanic');
});

test('movement adopts the documented room relationship without silently multiplying it into unrelated combat tuning', () => {
  assert.deepEqual(Data.CREW_MOVEMENT, { baseTilesPerSecond: 3.2, corridorMultiplier: 1, roomMultiplier: 0.5 });
  for (const key of Object.keys(Data.CREW_MOVEMENT)) {
    assert.equal(Data.getMapping('crew.' + key).mode, 'documented_relationship');
    assert.ok(Data.getMapping('crew.' + key).sourceIds.includes('ECON-CREW'));
  }
});

test('the shipped browser bundle and Node bundle expose identical, immutable evidence without runtime fetches', () => {
  const code = fs.readFileSync(path.join(root, 'dist/data.js'), 'utf8');
  const context = vm.createContext({});
  vm.runInContext(code, context, { timeout: 1000 });
  assert.ok(context.StarData, 'standalone script creates its browser export');
  assert.deepEqual(JSON.parse(JSON.stringify(context.StarData.PART_OVERRIDES)), Data.PART_OVERRIDES);
  assert.deepEqual(JSON.parse(JSON.stringify(context.StarData.INDUSTRY)), Data.INDUSTRY);
  assert.equal(context.StarData.SNAPSHOT_DIGEST, Data.SNAPSHOT_DIGEST);
  assert.ok(Object.isFrozen(Data.PART_OVERRIDES.reactor_large));
  assert.ok(Object.isFrozen(Data.getRecord('sulfur').fields.base_price_credits));
  assert.throws(() => { Data.PART_OVERRIDES.reactor_large.batteryPack = 999; }, TypeError);
  assert.throws(() => { Data.getRecord('sulfur').fields.base_price_credits.value = 0; }, TypeError);
});

test('rebuilding the runtime adapter from the reviewed snapshot is deterministic and retains all evidence links', () => {
  const before = fs.readFileSync(path.join(root, 'dist/data.js'));
  execFileSync(process.execPath, [path.join(root, 'scripts/build-game-data.cjs'), '--check'], { cwd: root });
  assert.deepEqual(fs.readFileSync(path.join(root, 'dist/data.js')), before);
  assert.equal(Data.SNAPSHOT_DIGEST, crypto.createHash('sha256').update(snapshotText).digest('hex'));
  assert.equal(Data.SOURCE_METADATA.sourceSha256.length, 64);
  const sourceIds = new Set(snapshot.sources.map(s => s.id));
  for (const record of snapshot.records) {
    for (const ids of Object.values(record.evidence)) {
      for (const id of ids) assert.ok(sourceIds.has(id), record.id + ' evidence source exists');
    }
  }
});
