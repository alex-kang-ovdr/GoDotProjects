import test from 'node:test';
import assert from 'node:assert/strict';
import { CARDS, DEFAULT_DECK, Game } from '../dist/js/engine.js';

const DT = 1 / 60;
const V2_DECK = ['hog_rider', 'spear_goblins', 'duelist', 'zap', 'poison', 'ice_spirit', 'cannon', 'knight'];
const copy = value => JSON.parse(JSON.stringify(value));

function advance(game, seconds) {
  for (let i = 0; i < Math.round(seconds / DT); i++) game.update(DT);
}

function gameWith(deck = V2_DECK, seed = 721) {
  return new Game({ deck, enemyDeck: deck, seed }).start();
}

// Scenario arrangement: change only hand order/funding, then use the real play API.
// Replay tests below deliberately do not use this helper.
function play(game, team, id, x, y) {
  const hand = game.state.hands[team], queue = game.state.queues[team];
  let index = hand.indexOf(id);
  if (index < 0) {
    const queued = queue.indexOf(id);
    if (queued >= 0) [hand[0], queue[queued]] = [queue[queued], hand[0]];
    else hand[0] = id;
    index = 0;
  }
  game.state.elixir[team] = 10;
  const result = game.playCard(team, index, x, y);
  assert.equal(result.ok, true, `${id}: ${result.reason}`);
  return game.state.units.filter(u => u.team === team && u.cardId === id).at(-1);
}

function troop(game, team, id, x, y) {
  const before = new Set(game.state.units.map(u => u.id));
  play(game, team, id, 240, team === 'player' ? 420 : 220);
  const spawned = game.state.units.filter(u => !before.has(u.id));
  const unit = spawned[0];
  game.state.units = game.state.units.filter(u => !spawned.includes(u) || u === unit);
  Object.assign(unit, { x, y, deployRemaining: 0, active: true });
  return unit;
}

function quietTowers(game) {
  for (const tower of game.state.towers) tower.active = false;
}

test('the complete card pool retains v2 cards and validates independent enemy decks', () => {
  assert.equal(Object.keys(CARDS).length, 21);
  for (const id of V2_DECK) {
    assert.equal(CARDS[id].id, id);
    assert.ok(CARDS[id].cost >= 1 && CARDS[id].name && CARDS[id].role && CARDS[id].description);
  }
  const enemyDeck = [...V2_DECK];
  const game = new Game({ enemyDeck, seed: 9 });
  enemyDeck[0] = 'knight';
  assert.deepEqual(game.enemyDeck, V2_DECK);
  assert.deepEqual([...game.state.hands.enemy, ...game.state.queues.enemy].sort(), [...V2_DECK].sort());
  assert.deepEqual(game.deck, DEFAULT_DECK);
  assert.throws(() => new Game({ enemyDeck: Array(8).fill('knight') }));
  assert.throws(() => new Game({ enemyDeck: ['__proto__', ...V2_DECK.slice(1)] }));
  const sparse = [...V2_DECK]; delete sparse[0];
  assert.throws(() => new Game({ deck: sparse }));
  assert.equal(game.canDeploy('player', '__proto__', 240, 420).ok, false);
});

test('target retention, building priority and ground-only filters share valid target rules', () => {
  const game = gameWith();
  quietTowers(game);
  const hog = troop(game, 'player', 'hog_rider', 230, 420);
  const knight = troop(game, 'enemy', 'knight', 232, 400);
  const air = troop(game, 'enemy', 'minions', 233, 410);
  const cannon = troop(game, 'enemy', 'cannon', 280, 420);
  assert.equal(game._acquireTarget(hog)?.id, cannon.id, 'building-only raider ignores nearer troops');
  cannon.x = 320;
  assert.equal(game._acquireTarget(hog)?.id, cannon.id, 'valid retained target is not needlessly reset');
  cannon.hp = 0;
  assert.equal(game._acquireTarget(hog)?.kind, 'tower', 'destroyed building releases its target lock');
  const guard = troop(game, 'player', 'knight', 230, 450);
  assert.equal(game._acquireTarget(guard)?.id, knight.id);
  air.x = 230; air.y = 440;
  assert.equal(game._acquireTarget(guard)?.id, knight.id, 'ground-only troop ignores closer flying unit');
  game._areaDamage('player', 235, 410, 70, 100, 'ground');
  assert.equal(air.hp, CARDS.minions.hp, 'ground splash cannot damage air');
  assert.equal(knight.hp, CARDS.knight.hp - 100);
});

