import assert from 'node:assert/strict';
import { Game, CYCLE_SECONDS } from '../../../Web/engine.js';
import { at, buildingAt, until, frontierDig } from './helpers.mjs';

export function command(game, tool, x, y) {
  const result = game.queue(tool, x, y);
  assert.ok(result.ok, `${tool} (${x},${y}): ${result.message}; stores=${JSON.stringify(game.resources)}`);
  return buildingAt(game, x, y);
}

export function line(game, tool, x1, y1, x2, y2) {
  assert.ok(x1 === x2 || y1 === y2, 'infrastructure route is straight');
  for (let x = x1, y = y1; ; x += Math.sign(x2 - x1), y += Math.sign(y2 - y1)) {
    if (!at(game, x, y)[tool]) command(game, tool, x, y);
    if (x === x2 && y === y2) break;
  }
}

/** A reproducible player route: only public commands and elapsed time, no gifted resources. */
export function establishUtilityColony() {
  const game = new Game(73, 'breath-4.1');
  const plans = [
    command(game, 'diffuser', 26, 11), command(game, 'battery', 27, 11),
    command(game, 'research', 28, 11), command(game, 'toilet', 25, 11),
    command(game, 'sink', 29, 11), command(game, 'farm', 28, 16),
    command(game, 'farm', 29, 16), command(game, 'farm', 30, 16),
    command(game, 'reservoir', 31, 11),
  ];
  line(game, 'pipe', 23, 11, 31, 11);
  line(game, 'pipe', 23, 11, 23, 16);
  line(game, 'pipe', 23, 16, 30, 16);
  line(game, 'wastepipe', 25, 11, 32, 11);
  until(game, () => plans.every(b => b.progress === 1), CYCLE_SECONDS * 3,
    'starting food, life support and sanitation were not constructed');

  // Open the pump route and recover three explicit copper blocks to pay for advanced facilities.
  for (const [x, y] of [[36, 11], [37, 11], [11, 11], [10, 11], [10, 10], [10, 9]]) {
    command(game, 'dig', x, y);
    until(game, () => !at(game, x, y).solid, CYCLE_SECONDS,
      `crew could not open the documented route at ${x},${y}`);
  }
  while (game.stats.completedDigs < 12) {
    const cell = frontierDig(game);
    command(game, 'dig', cell.x, cell.y);
    until(game, () => !at(game, cell.x, cell.y).solid, CYCLE_SECONDS,
      'reachable expansion work stalled');
  }
  line(game, 'wire', 33, 11, 37, 11);
  line(game, 'pipe', 31, 11, 37, 11);
  const pump = command(game, 'pump', 37, 11);
  plans.push(pump);
  until(game, () => game.stats.research >= 15, CYCLE_SECONDS * 2);
  plans.push(command(game, 'purifier', 32, 11));
  until(game, () => pump.progress === 1 && game.crew.every(c => c.x < 36), CYCLE_SECONDS * 2,
    'the pump crew did not return to the colony side before closing the water barrier');
  const barrier = command(game, 'tile', 36, 11);
  plans.push(barrier);
  until(game, () => barrier.progress === 1, CYCLE_SECONDS,
    'the reachable water barrier was not constructed');
  assert.ok(game.crew.every(c => c.x < 36), 'no crew were sealed into the spring chamber');
  until(game, () => game.stats.research >= 35, CYCLE_SECONDS * 3);
  plans.push(command(game, 'electrolyzer', 33, 11), command(game, 'hydrogenGen', 34, 11));
  until(game, () => plans.every(b => b.progress === 1), CYCLE_SECONDS * 2,
    'advanced utility construction stalled');
  assert.equal(game.lost, false);
  return game;
}

/** v3 extension using the same normal player commands, with no edited stock/research/crew needs. */
export function establishCommunityColony({ schedules = true } = {}) {
  const game = establishUtilityColony();
  // Additional local copper finances kitchen and refrigeration; hauling must finish before spending.
  for (const [x, y] of [[13,16],[12,16],[11,16],[24,20],[23,21]]) {
    command(game, 'dig', x, y);
    until(game, () => !at(game,x,y).solid, CYCLE_SECONDS * 2,
      `the community copper route stalled at ${x},${y}`);
  }
  const ladder = command(game, 'ladder', 23,21);
  until(game, () => ladder.progress === 1, CYCLE_SECONDS);
  command(game, 'dig',24,21);
  until(game, () => !at(game,24,21).solid, CYCLE_SECONDS * 2);
  assert.ok(game.setCrewRole(game.crew[0].id,'haul'));
  until(game, () => game.resources.metal >= 30 && game.resources.rock >= 67, CYCLE_SECONDS * 4,
    'actually mined copper was not carried back for the new facilities');
  const plans = [command(game,'storage',18,16),command(game,'kitchen',25,16),
    command(game,'mess',20,16),command(game,'fridge',26,16)];
  until(game, () => plans.every(b => b.progress === 1), CYCLE_SECONDS * 3,
    'the new food and collection facilities were not constructed');
  assert.ok(game.setCrewRole(game.crew[1].id,'cook'));
  assert.ok(game.setCrewRole(game.crew[2].id,'operate'));
  if (schedules) {
    for (const [index,schedule] of ['day','swing','night'].entries()) {
      const result=game.setCrewSchedule(game.crew[index].id,schedule);
      assert.ok(result.ok,result.message);
    }
  }
  return game;
}

