/* Original procedural artwork. Rendering never writes to the simulation. */
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  const TEAM = ['#74e5df', '#ffad87'];
  const THEMES = {
    highlands: { sky: ['#102f43', '#527f89', '#c8cfac'], sun: '#ffe4a1', grass: [122, 192, 149], rim: [210, 225, 169], soil: [75, 101, 94], rock: [35, 57, 70], far: '#214b60' },
    islands: { sky: ['#113c53', '#64a0a6', '#d0dfc6'], sun: '#fff0bf', grass: [157, 211, 162], rim: [236, 225, 178], soil: [108, 111, 99], rock: [43, 68, 78], far: '#327589' },
    foundry: { sky: ['#23243e', '#78556a', '#d69978'], sun: '#ffcc99', grass: [189, 155, 111], rim: [240, 198, 137], soil: [109, 75, 78], rock: [49, 45, 66], far: '#493c59' }
  };
  const KIND = { shell: '#ffd18a', multi: '#ffbc77', fire: '#ff8f62', poison: '#c6ee8e', mine: '#ffd98a', laser: '#b3faff', water: '#9be8ef', homing: '#e7bbff', shield: '#b8f5e7', teleport: '#bda8ff' };
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
  const hash = (n) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  function tint(hex, target, amount) {
    const m = /^#([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return target;
    const a = [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16));
    const n = /^#([0-9a-f]{6})$/i.exec(target);
    const b = n ? [0, 2, 4].map(i => parseInt(n[1].slice(i, i + 2), 16)) : [255, 255, 255];
    return 'rgb(' + mix(a, b, amount).join(',') + ')';
  }
  function canvas(w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
  }
  function rounded(c, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function poly(c, points, fill, stroke, line = 1) {
    c.beginPath(); points.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = line; c.stroke(); }
  }
  function circle(c, x, y, r, fill, stroke, line = 1) {
    c.beginPath(); c.arc(x, y, Math.max(0, r), 0, TAU);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = line; c.stroke(); }
  }
  function star(c, x, y, r, color, rotation = 0) {
    c.save(); c.translate(x, y); c.rotate(rotation);
    poly(c, [[0, -r], [r * .25, -r * .25], [r, 0], [r * .25, r * .25], [0, r], [-r * .25, r * .25], [-r, 0], [-r * .25, -r * .25]], color); c.restore();
  }
  function tankArt(c, def, angle, face, team, time, status, dead) {
    const color = def.color || '#67bfc4', dark = '#132c3d', light = tint(color, '#fff4d4', .5);
    const body = def.body || 'tracked', id = def.id || '';
    const accent = TEAM[team === 1 ? 1 : 0];
    c.save(); c.scale(face < 0 ? -1 : 1, 1); c.lineJoin = 'round'; c.lineCap = 'round';
    if (dead) c.globalAlpha *= .28;
    // All bodies fit the same compact gameplay footprint; silhouettes are original.
    if (body === 'hover') {
      c.fillStyle = 'rgba(132,238,233,.17)'; c.beginPath(); c.ellipse(0, 11, 20, 4, 0, 0, TAU); c.fill();
      poly(c, [[-20, 5], [-12, -1], [12, -1], [21, 5], [13, 10], [-14, 10]], dark, '#547580', 1.2);
      for (let i = -1; i <= 1; i++) { c.fillStyle = accent; rounded(c, i * 11 - 3, 7, 6, 2, 1); c.fill(); }
    } else if (body === 'walker') {
      c.strokeStyle = dark; c.lineWidth = 5;
      for (const f of [-1, 1]) for (const x of [-11, 10]) {
        c.beginPath(); c.moveTo(x * .65, 2); c.lineTo(x + f * 4, 7); c.lineTo(x + f * 7, 13); c.stroke();
        c.strokeStyle = light; c.lineWidth = 1.6; c.stroke(); c.strokeStyle = dark; c.lineWidth = 5;
      }
    } else {
      rounded(c, -20, 3, 40, 11, 5); c.fillStyle = dark; c.fill(); c.strokeStyle = '#56707c'; c.lineWidth = 1.2; c.stroke();
      for (let i = -14; i <= 15; i += 9) { circle(c, i, 8.5, 3.4, '#4a6470', '#0f2736', 1); circle(c, i, 8.5, 1.1, '#b6c5b7'); }
      c.strokeStyle = 'rgba(224,232,212,.22)'; c.lineWidth = 1; c.beginPath(); c.moveTo(-14, 12); c.lineTo(14, 12); c.stroke();
    }
    const grad = c.createLinearGradient(0, -17, 0, 10); grad.addColorStop(0, light); grad.addColorStop(.4, color); grad.addColorStop(1, tint(color, dark, .4));
    if (body === 'wedge') {
      poly(c, [[-18, 7], [-15, -5], [-4, -13], [10, -9], [20, 5], [12, 9]], grad, dark, 2);
      poly(c, [[-13, -8], [-12, -20], [-3, -12]], light, dark, 1.5);
      c.strokeStyle = 'rgba(255,246,211,.5)'; c.lineWidth = 1; c.beginPath(); c.moveTo(-14, 1); c.lineTo(12, -2); c.stroke();
    } else if (body === 'catapult' || body === 'crossbow') {
      rounded(c, -18, -3, 36, 10, 3); c.fillStyle = '#b88e59'; c.fill(); c.strokeStyle = dark; c.lineWidth = 2; c.stroke();
      c.fillStyle = '#f0ce8b'; c.fillRect(-13, -1, 26, 2);
      poly(c, [[-11, 2], [-5, -15], [3, -15], [10, 2]], grad, dark, 2);
      circle(c, 0, -5, 5.2, '#f2d7a0', dark, 1.5);
    } else if (body === 'hover') {
      c.beginPath(); c.ellipse(0, -2, 17, 11, 0, 0, TAU); c.fillStyle = grad; c.fill(); c.strokeStyle = dark; c.lineWidth = 2; c.stroke();
      c.beginPath(); c.ellipse(-4, -7, 7, 5, -.25, 0, TAU); c.fillStyle = '#bfe9e1'; c.fill();
      circle(c, -7, -9, 2, '#fff7db');
    } else if (body === 'walker') {
      poly(c, [[-16, 5], [-17, -6], [-9, -16], [7, -16], [16, -7], [17, 5]], grad, dark, 2);
      rounded(c, -10, -10, 20, 8, 3); c.fillStyle = dark; c.fill();
      c.fillStyle = accent; rounded(c, -7, -8, 14, 3, 1); c.fill();
    } else {
      poly(c, [[-19, 4], [-15, -8], [-7, -11], [13, -9], [19, 2], [15, 7], [-14, 7]], grad, dark, 2);
      if (body === 'cannon') { c.beginPath(); c.arc(-2, -6, 11, Math.PI, 0); c.lineTo(9, -3); c.lineTo(-13, -3); c.closePath(); c.fillStyle = grad; c.fill(); c.stroke(); }
      if (/missile|multi|super/i.test(id)) {
        for (let i = 0; i < 3; i++) { rounded(c, -13 + i * 7, -16, 5, 8, 2); c.fillStyle = dark; c.fill(); c.fillStyle = light; c.fillRect(-12 + i * 7, -14, 3, 2); }
      }
    }
    // A warm enamel team badge and little glass viewport give each machine character.
    if (body !== 'walker') {
      rounded(c, -12, -4, 9, 5, 2); c.fillStyle = dark; c.fill();
      c.fillStyle = '#d9f2e6'; c.fillRect(-10, -3, 5, 1.4);
    }
    circle(c, 11, 2, 3.5, accent, dark, 1); circle(c, 11, 2, 1.1, '#fff5dc');
    c.save(); c.translate(0, -7); c.rotate(-finite(angle, 45) * Math.PI / 180);
    if (body === 'catapult') {
      rounded(c, -8, -2.3, 31, 4.6, 2); c.fillStyle = '#dec18a'; c.fill(); c.strokeStyle = dark; c.lineWidth = 1.4; c.stroke();
      poly(c, [[20, -6], [27, -5], [27, 4], [20, 5]], '#d9a563', dark, 1.5); circle(c, 24, -1, 3.1, '#f8dfa3');
    } else if (body === 'crossbow') {
      rounded(c, -3, -2, 26, 4, 1); c.fillStyle = '#eed09b'; c.fill();
      c.strokeStyle = light; c.lineWidth = 3; c.beginPath(); c.moveTo(16, -12); c.quadraticCurveTo(27, 0, 16, 12); c.stroke();
      c.strokeStyle = '#fff0c4'; c.lineWidth = .8; c.beginPath(); c.moveTo(16, -12); c.lineTo(12, 0); c.lineTo(16, 12); c.stroke();
      poly(c, [[28, 0], [22, -3], [22, 3]], accent, dark, 1);
    } else {
      const length = body === 'hover' ? 25 : body === 'walker' ? 22 : 27;
      rounded(c, -2, -3.4, length, 6.8, 2); c.fillStyle = dark; c.fill();
      rounded(c, 2, -2, length - 7, 3, 1); c.fillStyle = light; c.fill();
      rounded(c, length - 6, -4.5, 7, 9, 2); c.fillStyle = tint(color, '#fff7df', .4); c.fill(); c.strokeStyle = dark; c.lineWidth = 1.5; c.stroke();
      c.fillStyle = '#152e3d'; c.fillRect(length - 1, -2.5, 2, 5);
    }
    circle(c, 0, 0, 4.4, color, dark, 1.6); circle(c, -1, -1, 1.3, '#fff1ce');
    c.restore();
    if (status && status.double && !dead) star(c, -16, -20, 4, '#ffe0a0', time * .4);
    c.restore();
  }

  class FortRenderer {
    constructor(element, game) {
      this.canvas = element; this.ctx = element.getContext('2d', { alpha: false });
      this.camera = { x: 900, y: 410, scale: 0 }; this.particles = []; this.rings = []; this.labels = [];
      this.time = 0; this.shake = 0; this.width = 0; this.height = 0; this.dpr = 1; this.options = {};
      this._pointerMove = e => { this.pointer = { x: e.clientX, y: e.clientY }; };
      this._pointerOut = () => { this.pointer = null; };
      element.addEventListener('pointermove', this._pointerMove); element.addEventListener('pointerleave', this._pointerOut);
      this.setGame(game);
    }
    setGame(game) {
      this.game = game; this.terrainCanvas = null; this.terrainDrawOffset = 0; this.terrainKey = ''; this.backgroundKey = '';
      this.particles.length = 0; this.rings.length = 0; this.labels.length = 0;
      this.shake = 0; this.camera.scale = 0; this.pointer = null;
      this.impactFocus = null; this.impactMarkers = []; this.shots = new Map();
      this.latestVolleyByOwner = new Map(); this.latestVolleyId = null; this.hitFlashes = new Map();
      this.randomState = ((game && game.config && game.config.seed) || 42681) >>> 0;
    }
    random() { let x = this.randomState += 0x6D2B79F5; x = Math.imul(x ^ x >>> 15, x | 1); x ^= x + Math.imul(x ^ x >>> 7, x | 61); return ((x ^ x >>> 14) >>> 0) / 4294967296; }
    resize() {
      const r = this.canvas.getBoundingClientRect();
      const w = Math.max(1, Math.round(r.width || this.canvas.clientWidth || 800));
      const h = Math.max(1, Math.round(r.height || this.canvas.clientHeight || 480));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (w !== this.width || h !== this.height || dpr !== this.dpr) {
        this.width = w; this.height = h; this.dpr = dpr; this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
        this.backgroundKey = '';
      }
    }
    theme() {
      const id = this.game && this.game.terrain && this.game.terrain.mapId || this.game && this.game.config && this.game.config.map || 'highlands';
      return THEMES[id] || THEMES.highlands;
    }
    buildTerrain() {
      const t = this.game.terrain; if (!t || !t.mask) return;
      const w = t.width, h = t.height, shadowed = this.options.quality !== 'low';
      const zoom = clamp(finite(Number(this.options.zoom), 1), .7, 3);
      // Use the requested fit/zoom, not the easing camera: flight tracking must
      // never invalidate the expensive shadow cache on every animation frame.
      const shadowScale = Math.max(.1, Math.min(this.width / (w + 60), this.height / (h + 48)) * zoom * this.dpr);
      const shadowKey = shadowed ? `${this.width}:${this.height}:${this.dpr}:${zoom}` : 'flat';
      const key = `${t.mapId}:${t.seed}:${t.version}:${w}:${h}:${shadowKey}`;
      if (this.terrainKey === key && this.terrainCanvas) return;
      const p = this.theme(); const land = canvas(w, h), c = land.getContext('2d');
      const img = c.createImageData(w, h), out = img.data, depth = new Uint16Array(w), surface = new Int16Array(w); surface.fill(-1);
      const mask = t.mask, seed = finite(t.seed, 1);
      for (let y = 0; y < h; y++) for (let x = 0, i = y * w; x < w; x++, i++) {
        if (!mask[i]) { depth[x] = 0; continue; }
        if (surface[x] < 0) surface[x] = y;
        const d = depth[x]++, edge = x === 0 || x === w - 1 || !mask[i - 1] || !mask[i + 1];
        const band = Math.min(1, d / 115), base = d < 2 ? p.rim : d < 7 ? p.grass : d < 18 ? p.soil : p.rock;
        const noise = (((x * 73 + y * 31 + (x * y % 97) + seed) % 19) - 9) * .65;
        const light = (d > 18 ? 11 * (1 - band) : 0) + noise - (edge ? 14 : 0) + (d > 22 && (y + Math.floor(Math.sin(x * .013) * 12)) % 47 < 2 ? 9 : 0);
        // Uint8ClampedArray performs channel clamping without three hot-loop calls.
        const j = i * 4; out[j] = base[0] + light; out[j + 1] = base[1] + light; out[j + 2] = base[2] + light; out[j + 3] = 255;
      }
      c.putImageData(img, 0, 0);
      c.save(); c.globalCompositeOperation = 'source-atop';
      for (let i = 0; i < 54; i++) {
        const x = hash(seed + i * 3) * w, y = 190 + hash(seed + i * 7) * (h - 190), size = 35 + hash(i + seed) * 115;
        poly(c, [[x, y], [x + size, y - size * .3], [x + size * .7, y + size], [x - size * .4, y + size * .6]], i % 3 ? 'rgba(5,21,32,.10)' : 'rgba(235,208,151,.09)');
      }
      c.restore();
      for (let i = 0; i < w / 24; i++) {
        const x = Math.floor(hash(seed + i * 11) * (w - 12)) + 6, y = surface[x];
        if (y < 0 || y > h - 45 || Math.abs(surface[x - 4] - y) > 7 || Math.abs(surface[x + 4] - y) > 7) continue;
        const size = 3 + hash(i + seed * 2) * 8;
        c.strokeStyle = rgba(p.grass, .9); c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(x - 4, y + 1); c.quadraticCurveTo(x - 3, y - size, x - 7, y - size * .7); c.moveTo(x, y); c.quadraticCurveTo(x, y - size, x + 3, y - size - 1); c.stroke();
        if (i % 5 === 0) { circle(c, x + 3, y - size - 1, 1.8, '#ffdda1'); circle(c, x - 7, y - size * .7, 1.2, '#f6bd87'); }
        if (i % 8 === 0) poly(c, [[x - 7, y], [x - 4, y - 5], [x + 2, y - 6], [x + 7, y]], rgba(p.rim, .65));
      }
      this.terrainDrawOffset = 0;
      if (shadowed) {
        // Bake the terrain and its shadow together once. Padding preserves the
        // old soft edge without clipping it at the source canvas boundaries.
        const pad = Math.ceil(48 / shadowScale), baked = canvas(w + pad * 2, h + pad * 2);
        const b = baked.getContext('2d');
        b.shadowColor = 'rgba(5,23,36,.28)'; b.shadowBlur = 18 / shadowScale; b.shadowOffsetY = 8 / shadowScale;
        b.drawImage(land, pad, pad);
        this.terrainCanvas = baked; this.terrainDrawOffset = pad;
      } else this.terrainCanvas = land;
      this.terrainKey = key; this.surface = surface;
    }
    background() {
      const c = this.ctx, w = this.width, h = this.height, p = this.theme();
      const key = `${w}:${h}:${this.game.terrain.mapId}`;
      if (key !== this.backgroundKey) {
        const bg = canvas(Math.round(w * this.dpr), Math.round(h * this.dpr)), b = bg.getContext('2d'); b.scale(this.dpr, this.dpr);
        const g = b.createLinearGradient(0, 0, 0, h); p.sky.forEach((v, i) => g.addColorStop(i / 2, v)); b.fillStyle = g; b.fillRect(0, 0, w, h);
        const sx = w * .78, sy = h * .23, sr = Math.min(w, h) * .12;
        const glow = b.createRadialGradient(sx, sy, sr * .1, sx, sy, sr * 3.3); glow.addColorStop(0, 'rgba(255,231,175,.28)'); glow.addColorStop(1, 'rgba(255,231,175,0)');
        b.fillStyle = glow; b.fillRect(0, 0, w, h); circle(b, sx, sy, sr, p.sun);
        b.fillStyle = p.far;
        for (let i = 0; i < 8; i++) {
          const x = hash(i + 12) * w, y = h * (.46 + hash(i + 20) * .28), s = w * (.06 + hash(i + 6) * .08);
          b.globalAlpha = .18 + (i % 3) * .045;
          poly(b, [[x - s, y], [x - s * .65, y - s * .12], [x + s * .3, y - s * .1], [x + s, y], [x + s * .2, y + s * .7], [x - s * .2, y + s * .85]], p.far);
          if (this.game.terrain.mapId === 'foundry') {
            b.fillRect(x - s * .25, y - s * .6, s * .2, s * .55); b.fillRect(x + s * .1, y - s * .85, s * .12, s * .8);
            for (let k = 0; k < 4; k++) { b.beginPath(); b.ellipse(x + s * .13 + k * s * .12, y - s * (.85 + k * .16), s * (.12 + k * .035), s * .10, 0, 0, TAU); b.fill(); }
          } else {
            for (let k = -1; k < 2; k++) poly(b, [[x + k * s * .25, y - s * (.4 + .2 * hash(i + k))], [x + k * s * .25 - s * .13, y], [x + k * s * .25 + s * .13, y]], p.far);
          }
        }
        b.globalAlpha = 1;
        for (let i = 0; i < 11; i++) {
          const x = hash(i + 45) * w, y = h * (.12 + hash(i + 11) * .65), s = 22 + hash(i + 51) * 65;
          b.fillStyle = `rgba(244,243,214,${.035 + hash(i + 18) * .055})`;
          b.beginPath(); b.ellipse(x, y, s * 2.2, s * .35, 0, 0, TAU); b.ellipse(x - s * .6, y - s * .17, s, s * .4, 0, 0, TAU); b.ellipse(x + s * .5, y - s * .2, s * .8, s * .5, 0, 0, TAU); b.fill();
        }
        const vignette = b.createRadialGradient(w / 2, h * .48, h * .15, w / 2, h * .48, Math.max(w, h) * .7); vignette.addColorStop(0, 'rgba(7,23,37,0)'); vignette.addColorStop(1, 'rgba(7,23,37,.28)'); b.fillStyle = vignette; b.fillRect(0, 0, w, h);
        this.backgroundCanvas = bg; this.backgroundKey = key;
      }
      c.drawImage(this.backgroundCanvas, 0, 0, w, h);
      // Sparse airborne motes: visual wind only, not a simulation coefficient.
      if (!this.options.reduceMotion && this.options.quality !== 'low') {
        const wind = finite(this.game.state.wind), drift = this.time * (wind < 0 ? -7 : 7);
        for (let i = 0; i < 18; i++) {
          const x = ((hash(i + 15) * w + drift * (1 + hash(i))) % (w + 40) + w + 40) % (w + 40) - 20;
          const y = hash(i + 190) * h;
          circle(c, x, y + Math.sin(this.time * .3 + i) * 4, .6 + hash(i + 9), 'rgba(255,234,188,.22)');
        }
      }
    }
    updateCamera(dt) {
      const t = this.game.terrain, state = this.game.state, projectiles = state.projectiles || [];
      const flying = projectiles.filter(p => !p.dead && Number.isFinite(p.x) && Number.isFinite(p.y));
      const held = this.impactFocus && this.impactFocus.until > this.time ? this.impactFocus : null;
      let bounds = null;
      for (const p of flying) {
        if (!bounds) bounds = { left: p.x, right: p.x, top: p.y, bottom: p.y };
        else { bounds.left = Math.min(bounds.left, p.x); bounds.right = Math.max(bounds.right, p.x); bounds.top = Math.min(bounds.top, p.y); bounds.bottom = Math.max(bounds.bottom, p.y); }
      }
      // Include a fresh impact while later shells are still resolving, so the
      // first disappearing projectile does not fling the camera to another one.
      if (held) {
        if (!bounds) bounds = { left: held.x, right: held.x, top: held.y, bottom: held.y };
        else { bounds.left = Math.min(bounds.left, held.x); bounds.right = Math.max(bounds.right, held.x); bounds.top = Math.min(bounds.top, held.y); bounds.bottom = Math.max(bounds.bottom, held.y); }
      }
      const zoom = clamp(finite(Number(this.options.zoom), 1), .7, 3);
      const minY = bounds && zoom <= 1.05 ? Math.min(-18, bounds.top - 65) : -18;
      const fit = Math.min(this.width / (t.width + 60), this.height / (t.height - minY + 30));
      let scale = fit * zoom, x = t.width / 2, y = (t.height + minY) / 2;
      if (zoom > 1.05) {
        const active = this.game.active || (state.tanks || []).find(a => a.uid === state.activeId);
        if (bounds) {
          x = (bounds.left + bounds.right) / 2; y = (bounds.top + bounds.bottom) / 2;
          scale = Math.min(scale, this.width / (bounds.right - bounds.left + 150), this.height / (bounds.bottom - bounds.top + 170));
        } else if (active) { x = active.x; y = active.y - 70; }
        const hw = this.width / scale / 2, hh = this.height / scale / 2;
        const left = bounds ? Math.min(-20, bounds.left - hw - 50) : -20;
        const right = bounds ? Math.max(t.width + 20, bounds.right + hw + 50) : t.width + 20;
        const top = bounds ? Math.min(-150, bounds.top - hh - 50) : -150;
        const bottom = bounds ? Math.max(t.height + 30, bounds.bottom + hh + 50) : t.height + 30;
        x = right - left > hw * 2 ? clamp(x, left + hw, right - hw) : (left + right) / 2;
        y = bottom - top > hh * 2 ? clamp(y, top + hh, bottom - hh) : (top + bottom) / 2;
      }
      const smooth = this.camera.scale === 0 || this.options.reduceMotion ? 1 : 1 - Math.exp(-dt * 7);
      this.camera.x += (x - this.camera.x) * smooth; this.camera.y += (y - this.camera.y) * smooth; this.camera.scale += (scale - this.camera.scale) * smooth;
      const shake = this.options.reduceMotion ? 0 : this.shake;
      this.tx = this.width / 2 - this.camera.x * this.camera.scale + Math.sin(this.time * 69) * shake;
      this.ty = this.height / 2 - this.camera.y * this.camera.scale + Math.cos(this.time * 83) * shake * .65;
    }
    screenToWorld(clientX, clientY) {
      const r = this.canvas.getBoundingClientRect(), scale = this.camera.scale || 1;
      return { x: ((clientX - r.left) * this.width / (r.width || this.width) - finite(this.tx)) / scale, y: ((clientY - r.top) * this.height / (r.height || this.height) - finite(this.ty)) / scale };
    }
    worldToScreen(x, y) { return { x: x * this.camera.scale + this.tx, y: y * this.camera.scale + this.ty }; }
    feedbackBounds() {
      const b = this.options.feedbackBounds;
      return b && [b.x, b.y, b.width, b.height].every(Number.isFinite) && b.width > 0 && b.height > 0 ? b : null;
    }
    placeFeedback(x, y, w, h) {
      const left = clamp(x, 5, Math.max(5, this.width - w - 5)), top = clamp(y, 5, Math.max(5, this.height - h - 5));
      const b = this.feedbackBounds(), overlaps = (px, py) => b && px < b.x + b.width + 5 && px + w + 5 > b.x && py < b.y + b.height + 5 && py + h + 5 > b.y;
      if (!overlaps(left, top)) return { x: left, y: top };
      const candidates = [{ x: left, y: b.y - h - 6 }, { x: left, y: b.y + b.height + 6 }, { x: b.x - w - 6, y: top }, { x: b.x + b.width + 6, y: top }]
        .filter(p => p.x >= 5 && p.y >= 5 && p.x + w <= this.width - 5 && p.y + h <= this.height - 5 && !overlaps(p.x, p.y));
      candidates.sort((a, z) => Math.abs(a.x - left) + Math.abs(a.y - top) - Math.abs(z.x - left) - Math.abs(z.y - top));
      return candidates[0] || { x: left, y: top };
    }
    guide() {
      const g = this.game, s = g.state, a = g.active;
      if (!this.options.guide || !a || s.phase !== 'aim' || typeof g.getTrajectory !== 'function' || (g.isHumanTurn && !g.isHumanTurn())) return;
      // The engine already caches this query and knows all trajectory inputs,
      // including teleport preparation. A renderer-side key can become stale.
      const points = (g.getTrajectory() || []).filter(p => Number.isFinite(p.x) && Number.isFinite(p.y)); if (!points.length) return;
      const c = this.ctx, inv = 1 / this.camera.scale;
      c.save(); c.lineWidth = inv; c.strokeStyle = 'rgba(255,228,172,.18)'; c.beginPath();
      points.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.stroke();
      const stride = Math.max(1, Math.floor(points.length / 35));
      for (let i = 0; i < points.length; i += stride) circle(c, points[i].x, points[i].y, (i % (stride * 4) ? 1.25 : 2) * inv, `rgba(255,232,177,${.75 - i / points.length * .5})`);
      const end = points[points.length - 1]; circle(c, end.x, end.y, 7 * inv, 'rgba(255,220,153,.08)', 'rgba(255,232,177,.65)', inv);
      c.strokeStyle = 'rgba(255,232,177,.7)'; c.beginPath(); c.moveTo(end.x - 11 * inv, end.y); c.lineTo(end.x - 5 * inv, end.y); c.moveTo(end.x + 5 * inv, end.y); c.lineTo(end.x + 11 * inv, end.y); c.stroke(); c.restore();
    }
    rememberImpact(e) {
      if (!Number.isFinite(e.x) || !Number.isFinite(e.y)) return;
      if (e.triggered || e.impactKind === 'mine' || (e.impactKind !== 'tank' && e.impactKind !== 'terrain')) return;
      const shot = e.shotId != null ? this.shots.get(e.shotId) : null;
      const ownerId = e.ownerId ?? (shot && shot.ownerId), volleyId = e.volleyId ?? (shot && shot.volleyId);
      // Unidentified explosions may be a mine or a different action. Never
      // label them as the active player's previous shot by guessing ownership.
      if (e.shotId == null || volleyId == null || ownerId == null) return;
      if (this.latestVolleyByOwner.has(ownerId) && this.latestVolleyByOwner.get(ownerId) !== volleyId) return;
      this.latestVolleyByOwner.set(ownerId, volleyId);
      this.latestVolleyId = volleyId;
      const existing = this.impactMarkers.find(m => m.shotId === e.shotId && m.volleyId === volleyId);
      if (existing) return; // impact and explosion can describe the same hit.
      this.impactMarkers.push({ x: e.x, y: e.y, shotId: e.shotId, volleyId, ownerId, team: e.sourceTeam ?? e.team ?? (shot && shot.team), at: this.time });
      // Keep at most six locations from the latest volley of each owner.
      let count = 0;
      this.impactMarkers = this.impactMarkers.slice().reverse().filter(m => m.ownerId !== ownerId || ++count <= 6).reverse();
      if (this.impactMarkers.length > 48) this.impactMarkers.splice(0, this.impactMarkers.length - 48);
    }
    drawImpactMarkers() {
      const s = this.game.state, active = this.game.active;
      const humanAim = s.phase === 'aim' && active && (!this.game.isHumanTurn || this.game.isHumanTurn());
      const volley = humanAim ? this.latestVolleyByOwner.get(active.uid) : this.latestVolleyId;
      if (volley == null) return;
      const marks = this.impactMarkers.filter(m => m.volleyId === volley && (humanAim ? m.ownerId === active.uid : this.time - m.at < 3.5));
      const c = this.ctx, inv = 1 / this.camera.scale;
      for (let i = 0; i < marks.length; i++) {
        const m = marks[i], p = this.worldToScreen(m.x, m.y);
        if (p.x < 8 || p.x > this.width - 8 || p.y < 8 || p.y > this.height - 8) continue;
        c.save(); c.globalAlpha = humanAim ? .72 : .58; c.lineWidth = 1.2 * inv;
        c.setLineDash([2 * inv, 3 * inv]); circle(c, m.x, m.y, 7 * inv, null, '#ffe1a0', 1.2 * inv); c.setLineDash([]);
        poly(c, [[m.x, m.y - 2.4 * inv], [m.x + 2.4 * inv, m.y], [m.x, m.y + 2.4 * inv], [m.x - 2.4 * inv, m.y]], '#ffe1a0');
        if (humanAim && i === marks.length - 1) {
          const label = this.placeFeedback(p.x - 29, p.y < 32 ? p.y + 9 : p.y - 25, 58, 15);
          const labelX = m.x + (label.x - p.x) * inv, labelY = m.y + (label.y - p.y) * inv;
          if (Math.abs(label.x + 29 - p.x) > 8 || Math.abs(label.y - (p.y - 25)) > 8) {
            c.strokeStyle = 'rgba(255,225,160,.45)'; c.lineWidth = inv; c.beginPath(); c.moveTo(m.x, m.y);
            c.lineTo(m.x + (clamp(p.x, label.x, label.x + 58) - p.x) * inv, m.y + (clamp(p.y, label.y, label.y + 15) - p.y) * inv); c.stroke();
          }
          c.font = `600 ${10 * inv}px system-ui, sans-serif`; c.textAlign = 'center';
          rounded(c, labelX, labelY, 58 * inv, 15 * inv, 5 * inv); c.fillStyle = 'rgba(12,31,43,.88)'; c.fill();
          c.fillStyle = '#ffe8b8'; c.fillText('직전 착탄', labelX + 29 * inv, labelY + 11 * inv);
        }
        c.restore();
      }
    }
    drawHazards() {
      const c = this.ctx, s = this.game.state, pulse = this.options.reduceMotion ? 0 : this.time;
      for (const h of (s.hazards || [])) {
        if (!Number.isFinite(h.x) || !Number.isFinite(h.y)) continue;
        const r = finite(h.radius, 25), poison = h.kind === 'poison';
        c.save(); c.globalAlpha = .38;
        for (let i = 0; i < 5; i++) {
          const x = h.x + (i - 2) * r * .32, y = h.y - 4 - Math.sin(pulse * 2 + i) * 3;
          if (poison) circle(c, x, y - i % 2 * 6, r * .3, '#bada8e');
          else { c.beginPath(); c.moveTo(x - 5, y); c.quadraticCurveTo(x - 8, y - 13, x + Math.sin(pulse * 5 + i) * 4, y - 22); c.quadraticCurveTo(x + 8, y - 8, x + 5, y); c.closePath(); c.fillStyle = i % 2 ? '#ffcc7b' : '#fa8c5b'; c.fill(); }
        }
        c.restore();
      }
      for (const mine of (s.mines || [])) {
        if (!Number.isFinite(mine.x) || !Number.isFinite(mine.y)) continue;
        c.save(); c.translate(mine.x, mine.y); c.fillStyle = '#243d48'; rounded(c, -7, -3, 14, 6, 3); c.fill(); circle(c, 0, -3, 2, TEAM[mine.team === 1 ? 1 : 0]); c.restore();
      }
    }
    drawTank(t) {
      if (!Number.isFinite(t.x) || !Number.isFinite(t.y) || t.y > this.game.terrain.height + 60) return;
      const c = this.ctx, status = t.status || {}, alive = t.alive !== false && t.hp > 0;
      c.save(); c.translate(t.x, t.y); c.rotate(finite(t.tilt));
      c.fillStyle = 'rgba(8,27,36,.25)'; c.beginPath(); c.ellipse(0, 14, 23, 4, 0, 0, TAU); c.fill();
      if (alive && (status.shield > 0 || status.barrier > 0)) {
        const p = this.options.reduceMotion ? 1 : .8 + Math.sin(this.time * 3) * .15;
        circle(c, 0, -1, 27, 'rgba(125,231,228,.07)', `rgba(164,250,236,${p * .6})`, 1.4);
        c.strokeStyle = 'rgba(237,255,241,.55)'; c.lineWidth = 2; c.beginPath(); c.arc(0, -1, 26, -2.5, -1.6); c.stroke();
      }
      tankArt(c, t.def || { color: '#74b8bd', body: 'tracked', id: t.typeId }, t.angle, t.face, t.team, this.options.reduceMotion ? 0 : this.time, status, !alive);
      if (alive && status.poison > 0) { circle(c, -13, -18, 3, '#bbdc84'); circle(c, -9, -24, 2, 'rgba(189,220,130,.65)'); }
      if (alive && status.fire > 0) star(c, -10, -18, 7, '#ffb675', this.options.reduceMotion ? 0 : this.time * .2);
      if (alive && status.bind > 0) { c.strokeStyle = '#a7d6d7'; c.lineWidth = 1.8; c.beginPath(); c.moveTo(-17, 5); c.lineTo(17, -6); c.moveTo(-16, -6); c.lineTo(17, 5); c.stroke(); }
      c.restore();
    }
    drawProjectile(p) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
      const c = this.ctx, color = KIND[p.kind] || KIND.shell, trail = Array.isArray(p.trail) ? p.trail : [], scale = this.camera.scale;
      c.save(); c.lineJoin = 'round'; c.lineCap = 'round';
      if (trail.length > 1) {
        c.lineWidth = Math.max(2, 2 / scale); c.strokeStyle = color; c.globalAlpha = .24;
        c.beginPath(); trail.forEach((v, i) => { if (Number.isFinite(v.x) && Number.isFinite(v.y)) i ? c.lineTo(v.x, v.y) : c.moveTo(v.x, v.y); }); c.lineTo(p.x, p.y); c.stroke();
        c.globalAlpha = .8; const last = trail.slice(-6); c.lineWidth = Math.max(1, 1.1 / scale); c.beginPath(); last.forEach((v, i) => i ? c.lineTo(v.x, v.y) : c.moveTo(v.x, v.y)); c.lineTo(p.x, p.y); c.stroke();
      }
      c.globalAlpha = 1; c.translate(p.x, p.y); c.rotate(Math.atan2(finite(p.vy), finite(p.vx, 1)));
      const r = Math.max(finite(p.radius, 4), 3.2 / scale);
      c.shadowColor = color; c.shadowBlur = this.options.quality === 'low' ? 0 : 12;
      poly(c, [[r * 1.55, 0], [r * .25, -r * .8], [-r * 1.1, -r * .45], [-r * 1.3, r * .4], [r * .15, r * .8]], color);
      c.shadowBlur = 0; poly(c, [[r, 0], [0, -r * .4], [-r * .55, 0], [0, r * .26]], '#fff6d8'); c.restore();
    }
    overlayTanks() {
      const c = this.ctx, s = this.game.state, a = this.game.active, human = this.game.isHumanTurn ? this.game.isHumanTurn() : true;
      const mobile = this.width < 600, blocked = this.feedbackBounds(), placed = blocked ? [{ x: blocked.x, y: blocked.y, w: blocked.width, h: blocked.height }] : [];
      const tanks = (s.tanks || []).filter(t => t.alive !== false && t.hp > 0 && Number.isFinite(t.x) && Number.isFinite(t.y));
      // At fit zoom, adjacent tanks can be only a few CSS pixels apart. Reserve
      // screen-space lanes for the selected/recently hit tanks first.
      tanks.sort((ta, tb) => ((a && tb.uid === a.uid ? 4 : 0) + (this.hitFlashes.has(tb.uid) ? 2 : 0)) - ((a && ta.uid === a.uid ? 4 : 0) + (this.hitFlashes.has(ta.uid) ? 2 : 0)));
      for (const t of tanks) {
        const p = this.worldToScreen(t.x, t.y), color = TEAM[t.team === 1 ? 1 : 0], selected = a && a.uid === t.uid, hit = this.hitFlashes.get(t.uid);
        if (p.x < -60 || p.x > this.width + 60 || p.y < -80 || p.y > this.height + 80) continue;
        const showNumber = selected || !!hit || this.width > 950;
        const w = clamp(59 * this.camera.scale, mobile ? 36 : 40, 62), h = showNumber ? 22 : 8;
        let left = clamp(p.x - w / 2, 5, this.width - w - 5);
        const baseY = p.y + 19 * this.camera.scale + 6;
        let y = clamp(baseY, 5, this.height - h - 5), position = null;
        const fits = (x, yy) => !placed.some(r => x < r.x + r.w + 4 && x + w + 4 > r.x && yy < r.y + r.h + 3 && yy + h + 3 > r.y);
        const offsets = [0, 25, 50, 75, -25, -50, -75, 100, -100, 125, -125];
        if (blocked) offsets.push(blocked.y - h - 6 - baseY, blocked.y + blocked.height + 6 - baseY);
        for (const offset of offsets) {
          const nextY = clamp(baseY + offset, 5, this.height - h - 5);
          if (fits(left, nextY)) { position = { x: left, y: nextY }; break; }
        }
        if (!position) {
          // A short canvas or a result card can consume every vertical lane.
          // Search nearby columns only in this crowded fallback case.
          const xs = [left, left - w - 8, left + w + 8, blocked ? blocked.x - w - 8 : 5, blocked ? blocked.x + blocked.width + 8 : this.width - w - 5];
          let best = Infinity;
          for (const rawX of xs) for (let yy = 5; yy <= this.height - h - 5; yy += h + 5) {
            const x = clamp(rawX, 5, this.width - w - 5), cost = Math.abs(x - left) + Math.abs(yy - baseY);
            if (cost < best && fits(x, yy)) { best = cost; position = { x, y: yy }; }
          }
        }
        if (position) { left = position.x; y = position.y; }
        const center = left + w / 2;
        placed.push({ x: left, y, w, h });
        if (Math.abs(y - baseY) > 5 || Math.abs(center - p.x) > 5) {
          c.strokeStyle = 'rgba(215,237,224,.28)'; c.lineWidth = 1; c.beginPath(); c.moveTo(p.x, p.y + 15 * this.camera.scale); c.lineTo(center, y - 2); c.stroke();
        }
        rounded(c, left - 1, y - 1, w + 2, 6, 3); c.fillStyle = 'rgba(9,28,40,.9)'; c.fill();
        rounded(c, left, y, Math.max(0, w * clamp(t.hp / (t.maxHp || 1), 0, 1)), 4, 2); c.fillStyle = t.hp / t.maxHp < .25 ? '#ffb07a' : color; c.fill();
        if (showNumber) {
          c.font = '600 10px system-ui, sans-serif'; c.textAlign = 'center'; c.fillStyle = '#fff2d8'; c.strokeStyle = 'rgba(10,25,35,.9)'; c.lineWidth = 3;
          const text = Math.ceil(t.hp).toLocaleString(); c.strokeText(text, center, y + 17); c.fillText(text, center, y + 17);
        }
        if (hit && hit.life > 0 && !this.options.reduceMotion) {
          const rx = Math.max(11, 24 * this.camera.scale), ry = Math.max(9, 20 * this.camera.scale);
          c.save(); c.globalAlpha = clamp(hit.life / .24, 0, 1) * .85; c.strokeStyle = hit.color; c.lineWidth = 1.5; c.beginPath();
          for (const sx of [-1, 1]) for (const sy of [-1, 1]) { c.moveTo(p.x + sx * (rx - 4), p.y + sy * ry); c.lineTo(p.x + sx * rx, p.y + sy * ry); c.lineTo(p.x + sx * rx, p.y + sy * (ry - 4)); }
          c.stroke(); c.restore();
        }
        if (selected && s.phase !== 'gameover') {
          const top = p.y - 29 * this.camera.scale - 13, bob = this.options.reduceMotion ? 0 : Math.sin(this.time * 3) * 2;
          c.save(); c.translate(p.x, top + bob);
          poly(c, [[-5, -5], [5, -5], [0, 1]], human ? '#ffe1a0' : color);
          if (top > 32) {
            c.font = `700 ${mobile ? 10 : 11}px system-ui, sans-serif`; c.textAlign = 'center';
            const name = String(t.name || ''), nw = Math.min(mobile ? 102 : 120, c.measureText(name).width + 18);
            const nameRect = this.placeFeedback(p.x - nw / 2, top + bob - 27, nw, 18), nx = nameRect.x + nw / 2 - p.x, ny = nameRect.y - top - bob;
            rounded(c, nx - nw / 2, ny, nw, 18, 9); c.fillStyle = 'rgba(13,35,48,.88)'; c.fill(); c.fillStyle = '#fff1d5'; c.fillText(name, nx, ny + 13, nw - 12);
          }
          c.restore();
          if (human && s.phase === 'aim') { c.setLineDash([3, 5]); c.strokeStyle = 'rgba(255,226,160,.65)'; c.lineWidth = 1; c.beginPath(); c.ellipse(p.x, p.y + 15 * this.camera.scale, Math.max(14, 27 * this.camera.scale), Math.max(4, 6 * this.camera.scale), 0, 0, TAU); c.stroke(); c.setLineDash([]); }
        }
      }
    }
    handleEvent(e) {
      if (!e || !e.type) return;
      if (e.type === 'turn' || e.type === 'actionStart') this.impactFocus = null;
      if (e.type === 'shot' && e.shotId != null && e.volleyId != null) {
        const ownerId = e.ownerId ?? e.tankId;
        if (ownerId != null) {
          if (this.latestVolleyByOwner.get(ownerId) !== e.volleyId) {
            this.impactMarkers = this.impactMarkers.filter(m => m.ownerId !== ownerId);
            this.latestVolleyByOwner.set(ownerId, e.volleyId);
          }
          this.latestVolleyId = e.volleyId;
          this.shots.set(e.shotId, { ownerId, volleyId: e.volleyId, team: e.sourceTeam ?? e.team });
          if (this.shots.size > 128) this.shots.delete(this.shots.keys().next().value);
        }
      }
      let x = e.x, y = e.y;
      if ((!Number.isFinite(x) || !Number.isFinite(y)) && e.tankId != null && this.game) {
        const t = (this.game.state.tanks || []).find(tank => tank.uid === e.tankId); if (t) { x = t.x; y = t.y; }
      }
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      const finalImpact = e.type === 'impact' && (e.impactKind === 'tank' || e.impactKind === 'terrain');
      const impactExplosion = e.type === 'explosion' && e.impactKind !== 'void' && e.impactKind !== 'mine';
      if (!e.triggered && (finalImpact || impactExplosion)) {
        this.impactFocus = { x, y, until: this.time + .72 };
        this.rememberImpact(e);
      }
      const color = KIND[e.kind] || (e.type === 'heal' ? '#b3efd0' : '#ffd08e');
      if (e.type === 'damage' || e.type === 'heal') {
        const v = Math.abs(finite(Number(e.value))), targetId = e.tankId;
        if (v) {
          const group = e.volleyId != null ? 'volley:' + e.volleyId : e.shotId != null ? 'shot:' + e.shotId : 'effect:' + (e.kind || '') + ':' + (e.ownerId ?? e.sourceTeam ?? '');
          const groupKey = e.type + ':' + group;
          const label = targetId != null && this.labels.find(l => l.targetId === targetId && l.groupKey === groupKey && this.time - l.updatedAt < .5);
          const labelColor = e.type === 'heal' ? '#baf8d0' : e.sourceTeam != null && e.sourceTeam === e.targetTeam ? '#ffbf99' : '#fff1d3';
          if (label) {
            label.amount += v; label.hits++; label.x = x; label.y = y;
            label.life = label.max; label.updatedAt = this.time;
            label.text = (e.type === 'heal' ? '+' : '−') + Math.round(label.amount);
          } else this.labels.push({ x, y, targetId, groupKey, amount: v, hits: 1, updatedAt: this.time, text: (e.type === 'heal' ? '+' : '−') + Math.round(v), color: labelColor, life: 1.35, max: 1.35 });
          if (targetId != null) this.hitFlashes.set(targetId, { life: .24, attentionLife: 1.8, color: labelColor });
        }
      }
      const burst = e.type === 'explosion' || e.type === 'death', shot = e.type === 'shot', item = e.type === 'item' || e.type === 'heal';
      if (burst || item || shot) {
        const radius = Math.max(12, finite(e.radius, burst ? 35 : 20));
        this.rings.push({ x, y, r: burst ? radius : 22, life: burst ? .65 : .5, max: burst ? .65 : .5, color, burst });
        const count = burst ? 24 : shot ? 6 : 12;
        for (let i = 0; i < count; i++) {
          const a = this.random() * TAU, speed = burst ? 35 + this.random() * 150 : 12 + this.random() * 45;
          const life = .4 + this.random() * .7;
          this.particles.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - (burst ? 35 : 10), size: 1.5 + this.random() * (burst ? 4 : 2), color: burst && i % 4 === 0 ? '#3e4c53' : color, life, max: life, rotation: this.random() * TAU, kind: burst && i % 4 === 0 ? 'rock' : i % 3 ? 'spark' : 'star', gravity: burst ? 140 : -12 });
        }
        if (burst) this.shake = Math.min(4.5, this.shake + radius / 25);
      }
      if (this.particles.length > 450) this.particles.splice(0, this.particles.length - 450);
      if (this.rings.length > 35) this.rings.splice(0, this.rings.length - 35);
      if (this.labels.length > 30) this.labels.shift();
    }
    updateEffects(dt) {
      this.shake *= Math.exp(-dt * 11);
      if (this.impactFocus && this.impactFocus.until <= this.time) this.impactFocus = null;
      for (const [id, h] of this.hitFlashes) { h.life -= dt; h.attentionLife -= dt; if (h.attentionLife <= 0) this.hitFlashes.delete(id); }
      for (const p of this.particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.gravity * dt; p.rotation += dt * 1.8; }
      this.particles = this.particles.filter(p => p.life > 0);
      for (const r of this.rings) r.life -= dt; this.rings = this.rings.filter(r => r.life > 0);
      for (const l of this.labels) l.life -= dt; this.labels = this.labels.filter(l => l.life > 0);
    }
    drawEffects() {
      const c = this.ctx;
      for (const r of this.rings) {
        const progress = 1 - r.life / r.max; c.save(); c.globalAlpha = (1 - progress) * .6;
        circle(c, r.x, r.y, r.r * (this.options.reduceMotion ? .75 : .35 + progress * .9), null, r.color, Math.max(1, 3 * (1 - progress)));
        if (progress < .55) { c.globalAlpha = (1 - progress / .55) * .35; circle(c, r.x, r.y, r.r * (.2 + progress), r.color); }
        c.restore();
      }
      if (this.options.reduceMotion) return;
      const limit = this.options.quality === 'low' ? 110 : 400;
      for (let i = Math.max(0, this.particles.length - limit); i < this.particles.length; i++) {
        const p = this.particles[i]; c.save(); c.globalAlpha = clamp(p.life / p.max * 1.7, 0, 1);
        if (p.kind === 'star') star(c, p.x, p.y, p.size * 1.8, p.color, p.rotation);
        else if (p.kind === 'rock') { c.translate(p.x, p.y); c.rotate(p.rotation); poly(c, [[-p.size, -p.size], [p.size, -p.size * .3], [p.size * .7, p.size], [-p.size * .6, p.size]], p.color); }
        else circle(c, p.x, p.y, p.size, p.color); c.restore();
      }
    }
    render(dtSeconds, options = {}) {
      if (!this.game || !this.game.state || !this.game.terrain || !this.ctx) return;
      const dt = clamp(finite(dtSeconds, 1 / 60), 0, .1); this.options = Object.assign({ guide: true, quality: 'high', zoom: 1, reduceMotion: false }, options);
      this.resize(); this.time += dt; this.updateEffects(dt); this.updateCamera(dt); this.buildTerrain();
      const c = this.ctx; c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
      this.background(); c.save(); c.translate(this.tx, this.ty); c.scale(this.camera.scale, this.camera.scale);
      if (this.terrainCanvas) c.drawImage(this.terrainCanvas, -this.terrainDrawOffset, -this.terrainDrawOffset);
      this.drawHazards(); this.guide(); this.drawImpactMarkers();
      for (const tank of this.game.state.tanks || []) this.drawTank(tank);
      for (const projectile of this.game.state.projectiles || []) this.drawProjectile(projectile);
      this.drawEffects(); c.restore(); this.overlayTanks();
      for (const l of this.labels) {
        const p = this.worldToScreen(l.x, l.y), t = 1 - l.life / l.max;
        if (p.x < -60 || p.x > this.width + 60 || p.y < -60 || p.y > this.height + 60) continue;
        c.save(); c.globalAlpha = Math.min(1, l.life / .25); c.font = '800 17px system-ui, sans-serif'; c.textAlign = 'center'; c.lineWidth = 3; c.strokeStyle = 'rgba(18,33,43,.7)'; c.fillStyle = l.color;
        const y = p.y - 22 - (this.options.reduceMotion ? 0 : t * 24), w = c.measureText(l.text).width + 6;
        const label = this.placeFeedback(p.x - w / 2, y - 17, w, 22), lx = label.x + w / 2, ly = label.y + 17;
        if (Math.abs(lx - p.x) > 8 || Math.abs(ly - y) > 8) {
          c.save(); c.globalAlpha *= .35; c.strokeStyle = l.color; c.lineWidth = 1; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(lx, label.y + 22); c.stroke(); c.restore();
        }
        c.strokeText(l.text, lx, ly); c.fillText(l.text, lx, ly); c.restore();
      }
      // A quiet horizon edge makes the canvas feel part of the navy game shell.
      const fade = c.createLinearGradient(0, this.height - 40, 0, this.height); fade.addColorStop(0, 'rgba(12,28,42,0)'); fade.addColorStop(1, 'rgba(12,28,42,.24)'); c.fillStyle = fade; c.fillRect(0, Math.max(0, this.height - 40), this.width, 40);
    }
    destroy() {
      this.canvas.removeEventListener('pointermove', this._pointerMove); this.canvas.removeEventListener('pointerleave', this._pointerOut);
      this.particles.length = 0; this.rings.length = 0; this.labels.length = 0; this.terrainCanvas = this.backgroundCanvas = null; this.game = null;
      this.impactFocus = null; this.impactMarkers.length = 0; this.shots.clear(); this.latestVolleyByOwner.clear(); this.hitFlashes.clear();
    }
    static drawPortrait(element, def, team = 0) {
      if (!element || !def) return;
      const rect = element.getBoundingClientRect(), w = Math.max(1, rect.width || 96), h = Math.max(1, rect.height || 72), dpr = Math.min(2, window.devicePixelRatio || 1);
      element.width = Math.round(w * dpr); element.height = Math.round(h * dpr); const c = element.getContext('2d'); if (!c) return;
      c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
      const r = Math.min(w, h) * .4, g = c.createRadialGradient(w * .5, h * .45, 0, w * .5, h * .45, r * 1.3);
      g.addColorStop(0, 'rgba(137,226,219,.17)'); g.addColorStop(1, 'rgba(137,226,219,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(197,223,215,.13)'; c.lineWidth = 1; c.beginPath(); c.arc(w * .5, h * .48, r, .2, 5.5); c.stroke();
      c.save(); c.translate(w * .5, h * .58); const scale = Math.min(w / 57, h / 49); c.scale(scale, scale);
      c.fillStyle = 'rgba(5,20,29,.26)'; c.beginPath(); c.ellipse(0, 15, 22, 3, 0, 0, TAU); c.fill(); tankArt(c, def, 30, 1, team, 0, {}, false); c.restore();
    }
  }
  window.FortRenderer = FortRenderer;
})();
