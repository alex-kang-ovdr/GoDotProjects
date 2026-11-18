/* Last Light — an original, asset-free canvas scene.
 * The renderer is deliberately cosmetic: it never changes simulation state.
 * World coordinates are always 1280 × 720, feet at 600 / 410 / 220.
 */

import { getVisibility, getEncounter, getNavigation, getDistraction, COMBAT_RULES } from './expedition.js';

const WORLD_W = 1280;
const WORLD_H = 720;
const FLOORS = [600, 410, 220];
const NAVIGATION_PANEL = Object.freeze({ x: 28, y: 631, w: 1224, h: 77 });
const TAU = Math.PI * 2;
const FONT = '"Pretendard", "Noto Sans KR", "Apple SD Gothic Neo", sans-serif';
const STATIONS = [
  { id: 'door', x: 120, floor: 0, label: '출입문', icon: '↗', radius: 48 },
  { id: 'workshop', x: 330, floor: 0, label: '작업대', icon: '+', radius: 62 },
  { id: 'heater', x: 700, floor: 0, label: '난방', icon: '◇', radius: 50 },
  { id: 'water', x: 980, floor: 0, label: '빗물 수집', icon: '◌', radius: 54 },
  { id: 'kitchen', x: 580, floor: 1, label: '조리대', icon: '○', radius: 64 },
  { id: 'radio', x: 980, floor: 1, label: '라디오', icon: '≋', radius: 46 },
  { id: 'bed', x: 350, floor: 2, label: '침대', icon: '–', radius: 70 },
  { id: 'rubble', x: 940, floor: 2, label: '잔해 정리', icon: '⋯', radius: 68 },
];
const DAY_STAIRS = [
  { x: 796, from: 0, to: 1 },
  { x: 756, from: 1, to: 2 },
];
const IDLE = {
  mira: { x: 485, floor: 1 },
  yun: { x: 260, floor: 0 },
  leo: { x: 465, floor: 2 },
};
const COLORS = {
  ink: '#111c23', outline: '#0c161d', wall: '#303b41', floor: '#293138',
  chalk: '#b9b4a1', amber: '#e5a660', warm: '#e9bd83', blue: '#8ca8b6',
  text: '#e6dfcf', quiet: '#8f9b9b', danger: '#e98e79', green: '#a4bda7',
};

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function fract(n) { return n - Math.floor(n); }
function hash(n) { return fract(Math.sin(n * 127.1 + 311.7) * 43758.5453); }
function random(seed = 38) {
  let n = seed >>> 0;
  return () => { n = (1664525 * n + 1013904223) >>> 0; return n / 4294967296; };
}
function polygon(ctx, points, fill, stroke, width = 1) {
  ctx.beginPath();
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]);
  }
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}
function line(ctx, x1, y1, x2, y2, color, width = 1) {
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
}
function box(ctx, x, y, w, h, color) { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); }
function ellipse(ctx, x, y, rx, ry, color) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.fillStyle = color; ctx.fill();
}
function roundRect(ctx, x, y, w, h, r, fill, stroke) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else {
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
  }
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.lineWidth = 1; ctx.strokeStyle = stroke; ctx.stroke(); }
}
function label(ctx, text, x, y, size = 12, color = COLORS.text, align = 'center', weight = 500) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = color; ctx.fillText(String(text), x, y);
}
function entityY(entity, floors) {
  if (entity.climb) {
    const { from, to, elapsed, duration } = entity.climb;
    if (Number.isFinite(floors[from]) && Number.isFinite(floors[to])) {
      return lerp(floors[from], floors[to], clamp(Number(elapsed || 0) / Math.max(0.01, Number(duration || 1)), 0, 1));
    }
  }
  return Number.isFinite(entity.y) ? entity.y : floors[entity.floor] ?? 600;
}
function light(ctx, x, y, radius = 140, alpha = 0.25) {
  const g = ctx.createRadialGradient(x, y, 3, x, y, radius);
  g.addColorStop(0, `rgba(244,179,94,${alpha})`);
  g.addColorStop(0.32, `rgba(226,153,72,${alpha * 0.33})`);
  g.addColorStop(1, 'rgba(226,153,72,0)');
  ctx.fillStyle = g; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}
function lamp(ctx, x, y, t, strength = 1) {
  const flicker = 0.95 + Math.sin(t * 2.1 + x) * 0.025 + Math.sin(t * 6.7) * 0.012;
  light(ctx, x, y + 25, 175, 0.28 * strength * flicker);
  line(ctx, x, y - 20, x, y - 2, '#0d171d', 2);
  polygon(ctx, [[x - 11, y + 4], [x - 6, y - 2], [x + 6, y - 2], [x + 11, y + 4]], '#20272b');
  ellipse(ctx, x, y + 5, 7, 2.4, '#efb966');
  ellipse(ctx, x, y + 6, 3.5, 2, '#ffe3a5');
  ctx.save(); ctx.globalAlpha = 0.05 * strength;
  polygon(ctx, [[x - 6, y + 7], [x + 6, y + 7], [x + 62, y + 105], [x - 62, y + 105]], '#ffc780');
  ctx.restore();
}

function makeSurface(painter, ratio = 1.5) {
  const surface = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(Math.ceil(WORLD_W * ratio), Math.ceil(WORLD_H * ratio))
    : document.createElement('canvas');
  surface.width = Math.ceil(WORLD_W * ratio); surface.height = Math.ceil(WORLD_H * ratio);
  const c = surface.getContext('2d');
  c.scale(ratio, ratio); painter(c); return surface;
}

function inSegments(segments, x, floor, margin = 0) {
  return segments.some(segment => segment.floor === floor && x >= segment.min - margin && x <= segment.max + margin);
}

function wallTexture(ctx, x, y, w, h, seed) {
  const rng = random(seed);
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  for (let i = 0; i < 170; i++) {
    const px = x + rng() * w; const py = y + rng() * h;
    const length = 3 + rng() * 25;
    line(ctx, px, py, px + length, py - 2 - rng() * 8,
      i % 3 ? 'rgba(176,173,150,0.045)' : 'rgba(7,18,25,0.18)', 0.6 + rng());
  }
  for (let i = 0; i < 9; i++) {
    const px = x + rng() * w; const py = y + rng() * h;
    line(ctx, px, py, px - 5, py + 12, 'rgba(8,19,25,0.35)', 1);
    line(ctx, px - 5, py + 12, px + 3, py + 22, 'rgba(8,19,25,0.35)', 1);
  }
  ctx.restore();
}
function bricks(ctx, x, y, w, h, seed = 5) {
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  for (let row = 0; row < Math.ceil(h / 12); row++) {
    for (let col = -1; col < Math.ceil(w / 24); col++) {
      const n = hash(seed + row * 77 + col * 3);
      box(ctx, x + col * 24 + (row % 2) * 12, y + row * 12, 22, 10,
        n > 0.8 ? '#4b4c47' : n > 0.35 ? '#3e4240' : '#343a3a');
    }
  }
  ctx.restore();
}
function windowFrame(ctx, x, y, w, h, broken = false, warm = false) {
  box(ctx, x - 6, y - 6, w + 12, h + 13, '#1b272e');
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, warm ? '#6b6752' : '#506b7b');
  g.addColorStop(1, warm ? '#3b413b' : '#213746');
  box(ctx, x, y, w, h, g);
  line(ctx, x + w / 2, y, x + w / 2, y + h, '#19262c', 5);
  line(ctx, x, y + h * 0.48, x + w, y + h * 0.48, '#19262c', 4);
  box(ctx, x - 9, y + h, w + 18, 5, '#606561');
  line(ctx, x - 9, y + h + 5, x + w + 9, y + h + 5, '#18252c', 3);
  if (broken) {
    polygon(ctx, [[x + 3, y + 2], [x + w / 2 - 3, y + 2], [x + w / 2 - 4, y + 21], [x + 19, y + 14], [x + 11, y + 34], [x + 3, y + 21]], '#8c9c9a');
    line(ctx, x + w / 2 + 6, y + h - 6, x + w - 4, y + h * 0.5 + 5, 'rgba(167,184,186,0.45)');
  } else {
    polygon(ctx, [[x + 5, y + 5], [x + w * 0.32, y + 5], [x + 5, y + h * 0.65]], 'rgba(188,207,208,0.08)');
  }
}
function stairs(ctx, stair, floors = FLOORS, night = false) {
  const lower = floors[stair.from], upper = floors[stair.to];
  if (!Number.isFinite(lower) || !Number.isFinite(upper)) return;
  const x = stair.x;
  const flip = stair.from % 2 ? -1 : 1;
  const x1 = x - 51 * flip, x2 = x + 51 * flip;
  ctx.save(); ctx.globalAlpha = night ? 0.88 : 1;
  polygon(ctx, [[x1 - 4, lower], [x1 + 9, lower], [x2 + 7, upper + 8], [x2 - 6, upper + 8]], '#152028');
  const count = 13;
  for (let i = 0; i < count; i++) {
    const p = i / (count - 1); const sx = lerp(x1, x2, p), sy = lerp(lower, upper + 12, p);
    line(ctx, sx - 20, sy, sx + 20, sy, '#656963', 3);
    line(ctx, sx - 20, sy + 3, sx + 20, sy + 3, '#131f26', 2);
    if (i % 3 === 0) line(ctx, sx + 22, sy, sx + 22, sy - 30, '#465350', 2);
  }
  line(ctx, x1 + 22, lower - 30, x2 + 22, upper - 18, '#67736c', 2);
  line(ctx, x1 + 24, lower - 30, x2 + 24, upper - 18, '#17262c', 2);
  ctx.restore();
}
function rubble(ctx, x, y, amount = 1, seed = 30) {
  const rng = random(seed);
  const count = Math.max(4, Math.round(30 * amount));
  for (let i = 0; i < count; i++) {
    const bx = x + (rng() - 0.5) * 112, by = y - rng() * (30 * amount);
    const bw = 8 + rng() * 18, bh = 4 + rng() * 9;
    ctx.save(); ctx.translate(bx, by); ctx.rotate((rng() - 0.5) * 0.7);
    box(ctx, -bw / 2, -bh, bw, bh, ['#53544d', '#394342', '#696459', '#303c40'][i % 4]);
    line(ctx, -bw / 2, -bh, bw / 2, -bh, '#79766a', 0.7); ctx.restore();
  }
  line(ctx, x - 55, y - 5, x + 39, y - 26 * amount, '#202b2e', 5);
  line(ctx, x - 47, y - 7, x + 45, y - 27 * amount, '#676858', 1);
}