test('self-centered melee splash hits enemies behind the attacker, not beyond the target', () => {
  const game = gameWith();
  quietTowers(game);
  const valkyrie = troop(game, 'player', 'valkyrie', 240, 420);
  const target = troop(game, 'enemy', 'knight', 275, 420);
  const behind = troop(game, 'enemy', 'knight', 205, 420);
  const beyond = troop(game, 'enemy', 'knight', 315, 420);
  const flying = troop(game, 'enemy', 'minions', 240, 435);
  game._attack(valkyrie, target);
  assert.equal(target.hp, CARDS.knight.hp - CARDS.valkyrie.damage);
  assert.equal(behind.hp, CARDS.knight.hp - CARDS.valkyrie.damage);
  assert.equal(beyond.hp, CARDS.knight.hp, 'splash origin must be the attacker for a spinning strike');
  assert.equal(flying.hp, CARDS.minions.hp);
  const tower = game.state.towers.find(t => t.team === 'enemy' && t.lane === 'left');
  valkyrie.x = tower.x; valkyrie.y = tower.y + 64;
  valkyrie.targetId = tower.id;
  advance(game, 1);
  assert.ok(tower.hp < tower.maxHp, 'large towers must be within the splash hitbox when the melee unit stops');
});

test('zap damages and activates a king, pauses nearby troop movement, then expires', () => {
  const game = gameWith();
  const king = game.state.towers.find(t => t.team === 'enemy' && t.type === 'king');
  const knight = troop(game, 'enemy', 'knight', 240, 112);
  play(game, 'player', 'zap', king.x, king.y);
  advance(game, 0.15);
  assert.equal(king.hp, king.maxHp - game.getCard('zap').crownDamage);
  assert.equal(king.active, true);
  assert.equal(knight.hp, CARDS.knight.hp - CARDS.zap.damage);
  assert.ok(knight.stunRemaining > 0.4);
  const position = [knight.x, knight.y];
  advance(game, 0.3);
  assert.deepEqual([knight.x, knight.y], position, 'stunned movement is paused');
  advance(game, 0.35);
  assert.equal(knight.stunRemaining, 0);
  assert.ok(knight.y > position[1], 'movement resumes after the finite stun');
});

test('poison delivers exactly eight ticks, reduced crown damage, anti-air and exit-aware slow', () => {
  const game = gameWith();
  quietTowers(game);
  const tower = game.state.towers.find(t => t.team === 'enemy' && t.lane === 'left');
  const ground = troop(game, 'enemy', 'knight', 165, 180);
  const flying = troop(game, 'enemy', 'minions', 100, 125);
  flying.hp = flying.maxHp = 1000;
  const friendly = troop(game, 'player', 'knight', 80, 190);
  const outside = troop(game, 'enemy', 'knight', 300, 180);
  for (const u of [ground, flying, friendly, outside]) u.deployRemaining = 20;
  play(game, 'player', 'poison', tower.x, tower.y);
  advance(game, 0.5);
  assert.equal(game.state.areas.length, 1);
  assert.equal(ground.hp, 1000, 'there is no instant poison damage before the first tick');
  assert.equal(ground.slowFactor, CARDS.poison.slowFactor);
  advance(game, 0.8);
  assert.equal(ground.hp, 1000 - CARDS.poison.damage);
  ground.x = 400;
  advance(game, 0.3);
  assert.equal(ground.slowRemaining, 0);
  assert.equal(ground.slowFactor, 1, 'leaving the region releases the slow');
  advance(game, 7);
  assert.equal(game.state.areas.length, 0);
  assert.equal(flying.hp, 1000 - CARDS.poison.totalDamage);
  assert.equal(tower.hp, tower.maxHp - game.getCard('poison').totalCrownDamage);
  assert.equal(ground.hp, 1000 - CARDS.poison.damage, 'only targets still inside receive later ticks');
  assert.equal(friendly.hp, CARDS.knight.hp);
  assert.equal(outside.hp, CARDS.knight.hp);
  advance(game, 1);
  assert.equal(flying.hp, 1000 - CARDS.poison.totalDamage, 'expired zones never produce a ninth tick');
});

