/* Pure deterministic rules shared by the live browser and Node regression tests. */
'use strict';
const HarborGameplay = (() => {
  const Data = typeof HarborGameplayData !== 'undefined' ? HarborGameplayData : require('./gameplay-data.js');
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const nonnegative = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const canonicalRole = role => ({ shooter: 'focus', driver: 'driving', breacher: 'assault' })[role] || role;

  function applyWeaponData(existingWeapons) {
    assert(Array.isArray(existingWeapons), 'Expected weapon definitions');
    for (const weapon of existingWeapons) {
      const tuning = Data.weapons[weapon.id];
      if (!tuning) continue;
      // Leave IDs, labels, reserve, input fire mode, recoil, visuals and spread intact.
      for (const key of ['damage', 'rpm', 'reload', 'cap', 'pellets', 'rangeStart', 'rangeEnd', 'minFactor', 'headMultiplier']) weapon[key] = tuning[key];
      weapon.range = Math.max(weapon.range || 0, tuning.rangeEnd);
      weapon.dataRevision = Data.revision;
    }
    return existingWeapons;
  }

  function damageAtDistance(weapon, distance, head = false, outgoing = 1) {
    assert(weapon && nonnegative(weapon.damage), 'Invalid base damage');
    assert(nonnegative(distance) && nonnegative(outgoing), 'Invalid damage factors');
    const tuning = Data.weapons[weapon.id] || {};
    const start = weapon.rangeStart ?? tuning.rangeStart ?? 0;
    const end = weapon.rangeEnd ?? tuning.rangeEnd ?? weapon.range;
    const min = weapon.minFactor ?? tuning.minFactor ?? 1;
    const headMultiplier = weapon.headMultiplier ?? tuning.headMultiplier ?? 1;
    assert(nonnegative(start) && Number.isFinite(end) && end > start && nonnegative(min) && min <= 1 && nonnegative(headMultiplier), 'Invalid range curve');
    const t = clamp((distance - start) / (end - start), 0, 1);
    return weapon.damage * (1 + (min - 1) * t) * (head ? headMultiplier : 1) * outgoing;
  }

  // Only hp is modified; returns the amount restored. Caller supplies game time.
  function updateRecovery(player, dtGame, elapsedSinceDamage) {
    assert(player && nonnegative(player.hp), 'Invalid player health');
    assert(nonnegative(dtGame) && nonnegative(elapsedSinceDamage), 'Invalid recovery clock');
    const c = Data.recovery;
    if (player.hp <= 0 || player.hp >= c.capHealth || elapsedSinceDamage < c.delaySeconds || dtGame === 0) return 0;
    // elapsedSinceDamage is sampled at the END of this step; do not heal the
    // portion of a step that occurred before the delay elapsed.
    const healingTime = Math.min(dtGame, Math.max(0, elapsedSinceDamage - c.delaySeconds));
    const previous = player.hp;
    player.hp = Math.min(c.capHealth, player.hp + healingTime * c.ratePerGameSecond);
    return player.hp - previous;
  }

  class Ability {
    constructor(role = 'focus') {
      this.role = canonicalRole(role);
      assert(Object.hasOwn(Data.ability.roles, this.role), 'Unknown ability role');
      this.energy = Data.ability.maxEnergy;
      this.active = false;
      this.cooldownRemaining = 0;
      this.lastStopReason = null;
    }
    get config() { return Data.ability.roles[this.role]; }
    get worldScale() { return this.active ? this.config.worldScale : 1; }
    get actionRate() { return this.active ? this.config.actionRate : 1; }
    get outgoingScale() { return this.active ? this.config.outgoingScale : 1; }
    get incomingScale() { return this.active ? this.config.incomingScale : 1; }
    get steeringAssist() { return this.active ? this.config.steeringAssist : 1; }
    get cooldown() { return this.cooldownRemaining; }
    eligibility(context = {}) {
      if (context.alive !== true) return 'dead';
      if (context.transitioning) return 'transition';
      if (this.config.context === 'driver' && !(context.inVehicle === true && context.isDriver === true)) return 'requires_driver';
      if (this.config.context === 'on_foot' && context.inVehicle) return 'requires_on_foot';
      return null;
    }
    activate(context) {
      if (this.active) return { ok: true, active: true, reason: 'already_active' };
      const invalid = this.eligibility(context);
      if (invalid) return { ok: false, active: false, reason: invalid };
      if (this.cooldownRemaining > 1e-9) return { ok: false, active: false, reason: 'cooldown' };
      if (this.energy + 1e-9 < Data.ability.minimumActivationEnergy) return { ok: false, active: false, reason: 'energy' };
      this.active = true;
      this.lastStopReason = null;
      return { ok: true, active: true, reason: 'activated' };
    }
    toggle(context) {
      if (this.active) { this.stop('manual'); return { ok: true, active: false, reason: 'manual' }; }
      return this.activate(context);
    }
    stop(reason = 'manual') {
      if (!this.active) return false;
      this.active = false;
      this.cooldownRemaining = Data.ability.cooldownSeconds;
      this.lastStopReason = reason;
      return true;
    }
    setRole(role) {
      role = canonicalRole(role);
      assert(Object.hasOwn(Data.ability.roles, role), 'Unknown ability role');
      if (role === this.role) return false;
      this.stop('role_changed');
      this.role = role;
      return true;
    }
    update(dtActiveReal, context) {
      assert(nonnegative(dtActiveReal), 'Invalid active-real delta');
      assert(nonnegative(this.energy) && this.energy <= Data.ability.maxEnergy && nonnegative(this.cooldownRemaining), 'Invalid ability state');
      let remaining = dtActiveReal;
      const invalid = this.eligibility(context);
      if (this.active && invalid) this.stop(invalid);
      if (this.active) {
        const consumedTime = Math.min(remaining, this.energy / Data.ability.drainPerActiveSecond);
        this.energy = Math.max(0, this.energy - consumedTime * Data.ability.drainPerActiveSecond);
        remaining -= consumedTime;
        if (this.energy <= 1e-9) { this.energy = 0; this.stop('empty'); }
      }
      if (!this.active) {
        const cooldownTime = Math.min(remaining, this.cooldownRemaining);
        this.cooldownRemaining = Math.max(0, this.cooldownRemaining - cooldownTime);
        remaining -= cooldownTime;
        if (context?.alive === true && remaining > 0) this.energy = Math.min(Data.ability.maxEnergy, this.energy + remaining * Data.ability.regenPerActiveSecond);
      }
      return this.serialize();
    }
    serialize() {
      return { version: 1, role: this.role, energy: this.energy, cooldownRemaining: this.cooldownRemaining, active: this.active };
    }
    load(snapshot) {
      // Validate completely before mutation. Save loads never activate an ability
      // without checking the new actor/vehicle context through activate().
      assert(snapshot && snapshot.version === 1 && Object.hasOwn(Data.ability.roles, snapshot.role), 'Invalid ability save');
      assert(nonnegative(snapshot.energy) && snapshot.energy <= Data.ability.maxEnergy, 'Invalid saved energy');
      assert(nonnegative(snapshot.cooldownRemaining) && snapshot.cooldownRemaining <= Data.ability.cooldownSeconds, 'Invalid saved cooldown');
      assert(typeof snapshot.active === 'boolean', 'Invalid saved active state');
      this.role = snapshot.role;
      this.energy = snapshot.energy;
      this.cooldownRemaining = snapshot.active ? Math.max(snapshot.cooldownRemaining, Data.ability.cooldownSeconds) : snapshot.cooldownRemaining;
      this.active = false;
      this.lastStopReason = 'loaded';
      return this;
    }
  }

  return { data: Data, applyWeaponData, damageAtDistance, updateRecovery, Ability };
})();
if (typeof window !== 'undefined') window.HarborGameplay = HarborGameplay;
if (typeof module !== 'undefined') module.exports = HarborGameplay;
