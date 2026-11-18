'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const History = require('../dist/history.js');

function storage(initial) {
  let value = initial === undefined ? null : initial;
  return {
    writes: 0,
    getItem(key) { assert.equal(key, History.KEY); return value; },
    setItem(key, data) { assert.equal(key, History.KEY); value = data; this.writes++; },
    raw() { return value; }
  };
}

function completedGame() {
  const heroes = [0, 1].flatMap(team => Array.from({ length: 5 }, (_, i) => ({
    id: 'h-' + team + '-' + i, type: 'hero', hero: ['mage', 'warrior', 'ranger'][i % 3],
    name: '영웅 ' + i, team, level: 10 + i, kills: i, deaths: 2, assists: i + 1,
    cs: 40 + i, damageDealt: 1234.6 + i, gold: 805.8, inventory: ['blade', 'boots']
  })));
  return {
    seed: 123, over: true, winner: 0, endReason: 'nexus', time: 385.5, difficulty: 'normal',
    player: heroes[0], teamKills: [15, 12],
    entities: [...heroes,
      { id: 'enemy-tower', type: 'tower', team: 1, alive: false },
      { id: 'enemy-nexus', type: 'nexus', team: 1, alive: false },
      { id: 'enemy-inhibitor', type: 'inhibitor', team: 1, alive: true },
      { id: 'ally-tower', type: 'tower', team: 0, alive: false },
      { id: 'enemy-minion', type: 'minion', team: 1, alive: false }],
    teamBuffs: [{ dragonStacks: 2, bossUntil: 420.5 }, { dragonStacks: 1, bossUntil: 300 }]
  };
}

function record(id, at) {
  return { id, version: 3, at, hero: 'mage', difficulty: 'normal', winner: 0,
    time: 300, kills: 3, deaths: 2, assists: 4, cs: 55, damage: 9500 };
}

test('history exports the same API to CommonJS and a browser-style global without a DOM', () => {
  assert.equal(History.KEY, 'nexus-front-history');
  assert.equal(History.LIMIT, 5);
  const source = fs.readFileSync(path.join(__dirname, '../dist/history.js'), 'utf8');
  const context = vm.createContext({});
  vm.runInContext(source, context);
  assert.equal(typeof context.NexusHistory.read, 'function');
  assert.equal(typeof context.NexusHistory.makeRecord, 'function');
  assert.equal(typeof context.NexusHistory.append, 'function');
  assert.equal(context.NexusHistory.read().length, 0);
});

test('makeRecord accepts only completed outcomes and captures player, both teams, structures and objectives', () => {
  const game = completedGame();
  game.over = false;
  assert.equal(History.makeRecord(game), null);
  game.over = true;
  game.winner = null;
  assert.equal(History.makeRecord(game), null);
  game.winner = 0;
  const result = History.makeRecord(game, '2026-11-14T12:00:00.000Z');
  assert.equal(result.version, 3);
  assert.equal(result.at, Date.parse('2026-11-14T12:00:00.000Z'));
  assert.ok(result.id.startsWith('nf3-'));
  assert.equal(result.endReason, 'nexus');
  assert.equal(result.time, game.time);
  assert.equal(result.level, 10);
  assert.equal(result.structures, 2, 'Only destroyed opposing structures count');
  assert.equal(result.damage, Math.floor(game.player.damageDealt));
  assert.equal(result.teamStats.length, 2);
  assert.deepEqual(result.teamStats.map(team => [team.team, team.kills, team.heroes.length]), [[0, 15, 5], [1, 12, 5]]);
  assert.deepEqual(result.objectives, [{ team: 0, dragonStacks: 2, bossRemaining: 35 }, { team: 1, dragonStacks: 1, bossRemaining: 0 }]);
});

test('re-reading one completed game keeps its identity while independent completions stay distinct', () => {
  const game = completedGame();
  const first = History.makeRecord(game, '2026-11-14T12:00:00Z');
  const repeated = History.makeRecord(game, '2026-11-14T13:00:00Z');
  assert.equal(first.id, repeated.id);
  assert.equal(first.at, repeated.at);
  const separate = History.makeRecord(completedGame(), '2026-11-14T12:00:00Z');
  assert.notEqual(first.id, separate.id);
  game.endReason = 'surrender';
  assert.equal(History.makeRecord(game).endReason, 'surrender');
});

test('record creation and append detach nested arrays from mutable game and caller state', () => {
  const game = completedGame();
  const result = History.makeRecord(game);
  game.player.inventory.push('heart');
  assert.deepEqual(result.teamStats[0].heroes[0].inventory, ['blade', 'boots']);
  result.teamStats[0].heroes[0].inventory.push('focus');
  assert.deepEqual(game.player.inventory, ['blade', 'boots', 'heart']);
  const target = storage();
  const appended = History.append(target, result);
  result.teamStats[0].heroes[0].inventory[0] = 'changed-after-append';
  assert.equal(appended.records[0].teamStats[0].heroes[0].inventory[0], 'blade');
  appended.records[0].teamStats[0].heroes[0].inventory[0] = 'changed-after-save';
  assert.equal(History.read(target)[0].teamStats[0].heroes[0].inventory[0], 'blade');
});

