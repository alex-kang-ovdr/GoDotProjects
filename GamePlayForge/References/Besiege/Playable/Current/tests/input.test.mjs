import test from 'node:test';
import assert from 'node:assert/strict';
import { readControls, getControlProfile } from '../dist/input.js';

test('ground arrows preserve V2 driving aliases without flight commands', () => {
  const input = readControls(new Set(['ArrowUp', 'ArrowLeft', 'KeyI', 'KeyF']), new Set());
  assert.equal(input.forward, 1); assert.equal(input.turn, 1);
  assert.equal(input.pitch, 0); assert.equal(input.roll, 0);
  assert.equal(input.aim, 1); assert.equal(input.fire, true);
});

test('aircraft separates throttle/yaw from pitch/bank and preserves gun inputs', () => {
  const profile = getControlProfile([{ type: 'wing' }, { type: 'propeller' }], { environment: 'land' });
  const input = readControls(new Set(['KeyW', 'KeyD', 'ArrowUp', 'ArrowLeft', 'KeyQ']), new Set(), { ...profile, assist: false });
  assert.equal(input.forward, 1); assert.equal(input.turn, -1);
  assert.equal(input.pitch, 1); assert.equal(input.roll, 1);
  assert.equal(input.turret, 1); assert.equal(input.assist, false);
  assert.equal(readControls(new Set(['ArrowUp']), new Set(), profile).forward, 0);
});

test('touch inputs share signs, opposing inputs cancel, and route profile follows mission', () => {
  const profile = getControlProfile([], { environment: 'air', objective: 'route' });
  assert.equal(profile.flight, true); assert.equal(profile.route, true);
  const input = readControls(new Set(['KeyW', 'ArrowUp']), new Set(['forward', 'back', 'pitchDown', 'rollRight', 'brake']), profile);
  assert.equal(input.forward, 0); assert.equal(input.pitch, 0); assert.equal(input.roll, -1);
  assert.equal(input.brake, true); assert.equal(input.assist, true);
  const boat = getControlProfile([{ type: 'float' }, { type: 'propeller' }], { environment: 'water', objective: 'route' });
  assert.equal(boat.water, true); assert.equal(boat.flight, false); assert.equal(boat.powered, true);
});

test('piston keyboard and touch commands share a neutral, cancellable actuator channel', () => {
  assert.equal(getControlProfile([{ type: 'piston' }]).mechanism, true);
  assert.equal(getControlProfile([{ type: 'wood' }]).mechanism, false);
  assert.equal(readControls(new Set(['KeyZ']), new Set()).actuate, 1);
  assert.equal(readControls(new Set(['KeyX']), new Set()).actuate, -1);
  assert.equal(readControls(new Set(['KeyZ']), new Set(['retract'])).actuate, 0);
  assert.equal(readControls(new Set(), new Set(['extend'])).actuate, 1);
  assert.equal(readControls(new Set(), new Set()).actuate, 0);
});
