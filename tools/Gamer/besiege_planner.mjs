import path from 'node:path';
import { pathToFileURL } from 'node:url';

const FRAME_SECONDS = 1 / 60;
const CLOCK_TOLERANCE = 1e-6;
const OUTPOST_SHOTS = [
  { groupTicks: 3, keys: ['I', null, null, null, null, 'F'], reason: 'Raise the cannon to 2.5° and fire at the central tower.' },
  { groupTicks: 3, keys: [null, null, null, null, 'Q', 'Q'], reason: 'Wait for the central shell to land and rotate the turret left.' },
  { groupTicks: 5, keys: [null, null, 'F', null, null, null], reason: 'Let the turret settle, then fire at the left tower after reloading.' },
  { groupTicks: 7, keys: ['E', 'E', null, 'F', null, null], reason: 'Rotate the turret right, settle, fire at the last tower, and wait for impact.' },
];

function readCheckpoint(sim) {
  return {
    elapsed: sim.elapsed,
    shots: sim.shots,
    destroyed: sim.destroyedCount,
    ammo: sim.ammoRemaining,
    coreHp: sim.coreHp,
    outcome: sim.outcome,
  };
}

function checkObservation(observation, expected) {
  const actual = observation?.sim;
  if (observation?.mode !== 'play' || observation.mission !== 'outpost' || observation.paused || !actual) {
    throw new Error('Besiege planner requires an active Outpost run.');
  }
  const match = Number.isFinite(actual.elapsed) && Math.abs(actual.elapsed - expected.elapsed) < CLOCK_TOLERANCE
    && ['shots', 'destroyed', 'ammo', 'coreHp', 'outcome'].every(key => actual[key] === expected[key]);
  if (!match) {
    const observed = Object.fromEntries(Object.keys(expected).map(key => [key, actual[key]]));
    throw new Error(`Besiege observation diverged from the offline replay. Expected ${JSON.stringify(expected)}, observed ${JSON.stringify(observed)}.`);
  }
}

export async function createBesiegePlanner({ projectRoot, initial }) {
  const source = path.join(projectRoot, 'games', 'besiege', 'Web');
  const load = name => import(pathToFileURL(path.join(source, name)).href);
  const [{ Simulation }, { makePreset }, { readControls }] = await Promise.all([
    load('physics.js'), load('parts.js'), load('input.js'),
  ]);
  const parts = makePreset('rover');
  if (initial?.partCount !== parts.length || initial?.sim?.targets !== 9) {
    throw new Error('Besiege planner requires the default Rover and nine Outpost targets.');
  }

  const events = [];
  const sim = new Simulation({
    parts,
    mission: 'outpost',
    onEvent(event) {
      if (event.type === 'fire' || event.type === 'destroy') events.push(event);
    },
  });
  const tick = controls => {
    sim.step(FRAME_SECONDS, controls);
    sim.step(FRAME_SECONDS, controls);
  };
  let plan;
  try {
    // The browser advances one idle group after launching the Rover.
    tick(readControls(new Set(), new Set()));
    checkObservation(initial, readCheckpoint(sim));
    plan = OUTPOST_SHOTS.map(({ groupTicks, keys, reason }) => {
      const before = readCheckpoint(sim);
      const eventStart = events.length;
      for (const key of keys) {
        const controls = readControls(new Set(key ? [`Key${key}`] : []), new Set());
        for (let i = 0; i < groupTicks; i++) tick(controls);
      }
      return {
        before,
        keys,
        groupTicks,
        reason,
        diagnostics: {
          expectedBefore: before,
          expectedAfter: readCheckpoint(sim),
          predictedEvents: events.slice(eventStart).map(event => ({
            type: event.type, time: event.time, ...(event.targetId && { targetId: event.targetId }),
          })),
        },
      };
    });
    if (!sim.won || sim.destroyedCount !== 9 || sim.shots !== 3 || sim.coreHp !== 100) {
      throw new Error('The current Outpost physics did not reproduce the default Rover plan.');
    }
  } finally {
    sim.dispose();
  }

  let cursor = 0;
  return {
    next(observation) {
      const stage = plan[cursor];
      if (!stage) throw new Error('Besiege planner exhausted its four validated actions.');
      checkObservation(observation, stage.before);
      cursor++;
      return {
        action: { mouse: [0, 0, 0], steps: stage.keys.map(key => key ? [key] : []), invalid: null },
        groupTicks: stage.groupTicks,
        reason: stage.reason,
        diagnostics: stage.diagnostics,
      };
    },
  };
}
