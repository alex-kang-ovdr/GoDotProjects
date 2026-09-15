/* eslint-disable no-console */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '..', '..');
const gamePath = path.join(projectRoot, 'game.js');
const balancePath = path.join(projectRoot, 'data', 'balance.js');
const visualTuningPath = path.join(projectRoot, 'data', 'visual-tuning.js');
const source = fs.readFileSync(gamePath, 'utf8');
const balanceSource = fs.readFileSync(balancePath, 'utf8');
const visualTuningSource = fs.readFileSync(visualTuningPath, 'utf8');

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
    '  resetGame(); window.__captainTest = { state, input, handleCanvasClick, camera, toScreen, toWorld, damageModule, moduleCells, openSockets, shipVisualShake, shipVisualAngle, makeLoosePart, modulePosition, findAttachTarget, totalAmmo, fireMissile, updateAutoMiniMissiles, modulesConnectedToControlTower }; requestAnimationFrame(frame);',
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
  const touchKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyF'].map((code) => makeElement(`#touch-${code}`, { touchKey: code }));
  const touchControls = makeElement('#touch-controls');
  touchControls.querySelectorAll = (selector) => selector === '[data-touch-key]' ? touchKeys : [];
  for (const selector of [
    '#game', '#overlay', '#launch-button', '#restart-button', '#station-button', '#touch-move-button', '#zoom-out-button', '#zoom-in-button',
    '#dialogue-panel', '#dialogue-icon', '#dialogue-speaker', '#dialogue-title', '#dialogue-body', '#dialogue-choices', '#dialogue-choice-0', '#dialogue-choice-1', '#dialogue-advance',
    '#hull-readout', '#salvage-readout', '#wave-readout', '#threat-readout', '#heat-readout', '#mass-readout', '#mission-title', '#mission-copy',
  ]) makeElement(selector);
  const sandbox = {
    console, Math, Image: class Image {}, performance: { now: () => 0 }, navigator: {}, location: { protocol: 'file:', hostname: '' },
    document: { querySelector(selector) { return elements.get(selector) || makeElement(selector); } },
    requestAnimationFrame(callback) { frames.push(callback); return frames.length; },
  };
  sandbox.window = sandbox;
  sandbox.addEventListener = () => {};
  vm.runInNewContext(balanceSource, sandbox, { filename: 'data/balance.js' });
  vm.runInNewContext(visualTuningSource, sandbox, { filename: 'data/visual-tuning.js' });
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
  for (const file of ['data/balance.js', 'data/visual-tuning.js', 'game.js', 'sw.js']) {
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
  const largeShieldBefore = large.sandbox.__captainTest.state.player.shieldLayers;
  large.nextFrame(16.7);
  check(large.sandbox.__captainTest.state.player.shieldLayers < largeShieldBefore, '기본 방어막은 첫 대형 운석 충격 레이어를 흡수해야 합니다.');
  const largeShip = large.sandbox.__captainTest.state.player;
  largeShip.shieldLayers = 0;
  const exposedModule = largeShip.modules.find((module) => module.type !== 'core');
  large.sandbox.__captainTest.damageModule(largeShip, exposedModule, 8, largeShip.x, largeShip.y, '#ffffff', true);
  const largeAfter = large.sandbox.__captainTest.state.player.modules.map((module) => module.hp);
  check(largeAfter.some((hp, index) => hp < largeBefore[index]), '방어막이 비면 충격 피해는 모듈에 적용되어야 합니다.');

  const footprint = createRuntime();
  footprint.launch();
  const ship = footprint.sandbox.__captainTest.state.player;
  const beam = ship.addModule('beam4', 3, 2);
  check(beam, '4칸 빔은 연속된 빈 격자에 장착되어야 합니다.');
  assert.strictEqual(footprint.sandbox.__captainTest.moduleCells(beam).length, 4, 'BEAM-4는 4칸을 점유해야 합니다.');
  assert.strictEqual(ship.getModule(6, 2), beam, '다칸 파트의 끝 격자도 점유로 인식해야 합니다.');
  check(footprint.sandbox.__captainTest.openSockets(ship).some((socket) => socket.gx === 7 && socket.gy === 2), '다칸 파트 끝의 바깥 격자는 연결 소켓이어야 합니다.');
  const plate = ship.addModule('plate4', -3, 2);
  check(plate && footprint.sandbox.__captainTest.moduleCells(plate).length === 4, 'PLATE-4는 2×2 네 격자를 점유해야 합니다.');
  check(['block', 'beam2', 'beam3', 'wedge', 'wedgeLong'].every((type) => balanceSource.includes(`${type}: {`)), '1·2·3칸 박스와 1·2칸 삼각 기둥 정의가 필요합니다.');

  const interaction = createRuntime();
  interaction.launch();
  const interactionApi = interaction.sandbox.__captainTest;
  const interactionShip = interactionApi.state.player;
  check(interactionApi.state.dialogueCurrent && interaction.elements.get('#dialogue-title').textContent.includes('잔해 항로'), '출항 시 RPG 튜토리얼 대화가 시작되어야 합니다.');
  interaction.elements.get('#dialogue-choice-0').listeners.click({});
  assert.strictEqual(interactionApi.state.tutorialStage, 'move', '튜토리얼 선택은 비행 절차 상태를 시작해야 합니다.');
  const carryPart = interactionApi.makeLoosePart('block', interactionShip.x + 120, interactionShip.y, 0, 0, { neutral: true, salvageable: true });
  interactionApi.state.debris.push(carryPart);
  const carryStart = interactionApi.toScreen(carryPart.x, carryPart.y, interactionApi.camera());
  const targetSocket = interactionApi.openSockets(interactionShip)[0];
  const targetWorld = interactionApi.modulePosition(interactionShip, targetSocket);
  const targetScreen = interactionApi.toScreen(targetWorld.x, targetWorld.y, interactionApi.camera());
  const interactionCanvas = interaction.elements.get('#game');
  const pointerEvent = (button, pointerId, point) => ({ button, pointerId, clientX: point.x, clientY: point.y, preventDefault() {} });
  const modulesBeforeCarry = interactionShip.modules.length;
  interactionCanvas.listeners.pointerdown(pointerEvent(0, 31, carryStart));
  check(interactionApi.state.carried?.source === 'loose' && !interactionApi.state.debris.includes(carryPart), '중립 부품을 누르면 커서 운반 상태가 되어야 합니다.');
  interactionCanvas.listeners.pointermove(pointerEvent(0, 31, targetScreen));
  interactionCanvas.listeners.pointerup(pointerEvent(0, 31, targetScreen));
  check(!interactionApi.state.carried && interactionShip.modules.length === modulesBeforeCarry + 1, '유효 소켓에서 릴리스하면 원하는 위치에 부품을 장착해야 합니다.');

  const bayA = interactionApi.makeLoosePart('ammoBay', interactionShip.x + 190, interactionShip.y, 0, 0, { neutral: true, salvageable: true });
  const bayB = interactionApi.makeLoosePart('ammoBay', interactionShip.x + 228, interactionShip.y, 0, 0, { neutral: true, salvageable: true });
  interactionApi.state.debris.push(bayA, bayB);
  const bayAScreen = interactionApi.toScreen(bayA.x, bayA.y, interactionApi.camera());
  const bayBScreen = interactionApi.toScreen(bayB.x, bayB.y, interactionApi.camera());
  interactionCanvas.listeners.pointerdown(pointerEvent(0, 32, bayAScreen));
  interactionCanvas.listeners.pointerup(pointerEvent(0, 32, bayBScreen));
  check(interactionApi.state.carried?.type === 'ammoBay' && interactionApi.state.carried.ammo === 12 && interactionApi.state.carried.maxHp > 24, '같은 MISSILE BAY 릴리스 병합은 재고를 합치고 더 튼튼한 부품을 커서에 남겨야 합니다.');
  interactionApi.state.carried = null;

  const bridge = interactionShip.modules.find((module) => module.type === 'ammoBay');
  const severedA = interactionShip.addModule('block', 4, 0);
  const severedB = interactionShip.addModule('block', 5, 0);
  check(bridge && severedA && severedB, '컨트롤 타워 연결 절단 검증용 브리지와 끝 파트가 필요합니다.');
  interactionShip.shieldLayers = 0;
  interactionApi.damageModule(interactionShip, bridge, 99, interactionShip.x, interactionShip.y, '#ffffff', true);
  check(!interactionShip.modules.includes(severedA) && !interactionShip.modules.includes(severedB) && interactionApi.state.debris.filter((part) => part.neutral && part.salvageable && part.type === 'block').length >= 2, '연결부 파괴 뒤 컨트롤 타워와 끊긴 파트는 중립 부품으로 흩어져야 합니다.');

  const replacementBay = interactionShip.addModule('ammoBay', -5, 2);
  const launcher = interactionShip.addModule('missileLauncher', -4, 3);
  check(replacementBay && launcher, 'MISSILE 발사기와 분리된 MISSILE BAY 파트는 장착 가능해야 합니다.');
  const missileAmmoBefore = interactionApi.totalAmmo(interactionShip, 'missile');
  interactionApi.fireMissile(interactionShip, { x: interactionShip.x + 400, y: interactionShip.y });
  check(interactionApi.state.bullets.some((bullet) => bullet.kind === 'missile') && interactionApi.totalAmmo(interactionShip, 'missile') === missileAmmoBefore - 2, '강한 MISSILE은 분리된 MISSILE BAY 재고 2발을 소비해야 합니다.');
  interactionShip.missileCooldown = 0;
  interactionApi.state.enemies.push({ alive: true, x: interactionShip.x + 160, y: interactionShip.y, name: 'TEST TARGET' });
  const miniAmmoBefore = interactionApi.totalAmmo(interactionShip, 'missile');
  interactionApi.updateAutoMiniMissiles(interactionShip);
  check(interactionApi.state.bullets.filter((bullet) => bullet.kind === 'miniMissile').length === 2 && interactionApi.totalAmmo(interactionShip, 'missile') === miniAmmoBefore - 2, '좌·우 MINI MSL은 근거리 타겟에 자동 발사하고 MISSILE 재고를 각각 소비해야 합니다.');
  interactionShip.missileCooldown = 0;
  const missileCountBeforeClick = interactionApi.state.bullets.filter((bullet) => bullet.kind === 'missile').length;
  const missileTargetScreen = { x: 900, y: 360 };
  interactionCanvas.listeners.pointerdown(pointerEvent(2, 33, missileTargetScreen));
  interactionCanvas.listeners.pointerup(pointerEvent(2, 33, missileTargetScreen));
  check(interactionApi.state.bullets.filter((bullet) => bullet.kind === 'missile').length === missileCountBeforeClick + 1, '우클릭 타겟 클릭은 유도 MISSILE을 발사해야 합니다.');
  interactionShip.addModule('plate4', -5, 5);
  check(interactionShip.shieldMaxLayers === 0, '생성기 커버 질량을 넘는 무거운 함선은 생성 가능한 방어막 레이어가 줄어야 합니다.');

  const standardShake = createRuntime();
  standardShake.launch();
  const standardShip = standardShake.sandbox.__captainTest.state.player;
  standardShip.shieldLayers = 0;
  const armor = standardShip.modules.find((module) => module.type === 'armor');
  standardShake.sandbox.__captainTest.damageModule(standardShip, armor, 99, standardShip.x, standardShip.y, '#ffffff', true);
  const standardStrength = standardShip.shakeStrength;
  const weaponShake = createRuntime();
  weaponShake.launch();
  const weaponShip = weaponShake.sandbox.__captainTest.state.player;
  weaponShip.shieldLayers = 0;
  const weapon = weaponShip.modules.find((module) => module.type === 'laser');
  weaponShake.sandbox.__captainTest.damageModule(weaponShip, weapon, 99, weaponShip.x, weaponShip.y, '#ffffff', true);
  check(weaponShip.shakeStrength > standardStrength, '무기 파괴 흔들림은 일반 파트보다 커야 합니다.');
  check(weaponShip.shakeTime > 0 && weaponShake.sandbox.__captainTest.shipVisualShake(weaponShip), '파괴 흔들림은 함선 렌더 전용 상태여야 합니다.');
}

