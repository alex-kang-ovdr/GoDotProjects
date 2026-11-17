'use strict';

// Knockout/Bounty boundary regressions. Fixtures alter public state and advance
// Game.update only. Projectile fixtures exercise the real combat/batch path;
// they never invoke private kill, scoring, visibility, or round methods.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { Game, MODES } = require(path.join(__dirname, '..', 'dist', 'engine.js'));
const DT = 1 / 60, EPS = 1e-6;

function input(game, extra = {}) {
  return { moveX: 0, moveY: 0, aimX: game.player.x + 200, aimY: game.player.y,
    fire: false, super: false, gadget: false, ...extra };
}
function step(game, extra = {}) { game.update(DT, input(game, extra)); }
function advance(game, seconds) {
  for (let left = seconds; left > EPS; left -= DT) game.update(Math.min(DT, left), input(game));
}
function until(game, predicate, seconds) {
  for (let left = seconds; !predicate() && left > EPS; left -= DT) step(game);
  assert.ok(predicate(), 'Expected transition within ' + seconds + ' seconds');
}
function close(a, b, message) { assert.ok(Math.abs(a - b) < EPS, `${message}: ${a} vs ${b}`); }
function quiet(mode, hero = 'ranger', seed = 44021) {
  const game = new Game({ mode, hero, seed, difficulty: 'normal' });
  game.aiEnabled = false;
  for (const name of ['walls', 'bushes', 'projectiles', 'fields', 'pickups', 'effects']) game.state[name].length = 0;
  game.state.actors.forEach((actor, i) => Object.assign(actor, {
    x: 120 + i * 190, y: 700, invulnerable: 0, revealFor: 0
  }));
  return game;
}
function teams(game) {
  return [game.state.actors.filter(a => a.team === 0), game.state.actors.filter(a => a.team === 1)];
}
function projectile(game, victim, killer, suffix = '') {
  // An already-in-flight projectile at the victim's edge; its living/dead owner
  // must not determine whether this step's existing projectile can still hit.
  return { id: 'fixture-' + victim.id + '-' + suffix, x: victim.x - 1, y: victim.y,
    vx: 60, vy: 0, r: 2, team: killer ? killer.team : -100,
    ownerId: killer ? killer.id : null, color: '#ffffff', kind: 'bullet',
    damage: 100000, remaining: 100, life: 1, hitIds: [], super: false };
}
function killInStep(game, victims, killers, reverse = false) {
  for (const victim of victims) { victim.invulnerable = 0; victim.shieldTime = 0; victim.dashTime = 0; }
  const shots = victims.map((victim, i) => projectile(game, victim, killers[i], i));
  game.state.projectiles.push(...(reverse ? shots.reverse() : shots));
  step(game);
}
function blueOwner(game, actor) {
  Object.assign(game.state.bounty.blueStar, { firstClaimed: true,
    carrierId: actor ? actor.id : null, team: actor ? actor.team : null,
    onGround: !actor, x: actor ? actor.x : 640, y: actor ? actor.y : 400 });
}
function mapShape(state) {
  return { walls: state.walls.map(({ x, y, w, h, hp, maxHp, destructible }) => ({ x, y, w, h, hp, maxHp, destructible })),
    bushes: state.bushes.map(b => ({ ...b })) };
}

