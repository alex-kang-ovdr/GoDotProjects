import test from 'node:test';
import assert from 'node:assert/strict';
import { ColonyGame } from '../dist/engine.js';
import { issue, setWork, until, assertResourceNumbers } from './helpers.mjs';

// End-to-end scenario: all damage, material use, travel, treatment, and leisure
// result from public commands and elapsed simulation. No authoritative state is
// edited. Explicit scenario ignition is the same validated debug command exposed
// by the engine; the regular player UI never receives an ignition button.
test('public commands connect a real fire injury to evacuation, medical care, extinguishing, and recreation', t => {
  const game = new ColonyGame({ seed: 314159, difficulty: 'standard' });
  const [patient, rescuer, doctor] = game.state.colonists;
  for (const pawn of game.state.colonists) {
    setWork(game, pawn, {});
    issue(game, 'schedulePreset', { id: pawn.id, preset: 'free' });
  }
  issue(game, 'cancel', { x: 16, y: 15 }); // Keep this natural tree as the scenario's genuine fuel.
  setWork(game, patient, { build: 1 });
  issue(game, 'build', { kind: 'bed', x: 25, y: 13 });
  issue(game, 'build', { kind: 'horseshoes', x: 24, y: 15 });
  until(game, () => game.tile(25, 13).building?.complete && game.tile(24, 15).building?.complete,
    100, 'the medical bed and leisure post must be built with actual starting supplies and labor');
  issue(game, 'medicalBed', { x: 25, y: 13, value: true });
  for (const [pawn, x, y] of [[patient, 16, 15], [rescuer, 17, 15], [doctor, 16, 14]]) {
    setWork(game, pawn, {});
    issue(game, 'draft', { id: pawn.id, value: true });
    issue(game, 'move', { id: pawn.id, x, y });
  }
  until(game, () => game.state.colonists.every(p => p.path.length === 0), 35,
    'residents should reach the scenario site through real paths');
  for (const pawn of game.state.colonists) issue(game, 'hold', { id: pawn.id });
  assert.equal(game.tile(16, 15).feature, 'tree');
  const healthyBefore = patient.health;
  issue(game, 'ignite', { x: 16, y: 15, strength: 0.95 });
  until(game, () => patient.health < 15, 35, 'real overlapping fire damage should incapacitate the exposed resident');
  assert.ok(patient.health < healthyBefore && !patient.dead);
  assert.equal(patient.drafted, false);
  assert.equal(patient.bleed, 0, 'fire injury alone must not invent a bleeding wound');
  for (const pawn of [rescuer, doctor]) issue(game, 'draft', { id: pawn.id, value: false });
  setWork(game, rescuer, { rescue: 1, firefight: 1 });
  setWork(game, doctor, { doctor: 1, firefight: 2, rescue: 2 });
  const medicineBefore = game.state.resources.medicine;
  issue(game, 'rescue', { id: rescuer.id, targetId: patient.id });
  issue(game, 'prioritize', { id: doctor.id, x: 16, y: 15 });
  let sawCarriedPatient = false;
  until(game, () => game.state.careStats.rescued >= 1 && game.state.careStats.tended >= 1
    && game.state.hazards.extinguished >= 1 && !patient.carriedBy && patient.health >= 25, 110,
    'the staged team should extinguish, carry the patient to bed, and complete real treatment', () => {
      if (patient.carriedBy) {
        sawCarriedPatient = true;
        const carrier = game.state.colonists.find(p => p.id === patient.carriedBy);
        assert.equal(patient.x, carrier.x);
        assert.equal(patient.y, carrier.y);
      }
      assert.equal(patient.dead, false, 'prompt evacuation should leave a survivable recovery path');
      assertResourceNumbers(game);
    });
  assert.equal(sawCarriedPatient, true);
  assert.ok(game.state.resources.medicine < medicineBefore);
  until(game, () => game.state.tiles.every(tile => tile.fire === 0), 100, 'remaining fires should be cleared');
  const post = game.tile(24, 15).building;
  const beforeRecreation = rescuer.recreation;
  for (let hour = 0; hour < 24; hour++) issue(game, 'schedule', { id: rescuer.id, hour, mode: 'recreation' });
  let sawPostUse = false;
  until(game, () => sawPostUse && rescuer.recreation >= Math.min(88, beforeRecreation + 8), 75,
    'a recovered crisis should leave time for the built leisure post to restore recreation', () => {
      if (rescuer.job?.type === 'recreate' && rescuer.job.targetId === post.id) sawPostUse = true;
    });
  assert.ok(game.state.colonists.every(pawn => !pawn.dead));
  assertResourceNumbers(game);
  t.diagnostic(JSON.stringify({ at: game.state.time, care: game.state.careStats,
    extinguished: game.state.hazards.extinguished, patientHealth: +patient.health.toFixed(2),
    recreation: +rescuer.recreation.toFixed(2), medicineUsed: medicineBefore - game.state.resources.medicine }));
});
