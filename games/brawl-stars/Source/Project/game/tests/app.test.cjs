'use strict';

// App/engine integration smoke tests in Node VM. No browser, DOM package, layout,
// real pointer capture, audio output, or Canvas rendering is exercised here.
// The adapter implements only the DOM operations used by app.js. The engine is
// the actual dist/engine.js; an observing subclass records its public inputs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const dist = path.join(__dirname, '..', 'dist');
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const engineSource = fs.readFileSync(path.join(dist, 'engine.js'), 'utf8');
const appSource = fs.readFileSync(path.join(dist, 'app.js'), 'utf8');
const SETTINGS = 'brawl-lab-settings-v1', RECORDS = 'brawl-lab-records-v1';

class Events {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }
  emit(type, data = {}) {
    const event = { type, target: this, currentTarget: this, defaultPrevented: false,
      repeat: false, detail: 1, button: 0, ...data,
      preventDefault() { this.defaultPrevented = true; }, stopPropagation() {} };
    for (const fn of this.listeners.get(type) || []) fn.call(this, event);
    return event;
  }
}

class Element extends Events {
  constructor(tagName, document) {
    super(); this.tagName = tagName.toUpperCase(); this.ownerDocument = document;
    this.children = []; this.dataset = {}; this.attributes = {}; this.selectors = new Map();
    this.open = false; this.disabled = false; this.checked = false; this._text = '';
    this.className = ''; this.capturedPointers = new Set();
    const tokens = () => new Set(this.className.split(/\s+/).filter(Boolean));
    this.classList = {
      contains: name => tokens().has(name),
      add: (...names) => { const set = tokens(); names.forEach(name => set.add(name)); this.className = [...set].join(' '); },
      remove: (...names) => { const set = tokens(); names.forEach(name => set.delete(name)); this.className = [...set].join(' '); },
      toggle: (name, force) => { const yes = force === undefined ? !tokens().has(name) : !!force; this.classList[yes ? 'add' : 'remove'](name); return yes; }
    };
    this.style = { setProperty(name, value) { this[name] = String(value); }, getPropertyValue(name) { return this[name] || ''; } };
    this.rect = { left: 0, top: 0, width: 1000, height: 625 };
  }
  get textContent() { return this._text + this.children.map(child => child.textContent || '').join(''); }
  set textContent(value) { this._text = String(value); this.children = []; }
  get firstChild() { return this.children[0] || null; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this._text = ''; this.children = [...children]; }
  querySelector(selector) {
    assert.ok(this.selectors.has(selector), `Unimplemented descendant selector: ${this.id || this.tagName} ${selector}`);
    return this.selectors.get(selector)[0] || null;
  }
  querySelectorAll(selector) {
    assert.ok(this.selectors.has(selector), `Unimplemented descendant selector: ${this.id || this.tagName} ${selector}`);
    return this.selectors.get(selector);
  }
  getBoundingClientRect() { return { ...this.rect, right: this.rect.left + this.rect.width, bottom: this.rect.top + this.rect.height }; }
  focus() { this.ownerDocument.activeElement = this; }
  showModal() { this.open = true; }
  close() { this.open = false; }
  setPointerCapture(id) { this.capturedPointers.add(id); }
  createTHead() { const child = this.ownerDocument.createElement('thead'); this.append(child); return child; }
  createTBody() { const child = this.ownerDocument.createElement('tbody'); this.append(child); return child; }
  insertRow() { const child = this.ownerDocument.createElement('tr'); this.append(child); return child; }
  insertCell() { const child = this.ownerDocument.createElement('td'); this.append(child); return child; }
}

