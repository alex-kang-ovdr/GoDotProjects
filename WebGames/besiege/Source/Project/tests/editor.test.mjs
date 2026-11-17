import test from 'node:test';
import assert from 'node:assert/strict';
import { makePreset, MISSIONS } from '../dist/parts.js';
import { normalizeBlueprint, mirrorPart, planPlacement, planGroupTransform, analyzeDesign } from '../dist/editor.js';

const block = (id, type, x, y, z, extra = {}) => ({ id, type, x, y, z, rot: 0, power: 1, binding: 'all', elevation: 0, ...extra });
const groupFixture = () => [block('core', 'core', 0, 0, 0), block('a', 'wood', 1, 0, 0),
  block('b', 'wheel', 2, 0, 0, { power: 1.3, binding: 'right' }), block('c', 'cannon', 1, 1, 0, { elevation: 22 })];
function freezeDeep(value) {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freezeDeep(child); Object.freeze(value); }
  return value;
}

test('mirrored placement is atomic, creates distinct IDs and reverses motor grouping', () => {
  const parts = makePreset('blank');
  const result = planPlacement(parts, { type: 'wheel', rot: 1, binding: 'left', power: 1 }, { x: -2, y: 0, z: 0 }, { mirror: true });
  assert.equal(result.ok, true); assert.equal(result.parts.length, 3); assert.equal(parts.length, 1);
  assert.equal(new Set(result.parts.map(p => p.id)).size, 3);
  assert.equal(result.parts[2].binding, 'right'); assert.equal(result.parts[2].rot, 3);
  const collision = planPlacement(result.parts, { type: 'wood', rot: 0 }, { x: 2, y: 0, z: 0 }, { mirror: true });
  assert.equal(collision.ok, false); assert.equal(collision.parts, result.parts);
  assert.deepEqual(mirrorPart(mirrorPart(result.parts[1])), result.parts[1]);
});

test('centre-line mirror inserts once and a move retains identity and settings', () => {
  const parts = makePreset('blank');
  const placed = planPlacement(parts, { type: 'cannon', rot: 2, power: 1.7, elevation: 22 }, { x: 0, y: 1, z: 0 }, { mirror: true });
  assert.equal(placed.parts.length, 2);
  const cannon = placed.parts[1];
  const moved = planPlacement(placed.parts, cannon, { x: 1, y: 0, z: 0 }, { movingId: cannon.id });
  assert.equal(moved.ok, true); assert.equal(moved.parts.length, 2); assert.equal(moved.parts[1].id, cannon.id);
  assert.equal(moved.parts[1].elevation, 22); assert.equal(moved.parts[1].power, 1.7);
  assert.equal(placed.parts[1].y, 1, 'planning/moving never mutates the blueprint');
  const rejected = planPlacement(placed.parts, cannon, { x: 0, y: 0, z: 0 }, { movingId: cannon.id });
  assert.equal(rejected.ok, false); assert.equal(rejected.parts, placed.parts);
});

test('draft imports preserve legacy elevation and reject malformed structure', () => {
  const data = { format: 'ironwood-design', version: 1, parts: makePreset('blank') };
  assert.equal(normalizeBlueprint(data).parts[0].elevation, 0);
  const disconnected = planPlacement(data.parts, { type: 'wood' }, { x: 5, y: 0, z: 0 });
  assert.equal(normalizeBlueprint({ ...data, parts: disconnected.parts }).parts.length, 2);
  assert.throws(() => normalizeBlueprint({ ...data, parts: [{ ...data.parts[0], id: undefined }] }));
  assert.throws(() => normalizeBlueprint({ ...data, parts: [{ ...data.parts[0], elevation: 90 }] }));
  for (const field of ['power', 'rot', 'binding', 'elevation']) assert.throws(() => normalizeBlueprint({ ...data, parts: [{ ...data.parts[0], [field]: null }] }));
});

test('build readiness combines actual attachments and mission budget', () => {
  const parts = makePreset('rover');
  const a = analyzeDesign(parts, 45);
  assert.equal(a.ready, true); assert.equal(a.disconnectedIds.length, 0); assert.equal(a.wheelCount, 4); assert.equal(a.cannonCount, 1);
  assert.ok(a.centerOfMass.y > .72); assert.ok(Math.abs(a.centerOfMass.x) < .001);
  assert.equal(analyzeDesign(parts, 1).ready, false);
  const draft = planPlacement(parts, { type: 'wood' }, { x: 7, y: 0, z: 0 }).parts;
  const b = analyzeDesign(draft, null);
  assert.equal(b.ready, false); assert.equal(b.disconnectedIds.length, 1);
});

