'use strict';

// Boundary regressions for Hot Zone and Heist. Public state fixtures are used
// deliberately; no private damage, capture, AI, or result method is invoked.
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

function advance(game, seconds, extra = {}) {
  let remaining = seconds;
  let frame = 0;
  while (remaining > EPS) {
    const dt = Math.min(DT, remaining);
    game.update(dt, input(game, typeof extra === 'function' ? extra(game, frame) : extra));
    remaining -= dt;
    frame++;
  }
}

function until(game, predicate, seconds, extra = {}) {
  let remaining = seconds;
  while (!predicate() && remaining > EPS) {
    const dt = Math.min(DT, remaining);
    game.update(dt, input(game, typeof extra === 'function' ? extra(game) : extra));
    remaining -= dt;
  }
  assert.ok(predicate(), 'Expected transition within ' + seconds + ' seconds');
}

function close(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < EPS, message + ': ' + actual + ' vs ' + expected);
}

function quiet(mode, hero = 'ranger', seed = 7319) {
  const game = new Game({ mode, hero, difficulty: 'normal', seed });
  game.aiEnabled = false;
  for (const key of ['walls', 'bushes', 'pickups', 'projectiles', 'fields', 'effects']) game.state[key].length = 0;
  for (const [index, actor] of game.state.actors.entries()) {
    Object.assign(actor, { x: 110 + index * 170, y: 720, invulnerable: 0 });
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
  }
}

function occupier(actor, zone, offsetX = 0, offsetY = 0) {
  Object.assign(actor, { x: zone.x + offsetX, y: zone.y + offsetY, invulnerable: 0 });
}

function targetSafe(game) {
  return game.state.safes.find((safe) => safe.team !== game.player.team);
}

function shot(game, target, extra = {}) {
  game.update(DT, input(game, { fire: true, aimX: target.x, aimY: target.y, ...extra }));
}

function heistDuel(hero = 'ranger') {
  const game = quiet('heist', hero);
  keep(game, [game.player]);
  const safe = targetSafe(game);
  Object.assign(game.player, { x: safe.x - 220, y: safe.y });
  return { game, player: game.player, safe };
}

function gravity(id, owner, safe) {
  return { id, type: 'gravity', ownerId: owner.id, team: owner.team,
    x: safe.x, y: safe.y, r: 105, life: 4, maxLife: 4 };
}

test('v3 신규 맵: 3대3 시작 위치는 벽·금고와 겹치지 않고 모드 상태가 분리된다', () => {
  for (const mode of ['hotzone', 'heist']) {
    assert.ok(MODES[mode]);
    for (const hero of ['ranger', 'tank', 'blaster']) {
      for (const seed of [42, 7319, 20261114]) {
        const game = new Game({ mode, hero, seed });
        assert.equal(game.state.actors.length, 6);
        assert.equal(game.state.timeLimit, 180);
        assert.equal(game.state.captureZones.length, mode === 'hotzone' ? 2 : 0);
        assert.equal(game.state.safes.length, mode === 'heist' ? 2 : 0);
        assert.equal(game.state.zone, null, 'These modes must not inherit Showdown poison rules');
        for (const actor of game.state.actors) {
          for (const wall of game.state.walls.filter((item) => item.hp > 0)) {
            const dx = Math.max(wall.x - actor.x, 0, actor.x - wall.x - wall.w);
            const dy = Math.max(wall.y - actor.y, 0, actor.y - wall.y - wall.h);
            assert.ok(Math.hypot(dx, dy) >= actor.r - EPS, mode + ': spawn intersects a wall');
          }
          for (const safe of game.state.safes) {
            assert.ok(Math.hypot(actor.x - safe.x, actor.y - safe.y) >= actor.r + safe.r - EPS,
              mode + ': spawn intersects a safe');
          }
        }
      }
    }
  }
});

