'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const data = require('../dist/restored-data.js');
const input = require('../data/restored-input.json');
const assets = require('../data/restored-assets.json');
const repo = path.resolve(__dirname, '..');
const hero = key => data.playableHeroes.find(h => h.sourceKey === key);
const item = id => data.shopItems.find(i => i.sourceId === id);

test('the pinned catalogue distinguishes full data coverage from executable content', () => {
  assert.equal(data.version, '16.22.1');
  assert.equal(data.publicPatch, '26.22');
  assert.deepEqual(data.coverage, { champions: 173, qwer: 692, items: 863, playableChampions: 6, playableItems: 25 });
  assert.equal(data.champions.length, 173);
  assert.equal(data.champions.reduce((n, c) => n + c.spells.length, 0), 692);
  assert.equal(data.items.length, 863);
  assert.equal(data.playableHeroes.length, 6);
  assert.equal(data.shopItems.length, 25);
  assert.deepEqual(data.playableHeroes.map(h => h.sourceKey).sort(), ['Ahri', 'Ashe', 'Garen', 'Jhin', 'LeeSin', 'Lux']);
  assert.equal(new Set(data.shopItems.map(i => i.id)).size, 25);
  assert.equal(data.champions.filter(c => c.playableId !== null).length, 6);
  assert.equal(data.items.filter(i => i.playable).length, 25);
  assert.equal(new Set(data.champions.map(c => c.id)).size, 173);
  assert.equal(new Set(data.items.map(i => i.id)).size, 863);
  assert.equal(data.champions.find(c => c.key === 'Annie').playableId, null);
});

test('all champion stats and QWER rank arrays survive the compact projection unchanged', () => {
  const source = new Map(input.champions.map(c => [c.key, c]));
  for (const c of data.champions) {
    const original = source.get(c.key);
    assert.deepEqual(c.stats, original.stats, c.key);
    assert.deepEqual(c.spells.map(s => s.slot), ['q', 'w', 'e', 'r']);
    for (const s of c.spells) {
      const originalSpell = original.spells.find(o => o.slot === s.slot);
      assert.deepEqual(s.cooldownByRank, originalSpell.cooldownByRank);
      assert.deepEqual(s.costByRank, originalSpell.costByRank);
      assert.deepEqual(s.rangeByRank, originalSpell.rangeByRank);
      assert.deepEqual(s.unresolvedTokens, originalSpell.unresolvedTokens);
    }
  }
  assert.deepEqual(hero('Ahri').skills.q.cooldownByRank, [7, 7, 7, 7, 7]);
  assert.deepEqual(hero('Ahri').skills.q.costByRank, [55, 65, 75, 85, 95]);
  assert.deepEqual(hero('Ahri').skills.q.rangeByRank, [970, 970, 970, 970, 970]);
});

test('spatial conversion affects runtime movement and ranges, never source arrays or combat stats', () => {
  assert.equal(data.unitScale, 0.5);
  for (const h of data.playableHeroes) {
    const c = data.champions.find(c => c.key === h.sourceKey);
    assert.equal(h.range, c.stats.attackrange / 2);
    assert.equal(h.speed, c.stats.movespeed / 2);
    assert.equal(h.hp, c.stats.hp);
    assert.equal(h.damage, c.stats.attackdamage);
    assert.equal(h.armor, c.stats.armor);
    assert.equal(h.magicResist, c.stats.spellblock);
    assert.equal(h.attackSpeed, c.stats.attackspeed);
    for (const s of Object.values(h.skills)) {
      const o = c.spells.find(o => o.slot === s.slot);
      assert.deepEqual(s.rangeByRank, o.rangeByRank);
      assert.equal(s.rangeArrayUnits, 'lol_units');
      if (s.runtimeRangeOverride === undefined) assert.equal(s.range, o.rangeByRank[0] / 2);
    }
  }
  assert.equal(item(1001).stats.speed, 12.5);
  assert.equal(item(3006).stats.speed, 22.5);
});

test('global display sentinels have explicit runtime overrides and keep their original evidence', () => {
  for (const slot of ['e', 'r']) {
    const s = hero('Ashe').skills[slot];
    assert.ok(s.rangeByRank.every(n => n === 25000));
    assert.equal(s.runtimeRangeOverride, 4800);
    assert.equal(s.range, 4800);
    assert.ok(s.rangeOverrideReason.length > 0);
  }
  const curtain = hero('Jhin').skills.r;
  assert.deepEqual(curtain.rangeByRank, [25000, 25000, 25000]);
  assert.equal(curtain.runtimeRangeOverride, 1750);
  assert.equal(curtain.range, 1750);
  assert.equal(curtain.geometryEvidence, 'project_reconstruction');
});

test('zero cooldown, zero range and resource-free champions retain their distinct semantics', () => {
  assert.deepEqual(hero('Ashe').skills.q.cooldownByRank, [0, 0, 0, 0, 0]);
  assert.equal(hero('Ashe').skills.q.behaviorEvidence, 'project_reconstruction');
  assert.deepEqual(hero('Garen').skills.w.rangeByRank, [0, 0, 0, 0, 0]);
  assert.equal(hero('Garen').resourceType, 'none');
  assert.equal(hero('Garen').mana, 0);
  assert.equal(hero('LeeSin').resourceType, 'energy');
  assert.equal(hero('LeeSin').mana, 200);
  assert.equal(hero('Ahri').resourceType, 'mana');
});