function makeDocument() {
  const document = new Events(), ids = new Map(), groups = { mode: [], hero: [], difficulty: [] };
  document.hidden = false; document.fullscreenElement = null;
  document.createElement = tag => new Element(tag, document);
  // Read identifiers and option metadata from the shipped HTML, without parsing
  // CSS, layout, nesting, or native element behavior.
  for (const match of html.matchAll(/<([a-z][\w:-]*)\b([^<>]*)>/gi)) {
    const attrs = {};
    for (const attr of match[2].matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) attrs[attr[1]] = attr[2] ?? attr[3] ?? attr[4] ?? '';
    const element = document.createElement(match[1]);
    if (attrs.id) { element.id = attrs.id; ids.set(attrs.id, element); }
    element.className = attrs.class || ''; element.checked = 'checked' in attrs;
    element.attributes = { ...attrs };
    for (const key of Object.keys(groups)) if (attrs['data-' + key]) { element.dataset[key] = attrs['data-' + key]; groups[key].push(element); }
    if (match[1].toLowerCase() === 'html') document.documentElement = element;
    if (match[1].toLowerCase() === 'body') document.body = element;
  }
  document.getElementById = id => ids.get(id) || null;
  const ammoBlock = html.match(/<div class="ammo-slots">([\s\S]*?)<\/div>/);
  assert.ok(ammoBlock, 'Expected the real HTML ammo slots');
  const ammo = [...ammoBlock[1].matchAll(/<i\b/g)].map(() => document.createElement('i'));
  document.querySelectorAll = selector => {
    const group = selector.match(/^\[data-(mode|hero|difficulty)\]$/);
    if (group) return groups[group[1]];
    if (selector === '.ammo-slots i') return ammo;
    throw new Error('Unimplemented document selector: ' + selector);
  };
  for (const id of ['soundBtn', 'scoreIconBlue', 'scoreIconRed']) ids.get(id).selectors.set('use', [document.createElement('use')]);
  const span = document.createElement('span'), text = document.createElement('#text'), small = document.createElement('small');
  text.textContent = '플레이 시작'; span.append(text, small);
  ids.get('startBtn').selectors.set('span', [span]); ids.get('startBtn').selectors.set('small', [small]);
  ids.get('difficultyList').selectors.set('button', groups.difficulty);
  for (const id of ['moveZone', 'aimZone']) {
    const zone = ids.get(id), base = document.createElement('div'), knob = document.createElement('span');
    zone.rect = { left: id === 'moveZone' ? 50 : 830, top: 450, width: 120, height: 120 };
    base.rect = { left: 0, top: 0, width: 84, height: 84 };
    zone.selectors.set('.stick-base', [base]); zone.selectors.set('.stick-knob', [knob]);
  }
  return { document, ids, groups };
}

function boot({ touch = false, reducedMotion = false, settings = {}, records = { games: 0, wins: 0 } } = {}) {
  const { document, ids, groups } = makeDocument(), window = new Events();
  const storage = new Map([[SETTINGS, JSON.stringify(settings)], [RECORDS, JSON.stringify(records)]]);
  const rendererCalls = [], instances = [], loggedErrors = [], audio = { contexts: 0, tones: 0 };
  // A controllable affine adapter proves the app re-queries pointer coordinates.
  // Actual follow-camera geometry/roundtrips are the renderer's native-Canvas gate.
  const rendererTransform = { scale: 1, offsetX: 0, offsetY: 0 };
  const coordinateCalls = [];
  let now = 0, nextId = 1;
  const frames = new Map(), timers = new Map();
  const setTimer = (fn, delay = 0) => { const id = nextId++; timers.set(id, { fn, due: now + delay }); return id; };
  const parameter = () => ({ setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  class AudioContextStub {
    constructor() { this.state = 'running'; this.destination = {}; audio.contexts++; }
    get currentTime() { return now / 1000; }
    resume() { this.state = 'running'; return Promise.resolve(); }
    createGain() { return { gain: parameter(), connect() {}, disconnect() {} }; }
    createOscillator() {
      const node = { frequency: parameter(), connect() {}, disconnect() {}, start() { audio.tones++; }, stop() { setTimer(() => node.onended?.(), 1); } };
      return node;
    }
  }
  class RendererStub {
    constructor(canvas) { this.canvas = canvas; }
    render(state, options) { rendererCalls.push({ mode: state.mode, status: state.status, options: { ...options } }); }
    screenToWorld(x, y) {
      const rect = this.canvas.getBoundingClientRect();
      const point = { x: (x - rect.left) * 1280 / rect.width / rendererTransform.scale + rendererTransform.offsetX,
        y: (y - rect.top) * 800 / rect.height / rendererTransform.scale + rendererTransform.offsetY };
      coordinateCalls.push({ clientX: x, clientY: y, ...point });
      return point;
    }
  }
  class ClockDate extends Date { static now() { return 1730000000000 + now; } }
  const sandbox = {
    window, document, navigator: { maxTouchPoints: touch ? 2 : 0, vibrate() { return true; } },
    innerWidth: touch ? 390 : 1440, innerHeight: touch ? 844 : 900,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)) },
    performance: { now: () => now }, Date: ClockDate,
    matchMedia: query => ({ matches: query.includes('prefers-reduced-motion') ? reducedMotion : query.includes('pointer: coarse') ? touch : false }),
    requestAnimationFrame: fn => { const id = nextId++; frames.set(id, fn); return id; },
    setTimeout: setTimer, clearTimeout: id => timers.delete(id),
    console: { error: (...args) => loggedErrors.push(args.map(String).join(' ')), log() {}, warn() {} },
    BrawlRenderer: RendererStub
  };
  window.AudioContext = AudioContextStub; window.scrollTo = () => {};
  const context = vm.createContext(sandbox);
  vm.runInContext(engineSource, context, { filename: 'dist/engine.js' });
  const RealGame = context.BrawlCore.Game;
  class ObservedGame extends RealGame {
    constructor(options) { super(options); this.appInputs = []; instances.push(this); }
    update(dt, input) { this.appInputs.push({ dt, ...input }); return super.update(dt, input); }
  }
  context.BrawlCore.Game = ObservedGame;
  vm.runInContext(appSource, context, { filename: 'dist/app.js' });
  const snapshot = () => JSON.parse(JSON.stringify(context.BrawlLab.snapshot()));
  const healthy = () => { assert.deepEqual(snapshot().errors, []); assert.deepEqual(loggedErrors, []); };
  function advance(count = 1, milliseconds = 1000 / 60) {
    for (let i = 0; i < count; i++) {
      now += milliseconds;
      const pending = [...frames.values()]; frames.clear();
      assert.equal(pending.length, 1, 'The app keeps one animation-frame loop');
      pending.forEach(fn => fn(now));
      for (const [id, timer] of [...timers]) if (timer.due <= now) { timers.delete(id); timer.fn(); }
      healthy();
    }
  }
  const click = id => { const element = ids.get(id); assert.ok(element && !element.disabled, 'Clickable real HTML element: ' + id); return element.emit('click'); };
  const choose = (key, value) => { const element = groups[key].find(el => el.dataset[key] === value); assert.ok(element, 'Shipped option exists: ' + value); element.emit('click'); };
  function start(mode = 'training', hero = 'ranger') {
    choose('mode', mode); choose('hero', hero); click('startBtn');
    for (let i = 0; snapshot().countIn > 0 && i < 180; i++) advance();
    assert.equal(snapshot().countIn, 0, 'Countdown completes'); advance(3);
    return instances.at(-1);
  }
  healthy();
  return { document, window, ids, groups, storage, rendererCalls, rendererTransform, coordinateCalls, audio, instances, snapshot, advance, click, choose, start,
    game: () => instances.at(-1), key: (code, repeat = false) => window.emit('keydown', { code, repeat }),
    release: code => window.emit('keyup', { code }) };
}

