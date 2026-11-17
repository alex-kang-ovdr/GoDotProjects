'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Game } = require('../dist/game.js');

// Record actual renderer output geometry. This is not a browser pixel test.
function canvas(width, height) {
  const calls = [];
  const gradient = { addColorStop() {} };
  const finite = value => {
    if (typeof value === 'number') assert.ok(Number.isFinite(value), 'finite canvas geometry');
  };
  const ctx = new Proxy({ globalAlpha: 1 }, {
    get(object, property) {
      if (property in object) return object[property];
      if (property === 'createImageData') return (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
      if (property === 'createLinearGradient' || property === 'createRadialGradient') return (...args) => { args.forEach(finite); return gradient; };
      if (property === 'measureText') return text => ({ width: String(text).length * 7 });
      return (...args) => {
        args.forEach(finite);
        if (['drawImage', 'arc', 'scale', 'rect'].includes(property)) calls.push({ method: property, args });
      };
    },
    set(object, property, value) { finite(value); object[property] = value; return true; }
  });
  return { width, height, clientWidth: width, clientHeight: height, calls,
    getContext: () => ctx, getBoundingClientRect: () => ({ width, height }) };
}

function makeRenderer(game) {
  const context = { module: { exports: {} }, console,
    OffscreenCanvas: function (width, height) { return canvas(width, height); } };
  context.globalThis = context;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../dist/renderer.js'), 'utf8'), context);
  const main = canvas(1280, 800);
  return { main, renderer: new context.module.exports.Renderer(main, game) };
}

test('all map sizes draw cached terrain across the entire world without modifying game state', () => {
  for (const mapScale of [1, 1.5, 2]) {
    const game = new Game({ mapScale, seed: 17 });
    game.start();
    const before = JSON.stringify(game.exportState());
    const { renderer, main } = makeRenderer(game);
    renderer.render(1 / 60);
    const terrain = main.calls.find(call => call.method === 'drawImage' && call.args[0] === renderer._terrain);
    assert.ok(terrain);
    assert.deepEqual(terrain.args.slice(1), [0, 0, 1600 * mapScale, 1600 * mapScale]);
    assert.ok(renderer._terrain.width <= 2048 && renderer._terrain.height <= 2048, 'bounded terrain cache');
    assert.equal(JSON.stringify(game.exportState()), before, 'rendering never changes map or simulation');
    assert.equal(renderer._river[3][0], 800 * mapScale);
    assert.equal(renderer._river[3][1], 800 * mapScale);
  }
});

test('fog samples the expanded far corner and retains explored state at the same world resolution', () => {
  for (const mapScale of [1, 1.5, 2]) {
    const side = 1600 * mapScale;
    const game = new Game({ mapScale });
    let revealed = true;
    game.visibilityAt = (x, y) => revealed && x >= side - 40 && y >= side - 40;
    const { renderer } = makeRenderer(game);
    renderer._updateFog(0.2);
    assert.equal(side / renderer._fogCols, 20);
    const last = renderer._fogCols * renderer._fogRows - 1;
    assert.equal(renderer._fogPixels.data[last * 4 + 3], 0);
    assert.equal(renderer._fogPixels.data[3], 182);
    revealed = false;
    renderer._updateFog(0.2);
    assert.equal(renderer._fogPixels.data[last * 4 + 3], 134, 'far explored corner remains remembered');
  }
});

test('minimap hero coordinates and camera conversion agree with each selected world size', () => {
  for (const mapScale of [1, 1.5, 2]) {
    const game = new Game({ mapScale });
    const { renderer } = makeRenderer(game);
    const mini = canvas(180, 180);
    renderer.drawMinimap(mini);
    const factor = 170 / game.map.width;
    const expected = { x: 5 + game.player.x * factor, y: 5 + game.player.y * factor };
    assert.ok(mini.calls.some(call => call.method === 'arc' &&
      Math.abs(call.args[0] - expected.x) < 1e-8 && Math.abs(call.args[1] - expected.y) < 1e-8), 'player icon at normalized position');
    renderer.panTo(game.map.width - 40, game.map.height - 40);
    const screen = renderer.worldToScreen(game.map.width - 70, game.map.height - 70);
    const world = renderer.screenToWorld(screen.x, screen.y);
    assert.ok(Math.abs(world.x - (game.map.width - 70)) < 1e-8);
    assert.ok(Math.abs(world.y - (game.map.height - 70)) < 1e-8);
    assert.ok(renderer._view.right <= game.map.width + 1e-8 && renderer._view.bottom <= game.map.height + 1e-8);
  }
});

test('returning from a large game to standard map replaces terrain, fog, river and camera bounds', () => {
  const large = new Game({ mapScale: 2 });
  const { renderer } = makeRenderer(large);
  const previous = renderer._terrain;
  renderer.setGame(new Game({ mapScale: 1 }));
  assert.notEqual(renderer._terrain, previous);
  assert.equal(renderer._terrain.width, 1600);
  assert.equal(renderer._fogCols, 80);
  assert.equal(renderer._map.width, 1600);
  assert.equal(renderer._river[3][0], 800);
  assert.ok(renderer._view.right <= 1600 + 1e-8);
});
