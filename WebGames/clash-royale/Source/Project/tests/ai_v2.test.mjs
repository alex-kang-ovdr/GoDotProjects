import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, CARDS, DEFAULT_DECK } from '../dist/js/engine.js';
import { BattleAI } from '../dist/js/ai.js';
import { DECK_PRESETS, OPPONENTS } from '../dist/js/decks.js';

const DT = 1 / 60;
const clone = value => JSON.parse(JSON.stringify(value));
const troop = (id, cardId, x, y, extra = {}) => ({
  id, cardId, x, y, team: 'player', hp: CARDS[cardId].hp,
  maxHp: CARDS[cardId].hp, radius: CARDS[cardId].radius,
  speed: CARDS[cardId].speed, flying: CARDS[cardId].flying,
  isBuilding: CARDS[cardId].type === 'building', ...extra,
});

function visibleWorld({ hand, units = [], elixir = 10, towerHp = 1850 } = {}) {
  const plays = [], checks = [];
  const hands = { enemy: [...hand] }, resources = { enemy: elixir };
  Object.defineProperty(hands, 'player', { get() { throw new Error('opponent hand is hidden'); } });
  Object.defineProperty(resources, 'player', { get() { throw new Error('opponent elixir is hidden'); } });
  const world = {
    seed: 123, height: 640, plays, checks,
    state: {
      time: 5, running: true, phase: 'regulation', winner: null,
      hands, elixir: resources, units,
      crowns: { player: 0, enemy: 0 },
      towers: ['player', 'enemy'].flatMap(team => [120, 360].map(x => ({
        id: `${team}-${x}`, type: 'princess', kind: 'tower', team, x,
        y: team === 'player' ? 490 : 150, hp: team === 'player' ? towerHp : 1850,
        maxHp: 1850, radius: 25, isBuilding: true,
      }))),
    },
    canDeploy(team, id, x, y) {
      checks.push({ team, id, x, y });
      return { ok: team === 'enemy' && CARDS[id].cost <= resources.enemy &&
        Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 480 && y >= 0 && y <= 640 &&
        (CARDS[id].type === 'spell' || y <= 300) };
    },
    playCard(team, index, x, y) {
      const id = hands.enemy[index];
      assert.equal(this.canDeploy(team, id, x, y).ok, true, 'all AI actions must pass normal deploy validation');
      const cost = CARDS[id].cost;
      resources.enemy -= cost;
      plays.push({ id, x, y, cost });
      return { ok: true, cardId: id };
    },
  };
  return world;
}
function thinkFor(ai, world, seconds = 2) {
  for (let i = 0; i < seconds / DT; i++) {
    ai.update(DT);
    world.state.time += DT;
  }
}

test('four presets and three opponents each contain eight distinct valid cards', () => {
  assert.equal(Object.keys(CARDS).length, 19);
  assert.equal(DECK_PRESETS.length, 4);
  assert.equal(OPPONENTS.length, 3);
  assert.deepEqual(DECK_PRESETS.map(d => d.id), ['beatdown', 'rapid', 'control', 'phalanx']);
  assert.deepEqual(OPPONENTS.map(o => o.style), ['beatdown', 'cycle', 'control']);
  for (const deck of [...DECK_PRESETS.map(d => d.cards), ...OPPONENTS.map(o => o.deck)]) {
    assert.equal(deck.length, 8);
    assert.equal(new Set(deck).size, 8);
    for (const id of deck) assert.ok(CARDS[id], id);
  }
  assert.equal(new Set(DECK_PRESETS.flatMap(d => d.cards)).size, 19, 'the presets demonstrate the complete card pool');
});

test('all available cards can produce a useful, legal AI action in an appropriate visible arena', () => {
  for (const [id, card] of Object.entries(CARDS)) {
    const units = card.type === 'spell'
      ? [0, 1, 2].map(i => troop(`p${i}`, 'archers', 120 + i * 8, 240, { hp: 40 }))
      : card.type === 'building' ? [troop('tank', 'giant', 120, 245)] : [];
    const world = visibleWorld({ hand: [id], units });
    const ai = new BattleAI(world, { difficulty: 'hard', style: 'balanced', seed: 44 });
    thinkFor(ai, world);
    assert.ok(world.plays.some(p => p.id === id), `${id} should be considered for its combat role`);
    assert.ok(world.state.elixir.enemy >= 0);
    assert.equal(world.state.elixir.enemy, 10 - world.plays.reduce((n, p) => n + p.cost, 0));
  }
});