for (const mode of ['gem', 'showdown', 'ball', 'training', 'hotzone', 'heist', 'knockout', 'bounty']) {
  test(`앱 VM: ${mode} 선택 → 카운트다운 → 실제 엔진 프레임과 HUD`, () => {
    const app = boot({ settings: { sound: mode === 'gem' } });
    const game = app.start(mode, mode === 'training' ? 'blaster' : 'ranger');
    const state = app.snapshot();
    assert.equal(state.mode, mode); assert.equal(state.playing, true); assert.equal(state.paused, false);
    assert.ok(state.elapsed > 0); assert.equal(state.status, 'playing');
    assert.equal(state.actorCount, mode === 'training' ? 4 : mode === 'showdown' ? 8 : 6);
    assert.equal(app.groups.mode.find(el => el.dataset.mode === mode).getAttribute('aria-pressed'), 'true');
    assert.ok(app.document.body.classList.contains('playing'));
    assert.equal(app.rendererCalls.at(-1).mode, mode); assert.equal(app.rendererCalls.at(-1).options.menu, false);
    assert.equal(app.ids.get('matchTime').textContent === '∞', mode === 'training');
    assert.ok(game.appInputs.length > 0);
    if (mode === 'training') assert.ok(app.groups.difficulty.every(el => el.disabled));
    if (mode === 'gem') { assert.ok(app.audio.contexts > 0); assert.ok(app.audio.tones > 0); }
  });
}

test('앱 VM: 일시정지는 시뮬레이션을 멈추며 재개 시 눌린 이동 입력을 지운다', () => {
  const app = boot(), game = app.start();
  app.key('KeyD'); app.advance(8); assert.ok(game.appInputs.at(-1).moveX > 0);
  app.click('pauseBtn'); const elapsed = app.snapshot().elapsed;
  assert.equal(app.ids.get('pauseDialog').open, true); app.advance(30);
  assert.equal(app.snapshot().elapsed, elapsed); assert.equal(app.snapshot().paused, true);
  app.click('resumeBtn'); app.advance(5);
  assert.equal(app.ids.get('pauseDialog').open, false); assert.equal(app.snapshot().paused, false);
  assert.ok(app.snapshot().elapsed > elapsed); assert.equal(game.appInputs.at(-1).moveX, 0);
  assert.equal(app.document.activeElement, app.ids.get('gameCanvas'));
});

test('앱 VM: 전황창은 실제 4인 표를 만들고 열기 전의 실행·정지 상태를 보존한다', () => {
  const app = boot(); app.start(); app.key('KeyT');
  assert.equal(app.ids.get('statsDialog').open, true); assert.equal(app.snapshot().paused, true);
  const table = app.ids.get('liveScoreboard').firstChild;
  assert.equal(table.tagName, 'TABLE');
  assert.equal(table.children[0].children[0].children.length, 4);
  assert.equal(table.children[1].children.length, 4);
  assert.ok(table.children[1].children[0].classList.contains('self-row'));
  const elapsed = app.snapshot().elapsed; app.advance(20); assert.equal(app.snapshot().elapsed, elapsed);
  assert.equal(app.ids.get('statsDialog').emit('cancel').defaultPrevented, true);
  app.advance(4); assert.equal(app.snapshot().paused, false); assert.ok(app.snapshot().elapsed > elapsed);
  app.click('pauseBtn'); app.click('statsBtn'); app.click('continueStatsBtn');
  assert.equal(app.snapshot().paused, true); assert.equal(app.ids.get('pauseDialog').open, true);
});

