'use strict';

// Run from the project root: node --test tests/engine.test.cjs
// Tests use the public constructor, state and update API. The AI switch only
// disables bot decisions; collision, damage, objectives and timers keep running.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { Game, HEROES, MODES } = require(path.join(__dirname, '..', 'dist', 'engine.js'));

const DT = 1 / 60;
const EPSILON = 1e-6;

function inputFor(game, values = {}) {
  return {
    moveX: 0,
    moveY: 0,
    aimX: game.player.x + 300,
    aimY: game.player.y,
    fire: false,
    super: false,
    ...values,
  };
}

function advance(game, seconds, values = {}) {
  let remaining = seconds;
  let frame = 0;
  while (remaining > EPSILON) {
    const dt = Math.min(DT, remaining);
    const next = typeof values === 'function' ? values(game, frame) : values;
    game.update(dt, inputFor(game, next));
    remaining -= dt;
    frame += 1;
  }
}

function advanceUntil(game, predicate, seconds, values = {}) {
  let remaining = seconds;
  let frame = 0;
  while (!predicate() && remaining > EPSILON) {
    const dt = Math.min(DT, remaining);
    const next = typeof values === 'function' ? values(game, frame) : values;
    game.update(dt, inputFor(game, next));
    remaining -= dt;
    frame += 1;
  }
  assert.ok(predicate(), 'Expected state transition within ' + seconds + ' seconds');
}

function quietGame(mode = 'gem', hero = 'ranger', seed = 7319) {
  const game = new Game({ mode, hero, difficulty: 'normal', seed });
  game.aiEnabled = false;
  for (const key of ['walls', 'bushes', 'pickups', 'projectiles', 'effects']) {
    game.state[key].length = 0;
  }
  for (const [index, actor] of game.state.actors.entries()) {
    actor.x = 110 + index * 140;
    actor.y = 700;
    actor.invulnerable = 0;
    actor.gems = 0;
  }
  return game;
}

function keepActors(game, ids) {
  const keep = new Set(ids);
  for (const actor of game.state.actors) {
    actor.alive = keep.has(actor.id);
    actor.hp = actor.alive ? actor.maxHp : 0;
    actor.gems = 0;
    actor.invulnerable = 0;
    actor.respawnIn = actor.alive ? 0 : 100000;
  }
}

function duel(mode = 'gem', hero = 'ranger') {
  const game = quietGame(mode, hero);
  const player = game.player;
  const target = game.state.actors.find((actor) => actor.team !== player.team);
  assert.ok(target, 'A duel needs an opposing actor');
  keepActors(game, [player.id, target.id]);
  player.x = 200;
  player.y = 400;
  target.x = 450;
  target.y = 400;
  return { game, player, target };
}

function aimAt(target, extra = {}) {
  return { aimX: target.x, aimY: target.y, fire: true, ...extra };
}

function sumGems(game) {
  return game.state.pickups
    .filter((pickup) => pickup.type === 'gem')
    .reduce((sum, pickup) => sum + pickup.value, 0);
}

function uniqueIds(items, name) {
  const ids = items.map((item) => item.id);
  assert.ok(ids.every((id) => id !== undefined && id !== null), name + ' has a missing ID');
  assert.equal(new Set(ids).size, ids.length, name + ' has duplicate IDs');
}

function finiteTree(value, label = 'state', seen = new Set()) {
  if (typeof value === 'number') {
    assert.ok(Number.isFinite(value), label + ' must be finite, got ' + value);
    return;
  }
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    finiteTree(child, label + '.' + key, seen);
  }
}

