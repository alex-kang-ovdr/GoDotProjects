import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../../Web/engine.js';
import { analyzeRooms } from '../../../Web/frontier.js';
import { clone, at, buildingAt, close, finiteState, advance, until } from './helpers.mjs';

// These controlled boundary fixtures isolate equipment and work transitions.
// Research/needs/terrain may be set up explicitly; buildings are constructed by
// ordinary workers, and all tested oxygen is actually compressed and refilled.
// The unmodified new-game winning route is covered in v4-engine.test.mjs.
function boundary(game, edit) {
  const state = game.serialize();
  edit(state);
  state.rooms = analyzeRooms(state);
  state.stats.validRooms = state.rooms.filter(room => room.valid).length;
  state.stats.specializedRoomTypes = new Set(state.rooms.filter(room => room.valid).map(room => room.type)).size;
  state.logistics.stored = ['rock', 'metal', 'algae', 'coal'].reduce((sum, key) => sum + state.resources[key], 0);
  game.load(state);
  return game;
}

function build(game, type, x, y) {
  const result = game.queue(type, x, y);
  assert.ok(result.ok, `${type} at ${x},${y}: ${result.message}`);
  const id = buildingAt(game, x, y).id;
  until(game, () => game.buildings.find(b => b.id === id)?.progress === 1, 90,
    `${type} construction did not complete`);
  return game.buildings.find(b => b.id === id);
}

function toggle(game, building, enabled) {
  if (building.enabled !== enabled) assert.ok(game.toggleBuilding(building.id));
}

function clearWork(game) {
  for (const c of game.crew) {
    assert.ok(game.setCrewRole(c.id, 'balanced'));
    assert.ok(game.setCrewSchedule(c.id, 'auto').ok);
    assert.ok(game.setCrewMaskMode(c.id, 'off').ok);
  }
  return boundary(game, state => {
    state.crew.forEach((c, i) => Object.assign(c, {
      x:21.5 - i, y:11.5, health:100, hunger:100, energy:80,
      breath:100, stress:0, bladder:0, hygiene:100, _idle:0,
    }));
  });
}

let equipmentSnapshot;
function equipmentColony() {
  if (!equipmentSnapshot) {
    const game = new Game(73, 'breath-4.1');
    for (const c of game.crew) assert.ok(game.setCrewMaskMode(c.id, 'off').ok);
    boundary(game, state => { state.stats.research = 45; });
    const battery = build(game, 'battery', 27, 11);
    const dock = build(game, 'oxygenDock', 28, 11);
    toggle(game, dock, false);
    until(game, () => battery.charge >= 1000, 90, 'real manual generation did not charge the battery');
    toggle(game, game.buildings.find(b => b.type === 'generator'), false);
    toggle(game, game.buildings.find(b => b.type === 'farm'), false);
    clearWork(game);
    equipmentSnapshot = game.serialize();
  }
  const game = new Game(73, 'breath-4.1');
  game.load(clone(equipmentSnapshot));
  return game;
}

const dockOf = game => game.buildings.find(b => b.type === 'oxygenDock');
const batteryOf = game => game.buildings.find(b => b.type === 'battery');
const chamberAmount = (game, key = 'oxygen') => [27,28,29,30].reduce((sum, x) => sum + at(game,x,11)[key], 0);

function chamber(game, { oxygen = 1, water = 0, crewInside = false } = {}) {
  return boundary(game, state => {
    const cell = (x, y) => state.cells[y * state.w + x];
    for (let x = 27; x <= 30; x++) {
      Object.assign(cell(x,10), { solid:'rock', oxygen:0, co2:0, water:0, revealed:true });
      Object.assign(cell(x,11), { solid:null, oxygen, co2:0, water, temp:22, revealed:true });
    }
    for (const x of [26,31]) Object.assign(cell(x,11), { solid:'rock', oxygen:0, co2:0, water:0, revealed:true });
    if (crewInside) Object.assign(state.crew[0], { x:28.5, y:11.5, breath:65, _idle:0 });
  });
}

function fillDock(game, target = .71) {
  toggle(game, batteryOf(game), true);
  toggle(game, dockOf(game), true);
  until(game, () => dockOf(game).oxygenStored >= target, 45, 'powered station did not compress real ambient oxygen');
  toggle(game, batteryOf(game), false);
  assert.equal(dockOf(game).enabled, true);
  return dockOf(game).oxygenStored;
}

