import test from 'node:test';
import assert from 'node:assert/strict';
import { ColonyGame } from '../dist/engine.js';
import { sandbox, placeFixture, issue, setWork, total, advance, until,
  assertResourceNumbers } from './helpers.mjs';

function careFixture(resources = { meals: 15, medicine: 3 }) {
  const game = sandbox(resources);
  const [rescuer, helper, patient] = game.state.colonists;
  Object.assign(rescuer, { x: 18.5, y: 14.5 });
  Object.assign(helper, { x: 17.5, y: 17.5 });
  Object.assign(patient, { x: 26.5, y: 19.5, health: 8, hunger: 90, energy: 60, bleed: 0 });
  const bed = placeFixture(game, 'bed', 14, 12);
  issue(game, 'medicalBed', { x: 14, y: 12, value: true });
  return { game, rescuer, helper, patient, bed };
}

function assertCarryLinks(game) {
  for (const pawn of game.state.colonists) {
    if (pawn.carryingPawnId) {
      const patient = game.state.colonists.find(p => p.id === pawn.carryingPawnId);
      assert.ok(patient && !patient.dead);
      assert.equal(patient.carriedBy, pawn.id);
      assert.equal(pawn.carry, null, 'a resident cannot carry cargo and another resident simultaneously');
      assert.equal(patient.x, pawn.x);
      assert.equal(patient.y, pawn.y);
    }
    if (pawn.carriedBy) {
      const rescuer = game.state.colonists.find(p => p.id === pawn.carriedBy);
      assert.ok(rescuer && !rescuer.dead);
      assert.equal(rescuer.carryingPawnId, pawn.id);
    }
  }
}

function pickup(fixture) {
  const { game, rescuer, patient } = fixture;
  const originalPosition = { x: patient.x, y: patient.y };
  issue(game, 'rescue', { id: rescuer.id, targetId: patient.id });
  assert.equal(patient.x, originalPosition.x, 'the rescue command must not teleport a patient');
  assert.equal(patient.y, originalPosition.y);
  until(game, () => rescuer.carryingPawnId === patient.id, 50, 'the rescuer should walk to the patient and pick them up');
  assertCarryLinks(game);
}

test('automatic rescue transports one patient to one reserved medical bed and enables downed recovery', () => {
  const f = careFixture();
  const { game, rescuer, helper, patient, bed } = f;
  for (const worker of [rescuer, helper]) setWork(game, worker, { rescue: 1 });
  until(game, () => patient.carriedBy !== null, 50, 'automatic rescue should physically pick up the downed resident', () => {
    assert.ok(game.state.colonists.filter(c => c.carryingPawnId === patient.id).length <= 1);
    assert.ok(game.state.colonists.filter(c => c.job?.type === 'rescue' && c.job.targetId === patient.id).length <= 1);
    assertCarryLinks(game);
  });
  const carrier = game.state.colonists.find(c => c.id === patient.carriedBy);
  const pickupPosition = { x: patient.x, y: patient.y };
  assert.equal(carrier.job.bedId, bed.id);
  const toggle = game.command('medicalBed', { x: 14, y: 12, value: false });
  assert.equal(toggle.ok, false, 'a reserved rescue destination cannot change its medical designation mid-carry');
  assert.equal(bed.medical, true);
  until(game, () => patient.patientBedId === bed.id && patient.carriedBy === null, 60,
    'the patient should arrive through slower carried movement', () => assertCarryLinks(game));
  assert.ok(Math.hypot(patient.x - pickupPosition.x, patient.y - pickupPosition.y) > 5);
  assert.equal(patient.x, 14.5);
  assert.equal(patient.y, 12.5);
  assert.equal(carrier.carryingPawnId, null);
  assert.equal(game.state.careStats.rescued, 1);
  assert.equal(game.command('medicalBed', { x: 14, y: 12, value: false }).ok, false);
  const arrivedHealth = patient.health;
  until(game, () => patient.health >= 25 && patient.patientBedId === null, 70,
    'a fed non-bleeding downed patient must have a recovery route out of bed');
  assert.ok(patient.health > arrivedHealth);
  assert.equal(patient.dead, false);
});

