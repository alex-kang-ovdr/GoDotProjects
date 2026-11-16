/*
 * Frontier Colony — Canvas 2D world renderer.
 * All art is drawn locally; this module has no DOM work at import time.
 * Actors/effects use world-centre coordinates. Tiles, items and path nodes
 * use integer cell coordinates. The renderer never writes to game state.
 */

const TILE = 34;
const MIN_ZOOM = 0.12;
const MAX_ZOOM = 3;
const TAU = Math.PI * 2;
const FONT = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const CONDUCTORS = new Set(['solar', 'battery', 'conduit']);
const CONSUMERS = new Set(['cooler', 'heater', 'beacon']);
const BUILDING_KINDS = new Set(['wall', 'door', 'bed', 'stove', 'sandbag', 'beacon', 'researchbench', 'solar', 'battery', 'conduit', 'cooler', 'heater', 'horseshoes', 'workbench']);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const number = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;
const mix = (a, b, t) => a + (b - a) * t;
const randomAt = (x, y, seed = 0) => {
  let h = Math.imul((x | 0) ^ (seed | 0), 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};
const hashString = value => {
  let hash = 2166136261;
  for (const char of String(value ?? '')) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
};

function roundedPath(ctx, x, y, w, h, r = 0.1) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function rect(ctx, x, y, w, h, fill, radius = 0.08, stroke = null, lineWidth = 0.035) {
  roundedPath(ctx, x, y, w, h, radius);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
}

function ellipse(ctx, x, y, rx, ry, color, rotation = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rotation, 0, TAU);
  ctx.fillStyle = color;
  ctx.fill();
}

function line(ctx, x1, y1, x2, y2, color, width = 0.04) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function polygon(ctx, points, color, stroke = null, width = 0.025) {
  if (!points.length) return;
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}

function getTool(value) {
  if (value && typeof value === 'object') return { type: value.type || value.kind || 'select', kind: value.kind };
  const raw = String(value || 'select');
  const parts = raw.split(/[:/_-]/);
  if (BUILDING_KINDS.has(raw)) return { type: 'build', kind: raw };
  if (['farm', 'stockpile'].includes(raw)) return { type: 'zone', kind: raw };
  return { type: parts[0], kind: parts[1] || raw };
}

export class ColonyRenderer {
  constructor(canvas, game) {
    if (!canvas || typeof canvas.getContext !== 'function') throw new TypeError('A canvas is required.');
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    if (!this.ctx) throw new Error('Canvas 2D is not available.');
    this.game = game;
    this.camera = { x: 23, y: 16, zoom: 1 };
    this.width = 1;
    this.height = 1;
    this.dpr = 1;
    this._terrain = null;
    this._tilesSource = null;
    this._tileLookup = new Map();
    this._waterTiles = [];
    this._viewReady = false;
    this._fitMode = false;
    this._time = 0;
    this._simTime = 0;
    this._selectedId = null;
    this._selectedIds = new Set();
    this._layer = 'normal';
    this.resize();
  }

  setGame(game) {
    this.game = game;
    this._terrain = null;
    this._tilesSource = null;
    this._tileLookup.clear();
    this._waterTiles = [];
    this._initialView();
  }

  resize() {
    const bounds = this.canvas.getBoundingClientRect?.() || {};
    const width = Math.max(1, Math.round(number(bounds.width, this.canvas.clientWidth || 960)));
    const height = Math.max(1, Math.round(number(bounds.height, this.canvas.clientHeight || 640)));
    const dpr = clamp(number(globalThis.devicePixelRatio, 1), 1, 2.5);
    const changed = width !== this.width || height !== this.height || dpr !== this.dpr;
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    if (changed) {
      this.canvas.width = Math.round(width * dpr);
      this.canvas.height = Math.round(height * dpr);
    }
    if (!this._viewReady) this._initialView();
    else if (this._fitMode) this.fit();
    else this._clampCamera();
  }

  _initialView() {
    const state = this.game?.state || {};
    const cols = number(state.width, 48), rows = number(state.height, 32);
    this.camera.x = Math.min(23.5, cols / 2);
    this.camera.y = Math.min(16, rows / 2);
    // Mobile keeps recognisable pawns and furniture instead of shrinking 48 columns.
    const desiredTile = this.width < 600 ? 30 : Math.min(36, Math.max(29, this.height / 20));
    this.camera.zoom = desiredTile / TILE;
    this._viewReady = true;
    this._fitMode = false;
    this._clampCamera();
  }

  fit() {
    const state = this.game?.state || {};
    const cols = Math.max(1, number(state.width, 48)), rows = Math.max(1, number(state.height, 32));
    const padding = this.width < 600 ? 14 : 38;
    this.camera.zoom = clamp(Math.min((this.width - padding * 2) / cols, (this.height - padding * 2) / rows) / TILE, MIN_ZOOM, MAX_ZOOM);
    this.camera.x = cols / 2;
    this.camera.y = rows / 2;
    this._fitMode = true;
  }

  focus(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    this.camera.x = x;
    this.camera.y = y;
    this._fitMode = false;
    this._clampCamera();
  }

  pan(dx, dy) {
    const scale = TILE * this.camera.zoom;
    this.camera.x -= number(dx) / scale;
    this.camera.y -= number(dy) / scale;
    this._fitMode = false;
    this._clampCamera();
  }

