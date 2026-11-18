/* Pure, dependency-free game rules. Also loadable by node:test through vm. */
(function (root) {
  'use strict';
  const copy = value => JSON.parse(JSON.stringify(value));
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const int = (n, a, b) => Number.isInteger(n) && n >= a && n <= b;
  const random = Math.random;
  function seeded(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function shuffle(values, rng = random) { const a = values.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const base = () => ({ score: 0, elapsed: 0, status: 'playing' });
  const adjacent = (a, b, size) => Math.abs(a % size - b % size) + Math.abs(Math.floor(a / size) - Math.floor(b / size)) === 1;

  const match3 = {
    matches(board) {
      const found = new Set();
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        const i = r * 8 + c, v = board[i]; if (v < 0) continue;
        if (c < 6 && board[i + 1] === v && board[i + 2] === v) { let x = c; while (x < 8 && board[r * 8 + x] === v) found.add(r * 8 + x++); }
        if (r < 6 && board[i + 8] === v && board[i + 16] === v) { let y = r; while (y < 8 && board[y * 8 + c] === v) found.add(y++ * 8 + c); }
      }
      return [...found];
    },
    hasMove(board) {
      for (let i = 0; i < 64; i++) for (const j of [i % 8 < 7 ? i + 1 : -1, i < 56 ? i + 8 : -1]) {
        if (j < 0) continue; const b = board.slice(); [b[i], b[j]] = [b[j], b[i]];
        if (match3.matches(b).length) return true;
      }
      return false;
    },
    board(rng = random) {
      let b;
      for (let attempt = 0; attempt < 100; attempt++) {
        b = [];
        for (let i = 0; i < 64; i++) {
          const forbidden = new Set(); if (i % 8 > 1 && b[i - 1] === b[i - 2]) forbidden.add(b[i - 1]); if (i >= 16 && b[i - 8] === b[i - 16]) forbidden.add(b[i - 8]);
          const choices = [0, 1, 2, 3, 4, 5].filter(x => !forbidden.has(x)); b.push(choices[Math.floor(rng() * choices.length)]);
        }
        if (match3.hasMove(b)) return b;
      }
      // A deterministic legal swap also protects pathological test RNGs.
      b[0] = 0; b[1] = 1; b[2] = 0; b[9] = 0; return b;
    },
    newState(rng = random) { return { ...base(), board: match3.board(rng), moves: 25, target: 1200 }; },
    swap(state, a, b, rng = random) {
      if (state.status !== 'playing' || !int(a, 0, 63) || !int(b, 0, 63) || !adjacent(a, b, 8)) return { state, changed: false };
      const s = copy(state); [s.board[a], s.board[b]] = [s.board[b], s.board[a]];
      let hits = match3.matches(s.board); if (!hits.length) return { state, changed: false };
      s.moves--; let chain = 0, cleared = 0;
      while (hits.length && chain < 50) {
        chain++; cleared += hits.length; s.score += hits.length * 10 * chain;
        hits.forEach(i => s.board[i] = -1);
        for (let c = 0; c < 8; c++) {
          const col = []; for (let r = 7; r >= 0; r--) if (s.board[r * 8 + c] >= 0) col.push(s.board[r * 8 + c]);
          while (col.length < 8) col.push(Math.floor(rng() * 6));
          for (let r = 7; r >= 0; r--) s.board[r * 8 + c] = col[7 - r];
        }
        hits = match3.matches(s.board);
      }
      let reshuffled = false;
      if (hits.length || !match3.hasMove(s.board)) { s.board = match3.board(rng); reshuffled = true; }
      s.status = s.score >= s.target ? 'won' : s.moves <= 0 ? 'lost' : 'playing';
      return { state: s, changed: true, chain, cleared, reshuffled };
    }
  };

  const SHAPES = [ [[1,1,1,1]], [[1,1],[1,1]], [[0,1,0],[1,1,1]], [[0,1,1],[1,1,0]], [[1,1,0],[0,1,1]], [[1,0,0],[1,1,1]], [[0,0,1],[1,1,1]] ];
  const falling = {
    shapes: SHAPES,
    piece(rng = random) { const kind = Math.floor(rng() * 7); return { kind, cells: copy(SHAPES[kind]), x: 3, y: 0 }; },
    newState(rng = random) { return { ...base(), board: Array(180).fill(0), piece: falling.piece(rng), lines: 0, level: 1 }; },
    collides(board, piece, dx = 0, dy = 0, matrix = piece.cells) {
      for (let r = 0; r < matrix.length; r++) for (let c = 0; c < matrix[r].length; c++) if (matrix[r][c]) {
        const x = piece.x + c + dx, y = piece.y + r + dy;
        if (x < 0 || x >= 10 || y < 0 || y >= 18 || board[y * 10 + x]) return true;
      }
      return false;
    },
    rotate(matrix) { return matrix[0].map((_, c) => matrix.map(row => row[c]).reverse()); },
    clearLines(board) {
      const rows = []; let cleared = 0;
      for (let r = 0; r < 18; r++) { const row = board.slice(r * 10, r * 10 + 10); if (row.every(Boolean)) cleared++; else rows.push(row); }
      while (rows.length < 18) rows.unshift(Array(10).fill(0)); return { board: rows.flat(), cleared };
    },
    step(state, action, rng = random) {
      if (state.status !== 'playing') return state;
      const s = copy(state), p = s.piece;
      if (action === 'left' || action === 'right') { const dx = action === 'left' ? -1 : 1; if (!falling.collides(s.board, p, dx, 0)) p.x += dx; return s; }
      if (action === 'rotate') {
        const rotated = falling.rotate(p.cells);
        for (const dx of [0, -1, 1, -2, 2]) if (!falling.collides(s.board, p, dx, 0, rotated)) { p.cells = rotated; p.x += dx; break; }
        return s;
      }
      if (action === 'drop') { while (!falling.collides(s.board, p, 0, 1)) { p.y++; s.score += 2; } }
      else if (action === 'down') { if (!falling.collides(s.board, p, 0, 1)) { p.y++; return s; } }
      else return s;
      for (let r = 0; r < p.cells.length; r++) for (let c = 0; c < p.cells[r].length; c++) if (p.cells[r][c]) s.board[(p.y + r) * 10 + p.x + c] = p.kind + 1;
      const result = falling.clearLines(s.board); s.board = result.board;
      s.score += [0, 100, 300, 500, 800][result.cleared] * s.level; s.lines += result.cleared; s.level = 1 + Math.floor(s.lines / 5);
      s.piece = falling.piece(rng);
      if (s.lines >= 20) s.status = 'won'; else if (falling.collides(s.board, s.piece)) s.status = 'lost';
      return s;
    }
  };

  const bubble = {
    radius: level => [15, 26, 42][level],
    newState() { return { ...base(), playerX: 320, lives: 3, remaining: 90, invulnerable: 0, cooldown: 0, harpoon: null, balls: [{ x: 150, y: 120, vx: 95, vy: 0, level: 2 }, { x: 490, y: 180, vx: -95, vy: -80, level: 2 }] }; },
    split(ball) {
      if (!ball.level) return [];
      const level = ball.level - 1, speed = [155, 125][level];
      return [-1, 1].map(dir => ({ x: ball.x + dir * 5, y: ball.y, vx: dir * speed, vy: -290, level }));
    },
    step(state, delta, input = {}) {
      if (state.status !== 'playing') return state;
      const s = copy(state), dt = clamp(delta, 0, .05);
      s.elapsed += dt; s.remaining = Math.max(0, s.remaining - dt); s.invulnerable = Math.max(0, s.invulnerable - dt); s.cooldown = Math.max(0, s.cooldown - dt);
      s.playerX = clamp(s.playerX + (input.direction || 0) * 285 * dt, 20, 620);
      if (input.fire && !s.harpoon && s.cooldown <= 0) { s.harpoon = { x: s.playerX, y: 394 }; s.cooldown = .3; }
      if (s.harpoon) { s.harpoon.y -= 620 * dt; if (s.harpoon.y < -10) s.harpoon = null; }
      s.balls.forEach(ball => {
        const radius = bubble.radius(ball.level); ball.vy += 550 * dt; ball.x += ball.vx * dt; ball.y += ball.vy * dt;
        if (ball.x < radius) { ball.x = radius; ball.vx = Math.abs(ball.vx); }
        if (ball.x > 640 - radius) { ball.x = 640 - radius; ball.vx = -Math.abs(ball.vx); }
        if (ball.y > 394 - radius) { ball.y = 394 - radius; ball.vy = -[235, 300, 375][ball.level]; }
        if (ball.y < radius) { ball.y = radius; ball.vy = Math.abs(ball.vy); }
      });
      if (s.harpoon) {
        const i = s.balls.findIndex(ball => Math.abs(ball.x - s.harpoon.x) <= bubble.radius(ball.level) && ball.y + bubble.radius(ball.level) >= s.harpoon.y && ball.y - bubble.radius(ball.level) <= 394);
        if (i >= 0) { const ball = s.balls[i]; s.balls.splice(i, 1, ...bubble.split(ball)); s.harpoon = null; s.score += 100; }
      }
      if (s.invulnerable <= 0 && s.balls.some(ball => Math.abs(ball.x - s.playerX) < bubble.radius(ball.level) + 13 && ball.y + bubble.radius(ball.level) > 386)) { s.lives--; s.invulnerable = 1.8; }
      if (!s.balls.length) s.status = 'won'; else if (s.lives <= 0 || s.remaining <= 0) s.status = 'lost';
      return s;
    }
  };

  const brick = {
    newState() { return { ...base(), bricks: Array(40).fill(true), paddleX: 320, ball: { x: 320, y: 393, vx: 140, vy: -280, attached: true }, lives: 3 }; },
    rect(index) { return { x: 32 + (index % 8) * 72, y: 42 + Math.floor(index / 8) * 31, w: 64, h: 22 }; },
    step(state, delta, input = {}) {
      if (state.status !== 'playing') return state;
      const s = copy(state), dt = clamp(delta, 0, .025); s.elapsed += dt;
      if (Number.isFinite(input.target)) s.paddleX = clamp(input.target, 52, 588); else s.paddleX = clamp(s.paddleX + (input.direction || 0) * 410 * dt, 52, 588);
      const b = s.ball;
      if (b.attached) { b.x = s.paddleX; b.y = 393; if (input.fire) b.attached = false; else return s; }
      const oldX = b.x, oldY = b.y; b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.x < 7) { b.x = 7; b.vx = Math.abs(b.vx); } if (b.x > 633) { b.x = 633; b.vx = -Math.abs(b.vx); }
      if (b.y < 7) { b.y = 7; b.vy = Math.abs(b.vy); }
      if (b.vy > 0 && oldY <= 403 && b.y >= 400 && Math.abs(b.x - s.paddleX) <= 57) {
        b.y = 400; const t = clamp((b.x - s.paddleX) / 52, -.95, .95); b.vx = 300 * t; if (Math.abs(b.vx) < 35) b.vx = 35 * (b.vx < 0 ? -1 : 1); b.vy = -Math.sqrt(320 * 320 - b.vx * b.vx);
      }
      for (let i = 0; i < 40; i++) if (s.bricks[i]) {
        const r = brick.rect(i), nx = clamp(b.x, r.x, r.x + r.w), ny = clamp(b.y, r.y, r.y + r.h);
        if ((b.x - nx) ** 2 + (b.y - ny) ** 2 <= 49) {
          s.bricks[i] = false; s.score += 25;
          if (oldX + 7 <= r.x || oldX - 7 >= r.x + r.w) b.vx *= -1; else b.vy *= -1;
          b.x = oldX; b.y = oldY; break;
        }
      }
      if (b.y > 450) { s.lives--; b.attached = true; b.vx = 140; b.vy = -280; }
      if (!s.bricks.some(Boolean)) s.status = 'won'; else if (s.lives <= 0) s.status = 'lost';
      return s;
    }
  };

  const slide = {
    solved(board) { return board.every((v, i) => v === (i + 1) % 9); },
    newState(rng = random) {
      const board = [1,2,3,4,5,6,7,8,0]; let blank = 8, previous = -1;
      for (let n = 0; n < 100; n++) { const choices = board.map((_, i) => i).filter(i => adjacent(i, blank, 3) && i !== previous); const next = choices[Math.floor(rng() * choices.length)]; [board[blank], board[next]] = [board[next], board[blank]]; previous = blank; blank = next; }
      if (slide.solved(board)) [board[7], board[8]] = [board[8], board[7]];
      return { ...base(), board, moves: 0 };
    },
    move(state, index) {
      if (state.status !== 'playing' || !int(index, 0, 8)) return state; const blank = state.board.indexOf(0); if (!adjacent(blank, index, 3)) return state;
      const s = copy(state); [s.board[blank], s.board[index]] = [s.board[index], s.board[blank]]; s.moves++; s.score = Math.max(100, 2000 - s.moves * 10);
      if (slide.solved(s.board)) s.status = 'won'; return s;
    },
    direction(state, dir) { const blank = state.board.indexOf(0), offsets = { left: -1, right: 1, up: -3, down: 3 }; const i = blank + offsets[dir]; return slide.move(state, i); },
    solvable(board) { let inversions = 0; for (let i = 0; i < board.length; i++) for (let j = i + 1; j < board.length; j++) if (board[i] && board[j] && board[i] > board[j]) inversions++; return inversions % 2 === 0; }
  };

  const mines = {
    newState() { return { ...base(), mines: Array(81).fill(false), revealed: Array(81).fill(false), flags: Array(81).fill(false), first: true, moves: 0 }; },
    neighbors(i) { const a = [], r = Math.floor(i / 9), c = i % 9; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && r + dy >= 0 && r + dy < 9 && c + dx >= 0 && c + dx < 9) a.push((r + dy) * 9 + c + dx); return a; },
    count(state, i) { return mines.neighbors(i).filter(n => state.mines[n]).length; },
    flag(state, i) { if (state.status !== 'playing' || !int(i, 0, 80) || state.revealed[i]) return state; const s = copy(state); s.flags[i] = !s.flags[i]; return s; },
    reveal(state, i, rng = random) {
      if (state.status !== 'playing' || !int(i, 0, 80) || state.flags[i] || state.revealed[i]) return state;
      const s = copy(state); s.moves++;
      if (s.first) { const safe = new Set([i, ...mines.neighbors(i)]); const choices = shuffle(Array.from({length:81}, (_, n) => n).filter(n => !safe.has(n)), rng); choices.slice(0, 10).forEach(n => s.mines[n] = true); s.first = false; }
      if (s.mines[i]) { s.revealed[i] = true; s.status = 'lost'; return s; }
      const queue = [i]; while (queue.length) { const n = queue.pop(); if (s.revealed[n] || s.flags[n] || s.mines[n]) continue; s.revealed[n] = true; if (!mines.count(s, n)) queue.push(...mines.neighbors(n).filter(v => !s.revealed[v])); }
      s.score = s.revealed.filter(Boolean).length * 10;
      if (s.revealed.filter(Boolean).length === 71) { s.status = 'won'; s.score += 500; s.flags = s.mines.slice(); }
      return s;
    }
  };

  const memory = {
    newState(rng = random) { return { ...base(), board: shuffle([...Array(8).keys(), ...Array(8).keys()], rng), matched: Array(16).fill(false), open: [], moves: 0 }; },
    flip(state, index) {
      if (state.status !== 'playing' || !int(index, 0, 15) || state.open.length >= 2 || state.open.includes(index) || state.matched[index]) return state;
      const s = copy(state); s.open.push(index);
      if (s.open.length === 2) { s.moves++; const [a, b] = s.open; if (s.board[a] === s.board[b]) { s.matched[a] = s.matched[b] = true; s.open = []; s.score += 100; if (s.matched.every(Boolean)) { s.status = 'won'; s.score = Math.max(100, 2000 - Math.max(0, s.moves - 8) * 65); } } }
      return s;
    },
    close(state) { const s = copy(state); s.open = []; return s; }
  };

  const merge = {
    spawn(board, rng = random) { const a = board.slice(), empty = a.map((v,i) => v ? -1 : i).filter(i => i >= 0); if (empty.length) a[empty[Math.floor(rng() * empty.length)]] = rng() < .9 ? 2 : 4; return a; },
    newState(rng = random) { return { ...base(), board: merge.spawn(merge.spawn(Array(16).fill(0), rng), rng), moves: 0 }; },
    line(line) {
      const values = line.filter(Boolean), out = []; let score = 0;
      for (let i = 0; i < values.length; i++) { if (values[i] === values[i + 1]) { const n = values[i] * 2; out.push(n); score += n; i++; } else out.push(values[i]); }
      while (out.length < 4) out.push(0); return { line: out, score };
    },
    canMove(board) { if (board.includes(0)) return true; return board.some((v, i) => (i % 4 < 3 && board[i + 1] === v) || (i < 12 && board[i + 4] === v)); },
    move(state, dir, rng = random) {
      if (state.status !== 'playing' || !['left','right','up','down'].includes(dir)) return state;
      const s = copy(state); let gained = 0;
      for (let n = 0; n < 4; n++) {
        const ids = [0,1,2,3].map(j => dir === 'left' ? n*4+j : dir === 'right' ? n*4+3-j : dir === 'up' ? j*4+n : (3-j)*4+n);
        const result = merge.line(ids.map(i => state.board[i])); ids.forEach((i,j) => s.board[i] = result.line[j]); gained += result.score;
      }
      if (s.board.every((v,i) => v === state.board[i])) { if (!merge.canMove(s.board)) s.status = 'lost'; return s; }
      s.moves++; s.score += gained; s.board = merge.spawn(s.board, rng);
      if (s.board.some(v => v >= 2048)) s.status = 'won'; else if (!merge.canMove(s.board)) s.status = 'lost'; return s;
    }
  };

  const games = { 'match3-garden': match3, 'falling-blocks': falling, 'bubble-split': bubble, 'brick-breaker': brick, 'slide-puzzle': slide, 'mines-grid': mines, 'memory-pairs': memory, 'merge-tiles': merge };
  function valid(id, s) {
    if (!s || typeof s !== 'object' || !['playing','won','lost'].includes(s.status) || !Number.isFinite(s.score) || s.score < 0 || s.score > 1e9 || !Number.isFinite(s.elapsed) || s.elapsed < 0 || s.elapsed > 1e8) return false;
    const nums = (a,n,lo,hi) => Array.isArray(a) && a.length===n && a.every(x => int(x,lo,hi));
    const bools = (a,n) => Array.isArray(a) && a.length===n && a.every(x=>typeof x==='boolean');
    if (id==='match3-garden') return nums(s.board,64,0,5) && int(s.moves,0,25) && s.target===1200;
    if (id==='falling-blocks') return nums(s.board,180,0,7) && int(s.lines,0,24) && int(s.level,1,6) && s.piece && int(s.piece.kind,0,6) && int(s.piece.x,-3,9) && int(s.piece.y,0,17) && Array.isArray(s.piece.cells) && s.piece.cells.length>=1 && s.piece.cells.length<=4 && s.piece.cells.every(row=>Array.isArray(row)&&row.length>=1&&row.length<=4&&row.every(x=>x===0||x===1)) && (s.status!=='playing'||!falling.collides(s.board,s.piece));
    if (id==='bubble-split') return Number.isFinite(s.playerX) && s.playerX>=0 && s.playerX<=640 && int(s.lives,0,3) && Number.isFinite(s.remaining) && s.remaining>=0 && s.remaining<=90 && Number.isFinite(s.invulnerable) && Number.isFinite(s.cooldown) && Array.isArray(s.balls) && s.balls.length<=16 && s.balls.every(b=>int(b.level,0,2)&&['x','y','vx','vy'].every(k=>Number.isFinite(b[k])&&Math.abs(b[k])<2000)) && (s.harpoon===null || (s.harpoon&&Number.isFinite(s.harpoon.x)&&Number.isFinite(s.harpoon.y)));
    if (id==='brick-breaker') return bools(s.bricks,40)&&int(s.lives,0,3)&&Number.isFinite(s.paddleX)&&s.paddleX>=0&&s.paddleX<=640&&s.ball&&typeof s.ball.attached==='boolean'&&['x','y','vx','vy'].every(k=>Number.isFinite(s.ball[k])&&Math.abs(s.ball[k])<2000);
    if (id==='slide-puzzle') return nums(s.board,9,0,8)&&new Set(s.board).size===9&&slide.solvable(s.board)&&int(s.moves,0,1e7);
    if (id==='mines-grid') return bools(s.mines,81)&&bools(s.flags,81)&&bools(s.revealed,81)&&typeof s.first==='boolean'&&s.mines.filter(Boolean).length===(s.first?0:10)&&int(s.moves,0,1e7);
    if (id==='memory-pairs') return nums(s.board,16,0,7)&&[0,1,2,3,4,5,6,7].every(v=>s.board.filter(x=>x===v).length===2)&&bools(s.matched,16)&&Array.isArray(s.open)&&s.open.length<=2&&s.open.every(i=>int(i,0,15))&&new Set(s.open).size===s.open.length&&int(s.moves,0,1e7);
    if (id==='merge-tiles') return nums(s.board,16,0,2048)&&s.board.every(v=>v===0||(v>=2&&(v&(v-1))===0))&&int(s.moves,0,1e7);
    return false;
  }
  root.GameLogic = { games, match3, falling, bubble, brick, slide, mines, memory, merge, seeded, shuffle, valid, copy };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.GameLogic;
})(typeof globalThis !== 'undefined' ? globalThis : this);
