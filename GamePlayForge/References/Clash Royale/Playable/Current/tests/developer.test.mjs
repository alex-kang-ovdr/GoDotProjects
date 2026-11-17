import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, CARDS, DEFAULT_DECK } from '../dist/js/engine.js';
import { ReplayPlayer, serializeReplayFile, parseReplayFile } from '../dist/js/session.js';

const STEP = 1 / 60;
const copy = value => structuredClone(value);
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-6,
  `${message || 'value'}: ${actual} != ${expected}`);
function fixture(options = {}) {
  return new Game({ seed: 4401, developerMode: true, practice: true, rulesVersion: 4, ...options }).start();
}
function quiet(game) { for (const tower of game.state.towers) tower.active = false; }
function advance(game, seconds) {
  for (let index = 0; index < Math.round(seconds / STEP); index++) game.update(STEP);
}
function success(result) { assert.equal(result?.ok, true, result?.reason); return result; }
function rejectWithoutChange(game, action) {
  const before = game.exportSnapshot();
  const result = action();
  assert.equal(result?.ok, false);
  assert.equal(typeof result.reason, 'string');
  assert.deepEqual(game.exportSnapshot(), before);
}
function spawn(game, team, id, x = 210, y = team === 'player' ? 430 : 210) {
  const before = new Set(game.state.units.map(unit => unit.id));
  const result = success(game.spawnDeveloperCard(team, id, x, y));
  return { result, units: game.state.units.filter(unit => !before.has(unit.id)) };
}
function infinite(game) {
  success(game.setDeveloperCheats({ infiniteElixir: { player: true, enemy: true } }));
}
// Explicit input fixture: preserve the original eight-card hand/queue partition.
function equip(game, team, id) {
  const hand = game.state.hands[team], queue = game.state.queues[team];
  if (!hand.includes(id)) {
    const at = queue.indexOf(id); assert.ok(at >= 0);
    [hand[0], queue[at]] = [queue[at], hand[0]];
  }
  return hand.indexOf(id);
}

test('developer privileges require an explicit rules-4 practice game and cannot operate in training, replay or finished battles', () => {
  for (const config of [
    { developerMode: true, practice: false, rulesVersion: 4 },
    { developerMode: true, practice: true, rulesVersion: 3 },
    { developerMode: true, practice: true, rulesVersion: 4, abilityMode: 'training' },
  ]) assert.throws(() => new Game({ seed: 1, ...config }));
  const cases = [new Game({ seed: 1 }).start(), new Game({ seed: 1, practice: true }).start(),
    new Game({ seed: 1, practice: true, abilityMode: 'training' }).start()];
  const replay = fixture(); replay._replaying = true; cases.push(replay);
  const finished = fixture(); success(finished.concede('player')); cases.push(finished);
  for (const game of cases) {
    rejectWithoutChange(game, () => game.setCardBalance('knight', { damage: 220 }));
    rejectWithoutChange(game, () => game.resetCardBalance('knight'));
    rejectWithoutChange(game, () => game.setDeveloperCheats({ freePlacement: true }));
    rejectWithoutChange(game, () => game.spawnDeveloperCard('enemy', 'knight', 210, 210));
  }
  const game = fixture();
  assert.deepEqual(game.getDeveloperState().cheats,
    { infiniteElixir: { player: false, enemy: false }, noAbilityCooldown: false, freePlacement: false });
  assert.equal(game.getDeveloperState().enabled, true);
});