test('앱 VM: 훈련 R은 새 엔진으로 초기화하고 반복 keydown은 초기화를 중복하지 않는다', () => {
  const app = boot(), oldGame = app.start();
  app.key('Space'); app.advance(90); app.release('Space');
  assert.ok(oldGame.player.shotsFired > 0); assert.ok(oldGame.state.elapsed > 1);
  app.key('KeyR'); const fresh = app.game();
  assert.notEqual(fresh, oldGame); assert.equal(fresh.state.mode, 'training');
  assert.equal(fresh.state.elapsed, 0); assert.equal(fresh.player.shotsFired, 0);
  assert.equal(fresh.player.hp, fresh.player.maxHp); assert.equal(fresh.player.ammo, 3);
  const instances = app.instances.length; app.key('KeyR', true); assert.equal(app.instances.length, instances);
  app.release('KeyR'); app.advance(45); assert.equal(app.snapshot().playing, true);
});

test('앱 VM: Q는 한 프레임의 edge이며 누른 채 쿨다운이 끝나도 재사용되지 않는다', () => {
  const app = boot(), game = app.start('training', 'ranger');
  app.key('KeyQ'); app.advance(1, 100);
  assert.equal(game.appInputs.filter(input => input.gadget).length, 1);
  assert.ok(game.player.gadgetCooldown > 0);
  for (let i = 0; i < 220; i++) { app.key('KeyQ', true); app.advance(); }
  assert.equal(game.player.gadgetCooldown, 0);
  assert.equal(game.appInputs.filter(input => input.gadget).length, 1);
  app.release('KeyQ'); app.key('KeyQ'); app.advance(2);
  assert.equal(game.appInputs.filter(input => input.gadget).length, 2);
  assert.equal(game.state.events.filter(event => event.type === 'gadget').length, 2);
});

for (const canceled of ['move', 'aim']) {
  test(`앱 VM: ${canceled} 터치 취소·capture 손실은 다른 포인터를 해제하지 않는다`, () => {
    const app = boot({ touch: true }), game = app.start(), canvas = app.ids.get('gameCanvas');
    const pointer = (id, x) => ({ pointerType: 'touch', pointerId: id, clientX: x, clientY: 300 });
    canvas.emit('pointerdown', pointer(11, 200)); canvas.emit('pointerdown', pointer(22, 800));
    canvas.emit('pointermove', pointer(11, 235)); canvas.emit('pointermove', pointer(22, 835)); app.advance(2);
    assert.ok(game.appInputs.at(-1).moveX > .9); assert.equal(game.appInputs.at(-1).fire, true);
    canvas.emit('pointercancel', pointer(999, 500)); app.advance(2);
    assert.ok(game.appInputs.at(-1).moveX > .9); assert.equal(game.appInputs.at(-1).fire, true);
    const id = canceled === 'move' ? 11 : 22;
    canvas.emit('pointercancel', pointer(id, canceled === 'move' ? 235 : 835));
    canvas.emit('lostpointercapture', pointer(id, 500)); app.advance(2);
    assert.equal(app.ids.get(canceled + 'Zone').classList.contains('active'), false);
    if (canceled === 'move') { assert.equal(game.appInputs.at(-1).moveX, 0); assert.equal(game.appInputs.at(-1).fire, true); }
    else { assert.ok(game.appInputs.at(-1).moveX > .9); assert.equal(game.appInputs.at(-1).fire, false); }
    const other = canceled === 'move' ? 22 : 11;
    canvas.emit('lostpointercapture', pointer(other, 500)); app.advance(2);
    assert.equal(game.appInputs.at(-1).moveX, 0); assert.equal(game.appInputs.at(-1).fire, false);
  });
}

test('앱 VM: 저장한 reducedEffects=false는 OS 모션 줄이기보다 우선하며 설정 변경을 저장한다', () => {
  const app = boot({ reducedMotion: true, settings: { reducedEffects: false } }); app.advance();
  assert.equal(app.ids.get('reducedEffectsCheck').checked, false);
  assert.equal(app.rendererCalls.at(-1).options.reducedEffects, false);
  assert.equal(JSON.parse(app.storage.get(SETTINGS)).reducedEffects, false);
  app.ids.get('reducedEffectsCheck').checked = true; app.ids.get('reducedEffectsCheck').emit('change'); app.advance();
  assert.equal(app.rendererCalls.at(-1).options.reducedEffects, true);
  assert.equal(JSON.parse(app.storage.get(SETTINGS)).reducedEffects, true);
  const noSavedChoice = boot({ reducedMotion: true }); noSavedChoice.advance();
  assert.equal(noSavedChoice.rendererCalls.at(-1).options.reducedEffects, true);
});