let portableSnapshot;
function portableColony() {
  if (!portableSnapshot) {
    const game = equipmentColony(), stock = fillDock(game);
    const id = game.crew[0].id;
    assert.ok(game.setCrewMaskMode(id, 'auto').ok);
    until(game, () => dockOf(game).oxygenStored === 0, 30, 'crew did not visit the unpowered station');
    close(game.crew.find(c => c.id === id).portableOxygen, stock, 'station stock really entered the portable tank');
    assert.ok(game.setCrewMaskMode(id, 'off').ok);
    clearWork(game);
    portableSnapshot = game.serialize();
  }
  const game = new Game(73, 'breath-4.1');
  game.load(clone(portableSnapshot));
  return game;
}

test('compression transfers actual ambient oxygen, spends real power, and stops at the source floor', () => {
  const game = chamber(equipmentColony(), { oxygen:.351 });
  const dock = dockOf(game), battery = batteryOf(game);
  toggle(game, dock, true);
  toggle(game, battery, false);
  const initialAir = chamberAmount(game), initialStored = dock.oxygenStored;
  advance(game, .4);
  close(dock.oxygenStored, initialStored, 'connected wire without supplied power cannot compress oxygen');
  close(chamberAmount(game), initialAir, 'unpowered compressor leaves source gas alone');
  assert.equal(dock.active, false);
  toggle(game, battery, true);
  const charge = battery.charge, compressed = game.production.oxygenCompressed;
  advance(game, .1);
  const moved = dock.oxygenStored - initialStored;
  close(moved, .004, 'only the four source cells\' surplus can be compressed');
  close(initialAir - chamberAmount(game), moved, 'station gain equals physical source loss');
  close(game.production.oxygenCompressed - compressed, moved, 'compression counter reports transferred mass');
  close(charge - battery.charge, .8, 'active compression consumes the specified 8W');
  for (const x of [27,28,29,30]) close(at(game,x,11).oxygen, .35, 'compressor preserves source floor');
  advance(game, .5);
  close(dock.oxygenStored, initialStored + moved, 'source-floor standby cannot invent oxygen');
  assert.equal(dock.active, false);
  finiteState(game);
});

test('compression cannot reach oxygen behind a shut door and resumes through the opened entrance', () => {
  const game = equipmentColony();
  const entrance = build(game, 'door', 29, 11);
  clearWork(game);
  chamber(game, { oxygen:.35 });
  boundary(game, state => {
    state.cells[11 * state.w + 29].oxygen = 1;
    state.cells[11 * state.w + 30].oxygen = 1;
  });
  assert.ok(game.setDoorMode(entrance.id, 'locked').ok);
  const dock = dockOf(game), stored = dock.oxygenStored;
  toggle(game, dock, true);
  advance(game, 1);
  close(dock.oxygenStored, stored, 'closed boundary excludes a rich source within geometric radius');
  close(at(game,29,11).oxygen, 1, 'closed door cell keeps its own stored gas');
  close(at(game,30,11).oxygen, 1, 'source across the closed entrance is untouched');
  assert.ok(game.setDoorMode(entrance.id, 'open').ok);
  const air = chamberAmount(game);
  advance(game, .2);
  assert.ok(dock.oxygenStored > stored, 'opening the real gas path permits compression');
  close(air - chamberAmount(game), dock.oxygenStored - stored, 'opening the path does not duplicate oxygen');
  finiteState(game);
});

