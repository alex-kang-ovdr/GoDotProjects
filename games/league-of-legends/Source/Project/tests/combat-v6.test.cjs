'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Game } = require('../dist/game.js');
const DT = 1 / 60;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function advance(game, seconds) { for (let i = 0; i < Math.ceil(seconds / DT); i++) game.step(DT); }
function refresh(game) { game._rebuildIndex(); game._updateVision(true); }
function duel(hero = 'ranger') {
  const game = new Game({ hero, seed: 213 }); game.start();
  const target = game.entities.find(e => e.type === 'hero' && e.team === 1);
  const other = game.entities.find(e => e.type === 'hero' && e.team === 1 && e !== target);
  game.entities = [game.player, target, other]; game.nextWaveAt = 1e9; game._goldTickAt = 1e9;
  Object.assign(game.player, { x: 800, y: 800, autoAttack: false });
  Object.assign(target, { x: 900, y: 800, stunnedUntil: 1000, hp: 10000, maxHp: 10000 });
  Object.assign(other, { x: 800, y: 1000, stunnedUntil: 1000, hp: 10000, maxHp: 10000 });
  game._rebuildIndex(); return { game, player: game.player, target, other };
}
function begin(game, target) {
  assert.equal(game.attackTarget(target.id).ok, true); game.step(DT);
  assert.equal(game.getAttackState().phase, 'windup');
  return game.player.attackWindup;
}
function shots(game) { return game.projectiles.filter(e => e.sourceId === 'player' && e.kind === 'basic'); }
function learn(game, slot) {
  while (!game.player.skillPoints) game.gainXp(game.player, game.player.nextXp - game.player.xp);
  assert.equal(game.upgradeSkill(slot).ok, true);
}

test('a ranged attack visibly prepares before emitting damage and getAttackState is a detached view', () => {
  const { game, player, target } = duel(); const hp = target.hp;
  const attack = begin(game, target);
  assert.equal(shots(game).length, 0); assert.equal(target.hp, hp);
  assert.ok(Math.abs(attack.duration - 0.25 / player.attackSpeed) < 1e-12);
  const state = game.getAttackState(); state.remaining = 0; state.targetId = 'forged';
  assert.equal(player.attackWindup.targetId, target.id);
  assert.equal(player.attackWindup.remaining, attack.duration);
  advance(game, attack.duration / 2);
  assert.equal(shots(game).length, 0); assert.equal(game.getAttackState().phase, 'windup');
  assert.ok(game.getAttackState().progress > 0.45 && game.getAttackState().progress < 0.65);
});

test('release emits one empowered projectile and recovery counts from attack start', () => {
  const { game, player, target } = duel(); player.nextAttackBonus = 50;
  const attack = { ...begin(game, target) }; const start = game.time;
  assert.equal(player.nextAttackBonus, 50);
  advance(game, attack.duration);
  assert.equal(shots(game).length, 1); assert.equal(player.nextAttackBonus, 0);
  assert.equal(shots(game)[0].damage, player.damage + 50);
  const state = game.getAttackState();
  assert.equal(state.phase, 'recovery');
  assert.ok(Math.abs(state.duration - (attack.period - attack.duration)) < 1e-12);
  assert.ok(Math.abs(state.remaining - (attack.period - (game.time - start))) < 1e-9);
  const releaseTime = game.time;
  while (game.time < start + attack.period - DT) game.step(DT);
  assert.equal(game.getAttackState().phase, 'recovery');
  game.step(DT);
  assert.equal(game.getAttackState().phase, 'windup', 'The next preparation starts one attack period after the prior preparation');
  assert.ok(game.time - releaseTime < attack.period, 'Recovery does not incorrectly add a full extra period after release');
});

test('melee attacks apply their hit only at the end of preparation', () => {
  const { game, player, target } = duel('warrior'); const hp = target.hp;
  const attack = begin(game, target); advance(game, attack.duration / 2);
  assert.equal(target.hp, hp); assert.equal(shots(game).length, 0);
  advance(game, attack.duration / 2);
  assert.ok(target.hp < hp); assert.equal(shots(game).length, 0);
  assert.equal(game.getAttackState().phase, 'recovery'); assert.equal(player.nextAttackBonus, 0);
});

