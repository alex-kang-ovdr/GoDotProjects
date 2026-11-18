'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const GameAPI = require('../dist/game.js');
const { Game } = GameAPI;

const HEROES = ['lol_ahri', 'lol_ashe', 'lol_garen', 'lol_lux', 'lol_leesin', 'lol_jhin'];
const PAINT = new Set(['fill', 'stroke', 'fillRect', 'strokeRect', 'fillText', 'strokeText', 'drawImage']);
const GEOMETRY = new Set(['moveTo', 'lineTo', 'arc', 'arcTo', 'ellipse', 'bezierCurveTo', 'quadraticCurveTo', 'translate', 'rotate', 'scale']);

// This verifies finite Canvas calls, clipping, and simulation immutability.
// It does not replace browser pixel/layout verification.
function canvas(width = 1280, height = 800, record = true) {
  const calls = [], stack = [];
  let clips = [], rectangles = [];
  const finite = value => {
    if (typeof value === 'number') assert.ok(Number.isFinite(value), 'Canvas receives finite geometry and style values');
    if (Array.isArray(value)) value.forEach(finite);
  };
  const gradient = { addColorStop(...args) { args.forEach(finite); } };
  const ctx = new Proxy({ globalAlpha: 1 }, {
    get(object, property) {
      if (property in object) return object[property];
      if (property === 'measureText') return text => ({ width: String(text).length * 7 });
      if (property === 'createImageData') return (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
      return (...args) => {
        args.forEach(finite);
        if (property === 'save') stack.push(clips.slice());
        if (property === 'restore') {
          assert.ok(stack.length, 'Canvas restores a saved state');
          clips = stack.pop();
        }
        if (property === 'beginPath') rectangles = [];
        if (property === 'rect') rectangles.push(args.slice());
        if (property === 'clip') clips = [...clips, rectangles.slice()];
        if (record) calls.push({ method: property, args, clips: clips.slice() });
        return property === 'createRadialGradient' || property === 'createLinearGradient' ? gradient : undefined;
      };
    },
    set(object, property, value) { finite(value); object[property] = value; return true; }
  });
  return {
    width, height, clientWidth: width, clientHeight: height, ctx, calls,
    getContext: () => ctx, getBoundingClientRect: () => ({ width, height }),
    reset() { assert.equal(stack.length, 0, 'Canvas save/restore remains balanced'); calls.length = 0; },
    paints() { return calls.filter(call => PAINT.has(call.method)); }
  };
}

const context = {
  module: { exports: {} }, NexusGame: GameAPI,
  OffscreenCanvas: function (width, height) { return canvas(width, height, false); }
};
context.globalThis = context;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../dist/renderer.js'), 'utf8'), context);
const { Renderer } = context.module.exports;

function rendererFor(game) {
  const main = canvas();
  const renderer = new Renderer(main, game);
  main.reset();
  return { renderer, main, ctx: main.ctx };
}

function gameFor(hero, mapScale = 1) {
  const game = new Game({ hero, seed: 803, mapScale });
  game.start();
  game.player.level = 6;
  game.player.skillRanks = { q: 1, w: 1, e: 1, r: 1 };
  game.player.skillPoints = 2;
  game._recalculate(game.player);
  game.player.mana = game.player.maxMana;
  return game;
}

function effect(kind, overrides = {}) {
  return {
    id: 'renderer-effect', sourceId: 'player', team: 0, kind,
    x: 740, y: 800, at: 10, until: 130, radius: 110,
    ...overrides
  };
}

function observeEffectPaint(renderer, main, effect) {
  const drawing = renderer._drawEffect;
  const calls = [];
  renderer._drawEffect = function (ctx, entry) {
    const start = main.calls.length;
    drawing.call(this, ctx, entry);
    if (entry === effect) calls.push(...main.calls.slice(start).filter(call => PAINT.has(call.method)));
  };
  return calls;
}

test('six reconstructed silhouettes draw distinct finite geometry and active/paused frames never mutate gameplay', () => {
  const fingerprints = new Set();
  const casts = { lol_ahri: 'w', lol_ashe: 'e', lol_garen: 'e', lol_lux: 'e', lol_leesin: 'w', lol_jhin: 'r' };
  const palette = { main: '#67ddd0', light: '#d0f6e9', dark: '#215e62', fill: '#379f9d' };
  for (const [index, hero] of HEROES.entries()) {
    const game = gameFor(hero, [1, 1.5, 2][index % 3]);
    const result = game.cast(casts[hero]);
    assert.equal(result.ok, true, `${hero}: ${result.reason}`);
    const { renderer, main, ctx } = rendererFor(game);
    renderer._drawRestoredHero(ctx, game.player, palette, 0.35);
    assert.ok(main.paints().length, `${hero} has a silhouette`);
    fingerprints.add(JSON.stringify(main.calls.filter(call => GEOMETRY.has(call.method)).map(call => [call.method, call.args])));
    main.reset();
    for (const paused of [false, true]) {
      game.paused = paused;
      const before = JSON.stringify(game.exportState());
      renderer.render(1 / 60, { attackRangeShown: true });
      renderer.render(1 / 60, { attackRangeShown: true });
      assert.equal(JSON.stringify(game.exportState()), before, `${hero}: rendering must not age resources, charges, recasts, projectiles or timed effects`);
    }
    main.reset();
  }
  assert.equal(fingerprints.size, 6, 'The six champions do not fall through to the same generic drawing');
});

test('hidden reconstructed heroes never disclose ammunition or channel state through their silhouette', () => {
  const game = gameFor('lol_jhin');
  const enemy = game.entities.find(entity => entity.type === 'hero' && entity.team === 1);
  game.isVisible = entity => entity.team === 0;
  game.visibilityAt = () => false;
  Object.defineProperty(enemy, 'restored', { get() { throw new Error('Hidden champion mechanics were inspected'); } });
  const { renderer } = rendererFor(game);
  assert.doesNotThrow(() => renderer.render(1 / 60));
});

test('a real allied Jhin trap remains visible after its one-second planting animation expires', () => {
  const game = gameFor('lol_jhin'), p = game.player;
  assert.equal(game.cast('e', p.x + 60, p.y).ok, true);
  for (let i = 0; i < 125; i++) game.step(1 / 60);
  const trap = game._restoredEffects.find(entry => entry.kind === 'jhin_trap' && entry.sourceId === p.id);
  assert.ok(trap && trap.until > game.time + 100, 'The armed trap still exists in the simulation');
  assert.equal(game.effects.some(entry => entry.kind === 'ring' && entry.x === trap.x && entry.y === trap.y), false, 'Its initial generic VFX already expired');
  const { renderer, main, ctx } = rendererFor(game);
  const before = JSON.stringify(game.exportState());
  renderer._drawRestoredEffects(ctx);
  assert.ok(main.paints().length, 'The persistent layer renders the allied trap');
  assert.equal(JSON.stringify(game.exportState()), before);
  game.time = trap.until;
  main.reset();
  renderer._drawRestoredEffects(ctx);
  assert.equal(main.paints().length, 0, 'Expired traps stop drawing even before simulation cleanup');
});

test('dormant enemy traps and hidden triggered traps never reveal themselves', () => {
  const game = gameFor('lol_jhin');
  game.time = 10;
  game._restoredEffects = [effect('jhin_trap', { team: 1, armAt: 1, triggerAt: 0 })];
  const { renderer, main, ctx } = rendererFor(game);
  renderer.panTo(800, 800);
  game.visibilityAt = () => true;
  renderer._drawRestoredEffects(ctx);
  assert.equal(main.paints().length, 0, 'An untriggered enemy trap remains concealed even on visible ground');
  game._restoredEffects[0].triggerAt = 12;
  game.visibilityAt = () => false;
  main.reset();
  renderer._drawRestoredEffects(ctx);
  assert.equal(main.paints().length, 0, 'An enemy trap triggering in fog does not disclose its location');
  game.visibilityAt = () => true;
  main.reset();
  renderer._drawRestoredEffects(ctx);
  assert.ok(main.paints().length, 'A triggered enemy trap on currently visible ground has a warning');
});

test('allied Ashe reconnaissance has persistent travel and vision cues without exposing enemy reconnaissance', () => {
  const game = gameFor('lol_ashe');
  game.time = 10;
  const { renderer, main, ctx } = rendererFor(game);
  renderer.panTo(800, 800);
  for (const kind of ['reveal_travel', 'vision']) {
    game._restoredEffects = [effect(kind, { vx: 650, vy: 0, remaining: 100, radius: 220 })];
    game.visibilityAt = () => false;
    main.reset();
    const before = JSON.stringify(game.exportState());
    renderer._drawRestoredEffects(ctx);
    assert.ok(main.paints().length, `${kind}: allied reconnaissance shows its own position`);
    assert.equal(JSON.stringify(game.exportState()), before, 'Reconnaissance drawing never updates the simulation or its vision');
    game._restoredEffects[0].team = 1;
    game.visibilityAt = () => true;
    main.reset();
    renderer._drawRestoredEffects(ctx);
    assert.equal(main.paints().length, 0, `${kind}: an enemy reconnaissance source is not disclosed`);
  }
});

test('enemy Lux zones and laser warnings paint only through current-vision clips, never explored-only fog', () => {
  const game = gameFor('lol_lux');
  game.time = 10;
  const { renderer, main, ctx } = rendererFor(game);
  renderer.panTo(800, 800);
  for (const kind of ['lux_zone', 'lux_laser']) {
    game._restoredEffects = [effect(kind, { team: 1, radius: kind === 'lux_laser' ? 55 : 155, damage: 100, nextAt: 10,
      dx: 1, dy: 0, range: 600, fireAt: 10.6, fired: false })];
    const visible = (x, y) => x < 800 && y > 650 && y < 950;
    game.visibilityAt = visible;
    main.reset();
    renderer._drawRestoredEffects(ctx);
    const paints = main.paints();
    assert.ok(paints.length, `${kind}: its visible portion is drawn`);
    assert.ok(paints.every(call => call.clips.length > 0), `${kind}: no unclipped enemy paint can cross fog`);
    const clipping = main.calls.filter(call => call.method === 'clip');
    assert.ok(clipping.length, `${kind}: current vision supplies a clipping mask`);
    for (const call of clipping) for (const rect of call.clips.flat()) {
      assert.equal(visible(rect[0] + rect[2] / 2, rect[1] + rect[3] / 2), true, 'Only currently visible cells enter the mask');
    }
    game.visibilityAt = () => false;
    renderer._explored.fill(1);
    main.reset();
    renderer._drawRestoredEffects(ctx);
    assert.equal(main.paints().length, 0, `${kind}: exploration memory never authorizes enemy spell disclosure`);
  }
});

test('expired effects and already-fired laser warnings stop drawing without changing their saved state', () => {
  const game = gameFor('lol_lux');
  game.time = 10;
  const { renderer, main, ctx } = rendererFor(game);
  renderer.panTo(800, 800);
  game.visibilityAt = () => true;
  game._restoredEffects = [
    effect('lux_zone', { until: 10, radius: 155, damage: 100, nextAt: 10 }),
    effect('lux_laser', { id: 'fired', until: 11, radius: 55, dx: 1, dy: 0, range: 600, fireAt: 9.5, fired: true, damage: 100 })
  ];
  const before = JSON.stringify(game.exportState());
  renderer._drawRestoredEffects(ctx);
  assert.equal(main.paints().length, 0);
  assert.equal(JSON.stringify(game.exportState()), before, 'Presentation never cleans up or rewrites engine-owned effect state');
});

test('a fired Lux beam crossing visible ground renders even when its source is outside both camera and vision', () => {
  const game = gameFor('lol_lux', 2), p = game.player;
  Object.assign(p, { x: 200, y: 1600, autoAttack: false });
  game._rebuildIndex();
  assert.equal(game.cast('r', 1200, 1600).ok, true);
  for (let i = 0; i < 40; i++) game.step(1 / 60);
  const beam = game.effects.find(entry => entry.kind === 'beam' && entry.x === 200);
  assert.ok(beam, 'The actual post-windup spell emits a beam VFX');
  assert.equal(game._restoredEffects.find(entry => entry.kind === 'lux_laser' && entry.sourceId === p.id).fired, true);
  const visible = (x, y) => x > 1450 && x < 1750 && y > 1500 && y < 1700;
  game.visibilityAt = visible;
  const { renderer, main } = rendererFor(game);
  renderer.panTo(1600, 1600);
  assert.equal(renderer._inView(beam.x, beam.y, 160), false, 'The source is outside the old origin-based culling area');
  assert.equal(visible(beam.x, beam.y), false);
  const paints = observeEffectPaint(renderer, main, beam);
  const before = JSON.stringify(game.exportState());
  renderer.render(1 / 60);
  assert.ok(paints.length, 'The visible middle/end of the fired beam still appears');
  assert.ok(paints.every(call => call.clips.length > 0), 'The visible segment is clipped to current vision');
  assert.equal(JSON.stringify(game.exportState()), before);
});

test('a beam with a visible source cannot paint its hidden destination or continue after vision is lost', () => {
  const game = gameFor('lol_lux'), p = game.player;
  Object.assign(p, { x: 740, y: 800, autoAttack: false });
  game._rebuildIndex();
  assert.equal(game.cast('r', 1300, 800).ok, true);
  const beam = game.effects.find(entry => entry.kind === 'beam' && entry.x === p.x);
  assert.ok(beam);
  const visible = (x, y) => x >= 640 && x < 800 && y >= 700 && y < 900;
  game.visibilityAt = visible;
  const { renderer, main } = rendererFor(game);
  renderer.panTo(800, 800);
  assert.equal(visible(beam.x, beam.y), true);
  assert.equal(visible(beam.x2, beam.y2), false);
  const paints = observeEffectPaint(renderer, main, beam);
  const before = JSON.stringify(game.exportState());
  renderer.render(1 / 60);
  assert.ok(paints.length);
  for (const call of paints) {
    assert.ok(call.clips.length > 0, 'A visible beam origin never bypasses the vision mask');
    for (const rect of call.clips.flat()) assert.equal(visible(rect[0] + rect[2] / 2, rect[1] + rect[3] / 2), true);
  }
  assert.equal(JSON.stringify(game.exportState()), before);
  paints.length = 0;
  game.visibilityAt = () => false;
  renderer._explored.fill(1);
  main.reset();
  renderer.render(1 / 60);
  assert.equal(paints.length, 0, 'Explored terrain does not retain a live beam after current vision is lost');
});