test('앱 VM: 훈련 종료 fixture는 전적을 올리지 않고 일반 경기 종료는 한 번만 기록한다', () => {
  const app = boot({ records: { games: 7, wins: 3 } });
  function finishFixture(mode) {
    const game = app.start(mode);
    // Public state mutation is intentional: this tests the app's result guard,
    // not whether the engine naturally ends training (covered by engine tests).
    game.state.status = 'ended';
    game.state.result = { winner: game.player.team, won: true, title: '검증 종료', reason: 'app result fixture' };
    app.advance(3); assert.equal(app.ids.get('resultDialog').open, true);
    app.advance(20);
  }
  finishFixture('training');
  assert.deepEqual(JSON.parse(app.storage.get(RECORDS)), { games: 7, wins: 3 });
  assert.equal(app.ids.get('recordGames').textContent, '7');
  app.click('changeBtn'); finishFixture('gem');
  assert.deepEqual(JSON.parse(app.storage.get(RECORDS)), { games: 8, wins: 4 });
  assert.equal(app.ids.get('recordGames').textContent, '8'); assert.equal(app.ids.get('recordWins').textContent, '4');
});

test('앱 VM v3: 핫 존 HUD는 미완료 99.999%를 100%로 표시하지 않고 동시 점유와 기여를 구분한다', () => {
  const app = boot(), game = app.start('hotzone');
  game.aiEnabled = false;
  for (const [index, actor] of game.state.actors.entries()) {
    Object.assign(actor, { x: 110 + index * 170, y: 720, invulnerable: 0 });
  }
  game.state.captureZones[0].progress = [99.999, 12.25];
  game.state.captureZones[1].progress = [99.999, 18.25];
  app.advance(6);
  assert.equal(app.ids.get('objectiveStrip').style.display, 'flex');
  assert.equal(app.ids.get('blueScore').textContent, '99%');
  assert.equal(app.ids.get('zoneABlue').textContent, '99%');
  assert.equal(app.ids.get('zoneBBlue').textContent, '99%');
  assert.equal(app.ids.get('zoneARed').textContent, '12%');
  assert.equal(game.state.status, 'playing');

  const zone = game.state.captureZones[0];
  zone.progress = [20, 30];
  Object.assign(game.player, { x: zone.x - 35, y: zone.y });
  const enemy = game.state.actors.find(actor => actor.team !== game.player.team);
  Object.assign(enemy, { x: zone.x + 35, y: zone.y });
  app.advance(6);
  assert.ok(app.ids.get('zoneAStatus').classList.contains('both-active'));
  assert.equal(app.ids.get('zoneABlue').textContent, '20%');
  assert.equal(app.ids.get('zoneARed').textContent, '30%');
  game.player.captureTime = 12.3; game.player.damage = 321;
  app.key('KeyT');
  const table = app.ids.get('liveScoreboard').firstChild;
  const headers = table.children[0].children[0].children;
  assert.equal(headers[2].textContent, '전투 피해');
  assert.equal(headers[3].textContent, '목표 기여');
  const row = table.children[1].children.find(item => item.classList.contains('self-row'));
  assert.equal(row.children[2].textContent, '321');
  assert.equal(row.children[3].textContent, '12.3초 점유');
  assert.equal(game.player.damage, 321, 'Presenting objective contribution cannot alter combat damage');
});

test('앱 VM v3: 하이스트 HUD는 금고 체력·보호막을 표시하고 목표 피해를 별도 전황 열에 넣는다', () => {
  const app = boot(), game = app.start('heist');
  game.aiEnabled = false;
  const own = game.state.safes.find(safe => safe.team === game.player.team);
  const enemy = game.state.safes.find(safe => safe.team !== game.player.team);
  Object.assign(enemy, { hp: 18000, shieldsTriggered: 1, shieldTime: 1.6 });
  app.advance(6);
  assert.equal(app.ids.get('blueScore').textContent, '100%');
  assert.equal(app.ids.get('redScore').textContent, '75%');
  assert.ok(app.ids.get('safeRedState').classList.contains('shield-active'));
  assert.match(app.ids.get('safeRedState').textContent, /상대 보호막/);
  assert.match(app.ids.get('safeBlueState').textContent, /24,000 HP/);
  assert.equal(own.hp, own.maxHp);
  game.player.damage = 321; game.player.objectiveDamage = 4321;
  app.key('KeyT');
  const table = app.ids.get('liveScoreboard').firstChild;
  const row = table.children[1].children.find(item => item.classList.contains('self-row'));
  assert.equal(row.children[2].textContent, '321');
  assert.equal(row.children[3].textContent, '4,321 금고');
  assert.equal(game.player.damage, 321);
});

