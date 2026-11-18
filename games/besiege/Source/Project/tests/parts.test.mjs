import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PARTS, MISSIONS, ELEVATION_LIMITS, STROKE_LIMITS, makePreset, cloneParts,
  getConnections, getDesignStats, validateDesign,
} from '../dist/parts.js';

const part = (id, type, x, y, z, extra = {}) => ({
  id, type, x, y, z, rot: 0, power: 1, binding: 'all', ...extra,
});

test('campaign catalogue retains land values and adds water and air missions', () => {
  assert.deepEqual(Object.fromEntries(Object.entries(PARTS).map(([id, p]) => [id, p.maxHp])), {
    core: 100, wood: 55, wheel: 50, cannon: 75, brace: 110, hinge: 65,
    float: 65, propeller: 55, wing: 45, piston: 70,
  });
  assert.deepEqual(MISSIONS.map(m => [m.id, m.targetCount, m.budget, m.ammo, m.timeLimit, m.parTime, m.parShots, m.campaign]), [
    ['outpost', 9, 45, 12, 180, 60, 5, true],
    ['gate', 10, 48, 14, 180, 90, 5, true],
    ['citadel', 15, 60, 20, 210, 120, 10, true],
    ['harbor', 0, 65, 0, 150, 55, null, true],
    ['skyway', 0, 70, 0, 150, 45, null, true],
    ['switchback', 0, 55, 0, 150, 45, null, true],
    ['sandbox', 0, null, null, null, null, null, false],
  ]);
  assert.equal(new Set(MISSIONS.map(m => m.id)).size, MISSIONS.length);
  for (const mission of MISSIONS) {
    for (const key of ['name', 'subtitle', 'description', 'timeHint']) assert.ok(mission[key].length > 0);
  }
  assert.deepEqual(MISSIONS.map(m => [m.objective, m.environment, m.recommendedPreset, m.checkpointCount]), [
    ['destroy', 'land', 'rover', 0], ['destroy', 'land', 'rover', 0], ['destroy', 'land', 'rover', 0],
    ['route', 'water', 'boat', 3], ['route', 'air', 'plane', 3], ['route', 'land', 'ram', 4], ['sandbox', 'land', 'lift', 0],
  ]);
  assert.deepEqual(['float', 'propeller', 'wing'].map(type => [PARTS[type].mass, PARTS[type].cost]), [[0.7, 3], [1.5, 5], [0.6, 3]]);
  assert.equal(PARTS.wing.defaultElevation, 6);
});

test('six presets have stable connected graphs and fit their intended mission budgets', () => {
  const expected = {
    rover: { count: 15, cost: 35, mass: 21.7, connections: 18 },
    ram: { count: 19, cost: 39, mass: 25, connections: 26 },
    blank: { count: 1, cost: 5, mass: 3, connections: 0 },
    boat: { count: 19, cost: 47, mass: 18.5, connections: 20 },
    plane: { count: 19, cost: 51, mass: 19.9, connections: 18 },
    lift: { count: 15, cost: 30, mass: 20.2, connections: 18 },
  };
  for (const [name, values] of Object.entries(expected)) {
    const design = makePreset(name);
    const snapshot = JSON.stringify(design);
    assert.equal(validateDesign(design).valid, true, name);
    assert.deepEqual(getDesignStats(design), { cost: values.cost, mass: values.mass, count: values.count });
    assert.equal(getConnections(design).length, values.connections);
    assert.deepEqual(getConnections(design), getConnections([...design].reverse()));
    const mission = MISSIONS.find(m => m.recommendedPreset === name) || MISSIONS[0];
    assert.ok(mission.budget === null || values.cost <= mission.budget);
    assert.equal(JSON.stringify(design), snapshot, 'read helpers must not mutate a design');
  }
});

test('new passive and powered blocks retain ordinary one-cell face connections', () => {
  const design = [part('core', 'core', 0, 0, 0), part('a', 'float', 1, 0, 0),
    part('b', 'propeller', 2, 0, 0), part('c', 'wing', 3, 0, 0)];
  const connections = getConnections(design);
  assert.equal(validateDesign(design).valid, true);
  assert.equal(connections.length, 3);
  assert.ok(connections.every(c => c.kind === 'fixed' && c.strength === 1400));
  const disconnected = cloneParts(design);
  disconnected[3].z = 1;
  assert.equal(validateDesign(disconnected).valid, false, 'diagonal/visual contact must not become an attachment');
});

