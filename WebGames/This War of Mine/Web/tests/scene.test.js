import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderer } from '../dist/scene.js';
import { createGame } from '../dist/engine.js';
import { createExpedition, getEncounter, resolveEncounter } from '../dist/expedition.js';

// Canvas raster output is checked separately with native Canvas PNGs. This
// dependency-free harness exercises the production renderer's input contract,
// visibility gates and ownership of state in the regular Node test suite.
function context(trace = null) {
  const properties = { font: '12px sans-serif' };
  return new Proxy(properties, {
    get(object, key) {
      if (key in object) return object[key];
      if (key === 'measureText') return text => ({ width: String(text).length * 7 });
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return (...args) => {
        trace?.push([key, ...args]);
        return { addColorStop(...stops) { trace?.push(['colorStop', ...stops]); } };
      };
      return (...args) => trace?.push([key, ...args.map(value => typeof value === 'object' ? '[surface]' : value)]);
    },
    set(object, key, value) { object[key] = value; trace?.push(['set', key, typeof value === 'object' ? '[gradient]' : value]); return true; },
  });
}

function fixture(location = null, width = 1280, height = 720, dpr = 1) {
  const previousWindow = globalThis.window, previousOffscreen = globalThis.OffscreenCanvas;
  const counters = { surfaces: 0, layoutReads: 0 };
  globalThis.OffscreenCanvas = class {
    constructor(w, h) { this.width = w; this.height = h; this.ctx = context(); counters.surfaces++; }
    getContext() { return this.ctx; }
  };
  const windowEvents = new Map();
  globalThis.window = { devicePixelRatio: dpr, addEventListener: (key, fn) => windowEvents.set(key, fn), removeEventListener: key => windowEvents.delete(key) };
  const events = new Map(), calls = [], ctx = context(calls);
  const canvas = {
    width, height, style: {}, getContext: () => ctx,
    getBoundingClientRect() { counters.layoutReads++; return { left: 17, top: 23, width, height }; },
    addEventListener: (key, fn) => events.set(key, fn), removeEventListener: key => events.delete(key),
  };
  const scale = Math.min(width / 1280, height / 720);
  const client = (x, y) => [17 + (width - 1280 * scale) / 2 + x * scale, 23 + (height - 720 * scale) / 2 + y * scale];
  const state = createGame(3741);
  let exp = null;
  if (location) {
    state.nightPlan = { scavengerId: 'mira', locationId: location, loadout: {} };
    exp = createExpedition({}, state);
  }
  const renderer = createRenderer(canvas);
  return {
    state, exp, canvas, events, windowEvents, counters, renderer, client, calls,
    render(time = 1000, options = {}) { calls.length = 0; renderer.render({ state, expedition: exp, selectedId: state.selectedId, time, ...options }); },
    hit(x, y) { return renderer.hitTest(...client(x, y)); },
    cleanup() {
      renderer.destroy();
      if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
      if (previousOffscreen === undefined) delete globalThis.OffscreenCanvas; else globalThis.OffscreenCanvas = previousOffscreen;
    },
  };
}

function freezeTree(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  for (const child of Object.values(value)) freezeTree(child, seen);
  Object.freeze(value);
}

test('only a currently visible eligible resident becomes an npc interaction target', () => {
  const f = fixture('clinic');
  try {
    const npc = f.exp.npcs[0];
    f.exp.player.x = 940; f.exp.player.floor = 1;
    assert.ok(getEncounter(f.exp, npc.id));
    f.render(); assert.deepEqual(f.hit(npc.x, 380), { type: 'npc', id: npc.id, x: npc.x, floor: npc.floor });
    npc.hostile = true;
    f.render(); assert.notEqual(f.hit(npc.x, 380)?.type, 'npc');
    npc.hostile = false; f.exp.player.x = npc.x - 190;
    f.exp.doors.find(door => door.floor === 1).open = true;
    assert.equal(getEncounter(f.exp, npc.id), null);
    f.render(); assert.notEqual(f.hit(npc.x, 380)?.type, 'npc');
    f.exp.player.x = 850; f.exp.doors.find(door => door.floor === 1).open = false;
    f.render(); assert.notEqual(f.hit(npc.x, 380)?.type, 'npc', 'a resident behind a closed door cannot be selected');
  } finally { f.cleanup(); }
});