test('ice spirit sacrifices itself once and freezes enemy ground and air without friendly fire', () => {
  const game = gameWith();
  quietTowers(game);
  const spirit = troop(game, 'player', 'ice_spirit', 240, 420);
  const enemy = troop(game, 'enemy', 'knight', 240, 455);
  const air = troop(game, 'enemy', 'minions', 250, 440);
  const friendly = troop(game, 'player', 'knight', 210, 420);
  for (const u of [enemy, air, friendly]) u.deployRemaining = 20;
  advance(game, 0.2);
  assert.equal(game.state.units.some(u => u.id === spirit.id), false);
  assert.equal(enemy.hp, CARDS.knight.hp - CARDS.ice_spirit.damage);
  assert.equal(air.hp, CARDS.minions.hp - CARDS.ice_spirit.damage);
  assert.ok(enemy.frostRemaining > 0.9 && air.stunRemaining > 0.9);
  assert.equal(friendly.hp, CARDS.knight.hp);
  advance(game, 0.5);
  assert.equal(enemy.hp, CARDS.knight.hp - CARDS.ice_spirit.damage, 'suicide damage is not repeated after cleanup');
});

test('building lifetime and decay continue through a stun and expire without awarding a crown', () => {
  const game = gameWith();
  quietTowers(game);
  const cannon = troop(game, 'player', 'cannon', 240, 410);
  game._applyStatus(cannon, { stunDuration: 60 });
  advance(game, 1);
  assert.ok(Math.abs(cannon.hp - (CARDS.cannon.hp - CARDS.cannon.hp / CARDS.cannon.duration)) < 1e-6);
  assert.ok(cannon.stunRemaining > 58);
  advance(game, 34.1);
  assert.equal(game.state.units.some(u => u.id === cannon.id), false);
  assert.deepEqual(game.state.crowns, { player: 0, enemy: 0 });
});

test('snapshot round trip preserves pending spells, projectiles, zones and status through continued combat', () => {
  const deck = ['poison', 'fireball', 'archers', 'knight', 'zap', 'cannon', 'ice_spirit', 'hog_rider'];
  const game = gameWith(deck, Date.now());
  const archer = troop(game, 'player', 'archers', 240, 420);
  const enemy = troop(game, 'enemy', 'knight', 240, 360);
  play(game, 'player', 'poison', 120, 150);
  advance(game, 0.3);
  play(game, 'player', 'zap', enemy.x, enemy.y);
  advance(game, 0.15);
  game._attack(archer, enemy);
  play(game, 'player', 'fireball', 360, 150);
  assert.ok(game.state.areas.length && game.state.projectiles.length && enemy.stunRemaining > 0);
  const saved = JSON.parse(JSON.stringify(game.exportSnapshot()));
  assert.ok(saved.pendingSpells.length);
  const restored = Game.fromSnapshot(saved);
  assert.equal(restored.state.running, false, 'import waits for an explicit continue action');
  const paused = restored.exportSnapshot();
  restored.update(DT);
  assert.deepEqual(restored.exportSnapshot(), paused);
  restored.resume();
  advance(game, 5);
  advance(restored, 5);
  assert.deepEqual(restored.exportSnapshot(), game.exportSnapshot());
  saved.state.elixir.player = 0;
  assert.notEqual(restored.state.elixir.player, 0, 'imported state does not alias the input object');
});

