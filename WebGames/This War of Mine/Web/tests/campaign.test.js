import test from 'node:test';
import assert from 'node:assert/strict';
import * as Core from '../dist/engine.js';
import * as Field from '../dist/expedition.js';

// A reproducible, conservative player policy. No inventory, health, coordinates,
// NPC states, clock, loot quantities or RNG values are assigned in this test.
// Every supply comes from createGame, a paid recipe/trade/visitor, or takeLoot.
const ITINERARY = {
  1: { locationId: 'cottage', boxes: ['cottage_entry', 'cottage_kitchen', 'cottage_linen'] },
  2: { locationId: 'clinic', boxes: ['clinic_aid', 'clinic_store', 'clinic_bandages'] },
  3: { locationId: 'garage', boxes: ['garage_scrap', 'garage_fuel'] },
  4: { locationId: 'apartments', boxes: ['apartments_shared', 'apartments_debris'] },
  5: { locationId: 'warehouse', boxes: ['warehouse_outer'] },
};

function stepFor(expedition, seconds) {
  for (let elapsed = 0; elapsed < seconds - 1e-8; elapsed += .1) {
    assert.equal(expedition.done, false, 'the route must finish before the 100-second deadline');
    Field.stepExpedition(expedition, .1, {});
  }
}

function walkTo(expedition, x, floor) {
  assert.ok(Field.moveTo(expedition, x, floor));
  for (let frames = 0; frames < 1000; frames++) {
    assert.equal(expedition.done, false, 'walking must not use timeout rescue');
    if (!expedition.player.climb && expedition.player.floor === floor && Math.abs(expedition.player.x - x) < 1) return;
    Field.stepExpedition(expedition, .1, {});
    if (expedition.player.blockedDoorId) {
      const result = Field.interact(expedition, { type: 'door', id: expedition.player.blockedDoorId });
      assert.equal(result.ok, true, result.reason);
      Field.moveTo(expedition, x, floor);
    }
  }
  assert.fail(`Could not walk to ${x}, floor ${floor}`);
}

function collectPublicSupplies(context, state, itinerary) {
  const expedition = Field.createExpedition(context, state);
  const source = Object.fromEntries(expedition.loot.map(box => [box.id, { ...box.items }]));
  const taken = {};
  for (const id of itinerary.boxes) {
    const box = expedition.loot.find(entry => entry.id === id);
    assert.ok(box);
    assert.equal(box.owned, false, 'this policy never steals private supplies');
    assert.equal(box.locked, false, 'this policy does not bypass a lock');
    walkTo(expedition, box.x, box.floor);
    assert.ok(Field.getVisibility(expedition).lootIds.includes(box.id));
    stepFor(expedition, .5); // Allow time to choose the visible container.
    const started = Field.interact(expedition, { type: 'loot', id: box.id });
    assert.equal(started.ok, true, started.reason);
    while (expedition.progress) stepFor(expedition, .1);
    assert.equal(expedition.activeLootId, box.id);
    for (const [item, quantity] of Object.entries({ ...box.items })) {
      const result = Field.takeLoot(expedition, box.id, item, quantity);
      assert.equal(result.ok, true, result.reason);
      assert.ok(Core.usedSlots(expedition.bag) <= expedition.capacity);
      taken[item] = (taken[item] || 0) + quantity;
      stepFor(expedition, .4); // Selection and transfer also consume real game time.
    }
    assert.deepEqual(box.items, {}, 'supplies stay depleted in the source container');
  }
  walkTo(expedition, 100, 0);
  assert.ok(expedition.time < 90, 'the route has at least 10 seconds of return margin');
  assert.equal(Field.returnHome(expedition).ok, true);
  const result = Field.expeditionResult(expedition);
  assert.equal(result.dead, false);
  assert.equal(result.late, false);
  assert.equal(result.theft, 0);
  assert.equal(result.killed, 0);
  assert.deepEqual(result.lootTaken, taken);
  assert.deepEqual(result.bag, taken, 'the scavenger left with an empty bag');
  assert.equal(Field.isValidExpedition(expedition), true);
  for (const id of itinerary.boxes) assert.deepEqual(result.locationState.remaining[id], {});
  return { result, seconds: expedition.time, slots: Core.usedSlots(result.bag), source };
}

