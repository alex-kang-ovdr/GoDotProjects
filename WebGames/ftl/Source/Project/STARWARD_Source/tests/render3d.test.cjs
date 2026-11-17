'use strict';

// The WebGL driver and Canvas2D paint methods are mocked; production geometry,
// camera, software triangle depth selection and pointer routing execute normally.
// Actual rasterized appearance still requires the real browser visual check.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
let clock = 0;
const context = vm.createContext({ console: { ...console, warn() {} }, setTimeout, devicePixelRatio: 1, performance: { now: () => clock } });
for (const file of ['data.js', 'engine.js', 'campaign.js', 'render3d.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../dist', file), 'utf8'), context, { filename: file });
}
const Game = context.Starward.Game, rendererModule = context.Starward3D;

function surface() {
  const calls = { draws: 0, uploads: 0, resources: 0, disposed: 0, pickId: 0 };
  const constants = { MAX_RENDERBUFFER_SIZE: 1, MAX_VERTEX_ATTRIBS: 2, COMPILE_STATUS: 3,
    LINK_STATUS: 4, FRAMEBUFFER_COMPLETE: 5, ARRAY_BUFFER: 6, TRIANGLES: 7, LINES: 8 };
  const gl = new Proxy({
    getParameter: p => p === 1 ? 4096 : p === 2 ? 8 : 0,
    getShaderParameter: () => true, getProgramParameter: () => true,
    getAttribLocation: (p, name) => ({ aPosition: 0, aNormal: 1, aColor: 2, aEmissive: 3, aPickColor: 4 })[name] ?? -1,
    getUniformLocation: (p, name) => name, checkFramebufferStatus: () => 5,
    bufferSubData: (target, offset, data) => { assert.ok(data.every(Number.isFinite), 'all mesh vertices must be finite'); calls.uploads++; },
    drawArrays: (mode, start, count) => { assert.ok(count > 0); calls.draws++; },
    readPixels: (x, y, w, h, format, type, out) => {
      out.set([calls.pickId & 255, (calls.pickId >> 8) & 255, (calls.pickId >> 16) & 255, 255]);
    }
  }, {
    get(target, key) {
      if (key in target) return target[key];
      if (key in constants) return constants[key];
      if (/^[A-Z_0-9]+$/.test(key)) return constants[key] = Object.keys(constants).length + 10;
      if (String(key).startsWith('create')) return () => ({ id: ++calls.resources });
      if (String(key).startsWith('delete')) return () => calls.disposed++;
      return () => {};
    }
  });
  const listeners = new Map(), picks = [], unavailable = [];
  const rect = { left: 10, top: 20, width: 1100, height: 580 };
  const canvas = { style: {}, width: 0, height: 0, tabIndex: -1, getContext: () => gl,
    hasAttribute: () => false, getBoundingClientRect: () => rect,
    addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name),
    setPointerCapture: () => {} };
  const renderer = rendererModule.create({ canvas, onPick: p => picks.push(p), onUnavailable: m => unavailable.push(m) });
  return { renderer, canvas, calls, listeners, picks, unavailable, rect };
}
function assertReadOnlyRender(renderer, game, ui) {
  clock += 50;
  const before = game.serialize();
  assert.equal(renderer.render(game, ui), true, renderer.reason);
  assert.equal(game.serialize(), before, 'render cannot change simulation, RNG, resources or commands');
}

function softwareSurface() {
  const listeners = new Map(), picks = [], unavailable = [], calls = { fills: 0, strokes: 0 };
  const rect = { left: 10, top: 20, width: 1100, height: 580 };
  const paint = { setTransform() {}, fillRect() {}, beginPath() {}, closePath() {}, moveTo(x,y) { assert.ok(Number.isFinite(x) && Number.isFinite(y)); },
    lineTo(x,y) { assert.ok(Number.isFinite(x) && Number.isFinite(y)); }, fill() { calls.fills++; }, stroke() { calls.strokes++; } };
  const canvas = { style: {}, width: 0, height: 0, getContext: type => type === '2d' ? paint : null,
    hasAttribute: () => false, getBoundingClientRect: () => rect,
    addEventListener: (name,fn) => listeners.set(name,fn), removeEventListener: name => listeners.delete(name), setPointerCapture() {} };
  const renderer = rendererModule.create({ canvas, onPick: p => picks.push(p), onUnavailable: m => unavailable.push(m) });
  return { renderer, canvas, paint, rect, listeners, picks, unavailable, calls };
}

