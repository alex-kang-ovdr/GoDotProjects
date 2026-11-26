import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game, BUILDINGS, CYCLE_SECONDS } from '../../../Web/engine.js';
import { clone, at, buildingAt, close, finiteState, advance, until } from './helpers.mjs';
import { command, establishFrontierColony } from './scenarios.mjs';

const legacy = name => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const newCounters = ['oxygenCompressed','oxygenRefilled','portableOxygenUsed','protectedSeconds',
  'trainingPointsSpent','bedroomRestSeconds','messhallMeals','greenhouseHarvests'];

let frontierSnapshot;
function preparedFrontier() {
  // The reusable source is a real new-game route. Controlled variants below are boundary tests only.
  frontierSnapshot ||= establishFrontierColony().serialize();
  const game = new Game(73, 'breath-4.1');
  game.load(clone(frontierSnapshot));
  return game;
}

function rejectsAtomically(game, input, label) {
  const before = clone(game.serialize()), original = clone(input);
  assert.throws(() => game.load(input), undefined, `${label}: malformed save must be refused`);
  assert.deepEqual(game.serialize(), before, `${label}: current colony is unchanged`);
  assert.deepEqual(input, original, `${label}: caller's input is unchanged`);
}

function finish(game, plans, message = 'reachable construction did not finish') {
  until(game, () => plans.every(b => b.progress === 1), CYCLE_SECONDS * 3, message);
}

let bedroomSnapshot;
function bedroomColony() {
  if (!bedroomSnapshot) {
    const game = new Game(73, 'breath-4.1'), ceiling = [];
    for (let x = 14; x <= 19; x++) ceiling.push(command(game, 'tile', x, 9));
    finish(game, ceiling);
    finish(game, [[14,10],[19,10]].map(([x,y]) => command(game, 'tile', x, y)));
    finish(game, [[14,11],[19,11]].map(([x,y]) => command(game, 'door', x, y)));
    assert.equal(game.roomAt(15,11)?.type, 'bedroom');
    assert.equal(game.roomAt(15,11)?.valid, true);
    bedroomSnapshot = game.serialize();
  }
  const game = new Game(73, 'breath-4.1');
  game.load(clone(bedroomSnapshot));
  return game;
}

function boundaryNeeds(game, first = {}) {
  // Controlled needs/positions isolate a particular transition; never used by the public winning route.
  for (const c of game.crew) {
    assert.ok(game.setCrewRole(c.id, 'balanced'));
    assert.ok(game.setCrewSchedule(c.id, 'auto').ok);
    assert.ok(game.setCrewMaskMode(c.id, 'off').ok);
  }
  advance(game, .2); // Refresh the current community/frontier conditions after changing the schedules.
  for (const c of game.crew) assert.ok(game.setCrewRole(c.id, 'balanced'));
  const input = game.serialize();
  for (const c of input.crew) Object.assign(c, {
    x:24.5, y:11.5, health:100, hunger:100, energy:80, breath:100, stress:20, bladder:0, hygiene:100,
  });
  Object.assign(input.crew[0], first);
  game.load(input);
  return game;
}

const roomQuantity = (game, room, key) => room.cells.reduce((sum,index) => sum + game.cells[index][key], 0);