test('snapshot imports reject malformed numbers, cards, oversized arrays, getters and cycles', () => {
  const base = new Game({ seed: 33 }).exportSnapshot();
  const corruptions = [
    s => { s.version = 999; },
    s => { s.state.time = NaN; },
    s => { s.state.elixir.enemy = 100; },
    s => { s.state.hands.player[0] = '__proto__'; },
    s => { s.state.towers[0].attackInterval = 0; },
    s => { s.state.units = Array(513).fill({}); },
    s => { s.pendingSpells = [{ team: 'player', cardId: 'knight', x: 120, y: 150, remaining: 0.1 }]; },
    s => { s.commands = [{ tick: -1, team: 'player', handIndex: 0, cardId: 'knight', x: 120, y: 420 }]; },
  ];
  for (const corrupt of corruptions) { const bad = copy(base); corrupt(bad); assert.throws(() => Game.fromSnapshot(bad)); }
  const cyclic = copy(base); cyclic.state.loop = cyclic;
  assert.throws(() => Game.fromSnapshot(cyclic));
  let getterRead = false;
  const getter = copy(base);
  Object.defineProperty(getter.state, 'danger', { enumerable: true, get() { getterRead = true; return 1; } });
  assert.throws(() => Game.fromSnapshot(getter));
  assert.equal(getterRead, false);
});

test('accepted command replay reproduces exact fixed-tick combat without AI or hidden input', () => {
  const game = gameWith(V2_DECK, 611);
  assert.equal(game.state.tick, 0);
  assert.equal(game.playCard('player', -1, 120, 420).ok, false);
  assert.equal(game.commands.length, 0);
  for (let tick = 0; tick < 1800 && game.state.running; tick++) {
    if (tick % 90 === 0) {
      for (const team of ['player', 'enemy']) {
        const hand = game.state.hands[team];
        const index = hand.findIndex(id => CARDS[id].cost <= game.state.elixir[team]);
        if (index >= 0) {
          const c = CARDS[hand[index]];
          const x = c.type === 'building' ? 240 : 120;
          const y = c.type === 'spell' ? team === 'player' ? 150 : 490 : team === 'player' ? 400 : 240;
          game.playCard(team, index, x, y);
        }
      }
    }
    game.update(DT);
  }
  const count = game.commands.length, tick = game.state.tick;
  game.pause();
  assert.equal(game.playCard('player', 0, 120, 420).ok, false);
  game.update(DT);
  assert.equal(game.commands.length, count);
  assert.equal(game.state.tick, tick);
  game.resume();
  const replay = game.exportReplay();
  assert.equal(replay.version, 2);
  assert.equal(replay.step, DT);
  assert.ok(replay.commands.length >= 6);
  assert.equal(replay.commands[0].tick, replay.commands[1].tick, 'same-tick command order is retained');
  const playback = new Game(replay.config).start();
  let cursor = 0;
  while (playback.state.tick < replay.finalTick) {
    while (replay.commands[cursor]?.tick === playback.state.tick) {
      const c = replay.commands[cursor++];
      assert.equal(playback.state.hands[c.team][c.handIndex], c.cardId);
      assert.equal(playback.playCard(c.team, c.handIndex, c.x, c.y).ok, true);
    }
    playback.update(replay.step);
  }
  assert.equal(cursor, replay.commands.length);
  assert.deepEqual(playback.exportSnapshot(), game.exportSnapshot());
  replay.config.deck[0] = 'knight';
  replay.commands[0].x = 999;
  assert.equal(game.initialConfig.deck[0], V2_DECK[0]);
  assert.notEqual(game.commands[0].x, 999, 'exports are detached JSON copies');
});