test('v3 핫 존: 같은 구역의 양 팀이 동시에 독립적으로 진척한다', () => {
  const game = quiet('hotzone');
  const player = game.player;
  const enemy = game.state.actors.find((actor) => actor.team !== player.team);
  keep(game, [player, enemy]);
  const zone = game.state.captureZones[0];
  occupier(player, zone, -35); occupier(enemy, zone, 35);
  advance(game, 1);
  assert.deepEqual(zone.occupants, [1, 1]);
  close(zone.progress[0], 2.5, 'Our capture advances despite an opponent');
  close(zone.progress[1], 2.5, 'The opponent also advances');
  close(game.state.score[0], 1.25, 'Score averages both zones');
  close(player.captureTime, 1, 'Our contribution time');
  close(enemy.captureTime, 1, 'Enemy contribution time');
});

test('v3 핫 존: 같은 팀 세 명은 한 명보다 빨리 점령하지 않지만 각자 시간을 기록한다', () => {
  const solo = quiet('hotzone');
  keep(solo, [solo.player]);
  occupier(solo.player, solo.state.captureZones[0]);
  const group = quiet('hotzone');
  const allies = group.state.actors.filter((actor) => actor.team === group.player.team);
  keep(group, allies);
  const zone = group.state.captureZones[0];
  occupier(allies[0], zone, -45); occupier(allies[1], zone, 45); occupier(allies[2], zone, 0, 45);
  advance(solo, 2); advance(group, 2);
  close(zone.progress[0], solo.state.captureZones[0].progress[0], 'Teammate speed must not stack');
  assert.equal(zone.occupants[0], 3);
  for (const ally of allies) close(ally.captureTime, 2, 'Each eligible teammate earns capture time');
});

test('v3 핫 존: 부활 무적·사망·중심이 원 밖인 캐릭터는 점령에 기여하지 않는다', () => {
  const game = quiet('hotzone');
  const player = game.player;
  const enemy = game.state.actors.find((actor) => actor.team !== player.team);
  const dead = game.state.actors.find((actor) => actor.id !== player.id && actor.team === player.team);
  keep(game, [player, enemy]);
  const zone = game.state.captureZones[0];
  occupier(player, zone); player.invulnerable = 1;
  occupier(enemy, zone, zone.r + 0.1);
  occupier(dead, zone, -35);
  advance(game, 0.25);
  assert.deepEqual(zone.progress, [0, 0]);
  assert.deepEqual(zone.occupants, [0, 0]);
  player.invulnerable = 0;
  advance(game, 1);
  close(zone.progress[0], 2.5, 'An eligible player starts capture');
  close(player.captureTime, 1, 'Only eligible time is counted');
  player.alive = false; player.hp = 0; player.respawnIn = 100000;
  advance(game, 2);
  close(zone.progress[0], 2.5, 'An empty zone retains its progress without decaying');
  close(player.captureTime, 1, 'A dead player earns no additional time');
  assert.equal(enemy.captureTime, 0, 'Body overlap alone is not center occupancy');
});

test('v3 핫 존: 완료 구역은 추가 기여를 멈추고 마지막 부분 프레임만 기록한다', () => {
  const game = quiet('hotzone');
  const player = game.player;
  const enemy = game.state.actors.find((actor) => actor.team !== player.team);
  keep(game, [player, enemy]);
  const zone = game.state.captureZones[0];
  occupier(player, zone, -35); occupier(enemy, zone, 35);
  zone.progress[0] = 99.99;
  advance(game, DT);
  assert.equal(zone.progress[0], 100);
  close(player.captureTime, 0.004, 'Only the remaining 0.01 percent earns capture time');
  const enemyBefore = zone.progress[1];
  advance(game, 1);
  assert.equal(zone.progress[0], 100);
  close(player.captureTime, 0.004, 'A completed team stops gaining time');
  close(zone.progress[1] - enemyBefore, 2.5, 'The other team continues its own capture');
  assert.deepEqual(zone.occupants, [1, 1], 'Presence remains visible after one side completes');
  assert.equal(game.state.status, 'playing', 'Completing only one zone cannot win');
});