function validState(game) {
  const state = game.state;
  finiteTree(state);
  uniqueIds(state.actors, 'actors');
  uniqueIds(state.pickups, 'pickups');
  uniqueIds(state.projectiles, 'projectiles');
  assert.ok(state.events.length <= 64, 'Event history must stay bounded');
  for (const actor of state.actors) {
    assert.ok(actor.hp >= -EPSILON && actor.hp <= actor.maxHp + EPSILON,
      'Actor ' + actor.id + ' HP must remain within its maximum');
    assert.ok(actor.ammo >= -EPSILON && actor.ammo <= actor.maxAmmo + EPSILON,
      'Actor ' + actor.id + ' ammo must remain within its maximum');
    assert.ok(actor.superCharge >= -EPSILON && actor.superCharge <= 1 + EPSILON,
      'Actor ' + actor.id + ' super charge must remain normalized');
  }
  if (state.status === 'ended') {
    assert.ok(state.result, 'An ended match must provide a result');
    assert.equal(typeof state.result.won, 'boolean');
  }
}

test('탄약: 발사는 자원을 소모하고, 빈 탄약은 발사되지 않으며, 재장전된다', () => {
  const game = quietGame();
  keepActors(game, [game.player.id]);
  const player = game.player;
  player.x = 200;
  player.y = 400;
  const originalAmmo = player.ammo;
  advance(game, 0.1, { fire: true });
  assert.ok(player.ammo < originalAmmo, 'A successful shot must consume ammo');
  advance(game, 10);
  assert.ok(Math.abs(player.ammo - player.maxAmmo) < EPSILON, 'Idle ammo should refill fully');

  const empty = quietGame();
  keepActors(empty, [empty.player.id]);
  empty.player.ammo = 0;
  advance(empty, DT, { fire: true });
  assert.equal(empty.state.projectiles.length, 0, 'Less than one ammo cannot create a shot');
  assert.ok(empty.player.ammo >= 0, 'Fire input cannot make ammo negative');
});

test('이동 충돌: 벽 안으로 들어가지 않고 빈 공간에서는 이동한다', () => {
  const game = quietGame();
  keepActors(game, [game.player.id]);
  const player = game.player;
  player.x = 200;
  player.y = 400;
  const wall = { id: 'movement-wall', x: 300, y: 320, w: 60, h: 160,
    hp: 100000, maxHp: 100000, destructible: false, kind: 'stone' };
  game.state.walls.push(wall);
  advance(game, 2, { moveX: 1 });
  assert.ok(player.x > 200, 'Movement must advance until the obstacle');
  assert.ok(player.x + player.r <= wall.x + EPSILON, 'The actor cannot penetrate the wall');
  const blockedX = player.x;
  advance(game, 1, { moveY: -1 });
  assert.ok(player.y + player.r < wall.y, 'Movement along the wall must remain possible');
  advance(game, 0.6, { moveX: 1 });
  assert.ok(player.x > blockedX + player.r, 'The actor should pass after clearing the wall');
});

test('쇼다운 시작 위치: 모든 캐릭터의 몸체가 살아 있는 벽과 겹치지 않는다', () => {
  for (const hero of ['ranger', 'tank', 'blaster']) {
    for (const seed of [42, 7319, 20261114]) {
      const game = new Game({ mode: 'showdown', hero, difficulty: 'normal', seed });
      for (const actor of game.state.actors) {
        for (const wall of game.state.walls.filter((candidate) => candidate.hp > 0)) {
          const gapX = Math.max(wall.x - actor.x, 0, actor.x - (wall.x + wall.w));
          const gapY = Math.max(wall.y - actor.y, 0, actor.y - (wall.y + wall.h));
          assert.ok(Math.hypot(gapX, gapY) >= actor.r - EPSILON,
            'Spawn overlap: hero=' + hero + ', seed=' + seed + ', actor=' + actor.id + ', wall=' + wall.id);
        }
      }
    }
  }
});

