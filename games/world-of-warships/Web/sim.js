/* Iron Tide — deterministic, browser-independent naval simulation.
 * All numbers are deliberately tuned for this original short-session prototype.
 * No World of Warships game data, assets, network service, or internal code used.
 */
(function (global) {
  'use strict';
  const N = global.IronTide = global.IronTide || {};
  const TAU = Math.PI * 2;
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const angleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
  const approach = (a, b, amount) => a < b ? Math.min(b, a + amount) : Math.max(b, a - amount);
  const alive = s => !!s && s.hp > 0;
  const GUN_ALIGNMENT_TOLERANCE = .025;
  const turretRate = s => s.classId === 'battleship' ? 1.25 : s.classId === 'cruiser' ? 1.7 : 2.3;

  const CLASSES = {
    destroyer: {
      name: '해오름', type: '구축함', code: 'DD', maxHp: 18000, maxSpeed: 105,
      length: 77, width: 19, range: 1220, reloadMax: 4.2, torpReloadMax: 19,
      armor: 19, detectRange: 790, shellSpeed: 450, torpSpeed: 184, torpRange: 1580,
      gunCount: 4, torpCount: 5, caliber: 130, heDamage: 980, apDamage: 1450,
      torpDamage: 6100, fireChance: .17, turnRate: .68, acceleration: 15,
      torpArcMin: Math.PI / 6, torpArcMax: Math.PI * 5 / 6, torpSpreadNarrow: .19, torpSpreadWide: .46,
      secondaryRange: 0, secondaryReload: 0, secondaryDamage: 0,
      displayKnots: 38, description: '빠른 기동과 연막, 다섯 발의 어뢰로 접근로를 장악합니다.'
    },
    cruiser: {
      name: '청해', type: '순양함', code: 'CA', maxHp: 32000, maxSpeed: 82,
      length: 104, width: 26, range: 1510, reloadMax: 6.4, torpReloadMax: 28,
      armor: 27, detectRange: 1080, shellSpeed: 480, torpSpeed: 171, torpRange: 1320,
      gunCount: 6, torpCount: 3, caliber: 203, heDamage: 1480, apDamage: 2450,
      torpDamage: 7300, fireChance: .22, turnRate: .48, acceleration: 10.6,
      torpArcMin: Math.PI / 4, torpArcMax: Math.PI * 3 / 4, torpSpreadNarrow: .14, torpSpreadWide: .38,
      secondaryRange: 540, secondaryReload: 3.2, secondaryDamage: 250,
      displayKnots: 32, description: '균형 잡힌 주포와 어뢰, 음파 탐지로 모든 상황에 대응합니다.'
    },
    battleship: {
      name: '백야', type: '전함', code: 'BB', maxHp: 58000, maxSpeed: 63,
      length: 142, width: 35, range: 1790, reloadMax: 10.4, torpReloadMax: 0,
      armor: 45, detectRange: 1430, shellSpeed: 510, torpSpeed: 0, torpRange: 0,
      gunCount: 8, torpCount: 0, caliber: 381, heDamage: 2240, apDamage: 4600,
      torpDamage: 0, fireChance: .28, turnRate: .31, acceleration: 7.6,
      torpArcMin: 0, torpArcMax: 0, torpSpreadNarrow: 0, torpSpreadWide: 0,
      secondaryRange: 690, secondaryReload: 2.8, secondaryDamage: 320,
      displayKnots: 26, description: '두꺼운 장갑과 장거리 대구경 포격. 측면을 노출한 적에게 강합니다.'
    }
  };
  Object.values(CLASSES).forEach(Object.freeze);
  Object.freeze(CLASSES);

  const DAMAGE_RULES = Object.freeze({
    saturatedMultiplier: .35,
    recoverable: Object.freeze({HE: .55, AP: .50, CITADEL: .10, TORP: .35, FIRE: 1, FLOOD: 1, SECONDARY: .55, RAM: .10}),
    repairPerCharge: .18
  });

  function makeSections(maxHp) {
    return {bow: {hp: maxHp * .22, maxHp: maxHp * .22}, mid: {hp: maxHp * .56, maxHp: maxHp * .56}, stern: {hp: maxHp * .22, maxHp: maxHp * .22}};
  }

  function makeModules() {
    return {engine: {state: 'normal', time: 0, maxTime: 0}, rudder: {state: 'normal', time: 0, maxTime: 0}, guns: {state: 'normal', time: 0, maxTime: 0}};
  }

  function seededRandom(seed) {
    let state = seed >>> 0;
    const random = function () {
      state = (state + 0x6D2B79F5) >>> 0;
      let t = Math.imul(state ^ state >>> 15, state | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
    random.getState = () => state >>> 0;
    return random;
  }

  function consumeProfile(kind, label, charges, cooldown, duration) {
    return {kind, label, charges, maxCharges: charges, cooldown: 0, maxCooldown: cooldown, duration, active: 0};
  }

  function makeShip(g, id, classId, team, x, y, name, isPlayer, lane) {
    const p = CLASSES[classId];
    const s = {
      id, classId, name: name || p.name, team, isPlayer, x, y,
      angle: team === 0 ? -Math.PI / 2 : Math.PI / 2,
      gunAngle: team === 0 ? -Math.PI / 2 : Math.PI / 2,
      maxHp: p.maxHp, hp: p.maxHp, maxSpeed: p.maxSpeed, speed: 0, driveSpeed: 0, vx: 0, vy: 0,
      contact: {kind: 'none', normalX: 0, normalY: 0, until: 0}, recovery: null,
      turnRate: p.turnRate, sections: makeSections(p.maxHp), modules: makeModules(),
      recoverableHp: 0, repairPreview: 0, repairBudget: 0, lastDamageSection: 'mid',
      secondaryReload: 0, secondaryRange: p.secondaryRange,
      length: p.length, width: p.width, armor: p.armor, range: p.range,
      detectRange: p.detectRange, reload: 0, reloadMax: p.reloadMax,
      torpReload: 0, torpReloadMax: p.torpReloadMax, throttle: isPlayer ? 0 : 4,
      rudder: 0, turn: 0, gunAlignment: 0, gunsBearing: p.gunCount,
      visible: team === 0, detected: false, seenBy: [team === 0, team === 1],
      fireTime: 0, fireStacks: 0, floodTime: 0, smokeTime: 0, repairTime: 0,
      dcpTime: 0, sonarTime: 0, bloomTime: 0, alive: true,
      aimX: x, aimY: team === 0 ? y - 1000 : y + 1000,
      captureBlockedUntil: 0, lastShoreWarning: -10, lastRamTime: -10,
      aiDisabled: false, aiThink: g.rng() * .25, aiTurn: 0,
      aiAimX: x, aiAimY: y, aiAmmo: 'HE', aiTargetId: null,
      aiLane: lane, aiOrbit: g.rng() < .5 ? -1 : 1, aiNoiseX: 0, aiNoiseY: 0,
      aiNoiseTimer: 0, smokeEmit: 0,
      consumables: {
        damageControl: consumeProfile('damageControl', '피해 복구', -1, 36, 7),
        repair: consumeProfile('repair', '수리반', 3, 36, 11),
        ability: classId === 'destroyer'
          ? consumeProfile('smoke', '연막', 3, 48, 22)
          : consumeProfile('sonar', '음파 탐지', 3, 48, 14)
      }
    };
    return s;
  }

  function createGame(options) {
    options = options || {};
    const difficulty = ['easy', 'normal', 'hard'].includes(options.difficulty) ? options.difficulty : 'normal';
    const shipClass = CLASSES[options.shipClass] ? options.shipClass : 'cruiser';
    const seed = Number.isFinite(options.seed) ? options.seed >>> 0 : 42;
    const g = {
      seed, rng: seededRandom(seed), difficulty, operationId: 'northern', loadoutId: 'balanced', mode: 'domination', world: {w: 4200, h: 3200},
      time: 0, duration: 480, phase: 'playing', reason: '', winner: null, trainingMode: false,
      score: [250, 250], targetScore: 800, playerId: 'flagship',
      ships: [], projectiles: [], effects: [], events: [], smokeClouds: [], lastKnown: {},
      stats: {damage: 0, kills: 0, hits: 0, shots: 0, torpHits: 0, caps: 0, damageTaken: 0, penetrations: 0, overpens: 0, ricochets: 0, shatters: 0, citadels: 0, fires: 0, floods: 0, secondaryDamage: 0, secondaryHits: 0, potentialDamage: 0},
      damageBreakdown: {HE: 0, AP: 0, TORP: 0, FIRE: 0, FLOOD: 0, SECONDARY: 0},
      warnings: {torpedo: false}, order: null,
      _nextId: 1, _scoreTick: 0, lastShotLimited: false,
      islands: [
        {x: 1510, y: 1300, rx: 180, ry: 280, rotation: .46, seed: 13},
        {x: 1410, y: 1890, rx: 180, ry: 150, rotation: -.4, seed: 26},
        {x: 2700, y: 1520, rx: 205, ry: 330, rotation: -.42, seed: 43},
        {x: 2870, y: 2180, rx: 140, ry: 100, rotation: .28, seed: 79},
        {x: 410, y: 1940, rx: 125, ry: 165, rotation: -.6, seed: 32},
        {x: 3580, y: 990, rx: 140, ry: 98, rotation: .3, seed: 59},
        {x: 1900, y: 380, rx: 185, ry: 90, rotation: .2, seed: 71},
        {x: 290, y: 480, rx: 145, ry: 230, rotation: -.28, seed: 94},
        {x: 3910, y: 2760, rx: 185, ry: 170, rotation: -.65, seed: 17}
      ],
      zones: [
        {id: 'A', x: 870, y: 1550, radius: 235, progress: 0, owner: null, contested: false},
        {id: 'B', x: 2100, y: 1510, radius: 235, progress: 0, owner: null, contested: false},
        {id: 'C', x: 3320, y: 1600, radius: 235, progress: 0, owner: null, contested: false}
      ]
    };
    const operation = N.OPERATIONS && N.OPERATIONS[options.operationId || 'northern'];
    if (operation) {
      g.operationId = operation.id; g.mode = operation.mode;
      g.world = {w: operation.world.w, h: operation.world.h};
      g.islands = operation.islands.map(i => ({x: i.x, y: i.y, rx: i.rx, ry: i.ry, rotation: i.rotation, seed: i.seed}));
      g.zones = operation.zones.map(z => ({id: z.id, x: z.x, y: z.y, radius: z.radius, progress: 0, owner: null, contested: false}));
      g.duration = operation.duration; g.targetScore = operation.targetScore;
      g.score = [operation.initialScore, operation.initialScore];
    }
    g.player = makeShip(g, g.playerId, shipClass, 0, 2100, 2510, CLASSES[shipClass].name, true, 1);
    g.ships = [
      g.player,
      makeShip(g, 'blue-dd', 'destroyer', 0, 920, 2450, '해오름 II', false, 0),
      makeShip(g, 'blue-bb', 'battleship', 0, 3270, 2490, '설봉', false, 2),
      makeShip(g, 'red-dd', 'destroyer', 1, 850, 650, 'R-07 바이퍼', false, 0),
      makeShip(g, 'red-ca', 'cruiser', 1, 2190, 710, 'R-12 리퍼', false, 1),
      makeShip(g, 'red-bb', 'battleship', 1, 3270, 650, 'R-03 타이탄', false, 2)
    ];
    if (operation) {
      g.ships.forEach((ship, i) => {
        const spawn = i < 3 ? operation.spawns.blue[i] : operation.spawns.red[i - 3];
        ship.x = spawn.x; ship.y = spawn.y;
        ship.aimX = ship.x; ship.aimY = ship.y + (ship.team === 0 ? -1000 : 1000);
        ship.aiAimX = ship.aimX; ship.aiAimY = ship.aimY;
      });
    }
    const loadout = N.LOADOUTS && N.LOADOUTS[options.loadoutId || 'balanced'];
    if (loadout) {
      g.loadoutId = loadout.id;
      const m = loadout.modifiers, player = g.player;
      player.maxHp *= m.maxHp; player.hp = player.maxHp;
      player.maxSpeed *= m.maxSpeed; player.reloadMax *= m.reload; player.turnRate *= m.turnRate;
      player.sections = makeSections(player.maxHp);
    }
    g.matchId = typeof options.matchId === 'string' && options.matchId.length <= 120 ? options.matchId : `match-${seed}-${g.operationId}-${shipClass}`;
    updateVisibility(g);
    return g;
  }

  function event(g, type, text, extra) {
    const e = Object.assign({id: g._nextId++, time: g.time, type, text}, extra || {});
    g.events.push(e);
    if (g.events.length > 100) g.events.splice(0, g.events.length - 100);
    return e;
  }

  function effect(g, type, x, y, radius, team, life, extra) {
    const e = Object.assign({id: g._nextId++, type, x, y, radius, team, age: 0, life: life || .8, visible: true}, extra || {});
    g.effects.push(e);
    return e;
  }

  // First intersection fraction of a segment and a rotated ellipse, or null.
  function segmentEllipse(ax, ay, bx, by, ellipse, padding) {
    const r = ellipse.rotation || 0, cs = Math.cos(r), sn = Math.sin(r);
    const rx = Math.max(1, ellipse.rx + (padding || 0));
    const ry = Math.max(1, ellipse.ry + (padding || 0));
    const x = ((ax - ellipse.x) * cs + (ay - ellipse.y) * sn) / rx;
    const y = (-(ax - ellipse.x) * sn + (ay - ellipse.y) * cs) / ry;
    const dx = ((bx - ax) * cs + (by - ay) * sn) / rx;
    const dy = (-(bx - ax) * sn + (by - ay) * cs) / ry;
    const a = dx * dx + dy * dy;
    const c = x * x + y * y - 1;
    if (c <= 0) return 0;
    if (a < 1e-12) return null;
    const b = 2 * (x * dx + y * dy), discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return null;
    const t = (-b - Math.sqrt(discriminant)) / (2 * a);
    return t >= 0 && t <= 1 ? t : null;
  }

  function firstIslandHit(g, ax, ay, bx, by, padding) {
    let first = null;
    for (const island of g.islands) {
      const t = segmentEllipse(ax, ay, bx, by, island, padding);
      if (t !== null && (first === null || t < first)) first = t;
    }
    return first;
  }

  function clearSight(g, a, b) {
    return firstIslandHit(g, a.x, a.y, b.x, b.y, 0) === null;
  }

  function shipEllipse(ship, padding) {
    return {x: ship.x, y: ship.y, rx: ship.length * .5 + (padding || 0), ry: ship.width * .5 + (padding || 0), rotation: ship.angle};
  }

  function pointInShip(x, y, ship, padding) {
    const dx = x - ship.x, dy = y - ship.y, c = Math.cos(ship.angle), s = Math.sin(ship.angle);
    const localX = dx * c + dy * s, localY = -dx * s + dy * c;
    return (localX / (ship.length * .5 + (padding || 0))) ** 2 + (localY / (ship.width * .5 + (padding || 0))) ** 2 <= 1;
  }

  function insideSmoke(g, ship) {
    return g.smokeClouds.some(c => Math.hypot(c.x - ship.x, c.y - ship.y) < c.radius);
  }

  function canSee(g, observer, target) {
    if (!alive(observer) || !alive(target)) return false;
    if (observer.team === target.team) return true;
    const d = distance(observer, target);
    if (d < 125) return true;
    if (observer.sonarTime > 0 && d < 880) return true;
    let detect = target.bloomTime > 0 ? Math.max(target.range + 100, target.detectRange) : target.detectRange;
    if (insideSmoke(g, target)) {
      detect = target.bloomTime > 0 ? (target.classId === 'destroyer' ? 280 : target.classId === 'cruiser' ? 470 : 700) : 145;
    }
    if (insideSmoke(g, observer) && observer.sonarTime <= 0) detect = Math.min(detect, 380);
    return d <= detect && clearSight(g, observer, target);
  }

  function updateVisibility(g) {
    const living = g.ships.filter(alive);
    for (const s of g.ships) {
      if (!alive(s)) { s.detected = false; continue; }
      s.seenBy = [false, false];
      s.seenBy[s.team] = true;
      const other = 1 - s.team;
      s.seenBy[other] = living.some(o => o.team === other && canSee(g, o, s));
      s.visible = s.team === 0 || s.seenBy[0];
      s.detected = s.seenBy[other];
      if (s.team === 1 && s.visible) g.lastKnown[s.id] = {x: s.x, y: s.y, time: g.time};
    }
    for (const id of Object.keys(g.lastKnown)) {
      if (g.time - g.lastKnown[id].time > 65) delete g.lastKnown[id];
    }
    const blue = living.filter(s => s.team === 0);
    for (const p of g.projectiles) {
      const source = g.ships.find(s => s.id === p.ownerId);
      p.visible = p.team === 0 || (p.kind === 'shell' && source && source.visible) || blue.some(s => distance(s, p) < (p.kind === 'torpedo' ? (s.sonarTime > 0 ? 880 : 470) : 1150));
    }
    for (const e of g.effects) {
      // A muzzle flash must not disclose an undetected firing ship.
      const source = e.shipId && g.ships.find(s => s.id === e.shipId);
      e.visible = e.type === 'muzzle'
        ? e.team === 0 || !!(source && source.visible)
        : e.team === 0 || (source && source.visible) || blue.some(s => distance(s, e) < 1050 && clearSight(g, s, e));
    }
  }

  function isVisible(g, ship) {
    if (!ship) return false;
    return ship.team === 0 || !!ship.visible;
  }

  function predictIntercept(shooter, target, speed) {
    speed = speed > 0 ? speed : 480;
    const dx = target.x - shooter.x, dy = target.y - shooter.y;
    const vx = Number.isFinite(target.vx) ? target.vx : Math.cos(target.angle || 0) * (target.speed || 0);
    const vy = Number.isFinite(target.vy) ? target.vy : Math.sin(target.angle || 0) * (target.speed || 0);
    const a = vx * vx + vy * vy - speed * speed;
    const b = 2 * (dx * vx + dy * vy), c = dx * dx + dy * dy;
    let t;
    if (Math.abs(a) < .001) t = Math.abs(b) > .001 ? -c / b : Math.sqrt(c) / speed;
    else {
      const disc = b * b - 4 * a * c;
      if (disc < 0) t = Math.sqrt(c) / speed;
      else {
        const t1 = (-b - Math.sqrt(disc)) / (2 * a), t2 = (-b + Math.sqrt(disc)) / (2 * a);
        const positive = [t1, t2].filter(v => v > 0);
        t = positive.length ? Math.min(...positive) : Math.sqrt(c) / speed;
      }
    }
    t = clamp(t, 0, 16);
    return {x: target.x + vx * t, y: target.y + vy * t, time: t};
  }

  function getWeaponSolution(g, ship, ammo, aimX, aimY, spread) {
    const profile = ship && CLASSES[ship.classId];
    const validAim = Number.isFinite(aimX) && Number.isFinite(aimY);
    const range = profile && validAim ? Math.hypot(aimX - ship.x, aimY - ship.y) : 0;
    const bearing = profile && validAim ? Math.atan2(aimY - ship.y, aimX - ship.x) : 0;
    const torpedo = ammo === 'TORP';
    const maxRange = profile ? (torpedo ? profile.torpRange : ship.range) : 0;
    const totalBarrels = profile ? (torpedo ? profile.torpCount : profile.gunCount) : 0;
    const relative = profile ? Math.abs(angleDelta(bearing, ship.angle)) : 0;
    const arcValid = !torpedo || !!(profile && totalBarrels > 0 && relative >= profile.torpArcMin - 1e-8 && relative <= profile.torpArcMax + 1e-8);
    const inRange = validAim && range >= 12 && range <= maxRange + 1e-6;
    const blockedByIsland = !!(g && profile && validAim && firstIslandHit(g, ship.x, ship.y, aimX, aimY, 0) !== null);
    const disabled = !g || g.phase !== 'playing' || !alive(ship) || !validAim || (!torpedo && ship.modules && ship.modules.guns.state !== 'normal');
    const barrels = !profile || disabled || !arcValid ? 0 : torpedo ? totalBarrels : Math.abs(Math.sin(bearing - ship.angle)) > .56 ? totalBarrels : Math.ceil(totalBarrels / 2);
    const reload = profile ? Math.max(0, torpedo ? ship.torpReload : ship.reload) : 0;
    let reason = 'ready';
    if (disabled) reason = 'disabled';
    else if (!['HE', 'AP', 'TORP'].includes(ammo) || totalBarrels === 0) reason = 'noammo';
    else if (!inRange) reason = 'range';
    else if (blockedByIsland) reason = 'obstructed';
    else if (!arcValid) reason = 'arc';
    else if (reload > .000001) reason = 'cooldown';
    else if (!torpedo && Math.abs(angleDelta(bearing, ship.gunAngle)) > GUN_ALIGNMENT_TOLERANCE) reason = 'traverse';
    return {ready: reason === 'ready', reason, inRange, blockedByIsland, barrels, totalBarrels,
      flightTime: profile ? range / Math.max(1, torpedo ? profile.torpSpeed : profile.shellSpeed) : 0,
      bearing, range, maxRange, arcValid, reload,
      alignmentTime: profile && !torpedo ? Math.max(0, Math.abs(angleDelta(bearing, ship.gunAngle)) - GUN_ALIGNMENT_TOLERANCE) / turretRate(ship) : 0,
      spread: spread === 'wide' ? 'wide' : 'narrow',
      spreadAngle: profile && torpedo ? (spread === 'wide' ? profile.torpSpreadWide : profile.torpSpreadNarrow) : 0};
  }

  function tryFire(g, ship, ammo, aimX, aimY, spread) {
    const solution = getWeaponSolution(g, ship, ammo, aimX, aimY, spread);
    if (!solution.ready) return false;
    const profile = CLASSES[ship.classId];
    let dx = aimX - ship.x, dy = aimY - ship.y, len = Math.hypot(dx, dy);
    const bearing = Math.atan2(dy, dx);
    if (ammo === 'TORP') {
      ship.torpReload = ship.torpReloadMax;
      const count = profile.torpCount, spreadAngle = solution.spreadAngle;
      for (let i = 0; i < count; i++) {
        const angle = bearing + (i - (count - 1) / 2) * spreadAngle / Math.max(1, count - 1);
        const startX = ship.x + Math.cos(angle) * (ship.width + 12);
        const startY = ship.y + Math.sin(angle) * (ship.width + 12);
        g.projectiles.push({
          id: g._nextId++, kind: 'torpedo', ammo: 'TORP', ownerId: ship.id, team: ship.team,
          x: startX, y: startY, startX, startY,
          targetX: startX + Math.cos(angle) * profile.torpRange,
          targetY: startY + Math.sin(angle) * profile.torpRange,
          age: 0, life: profile.torpRange / profile.torpSpeed, angle,
          vx: Math.cos(angle) * profile.torpSpeed, vy: Math.sin(angle) * profile.torpSpeed,
          damage: profile.torpDamage, distance: 0, armed: false, visible: ship.visible, potentialCounted: false, spread: solution.spread
        });
      }
      effect(g, 'splash', ship.x, ship.y, 24, ship.team, .55, {shipId: ship.id});
      event(g, 'torpedo', ship.isPlayer ? `어뢰 ${count}발 발사` : '어뢰 발사', {team: ship.team, shipId: ship.id, x: ship.visible ? ship.x : undefined, y: ship.visible ? ship.y : undefined, visible: ship.visible});
      return true;
    }
    ship.gunAlignment = Math.abs(angleDelta(bearing, ship.gunAngle));
    const count = solution.barrels;
    ship.gunsBearing = count;
    const aimRange = Math.min(len, ship.range);
    if (ship.isPlayer) g.lastShotLimited = false;
    dx /= len; dy /= len;
    aimX = ship.x + dx * aimRange; aimY = ship.y + dy * aimRange;
    ship.reload = ship.reloadMax;
    ship.bloomTime = 12;
    for (let i = 0; i < count; i++) {
      const turretOffset = ((i % 4) / 3 - .5) * ship.length * .60;
      const startX = ship.x + Math.cos(ship.angle) * turretOffset + Math.cos(bearing) * 15;
      const startY = ship.y + Math.sin(ship.angle) * turretOffset + Math.sin(bearing) * 15;
      const scatter = 4 + aimRange * (ship.classId === 'battleship' ? .011 : .0085);
      // A bounded triangular dispersion keeps central aim useful without guaranteed hits.
      let targetX = aimX + (g.rng() + g.rng() - 1) * scatter;
      let targetY = aimY + (g.rng() + g.rng() - 1) * scatter;
      const land = firstIslandHit(g, startX, startY, targetX, targetY, 0);
      if (land !== null) {
        targetX = startX + (targetX - startX) * land;
        targetY = startY + (targetY - startY) * land;
      }
      const flight = Math.max(.25, Math.hypot(targetX - startX, targetY - startY) / profile.shellSpeed);
      const angle = Math.atan2(targetY - startY, targetX - startX);
      g.projectiles.push({
        id: g._nextId++, kind: 'shell', ammo, ownerId: ship.id, team: ship.team,
        x: startX, y: startY, startX, startY, targetX, targetY, age: 0, life: flight,
        angle, vx: (targetX - startX) / flight, vy: (targetY - startY) / flight,
        damage: ammo === 'AP' ? profile.apDamage : profile.heDamage,
        caliber: profile.caliber, fireChance: profile.fireChance,
        firedRange: aimRange, maxRange: ship.range, landHit: land !== null, visible: ship.visible, potentialCounted: false, secondary: false
      });
      effect(g, 'muzzle', startX, startY, ship.classId === 'battleship' ? 27 : 18, ship.team, .26, {shipId: ship.id, angle: bearing});
    }
    if (ship.isPlayer) g.stats.shots += count;
    event(g, 'fire', ship.isPlayer ? `${ammo} ${count}문 일제사격` : '주포 발사', {team: ship.team, shipId: ship.id, ammo, visible: ship.visible, x: ship.visible ? ship.x : undefined, y: ship.visible ? ship.y : undefined});
    return true;
  }

  function firePlayer(g, ammo, aimX, aimY, spread) {
    return tryFire(g, g.player, ammo, aimX, aimY, spread);
  }

  function hitSection(target, point) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return 'mid';
    const localX = (point.x - target.x) * Math.cos(target.angle) + (point.y - target.y) * Math.sin(target.angle);
    return localX > target.length * .18 ? 'bow' : localX < -target.length * .18 ? 'stern' : 'mid';
  }

  function updateRepairPreview(s) {
    s.recoverableHp = clamp(s.recoverableHp || 0, 0, Math.max(0, s.maxHp - s.hp));
    s.repairPreview = Math.min(s.recoverableHp, Math.max(0, s.maxHp - s.hp), s.maxHp * DAMAGE_RULES.repairPerCharge);
  }

  function damageModule(g, target, region, category, dealt) {
    if (!alive(target) || target.dcpTime > 0 || dealt < 100) return;
    const chance = category === 'TORP' ? .40 : category === 'HE' ? .22 : category === 'SECONDARY' ? .045 : .13;
    if (g.rng() >= chance) return;
    const roll = g.rng();
    const key = region === 'bow' ? 'guns' : region === 'stern' ? (roll < .58 ? 'rudder' : 'engine') : (roll < .60 ? 'engine' : 'guns');
    const module = target.modules[key];
    const critical = module.state === 'critical' || dealt > target.maxHp * .13 || g.rng() < .20;
    module.state = critical ? 'critical' : 'damaged';
    const duration = critical ? (key === 'engine' ? 13 : 11) : (key === 'rudder' ? 6 : 8);
    module.time = Math.max(module.time, duration); module.maxTime = Math.max(module.maxTime, duration);
    if (target.team === 0 || target.visible) {
      const names = {engine: '기관', rudder: '조타 장치', guns: '주포'};
      event(g, 'module', `${target.isPlayer ? '' : `${target.name} · `}${names[key]} ${critical ? '치명적 손상' : '손상'}`, {team: target.team, shipId: target.id, module: key, state: module.state, timeRemaining: module.time, visible: true});
    }
  }

  function damageShip(g, target, amount, ownerId, kind, result, category, point) {
    if (!alive(target) || !(amount > 0)) return 0;
    const owner = g.ships.find(s => s.id === ownerId);
    if (owner && owner.team === target.team) return 0;
    category = category || (kind === 'fire' ? 'FIRE' : kind === 'flood' ? 'FLOOD' : kind === 'torpedo' ? 'TORP' : kind === 'ram' ? 'RAM' : 'HE');
    const direct = kind !== 'fire' && kind !== 'flood';
    const region = hitSection(target, point);
    if (direct && target.sections) {
      const section = target.sections[region];
      const full = Math.min(section.hp, amount);
      section.hp = Math.max(0, section.hp - amount);
      amount = full + (amount - full) * DAMAGE_RULES.saturatedMultiplier;
      target.lastDamageSection = region;
    }
    const dealt = Math.min(target.hp, amount);
    target.hp = Math.max(0, target.hp - dealt);
    if (direct && dealt > 0) target.lastDamageTime = g.time;
    const repairFactor = result === 'citadel' ? DAMAGE_RULES.recoverable.CITADEL : DAMAGE_RULES.recoverable[category] || 0;
    target.recoverableHp += dealt * repairFactor;
    updateRepairPreview(target);
    target.captureBlockedUntil = g.time + 2.4;
    if (ownerId === g.playerId) {
      g.stats.damage += dealt;
      if (Object.prototype.hasOwnProperty.call(g.damageBreakdown, category)) g.damageBreakdown[category] += dealt;
      if (category === 'SECONDARY') g.stats.secondaryDamage += dealt;
    }
    if (target.isPlayer) {
      g.stats.damageTaken += dealt;
      target.lastDamageTime = g.time;
      if (direct) event(g, 'damage', `${Math.round(dealt).toLocaleString('ko-KR')} 피해`, {damage: dealt, team: target.team, shipId: target.id, result, section: region, x: target.x, y: target.y});
    }
    if (target.hp <= 0) {
      target.alive = false; target.speed *= .15; target.vx = 0; target.vy = 0;
      target.fireTime = 0; target.floodTime = 0; target.smokeTime = 0;
      const scoringTeam = owner ? owner.team : 1 - target.team;
      g.score[scoringTeam] += 90;
      g.score[target.team] = Math.max(0, g.score[target.team] - 40);
      if (ownerId === g.playerId) g.stats.kills++;
      effect(g, 'explosion', target.x, target.y, target.length * .9, target.team, 2.2, {shipId: target.id});
      event(g, 'kill', `${target.name} 격침`, {team: scoringTeam, shipId: target.id, ownerId, x: target.visible ? target.x : undefined, y: target.visible ? target.y : undefined});
      delete g.lastKnown[target.id];
    }
    if (direct && category !== 'RAM') damageModule(g, target, region, category, dealt);
    return dealt;
  }

  function resolveShellHit(g, projectile, target) {
    if (!alive(target) || projectile.team === target.team) return {damage: 0, result: 'blocked', fire: false, killed: false};
    const p = projectile;
    const shotAngle = Number.isFinite(p.angle) ? p.angle : Math.atan2(target.y - p.startY, target.x - p.startX);
    const sideExposure = Math.abs(Math.sin(shotAngle - target.angle));
    const rangeRatio = (p.firedRange || 0) / (p.maxRange || 1500);
    const px = Number.isFinite(p.x) ? p.x : target.x, py = Number.isFinite(p.y) ? p.y : target.y;
    const localX = (px - target.x) * Math.cos(target.angle) + (py - target.y) * Math.sin(target.angle);
    const localY = -(px - target.x) * Math.sin(target.angle) + (py - target.y) * Math.cos(target.angle);
    let amount = 0, result = 'penetration', fire = false;
    const base = Math.max(0, p.damage || 0);
    if (p.ammo === 'AP') {
      const overmatch = (p.caliber || 203) > target.armor * 14.3;
      if (sideExposure < .43 && !overmatch) result = 'ricochet';
      else if (target.classId === 'destroyer') { result = 'overpen'; amount = base * .10; }
      else if ((p.caliber || 203) < 180 && target.classId === 'battleship' && rangeRatio > .45) result = 'shatter';
      else if (sideExposure > .94 && Math.abs(localX) < target.length * .16 && Math.abs(localY) < target.width * .30 && rangeRatio < .82) { result = 'citadel'; amount = base; }
      else amount = base * .33;
    } else {
      const pen = (p.caliber || 130) / 6;
      amount = base * (pen >= target.armor ? .66 : .34);
    }
    amount = Math.round(amount);
    const category = p.secondary ? 'SECONDARY' : p.ammo === 'AP' ? 'AP' : 'HE';
    const dealt = damageShip(g, target, amount, p.ownerId, 'shell', result, category, {x: px, y: py});
    if (alive(target) && p.ammo !== 'AP' && target.dcpTime <= 0 && g.rng() < (Number.isFinite(p.fireChance) ? p.fireChance : .18)) {
      const previousStacks = target.fireStacks;
      target.fireStacks = Math.min(3, Math.max(0, previousStacks) + 1);
      target.fireTime = Math.max(target.fireTime, 27);
      target.fireOwner = p.ownerId; fire = target.fireStacks > previousStacks;
      if (fire && p.ownerId === g.playerId) g.stats.fires++;
    }
    if (p.ownerId === g.playerId && !p.secondary) {
      g.stats.hits++;
      const counter = {penetration: 'penetrations', overpen: 'overpens', ricochet: 'ricochets', shatter: 'shatters', citadel: 'citadels'}[result];
      if (counter) g.stats[counter]++;
      const words = {citadel: '집중방호구역', overpen: '과관통', ricochet: '도탄', shatter: '불관통', penetration: '명중'};
      event(g, 'hit', `${words[result]}${dealt ? ` +${Math.round(dealt).toLocaleString('ko-KR')}` : ''}${fire ? ' · 화재' : ''}`, {damage: dealt, result, fire, ammo: p.ammo, ownerId: p.ownerId, secondary: false, team: 0, shipId: target.visible ? target.id : undefined, x: target.visible ? px : undefined, y: target.visible ? py : undefined});
    }
    if (p.ownerId === g.playerId && p.secondary && dealt > 0) g.stats.secondaryHits++;
    effect(g, 'hit', px, py, p.secondary ? 12 : result === 'citadel' ? 42 : 24, p.team, p.secondary ? .35 : .7, {damage: dealt, result, shipId: target.id, secondary: !!p.secondary});
    return {damage: dealt, result, fire, killed: target.hp <= 0};
  }

  function useShipConsumable(g, s, key) {
    if (g.phase !== 'playing' || !alive(s)) return false;
    const c = s.consumables[key];
    if (!c || c.cooldown > .001 || c.active > .001 || c.charges === 0) return false;
    updateRepairPreview(s);
    if (c.kind === 'repair' && (s.hp >= s.maxHp - 1 || s.repairPreview <= .01)) return false;
    if (c.charges > 0) c.charges--;
    c.active = c.duration; c.cooldown = c.maxCooldown;
    if (c.kind === 'damageControl') {
      s.fireTime = 0; s.fireStacks = 0; s.floodTime = 0; s.dcpTime = c.duration;
      for (const module of Object.values(s.modules)) {
        if (module.state === 'damaged') { module.state = 'normal'; module.time = 0; module.maxTime = 0; }
      }
    } else if (c.kind === 'repair') { s.repairTime = c.duration; s.repairBudget = s.maxHp * DAMAGE_RULES.repairPerCharge; }
    else if (c.kind === 'smoke') { s.smokeTime = c.duration; s.smokeEmit = 0; emitSmoke(g, s); }
    else if (c.kind === 'sonar') s.sonarTime = c.duration;
    if (s.isPlayer) event(g, 'consumable', `${c.label} 가동`, {team: s.team, shipId: s.id, kind: c.kind});
    updateVisibility(g);
    return true;
  }

  function useConsumable(g, key) { return useShipConsumable(g, g.player, key); }

  function issueOrder(g, order) {
    if (!g || g.phase !== 'playing' || !order || !['focus', 'capture', 'regroup'].includes(order.type)) return false;
    const next = {type: order.type, targetId: null, zoneId: null, until: g.time + 25};
    let text;
    if (order.type === 'focus') {
      const target = g.ships.find(s => s.id === order.targetId && s.team === 1 && alive(s) && s.visible);
      if (!target) return false;
      next.targetId = target.id; text = `${target.name} 집중 공격 지시`;
    } else if (order.type === 'capture') {
      const zone = g.zones.find(z => z.id === order.zoneId);
      if (!zone) return false;
      next.zoneId = zone.id; text = `${zone.id} 거점 점령 지시`;
    } else text = '기함 주변으로 집결 지시';
    g.order = next;
    event(g, 'order', text, {team: 0, targetId: next.targetId, zoneId: next.zoneId, visible: true});
    return true;
  }

  function tickSecondaries(g, s) {
    const profile = CLASSES[s.classId];
    if (!profile.secondaryRange || s.secondaryReload > 0 || s.modules.guns.state !== 'normal' || !alive(s)) return;
    const candidates = g.ships.filter(t => alive(t) && t.team !== s.team && t.seenBy[s.team] && distance(s, t) <= s.secondaryRange && clearSight(g, s, t));
    candidates.sort((a, b) => distance(s, a) - distance(s, b));
    const target = candidates[0];
    if (!target) return;
    s.secondaryReload = profile.secondaryReload;
    const lead = predictIntercept(s, target, 610), count = s.classId === 'battleship' ? 2 : 1;
    for (let i = 0; i < count; i++) {
      let targetX = lead.x + (g.rng() - .5) * 36, targetY = lead.y + (g.rng() - .5) * 36;
      const startX = s.x + Math.cos(s.angle) * (i ? -1 : 1) * s.length * .2;
      const startY = s.y + Math.sin(s.angle) * (i ? -1 : 1) * s.length * .2;
      const land = firstIslandHit(g, startX, startY, targetX, targetY, 0);
      if (land !== null) { targetX = startX + (targetX - startX) * land; targetY = startY + (targetY - startY) * land; }
      const flight = Math.max(.16, Math.hypot(targetX - startX, targetY - startY) / 610);
      const angle = Math.atan2(targetY - startY, targetX - startX);
      g.projectiles.push({id: g._nextId++, kind: 'shell', ammo: 'HE', secondary: true, ownerId: s.id, team: s.team,
        x: startX, y: startY, startX, startY, targetX, targetY, age: 0, life: flight, angle,
        vx: (targetX - startX) / flight, vy: (targetY - startY) / flight,
        damage: profile.secondaryDamage, caliber: 127, fireChance: .035,
        firedRange: distance(s, target), maxRange: s.secondaryRange, landHit: land !== null, visible: s.visible, potentialCounted: false});
      effect(g, 'muzzle', startX, startY, 7, s.team, .16, {shipId: s.id, angle, secondary: true});
    }
  }

  function countPotential(g, p, ax, ay, bx, by) {
    if (p.team === 0 || p.potentialCounted || !p.visible || !alive(g.player)) return;
    const dx = bx - ax, dy = by - ay;
    const t = clamp(((g.player.x - ax) * dx + (g.player.y - ay) * dy) / Math.max(.001, dx * dx + dy * dy), 0, 1);
    if (Math.hypot(ax + dx * t - g.player.x, ay + dy * t - g.player.y) <= Math.max(105, g.player.length)) {
      g.stats.potentialDamage += Math.max(0, p.damage); p.potentialCounted = true;
    }
  }

  function updateWarnings(g) {
    let danger = null, nearest = Infinity;
    const s = g.player;
    for (const p of g.projectiles) {
      if (p.kind !== 'torpedo' || p.team === 0 || !p.visible || !alive(s)) continue;
      const rx = p.x - s.x, ry = p.y - s.y, vx = p.vx - s.vx, vy = p.vy - s.vy;
      const speed2 = vx * vx + vy * vy;
      const time = -(rx * vx + ry * vy) / Math.max(1, speed2);
      if (time < 0 || time > 5 || Math.hypot(rx + vx * time, ry + vy * time) > s.length * .75 + 35) continue;
      const d = Math.hypot(rx, ry);
      if (d < nearest) { nearest = d; danger = p; }
    }
    g.warnings = danger ? {torpedo: true, torpedoBearing: Math.atan2(danger.y - s.y, danger.x - s.x), torpedoDistance: nearest} : {torpedo: false};
  }

  function emitSmoke(g, s) {
    g.smokeClouds.push({id: g._nextId++, x: s.x, y: s.y, radius: 145, age: 0, life: 26, team: s.team});
    s.smokeEmit = 2.1;
  }

  function tickStatus(g, s, dt) {
    for (const [key, module] of Object.entries(s.modules)) {
      if (module.state === 'normal') continue;
      module.time = Math.max(0, module.time - dt);
      if (module.time <= 0) {
        module.state = 'normal'; module.maxTime = 0;
        if (s.isPlayer) event(g, 'module', `${{engine: '기관', rudder: '조타 장치', guns: '주포'}[key]} 복구 완료`, {team: 0, shipId: s.id, module: key, state: 'normal', timeRemaining: 0, visible: true});
      }
    }
    if (s.modules.guns.state === 'normal') {
      s.reload = Math.max(0, s.reload - dt);
      s.secondaryReload = Math.max(0, s.secondaryReload - dt);
    }
    s.torpReload = Math.max(0, s.torpReload - dt);
    s.bloomTime = Math.max(0, s.bloomTime - dt);
    const repairStep = Math.min(dt, s.consumables.repair.active);
    for (const c of Object.values(s.consumables)) {
      c.cooldown = Math.max(0, c.cooldown - dt); c.active = Math.max(0, c.active - dt);
    }
    s.dcpTime = s.consumables.damageControl.active;
    s.repairTime = s.consumables.repair.active;
    s.smokeTime = s.consumables.ability.kind === 'smoke' ? s.consumables.ability.active : 0;
    s.sonarTime = s.consumables.ability.kind === 'sonar' ? s.consumables.ability.active : 0;
    if (s.dcpTime > 0) { s.fireTime = 0; s.fireStacks = 0; s.floodTime = 0; }
    if (s.fireTime > 0) {
      s.fireTime = Math.max(0, s.fireTime - dt);
      damageShip(g, s, s.maxHp * .0018 * Math.max(1, s.fireStacks) * dt, s.fireOwner, 'fire', 'fire');
      if (!s.fireTime) s.fireStacks = 0;
    }
    if (s.floodTime > 0 && alive(s)) {
      s.floodTime = Math.max(0, s.floodTime - dt);
      damageShip(g, s, s.maxHp * .003 * dt, s.floodOwner, 'flood', 'flood');
    }
    if (repairStep > 0 && alive(s)) {
      const healed = Math.max(0, Math.min(s.maxHp - s.hp, s.recoverableHp, s.repairBudget, s.maxHp * DAMAGE_RULES.repairPerCharge / s.consumables.repair.duration * repairStep));
      s.hp += healed; s.recoverableHp -= healed; s.repairBudget -= healed;
    }
    if (s.repairTime <= 0) s.repairBudget = 0;
    updateRepairPreview(s);
    if (s.smokeTime > 0 && alive(s)) {
      s.smokeEmit -= dt;
      if (s.smokeEmit <= 0) emitSmoke(g, s);
    }
  }

  function ellipseNormal(point, ellipse, padding) {
    const c = Math.cos(ellipse.rotation || 0), sn = Math.sin(ellipse.rotation || 0);
    const rx = ellipse.rx + (padding || 0), ry = ellipse.ry + (padding || 0);
    const x = (point.x - ellipse.x) * c + (point.y - ellipse.y) * sn;
    const y = -(point.x - ellipse.x) * sn + (point.y - ellipse.y) * c;
    let nx = x / (rx * rx), ny = y / (ry * ry);
    const length = Math.hypot(nx, ny);
    if (length < 1e-10) { nx = 1; ny = 0; } else { nx /= length; ny /= length; }
    return {x: nx * c - ny * sn, y: nx * sn + ny * c, radial: Math.hypot(x / rx, y / ry)};
  }

  function registerContact(g, s, kind, nx, ny) {
    const length = Math.max(.0001, Math.hypot(nx, ny)); nx /= length; ny /= length;
    s.contact = {kind, normalX: nx, normalY: ny, until: g.time + .7};
    if (kind === 'island') s.groundedUntil = g.time + .7;
    if (s.isPlayer && g.time - s.lastShoreWarning > 4) {
      event(g, 'warning', kind === 'island' ? '섬 접촉 · 후진하거나 해안선을 따라 조타하세요' : '전장 경계 · 후진하거나 안쪽으로 조타하세요', {team: 0, shipId: s.id});
      s.lastShoreWarning = g.time;
    }
    if (!s.isPlayer && !s.aiDisabled && (!s.recovery || s.recovery.until <= g.time)) {
      const escapeDistance = 70 + s.length * .45, margin = s.length * .55 + 20;
      s.recovery = {
        x: clamp(s.x + nx * escapeDistance, margin, g.world.w - margin),
        y: clamp(s.y + ny * escapeDistance, margin, g.world.h - margin),
        reverse: Math.cos(s.angle) * nx + Math.sin(s.angle) * ny < 0,
        until: g.time + Math.min(16, 4 + escapeDistance / Math.max(8, s.maxSpeed * .30))
      };
      s.aiThink = 0;
    }
  }

  function resolveWorldBoundary(g, s) {
    const margin = s.length * .55;
    const nx = clamp(s.x, margin, g.world.w - margin), ny = clamp(s.y, margin, g.world.h - margin);
    if (nx === s.x && ny === s.y) return;
    let normalX = 0, normalY = 0;
    if (nx !== s.x) { normalX = nx > s.x ? 1 : -1; if (s.vx * normalX < 0) s.vx = 0; }
    if (ny !== s.y) { normalY = ny > s.y ? 1 : -1; if (s.vy * normalY < 0) s.vy = 0; }
    s.x = nx; s.y = ny;
    registerContact(g, s, 'boundary', normalX, normalY);
    s.speed = Math.sign(s.driveSpeed) * Math.hypot(s.vx, s.vy);
  }

  function steerAroundObstacles(g, s, desired) {
    const look = 190 + Math.abs(s.speed) * 3;
    const margin = s.length * .55 + 35;
    const samples = [0, .30, -.30, .65, -.65, 1.05, -1.05, 1.5, -1.5, 2.1, -2.1, Math.PI];
    let best = desired, bestCost = Infinity;
    for (const offset of samples) {
      const a = desired + offset, x = s.x + Math.cos(a) * look, y = s.y + Math.sin(a) * look;
      let cost = Math.abs(offset) + .18 * Math.abs(angleDelta(a, s.angle));
      if (x < 120 || y < 120 || x > g.world.w - 120 || y > g.world.h - 120) cost += 14;
      for (const island of g.islands) {
        const hit = segmentEllipse(s.x, s.y, x, y, island, margin);
        if (hit === null) continue;
        const normal = ellipseNormal(s, island, margin);
        // Starting inside a navigation margin must not make every route equally
        // impassable. An outward segment is a valid escape, not another collision.
        const outward = hit === 0 && normal.radial < 1 && Math.cos(a) * normal.x + Math.sin(a) * normal.y > .12;
        if (!outward) cost += 20 * (1.1 - hit);
      }
      for (const other of g.ships) {
        if (other === s || !alive(other)) continue;
        const d = Math.hypot(x - other.x, y - other.y);
        if (d < 160) cost += 3 * (1 - d / 160);
      }
      if (cost < bestCost) { best = a; bestCost = cost; }
    }
    return best;
  }

  function planAI(g, s) {
    const profile = CLASSES[s.classId];
    const contacts = g.ships.filter(t => t.team !== s.team && alive(t) && t.seenBy[s.team]);
    const activeOrder = s.team === 0 && g.order && g.order.until > g.time ? g.order : null;
    const focused = activeOrder && activeOrder.type === 'focus' ? contacts.find(t => t.id === activeOrder.targetId) : null;
    const scoreContact = target => {
      const d = distance(s, target), clear = clearSight(g, s, target);
      const engageable = clear && d <= s.range;
      return d + (engageable ? 0 : clear ? 1300 : 2600)
        - (target.id === s.aiTargetId ? 140 : 0)
        - (focused === target ? (engageable ? 320 : 40) : 0);
    };
    contacts.sort((a, b) => scoreContact(a) - scoreContact(b));
    const target = contacts[0];
    s.aiTargetId = target ? target.id : null;
    // Recovering from damage does not require a visible target. Disengaged ships
    // should not burn down with a ready damage-control charge or useful repair pool.
    if (s.hp < s.maxHp * .68) useShipConsumable(g, s, 'repair');
    const damagedModule = Object.values(s.modules).some(module => module.state === 'damaged');
    if (s.floodTime > 4 || s.fireStacks > 1 || (s.fireTime > 12 && (!contacts.length || s.hp < s.maxHp * .45)) || damagedModule) useShipConsumable(g, s, 'damageControl');
    let goal = g.zones[s.aiLane % Math.max(1, g.zones.length)];
    if (!goal || goal.owner === s.team) {
      const available = g.zones.filter(z => z.owner !== s.team);
      available.sort((a, b) => distance(s, a) - distance(s, b));
      goal = available[0] || goal;
    }
    if (!goal) goal = {x: g.world.w / 2, y: g.world.h / 2, radius: 200, owner: null};
    if (activeOrder) {
      if (activeOrder.type === 'capture') goal = g.zones.find(z => z.id === activeOrder.zoneId) || goal;
      else if (activeOrder.type === 'regroup') goal = {x: g.player.x + (s.aiLane === 0 ? -150 : 150), y: g.player.y + 80, radius: 200, owner: s.team};
      else if (focused) goal = {x: focused.x, y: focused.y, radius: 200, owner: null};
    }
    const gd = distance(s, goal);
    let dx = goal.x - s.x, dy = goal.y - s.y;
    let desired = Math.atan2(dy, dx), throttle = gd < 115 && goal.owner !== s.team ? 0 : 4;
    if (target) {
      const d = distance(s, target), bearing = Math.atan2(target.y - s.y, target.x - s.x);
      const nearZone = gd < goal.radius * 1.3;
      if (d < profile.range * .84 && (nearZone || goal.owner === s.team || d < profile.range * .59)) {
        const tooClose = d < profile.range * .50;
        const combatHeading = bearing + s.aiOrbit * Math.PI / 2 + (tooClose ? s.aiOrbit * .6 : 0);
        desired = combatHeading;
        throttle = s.classId === 'battleship' ? 3 : 4;
      }
      const intercept = predictIntercept(s, target, profile.shellSpeed);
      const quality = s.team === 0 ? .97 : g.difficulty === 'easy' ? .84 : g.difficulty === 'hard' ? 1 : .96;
      const error = s.team === 0 ? 25 : g.difficulty === 'easy' ? 54 : g.difficulty === 'hard' ? 15 : 28;
      if (s.aiNoiseTimer <= 0) {
        s.aiNoiseX = (g.rng() - .5) * error * 2;
        s.aiNoiseY = (g.rng() - .5) * error * 2;
        s.aiNoiseTimer = .8;
      }
      s.aiAimX = target.x + (intercept.x - target.x) * quality + s.aiNoiseX;
      s.aiAimY = target.y + (intercept.y - target.y) * quality + s.aiNoiseY;
      const broadside = Math.abs(Math.sin(bearing - target.angle));
      s.aiAmmo = target.classId !== 'destroyer' && broadside > .70 && d < s.range * .80 && profile.caliber >= 200 ? 'AP' : 'HE';
      if (profile.torpCount && s.torpReload <= 0 && d < 800 && g.time > 22) {
        const lead = predictIntercept(s, target, profile.torpSpeed);
        const solution = getWeaponSolution(g, s, 'TORP', lead.x, lead.y, 'narrow');
        if (!solution.arcValid && solution.inRange && !solution.blockedByIsland) desired = solution.bearing + s.aiOrbit * Math.PI / 2;
      }
      if (profile.code === 'DD' && d < 850 && s.hp < s.maxHp * .55) useShipConsumable(g, s, 'ability');
      if (profile.code !== 'DD' && d < 780) useShipConsumable(g, s, 'ability');
    } else {
      s.aiAimX = s.x + Math.cos(s.angle) * 1000;
      s.aiAimY = s.y + Math.sin(s.angle) * 1000;
      if (gd < 140 && goal.owner === s.team) { desired += s.aiOrbit * Math.PI / 2; throttle = 1; }
    }
    const orderedCapture = activeOrder && activeOrder.type === 'capture';
    const recentDirectHit = g.time - (Number.isFinite(s.lastDamageTime) ? s.lastDamageTime : -100) < 2.8;
    const immediateEnemy = target && distance(s, target) < Math.max(240, s.length * 2);
    if (orderedCapture && !goal.contested && !recentDirectHit && !immediateEnemy && s.hp > s.maxHp * .24) {
      // Commit to the actual objective: brake within the ring and keep firing
      // with the independently rotating battery instead of orbiting out of it.
      const holding = gd <= goal.radius * .80;
      desired = holding ? s.angle : Math.atan2(goal.y - s.y, goal.x - s.x);
      throttle = holding ? 0 : 4;
    }
    // React only to nearby torpedoes, using a swept relative-motion prediction.
    // Turning the bow into a spread reduces the exposed hull width and breaks its lead.
    const danger = g.projectiles.find(p => {
      if (p.kind !== 'torpedo' || p.team === s.team || distance(s, p) > 510) return false;
      if (!g.ships.some(observer => alive(observer) && observer.team === s.team && distance(observer, p) < (observer.sonarTime > 0 ? 880 : 470))) return false;
      const rx = p.x - s.x, ry = p.y - s.y, vx = p.vx - s.vx, vy = p.vy - s.vy;
      const closing = clamp(-(rx * vx + ry * vy) / Math.max(1, vx * vx + vy * vy), 0, 3.2);
      return Math.hypot(rx + vx * closing, ry + vy * closing) < s.length * .65 + 12;
    });
    if (danger) {
      const same = Math.abs(angleDelta(danger.angle, s.angle));
      const opposite = Math.abs(angleDelta(danger.angle + Math.PI, s.angle));
      desired = same < opposite ? danger.angle : danger.angle + Math.PI;
      if (Math.abs(angleDelta(desired, s.angle)) < .15) desired += .45 * s.aiOrbit;
      throttle = 4;
    }
    desired = steerAroundObstacles(g, s, desired);
    const forwardHit = firstIslandHit(g, s.x, s.y, s.x + Math.cos(s.angle) * 280, s.y + Math.sin(s.angle) * 280, s.length * .55 + 20);
    if (forwardHit !== null) throttle = Math.min(throttle, 2);
    if (s.recovery && (s.recovery.until <= g.time || distance(s, s.recovery) <= 22)) s.recovery = null;
    if (s.recovery) {
      desired = Math.atan2(s.recovery.y - s.y, s.recovery.x - s.x) + (s.recovery.reverse ? Math.PI : 0);
      throttle = s.recovery.reverse ? -1 : 2;
    }
    const reverseRudder = s.driveSpeed < -.01 || (Math.abs(s.driveSpeed) <= .01 && throttle < 0);
    s.aiTurn = clamp(angleDelta(desired, s.angle) * 2.1, -1, 1) * (reverseRudder ? -1 : 1);
    s.throttle = throttle;
  }

  function tickAI(g, s, dt) {
    s.aiThink -= dt; s.aiNoiseTimer -= dt;
    if (s.aiThink <= 0) { planAI(g, s); s.aiThink = .20; }
    s.aimX = s.aiAimX; s.aimY = s.aiAimY;
    const target = g.ships.find(t => t.id === s.aiTargetId);
    if (target && alive(target) && target.seenBy[s.team] && distance(s, target) < s.range && clearSight(g, s, target)) {
      tryFire(g, s, s.aiAmmo, s.aiAimX, s.aiAimY);
      if (s.torpReloadMax > 0 && s.torpReload <= 0 && distance(s, target) < 750 && s.smokeTime <= 0 && g.time > 22) {
        const intercept = predictIntercept(s, target, CLASSES[s.classId].torpSpeed);
        // Avoid intentionally sending a spread through a nearby friendly hull.
        const blocked = g.ships.some(o => o !== s && o.team === s.team && alive(o) && segmentEllipse(s.x, s.y, intercept.x, intercept.y, shipEllipse(o, 45), 0) !== null);
        if (!blocked && tryFire(g, s, 'TORP', intercept.x, intercept.y, 'narrow')) s.torpReload += 9;
      }
    }
    return s.aiTurn;
  }

  function moveShip(g, s, dt, turn) {
    const profile = CLASSES[s.classId];
    if (!Number.isFinite(s.driveSpeed)) s.driveSpeed = s.speed;
    if (s.contact.until <= g.time) s.contact = {kind: 'none', normalX: 0, normalY: 0, until: 0};
    s.turn = clamp(turn || 0, -1, 1);
    s.rudder = approach(s.rudder || 0, s.turn, dt * 1.55);
    const throttle = clamp(Math.round(s.throttle), -1, 4);
    const fraction = throttle < 0 ? -.32 : throttle / 4;
    if (s.contact.kind !== 'none' && fraction * s.driveSpeed < 0 && Math.abs(s.speed) < Math.abs(s.driveSpeed) * .5) s.driveSpeed = s.speed;
    const engineState = s.modules.engine.state, rudderState = s.modules.rudder.state;
    const engineFactor = engineState === 'critical' ? .48 : engineState === 'damaged' ? .78 : 1;
    const rudderFactor = rudderState === 'critical' ? .38 : rudderState === 'damaged' ? .70 : 1;
    const goalSpeed = s.maxSpeed * fraction * (1 - .12 * Math.abs(s.rudder)) * engineFactor;
    const accel = profile.acceleration * (engineState === 'critical' ? .55 : engineState === 'damaged' ? .8 : 1) * (Math.abs(goalSpeed) < Math.abs(s.driveSpeed) ? 1.9 : 1);
    s.driveSpeed = approach(s.driveSpeed, goalSpeed, dt * accel);
    const flow = Math.max(Math.abs(s.speed), s.contact.kind !== 'none' ? Math.abs(s.driveSpeed) * .60 : 0);
    const turnPower = .14 + .86 * Math.min(1, flow / s.maxSpeed);
    s.angle += s.rudder * s.turnRate * rudderFactor * turnPower * dt * (s.driveSpeed < -.01 ? -1 : 1);
    s.angle = Math.atan2(Math.sin(s.angle), Math.cos(s.angle));
    s.vx = Math.cos(s.angle) * s.driveSpeed; s.vy = Math.sin(s.angle) * s.driveSpeed;
    s.x += s.vx * dt; s.y += s.vy * dt;
    for (const island of g.islands) {
      const c = Math.cos(island.rotation), sn = Math.sin(island.rotation);
      const relative = s.angle - island.rotation;
      const extX = Math.abs(Math.cos(relative)) * s.length * .45 + Math.abs(Math.sin(relative)) * s.width * .5;
      const extY = Math.abs(Math.sin(relative)) * s.length * .45 + Math.abs(Math.cos(relative)) * s.width * .5;
      const rx = island.rx + extX, ry = island.ry + extY;
      let lx = (s.x - island.x) * c + (s.y - island.y) * sn;
      let ly = -(s.x - island.x) * sn + (s.y - island.y) * c;
      const mag = Math.hypot(lx / rx, ly / ry);
      if (mag < 1) {
        if (mag < .001) { lx = rx; ly = 0; }
        else { lx /= mag; ly /= mag; }
        s.x = island.x + lx * c - ly * sn;
        s.y = island.y + lx * sn + ly * c;
        const normal = ellipseNormal(s, {x: island.x, y: island.y, rx, ry, rotation: island.rotation}, 0);
        const inward = s.vx * normal.x + s.vy * normal.y;
        if (inward < 0) { s.vx -= normal.x * inward; s.vy -= normal.y * inward; }
        registerContact(g, s, 'island', normal.x, normal.y);
      }
    }
    s.speed = Math.sign(s.driveSpeed) * Math.hypot(s.vx, s.vy);
    resolveWorldBoundary(g, s);
    const targetGunAngle = Math.atan2(s.aimY - s.y, s.aimX - s.x);
    const gunRate = turretRate(s);
    s.gunAngle += clamp(angleDelta(targetGunAngle, s.gunAngle), -gunRate * dt, gunRate * dt);
    s.gunAngle = Math.atan2(Math.sin(s.gunAngle), Math.cos(s.gunAngle));
    s.gunAlignment = Math.abs(angleDelta(targetGunAngle, s.gunAngle));
    const broadside = Math.abs(Math.sin(targetGunAngle - s.angle));
    s.gunsBearing = broadside > .56 ? profile.gunCount : Math.ceil(profile.gunCount / 2);
  }

  function shipCollisions(g) {
    for (let i = 0; i < g.ships.length; i++) {
      const a = g.ships[i]; if (!alive(a)) continue;
      for (let j = i + 1; j < g.ships.length; j++) {
        const b = g.ships[j]; if (!alive(b)) continue;
        const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
        const minDistance = (a.length + b.length) * .31;
        if (len >= minDistance) continue;
        const nx = len > .001 ? dx / len : 1, ny = len > .001 ? dy / len : 0;
        const push = (minDistance - len) * .5 + .1;
        a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
        const impact = Math.hypot(a.vx - b.vx, a.vy - b.vy);
        a.driveSpeed *= .7; b.driveSpeed *= .7;
        a.vx *= .7; a.vy *= .7; b.vx *= .7; b.vy *= .7;
        a.speed = Math.sign(a.driveSpeed) * Math.hypot(a.vx, a.vy);
        b.speed = Math.sign(b.driveSpeed) * Math.hypot(b.vx, b.vy);
        if (a.team !== b.team && g.time - Math.max(a.lastRamTime, b.lastRamTime) > 2) {
          const hitA = Math.min(a.maxHp * .23, Math.max(600, impact * 65 * Math.sqrt(b.maxHp / a.maxHp)));
          const hitB = Math.min(b.maxHp * .23, Math.max(600, impact * 65 * Math.sqrt(a.maxHp / b.maxHp)));
          a.lastRamTime = b.lastRamTime = g.time;
          damageShip(g, a, hitA, b.id, 'ram', 'ram'); damageShip(g, b, hitB, a.id, 'ram', 'ram');
          effect(g, 'hit', (a.x + b.x) / 2, (a.y + b.y) / 2, 45, 0, .7);
          if (a.isPlayer || b.isPlayer) event(g, 'warning', '적함과 충돌', {team: 0});
        }
      }
    }
    for (const s of g.ships) if (alive(s)) resolveWorldBoundary(g, s);
  }

  function tickProjectiles(g, dt) {
    const keep = [];
    for (const p of g.projectiles) {
      p.age += dt;
      if (p.kind === 'shell') {
        const previousX = p.x, previousY = p.y;
        const t = Math.min(1, p.age / p.life);
        p.x = p.startX + (p.targetX - p.startX) * t;
        p.y = p.startY + (p.targetY - p.startY) * t;
        countPotential(g, p, previousX, previousY, p.x, p.y);
        if (p.age < p.life) { keep.push(p); continue; }
        if (p.landHit) { effect(g, 'explosion', p.x, p.y, 22, p.team, .65); continue; }
        const struck = g.ships.find(s => alive(s) && s.id !== p.ownerId && pointInShip(p.x, p.y, s, 3));
        if (struck && struck.team !== p.team) resolveShellHit(g, p, struck);
        else effect(g, 'splash', p.x, p.y, struck ? 20 : 30, p.team, .8);
      } else {
        const previousX = p.x, previousY = p.y;
        const nextX = p.x + p.vx * dt, nextY = p.y + p.vy * dt;
        countPotential(g, p, previousX, previousY, nextX, nextY);
        const stepDistance = Math.hypot(nextX - previousX, nextY - previousY);
        const oldDistance = p.distance || 0;
        p.distance = oldDistance + stepDistance;
        p.armed = p.distance >= 72;
        let first = firstIslandHit(g, previousX, previousY, nextX, nextY, 0);
        let struck = null;
        for (const s of g.ships) {
          if (!alive(s) || s.id === p.ownerId) continue;
          const hit = segmentEllipse(previousX, previousY, nextX, nextY, shipEllipse(s, 3), 0);
          if (hit !== null && (first === null || hit < first)) { first = hit; struck = s; }
        }
        if (first !== null) {
          p.x = previousX + (nextX - previousX) * first; p.y = previousY + (nextY - previousY) * first;
          p.distance = oldDistance + stepDistance * first;
          p.armed = p.distance >= 72;
          if (struck && struck.team !== p.team && p.armed) {
            const reduction = struck.classId === 'battleship' ? .68 : struck.classId === 'cruiser' ? .88 : 1;
            const dealt = damageShip(g, struck, Math.round(p.damage * reduction), p.ownerId, 'torpedo', 'torpedo', 'TORP', p);
            if (alive(struck) && struck.dcpTime <= 0 && g.rng() < .58) {
              if (struck.floodTime <= 0 && p.ownerId === g.playerId) g.stats.floods++;
              struck.floodTime = 23; struck.floodOwner = p.ownerId;
            }
            effect(g, 'explosion', p.x, p.y, 62, p.team, 1.1, {shipId: struck.id});
            if (p.ownerId === g.playerId) {
              g.stats.torpHits++;
              event(g, 'hit', `어뢰 명중 +${Math.round(dealt).toLocaleString('ko-KR')}${struck.floodTime > 0 ? ' · 침수' : ''}`, {damage: dealt, result: 'torpedo', ammo: 'TORP', ownerId: p.ownerId, secondary: false, team: 0, shipId: struck.visible ? struck.id : undefined, x: struck.visible ? p.x : undefined, y: struck.visible ? p.y : undefined});
            }
          } else effect(g, 'splash', p.x, p.y, 30, p.team, .7);
          continue;
        }
        p.x = nextX; p.y = nextY;
        if (p.age < p.life && p.x > 0 && p.y > 0 && p.x < g.world.w && p.y < g.world.h) keep.push(p);
        else effect(g, 'splash', p.x, p.y, 16, p.team, .5);
      }
    }
    g.projectiles = keep;
  }

  function tickZones(g, dt) {
    for (const z of g.zones) {
      const occupants = g.ships.filter(s => alive(s) && distance(s, z) <= z.radius);
      const blue = occupants.filter(s => s.team === 0), red = occupants.filter(s => s.team === 1);
      z.contested = blue.length > 0 && red.length > 0;
      z.occupants = [blue.length, red.length];
      const previousOwner = z.owner;
      if (!z.contested && occupants.length) {
        const team = blue.length ? 0 : 1;
        const eligible = occupants.filter(s => s.captureBlockedUntil <= g.time);
        if (eligible.length) {
          const change = dt / 13 * Math.min(1.5, 1 + (eligible.length - 1) * .25);
          z.progress = clamp(z.progress + (team === 0 ? change : -change), -1, 1);
          if (z.owner === 0 && z.progress <= 0 || z.owner === 1 && z.progress >= 0) z.owner = null;
          if (z.progress >= 1) z.owner = 0;
          if (z.progress <= -1) z.owner = 1;
        }
      }
      if (z.owner !== previousOwner && z.owner !== null) {
        event(g, 'capture', `${z.id} 거점 ${z.owner === 0 ? '확보' : '상실'}`, {team: z.owner, x: z.x, y: z.y, zoneId: z.id});
        if (z.owner === 0 && blue.some(s => s.isPlayer)) g.stats.caps++;
        g.score[z.owner] += 35;
      }
      if (z.owner !== null && !z.contested) g.score[z.owner] += 1.45 * dt;
    }
  }

  function finish(g, winner, reason) {
    if (g.phase !== 'playing') return;
    g.winner = winner;
    g.phase = winner === null ? 'draw' : winner === 0 ? 'won' : 'lost';
    g.reason = reason;
    event(g, 'end', reason, {team: winner});
  }

  function checkEnd(g) {
    if (!alive(g.player)) { finish(g, 1, '기함 격침'); return; }
    if (g.trainingMode) return;
    if (!g.ships.some(s => s.team === 1 && alive(s))) { finish(g, 0, '적 함대 전멸'); return; }
    if (g.mode === 'elimination') {
      if (g.time >= g.duration) {
        const shares = [0, 1].map(team => {
          const fleet = g.ships.filter(s => s.team === team);
          return fleet.reduce((sum, s) => sum + s.hp, 0) / Math.max(1, fleet.reduce((sum, s) => sum + s.maxHp, 0));
        });
        finish(g, Math.abs(shares[0] - shares[1]) < .000001 ? null : shares[0] > shares[1] ? 0 : 1, '작전 시간 종료 · 함대 잔존 내구도 판정');
      }
      return;
    }
    const blue = g.score[0] >= g.targetScore, red = g.score[1] >= g.targetScore;
    if (blue || red) { finish(g, blue && red ? (g.score[0] === g.score[1] ? null : g.score[0] > g.score[1] ? 0 : 1) : blue ? 0 : 1, '거점 점수 달성'); return; }
    if (g.time >= g.duration) finish(g, Math.abs(g.score[0] - g.score[1]) < .01 ? null : g.score[0] > g.score[1] ? 0 : 1, '작전 시간 종료');
  }

  function tickGame(g, dt, controls) {
    if (!g || g.phase !== 'playing' || !Number.isFinite(dt) || dt <= 0) return g;
    // Internal substeps also protect integrations that call the public API at 10 Hz.
    if (dt > .05) {
      const count = Math.ceil(Math.min(dt, 1) / .05), step = Math.min(dt, 1) / count;
      for (let i = 0; i < count && g.phase === 'playing'; i++) tickGame(g, step, controls);
      return g;
    }
    controls = controls || {};
    g.time = Math.min(g.duration, g.time + dt);
    if (g.order && g.order.until <= g.time) g.order = null;
    for (const e of g.effects) e.age += dt;
    g.effects = g.effects.filter(e => e.age < e.life).slice(-220);
    for (const smoke of g.smokeClouds) smoke.age += dt;
    g.smokeClouds = g.smokeClouds.filter(smoke => smoke.age < smoke.life).slice(-80);
    updateVisibility(g);
    for (const s of g.ships) {
      if (!alive(s)) continue;
      tickStatus(g, s, dt);
      if (!alive(s)) continue;
      let turn = 0;
      if (s.isPlayer) {
        if (Number.isFinite(controls.throttle)) s.throttle = clamp(Math.round(controls.throttle), -1, 4);
        if (Number.isFinite(controls.aimX)) s.aimX = controls.aimX;
        if (Number.isFinite(controls.aimY)) s.aimY = controls.aimY;
        turn = clamp(Number(controls.turn) || 0, -1, 1);
      } else if (!s.aiDisabled) turn = tickAI(g, s, dt);
      moveShip(g, s, dt, turn);
      tickSecondaries(g, s);
      if (s.isPlayer && controls.fire) tryFire(g, s, controls.ammo || 'HE', s.aimX, s.aimY, controls.spread);
    }
    shipCollisions(g);
    tickProjectiles(g, dt);
    tickZones(g, dt);
    updateVisibility(g);
    updateWarnings(g);
    checkEnd(g);
    return g;
  }

  const SNAPSHOT_KEYS = ['seed', 'difficulty', 'operationId', 'loadoutId', 'mode', 'world', 'time', 'duration', 'phase', 'reason', 'winner', 'score', 'targetScore', 'playerId', 'matchId', 'ships', 'projectiles', 'effects', 'events', 'smokeClouds', 'lastKnown', 'stats', 'damageBreakdown', 'warnings', 'order', '_nextId', '_scoreTick', 'lastShotLimited', 'islands', 'zones'];
  const V2_SHIP_KEYS = ['id', 'classId', 'name', 'team', 'isPlayer', 'x', 'y', 'angle', 'gunAngle', 'maxHp', 'hp', 'maxSpeed', 'speed', 'vx', 'vy', 'turnRate', 'sections', 'modules', 'recoverableHp', 'repairPreview', 'repairBudget', 'lastDamageSection', 'secondaryReload', 'secondaryRange', 'length', 'width', 'armor', 'range', 'detectRange', 'reload', 'reloadMax', 'torpReload', 'torpReloadMax', 'throttle', 'rudder', 'turn', 'gunAlignment', 'gunsBearing', 'visible', 'detected', 'seenBy', 'fireTime', 'fireStacks', 'floodTime', 'smokeTime', 'repairTime', 'dcpTime', 'sonarTime', 'bloomTime', 'alive', 'aimX', 'aimY', 'captureBlockedUntil', 'lastShoreWarning', 'lastRamTime', 'aiDisabled', 'aiThink', 'aiTurn', 'aiAimX', 'aiAimY', 'aiAmmo', 'aiTargetId', 'aiLane', 'aiOrbit', 'aiNoiseX', 'aiNoiseY', 'aiNoiseTimer', 'smokeEmit', 'consumables', 'fireOwner', 'floodOwner', 'lastDamageTime', 'groundedUntil'];
  const SHIP_KEYS = [...V2_SHIP_KEYS, 'driveSpeed', 'contact', 'recovery'];
  const PROJECTILE_KEYS = ['id', 'kind', 'ammo', 'ownerId', 'team', 'x', 'y', 'startX', 'startY', 'targetX', 'targetY', 'age', 'life', 'angle', 'vx', 'vy', 'damage', 'distance', 'armed', 'visible', 'potentialCounted', 'spread', 'secondary', 'caliber', 'fireChance', 'firedRange', 'maxRange', 'landHit'];
  const STAT_KEYS = ['damage', 'kills', 'hits', 'shots', 'torpHits', 'caps', 'damageTaken', 'penetrations', 'overpens', 'ricochets', 'shatters', 'citadels', 'fires', 'floods', 'secondaryDamage', 'secondaryHits', 'potentialDamage'];
  const EFFECT_KEYS = ['id', 'type', 'x', 'y', 'radius', 'team', 'age', 'life', 'visible', 'shipId', 'damage', 'result', 'angle', 'secondary'];
  const V2_EVENT_KEYS = ['id', 'time', 'type', 'text', 'team', 'shipId', 'ownerId', 'x', 'y', 'visible', 'ammo', 'damage', 'result', 'fire', 'zoneId', 'kind', 'module', 'state', 'timeRemaining', 'section', 'targetId'];
  const EVENT_KEYS = [...V2_EVENT_KEYS, 'secondary'];
  const record = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const num = (n, low, high) => typeof n === 'number' && Number.isFinite(n) && n >= low && n <= high;
  const uint = n => Number.isInteger(n) && num(n, 0, 4294967295);
  const textValue = (s, max) => typeof s === 'string' && s.length <= max;
  const keysAllowed = (o, keys) => record(o) && Object.keys(o).every(key => keys.includes(key));

  // The restore boundary accepts plain JSON data only: no accessors, prototypes,
  // functions, reserved prototype keys, non-finite values or unbounded collections.
  function jsonSafe(value, depth, budget) {
    if (--budget.left < 0 || depth > 18) return false;
    if (value === null || typeof value === 'boolean') return true;
    if (typeof value === 'number') return Number.isFinite(value) && Math.abs(value) <= 1e12;
    if (typeof value === 'string') return value.length <= 2000;
    if (typeof value !== 'object') return false;
    const array = Array.isArray(value), prototype = Object.getPrototypeOf(value);
    if (array) {
      if (!prototype || !Object.getPrototypeOf(prototype) || Object.getPrototypeOf(Object.getPrototypeOf(prototype)) !== null || value.length > 2000) return false;
    } else if (prototype !== null && Object.getPrototypeOf(prototype) !== null) return false;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (key === '__proto__' || key === 'prototype' || key === 'constructor' || descriptor.get || descriptor.set || key.length > 100) return false;
      if (array && key === 'length') continue;
      if (!jsonSafe(descriptor.value, depth + 1, budget)) return false;
    }
    return true;
  }

  function serializeGame(g) {
    if (!g || g.trainingMode || g.phase !== 'playing' || !g.rng || typeof g.rng.getState !== 'function') return null;
    try {
      const state = {};
      for (const key of SNAPSHOT_KEYS) state[key] = g[key];
      state.effects = g.effects.slice(-220); state.events = g.events.slice(-100);
      const data = JSON.parse(JSON.stringify(state));
      return {version: 3, data, rngState: g.rng.getState()};
    } catch (_) { return null; }
  }

  function restoreGame(snapshot) {
    try {
      if (!jsonSafe(snapshot, 0, {left: 60000}) || !keysAllowed(snapshot, ['version', 'data', 'rngState']) || ![2, 3].includes(snapshot.version) || !uint(snapshot.rngState)) return null;
      const migratingV2 = snapshot.version === 2;
      const d = snapshot.data;
      if (!keysAllowed(d, SNAPSHOT_KEYS) || SNAPSHOT_KEYS.some(key => !Object.prototype.hasOwnProperty.call(d, key))) return null;
      if (!uint(d.seed) || !['easy', 'normal', 'hard'].includes(d.difficulty) || !['northern', 'bastion', 'openwater'].includes(d.operationId) || !['balanced', 'artillery', 'survival', 'maneuver'].includes(d.loadoutId)) return null;
      if ((d.operationId !== 'northern' && !N.OPERATIONS) || (d.loadoutId !== 'balanced' && !N.LOADOUTS)) return null;
      if (!['domination', 'control', 'elimination'].includes(d.mode) || d.phase !== 'playing' || d.winner !== null || !textValue(d.reason, 150) || !textValue(d.matchId, 120) || !d.matchId.length) return null;
      if (!keysAllowed(d.world, ['w', 'h']) || !num(d.world.w, 1000, 10000) || !num(d.world.h, 1000, 10000)) return null;
      if (!num(d.duration, 60, 1800) || !num(d.time, 0, d.duration) || d.time >= d.duration || !num(d.targetScore, 1, 10000) || !Array.isArray(d.score) || d.score.length !== 2 || !d.score.every(n => num(n, 0, 20000))) return null;
      if (!Number.isSafeInteger(d._nextId) || !num(d._nextId, 1, 1e9) || !num(d._scoreTick, 0, 1e9) || typeof d.lastShotLimited !== 'boolean') return null;
      if (!Array.isArray(d.ships) || d.ships.length !== 6 || !textValue(d.playerId, 60)) return null;
      const shipIds = new Set();
      for (const s of d.ships) {
        if (!keysAllowed(s, migratingV2 ? V2_SHIP_KEYS : SHIP_KEYS) || !textValue(s.id, 60) || !s.id.length || shipIds.has(s.id) || !CLASSES[s.classId] || !textValue(s.name, 80) || ![0, 1].includes(s.team)) return null;
        shipIds.add(s.id);
        if (['isPlayer', 'visible', 'detected', 'alive', 'aiDisabled'].some(key => typeof s[key] !== 'boolean')) return null;
        if (!num(s.x, 0, d.world.w) || !num(s.y, 0, d.world.h) || !num(s.angle, -Math.PI - .001, Math.PI + .001) || !num(s.gunAngle, -Math.PI - .001, Math.PI + .001)) return null;
        if (!num(s.maxHp, 1000, 200000) || !num(s.hp, 0, s.maxHp) || s.alive !== (s.hp > 0) || !num(s.maxSpeed, 1, 300) || !num(s.speed, -s.maxSpeed, s.maxSpeed * 1.01) || !num(s.vx, -350, 350) || !num(s.vy, -350, 350)) return null;
        if (!migratingV2) {
          if (!num(s.driveSpeed, -s.maxSpeed, s.maxSpeed * 1.01) || !keysAllowed(s.contact, ['kind', 'normalX', 'normalY', 'until']) || !['none', 'island', 'boundary'].includes(s.contact.kind) || !num(s.contact.normalX, -1.001, 1.001) || !num(s.contact.normalY, -1.001, 1.001) || !num(s.contact.until, 0, d.duration + 20)) return null;
          if (s.recovery !== null && (!keysAllowed(s.recovery, ['x', 'y', 'until', 'reverse']) || !num(s.recovery.x, 0, d.world.w) || !num(s.recovery.y, 0, d.world.h) || !num(s.recovery.until, 0, d.duration + 20) || typeof s.recovery.reverse !== 'boolean')) return null;
        }
        if (!num(s.length, 10, 400) || !num(s.width, 5, 200) || !num(s.armor, 1, 200) || !num(s.range, 100, 4000) || !num(s.detectRange, 50, 4000) || !num(s.turnRate, .05, 3)) return null;
        if (!Number.isInteger(s.throttle) || !num(s.throttle, -1, 4) || !num(s.rudder, -1.001, 1.001) || !num(s.turn, -1, 1) || !num(s.gunAlignment, 0, Math.PI + .001) || !num(s.gunsBearing, 0, 20)) return null;
        if (!Array.isArray(s.seenBy) || s.seenBy.length !== 2 || s.seenBy.some(v => typeof v !== 'boolean')) return null;
        for (const key of ['reload', 'reloadMax', 'torpReload', 'torpReloadMax', 'fireTime', 'floodTime', 'smokeTime', 'repairTime', 'dcpTime', 'sonarTime', 'bloomTime', 'secondaryReload', 'smokeEmit']) if (!num(s[key], 0, 180)) return null;
        if (!Number.isInteger(s.fireStacks) || !num(s.fireStacks, 0, 3) || !num(s.secondaryRange, 0, 1500) || !num(s.recoverableHp, 0, s.maxHp - s.hp + .001) || !num(s.repairPreview, 0, s.maxHp * .18 + .001) || !num(s.repairBudget, 0, s.maxHp * .18 + .001)) return null;
        if (!['bow', 'mid', 'stern'].includes(s.lastDamageSection) || !keysAllowed(s.sections, ['bow', 'mid', 'stern'])) return null;
        for (const key of ['bow', 'mid', 'stern']) {
          const section = s.sections[key];
          if (!keysAllowed(section, ['hp', 'maxHp']) || !num(section.maxHp, 1, s.maxHp) || !num(section.hp, 0, section.maxHp)) return null;
        }
        if (Math.abs(s.sections.bow.maxHp + s.sections.mid.maxHp + s.sections.stern.maxHp - s.maxHp) > .001) return null;
        if (!keysAllowed(s.modules, ['engine', 'rudder', 'guns'])) return null;
        for (const key of ['engine', 'rudder', 'guns']) {
          const module = s.modules[key];
          if (!keysAllowed(module, ['state', 'time', 'maxTime']) || !['normal', 'damaged', 'critical'].includes(module.state) || !num(module.maxTime, 0, 60) || !num(module.time, 0, module.maxTime)) return null;
          if (module.state === 'normal' && module.time !== 0) return null;
        }
        if (!keysAllowed(s.consumables, ['damageControl', 'repair', 'ability'])) return null;
        for (const key of ['damageControl', 'repair', 'ability']) {
          const c = s.consumables[key];
          if (!keysAllowed(c, ['kind', 'label', 'charges', 'maxCharges', 'cooldown', 'maxCooldown', 'duration', 'active']) || !['damageControl', 'repair', 'smoke', 'sonar'].includes(c.kind) || !textValue(c.label, 40)) return null;
          if (!Number.isInteger(c.charges) || !Number.isInteger(c.maxCharges) || !num(c.maxCharges, -1, 10) || !num(c.charges, -1, c.maxCharges) || !num(c.maxCooldown, 1, 180) || !num(c.cooldown, 0, c.maxCooldown) || !num(c.duration, 1, 60) || !num(c.active, 0, c.duration)) return null;
        }
        if (s.consumables.damageControl.kind !== 'damageControl' || s.consumables.repair.kind !== 'repair' || !['smoke', 'sonar'].includes(s.consumables.ability.kind)) return null;
        for (const key of ['aimX', 'aimY', 'aiAimX', 'aiAimY', 'aiNoiseX', 'aiNoiseY']) if (!num(s[key], -1e6, 1e6)) return null;
        for (const key of ['captureBlockedUntil', 'lastShoreWarning', 'lastRamTime']) if (!num(s[key], -20, d.duration + 60)) return null;
        for (const key of ['lastDamageTime', 'groundedUntil']) if (s[key] !== undefined && !num(s[key], 0, d.duration + 60)) return null;
        if (!num(s.aiThink, -1, 2) || !num(s.aiNoiseTimer, -d.duration - 2, 2) || !num(s.aiTurn, -1, 1) || ![0, 1, 2].includes(s.aiLane) || ![-1, 1].includes(s.aiOrbit) || !['HE', 'AP'].includes(s.aiAmmo)) return null;
      }
      if (d.ships.filter(s => s.team === 0).length !== 3 || d.ships.filter(s => s.team === 1).length !== 3 || d.ships.filter(s => s.isPlayer).length !== 1) return null;
      const player = d.ships.find(s => s.id === d.playerId);
      if (!player || !player.isPlayer || player.team !== 0 || player.hp <= 0) return null;
      for (const s of d.ships) for (const key of ['aiTargetId', 'fireOwner', 'floodOwner']) if (s[key] !== undefined && s[key] !== null && !shipIds.has(s[key])) return null;
      if (!Array.isArray(d.islands) || d.islands.length > 40 || !Array.isArray(d.zones) || d.zones.length > 5) return null;
      for (const island of d.islands) if (!keysAllowed(island, ['x', 'y', 'rx', 'ry', 'rotation', 'seed']) || !num(island.x, 0, d.world.w) || !num(island.y, 0, d.world.h) || !num(island.rx, 1, 1500) || !num(island.ry, 1, 1500) || !num(island.rotation, -TAU, TAU) || !uint(island.seed)) return null;
      const zoneIds = new Set();
      for (const zone of d.zones) {
        if (!keysAllowed(zone, ['id', 'x', 'y', 'radius', 'progress', 'owner', 'contested', 'occupants']) || !textValue(zone.id, 12) || !zone.id.length || zoneIds.has(zone.id) || !num(zone.x, 0, d.world.w) || !num(zone.y, 0, d.world.h) || !num(zone.radius, 50, 1000) || !num(zone.progress, -1, 1) || ![null, 0, 1].includes(zone.owner) || typeof zone.contested !== 'boolean') return null;
        if (zone.occupants !== undefined && (!Array.isArray(zone.occupants) || zone.occupants.length !== 2 || zone.occupants.some(n => !Number.isInteger(n) || !num(n, 0, 3)))) return null;
        zoneIds.add(zone.id);
      }
      if (!keysAllowed(d.stats, STAT_KEYS) || STAT_KEYS.some(key => !num(d.stats[key], 0, 1e9))) return null;
      const breakdownKeys = ['HE', 'AP', 'TORP', 'FIRE', 'FLOOD', 'SECONDARY'];
      if (!keysAllowed(d.damageBreakdown, breakdownKeys) || breakdownKeys.some(key => !num(d.damageBreakdown[key], 0, 1e9))) return null;
      if (!keysAllowed(d.lastKnown, Array.from(shipIds))) return null;
      for (const contact of Object.values(d.lastKnown)) if (!keysAllowed(contact, ['x', 'y', 'time']) || !num(contact.x, 0, d.world.w) || !num(contact.y, 0, d.world.h) || !num(contact.time, 0, d.time)) return null;
      const usedIds = new Set();
      const validId = id => { if (!Number.isSafeInteger(id) || id < 1 || id >= d._nextId || usedIds.has(id)) return false; usedIds.add(id); return true; };
      const point = p => num(p.x, -4000, d.world.w + 4000) && num(p.y, -4000, d.world.h + 4000);
      if (!Array.isArray(d.projectiles) || d.projectiles.length > 512) return null;
      for (const p of d.projectiles) {
        if (!keysAllowed(p, PROJECTILE_KEYS) || !validId(p.id) || !['shell', 'torpedo'].includes(p.kind) || !['HE', 'AP', 'TORP'].includes(p.ammo) || !shipIds.has(p.ownerId) || ![0, 1].includes(p.team) || !point(p)) return null;
        if (!num(p.startX, -4000, d.world.w + 4000) || !num(p.startY, -4000, d.world.h + 4000) || !num(p.targetX, -4000, d.world.w + 4000) || !num(p.targetY, -4000, d.world.h + 4000) || !num(p.life, .01, 30) || !num(p.age, 0, p.life) || !num(p.angle, -TAU, TAU) || !num(p.vx, -2000, 2000) || !num(p.vy, -2000, 2000) || !num(p.damage, 0, 30000)) return null;
        if (typeof p.visible !== 'boolean' || typeof p.potentialCounted !== 'boolean') return null;
        if (p.kind === 'torpedo') { if (p.ammo !== 'TORP' || !num(p.distance, 0, 6000) || typeof p.armed !== 'boolean' || !['narrow', 'wide'].includes(p.spread)) return null; }
        else if (!['HE', 'AP'].includes(p.ammo) || typeof p.secondary !== 'boolean' || typeof p.landHit !== 'boolean' || !num(p.caliber, 1, 1000) || !num(p.fireChance, 0, 1) || !num(p.firedRange, 0, 8000) || !num(p.maxRange, 1, 8000)) return null;
      }
      if (!Array.isArray(d.effects) || d.effects.length > 220 || !Array.isArray(d.events) || d.events.length > 100 || !Array.isArray(d.smokeClouds) || d.smokeClouds.length > 80) return null;
      for (const e of d.effects) if (!keysAllowed(e, EFFECT_KEYS) || !validId(e.id) || !['explosion', 'splash', 'hit', 'muzzle', 'smoke'].includes(e.type) || !point(e) || !num(e.radius, 0, 500) || ![0, 1].includes(e.team) || !num(e.life, .01, 60) || !num(e.age, 0, e.life) || typeof e.visible !== 'boolean' || (e.shipId !== undefined && !shipIds.has(e.shipId))) return null;
      for (const e of d.events) if (!keysAllowed(e, migratingV2 ? V2_EVENT_KEYS : EVENT_KEYS) || !validId(e.id) || !['fire', 'torpedo', 'hit', 'damage', 'kill', 'capture', 'consumable', 'warning', 'end', 'module', 'order'].includes(e.type) || !textValue(e.text, 250) || !num(e.time, 0, d.time) || ![null, 0, 1].includes(e.team) || (e.secondary !== undefined && typeof e.secondary !== 'boolean')) return null;
      for (const c of d.smokeClouds) if (!keysAllowed(c, ['id', 'x', 'y', 'radius', 'age', 'life', 'team']) || !validId(c.id) || !point(c) || !num(c.radius, 1, 500) || !num(c.life, 1, 60) || !num(c.age, 0, c.life) || ![0, 1].includes(c.team)) return null;
      if (!keysAllowed(d.warnings, ['torpedo', 'torpedoBearing', 'torpedoDistance']) || typeof d.warnings.torpedo !== 'boolean') return null;
      if (d.warnings.torpedo && (!num(d.warnings.torpedoBearing, -Math.PI, Math.PI) || !num(d.warnings.torpedoDistance, 0, 20000))) return null;
      if (d.order !== null) {
        if (!keysAllowed(d.order, ['type', 'targetId', 'zoneId', 'until']) || !['focus', 'capture', 'regroup'].includes(d.order.type) || !num(d.order.until, d.time, d.time + 25.001)) return null;
        if (d.order.type === 'focus' && !d.ships.some(s => s.id === d.order.targetId && s.team === 1)) return null;
        if (d.order.type === 'capture' && !zoneIds.has(d.order.zoneId)) return null;
      }
      // Assign only the validated, explicit schema. The mutable player reference and
      // executable RNG are reconstructed here, never accepted from stored input.
      const clean = JSON.parse(JSON.stringify(d)), game = {};
      for (const key of SNAPSHOT_KEYS) game[key] = clean[key];
      if (migratingV2) {
        // Validate the complete original V2 schema before adding new fields.
        // Existing shots, RNG, identity, damage pools and resources are untouched.
        for (const s of game.ships) {
          s.driveSpeed = s.speed;
          s.contact = {kind: 'none', normalX: 0, normalY: 0, until: 0};
          s.recovery = null;
        }
      }
      game.trainingMode = false;
      game.player = game.ships.find(s => s.id === game.playerId);
      game.rng = seededRandom(snapshot.rngState);
      return game;
    } catch (_) { return null; }
  }

  Object.assign(N, {CLASSES, DAMAGE_RULES, GUN_ALIGNMENT_TOLERANCE, createGame, tickGame, firePlayer, getWeaponSolution, useConsumable, issueOrder, predictIntercept, isVisible, distance, angleDelta, segmentEllipse, resolveShellHit, serializeGame, restoreGame});
})(typeof globalThis !== 'undefined' ? globalThis : window);
