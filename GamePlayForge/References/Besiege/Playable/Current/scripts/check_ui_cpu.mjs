import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { createCpuScene, runSceneChecks } from './check_scene_cpu.mjs';

// Integration state check, not a browser or a DOM/layout implementation.
// Actual main, data, report, physics and Three scene methods are exercised.
// The HTML tree, EventTarget dispatch, modal events and clocks are a facade;
// no WebGL backend or browser is initialized.
const ROOT = fileURLToPath(new URL('../dist', import.meta.url));
class Clock {
  now = 0; next = 1; timers = new Map(); frames = new Map();
  setTimeout = (fn, delay = 0) => { const id = this.next++; this.timers.set(id, { fn, at: this.now + Number(delay) }); return id; };
  clearTimeout = id => this.timers.delete(id);
  requestAnimationFrame = fn => { const id = this.next++; this.frames.set(id, fn); return id; };
  advance(ms) {
    const end = this.now + ms;
    for (let count = 0; ; count++) {
      assert.ok(count < 500, 'timer loop');
      const entry = [...this.timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!entry) break;
      const [id, t] = entry; this.timers.delete(id); this.now = t.at; t.fn();
    }
    this.now = end;
  }
  frame(ms = 1000 / 60) {
    this.advance(ms); const batch = [...this.frames.values()]; this.frames.clear();
    for (const fn of batch) fn(this.now);
  }
}

const decode = text => String(text).replace(/&(?:amp|lt|gt|quot|#39);/g, value => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" })[value]);
const dataKey = key => key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const attributeKey = key => `data-${key.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}`;

class Element extends EventTarget {
  constructor(tag, doc) {
    super(); this.tagName = tag.toUpperCase(); this.doc = doc; this.children = []; this.parentElement = null;
    this.attributes = {}; this.style = {}; this._text = ''; this._value = ''; this._hidden = false; this.disabled = false; this.checked = false;
    this.dataset = new Proxy({}, { get: (_, key) => this.attributes[attributeKey(String(key))], set: (_, key, value) => { this.attributes[attributeKey(String(key))] = String(value); return true; } });
    this.classList = {
      contains: value => this.className.split(/\s+/).includes(value),
      add: (...values) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...values])].join(' '); },
      remove: (...values) => { this.className = this.className.split(/\s+/).filter(c => !values.includes(c)).join(' '); },
      toggle: (value, force) => { const active = force === undefined ? !this.classList.contains(value) : !!force; this.classList[active ? 'add' : 'remove'](value); return active; },
    };
  }
  get id() { return this.attributes.id || ''; } set id(value) { this.setAttribute('id', value); }
  get className() { return this.attributes.class || ''; } set className(value) { this.attributes.class = String(value); }
  get textContent() { return this._text + this.children.map(child => child.textContent || '').join(''); }
  set textContent(value) { this.replaceChildren(); this._text = value == null ? '' : String(value); }
  get innerHTML() { return this._text; }
  set innerHTML(value) { this.replaceChildren(); parseHTML(String(value), this, this.doc); }
  get value() { return this._value; } set value(value) { this._value = String(value); }
  get hidden() { return this._hidden; } set hidden(value) { this._hidden = !!value; }
  get open() { return Object.hasOwn(this.attributes, 'open'); } set open(value) { if (value) this.attributes.open = ''; else delete this.attributes.open; }
  get type() { return this.attributes.type || ''; } set type(value) { this.setAttribute('type', value); }
  get clientWidth() { return 1280; } get clientHeight() { return 720; }
  setAttribute(key, value) {
    this.attributes[key] = String(value);
    if (key === 'id') this.doc.ids.set(String(value), this);
    if (key === 'value') this._value = String(value);
    if (key === 'hidden') this.hidden = true;
    if (key === 'disabled') this.disabled = true;
    if (key === 'checked') this.checked = true;
  }
  getAttribute(key) { return this.attributes[key] ?? null; }
  removeAttribute(key) { delete this.attributes[key]; }
  appendChild(node) { if (node.parentElement) node.remove(); this.children.push(node); node.parentElement = this; return node; }
  append(...nodes) { for (const node of nodes) this.appendChild(typeof node === 'string' ? Object.assign(new Element('text', this.doc), { textContent: node }) : node); }
  replaceChildren(...nodes) { for (const child of this.children) child.parentElement = null; this.children = []; this._text = ''; this.append(...nodes); }
  remove() { if (this.parentElement) this.parentElement.children.splice(this.parentElement.children.indexOf(this), 1); this.parentElement = null; }
  matches(selector) { return matches(this, selector); }
  closest(selector) { for (let node = this; node; node = node.parentElement) if (matches(node, selector)) return node; return null; }
  querySelectorAll(selector) {
    const result = [], groups = selector.split(',').map(s => s.trim());
    // Attribute values may contain commas (the actual data-nudge selector).
    if (/\[[^\]]*,/.test(selector)) groups.splice(0, groups.length, selector);
    const walk = node => { for (const child of node.children) { if (groups.some(s => matches(child, s))) result.push(child); walk(child); } };
    walk(this); return result;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  click() { if (!this.disabled) this.dispatchEvent(new Event('click', { cancelable: true })); }
  focus() { this.doc.activeElement = this; } blur() { if (this.doc.activeElement === this) this.doc.activeElement = this.doc.body; }
  select() {} scrollIntoView() {} setPointerCapture() {}
  getBoundingClientRect() { return { left: 0, top: 0, right: 1280, bottom: 720, width: 1280, height: 720 }; }
  showModal() { this.open = true; }
  close() { if (!this.open) return; this.open = false; this.doc.clock.setTimeout(() => this.dispatchEvent(new Event('close')), 0); }
}