function skyStructure(ctx, night, dusk, cold) {
  const top = night ? '#111d2c' : cold ? '#384d5b' : '#425c6d';
  const bottom = night ? '#263945' : dusk > 0.7 ? '#626b68' : '#75878a';
  const g = ctx.createLinearGradient(0, 0, 0, WORLD_H);
  g.addColorStop(0, top); g.addColorStop(0.65, bottom); g.addColorStop(1, '#1d313d');
  box(ctx, 0, 0, WORLD_W, WORLD_H, g);
  if (night) {
    light(ctx, 1135, 91, 94, 0.035);
    ellipse(ctx, 1135, 91, 19, 19, '#a3b6ba');
    ellipse(ctx, 1127, 86, 18, 18, '#263746');
  }
  for (let layer = 0; layer < 3; layer++) {
    const rng = random(58 + layer);
    const base = 380 + layer * 74;
    let x = -50;
    ctx.save(); ctx.globalAlpha = 0.34 + layer * 0.19;
    while (x < WORLD_W + 30) {
      const w = 37 + rng() * 88, h = 58 + rng() * 130;
      const topY = base - h;
      box(ctx, x, topY, w, h + 110, layer === 2 ? '#182a34' : '#304651');
      if (rng() > 0.65) {
        box(ctx, x + w * 0.4, topY - 25, 8, 25, '#273c48');
        line(ctx, x + w * 0.45, topY - 25, x + w * 0.45, topY - 49, '#2c424c', 1.2);
      }
      for (let wy = topY + 15; wy < base - 10; wy += 20) {
        for (let wx = x + 11; wx < x + w - 8; wx += 16) {
          if (rng() > 0.74) box(ctx, wx, wy, 4, 6, rng() > 0.9 ? '#bd9462' : '#607780');
        }
      }
      x += w + 7 + rng() * 14;
    }
    ctx.restore();
  }
  const fog = ctx.createLinearGradient(0, 340, 0, 650);
  fog.addColorStop(0, 'rgba(142,161,164,0)');
  fog.addColorStop(0.58, night ? 'rgba(111,139,151,0.13)' : 'rgba(164,181,181,0.2)');
  fog.addColorStop(1, 'rgba(47,65,70,0)');
  box(ctx, 0, 340, WORLD_W, 310, fog);
}
function drawMist(ctx, time) {
  // Only the mist moves; the skyline and its hundreds of windows are cached.
  ctx.save(); ctx.globalAlpha = 0.05;
  for (let i = 0; i < 3; i++) {
    const px = ((i * 520 + time * (6 + i)) % 1900) - 300;
    ellipse(ctx, px, 540 + i * 18, 370, 32, '#c2d1cf');
  }
  ctx.restore();
}
function drawRain(ctx, time, cold, front = false) {
  ctx.save(); ctx.strokeStyle = front ? 'rgba(164,196,204,0.045)' : 'rgba(180,206,212,0.22)';
  ctx.lineWidth = front ? 0.8 : 0.65;
  if (cold) {
    const count = front ? 17 : 64;
    for (let i = 0; i < count; i++) {
      const x = (hash(i + 513) * 1450 + time * (3 + hash(i) * 8)) % 1450 - 80;
      const y = (hash(i + 142) * 800 + time * (12 + hash(i + 1) * 10)) % 800 - 50;
      ellipse(ctx, x + Math.sin(time + i) * 9, y, 0.7 + hash(i) * 0.8, 1, front ? 'rgba(224,233,224,0.11)' : 'rgba(220,230,224,0.52)');
    }
  } else {
    ctx.beginPath();
    for (let i = 0; i < (front ? 26 : 96); i++) {
      const speed = 140 + hash(i + 20) * 120;
      const y = (hash(i + 49) * 900 + time * speed) % 900 - 90;
      const x = (hash(i + 3) * 1450 - time * 37 + y * 0.12) % 1450;
      ctx.moveTo(x < 0 ? x + 1450 : x, y);
      ctx.lineTo((x < 0 ? x + 1450 : x) - 3, y + 13 + hash(i) * 12);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function exteriorAtmosphere(ctx, time, cold, night) {
  // The sky, masonry and foreground share one opaque cached backdrop. Clip the
  // weather to the exterior rather than blend several full-size bitmaps again.
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, WORLD_W, WORLD_H);
  if (night) ctx.rect(145, 49, 1040, 573);
  else ctx.rect(84, 42, 1095, 580);
  ctx.clip('evenodd');
  drawMist(ctx, time); drawRain(ctx, time, cold);
  ctx.restore();
}

function shelterStructure(ctx) {
  // Broken outline, exposed brick and soot sit behind the playable rooms.
  polygon(ctx, [[94,598],[94,206],[124,206],[124,52],[185,52],[185,36],[249,42],[258,58],[625,58],[643,41],[663,57],[1038,57],[1038,73],[1117,73],[1117,98],[1172,98],[1172,612]], '#1b282e', '#0e1c24', 7);
  box(ctx, 143, 72, 985, 148, '#354147');
  box(ctx, 144, 240, 984, 170, '#333e42');
  box(ctx, 144, 431, 984, 169, '#2b383e');
  // Dark empty spaces and room-specific wall temperature.
  box(ctx, 143, 72, 424, 148, '#384448');
  box(ctx, 570, 72, 558, 148, '#303b41');
  box(ctx, 144, 240, 362, 170, '#2f3d43');
  box(ctx, 520, 240, 257, 170, '#3b4241');
  box(ctx, 814, 240, 314, 170, '#354044');
  wallTexture(ctx, 145, 73, 980, 145, 11);
  wallTexture(ctx, 145, 241, 980, 168, 12);
  wallTexture(ctx, 145, 432, 980, 167, 13);
  // Some plaster has peeled away, revealing masonry.
  ctx.save();
  polygon(ctx, [[849,77],[927,77],[927,93],[904,97],[916,115],[877,118],[876,145],[843,132]], '#41463f');
  ctx.clip(); bricks(ctx, 840, 70, 100, 82); ctx.restore();
  ctx.save();
  polygon(ctx, [[169,315],[209,307],[232,323],[226,358],[241,377],[214,409],[163,409]], '#41463f');
  ctx.clip(); bricks(ctx, 157, 308, 90, 102); ctx.restore();
  windowFrame(ctx, 206, 108, 80, 77, false);
  windowFrame(ctx, 603, 106, 81, 81, true);
  windowFrame(ctx, 1007, 114, 66, 76, true);
  windowFrame(ctx, 317, 274, 107, 93, true);
  windowFrame(ctx, 862, 276, 83, 86, false, true);
  windowFrame(ctx, 1055, 462, 52, 86, true);
  // Paper, postcards, hand-drawn flowers and fading wallpaper.
  box(ctx, 464, 108, 31, 44, '#77796a');
  box(ctx, 470, 114, 19, 23, '#57686a');
  line(ctx, 472, 145, 487, 145, '#434f4d', 1);
  box(ctx, 887, 257, 18, 4, '#272f30');
  for (let i = 0; i < 5; i++) {
    const x = 179 + i * 20;
    line(ctx, x, 172, x, 198, 'rgba(172,171,132,0.25)', 0.8);
    ellipse(ctx, x - 3, 183, 4, 2, 'rgba(172,171,132,0.20)');
    ellipse(ctx, x + 3, 177, 4, 2, 'rgba(172,171,132,0.20)');
  }
  // Chalk marks: original drawings rather than external textures.
  line(ctx, 526, 132, 542, 117, '#8a8975', 1.1);
  line(ctx, 542, 117, 558, 132, '#8a8975', 1.1);
  line(ctx, 531, 130, 531, 148, '#8a8975', 1.1);
  line(ctx, 553, 130, 553, 148, '#8a8975', 1.1);
  line(ctx, 531, 148, 553, 148, '#8a8975', 1.1);
  label(ctx, 'HOME', 543, 161, 7, 'rgba(166,161,133,0.45)', 'center', 500);
  // Upper room curtains.
  polygon(ctx, [[198,102],[218,102],[210,166],[197,180]], '#666c61');
  polygon(ctx, [[276,102],[293,102],[295,182],[281,169]], '#4c5d5b');
  line(ctx, 200, 104, 208, 161, '#7c7e6e', 1);
  // Kitchen backsplash and exposed pipe.
  for (let row = 0; row < 4; row++) for (let col = 0; col < 7; col++) {
    box(ctx, 526 + col * 16, 332 + row * 13, 14, 11, (row + col) % 3 ? '#687168' : '#4f605c');
  }
  line(ctx, 1120, 114, 1120, 584, '#62716c', 4);
  line(ctx, 1124, 114, 1124, 584, '#1a2c31', 2);
  // Cross-section edges retain broken, charcoal-like material.
  for (const y of FLOORS) {
    box(ctx, 131, y, 1013, 20, '#18262d');
    box(ctx, 130, y, 1014, 5, '#6b7065');
    line(ctx, 130, y + 7, 1144, y + 7, '#38443f', 2);
    for (let i = 0; i < 30; i++) {
      const x = 143 + i * 33 + hash(i + y) * 8;
      line(ctx, x, y + 10, x + 19, y + 13, '#36423f', 1);
    }
  }
  box(ctx, 130, 73, 16, 539, '#233137');
  box(ctx, 1128, 95, 20, 522, '#202e35');
  line(ctx, 146, 76, 146, 598, '#6c7367', 2);
  line(ctx, 1127, 100, 1127, 598, '#59665f', 1);
  // Partial interior walls leave the cross-section traversable.
  box(ctx, 567, 73, 13, 68, '#202e35');
  polygon(ctx, [[567,141],[580,141],[580,157],[576,151],[571,169],[567,161]], '#202e35');
  box(ctx, 507, 241, 12, 72, '#223138');
  box(ctx, 814, 241, 11, 65, '#233137');
  // Loose cables, rafters and broken roof.
  ctx.strokeStyle = '#14232b'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(146, 259); ctx.bezierCurveTo(351, 281, 416, 231, 579, 259); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(826, 255); ctx.bezierCurveTo(945, 280, 1020, 246, 1127, 263); ctx.stroke();
  line(ctx, 150, 59, 1104, 80, '#57615b', 5);
  line(ctx, 160, 54, 1107, 75, '#24323a', 7);
  polygon(ctx, [[1026,59],[1043,44],[1066,60],[1076,49],[1102,71],[1117,73],[1116,86],[1031,79]], '#28363d');
  line(ctx, 138, 43, 202, 28, '#394b50', 3);
  line(ctx, 185, 31, 185, 13, '#2a3e48', 2);
  // A soot stain over the stove, a shelf, and stacked everyday objects.
  const soot = ctx.createRadialGradient(574, 300, 2, 574, 300, 53);
  soot.addColorStop(0, 'rgba(4,12,17,0.34)'); soot.addColorStop(1, 'rgba(4,12,17,0)');
  box(ctx, 520, 244, 112, 111, soot);
  box(ctx, 920, 324, 158, 6, '#222b2e');
  for (let i = 0; i < 6; i++) box(ctx, 946 + i * 13, 307 - (i % 2) * 4, 9, 17 + (i % 2) * 4, ['#7c6d56','#5d706a','#8a795e'][i % 3]);
  label(ctx, '02 / 생활 공간', 175, 261, 9, 'rgba(183,190,177,0.33)', 'left', 500);
  label(ctx, '03 / 잠시 쉬는 곳', 158, 91, 9, 'rgba(183,190,177,0.34)', 'left', 500);
  label(ctx, '01 / 다시 만드는 곳', 175, 452, 9, 'rgba(183,190,177,0.3)', 'left', 500);
  for (const s of DAY_STAIRS) stairs(ctx, s);
}

function bed(ctx, x, y, second = false) {
  ellipse(ctx, x, y + 2, 59, 6, 'rgba(4,12,18,0.3)');
  line(ctx, x - 55, y - 39, x - 55, y, '#1b272a', 4);
  line(ctx, x + 52, y - 28, x + 52, y, '#17252a', 4);
  line(ctx, x - 55, y - 19, x + 52, y - 19, '#283735', 6);
  box(ctx, x - 52, y - 32, 103, 12, '#a09b83');
  box(ctx, x - 26, y - 33, 76, 13, second ? '#667f7d' : '#6e8178');
  polygon(ctx, [[x - 25,y - 33],[x + 49,y - 33],[x + 49,y - 12],[x + 37,y - 16],[x + 22,y - 13],[x + 7,y - 17],[x - 25,y - 15]], second ? '#506c6c' : '#566e68');
  roundRect(ctx, x - 48, y - 39, 24, 9, 4, '#b4b09b');
  for (let i = 0; i < 5; i++) line(ctx, x - 20 + i * 14, y - 32, x - 17 + i * 14, y - 17, 'rgba(165,179,155,0.19)');
  line(ctx, x - 57, y - 40, x - 34, y - 40, '#899187', 2);
  line(ctx, x + 38, y - 29, x + 54, y - 29, '#7d8d81', 2);
}
function stove(ctx, x, y, level, t, working) {
  ellipse(ctx, x, y + 1, 50, 7, 'rgba(7,15,20,0.28)');
  box(ctx, x - 42, y - 58, 80, 53, '#66726a');
  box(ctx, x - 45, y - 63, 86, 7, '#a1a18a');
  box(ctx, x - 34, y - 45, 33, 26, '#27383a');
  line(ctx, x - 32, y - 29, x - 4, y - 29, '#7e8775', 2);
  box(ctx, x + 6, y - 45, 24, 27, '#4d5e58');
  line(ctx, x + 9, y - 40, x + 27, y - 40, '#88947e', 1);
  for (let i = 0; i < 3; i++) ellipse(ctx, x - 26 + i * 26, y - 52, 3, 3, '#202f31');
  box(ctx, x - 35, y - 5, 5, 5, '#141f25'); box(ctx, x + 27, y - 5, 5, 5, '#141f25');
  ellipse(ctx, x - 15, y - 64, 16, 4, '#192b2e');
  box(ctx, x - 29, y - 78, 28, 14, '#485e5c');
  ellipse(ctx, x - 15, y - 78, 14, 3.5, '#8a9782');
  line(ctx, x - 34, y - 72, x - 29, y - 72, '#88937e', 3);
  line(ctx, x - 1, y - 72, x + 5, y - 72, '#88937e', 3);
  if (working) {
    light(ctx, x - 17, y - 25, 67, 0.16);
    box(ctx, x - 30, y - 25, 25, 5, '#d89653');
    ctx.save(); ctx.strokeStyle = 'rgba(209,217,205,0.27)'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath(); const sx = x - 23 + i * 8;
      ctx.moveTo(sx, y - 84); ctx.bezierCurveTo(sx + Math.sin(t * 2 + i) * 7, y - 94, sx - 7, y - 99, sx + Math.sin(t + i) * 9, y - 112); ctx.stroke();
    }
    ctx.restore();
  }
  if (Number(level) > 1) {
    line(ctx, x + 30, y - 64, x + 30, y - 123, '#5f7067', 9);
    line(ctx, x + 30, y - 123, x + 58, y - 123, '#5f7067', 9);
    box(ctx, x + 6, y - 64, 20, 3, '#caa366');
  }
}
function workbench(ctx, x, y, level) {
  ellipse(ctx, x, y, 65, 7, 'rgba(4,12,17,0.3)');
  box(ctx, x - 56, y - 45, 116, 9, '#a08a64');
  box(ctx, x - 54, y - 36, 5, 36, '#48534b');
  box(ctx, x + 50, y - 36, 5, 36, '#48534b');
  line(ctx, x - 54, y - 9, x + 55, y - 9, '#61705f', 5);
  line(ctx, x - 51, y - 37, x + 53, y - 9, '#273d40', 4);
  box(ctx, x - 47, y - 70, 42, 24, '#344950');
  line(ctx, x - 48, y - 62, x - 5, y - 62, '#6e807c', 2);
  box(ctx, x - 31, y - 73, 11, 4, '#536660');
  // Vice and a small saw.
  box(ctx, x + 22, y - 57, 22, 12, '#6d7c73');
  box(ctx, x + 28, y - 63, 16, 8, '#899280');
  line(ctx, x + 17, y - 51, x + 49, y - 51, '#3a4b49', 3);
  line(ctx, x + 49, y - 57, x + 49, y - 44, '#95a08d', 2);
  ctx.save(); ctx.translate(x + 4, y - 47); ctx.rotate(-0.2);
  box(ctx, -14, -5, 25, 3, '#b6b59b'); box(ctx, -20, -8, 8, 9, '#6d5848'); ctx.restore();
  for (let i = 0; i < 3; i++) box(ctx, x - 39 + i * 18, y - 23, 14, 13, ['#706b54','#384e51','#636b58'][i]);
  if (Number(level) > 1) box(ctx, x - 49, y - 94, 54, 5, '#5e766c');
}
function radio(ctx, x, y, t, built = false, relief = {}, working = false) {
  box(ctx, x - 38, y - 28, 76, 5, '#7a725b');
  box(ctx, x - 31, y - 23, 4, 23, '#3d514f');
  box(ctx, x + 29, y - 23, 4, 23, '#3d514f');
  roundRect(ctx, x - 30, y - 59, 61, 31, 4, '#796c51', '#1e3036');
  roundRect(ctx, x - 23, y - 53, 28, 20, 2, '#2d3d3c');
  for (let i = 0; i < 6; i++) line(ctx, x - 21, y - 50 + i * 3, x + 3, y - 50 + i * 3, '#8b8e71', 0.6);
  box(ctx, x + 11, y - 52, 13, 7, '#b4a478');
  line(ctx, x + 14 + Math.sin(t * 0.2) * 2, y - 51, x + 14 + Math.sin(t * 0.2) * 2, y - 46, '#57422c', 1);
  ellipse(ctx, x + 17, y - 37, 4, 4, '#303c38');
  line(ctx, x + 24, y - 58, x + 44, y - 95, '#a5aca0', 1);
  ellipse(ctx, x + 44, y - 95, 1.5, 1.5, '#b1b7a8');
  // The old receiver remains useful for morale. The restored transmitter adds
  // a distinct power unit, microphone and aerial, without changing the cache.
  if (built) {
    roundRect(ctx, x - 28, y - 21, 31, 19, 2, '#3c5555', '#172e35');
    box(ctx, x - 21, y - 24, 5, 4, '#c1b789');
    box(ctx, x - 9, y - 24, 5, 4, '#8a9c8e');
    line(ctx, x - 18, y - 24, x - 18, y - 29, '#b4a875', 1.4);
    line(ctx, x - 18, y - 29, x - 34, y - 34, '#b4a875', 1.4);
    line(ctx, x - 7, y - 24, x + 9, y - 29, '#738f8b', 1.3);
    roundRect(ctx, x + 36, y - 53, 11, 22, 4, '#30494b', '#899b89');
    for (let i = 0; i < 4; i++) line(ctx, x + 39, y - 49 + i * 3, x + 44, y - 49 + i * 3, '#859b8e', 0.8);
    line(ctx, x + 42, y - 31, x + 43, y - 24, '#9da889', 1);
    line(ctx, x + 43, y - 24, x + 26, y - 28, '#9da889', 1);
    line(ctx, x - 42, y - 29, x - 42, y - 105, '#758b82', 2);
    line(ctx, x - 53, y - 99, x - 31, y - 99, '#8f9f8b', 1.3);
    line(ctx, x - 42, y - 105, x - 42, y - 116, '#c2c4a7', 1);
    const connected = Boolean(relief.contacted);
    ellipse(ctx, x + 27, y - 39, 2, 2, connected ? '#b9d2a7' : '#c7aa72');
    if (connected) {
      light(ctx, x + 27, y - 39, 25, 0.09);
      const pulse = 0.55 + Math.sin(t * 2) * 0.15;
      ctx.save(); ctx.globalAlpha = pulse;
      for (let i = 0; i < 2; i++) {
        ctx.beginPath(); ctx.arc(x - 42, y - 116, 8 + i * 7, -Math.PI * 0.8, -Math.PI * 0.2);
        ctx.strokeStyle = '#a7c5b1'; ctx.lineWidth = 1; ctx.stroke();
      }
      ctx.restore();
      polygon(ctx, [[x + 56,y - 69],[x + 90,y - 67],[x + 89,y - 35],[x + 55,y - 37]], '#9c9d7c', '#5b6c5c');
      line(ctx, x + 61, y - 60, x + 82, y - 57, '#5e7567', 1);
      line(ctx, x + 82, y - 57, x + 68, y - 43, '#5e7567', 1);
      ellipse(ctx, x + 68, y - 43, 2, 2, '#405d55');
    }
  } else {
    box(ctx, x + 43, y - 18, 26, 17, '#354647');
    line(ctx, x + 44, y - 17, x + 66, y - 4, '#697565', 1);
    for (let i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.ellipse(x + 47 + i * 6, y - 27, 7, 4, 0, 0, TAU);
      ctx.strokeStyle = '#718a7d'; ctx.lineWidth = 1; ctx.stroke();
    }
  }
  if (working) {
    line(ctx, x - 58, y - 32, x - 40, y - 38, '#b9b796', 2);
    box(ctx, x - 62, y - 34, 7, 5, '#9a7856');
    ellipse(ctx, x - 37, y - 38, 1.2 + Math.max(0, Math.sin(t * 5)) * 1.2, 1.2, '#dec08b');
  }
}

function evacuationPacks(ctx, x, y, prepared, preparing, t) {
  if (!prepared && !preparing) return;
  const count = prepared ? 3 : 1;
  for (let i = 0; i < count; i++) {
    const px = x + i * 22, py = y - (i === 1 ? 3 : 0);
    roundRect(ctx, px - 13, py - 29, 25, 27, 4, ['#667a67','#8c8060','#687f80'][i], '#243b3d');
    line(ctx, px - 10, py - 14, px + 10, py - 14, '#bac1a0', 1.4);
    line(ctx, px, py - 27, px, py - 3, '#c0baa0', 2);
    ctx.beginPath(); ctx.arc(px, py - 29, 5, Math.PI, 0);
    ctx.strokeStyle = '#a9b696'; ctx.lineWidth = 2; ctx.stroke();
    box(ctx, px + 5, py - 23, 5, 7, '#d1ccb0');
  }
  if (prepared) {
    roundRect(ctx, x - 15, y - 48, 77, 15, 3, 'rgba(19,42,42,0.92)', '#779887');
    label(ctx, '대피 준비 완료', x + 24, y - 37, 8, '#bdd2b7', 'center', 500);
  } else {
    const offset = Math.sin(t * 3) * 2;
    box(ctx, x + 21, y - 9 + offset, 17, 7, '#bfb799');
    box(ctx, x + 27, y - 13 + offset, 8, 5, '#c8c9ae');
  }
}
function collector(ctx, x, y, built, t) {
  ellipse(ctx, x, y + 1, 38, 5, 'rgba(4,13,21,0.3)');
  if (built) {
    box(ctx, x - 28, y - 66, 55, 61, '#415f64');
    ellipse(ctx, x, y - 66, 28, 7, '#668381');
    ellipse(ctx, x, y - 66, 23, 4, '#273e48');
    ellipse(ctx, x, y - 5, 28, 5, '#354e54');
    line(ctx, x - 28, y - 51, x + 27, y - 51, '#78938b', 3);
    line(ctx, x - 28, y - 19, x + 27, y - 19, '#78938b', 3);
    line(ctx, x + 2, y - 72, x + 2, y - 104, '#9ba897', 5);
    polygon(ctx, [[x - 39,y - 107],[x + 45,y - 107],[x + 5,y - 79]], '#718e88', '#243b45');
    line(ctx, x - 39, y - 107, x + 45, y - 107, '#b0b5a0', 2);
    const drop = (t * 38) % 26;
    ellipse(ctx, x + 3, y - 77 + drop, 1.2, 2, 'rgba(158,196,198,0.65)');
    box(ctx, x + 26, y - 21, 10, 4, '#89a292');
  } else {
    box(ctx, x - 21, y - 26, 42, 22, '#4b6365');
    ellipse(ctx, x, y - 26, 21, 5, '#899b8f');
    ellipse(ctx, x, y - 26, 17, 3, '#263e49');
    line(ctx, x - 18, y - 26, x - 12, y - 47, '#78918a', 1.3);
    line(ctx, x + 18, y - 26, x + 12, y - 47, '#78918a', 1.3);
    line(ctx, x - 12, y - 47, x + 12, y - 47, '#78918a', 1.3);
    box(ctx, x + 27, y - 39, 12, 34, '#5d766d');
    box(ctx, x + 30, y - 44, 6, 6, '#9a9d82');
  }
}
function heater(ctx, x, y, built, t, burning) {
  if (!built) {
    ellipse(ctx, x, y, 26, 5, '#1e3037');
    box(ctx, x - 20, y - 19, 40, 14, '#454c45');
    line(ctx, x - 25, y - 5, x + 22, y - 17, '#766e58', 4);
    line(ctx, x - 21, y - 17, x + 19, y - 5, '#5e6453', 4);
    return;
  }
  line(ctx, x + 18, y - 65, x + 18, y - 137, '#596461', 13);
  line(ctx, x + 20, y - 136, x + 60, y - 151, '#596461', 13);
  line(ctx, x + 11, y - 82, x + 24, y - 82, '#859083', 3);
  roundRect(ctx, x - 26, y - 66, 56, 57, 5, '#455650', '#182c32');
  box(ctx, x - 19, y - 58, 42, 8, '#748576');
  box(ctx, x - 20, y - 45, 43, 27, '#172d33');
  for (let i = 0; i < 5; i++) line(ctx, x - 16 + i * 8, y - 44, x - 16 + i * 8, y - 19, '#576d60', 2);
  box(ctx, x - 21, y - 9, 5, 9, '#243a3c'); box(ctx, x + 18, y - 9, 5, 9, '#243a3c');
  if (burning) {
    light(ctx, x, y - 29, 120, 0.27);
    for (let i = 0; i < 4; i++) {
      const h = 10 + Math.sin(t * 6 + i * 2.7) * 4;
      polygon(ctx, [[x - 14 + i * 8,y - 21],[x - 10 + i * 8,y - 21 - h],[x - 6 + i * 8,y - 21]], i % 2 ? '#e4a059' : '#c77d43');
    }
  }
}
function door(ctx, x, y, barricade = 0, visitor = false, integrity = 100) {
  const health = clamp(Number.isFinite(integrity) ? integrity : 100, 0, 100);
  const wear = 1 - health / 100;
  box(ctx, x - 29, y - 99, 54, 99, '#0e1d27');
  box(ctx, x - 22, y - 94, 42, 93, health < 35 ? '#3b4541' : '#4c574e');
  for (let i = 0; i < 4; i++) line(ctx, x - 19 + i * 11, y - 91, x - 19 + i * 11, y - 4, '#35443f', 2);
  box(ctx, x + 8, y - 48, 5, 9, '#a2926b');
  box(ctx, x - 34, y - 104, 65, 8, '#697064');
  line(ctx, x - 33, y - 99, x - 33, y, '#52615c', 4);
  if (wear > 0.12) {
    for (let i = 0; i < Math.ceil(wear * 8); i++) {
      const px = x - 18 + hash(82 + i) * 34, py = y - 86 + hash(44 + i) * 65;
      line(ctx, px, py, px - 4, py + 7, '#172930', 1.6);
      line(ctx, px - 4, py + 7, px + 2, py + 16, '#172930', 1.4);
      line(ctx, px + 1, py, px - 2, py + 7, '#7b7964', 0.7);
    }
  }
  if (health < 40) {
    polygon(ctx, [[x - 19,y - 40],[x - 7,y - 47],[x - 10,y - 29],[x - 4,y - 25],[x - 13,y - 5],[x - 21,y - 8]], '#0b1b24');
    line(ctx, x - 33, y - 44, x - 37, y - 6, '#667064', 3);
    line(ctx, x - 35, y + 5, x - 7, y + 8, '#726b53', 3);
    line(ctx, x + 10, y + 5, x + 34, y + 2, '#5b604f', 2);
  }
  if (barricade) {
    const boards = [-60, -32, -82, -15].slice(0, clamp(Math.floor(barricade) + 1, 2, 4));
    boards.forEach((offset, i) => {
      ctx.save(); ctx.translate(x, y + offset); ctx.rotate(i % 2 ? 0.18 : -0.19);
      const color = i % 2 ? '#887d5f' : '#9c8661';
      if (health < 42 && i % 2 === 0) {
        polygon(ctx, [[-32,0],[-6,0],[-1,4],[-8,6],[-3,10],[-32,10]], color);
        polygon(ctx, [[9,0],[33,0],[33,10],[6,10],[11,5],[5,3]], color);
      } else box(ctx, -32, 0, 65, 10, color);
      line(ctx, -28, 5, health < 42 && i % 2 === 0 ? -9 : 29, 5, '#5e5e48', 1);
      ellipse(ctx, -26, 4, 1.2, 1.2, '#3a4a45'); ellipse(ctx, 27, 5, 1.2, 1.2, '#3a4a45');
      ctx.restore();
    });
  }
  if (visitor) light(ctx, x - 40, y - 45, 55, 0.12);
  label(ctx, 'LAST LIGHT', x, y - 113, 7.5, '#7b918e', 'center', 700);
  if (health < 100) {
    roundRect(ctx, x - 25, y - 109, 50, 3, 1.5, '#14262e');
    if (health > 0) roundRect(ctx, x - 25, y - 109, Math.max(1, health * 0.5), 3, 1.5, health < 35 ? '#cd8d72' : '#b2aa7b');
  }
}
function trap(ctx, x, y, built) {
  if (!built) return;
  box(ctx, x - 25, y - 25, 50, 24, '#3d524d');
  for (let i = 0; i < 8; i++) line(ctx, x - 22 + i * 6, y - 23, x - 22 + i * 6, y - 2, '#89987c', 1);
  line(ctx, x - 25, y - 25, x + 25, y - 25, '#a3a285', 2);
  line(ctx, x - 25, y - 2, x + 25, y - 2, '#a3a285', 2);
}

function groundAndForeground(ctx, cold = false) {
  box(ctx, 0, 620, WORLD_W, 100, '#10212b');
  const g = ctx.createLinearGradient(0, 621, 0, 720);
  g.addColorStop(0, '#2a3c42'); g.addColorStop(1, '#111d26');
  box(ctx, 0, 621, WORLD_W, 99, g);
  line(ctx, 0, 623, WORLD_W, 623, cold ? '#98aaa5' : '#61716d', cold ? 3 : 1);
  for (let i = 0; i < 13; i++) {
    const x = hash(921 + i) * WORLD_W, y = 635 + hash(i + 77) * 50;
    ellipse(ctx, x, y, 15 + hash(i) * 58, 2 + hash(i + 20) * 4, 'rgba(100,127,134,0.12)');
  }
  // Small plants and wires on the edge of the street frame the stage.
  for (let i = 0; i < 13; i++) {
    const x = 40 + hash(i + 432) * 1180;
    const y = 650 + hash(i + 101) * 65;
    const h = 5 + hash(i) * 12;
    line(ctx, x, y, x - 2, y - h, '#14272e', 1.3);
    line(ctx, x - 2, y - h * 0.3, x + 5, y - h * 0.7, '#14272e', 1.1);
  }
  const vignette = ctx.createRadialGradient(640, 350, 250, 640, 350, 780);
  vignette.addColorStop(0, 'rgba(3,10,15,0)');
  vignette.addColorStop(0.75, 'rgba(3,10,15,0.1)');
  vignette.addColorStop(1, 'rgba(3,10,15,0.65)');
  box(ctx, 0, 0, WORLD_W, WORLD_H, vignette);
}

function groundRipples(ctx, t) {
  ctx.strokeStyle = 'rgba(153,178,179,0.10)'; ctx.lineWidth = 0.6;
  ctx.beginPath();
  for (let i = 0; i < 9; i++) {
    const x = hash(921 + i) * WORLD_W, y = 635 + hash(i + 77) * 50;
    const r = ((t * 10 + i * 13) % 25) + 1;
    ctx.moveTo(x + r, y); ctx.ellipse(x, y, r, r * 0.18, 0, 0, TAU);
  }
  ctx.stroke();
}

function human(ctx, person, pose, t, selected = false, npc = false) {
  const x = pose.x, y = pose.y;
  const walking = pose.walking || false;
  const working = pose.working || false;
  const sleeping = pose.sleeping || false;
  const hidden = pose.hidden || false;
  const facing = pose.facing || 1;
  const dodging = Boolean(pose.dodging);
  const anticipating = Boolean(pose.windup);
  const color = person.color || (npc ? person.kind === 'guard' ? '#77877b' : '#8a8474' : '#b5b8a3');
  ctx.save();
  ctx.globalAlpha = hidden ? 0.42 : 1;
  if (selected) {
    ellipse(ctx, x, y + 1, 20, 5.5, 'rgba(231,180,105,0.14)');
    ctx.strokeStyle = 'rgba(240,199,130,0.82)'; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.ellipse(x, y + 1, 19, 5, 0, 0, TAU); ctx.stroke();
  } else ellipse(ctx, x, y + 2, 14, 4, 'rgba(0,10,16,0.28)');
  if (sleeping) {
    roundRect(ctx, x - 26, y - 31, 43, 12, 5, color);
    ellipse(ctx, x - 31, y - 29, 6, 6.5, '#aaa48d');
    line(ctx, x + 13, y - 26, x + 29, y - 25, '#26373b', 7);
    if (selected) label(ctx, 'z', x - 22 + Math.sin(t) * 2, y - 48 - Math.sin(t * 0.8) * 3, 12, '#b6c8ba', 'center', 400);
    ctx.restore(); return;
  }
  const stride = dodging ? 0.8 * facing : walking ? Math.sin(t * 7.4 + x * 0.015) : 0;
  const bob = walking ? Math.abs(Math.sin(t * 7.4 + x * 0.015)) * 1.2 : Math.sin(t * 1.5 + x) * 0.4;
  const crouch = dodging ? 10 : pose.preparing ? 12 : hidden || pose.sneak ? 8 : 0;
  ctx.translate(x, y + bob);
  if (dodging) ctx.transform(1, 0, -facing * 0.32, 0.78, 0, 0);
  // Dark rim behind limbs makes each person readable against plaster.
  ctx.lineCap = 'round';
  const hipY = -23 + crouch;
  line(ctx, -3, hipY, -5 - stride * 7, -2, '#182931', 6);
  line(ctx, 4, hipY, 5 + stride * 7, -2, '#182931', 6);
  line(ctx, -3, hipY, -5 - stride * 7, -2, '#3b4b4b', 4);
  line(ctx, 4, hipY, 5 + stride * 7, -2, '#324547', 4.2);
  line(ctx, -5 - stride * 7, -1, -1 - stride * 7 + facing * 3, -1, '#0c1b24', 4);
  line(ctx, 5 + stride * 7, -1, 9 + stride * 7 + facing * 3, -1, '#0c1b24', 4);
  polygon(ctx, [[-7,-43 + crouch],[5,-44 + crouch],[9,-23 + crouch],[-9,-23 + crouch]], color, '#172a32', 1.5);
  line(ctx, -4, -39 + crouch, -3, -26 + crouch, 'rgba(227,226,191,0.17)', 2);
  // Backpack, scarf, neck and face have different silhouettes.
  if (pose.backpack || npc && person.kind === 'guard') {
    roundRect(ctx, -12 * facing - 3, -39 + crouch, 7, 17, 3, '#5d6b59', '#1b3037');
  }
  line(ctx, 0, -44 + crouch, 0, -48 + crouch, '#a09a84', 5);
  ellipse(ctx, facing * 0.9, -53 + crouch, 6.3, 7, '#b1aa90');
  ctx.beginPath(); ctx.arc(facing * 0.9, -55 + crouch, 6.5, Math.PI, Math.PI * 2.1);
  ctx.fillStyle = person.id === 'mira' ? '#3b3d37' : '#353e38'; ctx.fill();
  if (person.id === 'mira') ellipse(ctx, -6 * facing, -50 + crouch, 3.3, 5.5, '#2b3938');
  if (npc && person.kind === 'guard') {
    ellipse(ctx, 1, -56 + crouch, 8, 5, '#485b52');
    line(ctx, -7, -53 + crouch, 9, -53 + crouch, '#233e40', 2);
  }
  box(ctx, facing > 0 ? 5 : -7, -53 + crouch, 2, 3, '#b8b198');
  // A warm scarf is the small readable accent on each survivor.
  line(ctx, -5, -44 + crouch, 6, -44 + crouch, person.id === 'mira' ? '#b88d62' : '#83968a', 2.4);
  const arm = working ? Math.sin(t * 5.5) * 6 : stride * 7;
  if (anticipating) {
    line(ctx, 5 * facing, -39 + crouch, 10 * facing, -46 + crouch, color, 5);
    line(ctx, 10 * facing, -46 + crouch, 2 * facing, -56 + crouch, '#aaa88e', 3);
    line(ctx, -6 * facing, -38 + crouch, 12 * facing, -32 + crouch, color, 4.2);
  } else if (working) {
    line(ctx, 5 * facing, -39 + crouch, 15 * facing, -29 + crouch - arm * 0.35, color, 5);
    line(ctx, 15 * facing, -29 + crouch - arm * 0.35, 19 * facing, -33 + crouch - arm, '#aaa88e', 3);
    if (pose.repairing) {
      const hx = 20 * facing, hy = -33 + crouch - arm;
      line(ctx, hx, hy + 2, hx + facing * 3, hy - 10, '#8c7858', 2.3);
      line(ctx, hx - facing * 2, hy - 11, hx + facing * 8, hy - 11, '#a6aea0', 4.5);
      if (Math.sin(t * 5.5) > 0.6) {
        for (let i = 0; i < 3; i++) ellipse(ctx, hx + facing * (5 + i * 3), hy - 8 + i * 4, 0.8, 0.8, '#c4b58c');
      }
    } else if (pose.tuning) {
      roundRect(ctx, 17 * facing - 3, -39 + crouch - arm * 0.3, 6, 10, 2, '#425f5a', '#a5b391');
    }
  } else {
    line(ctx, -6, -39 + crouch, -9 + arm, -24 + crouch, color, 4.4);
    line(ctx, 6, -39 + crouch, 9 - arm, -24 + crouch, color, 4.4);
    ellipse(ctx, 9 - arm, -22 + crouch, 2, 2.5, '#aaa48c');
  }
  if (pose.weapon && !hidden) {
    if (anticipating) {
      line(ctx, 2 * facing, -56 + crouch, -4 * facing, -70 + crouch, '#bdc1a8', 2);
      line(ctx, 2 * facing, -56 + crouch, 0, -61 + crouch, '#3a3e32', 4);
    } else {
      line(ctx, 12 * facing, -31 + crouch, 27 * facing, -29 + crouch, '#a8b1a1', 2);
      line(ctx, 10 * facing, -31 + crouch, 14 * facing, -31 + crouch, '#3a3e32', 4);
    }
  }
  ctx.restore();
}

function dodgeGhost(ctx, point, person, alpha) {
  ctx.save(); ctx.globalAlpha = alpha;
  const { x, y, direction } = point;
  polygon(ctx, [[x + direction * 8,y - 38],[x + direction * 20,y - 35],[x + direction * 8,y - 18],[x - direction * 3,y - 21]], person.color || '#a4b6a7');
  ellipse(ctx, x + direction * 19, y - 43, 5, 5.5, '#b5c8bd');
  line(ctx, x, y - 18, x - direction * 13, y - 3, '#7e9992', 4);
  line(ctx, x + direction * 7, y - 19, x + direction * 13, y - 3, '#9bb1a2', 3);
  line(ctx, x - direction * 18, y - 29, x - direction * 4, y - 29, '#b4c4b0', 1);
  ctx.restore();
}

function nightStructure(ctx, exp) {
  const id = exp.locationId || 'cottage';
  const seed = [...id].reduce((n, ch) => n + ch.charCodeAt(0), 0);
  const isClinic = id === 'clinic', isGarage = id === 'garage', isWarehouse = id === 'warehouse';
  const wall = isClinic ? '#354448' : isGarage ? '#2d3e41' : isWarehouse ? '#26363d' : '#303c42';
  polygon(ctx, [[155,600],[155,71],[440,71],[454,49],[658,59],[658,78],[1095,78],[1135,107],[1135,613]], '#182730', '#0e1d27', 6);
  for (let f = 0; f < 3; f++) {
    const y = exp.floors?.[f] ?? FLOORS[f], top = y - 167;
    box(ctx, 169, top, 947, 167, wall);
    wallTexture(ctx, 170, top, 944, 164, seed + f);
    for (let i = 0; i < 3; i++) {
      const x = 224 + i * 340;
      if (isWarehouse) {
        box(ctx, x, top + 17, 134, 48, '#1a303b');
        for (let j = 0; j < 4; j++) line(ctx, x + 12 + j * 31, top + 18, x + 12 + j * 31, top + 65, '#455756', 3);
        line(ctx, x, top + 41, x + 134, top + 41, '#4a5b56', 2);
      } else windowFrame(ctx, x, top + 22, 73, 77, i === 1 || f === 2);
    }
    box(ctx, 149, y, 990, 18, '#15262f');
    box(ctx, 150, y, 989, 4, '#596961');
    for (let i = 0; i < 26; i++) line(ctx, 171 + i * 36, y + 7, 192 + i * 36, y + 10, '#2d4143', 1);
    // Empty domestic traces sit away from the interaction objects.
    if (f === 1 && !isWarehouse) {
      box(ctx, 692, y - 28, 41, 5, '#5b675b');
      box(ctx, 695, y - 23, 3, 23, '#3d514e');
      box(ctx, 726, y - 23, 3, 23, '#3d514e');
    }
    if (isClinic) {
      for (let i = 0; i < 23; i++) {
        box(ctx, 175 + i * 41, y - 74, 39, 32, '#405650');
        box(ctx, 175 + i * 41, y - 40, 39, 32, '#3b514d');
      }
      box(ctx, 498, top + 31, 45, 48, '#6d7e70');
      box(ctx, 517, top + 41, 7, 27, '#354b4c');
      box(ctx, 507, top + 51, 27, 7, '#354b4c');
    }
  }
  for (const x of [154, 1117]) {
    box(ctx, x, 78, 18, 536, '#1a2c34'); line(ctx, x + 18, 81, x + 18, 600, '#4b605b', 1.5);
  }
  if (isGarage) {
    box(ctx, 919, 469, 154, 8, '#526457');
    for (let i = 0; i < 5; i++) {
      ellipse(ctx, 942 + i * 25, 507, 12, 17, '#142a33');
      ellipse(ctx, 942 + i * 25, 507, 5, 9, '#2b4247');
    }
    line(ctx, 182, 435, 1080, 435, '#536a60', 4);
    label(ctx, 'AUTO / SERVICE', 535, 464, 14, '#667b6c', 'center', 700);
  }
  if (isWarehouse) {
    for (let i = 0; i < 4; i++) {
      const x = 200 + i * 270;
      line(ctx, x, 81, x, 599, '#3d5352', 6);
      line(ctx, x - 3, 81, x - 3, 599, '#1b2f38', 2);
    }
    line(ctx, 160, 83, 1118, 83, '#53645b', 5);
    for (let i = 0; i < 7; i++) line(ctx, 175 + i * 144, 84, 247 + i * 144, 54, '#293f47', 4);
  }
  // Exterior exit remains outside the cutaway, at floor zero.
  box(ctx, 79, 534, 48, 65, '#172d38');
  line(ctx, 79, 534, 79, 600, '#708c7e', 3);
  line(ctx, 79, 534, 126, 534, '#708c7e', 3);
  box(ctx, 82, 537, 42, 61, '#304b4d');
  label(ctx, '←', 103, 574, 27, '#9cba9c', 'center', 400);
  label(ctx, '귀환', 102, 525, 10, '#94b6a3', 'center', 600);
}

function lootObject(ctx, loot, y, active, near, t, kind) {
  const x = loot.x;
  const hasItems = Object.values(loot.items || {}).some(n => Number(n) > 0);
  const owned = loot.owned;
  const searched = loot.searched;
  const alpha = searched && !hasItems ? 0.45 : 1;
  ctx.save(); ctx.globalAlpha = alpha;
  ellipse(ctx, x, y + 1, 28, 5, 'rgba(4,13,20,0.35)');
  if (kind === 'clinic' || /약|의료|캐비닛|보관함/.test(loot.label || '')) {
    box(ctx, x - 24, y - 70, 46, 67, '#63746a');
    box(ctx, x - 20, y - 66, 38, 28, '#3d5554');
    line(ctx, x - 21, y - 36, x + 20, y - 36, '#9da68b', 1);
    box(ctx, x - 4, y - 58, 6, 20, '#adada0');
    box(ctx, x - 11, y - 51, 20, 6, '#adada0');
    box(ctx, x + 11, y - 25, 3, 10, '#283d40');
  } else if (/냉장|식량|주방|식료/.test(loot.label || '')) {
    roundRect(ctx, x - 25, y - 73, 48, 70, 4, '#7b8370', '#2c4246');
    line(ctx, x - 23, y - 48, x + 21, y - 48, '#465b54', 2);
    line(ctx, x + 12, y - 65, x + 12, y - 55, '#a1a98d', 3);
    line(ctx, x + 12, y - 40, x + 12, y - 21, '#a1a98d', 3);
  } else if (/옷|책|장식|서랍/.test(loot.label || '')) {
    box(ctx, x - 29, y - 57, 57, 53, '#6c6553');
    for (let i = 0; i < 3; i++) {
      box(ctx, x - 25, y - 52 + i * 15, 49, 13, '#515749');
      box(ctx, x - 3, y - 46 + i * 15, 7, 2, '#aca17b');
    }
  } else {
    box(ctx, x - 29, y - 42, 58, 37, '#6c6a52');
    polygon(ctx, [[x - 29,y - 42],[x - 18,y - 51],[x + 38,y - 51],[x + 29,y - 42]], '#8c8464');
    polygon(ctx, [[x + 29,y - 42],[x + 38,y - 51],[x + 38,y - 15],[x + 29,y - 5]], '#4e5c4d');
    line(ctx, x - 26, y - 10, x + 24, y - 37, '#9b9170', 4);
    line(ctx, x - 21, y - 39, x - 21, y - 7, '#404e47', 2);
    line(ctx, x + 20, y - 39, x + 20, y - 7, '#404e47', 2);
  }
  if (loot.locked) {
    roundRect(ctx, x - 5, y - 25, 10, 10, 2, '#b6a16d', '#333b2e');
    ctx.strokeStyle = '#b6a16d'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y - 27, 3.5, Math.PI, 0); ctx.stroke();
  }
  ctx.restore();
  if (hasItems || !searched) {
    const markY = y - (kind === 'clinic' ? 88 : 82);
    const color = owned ? '#d3a17b' : '#c4b886';
    if (active || near) light(ctx, x, y - 20, 90, active ? 0.18 : 0.10);
    ctx.save(); ctx.translate(x, markY + Math.sin(t * 1.8 + x) * 1.6);
    polygon(ctx, [[0,-5],[5,0],[0,5],[-5,0]], active ? color : 'rgba(189,190,161,0.15)', color, 1);
    ctx.restore();
    const text = (owned ? '사유 · ' : '') + (loot.locked ? '잠김 · ' : '') + (loot.label || '물자');
    label(ctx, text, x, markY - 12, 10.5, active || near ? '#e3d2ac' : '#a7b5ac', 'center', active ? 600 : 400);
  } else label(ctx, '비어 있음', x, y - 71, 9, '#687c7b');
}