  zoomAt(factor, clientX, clientY) {
    if (!Number.isFinite(factor) || factor <= 0) return;
    const bounds = this.canvas.getBoundingClientRect?.() || { left: 0, top: 0 };
    const px = number(clientX, bounds.left + this.width / 2) - bounds.left - this.width / 2;
    const py = number(clientY, bounds.top + this.height / 2) - bounds.top - this.height / 2;
    const oldScale = TILE * this.camera.zoom;
    const wx = this.camera.x + px / oldScale, wy = this.camera.y + py / oldScale;
    this.camera.zoom = clamp(this.camera.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    const newScale = TILE * this.camera.zoom;
    this.camera.x = wx - px / newScale;
    this.camera.y = wy - py / newScale;
    this._fitMode = false;
    this._clampCamera();
  }

  screenToTile(clientX, clientY) {
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
    const bounds = this.canvas.getBoundingClientRect?.() || { left: 0, top: 0 };
    const scale = TILE * this.camera.zoom;
    const x = Math.floor((clientX - bounds.left - this.width / 2) / scale + this.camera.x);
    const y = Math.floor((clientY - bounds.top - this.height / 2) / scale + this.camera.y);
    const state = this.game?.state || {};
    if (x < 0 || y < 0 || x >= number(state.width, 48) || y >= number(state.height, 32)) return null;
    return { x, y };
  }

  _clampCamera() {
    const state = this.game?.state || {};
    const cols = number(state.width, 48), rows = number(state.height, 32);
    const halfW = this.width / (TILE * this.camera.zoom * 2), halfH = this.height / (TILE * this.camera.zoom * 2);
    this.camera.x = halfW > cols / 2 ? cols / 2 : clamp(this.camera.x, halfW - 1.5, cols - halfW + 1.5);
    this.camera.y = halfH > rows / 2 ? rows / 2 : clamp(this.camera.y, halfH - 1.5, rows - halfH + 1.5);
  }

  _tile(x, y) { return this._tileLookup.get(`${x},${y}`) || null; }

  _prepareTerrain(state) {
    const cols = number(state.width, 48), rows = number(state.height, 32);
    const tiles = Array.isArray(state.tiles) ? state.tiles : [];
    const key = `${cols}:${rows}:${number(state.seed)}`;
    if (this._tilesSource === tiles && this._terrainKey === key) return;
    this._tilesSource = tiles;
    this._terrainKey = key;
    this._tileLookup.clear();
    this._waterTiles = [];
    for (const tile of tiles) {
      if (!tile || !Number.isFinite(tile.x) || !Number.isFinite(tile.y)) continue;
      this._tileLookup.set(`${tile.x},${tile.y}`, tile);
      if (tile.terrain === 'water') this._waterTiles.push(tile);
    }
    let surface = null;
    if (typeof globalThis.OffscreenCanvas === 'function') surface = new globalThis.OffscreenCanvas(cols * 48, rows * 48);
    else if (this.canvas.ownerDocument?.createElement) {
      surface = this.canvas.ownerDocument.createElement('canvas');
      surface.width = cols * 48;
      surface.height = rows * 48;
    }
    if (surface) {
      const ctx = surface.getContext('2d', { alpha: false });
      ctx.setTransform(48, 0, 0, 48, 0, 0);
      this._paintTerrain(ctx, state);
      this._terrain = surface;
    } else this._terrain = null;
  }

  _paintTerrain(ctx, state) {
    const cols = number(state.width, 48), rows = number(state.height, 32), seed = number(state.seed);
    const grass = ctx.createLinearGradient(0, 0, cols, rows);
    grass.addColorStop(0, '#718969');
    grass.addColorStop(0.48, '#839369');
    grass.addColorStop(1, '#657c5e');
    ctx.fillStyle = grass;
    ctx.fillRect(0, 0, cols, rows);

    // Broad overlapping patches and scattered blades keep the terrain organic.
    for (let i = 0; i < 100; i++) {
      const x = randomAt(i, 70, seed) * cols, y = randomAt(i, 71, seed) * rows;
      const r = 1.3 + randomAt(i, 72, seed) * 3.8;
      const patch = ctx.createRadialGradient(x, y, 0, x, y, r);
      patch.addColorStop(0, i % 3 ? 'rgba(43,83,61,0.13)' : 'rgba(197,180,116,0.13)');
      patch.addColorStop(1, 'rgba(90,128,76,0)');
      ctx.fillStyle = patch;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const tile = this._tile(x, y), terrain = tile?.terrain || 'grass';
      const a = randomAt(x, y, seed), b = randomAt(x + 170, y, seed);
      if (terrain === 'water') continue;
      if (terrain === 'soil') {
        ellipse(ctx, x + 0.5, y + 0.52, 0.65, 0.56, 'rgba(155,132,86,0.24)', a * 0.4);
        for (let k = 0; k < 4; k++) ellipse(ctx, x + randomAt(x * 4 + k, y, seed), y + randomAt(x, y * 4 + k, seed), 0.022, 0.017, 'rgba(79,74,51,0.28)');
      } else if (terrain === 'stone') {
        polygon(ctx, [[x - 0.02, y + 0.1], [x + 0.55, y - 0.04], [x + 1.03, y + 0.16], [x + 1.02, y + 0.91], [x + 0.5, y + 1.04], [x - 0.03, y + 0.8]], a > 0.5 ? '#7f8a77' : '#89917c');
        line(ctx, x + 0.13, y + 0.66, x + 0.72, y + 0.35, 'rgba(61,78,67,.18)', 0.025);
      }
      for (let k = 0; k < 3; k++) {
        const gx = x + randomAt(x * 3 + k, y + 101, seed), gy = y + randomAt(x + 55, y * 3 + k, seed);
        const height = 0.065 + randomAt(x + k, y + 321, seed) * 0.09;
        line(ctx, gx, gy, gx - 0.045, gy - height, a > 0.44 ? 'rgba(43,82,51,.24)' : 'rgba(203,211,147,.29)', 0.022);
        if (k === 1) line(ctx, gx, gy, gx + 0.06, gy - height * 0.7, 'rgba(70,100,55,.26)', 0.022);
      }
      if (b > 0.965) {
        ellipse(ctx, x + 0.24, y + 0.53, 0.035, 0.027, '#d5c790');
        ellipse(ctx, x + 0.38, y + 0.41, 0.025, 0.023, '#e1d4a1');
      }
    }

    this._paintCampFloor(ctx);
    const water = ctx.createLinearGradient(0, 0, cols * 0.7, rows);
    water.addColorStop(0, '#427f83');
    water.addColorStop(0.55, '#396f77');
    water.addColorStop(1, '#2f6570');
    for (const tile of this._waterTiles) {
      const { x, y } = tile;
      const n = this._tile(x, y - 1)?.terrain === 'water';
      const e = this._tile(x + 1, y)?.terrain === 'water';
      const s = this._tile(x, y + 1)?.terrain === 'water';
      const w = this._tile(x - 1, y)?.terrain === 'water';
      ctx.lineCap = 'round';
      if (!n) line(ctx, x + 0.03, y, x + 0.97, y, '#a5ab7b', 0.22);
      if (!s) line(ctx, x + 0.03, y + 1, x + 0.97, y + 1, '#405c4c', 0.2);
      if (!w) line(ctx, x, y + 0.02, x, y + 0.98, '#9ca779', 0.2);
      if (!e) line(ctx, x + 1, y + 0.02, x + 1, y + 0.98, '#426352', 0.18);
      this._waterCellPath(ctx, x, y, n, e, s, w);
      ctx.fillStyle = water;
      ctx.fill();
      if (!w) line(ctx, x + 0.08, y + 0.23, x + 0.06, y + 0.77, 'rgba(171,205,179,.35)', 0.025);
      if (!n) line(ctx, x + 0.23, y + 0.08, x + 0.78, y + 0.07, 'rgba(171,205,179,.28)', 0.025);
    }
  }

  _paintCampFloor(ctx) {
    // Decorative remains of the starting shelter; they have no simulation rules.
    const eligible = this._tile(22, 14);
    if (!eligible || eligible.terrain === 'water') return;
    ellipse(ctx, 23.4, 16.3, 6.7, 5.8, 'rgba(161,143,98,.23)');
    for (let y = 12; y <= 17; y++) for (let x = 20; x <= 26; x++) {
      if (this._tile(x, y)?.terrain === 'water') continue;
      const value = randomAt(x, y, 170);
      ctx.fillStyle = value > 0.5 ? '#9e8b64' : '#a5926b';
      ctx.fillRect(x, y, 1, 1);
      for (let row = 0; row < 3; row++) {
        line(ctx, x, y + row / 3, x + 1, y + row / 3, 'rgba(77,64,46,.24)', 0.025);
        const seam = (x + y + row) % 2 ? 0.68 : 0.28;
        line(ctx, x + seam, y + row / 3 + 0.025, x + seam, y + (row + 1) / 3 - 0.025, 'rgba(74,64,46,.22)', 0.02);
        line(ctx, x + 0.08, y + row / 3 + 0.12, x + 0.48, y + row / 3 + 0.11, 'rgba(197,180,131,.20)', 0.018);
      }
    }
    rect(ctx, 19.96, 11.96, 7.08, 6.08, null, 0.04, 'rgba(68,59,42,.36)', 0.07);
    // A worn footpath leads away from the open side of the shelter.
    for (let i = 0; i < 7; i++) ellipse(ctx, 24.6 + Math.sin(i * 0.7) * 0.3, 18.2 + i * 0.63, 0.73, 0.48, 'rgba(173,155,105,.16)');
  }

  _waterCellPath(ctx, x, y, n, e, s, w) {
    const tl = !n && !w ? 0.25 : 0, tr = !n && !e ? 0.25 : 0;
    const br = !s && !e ? 0.25 : 0, bl = !s && !w ? 0.25 : 0;
    ctx.beginPath();
    ctx.moveTo(x + tl, y);
    ctx.lineTo(x + 1 - tr, y);
    ctx.quadraticCurveTo(x + 1, y, x + 1, y + tr);
    ctx.lineTo(x + 1, y + 1 - br);
    ctx.quadraticCurveTo(x + 1, y + 1, x + 1 - br, y + 1);
    ctx.lineTo(x + bl, y + 1);
    ctx.quadraticCurveTo(x, y + 1, x, y + 1 - bl);
    ctx.lineTo(x, y + tl);
    ctx.quadraticCurveTo(x, y, x + tl, y);
    ctx.closePath();
  }

  render({ selectedId = null, selectedIds = [], tool = 'select', hover = null, showGrid = false, showZones = true, layer = 'normal', previewTiles = [], time = 0 } = {}) {
    const state = this.game?.state || {};
    this._time = number(time) / 1000;
    this._simTime = number(state.time);
    this._selectedId = selectedId;
    this._selectedIds = new Set(Array.isArray(selectedIds) ? selectedIds : []);
    if (selectedId !== null) this._selectedIds.add(selectedId);
    this._layer = ['temperature', 'power'].includes(layer) ? layer : 'normal';
    this._hover = hover;
    this._prepareTerrain(state);
    const ctx = this.ctx, scale = TILE * this.camera.zoom;
    const cols = number(state.width, 48), rows = number(state.height, 32);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#17282a';
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.save();
    ctx.translate(this.width / 2, this.height / 2);
    ctx.scale(scale, scale);
    ctx.translate(-this.camera.x, -this.camera.y);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (this._terrain) ctx.drawImage(this._terrain, 0, 0, cols, rows);
    else this._paintTerrain(ctx, state);
    this._visible = {
      minX: this.camera.x - this.width / scale / 2 - 2,
      maxX: this.camera.x + this.width / scale / 2 + 2,
      minY: this.camera.y - this.height / scale / 2 - 2,
      maxY: this.camera.y + this.height / scale / 2 + 3
    };
    this._drawWaterMovement(ctx);

    const tiles = Array.isArray(state.tiles) ? state.tiles : [];
    for (const tile of tiles) {
      if (!tile || !this._isVisible(tile.x, tile.y)) continue;
      if (tile.zone === 'farm' || tile.crop) this._drawFarm(ctx, tile);
      if (tile.zone === 'stockpile') this._drawPallet(ctx, tile);
      if (tile.burned) this._drawBurnedGround(ctx, tile);
    }
    this._drawRooms(ctx, tiles);
    if (this._layer === 'temperature') this._drawTemperature(ctx, tiles);
    this._drawPowerLinks(ctx, tiles, hover, getTool(tool));
    if (showZones) this._drawZones(ctx, tiles);
    if (showGrid) this._drawGrid(ctx, cols, rows);

    const pawns = Array.isArray(state.colonists) ? state.colonists : [];
    const raiders = Array.isArray(state.raiders) ? state.raiders : [];
    this._pawnById = new Map(pawns.filter(Boolean).map(pawn => [pawn.id, pawn]));
    for (const pawn of [...pawns, ...raiders]) if (pawn && this._selectedIds.has(pawn.id)) this._drawSelectedPath(ctx, pawn);
    const drawables = [];
    for (const tile of tiles) {
      if (!tile || !this._isVisible(tile.x, tile.y)) continue;
      if (tile.feature) drawables.push({ y: tile.y + 0.75, order: 1, type: 'feature', tile });
      if (tile.building) drawables.push({ y: tile.y + 0.85, order: 2, type: 'building', tile });
      if (number(tile.fire) > 0) drawables.push({ y: tile.y + 0.94, order: 5, type: 'fire', tile });
    }
    for (const item of state.items || []) if (item && this._isVisible(item.x, item.y)) drawables.push({ y: item.y + 0.7, order: 3, type: 'item', item });
    for (const pawn of pawns) if (pawn && this._isVisible(pawn.x, pawn.y)) {
      const carrier = pawn.carriedBy && this._pawnById.get(pawn.carriedBy);
      if (carrier && !carrier.dead && carrier.carryingPawnId === pawn.id) continue;
      drawables.push({ y: pawn.y + 0.17, order: 4, type: 'pawn', pawn });
    }
    for (const pawn of raiders) if (pawn && this._isVisible(pawn.x, pawn.y)) drawables.push({ y: pawn.y + 0.17, order: 4, type: 'raider', pawn });
    const visitor = state.trade?.visitor;
    if (visitor && this._isVisible(visitor.x, visitor.y)) drawables.push({ y: visitor.y + 0.18, order: 4, type: 'trader', visitor });
    drawables.sort((a, b) => a.y - b.y || a.order - b.order);
    for (const entry of drawables) {
      if (entry.type === 'feature') this._drawFeature(ctx, entry.tile, number(state.seed));
      else if (entry.type === 'building') this._drawBuilding(ctx, entry.tile, pawns, state);
      else if (entry.type === 'item') this._drawItem(ctx, entry.item);
      else if (entry.type === 'fire') this._drawFire(ctx, entry.tile);
      else if (entry.type === 'trader') this._drawTrader(ctx, entry.visitor);
      else this._drawPawn(ctx, entry.pawn, entry.type === 'raider', state);
    }
    for (const tile of tiles) if (number(tile?.fire) > 0 && this._isVisible(tile.x, tile.y)) this._drawSmoke(ctx, tile);
    for (const tile of tiles) if (tile?.designation && this._isVisible(tile.x, tile.y)) this._drawDesignation(ctx, tile);
    for (const effect of state.effects || []) if (effect) this._drawEffect(ctx, effect);

    // Night remains readable: this is a tint, never an opaque darkness mask.
    let hour = ((this._simTime / 120 * 24 + 8) % 24 + 24) % 24;
    if (typeof this.game?.getSummary === 'function') {
      const summary = this.game.getSummary();
      if (Number.isFinite(summary?.hour)) hour = summary.hour;
    }
    const night = clamp((Math.cos((hour - 1) / 24 * TAU) - 0.05) * 0.23, 0, 0.2);
    if (night > 0) {
      ctx.fillStyle = `rgba(16,34,61,${night})`;
      ctx.fillRect(0, 0, cols, rows);
    }
    const parsedTool = getTool(tool);
    const preview = Array.isArray(previewTiles) ? previewTiles : [];
    for (const tile of preview) if (tile && Number.isFinite(tile.x) && Number.isFinite(tile.y) && this._isVisible(tile.x, tile.y)) this._drawHover(ctx, tile, parsedTool);
    if (hover && Number.isFinite(hover.x) && Number.isFinite(hover.y) && !preview.some(tile => tile?.x === hover.x && tile?.y === hover.y)) this._drawHover(ctx, hover, parsedTool);
    ctx.restore();

    this._drawNameplates(ctx, pawns, raiders, selectedId);
    if (visitor) this._drawTraderLabel(ctx, visitor);
    if (this._layer === 'temperature') this._drawRoomLabels(ctx, state.rooms || []);
    this._drawWeather(ctx, state.weather);
    this._drawVignette(ctx);
  }

  _isVisible(x, y) {
    const v = this._visible;
    return Number.isFinite(x) && Number.isFinite(y) && (!v || (x > v.minX && x < v.maxX && y > v.minY && y < v.maxY));
  }

  _drawWaterMovement(ctx) {
    const time = this._time;
    for (const tile of this._waterTiles) {
      if (!this._isVisible(tile.x, tile.y)) continue;
      const r = randomAt(tile.x, tile.y, 519);
      if (r < 0.42) continue;
      const phase = (time * 0.08 + r) % 1;
      const alpha = Math.sin(phase * Math.PI) * 0.2;
      const x = tile.x + 0.16 + r * 0.25, y = tile.y + 0.15 + phase * 0.65;
      line(ctx, x, y, x + 0.25 + r * 0.23, y - 0.035, `rgba(196,225,212,${alpha})`, 0.025);
      if (r > 0.8) line(ctx, x + 0.08, y + 0.09, x + 0.23, y + 0.07, `rgba(196,225,212,${alpha * 0.6})`, 0.018);
    }
  }

  _drawBurnedGround(ctx, tile) {
    const x = tile.x + 0.5, y = tile.y + 0.5, seed = randomAt(tile.x, tile.y, 719);
    ctx.save();
    ellipse(ctx, x, y + 0.035, 0.48, 0.4, 'rgba(52,52,39,.36)', seed * 0.4);
    ellipse(ctx, x - 0.06, y + 0.02, 0.32, 0.27, 'rgba(52,45,35,.24)', -seed * 0.5);
    for (let k = 0; k < 5; k++) {
      const angle = k * 2.4 + seed, radius = 0.12 + (k % 3) * 0.1;
      const px = x + Math.cos(angle) * radius, py = y + Math.sin(angle) * radius;
      line(ctx, px, py, px + 0.08, py - 0.045, k % 2 ? 'rgba(204,191,150,.24)' : 'rgba(36,43,32,.45)', 0.024);
    }
    ctx.restore();
  }

  _drawFire(ctx, tile) {
    const strength = clamp(number(tile.fire), 0, 1), x = tile.x + 0.5, y = tile.y + 0.62;
    const phase = randomAt(tile.x, tile.y, 401) * TAU;
    const flicker = Math.sin(this._time * 8 + phase) * 0.045;
    const size = 0.45 + strength * 0.65;
    ctx.save(); ctx.translate(x, y);
    const glow = ctx.createRadialGradient(0, -0.15, 0, 0, -0.15, 0.9);
    glow.addColorStop(0, `rgba(247,155,64,${0.19 + strength * 0.17})`);
    glow.addColorStop(1, 'rgba(247,155,64,0)');
    ctx.fillStyle = glow; ctx.fillRect(-0.9, -1.05, 1.8, 1.8);
    ellipse(ctx, 0, 0.04, 0.35 + strength * 0.09, 0.14, 'rgba(89,55,31,.7)');
    const flame = (px, py, width, height, color, sway) => {
      ctx.beginPath(); ctx.moveTo(px - width * 0.45, py);
      ctx.bezierCurveTo(px - width * 0.95, py - height * 0.35, px + sway - width * 0.07, py - height * 0.63, px + sway, py - height);
      ctx.bezierCurveTo(px + width * 0.1 + sway, py - height * 0.55, px + width * 0.65, py - height * 0.43, px + width * 0.45, py);
      ctx.quadraticCurveTo(px, py + height * 0.14, px - width * 0.45, py);
      ctx.fillStyle = color; ctx.fill();
    };
    flame(-0.17, 0.035, 0.35, size * 0.71, '#cd6d39', -0.05 - flicker);
    flame(0.15, 0.04, 0.4, size * 0.83, '#e38c42', 0.04 + flicker);
    flame(-0.015, 0.035, 0.43, size + flicker, '#f2ad55', -0.025 + flicker);
    flame(0.015, 0.045, 0.27, size * 0.62, '#f8d17b', -flicker);
    flame(-0.015, 0.055, 0.12, size * 0.29, '#fff0b4', 0.01);
    for (let k = 0; k < 3; k++) {
      const rise = (this._time * 0.55 + phase + k / 3) % 1;
      const px = Math.sin(phase + k * 2 + rise * 3) * (0.15 + rise * 0.18);
      ellipse(ctx, px, -0.2 - rise * 1.05, 0.015, 0.026, `rgba(250,204,112,${(1 - rise) * strength * 0.8})`);
    }
    ctx.restore();
  }

  _drawSmoke(ctx, tile) {
    const strength = clamp(number(tile.fire), 0, 1), phase = randomAt(tile.x, tile.y, 728);
    ctx.save();
    for (let k = 0; k < 3; k++) {
      const rise = (this._time * 0.2 + phase + k / 3) % 1;
      const x = tile.x + 0.5 + rise * 0.26 + Math.sin(rise * 3 + phase * 5) * 0.09;
      const y = tile.y + 0.1 - rise * 1.7;
      const radius = 0.12 + rise * 0.29;
      ellipse(ctx, x, y, radius, radius * 0.75, `rgba(69,76,65,${Math.sin(rise * Math.PI) * (0.1 + strength * 0.12)})`);
    }
    ctx.restore();
  }

  _drawFarm(ctx, tile) {
    const { x, y } = tile;
    rect(ctx, x + 0.025, y + 0.025, 0.95, 0.95, '#746544', 0.075);
    for (let row = 0; row < 3; row++) {
      line(ctx, x + 0.12, y + 0.2 + row * 0.28, x + 0.89, y + 0.2 + row * 0.28, '#564d36', 0.055);
      line(ctx, x + 0.12, y + 0.235 + row * 0.28, x + 0.89, y + 0.235 + row * 0.28, 'rgba(176,149,91,.35)', 0.026);
    }
    if (!tile.crop) return;
    const growth = clamp(number(tile.crop.growth), 0, 1);
    for (let row = 0; row < 2; row++) for (let col = 0; col < 3; col++) {
      const px = x + 0.23 + col * 0.265, py = y + 0.37 + row * 0.4;
      const stem = 0.06 + growth * 0.27;
      const sway = Math.sin(this._time * 1.2 + x + row + col) * 0.012 * growth;
      line(ctx, px, py, px + sway, py - stem, growth > 0.82 ? '#e0c477' : '#9bba66', 0.03);
      ellipse(ctx, px - 0.047 + sway, py - stem * 0.6, 0.07 + growth * 0.025, 0.031, growth > 0.82 ? '#c0ad59' : '#6fa357', -0.5);
      ellipse(ctx, px + 0.05 + sway, py - stem * 0.8, 0.065 + growth * 0.025, 0.029, growth > 0.82 ? '#d4c16e' : '#9fbd6b', 0.5);
      if (growth > 0.82) ellipse(ctx, px + sway, py - stem - 0.012, 0.035, 0.08, '#e1c97a', 0.1);
    }
  }

  _drawPallet(ctx, tile) {
    const { x, y } = tile;
    rect(ctx, x + 0.08, y + 0.15, 0.84, 0.75, 'rgba(73,62,44,.18)', 0.04);
    for (let row = 0; row < 4; row++) rect(ctx, x + 0.09, y + 0.12 + row * 0.18, 0.82, 0.13, 'rgba(158,135,86,.46)', 0.015);
  }

  _drawZones(ctx, tiles) {
    ctx.save();
    ctx.setLineDash([0.12, 0.09]);
    ctx.lineWidth = 0.035;
    for (const tile of tiles) {
      if (!tile?.zone || !this._isVisible(tile.x, tile.y)) continue;
      const { x, y, zone } = tile;
      ctx.strokeStyle = zone === 'farm' ? 'rgba(174,205,126,.8)' : 'rgba(228,190,116,.8)';
      ctx.beginPath();
      if (this._tile(x, y - 1)?.zone !== zone) { ctx.moveTo(x + 0.03, y + 0.045); ctx.lineTo(x + 0.97, y + 0.045); }
      if (this._tile(x + 1, y)?.zone !== zone) { ctx.moveTo(x + 0.955, y + 0.03); ctx.lineTo(x + 0.955, y + 0.97); }
      if (this._tile(x, y + 1)?.zone !== zone) { ctx.moveTo(x + 0.03, y + 0.955); ctx.lineTo(x + 0.97, y + 0.955); }
      if (this._tile(x - 1, y)?.zone !== zone) { ctx.moveTo(x + 0.045, y + 0.03); ctx.lineTo(x + 0.045, y + 0.97); }
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawRooms(ctx, tiles) {
    // A cutaway roof is indicated on the floor, keeping furniture and people clear.
    ctx.save();
    for (const tile of tiles) {
      if (!tile?.roofed || !this._isVisible(tile.x, tile.y)) continue;
      const { x, y, roomId } = tile;
      ctx.fillStyle = 'rgba(226,224,194,.095)';
      ctx.fillRect(x, y, 1, 1);
      line(ctx, x + 0.04, y + 0.94, x + 0.96, y + 0.94, 'rgba(39,55,47,.09)', 0.018);
      const edge = 'rgba(226,220,175,.32)';
      if (this._tile(x, y - 1)?.roomId !== roomId) line(ctx, x + 0.03, y + 0.04, x + 0.97, y + 0.04, edge, 0.038);
      if (this._tile(x + 1, y)?.roomId !== roomId) line(ctx, x + 0.96, y + 0.03, x + 0.96, y + 0.97, edge, 0.038);
      if (this._tile(x, y + 1)?.roomId !== roomId) line(ctx, x + 0.03, y + 0.96, x + 0.97, y + 0.96, edge, 0.038);
      if (this._tile(x - 1, y)?.roomId !== roomId) line(ctx, x + 0.04, y + 0.03, x + 0.04, y + 0.97, edge, 0.038);
    }
    ctx.restore();
  }

  _drawTemperature(ctx, tiles) {
    ctx.save();
    for (const tile of tiles) {
      if (!tile || !Number.isFinite(tile.temperature) || !this._isVisible(tile.x, tile.y)) continue;
      const value = tile.temperature;
      const hue = value <= 0 ? clamp(205 - value * 2, 205, 240)
        : value <= 8 ? mix(205, 170, value / 8)
          : value <= 21 ? mix(170, 75, (value - 8) / 13)
            : mix(75, 4, clamp((value - 21) / 24, 0, 1));
      ctx.fillStyle = `hsla(${hue},66%,56%,${tile.roofed ? 0.39 : 0.25})`;
      ctx.fillRect(tile.x, tile.y, 1.005, 1.005);
    }
    ctx.restore();
  }

  _isConductor(tile) {
    return Boolean(tile?.building?.complete && number(tile.building.hp, 1) > 0 && CONDUCTORS.has(tile.building.type));
  }

  _nearestConductor(tile, nodes, networkId = undefined) {
    let nearest = null, distance = 4;
    for (const node of nodes) {
      if (networkId !== undefined && node.building.networkId !== networkId) continue;
      const nextDistance = Math.abs(tile.x - node.x) + Math.abs(tile.y - node.y);
      if (nextDistance > 3) continue;
      if (nextDistance < distance || (nextDistance === distance && (!nearest || node.y < nearest.y || (node.y === nearest.y && node.x < nearest.x)))) {
        nearest = node; distance = nextDistance;
      }
    }
    return nearest;
  }

  _drawPowerLinks(ctx, tiles, hover, tool) {
    const expanded = this._layer === 'power';
    const nodes = tiles.filter(tile => this._isConductor(tile));
    ctx.save();
    for (const tile of nodes) {
      if (!this._isVisible(tile.x, tile.y)) continue;
      const { x, y, building } = tile;
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const next = this._tile(x + dx, y + dy);
        if (!this._isConductor(next)) continue;
        const active = building.powered && next.building.powered;
        const color = expanded ? active ? '#9ce2d3' : '#b6aaa0' : active ? '#bead74' : '#8f8770';
        line(ctx, x + 0.5, y + 0.52, x + dx + 0.5, y + dy + 0.52, 'rgba(34,52,44,.64)', expanded ? 0.14 : 0.095);
        line(ctx, x + 0.5, y + 0.5, x + dx + 0.5, y + dy + 0.5, color, expanded ? 0.065 : 0.033);
        if (expanded && active) {
          ctx.setLineDash([0.065, 0.2]); ctx.lineDashOffset = -this._time * 0.4;
          line(ctx, x + 0.5, y + 0.5, x + dx + 0.5, y + dy + 0.5, '#e6ffdf', 0.06);
          ctx.setLineDash([]);
        }
      }
    }
    for (const tile of tiles) {
      const building = tile?.building;
      if (!building?.complete || !CONSUMERS.has(building.type) || building.networkId == null || !this._isVisible(tile.x, tile.y)) continue;
      if (!expanded && !(hover?.x === tile.x && hover?.y === tile.y)) continue;
      const node = this._nearestConductor(tile, nodes, building.networkId);
      if (!node) continue;
      ctx.setLineDash([0.1, 0.11]);
      ctx.lineDashOffset = building.powered ? -this._time * 0.22 : 0;
      line(ctx, tile.x + 0.5, tile.y + 0.5, node.x + 0.5, node.y + 0.5, building.powered ? 'rgba(174,242,220,.8)' : 'rgba(223,160,119,.7)', 0.045);
      ctx.setLineDash([]);
    }
    const hovered = hover && this._tile(hover.x, hover.y);
    const preview = tool.type === 'build' && (CONDUCTORS.has(tool.kind) || CONSUMERS.has(tool.kind));
    const hoverPower = expanded && (CONDUCTORS.has(hovered?.building?.type) || CONSUMERS.has(hovered?.building?.type));
    if (hovered && (preview || hoverPower)) {
      const { x, y } = hovered;
      ctx.setLineDash([0.12, 0.09]);
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > 3 || !this._tile(x + dx, y + dy)) continue;
        ctx.fillStyle = 'rgba(168,225,210,.055)'; ctx.fillRect(x + dx, y + dy, 1, 1);
        for (const [ex, ey] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
          if (Math.abs(dx + ex) + Math.abs(dy + ey) <= 3) continue;
          const px = x + dx, py = y + dy, color = 'rgba(189,232,211,.65)';
          if (ey === -1) line(ctx, px, py, px + 1, py, color, 0.03);
          else if (ey === 1) line(ctx, px, py + 1, px + 1, py + 1, color, 0.03);
          else if (ex === -1) line(ctx, px, py, px, py + 1, color, 0.03);
          else line(ctx, px + 1, py, px + 1, py + 1, color, 0.03);
        }
      }
      ctx.setLineDash([]);
      if (preview && CONSUMERS.has(tool.kind)) {
        const node = this._nearestConductor(hovered, nodes);
        if (node) line(ctx, x + 0.5, y + 0.5, node.x + 0.5, node.y + 0.5, '#c9ecd7', 0.06);
      }
    }
    ctx.restore();
  }

