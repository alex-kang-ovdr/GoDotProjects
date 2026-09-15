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
    title: document.querySelector('#mission-title'), copy: document.querySelector('#mission-copy'),
  };
  const input = new Set();
  const WORLD = { width: 3000, height: 2000 };
  const state = { status: 'briefing', time: 0, lastTime: 0, stars: [], player: null, bullets: [] };
  const CELL = 38;
  const MODULES = {
    core: { label: 'CORE', hp: 100, mass: 2, fill: '#17365e', stroke: '#70ddff' },
    armor: { label: 'PLATE', hp: 18, mass: 1.8, fill: '#334661', stroke: '#a9bed9' },
    thruster: { label: 'DRIVE', hp: 14, mass: 1.1, force: 180, fill: '#174a5a', stroke: '#62e7ff' },
    laser: { label: 'LZR', hp: 12, mass: 1.2, fill: '#533052', stroke: '#ff92e8' },
    battery: { label: 'CELL', hp: 16, mass: 1.4, fill: '#594920', stroke: '#ffe082' },
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const length = (x, y) => Math.hypot(x, y);

  class Ship {
    constructor(team, x, y, angle = -Math.PI / 2) {
      this.team = team;
      this.x = x;
      this.y = y;
      this.angle = angle;
      this.vx = 0;
      this.vy = 0;
      this.angularVelocity = 0;
      this.coreHp = 100;
      this.coreMaxHp = 100;
      this.cooldown = 0;
      this.heat = 0;
      this.modules = [this.makeModule('core', 0, 0)];
    }

    makeModule(type, gx, gy) {
      const spec = MODULES[type];
      return { type, gx, gy, hp: spec.hp, maxHp: spec.hp, uid: `${type}-${Math.random().toString(36).slice(2, 8)}` };
    }
    get radius() { return 22 + Math.max(...this.modules.map((module) => Math.max(Math.abs(module.gx), Math.abs(module.gy))) || [0]) * CELL; }
    get alive() { return this.coreHp > 0; }
    get mass() { return this.modules.reduce((total, module) => total + MODULES[module.type].mass, 0); }
    get modulesByType() { return (type) => this.modules.filter((module) => module.type === type); }
    getModule(gx, gy) { return this.modules.find((module) => module.gx === gx && module.gy === gy); }
    addModule(type, gx, gy) {
      if (this.getModule(gx, gy) || !MODULES[type]) return false;
      this.modules.push(this.makeModule(type, gx, gy));
      return true;
    }

    updatePilot(dt) {
      const turn = (input.has('KeyD') ? 1 : 0) - (input.has('KeyA') ? 1 : 0);
      const thrust = (input.has('KeyW') ? 1 : 0) - (input.has('KeyS') ? .55 : 0);
      this.angularVelocity += turn * 5.4 * dt;
      this.angularVelocity *= Math.pow(.001, dt);
      this.angle += this.angularVelocity * dt;
      if (thrust) {
        const drives = this.modulesByType('thruster').length;
        const force = thrust * (260 + drives * MODULES.thruster.force) / Math.sqrt(this.mass);
        this.vx += Math.cos(this.angle) * force * dt;
        this.vy += Math.sin(this.angle) * force * dt;
      }
    }

    updateMotion(dt) {
      this.cooldown = Math.max(0, this.cooldown - dt);
      this.heat = Math.max(0, this.heat - dt * (18 + this.modulesByType('battery').length * 9));
      this.vx *= Math.pow(.16, dt);
      this.vy *= Math.pow(.16, dt);
      this.x = clamp(this.x + this.vx * dt, 40, WORLD.width - 40);
      this.y = clamp(this.y + this.vy * dt, 40, WORLD.height - 40);
    }
  }

  function makeStars() {
    state.stars = Array.from({ length: 220 }, () => ({ x: Math.random() * WORLD.width, y: Math.random() * WORLD.height, size: Math.random() * 1.6 + .4, phase: Math.random() * 6.28 }));
  }

  function resetGame() {
    state.player = new Ship('player', WORLD.width / 2, WORLD.height / 2);
    state.player.addModule('armor', 1, 0);
    state.player.addModule('laser', 0, -1);
    state.player.addModule('laser', 0, 1);
    state.player.addModule('thruster', -1, -1);
    state.player.addModule('thruster', -1, 1);
    state.player.addModule('battery', -1, 0);
    state.status = 'briefing';
    readouts.hull.textContent = '100%';
    readouts.salvage.textContent = '0';
    readouts.wave.textContent = '—';
    readouts.threat.textContent = 'LOW';
    readouts.title.textContent = '정찰 준비';
    readouts.copy.textContent = '출항을 눌러 비행 조종계를 활성화하세요.';
  }

  function launch() {
    resetGame();
    state.status = 'running';
    overlay.classList.add('is-hidden');
    readouts.title.textContent = '관성 비행';
    readouts.copy.textContent = 'W/S로 추력, A/D로 회전하세요. 우주에서는 방향을 바꿔도 속도가 즉시 바뀌지 않습니다.';
    readouts.wave.textContent = '1';
  }

  function endBriefing() {
    state.status = 'briefing';
    overlay.classList.remove('is-hidden');
    readouts.title.textContent = '정찰 준비';
    readouts.copy.textContent = '출항을 눌러 비행 조종계를 활성화하세요.';
  }

  function camera() {
    if (!state.player) return { x: 0, y: 0 };
    return { x: clamp(state.player.x - canvas.width / 2, 0, WORLD.width - canvas.width), y: clamp(state.player.y - canvas.height / 2, 0, WORLD.height - canvas.height) };
  }

  function drawBackground(time, view) {
    ctx.fillStyle = '#030712';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const star of state.stars) {
      if (star.x < view.x - 8 || star.x > view.x + canvas.width + 8 || star.y < view.y - 8 || star.y > view.y + canvas.height + 8) continue;
      ctx.fillStyle = `rgba(155,207,255,${.24 + Math.sin(time * .0015 + star.phase) * .18})`;
      ctx.fillRect(star.x - view.x, star.y - view.y, star.size, star.size);
    }
    ctx.strokeStyle = 'rgba(50,97,150,.13)';
    ctx.lineWidth = 1;
    const grid = 100;
    for (let x = -(view.x % grid); x < canvas.width; x += grid) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
    for (let y = -(view.y % grid); y < canvas.height; y += grid) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }
  }

  function drawShip(ship, view) {
    const x = ship.x - view.x;
    const y = ship.y - view.y;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ship.angle);
    const moving = length(ship.vx, ship.vy) > 45;
    if (moving) {
      ctx.fillStyle = 'rgba(88,215,255,.75)';
      for (const drive of ship.modulesByType('thruster')) {
        ctx.beginPath();
        ctx.moveTo(drive.gx * CELL - 18, drive.gy * CELL);
        ctx.lineTo(drive.gx * CELL - 42 - Math.random() * 10, drive.gy * CELL + 8);
        ctx.lineTo(drive.gx * CELL - 42 - Math.random() * 10, drive.gy * CELL - 8);
        ctx.fill();
      }
    }
    for (const module of ship.modules) drawModule(module, ship.team);
    ctx.restore();
  }

  function drawModule(module, team) {
    const spec = MODULES[module.type];
    const x = module.gx * CELL - 16;
    const y = module.gy * CELL - 16;
    ctx.fillStyle = team === 'enemy' ? '#542d35' : spec.fill;
    ctx.fillRect(x, y, 32, 32);
    ctx.strokeStyle = team === 'enemy' ? '#ff9d7c' : spec.stroke;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, 32, 32);
    if (module.type === 'core') {
      ctx.fillStyle = team === 'enemy' ? '#ff8973' : '#ff7a90';
      ctx.fillRect(x + 10, y + 10, 12, 12);
    } else if (module.type === 'laser') {
      ctx.fillStyle = '#f7b8ef';
      ctx.fillRect(x + 23, y + 13, 13, 6);
    } else if (module.type === 'thruster') {
      ctx.fillStyle = '#baf8ff';
      ctx.fillRect(x + 4, y + 10, 8, 12);
    } else if (module.type === 'battery') {
      ctx.fillStyle = '#ffe082';
      ctx.fillRect(x + 11, y + 8, 10, 16);
    }
    ctx.fillStyle = 'rgba(4, 8, 19, .62)';
    ctx.fillRect(x, y + 29, 32 * (module.hp / module.maxHp), 3);
  }

  function modulePosition(ship, module) {
    const localX = module.gx * CELL;
    const localY = module.gy * CELL;
    const cos = Math.cos(ship.angle);
    const sin = Math.sin(ship.angle);
    return { x: ship.x + localX * cos - localY * sin, y: ship.y + localX * sin + localY * cos };
  }

  function fire(ship) {
    const lasers = ship.modulesByType('laser');
    if (!lasers.length || ship.cooldown > 0 || ship.heat > 100) return;
    ship.cooldown = .28;
    ship.heat += 11 + lasers.length * 3;
    for (const laser of lasers) {
      const position = modulePosition(ship, laser);
      state.bullets.push({ x: position.x + Math.cos(ship.angle) * 20, y: position.y + Math.sin(ship.angle) * 20, vx: ship.vx + Math.cos(ship.angle) * 720, vy: ship.vy + Math.sin(ship.angle) * 720, life: 1.35, team: ship.team, damage: 7 });
    }
  }

  function updateBullets(dt) {
    for (const bullet of state.bullets) {
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.life -= dt;
    }
    state.bullets = state.bullets.filter((bullet) => bullet.life > 0 && bullet.x > 0 && bullet.x < WORLD.width && bullet.y > 0 && bullet.y < WORLD.height);
  }

  function drawBullets(view) {
    ctx.fillStyle = '#f7b8ef';
    for (const bullet of state.bullets) {
      ctx.beginPath();
      ctx.arc(bullet.x - view.x, bullet.y - view.y, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function update(dt) {
    if (state.status !== 'running' || !state.player) return;
    state.player.updatePilot(dt);
    state.player.updateMotion(dt);
    if (input.has('Space')) fire(state.player);
    updateBullets(dt);
    readouts.hull.textContent = `${Math.ceil(state.player.coreHp)}%`;
  }

  function frame(time) {
    const dt = Math.min(.033, (time - state.lastTime) / 1000 || 0);
    state.lastTime = time;
    state.time = time;
    update(dt);
    const view = camera();
    drawBackground(time, view);
    if (state.player) drawShip(state.player, view);
    drawBullets(view);
    requestAnimationFrame(frame);
  }

  window.addEventListener('keydown', (event) => {
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].includes(event.code)) event.preventDefault();
    if (event.code === 'KeyR') launch();
    input.add(event.code);
  });
  window.addEventListener('keyup', (event) => input.delete(event.code));
  launchButton.addEventListener('click', launch);
  restartButton.addEventListener('click', endBriefing);
  makeStars();
  resetGame();
  requestAnimationFrame(frame);
})();