test('a resident remains selectable to review a persistent agreement', () => {
  const f = fixture('clinic');
  try {
    const npc = f.exp.npcs[0]; f.exp.player.x = 940; f.exp.player.floor = 1;
    assert.equal(resolveEncounter(f.exp, npc.id, 'request').ok, true);
    assert.equal(getEncounter(f.exp, npc.id).permission.area, true);
    f.render(); assert.equal(f.hit(npc.x, 380).id, npc.id);
    const point = f.client(npc.x, 380); f.events.get('pointermove')({ clientX: point[0], clientY: point[1] });
    const before = JSON.stringify(f.exp); f.render(1016); assert.equal(JSON.stringify(f.exp), before);
  } finally { f.cleanup(); }
});

test('combat feedback and dialogue queries render deeply frozen game data', () => {
  const f = fixture('warehouse');
  try {
    f.exp.player.x = 930; f.exp.player.floor = 0; f.exp.player.stamina = 72;
    f.exp.player.dodge = { direction: -1, remaining: 0.2, total: 0.26 };
    f.exp.player.evade = 0.12; f.exp.player.dodgeCooldown = 2.3;
    f.exp.doors.find(door => door.floor === 0).open = true;
    f.exp.npcs[0].windup = 0.4; f.exp.npcs[0].state = 'attack';
    const before = JSON.stringify({ state: f.state, exp: f.exp });
    freezeTree(f.state); freezeTree(f.exp);
    f.render(); f.render(1016);
    assert.equal(JSON.stringify({ state: f.state, exp: f.exp }), before);
  } finally { f.cleanup(); }
});

test('shelter wear is dynamic and preserves existing character/facility selection', () => {
  const f = fixture();
  try {
    f.state.facilities.barricade = 2;
    f.render(); const afterWarmup = f.counters.surfaces; f.counters.layoutReads = 0;
    for (const integrity of [75, 30, 0, 100]) { f.state.shelterIntegrity = integrity; f.render(1100 + integrity); }
    assert.equal(f.counters.surfaces, afterWarmup, 'changing integrity must not rebuild the static building');
    assert.equal(f.counters.layoutReads, 0, 'regular frames do not measure DOM layout');
    assert.equal(f.hit(120, 580).id, 'door'); assert.equal(f.hit(485, 380).id, 'mira');
    assert.equal(f.hit(1190, 435).floor, 0); assert.equal(f.hit(1190, 245).floor, 1); assert.equal(f.hit(1190, 80).floor, 2);
  } finally { f.cleanup(); }
});

test('resident hit targets respect phone DPR/letterboxing and destroy releases events', () => {
  const f = fixture('clinic', 360, 225, 2);
  try {
    const npc = f.exp.npcs[0]; f.exp.player.x = 940; f.exp.player.floor = 1;
    f.render(); assert.equal(f.canvas.width, 720); assert.equal(f.canvas.height, 450);
    assert.equal(f.hit(npc.x, 380).id, npc.id);
    assert.equal(f.renderer.hitTest(100, 24), null);
    f.renderer.destroy(); assert.equal(f.events.size, 0); assert.equal(f.windowEvents.size, 0);
    assert.equal(f.hit(npc.x, 380), null);
  } finally { f.cleanup(); }
});

test('worldPoint preserves the selected position and floor across entities, phone scaling and letterboxing', () => {
  for (const [width, height, dpr] of [[1280, 720, 1], [360, 225, 2]]) {
    const f = fixture('cottage', width, height, dpr);
    try {
      f.render();
      assert.equal(f.hit(225, 580).type, 'loot');
      assert.deepEqual(f.renderer.worldPoint(...f.client(225, 580)), { x: 225, y: 580, floor: 0 });
      assert.deepEqual(f.renderer.worldPoint(...f.client(455, 245)), { x: 455, y: 245, floor: 1 });
      assert.deepEqual(f.renderer.worldPoint(...f.client(900, 100)), { x: 900, y: 100, floor: 2 });
      assert.equal(f.renderer.worldPoint(...f.client(500, 680)), null, 'informational map is not a throw target');
      assert.equal(f.renderer.worldPoint(16, 22), null);
      f.renderer.destroy(); assert.equal(f.renderer.worldPoint(...f.client(225, 580)), null);
    } finally { f.cleanup(); }
  }
});