test('앱 VM v3: 카메라 기본값·저장값·C·버튼·설정이 렌더러 옵션으로 연결된다', () => {
  const desktop = boot(); desktop.advance();
  assert.equal(desktop.snapshot().camera, 'overview');
  desktop.start();
  desktop.key('KeyC'); desktop.advance(2);
  assert.equal(desktop.snapshot().camera, 'follow');
  assert.equal(desktop.rendererCalls.at(-1).options.camera, 'follow');
  assert.equal(desktop.ids.get('cameraBtn').getAttribute('aria-pressed'), 'true');
  assert.equal(desktop.ids.get('followCameraCheck').checked, true);
  assert.equal(JSON.parse(desktop.storage.get(SETTINGS)).camera, 'follow');
  desktop.key('KeyC', true); desktop.advance();
  assert.equal(desktop.snapshot().camera, 'follow', 'Repeated keydown cannot repeatedly toggle the camera');
  desktop.release('KeyC'); desktop.click('cameraBtn'); desktop.advance();
  assert.equal(desktop.rendererCalls.at(-1).options.camera, 'overview');
  desktop.ids.get('followCameraCheck').checked = true;
  desktop.ids.get('followCameraCheck').emit('change'); desktop.advance();
  assert.equal(desktop.rendererCalls.at(-1).options.camera, 'follow');

  const touchDefault = boot({ touch: true }); touchDefault.start();
  assert.equal(touchDefault.rendererCalls.at(-1).options.camera, 'follow');
  const touchSaved = boot({ touch: true, settings: { camera: 'overview' } }); touchSaved.start();
  assert.equal(touchSaved.rendererCalls.at(-1).options.camera, 'overview');
  const desktopSaved = boot({ settings: { camera: 'follow' } }); desktopSaved.start();
  assert.equal(desktopSaved.rendererCalls.at(-1).options.camera, 'follow');
});

test('앱 VM v3: 마우스가 멈춰도 새 카메라 변환으로 조준을 갱신하며 터치는 상대 방향을 유지한다', () => {
  const app = boot({ settings: { camera: 'follow' } }), game = app.start();
  const canvas = app.ids.get('gameCanvas');
  canvas.emit('pointermove', { pointerType: 'mouse', clientX: 500, clientY: 280 });
  app.advance(2);
  const firstAim = game.appInputs.at(-1).aimX;
  Object.assign(app.rendererTransform, { scale: 1.5, offsetX: 180, offsetY: 75 });
  app.advance(2); // No additional pointer event: the app must re-query the transform.
  const command = game.appInputs.at(-1);
  assert.ok(Math.abs(command.aimX - (500 * 1.28 / 1.5 + 180)) < 1e-6);
  assert.ok(Math.abs(command.aimY - (280 * 1.28 / 1.5 + 75)) < 1e-6);
  assert.notEqual(command.aimX, firstAim);
  assert.equal(app.coordinateCalls.at(-1).clientX, 500);
  assert.equal(app.coordinateCalls.at(-1).clientY, 280);
  assert.equal(app.rendererCalls.at(-1).options.aimX, command.aimX);

  const touch = boot({ touch: true }), touchGame = touch.start();
  Object.assign(touch.rendererTransform, { scale: 2, offsetX: 700, offsetY: 400 });
  const surface = touch.ids.get('gameCanvas');
  surface.emit('pointerdown', { pointerType: 'touch', pointerId: 22, clientX: 800, clientY: 300 });
  surface.emit('pointermove', { pointerType: 'touch', pointerId: 22, clientX: 835, clientY: 300 });
  touch.advance(2);
  const touchInput = touchGame.appInputs.at(-1);
  assert.ok(touchInput.aimX - touchGame.player.x > 500);
  assert.ok(Math.abs(touchInput.aimY - touchGame.player.y) < 1e-6);
});

function quietV4(game) {
  game.aiEnabled = false;
  for (const name of ['walls', 'bushes', 'projectiles', 'fields', 'pickups']) game.state[name].length = 0;
  game.state.actors.forEach((a, i) => Object.assign(a, { x: 120 + i * 190, y: 700, invulnerable: 0 }));
}
function queueDeath(game, victim, killer) {
  victim.invulnerable = 0; victim.shieldTime = 0; victim.dashTime = 0;
  game.state.projectiles.push({ id: 'app-fixture-' + victim.id, x: victim.x - 1, y: victim.y,
    vx: 60, vy: 0, r: 2, team: killer.team, ownerId: killer.id, color: '#ffffff', kind: 'bullet',
    damage: 100000, remaining: 100, life: 1, hitIds: [], super: false });
}
function advanceUntil(app, condition, frames = 200) {
  for (let i = 0; !condition() && i < frames; i++) app.advance();
  assert.ok(condition(), 'Expected app/engine transition within the frame allowance');
  app.advance(6); // The real HUD intentionally refreshes at a lower rate.
}