test('투사체: 벽은 사격을 차단하고, 열린 사선의 적중은 피해와 슈퍼 충전을 만든다', () => {
  const { game, player, target } = duel();
  const originalHp = target.hp;
  game.state.walls.push({ id: 'bullet-wall', x: 330, y: 320, w: 40, h: 160,
    hp: 100000, maxHp: 100000, destructible: false, kind: 'stone' });
  advance(game, 1, () => aimAt(target));
  assert.equal(target.hp, originalHp, 'A solid wall must block an ordinary straight shot');
  game.state.walls.length = 0;
  player.ammo = player.maxAmmo;
  const control = quietGame();
  keepActors(control, [control.player.id]);
  control.player.superCharge = player.superCharge;
  const openedAt = game.state.elapsed;
  advanceUntil(game, () => target.hp < originalHp, 1.2, () => aimAt(target));
  advance(control, game.state.elapsed - openedAt);
  assert.ok(player.superCharge > control.player.superCharge + EPSILON,
    'An enemy hit must add charge beyond passive recovery');
  assert.ok(target.hp >= 0, 'Damage should not leave negative HP');
});

test('젬: 동점·열세·10개 미만은 카운트다운을 취소하고 재시작은 15초부터다', () => {
  const { game, player, target } = duel();
  player.gems = 10;
  target.gems = 9;
  advance(game, DT);
  assert.equal(game.state.countdown.team, player.team);
  advance(game, 3);
  assert.ok(game.state.countdown.remaining < 13);

  target.gems = 10;
  advance(game, DT);
  assert.equal(game.state.countdown, null, 'A tie is not a strict lead');
  player.gems = 11;
  advance(game, DT);
  assert.equal(game.state.countdown.team, player.team);
  assert.ok(game.state.countdown.remaining > 14.9, 'A new lead must start a fresh countdown');

  target.gems = 0;
  player.gems = 9;
  advance(game, DT);
  assert.equal(game.state.countdown, null, 'A lead below ten gems is insufficient');
  target.gems = 12;
  advance(game, DT);
  assert.equal(game.state.countdown.team, target.team, 'The opposite team can start its own countdown');
  assert.ok(game.state.countdown.remaining > 14.9);
});

test('젬: 우세를 15초 유지해야 승리하고 종료 뒤 판정은 바뀌지 않는다', () => {
  const { game, player } = duel();
  player.gems = 10;
  advance(game, DT);
  advance(game, 14.8);
  assert.equal(game.state.status, 'playing', 'The match cannot end before the countdown expires');
  advance(game, 0.3);
  assert.equal(game.state.status, 'ended');
  assert.equal(game.state.result.winner, player.team);
  assert.equal(game.state.result.won, true);
  const result = JSON.stringify(game.state.result);
  const score = [...game.state.score];
  advance(game, 1, { fire: true, super: true, moveX: 1 });
  assert.equal(JSON.stringify(game.state.result), result, 'A completed result must remain stable');
  assert.deepEqual(game.state.score, score);
});

test('젬: 사망 드롭은 소지량을 보존하고 같은 사망을 중복 지급하지 않는다', () => {
  const { game, target } = duel();
  target.gems = 4;
  target.hp = 1;
  advanceUntil(game, () => !target.alive, 1.2, () => aimAt(target));
  assert.equal(target.gems, 0, 'A dead carrier must no longer retain the dropped gems');
  assert.equal(sumGems(game), 4, 'Dropped pickup values must equal the lost inventory');
  uniqueIds(game.state.pickups, 'death drops');
  // The mine continues spawning normally. Only the isolated death area should
  // remain unchanged; counting every gem would confuse normal supply with a bug.
  const deathDrops = () => game.state.pickups.filter((pickup) => pickup.type === 'gem'
    && Math.hypot(pickup.x - target.x, pickup.y - target.y) < 100);
  const ids = deathDrops().map((pickup) => pickup.id).sort();
  advance(game, 0.8);
  assert.equal(deathDrops().reduce((sum, pickup) => sum + pickup.value, 0), 4,
    'Dead-state updates must not duplicate the carrier inventory');
  uniqueIds(game.state.pickups, 'all pickups after death');
  assert.deepEqual(deathDrops().map((pickup) => pickup.id).sort(), ids);
});