test('v3 핫 존: 99.999%는 완료가 아니며 두 구역을 실제로 채워야 승리한다', () => {
  const game = quiet('hotzone');
  const allies = game.state.actors.filter((actor) => actor.team === game.player.team).slice(0, 2);
  keep(game, allies);
  for (const zone of game.state.captureZones) zone.progress[0] = 99.999;
  advance(game, DT);
  assert.equal(game.state.status, 'playing', 'Display rounding cannot end the match');
  close(game.state.score[0], 99.999, 'The engine keeps precise progress');
  game.state.captureZones.forEach((zone, index) => occupier(allies[index], zone));
  advance(game, DT);
  assert.ok(game.state.captureZones.every((zone) => zone.progress[0] === 100));
  assert.equal(game.state.status, 'ended');
  assert.equal(game.state.result.winner, game.player.team);
  assert.equal(game.state.result.won, true);
});

test('v3 핫 존: 양 팀이 같은 스텝에 두 구역을 완성하면 무승부다', () => {
  const game = quiet('hotzone');
  const allies = game.state.actors.filter((actor) => actor.team === 0).slice(0, 2);
  const enemies = game.state.actors.filter((actor) => actor.team === 1).slice(0, 2);
  keep(game, [...allies, ...enemies]);
  game.state.captureZones.forEach((zone, index) => {
    zone.progress = [99.99, 99.99];
    occupier(allies[index], zone, -35); occupier(enemies[index], zone, 35);
  });
  advance(game, DT);
  assert.ok(game.state.captureZones.every((zone) => zone.progress.every((value) => value === 100)));
  assert.equal(game.state.status, 'ended');
  assert.equal(game.state.result.winner, null);
  assert.equal(game.state.result.won, false);
});

test('v3 핫 존: 시간 종료는 화면 반올림 전 진척을 비교하고 정확한 동점만 무승부다', () => {
  for (const delta of [0, 0.0001]) {
    const game = quiet('hotzone');
    keep(game, [game.player]);
    for (const zone of game.state.captureZones) zone.progress = [50 + delta, 50];
    game.state.elapsed = 180 - DT / 2;
    advance(game, DT);
    assert.equal(game.state.status, 'ended');
    assert.equal(game.state.result.winner, delta === 0 ? null : 0);
  }
});

test('v3 하이스트: 일반 공격·슈퍼·중력장은 아군 금고에 피해나 통계를 주지 않는다', () => {
  const attacks = [
    ['ranger', 'fire'], ['tank', 'fire'], ['blaster', 'fire'],
    ['ranger', 'super'], ['tank', 'super'], ['blaster', 'super'], ['blaster', 'gadget']
  ];
  for (const [hero, action] of attacks) {
    const game = quiet('heist', hero);
    keep(game, [game.player]);
    const own = game.state.safes.find((safe) => safe.team === game.player.team);
    Object.assign(game.player, { x: own.x + 220, y: own.y, superCharge: 1 });
    game.update(DT, input(game, { [action]: true, aimX: own.x, aimY: own.y }));
    advance(game, 1.2);
    assert.equal(own.hp, own.maxHp, hero + '/' + action + ' cannot hurt its own safe');
    assert.equal(own.shieldsTriggered, 0);
    assert.equal(game.player.objectiveDamage, 0);
    assert.equal(game.player.damage, 0);
    assert.equal(game.player.shotsHit, 0);
  }
});

test('v3 하이스트: 세 영웅의 실제 금고 피해만 목표 통계에 기록하고 슈퍼는 충전하지 않는다', () => {
  for (const hero of ['ranger', 'tank', 'blaster']) {
    const { game, player, safe } = heistDuel(hero);
    const control = heistDuel(hero).game;
    shot(game, safe);
    until(game, () => safe.hp < safe.maxHp, 1.5);
    advance(game, 0.35);
    advance(control, game.state.elapsed);
    const actual = safe.maxHp - safe.hp;
    assert.ok(actual > 0, hero + ' must damage the opposing safe');
    close(player.objectiveDamage, actual, 'Only actual safe HP loss is credited');
    assert.equal(player.damage, 0, 'Safe damage is separate from actor combat damage');
    assert.equal(player.kills, 0);
    assert.equal(game.state.killFeed.length, 0);
    assert.equal(player.shotsFired, 1);
    assert.equal(player.shotsHit, 1, 'A real safe hit counts once for the firing action');
    close(player.superCharge, control.player.superCharge, 'Safe hits add no charge beyond passive recovery');
    const damagedHp = safe.hp;
    advance(game, 4);
    assert.equal(safe.hp, damagedHp, 'Safes never regenerate');
  }
});