test('radio and evacuation state is read-only dynamic artwork with stable background caches', () => {
  const f = fixture();
  try {
    f.render(); const afterWarmup = f.counters.surfaces;
    f.state.facilities.radio = 1;
    f.state.relief = { contacted: true, contactDay: 4, deliveryDay: 5, delivered: true, prepared: true, preparedDay: 9 };
    f.state.day = 9; f.render();
    assert.equal(f.counters.surfaces, afterWarmup, 'a warm day with new equipment reuses the structure');
    assert.equal(f.hit(980, 395).id, 'radio');
    assert.ok(f.calls.some(call => call[0] === 'fillText' && call[1] === '구호 연락망'));
    assert.ok(f.calls.some(call => call[0] === 'fillText' && call[1] === '대피 준비 완료'));
    const before = JSON.stringify(f.state); freezeTree(f.state);
    f.counters.layoutReads = 0;
    f.render(1200); f.render(1216);
    assert.equal(JSON.stringify(f.state), before);
    assert.equal(f.counters.surfaces, afterWarmup);
    assert.equal(f.counters.layoutReads, 0);
  } finally { f.cleanup(); }
});

test('the entire visible minimap blocks movement and throwing while a hidden map preserves ground picking', () => {
  const f = fixture('cottage');
  try {
    f.render();
    for (const y of [631, 632, 633, 680]) {
      assert.equal(f.hit(500, y), null);
      assert.equal(f.renderer.worldPoint(...f.client(500, y)), null);
    }
    f.render(1000, { miniMap: false });
    assert.equal(f.hit(500, 632).type, 'ground');
    assert.deepEqual(f.renderer.worldPoint(...f.client(500, 632)), { x: 500, y: 632, floor: 0 });
  } finally { f.cleanup(); }
});

test('minimap and distraction effects never draw hidden people or another-floor sound', () => {
  const f = fixture('warehouse');
  try {
    f.render(); f.render(); const baseline = structuredClone(f.calls);
    f.exp.distraction = { x: 1100, floor: 2, remaining: 2, total: 2.5 };
    for (const npc of f.exp.npcs) { npc.windup = 0.5; npc.state = 'attack'; npc.health = 10; }
    f.render(); assert.deepEqual(f.calls, baseline, 'hidden combat and sound do not change a single draw command');
    f.exp.npcs = [];
    f.render(); assert.deepEqual(f.calls, baseline, 'hidden people leave no map dots or warning marks');
  } finally { f.cleanup(); }
});

test('aiming suppresses hidden targets and accepts frozen state without frame layout reads', () => {
  const f = fixture('warehouse');
  try {
    f.exp.bag.parts = 2;
    f.render(1000, { distractionAim: true, aimTarget: { x: 990, floor: 2 } });
    f.render(1000, { distractionAim: true, aimTarget: { x: 990, floor: 2 } });
    const hidden = structuredClone(f.calls);
    f.render(1000, { distractionAim: true, aimTarget: { x: 1100, floor: 2 } });
    assert.deepEqual(f.calls, hidden, 'different unseen targets cannot reveal different shapes');
    const before = JSON.stringify({ state: f.state, exp: f.exp });
    freezeTree(f.state); freezeTree(f.exp); f.counters.layoutReads = 0;
    f.render(1000, { distractionAim: true, aimTarget: { x: 300, floor: 0 }, reducedMotion: true });
    const first = structuredClone(f.calls);
    f.render(1200, { distractionAim: true, aimTarget: { x: 300, floor: 0 }, reducedMotion: true });
    assert.deepEqual(f.calls, first, 'reduced motion keeps cosmetic pulses and rain still');
    assert.equal(JSON.stringify({ state: f.state, exp: f.exp }), before);
    assert.equal(f.counters.layoutReads, 0);
  } finally { f.cleanup(); }
});
