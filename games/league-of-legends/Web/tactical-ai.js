/* Nexus Front: deterministic, observation-based recall and shopping decisions. */
(function (root) {
  'use strict';

  const LEGACY_BUILDS = Object.freeze({
    mage: Object.freeze(['focus', 'boots', 'crown', 'plate', 'focus', 'crown', 'heart', 'bow']),
    warrior: Object.freeze(['blade', 'heart', 'boots', 'edge', 'plate', 'blade', 'edge', 'heart']),
    ranger: Object.freeze(['bow', 'boots', 'blade', 'bow', 'edge', 'plate', 'heart'])
  });
  const RESTORED_BUILDS = Object.freeze({
    mage: Object.freeze(['lol_1052', 'lol_1001', 'lol_3108', 'lol_1058', 'lol_3089', 'lol_3067']),
    warrior: Object.freeze(['lol_1036', 'lol_1001', 'lol_3133', 'lol_3006', 'lol_1053', 'lol_1011', 'lol_1031']),
    ranger: Object.freeze(['lol_1036', 'lol_1001', 'lol_1053', 'lol_3006', 'lol_1038', 'lol_3031', 'lol_3086'])
  });
  const EMPTY = Object.freeze([]);
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const finite = value => typeof value === 'number' && Number.isFinite(value);

  function getBuild(hero) {
    if (!hero) return EMPTY;
    const restored = hero.sourceProfile === 'lol16.22' || (typeof hero.hero === 'string' && hero.hero.startsWith('lol_'));
    return (restored ? RESTORED_BUILDS[hero.archetype] : LEGACY_BUILDS[hero.hero]) || EMPTY;
  }

  // This is a purchase-at-base quote, not a transaction. The engine still
  // revalidates and commits the actual purchase after the recall completes.
  function plannedPurchase(hero, definitions) {
    const build = getBuild(hero);
    const index = Number.isInteger(hero.buildIndex) && hero.buildIndex >= 0 ? hero.buildIndex : 0;
    const itemId = build[index], item = definitions && definitions[itemId];
    if (!item || !finite(item.cost)) return null;
    const restored = hero.sourceProfile === 'lol16.22' || (typeof hero.hero === 'string' && hero.hero.startsWith('lol_'));
    if ((item.sourceProfile === 'lol16.22') !== restored) return null;
    const inventory = (Array.isArray(hero.inventory) ? hero.inventory : []).map(entry => typeof entry === 'string' ? entry : entry && entry.id);
    const used = new Set();
    let cost = item.cost;
    for (const component of item.components || []) {
      const slot = inventory.findIndex((id, i) => id === component && !used.has(i));
      if (slot >= 0) {
        const definition = definitions[component];
        if (!definition || !finite(definition.cost)) return null;
        used.add(slot); cost -= definition.cost;
      }
    }
    cost = Math.max(0, cost);
    if (inventory.length - used.size >= 6) return null;
    if (item.uniqueGroup && inventory.some((id, i) => !used.has(i) && definitions[id]?.uniqueGroup === item.uniqueGroup)) return null;
    if (!finite(hero.gold) || hero.gold + 0.0001 < cost) return null;
    return { itemId, cost };
  }

  function getRetreatReason(game, hero, definitions) {
    if (!game || !hero || hero.isPlayer || !hero.alive || game.over || !game.started || game.paused) return null;
    if (hero.retreating || hero.recallLeft > 0 || hero.attackWindup || hero.stunnedUntil > game.time) return null;
    const now = game.time, base = game.map?.bases?.[hero.team];
    if (!finite(now) || now < 45 || !base || distance(hero, base) <= 200) return null;
    if (now - (finite(hero.lastDamageAt) ? hero.lastDamageAt : now) < 5) return null;
    // Query visibility before reading enemy coordinates or combat state. A
    // hidden opponent moving, dying, or changing target cannot alter this result.
    const threatened = (game.entities || []).some(entity => {
      if (entity === hero || entity.team === hero.team || typeof game.isVisible !== 'function' || !game.isVisible(entity, hero.team)) return false;
      if (!entity.alive || !['hero', 'minion', 'tower', 'monster'].includes(entity.type)) return false;
      if (entity.type === 'monster' && !entity.inCombat) return false;
      return distance(entity, hero) <= Math.max(460, (entity.range || 0) + (hero.r || 0) + 40);
    });
    if (threatened) return null;

    const usesMana = hero.maxMana > 0 && hero.resourceType !== 'energy' && hero.resourceType !== 'none';
    if (usesMana && hero.mana / hero.maxMana < 0.15) return { reason: 'mana' };
    const threshold = now < 120 ? 450 : now < 300 ? 650 : 850;
    if (hero.gold < threshold) return null;
    const purchase = plannedPurchase(hero, definitions);
    return purchase ? { reason: 'shop', ...purchase } : null;
  }

  const api = { getBuild, plannedPurchase, getRetreatReason };
  root.NexusTacticalAI = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