test('v4 신규 모드: 상태·기본 현상금이 분리되고 모든 시작 위치가 엄폐물 밖이다', () => {
  for (const mode of ['knockout', 'bounty']) {
    assert.ok(MODES[mode]);
    for (const hero of ['ranger', 'tank', 'blaster']) for (const seed of [42, 44021]) {
      const game = new Game({ mode, hero, seed }), s = game.state;
      assert.equal(s.actors.length, 6); assert.deepEqual(s.score, [0, 0]);
      assert.equal(s.timeLimit, mode === 'knockout' ? 240 : 120);
      assert.equal(s.round === null, mode !== 'knockout');
      assert.equal(s.bounty === null, mode !== 'bounty');
      assert.equal(s.zone === null, mode !== 'knockout');
      if (s.round) {
        assert.equal(s.round.number, 1); assert.equal(s.round.phase, 'active');
        assert.equal(s.round.elapsed, 0); assert.equal(s.round.timeLimit, 75);
        assert.deepEqual(s.round.history, []);
      }
      if (s.bounty) {
        assert.equal(s.bounty.target, 20);
        assert.deepEqual(s.bounty.blueStar, { x: 640, y: 400, r: 12, carrierId: null,
          team: null, onGround: true, firstClaimed: false });
      }
      for (const a of s.actors) {
        assert.equal(a.bountyValue, 2); assert.equal(a.starsEarned, 0);
        assert.equal(a.starsLost, 0); assert.equal(a.roundSurvivals, 0);
        for (const w of s.walls.filter(w => w.hp > 0)) {
          const dx = Math.max(w.x - a.x, 0, a.x - w.x - w.w);
          const dy = Math.max(w.y - a.y, 0, a.y - w.y - w.h);
          assert.ok(Math.hypot(dx, dy) >= a.r - EPS, mode + ': spawn overlaps wall');
        }
      }
    }
  }
  for (const mode of ['gem', 'showdown', 'ball', 'hotzone', 'heist', 'training']) {
    const game = new Game({ mode });
    assert.equal(game.state.round, null); assert.equal(game.state.bounty, null);
    for (const a of game.state.actors) assert.equal(a.roundSurvivals + a.starsEarned + a.starsLost, 0);
  }
});

test('v4 녹아웃: 플레이어 사망은 경기를 끝내거나 활성 라운드에서 부활시키지 않는다', () => {
  const game = quiet('knockout'), [allies, enemies] = teams(game);
  killInStep(game, [game.player], [enemies[0]]);
  assert.equal(game.player.alive, false); assert.equal(game.player.deaths, 1);
  assert.equal(game.state.status, 'playing'); assert.equal(game.state.result, null);
  assert.equal(game.state.round.phase, 'active'); assert.deepEqual(game.state.score, [0, 0]);
  advance(game, 5);
  assert.equal(game.player.alive, false, 'The usual 2.5-second respawn must not apply');
  assert.equal(game.state.round.number, 1); assert.equal(game.state.status, 'playing');
  assert.equal(game.state.round.history.length, 0);
  assert.ok(allies.slice(1).every(a => a.alive));
});