test('new wing placement defaults to six degrees while explicit flat and legacy angles survive', () => {
  const base = makePreset('blank');
  const placed = planPlacement(base, { type: 'wing' }, { x: 1, y: 0, z: 0 }, { mirror: true });
  assert.equal(placed.ok, true);
  assert.equal(placed.parts.filter(p => p.type === 'wing' && p.elevation === 6).length, 2);
  const moved = planPlacement(placed.parts, { ...placed.parts[1], elevation: 0 }, { x: 2, y: 0, z: 0 }, { movingId: placed.parts[1].id });
  assert.equal(moved.ok, true);
  assert.equal(moved.parts.find(p => p.id === placed.parts[1].id).elevation, 0);
  const data = { format: 'ironwood-design', version: 1, parts: makePreset('plane'), mission: 'skyway' };
  const before = structuredClone(data);
  const parsed = normalizeBlueprint(data);
  assert.deepEqual(parsed.parts, data.parts, 'including explicitly flat tail surfaces');
  assert.equal(parsed.mission, 'skyway');
  assert.deepEqual(data, before);
  const wing = data.parts.find(p => p.type === 'wing');
  delete wing.elevation;
  assert.equal(normalizeBlueprint(data).parts.find(p => p.id === wing.id).elevation, 6);
  for (const invalid of [null, '6', Infinity, 46, -11]) {
    wing.elevation = invalid;
    assert.throws(() => normalizeBlueprint(data));
  }
  const legacy = { format: 'ironwood-design', version: 1, parts: makePreset('rover') };
  for (const p of legacy.parts) delete p.elevation;
  assert.ok(normalizeBlueprint(legacy).parts.every(p => p.elevation === 0));
});

test('new parts mirror atomically with preserved settings and reject invalid placement data', () => {
  for (const type of ['float', 'propeller', 'wing']) {
    const source = makePreset('blank');
    const placed = planPlacement(source, { type, power: 1.7, elevation: 12, rot: 1 }, { x: -1, y: 0, z: 0 }, { mirror: true });
    assert.equal(placed.ok, true, type);
    assert.equal(placed.parts.length, 3);
    assert.equal(new Set(placed.parts.map(p => p.id)).size, 3);
    assert.deepEqual(placed.parts.slice(1).map(p => [p.power, p.elevation, p.rot]), [[1.7, 12, 1], [1.7, 12, 3]]);
    const failed = planPlacement(placed.parts, { type }, { x: -1, y: 1, z: 0 }, { mirror: true });
    assert.equal(failed.ok, true);
    const occupied = planPlacement(failed.parts, { type }, { x: 1, y: 1, z: 0 }, { mirror: true });
    assert.equal(occupied.ok, false);
    assert.equal(occupied.parts, failed.parts);
    assert.equal(source.length, 1);
  }
  const source = makePreset('blank');
  assert.equal(planPlacement(source, { type: { toString: null, valueOf: null } }, { x: 1, y: 0, z: 0 }).ok, false);
  assert.equal(planPlacement(source, { type: 'wing', elevation: null }, { x: 1, y: 0, z: 0 }).ok, false);
  assert.equal(planPlacement(source, { type: 'wing' }, null).ok, false);
});

