(() => {
  'use strict';

  const canvas = document.querySelector('#game');
  const ctx = canvas.getContext('2d');
  const overlay = document.querySelector('#overlay');
  const launchButton = document.querySelector('#launch-button');
  const restartButton = document.querySelector('#restart-button');
  const readouts = {
    hull: document.querySelector('#hull-readout'),
    salvage: document.querySelector('#salvage-readout'),
    wave: document.querySelector('#wave-readout'),
    threat: document.querySelector('#threat-readout'),
    title: document.querySelector('#mission-title'),
    copy: document.querySelector('#mission-copy'),
  };

  const state = { running: false, lastTime: 0, stars: [] };

  function makeStars() {
    state.stars = Array.from({ length: 140 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      size: Math.random() * 1.7 + .3,
      phase: Math.random() * Math.PI * 2,
    }));
  }

  function drawBackground(time) {
    ctx.fillStyle = '#030712';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const star of state.stars) {
      const glow = .35 + Math.sin(time * .0015 + star.phase) * .2;
      ctx.fillStyle = `rgba(155, 207, 255, ${glow})`;
      ctx.fillRect(star.x, star.y, star.size, star.size);
    }
    const grid = 80;
    ctx.strokeStyle = 'rgba(50, 97, 150, .11)';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += grid) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
    for (let y = 0; y < canvas.height; y += grid) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }
  }

  function drawPlaceholderShip(time) {
    const x = canvas.width / 2;
    const y = canvas.height / 2;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin(time * .0005) * .08);
    ctx.fillStyle = '#12345c';
    ctx.fillRect(-18, -18, 36, 36);
    ctx.strokeStyle = '#70ddff';
    ctx.lineWidth = 2;
    ctx.strokeRect(-18, -18, 36, 36);
    ctx.fillStyle = '#ff7a90';
    ctx.fillRect(-6, -6, 12, 12);
    ctx.restore();
  }

  function frame(time) {
    drawBackground(time);
    drawPlaceholderShip(time);
    requestAnimationFrame(frame);
  }

  function launch() {
    state.running = true;
    overlay.classList.add('is-hidden');
    readouts.title.textContent = '비행 조종계 온라인';
    readouts.copy.textContent = '다음 단계에서 모듈식 추진과 전투 시스템이 연결됩니다.';
    readouts.wave.textContent = '1';
  }

  function restart() {
    state.running = false;
    overlay.classList.remove('is-hidden');
    readouts.title.textContent = '정찰 준비';
    readouts.copy.textContent = '출항을 눌러 비행 조종계를 활성화하세요.';
    readouts.wave.textContent = '—';
  }

  launchButton.addEventListener('click', launch);
  restartButton.addEventListener('click', restart);
  makeStars();
  requestAnimationFrame(frame);
})();
