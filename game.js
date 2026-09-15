(() => {
  'use strict';

  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d');
  const overlay = document.querySelector('#overlay');
  const launchButton = document.querySelector('#launch-button');
  const restartButton = document.querySelector('#restart-button');
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
  let uid = 0;

  const MODULES = {
    core: { label: 'CORE', hp: 100, mass: 2, fill: '#17365e', stroke: '#70ddff' },
    armor: { label: 'PLATE', hp: 18, mass: 1.8, fill: '#334661', stroke: '#a9bed9' },
    thruster: { label: 'DRIVE', hp: 14, mass: 1.1, force: 180, fill: '#174a5a', stroke: '#62e7ff' },
    laser: { label: 'LZR', hp: 12, mass: 1.2, fill: '#533052', stroke: '#ff92e8' },
    battery: { label: 'CELL', hp: 16, mass: 1.4, fill: '#594920', stroke: '#ffe082' },
  };
  const STATIONS = [
    { id: 'kepler', name: 'KEPLER REPAIR DOCK', x: 33000, y: 19000, upgrade: 'HULL +30', description: '코어 최대 내구도 +30, 전면 수리' },
    { id: 'lyra', name: 'LYRA WEAPON RELAY', x: 86000, y: 47000, upgrade: 'DAMAGE +2', description: '레이저 피해 +2, 전면 수리' },
    { id: 'perseus', name: 'PERSEUS REACTOR BAY', x: 139000, y: 74000, upgrade: 'COOLING +12', description: '기본 냉각 +12/s, 전면 수리' },
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
    enemies: [], debris: [], bullets: [], particles: [], stations: [], bosses: [], finalBoss: null,
    salvage: 0, carried: null, pointer: null, spawnTimer: 4, neutralTimer: 2,
    upgrades: { hull: 0, weapon: 0, cooling: 0 }, notice: null, collisionTimers: new Map(),
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
      this.vx = 0; this.vy = 0; this.angularVelocity = 0;
      this.coreHp = 100; this.coreMaxHp = 100;
      this.cooldown = 0; this.heat = 0; this.impactTimer = 0;
      this.modules = [this.makeModule('core', 0, 0)];
      this.name = team === 'player' ? 'YOU' : 'RAIDER';
      this.level = 1; this.isBoss = false; this.destroyed = false; this.shotDamage = 5;
    }

    makeModule(type, gx, gy, hp = MODULES[type].hp, cracks = []) {
      const spec = MODULES[type];
      return { type, gx, gy, hp: Math.min(spec.hp, hp), maxHp: spec.hp, cracks: [...cracks], uid: `${type}-${uid += 1}` };
    }
    get alive() { return this.coreHp > 0; }
    get mass() { return this.modules.reduce((total, module) => total + MODULES[module.type].mass, 0); }
    get radius() {
      const extent = Math.max(0, ...this.modules.map((module) => Math.max(Math.abs(module.gx), Math.abs(module.gy))));
      return 24 + extent * CELL;
    }
    modulesByType(type) { return this.modules.filter((module) => module.type === type); }
    getModule(gx, gy) { return this.modules.find((module) => module.gx === gx && module.gy === gy); }
    addModule(type, gx, gy, hp, cracks) {
      if (!MODULES[type] || this.getModule(gx, gy)) return null;
      const module = this.makeModule(type, gx, gy, hp, cracks);
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
      this.heat = Math.max(0, this.heat - dt * (18 + state.upgrades.cooling + this.modulesByType('battery').length * 9));
      this.impactTimer = Math.max(0, this.impactTimer - dt);
      this.vx *= Math.pow(.16, dt);
      this.vy *= Math.pow(.16, dt);
      this.x = clamp(this.x + this.vx * dt, 40, WORLD.width - 40);
      this.y = clamp(this.y + this.vy * dt, 40, WORLD.height - 40);
    }
    thrust(amount, dt) {
      const drives = this.modulesByType('thruster').length;
      const force = amount * (260 + drives * MODULES.thruster.force) / Math.sqrt(this.mass);
      this.vx += Math.cos(this.angle) * force * dt;
      this.vy += Math.sin(this.angle) * force * dt;
    }
    updatePilot(dt) {
      const turn = (input.has('KeyD') ? 1 : 0) - (input.has('KeyA') ? 1 : 0);
      const thrust = (input.has('KeyW') ? 1 : 0) - (input.has('KeyS') ? .55 : 0);
      this.angularVelocity += turn * 5.4 * dt;
      this.angularVelocity *= Math.pow(.001, dt);
      this.angle += this.angularVelocity * dt;
      if (thrust) this.thrust(thrust, dt);
    }
  }

  function resetGame() {
    const player = new Ship('player', 9000, 10000);
    player.name = 'SALVAGE RIG';
    player.addModule('armor', 1, 0);
    player.addModule('laser', 0, -1);
    player.addModule('laser', 0, 1);
    player.addModule('thruster', -1, -1);
    player.addModule('thruster', -1, 1);
    player.addModule('battery', -1, 0);
    state.player = player;
    state.enemies = []; state.debris = []; state.bullets = []; state.particles = [];
    state.stations = STATIONS.map((station) => ({ ...station, used: false, visited: false }));
    state.bosses = MID_BOSSES.map((boss) => ({ ...boss, active: false, defeated: false, ship: null }));
    state.finalBoss = { ...FINAL_BOSS, active: false, defeated: false, ship: null };
    state.missionTime = 0; state.salvage = 0; state.carried = null; state.spawnTimer = 3; state.neutralTimer = 1;
    state.upgrades = { hull: 0, weapon: 0, cooling: 0 }; state.notice = null; state.collisionTimers.clear();
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
    notify('SECTOR 1 · OUTER DRIFT', 'W/S 추진, A/D 회전. 중립 부품은 클릭해 장착하고 Shift+Click으로 장착 부품을 옮깁니다.', 8);
  }

  function notify(title, copy, seconds = 3) {
    state.notice = { title, copy, until: state.time + seconds * 1000 };
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
    const localX = module.gx * CELL;
    const localY = module.gy * CELL;
    const cos = Math.cos(ship.angle);
    const sin = Math.sin(ship.angle);
    return { x: ship.x + localX * cos - localY * sin, y: ship.y + localX * sin + localY * cos };
  }

  function openSockets(ship) {
    const occupied = new Set(ship.modules.map((module) => `${module.gx},${module.gy}`));
    const sockets = new Map();
    for (const module of ship.modules) {
      for (const [gx, gy] of [[module.gx + 1, module.gy], [module.gx - 1, module.gy], [module.gx, module.gy + 1], [module.gx, module.gy - 1]]) {
        if (!occupied.has(`${gx},${gy}`)) sockets.set(`${gx},${gy}`, { gx, gy });
      }
    }
    return [...sockets.values()];
  }

  function playerPower() {
    const player = state.player;
    return player.modulesByType('armor').length
      + player.modulesByType('thruster').length
      + player.modulesByType('battery').length * 1.5
      + player.modulesByType('laser').length * 2
      + state.upgrades.hull * 2 + state.upgrades.weapon * 2 + state.upgrades.cooling;
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
    const types = ['armor', 'armor', 'thruster', 'laser', 'battery'];
    const type = types[Math.floor(Math.random() * types.length)];
    const angle = Math.random() * Math.PI * 2;
    const distance = randomIn(330, 900);
    const x = clamp(state.player.x + Math.cos(angle) * distance, 60, WORLD.width - 60);
    const y = clamp(state.player.y + Math.sin(angle) * distance, 60, WORLD.height - 60);
    state.debris.push(makeLoosePart(type, x, y, (Math.random() - .5) * 32, (Math.random() - .5) * 32, { neutral: true, salvageable: true }));
  }

  function spawnNeutralPartNear(x, y) {
    const types = ['armor', 'armor', 'thruster', 'laser', 'battery'];
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
      type, x, y, vx, vy, angle: Math.random() * Math.PI * 2, spin: randomIn(-3, 3),
      hp: options.hp ?? spec.hp, maxHp: spec.hp, cracks: options.cracks ? [...options.cracks] : [],
      salvageable: Boolean(options.salvageable), neutral: Boolean(options.neutral), broken: Boolean(options.broken),
      life: options.life ?? (options.broken ? 8 : 180), uid: `loose-${uid += 1}`,
    };
  }

  function updateEnemy(ship, dt) {
    const player = state.player;
    const dx = player.x - ship.x; const dy = player.y - ship.y;
    const distance = length(dx, dy); const desired = Math.atan2(dy, dx);
    const turnRate = ship.isBoss ? 1.5 : 2.15;
    ship.angle += clamp(angleDelta(desired, ship.angle), -1, 1) * turnRate * dt;
    const preferred = ship.isBoss ? 450 : 390;
    const direction = distance > preferred ? 1 : distance < preferred * .58 ? -.35 : 0;
    if (direction) ship.thrust(direction, dt);
    if (distance < (ship.isBoss ? 820 : 680) && Math.abs(angleDelta(desired, ship.angle)) < (ship.isBoss ? .28 : .18)) fire(ship);
    ship.updateMotion(dt);
  }

  function fire(ship) {
    const lasers = ship.modulesByType('laser');
    if (!lasers.length || ship.cooldown > 0 || ship.heat > 100) return;
    ship.cooldown = ship.isBoss ? .22 : .28;
    ship.heat += 11 + lasers.length * 3;
    const damage = ship.team === 'player' ? 7 + state.upgrades.weapon * 2 : ship.shotDamage;
    for (const laser of lasers) {
      const position = modulePosition(ship, laser);
      state.bullets.push({
        x: position.x + Math.cos(ship.angle) * 20, y: position.y + Math.sin(ship.angle) * 20,
        vx: ship.vx + Math.cos(ship.angle) * (ship.isBoss ? 790 : 720), vy: ship.vy + Math.sin(ship.angle) * (ship.isBoss ? 790 : 720),
        life: 1.45, team: ship.team, damage, radius: ship.isBoss ? 4.5 : 3.2,
      });
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

  function damageModule(ship, module, damage, x, y, color = '#dcecff') {
    if (!ship.alive || !module) return;
    module.hp -= damage;
    addCrack(module, damage);
    createSparks(x, y, color, Math.max(4, Math.ceil(damage * 1.2)));
    if (module.type === 'core') {
      ship.coreHp = module.hp;
      return;
    }
    if (module.hp <= 0 && ship.removeModule(module)) {
      state.debris.push(makeLoosePart(module.type, x, y, ship.vx + randomIn(-120, 120), ship.vy + randomIn(-120, 120), { hp: 0, cracks: module.cracks, broken: true, salvageable: false }));
      createSparks(x, y, '#ff9b71', 18);
    }
  }

  function updateBullets(dt) {
    for (const bullet of state.bullets) {
      bullet.x += bullet.vx * dt; bullet.y += bullet.vy * dt; bullet.life -= dt;
      const targets = bullet.team === 'player' ? state.enemies : [state.player];
      for (const target of targets) {
        if (!target?.alive || bullet.life <= 0) continue;
        const hit = target.modules.find((module) => {
          const point = modulePosition(target, module);
          return length(bullet.x - point.x, bullet.y - point.y) < MODULE_RADIUS + bullet.radius;
        });
        if (!hit) continue;
        damageModule(target, hit, bullet.damage, bullet.x, bullet.y, hit.type === 'core' ? '#ff7a90' : '#dcecff');
        bullet.life = 0;
      }
    }
    state.bullets = state.bullets.filter((bullet) => bullet.life > 0 && bullet.x > 0 && bullet.x < WORLD.width && bullet.y > 0 && bullet.y < WORLD.height);
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
      state.debris.push(makeLoosePart(module.type, point.x, point.y, ship.vx + randomIn(-220, 220), ship.vy + randomIn(-220, 220), { hp: Math.max(1, module.hp), cracks: module.cracks, salvageable: true }));
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
          const pointA = modulePosition(a, moduleA);
          for (const moduleB of b.modules) {
            const pointB = modulePosition(b, moduleB);
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
              damageModule(a, moduleA, damage, pointA.x, pointA.y, '#ffca7a');
              damageModule(b, moduleB, damage, pointB.x, pointB.y, '#ffca7a');
              a.impactTimer = .32; b.impactTimer = .32;
            }
            resolved += 1;
            if (resolved >= 4) break;
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
          const point = modulePosition(ship, module);
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
      if (station.id === 'kepler') { state.upgrades.hull += 1; player.coreMaxHp += 30; player.coreHp = player.coreMaxHp; core.maxHp = player.coreMaxHp; core.hp = core.maxHp; }
      if (station.id === 'lyra') state.upgrades.weapon += 1;
      if (station.id === 'perseus') state.upgrades.cooling += 12;
      notify(`${station.name} UPGRADE`, `${station.upgrade} 적용 및 전면 수리 완료.`, 5);
    } else {
      notify(`${station.name} REPAIRED`, '이미 업그레이드를 받았습니다. 전면 수리만 수행했습니다.', 3);
    }
    createSparks(player.x, player.y, '#70ddff', 26);
  }

  function camera() {
    const player = state.player;
    return { x: clamp(player.x - canvas.width / 2, 0, WORLD.width - canvas.width), y: clamp(player.y - canvas.height / 2, 0, WORLD.height - canvas.height) };
  }

  function drawBackground(time, view) {
    ctx.fillStyle = '#02050c'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (background.nebulaReady) {
      const scale = 1560; const driftX = (view.x * .018 + time * .004) % 180; const driftY = (view.y * .015 + time * .002) % 160;
      ctx.save(); ctx.globalAlpha = .26;
      ctx.drawImage(background.nebula, -150 - driftX, -410 - driftY, scale, scale);
      ctx.restore();
    }
    if (background.starsReady) {
      const tileW = background.stars.width; const tileH = background.stars.height;
      const offsetX = -((view.x * .07) % tileW) - tileW; const offsetY = -((view.y * .07) % tileH) - tileH;
      ctx.save(); ctx.globalAlpha = .22;
      for (let x = offsetX; x < canvas.width + tileW; x += tileW) for (let y = offsetY; y < canvas.height + tileH; y += tileH) ctx.drawImage(background.stars, x, y);
      ctx.restore();
    }
    const starCell = 72;
    const firstCellX = Math.floor(view.x / starCell) - 1; const lastCellX = Math.ceil((view.x + canvas.width) / starCell) + 1;
    const firstCellY = Math.floor(view.y / starCell) - 1; const lastCellY = Math.ceil((view.y + canvas.height) / starCell) + 1;
    for (let cellX = firstCellX; cellX <= lastCellX; cellX += 1) {
      for (let cellY = firstCellY; cellY <= lastCellY; cellY += 1) {
        const chance = cellNoise(cellX, cellY);
        if (chance > .42) continue;
        const x = cellX * starCell + cellNoise(cellX, cellY, 1) * starCell - view.x;
        const y = cellY * starCell + cellNoise(cellX, cellY, 2) * starCell - view.y;
        const size = .35 + cellNoise(cellX, cellY, 3) * 1.6;
        const alpha = .18 + Math.sin(time * .0018 + cellNoise(cellX, cellY, 4) * Math.PI * 2) * .12;
        ctx.fillStyle = chance < .055 ? `rgba(190,218,255,${alpha + .22})` : `rgba(205,230,255,${alpha})`;
        ctx.fillRect(x, y, size, size);
      }
    }
    ctx.strokeStyle = 'rgba(66,110,166,.11)'; ctx.lineWidth = 1;
    const grid = 200;
    for (let x = -(view.x % grid); x < canvas.width; x += grid) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
    for (let y = -(view.y % grid); y < canvas.height; y += grid) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }
  }

  function drawRouteMarker(x, y, title, detail, color, view, active = false) {
    const sx = x - view.x; const sy = y - view.y;
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

  function drawShip(ship, view) {
    const x = ship.x - view.x; const y = ship.y - view.y;
    ctx.save(); ctx.translate(x, y); ctx.rotate(ship.angle);
    if (length(ship.vx, ship.vy) > 45) {
      ctx.fillStyle = ship.team === 'enemy' ? 'rgba(255,145,112,.7)' : 'rgba(88,215,255,.72)';
      for (const drive of ship.modulesByType('thruster')) {
        ctx.beginPath(); ctx.moveTo(drive.gx * CELL - 17, drive.gy * CELL); ctx.lineTo(drive.gx * CELL - 43 - Math.random() * 9, drive.gy * CELL + 8); ctx.lineTo(drive.gx * CELL - 43 - Math.random() * 9, drive.gy * CELL - 8); ctx.fill();
      }
    }
    for (const module of ship.modules) drawModule(module, ship.team);
    ctx.restore();
  }

  function drawModule(module, team) {
    const spec = MODULES[module.type]; const x = module.gx * CELL - 16; const y = module.gy * CELL - 16;
    ctx.fillStyle = team === 'enemy' ? '#542d35' : spec.fill; ctx.fillRect(x, y, 32, 32);
    ctx.strokeStyle = team === 'enemy' ? '#ff9d7c' : spec.stroke; ctx.lineWidth = 2; ctx.strokeRect(x, y, 32, 32);
    if (module.type === 'core') { ctx.fillStyle = team === 'enemy' ? '#ff8973' : '#ff7a90'; ctx.fillRect(x + 10, y + 10, 12, 12); }
    else if (module.type === 'laser') { ctx.fillStyle = '#f7b8ef'; ctx.fillRect(x + 23, y + 13, 13, 6); }
    else if (module.type === 'thruster') { ctx.fillStyle = '#baf8ff'; ctx.fillRect(x + 4, y + 10, 8, 12); }
    else if (module.type === 'battery') { ctx.fillStyle = '#ffe082'; ctx.fillRect(x + 11, y + 8, 10, 16); }
    drawCracks(module.cracks, x, y);
    ctx.fillStyle = 'rgba(4,8,19,.68)'; ctx.fillRect(x, y + 29, 32 * clamp(module.hp / module.maxHp, 0, 1), 3);
  }

  function drawCracks(cracks, x, y) {
    if (!cracks.length) return;
    ctx.strokeStyle = 'rgba(6,8,16,.92)'; ctx.lineWidth = 1.15;
    for (const crack of cracks) {
      const ex = x + crack.x + Math.cos(crack.angle) * crack.length; const ey = y + crack.y + Math.sin(crack.angle) * crack.length;
      ctx.beginPath(); ctx.moveTo(x + crack.x, y + crack.y); ctx.lineTo(ex, ey);
      if (crack.branch) ctx.lineTo(ex + Math.cos(crack.angle + .85) * crack.length * .46, ey + Math.sin(crack.angle + .85) * crack.length * .46);
      ctx.stroke();
    }
  }

  function drawShipStatus(ship, view) {
    const x = ship.x - view.x; const y = ship.y - view.y - ship.radius - 20; const width = ship.isBoss ? 86 : 58;
    const hp = clamp(ship.coreHp / ship.coreMaxHp, 0, 1);
    ctx.fillStyle = 'rgba(3,7,18,.78)'; ctx.fillRect(x - width / 2 - 3, y - 13, width + 6, 18);
    ctx.fillStyle = ship.team === 'player' ? '#bcefff' : '#ffd0bd'; ctx.font = '800 10px system-ui'; ctx.textAlign = 'center'; ctx.fillText(ship.team === 'player' ? 'YOU · CORE' : ship.name, x, y - 1);
    ctx.fillStyle = '#2b3447'; ctx.fillRect(x - width / 2, y + 3, width, 4);
    ctx.fillStyle = ship.team === 'player' ? '#58d7ff' : ship.isBoss ? '#e895ff' : '#ff8c71'; ctx.fillRect(x - width / 2, y + 3, width * hp, 4); ctx.textAlign = 'start';
  }

  function drawLooseParts(view) {
    for (const part of state.debris) {
      const x = part.x - view.x; const y = part.y - view.y;
      if (x < -40 || x > canvas.width + 40 || y < -40 || y > canvas.height + 40) continue;
      const spec = MODULES[part.type]; ctx.save(); ctx.translate(x, y); ctx.rotate(part.angle);
      ctx.fillStyle = part.broken ? '#3d2b2e' : part.neutral ? '#204d50' : '#5a4d29'; ctx.fillRect(-15, -15, 30, 30);
      ctx.strokeStyle = part.broken ? '#ff785f' : part.salvageable ? '#ffe082' : '#a45b61'; ctx.lineWidth = 2; ctx.strokeRect(-15, -15, 30, 30);
      ctx.fillStyle = spec.stroke; ctx.fillRect(-7, -7, 14, 14); drawCracks(part.cracks, -16, -16); ctx.restore();
    }
  }

  function drawBulletsAndParticles(view) {
    for (const bullet of state.bullets) {
      ctx.fillStyle = bullet.team === 'player' ? '#f7b8ef' : '#ffb386'; ctx.beginPath(); ctx.arc(bullet.x - view.x, bullet.y - view.y, bullet.radius, 0, Math.PI * 2); ctx.fill();
    }
    for (const particle of state.particles) {
      ctx.fillStyle = particle.color; ctx.globalAlpha = particle.life / particle.maxLife; ctx.fillRect(particle.x - view.x - 2, particle.y - view.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;
  }

  function drawSocketsAndPointer(view) {
    if (state.carried) {
      for (const socket of openSockets(state.player)) {
        const point = modulePosition(state.player, socket); const x = point.x - view.x; const y = point.y - view.y;
        ctx.strokeStyle = 'rgba(255,224,130,.82)'; ctx.lineWidth = 2; ctx.strokeRect(x - 16, y - 16, 32, 32);
      }
    }
    if (!state.pointer) return;
    const { x, y } = state.pointer; const world = { x: x + view.x, y: y + view.y };
    const nearbyPart = state.debris.find((part) => part.salvageable && length(part.x - world.x, part.y - world.y) < 50);
    ctx.strokeStyle = state.carried || nearbyPart ? '#ffe082' : 'rgba(220,240,255,.72)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, state.carried || nearbyPart ? 17 : 11, 0, Math.PI * 2); ctx.stroke();
    if (state.carried || nearbyPart) {
      const label = state.carried ? `PLACE ${MODULES[state.carried.type].label}` : `PICK ${MODULES[nearbyPart.type].label}`;
      ctx.fillStyle = '#ffe082'; ctx.font = '800 11px system-ui'; ctx.fillText(label, x + 20, y - 16);
    }
  }

  function nearestOwnedModule(worldX, worldY) {
    let selected = null; let best = MODULE_RADIUS + 6;
    for (const module of state.player.modules) {
      const point = modulePosition(state.player, module); const distance = length(worldX - point.x, worldY - point.y);
      if (distance < best) { selected = module; best = distance; }
    }
    return selected;
  }

  function nearestSocket(worldX, worldY) {
    let selected = null; let best = CELL * .72;
    for (const socket of openSockets(state.player)) {
      const point = modulePosition(state.player, socket); const distance = length(worldX - point.x, worldY - point.y);
      if (distance < best) { selected = socket; best = distance; }
    }
    return selected;
  }

  function detachModule(module) {
    if (!module || module.type === 'core') { notify('CORE LOCKED', '지휘 코어는 이동하거나 회수할 수 없습니다.', 2.5); return; }
    if (state.carried) { notify('CARGO FULL', '들고 있는 부품을 먼저 빈 소켓에 재장착하세요.', 2.5); return; }
    if (state.player.removeModule(module)) {
      state.carried = { type: module.type, hp: module.hp, cracks: module.cracks };
      notify(`MOVING ${MODULES[module.type].label}`, '황금색 빈 소켓을 클릭해 재장착하세요.', 3);
    }
  }

  function attachCarried(socket) {
    if (!state.carried || !socket) return false;
    const module = state.player.addModule(state.carried.type, socket.gx, socket.gy, state.carried.hp, state.carried.cracks);
    if (!module) return false;
    notify(`${MODULES[module.type].label} REATTACHED`, `${socket.gx}, ${socket.gy} 격자에 기존 부품을 재장착했습니다.`, 3);
    state.carried = null;
    return true;
  }

  function attachLoosePart(worldX, worldY) {
    let candidate = null; let best = 50;
    for (const part of state.debris) {
      if (!part.salvageable) continue;
      const distance = length(part.x - worldX, part.y - worldY);
      if (distance < best) { candidate = part; best = distance; }
    }
    if (!candidate) return false;
    if (state.player.modules.length >= 18) { notify('MODULE LIMIT', '함선의 모듈 한도는 18개입니다.', 2.5); return true; }
    if (length(candidate.x - state.player.x, candidate.y - state.player.y) > 420) { notify('TOO FAR TO SALVAGE', '함선 420px 안의 회수 가능 부품만 장착할 수 있습니다.', 2.5); return true; }
    const socket = openSockets(state.player).sort((a, b) => {
      const pa = modulePosition(state.player, a); const pb = modulePosition(state.player, b);
      return length(pa.x - candidate.x, pa.y - candidate.y) - length(pb.x - candidate.x, pb.y - candidate.y);
    })[0];
    if (!socket) { notify('NO OPEN SOCKET', '인접한 빈 연결점이 필요합니다.', 2.5); return true; }
    const module = state.player.addModule(candidate.type, socket.gx, socket.gy, candidate.hp, candidate.cracks);
    if (!module) return true;
    state.debris = state.debris.filter((part) => part !== candidate); state.salvage += 1;
    createSparks(state.player.x, state.player.y, '#ffe082', 10);
    notify(`${candidate.neutral ? 'NEUTRAL' : 'SALVAGED'} ${MODULES[candidate.type].label}`, `${socket.gx}, ${socket.gy} 연결점에 장착했습니다.`, 3);
    return true;
  }

  function handleCanvasClick(event) {
    if (state.status !== 'running') return;
    const rect = canvas.getBoundingClientRect(); const view = camera();
    const worldX = (event.clientX - rect.left) * (canvas.width / rect.width) + view.x;
    const worldY = (event.clientY - rect.top) * (canvas.height / rect.height) + view.y;
    const owned = nearestOwnedModule(worldX, worldY);
    if (event.shiftKey && owned) { detachModule(owned); return; }
    if (state.carried) {
      if (!attachCarried(nearestSocket(worldX, worldY))) notify('INVALID SOCKET', '황금색으로 표시된 인접 빈 소켓을 클릭하세요.', 2.5);
      return;
    }
    attachLoosePart(worldX, worldY);
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

  function update(dt) {
    if (state.status !== 'running' || !state.player) return;
    state.player.updatePilot(dt); state.player.updateMotion(dt);
    if (input.has('Space')) fire(state.player);
    for (const enemy of state.enemies) updateEnemy(enemy, dt);
    resolveShipModuleCollisions(); resolveLoosePartCollisions(); updateBullets(dt);
    for (const enemy of state.enemies) if (!enemy.alive) breakShip(enemy);
    if (!state.player.alive) breakShip(state.player);
    updateBossStates();
    state.enemies = state.enemies.filter((enemy) => enemy.alive);
    updateDebrisAndEffects(dt);
    if (!state.player.alive) { showEnd(false); return; }
    if (state.status !== 'running') return;
    updateWorldDirector(dt); updateHud();
  }

  function frame(time) {
    const dt = Math.min(.033, (time - state.lastTime) / 1000 || 0);
    state.lastTime = time; state.time = time;
    update(dt);
    const view = camera();
    drawBackground(time, view); drawWorldMarkers(view);
    drawLooseParts(view);
    if (state.player) drawShip(state.player, view);
    for (const enemy of state.enemies) drawShip(enemy, view);
    if (state.player) drawShipStatus(state.player, view);
    for (const enemy of state.enemies) drawShipStatus(enemy, view);
    drawBulletsAndParticles(view); drawSocketsAndPointer(view);
    requestAnimationFrame(frame);
  }

  window.addEventListener('keydown', (event) => {
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'Space'].includes(event.code)) event.preventDefault();
    if (event.code === 'KeyR' && !event.repeat) launch();
    if (event.code === 'KeyE' && !event.repeat) useStation();
    input.add(event.code);
  });
  window.addEventListener('keyup', (event) => input.delete(event.code));
  window.addEventListener('blur', () => input.clear());
  canvas.addEventListener('click', handleCanvasClick);
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    state.pointer = { x: (event.clientX - rect.left) * (canvas.width / rect.width), y: (event.clientY - rect.top) * (canvas.height / rect.height) };
  });
  canvas.addEventListener('mouseleave', () => { state.pointer = null; });
  launchButton.addEventListener('click', launch);
  restartButton.addEventListener('click', () => { restoreBriefingOverlay(); state.status = 'briefing'; overlay.classList.remove('is-hidden'); });
  resetGame(); requestAnimationFrame(frame);
})();