test('resolved cards and schema are detached, team-specific, and isolated from other matches and immutable global definitions', () => {
  const global = copy(CARDS), game = fixture(), other = fixture(), normal = new Game({ seed: 3 });
  const fields = game.getBalanceFields('knight');
  assert.ok(fields.length > 0 && fields.some(field => field.key === 'hp'));
  assert.equal(new Set(fields.map(field => field.key)).size, fields.length);
  for (const field of fields) {
    assert.equal(typeof field.label, 'string'); assert.equal(typeof field.unit, 'string');
    assert.ok(Number.isFinite(field.min) && Number.isFinite(field.max) && field.min <= field.max);
    assert.ok(Number.isFinite(field.step) && field.step > 0);
  }
  const fieldBefore = copy(fields);
  try { fields[0].max = -1; } catch {}
  assert.deepEqual(game.getBalanceFields('knight'), fieldBefore);
  const patch = { hp: 1600, damage: 220 };
  success(game.setCardBalance('knight', patch, { team: 'player' }));
  patch.hp = 1;
  assert.equal(game.getCard('knight', 'player').hp, 1600);
  assert.equal(game.getCard('knight').damage, 220);
  assert.equal(game.getCard('knight', 'enemy').hp, global.knight.hp);
  const resolved = game.getCard('knight');
  try { resolved.hp = 2; } catch {}
  const exposed = game.getDeveloperState();
  exposed.balance.player.knight.hp = 3;
  exposed.cheats.infiniteElixir.player = true;
  assert.equal(game.getCard('knight').hp, 1600);
  assert.equal(game.getDeveloperState().cheats.infiniteElixir.player, false);
  const incoming = { infiniteElixir: { enemy: true } };
  success(game.setDeveloperCheats(incoming));
  incoming.infiniteElixir.enemy = false;
  assert.equal(game.getDeveloperState().cheats.infiniteElixir.enemy, true);
  assert.equal(other.getCard('knight').hp, global.knight.hp);
  assert.equal(normal.getCard('knight').hp, global.knight.hp);
  assert.deepEqual(CARDS, global);
});

test('balance and cheat validation is atomic across both teams and never coerces malformed inputs', () => {
  const game = fixture();
  success(game.setCardBalance('knight', { damage: 220 }, { team: 'player' }));
  success(game.setCardBalance('knight', { damage: 180 }, { team: 'enemy' }));
  const damageField = game.getBalanceFields('knight').find(field => field.key === 'damage');
  for (const patch of [
    null, [], '220', { hp: 1600, damage: NaN }, { hp: 1600, damage: Infinity },
    { hp: 1600, damage: '220' }, { hp: 1600, damage: { value: 220 } },
    { hp: 1600, damage: damageField.max + 1 }, { hp: 1600, damage: damageField.min - 1 },
    { hp: 1600, unknownStat: 1 }, JSON.parse('{"hp":1600,"__proto__":{"damage":1}}'),
  ]) rejectWithoutChange(game, () => game.setCardBalance('knight', patch, { team: 'both' }));
  rejectWithoutChange(game, () => game.setCardBalance('constructor', { hp: 1600 }));
  rejectWithoutChange(game, () => game.setCardBalance('knight', { hp: 1600 }, { team: 'spectator' }));
  for (const patch of [
    null, [], { freePlacement: 'true' }, { noAbilityCooldown: 1 },
    { freePlacement: true, unknown: false },
    { freePlacement: true, infiniteElixir: { player: true, enemy: 'false' } },
    { infiniteElixir: { player: true, spectator: true } },
  ]) rejectWithoutChange(game, () => game.setDeveloperCheats(patch));
  let getterCalls = 0;
  const accessor = { hp: 1600 };
  Object.defineProperty(accessor, 'damage', { enumerable: true, get() { getterCalls++; return 220; } });
  rejectWithoutChange(game, () => game.setCardBalance('knight', accessor));
  assert.equal(getterCalls, 0, 'validation must not execute caller-supplied property accessors');
});

test('live tuning while paused preserves HP and attack progress, independent statuses, and does not revive dead units', () => {
  const game = fixture(); infinite(game); quiet(game);
  const own = spawn(game, 'player', 'knight').units[0];
  const foe = spawn(game, 'enemy', 'knight').units[0];
  const dead = spawn(game, 'player', 'knight', 300, 430).units[0];
  own.hp = own.maxHp * .35;
  own.attackCooldown = own.attackInterval * .6;
  own.stunRemaining = .7; own.frostRemaining = .4; own.slowRemaining = .9; own.slowFactor = .5;
  dead.hp = 0;
  game.pause();
  const position = { x: own.x, y: own.y }, enemyBefore = copy(foe), deadId = dead.id;
  const time = game.state.time, tick = game.state.tick, commands = copy(game.commands);
  success(game.setCardBalance('knight', { hp: 1600, damage: 220, attackInterval: 2, speed: 45, range: 25 }, { team: 'player' }));
  assert.equal(own.maxHp, 1600); close(own.hp, 560, 'HP ratio'); close(own.attackCooldown, 1.2, 'attack progress');
  assert.equal(own.damage, 220); assert.equal(own.speed, 45); assert.equal(own.range, 25);
  assert.deepEqual({ x: own.x, y: own.y }, position);
  assert.deepEqual([own.stunRemaining, own.frostRemaining, own.slowRemaining, own.slowFactor], [.7, .4, .9, .5]);
  assert.deepEqual(foe, enemyBefore);
  assert.equal(game.state.units.find(unit => unit.id === deadId)?.hp ?? 0, 0);
  assert.equal(game.state.running, false); assert.equal(game.state.time, time); assert.equal(game.state.tick, tick);
  assert.deepEqual(game.commands, commands);
  rejectWithoutChange(game, () => game.spawnDeveloperCard('player', 'goblins', 360, 420));
  success(game.setCardBalance('knight', { damage: 333 }, { team: 'player', applyExisting: false }));
  assert.equal(own.damage, 220); assert.equal(game.getCard('knight').damage, 333);
  game.resume();
  assert.equal(spawn(game, 'player', 'knight', 50, 430).units[0].damage, 333);
  game.pause(); success(game.resetCardBalance('knight', 'player'));
  close(own.hp / own.maxHp, .35, 'HP ratio after reset');
  assert.equal(own.damage, CARDS.knight.damage);
  assert.equal(game.getCard('knight').hp, CARDS.knight.hp);
  assert.equal(game.state.running, false);
});

