'use strict';

// v2 behavior regressions. The original 21 cases remain in engine.test.cjs.
// No DOM, browser, external package, or private engine method is used here.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { Game, HEROES, MODES } = require(path.join(__dirname, '..', 'dist', 'engine.js'));

const DT = 1 / 60;
const EPS = 1e-6;

function input(game, extra = {}) {
  return { moveX: 0, moveY: 0, aimX: game.player.x + 300, aimY: game.player.y,
    fire: false, super: false, gadget: false, ...extra };
}

function advance(game, seconds, command = {}) {
  let remaining = seconds;
  let frame = 0;
  while (remaining > EPS) {
    const dt = Math.min(DT, remaining);
    game.update(dt, input(game, typeof command === 'function' ? command(game, frame) : command));
    remaining -= dt;
    frame += 1;
  }
}

function until(game, predicate, seconds, command = {}) {
  let remaining = seconds;
  while (!predicate() && remaining > EPS) {
    const dt = Math.min(DT, remaining);
    game.update(dt, input(game, typeof command === 'function' ? command(game) : command));
    remaining -= dt;
  }
  assert.ok(predicate(), 'Expected transition within ' + seconds + ' seconds');
}

function quiet(mode = 'gem', hero = 'ranger', seed = 7319) {
  const game = new Game({ mode, hero, difficulty: 'normal', seed });
  game.aiEnabled = false;
  for (const key of ['walls', 'bushes', 'pickups', 'projectiles', 'effects', 'fields']) {
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

function keep(game, actors) {
  const ids = new Set(actors.map((actor) => actor.id));
  for (const actor of game.state.actors) {
    actor.alive = ids.has(actor.id);
    actor.hp = actor.alive ? actor.maxHp : 0;
    actor.respawnIn = actor.alive ? 0 : 100000;
    actor.invulnerable = 0;
    actor.gems = 0;
  }
}

function duel(mode = 'gem', hero = 'ranger') {
  const game = quiet(mode, hero);
  const player = game.player;
  const target = game.state.actors.find((actor) => actor.team !== player.team);
  keep(game, [player, target]);
  Object.assign(player, { x: 200, y: 400 });
  Object.assign(target, { x: 450, y: 400 });
  return { game, player, target };
}

function wall(x, y, w, h, extra = {}) {
  return { id: 'fixture-wall', x, y, w, h, hp: 100000, maxHp: 100000,
    destructible: false, kind: 'stone', ...extra };
}

function fireAt(game, target) {
  game.update(DT, input(game, { fire: true, aimX: target.x, aimY: target.y }));
}

test('v2 퀵 스텝: 벽을 통과하지 않고 탄약 한 칸을 보충하며 누른 채 재발동하지 않는다', () => {
  const game = quiet('gem', 'ranger');
  const control = quiet('gem', 'ranger');
  for (const candidate of [game, control]) {
    keep(candidate, [candidate.player]);
    Object.assign(candidate.player, { x: 270, y: 400, ammo: 0.25 });
    candidate.state.walls.push(wall(330, 300, 12, 200));
  }
  game.update(0.25, input(game, { gadget: true, aimX: 600, aimY: 400 }));
  control.update(0.25, input(control));
  assert.ok(Math.abs(game.player.ammo - control.player.ammo - 1) < EPS,
    'The gadget adds exactly one ammo beyond normal reload');
  assert.ok(game.player.x > 270, 'Quick Step should actually move the player');
  assert.ok(game.player.x + game.player.r <= 330 + EPS, 'Quick Step cannot tunnel through a thin wall');
  assert.ok(game.player.gadgetCooldown > 11 && game.player.gadgetCooldown <= 12);

  advance(game, 13, { gadget: true });
  assert.ok(game.player.gadgetCooldown <= EPS, 'Holding the input cannot reactivate after cooldown');
  advance(game, DT, { gadget: false });
  advance(game, DT, { gadget: true });
  assert.ok(game.player.gadgetCooldown > 11, 'A fresh press after release can activate again');
});

function incomingRangerShot(useShield) {
  const { game, player, target } = duel('gem', 'tank');
  Object.assign(target, { hero: 'ranger', hp: HEROES.ranger.hp, maxHp: HEROES.ranger.hp,
    x: 430, y: 400, ammo: 3, superCharge: 0, gadgetCooldown: 100 });
  game.aiEnabled = true;
  game.update(DT, input(game, { gadget: useShield }));
  advance(game, 0.9);
  return { game, player, loss: player.maxHp - player.hp };
}

test('v2 아이언 가드: 같은 직접 공격의 피해를 45% 줄인다', () => {
  const plain = incomingRangerShot(false);
  const guarded = incomingRangerShot(true);
  assert.ok(plain.loss > 0, 'The comparison requires an actual enemy hit');
  assert.ok(guarded.player.shieldTime > 0, 'The guard must still be active');
  assert.ok(Math.abs(guarded.loss / plain.loss - 0.55) < 0.01,
    'Direct damage should be reduced to 55% of the unguarded amount');
});

test('v2 아이언 가드: 독구름 피해는 그대로이며 사망하면 일시 효과가 지워진다', () => {
  const fixtures = [duel('showdown', 'tank'), duel('showdown', 'tank')];
  for (const { game, player, target } of fixtures) {
    game.state.elapsed = 90;
    Object.assign(player, { x: 35, y: 35 });
    Object.assign(target, { x: 640, y: 400 });
  }
  fixtures[0].game.update(DT, input(fixtures[0].game));
  fixtures[1].game.update(DT, input(fixtures[1].game, { gadget: true }));
  const plainLoss = fixtures[0].player.maxHp - fixtures[0].player.hp;
  const shieldLoss = fixtures[1].player.maxHp - fixtures[1].player.hp;
  assert.ok(plainLoss > 0, 'The player must be outside the safe zone');
  assert.ok(Math.abs(plainLoss - shieldLoss) < EPS, 'A guard must not reduce poison damage');
  const guarded = fixtures[1];
  guarded.player.hp = 1;
  advance(guarded.game, DT);
  assert.equal(guarded.player.alive, false);
  assert.equal(guarded.player.shieldTime, 0);
  assert.equal(guarded.player.slowTime, 0);
  assert.equal(guarded.player.slowFactor, 1);
  const death = guarded.game.state.killFeed.at(-1);
  assert.equal(death.killerId, null, 'Environmental damage must not invent a killer');
  assert.equal(death.victimId, guarded.player.id);
  assert.equal(death.kind, 'poison');
});

test('v2 중력장: 적만 감속·피해를 받고 장판과 감속이 만료된다', () => {
  const { game, player, target } = duel('gem', 'blaster');
  const ally = game.state.actors.find((actor) => actor.id !== player.id && actor.team === player.team);
  keep(game, [player, target, ally]);
  Object.assign(player, { x: 300, y: 400 });
  Object.assign(target, { x: 500, y: 400 });
  Object.assign(ally, { x: 500, y: 435 });
  const enemyHp = target.hp;
  const friendlyHp = ally.hp;
  game.update(DT, input(game, { gadget: true, aimX: 500, aimY: 400 }));
  assert.equal(game.state.fields.length, 1);
  const field = game.state.fields[0];
  assert.equal(field.type, 'gravity');
  assert.equal(field.ownerId, player.id);
  assert.equal(field.team, player.team);
  advance(game, 1);
  assert.ok(enemyHp - target.hp >= 95 && enemyHp - target.hp <= 105,
    'One second in the field should cause about 100 damage');
  assert.ok(Math.abs(target.slowFactor - 0.65) < EPS);
  assert.equal(ally.hp, friendlyHp, 'Friendly actors do not take field damage');
  assert.equal(ally.slowFactor, 1, 'Friendly actors do not receive the slow');
  advance(game, 3.5);
  assert.equal(game.state.fields.length, 0, 'A field expires after its four-second lifetime');
  assert.equal(target.slowFactor, 1, 'The slow must clear after leaving the expired field');
  assert.equal(target.slowTime, 0);
});

test('v2 중력장 배치: 조준 사거리 제한과 벽 앞 배치를 지킨다', () => {
  const open = quiet('gem', 'blaster');
  keep(open, [open.player]);
  Object.assign(open.player, { x: 200, y: 400 });
  open.update(DT, input(open, { gadget: true, aimX: 1200, aimY: 400 }));
  const field = open.state.fields[0];
  assert.ok(Math.hypot(field.x - open.player.x, field.y - open.player.y) <= 260 + EPS);

  const blocked = quiet('gem', 'blaster');
  keep(blocked, [blocked.player]);
  Object.assign(blocked.player, { x: 200, y: 400 });
  blocked.state.walls.push(wall(330, 300, 40, 200));
  blocked.update(DT, input(blocked, { gadget: true, aimX: 1000, aimY: 400 }));
  assert.equal(blocked.state.fields.length, 1);
  assert.ok(blocked.state.fields[0].x <= 330 + EPS,
    'The field center cannot be placed through intervening solid cover');
});

test('v2 총구 충돌: 벽에 붙어 발사해도 총구가 얇은 벽 너머에서 생성되지 않는다', () => {
  for (const hero of ['ranger', 'tank', 'blaster']) {
    const { game, player, target } = duel('gem', hero);
    player.x = 300 - player.r;
    target.x = 470;
    const hp = target.hp;
    game.state.walls.push(wall(300, 320, 6, 160));
    fireAt(game, target);
    advance(game, 0.75);
    assert.equal(target.hp, hp, hero + ' must not launch from beyond the wall');
    assert.equal(player.shotsFired, 1);
    assert.equal(player.shotsHit, 0);
    game.state.walls.length = 0;
    fireAt(game, target);
    until(game, () => target.hp < hp, 1);
  }
});

test('v2 총구 보정: 관통 슈퍼는 목재를 관통하는 의미를 유지한다', () => {
  const { game, player, target } = duel();
  player.x = 300 - player.r;
  target.x = 470;
  player.superCharge = 1;
  const hp = target.hp;
  game.state.walls.push(wall(300, 320, 6, 160,
    { destructible: true, kind: 'crate', hp: 2200, maxHp: 2200 }));
  game.update(DT, input(game, { super: true, aimX: target.x, aimY: target.y }));
  until(game, () => target.hp < hp, 1);
  assert.ok(player.shotsHit <= player.shotsFired);
});

test('v2 자동 조준: 가까운 가림 대상 대신 사선이 열린 적을 선택한다', () => {
  const { game, player, target } = duel();
  const visible = game.state.actors.find((actor) => actor.team !== player.team && actor.id !== target.id);
  keep(game, [player, target, visible]);
  Object.assign(visible, { x: 450, y: 600 });
  game.state.walls.push(wall(320, 340, 40, 120));
  const aim = game.getAutoAim();
  assert.equal(aim.kind, 'enemy');
  assert.equal(aim.targetId, visible.id, 'A blocked nearer opponent must not win auto-aim selection');
});

test('v2 자동 조준: 은신 및 사거리 밖 적의 위치를 목표로 반환하지 않는다', () => {
  const { game, player, target } = duel();
  game.state.bushes.push({ x: 425, y: 370, w: 60, h: 60 });
  advance(game, DT);
  assert.equal(target.hidden, true, 'This fixture must contain an actually hidden enemy');
  const hidden = game.getAutoAim(player.id);
  assert.equal(hidden.kind, 'forward');
  assert.equal(hidden.targetId, null);
  game.state.bushes.length = 0;
  target.x = player.x + HEROES[player.hero].range + 120;
  advance(game, DT);
  const distant = game.getAutoAim();
  assert.equal(distant.kind, 'forward');
  assert.equal(distant.targetId, null);
});

test('v2 자동 조준: 공 소유자는 상대 골대를 향한다', () => {
  const { game, player } = duel('ball');
  game.state.ball.carrierId = player.id;
  const aim = game.getAutoAim();
  assert.equal(aim.kind, 'goal');
  assert.equal(aim.targetId, null);
  assert.ok(aim.x > game.state.width * 0.9);
});

test('v2 연습장: 표적은 공격하지 않고 사망 후 돌아오며 시간 종료가 없다', () => {
  assert.ok(MODES.training);
  const game = new Game({ mode: 'training', hero: 'ranger', seed: 7319 });
  const player = game.player;
  const dummies = game.state.actors.filter((actor) => actor.isDummy);
  assert.equal(dummies.length, 3);
  assert.equal(game.state.timeLimit, 0);
  assert.equal(player.superCharge, 1);
  advance(game, 5);
  assert.equal(player.hp, player.maxHp);
  assert.ok(dummies.every((actor) => actor.shotsFired === 0), 'Dummies must not attack');
  game.state.walls.length = 0;
  game.state.bushes.length = 0;
  Object.assign(player, { x: 200, y: 400 });
  const target = dummies[0];
  Object.assign(target, { x: 450, y: 400, hp: 1, invulnerable: 0 });
  fireAt(game, target);
  until(game, () => !target.alive, 1);
  assert.equal(game.state.status, 'playing');
  until(game, () => target.alive, 2);
  assert.equal(target.hp, target.maxHp);
  advance(game, 181);
  assert.ok(game.state.elapsed > 180);
  assert.equal(game.state.status, 'playing', 'Free play cannot end at a normal match deadline');
  assert.equal(game.state.result, null);
});

test('v2 연습장: 가젯과 슈퍼를 약 3초 뒤 다시 사용할 수 있다', () => {
  const game = quiet('training', 'blaster');
  keep(game, [game.player]);
  Object.assign(game.player, { x: 200, y: 400 });
  game.update(DT, input(game, { gadget: true, super: true, aimX: 1000, aimY: 400 }));
  assert.ok(game.player.gadgetCooldown > 0 && game.player.gadgetCooldown <= 3);
  assert.ok(game.player.superCharge < 1, 'The super must actually be consumed before testing recharge');
  advance(game, 3.1);
  assert.equal(game.player.gadgetCooldown, 0);
  assert.equal(game.player.superCharge, 1);
});

function overtimeGame(score = [0, 0]) {
  const game = new Game({ mode: 'ball', hero: 'tank', difficulty: 'normal', seed: 7319 });
  game.aiEnabled = false;
  game.state.score = [...score];
  game.state.elapsed = 180 - DT / 2;
  return game;
}

test('v2 연장전: 동점 180초에 엄폐물을 지우고 재개하며 첫 골에서 종료한다', () => {
  const game = overtimeGame();
  const state = game.state;
  const spawns = state.actors.map(({ id, x, y }) => ({ id, x, y }));
  assert.ok(state.walls.some((item) => item.hp > 0) && state.bushes.length > 0);
  Object.assign(game.player, { x: 330, y: 500, shieldTime: 1, slowTime: 1, slowFactor: 0.65,
    gadgetCooldown: 5, hp: 100, ammo: 0 });
  state.ball.carrierId = game.player.id;
  advance(game, DT);
  assert.equal(state.status, 'playing');
  assert.equal(state.overtime, true);
  assert.equal(state.timeLimit, 225);
  assert.ok(state.walls.every((item) => item.hp <= 0));
  assert.equal(state.bushes.length, 0);
  assert.equal(state.ball.carrierId, null);
  assert.equal(game.player.shieldTime, 0);
  assert.equal(game.player.slowTime, 0);
  assert.equal(game.player.slowFactor, 1);
  assert.ok(game.player.gadgetCooldown > 4 && game.player.gadgetCooldown <= 5,
    'Round reset must preserve the remaining gadget cooldown');
  assert.deepEqual(state.actors.map(({ id, x, y }) => ({ id, x, y })), spawns);
  until(game, () => state.goalPause <= 0, 4);
  Object.assign(state.ball, { x: 1250, y: 400, vx: 600, vy: 0, carrierId: null });
  advance(game, DT);
  assert.deepEqual(state.score, [1, 0]);
  assert.equal(state.status, 'ended', 'One overtime goal must end a previously scoreless game');
  assert.equal(state.result.won, true);
  advance(game, 1);
  assert.deepEqual(state.score, [1, 0], 'An overtime goal cannot be counted again after the end');
});

test('v2 연장전: 225초까지 동점이면 무승부로 끝난다', () => {
  const game = overtimeGame([1, 1]);
  advance(game, DT);
  assert.equal(game.state.overtime, true);
  game.state.elapsed = 225 - DT / 2;
  advance(game, DT);
  assert.equal(game.state.status, 'ended');
  assert.equal(game.state.result.winner, null);
  assert.equal(game.state.result.won, false);
});

test('v2 브롤 볼: 정규 시간에 점수 차가 있으면 연장전 없이 끝난다', () => {
  const game = overtimeGame([1, 0]);
  advance(game, DT);
  assert.equal(game.state.overtime, false);
  assert.equal(game.state.status, 'ended');
  assert.equal(game.state.result.winner, 0);
});

test('v2 공 이동: 골라인을 입구 밖에서 지난 대각선 공을 득점으로 만들지 않는다', () => {
  const game = quiet('ball');
  for (const [index, actor] of game.state.actors.entries()) {
    actor.x = 100 + index * 160;
    actor.y = 650;
  }
  // Endpoint y=300 is inside the opening, but the trajectory crosses x=1256
  // at y=276, outside the y=278 opening. Endpoint-only scoring is incorrect.
  Object.assign(game.state.ball, { x: 1230, y: 250, vx: 3000, vy: 3000, carrierId: null });
  advance(game, DT);
  assert.deepEqual(game.state.score, [0, 0]);
});

test('v2 사격 통계: 산탄 여러 발도 공격 1회·유효 명중 1회로 센다', () => {
  const { game, player, target } = duel('gem', 'tank');
  target.x = 280;
  target.maxHp = target.hp = 10000;
  fireAt(game, target);
  advance(game, 0.5);
  assert.equal(player.shotsFired, 1);
  assert.equal(player.shotsHit, 1);
  assert.ok(player.damage > 0);
  assert.equal(player.kills, 0);

  const missed = duel();
  missed.game.update(DT, input(missed.game, { fire: true, aimX: 200, aimY: 0 }));
  advance(missed.game, 1);
  assert.equal(missed.player.shotsFired, 1);
  assert.equal(missed.player.shotsHit, 0, 'A miss must not earn a hit statistic');
});

function assistedKill(waitSeconds) {
  const { game, player, target } = duel();
  const ally = game.state.actors.find((actor) => actor.id !== player.id && actor.team === player.team);
  keep(game, [player, target, ally]);
  Object.assign(ally, { hero: 'ranger', hp: HEROES.ranger.hp, maxHp: HEROES.ranger.hp,
    x: 300, y: 400, superCharge: 0, gadgetCooldown: 100 });
  const hp = target.hp;
  fireAt(game, target);
  until(game, () => target.hp < hp, 1);
  advance(game, waitSeconds);
  Object.assign(target, { hp: 1, ammo: 0, shotCooldown: 100, superCharge: 0, gadgetCooldown: 100 });
  game.aiEnabled = true;
  until(game, () => !target.alive, 2);
  return { game, player, target, ally };
}

test('v2 K/D/A: 최근 같은 팀 기여자에게만 어시스트를 주고 오래된 피해는 제외한다', () => {
  const recent = assistedKill(0);
  assert.equal(recent.player.kills, 0);
  assert.equal(recent.player.assists, 1);
  assert.equal(recent.ally.kills, 1);
  assert.equal(recent.ally.assists, 0, 'The killer cannot also receive an assist');
  assert.equal(recent.target.deaths, 1);
  const entry = recent.game.state.killFeed.at(-1);
  assert.equal(entry.killerId, recent.ally.id);
  assert.equal(entry.victimId, recent.target.id);
  assert.equal(entry.team, recent.ally.team);

  const stale = assistedKill(8.2);
  assert.equal(stale.player.assists, 0, 'Damage older than the eight-second window must expire');
});

test('v2 목표 통계: 실제 젬 픽업 value를 한 번만 회수량에 더한다', () => {
  const game = quiet();
  keep(game, [game.player]);
  Object.assign(game.player, { x: 200, y: 400 });
  game.state.pickups.push({ id: 'stat-gem', type: 'gem', x: 200, y: 400, r: 9, value: 3 });
  advance(game, DT);
  assert.equal(game.player.gems, 3);
  assert.equal(game.player.gemsCollected, 3);
  advance(game, 0.2);
  assert.equal(game.player.gemsCollected, 3, 'The consumed pickup cannot be credited twice');
});

test('v2 골 통계: 같은 팀 마지막 터치만 득점하며 자책골은 개인 골에 더하지 않는다', () => {
  for (const ownGoal of [false, true]) {
    const game = quiet('ball');
    for (const [index, actor] of game.state.actors.entries()) {
      actor.x = 100 + index * 160;
      actor.y = 650;
    }
    const toucher = ownGoal
      ? game.state.actors.find((actor) => actor.team !== game.player.team)
      : game.player;
    Object.assign(game.state.ball, { x: 1250, y: 400, vx: 600, vy: 0, carrierId: null,
      lastTouchId: toucher.id, lastTouchTeam: toucher.team });
    advance(game, DT);
    assert.deepEqual(game.state.score, [1, 0]);
    assert.equal(toucher.goals, ownGoal ? 0 : 1);
    advance(game, 0.5);
    assert.equal(toucher.goals, ownGoal ? 0 : 1, 'A goal pause cannot award another personal goal');
  }
});

function finiteTree(value, label = 'state', seen = new Set()) {
  if (typeof value === 'number') {
    assert.ok(Number.isFinite(value), label + ' must be finite');
    return;
  }
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  for (const [key, child] of Object.entries(value)) finiteTree(child, label + '.' + key, seen);
}

function validateV2(game) {
  const state = game.state;
  finiteTree(state);
  assert.ok(state.killFeed.length <= 6);
  assert.equal(new Set(state.killFeed.map((entry) => entry.id)).size, state.killFeed.length);
  assert.equal(new Set(state.fields.map((field) => field.id)).size, state.fields.length);
  for (const actor of state.actors) {
    for (const key of ['gadgetCooldown', 'shieldTime', 'slowTime']) {
      assert.ok(actor[key] >= -EPS, key + ' cannot be negative');
    }
    assert.ok(actor.slowFactor > 0 && actor.slowFactor <= 1);
    for (const key of ['assists', 'goals', 'gemsCollected', 'shotsFired', 'shotsHit']) {
      assert.ok(Number.isInteger(actor[key]) && actor[key] >= 0, key + ' must be a nonnegative counter');
    }
    assert.ok(actor.shotsHit <= actor.shotsFired, 'A firing action cannot earn multiple hit credits');
  }
}

test('v2 시뮬레이션: 네 모드·세 영웅의 가젯 입력은 결정적이며 숫자·통계가 유효하다', () => {
  for (const mode of ['gem', 'showdown', 'ball', 'training']) {
    for (const hero of ['ranger', 'tank', 'blaster']) {
      const options = { mode, hero, difficulty: 'normal', seed: 20261114 };
      const first = new Game(options);
      const second = new Game(options);
      for (let frame = 0; frame < 60 * 25; frame += 1) {
        const aim = first.getAutoAim();
        const command = input(first, { moveX: Math.sin(frame * 0.023), moveY: Math.cos(frame * 0.019),
          aimX: aim.x, aimY: aim.y, fire: frame % 9 < 6, super: frame % 180 === 0, gadget: frame % 240 === 0 });
        first.update(DT, command);
        second.update(DT, command);
        validateV2(first);
        if (frame % 60 === 0 || first.state.status === 'ended') {
          assert.deepEqual(first.state, second.state, mode + '/' + hero + ' diverged at frame ' + frame);
        }
        if (first.state.status === 'ended') break;
      }
    }
  }
});