test('v4 녹아웃: 휴식은 슈퍼·회복을 멈추고 다음 라운드는 전투 상태만 초기화한다', () => {
  const game = quiet('knockout'), [allies, enemies] = teams(game);
  const expectedMap = mapShape(new Game({ mode: 'knockout', seed: 44021 }).state);
  Object.assign(game.player, { hp: 1234, ammo: 0.3, superCharge: 0.42, gadgetCooldown: 10,
    kills: 2, deaths: 1, assists: 3, damage: 456, shotsFired: 6, shotsHit: 4 });
  killInStep(game, enemies, enemies.map(() => game.player));
  assert.equal(game.state.status, 'playing'); assert.equal(game.state.round.phase, 'break');
  assert.deepEqual(game.state.score, [1, 0]); assert.equal(game.state.round.history.length, 1);
  assert.equal(game.state.round.lastWinner, 0);
  assert.ok(allies.every(a => a.roundSurvivals === 1));
  assert.ok(enemies.every(a => a.roundSurvivals === 0));
  close(game.state.round.breakRemaining, 2.4, 'A complete intermission starts');
  const before = { hp: game.player.hp, super: game.player.superCharge, cooldown: game.player.gadgetCooldown,
    elapsed: game.state.round.elapsed, stats: [game.player.kills, game.player.deaths, game.player.assists,
      game.player.damage, game.player.shotsFired, game.player.shotsHit] };
  advance(game, 1);
  close(game.player.hp, before.hp, 'No intermission healing');
  close(game.player.superCharge, before.super, 'No intermission natural super');
  close(game.player.gadgetCooldown, before.cooldown - 1, 'Gadget cooldown continues');
  close(game.state.round.elapsed, before.elapsed, 'Round time is paused in the break');
  assert.equal(game.state.round.history.length, 1, 'The same result cannot append repeatedly');

  Object.assign(game.player, { shieldTime: 9, slowTime: 9, slowFactor: 0.4,
    dashTime: 1, dashVX: 200, dashVY: 100, vx: 200, vy: 100, revealFor: 9, shotCooldown: 9,
    damageLedger: { 3: { damage: 50, time: game.state.elapsed } } });
  Object.assign(game.player.ai, { targetId: 3, knownEnemies: { 3: { x: 2, y: 3 } }, path: [{ x: 1, y: 1 }] });
  game.state.projectiles.push(projectile(game, enemies[0], game.player, 'reset-marker'));
  game.state.fields.push({ id: 'reset-marker', type: 'gravity', ownerId: 0, team: 0, x: 400, y: 400, r: 105, life: 4, maxLife: 4 });
  game.state.pickups.push({ id: 'reset-marker', type: 'gem', x: 400, y: 400, r: 10, value: 1 });
  game.state.effects.push({ id: 'reset-marker', type: 'hit', x: 2, y: 2, r: 5, life: 100, maxLife: 100 });
  until(game, () => game.state.round.number === 2, 2);
  assert.equal(game.state.round.phase, 'active'); assert.equal(game.state.round.elapsed, 0);
  assert.equal(game.state.round.history.length, 1); assert.deepEqual(game.state.score, [1, 0]);
  assert.deepEqual(mapShape(game.state), expectedMap, 'Destroyed terrain and bushes are restored');
  for (const a of game.state.actors) {
    assert.equal(a.alive, true); assert.equal(a.hp, a.maxHp); assert.equal(a.ammo, 3);
    assert.equal(a.x, a.spawnX); assert.equal(a.y, a.spawnY); close(a.invulnerable, 1.4, 'Fresh round protection');
    assert.equal(a.shieldTime, 0); assert.equal(a.slowTime, 0); assert.equal(a.slowFactor, 1);
    assert.equal(a.dashTime, 0); assert.equal(a.vx, 0); assert.equal(a.vy, 0); assert.equal(a.revealFor, 0);
    assert.equal(a.shotCooldown, 0); assert.deepEqual(a.damageLedger, {});
    assert.deepEqual(a.ai.path, []); assert.deepEqual(a.ai.knownEnemies, {}); assert.equal(a.ai.targetId, null);
    close(a.lastHurt, game.state.elapsed, 'Damage timestamp starts at the round boundary');
    close(a.lastShot, game.state.elapsed, 'Fire timestamp starts at the round boundary');
  }
  for (const name of ['projectiles', 'fields', 'pickups']) assert.equal(game.state[name].length, 0);
  assert.ok(game.state.effects.every(e => e.id !== 'reset-marker'));
  close(game.player.superCharge, before.super, 'Super is preserved across rounds');
  assert.ok(game.player.gadgetCooldown > 7 && game.player.gadgetCooldown < 8);
  assert.deepEqual([game.player.kills, game.player.deaths, game.player.assists,
    game.player.damage, game.player.shotsFired, game.player.shotsHit], before.stats);
  assert.equal(game.state.events.filter(e => e.type === 'roundEnd').length, 1);
  assert.ok(game.state.events.some(e => e.type === 'roundStart'));
});

