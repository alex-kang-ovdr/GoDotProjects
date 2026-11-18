'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./helpers/browser-app.cjs');

function down(button, id = 1, values = {}) { button.fire('pointerdown', { pointerId: id, pointerType: 'touch', ...values }); }
function up(button, id = 1, values = {}) { button.fire('pointerup', { pointerId: id, pointerType: 'touch', ...values }); }
function click(button, values = {}) { button.fire('click', { detail: 1, pointerType: 'touch', ...values }); }

test('a touch tap casts once, and switching to desktop restores click-to-arm input', () => {
  const h = harness(), q = h.skill('q'), mana = h.game.player.mana;
  down(q); up(q); click(q);
  assert.equal(h.calls.length, 1, 'The compatibility click cannot cast a second time');
  assert.equal(h.game.player.mana, mana - h.game.getSkillInfo('q').cost);
  h.game.player.cd.q = 0; // Ready the same skill without advancing unrelated AI.
  h.desktop();
  q.fire('pointerdown', { pointerId: 7, pointerType: 'mouse' });
  q.fire('pointerup', { pointerId: 7, pointerType: 'mouse' });
  click(q, { pointerType: 'mouse' });
  assert.equal(q.classList.contains('armed'), true, 'Past touch suppression cannot swallow a new desktop click');
  assert.equal(h.calls.length, 1, 'Desktop button click arms rather than immediately casting');
  h.assertHealthy();
});

test('blur cancels a captured aim; a delayed release cannot cast, and keyboard activation still works', () => {
  const h = harness(), q = h.skill('q'), mana = h.game.player.mana;
  down(q, 11); q.fire('pointermove', { pointerId: 11, clientX: 150, clientY: 650 });
  h.window.fire('blur');
  assert.equal(q.hasPointerCapture(11), false);
  assert.equal(h.get('touch-aim-overlay').hidden, true);
  h.time(2000); up(q, 11); click(q);
  assert.equal(h.calls.length, 0);
  assert.equal(h.game.player.mana, mana);
  click(q, { detail: 0 });
  assert.equal(h.calls.length, 1, 'Keyboard/assistive click is not mistaken for a trailing pointer click');
  h.assertHealthy();
});

test('a rejected second skill finger cannot leave permanent suppression after responsive layout change', () => {
  const h = harness(), q = h.skill('q'), d = h.skill('d');
  down(q, 11); down(d, 22);
  // The unowned second finger releases elsewhere; that button never sees up.
  h.document.fire('pointerup', { pointerId: 22 });
  q.fire('pointercancel', { pointerId: 11 });
  h.desktop(); h.time(2000);
  d.fire('pointerdown', { pointerId: 3, pointerType: 'mouse' });
  d.fire('pointerup', { pointerId: 3, pointerType: 'mouse' });
  click(d, { pointerType: 'mouse' });
  assert.equal(d.classList.contains('armed'), true);
  assert.equal(h.calls.length, 0);
  h.assertHealthy();
});

test('movement and skill fingers retain independent captures and movement through release', () => {
  const h = harness(), q = h.skill('q'), joystick = h.get('joystick');
  down(joystick, 11, { clientX: 106, clientY: 554 });
  h.frame(); h.frame();
  assert.ok(h.game._input.x > 0);
  const x = h.game.player.x;
  down(q, 22); q.fire('pointermove', { pointerId: 22, clientX: 155, clientY: 650 });
  assert.equal(joystick.hasPointerCapture(11), true);
  assert.equal(q.hasPointerCapture(22), true);
  h.frame();
  assert.ok(h.game.player.x > x, 'Aiming must not stop the movement finger');
  up(q, 22, { clientX: 155, clientY: 650 }); click(q);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0][0], 'q');
  assert.equal(h.calls[0].length, 3, 'Dragged release supplies explicit world aim');
  assert.equal(joystick.hasPointerCapture(11), true);
  h.frame(); assert.ok(h.game._input.x > 0);
  up(joystick, 11, { clientX: 106, clientY: 554 });
  assert.equal(h.game._input.x, 0);
  h.assertHealthy();
});

test('pause, resize and page exit cancel aim without spending resources or saving held input', () => {
  for (const action of ['pause', 'resize', 'pagehide']) {
    const h = harness(), q = h.skill('q'), mana = h.game.player.mana;
    down(q, 11); q.fire('pointermove', { pointerId: 11, clientX: 160, clientY: 650 });
    if (action === 'pause') { click(h.get('pause-button')); click(h.get('resume-button')); }
    else h.window.fire(action);
    assert.equal(h.get('touch-aim-overlay').hidden, true, action);
    assert.equal(q.hasPointerCapture(11), false, action);
    h.time(2000); up(q, 11); click(q);
    assert.equal(h.calls.length, 0, action);
    assert.equal(h.game.player.mana, mana, action);
    const saved = JSON.parse(h.stored.get('nexus-front-checkpoint'));
    assert.equal(saved.state.engineVersion, 9);
    assert.deepEqual(saved.state.state._input, { x: 0, y: 0 });
    h.assertHealthy();
  }
});

