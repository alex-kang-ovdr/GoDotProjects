/* Brawl Core — original, deterministic local arena simulation. No dependencies. */
(function (root) {
  'use strict';

  const W = 1280, H = 800, TAU = Math.PI * 2, STEP = 1 / 60;
  const HEROES = Object.freeze({
    ranger: Object.freeze({ name: '핀', role: '정밀 사수', color: '#54d9e7', hp: 3600,
      speed: 238, range: 495, damage: 650, reload: 1.02, projectileRadius: 5, shotSpeed: 920,
      description: '빠른 직사탄과 기동력으로 거리를 지키는 사수입니다.',
      superName: '별빛 관통', superDescription: '목재와 적을 관통하는 강력한 탄환 5발을 펼쳐 쏩니다.',
      gadgetName: '퀵 스텝', gadgetDescription: '이동 방향으로 짧게 회피하고 탄약 1발을 회복합니다. 벽은 통과하지 않습니다.', gadgetCooldown: 12 }),
    tank: Object.freeze({ name: '브릭', role: '돌격 수호자', color: '#ffc276', hp: 5900,
      speed: 216, range: 300, damage: 1200, reload: 1.3, projectileRadius: 5, shotSpeed: 680,
      description: '가까이서 강한 산탄과 높은 체력으로 전선을 엽니다.',
      superName: '지각 돌파', superDescription: '체력을 회복하며 돌진하고, 도착 지점에 충격파를 일으킵니다.',
      gadgetName: '아이언 가드', gadgetDescription: '3초 동안 직접 받는 피해를 45% 줄입니다. 독구름은 막지 못합니다.', gadgetCooldown: 16 }),
    blaster: Object.freeze({ name: '코멧', role: '폭발 전문가', color: '#b99aff', hp: 3250,
      speed: 224, range: 540, damage: 850, reload: 1.5, projectileRadius: 10, shotSpeed: 590,
      description: '폭발탄으로 모여 있는 적과 목재 장애물을 압박합니다.',
      superName: '초신성', superDescription: '큰 범위의 폭발로 적을 밀어내고 목재 장애물을 부숩니다.',
      gadgetName: '중력장', gadgetDescription: '조준 방향에 4초간 중력장을 만듭니다. 적을 35% 느리게 하고 초당 100 피해를 줍니다.', gadgetCooldown: 15 })
  });
  const MODES = Object.freeze({
    gem: Object.freeze({ name: '젬 그랩', tag: '3 대 3 · 수집',
      description: '중앙 광산에서 크리스털을 모으세요. 쓰러지면 가진 크리스털을 모두 떨어뜨립니다.',
      objective: '팀이 10개 이상을 확보하고 상대보다 많은 상태를 15초 유지하세요.' }),
    showdown: Object.freeze({ name: '쇼다운', tag: '8인 · 생존',
      description: '파워 셀로 성장하고 좁아지는 독구름을 피해 최후의 생존자가 되세요.',
      objective: '마지막까지 살아남으세요. 목재 상자를 부수면 파워 셀이 나옵니다.' }),
    ball: Object.freeze({ name: '브롤 볼', tag: '3 대 3 · 스포츠',
      description: '공을 들고 공격하면 슛이나 패스를 합니다. 슈퍼로 더 강하게 찰 수 있습니다.',
      objective: '오른쪽 상대 골대에 2골을 먼저 넣으세요. 동점이면 장애물이 사라지는 서든데스입니다.' }),
    hotzone: Object.freeze({ name: '핫 존', tag: '3 대 3 · 거점 점유',
      description: 'A와 B 구역에 머물러 두 구역을 완성하세요. 상대가 들어와도 우리 진행은 계속됩니다.',
      objective: '두 구역을 모두 100% 점유하세요. 한 구역에 여러 명이 서도 점유 속도는 같습니다.' }),
    heist: Object.freeze({ name: '하이스트', tag: '3 대 3 · 금고 공방',
      description: '아군 금고를 지키며 상대 금고를 파괴하세요. 금고는 세 번 짧은 보호막을 발동합니다.',
      objective: '상대 금고를 먼저 파괴하세요. 75·50·25%에서 발동하는 보호막 동안 다음 공격을 준비하세요.' }),
    knockout: Object.freeze({ name: '녹아웃', tag: '3 대 3 · 라운드 생존',
      description: '한 라운드에서 쓰러지면 부활하지 않습니다. 살아 있는 아군과 좁아지는 안전 구역을 지키세요.',
      objective: '상대 팀을 전멸시켜 두 라운드를 먼저 이기세요. 탈락 후에는 살아 있는 아군을 관전합니다.' }),
    bounty: Object.freeze({ name: '바운티', tag: '3 대 3 · 별 수집',
      description: '적의 현상금만큼 별을 얻습니다. 연속 처치로 높아진 자신의 현상금과 파란 별을 지키세요.',
      objective: '팀 별 20개를 먼저 모으세요. 점수가 같으면 파란 별을 보유한 팀이 승리합니다.' }),
    training: Object.freeze({ name: '연습장', tag: '솔로 · 자유 연습',
      description: '움직이지 않는 표적으로 조준, 슈퍼와 가젯을 연습하세요. 제한 시간과 승패가 없습니다.',
      objective: '슈퍼와 가젯은 빠르게 준비됩니다. R 키로 연습장을 처음부터 다시 시작하세요.' })
  });

  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
  const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  const distance = (a, b) => Math.sqrt(dist2(a, b));
  const unit = (x, y) => { const d = Math.hypot(x, y); return d > 0.0001 ? { x: x / d, y: y / d } : { x: 0, y: 0 }; };
  const circleRect = (x, y, r, b) => {
    const nx = clamp(x, b.x, b.x + b.w), ny = clamp(y, b.y, b.y + b.h);
    return (x - nx) ** 2 + (y - ny) ** 2 < r * r;
  };
  function segmentRect(ax, ay, bx, by, b, pad = 0) {
    let lo = 0, hi = 1;
    const d = [bx - ax, by - ay], a = [ax, ay];
    const mn = [b.x - pad, b.y - pad], mx = [b.x + b.w + pad, b.y + b.h + pad];
    for (let i = 0; i < 2; i++) {
      if (Math.abs(d[i]) < 1e-8) { if (a[i] < mn[i] || a[i] > mx[i]) return null; }
      else {
        let t0 = (mn[i] - a[i]) / d[i], t1 = (mx[i] - a[i]) / d[i];
        if (t0 > t1) { const tmp = t0; t0 = t1; t1 = tmp; }
        lo = Math.max(lo, t0); hi = Math.min(hi, t1);
        if (lo > hi) return null;
      }
    }
    return lo >= 0 && lo <= 1 ? lo : null;
  }
  function segmentCircle(ax, ay, bx, by, x, y, r) {
    const dx = bx - ax, dy = by - ay, ox = ax - x, oy = ay - y;
    const c = ox * ox + oy * oy - r * r;
    if (c <= 0) return 0;
    const a = dx * dx + dy * dy;
    if (a < 1e-10) return null;
    const b = 2 * (ox * dx + oy * dy), disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    return t >= 0 && t <= 1 ? t : null;
  }
  function seeded(seed) {
    let n = seed >>> 0;
    return () => {
      n += 0x6D2B79F5;
      let t = n;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  class Game {
    constructor(options = {}) {
      this.mode = MODES[options.mode] ? options.mode : 'gem';
      this.hero = HEROES[options.hero] ? options.hero : 'ranger';
      this.difficulty = ['easy', 'normal', 'hard'].includes(options.difficulty) ? options.difficulty : 'normal';
      this.seed = finite(options.seed, 2026) >>> 0;
      this.random = seeded(this.seed);
      this.aiEnabled = true;
      this._id = 1;
      this._wallVersion = 0;
      this._grid = null;
      this._gemTimer = 1;
      this._ended = false;
      this._gadgetHeld = false;
      this._superHeld = false;
      this._bountyBatch = null;
      this.state = {
        mode: this.mode, status: 'playing', elapsed: 0,
        timeLimit: this.mode === 'training' ? 0 : this.mode === 'showdown' ? 150 : this.mode === 'knockout' ? 240 : this.mode === 'bounty' ? 120 : 180,
        width: W, height: H, actors: [], projectiles: [], walls: [], bushes: [],
        pickups: [], effects: [], score: [0, 0], countdown: null, ball: null,
        zone: this.mode === 'showdown' || this.mode === 'knockout' ? { x: W / 2, y: H / 2, r: 770 } : null,
        result: null, events: [], goalPause: 0, fields: [], killFeed: [], overtime: false, overtimeDuration: 45,
        round: this.mode === 'knockout' ? { number: 1, phase: 'active', elapsed: 0, timeLimit: 75,
          breakRemaining: 0, lastWinner: null, lastReason: '', history: [] } : null,
        bounty: this.mode === 'bounty' ? { target: 20, blueStar: { x: 640, y: 400, r: 12,
          carrierId: null, team: null, onGround: true, firstClaimed: false } } : null,
        captureZones: this.mode === 'hotzone' ? [245, 555].map((y, i) => ({
          id: i === 0 ? 'zone-A' : 'zone-B', x: 640, y, r: 95,
          progress: [0, 0], occupants: [0, 0], captureSeconds: 40
        })) : [],
        safes: this.mode === 'heist' ? [180, 1100].map((x, team) => ({
          id: 'safe-' + team, team, x, y: 400, r: 42, hp: 24000, maxHp: 24000,
          shieldTime: 0, shieldsTriggered: 0, lastHitTime: -10
        })) : [],
        gemMine: this.mode === 'gem' ? { x: W / 2, y: H / 2 } : null,
        goalBounds: this.mode === 'ball' ? [{ team: 0, x: 0, y: 278, w: 28, h: 244 }, { team: 1, x: 1252, y: 278, w: 28, h: 244 }] : null
      };
      this._buildMap();
      this._makeActors();
      if (this.mode === 'heist') this.state.score = [100, 100];
      if (this.mode === 'ball') this._resetBall();
      if (this.mode === 'showdown') this._seedPower();
      if (this.mode === 'knockout') this._event('roundStart', 640, 400);
      this._visibility();
    }

    get player() { return this.state.actors[0]; }
    _uid(prefix) { return prefix + this._id++; }
    _rand(a, b) { return a + this.random() * (b - a); }
    _event(type, x, y, team) {
      const e = { id: this._uid('e'), type, x: finite(x), y: finite(y) };
      if (team !== undefined) e.team = team;
      this.state.events.push(e);
      if (this.state.events.length > 64) this.state.events.splice(0, this.state.events.length - 64);
    }
    _effect(type, x, y, r, life, color, text) {
      const e = { type, x, y, r, life, maxLife: life, color: color || '#ffffff' };
      if (text !== undefined) e.text = String(text);
      this.state.effects.push(e);
      if (this.state.effects.length > 180) this.state.effects.shift();
    }
    _wall(x, y, w, h, destructible = true, power = false) {
      const hp = destructible ? (power ? 1600 : 2200) : 999999;
      this.state.walls.push({ id: this._uid('w'), x, y, w, h, hp, maxHp: hp,
        destructible, kind: destructible ? 'crate' : 'stone', dropPower: power });
    }
    _bush(x, y, w, h) { this.state.bushes.push({ x, y, w, h }); }
    _buildMap() {
      if (this.mode === 'training') {
        this._wall(630, 155, 48, 100, true);
        this._wall(630, 545, 48, 100, true);
        this._wall(1045, 310, 45, 180, false);
        this._wall(290, 160, 100, 42, true);
        this._wall(290, 598, 100, 42, true);
        this._bush(480, 285, 85, 90);
        this._bush(480, 425, 85, 90);
      } else if (this.mode === 'knockout') {
        for (const b of [[355, 220, 48, 115], [877, 220, 48, 115],
          [355, 465, 48, 115], [877, 465, 48, 115], [535, 145, 210, 38], [535, 617, 210, 38]]) this._wall(...b, false);
        for (const b of [[470, 285, 58, 72], [752, 285, 58, 72], [470, 443, 58, 72], [752, 443, 58, 72]]) this._wall(...b, true);
        for (const b of [[205, 180, 100, 170], [975, 180, 100, 170],
          [205, 450, 100, 170], [975, 450, 100, 170], [545, 220, 190, 55], [545, 525, 190, 55]]) this._bush(...b);
      } else if (this.mode === 'bounty') {
        for (const b of [[355, 290, 48, 220], [877, 290, 48, 220],
          [530, 165, 90, 38], [660, 165, 90, 38], [530, 597, 90, 38], [660, 597, 90, 38]]) this._wall(...b, false);
        for (const b of [[490, 302, 58, 64], [732, 302, 58, 64],
          [490, 434, 58, 64], [732, 434, 58, 64], [255, 145, 75, 36], [950, 145, 75, 36],
          [255, 619, 75, 36], [950, 619, 75, 36]]) this._wall(...b, true);
        for (const b of [[185, 245, 120, 95], [975, 245, 120, 95],
          [185, 460, 120, 95], [975, 460, 120, 95], [560, 245, 160, 62], [560, 493, 160, 62]]) this._bush(...b);
      } else if (this.mode === 'hotzone') {
        for (const b of [[400, 180, 42, 130], [838, 180, 42, 130],
          [400, 490, 42, 130], [838, 490, 42, 130]]) this._wall(...b, false);
        for (const b of [[535, 370, 65, 60], [680, 370, 65, 60],
          [535, 87, 90, 35], [655, 87, 90, 35], [535, 678, 90, 35], [655, 678, 90, 35]]) this._wall(...b, true);
        for (const b of [[490, 177, 48, 136], [742, 177, 48, 136],
          [490, 487, 48, 136], [742, 487, 48, 136], [225, 355, 105, 90], [950, 355, 105, 90]]) this._bush(...b);
      } else if (this.mode === 'heist') {
        for (const b of [[350, 225, 42, 120], [888, 225, 42, 120],
          [350, 455, 42, 120], [888, 455, 42, 120], [608, 365, 64, 70]]) this._wall(...b, false);
        for (const b of [[608, 190, 64, 105], [608, 505, 64, 105],
          [250, 120, 100, 36], [930, 120, 100, 36], [250, 644, 100, 36], [930, 644, 100, 36]]) this._wall(...b, true);
        for (const b of [[425, 155, 145, 80], [710, 155, 145, 80],
          [425, 565, 145, 80], [710, 565, 145, 80]]) this._bush(...b);
      } else if (this.mode === 'showdown') {
        for (const [x, y, w, h] of [[285, 180, 90, 42], [905, 180, 90, 42],
          [285, 578, 90, 42], [905, 578, 90, 42], [450, 320, 44, 160], [786, 320, 44, 160],
          [590, 195, 100, 40], [590, 565, 100, 40]]) this._wall(x, y, w, h, false);
        for (const [x, y] of [[220, 330], [220, 440], [1015, 330], [1015, 440],
          [430, 150], [805, 150], [430, 610], [805, 610], [535, 360], [700, 390], [610, 285], [625, 475]])
          this._wall(x, y, 42, 42, true, true);
        for (const b of [[90, 270, 155, 260], [1035, 270, 155, 260], [430, 68, 420, 85],
          [430, 647, 420, 85], [533, 337, 214, 126]]) this._bush(...b);
      } else if (this.mode === 'ball') {
        for (const b of [[305, 155, 55, 150], [920, 155, 55, 150], [305, 495, 55, 150],
          [920, 495, 55, 150], [592, 200, 96, 38], [592, 562, 96, 38]]) this._wall(...b, true);
        for (const b of [[448, 325, 42, 150], [790, 325, 42, 150]]) this._wall(...b, false);
        for (const b of [[110, 125, 180, 95], [990, 125, 180, 95], [110, 580, 180, 95],
          [990, 580, 180, 95], [555, 268, 170, 80], [555, 452, 170, 80]]) this._bush(...b);
      } else {
        for (const b of [[300, 135, 112, 42], [868, 135, 112, 42], [300, 623, 112, 42],
          [868, 623, 112, 42], [260, 354, 70, 92], [950, 354, 70, 92]]) this._wall(...b, false);
        for (const b of [[458, 255, 44, 112], [778, 255, 44, 112], [458, 433, 44, 112],
          [778, 433, 44, 112], [602, 155, 76, 40], [602, 605, 76, 40]]) this._wall(...b, true);
        for (const b of [[350, 215, 90, 160], [840, 215, 90, 160], [350, 425, 90, 160],
          [840, 425, 90, 160], [545, 275, 190, 65], [545, 460, 190, 65]]) this._bush(...b);
      }
    }
    _makeActors() {
      const names = ['YOU', '에코', '바이트', '스파크', '오리온', '패치', '베가', '스톰'];
      const heroes = ['ranger', 'tank', 'blaster'];
      const count = this.mode === 'training' ? 4 : this.mode === 'showdown' ? 8 : 6;
      for (let id = 0; id < count; id++) {
        const hero = id === 0 ? this.hero : heroes[(id + (this.seed % 3)) % 3];
        const h = HEROES[hero], team = this.mode === 'showdown' ? id : this.mode === 'training' ? (id === 0 ? 0 : 1) : (id < 3 ? 0 : 1);
        let x, y;
        if (this.mode === 'training') {
          x = id === 0 ? 420 : 850;
          y = id === 0 ? 400 : [210, 400, 590][id - 1];
        } else if (this.mode === 'showdown') {
          const angle = Math.PI + id * TAU / count;
          x = 640 + Math.cos(angle) * 490; y = 400 + Math.sin(angle) * 280;
        } else {
          x = this.mode === 'heist' ? (team === 0 ? 90 : 1190) : (team === 0 ? 135 : 1145);
          y = (this.mode === 'heist' ? [400, 225, 575] : [400, 245, 555])[id % 3];
        }
        if (this.state.walls.some(w => w.hp > 0 && circleRect(x, y, 26, w)) ||
          this.state.safes.some(s => s.hp > 0 && Math.hypot(x - s.x, y - s.y) < s.r + 26)) {
          const free = this._nearestFree(x, y); x = free.x; y = free.y;
        }
        const isDummy = this.mode === 'training' && id > 0;
        const a = { id, name: isDummy ? '표적 ' + id : names[id], hero, team, x, y, r: hero === 'tank' ? 22 : 18,
          angle: team === 0 ? 0 : Math.PI, hp: h.hp, maxHp: h.hp, ammo: 3, maxAmmo: 3,
          superCharge: this.mode === 'training' ? 1 : 0.15, alive: true, respawnIn: 0, invulnerable: this.mode === 'training' ? 0 : 1.4,
          gems: 0, power: 0, kills: 0, damage: 0, damageTaken: 0, deaths: 0,
          isPlayer: id === 0, isDummy, hidden: false, hitFlash: 0, lastShot: -10, shotCooldown: 0,
          gadgetCooldown: 0, shieldTime: 0, slowTime: 0, slowFactor: 1,
          assists: 0, goals: 0, gemsCollected: 0, shotsFired: 0, shotsHit: 0, damageLedger: {},
          captureTime: 0, objectiveDamage: 0,
          bountyValue: 2, starsEarned: 0, starsLost: 0, roundSurvivals: 0,
          spawnX: x, spawnY: y, vx: 0, vy: 0, revealFor: 0, lastHurt: -10,
          dashTime: 0, dashVX: 0, dashVY: 0,
          ai: { think: this._rand(0, 0.28), goal: { x, y }, path: [], pathTimer: 0,
            targetId: null, crateId: null, bias: 0, strafe: id % 2 ? 1 : -1,
            phase: this._rand(0, TAU), lastX: x, lastY: y, stuckTime: 0,
            recovering: false, knownEnemies: {}, lastBallSpot: null } };
        this.state.actors.push(a);
      }
    }
    _seedPower() {
      for (const [x, y] of [[320, 270], [960, 270], [320, 530], [960, 530],
        [520, 235], [760, 235], [520, 565], [760, 565], [640, 355], [640, 445]])
        this._pickup('power', x, y, 1);
    }
    _pickup(type, x, y, value) {
      x = clamp(x, 20, W - 20); y = clamp(y, 20, H - 20);
      if (this.state.walls.some(b => b.hp > 0 && circleRect(x, y, 10, b))) {
        const p = this._nearestFree(x, y); x = p.x; y = p.y;
      }
      this.state.pickups.push({ id: this._uid('p'), type, x, y, r: type === 'gem' ? 10 : 12, value });
    }

    update(dt, input = {}) {
      dt = clamp(finite(dt), 0, 0.25);
      if (dt <= 0) return;
      if (this.state.status !== 'playing') { this._decayEffects(dt); return; }
      input = input || {};
      const edgeInput = Object.assign({}, input, {
        gadget: Boolean(input.gadget) && !this._gadgetHeld,
        super: Boolean(input.super) && !this._superHeld
      });
      this._gadgetHeld = Boolean(input.gadget);
      this._superHeld = Boolean(input.super);
      let first = true;
      while (dt > 1e-8 && this.state.status === 'playing') {
        const step = Math.min(STEP, dt);
        const inp = first ? edgeInput : Object.assign({}, input, { super: false, gadget: false });
        this._step(step, inp || {});
        dt -= step; first = false;
      }
    }
    _decayEffects(dt) {
      for (const e of this.state.effects) e.life -= dt;
      this.state.effects = this.state.effects.filter(e => e.life > 0);
    }
    _step(dt, input) {
      const s = this.state;
      if (this.mode === 'bounty') this._bountyBatch = {
        values: Object.fromEntries(s.actors.map(a => [a.id, a.bountyValue])),
        blueOwner: s.bounty.blueStar.carrierId, deaths: []
      };
      s.elapsed += dt;
      this._decayEffects(dt);
      for (const safe of s.safes) safe.shieldTime = Math.max(0, safe.shieldTime - dt);
      for (const a of s.actors) {
        a.gadgetCooldown = Math.max(0, a.gadgetCooldown - dt);
        a.shieldTime = Math.max(0, a.shieldTime - dt);
        a.slowTime = Math.max(0, a.slowTime - dt);
        if (a.slowTime <= 0) a.slowFactor = 1;
      }
      if (s.round && s.round.phase === 'break') {
        s.round.breakRemaining = Math.max(0, s.round.breakRemaining - dt);
        if (s.elapsed >= s.timeLimit) this._timeEnd();
        else if (s.round.breakRemaining <= 0) this._startKnockoutRound();
        this._visibility();
        return;
      }
      if (s.goalPause > 0) {
        s.goalPause = Math.max(0, s.goalPause - dt);
        if (s.goalPause <= 0) this._resetAfterGoal();
        if (s.timeLimit > 0 && s.elapsed >= s.timeLimit) this._timeEnd();
        return;
      }
      if (s.round) {
        s.round.elapsed += dt;
        s.zone.r = 770 - clamp((s.round.elapsed - 25) / 40, 0, 1) * 750;
      } else if (s.zone) s.zone.r = Math.max(24, 770 - clamp((s.elapsed - 18) / 112, 0, 1) * 746);
      this._updateFields(dt);
      for (const a of s.actors) {
        a.hitFlash = Math.max(0, a.hitFlash - dt);
        a.revealFor = Math.max(0, a.revealFor - dt);
        if (!a.alive) {
          if (this.mode !== 'showdown' && this.mode !== 'knockout') {
            a.respawnIn -= dt;
            if (a.respawnIn <= 0) this._respawn(a);
          }
          continue;
        }
        a.invulnerable = Math.max(0, a.invulnerable - dt);
        a.shotCooldown = Math.max(0, a.shotCooldown - dt);
        a.ammo = Math.min(3, a.ammo + dt / HEROES[a.hero].reload);
        a.superCharge = Math.min(1, a.superCharge + dt * (this.mode === 'training' ? 1 / 3 : 0.009));
        if (s.elapsed - Math.max(a.lastHurt, a.lastShot) >= 3 && a.hp < a.maxHp) {
          a.hp = Math.min(a.maxHp, a.hp + a.maxHp * 0.125 * dt);
        }
        const command = a.isPlayer ? input : (this.aiEnabled && !a.isDummy ? this._botInput(a, dt) : {});
        if (a.dashTime > 0) this._dash(a, dt);
        else this._act(a, command, dt);
      }
      this._separateActors();
      this._updateProjectiles(dt);
      this._collectPickups();
      if (this.mode === 'gem') this._gemRules(dt);
      else if (this.mode === 'ball') this._ballRules(dt);
      else if (this.mode === 'showdown') this._showdownRules(dt);
      else if (this.mode === 'hotzone') this._hotzoneRules(dt);
      else if (this.mode === 'heist') this._heistRules();
      else if (this.mode === 'knockout') this._knockoutRules(dt);
      else if (this.mode === 'bounty') this._bountyRules();
      this._visibility();
      if (s.status === 'playing' && s.timeLimit > 0 && s.elapsed >= s.timeLimit) this._timeEnd();
    }
    _act(a, input, dt) {
      let mx = finite(input.moveX), my = finite(input.moveY), length = Math.hypot(mx, my);
      if (length > 1) { mx /= length; my /= length; }
      const speed = HEROES[a.hero].speed * (this._holdsBall(a) ? 0.93 : 1) * a.slowFactor;
      a.vx = mx * speed; a.vy = my * speed;
      this._move(a, a.vx * dt, a.vy * dt);
      const ax = finite(input.aimX, a.x + Math.cos(a.angle) * 100);
      const ay = finite(input.aimY, a.y + Math.sin(a.angle) * 100);
      if (Math.hypot(ax - a.x, ay - a.y) > 0.1) a.angle = Math.atan2(ay - a.y, ax - a.x);
      a.aimDistance = Math.hypot(ax - a.x, ay - a.y);
      if (input.gadget && a.gadgetCooldown <= 0) this._gadget(a, mx, my);
      if (input.super && a.superCharge >= 0.999) this._super(a);
      else if (input.fire && a.ammo >= 1 && a.shotCooldown <= 0) this._fire(a);
    }
    _move(a, dx, dy) {
      const ox = a.x, oy = a.y;
      a.x = clamp(a.x + dx, a.r + 5, W - a.r - 5);
      for (const b of this.state.walls) if (b.hp > 0 && circleRect(a.x, a.y, a.r, b)) {
        if (ox <= b.x) a.x = Math.min(a.x, b.x - a.r - 0.1);
        else if (ox >= b.x + b.w) a.x = Math.max(a.x, b.x + b.w + a.r + 0.1);
        else a.x = ox;
      }
      for (const s of this.state.safes) if (s.hp > 0 && Math.hypot(a.x - s.x, a.y - s.y) < a.r + s.r) {
        const edge = Math.sqrt(Math.max(0, (a.r + s.r) ** 2 - (a.y - s.y) ** 2)) + 0.1;
        a.x = ox <= s.x ? s.x - edge : s.x + edge;
      }
      a.y = clamp(a.y + dy, a.r + 5, H - a.r - 5);
      for (const b of this.state.walls) if (b.hp > 0 && circleRect(a.x, a.y, a.r, b)) {
        if (oy <= b.y) a.y = Math.min(a.y, b.y - a.r - 0.1);
        else if (oy >= b.y + b.h) a.y = Math.max(a.y, b.y + b.h + a.r + 0.1);
        else a.y = oy;
      }
      for (const s of this.state.safes) if (s.hp > 0 && Math.hypot(a.x - s.x, a.y - s.y) < a.r + s.r) {
        const edge = Math.sqrt(Math.max(0, (a.r + s.r) ** 2 - (a.x - s.x) ** 2)) + 0.1;
        a.y = oy <= s.y ? s.y - edge : s.y + edge;
      }
      a.x = clamp(a.x, a.r + 5, W - a.r - 5);
      a.y = clamp(a.y, a.r + 5, H - a.r - 5);
    }
    _separateActors() {
      const actors = this.state.actors;
      for (let i = 0; i < actors.length; i++) for (let j = i + 1; j < actors.length; j++) {
        const a = actors[i], b = actors[j];
        if (!a.alive || !b.alive) continue;
        let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
        const min = (a.r + b.r) * 0.9;
        if (d < min) {
          if (d < 0.01) { dx = i % 2 ? 1 : -1; dy = 0; d = 1; }
          const push = Math.min(5, (min - d) * 0.5);
          this._move(a, -dx / d * push, -dy / d * push);
          this._move(b, dx / d * push, dy / d * push);
        }
      }
    }
    _holdsBall(a) { return this.state.ball && this.state.ball.carrierId === a.id; }
    _damageScale(a) {
      let scale = 1 + a.power * 0.09;
      if (!a.isPlayer && a.team !== this.player.team && this.difficulty === 'easy') scale *= 0.86;
      return scale;
    }
    _gadget(a, moveX, moveY) {
      if (!a.alive || a.gadgetCooldown > 0) return;
      a.gadgetCooldown = this.mode === 'training' ? 3 : HEROES[a.hero].gadgetCooldown;
      a.lastShot = this.state.elapsed; a.revealFor = Math.max(a.revealFor, 0.6); a.invulnerable = 0;
      if (a.hero === 'ranger') {
        const direction = Math.hypot(moveX, moveY) > 0.1 ? unit(moveX, moveY) : { x: Math.cos(a.angle), y: Math.sin(a.angle) };
        // Small movement sweeps retain the same wall/slide constraints as walking.
        for (let remaining = 148; remaining > 0; remaining -= 6) {
          const amount = Math.min(remaining, 6), x = a.x, y = a.y;
          this._move(a, direction.x * amount, direction.y * amount);
          if (Math.hypot(a.x - x, a.y - y) < 0.05) break;
          if (remaining % 24 < 6) this._effect('dash', x, y, 21, 0.3, '#9ff4ff');
        }
        a.ammo = Math.min(a.maxAmmo, a.ammo + 1);
      } else if (a.hero === 'tank') {
        a.shieldTime = 3;
        this._effect('shield', a.x, a.y, 39, 0.5, '#7ccfff');
      } else {
        const reach = Math.min(260, Math.max(40, finite(a.aimDistance, 260)));
        const dx = Math.cos(a.angle) * reach, dy = Math.sin(a.angle) * reach;
        let t = 1;
        for (const w of this.state.walls) if (w.hp > 0) {
          const hit = segmentRect(a.x, a.y, a.x + dx, a.y + dy, w, 12);
          if (hit !== null) t = Math.min(t, Math.max(0, hit - 2 / reach));
        }
        this.state.fields.push({ id: this._uid('f'), type: 'gravity', ownerId: a.id, team: a.team,
          x: clamp(a.x + dx * t, 15, W - 15), y: clamp(a.y + dy * t, 15, H - 15), r: 105, life: 4, maxLife: 4 });
        this._effect('explosion', a.x + dx * t, a.y + dy * t, 105, 0.4, '#bd8aff');
      }
      this._event('gadget', a.x, a.y, a.team);
    }
    _updateFields(dt) {
      const active = this.state.fields.slice();
      for (const f of active) {
        if (!this.state.fields.includes(f)) continue;
        const liveDt = Math.min(dt, Math.max(0, f.life));
        f.life = Math.max(0, f.life - dt);
        if (liveDt <= 0) continue;
        for (const a of this.state.actors) if (a.alive && a.team !== f.team &&
          distance(a, f) <= f.r + a.r && this._lineClear(f.x, f.y, a.x, a.y, 0)) {
          a.slowTime = Math.max(a.slowTime, 0.12);
          a.slowFactor = Math.min(a.slowFactor, 0.65);
          this._damageActor(a, 100 * liveDt, f.ownerId, 'gadget');
        }
        for (const safe of this.state.safes) if (safe.hp > 0 && safe.team !== f.team &&
          distance(safe, f) <= f.r + safe.r && this._lineClear(f.x, f.y, safe.x, safe.y, 0))
          this._damageSafe(safe, 100 * liveDt, f.ownerId, f.team);
      }
      this.state.fields = this.state.fields.filter(f => f.life > 0);
    }
    _newShot(a) {
      a.shotsFired++;
      return { id: this._uid('shot'), hit: false };
    }
    _fire(a) {
      if (this._holdsBall(a)) { this._kickBall(a, false); return; }
      a.ammo -= 1; a.lastShot = this.state.elapsed; a.revealFor = 1.5;
      a.invulnerable = 0;
      const h = HEROES[a.hero], scale = this._damageScale(a);
      const shot = this._newShot(a);
      if (a.hero === 'tank') {
        a.shotCooldown = 0.4;
        for (let i = -2; i <= 2; i++) this._projectile(a, a.angle + i * 0.13, 680, h.range,
          240 * scale, { r: 5, kind: 'pellet', color: h.color, shot });
      } else if (a.hero === 'blaster') {
        a.shotCooldown = 0.46;
        this._projectile(a, a.angle, 590, h.range, h.damage * scale,
          { r: 10, kind: 'bomb', splash: 78, color: h.color, shot });
      } else {
        a.shotCooldown = 0.27;
        this._projectile(a, a.angle, 920, h.range, h.damage * scale,
          { r: 5, kind: 'bullet', color: h.color, shot });
      }
      this._effect('shot', a.x + Math.cos(a.angle) * a.r, a.y + Math.sin(a.angle) * a.r, 18, 0.12, h.color);
      this._event('shoot', a.x, a.y, a.team);
    }
    _projectile(a, angle, speed, range, damage, extra = {}) {
      const offset = a.r + 8;
      const p = Object.assign({ id: this._uid('s'), x: a.x, y: a.y,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r: 5,
        team: a.team, ownerId: a.id, color: HEROES[a.hero].color, kind: 'bullet',
        damage, remaining: range, life: range / speed + 0.5, hitIds: [], super: false }, extra);
      // Sweep from body center to muzzle; a narrow or adjacent wall cannot be skipped.
      if (this._advanceProjectile(p, Math.cos(angle) * offset, Math.sin(angle) * offset))
        this.state.projectiles.push(p);
    }
    _super(a) {
      if (this._holdsBall(a)) { this._kickBall(a, true); return; }
      a.superCharge = 0; a.lastShot = this.state.elapsed; a.revealFor = 2;
      a.invulnerable = 0; a.shotCooldown = 0.35;
      const scale = this._damageScale(a);
      if (a.hero === 'tank') {
        a.hp = Math.min(a.maxHp, a.hp + 800);
        a.dashTime = 0.31; a.dashVX = Math.cos(a.angle) * 980; a.dashVY = Math.sin(a.angle) * 980;
        a.dashHitIds = [];
        this._effect('heal', a.x, a.y, 38, 0.55, '#83f0ac', '+800');
      } else if (a.hero === 'ranger') {
        const shot = this._newShot(a);
        for (let i = -2; i <= 2; i++) this._projectile(a, a.angle + i * 0.065,
          1120, 780, 700 * scale, { r: 7, kind: 'pierce', piercing: true, super: true, color: '#bffbff', shot });
      } else {
        const shot = this._newShot(a);
        this._projectile(a, a.angle, 680, 720, 1900 * scale,
          { r: 15, splash: 155, kind: 'super', super: true, breakWalls: true, color: '#efc2ff', shot });
      }
      this._effect('explosion', a.x, a.y, 40, 0.3, HEROES[a.hero].color);
      this._event('super', a.x, a.y, a.team);
    }
    _dash(a, dt) {
      const px = a.x, py = a.y;
      for (const w of this.state.walls) if (w.destructible && w.hp > 0 &&
        circleRect(a.x + a.dashVX * dt, a.y + a.dashVY * dt, a.r + 16, w)) this._damageWall(w, w.hp);
      this._move(a, a.dashVX * dt, a.dashVY * dt);
      a.vx = a.dashVX; a.vy = a.dashVY;
      for (const b of this.state.actors) if (b.alive && b.team !== a.team &&
        !a.dashHitIds.includes(b.id) && distance(a, b) < a.r + b.r + 18) {
        a.dashHitIds.push(b.id); this._damageActor(b, 600 * this._damageScale(a), a.id, 'super');
      }
      for (const safe of this.state.safes) if (safe.hp > 0 && safe.team !== a.team &&
        !a.dashHitIds.includes(safe.id) && distance(a, safe) < a.r + safe.r + 18) {
        a.dashHitIds.push(safe.id);
        this._damageSafe(safe, 600 * this._damageScale(a), a.id, a.team);
      }
      a.dashTime -= dt;
      if (Math.hypot(a.x - px, a.y - py) < 1) a.dashTime = 0;
      if (a.dashTime <= 0) {
        a.dashTime = 0; a.vx = 0; a.vy = 0;
        this._explode(a.x, a.y, 137, 1250 * this._damageScale(a), a.id, a.team, true, true);
      } else if (this.state.elapsed % 0.06 < dt) this._effect('dash', px, py, 25, 0.22, '#ffd68d');
    }
    _advanceProjectile(p, dx, dy) {
      const ox = p.x, oy = p.y, nx = ox + dx, ny = oy + dy;
      const hits = [];
      for (const w of this.state.walls) if (w.hp > 0 && !p.hitIds.includes(w.id)) {
        const t = segmentRect(ox, oy, nx, ny, w, p.r);
        if (t !== null) hits.push({ t, wall: w });
      }
      for (const a of this.state.actors) if (a.alive && a.team !== p.team && !p.hitIds.includes(a.id)) {
        const t = segmentCircle(ox, oy, nx, ny, a.x, a.y, a.r + p.r);
        if (t !== null) hits.push({ t, actor: a });
      }
      for (const safe of this.state.safes) if (safe.hp > 0 && safe.team !== p.team && !p.hitIds.includes(safe.id)) {
        const t = segmentCircle(ox, oy, nx, ny, safe.x, safe.y, safe.r + p.r);
        if (t !== null) hits.push({ t, safe });
      }
      hits.sort((a, b) => a.t - b.t);
      for (const hit of hits) {
        const x = ox + dx * hit.t, y = oy + dy * hit.t;
        if (p.splash) {
          this._explode(x, y, p.splash, p.damage, p.ownerId, p.team, p.super, p.breakWalls, p.shot);
          p.x = x; p.y = y;
          return false;
        }
        if (hit.wall) {
          p.hitIds.push(hit.wall.id);
          this._damageWall(hit.wall, p.damage * (p.super ? 1.5 : 1));
          this._effect('hit', x, y, 14, 0.18, '#dfbd8a');
          if (!p.piercing || !hit.wall.destructible) { p.x = x; p.y = y; return false; }
        } else if (hit.safe) {
          p.hitIds.push(hit.safe.id);
          this._damageSafe(hit.safe, p.damage, p.ownerId, p.team, p.shot);
          if (!p.piercing) { p.x = x; p.y = y; return false; }
        } else {
          p.hitIds.push(hit.actor.id);
          this._damageActor(hit.actor, p.damage, p.ownerId, p.super ? 'super' : 'attack', p.shot);
          if (!p.piercing) { p.x = x; p.y = y; return false; }
        }
      }
      p.x = nx; p.y = ny; p.remaining -= Math.hypot(dx, dy);
      return true;
    }
    _updateProjectiles(dt) {
      const keep = [];
      for (const p of this.state.projectiles) {
        const travel = Math.min(p.remaining, Math.hypot(p.vx, p.vy) * dt);
        const u = unit(p.vx, p.vy);
        let alive = this._advanceProjectile(p, u.x * travel, u.y * travel);
        p.life -= dt;
        if (alive && (p.remaining <= 0.1 || p.life <= 0 || p.x < 0 || p.x > W || p.y < 0 || p.y > H)) {
          if (p.splash) this._explode(p.x, p.y, p.splash, p.damage, p.ownerId, p.team, p.super, p.breakWalls, p.shot);
          alive = false;
        }
        if (alive) keep.push(p);
      }
      this.state.projectiles = keep;
    }
    _explode(x, y, radius, damage, ownerId, team, isSuper = false, breakWalls = false, shot = null) {
      this._effect('explosion', x, y, radius, 0.42, isSuper ? '#e0b4ff' : '#ffc78d');
      this._event('explosion', x, y, team);
      for (const a of this.state.actors) if (a.alive && a.team !== team) {
        const d = Math.hypot(a.x - x, a.y - y);
        if (d <= radius + a.r) {
          const scale = d < radius * 0.45 ? 1 : 0.85;
          this._damageActor(a, damage * scale, ownerId, isSuper ? 'super' : 'attack', shot);
          if (isSuper && a.alive) { const u = unit(a.x - x, a.y - y); this._move(a, u.x * 22, u.y * 22); }
        }
      }
      for (const safe of this.state.safes) if (safe.hp > 0 && safe.team !== team) {
        const d = Math.hypot(safe.x - x, safe.y - y);
        if (d <= radius + safe.r) this._damageSafe(safe, damage * (d < radius * 0.45 ? 1 : 0.85), ownerId, team, shot);
      }
      for (const w of this.state.walls) if (w.destructible && w.hp > 0 && circleRect(x, y, radius, w))
        this._damageWall(w, breakWalls ? w.hp : damage);
    }
    _damageWall(w, amount) {
      if (!w.destructible || w.hp <= 0) return;
      w.hp = Math.max(0, w.hp - amount);
      if (w.hp <= 0) {
        this._wallVersion++; this._grid = null;
        this._effect('explosion', w.x + w.w / 2, w.y + w.h / 2, 30, 0.38, '#caa574');
        this._event('break', w.x + w.w / 2, w.y + w.h / 2);
        if (w.dropPower) this._pickup('power', w.x + w.w / 2, w.y + w.h / 2, 1);
      }
    }
    _damageSafe(safe, amount, ownerId, attackerTeam, shot = null) {
      if (safe.hp <= 0 || safe.shieldTime > 0 || attackerTeam === safe.team || amount <= 0) return 0;
      const thresholds = [0.75, 0.5, 0.25];
      // Public test/replay states may start below an already-passed threshold.
      while (safe.shieldsTriggered < 3 && safe.hp <= safe.maxHp * thresholds[safe.shieldsTriggered]) safe.shieldsTriggered++;
      const threshold = safe.shieldsTriggered < 3 ? safe.maxHp * thresholds[safe.shieldsTriggered] : 0;
      const hp = Math.max(threshold, safe.hp - amount), actual = safe.hp - hp;
      if (actual <= 0) return 0;
      safe.hp = hp; safe.lastHitTime = this.state.elapsed;
      const owner = this.state.actors.find(a => a.id === ownerId);
      if (owner && owner.team !== safe.team) {
        owner.objectiveDamage += actual;
        if (shot && !shot.hit) { shot.hit = true; owner.shotsHit++; }
      }
      if (safe.hp === threshold && safe.shieldsTriggered < 3) {
        safe.shieldsTriggered++; safe.shieldTime = 1.8;
        this._effect('shield', safe.x, safe.y, safe.r + 18, 0.55, '#bceaff');
        this._event('safeShield', safe.x, safe.y, safe.team);
      } else if (this.state.elapsed - finite(safe.lastFeedbackTime, -10) >= 0.08) {
        this._effect('hit', safe.x, safe.y, safe.r + 8, 0.18, '#ffe3a6');
        this._event('safeHit', safe.x, safe.y, safe.team);
        safe.lastFeedbackTime = this.state.elapsed;
      }
      if (safe.hp <= 0) {
        this._wallVersion++; this._grid = null;
        this._effect('explosion', safe.x, safe.y, 115, 1.1, '#ffd08c');
      }
      return actual;
    }
    _damageActor(a, amount, ownerId, kind, shot = null) {
      if (!a.alive || (a.invulnerable > 0 && kind !== 'poison')) return;
      if (a.dashTime > 0 && kind !== 'poison') amount *= 0.6;
      if (a.shieldTime > 0 && kind !== 'poison') amount *= 0.55;
      const actual = Math.min(a.hp, Math.max(0, amount));
      if (actual <= 0) return;
      a.hp = Math.max(0, a.hp - actual); a.damageTaken += actual;
      a.lastHurt = this.state.elapsed; a.hitFlash = 0.14; a.revealFor = 1.2;
      const owner = this.state.actors.find(b => b.id === ownerId);
      if (owner && owner.id !== a.id) {
        owner.damage += actual;
        a.damageLedger[owner.id] = { time: this.state.elapsed, damage: (a.damageLedger[owner.id]?.damage || 0) + actual };
        if (shot && !shot.hit) { shot.hit = true; owner.shotsHit++; }
        if (kind === 'attack') owner.superCharge = Math.min(1, owner.superCharge + actual / 4200);
      }
      if (kind !== 'poison' && (kind !== 'gadget' || this.state.elapsed - (a.lastFieldFeedback || -1) > 0.3)) {
        this._effect('text', a.x, a.y - a.r - 8, 0, 0.55, '#ffffff', Math.round(actual));
        this._event('hit', a.x, a.y, a.team);
        if (kind === 'gadget') a.lastFieldFeedback = this.state.elapsed;
      }
      if (a.hp <= 0) this._kill(a, owner, kind);
    }
    _kill(a, killer, kind = 'attack') {
      if (!a.alive) return;
      a.alive = false; a.hp = 0; a.deaths++; a.dashTime = 0; a.vx = 0; a.vy = 0;
      a.respawnIn = this.mode === 'showdown' || this.mode === 'knockout' ? 0 : a.isDummy ? 1.5 : 2.5;
      if (killer && killer.id !== a.id && killer.team !== a.team) killer.kills++;
      if (killer && this.mode !== 'showdown') {
        for (const [id, contribution] of Object.entries(a.damageLedger)) {
          const helper = this.state.actors.find(b => b.id === Number(id));
          if (helper && helper.id !== killer.id && helper.team === killer.team &&
            this.state.elapsed - contribution.time <= 8) helper.assists++;
        }
      }
      const feed = { id: this._uid('kill'), killerId: killer ? killer.id : null,
        victimId: a.id, team: killer ? killer.team : null, kind, time: this.state.elapsed };
      this.state.killFeed.push(feed);
      if (this.state.killFeed.length > 6) this.state.killFeed.shift();
      if (this.mode === 'bounty' && this._bountyBatch) {
        const valid = killer && killer.id !== a.id && killer.team !== a.team;
        this._bountyBatch.deaths.push({ victimId: a.id, victimTeam: a.team,
          killerId: valid ? killer.id : null, killerTeam: valid ? killer.team : null,
          x: a.x, y: a.y, feedId: feed.id });
        a.bountyValue = 2;
      }
      a.damageLedger = {}; a.shieldTime = 0; a.slowTime = 0; a.slowFactor = 1;
      this.state.fields = this.state.fields.filter(f => f.ownerId !== a.id);
      if (a.gems > 0) {
        let remaining = a.gems;
        const count = Math.min(24, Math.ceil(a.gems));
        for (let i = 0; i < count; i++) {
          const value = i === count - 1 ? remaining : Math.min(remaining, Math.ceil(a.gems / count));
          if (value <= 0) break;
          const angle = this._rand(0, TAU), d = this._rand(15, 47);
          this._pickup('gem', a.x + Math.cos(angle) * d, a.y + Math.sin(angle) * d, value);
          remaining -= value;
        }
        a.gems = 0;
      }
      if (this.mode === 'showdown') {
        const count = 1 + Math.floor(a.power / 2);
        for (let i = 0; i < count; i++) this._pickup('power', a.x + this._rand(-22, 22), a.y + this._rand(-22, 22), 1);
      }
      if (this._holdsBall(a)) {
        const ball = this.state.ball; ball.carrierId = null; ball.x = a.x; ball.y = a.y; ball.vx = 0; ball.vy = 0;
        ball.lockId = a.id; ball.lockTime = 0.3;
      }
      this._effect('explosion', a.x, a.y, 45, 0.6, a.team === this.player.team ? '#61dfee' : '#ff8e94');
      this._event('death', a.x, a.y, a.team);
      if (a.isPlayer && this.mode === 'showdown') {
        const rank = this.state.actors.filter(b => b.alive).length + 1;
        this._end(null, false, rank + '위', '생존 순위 ' + rank + ' / 8', { rank });
      }
    }
    _respawn(a) {
      a.x = a.spawnX; a.y = a.spawnY; a.alive = true; a.hp = a.maxHp;
      a.ammo = 3; a.respawnIn = 0; a.invulnerable = this.mode === 'training' ? 0 : 2; a.hitFlash = 0;
      a.shieldTime = 0; a.slowTime = 0; a.slowFactor = 1; a.damageLedger = {};
      a.lastHurt = this.state.elapsed; a.ai.path = []; a.ai.think = 0; a.dashTime = 0;
      this._effect('respawn', a.x, a.y, 42, 0.8, '#8ef6ff');
      this._event('respawn', a.x, a.y, a.team);
    }
    _collectPickups() {
      const keep = [];
      for (const p of this.state.pickups) {
        let winner = null, best = Infinity;
        for (const a of this.state.actors) if (a.alive) {
          const d = dist2(a, p);
          if (d < (a.r + p.r + 8) ** 2 && d < best) { best = d; winner = a; }
        }
        if (!winner) { keep.push(p); continue; }
        if (p.type === 'gem') { winner.gems += p.value; winner.gemsCollected += p.value; }
        else {
          winner.power += p.value; winner.maxHp += 350 * p.value;
          winner.hp = Math.min(winner.maxHp, winner.hp + 350 * p.value);
        }
        this._effect('pickup', p.x, p.y, 25, 0.35, p.type === 'gem' ? '#d8a4ff' : '#a6ff7e');
        this._event('pickup', p.x, p.y, winner.team);
      }
      this.state.pickups = keep;
    }
    _knockoutRules(dt) {
      const s = this.state, round = s.round;
      if (!round || round.phase !== 'active') return;
      const damage = (300 + round.elapsed * 9) * dt;
      for (const a of s.actors) if (a.alive && distance(a, s.zone) > s.zone.r)
        this._damageActor(a, damage, null, 'poison');
      const alive = [0, 1].map(team => s.actors.filter(a => a.alive && a.team === team));
      if (alive[0].length === 0 && alive[1].length === 0)
        this._finishKnockoutRound(null, '양 팀이 같은 전투 스텝에 전멸했습니다.');
      else if (alive[0].length === 0 || alive[1].length === 0) {
        const winner = alive[0].length === 0 ? 1 : 0;
        this._finishKnockoutRound(winner, winner === this.player.team ? '상대 팀을 전멸시켰습니다.' : '우리 팀이 전멸했습니다.');
      } else if (round.elapsed >= round.timeLimit)
        this._finishKnockoutRound(null, '75초 동안 양 팀이 생존해 라운드를 비겼습니다.');
    }
    _finishKnockoutRound(winner, reason) {
      const s = this.state, round = s.round;
      if (!round || round.phase !== 'active' || s.status !== 'playing') return;
      round.lastWinner = winner; round.lastReason = reason;
      round.history.push({ number: round.number, winner, reason, duration: round.elapsed });
      round.phase = 'break'; round.breakRemaining = 2.4;
      s.projectiles = []; s.fields = [];
      for (const a of s.actors) { a.vx = 0; a.vy = 0; a.dashTime = 0; }
      if (winner !== null) {
        s.score[winner]++;
        for (const a of s.actors) if (a.alive && a.team === winner) a.roundSurvivals++;
      }
      this._event('roundEnd', 640, 400, winner === null ? undefined : winner);
      if (winner !== null && s.score[winner] >= 2) {
        round.breakRemaining = 0;
        this._end(winner, winner === this.player.team, winner === this.player.team ? '승리!' : '다음 기회에!',
          '라운드 ' + s.score[0] + ' : ' + s.score[1] + ' · 2라운드를 먼저 이긴 팀이 승리했습니다.');
      }
    }
    _startKnockoutRound() {
      const s = this.state, round = s.round;
      if (!round || s.status !== 'playing') return;
      round.number++; round.phase = 'active'; round.elapsed = 0; round.breakRemaining = 0;
      s.projectiles = []; s.fields = []; s.pickups = []; s.effects = [];
      s.walls = []; s.bushes = []; this._wallVersion++; this._grid = null;
      this._buildMap();
      s.zone = { x: 640, y: 400, r: 770 };
      for (const a of s.actors) {
        a.alive = true; a.hp = a.maxHp; a.ammo = a.maxAmmo;
        a.x = a.spawnX; a.y = a.spawnY; a.angle = a.team === 0 ? 0 : Math.PI;
        a.respawnIn = 0; a.invulnerable = 1.4; a.hitFlash = 0;
        a.shieldTime = 0; a.slowTime = 0; a.slowFactor = 1;
        a.dashTime = 0; a.dashVX = 0; a.dashVY = 0; a.dashHitIds = [];
        a.vx = 0; a.vy = 0; a.revealFor = 0; a.shotCooldown = 0;
        a.lastHurt = s.elapsed; a.lastShot = s.elapsed; a.damageLedger = {};
        Object.assign(a.ai, { think: 0, goal: { x: a.x, y: a.y }, path: [], pathTimer: 0,
          pathVersion: this._wallVersion, targetId: null, crateId: null, knownEnemies: {},
          lastBallSpot: null, recovering: false, holdZoneId: null, safeTargetId: null,
          protectGoal: false, zoneUrgent: false, lastX: a.x, lastY: a.y, stuckTime: 0 });
      }
      this._event('roundStart', 640, 400);
    }
    _bountyRules() {
      const s = this.state, bounty = s.bounty, blue = bounty.blueStar;
      const batch = this._bountyBatch || { values: {}, blueOwner: blue.carrierId, deaths: [] };
      const previousTotal = s.score[0] + s.score[1], credits = new Map();
      for (const death of batch.deaths) {
        if (death.killerId === null) continue;
        const killer = s.actors.find(a => a.id === death.killerId);
        const victim = s.actors.find(a => a.id === death.victimId);
        if (!killer || !victim || killer.team === victim.team || killer.id === victim.id) continue;
        const stars = clamp(finite(batch.values[victim.id], 2), 2, 7);
        s.score[killer.team] += stars; killer.starsEarned += stars; victim.starsLost += stars;
        credits.set(killer.id, (credits.get(killer.id) || 0) + 1);
        const feed = s.killFeed.find(entry => entry.id === death.feedId);
        if (feed) feed.stars = stars;
      }
      for (const [id, count] of credits) {
        const killer = s.actors.find(a => a.id === id);
        killer.bountyValue = killer.alive ? Math.min(7, finite(batch.values[id], 2) + count) : 2;
      }
      // Resolve only the owner at step start. Reciprocal kills cannot chain a
      // transfer back, and a dead receiving killer keeps ownership on respawn.
      const ownerDeath = batch.blueOwner === null ? null : batch.deaths.find(death => death.victimId === batch.blueOwner);
      if (ownerDeath) {
        const receiver = ownerDeath.killerId === null ? null : s.actors.find(a => a.id === ownerDeath.killerId);
        if (receiver && receiver.team !== ownerDeath.victimTeam) {
          blue.carrierId = receiver.id; blue.team = receiver.team; blue.onGround = false;
          blue.x = receiver.x; blue.y = receiver.y;
          this._event('blueStar', blue.x, blue.y, blue.team);
        } else {
          blue.carrierId = null; blue.team = null; blue.onGround = true;
          blue.x = ownerDeath.x; blue.y = ownerDeath.y;
          this._event('blueStar', blue.x, blue.y);
        }
      }
      if (blue.onGround) {
        blue.carrierId = null; blue.team = null;
        const candidates = s.actors.filter(a => a.alive && a.invulnerable <= 0 &&
          dist2(a, blue) <= (a.r + blue.r) ** 2).sort((a, b) => dist2(a, blue) - dist2(b, blue) || a.id - b.id);
        if (candidates.length) {
          const collector = candidates[0];
          blue.carrierId = collector.id; blue.team = collector.team; blue.onGround = false;
          if (!blue.firstClaimed) {
            blue.firstClaimed = true; s.score[collector.team]++; collector.starsEarned++;
          }
          this._event('blueStar', collector.x, collector.y, collector.team);
        }
      }
      if (!blue.onGround) {
        const holder = s.actors.find(a => a.id === blue.carrierId);
        if (holder) { blue.x = holder.x; blue.y = holder.y; blue.team = holder.team; }
      }
      if (s.score[0] + s.score[1] !== previousTotal) this._event('bountyScore', 640, 400);
      this._bountyBatch = null;
      if (s.score.some(score => score >= bounty.target)) this._finishBounty('목표 별 ' + bounty.target + '개 도달');
    }
    _finishBounty(cause) {
      const s = this.state, blue = s.bounty.blueStar;
      let winner = s.score[0] === s.score[1] ? null : s.score[0] > s.score[1] ? 0 : 1;
      let reason = cause + ' · 별 ' + s.score[0] + ' : ' + s.score[1];
      if (winner === null && !blue.onGround && (blue.team === 0 || blue.team === 1)) {
        winner = blue.team;
        reason += ' 동률 · 파란 별을 보유한 ' + (winner === this.player.team ? '우리 팀' : '상대 팀') + '이 승리했습니다.';
      } else if (winner === null) reason += ' 동률 · 파란 별 소유 팀이 없어 무승부입니다.';
      this._end(winner, winner === this.player.team, winner === null ? '무승부' : winner === this.player.team ? '승리!' : '다음 기회에!', reason);
    }
    _hotzoneRules(dt) {
      const s = this.state;
      for (const zone of s.captureZones) {
        const occupants = [[], []];
        for (const a of s.actors) if (a.alive && a.invulnerable <= 0 &&
          (a.team === 0 || a.team === 1) && distance(a, zone) <= zone.r) occupants[a.team].push(a);
        zone.occupants = occupants.map(list => list.length);
        for (let team = 0; team < 2; team++) {
          const before = zone.progress[team];
          if (!occupants[team].length || before >= 100) continue;
          const rate = 100 / zone.captureSeconds;
          const after = Math.min(100, before + dt * rate);
          zone.progress[team] = after >= 100 - 1e-9 ? 100 : after;
          const capturedTime = Math.min(dt, (100 - before) / rate);
          for (const a of occupants[team]) a.captureTime += capturedTime;
          if (zone.progress[team] === 100) this._event('capture', zone.x, zone.y, team);
        }
      }
      s.score = [0, 1].map(team => s.captureZones.reduce((total, z) => total + z.progress[team], 0) / s.captureZones.length);
      const finished = [0, 1].filter(team => s.captureZones.length > 0 && s.captureZones.every(z => z.progress[team] >= 100));
      if (finished.length === 2) this._end(null, false, '무승부', '양 팀이 같은 순간에 두 구역 점유를 완료했습니다.');
      else if (finished.length === 1) {
        const winner = finished[0];
        this._end(winner, winner === this.player.team, winner === this.player.team ? '승리!' : '다음 기회에!', 'A와 B 구역의 점유를 모두 완료했습니다.');
      }
    }
    _heistRules() {
      const s = this.state;
      const safes = [0, 1].map(team => s.safes.find(safe => safe.team === team));
      s.score = safes.map(safe => safe ? safe.hp / safe.maxHp * 100 : 0);
      const destroyed = safes.map(safe => !safe || safe.hp <= 0);
      if (destroyed[0] && destroyed[1]) this._end(null, false, '무승부', '양 팀 금고가 같은 순간에 파괴되었습니다.');
      else if (destroyed[0] || destroyed[1]) {
        const winner = destroyed[0] ? 1 : 0;
        this._end(winner, winner === this.player.team, winner === this.player.team ? '승리!' : '다음 기회에!',
          winner === this.player.team ? '상대 금고를 파괴했습니다.' : '우리 금고가 파괴되었습니다.');
      }
    }
    _gemRules(dt) {
      const s = this.state;
      this._gemTimer -= dt;
      if (this._gemTimer <= 0) {
        this._gemTimer += 3.5;
        if (s.pickups.filter(p => p.type === 'gem').length < 18) {
          const angle = this._rand(0, TAU), r = this._rand(8, 25);
          this._pickup('gem', 640 + Math.cos(angle) * r, 400 + Math.sin(angle) * r, 1);
          this._effect('pickup', 640, 400, 35, 0.5, '#b47cff');
        }
      }
      s.score = [0, 0];
      for (const a of s.actors) if (a.alive) s.score[a.team] += a.gems;
      let leader = -1;
      if (s.score[0] >= 10 && s.score[0] > s.score[1]) leader = 0;
      if (s.score[1] >= 10 && s.score[1] > s.score[0]) leader = 1;
      if (leader < 0) s.countdown = null;
      else if (!s.countdown || s.countdown.team !== leader) {
        s.countdown = { team: leader, remaining: 15 };
        this._event('countdown', 640, 400, leader);
      } else {
        s.countdown.remaining = Math.max(0, s.countdown.remaining - dt);
        if (s.countdown.remaining <= 0) this._end(leader, leader === this.player.team,
          leader === this.player.team ? '승리!' : '다음 기회에!', '크리스털 우세를 15초 동안 지켰습니다.');
      }
    }
    _resetBall() {
      this.state.ball = { x: 640, y: 400, vx: 0, vy: 0, carrierId: null, r: 11,
        lastTouchTeam: null, lastTouchId: null, lockId: null, lockTime: 0, powerful: false, muzzleDistance: 0 };
    }
    _kickBall(a, strong) {
      if (!strong && a.ammo < 1) return;
      if (strong) a.superCharge = 0; else a.ammo -= 1;
      const b = this.state.ball, speed = strong ? 1390 : 1080;
      b.carrierId = null; b.x = a.x; b.y = a.y; b.muzzleDistance = a.r + 16;
      b.vx = Math.cos(a.angle) * speed; b.vy = Math.sin(a.angle) * speed;
      b.lastTouchId = a.id; b.lastTouchTeam = a.team; b.lockId = a.id; b.lockTime = 0.4;
      b.powerful = strong; a.lastShot = this.state.elapsed; a.revealFor = 1.5;
      a.invulnerable = 0; a.shotCooldown = 0.35;
      this._event(strong ? 'super' : 'kick', a.x, a.y, a.team);
      this._effect('shot', b.x, b.y, strong ? 35 : 20, 0.25, '#fff4b1');
    }
    _goalCrossing(ax, ay, bx, by, radius) {
      const crossings = [];
      for (const [line, team, outward] of [[24, 1, -1], [W - 24, 0, 1]]) {
        const dx = bx - ax;
        if (dx * outward <= 0) continue;
        if ((ax - line) * outward > 0 || (bx - line) * outward < 0) continue;
        const t = (line - ax) / dx, y = ay + (by - ay) * t;
        if (t >= 0 && t <= 1 && y >= 278 + radius && y <= 522 - radius) crossings.push({ t, team });
      }
      crossings.sort((a, b) => a.t - b.t);
      return crossings[0] || null;
    }
    _moveFreeBall(b, dt) {
      const speed = Math.hypot(b.vx, b.vy);
      let remaining = dt + (speed > 0 ? finite(b.muzzleDistance) / speed : 0);
      b.muzzleDistance = 0;
      for (let i = 0; i < 5 && remaining > 1e-7; i++) {
        const ox = b.x, oy = b.y, nx = ox + b.vx * remaining, ny = oy + b.vy * remaining;
        let hit = null;
        for (const w of this.state.walls) if (w.hp > 0) {
          const t = segmentRect(ox, oy, nx, ny, w, b.r);
          if (t !== null && (!hit || t < hit.t)) hit = { t, wall: w };
        }
        for (const a of this.state.actors) if (a.alive && !(a.id === b.lockId && b.lockTime > 0)) {
          const t = segmentCircle(ox, oy, nx, ny, a.x, a.y, a.r + b.r + 3);
          if (t !== null && (!hit || t < hit.t)) hit = { t, actor: a };
        }
        const goal = this._goalCrossing(ox, oy, nx, ny, b.r);
        if (goal && (!hit || goal.t <= hit.t)) { this._goal(goal.team); return true; }
        if (!hit) { b.x = nx; b.y = ny; break; }
        b.x = ox + (nx - ox) * hit.t; b.y = oy + (ny - oy) * hit.t;
        if (hit.actor) {
          b.carrierId = hit.actor.id; b.lastTouchId = hit.actor.id; b.lastTouchTeam = hit.actor.team;
          b.vx = 0; b.vy = 0; b.powerful = false;
          this._event('pickup', hit.actor.x, hit.actor.y, hit.actor.team);
          return false;
        }
        const w = hit.wall, u = unit(b.vx, b.vy);
        remaining *= Math.max(0, 1 - hit.t);
        if (b.powerful && w.destructible) {
          this._damageWall(w, w.hp); b.vx *= 0.85; b.vy *= 0.85;
          b.x += u.x * 0.1; b.y += u.y * 0.1;
        } else {
          const edges = [
            { distance: Math.abs(b.x - (w.x - b.r)), axis: 'x', direction: -1 },
            { distance: Math.abs(b.x - (w.x + w.w + b.r)), axis: 'x', direction: 1 },
            { distance: Math.abs(b.y - (w.y - b.r)), axis: 'y', direction: -1 },
            { distance: Math.abs(b.y - (w.y + w.h + b.r)), axis: 'y', direction: 1 }
          ].sort((a, b) => a.distance - b.distance);
          const normal = edges[0];
          if (normal.axis === 'x') { b.x += normal.direction * 0.25; b.vx *= -0.7; }
          else { b.y += normal.direction * 0.25; b.vy *= -0.7; }
          if (hit.t === 0) remaining = Math.max(0, remaining - 0.001);
        }
      }
      return false;
    }
    _ballRules(dt) {
      const s = this.state, b = s.ball;
      if (!b) return;
      b.lockTime = Math.max(0, finite(b.lockTime) - dt);
      const oldX = b.x, oldY = b.y;
      if (b.carrierId !== null) {
        const a = s.actors.find(a => a.id === b.carrierId && a.alive);
        if (a) {
          b.x = a.x + Math.cos(a.angle) * (a.r + 9); b.y = a.y + Math.sin(a.angle) * (a.r + 9);
          b.vx = a.vx; b.vy = a.vy;
          const goal = this._goalCrossing(oldX, oldY, b.x, b.y, b.r);
          if (goal) { this._goal(goal.team); return; }
        } else b.carrierId = null;
      } else {
        if (this._moveFreeBall(b, dt)) return;
        const drag = Math.exp(-0.72 * dt); b.vx *= drag; b.vy *= drag;
        if (b.y < b.r + 5 || b.y > H - b.r - 5) { b.y = clamp(b.y, b.r + 5, H - b.r - 5); b.vy *= -0.75; }
      }
      // A stationary ball already in the goal is valid (including resumed/test states).
      if (Math.abs(b.vx) + Math.abs(b.vy) < 0.001 && b.y >= 278 + b.r && b.y <= 522 - b.r &&
        (b.x <= 24 || b.x >= W - 24)) { this._goal(b.x >= W - 24 ? 0 : 1); return; }
      if (b.x < b.r + 5 || b.x > W - b.r - 5) { b.x = clamp(b.x, b.r + 5, W - b.r - 5); b.vx *= -0.75; }
      if (b.carrierId === null) {
        let nearest = null, d0 = Infinity;
        for (const a of s.actors) if (a.alive && !(a.id === b.lockId && b.lockTime > 0)) {
          const d = dist2(a, b);
          if (d < (a.r + b.r + 5) ** 2 && d < d0) { nearest = a; d0 = d; }
        }
        if (nearest) {
          b.carrierId = nearest.id; b.lastTouchId = nearest.id; b.lastTouchTeam = nearest.team;
          b.vx = 0; b.vy = 0; b.powerful = false;
          this._event('pickup', nearest.x, nearest.y, nearest.team);
        }
      }
    }
    _goal(team) {
      const s = this.state;
      if (s.status !== 'playing' || s.goalPause > 0) return;
      const scorer = s.actors.find(a => a.id === s.ball.lastTouchId && a.team === team);
      if (scorer) scorer.goals++;
      s.score[team]++;
      this._effect('goal', team === 0 ? 1215 : 65, 400, 190, 2, team === 0 ? '#77e8ef' : '#ffabb1', 'GOAL!');
      this._event('goal', team === 0 ? 1215 : 65, 400, team);
      s.projectiles = []; s.fields = [];
      for (const a of s.actors) { a.shieldTime = 0; a.slowTime = 0; a.slowFactor = 1; a.dashTime = 0; }
      this._resetBall();
      if (s.overtime || s.score[team] >= 2) this._end(team, team === this.player.team,
        team === this.player.team ? '승리!' : '다음 기회에!', s.overtime ? '연장전의 결정적인 골로 승리했습니다.' : '2골을 먼저 넣은 팀이 승리했습니다.');
      else s.goalPause = 2;
    }
    _resetAfterGoal() {
      this.state.fields = [];
      for (const a of this.state.actors) {
        this._respawn(a); a.lastShot = this.state.elapsed; a.invulnerable = 1.1;
      }
      this._resetBall();
    }
    _startOvertime() {
      const s = this.state;
      if (s.overtime || s.status !== 'playing') return;
      s.overtime = true; s.timeLimit = 180 + s.overtimeDuration;
      s.walls = []; s.bushes = []; s.projectiles = []; s.fields = []; s.goalPause = 0;
      this._wallVersion++; this._grid = null;
      this._resetAfterGoal();
      this._effect('goal', 640, 400, 200, 2, '#ffd17d', 'SUDDEN DEATH');
      this._event('overtime', 640, 400);
    }
    _showdownRules(dt) {
      const s = this.state, z = s.zone;
      const damage = 180 + s.elapsed * 4.5;
      for (const a of s.actors) if (a.alive && distance(a, z) > z.r)
        this._damageActor(a, damage * dt, null, 'poison');
      if (s.status !== 'playing') return;
      const survivors = s.actors.filter(a => a.alive);
      if (survivors.length <= 1) {
        const winner = survivors[0];
        this._end(winner ? winner.team : null, Boolean(winner && winner.isPlayer),
          winner && winner.isPlayer ? '최후의 생존자!' : '경기 종료', '마지막까지 살아남았습니다.', { rank: winner && winner.isPlayer ? 1 : 2 });
      }
    }
    _timeEnd() {
      const s = this.state;
      if (s.status !== 'playing') return;
      if (this.mode === 'training') return;
      if (this.mode === 'bounty') { this._finishBounty('120초 제한 시간 종료'); return; }
      if (this.mode === 'knockout') {
        const winner = s.score[0] === s.score[1] ? null : s.score[0] > s.score[1] ? 0 : 1;
        this._end(winner, winner === this.player.team, winner === null ? '무승부' : winner === this.player.team ? '승리!' : '다음 기회에!',
          '240초 전체 제한 시간 종료 · 라운드 승수 ' + s.score[0] + ' : ' + s.score[1] + '로 판정했습니다.');
        return;
      }
      if (this.mode === 'ball' && !s.overtime && s.score[0] === s.score[1]) { this._startOvertime(); return; }
      if (this.mode === 'hotzone' || this.mode === 'heist') {
        const values = this.mode === 'hotzone' ? [0, 1].map(team => s.captureZones.reduce((sum, z) => sum + z.progress[team], 0)) :
          [0, 1].map(team => { const safe = s.safes.find(safe => safe.team === team); return safe ? safe.hp / safe.maxHp : 0; });
        const winner = values[0] === values[1] ? null : values[0] > values[1] ? 0 : 1;
        const reason = this.mode === 'hotzone' ? '제한 시간 종료 · 두 구역의 실제 점유 합계로 판정했습니다.' : '제한 시간 종료 · 금고의 실제 남은 체력 비율로 판정했습니다.';
        this._end(winner, winner === this.player.team, winner === null ? '무승부' : winner === this.player.team ? '승리!' : '다음 기회에!', reason);
        return;
      }
      if (this.mode === 'showdown') {
        const alive = s.actors.filter(a => a.alive).sort((a, b) =>
          b.hp / b.maxHp - a.hp / a.maxHp || b.power - a.power || a.id - b.id);
        const rank = Math.max(1, alive.indexOf(this.player) + 1);
        this._end(alive[0] ? alive[0].team : null, alive[0] === this.player,
          alive[0] === this.player ? '생존 승리!' : rank + '위', '제한 시간: 생존 체력 비율과 파워로 순위를 결정했습니다.', { rank });
      } else {
        const winner = s.score[0] === s.score[1] ? null : (s.score[0] > s.score[1] ? 0 : 1);
        this._end(winner, winner === this.player.team, winner === null ? '무승부' : (winner === this.player.team ? '승리!' : '다음 기회에!'),
          '제한 시간 종료 · ' + s.score[0] + ' : ' + s.score[1]);
      }
    }
    _end(winner, won, title, reason, extra = {}) {
      if (this.state.status !== 'playing') return;
      this.state.status = 'ended'; this.state.countdown = null;
      this.state.result = Object.assign({ winner, won, title, reason }, extra);
      this._event(won ? 'win' : 'end', this.player.x, this.player.y, this.player.team);
    }
    _inBush(a) { return this.state.bushes.some(b => a.x >= b.x && a.x <= b.x + b.w && a.y >= b.y && a.y <= b.y + b.h); }
    _visibleTo(target, observer) {
      return !this._inBush(target) || target.revealFor > 0 || distance(target, observer) < 155;
    }
    _visibility() {
      const p = this.player;
      const observers = this.mode === 'knockout' && !p.alive ? this.state.actors.filter(a => a.alive && a.team === p.team) : [p];
      for (const a of this.state.actors) a.hidden = a.alive && a.team !== p.team && !observers.some(observer => this._visibleTo(a, observer));
    }

    getAutoAim(actorId = 0) {
      const a = this.state.actors.find(a => a.id === actorId) || this.player;
      const h = HEROES[a.hero];
      if (this.mode === 'knockout' && !a.alive)
        return { x: a.x + Math.cos(a.angle) * h.range, y: a.y + Math.sin(a.angle) * h.range, targetId: null, kind: 'forward' };
      if (this._holdsBall(a)) return { x: a.team === 0 ? 1270 : 10, y: this._bestGoalY(a), targetId: null, kind: 'goal' };
      const candidates = this.state.actors.filter(b => b.alive && b.id !== a.id && b.team !== a.team &&
        !(a.isPlayer && b.hidden) && this._visibleTo(b, a) && distance(a, b) <= h.range + b.r &&
        this._shotLineClear(a, b.x, b.y, h.projectileRadius));
      const aimCost = b => distance(a, b) + b.hp / b.maxHp * 28 - (this.mode === 'bounty' ? b.bountyValue * 25 : 0);
      candidates.sort((b, c) => aimCost(b) - aimCost(c) || b.id - c.id);
      if (candidates.length) {
        const target = candidates[0], lead = Math.min(0.4, distance(a, target) / h.shotSpeed) * 0.6;
        let x = clamp(target.x + target.vx * lead, target.r, W - target.r);
        let y = clamp(target.y + target.vy * lead, target.r, H - target.r);
        if (!this._shotLineClear(a, x, y, h.projectileRadius) || Math.hypot(x - a.x, y - a.y) > h.range + target.r) { x = target.x; y = target.y; }
        return { x, y, targetId: target.id, kind: 'enemy' };
      }
      if (this.mode === 'showdown') {
        const crates = this.state.walls.filter(w => w.hp > 0 && w.destructible && w.dropPower &&
          Math.hypot(w.x + w.w / 2 - a.x, w.y + w.h / 2 - a.y) <= h.range &&
          this._lineClear(a.x, a.y, w.x + w.w / 2, w.y + w.h / 2, h.projectileRadius, w.id));
        crates.sort((b, c) => Math.hypot(b.x + b.w / 2 - a.x, b.y + b.h / 2 - a.y) - Math.hypot(c.x + c.w / 2 - a.x, c.y + c.h / 2 - a.y));
        if (crates[0]) { const w = crates[0]; return { x: w.x + w.w / 2, y: w.y + w.h / 2, targetId: w.id, kind: 'crate' }; }
      }
      if (this.mode === 'heist') {
        const safe = this.state.safes.find(s => s.team !== a.team && s.hp > 0 && s.shieldTime <= 0 &&
          distance(a, s) <= h.range + s.r && this._shotLineClear(a, s.x, s.y, h.projectileRadius, s.id));
        if (safe) return { x: safe.x, y: safe.y, targetId: safe.id, kind: 'safe' };
      }
      return { x: a.x + Math.cos(a.angle) * h.range, y: a.y + Math.sin(a.angle) * h.range, targetId: null, kind: 'forward' };
    }

    /* Bots use objective decisions plus cached eight-way A* around solid cover. */
    _lineClear(ax, ay, bx, by, pad = 2, ignoreWallId = null) {
      return !this.state.walls.some(w => w.hp > 0 && w.id !== ignoreWallId && segmentRect(ax, ay, bx, by, w, pad) !== null);
    }
    _shotLineClear(a, x, y, radius, ignoreSafeId = null) {
      return this._lineClear(a.x, a.y, x, y, radius) && !this.state.safes.some(s => s.hp > 0 &&
        s.team !== a.team && s.id !== ignoreSafeId && segmentCircle(a.x, a.y, x, y, s.x, s.y, s.r + radius) !== null);
    }
    _movementLineClear(ax, ay, bx, by, radius) {
      return this._lineClear(ax, ay, bx, by, radius) && !this.state.safes.some(s => s.hp > 0 &&
        segmentCircle(ax, ay, bx, by, s.x, s.y, s.r + radius) !== null);
    }
    _navGrid() {
      if (this._grid && this._grid.version === this._wallVersion) return this._grid;
      const size = 32, cols = 40, rows = 25, open = new Uint8Array(cols * rows);
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const px = (x + 0.5) * size, py = (y + 0.5) * size;
        open[y * cols + x] = px >= 26 && py >= 26 && px <= W - 26 && py <= H - 26 &&
          !this.state.walls.some(w => w.hp > 0 && circleRect(px, py, 26, w)) &&
          !this.state.safes.some(s => s.hp > 0 && Math.hypot(px - s.x, py - s.y) < s.r + 26) ? 1 : 0;
      }
      this._grid = { size, cols, rows, open, version: this._wallVersion };
      return this._grid;
    }
    _nearestIndex(x, y, grid) {
      const cx = clamp(Math.floor(x / grid.size), 0, grid.cols - 1), cy = clamp(Math.floor(y / grid.size), 0, grid.rows - 1);
      let best = cy * grid.cols + cx, d = Infinity;
      if (grid.open[best]) return best;
      for (let radius = 1; radius < 12; radius++) {
        for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || nx >= grid.cols || ny < 0 || ny >= grid.rows) continue;
          const index = ny * grid.cols + nx, nd = dx * dx + dy * dy;
          if (grid.open[index] && nd < d) { d = nd; best = index; }
        }
        if (d < Infinity) break;
      }
      return best;
    }
    _nearestFree(x, y) {
      const g = this._navGrid(), i = this._nearestIndex(x, y, g);
      return { x: (i % g.cols + 0.5) * g.size, y: (Math.floor(i / g.cols) + 0.5) * g.size };
    }
    _pathTo(a, goal) {
      const g = this._navGrid(), start = this._nearestIndex(a.x, a.y, g), end = this._nearestIndex(goal.x, goal.y, g);
      if (start === end) return [this._nearestFree(goal.x, goal.y)];
      const count = g.cols * g.rows, cost = new Float32Array(count), previous = new Int16Array(count), closed = new Uint8Array(count);
      cost.fill(Infinity); previous.fill(-1); cost[start] = 0;
      const heap = [], ex = end % g.cols, ey = Math.floor(end / g.cols);
      const heuristic = i => Math.hypot(i % g.cols - ex, Math.floor(i / g.cols) - ey);
      const push = (id, score) => {
        let pos = heap.length; heap.push({ id, score });
        while (pos > 0) { const par = (pos - 1) >> 1; if (heap[par].score <= score) break; heap[pos] = heap[par]; pos = par; }
        heap[pos] = { id, score };
      };
      const pop = () => {
        const first = heap[0], last = heap.pop();
        if (heap.length) {
          let pos = 0;
          while (pos * 2 + 1 < heap.length) {
            let child = pos * 2 + 1;
            if (child + 1 < heap.length && heap[child + 1].score < heap[child].score) child++;
            if (heap[child].score >= last.score) break;
            heap[pos] = heap[child]; pos = child;
          }
          heap[pos] = last;
        }
        return first.id;
      };
      push(start, heuristic(start));
      let found = false, iterations = 0;
      while (heap.length && iterations++ < 1500) {
        const current = pop();
        if (closed[current]) continue;
        if (current === end) { found = true; break; }
        closed[current] = 1;
        const x = current % g.cols, y = Math.floor(current / g.cols);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= g.cols || ny >= g.rows) continue;
          const next = ny * g.cols + nx;
          if (!g.open[next] || closed[next]) continue;
          if (dx && dy && (!g.open[y * g.cols + nx] || !g.open[ny * g.cols + x])) continue;
          const value = cost[current] + (dx && dy ? 1.414214 : 1);
          if (value < cost[next]) { cost[next] = value; previous[next] = current; push(next, value + heuristic(next)); }
        }
      }
      if (!found) return [this._nearestFree(goal.x, goal.y)];
      const path = [];
      for (let i = end; i !== start && i >= 0; i = previous[i]) path.push({ x: (i % g.cols + 0.5) * g.size, y: (Math.floor(i / g.cols) + 0.5) * g.size });
      path.reverse();
      return path;
    }
    _steer(a, goal, dt) {
      const ai = a.ai;
      if (this._movementLineClear(a.x, a.y, goal.x, goal.y, a.r + 4)) return unit(goal.x - a.x, goal.y - a.y);
      ai.pathTimer -= dt;
      if (ai.pathTimer <= 0 || !ai.path.length || ai.pathVersion !== this._wallVersion) {
        ai.path = this._pathTo(a, goal); ai.pathTimer = 0.62 + a.id * 0.025; ai.pathVersion = this._wallVersion;
      }
      while (ai.path.length > 1 && distance(a, ai.path[0]) < 24) ai.path.shift();
      for (let i = Math.min(5, ai.path.length - 1); i > 0; i--) {
        if (this._movementLineClear(a.x, a.y, ai.path[i].x, ai.path[i].y, a.r + 3)) { ai.path.splice(0, i); break; }
      }
      const point = ai.path[0] || goal;
      return unit(point.x - a.x, point.y - a.y);
    }
    _botThink(a) {
      const s = this.state, ai = a.ai;
      const enemies = s.actors.filter(b => b.alive && b.team !== a.team && this._visibleTo(b, a));
      enemies.sort((x, y) => distance(a, x) - distance(a, y));
      if (this.mode === 'bounty') enemies.sort((x, y) => distance(a, x) - x.bountyValue * 40 - distance(a, y) + y.bountyValue * 40 || x.id - y.id);
      for (const b of enemies) ai.knownEnemies[b.id] = { x: b.x, y: b.y, gems: b.gems, seenAt: s.elapsed };
      for (const id of Object.keys(ai.knownEnemies)) if (s.elapsed - ai.knownEnemies[id].seenAt > 5) delete ai.knownEnemies[id];
      ai.targetId = enemies[0] && distance(a, enemies[0]) < 760 ? enemies[0].id : null;
      ai.crateId = null;
      ai.protectGoal = false;
      ai.zoneUrgent = false;
      ai.holdZoneId = null;
      ai.safeTargetId = null;
      const target = enemies[0], h = HEROES[a.hero];
      const enemyClose = target && distance(a, target) < 360;
      let goal = { x: 640, y: 400 };
      if (this.mode === 'knockout') {
        const z = s.zone, safeRadius = Math.max(10, z.r - 65);
        if (distance(a, z) > safeRadius) {
          const u = unit(a.x - z.x, a.y - z.y);
          goal = { x: z.x + u.x * Math.max(0, safeRadius - 55), y: z.y + u.y * Math.max(0, safeRadius - 55) };
          ai.protectGoal = true; ai.zoneUrgent = true;
        } else {
          if (target) {
            const away = unit(a.x - target.x, a.y - target.y), range = h.range * (a.hero === 'tank' ? 0.55 : 0.72);
            goal = { x: target.x + away.x * range, y: target.y + away.y * range };
          } else goal = { x: 640 + (a.team === 0 ? -120 : 120), y: 300 + a.id % 3 * 100 };
          if (distance(goal, z) > safeRadius) {
            const u = unit(goal.x - z.x, goal.y - z.y); goal = { x: z.x + u.x * safeRadius, y: z.y + u.y * safeRadius };
          }
        }
      } else if (this.mode === 'bounty') {
        const blue = s.bounty.blueStar;
        const leadingLate = s.elapsed >= 80 && s.score[a.team] > s.score[1 - a.team];
        const protect = a.bountyValue >= 5 || blue.carrierId === a.id || leadingLate;
        if (protect) {
          goal = { x: a.team === 0 ? 285 : 995, y: 270 + a.id % 3 * 130 };
          ai.protectGoal = true;
        } else if (blue.onGround) {
          const collectors = s.actors.filter(b => b.alive && b.team === a.team &&
            (!b.isPlayer || distance(b, blue) < 220)).sort((x, y) => distance(x, blue) - distance(y, blue) || x.id - y.id);
          goal = collectors[0] === a ? { x: blue.x, y: blue.y } :
            { x: blue.x + (a.team === 0 ? -100 : 100), y: clamp(blue.y + (a.id % 2 ? -100 : 100), 110, 690) };
        } else if (target) {
          const away = unit(a.x - target.x, a.y - target.y);
          goal = { x: target.x + away.x * h.range * 0.55, y: target.y + away.y * h.range * 0.55 };
        } else goal = { x: a.team === 0 ? 505 : 775, y: 260 + a.id % 3 * 140 };
      } else if (this.mode === 'hotzone') {
        const unfinished = s.captureZones.filter(zone => zone.progress[a.team] < 100);
        const cost = zone => {
          const assigned = s.actors.filter(b => b.alive && b.team === a.team && b.id !== a.id &&
            (b.ai.holdZoneId === zone.id || distance(b, zone) < zone.r)).length;
          const preferred = s.captureZones[a.id % 2];
          return distance(a, zone) + assigned * 210 + zone.progress[a.team] * 1.6 - (preferred === zone ? 35 : 0);
        };
        unfinished.sort((x, y) => cost(x) - cost(y));
        const zone = unfinished[0];
        if (zone) {
          ai.holdZoneId = zone.id; ai.protectGoal = true;
          if (distance(a, zone) < zone.r * 0.62) goal = { x: a.x, y: a.y };
          else goal = { x: zone.x + (a.team === 0 ? -30 : 30), y: zone.y + (a.id % 3 - 1) * 22 };
        }
      } else if (this.mode === 'heist') {
        const own = s.safes.find(safe => safe.team === a.team);
        const enemy = s.safes.find(safe => safe.team !== a.team && safe.hp > 0);
        const direction = a.team === 0 ? 1 : -1;
        const threats = own ? enemies.filter(b => distance(b, own) < 390).sort((x, y) => distance(x, own) - distance(y, own)) : [];
        const defender = a.id % 3 === 1 || (own && own.hp < own.maxHp * 0.3 && threats.length >= 2 && a.id % 3 === 2);
        if (defender && own) {
          if (threats.length) {
            const threat = threats[0]; ai.targetId = threat.id;
            goal = { x: clamp(threat.x - direction * h.range * 0.4, own.x - 80, own.x + 80), y: clamp(threat.y, 130, 670) };
            goal.x = own.x + direction * Math.max(100, Math.min(245, Math.abs(threat.x - own.x) * 0.55));
          } else goal = { x: own.x + direction * 255, y: 400 + (a.id % 2 ? -105 : 105) };
        } else if (enemy) {
          const standOff = Math.min(h.range * 0.65, 320) + enemy.r;
          // One attacker pressures the central firing lane; the other flanks the
          // side cover instead of being held indefinitely in the same skirmish.
          goal = a.id % 3 === 2 ? { x: enemy.x - direction * 115, y: a.team === 0 ? 220 : 580 } :
            { x: enemy.x - direction * standOff, y: enemy.y - 58 };
          ai.safeTargetId = enemy.id;
          ai.protectGoal = true;
        }
      } else if (this.mode === 'gem') {
        const teamScore = s.score[a.team], enemyScore = s.score[1 - a.team];
        const carrier = a.gems >= 5 || (teamScore >= 10 && a.gems > 0 && teamScore > enemyScore);
        if (carrier) {
          goal = { x: a.team === 0 ? 155 : 1125, y: 400 + Math.sin(ai.phase) * 115 };
          ai.protectGoal = true;
        } else if (s.countdown && s.countdown.team !== a.team) {
          const enemyCarrier = enemies.slice().sort((x, y) => y.gems - x.gems)[0];
          if (enemyCarrier) { goal = { x: enemyCarrier.x, y: enemyCarrier.y }; ai.targetId = enemyCarrier.id; }
          else {
            const lastSeen = Object.values(ai.knownEnemies).sort((x, y) => y.gems - x.gems || y.seenAt - x.seenAt)[0];
            if (lastSeen) goal = { x: lastSeen.x, y: lastSeen.y };
          }
        } else if (s.countdown && s.countdown.team === a.team) {
          goal = { x: a.team === 0 ? 420 : 860, y: 250 + a.id % 3 * 150 };
        } else {
          const gems = s.pickups.filter(p => p.type === 'gem');
          const cost = p => distance(a, p) + s.actors.filter(b => b.alive && b.team === a.team && b.id !== a.id &&
            distance(b, p) + 45 < distance(a, p)).length * 145;
          gems.sort((p, q) => cost(p) - cost(q));
          if (gems.length) goal = { x: gems[0].x, y: gems[0].y };
          else goal = { x: 640 + (a.team === 0 ? -45 : 45), y: 325 + a.id % 3 * 75 };
        }
      } else if (this.mode === 'ball') {
        const b = s.ball, direction = a.team === 0 ? 1 : -1;
        const rawCarrier = s.actors.find(p => p.id === b.carrierId && p.alive);
        const hiddenCarrier = rawCarrier && rawCarrier.team !== a.team && !this._visibleTo(rawCarrier, a);
        const carrier = hiddenCarrier ? null : rawCarrier;
        if (!hiddenCarrier) ai.lastBallSpot = { x: b.x, y: b.y, time: s.elapsed };
        if (carrier && carrier.id === a.id) {
          goal = { x: a.team === 0 ? 1238 : 42, y: this._bestGoalY(a) };
          ai.protectGoal = true;
        } else if (carrier && carrier.team === a.team) {
          goal = { x: clamp(carrier.x + direction * 150, 80, 1200), y: clamp(carrier.y + (a.id % 2 ? -115 : 115), 100, 700) };
        } else if (carrier) {
          goal = { x: carrier.x + carrier.vx * 0.25, y: carrier.y + carrier.vy * 0.25 }; ai.targetId = carrier.id;
        } else if (hiddenCarrier) {
          const lastSeen = ai.lastBallSpot && s.elapsed - ai.lastBallSpot.time < 5 ? ai.lastBallSpot : { x: 640, y: 400 };
          goal = { x: lastSeen.x, y: lastSeen.y };
        } else {
          const friends = s.actors.filter(p => p.alive && p.team === a.team).sort((x, y) => distance(x, b) - distance(y, b));
          goal = friends[0] === a ? { x: b.x + b.vx * 0.12, y: b.y + b.vy * 0.12 } :
            { x: clamp(b.x + direction * (a.id % 2 ? 75 : -100), 90, 1190), y: clamp(b.y + (a.id % 2 ? -120 : 120), 100, 700) };
        }
      } else if (this.mode === 'showdown') {
        const z = s.zone, d = distance(a, z), safeRadius = Math.max(0, z.r - 65);
        if (d > safeRadius) {
          const u = unit(a.x - z.x, a.y - z.y);
          goal = { x: z.x + u.x * Math.max(0, safeRadius - 60), y: z.y + u.y * Math.max(0, safeRadius - 60) };
          ai.protectGoal = true;
          ai.zoneUrgent = true;
        } else {
          const powers = s.pickups.filter(p => p.type === 'power' && distance(p, z) < z.r - 20);
          powers.sort((p, q) => distance(a, p) - distance(a, q));
          if (powers.length && (!enemyClose || distance(a, powers[0]) < 145)) goal = { x: powers[0].x, y: powers[0].y };
          else if (target) goal = { x: target.x, y: target.y };
          else goal = { x: 640 + Math.cos(ai.phase + s.elapsed * 0.12) * Math.min(180, z.r * 0.4),
            y: 400 + Math.sin(ai.phase + s.elapsed * 0.12) * Math.min(150, z.r * 0.4) };
          if (!enemyClose && a.power < 5) {
            const crates = s.walls.filter(w => w.hp > 0 && w.dropPower);
            crates.sort((p, q) => distance(a, { x: p.x + p.w / 2, y: p.y + p.h / 2 }) - distance(a, { x: q.x + q.w / 2, y: q.y + q.h / 2 }));
            if (crates[0]) {
              const c = crates[0], cp = { x: c.x + c.w / 2, y: c.y + c.h / 2 };
              if (distance(a, cp) < 330 && distance(cp, z) < z.r - 30 && (!powers.length || distance(a, powers[0]) > 190)) {
                ai.crateId = c.id; const u = unit(a.x - cp.x, a.y - cp.y);
                goal = { x: cp.x + u.x * Math.min(h.range * 0.55, 180), y: cp.y + u.y * Math.min(h.range * 0.55, 180) };
              }
            }
          }
        }
      }
      if (a.hp / a.maxHp < 0.28) ai.recovering = true;
      else if (a.hp / a.maxHp > 0.72) ai.recovering = false;
      if (ai.recovering && !this._holdsBall(a) && !ai.zoneUrgent) {
        ai.holdZoneId = null;
        if (this.mode === 'showdown' || this.mode === 'knockout') {
          const away = target ? unit(a.x - target.x, a.y - target.y) : unit(640 - a.x, 400 - a.y);
          goal = { x: a.x + away.x * 190, y: a.y + away.y * 190 };
          const z = s.zone, d = distance(goal, z), safe = Math.max(20, z.r - 70);
          if (d > safe) { const u = unit(goal.x - z.x, goal.y - z.y); goal = { x: z.x + u.x * safe, y: z.y + u.y * safe }; }
        } else goal = { x: a.team === 0 ? 150 : 1130, y: clamp(a.y + (a.id % 2 ? -100 : 100), 120, 680) };
        ai.protectGoal = true;
      }
      goal.x = clamp(goal.x, 30, W - 30); goal.y = clamp(goal.y, 30, H - 30);
      if (distance(goal, ai.goal) > 80) ai.pathTimer = 0;
      ai.goal = goal;
      const difficulty = a.team === this.player.team ? 'normal' : this.difficulty;
      ai.bias = this._rand(-1, 1) * (difficulty === 'easy' ? 27 : difficulty === 'hard' ? 5 : 13);
      ai.think = difficulty === 'easy' ? 0.42 : difficulty === 'hard' ? 0.16 : 0.25;
    }
    _bestGoalY(a) {
      const gx = a.team === 0 ? 1265 : 15;
      let best = 400, quality = -Infinity;
      for (const y of [322, 400, 478]) {
        let score = this._lineClear(a.x, a.y, gx, y, 13) ? 300 : -300;
        for (const enemy of this.state.actors) if (enemy.alive && enemy.team !== a.team && this._visibleTo(enemy, a)) {
          const t = segmentCircle(a.x, a.y, gx, y, enemy.x, enemy.y, enemy.r + 32);
          if (t !== null) score -= 180;
        }
        score -= Math.abs(a.y - y) * 0.08;
        if (score > quality) { quality = score; best = y; }
      }
      return best;
    }
    _botInput(a, dt) {
      const ai = a.ai, s = this.state;
      ai.think -= dt;
      if (ai.think <= 0) this._botThink(a);
      let steering = this._steer(a, ai.goal, dt);
      let mx = steering.x, my = steering.y;
      let target = s.actors.find(b => b.id === ai.targetId && b.alive && b.team !== a.team);
      if (target && !this._visibleTo(target, a)) target = null;
      let aimX = ai.goal.x, aimY = ai.goal.y, fire = false, superFire = false, gadget = false;
      const h = HEROES[a.hero];
      const solution = this.getAutoAim(a.id);
      const shotTarget = solution.kind === 'enemy' ? s.actors.find(b => b.id === solution.targetId) : null;
      if (target) {
        const d = distance(a, target), los = this._shotLineClear(a, target.x, target.y, h.projectileRadius);
        const lead = clamp(d / h.shotSpeed, 0, 0.65) * (this.difficulty === 'easy' ? 0.25 : 0.7);
        aimX = target.x + target.vx * lead + ai.bias;
        aimY = target.y + target.vy * lead - ai.bias * 0.6;
        fire = false;
        if (!ai.protectGoal && !this._holdsBall(a) && los && d < h.range * 1.05) {
          const u = unit(target.x - a.x, target.y - a.y), preferred = h.range * (a.hero === 'tank' ? 0.52 : 0.76);
          const retreat = a.hp / a.maxHp < 0.3 ? -1.2 : d < preferred * 0.72 ? -0.7 : d > preferred ? 0.65 : 0;
          const strafe = Math.sin(s.elapsed * 1.45 + ai.phase) * ai.strafe;
          mx = mx * 0.65 + u.x * retreat - u.y * strafe * 0.62;
          my = my * 0.65 + u.y * retreat + u.x * strafe * 0.62;
        }
        superFire = a.superCharge >= 0.999 && los && target.invulnerable <= 0 &&
          d < (a.hero === 'tank' ? 325 : h.range * 1.15);
      }
      if (shotTarget) {
        aimX = solution.x + ai.bias; aimY = solution.y - ai.bias * 0.6;
        fire = shotTarget.invulnerable <= 0;
      }
      if (solution.kind === 'safe') {
        const safe = s.safes.find(safe => safe.id === solution.targetId);
        if (safe && safe.shieldTime <= 0) {
          aimX = safe.x; aimY = safe.y; fire = true;
          superFire = a.superCharge >= 0.999 && distance(a, safe) < (a.hero === 'tank' ? 325 : h.range + safe.r);
          if (a.hero === 'blaster' && a.gadgetCooldown <= 0 && distance(a, safe) < 300) gadget = true;
        }
      }
      if (ai.crateId && solution.kind !== 'enemy' && (!target || distance(a, target) > 330)) {
        const c = s.walls.find(w => w.id === ai.crateId && w.hp > 0);
        if (c) {
          aimX = c.x + c.w / 2; aimY = c.y + c.h / 2;
          fire = Math.hypot(aimX - a.x, aimY - a.y) < h.range - 10 &&
            this._lineClear(a.x, a.y, aimX, aimY, h.projectileRadius, c.id);
        }
      }
      if (ai.recovering && (!target || distance(a, target) > 165)) { fire = false; superFire = false; }
      if (this._holdsBall(a)) {
        const gx = a.team === 0 ? 1270 : 10, gy = this._bestGoalY(a);
        aimX = gx; aimY = gy; fire = false; superFire = false;
        if (Math.abs(gx - a.x) < 610 && this._lineClear(a.x, a.y, gx, gy, 13)) {
          fire = true; superFire = a.superCharge >= 0.999 && Math.abs(gx - a.x) > 300;
        } else if (target && distance(a, target) < 200) {
          const dir = a.team === 0 ? 1 : -1;
          const friend = s.actors.filter(b => b.alive && b.team === a.team && b.id !== a.id &&
            (b.x - a.x) * dir > 100 && distance(a, b) < 540 && this._lineClear(a.x, a.y, b.x, b.y, 12))
            .sort((x, y) => (y.x - x.x) * dir)[0];
          if (friend) { aimX = friend.x + friend.vx * 0.15; aimY = friend.y + friend.vy * 0.15; fire = true; }
        }
      }
      // Predict imminent projectile lanes; sidestep without abandoning the objective.
      if (this.difficulty !== 'easy' && !this._holdsBall(a)) {
        for (const p of s.projectiles) if (p.team !== a.team && distance(a, p) < 145) {
          const u = unit(p.vx, p.vy), dx = a.x - p.x, dy = a.y - p.y;
          const along = dx * u.x + dy * u.y, across = dx * -u.y + dy * u.x;
          if (along > 0 && Math.abs(across) < a.r + p.r + 12) {
            const sign = across >= 0 ? 1 : -1;
            mx -= u.y * sign * 0.9; my += u.x * sign * 0.9; break;
          }
        }
      }
      for (const friend of s.actors) if (friend.id !== a.id && friend.alive) {
        const d = distance(a, friend), space = a.r + friend.r + 18;
        if (d < space && d > 0.1) { const strength = (space - d) / space; mx += (a.x - friend.x) / d * strength; my += (a.y - friend.y) / d * strength; }
      }
      if (s.zone && distance(a, s.zone) > s.zone.r - 35) {
        const u = unit(s.zone.x - a.x, s.zone.y - a.y); mx += u.x * 1.8; my += u.y * 1.8;
      }
      if (ai.holdZoneId) {
        const zone = s.captureZones.find(zone => zone.id === ai.holdZoneId);
        if (zone && distance(a, zone) > zone.r * 0.72) {
          const u = unit(zone.x - a.x, zone.y - a.y); mx += u.x * 1.25; my += u.y * 1.25;
        }
      }
      if (a.gadgetCooldown <= 0 && target) {
        const d = distance(a, target);
        if (a.hero === 'tank') gadget = d < 330 && (a.hp < a.maxHp * 0.72 || this._holdsBall(a));
        else if (a.hero === 'ranger') gadget = d < 170 || (ai.recovering && d < 430);
        else if (d < 290 && this._lineClear(a.x, a.y, target.x, target.y, 12)) {
          gadget = true;
          if (!this._holdsBall(a)) { aimX = target.x; aimY = target.y; }
        }
      }
      if (distance(a, ai.goal) < 16 && !target) { mx *= 0.15; my *= 0.15; }
      const length = Math.hypot(mx, my);
      if (length > 1) { mx /= length; my /= length; }
      return { moveX: mx, moveY: my, aimX, aimY, fire, super: superFire, gadget };
    }
  }

  const api = { Game, HEROES, MODES };
  root.BrawlCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