function expeditionDoor(ctx, entry, y, highlighted) {
  const x = entry.x;
  const frameColor = highlighted ? '#b7b59a' : '#718079';
  // A full-height partition makes the door's line-of-sight role readable.
  box(ctx, x - 8, y - 167, 16, 52, '#283b41');
  line(ctx, x - 8, y - 166, x - 8, y - 113, '#5b6b65', 2);
  box(ctx, x - 25, y - 116, 50, 116, '#101e26');
  line(ctx, x - 25, y - 116, x + 25, y - 116, frameColor, 4);
  line(ctx, x - 24, y - 114, x - 24, y, frameColor, 3);
  line(ctx, x + 24, y - 114, x + 24, y, frameColor, 3);
  if (entry.open) {
    polygon(ctx, [[x - 20,y - 111],[x - 9,y - 100],[x - 9,y - 7],[x - 20,y - 2]], '#677367', '#8b9480', 1);
    line(ctx, x - 17, y - 105, x - 17, y - 10, '#32494a', 2);
    ellipse(ctx, x - 11, y - 47, 1.5, 2, '#c1b583');
    line(ctx, x - 13, y - 3, x + 19, y - 3, '#53645b', 2);
  } else {
    box(ctx, x - 20, y - 111, 40, 109, entry.locked ? '#655e4c' : '#59665d');
    box(ctx, x - 15, y - 105, 30, 39, '#48564f');
    box(ctx, x - 15, y - 61, 30, 50, '#4b5950');
    line(ctx, x - 18, y - 107, x - 18, y - 4, '#919581', 1);
    line(ctx, x + 10, y - 51, x + 16, y - 51, '#bdb38e', 3);
    if (entry.locked) {
      roundRect(ctx, x + 5, y - 52, 12, 13, 2, '#cfb274', '#464e42');
      ctx.beginPath(); ctx.arc(x + 11, y - 54, 4, Math.PI, 0);
      ctx.strokeStyle = '#d6ba80'; ctx.lineWidth = 2; ctx.stroke();
    }
  }
  label(ctx, entry.locked ? '잠긴 문' : entry.open ? '열린 문' : '닫힌 문', x, y - 127, 11,
    highlighted ? '#ead0a1' : entry.locked ? '#c3aa7e' : '#aabbb0', 'center', highlighted ? 600 : 500);
}