function simpleMatches(node, selector) {
  const not = [...selector.matchAll(/:not\(([^)]+)\)/g)].map(m => m[1]);
  if (not.some(s => simpleMatches(node, s))) return false;
  selector = selector.replace(/:not\([^)]+\)/g, '');
  for (const [, key, value] of selector.matchAll(/\[([^=\]\s]+)(?:=["']?([^"'\]]*)["']?)?\]/g)) {
    if (node.getAttribute(key) === null) return false;
    if (value !== undefined && node.getAttribute(key) !== value) return false;
  }
  selector = selector.replace(/\[[^\]]*\]/g, '');
  const tag = selector.match(/^[a-zA-Z][\w-]*/)?.[0]; if (tag && node.tagName !== tag.toUpperCase()) return false;
  const id = selector.match(/#([\w-]+)/)?.[1]; if (id && node.id !== id) return false;
  for (const [, cls] of selector.matchAll(/\.([\w-]+)/g)) if (!node.classList.contains(cls)) return false;
  return true;
}
function matches(node, selector) {
  const pieces = selector.trim().split(/\s+(?![^\[]*\])/);
  if (!simpleMatches(node, pieces.pop())) return false;
  let parent = node.parentElement;
  while (pieces.length) { const piece = pieces.pop(); while (parent && !simpleMatches(parent, piece)) parent = parent.parentElement; if (!parent) return false; parent = parent.parentElement; }
  return true;
}
function parseHTML(html, parent, doc) {
  const stack = [parent];
  const clean = html.replace(/<!--[^]*?-->/g, '').replace(/<(script|style)\b[^>]*>[^]*?<\/\1>/gi, '');
  const voids = new Set(['AREA', 'BASE', 'BR', 'COL', 'EMBED', 'HR', 'IMG', 'INPUT', 'LINK', 'META', 'PARAM', 'SOURCE', 'TRACK', 'WBR']);
  for (const token of clean.matchAll(/<[^>]*>|[^<]+/g)) {
    const text = token[0];
    if (/^<!/.test(text)) continue;
    if (/^<\//.test(text)) { const tag = text.match(/^<\/\s*([^\s>]+)/)?.[1].toUpperCase(); const index = stack.findLastIndex(n => n.tagName === tag); if (index > 0) stack.length = index; continue; }
    if (text[0] === '<') {
      const tag = text.match(/^<\s*([^\s/>]+)/)?.[1]; if (!tag) continue;
      const node = new Element(tag, doc), body = text.slice(text.indexOf(tag) + tag.length).replace(/\/?\s*>$/, '');
      for (const [, key, double, single, plain] of body.matchAll(/([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s]+)))?/g)) node.setAttribute(key, decode(double ?? single ?? plain ?? ''));
      stack.at(-1).appendChild(node); if (!voids.has(node.tagName) && !/\/>$/.test(text)) stack.push(node);
    } else stack.at(-1)._text += decode(text);
  }
}
class DocumentFacade extends EventTarget {
  constructor(html, clock) { super(); this.ids = new Map(); this.clock = clock; this.root = new Element('document', this); parseHTML(html, this.root, this); this.body = this.root.querySelector('body'); this.activeElement = this.body; this.hidden = false; }
  getElementById(id) { return this.ids.get(id) || null; }
  createElement(tag) { return new Element(tag, this); }
  querySelector(selector) { return this.root.querySelector(selector); }
  querySelectorAll(selector) { return this.root.querySelectorAll(selector); }
}

