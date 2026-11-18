'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Game, HEROES, ITEMS } = require('../dist/game.js');
const data = require('../dist/restored-data.js');
const DT = 1 / 60;
const near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function advance(g, seconds) { for (let i = 0; i < Math.ceil(seconds / DT); i++) g.step(DT); }
function arena(id, count = 1) {
  const g = new Game({ hero: id, seed: 271 }); g.start();
  g.gainXp(g.player, 1e6); g.autoAllocateSkills();
  const enemies = g.entities.filter(e => e.type === 'hero' && e.team === 1).slice(0, count);
  const ally = g.entities.find(e => e.type === 'hero' && e.team === 0 && !e.isPlayer);
  g.entities = [g.player, ally, ...enemies]; g.nextWaveAt = g._goldTickAt = 1e9;
  Object.assign(g.player, { x: 800, y: 800, autoAttack: false, mana: g.player.maxMana, hpRegen: 0, manaRegen: 0 });
  Object.assign(ally, { x: 800, y: 1200, stunnedUntil: 1e8, hpRegen: 0, lastDamageAt: 1e8 });
  enemies.forEach((e, i) => Object.assign(e, { x: 900 + i * 100, y: 800, stunnedUntil: 1e8, hp: 100000, maxHp: 100000, hpRegen: 0, armor: 0, magicResist: 0, lastDamageAt: 1e8 }));
  g._rebuildIndex();
  const hits = [], original = g.damage.bind(g);
  g.damage = (target, amount, source, kind) => { if (source === g.player) hits.push({ target: target.id, amount, kind, at: g.time }); return original(target, amount, source, kind); };
  return { g, p: g.player, t: enemies[0], enemies, ally, hits };
}
function cast(g, slot, target = { x: 1050, y: 800 }) { const result = g.cast(slot, target.x, target.y); assert.equal(result.ok, true, `${slot}: ${result.reason}`); return result; }

test('restored roster and shop are selected together, with raw rank arrays and resource types preserved', () => {
  assert.equal(HEROES.length, 9); assert.equal(ITEMS.length, 33);
  for (const template of data.playableHeroes) {
    const g = new Game({ hero: template.id }); g.start();
    assert.equal(g.ruleset, 'lol16.22'); assert.equal(g.getShopItems().length, 25);
    assert.ok(g.entities.filter(e => e.type === 'hero').every(e => e.hero.startsWith('lol_')));
    assert.equal(g.player.resourceType, template.resourceType);
    assert.equal(g.player.maxMana, template.mana);
    assert.equal(g.getSkillInfo('q').cooldown, template.skills.q.cooldownByRank[0]);
    assert.equal(g.getSkillInfo('q').range, template.skills.q.rangeByRank[0] * 0.5);
    assert.equal(g.buy('blade').ok, false);
    assert.equal(g.getSkillInfo('w').ready, false);
  }
  const legacy = new Game({ hero: 'mage' });
  assert.equal(legacy.getShopItems().length, 8); assert.equal(legacy.prepareItem('lol_1052').ok, false);
  legacy.start(); assert.equal(legacy.exportState().engineVersion, 9);
});

test('resource-free Garen leaves retreat after healing while mana users still wait for resource recovery', () => {
  const g = new Game({ hero: 'lol_ahri', seed: 271 }); g.start();
  const garen = g.entities.find(e => e.type === 'hero' && e.hero === 'lol_garen' && e.team === 0);
  Object.assign(garen, g.map.bases[0]); garen.hp = garen.maxHp * 0.2; garen.cd.f = 100;
  g._rebuildIndex(); g._thinkHero(garen);
  assert.equal(garen.retreating, true); assert.equal(garen.maxMana, 0); assert.equal(garen.mana, 0);
  assert.deepEqual(garen.aiMove, g.map.bases[0]);
  garen.hp = garen.maxHp * 0.95; g._thinkHero(garen);
  assert.equal(garen.retreating, false); assert.ok(near(garen.aiMove, g.map.bases[0]) > 100, 'Recovered Garen receives a forward lane destination');
  const ahri = g.entities.find(e => e.type === 'hero' && e.hero === 'lol_ahri' && e.team === 1);
  Object.assign(ahri, g.map.bases[1]); ahri.hp = ahri.maxHp; ahri.mana = 0; ahri.retreating = true;
  g._rebuildIndex(); g._thinkHero(ahri); assert.equal(ahri.retreating, true);
  ahri.mana = ahri.maxMana * 0.5; g._thinkHero(ahri); assert.equal(ahri.retreating, false);
});

