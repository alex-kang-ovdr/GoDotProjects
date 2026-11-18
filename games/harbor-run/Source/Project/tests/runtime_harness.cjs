'use strict';
/* Node VM harness for the ACTUAL game sources.
 * Real: HM math, world/collision, motion, model/muzzle math, input handlers,
 *       main game, v4 adapters, mission, perception, save validation.
 * Stubbed: DOM storage/layout, drawing commands, audio output, RAF scheduling.
 * This is not a browser, WebGL, visual, native-input or persistence test.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '..');

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...values) { values.forEach(value => this.values.add(value)); }
  remove(...values) { values.forEach(value => this.values.delete(value)); }
  contains(value) { return this.values.has(value); }
  toggle(value, force = !this.values.has(value)) { force ? this.add(value) : this.remove(value); return force; }
}

class EventSurface {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, callback, options = false) {
    const listeners = this.listeners.get(type) || [];
    listeners.push({ callback, capture: options === true || options?.capture === true });
    this.listeners.set(type, listeners);
  }
  dispatch(type, init = {}) {
    const event = { type, target: this, repeat: false, defaultPrevented: false, stopped: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() {}, stopImmediatePropagation() { this.stopped = true; }, ...init };
    const listeners = [...(this.listeners.get(type) || [])].sort((a, b) => Number(b.capture) - Number(a.capture));
    for (const listener of listeners) {
      listener.callback(event);
      if (event.stopped) break;
    }
    if (!event.stopped && typeof this['on' + type] === 'function') this['on' + type](event);
    return event;
  }
}

function canvas2DStub() {
  return new Proxy({}, {
    get(target, property) {
      if (property in target) return target[property];
      if (property === 'measureText') return text => ({ width: String(text).length * 7 });
      return () => {};
    },
    set(target, property, value) { target[property] = value; return true; }
  });
}

class FakeElement extends EventSurface {
  constructor(tagName, attributes = {}, owner = null) {
    super(); this.tagName = tagName.toUpperCase(); this.attributes = { ...attributes }; this.owner = owner;
    this.id = attributes.id || ''; this.style = {}; this.dataset = {}; this.children = [];
    this.classList = new FakeClassList(); this.hidden = Object.hasOwn(attributes, 'hidden');
    this.disabled = Object.hasOwn(attributes, 'disabled'); this.checked = Object.hasOwn(attributes, 'checked');
    this.value = attributes.value || ''; this.width = Number(attributes.width || 320); this.height = Number(attributes.height || 200);
    this.textContent = ''; this._innerHTML = ''; this._context2D = canvas2DStub();
    for (const [name, value] of Object.entries(attributes)) if (name.startsWith('data-'))
      this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
  }
  get innerHTML() { return this._innerHTML; }
  set innerHTML(value) { this._innerHTML = String(value); this.children = []; }
  get firstElementChild() { return this.children[0] || (this.children[0] = new FakeElement('div', {}, this.owner)); }
  appendChild(child) { this.children.push(child); return child; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  matches(selector) {
    return selector.split(',').some(raw => {
      const s = raw.trim();
      if (s.startsWith('#')) return this.id === s.slice(1);
      const attr = /^\[([^=\]]+)(?:=["']?([^\]"']+)["']?)?\]$/.exec(s);
      if (attr) return Object.hasOwn(this.attributes, attr[1]) && (attr[2] === undefined || this.attributes[attr[1]] === attr[2]);
      return this.tagName.toLowerCase() === s.toLowerCase();
    });
  }
  getContext(type) { if (type !== '2d') throw new Error('The VM harness does not expose WebGL'); return this._context2D; }
  getBoundingClientRect() { return { left: 0, top: 0, width: this.width, height: this.height }; }
  setPointerCapture() {}
  requestPointerLock() { return Promise.resolve(); }
  blur() { if (this.owner) this.owner.activeElement = this.owner.body; }
  click() { this.dispatch('click', { target: this }); }
}

function makeDocument(template) {
  const document = new EventSurface();
  document.elements = [];
  for (const match of template.matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)) {
    const attributes = {};
    for (const attribute of match[2].matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g))
      attributes[attribute[1]] = attribute[2] ?? attribute[3] ?? attribute[4] ?? '';
    document.elements.push(new FakeElement(match[1], attributes, document));
  }
  document.body = document.elements.find(el => el.tagName === 'BODY') || new FakeElement('body', {}, document);
  document.activeElement = document.body; document.hidden = false; document.pointerLockElement = null;
  document.getElementById = id => document.elements.find(el => el.id === id) || null;
  document.querySelectorAll = selector => document.elements.filter(el => el.matches(selector));
  document.querySelector = selector => document.querySelectorAll(selector)[0] || null;
  document.createElement = tag => { const element = new FakeElement(tag, {}, document); document.elements.push(element); return element; };
  document.exitPointerLock = () => { document.pointerLockElement = null; };
  // Browser option selection is outside the VM's scope; establish authored defaults.
  document.getElementById('abilitySelect').value = 'focus';
  document.getElementById('approachSelect').value = 'quiet';
  return document;
}

function installFixtures() {
  const g = HARBOR;
  g.manualTesting = true; g.hadLock = false;
  globalThis.V4FIX = {
    reset(mode = 'free', approach = 'quiet', role = 'focus') {
      document.getElementById('approachSelect').value = approach;
      document.getElementById('abilitySelect').value = role;
      g.manualTesting = true; g.hadLock = false; g.reset(mode, false);
      g.started = true; g.running = true; g.mode = 'play'; g.closeOverlays(); g.clearInput();
      document.getElementById('startScreen').hidden = true; document.getElementById('hud').hidden = false;
      document.activeElement?.blur(); g.cheats.god = true; g.cheats.noPolice = false;
      g.render.quality = 'low'; g.spawnTimer = 999; g.npcs = [];
      g.cars = g.cars.filter(c => c.id === 'starter' || c.id === 'target');
      g.updateCamera(1, true); return this.state();
    },
    tick(seconds) {
      const full = Math.floor(seconds * 60 + 1e-8);
      for (let i = 0; i < full; i++) g.advanceReal(1 / 60);
      const rest = seconds - full / 60;
      if (rest > 1e-8) g.advanceReal(rest);
      return this.state();
    },
    driver(id = 'target', position = null) {
      const car = g.cars.find(c => c.id === id);
      for (const c of g.cars) if (c.seat.occupant === 'player') c.seat.occupant = null;
      if (position) { car.x = position[0]; car.z = position[2]; }
      car.y = g.world.supportHeight(car.x, car.z, .35); car.speed = car.vx = car.vz = 0; car.traffic = false;
      car.seat.occupant = 'player'; car.seat.lease = null;
      g.player.carId = id; g.player.transition = null; g.player.pos = [car.x, car.y + .25, car.z];
      g.player.vel = [0, 0, 0]; g.player.grounded = true; g.player.hp = 100; g.clearInput(); return car;
    },
    exit() {
      for (const car of g.cars) if (car.seat.occupant === 'player') car.seat.occupant = null;
      g.player.carId = null; g.player.transition = null;
    },
    acquire() { this.driver(); this.tick(1 / 60); return this.state(); },
    deliverReady(approach = 'quiet') {
      this.reset('mission', approach); this.acquire(); this.tick(3.1); this.driver('target', [-108, 0, 104]); return this.state();
    },
    pending(id = 'fixture-report') {
      const n = g.spawnNPC('civilian', [0, 0, 166]); n.idle = 999; n.panic = 0; n.shotCD = 999;
      g.reportQueue.enqueue({ incidentId: id, witnessId: n.id, witnessType: 'civilian', level: 1,
        pos: g.player.pos.slice(), observedAt: g.time });
      return n.id;
    },
    state() {
      return { time: g.time, phase: g.phase, running: g.running, mode: g.mode, wallet: g.ledger.wallet,
        player: { hp: g.player.hp, armor: g.player.armor, weapon: g.player.weapon, carId: g.player.carId,
          pos: g.player.pos.slice(), transitioning: !!g.player.transition, jumpWindup: g.player.jumpWindup || 0 },
        wheel: { open: g.wheel.open, selected: g.wheel.selected }, ability: g.ability.serialize(),
        contract: g.contract ? g.contract.snapshot() : null, pending: g.reportQueue.pendingCount, wanted: g.wanted.level,
        carCount: g.cars.filter(c => c.id === 'target').length, ammo: g.mags[g.player.weapon].ammo,
        reloading: !!g.mags[g.player.weapon].reload };
    }
  };
}

function createRuntime() {
  const errors = [], warnings = [], document = makeDocument(fs.readFileSync(path.join(ROOT, 'src/template.html'), 'utf8'));
  const windowEvents = new EventSurface();
  const unavailableStorage = () => { throw new Error('Persistent browser storage is unavailable in the Node VM harness'); };
  const scope = {
    document, navigator: { maxTouchPoints: 0 }, matchMedia: () => ({ matches: false }),
    innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
    performance: { now: () => 0 }, requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    setTimeout: () => 0, clearTimeout() {}, localStorage: { getItem: unavailableStorage, setItem: unavailableStorage },
    console: { log() {}, warn: (...args) => warnings.push(args.map(String).join(' ')), error: (...args) => errors.push(args.map(String).join(' ')) },
    addEventListener: (...args) => windowEvents.addEventListener(...args)
  };
  scope.window = scope;
  vm.createContext(scope);
  const sources = ['engine.js', 'logic.js', 'data.js', 'gameplay-data.js', 'gameplay.js', 'mission-data.js', 'mission.js',
    'perception.js', 'world.js', 'motion.js', 'models.js', 'gameplay-integration.js'];
  for (const file of sources) vm.runInContext(fs.readFileSync(path.join(ROOT, 'src', file), 'utf8'), scope, { filename: file });
  vm.runInContext(`
    HarborGL = class {
      constructor(canvas) { this.canvas=canvas; this.frames=0; this.drawCalls=0; this.quality='low'; this.night=false; }
      box() {} sphere() {} cylinder() {} cone() {} seal() {} begin() {}
      project() { return null; }
      render() { this.frames++; }
    };
    HarborAudio = class {
      constructor() { this.volume=.3; }
      start() {} update() {} beep() {} noiseShot() {} footstep() {}
    };
    window.HarborGL=HarborGL;window.HarborAudio=HarborAudio;
  `, scope, { filename: 'vm-output-stubs.js' });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/main.js'), 'utf8'), scope, { filename: 'main.js' });
  if (!scope.HARBOR) throw new Error('Actual game initialization failed: ' + errors.join('\n'));
  const evaluate = (code, argument) => {
    const result = vm.runInContext(typeof code === 'function' ? '(' + code.toString() + ')(' + JSON.stringify(argument ?? null) + ')' : code,
      scope, { filename: 'runtime-scenario.js', timeout: 15000 });
    return result === undefined ? undefined : JSON.parse(JSON.stringify(result));
  };
  evaluate(installFixtures);
  return {
    scope, document, errors, warnings, evaluate,
    key(code, type = 'keydown', options = {}) { return document.dispatch(type, { code, target: document.activeElement, ...options }); },
    press(code) { document.dispatch('keydown', { code, target: document.activeElement }); document.dispatch('keyup', { code, target: document.activeElement }); },
    click(id) { const element = document.getElementById(id); if (!element) throw new Error('Unknown DOM id: ' + id); element.click(); },
    select(id, value) { const element = document.getElementById(id); if (!element) throw new Error('Unknown DOM id: ' + id); element.value = value; },
    limitation: 'Node VM executes actual game code; DOM, drawing, audio, RAF and storage are stubs. No browser/WebGL/visual/persistent-origin validation.'
  };
}

module.exports = { createRuntime, ROOT };