export async function createApp() {
  const clock = new Clock(), document = new DocumentFacade(await readFile(`${ROOT}/index.html`, 'utf8'), clock);
  const window = new EventTarget(), values = new Map([['ironwood.prefs.v1', JSON.stringify({ soundOn: false, quality: 'low' })]]), errors = [];
  let latestScene, latestSimulation;
  const sandbox = { document, window, localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) },
    performance: { now: () => clock.now }, matchMedia: () => ({ matches: false }), setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
    requestAnimationFrame: clock.requestAnimationFrame, console: { ...console, error: (...args) => errors.push(args) }, URL, Blob, Event,
  };
  const context = vm.createContext(sandbox), cache = new Map();
  const main = new vm.SourceTextModule(await readFile(`${ROOT}/main.js`, 'utf8'), { context, identifier: `${ROOT}/main.js` });
  await main.link(async (specifier, referencing) => {
    const path = resolve(dirname(referencing.identifier), specifier);
    if (cache.has(path)) return cache.get(path);
    let namespace;
    if (path.endsWith('/scene.js')) namespace = { GameScene: class { constructor(container, callbacks) { latestScene = createCpuScene(container, callbacks); return latestScene; } } };
    else {
      namespace = await import(pathToFileURL(path).href);
      if (path.endsWith('/physics.js')) { const Actual = namespace.Simulation; namespace = { ...namespace, Simulation: class extends Actual { constructor(options) { super(options); latestSimulation = this; } } }; }
    }
    const module = new vm.SyntheticModule(Object.keys(namespace), function () { for (const [key, value] of Object.entries(namespace)) this.setExport(key, value); }, { context, identifier: path });
    cache.set(path, module); return module;
  });
  await main.evaluate();
  assert.deepEqual(errors, [], `startup errors: ${errors.flat().join('\n')}`); assert.ok(window.ironwood, 'main init reaches read-only diagnostics');
  const $ = id => document.getElementById(id), state = () => window.ironwood.getState();
  const click = value => { const node = typeof value === 'string' ? document.querySelector(value) : value; assert.ok(node, `button exists: ${value}`); node.click(); clock.advance(0); };
  const emit = (node, type, props = {}) => { const event = new Event(type, { cancelable: true }); Object.assign(event, props); node.dispatchEvent(event); clock.advance(0); };
  return { clock, document, window, values, errors, $, state, click, emit, get scene() { return latestScene; }, get sim() { return latestSimulation; } };
}

