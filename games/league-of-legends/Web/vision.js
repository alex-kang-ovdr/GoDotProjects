/* Nexus Front: team observation, authored terrain LOS and persistent fog knowledge. */
(function (root) {
  'use strict';
  const PROFILE = 'terrain-memory-v1';
  const CELL = 20, REFRESH = 0.1, REVEAL_TIME = 1.5, REVEAL_RADIUS = 76;
  const finite = Number.isFinite;
  const sq = x => x * x;
  const structure = e => e && ['tower', 'inhibitor', 'nexus'].includes(e.type);
  const validTeam = team => team === 1 ? 1 : 0;
  const inside = (x, y, circle) => sq(x - circle.x) + sq(y - circle.y) <= sq(circle.r);

  // Exact 2D segment/circle intersection. Touching a silhouette is conservative:
  // crossing its interior blocks vision, while a mathematical tangent does not.
  function crosses(ax, ay, bx, by, circle) {
    const dx = bx - ax, dy = by - ay, a = dx * dx + dy * dy;
    if (a < 1e-12) return inside(ax, ay, circle);
    const ox = ax - circle.x, oy = ay - circle.y;
    const b = 2 * (ox * dx + oy * dy), c = ox * ox + oy * oy - circle.r * circle.r;
    const discriminant = b * b - 4 * a * c;
    if (discriminant <= 1e-8) return false;
    const d = Math.sqrt(discriminant), entry = Math.max(0, (-b - d) / (2 * a)), exit = Math.min(1, (-b + d) / (2 * a));
    return exit - entry > 1e-7 && exit > 1e-7 && entry < 1 - 1e-7;
  }

  function pack(bits) {
    const chunks = []; let text = '';
    for (let i = 0; i < bits.length; i += 4) {
      let v = 0;
      for (let b = 0; b < 4 && i + b < bits.length; b++) v |= (bits[i + b] ? 1 : 0) << b;
      text += v.toString(16);
      if (text.length === 2048) { chunks.push(text); text = ''; }
    }
    if (text) chunks.push(text);
    return chunks;
  }

  function unpack(chunks, count) {
    const bits = new Uint8Array(count), text = chunks.join('');
    for (let i = 0; i < count; i++) bits[i] = (parseInt(text[i >> 2], 16) >> (i & 3)) & 1;
    return bits;
  }

  function plainCopy(value) { return JSON.parse(JSON.stringify(value)); }

  class Vision {
    constructor(map) {
      this.map = map;
      this.cols = Math.ceil(map.width / CELL); this.rows = Math.ceil(map.height / CELL);
      const count = this.cols * this.rows;
      this.visible = [new Uint8Array(count), new Uint8Array(count)];
      this.explored = [new Uint8Array(count), new Uint8Array(count)];
      this.structures = [Object.create(null), Object.create(null)];
      this.objectives = [Object.create(null), Object.create(null)];
      this.reveals = [];
      this.nextRevealId = 0;
      this.nextRefreshAt = 0;
      this.revision = 0;
      this.metrics = { rebuilds: 0, sampledCells: 0, losTests: 0 };
      this._emitterRefs = [null, null]; this._emitterCache = [[], []];
    }

    groundHeightAt(x, y) {
      let result = 0;
      for (const zone of this.map.highGrounds || []) if (inside(x, y, zone)) result = Math.max(result, zone.tier || 1);
      return result;
    }

    hasLineOfSight(ax, ay, bx, by) {
      if (![ax, ay, bx, by].every(finite)) return false;
      const sourceTier = this.groundHeightAt(ax, ay), targetTier = this.groundHeightAt(bx, by);
      if (targetTier > sourceTier) return false;
      // Authoring is intentionally independent of movement: high ground is
      // traversable, while existing jungle rocks are absolute sight blockers.
      for (const wall of this.map.obstacles || []) if (crosses(ax, ay, bx, by, wall)) return false;
      for (const zone of this.map.highGrounds || []) if ((zone.tier || 1) > sourceTier && crosses(ax, ay, bx, by, zone)) return false;
      return true;
    }

    emitters(game, team) {
      const reference = game._vision[team];
      if (this._emitterRefs[team] !== reference) {
        const list = [{ source: this.map.bases[team], range: 450, type: 'base' }];
        for (const e of reference || []) if (e.alive) list.push({ source: e,
          range: e.type === 'ward' ? 480 : e.type === 'hero' || e.type === 'tower' ? 420 : e.type === 'nexus' ? 450 : e.type === 'inhibitor' ? 270 : 250,
          type: e.type });
        this._emitterRefs[team] = reference; this._emitterCache[team] = list;
      }
      let list = this._emitterCache[team];
      for (const e of game._restoredEffects || []) if (e.team === team && e.until > game.time && ['vision', 'reveal_travel'].includes(e.kind)) {
        // Ashe's scouting bird is an explicit flying vision source. Existing
        // scouting behaviour is preserved; normal wards never inherit this.
        if (list === this._emitterCache[team]) list = list.slice();
        list.push({ source: e, range: e.radius, type: 'scout', ignoresTerrain: true, revealsBrush: true });
      }
      return list;
    }

    emitterSees(emitter, x, y) {
      const p = emitter.source || emitter;
      return p.alive !== false && sq(x - p.x) + sq(y - p.y) <= emitter.range * emitter.range &&
        (emitter.ignoresTerrain || this.hasLineOfSight(p.x, p.y, x, y));
    }

    pointVisible(game, x, y, team) {
      if (!finite(x) || !finite(y) || x < 0 || y < 0 || x > this.map.width || y > this.map.height) return false;
      return this.emitters(game, validTeam(team)).some(e => this.emitterSees(e, x, y));
    }

    entityVisible(game, entity, team) {
      if (!entity) return false;
      team = validTeam(team);
      if (entity.team === team) return true;
      if (!entity.alive && !structure(entity)) return false;
      const brush = entity.type === 'hero' && !(entity.revealedUntil > game.time) ?
        (this.map.brushes || []).find(b => inside(entity.x, entity.y, b)) : null;
      // The SAME source must satisfy range + LOS + brush permission. A unit on
      // the far side of a wall cannot lend brush detection to another source.
      return this.emitters(game, team).some(e => {
        const p = e.source || e;
        return this.emitterSees(e, entity.x, entity.y) &&
          (!brush || e.revealsBrush || sq(p.x - entity.x) + sq(p.y - entity.y) < 95 * 95 || inside(p.x, p.y, brush));
      });
    }

    update(game, force) {
      this.reveals = this.reveals.filter(r => r.expiresAt > game.time);
      if (!force && game.time + 1e-8 < this.nextRefreshAt) return;
      this.nextRefreshAt = game.time + REFRESH;
      const cols = this.cols, rows = this.rows;
      this.metrics.rebuilds++;
      this.metrics.sampledCells = 0; this.metrics.losTests = 0;
      for (let team = 0; team < 2; team++) {
        const visible = this.visible[team], explored = this.explored[team];
        visible.fill(0);
        // Rasterise only emitter rectangles, early-out cells already covered by
        // another source. No full map × all sources × all walls nested loop.
        for (const e of this.emitters(game, team)) {
          const p = e.source || e;
          if (p.alive === false) continue;
          const left = Math.max(0, Math.floor((p.x - e.range) / CELL));
          const right = Math.min(cols - 1, Math.floor((p.x + e.range) / CELL));
          const top = Math.max(0, Math.floor((p.y - e.range) / CELL));
          const bottom = Math.min(rows - 1, Math.floor((p.y + e.range) / CELL));
          for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
            const index = y * cols + x;
            if (visible[index]) continue;
            const px = (x + 0.5) * CELL, py = (y + 0.5) * CELL;
            this.metrics.sampledCells++;
            if (sq(px - p.x) + sq(py - p.y) > e.range * e.range) continue;
            this.metrics.losTests++;
            if (e.ignoresTerrain || this.hasLineOfSight(p.x, p.y, px, py)) visible[index] = explored[index] = 1;
          }
        }
      }
      this.revision++;
      this.observe(game);
    }

    observe(game) {
      for (let team = 0; team < 2; team++) {
        const emitters = this.emitters(game, team);
        const sees = (x, y) => emitters.some(e => this.emitterSees(e, x, y));
        const actualStructures = new Set();
        for (const e of game.entities) {
          if (structure(e)) {
            actualStructures.add(e.id);
            if (e.team !== team && !sees(e.x, e.y)) continue;
            this.structures[team][e.id] = { id: e.id, name: e.name, type: e.type, team: e.team, x: e.x, y: e.y, r: e.r, range: e.range || 0,
              lane: e.lane, structureTier: e.structureTier || e.type, hp: e.hp, maxHp: e.maxHp,
              alive: !!e.alive, protected: !!game.isProtected(e), observedAt: game.time };
          } else if (e.type === 'monster') {
            const old = this.objectives[team][e.id];
            const common = { id: e.id, name: e.name, kind: e.kind, homeX: e.homeX, homeY: e.homeY, observedAt: game.time };
            if (e.alive && sees(e.x, e.y)) {
              this.objectives[team][e.id] = Object.assign(common, { presence: 'present', alive: true, respawnAt: 0 });
            } else if (sees(e.homeX, e.homeY)) {
              // An empty home is not a death witness: the monster may have
              // been pulled behind a wall. Never copy its hidden death timer.
              if (old && old.presence === 'dead' && old.respawnAt > game.time) continue;
              if (!e.alive && !finite(e.deathAt) && e.respawnAt > game.time) {
                // The first authored spawn time is public match information.
                this.objectives[team][e.id] = Object.assign(common, { presence: 'pending', alive: false, respawnAt: e.respawnAt });
              } else this.objectives[team][e.id] = Object.assign(common, { presence: 'absent' });
            }
          }
        }
        // This also supports future removal/rebuilding: loss of the live Actor
        // alone never erases its remembered silhouette.
        for (const old of Object.values(this.structures[team])) if (!actualStructures.has(old.id) && sees(old.x, old.y)) {
          old.alive = false; old.hp = 0; old.protected = false; old.observedAt = game.time;
        }
      }
    }

    structureObservations(game, team) {
      team = validTeam(team);
      return Object.values(this.structures[team]).map(e => {
        const visible = e.team === team || this.pointVisible(game, e.x, e.y, team);
        return Object.assign({}, e, { visible, remembered: !visible });
      });
    }

    objectiveObservation(game, id, team) {
      team = validTeam(team);
      const entity = game.entities.find(e => e.id === id && e.type === 'monster');
      const old = this.objectives[team][id];
      const camp = entity || (this.map.camps || []).find(e => e.id === id);
      if (!camp && !old) return null;
      const homeX = entity ? entity.homeX : old ? old.homeX : camp.x;
      const homeY = entity ? entity.homeY : old ? old.homeY : camp.y;
      const visible = old && old.presence === 'present' ? !!entity && this.entityVisible(game, entity, team) :
        !!old && this.pointVisible(game, homeX, homeY, team);
      return Object.assign({ id, name: camp ? camp.name : old.name, kind: camp ? camp.kind : old.kind, homeX, homeY,
        known: !!old && old.presence !== 'absent', visible, remembered: !!old && !visible }, old ? Object.assign({}, old) : {});
    }

    recordObjectiveDeath(game, entity, killerTeam) {
      for (let team = 0; team < 2; team++) if (killerTeam === team || this.pointVisible(game, entity.x, entity.y, team)) {
        this.objectives[team][entity.id] = { id: entity.id, name: entity.name, kind: entity.kind, homeX: entity.homeX, homeY: entity.homeY,
          presence: 'dead', alive: false, respawnAt: entity.respawnAt, observedAt: game.time };
      }
    }

    recordAttack(game, source, target, origin) {
      if (!source || source.team > 1 || !target || target.team > 1 || source.team === target.team) return;
      const x = origin && finite(origin.x) ? origin.x : source.x;
      const y = origin && finite(origin.y) ? origin.y : source.y;
      if (!finite(x) || !finite(y) || x < 0 || y < 0 || x > this.map.width || y > this.map.height) return;
      if (this.pointVisible(game, x, y, target.team)) return;
      // Damage creates a fixed spatial clue, never entity visibility. Repeated
      // ticks at the same location may extend that clue, but cannot move it.
      const existing = this.reveals.find(e => e.team === target.team && e.sourceId === source.id && sq(e.x - x) + sq(e.y - y) < 4);
      if (existing) existing.expiresAt = Math.max(existing.expiresAt, game.time + REVEAL_TIME);
      else this.reveals.push({ id: 'origin-' + (++this.nextRevealId), team: target.team, sourceId: source.id,
        x, y, radius: REVEAL_RADIUS, createdAt: game.time, expiresAt: game.time + REVEAL_TIME });
      if (this.reveals.length > 128) this.reveals.splice(0, this.reveals.length - 128);
    }

    attackOrigins(game, team) {
      return this.reveals.filter(e => e.team === validTeam(team) && e.expiresAt > game.time)
        .map(e => ({ id: e.id, x: e.x, y: e.y, radius: e.radius, createdAt: e.createdAt, expiresAt: e.expiresAt }));
    }

    mask(game, team) {
      team = validTeam(team);
      return { cols: this.cols, rows: this.rows, cellSize: CELL, width: this.map.width, height: this.map.height,
        visible: this.visible[team], explored: this.explored[team], revision: this.revision };
    }

    exportState(game) {
      return { version: 1, profile: PROFILE, nextRefreshAt: this.nextRefreshAt, nextRevealId: this.nextRevealId,
        explored: this.explored.map(pack), structures: this.structures.map(entries => Object.values(entries).map(plainCopy)),
        objectives: this.objectives.map(entries => Object.values(entries).map(plainCopy)), reveals: this.reveals.map(plainCopy) };
    }

    restore(game, state) {
      if (!state) { this.update(game, true); return; }
      const count = this.cols * this.rows;
      this.explored = state.explored.map(chunks => unpack(chunks, count));
      this.structures = state.structures.map(list => Object.assign(Object.create(null), Object.fromEntries(list.map(e => [e.id, plainCopy(e)]))));
      this.objectives = state.objectives.map(list => Object.assign(Object.create(null), Object.fromEntries(list.map(e => [e.id, plainCopy(e)]))));
      this.reveals = state.reveals.map(plainCopy); this.nextRevealId = state.nextRevealId;
      // Current visibility is derived and deliberately absent from the save.
      // Restore it without changing the next logical refresh deadline.
      this.update(game, true); this.nextRefreshAt = state.nextRefreshAt;
      this.explored = state.explored.map(chunks => unpack(chunks, count));
      this.structures = state.structures.map(list => Object.assign(Object.create(null), Object.fromEntries(list.map(e => [e.id, plainCopy(e)]))));
      this.objectives = state.objectives.map(list => Object.assign(Object.create(null), Object.fromEntries(list.map(e => [e.id, plainCopy(e)]))));
    }
  }

  function validateState(state, map, time) {
    const obj = value => value && typeof value === 'object' && !Array.isArray(value);
    const num = (v, min = 0, max = 1e9) => finite(v) && v >= min && v <= max;
    const id = v => typeof v === 'string' && v.length > 0 && v.length <= 96;
    const pt = e => num(e.x, 0, map.width) && num(e.y, 0, map.height);
    const pair = value => Array.isArray(value) && value.length === 2;
    if (!obj(state) || state.version !== 1 || state.profile !== PROFILE || !num(state.nextRefreshAt, 0, time + 0.101) || !Number.isInteger(state.nextRevealId) || !num(state.nextRevealId)) return false;
    const count = Math.ceil(map.width / CELL) * Math.ceil(map.height / CELL), textSize = Math.ceil(count / 4);
    if (!pair(state.explored) || !state.explored.every(chunks => Array.isArray(chunks) && chunks.length > 0 && chunks.length <= 16 && chunks.every(text => typeof text === 'string' && text.length > 0 && text.length <= 2048 && /^[0-9a-f]+$/.test(text)) && chunks.join('').length === textSize)) return false;
    if (!pair(state.structures) || !pair(state.objectives)) return false;
    for (const list of state.structures) {
      if (!Array.isArray(list) || list.length > 64 || new Set(list.map(e => e && e.id)).size !== list.length) return false;
      if (!list.every(e => obj(e) && id(e.id) && typeof e.name === 'string' && e.name.length <= 128 && structure(e) && [0, 1].includes(e.team) && pt(e) && num(e.r, 1, 200) && num(e.range, 0, 1000) &&
        ['top', 'mid', 'bot', 'base'].includes(e.lane) && ['outer', 'inner', 'base', 'inhibitor', 'nexus'].includes(e.structureTier) &&
        num(e.hp) && num(e.maxHp, 1) && e.hp <= e.maxHp + 0.001 && typeof e.alive === 'boolean' && typeof e.protected === 'boolean' &&
        (e.alive ? e.hp > 0 : e.hp === 0) && num(e.observedAt, 0, time + 1e-6))) return false;
    }
    for (const list of state.objectives) {
      if (!Array.isArray(list) || list.length > 16 || new Set(list.map(e => e && e.id)).size !== list.length) return false;
      if (!list.every(e => obj(e) && id(e.id) && typeof e.name === 'string' && e.name.length <= 128 && ['camp', 'dragon', 'boss'].includes(e.kind) &&
        num(e.homeX, 0, map.width) && num(e.homeY, 0, map.height) && ['present', 'dead', 'pending', 'absent'].includes(e.presence) &&
        (e.presence === 'absent' ? !Object.hasOwn(e, 'alive') && !Object.hasOwn(e, 'respawnAt') : typeof e.alive === 'boolean' && num(e.respawnAt) && e.alive === (e.presence === 'present')) &&
        num(e.observedAt, 0, time + 1e-6))) return false;
    }
    if (!Array.isArray(state.reveals) || state.reveals.length > 128 || new Set(state.reveals.map(e => e && e.id)).size !== state.reveals.length) return false;
    return state.reveals.every(e => obj(e) && id(e.id) && /^origin-\d+$/.test(e.id) && Number(e.id.slice(7)) <= state.nextRevealId && id(e.sourceId) && [0, 1].includes(e.team) && pt(e) &&
      e.radius === REVEAL_RADIUS && num(e.createdAt, 0, time + 1e-6) && num(e.expiresAt, e.createdAt, time + REVEAL_TIME + 1e-6));
  }

  const api = { Vision, PROFILE, CELL, REFRESH, REVEAL_TIME, REVEAL_RADIUS, validateState };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.NexusVision = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
