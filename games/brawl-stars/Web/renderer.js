(function (global) {
  'use strict';

  const TAU = Math.PI * 2;
  const INK = '#142638';
  const TEAM = ['#68e7e7', '#ff8276'];
  const TEAM_DARK = ['#197e91', '#a74351'];
  const FONT = '"Pretendard", "Noto Sans KR", "Noto Sans CJK KR", system-ui, sans-serif';
  const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
  const number = (n, fallback) => Number.isFinite(n) ? n : fallback;

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function disc(ctx, x, y, r, fill, stroke, lineWidth) {
    if (r <= 0) return;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth || 1; ctx.stroke(); }
  }

  function polygon(ctx, points, fill, stroke, lineWidth) {
    ctx.beginPath();
    points.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth || 2; ctx.stroke(); }
  }

  function box(ctx, x, y, w, h, r, fill, stroke, lineWidth) {
    roundRect(ctx, x, y, w, h, r);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth || 2; ctx.stroke(); }
  }

  function star(ctx, x, y, radius, fill, stroke, lineWidth) {
    const points = [];
    for (let i = 0; i < 10; i++) {
      const angle = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? radius * .46 : radius;
      points.push([x + Math.cos(angle) * r, y + Math.sin(angle) * r]);
    }
    polygon(ctx, points, fill, stroke, lineWidth);
  }

  function randomAt(a, b) {
    const value = Math.sin(a * 127.1 + b * 311.7 + 12.17) * 43758.5453;
    return value - Math.floor(value);
  }

  function segmentRect(x1, y1, x2, y2, rect, padding) {
    const dx = x2 - x1, dy = y2 - y1;
    const minX = rect.x - padding, maxX = rect.x + rect.w + padding;
    const minY = rect.y - padding, maxY = rect.y + rect.h + padding;
    let entry = 0, exit = 1;
    for (const axis of [[x1, dx, minX, maxX], [y1, dy, minY, maxY]]) {
      if (Math.abs(axis[1]) < 1e-9) {
        if (axis[0] < axis[2] || axis[0] > axis[3]) return null;
      } else {
        let near = (axis[2] - axis[0]) / axis[1], far = (axis[3] - axis[0]) / axis[1];
        if (near > far) { const swap = near; near = far; far = swap; }
        entry = Math.max(entry, near); exit = Math.min(exit, far);
        if (entry > exit) return null;
      }
    }
    return entry >= 0 && entry <= 1 ? entry : null;
  }

  function segmentCircle(x1, y1, x2, y2, circle, padding) {
    const dx = x2 - x1, dy = y2 - y1, ox = x1 - circle.x, oy = y1 - circle.y;
    const radius = circle.r + padding, c = ox * ox + oy * oy - radius * radius;
    if (c <= 0) return 0;
    const a = dx * dx + dy * dy;
    if (a < 1e-9) return null;
    const b = ox * dx + oy * dy, discriminant = b * b - a * c;
    if (discriminant < 0) return null;
    const entry = (-b - Math.sqrt(discriminant)) / a;
    return entry >= 0 && entry <= 1 ? entry : null;
  }

  function makeCanvas(width, height) {
    let surface;
    if (typeof OffscreenCanvas !== 'undefined') surface = new OffscreenCanvas(width, height);
    else if (global.document && global.document.createElement) {
      surface = global.document.createElement('canvas');
      surface.width = width;
      surface.height = height;
    }
    return surface || null;
  }

  class BrawlRenderer {
    constructor(canvas) {
      if (!canvas || typeof canvas.getContext !== 'function') throw new TypeError('BrawlRenderer requires a canvas.');
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      if (!this.ctx) throw new Error('Canvas 2D is unavailable.');
      this.width = 1280;
      this.height = 800;
      this.cssWidth = 1280;
      this.cssHeight = 800;
      this.dpr = 1;
      this.scale = 1;
      this.offsetX = 0;
      this.offsetY = 0;
      this._floor = null;
      this._floorKey = '';
      this._explicitDpr = null;
      this._destroyed = false;
      this._time = 0;
      this._reducedEffects = false;
      this._baseScale = 1;
      this._viewport = { x: 0, y: 0, w: 1280, h: 800 };
      this._camera = { mode: 'overview', zoom: 1, x: 0, y: 0, w: 1280, h: 800, focusId: null, spectating: false };
      this._lastTransform = { x: 0, y: 0, scale: 1, cssWidth: 1280, cssHeight: 800 };
    }

    resize(width, height, dpr) {
      if (this._destroyed) return;
      if (Number.isFinite(dpr) && dpr > 0) this._explicitDpr = dpr;
      this._setSize(number(width, this.cssWidth), number(height, this.cssHeight));
    }

    _setSize(width, height) {
      this.cssWidth = Math.max(1, width);
      this.cssHeight = Math.max(1, height);
      this.dpr = Math.min(2, this._explicitDpr || number(global.devicePixelRatio, 1) || 1);
      const w = Math.max(1, Math.round(this.cssWidth * this.dpr));
      const h = Math.max(1, Math.round(this.cssHeight * this.dpr));
      if (this.canvas.width !== w) this.canvas.width = w;
      if (this.canvas.height !== h) this.canvas.height = h;
      this._baseScale = Math.min(this.cssWidth / this.width, this.cssHeight / this.height);
      this._viewport = {
        x: (this.cssWidth - this.width * this._baseScale) / 2,
        y: (this.cssHeight - this.height * this._baseScale) / 2,
        w: this.width * this._baseScale,
        h: this.height * this._baseScale
      };
    }

    _setCamera(player, options, state) {
      let focus = player;
      const eliminated = !options.menu && state && state.mode === 'knockout' && player && player.alive === false;
      if (eliminated) {
        const allies = (state.actors || []).filter(actor => actor.id !== player.id && actor.team === player.team && actor.alive === true);
        focus = allies.find(actor => actor.id === options.focusId) || allies[0] || null;
      }
      const follow = !options.menu && options.camera === 'follow' && !!focus;
      const zoom = follow ? 1.5 : 1;
      const w = this.width / zoom, h = this.height / zoom;
      const x = follow ? clamp(number(focus.x, this.width / 2) - w / 2, 0, this.width - w) : 0;
      const y = follow ? clamp(number(focus.y, this.height / 2) - h / 2, 0, this.height - h) : 0;
      this._camera = { mode: follow ? 'follow' : 'overview', zoom, x, y, w, h,
        focusId: focus ? focus.id : null, spectating: !!(eliminated && focus) };
      this.scale = this._baseScale * zoom;
      this.offsetX = this._viewport.x - x * this.scale;
      this.offsetY = this._viewport.y - y * this.scale;
      this._lastTransform = { x: this.offsetX, y: this.offsetY, scale: this.scale, cssWidth: this.cssWidth, cssHeight: this.cssHeight };
    }

    screenToWorld(clientX, clientY) {
      const rect = this.canvas.getBoundingClientRect();
      const transform = this._lastTransform;
      const width = rect.width > 0 ? rect.width : transform.cssWidth;
      const height = rect.height > 0 ? rect.height : transform.cssHeight;
      // Retain the last rendered camera even if CSS resizes or moves the canvas
      // before the next render. The browser stretches that existing bitmap.
      return {
        x: ((clientX - rect.left) * transform.cssWidth / width - transform.x) / transform.scale,
        y: ((clientY - rect.top) * transform.cssHeight / height - transform.y) / transform.scale
      };
    }

    worldToScreen(worldX, worldY) {
      const rect = this.canvas.getBoundingClientRect(), transform = this._lastTransform;
      const width = rect.width > 0 ? rect.width : transform.cssWidth;
      const height = rect.height > 0 ? rect.height : transform.cssHeight;
      return {
        x: rect.left + (worldX * transform.scale + transform.x) * width / transform.cssWidth,
        y: rect.top + (worldY * transform.scale + transform.y) * height / transform.cssHeight
      };
    }

    render(state, options) {
      if (this._destroyed || !state) return;
      options = options || {};
      this.width = number(state.width, 1280);
      this.height = number(state.height, 800);
      this._reducedEffects = !!options.reducedEffects;
      this._time = this._reducedEffects ? 0 : number(options.time, number(state.elapsed, 0));
      const rect = this.canvas.getBoundingClientRect();
      this._setSize(rect.width > 0 ? rect.width : this.cssWidth, rect.height > 0 ? rect.height : this.cssHeight);
      const actors = Array.isArray(state.actors) ? state.actors : [];
      const player = actors.find(a => a.isPlayer || a.id === 0);
      const localTeam = player ? player.team : 0;
      this._setCamera(player, options, state);
      const ctx = this.ctx;
      ctx.setTransform(this.canvas.width / this.cssWidth, 0, 0, this.canvas.height / this.cssHeight, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const backdrop = ctx.createLinearGradient(0, 0, this.cssWidth, this.cssHeight);
      backdrop.addColorStop(0, '#0b1728');
      backdrop.addColorStop(1, '#142b3c');
      ctx.fillStyle = backdrop;
      ctx.fillRect(0, 0, this.cssWidth, this.cssHeight);
      ctx.save();
      roundRect(ctx, this._viewport.x, this._viewport.y, this._viewport.w, this._viewport.h, 22 * this._baseScale);
      ctx.clip();
      ctx.translate(this.offsetX, this.offsetY);
      ctx.scale(this.scale, this.scale);
      roundRect(ctx, 0, 0, this.width, this.height, 22);
      ctx.clip();
      this._drawFloor(state);

      const visible = actors.filter(a => a.alive !== false && !(a.hidden && !a.isPlayer && a.id !== 0 && a.team !== localTeam));
      const walls = (state.walls || []).filter(w => w.hp === undefined || w.hp > 0);
      const bushes = state.bushes || [];
      const safes = state.safes || [];

      if (state.mode === 'ball') this._drawGoals(state);
      if (state.mode === 'gem') this._drawMine(state);
      for (let i = 0; i < (state.captureZones || []).length; i++) this._drawCaptureZone(state.captureZones[i], i);
      for (const bush of bushes) this._drawBush(bush, false);
      for (const field of state.fields || []) {
        if (field.type === 'gravity' && (field.life === undefined || field.life > 0)) this._drawGravity(field, localTeam);
      }
      if (state.mode === 'training') {
        for (const actor of visible) if (actor.isDummy || actor.isTrainingDummy) this._drawTargetPad(actor);
      }
      for (const wall of walls) this._drawWallShadow(wall);
      for (const safe of safes) this._drawSafeShadow(safe);
      const aimTrace = options.showAim !== false && !options.menu && player && player.alive !== false
        ? this._drawAim(player, options, state, walls) : null;
      for (const pickup of state.pickups || []) this._drawPickup(pickup);
      const blueStar = this._groundBlueStar(state);
      if (blueStar) this._drawGroundBlueStar(blueStar);
      for (const actor of visible) this._drawActorShadow(actor);

      const scenery = walls.map(w => ({ y: w.y + w.h, wall: w }));
      for (const safe of safes) scenery.push({ y: safe.y + number(safe.r, 42) * .65, safe });
      for (const actor of visible) scenery.push({ y: actor.y + number(actor.r, 22) * 0.55, actor });
      scenery.sort((a, b) => a.y - b.y);
      for (const item of scenery) {
        if (item.wall) this._drawWall(item.wall);
        else if (item.safe) this._drawSafe(item.safe, number(state.elapsed, 0));
        else this._drawActor(item.actor, localTeam);
      }
      for (const bush of bushes) this._drawBush(bush, true);
      if (state.ball) this._drawBall(state.ball, visible);
      for (const projectile of state.projectiles || []) this._drawProjectile(projectile);
      for (const effect of state.effects || []) if (effect.life === undefined || effect.life > 0) this._drawEffect(effect, false);
      if (state.zone) this._drawZone(state.zone);
      if (aimTrace) this._drawAimEndpoint(aimTrace);
      for (const actor of visible) {
        if (this._camera.spectating && actor.id === this._camera.focusId) this._drawSpectatorFocus(actor);
        this._drawActorUI(actor, localTeam, options, state.mode, state.bounty && state.bounty.blueStar);
      }
      for (const safe of safes) this._drawSafeUI(safe);
      for (const effect of state.effects || []) if (effect.life === undefined || effect.life > 0) this._drawEffect(effect, true);
      this._drawArenaTrim(state.mode, state.overtime);
      ctx.restore();
      if (this._camera.mode === 'follow') {
        box(ctx, this._viewport.x + 1, this._viewport.y + 1, this._viewport.w - 2, this._viewport.h - 2,
          20 * this._baseScale, null, 'rgba(143,183,184,.35)', 1.5);
        if (options.minimap !== false) this._drawMinimap(state, player);
      }
    }

    _drawFloor(state) {
      const mode = state.mode || 'gem';
      const overtime = mode === 'ball' && !!state.overtime;
      const key = mode + ':' + overtime + ':' + this.width + ':' + this.height;
      if (this._floorKey !== key) {
        this._floor = makeCanvas(this.width, this.height);
        this._floorKey = key;
        if (this._floor) this._paintFloor(this._floor.getContext('2d'), mode, overtime);
      }
      if (this._floor) this.ctx.drawImage(this._floor, 0, 0, this.width, this.height);
      else this._paintFloor(this.ctx, mode, overtime);
    }

    _paintFloor(ctx, mode, overtime) {
      const w = this.width, h = this.height;
      const showdown = mode === 'showdown', ball = mode === 'ball', training = mode === 'training';
      const hotzone = mode === 'hotzone', heist = mode === 'heist';
      const knockout = mode === 'knockout', bounty = mode === 'bounty';
      const palette = {
        showdown: ['#a7a082', '#c5b58c'], ball: overtime ? ['#666e5b', '#4c5754'] : ['#3a6968', '#31545e'],
        hotzone: ['#4b6b78', '#36515f'], heist: ['#55676f', '#394c5c'], training: ['#4c6474', '#344b60'],
        knockout: ['#8c8c76', '#626d68'], bounty: ['#465b78', '#2e425c']
      }[mode] || ['#496473', '#344c5d'];
      const gradient = ctx.createLinearGradient(0, 0, w, h);
      gradient.addColorStop(0, palette[0]);
      gradient.addColorStop(1, palette[1]);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);
      ctx.save();
      ctx.lineCap = 'round';
      if (ball) {
        for (let x = 0; x < w; x += 128) {
          ctx.fillStyle = (x / 128) % 2 ? 'rgba(235,255,231,.025)' : 'rgba(11,42,51,.06)';
          ctx.fillRect(x, 0, 128, h);
        }
        ctx.strokeStyle = overtime ? 'rgba(255,211,132,.36)' : 'rgba(197,231,210,.24)';
        ctx.lineWidth = 4;
        roundRect(ctx, 64, 65, w - 128, h - 130, 26); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(w / 2, 65); ctx.lineTo(w / 2, h - 65); ctx.stroke();
        disc(ctx, w / 2, h / 2, 108, null, overtime ? 'rgba(255,211,132,.36)' : 'rgba(197,231,210,.24)', 4);
        disc(ctx, w / 2, h / 2, 6, overtime ? '#e4c184' : '#9dc7b9');
        roundRect(ctx, 65, h / 2 - 155, 152, 310, 12); ctx.stroke();
        roundRect(ctx, w - 217, h / 2 - 155, 152, 310, 12); ctx.stroke();
        if (overtime) {
          ctx.font = '800 18px ' + FONT; ctx.textAlign = 'center';
          ctx.fillStyle = 'rgba(255,222,155,.55)'; ctx.fillText('다음 골이 승리', w / 2, h - 36);
          ctx.setLineDash([14, 10]);
          disc(ctx, w / 2, h / 2, 123, null, 'rgba(255,210,123,.26)', 2); ctx.setLineDash([]);
        }
      } else if (knockout) {
        const cx = w / 2, cy = h / 2;
        polygon(ctx, [[cx-224,cy-96],[cx-128,cy-178],[cx+128,cy-178],[cx+224,cy-96],
          [cx+224,cy+96],[cx+128,cy+178],[cx-128,cy+178],[cx-224,cy+96]],
          'rgba(216,199,153,.15)', 'rgba(229,211,160,.26)', 4);
        ctx.strokeStyle = 'rgba(64,83,83,.24)'; ctx.lineWidth = 18;
        for (const y of [cy-188, cy+188]) {
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(235,215,163,.25)'; ctx.lineWidth = 2; ctx.setLineDash([19, 18]);
        ctx.beginPath(); ctx.moveTo(90, cy); ctx.lineTo(w-90, cy); ctx.stroke(); ctx.setLineDash([]);
        ctx.save(); ctx.translate(cx, cy);
        for (const side of [-1, 1]) {
          polygon(ctx, [[side*12,-27],[side*39,0],[side*12,27],[side*22,0]], 'rgba(230,211,163,.28)');
        }
        ctx.restore();
        for (let i = 0; i < 5; i++) {
          const x = w / 2 - 98 + i * 44;
          polygon(ctx, [[x,28],[x+20,28],[x+9,38],[x-11,38]], 'rgba(229,199,130,.25)');
          polygon(ctx, [[x,h-28],[x+20,h-28],[x+9,h-38],[x-11,h-38]], 'rgba(229,199,130,.25)');
        }
      } else if (bounty) {
        polygon(ctx, [[72,h*.37],[w-72,h*.37],[w-24,h*.5],[w-72,h*.63],[72,h*.63],[24,h*.5]],
          'rgba(151,171,174,.13)', 'rgba(159,186,197,.14)', 2);
        const cx = w / 2, cy = h / 2;
        polygon(ctx, [[cx-83,cy-40],[cx,cy-75],[cx+83,cy-40],[cx+83,cy+40],[cx,cy+75],[cx-83,cy+40]],
          'rgba(22,45,67,.18)', 'rgba(210,196,149,.25)', 3);
        for (let i = 0; i < 8; i++) {
          const angle = i * Math.PI / 4;
          ctx.strokeStyle = 'rgba(231,216,171,.3)'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(cx + Math.cos(angle) * 24, cy + Math.sin(angle) * 24);
          ctx.lineTo(cx + Math.cos(angle) * 38, cy + Math.sin(angle) * 38); ctx.stroke();
        }
        for (const [x, y] of [[126,100],[w-126,100],[126,h-100],[w-126,h-100]]) {
          ctx.strokeStyle = 'rgba(203,213,209,.18)'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(x-25,y+8); ctx.lineTo(x,y-13); ctx.lineTo(x+27,y+6); ctx.stroke();
          disc(ctx, x-25, y+8, 2.5, '#94a5b1'); disc(ctx, x, y-13, 3, '#b9bda9'); disc(ctx, x+27, y+6, 2.5, '#94a5b1');
        }
      } else if (hotzone) {
        box(ctx, w / 2 - 148, -24, 296, h + 48, 30, 'rgba(158,177,158,.17)');
        ctx.strokeStyle = 'rgba(211,222,189,.16)'; ctx.lineWidth = 3;
        for (const side of [-1, 1]) {
          ctx.beginPath(); ctx.moveTo(w / 2 + side * 156, 0); ctx.lineTo(w / 2 + side * 156, h); ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(207,223,207,.18)'; ctx.lineWidth = 2; ctx.setLineDash([18, 18]);
        ctx.beginPath(); ctx.moveTo(72, h / 2); ctx.lineTo(w - 72, h / 2); ctx.stroke(); ctx.setLineDash([]);
        for (const x of [88, w - 88]) {
          for (let i = 0; i < 3; i++) box(ctx, x - 8, h / 2 - 39 + i * 31, 16, 16, 3, 'rgba(219,211,163,.15)');
        }
      } else if (heist) {
        box(ctx, -20, h / 2 - 112, w + 40, 224, 24, 'rgba(194,186,150,.22)');
        box(ctx, -20, h / 2 - 79, w + 40, 158, 20, 'rgba(205,190,144,.13)');
        ctx.strokeStyle = 'rgba(231,218,171,.23)'; ctx.lineWidth = 2; ctx.setLineDash([19, 19]);
        for (const y of [h / 2 - 124, h / 2 + 124]) {
          ctx.beginPath(); ctx.moveTo(60, y); ctx.lineTo(w - 60, y); ctx.stroke();
        }
        ctx.setLineDash([]);
        for (const x of [w * .14, w * .86]) {
          disc(ctx, x, h / 2, 102, 'rgba(23,48,62,.13)', 'rgba(208,220,199,.2)', 2);
          ctx.save(); ctx.translate(x, h / 2); ctx.rotate(Math.PI / 4);
          box(ctx, -82, -82, 164, 164, 11, null, 'rgba(208,220,199,.15)', 2); ctx.restore();
        }
      } else if (training) {
        box(ctx, 68, 92, w - 136, h - 184, 22, 'rgba(15,39,55,.16)', 'rgba(171,212,209,.2)', 2);
        ctx.strokeStyle = 'rgba(174,219,215,.18)'; ctx.lineWidth = 2; ctx.setLineDash([16, 12]);
        for (let i = 0; i < 3; i++) {
          const y = h * (.25 + i * .25);
          ctx.beginPath(); ctx.moveTo(105, y); ctx.lineTo(w - 105, y); ctx.stroke();
          ctx.font = '800 16px ' + FONT; ctx.textAlign = 'left';
          ctx.fillStyle = 'rgba(207,228,212,.45)'; ctx.fillText('0' + (i + 1), 104, y - 15);
        }
        ctx.setLineDash([]);
        for (let x = 160; x < w - 100; x += 80) {
          ctx.beginPath(); ctx.moveTo(x, h - 111); ctx.lineTo(x, h - 121 - (x % 160 ? 0 : 9)); ctx.stroke();
        }
        box(ctx, w / 2 - 106, 36, 212, 33, 9, 'rgba(16,42,57,.5)', 'rgba(139,207,201,.24)', 1.5);
        ctx.font = '800 16px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#a9dbd4'; ctx.fillText('PRACTICE / 연습장', w / 2, 53);
        for (let side = 0; side < 2; side++) {
          const x = side ? w - 46 : 30;
          for (let i = 0; i < 7; i++) {
            const y = h / 2 - 92 + i * 30;
            polygon(ctx, [[x,y],[x+16,y-10],[x+16,y+2],[x,y+12]], 'rgba(238,201,126,.35)');
          }
        }
      } else if (showdown) {
        ctx.strokeStyle = 'rgba(229,221,174,.16)';
        ctx.lineWidth = 72;
        ctx.beginPath();
        ctx.moveTo(0, h * .65); ctx.bezierCurveTo(w * .3, h * .9, w * .55, h * .2, w, h * .38); ctx.stroke();
        disc(ctx, w / 2, h / 2, 148, 'rgba(87,109,97,.1)', 'rgba(88,107,98,.14)', 5);
        disc(ctx, w / 2, h / 2, 115, null, 'rgba(239,229,180,.2)', 2);
      } else {
        ctx.fillStyle = '#8e9a8a';
        polygon(ctx, [[w * .42, 0], [w * .58, 0], [w * .56, h], [w * .44, h]], '#9da58e');
        polygon(ctx, [[0, h * .39], [w, h * .43], [w, h * .59], [0, h * .64]], '#a9aa8e');
        ctx.strokeStyle = 'rgba(225,222,175,.24)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, h * .41); ctx.lineTo(w, h * .45); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, h * .62); ctx.lineTo(w, h * .57); ctx.stroke();
        disc(ctx, w / 2, h / 2, 116, '#6c8383', 'rgba(24,54,66,.25)', 10);
        disc(ctx, w / 2, h / 2, 91, null, 'rgba(226,217,173,.35)', 2);
      }
      ctx.strokeStyle = showdown ? 'rgba(76,81,65,.05)' : 'rgba(218,241,220,.035)';
      ctx.lineWidth = 1;
      for (let x = 0; x <= w; x += 80) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let y = 0; y <= h; y += 80) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      for (let i = 0; i < 260; i++) {
        const x = randomAt(i, 1) * w, y = randomAt(i, 2) * h;
        ctx.fillStyle = i % 3 ? 'rgba(20,42,43,.10)' : 'rgba(240,241,207,.13)';
        const r = 1 + randomAt(i, 3) * 2;
        box(ctx, x, y, r * 2, r, r / 2, ctx.fillStyle);
      }
      if (!showdown && !training) {
        const spawnXs = [w * .125, w * .875];
        spawnXs.forEach((x, i) => {
          ctx.save(); ctx.translate(x, h / 2); ctx.rotate(i ? Math.PI : 0);
          ctx.globalAlpha = .12;
          for (let n = 0; n < 3; n++) polygon(ctx, [[n * 18 - 27, -22], [n * 18 - 8, 0], [n * 18 - 27, 22], [n * 18 - 19, 0]], TEAM[i]);
          ctx.restore();
        });
      }
      const vignette = ctx.createRadialGradient(w / 2, h / 2, h * .3, w / 2, h / 2, w * .65);
      vignette.addColorStop(0, 'rgba(8,29,41,0)');
      vignette.addColorStop(1, 'rgba(8,29,41,.19)');
      ctx.fillStyle = vignette; ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    _drawArenaTrim(mode, overtime) {
      const ctx = this.ctx, w = this.width, h = this.height;
      box(ctx, 5, 5, w - 10, h - 10, 20, null, '#19303e', 10);
      box(ctx, 11, 11, w - 22, h - 22, 15, null, 'rgba(185,217,202,.22)', 2);
      if (overtime && mode === 'ball') {
        box(ctx, 11, 11, w - 22, h - 22, 15, null, '#dfa961', 3);
        ctx.save(); ctx.globalAlpha = .6 + Math.sin(this._time * 2.5) * .12;
        for (let i = 0; i < 9; i++) {
          const x = w / 2 - 136 + i * 32;
          polygon(ctx, [[x,5],[x+17,5],[x+11,14],[x-6,14]], '#f9d38a');
          polygon(ctx, [[x,h-5],[x+17,h-5],[x+11,h-14],[x-6,h-14]], '#f9d38a');
        }
        ctx.restore();
      }
      [[29,29],[w-29,29],[29,h-29],[w-29,h-29]].forEach(p => {
        disc(ctx, p[0], p[1], 7, '#203e4d', '#6f8991', 2);
        disc(ctx, p[0] - 1, p[1] - 1, 2, '#aec3b5');
      });
      if (mode !== 'showdown' && mode !== 'training') {
        for (let i = 0; i < 4; i++) {
          box(ctx, 20 + i * 21, 7, 13, 4, 2, TEAM[0]);
          box(ctx, w - 33 - i * 21, h - 11, 13, 4, 2, TEAM[1]);
        }
      }
    }

    _captureLabel(zone, index) {
      const letter = String(zone.id || '').match(/[A-Z]$/);
      return String(zone.label || (letter && letter[0]) || String.fromCharCode(65 + index));
    }

    _drawCaptureZone(zone, index) {
      const ctx = this.ctx, r = Math.max(1, number(zone.r, 95));
      const progress = zone.progress || [0, 0], occupants = zone.occupants || [0, 0];
      ctx.save(); ctx.translate(zone.x, zone.y);
      disc(ctx, 0, 0, r + 5, 'rgba(17,41,56,.2)');
      disc(ctx, 0, 0, r, 'rgba(137,177,181,.08)', 'rgba(214,233,213,.52)', 2);
      for (let team = 0; team < 2; team++) {
        const amount = clamp(number(progress[team], 0), 0, 100), complete = amount >= 100;
        const occupied = number(occupants[team], 0) > 0;
        if (occupied) {
          // Each team owns an independent half-wash: simultaneous occupation
          // lights both halves; it never displays a contested/frozen state.
          ctx.beginPath(); ctx.moveTo(0, 0);
          ctx.arc(0, 0, Math.max(1, r - 23), team === 0 ? Math.PI / 2 : -Math.PI / 2,
            team === 0 ? Math.PI * 1.5 : Math.PI / 2); ctx.closePath();
          ctx.fillStyle = team === 0 ? 'rgba(104,231,231,.1)' : 'rgba(255,130,118,.1)'; ctx.fill();
        }
        const ring = Math.max(1, r - 7 - team * 11);
        disc(ctx, 0, 0, ring, null, 'rgba(18,38,53,.5)', 6);
        if (amount > 0) {
          ctx.beginPath(); ctx.arc(0, 0, ring, -Math.PI / 2, -Math.PI / 2 + TAU * amount / 100);
          ctx.strokeStyle = TEAM[team]; ctx.lineWidth = 5; ctx.stroke();
          const tip = -Math.PI / 2 + TAU * amount / 100;
          disc(ctx, Math.cos(tip) * ring, Math.sin(tip) * ring, occupied && !complete ? 3.8 : 2.4,
            complete ? '#e7ffe8' : TEAM[team]);
        }
        const bx = team === 0 ? -31 : 31, by = 29;
        box(ctx, bx - 27, by - 12, 54, 25, 8, '#243e4f', occupied ? TEAM[team] : TEAM_DARK[team], occupied ? 2 : 1.5);
        ctx.font = '800 15px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = TEAM[team]; ctx.fillText((complete ? 100 : Math.floor(amount)) + '%', bx, by + .5);
        disc(ctx, bx, by + 21, 3.5, occupied ? TEAM[team] : '#2b4450', occupied ? '#d5eee4' : '#60777c', 1);
        if (complete) {
          ctx.strokeStyle = '#e4ffdf'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(bx - 4, by - 22); ctx.lineTo(bx - 1, by - 19); ctx.lineTo(bx + 5, by - 25); ctx.stroke();
        }
      }
      ctx.font = '900 31px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.strokeStyle = '#263f50'; ctx.lineWidth = 4;
      ctx.strokeText(this._captureLabel(zone, index), 0, -13);
      ctx.fillStyle = '#dfebd8'; ctx.fillText(this._captureLabel(zone, index), 0, -13);
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2;
        ctx.strokeStyle = 'rgba(218,235,216,.5)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * (r + 2), Math.sin(a) * (r + 2));
        ctx.lineTo(Math.cos(a) * (r + 9), Math.sin(a) * (r + 9)); ctx.stroke();
      }
      ctx.restore();
    }

    _drawSafeShadow(safe) {
      const ctx = this.ctx, r = number(safe.r, 42);
      ctx.fillStyle = 'rgba(14,29,39,.32)';
      ctx.beginPath(); ctx.ellipse(safe.x + 6, safe.y + r * .48, r * 1.13, r * .82, 0, 0, TAU); ctx.fill();
    }

    _drawSafe(safe, elapsed) {
      const ctx = this.ctx, team = safe.team === 0 ? 0 : 1, r = number(safe.r, 42);
      const ratio = clamp(number(safe.hp, 0) / Math.max(1, number(safe.maxHp, 24000)), 0, 1);
      const shield = number(safe.shieldTime, 0) > 0;
      ctx.save(); ctx.translate(safe.x, safe.y); ctx.scale(r / 42, r / 42);
      disc(ctx, 0, 5, 44, '#2c4352', TEAM_DARK[team], 3);
      disc(ctx, 0, 5, 36, null, 'rgba(182,205,194,.2)', 2);
      if (ratio <= 0) {
        polygon(ctx, [[-34,-16],[-18,-29],[-7,-11],[11,-26],[35,-9],[28,26],[-26,29]], '#4b5c64', INK, 3);
        polygon(ctx, [[-23,-21],[-15,-34],[12,-40],[29,-26],[21,-11]], '#7e9396', INK, 3);
        box(ctx, -17, -9, 34, 26, 5, '#172d3c', '#6c7d80', 3);
        for (let i = 0; i < 3; i++) box(ctx, -30 + i * 23, 22 + (i % 2) * 7, 13, 9, 2, i === 1 ? '#d1b378' : TEAM_DARK[team], INK, 1.5);
      } else {
        box(ctx, -35, -29, 70, 64, 10, TEAM_DARK[team], INK, 4);
        box(ctx, -35, -48, 70, 65, 10, team === 0 ? '#96bec4' : '#c6a4a0', INK, 4);
        box(ctx, -30, -43, 60, 55, 7, null, team === 0 ? '#d3e7d8' : '#efd7bc', 2);
        box(ctx, -25, -37, 50, 43, 7, team === 0 ? '#416779' : '#805863', '#29414d', 3);
        disc(ctx, 0, -16, 16, '#c9d2bc', '#273f4e', 3);
        disc(ctx, 0, -16, 10, TEAM_DARK[team], '#eff0cd', 2);
        ctx.strokeStyle = '#e1ddbb'; ctx.lineWidth = 3.5;
        for (let i = 0; i < 3; i++) {
          const a = i * TAU / 3 + .3;
          ctx.beginPath(); ctx.moveTo(Math.cos(a) * 4, -16 + Math.sin(a) * 4);
          ctx.lineTo(Math.cos(a) * 12, -16 + Math.sin(a) * 12); ctx.stroke();
        }
        disc(ctx, 0, -16, 4, '#f6df9b', '#4a5d64', 1.5);
        box(ctx, -27, 20, 54, 7, 3, TEAM[team]);
        for (const p of [[-26,-37],[26,-37],[-26,6],[26,6]]) disc(ctx, p[0], p[1], 2.7, '#e6cf92', '#657678', 1);
        if (ratio <= .5) {
          ctx.strokeStyle = '#384e59'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(-34,-6); ctx.lineTo(-22,0); ctx.lineTo(-28,11); ctx.lineTo(-17,16); ctx.stroke();
        }
        const hitAge = elapsed - number(safe.lastHitTime, -100);
        if (hitAge >= 0 && hitAge < .15) {
          ctx.save(); ctx.globalAlpha = (1 - hitAge / .15) * (this._reducedEffects ? .12 : .3);
          box(ctx, -35, -48, 70, 83, 10, '#fff2d5'); ctx.restore();
        }
      }
      if (shield && ratio > 0) {
        const pulse = .5 + Math.sin(this._time * 5) * .5;
        disc(ctx, 0, -3, 53, 'rgba(117,193,255,.08)', 'rgba(148,219,255,.45)', 2);
        for (let i = 0; i < 6; i++) {
          const a = i * TAU / 6;
          ctx.beginPath(); ctx.arc(0, -3, 55 + pulse, a + .1, a + .76);
          ctx.strokeStyle = '#addfff'; ctx.lineWidth = 4; ctx.stroke();
        }
        const left = clamp(safe.shieldTime / number(safe.shieldDuration, 1.8), 0, 1);
        ctx.beginPath(); ctx.arc(0, -3, 60, -Math.PI / 2, -Math.PI / 2 + TAU * left);
        ctx.strokeStyle = '#d0eeff'; ctx.lineWidth = 2; ctx.stroke();
      }
      ctx.restore();
    }

    _drawSafeUI(safe) {
      const ctx = this.ctx, r = number(safe.r, 42), team = safe.team === 0 ? 0 : 1;
      const ratio = clamp(number(safe.hp, 0) / Math.max(1, number(safe.maxHp, 24000)), 0, 1);
      const shield = number(safe.shieldTime, 0) > 0;
      const consumed = clamp(Math.floor(number(safe.shieldsTriggered, 0)), 0, 3);
      ctx.save(); ctx.translate(safe.x, safe.y);
      const barY = -r - 29;
      ctx.font = '800 17px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.lineWidth = 3; ctx.strokeStyle = INK;
      const label = ratio <= 0 ? '파괴됨' : ratio < .01 ? '<1%' : Math.floor(ratio * 100) + '%';
      ctx.strokeText(label, 0, barY - 5); ctx.fillStyle = TEAM[team]; ctx.fillText(label, 0, barY - 5);
      box(ctx, -51, barY - 1, 102, 10, 4, '#172f40', '#102535', 1.5);
      if (ratio > 0) {
        ctx.save(); roundRect(ctx, -50, barY, 100, 8, 3); ctx.clip();
        ctx.fillStyle = shield ? '#a3d7f4' : TEAM[team]; ctx.fillRect(-50, barY, 100 * ratio, 8);
        ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(-50, barY, 100 * ratio, 2);
        ctx.restore();
      }
      ctx.strokeStyle = '#244451'; ctx.lineWidth = 1.5;
      for (let i = 1; i < 4; i++) {
        ctx.beginPath(); ctx.moveTo(-50 + i * 25, barY + 1); ctx.lineTo(-50 + i * 25, barY + 7); ctx.stroke();
      }
      for (let i = 0; i < 3; i++) {
        const x = (i - 1) * 16, y = barY + 19;
        const active = shield && i === consumed - 1;
        polygon(ctx, [[x-4,y-5],[x,y-7],[x+4,y-5],[x+3,y+1],[x,y+4],[x-3,y+1]],
          active ? '#b5e5ff' : i < consumed ? '#455f6b' : '#e1c17e', '#213b4d', 1.5);
      }
      if (shield && ratio > 0) {
        box(ctx, -31, r + 17, 62, 23, 8, '#234760', '#9ed8f1', 1.5);
        this._drawStatusBadge(-17, r + 28, 'shield');
        ctx.font = '800 13px ' + FONT; ctx.textBaseline = 'middle'; ctx.fillStyle = '#dbf2ff';
        ctx.fillText(Math.max(.1, safe.shieldTime).toFixed(1) + 's', 7, r + 29);
      }
      ctx.restore();
    }

    _drawMinimap(state, player) {
      const ctx = this.ctx, localTeam = player ? player.team : 0;
      const wanted = this.cssHeight < 240 ? 78 : this.cssWidth < 600 ? 94 : 136;
      const mapW = Math.min(wanted, Math.max(48, this.cssWidth - 32));
      const mapH = mapW * this.height / this.width, pad = 6;
      const x = 12, y = Math.max(8, Math.min(this.cssHeight < 300 ? 76 : 90, this.cssHeight - mapH - 20));
      const scale = mapW / this.width, left = x + pad, top = y + pad;
      ctx.save();
      box(ctx, x + 1, y + 3, mapW + pad * 2, mapH + pad * 2, 10, 'rgba(7,20,31,.25)');
      box(ctx, x, y, mapW + pad * 2, mapH + pad * 2, 10, '#142c3d', '#5b7b87', 1);
      ctx.save(); roundRect(ctx, left, top, mapW, mapH, 5); ctx.clip();
      ctx.fillStyle = '#38545f'; ctx.fillRect(left, top, mapW, mapH);
      for (const bush of state.bushes || []) {
        ctx.fillStyle = '#4b806a'; ctx.fillRect(left + bush.x * scale, top + bush.y * scale, bush.w * scale, bush.h * scale);
      }
      for (const wall of state.walls || []) if (wall.hp === undefined || wall.hp > 0) {
        ctx.fillStyle = wall.kind === 'stone' ? '#9badad' : '#c9ae75';
        ctx.fillRect(left + wall.x * scale, top + wall.y * scale, Math.max(1, wall.w * scale), Math.max(1, wall.h * scale));
      }
      if (state.mode === 'gem') {
        const mine = state.gemMine || { x: this.width / 2, y: this.height / 2 };
        const px = left + mine.x * scale, py = top + mine.y * scale;
        polygon(ctx, [[px,py-4],[px+3.5,py],[px,py+4],[px-3.5,py]], '#cda3f2', '#513d71', 1);
      }
      const blueStar = this._groundBlueStar(state);
      if (blueStar) {
        star(ctx, left + blueStar.x * scale, top + blueStar.y * scale, 4.5, '#8acfff', '#173f67', 1);
      }
      for (let i = 0; i < (state.captureZones || []).length; i++) {
        const zone = state.captureZones[i], zx = left + zone.x * scale, zy = top + zone.y * scale;
        const radius = Math.max(4, number(zone.r, 95) * scale), progress = zone.progress || [0,0];
        disc(ctx, zx, zy, radius, '#334e5b', '#adc3b4', 1);
        for (let team = 0; team < 2; team++) if (progress[team] > 0) {
          ctx.beginPath(); ctx.arc(zx, zy, Math.max(2, radius - 1 - team * 2), -Math.PI / 2,
            -Math.PI / 2 + TAU * clamp(progress[team], 0, 100) / 100);
          ctx.strokeStyle = TEAM[team]; ctx.lineWidth = 1.5; ctx.stroke();
        }
        ctx.font = '800 8px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#e1ecdc'; ctx.fillText(this._captureLabel(zone, i), zx, zy + .5);
      }
      for (const safe of state.safes || []) {
        const sx = left + safe.x * scale, sy = top + safe.y * scale;
        box(ctx, sx - 3, sy - 3, 6, 6, 1, safe.hp > 0 ? TEAM[safe.team === 0 ? 0 : 1] : '#6a7e82', '#18313f', 1);
        if (safe.shieldTime > 0) disc(ctx, sx, sy, 5, null, '#b7e1fb', 1);
      }
      for (const goal of state.goalBounds || []) if (state.mode === 'ball') {
        ctx.fillStyle = TEAM[goal.team === 0 ? 0 : 1];
        ctx.fillRect(left + goal.x * scale, top + goal.y * scale, Math.max(2, goal.w * scale), goal.h * scale);
      }
      if (state.zone) {
        disc(ctx, left + state.zone.x * scale, top + state.zone.y * scale,
          Math.max(.1, state.zone.r * scale), null, '#cc9edd', 1.5);
      }
      const camera = this._camera;
      box(ctx, left + camera.x * scale, top + camera.y * scale, camera.w * scale, camera.h * scale,
        1, 'rgba(225,249,231,.035)', 'rgba(232,255,241,.64)', 1);
      // No enemy, projectile, field, generic pickup or held-object coordinates
      // enter the minimap. A blue star is public only while actually on ground.
      for (const actor of state.actors || []) {
        const own = actor.isPlayer || actor.id === 0;
        if (!own && (actor.team !== localTeam || actor.alive === false)) continue;
        const ax = left + actor.x * scale, ay = top + actor.y * scale;
        const focused = this._camera.spectating && actor.id === this._camera.focusId;
        if (own && actor.alive === false) {
          disc(ctx, ax, ay, 2.5, null, '#8dacae', 1);
        } else if (own || focused) {
          disc(ctx, ax, ay, 4.7, '#19394a', '#efffe8', 1.4);
          ctx.save(); ctx.translate(ax, ay); ctx.rotate(number(actor.angle, 0));
          polygon(ctx, [[4,0],[-2.7,-2.7],[-1.4,0],[-2.7,2.7]], focused ? '#c2f9ff' : '#f5f9c5'); ctx.restore();
        } else disc(ctx, ax, ay, 2.5, '#8ae9e5', '#173d4b', 1);
      }
      ctx.restore(); ctx.restore();
    }

    _groundBlueStar(state) {
      if (state.mode !== 'bounty' || !state.bounty) return null;
      const blueStar = state.bounty.blueStar;
      // Held star coordinates can be stale or belong to a hidden/dead carrier.
      // Never use them to draw a public ground marker.
      return blueStar && blueStar.onGround === true && blueStar.carrierId == null ? blueStar : null;
    }

    _drawGroundBlueStar(blueStar) {
      const ctx = this.ctx, x = blueStar.x, y = blueStar.y;
      const r = clamp(number(blueStar.r, 12), 7, 24), bob = Math.sin(this._time * 2.8) * 2;
      ctx.save();
      const glow = ctx.createRadialGradient(x, y, 2, x, y, r * 3.1);
      glow.addColorStop(0, 'rgba(111,193,255,.24)'); glow.addColorStop(1, 'rgba(111,193,255,0)');
      disc(ctx, x, y, r * 3.1, glow);
      ctx.fillStyle = 'rgba(12,28,44,.3)'; ctx.beginPath(); ctx.ellipse(x + 1, y + r + 5, r * .95, r * .36, 0, 0, TAU); ctx.fill();
      disc(ctx, x, y + 4, r + 10, null, 'rgba(160,218,255,.3)', 1.5);
      ctx.translate(x, y + bob - 2); ctx.rotate(Math.sin(this._time * 1.1) * .07);
      star(ctx, 0, 0, r * 1.2, '#69b8f6', '#1c4365', 2.5);
      star(ctx, 0, -1, r * .63, '#d1f0ff');
      polygon(ctx, [[0,-r*1.2],[r*.18,-r*.24],[0,-r*.05],[-r*.23,-r*.26]], '#ecfbff');
      if (!this._reducedEffects) {
        const a = this._time * .9;
        disc(ctx, Math.cos(a) * (r + 16), Math.sin(a) * (r + 10), 2.2, '#c9edff');
        disc(ctx, -Math.cos(a) * (r + 11), -Math.sin(a) * (r + 16), 1.5, '#a5d8ff');
      }
      ctx.restore();
    }

    _drawSpectatorFocus(actor) {
      const ctx = this.ctx, r = number(actor.r, 22) + 10;
      ctx.save(); ctx.translate(actor.x, actor.y + 2);
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + i * Math.PI / 2;
        ctx.beginPath(); ctx.arc(0, 0, r, a - .16, a + .16);
        ctx.strokeStyle = '#d9f9ef'; ctx.lineWidth = 2.6; ctx.stroke();
      }
      polygon(ctx, [[-5,r+10],[0,r+5],[5,r+10]], '#a9eeef', '#315d6a', 1.5);
      ctx.restore();
    }

    _drawBountyBadge(actor, blueStar, top) {
      const ctx = this.ctx;
      const value = Math.max(0, Math.floor(number(actor.bountyValue, 2)));
      const carries = blueStar && blueStar.onGround === false && blueStar.carrierId === actor.id;
      const x = actor.x - (carries ? 10 : 0), y = top - 32;
      ctx.save();
      box(ctx, x - 18, y - 10, 36, 20, 7, '#3b3945', value >= 6 ? '#eac778' : '#a89970', 1.6);
      ctx.font = '800 13px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = value >= 6 ? '#ffe19b' : '#edcf8a'; ctx.fillText('★' + value, x, y + .5);
      if (carries) {
        const bx = x + 30;
        disc(ctx, bx, y, 10, '#234665', '#9ddcff', 1.5);
        star(ctx, bx, y, 6.7, '#a9e0ff', '#386a91', 1);
        star(ctx, bx, y - .4, 3.1, '#eefbff');
      }
      ctx.restore();
    }

    _drawGravity(field, localTeam) {
      const ctx = this.ctx, r = Math.max(1, number(field.r, 105));
      const remaining = clamp(number(field.life, 4) / Math.max(.01, number(field.maxLife, 4)), 0, 1);
      const enemy = field.team !== localTeam;
      const rim = enemy ? '#ffadaf' : '#b2b9ff';
      ctx.save(); ctx.translate(field.x, field.y);
      ctx.globalAlpha = Math.min(1, number(field.life, 4) / .5);
      const glow = ctx.createRadialGradient(0, 0, 3, 0, 0, r);
      glow.addColorStop(0, 'rgba(175,126,249,.25)');
      glow.addColorStop(.65, 'rgba(134,91,193,.15)');
      glow.addColorStop(1, 'rgba(119,79,169,.23)');
      disc(ctx, 0, 0, r, glow, rim, 2);
      disc(ctx, 0, 0, Math.max(1, r - 5), null, 'rgba(227,195,255,.18)', 1);
      ctx.save(); ctx.rotate(this._time * .22);
      ctx.setLineDash(enemy ? [8, 7] : [16, 7]);
      disc(ctx, 0, 0, r * .72, null, 'rgba(210,176,255,.55)', 1.6);
      ctx.setLineDash([]);
      for (let i = 0; i < 6; i++) {
        const angle = i * TAU / 6;
        ctx.save(); ctx.rotate(angle);
        polygon(ctx, [[r*.45,-4],[r*.31,0],[r*.45,4],[r*.41,0]], 'rgba(225,205,255,.65)');
        const travel = (this._time * .28 + i * .17) % 1;
        if (!this._reducedEffects) disc(ctx, r * (.83 - travel * .6), 0, 1.5 + (1 - travel), '#debbff');
        ctx.restore();
      }
      ctx.restore();
      ctx.beginPath(); ctx.arc(0, 0, r + 4, -Math.PI / 2, -Math.PI / 2 + TAU * remaining);
      ctx.strokeStyle = enemy ? '#ffb7ad' : '#c9d0ff'; ctx.lineWidth = 2.5; ctx.stroke();
      disc(ctx, 0, 0, 16, '#4a3b6c', '#b698df', 2);
      ctx.save(); ctx.rotate(-this._time * .45);
      for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.arc(0, 0, 10, i * TAU / 3, i * TAU / 3 + 1.25);
        ctx.strokeStyle = '#e1c4ff'; ctx.lineWidth = 2.5; ctx.stroke();
      }
      ctx.restore();
      disc(ctx, 0, 0, 3, '#f3dcff');
      ctx.restore();
    }

    _drawTargetPad(actor) {
      const ctx = this.ctx, r = number(actor.r, 22);
      const hit = number(actor.hitFlash, 0) > 0;
      ctx.save(); ctx.translate(actor.x, actor.y);
      disc(ctx, 0, 4, r + 15, 'rgba(17,37,52,.28)', hit ? '#ffe3a2' : '#98aaa8', 2);
      ctx.setLineDash([6, 8]);
      disc(ctx, 0, 4, r + 21, null, hit ? 'rgba(255,227,162,.55)' : 'rgba(169,200,187,.32)', 1.5);
      ctx.setLineDash([]);
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2;
        ctx.strokeStyle = '#b5c3b0'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * (r + 10), 4 + Math.sin(a) * (r + 10));
        ctx.lineTo(Math.cos(a) * (r + 17), 4 + Math.sin(a) * (r + 17)); ctx.stroke();
      }
      ctx.restore();
    }

    _drawMine(state) {
      const ctx = this.ctx;
      const mine = state.gemMine || { x: this.width / 2, y: this.height / 2 };
      const x = mine.x, y = mine.y, pulse = Math.sin(this._time * 2.2) * .5 + .5;
      const glow = ctx.createRadialGradient(x, y, 8, x, y, 86);
      glow.addColorStop(0, 'rgba(187,134,255,.28)'); glow.addColorStop(1, 'rgba(168,91,255,0)');
      ctx.fillStyle = glow; ctx.fillRect(x - 86, y - 86, 172, 172);
      ctx.save(); ctx.translate(x, y);
      ctx.fillStyle = 'rgba(14,30,45,.25)'; ctx.beginPath(); ctx.ellipse(3, 14, 46, 30, 0, 0, TAU); ctx.fill();
      polygon(ctx, [[-42,-15],[-22,-35],[23,-35],[43,-15],[43,17],[21,35],[-23,35],[-42,17]], '#263c51', INK, 4);
      polygon(ctx, [[-35,-12],[-19,-28],[18,-28],[35,-12],[35,10],[18,26],[-19,26],[-35,10]], '#5d6c87', '#9fa4b2', 2);
      disc(ctx, 0, -1, 25, '#19223a', '#ae93df', 3);
      disc(ctx, 0, -1, 19, '#41345e');
      ctx.save(); ctx.rotate(this._time * .2); ctx.setLineDash([9, 13]);
      disc(ctx, 0, -1, 48, null, 'rgba(186,152,239,.5)', 2); ctx.restore();
      this._crystal(-11, -7 - pulse * 3, 12, '#bb8aff');
      this._crystal(10, -17 - pulse * 4, 17, '#ddadff');
      this._crystal(16, 10 - pulse * 2, 9, '#a97bf0');
      for (let i = 0; i < (this._reducedEffects ? 0 : 4); i++) {
        const phase = (this._time * .25 + i * .25) % 1;
        ctx.globalAlpha = Math.sin(phase * Math.PI) * .65;
        disc(ctx, Math.sin(i * 8.3) * 26, -20 - phase * 42, 2, '#ead0ff');
      }
      ctx.restore();
    }

    _crystal(x, y, r, color) {
      const ctx = this.ctx;
      polygon(ctx, [[x,y-r],[x+r*.72,y-r*.28],[x+r*.55,y+r*.55],[x,y+r],[x-r*.64,y+r*.35],[x-r*.7,y-r*.28]], color, '#533c83', 2);
      polygon(ctx, [[x,y-r],[x+r*.72,y-r*.28],[x,y+r],[x-r*.16,y-r*.23]], 'rgba(255,255,255,.34)');
      polygon(ctx, [[x-r*.7,y-r*.28],[x-r*.16,y-r*.23],[x,y+r],[x-r*.64,y+r*.35]], 'rgba(81,42,155,.28)');
    }

    _drawGoals(state) {
      const ctx = this.ctx;
      const bounds = state.goalBounds || [
        { team: 0, x: 0, y: this.height / 2 - 122, w: 28, h: 244 },
        { team: 1, x: this.width - 28, y: this.height / 2 - 122, w: 28, h: 244 }
      ];
      for (const g of bounds) {
        const right = g.x > this.width / 2;
        const x = right ? g.x : g.x - 12;
        const netWidth = g.w + 12;
        const color = TEAM[g.team === 0 ? 0 : 1];
        box(ctx, x, g.y - 9, netWidth, g.h + 18, 10, '#1b3948', '#172c3b', 5);
        ctx.save();
        roundRect(ctx, x + 3, g.y - 3, netWidth - 6, g.h + 6, 6); ctx.clip();
        ctx.fillStyle = g.team === 0 ? '#285a68' : '#69474d'; ctx.fillRect(x, g.y - 9, netWidth, g.h + 18);
        ctx.strokeStyle = 'rgba(235,245,229,.18)'; ctx.lineWidth = 1.5;
        for (let yy = g.y - 50; yy < g.y + g.h + 50; yy += 17) {
          ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + netWidth, yy + netWidth); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + netWidth, yy - netWidth); ctx.stroke();
        }
        ctx.restore();
        const front = right ? g.x : g.x + g.w;
        ctx.strokeStyle = color; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(front, g.y); ctx.lineTo(front, g.y + g.h); ctx.stroke();
        disc(ctx, front, g.y, 9, '#f2e7c9', INK, 3);
        disc(ctx, front, g.y + g.h, 9, '#f2e7c9', INK, 3);
        ctx.save(); ctx.globalAlpha = .15;
        box(ctx, right ? front - 28 : front, g.y + 4, 28, g.h - 8, 3, color); ctx.restore();
      }
    }

    _drawBush(bush, foreground) {
      const ctx = this.ctx, x = bush.x, y = bush.y, w = bush.w, h = bush.h;
      if (!foreground) {
        box(ctx, x + 3, y + 7, w, h, 15, 'rgba(13,39,39,.22)');
        box(ctx, x, y + 1, w, h - 1, 12, '#286355', '#1c4c4a', 3);
        box(ctx, x + 3, y + 2, w - 6, h - 7, 10, '#3e8c64');
      }
      ctx.save();
      if (foreground) ctx.globalAlpha = .36;
      const rowStart = foreground ? Math.max(1, Math.floor(h / 21) - 1) : 0;
      const rows = Math.max(1, Math.ceil(h / 21));
      for (let row = rowStart; row < rows; row++) {
        for (let col = 0; col < Math.ceil(w / 22); col++) {
          const sx = x + col * 22 + 11 + Math.sin(row * 7 + col) * 3;
          const sy = Math.min(y + h - 3, y + row * 21 + 20);
          const n = randomAt(x + col * 3, y + row * 9);
          const sway = Math.sin(this._time * 1.5 + sx * .035 + sy * .023) * 1.4;
          const color = n > .64 ? '#74b76d' : n > .28 ? '#57a66b' : '#40946a';
          polygon(ctx, [[sx-10,sy],[sx-10+sway,sy-14],[sx-3,sy-9],[sx+1+sway,sy-23-n*4],[sx+5,sy-9],[sx+12+sway,sy-17],[sx+11,sy]], color);
          if (!foreground && n > .7) {
            ctx.strokeStyle = 'rgba(202,224,120,.35)'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(sx, sy - 3); ctx.lineTo(sx + 1 + sway, sy - 16); ctx.stroke();
          }
        }
      }
      ctx.restore();
    }

    _drawWallShadow(wall) {
      const ctx = this.ctx;
      box(ctx, wall.x + 7, wall.y + 10, wall.w + 3, wall.h + 3, 9, 'rgba(15,33,40,.27)');
    }

    _drawWall(wall) {
      const ctx = this.ctx, x = wall.x, y = wall.y, w = wall.w, h = wall.h;
      const stone = wall.kind === 'stone';
      const top = stone ? '#90a7ac' : '#e9c478';
      const body = stone ? '#5b7887' : '#b68045';
      box(ctx, x, y, w, h, 7, body, stone ? '#354f64' : '#72573f', 3);
      box(ctx, x, y - 12, w, h, 7, top, stone ? '#3b596c' : '#806245', 3);
      box(ctx, x + 4, y - 8, w - 8, Math.max(3, h - 9), 4, null, stone ? '#b9c8c6' : '#f8dfa0', 2);
      ctx.save(); roundRect(ctx, x + 2, y - 10, w - 4, h - 4, 5); ctx.clip();
      const cols = Math.max(1, Math.round(w / 54)), rows = Math.max(1, Math.round(h / 44));
      const cellW = w / cols, cellH = h / rows;
      ctx.strokeStyle = stone ? 'rgba(53,81,98,.35)' : 'rgba(134,95,47,.35)'; ctx.lineWidth = 2;
      for (let row = 0; row < rows; row++) {
        const yy = y - 12 + row * cellH;
        if (row > 0) { ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); ctx.stroke(); }
        for (let col = 1; col < cols + 1; col++) {
          const xx = x + col * cellW - (row % 2 ? cellW * .5 : 0);
          ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx, yy + cellH); ctx.stroke();
        }
      }
      if (!stone) {
        for (let i = 0; i < Math.min(5, cols * rows); i++) {
          const xx = x + 13 + randomAt(x + i, y) * Math.max(1, w - 26);
          const yy = y - 2 + randomAt(y, x + i) * Math.max(1, h - 22);
          ctx.strokeStyle = 'rgba(255,239,184,.5)'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(Math.min(x + w - 8, xx + 13), yy); ctx.stroke();
        }
      }
      if (number(wall.hp, 1) < number(wall.maxHp, 1) * .65) {
        ctx.strokeStyle = stone ? '#4d6876' : '#926a40'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x + w * .47, y - 10); ctx.lineTo(x + w * .56, y + h * .23);
        ctx.lineTo(x + w * .39, y + h * .38); ctx.lineTo(x + w * .52, y + h * .63); ctx.stroke();
      }
      ctx.restore();
      ctx.strokeStyle = stone ? '#455e72' : '#90603a'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x + 4, y + h - 7); ctx.lineTo(x + w - 4, y + h - 7); ctx.stroke();
    }

    _drawPickup(pickup) {
      const ctx = this.ctx, x = pickup.x, y = pickup.y;
      const r = clamp(number(pickup.r, 10), 7, 17);
      const bob = Math.sin(this._time * 3 + number(pickup.id, x) * .7) * 2;
      ctx.save();
      ctx.fillStyle = 'rgba(13,29,43,.24)'; ctx.beginPath(); ctx.ellipse(x + 1, y + r + 4, r, r * .43, 0, 0, TAU); ctx.fill();
      ctx.translate(x, y + bob);
      if (pickup.type === 'power') {
        disc(ctx, 0, 0, r + 6, 'rgba(204,244,94,.11)');
        box(ctx, -r, -r, r * 2, r * 2, 4, '#d3ef80', '#4c7852', 2);
        box(ctx, -r + 3, -r + 3, r * 2 - 6, r * 2 - 6, 2, '#8bc364');
        polygon(ctx, [[1,-r+3],[-5,1],[0,1],[-2,r-3],[6,-2],[1,-2]], '#f6ffd0');
      } else {
        disc(ctx, 0, 0, r + 7, 'rgba(198,135,255,.12)');
        this._crystal(0, 0, r, '#bd84ed');
      }
      ctx.restore();
    }

    _traceAim(player, angle, range, radius, walls, ball, safes = []) {
      const dx = Math.cos(angle), dy = Math.sin(angle);
      const margin = ball ? radius + 5 : 0;
      let distance = Math.max(0, range), blocked = false, wallId = null, safeHit = null;
      // Use the engine's expanded rectangle convention. Hidden actors never enter this query.
      if (dx > 1e-9) distance = Math.min(distance, (this.width - margin - player.x) / dx);
      if (dx < -1e-9) distance = Math.min(distance, (margin - player.x) / dx);
      if (dy > 1e-9) distance = Math.min(distance, (this.height - margin - player.y) / dy);
      if (dy < -1e-9) distance = Math.min(distance, (margin - player.y) / dy);
      distance = Math.max(0, distance);
      const x2 = player.x + dx * distance, y2 = player.y + dy * distance;
      let fraction = 1;
      for (const wall of walls) {
        if (wall.hp !== undefined && wall.hp <= 0) continue;
        const hit = segmentRect(player.x, player.y, x2, y2, wall, radius);
        if (hit !== null && hit <= fraction) {
          fraction = hit; blocked = true; wallId = wall.id === undefined ? null : wall.id;
        }
      }
      for (const safe of safes) {
        if (safe.hp <= 0 || safe.team === player.team) continue;
        const hit = segmentCircle(player.x, player.y, x2, y2, safe, radius);
        if (hit !== null && (hit < fraction || (!blocked && hit === fraction))) {
          fraction = hit; blocked = true; wallId = null; safeHit = safe;
        }
      }
      distance *= fraction;
      return { x: player.x + dx * distance, y: player.y + dy * distance, angle, distance, blocked, wallId, ball, safe: safeHit };
    }

    _drawAim(player, options, state, walls) {
      const ctx = this.ctx;
      const heroes = global.BrawlCore && global.BrawlCore.HEROES;
      const definition = heroes && heroes[player.hero];
      const ball = !!(state.ball && state.ball.carrierId === player.id);
      const range = ball ? Math.hypot(this.width, this.height) * 2
        : number(player.range, definition ? number(definition.range, 340) : 340);
      const radius = ball ? number(state.ball.r, 11)
        : number(player.projectileRadius, definition ? number(definition.projectileRadius, player.hero === 'blaster' ? 10 : 5) : player.hero === 'blaster' ? 10 : 5);
      const ax = number(options.aimX, player.x + Math.cos(number(player.angle, 0)) * range);
      const ay = number(options.aimY, player.y + Math.sin(number(player.angle, 0)) * range);
      const angle = Math.hypot(ax - player.x, ay - player.y) < .001 ? number(player.angle, 0) : Math.atan2(ay - player.y, ax - player.x);
      const targets = ball ? [] : state.safes || [];
      const trace = this._traceAim(player, angle, range, radius, walls, ball, targets);
      ctx.save();
      if (player.hero === 'tank' && !ball) {
        for (const spread of [-.26, -.13, .13, .26]) {
          const ray = this._traceAim(player, angle + spread, range, radius, walls, false, targets);
          const start = Math.min(number(player.r, 22) + 10, ray.distance);
          ctx.strokeStyle = ray.blocked ? 'rgba(255,205,151,.25)' : 'rgba(226,255,240,.22)'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(player.x + Math.cos(ray.angle) * start, player.y + Math.sin(ray.angle) * start);
          ctx.lineTo(ray.x, ray.y); ctx.stroke();
          disc(ctx, ray.x, ray.y, 2.5, ray.blocked ? '#e5b58d' : '#c1e4d3');
        }
      }
      const start = Math.min(number(player.r, 22) + 10, trace.distance);
      ctx.strokeStyle = ball || trace.safe ? 'rgba(255,225,149,.76)' : trace.blocked ? 'rgba(255,209,163,.68)' : 'rgba(227,255,241,.6)';
      ctx.lineWidth = 2;
      ctx.setLineDash(ball ? [10, 8] : [5, 9]); ctx.lineDashOffset = -this._time * 15;
      ctx.beginPath(); ctx.moveTo(player.x + Math.cos(angle) * start, player.y + Math.sin(angle) * start);
      ctx.lineTo(trace.x, trace.y); ctx.stroke();
      ctx.restore();
      return trace;
    }

    _drawAimEndpoint(trace) {
      const ctx = this.ctx, x = trace.x, y = trace.y;
      ctx.save();
      const color = trace.safe && trace.safe.shieldTime > 0 ? '#b8e2ff' : trace.ball || trace.safe ? '#ffe2a0' : trace.blocked ? '#ffd0a0' : '#e5fff0';
      disc(ctx, x, y, trace.blocked ? 8 : 9, 'rgba(22,43,53,.38)', color, 1.8);
      ctx.strokeStyle = color; ctx.lineWidth = 2;
      if (trace.safe) {
        if (trace.safe.shieldTime > 0) {
          polygon(ctx, [[x-3,y-3],[x,y-5],[x+3,y-3],[x+2,y+2],[x,y+4],[x-2,y+2]], color);
        } else polygon(ctx, [[x,y-4],[x+4,y],[x,y+4],[x-4,y]], color);
      } else if (trace.blocked && !trace.ball) {
        ctx.beginPath(); ctx.moveTo(x - 3, y - 3); ctx.lineTo(x + 3, y + 3);
        ctx.moveTo(x + 3, y - 3); ctx.lineTo(x - 3, y + 3); ctx.stroke();
      } else if (trace.ball) {
        ctx.translate(x, y); ctx.rotate(trace.angle);
        ctx.beginPath(); ctx.moveTo(-3, -4); ctx.lineTo(3, 0); ctx.lineTo(-3, 4); ctx.stroke();
      } else {
        disc(ctx, x, y, 2, color);
        for (let i = 0; i < 4; i++) {
          const a = i * Math.PI / 2;
          ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 12, y + Math.sin(a) * 12);
          ctx.lineTo(x + Math.cos(a) * 16, y + Math.sin(a) * 16); ctx.stroke();
        }
      }
      ctx.restore();
    }

    _drawActorShadow(actor) {
      const ctx = this.ctx, r = number(actor.r, 22);
      ctx.fillStyle = 'rgba(12,27,39,.3)';
      ctx.beginPath(); ctx.ellipse(actor.x + 3, actor.y + r * .48, r * 1.07, r * .68, 0, 0, TAU); ctx.fill();
    }

    _drawActor(actor, localTeam) {
      const ctx = this.ctx, r = number(actor.r, 22), ally = actor.team === localTeam;
      const color = ally ? TEAM[0] : TEAM[1], dark = ally ? TEAM_DARK[0] : TEAM_DARK[1];
      const player = actor.isPlayer || actor.id === 0;
      const dummy = actor.isDummy || actor.isTrainingDummy;
      ctx.save(); ctx.translate(actor.x, actor.y);
      const charge = clamp(number(actor.superCharge, 0), 0, 1);
      disc(ctx, 0, 4, r + 4, 'rgba(13,30,40,.18)', dark, player ? 3 : 2);
      if (charge > .015 && !dummy) {
        ctx.beginPath(); ctx.arc(0, 4, r + 6, -Math.PI / 2, -Math.PI / 2 + TAU * charge);
        ctx.strokeStyle = charge >= .999 ? '#ffdc74' : 'rgba(255,214,125,.7)'; ctx.lineWidth = charge >= .999 ? 3.5 : 2.5; ctx.stroke();
        if (charge >= .999) disc(ctx, 0, 4, r + 10 + Math.sin(this._time * 5) * 1.5, null, 'rgba(255,220,116,.23)', 1.5);
      }
      if (player) {
        ctx.save(); ctx.setLineDash([15, 8]);
        disc(ctx, 0, 4, r + 2, null, '#d3fff4', 2); ctx.restore();
      }
      if (!dummy) ctx.rotate(number(actor.angle, 0));
      ctx.scale(r / 22, r / 22);
      if (dummy) this._dummy(color);
      else if (actor.hero === 'tank') this._tank(color, dark);
      else if (actor.hero === 'blaster') this._blaster(color, dark);
      else this._ranger(color, dark);
      ctx.restore();
      if (actor.invulnerable > 0 || actor.invulnerable === true) {
        ctx.save();
        disc(ctx, actor.x, actor.y - 2, r + 10, 'rgba(161,244,254,.08)', 'rgba(213,253,249,.65)', 2);
        ctx.setLineDash([7, 12]); ctx.lineDashOffset = -this._time * 25;
        disc(ctx, actor.x, actor.y - 2, r + 13, null, 'rgba(201,249,249,.28)', 1.5); ctx.restore();
      }
      if (number(actor.shieldTime, 0) > 0) {
        ctx.save(); ctx.translate(actor.x, actor.y - 1);
        const fade = Math.min(1, actor.shieldTime / .35);
        ctx.globalAlpha = fade;
        disc(ctx, 0, 0, r + 11, 'rgba(112,190,249,.08)');
        for (let i = 0; i < 6; i++) {
          const a = i * TAU / 6 + .12;
          ctx.beginPath(); ctx.arc(0, 0, r + 12, a, a + .7);
          ctx.strokeStyle = i % 2 ? '#8fd3ff' : '#c6ecff'; ctx.lineWidth = 3; ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(0, 0, r + 16, -Math.PI / 2,
          -Math.PI / 2 + TAU * clamp(actor.shieldTime / number(actor.shieldDuration, 3), 0, 1));
        ctx.strokeStyle = 'rgba(148,209,255,.48)'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.restore();
      }
      if (number(actor.slowTime, 0) > 0 && number(actor.slowFactor, .65) < 1) {
        ctx.save(); ctx.globalAlpha = .65;
        ctx.strokeStyle = '#c4a1ee'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.ellipse(actor.x, actor.y + r * .55, r + 4, r * .48, 0, 0, TAU); ctx.stroke();
        ctx.restore();
      }
      if (number(actor.hitFlash, 0) > 0) {
        ctx.save(); ctx.globalAlpha = Math.min(this._reducedEffects ? .18 : .5, actor.hitFlash * 2.5);
        disc(ctx, actor.x, actor.y, r, '#fff4df'); ctx.restore();
        if (player && !this._reducedEffects) {
          ctx.save(); ctx.globalAlpha = Math.min(.45, actor.hitFlash * 2.5);
          disc(ctx, actor.x, actor.y, r + 19, null, '#ffc1a8', 3); ctx.restore();
        }
      }
    }

    _dummy(color) {
      const ctx = this.ctx;
      box(ctx, -15, 11, 30, 10, 4, '#5a707a', INK, 2.5);
      box(ctx, -5, -7, 10, 25, 3, '#a4b5ad', INK, 2);
      box(ctx, -25, -6, 12, 16, 4, '#dbbf86', INK, 2.5);
      box(ctx, 13, -6, 12, 16, 4, '#dbbf86', INK, 2.5);
      disc(ctx, 0, -3, 21, '#e4d6b7', INK, 3);
      disc(ctx, 0, -3, 16, color, '#a96b5b', 1.5);
      disc(ctx, 0, -3, 10, '#f9ecd1');
      disc(ctx, 0, -3, 5, '#a94e53');
      disc(ctx, -4, -9, 2.5, 'rgba(255,255,255,.55)');
      box(ctx, -6, -28, 12, 6, 2, '#bcc8bc', INK, 2);
    }

    _ranger(color, dark) {
      const ctx = this.ctx;
      polygon(ctx, [[-12,-12],[-30,-10],[-24,1],[-31,14],[-9,11]], dark, INK, 2.5);
      box(ctx, -17, -15, 13, 10, 4, '#203447', INK, 2);
      box(ctx, -17, 7, 13, 10, 4, '#203447', INK, 2);
      box(ctx, -13, -15, 27, 30, 10, color, INK, 3);
      box(ctx, -6, -18, 16, 6, 3, '#c9d6c9', INK, 2);
      box(ctx, -7, 11, 16, 7, 3, dark, INK, 2);
      disc(ctx, 1, -2, 14, '#244556', INK, 3);
      polygon(ctx, [[-8,-10],[2,-16],[12,-8],[11,-1],[1,-6],[-8,-4]], '#d8e8cc', INK, 2);
      box(ctx, 4, -9, 10, 15, 4, '#85f7e2', INK, 2);
      ctx.strokeStyle = '#eefff0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(9, -6); ctx.lineTo(9, 0); ctx.stroke();
      disc(ctx, 11, 12, 6, '#e2c4a0', INK, 2);
      box(ctx, 12, 3, 24, 12, 4, '#344959', INK, 2.5);
      box(ctx, 22, 3, 10, 5, 2, '#e9c679');
      box(ctx, 33, 5, 7, 8, 2, '#c2d2cf', INK, 2);
      box(ctx, -4, -19, 9, 4, 2, '#e8c676');
    }

    _tank(color, dark) {
      const ctx = this.ctx;
      box(ctx, -20, -18, 17, 13, 4, '#283d4c', INK, 3);
      box(ctx, -20, 7, 17, 13, 4, '#283d4c', INK, 3);
      polygon(ctx, [[-19,-13],[-9,-23],[10,-22],[21,-10],[20,13],[8,23],[-12,21],[-21,9]], '#dfb866', INK, 3);
      box(ctx, -9, -23, 21, 9, 4, color, INK, 2);
      box(ctx, -9, 15, 21, 9, 4, dark, INK, 2);
      box(ctx, -16, -13, 31, 28, 9, '#718e91', INK, 2.5);
      box(ctx, -8, -11, 24, 23, 7, '#dbe2cb', INK, 2.5);
      box(ctx, 6, -8, 11, 16, 3, '#294858', INK, 2);
      box(ctx, 11, -5, 4, 9, 1, color);
      disc(ctx, -5, 0, 3, '#a0b6b0');
      box(ctx, 8, -23, 24, 12, 5, '#b88850', INK, 2.5);
      box(ctx, 8, 12, 24, 12, 5, '#b88850', INK, 2.5);
      box(ctx, 25, -22, 9, 10, 3, '#e4d7b2', INK, 2);
      box(ctx, 25, 13, 9, 10, 3, '#e4d7b2', INK, 2);
      box(ctx, 31, -20, 5, 6, 1, '#34424a');
      box(ctx, 31, 15, 5, 6, 1, '#34424a');
    }

    _blaster(color, dark) {
      const ctx = this.ctx;
      polygon(ctx, [[-6,-21],[-28,-15],[-21,0],[-29,18],[-7,22],[15,11],[16,-11]], '#83669e', INK, 3);
      polygon(ctx, [[-6,-21],[-21,-15],[-14,-1],[-23,15],[-7,22],[-2,0]], '#ab80b8');
      box(ctx, -8, -19, 18, 8, 3, color, INK, 2);
      box(ctx, -7, 12, 18, 9, 4, dark, INK, 2);
      polygon(ctx, [[-11,-10],[-10,-21],[1,-14],[10,-20],[13,-5],[9,12],[-6,13]], '#d3b7d2', INK, 3);
      disc(ctx, 2, 0, 12, '#594d77', INK, 2.5);
      disc(ctx, 9, -2, 8, '#a5f3db', INK, 2.5);
      disc(ctx, 11, -4, 3, '#f1fff0');
      disc(ctx, 9, 14, 6, '#d8bc9f', INK, 2);
      box(ctx, 12, 4, 18, 15, 5, '#685574', INK, 2.5);
      disc(ctx, 28, 11, 10, '#c2adc4', INK, 2.5);
      disc(ctx, 31, 11, 6, '#8b5db7', '#443454', 2);
      disc(ctx, 33, 10, 3, '#e4b6fc');
      polygon(ctx, [[-17,-7],[-23,-11],[-19,-2]], '#e0c272');
    }

    _drawActorUI(actor, localTeam, options, mode, blueStar) {
      const ctx = this.ctx, x = actor.x, y = actor.y, r = number(actor.r, 22);
      const player = actor.isPlayer || actor.id === 0;
      const focused = this._camera.spectating && actor.id === this._camera.focusId;
      const ally = actor.team === localTeam;
      const color = ally ? TEAM[0] : TEAM[1];
      const hp = clamp(number(actor.hp, 1) / Math.max(1, number(actor.maxHp, actor.hp || 1)), 0, 1);
      const w = player || focused ? 62 : 54, top = y - r - 15;
      ctx.save();
      if (!options.menu) {
        const label = String(actor.name || (player ? 'YOU' : ''));
        if (label) {
          ctx.font = (player || focused ? '800 12px ' : '700 11px ') + FONT;
          ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.lineWidth = 3;
          ctx.strokeStyle = 'rgba(17,35,48,.9)'; ctx.strokeText(label, x, top - 5);
          ctx.fillStyle = player ? '#ecfff0' : ally ? '#d5f8ec' : '#ffddd0'; ctx.fillText(label, x, top - 5);
        }
      }
      box(ctx, x - w / 2 - 1, top - 1, w + 2, 8, 4, '#193243', 'rgba(15,31,43,.6)', 1);
      if (hp > 0) {
        ctx.save(); roundRect(ctx, x - w / 2, top, w, 6, 3); ctx.clip();
        ctx.fillStyle = hp < .26 ? '#ffbb77' : color; ctx.fillRect(x - w / 2, top, w * hp, 6);
        ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(x - w / 2, top, w * hp, 2);
        ctx.strokeStyle = 'rgba(20,51,61,.28)'; ctx.lineWidth = 1;
        for (let i = 1; i < 4; i++) {
          ctx.beginPath(); ctx.moveTo(x - w / 2 + w * i / 4, top + 1); ctx.lineTo(x - w / 2 + w * i / 4, top + 5); ctx.stroke();
        }
        ctx.restore();
      }
      const ammo = number(actor.ammo, 0), maxAmmo = clamp(number(actor.maxAmmo, 3), 1, 8);
      if (player || ally) {
        const segment = player ? 12 : 9, gap = 3, total = maxAmmo * segment + (maxAmmo - 1) * gap;
        for (let i = 0; i < maxAmmo; i++) {
          const xx = x - total / 2 + i * (segment + gap), yy = y + r + 11;
          box(ctx, xx, yy, segment, 4, 2, '#1e3a48');
          const fraction = clamp(ammo - i, 0, 1);
          if (fraction) box(ctx, xx, yy, segment * fraction, 4, Math.min(2, segment * fraction / 2), player ? '#ffe2a0' : '#b4ddd4');
        }
      }
      if (actor.gems > 0 || actor.power > 0) {
        const gems = actor.gems > 0, count = gems ? actor.gems : actor.power;
        const bx = x + w / 2 + 13, by = top + 2;
        box(ctx, bx - 10, by - 10, count >= 10 ? 28 : 22, 19, 7, gems ? '#694d96' : '#526e3a', '#253344', 2);
        ctx.font = '800 12px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = gems ? '#f0d4ff' : '#e4f5ad'; ctx.fillText(String(count), bx + (count >= 10 ? 4 : 1), by);
      }
      if (mode === 'bounty') this._drawBountyBadge(actor, blueStar, top);
      let statusX = x - w / 2 - 12;
      if (number(actor.shieldTime, 0) > 0) {
        this._drawStatusBadge(statusX, top + 2, 'shield'); statusX -= 20;
      }
      if (number(actor.slowTime, 0) > 0 && number(actor.slowFactor, .65) < 1) {
        this._drawStatusBadge(statusX, top + 2, 'slow');
      }
      if (player) {
        if (options.showGadgetIndicator !== false && Number.isFinite(actor.gadgetCooldown)) {
          const heroes = global.BrawlCore && global.BrawlCore.HEROES;
          const definition = heroes && heroes[actor.hero];
          const max = number(actor.gadgetCooldownMax, mode === 'training' ? 3 : definition ? number(definition.gadgetCooldown, 15) : 15);
          const ready = actor.gadgetCooldown <= 0;
          const gx = x - 31, gy = y + r + 13;
          disc(ctx, gx, gy, 6, '#1c3946', ready ? '#a5ecd0' : '#507a80', 1.5);
          if (ready) {
            polygon(ctx, [[gx,gy-3],[gx+3,gy],[gx,gy+3],[gx-3,gy]], '#c9ffdf');
          } else {
            ctx.beginPath(); ctx.arc(gx, gy, 6, -Math.PI / 2,
              -Math.PI / 2 + TAU * clamp(1 - actor.gadgetCooldown / Math.max(.01, max), 0, 1));
            ctx.strokeStyle = '#98d2c8'; ctx.lineWidth = 2; ctx.stroke();
          }
        }
        const yy = y + r + 26 + Math.sin(this._time * 3) * 1.2;
        polygon(ctx, [[x-5,yy+5],[x,yy],[x+5,yy+5]], '#dcfff0', '#255563', 1.5);
      }
      ctx.restore();
    }

    _drawStatusBadge(x, y, type) {
      const ctx = this.ctx;
      ctx.save(); ctx.translate(x, y);
      disc(ctx, 0, 0, 8.5, type === 'shield' ? '#2d526f' : '#59416f', '#213442', 1.5);
      if (type === 'shield') {
        polygon(ctx, [[-4,-4],[0,-6],[4,-4],[3,2],[0,5],[-3,2]], '#b9e7ff');
        ctx.strokeStyle = '#5d9bc3'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0,-3); ctx.lineTo(0,2); ctx.stroke();
      } else {
        ctx.strokeStyle = '#e3c2ff'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(-4,-5); ctx.lineTo(4,-5);
        ctx.moveTo(-4,5); ctx.lineTo(4,5);
        ctx.moveTo(-3,-4); ctx.lineTo(3,4); ctx.moveTo(3,-4); ctx.lineTo(-3,4); ctx.stroke();
      }
      ctx.restore();
    }

    _drawProjectile(projectile) {
      const ctx = this.ctx, vx = number(projectile.vx, 0), vy = number(projectile.vy, 0);
      const angle = Math.atan2(vy, vx), r = clamp(number(projectile.r, 4), 2, 24);
      const color = projectile.color || (projectile.team === 0 ? '#bcfff2' : '#ffbe9f');
      const speed = Math.hypot(vx, vy), length = clamp(speed * .035, 9, 38);
      ctx.save(); ctx.translate(projectile.x, projectile.y); ctx.rotate(angle);
      const trail = ctx.createLinearGradient(-length - r, 0, r, 0);
      trail.addColorStop(0, 'rgba(255,224,162,0)'); trail.addColorStop(1, color);
      ctx.globalAlpha = .55;
      if (!this._reducedEffects) polygon(ctx, [[-length-r,-r*.25],[0,-r],[r,0],[0,r],[-length-r,r*.25]], trail);
      ctx.globalAlpha = 1;
      if (projectile.kind === 'bomb') {
        disc(ctx, 0, 3, r + 2, 'rgba(25,27,51,.2)');
        disc(ctx, 0, 0, r, '#b184cf', '#473358', 2);
        disc(ctx, r * .25, -r * .25, r * .48, '#e3b3f0');
        ctx.strokeStyle = '#fce4ac'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-r * .4, -r * .7); ctx.lineTo(-r * .5 - 3, -r - 3); ctx.stroke();
      } else if (projectile.kind === 'super') {
        disc(ctx, 0, 0, r + 6, 'rgba(255,218,120,.15)');
        disc(ctx, 0, 0, r, '#ffcf77', '#a66c48', 2);
        disc(ctx, 1, -1, r * .53, '#fff3c7');
      } else {
        box(ctx, -r * 1.4, -r * .64, r * 3, r * 1.28, r * .64, color, 'rgba(28,57,63,.3)', 1.3);
        box(ctx, -r * .5, -r * .3, r * 1.6, r * .6, r * .3, '#fff8db');
      }
      ctx.restore();
    }

    _drawBall(ball, actors) {
      const ctx = this.ctx, r = number(ball.r, 13), x = ball.x, y = ball.y;
      const carrier = actors.find(a => a.id === ball.carrierId);
      if (ball.carrierId !== null && ball.carrierId !== undefined && ball.carrierId !== -1 && !carrier) return;
      ctx.save();
      if (carrier) {
        disc(ctx, carrier.x, carrier.y + 4, number(carrier.r, 22) + 11, null, 'rgba(255,227,139,.65)', 2);
      }
      ctx.fillStyle = 'rgba(15,29,41,.25)'; ctx.beginPath(); ctx.ellipse(x + 2, y + 10, r * 1.12, r * .6, 0, 0, TAU); ctx.fill();
      ctx.translate(x, y - 2);
      const speed = Math.hypot(number(ball.vx, 0), number(ball.vy, 0));
      ctx.rotate(speed > 8 ? this._time * Math.min(12, speed * .012) : .25);
      disc(ctx, 0, 0, r, '#fff0cb', '#314452', 2.5);
      polygon(ctx, [[0,-r*.5],[r*.49,-r*.1],[r*.29,r*.46],[-r*.29,r*.46],[-r*.49,-r*.1]], '#425569');
      ctx.strokeStyle = '#71818b'; ctx.lineWidth = 1.6;
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + i * TAU / 5;
        ctx.beginPath(); ctx.moveTo(Math.cos(a)*r*.5,Math.sin(a)*r*.5); ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r); ctx.stroke();
      }
      disc(ctx, -r*.3, -r*.45, r*.2, 'rgba(255,255,255,.7)');
      ctx.restore();
    }

    _drawZone(zone) {
      const ctx = this.ctx, r = Math.max(1, number(zone.r, 760));
      ctx.save();
      ctx.beginPath(); ctx.rect(-2, -2, this.width + 4, this.height + 4);
      ctx.moveTo(zone.x + r, zone.y); ctx.arc(zone.x, zone.y, r, 0, TAU, true);
      ctx.fillStyle = 'rgba(92,47,126,.31)'; ctx.fill('evenodd');
      ctx.beginPath(); ctx.rect(-2, -2, this.width + 4, this.height + 4);
      ctx.moveTo(zone.x + r, zone.y); ctx.arc(zone.x, zone.y, r, 0, TAU, true); ctx.clip('evenodd');
      for (let i = 0; i < (this._reducedEffects ? 0 : 26); i++) {
        const xx = randomAt(i, 31) * this.width + Math.sin(this._time * .4 + i) * 14;
        const yy = (randomAt(i, 37) * this.height - this._time * (4 + i % 3) % this.height + this.height) % this.height;
        disc(ctx, xx, yy, 24 + randomAt(i, 41) * 42, 'rgba(174,115,195,.055)');
      }
      ctx.restore();
      ctx.save();
      disc(ctx, zone.x, zone.y, r, null, 'rgba(235,182,255,.22)', 13);
      disc(ctx, zone.x, zone.y, r, null, '#d9b4ef', 2.5);
      ctx.setLineDash([16, 18]); ctx.lineDashOffset = -this._time * 14;
      disc(ctx, zone.x, zone.y, r + 7, null, 'rgba(222,168,249,.55)', 2); ctx.restore();
    }

    _drawEffect(effect, textLayer) {
      const ctx = this.ctx;
      const ratio = clamp(number(effect.life, .5) / Math.max(.001, number(effect.maxLife, .5)), 0, 1);
      const progress = 1 - ratio, r = number(effect.r, 28), x = effect.x, y = effect.y;
      const type = effect.type || 'hit', color = effect.color || '#ffe6a1';
      if (textLayer) {
        if (effect.text === undefined || effect.text === null || effect.text === '') return;
        ctx.save(); ctx.globalAlpha = Math.min(1, ratio * 3);
        ctx.font = (type === 'goal' ? '900 35px ' : '800 18px ') + FONT;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 4;
        const rise = progress * (this._reducedEffects ? 8 : 30);
        ctx.strokeStyle = 'rgba(27,34,48,.9)'; ctx.strokeText(String(effect.text), x, y - 15 - rise);
        ctx.fillStyle = color; ctx.fillText(String(effect.text), x, y - 15 - rise);
        ctx.restore(); return;
      }
      if (type === 'text') return;
      ctx.save(); ctx.translate(x, y); ctx.globalAlpha = ratio;
      if (type === 'explosion' || type === 'goal') {
        const size = r * (.3 + progress * .9);
        disc(ctx, 0, 0, size, this._reducedEffects ? null : type === 'goal' ? 'rgba(255,222,135,.08)' : 'rgba(255,206,143,.14)', color, 3 * ratio + 1);
        disc(ctx, 0, 0, size * .65, null, color, 1.5);
        const count = this._reducedEffects ? 4 : type === 'goal' ? 18 : 10;
        for (let i = 0; i < count; i++) {
          const a = i * TAU / count + .17, start = size * 1.05, end = size * (1.2 + randomAt(i, r) * .3);
          ctx.strokeStyle = i % 3 ? color : '#fff5d9'; ctx.lineWidth = type === 'goal' ? 4 : 2.5;
          ctx.beginPath(); ctx.moveTo(Math.cos(a) * start, Math.sin(a) * start); ctx.lineTo(Math.cos(a) * end, Math.sin(a) * end); ctx.stroke();
        }
      } else if (type === 'heal') {
        for (let i = 0; i < (this._reducedEffects ? 1 : 3); i++) {
          const xx = (this._reducedEffects ? 0 : i - 1) * 13, yy = -progress * 22 - (i % 2) * 12;
          box(ctx, xx - 2, yy - 6, 4, 12, 1, color);
          box(ctx, xx - 6, yy - 2, 12, 4, 1, color);
        }
      } else if (type === 'respawn') {
        disc(ctx, 0, 0, r * (.5 + progress * .6), 'rgba(145,243,224,.06)', color, 3);
        ctx.setLineDash([7, 10]); disc(ctx, 0, 0, r * (.8 + progress), null, color, 1.5);
      } else if (type === 'shield' || type === 'field' || type === 'gadget') {
        const size = Math.max(8, r * (.35 + progress * .7));
        disc(ctx, 0, 0, size, null, color, 2.5 * ratio + 1);
        ctx.save(); ctx.rotate(progress * .7);
        for (let i = 0; i < (this._reducedEffects ? 0 : 4); i++) {
          const a = i * Math.PI / 2;
          const xx = Math.cos(a) * size, yy = Math.sin(a) * size;
          polygon(ctx, [[xx,yy-4],[xx+3,yy],[xx,yy+4],[xx-3,yy]], color);
        }
        ctx.restore();
      } else if (type === 'dash') {
        ctx.rotate(number(effect.angle, 0));
        for (let i = -1; i <= 1; i++) {
          ctx.strokeStyle = color; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.moveTo(-r * (.4 + progress), i * 9); ctx.lineTo(r * .25, i * 9); ctx.stroke();
        }
      } else if (type === 'pickup') {
        const count = this._reducedEffects ? 3 : 6;
        for (let i = 0; i < count; i++) {
          const a = i * TAU / count + progress * .5;
          disc(ctx, Math.cos(a) * (9 + progress * r), Math.sin(a) * (9 + progress * r), 2.5 * ratio + 1, color);
        }
      } else {
        const size = (type === 'shot' ? 11 : 15) * (.6 + progress * .6);
        ctx.rotate(number(effect.angle, 0) + progress * .4);
        polygon(ctx, [[-size,0],[-size*.27,-size*.25],[0,-size],[size*.3,-size*.26],[size,0],[size*.27,size*.25],[0,size],[-size*.25,size*.3]], color);
        disc(ctx, 0, 0, size * .25, '#fffbe5');
      }
      ctx.restore();
    }

    destroy() {
      this._destroyed = true;
      this._floor = null;
      this._floorKey = '';
    }
  }

  global.BrawlRenderer = BrawlRenderer;
  if (typeof module !== 'undefined' && module.exports) module.exports = BrawlRenderer;
})(typeof globalThis !== 'undefined' ? globalThis : window);
