(function (root) {
  'use strict';

  // Every physics/geometry coefficient below is prototype tuning, not a recovered
  // Fortress client constant. Published catalog values enter an explicit model.
  const WIDTH = 1800, HEIGHT = 820, HALF_W = 18, HALF_H = 14;
  const FIXED_DT = 1 / 120;
  const DEFAULTS = {
    gravity: 320, windAcceleration: 9, maxLaunchSpeed: 1050,
    minLaunchSpeed: 90, damageScale: 0.75, terrainScale: 1, turnTime: 25,
    movementPixelsPerUnit: 2, moveSpeed: 88, tankGravity: 520,
    collisionStep: 1, maxFlightTime: 12, maxResolutionTime: 17
  };
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  // A null recovered value means unknown. It must never become numeric zero.
  const finite = (n, fallback) => (typeof n === 'number' || typeof n === 'string' && n.trim() !== '') && Number.isFinite(Number(n)) ? Number(n) : fallback;
  const clone = obj => JSON.parse(JSON.stringify(obj));
  const rad = deg => deg * Math.PI / 180;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function makeRandom(seed) {
    let value = (Number(seed) >>> 0) || 0x9e3779b9;
    return function () {
      value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
      return (value >>> 0) / 4294967296;
    };
  }

  function fallbackCatalog(profile) {
    const make = (id, name, color) => ({
      id, name, color, hp: profile === 'blue3' ? 2200 : 950,
      delay: 560, movement: 40, aimMin: 0, aimMax: 85, body: 'cannon',
      provenance: { kind: 'prototype_fallback_only' },
      weapons: [
        { id: 'shell', name: '일반탄', kind: 'shell', attack: 280, radius: 55, terrainRadius: 48, shots: 1, spread: 0, delay: 100, unlockRound: 1 },
        { id: 'burst', name: '확산탄', kind: 'multi', attack: 120, radius: 42, terrainRadius: 38, shots: 3, spread: 6, delay: 200, unlockRound: 1 },
        { id: 'heavy', name: '강화탄', kind: 'shell', attack: 520, radius: 75, terrainRadius: 64, shots: 1, spread: 0, delay: 250, unlockRound: 3 },
        { id: 'barrier', name: '보호막', kind: 'shield', attack: 0, radius: 0, terrainRadius: 0, shieldValue: 300, shots: 1, delay: 160, unlockRound: 1 }
      ].slice(0, profile === 'blue3' ? 4 : 2)
    });
    return [make('catapult', '캐터펄트', '#7fb96d'), make('cannon', '캐논', '#e0a754')];
  }

  function makeTerrain(mapId, seed) {
    const mask = new Uint8Array(WIDTH * HEIGHT);
    const rng = makeRandom(seed ^ 0x79a3c61b);
    const phase = rng() * Math.PI * 2;
    let solidCount = 0;
    for (let x = 0; x < WIDTH; x++) {
      let top, bottom;
      if (mapId === 'islands') {
        const islands = [[45, 365], [420, 800], [865, 1230], [1290, 1760]];
        const island = islands.find(v => x >= v[0] && x <= v[1]);
        if (!island) continue;
        const u = (x - island[0]) / (island[1] - island[0]);
        top = 530 + Math.sin(x / 145 + phase) * 35 + Math.cos(u * Math.PI * 2) * 20;
        bottom = top + 95 + Math.sin(u * Math.PI) * 70;
      } else if (mapId === 'foundry') {
        const column = Math.floor(x / 225);
        top = 480 + (column % 3) * 55 + Math.sin(x / 70) * 6;
        bottom = 720;
        if ((x > 795 && x < 845) || (x > 1180 && x < 1220)) continue;
      } else {
        top = 530 + Math.sin(x / 205 + phase) * 48 + Math.sin(x / 71) * 16;
        bottom = 735 + Math.sin(x / 315) * 16;
      }
      top = clamp(Math.round(top), 360, 640);
      bottom = clamp(Math.round(bottom), top + 50, HEIGHT - 50);
      for (let y = top; y <= bottom; y++) { mask[y * WIDTH + x] = 1; solidCount++; }
    }
    return {
      width: WIDTH, height: HEIGHT, mask, version: 1, mapId, seed, solidCount,
      solid(x, y) {
        x = Math.floor(x); y = Math.floor(y);
        return x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT && mask[y * WIDTH + x] !== 0;
      },
      surfaceAt(x, startY) {
        x = Math.floor(x);
        if (x < 0 || x >= WIDTH) return null;
        for (let y = Math.max(0, Math.floor(finite(startY, 0))); y < HEIGHT; y++) {
          if (mask[y * WIDTH + x]) return y;
        }
        return null;
      }
    };
  }

  class FortEngine {
    constructor(options) {
      options = options || {};
      const data = root.FortData || globalThis.FortData || {};
      this.data = data;
      this.config = Object.assign({
        profile: 'classic', map: 'highlands', teamSize: 2,
        playerTank: 'catapult', opponentTank: 'cannon', control: 'ai',
        difficulty: 'normal', seed: 123
      }, options);
      this.config.profile = this.config.profile === 'blue3' ? 'blue3' : 'classic';
      const aiming = data.aiming || {}, angleProfiles = aiming.angleProfiles || {};
      const defaultAngleProfile = typeof aiming.defaultAngleProfile === 'string' ? aiming.defaultAngleProfile : 'jp2003';
      this.config.angleProfile = Object.prototype.hasOwnProperty.call(angleProfiles, this.config.angleProfile) ? this.config.angleProfile :
        (Object.prototype.hasOwnProperty.call(angleProfiles, defaultAngleProfile) ? defaultAngleProfile : 'jp2003');
      this.config.teamSize = this.config.profile === 'blue3' ? 4 :
        ([1, 2, 4].includes(Number(this.config.teamSize)) ? Number(this.config.teamSize) : 2);
      this.config.control = this.config.control === 'hotseat' ? 'hotseat' : 'ai';
      this.config.seed = finite(this.config.seed, 123) >>> 0;
      this.onEvent = typeof options.onEvent === 'function' ? options.onEvent : function () {};
      this.random = makeRandom(this.config.seed);
      this.tuning = Object.assign({}, DEFAULTS, data.tuningDefaults || {}, options.tuning || {});
      for (const key of Object.keys(DEFAULTS)) this.tuning[key] = finite(this.tuning[key], DEFAULTS[key]);
      this.tuning.gravity = clamp(this.tuning.gravity, 20, 1600);
      this.tuning.windAcceleration = clamp(this.tuning.windAcceleration, 0, 60);
      this.tuning.maxLaunchSpeed = clamp(this.tuning.maxLaunchSpeed, 200, 2000);
      this.tuning.minLaunchSpeed = clamp(this.tuning.minLaunchSpeed, 10, this.tuning.maxLaunchSpeed - 10);
      this.tuning.damageScale = clamp(this.tuning.damageScale, 0.05, 4);
      this.tuning.terrainScale = clamp(this.tuning.terrainScale, 0.1, 3);
      this.tuning.turnTime = clamp(this.tuning.turnTime, 5, 90);
      // Pixel terrain may retain a one-pixel wall after an explosion. Never
      // advance farther than one mask pixel between collision probes.
      this.tuning.collisionStep = clamp(this.tuning.collisionStep, 0.5, 1);
      this.tuning.movementPixelsPerUnit = clamp(this.tuning.movementPixelsPerUnit, 0.25, 6);
      this.tuning.moveSpeed = clamp(this.tuning.moveSpeed, 20, 220);
      this.tuning.tankGravity = clamp(this.tuning.tankGravity, 40, 2000);
      this.tuning.maxFlightTime = clamp(this.tuning.maxFlightTime, 2, 20);
      this.tuning.maxResolutionTime = clamp(this.tuning.maxResolutionTime, this.tuning.maxFlightTime + 2, 25);
      const profiles = Array.isArray(data.profiles) ? data.profiles : [];
      this.profile = profiles.find(p => p.id === this.config.profile) || {
        id: this.config.profile, turnLimit: 25,
        suddenDeathRound: this.config.profile === 'blue3' ? 8 : 14,
        maxRound: this.config.profile === 'blue3' ? 10 : 24
      };
      this._turnLimit = options.tuning && options.tuning.turnTime !== undefined ? this.tuning.turnTime :
        clamp(finite(this.profile.turnLimit, this.tuning.turnTime), 5, 90);
      this._maxRound = this.config.profile === 'blue3' ? 10 : clamp(finite(this.profile.maxRound, 24), 6, 50);
      this._suddenRound = this.config.profile === 'blue3' ? 8 :
        clamp(finite(this.profile.suddenDeathRound, 14), 3, this._maxRound);
      this.catalog = (data.catalogs && data.catalogs[this.config.profile]) || fallbackCatalog(this.config.profile);
      if (!Array.isArray(this.catalog) || !this.catalog.length) this.catalog = fallbackCatalog(this.config.profile);
      this.terrain = makeTerrain(this.config.map, this.config.seed);
      this.state = {
        phase: 'transition', paused: false, tanks: [], activeId: null,
        round: 1, turnNumber: 0, wind: 0, timeLeft: this._turnLimit,
        projectiles: [], winner: null, simTime: 0, power: 65,
        weaponIndex: 0, feed: [], turnOrder: [], suddenDeath: false,
        mines: [], hazards: [], endReason: null, itemUsed: false, lastAction: null
      };
      this._accumulator = 0;
      this._launchQueue = [];
      this._acted = new Set();
      this._transitionLeft = 0;
      this._resolutionTime = 0;
      this._settlingTime = 0;
      this._itemUsed = false;
      this._teleportArmed = false;
      this._turnExtraDelay = 0;
      this._turnTimeUsed = 0;
      this._moveSpent = 0;
      this._shotDelay = 0;
      this._scheduleClock = 0;
      this._trajectoryCache = null;
      this._volleyCounter = 0;
      this._shotCounter = 0;
      this._action = null;
      this._hazardTerrainVersion = this.terrain.version;
      this._aiSearch = null;
      this._aiWorkRemaining = 0;
      this._stats = { shots: 0, explosions: 0, damage: 0, turns: 0, terrainRemoved: 0 };
      this._spawnTeams();
      this._beginNextTurn();
    }

    get active() { return this.state.tanks.find(t => t.uid === this.state.activeId) || null; }

    _emit(type, values) {
      const event = Object.assign({ type, simTime: this.state.simTime }, values || {});
      if (event.sourceTeam === undefined && ['shot', 'explosion', 'item', 'heal'].includes(type)) event.sourceTeam = event.team;
      if (event.targetTeam === undefined && ['damage', 'death', 'heal'].includes(type)) event.targetTeam = event.team;
      if (event.text) {
        this.state.feed.push(event);
        if (this.state.feed.length > 14) this.state.feed.shift();
      }
      try { this.onEvent(event); } catch (_) { /* UI failures cannot stall a match. */ }
    }

    _spawnTeams() {
      const n = this.config.teamSize;
      for (let team = 0; team < 2; team++) {
        const wanted = team === 0 ? this.config.playerTank : this.config.opponentTank;
        const preferred = this.catalog.find(d => d.id === wanted) || this.catalog[team % this.catalog.length];
        for (let i = 0; i < n; i++) {
          const def = i === 0 ? preferred : this.catalog[(this.catalog.indexOf(preferred) + i) % this.catalog.length];
          let x = n === 1 ? (team ? 1330 : 470) :
            (team ? 1040 : 190) + (i + 0.5) * (570 / n);
          x += (this.random() - 0.5) * 36;
          x = this._findSpawn(x);
          const surface = this.terrain.surfaceAt(x);
          const hp = Math.max(1, finite(def.hp, 950));
          const delay = Math.max(100, finite(def.delay, 550));
          const move = clamp(finite(def.movement, 40) * this.tuning.movementPixelsPerUnit, 15, 220);
          const aim = this._resolveAiming({ def, typeId: def.id }, (def.weapons || [])[0]);
          const angle = clamp(45, aim.min, aim.max);
          this.state.tanks.push({
            uid: 't' + team + '_' + i, typeId: def.id, name: def.name || def.id,
            team, x, y: (surface === null ? 540 : surface) - HALF_H,
            vx: 0, vy: 0, hp, maxHp: hp, angle, face: team ? -1 : 1,
            tilt: 0, alive: true, delay, nextDelay: delay + i * 7 + team * 3,
            moveLeft: move, maxMove: move, status: {},
            inventory: { repair: 1, shield: 1, double: 1, teleport: 1 }, def
          });
        }
      }
      for (const tank of this.state.tanks) this._updateTilt(tank);
    }

    _findSpawn(desired) {
      for (let offset = 0; offset < 450; offset += 8) {
        for (const sign of [1, -1]) {
          const x = clamp(desired + offset * sign, 35, WIDTH - 35);
          const y = this.terrain.surfaceAt(x);
          if (y !== null && this.terrain.surfaceAt(x - 12) !== null && this.terrain.surfaceAt(x + 12) !== null &&
              this.state.tanks.every(t => Math.abs(t.x - x) > 48)) return x;
        }
      }
      return clamp(desired, 35, WIDTH - 35);
    }

    _weapons(tank) { return (tank && Array.isArray(tank.def.weapons) ? tank.def.weapons : []).slice(0, this.config.profile === 'blue3' ? 4 : 2); }
    _weapon(tank, index) { return this._weapons(tank)[index] || null; }
    _available(weapon) { return !!weapon && finite(weapon.unlockRound, 1) <= this.state.round; }
    _behavior(weapon) {
      const b = weapon && weapon.behavior || {};
      const role = weapon && weapon.role || b.role || (weapon && weapon.kind === 'shield' ? 'support' : 'attack');
      return {
        role: role === 'support' ? 'support' : 'attack',
        delivery: weapon && weapon.delivery || (weapon && weapon.kind === 'shield' ? 'self' : 'projectile'),
        trajectory: b.trajectory === 'linear' ? 'linear' : 'ballistic',
        bounces: clamp(Math.round(finite(b.bounces, 0)), 0, 5),
        restitution: clamp(finite(b.restitution, 0.72), 0.1, 0.95),
        lifeSteal: clamp(finite(b.lifeSteal, 0), 0, 1),
        repeatable: role !== 'support' && b.repeatable !== false,
        homingTarget: b.homingTarget === 'enemy' ? 'enemy' : 'all',
        aimMin: b.aimMin, aimMax: b.aimMax
      };
    }
    _resolveAiming(tank, weapon) {
      const def = tank && tank.def || {}, b = this._behavior(weapon), spec = this.data.aiming || {};
      const isClassic = this.config.profile === 'classic';
      const angleProfileId = isClassic ? this.config.angleProfile : 'blue3_catalog';
      const profile = isClassic && spec.angleProfiles && spec.angleProfiles[angleProfileId];
      const bounds = profile && profile.bounds && profile.bounds[tank && (tank.typeId || def.id)];
      const knownMin = finite(bounds && bounds.min, null), knownMax = finite(bounds && bounds.max, null);
      const sourceComplete = knownMin !== null && knownMax !== null && knownMin <= knownMax;
      const weaponMin = finite(b.aimMin, null), weaponMax = finite(b.aimMax, null);
      const weaponOverride = weaponMin !== null || weaponMax !== null;
      const min = clamp(finite(weaponMin, finite(knownMin, finite(def.aimMin, 0))), -85, 90);
      const max = clamp(finite(weaponMax, finite(knownMax, finite(def.aimMax, 85))), min, 90);
      const catalogSources = def.provenance && def.provenance.statSources || [];
      const catalogAngleSources = catalogSources.filter(s => s.field === 'aimMin' || s.field === 'aimMax');
      const catalogStatus = catalogAngleSources.length && catalogAngleSources.every(s => s.status === 'source_reported') ? 'source_reported' : 'simulation_assumption';
      const angleProfileStatus = weaponOverride ? 'simulation_assumption' : sourceComplete ?
        (bounds.status || profile.status || 'source_reported') : profile ? 'simulation_assumption' : catalogStatus;
      const defaults = spec.powerDefaults || {}, tankRuntime = def.aimingRuntime || {}, weaponRuntime = weapon && weapon.aimingRuntime || {};
      const runtime = (key, fallback) => finite(weaponRuntime[key], finite(tankRuntime[key], fallback));
      const powerMin = clamp(runtime('powerMin', finite(defaults.min, 0)), 0, 100);
      const powerMax = clamp(runtime('powerMax', finite(defaults.max, 100)), powerMin, 100);
      const powerStep = clamp(finite(defaults.step, 1) > 0 ? finite(defaults.step, 1) : 1, .001, 100);
      const hasPowerOverride = ['powerMin', 'powerMax', 'chargeRate'].some(k => finite(tankRuntime[k], null) !== null || finite(weaponRuntime[k], null) !== null);
      return {
        min, max, powerMin, powerMax, powerStep,
        chargeRate: Math.max(0, runtime('chargeRate', finite(defaults.chargeRate, 72))),
        chargeCycle: defaults.cycle === 'clamp' ? 'clamp' : 'ping_pong',
        angleProfileId, angleProfileStatus,
        angleProfileLabel: isClassic ? profile && profile.label || 'JP 2003' : 'BLUE3 구현값',
        angleFallbackApplied: !isClassic || !sourceComplete || weaponOverride,
        angleSourceRefs: sourceComplete && !weaponOverride ? (bounds.sourceRefs || []).slice() :
          weaponOverride ? [] : Array.from(new Set(catalogAngleSources.flatMap(s => s.sourceRefs || []))),
        powerStatus: hasPowerOverride ? 'simulation_assumption' : defaults.status || 'simulation_assumption',
        velocityScale: Math.max(0, runtime('velocityScale', 1)),
        gravityScale: Math.max(0, runtime('gravityScale', 1)),
        windScale: Math.max(0, runtime('windScale', 1))
      };
    }
    _aimLimits(tank, weapon) { return this._resolveAiming(tank, weapon); }
    _normalizePower(value, aim) {
      const p = clamp(finite(value, 65), aim.powerMin, aim.powerMax);
      if (p <= aim.powerMin || p >= aim.powerMax) return p;
      const stepped = aim.powerMin + Math.round((p - aim.powerMin) / aim.powerStep) * aim.powerStep;
      return clamp(Number(stepped.toFixed(8)), aim.powerMin, aim.powerMax);
    }
    _directionToWorld(tank, x, y) {
      const dx = x - tank.x, dy = y - (tank.y - 4), tilt = finite(tank.tilt, 0);
      if (Math.hypot(dx, dy) < 1e-9) return null;
      const localX = Math.cos(tilt) * dx + Math.sin(tilt) * dy;
      const localY = -Math.sin(tilt) * dx + Math.cos(tilt) * dy;
      return { face: Math.abs(localX) < 1e-9 ? tank.face : localX < 0 ? -1 : 1,
        angle: Math.atan2(-localY, Math.abs(localX)) * 180 / Math.PI };
    }
    getAimingState() {
      const t = this.active; if (!t) return null;
      const w = this._weapon(t, this.state.weaponIndex), weapon = this._teleportArmed ? this._teleportWeapon(w) : w;
      const aim = this._resolveAiming(t, weapon), localAngle = clamp(finite(t.angle, 45), aim.min, aim.max);
      const terrainAngle = -t.face * finite(t.tilt, 0) * 180 / Math.PI;
      return Object.assign({}, aim, { localAngle, terrainAngle, actualElevation: localAngle + terrainAngle,
        face: t.face, power: this._normalizePower(this.state.power, aim) });
    }
    getChargePower(elapsedSeconds) {
      const aim = this.getAimingState(); if (!aim) return null;
      const elapsed = Math.max(0, finite(elapsedSeconds, 0)), span = aim.powerMax - aim.powerMin;
      if (span <= 0 || aim.chargeRate === 0) return aim.powerMin;
      const progress = aim.chargeCycle === 'clamp' ? Math.min(span, elapsed * aim.chargeRate) :
        (elapsed % (2 * span / aim.chargeRate)) * aim.chargeRate;
      const value = aim.powerMin + (progress <= span ? progress : 2 * span - progress);
      return this._normalizePower(value, aim);
    }
    setAimAtWorld(x, y) {
      x = finite(x, null); y = finite(y, null);
      if (!this.isHumanTurn() || x === null || y === null) return false;
      const direction = this._directionToWorld(this.active, x, y); if (!direction) return false;
      const aim = this.getAimingState();
      this.active.face = direction.face; this.active.angle = clamp(direction.angle, aim.min, aim.max);
      return true;
    }
    _attackMultiplier(tank) {
      let value = tank.status.attackBuff ? finite(tank.status.attackBuff.multiplier, 1) : 1;
      for (const passive of tank.def.passives || []) {
        if (passive.id === 'low_hp_attack_boost' && tank.hp <= tank.maxHp * finite(passive.hpRatioAtMost, 0.5)) {
          value *= clamp(finite(passive.attackMultiplier, 1), 0.1, 4);
        }
      }
      return value;
    }
    _teleportWeapon(weapon) {
      return Object.assign({}, weapon, { kind: 'teleport', attack: 0, radius: 0, terrainRadius: 0, shots: 1,
        spread: 0, role: 'support', delivery: 'projectile', effect: null, aimingRuntime: null,
        behavior: { trajectory: 'ballistic', bounces: 0, lifeSteal: 0, role: 'support', repeatable: false, homingTarget: 'enemy' } });
    }
    getActionPreview() {
      const t = this.active;
      if (!t) return null;
      const w = this._weapon(t, this.state.weaponIndex), b = this._behavior(w);
      const teleport = !!this._teleportArmed, aim = this.getAimingState();
      const role = teleport ? 'support' : b.role;
      const delivery = teleport ? 'projectile' : b.delivery;
      const repeated = !teleport && b.repeatable && delivery !== 'self';
      const repeat = repeated ? Math.max(this.config.profile === 'blue3' && this.state.suddenDeath ? 3 : 1,
        clamp(finite(t.status.double, 1), 1, 3)) : 1;
      const shots = delivery === 'self' ? 0 : (teleport ? 1 : clamp(Math.round(finite(w && w.shots, 1)), 1, 12)) * repeat;
      const canFire = this.isHumanTurn() && this._available(w);
      return {
        canFire, reason: canFire ? null : (!this._available(w) ? 'locked_weapon' : this.state.paused ? 'paused' : this.state.phase !== 'aim' ? this.state.phase : 'ai_turn'),
        ownerId: t.uid, team: t.team, tankName: t.name,
        weaponId: teleport ? 'item_teleport' : w && w.id,
        weaponName: teleport ? '이동탄' : w && w.name,
        kind: teleport ? 'teleport' : w && w.kind, role, delivery, isSupport: role === 'support',
        angle: aim.localAngle, localAngle: aim.localAngle, terrainAngle: aim.terrainAngle, actualElevation: aim.actualElevation,
        power: aim.power, face: t.face, wind: this.state.wind,
        aimMin: aim.min, aimMax: aim.max, repeat, shots, projectileCount: shots,
        powerMin: aim.powerMin, powerMax: aim.powerMax, powerStep: aim.powerStep,
        chargeRate: aim.chargeRate, chargeCycle: aim.chargeCycle,
        angleProfileId: aim.angleProfileId, angleProfileStatus: aim.angleProfileStatus,
        angleFallbackApplied: aim.angleFallbackApplied, powerStatus: aim.powerStatus,
        itemUsed: this.state.itemUsed, doubleArmed: !!t.status.double, teleportArmed: teleport
      };
    }
    _actionPayload(action, reason) {
      return {
        volleyId: action.volleyId, ownerId: action.ownerId, team: action.team, sourceTeam: action.team,
        tankName: action.tankName, weaponName: action.weaponName, weaponId: action.weaponId, role: action.role,
        delivery: action.delivery, isSupport: action.role === 'support',
        angle: action.angle, power: action.power, face: action.face, wind: action.wind,
        localAngle: action.localAngle, terrainAngle: action.terrainAngle, actualElevation: action.actualElevation,
        aimMin: action.aimMin, aimMax: action.aimMax, powerMin: action.powerMin, powerMax: action.powerMax, powerStep: action.powerStep,
        angleProfileId: action.angleProfileId, angleProfileStatus: action.angleProfileStatus, powerStatus: action.powerStatus,
        shots: action.ended ? action.releasedShots : action.shots,
        damageToEnemy: action.damageToEnemy, friendlyDamage: action.friendlyDamage, kills: action.kills,
        hits: action.hitTargets.size, heal: action.heal, terrainRemoved: action.terrainRemoved,
        reason: reason || null
      };
    }
    _startAction(preview) {
      this._action = Object.assign({}, preview, {
        volleyId: 'v' + (++this._volleyCounter), releasedShots: 0, damageToEnemy: 0, friendlyDamage: 0,
        kills: 0, heal: 0, terrainRemoved: 0, hitTargets: new Set(), impacts: 0, misses: 0,
        ended: false, outcome: preview.delivery === 'self' ? 'support' : null
      });
      this._emit('actionStart', this._actionPayload(this._action));
    }
    _endAction(reason) {
      const a = this._action;
      if (!a || a.ended) return;
      a.ended = true;
      const outcome = reason || a.outcome || (a.damageToEnemy > 0 || a.friendlyDamage > 0 ? 'hit' : a.impacts ? 'terrain' : 'miss');
      const payload = this._actionPayload(a, outcome);
      this.state.lastAction = clone(payload);
      this._emit('actionEnd', payload);
      this._action = null;
    }
    _projectileContext(p) {
      return { shotId: p.shotId || null, volleyId: p.volleyId || null, ownerId: p.ownerId || null,
        sourceTeam: p.team, triggered: !!p.triggered };
    }
    isHumanTurn() {
      return this.state.phase === 'aim' && !this.state.paused && !!this.active && this.active.alive &&
        (this.config.control === 'hotseat' || this.active.team === 0);
    }
    setAngle(value) {
      value = finite(value, null);
      if (!this.isHumanTurn() || value === null) return false;
      const w = this._weapon(this.active, this.state.weaponIndex);
      const aim = this._aimLimits(this.active, this._teleportArmed ? this._teleportWeapon(w) : w);
      this.active.angle = clamp(value, aim.min, aim.max);
      return true;
    }
    setPower(value) {
      value = finite(value, null);
      if (!this.isHumanTurn() || value === null) return false;
      this.state.power = this._normalizePower(value, this.getAimingState()); return true;
    }
    setFacing(value) {
      if (!this.isHumanTurn() || (value !== -1 && value !== 1)) return false;
      this.active.face = value; return true;
    }
    setWeapon(index) {
      if (!this.isHumanTurn() || !Number.isInteger(index) || !this._available(this._weapon(this.active, index))) return false;
      this.state.weaponIndex = index;
      const w = this._weapon(this.active, index);
      const aim = this._aimLimits(this.active, this._teleportArmed ? this._teleportWeapon(w) : w);
      this.active.angle = clamp(this.active.angle, aim.min, aim.max);
      this.state.power = this._normalizePower(this.state.power, aim);
      return true;
    }
    setPaused(value) {
      if (this.state.phase === 'gameover') return false;
      this.state.paused = !!value; return true;
    }
    move(direction, dt) {
      if (!this.isHumanTurn()) return false;
      return this._moveInternal(direction, dt);
    }

    _moveInternal(direction, dt) {
      const t = this.active;
      if (!t || !t.alive || t._boundThisTurn || t.moveLeft <= 0 || !Number.isFinite(Number(direction))) return false;
      const dir = Math.sign(direction);
      if (!dir) return false;
      dt = clamp(finite(dt, 0), 0, 0.2);
      let budget = Math.min(t.moveLeft, this.tuning.moveSpeed * dt);
      if (budget <= 0) return false;
      t.face = dir;
      let moved = 0;
      while (budget > 0.001) {
        const step = Math.min(1, budget), nx = t.x + dir * step;
        if (nx < HALF_W || nx > WIDTH - HALF_W) break;
        if (this.state.tanks.some(other => other.alive && other !== t && Math.abs(other.x - nx) < 31 && Math.abs(other.y - t.y) < 27)) break;
        if (this.terrain.solid(nx + dir * 10, t.y - 9)) break;
        const ground = this.terrain.surfaceAt(nx, Math.max(0, t.y + HALF_H - 18));
        t.x = nx;
        if (ground !== null && ground <= t.y + HALF_H + 22) { t.y = ground - HALF_H; t.vy = 0; }
        moved += step; budget -= step;
      }
      t.moveLeft = Math.max(0, t.moveLeft - moved);
      this._moveSpent += moved;
      this._updateTilt(t);
      this._triggerMines();
      return moved > 0;
    }

    useItem(id) {
      if (!this.canUseItem(id)) return false;
      return this._useItemInternal(id);
    }
    canUseItem(id) { return this.isHumanTurn() && this._canUseItemInternal(id); }
    _canUseItemInternal(id) {
      const t = this.active;
      if (!['repair', 'shield', 'double', 'teleport'].includes(id) || !t || !t.alive || this.state.itemUsed ||
          this.state.phase !== 'aim' || this.state.paused || !(t.inventory[id] > 0)) return false;
      if (id === 'repair' && t.hp >= t.maxHp) return false;
      if (id === 'shield' && t.status.shield > 0) return false;
      if (id === 'double' && (t.status.double > 1 || (this.config.profile === 'blue3' && this.state.suddenDeath))) return false;
      if (id === 'teleport' && this._teleportArmed) return false;
      return true;
    }
    _useItemInternal(id) {
      const t = this.active;
      if (!this._canUseItemInternal(id)) return false;
      const fallback = { repair: 0.2, shield: 1, double: 2, teleport: 0 };
      const defs = Array.isArray(this.data.items) ? this.data.items : [];
      const def = defs.find(v => v.id === id) || {};
      const v = def.profileValues && def.profileValues[this.config.profile] !== undefined ?
        def.profileValues[this.config.profile] : finite(def.value, fallback[id]);
      t.inventory[id]--; this._itemUsed = true; this.state.itemUsed = true;
      this._turnExtraDelay += Math.max(0, finite(def.delay, 100));
      if (id === 'repair') {
        const fraction = clamp(v > 1 ? v / 100 : v, 0, 1);
        const amount = Math.min(t.maxHp - t.hp, Math.round(t.maxHp * fraction));
        t.hp += amount;
        this._emit('heal', { x: t.x, y: t.y, tankId: t.uid, team: t.team, value: amount, text: t.name + ' 회복 +' + amount });
      } else if (id === 'shield') t.status.shield = Math.max(1, Math.round(v));
      else if (id === 'double') t.status.double = clamp(Math.round(v), 2, 3);
      else {
        this._teleportArmed = true; t.status.teleport = true;
        const aim = this._aimLimits(t, this._teleportWeapon(this._weapon(t, this.state.weaponIndex)));
        t.angle = clamp(t.angle, aim.min, aim.max);
        this.state.power = this._normalizePower(this.state.power, aim);
      }
      this._emit('item', { x: t.x, y: t.y, tankId: t.uid, team: t.team, kind: id, text: (def.name || id) + ' 사용' });
      return true;
    }

    fire() { return this.isHumanTurn() ? this._fireInternal() : false; }
    _fireInternal() {
      const t = this.active, w = this._weapon(t, this.state.weaponIndex);
      if (!t || !t.alive || this.state.paused || this.state.phase !== 'aim' || !this._available(w)) return false;
      const aim = this.getAimingState(); t.angle = aim.localAngle; this.state.power = aim.power;
      const preview = this.getActionPreview(), behavior = this._behavior(w);
      this._startAction(preview);
      this._shotDelay = Math.max(0, finite(w.delay, this.state.weaponIndex ? 200 : 100));
      this._resolutionTime = 0; this._settlingTime = 0;
      if (preview.delivery === 'self') {
        if (finite(w.shieldValue, 0) > 0) t.status.barrier = (t.status.barrier || 0) + w.shieldValue;
        else if (!w.effect) t.status.shield = Math.max(1, t.status.shield || 0);
        if (w.effect && w.effect.type === 'attackBuff') t.status.attackBuff = {
          multiplier: clamp(finite(w.effect.multiplier, 1.2), 1, 3),
          turns: clamp(finite(w.effect.durationTurns, 2), 1, 5), appliedTurn: this.state.turnNumber
        };
        this._emit('item', { x: t.x, y: t.y, tankId: t.uid, ownerId: t.uid, volleyId: this._action.volleyId,
          team: t.team, kind: 'shield', text: t.name + ' · ' + w.name });
        this.state.phase = 'settling';
        return true;
      }
      const teleport = this._teleportArmed;
      const shotWeapon = teleport ? this._teleportWeapon(w) : w;
      // Repeat applies to attacks; a projectile-delivered utility stays single.
      const repeat = preview.repeat;
      const count = clamp(Math.round(finite(shotWeapon.shots, 1)), 1, 12);
      const spread = finite(shotWeapon.spread, 0);
      for (let rep = 0; rep < repeat; rep++) {
        for (let i = 0; i < count; i++) {
          const offset = (i - (count - 1) / 2) * spread;
          const p = this._newProjectile(t, shotWeapon, t.angle + offset, this.state.power);
          p.shotId = 's' + (++this._shotCounter); p.volleyId = this._action.volleyId;
          this._launchQueue.push({ time: this.state.simTime + rep * 0.48 + i * 0.045, projectile: p });
        }
      }
      this._launchQueue.sort((a, b) => a.time - b.time);
      if (!teleport && behavior.repeatable) delete t.status.double;
      delete t.status.teleport;
      this._teleportArmed = false;
      this.state.phase = 'projectile';
      this._emit('message', { text: t.name + ' · ' + (teleport ? '이동탄' : w.name || '발사'), team: t.team });
      this._releaseProjectiles();
      return true;
    }

    skip() {
      if (!this.isHumanTurn()) return false;
      this._emit('message', { text: this.active.name + ' 대기', team: this.active.team });
      this._shotDelay = 0; this._finishTurn(); return true;
    }

    _newProjectile(t, weapon, angle, power) {
      const a = rad(angle), c = Math.cos(t.tilt), s = Math.sin(t.tilt);
      const dx = t.face * Math.cos(a), dy = -Math.sin(a);
      const ux = dx * c - dy * s, uy = dx * s + dy * c;
      const aim = this._resolveAiming(t, weapon), resolvedPower = this._normalizePower(power, aim);
      // The common 90..1050 curve and optional scale are runtime fallbacks,
      // independent of the unknown source power/velocity data.
      const speed = (this.tuning.minLaunchSpeed + (this.tuning.maxLaunchSpeed - this.tuning.minLaunchSpeed) * resolvedPower / 100) * aim.velocityScale;
      const multiplier = this._attackMultiplier(t), behavior = this._behavior(weapon);
      const p = {
        x: t.x + ux * 28, y: t.y - 4 + uy * 28,
        vx: ux * speed, vy: uy * speed, kind: weapon.kind || 'shell',
        team: t.team, ownerId: t.uid, trail: [], radius: weapon.kind === 'laser' ? 3 : 5,
        age: 0, attack: Math.max(0, finite(weapon.attack, 200)) * multiplier,
        damageRadius: Math.max(0, finite(weapon.radius, 55)),
        terrainRadius: Math.max(0, finite(weapon.terrainRadius, 45)),
        effect: weapon.effect || null, dead: false, _trailStep: 0,
        homingTarget: null, weaponId: weapon.id || null, behavior,
        bouncesLeft: behavior.bounces, bounceCount: 0, power: resolvedPower,
        velocityScale: aim.velocityScale, gravityScale: aim.gravityScale, windScale: aim.windScale
      };
      // A muzzle offset is visual geometry, not permission to bypass nearby
      // terrain or another tank. Sweep the complete barrel-to-muzzle segment.
      const startX = t.x, startY = t.y - 4;
      const muzzleX = p.x, muzzleY = p.y;
      for (let i = 1; i <= 28; i++) {
        const x = startX + (muzzleX - startX) * i / 28;
        const y = startY + (muzzleY - startY) * i / 28;
        const hit = this._collision(p, x, y);
        if (hit) {
          p.x = x; p.y = y;
          p._muzzleHit = Object.assign(hit, { previousX: x - ux, previousY: y - uy });
          break;
        }
      }
      return p;
    }

    _releaseProjectiles() {
      while (this._launchQueue.length && this._launchQueue[0].time <= this.state.simTime + 0.000001) {
        const p = this._launchQueue.shift().projectile;
        this.state.projectiles.push(p); this._stats.shots++;
        if (this._action && this._action.volleyId === p.volleyId) this._action.releasedShots++;
        this._emit('shot', Object.assign({ x: p.x, y: p.y, team: p.team, kind: p.kind, tankId: p.ownerId }, this._projectileContext(p)));
      }
    }

    _steer(p, dt) {
      if (p.kind !== 'homing' || p.behavior.trajectory === 'linear' || p.vy < 0 || p.age < 0.2) return;
      const candidates = this.state.tanks.filter(t => t.alive && distance(t, p) < 360 &&
        (p.behavior.homingTarget !== 'enemy' || t.team !== p.team) && (t.uid !== p.ownerId || p.age > 0.6));
      candidates.sort((a, b) => distance(a, p) - distance(b, p));
      if (!candidates.length) return;
      const target = candidates[0], len = Math.max(1, distance(target, p));
      const speed = clamp(Math.hypot(p.vx, p.vy), 180, 750), blend = Math.min(1, dt * 3.8);
      p.vx += (((target.x - p.x) / len) * speed - p.vx) * blend;
      p.vy += (((target.y - p.y) / len) * speed - p.vy) * blend;
      p.homingTarget = target.uid;
    }

    _collision(p, x, y) {
      for (const t of this.state.tanks) {
        if (!t.alive || (t.uid === p.ownerId && p.age < 0.18)) continue;
        if (Math.abs(x - t.x) < HALF_W + p.radius && Math.abs(y - t.y) < HALF_H + p.radius &&
            ((x - t.x) ** 2 / (HALF_W + p.radius) ** 2 + (y - t.y) ** 2 / (HALF_H + p.radius) ** 2) <= 1) {
          return { kind: 'tank', tank: t, x, y };
        }
      }
      if (this.terrain.solid(x, y)) return { kind: 'terrain', x, y, contactX: x, contactY: y };
      if (this.terrain.solid(x, y + p.radius * 0.5)) return { kind: 'terrain', x, y, contactX: x, contactY: y + p.radius * 0.5 };
      return null;
    }

    _bounceProjectile(p, hit, previousX, previousY, prediction) {
      if (hit.kind !== 'terrain' || !(p.bouncesLeft > 0) || Math.hypot(p.vx, p.vy) < 65) return false;
      const cx = finite(hit.contactX, hit.x), cy = finite(hit.contactY, hit.y);
      let nx = 0, ny = 0;
      for (let d = -3; d <= 3; d++) {
        nx += Number(this.terrain.solid(cx - 3, cy + d)) - Number(this.terrain.solid(cx + 3, cy + d));
        ny += Number(this.terrain.solid(cx + d, cy - 3)) - Number(this.terrain.solid(cx + d, cy + 3));
      }
      const length = Math.hypot(nx, ny);
      if (length > 0) { nx /= length; ny /= length; }
      else if (Math.abs(p.vx) > Math.abs(p.vy)) { nx = -Math.sign(p.vx); ny = 0; }
      else { nx = 0; ny = -Math.sign(p.vy) || -1; }
      let dot = p.vx * nx + p.vy * ny;
      if (dot > 0) { nx = -nx; ny = -ny; dot = -dot; }
      p.vx = (p.vx - 2 * dot * nx) * p.behavior.restitution;
      p.vy = (p.vy - 2 * dot * ny) * p.behavior.restitution;
      p.x = previousX + nx * (p.radius + 1);
      p.y = previousY + ny * (p.radius + 1);
      p.bouncesLeft--; p.bounceCount++;
      if (!prediction) this._emit('bounce', Object.assign({ x: hit.x, y: hit.y, team: p.team, kind: p.kind,
        normal: { x: nx, y: ny }, bouncesLeft: p.bouncesLeft }, this._projectileContext(p)));
      return true;
    }

    _advanceProjectile(p, dt, prediction) {
      if (p._muzzleHit) {
        const hit = p._muzzleHit; delete p._muzzleHit;
        if (this._bounceProjectile(p, hit, hit.previousX, hit.previousY, prediction)) return null;
        return hit;
      }
      p.age += dt;
      this._steer(p, dt);
      if (p.behavior.trajectory !== 'linear') {
        p.vx += this.state.wind * this.tuning.windAcceleration * finite(p.windScale, 1) * dt;
        p.vy += this.tuning.gravity * finite(p.gravityScale, 1) * dt;
      }
      const dx = p.vx * dt, dy = p.vy * dt;
      const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / this.tuning.collisionStep));
      for (let i = 0; i < steps; i++) {
        const previousX = p.x, previousY = p.y;
        p.x += dx / steps; p.y += dy / steps;
        const hit = this._collision(p, p.x, p.y);
        if (hit) {
          if (this._bounceProjectile(p, hit, previousX, previousY, prediction)) return null;
          return hit;
        }
        if (p.x < -100 || p.x > WIDTH + 100 || p.y > HEIGHT + 60 || p.y < -2600 || p.age > this.tuning.maxFlightTime) {
          return { kind: 'void', x: p.x, y: p.y };
        }
      }
      if (!prediction && ++p._trailStep % 2 === 0) {
        p.trail.push({ x: p.x, y: p.y });
        if (p.trail.length > 30) p.trail.shift();
      }
      return null;
    }

    _impact(p, hit) {
      if (p.dead) return;
      p.dead = true;
      p.impactKind = hit.kind;
      const context = this._projectileContext(p);
      this._emit('impact', Object.assign({ x: p.x, y: p.y, team: p.team, kind: p.kind,
        impactKind: hit.kind, tankId: hit.tank ? hit.tank.uid : null }, context));
      if (this._action && this._action.volleyId === p.volleyId) {
        if (hit.kind === 'void') this._action.misses++;
        else this._action.impacts++;
      }
      if (hit.kind === 'void') return;
      if (p.kind === 'teleport') {
        const owner = this.state.tanks.find(t => t.uid === p.ownerId);
        if (owner && owner.alive) {
          owner.x = clamp(p.x, 25, WIDTH - 25);
          const ground = this.terrain.surfaceAt(owner.x, Math.max(0, p.y - 30));
          owner.y = ground !== null ? ground - HALF_H - 1 : Math.min(p.y - 25, HEIGHT - 50);
          owner.vx = 0; owner.vy = 0; this._updateTilt(owner);
          this._emit('item', Object.assign({ x: owner.x, y: owner.y, team: owner.team, tankId: owner.uid, kind: 'teleport', text: owner.name + ' 이동' }, context));
          if (this._action && this._action.volleyId === p.volleyId) this._action.outcome = 'teleport';
        }
        return;
      }
      if (p.kind === 'mine' && hit.kind !== 'tank') {
        this.state.mines.push({ x: p.x, y: p.y - 4, team: p.team, ownerId: p.ownerId, kind: 'mine', life: 6,
          age: 0, attack: p.attack, damageRadius: Math.max(42, p.damageRadius), terrainRadius: p.terrainRadius,
          shotId: p.shotId, volleyId: p.volleyId, behavior: p.behavior, triggered: false });
        this._hazardTerrainVersion = -1;
        this._emit('item', Object.assign({ x: p.x, y: p.y, team: p.team, kind: 'mine', text: '지뢰 설치' }, context));
        if (this._action && this._action.volleyId === p.volleyId) this._action.outcome = 'mine_placed';
        return;
      }
      const scale = p.kind === 'mine' ? 0.45 : 1;
      this._explode(p, p.x, p.y, scale, hit.tank);
    }

    _destroyTerrain(x, y, radius) {
      radius *= this.tuning.terrainScale;
      if (!(radius > 0)) return 0;
      const left = Math.max(0, Math.floor(x - radius)), right = Math.min(WIDTH - 1, Math.ceil(x + radius));
      const top = Math.max(0, Math.floor(y - radius)), bottom = Math.min(HEIGHT - 1, Math.ceil(y + radius));
      let removed = 0;
      for (let yy = top; yy <= bottom; yy++) {
        for (let xx = left; xx <= right; xx++) {
          if ((xx - x) ** 2 + (yy - y) ** 2 <= radius * radius) {
            const idx = yy * WIDTH + xx;
            if (this.terrain.mask[idx]) { this.terrain.mask[idx] = 0; removed++; }
          }
        }
      }
      if (removed) { this.terrain.version++; this.terrain.solidCount -= removed; this._stats.terrainRemoved += removed; }
      return removed;
    }

    _explode(p, x, y, attackScale, directTank) {
      const radius = Math.max(18, finite(p.damageRadius, 55));
      const context = Object.assign(this._projectileContext(p), { impactKind: p.impactKind || 'terrain' });
      const supported = this.state.tanks.filter(t => t.alive && this.terrain.solid(t.x, t.y + HALF_H));
      this._stats.explosions++;
      const removed = this._destroyTerrain(x, y, p.terrainRadius);
      if (this._action && this._action.volleyId === p.volleyId) this._action.terrainRemoved += removed;
      for (const t of supported) if (!this.terrain.solid(t.x, t.y + HALF_H)) t._fallContext = context;
      this._emit('explosion', Object.assign({ x, y, radius: Math.max(radius, p.terrainRadius), kind: p.kind, team: p.team }, context));
      let damageToEnemies = 0;
      for (const t of this.state.tanks) {
        if (!t.alive) continue;
        const d = Math.max(0, Math.hypot(t.x - x, t.y - y) - 14);
        if (d > radius && t !== directTank) continue;
        const falloff = t === directTank ? 1 : clamp(1 - d / (radius + 0.01), 0.1, 1);
        if (p.effect && p.effect.type === 'dispel' && t.team !== p.team) {
          delete t.status.shield; delete t.status.barrier; delete t.status.attackBuff;
          this._emit('message', { text: t.name + ' 강화 효과 해제', team: t.team });
          if (this._action && this._action.volleyId === p.volleyId) this._action.outcome = 'support_hit';
        }
        const damage = Math.max(0, Math.round(p.attack * this.tuning.damageScale * falloff * attackScale));
        const beforeHp = t.hp;
        const blocked = this._damage(t, damage, p.kind, false, p.team, p.ownerId, context);
        if (t.team !== p.team) damageToEnemies += beforeHp - t.hp;
        if (!blocked && t.alive) {
          if (p.kind === 'poison') { t.status.poison = Math.max(t.status.poison || 0, 3); t.status.poisonSourceTeam = p.team; t.status.poisonSourceId = p.ownerId; t.status.poisonContext = context; }
          if (p.kind === 'fire') { t.status.fire = Math.max(t.status.fire || 0, 2); t.status.fireSourceTeam = p.team; t.status.fireSourceId = p.ownerId; t.status.fireContext = context; }
          if (p.kind === 'water') t.status.bind = Math.max(t.status.bind || 0, 2);
          if (p.effect && p.effect.type === 'knockback') {
            const strength = clamp(finite(p.effect.strength, 65), 0, 240) * falloff;
            const away = Math.sign(t.x - x) || Math.sign(p.vx) || (p.team ? -1 : 1);
            t.vx += away * strength;
            t.vy -= strength * 0.7;
          }
        }
      }
      const lifeSteal = p.behavior && p.behavior.lifeSteal;
      const owner = this.state.tanks.find(t => t.uid === p.ownerId);
      if (lifeSteal > 0 && damageToEnemies > 0 && owner && owner.alive) {
        const amount = Math.min(owner.maxHp - owner.hp, Math.round(damageToEnemies * lifeSteal));
        if (amount > 0) {
          owner.hp += amount;
          if (this._action && this._action.volleyId === p.volleyId) this._action.heal += amount;
          this._emit('heal', Object.assign({ x: owner.x, y: owner.y, tankId: owner.uid, team: owner.team,
            targetTeam: owner.team, value: amount, kind: 'lifeSteal', text: owner.name + ' 흡혈 +' + amount }, context));
        }
      }
      if (p.kind === 'fire') this.state.hazards.push({ x, y, kind: 'fire', team: p.team, ownerId: p.ownerId,
        shotId: p.shotId, volleyId: p.volleyId, life: 3, radius: 36 });
      if (p.kind === 'fire') this._hazardTerrainVersion = -1;
    }

    // Returns true when an attack was fully blocked; periodic effects bypass tools.
    _damage(t, amount, kind, periodic, sourceTeam, sourceId, context) {
      if (!t.alive || amount <= 0) return false;
      if (!periodic && t.status.shield > 0) {
        t.status.shield--;
        this._emit('item', { x: t.x, y: t.y, kind: 'shield', tankId: t.uid, team: t.team, text: t.name + ' 공격 차단' });
        return true;
      }
      if (!periodic && t.status.barrier > 0) {
        const absorbed = Math.min(amount, t.status.barrier);
        t.status.barrier -= absorbed; amount -= absorbed;
        if (amount <= 0) return true;
      }
      const actual = Math.min(t.hp, Math.max(0, Math.round(amount)));
      t.hp = Math.max(0, t.hp - actual); this._stats.damage += actual;
      if (sourceTeam === 0 || sourceTeam === 1) { t._lastSourceTeam = sourceTeam; t._lastSourceId = sourceId; t._lastContext = context; }
      if (actual > 0 && context && this._action && this._action.volleyId === context.volleyId && !context.triggered) {
        if (t.team === this._action.team) this._action.friendlyDamage += actual;
        else this._action.damageToEnemy += actual;
        this._action.hitTargets.add(t.uid);
      }
      this._emit('damage', Object.assign({}, context || {}, { x: t.x, y: t.y - 16, value: actual, kind, team: t.team,
        sourceTeam: sourceTeam === 0 || sourceTeam === 1 ? sourceTeam : null,
        targetTeam: t.team, ownerId: sourceId || null, tankId: t.uid }));
      if (t.hp <= 0) this._kill(t, kind, sourceTeam, sourceId, context);
      return false;
    }

    _kill(t, kind, sourceTeam, sourceId, context) {
      if (!t.alive) return;
      t.alive = false; t.hp = 0; t.vx = 0; t.vy = 0;
      if (kind === 'fall') context = context || t._fallContext || t._lastContext;
      if (context && this._action && this._action.volleyId === context.volleyId && !context.triggered && t.team !== this._action.team) this._action.kills++;
      this._emit('death', Object.assign({}, context || {}, { x: t.x, y: Math.min(t.y, HEIGHT), tankId: t.uid, team: t.team, targetTeam: t.team,
        sourceTeam: sourceTeam === 0 || sourceTeam === 1 ? sourceTeam : (kind === 'fall' ? context && context.sourceTeam !== undefined ? context.sourceTeam : t._lastSourceTeam ?? null : null),
        ownerId: sourceId || (kind === 'fall' ? context && context.ownerId || t._lastSourceId || null : null), kind,
        text: t.name + (kind === 'fall' ? ' 낙하!' : ' 격파!') }));
    }

    _updateTilt(t) {
      const from = Math.max(0, t.y + HALF_H - 22);
      const a = this.terrain.surfaceAt(t.x - 12, from), b = this.terrain.surfaceAt(t.x + 12, from);
      if (a !== null && b !== null && Math.abs(a - b) < 60) t.tilt = clamp(Math.atan2(b - a, 24), -0.6, 0.6);
    }

    _settleTanks(dt) {
      let stable = true;
      for (const t of this.state.tanks) {
        if (!t.alive) continue;
        if (!Number.isFinite(t.x + t.y + t.vx + t.vy)) { this._kill(t, 'fall'); continue; }
        if (Math.abs(t.vx) > 0.5) {
          const dx = t.vx * dt, steps = Math.max(1, Math.ceil(Math.abs(dx)));
          for (let i = 0; i < steps; i++) {
            const nx = t.x + dx / steps, edge = nx + Math.sign(dx) * (HALF_W - 3);
            const wall = this.terrain.solid(edge, t.y - 5) || this.terrain.solid(edge, t.y + 3);
            const other = this.state.tanks.some(o => o !== t && o.alive && Math.abs(o.x - nx) < 31 && Math.abs(o.y - t.y) < 25);
            if (wall || other) { t.vx = 0; break; }
            t.x = nx;
          }
          t.vx *= Math.exp(-dt * 3.5);
          if (Math.abs(t.vx) > 1) stable = false;
        } else t.vx = 0;
        const oldBottom = t.y + HALF_H;
        t.vy += this.tuning.tankGravity * dt;
        let nextY = t.y + t.vy * dt;
        const floor = this.terrain.surfaceAt(t.x, Math.max(0, oldBottom - 1));
        if (floor !== null && floor <= nextY + HALF_H && t.vy >= 0) {
          nextY = floor - HALF_H; t.vy = 0; t._fallContext = null; this._updateTilt(t);
        } else stable = false;
        t.y = nextY;
        if (t.y > HEIGHT + 35 || t.x < -HALF_W || t.x > WIDTH + HALF_W) this._kill(t, 'fall');
      }
      return stable;
    }

    _settleGroundEffects() {
      if (this._hazardTerrainVersion === this.terrain.version) return;
      this._hazardTerrainVersion = this.terrain.version;
      for (const effect of this.state.mines.concat(this.state.hazards)) {
        const floor = this.terrain.surfaceAt(effect.x, Math.max(0, effect.y - 2));
        if (floor === null) effect.dead = true;
        else effect.y = floor - (effect.kind === 'mine' ? 4 : 3);
      }
      this.state.mines = this.state.mines.filter(m => !m.dead);
      this.state.hazards = this.state.hazards.filter(h => !h.dead);
    }

    _triggerMines() {
      for (const mine of this.state.mines) {
        if (mine.dead || mine.age < 0.45) continue;
        const trigger = this.state.tanks.find(t => t.alive && Math.abs(t.x - mine.x) < 23 && Math.abs(t.y + HALF_H - mine.y) < 23 &&
          !(t.def.passives || []).some(p => p.id === 'mine_trigger_exemption'));
        if (trigger) { mine.dead = true; mine.triggered = true; mine.impactKind = 'mine'; this._explode(mine, mine.x, mine.y, 1, trigger); }
      }
      this.state.mines = this.state.mines.filter(m => !m.dead && m.life > 0);
    }

    _checkWinner(reason) {
      if (this.state.phase === 'gameover') return true;
      const alive = this.state.tanks.filter(t => t.alive);
      const teams = new Set(alive.map(t => t.team));
      if (teams.size > 1 && reason !== 'round_limit') return false;
      let winner;
      if (teams.size === 1) winner = alive[0].team;
      else {
        const totals = [0, 0];
        for (const t of this.state.tanks) totals[t.team] += t.hp / t.maxHp;
        winner = Math.abs(totals[0] - totals[1]) < 1e-9 ? -1 : (totals[0] > totals[1] ? 0 : 1);
      }
      this._endAction();
      this.state.winner = winner; this.state.phase = 'gameover';
      this.state.endReason = reason || (alive.length ? 'elimination' : 'simultaneous_elimination');
      this.state.projectiles = []; this._launchQueue = [];
      this._emit('end', { team: winner, text: winner === -1 ? '무승부' : (winner === 0 ? '블루 팀' : '오렌지 팀') + ' 승리', kind: this.state.endReason });
      return true;
    }

    _roundBoundary() {
      const alive = this.state.tanks.filter(t => t.alive);
      if (!alive.length || !alive.every(t => this._acted.has(t.uid))) return;
      this._acted.clear();
      if (this.state.round >= this._maxRound) { this._checkWinner('round_limit'); return; }
      this.state.round++;
      for (const m of this.state.mines) m.life--;
      for (const h of this.state.hazards) h.life--;
      this.state.hazards = this.state.hazards.filter(h => h.life > 0);
      if (this.state.round >= this._suddenRound) {
        this.state.suddenDeath = true;
        const fraction = this.config.profile === 'blue3' ? 0.08 * (this.state.round - 7) : 0.055;
        this._emit('message', { text: '서든데스 · ' + this.state.round + ' 라운드', kind: 'suddenDeath' });
        for (const t of alive) this._damage(t, Math.ceil(t.maxHp * fraction), 'suddenDeath', true);
      }
    }

    _updateTurnOrder() {
      this.state.turnOrder = this.state.tanks.filter(t => t.alive).sort((a, b) => a.nextDelay - b.nextDelay || a.uid.localeCompare(b.uid)).map(t => t.uid);
    }

    _beginNextTurn() {
      if (this._checkWinner()) return;
      this._roundBoundary();
      if (this.state.phase === 'gameover' || this._checkWinner()) return;
      // Status ticks may remove a scheduled tank, so select again without exposing
      // an aim phase for a dead/invalid actor.
      for (let attempts = 0; attempts <= this.state.tanks.length; attempts++) {
        this._updateTurnOrder();
        const t = this.state.tanks.find(v => v.uid === this.state.turnOrder[0]);
        if (!t) { this._checkWinner(); return; }
        this.state.activeId = t.uid; this._scheduleClock = t.nextDelay;
        this.state.turnNumber++; this._stats.turns++;
        t._boundThisTurn = t.status.bind > 0;
        if (t.status.bind > 0) t.status.bind--;
        for (const h of this.state.hazards) if (Math.hypot(t.x - h.x, t.y - h.y) < h.radius + 18) {
          t.status.fire = Math.max(t.status.fire || 0, 1); t.status.fireSourceTeam = h.team; t.status.fireSourceId = h.ownerId;
          t.status.fireContext = this._projectileContext(h);
        }
        if (t.status.poison > 0) { t.status.poison--; this._damage(t, Math.max(16, Math.round(t.maxHp * 0.025)), 'poison', true, t.status.poisonSourceTeam, t.status.poisonSourceId, t.status.poisonContext); }
        if (t.status.fire > 0) { t.status.fire--; this._damage(t, Math.max(10, Math.round(t.maxHp * 0.016)), 'fire', true, t.status.fireSourceTeam, t.status.fireSourceId, t.status.fireContext); }
        if (!t.alive) { this._acted.add(t.uid); if (this._checkWinner()) return; continue; }
        t.moveLeft = t._boundThisTurn ? 0 : t.maxMove;
        this.state.phase = 'aim'; this.state.timeLeft = this._turnLimit;
        this.state.wind = Math.round((this.random() * 2 - 1) * (this.state.suddenDeath ? 9 : 7) * 10) / 10;
        this.state.weaponIndex = 0; this.state.power = 65;
        const aim = this._aimLimits(t, this._weapon(t, 0)); t.angle = clamp(t.angle, aim.min, aim.max);
        this.state.power = this._normalizePower(this.state.power, aim);
        this._itemUsed = false; this.state.itemUsed = false; this._teleportArmed = false;
        this._turnExtraDelay = 0; this._turnTimeUsed = 0; this._moveSpent = 0; this._shotDelay = 0;
        this._aiWait = 0.65; this._aiPlan = null; this._aiSearch = null; this._trajectoryCache = null;
        this._emit('turn', { tankId: t.uid, team: t.team, x: t.x, y: t.y, text: t.name + ' 차례' });
        return;
      }
      this._checkWinner('round_limit');
    }

    _finishTurn() {
      if (this.state.phase === 'gameover') return;
      this._aiSearch = null; this._aiPlan = null;
      this._endAction();
      const t = this.active;
      if (t) {
        this._acted.add(t.uid);
        t.nextDelay = Math.max(t.nextDelay, this._scheduleClock) + t.delay + this._shotDelay + this._turnExtraDelay +
          Math.round(this._turnTimeUsed * 10 + this._moveSpent * 0.5);
        if (t.status.attackBuff && t.status.attackBuff.appliedTurn < this.state.turnNumber) {
          t.status.attackBuff.turns--;
          if (t.status.attackBuff.turns <= 0) delete t.status.attackBuff;
        }
        // A prepared double is consumed by a repeatable attack, not by passing,
        // timing out, teleporting, or using a support skill.
        delete t.status.teleport;
      }
      this._teleportArmed = false; this._updateTurnOrder();
      if (this._checkWinner()) return;
      this.state.phase = 'transition'; this._transitionLeft = 0.32;
    }

    _predict(tank, weapon, angle, power, collect) {
      const p = this._newProjectile(tank, weapon, angle, power), points = collect ? [{ x: p.x, y: p.y }] : null;
      let hit = null;
      for (let i = 0; i <= Math.ceil(this.tuning.maxFlightTime / FIXED_DT) + 1; i++) {
        hit = this._advanceProjectile(p, FIXED_DT, true);
        if (collect && (i % 8 === 0 || hit)) points.push({ x: p.x, y: p.y });
        if (hit) break;
      }
      return { x: p.x, y: p.y, hit, points, bounces: p.bounceCount };
    }

    getTrajectory() {
      const t = this.active;
      if (!t || !t.alive || this.state.phase !== 'aim') return [];
      const w = this._weapon(t, this.state.weaponIndex);
      if (!w || (this._behavior(w).delivery === 'self' && !this._teleportArmed)) return [];
      const weapon = this._teleportArmed ? this._teleportWeapon(w) : w, aim = this._resolveAiming(t, weapon);
      const angle = clamp(t.angle, aim.min, aim.max), power = this._normalizePower(this.state.power, aim);
      const targets = this.state.tanks.map(o => [o.uid, o.alive, o.x, o.y].join(',')).join(';');
      const key = [t.uid, t.x, t.y, t.tilt, angle, t.face, power, this.state.weaponIndex, this.state.wind, this.terrain.version, this._teleportArmed, targets,
        aim.velocityScale, aim.gravityScale, aim.windScale, this.tuning.gravity, this.tuning.windAcceleration, this.tuning.minLaunchSpeed, this.tuning.maxLaunchSpeed].join('|');
      if (this._trajectoryCache && this._trajectoryCache.key === key) return this._trajectoryCache.points;
      const points = this._predict(t, weapon, angle, power, true).points;
      this._trajectoryCache = { key, points }; return points;
    }

    _scoreAIPrediction(actor, weapon, result) {
      if (!result.hit || result.hit.kind === 'void') return -1000;
      const behavior = this._behavior(weapon), radius = Math.max(18, finite(weapon.radius, 55));
      const count = clamp(finite(weapon.shots, 1), 1, 12);
      const spacing = Math.max(8, distance(actor, result) * Math.tan(rad(Math.abs(finite(weapon.spread, 0)))));
      const pellets = count === 1 ? 1 : Math.min(count, 1 + (radius + HALF_W) / spacing);
      const input = finite(weapon.attack, 0) * this._attackMultiplier(actor) * this.tuning.damageScale;
      let score = 0, nearest = Infinity;
      for (const target of this.state.tanks) {
        if (!target.alive) continue;
        const enemy = target.team !== actor.team;
        const d = Math.max(0, distance(target, result) - 14);
        if (enemy) nearest = Math.min(nearest, d);
        const direct = result.hit.tank === target;
        let hitScale = direct ? 1 : d <= radius ? clamp(1 - d / (radius + 0.01), 0.1, 1) : 0;
        if (weapon.kind === 'mine') {
          if (direct) hitScale = 0.45;
          else hitScale = Math.abs(target.x - result.x) < 23 && Math.abs(target.y + HALF_H - result.y) < 28 &&
            !(target.def.passives || []).some(p => p.id === 'mine_trigger_exemption') ? 1 : 0;
        }
        const dispel = enemy && hitScale > 0 && weapon.effect && weapon.effect.type === 'dispel';
        const totalInput = input * hitScale * pellets;
        let damage = totalInput;
        if (!dispel) {
          if (target.status.shield > 0) damage = Math.max(0, damage - input * hitScale);
          damage = Math.max(0, damage - finite(target.status.barrier, 0));
        }
        const actual = Math.min(target.hp, damage);
        if (enemy) {
          score += actual;
          if (actual >= target.hp && actual > 0) score += 100;
          if (dispel) score += finite(target.status.barrier, 0) * 0.85 + (target.status.shield > 0 ? 240 : 0) + (target.status.attackBuff ? 110 : 0);
          if (actual > 0) {
            if (weapon.kind === 'poison' && !(target.status.poison > 0)) score += target.maxHp * 0.025 * 3;
            if (weapon.kind === 'fire' && !(target.status.fire > 0)) score += target.maxHp * 0.016 * 2;
            if (weapon.kind === 'water' && !(target.status.bind > 0)) score += 35;
            score += Math.min(actor.maxHp - actor.hp, actual * behavior.lifeSteal) * 0.9;
          }
          const crater = Math.max(0, finite(weapon.terrainRadius, 0)) * this.tuning.terrainScale;
          const dx = Math.abs(target.x - result.x);
          if (result.hit.kind === 'terrain' && crater > dx && Math.abs(target.y + HALF_H - result.y) < crater) {
            const bottom = result.y + Math.sqrt(crater * crater - dx * dx);
            score += this.terrain.surfaceAt(target.x, bottom + 1) === null ? target.hp * 0.75 : 22;
          }
        } else {
          // Breaking an ally's protection is also a cost, even with no HP loss.
          score -= Math.max(actual, totalInput * 0.7) * 2.7;
          if (actual >= target.hp && actual > 0) score -= 400;
        }
      }
      return score - Math.min(1000, nearest) * 0.12 - finite(weapon.delay, 100) * 0.015;
    }

    _scoreAISupport(actor, weapon) {
      const hpRatio = actor.hp / actor.maxHp;
      if (weapon.effect && weapon.effect.type === 'attackBuff') {
        if (actor.status.attackBuff || hpRatio < 0.35 || this.state.round >= this._maxRound) return -Infinity;
        const strongest = Math.max(...this._weapons(actor).filter(w => this._behavior(w).role === 'attack')
          .map(w => finite(w.attack, 0) * Math.sqrt(finite(w.shots, 1))), 0);
        return strongest * this.tuning.damageScale * (finite(weapon.effect.multiplier, 1.2) - 1) *
          finite(weapon.effect.durationTurns, 2) * 0.9;
      }
      const shield = Math.max(0, finite(weapon.shieldValue, 0) - finite(actor.status.barrier, 0));
      if (shield <= 0 || hpRatio >= 0.6) return -Infinity;
      return shield * (hpRatio < 0.3 ? 1.65 : 1.1);
    }

    _planAI() {
      // Synchronous convenience for deterministic headless validation. The
      // live AI consumes the same generator in bounded slices inside tick().
      const search = this._planAISteps();
      let next;
      do { next = search.next(); } while (!next.done);
      return next.value;
    }

    *_planAISteps() {
      const actor = this.active;
      if (!actor || !actor.alive) return null;
      const enemies = this.state.tanks.filter(t => t.alive && t.team !== actor.team);
      if (!enemies.length) return null;
      const target = enemies.slice().sort((a, b) => (a.hp / a.maxHp * 160 + Math.abs(a.x - actor.x)) - (b.hp / b.maxHp * 160 + Math.abs(b.x - actor.x)))[0];
      const targetDirection = this._directionToWorld(actor, target.x, target.y);
      if (targetDirection) actor.face = targetDirection.face;
      let best = null;
      for (const [index, weapon] of this._weapons(actor).entries()) {
        if (!this._available(weapon)) continue;
        const behavior = this._behavior(weapon), aim = this._aimLimits(actor, weapon);
        let candidate = { score: -Infinity, angle: clamp(actor.angle, aim.min, aim.max), power: this._normalizePower(65, aim),
          weaponIndex: index, role: behavior.role, face: actor.face };
        if (behavior.delivery === 'self') { candidate.score = this._scoreAISupport(actor, weapon); yield; }
        else {
          const evaluate = (angle, power, face = actor.face) => {
            const a = clamp(angle, aim.min, aim.max), p = this._normalizePower(power, aim);
            const shooter = face === actor.face ? actor : Object.assign({}, actor, { face });
            const value = this._scoreAIPrediction(shooter, weapon, this._predict(shooter, weapon, a, p, false));
            if (value > candidate.score) candidate = { score: value, angle: a, power: p, weaponIndex: index, role: behavior.role, face };
          };
          if (behavior.trajectory === 'linear') {
            for (const enemy of enemies) {
              const direction = this._directionToWorld(actor, enemy.x, enemy.y);
              if (!direction) continue;
              for (const offset of [-1.5, 0, 1.5]) { evaluate(direction.angle + offset, aim.powerMax, direction.face); yield; }
            }
          } else {
            const powers = Array.from(new Set(Array.from({ length: 11 }, (_, i) => this._normalizePower(aim.powerMin + (aim.powerMax - aim.powerMin) * i / 10, aim))));
            for (let i = 0; i <= 8; i++) for (const power of powers) {
              evaluate(aim.min + (aim.max - aim.min) * i / 8, power);
              yield;
            }
            const coarse = Object.assign({}, candidate);
            for (let a = -4; a <= 4; a += 2) for (let p = -6; p <= 6; p += 3) { evaluate(coarse.angle + a, coarse.power + p); yield; }
          }
        }
        if (!best || candidate.score > best.score) best = candidate;
      }
      if (!best) return null;
      const chosen = this._weapon(actor, best.weaponIndex), aim = this._aimLimits(actor, chosen);
      const error = this.config.difficulty === 'hard' ? 0.65 : this.config.difficulty === 'easy' ? 4.5 : 1.8;
      if (this._behavior(chosen).delivery !== 'self') {
        best.angle = clamp(best.angle + (this.random() - 0.5) * error, aim.min, aim.max);
        best.power = this._normalizePower(best.power + (this.random() - 0.5) * error * 1.5, aim);
      }
      actor.face = best.face;
      return best;
    }

    _tickAI(dt) {
      this._aiWait -= dt;
      if (this._aiWait > 0) return;
      const t = this.active;
      if (!t || !t.alive) return;
      if (!this._aiPlan) {
        if (!this._aiSearch) {
          if (t.hp < t.maxHp * 0.58 && t.inventory.repair) this._useItemInternal('repair');
          this._aiSearch = this._planAISteps();
        }
        let next;
        while (this._aiWorkRemaining > 0) {
          this._aiWorkRemaining--;
          next = this._aiSearch.next();
          if (next.done) break;
        }
        if (!next || !next.done) return;
        this._aiSearch = null; this._aiPlan = next.value;
        if (!this._aiPlan) { this._finishTurn(); return; }
        const weapon = this._weapon(t, this._aiPlan.weaponIndex);
        if (this._behavior(weapon).repeatable && this._aiPlan.score > 0) this._useItemInternal('double');
        if (t.hp < t.maxHp * 0.48 && t.inventory.shield) this._useItemInternal('shield');
        this.state.weaponIndex = this._aiPlan.weaponIndex;
        const aim = this._resolveAiming(t, weapon);
        t.face = this._aiPlan.face; t.angle = clamp(this._aiPlan.angle, aim.min, aim.max);
        this.state.power = this._normalizePower(this._aiPlan.power, aim); this._aiWait = 0.45;
      } else this._fireInternal();
    }

    tick(dt) {
      dt = finite(dt, 0);
      if (dt <= 0 || this.state.paused || this.state.phase === 'gameover') return;
      this._accumulator += Math.min(dt, 0.25);
      let steps = 0;
      while (this._accumulator >= FIXED_DT && steps++ < 31 && this.state.phase !== 'gameover') {
        this._accumulator -= FIXED_DT;
        this._step(FIXED_DT);
      }
    }

    _step(dt) {
      const s = this.state; s.simTime += dt;
      // Six prediction work units per fixed simulation step: frame-rate changes
      // do not alter thinking duration, turn delay, or the seeded outcome.
      this._aiWorkRemaining = 6;
      for (const m of s.mines) m.age += dt;
      this._settleGroundEffects();
      const stable = this._settleTanks(dt);
      this._triggerMines();
      if (s.phase === 'aim') {
        if (!this.active || !this.active.alive) { this._finishTurn(); return; }
        if (this._checkWinner()) return;
        s.timeLeft = Math.max(0, s.timeLeft - dt); this._turnTimeUsed += dt;
        if (s.timeLeft <= 0) {
          this._emit('message', { text: '제한 시간 종료 · 턴을 넘깁니다' });
          this._finishTurn();
        } else if (!this.isHumanTurn()) this._tickAI(dt);
      } else if (s.phase === 'projectile') {
        this._resolutionTime += dt; this._releaseProjectiles();
        for (const p of s.projectiles) {
          if (p.dead) continue;
          const hit = this._advanceProjectile(p, dt, false);
          if (hit) this._impact(p, hit);
        }
        s.projectiles = s.projectiles.filter(p => !p.dead);
        if (this._resolutionTime > this.tuning.maxResolutionTime) {
          s.projectiles = []; this._launchQueue = [];
          if (this._action) this._action.outcome = 'resolution_timeout';
        }
        if (!s.projectiles.length && !this._launchQueue.length) { s.phase = 'settling'; this._settlingTime = 0; }
      } else if (s.phase === 'settling') {
        this._settlingTime += dt;
        if ((stable && this._settlingTime >= 0.26) || this._settlingTime > 4) this._finishTurn();
      } else if (s.phase === 'transition') {
        this._transitionLeft -= dt;
        if (this._transitionLeft <= 0 && stable) this._beginNextTurn();
        else if (this._transitionLeft < -4) this._beginNextTurn();
      }
    }

    getSnapshot() {
      return {
        profile: this.config.profile, config: Object.assign({}, this.config, { onEvent: undefined }),
        tuning: clone(this.tuning), physicsProvenance: 'prototype_tuning_not_original_constants',
        phase: this.state.phase, paused: this.state.paused, activeId: this.state.activeId,
        itemUsed: this.state.itemUsed, lastAction: this.state.lastAction ? clone(this.state.lastAction) : null,
        round: this.state.round, turnNumber: this.state.turnNumber, wind: this.state.wind,
        timeLeft: this.state.timeLeft, simTime: this.state.simTime, winner: this.state.winner,
        endReason: this.state.endReason, suddenDeath: this.state.suddenDeath,
        roundModel: 'all_living_tanks_have_acted; blue3_normal_rounds_1_to_7_then_sudden_8_to_10',
        terrain: { width: WIDTH, height: HEIGHT, version: this.terrain.version, solidCount: this.terrain.solidCount, mapId: this.terrain.mapId },
        tanks: this.state.tanks.map(t => ({ uid: t.uid, typeId: t.typeId, team: t.team, x: t.x, y: t.y,
          hp: t.hp, maxHp: t.maxHp, alive: t.alive, angle: t.angle, face: t.face,
          nextDelay: t.nextDelay, moveLeft: t.moveLeft, status: clone(t.status), inventory: clone(t.inventory) })),
        projectiles: this.state.projectiles.map(p => ({ x: p.x, y: p.y, vx: p.vx, vy: p.vy, kind: p.kind, ownerId: p.ownerId })),
        queuedProjectiles: this._launchQueue.length, stats: clone(this._stats)
      };
    }
  }

  root.FortEngine = FortEngine;
  if (typeof globalThis !== 'undefined') globalThis.FortEngine = FortEngine;
  if (typeof module !== 'undefined' && module.exports) module.exports = FortEngine;
})(typeof window !== 'undefined' ? window : globalThis);
