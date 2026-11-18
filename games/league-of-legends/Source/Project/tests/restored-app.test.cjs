'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./helpers/browser-app.cjs');
const Data = require('../dist/restored-data.js');
const Catalog = require('../dist/catalog.js');

function press(h, key) { h.document.fire('keydown', { code: `Key${key.toUpperCase()}`, key, target: h.get('battlefield') }); }
function unlock(h, slot) {
  const p = h.game.player;
  p.level = 6; p.skillRanks = { q:1,w:0,e:0,r:0 }; p.skillPoints = 5;
  assert.equal(h.game.upgradeSkill(slot).ok, true);
  h.frame();
}

test('new or unknown preferences choose the restored roster while valid legacy preferences remain valid', () => {
  const fresh = harness({ prefs:{hero:null}, autoStart:false });
  assert.equal(fresh.game.player.hero, 'lol_ahri');
  assert.match(fresh.get('hero-cards').innerHTML, /lol_jhin/);
  assert.equal((fresh.get('hero-cards').innerHTML.match(/data-hero=/g) || []).length, 6);
  assert.match(fresh.get('starter-choice').innerHTML, /lol_1052/);
  assert.doesNotMatch(fresh.get('starter-choice').innerHTML, /별빛 수정/);
  const old = harness({ prefs:{hero:'ranger'}, autoStart:false });
  assert.equal(old.game.player.hero, 'ranger');
  assert.equal((old.get('hero-cards').innerHTML.match(/data-hero=/g) || []).length, 3);
  fresh.assertHealthy(); old.assertHealthy();
});