test('v4 adds safe expansion without granting free oxygen, experience or room progress', () => {
  const game = new Game(73, 'breath-4.1');
  assert.equal(game.version, 4);
  assert.equal(game.objectives.length, 20);
  assert.deepEqual(game.objectives.filter(o => o.stage === 5).map(o => [o.id, o.target]),
    [['rooms',2],['training',3],['portable',30],['frontier',180]]);
  assert.equal(BUILDINGS.oxygenDock.power, 8);
  assert.equal(BUILDINGS.oxygenDock.unlock, 45);
  assert.deepEqual(BUILDINGS.door.cost, { rock:6, metal:4 });
  assert.equal(game.frontier.target, 180);
  assert.equal(game.frontier.seconds, 0);
  assert.equal(game.equipment.stored, 0);
  assert.equal(game.equipment.carried, 0);
  assert.equal(game.stats.totalSkillRanks, 0);
  for (const key of newCounters) assert.equal(game.production[key], 0, `${key} starts empty`);
  for (const crew of game.crew) {
    assert.equal(crew.experience, 0);
    assert.equal(crew.level, 0);
    assert.equal(crew.skillPoints, 0);
    assert.deepEqual(crew.skills, {dig:0, engineering:0, life:0});
    assert.equal(crew.portableOxygen, 0);
    assert.equal(crew.maskMode, 'auto');
    assert.equal(game.trainCrew(crew.id, 'dig').ok, false, 'training requires an earned point');
  }
  assert.equal(game.setDoorMode(-1, 'locked').ok, false);
  assert.equal(game.setCrewMaskMode(game.crew[0].id, 'always').ok, false);
  assert.equal(game.trainCrew(game.crew[0].id, 'teleport').ok, false);
  advance(game, 8);
  assert.ok(game.crew.every(c => c.experience === 0), 'idle time and walking grant no productive work XP');
  finiteState(game);
});

for (const filename of ['v3-progress.json', 'v3-victory.json']) {
  test(`authentic ${filename} migrates without rewriting the played colony or inventing frontier progress`, () => {
    const input = legacy(filename), original = clone(input), game = new Game(91, 'breath-4.1');
    assert.equal(input.version, 3, 'this fixture was saved by the original v3 engine');
    assert.notEqual(game.load(input), false);
    assert.deepEqual(input, original);
    assert.equal(game.version, 4);
    assert.equal(game.seed, input.seed);
    assert.equal(game.time, input.time);
    assert.deepEqual(game.cells, input.cells, 'all terrain, fluids and infrastructure survive migration');
    for (const [key,value] of Object.entries(input.resources)) {
      const expected = key === 'hydrogen' ? value * 0.21875 : value;
      close(game.resources[key],expected,`${key} survives the gas-mass migration`);
    }
    assert.deepEqual(game.tasks, input.tasks);
    assert.deepEqual(game.debris, input.debris);
    for (const [key,value] of Object.entries(input.production)) {
      const expected = ['hydrogenProduced','hydrogenConsumed'].includes(key) ? value * 0.21875 : value;
      close(game.production[key],expected,`production.${key} survives the gas-mass migration`);
    }
    for (const old of input.buildings) {
      const current = game.buildings.find(b => b.id === old.id);
      for (const [key,value] of Object.entries(old)) assert.deepEqual(current[key], value, `building ${old.id}.${key} survives`);
    }
    for (const old of input.crew) {
      const current = game.crew.find(c => c.id === old.id);
      for (const [key,value] of Object.entries(old)) assert.deepEqual(current[key], value, `crew ${old.id}.${key} survives`);
      assert.equal(current.experience, 0);
      assert.equal(current.skillPoints, 0);
      assert.equal(current.portableOxygen, 0);
      assert.equal(current.maskMode, 'auto');
    }
    for (const goal of input.objectives) assert.equal(game.objectives.find(o => o.id === goal.id).done, goal.done);
    assert.equal(game.objectives.length, 20);
    assert.equal(game.won, false, 'the preserved old victory continues into four new goals');
    assert.ok(game.objectives.filter(o => o.stage === 5).every(o => !o.done));
    for (const key of newCounters) assert.equal(game.production[key], 0);
    const saved = game.serialize(), restored = new Game(1, 'breath-4.1');
    restored.load(clone(saved));
    assert.deepEqual(restored.serialize(), saved, 'the converted v4 save round-trips exactly');
    advance(restored, 3);
    finiteState(restored);
  });
}