test('every style observes only visible units and its own hand and elixir', () => {
  for (const style of ['balanced', 'beatdown', 'cycle', 'control']) {
    const world = visibleWorld({
      hand: ['hog_rider', 'zap', 'spear_goblins', 'ice_spirit'],
      units: [troop('a', 'goblins', 120, 230), troop('b', 'goblins', 129, 235)],
    });
    const ai = new BattleAI(world, { style, difficulty: 'hard' });
    assert.doesNotThrow(() => thinkFor(ai, world, 5));
    assert.ok(world.plays.length > 0);
  }
});

test('spells do not cycle into empty ground and poison never assumes full-duration tower damage', () => {
  for (const id of ['fireball', 'arrows', 'zap', 'poison']) {
    const world = visibleWorld({ hand: [id], towerHp: id === 'poison' ? 30 : 1850 });
    thinkFor(new BattleAI(world, { difficulty: 'hard', style: 'control' }), world, 3);
    assert.deepEqual(world.plays, [], `${id} should preserve elixir when it has no useful target`);
  }
  const world = visibleWorld({ hand: ['zap'], towerHp: CARDS.zap.crownDamage });
  thinkFor(new BattleAI(world, { difficulty: 'hard' }), world, 0.8);
  assert.equal(world.plays[0]?.id, 'zap', 'a real immediate tower finisher remains available');
});

test('cycle pressure chooses the opposite lane from a visible heavy commitment', () => {
  const world = visibleWorld({ hand: ['hog_rider'], units: [troop('push', 'giant', 120, 540)], elixir: 8 });
  const ai = new BattleAI(world, { difficulty: 'hard', style: 'cycle', seed: 5 });
  ai.preferredLane = 120;
  thinkFor(ai, world, 0.7);
  assert.ok(world.plays.length > 0);
  assert.ok(world.plays[0].x > 300, 'the right lane is open while the visible giant commits left');
  assert.equal(ai.lastDecision.intent, 'split-pressure');
});

test('an existing poison zone does not delay a guaranteed immediate tower finisher', () => {
  const world = visibleWorld({ hand: ['zap'], towerHp: CARDS.zap.crownDamage });
  world.state.towers.find(t => t.team === 'player' && t.x === 360).hp = 1850;
  const ai = new BattleAI(world, { difficulty: 'hard', style: 'control' });
  ai.recentPlays = [{ time: world.state.time - 1, cardId: 'poison', intent: 'control-spell', x: 120, y: 490 }];
  thinkFor(ai, world, 0.7);
  assert.equal(world.plays[0]?.id, 'zap');
  assert.equal(world.plays[0].x, 120, 'the poisoned tower can be finished immediately');
  assert.equal(ai.lastDecision.intent, 'finish-tower');
});

test('a building-targeting attacker favors the lane without a visible defensive building', () => {
  const world = visibleWorld({ hand: ['hog_rider'], units: [troop('defense', 'cannon', 120, 400)], elixir: 8 });
  const ai = new BattleAI(world, { difficulty: 'hard', style: 'cycle' });
  ai.preferredLane = 120;
  thinkFor(ai, world, 0.7);
  assert.ok(world.plays[0].x > 300);
});

test('existing local defenders suppress unnecessary spending on a small skirmish', () => {
  const attack = troop('threat', 'goblins', 120, 260);
  const covered = visibleWorld({ hand: ['goblins'], elixir: 3, units: [attack,
    troop('d1', 'duelist', 120, 200, { team: 'enemy' }),
    troop('d2', 'duelist', 145, 210, { team: 'enemy' }),
  ] });
  const exposed = visibleWorld({ hand: ['goblins'], elixir: 3, units: [attack] });
  thinkFor(new BattleAI(covered, { difficulty: 'hard' }), covered);
  thinkFor(new BattleAI(exposed, { difficulty: 'hard' }), exposed);
  assert.equal(covered.plays.length, 0, 'already sufficient defense should retain its elixir');
  assert.ok(exposed.plays.length > 0, 'an undefended threat still receives a response');
});