test('every restored selection starts with its own HUD, resource and supported starter', () => {
  for (const hero of Data.playableHeroes) {
    const h = harness({ prefs:{hero:hero.id} });
    assert.equal(h.game.player.hero, hero.id);
    assert.equal(h.get('player-name').textContent, hero.name);
    assert.equal(h.game.ruleset, 'lol16.22');
    assert.ok(h.game.player.inventory.every(id => id.startsWith('lol_')));
    assert.doesNotMatch(h.get('mana-fill').style.width, /NaN|Infinity/);
    assert.match(h.get('hero-preview-description').innerHTML, new RegExp(hero.skills.q.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
    if (hero.resourceType === 'none') assert.equal(h.get('mana-text').textContent, '자원 소모 없음');
    if (hero.resourceType === 'energy') assert.match(h.get('mana-text').textContent, /^기력 /);
    assert.equal(h.get('hud-avatar').hidden, true);
    h.assertHealthy();
  }
});

test('large-map base shop uses the actual base and keeps restored and legacy inventories separate', () => {
  const h = harness({ prefs:{hero:'lol_ahri',mapScale:2} });
  Object.assign(h.game.player,h.game.map.bases[0]);
  h.get('shop-button').fire('click');
  assert.match(h.get('shop-location').textContent, /아군 기지/);
  assert.equal((h.get('item-grid').innerHTML.match(/data-item=/g) || []).length, 25);
  assert.doesNotMatch(h.get('item-grid').innerHTML, /별빛 수정/);
  assert.equal(h.get('shop-recall').disabled, true);
  h.get('shop-search').value = '무한'; h.get('shop-search').fire('input');
  assert.equal((h.get('item-grid').innerHTML.match(/data-item=/g) || []).length, 1);
  assert.match(h.get('item-grid').innerHTML, /lol_3031/);
  h.get('shop-search').value = '없는장비'; h.get('shop-search').fire('input');
  assert.equal(h.get('shop-empty').hidden, false);
  h.assertHealthy();
});

test('Ahri ultimate can arm and recast from desktop while its main cooldown is running', () => {
  const h = harness({prefs:{hero:'lol_ahri'}}); unlock(h,'r');
  h.game.player.mana = h.game.player.maxMana;
  h.skill('r').fire('click',{detail:0});
  assert.ok(h.game.player.cd.r > 0);
  h.advance(800);
  assert.equal(h.game.getSkillInfo('r').phase, 'recast');
  assert.equal(h.game.getSkillInfo('r').ready, true);
  assert.equal(h.skill('r').querySelector('.skill-cd').textContent, '재시전');
  assert.equal(h.skill('r').classList.contains('on-cooldown'), false);
  h.desktop(); h.skill('r').fire('click',{pointerType:'mouse',detail:1});
  assert.equal(h.skill('r').classList.contains('armed'), true);
  h.frame(); assert.equal(h.rendered.aimBlocked, false);
  press(h,'r');
  assert.equal(h.game.player.restored.recasts.r.remaining, 1);
  h.assertHealthy();
});

test('Lee Sin recast labels update and Garen resource-free casts do not produce an invalid resource bar', () => {
  const lee = harness({prefs:{hero:'lol_leesin'}}); unlock(lee,'w');
  lee.skill('w').fire('click',{detail:0}); lee.advance(300);
  assert.equal(lee.skill('w').querySelector('.skill-label').textContent, '강철의 의지');
  assert.match(lee.get('mana-text').textContent, /기력 /);
  lee.skill('w').fire('click',{detail:0});
  assert.equal(lee.game.player.restored.recasts.w, null);
  const garen = harness({prefs:{hero:'lol_garen'}});
  const before = garen.game.player.mana;
  garen.skill('q').fire('click',{detail:0});
  assert.equal(garen.game.player.mana, before);
  assert.equal(garen.get('mana-fill').style.width, '0%');
  lee.assertHealthy(); garen.assertHealthy();
});

test('Jhin empty trap charges show recharge time and the reload meter labels the attack lock', () => {
  const h = harness({prefs:{hero:'lol_jhin'}}); unlock(h,'e');
  h.game.player.mana = 300;
  assert.equal(h.game.cast('e',h.game.player.x+60,h.game.player.y).ok,true);
  h.advance(2100);
  assert.equal(h.game.cast('e',h.game.player.x+80,h.game.player.y).ok,true);
  h.advance(2100);
  assert.equal(h.game.player.restored.eCharges,0);
  assert.equal(h.game.getSkillInfo('e').phase,'recharging');
  assert.ok(Number(h.skill('e').querySelector('.skill-cd').textContent)>0);
  assert.equal(h.skill('e').classList.contains('on-cooldown'),true);
  h.game.player.restored.ammo = 0; h.game.player.restored.reloadUntil = h.game.time + 2;
  h.frame();
  assert.equal(h.get('attack-state-label').textContent,'탄환 장전 중');
  assert.match(h.get('attack-state-time').textContent,/초/);
  h.assertHealthy();
});

test('restored skill tooltips render exact rank cooldown and proper resource names', () => {
  for (const hero of ['lol_leesin','lol_garen','lol_ahri']) {
    const h = harness({prefs:{hero}}); h.desktop();
    h.skill('q').fire('pointerenter');
    assert.equal(h.get('skill-tooltip').hidden,false);
    assert.doesNotMatch(h.get('skill-tooltip').innerHTML,/NaN|undefined/);
    if (hero === 'lol_leesin') assert.match(h.get('skill-tooltip').innerHTML,/기력 50/);
    if (hero === 'lol_garen') assert.doesNotMatch(h.get('skill-tooltip').innerHTML,/마나/);
    h.assertHealthy();
  }
});

test('codex finds Korean, English and numeric IDs without turning catalogue entries into playable definitions', () => {
  assert.equal(Catalog.filterChampions(Data,'리 신')[0].key,'LeeSin');
  assert.equal(Catalog.filterChampions(Data,'lee sin')[0].key,'LeeSin');
  assert.equal(Catalog.filterChampions(Data,'','playable').length,6);
  assert.equal(Catalog.filterItems(Data,'','playable').length,25);
  assert.equal(Catalog.filterItems(Data,'3031').find(i=>i.sourceId===3031).name,'무한의 대검');
  assert.equal(Catalog.filterChampions(Data,'Aatrox')[0].playableId,null);
  assert.equal(Catalog.filterChampions(Data,'없는챔피언').length,0);
  assert.equal(Catalog.formatArray([0,10,null,12.5]),'0 / 10 / — / 12.5');
});