test('death ends an in-progress aim before disabling its button, without casting on release', () => {
  const h = harness(), q = h.skill('q');
  down(q, 11);
  const enemy = h.game.entities.find(entity => entity.type === 'hero' && entity.team === 1);
  h.game.damage(h.game.player, 1e6, enemy, 'true');
  h.frame();
  assert.equal(h.game.player.alive, false);
  assert.equal(q.hasPointerCapture(11), false);
  assert.equal(h.get('touch-aim-overlay').hidden, true);
  up(q, 11); click(q);
  assert.equal(h.calls.length, 0);
  h.assertHealthy();
});

test('attack range toggle persists a preference and A inspection does not change that preference', () => {
  const h = harness(), range = h.get('attack-range-button');
  h.frame();
  assert.equal(h.rendered.attackRangeShown, false);
  range.fire('click'); h.frame();
  assert.equal(h.rendered.attackRangeShown, true);
  assert.equal(range.attributes['aria-pressed'], 'true');
  assert.equal(JSON.parse(h.stored.get('nexus-front-prefs')).attackRange, true);
  h.document.fire('keydown', {code:'KeyV',key:'v',target:h.get('battlefield')}); h.frame();
  assert.equal(h.rendered.attackRangeShown, false);
  assert.equal(range.attributes['aria-pressed'], 'false');
  h.document.fire('keydown', {code:'KeyA',key:'a',target:h.get('battlefield')}); h.frame();
  assert.equal(h.rendered.attackRangeShown, true, 'Choosing an attack-move point exposes attack reach');
  assert.equal(range.attributes['aria-pressed'], 'false', 'Temporary inspection does not change the stored toggle');
  h.document.fire('keydown', {code:'Escape',key:'Escape',target:h.get('battlefield')}); h.frame();
  assert.equal(h.rendered.attackRangeShown, false);
  assert.equal(h.calls.length, 0, 'Range inspection never casts a skill');
  h.assertHealthy();
});

test('actual click attack updates windup HUD and directional movement cancels it without a shot', () => {
  const h = harness(), g = h.game, player = g.player;
  const enemy = g.entities.find(e => e.type === 'hero' && e.team === 1);
  g.entities = [player, enemy]; g.nextWaveAt = 1e9;
  Object.assign(player, {x:800,y:800,autoAttack:false});
  Object.assign(enemy, {x:1000,y:800,stunnedUntil:1000});
  g._rebuildIndex();
  h.get('battlefield').fire('pointerdown', {clientX:1000,clientY:800,pointerType:'mouse',button:2});
  h.frame(); h.frame();
  assert.equal(g.getAttackState().phase, 'windup');
  assert.equal(h.get('attack-state').dataset.phase, 'windup');
  assert.equal(h.get('attack-state-label').textContent, '발사 준비');
  const beforeY = player.y;
  h.document.fire('keydown', {code:'ArrowUp',key:'ArrowUp',target:h.get('battlefield')});
  for (let i = 0; i < 20; i++) h.frame();
  assert.ok(player.y < beforeY);
  assert.equal(player.attackWindup, null);
  assert.equal(g.projectiles.filter(p => p.sourceId === player.id).length, 0);
  assert.equal(h.get('attack-state').dataset.phase, 'ready');
  assert.equal(h.get('attack-state-label').textContent, '공격 가능');
  h.document.fire('keyup', {code:'ArrowUp',key:'ArrowUp',target:h.get('battlefield')});
  h.assertHealthy();
});

test('pause preserves actual pending attack, and resuming displays recovery after one release', () => {
  const h = harness(), g = h.game, player = g.player;
  const enemy = g.entities.find(e => e.type === 'hero' && e.team === 1);
  Object.assign(player, {x:800,y:800,autoAttack:false});
  Object.assign(enemy, {x:1000,y:800,stunnedUntil:1000});
  for (const other of g.entities) if (other.type === 'hero' && other !== player && other !== enemy) other.stunnedUntil = 1000;
  g._rebuildIndex();
  h.get('battlefield').fire('pointerdown', {clientX:1000,clientY:800,pointerType:'mouse',button:2});
  h.frame(); h.frame();
  assert.equal(g.getAttackState().phase, 'windup');
  h.get('pause-button').fire('click');
  const remaining = player.attackWindup.remaining;
  for (let i = 0; i < 10; i++) h.frame();
  assert.equal(g.paused, true);
  assert.equal(player.attackWindup.remaining, remaining);
  assert.equal(h.get('attack-state').dataset.phase, 'windup');
  h.get('resume-button').fire('click');
  for (let i = 0; i < 18; i++) h.frame();
  assert.equal(g.getAttackState().phase, 'recovery');
  assert.equal(h.get('attack-state-label').textContent, '재공격 대기');
  assert.equal(g.projectiles.filter(p => p.sourceId === player.id && p.kind === 'basic').length, 1);
  h.assertHealthy();
});
