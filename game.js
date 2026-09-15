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
  const state = { status: 'briefing', time: 0, lastTime: 0, stars: [], player: null };

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
      this.modules = [];
    }

    get radius() { return 22; }
    get alive() { return this.coreHp > 0; }

    updatePilot(dt) {
      const turn = (input.has('KeyD') ? 1 : 0) - (input.has('KeyA') ? 1 : 0);
      const thrust = (input.has('KeyW') ? 1 : 0) - (input.has('KeyS') ? .55 : 0);
      this.angularVelocity += turn * 5.4 * dt;
      this.angularVelocity *= Math.pow(.001, dt);
      this.angle += this.angularVelocity * dt;
      if (thrust) {
        const force = thrust * 320;
        this.vx += Math.cos(this.angle) * force * dt;
        this.vy += Math.sin(this.angle) * force * dt;
      }
    }

    updateMotion(dt) {
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
      ctx.beginPath(); ctx.moveTo(-24, 0); ctx.lineTo(-44 - Math.random() * 10, 8); ctx.lineTo(-44 - Math.random() * 10, -8); ctx.fill();
    }
    ctx.fillStyle = '#17365e';
    ctx.fillRect(-20, -20, 40, 40);
    ctx.strokeStyle = '#70ddff';
    ctx.lineWidth = 2;
    ctx.strokeRect(-20, -20, 40, 40);
    ctx.fillStyle = '#ff7a90';
    ctx.fillRect(-7, -7, 14, 14);
    ctx.fillStyle = '#c7f4ff';
    ctx.fillRect(10, -3, 6, 6);
    ctx.restore();
  }

  function update(dt) {
    if (state.status !== 'running' || !state.player) return;
    state.player.updatePilot(dt);
    state.player.updateMotion(dt);
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