export async function runMainChecks() {
  const app = await createApp(), { $, state, click, emit, clock, document } = app;
  const signature = () => JSON.stringify(state().parts);
  const loadPreset = name => { click('#load-btn'); click(`[data-preset=${name}]`); };
  const select = (id, additive = false) => app.scene.callbacks.onSelect(id, { additive });
  const frames = (count, ms = 1000 / 60) => { for (let i = 0; i < count; i++) clock.frame(ms); };
  assert.equal(state().mode, 'build'); assert.equal(document.querySelectorAll('.part-button').length, 10); assert.equal(state().version, '4.0');

  loadPreset('lift'); assert.equal(state().mission, 'sandbox'); assert.equal(state().partCount, 15);
  const liftSignature = signature(), wood = state().parts.filter(p => p.type === 'wood');
  const center = wood.find(p => p.x === 0 && p.z === 0), arm = wood.find(p => p.x === 1 && p.z === 0);
  select(center.id); select(arm.id, true); assert.equal(state().selectedIds.length, 2); assert.equal(app.scene.selectedIds.size, 2); assert.equal($('group-tools').hidden, false);
  click('[data-nudge="0,-1,0"]'); assert.equal(signature(), liftSignature, 'overlapping group move is atomic');
  click('[data-nudge="0,1,0"]'); assert.notEqual(signature(), liftSignature); assert.equal(state().selectedIds.length, 2);
  click('#undo-btn'); assert.equal(signature(), liftSignature); click('#redo-btn'); assert.notEqual(signature(), liftSignature); click('#undo-btn');
  select(center.id); select(arm.id, true); $('group-copy-mode').checked = true; click('[data-nudge="1,0,0"]');
  assert.equal(state().partCount, 17); assert.equal(state().selectedIds.length, 2); assert.ok(!state().selectedIds.includes(center.id));
  click('#undo-btn'); assert.equal(state().partCount, 15); $('group-copy-mode').checked = false;
  const coreId = state().parts.find(p => p.type === 'core').id;
  select(center.id); select(coreId, true); assert.equal($('group-delete').disabled, true); click('#group-delete'); assert.equal(state().partCount, 15);
  click('#group-clear'); assert.equal(state().selectedIds.length, 0);
  console.log('PASS main initialization, group selection, atomic failed nudge, move/copy, undo/redo and core protection');

  click('#save-btn'); assert.equal($('design-dialog').open, true); $('design-name').value = 'Lift <img src=x onerror=alert(1)>'; click('#save-new-slot');
  assert.equal(state().designSlotCount, 1); assert.equal($('design-slots').querySelectorAll('img').length, 0);
  loadPreset('boat'); assert.equal(state().mission, 'harbor'); const boatSignature = signature();
  click('#save-btn'); $('design-name').value = 'Boat'; click('#save-new-slot'); assert.equal(state().designSlotCount, 2);
  const slotRows = () => $('design-slots').querySelectorAll('.design-slot');
  click(slotRows()[0].querySelectorAll('button')[0]); assert.equal(state().mission, 'sandbox'); assert.equal(signature(), liftSignature);
  click('#undo-btn'); assert.equal(state().mission, 'harbor'); assert.equal(signature(), boatSignature); assert.equal(app.scene.mission, 'harbor');
  click('#redo-btn'); assert.equal(state().mission, 'sandbox'); assert.equal(signature(), liftSignature); assert.equal(app.scene.mission, 'sandbox');
  click('#load-btn'); slotRows()[0].querySelector('input').value = 'Renamed <script>literal</script>'; click(slotRows()[0].querySelectorAll('button')[1]);
  assert.equal(slotRows()[0].querySelector('input').value, 'Renamed <script>literal</script>'); assert.equal(slotRows()[0].querySelectorAll('script').length, 0);
  const beforeDelete = signature(); click(slotRows()[1].querySelectorAll('button')[3]); assert.equal(state().designSlotCount, 1); assert.equal(signature(), beforeDelete);
  $('design-dialog').close(); clock.advance(0);
  console.log('PASS named slots, literal untrusted names, load/undo/redo mission restoration, rename/delete and unchanged workbench');

  click('#run-btn'); assert.equal(state().mode, 'play'); assert.equal(state().paused, false); assert.equal($('test-tools').hidden, false);
  emit(document, 'keydown', { code: 'KeyZ', key: 'z', repeat: false }); frames(170); emit(document, 'keyup', { code: 'KeyZ', key: 'z' });
  const pistonId = state().parts.find(p => p.type === 'piston').id;
  assert.ok(app.sim.getPistonState(pistonId).extension > 1.4, 'ordinary keyboard input raises the real lift');
  select(pistonId); assert.equal(state().paused, true); assert.equal($('runtime-inspector').hidden, false); assert.equal(document.body.dataset.inspecting, 'true'); assert.ok($('runtime-part-details').textContent.includes('실제 이동'));
  const time = state().sim.elapsed, target = app.sim.getPistonState(pistonId).target;
  emit(document, 'keydown', { code: 'KeyX', key: 'x', repeat: false }); click('#step-btn');
  assert.ok(Math.abs(state().sim.elapsed - time - 1 / 60) < 1e-9); assert.equal(app.sim.getPistonState(pistonId).target, target, 'single-step clears held inputs');
  click('#inspection-resume'); assert.equal(state().paused, false); assert.equal(state().selectedIds.length, 0); assert.equal($('runtime-inspector').hidden, true); assert.equal(document.body.dataset.inspecting, 'false');
  $('stress-mode').value = 'damage'; emit($('stress-mode'), 'change'); assert.equal(app.scene.stressMode, 'damage'); assert.equal(app.scene.stressVisible, true); assert.ok($('stress-legend').textContent.includes('누적'));
  click('#help-btn'); assert.equal(state().paused, true); assert.equal($('help-dialog').open, true); $('help-dialog').close(); clock.advance(0); assert.equal(state().paused, false);
  console.log('PASS ordinary Z input through real physics, play selection/pause, neutral single-step, resume, stress mode and modal pause/resume');

  // Explicit damage fixture exercises reports/lifecycle, not a claimed collision playthrough.
  const damagedId = state().parts.find(p => p.type === 'wood').id;
  app.sim._damagePart(damagedId, 12, app.sim.bodies.get(damagedId).position, 'collision'); frames(1);
  click('#report-btn'); assert.equal(state().paused, true); assert.equal($('report-dialog').open, true);
  const issueButton = $('report-parts').querySelector('button'); assert.ok(issueButton); click(issueButton);
  assert.equal($('report-dialog').open, false); assert.equal(state().paused, true); assert.ok(state().selected); assert.equal($('runtime-inspector').hidden, false);
  click('#report-btn'); click('#report-revise'); assert.equal(state().mode, 'build'); assert.equal(app.scene.simulation, null); assert.equal(app.sim.disposed, true); assert.ok(app.scene.reviewIds.has(damagedId)); assert.equal($('runtime-inspector').hidden, true); assert.equal(document.body.dataset.inspecting, 'false');
  click('#last-report-btn'); click($('report-parts').querySelector('button')); assert.equal(state().mode, 'build'); assert.ok(state().selected); assert.equal($('inspector').hidden, false); assert.ok(app.scene.reviewIds.has(damagedId));
  select(pistonId); $('part-stroke').value = '1.4'; emit($('part-stroke'), 'change'); assert.equal(app.scene.reviewIds.size, 0, 'revision clears stale report locations');
  click('#undo-btn'); assert.ok(app.scene.reviewIds.has(damagedId), 'undo restores matching report locations');
  click('#run-btn'); assert.equal(state().mode, 'play'); assert.equal(app.scene.reviewIds.size, 0); assert.equal(state().report.events.length, 0); assert.equal(app.sim.partStates.get(damagedId).hp, app.sim.partStates.get(damagedId).maxHp);
  console.log('PASS report event capture, report part selection, revise/reset cleanup, revision-aware highlight clearing and fresh run report');

  const failedRun = app.sim, failedCore = state().parts.find(p => p.type === 'core').id;
  failedRun._damagePart(failedCore, 1000, failedRun.bodies.get(failedCore).position, 'collision'); frames(1); assert.equal(state().sim.outcome, 'failed');
  click('#run-btn'); assert.equal(state().mode, 'build'); click('#run-btn'); assert.equal(state().mode, 'play');
  assert.notEqual(app.sim, failedRun); clock.advance(600); frames(1); assert.equal($('result-dialog').open, false); assert.equal(state().paused, false); assert.equal(state().sim.outcome, null); assert.equal(state().sim.coreHp, 100);
  const finalRun = app.sim;
  finalRun._damagePart(failedCore, 1000, finalRun.bodies.get(failedCore).position, 'collision'); frames(1); clock.advance(500);
  assert.equal($('result-dialog').open, true); assert.equal(state().paused, true); assert.equal($('step-btn').disabled, true);
  click('#result-report'); assert.equal($('result-dialog').open, false); assert.equal($('report-dialog').open, true); click('#report-revise'); assert.equal(state().mode, 'build'); assert.equal(app.scene.selectedIds.size, 0); assert.equal(app.scene.partIndicators.size, 0);
  click('#run-btn'); const replacedRun = app.sim; click('#load-btn'); assert.equal(state().paused, true);
  click(slotRows()[0].querySelectorAll('button')[0]); clock.advance(50); assert.equal(state().mode, 'build'); assert.equal(replacedRun.disposed, true); assert.equal(app.scene.simulation, null); assert.equal($('design-dialog').open, false); assert.equal($('runtime-inspector').hidden, true);
  assert.deepEqual(app.errors, []); app.scene.dispose();
  console.log('PASS terminal result delay, reset/new-run timer isolation, result/report flow, slot load during play and scene runtime cleanup');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) { runSceneChecks(); await runMainChecks(); }