test('an actual visit refills partial station stock without power and mask-off interrupts without losing contents', () => {
  const game = equipmentColony(), stock = fillDock(game), id = game.crew[0].id;
  const refilled = game.production.oxygenRefilled, compressed = game.production.oxygenCompressed;
  const xp = game.crew[0].experience;
  assert.ok(game.setCrewMaskMode(id, 'auto').ok);
  until(game, () => game.crew.find(c => c.id === id)._job?.kind === 'refillOxygen', 3,
    'eligible crew did not choose the reachable refill job');
  let c = game.crew.find(c => c.id === id);
  assert.equal(c._job?.kind, 'refillOxygen');
  assert.ok(c.path.length > 0, 'refill is a real movement job');
  assert.equal(c.portableOxygen, 0, 'a distant reservation does not transfer gas');
  close(dockOf(game).oxygenStored, stock, 'the station keeps the reserved stock during travel');
  until(game, () => game.crew.find(v => v.id === id).portableOxygen > 0, 20, 'refilling never began after arrival');
  c = game.crew.find(v => v.id === id);
  close(c.x, dockOf(game).x + .5, 'transfer occurs at the station x coordinate');
  close(c.y, dockOf(game).y + .5, 'transfer occurs at the station y coordinate');
  close(c.portableOxygen, .15, 'one .1s step transfers only the allowed amount');
  assert.ok(game.setCrewMaskMode(id, 'off').ok);
  const saved = game.serialize(), restored = new Game(1, 'breath-4.1');
  restored.load(clone(saved));
  assert.deepEqual(restored.serialize(), saved, 'interrupted partial transfer survives save/load exactly');
  const held = restored.crew.find(v => v.id === id).portableOxygen, left = dockOf(restored).oxygenStored;
  advance(restored, 1);
  close(restored.crew.find(v => v.id === id).portableOxygen, held, 'mask-off preserves the carried amount');
  close(dockOf(restored).oxygenStored, left, 'mask-off cancels rather than remotely completing a refill');
  assert.ok(restored.setCrewMaskMode(id, 'auto').ok);
  until(restored, () => dockOf(restored).oxygenStored === 0, 10, 'remaining partial stock did not refill');
  c = restored.crew.find(v => v.id === id);
  close(c.portableOxygen, stock, 'a partial tank transfers only its available contents');
  close(restored.production.oxygenRefilled - refilled, stock, 'each transferred unit is counted once');
  close(restored.production.oxygenCompressed, compressed, 'unpowered refilling adds no compression production');
  close(c.experience - xp, stock / 1.5, 'refill XP comes only from real transfer time, never the walk or interruption');
  assert.equal(restored.equipment.chargingStations, 0);
  finiteState(restored);
});

test('portable oxygen supports actual thin-air and flooded breathing, while safe air and mask-off preserve the tank', () => {
  for (const environment of [{oxygen:.05,water:0}, {oxygen:.8,water:.8}]) {
    const game = chamber(portableColony(), {...environment,crewInside:true}), c = game.crew[0];
    const held = c.portableOxygen, air = chamberAmount(game), used = game.production.portableOxygenUsed;
    const protectedTime = game.production.protectedSeconds, breath = c.breath;
    assert.ok(game.setCrewMaskMode(c.id, 'auto').ok);
    advance(game, 1);
    close(held - c.portableOxygen, .055, 'one actual second consumes the configured portable amount');
    close(game.production.portableOxygenUsed - used, .055, 'use counter tracks real contents removed');
    close(game.production.protectedSeconds - protectedTime, 1, 'protected time counts actual supported breathing');
    close(chamberAmount(game), air, 'portable breathing does not also charge the ambient gas');
    close(c.breath, breath + 18, 'portable oxygen really recovers breath');
    assert.equal(c.usingPortable, true);
    assert.ok(game.setCrewMaskMode(c.id, 'off').ok);
    const offHeld = c.portableOxygen, offBreath = c.breath;
    advance(game, .5);
    close(c.portableOxygen, offHeld, 'off mode preserves oxygen even in an unbreathable environment');
    close(c.breath, offBreath - 3.5, 'off mode restores ordinary breath loss');
    assert.equal(c.usingPortable, false);
    finiteState(game);
  }
  const game = chamber(portableColony(), {oxygen:.8,crewInside:true}), c = game.crew[0];
  const held = c.portableOxygen, air = chamberAmount(game);
  assert.ok(game.setCrewMaskMode(c.id, 'auto').ok);
  advance(game, 1);
  close(c.portableOxygen, held, 'auto mode uses ambient air when it is breathable');
  close(air - chamberAmount(game), .055, 'ordinary ambient breathing remains active');
  assert.equal(c.usingPortable, false);
  finiteState(game);
});

