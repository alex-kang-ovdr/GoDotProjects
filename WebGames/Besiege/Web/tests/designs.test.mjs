import test from 'node:test';
import assert from 'node:assert/strict';
import { makePreset } from '../dist/parts.js';
import { DESIGN_SLOT_LIMIT, normalizeDesigns, saveDesignSlot, renameDesignSlot, deleteDesignSlot, getDesignSlot } from '../dist/designs.js';

const NOW = '2026-11-14T12:00:00.000Z';
const design = (preset = 'rover', mission = 'outpost') => ({ format: 'ironwood-design', version: 1, mission, parts: makePreset(preset) });
function freezeDeep(value) {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freezeDeep(child); Object.freeze(value); }
  return value;
}

test('legacy quick save migrates once and deleting it cannot resurrect it', () => {
  const legacy = freezeDeep({ ...design('boat', 'harbor'), savedAt: NOW });
  const migrated = normalizeDesigns(null, { legacySaved: legacy });
  assert.equal(migrated.version, 1); assert.equal(migrated.legacyMigrated, true); assert.equal(migrated.slots.length, 1);
  assert.equal(migrated.slots[0].id, 'slot-1'); assert.equal(migrated.slots[0].updatedAt, NOW);
  assert.deepEqual(migrated.slots[0].blueprint, design('boat', 'harbor'));
  assert.deepEqual(normalizeDesigns(migrated, { legacySaved: legacy }), migrated);
  const deleted = deleteDesignSlot(migrated, 'slot-1');
  assert.equal(deleted.ok, true);
  assert.equal(normalizeDesigns(deleted.store, { legacySaved: legacy }).slots.length, 0);
  assert.equal(normalizeDesigns({ corrupt: true }, { legacySaved: legacy }).slots.length, 1);
  const firstVisit = normalizeDesigns(null);
  assert.equal(normalizeDesigns(firstVisit, { legacySaved: legacy }).slots.length, 0, 'later quick saves must not become repeated migrations');
});

test('normalization keeps valid slots when neighbors are corrupt and validates blueprints authoritatively', () => {
  const wrong = design(); wrong.parts[1].id = wrong.parts[0].id;
  const raw = freezeDeep({ version: 1, slots: [
    { id: 'keep', name: '정상', updatedAt: NOW, blueprint: design('plane', 'skyway') },
    { id: 'bad', name: '오류', updatedAt: NOW, blueprint: wrong },
    { id: 'keep', name: '중복', blueprint: design() },
    { id: 'fallback', name: '', updatedAt: 'invalid', blueprint: design('lift', 'unknown') },
  ] });
  const normalized = normalizeDesigns(raw, { legacySaved: design('ram') });
  assert.deepEqual(normalized.slots.map(s => s.id), ['keep', 'fallback']);
  assert.equal(normalized.slots[0].blueprint.mission, 'skyway');
  assert.equal(normalized.slots[1].blueprint.mission, 'outpost');
  assert.ok(normalized.slots[1].name.length > 0);
  assert.equal(normalized.slots[1].updatedAt, '1970-01-01T00:00:00.000Z');
  assert.equal(normalized.slots.length, 2, 'a legacy save must not replace a nonempty named collection');
  assert.deepEqual(normalizeDesigns(JSON.parse(JSON.stringify(normalized))), normalized);
  for (const bad of [null, [], 'slots', { version: 1, slots: null }]) assert.equal(normalizeDesigns(bad).slots.length, 0);
});

test('eight slots never overwrite silently, while explicit replacement changes only its target', () => {
  let store = normalizeDesigns(null);
  for (let i = 0; i < DESIGN_SLOT_LIMIT; i++) {
    const saved = saveDesignSlot(store, design(), { name: '같은 이름', now: NOW });
    assert.equal(saved.ok, true); assert.equal(saved.slotId, `slot-${i + 1}`); store = saved.store;
  }
  const before = structuredClone(store);
  const full = saveDesignSlot(freezeDeep(store), design('lift', 'sandbox'), { name: '아홉 번째', now: NOW });
  assert.equal(full.ok, false); assert.match(full.error, /8개/); assert.deepEqual(full.store, before);
  const replaced = saveDesignSlot(store, design('lift', 'sandbox'), { replaceId: 'slot-3', name: '실험 리프트', now: NOW });
  assert.equal(replaced.ok, true); assert.equal(replaced.slotId, 'slot-3'); assert.equal(replaced.store.slots.length, 8);
  for (const slot of before.slots) if (slot.id !== 'slot-3') assert.deepEqual(getDesignSlot(replaced.store, slot.id), slot);
  assert.equal(getDesignSlot(replaced.store, 'slot-3').blueprint.mission, 'sandbox');
  assert.equal(saveDesignSlot(store, design(), { replaceId: 'missing', name: '실수' }).ok, false);
  assert.deepEqual(store, before);
});