test('failed casts under stun, silence, root or invalid targets spend neither resources nor cooldowns', () => {
  for (const id of data.playableHeroes.map(h => h.id)) {
    const { g, p } = arena(id);
    for (const field of ['stunnedUntil', 'silencedUntil']) {
      p[field] = 99; const mana = p.mana, count = p.restored.castCount;
      assert.equal(g.cast('w', p.x, p.y).ok, false); assert.equal(p.mana, mana); assert.equal(p.cd.w, 0); assert.equal(p.restored.castCount, count); p[field] = 0;
    }
  }
  for (const [id, slot] of [['lol_ahri', 'r'], ['lol_leesin', 'w']]) {
    const { g, p } = arena(id); p.rootedUntil = 10; const mana = p.mana;
    assert.equal(g.cast(slot, 850, 800).ok, false); assert.equal(p.cd[slot], 0); assert.equal(p.mana, mana);
  }
  for (const [id, slot] of [['lol_garen', 'r'], ['lol_leesin', 'r'], ['lol_jhin', 'q']]) {
    const { g, p } = arena(id); const mana = p.mana;
    assert.equal(g.cast(slot, 100, 100).ok, false); assert.equal(p.cd[slot], 0); assert.equal(p.mana, mana);
  }
});

test('Ahri orb damages once outward as magic and once returning as true damage', () => {
  const { g, p, t, hits } = arena('lol_ahri'); t.magicResist = 100;
  cast(g, 'q', t); advance(g, 1.5);
  const orbHits = hits.filter(h => h.target === t.id);
  assert.deepEqual(orbHits.map(h => h.kind), ['magic', 'true']);
  assert.equal(orbHits[0].amount, orbHits[1].amount);
  assert.ok(Math.abs(100000 - t.hp - orbHits[0].amount * 1.5) < 1e-6);
  assert.equal(g.projectiles.filter(p => p.restoredKind?.startsWith('ahri_q')).length, 0);
  assert.equal(p.restored.castCount, 1);
});

test('Ahri essence heals after nine minion kills and on champion takedown participation', () => {
  const { g, p, t, ally } = arena('lol_ahri'); p.hp = 100; g._spawnWave(); g._rebuildIndex();
  const minions = g.entities.filter(e => e.type === 'minion' && e.team === 1).slice(0, 9);
  assert.equal(minions.length, 9);
  for (const target of minions.slice(0, 8)) g.killEntity(target, p);
  assert.equal(p.hp, 100); assert.equal(p.restored.essenceStacks, 8);
  g.killEntity(minions[8], p); assert.ok(p.hp > 100); assert.equal(p.restored.essenceStacks, 0);
  const hp = p.hp; t.contributors[p.id] = g.time; g.killEntity(t, ally);
  assert.equal(p.assists, 1); assert.ok(p.hp > hp);
  cast(g, 'w'); assert.ok(p.hasteUntil > g.time);
});

