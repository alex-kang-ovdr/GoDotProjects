() => {
 const q = window.DarkDescentQA, data = q.data, results = [];
 const assert = (ok, message = 'assertion failed') => {if (!ok) throw Error(message);};
 const near = (actual, expected, message = '') => assert(Math.abs(actual - expected) <= 1e-7 * Math.max(1, Math.abs(expected)), `${message} expected ${expected}, got ${actual}`);
 const test = (name, run) => {try {const evidence = run(); results.push({name, pass: true, evidence});} catch (error) {results.push({name, pass: false, error: error.message});}};
 function fresh(hero = 'paladin', level = 60) {
  q.newGame(hero, 280128);
  q.S.p.xp = data.experience[level - 1].total_experience;
  q.levelCheck();
  q.enterArea('a1_blood_moor');
  q.S.enemies = []; q.S.squads = {}; q.S.shots = []; q.S.fields = []; q.S.minions = [];
  q.S.p.hp = q.S.p.maxHp; q.S.p.mp = q.S.p.maxMp; q.S.p.cd = 0;
  return q.S.p;
 }
 function enemy(type = 'grunt', hp = 1000) {
  const p = q.S.p, e = q.scaleEnemy(q.makeEnemy(p.x + 45, p.y, type), p.level);
  Object.assign(e, {hp, maxHp: hp, defense: 0, resists: {}, modifier: null, activated: false, xp: 1, undead: false, drainEffectiveness: 100});
  q.S.enemies.push(e); return e;
 }
 function mods(values) {Object.assign(q.S.p.eq.weapon.mods, values); q.recalcResources();}
 function equip(baseId) {
  const it = q.generateItem({baseId, quality: 'normal', noSockets: true, noEthereal: true, noStaffmods: true});
  q.S.p.eq.weapon = it; q.S.p.eq.offhand = null; q.recalcResources(); return it;
 }
 function teach(id, rank = 1) {
  const skill = data.skills.find(s => s.id === id);
  for (const pre of skill.requires) if (!q.S.p.skills[pre]) teach(pre);
  while ((q.S.p.skills[id] || 0) < rank) assert(q.learnSkill(id), q.skillReason(id));
 }

 test('Life and mana steal share post-resistance physical damage', () => {
  const p = fresh(); mods({leech: 10, manaLeech: 10}); p.hp = 10; p.mp = 0;
  const e = enemy(); e.resists = {physical: 50, fire: 75};
  near(q.applyPacket(e, {physical: 100, fire: 100, weaponHit: true, noCrit: true}), 75);
  near(p.hp, 15); near(p.mp, 5);
 });
 test('Physical immunity permits elemental damage but no physical leech', () => {
  const p = fresh(); mods({leech: 10, manaLeech: 10}); p.hp = 10; p.mp = 0;
  const e = enemy(); e.resists = {physical: 100};
  near(q.applyPacket(e, {physical: 100, fire: 100, weaponHit: true, noCrit: true}), 100);
  near(p.hp, 10); near(p.mp, 0);
 });
 test('Overkill leech is bounded by actual physical health removed', () => {
  const p = fresh(); mods({leech: 10, manaLeech: 10}); p.hp = 10; p.mp = 0;
  const e = enemy('grunt', 30);
  near(q.applyPacket(e, {physical: 100, fire: 100, weaponHit: true, noCrit: true}), 30);
  near(p.hp, 11.5); near(p.mp, 1.5); near(e.hp, 0);
 });
 test('Drain effectiveness is explicit and does not suppress every undead', () => {
  const p = fresh(); mods({leech: 10, manaLeech: 10}); p.hp = 10; p.mp = 0;
  const e = enemy(); e.undead = true; e.drainEffectiveness = 0;
  q.applyPacket(e, {physical: 100, weaponHit: true, noCrit: true}); near(p.hp, 10); near(p.mp, 0);
  e.drainEffectiveness = 100;
  q.applyPacket(e, {physical: 100, weaponHit: true, noCrit: true}); near(p.hp, 20); near(p.mp, 10);
 });
 test('Critical doubles only physical damage and its actual leech share', () => {
  const p = fresh(); mods({leech: 10, manaLeech: 10, deadlyStrike: 100}); p.hp = 10; p.mp = 0;
  const e = enemy(); near(q.applyPacket(e, {physical: 10, fire: 10, weaponHit: true}), 30);
  near(p.hp, 12); near(p.mp, 2);
 });

 for (const [type, ranged, expected] of [['grunt', false, 650], ['elite', false, 775], ['boss', false, 775], ['grunt', true, 775], ['boss', true, 837.5]]) {
  test(`Crushing Blow before normal damage: ${type}, ${ranged ? 'missile' : 'melee'}`, () => {
   fresh(); mods({crushingBlow: 100}); const e = enemy(type);
   near(q.applyPacket(e, {physical: 100, weaponHit: true, noCrit: true, ranged}), 100);
   near(e.hp, expected);
  });
 }
 test('Crushing Blow uses current life, not max life', () => {
  fresh(); mods({crushingBlow: 100}); const e = enemy(); e.hp = 400;
  q.applyPacket(e, {physical: 10, weaponHit: true, noCrit: true}); near(e.hp, 290);
 });
 test('Crushing Blow respects positive resistance without negative-resistance amplification', () => {
  fresh(); mods({crushingBlow: 100}); const a = enemy(); a.resists.physical = 50;
  q.applyPacket(a, {physical: 100, weaponHit: true, noCrit: true}); near(a.hp, 825);
  const b = enemy(); b.resists.physical = -100;
  q.applyPacket(b, {physical: 100, weaponHit: true, noCrit: true}); near(b.hp, 550);
  const c = enemy(); c.resists.physical = 100;
  q.applyPacket(c, {physical: 100, weaponHit: true, noCrit: true}); near(c.hp, 1000);
 });
 test('A summed chance above 100% produces one Crushing Blow, not one per source', () => {
  fresh(); mods({crushingBlow: 300}); const e = enemy();
  q.applyPacket(e, {physical: 0, weaponHit: true, noCrit: true}); near(e.hp, 750);
 });
 test('Crushing Blow cannot multiply critical damage or ordinary leech', () => {
  const p = fresh(); mods({crushingBlow: 100, deadlyStrike: 100, leech: 100, manaLeech: 100}); p.hp = 10; p.mp = 0;
  const e = enemy(); near(q.applyPacket(e, {physical: 10, weaponHit: true}), 20);
  near(e.hp, 730); near(p.hp, 30); near(p.mp, 20);
 });
 test('A missed weapon attack rolls hit once and applies no equipment or statuses', () => {
  fresh(); mods({crushingBlow: 100, openWounds: 100, fireMin: 5, fireMax: 10, poisonTotal: 50, poisonDuration: 5});
  const e = enemy(); e.defense = 1e9;
  const before = 0x12345678; let next = before; next ^= next << 13; next ^= next >>> 17; next ^= next << 5; next >>>= 0;
  assert(next / 4294967296 > .05); q.S.rngState = before;
  near(q.applyPacket(e, {physical: 10, weaponHit: true, needsAR: true, attackRating: 0}), 0);
  near(e.hp, 1000); assert(!e.openWounds && !e.poison); assert(q.S.rngState === next, 'extra effect RNG consumed after miss');
 });
 test('Spells and minion packets cannot inherit player weapon effects', () => {
  const p = fresh(); mods({crushingBlow: 100, openWounds: 100, fireMin: 100, fireMax: 100, poisonTotal: 50, leech: 100, manaLeech: 100, deadlyStrike: 100}); p.hp = 10; p.mp = 0;
  const e = enemy();
  near(q.applyPacket(e, {fire: 10, noCrit: true, noLeech: true}), 10);
  near(q.applyPacket(e, {physical: 10, noCrit: true, noLeech: true}), 10);
  near(e.hp, 980); near(p.hp, 10); near(p.mp, 0); assert(!e.openWounds && !e.poison);
 });
 test('Smite permits CB and OW while excluding added elements, critical and leech', () => {
  const p = fresh(); mods({crushingBlow: 100, openWounds: 100, fireMin: 100, fireMax: 100, coldMin: 100, coldMax: 100, coldDuration: 3, poisonTotal: 50, leech: 100, manaLeech: 100, deadlyStrike: 100}); p.hp = 10; p.mp = 0;
  const e = enemy();
  near(q.applyPacket(e, {physical: 10, skillId: 'paladin_smite', weaponHit: true}), 10);
  near(e.hp, 740); near(p.hp, 10); near(p.mp, 0); assert(e.openWounds); assert(!e.poison && !e.chill);
 });

 test('Real bow skill casts emit weapon packets with AR, critical and leech enabled', () => {
  const p = fresh('amazon'); equip('short_bow'); mods({fireMin: 5, fireMax: 5, leech: 10, manaLeech: 10});
  for (const id of ['amazon_magic_arrow', 'amazon_fire_arrow', 'amazon_cold_arrow', 'amazon_multiple_shot']) {
   teach(id); p.cd = 0; p.mp = p.maxMp; q.S.shots = [];
   assert(q.castSkill(id, {x: p.x + 100, y: p.y}), id);
   const packet = q.S.shots[0]?.packet;
   assert(packet?.weaponHit && packet.ranged && packet.needsAR && !packet.noCrit && !packet.noLeech, id + ' flags');
   const e = enemy(), before = e.hp; p.hp = 10; p.mp = 0;
   q.applyPacket(e, {...packet, needsAR: false, noCrit: true});
   assert(e.hp < before - packet.physical, id + ' elemental item damage missing');
   near(p.hp, 10 + packet.physical * .1); near(p.mp, packet.physical * .1);
  }
 });
 test('Basic bow and javelin shots are tagged ranged for CB reduction', () => {
  const p = fresh('amazon');
  for (const id of ['short_bow', 'javelin']) {
   equip(id); p.cd = 0; q.S.shots = [];
   assert(q.cast(1, {x: p.x + 100, y: p.y}));
   assert(q.S.shots[0]?.packet.weaponHit && q.S.shots[0].packet.ranged, id);
  }
 });
 test('Poison Javelin direct projectile carries a physical weapon hit', () => {
  const p = fresh('amazon'); teach('amazon_poison_javelin');
  assert(q.castSkill('amazon_poison_javelin', {x: p.x + 100, y: p.y}));
  const packet = q.S.shots[0].packet;
  assert(packet.physical > 0 && packet.poison > 0 && packet.weaponHit && packet.ranged && packet.needsAR);
 });
 test('Secondary Charged Strike bolts cannot duplicate socket damage or procs', () => {
  const p = fresh('amazon'); mods({fireMin: 100, fireMax: 100, poisonTotal: 50, crushingBlow: 100, openWounds: 100, leech: 100, manaLeech: 100}); teach('amazon_charged_strike');
  assert(q.castSkill('amazon_charged_strike', {x: p.x + 100, y: p.y}));
  assert(q.S.shots.length >= 3);
  for (const s of q.S.shots) assert(!s.packet.weaponHit && s.packet.noWeaponEffects && s.packet.noLeech && s.packet.noCrit);
  const e = enemy(), packet = q.S.shots[0].packet; p.hp = 10; p.mp = 0;
  near(q.applyPacket(e, packet), packet.lightning); near(e.hp, 1000 - packet.lightning);
  near(p.hp, 10); near(p.mp, 0); assert(!e.openWounds && !e.poison);
 });
 test('Power Strike hard synergy increases lightning without inflating physical damage', () => {
  fresh('amazon'); teach('amazon_power_strike');
  const seed = q.S.rngState, original = q.skillPacket('amazon_power_strike', true);
  teach('amazon_charged_strike', 5); q.S.rngState = seed;
  const boosted = q.skillPacket('amazon_power_strike', true);
  // Charged Strike's learned path also invests one Lightning Bolt point:
  // (5 + 1) hard points supply 60%, not just the requested five ranks.
  near(boosted.physical, original.physical); near(boosted.lightning, original.lightning * 1.6);
  q.S.p.eq.weapon.staffmods.amazon_charged_strike = 3; q.S.rngState = seed;
  const soft = q.skillPacket('amazon_power_strike', true); near(soft.lightning, boosted.lightning);
 });
 test('Multiple Shot applies 75% physical weapon damage', () => {
  fresh('amazon'); equip('short_bow'); teach('amazon_multiple_shot');
  const p = q.S.p, st = q.stats(); p.eq.weapon.damage = [100, 100];
  const fixed = q.stats(), packet = q.skillPacket('amazon_multiple_shot');
  near(packet.physical, 100 * (1 + fixed.offED / 100) * .75); near(packet.weaponElementScale, .75);
 });
 test('Multiple Shot cannot shotgun one target, while a new volley can hit again', () => {
  const p = fresh('amazon'); equip('short_bow'); teach('amazon_multiple_shot');
  assert(q.castSkill('amazon_multiple_shot', {x: p.x + 100, y: p.y}));
  assert(q.S.shots.length >= 2);
  const e = enemy(), a = {...q.S.shots[0].packet, needsAR: false, noCrit: true}, b = {...q.S.shots[1].packet, needsAR: false, noCrit: true};
  assert(q.applyPacket(e, a) > 0); const hp = e.hp; near(q.applyPacket(e, b), 0); near(e.hp, hp);
  p.cd = 0; q.S.shots = []; assert(q.castSkill('amazon_multiple_shot', {x: p.x + 100, y: p.y}));
  assert(q.applyPacket(e, {...q.S.shots[0].packet, needsAR: false, noCrit: true}) > 0);
 });

 test('Open Wounds published level boundaries and elite/boss scaling', () => {
  const samples = [[1, 3.90625], [15, 16.2109375], [16, 17.96875], [30, 42.578125], [31, 45.21484375], [45, 82.12890625], [46, 85.64453125], [60, 134.86328125], [61, 139.2578125], [99, 306.25]];
  for (const [level, expected] of samples) {near(q.openWoundsDps(level), expected); near(q.openWoundsDps(level, 'boss'), expected / 2); near(q.openWoundsDps(level, 'elite'), expected / 2);}
  return {boundaries: samples.length};
 });
 test('Open Wounds lasts 8 seconds and does not leech or check physical resistance again', () => {
  const p = fresh(); mods({openWounds: 100, leech: 100, manaLeech: 100}); p.hp = 10; p.mp = 0;
  const e = enemy('grunt', 100000); e.resists.physical = 100;
  q.applyPacket(e, {physical: 10, weaponHit: true, noCrit: true}); assert(e.openWounds);
  const hp = e.hp, dps = e.openWounds.dps, rng = q.S.rngState;
  for (let i = 0; i < 480; i++) q.updateCombatStatuses(1 / 60);
  near(hp - e.hp, dps * 8); assert(!e.openWounds); near(p.hp, 10); near(p.mp, 0); assert(q.S.rngState === rng);
 });
 test('Bleed refresh keeps pending damage and cannot stack DPS', () => {
  fresh(); mods({openWounds: 100}); const e = enemy('grunt', 100000);
  q.applyPacket(e, {weaponHit: true, physical: 0, noCrit: true}); const dps = e.openWounds.dps;
  q.updateCombatStatuses(.1); const pending = e.openWounds.pending;
  q.applyPacket(e, {weaponHit: true, physical: 0, noCrit: true});
  near(e.openWounds.dps, dps); near(e.openWounds.pending, pending); near(e.openWounds.timer, .1); near(e.openWounds.left, 8);
  const hp = e.hp; q.updateCombatStatuses(.15); near(hp - e.hp, dps * .25);
 });
 test('Poison immune targets never acquire a zero DPS status or minimum tick damage', () => {
  fresh(); const e = enemy(); e.resists.poison = 100;
  near(q.applyPacket(e, {poison: 50, poisonDuration: 2, noCrit: true, noLeech: true}), 0);
  assert(!e.poison); near(q.hurtEnemy(e, 0), 0); near(q.hurtEnemy(e, -1), 0); near(q.hurtEnemy(e, NaN), 0); near(e.hp, 1000);
 });
 test('Poison refresh cannot discard damage accrued between ticks', () => {
  fresh(); const e = enemy(); q.applyPacket(e, {poison: 20, poisonDuration: 2});
  e.poison.pending = 2; e.poison.timer = .2;
  q.applyPacket(e, {poison: 20, poisonDuration: 2}); near(e.poison.pending, 2); near(e.poison.timer, .2); near(e.poison.dps, 10);
 });
 test('Cold immunity blocks chill while resisted positive cold damage still chills', () => {
  fresh(); mods({coldMin: 10, coldMax: 10, coldDuration: 3});
  const immune = enemy(); immune.resists.cold = 100;
  near(q.applyPacket(immune, {physical: 10, weaponHit: true, noCrit: true}), 10); assert(!immune.chill);
  const resistant = enemy(); resistant.resists.cold = 50;
  near(q.applyPacket(resistant, {physical: 10, weaponHit: true, noCrit: true}), 15); near(resistant.chill, 3);
 });
 return {version: 28, suite: 'combat_rules', passed: results.filter(r => r.pass).length, failed: results.filter(r => !r.pass).length, results};
}