test('v3 하이스트: 초과 피해는 다음 75·50·25% 단계에서 멈추고 각 보호막은 한 번만 열린다', () => {
  const { game, player, safe } = heistDuel('tank');
  player.x = safe.x - 150;
  // Deliberate stress fixture: one pellet exceeds several shield stages.
  // The normal public power scaling creates the burst without private methods.
  player.power = 1000;
  assert.equal(safe.maxHp, 24000);
  for (const [index, hp] of [18000, 12000, 6000].entries()) {
    player.ammo = 3; player.shotCooldown = 0;
    shot(game, safe);
    until(game, () => safe.shieldsTriggered === index + 1, 1);
    advance(game, 0.3);
    assert.equal(safe.hp, hp, 'A burst cannot skip the next shield threshold');
    close(player.objectiveDamage, safe.maxHp - hp, 'Overkill is not credited as objective damage');
    const remaining = safe.shieldTime;
    assert.ok(remaining > 1 && remaining <= 1.8);
    advance(game, 0.25);
    close(safe.shieldTime, remaining - 0.25, 'A shield timer decrements exactly once per step');
    const hitCount = player.shotsHit;
    player.ammo = 3; player.shotCooldown = 0;
    shot(game, safe); advance(game, 0.4);
    assert.equal(safe.hp, hp, 'Immune hits cannot reduce safe health');
    assert.equal(safe.shieldsTriggered, index + 1, 'Repeated hits cannot consume another shield');
    assert.equal(player.shotsHit, hitCount, 'An immune hit cannot earn a hit credit');
    until(game, () => safe.shieldTime === 0, 3);
  }
  player.ammo = 3; player.shotCooldown = 0;
  shot(game, safe);
  until(game, () => game.state.status === 'ended', 1);
  assert.equal(safe.hp, 0);
  assert.equal(safe.shieldsTriggered, 3);
  assert.equal(player.objectiveDamage, 24000);
  assert.equal(game.state.result.winner, 0);
  assert.equal(player.kills, 0);
  assert.equal(game.state.killFeed.length, 0);
});

test('v3 하이스트: 관통·폭발·돌진 슈퍼와 중력장이 금고에 올바르게 귀속된다', () => {
  for (const [hero, action] of [['ranger', 'super'], ['tank', 'super'], ['blaster', 'super'], ['blaster', 'gadget']]) {
    const { game, player, safe } = heistDuel(hero);
    if (hero === 'tank') player.x = safe.x - 125;
    player.superCharge = 1;
    const center = { x: safe.x, y: safe.y };
    game.update(DT, input(game, { [action]: true, aimX: safe.x, aimY: safe.y }));
    until(game, () => safe.hp < safe.maxHp, 2);
    advance(game, 0.4);
    close(player.objectiveDamage, safe.maxHp - safe.hp, hero + '/' + action + ' objective ownership');
    assert.equal(player.damage, 0);
    assert.equal(player.kills, 0);
    assert.equal(safe.x, center.x); assert.equal(safe.y, center.y);
    if (hero === 'tank' || action === 'gadget') {
      assert.equal(player.shotsFired, 0); assert.equal(player.shotsHit, 0);
    } else {
      assert.equal(player.shotsFired, 1); assert.equal(player.shotsHit, 1);
    }
  }
});

test('v3 하이스트: 지속 장판도 보호막을 뚫거나 타이머를 여러 번 줄이지 않는다', () => {
  const { game, player, safe } = heistDuel('blaster');
  Object.assign(safe, { hp: 18000, shieldsTriggered: 1, shieldTime: 1.8 });
  game.state.fields.push(gravity('immune-safe-field', player, safe));
  advance(game, 0.5);
  assert.equal(safe.hp, 18000);
  assert.equal(player.objectiveDamage, 0);
  close(safe.shieldTime, 1.3, 'Field contact must not decrement the shield a second time');
  advance(game, 1.5);
  assert.ok(safe.hp < 18000, 'The still-active field can damage after immunity expires');
  close(player.objectiveDamage, 18000 - safe.hp, 'Only post-shield field damage is credited');
  assert.equal(safe.shieldsTriggered, 1);
});