test('v4 녹아웃: 생존한 승리 팀원만 생존 라운드를 얻고 두 번째 승리는 경기 종료다', () => {
  const game = quiet('knockout'), [allies, enemies] = teams(game);
  killInStep(game, [allies[1], ...enemies], [enemies[0], ...enemies.map(() => game.player)]);
  assert.deepEqual(allies.map(a => a.roundSurvivals), [1, 0, 1]);
  until(game, () => game.state.round.number === 2, 3);
  game.state.walls.length = 0;
  killInStep(game, enemies, enemies.map(() => game.player));
  assert.equal(game.state.status, 'ended'); assert.deepEqual(game.state.score, [2, 0]);
  assert.equal(game.state.result.winner, 0); assert.equal(game.state.result.won, true);
  assert.equal(game.state.round.history.length, 2); assert.equal(game.state.round.number, 2);
  const result = JSON.stringify(game.state.result);
  advance(game, 4);
  assert.equal(JSON.stringify(game.state.result), result); assert.equal(game.state.round.history.length, 2);
});

test('v4 녹아웃: 같은 스텝의 양 팀 전멸은 탄환 순서·독 피해와 무관하게 무승부 라운드다', () => {
  for (const method of ['forward', 'reverse', 'poison']) {
    const game = quiet('knockout'), [allies, enemies] = teams(game);
    if (method === 'poison') {
      game.state.round.elapsed = 65;
      for (const a of game.state.actors) a.hp = 1;
      step(game);
    } else {
      killInStep(game, game.state.actors, game.state.actors.map(a => a.team === 0 ? enemies[0] : allies[0]), method === 'reverse');
    }
    assert.ok(game.state.actors.every(a => !a.alive));
    assert.equal(game.state.status, 'playing'); assert.equal(game.state.round.phase, 'break');
    assert.deepEqual(game.state.score, [0, 0]); assert.equal(game.state.round.lastWinner, null);
    assert.equal(game.state.round.history.length, 1); assert.equal(game.state.round.history[0].winner, null);
    assert.ok(game.state.actors.every(a => a.roundSurvivals === 0));
  }
});

test('v4 녹아웃: 독구름은 경기 시간이 아닌 라운드 시간을 따르고 보호막을 무시한다', () => {
  const game = quiet('knockout');
  for (const a of game.state.actors) { a.hp = a.maxHp = 1e8; }
  game.state.elapsed = 140;
  for (const [time, radius] of [[0, 770], [25, 770], [45, 395], [65, 20]]) {
    game.state.round.elapsed = Math.max(0, time - DT);
    step(game); close(game.state.zone.r, radius, 'Round safety radius at ' + time);
  }
  Object.assign(game.player, { x: 30, y: 30, invulnerable: 10, shieldTime: 10 });
  game.state.round.elapsed = 40;
  const hp = game.player.hp;
  step(game);
  close(hp - game.player.hp, (300 + game.state.round.elapsed * 9) * DT, 'Unmitigated poison damage');
  assert.equal(game.player.damage, 0); assert.ok(game.player.shieldTime > 0);
});

test('v4 녹아웃: 75초 양 팀 생존은 체력 차이와 무관하게 무승부 라운드다', () => {
  const game = quiet('knockout');
  for (const a of game.state.actors) { a.hp = a.maxHp = a.team === 0 ? 1000 : 1e8; }
  game.state.round.elapsed = 75 - DT / 2;
  step(game);
  assert.equal(game.state.round.phase, 'break'); assert.deepEqual(game.state.score, [0, 0]);
  assert.equal(game.state.round.history.length, 1); assert.equal(game.state.round.history[0].winner, null);
  assert.equal(game.state.status, 'playing');
});

test('v4 녹아웃: 전체 240초 한도는 활성·휴식 모두 라운드 승수만 비교한다', () => {
  for (const phase of ['active', 'break']) for (const score of [[1, 0], [0, 1], [1, 1]]) {
    const game = quiet('knockout');
    game.state.score = [...score]; game.state.elapsed = 240 - DT / 2;
    game.state.round.phase = phase; game.state.round.breakRemaining = phase === 'break' ? 2 : 0;
    step(game);
    const winner = score[0] === score[1] ? null : score[0] > score[1] ? 0 : 1;
    assert.equal(game.state.status, 'ended'); assert.equal(game.state.result.winner, winner);
    assert.deepEqual(game.state.score, score);
  }
});

