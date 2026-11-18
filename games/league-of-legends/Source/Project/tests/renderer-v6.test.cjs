'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Game } = require('../dist/game.js');
const { Renderer } = require('../dist/renderer.js');

// Canvas is replaced only to check drawing safety and information boundaries.
// These tests do not claim browser layout or pixel-perfect visual verification.
function drawingContext() {
  const calls = [];
  const check = value => {
    if (typeof value === 'number') assert.ok(Number.isFinite(value), 'Canvas receives finite coordinates');
    if (Array.isArray(value)) value.forEach(check);
  };
  const gradient = { addColorStop(...args) { args.forEach(check); } };
  const ctx = new Proxy({ globalAlpha: 1 }, {
    get(object, property) {
      if (property in object) return object[property];
      return (...args) => {
        args.forEach(check);
        calls.push({ method: property, args });
        return property === 'createRadialGradient' || property === 'createLinearGradient' ? gradient : undefined;
      };
    },
    set(object, property, value) { check(value); object[property] = value; return true; }
  });
  return { ctx, calls };
}

function rendererFor(game) {
  const drawing = drawingContext();
  const canvas = { getContext: () => drawing.ctx, getBoundingClientRect: () => ({ width: 1280, height: 800 }) };
  return { renderer: new Renderer(canvas, game), ...drawing };
}

test('rendering all hero windups and recoveries does not advance or alter combat', () => {
  for (const hero of ['mage', 'warrior', 'ranger']) {
    const game = new Game({ hero, seed: 73 });
    game.start();
    Object.assign(game.player, { x: 800, y: 800, autoAttack: false });
    const target = game.entities.find(entity => entity.type === 'hero' && entity.team === 1);
    Object.assign(target, { x: 800 + Math.min(game.player.range - 10, 210), y: 800, stunnedUntil: 1000 });
    game._rebuildIndex();
    assert.equal(game._attack(game.player, target), true);
    assert.equal(game.getAttackState().phase, 'windup');
    const { renderer } = rendererFor(game);
    const assertUnchanged = () => {
      const before = JSON.stringify(game.exportState());
      renderer.render(1 / 60, { attackRangeShown: true });
      renderer.render(1 / 60, { attackRangeShown: true });
      assert.equal(JSON.stringify(game.exportState()), before, hero + ' render is presentation only');
    };
    assertUnchanged();
    for (let i = 0; i < 30 && game.getAttackState().phase === 'windup'; i++) game.step(1 / 60);
    assert.equal(game.getAttackState().phase, 'recovery');
    assertUnchanged();
    game.paused = true;
    assertUnchanged();
  }
});

test('a hidden actor cannot reveal its pending attack through the combat cue', () => {
  const hero = { id: 'hidden', team: 1, hp: 100, alive: true };
  let inspected = false;
  const game = { entities: [hero], isVisible: () => false,
    getAttackState() { inspected = true; throw new Error('Hidden attack state must not be inspected'); } };
  const { renderer, ctx, calls } = rendererFor(game);
  renderer._drawAttackCue(ctx, hero, false);
  assert.equal(inspected, false);
  assert.deepEqual(calls, []);
});

test('a retained hidden target never supplies coordinates to a windup aim line', () => {
  const hero = Object.freeze({ id: 'player', team: 0, hp: 100, alive: true, x: 800, y: 800, r: 18, facing: 0 });
  const hidden = { id: 'hidden', team: 1, hp: 100, alive: true,
    get x() { throw new Error('Hidden target x leaked'); }, get y() { throw new Error('Hidden target y leaked'); } };
  const state = Object.freeze({ phase: 'windup', progress: 0.5, duration: 0.25, remaining: 0.125, targetId: hidden.id });
  // Do not include the hidden unit at construction: existing terrain/minimap
  // bookkeeping is outside this attack cue's information-boundary test.
  const game = { player: hero, entities: [hero], isVisible: entity => entity.team === 0,
    getAttackState: () => state };
  const { renderer, ctx, calls } = rendererFor(game);
  game.entities.push(hidden);
  assert.doesNotThrow(() => renderer._drawAttackCue(ctx, hero, true));
  assert.ok(calls.length > 0, 'The visible player still receives its own preparation cue');
  assert.equal(state.targetId, 'hidden');
});

test('basic attack range appears only by request and yields to explicit spell aiming', () => {
  const game = new Game({ hero: 'ranger', seed: 17 });
  game.start();
  const { renderer, ctx, calls } = rendererFor(game);
  for (const options of [{}, { attackRangeShown: false }, { attackRangeShown: true, selectedAbility: 'q' }]) {
    renderer._drawAttackRange(ctx, options);
    assert.equal(calls.length, 0);
  }
  const before = JSON.stringify(game.exportState());
  renderer._drawAttackRange(ctx, { attackRangeShown: true });
  assert.ok(calls.length > 0);
  assert.equal(JSON.stringify(game.exportState()), before, 'Displaying reach does not issue an attack');
  calls.length = 0;
  game.player.alive = false;
  renderer._drawAttackRange(ctx, { attackRangeShown: true });
  assert.equal(calls.length, 0);
});