function testPlatform() {
  const index = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'manifest.webmanifest'), 'utf8'));
  const worker = fs.readFileSync(path.join(projectRoot, 'sw.js'), 'utf8');
  check(/rel="manifest" href="manifest\.webmanifest"/.test(index), 'PWA 매니페스트 링크가 필요합니다.');
  check(/<script src="data\/balance\.js"><\/script>/.test(index), '게임보다 먼저 불러오는 단일 밸런스 데이터가 필요합니다.');
  check(/<script src="data\/visual-tuning\.js"><\/script>/.test(index), '게임보다 먼저 불러오는 별도 시각 튜닝 데이터가 필요합니다.');
  check(manifest.display === 'standalone' && manifest.orientation === 'landscape', 'PWA는 standalone 가로 화면이어야 합니다.');
  check(manifest.icons.every((icon) => fs.existsSync(path.join(projectRoot, icon.src))), '매니페스트 아이콘 파일이 필요합니다.');
  for (const asset of ['./index.html', './styles.css', './data/balance.js', './data/visual-tuning.js', './game.js', './manifest.webmanifest']) check(worker.includes(asset), `앱 셸 자산 누락: ${asset}`);

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

  const view = runtime.sandbox.__captainTest.camera();
  assert.strictEqual(runtime.sandbox.__captainTest.state.viewRotation, 0, '기본 카메라는 Top-View 회전 0이어야 합니다.');
  const canvas = runtime.elements.get('#game');
  canvas.listeners.pointerdown({ button: 2, pointerId: 7, clientX: 500, clientY: 300, preventDefault() {} });
  canvas.listeners.pointermove({ pointerId: 7, clientX: 600, clientY: 300, preventDefault() {} });
  check(runtime.sandbox.__captainTest.state.viewRotation !== 0, '우클릭 드래그는 수평 카메라 회전을 바꿔야 합니다.');
  const worldPoint = { x: view.centerX + 140, y: view.centerY - 80 };
  const screenPoint = runtime.sandbox.__captainTest.toScreen(worldPoint.x, worldPoint.y, runtime.sandbox.__captainTest.camera());
  const restoredPoint = runtime.sandbox.__captainTest.toWorld(screenPoint.x, screenPoint.y, runtime.sandbox.__captainTest.camera());
  check(Math.abs(restoredPoint.x - worldPoint.x) < .001 && Math.abs(restoredPoint.y - worldPoint.y) < .001, '회전한 Top-View에서도 화면·월드 좌표가 역변환되어야 합니다.');
  player.angle = .74;
  const socketAngle = runtime.sandbox.__captainTest.shipVisualAngle(player, runtime.sandbox.__captainTest.camera());
  check(Math.abs(socketAngle - (player.angle - runtime.sandbox.__captainTest.state.viewRotation)) < .001 && source.includes('drawSocketOutline') && source.includes('ctx.rotate(socketAngle)'), '장착 소켓과 운반 미리보기는 함선·카메라의 상대 회전을 사용해야 합니다.');
  canvas.listeners.pointerup({ pointerId: 7 });
  check(source.includes("projection: 'orthographic-top'") && source.includes('bevelEdgesForCell') && !source.includes('xShear'), '기울임 없는 Top-View와 9-slice 베벨 규칙이 필요합니다.');
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
