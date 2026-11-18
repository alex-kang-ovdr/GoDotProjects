import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {
  DATA_PROFILES, DEFAULT_DATA_PROFILE, RECONSTRUCTED_OVERRIDES, getCardEvidence,
  RECONSTRUCTION_PATCH_RECORDS, RECONSTRUCTION_BINDINGS, RECONSTRUCTION_BLOCKED,
  RECONSTRUCTION_MANIFEST, assessPatchRecord,
} from '../dist/js/reconstruction.js';

const rows = RECONSTRUCTION_PATCH_RECORDS;
const bomber = rows.find(row => row.card_key === 'bomber' && row.form === 'base');
const bomberBinding = RECONSTRUCTION_BINDINGS.find(binding => binding.cardId === 'bomber');
const poison = {crownDamage: 21, duration: 8, tickInterval: 1, cost: 4, damage: 45};
const minion = {cost: 4, damage: 153, attackInterval: 1.7, hp: 1250, range: 118, speed: 30,
  flying: true, targets: 'buildings', knockbackImmune: true, projectileSpeed: 240};

test('the reviewed partial profile contains nine numeric fields for exactly seven cards', () => {
  assert.deepEqual(RECONSTRUCTED_OVERRIDES, {
    arrows: {crownDamage: 75}, bomber: {damage: 212}, fireball: {crownDamage: 159},
    minion_giant: {cost: 4, damage: 153, attackInterval: 1.7},
    poison: {crownDamage: 21}, spear_goblins: {attackInterval: 1.6}, zap: {crownDamage: 48},
  });
  assert.equal(DEFAULT_DATA_PROFILE, 'reconstructed-v4-lv11');
  assert.equal(DATA_PROFILES[DEFAULT_DATA_PROFILE].referenceLevel, 11);
  assert.equal(DATA_PROFILES[DEFAULT_DATA_PROFILE].originalClientVerified, false);
  assert.throws(() => { RECONSTRUCTED_OVERRIDES.bomber.damage = 999; }, TypeError);
});

test('unstated reference levels never become level-independent fields', () => {
  assert.deepEqual(assessPatchRecord({...bomber, reference_level: null, reference_level_status: 'not_stated'}, bomberBinding),
    {eligible: false, reason: 'reference_level_not_stated'});
  assert.equal(assessPatchRecord({...bomber, reference_level: 12}, bomberBinding).eligible, false);
  assert.equal(assessPatchRecord({...bomber, reference_level_status: undefined}, bomberBinding).eligible, false);
  const spear = rows.find(row => row.card_key === 'spear-goblins');
  const binding = RECONSTRUCTION_BINDINGS.find(row => row.cardId === 'spear_goblins');
  assert.equal(assessPatchRecord(spear, binding).eligible, true);
});

test('a later patch with an unspecified level blocks an earlier numeric value', () => {
  const tombstone = rows.find(row => row.card_key === 'tombstone' && row.value === 4044);
  assert.ok(tombstone.has_later_unspecified_level_change);
  assert.equal(assessPatchRecord(tombstone, null).reason, 'later_unspecified_level_change');
  assert.ok(getCardEvidence('tombstone').blocked.some(row => row.value === 4044 && row.reason === 'later_unspecified_level_change'));
});

test('form, component and unit identities must match the reviewed runtime binding', () => {
  assert.equal(assessPatchRecord({...bomber, form: 'evolution'}, bomberBinding).reason, 'unsupported_form');
  assert.equal(assessPatchRecord({...bomber, component: 'death_bomb'}, bomberBinding).reason, 'component_mismatch');
  assert.equal(assessPatchRecord({...bomber, unit: 'source_speed_unit'}, bomberBinding).reason, 'unit_mismatch');
  assert.equal(assessPatchRecord({...bomber, card_key: 'knight'}, bomberBinding).reason, 'card_key_mismatch');
  assert.equal(assessPatchRecord({...bomber, value: Infinity}, bomberBinding).reason, 'invalid_numeric_value');
});

test('historical and nonofficial values cannot enter the official patch profile', () => {
  assert.equal(assessPatchRecord({...bomber, evidence_status: 'community_snapshot'}, bomberBinding).reason, 'not_official_confirmed');
  assert.equal(assessPatchRecord({...bomber, system: 'archive_level_stats'}, bomberBinding).reason, 'unsupported_evidence_scope');
  assert.equal(assessPatchRecord({...bomber, full_current_card_profile: true}, bomberBinding).reason, 'unsupported_evidence_scope');
  assert.equal(assessPatchRecord({...bomber, has_later_unspecified_level_change: undefined}, bomberBinding).eligible, false);
});

test('hero Knight shield cannot overwrite base Knight body HP', () => {
  const live = {hp: 1000, damage: 145, cost: 3};
  const result = getCardEvidence('knight', DEFAULT_DATA_PROFILE, live);
  assert.equal(result.fields.length, 0);
  assert.ok(result.blocked.some(row => row.value === 512 && row.form === 'hero' && row.component === 'shield'));
  assert.ok(result.prototypeFields.some(row => row.key === 'hp' && row.value === 1000));
  assert.equal(live.hp, 1000);
});

test('Goblins and Ice Spirit remain custom when only level-unstated numbers exist', () => {
  for (const [id, key, value] of [['goblins', 'damage', 125], ['ice_spirit', 'hitpoints', 215]]) {
    const result = getCardEvidence(id, DEFAULT_DATA_PROFILE, {damage: 67, hp: 170});
    assert.equal(result.fields.length, 0);
    assert.ok(result.blocked.some(row => row.key === key && row.value === value && row.reason === 'reference_level_not_stated'));
  }
});

