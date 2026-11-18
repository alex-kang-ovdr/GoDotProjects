(function (root) {
  'use strict';

  var TAU = Math.PI * 2;
  var FONT = '"Inter", "Pretendard", "Noto Sans KR", system-ui, sans-serif';
  var TEAM = [
    { main: '#67ddd0', light: '#d0f6e9', dark: '#215e62', fill: '#379f9d' },
    { main: '#ef8d79', light: '#ffe1be', dark: '#743d40', fill: '#c9635d' },
    { main: '#e8bc77', light: '#fff0cc', dark: '#69523f', fill: '#bd975e' }
  ];
  var FALLBACK_MAP = {
    width: 1600,
    height: 1600,
    bases: [{ x: 165, y: 1435 }, { x: 1435, y: 165 }],
    lanes: {
      top: [[165, 1435], [165, 800], [165, 165], [800, 165], [1435, 165]],
      mid: [[165, 1435], [800, 800], [1435, 165]],
      bot: [[165, 1435], [800, 1435], [1435, 1435], [1435, 800], [1435, 165]]
    },
    brushes: [
      { x: 510, y: 980, r: 92 }, { x: 620, y: 700, r: 88 },
      { x: 980, y: 620, r: 88 }, { x: 1090, y: 900, r: 92 },
      { x: 165, y: 530, r: 75 }, { x: 1070, y: 165, r: 75 },
      { x: 530, y: 1435, r: 75 }, { x: 1435, y: 1070, r: 75 }
    ],
    camps: [
      { id: 'c0', x: 385, y: 1040, kind: 'camp' },
      { id: 'c1', x: 1215, y: 560, kind: 'camp' },
      { id: 'c2', x: 640, y: 1240, kind: 'camp' },
      { id: 'c3', x: 960, y: 360, kind: 'camp' },
      { id: 'dragon', x: 1080, y: 1080, kind: 'dragon' },
      { id: 'boss', x: 520, y: 520, kind: 'boss' }
    ],
    obstacles: []
  };
  var RIVER = [[-60, 405], [240, 455], [520, 520], [800, 800], [1080, 1080], [1280, 1215], [1660, 1275]];

  function number(v, fallback) {
    return Number.isFinite(v) ? v : fallback;
  }
  function clamp(v, a, b) {
    return Math.min(b, Math.max(a, v));
  }
  function teamColor(team) {
    return TEAM[team === 0 ? 0 : team === 1 ? 1 : 2];
  }
  function living(e) {
    return !!e && e.alive !== false && number(e.hp, 1) > 0;
  }
  function structural(e) {
    return !!e && (e.type === 'tower' || e.type === 'inhibitor' || e.type === 'nexus');
  }
  function rgba(color, a) {
    var s = String(color || '#67ddd0').replace('#', '');
    if (/^[a-f0-9]{3}$/i.test(s)) s = s.split('').map(function (c) { return c + c; }).join('');
    if (/^[a-f0-9]{6}$/i.test(s)) {
      return 'rgba(' + parseInt(s.slice(0, 2), 16) + ',' + parseInt(s.slice(2, 4), 16) + ',' + parseInt(s.slice(4, 6), 16) + ',' + clamp(a, 0, 1) + ')';
    }
    var m = String(color).match(/rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/);
    if (m) return 'rgba(' + m[1] + ',' + m[2] + ',' + m[3] + ',' + clamp(a, 0, 1) + ')';
    return 'rgba(103,221,208,' + clamp(a, 0, 1) + ')';
  }
  function seeded(seed) {
    var s = seed >>> 0;
    return function () {
      s += 0x6D2B79F5;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function offscreen(w, h) {
    if (root.document && root.document.createElement) {
      var c = root.document.createElement('canvas');
      c.width = w;
      c.height = h;
      return c;
    }
    if (typeof root.OffscreenCanvas === 'function') return new root.OffscreenCanvas(w, h);
    return null;
  }
  function polygon(ctx, points, fill, stroke, width) {
    if (!points.length) return;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (var i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width || 1; ctx.stroke(); }
  }
  function line(ctx, points, color, width) {
    if (!points.length) return;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (var i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }
  function circle(ctx, x, y, r, fill, stroke, width) {
    if (!(r > 0)) return;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width || 1; ctx.stroke(); }
  }
  function ellipse(ctx, x, y, rx, ry, fill, stroke, width) {
    if (!(rx > 0 && ry > 0)) return;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width || 1; ctx.stroke(); }
  }
  function roundRect(ctx, x, y, w, h, r, fill, stroke, width) {
    if (!(w > 0 && h > 0)) return;
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width || 1; ctx.stroke(); }
  }
  function glow(ctx, x, y, r, color, opacity) {
    if (!(r > 0)) return;
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(color, opacity));
    g.addColorStop(0.4, rgba(color, opacity * 0.5));
    g.addColorStop(1, rgba(color, 0));
    circle(ctx, x, y, r, g);
  }
  function distanceSegment(x, y, a, b) {
    var vx = b[0] - a[0], vy = b[1] - a[1];
    var d = vx * vx + vy * vy;
    var t = d > 0 ? clamp(((x - a[0]) * vx + (y - a[1]) * vy) / d, 0, 1) : 0;
    return Math.hypot(x - a[0] - t * vx, y - a[1] - t * vy);
  }
  function distancePath(x, y, points) {
    var best = Infinity;
    for (var i = 1; i < points.length; i++) best = Math.min(best, distanceSegment(x, y, points[i - 1], points[i]));
    return best;
  }
  function regularPoints(n, r, sy, angle) {
    var a = [];
    for (var i = 0; i < n; i++) {
      var t = (angle || 0) + TAU * i / n;
      a.push([Math.cos(t) * r, Math.sin(t) * r * (sy || 1)]);
    }
    return a;
  }
  function crystal(ctx, x, y, w, h, color, light, opacity) {
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha *= opacity == null ? 1 : opacity;
    var g = ctx.createLinearGradient(-w, -h, w, 0);
    g.addColorStop(0, light);
    g.addColorStop(0.35, color);
    g.addColorStop(1, rgba(color, 0.55));
    polygon(ctx, [[0, -h], [w * 0.7, -h * 0.65], [w, -h * 0.3], [0, 0], [-w * 0.8, -h * 0.3], [-w * 0.6, -h * 0.7]], g, rgba(light, 0.8), 1);
    polygon(ctx, [[0, -h], [0, 0], [-w * 0.8, -h * 0.3], [-w * 0.6, -h * 0.7]], rgba(light, 0.27));
    line(ctx, [[0, -h], [w * 0.7, -h * 0.65], [0, 0]], rgba(light, 0.75), 1);
    ctx.restore();
  }

  class Renderer {
    constructor(canvas, game) {
      this.canvas = canvas;
      this.ctx = null;
      if (canvas && typeof canvas.getContext === 'function') {
        try { this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true }); }
        catch (_) { this.ctx = canvas.getContext('2d'); }
      }
      this.camera = { x: 800, y: 800, zoom: 0.8 };
      this.follow = true;
      this.width = 960;
      this.height = 640;
      this.dpr = 1;
      this._time = 0;
      this._fogClock = 1;
      this._fogDirty = true;
      this._memory = new Map();
      this._hazardMemory = new Map();
      this._map = FALLBACK_MAP;
      this._terrain = null;
      this._fog = null;
      this._fogCtx = null;
      this._fogPixels = null;
      this._explored = null;
      this._miniBackground = null;
      this._view = { left: 0, top: 0, right: 1600, bottom: 1600 };
      this.resize();
      this.setGame(game);
    }

    resize() {
      if (!this.canvas) return;
      var rect = this.canvas.getBoundingClientRect ? this.canvas.getBoundingClientRect() : null;
      var w = rect && number(rect.width, 0) > 0 ? rect.width : number(this.canvas.clientWidth, 0);
      var h = rect && number(rect.height, 0) > 0 ? rect.height : number(this.canvas.clientHeight, 0);
      this.width = Math.max(1, Math.round(w > 0 ? w : this.width || 960));
      this.height = Math.max(1, Math.round(h > 0 ? h : this.height || 640));
      this.dpr = clamp(number(root.devicePixelRatio, 1), 1, 2);
      var pw = Math.max(1, Math.round(this.width * this.dpr));
      var ph = Math.max(1, Math.round(this.height * this.dpr));
      if (this.canvas.width !== pw) this.canvas.width = pw;
      if (this.canvas.height !== ph) this.canvas.height = ph;
      this.camera.zoom = clamp(Math.min(this.width / 1030, this.height / 700) * 0.85, 0.65, 0.9);
      this._clampCamera();
    }

    setGame(game) {
      this.game = game || null;
      var m = game && game.map ? game.map : root.NexusGame && root.NexusGame.MAP ? root.NexusGame.MAP : FALLBACK_MAP;
      this._map = {
        width: Math.max(1, number(m.width, 1600)),
        height: Math.max(1, number(m.height, 1600)),
        bases: Array.isArray(m.bases) ? m.bases : FALLBACK_MAP.bases,
        lanes: m.lanes || FALLBACK_MAP.lanes,
        brushes: Array.isArray(m.brushes) ? m.brushes : FALLBACK_MAP.brushes,
        camps: Array.isArray(m.camps) ? m.camps : FALLBACK_MAP.camps,
        obstacles: Array.isArray(m.obstacles) ? m.obstacles : root.NexusNavigation && Array.isArray(root.NexusNavigation.WALLS) ? root.NexusNavigation.WALLS : []
      };
      this._river = RIVER.map(function (point) {
        return [point[0] * this._map.width / 1600, point[1] * this._map.height / 1600];
      }, this);
      this._time = 0;
      this._memory.clear();
      this._hazardMemory.clear();
      this._fogClock = 1;
      this._fogDirty = true;
      this._buildTerrain();
      this._buildFog();
      this._rememberStructures();
      var p = game && game.player;
      this.camera.x = p ? number(p.x, this._map.width * 0.5) : this._map.width * 0.5;
      this.camera.y = p ? number(p.y, this._map.height * 0.5) : this._map.height * 0.5;
      this.follow = true;
      this._clampCamera();
    }

    panTo(x, y) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      this.follow = false;
      this.camera.x = x;
      this.camera.y = y;
      this._clampCamera();
    }

    screenToWorld(x, y) {
      var z = number(this.camera.zoom, 0.8) || 0.8;
      return { x: this.camera.x + (number(x, this.width / 2) - this.width / 2) / z, y: this.camera.y + (number(y, this.height / 2) - this.height / 2) / z };
    }

    worldToScreen(x, y) {
      return { x: (number(x, this.camera.x) - this.camera.x) * this.camera.zoom + this.width / 2, y: (number(y, this.camera.y) - this.camera.y) * this.camera.zoom + this.height / 2 };
    }

    _clampCamera() {
      var z = clamp(number(this.camera.zoom, 0.8), 0.65, 0.9);
      this.camera.zoom = z;
      var hw = this.width / (2 * z), hh = this.height / (2 * z);
      var mw = this._map.width, mh = this._map.height;
      this.camera.x = hw >= mw / 2 ? mw / 2 : clamp(number(this.camera.x, mw / 2), hw, mw - hw);
      this.camera.y = hh >= mh / 2 ? mh / 2 : clamp(number(this.camera.y, mh / 2), hh, mh - hh);
      this._view = { left: this.camera.x - hw, top: this.camera.y - hh, right: this.camera.x + hw, bottom: this.camera.y + hh };
    }

    _visible(e) {
      if (!e) return false;
      if (e.team === 0) return true;
      if (this.game && typeof this.game.isVisible === 'function') {
        try { return !!this.game.isVisible(e, 0); } catch (_) { return false; }
      }
      return this._pointVisible(number(e.x, 0), number(e.y, 0));
    }

    _pointVisible(x, y) {
      if (this.game && typeof this.game.visibilityAt === 'function') {
        try { return !!this.game.visibilityAt(x, y, 0); } catch (_) { return false; }
      }
      var p = this.game && this.game.player;
      return !p || Math.hypot(x - number(p.x, 0), y - number(p.y, 0)) < 460;
    }

    _inView(x, y, margin) {
      var v = this._view, m = margin || 80;
      return x > v.left - m && x < v.right + m && y > v.top - m && y < v.bottom + m;
    }

    _rememberStructures() {
      var entities = this.game && Array.isArray(this.game.entities) ? this.game.entities : [];
      for (var i = 0; i < entities.length; i++) {
        var e = entities[i];
        if (!structural(e) || !Number.isFinite(e.x) || !Number.isFinite(e.y)) continue;
        var id = e.id != null ? e.id : e.type + ':' + e.x + ':' + e.y;
        var old = this._memory.get(id);
        if (!old) {
          old = { id: id, type: e.type, team: e.team, x: e.x, y: e.y, r: e.r, structureTier: e.structureTier, lane: e.lane, alive: true, seen: false };
          this._memory.set(id, old);
        }
        if (this._visible(e)) {
          old.alive = living(e);
          old.seen = true;
          old.lastSeen = number(this.game.time, 0);
          old.x = e.x;
          old.y = e.y;
        }
      }
    }

    _buildTerrain() {
      // Paint the authored landscape in its original coordinate space, then
      // stretch the cached image to the actual world bounds. Gameplay actors
      // keep their own world size. The cache is capped independently of map
      // size so a 2x battlefield does not allocate a 3200x3200 canvas.
      var source = this._map, sx = source.width / 1600, sy = source.height / 1600;
      var normalize = function (entry) {
        return Object.assign({}, entry, { x: entry.x / sx, y: entry.y / sy },
          Number.isFinite(entry.r) ? { r: entry.r / Math.min(sx, sy) } : {});
      };
      var map = {
        width: 1600, height: 1600,
        bases: source.bases.map(normalize),
        lanes: Object.fromEntries(Object.entries(source.lanes).map(function (entry) {
          return [entry[0], entry[1].map(function (point) { return [point[0] / sx, point[1] / sy]; })];
        })),
        camps: source.camps.map(normalize), brushes: source.brushes.map(normalize), obstacles: source.obstacles.map(normalize)
      };
      var cacheScale = Math.min(1, 2048 / Math.max(source.width, source.height));
      this._terrain = offscreen(Math.max(1, Math.round(source.width * cacheScale)), Math.max(1, Math.round(source.height * cacheScale)));
      if (!this._terrain) return;
      var ctx = this._terrain.getContext('2d');
      if (!ctx) return;
      ctx.scale(this._terrain.width / 1600, this._terrain.height / 1600);
      var random = seeded(0xC0A57);
      var w = map.width, h = map.height;
      var ground = ctx.createLinearGradient(0, 0, w, h);
      ground.addColorStop(0, '#152c2b');
      ground.addColorStop(0.5, '#1b3631');
      ground.addColorStop(1, '#12272a');
      ctx.fillStyle = ground;
      ctx.fillRect(0, 0, w, h);

      var regions = [[390, 800, 420], [820, 350, 390], [760, 1240, 370], [1280, 650, 330], [350, 1250, 300]];
      for (var j = 0; j < regions.length; j++) {
        var region = regions[j];
        glow(ctx, region[0], region[1], region[2], j % 2 ? '#5e7150' : '#2f6656', 0.19);
      }
      for (var i = 0; i < 2500; i++) {
        var x = random() * w, y = random() * h;
        var r = 0.5 + random() * 2.1;
        ctx.fillStyle = i % 3 ? 'rgba(166,183,134,0.055)' : 'rgba(1,11,19,0.16)';
        ctx.fillRect(x, y, r * 1.7, r);
      }

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      line(ctx, RIVER, '#0d242c', 225);
      line(ctx, RIVER, '#344f46', 208);
      line(ctx, RIVER, '#203d41', 192);
      var water = ctx.createLinearGradient(200, 300, 1400, 1400);
      water.addColorStop(0, '#203d43');
      water.addColorStop(0.5, '#24515a');
      water.addColorStop(1, '#1b3e48');
      line(ctx, RIVER, water, 168);
      line(ctx, RIVER, 'rgba(62,124,129,0.16)', 112);
      for (i = 1; i < RIVER.length; i++) {
        var a = RIVER[i - 1], b = RIVER[i];
        var angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
        for (j = 0; j < 10; j++) {
          var f = (j + 0.5) / 10;
          var side = (random() - 0.5) * 116;
          var wx = a[0] + (b[0] - a[0]) * f - Math.sin(angle) * side;
          var wy = a[1] + (b[1] - a[1]) * f + Math.cos(angle) * side;
          ctx.save();
          ctx.translate(wx, wy);
          ctx.rotate(angle);
          ctx.strokeStyle = 'rgba(158,213,201,0.10)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(-11, 0);
          ctx.quadraticCurveTo(0, 3, 13 + random() * 16, 0);
          ctx.stroke();
          ctx.restore();
        }
      }

      var lanes = Object.keys(map.lanes).map(function (key) { return map.lanes[key]; }).filter(Array.isArray);
      for (i = 0; i < lanes.length; i++) {
        var points = lanes[i];
        line(ctx, points, '#102a2b', 142);
        line(ctx, points, '#3a5144', 130);
        line(ctx, points, '#555d4c', 116);
        line(ctx, points, '#7a7961', 103);
        line(ctx, points, '#929078', 88);
        line(ctx, points, 'rgba(186,175,139,0.11)', 67);
        for (j = 1; j < points.length; j++) {
          var p0 = points[j - 1], p1 = points[j];
          var len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
          var rot = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
          var count = Math.max(1, Math.floor(len / 36));
          for (var k = 1; k < count; k++) {
            var pct = k / count;
            ctx.save();
            ctx.translate(p0[0] + (p1[0] - p0[0]) * pct, p0[1] + (p1[1] - p0[1]) * pct);
            ctx.rotate(rot);
            var shift = (random() - 0.5) * 48;
            var rw = 18 + random() * 12;
            polygon(ctx, [[-rw, shift - 12], [rw - 6, shift - 14], [rw, shift + 10], [-rw + 5, shift + 13]],
              k % 3 === 0 ? 'rgba(203,191,149,0.17)' : 'rgba(53,65,56,0.10)', 'rgba(40,56,50,0.13)', 1);
            if (k % 3 === 0) line(ctx, [[-40, -40], [-33, -32], [-37, -21]], 'rgba(187,175,126,0.22)', 2);
            ctx.restore();
          }
        }
      }
      this._drawBridge(ctx, 800, 800, -Math.PI / 4, 202, 112);
      this._drawBridge(ctx, 165, 440, Math.PI / 2, 205, 111);
      this._drawBridge(ctx, 1435, 1235, Math.PI / 2, 205, 111);

      for (i = 0; i < 280; i++) {
        x = 40 + random() * (w - 80);
        y = 40 + random() * (h - 80);
        var pathDistance = Infinity;
        for (j = 0; j < lanes.length; j++) pathDistance = Math.min(pathDistance, distancePath(x, y, lanes[j]));
        var nearCamp = map.camps.some(function (c) { return Math.hypot(x - c.x, y - c.y) < (c.kind === 'camp' ? 93 : 126); });
        var nearBase = map.bases.some(function (base) { return Math.hypot(x - base.x, y - base.y) < 184; });
        var nearWall = map.obstacles.some(function (o) { return o && Math.hypot(x - o.x, y - o.y) < number(o.r, 0) + 28; });
        if (pathDistance < 89 || distancePath(x, y, RIVER) < 100 || nearCamp || nearBase || nearWall) continue;
        this._drawVegetation(ctx, x, y, 13 + random() * 23, random);
      }
      for (i = 0; i < 170; i++) {
        x = 30 + random() * (w - 60);
        y = 30 + random() * (h - 60);
        pathDistance = Infinity;
        for (j = 0; j < lanes.length; j++) pathDistance = Math.min(pathDistance, distancePath(x, y, lanes[j]));
        if (pathDistance < 65 || distancePath(x, y, RIVER) < 73) continue;
        if (i % 4 === 0) this._drawRock(ctx, x, y, 7 + random() * 12, random);
        else this._drawFern(ctx, x, y, 5 + random() * 8, random() * TAU, '#4b7153');
      }

      for (i = 0; i < map.camps.length; i++) {
        var camp = map.camps[i];
        var epic = camp.kind !== 'camp';
        var cr = epic ? 90 : 57;
        var cc = camp.kind === 'boss' ? '#a291c8' : camp.kind === 'dragon' ? '#d3a86e' : '#9b9d73';
        circle(ctx, camp.x, camp.y, cr + 14, 'rgba(8,24,28,0.31)', 'rgba(87,115,103,0.22)', 3);
        circle(ctx, camp.x, camp.y, cr, '#253b36', rgba(cc, 0.18), 2);
        circle(ctx, camp.x, camp.y, cr - 6, null, 'rgba(156,171,143,0.08)', 1);
        ctx.save();
        ctx.translate(camp.x, camp.y);
        ctx.setLineDash([5, 13]);
        circle(ctx, 0, 0, cr - 16, null, rgba(cc, 0.22), 1.5);
        ctx.restore();
        if (epic) {
          for (j = 0; j < 7; j++) {
            var ca = -Math.PI * 0.9 + j * Math.PI * 1.8 / 6;
            this._drawRock(ctx, camp.x + Math.cos(ca) * (cr + 5), camp.y + Math.sin(ca) * (cr + 5), 13 + random() * 9, random);
          }
          this._drawGroundSigil(ctx, camp.x, camp.y, cr * 0.45, cc);
        }
      }
      for (i = 0; i < map.brushes.length; i++) this._drawBrush(ctx, map.brushes[i], random);
      for (i = 0; i < map.obstacles.length; i++) {
        var ob = map.obstacles[i];
        if (!ob || !Number.isFinite(ob.x) || !Number.isFinite(ob.y) || !(ob.r > 0)) continue;
        this._drawCliff(ctx, ob, i);
      }
      for (i = 0; i < map.bases.length; i++) this._drawBase(ctx, map.bases[i].x, map.bases[i].y, i);

      ctx.save();
      ctx.font = '600 12px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(220,222,182,0.26)';
      ctx.fillText('TOP', 650, 164);
      ctx.fillText('BOT', 948, 1438);
      ctx.translate(1030, 572);
      ctx.rotate(-Math.PI / 4);
      ctx.fillStyle = 'rgba(229,219,182,0.24)';
      ctx.fillText('MID', 0, 0);
      ctx.restore();
      var edge = ctx.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.76);
      edge.addColorStop(0, 'rgba(2,13,20,0)');
      edge.addColorStop(1, 'rgba(2,13,20,0.38)');
      ctx.fillStyle = edge;
      ctx.fillRect(0, 0, w, h);
    }

    _drawBridge(ctx, x, y, angle, length, width) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      roundRect(ctx, -length / 2, -width / 2, length, width, 8, '#59695f', '#273f3d', 5);
      roundRect(ctx, -length / 2 + 7, -width / 2 + 9, length - 14, width - 18, 3, '#8c8e77', '#a8a589', 1);
      for (var i = -length / 2 + 21; i < length / 2; i += 30) line(ctx, [[i, -width / 2 + 10], [i - 3, width / 2 - 10]], 'rgba(48,66,61,0.34)', 2);
      for (var side = -1; side <= 1; side += 2) {
        line(ctx, [[-length / 2 + 11, side * width / 2], [length / 2 - 11, side * width / 2]], '#b0ad87', 7);
        line(ctx, [[-length / 2 + 11, side * width / 2 - 2], [length / 2 - 11, side * width / 2 - 2]], '#d0c59b', 1.5);
        for (var t = -1; t <= 1; t += 2) roundRect(ctx, t * (length / 2 - 12) - 6, side * width / 2 - 7, 12, 14, 2, '#8d947a', '#485d53', 2);
      }
      ctx.restore();
    }

    _drawFern(ctx, x, y, size, angle, color) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.strokeStyle = rgba(color, 0.55);
      ctx.lineWidth = 1.3;
      for (var i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(0, 4);
        ctx.quadraticCurveTo(i * size * 0.38, -size * 0.2, i * size * 0.47, -size * (1 - Math.abs(i) * 0.15));
        ctx.stroke();
      }
      ctx.restore();
    }

    _drawVegetation(ctx, x, y, r, random) {
      ctx.save();
      ctx.translate(x, y);
      ellipse(ctx, 5, r * 0.4, r * 1.3, r * 0.68, 'rgba(2,16,21,0.33)');
      line(ctx, [[0, r * 0.6], [0, -r * 0.3]], '#273e32', 5);
      var points = [];
      for (var i = 0; i < 9; i++) {
        var a = i * TAU / 9;
        var radius = r * (0.75 + random() * 0.3);
        points.push([Math.cos(a) * radius, Math.sin(a) * radius * 0.8 - r * 0.2]);
      }
      polygon(ctx, points, random() > 0.5 ? '#254b3e' : '#284c43', '#163831', 2);
      polygon(ctx, [[-r * 0.85, -r * 0.2], [-r * 0.2, -r * 0.95], [r * 0.65, -r * 0.45], [0, r * 0.08]],
        'rgba(96,133,83,0.21)');
      line(ctx, [[-r * 0.55, -r * 0.23], [-r * 0.12, -r * 0.58], [r * 0.37, -r * 0.3]], 'rgba(123,150,99,0.19)', 1.5);
      ctx.restore();
    }

    _drawRock(ctx, x, y, r, random) {
      ctx.save();
      ctx.translate(x, y);
      ellipse(ctx, 4, r * 0.37, r * 1.1, r * 0.52, 'rgba(3,17,24,0.30)');
      var bias = random ? random() * 0.2 : 0.1;
      polygon(ctx, [[-r, r * 0.2], [-r * 0.76, -r * 0.55], [-r * 0.1, -r * (0.8 + bias)], [r * 0.72, -r * 0.38], [r, r * 0.22], [r * 0.25, r * 0.58]], '#485b55', '#203d3b', 1.5);
      polygon(ctx, [[-r * 0.76, -r * 0.55], [-r * 0.1, -r * (0.8 + bias)], [r * 0.72, -r * 0.38], [r * 0.14, -r * 0.05]], '#6c7b6b');
      line(ctx, [[-r * 0.76, -r * 0.55], [r * 0.14, -r * 0.05], [r * 0.25, r * 0.58]], '#344c46', 1);
      ctx.restore();
    }

    _drawCliff(ctx, wall, index) {
      var r = wall.r;
      var random = seeded(0x6B1F + index * 971);
      ctx.save();
      ctx.translate(wall.x, wall.y);
      // The full circular footprint matches the navigation collision disk.
      circle(ctx, 4, 8, r + 5, 'rgba(2,15,22,0.42)');
      circle(ctx, 0, 0, r + 1, '#192e34', '#0c242b', 3);
      var face = ctx.createLinearGradient(-r, -r, r * 0.5, r);
      face.addColorStop(0, '#5e706d');
      face.addColorStop(0.48, '#435c59');
      face.addColorStop(1, '#263f45');
      circle(ctx, 0, 0, r, face, '#78877a', 1.5);
      var top = [], base = [], sides = 13;
      for (var i = 0; i < sides; i++) {
        var angle = i * TAU / sides + 0.12;
        var radius = r * (0.91 + random() * 0.07);
        base.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
        top.push([Math.cos(angle) * radius * 0.82 - 3, Math.sin(angle) * radius * 0.73 - r * 0.12]);
      }
      for (i = 0; i < sides; i++) {
        var next = (i + 1) % sides;
        polygon(ctx, [top[i], top[next], base[next], base[i]], i < 6 ? (i % 2 ? '#30484c' : '#3c5453') : '#657771', '#2b4447', 1.2);
        if (i < 6) line(ctx, [[top[i][0], top[i][1] + 4], [base[i][0], base[i][1] - 2]], 'rgba(7,28,35,0.50)', 2);
      }
      var cap = ctx.createLinearGradient(-r, -r, r, r);
      cap.addColorStop(0, '#91a08c');
      cap.addColorStop(0.5, '#708578');
      cap.addColorStop(1, '#536b62');
      polygon(ctx, top, cap, '#a7ad91', 1.2);
      polygon(ctx, [top[7], top[8], top[9], top[10], [-r * 0.08, -r * 0.18]], 'rgba(192,193,151,0.16)');
      line(ctx, [top[10], [-r * 0.12, -r * 0.16], [r * 0.19, r * 0.2], top[2]], '#435d57', 2.2);
      line(ctx, [[-r * 0.12, -r * 0.16], [-r * 0.3, r * 0.17], top[5]], 'rgba(36,62,55,0.65)', 1.5);
      for (i = 0; i < 7; i++) {
        var a = random() * TAU, d = (0.22 + random() * 0.45) * r;
        var px = Math.cos(a) * d, py = Math.sin(a) * d * 0.7 - r * 0.11;
        ellipse(ctx, px, py, 5 + random() * 9, 3 + random() * 5, i % 2 ? '#5b7958' : '#789068');
      }
      this._drawRock(ctx, -r * 0.25, -r * 0.2, r * 0.18, random);
      this._drawRock(ctx, r * 0.22, -r * 0.05, r * 0.13, random);
      // Short pale strokes identify the impassable rim among decorative stones.
      ctx.beginPath();
      ctx.arc(0, 0, r - 1, Math.PI * 1.08, Math.PI * 1.73);
      ctx.strokeStyle = 'rgba(188,195,157,0.55)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    _drawBrush(ctx, b, random) {
      var x = number(b.x, 0), y = number(b.y, 0), r = Math.max(12, number(b.r, 65));
      ctx.save();
      ctx.translate(x, y);
      ellipse(ctx, 0, 0, r, r * 0.72, 'rgba(15,44,34,0.54)', 'rgba(126,154,94,0.11)', 1.5);
      for (var i = 0; i < 42; i++) {
        var a = random() * TAU, d = Math.sqrt(random()) * r * 0.9;
        var px = Math.cos(a) * d, py = Math.sin(a) * d * 0.68;
        var h = 10 + random() * 15;
        polygon(ctx, [[px - 5, py + 5], [px - 5 - random() * 5, py - h * 0.45], [px - 1, py - h * 0.2], [px + random() * 4, py - h], [px + 4, py - h * 0.2], [px + 10, py - h * 0.7], [px + 5, py + 5]],
          i % 3 === 0 ? '#567b50' : i % 3 === 1 ? '#3b6245' : '#476f4a');
        if (i % 3 === 0) line(ctx, [[px, py + 3], [px + 1, py - h * 0.7]], 'rgba(174,190,108,0.25)', 1);
      }
      ctx.restore();
    }

    _drawGroundSigil(ctx, x, y, r, color) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 4);
      polygon(ctx, [[0, -r], [r, 0], [0, r], [-r, 0]], null, rgba(color, 0.19), 1.4);
      circle(ctx, 0, 0, r * 0.64, null, rgba(color, 0.16), 1);
      line(ctx, [[-r * 0.32, 0], [r * 0.32, 0]], rgba(color, 0.17), 1);
      line(ctx, [[0, -r * 0.32], [0, r * 0.32]], rgba(color, 0.17), 1);
      ctx.restore();
    }

    _drawBase(ctx, x, y, team) {
      var c = teamColor(team);
      ctx.save();
      ctx.translate(x, y);
      glow(ctx, 0, 0, 184, c.main, 0.18);
      circle(ctx, 0, 0, 152, '#314742', '#142e32', 10);
      circle(ctx, 0, 0, 142, '#697467', '#8d9980', 3);
      circle(ctx, 0, 0, 126, '#3b5550', rgba(c.main, 0.38), 2);
      circle(ctx, 0, 0, 105, '#29423f', '#6a8170', 3);
      circle(ctx, 0, 0, 91, null, rgba(c.main, 0.42), 1.5);
      for (var i = 0; i < 12; i++) {
        ctx.save();
        ctx.rotate(TAU * i / 12);
        line(ctx, [[0, -131], [0, -141]], '#2f4a44', 3);
        line(ctx, [[-3, -116], [0, -121], [3, -116], [0, -111], [-3, -116]], rgba(c.light, 0.43), 1);
        if (i % 3 === 0) polygon(ctx, [[-7, -85], [0, -94], [7, -85], [0, -78]], rgba(c.main, 0.25), rgba(c.light, 0.35), 1);
        ctx.restore();
      }
      this._drawGroundSigil(ctx, 0, 0, 64, c.main);
      ctx.restore();
    }

    _buildFog() {
      // Preserve the 20-world-unit sampling size across the three map sizes.
      this._fogCols = clamp(Math.ceil(this._map.width / 20), 80, 160);
      this._fogRows = Math.max(1, Math.round(this._fogCols * this._map.height / this._map.width));
      this._fog = offscreen(this._fogCols, this._fogRows);
      if (!this._fog) return;
      this._fogCtx = this._fog.getContext('2d');
      if (!this._fogCtx) return;
      this._fogPixels = this._fogCtx.createImageData(this._fogCols, this._fogRows);
      this._explored = new Uint8Array(this._fogCols * this._fogRows);
    }

    _updateFog(dt) {
      if (!this._fogCtx || !this._fogPixels) return;
      this._fogClock += dt;
      if (!this._fogDirty && this._fogClock < 0.15) return;
      this._fogDirty = false;
      this._fogClock = 0;
      var data = this._fogPixels.data;
      var cols = this._fogCols, rows = this._fogRows;
      var dx = this._map.width / cols, dy = this._map.height / rows;
      for (var y = 0; y < rows; y++) {
        for (var x = 0; x < cols; x++) {
          var i = y * cols + x, p = i * 4;
          var visible = this._pointVisible((x + 0.5) * dx, (y + 0.5) * dy);
          if (visible) this._explored[i] = 1;
          data[p] = 6;
          data[p + 1] = 17;
          data[p + 2] = 26;
          data[p + 3] = visible ? 0 : this._explored[i] ? 134 : 182;
        }
      }
      this._fogCtx.putImageData(this._fogPixels, 0, 0);
    }

    render(dt, options) {
      if (!this.ctx || !this.canvas) return;
      dt = clamp(number(dt, 1 / 60), 0, 0.1);
      options = options || {};
      this._time += dt;
      var game = this.game;
      var player = game && game.player;
      if (this.follow && player) {
        var followAmount = 1 - Math.exp(-dt * 10);
        this.camera.x += (number(player.x, this.camera.x) - this.camera.x) * followAmount;
        this.camera.y += (number(player.y, this.camera.y) - this.camera.y) * followAmount;
      }
      this._clampCamera();
      this._rememberStructures();
      this._updateFog(dt);

      var ctx = this.ctx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#07171e';
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.save();
      ctx.translate(this.width / 2, this.height / 2);
      ctx.scale(this.camera.zoom, this.camera.zoom);
      ctx.translate(-this.camera.x, -this.camera.y);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.imageSmoothingEnabled = true;
      if (this._terrain) ctx.drawImage(this._terrain, 0, 0, this._map.width, this._map.height);
      else {
        ctx.fillStyle = '#1b3530';
        ctx.fillRect(0, 0, this._map.width, this._map.height);
      }

      this._drawAmbient(ctx);
      var all = game && Array.isArray(game.entities) ? game.entities : [];
      var visibleIds = new Set();
      var entities = [];
      for (var i = 0; i < all.length; i++) {
        var e = all[i];
        if (!e || !Number.isFinite(e.x) || !Number.isFinite(e.y) || !this._visible(e)) continue;
        if (e.id != null) visibleIds.add(e.id);
        if (!this._inView(e.x, e.y, 130)) continue;
        if (living(e) || structural(e) || e === player) entities.push(e);
      }
      if (player && all.indexOf(player) === -1 && Number.isFinite(player.x) && Number.isFinite(player.y)) entities.push(player);
      this._memory.forEach(function (memory, id) {
        if (visibleIds.has(id) || memory.team === 0 || !this._inView(memory.x, memory.y, 120)) return;
        ctx.save();
        ctx.globalAlpha = memory.seen ? 0.38 : 0.3;
        this._drawStructure(ctx, memory, true);
        ctx.restore();
      }, this);
      if (this._fog) ctx.drawImage(this._fog, 0, 0, this._map.width, this._map.height);
      this._drawTowerDanger(ctx, all);
      this._drawHazards(ctx);
      this._drawNavigationPath(ctx);
      this._drawAttackRange(ctx, options);
      this._drawAbilityIndicator(ctx, options);

      entities.sort(function (a, b) { return a.y - b.y; });
      for (i = 0; i < entities.length; i++) {
        e = entities[i];
        if (structural(e)) this._drawStructure(ctx, e, false);
        else if (e.type === 'hero') this._drawHero(ctx, e, e === player || (player && e.id === player.id));
        else if (e.type === 'minion' && living(e)) this._drawMinion(ctx, e);
        else if (e.type === 'monster' && living(e)) this._drawMonster(ctx, e);
        else if (e.type === 'ward' && living(e)) this._drawWard(ctx, e);
      }

      var projectiles = game && Array.isArray(game.projectiles) ? game.projectiles : [];
      for (i = 0; i < projectiles.length; i++) {
        var p = projectiles[i];
        if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !this._inView(p.x, p.y, 80) || !this._pointVisible(p.x, p.y)) continue;
        this._drawProjectile(ctx, p);
      }
      var effects = game && Array.isArray(game.effects) ? game.effects : [];
      for (i = 0; i < effects.length; i++) {
        var effect = effects[i];
        if (!effect || !Number.isFinite(effect.x) || !Number.isFinite(effect.y) || number(effect.life, 1) <= 0 || !this._pointVisible(effect.x, effect.y)) continue;
        if (!this._inView(effect.x, effect.y, Math.max(160, number(effect.r, 0)))) continue;
        this._drawEffect(ctx, effect);
      }
      for (i = 0; i < entities.length; i++) this._drawHealth(ctx, entities[i], entities[i] === player);
      this._drawFocusTarget(ctx);
      var floaters = game && Array.isArray(game.floaters) ? game.floaters : [];
      for (i = 0; i < floaters.length; i++) {
        var f = floaters[i];
        if (!f || !Number.isFinite(f.x) || !Number.isFinite(f.y) || !this._inView(f.x, f.y, 60) || !this._pointVisible(f.x, f.y)) continue;
        this._drawFloater(ctx, f);
      }
      this._drawOrder(ctx);
      ctx.restore();
      this._drawScreenVignette(ctx);
    }

    _drawAmbient(ctx) {
      var river = this._river || RIVER;
      for (var i = 0; i < 15; i++) {
        var a = river[i % (river.length - 1)];
        var b = river[i % (river.length - 1) + 1];
        var t = ((i * 0.237 + this._time * 0.009) % 1);
        var x = a[0] + (b[0] - a[0]) * t;
        var y = a[1] + (b[1] - a[1]) * t + Math.sin(i * 3.1) * 38;
        if (!this._inView(x, y, 20)) continue;
        var alpha = 0.12 + Math.sin(this._time * 1.2 + i) * 0.06;
        ellipse(ctx, x, y, 5 + i % 3 * 3, 1.1, rgba('#b8e5d6', alpha));
      }
    }

    _drawHero(ctx, e, isPlayer) {
      var x = e.x, y = e.y;
      var color = teamColor(e.team);
      var radius = clamp(number(e.r, 18), 12, 30);
      var scale = radius / 18;
      if (!living(e)) {
        if (isPlayer) {
          circle(ctx, x, y, radius + 9, 'rgba(110,183,185,0.05)', 'rgba(151,218,215,0.23)', 1.2);
          polygon(ctx, [[x, y - 14], [x + 6, y - 4], [x, y + 9], [x - 6, y - 4]], 'rgba(174,225,220,0.26)');
        }
        return;
      }
      ellipse(ctx, x + 3, y + radius * 0.5, radius * 1.18, radius * 0.62, 'rgba(2,15,24,0.48)');
      if (isPlayer) {
        circle(ctx, x, y + 2, radius + 10, rgba(color.main, 0.07), rgba(color.light, 0.85), 1.5);
        ctx.save();
        ctx.translate(x, y + 2);
        for (var i = 0; i < 4; i++) {
          ctx.rotate(Math.PI / 2);
          polygon(ctx, [[-3.3, -radius - 14], [0, -radius - 18], [3.3, -radius - 14], [0, -radius - 11]], color.main);
        }
        ctx.restore();
      } else circle(ctx, x, y + 3, radius + 4, null, rgba(color.main, 0.55), 1.5);

      var face = number(e.facing, e.team === 0 ? -Math.PI / 4 : Math.PI * 3 / 4);
      var attackState = this._attackState(e);
      this._drawAttackCue(ctx, e, isPlayer, attackState);
      // Wind up the weapon before the actual release, then return it quickly.
      // The phase clock comes from simulation time, so pausing freezes the cue.
      var releaseAge = attackState.phase === 'recovery' ? Math.max(0, attackState.duration - attackState.remaining) : Infinity;
      var attack = attackState.phase === 'windup' ? 0.18 + attackState.progress * 0.82 :
        releaseAge < 0.13 ? (1 - releaseAge / 0.13) * 0.8 : 0;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(face + Math.PI / 2);
      ctx.scale(scale, scale);
      if (e.hero === 'warrior') this._drawWarrior(ctx, color, attack);
      else if (e.hero === 'ranger') this._drawRanger(ctx, color, attack);
      else this._drawMage(ctx, color, attack);
      ctx.restore();
      if (releaseAge < 0.13) {
        var release = 1 - releaseAge / 0.13;
        var releaseX = x + Math.cos(face) * (radius + 10), releaseY = y + Math.sin(face) * (radius + 10);
        circle(ctx, releaseX, releaseY, 4 + (1 - release) * 12, null, rgba(color.light, release * 0.72), 1.6);
        line(ctx, [[x + Math.cos(face) * radius, y + Math.sin(face) * radius],
          [x + Math.cos(face) * (radius + 19), y + Math.sin(face) * (radius + 19)]], rgba(color.light, release * 0.85), 2.2);
      }
      if (number(e.shield, 0) > 0) {
        glow(ctx, x, y, radius + 17, '#b1e5ef', 0.07);
        circle(ctx, x, y, radius + 13, null, 'rgba(195,237,247,0.55)', 1.6);
        ctx.save();
        ctx.setLineDash([7, 12]);
        circle(ctx, x, y, radius + 17, null, 'rgba(195,237,247,0.2)', 1);
        ctx.restore();
      }
      if (number(e.recallLeft, 0) > 0) this._drawRecall(ctx, e);
      if (number(e.stunnedUntil, 0) > number(this.game && this.game.time, 0)) {
        for (i = 0; i < 3; i++) {
          var sa = this._time * 2.4 + i * TAU / 3;
          var sx = x + Math.cos(sa) * 15, sy = y - radius - 7 + Math.sin(sa) * 5;
          polygon(ctx, [[sx, sy - 4], [sx + 2, sy - 1], [sx + 5, sy], [sx + 2, sy + 1], [sx, sy + 4], [sx - 2, sy + 1], [sx - 4, sy], [sx - 2, sy - 1]], '#efd591');
        }
      }
    }

    _attackState(hero) {
      var state = this.game && typeof this.game.getAttackState === 'function' ? this.game.getAttackState(hero) : null;
      if (!state || !['ready', 'windup', 'recovery', 'disabled'].includes(state.phase)) {
        return { phase: 'disabled', progress: 0, remaining: 0, duration: 0, targetId: null };
      }
      return {
        phase: state.phase,
        progress: clamp(number(state.progress, 0), 0, 1),
        remaining: Math.max(0, number(state.remaining, 0)),
        duration: Math.max(0, number(state.duration, 0)),
        targetId: state.targetId || null
      };
    }

    _drawAttackCue(ctx, hero, isPlayer, state) {
      if (!living(hero) || !this._visible(hero)) return;
      state = state || this._attackState(hero);
      if (state.phase === 'disabled' || (!isPlayer && state.phase !== 'windup')) return;
      var windup = state.phase === 'windup';
      var color = windup ? '#f4a65e' : '#84eee3';
      var radius = clamp(number(hero.r, 18), 12, 30) + (isPlayer ? 15 : 7);
      var x = hero.x, y = hero.y + 2;
      var face = number(hero.facing, -Math.PI / 4);
      ctx.save();
      if (isPlayer) {
        circle(ctx, x, y, radius, null, rgba(color, 0.16), 2.5);
        ctx.beginPath();
        ctx.arc(x, y, radius, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0.006, state.progress));
        ctx.strokeStyle = rgba(color, windup ? 0.94 : state.phase === 'ready' ? 0.67 : 0.8);
        ctx.lineWidth = windup ? 3.2 : 2;
        ctx.stroke();
        if (windup) {
          var target = this.game.entities && this.game.entities.find(function (entity) { return entity.id === state.targetId; });
          // Never infer a destination from an unseen target retained in a save
          // or from a target that disappeared between simulation/render steps.
          if (target && living(target) && this._visible(target) && Number.isFinite(target.x) && Number.isFinite(target.y)) {
            var dx = target.x - hero.x, dy = target.y - hero.y, distance = Math.hypot(dx, dy);
            if (distance > radius + number(target.r, 18)) {
              var ux = dx / distance, uy = dy / distance;
              ctx.setLineDash([3, 7]);
              line(ctx, [[hero.x + ux * (radius + 5), hero.y + uy * (radius + 5)],
                [target.x - ux * (number(target.r, 18) + 5), target.y - uy * (number(target.r, 18) + 5)]], rgba(color, 0.32 + state.progress * 0.22), 1.1);
              ctx.setLineDash([]);
            }
          }
        }
      }
      if (windup) {
        var arc = 0.75 * (1 - state.progress) + 0.15;
        ctx.beginPath();
        ctx.arc(x, y, radius + (isPlayer ? 5 : 2), face - arc, face + arc);
        ctx.strokeStyle = rgba(color, isPlayer ? 0.95 : 0.7);
        ctx.lineWidth = isPlayer ? 2.5 : 2;
        ctx.stroke();
        circle(ctx, x + Math.cos(face) * radius, y + Math.sin(face) * radius,
          isPlayer ? 2 + state.progress * 1.4 : 1.6, rgba('#ffe3c4', 0.55 + state.progress * 0.35));
      }
      ctx.restore();
    }

    _drawMage(ctx, c, attack) {
      var cape = ctx.createLinearGradient(0, -13, 0, 25);
      cape.addColorStop(0, '#7183b9');
      cape.addColorStop(0.4, '#4b6099');
      cape.addColorStop(1, '#263d66');
      polygon(ctx, [[-8, -8], [8, -8], [14, 11], [8, 24], [0, 20], [-9, 24], [-14, 10]], cape, '#182f45', 1.5);
      line(ctx, [[-8, -6], [-10, 14], [-8, 21]], '#bfb887', 1.3);
      line(ctx, [[8, -6], [10, 14], [8, 21]], '#bfb887', 1.3);
      polygon(ctx, [[-7, -5], [7, -5], [8, 10], [0, 15], [-8, 10]], '#7088b9', '#b0b5bd', 1);
      roundRect(ctx, -8, 14, 5, 8, 1, '#203443');
      roundRect(ctx, 3, 14, 5, 8, 1, '#203443');
      polygon(ctx, [[-11, -6], [-4, -9], [-3, -1], [-11, 1]], '#d0c798', '#7e825f', 1);
      polygon(ctx, [[11, -6], [4, -9], [3, -1], [11, 1]], '#d0c798', '#7e825f', 1);
      circle(ctx, 0, -12, 7.4, '#c9b99d', '#263b53', 1.3);
      ctx.beginPath();
      ctx.arc(0, -13, 8.3, Math.PI * 0.92, Math.PI * 2.08);
      ctx.lineTo(7, -10);
      ctx.lineTo(-7, -10);
      ctx.closePath();
      ctx.fillStyle = '#8397c2';
      ctx.fill();
      line(ctx, [[-4, -12], [4, -12]], '#2d435a', 1.2);
      polygon(ctx, [[0, -5], [3, 0], [0, 4], [-3, 0]], c.main, c.light, 0.7);
      ctx.save();
      ctx.translate(13, 3);
      ctx.rotate(-0.12 - attack * 0.32);
      line(ctx, [[2, 14], [-1, -24]], '#233c44', 5);
      line(ctx, [[2, 14], [-1, -24]], '#d4bc84', 2.7);
      glow(ctx, -1, -24, 18, '#92acfa', 0.4);
      crystal(ctx, -1, -18, 5, 13, '#92adf4', '#e3ecff');
      circle(ctx, 1, 2, 3, '#d7c09c');
      ctx.restore();
      glow(ctx, -14, 3, 10, c.main, 0.22);
      circle(ctx, -14, 3, 3.3, c.light, c.main, 1);
    }

    _drawWarrior(ctx, c, attack) {
      polygon(ctx, [[-10, -9], [10, -9], [15, 15], [6, 22], [-11, 20], [-15, 9]], c.dark, '#18303a', 2);
      line(ctx, [[-9, 1], [-9, 17]], c.main, 1.6);
      line(ctx, [[9, 1], [10, 16]], c.main, 1.6);
      roundRect(ctx, -11, 12, 8, 11, 2, '#293c43', '#78908a', 1);
      roundRect(ctx, 3, 12, 8, 11, 2, '#293c43', '#78908a', 1);
      var armor = ctx.createLinearGradient(-10, -10, 10, 14);
      armor.addColorStop(0, '#d2d4bd');
      armor.addColorStop(0.55, '#788c8b');
      armor.addColorStop(1, '#4a616a');
      polygon(ctx, [[-10, -7], [0, -11], [10, -7], [12, 8], [0, 16], [-12, 8]], armor, '#344951', 1.6);
      polygon(ctx, [[-7, -3], [7, -3], [0, 8]], c.main, '#d1c795', 1);
      line(ctx, [[0, -9], [0, 13]], '#d1c795', 1.4);
      polygon(ctx, [[-16, -8], [-9, -12], [-7, -3], [-16, 1], [-19, -3]], '#9da9a1', '#d2c690', 1.4);
      polygon(ctx, [[16, -8], [9, -12], [7, -3], [16, 1], [19, -3]], '#9da9a1', '#d2c690', 1.4);
      polygon(ctx, [[-7, -18], [0, -22], [7, -18], [7, -9], [0, -6], [-7, -9]], '#9eafaa', '#334b55', 1.5);
      line(ctx, [[-5, -13], [5, -13]], '#142e3c', 2.5);
      line(ctx, [[0, -21], [0, -7]], '#ddcd98', 2.1);
      ctx.save();
      ctx.translate(-16, 5);
      ctx.rotate(-0.18);
      polygon(ctx, [[-8, -9], [6, -9], [9, 1], [1, 13], [-8, 4]], c.dark, '#d8c994', 2);
      polygon(ctx, [[-1, -5], [4, 1], [-1, 7], [-5, 0]], c.main, c.light, 0.8);
      ctx.restore();
      ctx.save();
      ctx.translate(17, 6);
      ctx.rotate(0.13 - attack * 0.75);
      line(ctx, [[0, 8], [0, -11]], '#d0b87e', 3);
      polygon(ctx, [[-3, -8], [-4, -28], [0, -38], [4, -28], [3, -8]], '#bdcfcd', '#e2ecda', 1);
      line(ctx, [[0, -35], [0, -9]], '#7698a1', 1.2);
      line(ctx, [[-7, -6], [7, -6]], '#e0cc8f', 3);
      circle(ctx, 0, 3, 3.3, '#cab593');
      ctx.restore();
    }

    _drawRanger(ctx, c, attack) {
      polygon(ctx, [[-7, -12], [8, -12], [13, 8], [8, 22], [0, 17], [-9, 22], [-14, 5]], '#2d665b', '#153c3c', 2);
      polygon(ctx, [[-8, -6], [7, -6], [8, 11], [0, 15], [-9, 9]], '#527e61', '#acbb87', 1);
      roundRect(ctx, -8, 13, 5, 9, 1, '#263d3e');
      roundRect(ctx, 3, 13, 5, 9, 1, '#263d3e');
      line(ctx, [[-7, -3], [8, 10]], '#bc9a69', 3);
      polygon(ctx, [[-10, -8], [-6, -20], [0, -25], [7, -19], [10, -8], [0, -6]], '#5b8a6e', '#1b4340', 1.5);
      polygon(ctx, [[-5, -14], [5, -14], [3, -8], [-3, -8]], '#cfc0a0');
      line(ctx, [[-3, -12], [3, -12]], '#274943', 1.3);
      polygon(ctx, [[0, -3], [3, 1], [0, 4], [-3, 1]], c.main, c.light, 0.7);
      ctx.save();
      ctx.translate(-11, 7);
      ctx.rotate(-0.25);
      roundRect(ctx, -3, -8, 7, 18, 2, '#6e6250', '#b69c6a', 1);
      for (var i = 0; i < 3; i++) {
        line(ctx, [[-2 + i * 2, 7], [-2 + i * 2, -19 + i * 2]], '#c9c4a0', 1);
        polygon(ctx, [[-4 + i * 2, -14 + i * 2], [-2 + i * 2, -20 + i * 2], [i * 2, -14 + i * 2]], c.light);
      }
      ctx.restore();
      ctx.save();
      ctx.translate(14, 0);
      ctx.rotate(-0.15 - attack * 0.2);
      ctx.beginPath();
      ctx.moveTo(-1, -22);
      ctx.bezierCurveTo(17, -15, 17, 15, -1, 22);
      ctx.strokeStyle = '#cfbd83';
      ctx.lineWidth = 3.5;
      ctx.stroke();
      line(ctx, [[-1, -22], [-5 - attack * 5, 0], [-1, 22]], '#d9e7c4', 1);
      line(ctx, [[-9, 0], [20, 0]], '#c9d9c1', 1.5);
      polygon(ctx, [[25, 0], [17, -3], [17, 3]], c.light, c.main, 1);
      circle(ctx, -3, 0, 3.4, '#cbb898');
      ctx.restore();
    }

    _drawRecall(ctx, e) {
      var c = teamColor(e.team);
      var r = number(e.r, 18) + 21;
      ctx.save();
      ctx.translate(e.x, e.y);
      glow(ctx, 0, 0, r * 1.7, c.main, 0.11);
      ctx.rotate(this._time * 0.7);
      ctx.setLineDash([11, 5, 2, 5]);
      circle(ctx, 0, 0, r, null, rgba(c.light, 0.65), 1.7);
      ctx.restore();
      for (var i = 0; i < 5; i++) {
        var t = (this._time * 0.55 + i / 5) % 1;
        var x = e.x + Math.cos(i * 2.1) * r * 0.5;
        var y = e.y - t * 85;
        line(ctx, [[x, y], [x, y - 7]], rgba(c.light, (1 - t) * 0.55), 1.3);
      }
    }

    _drawMinion(ctx, e) {
      var c = teamColor(e.team);
      var r = clamp(number(e.r, 10), 7, 20);
      var kind = e.kind || 'melee';
      var s = r / 10;
      ellipse(ctx, e.x + 2, e.y + 5, r * 0.95, r * 0.5, 'rgba(3,15,23,0.45)');
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(number(e.facing, e.team === 0 ? -Math.PI / 4 : Math.PI * 3 / 4) + Math.PI / 2);
      ctx.scale(s, s);
      if (kind === 'siege') {
        roundRect(ctx, -13, -6, 5, 19, 2, '#24383c', '#849387', 1);
        roundRect(ctx, 8, -6, 5, 19, 2, '#24383c', '#849387', 1);
        polygon(ctx, [[-10, -7], [10, -7], [10, 10], [0, 15], [-10, 10]], '#637771', '#293f46', 1.5);
        roundRect(ctx, -4, -20, 8, 24, 2, '#b0b49b', '#304b50', 1.5);
        ellipse(ctx, 0, -20, 3.4, 2, '#152c38', c.main, 1);
        crystal(ctx, 0, 11, 5, 12, c.main, c.light);
      } else if (kind === 'super') {
        polygon(ctx, [[-11, -9], [11, -9], [14, 6], [8, 17], [-8, 17], [-14, 6]], '#8b9f98', '#263e47', 2);
        polygon(ctx, [[-10, -6], [0, -11], [10, -6], [0, 11]], c.fill, c.light, 1.3);
        polygon(ctx, [[-7, -17], [7, -17], [8, -8], [0, -3], [-8, -8]], '#c6c8ab', '#405550', 1.3);
        line(ctx, [[-4, -11], [4, -11]], '#273942', 2);
        roundRect(ctx, -18, -4, 8, 14, 2, '#9b9e84', '#d0c696', 1);
        roundRect(ctx, 10, -4, 8, 14, 2, '#9b9e84', '#d0c696', 1);
        roundRect(ctx, -8, 13, 6, 7, 1, '#2c4148');
        roundRect(ctx, 2, 13, 6, 7, 1, '#2c4148');
      } else if (kind === 'ranged' || kind === 'caster') {
        polygon(ctx, [[0, -10], [7, 1], [8, 13], [-8, 13], [-7, 1]], c.dark, c.fill, 1.4);
        polygon(ctx, [[0, -16], [7, -7], [5, -2], [-5, -2], [-7, -7]], c.fill, c.light, 1);
        line(ctx, [[-3, -5], [3, -5]], '#172d35', 1.5);
        line(ctx, [[9, 10], [9, -12]], '#c2b181', 2);
        crystal(ctx, 9, -9, 3, 8, c.main, c.light);
      } else {
        polygon(ctx, [[-6, -5], [6, -5], [8, 8], [0, 12], [-8, 8]], c.fill, '#213d45', 1.4);
        roundRect(ctx, -6, 9, 4, 6, 1, '#253943');
        roundRect(ctx, 2, 9, 4, 6, 1, '#253943');
        circle(ctx, 0, -8, 5.3, '#a2b3ac', '#304b50', 1.3);
        line(ctx, [[-4, -7], [4, -7]], '#263841', 1.6);
        line(ctx, [[0, -13], [0, -6]], c.main, 1.5);
        polygon(ctx, [[-12, -4], [-5, -5], [-4, 4], [-9, 8], [-13, 3]], c.dark, '#aeb797', 1.2);
        line(ctx, [[9, 8], [9, -14]], '#b3a77e', 1.8);
        polygon(ctx, [[9, -20], [6, -13], [12, -13]], '#d4dcc7', '#718f8e', 1);
      }
      ctx.restore();
    }

    _drawPlatform(ctx, r, c, dead) {
      ellipse(ctx, 4, 10, r * 1.19, r * 0.69, 'rgba(2,15,24,0.46)');
      ctx.save();
      ctx.translate(0, 7);
      polygon(ctx, regularPoints(8, r, 0.65, Math.PI / 8), dead ? '#34483f' : '#405955', '#243c3f', 2);
      ctx.restore();
      polygon(ctx, regularPoints(8, r, 0.65, Math.PI / 8), dead ? '#526354' : '#7e8c79', '#a4ac88', 1);
      ellipse(ctx, 0, 0, r * 0.78, r * 0.49, '#314c49', dead ? '#647464' : rgba(c.main, 0.5), 2);
      if (!dead) ellipse(ctx, 0, -1, r * 0.61, r * 0.37, null, rgba(c.light, 0.3), 1);
    }

    _drawStructure(ctx, e, memory) {
      var c = teamColor(e.team);
      var type = e.type;
      var r = clamp(number(e.r, type === 'nexus' ? 48 : 30), 18, 65);
      var alive = e.alive !== false && number(e.hp, 1) > 0;
      ctx.save();
      ctx.translate(e.x, e.y);
      this._drawPlatform(ctx, r, c, !alive);
      if (!alive) {
        polygon(ctx, [[-17, -4], [-8, -19], [2, -4]], '#5c7971', '#7c9584', 1);
        polygon(ctx, [[4, 2], [15, -13], [21, 2]], rgba(c.main, 0.29), '#5c7468', 1);
        line(ctx, [[-r * 0.7, 7], [-7, 1], [0, 7], [r * 0.58, 1]], '#233b38', 2);
        ctx.restore();
        return;
      }
      if (type === 'tower') {
        polygon(ctx, [[-14, -4], [-13, -29], [0, -35], [13, -29], [14, -4], [0, 4]], '#6c8580', '#2c494a', 2);
        polygon(ctx, [[0, -35], [13, -29], [14, -4], [0, 4]], '#3c5e62');
        line(ctx, [[-9, -25], [-9, -3]], '#c0b98b', 2);
        line(ctx, [[9, -25], [9, -3]], '#c0b98b', 2);
        if (!memory) glow(ctx, 0, -34, 34, c.main, 0.19 + Math.sin(this._time * 1.8 + e.x) * 0.025);
        crystal(ctx, 0, -20, 11, 36, c.main, c.light);
        var inner = e.structureTier === 'inner' || e.structureTier === 'base';
        if (inner) {
          crystal(ctx, -19, -8, 5, 18, c.fill, c.light);
          crystal(ctx, 19, -8, 5, 18, c.fill, c.light);
        }
        polygon(ctx, [[-18, -21], [-11, -25], [-8, -20], [-13, -16]], '#b4b389', '#657d6c', 1);
        polygon(ctx, [[18, -21], [11, -25], [8, -20], [13, -16]], '#b4b389', '#657d6c', 1);
      } else if (type === 'inhibitor') {
        ellipse(ctx, 0, -4, r * 0.65, r * 0.42, '#183c44', rgba(c.light, 0.6), 2);
        if (!memory) glow(ctx, 0, -14, 37, c.main, 0.25);
        crystal(ctx, -10, -6, 7, 23, c.fill, c.light);
        crystal(ctx, 11, -6, 7, 25, c.fill, c.light);
        crystal(ctx, 0, -8, 10, 36, c.main, c.light);
        ctx.save();
        ctx.rotate(-0.1);
        ctx.setLineDash([6, 5]);
        ellipse(ctx, 0, -8, r * 0.85, r * 0.5, null, rgba(c.main, 0.7), 1.5);
        ctx.restore();
      } else {
        if (!memory) glow(ctx, 0, -25, r * 1.6, c.main, 0.27);
        ellipse(ctx, 0, -6, r * 0.9, r * 0.56, '#243d45', '#b8b58a', 3);
        ellipse(ctx, 0, -7, r * 0.72, r * 0.44, null, rgba(c.light, 0.6), 1.8);
        for (var i = 0; i < 4; i++) {
          var a = i * Math.PI / 2 + Math.PI / 4;
          var px = Math.cos(a) * r * 0.72, py = Math.sin(a) * r * 0.39;
          polygon(ctx, [[px - 6, py], [px - 5, py - 16], [px + 5, py - 16], [px + 6, py]], '#71877c', '#bcb58c', 1);
          crystal(ctx, px, py - 13, 5, 13, c.fill, c.light);
        }
        crystal(ctx, 0, -9, r * 0.33, r * 1.27, c.main, c.light);
        if (!memory) {
          ctx.save();
          ctx.translate(0, -25);
          ctx.rotate(Math.sin(this._time * 0.4) * 0.12);
          ctx.setLineDash([15, 11]);
          ellipse(ctx, 0, 0, r * 0.7, r * 0.42, null, rgba(c.light, 0.55), 1.4);
          ctx.restore();
        }
      }
      var protectedState = false;
      if (!memory && this.game && typeof this.game.isProtected === 'function') {
        try { protectedState = !!this.game.isProtected(e); } catch (_) { protectedState = false; }
      }
      if (protectedState) {
        ctx.save();
        ctx.setLineDash([4, 7]);
        ellipse(ctx, 0, -20, r + 12, r * 1.12, 'rgba(170,208,224,0.025)', 'rgba(175,214,230,0.26)', 1.2);
        ctx.restore();
        roundRect(ctx, r - 3, -38, 8, 7, 1.4, '#233b46', '#adbfbd', 1);
        ctx.beginPath();
        ctx.arc(r + 1, -38, 3, Math.PI, TAU);
        ctx.strokeStyle = '#adbfbd';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      ctx.restore();
    }

    _drawMonster(ctx, e) {
      var kind = e.kind || 'camp';
      var r = clamp(number(e.r, kind === 'camp' ? 20 : 34), 14, 58);
      var s = r / (kind === 'camp' ? 20 : 34);
      ellipse(ctx, e.x + 4, e.y + 12, r * 1.2, r * 0.58, 'rgba(1,14,23,0.55)');
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.scale(s, s);
      if (kind === 'dragon') {
        var wing = Math.sin(this._time * 2.3) * 3;
        polygon(ctx, [[-8, -9], [-35, -28 - wing], [-48, -6], [-30, -11], [-25, 8], [-13, 4]], '#64746b', '#c7b088', 1.5);
        polygon(ctx, [[8, -9], [35, -28 + wing], [48, -6], [30, -11], [25, 8], [13, 4]], '#64746b', '#c7b088', 1.5);
        line(ctx, [[-9, -9], [-35, -28 - wing], [-25, 8]], '#9b9779', 1);
        line(ctx, [[9, -9], [35, -28 + wing], [25, 8]], '#9b9779', 1);
        ctx.beginPath();
        ctx.moveTo(0, 13);
        ctx.bezierCurveTo(0, 37, 24, 39, 26, 24);
        ctx.strokeStyle = '#9a8664';
        ctx.lineWidth = 9;
        ctx.stroke();
        ctx.strokeStyle = '#5b7165';
        ctx.lineWidth = 5;
        ctx.stroke();
        polygon(ctx, [[0, -27], [15, -12], [17, 9], [6, 24], [-6, 24], [-17, 9], [-15, -12]], '#6b8374', '#b2a67d', 1.8);
        polygon(ctx, [[-11, -23], [-8, -39], [0, -32], [8, -39], [11, -23], [7, -10], [-7, -10]], '#8f9b7d', '#3c5c58', 1.5);
        line(ctx, [[-6, -24], [-2, -22]], '#f6d382', 2);
        line(ctx, [[6, -24], [2, -22]], '#f6d382', 2);
        for (var i = 0; i < 4; i++) polygon(ctx, [[0, -11 + i * 7], [5, -7 + i * 7], [0, -3 + i * 7], [-5, -7 + i * 7]], '#aab68c', '#5b7364', 0.7);
        line(ctx, [[-13, 8], [-22, 20], [-28, 18]], '#9d9d7e', 6);
        line(ctx, [[13, 8], [22, 20], [28, 18]], '#9d9d7e', 6);
      } else if (kind === 'boss') {
        glow(ctx, 0, -6, 60, '#a68ee8', 0.18);
        polygon(ctx, [[-17, -17], [-31, -28], [-38, -7], [-28, 10], [-20, 3]], '#5d6282', '#a2a1bd', 1.7);
        polygon(ctx, [[17, -17], [31, -28], [38, -7], [28, 10], [20, 3]], '#5d6282', '#a2a1bd', 1.7);
        polygon(ctx, [[-22, -15], [0, -29], [22, -15], [19, 17], [0, 29], [-19, 17]], '#404e68', '#8691a9', 2);
        polygon(ctx, [[0, -17], [14, -6], [10, 13], [0, 20], [-10, 13], [-14, -6]], '#6f6b9b', '#b1a5d0', 1);
        crystal(ctx, 0, 10, 9, 28, '#b297ec', '#e0d8ff');
        polygon(ctx, [[-10, -23], [-18, -42], [-5, -35], [0, -39], [5, -35], [18, -42], [10, -23]], '#777994', '#b7b3bd', 1.7);
        line(ctx, [[-7, -26], [-2, -25]], '#e8d3ff', 2);
        line(ctx, [[7, -26], [2, -25]], '#e8d3ff', 2);
        polygon(ctx, [[-30, 4], [-39, 21], [-32, 29], [-22, 15]], '#5c6f7f', '#a5a4b4', 1.4);
        polygon(ctx, [[30, 4], [39, 21], [32, 29], [22, 15]], '#5c6f7f', '#a5a4b4', 1.4);
        for (i = 0; i < 3; i++) {
          var ba = this._time * 0.35 + i * TAU / 3;
          var bx = Math.cos(ba) * 44, by = Math.sin(ba) * 20;
          polygon(ctx, [[bx, by - 5], [bx + 4, by], [bx, by + 5], [bx - 4, by]], '#9e98bc', '#dbd1ef', 0.8);
        }
      } else {
        polygon(ctx, [[-17, -9], [-8, -18], [8, -18], [17, -9], [18, 10], [7, 19], [-8, 19], [-18, 8]], '#777a60', '#344e42', 1.8);
        polygon(ctx, [[-9, -13], [6, -17], [13, -4], [4, 9], [-11, 4]], '#a6a27a', '#647252', 1);
        polygon(ctx, [[-11, -22], [-4, -27], [9, -22], [12, -12], [3, -6], [-8, -10]], '#93977a', '#3c5848', 1.5);
        line(ctx, [[-5, -17], [-1, -16]], '#f1ce8a', 2);
        line(ctx, [[5, -17], [8, -16]], '#f1ce8a', 2);
        polygon(ctx, [[-20, -6], [-26, 2], [-22, 14], [-15, 10], [-13, -2]], '#647457', '#a8aa7d', 1.3);
        polygon(ctx, [[20, -6], [26, 2], [22, 14], [15, 10], [13, -2]], '#647457', '#a8aa7d', 1.3);
        crystal(ctx, 0, 8, 4.5, 12, '#d4ba7d', '#f4e4b0');
        roundRect(ctx, -11, 15, 8, 7, 2, '#4b6150');
        roundRect(ctx, 3, 15, 8, 7, 2, '#4b6150');
      }
      ctx.restore();
    }

    _drawWard(ctx, e) {
      var c = teamColor(e.team);
      ctx.save();
      ctx.translate(e.x, e.y);
      ellipse(ctx, 0, 4, 10, 5, 'rgba(4,20,27,0.45)');
      ellipse(ctx, 0, 2, 7, 4, '#607c6a', c.fill, 1);
      line(ctx, [[0, 2], [0, -14]], '#b4b88e', 3);
      glow(ctx, 0, -13, 17, c.main, 0.2);
      polygon(ctx, [[-8, -13], [0, -19], [8, -13], [0, -7]], '#234f55', c.main, 1.2);
      circle(ctx, 0, -13, 3, c.light);
      ctx.restore();
    }

    _drawProjectile(ctx, p) {
      var c = p.color || teamColor(p.team).main;
      var r = clamp(number(p.r, 4), 2, 14);
      var angle = Math.atan2(number(p.vy, 0), number(p.vx, 1));
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(angle);
      var g = ctx.createLinearGradient(-r * 6, 0, r, 0);
      g.addColorStop(0, rgba(c, 0));
      g.addColorStop(0.7, rgba(c, 0.45));
      g.addColorStop(1, rgba(c, 0.95));
      polygon(ctx, [[-r * 6, 0], [-r * 1.1, -r * 0.8], [r, 0], [-r * 1.1, r * 0.8]], g);
      glow(ctx, 0, 0, r * 3.3, c, 0.25);
      if (p.kind === 'arrow' || p.kind === 'ranger') {
        line(ctx, [[-r * 4, 0], [r, 0]], '#e5e8d0', 1.5);
        polygon(ctx, [[r * 2, 0], [-r * 0.3, -r], [0, 0], [-r * 0.3, r]], '#f1f4d9', c, 1);
      } else {
        polygon(ctx, [[r * 1.5, 0], [0, -r], [-r * 1.2, 0], [0, r]], c, rgba('#ffffff', 0.8), 0.8);
        circle(ctx, r * 0.2, 0, r * 0.37, '#edf9f0');
      }
      ctx.restore();
    }

    _drawEffect(ctx, e) {
      var max = Math.max(0.01, number(e.maxLife, 0.65));
      var alpha = clamp(number(e.life, max) / max, 0, 1);
      var progress = 1 - alpha;
      var radius = Math.max(5, number(e.r, 40));
      var c = e.color || '#a8ebdf';
      ctx.save();
      ctx.globalAlpha = Math.min(1, alpha * 1.5);
      ctx.translate(e.x, e.y);
      if (e.kind === 'beam' && Number.isFinite(e.x2) && Number.isFinite(e.y2)) {
        var dx = e.x2 - e.x, dy = e.y2 - e.y;
        var length = Math.hypot(dx, dy);
        ctx.rotate(Math.atan2(dy, dx));
        var g = ctx.createLinearGradient(0, 0, length, 0);
        g.addColorStop(0, rgba(c, 0.15));
        g.addColorStop(0.2, rgba(c, 0.7));
        g.addColorStop(1, rgba(c, 0.3));
        line(ctx, [[0, 0], [length, 0]], g, Math.min(36, radius * 0.5 + 7) * alpha);
        line(ctx, [[0, 0], [length, 0]], rgba('#e9fff7', 0.8), Math.max(1, alpha * 4));
      } else if (e.kind === 'slash') {
        var angle = Number.isFinite(e.x2) && Number.isFinite(e.y2) ? Math.atan2(e.y2 - e.y, e.x2 - e.x) : number(e.angle, -Math.PI / 4);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.arc(0, 0, radius * (0.7 + progress * 0.3), -1.2, 1.2);
        ctx.strokeStyle = rgba(c, 0.75);
        ctx.lineWidth = 5 + alpha * 8;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, radius * (0.76 + progress * 0.3), -1.05, 0.9);
        ctx.strokeStyle = '#f1f5dc';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else if (e.kind === 'heal') {
        glow(ctx, 0, 0, radius, c, 0.15);
        circle(ctx, 0, 0, radius * (0.65 + progress * 0.3), null, rgba(c, 0.65), 2);
        for (var i = 0; i < 4; i++) {
          var hx = Math.sin(i * 1.8) * radius * 0.42, hy = Math.cos(i * 1.8) * radius * 0.28 - progress * 34;
          line(ctx, [[hx - 4, hy], [hx + 4, hy]], c, 2);
          line(ctx, [[hx, hy - 4], [hx, hy + 4]], c, 2);
        }
      } else if (e.kind === 'shield') {
        glow(ctx, 0, 0, radius * 1.2, c, 0.12);
        circle(ctx, 0, 0, radius, rgba(c, 0.05), rgba(c, 0.7), 2);
        polygon(ctx, [[0, -12], [10, -8], [8, 5], [0, 12], [-8, 5], [-10, -8]], rgba(c, 0.14), rgba('#e8fff7', 0.65), 1);
      } else if (e.kind === 'teleport') {
        glow(ctx, 0, 0, radius * 1.4, c, 0.25);
        for (i = 0; i < 3; i++) {
          ellipse(ctx, 0, -i * 14 * progress, radius * (0.55 + progress * 0.3), radius * 0.32, null, rgba(c, 0.8 - i * 0.2), 2);
        }
        for (i = 0; i < 7; i++) {
          var tx = Math.sin(i * 2.1) * radius * 0.65;
          line(ctx, [[tx, 4], [tx, -30 - 35 * progress]], rgba(c, 0.32), 1.5);
        }
      } else if (e.kind === 'burst') {
        glow(ctx, 0, 0, radius * 1.15, c, 0.24 * alpha);
        circle(ctx, 0, 0, radius * (0.4 + progress * 0.55), null, rgba(c, 0.8), 2.5 * alpha + 0.5);
        for (i = 0; i < 10; i++) {
          var a = i * TAU / 10 + progress * 0.12;
          var inner = radius * (0.15 + progress * 0.4), outer = radius * (0.45 + progress * 0.65);
          line(ctx, [[Math.cos(a) * inner, Math.sin(a) * inner], [Math.cos(a) * outer, Math.sin(a) * outer]], i % 2 ? c : '#e9f4df', 1.6 * alpha + 0.5);
        }
      } else {
        var rr = radius * (0.65 + progress * 0.35);
        circle(ctx, 0, 0, rr, rgba(c, 0.045), rgba(c, 0.72), 2.5 * alpha + 0.5);
        ctx.save();
        ctx.rotate(progress * 0.5);
        ctx.setLineDash([8, 13]);
        circle(ctx, 0, 0, rr * 0.9, null, rgba(c, 0.25), 1);
        ctx.restore();
      }
      ctx.restore();
    }

    _drawHealth(ctx, e, isPlayer) {
      if (!living(e) || e.type === 'ward') return;
      var hp = clamp(number(e.hp, 1) / Math.max(1, number(e.maxHp, e.hp || 1)), 0, 1);
      var type = e.type;
      var lastHit = this._lastHitReady(e);
      if (type === 'minion' && hp > 0.99 && !lastHit) return;
      var w = type === 'hero' ? 54 : type === 'nexus' ? 82 : type === 'tower' ? 58 : type === 'monster' ? e.kind === 'camp' ? 44 : 84 : type === 'inhibitor' ? 52 : 25;
      var h = type === 'minion' ? 3 : type === 'hero' ? 6 : 5;
      var y = e.y - number(e.r, 18) - (type === 'tower' ? 34 : type === 'nexus' ? 35 : type === 'monster' ? 25 : type === 'inhibitor' ? 24 : 15);
      var x = e.x - w / 2;
      var color = teamColor(e.team);
      roundRect(ctx, x - 1.5, y - 1.5, w + 3, h + 3, 2, '#0a1c25', 'rgba(197,212,191,0.24)', 0.7);
      roundRect(ctx, x, y, w, h, 1, '#233c42');
      if (hp > 0) roundRect(ctx, x, y, Math.max(0.5, w * hp), h, 1, e.team === 2 ? '#d3ae6d' : color.main);
      if (lastHit) {
        roundRect(ctx, x - 2, y - 2, w + 4, h + 4, 2, null, 'rgba(250,215,116,0.88)', 1.1);
        var markerX = x + w + 8, markerY = y + h * 0.5;
        polygon(ctx, [[markerX, markerY - 4], [markerX + 3.5, markerY], [markerX, markerY + 4], [markerX - 3.5, markerY]], '#ffe199', '#3d3524', 1.2);
      }
      if (type !== 'minion') {
        ctx.fillStyle = 'rgba(247,255,228,0.32)';
        ctx.fillRect(x + 1, y, Math.max(0, w * hp - 2), 1);
      }
      if (type === 'hero' && number(e.shield, 0) > 0) {
        var shield = clamp(number(e.shield, 0) / Math.max(1, number(e.maxHp, 100)), 0, 1);
        ctx.fillStyle = '#d8ebef';
        ctx.fillRect(x, y - 2.7, w * shield, 1.5);
      }
      if (type === 'hero') {
        if (number(e.maxMana, 0) > 0) {
          roundRect(ctx, x, y + h + 3, w, 2.3, 1, '#172f40');
          var mana = clamp(number(e.mana, 0) / e.maxMana, 0, 1);
          if (mana > 0) roundRect(ctx, x, y + h + 3, w * mana, 2.3, 1, '#7daccf');
        }
        roundRect(ctx, x - 14, y - 3, 12, 12, 2, '#18323b', rgba(color.main, 0.8), 1);
        ctx.font = '700 9px ' + FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#eaf4e5';
        ctx.fillText(String(number(e.level, 1)), x - 8, y + 3);
        ctx.font = (isPlayer ? '700 ' : '500 ') + '10px ' + FONT;
        ctx.fillStyle = isPlayer ? '#e5f7e9' : e.team === 0 ? '#bad5cc' : '#edbcb0';
        ctx.textBaseline = 'bottom';
        var name = String(e.name || (e.hero === 'warrior' ? '수호자' : e.hero === 'ranger' ? '추적자' : '마도사'));
        ctx.fillText(name.length > 12 ? name.slice(0, 11) + '…' : name, e.x, y - 5);
        if (isPlayer) {
          polygon(ctx, [[e.x, y - 25], [e.x + 3, y - 20], [e.x, y - 17], [e.x - 3, y - 20]], '#d8eee0');
        }
      } else if (type === 'monster' && e.kind !== 'camp') {
        ctx.font = '600 10px ' + FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = '#e0d8b7';
        ctx.fillText(String(e.name || (e.kind === 'boss' ? '심연의 파수꾼' : '고대 비룡')), e.x, y - 5);
      }
    }

    _drawFloater(ctx, f) {
      var max = Math.max(0.1, number(f.maxLife, 0.95));
      var alpha = clamp(number(f.life, max) / max, 0, 1);
      if (alpha <= 0) return;
      var text = String(f.text == null ? '' : f.text);
      ctx.save();
      ctx.globalAlpha = Math.min(1, alpha * 2.3);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = (text.length > 7 ? '600 13px ' : '750 16px ') + FONT;
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = 'rgba(5,22,31,0.9)';
      ctx.strokeText(text, f.x, f.y - (1 - alpha) * 10);
      ctx.fillStyle = f.color || '#f4e5bc';
      ctx.fillText(text, f.x, f.y - (1 - alpha) * 10);
      ctx.restore();
    }

    _lastHitReady(entity) {
      var game = this.game, player = game && game.player;
      if (!game || game.over || !player || !living(player) || !entity || entity.type !== 'minion' || entity.team === player.team || !living(entity) || !this._visible(entity)) return false;
      if (typeof game.canLastHit !== 'function') return false;
      try { return !!game.canLastHit(entity); } catch (_) { return false; }
    }

    _drawTowerDanger(ctx, entities) {
      var game = this.game, player = game && game.player;
      if (!game || game.over || !player || !living(player) || !Number.isFinite(player.x) || !Number.isFinite(player.y)) return;
      var now = number(game.time, 0);
      for (var i = 0; i < entities.length; i++) {
        var tower = entities[i];
        if (!tower || tower.type !== 'tower' || tower.team === player.team || !living(tower) || !Number.isFinite(tower.x) || !Number.isFinite(tower.y)) continue;
        var range = clamp(number(tower.range, 340), 40, 700);
        if (Math.hypot(tower.x - player.x, tower.y - player.y) > range + 145 || !this._pointVisible(tower.x, tower.y)) continue;
        if (typeof game.isProtected === 'function') {
          try { if (game.isProtected(tower)) continue; } catch (_) { continue; }
        }
        var targeted = player.id != null && tower.targetId === player.id;
        var stacks = clamp(Math.floor(number(tower.rampStacks, 0)), 0, 3);
        var color = targeted ? '#ff8b73' : '#dbc28c';
        ctx.save();
        ctx.setLineDash(targeted ? [10, 7] : [5, 11]);
        ctx.lineDashOffset = targeted ? -now * 11 : 0;
        circle(ctx, tower.x, tower.y, range, null, rgba(color, targeted ? 0.69 : 0.27), targeted ? 1.85 : 1.0);
        ctx.setLineDash([]);
        if (targeted) {
          line(ctx, [[tower.x, tower.y - 30], [player.x, player.y]], 'rgba(18,24,30,0.70)', 3.5);
          ctx.setLineDash([7, 6]);
          line(ctx, [[tower.x, tower.y - 30], [player.x, player.y]], rgba(color, 0.82), 1.5);
          ctx.setLineDash([]);
          circle(ctx, player.x, player.y, number(player.r, 19) + 8, null, rgba(color, 0.75), 1.5);
          var labelX = tower.x, labelY = tower.y - number(tower.r, 34) - 65;
          roundRect(ctx, labelX - 55, labelY - 10, 110, 27, 5, 'rgba(28,27,32,0.94)', rgba(color, 0.68), 1);
          ctx.font = '650 10px ' + FONT;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ffe2cc';
          ctx.fillText(stacks > 0 ? '연속 공격 +' + stacks * 22 + '%' : '포탑 조준', labelX, labelY);
          for (var k = 0; k < 3; k++) roundRect(ctx, labelX - 17 + k * 12, labelY + 9, 9, 3, 1, k < stacks ? '#ffac76' : '#574348');
        }
        ctx.restore();
      }
    }

    _clipVisibleGround(ctx, x, y, radius) {
      // Use current vision, not explored fog memory. A public warning whose
      // center is hidden can still show the part that threatens visible ground.
      var step = Math.max(12, this._map.width / this._fogCols);
      var left = Math.max(0, Math.floor((x - radius - 5) / step));
      var top = Math.max(0, Math.floor((y - radius - 5) / step));
      var right = Math.min(Math.ceil(this._map.width / step), Math.ceil((x + radius + 5) / step));
      var bottom = Math.min(Math.ceil(this._map.height / step), Math.ceil((y + radius + 5) / step));
      var visible = false;
      ctx.beginPath();
      for (var row = top; row < bottom; row++) {
        for (var col = left; col < right; col++) {
          if (!this._pointVisible((col + 0.5) * step, (row + 0.5) * step)) continue;
          ctx.rect(col * step, row * step, step + 0.2, step + 0.2);
          visible = true;
        }
      }
      if (visible) ctx.clip();
      return visible;
    }

    _drawHazards(ctx) {
      var game = this.game;
      if (!game || game.over || typeof game.getHazards !== 'function') { this._hazardMemory.clear(); return; }
      var hazards;
      try { hazards = game.getHazards(0); } catch (_) { this._hazardMemory.clear(); return; }
      if (!Array.isArray(hazards)) { this._hazardMemory.clear(); return; }
      var now = number(game.time, 0), present = new Set();
      for (var i = 0; i < Math.min(hazards.length, 48); i++) {
        var source = hazards[i];
        if (!source || !Number.isFinite(source.x) || !Number.isFinite(source.y) || !Number.isFinite(source.at) || !(number(source.radius, 0) > 0)) continue;
        var id = source.id != null ? source.id : String(source.sourceId) + ':' + source.at;
        present.add(id);
        this._hazardMemory.set(id, {
          id: id, sourceId: source.sourceId, x: source.x, y: source.y,
          radius: clamp(source.radius, 8, 420), startsAt: number(source.startsAt, source.at - 1), at: source.at,
          label: String(source.label || '위험 구역').slice(0, 10), color: source.color,
          progress: Number.isFinite(source.progress) ? clamp(source.progress, 0, 1) : null
        });
      }
      this._hazardMemory.forEach(function (hazard, id) {
        // Disappearing before the strike means cancellation or lost disclosure.
        // Only a warning observed through its impact time gets a brief flash.
        if ((!present.has(id) && now < hazard.at) || now > hazard.at + 0.34 || now < hazard.startsAt - 0.1) {
          this._hazardMemory.delete(id); return;
        }
        if (!this._inView(hazard.x, hazard.y, hazard.radius + 60)) return;
        this._drawHazard(ctx, hazard, now);
      }, this);
    }

    _drawHazard(ctx, hazard, now) {
      var radius = hazard.radius;
      var impact = now >= hazard.at;
      var elapsed = Math.max(0, now - hazard.at);
      var progress = impact ? 1 : hazard.progress == null ? clamp((now - hazard.startsAt) / Math.max(0.05, hazard.at - hazard.startsAt), 0, 1) : hazard.progress;
      var isBoss = /boss|거인|심연/.test(String(hazard.sourceId || '') + hazard.label);
      var color = isBoss ? '#ff7e72' : '#ffac68';
      ctx.save();
      if (!this._clipVisibleGround(ctx, hazard.x, hazard.y, radius + 5)) { ctx.restore(); return; }
      ctx.translate(hazard.x, hazard.y);
      if (impact) {
        var fade = clamp(1 - elapsed / 0.34, 0, 1);
        circle(ctx, 0, 0, radius, rgba(color, fade * 0.12));
        circle(ctx, 0, 0, radius * (0.73 + elapsed / 0.34 * 0.27), null, rgba('#ffe5b6', fade * 0.92), 3.5 * fade + 0.7);
        circle(ctx, 0, 0, radius, null, rgba(color, fade * 0.75), 2.5);
        for (var i = 0; i < 8; i++) {
          var a = i * TAU / 8 + 0.15;
          line(ctx, [[Math.cos(a) * radius * 0.45, Math.sin(a) * radius * 0.45], [Math.cos(a) * radius * 0.9, Math.sin(a) * radius * 0.9]], rgba('#fff0cc', fade * 0.65), 1.7);
        }
      } else {
        circle(ctx, 0, 0, radius, rgba(color, 0.055), 'rgba(15,21,28,0.92)', 5.5);
        circle(ctx, 0, 0, radius, null, rgba(color, 0.88), 2.5);
        circle(ctx, 0, 0, Math.max(3, radius - 5), null, 'rgba(255,233,180,0.24)', 1);
        if (progress > 0) {
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, radius - 3, -Math.PI / 2, -Math.PI / 2 + progress * TAU); ctx.closePath();
          ctx.fillStyle = rgba(color, 0.06 + progress * 0.07); ctx.fill();
          ctx.beginPath(); ctx.arc(0, 0, Math.max(3, radius - 8), -Math.PI / 2, -Math.PI / 2 + progress * TAU);
          ctx.strokeStyle = '#ffe8a9'; ctx.lineWidth = 3; ctx.stroke();
        }
        for (i = 0; i < 4; i++) {
          ctx.save(); ctx.rotate(i * Math.PI / 2);
          polygon(ctx, [[-5, -radius + 14], [0, -radius + 6], [5, -radius + 14]], '#ffdd9a', '#623f32', 0.8);
          ctx.restore();
        }
      }
      ctx.restore();
      if (impact) return;
      var labelX = hazard.x, labelY = hazard.y;
      if (!this._pointVisible(labelX, labelY)) {
        var player = this.game && this.game.player;
        if (!player || !living(player) || Math.hypot(player.x - hazard.x, player.y - hazard.y) > radius + number(player.r, 19) || !this._pointVisible(player.x, player.y)) return;
        labelX = player.x; labelY = player.y;
      }
      var label = hazard.label + ' ' + Math.max(0, hazard.at - now).toFixed(1) + 's';
      var width = Math.min(160, Math.max(90, label.length * 8 + 14));
      ctx.save();
      roundRect(ctx, labelX - width / 2, labelY - 11, width, 23, 5, 'rgba(30,26,31,0.94)', rgba(color, 0.90), 1.2);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '700 11px ' + FONT;
      ctx.fillStyle = '#fff0ce'; ctx.fillText(label, labelX, labelY + 0.5);
      ctx.restore();
    }

    _navigationPoints() {
      var player = this.game && this.game.player;
      if (!player || !living(player) || !Number.isFinite(player.x) || !Number.isFinite(player.y) || !Array.isArray(player.navPath)) return [];
      var points = [[player.x, player.y]];
      for (var i = 0; i < Math.min(128, player.navPath.length); i++) {
        var p = player.navPath[i];
        if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) points.push([p.x, p.y]);
      }
      return points.length > 1 ? points : [];
    }

    _drawNavigationPath(ctx) {
      var points = this._navigationPoints();
      if (!points.length || (this.game && this.game.over)) return;
      ctx.save();
      line(ctx, points, 'rgba(6,28,33,0.70)', 3.8);
      ctx.setLineDash([5, 8]);
      line(ctx, points, 'rgba(159,232,209,0.62)', 1.45);
      ctx.setLineDash([]);
      var goal = points[points.length - 1];
      circle(ctx, goal[0], goal[1], 9, 'rgba(103,221,208,0.10)', 'rgba(190,238,210,0.70)', 1.2);
      polygon(ctx, [[goal[0], goal[1] - 3], [goal[0] + 3, goal[1]], [goal[0], goal[1] + 3], [goal[0] - 3, goal[1]]], '#d5ecbf');
      ctx.restore();
    }

    _activeOrder() {
      var game = this.game, order = game && game.order;
      if (!order || game.over || !Number.isFinite(order.x) || !Number.isFinite(order.y) || !Number.isFinite(order.expiresAt)) return null;
      if (order.expiresAt <= number(game.time, 0)) return null;
      return order;
    }

    _orderStyle(order) {
      var type = String(order.type || 'rally').toLowerCase();
      if (type === 'attack' || type === 'push') return { color: '#f0b184', label: '공격 집결', attack: true };
      if (type === 'defend' || type === 'defense') return { color: '#a7c9ef', label: '수비 집결' };
      if (type === 'dragon') return { color: '#ffc47d', label: '드래곤 집결', icon: 'dragon' };
      if (type === 'boss') return { color: '#c8acff', label: '거인 집결', icon: 'boss' };
      if (type === 'objective') return { color: '#d7b5f0', label: '목표 집결' };
      return { color: '#bce8ab', label: '집결' };
    }

    _drawOrderGlyph(ctx, style, x, y, size) {
      ctx.save(); ctx.translate(x, y); ctx.scale(size / 10, size / 10);
      if (style.icon === 'dragon') {
        polygon(ctx, [[-2, 1], [-10, -7], [-9, 2], [-5, -1], [-3, 5], [0, 8], [3, 5], [5, -1], [9, 2], [10, -7], [2, 1], [0, -5]], style.color, rgba('#fff0d2', 0.5), 0.8);
        line(ctx, [[0, -3], [0, 6]], '#7b573e', 1.2);
      } else if (style.icon === 'boss') {
        polygon(ctx, [[-6, -3], [-9, -9], [-9, 1], [-5, 7], [0, 9], [5, 7], [9, 1], [9, -9], [6, -3], [0, -6]], style.color, rgba('#eee4ff', 0.5), 0.8);
        line(ctx, [[-5, 0], [-2, 2]], '#3a2e56', 1.8);
        line(ctx, [[2, 2], [5, 0]], '#3a2e56', 1.8);
        line(ctx, [[-2, 5], [2, 5]], '#3a2e56', 1.2);
      } else if (style.attack) {
        line(ctx, [[-6, 7], [7, -6]], style.color, 2.4);
        polygon(ctx, [[7, -6], [2, -5], [6, -1]], style.color);
        line(ctx, [[-7, 2], [-2, 7]], style.color, 1.5);
      } else {
        line(ctx, [[-4, 9], [-4, -9]], style.color, 1.8);
        polygon(ctx, [[-3, -9], [8, -6], [4, -1], [-3, -3]], rgba(style.color, 0.9));
      }
      ctx.restore();
    }

    _drawOrder(ctx) {
      var order = this._activeOrder();
      if (!order || !this._inView(order.x, order.y, 150)) return;
      var style = this._orderStyle(order), time = number(this.game.time, 0);
      var pulse = (time % 1.4) / 1.4;
      var remaining = Math.max(0, order.expiresAt - time);
      ctx.save();
      ctx.translate(order.x, order.y);
      circle(ctx, 0, 0, 28 + pulse * 35, null, rgba(style.color, 0.48 * (1 - pulse)), 2.3);
      circle(ctx, 0, 0, 28, rgba(style.color, 0.035), rgba(style.color, 0.55), 1.5);
      for (var i = 0; i < 4; i++) {
        ctx.save(); ctx.rotate(i * Math.PI / 2);
        line(ctx, [[-5, -38], [0, -32], [5, -38]], rgba(style.color, 0.75), 1.6);
        ctx.restore();
      }
      circle(ctx, 0, -19, 15, '#142d35', rgba(style.color, 0.8), 1.5);
      this._drawOrderGlyph(ctx, style, 0, -19, 10);
      var label = style.label + ' ' + Math.ceil(remaining) + 's';
      var labelWidth = Math.max(78, Math.min(128, label.length * 7.8 + 16));
      roundRect(ctx, -labelWidth / 2, -58, labelWidth, 20, 5, 'rgba(11,31,40,0.92)', rgba(style.color, 0.35), 0.8);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '650 10px ' + FONT; ctx.fillStyle = style.color;
      ctx.fillText(label, 0, -48);
      ctx.restore();
    }

    _drawFocusTarget(ctx) {
      var game = this.game;
      if (!game || game.over || !living(game.player) || typeof game.getFocusTarget !== 'function') return;
      var focus = game.getFocusTarget();
      if (!focus || focus.type !== 'hero' || focus.team === game.player.team || !living(focus) || !this._visible(focus) || !this._inView(focus.x, focus.y, 80)) return;
      var r = Math.max(20, number(focus.r, 18) + 12);
      var pulse = 0.7 + Math.sin(this._time * 4) * 0.15;
      var color = '#ffd694';
      ctx.save();
      circle(ctx, focus.x, focus.y + 2, r, rgba(color, 0.035), rgba(color, pulse), 1.8);
      ctx.setLineDash([5, 6]);
      circle(ctx, focus.x, focus.y + 2, r + 5, null, rgba(color, 0.48), 1);
      ctx.setLineDash([]);
      for (var side = 0; side < 4; side++) {
        var angle = side * Math.PI / 2 + Math.PI / 4;
        var bx = focus.x + Math.cos(angle) * (r + 10);
        var by = focus.y + 2 + Math.sin(angle) * (r + 10);
        line(ctx, [[bx - Math.cos(angle - 0.65) * 7, by - Math.sin(angle - 0.65) * 7], [bx, by], [bx - Math.cos(angle + 0.65) * 7, by - Math.sin(angle + 0.65) * 7]], color, 2);
      }
      roundRect(ctx, focus.x - 19, focus.y + r + 13, 38, 18, 5, '#302d25', rgba(color, 0.55), 0.8);
      ctx.font = '700 10px ' + FONT;
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('고정', focus.x, focus.y + r + 22);
      ctx.restore();
    }

    _drawAttackRange(ctx, options) {
      var player = this.game && this.game.player;
      if (!options.attackRangeShown || options.selectedAbility || !player || !living(player) || this.game.over || !this.game.started) return;
      if (!Number.isFinite(player.x) || !Number.isFinite(player.y)) return;
      // This is the center-to-edge base range. Each target's own collision
      // radius is additionally included by the engine's reach check.
      var range = Math.max(0, number(player.range, 0)) + 8;
      if (!(range > 8)) return;
      var color = '#8adfd6';
      ctx.save();
      circle(ctx, player.x, player.y, range, rgba(color, 0.018));
      ctx.setLineDash([7, 7]);
      circle(ctx, player.x, player.y, range, null, rgba(color, 0.58), 1.4);
      ctx.setLineDash([]);
      for (var i = 0; i < 4; i++) {
        var angle = i * Math.PI / 2;
        line(ctx, [[player.x + Math.cos(angle) * (range - 5), player.y + Math.sin(angle) * (range - 5)],
          [player.x + Math.cos(angle) * (range + 5), player.y + Math.sin(angle) * (range + 5)]], rgba(color, 0.8), 1.5);
      }
      var labelY = player.y - range - 12;
      if (this._inView(player.x, labelY, 20)) {
        roundRect(ctx, player.x - 46, labelY - 9, 92, 18, 6, 'rgba(12,35,41,0.86)', rgba(color, 0.35), 0.8);
        ctx.font = '600 10px ' + FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#bceee4';
        ctx.fillText('기본 공격 범위', player.x, labelY);
      }
      ctx.restore();
    }

    _drawAbilityIndicator(ctx, options) {
      var player = this.game && this.game.player;
      if (!player || !living(player)) return;
      var aim = options.aim;
      var slot = options.selectedAbility;
      if (!aim || !Number.isFinite(aim.x) || !Number.isFinite(aim.y)) return;
      var x = aim.x, y = aim.y;
      var c = options.aimBlocked ? '#ff9285' : '#b7e9df';
      if (!slot) {
        if (this._inView(x, y, 10)) {
          ctx.save();
          ctx.globalAlpha = 0.42;
          polygon(ctx, [[x, y - 5], [x + 5, y], [x, y + 5], [x - 5, y]], null, c, 1);
          ctx.restore();
        }
        return;
      }
      var heroes = root.NexusGame && root.NexusGame.HEROES;
      var hero = Array.isArray(heroes) ? heroes.find(function (h) { return h.id === player.hero; }) : null;
      var skill = hero && hero.skills && hero.skills[slot];
      if (skill && typeof this.game.getSkillInfo === 'function') skill = this.game.getSkillInfo(slot) || skill;
      if (slot === 'd') skill = { target: 'dash', range: 300, radius: number(player.r, 18) };
      else if (slot === 'ward') skill = { target: 'ground', range: 450, radius: 28 };
      else if (slot === 'f') skill = { target: 'self', range: 0, radius: 240 };
      if (!skill || (!Number.isFinite(skill.range) && !Number.isFinite(skill.radius))) return;
      var range = Math.max(0, number(skill.range, 0));
      var radius = Math.max(0, number(skill.radius, 0));
      var dx = x - player.x, dy = y - player.y, dist = Math.hypot(dx, dy);
      var angle = dist > 0.01 ? Math.atan2(dy, dx) : number(player.facing, -Math.PI / 4);
      var type = skill.target || 'ground';
      if (type === 'self' || range === 0) { x = player.x; y = player.y; }
      else {
        var reach = type === 'direction' ? range : Math.min(range, dist);
        x = player.x + Math.cos(angle) * reach;
        y = player.y + Math.sin(angle) * reach;
      }
      ctx.save();
      if (range > 0) {
        circle(ctx, player.x, player.y, range, rgba(c, 0.015), rgba(c, 0.22), 1);
        ctx.setLineDash([5, 7]);
        line(ctx, [[player.x, player.y], [x, y]], rgba(c, 0.45), 1.2);
        ctx.setLineDash([]);
      }
      if (type === 'direction') {
        ctx.save();
        ctx.translate(player.x, player.y);
        ctx.rotate(angle);
        var ww = clamp(radius, 8, 30);
        polygon(ctx, [[12, -ww], [range - 17, -ww], [range, 0], [range - 17, ww], [12, ww]], rgba(c, 0.07), rgba(c, 0.65), 1);
        ctx.restore();
      } else {
        if (radius > 0) circle(ctx, x, y, radius, rgba(c, 0.065), rgba(c, 0.72), 1.5);
        line(ctx, [[x - 7, y], [x + 7, y]], rgba(c, 0.8), 1);
        line(ctx, [[x, y - 7], [x, y + 7]], rgba(c, 0.8), 1);
      }
      if (options.aimBlocked) {
        circle(ctx, x, y, 13, 'rgba(43,23,27,0.88)', c, 1.5);
        line(ctx, [[x - 5, y - 5], [x + 5, y + 5]], c, 1.8);
        line(ctx, [[x - 5, y + 5], [x + 5, y - 5]], c, 1.8);
      }
      ctx.restore();
    }

    _drawScreenVignette(ctx) {
      var w = this.width, h = this.height;
      var g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.73);
      g.addColorStop(0, 'rgba(2,13,22,0)');
      g.addColorStop(1, 'rgba(2,13,22,0.30)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      var p = this.game && this.game.player;
      if (p && living(p) && number(p.hp, 1) / Math.max(1, number(p.maxHp, 1)) < 0.28) {
        var health = clamp(number(p.hp, 1) / Math.max(1, number(p.maxHp, 1)), 0, 1);
        var red = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.37, w / 2, h / 2, Math.max(w, h) * 0.69);
        red.addColorStop(0, 'rgba(122,27,39,0)');
        red.addColorStop(1, 'rgba(159,44,48,' + ((0.28 - health) * 0.7 + 0.04) + ')');
        ctx.fillStyle = red;
        ctx.fillRect(0, 0, w, h);
      }
    }

    drawMinimap(canvas) {
      if (!canvas || typeof canvas.getContext !== 'function') return;
      var ctx = canvas.getContext('2d');
      if (!ctx) return;
      var rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
      var w = Math.max(1, Math.round(rect && rect.width > 0 ? rect.width : number(canvas.clientWidth, 0) || 180));
      var h = Math.max(1, Math.round(rect && rect.height > 0 ? rect.height : number(canvas.clientHeight, 0) || 180));
      var dpr = clamp(number(root.devicePixelRatio, 1), 1, 2);
      if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr);
      if (canvas.height !== Math.round(h * dpr)) canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#0a2028';
      ctx.fillRect(0, 0, w, h);
      var padding = 5;
      var s = Math.min((w - padding * 2) / this._map.width, (h - padding * 2) / this._map.height);
      if (!(s > 0)) return;
      var ox = (w - this._map.width * s) / 2, oy = (h - this._map.height * s) / 2;
      ctx.save();
      ctx.beginPath();
      ctx.rect(ox, oy, this._map.width * s, this._map.height * s);
      ctx.clip();
      if (this._terrain) ctx.drawImage(this._terrain, ox, oy, this._map.width * s, this._map.height * s);
      for (var wi = 0; wi < this._map.obstacles.length; wi++) {
        var wall = this._map.obstacles[wi];
        if (!wall || !Number.isFinite(wall.x) || !Number.isFinite(wall.y) || !(wall.r > 0)) continue;
        circle(ctx, ox + wall.x * s, oy + wall.y * s, wall.r * s, '#798d7c', '#b0b79a', 0.65);
        line(ctx, [[ox + (wall.x - wall.r * 0.4) * s, oy + (wall.y - wall.r * 0.18) * s], [ox + wall.x * s, oy + (wall.y + wall.r * 0.24) * s]], '#465e59', 0.7);
      }
      if (this._fog) ctx.drawImage(this._fog, ox, oy, this._map.width * s, this._map.height * s);
      ctx.fillStyle = 'rgba(4,19,27,0.18)';
      ctx.fillRect(ox, oy, this._map.width * s, this._map.height * s);
      var route = this._navigationPoints();
      if (route.length && !(this.game && this.game.over)) {
        ctx.save();
        ctx.setLineDash([2, 3]);
        line(ctx, route.map(function (point) { return [ox + point[0] * s, oy + point[1] * s]; }), 'rgba(198,238,183,0.65)', 0.85);
        ctx.restore();
      }
      var all = this.game && Array.isArray(this.game.entities) ? this.game.entities : [];
      var drawn = new Set();
      for (var i = 0; i < all.length; i++) {
        var e = all[i];
        if (!e || !Number.isFinite(e.x) || !Number.isFinite(e.y) || !this._visible(e) || !living(e)) continue;
        if (e.id != null) drawn.add(e.id);
        var x = ox + e.x * s, y = oy + e.y * s;
        var c = teamColor(e.team);
        if (e.type === 'hero') {
          circle(ctx, x, y, 3.5, c.main, '#0a2530', 1.1);
          var p = this.game && this.game.player;
          if (e === p || (p && e.id === p.id)) circle(ctx, x, y, 5.5, null, '#eff6d6', 1.2);
        } else if (e.type === 'tower') roundRect(ctx, x - 2.3, y - 2.3, 4.6, 4.6, 0.5, c.main, '#0f2931', 0.6);
        else if (e.type === 'nexus') polygon(ctx, [[x, y - 5], [x + 4, y], [x, y + 5], [x - 4, y]], c.main, c.light, 0.7);
        else if (e.type === 'inhibitor') polygon(ctx, [[x, y - 3], [x + 3, y], [x, y + 3], [x - 3, y]], c.main);
        else if (e.type === 'minion') circle(ctx, x, y, 1.15, rgba(c.main, 0.72));
        else if (e.type === 'monster') {
          var epic = e.kind === 'boss' || e.kind === 'dragon';
          polygon(ctx, [[x, y - (epic ? 4 : 2)], [x + (epic ? 3 : 1.7), y], [x, y + (epic ? 4 : 2)], [x - (epic ? 3 : 1.7), y]], epic ? '#e3c08a' : '#a0a684', '#173039', 0.6);
        } else if (e.type === 'ward') circle(ctx, x, y, 1.8, '#c9e1b6');
      }
      this._memory.forEach(function (m, id) {
        if (drawn.has(id) || !m.alive || m.team === 0) return;
        var mx = ox + m.x * s, my = oy + m.y * s;
        ctx.globalAlpha = m.seen ? 0.5 : 0.3;
        var color = teamColor(m.team).main;
        if (m.type === 'nexus') polygon(ctx, [[mx, my - 4], [mx + 3.5, my], [mx, my + 4], [mx - 3.5, my]], color);
        else roundRect(ctx, mx - 2, my - 2, 4, 4, 0.5, color);
        ctx.globalAlpha = 1;
      });
      var order = this._activeOrder();
      if (order) {
        var orderStyle = this._orderStyle(order), orderX = ox + order.x * s, orderY = oy + order.y * s;
        var phase = (number(this.game.time, 0) % 1.4) / 1.4;
        circle(ctx, orderX, orderY, 6 + phase * 8, null, rgba(orderStyle.color, 0.9 * (1 - phase)), 1.2);
        if (orderStyle.icon) {
          circle(ctx, orderX, orderY, 6.2, '#143039', orderStyle.color, 1.1);
          this._drawOrderGlyph(ctx, orderStyle, orderX, orderY, 4.8);
        } else {
          polygon(ctx, [[orderX, orderY - 4], [orderX + 4, orderY], [orderX, orderY + 4], [orderX - 4, orderY]], '#143039', orderStyle.color, 1.3);
          circle(ctx, orderX, orderY, 1.2, orderStyle.color);
        }
      }
      var left = ox + this._view.left * s, top = oy + this._view.top * s;
      ctx.strokeStyle = 'rgba(239,244,214,0.65)';
      ctx.lineWidth = 1;
      ctx.strokeRect(left, top, (this._view.right - this._view.left) * s, (this._view.bottom - this._view.top) * s);
      ctx.restore();
      ctx.strokeStyle = 'rgba(169,191,163,0.33)';
      ctx.lineWidth = 1;
      ctx.strokeRect(ox + 0.5, oy + 0.5, this._map.width * s - 1, this._map.height * s - 1);
    }
  }

  root.NexusRenderer = { Renderer: Renderer };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.NexusRenderer;
})(typeof globalThis !== 'undefined' ? globalThis : this);