test('브롤 볼: 공을 찰 때 소유권을 해제하고 탄약을 소모한다', () => {
  const game = quietGame('ball');
  keepActors(game, [game.player.id]);
  const player = game.player;
  player.x = 400;
  player.y = 400;
  Object.assign(game.state.ball, { x: player.x, y: player.y, vx: 0, vy: 0, carrierId: player.id });
  const ammo = player.ammo;
  advance(game, DT, { fire: true, aimX: 1100, aimY: 400 });
  assert.equal(game.state.ball.carrierId, null, 'A kicked ball cannot remain owned');
  assert.ok(game.state.ball.vx > 0, 'A rightward shot must move toward the right goal');
  assert.ok(player.ammo < ammo, 'An ordinary kick consumes ammo');
});

test('브롤 볼: 골 입구만 득점하며, 재개 때 초기화하고 두 골에서 종료한다', () => {
  const game = quietGame('ball');
  const freshGame = new Game({ mode: 'ball', hero: 'ranger', difficulty: 'normal', seed: 7319 });
  const restartPositions = freshGame.state.actors.map(({ id, x, y }) => ({ id, x, y }));
  const state = game.state;
  const player = game.player;
  for (const [index, actor] of state.actors.entries()) {
    actor.x = 150 + index * 170;
    actor.y = 100;
  }
  // v2 sweeps the trajectory: begin inside the field and cross the goal line.
  Object.assign(state.ball, { x: 1250, y: 160, vx: 600, vy: 0, carrierId: null });
  advance(game, DT);
  assert.deepEqual(state.score, [0, 0], 'Crossing an end wall outside the opening cannot score');

  player.hp = Math.max(1, Math.floor(player.maxHp / 2));
  player.ammo = 0;
  player.superCharge = 0.6;
  Object.assign(state.ball, { x: 1250, y: 400, vx: 600, vy: 0, carrierId: null });
  advance(game, DT);
  assert.deepEqual(state.score, [1, 0], 'The player team attacks the right goal');
  assert.ok(state.goalPause > 0, 'A non-winning goal must briefly pause play');
  assert.equal(state.ball.carrierId, null);
  assert.ok(Math.abs(state.ball.x - state.width / 2) < EPSILON);
  assert.ok(Math.abs(state.ball.y - state.height / 2) < EPSILON);
  assert.equal(state.ball.vx, 0);
  assert.equal(state.ball.vy, 0);
  const chargeAtGoal = player.superCharge;

  advance(game, 0.5);
  assert.deepEqual(state.score, [1, 0], 'A scored ball cannot score repeatedly during the pause');
  advanceUntil(game, () => state.goalPause <= 0, 3);
  assert.equal(player.hp, player.maxHp, 'Restart must restore player health');
  assert.ok(Math.abs(player.ammo - player.maxAmmo) < EPSILON, 'Restart must restore player ammo');
  assert.ok(Math.abs(player.superCharge - chargeAtGoal) < EPSILON, 'A goal restart preserves super charge');
  assert.deepEqual(state.actors.map(({ id, x, y }) => ({ id, x, y })), restartPositions,
    'Restart must return every actor to its initial position');

  Object.assign(state.ball, { x: 1250, y: 400, vx: 600, vy: 0, carrierId: null });
  advance(game, DT);
  assert.deepEqual(state.score, [2, 0]);
  assert.equal(state.status, 'ended');
  assert.equal(state.result.winner, player.team);
  assert.equal(state.result.won, true);
});