test('v4 녹아웃: 사망 후 시야는 살아 있는 모든 아군의 합집합이며 시체는 관찰자가 아니다', () => {
  const game = quiet('knockout'), [allies, enemies] = teams(game);
  Object.assign(game.player, { x: 100, y: 600, alive: false, hp: 0 });
  Object.assign(allies[1], { x: 300, y: 250 }); Object.assign(allies[2], { x: 900, y: 550 });
  [[360, 250], [960, 550], [100, 650]].forEach(([x, y], i) => {
    Object.assign(enemies[i], { x, y, revealFor: 0 }); game.state.bushes.push({ x: x - 35, y: y - 35, w: 70, h: 70 });
  });
  step(game);
  assert.deepEqual(enemies.map(a => a.hidden), [false, false, true]);
  game.player.alive = true; game.player.hp = game.player.maxHp;
  step(game);
  assert.deepEqual(enemies.map(a => a.hidden), [true, true, false], 'Alive local player restores its own vision');
  for (const a of allies) { a.alive = false; a.hp = 0; }
  step(game);
  assert.ok(enemies.every(a => a.hidden), 'No living observer means no hidden-enemy disclosure');
});

test('v4 바운티: 점수는 누적 별이며 현상금은 7로 제한되고 사망·부활 시 2가 된다', () => {
  const game = quiet('bounty'), [, enemies] = teams(game), p = game.player;
  p.bountyValue = 6;
  for (const enemy of enemies) {
    killInStep(game, [enemy], [p]);
    assert.equal(p.bountyValue, 7);
  }
  assert.deepEqual(game.state.score, [6, 0]); assert.equal(p.starsEarned, 6);
  assert.equal(p.kills, 3); assert.ok(enemies.every(a => a.starsLost === 2 && a.bountyValue === 2));
  assert.equal(game.state.killFeed.reduce((sum, kill) => sum + (kill.stars || 0), 0), 6);
  const killer = enemies[0]; killer.alive = true; killer.hp = killer.maxHp; killer.invulnerable = 0;
  killInStep(game, [p], [killer]);
  assert.equal(p.bountyValue, 2); assert.equal(p.starsLost, 7); assert.deepEqual(game.state.score, [6, 7]);
  until(game, () => p.alive, 3);
  assert.equal(p.bountyValue, 2); assert.equal(p.starsEarned, 6); assert.equal(p.starsLost, 7);
  assert.deepEqual(game.state.score, [6, 7], 'Respawn does not replace accumulated score with actor bounties');
});

test('v4 바운티: 상호 처치는 피해 전 현상금을 사용하며 죽은 처치자도 점수를 얻는다', () => {
  const outcomes = [];
  for (const reverse of [false, true]) {
    const game = quiet('bounty'), [, enemies] = teams(game), p = game.player, e = enemies[0];
    p.bountyValue = 7; e.bountyValue = 4;
    killInStep(game, [p, e], [e, p], reverse);
    assert.deepEqual(game.state.score, [4, 7]); assert.equal(p.alive || e.alive, false);
    assert.equal(p.bountyValue, 2); assert.equal(e.bountyValue, 2);
    assert.equal(p.starsEarned, 4); assert.equal(e.starsEarned, 7);
    assert.equal(p.starsLost, 7); assert.equal(e.starsLost, 4);
    assert.equal(p.kills, 1); assert.equal(e.kills, 1);
    const feed = game.state.killFeed.map(k => ({ victimId: k.victimId, stars: k.stars })).sort((a, b) => a.victimId - b.victimId);
    outcomes.push({ score: game.state.score, feed });
  }
  assert.deepEqual(outcomes[0], outcomes[1], 'Projectile iteration order cannot change the awarded stars');
});