test('in-flight projectiles retain their old damage while the next attack uses the updated card', () => {
  const game = fixture(); infinite(game); quiet(game);
  const archer = spawn(game, 'player', 'archers', 210, 410).units[0];
  const target = spawn(game, 'enemy', 'giant', 210, 210).units[0];
  // A controlled attack isolates projectile scheduling from pathfinding and AI.
  const oldDamage = archer.damage, hp = target.hp;
  game._attack(archer, target);
  const fired = copy(game.state.projectiles);
  success(game.setCardBalance('archers', { damage: oldDamage + 100 }, { team: 'player' }));
  assert.deepEqual(game.state.projectiles, fired);
  game._updateProjectiles(1);
  close(target.hp, hp - oldDamage, 'already-fired hit');
  game._attack(archer, target); game._updateProjectiles(1);
  close(target.hp, hp - oldDamage * 2 - 100, 'new hit');
});

test('pending spells and existing poison retain cast-time values across tuning and snapshot restoration', () => {
  const game = fixture(); infinite(game); quiet(game);
  const tower = game.state.towers.find(entity => entity.id === 'enemy-left');
  const fireball = game.getCard('fireball'), initialHp = tower.hp;
  spawn(game, 'player', 'fireball', tower.x, tower.y);
  game.pause();
  success(game.setCardBalance('fireball', { damage: fireball.damage + 200, crownDamage: fireball.crownDamage + 77 }, { team: 'player' }));
  const restored = Game.fromSnapshot(game.exportSnapshot());
  assert.equal(restored.state.running, false);
  game.resume(); restored.resume(); advance(game, 1); advance(restored, 1);
  close(tower.hp, initialHp - fireball.crownDamage, 'old queued spell');
  assert.deepEqual(restored.exportSnapshot(), game.exportSnapshot());
  spawn(game, 'player', 'fireball', tower.x, tower.y); advance(game, 1);
  close(tower.hp, initialHp - fireball.crownDamage * 2 - 77, 'new spell');
  const poison = game.getCard('poison');
  spawn(game, 'player', 'poison', tower.x, tower.y); advance(game, .6);
  const area = game.state.areas.find(value => value.cardId === 'poison');
  assert.ok(area); const areaBefore = copy(area);
  success(game.setCardBalance('poison', { damage: poison.damage + 25, crownDamage: poison.crownDamage + 10,
    spellRadius: poison.spellRadius + 10, duration: poison.duration + 2 }, { team: 'player' }));
  assert.deepEqual(area, areaBefore);
  const beforeTick = tower.hp;
  game._updateAreas(area.tickRemaining + 1e-5);
  close(tower.hp, beforeTick - poison.crownDamage, 'existing poison tick');
});