test('environment diagnostics count new parts and remain advisory for an otherwise valid design', () => {
  const harbor = MISSIONS.find(m => m.id === 'harbor'), skyway = MISSIONS.find(m => m.id === 'skyway');
  const boat = analyzeDesign(makePreset('boat'), harbor.budget, harbor);
  assert.equal(boat.ready, true);
  assert.deepEqual([boat.floatCount, boat.propellerCount, boat.wingCount], [10, 1, 0]);
  assert.deepEqual(boat.mobilityWarnings, []);
  const plane = analyzeDesign(makePreset('plane'), skyway.budget, skyway);
  assert.equal(plane.ready, true);
  assert.deepEqual([plane.floatCount, plane.propellerCount, plane.wingCount], [0, 1, 8]);
  assert.deepEqual(plane.mobilityWarnings, []);
  for (const mission of [harbor, skyway]) {
    const wrongVehicle = analyzeDesign(makePreset('rover'), mission.budget, mission);
    assert.equal(wrongVehicle.ready, true, 'environment recommendations are not hard locks');
    assert.ok(wrongVehicle.mobilityWarnings.length >= 2);
    assert.ok(wrongVehicle.mobilityWarnings.every(w => wrongVehicle.warnings.includes(w)));
  }
  assert.equal(analyzeDesign(makePreset('plane'), 1, skyway).ready, false, 'budget is still enforced');
  const asymmetric = planPlacement(makePreset('blank'), { type: 'wing', elevation: 30 }, { x: 1, y: 0, z: 0 }).parts;
  const advice = analyzeDesign(asymmetric, null, skyway);
  assert.ok(advice.mobilityWarnings.some(w => w.includes('양쪽')));
  assert.ok(advice.mobilityWarnings.some(w => w.includes('설치각')));
  for (const invalid of [null, undefined, [null], [{ type: 'wing', x: Infinity, y: 0, z: 0 }]]) {
    const preview = analyzeDesign(invalid, null, skyway);
    assert.equal(preview.ready, false);
    assert.ok(Object.values(preview.centerOfMass).every(Number.isFinite));
  }
});

test('piston import and placement default stroke while copying preserves an authored stroke', () => {
  const data = { format: 'ironwood-design', version: 1, mission: 'sandbox', parts: makePreset('lift') };
  const piston = data.parts.find(p => p.type === 'piston');
  delete piston.stroke;
  assert.equal(normalizeBlueprint(data).parts.find(p => p.id === piston.id).stroke, 1.5);
  for (const invalid of [null, '1.5', 0, 2.1, Infinity]) {
    piston.stroke = invalid; assert.throws(() => normalizeBlueprint(data));
  }
  const placed = planPlacement(makePreset('blank'), { type: 'piston' }, { x: 0, y: 1, z: 0 });
  assert.equal(placed.ok, true); assert.equal(placed.parts[1].stroke, 1.5);
  placed.parts[1].stroke = 0.75;
  const copy = planGroupTransform(placed.parts, [placed.parts[1].id], { kind: 'copy', delta: { x: 2, y: 0, z: 0 } });
  assert.equal(copy.ok, true); assert.equal(copy.parts.at(-1).stroke, 0.75);
  const report = analyzeDesign(makePreset('lift'), null, MISSIONS.find(m => m.id === 'sandbox'));
  assert.equal(report.ready, true); assert.equal(report.pistonCount, 1); assert.deepEqual(report.warnings, []);
});

test('group move and rotation use one atomic occupancy transaction and preserve source data', () => {
  const source = freezeDeep(groupFixture()), selected = ['a', 'b', 'c'];
  const moved = planGroupTransform(source, selected, { kind: 'move', delta: { x: 1, y: 0, z: 0 } });
  assert.equal(moved.ok, true, 'the group may enter cells vacated by another selected part');
  assert.deepEqual(moved.parts.filter(p => selected.includes(p.id)).map(p => [p.id, p.x, p.y, p.z]), [['a', 2, 0, 0], ['b', 3, 0, 0], ['c', 2, 1, 0]]);
  assert.equal(source[1].x, 1);
  assert.equal(analyzeDesign(moved.parts).valid, false, 'a disconnected draft is permitted by the planner');
  const rotated = planGroupTransform(source, selected, { kind: 'rotate', pivot: { x: 1, y: 0, z: 0 } });
  assert.equal(rotated.ok, true);
  assert.deepEqual(rotated.parts.find(p => p.id === 'b'), { ...source[2], x: 1, z: -1, rot: 1 });
  assert.equal(rotated.parts.find(p => p.id === 'c').elevation, 22);
  const restored = planGroupTransform(rotated.parts, selected, { kind: 'rotate', pivot: { x: 1, y: 0, z: 0 }, turns: -1 });
  assert.deepEqual(restored.parts, source);
  for (const command of [{ kind: 'move', delta: { x: 0, y: 0, z: 0 } }, { kind: 'rotate', pivot: { x: 1, y: 0, z: 0 }, turns: 4 }]) {
    const noOp = planGroupTransform(source, selected, command);
    assert.equal(noOp.ok, true); assert.equal(noOp.changed, false); assert.equal(noOp.parts, source);
  }
});