test('Ahri foxfire fires three times, charm forces movement, and Spirit Rush spends mana only on its first cast', () => {
  const { g, p, t, hits } = arena('lol_ahri'); cast(g, 'w'); advance(g, 0.5);
  assert.equal(hits.length, 3); assert.ok(hits[1].amount < hits[0].amount);
  t.stunnedUntil = 0; t.aiThinkIn = 1000; t.aiMove = null;
  cast(g, 'e', t); advance(g, 0.15); assert.ok(t.charmedUntil > g.time);
  const before = near(p, t); advance(g, 0.25); assert.ok(near(p, t) < before);
  const mana = p.mana, cost = g.getSkillInfo('r').cost;
  cast(g, 'r', { x: 800, y: 650 }); assert.equal(p.mana, mana - cost);
  assert.equal(g.getSkillInfo('r').charges, 2); assert.equal(g.getSkillInfo('r').ready, false);
  advance(g, 0.71); assert.equal(g.getSkillInfo('r').ready, true); cast(g, 'r', { x: 800, y: 550 });
  advance(g, 0.71); cast(g, 'r', { x: 800, y: 450 });
  assert.equal(p.mana, mana - cost); assert.equal(p.restored.recasts.r, null); assert.equal(g.getSkillInfo('r').ready, false);
});

test('Ashe earns four focus stacks through hits, consumes them for Q and Volley hits each target once', () => {
  const { g, p, t, hits } = arena('lol_ashe');
  assert.equal(g.cast('q').ok, false);
  for (let i = 0; i < 4; i++) { g._releaseAttack(p, t); advance(g, 0.2); }
  assert.equal(p.restored.stacks, 4); assert.ok(t.slowUntil > g.time); assert.equal(g.getSkillInfo('q').ready, true);
  const speed = g._attackSpeed(p); cast(g, 'q'); assert.equal(p.restored.stacks, 0); assert.ok(g._attackSpeed(p) > speed);
  hits.length = 0; cast(g, 'w', t); assert.equal(g.projectiles.filter(p => p.restoredKind === 'ashe_w').length, 9); advance(g, 0.5);
  assert.equal(hits.filter(h => h.target === t.id).length, 1);
});

test('Ashe Hawkshot creates temporary remote sight with two charges and R stuns at long range', () => {
  const { g, p, t } = arena('lol_ashe'); t.x = 1400; g._rebuildIndex();
  assert.equal(g.visibilityAt(1400, 800, 0), false);
  cast(g, 'e', t); assert.equal(p.restored.eCharges, 1); advance(g, 1.05);
  assert.equal(g.visibilityAt(1400, 800, 0), true);
  t.stunnedUntil = 0; t.aiThinkIn = 1000; t.aiMove = null; cast(g, 'r', t); advance(g, 0.8);
  assert.ok(t.stunnedUntil > g.time + 1); assert.ok(t.hp < t.maxHp);
  advance(g, 6); assert.equal(g.visibilityAt(1400, 800, 0), false);
});

test('Garen Q empowers one attack and silences, W reduces physical damage, E ticks and cancels, R executes as true damage', () => {
  const { g, p, t, hits } = arena('lol_garen'); t.x = p.x + 50; g._rebuildIndex();
  cast(g, 'q'); assert.ok(p.hasteUntil > g.time); g._releaseAttack(p, t);
  assert.ok(t.silencedUntil > g.time); assert.equal(p.restored.empoweredUntil, 0); assert.ok(hits[0].amount > p.damage);
  const raw = g._damageValue(p, 100, t, 'physical'); cast(g, 'w');
  assert.ok(p.shield > 0); assert.ok(Math.abs(g._damageValue(p, 100, t, 'physical') - raw * 0.7) < 1e-9);
  hits.length = 0; cast(g, 'e'); advance(g, 1); assert.ok(hits.length >= 2); const count = hits.length;
  cast(g, 'e'); advance(g, 0.5); assert.equal(hits.length, count);
  t.hp = 100; cast(g, 'r', t); assert.equal(t.alive, false); assert.equal(hits.at(-1).kind, 'true'); assert.equal(p.mana, 0);
});