test('the final partial breath conserves all remaining oxygen and an empty tank returns to emergency retreat', () => {
  const game = chamber(portableColony(), {oxygen:.05,crewInside:true}), id = game.crew[0].id;
  assert.ok(game.setCrewMaskMode(id, 'auto').ok);
  until(game, () => game.crew[0].portableOxygen > 0 && game.crew[0].portableOxygen < .055 * .1, 30,
    'expected a partial final breathing step');
  boundary(game, state => { state.crew[0].breath = 50; });
  let c = game.crew[0];
  const last = c.portableOxygen, used = game.production.portableOxygenUsed, protectedTime = game.production.protectedSeconds;
  const duration = last / .055;
  assert.ok(duration > .02 && duration < .08, 'exercise a meaningful partial breath rather than floating-point residue');
  advance(game, .1);
  assert.equal(c.portableOxygen, 0, 'no inaccessible fractional oxygen remains');
  close(game.production.portableOxygenUsed - used, last, 'last step consumes exactly the remaining stock');
  close(game.production.protectedSeconds - protectedTime, duration, 'last step is credited only its real duration');
  close(c.breath, 50 + 18 * duration - 7 * (.1 - duration), 'partial support cannot grant a full step of recovery');
  advance(game, .1);
  assert.equal(c.usingPortable, false);
  close(game.production.portableOxygenUsed - used, last, 'empty equipment cannot continue consuming or protecting');
  boundary(game, state => {
    Object.assign(state.cells[11 * state.w + 26], {solid:null,oxygen:1,co2:0,water:0});
    Object.assign(state.crew[0], {breath:23,_idle:0});
  });
  advance(game, .1);
  c = game.crew[0];
  assert.equal(c._job?.kind, 'breathe', 'empty low-breath crew chooses the real emergency route');
  assert.ok(c.path.length > 0 || c.x < 28.5, 'emergency recovery requires actual movement');
  until(game, () => game.crew[0].breath >= 95, 15, 'crew failed to regain breath in reachable air');
  assert.ok(game.crew[0].x < 28.5, 'the worker actually left the depleted chamber');
  finiteState(game);
});

test('death retains portable stock on the body without continued use and survives a save round-trip', () => {
  const game = chamber(portableColony(), {crewInside:true}), id = game.crew[0].id;
  boundary(game, state => {
    state.crew[0].health = .01;
    state.cells[11 * state.w + 28].temp = 100;
  });
  const held = game.crew[0].portableOxygen, used = game.production.portableOxygenUsed;
  advance(game, .6);
  const dead = game.crew.find(c => c.id === id);
  assert.equal(dead.health, 0);
  assert.equal(dead.usingPortable, false);
  close(dead.portableOxygen, held, 'body retains actual tank contents');
  close(game.production.portableOxygenUsed, used, 'no portable use is invented after death');
  close(game.equipment.carried, game.crew.reduce((sum,c)=>sum+c.portableOxygen,0), 'retained body stock is in the mass summary');
  const saved = game.serialize(), restored = new Game(1, 'breath-4.1');
  restored.load(clone(saved));
  assert.deepEqual(restored.serialize(), saved, 'death and physical oxygen contents persist exactly');
  advance(restored, 1);
  close(restored.crew.find(c => c.id === id).portableOxygen, held, 'later simulation does not silently delete body stock');
  finiteState(restored);
});

const workplaces = new Map();
function workplaceColony(type) {
  if (!workplaces.has(type)) {
    const game = equipmentColony();
    build(game, type, 29, 11);
    clearWork(game);
    workplaces.set(type, game.serialize());
  }
  const game = new Game(73, 'breath-4.1');
  game.load(clone(workplaces.get(type)));
  return game;
}

function positionWorker(game, x, y, {points = 0, stress = 0} = {}) {
  return boundary(game, state => {
    Object.assign(state.crew[0], {x:x+.5,y:y+.5,stress,_idle:0});
    if (points) Object.assign(state.crew[0], {experience:points*60,level:points,skillPoints:points,skills:{dig:0,engineering:0,life:0}});
  });
}

