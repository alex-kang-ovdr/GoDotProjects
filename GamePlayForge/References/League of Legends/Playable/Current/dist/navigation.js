/* Nexus Front: deterministic circular terrain, A* routing and swept movement. */
(function (root) {
  'use strict';

  // Paired jungle ridges leave all three lanes, both bases and camp centers open.
  const WALLS = Object.freeze([
    { x: 350, y: 780, r: 75 }, { x: 360, y: 630, r: 65 },
    { x: 370, y: 340, r: 70 }, { x: 690, y: 350, r: 78 },
    { x: 795, y: 485, r: 68 }, { x: 1090, y: 320, r: 65 },
    { x: 1250, y: 820, r: 75 }, { x: 1240, y: 970, r: 65 },
    { x: 1230, y: 1260, r: 70 }, { x: 910, y: 1250, r: 78 },
    { x: 805, y: 1115, r: 68 }, { x: 510, y: 1280, r: 65 }
  ].map(wall => Object.freeze(wall)));

  const finite = Number.isFinite;
  const clamp = (v, low, high) => Math.max(low, Math.min(high, v));
  const sq = v => v * v;
  const DIRECTIONS = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [-1, -1], [1, -1]];

  class MinHeap {
    constructor() { this.nodes = []; }
    push(node) {
      const nodes = this.nodes;
      let i = nodes.length;
      nodes.push(node);
      while (i > 0) {
        const parent = (i - 1) >> 1;
        if (nodes[parent].f <= node.f) break;
        nodes[i] = nodes[parent]; i = parent;
      }
      nodes[i] = node;
    }
    pop() {
      const nodes = this.nodes;
      if (!nodes.length) return null;
      const first = nodes[0], last = nodes.pop();
      if (nodes.length) {
        let i = 0;
        while (i * 2 + 1 < nodes.length) {
          let child = i * 2 + 1;
          if (child + 1 < nodes.length && nodes[child + 1].f < nodes[child].f) child++;
          if (last.f <= nodes[child].f) break;
          nodes[i] = nodes[child]; i = child;
        }
        nodes[i] = last;
      }
      return first;
    }
  }

  class Navigation {
    constructor(options) {
      options = options || {};
      this.width = finite(options.width) ? clamp(options.width, 40, 16384) : 1600;
      this.height = finite(options.height) ? clamp(options.height, 40, 16384) : 1600;
      this.cellSize = finite(options.cellSize) ? clamp(options.cellSize, 16, 100) : 40;
      this.columns = Math.ceil(this.width / this.cellSize);
      this.rows = Math.ceil(this.height / this.cellSize);
      this.obstacles = (Array.isArray(options.obstacles) ? options.obstacles : WALLS)
        .filter(o => o && finite(o.x) && finite(o.y) && finite(o.r) && o.r > 0)
        .map(o => Object.freeze({ x: o.x, y: o.y, r: o.r }));
      Object.freeze(this.obstacles);
      this._grids = new Map();
      this._paths = new Map();
    }

    _radius(radius) {
      return clamp(finite(radius) ? radius : 19, 0, Math.max(0, Math.min(this.width, this.height) / 2 - 0.5));
    }

    isWalkable(x, y, radius) {
      if (!finite(x) || !finite(y)) return false;
      const r = this._radius(radius);
      if (x < r || y < r || x > this.width - r || y > this.height - r) return false;
      for (const wall of this.obstacles) {
        if (sq(x - wall.x) + sq(y - wall.y) < sq(wall.r + r) - 1e-7) return false;
      }
      return true;
    }

    nearestWalkable(x, y, radius) {
      const r = this._radius(radius);
      const original = {
        x: clamp(finite(x) ? x : this.width / 2, r, this.width - r),
        y: clamp(finite(y) ? y : this.height / 2, r, this.height - r)
      };
      if (this.isWalkable(original.x, original.y, r)) return original;
      // The radial exit is the exact nearest free point for one containing
      // circle, provided it also clears every other obstacle and the map edge.
      // Keep the complete search below for overlapping circles or blocked exits.
      let containing = null, containingCount = 0;
      for (const wall of this.obstacles) {
        if (sq(original.x - wall.x) + sq(original.y - wall.y) < sq(wall.r + r) - 1e-7) {
          containing = wall;
          if (++containingCount > 1) break;
        }
      }
      if (containingCount === 1) {
        const dx = original.x - containing.x, dy = original.y - containing.y;
        const length = Math.hypot(dx, dy), clearance = containing.r + r + 0.25;
        const px = containing.x + (length > 1e-12 ? dx / length : 1) * clearance;
        const py = containing.y + (length > 1e-12 ? dy / length : 0) * clearance;
        if (this.isWalkable(px, py, r)) return { x: px, y: py };
      }
      let best = null, bestDistance = Infinity;
      const accept = (px, py) => {
        px = clamp(px, r, this.width - r); py = clamp(py, r, this.height - r);
        const d = sq(px - original.x) + sq(py - original.y);
        if (d < bestDistance && this.isWalkable(px, py, r)) {
          best = { x: px, y: py }; bestDistance = d;
        }
      };
      // Project onto each expanded circle. Sample other angles for overlaps and
      // map-edge cases; the fixed grid is a bounded fallback for enclosed spots.
      for (const wall of this.obstacles) {
        const angle = Math.atan2(original.y - wall.y, original.x - wall.x);
        const clearance = wall.r + r + 0.25;
        accept(wall.x + Math.cos(angle) * clearance, wall.y + Math.sin(angle) * clearance);
        for (let i = 0; i < 48; i++) {
          const a = angle + i * Math.PI / 24;
          accept(wall.x + Math.cos(a) * clearance, wall.y + Math.sin(a) * clearance);
        }
      }
      if (best) return best;
      for (let row = 0; row < this.rows; row++) for (let column = 0; column < this.columns; column++) {
        accept((column + 0.5) * this.cellSize, (row + 0.5) * this.cellSize);
      }
      // An entirely blocked custom map has no valid answer. Keep the coordinate
      // finite; findPath checks walkability and reports [] in that case.
      return best || original;
    }

    segmentClear(ax, ay, bx, by, radius) {
      const r = this._radius(radius);
      if (!this.isWalkable(ax, ay, r) || !this.isWalkable(bx, by, r)) return false;
      const dx = bx - ax, dy = by - ay, length2 = dx * dx + dy * dy;
      for (const wall of this.obstacles) {
        const t = length2 > 1e-12 ? clamp(((wall.x - ax) * dx + (wall.y - ay) * dy) / length2, 0, 1) : 0;
        if (sq(wall.x - ax - t * dx) + sq(wall.y - ay - t * dy) < sq(wall.r + r) - 1e-7) return false;
      }
      return true;
    }

    _point(index) {
      return { x: (index % this.columns + 0.5) * this.cellSize, y: (Math.floor(index / this.columns) + 0.5) * this.cellSize };
    }

    _grid(radius) {
      // Round upward: a cached grid must never have less clearance than asked.
      const r = Math.ceil(radius * 100) / 100;
      let grid = this._grids.get(r);
      if (grid) return grid;
      const count = this.columns * this.rows;
      grid = { radius: r, walkable: new Uint8Array(count), edges: new Uint16Array(count) };
      for (let i = 0; i < count; i++) {
        const p = this._point(i);
        grid.walkable[i] = this.isWalkable(p.x, p.y, r) ? 1 : 0;
      }
      this._grids.set(r, grid);
      if (this._grids.size > 12) this._grids.delete(this._grids.keys().next().value);
      return grid;
    }

    _edges(index, grid) {
      if (grid.edges[index] & 256) return grid.edges[index] & 255;
      const column = index % this.columns, row = Math.floor(index / this.columns);
      const a = this._point(index);
      let mask = 0;
      for (let i = 0; i < DIRECTIONS.length; i++) {
        const dx = DIRECTIONS[i][0], dy = DIRECTIONS[i][1];
        const x = column + dx, y = row + dy;
        if (x < 0 || y < 0 || x >= this.columns || y >= this.rows) continue;
        const next = y * this.columns + x;
        if (!grid.walkable[next]) continue;
        // Never cut diagonally between two blocked orthogonal cells.
        if (dx && dy && (!grid.walkable[row * this.columns + x] || !grid.walkable[y * this.columns + column])) continue;
        const b = this._point(next);
        if (this.segmentClear(a.x, a.y, b.x, b.y, grid.radius)) mask |= 1 << i;
      }
      grid.edges[index] = mask | 256;
      return mask;
    }

    _anchor(point, grid) {
      let best = -1, bestDistance = Infinity;
      for (let i = 0; i < grid.walkable.length; i++) {
        if (!grid.walkable[i]) continue;
        const p = this._point(i), distance = sq(point.x - p.x) + sq(point.y - p.y);
        if (distance < bestDistance && this.segmentClear(point.x, point.y, p.x, p.y, grid.radius)) {
          best = i; bestDistance = distance;
        }
      }
      return best;
    }

    _route(start, goal, grid) {
      const key = grid.radius + ':' + start + ':' + goal;
      if (this._paths.has(key)) {
        const cached = this._paths.get(key);
        this._paths.delete(key); this._paths.set(key, cached);
        return cached;
      }
      const count = grid.walkable.length;
      const cost = new Float64Array(count); cost.fill(Infinity);
      const from = new Int32Array(count); from.fill(-1);
      const closed = new Uint8Array(count);
      const finish = this._point(goal), heap = new MinHeap();
      cost[start] = 0;
      heap.push({ index: start, g: 0, f: 0 });
      let found = false;
      while (heap.nodes.length) {
        const item = heap.pop(), current = item.index;
        if (closed[current] || item.g > cost[current]) continue;
        if (current === goal) { found = true; break; }
        closed[current] = 1;
        const mask = this._edges(current, grid);
        for (let i = 0; i < DIRECTIONS.length; i++) {
          if (!(mask & (1 << i))) continue;
          const d = DIRECTIONS[i], next = current + d[0] + d[1] * this.columns;
          if (closed[next]) continue;
          const candidate = cost[current] + this.cellSize * (i < 4 ? 1 : Math.SQRT2);
          if (candidate + 1e-9 >= cost[next]) continue;
          cost[next] = candidate; from[next] = current;
          const p = this._point(next);
          heap.push({ index: next, g: candidate, f: candidate + Math.hypot(p.x - finish.x, p.y - finish.y) });
        }
      }
      const result = [];
      if (found) {
        let current = goal;
        for (let guard = 0; guard <= count; guard++) {
          result.push(current);
          if (current === start) break;
          current = from[current];
          if (current < 0) { result.length = 0; break; }
        }
        result.reverse();
      }
      this._paths.set(key, result);
      if (this._paths.size > 256) this._paths.delete(this._paths.keys().next().value);
      return result;
    }

    findPath(ax, ay, bx, by, radius) {
      if (![ax, ay, bx, by].every(finite)) return [];
      const r = this._radius(radius);
      const start = this.nearestWalkable(ax, ay, r), goal = this.nearestWalkable(bx, by, r);
      if (!this.isWalkable(start.x, start.y, r) || !this.isWalkable(goal.x, goal.y, r)) return [];
      const relocated = Math.hypot(start.x - ax, start.y - ay) > 0.01;
      if (Math.hypot(start.x - goal.x, start.y - goal.y) < 0.01) return relocated ? [goal] : [];
      if (this.segmentClear(start.x, start.y, goal.x, goal.y, r)) return relocated ? [start, goal] : [goal];
      const grid = this._grid(r), a = this._anchor(start, grid), b = this._anchor(goal, grid);
      if (a < 0 || b < 0) return [];
      const route = this._route(a, b, grid);
      if (!route.length) return [];
      const points = [start, ...route.map(index => this._point(index)), goal];
      const result = relocated ? [start] : [];
      let at = 0;
      // Greedy line-of-sight smoothing preserves circle clearance and avoids
      // visibly walking through every grid center on long open stretches.
      while (at < points.length - 1) {
        let next = points.length - 1;
        while (next > at + 1 && !this.segmentClear(points[at].x, points[at].y, points[next].x, points[next].y, r)) next--;
        if (!this.segmentClear(points[at].x, points[at].y, points[next].x, points[next].y, r)) return [];
        if (Math.hypot(points[next].x - points[at].x, points[next].y - points[at].y) > 0.01) result.push({ x: points[next].x, y: points[next].y });
        at = next;
      }
      return result;
    }

    resolveMove(ax, ay, bx, by, radius) {
      const r = this._radius(radius), start = this.nearestWalkable(ax, ay, r);
      if (!finite(bx) || !finite(by) || !this.isWalkable(start.x, start.y, r)) return start;
      const target = { x: clamp(bx, r, this.width - r), y: clamp(by, r, this.height - r) };
      if (this.segmentClear(start.x, start.y, target.x, target.y, r)) return target;
      let x = start.x, y = start.y, dx = target.x - x, dy = target.y - y;
      for (let iteration = 0; iteration < 5; iteration++) {
        const length2 = dx * dx + dy * dy;
        if (length2 < 1e-10) break;
        let hit = null, first = 1;
        for (const wall of this.obstacles) {
          const ox = x - wall.x, oy = y - wall.y, expanded = wall.r + r + 0.025;
          const along = ox * dx + oy * dy;
          if (along >= 0) continue;
          const c = ox * ox + oy * oy - expanded * expanded;
          const discriminant = along * along - length2 * c;
          if (discriminant < 0) continue;
          const t = (-along - Math.sqrt(discriminant)) / length2;
          if (t <= first && t >= -0.00001) { first = Math.max(0, t); hit = wall; }
          else if (c < 0 && t < 0) { first = 0; hit = wall; }
        }
        if (!hit) { x += dx; y += dy; break; }
        const travel = Math.max(0, first - 0.025 / Math.sqrt(length2));
        x += dx * travel; y += dy * travel;
        dx *= 1 - travel; dy *= 1 - travel;
        const norm = Math.max(1e-9, Math.hypot(x - hit.x, y - hit.y));
        const nx = (x - hit.x) / norm, ny = (y - hit.y) / norm;
        const inward = Math.min(0, dx * nx + dy * ny);
        dx -= nx * inward; dy -= ny * inward;
      }
      x = clamp(x, r, this.width - r); y = clamp(y, r, this.height - r);
      return this.isWalkable(x, y, r) ? { x, y } : start;
    }
  }

  root.NexusNavigation = { WALLS, Navigation };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.NexusNavigation;
})(typeof globalThis !== 'undefined' ? globalThis : this);