test('developer spawning preserves both hand cycles and binds off-deck phalanx squads to their own commands', () => {
  const game = fixture(); infinite(game); quiet(game);
  assert.equal(DEFAULT_DECK.includes('phalanx'), false);
  const hands = copy(game.state.hands), queues = copy(game.state.queues);
  for (const team of ['player', 'enemy']) {
    const beforeCards = game.state.stats[team].cardsPlayed;
    const cast = spawn(game, team, 'phalanx', 120, team === 'player' ? 430 : 210);
    assert.equal(cast.units.length, 6);
    assert.equal(game.state.stats[team].cardsPlayed, beforeCards + 1);
    const command = game.commands.at(-1);
    assert.equal(command.type, 'developer-spawn'); assert.equal(command.team, team);
    assert.equal(command.cardId, 'phalanx'); assert.equal(Object.hasOwn(command, 'handIndex'), false);
    assert.ok(cast.units.every(unit => unit.formationGroupId === command.groupId));
  }
  assert.deepEqual(game.state.hands, hands); assert.deepEqual(game.state.queues, queues);
  advance(game, 2);
  for (const team of ['player', 'enemy']) {
    const ability = game.getAbilities(team)[0]; assert.ok(ability?.ready);
    success(game.activateAbility(team, ability.groupId));
  }
  game.pause();
  const restored = Game.fromSnapshot(game.exportSnapshot());
  assert.deepEqual(restored.exportSnapshot(), game.exportSnapshot());
  for (const team of ['player', 'enemy']) assert.ok(restored.getAbilities(team)[0].chargeRemaining > 0);
});

test('both teams use their actual playCard hand cycle and infinite elixir refills after nominal expenditure', () => {
  const game = fixture(); quiet(game);
  game.pause(); const tick = game.state.tick;
  success(game.setDeveloperCheats({ infiniteElixir: { player: true, enemy: true } }));
  assert.equal(game.state.running, false); assert.equal(game.state.tick, tick);
  assert.deepEqual(game.state.elixir, { player: 10, enemy: 10 });
  game.resume();
  for (const team of ['player', 'enemy']) {
    success(game.setCardBalance('knight', { cost: team === 'player' ? 7 : 4 }, { team }));
    const slot = equip(game, team, 'knight'), next = game.state.queues[team][0];
    const spent = game.state.stats[team].elixirSpent;
    success(game.playCard(team, slot, 210, team === 'player' ? 430 : 210));
    assert.equal(game.state.hands[team][slot], next);
    assert.equal(game.state.queues[team].at(-1), 'knight');
    assert.equal(game.state.elixir[team], 10);
    assert.equal(game.state.stats[team].elixirSpent - spent, game.getCard('knight', team).cost);
  }
  game.pause(); success(game.setDeveloperCheats({ infiniteElixir: { player: false } }));
  assert.deepEqual(game.getDeveloperState().cheats.infiniteElixir, { player: false, enemy: true });
  game.resume();
  spawn(game, 'player', 'knight', 60, 430);
  assert.equal(game.state.elixir.player, 3);
  rejectWithoutChange(game, () => game.spawnDeveloperCard('player', 'knight', 360, 430));
});

test('free placement removes team territory limits while keeping arena, water and occupied tower constraints', () => {
  const game = fixture(); infinite(game); quiet(game);
  rejectWithoutChange(game, () => game.spawnDeveloperCard('player', 'knight', 240, 210));
  game.pause(); const tick = game.state.tick;
  success(game.setDeveloperCheats({ freePlacement: true }));
  assert.equal(game.state.running, false); assert.equal(game.state.tick, tick);
  game.resume();
  const preview = game.previewDeployment('player', 'knight', 240, 210);
  assert.equal(preview.ok, true);
  const own = spawn(game, 'player', 'knight', 240, 210).units[0];
  assert.deepEqual({ x: own.x, y: own.y }, { x: preview.positions[0].x, y: preview.positions[0].y });
  assert.equal(spawn(game, 'enemy', 'knight', 240, 430).units[0].team, 'enemy');
  for (const [x, y] of [[-1, 430], [481, 210], [120, 150]]) {
    rejectWithoutChange(game, () => game.spawnDeveloperCard('player', 'knight', x, y));
  }
  // The common planner may relocate a river click to nearby legal ground.
  // Assert the real bodies and authoritative preview, not a center-only policy.
  const riverPreview = game.previewDeployment('player', 'knight', 240, 320);
  if (riverPreview.ok) {
    const riverSpawn = spawn(game, 'player', 'knight', 240, 320).units;
    assert.deepEqual(riverSpawn.map(({ x, y, radius, flying }) => ({ x, y, radius, flying })), riverPreview.positions);
    for (const unit of riverSpawn) {
      const touchesRiver = unit.y + unit.radius > 300 && unit.y - unit.radius < 340;
      assert.ok(!touchesRiver || Math.min(Math.abs(unit.x - 120), Math.abs(unit.x - 360)) + unit.radius <= 27 + 1e-7);
    }
  } else rejectWithoutChange(game, () => game.spawnDeveloperCard('player', 'knight', 240, 320));
  success(game.setDeveloperCheats({ freePlacement: false }));
  rejectWithoutChange(game, () => game.spawnDeveloperCard('player', 'knight', 50, 210));
});

