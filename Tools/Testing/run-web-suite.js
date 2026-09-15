/* eslint-disable no-console */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..', '..');
const gamePath = path.join(projectRoot, 'game.js');
const source = fs.readFileSync(gamePath, 'utf8');

function check(condition, message) {
  assert.ok(condition, message);
}

function makeClassList() {
  return {
    values: new Set(),
    add(value) { this.values.add(value); },
    remove(value) { this.values.delete(value); },
    toggle(value, force) {
      const enabled = force === undefined ? !this.values.has(value) : force;
      if (enabled) this.values.add(value); else this.values.delete(value);
      return enabled;
    },
  };
}

function createRuntime(options = {}) {
  let runtimeSource = source;
  if (options.asteroidType) {
    runtimeSource = runtimeSource
      .replace("{ id: 'outer-shards', x: 22000, y: 16000, radius: 1250, count: 7 }", "{ id: 'outer-shards', x: 9000, y: 10000, radius: 1, count: 1 }")
      .replace(
        'state.asteroids.push(makeAsteroid(asteroidTypeForRoll(), x, y));',
        `const injected = makeAsteroid('${options.asteroidType}', state.player.x, state.player.y); injected.vx = 0; injected.vy = 0; state.player.vx = ${options.playerVelocity ?? -100}; state.asteroids.push(injected);`,
      );
  }
  runtimeSource = runtimeSource.replace(
    '  resetGame(); requestAnimationFrame(frame);',
    '  resetGame(); window.__captainTest = { state, input, handleCanvasClick }; requestAnimationFrame(frame);',
  );

  const elements = new Map();
  const frames = [];
  const context2d = new Proxy({}, {
    get(target, key) {
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (key === 'measureText') return () => ({ width: 0 });
      return typeof target[key] === 'undefined' ? () => {} : target[key];
    },
    set(target, key, value) { target[key] = value; return true; },
  });
  const makeElement = (selector, dataset = {}) => {
    const element = {
      textContent: '', dataset, classList: makeClassList(), listeners: {}, attributes: {},
      addEventListener(type, handler) { this.listeners[type] = handler; },
      setAttribute(key, value) { this.attributes[key] = String(value); },
      querySelector(child) { return makeElement(`${selector} ${child}`); },
      getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 720 }; },
    };
    if (selector === '#game') { element.width = 1280; element.height = 720; element.getContext = () => context2d; }
    elements.set(selector, element);
    return element;
  };
  const touchKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].map((code) => makeElement(`#touch-${code}`, { touchKey: code }));
  const touchControls = makeElement('#touch-controls');
  touchControls.querySelectorAll = (selector) => selector === '[data-touch-key]' ? touchKeys : [];
  for (const selector of [
    '#game', '#overlay', '#launch-button', '#restart-button', '#station-button', '#touch-move-button', '#zoom-out-button', '#zoom-in-button',
    '#hull-readout', '#salvage-readout', '#wave-readout', '#threat-readout', '#heat-readout', '#mass-readout', '#mission-title', '#mission-copy',
  ]) makeElement(selector);
  const sandbox = {
    console, Math, Image: class Image {}, performance: { now: () => 0 }, navigator: {}, location: { protocol: 'file:', hostname: '' },
    document: { querySelector(selector) { return elements.get(selector) || makeElement(selector); } },
    requestAnimationFrame(callback) { frames.push(callback); return frames.length; },
  };
  sandbox.window = sandbox;
  sandbox.addEventListener = () => {};
  vm.runInNewContext(runtimeSource, sandbox, { filename: 'game.js' });
  const launch = () => elements.get('#launch-button').listeners.click({});
  const nextFrame = (time) => {
    const callback = frames.shift();
    check(callback, '게임 프레임이 예약되어야 합니다.');
    callback(time);
  };
  return { elements, touchKeys, sandbox, launch, nextFrame };
}

