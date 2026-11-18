'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the actual app.js event listeners, controls and simulation together.
// Only the DOM, frame scheduler and drawing are replaced; this is not a browser
// layout test. Browser QA separately verifies rendered touch controls.
const DIST = path.join(__dirname, '../../dist');
const source = name => fs.readFileSync(path.join(DIST, name), 'utf8');

function harness(options = {}) {
  let now = 1000, narrow = true, nextFrame = null, game = null, rendered = null, renderDt = 0;
  const elements = [], byId = new Map(), stored = new Map(options.stored || []), errors = [];
  if (options.prefs) stored.set('nexus-front-prefs', JSON.stringify(options.prefs));
  const dataKey = key => key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  class EventTarget {
    constructor() { this.listeners = new Map(); }
    addEventListener(type, listener) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(listener);
    }
    fire(type, values = {}) {
      const event = { type, target: this, currentTarget: this, button: 0, pointerId: 1,
        pointerType: 'mouse', clientX: 100, clientY: 700, detail: 1,
        preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...values };
      for (const listener of this.listeners.get(type) || []) listener(event);
      return event;
    }
  }
  class Element extends EventTarget {
    constructor(tagName = 'div', attributes = {}) {
      super(); this.tagName = tagName.toUpperCase(); this.attributes = attributes;
      this.id = attributes.id || ''; this.dataset = {};
      for (const [key, value] of Object.entries(attributes)) if (key.startsWith('data-')) this.dataset[dataKey(key.slice(5))] = value;
      const classes = new Set((attributes.class || '').split(/\s+/).filter(Boolean));
      this.classList = { add: (...names) => names.forEach(name => classes.add(name)),
        remove: (...names) => names.forEach(name => classes.delete(name)),
        contains: name => classes.has(name), toggle(name, force) {
          const add = force === undefined ? !classes.has(name) : !!force;
          if (add) classes.add(name); else classes.delete(name); return add;
        } };
      this.style = { setProperty(key, value) { this[key] = value; } };
      this.hidden = Object.hasOwn(attributes, 'hidden'); this.disabled = Object.hasOwn(attributes, 'disabled');
      this.innerHTML = ''; this.textContent = ''; this.value = attributes.value || ''; this.lastElementChild = { textContent: '' };
      this.childrenBySelector = new Map(); this.capture = new Set();
      this.rect = { left: 0, top: 0, width: 100, height: 60, right: 100, bottom: 60 };
    }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    getBoundingClientRect() { return this.rect; }
    getClientRects() { return this.hidden ? [] : [this.rect]; }
    querySelector(selector) {
      if (!this.childrenBySelector.has(selector)) this.childrenBySelector.set(selector, new Element(selector.includes('button') ? 'button' : 'span'));
      return this.childrenBySelector.get(selector);
    }
    querySelectorAll() { return []; }
    closest(selector) { return selector === 'button,a,[role="button"]' && ['BUTTON', 'A'].includes(this.tagName) ? this : null; }
    focus() { document.activeElement = this; }
    setPointerCapture(id) { this.capture.add(id); }
    hasPointerCapture(id) { return this.capture.has(id); }
    releasePointerCapture(id) { if (this.capture.delete(id)) this.fire('lostpointercapture', { pointerId: id }); }
  }
  for (const match of source('index.html').matchAll(/<([a-z][\w:-]*)\b([^<>]*)>/gi)) {
    const attributes = {};
    for (const entry of match[2].matchAll(/([\w:-]+)(?:="([^"]*)")?/g)) attributes[entry[1]] = entry[2] ?? '';
    const element = new Element(match[1], attributes);
    elements.push(element);
    if (element.id) byId.set(element.id, element);
  }
  const document = new EventTarget(); document.hidden = false; document.activeElement = null;
  document.getElementById = id => {
    assert.ok(byId.has(id), `App references missing HTML id ${id}`); return byId.get(id);
  };
  document.querySelectorAll = selector => elements.filter(element => selector.split(',').some(part => {
    part = part.trim();
    if (part.startsWith('.')) return element.classList.contains(part.slice(1));
    const attr = /^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(part);
    return !!attr && Object.hasOwn(element.attributes, attr[1]) && (attr[2] === undefined || element.attributes[attr[1]] === attr[2]);
  }));
  const window = new EventTarget();
  const localStorage = { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key) };
  class Renderer {
    constructor(_canvas, initial) { game = initial; }
    setGame(value) { game = value; }
    resize() {} render(dt, options) { rendered = options; renderDt = dt; } drawMinimap() {} panTo() {}
    screenToWorld(x, y) { return { x, y }; }
  }
  const context = vm.createContext({ document, window, localStorage, performance: { now: () => now },
    matchMedia: () => ({ matches: narrow }), innerWidth: 390, innerHeight: 844,
    requestAnimationFrame: callback => { nextFrame = callback; },
    console: { error: (...args) => errors.push(args), log() {} }, NexusRenderer: { Renderer } });
  vm.runInContext('Math.random = () => 0.25; Date.now = () => 1794657600000;', context);
  for (const name of ['navigation.js', 'game.js', 'history.js', 'checkpoint.js', 'coach.js', 'controls.js', 'app.js']) vm.runInContext(source(name), context, { filename: name });
  const get = id => document.getElementById(id);
  get('touch-aim-cancel').rect = { left: 300, top: 400, right: 380, bottom: 480, width: 80, height: 80 };
  get('joystick').rect = { left: 20, top: 500, right: 128, bottom: 608, width: 108, height: 108 };
  if (options.autoStart !== false) get('start-button').fire('click');
  const calls = [], cast = game.cast.bind(game);
  game.cast = (...args) => { calls.push(args); return cast(...args); };
  return { get, document, window, calls, stored, context, get game() { return game; }, get rendered() { return rendered; }, get renderDt() { return renderDt; },
    settings: () => context.NexusFront.settings(),
    mapChoice: scale => elements.find(element => Number(element.dataset.mapScale) === scale),
    speedChoice(id, value) { get(id).value = String(value); get(id).fire('change'); },
    skill: slot => elements.find(element => element.dataset.skill === slot),
    time(ms) { now += ms; },
    desktop() { narrow = false; context.innerWidth = 1280; window.fire('resize'); },
    frame(milliseconds = 20) { now += milliseconds; const callback = nextFrame; nextFrame = null; callback(now); assert.deepEqual(errors, []); },
    advance(milliseconds) { while (milliseconds > 0) { const dt = Math.min(20, milliseconds); this.frame(dt); milliseconds -= dt; } },
    assertHealthy() { assert.deepEqual(errors, []); assert.equal(get('load-error').hidden, true); }
  };
}

module.exports = { harness };
