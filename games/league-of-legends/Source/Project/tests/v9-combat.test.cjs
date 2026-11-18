'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Game } = require('../dist/game.js');
const combat = require('../dist/restored-gameplay.js');
const oldCheckpoint = require('./fixtures/v8-combat-checkpoint.json');

function arena(id = 'lol_ahri') {
  const g = new Game({ hero: id, seed: 909 }); g.start();
  const p = g.player;
  const t = g.entities.find(e => e.type === 'hero' && e.team === 1);
  g.gainXp(p, 1e6); g.autoAllocateSkills();
  Object.assign(p, { x: 800, y: 800, mana: p.maxMana, autoAttack: false });
  Object.assign(t, { x: 850, y: 800, maxHp: 10000, hp: 6000, armor: 35, magicResist: 60, shield: 75 });
  g.time = 1; g._rebuildIndex();
  return { g, p, t };
}

function immediateAttack(g, p, t) {
  const hp = t.hp, shield = t.shield;
  const shot = combat.attack(g, p, t, g._basicAttackDamage(p, t));
  combat.attackHit(g, p, t, shot.damage, shot.data, { x: p.x, y: p.y });
  return { hpDamage: hp - t.hp, shieldDamage: shield - t.shield };
}

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} differs from ${expected}`);

test('basic attack preview shares six champion calculations without changing RNG, ammo, marks, buffs or the save', () => {
  for (const id of ['lol_ahri', 'lol_ashe', 'lol_garen', 'lol_lux', 'lol_leesin', 'lol_jhin']) {
    const { g, p, t } = arena(id);
    p.critChance = 0;
    if (id === 'lol_ashe') { t.frostUntil = 10; p.restored.buffUntil = 10; p.critChance = 0.4; }
    if (id === 'lol_garen') p.restored.empoweredUntil = 10;
    if (id === 'lol_lux') { t.illuminatedBy = p.id; t.illuminatedUntil = 10; p.abilityPower = 120; }
    if (id === 'lol_leesin') { p.restored.flurryHits = 2; p.restored.flurryUntil = 10; p.mana = 50; }
    if (id === 'lol_jhin') p.restored.ammo = 1;
    const before = JSON.stringify(g.exportState());
    const preview = combat.previewBasicAttack(g, p, t, g._basicAttackDamage(p, t));
    for (let i = 0; i < 40; i++) assert.deepEqual(combat.previewBasicAttack(g, p, t, g._basicAttackDamage(p, t)), preview);
    assert.equal(JSON.stringify(g.exportState()), before, id + ' preview must be a read-only operation');
    const result = immediateAttack(g, p, t);
    close(result.hpDamage, preview.hpDamageMin); close(result.shieldDamage, preview.shieldDamageMin);
    close(preview.hpDamageMin, preview.hpDamageMax);
    if (id === 'lol_garen') assert.equal(p.restored.empoweredUntil, 0);
    if (id === 'lol_lux') assert.equal(t.illuminatedUntil, 0);
    if (id === 'lol_leesin') assert.equal(p.restored.flurryHits, 1);
    if (id === 'lol_jhin') assert.equal(p.restored.ammo, 0);
  }
});

test('random crits expose both bounds and do not label a possible kill as a guaranteed last hit', () => {
  const { g, p, t } = arena();
  Object.assign(p, { damage: 100, critChance: 0.5, critDamageBonus: 0 });
  Object.assign(t, { hp: 150, shield: 0, armor: 0 });
  let randomCalls = 0; g._random = () => { randomCalls++; return 0.99; };
  const preview = combat.previewBasicAttack(g, p, t, 100);
  assert.equal(randomCalls, 0); assert.equal(preview.critical, 'possible');
  assert.equal(preview.rawMin, 100); assert.equal(preview.rawMax, 200);
  assert.equal(preview.guaranteedKill, false); assert.equal(preview.possibleKill, true);
  const low = immediateAttack(g, p, t); close(low.hpDamage, preview.hpDamageMin);
  t.hp = 150; g._random = () => 0;
  close(immediateAttack(g, p, t).hpDamage, preview.hpDamageMax);
});

test('100% crit and Jhin fourth bullet are deterministic while Ashe keeps deterministic frost damage', () => {
  for (const id of ['lol_ahri', 'lol_jhin', 'lol_ashe']) {
    const { g, p, t } = arena(id);
    p.critChance = 1; t.frostUntil = 10;
    if (id === 'lol_jhin') p.restored.ammo = 1;
    const preview = combat.previewBasicAttack(g, p, t, p.damage);
    assert.equal(preview.critical, id === 'lol_ashe' ? 'none' : 'guaranteed');
    assert.equal(preview.rawMin, preview.rawMax);
    close(immediateAttack(g, p, t).hpDamage, preview.hpDamageMin);
  }
});

test('Lux mark preview separates physical and magic mitigation and accounts for the shared shield', () => {
  const { g, p, t } = arena('lol_lux');
  Object.assign(p, { damage: 100, abilityPower: 100, critChance: 0 });
  Object.assign(t, { armor: 100, magicResist: 0, shield: 80, illuminatedBy: p.id, illuminatedUntil: 10 });
  const preview = combat.previewBasicAttack(g, p, t, p.damage);
  assert.deepEqual(preview.components.map(c => c.kind), ['physical', 'magic']);
  assert.equal(preview.components[0].mitigatedMin, 50);
  assert.equal(preview.shieldDamageMin, 80);
  const result = immediateAttack(g, p, t);
  close(result.hpDamage, preview.hpDamageMin); close(result.shieldDamage, preview.shieldDamageMin);
});

test('visible minion last-hit checks include Garen Q, Lux marks, Jhin fourth shots and Ashe frost', () => {
  for (const id of ['lol_garen', 'lol_lux', 'lol_jhin', 'lol_ashe']) {
    const { g, p } = arena(id);
    const t = g.entities.find(e => e.type === 'minion' && e.team === 1);
    Object.assign(t, { x: p.x + 30, y: p.y, maxHp: 1000, hp: 100, shield: 0, armor: 0, magicResist: 0 });
    p.damage = 80; p.critChance = 0;
    if (id === 'lol_garen') p.restored.empoweredUntil = 10;
    if (id === 'lol_lux') { t.illuminatedBy = p.id; t.illuminatedUntil = 10; }
    if (id === 'lol_jhin') p.restored.ammo = 1;
    if (id === 'lol_ashe') { t.frostUntil = 10; p.restored.buffUntil = 10; }
    g._rebuildIndex();
    assert.ok(g.isVisible(t, p.team));
    const preview = g.getBasicAttackPreview(t);
    assert.ok(preview && preview.guaranteedKill, id + ' should expose a guaranteed kill');
    assert.equal(g.canLastHit(t), true, id);
    immediateAttack(g, p, t); assert.equal(t.alive, false);
  }
});

test('public attack preview reveals no hidden enemy state', () => {
  const g = new Game({ hero: 'lol_lux' }); g.start();
  const t = g.entities.find(e => e.type === 'hero' && e.team === 1);
  assert.equal(g.isVisible(t, 0), false);
  assert.equal(g.getBasicAttackPreview(t), null);
  assert.equal(g.getBasicAttackPreview(g.player), null);
});

function leePair() {
  const result = arena('lol_leesin'), { g, p, t } = result;
  const ally = g.entities.find(e => e.hero === 'lol_leesin' && e.team === 0 && !e.isPlayer);
  const other = g.entities.find(e => e.type === 'hero' && e.team === 1 && e !== t);
  g.gainXp(ally, 1e6); g._autoAllocateSkills(ally);
  Object.assign(ally, { x: 1000, y: 800, mana: ally.maxMana });
  Object.assign(t, { x: 920, y: 800, shield: 0 });
  Object.assign(other, { x: 1150, y: 800, hp: other.maxHp, slowUntil: 0 });
  g._rebuildIndex();
  return { ...result, ally, other };
}

test('another Lee Sin E cannot steal Q recast ownership', () => {
  const { g, p, t, ally } = leePair();
  assert.ok(g.cast('q', t.x, t.y).ok); g._updateProjectiles(0.2); g.time += 0.3;
  assert.equal(p.restored.recasts.q.targetId, t.id);
  assert.ok(g._cast(ally, 'e', ally.x, ally.y).ok);
  assert.equal(t.leeMarkedBy, ally.id, 'legacy last-writer field is intentionally not authoritative');
  assert.equal(g.getSkillInfo('q', p).ready, true);
  const hp = t.hp;
  assert.ok(g.cast('q', t.x, t.y).ok); assert.ok(t.hp < hp);
  assert.equal(p.restored.recasts.q, null);
});

test('two Lee Sin Q marks survive the other caster consuming a recast on the same victim', () => {
  const { g, p, t, ally } = leePair();
  assert.ok(g.cast('q', t.x, t.y).ok);
  assert.ok(g._cast(ally, 'q', t.x, t.y).ok);
  g._updateProjectiles(0.2); g.time += 0.3;
  assert.equal(p.restored.recasts.q.targetId, t.id);
  assert.equal(ally.restored.recasts.q.targetId, t.id);
  assert.ok(g.cast('q', t.x, t.y).ok);
  assert.equal(g.getSkillInfo('q', ally).ready, true);
  const hp = t.hp;
  assert.ok(g._cast(ally, 'q', t.x, t.y).ok);
  assert.ok(t.hp < hp); assert.equal(ally.restored.recasts.q, null);
});

test('two Lee Sin E casts keep their own target sets and never slow an enemy they did not hit', () => {
  const { g, p, t, ally, other } = leePair();
  assert.ok(g.cast('e', p.x, p.y).ok);
  assert.ok(p.restored.recasts.e.targetIds.includes(t.id));
  assert.ok(!p.restored.recasts.e.targetIds.includes(other.id));
  assert.ok(g._cast(ally, 'e', ally.x, ally.y).ok);
  assert.ok(ally.restored.recasts.e.targetIds.includes(t.id));
  assert.ok(ally.restored.recasts.e.targetIds.includes(other.id));
  p.x = 1100; g.time += 0.3; g._rebuildIndex();
  assert.ok(g.cast('e', p.x, p.y).ok);
  assert.ok(t.slowUntil > g.time); assert.equal(other.slowUntil, 0);
  assert.ok(g._cast(ally, 'e', ally.x, ally.y).ok); assert.ok(other.slowUntil > g.time);
});

test('real v8 checkpoint restores Q/E cast ownership and missing effect origins into v9', () => {
  // Generated with all four original JS modules from opening commit
  // b34e44cfacee5cac08261eff09c4db58bf8bc3a7, not by stripping a v9 export.
  const original = JSON.stringify(oldCheckpoint);
  assert.equal(oldCheckpoint.engineVersion, 8);
  const oldPlayer = oldCheckpoint.state.entities.find(e => e.id === 'player');
  assert.equal(oldPlayer.restored.recasts.e.targetIds, undefined);
  assert.ok(oldCheckpoint.state._restoredEffects.every(e => e.originX === undefined));
  const g = Game.fromState(oldCheckpoint, { paused: false, clearInput: false });
  assert.equal(JSON.stringify(oldCheckpoint), original, 'migration must not mutate the caller checkpoint');
  const expectedIds = oldCheckpoint.state.entities.filter(t => t.alive && t.team !== 0 && t.leeMarkedBy === 'player' && t.leeEMarkUntil > oldCheckpoint.state.time).map(t => t.id);
  assert.deepEqual(g.player.restored.recasts.e.targetIds, expectedIds);
  assert.equal(g.getSkillInfo('q').ready, true);
  for (const e of g._restoredEffects) {
    assert.equal(e.originX, e.x); assert.equal(e.originY, e.y);
  }
  assert.equal(g.exportState().engineVersion, 9);
  assert.ok(g.cast('e', g.player.x, g.player.y).ok);
  assert.ok(expectedIds.some(id => g._byId.get(id).slowUntil > g.time));
});

test('new Lee Sin mark and effect metadata survive saves and reject corrupt fields', () => {
  const g = Game.fromState(oldCheckpoint, { paused: false, clearInput: false });
  const saved = g.exportState(), loaded = Game.fromState(saved, { paused: false, clearInput: false });
  assert.deepEqual(loaded.player.restored.recasts, g.player.restored.recasts);
  assert.deepEqual(loaded._restoredEffects, g._restoredEffects);
  const bad = (edit) => { const value = structuredClone(saved); edit(value); assert.throws(() => Game.fromState(value)); };
  bad(s => { delete s.state.entities.find(e => e.id === 'player').restored.recasts.e.targetIds; });
  bad(s => { s.state.entities.find(e => e.id === 'player').restored.recasts.e.targetIds = ['x', 'x']; });
  bad(s => { s.state.entities.find(e => e.id === 'player').restored.recasts.e.targetIds = [NaN]; });
  bad(s => { delete s.state._restoredEffects[0].originX; });
  bad(s => { s.state._restoredEffects[0].originY = Infinity; });
});

test('projectile and delayed laser damage keep the launch origin when their caster moves', () => {
  for (const [id, slot] of [['lol_ahri', 'e'], ['lol_lux', 'r']]) {
    const { g, p, t } = arena(id); t.x = 1000; g._rebuildIndex();
    const origins = [], original = g.damage.bind(g);
    g.damage = (target, amount, source, kind, origin) => { if (source === p) origins.push(origin); return original(target, amount, source, kind, origin); };
    assert.ok(g.cast(slot, t.x, t.y).ok);
    p.x = 600; p.y = 600;
    if (slot === 'e') g._updateProjectiles(0.3);
    else { g.time += 0.7; combat.updateEffects(g, 0.7); }
    assert.ok(origins.length > 0);
    assert.ok(origins.every(origin => origin.x === 800 && origin.y === 800));
  }
});

test('placed trap damage uses the trap position rather than the moved owner position', () => {
  const { g, p, t } = arena('lol_jhin');
  Object.assign(t, { x: 900, y: 800 }); g._rebuildIndex();
  const origins = [], original = g.damage.bind(g);
  g.damage = (target, amount, source, kind, origin) => { if (source === p) origins.push(origin); return original(target, amount, source, kind, origin); };
  assert.ok(g.cast('e', t.x, t.y).ok);
  p.x = 600; p.y = 600; g.time = 2.1; combat.updateEffects(g, 0.1);
  g.time = 4.2; combat.updateEffects(g, 0.1);
  assert.ok(origins.length > 0);
  assert.ok(origins.every(origin => origin.x === 900 && origin.y === 800));
});