function clipToVisibility(ctx, segments, floors) {
  ctx.beginPath();
  for (const segment of segments) {
    const y = floors[segment.floor];
    if (!Number.isFinite(y)) continue;
    ctx.rect(segment.min, y - 170, Math.max(0, segment.max - segment.min), 187);
  }
  ctx.clip();
}

function explorationFog(ctx, floors, explored, visible) {
  const left = 145, right = 1185;
  for (let floor = 0; floor < floors.length; floor++) {
    const y = floors[floor], top = y - 169;
    const known = explored.filter(segment => segment.floor === floor);
    const current = visible.filter(segment => segment.floor === floor);
    const edges = [left, right];
    for (const segment of [...known, ...current]) edges.push(clamp(segment.min, left, right), clamp(segment.max, left, right));
    edges.sort((a, b) => a - b);
    for (let i = 0; i < edges.length - 1; i++) {
      const min = edges[i], max = edges[i + 1];
      if (max <= min) continue;
      const x = (min + max) / 2;
      const isVisible = inSegments(current, x, floor);
      const remembered = inSegments(known, x, floor);
      if (isVisible) continue;
      box(ctx, min, top, max - min + 0.5, 187,
        remembered ? 'rgba(6,18,28,0.64)' : 'rgba(5,14,23,0.96)');
    }
    // A narrow feather stays inside the real visible segment. No object beyond
    // a closed door is revealed by a decorative lighting gradient.
    for (const segment of current) {
      const min = Math.max(left, segment.min), max = Math.min(right, segment.max);
      const feather = Math.min(28, Math.max(0, (max - min) / 3));
      if (feather < 1) continue;
      const shadeLeft = ctx.createLinearGradient(min, 0, min + feather, 0);
      shadeLeft.addColorStop(0, 'rgba(8,21,30,0.42)'); shadeLeft.addColorStop(1, 'rgba(8,21,30,0)');
      box(ctx, min, top, feather, 187, shadeLeft);
      const shadeRight = ctx.createLinearGradient(max - feather, 0, max, 0);
      shadeRight.addColorStop(0, 'rgba(8,21,30,0)'); shadeRight.addColorStop(1, 'rgba(8,21,30,0.42)');
      box(ctx, max - feather, top, feather, 187, shadeRight);
    }
  }
}

