'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const GameAPI = require('../dist/game.js');
const { Game } = GameAPI;

// Records the actual Canvas call boundary, including balanced state, without
// substituting a fake Game/vision implementation. Browser layout is separate QA.
function canvas(width = 1280, height = 800) {
  const calls = [], stack = [], values = { globalAlpha: 1 };
  const finite = v => {
    if (typeof v === 'number') assert.ok(Number.isFinite(v), 'finite Canvas input');
    if (Array.isArray(v)) v.forEach(finite);
  };
  const gradient = { addColorStop(...args) { args.forEach(finite); } };
  const ctx = new Proxy(values, {
    get(object, prop) {
      if (prop in object) return object[prop];
      if (prop === 'measureText') return text => ({ width: String(text).length * 7 });
      if (prop === 'createImageData') return (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
      return (...args) => {
        args.forEach(finite);
        if (prop === 'save') stack.push({ ...values });
        if (prop === 'restore') {
          assert.ok(stack.length > 0, 'restore requires a matching save');
          const saved = stack.pop();
          for (const key of Object.keys(values)) delete values[key];
          Object.assign(values, saved);
        }
        calls.push({ method: prop, args: args.slice() });
        return prop === 'createLinearGradient' || prop === 'createRadialGradient' ? gradient : undefined;
      };
    },
    set(object, prop, value) { finite(value); object[prop] = value; return true; }
  });
  return { width, height, clientWidth: width, clientHeight: height, ctx, calls,
    getContext: () => ctx, getBoundingClientRect: () => ({ width, height }),
    reset() { assert.equal(stack.length, 0, 'balanced Canvas save/restore'); calls.length = 0; },
    balanced() { assert.equal(stack.length, 0, 'balanced Canvas save/restore'); },
    signature() { return JSON.stringify(calls.map(c => [c.method, c.args.map(v => typeof v === 'object' && v !== null ? '[surface]' : v)])); }
  };
}

const sandbox = { module: { exports: {} }, NexusGame: GameAPI,
  OffscreenCanvas: function (w, h) { return canvas(w, h); } };
sandbox.globalThis = sandbox;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../dist/renderer.js'), 'utf8'), sandbox);
const { Renderer } = sandbox.module.exports;

function makeRenderer(g) {
  const main = canvas(), mini = canvas(180, 180), renderer = new Renderer(main, g);
  main.reset();
  return { renderer, main, mini };
}
function fresh() { const g = new Game({ hero: 'lol_ahri', seed: 932, mapScale: 2 }); g.start(); return g; }
function observe(g, target) { Object.assign(g.player, { x: target.x - 35, y: target.y, autoAttack: false }); g._rebuildIndex(); g._updateVision(true); }
function leave(g) { Object.assign(g.player, g.map.bases[0]); g._rebuildIndex(); g._updateVision(true); }

test('never-explored enemy buildings do not enter render or minimap memory', () => {
  const g = fresh(), { renderer, main, mini } = makeRenderer(g);
  const target = g.entities.find(e => e.type === 'inhibitor' && e.team === 1);
  assert.equal(g.isVisible(target, 0), false);
  renderer.panTo(target.x, target.y);
  const structures = [], draw = renderer._drawStructure;
  renderer._drawStructure = function (ctx, e, memory) { structures.push(e.id); return draw.call(this, ctx, e, memory); };
  renderer.render(1 / 60); renderer.drawMinimap(mini);
  assert.equal(renderer._memory.has(target.id), false);
  assert.equal(structures.includes(target.id), false);
  main.balanced(); mini.balanced();
});

test('hidden building health and destruction retain the last render and minimap observation', () => {
  const g = fresh(), target = g.entities.find(e => e.type === 'inhibitor' && e.team === 1);
  observe(g, target); assert.equal(g.isVisible(target, 0), true);
  const rememberedHp = target.hp; leave(g); assert.equal(g.isVisible(target, 0), false);
  const { renderer, main, mini } = makeRenderer(g);
  renderer.panTo(target.x, target.y);
  let drawing = null; const draw = renderer._drawStructure;
  renderer._drawStructure = function (ctx, e, memory) { if (e.id === target.id) drawing = { hp: e.hp, alive: e.alive, memory }; return draw.call(this, ctx, e, memory); };
  renderer.render(1 / 60); renderer.drawMinimap(mini); const beforeMini = mini.signature();
  assert.deepEqual(drawing, { hp: rememberedHp, alive: true, memory: true });
  for (const state of [{ hp: rememberedHp / 2, alive: true }, { hp: 0, alive: false }]) {
    Object.assign(target, state); g.time += 0.2; g._updateVision(true);
    main.reset(); mini.reset(); renderer.render(1 / 60); renderer.drawMinimap(mini);
    assert.deepEqual(drawing, { hp: rememberedHp, alive: true, memory: true });
    assert.equal(renderer._memory.get(target.id).hp, rememberedHp);
    assert.equal(mini.signature(), beforeMini, 'hidden state cannot change a minimap icon');
  }
  main.balanced(); mini.balanced();
});

test('observing a removed slot clears its minimap icon and an unseen rebuilt actor remains absent until reobserved', () => {
  const g = fresh(), target = g.entities.find(e => e.type === 'inhibitor' && e.team === 1);
  observe(g, target); leave(g);
  const { renderer, main, mini } = makeRenderer(g); renderer.panTo(target.x, target.y);
  renderer.render(1 / 60); renderer.drawMinimap(mini); const aliveMini = mini.signature();
  g.entities = g.entities.filter(e => e.id !== target.id); g._rebuildIndex(); g._updateVision(true);
  main.reset(); mini.reset(); renderer.render(1 / 60); renderer.drawMinimap(mini);
  assert.equal(renderer._memory.get(target.id).alive, true);
  assert.equal(mini.signature(), aliveMini, 'unseen actor removal does not erase its remembered silhouette');
  observe(g, target);
  main.reset(); mini.reset(); renderer.render(1 / 60); renderer.drawMinimap(mini);
  assert.equal(renderer._memory.get(target.id).alive, false);
  assert.equal(renderer._memory.get(target.id).hp, 0);
  leave(g); main.reset(); mini.reset(); renderer.render(1 / 60); renderer.drawMinimap(mini); const deadMini = mini.signature();
  assert.notEqual(deadMini, aliveMini, 'observed empty slot removes the old live icon');
  target.hp = target.maxHp; target.alive = true; g.entities.push(target); g._rebuildIndex(); g._updateVision(true);
  main.reset(); mini.reset(); renderer.render(1 / 60); renderer.drawMinimap(mini);
  assert.equal(renderer._memory.get(target.id).alive, false);
  assert.equal(mini.signature(), deadMini, 'unseen rebuild is not silently promoted to alive');
  observe(g, target); main.reset(); mini.reset(); renderer.render(1 / 60); renderer.drawMinimap(mini);
  assert.equal(renderer._memory.get(target.id).alive, true);
  assert.equal(renderer._memory.get(target.id).hp, target.maxHp);
  assert.equal(renderer._memory.get(target.id).remembered, false);
  main.balanced(); mini.balanced();
});

test('active and paused getters and renderer passes preserve the entire exported match state', () => {
  const g = fresh(), target = g.entities.find(e => e.type === 'inhibitor' && e.team === 1);
  observe(g, target); leave(g);
  const enemy = g.entities.find(e => e.type === 'hero' && e.team === 1);
  g.damage(g.player, 10, enemy, 'physical', { x: enemy.x, y: enemy.y });
  const { renderer, main, mini } = makeRenderer(g);
  for (const paused of [false, true]) {
    g.paused = paused;
    const before = JSON.stringify(g.exportState());
    for (let i = 0; i < 3; i++) {
      g.getStructureObservations(0); g.getAttackOriginReveals(0); g.getVisionMask(0);
      for (const camp of g.map.camps) g.getObjectiveObservation(camp.id, 0);
      g.getBasicAttackPreview(enemy);
      renderer.render(1 / 60); renderer.drawMinimap(mini);
    }
    assert.equal(JSON.stringify(g.exportState()), before);
    main.reset(); mini.reset();
  }
});

test('authoritative fog masks avoid renderer LOS resampling and skip image uploads while revision stays fixed', () => {
  const g = fresh(), { renderer } = makeRenderer(g);
  let queries = 0; const original = g.visibilityAt.bind(g);
  g.visibilityAt = (...args) => { queries++; return original(...args); };
  renderer._updateFog(0.2);
  assert.equal(queries, 0, 'authoritative mask replaces per-cell renderer queries');
  const ctx = renderer._fogCtx, calls = renderer._fog.calls;
  const uploads = () => calls.filter(c => c.method === 'putImageData').length;
  const before = uploads(), revision = g.getVisionMask(0).revision;
  const metrics = { ...g._visionSystem.metrics };
  for (let i = 0; i < 10; i++) renderer._updateFog(0.2);
  assert.equal(queries, 0); assert.equal(uploads(), before);
  assert.equal(g.getVisionMask(0).revision, revision);
  assert.deepEqual(g._visionSystem.metrics, metrics);
  assert.ok(ctx);
  g._updateVision(true); renderer._updateFog(0.2);
  assert.equal(uploads(), before + 1, 'a changed engine revision uploads exactly one new mask');
});

test('high-ground, remembered-health and fixed-origin layers balance Canvas state and never identify the hidden attacker', () => {
  const g = fresh(), enemy = g.entities.find(e => e.type === 'hero' && e.team === 1);
  const origin = { x: enemy.x, y: enemy.y };
  assert.equal(g.isVisible(enemy, 0), false);
  g.damage(g.player, 10, enemy, 'physical', origin);
  const cues = g.getAttackOriginReveals(0); assert.equal(cues.length, 1);
  assert.equal(cues[0].sourceId, undefined);
  enemy.x -= 150; enemy.y += 100; g._rebuildIndex();
  assert.equal(g.isVisible(enemy, 0), false);
  const { renderer, main, mini } = makeRenderer(g); renderer.panTo(origin.x, origin.y);
  const drawnHeroes = [], drawHero = renderer._drawHero;
  renderer._drawHero = function (ctx, hero, player) { drawnHeroes.push(hero.id); return drawHero.call(this, ctx, hero, player); };
  renderer._drawHighGround(main.ctx); renderer._drawAttackOrigins(main.ctx); renderer._drawStructureMemoryHealth(main.ctx);
  main.balanced();
  assert.ok(main.calls.some(c => c.method === 'fillText' && c.args[0] === '공격 발생 위치'));
  assert.ok(main.calls.some(c => c.method === 'arc' && c.args[0] === origin.x && c.args[1] === origin.y));
  renderer.render(1 / 60); renderer.drawMinimap(mini);
  assert.equal(drawnHeroes.includes(enemy.id), false);
  assert.equal(g.isVisible(enemy, 0), false);
  assert.equal(g.getAttackOriginReveals(0)[0].x, origin.x);
  assert.equal(g.getAttackOriginReveals(0)[0].y, origin.y);
  main.balanced(); mini.balanced();
});