test('new equipment, XP and continuous frontier state reject corruption atomically', () => {
  const game = preparedFrontier(), saved = game.serialize();
  const changes = [
    ['negative portable contents', s => { s.crew[0].portableOxygen = -1; }],
    ['portable over capacity', s => { s.crew[0].portableOxygen = 6.1; }],
    ['invented portable capacity', s => { s.crew[0].portableCapacity = 100; }],
    ['unknown mask mode', s => { s.crew[0].maskMode = 'infinite'; }],
    ['invalid XP', s => { s.crew[0].experience = Infinity; }],
    ['missing earned level', s => { s.crew[0].level = 0; }],
    ['negative points', s => { s.crew[0].skillPoints = -1; }],
    ['rank above cap', s => { s.crew[0].skills.dig = 4; }],
    ['unearned point', s => { s.crew[0].skillPoints += 1; }],
    ['unknown door mode', s => { s.buildings.find(b => b.type === 'door').doorMode = 'ghost'; }],
    ['overfull station', s => { s.buildings.find(b => b.type === 'oxygenDock').oxygenStored = 18.1; }],
    ['invented station capacity', s => { s.buildings.find(b => b.type === 'oxygenDock').oxygenCapacity = 19; }],
    ['oxygen stored by a cot', s => { s.buildings.find(b => b.type === 'cot').oxygenStored = 1; }],
    ['duplicated portable summary', s => { s.equipment.carried += 1; }],
    ['duplicated dock summary', s => { s.equipment.stored += 1; }],
    ['invented transfer history', s => { s.production.oxygenRefilled += 1; }],
    ['oxygen compressed from nowhere', s => { s.production.oxygenCompressed = s.equipment.stored + s.production.oxygenRefilled - 1; }],
    ['invented consumption with matching duration', s => { s.production.portableOxygenUsed += .055; s.production.protectedSeconds += 1; }],
    ['negative compression history', s => { s.production.oxygenCompressed = -1; }],
    ['negative protected time', s => { s.production.protectedSeconds = -1; }],
    ['negative frontier interval', s => { s.frontier.seconds = -1; }],
    ['wrong frontier target', s => { s.frontier.target = 1; }],
  ];
  for (const [label, change] of changes) {
    const input = clone(saved); change(input); rejectsAtomically(game, input, label);
  }
});

test('closed doors retain room gas and water, open doors exchange them, and heat still conducts', () => {
  const game = boundaryNeeds(bedroomColony());
  const doors = game.buildings.filter(b => b.type === 'door');
  for (const door of doors) assert.ok(game.setDoorMode(door.id, 'locked').ok);
  const room = game.roomAt(15,11), input = game.serialize();
  for (const index of room.cells) Object.assign(input.cells[index], { oxygen:1.6, co2:.4, water:.3, temp:32 });
  for (const door of doors) Object.assign(input.cells[door.y * game.w + door.x], { oxygen:.1, co2:0, water:0, temp:22 });
  game.load(input);
  const before = Object.fromEntries(['oxygen','co2','water','temp'].map(key => [key, roomQuantity(game,room,key)]));
  advance(game, 2);
  for (const key of ['oxygen','co2','water']) close(roomQuantity(game,room,key), before[key], `locked room retains ${key}`);
  assert.ok(roomQuantity(game,room,'temp') < before.temp, 'closed doors and surrounding walls still conduct heat');
  const right = buildingAt(game,19,11);
  assert.ok(game.setDoorMode(right.id,'open').ok);
  advance(game, 3);
  assert.equal(right.doorOpen, true);
  assert.ok(roomQuantity(game,room,'oxygen') < before.oxygen, 'open entrance releases oxygen into the corridor');
  assert.ok(roomQuantity(game,room,'co2') < before.co2, 'open entrance exchanges carbon dioxide');
  assert.ok(roomQuantity(game,room,'water') < before.water, 'open entrance passes actual terrain water');
  assert.equal(game.roomAt(15,11).id, room.id);
  assert.equal(game.roomAt(15,11).valid, true, 'a structural entrance remains a room boundary while physically open');
  finiteState(game);
});