test('boat separates its buoyancy and plane preserves main and tail incidence', () => {
  const boat = makePreset('boat'), floats = boat.filter(p => p.type === 'float');
  assert.equal(floats.length, 10);
  assert.ok(Math.max(...floats.map(p => p.x)) - Math.min(...floats.map(p => p.x)) >= 4);
  assert.ok(Math.max(...floats.map(p => p.z)) - Math.min(...floats.map(p => p.z)) >= 4);
  assert.ok(boat.find(p => p.type === 'core').y > Math.max(...floats.map(p => p.y)));
  assert.equal(boat.filter(p => p.type === 'propeller').length, 1);
  const plane = makePreset('plane'), wings = plane.filter(p => p.type === 'wing');
  assert.equal(wings.length, 8);
  assert.equal(wings.filter(p => p.elevation === 6).length, 6);
  assert.equal(wings.filter(p => p.elevation === 0).length, 2);
  assert.equal(plane.filter(p => p.type === 'wheel' && p.power === 2).length, 4);
  assert.ok(wings.some(p => p.x < 0) && wings.some(p => p.x > 0));
});

test('one wheel chooses one axial support, while hinge keeps its lower and upper roles', () => {
  const wheelDesign = [
    part('core', 'core', -1, 0, 0), part('wheel', 'wheel', 0, 0, 0),
    part('other', 'wood', 1, 0, 0),
  ];
  assert.deepEqual(getConnections(wheelDesign), [{ a: 'core', b: 'wheel', kind: 'wheel', strength: 1600 }]);
  wheelDesign[1].rot = 1;
  assert.deepEqual(getConnections(wheelDesign), [], 'turning the axle to Z must remove an X-only mount');
  wheelDesign.push(part('rear', 'wood', 0, 0, 1));
  assert.deepEqual(getConnections(wheelDesign), [{ a: 'rear', b: 'wheel', kind: 'wheel', strength: 1600 }]);

  const hingeDesign = [
    part('core', 'core', 0, 0, 0), part('hinge', 'hinge', 0, 1, 0),
    part('payload', 'cannon', 0, 2, 0), part('side', 'wood', 1, 1, 0),
  ];
  assert.deepEqual(getConnections(hingeDesign), [
    { a: 'core', b: 'hinge', kind: 'hinge', strength: 1100 },
    { a: 'hinge', b: 'payload', kind: 'fixed', strength: 1400 },
  ]);
});

test('version 1 designs without elevation remain valid and clone independently', () => {
  const legacy = JSON.parse(JSON.stringify(makePreset('rover')));
  for (const p of legacy) delete p.elevation;
  const snapshot = JSON.stringify(legacy);
  assert.equal(validateDesign(legacy).valid, true);
  assert.equal(ELEVATION_LIMITS.default, 0);
  const copy = cloneParts(legacy);
  copy.find(p => p.type === 'cannon').elevation = 20;
  copy[0].x = 9;
  assert.equal(JSON.stringify(legacy), snapshot);
  assert.deepEqual(getConnections(legacy), getConnections(makePreset('rover')));
});

test('cannon elevation accepts bounds and decimals but rejects malformed import values', () => {
  for (const elevation of [-10, 0, 22.5, 45, undefined]) {
    const design = makePreset('rover');
    design.find(p => p.type === 'cannon').elevation = elevation;
    assert.equal(validateDesign(design).valid, true, `valid elevation ${String(elevation)}`);
  }
  for (const elevation of [-10.001, 45.001, null, '20', NaN, Infinity, -Infinity, {}, []]) {
    const design = makePreset('rover');
    design.find(p => p.type === 'cannon').elevation = elevation;
    const check = validateDesign(design, { allowDisconnected: true });
    assert.equal(check.valid, false, `invalid elevation ${String(elevation)}`);
    assert.ok(check.errors.some(e => e.includes('상하 각도')));
  }
});

test('draft import relaxes topology only, never malformed IDs, core, bounds, or power', () => {
  const draft = [part('core', 'core', 0, 0, 0), part('loose', 'wheel', 9, 0, 9), part('hinge', 'hinge', 6, 4, 6)];
  assert.equal(validateDesign(draft).valid, false);
  const looseCheck = validateDesign(draft, { allowDisconnected: true });
  assert.equal(looseCheck.valid, true);
  assert.ok(looseCheck.warnings.some(e => e.includes('코어에 연결되지 않은')));
  assert.ok(looseCheck.warnings.some(e => e.includes('차축 방향')));
  assert.ok(looseCheck.warnings.some(e => e.includes('바로 아래')));

  const corruptions = [
    d => { d[1].id = d[0].id; }, d => { d[1].id = ''; },
    d => { d[1].id = 4; }, d => { d[0].type = 'wood'; },
    d => { d[1].type = 'core'; }, d => { d[1].type = 'constructor'; },
    d => { d[1].type = { toString: null, valueOf: null }; },
    d => { d[1].x = 13; }, d => { d[1].y = -1; },
    d => { d[1].z = 1.5; }, d => { d[1].rot = 4; },
    d => { d[1].power = Infinity; }, d => { d[1].power = 2.1; },
    d => { d[1].power = 0.2; }, d => { d[1].binding = 'enemy'; },
    d => { Object.assign(d[1], { x: 0, y: 0, z: 0 }); },
    d => { d[1] = null; },
  ];
  for (const corrupt of corruptions) {
    const invalid = cloneParts(draft);
    corrupt(invalid);
    assert.equal(validateDesign(invalid, { allowDisconnected: true }).valid, false, String(corrupt));
  }
  for (const invalid of [null, undefined, {}, [], 'parts']) {
    assert.equal(validateDesign(invalid, { allowDisconnected: true }).valid, false);
  }
  const oversized = Array.from({ length: 101 }, (_, i) => part(`p${i}`, i === 0 ? 'core' : 'wood', i % 11 - 5, 0, Math.floor(i / 11) - 5));
  assert.equal(validateDesign(oversized, { allowDisconnected: true }).valid, false);
});