function rememberedMarker(ctx, entry, y, type, hovered) {
  const color = hovered ? '#b5c7b9' : '#7e9492';
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 1;
  ctx.setLineDash([3, 4]);
  if (type === 'door') ctx.strokeRect(entry.x - 15, y - 106, 30, 104);
  else ctx.strokeRect(entry.x - 24, y - 39, 48, 35);
  ctx.setLineDash([]);
  const markerY = y - (type === 'door' ? 119 : 53);
  polygon(ctx, [[entry.x,markerY - 4],[entry.x + 4,markerY],[entry.x,markerY + 4],[entry.x - 4,markerY]], '#243a42', color);
  label(ctx, type === 'door' ? '기억한 문' : type === 'hide' ? '기억한 은신처' : entry.label || '기억한 물자', entry.x, markerY - 12, 10, color);
  ctx.restore();
}

export function createRenderer(canvas) {
  if (!canvas || typeof canvas.getContext !== 'function') throw new TypeError('createRenderer requires a canvas element');
  const ctx = canvas.getContext('2d', { alpha: false });
  let size = { width: 1280, height: 720, ratio: 1, scale: 1, ox: 0, oy: 0 };
  let dirtySize = true, destroyed = false;
  let lastFrame = null, lastTime = null, hover = null, pointer = null, lastVisibility = null;
  let lastExpedition = null, dodgeTrail = [];
  let nightCache = null, nightCacheKey = '';
  let shelterCache = null, shelterCacheKey = '';
  let cacheRatio = 1;
  const poses = new Map();
  const textWidths = new Map();
  let targets = [];

  const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { dirtySize = true; }) : null;
  resizeObserver?.observe(canvas);
  const onResize = () => { dirtySize = true; };
  if (typeof window !== 'undefined') window.addEventListener('resize', onResize, { passive: true });

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width || canvas.clientWidth || 1280);
    const height = Math.max(1, rect.height || canvas.clientHeight || width * WORLD_H / WORLD_W);
    const ratio = clamp(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 1, 2.5);
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    const scale = Math.min(width / WORLD_W, height / WORLD_H);
    size = { width, height, ratio, scale, ox: (width - WORLD_W * scale) / 2, oy: (height - WORLD_H * scale) / 2 };
    // Size static surfaces for the display. A small phone should not retain a
    // desktop-size 1920×1080 bitmap simply to show a 350px-wide scene.
    const nextCacheRatio = clamp(Math.ceil(scale * ratio * 4) / 4, 0.5, 1.5);
    if (nextCacheRatio !== cacheRatio) {
      cacheRatio = nextCacheRatio;
      shelterCache = null; nightCache = null;
    }
    dirtySize = false;
  }
  function toWorld(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left - size.ox) / size.scale;
    const y = (clientY - rect.top - size.oy) / size.scale;
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > WORLD_W || y < 0 || y > WORLD_H) return null;
    return { x, y };
  }
  function onNavigationMap(p) {
    const panel = NAVIGATION_PANEL;
    return Boolean(p && lastFrame?.expedition && lastFrame.miniMap !== false && p.x >= panel.x && p.x <= panel.x + panel.w && p.y >= panel.y && p.y <= panel.y + panel.h);
  }
  function worldFloor(p) {
    if (!p || p.y > 633 || p.y < 42 || onNavigationMap(p)) return null;
    const floors = lastFrame?.expedition?.floors || FLOORS;
    let floor = 0, nearestSlab = Infinity;
    floors.forEach((y, i) => {
      if (p.y <= y + 19 && y < nearestSlab) { nearestSlab = y; floor = i; }
    });
    return floor;
  }
  function testWorld(p) {
    if (!p || !lastFrame || onNavigationMap(p)) return null;
    // People keep priority over their station. Overlapping loot follows paint
    // order, so a newly dropped object remains selectable above an older box.
    let chosen = null;
    for (const target of targets) {
      if (p.x < target.x1 || p.x > target.x2 || p.y < target.y1 || p.y > target.y2) continue;
      const priority = target.priority || 0;
      const previousPriority = chosen?.priority || 0;
      if (!chosen || priority > previousPriority || (priority === previousPriority && target.hit.type === 'loot' && chosen.hit.type === 'loot')) chosen = target;
    }
    if (chosen) return { ...chosen.hit };
    // A room belongs to the first floor slab below it, including its slab edge.
    // Nearest-center picking would send clicks near the ceiling upstairs.
    const floor = worldFloor(p);
    if (floor === null) return null;
    return { type: 'ground', x: clamp(p.x, 60, 1170), floor };
  }
  const onPointerMove = e => {
    pointer = toWorld(e.clientX, e.clientY);
    hover = testWorld(pointer);
    const cursor = lastFrame?.distractionAim && pointer ? 'crosshair' : hover && hover.type !== 'ground' ? 'pointer' : hover ? 'crosshair' : 'default';
    if (canvas.style.cursor !== cursor) canvas.style.cursor = cursor;
  };
  const onPointerLeave = () => { pointer = null; hover = null; canvas.style.cursor = 'default'; };
  canvas.addEventListener('pointermove', onPointerMove, { passive: true });
  canvas.addEventListener('pointerleave', onPointerLeave, { passive: true });

  function addHit(hit, x, y, halfW, h, priority = 1) {
    targets.push({ hit, x1: x - halfW, x2: x + halfW, y1: y - h, y2: y + 16, priority });
  }
  function textWidth(text, fontSize = 12, weight = 500) {
    const key = `${fontSize}|${weight}|${text}`;
    if (!textWidths.has(key)) {
      ctx.font = `${weight} ${fontSize}px ${FONT}`;
      if (textWidths.size > 256) textWidths.clear();
      textWidths.set(key, ctx.measureText(String(text)).width);
    }
    return textWidths.get(key);
  }
  function nameTag(person, pose, selected, text = person.name || person.id) {
    const fontSize = selected ? clamp(10 / size.scale, 12, 36) : 11;
    const padding = selected ? 8 : 5;
    const y = pose.y - (pose.sleeping ? 56 : 72);
    const width = textWidth(text, fontSize, selected ? 600 : 500) + padding * 2;
    roundRect(ctx, pose.x - width / 2, y - fontSize - 3, width, fontSize + 10, 4,
      selected ? 'rgba(11,25,33,0.94)' : 'rgba(12,27,35,0.62)',
      selected ? 'rgba(214,177,117,0.58)' : null);
    label(ctx, text, pose.x, y, fontSize, selected ? '#f4d6a2' : '#c2d0c5', 'center', selected ? 600 : 500);
    return y;
  }
  function windupCue(npc, y, exp, visible, rules) {
    const remaining = Math.max(0, Number(npc.windup || 0));
    if (!remaining) return;
    const total = Math.max(0.01, Number(rules.windup || 0.55));
    const progress = clamp(1 - remaining / total, 0, 1);
    // NPC strikes use a shorter, surrounding range than the player's weapon.
    // The engine's close-range awareness makes crossing behind an attacker
    // unsafe until the survivor is outside this radius or in the evade window.
    const reach = Number(rules.npcAttackReach || 61);
    let leftEdge = npc.x - reach, rightEdge = npc.x + reach;
    for (const entry of exp.doors || []) {
      if (entry.open || entry.floor !== npc.floor) continue;
      if (entry.x < npc.x) leftEdge = Math.max(leftEdge, entry.x);
      if (entry.x > npc.x) rightEdge = Math.min(rightEdge, entry.x);
    }
    const color = progress > 0.64 ? '#efaa84' : '#d7a77a';
    if (reach > 2) {
      ctx.save(); clipToVisibility(ctx, visible, exp.floors || FLOORS);
      ctx.beginPath(); ctx.rect(leftEdge, y - 169, Math.max(0, rightEdge - leftEdge), 187); ctx.clip();
      ellipse(ctx, npc.x, y - 28, reach, 33, `rgba(227,145,103,${0.07 + progress * 0.06})`);
      ctx.beginPath(); ctx.ellipse(npc.x, y - 28, reach, 33, 0, 0, TAU);
      ctx.strokeStyle = 'rgba(188,118,91,0.5)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(npc.x, y - 28, reach, 33, 0, -Math.PI / 2, -Math.PI / 2 + progress * TAU);
      ctx.strokeStyle = color; ctx.lineWidth = 2.6; ctx.stroke(); ctx.restore();
    }
    const fontSize = clamp(11 / size.scale, 13, 32);
    const text = `공격 ${remaining.toFixed(1)}`;
    const width = textWidth(text, fontSize, 600) + fontSize * 2.4;
    const left = clamp(npc.x - width / 2, 20, WORLD_W - width - 20);
    const baseline = y - 99;
    roundRect(ctx, left, baseline - fontSize - 5, width, fontSize + 12, 5, 'rgba(43,27,25,0.97)', '#bb8265');
    const cx = left + fontSize, cy = baseline - fontSize * 0.37, radius = fontSize * 0.45;
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, TAU); ctx.strokeStyle = '#77574b'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + progress * TAU);
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
    label(ctx, text, left + fontSize * 1.85, baseline, fontSize, '#f5c7a4', 'left', 600);
  }
  function conversationCue(npc, y, encounter) {
    const hovered = hover?.type === 'npc' && hover.id === npc.id;
    const radius = clamp(9 / size.scale, 12, 23);
    const x = npc.x + 31, cy = y - 82;
    const agreed = Boolean(encounter.permission?.area || encounter.permission?.loot);
    const available = encounter.resolved || encounter.options?.some(option => option.available);
    roundRect(ctx, x - radius, cy - radius * 0.74, radius * 2, radius * 1.48, radius * 0.35,
      hovered ? '#344e48' : 'rgba(15,37,42,0.97)', available ? '#9fb5a3' : '#627a75');
    polygon(ctx, [[x - radius * 0.6,cy + radius * 0.66],[x - radius * 0.55,cy + radius * 1.05],[x - radius * 0.12,cy + radius * 0.69]], '#1c393d', '#89a497', 0.8);
    if (agreed) {
      line(ctx, x - radius * 0.36, cy, x - radius * 0.08, cy + radius * 0.29, '#b9cda9', 1.8);
      line(ctx, x - radius * 0.08, cy + radius * 0.29, x + radius * 0.42, cy - radius * 0.28, '#b9cda9', 1.8);
    } else {
      for (let i = -1; i <= 1; i++) ellipse(ctx, x + i * radius * 0.4, cy, Math.max(1.1, radius * 0.08), Math.max(1.1, radius * 0.08), available ? '#bed0bb' : '#8b9e98');
    }
    addHit({ type: 'npc', id: npc.id, x: npc.x, floor: npc.floor }, npc.x, y, 20, 73, 3.1);
    targets.push({ hit: { type: 'npc', id: npc.id, x: npc.x, floor: npc.floor }, x1: x - radius - 4, x2: x + radius + 4, y1: cy - radius - 4, y2: cy + radius + 4, priority: 3.2 });
  }
  function staminaCue(player, y, rules) {
    const stamina = clamp(Number.isFinite(player.stamina) ? player.stamina : 100, 0, 100);
    const width = clamp(28 / size.scale, 52, 100), height = clamp(2.5 / size.scale, 3.5, 9);
    const left = player.x - width / 2, top = y + 10;
    const low = stamina < Number(rules.dodgeStamina || 28);
    const color = player.evade > 0 ? '#a4cecb' : low ? '#ca8d72' : '#b4bea2';
    roundRect(ctx, left - 2, top - 2, width + 4, height + 4, 2.5, 'rgba(8,22,29,0.92)', '#3d5758');
    if (stamina > 0) roundRect(ctx, left, top, Math.max(1, width * stamina / 100), height, 1.5, color);
    const threshold = left + width * Number(rules.dodgeStamina || 28) / 100;
    line(ctx, threshold, top, threshold, top + height, '#273f43', 1);
    if (Number(player.dodgeCooldown || 0) > 0) {
      const radius = Math.max(3, height * 0.85), x = left + width + radius + 5, cy = top + height / 2;
      const progress = clamp(1 - player.dodgeCooldown / Number(rules.dodgeCooldown || 2.4), 0, 1);
      ctx.beginPath(); ctx.arc(x, cy, radius, 0, TAU); ctx.strokeStyle = '#395454'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.beginPath(); ctx.arc(x, cy, radius, -Math.PI / 2, -Math.PI / 2 + progress * TAU);
      ctx.strokeStyle = '#b6a47b'; ctx.lineWidth = 1.7; ctx.stroke();
    }
  }
  function routeCue(player, visible, floors, t) {
    const target = player.target;
    if (!target || !inSegments(visible, target.x, target.floor)) return;
    const y = floors[target.floor];
    if (!Number.isFinite(y)) return;
    const arrived = player.floor === target.floor && !player.climb && Math.abs(player.x - target.x) < 8 && !player.route?.length;
    ctx.save(); ctx.strokeStyle = arrived ? 'rgba(170,198,179,0.55)' : '#a4bbaa'; ctx.lineWidth = 1.2;
    if (arrived) {
      ctx.beginPath(); ctx.ellipse(target.x, y + 1, 10, 3, 0, 0, TAU); ctx.stroke();
    } else {
      const bob = Math.sin(t * 3) * 1.5;
      line(ctx, target.x - 6, y - 9 + bob, target.x, y - 3 + bob, '#b7c7b4', 1.4);
      line(ctx, target.x, y - 3 + bob, target.x + 6, y - 9 + bob, '#b7c7b4', 1.4);
      ctx.beginPath(); ctx.ellipse(target.x, y + 1, 12, 3.5, 0, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }
  function updatePose(char, index, dt, t, restTarget) {
    const idle = IDLE[char.id] || { x: 290 + index * 160, floor: index % 3 };
    let p = poses.get(char.id);
    if (!p) { p = { x: idle.x, y: FLOORS[idle.floor], floor: idle.floor, facing: 1 }; poses.set(char.id, p); }
    const station = STATIONS.find(s => s.id === char.job?.target);
    const sleeping = char.job?.id === 'rest';
    const target = sleeping && restTarget ? restTarget : station ? { x: station.x, floor: station.floor } : idle;
    let goalX = target.x + (station && !sleeping ? (char.id === 'yun' ? -30 : 34) : 0);
    let goalY = FLOORS[target.floor];
    const arriving = Math.abs(p.x - goalX) < 3 && Math.abs(p.y - goalY) < 3;
    const maxMove = 72 * dt;
    if (p.floor !== target.floor) {
      const up = target.floor > p.floor;
      const s = DAY_STAIRS.find(s => up ? s.from === p.floor : s.to === p.floor);
      if (s) {
        const stairX = s.x;
        if (Math.abs(p.x - stairX) > 3 && !p.onStairs) {
          p.facing = stairX > p.x ? 1 : -1;
          p.x += clamp(stairX - p.x, -maxMove, maxMove);
        } else {
          p.onStairs = true;
          const nextFloor = up ? s.to : s.from;
          p.y += clamp(FLOORS[nextFloor] - p.y, -maxMove * 1.4, maxMove * 1.4);
          p.x = stairX + Math.sin((p.y / 190) * Math.PI) * 6;
          if (Math.abs(p.y - FLOORS[nextFloor]) < 2) { p.y = FLOORS[nextFloor]; p.floor = nextFloor; p.onStairs = false; }
        }
      } else { p.floor = target.floor; p.y = goalY; }
    } else {
      p.onStairs = false;
      const delta = goalX - p.x;
      if (Math.abs(delta) > 2) p.facing = delta > 0 ? 1 : -1;
      p.x += clamp(delta, -maxMove, maxMove);
      p.y += clamp(goalY - p.y, -maxMove, maxMove);
    }
    p.walking = !arriving;
    p.working = Boolean(char.job) && arriving && !sleeping;
    p.sleeping = sleeping && arriving;
    p.repairing = ['repairShelter', 'buildRadio'].includes(char.job?.id) && arriving;
    p.tuning = char.job?.id === 'contactRelief' && arriving;
    p.preparing = char.job?.id === 'prepareEvacuation' && arriving;
    if (p.working && station) p.facing = station.x >= p.x ? 1 : -1;
    p.backpack = false;
    return p;
  }
  function stationLabel(station, state, t) {
    const hovered = hover?.type === 'facility' && hover.id === station.id;
    const working = (state.characters || []).some(c => c.alive !== false && c.job?.target === station.id);
    const labelY = FLOORS[station.floor] - (station.id === 'water' && state.facilities?.collector ? 132 : station.id === 'rubble' ? 65 : station.id === 'bed' ? 71 : station.id === 'heater' ? 92 : station.id === 'door' ? 135 : 112);
    let name = station.label;
    if (station.id === 'kitchen' && Number(state.facilities?.stove) > 1) name = '개량 조리대';
    if (station.id === 'water' && !state.facilities?.collector) name = '물 확보';
    if (station.id === 'rubble' && Number(state.cleared) >= 4) name = '정리된 공간';
    if (station.id === 'door' && Number(state.shelterIntegrity ?? 100) < 35) name = '출입문 · 파손';
    if (station.id === 'radio' && state.facilities?.radio) name = state.relief?.contacted ? '구호 연락망' : '복구한 무전기';
    const width = textWidth(name, 11, 500) + 27;
    roundRect(ctx, station.x - width / 2, labelY - 17, width, 23, 5,
      hovered ? 'rgba(205,166,108,0.16)' : 'rgba(12,26,34,0.62)',
      hovered ? 'rgba(210,177,120,0.65)' : 'rgba(140,164,155,0.18)');
    label(ctx, name, station.x + 3, labelY - 1, 11, hovered ? '#f1d4a1' : working ? '#d4c597' : '#a9b8ad', 'center', hovered ? 600 : 400);
    ellipse(ctx, station.x - width / 2 + 9, labelY - 5, 2, 2, working ? '#dfb778' : '#819b8c');
    addHit({ type: 'facility', id: station.id, x: station.x, floor: station.floor }, station.x, FLOORS[station.floor], station.radius, 110, 2);
    targets.push({ hit: { type: 'facility', id: station.id, x: station.x, floor: station.floor }, x1: station.x - width / 2, x2: station.x + width / 2, y1: labelY - 17, y2: labelY + 6, priority: 2 });
  }
  function drawDay(state, t, dt, selectedId) {
    const facilities = state.facilities || {};
    const cold = state.day >= 4 && state.day <= 8;
    const dusk = Number(state.clock || 360) > 1110;
    const key = `${cold}|${dusk}`;
    if (!shelterCache || shelterCacheKey !== key) {
      shelterCache = makeSurface(c => {
        skyStructure(c, false, dusk ? 1 : 0, cold);
        shelterStructure(c);
        groundAndForeground(c, cold);
      }, cacheRatio);
      shelterCacheKey = key;
    }
    ctx.drawImage(shelterCache, 0, 0, WORLD_W, WORLD_H);
    exteriorAtmosphere(ctx, t, cold, false);
    lamp(ctx, 385, 89, t, 0.9);
    lamp(ctx, 578, 273, t, 1.3);
    lamp(ctx, 987, 270, t, 0.7);
    lamp(ctx, 332, 459, t, 1.15);
    bed(ctx, 350, 220);
    if (Number(facilities.bed) > 1) {
      bed(ctx, 632, 220, true);
      addHit({ type: 'facility', id: 'bed', x: 632, floor: 2 }, 632, 220, 57, 66, 2);
    }
    if (Number(facilities.bed) > 2) {
      bed(ctx, 366, 410, true);
      addHit({ type: 'facility', id: 'bed', x: 366, floor: 1 }, 366, 410, 57, 66, 2);
    }
    const cooking = (state.characters || []).some(c => c.job?.target === 'kitchen');
    stove(ctx, 580, 410, facilities.stove, t, cooking);
    workbench(ctx, 330, 600, facilities.workshop);
    const radioWork = (state.characters || []).some(c => ['buildRadio','contactRelief'].includes(c.job?.id));
    radio(ctx, 980, 410, t, facilities.radio, state.relief, radioWork);
    collector(ctx, 980, 600, facilities.collector, t);
    heater(ctx, 700, 600, facilities.heater, t, Number(state.inventory?.fuel || 0) > 0);
    door(ctx, 120, 600, facilities.barricade, Boolean(state.visitor), Number(state.shelterIntegrity ?? 100));
    evacuationPacks(ctx, 191, 600, state.relief?.prepared, (state.characters || []).some(c => c.job?.id === 'prepareEvacuation'), t);
    trap(ctx, 500, 600, facilities.trap);
    rubble(ctx, 940, 220, Math.max(0.12, 1 - Number(state.cleared || 0) / 4), 90);
    // Left-behind bottles and stacked wood make the rooms inhabited.
    for (let i = 0; i < Math.min(5, Math.ceil(Number(state.inventory?.wood || 0) / 5)); i++) {
      line(ctx, 1041 - i * 3, 595 - i * 5, 1091 - i * 2, 595 - i * 5, '#7d7b60', 4);
    }
    if (state.visitor) {
      human(ctx, { id: 'visitor', color: '#7a8273' }, { x: 62, y: 600, facing: 1 }, t);
      const sy = 514 + Math.sin(t * 2) * 2;
      roundRect(ctx, 46, sy - 20, 32, 24, 6, '#bfa06b');
      label(ctx, '···', 62, sy - 6, 15, '#172934', 'center', 700);
      addHit({ type: 'facility', id: 'door', x: 120, floor: 0 }, 67, 600, 33, 95, 2);
    }
    for (const station of STATIONS) stationLabel(station, state, t);
    const alive = (state.characters || []).filter(c => c.alive !== false && c.available !== false && c.availability !== 'away');
    const sleepers = alive.filter(c => c.job?.id === 'rest');
    const bedSlots = [{ x: 350, floor: 2 }, { x: 632, floor: 2 }, { x: 366, floor: 1 }]
      .slice(0, clamp(Number(facilities.bed || 1), 1, 3));
    alive.forEach((c, i) => {
      const restIndex = sleepers.findIndex(person => person.id === c.id);
      const restTarget = restIndex >= 0 ? bedSlots[restIndex % bedSlots.length] : null;
      const p = updatePose(c, i, dt, t, restTarget);
      const selected = c.id === selectedId;
      human(ctx, c, p, t, selected);
      const nameY = nameTag(c, p, selected);
      if (c.job && !p.walking) {
        const progress = clamp(1 - Number(c.job.remaining || 0) / Math.max(1, Number(c.job.total || 1)), 0, 1);
        roundRect(ctx, p.x - 18, nameY + 7, 36, 3, 1.5, 'rgba(0,12,20,0.65)');
        if (progress > 0) roundRect(ctx, p.x - 18, nameY + 7, Math.max(1, 36 * progress), 3, 1.5, '#c5ae7e');
      }
      if (Number(c.health) < 45 || Number(c.illness) > 55) {
        ellipse(ctx, p.x + 15, nameY - 3, 3, 3, '#da8e73');
      }
      addHit({ type: 'character', id: c.id, x: p.x, floor: p.floor }, p.x, p.y, 17, 82, 3);
      if (selected) {
        const fontSize = clamp(10 / size.scale, 12, 36);
        const width = textWidth(c.name || c.id, fontSize, 600) + 16;
        targets.push({ hit: { type: 'character', id: c.id, x: p.x, floor: p.floor }, x1: p.x - width / 2, x2: p.x + width / 2, y1: nameY - fontSize - 3, y2: nameY + 7, priority: 3 });
      }
    });
    // Slowly drifting dust in the warm rooms.
    ctx.save();
    for (let i = 0; i < 12; i++) {
      const x = 280 + hash(i + 65) * 770 + Math.sin(t * 0.3 + i) * 13;
      const y = 100 + hash(i + 80) * 440 + Math.cos(t * 0.25 + i) * 7;
      ellipse(ctx, x, y, 0.7, 0.7, 'rgba(227,210,167,0.21)');
    }
    ctx.restore();
  }
  function distractionPulse(exp, visible, floors, reducedMotion) {
    const sound = exp.distraction;
    if (!sound || !(sound.remaining > 0) || !inSegments(visible, sound.x, sound.floor)) return;
    const y = floors[sound.floor];
    if (!Number.isFinite(y)) return;
    const progress = clamp(1 - sound.remaining / Math.max(0.01, sound.total || 2.5), 0, 1);
    ctx.save(); clipToVisibility(ctx, visible, floors);
    const radii = reducedMotion ? [31, 51] : [13 + progress * 86, 8 + ((progress + 0.45) % 1) * 86];
    ctx.strokeStyle = `rgba(175,207,186,${0.38 * (1 - progress * 0.65)})`; ctx.lineWidth = 1.5;
    for (const radius of radii) {
      ctx.beginPath(); ctx.ellipse(sound.x, y - 12, radius, radius * 0.34, 0, 0, TAU); ctx.stroke();
    }
    line(ctx, sound.x - 4, y - 4, sound.x + 3, y - 6, '#c0c4a3', 2.5);
    box(ctx, sound.x + 6, y - 4, 3, 2, '#a3b39b');
    ctx.restore();
  }
  function distractionAimCue(exp, visible, floors, options) {
    if (!options.distractionAim) return;
    const pointerFloor = worldFloor(pointer);
    const candidate = options.aimTarget || (pointer && pointerFloor !== null ? { x: pointer.x, floor: pointerFloor } : null);
    const aim = getDistraction(exp, candidate?.x, candidate?.floor ?? exp.player.floor);
    const target = aim.target;
    const player = exp.player, y = floors[player.floor];
    const currentFloor = target?.floor === player.floor && Number.isFinite(target.x) && inSegments(visible, target.x, target.floor);
    const color = aim.available ? '#b8d4ae' : '#d6a087';
    ctx.save(); clipToVisibility(ctx, visible, floors);
    // The throwing band and arc end at current sight; even an invalid pointer
    // never exposes a marker or geometry on another floor or beyond a door.
    for (const direction of [-1, 1]) {
      const near = player.x + direction * (aim.minRange || 60), far = player.x + direction * (aim.range || 260);
      line(ctx, near, y - 3, far, y - 3, 'rgba(173,201,168,0.3)', 5);
      line(ctx, near, y - 6, near, y + 1, '#8cae94', 1.5);
    }
    if (currentFloor) {
      const dx = target.x - player.x;
      ctx.beginPath(); ctx.moveTo(player.x, y - 33);
      ctx.quadraticCurveTo(player.x + dx * 0.5, y - 75 - Math.min(70, Math.abs(dx) * 0.12), target.x, y - 4);
      ctx.setLineDash([5, 5]); ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.ellipse(target.x, y - 3, 13, 5, 0, 0, TAU); ctx.stroke();
      if (!aim.available) {
        line(ctx, target.x - 5, y - 10, target.x + 5, y - 20, color, 2);
        line(ctx, target.x + 5, y - 10, target.x - 5, y - 20, color, 2);
      } else {
        line(ctx, target.x - 7, y - 18, target.x, y - 10, color, 2);
        line(ctx, target.x, y - 10, target.x + 7, y - 18, color, 2);
      }
    }
    ctx.restore();
    const title = '유인 위치 선택 · 취소 Esc';
    const fontSize = clamp(12 / size.scale, 14, 34);
    const width = textWidth(title, fontSize, 600) + 36;
    roundRect(ctx, (WORLD_W - width) / 2, 12, width, fontSize + 19, 6, 'rgba(10,29,35,0.96)', '#829b85');
    label(ctx, title, WORLD_W / 2, 25 + fontSize * 0.78, fontSize, '#d2dbbc', 'center', 600);
  }
  function navigationMap(exp, visible, explored) {
    const navigation = getNavigation(exp);
    const marks = navigation.marks || {};
    const panel = NAVIGATION_PANEL;
    const map = { x: 495, y: 644, w: 729, step: 23 };
    const px = x => map.x + (x - 65) / 1150 * map.w;
    const py = floor => map.y + (2 - floor) * map.step;
    const pointKnown = (x, floor) => inSegments(explored, x, floor, 0.1);
    roundRect(ctx, panel.x, panel.y, panel.w, panel.h, 7, 'rgba(7,23,31,0.94)', 'rgba(111,144,135,0.42)');
    const titleSize = clamp(12 / size.scale, 14, 31);
    const detailSize = clamp(10 / size.scale, 11, 26);
    const title = navigation.exit.reached ? '출입구에 도착했습니다' : navigation.exit.blockedDoorId ? '귀환로의 문을 확인하세요' : navigation.exit.knownRoute ? '기억한 길로 귀환' : '귀환 경로를 확인하세요';
    label(ctx, title, 49, 653 + titleSize * 0.15, titleSize, navigation.exit.blockedDoorId ? '#d3b286' : '#bdd0bb', 'left', 600);
    label(ctx, `${navigation.floor + 1}층 · 탐색 ${Math.round(navigation.exploredPercent)}%`, 49, 691, detailSize, '#8da9a3', 'left', 400);
    // Blank intervals remain blank. The map contains discovered geometry only;
    // in particular, an unexplored upper floor gets no baseline or labels.
    for (const segment of explored) {
      const x1 = px(clamp(segment.min, 65, 1215)), x2 = px(clamp(segment.max, 65, 1215));
      if (x2 > x1) line(ctx, x1, py(segment.floor), x2, py(segment.floor), '#45645f', 3);
    }
    for (const segment of visible) {
      const x1 = px(clamp(segment.min, 65, 1215)), x2 = px(clamp(segment.max, 65, 1215));
      if (x2 > x1) line(ctx, x1, py(segment.floor), x2, py(segment.floor), '#88a393', 3);
    }
    // Exit routes are already clipped by the simulation's known geometry. Gate
    // every segment again here so drawing does not infer a hidden connection.
    const route = navigation.exit.route || [];
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1], b = route[i];
      if (a.floor === b.floor) {
        const lo = Math.min(a.x, b.x), hi = Math.max(a.x, b.x);
        for (const segment of explored.filter(entry => entry.floor === a.floor)) {
          const from = Math.max(lo, segment.min), to = Math.min(hi, segment.max);
          if (to > from) line(ctx, px(from), py(a.floor), px(to), py(a.floor), '#c1b581', 1.2);
        }
      } else if (pointKnown(a.x, a.floor) && pointKnown(b.x, b.floor)) {
        line(ctx, px(a.x), py(a.floor), px(b.x), py(b.floor), '#a6ad83', 1.2);
      }
    }
    for (const stair of marks.stairs || []) {
      const lowerKnown = pointKnown(stair.x, stair.from), upperKnown = pointKnown(stair.x, stair.to);
      if (lowerKnown && upperKnown) line(ctx, px(stair.x), py(stair.from), px(stair.x), py(stair.to), '#698b7e', 2);
      else {
        const f = lowerKnown ? stair.from : upperKnown ? stair.to : null;
        if (f !== null) line(ctx, px(stair.x) - 3, py(f) - 3, px(stair.x) + 3, py(f) + 3, '#8baa93', 2);
      }
    }
    const radius = clamp(2.5 / size.scale, 2.5, 6.5);
    for (const loot of marks.loot || []) {
      if (!pointKnown(loot.x, loot.floor)) continue;
      const color = loot.empty ? '#47625e' : loot.owned ? '#b68b76' : loot.visible ? '#cebf8b' : '#8d987e';
      box(ctx, px(loot.x) - radius, py(loot.floor) - radius, radius * 2, radius * 2, color);
    }
    for (const entry of marks.doors || []) {
      if (!pointKnown(entry.x, entry.floor)) continue;
      const x = px(entry.x), y = py(entry.floor);
      line(ctx, x, y - radius - 2, x, y + radius + 2, entry.open ? '#73988b' : entry.locked ? '#c8a574' : '#bb9480', entry.open ? 1 : 2);
    }
    for (const hide of marks.hides || []) {
      if (pointKnown(hide.x, hide.floor)) ellipse(ctx, px(hide.x), py(hide.floor), radius * 0.7, radius * 0.7, '#6d9293');
    }
    for (const npc of marks.npcs || []) {
      if (inSegments(visible, npc.x, npc.floor)) ellipse(ctx, px(npc.x), py(npc.floor), radius, radius, npc.hostile || ['chase','attack'].includes(npc.state) ? '#db977e' : '#a4c7ae');
    }
    if (pointKnown(navigation.exit.x, 0)) {
      const x = px(navigation.exit.x), y = py(0);
      polygon(ctx, [[x - radius * 1.5,y],[x + radius * 0.5,y - radius * 1.2],[x + radius * 0.5,y + radius * 1.2]], '#b2d0ab');
    }
    const playerX = px(exp.player.x), playerY = py(exp.player.floor), pr = radius + 2;
    polygon(ctx, [[playerX,playerY - pr],[playerX + pr,playerY],[playerX,playerY + pr],[playerX - pr,playerY]], '#eed7a1', '#263e42', 1.5);
  }
  function drawNight(exp, state, t, options = {}) {
    const floors = exp.floors || FLOORS;
    const cold = state.day >= 4 && state.day <= 8;
    const key = `${exp.locationId}|${cold}|${floors.join(',')}|${(exp.stairs || []).map(s => `${s.x}:${s.from}:${s.to}`).join(',')}`;
    if (!nightCache || nightCacheKey !== key) {
      nightCache = makeSurface(c => {
        skyStructure(c, true, 1, cold);
        nightStructure(c, exp);
        for (const stair of exp.stairs || []) stairs(c, stair, floors, true);
        groundAndForeground(c, cold);
      }, cacheRatio);
      nightCacheKey = key;
    }
    ctx.drawImage(nightCache, 0, 0, WORLD_W, WORLD_H);
    exteriorAtmosphere(ctx, t, cold, true);
    const p = exp.player || { x: 100, floor: 0, facing: 1, health: 100 };
    const py = entityY(p, floors);
    const visibility = getVisibility(exp);
    const visible = visibility.visibleSegments || [{ floor: p.floor, min: p.x - visibility.range, max: p.x + visibility.range }];
    const explored = [...(exp.explored || []), ...visible];
    const lootIds = new Set(visibility.lootIds || []);
    const npcIds = new Set(visibility.npcIds || []);
    const doorIds = new Set(visibility.doorIds || []);
    const memories = [];
    const visibleDoors = [];
    const windups = [], conversations = [], encounters = new Map();
    lastVisibility = { visible, explored, lootIds, doorIds, encounters };
    lamp(ctx, 471, 270, t, 0.65);
    lamp(ctx, 1017, 463, t, 0.38);
    for (const hide of exp.hides || exp.hidingSpots || []) {
      const y = floors[hide.floor] ?? 600;
      const isVisible = inSegments(visible, hide.x, hide.floor);
      if (!isVisible && !inSegments(explored, hide.x, hide.floor)) continue;
      if (!isVisible) {
        memories.push({ entry: hide, y, type: 'hide' });
        addHit({ type: 'hide', id: hide.id, x: hide.x, floor: hide.floor }, hide.x, y, 32, 115, 2);
        continue;
      }
      const near = p.floor === hide.floor && Math.abs(p.x - hide.x) < 80;
      box(ctx, hide.x - 26, y - 85, 53, 85, '#0e222d');
      polygon(ctx, [[hide.x - 29,y - 90],[hide.x + 26,y - 90],[hide.x + 29,y - 77],[hide.x - 26,y - 77]], '#344c4f');
      polygon(ctx, [[hide.x + 14,y - 78],[hide.x + 28,y - 78],[hide.x + 28,y],[hide.x + 18,y - 4]], '#3e5350');
      for (let i = 0; i < 4; i++) line(ctx, hide.x + 15 + i * 3, y - 75, hide.x + 19 + i * 2, y - 4, '#334b4b', 1);
      const hovered = hover?.type === 'hide' && hover.id === hide.id;
      label(ctx, p.hidden && near ? '은신 중' : '숨을 곳', hide.x, y - 100, 10, hovered || near ? '#a9c8b7' : '#6b8886');
      addHit({ type: 'hide', id: hide.id, x: hide.x, floor: hide.floor }, hide.x, y, 32, 115, 2);
    }
    for (const loot of exp.loot || []) {
      if (!lootIds.has(loot.id)) continue;
      const y = floors[loot.floor] ?? 600;
      const isVisible = inSegments(visible, loot.x, loot.floor);
      const hovered = hover?.type === 'loot' && hover.id === loot.id;
      const near = p.floor === loot.floor && Math.abs(p.x - loot.x) < 70;
      if (isVisible) lootObject(ctx, loot, y, hovered || exp.activeLootId === loot.id, near, t, exp.locationId);
      else memories.push({ entry: loot, y, type: 'loot' });
      addHit({ type: 'loot', id: loot.id, x: loot.x, floor: loot.floor }, loot.x, y, 39, 105, 2);
    }
    for (const entry of exp.doors || []) {
      if (!doorIds.has(entry.id)) continue;
      const y = floors[entry.floor] ?? 600;
      const isVisible = inSegments(visible, entry.x, entry.floor, 2);
      if (isVisible) visibleDoors.push({ entry, y });
      else memories.push({ entry, y, type: 'door' });
      addHit({ type: 'door', id: entry.id, x: entry.x, floor: entry.floor }, entry.x, y, 29, 144, 2.5);
    }
    for (const npc of exp.npcs || []) {
      if (!npcIds.has(npc.id) || npc.health <= 0 || npc.alive === false || ['gone', 'dead'].includes(npc.state)) continue;
      const y = entityY(npc, floors);
      const danger = ['chase','attack'].includes(npc.state);
      const warning = ['warn','investigate'].includes(npc.state);
      const facing = npc.facing || 1;
      // A visible guard's real sight range stops at a closed door, and its wash
      // is clipped to what the survivor can currently see. Hidden guards leak
      // neither position, warning marks nor their search cone into the fog.
      if (npc.kind === 'guard' && !npc.climb) {
        const fullRange = Math.max(0, Number(npc.visionRange || 180) * (p.sneaking ? 0.72 : 1));
        ctx.save(); clipToVisibility(ctx, visible, floors);
        // AI also notices close movement behind it (65 units), and a highly
        // alerted guard watches both directions. Reflect those real rules.
        for (const direction of [facing, -facing]) {
          let range = direction === facing || Number(npc.alert || 0) > 0.65 ? fullRange : Math.min(fullRange, 65);
          for (const entry of exp.doors || []) {
            const distance = (entry.x - npc.x) * direction;
            if (!entry.open && entry.floor === npc.floor && distance >= 0) range = Math.min(range, distance);
          }
          if (range <= 1) continue;
          const sight = ctx.createLinearGradient(npc.x, y - 43, npc.x + direction * range, y - 43);
          sight.addColorStop(0, danger ? 'rgba(226,126,91,0.14)' : 'rgba(175,185,151,0.075)');
          sight.addColorStop(1, 'rgba(175,185,151,0)');
          polygon(ctx, [[npc.x,y - 50],[npc.x + direction * range,y - 76],[npc.x + direction * range,y - 9]], sight);
        }
        ctx.restore();
      }
      human(ctx, npc, { x: npc.x, y, facing, walking: !state.paused && Boolean(npc.moving), working: !state.paused && npc.state === 'attack', windup: Number(npc.windup || 0) > 0, weapon: npc.kind === 'guard' }, t, false, true);
      if (Number(npc.windup || 0) > 0) windups.push({ npc, y });
      const encounter = getEncounter(exp, npc.id);
      if (encounter) { encounters.set(npc.id, encounter); conversations.push({ npc, y, encounter }); }
      if (!npc.windup && (danger || warning || Number(npc.alert || 0) > 0.15)) {
        const mark = danger ? '!' : '?'; const color = danger ? '#e9a184' : '#d2bd88';
        ellipse(ctx, npc.x, y - 77, 9, 9, 'rgba(9,22,30,0.7)');
        label(ctx, mark, npc.x, y - 73, 12, color, 'center', 800);
      }
      const maxHealth = Number(npc.maxHealth || 100);
      if (Number(npc.health) < maxHealth && npc.health > 0) {
        box(ctx, npc.x - 14, y - 64, 28, 2, '#192e37');
        box(ctx, npc.x - 14, y - 64, 28 * clamp(npc.health / maxHealth, 0, 1), 2, '#b59172');
      }
    }
    const character = (state.characters || []).find(c => c.id === (state.nightPlan?.scavengerId || p.id)) || { name: p.name || '수색자', color: p.color || '#a8b29d' };
    let last = poses.get('expedition_player');
    const walking = Boolean(p.climb || last && (Math.abs(last.x - p.x) > 0.15 || last.floor !== p.floor));
    const dodging = Boolean(p.dodge && p.dodge.remaining > 0);
    if (!options.reducedMotion && dodging && last && last.floor === p.floor && Math.abs(last.x - p.x) > 1) {
      dodgeTrail.push({ x: last.x, y: last.y ?? py, floor: p.floor, direction: p.dodge.direction || p.facing || 1, at: t });
    }
    dodgeTrail = options.reducedMotion ? [] : dodgeTrail.filter(point => t - point.at < 0.2 && t >= point.at).slice(-4);
    poses.set('expedition_player', { x: p.x, y: py, floor: p.floor });
    if (!p.hidden) {
      ctx.save(); clipToVisibility(ctx, visible, floors);
      const cone = ctx.createRadialGradient(p.x, py - 40, 5, p.x, py - 40, 120);
      cone.addColorStop(0, 'rgba(217,200,151,0.07)'); cone.addColorStop(1, 'rgba(217,200,151,0)');
      polygon(ctx, [[p.x,py - 40],[p.x + (p.facing || 1) * 125,py - 78],[p.x + (p.facing || 1) * 125,py - 5]], cone);
      ctx.restore();
    }
    explorationFog(ctx, floors, explored, visible);
    for (const item of visibleDoors) {
      expeditionDoor(ctx, item.entry, item.y, hover?.type === 'door' && hover.id === item.entry.id);
    }
    for (const memory of memories) {
      rememberedMarker(ctx, memory.entry, memory.y, memory.type, hover?.type === memory.type && hover.id === memory.entry.id);
    }
    routeCue(p, visible, floors, t);
    distractionPulse(exp, visible, floors, options.reducedMotion);
    for (const item of windups) windupCue(item.npc, item.y, exp, visible, COMBAT_RULES);
    for (const item of conversations) conversationCue(item.npc, item.y, item.encounter);
    if (dodgeTrail.length) {
      ctx.save(); clipToVisibility(ctx, visible, floors);
      for (const point of dodgeTrail) {
        if (point.floor === p.floor) dodgeGhost(ctx, point, character, Math.max(0, 0.22 * (1 - (t - point.at) / 0.2)));
      }
      ctx.restore();
    }
    const noise = Number(p.noise || 0);
    if (noise > 0.08 && !p.hidden) {
      ctx.save();
      const radius = clamp(noise > 1 ? noise * 0.8 : noise * 60, 12, 105);
      ctx.strokeStyle = `rgba(205,173,120,${clamp(noise > 1 ? noise / 160 : noise * 0.3, 0.07, 0.28)})`;
      ctx.lineWidth = 1;
      for (let i = 0; i < 2; i++) {
        const r = radius * ((t * 0.7 + i * 0.5) % 1);
        ctx.beginPath(); ctx.ellipse(p.x, py - 24, r, r * 0.48, 0, 0, TAU); ctx.stroke();
      }
      ctx.restore();
    }
    const playerPose = { x: p.x, y: py, facing: dodging ? p.dodge.direction || p.facing || 1 : p.facing || 1, walking: !state.paused && walking, dodging, hidden: p.hidden, sneak: p.sneaking, backpack: true, working: !dodging && !state.paused && Boolean(exp.progress), weapon: Number(exp.bag?.knife || 0) > 0 };
    human(ctx, character, playerPose, t, true);
    if (Number(p.evade || 0) > 0) {
      ctx.beginPath(); ctx.ellipse(p.x, py - 19, 25, 29, 0, Math.PI * 0.82, Math.PI * 1.92);
      ctx.strokeStyle = 'rgba(174,209,207,0.62)'; ctx.lineWidth = 1.4; ctx.stroke();
    }
    nameTag(character, playerPose, true, (character.name || '수색자') + (dodging ? ' · 회피' : p.hidden ? ' · 은신' : ''));
    staminaCue(p, py, COMBAT_RULES);
    if (exp.progress) {
      const total = Number(exp.progress.total || exp.progress.duration || 1);
      const remaining = Number(exp.progress.remaining ?? Math.max(0, total - Number(exp.progress.elapsed || 0)));
      const progress = clamp(1 - remaining / Math.max(0.01, total), 0, 1);
      box(ctx, p.x - 24, py - 67, 48, 3, '#132933');
      box(ctx, p.x - 24, py - 67, progress * 48, 3, '#d1b779');
    }
    const exitNear = p.floor === 0 && p.x < 145;
    if (exitNear || hover?.type === 'exit') {
      light(ctx, 99, 563, 100, 0.10);
      label(ctx, '안전한 곳으로', 103, 510, 10, '#b8d0b7');
    }
    addHit({ type: 'exit', id: 'exit', x: 95, floor: 0 }, 100, 600, 45, 108, 3);
    if (!options.distractionAim && pointer && hover?.type === 'ground') {
      const gy = floors[hover.floor] ?? 600;
      line(ctx, hover.x - 5, gy - 4, hover.x, gy, '#8ca99b', 1);
      line(ctx, hover.x, gy, hover.x + 5, gy - 4, '#8ca99b', 1);
    }
    distractionAimCue(exp, visible, floors, options);
    if (options.miniMap !== false) navigationMap(exp, visible, explored);
  }

  function tooltipContent(hit, state, exp) {
    if (!hit || hit.type === 'ground') return null;
    if (hit.type === 'character') {
      const person = (state.characters || []).find(c => c.id === hit.id);
      if (!person) return null;
      return {
        title: person.name + (person.id === state.selectedId ? ' · 선택됨' : ''),
        detail: person.job ? `${person.job.label} · 약 ${Math.ceil(person.job.remaining)}분 남음` : '지금 맡은 작업이 없습니다.',
        hint: `건강 ${Math.round(person.health)} · 기력 ${Math.round(100 - person.fatigue)} · 클릭해서 선택`,
      };
    }
    if (hit.type === 'facility') {
      const facilities = state.facilities || {};
      const data = {
        bed: ['침대', `휴식과 치료 · 침대 ${facilities.bed || 1}개`],
        kitchen: [facilities.stove > 1 ? '개량 조리대' : '조리대', '따뜻한 식사를 만들고 허기를 달랩니다.'],
        water: [facilities.collector ? '빗물 수집기' : '물 확보', facilities.collector ? '집수기로 더 효율적으로 물을 모읍니다.' : '주변의 물을 모으거나 집수기를 설치하세요.'],
        workshop: ['작업대', '도구와 연료를 제작하고 은신처를 확장합니다.'],
        heater: ['난방', facilities.heater ? '난로가 있어도 밤을 지킬 연료가 필요합니다.' : '난로를 설치해 추운 밤을 준비하세요.'],
        rubble: [state.cleared >= 4 ? '정리된 공간' : '잔해 정리', state.cleared >= 4 ? '쓸 만한 재료를 모두 확보했습니다.' : `남은 구역 ${Math.max(0, 4 - Number(state.cleared || 0))}곳 · 재료를 찾아봅니다.`],
        radio: [state.relief?.contacted ? '구호 연락망' : facilities.radio ? '복구한 무전기' : '라디오와 낡은 교신 장비', state.relief?.contacted ? '구호팀에 우리 위치를 알렸습니다. 대피 준비를 계속하세요.' : facilities.radio ? '4일째부터 구호 주파수로 교신할 수 있습니다.' : '이야기를 나누며 사기를 돌보거나, 시설에서 교신 장비를 복구하세요.'],
        door: ['출입문', state.visitor ? '문 앞의 방문자와 이야기할 수 있습니다.' : state.relief?.prepared ? '대피 물자 세 꾸러미를 봉인했습니다. 12번째 밤까지 함께 버티세요.' : `은신처 내구도 ${Math.round(state.shelterIntegrity ?? 100)} / 100 · 문 보강 ${facilities.barricade || 0}단계. 손상된 문은 복구할 수 있습니다.`],
      }[hit.id];
      return data ? { title: data[0], detail: data[1], hint: hit.id === 'door' && state.visitor ? '클릭해서 방문자 보기' : '클릭해서 관련 작업 보기' } : null;
    }
    if (!exp) return null;
    const isVisible = entry => inSegments(lastVisibility?.visible || [], entry.x, entry.floor, 2);
    if (hit.type === 'npc') {
      const encounter = lastVisibility?.encounters?.get(hit.id);
      if (!encounter) return null;
      return {
        title: encounter.npcName,
        detail: encounter.permission.loot ? '출입과 보관함 이용을 허락받았습니다.' : encounter.permission.area ? '출입을 허락받았습니다. 보관함은 계속 사유물입니다.' : '출입을 부탁하거나, 도움과 교환을 제안할 수 있습니다.',
        hint: encounter.resolved ? '클릭해서 합의한 내용 다시 보기' : '클릭해서 이야기 나누기',
      };
    }
    if (hit.type === 'loot') {
      const entry = exp.loot.find(item => item.id === hit.id);
      if (!entry) return null;
      const visible = isVisible(entry);
      const empty = entry.searched && !Object.values(entry.items || {}).some(n => n > 0);
      return {
        title: entry.label || '보관함',
        detail: !visible ? '기억한 장소입니다. 지금 주변은 보이지 않습니다.' : empty ? '남아 있는 물자가 없습니다.' : entry.locked ? '잠겨 있습니다. 쇠지레가 필요합니다.' : entry.owned ? '누군가의 소유물입니다. 가져가기 전에 생각해 보세요.' : entry.searched ? '살펴본 물품 중 필요한 것만 가방에 담으세요.' : '안에 무엇이 남았는지 살펴보세요.',
        hint: visible ? '클릭해서 다가가 살펴보기 · E 상호작용' : '클릭해서 기억한 장소로 이동',
      };
    }
    if (hit.type === 'door') {
      const entry = (exp.doors || []).find(item => item.id === hit.id);
      if (!entry) return null;
      return {
        title: entry.label || '문',
        detail: !isVisible(entry) ? '전에 보았던 문입니다. 지금 상태는 보이지 않습니다.' : entry.locked ? '잠긴 문 · 쇠지레로 열 수 있습니다.' : entry.open ? '열린 문 · 이동과 시야가 이어집니다.' : '닫힌 문 · 너머의 모습과 움직임이 가려집니다.',
        hint: !isVisible(entry) ? '클릭해서 문 쪽으로 이동' : entry.open ? '클릭해서 다가가 문 닫기' : '클릭해서 다가가 문 열기',
      };
    }
    if (hit.type === 'hide') {
      return { title: '숨을 곳', detail: '모습을 감추고 주변의 움직임을 살펴보세요.', hint: exp.player.hidden ? 'E를 누르거나 이동하면 나옵니다.' : '클릭해서 다가가 숨기 · E 상호작용' };
    }
    if (hit.type === 'exit') {
      return { title: '은신처로 귀환', detail: '모은 물자를 가지고 동료들에게 돌아갑니다.', hint: '클릭해서 출입구로 이동하고 수색 마치기' };
    }
    return null;
  }

  function drawTooltip(state, exp) {
    if (!pointer) return;
    // Refresh after rebuilding targets; a moving survivor or new fog boundary
    // cannot leave a stale tooltip pointing at a now-hidden interaction.
    hover = testWorld(pointer);
    const content = tooltipContent(hover, state, exp);
    if (!content) return;
    const fontSize = clamp(11 / size.scale, 12, 41);
    const titleSize = clamp(13 / size.scale, 14, 48);
    const padding = fontSize * 0.95;
    const width = Math.min(WORLD_W - 48, Math.max(285, 264 / size.scale));
    const available = width - padding * 2;
    const wrap = text => {
      const result = []; let current = '';
      for (const character of String(text)) {
        if (current && textWidth(current + character, fontSize, 400) > available) { result.push(current); current = character; }
        else current += character;
      }
      if (current) result.push(current);
      return result;
    };
    const lines = wrap(content.detail).slice(0, 3);
    const hintLines = wrap(content.hint).slice(0, 2);
    const lineHeight = fontSize * 1.5;
    const height = padding * 2 + titleSize * 1.5 + (lines.length + hintLines.length) * lineHeight + fontSize * 0.5;
    const x = clamp(pointer.x + padding, 20, WORLD_W - width - 20);
    let y = pointer.y + padding * 1.5;
    if (y + height > WORLD_H - 24) y = pointer.y - height - padding;
    y = clamp(y, 18, WORLD_H - height - 18);
    roundRect(ctx, x, y, width, height, 6, 'rgba(8,22,31,0.97)', 'rgba(168,187,175,0.55)');
    line(ctx, x + 1, y + 10, x + 1, y + height - 10, '#d3aa70', 2);
    let ty = y + padding + titleSize;
    label(ctx, content.title, x + padding, ty, titleSize, '#f0d2a2', 'left', 600);
    ty += titleSize * 0.5 + lineHeight;
    for (const text of lines) { label(ctx, text, x + padding, ty, fontSize, '#d2dbd4', 'left', 400); ty += lineHeight; }
    ty += fontSize * 0.5;
    for (const text of hintLines) { label(ctx, text, x + padding, ty, fontSize, '#9db4ad', 'left', 400); ty += lineHeight; }
  }

  function render({ state, expedition = null, time = 0, selectedId, distractionAim = false, aimTarget = null, miniMap = true, reducedMotion = false } = {}) {
    if (destroyed || !state) return;
    if (dirtySize) resize();
    // time is the requestAnimationFrame / performance.now() millisecond clock.
    const rawTime = Number.isFinite(time) ? time : 0;
    const clock = rawTime / 1000;
    const t = reducedMotion ? 0 : clock;
    const dt = lastTime === null ? 1 / 60 : clamp(clock - lastTime, 0, 0.08);
    lastTime = clock;
    if (expedition !== lastExpedition) {
      lastExpedition = expedition; dodgeTrail = []; poses.delete('expedition_player');
    }
    lastFrame = { state, expedition, selectedId: selectedId || state.selectedId, distractionAim, miniMap };
    if (!expedition) lastVisibility = null;
    targets = [];
    ctx.setTransform(size.ratio, 0, 0, size.ratio, 0, 0);
    box(ctx, 0, 0, size.width, size.height, '#0e1c25');
    ctx.setTransform(size.ratio * size.scale, 0, 0, size.ratio * size.scale, size.ratio * size.ox, size.ratio * size.oy);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, WORLD_W, WORLD_H); ctx.clip();
    const cold = state.day >= 4 && state.day <= 8;
    if (expedition) drawNight(expedition, state, t, { distractionAim, aimTarget, miniMap, reducedMotion });
    else drawDay(state, t, dt, selectedId || state.selectedId);
    if (!cold) groundRipples(ctx, t);
    drawRain(ctx, t, cold, true);
    if (!distractionAim) drawTooltip(state, expedition);
    ctx.restore();
  }
  return {
    render,
    hitTest(clientX, clientY) {
      if (destroyed) return null;
      if (dirtySize) resize();
      return testWorld(toWorld(clientX, clientY));
    },
    worldPoint(clientX, clientY) {
      if (destroyed) return null;
      if (dirtySize) resize();
      const point = toWorld(clientX, clientY), floor = worldFloor(point);
      return point && floor !== null ? { ...point, floor } : null;
    },
    destroy() {
      destroyed = true;
      resizeObserver?.disconnect();
      if (typeof window !== 'undefined') window.removeEventListener('resize', onResize);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      poses.clear(); textWidths.clear(); targets = []; lastFrame = null; lastVisibility = null;
      lastExpedition = null; dodgeTrail = [];
      nightCache = null; shelterCache = null;
    },
  };
}