for (const loadoutId of ['argo', 'atlas', 'wraith']) {
  test('3D read-only geometry and automatic framing: ' + loadoutId, () => {
    const { renderer, unavailable } = surface();
    const game = new Game(42, { loadoutId, difficulty: 'standard' });
    for (const visualStyle of ['stellar', 'lowpoly', 'blueprint']) {
      assertReadOnlyRender(renderer, game, { visualStyle, selectedCrewIds: [game.state.player.crew[0].id], selectedSlotId: 'bay4' });
      for (const room of game.state.player.rooms) {
        assert.ok(renderer.project('player', room.x + room.w / 2, room.y + room.h / 2)?.visible, room.id + ' stays in frame');
      }
    }
    game.startCombat({ name: '검증 표적', hull: 25, maxHull: 25, enemy: true, layoutId: 'interceptor_v7',
      weaponDefs: ['burst_laser'], crewTypes: ['human', 'mantis'], shieldLayers: 1 });
    game.targetWeapon(game.state.player.weapons[0].id, 'weapons');
    game.setPaused(false);
    for (let step = 0; step < 180; step++) game.tick(1 / 30);
    game.setPaused(true);
    assertReadOnlyRender(renderer, game, { visualStyle: 'stellar', selectedCrewIds: [], selectedWeapon: game.state.player.weapons[0].id });
    for (const side of ['player', 'enemy']) for (const room of game.state[side].rooms) {
      assert.ok(renderer.project(side, room.x + .5, room.y + .5)?.visible, side + '/' + room.id + ' stays in frame');
    }
    assert.equal(unavailable.length, 0);
    renderer.destroy();
  });
}

test('3D picking reports actual tile integers, physical ship, door and crew IDs', () => {
  const { renderer, calls } = surface(), game = new Game(42);
  game.startCombat({ name: '검증 표적', hull: 20, enemy: true, layoutId: 'interceptor_v7', weaponDefs: ['burst_laser'], crewCount: 2 });
  assertReadOnlyRender(renderer, game, {});
  for (const kind of ['tile', 'crew', 'door']) for (const shipId of ['player', 'enemy']) {
    calls.pickId = renderer.pickTable.findIndex(p => p?.kind === kind && p.shipId === shipId);
    assert.ok(calls.pickId > 0);
    const result = renderer.pick(200, 200);
    assert.equal(result.kind, kind); assert.equal(result.shipId, shipId);
    assert.ok(Number.isInteger(result.tileX) && Number.isInteger(result.tileY));
    if (kind === 'tile') assert.ok(game.getShipTiles(shipId).some(tile => tile.tileX === result.tileX && tile.tileY === result.tileY && tile.roomId === result.roomId));
    if (kind === 'crew') assert.ok(game.getCrewOnShip(shipId).some(crew => crew.id === result.crewId));
    if (kind === 'door') assert.ok(game.state[shipId].doors.some(door => door.id === result.doorId));
  }
  assert.equal(renderer.pick(-20, -20), null);
  renderer.destroy();
});

test('camera drag, wheel and reset do not issue a command or mutate game state', () => {
  const { renderer, calls, listeners, picks } = surface(), game = new Game(42);
  renderer.render(game, {}); const before = game.serialize();
  calls.pickId = renderer.pickTable.findIndex(p => p?.kind === 'crew');
  const pointer = { button: 0, pointerId: 1, clientX: 100, clientY: 100, preventDefault() {} };
  listeners.get('pointerdown')(pointer);
  listeners.get('pointermove')({ ...pointer, clientX: 160 });
  listeners.get('pointerup')({ ...pointer, clientX: 160 });
  assert.equal(picks.length, 0, 'rotation cannot issue a move or attack');
  listeners.get('wheel')({ deltaY: 120, preventDefault() {} });
  renderer.resetCamera(); assertReadOnlyRender(renderer, game, {});
  assert.equal(game.serialize(), before);
  listeners.get('pointerdown')(pointer); listeners.get('pointerup')({ ...pointer, shiftKey: true });
  assert.equal(picks.length, 1); assert.equal(picks[0].kind, 'crew'); assert.equal(picks[0].shiftKey, true);
  renderer.destroy();
});