function runDayAction(state, actorId, actionId, required = true) {
  const action = Core.getActions(state, actorId).find(entry => entry.id === actionId);
  if (!action.available && !required) return false;
  assert.equal(action.available, true, `day ${state.day}: ${actorId}/${actionId}: ${action.reason}`);
  assert.equal(Core.performAction(state, actorId, actionId).ok, true);
  if (action.duration) Core.tickDay(state, action.duration / 12);
  assert.equal(state.phase, 'day', `day ${state.day}: the work policy must fit before 20:00`);
  assert.equal(state.characters.find(c => c.id === actorId).job, null);
  return true;
}

function prepareMeal(state) {
  assert.ok(state.inventory.raw > 0, `day ${state.day}: food must come from finite sources`);
  if (state.inventory.fuel < 2) runDayAction(state, 'yun', 'fuel');
  const waterNeeded = Core.getActions(state, 'mira').find(action => action.id === 'cook').cost.water;
  if (state.inventory.water < waterNeeded) runDayAction(state, 'mira', 'water');
  runDayAction(state, 'mira', 'cook');
}

function manageDay(state, reliefArc = false) {
  const maintenance = [];
  if (state.visitor?.kind === 'trade') {
    if (state.inventory.raw < 8) assert.equal(Core.trade(state, 'food').ok, true);
    if (state.inventory.fuel < 6) assert.equal(Core.trade(state, 'fuel').ok, true);
    assert.equal(Core.chooseVisitor(state, 'leave').ok, true);
  } else if (state.visitor) {
    const choice = state.visitor.id === 'aid' ? 'accept' : 'help';
    const option = state.visitor.options.find(entry => entry.id === choice);
    const canHelp = Object.entries(option.cost || {}).every(([item, quantity]) => state.inventory[item] >= quantity);
    assert.equal(Core.chooseVisitor(state, canHelp ? choice : 'decline').ok, true);
  }

  // Spend real materials on maintenance before optional expansion. A damaged
  // barricade no longer provides its full defense simply because it is level 3.
  if (Core.getShelterStatus(state).integrity <= 75) {
    const before = state.shelterIntegrity;
    runDayAction(state, 'yun', 'repairShelter');
    maintenance.push({ day: state.day, before, after: state.shelterIntegrity });
  }

  if (state.day === 1) {
    runDayAction(state, 'yun', 'buildHeater');
    runDayAction(state, 'yun', 'clear');
    runDayAction(state, 'yun', 'clear');
  }
  if (state.day === 2) {
    runDayAction(state, 'yun', 'clear');
    runDayAction(state, 'yun', 'clear');
    runDayAction(state, 'yun', 'buildBarricade');
  }
  if (state.day === 3) {
    runDayAction(state, 'yun', 'buildBarricade');
    runDayAction(state, 'yun', 'buildCollector');
  }
  if ((state.day === 4 || (reliefArc && state.day === 5)) && state.facilities.barricade < 3) runDayAction(state, 'yun', 'buildBarricade', !reliefArc || state.day === 5);
  if (state.day === 5) runDayAction(state, 'yun', 'buildBed', false);

  for (const person of state.characters) {
    assert.equal(person.alive, true, `day ${state.day}: ${person.name} should still be alive`);
    if (person.illness >= 35 && state.inventory.meds > 0) runDayAction(state, person.id, 'heal');
    if (person.health <= 65 && state.inventory.bandage > 0) runDayAction(state, person.id, 'bandage');
    if (person.fatigue >= 45) runDayAction(state, person.id, 'rest');
    if (person.hunger >= 35) {
      if (state.inventory.meal < 1) prepareMeal(state);
      runDayAction(state, person.id, 'eat');
    }
  }
  if (reliefArc && state.day === 3) runDayAction(state, 'yun', 'buildRadio');
  if (reliefArc && state.day === 4) runDayAction(state, 'mira', 'contactRelief');
  if (reliefArc && state.day === 9) {
    while (state.inventory.meal < 3) prepareMeal(state);
    while (state.inventory.water < 4) runDayAction(state, 'mira', 'water');
    runDayAction(state, 'mira', 'prepareEvacuation');
  }
  // Keep one ready meal per survivor and prepare fuel before returning supplies
  // could arrive. The engine deliberately cannot use tonight's bag for heating.
  while (state.inventory.meal < 3) prepareMeal(state);
  const fuelReserve = Core.getWeather(state).fuelNeeded + 1;
  while (state.inventory.fuel < fuelReserve) runDayAction(state, 'yun', 'fuel');
  if (state.characters.some(person => person.morale < 40)) runDayAction(state, 'mira', 'talk');
  return maintenance;
}