test('waiting for research power earns no XP, then actual research earns levels and unspent points', () => {
  const game = positionWorker(workplaceColony('research'), 29, 11), id = game.crew[0].id;
  toggle(game, batteryOf(game), false);
  const research = game.stats.research;
  until(game, () => game.crew[0]._job?.kind === 'research', 3);
  const waitingXP = game.crew[0].experience;
  advance(game, 2);
  close(game.crew[0].experience, waitingXP, 'unpowered research waiting grants zero productive XP');
  close(game.stats.research, research, 'waiting did not perform research');
  toggle(game, batteryOf(game), true);
  const level = game.crew[0].level, points = game.crew[0].skillPoints;
  until(game, () => game.crew[0].level > level, 70, 'actual research did not earn the next level');
  const c = game.crew[0];
  assert.ok(game.stats.research > research);
  assert.equal(c.skillPoints, points + 1, 'a real level grants one spendable point');
  assert.deepEqual(c.skills, {dig:0,engineering:0,life:0}, 'productive XP does not allocate skills by itself');
  assert.ok(game.trainCrew(id,'engineering').ok);
  assert.equal(c.skills.engineering, 1);
  assert.equal(c.skillPoints, points);
  finiteState(game);
});

test('manual training spends each point once, enforces per-skill caps and survives role/schedule/save changes', () => {
  const game = positionWorker(equipmentColony(), 21, 11, {points:4}), c = game.crew[0];
  for (let i = 1; i <= 3; i++) {
    assert.ok(game.trainCrew(c.id,'dig').ok);
    assert.equal(c.skills.dig, i);
    assert.equal(c.skillPoints, 4 - i);
  }
  const before = game.serialize();
  assert.equal(game.trainCrew(c.id,'dig').ok, false, 'rank cap applies even while an unspent point remains');
  assert.equal(game.trainCrew(c.id,'invalid').ok, false);
  assert.deepEqual(game.serialize(), before, 'rejected training is non-mutating');
  assert.ok(game.trainCrew(c.id,'engineering').ok);
  assert.equal(game.trainCrew(c.id,'life').ok, false, 'no point may be spent twice');
  assert.equal(game.production.trainingPointsSpent, 4);
  assert.equal(game.stats.totalSkillRanks, 4);
  assert.ok(game.setCrewRole(c.id,'farm'));
  assert.ok(game.setCrewSchedule(c.id,'night').ok);
  const saved = game.serialize(), restored = new Game(1, 'breath-4.1');
  restored.load(clone(saved));
  assert.deepEqual(restored.crew[0].skills, {dig:3,engineering:1,life:0});
  assert.equal(restored.crew[0].skillPoints, 0);
  assert.equal(restored.crew[0].role, 'farm');
  assert.equal(restored.crew[0].schedule, 'night');
  finiteState(restored);
});

function allocate(game, skill) {
  for (let i=0;i<3;i++) assert.ok(game.trainCrew(game.crew[0].id, skill).ok);
}

test('dig specialization accelerates a real stressed worker without granting extra mined resources', () => {
  const games = [equipmentColony(),equipmentColony()];
  for (const game of games) positionWorker(game,12,11,{points:3,stress:50});
  allocate(games[1],'dig');
  for (const game of games) {
    assert.ok(game.queue('dig',11,11).ok);
    advance(game,.4);
  }
  close(games[1].tasks.find(t=>t.x===11&&t.y===11).progress / games[0].tasks.find(t=>t.x===11&&t.y===11).progress,
    1.6, 'three dig ranks multiply actual progress after existing stress efficiency');
  for (const game of games) until(game,()=>!at(game,11,11).solid,10);
  const yields = games.map(game=>game.debris.find(p=>p.x===11&&p.y===11)?.amount);
  assert.deepEqual(yields,[6,6], 'skill changes speed, not the material yield');
  for (const game of games) finiteState(game);
});

test('engineering changes actual construction and research rates while preserving their costs', () => {
  const construction = [equipmentColony(),equipmentColony()];
  for (const game of construction) positionWorker(game,21,11,{points:3,stress:50});
  allocate(construction[1],'engineering');
  const rock = construction.map(game=>game.resources.rock);
  for (const game of construction) { assert.ok(game.queue('tile',21,10).ok);advance(game,.4); }
  close(buildingAt(construction[1],21,10).progress / buildingAt(construction[0],21,10).progress,
    1.45, 'engineering multiplies construction progress');
  for (let i=0;i<2;i++) close(rock[i]-construction[i].resources.rock,3,'construction still pays its exact rock cost');
  const research = [workplaceColony('research'),workplaceColony('research')];
  for (const game of research) positionWorker(game,29,11,{points:3,stress:50});
  allocate(research[1],'engineering');
  const before = research.map(game=>game.stats.research);
  for (const game of research) advance(game,.4);
  close((research[1].stats.research-before[1])/(research[0].stats.research-before[0]),1.3,
    'engineering multiplies actual powered research');
  for (const game of [...construction,...research]) finiteState(game);
});