test('two patients cannot reserve the same bed while the first patient remains helpless in it', () => {
  const { game, rescuer, helper, patient, bed } = careFixture();
  patient.bleed = 0.02;
  const secondPatient = structuredClone(patient);
  Object.assign(secondPatient, { id: 'fixture_second_patient', name: '추가 환자', x: 25.5, y: 18.5,
    job: null, path: [], carry: null, carryingPawnId: null, carriedBy: null, patientBedId: null });
  game.state.colonists.push(secondPatient);
  for (const worker of [rescuer, helper]) setWork(game, worker, { rescue: 1 });
  const assertBedBooking = () => {
    const bookings = game.state.colonists.filter(c => c.job?.type === 'rescue' && c.job.bedId === bed.id).length
      + game.state.colonists.filter(c => c.patientBedId === bed.id && !c.carriedBy).length;
    assert.ok(bookings <= 1, 'the same bed cannot be booked by two independent patients');
    assertCarryLinks(game);
  };
  until(game, () => [patient, secondPatient].some(p => p.patientBedId === bed.id && !p.carriedBy), 100,
    'one patient should be delivered to the sole bed', assertBedBooking);
  advance(game, 8, assertBedBooking);
  const occupied = [patient, secondPatient].filter(p => p.patientBedId === bed.id);
  assert.equal(occupied.length, 1);
  assert.equal(game.state.careStats.rescued, 1);
});

test('drafting a carrier drops the patient safely once and frees both patient and bed reservations', () => {
  const f = careFixture();
  pickup(f);
  const { game, rescuer, patient, bed } = f;
  const location = { x: rescuer.x, y: rescuer.y };
  issue(game, 'draft', { id: rescuer.id, value: true });
  assert.equal(rescuer.carryingPawnId, null);
  assert.equal(patient.carriedBy, null);
  assert.equal(patient.patientBedId, null);
  assert.ok(Math.hypot(patient.x - location.x, patient.y - location.y) < 1.5);
  assert.equal(Object.values(game.state.reservations).some(r => r.owner === rescuer.id), false);
  issue(game, 'draft', { id: rescuer.id, value: true });
  assert.equal(game.state.careStats.rescued, 0, 'an interrupted delivery is not a completed rescue');
  issue(game, 'medicalBed', { x: 14, y: 12, value: false });
  assert.equal(bed.medical, false, 'the abandoned bed booking must be released');
  assertCarryLinks(game);
});

test('carrier death, patient death, and a destroyed destination all clear reciprocal carry references', () => {
  for (const failure of ['carrier-death', 'patient-death', 'bed-loss']) {
    const f = careFixture();
    pickup(f);
    const { game, rescuer, patient } = f;
    if (failure === 'bed-loss') {
      game.tile(14, 12).building.hp = 1;
      issue(game, 'ignite', { x: 14, y: 12, strength: 0.9 });
      until(game, () => game.tile(14, 12).building === null, 3, 'fire should destroy the destination bed');
    } else {
      const doomed = failure === 'carrier-death' ? rescuer : patient;
      doomed.health = 0.02;
      doomed.bleed = 1;
    }
    until(game, () => !rescuer.carryingPawnId && !patient.carriedBy, 6,
      `${failure} must not leave a ghost carrier or a permanently attached patient`);
    if (failure === 'carrier-death') assert.equal(rescuer.dead, true);
    if (failure === 'patient-death') assert.equal(patient.dead, true);
    assert.equal(game.state.colonists.some(c => c.job?.type === 'rescue' && c.job.targetId === patient.id), false);
    assert.equal(patient.patientBedId, null);
    assertCarryLinks(game);
    assert.doesNotThrow(() => ColonyGame.fromJSON(game.toJSON()), `${failure}: the cleaned-up state must remain loadable`);
  }
});

test('unreachable rescue and tending requests preserve an unrelated active hauling job and its goods', () => {
  const { game, rescuer, patient } = careFixture();
  Object.assign(patient, { x: 25.5, y: 20.5 });
  for (const [x, y] of [[24, 20], [26, 20], [25, 19], [25, 21]]) placeFixture(game, 'wall', x, y);
  game.state.items.push({ id: 'fixture_care_reject_cargo', x: 18, y: 14,
    type: 'wood', count: 9, reservedBy: null });
  setWork(game, rescuer, { haul: 1 });
  until(game, () => rescuer.carry?.type === 'wood', 10, 'the unrelated hauler should be carrying a real stack');
  for (const type of ['rescue', 'tend']) {
    const before = structuredClone({ job: rescuer.job, carry: rescuer.carry,
      path: rescuer.path, reservations: game.state.reservations, resources: game.state.resources });
    const result = game.command(type, { id: rescuer.id, targetId: patient.id });
    assert.equal(result.ok, false);
    assert.deepEqual({ job: rescuer.job, carry: rescuer.carry,
      path: rescuer.path, reservations: game.state.reservations, resources: game.state.resources }, before);
    assert.equal(total(game, 'wood'), 9);
  }
});

