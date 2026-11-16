// Geometry used by the deterministic simulation. All angles are radians.
export const TAU = Math.PI * 2;
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const angleDelta = (target, current) => Math.atan2(Math.sin(target - current), Math.cos(target - current));

export function turnTowards(current, target, maximum) {
  return current + clamp(angleDelta(target, current), -maximum, maximum);
}

export function circleTouchesRect(x, y, radius, rect) {
  const nearestX = clamp(x, rect.x, rect.x + rect.w);
  const nearestY = clamp(y, rect.y, rect.y + rect.h);
  return (x - nearestX) ** 2 + (y - nearestY) ** 2 < radius ** 2;
}

// Return the first intersection on a closed segment, including its surface normal.
export function segmentRect(x1, y1, x2, y2, rect) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let near = 0;
  let far = 1;
  let nx = 0;
  let ny = 0;
  for (const axis of [0, 1]) {
    const origin = axis === 0 ? x1 : y1;
    const direction = axis === 0 ? dx : dy;
    const low = axis === 0 ? rect.x : rect.y;
    const high = low + (axis === 0 ? rect.w : rect.h);
    if (Math.abs(direction) < 1e-9) {
      if (origin < low || origin > high) return null;
      continue;
    }
    let a = (low - origin) / direction;
    let b = (high - origin) / direction;
    let normal = -1;
    if (a > b) { [a, b] = [b, a]; normal = 1; }
    if (a > near) {
      near = a;
      nx = axis === 0 ? normal : 0;
      ny = axis === 1 ? normal : 0;
    }
    far = Math.min(far, b);
    if (near > far) return null;
  }
  if (far < 0 || near > 1) return null;
  if (!nx && !ny) {
    if (Math.abs(dx) >= Math.abs(dy)) nx = dx >= 0 ? -1 : 1;
    else ny = dy >= 0 ? -1 : 1;
  }
  return { t: Math.max(0, near), x: x1 + dx * Math.max(0, near), y: y1 + dy * Math.max(0, near), nx, ny };
}

export function segmentCircle(x1, y1, x2, y2, circle, extraRadius = 0) {
  const radius = (circle.r ?? circle.radius ?? 0) + extraRadius;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const ox = x1 - circle.x;
  const oy = y1 - circle.y;
  const c = ox * ox + oy * oy - radius * radius;
  if (c <= 0) return { t: 0, x: x1, y: y1 };
  const a = dx * dx + dy * dy;
  if (a < 1e-12) return null;
  const b = 2 * (ox * dx + oy * dy);
  const determinant = b * b - 4 * a * c;
  if (determinant < 0) return null;
  const t = (-b - Math.sqrt(determinant)) / (2 * a);
  if (t < 0 || t > 1) return null;
  return { t, x: x1 + dx * t, y: y1 + dy * t };
}

export function segmentTank(x1, y1, x2, y2, tank, radius) {
  const cosine = Math.cos(tank.angle);
  const sine = Math.sin(tank.angle);
  const toLocal = (x, y) => ({ x: (x - tank.x) * cosine + (y - tank.y) * sine, y: -(x - tank.x) * sine + (y - tank.y) * cosine });
  const a = toLocal(x1, y1);
  const b = toLocal(x2, y2);
  const hit = segmentRect(a.x, a.y, b.x, b.y, { x: -radius * 1.1, y: -radius * 0.78, w: radius * 2.2, h: radius * 1.56 });
  if (!hit) return null;
  return {
    t: hit.t,
    x: x1 + (x2 - x1) * hit.t,
    y: y1 + (y2 - y1) * hit.t,
    nx: hit.nx * cosine - hit.ny * sine,
    ny: hit.nx * sine + hit.ny * cosine,
    zone: hit.nx > 0 ? 'front' : hit.nx < 0 ? 'rear' : 'side',
  };
}

export function clearLine(map, x1, y1, x2, y2, ignoreId = null) {
  for (const obstacle of map.obstacles) {
    if (obstacle.destroyed || obstacle.id === ignoreId) continue;
    if (segmentRect(x1, y1, x2, y2, obstacle)) return false;
  }
  return true;
}