function planNight(state, itinerary) {
  const scavengerId = itinerary ? 'leo' : null;
  const plan = {
    scavengerId,
    locationId: itinerary?.locationId || null,
    loadout: {},
    roles: Object.fromEntries(state.characters.map(person => [person.id, person.id === scavengerId ? 'scavenge' : 'sleep'])),
  };
  const unguarded = Core.getNightForecast(state, plan);
  if (unguarded.raidChance > 0 && unguarded.defense < unguarded.threatMax) plan.roles.yun = 'guard';
  const oneGuard = Core.getNightForecast(state, plan);
  if (oneGuard.raidChance > 0 && oneGuard.defense < oneGuard.threatMax) plan.roles.mira = 'guard';
  const forecast = Core.getNightForecast(state, plan);
  assert.ok(!forecast.raidChance || forecast.defense >= forecast.threatMax, 'the policy plans protection before committing to a night');
  assert.ok(forecast.fuelAvailable >= forecast.fuelNeeded);
  return plan;
}

function simulateCampaign(seed, difficulty = 'standard', reliefArc = false) {
  const state = Core.createGame(seed, { difficulty });
  const voyages = [];
  const collected = {};
  const mapTotals = {};
  const maintenance = [];
  let totalWear = 0;
  let highestHunger = 0;
  let lowestHealth = 100;
  for (let day = 1; day <= 12; day++) {
    assert.equal(state.day, day);
    maintenance.push(...manageDay(state, reliefArc));
    const itinerary = ITINERARY[day];
    const plan = planNight(state, itinerary);
    assert.equal(Core.endDay(state).ok, true);
    const departure = Core.beginNight(state, plan);
    assert.equal(departure.ok, true, departure.reason);
    let result = {};
    if (itinerary) {
      const voyage = collectPublicSupplies(departure.context, state, itinerary);
      result = voyage.result;
      for (const [item, quantity] of Object.entries(result.lootTaken)) collected[item] = (collected[item] || 0) + quantity;
      for (const items of Object.values(voyage.source)) for (const [item, quantity] of Object.entries(items)) mapTotals[item] = (mapTotals[item] || 0) + quantity;
      voyages.push({ day, locationId: itinerary.locationId, containers: itinerary.boxes.length, seconds: Math.round(voyage.seconds * 10) / 10, slots: voyage.slots });
    }
    assert.equal(Core.finishNight(state, result).ok, true);
    assert.equal(Core.isValidSave(state), true, `day ${day} report must be resumable`);
    assert.equal(state.report.deaths.length, 0);
    assert.equal(state.report.raid.damage, 0);
    assert.deepEqual(state.report.raid.stolen, {});
    totalWear += state.report.raid.wear;
    for (const person of state.characters) {
      highestHunger = Math.max(highestHunger, person.hunger);
      lowestHealth = Math.min(lowestHealth, person.health);
    }
    // Preserve source depletion through every day transition and save boundary.
    for (const prior of voyages) {
      for (const id of ITINERARY[prior.day].boxes) assert.deepEqual(state.locations[prior.locationId].remaining[id], {});
    }
    assert.equal(Core.nextDay(state).ok, true);
  }
  assert.equal(state.phase, 'ended');
  assert.equal(state.ending.kind, 'victory');
  assert.equal(state.characters.filter(person => person.alive).length, 3);
  assert.equal(state.stats.scavenges, 5);
  assert.equal(state.stats.thefts, 0);
  assert.equal(state.stats.kills, 0);
  assert.equal(state.difficulty, difficulty);
  assert.deepEqual(state.ending.epilogues, Core.getEpilogues(state));
  assert.equal(Core.isValidSave(state), true);
  for (const [item, quantity] of Object.entries(collected)) assert.ok(quantity <= mapTotals[item]);
  return { seed, state, voyages, collected, mapTotals, highestHunger, lowestHealth, maintenance, totalWear };
}