test('group reflection uses world X=0 and copying creates independent selected IDs', () => {
  const source = freezeDeep(groupFixture()), selected = ['a', 'b', 'c'];
  const reflected = planGroupTransform(source, selected, { kind: 'mirror', pivot: { x: 10, y: 0, z: 0 } });
  assert.equal(reflected.ok, true);
  assert.equal(reflected.parts.find(p => p.id === 'b').x, -2);
  assert.equal(reflected.parts.find(p => p.id === 'b').binding, 'left');
  assert.deepEqual(planGroupTransform(reflected.parts, selected, { kind: 'mirror' }).parts, source);
  let next = 1;
  const copied = planGroupTransform(source, selected, { kind: 'copy', delta: { x: 0, y: 0, z: 3 }, createId: () => `copy-${next++}` });
  assert.equal(copied.ok, true);
  assert.deepEqual(copied.selectedIds, ['copy-1', 'copy-2', 'copy-3']);
  assert.deepEqual(copied.addedIds, copied.selectedIds);
  assert.deepEqual(copied.parts.slice(0, source.length), source);
  assert.equal(copied.parts.at(-1).elevation, 22);
  copied.parts[1].power = 2;
  assert.equal(source[1].power, 1);
  const deleted = planGroupTransform(source, selected, { kind: 'delete' });
  assert.equal(deleted.ok, true); assert.deepEqual(deleted.parts, [source[0]]);
  assert.deepEqual(deleted.selectedIds, []); assert.deepEqual(deleted.removedIds, selected);
});

test('invalid group commands, any core selection, collisions and bounds never partially modify a design', () => {
  const source = freezeDeep(groupFixture());
  const commands = [
    { kind: 'move', delta: { x: 1, y: 0, z: 0 } }, { kind: 'copy', delta: { x: 0, y: 1, z: 0 } },
    { kind: 'rotate', pivot: { x: 0, y: 0, z: 0 } }, { kind: 'mirror' }, { kind: 'delete' },
  ];
  for (const command of commands) {
    const rejected = planGroupTransform(source, ['core', 'a'], command);
    assert.equal(rejected.ok, false); assert.equal(rejected.parts, source); assert.equal(rejected.changed, false);
  }
  for (const selected of [[], ['missing'], ['a', 'a'], [null]]) {
    assert.equal(planGroupTransform(source, selected, { kind: 'delete' }).ok, false);
  }
  for (const command of [{ kind: 'move', delta: { x: 0.5, y: 0, z: 0 } },
    { kind: 'rotate', pivot: { x: 0.5, y: 0, z: 0 } }, { kind: 'copy', delta: { x: 0, y: 0, z: 0 } }, { kind: 'invalid' }]) {
    const rejected = planGroupTransform(source, ['a', 'b'], command);
    assert.equal(rejected.ok, false); assert.equal(rejected.parts, source);
  }
  const crowded = freezeDeep([...groupFixture(), block('obstacle', 'wood', 1, 0, -1)]);
  assert.equal(planGroupTransform(crowded, ['a', 'b', 'c'], { kind: 'rotate', pivot: { x: 1, y: 0, z: 0 } }).parts, crowded);
  const edge = freezeDeep([block('core', 'core', 0, 0, 0), block('a', 'wood', 11, 0, 0), block('b', 'wood', 12, 0, 0)]);
  const outside = planGroupTransform(edge, ['a', 'b'], { kind: 'move', delta: { x: 1, y: 0, z: 0 } });
  assert.equal(outside.ok, false); assert.equal(outside.parts, edge);
});

test('group copies enforce the whole 100-part limit and reject broken ID generators without hanging', { timeout: 2000 }, () => {
  const full = Array.from({ length: 100 }, (_, i) => block(`p${i}`, i ? 'wood' : 'core', i % 10 - 5, 0, Math.floor(i / 10) - 5));
  let calls = 0;
  const rejected = planGroupTransform(full, ['p1', 'p2'], { kind: 'copy', delta: { x: 0, y: 1, z: 0 }, createId: () => { calls++; return `new-${calls}`; } });
  assert.equal(rejected.ok, false); assert.equal(rejected.parts, full); assert.equal(calls, 0);
  assert.equal(planGroupTransform(full, ['p1'], { kind: 'move', delta: { x: 0, y: 1, z: 0 } }).ok, true);
  const source = groupFixture();
  for (const createId of [() => 'core', () => null, () => { throw new Error('unavailable'); }]) {
    const result = planGroupTransform(source, ['a'], { kind: 'copy', delta: { x: 0, y: 1, z: 3 }, createId });
    assert.equal(result.ok, false); assert.equal(result.parts, source); assert.deepEqual(result.addedIds, []);
  }
});