test('life specialization speeds real cooking and harvesting without increasing their batch yields', () => {
  const cooking = [workplaceColony('kitchen'),workplaceColony('kitchen')];
  for (const game of cooking) {
    positionWorker(game,29,11,{points:3,stress:50});
    boundary(game,state=>{ state.buildings.find(b=>b.type==='kitchen').recipeProgress=0; });
  }
  allocate(cooking[1],'life');
  const cooked = cooking.map(game=>game.production.mealsCooked);
  for (const game of cooking) advance(game,.4);
  close(buildingAt(cooking[1],29,11).recipeProgress / buildingAt(cooking[0],29,11).recipeProgress,
    1.45, 'life specialization multiplies actual cooking work');
  for (let i=0;i<2;i++) {
    until(cooking[i],()=>cooking[i].production.mealsCooked>cooked[i],15);
    close(cooking[i].production.mealsCooked-cooked[i],3,'one real recipe still creates three meals');
  }
  const harvesting = [equipmentColony(),equipmentColony()];
  for (const game of harvesting) {
    positionWorker(game,30,11,{points:3,stress:50});
    boundary(game,state=>{ const farm=state.buildings.find(b=>b.type==='farm');farm.enabled=true;farm.growth=1; });
  }
  allocate(harvesting[1],'life');
  const harvested = harvesting.map(game=>game.production.harvestedFood);
  for (const game of harvesting) advance(game,.4);
  close(harvesting[1].crew[0]._job.elapsed / harvesting[0].crew[0]._job.elapsed,1.45,
    'life specialization advances the actual harvest job faster');
  for (let i=0;i<2;i++) {
    until(harvesting[i],()=>harvesting[i].production.harvestedFood>harvested[i],10);
    close(harvesting[i].production.harvestedFood-harvested[i],1.5,'one ripe crop keeps its original yield');
  }
  for (const game of [...cooking,...harvesting]) finiteState(game);
});

test('a storage demolition blocked by newly arrived inventory cannot repeatedly farm work XP', () => {
  const game = workplaceColony('storage');
  positionWorker(game,29,11);
  assert.ok(game.queue('deconstruct',29,11).ok);
  until(game,()=>game.tasks.some(t=>t.x===29&&t.y===11&&t.progress>.6),10);
  // A delivery can fill the remaining capacity after demolition was reserved.
  // This boundary fixture changes only that incoming inventory, not work or XP.
  boundary(game,state=>{
    const total=['rock','metal','algae','coal'].reduce((sum,key)=>sum+state.resources[key],0);
    state.resources.rock+=650-total;
  });
  until(game,()=>game.tasks.some(t=>t.x===29&&t.y===11&&t.blockedReason),5);
  const xp=game.crew.reduce((sum,c)=>sum+c.experience,0);
  advance(game,3);
  close(game.crew.reduce((sum,c)=>sum+c.experience,0),xp,
    'waiting for storage capacity has no new productive work to reward');
  assert.ok(buildingAt(game,29,11),'blocked demolition must preserve the storage');
  const remaining=1-game.tasks.find(t=>t.x===29&&t.y===11).progress;
  // Model stock being consumed elsewhere after the paused demolition. The
  // engine must now finish only the remaining physical work, exactly once.
  boundary(game,state=>{state.resources.rock-=100;});
  until(game,()=>!buildingAt(game,29,11),10,'restored capacity did not resume the queued demolition');
  close(game.crew.reduce((sum,c)=>sum+c.experience,0)-xp,remaining*2.5,
    'unblocking awards only the remaining real demolition work');
  finiteState(game);
});

