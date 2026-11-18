'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./helpers/browser-app.cjs');

function observe(game) { game._rebuildIndex(); game._updateVision(true); }
function alone(game) {
  for (const e of game.entities) if (e.team === 0 && e !== game.player) { e.alive = false; e.hp = 0; }
}
function refresh(h) { h.game.paused = true; h.frame(140); }

test('objective chips use the last observation, not hidden monster life or respawn values', () => {
  const h = harness({ prefs: { hero: 'lol_ahri', mapScale: 2 } }), g = h.game;
  alone(g); observe(g); refresh(h);
  const before = h.get('dragon-timer').textContent;
  assert.match(before, /정찰/);
  const dragon = g.entities.find(e => e.id === 'dragon');
  dragon.alive = true; dragon.hp = dragon.maxHp; dragon.respawnIn = 0;
  observe(g); refresh(h);
  assert.equal(h.get('dragon-timer').textContent, before);
  dragon.alive = false; dragon.hp = 0; dragon.respawnIn = 159;
  observe(g); refresh(h);
  assert.equal(h.get('dragon-timer').textContent, before);
  assert.match(h.get('dragon-order-state').textContent, /미확인/);
});

test('selected structure retains observed HP and destruction state while it is in fog', () => {
  const h = harness({ prefs: { hero: 'lol_lux' } }), g = h.game;
  alone(g);
  const tower = g.entities.find(e => e.type === 'tower' && e.team === 1 && e.structureTier === 'outer' && e.lane === 'top');
  g.player.x = tower.x; g.player.y = tower.y + 45; tower.hp = tower.maxHp * .6;
  observe(g);
  h.get('battlefield').fire('pointerdown', { clientX: tower.x, clientY: tower.y });
  const hp = h.get('target-hp').textContent;
  assert.equal(h.get('target-panel').hidden, false);
  g.player.x = 165; g.player.y = 1435;
  observe(g); refresh(h);
  assert.equal(h.get('target-panel').classList.contains('remembered'), true);
  assert.equal(h.get('target-hp').textContent, hp);
  assert.match(h.get('target-preview').textContent, /재탐색 시 갱신/);
  tower.hp = 0; tower.alive = false;
  observe(g); refresh(h);
  assert.equal(h.get('target-hp').textContent, hp, 'hidden destruction cannot replace the observed health');
  const before = h.get('objective-title').textContent;
  assert.doesNotMatch(before, /안쪽 포탑/);
  g.player.x = tower.x; g.player.y = tower.y + 45;
  observe(g); refresh(h);
  assert.match(h.get('target-hp').textContent, /^0 \/ /);
  assert.match(h.get('objective-title').textContent, /안쪽 포탑/);
});

test('a remembered building can be inspected without issuing a targeted attack', () => {
  const h = harness(), g = h.game;
  alone(g);
  const tower = g.entities.find(e => e.type === 'tower' && e.team === 1 && e.structureTier === 'outer' && e.lane === 'top');
  g.player.x = tower.x; g.player.y = tower.y + 45; observe(g);
  g.player.x = 165; g.player.y = 1435; observe(g);
  const attacks = [], original = g.attackTarget.bind(g);
  g.attackTarget = id => { attacks.push(id); return original(id); };
  h.get('battlefield').fire('pointerdown', { clientX: tower.x, clientY: tower.y });
  assert.equal(h.get('target-panel').hidden, false);
  assert.match(h.get('target-kind').textContent, /건물 관측 기록/);
  assert.deepEqual(attacks, []);
  assert.equal(g._playerTargetId, null);
});

test('unobserved enemy HP and level cannot change the scoreboard markup', () => {
  const h = harness(), g = h.game;
  alone(g); observe(g);
  h.get('scoreboard-button').fire('click');
  const before = h.get('scoreboard-content').innerHTML;
  assert.match(before, /시야 밖/);
  for (const hero of g.entities.filter(e => e.type === 'hero' && e.team === 1)) {
    hero.hp = hero.maxHp * .13; hero.level = 18;
  }
  refresh(h);
  assert.equal(h.get('scoreboard-content').innerHTML, before);
});

test('target HUD displays reconstructed mark damage and never consumes the mark or RNG', () => {
  const h = harness({ prefs: { hero: 'lol_lux' } }), g = h.game;
  const enemy = g.entities.find(e => e.type === 'hero' && e.team === 1);
  enemy.x = g.player.x + 75; enemy.y = g.player.y;
  enemy.illuminatedBy = g.player.id; enemy.illuminatedUntil = g.time + 8;
  observe(g);
  h.get('battlefield').fire('pointerdown', { clientX: enemy.x, clientY: enemy.y });
  assert.match(h.get('target-preview').textContent, /기본 공격 HP/);
  const estimate = g.getBasicAttackPreview(enemy);
  assert.match(h.get('target-preview').textContent, new RegExp(String(Math.floor(estimate.hpDamageMin))));
  const state = JSON.stringify(g.exportState());
  g.paused = true;
  const pausedState = JSON.stringify(g.exportState());
  h.frame(140);
  assert.equal(JSON.stringify(g.exportState()), pausedState, 'HUD reads must leave the gameplay state unchanged');
  assert.equal(enemy.illuminatedBy, g.player.id);
  assert.ok(state.length > 0);
});

test('HUD labels authored high ground and expires fixed-position attack cues with game time', () => {
  const h = harness(), g = h.game;
  const high = g.map.highGrounds[0];
  assert.ok(high);
  g.player.x = high.x; g.player.y = high.y;
  observe(g); refresh(h);
  assert.equal(h.get('vision-status').textContent, '▲ 고지대');
  assert.equal(h.get('vision-status').classList.contains('high-ground'), true);
  alone(g);
  g.player.x = high.x; g.player.y = high.y + high.r + 50;
  const enemy = g.entities.find(e => e.type === 'hero' && e.team === 1);
  enemy.x = high.x; enemy.y = high.y;
  observe(g);
  assert.equal(g.visibilityAt(high.x, high.y, 0), false);
  g.damage(g.player, 5, enemy, 'magic', { x: high.x, y: high.y });
  refresh(h);
  assert.equal(h.get('vision-status').textContent, '공격 단서 1');
  g.time += 2; observe(g); refresh(h);
  assert.equal(h.get('vision-status').textContent, '저지대');
});