test('Lux Q stops after two roots and W shields allies on both outward and return paths', () => {
  const { g, p, enemies, ally, hits } = arena('lol_lux', 3);
  cast(g, 'q'); advance(g, 1);
  assert.deepEqual(hits.map(h => h.target), enemies.slice(0, 2).map(t => t.id));
  assert.ok(enemies[0].rootedUntil > g.time && enemies[1].rootedUntil > g.time); assert.equal(enemies[2].rootedUntil, 0);
  ally.x = 950; ally.y = 800; g._rebuildIndex(); cast(g, 'w'); const selfShield = p.shield;
  advance(g, 0.35); const outward = ally.shield; assert.ok(outward > 0);
  advance(g, 1.5); assert.equal(ally.shield, outward * 2); assert.equal(p.shield, selfShield * 2);
});

test('Lux E slows without damage until detonation, preserves cooldown during recast, and R fires after its delay', () => {
  const { g, p, t, hits } = arena('lol_lux'); const cost = g.getSkillInfo('e').cost, mana = p.mana;
  cast(g, 'e', t); advance(g, 0.3); assert.ok(t.slowUntil > g.time); assert.equal(hits.length, 0);
  const cd = p.cd.e; assert.equal(g.getSkillInfo('e').ready, true); cast(g, 'e'); assert.equal(p.mana, mana - cost); assert.equal(p.cd.e, cd);
  assert.equal(hits.length, 1); assert.ok(t.illuminatedUntil > g.time);
  cast(g, 'r', t); const count = hits.length; advance(g, 0.4); assert.equal(hits.length, count);
  advance(g, 0.3); assert.equal(hits.length, count + 2, 'Laser consumes previous illumination and deals its own hit');
});

test('Lee Sin Q marks then dashes with recast cost, and flurry basic attacks restore energy', () => {
  const { g, p, t } = arena('lol_leesin'); t.x = 1100; g._rebuildIndex();
  cast(g, 'q', t); assert.equal(p.mana, 150); advance(g, 0.4); assert.ok(t.leeMarkUntil > g.time);
  advance(g, 0.21); const energy = p.mana; assert.equal(g.getSkillInfo('q').cost, 30); cast(g, 'q');
  assert.equal(p.mana, energy - 30); assert.ok(near(p, t) < 50); assert.equal(p.restored.recasts.q, null);
  const beforeAttack = p.mana; g._releaseAttack(p, t); assert.equal(p.mana, Math.min(p.maxMana, beforeAttack + 20));
});

test('Lee Sin W accepts allies and wards, E recast slows marked enemies, and R knocks targets away', () => {
  const { g, p, t, ally } = arena('lol_leesin'); ally.x = 900; ally.y = 800; g._rebuildIndex();
  cast(g, 'w', ally); assert.ok(near(p, ally) < 50); assert.ok(p.shield > 0 && ally.shield > 0);
  advance(g, 0.21); cast(g, 'w'); assert.ok(p.restored.lifestealUntil > g.time);
  p.mana = 200; t.x = p.x + 90; g._rebuildIndex(); cast(g, 'e'); advance(g, 0.21); cast(g, 'e'); assert.ok(t.slowUntil > g.time);
  t.x = p.x + 50; t.y = p.y; g._rebuildIndex(); const oldDistance = near(p, t); cast(g, 'r', t); assert.ok(near(p, t) > oldDistance + 50);
  const another = arena('lol_leesin'); cast(another.g, 'ward', { x: 950, y: 800 }); another.g._rebuildIndex();
  const ward = another.g.entities.find(e => e.type === 'ward'); cast(another.g, 'w', ward); assert.ok(near(another.p, ward) < 50);
});

test('Jhin uses four shots, guarantees the fourth critical, and blocks attacks until reload completes', () => {
  const { g, p, t, hits } = arena('lol_jhin'); t.hp = t.maxHp * 0.9;
  for (let i = 0; i < 4; i++) { g._releaseAttack(p, t); advance(g, 0.2); }
  assert.equal(p.restored.ammo, 0); assert.equal(g.getAttackState().phase, 'reloading'); assert.equal(g._attack(p, t), false);
  assert.ok(hits[3].amount > hits[0].amount * 2); advance(g, 2.4); assert.equal(p.restored.ammo, 4); assert.equal(p.restored.reloadUntil, 0);
});