test('v4 바운티: 환경 사망과 유효하지 않은 처치자는 팀 별·잃은 별을 만들지 않는다', () => {
  for (const cause of ['environment', 'self']) {
    const game = quiet('bounty'), p = game.player;
    p.bountyValue = 7;
    const shot = projectile(game, p, cause === 'self' ? p : null, cause);
    shot.team = -100; // Explicit non-team damage fixture, not a friendly weapon feature.
    game.state.projectiles.push(shot); step(game);
    assert.equal(p.alive, false); assert.equal(p.deaths, 1); assert.equal(p.kills, 0);
    assert.deepEqual(game.state.score, [0, 0]); assert.equal(p.starsLost, 0); assert.equal(p.starsEarned, 0);
    assert.equal(p.bountyValue, 2); assert.equal(game.state.killFeed.at(-1).stars || 0, 0);
  }
});

test('v4 바운티: 최초 블루 스타 수집은 자격과 반경을 확인하고 일반 별을 정확히 한 번 준다', () => {
  const game = quiet('bounty'), p = game.player, blue = game.state.bounty.blueStar;
  Object.assign(p, { x: blue.x, y: blue.y, invulnerable: 1 }); step(game);
  assert.equal(blue.carrierId, null); assert.equal(blue.firstClaimed, false);
  p.invulnerable = 0; p.alive = false; p.hp = 0; p.respawnIn = 1; step(game);
  assert.equal(blue.carrierId, null, 'Dead actors cannot collect');
  p.alive = true; p.hp = p.maxHp; p.x = blue.x + p.r + blue.r + 0.1; step(game);
  assert.equal(blue.carrierId, null, 'No extra pickup magnet beyond the combined radii');
  p.x -= 0.2; step(game);
  assert.equal(blue.carrierId, p.id); assert.equal(blue.team, 0);
  assert.equal(blue.onGround, false); assert.equal(blue.firstClaimed, true);
  assert.deepEqual(game.state.score, [1, 0]); assert.equal(p.starsEarned, 1); assert.equal(p.bountyValue, 2);
  advance(game, 1);
  assert.deepEqual(game.state.score, [1, 0]); assert.equal(p.starsEarned, 1); assert.equal(p.kills, 0);
});

test('v4 바운티: 블루 스타는 유효한 적 처치자에게 양도되며 추가 수집 별을 주지 않는다', () => {
  const game = quiet('bounty'), p = game.player, enemy = teams(game)[1][0], blue = game.state.bounty.blueStar;
  blueOwner(game, p); p.bountyValue = 5;
  killInStep(game, [p], [enemy]);
  assert.equal(blue.carrierId, enemy.id); assert.equal(blue.team, 1); assert.equal(blue.onGround, false);
  assert.deepEqual(game.state.score, [0, 5]); assert.equal(enemy.starsEarned, 5);
  assert.equal(p.starsLost, 5); assert.equal(blue.firstClaimed, true);
});

test('v4 바운티: 한 스텝 양도는 최초 소유자에서 한 번뿐이며 죽은 수령인의 부활까지 유지된다', () => {
  for (const reverse of [false, true]) {
    const game = quiet('bounty'), [allies, enemies] = teams(game), owner = game.player, killer = enemies[0], next = allies[1];
    blueOwner(game, owner); owner.bountyValue = 4; killer.bountyValue = 6;
    killInStep(game, [owner, killer], [killer, next], reverse);
    const blue = game.state.bounty.blueStar;
    assert.equal(owner.alive || killer.alive, false);
    assert.equal(blue.carrierId, killer.id, 'No owner→killer→next chain inside one step');
    assert.equal(blue.team, killer.team); assert.equal(blue.onGround, false);
    assert.deepEqual(game.state.score, [6, 4]);
    step(game);
    assert.equal(blue.carrierId, killer.id, 'A dead carrier is not processed as a fresh death again');
    until(game, () => killer.alive, 3);
    assert.equal(blue.carrierId, killer.id); assert.equal(blue.team, 1); assert.equal(blue.onGround, false);
    assert.equal(killer.bountyValue, 2); assert.deepEqual(game.state.score, [6, 4]);
  }
});

