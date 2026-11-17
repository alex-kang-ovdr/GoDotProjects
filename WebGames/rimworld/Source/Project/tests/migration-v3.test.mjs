import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { ColonyGame } from '../dist/engine.js';

const FIXTURES = [
  ['v1-colony.json', '76e4c1fc6b974ddb0ef9ab621325279414edd8b06d9adcf81c0039cc8d1d19fe'],
  ['v2-colony.json', 'b48520dfe7fcdf7eada664464611d168fd0bafc3b9564b110672977cb0d97fdf'],
];

function assertPreserved(original, current, path = '') {
  if (original === null || typeof original !== 'object') { assert.deepEqual(current, original, path); return; }
  if (Array.isArray(original)) assert.equal(current.length, original.length, `${path}.length`);
  for (const [key, value] of Object.entries(original)) {
    if (!path && key === 'version') continue;
    assertPreserved(value, current[key], path ? `${path}.${key}` : key);
  }
}

test('genuine v1 and v2 releases migrate to the current version without altering existing authoritative data or their files', () => {
  for (const [filename, expectedHash] of FIXTURES) {
    const url = new URL(`./fixtures/${filename}`, import.meta.url);
    const bytes = readFileSync(url);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expectedHash);
    const original = JSON.parse(bytes);
    const callerCopy = structuredClone(original);
    const game = ColonyGame.fromJSON(original);
    assert.equal(game.state.version, 4);
    assertPreserved(original, game.toJSON());
    assert.deepEqual(original, callerCopy, 'migration must not rewrite its caller-owned object');
    for (const pawn of game.state.colonists) {
      assert.equal(pawn.schedule.length, 24);
      assert.equal(pawn.schedule.every(mode => mode === 'anything'), true,
        'an old colony keeps its free schedule rather than acquiring a new work/sleep regime');
      assert.equal(pawn.carryingPawnId, null);
      assert.equal(pawn.carriedBy, null);
      assert.equal(pawn.patientBedId, null);
    }
    assert.deepEqual(game.state.careStats, { rescued: 0, tended: 0, fed: 0 });
    assert.equal(game.state.hazards.incidentCount, 0);
    assert.ok(game.state.hazards.nextIncidentAt >= original.time + 360);
    const restored = ColonyGame.fromJSON(game.toJSON());
    for (const dt of [0.09, 0.31, 0.4, 1.7, 2.3, 0.12]) { game.update(dt); restored.update(dt); }
    assert.deepEqual(restored.toJSON(), game.toJSON(), `${filename}: migrated mid-job future should remain reproducible`);
    assert.equal(createHash('sha256').update(readFileSync(url)).digest('hex'), expectedHash);
  }
});

test('current saves reject missing life fields, impossible schedules, and broken patient references instead of remigrating them', () => {
  const valid = new ColonyGame({ seed: 314159 }).toJSON();
  for (const change of [
    s => { delete s.colonists[0].schedule; },
    s => { s.colonists[0].schedule.pop(); },
    s => { s.colonists[0].schedule[8] = 'missing'; },
    s => { s.colonists[0].recreation = Number.POSITIVE_INFINITY; },
    s => { s.colonists[0].carriedBy = 'absent_rescuer'; },
    s => { s.colonists[0].carryingPawnId = s.colonists[0].id; s.colonists[0].carriedBy = s.colonists[0].id; },
    s => { s.colonists[0].patientBedId = 'absent_bed'; },
    s => { s.careStats.fed = -1; },
  ]) {
    const malformed = structuredClone(valid); change(malformed);
    assert.throws(() => ColonyGame.fromJSON(malformed));
  }
});