test('Poison applies total 168 as 21 per prototype tick, not 168 per tick', () => {
  const field = getCardEvidence('poison', DEFAULT_DATA_PROFILE, poison).fields[0];
  assert.equal(field.value, 21); assert.equal(field.sourceValue, 168);
  assert.equal(field.evidenceStatus, 'derived'); assert.equal(field.applied, true);
  assert.equal(poison.crownDamage * Math.floor(poison.duration / poison.tickInterval), 168);
  assert.match(field.notes, /원작 틱 시점을 복원한 값은 아님/);
});

test('Poison live duration or tick edits invalidate the total-damage match label', () => {
  for (const live of [{...poison, duration: 4}, {...poison, tickInterval: 2}, {...poison, crownDamage: 100}]) {
    const result = getCardEvidence('poison', DEFAULT_DATA_PROFILE, live);
    assert.equal(result.fields[0].applied, false);
    assert.equal(result.fields[0].matchesEvidence, false);
    assert.ok(result.prototypeFields.some(row => row.key === 'crownDamage'));
  }
});

test('developer edits are visible as divergence without mutating the input or evidence', () => {
  const live = Object.freeze({damage: 333, hp: 330, cost: 2});
  const result = getCardEvidence('bomber', DEFAULT_DATA_PROFILE, live);
  assert.equal(result.fields[0].value, 212);
  assert.equal(result.fields[0].liveValue, 333);
  assert.equal(result.fields[0].applied, false);
  assert.ok(result.prototypeFields.some(row => row.key === 'damage' && row.value === 333));
  assert.equal(RECONSTRUCTED_OVERRIDES.bomber.damage, 212);
  result.fields[0].sourceIds.push('not_a_source');
  assert.ok(!getCardEvidence('bomber', DEFAULT_DATA_PROFILE, live).fields[0].sourceIds.includes('not_a_source'));
});

test('prototype profile never labels a coincidentally equal numeric value as an applied patch', () => {
  const result = getCardEvidence('bomber', 'prototype-v4', {damage: 212});
  assert.equal(result.fields[0].applied, false);
  assert.equal(result.fields[0].matchesEvidence, true);
  assert.equal(result.referenceLevel, null);
  assert.equal(result.partial, true);
});

test('Minion Giant exposes three sourced numbers, two implemented axes and custom missing fields', () => {
  const result = getCardEvidence('minion_giant', DEFAULT_DATA_PROFILE, minion);
  assert.equal(result.fields.length, 3);
  assert.ok(result.fields.every(row => row.applied));
  assert.equal(result.behaviors.length, 2);
  assert.ok(result.behaviors.every(row => row.applied));
  assert.ok(result.prototypeFields.some(row => row.key === 'hp' && row.value === 1250));
  assert.ok(result.blocked.some(row => row.reason === 'unresolved_profile_fields' && row.value.hitpoints === null));
  const changed = getCardEvidence('minion_giant', DEFAULT_DATA_PROFILE, {...minion, knockbackImmune: false});
  assert.equal(changed.behaviors.find(row => row.key === 'knockback-immune').applied, false);
});

test('Vines labels public selection rules separately from custom HP policy and parameters', () => {
  const live = {cost: 4, damage: 90, crownDamage: 30, spellRadius: 80,
    targetSelection: 'highest-hp', maxTargets: 3, stunDuration: 2, groundingDuration: 2};
  const result = getCardEvidence('vines', DEFAULT_DATA_PROFILE, live);
  assert.equal(result.fields.length, 0);
  assert.equal(result.behaviors.length, 3);
  assert.ok(result.behaviors.every(row => row.applied));
  assert.ok(result.prototypeFields.some(row => row.key === 'cost' && row.value === 4));
  assert.ok(result.blocked.some(row => row.value === 70 && row.reason === 'spell_total_schedule_not_reconstructed'));
  assert.match(result.behaviors.find(row => row.key === 'highest-hp-three').notes, /현재 HP.*프로토타입/);
  assert.match(result.behaviors.find(row => row.key === 'nearest-center-tie').notes, /방패 HP 계산은 구현하지 않았습니다/);
});

test('all exported provenance links are available and use only http(s)', () => {
  for (const id of Object.keys(RECONSTRUCTED_OVERRIDES)) {
    const live = id === 'minion_giant' ? minion : id === 'poison' ? poison : RECONSTRUCTED_OVERRIDES[id];
    for (const field of getCardEvidence(id, DEFAULT_DATA_PROFILE, live).fields) {
      assert.ok(field.sourceIds.length); assert.ok(field.recordIds.length); assert.ok(field.sourceUrls.length);
      assert.ok(field.sourceUrls.every(url => /^https?:\/\//.test(url)));
    }
  }
  assert.equal(RECONSTRUCTION_MANIFEST.full_original_database, false);
  assert.equal(RECONSTRUCTION_MANIFEST.original_client_observed, false);
  assert.ok(RECONSTRUCTION_BLOCKED.some(row => row.reason === 'tile_conversion_not_defined'));
});

test('the offline module is exactly reproducible from the pinned small evidence subset', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const result = spawnSync(process.env.PYTHON || 'python', ['scripts/build-reconstruction-data.py', '--check'], {cwd: root, encoding: 'utf8'});
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const manifest = JSON.parse(readFileSync(new URL('../data/reconstruction/manifest.json', import.meta.url)));
  assert.equal(manifest.selected_patch_records, 25);
  assert.equal(manifest.selected_behavior_records, 9);
  assert.equal(manifest.selected_sources, 9);
});