  _drawRoomLabels(ctx, rooms) {
    const tiles = this.game?.state?.tiles || [], scale = TILE * this.camera.zoom;
    if (scale < 13 || !Array.isArray(rooms)) return;
    ctx.save();
    ctx.font = `600 ${this.width < 600 ? 10 : 11}px ${FONT}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const room of rooms) {
      if (!Array.isArray(room?.tiles) || !room.tiles.length || !Number.isFinite(room.temperature)) continue;
      const members = room.tiles.map(index => tiles[index]).filter(Boolean);
      if (!members.length) continue;
      const x = members.reduce((sum, tile) => sum + tile.x + 0.5, 0) / members.length;
      const y = members.reduce((sum, tile) => sum + tile.y + 0.5, 0) / members.length;
      if (!this._isVisible(x, y)) continue;
      const point = this._screenPoint(x, y);
      const label = `${room.temperature.toFixed(1)}°C${scale >= 23 ? ` · ${room.area}칸` : ''}`;
      const width = ctx.measureText(label).width + 20;
      rect(ctx, point.x - width / 2, point.y - 10, width, 21, 'rgba(25,46,47,.88)', 6, 'rgba(202,229,205,.4)', 1);
      ctx.fillStyle = room.temperature <= 8 ? '#bce8ed' : room.temperature > 30 ? '#f4c69b' : '#e5ead0';
      ctx.fillText(label, point.x, point.y + 0.5);
    }
    ctx.restore();
  }

  _drawGrid(ctx, cols, rows) {
    ctx.beginPath();
    for (let x = Math.max(0, Math.floor(this._visible.minX)); x <= Math.min(cols, Math.ceil(this._visible.maxX)); x++) { ctx.moveTo(x, 0); ctx.lineTo(x, rows); }
    for (let y = Math.max(0, Math.floor(this._visible.minY)); y <= Math.min(rows, Math.ceil(this._visible.maxY)); y++) { ctx.moveTo(0, y); ctx.lineTo(cols, y); }
    ctx.strokeStyle = 'rgba(239,236,206,.14)';
    ctx.lineWidth = 1 / (TILE * this.camera.zoom);
    ctx.stroke();
  }

  _drawFeature(ctx, tile, seed) {
    const x = tile.x + 0.5, y = tile.y + 0.5;
    const r = randomAt(tile.x, tile.y, seed);
    if (tile.feature === 'tree') {
      ellipse(ctx, x + 0.23, y + 0.2, 0.7, 0.3, 'rgba(26,49,36,.23)', -0.15);
      rect(ctx, x - 0.07, y - 0.04, 0.14, 0.42, '#65503a', 0.025);
      line(ctx, x + 0.01, y + 0.05, x + 0.025, y + 0.32, '#a28a59', 0.027);
      const sway = Math.sin(this._time * 0.85 + r * 10) * 0.022;
      ctx.save();
      ctx.translate(sway, 0);
      if (r < 0.38) {
        const layers = [
          { y: y - 0.13, w: 0.65, h: 0.79, color: '#315e4c' },
          { y: y - 0.41, w: 0.5, h: 0.7, color: '#3e7355' },
          { y: y - 0.68, w: 0.34, h: 0.62, color: '#59885e' }
        ];
        for (const layer of layers) {
          polygon(ctx, [[x, layer.y - layer.h * 0.55], [x + layer.w * 0.63, layer.y + layer.h * 0.2], [x + layer.w * 0.43, layer.y + layer.h * 0.18], [x + layer.w, layer.y + layer.h * 0.55], [x + 0.1, layer.y + layer.h * 0.45], [x - layer.w * 0.82, layer.y + layer.h * 0.53], [x - layer.w * 0.53, layer.y + layer.h * 0.14]], layer.color);
          line(ctx, x - layer.w * 0.39, layer.y + 0.12, x - 0.03, layer.y - layer.h * 0.32, 'rgba(159,181,103,.2)', 0.033);
        }
      } else {
        const tint = r > 0.87;
        ellipse(ctx, x, y - 0.32, 0.64, 0.6, tint ? '#687b49' : '#3c6b50');
        ellipse(ctx, x - 0.28, y - 0.37, 0.39, 0.38, tint ? '#849351' : '#578656');
        ellipse(ctx, x + 0.27, y - 0.38, 0.4, 0.43, tint ? '#6e864a' : '#477a55');
        ellipse(ctx, x - 0.01, y - 0.65, 0.46, 0.36, tint ? '#9da55b' : '#6b985e');
        ellipse(ctx, x - 0.24, y - 0.65, 0.24, 0.21, tint ? '#b4b56b' : '#81a76c');
        ellipse(ctx, x + 0.13, y - 0.13, 0.36, 0.3, tint ? '#667a45' : '#3d704e');
        for (let k = 0; k < 5; k++) {
          const a = k * 1.35 + r;
          ellipse(ctx, x + Math.cos(a) * 0.36, y - 0.45 + Math.sin(a) * 0.28, 0.075, 0.037, tint ? 'rgba(204,205,132,.28)' : 'rgba(166,196,120,.24)', a);
        }
      }
      ctx.restore();
    } else if (tile.feature === 'berry') {
      ellipse(ctx, x + 0.06, y + 0.2, 0.43, 0.2, 'rgba(33,55,33,.2)');
      ellipse(ctx, x - 0.12, y, 0.3, 0.29, '#486f46');
      ellipse(ctx, x + 0.17, y - 0.05, 0.27, 0.28, '#5c8750');
      ellipse(ctx, x - 0.03, y - 0.18, 0.25, 0.23, '#759653');
      for (let k = 0; k < 6; k++) {
        const a = k * 2.4 + r;
        ellipse(ctx, x + Math.cos(a) * 0.27, y - 0.07 + Math.sin(a) * 0.2, 0.044, 0.043, k % 2 ? '#c96c61' : '#9d4e56');
      }
    } else if (tile.feature === 'ore') {
      ellipse(ctx, x + 0.09, y + 0.22, 0.49, 0.24, 'rgba(35,51,45,.24)');
      polygon(ctx, [[x - 0.44, y + 0.15], [x - 0.3, y - 0.26], [x - 0.04, y - 0.42], [x + 0.37, y - 0.27], [x + 0.47, y + 0.17], [x + 0.15, y + 0.32]], '#7a8b85', '#52685f', 0.04);
      polygon(ctx, [[x - 0.3, y - 0.26], [x - 0.04, y - 0.42], [x + 0.2, y - 0.18], [x - 0.08, y + 0.05]], '#a0afa1');
      polygon(ctx, [[x - 0.08, y + 0.05], [x + 0.2, y - 0.18], [x + 0.47, y + 0.17], [x + 0.15, y + 0.32]], '#687d77');
      line(ctx, x - 0.24, y + 0.08, x - 0.01, y - 0.15, '#b2c9ba', 0.055);
      line(ctx, x + 0.06, y + 0.16, x + 0.22, y - 0.02, '#a1c4bc', 0.047);
      ellipse(ctx, x - 0.38, y + 0.26, 0.13, 0.09, '#8a9989');
    }
  }

  _drawBuilding(ctx, tile, pawns, state) {
    const building = tile.building;
    if (!building) return;
    if (!building.complete) { this._drawBlueprint(ctx, tile.x, tile.y, building.type, number(building.progress)); return; }
    const { x, y } = tile;
    ctx.save();
    ctx.translate(x + 0.5, y + 0.5);
    if (building.type === 'wall') {
      const connects = (dx, dy) => {
        const other = this._tile(x + dx, y + dy)?.building;
        return other?.complete && (other.type === 'wall' || other.type === 'door');
      };
      const n = connects(0, -1), e = connects(1, 0), s = connects(0, 1), w = connects(-1, 0);
      const parts = [];
      if (n) parts.push([0, 0, 0, -0.53]);
      if (e) parts.push([0, 0, 0.53, 0]);
      if (s) parts.push([0, 0, 0, 0.53]);
      if (w) parts.push([0, 0, -0.53, 0]);
      if (!parts.length) parts.push([-0.31, 0, 0.31, 0]);
      for (const [x1, y1, x2, y2] of parts) line(ctx, x1 + 0.07, y1 + 0.15, x2 + 0.07, y2 + 0.15, 'rgba(35,40,25,.25)', 0.49);
      for (const [x1, y1, x2, y2] of parts) {
        line(ctx, x1, y1, x2, y2, '#65543d', 0.43);
        line(ctx, x1, y1 - 0.04, x2, y2 - 0.04, '#b29a6d', 0.32);
        line(ctx, x1 - 0.035, y1 - 0.13, x2 - 0.035, y2 - 0.13, '#d2ba86', 0.055);
      }
      ellipse(ctx, 0, -0.04, 0.18, 0.18, '#ad9568');
      ellipse(ctx, -0.015, -0.065, 0.065, 0.065, 'rgba(116,89,52,.35)');
    } else if (building.type === 'door') {
      const opened = pawns.some(p => !p.dead && Math.hypot(number(p.x) - x - 0.5, number(p.y) - y - 0.5) < 0.72);
      rect(ctx, -0.5, -0.15, 1, 0.43, 'rgba(52,47,34,.24)', 0.03);
      rect(ctx, -0.47, -0.27, 0.13, 0.47, '#b49b6e', 0.025);
      rect(ctx, 0.34, -0.27, 0.13, 0.47, '#b49b6e', 0.025);
      ctx.save();
      ctx.translate(-0.34, -0.08);
      if (opened) ctx.rotate(-1.03);
      rect(ctx, 0, -0.09, 0.68, 0.24, '#816844', 0.015, '#5c4a35');
      line(ctx, 0.04, -0.04, 0.61, -0.04, '#bd9f6c', 0.035);
      ellipse(ctx, 0.55, 0.05, 0.027, 0.027, '#e2c482');
      ctx.restore();
    } else if (building.type === 'bed') {
      ellipse(ctx, 0.06, 0.18, 0.47, 0.37, 'rgba(40,39,27,.22)');
      rect(ctx, -0.39, -0.49, 0.78, 1.04, '#705b40', 0.06);
      rect(ctx, -0.32, -0.45, 0.64, 0.89, '#d4ceb0', 0.055);
      rect(ctx, -0.31, -0.14, 0.62, 0.58, building.medical ? '#719fa6' : hashString(building.id) % 2 ? '#6e9699' : '#a49a6a', 0.04);
      rect(ctx, -0.25, -0.4, 0.5, 0.23, '#eee3c3', 0.07);
      line(ctx, -0.3, -0.06, 0.3, -0.06, 'rgba(229,226,192,.58)', 0.05);
      line(ctx, 0.19, 0, 0.19, 0.38, 'rgba(42,72,76,.20)', 0.025);
      rect(ctx, -0.44, -0.56, 0.88, 0.12, '#ba9c6b', 0.025);
      rect(ctx, -0.43, 0.43, 0.86, 0.12, '#a58a5d', 0.025);
      if (building.medical) {
        rect(ctx, -0.18, 0.045, 0.36, 0.3, '#dfe5c8', 0.035);
        rect(ctx, -0.038, 0.08, 0.076, 0.23, '#487c79', 0.008);
        rect(ctx, -0.115, 0.157, 0.23, 0.076, '#487c79', 0.008);
      }
    } else if (building.type === 'stove') {
      ellipse(ctx, 0.07, 0.29, 0.51, 0.25, 'rgba(33,43,37,.24)');
      rect(ctx, -0.44, -0.36, 0.88, 0.84, '#4f5d5a', 0.07, '#384842', 0.04);
      rect(ctx, -0.43, -0.4, 0.86, 0.55, '#9aada3', 0.06);
      rect(ctx, 0.22, -0.76, 0.15, 0.39, '#455b58', 0.025);
      rect(ctx, 0.19, -0.8, 0.21, 0.08, '#738e83', 0.02);
      ellipse(ctx, -0.14, -0.14, 0.22, 0.2, '#354c48');
      ellipse(ctx, -0.14, -0.17, 0.16, 0.13, '#576f5d');
      ellipse(ctx, -0.14, -0.18, 0.12, 0.095, '#bf945b');
      line(ctx, -0.4, -0.17, -0.33, -0.17, '#c3c5a8', 0.055);
      line(ctx, 0.05, -0.17, 0.12, -0.17, '#c3c5a8', 0.055);
      ellipse(ctx, 0.26, -0.1, 0.1, 0.09, '#566d62');
      rect(ctx, -0.28, 0.23, 0.37, 0.15, '#293f3a', 0.03);
      const working = pawns.some(p => p.job?.type === 'cook' && Math.hypot(number(p.x) - x - 0.5, number(p.y) - y - 0.5) < 2);
      if (working) {
        ellipse(ctx, -0.08, 0.3, 0.14, 0.045, '#e4ae69');
        for (let k = 0; k < 3; k++) {
          const phase = (this._time * 0.5 + k / 3) % 1;
          ellipse(ctx, 0.28 + Math.sin(phase * 5) * 0.08, -0.82 - phase * 0.7, 0.045 + phase * 0.09, 0.065 + phase * 0.1, `rgba(221,224,193,${(1 - phase) * 0.3})`);
        }
      }
      ellipse(ctx, 0.27, 0.31, 0.04, 0.04, '#cbb580');
    } else if (building.type === 'sandbag') {
      rect(ctx, -0.48, -0.05, 0.98, 0.48, 'rgba(48,46,27,.24)', 0.1);
      for (let row = 0; row < 2; row++) for (let col = 0; col < 3; col++) {
        const bx = -0.45 + col * 0.3 + (row ? 0.04 : 0), by = -0.22 + row * 0.24;
        rect(ctx, bx, by, 0.31, 0.25, row ? '#ad9e6d' : '#c4b783', 0.09, '#84794f', 0.025);
        line(ctx, bx + 0.08, by + 0.05, bx + 0.24, by + 0.07, 'rgba(232,222,172,.45)', 0.02);
      }
    } else if (building.type === 'horseshoes') {
      ellipse(ctx, 0.025, 0.17, 0.5, 0.36, 'rgba(84,70,43,.22)');
      ellipse(ctx, 0, 0.035, 0.44, 0.32, '#a19567');
      ellipse(ctx, -0.04, -0.015, 0.35, 0.25, '#b6aa79');
      rect(ctx, -0.35, 0.23, 0.7, 0.075, '#85744f', 0.025);
      line(ctx, 0, 0.12, 0, -0.55, '#5a6551', 0.085);
      line(ctx, -0.025, 0.07, -0.025, -0.52, '#c4c8a3', 0.025);
      ellipse(ctx, 0, -0.55, 0.05, 0.035, '#ded7ac');
      ctx.strokeStyle = '#d5c998'; ctx.lineWidth = 0.055;
      ctx.beginPath(); ctx.ellipse(0.02, 0.08, 0.15, 0.09, -0.25, 0.15, Math.PI * 1.85); ctx.stroke();
      ctx.strokeStyle = '#718d81'; ctx.lineWidth = 0.055;
      ctx.beginPath(); ctx.arc(-0.24, 0.11, 0.09, -0.5, Math.PI * 1.35); ctx.stroke();
      line(ctx, 0.24, 0.18, 0.3, 0.12, 'rgba(220,208,154,.5)', 0.025);
    } else if (building.type === 'workbench') {
      ellipse(ctx, 0.07, 0.24, 0.52, 0.25, 'rgba(32,45,35,.26)');
      rect(ctx, -0.37, 0.06, 0.14, 0.39, '#67543c', 0.025);
      rect(ctx, 0.24, 0.06, 0.14, 0.39, '#67543c', 0.025);
      rect(ctx, -0.45, -0.36, 0.9, 0.64, '#745b3d', 0.04);
      rect(ctx, -0.45, -0.43, 0.9, 0.56, '#af9464', 0.035, '#6d624a', 0.025);
      rect(ctx, -0.39, -0.69, 0.78, 0.21, '#7c8263', 0.025, '#536453', 0.025);
      for (const px of [-0.25, -0.04, 0.18]) {
        line(ctx, px, -0.64, px, -0.48, '#c5be90', 0.028);
        ellipse(ctx, px, -0.65, 0.038, 0.035, '#d3cda6');
      }
      rect(ctx, -0.31, -0.31, 0.31, 0.3, '#68827a', 0.025, '#42635e', 0.025);
      rect(ctx, -0.27, -0.36, 0.08, 0.2, '#a5b3a0', 0.012);
      rect(ctx, -0.11, -0.36, 0.08, 0.2, '#a5b3a0', 0.012);
      line(ctx, -0.15, -0.1, -0.15, 0.16, '#344e48', 0.025);
      line(ctx, -0.23, 0.12, -0.06, 0.12, '#bac3a4', 0.035);
      line(ctx, 0.13, 0.035, 0.29, -0.27, '#71573c', 0.05);
      rect(ctx, 0.18, -0.31, 0.22, 0.085, '#aeb8a2', 0.02);
      rect(ctx, -0.29, 0.23, 0.57, 0.1, '#846b48', 0.02);
      line(ctx, -0.05, 0.28, 0.05, 0.28, '#c0ac7c', 0.025);
      const working = pawns.some(p => p.job?.type === 'craft' && p.job.stage === 'work' && Math.hypot(number(p.x) - x - 0.5, number(p.y) - y - 0.5) < 2);
      if (working) {
        const phase = (this._time * 1.8) % 1;
        for (let k = 0; k < 3; k++) {
          const angle = -0.8 - k * 0.9;
          line(ctx, -0.15 + Math.cos(angle) * phase * 0.26, -0.25 + Math.sin(angle) * phase * 0.23,
            -0.15 + Math.cos(angle) * (phase * 0.26 + 0.045), -0.25 + Math.sin(angle) * (phase * 0.23 + 0.045), `rgba(241,208,137,${(1 - phase) * 0.7})`, 0.023);
        }
      }
    } else if (building.type === 'researchbench') {
      ellipse(ctx, 0.08, 0.25, 0.5, 0.24, 'rgba(34,47,35,.24)');
      rect(ctx, -0.36, 0.1, 0.13, 0.35, '#65553c', 0.025);
      rect(ctx, 0.23, 0.1, 0.13, 0.35, '#65553c', 0.025);
      rect(ctx, -0.46, -0.35, 0.92, 0.67, '#755e40', 0.045);
      rect(ctx, -0.46, -0.42, 0.92, 0.62, '#b69b6c', 0.045, '#6e6149', 0.025);
      line(ctx, -0.4, -0.34, 0.39, -0.34, 'rgba(233,211,159,.5)', 0.025);
      ctx.save(); ctx.translate(0.04, -0.1); ctx.rotate(-0.1);
      rect(ctx, -0.23, -0.19, 0.45, 0.35, '#e3dfbd', 0.012);
      rect(ctx, -0.18, -0.14, 0.22, 0.18, null, 0.005, '#6e9c9a', 0.017);
      line(ctx, -0.15, -0.06, 0.1, -0.06, '#7caaa4', 0.018);
      line(ctx, 0.09, -0.13, 0.09, 0.1, '#7caaa4', 0.018);
      line(ctx, -0.15, 0.09, -0.02, 0.09, '#9aab98', 0.02);
      ctx.restore();
      rect(ctx, 0.26, -0.3, 0.12, 0.29, '#637d7a', 0.015);
      line(ctx, 0.29, -0.24, 0.34, -0.24, '#d5cba5', 0.022);
      ellipse(ctx, -0.3, -0.2, 0.095, 0.07, '#8f784d');
      line(ctx, -0.3, -0.21, -0.3, -0.55, '#5c6954', 0.04);
      polygon(ctx, [[-0.44, -0.48], [-0.39, -0.62], [-0.23, -0.62], [-0.17, -0.48]], '#8aa083', '#5d7567', 0.02);
      const researching = pawns.some(p => p.job?.type === 'research' && Math.hypot(number(p.x) - x - 0.5, number(p.y) - y - 0.5) < 2);
      if (researching) ellipse(ctx, -0.3, -0.45, 0.18, 0.075, 'rgba(241,215,143,.22)');
    } else if (building.type === 'solar') {
      ellipse(ctx, 0.08, 0.27, 0.55, 0.27, 'rgba(31,49,43,.25)');
      line(ctx, -0.28, 0.12, -0.28, 0.44, '#647c75', 0.085);
      line(ctx, 0.28, 0.12, 0.28, 0.44, '#647c75', 0.085);
      rect(ctx, -0.45, -0.45, 0.9, 0.74, '#a7bbb0', 0.04, '#4b6665', 0.035);
      rect(ctx, -0.4, -0.4, 0.8, 0.64, '#294c63', 0.015);
      for (let row = 0; row < 2; row++) for (let col = 0; col < 3; col++) {
        const px = -0.38 + col * 0.263, py = -0.38 + row * 0.3;
        rect(ctx, px, py, 0.236, 0.276, row ? '#3c6480' : '#457189', 0.012);
        line(ctx, px + 0.075, py + 0.02, px + 0.075, py + 0.252, 'rgba(166,202,212,.28)', 0.012);
        line(ctx, px + 0.156, py + 0.02, px + 0.156, py + 0.252, 'rgba(166,202,212,.28)', 0.012);
      }
      polygon(ctx, [[-0.37, -0.39], [-0.2, -0.39], [0.16, 0.23], [-0.02, 0.23]], 'rgba(190,224,224,.12)');
      ellipse(ctx, 0.35, 0.31, 0.036, 0.035, building.powered ? '#e9d59a' : '#768776');
    } else if (building.type === 'battery') {
      ellipse(ctx, 0.08, 0.23, 0.45, 0.28, 'rgba(32,48,41,.26)');
      rect(ctx, -0.36, -0.35, 0.72, 0.8, '#435e59', 0.085, '#304d48', 0.035);
      rect(ctx, -0.32, -0.37, 0.64, 0.18, '#98b0a1', 0.045);
      rect(ctx, -0.23, -0.46, 0.14, 0.15, '#d0ba81', 0.025);
      rect(ctx, 0.09, -0.46, 0.14, 0.15, '#b58a72', 0.025);
      rect(ctx, -0.27, -0.13, 0.35, 0.46, '#668277', 0.03);
      polygon(ctx, [[-0.035, -0.07], [-0.19, 0.12], [-0.08, 0.12], [-0.16, 0.28], [0.005, 0.055], [-0.105, 0.055]], '#d9c58d');
      const charge = clamp(number(building.charge) / 18000, 0, 1);
      for (let k = 0; k < 5; k++) rect(ctx, 0.16, 0.28 - k * 0.087, 0.09, 0.058, charge > k / 5 ? charge < 0.2 ? '#dfac74' : '#aed1a2' : '#304f48', 0.01);
      if (this._layer === 'power') this._bar(ctx, -0.3, 0.53, 0.6, charge, charge < 0.2 ? '#dcad79' : '#a9d5b5', 0.05);
    } else if (building.type === 'conduit') {
      ellipse(ctx, 0.035, 0.08, 0.19, 0.12, 'rgba(34,46,34,.2)');
      rect(ctx, -0.11, -0.11, 0.22, 0.22, '#576d61', 0.045, '#a49c75', 0.02);
      ellipse(ctx, 0, -0.005, 0.042, 0.04, building.powered ? '#d9dab0' : '#8d9d86');
      if (this._layer === 'power' && building.powered) ellipse(ctx, 0, 0, 0.22, 0.22, 'rgba(162,233,202,.13)');
    } else if (building.type === 'cooler') {
      ellipse(ctx, 0.08, 0.25, 0.48, 0.25, 'rgba(29,49,44,.26)');
      rect(ctx, -0.4, -0.39, 0.8, 0.81, '#658981', 0.065, '#365d58', 0.035);
      rect(ctx, -0.36, -0.4, 0.72, 0.59, '#bbcebb', 0.05);
      ellipse(ctx, -0.065, -0.1, 0.245, 0.235, '#4e7775');
      ctx.save(); ctx.translate(-0.065, -0.1); ctx.rotate(building.powered ? this._simTime * 3.8 : 0.4);
      for (let k = 0; k < 4; k++) {
        ctx.rotate(Math.PI / 2);
        ellipse(ctx, 0.087, -0.048, 0.12, 0.054, '#a8c6bb', -0.45);
      }
      ctx.restore();
      ellipse(ctx, -0.065, -0.1, 0.055, 0.055, '#d8e0bd');
      for (let k = 0; k < 4; k++) line(ctx, -0.27, 0.23 + k * 0.046, 0.27, 0.23 + k * 0.046, '#385e5c', 0.022);
      ellipse(ctx, 0.26, -0.11, 0.034, 0.034, building.powered ? '#a4e5dc' : '#6d8b7d');
      if (building.powered && tile.roofed) {
        for (let k = 0; k < 2; k++) {
          const phase = (this._time * 0.3 + k * 0.5) % 1;
          line(ctx, -0.2, 0.48 + phase * 0.2, 0.12, 0.48 + phase * 0.2, `rgba(194,237,224,${(1 - phase) * 0.3})`, 0.025);
        }
      }
    } else if (building.type === 'heater') {
      ellipse(ctx, 0.07, 0.23, 0.47, 0.24, 'rgba(36,45,35,.23)');
      rect(ctx, -0.41, -0.27, 0.82, 0.65, '#526b61', 0.06, '#354f48', 0.035);
      rect(ctx, -0.35, -0.3, 0.7, 0.58, '#a9956e', 0.045);
      for (let k = 0; k < 6; k++) {
        const px = -0.28 + k * 0.108;
        rect(ctx, px, -0.23, 0.065, 0.4, building.powered ? '#ca9862' : '#6b7862', 0.025);
        line(ctx, px + 0.02, -0.19, px + 0.02, 0.11, building.powered ? '#e3bb80' : '#a3a181', 0.018);
      }
      ellipse(ctx, 0.3, 0.27, 0.035, 0.035, building.powered ? '#f0bf78' : '#778b72');
      if (building.powered && tile.roofed) {
        for (let k = 0; k < 2; k++) {
          const px = -0.18 + k * 0.32, rise = Math.sin(this._time * 1.8 + k) * 0.025;
          ctx.beginPath(); ctx.moveTo(px, -0.34); ctx.quadraticCurveTo(px - 0.08, -0.48, px + rise, -0.64);
          ctx.strokeStyle = 'rgba(242,201,143,.33)'; ctx.lineWidth = 0.028; ctx.stroke();
        }
      }
    } else if (building.type === 'beacon') {
      ellipse(ctx, 0.1, 0.24, 0.54, 0.28, 'rgba(31,50,44,.27)');
      polygon(ctx, [[-0.43, 0.14], [-0.27, -0.18], [0.27, -0.18], [0.44, 0.14], [0.25, 0.39], [-0.25, 0.39]], '#6c8179', '#3b534e', 0.04);
      rect(ctx, -0.2, -0.3, 0.4, 0.52, '#455e5c', 0.04);
      line(ctx, 0, 0, 0, -1.02, '#b7c7b8', 0.09);
      line(ctx, -0.3, -0.74, 0.3, -0.74, '#8ba8a0', 0.055);
      line(ctx, -0.23, -0.74, -0.11, -1.04, '#b9c6ad', 0.045);
      line(ctx, 0.23, -0.74, 0.11, -1.04, '#b9c6ad', 0.045);
      ellipse(ctx, 0, -1.07, 0.09, 0.09, building.powered === false ? '#8b9e8a' : '#bfe8ca');
      if (building.powered !== false) ellipse(ctx, 0, -1.07, 0.19 + Math.sin(this._time * 2) * 0.025, 0.19, 'rgba(138,226,193,.15)');
      rect(ctx, -0.11, -0.21, 0.22, 0.1, building.powered === false ? '#536f62' : '#a2dbc2', 0.02);
      const progress = clamp(number(state.beaconProgress), 0, 1);
      if (building.powered !== false && (progress > 0 || state.victory)) {
        ctx.save();
        ctx.strokeStyle = 'rgba(182,235,207,.45)';
        ctx.lineWidth = 0.035;
        for (let i = 0; i < 2; i++) {
          const pulse = (this._time * 0.38 + i * 0.5) % 1;
          ctx.globalAlpha = 1 - pulse;
          ctx.beginPath(); ctx.arc(0, -1.07, 0.25 + pulse * 0.85, -Math.PI * 0.83, -Math.PI * 0.17); ctx.stroke();
        }
        ctx.restore();
      }
    } else rect(ctx, -0.4, -0.35, 0.8, 0.73, '#9a9d7f', 0.1, '#66715b');
    if (CONSUMERS.has(building.type) && building.powered === false) {
      ellipse(ctx, 0.39, -0.39, 0.17, 0.17, '#354c45');
      polygon(ctx, [[0.42, -0.51], [0.3, -0.36], [0.38, -0.36], [0.35, -0.25], [0.49, -0.42], [0.4, -0.42]], '#e2b484');
      if (building.networkId == null) line(ctx, 0.27, -0.51, 0.51, -0.27, '#e0a18b', 0.026);
    }
    if (number(building.hp, 100) < number(building.maxHp, building.hp) * 0.8) this._bar(ctx, -0.36, 0.58, 0.72, clamp(building.hp / Math.max(1, building.maxHp), 0, 1), '#dc9973');
    ctx.restore();
  }

  _drawBlueprint(ctx, x, y, kind, progress = null, color = '#b8ddd0') {
    ctx.save();
    rect(ctx, x + 0.06, y + 0.06, 0.88, 0.88, 'rgba(103,184,164,.14)', 0.06);
    ctx.setLineDash([0.13, 0.08]);
    rect(ctx, x + 0.07, y + 0.07, 0.86, 0.86, null, 0.04, color, 0.035);
    ctx.setLineDash([]);
    ctx.translate(x + 0.5, y + 0.5);
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.045;
    if (kind === 'bed') {
      rect(ctx, -0.24, -0.31, 0.48, 0.62, null, 0.025, color);
      line(ctx, -0.2, -0.11, 0.2, -0.11, color, 0.035);
    } else if (kind === 'stove') {
      rect(ctx, -0.28, -0.24, 0.56, 0.48, null, 0.03, color);
      ctx.beginPath(); ctx.arc(-0.09, -0.04, 0.1, 0, TAU); ctx.stroke();
      line(ctx, 0.18, -0.24, 0.18, -0.38, color);
    } else if (kind === 'beacon') {
      line(ctx, 0, 0.25, 0, -0.29, color, 0.055);
      line(ctx, -0.2, -0.13, 0.2, -0.13, color, 0.04);
      ctx.beginPath(); ctx.arc(0, -0.24, 0.2, Math.PI * 1.12, Math.PI * 1.88); ctx.stroke();
      line(ctx, -0.21, 0.26, 0.21, 0.26, color);
    } else if (kind === 'door') {
      rect(ctx, -0.24, -0.3, 0.48, 0.6, null, 0.01, color);
      ellipse(ctx, 0.13, 0.06, 0.025, 0.025, color);
    } else if (kind === 'sandbag') {
      rect(ctx, -0.28, -0.15, 0.55, 0.29, null, 0.1, color);
      line(ctx, 0, -0.12, 0, 0.12, color, 0.025);
    } else if (kind === 'horseshoes') {
      line(ctx, 0, 0.2, 0, -0.31, color, 0.045);
      ctx.beginPath(); ctx.ellipse(0, 0.13, 0.22, 0.12, 0, 0.18, Math.PI * 1.85); ctx.stroke();
      line(ctx, -0.27, 0.28, 0.27, 0.28, color, 0.035);
    } else if (kind === 'workbench') {
      rect(ctx, -0.3, -0.19, 0.6, 0.32, null, 0.025, color);
      line(ctx, -0.22, 0.13, -0.22, 0.29, color);
      line(ctx, 0.22, 0.13, 0.22, 0.29, color);
      line(ctx, -0.06, 0.02, 0.13, -0.31, color, 0.038);
      line(ctx, 0.03, -0.31, 0.22, -0.21, color, 0.07);
    } else if (kind === 'researchbench') {
      rect(ctx, -0.3, -0.22, 0.6, 0.37, null, 0.025, color);
      rect(ctx, -0.12, -0.17, 0.23, 0.25, null, 0.01, color, 0.025);
      line(ctx, -0.22, 0.15, -0.22, 0.28, color);
      line(ctx, 0.22, 0.15, 0.22, 0.28, color);
    } else if (kind === 'solar') {
      rect(ctx, -0.31, -0.27, 0.62, 0.47, null, 0.025, color);
      for (const px of [-0.1, 0.1]) line(ctx, px, -0.25, px, 0.18, color, 0.025);
      line(ctx, -0.29, -0.035, 0.29, -0.035, color, 0.025);
      line(ctx, -0.19, 0.21, -0.19, 0.31, color);
      line(ctx, 0.19, 0.21, 0.19, 0.31, color);
    } else if (kind === 'battery') {
      rect(ctx, -0.22, -0.26, 0.44, 0.55, null, 0.035, color);
      line(ctx, -0.09, -0.26, -0.09, -0.34, color);
      line(ctx, 0.09, -0.26, 0.09, -0.34, color);
      polygon(ctx, [[0.05, -0.16], [-0.11, 0.045], [0.01, 0.045], [-0.05, 0.2], [0.13, -0.045], [0.005, -0.045]], color);
    } else if (kind === 'conduit') {
      line(ctx, -0.3, 0, 0.3, 0, color, 0.04);
      line(ctx, 0, -0.3, 0, 0.3, color, 0.04);
      rect(ctx, -0.09, -0.09, 0.18, 0.18, '#4a786b', 0.025, color, 0.03);
    } else if (kind === 'cooler') {
      rect(ctx, -0.27, -0.27, 0.54, 0.53, null, 0.04, color);
      ctx.beginPath(); ctx.arc(0, -0.035, 0.17, 0, TAU); ctx.stroke();
      line(ctx, -0.11, -0.145, 0.11, 0.075, color, 0.035);
      line(ctx, 0.11, -0.145, -0.11, 0.075, color, 0.035);
      line(ctx, -0.18, 0.2, 0.18, 0.2, color, 0.025);
    } else if (kind === 'heater') {
      rect(ctx, -0.28, -0.2, 0.56, 0.42, null, 0.04, color);
      for (const px of [-0.17, -0.055, 0.055, 0.17]) line(ctx, px, -0.13, px, 0.13, color, 0.035);
      line(ctx, -0.13, -0.28, -0.09, -0.36, color, 0.03);
      line(ctx, 0.1, -0.28, 0.14, -0.36, color, 0.03);
    } else {
      rect(ctx, -0.3, -0.15, 0.6, 0.3, null, 0.035, color);
      line(ctx, -0.13, -0.15, -0.13, 0.15, color, 0.025);
      line(ctx, 0.16, -0.15, 0.16, 0.15, color, 0.025);
    }
    if (progress !== null && progress > 0) this._bar(ctx, -0.35, 0.34, 0.7, clamp(progress, 0, 1), '#e8c580');
    ctx.restore();
  }

  _drawItem(ctx, item) {
    const x = number(item.x) + 0.5, y = number(item.y) + 0.5;
    ctx.save(); ctx.translate(x, y);
    ellipse(ctx, 0.05, 0.2, 0.32, 0.14, 'rgba(37,45,31,.2)');
    if (item.type === 'wood') {
      for (let k = 0; k < 3; k++) {
        const py = -0.14 + k * 0.13;
        rect(ctx, -0.27 + (k === 1 ? 0.05 : 0), py, 0.5, 0.12, k === 1 ? '#9d784d' : '#825f3d', 0.045);
        ellipse(ctx, 0.23 + (k === 1 ? 0.05 : 0), py + 0.06, 0.06, 0.055, '#c6a273');
        ellipse(ctx, 0.23 + (k === 1 ? 0.05 : 0), py + 0.06, 0.023, 0.021, '#987448');
      }
      line(ctx, -0.07, -0.15, -0.07, 0.22, '#c1aa77', 0.045);
    } else if (item.type === 'steel') {
      for (let k = 0; k < 3; k++) {
        const py = -0.15 + k * 0.13;
        polygon(ctx, [[-0.28, py], [0.13, py - 0.07], [0.28, py + 0.03], [-0.13, py + 0.1]], k === 0 ? '#c0c9b8' : '#a6b5a8');
        line(ctx, -0.13, py + 0.11, 0.28, py + 0.04, '#536f6b', 0.05);
      }
    } else if (item.type === 'silver') {
      rect(ctx, -0.26, -0.05, 0.28, 0.25, '#8c8966', 0.09, '#646b54', 0.02);
      for (let k = 0; k < 3; k++) {
        const px = -0.08 + k * 0.14, py = 0.13 - (k % 2) * 0.08;
        ellipse(ctx, px, py, 0.11, 0.065, '#869c8d');
        ellipse(ctx, px, py - 0.035, 0.11, 0.065, '#d8dcc3');
        ctx.beginPath(); ctx.ellipse(px, py - 0.035, 0.065, 0.035, 0, 0, TAU); ctx.strokeStyle = '#a2b09a'; ctx.lineWidth = 0.012; ctx.stroke();
      }
    } else if (item.type === 'rifle') {
      ctx.save(); ctx.rotate(-0.3);
      rect(ctx, -0.4, -0.08, 0.8, 0.24, '#9d885b', 0.05, '#6e6246', 0.025);
      rect(ctx, -0.29, -0.06, 0.29, 0.09, '#755638', 0.025);
      rect(ctx, -0.07, -0.08, 0.32, 0.07, '#425f59', 0.018);
      line(ctx, 0.2, -0.045, 0.38, -0.045, '#b6c5af', 0.035);
      line(ctx, 0.02, -0.12, 0.2, -0.12, '#2f514d', 0.045);
      line(ctx, -0.17, -0.06, -0.17, 0.14, '#c7b482', 0.028);
      ctx.restore();
    } else if (item.type === 'armor') {
      polygon(ctx, [[-0.24, -0.27], [-0.08, -0.3], [-0.045, -0.17], [0.065, -0.17], [0.1, -0.3], [0.24, -0.26], [0.3, 0.21], [-0.29, 0.21]], '#647b69', '#3c5a4d', 0.03);
      rect(ctx, -0.2, -0.09, 0.16, 0.22, '#8b9b7b', 0.02);
      rect(ctx, 0.045, -0.09, 0.16, 0.22, '#8b9b7b', 0.02);
      line(ctx, 0, -0.12, 0, 0.18, '#b9b995', 0.025);
    } else if (item.type === 'tool') {
      rect(ctx, -0.31, -0.16, 0.62, 0.4, '#827d55', 0.055, '#55664d', 0.025);
      line(ctx, -0.21, 0.18, 0.01, -0.19, '#c3a373', 0.06);
      rect(ctx, -0.06, -0.22, 0.23, 0.095, '#c0c6aa', 0.025);
      line(ctx, 0.04, 0.16, 0.24, -0.12, '#96b4a6', 0.05);
      ctx.beginPath(); ctx.arc(0.25, -0.145, 0.075, 0.25, Math.PI * 1.6); ctx.strokeStyle = '#cad5b8'; ctx.lineWidth = 0.04; ctx.stroke();
      line(ctx, -0.27, 0.15, 0.25, 0.15, '#b5a777', 0.025);
    } else if (item.type === 'medicine') {
      rect(ctx, -0.26, -0.22, 0.52, 0.44, '#ddd9b8', 0.055, '#6c8575', 0.035);
      rect(ctx, -0.065, -0.15, 0.13, 0.28, '#608e7b', 0.01);
      rect(ctx, -0.14, -0.07, 0.28, 0.12, '#608e7b', 0.01);
    } else if (item.type === 'meals') {
      rect(ctx, -0.27, -0.18, 0.54, 0.39, '#d0ba85', 0.08, '#886d48', 0.035);
      rect(ctx, -0.21, -0.13, 0.42, 0.25, '#9b7d52', 0.045);
      ellipse(ctx, -0.08, -0.01, 0.1, 0.075, '#d4bd78');
      ellipse(ctx, 0.1, -0.02, 0.085, 0.06, '#80a464');
    } else if (item.type === 'rawfood') {
      rect(ctx, -0.28, -0.16, 0.56, 0.4, '#98784d', 0.025, '#6f593a');
      for (let k = 0; k < 5; k++) ellipse(ctx, -0.19 + k * 0.092, -0.12 + (k % 2) * 0.045, 0.075, 0.085, k % 2 ? '#b8ae65' : '#96a65b', k * 0.4);
      line(ctx, -0.23, 0.1, 0.23, 0.1, '#c3a16a', 0.04);
    } else rect(ctx, -0.24, -0.21, 0.48, 0.43, '#b29966', 0.04, '#715c3d');
    if (Number.isFinite(item.freshness) && item.freshness < 0.3) {
      ellipse(ctx, -0.27, -0.23, 0.08, 0.08, '#4d5740');
      ellipse(ctx, -0.27, -0.23, 0.035, 0.035, item.freshness < 0.1 ? '#dd9780' : '#d9c584');
    }
    if (number(item.count) > 1 && TILE * this.camera.zoom > 25) {
      const label = String(Math.floor(item.count));
      ctx.font = `600 0.225px ${FONT}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const width = Math.max(0.28, ctx.measureText(label).width + 0.11);
      rect(ctx, 0.17 - width / 2, 0.08, width, 0.27, 'rgba(30,47,40,.82)', 0.065);
      ctx.fillStyle = '#e9e0bc'; ctx.fillText(label, 0.17, 0.218);
    }
    ctx.restore();
  }

  _drawTrader(ctx, visitor) {
    const x = number(visitor.x), y = number(visitor.y), walking = Array.isArray(visitor.path) && visitor.path.length > 0;
    const stride = walking ? Math.sin(this._simTime * 10) * 0.065 : 0;
    ctx.save(); ctx.translate(x, y);
    ellipse(ctx, 0.25, 0.21, 0.68, 0.24, 'rgba(27,45,36,.26)');
    // The small handcart makes this non-combat visitor distinct at normal zoom.
    ellipse(ctx, 0.43, 0.32, 0.105, 0.14, '#385048');
    ellipse(ctx, 0.82, 0.22, 0.085, 0.12, '#385048');
    rect(ctx, 0.3, -0.13, 0.58, 0.44, '#846b48', 0.045, '#4f5940', 0.03);
    rect(ctx, 0.32, -0.18, 0.54, 0.32, '#bfaa77', 0.06);
    rect(ctx, 0.4, -0.26, 0.32, 0.24, '#86a294', 0.05);
    line(ctx, 0.56, -0.25, 0.56, 0.22, '#d2bc88', 0.04);
    line(ctx, 0.31, 0.18, 0.12, 0.09, '#9b8156', 0.055);
    line(ctx, -0.105, 0.02, -0.12, 0.25 + stride, '#3b4c43', 0.12);
    line(ctx, 0.085, 0.02, 0.1, 0.25 - stride, '#34463f', 0.12);
    ellipse(ctx, -0.13, 0.26 + stride, 0.085, 0.04, '#283f38');
    ellipse(ctx, 0.1, 0.26 - stride, 0.085, 0.04, '#283f38');
    polygon(ctx, [[-0.2, -0.24], [0.18, -0.24], [0.24, 0.14], [-0.23, 0.14]], '#9a8460', '#5c674d', 0.025);
    rect(ctx, -0.095, -0.24, 0.21, 0.37, '#c0a67a', 0.035);
    line(ctx, -0.16, -0.15, -0.26, 0.02 + stride, '#9a8460', 0.09);
    line(ctx, 0.14, -0.15, 0.25, 0.06, '#9a8460', 0.09);
    ellipse(ctx, 0.25, 0.085, 0.05, 0.055, '#c69c77');
    line(ctx, -0.15, 0.04, 0.16, 0.04, '#685c3e', 0.035);
    ellipse(ctx, -0.01, -0.34, 0.175, 0.175, '#d1af83');
    ellipse(ctx, -0.015, -0.27, 0.1, 0.065, '#807158');
    ellipse(ctx, 0.06, -0.36, 0.014, 0.016, '#3a493d');
    ellipse(ctx, -0.035, -0.47, 0.25, 0.065, '#625e45', -0.1);
    rect(ctx, -0.18, -0.61, 0.29, 0.17, '#8b8259', 0.065);
    line(ctx, -0.17, -0.47, 0.1, -0.47, '#bcb28b', 0.03);
    if (visitor.phase === 'trading') {
      ellipse(ctx, 0.35, -0.62, 0.15, 0.15, '#3d6157');
      ellipse(ctx, 0.35, -0.62, 0.075, 0.08, '#d5dbc0');
      line(ctx, 0.35, -0.665, 0.35, -0.575, '#8ca38b', 0.02);
    }
    ctx.restore();
  }

  _drawTraderLabel(ctx, visitor) {
    if (!this._isVisible(visitor.x, visitor.y) || TILE * this.camera.zoom < 14) return;
    const point = this._screenPoint(visitor.x + 0.18, visitor.y + 0.65);
    const remaining = Math.max(0, Math.ceil(number(visitor.leavesAt) - this._simTime));
    const label = visitor.phase === 'trading' ? `교역 상인 · ${remaining}초` : visitor.phase === 'arriving' ? '상인 · 도착하는 중' : '상인 · 돌아가는 중';
    ctx.save(); ctx.font = `600 ${this.width < 600 ? 10 : 11}px ${FONT}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const width = ctx.measureText(label).width + 16;
    rect(ctx, point.x - width / 2, point.y - 8, width, 18, 'rgba(39,62,50,.92)', 5, 'rgba(189,202,157,.6)', 1);
    ctx.fillStyle = '#e3e6be'; ctx.fillText(label, point.x, point.y + 0.5);
    ctx.restore();
  }

  _drawSelectedPath(ctx, pawn) {
    const path = Array.isArray(pawn.path) ? pawn.path : [];
    if (!path.length) return;
    ctx.save();
    ctx.setLineDash([0.14, 0.14]);
    ctx.lineDashOffset = -this._time * 0.2;
    ctx.strokeStyle = pawn.drafted ? 'rgba(244,201,124,.75)' : 'rgba(220,224,182,.38)';
    ctx.lineWidth = 0.04;
    ctx.beginPath(); ctx.moveTo(pawn.x, pawn.y);
    for (const step of path) if (Number.isFinite(step.x) && Number.isFinite(step.y)) ctx.lineTo(step.x + 0.5, step.y + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
    const last = path[path.length - 1];
    if (last && Number.isFinite(last.x) && Number.isFinite(last.y)) {
      const x = last.x + 0.5, y = last.y + 0.5;
      polygon(ctx, [[x, y - 0.16], [x + 0.16, y], [x, y + 0.16], [x - 0.16, y]], '#edc581');
    }
    ctx.restore();
  }

  _drawPawn(ctx, pawn, hostile, state) {
    const x = number(pawn.x), y = number(pawn.y), h = hashString(pawn.id);
    const selected = this._selectedIds.has(pawn.id);
    const dead = pawn.dead || number(pawn.health, 100) <= 0;
    if (!dead && !hostile && (number(pawn.health, 100) < 15 || pawn.patientBedId && !pawn.carriedBy)) { this._drawDownedPawn(ctx, pawn); return; }
    const walking = !dead && Array.isArray(pawn.path) && pawn.path.length > 0;
    const bob = walking ? Math.sin(this._simTime * 12 + h % 10) * 0.025 : 0;
    ctx.save(); ctx.translate(x, y);
    ellipse(ctx, 0.07, 0.15, 0.32, 0.17, 'rgba(21,39,32,.3)');
    if (selected && !dead) {
      const pulse = Math.sin(this._time * 3) * 0.025;
      ellipse(ctx, 0, 0.08, 0.48 + pulse, 0.28 + pulse, 'rgba(246,199,112,.12)');
      ctx.beginPath(); ctx.ellipse(0, 0.08, 0.47 + pulse, 0.28 + pulse, 0, 0, TAU);
      ctx.strokeStyle = '#f0cc86'; ctx.lineWidth = 0.045; ctx.stroke();
    } else if (pawn.drafted && !dead) {
      ctx.beginPath(); ctx.ellipse(0, 0.08, 0.4, 0.23, 0, 0, TAU);
      ctx.strokeStyle = 'rgba(231,198,127,.65)'; ctx.lineWidth = 0.033; ctx.stroke();
    }
    if (dead) {
      ellipse(ctx, 0.1, 0.1, 0.42, 0.18, 'rgba(113,61,49,.26)');
      ctx.rotate(-1.3);
      ctx.globalAlpha = 0.68;
    }
    ctx.translate(0, bob);
    const skin = ['#ddbc8d', '#c49a75', '#b78463'][h % 3];
    const hair = ['#504938', '#654a36', '#8e8062', '#3a4541'][h % 4];
    const shirt = hostile ? '#a35c50' : pawn.color || ['#80aca4', '#cfaa6d', '#9b9bb3'][h % 3];
    const stride = walking ? Math.sin(this._simTime * 12 + h % 10) * 0.065 : 0;
    line(ctx, -0.1, 0.02, -0.12, 0.23 + stride, '#344c49', 0.11);
    line(ctx, 0.1, 0.02, 0.12, 0.23 - stride, '#2c4241', 0.11);
    ellipse(ctx, -0.13, 0.24 + stride, 0.08, 0.04, '#273c38');
    ellipse(ctx, 0.13, 0.24 - stride, 0.08, 0.04, '#273c38');
    if (!hostile && pawn.equipment?.weapon === 'rifle' && !pawn.drafted) {
      line(ctx, -0.22, 0.16, 0.23, -0.57, '#38564e', 0.075);
      line(ctx, 0.17, -0.47, 0.29, -0.68, '#b4c1ab', 0.035);
      line(ctx, -0.24, 0.18, -0.13, -0.01, '#8c704c', 0.11);
    }
    rect(ctx, -0.205, -0.25, 0.41, 0.4, shirt, 0.13, 'rgba(29,48,42,.65)', 0.035);
    line(ctx, -0.18, -0.15, -0.255, 0.01 + stride, shirt, 0.105);
    line(ctx, 0.18, -0.15, 0.25, 0.01 - stride, shirt, 0.105);
    ellipse(ctx, -0.255, 0.055 + stride, 0.057, 0.062, skin);
    ellipse(ctx, 0.25, 0.055 - stride, 0.057, 0.062, skin);
    if (!hostile && pawn.equipment?.armor === 'armor') {
      rect(ctx, -0.16, -0.225, 0.32, 0.33, '#5c7263', 0.065, '#3c5b4e', 0.018);
      rect(ctx, -0.12, -0.12, 0.09, 0.13, '#899a7e', 0.012);
      rect(ctx, 0.03, -0.12, 0.09, 0.13, '#899a7e', 0.012);
      line(ctx, 0, -0.17, 0, 0.075, '#b3b693', 0.016);
    }
    line(ctx, -0.13, 0.08, 0.14, 0.08, 'rgba(39,56,45,.4)', 0.035);
    if (!hostile && pawn.equipment?.tool === 'tool') {
      rect(ctx, -0.235, 0.02, 0.1, 0.16, '#8e764c', 0.018);
      line(ctx, -0.195, 0.16, -0.24, -0.025, '#d2b27a', 0.027);
      line(ctx, -0.29, -0.015, -0.19, -0.04, '#b6c5ac', 0.04);
    }
    ellipse(ctx, 0.02, -0.32, 0.198, 0.2, 'rgba(37,44,34,.38)');
    ellipse(ctx, 0, -0.36, 0.187, 0.19, skin);
    ellipse(ctx, -0.018, -0.46, 0.19, 0.12, hair);
    ellipse(ctx, -0.156, -0.37, 0.044, 0.1, hair);
    ellipse(ctx, 0.137, -0.43, 0.048, 0.075, hair);
    ellipse(ctx, 0.067, -0.33, 0.016, 0.018, '#34413a');
    if (hostile) {
      rect(ctx, -0.13, -0.3, 0.27, 0.09, '#694e44', 0.03);
      line(ctx, -0.13, -0.44, 0.15, -0.44, '#d2956a', 0.048);
    } else {
      line(ctx, -0.08, -0.2, 0.08, -0.2, 'rgba(240,225,181,.5)', 0.035);
    }

    const patient = pawn.carryingPawnId && this._pawnById?.get(pawn.carryingPawnId);
    if (!dead && patient && !patient.dead && patient.carriedBy === pawn.id) {
      this._drawCarriedPawn(ctx, patient);
    } else if (!dead && (pawn.drafted || hostile)) {
      let target = null;
      const pool = hostile ? state.colonists || [] : state.raiders || [];
      const active = pool.filter(p => p && !p.dead);
      if (active.length) target = active.reduce((best, p) => Math.hypot(p.x - x, p.y - y) < Math.hypot(best.x - x, best.y - y) ? p : best);
      const angle = target ? Math.atan2(target.y - y, target.x - x) : -0.25;
      ctx.save(); ctx.rotate(angle);
      const rifle = !hostile && pawn.equipment?.weapon === 'rifle';
      rect(ctx, 0.16, -0.09, rifle ? 0.54 : 0.42, 0.095, '#3c504c', 0.025, '#243a36', 0.025);
      rect(ctx, 0.12, -0.04, 0.2, 0.1, '#907349', 0.025);
      line(ctx, rifle ? 0.59 : 0.44, -0.05, rifle ? 0.91 : 0.67, -0.05, '#a1b3a7', 0.045);
      if (rifle) {
        line(ctx, 0.34, -0.17, 0.56, -0.17, '#37564f', 0.06);
        line(ctx, 0.4, -0.15, 0.4, -0.08, '#9dac99', 0.02);
        line(ctx, 0.52, -0.15, 0.52, -0.08, '#9dac99', 0.02);
      }
      ctx.restore();
    } else if (!dead && !walking && pawn.job?.stage === 'work' && ['doctor', 'feed'].includes(pawn.job.type)) {
      this._drawWorkTool(ctx, pawn.job.type, this._simTime + h % 7);
    } else if (!dead && pawn.carry) {
      rect(ctx, -0.18, -0.005, 0.36, 0.27, '#b09261', 0.025, '#735c3d', 0.025);
      line(ctx, 0, 0.01, 0, 0.24, '#d5bc87', 0.04);
      line(ctx, -0.16, 0.12, 0.16, 0.12, '#8f744d', 0.025);
    } else if (!dead && pawn.job && !walking && !(pawn.job.type === 'recreate' && pawn.job.ground)) this._drawWorkTool(ctx, pawn.job.type, this._simTime + h % 7);
    if (!dead && pawn.job?.type === 'firefight' && !walking) this._drawWaterSpray(ctx, pawn);

    if (!dead && number(pawn.bleed) > 0) {
      ellipse(ctx, -0.29, 0.22, 0.043, 0.055, '#b46d5e');
      ellipse(ctx, 0.18, 0.32, 0.03, 0.036, '#9e5a50');
    }
    if (!dead && number(pawn.health, 100) < 88) this._bar(ctx, -0.3, -0.78, 0.6, clamp(number(pawn.health) / number(pawn.maxHp, 100), 0, 1), hostile ? '#dd8d77' : '#ddaa79');
    if (!dead && pawn.job && number(pawn.job.total) > 0 && !walking) {
      const progress = clamp(number(pawn.job.progress) / pawn.job.total, 0, 1);
      this._bar(ctx, -0.24, 0.38, 0.48, progress, '#e8c985', 0.045);
    }
    if (!dead && /sleep|rest|수면|잠|휴식/.test(String(pawn.status))) {
      ctx.font = `600 0.22px ${FONT}`; ctx.fillStyle = '#e6e3ba'; ctx.textAlign = 'center';
      ctx.fillText('z', 0.32, -0.58 - (this._time * 0.1 % 0.16));
    }
    ctx.restore();
  }

  _drawDownedPawn(ctx, pawn) {
    const selected = this._selectedIds.has(pawn.id), h = hashString(pawn.id);
    ctx.save(); ctx.translate(number(pawn.x), number(pawn.y));
    ellipse(ctx, 0.04, 0.09, 0.55, 0.23, 'rgba(30,43,34,.32)');
    if (selected) {
      ctx.beginPath(); ctx.ellipse(0, 0.04, 0.6, 0.3, 0, 0, TAU);
      ctx.strokeStyle = '#f0cc86'; ctx.lineWidth = 0.04; ctx.stroke();
    }
    ctx.save(); ctx.rotate(pawn.patientBedId ? Math.PI / 2 : -0.3);
    const shirt = pawn.color || '#91a89a';
    line(ctx, 0.13, -0.055, 0.4, -0.09, '#344d49', 0.12);
    line(ctx, 0.13, 0.08, 0.4, 0.12, '#344d49', 0.12);
    ellipse(ctx, 0.43, -0.08, 0.075, 0.045, '#2c423d');
    ellipse(ctx, 0.43, 0.13, 0.075, 0.045, '#2c423d');
    rect(ctx, -0.21, -0.16, 0.39, 0.32, shirt, 0.1, '#44594d', 0.025);
    line(ctx, -0.12, -0.15, 0.1, -0.22, shirt, 0.08);
    line(ctx, -0.12, 0.14, 0.08, 0.21, shirt, 0.08);
    ellipse(ctx, -0.31, 0, 0.15, 0.15, ['#ddbc8d', '#c49a75', '#b78463'][h % 3]);
    ellipse(ctx, -0.37, -0.02, 0.1, 0.145, ['#504938', '#654a36', '#8e8062'][h % 3]);
    line(ctx, -0.27, -0.055, -0.23, -0.035, '#5f5d43', 0.018);
    line(ctx, -0.27, 0.04, -0.23, 0.055, '#5f5d43', 0.018);
    if (number(pawn.bleed) > 0) ellipse(ctx, 0.05, 0.27, 0.12, 0.065, 'rgba(165,91,70,.5)');
    ctx.restore();
    this._bar(ctx, -0.33, -0.61, 0.66, clamp(number(pawn.health) / 100, 0, 1), '#df9e7b');
    ellipse(ctx, 0.42, -0.36, 0.15, 0.15, '#405d55');
    line(ctx, 0.42, -0.445, 0.42, -0.275, '#f2cf93', 0.042);
    line(ctx, 0.335, -0.36, 0.505, -0.36, '#f2cf93', 0.042);
    ctx.restore();
  }

  _drawCarriedPawn(ctx, patient) {
    const selected = this._selectedIds.has(patient.id), h = hashString(patient.id);
    ctx.save(); ctx.translate(0.05, -0.07); ctx.rotate(-0.12);
    ellipse(ctx, 0.03, 0.035, 0.43, 0.14, 'rgba(27,43,37,.22)');
    line(ctx, 0.07, -0.02, 0.34, 0.035, '#344d49', 0.085);
    line(ctx, 0.07, 0.065, 0.33, 0.12, '#344d49', 0.085);
    rect(ctx, -0.19, -0.09, 0.31, 0.21, patient.color || '#a0b1a2', 0.065, '#4a6559', 0.02);
    ellipse(ctx, -0.27, 0, 0.106, 0.108, ['#ddbc8d', '#c49a75', '#b78463'][h % 3]);
    ellipse(ctx, -0.315, -0.02, 0.07, 0.1, ['#504938', '#654a36', '#8e8062'][h % 3]);
    line(ctx, -0.12, 0.1, 0.08, 0.15, '#d5b38a', 0.06);
    if (selected) {
      ctx.strokeStyle = '#f0cc86'; ctx.lineWidth = 0.025;
      roundedPath(ctx, -0.4, -0.15, 0.82, 0.38, 0.12); ctx.stroke();
    }
    ctx.restore();
    ellipse(ctx, 0.35, -0.59, 0.12, 0.12, '#44675f');
    line(ctx, 0.35, -0.655, 0.35, -0.525, '#d8ead1', 0.033);
    line(ctx, 0.285, -0.59, 0.415, -0.59, '#d8ead1', 0.033);
  }

  _drawWaterSpray(ctx, pawn) {
    const job = pawn.job;
    const dx = number(job.tx) + 0.5 - number(pawn.x), dy = number(job.ty) + 0.5 - number(pawn.y);
    if (Math.hypot(dx, dy) > 2.3) return;
    const phase = (this._time * 1.7 + hashString(pawn.id) % 10) % 1;
    ctx.save();
    for (let k = 0; k < 7; k++) {
      const t = (phase + k / 7) % 1;
      const px = mix(0.22, dx, t), py = mix(-0.05, dy + 0.1, t) - Math.sin(t * Math.PI) * 0.32;
      ellipse(ctx, px, py, 0.018 + t * 0.015, 0.027, `rgba(192,226,221,${0.6 - t * 0.3})`, -0.3);
    }
    ctx.restore();
  }

  _drawWorkTool(ctx, type, time) {
    ctx.save();
    const swing = Math.sin(time * 6) * 0.3;
    ctx.translate(0.23, -0.05);
    if (type === 'doctor' || type === 'rescue') {
      rect(ctx, -0.07, -0.08, 0.21, 0.2, '#e6dfb9', 0.04);
      line(ctx, 0.035, -0.035, 0.035, 0.065, '#78a78a', 0.038);
      line(ctx, -0.015, 0.015, 0.085, 0.015, '#78a78a', 0.038);
    } else if (type === 'firefight') {
      ctx.rotate(-0.22 + swing * 0.35);
      polygon(ctx, [[-0.1, -0.06], [0.15, -0.06], [0.12, 0.18], [-0.07, 0.18]], '#81a9aa', '#466e70', 0.025);
      ellipse(ctx, 0.025, -0.06, 0.125, 0.043, '#c2dfcf');
      ctx.beginPath(); ctx.arc(0.025, -0.075, 0.1, Math.PI, TAU); ctx.strokeStyle = '#d0cfab'; ctx.lineWidth = 0.023; ctx.stroke();
    } else if (type === 'feed') {
      ellipse(ctx, 0.035, 0.08, 0.16, 0.08, '#ad9062');
      ellipse(ctx, 0.035, 0.045, 0.14, 0.055, '#e1ce91');
      line(ctx, 0.1, 0, 0.19 + swing * 0.05, -0.11, '#c8cead', 0.027);
      ellipse(ctx, 0.2 + swing * 0.05, -0.12, 0.035, 0.026, '#d5dab5');
    } else if (type === 'recreate') {
      ctx.translate(swing * 0.14, -0.03 - Math.abs(swing) * 0.2); ctx.rotate(-0.3 + swing);
      ctx.beginPath(); ctx.arc(0.03, 0.035, 0.105, -0.35, Math.PI * 1.55); ctx.strokeStyle = '#c9c5a0'; ctx.lineWidth = 0.035; ctx.stroke();
    } else if (type === 'equip') {
      rect(ctx, -0.07, -0.1, 0.24, 0.27, '#788d72', 0.045);
      line(ctx, -0.015, -0.04, 0.12, 0.105, '#d7c994', 0.028);
      line(ctx, 0.12, -0.04, -0.015, 0.105, '#d7c994', 0.028);
    } else if (type === 'research') {
      ctx.rotate(-0.2);
      rect(ctx, -0.03, -0.06, 0.25, 0.26, '#e1dcb7', 0.015, '#8b9b7f', 0.02);
      line(ctx, 0.02, 0, 0.15, 0, '#78988c', 0.02);
      line(ctx, 0.02, 0.07, 0.12, 0.07, '#78988c', 0.02);
      line(ctx, 0.1 + swing * 0.04, 0.16, 0.2 + swing * 0.04, -0.06, '#8c7048', 0.025);
    } else {
      ctx.rotate(-0.6 + swing);
      line(ctx, 0, 0.12, 0.06, -0.28, '#b99c68', 0.043);
      if (type === 'mine') {
        line(ctx, -0.11, -0.25, 0.23, -0.31, '#b9c3af', 0.055);
        line(ctx, 0.23, -0.31, 0.25, -0.23, '#96aa9c', 0.04);
      } else if (type === 'build' || type === 'repair' || type === 'craft') rect(ctx, -0.07, -0.32, 0.25, 0.09, '#a6b6a8', 0.025);
      else if (type === 'grow') polygon(ctx, [[-0.02, -0.23], [0.17, -0.25], [0.14, -0.4], [0.02, -0.38]], '#a5b2a0');
      else polygon(ctx, [[0.02, -0.25], [0.2, -0.35], [0.2, -0.17], [0.045, -0.17]], '#b7c2b0');
    }
    ctx.restore();
  }

  _bar(ctx, x, y, width, value, color, height = 0.065) {
    rect(ctx, x - 0.025, y - 0.025, width + 0.05, height + 0.05, 'rgba(26,43,37,.8)', 0.035);
    if (value > 0) rect(ctx, x, y, Math.max(0.005, width * clamp(value, 0, 1)), height, color, 0.025);
  }

  _drawDesignation(ctx, tile) {
    const color = tile.designation === 'mine' ? '#b6c9bd' : tile.designation === 'harvest' ? '#e7bc8c' : '#edd097';
    const x = tile.x + 0.85, y = tile.y + 0.08;
    ellipse(ctx, x, y, 0.19, 0.19, 'rgba(35,54,43,.82)');
    ctx.save(); ctx.translate(x, y);
    if (tile.designation === 'harvest') {
      ellipse(ctx, 0, 0.03, 0.075, 0.07, color);
      line(ctx, 0.01, -0.01, 0.03, -0.1, '#9eba7e', 0.035);
    } else {
      line(ctx, -0.075, 0.09, 0.055, -0.08, color, 0.035);
      if (tile.designation === 'mine') line(ctx, -0.04, -0.1, 0.11, -0.005, color, 0.045);
      else polygon(ctx, [[0.025, -0.1], [0.12, -0.05], [0.065, 0.025], [-0.005, -0.025]], color);
    }
    ctx.restore();
  }

  _drawEffect(ctx, effect) {
    const x = number(effect.x), y = number(effect.y);
    const age = Math.max(0, number(effect.age));
    const t = clamp(age / Math.max(0.001, number(effect.life, 0.5)), 0, 1);
    if (t >= 1) return;
    const color = effect.color || (effect.kind === 'heal' ? '#b0ddbc' : '#edc580');
    ctx.save(); ctx.globalAlpha = 1 - t;
    if (effect.text === '낙뢰') {
      const fade = clamp(1 - t * 1.8, 0, 1);
      ctx.globalAlpha *= fade;
      ctx.beginPath(); ctx.moveTo(x + 0.35, y - 3.1); ctx.lineTo(x - 0.13, y - 1.86);
      ctx.lineTo(x + 0.23, y - 1.95); ctx.lineTo(x - 0.11, y - 0.82); ctx.lineTo(x + 0.12, y - 0.92); ctx.lineTo(x, y);
      ctx.strokeStyle = '#f5d897'; ctx.lineWidth = 0.11; ctx.stroke();
      ctx.strokeStyle = '#fff1c9'; ctx.lineWidth = 0.035; ctx.stroke();
      ellipse(ctx, x, y, 0.35 + t * 0.5, 0.2 + t * 0.15, 'rgba(244,218,150,.22)');
    } else if (String(effect.text || '').includes('진화')) {
      for (let k = 0; k < 7; k++) {
        const angle = k * TAU / 7, distance = 0.14 + t * 0.48;
        ellipse(ctx, x + Math.cos(angle) * distance, y - 0.12 + Math.sin(angle) * distance * 0.6, 0.025, 0.045, '#beded8', angle);
      }
    } else if (effect.kind === 'shot') {
      const tx = number(effect.tx, x), ty = number(effect.ty, y);
      line(ctx, x, y - 0.08, tx, ty - 0.08, 'rgba(247,214,145,.24)', 0.025);
      const head = clamp(t * 2.8, 0.3, 1), tail = Math.max(0, head - 0.22);
      line(ctx, mix(x, tx, tail), mix(y, ty, tail) - 0.08, mix(x, tx, head), mix(y, ty, head) - 0.08, color, 0.045);
      if (t < 0.3) ellipse(ctx, x, y - 0.08, 0.11, 0.11, '#ffe6ab');
    } else if (effect.kind === 'heal') {
      const py = y - 0.5 - t * 0.5;
      line(ctx, x - 0.1, py, x + 0.1, py, color, 0.055);
      line(ctx, x, py - 0.1, x, py + 0.1, color, 0.055);
    } else {
      for (let i = 0; i < 5; i++) {
        const angle = i / 5 * TAU + 0.4, distance = 0.1 + t * 0.45;
        const px = x + Math.cos(angle) * distance, py = y + Math.sin(angle) * distance - t * 0.16;
        line(ctx, px, py, px + Math.cos(angle) * 0.07, py + Math.sin(angle) * 0.07, effect.kind === 'hit' ? '#dfac87' : color, 0.045);
      }
    }
    ctx.restore();
  }

  _drawHover(ctx, hover, tool) {
    const tile = this._tile(hover.x, hover.y);
    if (!tile) return;
    const { x, y } = hover;
    let valid = true;
    if (tool.type === 'build') valid = tile.terrain !== 'water' && !tile.building && !tile.feature && !tile.crop && !['farm', 'stockpile'].includes(tile.zone) && number(tile.fire) <= 0;
    else if (tool.type === 'zone') valid = tile.terrain !== 'water' && tile.terrain !== 'stone' && !tile.building;
    else if (tool.type === 'gather') valid = ['tree', 'berry', 'ore'].includes(tile.feature);
    else if (tool.type === 'demolish') valid = Boolean(tile.building?.complete);
    else if (tool.type === 'cancel') valid = Boolean(tile.designation || tile.zone || (tile.building && !tile.building.complete));
    else if (tool.type === 'chop') valid = tile.feature === 'tree';
    else if (tool.type === 'mine') valid = tile.feature === 'ore';
    else if (tool.type === 'harvest') valid = tile.feature === 'berry' || Boolean(tile.crop);
    else if (tool.type === 'firefight' || tool.type === 'extinguish') valid = number(tile.fire) > 0;
    const fireTarget = ['prioritize', 'firefight', 'extinguish'].includes(tool.type) && number(tile.fire) > 0;
    const color = fireTarget ? '#bce6dc' : valid ? '#f2d59a' : '#df9980';
    ctx.save();
    if (tool.type === 'build' && !tile.building) this._drawBlueprint(ctx, x, y, tool.kind, null, color);
    else {
      rect(ctx, x + 0.035, y + 0.035, 0.93, 0.93, valid ? 'rgba(244,210,143,.07)' : 'rgba(213,117,92,.11)', 0.06);
      const segments = [
        [x + 0.04, y + 0.26, x + 0.04, y + 0.04], [x + 0.04, y + 0.04, x + 0.26, y + 0.04],
        [x + 0.74, y + 0.04, x + 0.96, y + 0.04], [x + 0.96, y + 0.04, x + 0.96, y + 0.26],
        [x + 0.04, y + 0.74, x + 0.04, y + 0.96], [x + 0.04, y + 0.96, x + 0.26, y + 0.96],
        [x + 0.74, y + 0.96, x + 0.96, y + 0.96], [x + 0.96, y + 0.74, x + 0.96, y + 0.96]
      ];
      for (const segment of segments) line(ctx, ...segment, color, 0.045);
    }
    if (fireTarget) {
      ellipse(ctx, x + 0.8, y + 0.1, 0.18, 0.18, '#3d6c6b');
      ctx.beginPath(); ctx.moveTo(x + 0.8, y - 0.01);
      ctx.quadraticCurveTo(x + 0.65, y + 0.17, x + 0.8, y + 0.2);
      ctx.quadraticCurveTo(x + 0.95, y + 0.17, x + 0.8, y - 0.01);
      ctx.fillStyle = '#c9e7d8'; ctx.fill();
    }
    ctx.restore();
  }

  _screenPoint(x, y) {
    const scale = TILE * this.camera.zoom;
    return { x: (x - this.camera.x) * scale + this.width / 2, y: (y - this.camera.y) * scale + this.height / 2 };
  }

  _drawNameplates(ctx, pawns, raiders, selectedId) {
    const scale = TILE * this.camera.zoom;
    ctx.save();
    ctx.font = `500 ${this.width < 600 ? 10 : 11}px ${FONT}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const pawn of [...pawns, ...raiders]) {
      if (!pawn || pawn.dead || !this._isVisible(pawn.x, pawn.y)) continue;
      const carrier = pawn.carriedBy && this._pawnById?.get(pawn.carriedBy);
      if (carrier && !carrier.dead && carrier.carryingPawnId === pawn.id) continue;
      const selected = this._selectedIds.has(pawn.id);
      const hostile = raiders.includes(pawn);
      const hovered = this._hover && Math.floor(pawn.x) === this._hover.x && Math.floor(pawn.y) === this._hover.y;
      if (hostile && !selected && !hovered) continue;
      if (scale < 19 && !selected && !hovered) continue;
      const point = this._screenPoint(pawn.x, pawn.y + 0.58);
      if (point.x < -30 || point.x > this.width + 30 || point.y < 0 || point.y > this.height + 20) continue;
      const carrying = pawn.carryingPawnId && this._pawnById?.get(pawn.carryingPawnId);
      const text = String(pawn.name || (hostile ? '침입자' : '정착민')) + (carrying ? ' · 구조 중' : !hostile && number(pawn.health, 100) < 15 ? ' · 쓰러짐' : !hostile && pawn.patientBedId ? ' · 침상 안정' : '');
      const width = Math.ceil(ctx.measureText(text).width) + 15;
      rect(ctx, point.x - width / 2, point.y - 8, width, 17, selected ? 'rgba(35,49,43,.94)' : 'rgba(30,48,41,.78)', 5, selected ? 'rgba(232,196,128,.65)' : null, 1);
      ctx.fillStyle = selected ? '#f5dba8' : hostile ? '#edb4a0' : '#eee9d2';
      ctx.fillText(text, point.x, point.y + 0.5);
    }
    ctx.restore();
  }

  _drawWeather(ctx, weather) {
    if (weather === 'rain') {
      ctx.fillStyle = 'rgba(33,58,73,.09)'; ctx.fillRect(0, 0, this.width, this.height);
      ctx.strokeStyle = 'rgba(197,215,207,.22)'; ctx.lineWidth = 1;
      const count = Math.min(100, Math.round(this.width * this.height / 10000));
      ctx.beginPath();
      for (let i = 0; i < count; i++) {
        const x = (randomAt(i, 8) * (this.width + 120) - this._time * 24) % (this.width + 120);
        const y = (randomAt(i, 9) * this.height + this._time * 220) % (this.height + 40) - 20;
        const px = x < -30 ? x + this.width + 120 : x;
        ctx.moveTo(px, y); ctx.lineTo(px - 4, y + 13);
      }
      ctx.stroke();
    } else if (weather === 'heat') {
      const haze = ctx.createLinearGradient(0, 0, 0, this.height);
      haze.addColorStop(0, 'rgba(243,191,100,.10)'); haze.addColorStop(1, 'rgba(236,178,92,0)');
      ctx.fillStyle = haze; ctx.fillRect(0, 0, this.width, this.height);
    }
  }

  _drawVignette(ctx) {
    const radius = Math.max(this.width, this.height) * 0.7;
    const shade = ctx.createRadialGradient(this.width / 2, this.height / 2, radius * 0.35, this.width / 2, this.height / 2, radius);
    shade.addColorStop(0, 'rgba(17,35,30,0)');
    shade.addColorStop(1, 'rgba(17,35,30,.19)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, this.width, this.height);
  }
}