test('resize replaces GPU targets; destroy releases resources and input listeners', () => {
  const { renderer, calls, rect, canvas, listeners } = surface(), game = new Game(42);
  renderer.render(game, {}); const original = calls.resources;
  for (let index = 0; index < 4; index++) renderer.render(game, {});
  assert.equal(calls.resources, original, 'ordinary frames do not allocate GPU objects');
  rect.width = 900; rect.height = 500; renderer.resize();
  assert.equal(canvas.width, 900); assert.equal(canvas.height, 500);
  assert.ok(calls.disposed >= 3, 'old framebuffer, texture and depth target released');
  renderer.destroy(); assert.equal(renderer.supported, false); assert.equal(listeners.size, 0);
  const count = calls.disposed; renderer.destroy(); assert.equal(calls.disposed, count, 'destroy is idempotent');
});

test('context failure and loss request fallback once and preserve the voyage', () => {
  const messages = [];
  const missing = rendererModule.create({ canvas: { getContext: () => null }, onUnavailable: message => messages.push(message) });
  assert.equal(missing.supported, false); assert.equal(messages.length, 1);
  const { renderer, listeners, unavailable } = surface(), game = new Game(42);
  renderer.render(game, {}); const before = game.serialize();
  listeners.get('webglcontextlost')({ preventDefault() {} });
  listeners.get('webglcontextlost')({ preventDefault() {} });
  assert.equal(renderer.supported, false); assert.equal(unavailable.length, 1);
  assert.equal(renderer.render(game, {}), false); assert.equal(game.serialize(), before);
  listeners.get('webglcontextrestored')(); assert.equal(renderer.supported, true);
  assertReadOnlyRender(renderer, game, {}); renderer.destroy();
});

test('GPU-free Canvas2D keeps genuine 3D geometry, all themes and read-only combat', () => {
  const { renderer, unavailable, calls } = softwareSurface();
  assert.equal(renderer.supported, true); assert.equal(renderer.backend, 'software');
  for (const loadoutId of ['argo', 'atlas', 'wraith']) {
    const game = new Game(42, { loadoutId, difficulty: 'standard' });
    game.startCombat({ name: '3D 표적', hull: 25, enemy: true, layoutId: 'interceptor_v7', weaponDefs: ['burst_laser'], crewCount: 2 });
    for (const visualStyle of ['stellar', 'lowpoly', 'blueprint']) {
      assertReadOnlyRender(renderer, game, { visualStyle, selectedCrewIds: [game.state.player.crew[0].id] });
      assert.ok(renderer.softwareFaces.length > 200, 'actual projected facets, not flattened room rectangles');
      for (const side of ['player','enemy']) {
        const room = game.state[side].rooms.at(-1);
        assert.ok(renderer.project(side, room.x + .5, room.y + .5)?.visible);
      }
    }
  }
  assert.ok(calls.fills > 1000 && calls.strokes > 0); assert.equal(unavailable.length, 0);
  renderer.destroy();
});

test('software depth picking selects actual floor and raised crew after camera rotation', () => {
  const { renderer, rect } = softwareSurface(), game = new Game(42), hero = game.state.player.crew[0];
  for (const yaw of [-.22, .6]) {
    renderer.yaw = yaw; assertReadOnlyRender(renderer, game, {});
    const tile = game.getShipTiles('player').find(t => t.roomId === 'bay4' && t.tileX === 0 && t.tileY === 7);
    const floor = renderer.project('player', tile.x, tile.y);
    const tilePick = renderer.pick(rect.left + floor.x, rect.top + floor.y);
    assert.equal(tilePick?.kind, 'tile'); assert.equal(tilePick.tileX, tile.tileX); assert.equal(tilePick.tileY, tile.tileY);
    const torso = renderer.project('player', hero.x, hero.y, .75);
    const crewPick = renderer.pick(rect.left + torso.x, rect.top + torso.y);
    assert.equal(crewPick?.kind, 'crew'); assert.equal(crewPick.crewId, hero.id, 'nearest raised geometry wins over the floor behind it');
  }
  renderer.destroy();
});

