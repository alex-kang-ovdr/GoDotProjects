'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { AimGesture } = require('../dist/controls.js');
const player = { x: 800, y: 800, facing: 0, mana: 300 };
const projectile = { target: 'direction', range: 620 };
const area = { target: 'ground', range: 430 };
const dash = { target: 'dash', range: 300 };
const event = (x, y, extras = {}) => ({ pointerId: 7, x, y, ...extras });
const begin = (gesture, slot = 'q') => gesture.begin({ ...event(100, 200), slot });
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} should equal ${expected}`);

test('a short skill-button tap requests auto aim without spending player resources', () => {
  const gesture = new AimGesture();
  const before = { ...player };
  assert.equal(begin(gesture), true);
  gesture.move(event(108, 205));
  assert.equal(gesture.snapshot(player, projectile).aim, null);
  assert.deepEqual(gesture.finish(event(108, 205), player, projectile), { kind: 'tap', slot: 'q' });
  assert.equal(gesture.active, false);
  assert.deepEqual(player, before);
});

test('direction shots cross the drag threshold at full skill range', () => {
  const gesture = new AimGesture();
  begin(gesture);
  gesture.move(event(100, 188));
  const view = gesture.snapshot(player, projectile);
  assert.equal(view.dragging, true);
  near(view.aim.x, 800);
  near(view.aim.y, 180);
  const result = gesture.finish(event(100, 188), player, projectile);
  assert.equal(result.kind, 'cast');
  assert.deepEqual(result.aim, view.aim);
});

test('ground and dash gestures scale placement by drag distance and stop at maximum range', () => {
  for (const skill of [area, dash]) {
    const gesture = new AimGesture();
    begin(gesture);
    gesture.move(event(136, 200));
    const half = gesture.snapshot(player, skill);
    near(half.fraction, 0.5);
    near(half.aim.x, player.x + skill.range / 2);
    near(half.aim.y, player.y);
    gesture.move(event(100 + 720, 200));
    const result = gesture.finish(event(100 + 720, 200), player, skill);
    near(result.aim.x, player.x + skill.range);
    near(result.aim.y, player.y);
  }
});

test('the final pointerup determines aim even when the last move event was omitted', () => {
  const gesture = new AimGesture();
  begin(gesture);
  gesture.move(event(136, 200));
  const result = gesture.finish(event(100, 128), player, area);
  assert.equal(result.kind, 'cast');
  near(result.aim.x, 800);
  near(result.aim.y, 370);
});

test('a fast swipe ending without any move events still casts at the release direction', () => {
  const gesture = new AimGesture();
  begin(gesture, 'd');
  assert.deepEqual(gesture.finish(event(172, 200), player, dash), { kind: 'cast', slot: 'd', aim: { x: 1100, y: 800 } });
});

test('joystick or second-skill pointers cannot steal or finish an active aim', () => {
  const gesture = new AimGesture();
  begin(gesture, 'w');
  assert.equal(gesture.begin({ ...event(30, 60, { pointerId: 8 }), slot: 'r' }), false);
  assert.equal(gesture.move(event(300, 300, { pointerId: 8, cancel: true })), false);
  assert.deepEqual(gesture.finish(event(300, 300, { pointerId: 8 }), player, area), { kind: 'ignore', slot: null });
  assert.equal(gesture.active, true);
  assert.equal(gesture.snapshot(player, area).slot, 'w');
  assert.deepEqual(gesture.finish(event(100, 200), player, area), { kind: 'tap', slot: 'w' });
});

test('cancel-zone release cancels without aim or leftover gesture state', () => {
  const gesture = new AimGesture();
  begin(gesture);
  gesture.move(event(100, 128, { cancel: true }));
  assert.equal(gesture.snapshot(player, projectile).canceled, true);
  assert.deepEqual(gesture.finish(event(100, 128, { cancel: true }), player, projectile), { kind: 'cancel', slot: 'q' });
  assert.equal(gesture.active, false);
  assert.equal(gesture.snapshot(player, projectile).aim, null);
  assert.deepEqual(gesture.finish(event(172, 200), player, projectile), { kind: 'ignore', slot: null });
});

test('leaving the cancel zone resumes aiming and final release cancel status is authoritative', () => {
  const gesture = new AimGesture();
  begin(gesture);
  gesture.move(event(100, 128, { cancel: true }));
  const result = gesture.finish(event(172, 200, { cancel: false }), player, projectile);
  assert.equal(result.kind, 'cast');
  near(result.aim.x, 1420);
  near(result.aim.y, 800);
});

test('pointercancel, modal closure, or blur can discard an aim without synthesizing a cast', () => {
  const gesture = new AimGesture();
  begin(gesture);
  gesture.move(event(172, 200));
  gesture.cancel();
  assert.equal(gesture.active, false);
  assert.deepEqual(gesture.finish(event(172, 200), player, projectile), { kind: 'ignore', slot: null });
  assert.equal(begin(gesture, 'ward'), true);
  assert.deepEqual(gesture.finish(event(100, 200), player, area), { kind: 'tap', slot: 'ward' });
});

test('aim stays relative to the live hero position while the movement joystick is held', () => {
  const gesture = new AimGesture();
  begin(gesture);
  gesture.move(event(136, 200));
  const before = gesture.snapshot(player, area).aim;
  const movingPlayer = { ...player, x: player.x + 60, y: player.y - 90 };
  const after = gesture.snapshot(movingPlayer, area).aim;
  near(after.x - before.x, 60);
  near(after.y - before.y, -90);
  assert.deepEqual(gesture.finish(event(136, 200), movingPlayer, area).aim, after);
});

test('retreating a drag to the button center does not unexpectedly become an auto-aim tap', () => {
  const gesture = new AimGesture();
  begin(gesture);
  gesture.move(event(172, 200));
  const result = gesture.finish(event(100, 200), player, area);
  assert.equal(result.kind, 'cast');
  assert.deepEqual(result.aim, { x: 800, y: 800 });
});

test('placement clamps to safe world bounds without using screen position as world position', () => {
  const gesture = new AimGesture();
  begin(gesture);
  gesture.move(event(-100, -100));
  const result = gesture.finish(event(-100, -100), { x: 50, y: 50 }, area);
  near(result.aim.y, 28);
  near(result.aim.x, 50 - 22 * 2 / 3);
});

test('diagonal shots keep their drag angle near a map border', () => {
  const gesture = new AimGesture();
  begin(gesture);
  const hero = { x: 1500, y: 1000 };
  const result = gesture.finish(event(172, 236), hero, projectile);
  assert.ok(result.aim.x > 1572, 'A direction point can extend beyond the map; it is not a placement destination');
  near((result.aim.y - hero.y) / (result.aim.x - hero.x), 0.5);
});

test('outward shots at the exact map edge do not collapse into fallback facing', () => {
  const gesture = new AimGesture();
  begin(gesture);
  const hero = { x: 1572, y: 800, facing: Math.PI };
  const result = gesture.finish(event(172, 200), hero, projectile);
  assert.equal(result.kind, 'cast');
  near(Math.atan2(result.aim.y - hero.y, result.aim.x - hero.x), 0);
  assert.notEqual(result.aim.x, hero.x);
});

test('malformed inputs cannot begin, transfer ownership, or turn an invalid release into a cast', () => {
  const gesture = new AimGesture();
  for (const invalid of [null, {}, { ...event(NaN, 0), slot: 'q' }, { ...event(0, 0), slot: '__proto__' }, { ...event(0, 0), slot: 'q', pointerId: Infinity }]) {
    assert.equal(gesture.begin(invalid), false);
  }
  begin(gesture);
  assert.equal(gesture.move(event(Infinity, 0)), false);
  gesture.move(event(172, 200));
  assert.deepEqual(gesture.finish(event(NaN, 200), player, projectile), { kind: 'cancel', slot: 'q' });
  assert.equal(gesture.active, false);
});

test('invalid hero or skill data cancels a dragged release instead of producing NaN coordinates', () => {
  for (const [hero, skill] of [[null, area], [{ x: NaN, y: 200 }, area], [player, null], [player, { range: Infinity }], [player, { range: -1 }]]) {
    const gesture = new AimGesture();
    begin(gesture);
    assert.deepEqual(gesture.finish(event(172, 200), hero, skill), { kind: 'cancel', slot: 'q' });
  }
});

test('read-only display snapshots cannot corrupt subsequent gestures or change cancellation', () => {
  const gesture = new AimGesture();
  begin(gesture);
  gesture.move(event(172, 200));
  const view = gesture.snapshot(player, projectile);
  view.origin.x = -1000;
  view.pointer.x = 0;
  view.direction.x = -1;
  view.canceled = true;
  view.aim.x = -999;
  const result = gesture.finish(event(172, 200), player, projectile);
  assert.deepEqual(result, { kind: 'cast', slot: 'q', aim: { x: 1420, y: 800 } });
  begin(gesture, 'e');
  assert.deepEqual(gesture.finish(event(100, 200), player, dash), { kind: 'tap', slot: 'e' });
});