test('쇼다운: 안전 구역은 축소되고 바깥의 플레이어가 죽으면 즉시 순위를 판정한다', () => {
  const { game, player, target } = duel('showdown');
  const originalRadius = game.state.zone.r;
  player.x = 640;
  player.y = 400;
  target.x = 670;
  target.y = 400;
  game.state.elapsed = game.state.timeLimit * 0.6;
  advance(game, DT);
  assert.ok(game.state.zone.r > 0 && game.state.zone.r < originalRadius, 'The safe radius must shrink with time');

  player.x = 30;
  player.y = 30;
  player.hp = 1;
  advanceUntil(game, () => game.state.status === 'ended', 3);
  assert.equal(player.alive, false, 'Poison damage must eliminate the exposed player');
  assert.equal(game.state.result.won, false);
  assert.equal(game.state.result.rank, 2, 'One surviving opponent means second place');
});

test('쇼다운: 마지막 상대를 실제 공격으로 처치하면 최후 생존자가 된다', () => {
  const { game, player, target } = duel('showdown');
  target.hp = 1;
  advanceUntil(game, () => game.state.status === 'ended', 1.5, () => aimAt(target));
  assert.equal(target.alive, false);
  assert.equal(player.alive, true);
  assert.equal(game.state.result.won, true);
  assert.equal(game.state.result.rank, 1);
});

function reproducibleState(game) {
  const state = game.state;
  return {
    elapsed: state.elapsed,
    status: state.status,
    score: state.score,
    countdown: state.countdown,
    zone: state.zone,
    result: state.result,
    actors: state.actors.map(({ id, hero, team, x, y, hp, ammo, alive, gems, power, superCharge }) =>
      ({ id, hero, team, x, y, hp, ammo, alive, gems, power, superCharge })),
    walls: state.walls.map(({ x, y, w, h, hp }) => ({ x, y, w, h, hp })),
    pickups: state.pickups.map(({ type, x, y, value }) => ({ type, x, y, value })),
  };
}

function simulationInput(game, frame) {
  const player = game.player;
  const opponents = game.state.actors.filter((actor) => actor.alive && actor.team !== player.team);
  opponents.sort((left, right) =>
    Math.hypot(left.x - player.x, left.y - player.y) - Math.hypot(right.x - player.x, right.y - player.y));
  const target = opponents[0];
  return inputFor(game, {
    moveX: Math.sin(frame * 0.021),
    moveY: Math.cos(frame * 0.017),
    aimX: target ? target.x : player.x + 200,
    aimY: target ? target.y : player.y,
    fire: frame % 11 < 8,
    super: frame % 120 === 0,
  });
}

test('고정 시드: 같은 입력은 같은 봇·월드·전투 결과를 재현한다', () => {
  const options = { mode: 'showdown', hero: 'blaster', difficulty: 'normal', seed: 40321 };
  const first = new Game(options);
  const second = new Game(options);
  assert.deepEqual(reproducibleState(first), reproducibleState(second));
  for (let frame = 0; frame < 600; frame += 1) {
    const input = simulationInput(first, frame);
    first.update(DT, input);
    second.update(DT, input);
    if (frame % 60 === 0 || first.state.status === 'ended') {
      assert.deepEqual(reproducibleState(first), reproducibleState(second), 'Seeded simulation diverged at frame ' + frame);
    }
    if (first.state.status === 'ended') break;
  }
});

for (const mode of ['gem', 'showdown', 'ball']) {
  for (const hero of ['ranger', 'tank', 'blaster']) {
    test('시뮬레이션: ' + mode + ' / ' + hero + '의 숫자·자원·ID 불변식', () => {
      assert.ok(MODES[mode], 'The requested mode must be exported');
      assert.ok(HEROES[hero], 'The requested hero must be exported');
      for (const seed of [42, 20261114]) {
        const game = new Game({ mode, hero, difficulty: 'normal', seed });
        validState(game);
        for (let frame = 0; frame < 60 * 90; frame += 1) {
          game.update(DT, simulationInput(game, frame));
          validState(game);
          if (game.state.status === 'ended') break;
        }
      }
    });
  }
}
