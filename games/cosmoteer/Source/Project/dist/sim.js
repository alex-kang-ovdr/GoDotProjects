(function (root) {
  'use strict';
  const CELL = 28;
  const VERSION = 4;
  const DATA = typeof module !== 'undefined' && module.exports ? require('./data.js') : root.StarData;
  if (!DATA?.PART_OVERRIDES || !DATA?.INDUSTRY || !DATA?.CREW_MOVEMENT) throw new Error('STARFORGE data.js must load before sim.js');
  const INDUSTRY = DATA.INDUSTRY, CREW_MOVEMENT = DATA.CREW_MOVEMENT;
  const TAU = Math.PI * 2;
  const PARTS = Object.freeze({
    corridor: { name: '통로', description: '승무원이 이동하는 기본 선체. 옆 칸과 자동으로 연결됩니다.', cost: 24, hp: 90, color: '#293c50', walkable: true, mass: 1 },
    armor: { name: '장갑', description: '230 내구도의 외부 방호. 승무원은 통과할 수 없습니다.', cost: 58, hp: 230, color: '#62758a', walkable: false, mass: 3.2 },
    cockpit: { name: '조종실', description: '함선의 핵심. 파괴되면 전투에서 패배합니다.', cost: 240, hp: 340, color: '#59c9df', walkable: true, mass: 2.8, powerCapacity: 18, powerUse: 0.12 },
    reactor: { name: '원자로', description: '초당 10.5 에너지 생성. 승무원이 전지를 운반하며 파괴 시 인접 칸이 폭발합니다.', cost: 350, hp: 230, color: '#f2b75a', walkable: true, mass: 4.2, powerCapacity: 100, generation: 10.5, ...DATA.PART_OVERRIDES.reactor, visualFamily: 'reactor', tier: 1 },
    reactor_medium: { ...DATA.PART_OVERRIDES.reactor_medium, visualFamily: 'reactor', tier: 2 },
    reactor_large: { ...DATA.PART_OVERRIDES.reactor_large, visualFamily: 'reactor', tier: 3 },
    ammo_factory: { ...DATA.PART_OVERRIDES.ammo_factory, productionDuration: INDUSTRY.batchSeconds },
    bunk: { name: '승무원실', description: '구매 시 보급 승무원 6명이 합류합니다. 전사한 인원은 도크 수리비에 충원 비용이 포함됩니다.', cost: 190, hp: 155, color: '#9a8bd2', walkable: true, mass: 2.3, crewCapacity: 6 },
    storage: { name: '보급 저장고', description: '탄약 240과 황 20을 별도 보관합니다. 승무원이 탄약을 무장으로, 황을 공장으로 운반합니다.', cost: 170, hp: 170, color: '#c5a778', walkable: true, mass: 3, ammoCapacity: 240, ...DATA.PART_OVERRIDES.storage, ammoSource: true, sulfurSource: true },
    laser: { name: '레이저', description: '전지 5를 소비해 24 피해. 보급과 냉각이 지속 화력을 결정합니다.', cost: 235, hp: 190, color: '#56dfc7', walkable: true, mass: 2.2, powerCapacity: 36, powerPerShot: 5, damage: 24, interval: 1.32, range: 850, projectileSpeed: 740, heatPerShot: 3.8, firingArc: 2.45, heatCapacity: 100 },
    cannon: { name: '중포', description: '포탄 2발·전지 2를 소비해 78 피해. 탄약고와의 경로를 짧게 유지하세요.', cost: 290, hp: 250, color: '#e6a66a', walkable: true, mass: 4.5, powerCapacity: 18, ammoCapacity: 18, ammoPerShot: 2, powerPerShot: 2, damage: 78, interval: 3.1, range: 920, projectileSpeed: 440, heatPerShot: 6, firingArc: 2.1, heatCapacity: 100 },
    shield: { name: '실드', description: '방향에 관계없이 피해를 흡수하는 900 실드. 전지 공급이 끊기면 재생도 멈춥니다.', cost: 320, hp: 180, color: '#69a8f3', walkable: true, mass: 3.2, powerCapacity: 42, shieldCapacity: 900, shieldRegen: 17, heatCapacity: 100 },
    thruster: { name: '추진기', description: '설치 방향으로 힘을 냅니다. 기본은 위쪽 추진·아래쪽 배기. 배기 바로 뒤를 비우고, 제동·좌우 추진기도 마련하세요.', cost: 105, hp: 160, color: '#e6925d', walkable: true, mass: 1.8, powerCapacity: 14, powerUse: 0.7, thrust: 1150 },
    radiator: { name: '방열판', description: '연결된 선체에서 초당 8 열을 제거합니다. 오버클럭의 지속 시간을 늘립니다.', cost: 145, hp: 120, color: '#72b8cb', walkable: true, mass: 2.1, cooling: 8, heatCapacity: 100 }
  });
  const RESOURCE_KINDS = ['power', 'ammo', 'sulfur'];
  const CARRY_LIMIT = { power: Math.max(...Object.values(PARTS).map(d => d.batteryPack || 0)), ammo: 8, sulfur: INDUSTRY.sulfurCarryAmount };
  const reservedKey = (kind, outgoing = false) => '_reserved' + (outgoing ? 'Out' : '') + kind[0].toUpperCase() + kind.slice(1);
  const sourceFor = (part, kind) => !!PARTS[part.type][kind + 'Source'];
  const MODES = ['dock', 'battle', 'victory', 'defeat', 'complete'];
  const POLICIES = ['balanced', 'power', 'ammo'];
  const REPAIR_POLICIES = ['balanced', 'survival', 'supply'];
  const REPAIR_STOCK_MAX = 240, REPAIR_BUNDLE = 80, REPAIR_UNIT_COST = 2, REPAIR_HP_PER_STOCK = 4, REPAIR_RATE = 8, EXTINGUISH_RATE = 0.30;
  const UPGRADES = Object.freeze({
    reactor: { name: '원자로 효율', description: '모든 원자로의 초당 전지 생산량을 높입니다.', costs: [350, 650, 1000], step: 0.10, effect: '발전량' },
    logistics: { name: '함내 작업 동선', description: '보급과 현장 정비를 맡는 승무원의 이동 속도를 높입니다.', costs: [300, 550, 850], step: 0.08, effect: '승무원 이동 속도' },
    drive: { name: '추진 제어 개량', description: '방향별 추진력과 설치 위치에 따른 선회력을 높입니다.', costs: [300, 550, 850], step: 0.10, effect: '추력' }
  });
  const TACTICS = ['balanced', 'assault', 'kite', 'hold'];
  const PRIORITIES = ['weapons', 'reactor', 'cockpit', 'shield'];
  const CREW_RECRUIT_COST = 22;
  const CONTRACTS = Object.freeze({
    patrol: Object.freeze({ id: 'patrol', name: '순찰 함대 요격', description: '균형 무장으로 항로를 지키는 순찰선. 안정적인 첫 원정에 적합합니다.', risk: '보통', reward: 1450, rewardStep: 450, enemyStyle: 'patrol', range: 575 }),
    siege: Object.freeze({ id: 'siege', name: '장거리 포격함 사냥', description: '두꺼운 실드와 중포를 갖춘 포격함. 거리를 좁히고 노출된 포대를 겨냥하세요.', risk: '높음', reward: 1800, rewardStep: 550, enemyStyle: 'siege', range: 795 }),
    hunter: Object.freeze({ id: 'hunter', name: '고속 추격선 저지', description: '가벼운 선체와 레이저로 측면을 파고드는 추격선. 선회와 지속 보급이 중요합니다.', risk: '높음', reward: 1950, rewardStep: 600, enemyStyle: 'hunter', range: 370 })
  });
  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const key = (x, y) => x + ',' + y;
  const angleDelta = (a, b) => ((a - b + Math.PI) % TAU + TAU) % TAU - Math.PI;
  const round = n => Math.round(n * 1000) / 1000;
  function worldPoint(ship, x, y) {
    const c = Math.cos(ship.angle), s = Math.sin(ship.angle);
    return { x: ship.x + x * CELL * c - y * CELL * s, y: ship.y + x * CELL * s + y * CELL * c };
  }
  function localPoint(ship, x, y) {
    const c = Math.cos(ship.angle), s = Math.sin(ship.angle), dx = x - ship.x, dy = y - ship.y;
    return { x: (dx * c + dy * s) / CELL, y: (-dx * s + dy * c) / CELL };
  }
  function segmentBox(ax, ay, bx, by, cx, cy, half) {
    let lo = 0, hi = 1;
    const dx = bx - ax, dy = by - ay;
    for (const axis of [[ax, dx, cx], [ay, dy, cy]]) {
      const [a, d, c] = axis;
      if (Math.abs(d) < 1e-9) { if (a < c - half || a > c + half) return null; }
      else {
        let t1 = (c - half - a) / d, t2 = (c + half - a) / d;
        if (t1 > t2) [t1, t2] = [t2, t1];
        lo = Math.max(lo, t1); hi = Math.min(hi, t2);
        if (lo > hi) return null;
      }
    }
    return lo;
  }
  function segmentCircle(ax, ay, bx, by, cx, cy, radius) {
    const dx = bx - ax, dy = by - ay, ox = ax - cx, oy = ay - cy;
    const aa = dx * dx + dy * dy, cc = ox * ox + oy * oy - radius * radius;
    if (cc <= 0) return 0;
    if (aa < 1e-9) return null;
    const bb = 2 * (ox * dx + oy * dy), disc = bb * bb - 4 * aa * cc;
    if (disc < 0) return null;
    const t = (-bb - Math.sqrt(disc)) / (2 * aa);
    return t >= 0 && t <= 1 ? t : null;
  }
  function starterDesign() {
    const d = [];
    const row = (y, xs, types) => xs.forEach((x, i) => d.push({ type: types[i], x, y, rot: 0 }));
    row(-4, [-2, -1, 0, 1, 2], ['armor', 'laser', 'cannon', 'laser', 'armor']);
    row(-3, [-3, -2, -1, 0, 1, 2, 3], ['armor', 'corridor', 'corridor', 'corridor', 'corridor', 'corridor', 'armor']);
    row(-2, [-3, -2, -1, 0, 1, 2, 3], ['armor', 'corridor', 'bunk', 'cockpit', 'bunk', 'corridor', 'armor']);
    row(-1, [-3, -2, -1, 0, 1, 2, 3], ['armor', 'corridor', 'corridor', 'shield', 'corridor', 'corridor', 'armor']);
    row(0, [-3, -2, -1, 0, 1, 2, 3], ['armor', 'corridor', 'corridor', 'reactor', 'corridor', 'corridor', 'armor']);
    row(1, [-3, -2, -1, 0, 1, 2, 3], ['armor', 'corridor', 'corridor', 'storage', 'corridor', 'corridor', 'armor']);
    row(2, [-2, -1, 0, 1, 2], ['radiator', 'corridor', 'corridor', 'corridor', 'radiator']);
    row(3, [-2, -1, 0, 1, 2], ['armor', 'thruster', 'corridor', 'thruster', 'armor']);
    row(4, [-1, 0, 1], ['thruster', 'armor', 'thruster']);
    for (const p of d) {
      if (p.y === -3 && Math.abs(p.x) === 3) { p.type = 'thruster'; p.rot = 2; }
      if (p.y === 1 && Math.abs(p.x) === 3) { p.type = 'thruster'; p.rot = p.x < 0 ? 1 : 3; }
      if (p.y === 3 && Math.abs(p.x) === 1) p.type = 'corridor';
    }
    return d;
  }
  class Game {
    constructor() { this.reset(); }
    get ships() { return this.enemy ? [this.player, this.enemy] : [this.player]; }
    get salvaged() { return this._rewardClaimed; }
    _id(prefix) { return prefix + '_' + (++this._serial); }
    _random() { this._rng = (Math.imul(this._rng, 1664525) + 1013904223) >>> 0; return this._rng / 4294967296; }
    _result(ok, message) { return { ok, message }; }
    _log(text, type = 'info') {
      this.log.push({ text, time: this.time, type });
      if (this.log.length > 60) this.log.shift();
    }
    reset() {
      this._serial = 0; this._rng = 887136; this._accumulator = 0;
      this.mode = 'dock'; this.sector = 1; this.credits = 850; this.time = 0;
      this.paused = false; this.speed = 1; this.overclock = false; this.crewPolicy = 'balanced';
      this.tactic = 'balanced'; this.targetPriority = 'weapons'; this.contractId = 'patrol';
      this.repairPolicy = 'balanced'; this.serviceTargetId = null; this.upgrades = { reactor: 0, logistics: 0, drive: 0 }; this._fireClock = 0;
      this.enemy = null; this.projectiles = []; this.effects = []; this.fragments = []; this.debris = []; this.log = [];
      this.metrics = { powerDelivered: 0, ammoDelivered: 0, damageDealt: 0, damageTaken: 0, shotsFired: 0, battlesWon: 0, salvageEarned: 0, battleTime: 0, crewLost: 0, crewRecruited: 0, firesExtinguished: 0, hullRepaired: 0, repairStockUsed: 0, ammoProduced: 0, sulfurDelivered: 0, powerPacketsDelivered: 0, sulfurSalvaged: 0, sulfurSold: 0, inventorySoldAmmo: 0, inventorySoldSulfur: 0, inventoryRefund: 0 };
      this._recentHits = []; this._rewardClaimed = false; this._pendingDockTime = 0; this._targetId = null; this.targetPartId = null;
      this._damageDepth = 0; this._legacyWarnings = []; this._claimedSectors = []; this._blueprint = starterDesign(); this._battleStartedAt = 0;
      this.player = this._createShip(this._blueprint, 'player', 'KITE / 키트', 1);
      this.player.x = 0; this.player.y = 20;
      this._weapons(this.player, null, 0, true);
      this._log('도크 준비 완료. 승무원들이 전지와 탄약을 나릅니다.', 'info');
      return this._result(true, '새 항해를 시작했습니다.');
    }
    _makePart(spec, faction, hpScale = 1, prepared = true) {
      const def = PARTS[spec.type];
      return { id: this._id('part'), type: spec.type, x: spec.x, y: spec.y, rot: spec.rot || 0,
        hp: def.hp * hpScale, maxHp: def.hp * hpScale, power: (def.powerCapacity || 0) * (prepared ? (faction === 'enemy' ? 1 : 0.72) : 0),
        ammo: def.ammoCapacity ? (prepared ? (spec.type === 'storage' ? 190 : spec.type === 'ammo_factory' ? 0 : 14) : 0) : 0,
        sulfur: prepared && spec.type === 'storage' ? INDUSTRY.initialStorageSulfur : 0,
        production: spec.type === 'ammo_factory' ? { progress: 0, enabled: true, batchActive: false, state: 'sulfur' } : null, supplyState: 'ready',
        heat: 0, fire: 0, maxHeat: 100, cooldown: this._random() * 0.45, connected: true, active: true, status: '정상',
        throttle: 0, fireState: 'offline', blockedById: null, aimAngle: (spec.rot || 0) * Math.PI / 2,
        crewProvisioned: false, overheated: false, destroyed: false,
        _reservedPower: 0, _reservedAmmo: 0, _reservedSulfur: 0, _reservedOutPower: 0, _reservedOutAmmo: 0, _reservedOutSulfur: 0 };
    }
    _createShip(design, faction, name, level) {
      const ship = { id: this._id('ship'), faction, name, x: 0, y: 0, angle: faction === 'enemy' ? Math.PI : 0,
        vx: 0, vy: 0, angularVelocity: 0, parts: [], crew: [], shield: 0, maxShield: 0,
        shieldActive: false, shieldRadius: 0, launchHullMax: 0, holdPoint: null, repairStock: faction === 'player' ? 80 : 60,
        dead: false, moveTarget: null, level, enemyStyle: faction === 'enemy' ? this.contractId : null,
        _phase: this._random() * TAU, _aiTarget: null, _targetTimer: 0,
        shieldScale: faction === 'enemy' ? [0, 2, 2.15, 2.35][level] * (this.contractId === 'siege' ? 1.12 : this.contractId === 'hunter' ? 0.83 : 1) : 1 };
      ship.parts = design.map(p => this._makePart(p, faction, faction === 'enemy' ? 1 + level * 0.12 : 1));
      for (const part of ship.parts) part.aimAngle += ship.angle;
      this._topology(ship, false); this._syncCrew(ship, true);
      ship.maxShield = this._shieldMax(ship); ship.shield = ship.maxShield;
      ship.launchHullMax = ship.parts.reduce((n, p) => n + p.maxHp, 0);
      this._shieldState(ship);
      return ship;
    }
    _enemyDesign(level, style = this.contractId) {
      const d = starterDesign().map(p => ({ ...p }));
      const at = (x, y) => d.find(p => p.x === x && p.y === y);
      if (style === 'siege') {
        at(-1, -4).type = 'cannon'; at(1, -4).type = 'cannon'; at(0, -4).type = 'armor';
        at(0, 2).type = 'bunk';
        if (level >= 2) { at(0, -4).type = 'cannon'; at(-2, 0).type = 'reactor'; }
        if (level === 3) { at(-2, -4).type = 'laser'; at(2, -4).type = 'laser'; at(2, 0).type = 'radiator'; }
      } else if (style === 'hunter') {
        at(0, -4).type = 'laser'; at(0, 1).type = 'radiator';
        for (const p of d) if (p.type === 'armor' && Math.abs(p.x) === 3) p.type = 'corridor';
        for (const x of [-2, 2]) { at(x, 3).type = 'thruster'; at(x, 3).rot = 0; }
        if (level >= 2) { at(-2, -4).type = 'laser'; at(0, 1).type = 'reactor'; }
        if (level === 3) { at(2, -4).type = 'laser'; at(0, 2).type = 'bunk'; }
      } else if (level === 1) {
        at(1, -4).type = 'armor'; at(1, -2).type = 'corridor';
      } else {
        at(-2, -4).type = 'laser';
        if (level === 3) { at(2, -4).type = 'laser'; at(-2, 0).type = 'reactor'; at(0, 2).type = 'bunk'; }
      }
      return d;
    }
    _syncCrew(ship, initial = false) {
      const bunks = ship.parts.filter(p => p.type === 'bunk' && p.hp > 0 && (p.connected || this.mode === 'dock' || this.mode === 'complete'));
      const capacity = Math.min(60, bunks.length * PARTS.bunk.crewCapacity);
      const workshop = initial || this.mode === 'dock' || this.mode === 'complete';
      if (!workshop) return;
      if (ship.crew.length > capacity) {
        // A full store may be unable to take cargo back. Settle every carrier
        // first, then retain the people still holding resources before retiring
        // any empty-handed crew. Public refits preflight this capacity check.
        for (const c of ship.crew) this._cancelJob(ship, c, true);
        ship.crew.sort((a, b) => Number(b.cargoAmount > 0) - Number(a.cargoAmount > 0));
        if (ship.crew.filter(c => c.cargoAmount > 0).length > capacity) return this._result(false, '운반 화물을 보관하거나 승무원실을 먼저 확보하세요.');
        ship.crew = ship.crew.slice(0, capacity);
      }
      // A purchased bunk includes its initial complement once. Casualties cannot be
      // replaced for free by adding a corridor or by rebuilding topology.
      for (const home of bunks) if (!home.crewProvisioned) {
        home.crewProvisioned = true;
        const count = Math.min(PARTS.bunk.crewCapacity, capacity - ship.crew.length);
        for (let i = 0; i < count; i++) ship.crew.push({ id: this._id('crew'), x: home.x, y: home.y, homeId: home.id,
          job: null, cargo: null, cargoAmount: 0, cargoSourceId: null, idleTime: this._random() * 0.3,
          color: ship.faction === 'player' ? '#b8fff0' : '#ffc5a4' });
      }
      for (let i = 0; i < ship.crew.length; i++) {
        const c = ship.crew[i];
        if (!bunks.some(p => p.id === c.homeId)) c.homeId = bunks[i % bunks.length]?.id || c.homeId;
      }
    }
    _shieldMax(ship) { return ship.parts.reduce((v, p) => v + (p.hp > 0 && p.connected && p.type === 'shield' ? PARTS.shield.shieldCapacity * (ship.shieldScale || 1) : 0), 0); }
    _shieldState(ship) {
      ship.shieldRadius = ship.radius + 16;
      ship.shieldActive = !ship.dead && ship.shield > 0.01 && ship.parts.some(p => p.active && p.type === 'shield' && p.power > 0.002);
    }
    _topology(ship, detach, revalidate = true) {
      const grid = new Map(); ship.parts.forEach(p => { if (p.hp > 0) grid.set(key(p.x, p.y), p); });
      const cockpits = ship.parts.filter(p => p.hp > 0 && p.type === 'cockpit');
      const connected = new Set(), queue = cockpits.slice();
      for (const p of queue) connected.add(p.id);
      for (let i = 0; i < queue.length; i++) for (const [dx, dy] of DIRS) {
        const n = grid.get(key(queue[i].x + dx, queue[i].y + dy));
        if (n && !connected.has(n.id)) { connected.add(n.id); queue.push(n); }
      }
      for (const p of ship.parts) { p.connected = connected.has(p.id); p.active = p.hp > 0 && p.connected; }
      if (detach && cockpits.length && connected.size < grid.size) {
        const detached = ship.parts.filter(p => p.hp > 0 && !p.connected);
        const removedIds = new Set(detached.map(p => p.id));
        for (const p of detached) this._fragment(ship, p, false);
        ship.parts = ship.parts.filter(p => !removedIds.has(p.id));
        if (detached.length && ship.faction === 'player') this._log('연결부 손실: ' + detached.length + '개 모듈이 분리되었습니다.', 'danger');
      }
      ship._grid = new Map(); ship._walk = new Map(); ship._partById = new Map();
      for (const p of ship.parts) {
        ship._partById.set(p.id, p);
        if (p.hp > 0) ship._grid.set(key(p.x, p.y), p);
        if (p.active && PARTS[p.type].walkable) ship._walk.set(key(p.x, p.y), p);
      }
      ship.radius = Math.max(50, ...ship.parts.filter(p => p.hp > 0).map(p => Math.hypot(p.x, p.y) * CELL + CELL * 0.7));
      const live = ship.parts.filter(p => p.hp > 0 && p.connected);
      ship.mass = live.reduce((n, p) => n + PARTS[p.type].mass, 0);
      ship.centerOfMass = {
        x: live.reduce((n, p) => n + p.x * PARTS[p.type].mass, 0) / Math.max(1, ship.mass),
        y: live.reduce((n, p) => n + p.y * PARTS[p.type].mass, 0) / Math.max(1, ship.mass)
      };
      ship.inertia = Math.max(10, live.reduce((n, p) => n + PARTS[p.type].mass * ((p.x - ship.centerOfMass.x) ** 2 + (p.y - ship.centerOfMass.y) ** 2 + 0.35), 0));
      ship.maxShield = this._shieldMax(ship); ship.shield = Math.min(ship.shield || 0, ship.maxShield);
      if (detach && !cockpits.length) ship.dead = true;
      const workshop = revalidate && !detach && (this.mode === 'dock' || this.mode === 'complete');
      const safe = cockpits[0] || ship._walk.values().next().value;
      const survivors = []; let lost = 0;
      for (const c of ship.crew) {
        if (!ship._walk.has(key(Math.round(c.x), Math.round(c.y)))) {
          if (workshop && safe) { this._cancelJob(ship, c, true); c.x = safe.x; c.y = safe.y; }
          else if (detach) { lost++; continue; }
        }
        survivors.push(c);
        if (c.job && revalidate) {
          const target = ship._partById.get(c.job.targetId), source = ship._partById.get(c.job.sourceId);
          if (!target?.active || (c.job.phase === 'pickup' && !source?.active)) this._cancelJob(ship, c);
          else {
            if (!source?.active && !this._isService(c.job)) c.job.sourceId = target.id;
            const destination = this._isService(c.job) ? c.job.site : c.job.phase === 'pickup' ? source : target;
            const path = destination && this._path(ship, c.x, c.y, destination.x, destination.y);
            if (!path) this._cancelJob(ship, c);
            else {
              c.job.path = path; c.job.pathIndex = 0;
            }
          }
        }
      }
      ship.crew = survivors;
      if (ship.faction === 'player' && this.serviceTargetId && !ship.parts.some(p => p.id === this.serviceTargetId && p.active)) this.serviceTargetId = null;
      if (lost && ship.faction === 'player') {
        this.metrics.crewLost = (this.metrics.crewLost || 0) + lost;
        this._log('승무원 ' + lost + '명 손실. 도크 복구 시 충원이 필요합니다.', 'danger');
      }
      this._reservations(ship); this._shieldState(ship); ship._topologyDirty = false;
    }
    _path(ship, fromX, fromY, toX, toY) {
      const start = key(Math.round(fromX), Math.round(fromY)), goal = key(toX, toY);
      if (!ship._walk.has(start) || !ship._walk.has(goal)) return null;
      const prefix = Math.hypot(fromX - Math.round(fromX), fromY - Math.round(fromY)) > 1e-6 ? [{ x: Math.round(fromX), y: Math.round(fromY) }] : [];
      if (start === goal) return prefix;
      const queue = [start], previous = new Map([[start, null]]);
      for (let i = 0; i < queue.length; i++) {
        const [x, y] = queue[i].split(',').map(Number);
        for (const [dx, dy] of DIRS) {
          const k = key(x + dx, y + dy);
          if (!ship._walk.has(k) || previous.has(k)) continue;
          previous.set(k, queue[i]); queue.push(k);
          if (k === goal) {
            const path = []; let cursor = goal;
            while (cursor !== start) { const [px, py] = cursor.split(',').map(Number); path.push({ x: px, y: py }); cursor = previous.get(cursor); }
            return prefix.concat(path.reverse());
          }
        }
      }
      return null;
    }
    _reservations(ship) {
      for (const p of ship.parts) for (const kind of RESOURCE_KINDS) { p[reservedKey(kind)] = 0; p[reservedKey(kind, true)] = 0; }
      for (const c of ship.crew) if (c.job && !this._isService(c.job)) {
        const j = c.job, t = ship._partById.get(j.targetId), source = ship._partById.get(j.sourceId);
        if (t) t[reservedKey(j.kind)] += j.amount;
        if (source && j.phase === 'pickup') source[reservedKey(j.kind, true)] += j.amount;
      }
    }
    _settleCargo(ship, crew) {
      if (!crew.cargo || crew.cargoAmount <= 0) { crew.cargo = null; crew.cargoAmount = 0; crew.cargoSourceId = null; return; }
      const field = crew.cargo, sourceId = crew.cargoSourceId || crew.job?.sourceId;
      const rank = p => p.id === sourceId ? 4 : sourceFor(p, field) ? 2 : 0;
      const destinations = ship.parts.filter(p => p.hp > 0 && (PARTS[p.type][field + 'Capacity'] || 0) > 0).sort((a, b) => rank(b) - rank(a));
      for (const p of destinations) {
        const moved = Math.max(0, Math.min(crew.cargoAmount, PARTS[p.type][field + 'Capacity'] - p[field]));
        p[field] += moved; crew.cargoAmount -= moved;
        if (crew.cargoAmount < 1e-7) { crew.cargo = null; crew.cargoAmount = 0; crew.cargoSourceId = null; break; }
      }
    }
    _reclaimInventory(ship, removed) {
      // Dock removal returns paid inventory first. Any excess is explicitly sold;
      // cargo already held by crew is never sold or discarded by this helper.
      const transferred = { ammo: 0, sulfur: 0 }, sold = { ammo: 0, sulfur: 0 };
      for (const kind of ['ammo', 'sulfur']) {
        let amount = removed.reduce((n, p) => n + (p.hp > 0 ? (p[kind] || 0) + (kind === 'sulfur' && p.production?.batchActive ? INDUSTRY.sulfurPerBatch : 0) : 0), 0);
        for (const p of ship.parts.filter(p => p.hp > 0).sort((a, b) => Number(sourceFor(b, kind)) - Number(sourceFor(a, kind)))) {
          const moved = Math.min(amount, Math.max(0, (PARTS[p.type][kind + 'Capacity'] || 0) - (p[kind] || 0)));
          p[kind] = (p[kind] || 0) + moved; amount -= moved; transferred[kind] += moved;
        }
        sold[kind] = Math.max(0, amount);
      }
      return { transferred, sold, inventoryRefund: Math.floor((sold.ammo * 0.27 + sold.sulfur * INDUSTRY.sulfurUnitPrice * INDUSTRY.sulfurResaleMultiplier) + 1e-8) };
    }
    _recordInventoryRefund(report) {
      this.metrics.inventorySoldAmmo += report.sold.ammo; this.metrics.inventorySoldSulfur += report.sold.sulfur; this.metrics.inventoryRefund += report.inventoryRefund;
    }
    _inventoryMessage(report) {
      const moved = [], sold = [];
      for (const [kind, label] of [['ammo', '탄약'], ['sulfur', '황']]) {
        if (report.transferred[kind] > 0.001) moved.push(label + ' ' + round(report.transferred[kind]));
        if (report.sold[kind] > 0.001) sold.push(label + ' ' + round(report.sold[kind]));
      }
      return (moved.length ? ' · 이전 ' + moved.join(' / ') : '') + (sold.length ? ' · 남은 ' + sold.join(' / ') + ' 자동 매각 +' + report.inventoryRefund + ' C' : '');
    }
    _cancelJob(ship, crew, forceSettle = false) {
      if (crew.cargo && !crew.cargoSourceId) crew.cargoSourceId = crew.job?.sourceId || null;
      if (forceSettle || this.mode === 'dock' || this.mode === 'complete') this._settleCargo(ship, crew);
      // In flight, cargo stays with the carrier. A new reachable delivery/return
      // task is assigned instead of teleporting resources through a broken hull.
      crew.job = null; crew.idleTime = 0.12;
      if (!crew.cargo || crew.cargoAmount <= 0) { crew.cargo = null; crew.cargoAmount = 0; crew.cargoSourceId = null; }
    }
    _upgradeFactor(ship, id) { return 1 + (ship.faction === 'player' ? this.upgrades?.[id] || 0 : 0) * UPGRADES[id].step; }
    _isService(job) { return !!job && (job.kind === 'repair' || job.kind === 'extinguish'); }
    _servicePolicy(ship) { return ship.faction === 'player' ? this.repairPolicy : 'balanced'; }
    _serviceLimit(ship) {
      if (!ship.crew.length) return 0;
      const policy = this._servicePolicy(ship);
      return policy === 'supply' ? 1 : Math.max(1, Math.floor(ship.crew.length * (policy === 'survival' ? 0.60 : 0.25)));
    }
    _serviceNeeded(ship, target, kind) {
      if (!target?.active || target.hp <= 0) return false;
      return kind === 'extinguish' ? target.fire > 0.001 : this._servicePolicy(ship) !== 'supply' && target.fire <= 0.001 && ship.repairStock > 1e-7 && target.hp < target.maxHp - 0.001;
    }
    _servicePlan(ship, crew) {
      const workers = ship.crew.filter(c => this._isService(c.job));
      if (crew.cargo || workers.length >= this._serviceLimit(ship)) return null;
      const assigned = new Set(workers.map(c => c.job.targetId)); let best = null;
      for (const target of ship.parts) {
        if (!target.active || target.hp <= 0 || assigned.has(target.id)) continue;
        const kind = target.fire > 0.001 ? 'extinguish' : 'repair';
        if (!this._serviceNeeded(ship, target, kind)) continue;
        const sites = [{ x: target.x, y: target.y }, ...DIRS.map(([dx, dy]) => ({ x: target.x + dx, y: target.y + dy }))];
        for (const site of sites) {
          const cell = ship._walk.get(key(site.x, site.y)); if (!cell) continue;
          const path = this._path(ship, crew.x, crew.y, site.x, site.y); if (!path) continue;
          const score = (kind === 'extinguish' ? 60 + target.fire * 25 : (1 - target.hp / target.maxHp) * 35) +
            (ship.faction === 'player' && target.id === this.serviceTargetId ? 100 : 0) +
            (target.type === 'cockpit' ? 10 : PARTS[target.type].powerSource ? 6 : 0) - path.length * 1.1 - (cell.fire || 0) * 5;
          if (!best || score > best.score) best = { kind, target, site, path, score };
        }
      }
      return best;
    }
    _assignServiceJob(ship, crew, plan = null) {
      plan = plan || this._servicePlan(ship, crew); if (!plan) return false;
      crew.job = { kind: plan.kind, phase: 'service', sourceId: null, targetId: plan.target.id, site: { ...plan.site },
        path: plan.path, pathIndex: 0, amount: 0, work: 0, effectAmount: 0 };
      crew.idleTime = 0; return true;
    }
    _enforceServicePolicy(ship) {
      const service = ship.crew.filter(c => this._isService(c.job));
      service.sort((a, b) => Number(b.job.targetId === this.serviceTargetId) - Number(a.job.targetId === this.serviceTargetId) || Number(b.job.kind === 'extinguish') - Number(a.job.kind === 'extinguish'));
      let remaining = this._serviceLimit(ship);
      for (const c of service) {
        if (!this._serviceNeeded(ship, ship._partById.get(c.job.targetId), c.job.kind) || remaining <= 0) this._cancelJob(ship, c);
        else remaining--;
      }
    }
    _prioritizeServices(ship) {
      this._enforceServicePolicy(ship);
      for (const c of ship.crew) if (!c.cargo && c.job?.phase === 'pickup') {
        const plan = this._servicePlan(ship, c); if (!plan) continue;
        this._cancelJob(ship, c); this._assignServiceJob(ship, c, plan);
      }
      this._reservations(ship);
    }
    _serviceWork(ship, crew, target, dt) {
      const j = crew.job;
      if (!this._serviceNeeded(ship, target, j.kind)) { this._cancelJob(ship, crew); return; }
      // Cargo is never consumed for service jobs. Repair material is an explicit
      // shared ship stock; no healing happens before reaching the work site.
      let amount = 0;
      if (j.kind === 'extinguish') {
        amount = Math.min(target.fire, EXTINGUISH_RATE * dt); target.fire = Math.max(0, target.fire - amount);
        if (target.fire <= 0.001) {
          amount += target.fire; target.fire = 0;
          if (ship.faction === 'player') this.metrics.firesExtinguished++;
        }
      } else {
        amount = Math.min(REPAIR_RATE * dt, target.maxHp - target.hp, ship.repairStock * REPAIR_HP_PER_STOCK);
        target.hp += amount; const used = amount / REPAIR_HP_PER_STOCK;
        ship.repairStock = Math.max(0, ship.repairStock - used);
        if (ship.faction === 'player') { this.metrics.hullRepaired += amount; this.metrics.repairStockUsed += used; }
      }
      j.work += dt; j.effectAmount = (j.effectAmount || 0) + amount;
      const done = !this._serviceNeeded(ship, target, j.kind);
      if (j.work >= 0.35 || done) {
        const w = worldPoint(ship, target.x, target.y);
        if (j.effectAmount > 0) this._effect(j.kind, w.x, w.y, 0.45, j.kind === 'repair' ? '#89efb5' : '#a8e3ff', 13, j.effectAmount, ship.id, target.id);
        j.work = 0; j.effectAmount = 0;
      }
      if (done) this._cancelJob(ship, crew);
    }
    _assignJob(ship, crew) {
      if (crew.cargo && crew.cargoAmount > 0) {
        const field = crew.cargo; let best = null;
        for (const target of ship.parts) if (target.active) {
          const cap = PARTS[target.type][field + 'Capacity'] || 0;
          const available = cap - target[field] - target[reservedKey(field)];
          if (available < 0.05) continue;
          const path = this._path(ship, crew.x, crew.y, target.x, target.y); if (!path) continue;
          const reservoir = sourceFor(target, field), score = (reservoir ? 0 : 8) + available / Math.max(1, cap) * 4 - path.length * 0.1;
          if (!best || score > best.score) best = { target, path, score, amount: Math.min(crew.cargoAmount, available), reservoir };
        }
        if (!best) { crew.idleTime = 0.4; return; }
        crew.job = { kind: field, sourceId: ship._partById.has(crew.cargoSourceId) ? crew.cargoSourceId : best.target.id,
          targetId: best.target.id, path: best.path, phase: 'deliver', pathIndex: 0, amount: best.amount, work: 0, returning: best.reservoir };
        best.target[reservedKey(field)] += best.amount;
        return;
      }
      if (this._assignServiceJob(ship, crew)) return;
      const candidates = [], policy = ship.faction === 'player' ? this.crewPolicy : 'balanced';
      for (const p of ship.parts) if (p.active && PARTS[p.type].walkable) {
        const d = PARTS[p.type];
        if (d.powerCapacity && !d.powerSource) {
          const deficit = d.powerCapacity - p.power - p._reservedPower;
          if (deficit >= Math.min(4, d.powerCapacity * 0.25)) candidates.push({ target: p, kind: 'power', amount: deficit,
            score: (1 - p.power / d.powerCapacity) * 10 + (p.type === 'shield' ? 2 : 0) + (policy === 'power' ? 8 : policy === 'ammo' ? -2 : 0) });
        }
        if (d.ammoCapacity && !d.ammoSource) {
          const deficit = d.ammoCapacity - p.ammo - p._reservedAmmo;
          if (deficit >= 4) candidates.push({ target: p, kind: 'ammo', amount: Math.min(CARRY_LIMIT.ammo, deficit),
            score: (1 - p.ammo / d.ammoCapacity) * 12 + (policy === 'ammo' ? 10 : policy === 'power' ? -3 : 0) });
        }
        if (p.production?.enabled) {
          const deficit = d.sulfurCapacity - p.sulfur - p._reservedSulfur;
          if (deficit >= INDUSTRY.sulfurPerBatch) candidates.push({ target: p, kind: 'sulfur', amount: Math.min(CARRY_LIMIT.sulfur, deficit),
            score: 5 + (p.sulfur < 1 ? 4 : 0) + (policy === 'ammo' ? 6 : policy === 'power' ? -2 : 0) });
        }
        if (p.type === 'storage') {
          const deficit = d.ammoCapacity - p.ammo - p._reservedAmmo;
          if (deficit >= 8) candidates.push({ target: p, kind: 'ammo', amount: Math.min(CARRY_LIMIT.ammo, deficit), score: 1, factoryOnly: true });
        }
      }
      candidates.sort((a, b) => b.score - a.score);
      const sourcePaths = new Map();
      for (const source of ship.parts) if (source.active && RESOURCE_KINDS.some(kind => sourceFor(source, kind))) {
        const path = this._path(ship, crew.x, crew.y, source.x, source.y); if (path) sourcePaths.set(source.id, path);
      }
      let best = null;
      for (const candidate of candidates) {
        if (best && candidate.score + 0.4 < best.score) break;
        for (const source of ship.parts) {
          if (source.id === candidate.target.id || !source.active || !sourceFor(source, candidate.kind) || !sourcePaths.has(source.id) || (candidate.factoryOnly && !source.production)) continue;
          const available = source[candidate.kind] - source[reservedKey(candidate.kind, true)];
          if (available < 1) continue;
          const first = sourcePaths.get(source.id), second = this._path(ship, source.x, source.y, candidate.target.x, candidate.target.y);
          if (!second) continue;
          const carry = candidate.kind === 'power' ? PARTS[source.type].batteryPack : CARRY_LIMIT[candidate.kind];
          const score = candidate.score - (first.length + second.length) * 0.11 + (candidate.kind === 'ammo' && source.production ? 0.4 : 0);
          if (!best || score > best.score) best = { ...candidate, source, path: first, score, amount: Math.min(candidate.amount, available, carry) };
        }
      }
      if (!best) { crew.idleTime = 0.28; return; }
      crew.job = { kind: best.kind, sourceId: best.source.id, targetId: best.target.id, path: best.path,
        phase: 'pickup', pathIndex: 0, amount: best.amount, work: 0, returning: false };
      best.target[reservedKey(best.kind)] += best.amount; best.source[reservedKey(best.kind, true)] += best.amount;
    }
    _crewUpdate(ship, dt) {
      this._enforceServicePolicy(ship);
      if (this._servicePolicy(ship) === 'survival') this._prioritizeServices(ship);
      this._reservations(ship);
      const occupied = new Map();
      for (const c of ship.crew) { const k = key(Math.round(c.x), Math.round(c.y)); occupied.set(k, (occupied.get(k) || 0) + 1); }
      for (const c of ship.crew) {
        if (!c.job) { c.idleTime -= dt; if (c.idleTime <= 0) this._assignJob(ship, c); continue; }
        const j = c.job, source = ship._partById.get(j.sourceId), target = ship._partById.get(j.targetId);
        if (!target?.active || (j.phase === 'pickup' && !source?.active)) { this._cancelJob(ship, c); continue; }
        const step = j.path[j.pathIndex];
        if (step) {
          if (!ship._walk.has(key(step.x, step.y))) { this._cancelJob(ship, c); continue; }
          const dx = step.x - c.x, dy = step.y - c.y, distance = Math.hypot(dx, dy);
          const here = ship._walk.get(key(Math.round(c.x), Math.round(c.y)));
          const crowd = (occupied.get(key(Math.round(c.x), Math.round(c.y))) || 0) > 2 ? 0.72 : 1;
          const speed = CREW_MOVEMENT.baseTilesPerSecond * this._upgradeFactor(ship, 'logistics') * (here?.type === 'corridor' ? CREW_MOVEMENT.corridorMultiplier : CREW_MOVEMENT.roomMultiplier) * crowd * ((here?.fire || 0) > 0.2 ? 0.65 : 1);
          if (distance <= speed * dt) { c.x = step.x; c.y = step.y; j.pathIndex++; }
          else { c.x += dx / distance * speed * dt; c.y += dy / distance * speed * dt; }
          continue;
        }
        if (this._isService(j)) {
          if (!j.site || Math.hypot(c.x - j.site.x, c.y - j.site.y) > 0.001 || Math.abs(j.site.x - target.x) + Math.abs(j.site.y - target.y) > 1) { this._cancelJob(ship, c); continue; }
          this._serviceWork(ship, c, target, dt); continue;
        }
        j.work += dt;
        if (j.work < 0.3) continue;
        if (j.phase === 'pickup') {
          const field = j.kind, amount = Math.min(j.amount, source[field]);
          const path = this._path(ship, c.x, c.y, target.x, target.y);
          if (amount < 0.1 || !path) { this._cancelJob(ship, c); continue; }
          source[field] = Math.max(0, source[field] - amount);
          j.amount = amount; c.cargo = j.kind; c.cargoAmount = amount; c.cargoSourceId = source.id;
          j.phase = 'deliver'; j.path = path; j.pathIndex = 0; j.work = 0;
        } else {
          const field = j.kind, cap = PARTS[target.type][field + 'Capacity'] || 0;
          const delivered = Math.max(0, Math.min(c.cargoAmount, j.amount, cap - target[field]));
          target[field] += delivered; c.cargoAmount -= delivered;
          if (ship.faction === 'player' && !sourceFor(target, j.kind)) {
            this.metrics[j.kind === 'power' ? 'powerDelivered' : j.kind === 'ammo' ? 'ammoDelivered' : 'sulfurDelivered'] += delivered;
            if (j.kind === 'power' && delivered > 0) this.metrics.powerPacketsDelivered++;
          }
          c.job = null; c.idleTime = 0.06;
          if (c.cargoAmount < 1e-7) { c.cargo = null; c.cargoAmount = 0; c.cargoSourceId = null; }
        }
      }
    }
    _productionState(p) {
      const b = p.production, d = PARTS[p.type];
      if (!p.active || p.overheated) return 'offline';
      if (!b.enabled) return 'disabled';
      if (p.ammo + INDUSTRY.ammoPerBatch > d.ammoCapacity) return 'output_full';
      if (!b.batchActive && p.sulfur < INDUSTRY.sulfurPerBatch) return 'sulfur';
      if (p.power < INDUSTRY.powerPerSecond / 60 - 1e-8) return 'power';
      return 'producing';
    }
    _factoryStatus(p) {
      return { producing: '탄약 생산 중', disabled: '생산 정지', power: '생산 대기 · 전지 부족', sulfur: '생산 대기 · 황 부족', output_full: '완제품 저장 가득 참', offline: '생산 설비 작동 불가' }[p.production.state] || '생산 대기';
    }
    _production(ship, p, dt) {
      const b = p.production; b.state = this._productionState(p);
      if (b.state !== 'producing' || dt <= 0) return;
      if (!b.batchActive) { p.sulfur -= INDUSTRY.sulfurPerBatch; b.batchActive = true; b.progress = 0; }
      const work = Math.min(dt, INDUSTRY.batchSeconds - b.progress, p.power / INDUSTRY.powerPerSecond);
      p.power = Math.max(0, p.power - work * INDUSTRY.powerPerSecond); b.progress += work;
      if (b.progress >= INDUSTRY.batchSeconds - 1e-7) {
        p.ammo += INDUSTRY.ammoPerBatch; b.progress = 0; b.batchActive = false;
        if (ship.faction === 'player') this.metrics.ammoProduced += INDUSTRY.ammoPerBatch;
        const w = worldPoint(ship, p.x, p.y); this._effect('production', w.x, w.y, 0.45, '#f3cf79', 22);
      }
      b.state = this._productionState(p);
    }
    _supplyState(ship, p) {
      if (!p.active) return 'offline';
      const d = PARTS[p.type]; let kind = null;
      if (d.ammoPerShot && p.ammo < d.ammoPerShot) kind = 'ammo';
      else if (p.production?.enabled && !p.production.batchActive && p.sulfur < INDUSTRY.sulfurPerBatch) kind = 'sulfur';
      else if (d.powerCapacity && !d.powerSource && p.power < (d.powerPerShot || 0.6)) kind = 'power';
      if (!kind) return 'ready';
      if (!ship.crew.length) return 'crew';
      const sources = ship.parts.filter(q => q.active && sourceFor(q, kind));
      if (!sources.length) return 'source';
      if (!sources.some(q => this._path(ship, q.x, q.y, p.x, p.y))) return 'path';
      return kind;
    }
    _systems(ship, dt) {
      if (ship.dead) return;
      const shields = ship.parts.filter(p => p.active && p.type === 'shield');
      ship.maxShield = this._shieldMax(ship);
      ship.shield = Math.min(ship.shield, ship.maxShield);
      for (const p of ship.parts) if (p.active) {
        const d = PARTS[p.type];
        if (d.powerSource) p.power = Math.min(d.powerCapacity, p.power + d.generation * this._upgradeFactor(ship, 'reactor') * dt);
        else if (d.powerUse && p.type !== 'thruster') p.power = Math.max(0, p.power - d.powerUse * dt);
        p.cooldown = Math.max(0, p.cooldown - dt);
      }
      for (const p of shields) if (p.power > 0.6 && ship.shield < ship.maxShield) {
        const enemyFactor = ship.faction === 'enemy' ? 0.7 : 1;
        const regen = Math.min(PARTS.shield.shieldRegen * enemyFactor * dt, ship.maxShield - ship.shield, p.power / 0.075);
        ship.shield += regen; p.power = Math.max(0, p.power - regen * 0.075);
      }
      this._crewUpdate(ship, dt);
      for (const p of ship.parts) if (p.production) this._production(ship, p, dt);
      this._shieldState(ship);
      const hot = ship.parts.filter(p => p.active && p.heat > 0.01);
      const cooling = ship.parts.reduce((n, p) => n + (p.active ? PARTS[p.type].cooling || 0 : 0), 0);
      const heatTotal = hot.reduce((sum, p) => sum + p.heat, 0);
      for (const p of ship.parts) {
        if (p.hp <= 0) { p.status = '파괴됨'; continue; }
        if (!p.connected) { p.status = '선체 연결 끊김'; continue; }
        if (p.heat > 0) p.heat = Math.max(0, p.heat - dt * (0.45 + (heatTotal > 0 ? cooling * p.heat / heatTotal : 0)));
        if (p.heat >= 100) p.overheated = true;
        if (p.heat < 65) p.overheated = false;
        if (p.heat > 125 && this.mode === 'battle') this._damagePart(ship, p, dt * 2.5, 'heat');
        const d = PARTS[p.type];
        p.status = p.fire > 0.001 ? '화재 · 소화 필요' : p.overheated ? '과열 · 냉각 중' : p.heat > 85 ? '고열 경고' :
          p.type === 'cannon' && p.ammo < d.ammoPerShot ? '탄약 보급 대기' :
          d.powerCapacity && !d.powerSource && p.power < (d.powerPerShot || 0.6) ? '전지 보급 대기' :
          d.powerSource ? '전지 생산 중 · 팩 ' + d.batteryPack : p.production ? this._factoryStatus(p) : p.type === 'storage' ? '보급 저장 · 황 ' + round(p.sulfur) :
          p.type === 'radiator' ? '열 방출 중' : '정상';
        p.supplyState = this._supplyState(ship, p);
      }
    }
    _thrustModel(ship) {
      const engines = [], totals = { forward: 0, reverse: 0, left: 0, right: 0, positiveTurn: 0, negativeTurn: 0 };
      const mass = Math.max(1, ship.mass), inertia = Math.max(10, ship.inertia || 10), center = ship.centerOfMass || { x: 0, y: 0 };
      for (const p of ship.parts) if (p.active && p.type === 'thruster') {
        const [dx, dy] = DIRS[p.rot], exhaust = ship._grid.get(key(p.x - dx, p.y - dy));
        const available = exhaust ? 0 : clamp(p.power / 0.6, 0, 1);
        const force = PARTS.thruster.thrust * this._upgradeFactor(ship, 'drive'), ax = dx * force / mass, ay = dy * force / mass;
        const alpha = ((p.x - center.x) * dy - (p.y - center.y) * dx) * force / inertia * 0.17;
        engines.push({ part: p, ax, ay, alpha, available, exhaust });
        if (dy < 0) totals.forward += -ay * available;
        if (dy > 0) totals.reverse += ay * available;
        if (dx < 0) totals.left += -ax * available;
        if (dx > 0) totals.right += ax * available;
        if (alpha > 0) totals.positiveTurn += alpha * available;
        if (alpha < 0) totals.negativeTurn += -alpha * available;
      }
      return { engines, ...totals, turn: Math.min(totals.positiveTurn, totals.negativeTurn) };
    }
    _weaponFacing(ship) {
      const scores = [0, 0, 0, 0];
      for (const p of ship.parts) if (p.active && PARTS[p.type].damage) scores[p.rot] += PARTS[p.type].damage / PARTS[p.type].interval;
      let best = 0; for (let i = 1; i < 4; i++) if (scores[i] > scores[best]) best = i;
      return best * Math.PI / 2;
    }
    _motion(ship, opponent, dt) {
      if (!opponent || ship.dead) return;
      const model = this._thrustModel(ship), dx = opponent.x - ship.x, dy = opponent.y - ship.y;
      const distance = Math.max(1, Math.hypot(dx, dy)), player = ship.faction === 'player';
      const controls = ship.parts.some(p => p.active && p.type === 'cockpit' && p.power >= 0.05);
      const tactic = player ? this.tactic : 'balanced';
      let tx = 0, ty = 0;
      if (ship.moveTarget) {
        tx = ship.moveTarget.x - ship.x; ty = ship.moveTarget.y - ship.y;
        if (Math.hypot(tx, ty) < 12 && Math.hypot(ship.vx, ship.vy) < 6) {
          if (tactic === 'hold') ship.holdPoint = { ...ship.moveTarget };
          ship.moveTarget = null;
        }
      } else if (tactic === 'hold') {
        if (!ship.holdPoint) ship.holdPoint = { x: ship.x, y: ship.y };
        tx = ship.holdPoint.x - ship.x; ty = ship.holdPoint.y - ship.y;
      } else {
        const desiredRange = player ? { balanced: 550, assault: 355, kite: 760 }[tactic] : CONTRACTS[ship.enemyStyle || 'patrol'].range;
        const offset = distance - Math.max(desiredRange, ship.radius + opponent.radius + 35);
        const orbit = player ? (tactic === 'kite' ? 28 : tactic === 'assault' ? 0 : 5) : ship.enemyStyle === 'hunter' ? 110 : ship.enemyStyle === 'siege' ? 8 : 17;
        const strafe = Math.sin(this.time * 0.13 + ship._phase) * orbit;
        tx = dx / distance * offset - dy / distance * strafe;
        ty = dy / distance * offset + dx / distance * strafe;
      }
      const cs = Math.cos(ship.angle), sn = Math.sin(ship.angle);
      const maxSpeed = player ? 72 : ship.enemyStyle === 'hunter' ? 98 : ship.enemyStyle === 'siege' ? 43 : 64;
      const desiredLength = Math.hypot(tx, ty), speed = Math.min(maxSpeed, desiredLength * 0.42);
      const targetVx = desiredLength > 0.001 ? tx / desiredLength * speed : 0;
      const targetVy = desiredLength > 0.001 ? ty / desiredLength * speed : 0;
      const worldAx = (targetVx - ship.vx) * 0.95, worldAy = (targetVy - ship.vy) * 0.95;
      const localAx = clamp(worldAx * cs + worldAy * sn, -model.left, model.right);
      const localAy = clamp(-worldAx * sn + worldAy * cs, -model.forward, model.reverse);
      const desiredAngle = Math.atan2(dx, -dy) - this._weaponFacing(ship);
      const desiredOmega = clamp(angleDelta(desiredAngle, ship.angle) * 1.7, -0.72, 0.72);
      const desiredAlpha = clamp((desiredOmega - ship.angularVelocity) * 2.4, -model.negativeTurn, model.positiveTurn);
      // Bounded least-squares allocation of actual engine outputs. Position and
      // direction contribute both translation and torque; no virtual thrusters.
      const angularWeight = 45, residual = controls ? [localAx, localAy, desiredAlpha * angularWeight] : [0, 0, 0];
      const commands = model.engines.map(e => ({ ...e, column: [e.ax, e.ay, e.alpha * angularWeight], throttle: 0 }));
      if (controls) for (let iteration = 0; iteration < 14; iteration++) for (const engine of commands) {
        if (engine.available <= 0) continue;
        const v = engine.column, denom = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
        if (denom < 1e-9) continue;
        const next = clamp(engine.throttle + (residual[0] * v[0] + residual[1] * v[1] + residual[2] * v[2]) / denom, 0, engine.available);
        const delta = next - engine.throttle; engine.throttle = next;
        for (let axis = 0; axis < 3; axis++) residual[axis] -= delta * v[axis];
      }
      let ax = 0, ay = 0, alpha = 0;
      for (const p of ship.parts) if (p.type === 'thruster') p.throttle = 0;
      for (const e of commands) {
        const p = e.part; p.throttle = e.throttle; p.exhaustBlockedById = e.exhaust?.id || null;
        p.power = Math.max(0, p.power - dt * (0.025 + PARTS.thruster.powerUse * e.throttle));
        p.status = e.exhaust ? '배기 공간 차폐' : p.power < 0.05 ? '전지 보급 대기' : !controls ? '조종실 전력 대기' : e.throttle > 0.03 ? '추력 ' + Math.round(e.throttle * 100) + '%' : '추진 대기';
        ax += e.ax * e.throttle; ay += e.ay * e.throttle; alpha += e.alpha * e.throttle;
      }
      ship.vx += (ax * cs - ay * sn) * dt; ship.vy += (ax * sn + ay * cs) * dt;
      ship.angularVelocity += alpha * dt;
      // Small passive drag only removes momentum. Engine-less ships cannot gain
      // speed or start turning from rest, even with an active movement command.
      ship.vx *= Math.exp(-0.018 * dt); ship.vy *= Math.exp(-0.018 * dt); ship.angularVelocity *= Math.exp(-0.11 * dt);
      ship.x = clamp(ship.x + ship.vx * dt, -1500, 1500); ship.y = clamp(ship.y + ship.vy * dt, -1500, 1500);
      ship.angle = (ship.angle + ship.angularVelocity * dt + TAU) % TAU;
    }
    _chooseTarget(ship, opponent, dt) {
      if (ship.faction === 'player' && this._targetId) {
        const p = opponent.parts.find(x => x.id === this._targetId && x.hp > 0 && x.connected);
        if (p) return p;
        this._targetId = null; this.targetPartId = null;
      }
      ship._targetTimer -= dt;
      const old = opponent.parts.find(p => p.id === ship._aiTarget && p.hp > 0 && p.connected);
      if (old && ship._targetTimer > 0) return old;
      const priority = ship.faction === 'player' ? this.targetPriority : ship.enemyStyle === 'siege' ? 'cockpit' : 'weapons';
      const types = priority === 'weapons' ? ['laser', 'cannon'] : [priority];
      const live = opponent.parts.filter(p => p.hp > 0 && p.connected);
      let candidates = live.filter(p => priority === 'reactor' ? PARTS[p.type].powerSource : types.includes(p.type));
      if (!candidates.length) candidates = live.filter(p => (['laser', 'cannon', 'cockpit', 'shield'].includes(p.type) || PARTS[p.type].powerSource));
      if (!candidates.length) candidates = live;
      candidates.sort((a, b) => {
        const wa = worldPoint(opponent, a.x, a.y), wb = worldPoint(opponent, b.x, b.y);
        return Math.hypot(wa.x - ship.x, wa.y - ship.y) + a.hp * 0.06 - Math.hypot(wb.x - ship.x, wb.y - ship.y) - b.hp * 0.06;
      });
      const target = candidates[0]; ship._aiTarget = target?.id || null; ship._targetTimer = 1.4;
      return target;
    }
    _weaponBlocker(ship, weapon, targetX, targetY) {
      const end = localPoint(ship, targetX, targetY); let nearest = null, first = 2;
      for (const p of ship.parts) if (p.id !== weapon.id && p.hp > 0) {
        const hit = segmentBox(weapon.x, weapon.y, end.x, end.y, p.x, p.y, weapon.type === 'cannon' ? 0.54 : 0.50);
        if (hit !== null && hit < first) { first = hit; nearest = p; }
      }
      return nearest;
    }
    _weapons(ship, opponent, dt, preview = false) {
      const target = !preview && opponent && !opponent.dead ? this._chooseTarget(ship, opponent, dt) : null;
      for (const p of ship.parts) if (p.type === 'laser' || p.type === 'cannon') {
        const d = PARTS[p.type], oc = ship.faction === 'player' ? this.overclock : ship.level === 3 && this.time % 18 < 5;
        const powerCost = d.powerPerShot * (oc ? 1.28 : 1), muzzle = worldPoint(ship, p.x, p.y);
        const forward = ship.angle + p.rot * Math.PI / 2;
        let targetPoint = { x: muzzle.x + Math.sin(forward) * d.range, y: muzzle.y - Math.cos(forward) * d.range };
        if (target && opponent) {
          targetPoint = worldPoint(opponent, target.x, target.y);
          const travel = Math.hypot(targetPoint.x - muzzle.x, targetPoint.y - muzzle.y) / d.projectileSpeed;
          targetPoint.x += opponent.vx * travel * 0.85; targetPoint.y += opponent.vy * travel * 0.85;
        }
        const distance = Math.hypot(targetPoint.x - muzzle.x, targetPoint.y - muzzle.y);
        const heading = Math.atan2(targetPoint.x - muzzle.x, -(targetPoint.y - muzzle.y));
        const relative = angleDelta(heading, forward);
        p.aimAngle = forward + clamp(relative, -d.firingArc / 2, d.firingArc / 2); p.blockedById = null;
        const blocker = this._weaponBlocker(ship, p, targetPoint.x, targetPoint.y);
        const state = !p.active || ship.dead ? 'offline' : Math.abs(relative) > d.firingArc / 2 ? 'arc' :
          blocker ? 'blocked' : target && distance > d.range ? 'range' : p.overheated ? 'heat' :
          p.power + 1e-6 < powerCost ? 'power' : d.ammoPerShot && p.ammo + 1e-6 < d.ammoPerShot ? 'ammo' : p.cooldown > 0 ? 'cooldown' : 'ready';
        p.fireState = state; p.blockedById = state === 'blocked' ? blocker.id : null;
        p.status = { offline: p.hp <= 0 ? '파괴됨' : '작동 불가', arc: '사격각 밖', blocked: '자함 선체에 사선 차폐', range: '표적 사거리 밖',
          heat: '과열 · 냉각 중', power: '전지 보급 대기', ammo: '탄약 보급 대기', cooldown: '재장전 중', ready: preview ? '사선 확보 · 사격 준비' : '사격 준비' }[state];
        if (p.fire > 0.001) p.status += ' · 화재';
        if (preview || !target || !opponent || opponent.dead || state !== 'ready') continue;
        const spread = ship.faction === 'enemy' ? (ship.level === 1 ? 19 : 11) : p.type === 'cannon' ? 7 : 3;
        const aimx = targetPoint.x + (this._random() - 0.5) * spread, aimy = targetPoint.y + (this._random() - 0.5) * spread;
        const shotHeading = forward + clamp(angleDelta(Math.atan2(aimx - muzzle.x, -(aimy - muzzle.y)), forward), -d.firingArc / 2, d.firingArc / 2);
        const ux = Math.sin(shotHeading), uy = -Math.cos(shotHeading);
        const actualBlocker = this._weaponBlocker(ship, p, muzzle.x + ux * d.range, muzzle.y + uy * d.range);
        if (actualBlocker) { p.fireState = 'blocked'; p.blockedById = actualBlocker.id; p.status = '자함 선체에 사선 차폐'; continue; }
        p.aimAngle = shotHeading; p.power = Math.max(0, p.power - powerCost);
        if (d.ammoPerShot) p.ammo = Math.max(0, p.ammo - d.ammoPerShot);
        p.cooldown = d.interval / (oc ? 1.65 : 1) * (ship.faction === 'enemy' && ship.level === 1 ? { patrol: 1.27, siege: 1.1, hunter: 1.06 }[ship.enemyStyle || 'patrol'] : 1);
        p.heat += d.heatPerShot * (oc ? 3.3 : 1); p.status = '사격 · 재장전 중'; p.fireState = 'cooldown';
        const damageScale = ship.faction === 'enemy' ? { patrol: [0, 0.78, 0.96, 1.07], siege: [0, 0.91, 1.04, 1.15], hunter: [0, 0.9, 1, 1.12] }[ship.enemyStyle || 'patrol'][ship.level] : 1;
        const x = muzzle.x + ux * 17, y = muzzle.y + uy * 17;
        this.projectiles.push({ x, y, px: x, py: y, vx: ux * d.projectileSpeed, vy: uy * d.projectileSpeed,
          damage: d.damage * damageScale, owner: ship.id, ownerFaction: ship.faction, kind: p.type,
          ttl: d.range / d.projectileSpeed + 0.1, color: ship.faction === 'player' ? (p.type === 'laser' ? '#8bffe3' : '#ffdc99') : '#ff9a76' });
        this._effect('muzzle', x, y, 0.14, ship.faction === 'player' ? '#9bffe8' : '#ffb48b', p.type === 'cannon' ? 18 : 10, null, ship.id, p.id);
        if (ship.faction === 'player') this.metrics.shotsFired++;
      }
    }
    _effect(kind, x, y, ttl, color, size, amount = null, shipId = null, partId = null) {
      this.effects.push({ kind, x, y, ttl, maxTtl: ttl, color, size, amount, shipId, partId });
      if (this.effects.length > 300) this.effects.splice(0, this.effects.length - 300);
    }
    _fragment(ship, part, destroyed) {
      const w = worldPoint(ship, part.x, part.y), angle = this._random() * TAU, speed = 10 + this._random() * 35;
      this.fragments.push({ id: this._id('fragment'), type: part.type, x: w.x, y: w.y, angle: ship.angle + part.rot * Math.PI / 2,
        vx: ship.vx + Math.cos(angle) * speed, vy: ship.vy + Math.sin(angle) * speed, spin: (this._random() - 0.5) * 1.5,
        ttl: 7, maxTtl: 7, color: PARTS[part.type].color, size: CELL * (destroyed ? 0.65 : 1) });
      if (ship.faction === 'enemy') this.debris.push({ x: w.x, y: w.y, value: Math.round(PARTS[part.type].cost * 0.2), collected: false });
      if (this.fragments.length > 180) this.fragments.shift();
    }
    _ignite(ship, part, intensity) {
      if (!part || part.hp <= 0 || !part.active) return;
      const wasBurning = part.fire > 0.001; part.fire = clamp(Math.max(part.fire || 0, intensity), 0, 1);
      if (!wasBurning) {
        const w = worldPoint(ship, part.x, part.y); this._effect('ignite', w.x, w.y, 0.6, '#ffac62', 24, null, ship.id, part.id);
        if (ship.faction === 'player') this._log(PARTS[part.type].name + ' 화재! 승무원 소화 작업이 필요합니다.', 'danger');
      }
    }
    _fires(dt) {
      this._fireClock += dt;
      const spreadTick = this._fireClock >= 0.5;
      if (spreadTick) this._fireClock -= 0.5;
      for (const ship of this.ships) {
        for (const p of ship.parts) if (p.hp <= 0) p.fire = 0;
        if (ship.dead) continue;
        const burning = ship.parts.filter(p => p.active && p.fire > 0.001);
        for (const p of burning) {
          if (!p.active || p.hp <= 0 || ship.dead) continue;
          p.fire = Math.min(1, p.fire + dt * 0.035); p.heat = Math.min(500, p.heat + p.fire * dt * 8);
          this._damagePart(ship, p, p.fire * dt * 2.4, 'fire');
        }
        if (!spreadTick) continue;
        for (const p of ship.parts.slice()) if (p.active) {
          if (p.heat >= 100 && p.fire <= 0.001 && this._random() < Math.min(0.45, 0.10 + (p.heat - 100) / 150)) this._ignite(ship, p, 0.22);
          if (p.fire > 0.35 && this._random() < p.fire * 0.075) {
            const neighbors = DIRS.map(([dx, dy]) => ship._grid.get(key(p.x + dx, p.y + dy))).filter(q => q?.active && q.fire <= 0.001);
            if (neighbors.length) this._ignite(ship, neighbors[Math.floor(this._random() * neighbors.length)], 0.18);
          }
        }
      }
    }
    _damagePart(ship, part, damage, cause) {
      if (!part || part.hp <= 0 || damage <= 0 || !finite(damage)) return 0;
      this._damageDepth = (this._damageDepth || 0) + 1;
      let taken = 0;
      try {
        taken = Math.min(part.hp, damage); part.hp = Math.max(0, part.hp - damage);
        if (ship.faction === 'player') this.metrics.damageTaken += taken;
        const w = worldPoint(ship, part.x, part.y);
        if (part.hp > 0 && ['laser', 'cannon', 'splash', 'explosion'].includes(cause)) {
          const chance = (part.type === 'armor' ? 0.06 : 0.16) + Math.min(0.26, taken / part.maxHp * 0.55);
          if (this._random() < chance) this._ignite(ship, part, Math.min(0.6, 0.18 + taken / part.maxHp * 0.65));
        }
        if (cause !== 'heat' && cause !== 'fire') this._effect('hit', w.x, w.y, 0.28, '#ffd29a', 14, taken, ship.id, part.id);
        if (part.hp <= 0 && !part.destroyed) {
          if (part.production) { part.production.progress = 0; part.production.batchActive = false; part.production.state = 'offline'; }
          part.destroyed = true; part.active = false; part.throttle = 0; part.fire = 0; part.status = '파괴됨'; ship._topologyDirty = true;
          this._fragment(ship, part, true);
          this._effect('explosion', w.x, w.y, 0.8, PARTS[part.type].powerSource ? '#ffd574' : '#ff9974', PARTS[part.type].powerSource ? 100 : 35, null, ship.id, part.id);
          if (ship.faction === 'player') this._log(PARTS[part.type].name + ' 파괴!', 'danger');
          if (PARTS[part.type].powerSource) for (const other of ship.parts.slice()) if (other.hp > 0 && other.id !== part.id) {
            const distance = Math.hypot(other.x - part.x, other.y - part.y);
            if (distance <= 2.5) this._damagePart(ship, other, 190 * (1 - distance / 3.2), 'explosion');
          }
          if (part.type === 'storage' && part.ammo > 0) for (const other of ship.parts.slice()) if (other.hp > 0 && Math.abs(other.x - part.x) + Math.abs(other.y - part.y) === 1) this._damagePart(ship, other, Math.min(65, part.ammo * 0.3), 'explosion');
        }
      } finally {
        this._damageDepth--;
        // Finish the entire explosion cascade before deciding which components
        // detach and which crew remain aboard.
        if (this._damageDepth === 0 && ship._topologyDirty) this._topology(ship, true);
      }
      return taken;
    }
    _recordDamage(projectile, amount) {
      if (projectile.owner === this.player.id && amount > 0) { this.metrics.damageDealt += amount; this._recentHits.push({ time: this.time, amount }); }
    }
    _projectileUpdate(dt) {
      const remaining = [];
      for (const bullet of this.projectiles) {
        bullet.px = bullet.x; bullet.py = bullet.y; bullet.x += bullet.vx * dt; bullet.y += bullet.vy * dt; bullet.ttl -= dt;
        let consumed = bullet.ttl <= 0;
        for (const ship of this.ships) {
          if (consumed || ship.id === bullet.owner || ship.dead) continue;
          this._shieldState(ship);
          if (ship.shieldActive) {
            const hit = segmentCircle(bullet.px, bullet.py, bullet.x, bullet.y, ship.x, ship.y, ship.shieldRadius);
            if (hit !== null) {
              const modules = ship.parts.filter(p => p.active && p.type === 'shield' && p.power > 0);
              const energy = modules.reduce((n, p) => n + p.power, 0);
              const absorbed = Math.min(ship.shield, bullet.damage, energy / 0.018);
              ship.shield -= absorbed; bullet.damage -= absorbed;
              let cost = absorbed * 0.018;
              for (const module of modules) { const used = Math.min(module.power, cost); module.power -= used; cost -= used; }
              this._recordDamage(bullet, absorbed);
              this._effect('shield', bullet.px + (bullet.x - bullet.px) * hit, bullet.py + (bullet.y - bullet.py) * hit, 0.32, '#8cc4ff', 23, absorbed, ship.id, modules[0]?.id || null);
              consumed = bullet.damage <= 0.001; this._shieldState(ship);
            }
          }
          if (consumed) break;
          const a = localPoint(ship, bullet.px, bullet.py), b = localPoint(ship, bullet.x, bullet.y);
          let nearest = null, t = 2;
          for (const p of ship.parts) if (p.hp > 0) {
            const hit = segmentBox(a.x, a.y, b.x, b.y, p.x, p.y, bullet.kind === 'cannon' ? 0.54 : 0.49);
            if (hit !== null && hit < t) { nearest = p; t = hit; }
          }
          if (nearest) {
            const damage = bullet.damage; const taken = this._damagePart(ship, nearest, damage, bullet.kind) || 0;
            this._recordDamage(bullet, taken); consumed = true;
            if (bullet.kind === 'cannon') for (const p of ship.parts.slice()) if (p.hp > 0 && p.id !== nearest.id && Math.abs(p.x - nearest.x) + Math.abs(p.y - nearest.y) === 1) {
              const splash = this._damagePart(ship, p, damage * 0.12, 'splash') || 0; this._recordDamage(bullet, splash);
            }
          }
        }
        if (!consumed) remaining.push(bullet);
      }
      this.projectiles = remaining;
    }
    _checkOutcome() {
      if (this.mode !== 'battle') return;
      if (this.player.dead || !this.player.parts.some(p => p.hp > 0 && p.type === 'cockpit')) {
        this.mode = 'defeat'; this._log('조종실을 잃었습니다. 도크에서 함선을 복구할 수 있습니다.', 'danger'); this.projectiles = []; return;
      }
      if (this.enemy && (this.enemy.dead || !this.enemy.parts.some(p => p.hp > 0 && p.type === 'cockpit') || !this.enemy.parts.some(p => p.active && ['laser', 'cannon'].includes(p.type)))) {
        this.enemy.dead = true; this.mode = 'victory'; this.metrics.battlesWon++;
        this._log('섹터 ' + this.sector + ' 확보! 잔해를 회수해 다음 설계에 투자하세요.', 'success'); this.projectiles = [];
        for (let i = 0; i < 18; i++) this.debris.push({ x: this.enemy.x + (this._random() - 0.5) * 240, y: this.enemy.y + (this._random() - 0.5) * 220, value: 20 + i * 2, collected: false });
      }
    }
    update(dt) {
      if (!finite(dt) || dt <= 0 || this.paused) return;
      const elapsed = Math.min(dt, 0.1) * clamp(finite(this.speed) ? this.speed : 1, 0.25, 3);
      this._accumulator = Math.min(0.5, this._accumulator + elapsed);
      while (this._accumulator >= 1 / 60) { this._step(1 / 60); this._accumulator -= 1 / 60; }
    }
    _step(dt) {
      this.time += dt;
      this._fires(dt);
      for (const ship of this.ships) this._systems(ship, dt);
      if (this.mode === 'battle' && this.enemy) {
        this.metrics.battleTime += dt;
        this._motion(this.player, this.enemy, dt); this._motion(this.enemy, this.player, dt);
        this._weapons(this.player, this.enemy, dt); this._weapons(this.enemy, this.player, dt);
        this._projectileUpdate(dt); this._checkOutcome();
      } else if (this.mode === 'dock' || this.mode === 'complete') {
        this._weapons(this.player, null, dt, true);
        for (const p of this.player.parts) if (p.type === 'thruster') {
          p.throttle = 0; const [dx, dy] = DIRS[p.rot];
          p.exhaustBlockedById = this.player._grid.get(key(p.x - dx, p.y - dy))?.id || null;
          if (p.exhaustBlockedById) p.status = '배기 공간 차폐';
        }
      }
      for (const e of this.effects) e.ttl -= dt;
      this.effects = this.effects.filter(e => e.ttl > 0);
      for (const f of this.fragments) { f.x += f.vx * dt; f.y += f.vy * dt; f.angle += f.spin * dt; f.ttl -= dt; }
      this.fragments = this.fragments.filter(f => f.ttl > 0);
      this._recentHits = this._recentHits.filter(h => h.time >= this.time - 8);
      if (this._pendingDockTime > 0) { this._pendingDockTime -= dt; if (this._pendingDockTime <= 0) this.returnToDock(); }
    }
    _captureBlueprint() { this._blueprint = this.player.parts.filter(p => p.hp > 0).map(p => ({ type: p.type, x: p.x, y: p.y, rot: p.rot })); }
    previewPlacement(type, x, y, rot = 0) {
      const cost = Object.prototype.hasOwnProperty.call(PARTS, type) ? PARTS[type].cost : 0;
      const fail = message => ({ ok: false, message, cost });
      if (this.mode !== 'dock') return fail( '부품 편집은 도크에서 가능합니다.');
      if (!Object.prototype.hasOwnProperty.call(PARTS, type)) return fail( '알 수 없는 부품입니다.');
      if (![x, y, rot].every(Number.isInteger) || Math.abs(x) > 10 || Math.abs(y) > 10 || rot < 0 || rot > 3) return fail( '건조 범위 또는 회전이 올바르지 않습니다.');
      if (this.player.parts.length >= 160) return fail( '최대 160개 모듈까지 설치할 수 있습니다.');
      if (this.player.parts.some(p => p.x === x && p.y === y && p.hp > 0)) return fail( '이미 부품이 있는 칸입니다.');
      if (this.player.parts.some(p => p.hp > 0) && !this.player.parts.some(p => p.hp > 0 && Math.abs(p.x - x) + Math.abs(p.y - y) === 1)) return fail( '기존 선체의 옆 칸에 연결해 주세요.');
      if (type === 'cockpit' && this.player.parts.some(p => p.hp > 0 && p.type === 'cockpit')) return fail( '조종실은 한 함선에 하나입니다.');
      if (type === 'bunk' && this.player.parts.filter(p => p.type === 'bunk').length >= 10) return fail( '승무원은 최대 60명입니다.');
      if (this.credits < PARTS[type].cost) return fail( '크레딧이 부족합니다.');
      return { ok: true, message: PARTS[type].name + ' 설치 가능', cost };
    }
    place(type, x, y, rot = 0) {
      const preview = this.previewPlacement(type, x, y, rot);
      if (!preview.ok) return preview;
      this.credits -= PARTS[type].cost;
      this.player.parts = this.player.parts.filter(p => p.hp > 0);
      this.player.parts.push(this._makePart({ type, x, y, rot }, 'player', 1, false));
      this._topology(this.player, false); this._syncCrew(this.player); this._captureBlueprint();
      return this._result(true, PARTS[type].name + ' 설치 완료.');
    }
    erase(x, y) {
      if (this.mode !== 'dock') return this._result(false, '철거는 도크에서 가능합니다.');
      const part = this.player.parts.find(p => p.x === x && p.y === y && p.hp > 0);
      if (!part) return this._result(false, '철거할 부품이 없습니다.');
      const staged = { parts: this.player.parts.filter(p => p.id !== part.id).map(p => ({ ...p, production: p.production ? { ...p.production } : null })),
        crew: this.player.crew.map(c => ({ ...c, job: c.job ? { ...c.job, path: c.job.path.map(p => ({ ...p })) } : null })) };
      const report = this._reclaimInventory(staged, [part]);
      const capacity = Math.min(60, staged.parts.filter(p => p.hp > 0 && p.type === 'bunk').length * PARTS.bunk.crewCapacity);
      if (staged.crew.length > capacity) {
        for (const c of staged.crew) this._cancelJob(staged, c, true);
        if (staged.crew.filter(c => c.cargoAmount > 0).length > capacity) return this._result(false, '철거 후 운반 화물을 맡을 승무원이 부족합니다. 화물을 보관하거나 승무원실을 먼저 확보하세요.');
      }
      const refund = Math.floor(PARTS[part.type].cost * 0.65 * part.hp / part.maxHp);
      this.credits += refund + report.inventoryRefund; this.player.parts = staged.parts; this.player.crew = staged.crew;
      this._recordInventoryRefund(report);
      this._topology(this.player, false); this._syncCrew(this.player); this._captureBlueprint();
      const message = PARTS[part.type].name + ' 철거 · 모듈 ' + refund + ' C 환급' + this._inventoryMessage(report);
      if (report.inventoryRefund || report.sold.ammo || report.sold.sulfur) this._log(message, 'info');
      return { ok: true, message, refund, ...report };
    }
    _crewShortage() {
      const capacity = Math.min(60, this._blueprint.filter(p => p.type === 'bunk').length * PARTS.bunk.crewCapacity);
      return Math.max(0, capacity - this.player.crew.length);
    }
    _repairQuote() {
      let cost = this._crewShortage() * CREW_RECRUIT_COST;
      for (const spec of this._blueprint) {
        const p = this.player.parts.find(p => p.x === spec.x && p.y === spec.y && p.type === spec.type && p.hp > 0);
        cost += PARTS[spec.type].cost * (p ? (1 - p.hp / p.maxHp) * 0.35 : 0.55);
      }
      return Math.ceil(cost);
    }
    _restoreBlueprint() {
      const old = this.player, shortage = this._crewShortage();
      // Settle live carriers before replacing crew objects, retaining any excess
      // in a carrier until a store/consumer has room. Repairs do not buy ammo.
      for (const c of old.crew) this._cancelJob(old, c, true);
      const cargo = old.crew.filter(c => c.cargo && c.cargoAmount > 0).map(c => ({ cargo: c.cargo, cargoAmount: c.cargoAmount, cargoSourceId: null }));
      this.player = this._createShip(this._blueprint, 'player', old.name || 'KITE / 키트', 1);
      this.player.x = 0; this.player.y = 20; this.player.angle = 0;
      this.player.repairStock = old.repairStock; this.serviceTargetId = null;
      for (const p of this.player.parts) {
        const previous = old.parts.find(q => q.hp > 0 && q.type === p.type && q.x === p.x && q.y === p.y);
        p.heat = 0; p.hp = p.maxHp;
        p.ammo = previous ? previous.ammo : 0;
        p.power = previous ? previous.power : (PARTS[p.type].powerSource ? PARTS[p.type].powerCapacity * 0.5 : 0);
        p.sulfur = previous ? previous.sulfur : 0;
        if (p.production) p.production = previous?.production ? { ...previous.production } : { progress: 0, enabled: true, batchActive: false, state: 'sulfur' };
        if (p.production) this._production(this.player, p, 0);
      }
      for (const packet of cargo) {
        this._settleCargo(this.player, packet);
        if (packet.cargoAmount > 0) {
          const carrier = this.player.crew.find(c => !c.cargo);
          if (carrier) Object.assign(carrier, packet);
        }
      }
      if (shortage > 0) {
        this.metrics.crewRecruited = (this.metrics.crewRecruited || 0) + shortage;
        this._log('승무원 ' + shortage + '명 충원 · 복구 견적에 ' + shortage * CREW_RECRUIT_COST + ' C 포함', 'info');
      }
      this._shieldState(this.player); this._weapons(this.player, null, 0, true);
    }
    repairAll() {
      if (this.mode !== 'dock') return this._result(false, '수리는 도크에서 가능합니다.');
      const cost = this._repairQuote();
      if (this.credits < cost) return this._result(false, '수리에 ' + cost + ' C가 필요합니다.');
      if (cost === 0 && !this.player.parts.some(p => p.fire > 0.001)) return this._result(true, '선체가 완전한 상태입니다.');
      this.credits -= cost; this._restoreBlueprint();
      this._log('전체 선체 복구 · ' + cost + ' C', 'success');
      return this._result(true, '전체 수리 완료 · ' + cost + ' C');
    }
    restock() {
      if (this.mode !== 'dock') return this._result(false, '탄약 구매는 도크에서 가능합니다.');
      const stores = this.player.parts.filter(p => p.type === 'storage' && p.hp > 0);
      if (!stores.length) return this._result(false, '탄약을 보관할 탄약고가 없습니다.');
      const missing = stores.reduce((sum, p) => sum + Math.max(0, PARTS.storage.ammoCapacity - p.ammo), 0);
      const cost = Math.ceil(missing * 0.45);
      if (this.credits < cost) return this._result(false, '탄약 보급에 ' + cost + ' C가 필요합니다.');
      this.credits -= cost; for (const p of stores) p.ammo = PARTS.storage.ammoCapacity;
      return this._result(true, cost ? '탄약고 재보급 · ' + cost + ' C' : '탄약고가 가득 찼습니다.');
    }
    getProductionQuote(resourceId = 'sulfur', amount = 20) {
      const stores = this.player.parts.filter(p => p.hp > 0 && p.type === 'storage');
      const capacity = stores.reduce((n, p) => n + PARTS[p.type].sulfurCapacity, 0), stored = stores.reduce((n, p) => n + p.sulfur, 0);
      const free = Math.max(0, capacity - stored), result = { ok: false, message: '', resourceId, amount: 0, cost: 0, capacity, stored, free };
      if (this.mode !== 'dock') return { ...result, message: '황 구매는 도크에서 가능합니다.' };
      if (resourceId !== 'sulfur') return { ...result, message: '구매할 수 없는 자원입니다.' };
      if (!Number.isInteger(amount) || amount < 1 || amount > 10000) return { ...result, message: '구매 수량은 1~10000 사이 정수여야 합니다.' };
      const actual = Math.min(amount, Math.floor(free + 1e-7)), cost = actual * INDUSTRY.sulfurUnitPrice;
      if (!actual) return { ...result, message: stores.length ? '황 저장 공간이 가득 찼습니다.' : '황을 보관할 보급 저장고가 필요합니다.' };
      return { ...result, ok: this.credits >= cost, message: this.credits >= cost ? '황 ' + actual + ' 구매 · ' + cost + ' C' : '황 구매에 ' + cost + ' C가 필요합니다.', amount: actual, cost };
    }
    buyResource(resourceId = 'sulfur', amount = 20) {
      const quote = this.getProductionQuote(resourceId, amount); if (!quote.ok) return quote;
      let remaining = quote.amount;
      for (const p of this.player.parts) if (p.hp > 0 && p.type === 'storage') {
        const moved = Math.min(remaining, PARTS[p.type].sulfurCapacity - p.sulfur); p.sulfur += moved; remaining -= moved;
      }
      this.credits -= quote.cost; this._log(quote.message, 'info'); return quote;
    }
    setFactoryEnabled(partId, enabled) {
      if (typeof enabled !== 'boolean') return this._result(false, '생산 상태는 켜기 또는 끄기여야 합니다.');
      const p = this.player.parts.find(p => p.id === partId && p.hp > 0 && p.production);
      if (!p) return this._result(false, '작동 가능한 탄약 공장을 선택하세요.');
      p.production.enabled = enabled; this._production(this.player, p, 0);
      return this._result(true, enabled ? '탄약 생산 재개 · 진행 중 원료를 이어서 사용합니다.' : '탄약 생산 정지 · 투입 원료와 진행률을 보존합니다.');
    }
    launch() {
      if (this.mode !== 'dock') return this._result(false, this.mode === 'complete' ? '세 섹터를 모두 완료했습니다.' : '현재 출격할 수 없습니다.');
      this._topology(this.player, false);
      if (!this.player.parts.some(p => p.active && p.type === 'cockpit')) return this._result(false, '조종실이 필요합니다.');
      if (this.player.parts.some(p => p.hp > 0 && !p.connected)) return this._result(false, '조종실과 연결되지 않은 부품을 연결하거나 철거하세요.');
      if (!this.player.parts.some(p => p.active && ['laser', 'cannon'].includes(p.type))) return this._result(false, '작동할 무기가 필요합니다.');
      if (!this.player.parts.some(p => p.active && PARTS[p.type].powerSource)) return this._result(false, '전지 생산을 위한 원자로가 필요합니다.');
      if (!this.player.crew.length) return this._result(false, '승무원실을 설치해 보급 인력을 확보하세요.');
      const control = this.player.parts.find(p => p.active && p.type === 'cockpit');
      if (!this.player.parts.some(p => p.active && PARTS[p.type].powerSource && this._path(this.player, p.x, p.y, control.x, control.y))) return this._result(false, '원자로와 조종실 사이 승무원 통로가 없습니다.');
      this.enemy = this._createShip(this._enemyDesign(this.sector, this.contractId), 'enemy', { patrol: 'DUST PATROL / 항로 순찰대', siege: 'IRON BATTERY / 철의 포대', hunter: 'SWIFT FANG / 추격자' }[this.contractId] + ' ' + this.sector, this.sector);
      this.player.x = 0; this.player.y = 300; this.player.angle = 0; this.player.vx = 0; this.player.vy = 0; this.player.dead = false; this.player.moveTarget = null; this.player.angularVelocity = 0;
      this.player.holdPoint = { x: this.player.x, y: this.player.y };
      this.player.launchHullMax = this.player.parts.reduce((n, p) => n + p.maxHp, 0);
      this.enemy.x = 20; this.enemy.y = -300;
      this.mode = 'battle'; this.paused = false; this._rewardClaimed = false; this._pendingDockTime = 0; this._battleStartedAt = this.time;
      this.projectiles = []; this.debris = []; this.fragments = []; this.effects = []; this._targetId = null; this.targetPartId = null;
      this._recentHits = []; this.metrics.battleTime = 0;
      this._log('섹터 ' + this.sector + ' · ' + CONTRACTS[this.contractId].name + '. 적 모듈을 클릭해 집중 공격하세요.', 'info');
      return this._result(true, '전투 시작.');
    }
    retreat() {
      if (this.mode !== 'battle') return this._result(false, '전투 중에만 철수할 수 있습니다.');
      this.mode = 'defeat'; this._log('교전을 중단하고 도크로 철수합니다.', 'warning');
      return this.returnToDock();
    }
    salvage() {
      if (this.mode !== 'victory') return this._result(false, '전투 승리 후 잔해를 회수할 수 있습니다.');
      if (this._rewardClaimed || this._claimedSectors.includes(this.sector)) return this._result(false, '이미 회수한 전투입니다.');
      const reward = this._contractReward();
      const sulfur = INDUSTRY.salvageBase + this.sector * INDUSTRY.salvagePerSector;
      const packet = { cargo: 'sulfur', cargoAmount: sulfur, cargoSourceId: null }; this._settleCargo(this.player, packet);
      const sold = packet.cargoAmount, stored = sulfur - sold, inventoryRefund = Math.floor(sold * INDUSTRY.sulfurUnitPrice * INDUSTRY.sulfurResaleMultiplier + 1e-8);
      this._rewardClaimed = true; this._claimedSectors.push(this.sector); this.credits += reward + inventoryRefund; this.metrics.salvageEarned += reward + inventoryRefund;
      this.metrics.sulfurSalvaged += sulfur; this.metrics.sulfurSold += sold;
      for (const d of this.debris) if (!d.collected) { d.collected = true; this._effect('salvage', d.x, d.y, 0.85, '#91edc1', 18); }
      this._pendingDockTime = 0;
      const message = '잔해 회수 +' + reward + ' C · 황 ' + stored + ' 저장' + (sold ? ' · 넘친 황 ' + sold + ' 매각 +' + inventoryRefund + ' C' : '');
      this._log(message + '. 도크 귀환으로 함선을 정비하세요.', 'success');
      return { ok: true, message, sulfurStored: stored, sulfurSold: sold, inventoryRefund };
    }
    returnToDock() {
      if (this.mode === 'battle') return this._result(false, '전투 중에는 철수 버튼을 사용하세요.');
      if (this.mode === 'dock' || this.mode === 'complete') return this._result(true, '이미 도크에 있습니다.');
      const won = this.mode === 'victory';
      if (won && !this._rewardClaimed) this.salvage();
      const cost = this._repairQuote(), paid = Math.min(this.credits, cost);
      this.credits -= paid;
      if (!this._blueprint.some(p => p.type === 'cockpit') || !this._blueprint.some(p => PARTS[p.type].powerSource)) this._blueprint = starterDesign();
      this._restoreBlueprint(); this.enemy = null; this.projectiles = []; this.fragments = []; this.debris = []; this._pendingDockTime = 0;
      this._targetId = null; this.targetPartId = null; this.overclock = false; this.paused = false;
      if (won && this.sector === 3) { this.mode = 'complete'; this._log('외곽 항로의 세 섹터를 모두 확보했습니다.', 'success'); }
      else { if (won) this.sector++; this.mode = 'dock'; }
      if (cost > paid) this._log('구난 지원이 부족한 복구비를 부담했습니다. 다시 출격할 수 있습니다.', 'info');
      this._log('도크 복귀 · 설계 복구 ' + paid + ' C' + (won && this.mode !== 'complete' ? ' · 다음 섹터 ' + this.sector : ''), 'info');
      return this._result(true, this.mode === 'complete' ? '항로 개척 완료!' : '도크에 복귀했습니다.');
    }
    _contractReward(id = this.contractId) { const c = CONTRACTS[id]; return c.reward + (this.sector - 1) * c.rewardStep; }
    getContracts() { return Object.values(CONTRACTS).map(c => ({ id: c.id, name: c.name, description: c.description, risk: c.risk, reward: this._contractReward(c.id), enemyStyle: c.enemyStyle })); }
    selectContract(id) {
      if (this.mode !== 'dock') return this._result(false, '계약 변경은 도크에서 가능합니다.');
      if (!Object.prototype.hasOwnProperty.call(CONTRACTS, id)) return this._result(false, '알 수 없는 계약입니다.');
      this.contractId = id; this._log(CONTRACTS[id].name + ' 선택 · 성공 보상 ' + this._contractReward() + ' C', 'info');
      return this._result(true, CONTRACTS[id].name + ' 계약을 선택했습니다.');
    }
    setTactic(tactic) {
      if (!TACTICS.includes(tactic)) return this._result(false, '알 수 없는 전술입니다.');
      this.tactic = tactic; this.player.moveTarget = null;
      this.player.holdPoint = tactic === 'hold' ? { x: this.player.x, y: this.player.y } : null;
      return this._result(true, { balanced: '균형 교전 거리', assault: '돌격 · 접근 교전', kite: '거리 유지 · 장거리 교전', hold: '위치 고정 · 표적 추적' }[tactic] + '으로 변경했습니다.');
    }
    setTargetPriority(priority) {
      if (!PRIORITIES.includes(priority)) return this._result(false, '알 수 없는 표적 우선순위입니다.');
      this.targetPriority = priority; this.player._targetTimer = 0; this.player._aiTarget = null;
      return this._result(true, { weapons: '무장', reactor: '원자로', cockpit: '조종실', shield: '실드' }[priority] + ' 우선 공격. 수동 표적은 해제 전까지 유지됩니다.');
    }
    clearTarget() {
      this._targetId = null; this.targetPartId = null; this.player._aiTarget = null; this.player._targetTimer = 0;
      return this._result(true, '집중 공격을 해제하고 표적 우선순위에 따릅니다.');
    }
    setMoveTarget(worldx, worldy) {
      if (this.mode !== 'battle' || !finite(worldx) || !finite(worldy)) return this._result(false, '전투 화면의 위치를 선택하세요.');
      this.player.moveTarget = { x: clamp(worldx, -1400, 1400), y: clamp(worldy, -1400, 1400) };
      return this._result(true, '이동 명령을 설정했습니다.');
    }
    setTarget(partId) {
      if (this.mode !== 'battle' || !this.enemy) return this._result(false, '전투 중 적 모듈을 선택하세요.');
      const p = this.enemy.parts.find(p => p.id === partId && p.hp > 0);
      if (!p) return this._result(false, '공격할 수 있는 적 모듈이 아닙니다.');
      this._targetId = p.id; this.targetPartId = p.id;
      return this._result(true, PARTS[p.type].name + ' 집중 공격.');
    }
    toggleOverclock() { this.overclock = !this.overclock; this._log(this.overclock ? '오버클럭 가동: 연사 증가, 전력·열 부담 증가.' : '오버클럭 해제: 열을 식힙니다.', this.overclock ? 'warning' : 'info'); return this._result(true, this.overclock ? '오버클럭 ON' : '오버클럭 OFF'); }
    setCrewPolicy(policy) {
      if (!POLICIES.includes(policy)) return this._result(false, '알 수 없는 보급 정책입니다.');
      this.crewPolicy = policy;
      return this._result(true, { balanced: '균형 보급', power: '전지 우선', ammo: '탄약 우선' }[policy] + '으로 변경했습니다. 진행 중 배달은 마무리합니다.');
    }
    setRepairPolicy(policy) {
      if (!REPAIR_POLICIES.includes(policy)) return this._result(false, '알 수 없는 정비 정책입니다.');
      this.repairPolicy = policy; this._enforceServicePolicy(this.player);
      if (policy === 'survival') this._prioritizeServices(this.player);
      return this._result(true, { balanced: '균형 정비 · 승무원 최대 25%', survival: '생존 우선 · 승무원 최대 60%', supply: '보급 집중 · 수리 중지, 소화 1명 유지' }[policy] + '로 변경했습니다.');
    }
    setServiceTarget(partId) {
      const part = this.player.parts.find(p => p.id === partId && p.active && p.hp > 0);
      if (!part) return this._result(false, '살아 있는 아군 모듈을 선택하세요.');
      const accessible = this.player.crew.some(c => [{ x: part.x, y: part.y }, ...DIRS.map(([dx, dy]) => ({ x: part.x + dx, y: part.y + dy }))]
        .some(site => this._path(this.player, c.x, c.y, site.x, site.y)));
      if (!accessible) return this._result(false, '승무원이 현장이나 인접 통로에 도달할 수 없습니다.');
      this.serviceTargetId = part.id; this._prioritizeServices(this.player);
      return this._result(true, PARTS[part.type].name + ' 현장 작업 우선. 정비 정책의 인원 제한과 자재를 사용합니다.');
    }
    clearServiceTarget() { this.serviceTargetId = null; return this._result(true, '현장 작업 우선 지정을 해제했습니다.'); }
    _repairSupplyQuote() {
      const amount = Math.min(REPAIR_BUNDLE, Math.max(0, REPAIR_STOCK_MAX - this.player.repairStock));
      return { amount, cost: Math.ceil(amount * REPAIR_UNIT_COST) };
    }
    buyRepairSupplies() {
      if (this.mode !== 'dock') return this._result(false, '정비 자재 구매는 도크에서 가능합니다.');
      const quote = this._repairSupplyQuote();
      if (quote.amount <= 1e-7) return this._result(false, '정비 자재가 가득 찼습니다.');
      if (this.credits < quote.cost) return this._result(false, '정비 자재 구매에 ' + quote.cost + ' C가 필요합니다.');
      this.credits -= quote.cost; this.player.repairStock = Math.min(REPAIR_STOCK_MAX, this.player.repairStock + quote.amount);
      return this._result(true, '정비 자재 ' + round(quote.amount) + ' 보급 · ' + quote.cost + ' C');
    }
    getUpgrades() {
      return Object.entries(UPGRADES).map(([id, upgrade]) => {
        const level = this.upgrades[id], current = Math.round(level * upgrade.step * 100), next = Math.round((level + 1) * upgrade.step * 100);
        return { id, name: upgrade.name, description: upgrade.description, level, maxLevel: 3, cost: upgrade.costs[level] || 0,
          currentEffect: upgrade.effect + ' +' + current + '%', nextEffect: level < 3 ? upgrade.effect + ' +' + next + '%' : '최대 단계' };
      });
    }
    purchaseUpgrade(id) {
      if (this.mode !== 'dock') return this._result(false, '기술 개량은 도크에서 가능합니다.');
      if (!Object.prototype.hasOwnProperty.call(UPGRADES, id)) return this._result(false, '알 수 없는 기술 개량입니다.');
      const level = this.upgrades[id], def = UPGRADES[id];
      if (level >= 3) return this._result(false, '이미 최대 단계입니다.');
      const cost = def.costs[level];
      if (this.credits < cost) return this._result(false, '기술 개량에 ' + cost + ' C가 필요합니다.');
      this.credits -= cost; this.upgrades[id]++;
      this._log(def.name + ' ' + (level + 1) + '단계 · ' + cost + ' C', 'success');
      return this._result(true, def.name + ' ' + (level + 1) + '단계 개량 완료. 이번 원정 동안 유지됩니다.');
    }
    inspect(partId) {
      for (const ship of this.ships) {
        const part = ship.parts.find(p => p.id === partId);
        if (part) return { ok: true, message: PARTS[part.type].name, part, ship, definition: PARTS[part.type],
          assignedCrew: ship.crew.filter(c => c.job?.targetId === partId).length };
      }
      return this._result(false, '선택한 모듈이 없습니다.');
    }
    getStats() {
      const ship = this.player, live = ship.parts.filter(p => p.hp > 0), guns = live.filter(p => p.active && PARTS[p.type].damage);
      const devices = live.filter(p => PARTS[p.type].powerCapacity && !PARTS[p.type].powerSource);
      const capacity = devices.reduce((n, p) => n + PARTS[p.type].powerCapacity, 0), energy = devices.reduce((n, p) => n + p.power, 0);
      const designHp = ['battle', 'victory', 'defeat'].includes(this.mode) ? ship.launchHullMax : this._blueprint.reduce((n, p) => n + PARTS[p.type].hp, 0);
      const fireCount = live.filter(p => p.fire > 0.001).length, repairQuote = this._repairSupplyQuote();
      const issues = [], thrust = this._thrustModel(ship), dock = this.mode === 'dock' || this.mode === 'complete';
      const blocked = guns.filter(p => {
        if (!dock) return p.fireState === 'blocked';
        const origin = worldPoint(ship, p.x, p.y), heading = ship.angle + p.rot * Math.PI / 2;
        return !!this._weaponBlocker(ship, p, origin.x + Math.sin(heading) * PARTS[p.type].range, origin.y - Math.cos(heading) * PARTS[p.type].range);
      });
      const blockedIds = new Set(blocked.map(p => p.id));
      if (fireCount) issues.push('화재 ' + fireCount + '곳 · 현장 소화 필요');
      if (ship.repairStock < 1e-7 && live.some(p => p.hp < p.maxHp - 1)) issues.push('정비 자재 소진 · 현장 수리 대기');
      if (!live.some(p => p.type === 'cockpit')) issues.push('조종실이 필요합니다.');
      if (!live.some(p => PARTS[p.type].powerSource)) issues.push('원자로가 필요합니다.');
      if (!guns.length) issues.push('무기를 설치하세요.');
      if (!ship.crew.length) issues.push(live.some(p => p.type === 'bunk') ? '승무원이 없습니다. 도크 전체 수리로 충원하세요.' : '승무원실이 필요합니다.');
      const disconnected = live.filter(p => !p.connected).length;
      if (disconnected) issues.push('연결이 끊긴 모듈 ' + disconnected + '개');
      const low = devices.filter(p => p.active && p.power < (PARTS[p.type].powerPerShot || 0.6)).length;
      if (low) issues.push('전지 보급 대기 ' + low + '개');
      const hot = live.filter(p => p.heat >= 85).length;
      if (hot) issues.push('고열 모듈 ' + hot + '개 · 오버클럭 해제 / 방열판 추가');
      if (blocked.length) issues.push('자함 선체에 사선이 막힌 무기 ' + blocked.length + '문');
      const exhaust = thrust.engines.filter(e => e.exhaust).length;
      if (exhaust) issues.push('배기 공간이 막힌 추진기 ' + exhaust + '개');
      if (thrust.forward < 0.05) issues.push('전진 추력 없음 · 추진기 방향 / 전지 확인');
      if (thrust.reverse < 0.05) issues.push('후진·제동 추력 없음');
      if (thrust.left < 0.05 || thrust.right < 0.05) issues.push('좌우 기동 추력이 부족합니다.');
      if (thrust.turn < 0.01) issues.push('양방향 선회력이 부족합니다.');
      const ammo = live.reduce((n, p) => n + (p.ammo || 0), 0) + ship.crew.reduce((n, c) => n + (c.cargo === 'ammo' ? c.cargoAmount : 0), 0);
      if (ammo < 8 && live.some(p => p.type === 'cannon')) issues.push('탄약이 부족합니다.');
      const reactors = live.filter(p => PARTS[p.type].powerSource && p.connected);
      const factories = live.filter(p => p.production).map(p => ({ id: p.id, enabled: p.production.enabled, progress: p.production.progress, duration: INDUSTRY.batchSeconds, active: p.production.batchActive && this._productionState(p) === 'producing', batchActive: p.production.batchActive, state: this._productionState(p), sulfur: p.sulfur, ammo: p.ammo, status: this._factoryStatus({ ...p, production: { ...p.production, state: this._productionState(p) } }) }));
      const sulfurTotal = live.reduce((n, p) => n + p.sulfur + (p.production?.batchActive ? INDUSTRY.sulfurPerBatch : 0), 0) + ship.crew.reduce((n, c) => n + (c.cargo === 'sulfur' ? c.cargoAmount : 0), 0);
      if (reactors.length) {
        const inaccessible = devices.filter(p => p.connected && !reactors.some(r => this._path(ship, r.x, r.y, p.x, p.y))).length;
        if (inaccessible) issues.push('승무원 경로가 없는 장치 ' + inaccessible + '개');
      }
      const ocRate = this.overclock ? 1.65 : 1, ocPower = this.overclock ? 1.28 : 1;
      const availableGuns = guns.filter(p => !blockedIds.has(p.id));
      const powerDemand = availableGuns.reduce((n, p) => n + PARTS[p.type].powerPerShot / PARTS[p.type].interval * ocRate * ocPower, 0) +
        live.filter(p => p.active && p.type === 'thruster').length * PARTS.thruster.powerUse +
        live.filter(p => p.active && p.type === 'shield').length * PARTS.shield.shieldRegen * 0.075 +
        live.filter(p => p.active && p.type === 'cockpit').length * PARTS.cockpit.powerUse + factories.filter(f => f.enabled).length * INDUSTRY.powerPerSecond;
      return { hullPercent: clamp(live.reduce((n, p) => n + p.hp, 0) / Math.max(1, designHp || 1) * 100, 0, 100),
        crewTotal: ship.crew.length, crewBusy: ship.crew.filter(c => c.job).length, energyPercent: capacity ? energy / capacity * 100 : 0,
        ammoTotal: Math.floor(ammo + 1e-6), heatAvg: live.reduce((n, p) => n + p.heat, 0) / Math.max(1, live.length),
        heatMax: Math.max(0, ...live.map(p => p.heat)), dps: this._recentHits.reduce((n, h) => n + h.amount, 0) / Math.max(1, Math.min(8, this.metrics.battleTime)),
        estimatedDps: availableGuns.reduce((n, p) => n + PARTS[p.type].damage / PARTS[p.type].interval * ocRate, 0),
        powerDemand, ammoDemand: availableGuns.reduce((n, p) => n + (PARTS[p.type].ammoPerShot || 0) / PARTS[p.type].interval * ocRate, 0),
        weaponReady: availableGuns.filter(p => !p.overheated && p.power >= PARTS[p.type].powerPerShot * ocPower && (!PARTS[p.type].ammoPerShot || p.ammo >= PARTS[p.type].ammoPerShot) && (dock || ['ready', 'cooldown'].includes(p.fireState))).length,
        weaponBlocked: blocked.length, forwardThrust: thrust.forward, reverseThrust: thrust.reverse, leftThrust: thrust.left, rightThrust: thrust.right, turnAuthority: thrust.turn,
        powerDelivered: Math.floor(this.metrics.powerDelivered), ammoDelivered: Math.floor(this.metrics.ammoDelivered),
        shipCost: this._blueprint.reduce((n, p) => n + PARTS[p.type].cost, 0), connected: disconnected === 0 && live.some(p => p.type === 'cockpit'),
        issues, repairCost: this._repairQuote(), crewReplacementCost: this._crewShortage() * CREW_RECRUIT_COST,
        shield: ship.shield, maxShield: ship.maxShield, crewIdle: ship.crew.filter(c => !c.job).length,
        powerProduction: reactors.reduce((n, p) => n + PARTS[p.type].generation, 0) * this._upgradeFactor(ship, 'reactor'), radiators: live.filter(p => p.active && p.type === 'radiator').length,
        sulfurTotal, sulfurStored: live.reduce((n, p) => n + p.sulfur, 0), sulfurInTransit: ship.crew.reduce((n, c) => n + (c.cargo === 'sulfur' ? c.cargoAmount : 0), 0), sulfurInProduction: live.filter(p => p.production?.batchActive).length * INDUSTRY.sulfurPerBatch, sulfurCapacity: live.reduce((n, p) => n + (PARTS[p.type].sulfurCapacity || 0), 0), ammoProduced: this.metrics.ammoProduced, sulfurDelivered: this.metrics.sulfurDelivered, powerPacketsDelivered: this.metrics.powerPacketsDelivered, factories, activeFactories: factories.filter(f => f.active).length, factoryBlocked: factories.filter(f => f.enabled && f.state !== 'producing').length,
        fireCount, repairWorkers: ship.crew.filter(c => c.job?.kind === 'repair').length, firefighters: ship.crew.filter(c => c.job?.kind === 'extinguish').length,
        repairStock: ship.repairStock, repairStockMax: REPAIR_STOCK_MAX, repairSupplyCost: repairQuote.cost, repairSupplyAmount: repairQuote.amount, serviceTargetId: this.serviceTargetId,
        sector: this.sector, reward: this._contractReward(), contractId: this.contractId, tactic: this.tactic, targetPriority: this.targetPriority };
    }
    exportSave() {
      const shipData = ship => ship ? { id: ship.id, faction: ship.faction, name: ship.name, x: ship.x, y: ship.y, angle: ship.angle,
        vx: ship.vx, vy: ship.vy, angularVelocity: ship.angularVelocity, level: ship.level, shield: ship.shield, shieldScale: ship.shieldScale,
        dead: ship.dead, moveTarget: ship.moveTarget ? { ...ship.moveTarget } : null, holdPoint: ship.holdPoint ? { ...ship.holdPoint } : null,
        repairStock: ship.repairStock, launchHullMax: ship.launchHullMax, enemyStyle: ship.enemyStyle, phase: ship._phase, aiTarget: ship._aiTarget, targetTimer: ship._targetTimer,
        parts: ship.parts.map(p => ({ id: p.id, type: p.type, x: p.x, y: p.y, rot: p.rot, hp: p.hp, maxHp: p.maxHp, power: p.power, ammo: p.ammo, sulfur: p.sulfur,
          production: p.production ? { progress: p.production.progress, enabled: p.production.enabled, batchActive: p.production.batchActive, state: p.production.state } : null,
          heat: p.heat, fire: p.fire, cooldown: p.cooldown, overheated: p.overheated, crewProvisioned: !!p.crewProvisioned,
          status: p.status, throttle: p.throttle || 0, aimAngle: p.aimAngle || 0, fireState: p.fireState || 'offline', blockedById: p.blockedById || null })),
        crew: ship.crew.map(c => ({ id: c.id, x: c.x, y: c.y, homeId: c.homeId, cargo: c.cargo, cargoAmount: c.cargoAmount,
          cargoSourceId: c.cargoSourceId || null, idleTime: c.idleTime || 0,
          job: c.job ? { ...c.job, ...(c.job.site ? { site: { ...c.job.site } } : {}), path: c.job.path.map(p => ({ x: p.x, y: p.y })) } : null })) } : null;
      return { VERSION, version: VERSION, game: 'starforge-drydock', serial: this._serial, rng: this._rng,
        mode: this.mode, sector: this.sector, credits: this.credits, time: this.time, speed: this.speed, paused: this.paused,
        overclock: this.overclock, crewPolicy: this.crewPolicy, tactic: this.tactic, targetPriority: this.targetPriority, contractId: this.contractId,
        repairPolicy: this.repairPolicy, serviceTargetId: this.serviceTargetId, upgrades: { ...this.upgrades }, fireClock: this._fireClock,
        blueprint: this._blueprint.map(p => ({ ...p })), player: shipData(this.player), enemy: shipData(this.enemy), metrics: { ...this.metrics },
        claimedSectors: this._claimedSectors.slice(), rewardClaimed: this._rewardClaimed, pendingDockTime: 0, battleStartedAt: this._battleStartedAt,
        targetPartId: this._targetId, accumulator: this._accumulator, projectiles: this.projectiles.map(p => ({ ...p })),
        recentHits: this._recentHits.map(p => ({ ...p })), debris: this.debris.map(p => ({ ...p })), log: this.log.slice(-20).map(x => ({ ...x })) };
    }
    importSave(data) {
      try {
        if (typeof data === 'string') { if (data.length > 600000) throw new Error('저장 파일이 너무 큽니다.'); data = JSON.parse(data); }
        if (!data || typeof data !== 'object' || Array.isArray(data) || ![1, 2, 3, VERSION].includes(data.VERSION) || data.game !== 'starforge-drydock') throw new Error('지원하지 않는 저장 형식입니다.');
        const legacy = data.VERSION === 1, beforeServices = data.VERSION < 3, beforeIndustry = data.VERSION < 4;
        const num = (v, min, max, label, integer = false) => { if (!finite(v) || v < min || v > max || (integer && !Number.isInteger(v))) throw new Error(label + ' 값이 올바르지 않습니다.'); return v; };
        const optionalNum = (v, fallback, min, max, label) => v === undefined ? fallback : num(v, min, max, label);
        const ident = v => { if (typeof v !== 'string' || !/^(ship|part|crew)_[1-9][0-9]{0,7}$/.test(v)) throw new Error('잘못된 객체 ID입니다.'); return v; };
        const checkDesign = design => {
          if (!Array.isArray(design) || design.length > 160) throw new Error('함선 부품 수가 올바르지 않습니다.');
          const seen = new Set();
          return design.map(p => {
            if (!p || typeof p !== 'object' || !Object.prototype.hasOwnProperty.call(PARTS, p.type)) throw new Error('알 수 없는 부품이 포함되어 있습니다.');
            const x = num(p.x, -10, 10, '부품 위치', true), y = num(p.y, -10, 10, '부품 위치', true), rot = num(p.rot, 0, 3, '부품 회전', true);
            if (seen.has(key(x, y))) throw new Error('겹치는 부품이 있습니다.'); seen.add(key(x, y));
            return { type: p.type, x, y, rot };
          });
        };
        if (!MODES.includes(data.mode) || !POLICIES.includes(data.crewPolicy)) throw new Error('게임 상태가 올바르지 않습니다.');
        const tactic = legacy ? data.tactic || 'balanced' : data.tactic;
        const targetPriority = legacy ? data.targetPriority || 'weapons' : data.targetPriority;
        const contractId = legacy ? data.contractId || 'patrol' : data.contractId;
        if (!TACTICS.includes(tactic) || !PRIORITIES.includes(targetPriority) || !Object.prototype.hasOwnProperty.call(CONTRACTS, contractId)) throw new Error('전술 또는 계약이 올바르지 않습니다.');
        const repairPolicy = beforeServices ? data.repairPolicy || 'balanced' : data.repairPolicy;
        if (!REPAIR_POLICIES.includes(repairPolicy)) throw new Error('정비 정책이 올바르지 않습니다.');
        const inputUpgrades = beforeServices ? data.upgrades || { reactor: 0, logistics: 0, drive: 0 } : data.upgrades;
        if (!inputUpgrades || typeof inputUpgrades !== 'object' || Array.isArray(inputUpgrades) || Object.keys(inputUpgrades).length !== 3 || Object.keys(inputUpgrades).some(id => !Object.prototype.hasOwnProperty.call(UPGRADES, id))) throw new Error('기술 개량 기록이 올바르지 않습니다.');
        const upgrades = {}; for (const id of Object.keys(UPGRADES)) upgrades[id] = num(inputUpgrades[id], 0, 3, '기술 단계', true);
        const serviceTargetId = beforeServices ? data.serviceTargetId || null : data.serviceTargetId;
        if (serviceTargetId !== null) ident(serviceTargetId);
        const fireClock = beforeServices ? optionalNum(data.fireClock, 0, 0, 0.5, '화재 주기') : num(data.fireClock, 0, 0.5, '화재 주기');
        const blueprint = checkDesign(data.blueprint);
        const state = { mode: data.mode, sector: num(data.sector, 1, 3, '섹터', true), credits: num(data.credits, 0, 1e8, '크레딧'),
          time: num(data.time, 0, 1e8, '시간'), speed: num(data.speed, 0.25, 3, '속도'), paused: !!data.paused,
          overclock: !!data.overclock, crewPolicy: data.crewPolicy, tactic, targetPriority, contractId, repairPolicy, upgrades, serviceTargetId };
        const ids = new Set(); const uniqueId = id => { ident(id); if (ids.has(id)) throw new Error('중복 객체 ID입니다.'); ids.add(id); return id; };
        const position = (p, label) => p ? { x: num(p.x, -1500, 1500, label), y: num(p.y, -1500, 1500, label) } : null;
        const parseShip = (s, faction) => {
          if (!s || s.faction !== faction) throw new Error('함선 진영이 올바르지 않습니다.');
          const design = checkDesign(s.parts), ship = { id: uniqueId(s.id), faction, name: typeof s.name === 'string' ? s.name.slice(0, 70) : 'STARFORGE',
            x: num(s.x, -5000, 5000, '함선 위치'), y: num(s.y, -5000, 5000, '함선 위치'), angle: num(s.angle, -TAU * 10, TAU * 10, '각도'),
            vx: num(s.vx, -500, 500, '속도'), vy: num(s.vy, -500, 500, '속도'), angularVelocity: num(s.angularVelocity, -10, 10, '각속도'),
            level: num(s.level, 1, 3, '함선 단계', true), shield: num(s.shield, 0, 20000, '실드'), shieldScale: num(s.shieldScale, 0.5, 3, '실드 계수'),
            repairStock: beforeServices ? optionalNum(s.repairStock, faction === 'player' ? 80 : 60, 0, REPAIR_STOCK_MAX, '정비 자재') : num(s.repairStock, 0, REPAIR_STOCK_MAX, '정비 자재'),
            dead: !!s.dead, moveTarget: position(s.moveTarget, '이동 목표'), holdPoint: position(s.holdPoint, '정지 목표'),
            enemyStyle: faction === 'enemy' ? s.enemyStyle || contractId : null,
            _phase: optionalNum(s.phase, 0, 0, TAU, '자동 조종 위상'), _aiTarget: s.aiTarget ? ident(s.aiTarget) : null,
            _targetTimer: optionalNum(s.targetTimer, 0, -1, 10, '표적 타이머'),
            launchHullMax: optionalNum(s.launchHullMax, 0, 0, 160000, '출격 선체 내구도'), parts: [], crew: [] };
          if (faction === 'enemy' && !Object.prototype.hasOwnProperty.call(CONTRACTS, ship.enemyStyle)) throw new Error('적 함선 유형이 올바르지 않습니다.');
          ship.parts = s.parts.map((p, i) => {
            const d = PARTS[p.type], maxHp = num(p.maxHp, 1, d.hp * 2, '최대 내구도');
            const fire = beforeServices ? optionalNum(p.fire, 0, 0, 1, '화재 강도') : num(p.fire, 0, 1, '화재 강도');
            if (p.hp <= 0 && fire !== 0) throw new Error('파괴된 모듈의 화재 상태가 올바르지 않습니다.');
            const sulfur = beforeIndustry ? 0 : num(p.sulfur, 0, d.sulfurCapacity || 0, '황 재고');
            let production = null;
            if (p.type === 'ammo_factory') {
              const b = beforeIndustry ? { progress: 0, enabled: true, batchActive: false, state: 'sulfur' } : p.production;
              if (!b || typeof b !== 'object' || Array.isArray(b) || typeof b.enabled !== 'boolean' || typeof b.batchActive !== 'boolean' || !['producing', 'disabled', 'power', 'sulfur', 'output_full', 'offline'].includes(b.state)) throw new Error('생산 배치 상태가 올바르지 않습니다.');
              production = { progress: num(b.progress, 0, INDUSTRY.batchSeconds, '생산 진행 시간'), enabled: b.enabled, batchActive: b.batchActive, state: b.state };
              if ((!production.batchActive && production.progress !== 0) || (p.hp <= 0 && (production.batchActive || production.progress))) throw new Error('소비 원료와 생산 진행 기록이 일치하지 않습니다.');
            } else if (!beforeIndustry && p.production !== null) throw new Error('공장이 아닌 부품에 생산 기록이 있습니다.');
            const fireState = p.fireState || 'offline';
            if (!['ready', 'blocked', 'arc', 'range', 'power', 'ammo', 'heat', 'cooldown', 'offline'].includes(fireState)) throw new Error('무장 상태가 올바르지 않습니다.');
            return { ...design[i], id: uniqueId(p.id), hp: num(p.hp, 0, maxHp, '내구도'), maxHp,
              power: num(p.power, 0, d.powerCapacity || 0, '에너지'), ammo: num(p.ammo, 0, d.ammoCapacity || 0, '탄약'), sulfur, production, supplyState: 'ready',
              heat: num(p.heat, 0, 500, '열'), fire, maxHeat: 100, cooldown: num(p.cooldown, 0, 30, '재장전'), overheated: !!p.overheated,
              crewProvisioned: legacy ? true : !!p.crewProvisioned, throttle: optionalNum(p.throttle, 0, 0, 1, '추진 출력'),
              aimAngle: optionalNum(p.aimAngle, ship.angle + p.rot * Math.PI / 2, -100, 100, '포탑 각도'), fireState,
              blockedById: p.blockedById ? ident(p.blockedById) : null,
              connected: false, active: false, status: typeof p.status === 'string' ? p.status.slice(0, 80) : '', destroyed: p.hp <= 0, _reservedPower: 0, _reservedAmmo: 0, _reservedSulfur: 0, _reservedOutPower: 0, _reservedOutAmmo: 0, _reservedOutSulfur: 0 };
          });
          if (!ship.launchHullMax) ship.launchHullMax = (faction === 'player' ? blueprint.map(p => PARTS[p.type].hp) : ship.parts.map(p => p.maxHp)).reduce((n, hp) => n + hp, 0);
          const partIds = new Set(ship.parts.map(p => p.id));
          if (!Array.isArray(s.crew) || s.crew.length > 60) throw new Error('승무원 수가 올바르지 않습니다.');
          ship.crew = s.crew.map(c => {
            const crew = { id: uniqueId(c.id), x: num(c.x, -11, 11, '승무원 위치'), y: num(c.y, -11, 11, '승무원 위치'),
              homeId: ident(c.homeId), cargo: c.cargo, cargoAmount: num(c.cargoAmount, 0, beforeIndustry ? 8 : (CARRY_LIMIT[c.cargo] || 0), '운반량'),
              cargoSourceId: c.cargoSourceId ? ident(c.cargoSourceId) : null,
              idleTime: optionalNum(c.idleTime, 0, -1, 2, '작업 대기'), color: faction === 'player' ? '#b8fff0' : '#ffc5a4', job: null };
            if (![null, 'power', 'ammo', ...(beforeIndustry ? [] : ['sulfur'])].includes(c.cargo) || (c.cargo === null) !== (c.cargoAmount === 0)) throw new Error('운반 자원이 올바르지 않습니다.');
            if (c.job) {
              const j = c.job, service = j.kind === 'repair' || j.kind === 'extinguish';
              if (!partIds.has(j.targetId) || !Array.isArray(j.path) || j.path.length > 400) throw new Error('작업 대상 또는 이동 경로가 올바르지 않습니다.');
              const common = { kind: j.kind, phase: j.phase, sourceId: j.sourceId, targetId: j.targetId,
                pathIndex: num(j.pathIndex, 0, j.path.length, '경로 위치', true),
                path: j.path.map(p => ({ x: num(p.x, -10, 10, '경로', true), y: num(p.y, -10, 10, '경로', true) })) };
              if (service) {
                if (beforeServices || j.phase !== 'service' || j.sourceId !== null || c.cargo !== null || c.cargoAmount !== 0 || j.amount !== 0 || !j.site) throw new Error('현장 작업 상태가 올바르지 않습니다.');
                crew.job = { ...common, amount: 0, site: { x: num(j.site.x, -10, 10, '작업 위치', true), y: num(j.site.y, -10, 10, '작업 위치', true) },
                  work: num(j.work, 0, 0.350001, '현장 작업 시간'), effectAmount: num(j.effectAmount, 0, j.kind === 'repair' ? 3 : 1, '현장 작업 표시량') };
              } else {
                if (!['power', 'ammo', ...(beforeIndustry ? [] : ['sulfur'])].includes(j.kind) || !['pickup', 'deliver'].includes(j.phase) || !partIds.has(j.sourceId)) throw new Error('유효하지 않은 보급 작업입니다.');
                crew.job = { ...common, returning: !!j.returning, amount: num(j.amount, 0.0000001, beforeIndustry ? 8 : CARRY_LIMIT[j.kind], '예약량'), work: num(j.work, 0, 1, '작업 시간') };
                if (j.phase === 'deliver' && (c.cargo !== j.kind || c.cargoAmount + 0.001 < j.amount)) throw new Error('배달 자원과 예약량이 다릅니다.');
                if (j.phase === 'pickup' && (c.cargo !== null || c.cargoAmount !== 0)) throw new Error('픽업 상태가 올바르지 않습니다.');
                if (!crew.cargoSourceId && crew.cargo) crew.cargoSourceId = j.sourceId;
              }
            }
            return crew;
          });
          return ship;
        };
        const player = parseShip(data.player, 'player'), enemy = data.enemy ? parseShip(data.enemy, 'enemy') : null;
        if (['battle', 'victory'].includes(data.mode) && !enemy) throw new Error('전투 상대가 없습니다.');
        if (['dock', 'complete'].includes(data.mode) && enemy) throw new Error('도크 상태에 전투 상대가 있습니다.');
        if (serviceTargetId && !player.parts.some(p => p.id === serviceTargetId && p.hp > 0)) throw new Error('현장 우선 대상이 유효하지 않습니다.');
        const metrics = {};
        for (const field of ['powerDelivered', 'ammoDelivered', 'damageDealt', 'damageTaken', 'shotsFired', 'battlesWon', 'salvageEarned', 'battleTime']) metrics[field] = num(data.metrics?.[field], 0, 1e10, '통계');
        for (const field of ['crewLost', 'crewRecruited']) metrics[field] = optionalNum(data.metrics?.[field], 0, 0, 1e8, '승무원 통계');
        for (const field of ['firesExtinguished', 'hullRepaired', 'repairStockUsed']) metrics[field] = beforeServices ? optionalNum(data.metrics?.[field], 0, 0, 1e10, '정비 통계') : num(data.metrics?.[field], 0, 1e10, '정비 통계');
        for (const field of ['ammoProduced', 'sulfurDelivered', 'powerPacketsDelivered', 'sulfurSalvaged', 'sulfurSold', 'inventorySoldAmmo', 'inventorySoldSulfur', 'inventoryRefund']) metrics[field] = beforeIndustry ? 0 : num(data.metrics?.[field], 0, 1e10, '생산 통계');
        if (!Array.isArray(data.claimedSectors) || data.claimedSectors.length > 3) throw new Error('보상 기록이 올바르지 않습니다.');
        const claimed = data.claimedSectors.map(s => num(s, 1, 3, '보상 섹터', true));
        if (new Set(claimed).size !== claimed.length) throw new Error('중복 보상 기록입니다.');
        const serial = num(data.serial, 1, 1e8, '식별자 순서', true), rng = num(data.rng, 0, 4294967295, '난수 상태', true);
        num(data.pendingDockTime, 0, 2, '귀환 대기');
        const started = num(data.battleStartedAt, 0, state.time, '전투 시작');
        const accumulator = optionalNum(data.accumulator, 0, 0, 0.5, '시뮬레이션 잔여 시간');
        const projectiles = (legacy ? data.projectiles || [] : data.projectiles);
        if (!Array.isArray(projectiles) || projectiles.length > 500) throw new Error('탄체 수가 올바르지 않습니다.');
        const parsedProjectiles = projectiles.map(p => {
          const owner = p.owner === player.id ? player : p.owner === enemy?.id ? enemy : null;
          if (!owner || !['laser', 'cannon'].includes(p.kind)) throw new Error('탄체 소유자 또는 종류가 올바르지 않습니다.');
          return { x: num(p.x, -10000, 10000, '탄체 위치'), y: num(p.y, -10000, 10000, '탄체 위치'),
            px: num(p.px, -10000, 10000, '탄체 이전 위치'), py: num(p.py, -10000, 10000, '탄체 이전 위치'),
            vx: num(p.vx, -3000, 3000, '탄체 속도'), vy: num(p.vy, -3000, 3000, '탄체 속도'), damage: num(p.damage, 0, 5000, '탄체 피해'),
            ttl: num(p.ttl, 0, 10, '탄체 수명'), owner: owner.id, ownerFaction: owner.faction, kind: p.kind,
            color: owner.faction === 'player' ? (p.kind === 'laser' ? '#8bffe3' : '#ffdc99') : '#ff9a76' };
        });
        const recentHits = data.recentHits || [], debris = data.debris || [];
        if (!Array.isArray(recentHits) || recentHits.length > 1000 || !Array.isArray(debris) || debris.length > 1000) throw new Error('전투 기록이 너무 큽니다.');
        const parsedHits = recentHits.map(h => ({ time: num(h.time, 0, state.time, '피격 시간'), amount: num(h.amount, 0, 10000, '피격량') }));
        const parsedDebris = debris.map(d => ({ x: num(d.x, -10000, 10000, '잔해 위치'), y: num(d.y, -10000, 10000, '잔해 위치'), value: num(d.value, 0, 100000, '잔해 가치'), collected: !!d.collected }));
        const logs = Array.isArray(data.log) ? data.log.slice(-20).map(l => ({ text: String(l.text || '').slice(0, 180), time: finite(l.time) ? clamp(l.time, 0, state.time) : state.time, type: ['info', 'warning', 'danger', 'success'].includes(l.type) ? l.type : 'info' })) : [];
        // Rebuild and validate on an isolated object. No partial import can mutate
        // this Game, even when invalid paths are discovered after part parsing.
        const temp = Object.create(Game.prototype);
        Object.assign(temp, state, { _serial: serial, _rng: rng, _accumulator: accumulator, player, enemy, _blueprint: blueprint,
          metrics, log: logs, projectiles: parsedProjectiles, effects: [], fragments: [], debris: parsedDebris, _recentHits: parsedHits,
          _claimedSectors: claimed, _rewardClaimed: !!data.rewardClaimed, _pendingDockTime: 0, _battleStartedAt: started,
          _damageDepth: 0, _legacyWarnings: [], _fireClock: fireClock,
          _targetId: enemy?.parts.some(p => p.id === data.targetPartId && p.hp > 0) ? data.targetPartId : null });
        temp.targetPartId = temp._targetId;
        for (const ship of temp.ships) {
          temp._topology(ship, false, false);
          if (ship.faction === 'player' && serviceTargetId && !ship._partById.get(serviceTargetId)?.active) throw new Error('현장 우선 대상이 연결되지 않았습니다.');
          for (const c of ship.crew) {
            if (!ship._walk.has(key(Math.round(c.x), Math.round(c.y)))) {
              const workshopCell = ship._grid.get(key(Math.round(c.x), Math.round(c.y)));
              if (legacy && ship.dead) continue;
              if (!(state.mode === 'dock' && workshopCell && PARTS[workshopCell.type].walkable)) throw new Error('승무원이 존재하지 않는 통로에 있습니다.');
            }
            if (!c.job) continue;
            const j = c.job, source = ship._partById.get(j.sourceId), target = ship._partById.get(j.targetId);
            const field = j.kind, service = temp._isService(j);
            if (service) {
              if (!target?.active || !ship._walk.has(key(j.site.x, j.site.y)) || Math.abs(j.site.x - target.x) + Math.abs(j.site.y - target.y) > 1) throw new Error('현장 작업 위치가 유효하지 않습니다.');
            } else if (!target?.active || !(PARTS[target.type][field + 'Capacity'] > 0)) throw new Error('보급 목적지가 유효하지 않습니다.');
            if (j.phase === 'pickup' && (!source?.active || !sourceFor(source, j.kind))) throw new Error('보급 공급원이 유효하지 않습니다.');
            for (let i = j.pathIndex; i < j.path.length; i++) {
              const step = j.path[i];
              if (!ship._walk.has(key(step.x, step.y))) throw new Error('보급 경로가 손상된 칸을 통과합니다.');
              if (i > j.pathIndex && Math.abs(step.x - j.path[i - 1].x) + Math.abs(step.y - j.path[i - 1].y) > 1) throw new Error('보급 경로가 이어지지 않습니다.');
            }
            const destination = service ? j.site : j.phase === 'pickup' ? source : target, last = j.path[j.path.length - 1];
            if (last && (last.x !== destination.x || last.y !== destination.y)) throw new Error('보급 경로의 목적지가 다릅니다.');
            const next = j.path[j.pathIndex];
            if (next && Math.hypot(next.x - c.x, next.y - c.y) > 1.001) throw new Error('승무원과 이동 경로가 떨어져 있습니다.');
            if (!next && Math.hypot(destination.x - c.x, destination.y - c.y) > 0.001) throw new Error('작업 위치가 목적지와 다릅니다.');
          }
          for (const p of ship.parts) { if (p.production) temp._production(ship, p, 0); p.supplyState = temp._supplyState(ship, p); }
          const opponent = ship.faction === 'player' ? enemy : player;
          if (ship._aiTarget && !opponent?.parts.some(p => p.id === ship._aiTarget && p.hp > 0)) ship._aiTarget = null;
        }
        for (const id of ids) temp._serial = Math.max(temp._serial, Number(id.split('_').pop()));
        if (data.mode === 'victory' && claimed.includes(state.sector)) temp._rewardClaimed = true;
        if (legacy) {
          temp._legacyWarnings = ['기존 설계를 유지했습니다. 새 추력 방향·배기 공간·자함 사선 규칙을 도크에서 확인하세요.'];
          temp._log(temp._legacyWarnings[0], 'warning');
        }
        Object.assign(this, temp);
        if (this.mode === 'dock' || this.mode === 'complete') this._weapons(this.player, null, 0, true);
        this._log(beforeIndustry ? '이전 항해 기록을 v4로 불러왔습니다. 기존 재고를 보존하며 황을 추가 지급하지 않습니다.' : '설계·운반 재고·탄체와 항해 진행을 불러왔습니다.', 'info');
        return this._result(true, legacy ? '이전 저장을 불러왔습니다. 도크의 설계 경고를 확인하세요.' : '설계와 항해 진행을 불러왔습니다.');
      } catch (error) { return this._result(false, '불러오기 실패: ' + (error?.message || '잘못된 저장 파일')); }
    }

  }
  const api = { Game, PARTS, CONTRACTS, CELL, VERSION, DATA, INDUSTRY, CARRY_LIMIT, worldPoint, localPoint };
  root.StarSim = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