test('locked entrances block actual work paths and auto doors reopen for a crossing crew member', () => {
  const game = boundaryNeeds(bedroomColony()), doors = game.buildings.filter(b => b.type === 'door');
  for (const door of doors) assert.ok(game.setDoorMode(door.id,'locked').ok);
  command(game,'dig',11,11);
  advance(game, 4);
  assert.equal(game.tasks.find(t => t.x === 11 && t.y === 11).progress, 0, 'workers cannot cross the locked bedroom');
  assert.ok(game.crew.every(c => c.x >= 19), 'no crew teleports through either locked entrance');
  for (const door of doors) assert.ok(game.setDoorMode(door.id,'auto').ok);
  const right = buildingAt(game,19,11);
  until(game, () => game.crew.some(c => Math.floor(c.x) === 19 && Math.floor(c.y) === 11), 30,
    'an unlocked entrance did not restore the work route');
  assert.equal(right.doorOpen, true, 'auto mode opens during actual transit');
  assert.equal(game.setDoorMode(right.id,'locked').ok, false, 'an occupied door cannot crush or strand its occupant');
  until(game, () => !at(game,11,11).solid, 60, 'the repaired route did not resume the original work');
  finiteState(game);
});

test('room classification uses actual complete structures and a disabled forbidden facility still invalidates it', () => {
  const game = bedroomColony(), id = game.roomAt(15,11).id;
  const farm = command(game,'farm',18,11);
  assert.equal(game.roomAt(15,11).valid, true, 'an unfinished blueprint is not completed furniture');
  finish(game,[farm]);
  assert.equal(game.roomAt(15,11).valid, false, 'a completed farm conflicts with a bedroom');
  assert.ok(game.roomAt(15,11).reasons.length > 0);
  assert.ok(game.toggleBuilding(farm.id));
  assert.equal(game.roomAt(15,11).valid, false, 'switching off a conflicting building cannot manufacture a valid room');
  command(game,'deconstruct',farm.x,farm.y);
  until(game, () => !game.buildings.some(b => b.id === farm.id), 60);
  assert.equal(game.roomAt(15,11).id, id);
  assert.equal(game.roomAt(15,11).valid, true, 'actual demolition restores the original bedroom');
  command(game,'deconstruct',18,9);
  until(game, () => !at(game,18,9).solid, 60);
  assert.equal(game.roomAt(15,11).valid, false, 'a real ceiling breach merges the interior with the oversized surrounding space');
  const replacement = command(game,'tile',18,9);
  finish(game,[replacement]);
  assert.equal(game.roomAt(15,11).valid, true);
  assert.equal(game.roomAt(15,11).id, id, 'repair restores the physical component identity');
  finiteState(game);
});

test('a valid bedroom improves actual bed recovery and a physical breach removes that benefit', () => {
  const bedroom = bedroomColony(), plain = bedroomColony();
  command(plain,'deconstruct',18,9);
  until(plain, () => !at(plain,18,9).solid, 60);
  for (const game of [bedroom,plain]) boundaryNeeds(game, {x:15.5,y:11.5,energy:10,stress:30});
  const before = bedroom.production.bedroomRestSeconds, plainBefore = plain.production.bedroomRestSeconds;
  advance(bedroom, 2);
  advance(plain, 2);
  assert.equal(bedroom.crew[0]._job?.kind, 'rest');
  assert.equal(plain.crew[0]._job?.kind, 'rest');
  assert.ok(bedroom.crew[0].energy > plain.crew[0].energy + 1, 'room bonus changes real energy, not only the displayed room label');
  assert.ok(bedroom.crew[0].stress < plain.crew[0].stress - .25);
  assert.ok(bedroom.production.bedroomRestSeconds > before + 1.5);
  close(plain.production.bedroomRestSeconds, plainBefore, 'ordinary bed rest cannot count as bedroom use');
  finiteState(bedroom); finiteState(plain);
});