test('v4 바운티: 환경 사망은 블루 스타를 떨어뜨리고 재수집은 최초 1점을 반복하지 않는다', () => {
  const game = quiet('bounty'), p = game.player, enemy = teams(game)[1][0], blue = game.state.bounty.blueStar;
  Object.assign(p, { x: blue.x, y: blue.y }); step(game);
  assert.deepEqual(game.state.score, [1, 0]);
  const death = { x: p.x, y: p.y };
  killInStep(game, [p], [null]);
  assert.equal(blue.carrierId, null); assert.equal(blue.team, null); assert.equal(blue.onGround, true);
  close(blue.x, death.x, 'Drop x'); close(blue.y, death.y, 'Drop y');
  assert.equal(blue.firstClaimed, true); assert.equal(p.starsLost, 0);
  Object.assign(enemy, { x: blue.x, y: blue.y, invulnerable: 0 }); step(game);
  assert.equal(blue.carrierId, enemy.id); assert.equal(blue.team, 1); assert.equal(blue.onGround, false);
  assert.deepEqual(game.state.score, [1, 0]); assert.equal(enemy.starsEarned, 0);
});

test('v4 바운티: 최초 블루 스타 1점도 목표 20점 도달 판정에 포함된다', () => {
  const game = quiet('bounty'), p = game.player;
  game.state.score = [19, 0]; p.starsEarned = 19;
  Object.assign(p, { x: 640, y: 400 }); step(game);
  assert.deepEqual(game.state.score, [20, 0]); assert.equal(p.starsEarned, 20);
  assert.equal(game.state.status, 'ended'); assert.equal(game.state.result.winner, 0);
});

test('v4 바운티: 양 팀 동시 20점은 최종 합계·블루 소유팀·무승부 순서로 결정된다', () => {
  const fixtures = [
    { before: [18, 18], values: [2, 2], blue: 0, winner: 0 },
    { before: [18, 18], values: [2, 2], blue: 1, winner: 1 },
    { before: [18, 18], values: [2, 2], blue: null, winner: null },
    { before: [18, 17], values: [7, 4], blue: 0, winner: 1 },
    { before: [19, 0], values: [2, 2], blue: 1, winner: 0 }
  ];
  for (const fixture of fixtures) for (const reverse of [false, true]) {
    const game = quiet('bounty'), [allies, enemies] = teams(game), p = game.player, e = enemies[0];
    game.state.score = [...fixture.before]; p.bountyValue = fixture.values[0]; e.bountyValue = fixture.values[1];
    blueOwner(game, fixture.blue === null ? null : [allies[1], enemies[1]][fixture.blue]);
    killInStep(game, [p, e], [e, p], reverse);
    assert.deepEqual(game.state.score, [fixture.before[0] + fixture.values[1], fixture.before[1] + fixture.values[0]]);
    assert.equal(game.state.status, 'ended'); assert.equal(game.state.result.winner, fixture.winner);
    if (game.state.score[0] === game.state.score[1] && fixture.blue !== null) assert.match(game.state.result.reason, /블루|파란\s*별/);
  }
});