test('unresolved damage formulas are retained instead of being silently presented as official mechanics', () => {
  assert.ok(hero('Ahri').skills.q.unresolvedTokens.includes('totaldamage'));
  for (const h of data.playableHeroes) {
    assert.equal(h.statsEvidence, 'official_static_values');
    assert.equal(h.behaviorEvidence, 'project_reconstruction');
    assert.equal(h.passive.behaviorEvidence, 'project_reconstruction');
    for (const s of Object.values(h.skills)) {
      assert.equal(s.evidence, 'official_static_rank_values');
      assert.equal(s.behaviorEvidence, 'project_reconstruction');
      assert.equal(s.geometryEvidence, 'project_reconstruction');
      assert.ok(s.source.startsWith('https://ddragon.leagueoflegends.com/cdn/16.22.1/'));
      assert.match(s.sourceHash, /^[0-9a-f]{64}$/);
    }
  }
});

test('purchasable items are an explicit supported subset of the modern Rift candidate set', () => {
  const catalogue = new Map(data.items.map(i => [i.id, i]));
  for (const supported of data.shopItems) {
    const row = catalogue.get(supported.id);
    assert.equal(row.playable, true);
    assert.equal(row.srCandidate, true);
    assert.equal(row.maps['11'], true);
    assert.equal(supported.sourceProfile, 'lol16.22');
    assert.equal(supported.cost, row.cost);
    assert.equal(supported.sell, row.sell);
  }
  assert.equal(data.items.find(i => i.sourceId === 3105).maps['11'], false);
  assert.equal(item(3105), undefined);
  assert.equal(data.items.find(i => i.sourceId === 3140).playable, false, 'An unimplemented active item remains catalogue-only');
});

test('recipe data preserves duplicate physical component slots and exact combine totals', () => {
  const byId = new Map(data.shopItems.map(i => [i.id, i]));
  assert.deepEqual(item(3006).components, ['lol_1001', 'lol_1042', 'lol_1042']);
  assert.deepEqual(item(3089).components, ['lol_1058', 'lol_1058']);
  assert.deepEqual(item(3133).components, ['lol_1036', 'lol_2022', 'lol_1036']);
  for (const i of data.shopItems) {
    const componentCost = i.components.reduce((n, id) => {
      assert.ok(byId.has(id), `${i.id} has a purchasable component ${id}`);
      return n + byId.get(id).cost;
    }, 0);
    assert.equal(componentCost + i.combineCost, i.cost, i.id);
  }
  assert.equal(item(3089).cost - item(1058).cost * 2, 1100);
  assert.equal(item(3006).cost - item(1001).cost - item(1042).cost, 550, 'One dagger cannot satisfy two component slots');
});

test('selling uses the official per-item value and unique groups retain their purchase contract', () => {
  assert.equal(item(1037).cost, 875);
  assert.equal(item(1037).sell, 613);
  assert.notEqual(item(1037).sell, Math.floor(item(1037).cost * 0.7));
  assert.equal(item(1001).uniqueGroup, 'boots');
  assert.equal(item(3006).uniqueGroup, 'boots');
  assert.equal(item(3031).uniqueGroup, 'lol_3031');
  assert.equal(item(3089).uniqueGroup, 'lol_3089');
});

test('tooltip-only stats use audited official literals and fractional engine units', () => {
  assert.equal(item(3031).stats.damage, 75);
  assert.equal(item(3031).stats.critChance, 0.25);
  assert.equal(item(3031).stats.critDamageBonus, 0.30);
  assert.equal(item(3089).stats.abilityPower, 130);
  assert.equal(item(3089).stats.abilityPowerMultiplier, 0.30);
  assert.equal(item(1053).stats.lifeSteal, 0.07);
  assert.equal(item(3086).stats.percentSpeed, 0.04);
  assert.equal(item(2022).stats.abilityHaste, 5);
  for (const id of [3067, 3108, 3133]) assert.equal(item(id).stats.abilityHaste, 10);
  for (const id of [3031, 3089, 2022, 3067, 3108, 3133]) {
    const evidence = item(id).extraStatEvidence;
    assert.equal(evidence.length, 1);
    assert.equal(evidence[0].sourcePointer, `/data/${id}/description`);
    assert.equal(evidence[0].evidence, 'observed_official_description');
    assert.equal(item(id).stats[evidence[0].field], evidence[0].value);
    assert.match(evidence[0].sourceHash, /^[0-9a-f]{64}$/);
  }
});

test('the six portraits and 25 item icons are available locally with their recorded bytes', () => {
  assert.equal(assets.assets.length, 31);
  assert.equal(assets.assets.filter(a => a.kind === 'champion').length, 6);
  assert.equal(assets.assets.filter(a => a.kind === 'item').length, 25);
  for (const a of assets.assets) {
    const bytes = fs.readFileSync(path.join(repo, a.path));
    assert.equal(bytes.length, a.bytes);
    assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), a.sha256);
  }
  for (const h of data.playableHeroes) assert.ok(fs.existsSync(path.join(repo, 'dist', h.portrait)));
  for (const i of data.shopItems) assert.ok(fs.existsSync(path.join(repo, 'dist', i.portrait)));
});
