'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const forge = path.resolve(__dirname, '..');
const project = path.join(forge, 'Templates', 'fortress-war');
const source = path.resolve(forge, '../games/fortress-blue/Source/Project/dist');
const chargeTimes = [0, 0.2, 1, 1.4, 2, 2.8, 10];
const surfaceColumns = [0, 44, 60, 370, 470, 797, 821, 1200, 1330, 1799];
const tankKeys = ['uid', 'typeId', 'team', 'x', 'y', 'hp', 'maxHp', 'angle', 'face', 'tilt', 'nextDelay', 'moveLeft'];
const turnKeys = ['phase', 'activeId', 'turnNumber', 'round', 'wind', 'timeLeft', 'turnOrder'];
const projectileKeys = ['x', 'y', 'vx', 'vy', 'kind', 'ownerId', 'weaponId'];
const actionKeys = ['ownerId', 'weaponId', 'shots', 'damageToEnemy', 'friendlyDamage', 'hits', 'terrainRemoved', 'reason'];
const options = [
  { teamSize: 1, control: 'hotseat', seed: 123 },
  { map: 'islands', teamSize: 4, control: 'hotseat', seed: 0, angleProfile: 'kr_reference' },
  { profile: 'blue3', map: 'foundry', teamSize: 1, control: 'hotseat', seed: 4294967295, playerTank: 'mecha_punch' },
];
const shot = { angle: 42, power: 42, sampleSteps: [0, 1, 30, 75], maxSteps: 1200 };

const original = vm.createContext({});
for (const filename of ['data.js', 'engine.js']) {
  vm.runInContext(fs.readFileSync(path.join(source, filename), 'utf8'), original, { filename });
}

function select(record, keys) {
  return Object.fromEntries(keys.map(key => [key, record[key]]));
}

function seededMatch(engine) {
  return {
    turn: select(engine.state, turnKeys),
    tanks: engine.state.tanks.map(tank => select(tank, tankKeys)),
    terrain: select(engine.terrain, ['mapId', 'width', 'height', 'solidCount', 'version']),
    surfaces: surfaceColumns.map(x => engine.terrain.surfaceAt(x)),
    aiming: engine.getAimingState(),
    charge: chargeTimes.map(seconds => engine.getChargePower(seconds)),
    clampedAngles: [-200, 200].map(angle => {
      assert.equal(engine.setAngle(angle), true);
      return engine.getAimingState().localAngle;
    }),
    clampedPowers: [-10, 37.8, 150].map(power => {
      assert.equal(engine.setPower(power), true);
      return engine.getAimingState().power;
    }),
  };
}

function playShot(engine) {
  engine.setAngle(shot.angle);
  engine.setPower(shot.power);
  assert.equal(engine.fire(), true);
  const projectiles = [];
  let step = 0;
  for (; step < shot.maxSteps && engine.state.turnNumber === 1; step++) {
    if (shot.sampleSteps.includes(step)) projectiles.push(engine.state.projectiles.map(p => select(p, projectileKeys)));
    engine.tick(1 / 120);
  }
  assert.ok(step < shot.maxSteps, 'The source shot must settle within ten simulated seconds.');
  return {
    steps: step,
    projectiles,
    turn: select(engine.state, turnKeys),
    hitPoints: engine.state.tanks.map(tank => tank.hp),
    action: select(engine.state.lastAction, actionKeys),
    terrain: select(engine.terrain, ['solidCount', 'version']),
  };
}

function assertParity(actual, expected, field) {
  if (typeof expected === 'number' && !Number.isInteger(expected)) {
    assert.ok(typeof actual === 'number' && Math.abs(actual - expected) < 0.0002,
      `${field}: Godot ${actual}, source ${expected}`);
  } else if (expected !== null && typeof expected === 'object') {
    assert.ok(actual !== null && typeof actual === 'object', field);
    assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), field);
    for (const key of Object.keys(expected)) assertParity(actual[key], expected[key], `${field}.${key}`);
  } else {
    assert.equal(actual, expected, field);
  }
}

function runProbe(t) {
  const requested = process.env.GODOT_BIN || path.resolve(forge, '../../../GoDotProjects/Godot_v4.7.2-stable_win64.exe');
  const direct = requested.replace(/_console\.exe$/i, '.exe');
  const executable = fs.existsSync(direct) ? direct : requested;
  assert.ok(path.isAbsolute(executable) && fs.existsSync(executable), `Set GODOT_BIN to the absolute path of a Godot executable. Checked ${executable}`);

  const isolated = fs.mkdtempSync(path.join(os.tmpdir(), 'playforge-fortress-parity-'));
  t.after(() => fs.rmSync(isolated, { recursive: true, force: true }));
  for (const name of ['project.godot', 'data/catalog.json', 'scripts/fort_engine.gd', 'tests/parity_probe.gd']) {
    const destination = path.join(isolated, name);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(project, name), destination);
  }
  const fixture = path.join(isolated, 'parity-input.json');
  fs.writeFileSync(fixture, JSON.stringify({ options, shot, chargeTimes, surfaceColumns, tankKeys, turnKeys, projectileKeys, actionKeys }));
  const result = spawnSync(executable, ['--headless', '--path', isolated, '--script', 'res://tests/parity_probe.gd', '--', fixture], {
    cwd: isolated, encoding: 'utf8', timeout: 30000, windowsHide: true,
  });
  const log = path.join(forge, 'Saved', 'Tests', 'fortress-war', 'parity-probe.log');
  const output = [result.stdout, result.stderr, result.error?.message].filter(Boolean).join('\n');
  fs.mkdirSync(path.dirname(log), { recursive: true });
  fs.writeFileSync(log, output);
  const diagnostic = `${log}\n${output.slice(-4000)}`;
  assert.equal(result.error, undefined, diagnostic);
  assert.equal(result.status, 0, diagnostic);
  assert.doesNotMatch(output, /\b(?:SCRIPT ERROR|ERROR|Parse Error|Assertion failed)\b/i, diagnostic);
  const report = result.stdout.match(/^FORTRESS_WAR_PARITY (.+)$/m);
  assert.ok(report, diagnostic);
  return JSON.parse(report[1]);
}

test('Fortress War bundles the complete source catalog', () => {
  const expected = JSON.parse(JSON.stringify(original.FortData));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(project, 'data/catalog.json'), 'utf8')), expected);
});

test('Fortress War matches source spawning, aiming, and a hit across a full turn', { timeout: 40000 }, t => {
  const seeded = JSON.parse(JSON.stringify(options.map(config => seededMatch(new original.FortEngine(config)))));
  const completedShot = JSON.parse(JSON.stringify(playShot(new original.FortEngine(options[0]))));

  assert.deepEqual(seeded.map(match => [match.turn.wind, match.terrain.solidCount, match.tanks.length]), [
    [-0.1, 358158, 2], [2.2, 216139, 8], [2.8, 329740, 8],
  ]);
  assert.deepEqual(seeded[0].charge, [0, 14, 72, 99, 56, 2, 80]);
  assert.deepEqual(completedShot.action, {
    ownerId: 't0_0', weaponId: 'catapult_w1', shots: 1, damageToEnemy: 92, friendlyDamage: 0,
    hits: 1, terrainRemoved: 1305, reason: 'hit',
  });

  const actual = runProbe(t);
  assertParity(actual, { seeded, completedShot }, 'probe');
});