test('v4 바운티: 120초 동점은 사망 중인 소유자도 포함한 블루 소유권으로 결정하고 결과를 고정한다', () => {
  for (const fixture of [
    { score: [10, 10], blue: 0, dead: false, winner: 0 },
    { score: [10, 10], blue: 1, dead: true, winner: 1 },
    { score: [10, 10], blue: null, dead: false, winner: null },
    { score: [11, 10], blue: 1, dead: false, winner: 0 }
  ]) {
    const game = quiet('bounty'), team = teams(game), owner = fixture.blue === null ? null : team[fixture.blue][1];
    game.state.score = [...fixture.score]; blueOwner(game, owner);
    if (fixture.dead) Object.assign(owner, { alive: false, hp: 0, respawnIn: 2 });
    game.state.elapsed = 120 - DT / 2; step(game);
    assert.equal(game.state.status, 'ended'); assert.equal(game.state.result.winner, fixture.winner);
    if (fixture.score[0] === fixture.score[1] && owner) assert.match(game.state.result.reason, /블루|파란\s*별/);
    const final = JSON.stringify({ result: game.state.result, score: game.state.score, blue: game.state.bounty.blueStar });
    game.state.projectiles.push(projectile(game, game.player, team[1][0], 'after-end'));
    advance(game, 3);
    assert.equal(JSON.stringify({ result: game.state.result, score: game.state.score, blue: game.state.bounty.blueStar }), final);
  }
});

function finiteTree(value, label = 'state', seen = new Set()) {
  if (typeof value === 'number') { assert.ok(Number.isFinite(value), label + ' must be finite'); return; }
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  for (const [name, child] of Object.entries(value)) finiteTree(child, label + '.' + name, seen);
}
function valid(game) {
  finiteTree(game.state);
  for (const a of game.state.actors) {
    assert.ok(a.hp >= 0 && a.hp <= a.maxHp + EPS); assert.ok(a.shotsHit <= a.shotsFired);
    assert.ok(a.bountyValue >= 2 && a.bountyValue <= 7);
    assert.ok(a.starsEarned >= 0 && a.starsLost >= 0 && a.roundSurvivals >= 0);
  }
  if (game.state.bounty) {
    for (const team of [0, 1]) assert.equal(game.state.score[team],
      game.state.actors.filter(a => a.team === team).reduce((sum, a) => sum + a.starsEarned, 0));
    const blue = game.state.bounty.blueStar;
    if (blue.onGround) { assert.equal(blue.carrierId, null); assert.equal(blue.team, null); }
    else assert.equal(game.state.actors.find(a => a.id === blue.carrierId).team, blue.team);
  }
}
function simulatedInput(game, frame) {
  const aim = game.getAutoAim();
  return input(game, { moveX: Math.sin(frame * 0.018), moveY: Math.cos(frame * 0.023),
    aimX: aim.x, aimY: aim.y, fire: frame % 10 < 7, super: frame % 180 === 0, gadget: frame % 240 === 0 });
}

test('v4 신규 모드: 세 영웅의 실제 전체 경기가 유한한 상태로 종료하며 같은 시드는 재현된다', () => {
  for (const mode of ['knockout', 'bounty']) for (const hero of ['ranger', 'tank', 'blaster']) {
    const options = { mode, hero, seed: 20261114, difficulty: 'normal' };
    const first = new Game(options), second = new Game(options), limit = first.state.timeLimit;
    for (let frame = 0; frame < 60 * (limit + 1) && first.state.status === 'playing'; frame++) {
      const command = simulatedInput(first, frame);
      first.update(DT, command); second.update(DT, command);
      if (frame % 60 === 0 || first.state.status === 'ended') valid(first);
      if (frame % 300 === 0) assert.deepEqual(first.state, second.state, mode + '/' + hero + ' diverged');
    }
    assert.equal(first.state.status, 'ended', mode + '/' + hero + ' exceeded deadline');
    assert.ok(first.state.elapsed <= limit + DT + EPS); assert.equal(typeof first.state.result.won, 'boolean');
    assert.deepEqual(first.state, second.state, 'Full-match result and all exposed state must reproduce');
    if (mode === 'knockout') assert.ok(first.state.round.history.length > 0);
    else assert.ok(first.state.score[0] + first.state.score[1] > 0, 'Bots must generate real objective progress');
  }
});
