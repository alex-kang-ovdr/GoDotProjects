/* STARFORGE — a dependency-free, state-read-only Canvas renderer. */
(() => {
  'use strict';

  const CELL = 28;
  const TAU = Math.PI * 2;
  const SERVICE_COLORS = Object.freeze({ repair: '#a8e58a', extinguish: '#87c6ff' });
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const n = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;
  const alive = part => part && (part.hp == null || part.hp > 0);
  const key = (x, y) => `${x},${y}`;
  const hash = value => {
    const str = String(value);
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
    h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967295;
  };
  const tint = (color, alpha) => {
    if (typeof color !== 'string') return `rgba(94,224,225,${alpha})`;
    const m = color.match(/^#([a-f\d]{3}|[a-f\d]{6})$/i);
    if (!m) return color;
    const hex = m[1].length === 3 ? m[1].split('').map(x => x + x).join('') : m[1];
    const value = parseInt(hex, 16);
    return `rgba(${value >> 16},${(value >> 8) & 255},${value & 255},${alpha})`;
  };
  function rounded(c, x, y, w, h, r = 3) {
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
  }
  function circle(c, x, y, r) { c.beginPath(); c.arc(x, y, Math.max(0.001, r), 0, TAU); }
  function line(c, x1, y1, x2, y2) { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); }
  function polygon(c, points) {
    c.beginPath(); points.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath();
  }

  class StarRenderer {
    constructor(canvas, game) {
      this.canvas = canvas;
      this.game = game;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.view = { x: n(game?.player?.x), y: n(game?.player?.y), zoom: 1 };
      this.hoverCell = null;
      this.ghostCells = null;
      this.mirrorMode = false;
      this.selectedPartId = null;
      this.targetPartId = null;
      this.serviceTargetId = null;
      this.overlay = 'normal';
      this.showGrid = true;
      this.safeInsets = { top: 92, right: 22, bottom: 88, left: 22 };
      this.mode = 'build';
      this._cameraAngle = 0;
      this._labelHullMaximum = new Map();
      this.time = 0;
      this.width = 1;
      this.height = 1;
      this.dpr = 1;
      this._autoFit = 'dock';
      this._followPlayer = false;
      this._battleFitPending = false;
      this._playerMap = new Map();
      this._annotations = [];
      this._damageLabels = [];
      this._seenDamageEffects = new WeakSet();
      this._hitFlashes = new Map();
      this._serviceByTarget = new Map();
      this._fireParticleBudget = 64;
      this._stars = Array.from({ length: 230 }, (_, i) => ({
        x: hash(`sx${i}`), y: hash(`sy${i}`), size: 0.45 + hash(`sr${i}`) * 1.25,
        depth: 0.2 + hash(`sd${i}`) * 0.8, phase: hash(`sp${i}`) * TAU,
        blue: hash(`sb${i}`) > .67
      }));
      this.resize();
    }

    get parts() { return window.StarSim?.PARTS || {}; }
    get ships() {
      const list = this.game?.ships;
      if (Array.isArray(list)) return list.filter(Boolean);
      return [this.game?.player, this.game?.enemy].filter(Boolean);
    }

    // Insets reserve room for the application's HUD without changing world units.
    _viewportArea() {
      const i = this.safeInsets || {};
      const left = clamp(n(i.left), 0, this.width * .35);
      const right = clamp(n(i.right), 0, this.width * .35);
      const top = clamp(n(i.top), 0, this.height * .35);
      const bottom = clamp(n(i.bottom), 0, this.height * .35);
      const w = Math.max(1, this.width - left - right), h = Math.max(1, this.height - top - bottom);
      return { x: left, y: top, w, h, cx: left + w / 2, cy: top + h / 2 };
    }

    get cameraInfo() {
      return { x: this.view.x, y: this.view.y, zoom: this.view.zoom, angle: this._cameraAngle,
        autoFit: this._autoFit, following: this._followPlayer, viewport: this._viewportArea() };
    }

    _ghosts() {
      const source = Array.isArray(this.ghostCells) ? this.ghostCells : [this.hoverCell];
      const seen = new Set();
      return source.filter(cell => {
        if (!cell || !Number.isFinite(cell.x) || !Number.isFinite(cell.y)) return false;
        const id = key(cell.x, cell.y);
        if (seen.has(id)) return false;
        seen.add(id); return true;
      });
    }

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      const width = Math.max(1, rect.width || this.canvas.clientWidth || 800);
      const height = Math.max(1, rect.height || this.canvas.clientHeight || 600);
      this.dpr = clamp(n(window.devicePixelRatio, 1), 1, 2);
      this.width = width;
      this.height = height;
      const pw = Math.round(width * this.dpr), ph = Math.round(height * this.dpr);
      if (this.canvas.width !== pw || this.canvas.height !== ph) {
        this.canvas.width = pw; this.canvas.height = ph;
      }
      if (this._autoFit === 'dock') this._fitDock();
      if (this._autoFit === 'battle') this._fitCombat(false);
      return this;
    }

    screenToWorld(clientX, clientY) {
      const r = this.canvas.getBoundingClientRect();
      const area = this._viewportArea();
      const sx = (clientX - r.left - area.cx) / this.view.zoom;
      const sy = (clientY - r.top - area.cy) / this.view.zoom;
      const a = -this._cameraAngle;
      return {
        x: sx * Math.cos(a) - sy * Math.sin(a) + this.view.x,
        y: sx * Math.sin(a) + sy * Math.cos(a) + this.view.y
      };
    }

    // x/y are canvas-local CSS pixels; clientX/clientY are provided for DOM popovers.
    worldToScreen(x, y) {
      const dx = x - this.view.x, dy = y - this.view.y, a = this._cameraAngle;
      const area = this._viewportArea();
      const sx = (dx * Math.cos(a) - dy * Math.sin(a)) * this.view.zoom + area.cx;
      const sy = (dx * Math.sin(a) + dy * Math.cos(a)) * this.view.zoom + area.cy;
      const r = this.canvas.getBoundingClientRect();
      return { x: sx, y: sy, clientX: sx + r.left, clientY: sy + r.top };
    }

    screenToGrid(clientX, clientY) {
      const ship = this.game?.player;
      const point = this.screenToWorld(clientX, clientY);
      if (!ship) return { x: Math.round(point.x / CELL), y: Math.round(point.y / CELL) };
      const dx = point.x - n(ship.x), dy = point.y - n(ship.y), a = -n(ship.angle);
      return {
        x: Math.round((dx * Math.cos(a) - dy * Math.sin(a)) / CELL),
        y: Math.round((dx * Math.sin(a) + dy * Math.cos(a)) / CELL)
      };
    }

    pickPart(clientX, clientY) {
      const point = this.screenToWorld(clientX, clientY);
      for (const ship of this.ships.slice().reverse()) {
        const a = -n(ship.angle), dx = point.x - n(ship.x), dy = point.y - n(ship.y);
        const gx = (dx * Math.cos(a) - dy * Math.sin(a)) / CELL;
        const gy = (dx * Math.sin(a) + dy * Math.cos(a)) / CELL;
        for (const part of (ship.parts || []).slice().reverse()) {
          if (alive(part) && Math.abs(gx - part.x) <= .5 && Math.abs(gy - part.y) <= .5) return { ship, part };
        }
      }
      return null;
    }

    setMode(mode) {
      const next = mode === 'build' ? 'build' : 'combat';
      if (next === this.mode) return;
      this.mode = next;
      this._cameraAngle = next === 'combat' ? Math.PI / 2 : 0;
      this._labelHullMaximum.clear();
      this.hoverCell = null;
      this.ghostCells = null;
      this._damageLabels = [];
      this._hitFlashes.clear();
      this._followPlayer = false;
      if (next === 'build') { this._autoFit = 'dock'; this._fitDock(); }
      else { this._autoFit = 'battle'; this._battleFitPending = !this.game?.enemy; this._fitCombat(false); }
    }

    focusPlayer() {
      const ship = this.game?.player;
      if (!ship) return;
      if (this.mode === 'build') { this._autoFit = 'dock'; this._fitDock(); }
      else {
        this._autoFit = null; this._followPlayer = true;
        const b = this._shipBounds(ship, true), center = this._boundsCenter(b);
        const area = this._viewportArea();
        this.view.x = center.x; this.view.y = center.y;
        const rotated = Math.abs(Math.sin(this._cameraAngle)) > .5;
        this.view.zoom = clamp(Math.min(area.w / Math.max(360, (rotated ? b.h : b.w) + 100), area.h / Math.max(340, (rotated ? b.w : b.h) + 100)), .25, 1.55);
      }
    }

    fitBattle() {
      this._followPlayer = false; this._autoFit = 'battle';
      this._battleFitPending = !this.game?.enemy;
      this._fitCombat(false);
    }

    zoomBy(factor) {
      if (!Number.isFinite(factor) || factor <= 0) return;
      this._autoFit = null; this._followPlayer = false;
      this.view.zoom = clamp(this.view.zoom * factor, .18, 4.2);
    }

    // dx/dy are drag deltas in CSS pixels, so the world follows the pointer.
    pan(dx, dy) {
      this._autoFit = null; this._followPlayer = false;
      const a = -this._cameraAngle, sx = n(dx) / this.view.zoom, sy = n(dy) / this.view.zoom;
      this.view.x -= sx * Math.cos(a) - sy * Math.sin(a);
      this.view.y -= sx * Math.sin(a) + sy * Math.cos(a);
    }

    _point(ship, x, y) {
      const a = n(ship.angle), cs = Math.cos(a), sn = Math.sin(a);
      return { x: n(ship.x) + x * cs - y * sn, y: n(ship.y) + x * sn + y * cs };
    }
    _localBounds(ship) {
      const parts = (ship?.parts || []).filter(alive);
      if (!parts.length) return { minX: -56, minY: -56, maxX: 56, maxY: 56, w: 112, h: 112 };
      const minX = Math.min(...parts.map(p => p.x)) * CELL - CELL / 2;
      const maxX = Math.max(...parts.map(p => p.x)) * CELL + CELL / 2;
      const minY = Math.min(...parts.map(p => p.y)) * CELL - CELL / 2;
      const maxY = Math.max(...parts.map(p => p.y)) * CELL + CELL / 2;
      return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
    }
    _shipBounds(ship, includeShield = false) {
      const b = this._localBounds(ship);
      const ps = [[b.minX, b.minY], [b.maxX, b.minY], [b.maxX, b.maxY], [b.minX, b.maxY]].map(p => this._point(ship, p[0], p[1]));
      let minX = Math.min(...ps.map(p => p.x)), maxX = Math.max(...ps.map(p => p.x));
      let minY = Math.min(...ps.map(p => p.y)), maxY = Math.max(...ps.map(p => p.y));
      if (includeShield && !ship.dead && ship.shield > 0) {
        const radius = Math.max(1, n(ship.shieldRadius, n(ship.radius, 100) + 16));
        minX = Math.min(minX, n(ship.x) - radius); maxX = Math.max(maxX, n(ship.x) + radius);
        minY = Math.min(minY, n(ship.y) - radius); maxY = Math.max(maxY, n(ship.y) + radius);
      }
      return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
    }
    _boundsCenter(b) { return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }; }
    _fitDock() {
      if (!this.game?.player) return;
      const area = this._viewportArea();
      const b = this._shipBounds(this.game.player), center = this._boundsCenter(b);
      const spanX = Math.max(CELL * 13, b.w + CELL * 3.5);
      const spanY = Math.max(CELL * 15, b.h + CELL * 4.5);
      this.view.x = center.x; this.view.y = center.y - 6;
      this.view.zoom = clamp(Math.min(area.w / spanX, area.h / spanY), .2, 2.15);
    }
    _fitCombat(smooth, dt = 1 / 60) {
      const ships = this.ships.filter(s => !s.dead || s === this.game?.player);
      if (!ships.length) return;
      const area = this._viewportArea();
      const bounds = ships.map(s => this._shipBounds(s, true));
      const minX = Math.min(...bounds.map(b => b.minX)), maxX = Math.max(...bounds.map(b => b.maxX));
      const minY = Math.min(...bounds.map(b => b.minY)), maxY = Math.max(...bounds.map(b => b.maxY));
      const rotated = Math.abs(Math.sin(this._cameraAngle)) > .5;
      const spanX = Math.max(580, (rotated ? maxY - minY : maxX - minX) + 100);
      const spanY = Math.max(440, (rotated ? maxX - minX : maxY - minY) + 100);
      const zoom = clamp(Math.min(area.w / spanX, area.h / spanY), .18, 1.25);
      const k = smooth ? 1 - Math.exp(-Math.min(dt, .1) * 1.25) : 1;
      this.view.x += ((minX + maxX) / 2 - this.view.x) * k;
      this.view.y += ((minY + maxY) / 2 - this.view.y) * k;
      this.view.zoom += (zoom - this.view.zoom) * k;
    }

    draw(dt = 1 / 60) {
      if (!this.ctx) return;
      dt = Number.isFinite(dt) ? (dt > 2 ? dt / 1000 : dt) : 1 / 60;
      this.time += clamp(dt, 0, .1);
      this.targetPartId = this.game?.targetPartId || null;
      this.serviceTargetId = this.game?.serviceTargetId || null;
      this._annotations = [];
      this._fireParticleBudget = 64;
      this._indexServiceJobs();
      this._collectDamageEffects();
      const rect = this.canvas.getBoundingClientRect();
      if (Math.abs(rect.width - this.width) > 1 || Math.abs(rect.height - this.height) > 1) this.resize();
      if (this.mode === 'combat' && this._autoFit === 'battle') {
        this._fitCombat(!this._battleFitPending, dt);
        if (this.game?.enemy) this._battleFitPending = false;
      } else if (this.mode === 'combat' && this._followPlayer && this.game?.player) {
        const center = this._boundsCenter(this._shipBounds(this.game.player, true));
        const k = 1 - Math.exp(-Math.max(dt, 1 / 120) * 7);
        this.view.x += (center.x - this.view.x) * k;
        this.view.y += (center.y - this.view.y) * k;
      }
      this.view.zoom = clamp(n(this.view.zoom, 1), .18, 4.2);
      const c = this.ctx;
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.shadowBlur = 0;
      this._background();
      c.save();
      const area = this._viewportArea();
      c.translate(area.cx, area.cy);
      c.scale(this.view.zoom, this.view.zoom);
      c.rotate(this._cameraAngle);
      c.translate(-this.view.x, -this.view.y);
      if (this.showGrid && this.mode === 'build') this._grid();
      if (this.mode === 'build' && this.game?.player) this._dockFrame(this.game.player);
      if (this.mode === 'build' && this.mirrorMode) this._drawMirrorAxis();
      this._drawTactical();
      this._drawDebris();
      this._drawMoveOrders();
      for (const ship of this.ships) this._drawShield(ship);
      this._drawFragments();
      for (const ship of this.ships) this._drawShip(ship);
      this._drawProjectiles();
      this._drawEffects();
      if (this.mode === 'build') this._drawPlacement();
      c.restore();
      if (this.mode === 'combat') {
        for (const ship of this.ships) this._shipLabel(ship);
        this._drawTargetLabel();
        this._minimap();
      }
      this._drawAnnotations();
      this._drawDamageLabels();
      // The surrounding application owns HUD labels and camera controls.
    }

    _background() {
      const c = this.ctx, w = this.width, h = this.height;
      c.fillStyle = '#080e18'; c.fillRect(0, 0, w, h);
      const g = c.createRadialGradient(w * .32, h * .4, 0, w * .32, h * .4, Math.max(w, h) * .7);
      g.addColorStop(0, '#132333'); g.addColorStop(.43, '#0d1928'); g.addColorStop(1, '#080e18');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      const a = c.createRadialGradient(w * .88, h * .12, 0, w * .88, h * .12, w * .48);
      a.addColorStop(0, 'rgba(54,70,105,.12)'); a.addColorStop(.6, 'rgba(26,57,81,.035)'); a.addColorStop(1, 'rgba(8,14,24,0)');
      c.fillStyle = a; c.fillRect(0, 0, w, h);
      for (const star of this._stars) {
        let x = (star.x * w - this.view.x * .025 * star.depth) % w;
        let y = (star.y * h - this.view.y * .025 * star.depth) % h;
        if (x < 0) x += w; if (y < 0) y += h;
        const opacity = .22 + star.depth * .42 + Math.sin(this.time * .6 + star.phase) * .045;
        c.fillStyle = star.blue ? `rgba(136,178,213,${opacity})` : `rgba(214,230,235,${opacity})`;
        c.fillRect(Math.round(x), Math.round(y), star.size, star.size);
        if (star.size > 1.5 && star.depth > .7) {
          c.fillStyle = `rgba(145,198,219,${opacity * .12})`;
          c.fillRect(x - 3, y, 7, .5); c.fillRect(x, y - 3, .5, 7);
        }
      }
      const v = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .25, w / 2, h / 2, Math.max(w, h) * .74);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,3,9,.48)');
      c.fillStyle = v; c.fillRect(0, 0, w, h);
    }

    _grid() {
      const c = this.ctx, z = this.view.zoom;
      const ship = this.game?.player, ox = n(ship?.x), oy = n(ship?.y), a = -n(ship?.angle);
      const area = this._viewportArea();
      const worldLeft = this.view.x - area.cx / z, worldTop = this.view.y - area.cy / z;
      const corners = [[worldLeft,worldTop],[worldLeft+this.width/z,worldTop],[worldLeft+this.width/z,worldTop+this.height/z],[worldLeft,worldTop+this.height/z]].map(([x,y])=>({x:(x-ox)*Math.cos(a)-(y-oy)*Math.sin(a),y:(x-ox)*Math.sin(a)+(y-oy)*Math.cos(a)}));
      const left = Math.min(...corners.map(p=>p.x)), right = Math.max(...corners.map(p=>p.x));
      const top = Math.min(...corners.map(p=>p.y)), bottom = Math.max(...corners.map(p=>p.y));
      c.save(); c.translate(ox,oy); c.rotate(-a);
      const x0 = Math.floor(left / CELL), x1 = Math.ceil(right / CELL);
      const y0 = Math.floor(top / CELL), y1 = Math.ceil(bottom / CELL);
      c.lineWidth = .65 / z;
      c.beginPath();
      for (let x = x0; x <= x1; x++) { c.moveTo(x * CELL + CELL / 2, top); c.lineTo(x * CELL + CELL / 2, bottom); }
      for (let y = y0; y <= y1; y++) { c.moveTo(left, y * CELL + CELL / 2); c.lineTo(right, y * CELL + CELL / 2); }
      c.strokeStyle = 'rgba(114,160,179,.065)'; c.stroke();
      c.beginPath();
      for (let x = x0; x <= x1; x++) if ((x + 1) % 5 === 0) { c.moveTo(x * CELL + CELL / 2, top); c.lineTo(x * CELL + CELL / 2, bottom); }
      for (let y = y0; y <= y1; y++) if ((y + 1) % 5 === 0) { c.moveTo(left, y * CELL + CELL / 2); c.lineTo(right, y * CELL + CELL / 2); }
      c.strokeStyle = 'rgba(106,163,184,.12)'; c.stroke();
      c.restore();
    }

    _dockFrame(ship) {
      const c = this.ctx, b = this._localBounds(ship);
      const pad = CELL * 1.1, x = b.minX - pad, y = b.minY - pad, w = b.w + pad * 2, h = b.h + pad * 2;
      c.save(); c.translate(n(ship.x), n(ship.y)); c.rotate(n(ship.angle));
      c.lineWidth = 1 / this.view.zoom; c.strokeStyle = 'rgba(91,153,175,.22)'; c.setLineDash([3 / this.view.zoom, 7 / this.view.zoom]);
      c.strokeRect(x, y, w, h); c.setLineDash([]);
      c.strokeStyle = 'rgba(102,183,197,.48)'; c.lineWidth = 1.2 / this.view.zoom;
      const k = 11;
      for (const [cx, cy, sx, sy] of [[x,y,1,1],[x+w,y,-1,1],[x,y+h,1,-1],[x+w,y+h,-1,-1]]) {
        c.beginPath(); c.moveTo(cx + k * sx, cy); c.lineTo(cx, cy); c.lineTo(cx, cy + k * sy); c.stroke();
      }
      c.font = `${7.5 / this.view.zoom}px ui-monospace, SFMono-Regular, Consolas, monospace`; c.textAlign = 'center';
      c.fillStyle = 'rgba(132,171,186,.5)';
      for (let gx = Math.ceil(b.minX / CELL); gx <= Math.floor(b.maxX / CELL); gx++) {
        line(c, gx * CELL, y + h + 3, gx * CELL, y + h + 6);
        if (gx % 2 === 0) c.fillText(String(gx).padStart(2, '0'), gx * CELL, y + h + 14 / this.view.zoom);
      }
      const mid = (b.minX + b.maxX) / 2, arrowY = y - 12;
      c.strokeStyle = '#65cbcf'; c.fillStyle = '#79d6d5'; c.lineWidth = 1.2 / this.view.zoom;
      line(c, mid, arrowY, mid, arrowY - 16);
      polygon(c, [[mid, arrowY - 21], [mid - 3, arrowY - 15], [mid + 3, arrowY - 15]]); c.fill();
      c.font = `${9 / this.view.zoom}px "Noto Sans KR", ui-monospace, sans-serif`;
      c.fillText('함수  /  FORWARD', mid, arrowY - 28);
      c.restore();
    }

    _drawMirrorAxis() {
      const ship = this.game?.player;
      if (!ship) return;
      const c = this.ctx, b = this._localBounds(ship);
      c.save(); c.translate(n(ship.x), n(ship.y)); c.rotate(n(ship.angle));
      c.strokeStyle = 'rgba(130,205,212,.35)'; c.lineWidth = 1 / this.view.zoom;
      c.setLineDash([7 / this.view.zoom, 6 / this.view.zoom]);
      line(c, 0, b.minY - CELL * 2, 0, b.maxY + CELL * 1.8); c.setLineDash([]);
      c.restore();
      const point = this._point(ship, 0, b.maxY + CELL * 1.9);
      this._annotations.push({ ...point, text: '좌우 대칭', color: '#80c6cd', dy: 10, compact: true });
    }

    _commandTarget() {
      const id = this.game?.targetPartId;
      if (!id) return null;
      for (const ship of this.ships) {
        const part = (ship.parts || []).find(p => p.id === id && alive(p));
        if (part) return { ship, part, ...this._point(ship, part.x * CELL, part.y * CELL) };
      }
      return null;
    }

    _drawTactical() {
      const all = this.overlay === 'tactical';
      this._blockedPartId = null;
      for (const ship of this.ships) {
        if (ship.dead) continue;
        for (const part of ship.parts || []) {
          if (!alive(part)) continue;
          const selected = part.id === this.selectedPartId && this.overlay !== 'damage';
          if (!selected && !all) continue;
          if (this.parts[part.type]?.range) {
            this._weaponEnvelope(ship, part, selected, false);
            if (selected && part.blockedById) this._blockedPartId = part.blockedById;
          } else if (part.type === 'thruster') this._thrustDirection(ship, part, selected, false);
        }
      }
      if (this.mode === 'build' && this.game?.player) {
        this._ghosts().forEach((cell, i) => {
          if (this.parts[cell.type]?.range) this._weaponEnvelope(this.game.player, cell, i === 0, true);
          else if (cell.type === 'thruster') this._thrustDirection(this.game.player, cell, i === 0, true);
        });
      }
    }

    _weaponEnvelope(ship, part, selected, ghost) {
      const def = this.parts[part.type] || {}, range = n(def.range);
      if (range <= 0) return;
      const c = this.ctx, origin = this._point(ship, part.x * CELL, part.y * CELL);
      const heading = n(ship.angle) + n(part.rot) * Math.PI / 2;
      const arc = clamp(n(def.firingArc, Math.PI / 2), .05, TAU);
      const invalid = ghost && part.valid === false;
      const blocked = !ghost && part.fireState === 'blocked';
      const color = invalid ? '#ed8b7c' : blocked ? '#e7b16c' : ship.faction === 'enemy' ? '#eb9a86' : '#73dcd3';
      c.save(); c.translate(origin.x, origin.y); c.rotate(heading);
      const from = -Math.PI / 2 - arc / 2, to = -Math.PI / 2 + arc / 2;
      c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, range, from, to); c.closePath();
      if (selected || ghost) { c.fillStyle = tint(color, ghost ? .018 : .025); c.fill(); }
      c.strokeStyle = tint(color, selected ? .26 : ghost ? .13 : .075);
      c.lineWidth = (selected ? 1 : .65) / this.view.zoom;
      c.setLineDash(selected ? [6 / this.view.zoom, 7 / this.view.zoom] : [2 / this.view.zoom, 10 / this.view.zoom]); c.stroke();
      if (selected) {
        c.strokeStyle = tint(color, .23); c.lineWidth = .7 / this.view.zoom;
        line(c, 0, -18, 0, -range); c.setLineDash([]);
        c.strokeStyle = tint(color, .65); c.lineWidth = 1.2 / this.view.zoom;
        line(c, 0, -18, 0, -42);
        line(c, 0, -42, -3.5, -36); line(c, 0, -42, 3.5, -36);
      }
      c.restore();
      if (selected) {
        const states = { ready: '발사 가능', blocked: '선체에 차폐됨', arc: '사격각 밖', range: '사거리 밖',
          power: '전지 대기', ammo: '탄약 대기', heat: '냉각 중', cooldown: '다음 사격 준비', offline: '장치 정지' };
        const status = !ghost && states[part.fireState];
        const text = this.width < 600 ? `${(range / CELL).toFixed(1)}칸 · ${Math.round(arc * 180 / Math.PI)}°` : `사거리 ${(range / CELL).toFixed(1)}칸 · 사각 ${Math.round(arc * 180 / Math.PI)}°`;
        if (!(this.mode === 'build' && !ghost && this._ghosts().length) && (ghost || !this._needsServiceNote(part, ship))) this._annotations.push({ ...origin, text: status ? `${text}  /  ${status}` : text, color, dy: ghost ? 30 : 35, compact: true });
        if (!ghost && this.mode === 'combat') {
          const target = ship.faction === 'player' ? this._commandTarget() : null;
          const opponent = this.ships.find(s => s.id !== ship.id && !s.dead);
          const aim = Number.isFinite(part.aimAngle) ? part.aimAngle : target ? Math.atan2(target.x - origin.x, -(target.y - origin.y)) : null;
          if (aim !== null && (target || opponent)) {
            const endpoint = target || opponent;
            let length = Math.min(range, Math.hypot(endpoint.x - origin.x, endpoint.y - origin.y));
            const blocker = blocked && (ship.parts || []).find(p => p.id === part.blockedById && alive(p));
            if (blocker) { const bp = this._point(ship, blocker.x * CELL, blocker.y * CELL); length = Math.hypot(bp.x - origin.x, bp.y - origin.y); }
            c.save(); c.strokeStyle = tint(blocked ? '#eea56e' : color, .5); c.lineWidth = 1 / this.view.zoom;
            c.setLineDash([3 / this.view.zoom, 5 / this.view.zoom]);
            line(c, origin.x, origin.y, origin.x + Math.sin(aim) * length, origin.y - Math.cos(aim) * length); c.restore();
          }
        }
      }
    }

    _thrustDirection(ship, part, selected, ghost) {
      const c = this.ctx, point = this._point(ship, part.x * CELL, part.y * CELL);
      const throttle = clamp(n(part.throttle), 0, 1);
      const color = ghost && part.valid === false ? '#ed8b7c' : ship.faction === 'enemy' ? '#dca68f' : '#91c9e8';
      const length = selected ? Math.max(43, 30 / this.view.zoom) : 24;
      c.save(); c.translate(point.x, point.y); c.rotate(n(ship.angle) + n(part.rot) * Math.PI / 2);
      c.strokeStyle = tint(color, selected || ghost ? .8 : .26 + throttle * .28);
      c.lineWidth = (selected ? 1.5 : 1) / this.view.zoom;
      line(c, 0, -15, 0, -length); line(c, 0, -length, -4, -length + 7); line(c, 0, -length, 4, -length + 7);
      if (selected) {
        c.strokeStyle = tint(color, .35); c.lineWidth = .7 / this.view.zoom;
        line(c, -6, 19, 6, 19); line(c, -4, 23, 4, 23);
      }
      c.restore();
      if (selected && (ghost || !this._needsServiceNote(part, ship))) this._annotations.push({ ...point, text: this.mode === 'combat' && !ghost ? `추진 출력 ${Math.round(throttle * 100)}%` : '화살표 방향으로 추진', color, dy: 32, compact: true });
    }

    _drawShield(ship) {
      if (!ship || ship.dead || !(ship.shield > 0) || this.mode !== 'combat') return;
      const c = this.ctx, center = { x: n(ship.x), y: n(ship.y) };
      const radius = Math.max(1, n(ship.shieldRadius, n(ship.radius, 100) + 16));
      const active = typeof ship.shieldActive === 'boolean' ? ship.shieldActive : (ship.parts || []).some(p => alive(p) && p.active && p.type === 'shield' && p.power > .2);
      const ratio = clamp(ship.shield / Math.max(1, ship.maxShield || ship.shield), 0, 1);
      const color = ship.faction === 'enemy' ? '#ed7771' : '#70dce5';
      c.save(); c.translate(center.x, center.y);
      if (!active) {
        c.strokeStyle = tint(color, .12); c.lineWidth = .8 / this.view.zoom;
        c.setLineDash([2 / this.view.zoom, 10 / this.view.zoom]); circle(c, 0, 0, radius); c.stroke();
        c.restore(); return;
      }
      const g = c.createRadialGradient(0, 0, radius * .69, 0, 0, radius);
      g.addColorStop(0, tint(color, 0)); g.addColorStop(.88, tint(color, .006 + ratio * .008)); g.addColorStop(1, tint(color, .025 + ratio * .025));
      c.fillStyle = g; circle(c, 0, 0, radius); c.fill();
      c.strokeStyle = tint(color, .07 + ratio * .2); c.lineWidth = 1 / this.view.zoom;
      circle(c, 0, 0, radius); c.stroke();
      c.setLineDash([4 / this.view.zoom, 13 / this.view.zoom]);
      c.strokeStyle = tint(color, .05 + ratio * .12); circle(c, 0, 0, radius - 5); c.stroke(); c.setLineDash([]);
      c.strokeStyle = tint(color, .12 + ratio * .2); c.lineWidth = 1.4 / this.view.zoom;
      for (let i = 0; i < 5; i++) {
        const a = this.time * .045 + i * TAU / 5;
        c.beginPath(); c.arc(0, 0, radius, a, a + .16); c.stroke();
      }
      c.restore();
    }

    _serviceArrived(crew) {
      const job = crew?.job, site = job?.site;
      if (!job || !SERVICE_COLORS[job.kind] || job.phase !== 'service' || !site || !Number.isFinite(site.x) || !Number.isFinite(site.y)) return false;
      return n(job.pathIndex) >= (job.path || []).length && Math.hypot(n(crew.x) - site.x, n(crew.y) - site.y) < .01;
    }

    _indexServiceJobs() {
      this._serviceByTarget.clear();
      for (const ship of this.ships) {
        if (ship.dead) continue;
        const parts = new Map((ship.parts || []).filter(alive).map(part => [part.id, part]));
        for (const crew of ship.crew || []) {
          const job = crew.job, target = parts.get(job?.targetId);
          if (crew.dead || crew.alive === false || !job || !SERVICE_COLORS[job.kind] || !target) continue;
          let entry = this._serviceByTarget.get(target.id);
          if (!entry) { entry = { repair: 0, extinguish: 0, travelling: 0, workers: [] }; this._serviceByTarget.set(target.id, entry); }
          const arrived = this._serviceArrived(crew);
          entry.workers.push({ crew, job, target, ship, arrived });
          if (arrived) entry[job.kind]++;
          else entry.travelling++;
        }
      }
    }

    _needsServiceNote(part, ship) {
      const commanded = ship?.faction === 'player' && part.id === this.serviceTargetId;
      return commanded || (part.id === this.selectedPartId && (n(part.fire) > 0 || this._serviceByTarget.has(part.id) || this.overlay === 'damage'));
    }

    _serviceNote(part, ship, hp) {
      if (!this._needsServiceNote(part, ship)) return;
      const fire = clamp(n(part.fire), 0, 1), entry = this._serviceByTarget.get(part.id);
      const commanded = ship.faction === 'player' && part.id === this.serviceTargetId;
      const labels = [];
      if (commanded) labels.push('정비 지정');
      labels.push(fire > 0 ? `화재 ${Math.ceil(fire * 100)}%` : `내구도 ${Math.round(hp * 100)}%`);
      if (entry?.extinguish) labels.push(`소화 ${entry.extinguish}명`);
      if (entry?.repair) labels.push(`수리 ${entry.repair}명`);
      if (!entry?.repair && !entry?.extinguish && entry?.travelling) labels.push(`이동 ${entry.travelling}명`);
      else if (!entry?.workers.length && commanded && (fire > 0 || hp < .999)) {
        labels.push(fire <= 0 && Number.isFinite(ship.repairStock) && ship.repairStock <= 0 ? '자재 부족' : '정비 대기');
      }
      const color = entry?.extinguish ? SERVICE_COLORS.extinguish : fire > 0 ? '#f4b07b' : SERVICE_COLORS.repair;
      const point = this._point(ship, part.x * CELL, part.y * CELL);
      this._annotations.push({ ...point, text: labels.join(' · '), color, dy: 35, compact: true, edge: commanded });
    }

    _drawShip(ship) {
      if (!ship || !Array.isArray(ship.parts)) return;
      const c = this.ctx, parts = ship.parts.filter(alive);
      const map = new Map(parts.map(p => [key(p.x, p.y), p]));
      if (ship === this.game?.player) this._playerMap = map;
      c.save(); c.translate(n(ship.x), n(ship.y)); c.rotate(n(ship.angle));
      const b = this._localBounds(ship);
      const glow = c.createRadialGradient((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, 0, (b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, Math.max(b.w, b.h) * .72);
      glow.addColorStop(0, ship.faction === 'enemy' ? 'rgba(89,43,43,.08)' : 'rgba(40,121,142,.09)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = glow; c.fillRect(b.minX - 70, b.minY - 70, b.w + 140, b.h + 140);
      for (const part of parts) if (part.type === 'thruster') this._thrusterPlume(part, ship);
      for (const part of parts) {
        const x = part.x * CELL, y = part.y * CELL;
        c.fillStyle = '#040a10'; rounded(c, x - 14.5, y - 14.5, 29, 29, 2.3); c.fill();
      }
      for (const part of parts) {
        c.save(); c.translate(part.x * CELL, part.y * CELL);
        this._module(part, ship, map);
        c.restore();
      }
      // Dark seams and pale exterior edges make the floorplan read as one hull.
      c.lineWidth = 1.05;
      for (const part of parts) {
        const px = part.x * CELL, py = part.y * CELL;
        c.strokeStyle = part.type === 'armor' ? '#6f7e89' : '#435968';
        if (!map.has(key(part.x, part.y - 1))) line(c, px - 12, py - 13.1, px + 12, py - 13.1);
        if (!map.has(key(part.x - 1, part.y))) line(c, px - 13.1, py - 12, px - 13.1, py + 12);
        c.strokeStyle = '#182b39';
        if (!map.has(key(part.x, part.y + 1))) line(c, px - 12, py + 13.1, px + 12, py + 13.1);
        if (!map.has(key(part.x + 1, part.y))) line(c, px + 13.1, py - 12, px + 13.1, py + 12);
      }
      this._logistics(ship, map);
      for (const part of parts) {
        c.save(); c.translate(part.x * CELL, part.y * CELL);
        this._partState(part, ship);
        c.restore();
      }
      this._drawServiceWork(ship);
      this._drawCrew(ship);
      c.restore();
    }

    _module(p, ship, map, ghost = false) {
      const c = this.ctx, def = this.parts[p.type] || {};
      const active = p.active !== false && p.connected !== false && !ship?.dead;
      const enemy = ship?.faction === 'enemy';
      const accent = enemy ? '#f39982' : '#73ddd9';
      const hull = c.createLinearGradient(-13, -13, 13, 13);
      hull.addColorStop(0, p.type === 'armor' ? '#6c7c89' : '#354654');
      hull.addColorStop(.2, p.type === 'armor' ? '#546571' : '#263946');
      hull.addColorStop(1, p.type === 'armor' ? '#354652' : '#182934');
      c.fillStyle = hull; rounded(c, -13.2, -13.2, 26.4, 26.4, 1.8); c.fill();
      c.strokeStyle = '#111e28'; c.lineWidth = .9; c.stroke();
      c.fillStyle = 'rgba(206,232,238,.07)'; c.fillRect(-10.5, -11.4, 21, .7);
      c.fillStyle = 'rgba(0,0,0,.22)'; c.fillRect(-11, 10.5, 22, 1.2);
      const detail = this.view.zoom > .35 || ghost;
      c.save();
      if (p.type !== 'corridor' && p.type !== 'armor') c.rotate(n(p.rot) * Math.PI / 2);
      if (!active && !ghost) c.globalAlpha *= .68;
      switch (p.type) {
        case 'armor': {
          polygon(c, [[-10,-10],[6,-10],[10,-6],[10,10],[-6,10],[-10,6]]);
          c.fillStyle = '#566875'; c.fill(); c.strokeStyle = '#7d8d97'; c.lineWidth = .6; c.stroke();
          c.strokeStyle = '#344752'; line(c, -9, 8, 8, -9);
          c.strokeStyle = '#6b7b85'; line(c, -8, 9, 9, -8);
          if (detail) {
            c.fillStyle = '#273945';
            for (const [x,y] of [[-8,-8],[8,8]]) { circle(c,x,y,1.25); c.fill(); }
            c.fillStyle = 'rgba(192,211,219,.15)'; c.fillRect(-6,-4,6,.5); c.fillRect(2,5,5,.5);
          }
          break;
        }
        case 'corridor': {
          c.fillStyle = '#263845'; c.fillRect(-11.5,-11.5,23,23);
          c.fillStyle = '#2e434f'; c.fillRect(-8,-8,16,16);
          c.strokeStyle = 'rgba(127,156,168,.13)'; c.lineWidth = .7;
          if (detail) for (let x=-7;x<=7;x+=3.5) line(c,x,-7,x,7);
          c.fillStyle = '#536973';
          const dirs = [[0,-1],[1,0],[0,1],[-1,0]];
          for (let i=0;i<4;i++) {
            const next = map?.get(key(p.x+dirs[i][0],p.y+dirs[i][1]));
            const open = next && (this.parts[next.type]?.walkable !== false) && next.type !== 'armor';
            c.save(); c.rotate(i * Math.PI/2);
            if (open) {
              c.fillStyle = '#2e434f'; c.fillRect(-6,-14,12,8);
              c.fillStyle = '#617983'; c.fillRect(-8,-12,2,3); c.fillRect(6,-12,2,3);
              c.fillStyle = active ? tint(accent,.6) : '#6b6d5e'; c.fillRect(-5,-12,10,.65);
            } else { c.fillStyle = '#435968'; c.fillRect(-9,-11,18,1.4); }
            c.restore();
          }
          break;
        }
        case 'reactor': {
          c.fillStyle = '#111f2a'; rounded(c,-11,-11,22,22,3); c.fill();
          c.strokeStyle = '#627786'; c.lineWidth = 1.5; circle(c,0,0,9.2); c.stroke();
          c.strokeStyle = '#a1a493'; c.lineWidth = 2.5;
          for (let i=0;i<4;i++) { c.beginPath(); c.arc(0,0,9.8,i*Math.PI/2+.15,i*Math.PI/2+.57); c.stroke(); }
          c.fillStyle = '#16414c'; circle(c,0,0,7); c.fill();
          c.strokeStyle = active ? '#5fd4dd' : '#3f7c82'; c.lineWidth = 1.1; circle(c,0,0,6.1); c.stroke();
          if (active) {
            const glow = c.createRadialGradient(0,0,0,0,0,8);
            glow.addColorStop(0,'rgba(202,255,244,.82)'); glow.addColorStop(.32,'rgba(95,233,227,.64)'); glow.addColorStop(1,'rgba(45,176,207,0)');
            c.fillStyle=glow; circle(c,0,0,8); c.fill();
            c.strokeStyle='rgba(175,255,245,.8)'; c.lineWidth=.65;
            c.beginPath(); c.arc(0,0,3.4+Math.sin(this.time*2+hash(p.id)*5)*.4,this.time*.8,this.time*.8+4.3); c.stroke();
          }
          c.fillStyle = active ? '#d1fff2' : '#6e9d9e'; circle(c,0,0,2.2); c.fill();
          if (detail) { c.fillStyle='#d0b16b'; c.fillRect(-10,-10,3,2); c.fillRect(7,8,3,2); }
          break;
        }
        case 'cockpit': {
          c.fillStyle='#14232f'; polygon(c,[[-10,8],[-10,-5],[-6,-10],[6,-10],[10,-5],[10,8]]); c.fill();
          const glass=c.createLinearGradient(0,-10,0,2); glass.addColorStop(0,'#e5cc8c'); glass.addColorStop(.45,'#b89157'); glass.addColorStop(1,'#5b6b69');
          c.fillStyle=glass; polygon(c,[[-8,-4],[-4,-8],[4,-8],[8,-4],[8,0],[-8,0]]); c.fill();
          c.strokeStyle='#263a46'; c.lineWidth=1.5; line(c,0,-9,0,1); line(c,-5,-7,-5,1); line(c,5,-7,5,1);
          c.fillStyle='#6c7c80'; rounded(c,-8,3,16,5,1); c.fill();
          c.fillStyle=active ? accent : '#5f787d'; c.fillRect(-6,4,4,1); c.fillRect(2,4,4,1);
          c.fillStyle='#142630'; rounded(c,-2,4,4,7,1.5); c.fill();
          break;
        }
        case 'bunk': {
          c.fillStyle='#1a2a35'; c.fillRect(-10,-11,20,22);
          for (const x of [-9,2]) {
            c.fillStyle='#6c7c87'; rounded(c,x,-9,7,18,1); c.fill();
            c.fillStyle=enemy ? '#765769' : '#466d8b'; c.fillRect(x+1,-3,5,10);
            c.fillStyle='#b3bec2'; rounded(c,x+1,-8,5,4,1); c.fill();
            c.fillStyle='rgba(8,17,27,.3)'; c.fillRect(x+1,3,5,1);
          }
          c.fillStyle='#c7b875'; c.fillRect(-.6,-9,1.2,3);
          break;
        }
        case 'storage': {
          c.fillStyle='#162733'; c.fillRect(-11,-11,22,22);
          for (let row=0;row<2;row++) for (let col=0;col<2;col++) {
            const x=-9+col*10,y=-9+row*10;
            c.fillStyle=(row+col)%2 ? '#85734f' : '#9a845b'; rounded(c,x,y,8,8,1); c.fill();
            c.strokeStyle='#574d39'; c.lineWidth=.8; c.stroke();
            c.fillStyle='#c5b27e'; c.fillRect(x+3,y,2,8);
            c.fillStyle='#302e28'; c.fillRect(x+1,y+5,2,1);
          }
          c.fillStyle=active ? '#d7be79' : '#706849'; c.fillRect(9,-5,1,10);
          break;
        }
        case 'laser': {
          c.fillStyle='#13242e'; circle(c,0,2,9.8); c.fill();
          c.strokeStyle='#536b77'; c.lineWidth=1.1; circle(c,0,2,8.8); c.stroke();
          c.fillStyle='#5b6f7a'; rounded(c,-6,-10,12,17,2); c.fill();
          c.fillStyle='#223a48'; rounded(c,-4,-12,8,16,1); c.fill();
          c.fillStyle='#7f9da7'; c.fillRect(-3,-18,6,10);
          c.fillStyle='#203e4b'; c.fillRect(-1.7,-18,3.4,12);
          c.fillStyle=active ? (enemy?'#f3ad8e':'#b6fff3') : '#527b80'; c.fillRect(-3,-18,6,2);
          c.fillStyle=active ? accent : '#385b64'; c.fillRect(-4,-6,1,8); c.fillRect(3,-6,1,8);
          c.fillStyle='#92abb0'; circle(c,0,3,2.5); c.fill();
          break;
        }
        case 'cannon': {
          c.fillStyle='#16232d'; circle(c,0,2,10.5); c.fill();
          c.strokeStyle='#756f61'; c.lineWidth=1; circle(c,0,2,9); c.stroke();
          c.fillStyle='#947a54'; rounded(c,-8,-7,16,16,3); c.fill();
          c.fillStyle='#625843'; c.fillRect(-8,4,16,3);
          c.fillStyle='#b1aba0'; rounded(c,-4,-18,8,15,1); c.fill();
          c.fillStyle='#34424a'; c.fillRect(-2,-18,4,11);
          c.fillStyle='#101c25'; c.fillRect(-5,-19,10,3);
          c.fillStyle='#71818a'; c.fillRect(-5,-17,10,1);
          c.fillStyle=active?'#efbd67':'#7d6b43'; c.fillRect(-6,-3,2,4); c.fillRect(4,-3,2,4);
          c.fillStyle='#c4a976'; circle(c,0,3,2); c.fill();
          break;
        }
        case 'shield': {
          c.fillStyle='#152a38'; rounded(c,-10,-10,20,20,2); c.fill();
          c.strokeStyle='#6d90a5'; c.lineWidth=1; circle(c,0,0,8.5); c.stroke();
          c.strokeStyle=active?'#7bb8e1':'#456276'; c.lineWidth=1.5;
          for(let i=0;i<3;i++){c.beginPath();c.arc(0,0,6.6,i*TAU/3+.16,i*TAU/3+1.6);c.stroke();}
          c.fillStyle=active?'#9ce4fa':'#617e90'; polygon(c,[[0,-4],[3.5,-1.5],[3,2.5],[0,4.5],[-3,2.5],[-3.5,-1.5]]); c.fill();
          if(active){c.strokeStyle='rgba(114,198,232,.35)';c.lineWidth=.6;circle(c,0,0,4+((this.time*.7+hash(p.id))%1)*6);c.stroke();}
          c.fillStyle='#3a556a'; for(const [x,y] of [[-10,-10],[7,-10],[-10,7],[7,7]])c.fillRect(x,y,3,3);
          break;
        }
        case 'thruster': {
          c.fillStyle='#607581'; polygon(c,[[-9,-10],[9,-10],[10,7],[6,11],[-6,11],[-10,7]]); c.fill();
          c.fillStyle='#223b49'; rounded(c,-6,-8,12,15,2); c.fill();
          c.fillStyle='#819aa3'; for(let y=-7;y<5;y+=3)c.fillRect(-5,y,10,1);
          c.fillStyle='#101d28'; c.fillRect(-7,7,14,4);
          c.fillStyle=active ? '#8aeeec' : '#426975'; c.fillRect(-5,9,10,2);
          c.fillStyle='#b4bdad';c.fillRect(-9,-7,2,5);c.fillRect(7,-7,2,5);
          break;
        }
        case 'radiator': {
          c.fillStyle='#182c35'; c.fillRect(-11,-11,22,22);
          const hot=clamp(n(p.heat)/100,0,1);
          c.fillStyle=hot>.55?'#ad825e':'#668a87';
          for(let x=-9;x<=9;x+=3)c.fillRect(x,-9,1.5,18);
          c.fillStyle='#8aaba3';c.fillRect(-10,-10,20,2);c.fillRect(-10,8,20,2);
          c.fillStyle='#304a54';c.fillRect(-11,-2,22,4);
          c.fillStyle=active ? '#a4d0bb' : '#657d74';c.fillRect(-8,-1,16,1);
          break;
        }
        default: {
          c.fillStyle=def.color || '#657e8d';rounded(c,-8,-8,16,16,2);c.fill();
          c.strokeStyle='#b6d0d4';c.lineWidth=.7;c.stroke();
        }
      }
      c.restore();
      if (p.connected === false && !ghost) {
        c.fillStyle='rgba(6,12,18,.42)';c.fillRect(-12.5,-12.5,25,25);
        c.strokeStyle='rgba(231,158,86,.6)';c.lineWidth=.8;line(c,-9,9,9,-9);
      }
      if (detail && p.type !== 'armor') {
        c.fillStyle='#81939b';
        for(const [x,y] of [[-11,-11],[10,10]]) {circle(c,x,y,.65);c.fill();}
      }
    }

    _thrusterPlume(part, ship) {
      if (part.active === false || part.connected === false || ship.dead) return;
      const throttle = this.mode === 'combat' ? clamp(n(part.throttle), 0, 1) : 0;
      if (throttle <= .015) return;
      const c=this.ctx;
      const seed=hash(part.id || key(part.x,part.y));
      const pulse=.85+.15*Math.sin(this.time*24+seed*20);
      const length=(8+37*throttle)*pulse, half=3.2+2.6*throttle;
      c.save();c.translate(part.x*CELL,part.y*CELL);c.rotate(n(part.rot)*Math.PI/2);
      c.globalAlpha=.35+throttle*.65;
      const glow=c.createLinearGradient(0,8,0,12+length);
      glow.addColorStop(0,'rgba(186,255,246,.93)');
      glow.addColorStop(.22,'rgba(69,211,237,.7)');glow.addColorStop(.65,'rgba(58,135,229,.2)');glow.addColorStop(1,'rgba(36,106,220,0)');
      c.fillStyle=glow;polygon(c,[[-half,10],[half,10],[half*.6,17],[0,13+length],[-half*.6,17]]);c.fill();
      c.fillStyle='rgba(220,255,246,.74)';polygon(c,[[-2.5,10],[2.5,10],[0,13+length*.5]]);c.fill();
      c.restore();
    }

    _drawPartFire(part, ship) {
      const fire = clamp(n(part.fire), 0, 1);
      if (fire <= 0) return;
      const c = this.ctx, seed = hash(part.id || key(part.x, part.y)), detail = this.view.zoom > .45;
      c.save(); c.rotate(-n(ship.angle) - this._cameraAngle);
      const radius = 8 + fire * 13;
      const halo = c.createRadialGradient(0, 0, 1, 0, 0, radius);
      halo.addColorStop(0, tint('#ff934f', .08 + fire * .15)); halo.addColorStop(1, 'rgba(255,113,53,0)');
      c.fillStyle = halo; circle(c, 0, 0, radius); c.fill();
      const smokeCount = detail ? 2 + (fire > .6 ? 1 : 0) : 1;
      for (let i = 0; i < smokeCount && this._fireParticleBudget > 0; i++, this._fireParticleBudget--) {
        const phase = (this.time * (.48 + fire * .25) + seed + i * .37) % 1;
        const x = Math.sin(seed * TAU + i * 2 + phase * 3) * (2 + phase * 6);
        const y = -5 - phase * (13 + fire * 16), r = 2 + fire * 2 + phase * 5;
        const smoke = c.createRadialGradient(x, y, 0, x, y, r);
        smoke.addColorStop(0, `rgba(124,123,112,${fire * .19 * (1 - phase)})`);
        smoke.addColorStop(1, 'rgba(46,55,61,0)'); c.fillStyle = smoke; circle(c, x, y, r); c.fill();
      }
      const count = detail ? 1 + Math.floor(fire * 2.1) : 1;
      c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < count; i++) {
        const flicker = .86 + Math.sin(this.time * 11 + seed * 12 + i * 2.7) * .14;
        const scale = .22 + Math.sqrt(fire) * .72;
        c.save(); c.translate((i - (count - 1) / 2) * 5, 1 + i % 2); c.scale(scale, scale * flicker);
        const flame = c.createLinearGradient(0, 7, 0, -14);
        flame.addColorStop(0, 'rgba(255,182,75,.82)'); flame.addColorStop(.5, 'rgba(250,105,43,.72)'); flame.addColorStop(1, 'rgba(229,73,35,.12)');
        c.fillStyle = flame; c.beginPath(); c.moveTo(-4, 5);
        c.bezierCurveTo(-7, 0, -2, -4, -1, -13); c.quadraticCurveTo(-.5, -6, 2, -8);
        c.bezierCurveTo(6, -2, 7, 3, 3, 6); c.quadraticCurveTo(0, 8, -4, 5); c.fill();
        c.fillStyle = 'rgba(255,235,153,.75)'; c.beginPath(); c.moveTo(-1.9, 5); c.quadraticCurveTo(-2, 1, .5, -4);
        c.quadraticCurveTo(4, 3, 1.6, 6); c.closePath(); c.fill(); c.restore();
      }
      if (detail && fire > .5) {
        const phase = (this.time * 1.2 + seed) % 1;
        c.fillStyle = tint('#ffdeaa', (1 - phase) * fire * .65);
        circle(c, Math.sin(seed * 19 + phase * 2) * 5, -7 - phase * 17, .6); c.fill();
      }
      c.restore();
    }

    _partState(p, ship) {
      const c=this.ctx,def=this.parts[p.type]||{}, maxHp=Math.max(1,n(p.maxHp,n(def.hp,1)));
      const hp=clamp(n(p.hp,maxHp)/maxHp,0,1);
      const heat=clamp(n(p.heat)/Math.max(1,n(p.maxHeat,n(def.heatCapacity,100))),0,1.5);
      const fire=clamp(n(p.fire),0,1),service=this._serviceByTarget.get(p.id);
      if(hp<.68){
        const seed=hash(p.id || key(p.x,p.y));c.strokeStyle=`rgba(5,11,18,${.3+(1-hp)*.4})`;c.lineWidth=1.3;
        c.beginPath();c.moveTo(-9+seed*5,-9);c.lineTo(-2,0);c.lineTo(3,-3);c.lineTo(8,8);c.stroke();
        c.fillStyle='rgba(9,17,24,.22)';circle(c,4,3,(1-hp)*7);c.fill();
      }
      if(this.overlay==='heat'){
        const color=heat>.85?'#ff704d':heat>.4?'#f7c468':'#5aa9b5';
        c.fillStyle=tint(color,.08+Math.min(1,heat)*.34);c.fillRect(-12.4,-12.4,24.8,24.8);
        c.strokeStyle=tint(color,.18+Math.min(1,heat)*.48);c.lineWidth=.8;c.strokeRect(-11.5,-11.5,23,23);
        if(this.view.zoom>.85){c.font='bold 7px ui-monospace,monospace';c.textAlign='right';c.fillStyle=heat>.85?'#fff0c4':'#a6d4d4';c.fillText(String(Math.round(n(p.heat))),10,10);}
      }
      if(this.overlay==='damage'){
        const color=fire>0?'#ed925b':hp<.35?'#ee7969':hp<.7?'#dfb36c':'#78b4aa';
        c.fillStyle=tint(color,hp<.995||fire>0?.14+(1-hp)*.22+fire*.08:.035);c.fillRect(-12.4,-12.4,24.8,24.8);
        c.strokeStyle=tint(color,hp<.995||fire>0?.55:.12);c.lineWidth=.9/this.view.zoom;c.strokeRect(-12,-12,24,24);
        if(fire>0){c.fillStyle='#ee9c60';c.fillRect(-10,-11,20*fire,1.6);}
      }
      this._drawPartFire(p,ship);
      if(hp<.985 && this.overlay!=='heat'){
        c.fillStyle='#08131b';rounded(c,-10.5,9.3,21,2.6,.7);c.fill();
        c.fillStyle=hp>.55?'#96c4b0':hp>.25?'#e4b56c':'#ee8069';rounded(c,-10,9.8,20*hp,1.6,.5);c.fill();
      }
      if(this.overlay==='damage'&&this.view.zoom>.68&&(hp<.995||fire>0||p.id===this.selectedPartId||p.id===this.serviceTargetId)){
        c.save();c.rotate(-n(ship.angle)-this._cameraAngle);c.font=`600 ${Math.min(10,7.5/this.view.zoom)}px ui-monospace,monospace`;c.textAlign='center';
        c.lineJoin='round';c.lineWidth=2/this.view.zoom;c.strokeStyle='#0a141e';c.strokeText(`${Math.round(hp*100)}%`,0,8);
        c.fillStyle=hp<.35?'#ffd2b7':'#dce4ce';c.fillText(`${Math.round(hp*100)}%`,0,8);c.restore();
      }
      if(service&&(service.repair||service.extinguish)&&(this.overlay==='damage'||this.overlay==='logistics'||p.id===this.selectedPartId||p.id===this.serviceTargetId)){
        const color=service.extinguish?SERVICE_COLORS.extinguish:SERVICE_COLORS.repair;
        c.fillStyle='#101d28';circle(c,-9,-8,3.8);c.fill();c.strokeStyle=color;c.lineWidth=1/this.view.zoom;
        if(service.extinguish){c.beginPath();c.moveTo(-9,-11);c.quadraticCurveTo(-13,-6,-9,-5.6);c.quadraticCurveTo(-5,-6,-9,-11);c.stroke();}
        else{line(c,-11.4,-8,-6.6,-8);line(c,-9,-10.4,-9,-5.6);}
      }
      const status=String(p.status||'').toLowerCase();
      if(this.mode==='combat'&&p.type!=='armor'&&p.type!=='corridor'&&(/no.?power|no.?ammo|no.?crew|overheat|전력|전지|탄약|인력|과열/.test(status)||['power','ammo','heat','blocked'].includes(p.fireState))){
        c.fillStyle=heat>=.85?'#ff8e61':'#dfb56e';circle(c,9,-9,1.8);c.fill();
      }
      const flash = this._hitFlashes.get(p.id);
      if (flash && this.time - flash.time < .18) {
        c.fillStyle = tint('#fff1cd', .48 * (1 - (this.time - flash.time) / .18));
        rounded(c, -12.7, -12.7, 25.4, 25.4, 1.5); c.fill();
        c.strokeStyle = tint('#fff1cd', .85 * (1 - (this.time - flash.time) / .18)); c.lineWidth = 1 / this.view.zoom; c.stroke();
      }
      if (p.id === this._blockedPartId) {
        c.strokeStyle = '#e6aa68'; c.lineWidth = 1.2 / this.view.zoom;
        c.setLineDash([3 / this.view.zoom, 3 / this.view.zoom]); c.strokeRect(-13.5, -13.5, 27, 27); c.setLineDash([]);
        c.strokeStyle = 'rgba(234,174,110,.45)'; line(c, -7, -7, 7, 7); line(c, 7, -7, -7, 7);
      }
      if(p.id===this.selectedPartId || p.id===this.targetPartId){
        const target=p.id===this.targetPartId&&ship.faction==='enemy';
        this._brackets(-15,-15,30,30,target?'#ff947a':'#8cf1e5',6,1.6/this.view.zoom);
        if(target){c.strokeStyle='rgba(255,148,122,.6)';c.lineWidth=.7/this.view.zoom;line(c,-20,0,-15,0);line(c,15,0,20,0);line(c,0,-20,0,-15);line(c,0,15,0,20);}
      }
      if(ship.faction==='player'&&p.id===this.serviceTargetId){
        const color=fire>0?SERVICE_COLORS.extinguish:SERVICE_COLORS.repair;
        c.strokeStyle=tint(color,.85);c.lineWidth=1.1/this.view.zoom;c.setLineDash([3/this.view.zoom,3/this.view.zoom]);
        c.strokeRect(-17,-17,34,34);c.setLineDash([]);line(c,-21,-3,-21,3);line(c,-24,0,-18,0);
      }
      this._serviceNote(p,ship,hp);
    }

    _brackets(x,y,w,h,color,length=8,width=1.5) {
      const c=this.ctx;c.strokeStyle=color;c.lineWidth=width;c.setLineDash([]);
      for(const [cx,cy,sx,sy] of [[x,y,1,1],[x+w,y,-1,1],[x,y+h,1,-1],[x+w,y+h,-1,-1]]){
        c.beginPath();c.moveTo(cx+length*sx,cy);c.lineTo(cx,cy);c.lineTo(cx,cy+length*sy);c.stroke();
      }
    }

    _logistics(ship, map) {
      const c=this.ctx;
      for(const crew of ship.crew||[]){
        const job=crew.job;
        if(!job || crew.dead)continue;
        const service=SERVICE_COLORS[job.kind];
        if(!service&&this.overlay!=='logistics')continue;
        if(service&&!['logistics','damage'].includes(this.overlay)&&job.targetId!==this.selectedPartId&&job.targetId!==this.serviceTargetId)continue;
        const color=service||(crew.cargo==='ammo'||/ammo/.test(job.kind||'')?'#f3bd67':'#68e4df');
        const points=(job.path||crew.path||[]).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));
        const start=clamp(n(job.pathIndex,n(crew.pathIndex)),0,points.length);
        c.beginPath();c.moveTo(n(crew.x)*CELL,n(crew.y)*CELL);
        if(points.length){for(let i=start;i<points.length;i++)c.lineTo(points[i].x*CELL,points[i].y*CELL);}
        else if(!service){
          const target=(ship.parts||[]).find(p=>p.id===job.targetId);
          if(target)c.lineTo(target.x*CELL,target.y*CELL);
        }
        const emphasized=job.sourceId===this.selectedPartId||job.targetId===this.selectedPartId||job.targetId===this.serviceTargetId;
        c.strokeStyle=tint(color,emphasized?.85:service?.48:.38);c.lineWidth=(emphasized?1.5:1)/this.view.zoom;
        c.setLineDash([3/this.view.zoom,4/this.view.zoom]);c.lineDashOffset=-this.time*11/this.view.zoom;c.stroke();c.setLineDash([]);c.lineDashOffset=0;
      }
      if(this.overlay!=='logistics')return;
      for(const p of map.values()){
        if(!['reactor','storage','shield','laser','cannon'].includes(p.type))continue;
        const color=p.type==='storage'||p.type==='cannon'?'#e7b96c':'#76d9d2';
        c.strokeStyle=tint(color,.45);c.lineWidth=.7;circle(c,p.x*CELL,p.y*CELL,10.7);c.stroke();
      }
    }

    _drawServiceWork(ship) {
      if (ship.dead || this.game?.paused) return;
      const c = this.ctx;
      for (const entry of this._serviceByTarget.values()) for (const worker of entry.workers) {
        const { crew, job, target, arrived } = worker;
        if (worker.ship.id !== ship.id || !arrived) continue;
        if (job.kind === 'extinguish' && !(target.fire > 0)) continue;
        if (job.kind === 'repair' && (!(target.hp < target.maxHp) || (Number.isFinite(ship.repairStock) && ship.repairStock <= 0))) continue;
        let dx = target.x - n(crew.x), dy = target.y - n(crew.y), length = Math.hypot(dx, dy);
        if (length < .01) { dx = .8; dy = -.6; length = 1; }
        const ux = dx / length, uy = dy / length;
        const sx = n(crew.x) * CELL + ux * 3, sy = n(crew.y) * CELL + uy * 3;
        const onTarget = Math.hypot(target.x - n(crew.x), target.y - n(crew.y)) < .01;
        const ex = target.x * CELL + ux * (onTarget ? 8 : -8), ey = target.y * CELL + uy * (onTarget ? 8 : -8);
        const color = SERVICE_COLORS[job.kind], pulse = .65 + Math.sin(this.time * 14 + hash(crew.id) * TAU) * .25;
        c.save();
        if (job.kind === 'extinguish') {
          const spray = c.createLinearGradient(sx, sy, ex, ey);
          spray.addColorStop(0, tint(color, .04)); spray.addColorStop(1, tint(color, .22));
          c.fillStyle = spray; polygon(c, [[sx, sy], [ex - uy * 4, ey + ux * 4], [ex + uy * 4, ey - ux * 4]]); c.fill();
          c.strokeStyle = tint('#c3e5ff', .5); c.lineWidth = .7 / this.view.zoom; line(c, sx, sy, ex, ey);
          for (let i = 0; i < 3; i++) {
            const phase = (this.time * 3.5 + hash(crew.id) + i * .33) % 1;
            c.fillStyle = tint('#c4e9ff', (1 - phase * .6) * .65);
            circle(c, sx + (ex - sx) * phase - uy * Math.sin(i + phase * 4) * phase * 2, sy + (ey - sy) * phase + ux * Math.sin(i + phase * 4) * phase * 2, .7); c.fill();
          }
        } else {
          c.strokeStyle = tint(color, .3); c.lineWidth = .8 / this.view.zoom; line(c, sx, sy, ex, ey);
          c.strokeStyle = tint('#e1ffc8', pulse); c.lineWidth = .85 / this.view.zoom;
          line(c, ex - 2.7, ey, ex + 2.7, ey); line(c, ex, ey - 2.7, ex, ey + 2.7);
          c.fillStyle = tint(color, pulse * .55); circle(c, ex, ey, 3.5); c.fill();
        }
        c.restore();
      }
    }

    _drawCrew(ship) {
      if(this.view.zoom<.3&&this.overlay!=='damage')return;
      const c=this.ctx;
      for(const crew of ship.crew||[]){
        if(crew.dead || crew.alive===false)continue;
        const service=SERVICE_COLORS[crew.job?.kind],arrived=service&&this._serviceArrived(crew);
        if(this.view.zoom<.3&&!service)continue;
        const x=n(crew.x)*CELL,y=n(crew.y)*CELL;
        const path=crew.job?.path||crew.path||[];
        const idx=clamp(n(crew.job?.pathIndex,n(crew.pathIndex)),0,Math.max(0,path.length-1));
        const next=path[idx];
        let angle=next?Math.atan2(next.y-n(crew.y),next.x-n(crew.x))+Math.PI/2:hash(crew.id)*TAU;
        if(arrived){const target=this._serviceByTarget.get(crew.job.targetId)?.workers[0]?.target;if(target&&Math.hypot(target.x-crew.x,target.y-crew.y)>.01)angle=Math.atan2(target.y-crew.y,target.x-crew.x)+Math.PI/2;}
        c.save();c.translate(x,y);c.rotate(angle);
        if(service){const scale=clamp(.52/this.view.zoom,1,1.7);c.scale(scale,scale);}
        c.fillStyle='rgba(0,5,12,.55)';circle(c,.7,1.2,3.2);c.fill();
        if(service&&(['damage','logistics'].includes(this.overlay)||crew.job.targetId===this.serviceTargetId)){
          c.strokeStyle=tint(service,arrived?.7:.36);c.lineWidth=.65/this.view.zoom;circle(c,0,.5,5.7);c.stroke();
        }
        c.fillStyle=service||(ship.faction==='enemy'?'#d78b7a':'#c3d3d4');rounded(c,-1.7,-.6,3.4,4.6,1.3);c.fill();
        c.fillStyle=service?(crew.job.kind==='repair'?'#4d7145':'#395a81'):(ship.faction==='enemy'?'#894a48':'#447c96');c.fillRect(-1.7,1,3.4,1.4);
        c.fillStyle=service?'#e5eed5':'#ead2ac';circle(c,0,-2,1.45);c.fill();
        if(service){
          c.fillStyle=service;c.strokeStyle='#d5e9eb';c.lineWidth=.6;
          if(crew.job.kind==='extinguish'){rounded(c,-4.6,-1.8,2.1,4.3,.7);c.fill();line(c,-3.4,-2,-3.4,-3.2);line(c,-3.4,-3.2,-1.8,-3.2);}
          else{line(c,-4.2,2.3,-2.7,-1.8);c.beginPath();c.arc(-2.5,-2.3,1.2,.1,Math.PI*1.55);c.stroke();}
        }
        if(crew.cargo){
          const color=crew.cargo==='ammo'?'#f2bc60':'#7df3e6';
          c.fillStyle='#192e3c';rounded(c,1.5,-1.2,3.7,3.7,.6);c.fill();
          c.fillStyle=color;rounded(c,2,-.8,2.8,2.8,.5);c.fill();
          if(this.overlay==='logistics'){c.shadowColor=color;c.shadowBlur=5;c.fill();c.shadowBlur=0;}
        }
        c.restore();
      }
    }

    _drawPlacement() {
      const ship=this.game?.player,cells=this._ghosts();
      if(!ship||!cells.length)return;
      const c=this.ctx,ghostMap=new Map(cells.map(cell=>[key(cell.x,cell.y),cell]));
      cells.forEach((cell,index)=>{
        const valid=cell.valid!==false,color=valid?'#84e9c3':'#ff857c';
        const deleting=['delete','erase','remove'].includes(cell.type);
        c.save();c.translate(n(ship.x),n(ship.y));c.rotate(n(ship.angle));c.translate(cell.x*CELL,cell.y*CELL);
        if(cell.type&&!deleting){
          c.save();c.globalAlpha=index===0?.53:.38;
          this._module({id:'placement',type:cell.type,x:cell.x,y:cell.y,rot:n(cell.rot),hp:1,maxHp:1,power:1,heat:0,active:true,connected:true},ship,this._playerMap,true);
          c.restore();
        }
        c.fillStyle=tint(deleting?'#ff857c':color,index===0?.12:.07);c.fillRect(-14,-14,28,28);
        c.strokeStyle=deleting?'#ff857c':color;c.lineWidth=1.4/this.view.zoom;
        if(index>0)c.setLineDash([4/this.view.zoom,3/this.view.zoom]);
        c.strokeRect(-14,-14,28,28);c.setLineDash([]);
        this._brackets(-15.3,-15.3,30.6,30.6,deleting?'#ff857c':color,5,1.5/this.view.zoom);
        if(!valid||deleting){
          c.strokeStyle=tint('#ff938a',.8);c.lineWidth=1.3/this.view.zoom;line(c,-6,-6,6,6);line(c,6,-6,-6,6);
        } else {
          for(const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]]){
            const neighbor=this._playerMap.get(key(cell.x+dx,cell.y+dy))||ghostMap.get(key(cell.x+dx,cell.y+dy));
            if(!neighbor||neighbor.valid===false)continue;
            const walkable=this.parts[cell.type]?.walkable&&this.parts[neighbor.type]?.walkable;
            c.strokeStyle=tint(walkable?color:'#8babb5',walkable?.9:.4);c.lineWidth=(walkable?2:1)/this.view.zoom;
            line(c,dx*11-dy*3,dy*11+dx*3,dx*17-dy*3,dy*17+dx*3);
          }
        }
        c.restore();
      });
      const notice=cells.find(cell=>cell.valid===false&&cell.message)||cells.find(cell=>cell.message);
      if(notice){const point=this._point(ship,notice.x*CELL,notice.y*CELL);this._annotations.push({...point,text:String(notice.message),color:notice.valid===false?'#f3a091':'#dfbe82',dy:55,compact:true});}
    }

    _drawMoveOrders() {
      if(this.mode!=='combat')return;
      const c=this.ctx;
      for(const ship of this.ships){
        const t=ship.moveTarget;
        if(ship.faction==='enemy'||!t||!Number.isFinite(t.x)||!Number.isFinite(t.y)||ship.dead)continue;
        c.strokeStyle='rgba(108,222,211,.25)';c.lineWidth=1/this.view.zoom;
        c.setLineDash([4/this.view.zoom,6/this.view.zoom]);line(c,n(ship.x),n(ship.y),t.x,t.y);c.setLineDash([]);
        const r=8/this.view.zoom;c.strokeStyle='rgba(108,222,211,.7)';circle(c,t.x,t.y,r);c.stroke();
        c.lineWidth=.7/this.view.zoom;line(c,t.x-r*1.5,t.y,t.x-r*.7,t.y);line(c,t.x+r*.7,t.y,t.x+r*1.5,t.y);line(c,t.x,t.y-r*1.5,t.x,t.y-r*.7);line(c,t.x,t.y+r*.7,t.x,t.y+r*1.5);
        const distance=Math.hypot(t.x-n(ship.x),t.y-n(ship.y))/CELL;
        this._annotations.push({x:t.x,y:t.y,text:`이동 · ${distance.toFixed(1)}칸`,color:'#94e2d8',dy:25,edge:true,compact:true});
      }
    }

    _drawDebris() {
      const c=this.ctx;
      for(const d of this.game?.debris||[]){
        if(d.collected || !Number.isFinite(d.x) || !Number.isFinite(d.y))continue;
        const color=d.color||'#d4b477', pulse=.6+.2*Math.sin(this.time*2+hash(d.id||`${d.x}:${d.y}`)*9);
        c.save();c.translate(d.x,d.y);c.rotate(Math.PI/4);
        c.fillStyle=tint(color,.08);c.fillRect(-7,-7,14,14);
        c.fillStyle=tint(color,pulse);c.fillRect(-2.8,-2.8,5.6,5.6);
        c.strokeStyle=tint('#ffe1a1',.5);c.lineWidth=.6;c.strokeRect(-3.5,-3.5,7,7);
        c.restore();
      }
    }

    _drawFragments() {
      const c=this.ctx;
      for(const f of this.game?.fragments||[]){
        if(!Number.isFinite(f.x)||!Number.isFinite(f.y))continue;
        const fade=f.ttl==null?1:clamp(f.ttl/Math.max(.001,(f.maxTtl||3)*.35),0,1);
        if(fade<=0)continue;
        c.save();c.translate(f.x,f.y);c.rotate(n(f.angle));c.globalAlpha=fade*.82;
        const size=n(f.size,CELL),scale=size/CELL;c.scale(scale,scale);
        c.fillStyle='#263844';rounded(c,-11,-11,22,22,2);c.fill();
        c.strokeStyle=f.color||'#6a7b83';c.lineWidth=1;line(c,-9,-10,8,-10);line(c,-10,-9,-10,7);
        c.fillStyle='#15252f';polygon(c,[[-9,-5],[4,-8],[9,1],[1,8],[-7,4]]);c.fill();
        c.strokeStyle='rgba(166,177,169,.25)';c.lineWidth=.7;line(c,-5,-5,6,6);
        if(f.ttl>f.maxTtl*.6){c.fillStyle='rgba(235,138,74,.52)';circle(c,7,-5,1.2);c.fill();}
        c.restore();
      }
    }

    _drawProjectiles() {
      const c=this.ctx;
      c.save();c.globalCompositeOperation='lighter';
      for(const p of this.game?.projectiles||[]){
        if(!Number.isFinite(p.x)||!Number.isFinite(p.y))continue;
        const enemy=p.ownerFaction==='enemy'||p.owner===this.game?.enemy?.id;
        const color=p.color||(p.kind==='cannon'?'#f2bc75':enemy?'#ff9279':'#81eee4');
        const vx=n(p.vx),vy=n(p.vy),speed=Math.max(1,Math.hypot(vx,vy));
        const trail=p.kind==='laser'?Math.max(14,Math.min(36,speed*.035)):12;
        const px=n(p.px,p.x-vx/speed*trail),py=n(p.py,p.y-vy/speed*trail);
        const dx=p.x-px,dy=p.y-py;
        const a=Math.atan2(vy||dy,vx||dx);
        const tx=p.x-Math.cos(a)*Math.max(trail,Math.hypot(dx,dy));
        const ty=p.y-Math.sin(a)*Math.max(trail,Math.hypot(dx,dy));
        if(p.kind==='cannon'){
          c.strokeStyle=tint(color,.32);c.lineWidth=2;line(c,tx,ty,p.x,p.y);
          c.save();c.translate(p.x,p.y);c.rotate(a);c.fillStyle='#fff1ca';rounded(c,-3,-1.7,6,3.4,1);c.fill();c.restore();
          c.fillStyle=tint(color,.2);circle(c,p.x,p.y,5);c.fill();
        }else{
          c.strokeStyle=tint(color,.15);c.lineWidth=6;line(c,tx,ty,p.x,p.y);
          c.strokeStyle=tint(color,.75);c.lineWidth=2;line(c,tx,ty,p.x,p.y);
          c.strokeStyle='#e5fff6';c.lineWidth=.65;line(c,tx,ty,p.x,p.y);
        }
      }
      c.restore();
    }

    _drawEffects() {
      const c=this.ctx;
      for(const e of this.game?.effects||[]){
        if(!Number.isFinite(e.x)||!Number.isFinite(e.y))continue;
        const max=Math.max(.001,n(e.maxTtl,n(e.ttl,1)));
        const progress=clamp(1-n(e.ttl,max)/max,0,1),fade=1-progress;
        if(fade<=0)continue;
        const color=e.color||SERVICE_COLORS[e.kind]||(['shield','salvage'].includes(e.kind)?'#8be8df':'#ffc38b');
        const size=Math.max(3,n(e.size,18));
        c.save();c.translate(e.x,e.y);c.globalCompositeOperation='lighter';
        if(e.kind==='explosion'){
          const radius=size*(.3+progress*1.3);
          const glow=c.createRadialGradient(0,0,0,0,0,radius);
          glow.addColorStop(0,`rgba(255,239,186,${fade*.7})`);glow.addColorStop(.25,tint(color,fade*.6));glow.addColorStop(.65,`rgba(239,108,58,${fade*.15})`);glow.addColorStop(1,'rgba(196,62,40,0)');
          c.fillStyle=glow;circle(c,0,0,radius);c.fill();
          c.strokeStyle=tint(color,fade*.5);c.lineWidth=(1.4*fade+.2)/this.view.zoom;circle(c,0,0,size*(.4+progress*1.55));c.stroke();
          for(let i=0;i<11;i++){
            const seed=hash(`${e.x}:${e.y}:${i}`),a=seed*TAU;
            const r=size*(.22+progress*(.7+hash(i+':es')*.9));
            c.strokeStyle=tint(i%3?'#f2a765':'#ffeac1',fade*.75);c.lineWidth=.8;
            line(c,Math.cos(a)*r,Math.sin(a)*r,Math.cos(a)*(r+4*fade),Math.sin(a)*(r+4*fade));
          }
        }else if(e.kind==='shield'){
          c.strokeStyle=tint(color,fade*.9);c.lineWidth=1.8/this.view.zoom;circle(c,0,0,size*(.3+progress));c.stroke();
          c.strokeStyle=tint(color,fade*.25);c.lineWidth=4/this.view.zoom;circle(c,0,0,size*(.3+progress));c.stroke();
        }else if(e.kind==='salvage'){
          c.strokeStyle=tint(color,fade*.65);c.lineWidth=1/this.view.zoom;c.setLineDash([2,5]);circle(c,0,0,size*(.6+progress));c.stroke();c.setLineDash([]);
          c.strokeStyle=tint(color,fade);line(c,-3,-progress*10,3,-progress*10);line(c,0,-3-progress*10,0,3-progress*10);
        }else if(e.kind==='repair'){
          const radius=clamp(size*.25+progress*size*.35,2,13);
          c.strokeStyle=tint(color,fade*.6);c.lineWidth=.8/this.view.zoom;
          rounded(c,-radius,-radius,radius*2,radius*2,2);c.stroke();
          c.strokeStyle=tint('#dfffcd',fade*.8);line(c,-3,-progress*4,3,-progress*4);line(c,0,-3-progress*4,0,3-progress*4);
        }else if(e.kind==='extinguish'){
          for(let i=0;i<3;i++){
            const a=hash(`${e.x}:${e.y}:${i}`)*TAU,r=(2+progress*size*.45);
            c.fillStyle=tint(color,fade*.14);circle(c,Math.cos(a)*r,Math.sin(a)*r,2+progress*4);c.fill();
          }
          c.strokeStyle=tint(color,fade*.4);c.lineWidth=.7/this.view.zoom;circle(c,0,0,2+progress*size*.35);c.stroke();
        }else if(e.kind==='muzzle'){
          const radius=size*(.4+progress*.8);c.fillStyle=tint(color,fade*.5);circle(c,0,0,radius);c.fill();
          c.fillStyle=`rgba(249,255,229,${fade})`;circle(c,0,0,Math.max(1,radius*.3));c.fill();
        }else{
          for(let i=0;i<5;i++){
            const a=hash(`${e.x+e.y}:${i}`)*TAU,r=2+progress*size;
            c.strokeStyle=tint(color,fade*.9);c.lineWidth=1/this.view.zoom;
            line(c,Math.cos(a)*r*.45,Math.sin(a)*r*.45,Math.cos(a)*r,Math.sin(a)*r);
          }
          c.fillStyle=tint('#fff0c0',fade*.9);circle(c,0,0,2.2*fade);c.fill();
        }
        c.restore();
      }
    }

    _collectDamageEffects() {
      this._damageLabels = this._damageLabels.filter(label => this.time - label.born < .86);
      for (const [id, flash] of this._hitFlashes) if (this.time - flash.time >= .2) this._hitFlashes.delete(id);
      for (const effect of this.game?.effects || []) {
        if (!effect || this._seenDamageEffects.has(effect) || !(Number.isFinite(effect.amount) && effect.amount > 0) || !Number.isFinite(effect.x) || !Number.isFinite(effect.y)) continue;
        const restoring=effect.kind==='repair';
        if(!restoring&&!['hit','hullHit','shield','shieldHit'].includes(effect.kind))continue;
        this._seenDamageEffects.add(effect);
        const focused=this.overlay==='damage'||(effect.partId&&(effect.partId===this.selectedPartId||effect.partId===this.serviceTargetId));
        if(restoring?!focused:(this.mode!=='combat'&&!focused))continue;
        const shield = effect.kind === 'shield' || effect.kind === 'shieldHit';
        const id = shield ? `shield:${effect.shipId || ''}:${Math.round(effect.x / 45)},${Math.round(effect.y / 45)}` : `${restoring?'repair':'hull'}:${effect.shipId || ''}:${effect.partId || `${Math.round(effect.x)},${Math.round(effect.y)}`}`;
        const merged = this._damageLabels.find(label => label.id === id && this.time - label.last < (restoring?.5:.12) && this.time - label.born < (restoring?.58:.32));
        if (merged) { merged.amount += effect.amount; merged.last = this.time; }
        else this._damageLabels.push({ id, x: effect.x, y: effect.y, amount: effect.amount, shield, restoring, born: this.time, last: this.time });
        if (!shield && !restoring && effect.partId) this._hitFlashes.set(effect.partId, { time: this.time });
      }
      if (this._damageLabels.length > 28) this._damageLabels.splice(0, this._damageLabels.length - 28);
    }

    _drawDamageLabels() {
      const c = this.ctx;
      c.save(); c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = '700 11px ui-monospace, SFMono-Regular, Consolas, monospace'; c.lineJoin = 'round';
      for (const label of this._damageLabels) {
        const point = this.worldToScreen(label.x, label.y), age = this.time - label.born;
        if (point.x < -30 || point.x > this.width + 30 || point.y < -30 || point.y > this.height + 50) continue;
        const alpha = age < .5 ? .96 : clamp((.86 - age) / .36, 0, 1);
        const y = point.y - 17 - age * 24;
        const amount = label.amount < 1 ? label.amount.toFixed(1) : String(Math.round(label.amount));
        const text = `${label.restoring?'+':'−'}${amount}`;
        c.globalAlpha = alpha; c.lineWidth = 3.5; c.strokeStyle = '#071019'; c.strokeText(text, point.x, y);
        c.fillStyle = label.restoring ? SERVICE_COLORS.repair : label.shield ? '#a3d8ff' : '#ffe1a2'; c.fillText(text, point.x, y);
      }
      c.restore();
    }

    _drawAnnotations() {
      const c = this.ctx;
      c.save(); c.textAlign = 'center'; c.textBaseline = 'middle';
      for (const note of this._annotations.slice(0, 8)) {
        const point = this.worldToScreen(note.x, note.y);
        const outside = point.x < 10 || point.x > this.width - 10 || point.y < 10 || point.y > this.height - 10;
        if (outside) { if (note.edge) this._edgeIndicator(note.x, note.y, note.color, note.text); continue; }
        c.font = `${note.compact ? 9 : 10}px "Noto Sans KR", system-ui, sans-serif`;
        let text = String(note.text || ''), tw = c.measureText(text).width;
        const maxWidth = Math.max(70, this.width - 42);
        while (tw > maxWidth && text.length > 8) { text = text.slice(0, -2); tw = c.measureText(`${text}…`).width; }
        if (text !== note.text) text += '…';
        const w = tw + 16, h = 21;
        const x = clamp(point.x + n(note.dx), w / 2 + 8, this.width - w / 2 - 8);
        const y = clamp(point.y + n(note.dy), 15, this.height - 15);
        c.fillStyle = 'rgba(7,17,26,.91)'; rounded(c, x - w / 2, y - h / 2, w, h, 3); c.fill();
        c.strokeStyle = tint(note.color || '#8fc5ce', .23); c.lineWidth = .75; c.stroke();
        c.fillStyle = note.color || '#a1c6ce'; c.fillText(text, x, y + .5);
      }
      c.restore();
    }

    _edgeIndicator(worldX, worldY, color, text) {
      const c = this.ctx, area = this._viewportArea(), point = this.worldToScreen(worldX, worldY);
      const dx = point.x - area.cx, dy = point.y - area.cy;
      if (Math.abs(dx) + Math.abs(dy) < .01) return;
      const scale = Math.min(Math.max(18, area.w / 2 - 12) / Math.max(1, Math.abs(dx)), Math.max(18, area.h / 2 - 12) / Math.max(1, Math.abs(dy)));
      const x = area.cx + dx * scale, y = area.cy + dy * scale, a = Math.atan2(dy, dx);
      c.save(); c.translate(x, y); c.rotate(a); c.fillStyle = color || '#9bded7';
      polygon(c, [[7, 0], [-4, -4.5], [-2, 0], [-4, 4.5]]); c.fill(); c.restore();
      c.save(); c.font = '9px "Noto Sans KR", system-ui, sans-serif'; c.textBaseline = 'middle'; c.textAlign = 'center';
      const content = String(text || '').slice(0, 28), w = c.measureText(content).width + 14;
      const tx = clamp(x - Math.cos(a) * (Math.abs(dx) > Math.abs(dy) ? w / 2 + 12 : 8), w / 2 + 8, this.width - w / 2 - 8);
      const ty = clamp(y - Math.sin(a) * 22, 15, this.height - 15);
      c.fillStyle = 'rgba(7,17,26,.9)'; rounded(c, tx - w / 2, ty - 9, w, 18, 3); c.fill();
      c.fillStyle = color || '#9bded7'; c.fillText(content, tx, ty); c.restore();
    }

    _drawTargetLabel() {
      const target = this._commandTarget();
      if (!target) return;
      const c = this.ctx, point = this.worldToScreen(target.x, target.y), area = this._viewportArea();
      const color = '#f5ad96';
      if (point.x < 12 || point.x > this.width - 12 || point.y < 12 || point.y > this.height - 12) {
        this._edgeIndicator(target.x, target.y, color, '지정 표적'); return;
      }
      const name = `지정 표적 · ${this.parts[target.part.type]?.name || '모듈'}`;
      c.save(); c.font = '600 10px "Noto Sans KR", system-ui, sans-serif';
      const w = Math.min(this.width - 30, Math.max(123, c.measureText(name).width + 20)), h = 39;
      let x = point.x + 23;
      if (x + w > area.x + area.w) x = point.x - w - 23;
      x = clamp(x, 8, this.width - w - 8);
      let y = clamp(point.y - 29, area.y + 5, Math.max(area.y + 5, area.y + area.h - h - 4));
      const bounds=this._shipBounds(target.ship);
      const hullBottom=Math.max(...[[bounds.minX,bounds.minY],[bounds.maxX,bounds.minY],[bounds.maxX,bounds.maxY],[bounds.minX,bounds.maxY]].map(p=>this.worldToScreen(p[0],p[1]).y));
      if(hullBottom+14+h<area.y+area.h){x=clamp(point.x-w/2,8,this.width-w-8);y=hullBottom+14;}
      c.strokeStyle = 'rgba(242,159,133,.45)'; c.lineWidth = .8;
      if(y>point.y+15)line(c,point.x,point.y+9,clamp(point.x,x+10,x+w-10),y);
      else line(c, point.x + (x > point.x ? 9 : -9), point.y, x > point.x ? x : x + w, y + h / 2);
      c.fillStyle = 'rgba(15,21,29,.95)'; rounded(c, x, y, w, h, 4); c.fill(); c.stroke();
      c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.fillStyle = color; c.fillText(name, x + 9, y + 14);
      const hp = Math.max(0, n(target.part.hp)), max = Math.max(1, n(target.part.maxHp, this.parts[target.part.type]?.hp || 1));
      c.font = '9px ui-monospace, monospace'; c.fillStyle = '#be9f98'; c.fillText(`${Math.ceil(hp)} / ${Math.round(max)}`, x + 9, y + 29);
      const barX = x + 66, barW = Math.max(28, w - 76);
      c.fillStyle = '#3b3335'; c.fillRect(barX, y + 24, barW, 3);
      c.fillStyle = '#e99b82'; c.fillRect(barX, y + 24, barW * clamp(hp / max, 0, 1), 3);
      c.restore();
    }

    _shipLabel(ship) {
      if(!ship || ship.dead)return;
      const c=this.ctx,b=this._shipBounds(ship);
      const screenBounds=[[b.minX,b.minY],[b.maxX,b.minY],[b.maxX,b.maxY],[b.minX,b.maxY]].map(p=>this.worldToScreen(p[0],p[1]));
      const point={x:(Math.min(...screenBounds.map(p=>p.x))+Math.max(...screenBounds.map(p=>p.x)))/2,y:Math.min(...screenBounds.map(p=>p.y))};
      if(point.x< -150||point.x>this.width+150||point.y>this.height+50)return;
      const x=clamp(point.x,80,this.width-80),y=clamp(point.y-28,31,this.height-40);
      const enemy=ship.faction==='enemy',color=enemy?'#f29a86':'#87ded6';
      const fullName=String(ship.name|| (enemy?'미확인 함선':'아군 함선'));
      const name=(this.width<520&&fullName.includes('/')?fullName.split('/').pop().trim():fullName).slice(0,this.width<520?16:23);
      c.font='600 11px Inter, "Noto Sans KR", system-ui, sans-serif';
      const tw=c.measureText(name).width;
      c.fillStyle='rgba(7,15,24,.75)';rounded(c,x-tw/2-10,y-13,tw+20,20,4);c.fill();
      c.textAlign='center';c.fillStyle=color;c.fillText(name,x,y);
      const parts=(ship.parts||[]).filter(p=>p && Number.isFinite(p.maxHp));
      let total=0,remaining=0;
      for(const p of parts){total+=Math.max(0,p.maxHp);remaining+=Math.max(0,n(p.hp));}
      const observedMax=n(ship.launchHullMax)>0?ship.launchHullMax:Math.max(total,this._labelHullMaximum.get(ship.id)||0);
      this._labelHullMaximum.set(ship.id,observedMax);
      const ratio=observedMax>0?clamp(remaining/observedMax,0,1):1;
      const count=12,pipW=4,gap=2,totalW=count*(pipW+gap)-gap;
      for(let i=0;i<count;i++){
        c.fillStyle=i/count<ratio?tint(color,.65):'rgba(92,116,131,.2)';
        c.fillRect(x-totalW/2+i*(pipW+gap),y+11,pipW,2);
      }
    }

    _minimap() {
      if(this.width<520||this.height<360)return;
      const c=this.ctx,w=this.width<650?112:144,h=this.width<650?76:94;
      const x=this.width-w-17,y=this.height-h-88;
      c.fillStyle='rgba(6,15,24,.78)';rounded(c,x,y,w,h,5);c.fill();
      c.strokeStyle='rgba(99,147,167,.2)';c.lineWidth=1;c.stroke();
      c.fillStyle='#678594';c.font='8px ui-monospace,monospace';c.textAlign='left';c.fillText('TACTICAL SCAN',x+9,y+13);
      const ships=this.ships.filter(s=>!s.dead);
      if(!ships.length)return;
      const cs=Math.cos(this._cameraAngle),sn=Math.sin(this._cameraAngle);
      const rotatePoint=(px,py)=>({x:px*cs-py*sn,y:px*sn+py*cs});
      const points=ships.map(s=>rotatePoint(n(s.x),n(s.y)));
      const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x));
      const minY=Math.min(...points.map(p=>p.y)),maxY=Math.max(...points.map(p=>p.y));
      const cx=(minX+maxX)/2,cy=(minY+maxY)/2;
      const span=Math.max(1000,maxX-minX+600,(maxY-minY+500)*w/h);
      const scale=(w-20)/span,midX=x+w/2,midY=y+20+(h-24)/2;
      c.save();rounded(c,x+4,y+18,w-8,h-22,2);c.clip();
      c.strokeStyle='rgba(102,150,168,.1)';c.lineWidth=.7;line(c,x,midY,x+w,midY);line(c,midX,y+18,midX,y+h);
      const area=this._viewportArea();
      const ox=(this.width/2-area.cx)/this.view.zoom,oy=(this.height/2-area.cy)/this.view.zoom;
      const viewPoint=rotatePoint(this.view.x+ox*cs+oy*sn,this.view.y-ox*sn+oy*cs);
      const vx=midX+(viewPoint.x-cx)*scale,vy=midY+(viewPoint.y-cy)*scale;
      const vw=this.width/this.view.zoom*scale,vh=this.height/this.view.zoom*scale;
      c.strokeStyle='rgba(134,182,194,.25)';c.strokeRect(vx-vw/2,vy-vh/2,vw,vh);
      for(const s of ships){
        const point=rotatePoint(n(s.x),n(s.y));
        c.save();c.translate(midX+(point.x-cx)*scale,midY+(point.y-cy)*scale);c.rotate(n(s.angle)+this._cameraAngle);
        c.fillStyle=s.faction==='enemy'?'#e99682':'#82ded2';polygon(c,[[0,-4.5],[3.3,3],[-3.3,3]]);c.fill();c.restore();
      }
      c.restore();
    }

    _cornerDetails() {
      const c=this.ctx,z=Math.round(this.view.zoom*100);
      c.textAlign='left';c.font='9px ui-monospace, SFMono-Regular, Consolas, monospace';
      c.fillStyle='rgba(129,165,180,.56)';
      c.fillText(this.mode==='build'?'DRYDOCK / LOCAL GRID':'LIVE / TACTICAL FIELD',18,24);
      c.fillStyle='rgba(129,165,180,.46)';c.fillText(`${String(z).padStart(3,'0')}%`,18,this.height-18);
      if(this.overlay!=='normal'){
        const text=this.overlay==='heat'?'열 부하':'승무원 운송 경로';
        c.font='10px "Noto Sans KR",system-ui,sans-serif';c.fillStyle=this.overlay==='heat'?'#e4b584':'#80c8c5';
        c.fillText(text,62,this.height-18);
        if(this.overlay==='heat'){
          const gx=106,gy=this.height-25;
          const g=c.createLinearGradient(gx,0,gx+52,0);g.addColorStop(0,'#426e83');g.addColorStop(.5,'#d1b264');g.addColorStop(1,'#f17256');
          c.fillStyle=g;rounded(c,gx,gy,52,5,2);c.fill();
        }
      }
      if(this.mode==='build'){
        c.strokeStyle='rgba(111,165,183,.36)';c.lineWidth=1;
        line(c,this.width-37,24,this.width-17,24);line(c,this.width-27,14,this.width-27,34);
        c.fillStyle='#86b7c3';circle(c,this.width-27,24,1.5);c.fill();
      }
    }
  }

  window.StarRenderer = StarRenderer;
})();