test('directional movement cancels preparation without spending the empowered hit and suppresses attacks while held', () => {
  const { game, player, target } = duel(); player.nextAttackBonus = 60; player.autoAttack = true;
  begin(game, target); const x = player.x;
  game.setInputVector(0, -1);
  assert.equal(player.attackWindup, null); assert.equal(player.attackCooldown, 0);
  assert.equal(player.nextAttackBonus, 60);
  advance(game, 0.5); assert.equal(shots(game).length, 0); assert.ok(player.y < 800); assert.equal(player.x, x);
  game.setInputVector(0, 0); game.step(DT);
  assert.equal(game.getAttackState().phase, 'windup');
});

test('a plain click move does not stop to autoattack and resumes only after arrival', () => {
  const { game, player, target } = duel(); player.autoAttack = true;
  begin(game, target); assert.equal(game.commandMove(760, 800).ok, true);
  assert.equal(player.attackWindup, null);
  advance(game, 0.1); assert.ok(player.x < 800); assert.ok(game._moveDestination);
  assert.equal(shots(game).length, 0); assert.equal(player.attackWindup, null);
  advance(game, 0.3); assert.equal(game._moveDestination, null);
  assert.ok(player.attackWindup || player.attackCooldown > 0, 'Automatic attacks can resume at the destination');
});

test('attack-move closes range, plants feet during preparation, and resumes its destination after a kill', () => {
  const { game, player, target, other } = duel(); other.alive = false;
  Object.assign(target, { x: 1180, y: 720 }); // Keep target and destination outside the eastern wall.
  refresh(game);
  const destination = { x: 1250, y: 680 };
  assert.equal(game.commandAttackMove(destination.x, destination.y).ok, true);
  for (let i = 0; i < 120 && !player.attackWindup; i++) game.step(DT);
  assert.ok(player.attackWindup); assert.ok(player.x > 800);
  const start = { x: player.x, y: player.y };
  advance(game, player.attackWindup.duration / 2);
  assert.equal(player.x, start.x); assert.equal(player.y, start.y);
  game.killEntity(target, player); assert.equal(player.attackWindup, null);
  advance(game, 0.2); assert.ok(distance(player, destination) < distance(start, destination));
});

test('same-target command spam preserves progress while a different explicit target restarts preparation', () => {
  const { game, player, target, other } = duel(); begin(game, target); advance(game, 0.1);
  const remaining = player.attackWindup.remaining;
  for (let i = 0; i < 10; i++) assert.equal(game.attackTarget(target.id).ok, true);
  assert.equal(player.attackWindup.remaining, remaining);
  assert.equal(game.attackTarget(other.id).ok, true);
  assert.equal(player.attackWindup, null); assert.equal(player.attackCooldown, 0);
  game.step(DT); assert.equal(player.attackWindup.targetId, other.id);
  assert.ok(player.attackWindup.remaining > remaining);
});

test('stop, recall and disabling autonomous attacks cancel only a pending preparation', () => {
  for (const command of ['stop', 'recall', 'auto']) {
    const { game, player, target } = duel(); player.autoAttack = true;
    if (command === 'auto') { game.setFocusTarget(target.id); game.step(DT); }
    else begin(game, target);
    assert.ok(player.attackWindup);
    if (command === 'auto') game.setAutoAttack(false); else game[command]();
    assert.equal(player.attackWindup, null, command); assert.equal(player.attackCooldown, 0, command);
  }
});

test('failed casts preserve preparation, successful QWER and blink cancel it, heal and ward preserve it', () => {
  const { game, player, target } = duel(); learn(game, 'w'); begin(game, target);
  const pending = player.attackWindup; player.cd.q = 2;
  assert.equal(game.cast('q', 1000, 800).ok, false); assert.equal(player.attackWindup, pending);
  assert.equal(game.cast('f').ok, true); assert.equal(player.attackWindup, pending);
  assert.equal(game.cast('ward', 780, 780).ok, true); assert.equal(player.attackWindup, pending);
  assert.equal(game.cast('w').ok, true); assert.equal(player.attackWindup, null);
  begin(game, target); player.cd.q = 0;
  assert.equal(game.cast('q', 1000, 800).ok, true); assert.equal(player.attackWindup, null);
  begin(game, target); assert.equal(game.cast('d', 700, 800).ok, true); assert.equal(player.attackWindup, null);
  assert.equal(shots(game).length, 0);
});