test('thermal pockets conserve water through freezing, thawing, boiling and condensation', () => {
  const game = new Game(73, 'breath-4.1');
  const cell = game.cell(3, 3);
  Object.assign(cell, { solid: null, water: .75, oxygen: 0, co2: 0 });
  for (const [temperature, phase, amount] of [[-6,'frost',.75],[8,'water',.75],[112,'steam',9],[28,'water',.75]]) {
    // Isolate one cell inside an isothermal solid wall.
    for (const other of game.cells) other.temp = temperature;
    game._environment(.2);
    close(cell[phase], amount, phase);
    close(12 * (cell.water + cell.frost) + cell.steam, 9, 'water-equivalent kg');
  }
  const fresh = new Game(73, 'breath-4.1');
  fresh.step(1);
  assert.ok(fresh.cells.some(c => c.frost > .1), 'a cold frontier can be found in a new world');
  assert.ok(fresh.cells.some(c => c.steam > .5), 'a hot frontier can be found in a new world');
  const resumed = new Game(91, 'breath-4.1');
  resumed.load(fresh.serialize());
  fresh.step(1);
  resumed.step(1);
  assert.deepEqual(resumed.cells, fresh.cells, 'phase and transport resume in lockstep');
});

test('insulation costs rock once and limits conduction through a built floor', () => {
  const bare = new Game(73, 'breath-4.1'), insulated = new Game(73, 'breath-4.1');
  const x = 16, y = 12, startRock = insulated.resources.rock;
  assert.equal(insulated.queue('insulate',x,y).ok, true);
  assert.equal(insulated.queue('insulate',x,y).ok, false);
  assert.equal(insulated.resources.rock, startRock-6);
  assert.equal(insulated.cell(x,y).insulated, true);
  const loaded = new Game(73, 'breath-4.1');
  loaded.load(insulated.serialize());
  assert.equal(loaded.cell(x,y).insulated, true);
  for (const game of [bare,insulated]) {
    for (const c of game.cells) c.temp = 20;
    game.cell(x,y).temp = 80;
    game._environment(.2);
  }
  assert.ok(bare.cell(x,y).temp < insulated.cell(x,y).temp - .1);
  const failed = loaded.serialize();
  failed.cells[0].insulated = true;
  assert.throws(() => loaded.load(failed));
});

test('a tile order in a saturated pocket waits without loss and completes once an outlet opens', () => {
  const game = new Game(73, 'breath-4.1'), x = 22, y = 11;
  assert.ok(game.queue('tile', x, y).ok);
  const task = game.tasks.find(t => t.x === x && t.y === y);
  const source = game.cell(x,y);
  Object.assign(source, {oxygen:1,co2:.3,water:.55,steam:.4});
  for (const [dx,dy] of [[1,0],[-1,0],[0,-1]]) {
    Object.assign(game.cell(x+dx,y+dy), {water:1,oxygen:3,co2:3,steam:12});
  }
  game._completeTask(task);
  assert.equal(source.solid,null);
  assert.equal(game.tasks.includes(task),true);
  assert.match(task.blockedReason,/이동할 공간/);
  close(source.water,.55,'refused construction keeps the material');
  const outlet = game.cell(x-1,y);
  Object.assign(outlet, {water:0,oxygen:0,co2:0,steam:0});
  game._completeTask(task);
  assert.equal(source.solid,'tile');
  assert.equal(game.tasks.includes(task),false);
  for (const [field, amount] of Object.entries({oxygen:1,co2:.3,water:.55,steam:.4})) {
    close(outlet[field],amount,field+' displaced'); close(source[field],0,field+' cleared');
  }
});

test('CO2 settles in a closed shaft and gas totals remain constant at saturation', () => {
  const game = new Game(73, 'breath-4.1'), column = [3,4,5,6].map(y => game.cell(3,y));
  for (const c of column) Object.assign(c, {solid:null, oxygen:3, co2:2.9, temp:22});
  for (let i=0;i<30;i++) { game.time+=.2; game._environment(.2); }
  close(column.reduce((sum,c)=>sum+c.oxygen,0),12,'oxygen conservation');
  close(column.reduce((sum,c)=>sum+c.co2,0),11.6,'CO2 conservation');
  assert.ok(column.at(-1).co2 > column[0].co2);
  assert.ok(column.every(c => c.co2 <= 3 && c.oxygen <= 3));
});

test('game time and gas transport replay identically across calls and mid-tick saves', () => {
  const single = new Game(73, 'breath-4.1'), split = new Game(73, 'breath-4.1'), loaded = new Game(91, 'breath-4.1');
  single.step(3);
  for (let i=0; i<19; i++) split.step(.03);
  loaded.load(split.serialize());
  for (let i=19; i<100; i++) loaded.step(.03);
  assert.deepEqual(loaded.serialize(),single.serialize());
});