test('downing releases cargo once and automatically clears drafted movement orders', () => {
  const game = sandbox();
  const pawn = game.state.colonists[0];
  game.state.items.push({ id: 'fixture_downed_cargo', x: 18, y: 14,
    type: 'wood', count: 9, reservedBy: null });
  setWork(game, pawn, { haul: 1 });
  until(game, () => pawn.carry?.type === 'wood', 10, 'resident should have picked up the stack');
  pawn.health = 10;
  advance(game, 0.5);
  assert.equal(pawn.job, null);
  assert.equal(pawn.carry, null);
  assert.equal(total(game, 'wood'), 9);
  advance(game, 1);
  assert.equal(total(game, 'wood'), 9);
  pawn.health = 100;
  setWork(game, pawn, {});
  issue(game, 'draft', { id: pawn.id, value: true });
  issue(game, 'move', { id: pawn.id, x: 28, y: 14 });
  pawn.health = 10;
  advance(game, 0.5);
  assert.equal(pawn.drafted, false);
  assert.equal(pawn.order, null);
  assert.equal(pawn.path.length, 0);
});

test('care workers deliver one real meal to a helpless patient and interrupted feeding preserves freshness', () => {
  for (const interrupt of [false, true]) {
    const { game, helper: doctor, patient, bed } = careFixture({ meals: 2, rawfood: 3, medicine: 0 });
    Object.assign(patient, { x: 14.5, y: 12.5, health: 1, hunger: 10, patientBedId: bed.id });
    setWork(game, doctor, { doctor: 1 });
    const originalHunger = patient.hunger;
    until(game, () => doctor.job?.type === 'feed' && doctor.carry?.type === 'meals', 35,
      'the doctor should physically collect a meal for the helpless patient');
    assert.equal(total(game, 'meals'), 2, 'fetching moves food; it does not yet consume it');
    const freshness = doctor.carry.freshness;
    if (interrupt) {
      issue(game, 'draft', { id: doctor.id, value: true });
      assert.equal(total(game, 'meals'), 2);
      assert.equal(game.state.careStats.fed, 0);
      assert.ok(patient.hunger <= originalHunger, 'interrupted delivery cannot grant free nutrition');
      assert.ok(game.state.items.filter(i => i.type === 'meals').every(i => i.freshness <= freshness));
      assert.equal(Object.values(game.state.reservations).some(r => r.owner === doctor.id), false);
    } else {
      until(game, () => game.state.careStats.fed === 1, 30, 'the delivered meal should actually feed the patient');
      assert.equal(total(game, 'meals'), 1);
      assert.equal(total(game, 'rawfood'), 3);
      assert.ok(patient.hunger > 50);
    }
    assertResourceNumbers(game);
  }
});

test('manual tending takes travel and work, uses one medicine, and permits healthy residents to prefer ordinary beds', () => {
  const { game, helper: doctor, patient, bed } = careFixture({ meals: 10, medicine: 2 });
  Object.assign(patient, { health: 45, bleed: 0.12 });
  const before = patient.health;
  issue(game, 'tend', { id: doctor.id, targetId: patient.id });
  assert.equal(patient.health, before, 'a tend command is not an instant heal');
  until(game, () => game.state.careStats.tended >= 1, 70, 'manual tending should finish using a carried medicine');
  assert.equal(total(game, 'medicine'), 1);
  assert.equal(patient.bleed, 0);
  assert.ok(patient.health > 70 && patient.health <= 100);
  const healthy = game.state.colonists[0];
  const ordinary = placeFixture(game, 'bed', 21, 15);
  Object.assign(healthy, { x: 14.5, y: 13.5, health: 100, energy: 8, hunger: 100 });
  until(game, () => healthy.job?.type === 'rest', 10, 'a tired healthy resident should find a bed');
  assert.equal(healthy.job.targetId, ordinary.id, 'a nearby medical bed should remain available for patients');
  assert.notEqual(healthy.job.targetId, bed.id);
});

test('mid-patient-carry saves retain reciprocal references, paths, reservations, and exact future behavior', () => {
  const f = careFixture();
  pickup(f);
  const { game, patient } = f;
  game.update(0.037);
  const encoded = JSON.stringify(game.toJSON());
  const data = JSON.parse(encoded);
  const restored = ColonyGame.fromJSON(data);
  assert.deepEqual(restored.toJSON(), game.toJSON());
  assert.ok(restored.state.colonists.find(p => p.id === patient.id).carriedBy);
  for (const dt of [0.03, 0.17, 0.8, 1.9, 0.11, 3.4]) {
    game.update(dt); restored.update(dt);
    assertCarryLinks(game); assertCarryLinks(restored);
  }
  assert.deepEqual(restored.toJSON(), game.toJSON());
  assert.equal(JSON.stringify(data), encoded, 'loading and continuing cannot mutate the imported snapshot');
  const badRef = structuredClone(data);
  badRef.colonists.find(p => p.id === patient.id).carriedBy = null;
  assert.throws(() => ColonyGame.fromJSON(badRef));
  const dualCargo = structuredClone(data);
  dualCargo.colonists.find(p => p.carryingPawnId).carry = { type: 'wood', count: 1 };
  assert.throws(() => ColonyGame.fromJSON(dualCargo));
});