test('stats use trusted catalogue values and remain finite on malformed previews', () => {
  for (const input of [null, undefined, {}, 'parts', [], [null, [], {}, { type: 'unknown' }, { type: 'constructor' }]]) {
    assert.deepEqual(getDesignStats(input), { cost: 0, mass: 0, count: 0 });
  }
  const tampered = [part('a', 'core', 0, 0, 0, { cost: -100, mass: Infinity }),
    part('b', 'wheel', 1, 0, 0, { cost: NaN, mass: -4 }), null, { type: '__proto__' }];
  assert.deepEqual(getDesignStats(tampered), { cost: 8, mass: 4.4, count: 2 });
  assert.ok(Object.values(getDesignStats(tampered)).every(Number.isFinite));
});

test('piston has a lower guide and upper fixed payload, excludes side welds and wheel supports', () => {
  const rig = [part('core', 'core', 0, 0, 0), part('piston', 'piston', 0, 1, 0),
    part('payload', 'wood', 0, 2, 0), part('side', 'wood', 1, 1, 0)];
  assert.deepEqual(getConnections(rig), [
    { a: 'core', b: 'piston', kind: 'piston', strength: 1800 },
    { a: 'piston', b: 'payload', kind: 'fixed', strength: 1400 },
  ]);
  assert.equal(validateDesign(rig.slice(0, 3)).valid, true);
  const wheelMount = [part('core', 'core', 0, 0, 0), part('wheel', 'wheel', 1, 0, 0), part('piston', 'piston', 1, 1, 0)];
  assert.ok(!getConnections(wheelMount).some(c => c.kind === 'piston'));
  assert.ok(validateDesign(wheelMount).errors.some(error => error.includes('피스톤') && error.includes('바로 아래')));
  const mixedStack = [part('core', 'core', 0, 0, 0), part('lower-hinge', 'hinge', 0, 1, 0),
    part('piston', 'piston', 0, 2, 0), part('upper-hinge', 'hinge', 0, 3, 0), part('payload', 'wood', 0, 4, 0)];
  assert.equal(validateDesign(mixedStack).valid, true);
  assert.ok(getConnections(mixedStack).some(c => c.a === 'lower-hinge' && c.b === 'piston' && c.kind === 'piston'));
  assert.ok(getConnections(mixedStack).some(c => c.a === 'piston' && c.b === 'upper-hinge' && c.kind === 'hinge'));
});

test('piston stroke remains optional for legacy JSON but explicit invalid values are rejected', () => {
  assert.equal(PARTS.piston.defaultStroke, 1.5);
  assert.deepEqual([PARTS.piston.mass, PARTS.piston.cost, STROKE_LIMITS.min, STROKE_LIMITS.max], [1.8, 4, 0.25, 2]);
  for (const stroke of [undefined, 0.25, 0.75, 1.5, 2]) {
    const design = makePreset('lift'); design.find(p => p.type === 'piston').stroke = stroke;
    assert.equal(validateDesign(design).valid, true, `stroke ${stroke}`);
  }
  for (const stroke of [null, '1.5', 0.249, 2.001, NaN, Infinity, {}, []]) {
    const design = makePreset('lift'); design.find(p => p.type === 'piston').stroke = stroke;
    assert.equal(validateDesign(design, { allowDisconnected: true }).valid, false);
  }
  const bypass = [part('core', 'core', 0, 0, 0), part('piston', 'piston', 0, 1, 0), part('payload', 'wood', 0, 2, 0),
    part('a', 'wood', 1, 0, 0), part('b', 'wood', 1, 1, 0), part('c', 'wood', 1, 2, 0)];
  assert.ok(validateDesign(bypass).warnings.some(warning => warning.includes('피스톤을 우회')));
});