test('v3 하이스트: 양 팀의 금고는 캐릭터 몸체를 막지만 우회 이동은 가능하다', () => {
  for (const team of [0, 1]) {
    const game = quiet('heist');
    keep(game, [game.player]);
    const safe = game.state.safes.find((candidate) => candidate.team === team);
    Object.assign(game.player, { x: safe.x - 100, y: safe.y });
    advance(game, 2, { moveX: 1 });
    assert.ok(game.player.x + game.player.r <= safe.x - safe.r + EPS);
    advance(game, 1, { moveY: -1 });
    advance(game, 0.8, { moveX: 1 });
    assert.ok(game.player.x > safe.x, 'The solid objective must not trap an actor away from it');
  }
});

test('v3 하이스트: 같은 스텝의 양쪽 금고 파괴는 순서와 무관하게 무승부다', () => {
  for (const reverse of [false, true]) {
    const game = quiet('heist');
    const player = game.player;
    const enemy = game.state.actors.find((actor) => actor.team !== player.team);
    keep(game, [player, enemy]);
    for (const safe of game.state.safes) Object.assign(safe, { hp: 1, shieldsTriggered: 3, shieldTime: 0 });
    const fields = game.state.safes.map((safe) => gravity('double-' + safe.id, safe.team === 0 ? enemy : player, safe));
    game.state.fields.push(...(reverse ? fields.reverse() : fields));
    advance(game, DT);
    assert.ok(game.state.safes.every((safe) => safe.hp === 0));
    assert.equal(game.state.status, 'ended');
    assert.equal(game.state.result.winner, null);
    assert.equal(game.state.result.won, false);
    close(player.objectiveDamage, 1, 'Our actual final damage');
    close(enemy.objectiveDamage, 1, 'Opponent actual final damage');
    assert.equal(player.kills + enemy.kills, 0);
    assert.equal(game.state.killFeed.length, 0);
  }
});

test('v3 하이스트: 우리 금고 파괴는 패배와 우리 금고라는 종료 원인으로 표시된다', () => {
  const game = quiet('heist');
  const player = game.player;
  const enemy = game.state.actors.find((actor) => actor.team !== player.team);
  keep(game, [player, enemy]);
  const own = game.state.safes.find((safe) => safe.team === player.team);
  Object.assign(own, { hp: 1, shieldsTriggered: 3, shieldTime: 0 });
  game.state.fields.push(gravity('our-safe-destroyed', enemy, own));
  advance(game, DT);
  assert.equal(game.state.status, 'ended');
  assert.equal(game.state.result.winner, enemy.team);
  assert.equal(game.state.result.won, false);
  assert.match(game.state.result.reason, /우리|아군|자신/, 'The reason must describe our destroyed safe, not an opposing-safe victory');
});

test('v3 하이스트: 시간 종료는 남은 체력의 비율과 정밀 값을 비교한다', () => {
  const fixtures = [
    { hp: [12000.02, 12000.01], max: [24000, 24000], winner: 0 },
    { hp: [12000, 12000], max: [24000, 24000], winner: null },
    { hp: [12000, 24000], max: [24000, 48000], winner: null }
  ];
  for (const fixture of fixtures) {
    const game = quiet('heist');
    keep(game, [game.player]);
    game.state.safes.forEach((safe) => {
      safe.hp = fixture.hp[safe.team]; safe.maxHp = fixture.max[safe.team];
    });
    game.state.elapsed = 180 - DT / 2;
    advance(game, DT);
    assert.equal(game.state.status, 'ended');
    assert.equal(game.state.result.winner, fixture.winner);
  }
});

