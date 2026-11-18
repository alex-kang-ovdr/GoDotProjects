'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { harness } = require('./helpers/browser-app.cjs');

test('lobby offers three map sizes and the four requested speeds with defaults', () => {
  const h = harness({ autoStart: false });
  assert.equal(h.game.mapScale, 1);
  assert.equal(h.game.map.width, 1600);
  assert.equal(h.settings().speed, 1);
  assert.equal(h.mapChoice(1).attributes['aria-pressed'], 'true');
  for (const scale of [1.5, 2]) assert.equal(h.mapChoice(scale).attributes['aria-pressed'], 'false');
  const html = fs.readFileSync(path.join(__dirname, '../dist/index.html'), 'utf8');
  for (const id of ['lobby-speed-choice', 'speed-button', 'pause-speed-choice']) {
    const options = html.match(new RegExp(`<select[^>]*id="${id}"[^>]*>([\\s\\S]*?)</select>`))[1];
    assert.deepEqual([...options.matchAll(/<option value="([^"]+)"/g)].map(m => Number(m[1])), [0.5, 0.75, 1, 1.5]);
  }
  h.assertHealthy();
});

test('map selection affects only preparation and starts an independent scaled match', () => {
  const h = harness({ autoStart: false });
  for (const [scale, side] of [[1.5, 2400], [2, 3200], [1, 1600]]) {
    h.mapChoice(scale).fire('click');
    assert.equal(h.game.started, false);
    assert.equal(h.game.mapScale, scale);
    assert.equal(h.game.map.width, side);
    assert.equal(h.game.map.height, side);
    assert.equal(h.mapChoice(scale).attributes['aria-pressed'], 'true');
  }
  h.mapChoice(2).fire('click');
  h.speedChoice('lobby-speed-choice', 0.75);
  h.get('start-button').fire('click');
  const active = h.game;
  assert.equal(active.mapScale, 2);
  assert.equal(h.settings().speed, 0.75);
  h.mapChoice(1).fire('click');
  assert.equal(h.game, active, 'Even an injected hidden lobby event must not resize an active match');
  assert.equal(h.game.mapScale, 2);
  const saved = JSON.parse(h.stored.get('nexus-front-checkpoint'));
  assert.equal(saved.state.state.mapScale, 2);
  assert.equal(saved.ui.speed, 0.75);
  h.assertHealthy();
});

test('all four speeds scale fixed-step simulation while renderer keeps real elapsed time', () => {
  for (const speed of [0.5, 0.75, 1, 1.5]) {
    const h = harness({ prefs: { speed, mapScale: 1.5 } });
    h.frame();
    const start = h.game.time;
    h.advance(2000);
    assert.ok(Math.abs((h.game.time - start) - 2 * speed) < 1 / 60 + 1e-8, `${speed}x advances ${2 * speed} simulation seconds`);
    assert.equal(h.renderDt, 0.02, 'Camera and visual interpolation receive wall time');
    assert.equal(h.game.map.width, 2400);
    h.assertHealthy();
  }
});

test('live and paused speed controls update immediately and persist without resetting play', () => {
  const h = harness({ prefs: { mapScale: 2, speed: 1 } });
  h.frame(); h.advance(300);
  const active = h.game, time = active.time, playerId = active.player.id;
  h.speedChoice('speed-button', 0.5);
  assert.equal(h.game, active);
  assert.equal(h.game.time, time);
  assert.equal(h.game.player.id, playerId);
  assert.equal(h.get('pause-speed-choice').value, '0.5');
  assert.equal(JSON.parse(h.stored.get('nexus-front-prefs')).speed, 0.5);
  assert.equal(JSON.parse(h.stored.get('nexus-front-checkpoint')).ui.speed, 0.5);
  h.get('pause-button').fire('click');
  assert.equal(h.game.paused, true);
  h.speedChoice('pause-speed-choice', 1.5);
  h.advance(200);
  assert.equal(h.game.time, time, 'Changing a paused match rate cannot resume time');
  assert.equal(h.get('speed-button').value, '1.5');
  assert.equal(JSON.parse(h.stored.get('nexus-front-checkpoint')).ui.speed, 1.5);
  h.get('resume-button').fire('click');
  h.advance(1000);
  assert.ok(Math.abs(h.game.time - time - 1.5) < 1 / 60 + 1e-8);
  h.assertHealthy();
});

test('saved map and speed override different lobby choices on continue and survive reload', () => {
  const h = harness({ prefs: { mapScale: 2, speed: 0.75 } });
  h.frame(); h.advance(500);
  h.get('pause-button').fire('click');
  h.get('save-exit-button').fire('click');
  const savedTime = JSON.parse(h.stored.get('nexus-front-checkpoint')).state.state.time;
  const restored = harness({ autoStart: false, stored: h.stored });
  assert.equal(restored.game.mapScale, 2);
  assert.equal(restored.settings().speed, 0.75);
  assert.match(restored.get('continue-detail').textContent, /맵 2배 · 속도 0.75배/);
  restored.mapChoice(1).fire('click');
  restored.speedChoice('lobby-speed-choice', 1.5);
  restored.get('continue-button').fire('click');
  assert.equal(restored.game.mapScale, 2);
  assert.equal(restored.game.map.width, 3200);
  assert.equal(restored.settings().speed, 0.75);
  assert.equal(restored.game.time, savedTime);
  assert.equal(restored.game.paused, true);
  assert.equal(restored.mapChoice(2).attributes['aria-pressed'], 'true');
  assert.equal(restored.get('speed-button').value, '0.75');
  restored.assertHealthy();
});

test('legacy 2x speed preference and checkpoint migrate to 1.5x without offering 2x', () => {
  const h = harness({ prefs: { speed: 2 } });
  assert.equal(h.settings().speed, 1.5);
  h.get('pause-button').fire('click'); h.get('save-exit-button').fire('click');
  const checkpoint = JSON.parse(h.stored.get('nexus-front-checkpoint'));
  checkpoint.ui.speed = 2;
  checkpoint.state.engineVersion = 6;
  delete checkpoint.state.state.mapScale;
  h.stored.set('nexus-front-checkpoint', JSON.stringify(checkpoint));
  const legacy = harness({ autoStart: false, stored: h.stored });
  legacy.get('continue-button').fire('click');
  assert.equal(legacy.game.mapScale, 1);
  assert.equal(legacy.settings().speed, 1.5);
  assert.equal(legacy.get('pause-speed-choice').value, '1.5');
  legacy.assertHealthy();
});

test('minimap and battlefield orders reach the larger map instead of clamping at 1600', () => {
  const h = harness({ prefs: { mapScale: 2 } });
  const minimap = h.get('minimap');
  minimap.rect = { left: 20, top: 30, width: 200, height: 200, right: 220, bottom: 230 };
  const issued = [];
  h.game.commandMove = (...args) => { issued.push(args); return { ok: true }; };
  minimap.fire('pointerdown', { clientX: 210, clientY: 220 });
  assert.ok(issued.length > 0);
  assert.ok(issued.at(-1)[0] > 3000 && issued.at(-1)[1] > 3000, 'Minimap uses the active 3200-world map and its inset');
  h.desktop();
  h.get('battlefield').fire('pointerdown', { button: 2, clientX: 2900, clientY: 2850 });
  assert.equal(issued.at(-1)[0], 2900);
  assert.equal(issued.at(-1)[1], 2850);
  h.assertHealthy();
});

test('invalid saved preferences fall back safely and new matches retain selected settings', () => {
  const h = harness({ autoStart: false, prefs: { mapScale: 10, speed: -1 } });
  assert.equal(h.game.mapScale, 1);
  assert.equal(h.settings().speed, 1);
  h.mapChoice(1.5).fire('click'); h.speedChoice('lobby-speed-choice', 0.5);
  h.get('start-button').fire('click');
  const first = h.game;
  h.game.over = true;
  h.get('again-button').fire('click');
  assert.notEqual(h.game, first);
  assert.equal(h.game.mapScale, 1.5);
  assert.equal(h.settings().speed, 0.5);
  assert.equal(h.game.time, 0);
  assert.equal(h.game.started, true);
  h.assertHealthy();
});

function previewAndRelease(h, slot, dx = 72, dy = 0) {
  const button = slot === 'ward' ? h.get('ward-button') : h.skill(slot);
  button.fire('pointerdown', { pointerId: 71, pointerType: 'touch', clientX: 100, clientY: 700 });
  button.fire('pointermove', { pointerId: 71, pointerType: 'touch', clientX: 100 + dx, clientY: 700 + dy });
  h.frame();
  const aim = { ...h.rendered.aim };
  button.fire('pointerup', { pointerId: 71, pointerType: 'touch', clientX: 100 + dx, clientY: 700 + dy });
  return aim;
}

test('large-map touch placement and dash preview use the active map bounds on new matches', () => {
  for (const mapScale of [1.5, 2]) {
    const h = harness({ prefs: { mapScale } }), p = h.game.player;
    Object.assign(p, { x: h.game.map.width * 0.65, y: h.game.map.height * 0.65 });
    const origin = { x: p.x, y: p.y };
    const wardAim = previewAndRelease(h, 'ward');
    assert.equal(wardAim.x, origin.x + 450);
    assert.equal(wardAim.y, origin.y);
    assert.equal(h.calls.at(-1)[0], 'ward');
    assert.equal(h.calls.at(-1)[1], wardAim.x);
    assert.equal(h.calls.at(-1)[2], wardAim.y);
    const dashAim = previewAndRelease(h, 'd');
    assert.equal(dashAim.x, origin.x + 300);
    assert.equal(dashAim.y, origin.y);
    assert.equal(h.calls.at(-1)[0], 'd');
    assert.ok(dashAim.x > 1572, 'The larger map cannot use the old 1600-world touch limit');
    h.assertHealthy();
  }
});

test('touch map limits resync when continuing a larger saved match and preparing a smaller one', () => {
  const h = harness({ prefs: { mapScale: 2 } });
  h.get('pause-button').fire('click'); h.get('save-exit-button').fire('click');
  h.mapChoice(1).fire('click');
  h.get('continue-button').fire('click'); h.get('resume-button').fire('click');
  Object.assign(h.game.player, { x: 2100, y: 2080 });
  const restoredAim = previewAndRelease(h, 'd');
  assert.equal(restoredAim.x, 2400);
  assert.equal(restoredAim.y, 2080, 'Restored large-map origin is not clamped down to 1572');
  h.game.over = true;
  h.get('change-hero-button').fire('click');
  h.mapChoice(1).fire('click'); h.get('start-button').fire('click');
  Object.assign(h.game.player, { x: 1550, y: 1500 });
  const smallerAim = previewAndRelease(h, 'd', 72, 36);
  assert.equal(smallerAim.x, 1572, 'A fresh basic match must discard the previous large-map bounds');
  assert.equal(smallerAim.y, 1511, 'Clipping preserves the diagonal drag angle at the basic map edge');
  h.assertHealthy();
});
