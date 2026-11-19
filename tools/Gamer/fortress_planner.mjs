import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createContext, runInContext } from 'node:vm';

const tickSeconds = 1 / 30;
const aimSpeed = 34;

function plan(reason, groupTicks, key, heldGroups = 0, diagnostics) {
  return {
    action: {
      mouse: [0, 0, 0],
      steps: Array.from({ length: 6 }, (_, i) => i < heldGroups ? [key] : []),
      invalid: null,
    },
    groupTicks,
    reason,
    diagnostics,
  };
}

function predictDamage(engine, tank, target, weapon, angle, power) {
  const impact = engine._predict(tank, weapon, angle, power, false);
  if (!impact.hit || impact.hit.kind === 'void') return { damage: 0 };
  const direct = impact.hit.tank === target;
  const distance = Math.max(0, Math.hypot(target.x - impact.x, target.y - impact.y) - 14);
  const radius = Math.max(18, weapon.radius);
  if (!direct && distance > radius) return { damage: 0 };
  const falloff = direct ? 1 : Math.max(0.1, 1 - distance / (radius + 0.01));
  const rawDamage = Math.round(weapon.attack * engine._attackMultiplier(tank) * engine.tuning.damageScale * falloff);
  const damage = target.status.shield > 0 ? 0 : Math.min(target.hp, Math.max(0, rawDamage - (target.status.barrier || 0)));
  return { damage, direct, impactX: impact.x, impactY: impact.y };
}

function shotAtAngle(engine, tank, target, weapon, aiming, angle) {
  const maxTicks = Math.ceil((aiming.powerMax - aiming.powerMin) / aiming.chargeRate / tickSeconds);
  let best;
  for (let ticks = 1; ticks <= Math.min(maxTicks, 60); ticks++) {
    const elapsed = ticks * tickSeconds;
    const power = engine.getChargePower(elapsed);
    const hit = predictDamage(engine, tank, target, weapon, angle, power);
    if (!hit.damage) continue;
    const low = predictDamage(engine, tank, target, weapon, angle, engine.getChargePower(elapsed - 1 / 60));
    const high = predictDamage(engine, tank, target, weapon, angle, engine.getChargePower(elapsed + 1 / 60));
    const worstDamage = Math.min(hit.damage, low.damage, high.damage);
    if (!best || hit.damage > best.damage || (hit.damage === best.damage && worstDamage > best.worstDamage)) {
      best = { ...hit, angle, power, ticks, worstDamage };
    }
  }
  return best;
}

export async function createFortressPlanner({ projectRoot, initial }) {
  // Load the same physics/catalog in an isolated Node context. Only the returned
  // keyboard groups are executed in Chrome. This replica never fires a shot.
  const context = createContext();
  for (const name of ['data.js', 'engine.js']) {
    const file = join(projectRoot, 'games', 'fortress-blue', 'Web', name);
    runInContext(readFileSync(file, 'utf8'), context, { filename: file });
  }
  const engine = new context.FortEngine(initial.config);

  return {
    next(observation, inputState) {
      if (observation.paused || !observation.human || observation.phase !== 'aim') {
        return plan('Wait for projectile resolution or the blue aiming turn.', 30);
      }
      if (observation.terrainVersion !== engine.terrain.version) {
        throw new Error('The Fortress planner needs the unchanged map generated from the match seed.');
      }
      const { activeId, round, wind } = observation;
      Object.assign(engine.state, { activeId, round, wind, weaponIndex: observation.weapon });
      for (const snapshot of observation.tanks) {
        const tank = engine.state.tanks.find(t => t.uid === snapshot.uid);
        Object.assign(tank, { ...snapshot, status: { ...snapshot.status } });
        engine._updateTilt(tank);
      }
      const tank = engine.active;
      const target = engine.state.tanks.find(t => t.alive && t.team !== tank.team);
      if (!target) return plan('Wait for the game to record the result.', 1);
      if (Math.sign(target.x - tank.x) !== tank.face) {
        return plan('Face the opposing tank.', 1, target.x > tank.x ? 'Right' : 'Left', 1);
      }
      if (observation.weapon !== 0) return plan('Select the first weapon.', 1, 'one', 1);
      const weapon = tank.def.weapons[0];
      if (weapon.id !== 'catapult_w1' || inputState.held.includes('Space')) {
        throw new Error('The Fortress planner expects an uncharged Catapult rock shot.');
      }
      const aiming = engine.getAimingState();
      const shot = shotAtAngle(engine, tank, target, weapon, aiming, tank.angle);
      if (shot?.direct) {
        return plan('Charge and release a rock shot at the predicted direct-hit power.', shot.ticks, 'Space', 1, shot);
      }
      const aimDelta = aimSpeed * tickSeconds;
      const downTicks = Math.ceil((tank.angle - aiming.min) / aimDelta);
      const upTicks = Math.ceil((aiming.max - tank.angle) / aimDelta);
      for (let ticks = 1; ticks <= Math.max(downTicks, upTicks); ticks++) {
        for (const direction of [-1, 1]) {
          if (ticks > (direction < 0 ? downTicks : upTicks)) continue;
          const angle = Math.min(aiming.max, Math.max(aiming.min, tank.angle + direction * ticks * aimDelta));
          const candidate = shotAtAngle(engine, tank, target, weapon, aiming, angle);
          if (candidate?.direct && candidate.worstDamage > 0) {
            return plan('Adjust the elevation for a predicted direct hit.', ticks, direction < 0 ? 'Down' : 'Up', 1, candidate);
          }
        }
      }
      if (!shot) throw new Error('The Fortress planner found no damaging trajectory on the current bearing.');
      return plan('Charge and release a rock shot within the predicted damage radius.', shot.ticks, 'Space', 1, shot);
    },
  };
}