test('v3 하이스트 자동 조준: 적이 없으면 열린 적 금고, 보호막·벽이 있으면 제외한다', () => {
  const { game, player, safe } = heistDuel();
  let aim = game.getAutoAim();
  assert.equal(aim.kind, 'safe'); assert.equal(aim.targetId, safe.id);
  safe.shieldTime = 1;
  aim = game.getAutoAim();
  assert.equal(aim.kind, 'forward'); assert.equal(aim.targetId, null);
  safe.shieldTime = 0;
  game.state.walls.push({ id: 'safe-aim-cover', x: player.x + 75, y: safe.y - 90,
    w: 35, h: 180, hp: 100000, maxHp: 100000, destructible: false, kind: 'stone' });
  aim = game.getAutoAim();
  assert.equal(aim.kind, 'forward'); assert.equal(aim.targetId, null);
  game.state.walls.length = 0;
  const enemy = game.state.actors.find((actor) => actor.team !== player.team);
  keep(game, [player, enemy]);
  Object.assign(enemy, { x: player.x + 100, y: player.y - 100 });
  aim = game.getAutoAim();
  assert.equal(aim.kind, 'enemy'); assert.equal(aim.targetId, enemy.id, 'A visible enemy candidate takes priority');
});

function finiteTree(value, label = 'state', seen = new Set()) {
  if (typeof value === 'number') { assert.ok(Number.isFinite(value), label + ' must be finite'); return; }
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  for (const [key, child] of Object.entries(value)) finiteTree(child, label + '.' + key, seen);
}

function validObjectives(game) {
  finiteTree(game.state);
  for (const zone of game.state.captureZones) {
    for (const value of zone.progress) assert.ok(value >= 0 && value <= 100);
    for (const value of zone.occupants) assert.ok(Number.isInteger(value) && value >= 0 && value <= 3);
  }
  for (const safe of game.state.safes) {
    assert.ok(safe.hp >= 0 && safe.hp <= safe.maxHp);
    assert.ok(Number.isInteger(safe.shieldsTriggered) && safe.shieldsTriggered >= 0 && safe.shieldsTriggered <= 3);
    assert.ok(safe.shieldTime >= 0 && safe.shieldTime <= 1.8 + EPS);
  }
  for (const actor of game.state.actors) {
    assert.ok(actor.captureTime >= 0 && actor.objectiveDamage >= 0);
    assert.ok(actor.shotsHit <= actor.shotsFired);
  }
}

function simulatedInput(game, frame) {
  const aim = game.getAutoAim();
  return input(game, { moveX: Math.sin(frame * 0.018), moveY: Math.cos(frame * 0.023),
    aimX: aim.x, aimY: aim.y, fire: frame % 10 < 7, super: frame % 180 === 0, gadget: frame % 240 === 0 });
}

test('v3 신규 모드: 봇과 세 영웅의 실제 고정 스텝 시뮬레이션이 유효한 결과로 종료한다', () => {
  for (const mode of ['hotzone', 'heist']) {
    for (const hero of ['ranger', 'tank', 'blaster']) {
      const game = new Game({ mode, hero, difficulty: 'normal', seed: 20261114 });
      for (let frame = 0; frame < 60 * 181 && game.state.status === 'playing'; frame++) {
        game.update(DT, simulatedInput(game, frame));
        if (frame % 30 === 0 || game.state.status === 'ended') validObjectives(game);
      }
      assert.equal(game.state.status, 'ended', mode + '/' + hero + ' must not run beyond its deadline');
      assert.ok(game.state.elapsed <= 180 + DT + EPS);
      assert.ok(game.state.result && typeof game.state.result.won === 'boolean');
    }
  }
});

test('v3 신규 모드: 같은 시드·입력의 목표·봇·피해 상태가 재현된다', () => {
  for (const mode of ['hotzone', 'heist']) {
    const options = { mode, hero: 'blaster', seed: 58031, difficulty: 'normal' };
    const first = new Game(options), second = new Game(options);
    for (let frame = 0; frame < 60 * 20; frame++) {
      const command = simulatedInput(first, frame);
      first.update(DT, command); second.update(DT, command);
      if (frame % 60 === 0 || first.state.status === 'ended') {
        assert.deepEqual(first.state, second.state, mode + ' diverged at frame ' + frame);
      }
      if (first.state.status === 'ended') break;
    }
  }
});