function playerPolicy(game, tick) {
  if (tick % 45 !== 0 || game.state.elixir.player < 5) return;
  const index = game.state.hands.player.findIndex(id => CARDS[id].type === 'troop' && CARDS[id].cost <= game.state.elixir.player);
  if (index < 0) return;
  const id = game.state.hands.player[index];
  const x = tick % 360 < 180 ? 120 : 360, y = id === 'giant' ? 550 : 390;
  if (game.canDeploy('player', id, x, y).ok) game.playCard('player', index, x, y);
}
function advanceMatch(game, ai, from, to) {
  for (let tick = from; tick < to && game.state.running; tick++) {
    playerPolicy(game, tick);
    ai.update(DT);
    game.update(DT);
  }
}

test('each opponent style uses legal hands, costs, and resources in a real simulation', () => {
  for (const opponent of OPPONENTS) {
    const game = new Game({ deck: DEFAULT_DECK, enemyDeck: opponent.deck, seed: 551 });
    const ai = new BattleAI(game, { difficulty: 'hard', style: opponent.style, seed: 991 });
    let actions = 0;
    const play = game.playCard.bind(game);
    game.playCard = (team, index, x, y) => {
      const before = game.state.elixir[team];
      const id = game.state.hands[team][index];
      const result = play(team, index, x, y);
      if (team === 'enemy') {
        assert.equal(result.ok, true);
        assert.ok(opponent.deck.includes(id));
        assert.ok(before >= CARDS[id].cost);
        assert.ok(Math.abs(game.state.elixir.enemy - (before - CARDS[id].cost)) < 1e-7);
        actions++;
      }
      return result;
    };
    game.start();
    advanceMatch(game, ai, 0, 45 / DT);
    assert.ok(actions >= 5, `${opponent.style} must actively play its deck`);
    for (const amount of Object.values(game.state.elixir)) assert.ok(amount >= 0 && amount <= 10);
  }
});

test('AI and engine snapshots resume an identical future including random decisions and timers', () => {
  const opponent = OPPONENTS[2];
  const game = new Game({ deck: DEFAULT_DECK, enemyDeck: opponent.deck, seed: 9124 });
  const ai = new BattleAI(game, { difficulty: 'normal', style: opponent.style, seed: 571 });
  game.start();
  const split = 28 / DT, end = 80 / DT;
  advanceMatch(game, ai, 0, split);
  assert.ok(ai.decisionCount > 3);
  const saved = clone(ai.exportSnapshot());
  const resumedGame = Game.fromSnapshot(clone(game.exportSnapshot()));
  const resumedAI = BattleAI.fromSnapshot(resumedGame, saved);
  assert.deepEqual(resumedAI.exportSnapshot(), saved);
  resumedGame.resume();
  advanceMatch(game, ai, split, end);
  advanceMatch(resumedGame, resumedAI, split, end);
  assert.deepEqual(resumedGame.exportSnapshot(), game.exportSnapshot());
  assert.deepEqual(resumedAI.exportSnapshot(), ai.exportSnapshot());
});

test('AI snapshot data is detached and malformed snapshots fail before restoration', () => {
  const world = visibleWorld({ hand: ['knight'] });
  const ai = new BattleAI(world, { difficulty: 'normal', style: 'beatdown', seed: 18 });
  thinkFor(ai, world, 1);
  const saved = ai.exportSnapshot();
  const detached = clone(saved);
  saved.config.think = 99;
  saved.recentPlays[0].x = 0;
  assert.deepEqual(ai.exportSnapshot(), detached);
  const cases = [null, {}, { ...detached, version: 999 }, { ...detached, rngState: -1 },
    { ...detached, wait: NaN }, { ...detached, style: 'omniscient' },
    { ...detached, config: { ...detached.config, think: 0 } },
    { ...detached, seenThreats: [['a', 1], ['a', 2]] },
    { ...detached, lastDecision: { ...detached.lastDecision, cardId: 'invalid' } },
  ];
  for (const bad of cases) assert.throws(() => BattleAI.fromSnapshot(world, bad), TypeError);
});