test('ability cooldown bypass can be configured while paused but cannot bypass pause, deployment or an active charge', () => {
  const game = fixture(); infinite(game); quiet(game);
  const { result } = spawn(game, 'player', 'phalanx', 120, 590);
  const groupId = result.groupId || game.getAbilities('player')[0].groupId;
  success(game.setDeveloperCheats({ noAbilityCooldown: true }));
  rejectWithoutChange(game, () => game.activateAbility('player', groupId));
  advance(game, 2); success(game.activateAbility('player', groupId));
  rejectWithoutChange(game, () => game.activateAbility('player', groupId));
  game.pause(); const time = game.state.time;
  success(game.setDeveloperCheats({ noAbilityCooldown: false }));
  success(game.setDeveloperCheats({ noAbilityCooldown: true }));
  assert.equal(game.state.running, false); assert.equal(game.state.time, time);
  rejectWithoutChange(game, () => game.activateAbility('player', groupId));
  game.resume(); advance(game, game.getCard('phalanx').abilityDuration + .1);
  assert.equal(game.getAbilities('player')[0].chargeRemaining, 0);
  success(game.activateAbility('player', groupId));
});

test('developer snapshots restore strict, isolated balance and cheats, while rules-2/3 saves keep their old shape', () => {
  const game = fixture(); infinite(game); quiet(game);
  success(game.setCardBalance('knight', { hp: 1600, damage: 220 }, { team: 'player' }));
  success(game.setCardBalance('knight', { hp: 900, damage: 180 }, { team: 'enemy' }));
  spawn(game, 'player', 'knight'); spawn(game, 'enemy', 'knight'); advance(game, .8); game.pause();
  const snapshot = game.exportSnapshot(), restored = Game.fromSnapshot(snapshot);
  assert.equal(snapshot.config.developerMode, true); assert.equal(snapshot.developer.version, 1);
  assert.deepEqual(restored.exportSnapshot(), snapshot);
  assert.deepEqual(restored.getDeveloperState(), game.getDeveloperState());
  restored.resume(); game.resume(); advance(restored, 1); advance(game, 1);
  assert.deepEqual(restored.exportSnapshot(), game.exportSnapshot());
  snapshot.developer.balance.player.knight.hp = 1;
  assert.equal(restored.getCard('knight').hp, 1600);
  const valid = game.exportSnapshot();
  for (const alter of [
    value => { delete value.developer; },
    value => { delete value.config.developerMode; },
    value => { value.config.practice = false; },
    value => { value.config.rulesVersion = 3; },
    value => { value.developer.version = 2; },
    value => { value.developer.balance.player.knight.hp = Infinity; },
    value => { value.developer.balance.enemy.knight.damage = '180'; },
    value => { value.developer.balance.player.unknown_card = { hp: 100 }; },
    value => { value.developer.cheats.infiniteElixir.enemy = 1; },
    value => { value.developer.cheats.unboundedOption = true; },
  ]) {
    const broken = copy(valid); alter(broken);
    assert.throws(() => Game.fromSnapshot(broken));
  }
  for (const rulesVersion of [2, 3]) {
    const legacy = new Game({ seed: 47, rulesVersion }).start(); advance(legacy, .2); legacy.pause();
    const saved = legacy.exportSnapshot();
    assert.equal(Object.hasOwn(saved, 'developer'), false);
    assert.equal(Object.hasOwn(saved.config, 'developerMode'), false);
    assert.deepEqual(Game.fromSnapshot(saved).exportSnapshot(), saved);
  }
});

test('developer battles cannot export, import or masquerade as ordinary replay files', () => {
  const developer = fixture();
  assert.throws(() => developer.exportReplay());
  const normal = new Game({ seed: 34, rulesVersion: 4 }).start(); advance(normal, .1);
  const record = normal.exportReplay();
  const player = new ReplayPlayer(record);
  while (!player.done) player.step();
  assert.deepEqual(player.game.exportSnapshot(), normal.exportSnapshot());
  const injected = copy(record);
  injected.config.practice = true; injected.config.developerMode = true;
  assert.throws(() => new ReplayPlayer(injected));
  assert.throws(() => serializeReplayFile({ replay: injected, opponentId: 'bran' }));
  assert.throws(() => parseReplayFile(JSON.stringify({ format: 'crownfall-replay', version: 1, replay: injected })));
});