test('rename and delete preserve other slots and enforce text name bounds', () => {
  let store = saveDesignSlot(null, design(), { name: '차량', now: NOW }).store;
  store = saveDesignSlot(store, design('boat', 'harbor'), { name: '배', now: NOW }).store;
  const renamed = renameDesignSlot(freezeDeep(store), 'slot-1', '가'.repeat(40), { now: '2026-11-15T12:00:00Z' });
  assert.equal(renamed.ok, true); assert.equal(getDesignSlot(renamed.store, 'slot-1').name.length, 40);
  assert.equal(getDesignSlot(renamed.store, 'slot-1').updatedAt, '2026-11-15T12:00:00.000Z');
  assert.deepEqual(getDesignSlot(renamed.store, 'slot-2'), getDesignSlot(store, 'slot-2'));
  for (const name of ['', '   ', '가'.repeat(41), null, {}, 'line\nbreak']) {
    assert.equal(renameDesignSlot(store, 'slot-1', name).ok, false);
    assert.equal(saveDesignSlot(store, design(), { name }).ok, false);
  }
  const deleted = deleteDesignSlot(store, 'slot-1');
  assert.equal(deleted.ok, true); assert.deepEqual(deleted.store.slots.map(s => s.id), ['slot-2']);
  assert.equal(deleteDesignSlot(store, 'missing').ok, false);
  assert.equal(renameDesignSlot(store, 'missing', '없음').ok, false);
});

test('untrusted names and IDs remain inert data and loaded blueprints are independent copies', () => {
  const name = '<img src=x onerror=alert(1)>';
  const source = design('lift', 'sandbox');
  const saved = saveDesignSlot(null, source, { name, now: NOW });
  assert.equal(saved.ok, true); assert.equal(saved.store.slots[0].name, name);
  source.parts[0].x = 12;
  assert.equal(saved.store.slots[0].blueprint.parts[0].x, 0);
  const loaded = getDesignSlot(freezeDeep(saved.store), 'slot-1');
  loaded.blueprint.parts[0].x = -12;
  loaded.blueprint.parts.find(p => p.type === 'piston').stroke = 0.25;
  assert.equal(getDesignSlot(saved.store, 'slot-1').blueprint.parts[0].x, 0);
  assert.equal(getDesignSlot(saved.store, 'slot-1').blueprint.parts.find(p => p.type === 'piston').stroke, 1.5);
  const prototypeName = normalizeDesigns({ version: 1, slots: [{ ...saved.store.slots[0], id: '__proto__' }] });
  assert.equal(getDesignSlot(prototypeName, '__proto__').name, name);
  assert.equal({}.blueprint, undefined);
});

test('slot operations reject malformed designs without changing existing data and use injected time', () => {
  const state = saveDesignSlot(null, design(), { name: '원본', now: NOW }).store;
  for (const corrupt of [null, { ...design(), version: 9 }, { ...design(), parts: [] }]) {
    const failed = saveDesignSlot(state, corrupt, { name: '오류', replaceId: 'slot-1', now: NOW });
    assert.equal(failed.ok, false); assert.deepEqual(failed.store, state);
  }
  const a = saveDesignSlot(null, design(), { name: '동일', now: NOW });
  const b = saveDesignSlot(null, design(), { name: '동일', now: NOW });
  assert.deepEqual(a, b, 'the pure module must not depend on wall-clock time or random IDs');
  assert.equal(saveDesignSlot(null, design()).store.slots[0].updatedAt, '1970-01-01T00:00:00.000Z');
  const disconnected = design(); disconnected.parts.push({ ...disconnected.parts[1], id: 'loose', x: 8, z: 8 });
  assert.equal(saveDesignSlot(state, disconnected, { name: '조립 중', now: NOW }).ok, true);
});