test('a dining room counts actual consumed table meals and adds its real stress benefit', () => {
  const dining = new Game(73, 'breath-4.1');
  finish(dining,[command(dining,'mess',20,16)]);
  const ceiling = [];
  for (let x = 16; x <= 22; x++) ceiling.push(command(dining,'tile',x,14));
  finish(dining,ceiling);
  finish(dining,[[16,15],[22,15]].map(([x,y]) => command(dining,'tile',x,y)));
  finish(dining,[[16,16],[22,16]].map(([x,y]) => command(dining,'door',x,y)));
  assert.equal(dining.roomAt(20,16)?.valid,true);
  assert.equal(dining.production.messhallMeals,0,'an unused completed dining room does not fabricate meals');
  const plain = new Game(73, 'breath-4.1'); plain.load(dining.serialize());
  command(plain,'deconstruct',21,14);
  until(plain, () => !at(plain,21,14).solid,60);
  for (const game of [dining,plain]) boundaryNeeds(game,{x:20.5,y:16.5,hunger:40,stress:30});
  const foodBefore = dining.resources.food, before = dining.production.tableMeals;
  until(dining, () => dining.production.tableMeals > before,10);
  until(plain, () => plain.production.tableMeals > before,10);
  assert.equal(dining.production.messhallMeals,1);
  assert.equal(plain.production.messhallMeals,0);
  assert.ok(dining.resources.food < foodBefore - 1,'a meal consumes actual food in addition to normal spoilage');
  close(plain.crew[0].stress - dining.crew[0].stress,3,'dining room adds exactly its extra stress recovery',.05);
  finiteState(dining); finiteState(plain);
});

test('a greenhouse accelerates supplied growth and only actual harvests earn its use counter', () => {
  const greenhouse = new Game(73, 'breath-4.1');
  command(greenhouse,'pipe',31,11);
  finish(greenhouse,[command(greenhouse,'farm',31,11)]);
  const ceiling = [];
  for (let x = 29; x <= 33; x++) ceiling.push(command(greenhouse,'tile',x,9));
  finish(greenhouse,ceiling);
  finish(greenhouse,[[29,10],[33,10]].map(([x,y]) => command(greenhouse,'tile',x,y)));
  finish(greenhouse,[[29,11],[33,11]].map(([x,y]) => command(greenhouse,'door',x,y)));
  assert.equal(greenhouse.roomAt(30,11)?.type,'greenhouse');
  assert.equal(greenhouse.roomAt(30,11)?.valid,true);
  const plain = new Game(73, 'breath-4.1'); plain.load(greenhouse.serialize());
  command(plain,'deconstruct',32,9);
  until(plain, () => !at(plain,32,9).solid,60);
  for (const game of [greenhouse,plain]) {
    boundaryNeeds(game);
    const input = game.serialize();
    for (const b of input.buildings.filter(b => b.type === 'farm')) b.growth = .2;
    game.load(input);
  }
  const beforeWater = greenhouse.resources.water, beforeHarvest = greenhouse.production.greenhouseHarvests;
  advance(greenhouse,10); advance(plain,10);
  const accelerated = buildingAt(greenhouse,30,11).growth - .2;
  const ordinary = buildingAt(plain,30,11).growth - .2;
  close(accelerated / ordinary,1.2,'the actual growth increment is twenty percent faster',.01);
  assert.ok(greenhouse.resources.water < beforeWater,'the growth bonus still needs actual supplied clean water');
  assert.equal(greenhouse.production.greenhouseHarvests,beforeHarvest,'growth alone is not a harvested crop');
  command(greenhouse,'removePipe',31,11);
  command(greenhouse,'removePipe',30,11);
  const halted = buildingAt(greenhouse,30,11).growth;
  advance(greenhouse,5);
  close(buildingAt(greenhouse,30,11).growth,halted,'an unconnected greenhouse cannot grow from remote water');
  command(greenhouse,'pipe',30,11); command(greenhouse,'pipe',31,11);
  until(greenhouse, () => greenhouse.production.greenhouseHarvests > beforeHarvest,CYCLE_SECONDS * 2,
    'reconnected crops did not reach a real staffed harvest');
  assert.ok(greenhouse.production.harvestedFood > 0);
  finiteState(greenhouse); finiteState(plain);
});

