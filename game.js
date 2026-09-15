(() => {
  'use strict';

  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d');
  const overlay = document.querySelector('#overlay');
  const launchButton = document.querySelector('#launch-button');
  const restartButton = document.querySelector('#restart-button');
  const touchControls = document.querySelector('#touch-controls');
  const stationButton = document.querySelector('#station-button');
  const touchMoveButton = document.querySelector('#touch-move-button');
  const zoomOutButton = document.querySelector('#zoom-out-button');
  const zoomInButton = document.querySelector('#zoom-in-button');
  const dialogueUi = {
    panel: document.querySelector('#dialogue-panel'), icon: document.querySelector('#dialogue-icon'), speaker: document.querySelector('#dialogue-speaker'),
    title: document.querySelector('#dialogue-title'), body: document.querySelector('#dialogue-body'), choices: document.querySelector('#dialogue-choices'),
    choiceButtons: [document.querySelector('#dialogue-choice-0'), document.querySelector('#dialogue-choice-1')], advance: document.querySelector('#dialogue-advance'),
  };
  const readouts = {
    hull: document.querySelector('#hull-readout'), salvage: document.querySelector('#salvage-readout'),
    wave: document.querySelector('#wave-readout'), threat: document.querySelector('#threat-readout'),
    heat: document.querySelector('#heat-readout'), mass: document.querySelector('#mass-readout'),
    title: document.querySelector('#mission-title'), copy: document.querySelector('#mission-copy'),
  };
  const input = new Set();
  const WORLD = { width: 190000, height: 100000 };
  const CELL = 38;
  const MODULE_RADIUS = 17;
  const TOP_VIEW = { projection: 'orthographic-top', rotationSensitivity: .0085 };
  const ZOOM = { min: .7, max: 1.5, step: .1 };
  const SHIP_SHAKE = { duration: .16, partPixels: 3.2, weaponPixels: 5.2 };
  const BALANCE = window.CaptainSalvageBalance;
  const VISUALS = window.CaptainSalvageVisuals;
  const PHYSICS = { ...BALANCE.physics, baseInertiaRadius: CELL * BALANCE.physics.baseInertiaCellRadius };
  let uid = 0;

  const MODULES = BALANCE.modules;
  const ASTEROID_TYPES = {
    small: { label: 'SMALL', radius: 14, mass: 1.4, fill: '#55606d', stroke: '#98a6b7', damageThreshold: Infinity, damageScale: 1, maxDamage: 0 },
    medium: { label: 'MEDIUM', radius: 27, mass: 7.5, fill: '#665b55', stroke: '#c7ae92', damageThreshold: 350, damageScale: 105, maxDamage: 8 },
    large: { label: 'LARGE', radius: 46, mass: 18, fill: '#6e5048', stroke: '#e3ae85', damageThreshold: 430, damageScale: 120, maxDamage: 15 },
  };
  const ASTEROID_FIELDS = [
    { id: 'outer-shards', x: 22000, y: 16000, radius: 1250, count: 7 },
    { id: 'rift-debris', x: 47000, y: 28000, radius: 1450, count: 9 },
    { id: 'relay-belt', x: 76000, y: 44000, radius: 1350, count: 7 },
    { id: 'crown-rubble', x: 102000, y: 55000, radius: 1500, count: 9 },
    { id: 'reactor-belt', x: 131000, y: 70000, radius: 1450, count: 9 },
    { id: 'void-shards', x: 154000, y: 80000, radius: 1300, count: 7 },
  ];
  const STATIONS = [
    { id: 'kepler', name: 'KEPLER REPAIR DOCK', x: 33000, y: 19000, upgrade: 'HULL +30', description: '코어 최대 내구도 +30, 전면 수리' },
    { id: 'lyra', name: 'LYRA CONTROL TOWER', x: 86000, y: 47000, upgrade: 'DAMAGE +2 · MISSILE LINK', description: '레이저 피해, 유도 성능·사정거리, 전면 수리' },
    { id: 'perseus', name: 'PERSEUS REACTOR BAY', x: 139000, y: 74000, upgrade: 'COOLING +12 · SHIELD', description: '기본 냉각, 방어막 레이어·복구, 전면 수리' },
  ];
  const MID_BOSSES = [
    { id: 'rift', name: 'RIFT BREAKER', x: 58000, y: 32000, tier: 4, sector: 3 },
    { id: 'crown', name: 'CROWN EATER', x: 113000, y: 59000, tier: 7, sector: 5 },
  ];
  const FINAL_BOSS = { id: 'warden', name: 'VOID WARDEN', x: 166000, y: 83000, tier: 10, sector: 7 };
  const background = { stars: new Image(), nebula: new Image(), starsReady: false, nebulaReady: false };
  background.stars.src = 'References/assets/cc0/bg_1_1_cc0.png';
  background.nebula.src = 'References/assets/cc0/space003_cc0.png';
  background.stars.onload = () => { background.starsReady = true; };
  background.nebula.onload = () => { background.nebulaReady = true; };

  const state = {
    status: 'briefing', time: 0, lastTime: 0, missionTime: 0, player: null,
    enemies: [], debris: [], bullets: [], particles: [], asteroids: [], asteroidFields: [], stations: [], bosses: [], finalBoss: null,
    salvage: 0, carried: null, placementDrag: null, suppressNextClick: false, pointer: null, zoom: 1, viewRotation: 0, cameraDrag: null, touchMoveMode: false, spawnTimer: 4, neutralTimer: 2,
    upgrades: { hull: 0, weapon: 0, cooling: 0, missileGuidance: 0, missileRange: 0, shieldLayers: 0, shieldRecharge: 0 }, dialogueQueue: [], dialogueCurrent: null, tutorialStage: 'inactive', questEvents: new Set(), notice: null, collisionTimers: new Map(),
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const length = (x, y) => Math.hypot(x, y);
  const distanceBetween = (a, b) => length(a.x - b.x, a.y - b.y);
  const randomIn = (min, max) => min + Math.random() * (max - min);
  const angleDelta = (target, current) => Math.atan2(Math.sin(target - current), Math.cos(target - current));
  const cellNoise = (x, y, channel = 0) => {
    let value = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(channel, 1442695041);
    value = Math.imul(value ^ (value >>> 13), 1274126177);
    return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
  };

  class Ship {
    constructor(team, x, y, angle = -Math.PI / 2) {
      this.team = team;
      this.x = x; this.y = y; this.angle = angle;
      this.vx = 0; this.vy = 0; this.angularVelocity = 0; this.activeExhausts = new Map();
      this.coreHp = 100; this.coreMaxHp = 100;
      this.cooldown = 0; this.missileCooldown = 0; this.miniMissileCooldown = 0; this.heat = 0; this.impactTimer = 0; this.shieldLayers = 0; this.shieldTimer = 0; this.shakeTime = 0; this.shakeStrength = 0; this.shakePhase = Math.random() * Math.PI * 2;
      this.modules = [this.makeModule('core', 0, 0)];
      this.name = team === 'player' ? 'YOU' : 'RAIDER';
      this.level = 1; this.isBoss = false; this.destroyed = false; this.shotDamage = 5;
    }

    makeModule(type, gx, gy, hp = MODULES[type].hp, cracks = [], orientation = 0, ammo = MODULES[type].ammo || 0, ammoCapacity = MODULES[type].capacity || 0, maxHp = MODULES[type].hp, mass = MODULES[type].mass) {
      const spec = MODULES[type];
      return { type, gx, gy, hp: Math.min(maxHp, hp), maxHp, mass, cracks: [...cracks], orientation, ammo: Math.max(0, ammo), ammoCapacity: Math.max(0, ammoCapacity), uid: `${type}-${uid += 1}` };
    }
    get alive() { return this.coreHp > 0; }
    get mass() { return this.modules.reduce((total, module) => total + module.mass, 0); }
    get centerOfMass() {
      const weighted = this.modules.reduce((total, module) => {
        const center = moduleGridCenter(module); const mass = module.mass;
        return { x: total.x + center.gx * mass, y: total.y + center.gy * mass, mass: total.mass + mass };
      }, { x: 0, y: 0, mass: 0 });
      return { x: weighted.x / weighted.mass, y: weighted.y / weighted.mass };
    }
    get momentOfInertia() {
      const base = this.mass * PHYSICS.baseInertiaRadius ** 2;
      const com = this.centerOfMass;
      return base + this.modules.reduce((total, module) => {
        const center = moduleGridCenter(module);
        return total + module.mass * CELL ** 2 * ((center.gx - com.x) ** 2 + (center.gy - com.y) ** 2);
      }, 0);
    }
    get radius() {
      const extent = Math.max(0, ...this.modules.flatMap((module) => moduleCells(module).map((cell) => Math.max(Math.abs(cell.gx), Math.abs(cell.gy)))));
      return 24 + extent * CELL;
    }
    get shieldMaxLayers() {
      const generators = this.modulesByType('shieldGenerator');
      const coverage = generators.reduce((total, module) => total + (MODULES[module.type].coverageMass || BALANCE.shield.generatorCoverageMass), 0);
      const massLimitedLayers = Math.floor(coverage / this.mass);
      const configuredMaximum = generators.length + (this.team === 'player' ? state.upgrades.shieldLayers : 0);
      return clamp(Math.min(BALANCE.shield.maxLayers, configuredMaximum, massLimitedLayers), 0, BALANCE.shield.maxLayers);
    }
    get shieldRechargeInterval() {
      return Math.max(BALANCE.shield.minimumRechargeSeconds, BALANCE.shield.baseRechargeSeconds - (this.team === 'player' ? state.upgrades.shieldRecharge : 0));
    }
    modulesByType(type) { return this.modules.filter((module) => module.type === type); }
    getModule(gx, gy) { return this.modules.find((module) => moduleCells(module).some((cell) => cell.gx === gx && cell.gy === gy)); }
    addModule(type, gx, gy, hp, cracks, requestedOrientation = null, ammo = MODULES[type]?.ammo || 0, ammoCapacity = MODULES[type]?.capacity || 0, maxHp = MODULES[type]?.hp, mass = MODULES[type]?.mass) {
      if (!MODULES[type] || this.getModule(gx, gy)) return null;
      const orientations = Number.isInteger(requestedOrientation) ? [requestedOrientation] : [0, 1, 2, 3];
      const orientation = orientations.find((candidate) => moduleCells({ type, gx, gy, orientation: candidate }).every((cell) => !this.getModule(cell.gx, cell.gy)));
      if (orientation === undefined) return null;
      const module = this.makeModule(type, gx, gy, hp, cracks, orientation, ammo, ammoCapacity, maxHp, mass);
      this.modules.push(module);
      return module;
    }
    removeModule(module) {
      if (!module || module.type === 'core') return false;
      this.modules = this.modules.filter((item) => item !== module);
      return true;
    }
    updateMotion(dt) {
      this.cooldown = Math.max(0, this.cooldown - dt);
      this.missileCooldown = Math.max(0, this.missileCooldown - dt);
      this.miniMissileCooldown = Math.max(0, this.miniMissileCooldown - dt);
      this.heat = Math.max(0, this.heat - dt * (18 + state.upgrades.cooling + this.modulesByType('battery').length * 9));
      this.impactTimer = Math.max(0, this.impactTimer - dt);
      this.shakeTime = Math.max(0, this.shakeTime - dt);
      if (this.shakeTime === 0) this.shakeStrength = 0;
      this.vx *= Math.pow(PHYSICS.linearDampingPerSecond, dt);
      this.vy *= Math.pow(PHYSICS.linearDampingPerSecond, dt);
      this.angularVelocity *= Math.pow(PHYSICS.angularDampingPerSecond, dt);
      this.updateShield(dt);
      this.x = clamp(this.x + this.vx * dt, 40, WORLD.width - 40);
      this.y = clamp(this.y + this.vy * dt, 40, WORLD.height - 40);
    }
    updateShield(dt) {
      const maximum = this.shieldMaxLayers;
      if (!maximum) { this.shieldLayers = 0; this.shieldTimer = 0; return; }
      this.shieldLayers = Math.min(this.shieldLayers, maximum);
      if (this.shieldLayers >= maximum) { this.shieldTimer = 0; return; }
      this.shieldTimer += dt;
      if (this.shieldTimer >= this.shieldRechargeInterval) { this.shieldLayers += 1; this.shieldTimer = 0; }
    }
    absorbShieldHit() {
      if (!this.shieldLayers) return false;
      this.shieldLayers -= 1; this.shieldTimer = 0;
      return true;
    }
    clearActuators() {
      this.activeExhausts.clear();
    }
    applyLocalForce(module, localForceX, localForceY, dt) {
      const cos = Math.cos(this.angle); const sin = Math.sin(this.angle);
      const forceX = localForceX * cos - localForceY * sin;
      const forceY = localForceX * sin + localForceY * cos;
      this.vx += forceX / this.mass * dt;
      this.vy += forceY / this.mass * dt;
      const center = moduleGridCenter(module); const com = this.centerOfMass;
      const torque = (center.gx - com.x) * CELL * localForceY - (center.gy - com.y) * CELL * localForceX;
      this.angularVelocity += torque / this.momentOfInertia * dt;
      const forceLength = length(localForceX, localForceY) || 1;
      this.activeExhausts.set(module.uid, { x: -localForceX / forceLength, y: -localForceY / forceLength });
    }
    thrust(amount, dt) {
      if (!amount) return;
      const type = amount > 0 ? 'thruster' : 'reverseThruster';
      const direction = type === 'thruster' ? 1 : -1;
      const drives = this.modulesByType(type);
      const multipliers = type === 'thruster' ? this.balancedForwardMultipliers(drives) : new Map(drives.map((module) => [module.uid, 1]));
      for (const module of drives) {
        const axis = moduleThrustAxis(module);
        const force = MODULES[type].force * Math.abs(amount) * direction * multipliers.get(module.uid);
        this.applyLocalForce(module, axis.x * force, axis.y * force, dt);
      }
    }
    balancedForwardMultipliers(drives) {
      if (drives.length < 2) return new Map(drives.map((module) => [module.uid, 1]));
      const com = this.centerOfMass;
      const torques = drives.map((module) => {
        const center = moduleGridCenter(module); const axis = moduleThrustAxis(module);
        return ((center.gx - com.x) * CELL * axis.y - (center.gy - com.y) * CELL * axis.x);
      });
      const denominator = torques.reduce((sum, torque) => sum + torque ** 2, 0);
      if (denominator < .001) return new Map(drives.map((module) => [module.uid, 1]));
      const correction = torques.reduce((sum, torque) => sum + torque, 0) / denominator;
      const raw = torques.map((torque) => clamp(1 - correction * torque, PHYSICS.forwardThrottleMinimum, PHYSICS.forwardThrottleMaximum));
      const normalize = raw.length / raw.reduce((sum, multiplier) => sum + multiplier, 0);
      return new Map(drives.map((module, index) => [module.uid, raw[index] * normalize]));
    }
    turn(amount, dt) {
      if (!amount) return;
      for (const module of this.modulesByType('rcsThruster')) {
        const center = moduleGridCenter(module); const radius = length(center.gx, center.gy);
        if (radius < .1) continue;
        const force = MODULES.rcsThruster.force * amount;
        this.applyLocalForce(module, -center.gy / radius * force, center.gx / radius * force, dt);
      }
    }
    updatePilot(dt) {
      const turn = (input.has('KeyD') ? 1 : 0) - (input.has('KeyA') ? 1 : 0);
      const thrust = (input.has('KeyW') ? 1 : 0) - (input.has('KeyS') ? .55 : 0);
      this.clearActuators();
      this.turn(turn, dt);
      if (thrust) this.thrust(thrust, dt);
      this.angle += this.angularVelocity * dt;
    }
  }

  function resetGame() {
    const player = new Ship('player', 9000, 10000);
    player.name = 'SALVAGE RIG';
    player.coreHp = player.coreMaxHp = BALANCE.player.coreHp;
    player.modules[0].hp = player.modules[0].maxHp = 200;
    player.addModule('armor', 1, 0);
    player.addModule('laser', 0, -1);
    player.addModule('laser', 0, 1);
    player.addModule('thruster', -1, -1);
    player.addModule('thruster', -1, 1);
    player.addModule('battery', -1, 0);
    player.addModule('reverseThruster', 1, -1);
    player.addModule('reverseThruster', 1, 1);
    player.addModule('rcsThruster', 0, -2);
    player.addModule('rcsThruster', 0, 2);
    player.addModule('shieldGenerator', 2, 0);
    player.addModule('miniMissileLauncher', 2, -1);
    player.addModule('miniMissileLauncher', 2, 1);
    player.addModule('ammoBay', 3, 0);
    player.shieldLayers = 1;
    state.player = player;
    state.enemies = []; state.debris = []; state.bullets = []; state.particles = []; state.asteroids = [];
    state.asteroidFields = ASTEROID_FIELDS.map((field) => ({ ...field, spawned: false }));
    state.stations = STATIONS.map((station) => ({ ...station, used: false, visited: false }));
    state.bosses = MID_BOSSES.map((boss) => ({ ...boss, active: false, defeated: false, ship: null }));
    state.finalBoss = { ...FINAL_BOSS, active: false, defeated: false, ship: null };
    state.missionTime = 0; state.salvage = 0; state.carried = null; state.placementDrag = null; state.suppressNextClick = false; state.zoom = 1; state.viewRotation = 0; state.cameraDrag = null; setTouchMoveMode(false); state.spawnTimer = 3; state.neutralTimer = 1;
    state.upgrades = { hull: 0, weapon: 0, cooling: 0, missileGuidance: 0, missileRange: 0, shieldLayers: 0, shieldRecharge: 0 }; state.dialogueQueue = []; state.dialogueCurrent = null; state.tutorialStage = 'inactive'; state.questEvents = new Set(); hideDialogue(); state.notice = null; state.collisionTimers.clear();
    state.status = 'briefing';
    readouts.hull.textContent = '100%'; readouts.salvage.textContent = '0'; readouts.wave.textContent = '1 / 7';
    readouts.threat.textContent = 'LOW'; readouts.heat.textContent = '0%'; readouts.mass.textContent = player.mass.toFixed(1);
    readouts.title.textContent = '장거리 항로 준비';
    readouts.copy.textContent = '목표 지점까지 설계상 약 30분. 정거장 3곳과 중간 보스 2곳을 돌파하세요.';
  }

  function launch() {
    resetGame();
    state.status = 'running';
    overlay.classList.add('is-hidden');
    notify('SECTOR 1 · OUTER DRIFT', 'W/S 추진, A/D RCS 회전. 중립 부품은 누른 채 빈 소켓에 놓고 Shift+Click으로 장착 부품을 옮깁니다.', 8);
    startTutorialDialogue();
  }

  function notify(title, copy, seconds = 3) {
    state.notice = { title, copy, until: state.time + seconds * 1000 };
  }

  function hideDialogue() {
    dialogueUi.panel.classList.add('is-hidden');
  }

  function showNextDialogue() {
    state.dialogueCurrent = state.dialogueQueue.shift() || null;
    const entry = state.dialogueCurrent;
    if (!entry) { hideDialogue(); return; }
    dialogueUi.panel.classList.remove('is-hidden'); dialogueUi.icon.textContent = entry.icon || '◆'; dialogueUi.speaker.textContent = entry.speaker || 'CONTROL TOWER';
    dialogueUi.title.textContent = entry.title; dialogueUi.body.textContent = entry.body;
    const choices = entry.choices || [];
    dialogueUi.choices.hidden = choices.length === 0; dialogueUi.advance.hidden = choices.length > 0;
    dialogueUi.choiceButtons.forEach((button, index) => {
      const choice = choices[index]; button.hidden = !choice;
      if (choice) button.textContent = choice.label;
    });
  }

  function queueDialogue(entry) {
    state.dialogueQueue.push(entry);
    if (!state.dialogueCurrent) showNextDialogue();
  }

  function chooseDialogue(choiceIndex = null) {
    const choice = choiceIndex === null ? null : state.dialogueCurrent?.choices?.[choiceIndex];
    if (choice?.action === 'beginTutorial') state.tutorialStage = 'move';
    if (choice?.action === 'skipTutorial') state.tutorialStage = 'complete';
    state.dialogueCurrent = null; showNextDialogue();
  }

  function startTutorialDialogue() {
    state.tutorialStage = 'intro';
    queueDialogue({
      icon: '⌁', speaker: 'CONTROL TOWER', title: '잔해 항로 연결',
      body: '조종 리그의 메인·후진·RCS 추진기는 실제 힘과 질량에 따라 반응합니다. 먼저 짧게 기동해 보세요.',
      choices: [{ label: '▶ 비행 절차 시작', action: 'beginTutorial' }, { label: '○ 안내 건너뛰기', action: 'skipTutorial' }],
    });
  }

  function updateTutorialAndQuestEvents() {
    if (state.tutorialStage === 'move' && length(state.player.vx, state.player.vy) > 12) {
      state.tutorialStage = 'salvage';
      const x = state.player.x + Math.cos(state.player.angle) * 180; const y = state.player.y + Math.sin(state.player.angle) * 180;
      state.debris.push(makeLoosePart('block', x, y, 0, 0, { neutral: true, salvageable: true, tutorial: true }));
      queueDialogue({ icon: '▣', speaker: 'SALVAGE AI', title: '퀘스트 · 첫 회수', body: '표시된 중립 블록을 누른 채 함선의 금색 빈 연결 격자에서 놓으세요. 잘못 놓으면 원래 위치로 돌아옵니다.' });
    }
    for (const station of state.stations) {
      const eventId = `station-${station.id}`;
      if (!state.questEvents.has(eventId) && distanceBetween(state.player, station) < 620) {
        state.questEvents.add(eventId);
        queueDialogue({ icon: '⌂', speaker: station.name, title: '퀘스트 · 정거장 접근', body: `${station.upgrade} 업그레이드와 수리를 제공합니다. 표식 220px 안에서 E를 눌러 선택을 확정하세요.` });
      }
    }
  }

  function restoreBriefingOverlay() {
    overlay.querySelector('.eyebrow').textContent = 'LONG-RANGE SALVAGE RUN';
    overlay.querySelector('h2').textContent = '잔해 항로로 출항';
    overlay.querySelector('p:not(.eyebrow)').textContent = '중립 부품을 모으고, 3개 정거장과 2개 중간 보스를 넘어 최종 목표를 향하세요.';
    launchButton.textContent = '출항';
  }

  function showEnd(victory) {
    state.status = victory ? 'victory' : 'gameover';
    overlay.querySelector('.eyebrow').textContent = victory ? 'VOID WARDEN DEFEATED' : 'CORE LOST';
    overlay.querySelector('h2').textContent = victory ? '목표 지점을 확보했습니다' : '지휘 코어가 파괴되었습니다';
    overlay.querySelector('p:not(.eyebrow)').textContent = victory
      ? `${formatTime(state.missionTime)} 동안 ${state.salvage}개의 부품을 회수했습니다.`
      : '새 항해에서 부품 배치와 정거장 업그레이드 순서를 바꿔 보세요.';
    launchButton.textContent = '새 항해';
    overlay.classList.remove('is-hidden');
    readouts.title.textContent = victory ? '항로 확보' : '항해 종료';
    readouts.copy.textContent = victory ? '최종 보스를 격파했습니다.' : 'R 또는 새 항해로 다시 시작할 수 있습니다.';
  }

  function formatTime(seconds) {
    const value = Math.floor(seconds);
    return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
  }

  function modulePosition(ship, module) {
    const center = module.type ? moduleGridCenter(module) : module;
    return gridPosition(ship, center.gx, center.gy);
  }

  function gridPosition(ship, gx, gy) {
    const localX = gx * CELL;
    const localY = gy * CELL;
    const cos = Math.cos(ship.angle);
    const sin = Math.sin(ship.angle);
    return { x: ship.x + localX * cos - localY * sin, y: ship.y + localX * sin + localY * cos };
  }

  function openSockets(ship) {
    const occupied = new Set(ship.modules.flatMap((module) => moduleCells(module).map((cell) => `${cell.gx},${cell.gy}`)));
    const sockets = new Map();
    for (const module of ship.modules) {
      for (const cell of moduleCells(module)) {
        for (const [gx, gy] of [[cell.gx + 1, cell.gy], [cell.gx - 1, cell.gy], [cell.gx, cell.gy + 1], [cell.gx, cell.gy - 1]]) {
        if (!occupied.has(`${gx},${gy}`)) sockets.set(`${gx},${gy}`, { gx, gy });
        }
      }
    }
    return [...sockets.values()];
  }

  function playerPower() {
    const player = state.player;
    const structurePower = player.modules
      .filter((module) => ['block', 'beam2', 'beam3', 'beam4', 'plate4', 'wedge', 'wedgeLong'].includes(module.type))
      .reduce((total, module) => total + moduleCells(module).length * .7, 0);
    return player.modulesByType('armor').length
      + player.modulesByType('thruster').length
      + player.modulesByType('battery').length * 1.5
      + player.modulesByType('laser').length * 2
      + structurePower + state.upgrades.hull * 2 + state.upgrades.weapon * 2 + state.upgrades.cooling;
  }

  function routeSector() {
    const progress = clamp(state.player.x / FINAL_BOSS.x, 0, 1);
    return clamp(Math.floor(progress * 7) + 1, 1, 7);
  }

  function makeEnemy(level, index, x, y) {
    const ship = new Ship('enemy', x, y, Math.random() * Math.PI * 2);
    ship.level = level;
    ship.name = `RAIDER MK-${level}`;
    ship.coreHp = ship.coreMaxHp = 66 + level * 15;
    ship.modules[0].hp = ship.modules[0].maxHp = ship.coreHp;
    ship.shotDamage = 4 + Math.ceil(level * .8);
    ship.addModule('armor', 1, 0);
    ship.addModule('armor', 0, index % 2 ? -1 : 1);
    ship.addModule('laser', 1, index % 2 ? 1 : -1);
    ship.addModule('thruster', -1, -1);
    ship.addModule('thruster', -1, 1);
    ship.addModule('rcsThruster', 0, -2);
    ship.addModule('rcsThruster', 0, 2);
    if (level >= 3) ship.addModule('laser', 0, index % 2 ? -1 : 1);
    if (level >= 5) ship.addModule('battery', -1, 0);
    if (level >= 7) ship.addModule('armor', 2, 0);
    return ship;
  }

  function makeBoss(definition, final = false) {
    const ship = new Ship('enemy', definition.x, definition.y, Math.PI);
    ship.isBoss = true; ship.level = definition.tier; ship.name = definition.name;
    ship.coreHp = ship.coreMaxHp = final ? 920 : 340 + definition.tier * 55;
    ship.modules[0].hp = ship.modules[0].maxHp = ship.coreHp;
    ship.shotDamage = final ? 16 : 10 + definition.tier;
    const armorSlots = [[1, 0], [0, 1], [0, -1], [-1, 1], [-1, -1], [2, 0], [1, 1], [1, -1]];
    for (const [gx, gy] of armorSlots) ship.addModule('armor', gx, gy);
    ship.addModule('laser', 2, 1); ship.addModule('laser', 2, -1);
    ship.addModule('laser', 1, 2); ship.addModule('laser', 1, -2);
    ship.addModule('thruster', -2, -1); ship.addModule('thruster', -2, 1);
    ship.addModule('rcsThruster', -1, -2); ship.addModule('rcsThruster', -1, 2);
    ship.addModule('battery', -1, 0);
    if (final) { ship.addModule('laser', 0, 2); ship.addModule('laser', 0, -2); ship.addModule('armor', 3, 0); }
    return ship;
  }

  function spawnRandomEnemy() {
    const rank = Math.floor(playerPower() / 5);
    const level = clamp(1 + rank + Math.floor(routeSector() * .6), 1, 10);
    const angle = Math.random() * Math.PI * 2;
    const distance = randomIn(760, 1150);
    const x = clamp(state.player.x + Math.cos(angle) * distance, 80, WORLD.width - 80);
    const y = clamp(state.player.y + Math.sin(angle) * distance, 80, WORLD.height - 80);
    state.enemies.push(makeEnemy(level, state.enemies.length, x, y));
    notify(`HOSTILE CONTACT · LV ${level}`, '함선 파워와 항로 진행도에 맞춰 적 리그가 등장했습니다.', 2.5);
  }

  function spawnNeutralPart() {
    const types = ['armor', 'armor', 'thruster', 'reverseThruster', 'rcsThruster', 'laser', 'machineGun', 'railgun', 'missileLauncher', 'ammoBay', 'bulletBay', 'battery', 'block', 'beam2', 'wedge', 'wedgeLong', 'plate4'];
    const type = types[Math.floor(Math.random() * types.length)];
    const angle = Math.random() * Math.PI * 2;
    const distance = randomIn(330, 900);
    const x = clamp(state.player.x + Math.cos(angle) * distance, 60, WORLD.width - 60);
    const y = clamp(state.player.y + Math.sin(angle) * distance, 60, WORLD.height - 60);
    state.debris.push(makeLoosePart(type, x, y, (Math.random() - .5) * 32, (Math.random() - .5) * 32, { neutral: true, salvageable: true }));
  }

  function spawnNeutralPartNear(x, y) {
    const types = ['armor', 'armor', 'thruster', 'reverseThruster', 'rcsThruster', 'laser', 'machineGun', 'railgun', 'missileLauncher', 'ammoBay', 'bulletBay', 'battery', 'block', 'beam2', 'beam3', 'beam4', 'plate4', 'wedge', 'wedgeLong'];
    const type = types[Math.floor(Math.random() * types.length)];
    const angle = Math.random() * Math.PI * 2;
    const distance = randomIn(50, 150);
    state.debris.push(makeLoosePart(
      type,
      clamp(x + Math.cos(angle) * distance, 60, WORLD.width - 60),
      clamp(y + Math.sin(angle) * distance, 60, WORLD.height - 60),
      (Math.random() - .5) * 100,
      (Math.random() - .5) * 100,
      { neutral: true, salvageable: true },
    ));
  }

  function makeLoosePart(type, x, y, vx = 0, vy = 0, options = {}) {
    const spec = MODULES[type];
    return {
      type, x, y, vx, vy, gx: 0, gy: 0, orientation: options.orientation ?? Math.floor(Math.random() * 4), angle: Math.random() * Math.PI * 2, spin: randomIn(-3, 3),
      hp: options.hp ?? spec.hp, maxHp: options.maxHp ?? spec.hp, mass: options.mass ?? spec.mass, ammo: Math.max(0, options.ammo ?? spec.ammo ?? 0), ammoCapacity: Math.max(0, options.ammoCapacity ?? spec.capacity ?? 0), cracks: options.cracks ? [...options.cracks] : [], tutorial: Boolean(options.tutorial),
      salvageable: Boolean(options.salvageable), neutral: Boolean(options.neutral), broken: Boolean(options.broken),
      life: options.life ?? (options.broken ? 8 : 180), uid: `loose-${uid += 1}`,
    };
  }

  function rotateGridCell(x, y, orientation = 0) {
    const turns = ((orientation % 4) + 4) % 4;
    if (turns === 1) return { x: -y, y: x };
    if (turns === 2) return { x: -x, y: -y };
    if (turns === 3) return { x: y, y: -x };
    return { x, y };
  }

  function moduleCells(module) {
    const footprint = MODULES[module.type]?.footprint || [[0, 0]];
    return footprint.map(([x, y]) => {
      const cell = rotateGridCell(x, y, module.orientation || 0);
      return { gx: module.gx + cell.x, gy: module.gy + cell.y };
    });
  }

  function moduleThrustAxis(module) {
    const axis = rotateGridCell(1, 0, module.orientation || 0);
    return { x: axis.x, y: axis.y };
  }

  function moduleGridCenter(module) {
    const cells = moduleCells(module);
    return cells.reduce((center, cell) => ({ gx: center.gx + cell.gx / cells.length, gy: center.gy + cell.gy / cells.length }), { gx: 0, gy: 0 });
  }

  function moduleCellPositions(ship, module) {
    return moduleCells(module).map((cell) => gridPosition(ship, cell.gx, cell.gy));
  }

  function modulesConnectedToControlTower(ship) {
    const core = ship.modules.find((module) => module.type === 'core');
    if (!core) return new Set();
    const connected = new Set([core]); const occupied = new Set(moduleCells(core).map((cell) => `${cell.gx},${cell.gy}`));
    let expanded = true;
    while (expanded) {
      expanded = false;
      for (const module of ship.modules) {
        if (connected.has(module)) continue;
        const joinsTower = moduleCells(module).some((cell) => [[cell.gx + 1, cell.gy], [cell.gx - 1, cell.gy], [cell.gx, cell.gy + 1], [cell.gx, cell.gy - 1]].some(([gx, gy]) => occupied.has(`${gx},${gy}`)));
        if (!joinsTower) continue;
        connected.add(module); moduleCells(module).forEach((cell) => occupied.add(`${cell.gx},${cell.gy}`)); expanded = true;
      }
    }
    return connected;
  }

  function scatterDisconnectedModules(ship, impactX, impactY) {
    const connected = modulesConnectedToControlTower(ship);
    const detached = ship.modules.filter((module) => module.type !== 'core' && !connected.has(module));
    if (!detached.length) return 0;
    for (const module of detached) {
      ship.removeModule(module);
      const point = modulePosition(ship, module); const awayX = point.x - impactX; const awayY = point.y - impactY; const distance = length(awayX, awayY) || 1;
      state.debris.push(makeLoosePart(module.type, point.x, point.y, ship.vx + awayX / distance * randomIn(70, 180) + randomIn(-55, 55), ship.vy + awayY / distance * randomIn(70, 180) + randomIn(-55, 55), {
        hp: Math.max(1, module.hp), maxHp: module.maxHp, mass: module.mass, ammo: module.ammo, ammoCapacity: module.ammoCapacity,
        cracks: module.cracks, orientation: module.orientation, neutral: true, salvageable: true,
      }));
      createSparks(point.x, point.y, '#ffe082', 8);
    }
    if (ship.team === 'player') notify(`CONTROL TOWER LINK SEVERED · ${detached.length}`, '지휘 코어와 끊긴 파트가 회수 가능한 중립 부품으로 흩어졌습니다.', 4);
    return detached.length;
  }

  function asteroidTypeForRoll(roll = Math.random()) {
    if (roll < .56) return 'small';
    if (roll < .9) return 'medium';
    return 'large';
  }

  function makeAsteroid(type, x, y) {
    const spec = ASTEROID_TYPES[type];
    const pointCount = 6 + Math.floor(Math.random() * 3);
    return {
      type, x, y, vx: randomIn(-14, 14), vy: randomIn(-14, 14), angle: Math.random() * Math.PI * 2, spin: randomIn(-.48, .48),
      radius: spec.radius, mass: spec.mass, impactTimer: 0,
      vertices: Array.from({ length: pointCount }, (_, index) => ({ angle: index / pointCount * Math.PI * 2, radius: randomIn(.7, 1.08) * spec.radius })),
    };
  }

  function spawnAsteroidField(field) {
    field.spawned = true;
    for (let index = 0; index < field.count; index += 1) {
      let x = field.x; let y = field.y;
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const angle = Math.random() * Math.PI * 2; const distance = Math.sqrt(Math.random()) * field.radius;
        x = clamp(field.x + Math.cos(angle) * distance, 80, WORLD.width - 80);
        y = clamp(field.y + Math.sin(angle) * distance, 80, WORLD.height - 80);
        if (length(x - state.player.x, y - state.player.y) > 180) break;
      }
      state.asteroids.push(makeAsteroid(asteroidTypeForRoll(), x, y));
    }
    notify('ASTEROID BELT', '소형은 반발만 합니다. 중·대형은 충격량에 비례해 접촉 부품에 피해를 줍니다.', 5);
  }

  function updateAsteroids(dt) {
    for (const field of state.asteroidFields) if (!field.spawned && distanceBetween(state.player, field) < field.radius + 1550) spawnAsteroidField(field);
    for (const asteroid of state.asteroids) {
      asteroid.x += asteroid.vx * dt; asteroid.y += asteroid.vy * dt; asteroid.angle += asteroid.spin * dt;
      asteroid.vx *= Math.pow(.96, dt); asteroid.vy *= Math.pow(.96, dt); asteroid.impactTimer = Math.max(0, asteroid.impactTimer - dt);
    }
    state.asteroids = state.asteroids.filter((asteroid) => asteroid.x > -100 && asteroid.y > -100 && asteroid.x < WORLD.width + 100 && asteroid.y < WORLD.height + 100);
    if (state.asteroids.length > 48) state.asteroids.splice(0, state.asteroids.length - 48);
  }

  function updateEnemy(ship, dt) {
    const player = state.player;
    const dx = player.x - ship.x; const dy = player.y - ship.y;
    const distance = length(dx, dy); const desired = Math.atan2(dy, dx);
    ship.clearActuators();
    ship.turn(clamp(angleDelta(desired, ship.angle) * (ship.isBoss ? 1.4 : 2), -1, 1), dt);
    ship.angle += ship.angularVelocity * dt;
    const preferred = ship.isBoss ? 450 : 390;
    const direction = distance > preferred ? 1 : distance < preferred * .58 ? -.35 : 0;
    if (direction) ship.thrust(direction, dt);
    if (distance < (ship.isBoss ? 820 : 680) && Math.abs(angleDelta(desired, ship.angle)) < (ship.isBoss ? .28 : .18)) fire(ship);
    ship.updateMotion(dt);
  }

  function fire(ship) {
    const lasers = ship.modulesByType('laser');
    const ballistic = [...ship.modulesByType('machineGun'), ...ship.modulesByType('railgun')];
    if ((!lasers.length && !ballistic.length) || ship.cooldown > 0 || ship.heat > 100) return;
    const laserTuning = BALANCE.weapons.laser;
    ship.cooldown = ship.isBoss ? .22 : laserTuning.cooldown;
    ship.heat += laserTuning.heatBase + lasers.length * laserTuning.heatPerLaser;
    const damage = ship.team === 'player' ? laserTuning.damage + state.upgrades.weapon * laserTuning.upgradeDamage : ship.shotDamage;
    for (const laser of lasers) {
      const position = modulePosition(ship, laser);
      state.bullets.push({
        x: position.x + Math.cos(ship.angle) * 20, y: position.y + Math.sin(ship.angle) * 20,
        vx: ship.vx + Math.cos(ship.angle) * (ship.isBoss ? 790 : laserTuning.speed), vy: ship.vy + Math.sin(ship.angle) * (ship.isBoss ? 790 : laserTuning.speed),
        life: 1.45, team: ship.team, damage, radius: ship.isBoss ? 4.5 : 3.2,
      });
    }
    let dryFire = false;
    for (const weapon of ballistic) {
      const tuning = BALANCE.weapons[weapon.type];
      if (!consumeAmmo(ship, 'bullet', tuning.ammoCost)) { dryFire = true; continue; }
      const position = modulePosition(ship, weapon); const rail = weapon.type === 'railgun';
      state.bullets.push({
        x: position.x + Math.cos(ship.angle) * 22, y: position.y + Math.sin(ship.angle) * 22,
        vx: ship.vx + Math.cos(ship.angle) * tuning.speed, vy: ship.vy + Math.sin(ship.angle) * tuning.speed,
        life: tuning.life, team: ship.team, damage: tuning.damage + state.upgrades.weapon * (rail ? 3 : 1),
        radius: rail ? 4.2 : 2.2, kind: 'bullet', color: rail ? '#d6b3ff' : '#b9d8ff',
      });
    }
    if (dryFire && ship.team === 'player' && !lasers.length) notify('BULLET BAY EMPTY', 'MACHINE GUN은 1발, RAILGUN은 4발의 BULLET BAY 재고가 필요합니다.', 2.2);
    if (state.bullets.length > 160) state.bullets.splice(0, state.bullets.length - 160);
  }

  function ammoBaysFor(ship, ammoType) {
    return ship.modules.filter((module) => MODULES[module.type].ammoType === ammoType);
  }

  function totalAmmo(ship, ammoType) {
    return ammoBaysFor(ship, ammoType).reduce((total, bay) => total + bay.ammo, 0);
  }

  function consumeAmmo(ship, ammoType, amount) {
    if (totalAmmo(ship, ammoType) < amount) return false;
    let remaining = amount;
    for (const bay of ammoBaysFor(ship, ammoType)) {
      const consumed = Math.min(bay.ammo, remaining); bay.ammo -= consumed; remaining -= consumed;
      if (!remaining) break;
    }
    return true;
  }

  function fireMissile(ship, target = null) {
    const launcher = ship.modulesByType('missileLauncher')[0];
    const tuning = BALANCE.weapons.missile; const cost = tuning.ammoCost;
    if (!launcher) {
      if (ship.team === 'player') notify('NO MISSILE LAUNCHER', 'MISSILE 파트와 탄약고를 장착해야 합니다.', 2.2);
      return;
    }
    if (totalAmmo(ship, 'missile') < cost) {
      if (ship.team === 'player') notify('MISSILE BAY EMPTY', `강한 MISSILE 발사기는 ${cost}발의 MISSILE BAY 재고가 필요합니다.`, 2.5);
      return;
    }
    if (ship.missileCooldown > 0) return;
    ship.missileCooldown = tuning.cooldown; consumeAmmo(ship, 'missile', cost);
    const position = modulePosition(ship, launcher);
    const aim = target ? Math.atan2(target.y - position.y, target.x - position.x) : ship.angle;
    const speed = tuning.speed + state.upgrades.missileGuidance * tuning.upgradeSpeed;
    const range = tuning.range + state.upgrades.missileRange * tuning.upgradeRange;
    state.bullets.push({
      x: position.x + Math.cos(aim) * 24, y: position.y + Math.sin(aim) * 24,
      vx: ship.vx + Math.cos(aim) * speed, vy: ship.vy + Math.sin(aim) * speed,
      life: range / speed, rangeRemaining: range, speed, targetX: target?.x ?? null, targetY: target?.y ?? null,
      turnRate: tuning.turnRate + state.upgrades.missileGuidance * tuning.upgradeTurnRate, team: ship.team, damage: ship.team === 'player' ? tuning.damage + state.upgrades.weapon * 3 : ship.shotDamage * 3,
      radius: 6, kind: 'missile', ammoType: 'missile', color: '#ffd271',
    });
    if (ship.team === 'player') notify(`MISSILE LAUNCHED · ${totalAmmo(ship, 'missile')}`, `표적 유도탄을 발사했습니다. ${cost}발의 MISSILE 재고를 소비했습니다.`, 1.4);
    if (state.bullets.length > 160) state.bullets.splice(0, state.bullets.length - 160);
  }

  function nearestMiniMissileTarget(ship) {
    const range = BALANCE.weapons.miniMissile.targetRange;
    return state.enemies.filter((enemy) => enemy.alive && length(enemy.x - ship.x, enemy.y - ship.y) < range)
      .sort((a, b) => length(a.x - ship.x, a.y - ship.y) - length(b.x - ship.x, b.y - ship.y))[0] || null;
  }

  function updateAutoMiniMissiles(ship) {
    const launchers = ship.modulesByType('miniMissileLauncher'); const tuning = BALANCE.weapons.miniMissile;
    if (!launchers.length || ship.miniMissileCooldown > 0 || totalAmmo(ship, 'missile') < tuning.ammoCost) return;
    const target = nearestMiniMissileTarget(ship); if (!target) return;
    let launched = 0;
    for (const launcher of launchers) {
      if (!consumeAmmo(ship, 'missile', tuning.ammoCost)) break;
      const position = modulePosition(ship, launcher); const aim = Math.atan2(target.y - position.y, target.x - position.x);
      state.bullets.push({
        x: position.x + Math.cos(aim) * 16, y: position.y + Math.sin(aim) * 16,
        vx: ship.vx + Math.cos(aim) * tuning.speed, vy: ship.vy + Math.sin(aim) * tuning.speed,
        life: tuning.range / tuning.speed + tuning.lockSeconds, rangeRemaining: tuning.range, speed: tuning.speed, targetShip: target, targetX: target.x, targetY: target.y,
        lockTime: tuning.lockSeconds, turnRate: tuning.turnRate, boostAcceleration: tuning.boostAcceleration, maximumSpeed: tuning.maximumSpeed,
        team: ship.team, damage: tuning.damage, radius: 3.8, kind: 'miniMissile', ammoType: 'missile', color: '#d7ed8e',
      });
      launched += 1;
    }
    if (launched) {
      ship.miniMissileCooldown = tuning.cooldown;
      if (ship.team === 'player') notify(`MINI MISSILE LOCK · ${totalAmmo(ship, 'missile')}`, `${target.name}을 2초간 유도한 뒤 급가속합니다.`, 1.5);
    }
    if (state.bullets.length > 160) state.bullets.splice(0, state.bullets.length - 160);
  }

  function addCrack(module, damage) {
    const targetCount = Math.min(5, Math.ceil((module.maxHp - Math.max(0, module.hp)) / Math.max(1, module.maxHp / 5)));
    while (module.cracks.length < targetCount) {
      module.cracks.push({ x: randomIn(7, 25), y: randomIn(7, 25), angle: Math.random() * Math.PI * 2, length: randomIn(6, 14), branch: Math.random() > .48 });
    }
    if (damage > 8 && module.cracks.length < 5) module.cracks.push({ x: randomIn(7, 25), y: randomIn(7, 25), angle: Math.random() * Math.PI * 2, length: randomIn(8, 16), branch: true });
  }

  function triggerShipShake(ship, strength) {
    ship.shakeTime = SHIP_SHAKE.duration;
    ship.shakeStrength = Math.max(ship.shakeStrength, strength);
    ship.shakePhase = Math.random() * Math.PI * 2;
  }

  function damageModule(ship, module, damage, x, y, color = '#dcecff', impactBreak = false) {
    if (!ship.alive || !module) return;
    if (ship.absorbShieldHit()) {
      createSparks(x, y, '#8eeaff', 12);
      if (ship.team === 'player') notify(`SHIELD LAYER ABSORBED · ${ship.shieldLayers}/${ship.shieldMaxLayers}`, '방어막 생성기가 다음 레이어를 복구 중입니다.', 1.4);
      return;
    }
    module.hp -= damage;
    addCrack(module, damage);
    createSparks(x, y, color, Math.max(4, Math.ceil(damage * 1.2)));
    if (module.type === 'core') {
      ship.coreHp = module.hp;
      return;
    }
    if (module.hp <= 0 && ship.removeModule(module)) {
      state.debris.push(makeLoosePart(module.type, x, y, ship.vx + randomIn(-120, 120), ship.vy + randomIn(-120, 120), { hp: 0, maxHp: module.maxHp, mass: module.mass, ammo: module.ammo, ammoCapacity: module.ammoCapacity, cracks: module.cracks, orientation: module.orientation, broken: true, salvageable: false }));
      createSparks(x, y, '#ff9b71', 18);
      scatterDisconnectedModules(ship, x, y);
      if (impactBreak) triggerShipShake(ship, module.type === 'laser' ? SHIP_SHAKE.weaponPixels : SHIP_SHAKE.partPixels);
    }
  }

  function updateBullets(dt) {
    for (const bullet of state.bullets) {
      if (bullet.kind === 'miniMissile') {
        if (bullet.lockTime > 0) {
          bullet.lockTime = Math.max(0, bullet.lockTime - dt);
          if (bullet.targetShip?.alive) { bullet.targetX = bullet.targetShip.x; bullet.targetY = bullet.targetShip.y; }
          const currentAngle = Math.atan2(bullet.vy, bullet.vx); const desiredAngle = Math.atan2(bullet.targetY - bullet.y, bullet.targetX - bullet.x);
          const nextAngle = currentAngle + clamp(angleDelta(desiredAngle, currentAngle), -bullet.turnRate * dt, bullet.turnRate * dt);
          bullet.vx = Math.cos(nextAngle) * bullet.speed; bullet.vy = Math.sin(nextAngle) * bullet.speed;
        } else {
          bullet.speed = Math.min(bullet.maximumSpeed, bullet.speed + bullet.boostAcceleration * dt);
          const heading = Math.atan2(bullet.targetY - bullet.y, bullet.targetX - bullet.x);
          bullet.vx = Math.cos(heading) * bullet.speed; bullet.vy = Math.sin(heading) * bullet.speed;
        }
      } else if (bullet.kind === 'missile' && bullet.targetX !== null && bullet.targetY !== null) {
        const currentAngle = Math.atan2(bullet.vy, bullet.vx);
        const desiredAngle = Math.atan2(bullet.targetY - bullet.y, bullet.targetX - bullet.x);
        const nextAngle = currentAngle + clamp(angleDelta(desiredAngle, currentAngle), -bullet.turnRate * dt, bullet.turnRate * dt);
        bullet.vx = Math.cos(nextAngle) * bullet.speed; bullet.vy = Math.sin(nextAngle) * bullet.speed;
      }
      bullet.x += bullet.vx * dt; bullet.y += bullet.vy * dt; bullet.life -= dt;
      if (bullet.rangeRemaining !== undefined) bullet.rangeRemaining -= length(bullet.vx, bullet.vy) * dt;
      const targets = bullet.team === 'player' ? state.enemies : [state.player];
      for (const target of targets) {
        if (!target?.alive || bullet.life <= 0) continue;
        const hit = target.modules.find((module) => moduleCellPositions(target, module).some((point) => length(bullet.x - point.x, bullet.y - point.y) < MODULE_RADIUS + bullet.radius));
        if (!hit) continue;
        damageModule(target, hit, bullet.damage, bullet.x, bullet.y, hit.type === 'core' ? '#ff7a90' : '#dcecff');
        bullet.life = 0;
      }
    }
    state.bullets = state.bullets.filter((bullet) => bullet.life > 0 && (bullet.rangeRemaining === undefined || bullet.rangeRemaining > 0) && bullet.x > 0 && bullet.x < WORLD.width && bullet.y > 0 && bullet.y < WORLD.height);
  }

  function createSparks(x, y, color, count = 12) {
    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * Math.PI * 2; const speed = randomIn(40, 205);
      state.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: randomIn(.22, .62), maxLife: .65, color });
    }
    if (state.particles.length > 220) state.particles.splice(0, state.particles.length - 220);
  }

  function breakShip(ship) {
    if (ship.destroyed) return;
    ship.destroyed = true;
    const core = modulePosition(ship, ship.modules[0]);
    createSparks(core.x, core.y, '#ff7a90', ship.isBoss ? 60 : 32);
    if (ship.team === 'player') return;
    for (const module of ship.modules) {
      if (module.type === 'core') continue;
      const point = modulePosition(ship, module);
      state.debris.push(makeLoosePart(module.type, point.x, point.y, ship.vx + randomIn(-220, 220), ship.vy + randomIn(-220, 220), { hp: Math.max(1, module.hp), maxHp: module.maxHp, mass: module.mass, ammo: module.ammo, ammoCapacity: module.ammoCapacity, cracks: module.cracks, orientation: module.orientation, salvageable: true }));
    }
    if (ship.isBoss) {
      for (let index = 0; index < 3; index += 1) spawnNeutralPartNear(core.x, core.y);
      notify(`${ship.name} DESTROYED`, '온전한 부품이 흩어졌습니다. 다음 항로 시설로 이동하세요.', 5);
    }
  }

  function resolveShipModuleCollisions() {
    const ships = [state.player, ...state.enemies].filter((ship) => ship?.alive);
    for (let left = 0; left < ships.length; left += 1) {
      for (let right = left + 1; right < ships.length; right += 1) {
        const a = ships[left]; const b = ships[right];
        let resolved = 0;
        for (const moduleA of a.modules) {
          if (resolved >= 4) break;
          for (const pointA of moduleCellPositions(a, moduleA)) {
            if (resolved >= 4) break;
            for (const moduleB of b.modules) {
              for (const pointB of moduleCellPositions(b, moduleB)) {
                let dx = pointB.x - pointA.x; let dy = pointB.y - pointA.y;
                let distance = length(dx, dy);
                if (distance >= MODULE_RADIUS * 2) continue;
                if (distance < .01) { dx = 1; dy = 0; distance = 1; }
                const nx = dx / distance; const ny = dy / distance;
                const overlap = MODULE_RADIUS * 2 - distance;
                const aShare = b.mass / (a.mass + b.mass); const bShare = a.mass / (a.mass + b.mass);
                a.x -= nx * overlap * aShare * .42; a.y -= ny * overlap * aShare * .42;
                b.x += nx * overlap * bShare * .42; b.y += ny * overlap * bShare * .42;
                const relativeNormal = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
                if (relativeNormal < 0) {
                  const impulse = -relativeNormal * .72;
                  a.vx -= nx * impulse * aShare; a.vy -= ny * impulse * aShare;
                  b.vx += nx * impulse * bShare; b.vy += ny * impulse * bShare;
                }
                const impact = Math.max(0, -relativeNormal);
                if (impact > 115 && a.impactTimer <= 0 && b.impactTimer <= 0) {
                  const damage = clamp(Math.round(impact / 95), 1, 7);
                  damageModule(a, moduleA, damage, pointA.x, pointA.y, '#ffca7a', true);
                  damageModule(b, moduleB, damage, pointB.x, pointB.y, '#ffca7a', true);
                  a.impactTimer = .32; b.impactTimer = .32;
                }
                resolved += 1;
                if (resolved >= 4) break;
              }
              if (resolved >= 4) break;
            }
          }
        }
      }
    }
  }

  function resolveLoosePartCollisions() {
    const ships = [state.player, ...state.enemies].filter((ship) => ship?.alive);
    for (const part of state.debris) {
      for (const ship of ships) {
        for (const module of ship.modules) {
          for (const point of moduleCellPositions(ship, module)) {
            let dx = part.x - point.x; let dy = part.y - point.y; let distance = length(dx, dy);
            if (distance >= MODULE_RADIUS * 2) continue;
            if (distance < .01) { dx = 1; dy = 0; distance = 1; }
            const nx = dx / distance; const ny = dy / distance; const overlap = MODULE_RADIUS * 2 - distance;
            part.x += nx * overlap; part.y += ny * overlap;
            const closing = (part.vx - ship.vx) * nx + (part.vy - ship.vy) * ny;
            if (closing < 0) {
              part.vx -= nx * closing * 1.35; part.vy -= ny * closing * 1.35;
              ship.vx += nx * closing * .045; ship.vy += ny * closing * .045;
              if (Math.abs(closing) > 170) createSparks(part.x, part.y, part.salvageable ? '#ffe082' : '#ff9b71', 3);
            }
          }
        }
      }
    }
    for (let left = 0; left < state.debris.length; left += 1) {
      const a = state.debris[left];
      for (let right = left + 1; right < state.debris.length; right += 1) {
        const b = state.debris[right];
        let dx = b.x - a.x; let dy = b.y - a.y; let distance = length(dx, dy);
        if (distance >= MODULE_RADIUS * 2) continue;
        if (distance < .01) { dx = 1; dy = 0; distance = 1; }
        const nx = dx / distance; const ny = dy / distance; const overlap = MODULE_RADIUS * 2 - distance;
        a.x -= nx * overlap * .5; a.y -= ny * overlap * .5;
        b.x += nx * overlap * .5; b.y += ny * overlap * .5;
        const closing = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (closing < 0) {
          const impulse = -closing * .64;
          a.vx -= nx * impulse; a.vy -= ny * impulse;
          b.vx += nx * impulse; b.vy += ny * impulse;
        }
      }
    }
  }

  function closestModuleToPoint(ship, x, y) {
    let target = ship.modules[0]; let best = Infinity;
    for (const module of ship.modules) {
      for (const point of moduleCellPositions(ship, module)) {
        const distance = length(point.x - x, point.y - y);
        if (distance < best) { target = module; best = distance; }
      }
    }
    return target;
  }

  function resolveAsteroidShipCollisions() {
    const ships = [state.player, ...state.enemies].filter((ship) => ship?.alive);
    for (const asteroid of state.asteroids) {
      const spec = ASTEROID_TYPES[asteroid.type];
      for (const ship of ships) {
        let dx = ship.x - asteroid.x; let dy = ship.y - asteroid.y; let distance = length(dx, dy);
        const combinedRadius = ship.radius + asteroid.radius;
        if (distance >= combinedRadius) continue;
        if (distance < .01) { dx = 1; dy = 0; distance = 1; }
        const nx = dx / distance; const ny = dy / distance; const overlap = combinedRadius - distance;
        const totalMass = ship.mass + asteroid.mass; const shipShare = asteroid.mass / totalMass; const asteroidShare = ship.mass / totalMass;
        ship.x += nx * overlap * shipShare; ship.y += ny * overlap * shipShare;
        asteroid.x -= nx * overlap * asteroidShare; asteroid.y -= ny * overlap * asteroidShare;
        const closing = (ship.vx - asteroid.vx) * nx + (ship.vy - asteroid.vy) * ny;
        if (closing >= 0) continue;
        const impulseVelocity = -closing * .76;
        ship.vx += nx * impulseVelocity * shipShare; ship.vy += ny * impulseVelocity * shipShare;
        asteroid.vx -= nx * impulseVelocity * asteroidShare; asteroid.vy -= ny * impulseVelocity * asteroidShare;
        const impactImpulse = -closing * (ship.mass * asteroid.mass / totalMass);
        if (asteroid.type === 'small') {
          if (impactImpulse > 150) createSparks(asteroid.x, asteroid.y, '#aeb9c5', 3);
          continue;
        }
        if (impactImpulse <= spec.damageThreshold || asteroid.impactTimer > 0 || ship.impactTimer > 0) continue;
        const damage = clamp(Math.ceil((impactImpulse - spec.damageThreshold) / spec.damageScale), 1, spec.maxDamage);
        const module = closestModuleToPoint(ship, asteroid.x, asteroid.y);
        damageModule(ship, module, damage, asteroid.x, asteroid.y, asteroid.type === 'large' ? '#ffad7a' : '#ffd18a', true);
        asteroid.impactTimer = .34; ship.impactTimer = .34;
        createSparks(asteroid.x, asteroid.y, asteroid.type === 'large' ? '#ff8b67' : '#ffd18a', 8 + damage * 3);
        if (ship.team === 'player') notify(`${spec.label} ASTEROID IMPACT · ${damage}`, '충격량이 큰 중·대형 운석은 접촉 부품에 피해를 줍니다.', 2.4);
      }
    }
  }

  function resolveAsteroidPairs() {
    for (let left = 0; left < state.asteroids.length; left += 1) {
      const a = state.asteroids[left];
      for (let right = left + 1; right < state.asteroids.length; right += 1) {
        const b = state.asteroids[right];
        let dx = b.x - a.x; let dy = b.y - a.y; let distance = length(dx, dy);
        const combinedRadius = a.radius + b.radius;
        if (distance >= combinedRadius) continue;
        if (distance < .01) { dx = 1; dy = 0; distance = 1; }
        const nx = dx / distance; const ny = dy / distance; const overlap = combinedRadius - distance;
        const totalMass = a.mass + b.mass; const aShare = b.mass / totalMass; const bShare = a.mass / totalMass;
        a.x -= nx * overlap * aShare * .5; a.y -= ny * overlap * aShare * .5;
        b.x += nx * overlap * bShare * .5; b.y += ny * overlap * bShare * .5;
        const closing = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (closing < 0) {
          const impulse = -closing * .62;
          a.vx -= nx * impulse * aShare; a.vy -= ny * impulse * aShare;
          b.vx += nx * impulse * bShare; b.vy += ny * impulse * bShare;
        }
      }
    }
  }

  function updateDebrisAndEffects(dt) {
    for (const part of state.debris) {
      part.x += part.vx * dt; part.y += part.vy * dt;
      part.vx *= Math.pow(.58, dt); part.vy *= Math.pow(.58, dt); part.angle += part.spin * dt; part.life -= dt;
    }
    state.debris = state.debris.filter((part) => part.life > 0 && part.x > -100 && part.y > -100 && part.x < WORLD.width + 100 && part.y < WORLD.height + 100);
    if (state.debris.length > 60) state.debris.splice(0, state.debris.length - 60);
    for (const particle of state.particles) {
      particle.x += particle.vx * dt; particle.y += particle.vy * dt;
      particle.vx *= Math.pow(.035, dt); particle.vy *= Math.pow(.035, dt); particle.life -= dt;
    }
    state.particles = state.particles.filter((particle) => particle.life > 0);
  }

  function updateWorldDirector(dt) {
    state.missionTime += dt;
    state.spawnTimer -= dt; state.neutralTimer -= dt;
    const hostileCount = state.enemies.filter((enemy) => !enemy.isBoss).length;
    const rank = Math.floor(playerPower() / 5);
    const limit = clamp(1 + Math.floor(routeSector() / 2) + Math.floor(rank / 3), 2, 5);
    if (state.spawnTimer <= 0 && hostileCount < limit) {
      spawnRandomEnemy();
      state.spawnTimer = clamp(13 - rank * .55 - routeSector() * .35, 5, 12);
    }
    if (state.neutralTimer <= 0 && state.debris.filter((part) => part.neutral && part.salvageable).length < 10) {
      spawnNeutralPart();
      state.neutralTimer = randomIn(8, 14);
    }
    updateBossActivation();
  }

  function updateBossActivation() {
    for (let index = 0; index < state.bosses.length; index += 1) {
      const boss = state.bosses[index];
      if (boss.defeated || boss.active || distanceBetween(state.player, boss) > 1050) continue;
      if (index > 0 && !state.bosses[index - 1].defeated) {
        notify('ROUTE SEALED', `${state.bosses[index - 1].name}을 먼저 격파해야 합니다.`, 3);
        continue;
      }
      boss.active = true; boss.ship = makeBoss(boss);
      state.enemies.push(boss.ship);
      notify(`MID-BOSS · ${boss.name}`, '충돌로 외곽 장갑을 흔들고, 코어를 노려 부품을 보존하세요.', 5);
      queueDialogue({ icon: '⚠', speaker: boss.name, title: '퀘스트 이벤트 · 중간 보스', body: '적 리그의 코어를 먼저 파괴하면 살아 있는 부품이 회수 가능 상태로 남습니다. 방어막 레이어와 미사일 재고를 확인하세요.' });
    }
    const final = state.finalBoss;
    if (!final.defeated && !final.active && distanceBetween(state.player, final) < 1200) {
      if (!state.bosses.every((boss) => boss.defeated)) {
        if (!final.lockNoticeUntil || final.lockNoticeUntil < state.time) {
          final.lockNoticeUntil = state.time + 3000;
          notify('FINAL GATE LOCKED', '두 중간 보스를 모두 격파해야 최종 목표가 활성화됩니다.', 3);
        }
      } else {
        final.active = true; final.ship = makeBoss(final, true);
        state.enemies.push(final.ship);
        notify(`FINAL BOSS · ${final.name}`, '최종 지휘 코어를 격파하면 항로가 종료됩니다.', 6);
        queueDialogue({ icon: '✹', speaker: final.name, title: '최종 퀘스트 · VOID WARDEN', body: '두 관문이 해제됐습니다. 컨트롤 타워 유도 업그레이드와 방어막 용량을 활용해 지휘 코어를 격파하세요.' });
      }
    }
  }

  function updateBossStates() {
    for (const boss of state.bosses) {
      if (boss.active && boss.ship?.destroyed && !boss.defeated) boss.defeated = true;
    }
    if (state.finalBoss.active && state.finalBoss.ship?.destroyed && !state.finalBoss.defeated) {
      state.finalBoss.defeated = true;
      showEnd(true);
    }
  }

  function nearbyStation() {
    return state.stations.find((station) => distanceBetween(state.player, station) < 220);
  }

  function useStation() {
    if (state.status !== 'running') return;
    const station = nearbyStation();
    if (!station) { notify('NO STATION IN RANGE', '정거장 표식 220px 안에서 E를 누르세요.', 2.5); return; }
    const player = state.player;
    const core = player.modules[0];
    player.coreHp = player.coreMaxHp;
    core.maxHp = player.coreMaxHp;
    core.hp = player.coreHp;
    for (const module of player.modules) { module.hp = module.maxHp; module.cracks = []; }
    station.visited = true;
    if (!station.used) {
      station.used = true;
      if (station.id === 'kepler') { state.upgrades.hull += 1; player.coreMaxHp += BALANCE.upgrades.keplerHull; player.coreHp = player.coreMaxHp; core.maxHp = player.coreMaxHp; core.hp = core.maxHp; }
      if (station.id === 'lyra') { state.upgrades.weapon += 1; state.upgrades.missileGuidance += BALANCE.upgrades.lyraMissileGuidance; state.upgrades.missileRange += BALANCE.upgrades.lyraMissileRange; }
      if (station.id === 'perseus') { state.upgrades.cooling += BALANCE.upgrades.perseusCooling; state.upgrades.shieldLayers += BALANCE.upgrades.perseusShieldLayers; state.upgrades.shieldRecharge += BALANCE.upgrades.perseusShieldRecharge; }
      player.shieldLayers = player.shieldMaxLayers; player.shieldTimer = 0;
      notify(`${station.name} UPGRADE`, `${station.upgrade} 적용 및 전면 수리 완료.`, 5);
      queueDialogue({ icon: station.id === 'lyra' ? '⌁' : station.id === 'perseus' ? '◈' : '⌂', speaker: station.name, title: '정거장 업그레이드 완료', body: `${station.upgrade}가 적용됐습니다. 수리된 모듈 질량과 방어막 커버 용량을 확인한 뒤 다음 항로를 선택하세요.` });
    } else {
      notify(`${station.name} REPAIRED`, '이미 업그레이드를 받았습니다. 전면 수리만 수행했습니다.', 3);
    }
    createSparks(player.x, player.y, '#70ddff', 26);
  }

  function camera() {
    const player = state.player;
    const width = canvas.width / state.zoom; const height = canvas.height / state.zoom;
    const centerX = clamp(player.x, width / 2, WORLD.width - width / 2);
    const centerY = clamp(player.y, height / 2, WORLD.height - height / 2);
    return { x: centerX - width / 2, y: centerY - height / 2, centerX, centerY, width, height, zoom: state.zoom, rotation: state.viewRotation };
  }

  function toScreen(x, y, view) {
    const dx = x - view.centerX; const dy = y - view.centerY;
    const cos = Math.cos(view.rotation); const sin = Math.sin(view.rotation);
    return { x: (dx * cos + dy * sin) * view.zoom + canvas.width / 2, y: (-dx * sin + dy * cos) * view.zoom + canvas.height / 2 };
  }

  function toWorld(x, y, view) {
    const localX = (x - canvas.width / 2) / view.zoom; const localY = (y - canvas.height / 2) / view.zoom;
    const cos = Math.cos(view.rotation); const sin = Math.sin(view.rotation);
    return { x: view.centerX + localX * cos - localY * sin, y: view.centerY + localX * sin + localY * cos };
  }

  function changeZoom(direction) {
    const next = clamp(Math.round((state.zoom + direction * ZOOM.step) * 10) / 10, ZOOM.min, ZOOM.max);
    if (next === state.zoom) return;
    state.zoom = next;
    if (state.status === 'running') notify(`ORTHOGRAPHIC ZOOM · ${Math.round(state.zoom * 100)}%`, '직교 화면 범위만 바뀌며, 카메라 회전과 물리 좌표는 변하지 않습니다.', 1.4);
  }

  function drawBackground(time, view) {
    ctx.fillStyle = '#02050c'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (background.nebulaReady) {
      const scale = 1560 * view.zoom; const driftX = (view.centerX * .018 + time * .004) % 180; const driftY = (view.centerY * .015 + time * .002) % 160;
      ctx.save(); ctx.globalAlpha = .26; ctx.translate(canvas.width / 2, canvas.height / 2); ctx.rotate(-view.rotation);
      ctx.drawImage(background.nebula, -canvas.width / 2 - 150 - driftX, -canvas.height / 2 - 410 - driftY, scale, scale);
      ctx.restore();
    }
    if (background.starsReady) {
      const tileW = background.stars.width; const tileH = background.stars.height;
      const offsetX = -((view.centerX * .07) % tileW) - tileW; const offsetY = -((view.centerY * .07) % tileH) - tileH;
      const textureSpan = Math.max(canvas.width, canvas.height) * 2;
      ctx.save(); ctx.globalAlpha = .22; ctx.translate(canvas.width / 2, canvas.height / 2); ctx.rotate(-view.rotation);
      for (let x = -textureSpan + offsetX; x < textureSpan; x += tileW) for (let y = -textureSpan + offsetY; y < textureSpan; y += tileH) ctx.drawImage(background.stars, x, y);
      ctx.restore();
    }
    const starCell = 72;
    const viewRadius = Math.hypot(view.width, view.height) / 2;
    const firstCellX = Math.floor((view.centerX - viewRadius) / starCell) - 1; const lastCellX = Math.ceil((view.centerX + viewRadius) / starCell) + 1;
    const firstCellY = Math.floor((view.centerY - viewRadius) / starCell) - 1; const lastCellY = Math.ceil((view.centerY + viewRadius) / starCell) + 1;
    for (let cellX = firstCellX; cellX <= lastCellX; cellX += 1) {
      for (let cellY = firstCellY; cellY <= lastCellY; cellY += 1) {
        const chance = cellNoise(cellX, cellY);
        if (chance > .42) continue;
        const point = toScreen(cellX * starCell + cellNoise(cellX, cellY, 1) * starCell, cellY * starCell + cellNoise(cellX, cellY, 2) * starCell, view);
        if (point.x < -3 || point.x > canvas.width + 3 || point.y < -3 || point.y > canvas.height + 3) continue;
        const size = .35 + cellNoise(cellX, cellY, 3) * 1.6;
        const alpha = .18 + Math.sin(time * .0018 + cellNoise(cellX, cellY, 4) * Math.PI * 2) * .12;
        ctx.fillStyle = chance < .055 ? `rgba(190,218,255,${alpha + .22})` : `rgba(205,230,255,${alpha})`;
        ctx.fillRect(point.x, point.y, size * view.zoom, size * view.zoom);
      }
    }
    ctx.strokeStyle = 'rgba(66,110,166,.11)'; ctx.lineWidth = 1;
    const grid = 200;
    const firstGridX = Math.floor((view.centerX - viewRadius) / grid) * grid; const lastGridX = Math.ceil((view.centerX + viewRadius) / grid) * grid;
    const firstGridY = Math.floor((view.centerY - viewRadius) / grid) * grid; const lastGridY = Math.ceil((view.centerY + viewRadius) / grid) * grid;
    for (let x = firstGridX; x <= lastGridX; x += grid) { const start = toScreen(x, view.centerY - viewRadius, view); const end = toScreen(x, view.centerY + viewRadius, view); ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y); ctx.stroke(); }
    for (let y = firstGridY; y <= lastGridY; y += grid) { const start = toScreen(view.centerX - viewRadius, y, view); const end = toScreen(view.centerX + viewRadius, y, view); ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y); ctx.stroke(); }
  }

  function drawRouteMarker(x, y, title, detail, color, view, active = false) {
    const point = toScreen(x, y, view); const sx = point.x; const sy = point.y;
    if (sx < -130 || sx > canvas.width + 130 || sy < -80 || sy > canvas.height + 80) return;
    ctx.save(); ctx.translate(sx, sy); ctx.strokeStyle = color; ctx.fillStyle = 'rgba(3,7,18,.72)'; ctx.lineWidth = active ? 3 : 1.5;
    ctx.beginPath(); ctx.arc(0, 0, active ? 48 : 34, 0, Math.PI * 2); ctx.stroke();
    ctx.fillRect(-76, -62, 152, 28); ctx.fillStyle = color; ctx.font = '800 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText(title, 0, -44);
    ctx.fillStyle = '#c4d3e7'; ctx.font = '600 9px system-ui'; ctx.fillText(detail, 0, -31); ctx.restore();
  }

  function drawWorldMarkers(view) {
    for (const station of state.stations) drawRouteMarker(station.x, station.y, station.name, station.used ? 'REPAIR ONLINE' : `E · ${station.upgrade}`, station.used ? '#70ddff' : '#ffe082', view, nearbyStation() === station);
    for (const boss of state.bosses) {
      if (!boss.defeated) drawRouteMarker(boss.x, boss.y, boss.name, boss.active ? 'ENGAGED' : 'MID-BOSS', '#ff806f', view, boss.active);
    }
    if (!state.finalBoss.defeated) drawRouteMarker(state.finalBoss.x, state.finalBoss.y, state.finalBoss.name, state.finalBoss.active ? 'FINAL ENGAGED' : 'FINAL GATE', '#e895ff', view, state.finalBoss.active);
  }

  function shipVisualAngle(ship, view) {
    return normalizeAngle(ship.angle - view.rotation);
  }

  function drawShip(ship, view) {
    const point = toScreen(ship.x, ship.y, view); const shake = shipVisualShake(ship);
    const visualAngle = shipVisualAngle(ship, view);
    ctx.save(); ctx.translate(point.x + shake.x, point.y + shake.y); ctx.scale(view.zoom, view.zoom); ctx.rotate(visualAngle);
    if (ship.shieldLayers) {
      const opacity = VISUALS.shield.layerOpacity[ship.shieldLayers] ?? VISUALS.shield.layerOpacity[VISUALS.shield.layerOpacity.length - 1];
      ctx.fillStyle = `rgba(62, 192, 255, ${opacity * .18})`; ctx.beginPath(); ctx.arc(0, 0, ship.radius + 13, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(110, 224, 255, ${opacity})`; ctx.lineWidth = 1.3 + ship.shieldLayers * .3;
      ctx.beginPath(); ctx.arc(0, 0, ship.radius + 13, 0, Math.PI * 2); ctx.stroke();
    }
    for (const [moduleId, exhaust] of ship.activeExhausts) {
      const drive = ship.modules.find((module) => module.uid === moduleId); if (!drive) continue;
      const center = moduleGridCenter(drive); const nozzleX = center.gx * CELL + exhaust.x * 12; const nozzleY = center.gy * CELL + exhaust.y * 12;
      const endX = nozzleX + exhaust.x * (20 + Math.random() * 8); const endY = nozzleY + exhaust.y * (20 + Math.random() * 8);
      const sideX = -exhaust.y * 5; const sideY = exhaust.x * 5;
      ctx.fillStyle = drive.type === 'rcsThruster' ? 'rgba(151,255,211,.72)' : drive.type === 'reverseThruster' ? 'rgba(245,172,255,.72)' : ship.team === 'enemy' ? 'rgba(255,145,112,.7)' : 'rgba(88,215,255,.72)';
      ctx.beginPath(); ctx.moveTo(nozzleX, nozzleY); ctx.lineTo(endX + sideX, endY + sideY); ctx.lineTo(endX - sideX, endY - sideY); ctx.closePath(); ctx.fill();
    }
    for (const module of ship.modules) drawVoxelModule(module, ship.team, ship);
    ctx.restore();
  }

  function shipVisualShake(ship) {
    if (ship.shakeTime <= 0 || ship.shakeStrength <= 0) return { x: 0, y: 0 };
    const fade = clamp(ship.shakeTime / SHIP_SHAKE.duration, 0, 1);
    const time = state.time * .09 + ship.shakePhase;
    return { x: Math.sin(time * 1.7) * ship.shakeStrength * fade, y: Math.cos(time * 2.3) * ship.shakeStrength * fade * .72 };
  }

  function shadeHex(hex, amount) {
    const parsed = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);
    if (!parsed) return hex;
    const channel = (index) => clamp(parseInt(parsed[index], 16) + amount, 0, 255);
    return `rgb(${channel(1)}, ${channel(2)}, ${channel(3)})`;
  }

  function drawPixelTexture(x, y, width, height, base, seed) {
    const pixel = 4; const left = x - width / 2 + 4; const top = y - height / 2 + 4;
    for (let row = 0; row < Math.max(0, Math.floor((height - 8) / pixel)); row += 1) {
      for (let column = 0; column < Math.max(0, Math.floor((width - 8) / pixel)); column += 1) {
        const value = cellNoise(Math.floor(left / pixel) + column + seed, Math.floor(top / pixel) + row, seed + 11);
        if (value < .16) { ctx.fillStyle = shadeHex(base, -18); ctx.fillRect(left + column * pixel, top + row * pixel, 2, 2); }
        else if (value > .91) { ctx.fillStyle = shadeHex(base, 24); ctx.fillRect(left + column * pixel, top + row * pixel, 2, 2); }
      }
    }
  }

  function strokeBoxEdge(x1, y1, x2, y2, outline) {
    ctx.strokeStyle = outline; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }

  function drawNineSliceBox(x, y, width, height, base, outline, edges, seed) {
    const left = x - width / 2; const right = x + width / 2; const top = y - height / 2; const bottom = y + height / 2;
    ctx.fillStyle = base; ctx.fillRect(left, top, width, height);
    drawPixelTexture(x, y, width, height, base, seed);
    if (edges.top) { ctx.fillStyle = shadeHex(base, 30); ctx.fillRect(left + 2, top + 2, width - 4, 3); strokeBoxEdge(left, top, right, top, outline); }
    if (edges.left) { ctx.fillStyle = shadeHex(base, 18); ctx.fillRect(left + 2, top + 2, 3, height - 4); strokeBoxEdge(left, top, left, bottom, outline); }
    if (edges.bottom) { ctx.fillStyle = shadeHex(base, -30); ctx.fillRect(left + 2, bottom - 5, width - 4, 3); strokeBoxEdge(left, bottom, right, bottom, outline); }
    if (edges.right) { ctx.fillStyle = shadeHex(base, -22); ctx.fillRect(right - 5, top + 2, 3, height - 4); strokeBoxEdge(right, top, right, bottom, outline); }
  }

  function drawVoxelCracks(cracks, x, y) {
    if (!cracks.length) return;
    ctx.strokeStyle = 'rgba(6,8,16,.92)'; ctx.lineWidth = 1.15;
    for (const crack of cracks) {
      const start = { x: x - 15 + crack.x, y: y - 15 + crack.y };
      const end = { x: x - 15 + crack.x + Math.cos(crack.angle) * crack.length, y: y - 15 + crack.y + Math.sin(crack.angle) * crack.length };
      ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y);
      if (crack.branch) {
        const branch = { x: end.x + Math.cos(crack.angle + .85) * crack.length * .46, y: end.y + Math.sin(crack.angle + .85) * crack.length * .46 };
        ctx.lineTo(branch.x, branch.y);
      }
      ctx.stroke();
    }
  }

  function bevelEdgesForCell(ship, cell, cells) {
    const occupied = (gx, gy) => ship ? Boolean(ship.getModule(gx, gy)) : cells.some((item) => item.gx === gx && item.gy === gy);
    return { top: !occupied(cell.gx, cell.gy - 1), right: !occupied(cell.gx + 1, cell.gy), bottom: !occupied(cell.gx, cell.gy + 1), left: !occupied(cell.gx - 1, cell.gy) };
  }

  function drawTrianglePrism(module, x, y, base, outline) {
    const spec = MODULES[module.type]; const long = spec.shape === 'triangle-long'; const width = long ? CELL * 2 : CELL; const height = CELL;
    ctx.save(); ctx.translate(x, y); ctx.rotate((module.orientation || 0) * Math.PI / 2);
    const left = -width / 2; const right = width / 2; const top = -height / 2; const bottom = height / 2;
    ctx.beginPath(); ctx.moveTo(left, top); ctx.lineTo(right, top); ctx.lineTo(right, bottom); ctx.closePath(); ctx.fillStyle = base; ctx.fill();
    ctx.save(); ctx.clip(); drawPixelTexture(0, 0, width, height, base, module.type === 'wedgeLong' ? 37 : 31); ctx.restore();
    ctx.strokeStyle = outline; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.strokeStyle = shadeHex(base, 30); ctx.beginPath(); ctx.moveTo(left + 2, top + 2); ctx.lineTo(right - 2, top + 2); ctx.stroke();
    ctx.strokeStyle = shadeHex(base, -28); ctx.beginPath(); ctx.moveTo(right - 2, top + 2); ctx.lineTo(right - 2, bottom - 2); ctx.stroke();
    ctx.restore();
  }

  function drawVoxelModuleAt(module, team, x, y, baseOverride = null, outlineOverride = null, ship = null) {
    const spec = MODULES[module.type]; const base = baseOverride || (team === 'enemy' ? '#7a4149' : spec.fill); const outline = outlineOverride || (team === 'enemy' ? '#ff9d7c' : spec.stroke);
    if (spec.shape) drawTrianglePrism(module, x, y, base, outline);
    else {
      const cells = moduleCells(module); const center = moduleGridCenter(module);
      for (const cell of cells) {
        const cellX = x + (cell.gx - center.gx) * CELL; const cellY = y + (cell.gy - center.gy) * CELL;
        drawNineSliceBox(cellX, cellY, CELL, CELL, base, outline, bevelEdgesForCell(ship, cell, cells), module.type.length * 19 + cell.gx * 7 + cell.gy * 13);
      }
    }
    if (module.type === 'core') drawNineSliceBox(x, y, 14, 14, team === 'enemy' ? '#ff8973' : '#ff7a90', outline, { top: true, right: true, bottom: true, left: true }, 3);
    else if (module.type === 'laser') drawNineSliceBox(x + 10, y, 18, 10, '#f7b8ef', outline, { top: true, right: true, bottom: true, left: true }, 5);
    else if (module.type === 'thruster') drawNineSliceBox(x - 10, y, 10, 17, '#baf8ff', outline, { top: true, right: true, bottom: true, left: true }, 7);
    else if (module.type === 'reverseThruster') drawNineSliceBox(x + 10, y, 10, 14, '#f0b7fb', outline, { top: true, right: true, bottom: true, left: true }, 17);
    else if (module.type === 'rcsThruster') drawNineSliceBox(x, y, 14, 9, '#a9f6d8', outline, { top: true, right: true, bottom: true, left: true }, 23);
    else if (module.type === 'missileLauncher') { drawNineSliceBox(x + 8, y, 20, 12, '#ffd08a', outline, { top: true, right: true, bottom: true, left: true }, 29); ctx.fillStyle = '#5b3f2e'; ctx.fillRect(x + 13, y - 3, 10, 6); }
    else if (module.type === 'miniMissileLauncher') { drawNineSliceBox(x + 6, y, 16, 10, '#d7ed8e', outline, { top: true, right: true, bottom: true, left: true }, 33); ctx.fillStyle = '#53603c'; ctx.fillRect(x + 10, y - 2, 9, 4); }
    else if (module.type === 'machineGun') { ctx.strokeStyle = '#b9d8ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 3, y - 4); ctx.lineTo(x + 17, y - 4); ctx.moveTo(x + 3, y + 4); ctx.lineTo(x + 17, y + 4); ctx.stroke(); }
    else if (module.type === 'railgun') { ctx.strokeStyle = '#d6b3ff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - 5, y); ctx.lineTo(x + 18, y); ctx.stroke(); }
    else if (module.type === 'ammoBay' || module.type === 'bulletBay') { ctx.fillStyle = module.type === 'ammoBay' ? '#ffe18c' : '#a8e7c5'; ctx.font = '800 8px system-ui'; ctx.textAlign = 'center'; ctx.fillText(`${module.ammo}/${module.ammoCapacity}`, x, y + 3); ctx.textAlign = 'start'; }
    else if (module.type === 'shieldGenerator') { ctx.strokeStyle = '#8eeaff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = 'rgba(142,234,255,.28)'; ctx.fillRect(x - 5, y - 5, 10, 10); }
    else if (module.type === 'battery') drawNineSliceBox(x, y, 13, 18, '#ffe082', outline, { top: true, right: true, bottom: true, left: true }, 9);
    drawVoxelCracks(module.cracks, x, y);
    const barWidth = Math.max(26, Math.sqrt(moduleCells(module).length) * CELL - 8);
    ctx.fillStyle = 'rgba(4,8,19,.78)'; ctx.fillRect(x - barWidth / 2, y + 14, barWidth, 3);
    ctx.fillStyle = outline; ctx.fillRect(x - barWidth / 2, y + 14, barWidth * clamp(module.hp / module.maxHp, 0, 1), 3);
  }

  function drawVoxelModule(module, team, ship) {
    const center = moduleGridCenter(module);
    drawVoxelModuleAt(module, team, center.gx * CELL, center.gy * CELL, null, null, ship);
  }

  function drawShipStatus(ship, view) {
    const point = toScreen(ship.x, ship.y, view); const x = point.x; const y = point.y - (ship.radius + 20) * view.zoom; const width = ship.isBoss ? 86 : 58;
    const hp = clamp(ship.coreHp / ship.coreMaxHp, 0, 1);
    ctx.fillStyle = 'rgba(3,7,18,.78)'; ctx.fillRect(x - width / 2 - 3, y - 13, width + 6, 18);
    ctx.fillStyle = ship.team === 'player' ? '#bcefff' : '#ffd0bd'; ctx.font = '800 10px system-ui'; ctx.textAlign = 'center'; ctx.fillText(ship.team === 'player' ? 'YOU · CORE' : ship.name, x, y - 1);
    ctx.fillStyle = '#2b3447'; ctx.fillRect(x - width / 2, y + 3, width, 4);
    ctx.fillStyle = ship.team === 'player' ? '#58d7ff' : ship.isBoss ? '#e895ff' : '#ff8c71'; ctx.fillRect(x - width / 2, y + 3, width * hp, 4); ctx.textAlign = 'start';
    if (ship.shieldMaxLayers) { ctx.fillStyle = '#8eeaff'; ctx.font = '800 9px system-ui'; ctx.textAlign = 'center'; ctx.fillText(`SHD ${ship.shieldLayers}/${ship.shieldMaxLayers}`, x, y + 17); ctx.textAlign = 'start'; }
  }

  function drawAsteroids(view) {
    for (const asteroid of state.asteroids) {
      const point = toScreen(asteroid.x, asteroid.y, view); const spec = ASTEROID_TYPES[asteroid.type];
      if (point.x < -asteroid.radius * view.zoom || point.x > canvas.width + asteroid.radius * view.zoom || point.y < -asteroid.radius * view.zoom || point.y > canvas.height + asteroid.radius * view.zoom) continue;
      ctx.save(); ctx.translate(point.x, point.y); ctx.scale(view.zoom, view.zoom); ctx.rotate(asteroid.angle - view.rotation);
      ctx.beginPath();
      for (let index = 0; index < asteroid.vertices.length; index += 1) {
        const vertex = asteroid.vertices[index]; const x = Math.cos(vertex.angle) * vertex.radius; const y = Math.sin(vertex.angle) * vertex.radius;
        if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath(); ctx.fillStyle = spec.fill; ctx.fill(); ctx.strokeStyle = spec.stroke; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.globalAlpha = .34; ctx.fillStyle = shadeHex(spec.fill, 26); ctx.beginPath(); ctx.arc(-asteroid.radius * .18, -asteroid.radius * .2, asteroid.radius * .34, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      ctx.restore();
    }
  }

  function drawLooseParts(view) {
    for (const part of state.debris) {
      const point = toScreen(part.x, part.y, view); const x = point.x; const y = point.y;
      if (x < -40 || x > canvas.width + 40 || y < -40 || y > canvas.height + 40) continue;
      const base = part.broken ? '#3d2b2e' : part.neutral ? '#204d50' : '#5a4d29'; const outline = part.broken ? '#ff785f' : part.salvageable ? '#ffe082' : '#a45b61';
      ctx.save(); ctx.translate(x, y); ctx.scale(view.zoom, view.zoom); ctx.rotate(part.angle - view.rotation); drawVoxelModuleAt(part, 'player', 0, 0, base, outline); ctx.restore();
    }
  }

  function drawBulletsAndParticles(view) {
    for (const bullet of state.bullets) {
      const point = toScreen(bullet.x, bullet.y, view);
      ctx.fillStyle = bullet.color || (bullet.team === 'player' ? '#f7b8ef' : '#ffb386'); ctx.beginPath(); ctx.arc(point.x, point.y, Math.max(1, bullet.radius * view.zoom), 0, Math.PI * 2); ctx.fill();
    }
    for (const particle of state.particles) {
      const point = toScreen(particle.x, particle.y, view);
      const size = Math.max(1, 4 * view.zoom);
      ctx.fillStyle = particle.color; ctx.globalAlpha = particle.life / particle.maxLife; ctx.fillRect(point.x - size / 2, point.y - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
  }

  function drawSocketOutline(point, size, angle, color, lineWidth) {
    ctx.save(); ctx.translate(point.x, point.y); ctx.rotate(angle);
    ctx.strokeStyle = color; ctx.lineWidth = lineWidth;
    ctx.strokeRect(-size / 2, -size / 2, size, size);
    ctx.restore();
  }

  function drawSocketsAndPointer(view) {
    const socketAngle = shipVisualAngle(state.player, view);
    if (state.carried) {
      for (const socket of openSockets(state.player)) {
        const point = toScreen(modulePosition(state.player, socket).x, modulePosition(state.player, socket).y, view); const size = 32 * view.zoom;
        drawSocketOutline(point, size, socketAngle, 'rgba(255,224,130,.82)', 2);
      }
    }
    if (!state.pointer) return;
    const { x, y } = state.pointer; const world = toWorld(x, y, view);
    const target = state.carried ? findAttachTarget(world.x, world.y, state.carried) : null;
    if (target) {
      const point = toScreen(modulePosition(state.player, target.socket).x, modulePosition(state.player, target.socket).y, view); const size = 38 * view.zoom;
      drawSocketOutline(point, size, socketAngle, '#8cf0cd', 2.5);
    }
    if (state.carried?.source === 'loose') {
      const preview = { ...state.carried, gx: 0, gy: 0, orientation: target?.orientation ?? state.carried.orientation, cracks: state.carried.cracks || [] };
      ctx.save(); ctx.translate(x, y); ctx.scale(view.zoom, view.zoom); ctx.rotate(socketAngle); ctx.globalAlpha = target ? .88 : .48;
      drawVoxelModuleAt(preview, 'player', 0, 0, null, target ? '#8cf0cd' : '#ffb38a'); ctx.restore(); ctx.globalAlpha = 1;
    }
    const nearbyPart = state.debris.find((part) => part.salvageable && length(part.x - world.x, part.y - world.y) < 50);
    ctx.strokeStyle = state.carried || nearbyPart ? '#ffe082' : 'rgba(220,240,255,.72)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, state.carried || nearbyPart ? 17 : 11, 0, Math.PI * 2); ctx.stroke();
    if (state.carried || nearbyPart) {
      const label = state.carried ? (target ? `DROP ${MODULES[state.carried.type].label}` : `CARRY ${MODULES[state.carried.type].label}`) : `PICK ${MODULES[nearbyPart.type].label}`;
      ctx.fillStyle = '#ffe082'; ctx.font = '800 11px system-ui'; ctx.fillText(label, x + 20, y - 16);
    }
  }

  function drawShieldHud() {
    const ship = state.player; if (!ship) return;
    const x = 22; const y = 24; const maximum = ship.shieldMaxLayers;
    ctx.save(); ctx.fillStyle = 'rgba(3, 11, 27, .76)'; ctx.fillRect(x - 10, y - 14, 138, 38);
    ctx.fillStyle = '#8eeaff'; ctx.font = '800 10px system-ui'; ctx.fillText('SHIELD LAYERS', x, y);
    for (let index = 0; index < maximum; index += 1) {
      const boxX = x + index * 20; const filled = index < ship.shieldLayers;
      ctx.fillStyle = filled ? '#48cfff' : 'rgba(72, 207, 255, .1)'; ctx.fillRect(boxX, y + 7, 14, 11);
      ctx.strokeStyle = filled ? '#b8f5ff' : 'rgba(142, 234, 255, .42)'; ctx.lineWidth = 1; ctx.strokeRect(boxX + .5, y + 7.5, 13, 10);
    }
    ctx.restore();
  }

  function nearestOwnedModule(worldX, worldY) {
    let selected = null; let best = MODULE_RADIUS + 6;
    for (const module of state.player.modules) {
      for (const point of moduleCellPositions(state.player, module)) {
        const distance = length(worldX - point.x, worldY - point.y);
        if (distance < best) { selected = module; best = distance; }
      }
    }
    return selected;
  }

  function carriedFromPart(part) {
    return { source: 'loose', part, type: part.type, hp: part.hp, maxHp: part.maxHp, mass: part.mass, ammo: part.ammo, ammoCapacity: part.ammoCapacity, cracks: [...part.cracks], orientation: part.orientation, neutral: part.neutral };
  }

  function placementOrientations(carried) {
    const original = Number.isInteger(carried.orientation) ? [carried.orientation] : [];
    return [...new Set([...original, 0, 1, 2, 3])];
  }

  function findAttachTarget(worldX, worldY, carried) {
    if (!carried) return null;
    const sockets = openSockets(state.player)
      .map((socket) => ({ socket, point: modulePosition(state.player, socket) }))
      .filter(({ point }) => length(point.x - worldX, point.y - worldY) < CELL * .72)
      .sort((a, b) => length(a.point.x - worldX, a.point.y - worldY) - length(b.point.x - worldX, b.point.y - worldY));
    for (const { socket } of sockets) {
      for (const orientation of placementOrientations(carried)) {
        const cells = moduleCells({ type: carried.type, gx: socket.gx, gy: socket.gy, orientation });
        if (cells.every((cell) => !state.player.getModule(cell.gx, cell.gy))) return { socket, orientation };
      }
    }
    return null;
  }

  function findLoosePart(worldX, worldY, excluded = null) {
    let candidate = null; let best = 50;
    for (const part of state.debris) {
      if (!part.salvageable || part === excluded) continue;
      const distance = length(part.x - worldX, part.y - worldY);
      if (distance < best) { candidate = part; best = distance; }
    }
    return candidate;
  }

  function detachModule(module) {
    if (!module || module.type === 'core') { notify('CORE LOCKED', '지휘 코어는 이동하거나 회수할 수 없습니다.', 2.5); return; }
    if (state.carried) { notify('CARGO FULL', '들고 있는 부품을 먼저 빈 소켓에 재장착하세요.', 2.5); return; }
    if (state.player.removeModule(module)) {
      state.carried = { source: 'installed', type: module.type, hp: module.hp, maxHp: module.maxHp, mass: module.mass, ammo: module.ammo, ammoCapacity: module.ammoCapacity, cracks: [...module.cracks], orientation: module.orientation };
      notify(`MOVING ${MODULES[module.type].label}`, '황금색 빈 소켓을 클릭해 재장착하세요.', 3);
    }
  }

  function attachCarried(target) {
    if (!state.carried || !target) return false;
    const carried = state.carried;
    const { socket, orientation } = target;
    const module = state.player.addModule(carried.type, socket.gx, socket.gy, carried.hp, carried.cracks, orientation, carried.ammo, carried.ammoCapacity, carried.maxHp, carried.mass);
    if (!module) return false;
    if (carried.source === 'loose') {
      state.salvage += 1; createSparks(state.player.x, state.player.y, '#ffe082', 10);
      notify(`${carried.neutral ? 'NEUTRAL' : 'SALVAGED'} ${MODULES[module.type].label}`, `${socket.gx}, ${socket.gy} 원하는 연결 격자에 장착했습니다.`, 3);
      if (carried.part?.tutorial && state.tutorialStage === 'place') {
        state.tutorialStage = 'complete';
        queueDialogue({ icon: '✦', speaker: 'SALVAGE AI', title: '튜토리얼 완료', body: '회수한 부품이 질량과 중심질량에 반영됐습니다. 메인 추진기는 자동 보정으로 전진 토크를 줄이고, RCS는 회전에만 힘을 씁니다.' });
      }
    } else notify(`${MODULES[module.type].label} REATTACHED`, `${socket.gx}, ${socket.gy} 격자에 기존 부품을 재장착했습니다.`, 3);
    state.carried = null;
    return true;
  }

  function mergeAmmoBays(carried, target) {
    const held = carried.part;
    const survivor = held.hp >= target.hp ? held : target;
    const consumed = survivor === held ? target : held;
    survivor.maxHp += Math.ceil(consumed.maxHp * .5);
    survivor.hp = Math.min(survivor.maxHp, survivor.hp + Math.ceil(consumed.hp * .5));
    survivor.ammo += consumed.ammo; survivor.ammoCapacity += consumed.ammoCapacity; survivor.mass += consumed.mass;
    state.debris = state.debris.filter((part) => part !== target);
    state.carried = carriedFromPart(survivor);
    notify(`AMMO STORAGE MERGED · ${survivor.ammo}`, `더 튼튼한 ${MODULES[survivor.type].label}가 남았습니다. 최대 HP ${survivor.maxHp}, 탄약 ${survivor.ammo}/${survivor.ammoCapacity}.`, 3);
  }

  function restoreLooseCarry() {
    if (state.carried?.source === 'loose' && state.carried.part) state.debris.push(state.carried.part);
    state.carried = null;
  }

  function beginLoosePartDrag(event) {
    if (event.button !== 0 || state.status !== 'running') return;
    const point = canvasPoint(event); state.pointer = point;
    if (state.carried?.source === 'loose') {
      state.placementDrag = { pointerId: event.pointerId };
    } else if (!state.carried) {
      const world = toWorld(point.x, point.y, camera()); const candidate = findLoosePart(world.x, world.y);
      if (!candidate) return;
      if (state.player.modules.length >= BALANCE.player.moduleLimit) { notify('MODULE LIMIT', `함선의 모듈 한도는 ${BALANCE.player.moduleLimit}개입니다.`, 2.5); return; }
      if (length(candidate.x - state.player.x, candidate.y - state.player.y) > BALANCE.player.salvageRange) { notify('TOO FAR TO SALVAGE', `함선 ${BALANCE.player.salvageRange}px 안의 회수 가능 부품만 들어 올릴 수 있습니다.`, 2.5); return; }
      state.debris = state.debris.filter((part) => part !== candidate);
      state.carried = carriedFromPart(candidate); state.placementDrag = { pointerId: event.pointerId };
      if (candidate.tutorial && state.tutorialStage === 'salvage') { state.tutorialStage = 'place'; queueDialogue({ icon: '⌖', speaker: 'SALVAGE AI', title: '배치 위치 선택', body: '금색 격자 위에서 놓으세요. 다칸 부품은 빈 격자가 충분한 방향을 자동으로 선택합니다.' }); }
      notify(`CARRY ${MODULES[candidate.type].label}`, '강조된 빈 소켓에서 마우스 버튼을 놓아 장착하세요.', 3);
    } else return;
    if (canvas.setPointerCapture) canvas.setPointerCapture(event.pointerId);
    event.preventDefault?.();
  }

  function endLoosePartDrag(event, cancelled = false) {
    if (!state.placementDrag || state.placementDrag.pointerId !== event.pointerId) return;
    const point = canvasPoint(event); state.pointer = point; state.placementDrag = null; state.suppressNextClick = true;
    if (canvas.releasePointerCapture && canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (cancelled) { restoreLooseCarry(); notify('CARRY CANCELLED', '부품을 원래 위치로 되돌렸습니다.', 2.2); return; }
    const world = toWorld(point.x, point.y, camera()); const held = state.carried;
    const mergeTarget = held && MODULES[held.type].ammoType ? findLoosePart(world.x, world.y, held.part) : null;
    if (mergeTarget?.type === held?.type && MODULES[mergeTarget.type].ammoType === MODULES[held.type].ammoType) { mergeAmmoBays(held, mergeTarget); return; }
    const target = findAttachTarget(world.x, world.y, held);
    if (attachCarried(target)) return;
    restoreLooseCarry(); notify('INVALID DROP', '유효한 빈 연결 격자에 놓지 않아 부품을 원래 위치로 되돌렸습니다.', 2.5);
  }

  function handleCanvasClick(event) {
    if (state.status !== 'running') return;
    if (state.suppressNextClick) { state.suppressNextClick = false; return; }
    const view = camera(); const { x: screenX, y: screenY } = canvasPoint(event);
    const world = toWorld(screenX, screenY, view); const worldX = world.x; const worldY = world.y;
    const owned = nearestOwnedModule(worldX, worldY);
    if ((event.shiftKey || state.touchMoveMode) && owned) {
      detachModule(owned);
      if (state.touchMoveMode) setTouchMoveMode(false);
      return;
    }
    if (state.carried) {
      if (!attachCarried(findAttachTarget(worldX, worldY, state.carried))) notify('INVALID SOCKET', '강조된 빈 연결 격자를 클릭하세요.', 2.5);
      return;
    }
  }

  function canvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * (canvas.width / rect.width), y: (event.clientY - rect.top) * (canvas.height / rect.height) };
  }

  function normalizeAngle(angle) {
    return Math.atan2(Math.sin(angle), Math.cos(angle));
  }

  function beginCameraRotate(event) {
    if (event.button !== 2) return;
    const point = canvasPoint(event);
    state.cameraDrag = { pointerId: event.pointerId, startX: point.x, startY: point.y, startRotation: state.viewRotation, moved: false };
    state.pointer = null; canvas.classList.add('is-rotating');
    if (canvas.setPointerCapture) canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function updateCanvasPointer(event) {
    if (state.cameraDrag && state.cameraDrag.pointerId === event.pointerId) {
      const point = canvasPoint(event);
      const dx = point.x - state.cameraDrag.startX; const dy = point.y - state.cameraDrag.startY;
      if (length(dx, dy) > 6) state.cameraDrag.moved = true;
      if (state.cameraDrag.moved) state.viewRotation = normalizeAngle(state.cameraDrag.startRotation + dx * TOP_VIEW.rotationSensitivity);
      event.preventDefault();
      return;
    }
    state.pointer = canvasPoint(event);
  }

  function endCameraRotate(event, cancelled = false) {
    if (!state.cameraDrag || state.cameraDrag.pointerId !== event.pointerId) return;
    const drag = state.cameraDrag;
    state.cameraDrag = null; canvas.classList.remove('is-rotating');
    if (canvas.releasePointerCapture && canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (!cancelled && !drag.moved && state.status === 'running') {
      const point = canvasPoint(event); const target = toWorld(point.x, point.y, camera());
      fireMissile(state.player, target);
    }
  }

  function beginCanvasPointer(event) {
    if (event.button === 2) beginCameraRotate(event);
    else beginLoosePartDrag(event);
  }

  function endCanvasPointer(event, cancelled = false) {
    if (state.cameraDrag?.pointerId === event.pointerId) endCameraRotate(event, cancelled);
    else endLoosePartDrag(event, cancelled);
  }

  function updateHud() {
    const player = state.player; const nearby = nearbyStation();
    readouts.hull.textContent = `${Math.max(0, Math.ceil(player.coreHp / player.coreMaxHp * 100))}%`;
    readouts.salvage.textContent = String(state.salvage);
    readouts.wave.textContent = `${routeSector()} / 7`;
    readouts.heat.textContent = `${Math.round(clamp(player.heat, 0, 100))}%`;
    readouts.mass.textContent = player.mass.toFixed(1);
    const bossThreat = state.enemies.find((enemy) => enemy.isBoss);
    readouts.threat.textContent = bossThreat ? 'BOSS' : state.enemies.length ? `HOSTILE ${state.enemies.length}` : 'CLEAR';
    if (state.notice && state.notice.until > state.time) { readouts.title.textContent = state.notice.title; readouts.copy.textContent = state.notice.copy; return; }
    if (nearby) { readouts.title.textContent = nearby.name; readouts.copy.textContent = `E: ${nearby.used ? '전면 수리' : `${nearby.upgrade} 업그레이드 및 전면 수리`}`; return; }
    const nextBoss = state.bosses.find((boss) => !boss.defeated);
    if (nextBoss) { readouts.title.textContent = `ROUTE ETA · ~30 MIN · ${formatTime(state.missionTime)}`; readouts.copy.textContent = `다음 관문: ${nextBoss.name}. 정거장과 중립 부품을 활용해 함선을 강화하세요.`; return; }
    if (!state.finalBoss.defeated) { readouts.title.textContent = `FINAL APPROACH · ${formatTime(state.missionTime)}`; readouts.copy.textContent = `${state.finalBoss.name}의 위치로 이동하세요.`; }
  }

  function setTouchMoveMode(enabled) {
    state.touchMoveMode = enabled;
    touchMoveButton.classList.toggle('is-active', enabled);
    touchMoveButton.setAttribute('aria-pressed', String(enabled));
  }

  function bindTouchControls() {
    for (const button of touchControls.querySelectorAll('[data-touch-key]')) {
      const code = button.dataset.touchKey;
      const release = (event) => {
        if (event) event.preventDefault();
        input.delete(code); button.classList.remove('is-active');
      };
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault(); input.add(code); button.classList.add('is-active');
        if (button.setPointerCapture) button.setPointerCapture(event.pointerId);
      });
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('lostpointercapture', release);
      button.addEventListener('pointerleave', (event) => { if (!button.hasPointerCapture || !button.hasPointerCapture(event.pointerId)) release(event); });
    }
    stationButton.addEventListener('click', useStation);
    zoomOutButton.addEventListener('click', () => changeZoom(-1));
    zoomInButton.addEventListener('click', () => changeZoom(1));
    touchMoveButton.addEventListener('click', () => setTouchMoveMode(!state.touchMoveMode));
  }

  function update(dt) {
    if (state.status !== 'running' || !state.player) return;
    state.player.updatePilot(dt); state.player.updateMotion(dt);
    if (input.has('Space')) fire(state.player);
    if (input.has('KeyF')) fireMissile(state.player);
    for (const enemy of state.enemies) updateEnemy(enemy, dt);
    updateAutoMiniMissiles(state.player);
    updateAsteroids(dt); resolveShipModuleCollisions(); resolveLoosePartCollisions(); resolveAsteroidShipCollisions(); resolveAsteroidPairs(); updateBullets(dt);
    for (const enemy of state.enemies) if (!enemy.alive) breakShip(enemy);
    if (!state.player.alive) breakShip(state.player);
    updateBossStates();
    state.enemies = state.enemies.filter((enemy) => enemy.alive);
    updateDebrisAndEffects(dt);
    if (!state.player.alive) { showEnd(false); return; }
    if (state.status !== 'running') return;
    updateWorldDirector(dt); updateTutorialAndQuestEvents(); updateHud();
  }

  function frame(time) {
    const dt = Math.min(.033, (time - state.lastTime) / 1000 || 0);
    state.lastTime = time; state.time = time;
    update(dt);
    const view = camera();
    drawBackground(time, view); drawWorldMarkers(view);
    drawAsteroids(view);
    drawLooseParts(view);
    if (state.player) drawShip(state.player, view);
    for (const enemy of state.enemies) drawShip(enemy, view);
    if (state.player) drawShipStatus(state.player, view);
    for (const enemy of state.enemies) drawShipStatus(enemy, view);
    drawBulletsAndParticles(view); drawSocketsAndPointer(view); drawShieldHud();
    requestAnimationFrame(frame);
  }

  window.addEventListener('keydown', (event) => {
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyF', 'Space', 'Equal', 'Minus', 'NumpadAdd', 'NumpadSubtract'].includes(event.code)) event.preventDefault();
    if (event.code === 'KeyR' && !event.repeat) launch();
    if (event.code === 'KeyE' && !event.repeat) useStation();
    if (['Equal', 'NumpadAdd'].includes(event.code) && !event.repeat) changeZoom(1);
    if (['Minus', 'NumpadSubtract'].includes(event.code) && !event.repeat) changeZoom(-1);
    input.add(event.code);
  });
  window.addEventListener('keyup', (event) => input.delete(event.code));
  window.addEventListener('blur', () => input.clear());
  canvas.addEventListener('click', handleCanvasClick);
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  canvas.addEventListener('pointerdown', beginCanvasPointer);
  canvas.addEventListener('pointermove', updateCanvasPointer);
  canvas.addEventListener('pointerup', (event) => endCanvasPointer(event));
  canvas.addEventListener('pointercancel', (event) => endCanvasPointer(event, true));
  canvas.addEventListener('lostpointercapture', (event) => endCanvasPointer(event, true));
  canvas.addEventListener('wheel', (event) => { event.preventDefault(); changeZoom(event.deltaY < 0 ? 1 : -1); }, { passive: false });
  canvas.addEventListener('mouseleave', () => { state.pointer = null; });
  launchButton.addEventListener('click', launch);
  restartButton.addEventListener('click', () => { restoreBriefingOverlay(); state.status = 'briefing'; overlay.classList.remove('is-hidden'); });
  dialogueUi.advance.addEventListener('click', () => chooseDialogue());
  dialogueUi.choiceButtons.forEach((button, index) => button.addEventListener('click', () => chooseDialogue(index)));
  bindTouchControls();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
  resetGame(); requestAnimationFrame(frame);
})();
