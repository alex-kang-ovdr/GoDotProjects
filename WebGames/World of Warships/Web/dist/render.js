/* Iron Tide — original procedural naval renderer. No external assets. */
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const fract = x => x - Math.floor(x);
  const noise = n => fract(Math.sin(n * 127.1 + 311.7) * 43758.5453123);
  const blue = '#65e8dd', red = '#ff846e';

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.width = 1; this.height = 1; this.dpr = 1;
      this.cameraX = 0; this.cameraY = 0; this.zoom = 1;
      this.islandPaths = new Map();
    }

    resize(width, height, dpr = window.devicePixelRatio || 1) {
      this.width = Math.max(1, width); this.height = Math.max(1, height);
      this.dpr = clamp(dpr, 1, 2);
      this.canvas.width = Math.round(this.width * this.dpr);
      this.canvas.height = Math.round(this.height * this.dpr);
      this.canvas.style.width = `${this.width}px`;
      this.canvas.style.height = `${this.height}px`;
    }

    worldToScreen(x, y) {
      return { x: (x - this.cameraX) * this.zoom + this.width / 2,
        y: (y - this.cameraY) * this.zoom + this.height / 2 };
    }

    screenToWorld(x, y) {
      return { x: (x - this.width / 2) / this.zoom + this.cameraX,
        y: (y - this.height / 2) / this.zoom + this.cameraY };
    }

    setViewTransform(cameraX, cameraY, zoom) {
      if (Number.isFinite(cameraX)) this.cameraX = cameraX;
      if (Number.isFinite(cameraY)) this.cameraY = cameraY;
      if (Number.isFinite(zoom) && zoom > 0) this.zoom = clamp(zoom, .08, 3);
      return this;
    }

    render(g, view = {}) {
      if (!g) return;
      const c = this.ctx, w = this.width, h = this.height;
      const time = Number.isFinite(view.time) ? view.time : g.time;
      this.setViewTransform(Number.isFinite(view.cameraX) ? view.cameraX : g.player.x,
        Number.isFinite(view.cameraY) ? view.cameraY : g.player.y, view.zoom || .65);
      this.view = view; this.time = time; this.simulationTime = g.time;
      this.navigationWarning = !view.menu && !view.tactical ? this.getNavigationWarning(g) : null;
      const api = globalThis.IronTide;
      this.solution = !view.menu && view.solution ? view.solution :
        !view.menu && api.getWeaponSolution && Number.isFinite(view.aimX) && Number.isFinite(view.aimY)
          ? api.getWeaponSolution(g, g.player, view.ammo || 'HE', view.aimX, view.aimY, view.spread || 'narrow') : null;
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      c.globalAlpha = 1;
      const sea = c.createLinearGradient(0, 0, w * .55, h);
      const palette = g.operationId === 'bastion' ? ['#132f32', '#214743', '#102e35'] :
        g.operationId === 'openwater' ? ['#0d2940', '#183f54', '#0b263c'] : ['#102e3a', '#143e48', '#0b2936'];
      sea.addColorStop(0, palette[0]); sea.addColorStop(.48, palette[1]); sea.addColorStop(1, palette[2]);
      c.fillStyle = sea; c.fillRect(0, 0, w, h);
      const glow = c.createRadialGradient(w * .64, h * .24, 0, w * .64, h * .24, w * .75);
      glow.addColorStop(0, 'rgba(53,124,124,.12)'); glow.addColorStop(1, 'rgba(8,24,37,0)');
      c.fillStyle = glow; c.fillRect(0, 0, w, h);

      c.save();
      c.translate(w / 2 - this.cameraX * this.zoom, h / 2 - this.cameraY * this.zoom);
      c.scale(this.zoom, this.zoom);
      this.drawWater(g, time);
      if (!view.menu) this.drawZones(g, time);
      for (const island of g.islands) if (this.onScreen(island.x, island.y, Math.max(island.rx, island.ry) * 1.5)) this.drawIsland(island, time);
      if (!view.menu && !view.tactical && g.player.hp > 0) this.drawRange(g, view);
      if (!view.menu) this.drawOrder(g);
      if (!view.menu && view.training) this.drawTrainingMarkers(g, view.training);
      if (this.navigationWarning) this.drawNavigationWorld(g, this.navigationWarning);
      const visibleShips = g.ships.filter(s => s.team === 0 || s.visible);
      for (const ship of visibleShips) if (this.onScreen(ship.x, ship.y, 260)) this.drawWake(ship, time);
      for (const ship of visibleShips) if (this.onScreen(ship.x, ship.y, 260)) this.drawShip(ship, time, view.menu);
      for (const p of g.projectiles) if (p.visible !== false && this.onScreen(p.x, p.y, 180)) this.drawProjectile(p, time);
      for (const e of g.effects) if (e.visible !== false && this.onScreen(e.x, e.y, (e.radius || 90) * 3)) this.drawEffect(e, time);
      for (const ship of visibleShips) {
        if (ship.hp <= 0 || !this.onScreen(ship.x, ship.y, 300)) continue;
        if (ship.fireTime > 0) this.drawFire(ship, time);
      }
      for (const cloud of g.smokeClouds || []) {
        if (this.onScreen(cloud.x, cloud.y, cloud.radius)) this.drawSmoke(cloud, time);
      }
      if (!view.menu) this.drawWorldBoundary(g);
      c.restore();

      if (!view.menu) {
        this.drawLabels(g, visibleShips, view);
        this.drawAim(g, view);
        this.drawModuleWarnings(g.player);
        this.drawFloatingDamage(g);
        this.drawContactLost(view);
        if (this.navigationWarning) this.drawNavigationLabel(g, this.navigationWarning);
        if (view.training) this.drawTrainingBeacon(g, view.training);
        if (view.binocular && !view.tactical) this.drawBinocular();
      }
      const shade = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .3, w / 2, h / 2, Math.max(w, h) * .8);
      shade.addColorStop(0, 'rgba(0,7,15,0)'); shade.addColorStop(1, 'rgba(0,7,15,.38)');
      c.fillStyle = shade; c.fillRect(0, 0, w, h);
    }

    onScreen(x, y, radius = 100) {
      const p = this.worldToScreen(x, y), r = radius * this.zoom;
      return p.x > -r && p.x < this.width + r && p.y > -r && p.y < this.height + r;
    }

    drawWater(g, time) {
      const c = this.ctx, z = this.zoom;
      const left = this.cameraX - this.width / z / 2, right = this.cameraX + this.width / z / 2;
      const top = this.cameraY - this.height / z / 2, bottom = this.cameraY + this.height / z / 2;
      c.strokeStyle = 'rgba(149,207,213,.055)'; c.lineWidth = 1 / z;
      c.beginPath();
      for (let x = Math.floor(left / 400) * 400; x < right; x += 400) { c.moveTo(x, top); c.lineTo(x, bottom); }
      for (let y = Math.floor(top / 400) * 400; y < bottom; y += 400) { c.moveTo(left, y); c.lineTo(right, y); }
      c.stroke();
      // World-anchored wavelets never slide with the camera. Only their crest animates.
      const step = z < .3 ? 140 : 100;
      for (let gx = Math.floor(left / step); gx <= Math.ceil(right / step); gx++) {
        for (let gy = Math.floor(top / step); gy <= Math.ceil(bottom / step); gy++) {
          const seed = gx * 73.17 + gy * 97.63;
          const n = noise(seed), pulse = .5 + Math.sin(time * .62 + n * TAU) * .5;
          const x = gx * step + noise(seed + 5) * step, y = gy * step + noise(seed + 9) * step;
          c.strokeStyle = `rgba(149,210,211,${.025 + pulse * .045})`;
          c.lineWidth = .85 / z;
          c.beginPath(); c.moveTo(x - 14, y); c.quadraticCurveTo(x, y - 4 - pulse * 3, x + 20 + n * 17, y + 1); c.stroke();
          if (pulse > .75 && n > .8) {
            c.strokeStyle = 'rgba(207,240,235,.12)';
            c.beginPath(); c.moveTo(x + 5, y + 7); c.lineTo(x + 14, y + 6); c.stroke();
          }
        }
      }
    }

    drawZones(g, time) {
      const c = this.ctx, z = this.zoom;
      for (const zone of g.zones) {
        if (!this.onScreen(zone.x, zone.y, zone.radius + 70)) continue;
        const color = zone.owner === 0 ? blue : zone.owner === 1 ? red : '#c8e2df';
        const fill = zone.owner === 0 ? 'rgba(74,199,185,.035)' : zone.owner === 1 ? 'rgba(255,122,99,.035)' : 'rgba(207,230,225,.025)';
        c.save(); c.translate(zone.x, zone.y);
        c.fillStyle = fill; c.beginPath(); c.arc(0, 0, zone.radius, 0, TAU); c.fill();
        c.globalAlpha = .5; c.strokeStyle = color; c.lineWidth = 1.2 / z;
        c.setLineDash([14 / z, 10 / z]); c.beginPath(); c.arc(0, 0, zone.radius, 0, TAU); c.stroke(); c.setLineDash([]);
        c.globalAlpha = 1;
        if (Math.abs(zone.progress) > .015) {
          c.strokeStyle = zone.progress > 0 ? blue : red; c.lineWidth = 3 / z;
          c.beginPath(); c.arc(0, 0, zone.radius, -Math.PI / 2, -Math.PI / 2 + Math.abs(zone.progress) * TAU); c.stroke();
        }
        const r = 22 / z;
        c.fillStyle = '#102f39'; c.strokeStyle = color; c.lineWidth = 1 / z;
        c.beginPath(); c.moveTo(0, -r); c.lineTo(r, 0); c.lineTo(0, r); c.lineTo(-r, 0); c.closePath(); c.fill(); c.stroke();
        c.fillStyle = color; c.font = `600 ${15 / z}px "Inter", "Noto Sans KR", sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(zone.id, 0, 1 / z);
        c.font = `500 ${9 / z}px sans-serif`;
        const text = zone.contested ? '교전 중' : zone.owner === 0 ? '아군 거점' : zone.owner === 1 ? '적군 거점' : '중립 거점';
        c.globalAlpha = zone.contested ? .7 + Math.sin(time * 4) * .3 : .7;
        c.fillText(text, 0, 35 / z); c.restore();
      }
    }

    getIslandPath(island) {
      const key = `${island.rx}:${island.ry}:${island.seed || 1}`;
      if (this.islandPaths.has(key)) return this.islandPaths.get(key);
      const path = new Path2D(), points = [], seed = island.seed || 1;
      for (let i = 0; i < 34; i++) {
        const a = i / 34 * TAU;
        const radius = .92 + .035 * Math.sin(a * 3 + seed) + .035 * noise(seed + i * 17);
        points.push({ x: Math.cos(a) * island.rx * radius, y: Math.sin(a) * island.ry * radius });
      }
      path.moveTo((points[0].x + points[33].x) / 2, (points[0].y + points[33].y) / 2);
      for (let i = 0; i < points.length; i++) {
        const p = points[i], n = points[(i + 1) % points.length];
        path.quadraticCurveTo(p.x, p.y, (p.x + n.x) / 2, (p.y + n.y) / 2);
      }
      path.closePath(); this.islandPaths.set(key, path); return path;
    }

    drawIsland(island, time) {
      const c = this.ctx, path = this.getIslandPath(island), seed = island.seed || 1;
      c.save(); c.translate(island.x, island.y); c.rotate(island.rotation || 0);
      // Shallow contours sit outside the collision ellipse; land remains inside it.
      const shelf = [[1.27, 'rgba(28,104,108,.11)'], [1.15, 'rgba(48,131,127,.13)'], [1.07, '#3f7774']];
      for (const [scale, color] of shelf) { c.save(); c.scale(scale, scale); c.fillStyle = color; c.fill(path); c.restore(); }
      c.save(); c.translate(10, 13); c.fillStyle = 'rgba(2,16,21,.35)'; c.fill(path); c.restore();
      c.fillStyle = '#919281'; c.fill(path);
      c.save(); c.scale(.955, .94); c.fillStyle = '#5c7162'; c.fill(path); c.restore();
      c.save(); c.clip(path);
      const land = c.createLinearGradient(-island.rx, -island.ry, island.rx, island.ry);
      land.addColorStop(0, '#687d68'); land.addColorStop(.4, '#4e6659'); land.addColorStop(1, '#354f48');
      c.save(); c.scale(.91, .9); c.fillStyle = land; c.fill(path); c.restore();
      // Broad angular rock faces and tree clusters give each island a readable relief.
      for (let i = 0; i < 17; i++) {
        const angle = noise(seed + i * 27) * TAU, reach = Math.sqrt(noise(seed + i * 73)) * .7;
        const x = Math.cos(angle) * island.rx * reach, y = Math.sin(angle) * island.ry * reach;
        const size = 12 + noise(seed + i * 121) * Math.min(island.rx, island.ry) * .28;
        c.fillStyle = i % 3 ? 'rgba(23,49,41,.23)' : 'rgba(153,159,134,.23)';
        c.beginPath(); c.moveTo(x - size, y + size * .3); c.lineTo(x - size * .4, y - size * .6);
        c.lineTo(x + size * .42, y - size * .9); c.lineTo(x + size, y + size * .2); c.lineTo(x + size * .16, y + size * .6); c.closePath(); c.fill();
        c.strokeStyle = 'rgba(177,188,160,.13)'; c.lineWidth = 1.4;
        c.beginPath(); c.moveTo(x - size * .4, y - size * .6); c.lineTo(x + size * .42, y - size * .9); c.lineTo(x + size * .12, y); c.stroke();
      }
      for (let i = 0; i < 42; i++) {
        const a = noise(seed + i * 61) * TAU, r = Math.sqrt(noise(seed + i * 37)) * .77;
        const x = Math.cos(a) * island.rx * r, y = Math.sin(a) * island.ry * r, size = 3 + noise(seed + i * 12) * 5;
        c.fillStyle = 'rgba(20,47,37,.35)'; c.beginPath(); c.ellipse(x + 3, y + 4, size * 1.4, size, .3, 0, TAU); c.fill();
        c.fillStyle = i % 2 ? '#3e604d' : '#456950'; c.beginPath(); c.arc(x, y, size, 0, TAU); c.fill();
      }
      c.restore();
      c.strokeStyle = `rgba(202,229,216,${.17 + Math.sin(time * .7 + seed) * .045})`; c.lineWidth = 2 / Math.max(this.zoom, .4); c.stroke(path);
      c.restore();
    }

    drawRange(g, view) {
      const c = this.ctx, p = g.player, z = this.zoom;
      const profile = globalThis.IronTide.CLASSES[p.classId] || {};
      c.save(); c.translate(p.x, p.y);
      const r = view.ammo === 'TORP' ? (p.torpRange || profile.torpRange || 1200) : p.range;
      c.strokeStyle = 'rgba(119,211,205,.10)'; c.lineWidth = 1 / z; c.setLineDash([4 / z, 12 / z]);
      c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke(); c.setLineDash([]);
      if (view.ammo === 'TORP' && p.torpReloadMax > 0 && Number.isFinite(view.aimX)) {
        const a = Math.atan2(view.aimY - p.y, view.aimX - p.x);
        const inner = profile.torpArcMin || (p.classId === 'destroyer' ? 30 : 45) * Math.PI / 180;
        const outer = profile.torpArcMax || Math.PI - inner;
        c.fillStyle = 'rgba(101,232,221,.025)'; c.strokeStyle = 'rgba(101,232,221,.20)';
        for (const side of [-1, 1]) {
          const lo = side < 0 ? p.angle - outer : p.angle + inner;
          const hi = side < 0 ? p.angle - inner : p.angle + outer;
          c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, r * .88, lo, hi); c.closePath(); c.fill();
          c.setLineDash([3 / z, 8 / z]); c.stroke(); c.setLineDash([]);
        }
        const spreadAngle = view.spread === 'wide' ? (profile.torpSpreadWide || (p.classId === 'destroyer' ? .46 : .38)) :
          (profile.torpSpreadNarrow || (p.classId === 'destroyer' ? .19 : .14));
        const half = spreadAngle / 2;
        const valid = !this.solution || (this.solution.arcValid && this.solution.inRange && !this.solution.blockedByIsland);
        c.fillStyle = valid ? 'rgba(101,232,221,.075)' : 'rgba(255,132,110,.06)';
        c.strokeStyle = valid ? 'rgba(101,232,221,.5)' : 'rgba(255,132,110,.47)'; c.lineWidth = 1 / z;
        c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, r, a - half, a + half); c.closePath(); c.fill(); c.stroke();
      }
      c.restore();
    }

    drawOrder(g) {
      const order = g.order;
      if (!order || order.until <= g.time) return;
      let target, label;
      if (order.type === 'capture') { target = g.zones.find(z => z.id === order.zoneId); label = '거점 확보'; }
      else if (order.type === 'focus') { target = g.ships.find(s => s.id === order.targetId && s.visible && s.hp > 0 && s.team === 1); label = '집중 사격'; }
      else { target = g.player; label = '함대 집결'; }
      if (!target) return;
      const c = this.ctx, z = this.zoom;
      c.save(); c.globalAlpha = clamp(order.until - g.time, 0, 1);
      c.strokeStyle = order.type === 'focus' ? 'rgba(255,171,124,.42)' : 'rgba(139,232,213,.32)';
      c.lineWidth = 1 / z; c.setLineDash([6 / z, 9 / z]);
      c.lineDashOffset = -this.time * 10 / z;
      for (const ally of g.ships) {
        if (ally.team !== 0 || ally.isPlayer || ally.hp <= 0) continue;
        c.beginPath(); c.moveTo(ally.x, ally.y); c.lineTo(target.x, target.y); c.stroke();
      }
      c.setLineDash([]); c.lineDashOffset = 0;
      const size = (32 + Math.sin(this.time * 2) * 3) / z;
      c.beginPath(); c.moveTo(target.x, target.y - size); c.lineTo(target.x + size, target.y);
      c.lineTo(target.x, target.y + size); c.lineTo(target.x - size, target.y); c.closePath(); c.stroke();
      c.fillStyle = order.type === 'focus' ? '#eec39a' : '#b5e5d6';
      c.textAlign = 'center'; c.textBaseline = 'top'; c.font = `500 ${9 / z}px sans-serif`;
      c.fillText(`${label} · ${Math.ceil(order.until - g.time)}s`, target.x, target.y + size + 8 / z);
      c.restore();
    }

    drawTrainingMarkers(g, brief) {
      const c = this.ctx, z = this.zoom, checkpoint = brief.checkpoint;
      const color = brief.failed ? '#ed9a82' : brief.complete ? '#b4f2cb' : '#dfd39e';
      if (checkpoint && Number.isFinite(checkpoint.x) && Number.isFinite(checkpoint.y)) {
        const radius = Math.max(30, checkpoint.radius || 70), progress = clamp(brief.progress || 0, 0, 1);
        c.save(); c.translate(checkpoint.x, checkpoint.y);
        c.fillStyle = 'rgba(219,215,153,.045)'; c.beginPath(); c.arc(0, 0, radius, 0, TAU); c.fill();
        c.strokeStyle = color; c.globalAlpha = .55; c.lineWidth = 1.5 / z; c.setLineDash([7 / z, 6 / z]);
        c.beginPath(); c.arc(0, 0, radius, 0, TAU); c.stroke(); c.setLineDash([]); c.globalAlpha = 1;
        c.lineWidth = 3 / z; c.beginPath(); c.arc(0, 0, radius + 5 / z, -Math.PI / 2, -Math.PI / 2 + progress * TAU); c.stroke();
        const markerY = -radius - 18 / z;
        c.fillStyle = '#122f36'; c.strokeStyle = color; c.lineWidth = 1 / z;
        c.beginPath(); c.arc(0, markerY, 11 / z, 0, TAU); c.fill(); c.stroke();
        c.fillStyle = color; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `600 ${10 / z}px ui-monospace,monospace`;
        c.fillText(`${brief.index}`, 0, markerY + .5 / z);
        c.font = `500 ${9 / z}px sans-serif`; c.fillText(brief.index === 5 ? '훈련 점령 구역' : '이동 목표', 0, radius + 18 / z);
        c.restore();
      }
      const target = brief.targetId && g.ships.find(s => s.id === brief.targetId && s.hp > 0 && (s.team === 0 || s.visible));
      if (target) {
        const radius = Math.max(target.length * .7, 32 / z);
        c.save(); c.translate(target.x, target.y); c.strokeStyle = color; c.lineWidth = 1.4 / z;
        c.setLineDash([3 / z, 7 / z]); c.beginPath(); c.arc(0, 0, radius, 0, TAU); c.stroke(); c.setLineDash([]);
        c.fillStyle = color; c.textAlign = 'center'; c.textBaseline = 'bottom'; c.font = `500 ${9 / z}px sans-serif`;
        c.fillText(`훈련 표적 ${brief.index}`, 0, -radius - 13 / z); c.restore();
      }
    }

    drawTrainingBeacon(g, brief) {
      const point = brief.checkpoint || (brief.targetId && g.ships.find(s => s.id === brief.targetId && s.hp > 0 && (s.team === 0 || s.visible)));
      if (!point || this.onScreen(point.x, point.y, 15)) return;
      this.drawEdgeBeacon(point, '#dfd39e', brief.checkpoint ? '훈련 목표' : '훈련 표적');
    }

    drawContactLost(view) {
      const point = view.contactLostPoint;
      if (!view.contactLost || !point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
      // Last-known coordinates come from the controller; never resolve the hidden ship here.
      if (!this.onScreen(point.x, point.y, 20)) { this.drawEdgeBeacon(point, '#c7a493', '마지막 접촉'); return; }
      const c = this.ctx, p = this.worldToScreen(point.x, point.y);
      c.save(); c.strokeStyle = 'rgba(213,172,151,.65)'; c.lineWidth = 1; c.setLineDash([4, 4]);
      c.beginPath(); c.arc(p.x, p.y, 17, 0, TAU); c.stroke(); c.setLineDash([]);
      c.beginPath(); c.moveTo(p.x - 5, p.y - 5); c.lineTo(p.x + 5, p.y + 5); c.moveTo(p.x - 5, p.y + 5); c.lineTo(p.x + 5, p.y - 5); c.stroke();
      this.drawChip(clamp(p.x, 75, this.width - 75), p.y + 31, '접촉 상실 · 마지막 위치', '#c7a493', 8);
      c.restore();
    }

    drawEdgeBeacon(point, color, label) {
      const c = this.ctx, p = this.worldToScreen(point.x, point.y), top = 123;
      const bottom = Math.max(top + 65, this.height - (this.width <= 650 ? 390 : 205));
      const x = clamp(p.x, 31, this.width - 31), y = clamp(p.y, top, bottom);
      const angle = Math.atan2(p.y - this.height / 2, p.x - this.width / 2);
      c.save(); c.translate(x, y); c.rotate(angle); c.strokeStyle = color; c.fillStyle = '#0a202dcc'; c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(10, 0); c.lineTo(-5, -6); c.lineTo(-2, 0); c.lineTo(-5, 6); c.closePath(); c.fill(); c.stroke(); c.restore();
      this.drawChip(clamp(x, 52, this.width - 52), y + 20, label, color, 8);
    }

    getNavigationWarning(g) {
      const p = g.player;
      if (!p || p.hp <= 0) return null;
      const margin = p.length * .55, vx = p.vx || 0, vy = p.vy || 0;
      const borders = [
        {distance: p.x - margin, toward: -vx, point: {x: 0, y: p.y}, vertical: true},
        {distance: g.world.w - margin - p.x, toward: vx, point: {x: g.world.w, y: p.y}, vertical: true},
        {distance: p.y - margin, toward: -vy, point: {x: p.x, y: 0}, vertical: false},
        {distance: g.world.h - margin - p.y, toward: vy, point: {x: p.x, y: g.world.h}, vertical: false}
      ];
      let warning = borders.filter(b => b.distance < Math.max(45, b.toward * 2) && (b.toward > 1 || b.distance < 8))
        .sort((a, b) => a.distance - b.distance)[0];
      if (warning) warning = Object.assign({type: 'edge'}, warning);
      let closest = null, closestDistance = Infinity;
      for (const island of g.islands) {
        const rotation = island.rotation || 0, cs = Math.cos(rotation), sn = Math.sin(rotation);
        const rel = p.angle - rotation;
        const rx = island.rx + Math.abs(Math.cos(rel)) * p.length * .45 + Math.abs(Math.sin(rel)) * p.width * .5;
        const ry = island.ry + Math.abs(Math.sin(rel)) * p.length * .45 + Math.abs(Math.cos(rel)) * p.width * .5;
        const x = ((p.x - island.x) * cs + (p.y - island.y) * sn) / rx;
        const y = (-(p.x - island.x) * sn + (p.y - island.y) * cs) / ry;
        const dx = (vx * cs + vy * sn) * 2 / rx, dy = (-vx * sn + vy * cs) * 2 / ry;
        const normalizedDistance = Math.hypot(x, y);
        if (normalizedDistance < closestDistance) { closestDistance = normalizedDistance; closest = island; }
        const velocity2 = dx * dx + dy * dy;
        if (velocity2 < .0001) continue;
        const t = clamp(-(x * dx + y * dy) / velocity2, 0, 1);
        if (t <= .02 || Math.hypot(x + dx * t, y + dy * t) > 1.03) continue;
        if (!warning || warning.type === 'edge' || t < warning.t) {
          warning = {type: 'shore', island, t, point: {x: p.x + vx * 2 * t, y: p.y + vy * 2 * t}};
        }
      }
      const contact = p.contact && p.contact.until > g.time ? p.contact : null;
      if (p.groundedUntil > g.time || contact && contact.kind === 'island') return {type: 'grounded', island: closest, point: {x: p.x, y: p.y}};
      if (contact && contact.kind === 'boundary') return Object.assign({type: 'edge'}, borders.sort((a, b) => a.distance - b.distance)[0]);
      return warning || null;
    }

    drawNavigationWorld(g, warning) {
      const c = this.ctx, z = this.zoom, p = g.player;
      c.save(); c.strokeStyle = warning.type === 'grounded' ? 'rgba(239,156,124,.85)' : 'rgba(228,191,126,.65)';
      c.lineWidth = 1.5 / z; c.setLineDash([5 / z, 5 / z]);
      if (warning.island) {
        const island = warning.island;
        c.save(); c.translate(island.x, island.y); c.rotate(island.rotation || 0);
        c.beginPath(); c.ellipse(0, 0, island.rx, island.ry, 0, 0, TAU); c.stroke(); c.restore();
      } else if (warning.type === 'edge') {
        const q = warning.point, r = 100 / z;
        c.beginPath(); c.moveTo(q.x - (warning.vertical ? 0 : r), q.y - (warning.vertical ? r : 0));
        c.lineTo(q.x + (warning.vertical ? 0 : r), q.y + (warning.vertical ? r : 0)); c.stroke();
      }
      if (warning.type !== 'grounded') {
        c.globalAlpha = .6; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(warning.point.x, warning.point.y); c.stroke();
      }
      c.setLineDash([]); c.restore();
    }

    drawNavigationLabel(g, warning) {
      const p = g.player, s = this.worldToScreen(p.x, p.y);
      if (!this.onScreen(p.x, p.y, 20)) return;
      const labels = {grounded: '해안 접촉 · 후진 후 조타', shore: '진행 방향 해안 · 감속', edge: '해역 경계 · 안쪽으로 조타'};
      const x = clamp(s.x, 100, this.width - 100), y = clamp(s.y + Math.max(31, p.length * this.zoom * .57) + 32, 118, this.height - 145);
      this.drawChip(x, y, labels[warning.type], warning.type === 'grounded' ? '#efa98c' : '#e3c694', 9);
    }

    drawChip(x, y, text, color, fontSize = 9) {
      const c = this.ctx;
      c.save(); c.font = `500 ${fontSize}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      const width = c.measureText(text).width + 14;
      c.fillStyle = 'rgba(5,23,32,.86)'; c.fillRect(x - width / 2, y - 9, width, 18);
      c.fillStyle = color; c.fillText(text, x, y); c.restore();
    }

    drawWake(ship, time) {
      if (ship.hp <= 0 || Math.abs(ship.speed) < 1) return;
      const c = this.ctx, speed = clamp(Math.abs(ship.speed) / ship.maxSpeed, 0, 1);
      const l = ship.length, w = ship.width, direction = ship.speed >= 0 ? 1 : -1;
      c.save(); c.translate(ship.x, ship.y); c.rotate(ship.angle + (direction < 0 ? Math.PI : 0));
      const wakeLength = 36 + speed * 140;
      const gradient = c.createLinearGradient(-l * .35, 0, -l * .5 - wakeLength, 0);
      gradient.addColorStop(0, `rgba(190,228,224,${.12 + speed * .18})`); gradient.addColorStop(1, 'rgba(190,228,224,0)');
      c.fillStyle = gradient;
      c.beginPath(); c.moveTo(-l * .32, -w * .35); c.quadraticCurveTo(-l * .5 - wakeLength * .5, -w * .75, -l * .5 - wakeLength, -w * 1.6);
      c.lineTo(-l * .5 - wakeLength, w * 1.6); c.quadraticCurveTo(-l * .5 - wakeLength * .5, w * .75, -l * .32, w * .35); c.closePath(); c.fill();
      for (let i = 0; i < 6; i++) {
        const t = ((time * .65 + i / 6) % 1), x = -l * .4 - t * wakeLength;
        c.strokeStyle = `rgba(208,240,236,${(1 - t) * speed * .22})`; c.lineWidth = 1.4;
        c.beginPath(); c.moveTo(x + 8, -w * (.3 + t)); c.quadraticCurveTo(x - 4, 0, x + 8, w * (.3 + t)); c.stroke();
      }
      c.strokeStyle = `rgba(219,247,236,${speed * .52})`; c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(l * .5, 0); c.quadraticCurveTo(l * .37, -w * .6, l * .17, -w * .62); c.stroke();
      c.beginPath(); c.moveTo(l * .5, 0); c.quadraticCurveTo(l * .37, w * .6, l * .17, w * .62); c.stroke(); c.restore();
    }

    hullPath(l, w) {
      const p = new Path2D();
      p.moveTo(l * .53, 0); p.bezierCurveTo(l * .38, -w * .35, l * .27, -w * .5, l * .10, -w * .5);
      p.lineTo(-l * .39, -w * .45); p.quadraticCurveTo(-l * .5, -w * .32, -l * .5, -w * .22);
      p.lineTo(-l * .5, w * .22); p.quadraticCurveTo(-l * .5, w * .32, -l * .39, w * .45);
      p.lineTo(l * .10, w * .5); p.bezierCurveTo(l * .27, w * .5, l * .38, w * .35, l * .53, 0); p.closePath(); return p;
    }

    drawShip(ship, time, menu) {
      const c = this.ctx, l = ship.length, w = ship.width, dead = ship.hp <= 0;
      const hull = this.hullPath(l, w), accent = ship.team === 0 ? blue : red;
      c.save(); c.translate(ship.x, ship.y); c.rotate(ship.angle);
      c.save(); c.translate(5, 7); c.fillStyle = 'rgba(0,9,16,.43)'; c.fill(hull); c.restore();
      if (dead) {
        c.globalAlpha = .38; c.fillStyle = '#152c32'; c.fill(hull); c.strokeStyle = '#34515a'; c.lineWidth = 1; c.stroke(hull); c.restore(); return;
      }
      c.strokeStyle = '#263e49'; c.lineWidth = 3; c.fillStyle = '#788b90'; c.fill(hull); c.stroke(hull);
      c.save(); c.scale(.94, .86); c.fillStyle = '#586e76'; c.fill(hull); c.restore();
      c.save(); c.scale(.89, .65); c.fillStyle = '#8e9892'; c.fill(hull); c.restore();
      // Foredeck seams, hull plates and rail highlights.
      c.strokeStyle = 'rgba(35,50,55,.38)'; c.lineWidth = .6;
      for (let x = -l * .4; x < l * .37; x += 7) {
        const halfWidth = x > l * .17 ? w * .24 : w * .30;
        c.beginPath(); c.moveTo(x, -halfWidth); c.lineTo(x, halfWidth); c.stroke();
      }
      c.strokeStyle = 'rgba(223,236,226,.42)'; c.lineWidth = .8;
      c.beginPath(); c.moveTo(-l * .38, -w * .38); c.lineTo(l * .14, -w * .42); c.lineTo(l * .43, -w * .12); c.stroke();
      c.fillStyle = '#3c525e'; c.fillRect(-l * .14, -w * .23, l * .24, w * .46);
      c.fillStyle = '#607c86'; c.fillRect(-l * .11, -w * .2, l * .18, w * .36);
      c.fillStyle = '#adbbb7'; c.fillRect(l * .015, -w * .25, l * .075, w * .5);
      c.fillStyle = '#203d4d'; c.fillRect(l * .07, -w * .19, l * .028, w * .38);
      c.fillStyle = '#869ba1'; c.fillRect(-l * .035, -w * .15, l * .08, w * .3);
      c.fillStyle = '#293c44'; c.fillRect(-l * .15, -w * .13, l * .075, w * .26);
      c.fillStyle = '#4a6069'; c.fillRect(-l * .15, -w * .13, l * .055, w * .19);
      c.strokeStyle = '#c2d6d0'; c.lineWidth = .8;
      c.beginPath(); c.moveTo(-l * .03, -w * .28); c.lineTo(-l * .03, w * .28); c.moveTo(-l * .1, 0); c.lineTo(l * .06, 0); c.stroke();
      c.fillStyle = accent; c.globalAlpha = .72; c.fillRect(l * .12, -w * .34, 3, w * .68); c.globalAlpha = 1;
      if (ship.sections) {
        c.save(); c.clip(hull);
        for (const [name, start, width] of [['bow', .18, .38], ['mid', -.22, .40], ['stern', -.53, .31]]) {
          const section = ship.sections[name];
          if (!section || !(section.maxHp > 0)) continue;
          const damage = 1 - clamp(section.hp / section.maxHp, 0, 1);
          if (damage < .08) continue;
          c.fillStyle = `rgba(10,22,26,${damage * .52})`;
          c.fillRect(l * start, -w * .55, l * width, w * 1.1);
          if (damage > .62) {
            c.strokeStyle = `rgba(13,24,26,${damage * .8})`; c.lineWidth = 1.1;
            c.beginPath(); c.moveTo(l * (start + width * .24), -w * .3); c.lineTo(l * (start + width * .42), w * .06);
            c.lineTo(l * (start + width * .30), w * .32); c.stroke();
          }
        }
        c.restore();
      }
      // Turrets rotate independently of hull orientation.
      const turrets = ship.classId === 'battleship' ? [.32, .19, -.26, -.38] : ship.classId === 'destroyer' ? [.28, -.3] : [.30, .19, -.30];
      const gunRotation = Number.isFinite(ship.gunAngle) ? ship.gunAngle - ship.angle : 0;
      for (const x of turrets) this.drawTurret(x * l, 0, w * (ship.classId === 'battleship' ? .35 : .3), gunRotation, ship.classId);
      if (ship.isPlayer && !menu) {
        c.strokeStyle = 'rgba(109,242,225,.8)'; c.lineWidth = 1.1 / this.zoom;
        c.beginPath(); c.moveTo(l * .65, -5 / this.zoom); c.lineTo(l * .73, 0); c.lineTo(l * .65, 5 / this.zoom); c.stroke();
      }
      if (ship.repairTime > 0) {
        c.strokeStyle = `rgba(110,236,170,${.3 + Math.sin(time * 5) * .15})`; c.lineWidth = 2 / this.zoom; c.stroke(hull);
      }
      if (ship.isPlayer && ship.groundedUntil > this.simulationTime) {
        c.strokeStyle = 'rgba(240,159,127,.8)'; c.lineWidth = 1.8 / this.zoom; c.stroke(hull);
      }
      c.restore();
    }

    drawTurret(x, y, size, angle, shipClass) {
      const c = this.ctx, barrels = shipClass === 'battleship' ? 3 : 2;
      c.save(); c.translate(x, y); c.rotate(angle);
      c.fillStyle = '#263f49'; c.beginPath(); c.ellipse(0, 1.5, size * .85, size * .7, 0, 0, TAU); c.fill();
      c.fillStyle = '#a2b5b6'; c.fillRect(-size * .55, -size * .55, size, size * 1.1);
      c.fillStyle = '#6a858e'; c.fillRect(-size * .5, 0, size * .95, size * .48);
      c.strokeStyle = '#e0e6dc'; c.lineWidth = shipClass === 'battleship' ? 1.7 : 1.2;
      for (let i = 0; i < barrels; i++) {
        const by = (i - (barrels - 1) / 2) * size * .42;
        c.beginPath(); c.moveTo(size * .3, by); c.lineTo(size * 2, by); c.stroke();
      }
      c.restore();
    }

    drawProjectile(p) {
      const c = this.ctx, z = this.zoom;
      if (p.kind === 'torpedo') {
        c.save(); c.translate(p.x, p.y); c.rotate(p.angle || Math.atan2(p.vy, p.vx));
        const fade = c.createLinearGradient(-50, 0, 8, 0);
        fade.addColorStop(0, 'rgba(201,244,237,0)'); fade.addColorStop(1, 'rgba(201,244,237,.65)');
        c.strokeStyle = fade; c.lineWidth = 2 / z; c.beginPath(); c.moveTo(-48, 0); c.lineTo(2, 0); c.stroke();
        c.fillStyle = p.team === 0 ? '#c1f9eb' : '#ff9c82';
        c.beginPath(); c.moveTo(7, 0); c.lineTo(-3, -3); c.lineTo(-3, 3); c.closePath(); c.fill();
        c.strokeStyle = 'rgba(205,242,232,.24)'; c.lineWidth = 1 / z;
        c.beginPath(); c.moveTo(-4, -3); c.lineTo(-22, -9); c.moveTo(-4, 3); c.lineTo(-22, 9); c.stroke(); c.restore(); return;
      }
      const progress = clamp(p.age / Math.max(.001, p.life), 0, 1);
      const height = Math.sin(progress * Math.PI) * (p.secondary ? 20 : 55);
      const x = p.x, y = p.y - height, a = p.angle || Math.atan2(p.targetY - p.startY, p.targetX - p.startX);
      c.strokeStyle = p.secondary ? 'rgba(247,206,132,.55)' : p.ammo === 'AP' ? 'rgba(236,239,214,.7)' : 'rgba(255,205,130,.75)';
      const tail = p.secondary ? 10 : 18;
      c.lineWidth = (p.secondary ? 1 : 1.8) / z; c.beginPath(); c.moveTo(x - Math.cos(a) * tail, y - Math.sin(a) * tail); c.lineTo(x, y); c.stroke();
      c.fillStyle = '#fff4cc'; c.beginPath(); c.arc(x, y, (p.secondary ? 1.1 : 1.9) / z, 0, TAU); c.fill();
      c.fillStyle = 'rgba(1,16,22,.25)'; c.beginPath(); c.ellipse(p.x + 4, p.y + 4, 2, 1, 0, 0, TAU); c.fill();
    }

    drawEffect(e) {
      const c = this.ctx, t = clamp(e.age / Math.max(e.life, .01), 0, 1), r = e.radius || 24;
      c.save(); c.translate(e.x, e.y);
      if (e.type === 'splash') {
        c.strokeStyle = `rgba(195,232,228,${(1 - t) * .7})`; c.lineWidth = 1.6;
        c.beginPath(); c.ellipse(0, 0, r * (.3 + t), r * (.16 + t * .55), 0, 0, TAU); c.stroke();
        c.strokeStyle = `rgba(225,247,239,${(1 - t) * .8})`; c.lineWidth = 2.4;
        for (let i = 0; i < 6; i++) {
          const a = i / 6 * TAU, x = Math.cos(a) * r * .3 * t;
          c.beginPath(); c.moveTo(x * .6, 0); c.quadraticCurveTo(x, -r * (1 - t) * .8, Math.cos(a) * r * t * .5, -r * Math.sin(Math.PI * t) * .5); c.stroke();
        }
      } else if (e.type === 'smoke') {
        const grad = c.createRadialGradient(0, 0, 0, 0, 0, r * (1 + t));
        grad.addColorStop(0, `rgba(126,149,151,${(1 - t) * .25})`); grad.addColorStop(1, 'rgba(126,149,151,0)');
        c.fillStyle = grad; c.beginPath(); c.arc(0, 0, r * (1 + t), 0, TAU); c.fill();
      } else {
        const scale = e.type === 'muzzle' ? .65 : 1, rad = Math.max(2, r * scale * (.35 + t * 1.4));
        const grad = c.createRadialGradient(0, -r * .1, 0, 0, 0, rad);
        grad.addColorStop(0, `rgba(255,244,195,${(1 - t) * .98})`);
        grad.addColorStop(.24, `rgba(255,180,74,${(1 - t) * .9})`);
        grad.addColorStop(.58, `rgba(232,95,40,${(1 - t) * .6})`);
        grad.addColorStop(1, 'rgba(98,53,37,0)');
        c.fillStyle = grad; c.beginPath(); c.arc(0, 0, rad, 0, TAU); c.fill();
        if (e.type !== 'muzzle') {
          c.strokeStyle = `rgba(235,244,211,${(1 - t) * .6})`; c.lineWidth = 1.5;
          for (let i = 0; i < 9; i++) {
            const a = i / 9 * TAU + noise(i + r), reach = r * (1 + t) * (.7 + noise(i * 7) * .5);
            c.beginPath(); c.moveTo(Math.cos(a) * reach * .6, Math.sin(a) * reach * .6); c.lineTo(Math.cos(a) * reach, Math.sin(a) * reach); c.stroke();
          }
        }
      }
      c.restore();
    }

    drawSmoke(cloud, time) {
      const c = this.ctx, radius = cloud.radius || 145;
      const fade = Math.min(1, Math.max(0, (cloud.life - cloud.age) / 4));
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * TAU, x = cloud.x + Math.cos(a) * radius * .42, y = cloud.y + Math.sin(a) * radius * .36;
        const r = radius * (.55 + Math.sin(time * .4 + i) * .055);
        const gradient = c.createRadialGradient(x, y, 0, x, y, r);
        gradient.addColorStop(0, `rgba(154,182,185,${.22 * fade})`); gradient.addColorStop(.6, `rgba(135,164,169,${.14 * fade})`); gradient.addColorStop(1, 'rgba(125,154,161,0)');
        c.fillStyle = gradient; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
      }
    }

    drawFire(ship, time) {
      const c = this.ctx;
      c.save(); c.translate(ship.x, ship.y);
      const x = -Math.cos(ship.angle) * ship.length * .12, y = -Math.sin(ship.angle) * ship.length * .12;
      for (let i = 0; i < 4; i++) {
        const t = (time * .42 + i / 4) % 1, r = 6 + t * 20;
        c.fillStyle = `rgba(20,28,31,${(1 - t) * .34})`; c.beginPath(); c.arc(x - t * 15, y - t * 40, r, 0, TAU); c.fill();
      }
      const size = 5 + Math.sin(time * 18) * 2;
      const glow = c.createRadialGradient(x, y, 0, x, y, size * 3);
      glow.addColorStop(0, 'rgba(255,224,124,.9)'); glow.addColorStop(.25, 'rgba(255,129,45,.85)'); glow.addColorStop(1, 'rgba(255,85,29,0)');
      c.fillStyle = glow; c.beginPath(); c.arc(x, y, size * 3, 0, TAU); c.fill(); c.restore();
    }

    drawWorldBoundary(g) {
      const c = this.ctx; c.strokeStyle = 'rgba(255,153,118,.3)'; c.lineWidth = 3 / this.zoom; c.setLineDash([20 / this.zoom, 12 / this.zoom]);
      c.strokeRect(0, 0, g.world.w, g.world.h); c.setLineDash([]);
    }

    drawLabels(g, ships, view) {
      const c = this.ctx;
      for (const ship of ships) {
        if (ship.hp <= 0 || !this.onScreen(ship.x, ship.y, 80)) continue;
        const p = this.worldToScreen(ship.x, ship.y), color = ship.team === 0 ? blue : red;
        const selected = view.targetId === ship.id;
        const offset = Math.max(21, ship.length * this.zoom * .48 + 9), y = p.y - offset;
        c.textAlign = 'center'; c.textBaseline = 'bottom';
        c.font = `${selected ? 600 : 500} 10px "Inter", "Noto Sans KR", sans-serif`;
        c.shadowColor = '#03141d'; c.shadowBlur = 4;
        c.fillStyle = ship.isPlayer ? '#d5fff4' : color;
        c.fillText(ship.isPlayer ? `${ship.name} · YOU` : ship.name, p.x, y - 7);
        c.shadowBlur = 0;
        const width = selected ? 58 : 43;
        c.fillStyle = 'rgba(3,19,27,.75)'; c.fillRect(p.x - width / 2, y - 4, width, 3);
        c.fillStyle = color; c.fillRect(p.x - width / 2, y - 4, width * clamp(ship.hp / ship.maxHp, 0, 1), 3);
        if (selected) {
          const r = Math.max(ship.length * this.zoom * .65, 27);
          c.strokeStyle = red; c.lineWidth = 1.2;
          for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
            c.beginPath(); c.moveTo(p.x + sx * (r - 7), p.y + sy * r); c.lineTo(p.x + sx * r, p.y + sy * r); c.lineTo(p.x + sx * r, p.y + sy * (r - 7)); c.stroke();
          }
        }
        if (ship.sonarTime > 0) {
          const r = 20 + (this.time * 25) % 60;
          c.strokeStyle = `rgba(101,232,221,${(1 - (r - 20) / 60) * .3})`; c.lineWidth = 1;
          c.beginPath(); c.arc(p.x, p.y, r, 0, TAU); c.stroke();
        }
      }
    }

    drawAim(g, view) {
      const player = g.player;
      if (player.hp <= 0 || !Number.isFinite(view.aimX) || !Number.isFinite(view.aimY)) return;
      const c = this.ctx, p = this.worldToScreen(view.aimX, view.aimY), own = this.worldToScreen(player.x, player.y);
      const profile = globalThis.IronTide.CLASSES[player.classId] || {};
      const solution = this.solution;
      const range = solution && Number.isFinite(solution.maxRange) ? solution.maxRange :
        view.ammo === 'TORP' ? (player.torpRange || profile.torpRange || 1200) : player.range;
      const distance = Math.hypot(view.aimX - player.x, view.aimY - player.y), inRange = distance <= range;
      const ready = solution ? solution.ready : inRange;
      const delayed = solution && ['cooldown', 'traverse'].includes(solution.reason);
      const color = ready ? '#b6f5dd' : delayed ? '#f0c989' : '#ff967e';
      const reload = solution ? solution.reload : view.ammo === 'TORP' ? player.torpReload : player.reload;
      const reloadMax = view.ammo === 'TORP' ? player.torpReloadMax : player.reloadMax;
      c.strokeStyle = 'rgba(188,236,223,.13)'; c.lineWidth = 1; c.setLineDash([3, 8]);
      c.beginPath(); c.moveTo(own.x, own.y); c.lineTo(p.x, p.y); c.stroke(); c.setLineDash([]);
      c.strokeStyle = color; c.lineWidth = 1.15;
      c.beginPath(); c.arc(p.x, p.y, 11, 0, TAU); c.stroke();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        c.beginPath(); c.moveTo(p.x + dx * 15, p.y + dy * 15); c.lineTo(p.x + dx * 23, p.y + dy * 23); c.stroke();
      }
      c.fillStyle = color; c.fillRect(p.x - 1, p.y - 1, 2, 2);
      if (solution && !solution.ready && !delayed) {
        c.beginPath(); c.moveTo(p.x - 6, p.y - 6); c.lineTo(p.x + 6, p.y + 6); c.stroke();
      }
      if (reload > .1 && reloadMax > 0) {
        c.strokeStyle = 'rgba(239,196,128,.9)'; c.lineWidth = 2;
        c.beginPath(); c.arc(p.x, p.y, 28, -Math.PI / 2, -Math.PI / 2 + (1 - clamp(reload / reloadMax, 0, 1)) * TAU); c.stroke();
      }
      c.font = '10px "Inter", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'top';
      c.fillStyle = 'rgba(216,241,231,.8)';
      const textX = clamp(p.x, 90, this.width - 90), textY = Math.min(p.y + 36, this.height - 52);
      const flight = solution && Number.isFinite(solution.flightTime) ? ` · ${solution.flightTime.toFixed(1)}s` : '';
      c.fillText(`${(distance / 1000).toFixed(2)} km${flight}`, textX, textY);
      if (solution) {
        const reasons = { ready: '사격 준비', cooldown: '재장전', traverse: '포탑 선회', arc: '측면 발사각 필요',
          range: '사거리 밖', obstructed: '섬에 가려짐', noammo: '어뢰 없음', disabled: '주포 복구 중' };
        c.fillStyle = color; c.font = '9px sans-serif';
        const count = `${solution.barrels}/${solution.totalBarrels}${view.ammo === 'TORP' ? ' 발사관' : '문'}`;
        const alignment = solution.reason === 'traverse' && Number.isFinite(solution.alignmentTime) ? ` ${solution.alignmentTime.toFixed(1)}s` : '';
        c.fillText(`${count} · ${reasons[solution.reason] || '조준 확인'}${alignment}`, textX, textY + 15);
      }
      if (view.aimAssistHint === true) this.drawChip(textX, textY + 39, '선행 조준 설정', '#dcd39b', 8);
      const target = g.ships.find(s => s.id === view.targetId && s.hp > 0 && s.visible && s.team === 1);
      if (target && globalThis.IronTide.predictIntercept && (view.ammo !== 'TORP' || player.torpReloadMax > 0)) {
        const speed = view.ammo === 'TORP' ? (profile.torpSpeed || 190) : (profile.shellSpeed || 480);
        const lead = globalThis.IronTide.predictIntercept(player, target, speed), lp = this.worldToScreen(lead.x, lead.y), tp = this.worldToScreen(target.x, target.y);
        if (!this.onScreen(lead.x, lead.y, 8)) { this.drawEdgeBeacon(lead, '#e3cc98', '목표 선행점'); return; }
        c.save();
        if (Math.hypot(lp.x - tp.x, lp.y - tp.y) > 9) {
          c.strokeStyle = 'rgba(238,206,151,.8)'; c.lineWidth = 1.2; c.setLineDash([3, 5]);
          c.beginPath(); c.moveTo(tp.x, tp.y); c.lineTo(lp.x, lp.y); c.stroke(); c.setLineDash([]);
        }
        c.strokeStyle = '#e3cc98'; c.fillStyle = '#0a222e'; c.lineWidth = 1.5;
        c.shadowColor = '#06151d'; c.shadowBlur = 5;
        c.beginPath(); c.moveTo(lp.x, lp.y - 7); c.lineTo(lp.x + 7, lp.y); c.lineTo(lp.x, lp.y + 7); c.lineTo(lp.x - 7, lp.y); c.closePath(); c.fill(); c.stroke();
        c.shadowBlur = 0; c.fillStyle = '#f6e7bb'; c.fillRect(lp.x - 1, lp.y - 1, 2, 2);
        const labelY = Math.hypot(lp.x - p.x, lp.y - p.y) < 45 ? lp.y - 24 : lp.y + 23;
        this.drawChip(clamp(lp.x, 55, this.width - 55), labelY, '예상 위치 · L', '#dfd19f', 8);
        c.restore();
      }
    }

    drawModuleWarnings(player) {
      if (player.hp <= 0 || !player.modules || !this.onScreen(player.x, player.y, 30)) return;
      const modules = Object.entries(player.modules).filter(([, module]) => module.state !== 'normal');
      if (!modules.length) return;
      const c = this.ctx, p = this.worldToScreen(player.x, player.y);
      const labels = { engine: '기관', rudder: '조타', guns: '주포' };
      const y = p.y + Math.max(24, player.length * this.zoom * .55);
      c.save(); c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '8px sans-serif';
      modules.forEach(([key, module], index) => {
        const x = p.x + (index - (modules.length - 1) / 2) * 49;
        c.fillStyle = 'rgba(7,23,31,.9)'; c.fillRect(x - 23, y, 46, 16);
        c.strokeStyle = module.state === 'critical' ? '#ee927b' : '#d5be8d';
        c.lineWidth = 1; c.strokeRect(x - 23, y, 46, 16);
        c.fillStyle = c.strokeStyle;
        c.fillText(`${labels[key] || key} ${Math.ceil(module.time)}s`, x, y + 8);
      });
      c.restore();
    }

    drawBinocular() {
      const c = this.ctx, w = this.width, h = this.height;
      c.save();
      // Optical edge mask changes the presentation only; the controller owns zoom and aim.
      const mask = new Path2D(); mask.rect(0, 0, w, h);
      mask.ellipse(w / 2, h / 2, w * .47, h * .47, 0, 0, TAU);
      c.fillStyle = 'rgba(1,12,19,.50)'; c.fill(mask, 'evenodd');
      c.strokeStyle = 'rgba(169,216,204,.17)'; c.lineWidth = 1;
      c.beginPath(); c.ellipse(w / 2, h / 2, w * .466, h * .466, 0, 0, TAU); c.stroke();
      const baseline = h * .56, spacing = Math.min(36, w / 17);
      c.strokeStyle = 'rgba(184,228,214,.23)'; c.font = '8px ui-monospace,monospace';
      c.fillStyle = 'rgba(184,228,214,.42)'; c.textAlign = 'center'; c.textBaseline = 'top';
      for (let i = -6; i <= 6; i++) {
        if (i === 0) continue;
        const x = w / 2 + i * spacing, tick = i % 2 === 0 ? 9 : 5;
        c.beginPath(); c.moveTo(x, baseline); c.lineTo(x, baseline + tick); c.stroke();
        if (i % 2 === 0) c.fillText(`${Math.abs(i)}`, x, baseline + 13);
      }
      c.textAlign = 'right'; c.font = '9px ui-monospace,monospace';
      c.fillText('OPTICAL SIGHT', w - 30, h * .65);
      c.restore();
    }

    drawFloatingDamage(g) {
      const c = this.ctx;
      for (const e of g.events.slice(-16)) {
        const age = g.time - e.time;
        if (age < 0 || age > 1.45 || !(e.damage > 0) || !Number.isFinite(e.x) || !Number.isFinite(e.y)) continue;
        if (e.team === 1) continue;
        const ship = e.shipId && g.ships.find(s => s.id === e.shipId);
        if (ship && ship.team === 1 && !ship.visible) continue;
        const p = this.worldToScreen(e.x, e.y);
        c.globalAlpha = Math.min(1, (1.45 - age) * 2); c.fillStyle = '#fff0c6';
        c.font = '600 14px "Inter", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.shadowColor = '#09232b'; c.shadowBlur = 4;
        c.fillText(Math.round(e.damage).toLocaleString(), p.x, p.y - 25 - age * 26);
        c.shadowBlur = 0; c.globalAlpha = 1;
      }
    }
  }

  globalThis.IronTide = Object.assign(globalThis.IronTide || {}, { Renderer });
})();