/** v4 expansion from a new colony, using only player commands and real work/transport. */
export function establishFrontierColony() {
  const game = establishCommunityColony();
  const dig = (x, y) => {
    command(game, 'dig', x, y);
    until(game, () => !at(game, x, y).solid, CYCLE_SECONDS * 3,
      `the safe expansion route stalled at ${x},${y}`);
  };
  const construct = (tool, x, y) => {
    const building = command(game, tool, x, y);
    until(game, () => building.progress === 1, CYCLE_SECONDS * 3,
      `${tool} at ${x},${y} did not finish`);
    return building;
  };

  // Two reachable copper seams pay for a dock before the longer, thin-air tunnel.
  dig(23, 22);
  construct('ladder', 23, 22);
  for (const [x, y] of [[22,22], [21,22], [20,22]]) dig(x, y);
  until(game, () => game.resources.metal >= 12 && game.resources.rock >= 20 && game.stats.research >= 45,
    CYCLE_SECONDS * 3, 'the dock needs actually delivered minerals and completed research');
  construct('oxygenDock', 21, 11);
  until(game, () => game.crew.every(c => c.portableOxygen >= 1.5), CYCLE_SECONDS * 4,
    'crew did not visit the powered dock to collect actually compressed oxygen');

  // Preserve a ladder over the third copper seam before removing its floor.
  for (const x of [19, 18, 17]) dig(x, 22);
  construct('ladder', 17, 22);
  dig(17, 23);
  construct('ladder', 17, 23);
  for (const x of [22, 21, 20, 19, 18, 17]) dig(x, 21);
  dig(16, 22);
  dig(16, 21);
  until(game, () => game.resources.rock >= 75 && game.resources.metal >= 16,
    CYCLE_SECONDS * 4, 'room materials must be carried into a real depot before construction');

  // Build the low ceilings before their side walls: every tile stays within real work reach.
  const ceilings = [];
  for (let x = 14; x <= 19; x++) ceilings.push(command(game, 'tile', x, 9));
  for (let x = 16; x <= 22; x++) ceilings.push(command(game, 'tile', x, 14));
  until(game, () => ceilings.every(b => b.progress === 1), CYCLE_SECONDS * 4, 'room ceilings remained out of work reach');
  const walls = [[14,10],[19,10],[16,15],[22,15]].map(([x,y]) => command(game, 'tile', x, y));
  until(game, () => walls.every(b => b.progress === 1), CYCLE_SECONDS * 3, 'room side walls did not finish');
  const doors = [[14,11],[19,11],[16,16],[22,16]].map(([x,y]) => command(game, 'door', x, y));
  until(game, () => doors.every(b => b.progress === 1), CYCLE_SECONDS * 3, 'the real entrances did not finish');
  until(game, () => ['bedroom','messhall'].every(type => game.rooms.some(r => r.type === type && r.valid)),
    CYCLE_SECONDS, 'built bedroom and dining room were not structurally usable');

  // Earned XP is inert until these explicit player allocations.
  const branches = ['dig', 'life', 'engineering'];
  for (const [index, crew] of game.crew.entries()) {
    until(game, () => crew.skillPoints >= 1, CYCLE_SECONDS * 4,
      `${crew.name} did not earn a point through actual work`);
    const trained = game.trainCrew(crew.id, branches[index]);
    assert.ok(trained.ok, trained.message);
  }

  // Fresh visible mining extends the same tunnel if the first exploration used less than 30 s.
  for (const x of [15,14,13,12,11,10]) {
    if (game.production.protectedSeconds >= 30) break;
    dig(x, 22);
  }
  until(game, () => game.production.protectedSeconds >= 30, CYCLE_SECONDS * 3,
    'normal exploration did not consume portable oxygen for thirty actual breathing seconds');

  // Rooms need local life support as well as boundaries. Ventilation alone cannot carry
  // enough oxygen from the original upper diffuser to both distant living spaces.
  for (const door of doors) {
    const opened = game.setDoorMode(door.id, 'open');
    assert.ok(opened.ok, opened.message);
  }
  for (const [x,y] of [[15,22],[15,21],[14,21],[16,23],[15,23],[14,23],[13,23],[12,23],[11,23],[10,23],[9,23]]) {
    if (at(game,x,y).solid) dig(x,y);
  }
  until(game, () => game.resources.rock >= 50 && game.resources.metal >= 30,
    CYCLE_SECONDS * 4, 'local oxygen equipment requires three more actually collected copper seams');
  finishLivingOxygen(game);
  assert.equal(game.lost, false);
  return game;
}

function finishLivingOxygen(game) {
  const support = [command(game,'diffuser',18,11),command(game,'diffuser',19,16)];
  until(game, () => support.every(b => b.progress === 1),CYCLE_SECONDS * 3,
    'bedroom and dining-room oxygen sources did not finish');
}