test('a steam-filled chamber triggers portable breathing and normal air releases metabolic CO2', () => {
  const game = new Game(73, 'breath-4.1'), crew = game.crew[0];
  const cell = game.cell(Math.floor(crew.x),Math.floor(crew.y));
  Object.assign(cell,{oxygen:.8,co2:.01,water:0,steam:6});
  crew.portableOxygen = 1;
  game._crewStep(crew,.1);
  assert.equal(crew.usingPortable,true);
  close(cell.oxygen,.8,'mask leaves ambient oxygen');
  cell.steam=0;
  const oxygen=cell.oxygen, carbon=cell.co2;
  game._crewStep(crew,.1);
  assert.equal(crew.usingPortable,false);
  close(cell.co2-carbon, (oxygen-cell.oxygen)*.02,'respiration CO2 to oxygen mass ratio');
});

test('steam turbine charges the grid from actual inlet mass and stops on heat, pressure or a full outlet', () => {
  const game = new Game(73, 'breath-4.1');
  const x=28,y=11;
  assert.equal(game.canPlace('steamTurbine',x,y).ok,false,'research gates the turbine');
  game.stats.research=60;
  game.toggleBuilding(game.buildings.find(b=>b.type==='farm').id);
  for(const [tool,sx] of [['steamTurbine',x],['battery',x-1]]){
    assert.ok(game.queue(tool,sx,y).ok);
    game._completeTask(game.tasks.find(t=>t.x===sx&&t.y===y));
  }
  game._startUtilities(.1);
  const turbine=game._buildingAt(x,y), battery=game._buildingAt(x-1,y);
  const inlet=game.cell(x+1,y), body=game.cell(x,y);
  Object.assign(inlet,{steam:1,temp:200});
  const net=game._fluidNet(turbine), initialWater=game._fluidAmount(net);
  game._buildingStep(.1);
  close(battery.charge,8.5,'rated 85 W for 0.1 s');
  close(1-inlet.steam,.02,'condensed inlet mass');
  close(game._fluidAmount(net)-initialWater,.02,'liquid delivered to pipe');
  const expectIdle=(reason)=>{
    const charge=battery.charge, gas=inlet.steam;
    game._buildingStep(.1);
    close(battery.charge,charge,'idle turbine yields no electricity');
    close(inlet.steam,gas,'idle turbine preserves steam');
    assert.match(turbine.status,reason);
  };
  body.temp=100;expectIdle(/과열/);
  body.temp=25;inlet.temp=120;expectIdle(/125/);
  inlet.temp=200;game._putFluid(net,game._fluidSpace(net));expectIdle(/가득/);
});

test('a mapped steam vent meters its external source and sleeps between eruptions', () => {
  const game = new Game(73, 'breath-4.1');
  const vent=game.cell(40,24);
  for(const c of game.cells){c.solid='rock';c.temp=165;c.water=0;c.frost=0;c.steam=0;}
  Object.assign(vent,{solid:null,steam:2.49,oxygen:0,co2:0});
  game._environment(.2);
  close(vent.steam,2.5,'source pressure limit');
  close(vent.ventOutput,.01,'meter counts admitted mass');
  game._environment(.2);
  close(vent.ventOutput,.01,'overpressure blocks the vent');
  vent.steam=0;game.time=60;game._environment(.2);
  close(vent.ventOutput,.01,'dormant vent has no output');
  game.time=121;game._environment(.2);
  close(vent.ventOutput,.05,'next cycle restarts production');
  vent.solid='tile';game._environment(.2);
  close(vent.ventOutput,.05,'capped vent stays sealed');
});

test('contact conduction balances heat gained and lost according to installed material capacities', () => {
  const cells=[{solid:'rock',temp:100},{solid:'copper',temp:0}];
  const world={w:2,h:1,time:0,cells};
  Game.prototype._environment.call(world,.2);
  const rockCapacity=24*1.0, copperCapacity=24*.386;
  close((100-cells[0].temp)*rockCapacity,cells[1].temp*copperCapacity,'conducted heat balance');
  assert.ok(cells[0].temp < 100 && cells[1].temp > 0);
  const vacuum={solid:null,temp:-5,water:0,oxygen:0,co2:0};
  world.cells=[{solid:'rock',temp:100},vacuum];
  Game.prototype._environment.call(world,.2);
  close(vacuum.temp,-5,'vacuum does not conduct heat');
});