test('Jhin Q bounces to four distinct targets and W only roots an already marked hero', () => {
  const { g, p, enemies, hits } = arena('lol_jhin', 4);
  cast(g, 'q', enemies[0]); advance(g, 0.6); assert.equal(new Set(hits.map(h => h.target)).size, 4);
  cast(g, 'w', enemies[0]); advance(g, 0.2); assert.ok(enemies[0].rootedUntil > g.time, 'Q damage provides the recent allied-damage mark');
  const another = arena('lol_jhin'); cast(another.g, 'w', another.t); advance(another.g, 0.2); assert.equal(another.t.rootedUntil, 0);
  assert.equal(p.restored.castCount, 2);
});

test('Jhin traps arm then slow and explode, and recharge remains independent from short placement cooldown', () => {
  const { g, p, t, hits } = arena('lol_jhin'); cast(g, 'e', t);
  assert.equal(p.restored.eCharges, 1); advance(g, 0.9); assert.equal(hits.length, 0);
  advance(g, 0.2); assert.ok(t.slowUntil > g.time); assert.equal(hits.length, 0);
  advance(g, 2); assert.equal(hits.length, 1); assert.equal(hits[0].kind, 'magic'); assert.equal(g._restoredEffects.filter(e => e.kind === 'jhin_trap').length, 0);
  assert.equal(g.getSkillInfo('e').ready, true); cast(g, 'e', { x: 900, y: 900 }); assert.equal(p.restored.eCharges, 0);
  advance(g, 2.1); assert.equal(g.getSkillInfo('e').phase, 'recharging'); assert.equal(g.getSkillInfo('e').ready, false);
});

test('Jhin R provides four free recast shots inside its cone and movement or crowd control cancels the channel', () => {
  const { g, p, t, hits } = arena('lol_jhin'); t.x = 1200; g._rebuildIndex(); const mana = p.mana, cost = g.getSkillInfo('r').cost;
  cast(g, 'r', t); assert.equal(p.restored.channelShots, 4); assert.equal(g._attack(p, t), false); advance(g, 0.41);
  assert.equal(g.cast('r', 100, 800).ok, false); assert.equal(p.restored.channelShots, 4);
  for (let i = 0; i < 4; i++) { assert.equal(g.getSkillInfo('r').ready, true); cast(g, 'r', t); advance(g, 1.01); }
  assert.equal(p.restored.channelUntil, 0); assert.equal(p.mana, mana - cost); assert.equal(hits.length, 4); assert.ok(hits[3].amount > hits[0].amount * 1.9);
  for (const cancel of ['move', 'stun', 'silence']) {
    const a = arena('lol_jhin'); cast(a.g, 'r', a.t);
    if (cancel === 'move') a.g.commandMove(750, 800); else a.p[cancel === 'stun' ? 'stunnedUntil' : 'silencedUntil'] = 10;
    advance(a.g, 0.1); assert.equal(a.p.restored.channelUntil, 0); assert.equal(a.p.restored.recasts.r, null);
  }
});

test('official recipes consume components once, unique equipment is atomic, and sale prices retain official rounding', () => {
  const g = new Game({ hero: 'lol_ashe' }); g.player.gold = 20000;
  for (const id of ['lol_1001', 'lol_1042']) assert.equal(g.prepareItem(id).ok, true);
  const info = g.getPurchaseInfo('lol_3006'); const gold = g.player.gold;
  assert.equal(g.prepareItem('lol_3006').ok, true); assert.equal(g.player.gold, gold - info.cost); assert.deepEqual(g.player.inventory, ['lol_3006']);
  const before = JSON.stringify([g.player.inventory, g.player.gold]); assert.equal(g.prepareItem('lol_1001').ok, false); assert.equal(JSON.stringify([g.player.inventory, g.player.gold]), before);
  assert.equal(g.prepareItem('lol_1037').ok, true); Object.assign(g.player, g.map.bases[0]); const sale = g.sell(g.player.inventory.indexOf('lol_1037')); assert.equal(sale.refund, 613);
  assert.equal(g.prepareItem('lol_3031').ok, true); assert.equal(g.prepareItem('lol_3031').ok, false);
});