test('public commands finish twenty goals after a real dock interruption and sustain ten further cycles', () => {
  const game = preparedFrontier();
  until(game, () => game.frontier.seconds >= 10,CYCLE_SECONDS * 12,
    'actual rooms, training, oxygen use and community never began a healthy frontier interval');
  const dock = game.buildings.find(b => b.type === 'oxygenDock');
  assert.ok(game.toggleBuilding(dock.id));
  advance(game,1);
  assert.equal(game.frontier.healthy,false);
  assert.equal(game.frontier.seconds,0,'losing the current dock condition resets the continuous frontier interval');
  assert.ok(game.frontier.reasons.some(reason => reason.includes('충전소')));
  assert.ok(game.toggleBuilding(dock.id));
  until(game, () => game.won,CYCLE_SECONDS * 20,'the normal route could not recover and complete all twenty goals');
  assert.equal(game.objectives.length,20);
  assert.ok(game.objectives.every(o => o.done));
  assert.equal(game.lost,false);
  assert.equal(game.frontier.seconds,180);
  assert.ok(game.rooms.some(r => r.type === 'bedroom' && r.valid));
  assert.ok(game.rooms.some(r => r.type === 'messhall' && r.valid));
  assert.ok(game.stats.totalSkillRanks >= 3 && game.production.protectedSeconds >= 30);
  assert.ok(game.production.bedroomRestSeconds > 0 && game.production.messhallMeals > 0,
    'the finished colony actually uses the newly recognized rooms');
  const saved = game.serialize(), restored = new Game(1, 'breath-4.1');
  restored.load(clone(saved));
  assert.deepEqual(restored.serialize(),saved,'all twenty completed goals and in-progress equipment/jobs round-trip');
  const before = clone(restored.production), farms = restored.buildings.filter(b => b.type === 'farm' && b.y === 16);
  const harvests = new Map(farms.map(b => [b.id,0])), previous = new Map(farms.map(b => [b.id,b.growth]));
  advance(restored,CYCLE_SECONDS * 10,(g,tick) => {
    assert.ok(g.crew.every(c => c.health > 0 && c.x < 36),'all three crew stay alive on the safe side of the spring barrier');
    for (const farm of farms) {
      assert.ok(at(g,farm.x,farm.y).water < .5,'the lower farms remain outside the flood');
      if (previous.get(farm.id) > .95 && farm.growth < .1) harvests.set(farm.id,harvests.get(farm.id)+1);
      previous.set(farm.id,farm.growth);
    }
    if (tick % 100 === 0) finiteState(g);
  });
  assert.ok(restored.won && !restored.lost);
  assert.ok(restored.crew.every(c => c.health >= 80 && c.hunger > 0));
  assert.ok(restored.foodStatus.total >= 20 && restored.resources.meals >= 3);
  assert.ok(restored.production.mealsCooked > before.mealsCooked);
  assert.ok(restored.production.tableMeals > before.tableMeals);
  assert.ok(restored.production.scheduledRests > before.scheduledRests);
  assert.ok(restored.production.bedroomRestSeconds > before.bedroomRestSeconds);
  assert.ok(restored.production.messhallMeals > before.messhallMeals);
  for (const [id,count] of harvests) assert.ok(count >= 2,`lower farm ${id} actually harvested ${count} times`);
  finiteState(restored);
});