test('legacy v2 arrays keep their common fields and receive stable identities', () => {
  const old = [{ at: 200, hero: 'ranger', difficulty: 'easy', winner: 1, time: 402,
    kills: 7, deaths: 3, assists: 9, cs: 83, damage: 24000 }];
  const target = storage(JSON.stringify(old));
  const one = History.read(target);
  const two = History.read(target);
  assert.equal(one.length, 1);
  assert.equal(one[0].version, 2);
  assert.equal(one[0].id, two[0].id);
  assert.ok(one[0].id.startsWith('legacy-'));
  for (const key of Object.keys(old[0])) assert.equal(one[0][key], old[0][key]);
  assert.equal(one[0].endReason, 'nexus');
  assert.equal(one[0].level, 0);
  assert.deepEqual(one[0].teamStats, []);
  assert.deepEqual(one[0].objectives, []);
});

test('history retains the newest five outcomes and never adds a duplicate completion ID', () => {
  const target = storage();
  for (let i = 0; i < 7; i++) {
    const result = History.append(target, record('r-' + i, i * 100));
    assert.equal(result.persisted, true);
    assert.ok(result.records.length <= 5);
  }
  assert.deepEqual(History.read(target).map(entry => entry.id), ['r-6', 'r-5', 'r-4', 'r-3', 'r-2']);
  const duplicate = { ...record('r-6', 999999), winner: 1 };
  const appended = History.append(target, duplicate);
  assert.equal(appended.records.length, 5);
  assert.equal(appended.records[0].winner, 0, 'A duplicate cannot rewrite a completed result');
  assert.equal(appended.records[0].at, 600);
  assert.equal(JSON.parse(target.raw()).length, 5);
});

test('read normalizes bounded stats and rejects corrupt outcome entries', () => {
  const badStats = {
    ...record('normalized', 100), hero: 'not-a-hero', difficulty: 'impossible',
    kills: -10, deaths: 2.8, assists: 'not-a-number', cs: 1e20, damage: null,
    level: 200, structures: -4,
    teamStats: [{ team: 0, kills: -1, heroes: Array.from({ length: 10 }, () => ({
      hero: 'mage', level: 99, damage: -100, inventory: ['a', null, 'b', 'c', 'd', 'e', 'f', 'g']
    })) }],
    objectives: [{ team: 0, dragonStacks: 99, bossRemaining: -10 }]
  };
  const target = storage(JSON.stringify([null, {}, { ...record('invalid-win', 200), winner: 2 },
    { ...record('invalid-time', 200), time: 'bad' }, badStats]));
  const [normalized] = History.read(target);
  assert.equal(History.read(target).length, 1);
  assert.equal(normalized.hero, 'mage');
  assert.equal(normalized.difficulty, 'normal');
  assert.equal(normalized.kills, 0);
  assert.equal(normalized.deaths, 2);
  assert.equal(normalized.assists, 0);
  assert.equal(normalized.cs, 1e9);
  assert.equal(normalized.level, 18);
  assert.equal(normalized.structures, 0);
  assert.equal(normalized.teamStats[0].heroes.length, 5);
  assert.equal(normalized.teamStats[0].heroes[0].inventory.length, 6);
  assert.deepEqual(normalized.objectives, [{ team: 0, dragonStacks: 4, bossRemaining: 0 }]);
});

test('damaged JSON and unavailable storage safely return an empty readable history', () => {
  for (const raw of ['{broken', 'null', '{}', '"not an array"']) {
    assert.deepEqual(History.read(storage(raw)), []);
  }
  const inaccessible = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); }
  };
  assert.deepEqual(History.read(inaccessible), []);
  const result = History.append(inaccessible, record('memory', 100));
  assert.equal(result.persisted, false);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].id, 'memory');
  assert.deepEqual(History.read(null), []);
});

test('quota failures keep both prior records and the completed result available to the caller', () => {
  const previous = JSON.stringify([record('old', 100)]);
  const quotaBlocked = {
    getItem() { return previous; },
    setItem() { throw new Error('quota exceeded'); }
  };
  const result = History.append(quotaBlocked, record('new', 200));
  assert.equal(result.persisted, false);
  assert.deepEqual(result.records.map(entry => entry.id), ['new', 'old']);
  assert.equal(History.append(quotaBlocked, null).persisted, false);
});

test('a throwing global localStorage getter does not break default read or append', () => {
  const source = fs.readFileSync(path.join(__dirname, '../dist/history.js'), 'utf8');
  const context = vm.createContext({});
  Object.defineProperty(context, 'localStorage', { get() { throw new Error('security restriction'); } });
  vm.runInContext(source, context);
  assert.equal(context.NexusHistory.read().length, 0);
  const result = context.NexusHistory.append(undefined, record('safe', 100));
  assert.equal(result.persisted, false);
  assert.equal(result.records.length, 1);
});