test('ranger roll cancels the old preparation and gives exactly one bonus to the new basic attack', () => {
  const { game, player, target } = duel(); learn(game, 'e'); begin(game, target);
  assert.equal(game.cast('e', 810, 800).ok, true);
  const bonus = player.nextAttackBonus;
  assert.ok(bonus > 0); assert.equal(player.attackWindup, null); assert.equal(player.attackCooldown, 0);
  const attack = begin(game, target); advance(game, attack.duration);
  assert.equal(shots(game).length, 1); assert.equal(shots(game)[0].damage, player.damage + bonus);
  assert.equal(player.nextAttackBonus, 0);
});

test('stun cancels preparation before any hit and no new attack begins until the stun ends', () => {
  const { game, player, target } = duel(); begin(game, target);
  player.stunnedUntil = game.time + 0.5; game.step(DT);
  assert.equal(player.attackWindup, null); assert.equal(game.getAttackState().phase, 'disabled');
  advance(game, 0.3); assert.equal(shots(game).length, 0);
  advance(game, 0.2); assert.equal(game.getAttackState().phase, 'windup');
});

test('source death and target death cancel the pending attack immediately', () => {
  for (const who of ['source', 'target']) {
    const { game, player, target } = duel(); begin(game, target);
    game.killEntity(who === 'source' ? player : target, who === 'source' ? target : player);
    assert.equal(player.attackWindup, null, who);
    advance(game, 0.3); assert.equal(shots(game).length, 0, who);
  }
});

test('losing visibility or moving outside attack range invalidates a preparation before release', () => {
  for (const reason of ['hidden', 'range']) {
    const { game, player, target, other } = duel(); other.alive = false;
    if (reason === 'hidden') Object.assign(target, { x: 680, y: 700, revealedUntil: 100 }); // Brush edge is outside high ground.
    game._rebuildIndex(); begin(game, target);
    if (reason === 'hidden') target.revealedUntil = 0; else target.x = 1220;
    game._rebuildIndex(); game.step(DT);
    assert.equal(player.attackWindup, null, reason); assert.equal(shots(game).length, 0, reason);
  }
});

test('already released projectiles survive movement and a caster death', () => {
  for (const command of ['move', 'death']) {
    const { game, player, target } = duel(); const hp = target.hp;
    const attack = begin(game, target); advance(game, attack.duration);
    assert.equal(shots(game).length, 1);
    if (command === 'move') game.setInputVector(-1, 0); else game.killEntity(player, target);
    advance(game, 0.3); assert.ok(target.hp < hp, command);
  }
});

test('moving during recovery does not reset attack cooldown or duplicate a projectile', () => {
  const { game, player, target } = duel(); const attack = begin(game, target); advance(game, attack.duration);
  const cooldown = player.attackCooldown;
  game.commandMove(750, 800); assert.equal(player.attackCooldown, cooldown);
  game.stop(); assert.equal(player.attackCooldown, cooldown);
  game.attackTarget(target.id); assert.equal(player.attackCooldown, cooldown);
  assert.equal(game.getAttackState().phase, 'recovery'); assert.equal(shots(game).length, 1);
});

test('attack-speed changes apply to the next cycle without accelerating a preparation already in progress', () => {
  const { game, player, target } = duel(); const attack = { ...begin(game, target) };
  player.rapidUntil = 100;
  advance(game, attack.duration / 2);
  assert.equal(player.attackWindup.duration, attack.duration); assert.equal(player.attackWindup.period, attack.period);
  advance(game, attack.duration / 2);
  assert.equal(game.getAttackState().phase, 'recovery');
  while (!player.attackWindup) game.step(DT);
  assert.ok(Math.abs(player.attackWindup.period - attack.period / 1.7) < 1e-9);
  assert.ok(player.attackWindup.duration < attack.duration);
});

test('pause freezes the preparation and reports its phase without consuming it', () => {
  const { game, player, target } = duel(); begin(game, target); advance(game, 0.1);
  game.paused = true; const state = game.getAttackState(); advance(game, 2);
  assert.deepEqual(game.getAttackState(), state); assert.equal(shots(game).length, 0);
  game.paused = false; advance(game, player.attackWindup.remaining);
  assert.equal(shots(game).length, 1);
});