test('three survivors finish 12 days using only finite real map supplies and legal timed routes', t => {
  for (const seed of [1, 31, 247]) {
    const campaign = simulateCampaign(seed);
    assert.equal(campaign.state.characters.every(person => person.illness === 0), true);
    assert.ok(campaign.highestHunger < 75);
    assert.equal(campaign.lowestHealth, 100);
    if (seed === 31) t.diagnostic(JSON.stringify({ difficulty: 'standard', seed, voyages: campaign.voyages, collected: campaign.collected, health: campaign.state.characters.map(person => person.health), highestHunger: campaign.highestHunger, maintenance: campaign.maintenance, totalWear: campaign.totalWear, finalIntegrity: campaign.state.shelterIntegrity, remaining: campaign.state.inventory }));
  }
});

test('siege is viable with the same finite supplies, paid repairs and forecast-based guards', t => {
  for (const seed of [1, 31, 247]) {
    const campaign = simulateCampaign(seed, 'siege');
    assert.equal(campaign.state.characters.every(person => person.illness === 0), true);
    assert.ok(campaign.highestHunger < 75);
    assert.equal(campaign.lowestHealth, 100);
    assert.ok(campaign.maintenance.length >= 1, 'siege policy must perform actual paid maintenance');
    assert.ok(campaign.totalWear > 25, 'at least enough actual wear occurred to trigger maintenance');
    t.diagnostic(JSON.stringify({ difficulty: 'siege', seed, repairs: campaign.maintenance, totalWear: campaign.totalWear, finalIntegrity: campaign.state.shelterIntegrity, health: campaign.state.characters.map(person => person.health), highestHunger: campaign.highestHunger, remaining: campaign.state.inventory }));
  }
});


test('optional relief arc reaches a prepared evacuation in both difficulties using paid jobs and finite maps', t => {
  for (const difficulty of ['standard', 'siege']) for (const seed of [31, 247]) {
    const campaign = simulateCampaign(seed, difficulty, true);
    const { state } = campaign;
    assert.equal(state.facilities.radio, 1);
    assert.deepEqual(state.relief, { contacted: true, contactDay: 4, deliveryDay: 5, delivered: true, prepared: true, preparedDay: 9 });
    assert.equal(state.ending.route, 'coordinated');
    assert.equal(Core.getReliefStatus(state).completed, 3);
    assert.equal(state.ending.epilogues.every(entry => entry.body.includes('봉인해 둔 물자')), true);
    assert.equal(campaign.lowestHealth, 100);
    assert.equal(state.stats.thefts, 0);
    assert.equal(state.stats.kills, 0);
    t.diagnostic(JSON.stringify({ difficulty, seed, relief: state.relief, daysSurvived: state.stats.daysSurvived, health: state.characters.map(person => person.health), remaining: state.inventory, totalWear: campaign.totalWear }));
  }
});