function testSyntax() {
  for (const file of ['game.js', 'sw.js']) {
    const result = spawnSync(process.execPath, ['--check', file], { cwd: projectRoot, encoding: 'utf8' });
    check(result.status === 0, `${file} 문법 확인 실패: ${result.stderr}`);
  }
  check(!source.includes('<<<<<<<'), '병합 충돌 표식이 없어야 합니다.');
}

function testRuntime() {
  const small = createRuntime({ asteroidType: 'small' });
  small.launch();
  const smallBefore = small.sandbox.__captainTest.state.player.modules.map((module) => module.hp);
  small.nextFrame(16.7);
  const smallAfter = small.sandbox.__captainTest.state.player.modules.map((module) => module.hp);
  assert.deepStrictEqual(smallAfter, smallBefore, '소형 운석은 고충격 충돌에서도 모듈 피해가 없어야 합니다.');
  assert.strictEqual(small.sandbox.__captainTest.state.asteroids.length, 1, '접근 운석 지대는 운석을 생성해야 합니다.');

  const large = createRuntime({ asteroidType: 'large' });
  large.launch();
  const largeBefore = large.sandbox.__captainTest.state.player.modules.map((module) => module.hp);
  large.nextFrame(16.7);
  const largeAfter = large.sandbox.__captainTest.state.player.modules.map((module) => module.hp);
  check(largeAfter.some((hp, index) => hp < largeBefore[index]), '대형 운석은 임계값 초과 충돌에서 모듈 피해를 줘야 합니다.');
}

function testPlatform() {
  const index = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'manifest.webmanifest'), 'utf8'));
  const worker = fs.readFileSync(path.join(projectRoot, 'sw.js'), 'utf8');
  check(/rel="manifest" href="manifest\.webmanifest"/.test(index), 'PWA 매니페스트 링크가 필요합니다.');
  check(manifest.display === 'standalone' && manifest.orientation === 'landscape', 'PWA는 standalone 가로 화면이어야 합니다.');
  check(manifest.icons.every((icon) => fs.existsSync(path.join(projectRoot, icon.src))), '매니페스트 아이콘 파일이 필요합니다.');
  for (const asset of ['./index.html', './styles.css', './game.js', './manifest.webmanifest']) check(worker.includes(asset), `앱 셸 자산 누락: ${asset}`);

  const runtime = createRuntime();
  runtime.launch();
  const player = runtime.sandbox.__captainTest.state.player;
  const initialY = player.y;
  const forward = runtime.touchKeys.find((button) => button.dataset.touchKey === 'KeyW');
  forward.listeners.pointerdown({ pointerId: 1, preventDefault() {} });
  runtime.nextFrame(16.7); runtime.nextFrame(33.4);
  check(player.y < initialY, 'Android 전진 버튼은 PC 전진과 같은 2D 추진을 적용해야 합니다.');
  forward.listeners.pointerup({ preventDefault() {} });
  check(!runtime.sandbox.__captainTest.input.has('KeyW'), '터치 해제는 가상 키를 제거해야 합니다.');
  runtime.elements.get('#zoom-out-button').listeners.click({});
  assert.strictEqual(runtime.sandbox.__captainTest.state.zoom, .9, '축소 버튼은 직교 줌을 바꿔야 합니다.');
  runtime.elements.get('#touch-move-button').listeners.click({});
  runtime.sandbox.__captainTest.handleCanvasClick({ clientX: 640, clientY: 322, shiftKey: false });
  check(runtime.sandbox.__captainTest.state.carried, 'MOVE 상태의 모듈 탭은 재장착용 부품을 들어야 합니다.');
}

const suite = process.argv[2] || 'all';
const runners = { syntax: testSyntax, runtime: testRuntime, platform: testPlatform };
try {
  if (suite === 'all') Object.entries(runners).forEach(([name, runner]) => { runner(); console.log(`[PASS] ${name}`); });
  else {
    check(runners[suite], `알 수 없는 스위트: ${suite}`);
    runners[suite]();
    console.log(`[PASS] ${suite}`);
  }
} catch (error) {
  console.error(`[FAIL] ${suite}: ${error.stack || error.message}`);
  process.exitCode = 1;
}