test('AI completes its preparation across decision intervals and moves while recovering', () => {
  const { game, player, target } = duel();
  Object.assign(target, { stunnedUntil: 0, hero: 'ranger', range: 320, attackSpeed: 1.12, x: 930, y: 800,
    aiThinkIn: 0, targetId: player.id, aiMove: {x: 800, y: 800}, hp: 10000, maxHp: 10000 });
  for (const key of Object.keys(target.cd)) target.cd[key] = 999;
  game._rebuildIndex(); game.step(DT);
  assert.ok(target.attackWindup); const start = { x: target.x, y: target.y };
  const duration = target.attackWindup.duration; advance(game, duration);
  assert.equal(target.x, start.x); assert.equal(target.y, start.y);
  assert.equal(game.projectiles.filter(e => e.sourceId === target.id && e.kind === 'basic').length, 1);
  game.step(DT); assert.ok(target.x > start.x, 'The ranged AI resumes spacing after release');
});

test('tower danger interrupts an AI preparation instead of pinning it in the tower ring', () => {
  const game = new Game({hero:'mage',seed:91}); game.start();
  const hero = game.entities.find(e => e.type === 'hero' && e.team === 0 && !e.isPlayer);
  const target = game.entities.find(e => e.type === 'hero' && e.team === 1);
  const tower = game.entities.find(e => e.type === 'tower' && e.team === 1 && e.structureTier === 'outer');
  game.entities = [game.player, hero, target, tower]; game.nextWaveAt = 1e9;
  Object.assign(game.player, {x:400,y:900,autoAttack:false});
  Object.assign(hero, {x:800,y:800,aiThinkIn:99,targetId:target.id});
  Object.assign(target, {x:850,y:800,stunnedUntil:999}); Object.assign(tower, {x:1000,y:800,attackCooldown:99});
  refresh(game); assert.equal(game._attack(hero,target),true); assert.ok(hero.attackWindup);
  const before = distance(hero,tower); game.step(DT);
  assert.equal(hero.attackWindup,null); assert.ok(distance(hero,tower)>before);
  assert.equal(game.projectiles.filter(e=>e.sourceId===hero.id).length,0);
});

test('an epic-objective hazard interrupts a pending AI attack so evasion starts immediately', () => {
  const game = new Game({hero:'ranger',seed:91}); game.start();
  const hero = game.entities.find(e => e.type === 'hero' && e.team === 1);
  const dragon = game.entities.find(e => e.id === 'dragon');
  game.entities = [game.player, hero, dragon]; game.nextWaveAt = 1e9;
  Object.assign(game.player, {x:1070,y:1080,autoAttack:false});
  Object.assign(hero, {x:1000,y:1080,aiThinkIn:99,targetId:'player'});
  Object.assign(dragon, {alive:true,hp:dragon.maxHp,inCombat:true,targetId:hero.id,nextHazardAt:99});
  game._rebuildIndex(); assert.equal(game._attack(hero,game.player),true);
  game._startMonsterHazard(dragon,hero); const hazard = {...game._hazards[0]};
  game.step(DT);
  assert.equal(hero.attackWindup,null); assert.ok(distance(hero,hazard)>0);
  assert.equal(game.projectiles.filter(e=>e.sourceId===hero.id).length,0);
});

test('critical-health AI cancels a pending attack and retreats even before its next scheduled decision', () => {
  const {game,target:hero,player} = duel();
  Object.assign(hero,{stunnedUntil:0,hp:2000,maxHp:10000,aiThinkIn:99,targetId:player.id});
  for (const key of Object.keys(hero.cd)) hero.cd[key]=999;
  game._rebuildIndex(); assert.equal(game._attack(hero,player),true);
  const base={x:1435,y:165}; const before=distance(hero,base);
  game.step(DT);
  assert.equal(hero.attackWindup,null); assert.equal(hero.retreating,true);
  assert.ok(distance(hero,base)<before);
  assert.equal(game.projectiles.filter(e=>e.sourceId===hero.id).length,0);
});