test('software camera gestures preserve commands and render cap does not advance the simulation', () => {
  const { renderer, rect, listeners, picks } = softwareSurface(), game = new Game(42);
  assertReadOnlyRender(renderer, game, {}); const before = game.serialize(), frame = renderer.frames;
  renderer.render(game, {}); assert.equal(renderer.frames, frame, 'same-time RAF is capped without a tick');
  const hero=game.state.player.crew[0],p=renderer.project('player',hero.x,hero.y,.75);
  const event={button:0,pointerId:1,clientX:rect.left+p.x,clientY:rect.top+p.y,preventDefault(){}};
  listeners.get('pointerdown')(event);listeners.get('pointermove')({...event,clientX:event.clientX+25});listeners.get('pointerup')({...event,clientX:event.clientX+25});
  assert.equal(picks.length,0);renderer.resetCamera();assertReadOnlyRender(renderer,game,{});
  listeners.get('pointerdown')(event);listeners.get('pointerup')(event);assert.equal(picks.length,1);assert.equal(picks[0].crewId,hero.id);
  assert.equal(game.serialize(),before);renderer.destroy();
});

test('paused software frames cache values and repaint immediately after commands and mutable UI changes', () => {
  const { renderer, rect, calls } = softwareSurface(), game = new Game(42);
  const ui = { visualStyle: 'blueprint', selectedCrewIds: [] };
  assertReadOnlyRender(renderer, game, ui);
  const frame = renderer.frames, fills = calls.fills, snapshot = game.serialize();
  for (let index = 0; index < 120; index++) { clock += 16; renderer.render(game, ui); }
  assert.equal(renderer.frames, frame, 'unchanged paused scene must not regenerate or repaint');
  assert.equal(calls.fills, fills); assert.equal(game.serialize(), snapshot);
  assert.equal(game.allocatePower('engines', -1), true);
  let expected = renderer.frames + 1;
  renderer.render(game, ui); assert.equal(renderer.frames, expected, 'paused command bypasses the frame cap');
  ui.selectedCrewIds.push(game.state.player.crew[0].id);
  renderer.render(game, ui); assert.equal(renderer.frames, ++expected, 'mutating the same selection array repaints');
  renderer.yaw += .1; renderer.render(game, ui); assert.equal(renderer.frames, ++expected, 'camera paints at the same timestamp');
  ui.visualStyle = 'lowpoly'; renderer.render(game, ui); assert.equal(renderer.frames, ++expected, 'style paints immediately');
  rect.width = 1000; renderer.render(game, ui); assert.equal(renderer.frames, ++expected, 'resize paints immediately');
  renderer.destroy();
});

test('running software frame limit leaves simulation timing alone and interactive changes stay immediate', () => {
  const { renderer } = softwareSurface(), game = new Game(42), ui = { selectedCrewIds: [] };
  game.startCombat({ name: '표적', hull: 25, enemy: true, layoutId: 'interceptor_v7', weaponDefs: ['burst_laser'], crewCount: 2 });
  game.setPaused(false); assertReadOnlyRender(renderer, game, ui);
  let frame = renderer.frames;
  clock += 20; game.tick(1 / 30); const afterTick = game.serialize(); renderer.render(game, ui);
  assert.equal(renderer.frames, frame, 'ordinary running frame waits for the 18 fps budget');
  assert.equal(game.serialize(), afterTick, 'renderer never adds or removes simulation ticks');
  renderer.yaw += .1; renderer.render(game, ui); assert.equal(renderer.frames, ++frame, 'camera ignores the running frame limit');
  clock += 60; renderer.render(game, ui); assert.equal(renderer.frames, ++frame);
  game.setPaused(true); renderer.render(game, ui); assert.equal(renderer.frames, ++frame, 'pause transition paints immediately');
  renderer.destroy();
});