test('앱 VM v4: 녹아웃 관전은 아군만 순환하고 대상 사망·전멸·새 라운드에 맞춰 복귀한다', () => {
  const app = boot({ settings: { camera: 'follow' } }), game = app.start('knockout');
  quietV4(game);
  const allies = game.state.actors.filter(a => a.team === 0 && !a.isPlayer);
  const enemy = game.state.actors.find(a => a.team === 1);
  queueDeath(game, game.player, enemy); app.advance(6);
  assert.equal(app.snapshot().status, 'playing'); assert.equal(app.snapshot().spectatorId, allies[0].id);
  assert.equal(app.rendererCalls.at(-1).options.focusId, allies[0].id);
  assert.equal(app.rendererCalls.at(-1).options.showAim, false);
  assert.equal(app.ids.get('spectatorBar').style.display, 'flex');
  assert.match(app.ids.get('spectatorName').textContent, new RegExp(allies[0].name));
  assert.ok(app.document.body.classList.contains('spectating'));
  assert.equal(app.ids.get('respawn').style.display, 'none');
  assert.equal(app.ids.get('superBtn').disabled, true); assert.equal(app.ids.get('gadgetBtn').disabled, true);
  assert.equal(app.key('Tab').defaultPrevented, true); app.advance(6);
  assert.equal(app.snapshot().spectatorId, allies[1].id);
  app.key('Tab', true); app.advance(); assert.equal(app.snapshot().spectatorId, allies[1].id);
  app.release('Tab'); app.click('nextSpectatorBtn'); app.advance(6);
  assert.equal(app.snapshot().spectatorId, allies[0].id);
  queueDeath(game, allies[0], enemy); app.advance(6);
  assert.equal(app.snapshot().spectatorId, allies[1].id);
  assert.equal(app.ids.get('nextSpectatorBtn').disabled, true);
  assert.equal(app.rendererCalls.at(-1).options.focusId, allies[1].id);
  queueDeath(game, allies[1], enemy); app.advance(6);
  assert.equal(app.snapshot().round.phase, 'break'); assert.equal(app.snapshot().spectatorId, null);
  assert.equal(app.rendererCalls.at(-1).options.focusId, null);
  assert.equal(app.ids.get('spectatorBar').style.display, 'none');
  assert.equal(app.ids.get('roundPanel').style.display, 'block');
  advanceUntil(app, () => game.state.round.number === 2);
  assert.equal(game.player.alive, true); assert.equal(app.snapshot().spectatorId, null);
  assert.equal(app.rendererCalls.at(-1).options.focusId, null);
  assert.equal(app.ids.get('roundPanel').style.display, 'none');
  assert.equal(app.ids.get('superBtn').disabled, false); assert.equal(app.ids.get('gadgetBtn').disabled, false);
  assert.equal(app.document.body.classList.contains('spectating'), false);
  assert.equal(app.document.body.classList.contains('round-break'), false);
  assert.equal(app.ids.get('knockoutAliveState').textContent, '생존 3 : 3');
  assert.match(app.ids.get('knockoutRoundState').textContent, /R2/);
});

test('앱 VM v4: 라운드 결과·시계·생존 기여는 표시하되 최종 경기만 한 번 기록한다', () => {
  const app = boot({ records: { games: 7, wins: 3 } }), game = app.start('knockout');
  quietV4(game);
  const enemies = game.state.actors.filter(a => a.team === 1);
  for (const e of enemies) queueDeath(game, e, game.player);
  app.advance(6);
  assert.equal(game.state.status, 'playing'); assert.equal(app.ids.get('resultDialog').open, false);
  assert.equal(app.ids.get('roundPanel').style.display, 'block');
  assert.equal(app.ids.get('roundTitle').textContent, '라운드 승리!');
  assert.match(app.ids.get('roundSummary').textContent, /1 : 0/);
  assert.ok(app.ids.get('roundSummary').textContent.includes(game.state.round.lastReason));
  assert.match(app.ids.get('roundCountdown').textContent, /초 후 다음 라운드/);
  assert.equal(app.ids.get('blueScore').textContent, '1'); assert.equal(app.ids.get('redScore').textContent, '0');
  assert.match(app.ids.get('hudMode').textContent, /녹아웃.*R1/);
  assert.deepEqual(JSON.parse(app.storage.get(RECORDS)), { games: 7, wins: 3 });
  assert.equal(app.snapshot().round.history.length, 1);
  app.key('KeyT');
  const table = app.ids.get('liveScoreboard').firstChild;
  const self = table.children[1].children.find(row => row.classList.contains('self-row'));
  assert.equal(self.children[3].textContent, '1회 승리 생존');
  app.click('continueStatsBtn');
  advanceUntil(app, () => game.state.round.number === 2);
  assert.match(app.ids.get('hudMode').textContent, /R2/);
  assert.match(app.ids.get('matchTime').textContent, /1:1[45]/);
  // The overall match deadline must override a fresh round's longer timer.
  game.state.elapsed = 237; app.advance(6);
  assert.match(app.ids.get('matchObjective').textContent, /경기 제한/);
  assert.match(app.ids.get('matchTime').textContent, /0:0[23]/);
  for (const e of enemies) queueDeath(game, e, game.player);
  app.advance(6);
  assert.equal(game.state.status, 'ended'); assert.equal(app.ids.get('resultDialog').open, true);
  assert.equal(app.ids.get('roundPanel').style.display, 'none');
  assert.deepEqual(JSON.parse(app.storage.get(RECORDS)), { games: 8, wins: 4 });
  app.advance(20);
  assert.deepEqual(JSON.parse(app.storage.get(RECORDS)), { games: 8, wins: 4 });
});

