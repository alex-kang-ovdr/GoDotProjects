import assert from 'node:assert/strict';
import { createBattle, getPlayer, stepBattle } from '../dist/js/engine.js';

// Full-length deterministic battles exercise navigation, targeting and terminal states.
// The player intentionally remains stationary: bots must be able to finish a round.
const results = [];
for (const scenario of [{ seed: 11, mapId: 'valley', tankClass: 'medium' }, { seed: 42, mapId: 'depot', tankClass: 'heavy' }, { seed: 117, mapId: 'ridge', tankClass: 'scout' }]) {
  const { seed, mapId, tankClass } = scenario;
  const state = createBattle({ seed, mapId, tankClass, difficulty: 'normal' });
  assert.equal(state.map.id, mapId);
  const startPositions = new Map(state.tanks.map(t => [t.id, { x: t.x, y: t.y }]));
  const travel = new Map(state.tanks.map(t => [t.id, 0]));
  let lastEvent = 0;
  let shots = 0;
  let impacts = 0;
  let firstShot = null;
  let firstHit = null;
  let maxShells = 0;
  let maxEffects = 0;
  let maxSmokeClouds = 0;
  for (let frame = 0; frame < 60 * 362 && state.phase === 'playing'; frame++) {
    const player = getPlayer(state);
    stepBattle(state, {
      throttle: 0, steer: 0, moveAngle: null, movePower: 0,
      aimX: player.x + 500, aimY: player.y,
      fire: false, repair: false, ammo: 'AP',
    }, 1 / 60);
    for (const event of state.events) {
      if (event.id <= lastEvent) continue;
      if (event.type === 'fire') { shots++; firstShot ??= state.elapsed; }
      if (event.type === 'hit') { impacts++; firstHit ??= state.elapsed; }
    }
    if (state.events.length) lastEvent = state.events.at(-1).id;
    maxShells = Math.max(maxShells, state.projectiles.length);
    maxEffects = Math.max(maxEffects, state.effects.length);
    maxSmokeClouds = Math.max(maxSmokeClouds, state.smokeClouds.length);
    if (frame % 60 === 0) {
      for (const tank of state.tanks) {
        assert.ok(Number.isFinite(tank.x) && Number.isFinite(tank.y) && Number.isFinite(tank.hp), `nonfinite tank state, seed ${seed}`);
        assert.ok(tank.x >= -1 && tank.x <= state.map.width + 1 && tank.y >= -1 && tank.y <= state.map.height + 1, `tank escaped map, seed ${seed}`);
        assert.ok(tank.smokeCharges >= 0 && tank.smokeCooldown >= 0 && tank.reloadLeft >= 0, `invalid cooldown/charge state, ${mapId}`);
        assert.ok(Object.values(tank.stats).every(value => Number.isFinite(value) || typeof value === 'boolean'), `invalid statistics, ${mapId}`);
        const last = startPositions.get(tank.id);
        travel.set(tank.id, travel.get(tank.id) + Math.hypot(tank.x - last.x, tank.y - last.y));
        startPositions.set(tank.id, { x: tank.x, y: tank.y });
      }
    }
  }
  assert.equal(state.phase, 'ended', `round did not terminate, seed ${seed}`);
  assert.ok(shots > 0 && impacts > 0, `bots never engaged, seed ${seed}`);
  assert.ok(firstShot < 45 && firstHit < 75, `bots did not find combat promptly, ${mapId}`);
  assert.ok(maxShells < 100 && maxEffects < 500, `unbounded transient objects, seed ${seed}`);
  assert.ok(maxSmokeClouds <= 10, `unbounded smoke, ${mapId}`);
  assert.ok(state.tanks.filter(tank => !tank.isPlayer).every(tank => travel.get(tank.id) > 100), `a bot never left spawn, ${mapId}`);
  results.push({
    seed, mapId, tankClass,
    duration: Number(state.elapsed.toFixed(1)),
    winner: state.winner,
    reason: state.resultReason,
    firstShot: Number(firstShot?.toFixed(1)),
    firstHit: Number(firstHit?.toFixed(1)),
    shots,
    impacts,
    alive: state.tanks.filter(t => t.alive).map(t => `${t.team}:${t.type}`),
    maxShells,
    maxEffects,
    maxSmokeClouds,
    botTravelRange: [
      Math.round(Math.min(...state.tanks.filter(t => !t.isPlayer).map(t => travel.get(t.id)))),
      Math.round(Math.max(...travel.values())),
    ],
  });
}
console.log(JSON.stringify({ simulationSmoke: 'passed', results }, null, 2));
