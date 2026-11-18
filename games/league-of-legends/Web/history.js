/* Nexus Front: bounded, versioned match records without DOM dependencies. */
(function (root) {
  'use strict';

  const KEY = 'nexus-front-history';
  const LIMIT = 5;
  const completedGames = new WeakMap();
  let completedSequence = 0;
  // History must remain readable without loading the simulation or data bundle.
  // Keep stable released IDs here, including the restored profile, so an Ahri
  // result cannot silently become the legacy mage after a reload.
  const HERO_NAMES = Object.freeze({
    mage: '리아', warrior: '브란', ranger: '키라',
    lol_ahri: '아리', lol_ashe: '애쉬', lol_garen: '가렌',
    lol_lux: '럭스', lol_leesin: '리 신', lol_jhin: '진'
  });
  const HEROES = new Set(Object.keys(HERO_NAMES));
  const RESTORED_HEROES = new Set(Object.keys(HERO_NAMES).filter(id => id.startsWith('lol_')));
  const DIFFICULTIES = new Set(['easy', 'normal', 'hard']);
  const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const number = (value, fallback, min, max) => finite(value) ? Math.max(min, Math.min(max, value)) : fallback;
  const count = (value, max) => Math.floor(number(value, 0, 0, max === undefined ? 1e9 : max));
  const string = (value, fallback, length) => typeof value === 'string' && value.trim()
    ? value.trim().slice(0, length || 96) : fallback;
  const heroId = value => HEROES.has(value) ? value : 'mage';
  const unsupportedRestoredHero = value => typeof value === 'string' && value.startsWith('lol_') && !RESTORED_HEROES.has(value);
  const difficulty = value => DIFFICULTIES.has(value) ? value : 'normal';
  const mapScale = value => [1, 1.5, 2].includes(value) ? value : 1;
  const profileOf = hero => RESTORED_HEROES.has(hero)
    ? { ruleset: 'lol16.22', dataVersion: '16.22.1' }
    : { ruleset: 'nexus-v7', dataVersion: null };

  function hash(value) {
    let result = 2166136261;
    for (let i = 0; i < value.length; i++) {
      result ^= value.charCodeAt(i);
      result = Math.imul(result, 16777619);
    }
    return (result >>> 0).toString(36);
  }

  function normalizeHero(value, team, index) {
    if (!isObject(value) || unsupportedRestoredHero(value.hero)) return null;
    const hero = heroId(value.hero);
    return {
      id: string(value.id, 'hero-' + team + '-' + index, 96),
      hero,
      name: string(value.name, HERO_NAMES[hero], 80),
      ...profileOf(hero),
      team,
      level: count(value.level, 18),
      kills: count(value.kills),
      deaths: count(value.deaths),
      assists: count(value.assists),
      cs: count(value.cs),
      damage: count(value.damage),
      gold: count(value.gold),
      inventory: (Array.isArray(value.inventory) ? value.inventory : [])
        .filter(item => typeof item === 'string' && item.trim())
        .slice(0, 6).map(item => item.trim().slice(0, 64))
    };
  }

  function normalizeTeams(value) {
    if (!Array.isArray(value)) return [];
    const result = [];
    for (const team of [0, 1]) {
      const entry = value.find(item => isObject(item) && item.team === team);
      if (!entry) continue;
      const heroes = (Array.isArray(entry.heroes) ? entry.heroes : [])
        .filter(isObject).slice(0, 5).map((hero, i) => normalizeHero(hero, team, i)).filter(Boolean);
      result.push({ team, kills: count(entry.kills), heroes });
    }
    return result;
  }

  function normalizeObjectives(value) {
    if (!Array.isArray(value)) return [];
    const result = [];
    for (const team of [0, 1]) {
      const entry = value.find(item => isObject(item) && item.team === team);
      if (!entry) continue;
      result.push({ team, dragonStacks: count(entry.dragonStacks, 4),
        bossRemaining: number(entry.bossRemaining, 0, 0, 3600) });
    }
    return result;
  }

  function normalizeRecord(value) {
    // Core outcome fields must be valid: corrupt data must not fabricate wins.
    if (!isObject(value) || unsupportedRestoredHero(value.hero) || !finite(value.time) || (value.winner !== 0 && value.winner !== 1)) return null;
    const hero = heroId(value.hero);
    const restored = RESTORED_HEROES.has(hero);
    const record = {
      id: '',
      version: restored || value.version === 4 ? 4 : value.version === 3 ? 3 : 2,
      at: Math.floor(number(value.at, 0, 0, 8640000000000000)),
      hero,
      heroName: string(value.heroName, HERO_NAMES[hero], 80),
      ...profileOf(hero),
      difficulty: difficulty(value.difficulty),
      mapScale: mapScale(value.mapScale),
      winner: value.winner,
      endReason: value.endReason === 'surrender' ? 'surrender' : 'nexus',
      time: number(value.time, 0, 0, 86400),
      kills: count(value.kills),
      deaths: count(value.deaths),
      assists: count(value.assists),
      cs: count(value.cs),
      damage: count(value.damage),
      level: count(value.level, 18),
      structures: count(value.structures, 100),
      teamStats: normalizeTeams(value.teamStats),
      objectives: normalizeObjectives(value.objectives)
    };
    const legacyFingerprint = [record.at, record.hero, record.difficulty, record.winner, record.time,
      record.kills, record.deaths, record.assists, record.cs, record.damage].join('|');
    record.id = string(value.id, 'legacy-' + hash(legacyFingerprint), 128);
    return record;
  }

  function normalizeRecords(value) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    return value.map(normalizeRecord).filter(record => {
      if (!record || seen.has(record.id)) return false;
      seen.add(record.id);
      return true;
    }).sort((a, b) => b.at - a.at).slice(0, LIMIT);
  }

  function storageOrDefault(storage) {
    // Accessing localStorage itself can throw in restricted browser contexts.
    return storage === undefined ? root.localStorage : storage;
  }

  function read(storage) {
    try {
      const target = storageOrDefault(storage);
      if (!target || typeof target.getItem !== 'function') return [];
      const raw = target.getItem(KEY);
      if (typeof raw !== 'string' || !raw) return [];
      return normalizeRecords(JSON.parse(raw));
    } catch (_) {
      return [];
    }
  }

  function makeRecord(game, nowIso) {
    if (!isObject(game) || game.over !== true || (game.winner !== 0 && game.winner !== 1) || !isObject(game.player)) return null;
    const elapsed = number(game.time, 0, 0, 86400);
    let identity = completedGames.get(game);
    if (!identity) {
      const parsed = typeof nowIso === 'string' ? Date.parse(nowIso) : NaN;
      const at = finite(parsed) ? Math.max(0, parsed) : Date.now();
      const fingerprint = [game.seed, game.player.hero, mapScale(game.mapScale), game.winner, elapsed].join('|');
      identity = { at, id: (RESTORED_HEROES.has(game.player.hero) ? 'nf4-' : 'nf3-') + at.toString(36) + '-' + hash(fingerprint) + '-' + (++completedSequence).toString(36) };
      completedGames.set(game, identity);
    }
    const entities = Array.isArray(game.entities) ? game.entities.filter(isObject) : [];
    const player = game.player;
    const teamStats = [0, 1].map(team => ({
      team,
      kills: Array.isArray(game.teamKills) ? game.teamKills[team] : 0,
      heroes: entities.filter(entity => entity.type === 'hero' && entity.team === team).map(hero => ({
        id: hero.id, hero: hero.hero, name: hero.name, team,
        level: hero.level, kills: hero.kills, deaths: hero.deaths, assists: hero.assists,
        cs: hero.cs, damage: hero.damageDealt, gold: hero.gold,
        inventory: Array.isArray(hero.inventory) ? hero.inventory.slice() : []
      }))
    }));
    const objectives = [0, 1].map(team => {
      const buff = Array.isArray(game.teamBuffs) && isObject(game.teamBuffs[team]) ? game.teamBuffs[team] : {};
      return { team, dragonStacks: buff.dragonStacks,
        bossRemaining: finite(buff.bossUntil) ? Math.max(0, buff.bossUntil - elapsed) : 0 };
    });
    const enemyTeam = player.team === 1 ? 0 : 1;
    return normalizeRecord({
      id: identity.id, version: RESTORED_HEROES.has(player.hero) ? 4 : 3, at: identity.at,
      hero: player.hero, heroName: player.name, difficulty: game.difficulty, mapScale: game.mapScale, winner: game.winner,
      endReason: game.endReason,
      time: elapsed, kills: player.kills, deaths: player.deaths, assists: player.assists,
      cs: player.cs, damage: player.damageDealt, level: player.level,
      structures: entities.filter(entity => entity.team === enemyTeam && entity.alive === false &&
        ['tower', 'inhibitor', 'nexus'].includes(entity.type)).length,
      teamStats, objectives
    });
  }

  function append(storage, record) {
    const existing = read(storage);
    const normalized = normalizeRecord(record);
    if (!normalized) return { records: existing, persisted: false };
    // A duplicate ID preserves the first completed result instead of replacing it.
    const records = normalizeRecords(existing.some(item => item.id === normalized.id)
      ? existing : [normalized, ...existing]);
    let persisted = false;
    try {
      const target = storageOrDefault(storage);
      if (target && typeof target.setItem === 'function') {
        target.setItem(KEY, JSON.stringify(records));
        persisted = true;
      }
    } catch (_) {
      // The returned records still support a useful in-memory history for this session.
    }
    return { records, persisted };
  }

  const api = Object.freeze({ KEY, LIMIT, read, makeRecord, append });
  root.NexusHistory = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