test('item stat integration applies magic resistance, haste, lifesteal, crit damage, movement percent and AP multiplier', () => {
  const g = new Game({ hero: 'lol_lux' }); g.player.gold = 20000;
  for (const id of ['lol_3108', 'lol_3089', 'lol_1057', 'lol_3086', 'lol_1053', 'lol_3031']) assert.equal(g.prepareItem(id).ok, true, id);
  const p = g.player; assert.equal(p.abilityHaste, 10); assert.equal(p.abilityPower, (25 + 130) * 1.3);
  assert.equal(p.magicResist, 75); assert.equal(p.critDamageBonus, 0.3); assert.equal(p.lifeSteal, 0.07); assert.equal(p.critChance, 0.4);
  assert.ok(Math.abs(g.getSkillInfo('q').cooldown - 10 / 1.1) < 1e-10);
  const base = data.playableHeroes.find(h => h.id === 'lol_lux'); assert.equal(p.speed, base.speed * 1.04);
  assert.ok(Math.abs(g._damageValue(p, 100, null, 'magic') - 100 / 1.75) < 1e-10); assert.equal(g._damageValue(p, 100, null, 'true'), 100);
  const melee = arena('lol_garen'); melee.p.lifeSteal = 0.5; melee.p.hp = 100; melee.t.x = 850; melee.g._rebuildIndex(); melee.g._releaseAttack(melee.p, melee.t); assert.ok(melee.p.hp > 100);
});

test('every restored skill can be saved in flight and resumes deterministically with its timers and projectile hit sets', () => {
  for (const template of data.playableHeroes) for (const slot of ['q', 'w', 'e', 'r']) {
    const g = new Game({ hero: template.id, seed: 543 }); g.start(); g.gainXp(g.player, 1e6); g.autoAllocateSkills();
    const p = g.player, t = g.entities.find(e => e.type === 'hero' && e.team === 1);
    Object.assign(p, { x: 800, y: 800, autoAttack: false, mana: p.maxMana });
    for (const h of g.entities.filter(e => e.type === 'hero' && !e.isPlayer)) h.stunnedUntil = 10000;
    Object.assign(t, { x: 900, y: 700 });
    if (template.id === 'lol_ashe' && slot === 'q') { p.restored.stacks = 4; p.restored.stackUntil = 10; }
    g._rebuildIndex(); cast(g, slot, template.id === 'lol_leesin' && slot === 'w' ? p : t);
    g.step(0.05);
    const saved = g.exportState(), restored = Game.fromState(saved, { paused: false, clearInput: false });
    assert.deepEqual(restored._restoredEffects, g._restoredEffects, `${template.id} ${slot} effects`);
    assert.deepEqual(restored.player.restored, p.restored, `${template.id} ${slot} state`);
    g.step(0.6); restored.step(0.6);
    assert.deepEqual(restored.exportState(), g.exportState(), `${template.id} ${slot} continuation`);
  }
});

test('restored AI runs distinct kits and purchases profile equipment during an unmodified match', () => {
  for (const id of ['lol_ahri', 'lol_ashe', 'lol_garen', 'lol_lux', 'lol_leesin', 'lol_jhin']) {
    const g = new Game({ hero: id, seed: 31 }); g.start();
    for (let i = 0; i < 12; i++) g.step(10);
    const heroes = g.entities.filter(e => e.type === 'hero');
    assert.ok(heroes.some(h => !h.isPlayer && h.restored.castCount > 0));
    assert.ok(heroes.every(h => Number.isFinite(h.hp) && Number.isFinite(h.mana)));
    const save = g.exportState(); const loaded = Game.fromState(save); assert.equal(loaded.player.hero, id);
    assert.ok(loaded.entities.filter(e => e.type === 'hero').every(h => h.inventory.every(id => id.startsWith('lol_'))));
  }
});