test('앱 VM v4: 사망·라운드 경계를 건넌 터치와 눌린 키는 새 생명에 공격을 남기지 않는다', () => {
  const app = boot({ touch: true }), game = app.start('knockout'), canvas = app.ids.get('gameCanvas');
  quietV4(game);
  const pointer = (id, x) => ({ pointerType: 'touch', pointerId: id, clientX: x, clientY: 300 });
  canvas.emit('pointerdown', pointer(11, 200)); canvas.emit('pointermove', pointer(11, 235));
  canvas.emit('pointerdown', pointer(22, 800)); canvas.emit('pointermove', pointer(22, 835));
  app.advance(3); assert.ok(game.appInputs.at(-1).moveX > 0); assert.equal(game.appInputs.at(-1).fire, true);
  const enemy = game.state.actors.find(a => a.team === 1);
  queueDeath(game, game.player, enemy); app.advance(6);
  assert.equal(app.ids.get('moveZone').classList.contains('active'), false);
  assert.equal(app.ids.get('aimZone').classList.contains('active'), false);
  const fired = game.player.shotsFired;
  app.key('KeyD'); app.key('Space'); app.key('KeyQ'); app.key('KeyE'); app.advance(3);
  assert.equal(game.appInputs.at(-1).moveX, 0); assert.equal(game.appInputs.at(-1).fire, false);
  assert.equal(game.appInputs.at(-1).gadget, false); assert.equal(game.appInputs.at(-1).super, false);
  for (const ally of game.state.actors.filter(a => a.team === 0 && a.alive)) queueDeath(game, ally, enemy);
  app.advance(6); assert.equal(game.state.round.phase, 'break');
  app.key('KeyW'); app.key('Space'); app.key('KeyQ'); app.key('KeyE');
  advanceUntil(app, () => game.state.round.number === 2);
  app.advance(8);
  assert.equal(game.player.alive, true); assert.equal(game.player.shotsFired, fired);
  assert.equal(game.player.x, game.player.spawnX); assert.equal(game.player.y, game.player.spawnY);
  assert.equal(game.appInputs.at(-1).moveX, 0); assert.equal(game.appInputs.at(-1).moveY, 0);
  assert.equal(game.appInputs.at(-1).fire, false); assert.equal(game.appInputs.at(-1).gadget, false);
  assert.equal(game.appInputs.at(-1).super, false);
});

test('앱 VM v4: 바운티는 누적 점수·블루 소유팀·개인 현상금·획득/허용 별을 구분한다', () => {
  const app = boot(), game = app.start('bounty'); quietV4(game);
  const p = game.player, enemy = game.state.actors.find(a => a.team === 1), blue = game.state.bounty.blueStar;
  game.state.score = [12, 9]; Object.assign(p, { bountyValue: 6, starsEarned: 9, starsLost: 4, damage: 321 });
  app.advance(6);
  assert.equal(app.ids.get('blueScore').textContent, '12'); assert.equal(app.ids.get('redScore').textContent, '9');
  assert.equal(app.ids.get('bountyBlueState').textContent, '파란 별 · 전장');
  assert.equal(app.ids.get('bountyValueState').textContent, '내 현상금 ★6');
  Object.assign(blue, { carrierId: p.id, team: 0, onGround: false, firstClaimed: true }); app.advance(6);
  assert.equal(app.ids.get('bountyBlueState').textContent, '파란 별 · 우리');
  assert.ok(app.ids.get('bountyBlueState').classList.contains('ally'));
  Object.assign(blue, { carrierId: enemy.id, team: 1 }); app.advance(6);
  assert.equal(app.ids.get('bountyBlueState').textContent, '파란 별 · 상대');
  assert.ok(app.ids.get('bountyBlueState').classList.contains('enemy'));
  assert.equal(app.snapshot().bounty.blueStar.carrierId, enemy.id);
  app.key('KeyT');
  let table = app.ids.get('liveScoreboard').firstChild;
  let row = table.children[1].children.find(item => item.classList.contains('self-row'));
  assert.equal(row.children[2].textContent, '321'); assert.equal(row.children[3].textContent, '★9 획득 / 4 허용');
  app.click('continueStatsBtn');
  enemy.bountyValue = 5; queueDeath(game, enemy, p); app.advance(6);
  assert.equal(app.ids.get('blueScore').textContent, '17');
  assert.equal(app.ids.get('bountyBlueState').textContent, '파란 별 · 우리');
  assert.equal(app.ids.get('bountyValueState').textContent, '내 현상금 ★7');
  assert.match(app.ids.get('killFeed').textContent, /\+5★/);
  assert.equal(app.snapshot().player.starsEarned, 14); assert.equal(app.snapshot().player.starsLost, 4);
  assert.equal(game.state.status, 'playing');
});
