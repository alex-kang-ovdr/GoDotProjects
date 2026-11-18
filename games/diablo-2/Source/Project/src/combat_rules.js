// XXVIII — one player-hit pipeline, backed by selected published combat rules.
// Sources: Arreat Summit items/magic.shtml, skills/amazon-bow.shtml and
// skills/paladin-combat.shtml. Animation, hit timing, the elite/boss mapping,
// per-volley collision and status refresh policy remain explicit web adapters.
// Do not add Crushing Blow to normal hit damage: it cannot feed ordinary leech
// or the existing Sacrifice recoil calculation.

function positiveDamage(value) {
 return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function crushingBlowDamage(currentLife, type = 'grunt', ranged = false, physicalResistance = 0) {
 const fraction = ['elite', 'boss'].includes(type) ? 1 / 8 : 1 / 4;
 const resistance = clamp(Number.isFinite(physicalResistance) ? physicalResistance : 0, 0, 100);
 return positiveDamage(currentLife) * fraction * (ranged ? .5 : 1) * (1 - resistance / 100);
}

function openWoundsDps(level, type = 'grunt') {
 const n = clamp(Math.floor(Number.isFinite(level) ? level : 1), 1, 99);
 const numerator = n <= 15 ? 9 * n + 31 : n <= 30 ? 18 * n - 104 : n <= 45 ? 27 * n - 374 : n <= 60 ? 36 * n - 779 : 45 * n - 1319;
 return numerator * 25 / 256 * (['elite', 'boss'].includes(type) ? .5 : 1);
}

// A zero DPS status must never get promoted to the old .01 minimum damage.
// This sink receives damage whose mitigation has already been resolved.
hurtEnemy = function(e, raw, critChance = 0) {
 if (!e || e.hp <= 0 || e.sealed || !S.enemies.includes(e) || !Number.isFinite(raw) || raw <= 0) return 0;
 const crit = critChance > 0 && random() < clamp(critChance, 0, 1);
 const damage = raw * (crit ? 2 : 1), actual = Math.min(e.hp, damage);
 e.hp = Math.max(0, e.hp - damage);
 e.flash = .12; e.activated = true; e.aggro = 8;
 float(e.x, e.y - 8, (crit ? '✦ ' : '') + Math.ceil(damage), crit ? '#ffe095' : '#ffffff');
 eventVfx('impact', e.x, e.y, 12, '#b5f0ee', .16);
 if (e.hp <= 0) kill(e);
 return actual;
};

function applyOpenWounds(e, level) {
 const dps = openWoundsDps(level, e.type), old = e.openWounds;
 if (!old) {
  e.openWounds = {dps, left: 8, pending: 0, timer: 0, sourceLevel: level};
 } else {
  // One bleed record; a new proc refreshes duration without multiplying DPS.
  // Keep damage already accrued between ticks so repeated hits cannot erase it.
  if (dps >= old.dps) {old.dps = dps; old.sourceLevel = level;}
  old.left = 8;
 }
}

applyPacket = function(e, packet = {}) {
 if (!e || e.hp <= 0 || e.sealed || !S.enemies.includes(e)) return 0;
 if (packet.undeadOnly && !e.undead) {float(e.x, e.y, '언데드 전용', '#c0ccd4'); return 0;}
 if (packet.volleyHits?.includes(e.id)) return 0;

 const st = stats(), mods = st.mods, q = {...packet};
 const smite = q.skillId === 'paladin_smite';
 const weaponHit = !!q.weaponHit && !q.noWeaponEffects;
 const weaponElements = weaponHit && !smite;
 let defense = Math.max(0, (e.defense || 0) - (e.innerSight?.left > 0 ? e.innerSight.value || 0 : 0));
 if (weaponHit) defense = Math.max(0, defense * (1 + (mods.targetDefense || 0) / 100));
 let attackRating = Number.isFinite(q.attackRating) ? q.attackRating : st.ar;
 if (weaponElements && e.undead) attackRating += mods.arUndead || 0;
 if (q.needsAR && !smite && random() > attackChance(attackRating, defense, S.p.level, e.level || 1)) {
  float(e.x, e.y, '빗나감', '#94a7b4');
  return 0;
 }
 if (q.volleyHits) q.volleyHits.push(e.id);

 // Item elemental additions belong to successful weapon hits, never spells,
 // summons, damage-over-time ticks, secondary Charged Strike bolts or Smite.
 if (weaponElements) {
  const scale = Number.isFinite(q.weaponElementScale) ? Math.max(0, q.weaponElementScale) : 1;
  for (const element of ['fire', 'cold', 'lightning']) {
   if (mods[element + 'Max'] > 0) q[element] = positiveDamage(q[element]) + rand(mods[element + 'Min'] || 0, mods[element + 'Max']) * scale;
  }
  if (mods.poisonTotal > 0) {
   q.poison = positiveDamage(q.poison) + mods.poisonTotal * scale;
   q.poisonDuration = Math.max(q.poisonDuration || 0, mods.poisonDuration || 5);
  }
  if (mods.coldDuration) q.coldDuration = Math.max(q.coldDuration || 0, mods.coldDuration);
  if (e.undead) q.physical = positiveDamage(q.physical) * (1 + (mods.damageUndead || 0) / 100);
 }
 if (smite) {q.noLeech = true; q.noCrit = true;}

 const physicalResistance = (e.resists?.physical || 0) - (e.amplify?.left > 0 ? 100 : 0);
 const crushingChance = weaponHit ? clamp(mods.crushingBlow || 0, 0, 100) : 0;
 if (crushingChance > 0 && random() < crushingChance / 100) {
  const crushing = crushingBlowDamage(e.hp, e.type, !!q.ranged, physicalResistance);
  if (crushing > 0) {hurtEnemy(e, crushing); float(e.x, e.y - 23, '강타', '#f4cf85');}
 }

 const resolved = {};
 for (const element of ['physical', 'fire', 'cold', 'lightning', 'magic']) {
  let value = positiveDamage(q[element]);
  const resistance = element === 'physical' ? physicalResistance : e.resists?.[element] || 0;
  if (element === 'physical' && value > 0 && weaponHit && !q.noCrit && random() < clamp(st.crit, 0, 1)) value *= 2;
  resolved[element] = value * (1 - clamp(resistance, -100, 100) / 100);
 }
 const total = Object.values(resolved).reduce((sum, value) => sum + value, 0);
 const actual = total > 0 ? hurtEnemy(e, total) : 0;

 // Both resource steals use the SAME post-resistance, post-critical physical
 // share of actual normal damage. CB, elements, poison and bleed never leech.
 if (actual > 0 && weaponHit && !q.noLeech && resolved.physical > 0) {
  const drain = clamp(Number.isFinite(e.drainEffectiveness) ? e.drainEffectiveness : 100, 0, 100) / 100;
  const physicalDealt = actual * resolved.physical / total * drain;
  S.p.hp = Math.min(S.p.maxHp, S.p.hp + physicalDealt * Math.max(0, st.leech));
  S.p.mp = Math.min(S.p.maxMp, S.p.mp + physicalDealt * Math.max(0, mods.manaLeech || 0) / 100);
 }

 if (e.hp > 0 && q.poison > 0) {
  const duration = Math.max(.01, q.poisonDuration || 2);
  const dps = q.poison / duration * (1 - clamp(e.resists?.poison || 0, -100, 100) / 100);
  if (dps > 0 && (!e.poison || dps >= e.poison.dps)) {
   e.poison = {dps, left: duration, pending: e.poison?.pending || 0, timer: e.poison?.timer || 0};
  }
 }
 if (e.hp > 0 && resolved.cold > 0 && q.coldDuration > 0) e.chill = Math.max(e.chill || 0, q.coldDuration);

 const woundsChance = weaponHit ? clamp(mods.openWounds || 0, 0, 100) : 0;
 if (e.hp > 0 && woundsChance > 0 && random() < woundsChance / 100) {
  applyOpenWounds(e, S.p.level);
  float(e.x, e.y - 23, '출혈', '#e9a2a6');
 }
 if (e.hp > 0 && weaponHit && (mods.knockback || smite) && e.type !== 'boss') {
  const d = distance(S.p, e) || 1;
  move(e, (e.x - S.p.x) / d * 25, (e.y - S.p.y) / d * 25);
 }
 return actual;
};

const skillPacketBefore28 = skillPacket;
skillPacket = function(id, physical = false) {
 const rt = SKILL[id]?.runtime || {};
 const rangedWeapon = ['projectile', 'fan'].includes(rt.kind) && rt.weapon?.some(type => ['bow', 'crossbow', 'javelin'].includes(type));
 // Lightning Bolt's existing pure-lightning approximation stays explicit.
 // Its direct javelin is still a weapon hit; secondary bolts are handled below.
 const includePhysical = physical || rangedWeapon && id !== 'amazon_lightning_bolt';
 const packet = skillPacketBefore28(id, includePhysical);
 if (rangedWeapon) {packet.weaponHit = true; packet.ranged = true;}
 if (id === 'amazon_power_strike') {
  const bonus = synergyValue(id, 'damage_percent');
  if (bonus) {
   const st = stats(), row = skillValues(id).row;
   const physicalScale = 1 + (st.offED + (row.damage_percent || 0)) / 100;
   // Public Power Strike bonuses augment lightning; the legacy generic key
   // incorrectly augmented its physical weapon component.
   if (includePhysical) packet.physical *= physicalScale / (physicalScale + bonus / 100);
   packet.lightning *= 1 + bonus / 100;
  }
 }
 if (id === 'amazon_multiple_shot') {
  packet.physical *= .75;
  packet.weaponElementScale = .75;
 }
 return packet;
};

const emitPacketBefore28 = emitPacket;
const multipleShotVolleys = new WeakMap();
emitPacket = function(from, angle, packet, opts = {}) {
 const next = {...packet, ranged: true};
 if (packet.skillId === 'amazon_charged_strike') {
  next.weaponHit = false; next.noWeaponEffects = true; next.noLeech = true; next.noCrit = true;
 }
 if (packet.skillId === 'amazon_multiple_shot') {
  if (!multipleShotVolleys.has(packet)) multipleShotVolleys.set(packet, []);
  next.volleyHits = multipleShotVolleys.get(packet);
 }
 return emitPacketBefore28(from, angle, next, opts);
};

function updateCombatStatuses(dt) {
 if (!Number.isFinite(dt) || dt <= 0) return;
 for (const e of [...S.enemies]) {
  const wounds = e.openWounds;
  if (!wounds || e.hp <= 0 || e.sealed) continue;
  const elapsed = Math.min(wounds.left, dt);
  wounds.left = Math.max(0, wounds.left - elapsed);
  wounds.pending += wounds.dps * elapsed;
  wounds.timer += elapsed;
  if (wounds.timer >= .25 - 1e-9 || wounds.left <= 1e-9) {
   hurtEnemy(e, wounds.pending);
   wounds.pending = 0; wounds.timer = 0;
  }
  if (wounds.left <= 1e-9) delete e.openWounds;
 }
}

const updateRestoredBefore28 = updateRestoredSystems;
updateRestoredSystems = function(dt) {
 updateRestoredBefore28(dt);
 updateCombatStatuses(dt);
};
