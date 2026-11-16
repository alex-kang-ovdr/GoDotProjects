(function (root) {
  'use strict';

  // All public transitions clone their input. The UI may keep complete snapshots.
  var C = root.BreachCampaign || null;
  if (!C && typeof module !== 'undefined' && module.exports && typeof require === 'function') {
    try { C = require('./campaign.js'); } catch (_) { /* The original campaign remains a safe fallback. */ }
  }
  var SIZE = 8;
  var DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  var WEAPONS = {
    fist: { name: '타이탄 주먹', description: '인접한 한 칸에 피해 2. 생존한 대상을 한 칸 밀어냅니다.', range: '인접 1칸', minRange: 1, baseDamage: 2 },
    cannon: { name: '토러스 포', description: '직선상의 첫 대상에 피해 1과 밀치기. 다른 유닛과 산, 건물이 탄환을 막습니다.', range: '직선', minRange: 1, baseDamage: 1 },
    artillery: { name: '아르테미스 포', description: '직선 2칸 이상 떨어진 지점에 피해 1. 그 지점의 상하좌우 유닛을 바깥으로 밀어냅니다.', range: '직선 2–7칸', minRange: 2, baseDamage: 1 },
    smoke: { name: '차폐 박격포', description: '직선 2칸 이상 떨어진 지점에 피해 1. 중심과 상하좌우에 연막을 남겨 적의 예고 공격을 취소합니다.', range: '직선 2–7칸', minRange: 2, baseDamage: 1 },
    cryo: { name: '빙결 투사기', description: '직선 2칸 이상 떨어진 대상과 자신을 얼립니다. 수리로 해동할 수 있습니다. 피해 강화 시 빙결 전에 직접 피해를 가합니다.', range: '직선 2–7칸', minRange: 2, baseDamage: 0 },
    pull: { name: '중력 견인기', description: '직선상의 첫 유닛이 2칸 이상 떨어져 있으면 자신 쪽으로 한 칸 당깁니다. 기본 피해는 0이며 피해 강화가 적용됩니다. 산과 건물은 견인을 막습니다.', range: '직선 2–7칸', minRange: 2, baseDamage: 0 },
    laser: { name: '관통 광선', description: '선택한 방향 끝까지 모든 유닛과 건물에 피해 1을 가합니다. 산에는 피해를 준 뒤 멈춥니다. 아군도 피해를 받습니다.', range: '직선 관통', minRange: 1, baseDamage: 1 },
    repulse: { name: '충격파 발생기', description: '자신의 상하좌우 유닛을 한 칸 밀어냅니다. 직접 피해 없이 행동을 소모하며 작전당 1회 사용합니다.', range: '자신 중심', minRange: 0, baseDamage: 0, secondary: true },
    shield: { name: '보호막 투사기', description: '맨해튼 거리 3 이내의 아군 유닛 또는 건물에 다음 피해 1회를 막는 보호막을 줍니다. 작전당 1회 사용합니다.', range: '거리 3 이내 아군', minRange: 0, baseDamage: 0, secondary: true },
    acid: { name: '산성 투사기', description: '직선상의 첫 대상과 지면을 산성으로 만듭니다. 직접 피해 0. 산성 유닛은 무기 피해를 2배로 받습니다. 작전당 1회 사용합니다.', range: '직선 첫 대상', minRange: 1, baseDamage: 0, secondary: true },
    claw: { name: '갈고리 발톱', description: '예고 방향의 인접한 한 칸을 공격합니다.' },
    spit: { name: '산성 탄환', description: '예고한 직선상의 첫 대상에 피해를 가합니다.' },
    shell: { name: '포자 폭격', description: '예고한 상대 위치의 한 칸을 곡사 공격합니다.' },
    aura: { name: '보호 군집', description: '살아 있는 동안 다른 적에게 장갑 1을 부여합니다.' },
    web: { name: '속박 발톱', description: '예고한 인접 메크를 속박해 이동을 막습니다. 적을 밀거나 얼리거나 연막으로 공격을 취소하면 풀립니다.' },
    blast: { name: '불안정 발톱', description: '인접 칸을 공격합니다. 파괴되면 상하좌우에 피해 1의 폭발을 일으킵니다.' },
    cleave: { name: '군주의 관통 발톱', description: '예고한 직선 전방 두 칸을 차례로 공격합니다.' }
  };
  var UNIT_DEFS = {
    combat: { name: '컴뱃 메크', description: '강한 주먹과 밀치기로 전선을 정리하는 근접 기체.', weapon: 'fist', hp: 3, move: 3, damage: 2, flying: false, armor: 0 },
    cannon: { name: '캐넌 메크', description: '직선 사격으로 적을 밀어 공격 경로를 바꾸는 기체.', weapon: 'cannon', hp: 3, move: 3, damage: 1, flying: false, armor: 0 },
    artillery: { name: '아틸러리 메크', description: '곡사 포격과 십자 방향 밀치기로 여러 위협을 조정하는 기체.', weapon: 'artillery', hp: 2, move: 3, damage: 1, flying: false, armor: 0 },
    smoke: { name: '스모크 메크', description: '연막으로 적 공격을 취소하는 비행 지원 기체.', weapon: 'smoke', hp: 2, move: 3, damage: 1, flying: true, armor: 0 },
    cryo: { name: '크라이오 메크', description: '적과 자신을 얼려 한 턴의 위협을 잠그는 지원 기체.', weapon: 'cryo', hp: 3, move: 3, damage: 0, flying: false, armor: 0 },
    pull: { name: '그래비티 메크', description: '멀리 있는 유닛을 당겨 적의 사격선과 증원 지점을 바꾸는 기체.', weapon: 'pull', hp: 3, move: 3, damage: 0, flying: false, armor: 0 },
    laser: { name: '레이저 메크', description: '여러 적을 한 직선에 모아 관통 공격하는 기체. 아군과 도시의 위치에 주의하세요.', weapon: 'laser', hp: 2, move: 3, damage: 1, flying: false, armor: 0 },
    scorpion: { name: '스콜피온', description: '인접한 목표를 발톱으로 공격하는 지상 적.', weapon: 'claw', hp: 2, move: 2, damage: 1, flying: false, armor: 0 },
    firefly: { name: '파이어플라이', description: '직선 탄환을 발사하는 지상 적.', weapon: 'spit', hp: 2, move: 2, damage: 1, flying: false, armor: 0 },
    scarab: { name: '스캐럽', description: '장애물을 넘어 한 지점을 폭격하는 적.', weapon: 'shell', hp: 2, move: 2, damage: 1, flying: false, armor: 0 },
    psion: { name: '보호 사이온', description: '다른 적에게 장갑 1을 부여하는 비행 개체. 직접 공격하지 않습니다.', weapon: 'aura', hp: 2, move: 1, damage: 0, flying: true, armor: 0 },
    spider: { name: '속박 스파이더', description: '예고한 인접 메크의 이동을 막는 적. 밀치기·빙결·연막으로 속박을 끊을 수 있습니다.', weapon: 'web', hp: 2, move: 3, damage: 1, flying: false, armor: 0 },
    volatile: { name: '불안정 벡', description: '파괴되면 상하좌우에 피해 1. 연쇄 폭발을 일으킬 수 있습니다.', weapon: 'blast', hp: 2, move: 2, damage: 1, flying: false, armor: 0 },
    leader: { name: '균열 군주', description: '전방 두 칸에 피해를 가하는 강력한 지휘 개체. 폭탄과 도시에서 공격 방향을 돌리세요.', weapon: 'cleave', hp: 5, move: 2, damage: 2, flying: false, armor: 0 },
    bomb: { name: '열핵 폭탄', description: '최종 작전 동안 보호해야 하는 장치. 파괴되면 작전에 실패합니다.', weapon: null, hp: 5, move: 0, damage: 0, flying: false, armor: 0 }
  };
  var SQUADS = {
    rift: { id: 'rift', name: '리프트 워커', description: '근접 · 직선 · 곡사 포격. 피해와 밀치기의 기본을 익힐 수 있는 분대.', units: ['combat', 'cannon', 'artillery'] },
    control: { id: 'control', name: '컨트롤 분대', description: '근접 · 연막 · 빙결. 직접 처치와 공격 취소를 조합하는 분대.', units: ['combat', 'smoke', 'cryo'] },
    gravity: { id: 'gravity', name: '그래비티 분대', description: '근접 · 견인 · 관통. 적을 같은 사격선에 모으고 보조 장비로 전장을 재배치하는 분대.', units: ['combat', 'pull', 'laser'] }
  };
  var MISSIONS = [
    { id: 'coast', name: '해안 방어선', subtitle: 'ARCHIVE COAST', description: '적의 공격 예고를 확인하고 밀치기로 도시를 보호하세요.', briefing: '도시 전력망이 아직 살아 있습니다. 적을 모두 제거할 필요는 없습니다. 네 번의 공세 동안 전력망을 지키세요.', objective: '4턴 동안 전력망 보호', goal: 'survive', turnLimit: 4 },
    { id: 'forest', name: '숲의 송전소', subtitle: 'VERDANT RELAY', description: '불붙은 숲과 곡사 공격에 주의하세요.', briefing: '숲에 공격이 닿으면 불이 붙습니다. 불타는 유닛은 적 공격 직전에 피해 1을 받습니다.', objective: '4턴 동안 전력망 보호', goal: 'survive', turnLimit: 4 },
    { id: 'desert', name: '사막의 신호', subtitle: 'DUST SIGNAL', description: '사이온의 장갑과 모래의 연막을 활용하세요.', briefing: '보호 사이온이 다른 적의 직접 피해를 1 줄입니다. 모래를 공격하면 연막이 생겨 그 칸의 적 공격을 취소합니다.', objective: '4턴 동안 전력망 보호', goal: 'survive', turnLimit: 4 },
    { id: 'ice', name: '빙하의 경계', subtitle: 'FROZEN FRONT', description: '얼음이 깨지면 물이 드러납니다.', briefing: '얼음 위를 공격하면 물이 됩니다. 지상 적은 물에 빠져 제거되지만 메크는 살아남습니다. 물에 들어간 지상 메크는 공격할 수 없습니다.', objective: '4턴 동안 전력망 보호', goal: 'survive', turnLimit: 4 },
    { id: 'hive', name: '최후의 균열', subtitle: 'THE LAST BREACH', description: '폭탄을 5턴 동안 지키고 균열을 봉쇄하세요.', briefing: '열핵 폭탄을 지키세요. 전력망, 폭탄, 분대 중 하나라도 전멸하면 실패합니다. 마지막 공세가 끝나면 균열을 봉쇄합니다.', objective: '폭탄을 보호하며 5턴 생존', goal: 'bomb', turnLimit: 5 }
  ];
  var MAPS = [
    { water: [[0,0],[0,1],[0,2],[0,3],[7,0],[7,1]], mountain: [[2,1],[4,0],[6,4]], forest: [[2,3],[4,3],[6,2]], sand: [[3,1]], building: [[1,3],[3,4],[5,4],[1,5],[3,5],[7,4]], enemies: [['scorpion',3,3],['firefly',5,2]] },
    { water: [[0,0],[0,1],[0,2],[1,0],[7,2],[7,3]], mountain: [[4,1],[0,4]], forest: [[1,2],[2,2],[3,2],[3,3],[4,3],[6,3],[6,1]], building: [[1,4],[2,3],[3,5],[5,4],[6,5]], enemies: [['scorpion',2,2],['firefly',5,2],['scarab',6,1]] },
    { water: [[0,2],[0,3],[7,1]], mountain: [[2,0],[6,3]], sand: [[1,1],[2,1],[3,1],[4,1],[5,1],[1,2],[3,2],[4,2],[6,2],[2,4],[4,4],[7,3]], building: [[1,4],[3,4],[5,3],[7,4],[3,5]], enemies: [['scorpion',3,3],['firefly',5,1],['psion',1,1]] },
    { water: [[0,0],[0,1],[7,0],[7,1]], ice: [[1,1],[2,1],[3,1],[4,1],[5,1],[6,1],[1,2],[3,2],[5,2],[6,2],[0,3]], mountain: [[2,3],[6,3]], building: [[1,4],[3,4],[5,4],[7,4],[3,5]], enemies: [['scorpion',3,3],['firefly',5,1],['scarab',1,1]] },
    { chasm: [[0,0],[1,0],[6,0],[7,0],[0,1],[7,1],[0,2],[7,2],[4,2]], mountain: [[2,1],[6,2]], forest: [[1,2],[5,2]], building: [[1,4],[6,4],[2,5],[5,5]], enemies: [['scorpion',3,2],['firefly',1,3],['scarab',5,1]], bomb: [3,3] }
  ];

  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function inside(x, y) { return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && x < SIZE && y >= 0 && y < SIZE; }
  function cell(s, x, y) { return inside(x, y) ? s.tiles[y * SIZE + x] : null; }
  function alive(u) { return u && u.hp > 0 && inside(u.x, u.y); }
  function at(s, x, y) { return s.units.find(function (u) { return alive(u) && u.x === x && u.y === y; }); }
  function byId(s, id) { return s.units.find(function (u) { return u.id === id; }); }
  function living(s, team) { return s.units.filter(function (u) { return alive(u) && (!team || u.team === team); }); }
  function distance(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
  function hashSeed(seed) {
    var h = 2166136261;
    String(seed).split('').forEach(function (c) { h = Math.imul(h ^ c.charCodeAt(0), 16777619); });
    return h >>> 0;
  }
  function random(s) { s.rng = (Math.imul(s.rng >>> 0, 1664525) + 1013904223) >>> 0; return s.rng / 4294967296; }
  function shuffle(s, list) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(random(s) * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function event(events, type, x, y, text, extra) {
    var e = Object.assign({ type: type, x: x, y: y, text: text }, extra || {});
    events.push(e); return e;
  }
  function result(s, events, error) {
    if (!error && events.length) s.log = (s.log || []).concat(events.map(function (e) { return e.text; }).filter(Boolean)).slice(-12);
    return { state: s, events: events, error: error || null };
  }
  function invalid(s, message) { return result(copy(s), [], message); }
  function counter(s, name, amount) {
    amount = amount === undefined ? 1 : amount;
    s.stats[name] = (s.stats[name] || 0) + amount;
    s.runStats[name] = (s.runStats[name] || 0) + amount;
  }
  function blankStats() { return { kills: 0, blocks: 0, gridLost: 0, damageDealt: 0, damageTaken: 0, missions: 0, pods: 0, podsLost: 0, leaderKills: 0 }; }
  var DEFAULT_GEAR = { combat: 'repulse', cannon: 'acid', artillery: 'shield', smoke: 'shield', cryo: 'repulse', pull: 'acid', laser: 'shield' };
  var PILOT_IDS = ['vanguard', 'engineer', 'scout'];
  function pilotRank(xp) { return xp >= 4 ? 2 : xp >= 2 ? 1 : 0; }
  function applyPilot(u, missionStart) {
    if (!u.pilot) return;
    var p = u.pilot; p.rank = pilotRank(p.xp); p.applied = p.applied || {};
    if (p.rank >= 1 && p.id === 'scout' && !p.applied.scoutMove) { u.move += 1; p.applied.scoutMove = true; }
    if (p.rank >= 2 && !p.applied.rankHp) { u.maxHp += 1; if (u.hp > 0) u.hp += 1; p.applied.rankHp = true; }
    if (missionStart && p.rank >= 1 && p.id === 'vanguard') u.shield = true;
  }
  function podAt(s, x, y, action, events, unit) {
    var t = cell(s, x, y); if (!t || t.item !== 'pod') return;
    t.item = null;
    if (action === 'collect') { counter(s, 'pods'); event(events, 'pod', x, y, '시간 포드 회수 · 작전 보상 코어 +1', { unitId: unit && unit.id, team: 'player', amount: 1 }); }
    else { counter(s, 'podsLost'); event(events, 'podLost', x, y, '시간 포드가 파괴되었습니다.'); }
  }
  function makeUnit(kind, id, team, x, y, easy) {
    var d = UNIT_DEFS[kind];
    var hp = d.hp + (team === 'player' && easy ? 1 : 0);
    return { id: id, team: team, kind: kind, name: d.name, weapon: d.weapon, x: x, y: y, hp: hp, maxHp: hp, move: d.move, damage: d.damage,
      moved: false, acted: false, flying: d.flying, armor: d.armor, fire: false, frozen: false, shield: false, acid: false, intent: null, order: 0,
      upgrades: { damage: 0, move: 0, hp: 0 }, secondary: team === 'player' ? { id: DEFAULT_GEAR[kind] || 'shield', charges: 1, maxCharges: 1 } : null,
      pilot: null, alpha: false, exploded: false };
  }
  function refreshArmor(s) {
    var aura = living(s, 'enemy').some(function (u) { return u.kind === 'psion'; });
    s.units.forEach(function (u) {
      if (u.team === 'enemy') u.armor = (UNIT_DEFS[u.kind] ? UNIT_DEFS[u.kind].armor : 0) + (aura && u.kind !== 'psion' ? 1 : 0);
    });
  }
  function cancel(u, reason) { if (u && u.intent) { u.intent.canceled = true; u.intent.cancelReason = reason || u.intent.cancelReason || '공격 취소'; } }
  function kill(s, u, events, reason) {
    if (!alive(u)) return;
    var x = u.x, y = u.y;
    u.hp = 0; u.x = -1; u.y = -1; cancel(u, '제거됨');
    event(events, 'death', x, y, u.name + ' ' + (reason || '파괴'), { team: u.team, unitId: u.id, reason: reason || '파괴' });
    if (u.team === 'enemy') { counter(s, 'kills'); if (u.kind === 'leader') counter(s, 'leaderKills'); refreshArmor(s); }
    // Mark the source dead before resolving adjacent hits, so every volatile unit explodes once.
    if (u.kind === 'volatile' && !u.exploded) {
      u.exploded = true; event(events, 'explosion', x, y, '불안정 벡 폭발 · 상하좌우 피해 1', { unitId: u.id, team: 'enemy', amount: 1 });
      DIRS.forEach(function (d) { hit(s, x + d[0], y + d[1], 1, events, '연쇄 폭발'); });
    }
  }
  function damageUnit(s, u, amount, events, source, special) {
    if (!alive(u) || amount <= 0) return 0;
    var x = u.x, y = u.y;
    if (u.frozen) { u.frozen = false; u.fire = false; event(events, 'thaw', x, y, u.name + '의 얼음이 피해를 흡수했습니다.', { team: u.team, unitId: u.id, amount: 0 }); return 0; }
    if (u.shield) { u.shield = false; event(events, 'shield', x, y, u.name + '의 보호막이 피해를 흡수했습니다.', { team: u.team, unitId: u.id, amount: 0 }); return 0; }
    var n = special ? amount : Math.max(0, amount * (u.acid ? 2 : 1) - (u.armor || 0));
    n = Math.min(u.hp, n);
    if (!n) { event(events, 'armor', x, y, u.name + '의 장갑이 피해를 막았습니다.', { team: u.team, unitId: u.id, amount: 0 }); return 0; }
    u.hp -= n;
    event(events, 'damage', x, y, u.name + ' 피해 ' + n + (source ? ' · ' + source : ''), { team: u.team, unitId: u.id, amount: n, source: source || '공격' });
    if (u.team === 'player') counter(s, 'damageTaken', n);
    if (u.team === 'enemy') counter(s, 'damageDealt', n);
    if (u.hp <= 0) { u.hp = 1; kill(s, u, events); }
    return n;
  }
  function damageStructure(s, x, y, amount, events) {
    var t = cell(s, x, y);
    if (!t || amount <= 0 || (t.type !== 'building' && t.type !== 'mountain')) return;
    if (t.frozen) { t.frozen = false; event(events, 'thaw', x, y, '건물의 얼음이 피해를 흡수했습니다.', { amount: 0 }); return; }
    if (t.shield) { t.shield = false; event(events, 'shield', x, y, '건물의 보호막이 피해를 흡수했습니다.', { amount: 0 }); return; }
    var n = Math.min(t.hp, amount), wasBuilding = t.type === 'building';
    t.hp = Math.max(0, t.hp - amount);
    if (wasBuilding) {
      var loss = Math.min(s.grid, n); s.grid = Math.max(0, s.grid - n); counter(s, 'gridLost', loss);
      event(events, 'grid', x, y, '도시 피해 · 전력망 −' + loss, { amount: loss, team: 'neutral' });
    } else event(events, 'terrain', x, y, '산 내구도 −' + n, { amount: n });
    if (!t.hp) { t.type = 'ground'; t.maxHp = 0; t.fire = false; event(events, 'terrain', x, y, wasBuilding ? '도시 건물이 붕괴했습니다.' : '산이 무너졌습니다.'); }
  }
  function applySurface(s, u, events) {
    if (!alive(u)) return;
    var t = cell(s, u.x, u.y), flying = u.flying && !u.frozen;
    if (t.type === 'chasm' && !flying) { kill(s, u, events, '추락'); return; }
    if (t.type === 'water') {
      u.fire = false;
      if (u.team === 'enemy' && !flying) { kill(s, u, events, '침수'); return; }
    }
    if (t.smoke) { u.fire = false; cancel(u, '연막'); }
    if (t.fire && !t.smoke && !flying && !u.frozen) { u.fire = true; }
    if (t.acid && !flying) u.acid = true;
    if (t.item === 'pod') podAt(s, u.x, u.y, u.team === 'player' ? 'collect' : 'destroy', events, u);
  }
  function smokeAt(s, x, y, events) {
    var t = cell(s, x, y); if (!t) return;
    t.smoke = true; t.fire = false;
    var u = at(s, x, y); if (u) { u.fire = false; cancel(u, '연막'); }
    event(events, 'smoke', x, y, '연막 전개 · 이 칸의 공격 취소');
  }
  function weaponTerrain(s, x, y, events, amount) {
    var t = cell(s, x, y); if (!t || amount <= 0) return;
    if (t.type === 'forest') {
      t.type = 'ground'; t.fire = !t.smoke;
      if (t.fire) { event(events, 'fire', x, y, '숲에 불이 붙었습니다.'); var u = at(s, x, y); if (u && !u.flying) u.fire = true; }
    } else if (t.type === 'sand') { t.type = 'ground'; smokeAt(s, x, y, events); }
    else if (t.type === 'ice') {
      t.hp = Math.max(0, t.hp - amount);
      if (!t.hp) { t.type = 'water'; t.maxHp = 0; t.fire = false; event(events, 'terrain', x, y, '얼음이 깨져 물이 드러났습니다.'); var v = at(s, x, y); if (v) applySurface(s, v, events); }
    }
  }
  function hit(s, x, y, amount, events, source) {
    if (!inside(x, y)) return;
    if (amount > 0) podAt(s, x, y, 'destroy', events);
    var u = at(s, x, y);
    if (u) damageUnit(s, u, amount, events, source, false);
    else damageStructure(s, x, y, amount, events);
    weaponTerrain(s, x, y, events, amount);
  }
  function push(s, u, dx, dy, events) {
    if (!alive(u) || (!dx && !dy)) return;
    var x = u.x, y = u.y, nx = x + dx, ny = y + dy, t = cell(s, nx, ny), other = at(s, nx, ny);
    if (!t || other || t.type === 'mountain' || t.type === 'building') {
      event(events, 'collision', x, y, u.name + ' 충돌', { team: u.team, unitId: u.id });
      damageUnit(s, u, 1, events, '충돌', true);
      if (other) damageUnit(s, other, 1, events, '충돌', true);
      else if (t) damageStructure(s, nx, ny, 1, events);
      return;
    }
    if (u.kind === 'spider' && u.intent) u.intent.webReleased = true;
    u.x = nx; u.y = ny;
    event(events, 'push', nx, ny, u.name + ' 밀려남', { fromX: x, fromY: y, team: u.team, unitId: u.id });
    applySurface(s, u, events);
  }
  function freezeAt(s, x, y, events) {
    var u = at(s, x, y), t = cell(s, x, y);
    if (!t) return;
    t.fire = false;
    if (u) {
      u.frozen = true; u.fire = false; cancel(u, '빙결');
      event(events, 'freeze', x, y, u.name + ' 빙결 · 다음 피해 1회 흡수', { team: u.team, unitId: u.id });
      applySurface(s, u, events);
    } else if (t.type === 'building') { t.frozen = true; event(events, 'freeze', x, y, '건물 빙결 · 다음 피해 1회 흡수'); }
    else if (t.type === 'water') { t.type = 'ice'; t.hp = 1; t.maxHp = 1; event(events, 'freeze', x, y, '수면이 얼었습니다.'); }
  }
  function ray(s, x, y, dx, dy) {
    var cells = [], found = null;
    for (var n = 1; n < SIZE; n++) {
      var xx = x + dx * n, yy = y + dy * n;
      if (!inside(xx, yy)) break;
      cells.push({ x: xx, y: yy });
      var t = cell(s, xx, yy);
      if (at(s, xx, yy) || t.type === 'building' || t.type === 'mountain') { found = { x: xx, y: yy }; break; }
    }
    return { impact: found, cells: cells, end: cells[cells.length - 1] || null };
  }
  function attackTiles(s, u, intent) {
    if (!intent) return [];
    if (intent.attackKind === 'line2') {
      return [1, 2].map(function (n) { return { x: u.x + intent.dx * n, y: u.y + intent.dy * n }; }).filter(function (p) { return inside(p.x, p.y); });
    }
    if (intent.attackKind === 'projectile') { var r = ray(s, u.x, u.y, intent.dx, intent.dy); return r.end ? [r.end] : []; }
    var x = u.x + intent.dx, y = u.y + intent.dy;
    return inside(x, y) ? [{ x: x, y: y }] : [];
  }
  function checkLoss(s, events) {
    if (s.phase === 'won' || s.phase === 'lost') return s.phase === 'lost';
    var reason = null;
    if (s.grid <= 0) reason = '전력망이 붕괴했습니다.';
    else if (!living(s, 'player').length) reason = '모든 메크가 작동을 멈췄습니다.';
    else if (s.mission.goal === 'bomb' && s.units.some(function (u) { return u.kind === 'bomb' && u.hp <= 0; })) reason = '열핵 폭탄이 파괴되었습니다.';
    if (reason) {
      s.phase = 'lost'; event(events, 'loss', -1, -1, reason + ' 작전 실패.');
      s.history = s.history || [];
      s.history.push({ missionIndex: s.missionIndex, operationId: s.mission.operationId, name: s.mission.name, success: false, objectives: getObjectives(s), report: null, stats: copy(s.stats), turns: s.turn, pilotXP: 0 });
      return true;
    }
    return false;
  }

  function walkable(s, u, x, y, ending, deployment) {
    var t = cell(s, x, y); if (!t) return false;
    if ((t.type === 'mountain' || t.type === 'building') && (ending || !u.flying || deployment)) return false;
    if (deployment && (y < 5 || t.type === 'water' || t.type === 'chasm' || t.fire || t.smoke)) return false;
    if (!u.flying && t.type === 'chasm') return false;
    if (u.team === 'enemy' && !u.flying && t.type === 'water') return false;
    var occupant = at(s, x, y);
    if (occupant && occupant.id !== u.id) {
      if (ending || (!u.flying && (occupant.team !== u.team || u.team !== 'player'))) return false;
    }
    return true;
  }
  function reachable(s, u, includeStart) {
    var visited = {}, queue = [{ x: u.x, y: u.y, d: 0, risk: 0, path: [{ x: u.x, y: u.y }] }], out = [];
    visited[u.x + ',' + u.y] = { d: 0, risk: 0 };
    while (queue.length) {
      queue.sort(function (a, b) { return a.d - b.d || a.risk - b.risk; });
      var p = queue.shift();
      var best = visited[p.x + ',' + p.y];
      if (best.d !== p.d || best.risk !== p.risk) continue;
      if ((includeStart || p.d > 0) && walkable(s, u, p.x, p.y, true, false)) {
        var old = out.findIndex(function (q) { return q.x === p.x && q.y === p.y; });
        if (old >= 0) out[old] = p; else out.push(p);
      }
      if (p.d >= u.move) continue;
      DIRS.forEach(function (d) {
        var x = p.x + d[0], y = p.y + d[1], k = x + ',' + y;
        if (!walkable(s, u, x, y, false, false)) return;
        var t = cell(s, x, y), risk = p.risk + (u.flying ? 0 : (t.fire ? 4 : 0) + (t.acid ? 3 : 0) + (t.type === 'water' ? 2 : 0)) + (t.smoke ? 1 : 0);
        if (!visited[k] || p.d + 1 < visited[k].d || (p.d + 1 === visited[k].d && risk < visited[k].risk)) {
          visited[k] = { d: p.d + 1, risk: risk };
          queue.push({ x: x, y: y, d: p.d + 1, risk: risk, path: p.path.concat([{ x: x, y: y }]) });
        }
      });
    }
    return out;
  }
  function canAttack(s, u) {
    if (!alive(u) || u.acted || u.frozen) return false;
    var t = cell(s, u.x, u.y);
    return !t.smoke && !(t.type === 'water' && !u.flying);
  }
  function getMoves(s, id) {
    var u = byId(s, id);
    if (s.phase !== 'player' || !alive(u) || u.team !== 'player' || u.moved || u.acted || u.frozen || getWebbedBy(s, id).length) return [];
    return reachable(s, u, false).map(function (p) { return { x: p.x, y: p.y }; });
  }
  function getMovePath(s, id, x, y) {
    if (!getMoves(s, id).some(function (p) { return p.x === x && p.y === y; })) return [];
    var p = reachable(s, byId(s, id), false).find(function (q) { return q.x === x && q.y === y; });
    return p ? p.path.map(function (q) { return { x: q.x, y: q.y }; }) : [];
  }
  function webLinks(s) {
    var links = [];
    living(s, 'enemy').forEach(function (u) {
      var i = u.intent;
      if (u.kind !== 'spider' || !i || i.canceled || i.webReleased || u.frozen || cell(s, u.x, u.y).smoke) return;
      if (i.webX !== undefined && (i.webX !== u.x || i.webY !== u.y)) return;
      var target = at(s, u.x + i.dx, u.y + i.dy);
      if (target && target.team === 'player' && distance(u, target) === 1 && (!i.webTargetId || i.webTargetId === target.id)) links.push({ from: { x: u.x, y: u.y }, to: { x: target.x, y: target.y }, unitId: u.id, targetId: target.id });
    });
    return links;
  }
  function getWebbedBy(s, id) { return webLinks(s).filter(function (l) { return l.targetId === id; }).map(function (l) { return l.unitId; }); }
  function getWeapon(s, id, slot) {
    slot = slot || 'primary'; var u = byId(s, id);
    if (!u || (slot !== 'primary' && slot !== 'secondary')) return null;
    var weapon = slot === 'secondary' ? u.secondary && u.secondary.id : u.weapon;
    if (!WEAPONS[weapon]) return null;
    return Object.assign({ id: weapon, slot: slot, damage: slot === 'secondary' ? 0 : u.damage, charges: slot === 'secondary' ? u.secondary.charges : null, maxCharges: slot === 'secondary' ? u.secondary.maxCharges : null }, copy(WEAPONS[weapon]));
  }
  function getTargets(s, id, slot) {
    slot = slot || 'primary';
    var u = byId(s, id), out = [];
    if (s.phase !== 'player' || !u || u.team !== 'player' || !canAttack(s, u)) return out;
    var info = getWeapon(s, id, slot); if (!info || (slot === 'secondary' && info.charges <= 0)) return [];
    var weapon = info.id;
    if (weapon === 'repulse') return [{ x: u.x, y: u.y }];
    if (weapon === 'shield') {
      for (var yy = 0; yy < SIZE; yy++) for (var xx = 0; xx < SIZE; xx++) {
        var friend = at(s, xx, yy), t = cell(s, xx, yy);
        if (distance(u, { x: xx, y: yy }) <= 3 && ((friend && friend.team !== 'enemy') || t.type === 'building')) out.push({ x: xx, y: yy });
      }
      return out;
    }
    var min = ['fist','cannon','laser','acid'].indexOf(weapon) >= 0 ? 1 : 2, max = weapon === 'fist' ? 1 : 7;
    DIRS.forEach(function (d) {
      if (weapon === 'pull') { var r = ray(s, u.x, u.y, d[0], d[1]); if (!r.impact || !at(s, r.impact.x, r.impact.y) || distance(u, r.impact) < 2) return; }
      for (var n = min; n <= max; n++) { var x = u.x + d[0] * n, y = u.y + d[1] * n; if (inside(x, y)) out.push({ x: x, y: y }); }
    });
    return out;
  }
  function getDeploymentTiles(s, id) {
    var u = byId(s, id), out = [];
    if (s.phase !== 'deploy' || !u || u.team !== 'player') return out;
    for (var y = 5; y < SIZE; y++) for (var x = 0; x < SIZE; x++) if (walkable(s, u, x, y, true, true)) out.push({ x: x, y: y });
    return out;
  }
  function targetValue(s, x, y, attackerId) {
    var u = at(s, x, y), t = cell(s, x, y);
    if (u && u.id === attackerId) return -20;
    if (u) { if (u.kind === 'bomb') return 21; if (u.team === 'player') return u.frozen ? 3 : 9; return -15; }
    if (t && t.type === 'building') return t.frozen ? 5 : 14;
    if (t && t.type === 'mountain') return -3;
    return 0;
  }
  function enemyAttackKind(u) { return u.weapon === 'shell' ? 'artillery' : u.weapon === 'cleave' ? 'line2' : ['claw','web','blast'].indexOf(u.weapon) >= 0 ? 'melee' : 'projectile'; }
  function optionsAt(s, u, p) {
    var kind = enemyAttackKind(u);
    var options = [];
    DIRS.forEach(function (d) {
      if (kind === 'artillery') {
        for (var n = 2; n <= 7; n++) {
          var x = p.x + d[0] * n, y = p.y + d[1] * n;
          if (inside(x, y)) options.push({ attackKind: kind, dx: d[0] * n, dy: d[1] * n, score: targetValue(s, x, y, u.id) });
        }
      } else if (kind === 'line2') {
        var cells = [1,2].map(function (n) { return { x: p.x + d[0] * n, y: p.y + d[1] * n }; }).filter(function (v) { return inside(v.x, v.y); });
        if (cells.length) options.push({ attackKind: kind, dx: d[0], dy: d[1], score: cells.reduce(function (sum, v) { return sum + targetValue(s, v.x, v.y, u.id); }, 0) });
      } else if (kind === 'projectile') {
        var r = ray(s, p.x, p.y, d[0], d[1]);
        if (r.end) options.push({ attackKind: kind, dx: d[0], dy: d[1], score: r.impact ? targetValue(s, r.impact.x, r.impact.y, u.id) : 0 });
      } else {
        var xx = p.x + d[0], yy = p.y + d[1];
        if (inside(xx, yy)) { var target = at(s, xx, yy); options.push({ attackKind: kind, dx: d[0], dy: d[1], score: targetValue(s, xx, yy, u.id) + (u.kind === 'spider' && target && target.team === 'player' ? 6 : 0) }); }
      }
    });
    return options;
  }
  function planEnemies(s, allowMove, events) {
    refreshArmor(s);
    var enemies = living(s, 'enemy').sort(function (a, b) { return a.order - b.order || a.id.localeCompare(b.id); });
    var valuable = living(s).filter(function (u) { return u.team !== 'enemy'; }).map(function (u) { return { x: u.x, y: u.y }; });
    s.tiles.forEach(function (t, i) { if (t.type === 'building') valuable.push({ x: i % SIZE, y: Math.floor(i / SIZE) }); });
    enemies.forEach(function (u, index) {
      u.order = index + 1;
      if (u.kind === 'psion') { u.intent = null; return; }
      if (u.frozen) { u.intent = { attackKind: enemyAttackKind(u), dx: 0, dy: 1, damage: u.damage, canceled: true }; return; }
      var oldX = u.x, oldY = u.y;
      var positions = allowMove ? reachable(s, u, true) : [{ x: u.x, y: u.y, d: 0 }];
      var best = null, bestScore = -Infinity;
      // Remove the attacker's old occupancy while scoring candidate firing lanes.
      u.x = -1; u.y = -1;
      positions.forEach(function (p) {
        var t = cell(s, p.x, p.y), opts = optionsAt(s, u, p);
        var near = valuable.length ? Math.min.apply(null, valuable.map(function (v) { return distance(p, v); })) : 0;
        opts.forEach(function (o) {
          var score = o.score - near * 0.12 - p.d * 0.03 - (p.risk || 0) * 0.12 - (t.smoke ? 20 : 0) - (t.fire ? 2 : 0) + random(s) * 0.015;
          if (score > bestScore) { bestScore = score; best = { p: p, attack: o }; }
        });
      });
      u.x = oldX; u.y = oldY;
      if (!best) { u.intent = null; return; }
      var route = best.p.path || [{ x: oldX, y: oldY }, { x: best.p.x, y: best.p.y }];
      for (var step = 1; step < route.length && alive(u); step++) { u.x = route[step].x; u.y = route[step].y; applySurface(s, u, events); }
      if (!alive(u)) return;
      u.x = best.p.x; u.y = best.p.y;
      if (u.x !== oldX || u.y !== oldY) event(events, 'enemyMove', u.x, u.y, u.name + ' 이동', { fromX: oldX, fromY: oldY, team: 'enemy', unitId: u.id, path: route });
      u.intent = { attackKind: best.attack.attackKind, dx: best.attack.dx, dy: best.attack.dy, damage: u.damage, canceled: false };
      if (u.kind === 'spider') { var trapped = at(s, u.x + u.intent.dx, u.y + u.intent.dy); u.intent.webX = u.x; u.intent.webY = u.y; u.intent.webTargetId = trapped && trapped.team === 'player' ? trapped.id : null; }
      applySurface(s, u, events);
      if (cell(s, u.x, u.y) && cell(s, u.x, u.y).smoke) cancel(u);
    });
  }
  function spawnKind(s) {
    var pool = s.mission.enemyPool || (s.missionIndex < 1 ? ['scorpion','firefly'] : s.missionIndex < 2 ? ['scorpion','firefly','spider'] : ['scorpion','firefly','scarab','spider','volatile']);
    pool = pool.filter(function (kind) { return UNIT_DEFS[kind] && ['scorpion','firefly','scarab','spider','volatile','psion'].indexOf(kind) >= 0; });
    if (!pool.length) pool = ['scorpion'];
    if (s.missionIndex >= 2 && !living(s, 'enemy').some(function (u) { return u.kind === 'psion'; }) && random(s) < 0.16) return 'psion';
    return pool[Math.floor(random(s) * pool.length)];
  }
  function scheduleSpawns(s) {
    s.spawn = [];
    if (s.turn >= s.turnLimit) return;
    var count = s.missionIndex >= 3 && s.turn % 2 === 0 ? 2 : 1;
    count = Math.min(count, Math.max(0, 6 - living(s, 'enemy').length));
    var positions = [];
    for (var y = 0; y < 5; y++) for (var x = 0; x < SIZE; x++) {
      var t = cell(s, x, y);
      if (!at(s, x, y) && ['ground','forest','sand','ice'].indexOf(t.type) >= 0 && !t.fire) positions.push({ x: x, y: y });
    }
    positions = shuffle(s, positions);
    for (var i = 0; i < count && i < positions.length; i++) {
      var kind = spawnKind(s), chance = s.mission.alphaChance === undefined ? (s.missionIndex >= 3 ? 0.2 : 0) : s.mission.alphaChance;
      s.spawn.push({ x: positions[i].x, y: positions[i].y, kind: kind, alpha: kind !== 'psion' && chance > 0 ? random(s) < chance : false });
    }
  }
  function operationFor(index, id) {
    if (!C) return null;
    return (id && C.getOperation(id)) || C.defaultOperation(index);
  }
  function addEnemy(s, kind, x, y, alpha, order) {
    if (!UNIT_DEFS[kind] || at(s, x, y) || !inside(x, y)) return null;
    var u = makeUnit(kind, 'enemy-' + s.missionIndex + '-' + (++s.enemySerial), 'enemy', x, y, false);
    u.order = order || s.enemySerial;
    if (alpha) { u.alpha = true; u.hp += 1; u.maxHp += 1; if (kind !== 'leader') u.damage += 1; u.name = '강화 ' + u.name; }
    s.units.push(u); return u;
  }
  function scheduleHazards(s) {
    s.hazards = C && typeof C.hazardPlan === 'function' ? C.hazardPlan(s) : [];
  }
  function getEnvironmentalThreats(s) { return copy(s.hazards || []); }
  function getObjectives(s) { return C ? C.evaluateObjectives(s) : []; }
  function getMissionChoices(s) { return C ? C.getChoices(s) : (s.missionIndex < 4 ? [copy(MISSIONS[s.missionIndex + 1])] : []); }
  function prepareMission(s, index, operationId) {
    var players = s.units.filter(function (u) { return u.team === 'player'; });
    s.missionIndex = index; s.mission = copy(MISSIONS[index]); s.turn = 1; s.turnLimit = s.mission.turnLimit; s.phase = 'deploy'; s.stats = blankStats(); s.spawn = [];
    var op = operationFor(index, operationId);
    s.mission.operationId = op ? op.id : MISSIONS[index].id;
    s.mission.objectives = op ? copy(op.objectives || []) : [];
    s.mission.protectedTiles = op ? copy(op.protectedTiles || []) : [];
    s.mission.completed = false; s.mission.rewardClaimed = false;
    if (op) ['name','subtitle','briefing','risk','hazardKind','enemyPool','alphaChance','baseReward','bonusCores'].forEach(function (key) { if (op[key] !== undefined) s.mission[key] = copy(op[key]); });
    s.tiles = Array.from({ length: 64 }, function () { return { type: 'ground', hp: 0, maxHp: 0, fire: false, smoke: false, acid: false, objective: false, frozen: false, shield: false, item: null }; });
    var map = MAPS[op && Number.isInteger(op.mapIndex) ? op.mapIndex : index];
    ['water','chasm','mountain','forest','sand','ice','building'].forEach(function (type) {
      (map[type] || []).forEach(function (p) { var t = cell(s, p[0], p[1]); t.type = type; t.hp = t.maxHp = type === 'building' || type === 'mountain' ? 2 : type === 'ice' ? 1 : 0; });
    });
    if (op) (op.tileEdits || []).forEach(function (edit) {
      var t = cell(s, edit.x, edit.y); if (!t) return;
      Object.keys(edit).forEach(function (key) { if (key !== 'x' && key !== 'y') t[key] = copy(edit[key]); });
      if (edit.type && edit.hp === undefined) t.hp = edit.type === 'building' || edit.type === 'mountain' ? 2 : edit.type === 'ice' ? 1 : 0;
      if (edit.maxHp === undefined) t.maxHp = t.hp;
    });
    s.mission.protectedTiles.forEach(function (p) { var t = cell(s, p.x, p.y); if (t) t.objective = true; });
    if (op && op.pod) { var pod = cell(s, op.pod.x, op.pod.y); if (pod) pod.item = 'pod'; }
    var initial = [[2,6],[4,6],[6,6]];
    players.forEach(function (u, i) {
      u.x = initial[i][0]; u.y = initial[i][1]; u.hp = u.maxHp; u.moved = false; u.acted = false; u.fire = false; u.frozen = false; u.shield = false; u.acid = false; u.intent = null;
      if (u.secondary) u.secondary.charges = u.secondary.maxCharges;
      applyPilot(u, true); u.hp = u.maxHp;
    });
    s.units = players;
    map.enemies.forEach(function (entry, i) {
      addEnemy(s, entry[0], entry[1], entry[2], false, i + 1);
    });
    if (op) (op.extraEnemies || []).forEach(function (entry) { addEnemy(s, entry.kind, entry.x, entry.y, !!entry.alpha, 20 + s.enemySerial); });
    if (map.bomb) { s.units.push(makeUnit('bomb', 'bomb', 'neutral', map.bomb[0], map.bomb[1], false)); cell(s, map.bomb[0], map.bomb[1]).objective = true; }
    planEnemies(s, false, []); scheduleSpawns(s); scheduleHazards(s);
    s.log = [s.mission.name + ' · 분대를 배치하세요. 기본 배치로 바로 시작할 수도 있습니다.'];
  }
  function createRun(options) {
    options = options || {};
    var squad = Object.prototype.hasOwnProperty.call(SQUADS, options.squad) ? options.squad : 'rift', difficulty = options.difficulty === 'easy' ? 'easy' : 'normal';
    var seed = options.seed === undefined ? 'BREACH-01' : options.seed;
    var s = { schema: 2, seed: seed, rng: hashSeed(seed), phase: 'deploy', missionIndex: 0, turn: 1, turnLimit: 4, grid: 7, maxGrid: 7, cores: 0, squad: squad, difficulty: difficulty, units: [], tiles: [], spawn: [], hazards: [], mission: {}, stats: blankStats(), runStats: blankStats(), log: [], enemySerial: 0, history: [] };
    s.units = SQUADS[squad].units.map(function (kind, i) { return makeUnit(kind, 'mech-' + (i + 1), 'player', 2 + i * 2, 6, difficulty === 'easy'); });
    var veteran = options.veteran, veteranId = veteran && PILOT_IDS.indexOf(veteran.id) >= 0 ? veteran.id : null;
    var roster = veteranId ? [veteranId].concat(PILOT_IDS.filter(function (id) { return id !== veteranId; })) : PILOT_IDS;
    s.units.forEach(function (u, i) { var xp = i === 0 && veteranId ? Math.max(0, Math.min(4, Math.floor(Number(veteran.xp) || 0))) : 0; u.pilot = { id: roster[i], xp: xp, rank: pilotRank(xp), applied: {} }; });
    prepareMission(s, 0); return s;
  }
  function deploy(state, id, x, y) {
    if (!getDeploymentTiles(state, id).some(function (p) { return p.x === x && p.y === y; })) return invalid(state, '하단 3개 행의 안전한 빈 칸에 배치하세요.');
    var s = copy(state), u = byId(s, id), events = [], ox = u.x, oy = u.y; u.x = x; u.y = y;
    event(events, 'deploy', x, y, u.name + ' 배치', { fromX: ox, fromY: oy, team: 'player', unitId: id });
    return result(s, events);
  }
  function beginBattle(state) {
    if (state.phase !== 'deploy') return invalid(state, '현재는 배치 단계가 아닙니다.');
    var players = living(state, 'player');
    if (players.length !== 3 || players.some(function (u) { return !walkable(state, u, u.x, u.y, true, true); })) return invalid(state, '메크 세 기를 안전한 배치 구역에 배치하세요.');
    var s = copy(state), events = []; s.phase = 'player';
    // Preserve the displayed attack direction: deployment cannot silently reroll an intent.
    event(events, 'start', -1, -1, s.mission.name + ' 작전 개시 · ' + s.turnLimit + '턴 동안 방어하세요.');
    return result(s, events);
  }
  function command(state, action) {
    action = action || {};
    if (state.phase !== 'player') return invalid(state, '현재는 플레이어 행동 단계가 아닙니다.');
    var original = byId(state, action.unitId);
    if (!alive(original) || original.team !== 'player') return invalid(state, '작동 중인 메크를 선택하세요.');
    if (original.acted) return invalid(state, '이 메크는 이번 턴의 행동을 마쳤습니다.');
    var type = action.type;
    if (['move','attack','repair','wait'].indexOf(type) < 0) return invalid(state, '알 수 없는 명령입니다.');
    if (type === 'move' && !getMoves(state, original.id).some(function (p) { return p.x === action.x && p.y === action.y; })) return invalid(state, '이동할 수 없는 위치입니다. 이동은 턴당 한 번입니다.');
    if (type === 'attack' && !getTargets(state, original.id, action.slot || 'primary').some(function (p) { return p.x === action.x && p.y === action.y; })) return invalid(state, original.frozen ? '빙결 상태입니다. 수리로 해동하세요.' : '공격할 수 없는 위치 또는 상태입니다. 사거리·탄약·물·연막을 확인하세요.');
    var s = copy(state), u = byId(s, original.id), events = [];
    if (type === 'move') {
      var ox = u.x, oy = u.y, path = getMovePath(state, u.id, action.x, action.y); u.moved = true;
      event(events, 'move', action.x, action.y, u.name + ' 이동', { fromX: ox, fromY: oy, team: 'player', unitId: u.id, path: path });
      for (var step = 1; step < path.length && alive(u); step++) { u.x = path[step].x; u.y = path[step].y; applySurface(s, u, events); }
    } else if (type === 'repair') {
      var healing = u.pilot && u.pilot.id === 'engineer' && u.pilot.rank >= 1 ? 2 : 1;
      var healed = Math.min(healing, u.maxHp - u.hp); u.hp += healed; u.fire = false; u.frozen = false; u.acid = false; u.acted = true; u.moved = true;
      cell(s, u.x, u.y).fire = false;
      event(events, 'repair', u.x, u.y, u.name + ' 수리 · HP +' + healed + ' · 화염/빙결/산성 제거', { team: 'player', unitId: u.id, amount: healed });
    } else if (type === 'wait') {
      u.acted = true; u.moved = true; event(events, 'wait', u.x, u.y, u.name + ' 대기', { team: 'player', unitId: u.id });
    } else {
      var dx = Math.sign(action.x - u.x), dy = Math.sign(action.y - u.y), slot = action.slot || 'primary', weapon = slot === 'secondary' ? u.secondary.id : u.weapon;
      var sourceX = u.x, sourceY = u.y;
      u.acted = true; u.moved = true;
      if (slot === 'secondary') u.secondary.charges -= 1;
      event(events, 'attack', action.x, action.y, u.name + ' · ' + WEAPONS[weapon].name, { fromX: sourceX, fromY: sourceY, team: 'player', unitId: u.id, weapon: weapon, slot: slot });
      if (weapon === 'fist') {
        var target = at(s, action.x, action.y); hit(s, action.x, action.y, u.damage, events, '주먹'); if (target) push(s, target, dx, dy, events);
      } else if (weapon === 'cannon') {
        var r = ray(s, u.x, u.y, dx, dy);
        if (r.impact) { var victim = at(s, r.impact.x, r.impact.y); hit(s, r.impact.x, r.impact.y, u.damage, events, '포격'); if (victim) push(s, victim, dx, dy, events); }
      } else if (weapon === 'artillery') {
        hit(s, action.x, action.y, u.damage, events, '곡사 포격');
        DIRS.forEach(function (d) { var v = at(s, action.x + d[0], action.y + d[1]); if (v) push(s, v, d[0], d[1], events); });
      } else if (weapon === 'smoke') {
        hit(s, action.x, action.y, u.damage, events, '차폐 포격'); smokeAt(s, action.x, action.y, events);
        DIRS.forEach(function (d) { smokeAt(s, action.x + d[0], action.y + d[1], events); });
      } else if (weapon === 'cryo') {
        podAt(s, action.x, action.y, 'destroy', events);
        if (u.damage > 0) hit(s, action.x, action.y, u.damage, events, '빙결 충격');
        freezeAt(s, action.x, action.y, events); if (alive(u)) freezeAt(s, u.x, u.y, events);
      } else if (weapon === 'pull') {
        var pullRay = ray(s, sourceX, sourceY, dx, dy);
        if (pullRay.impact) { var pulled = at(s, pullRay.impact.x, pullRay.impact.y); if (u.damage > 0) hit(s, pullRay.impact.x, pullRay.impact.y, u.damage, events, '견인 충격'); if (pulled) push(s, pulled, -dx, -dy, events); }
      } else if (weapon === 'laser') {
        for (var n = 1; n < SIZE; n++) {
          var lx = sourceX + dx * n, ly = sourceY + dy * n, terrain = cell(s, lx, ly); if (!terrain) break;
          var stops = terrain.type === 'mountain'; hit(s, lx, ly, u.damage, events, '관통 광선'); if (stops) break;
        }
      } else if (weapon === 'repulse') {
        DIRS.forEach(function (d) { var adjacent = at(s, sourceX + d[0], sourceY + d[1]); if (adjacent) push(s, adjacent, d[0], d[1], events); });
      } else if (weapon === 'shield') {
        var friend = at(s, action.x, action.y), targetTile = cell(s, action.x, action.y);
        if (friend) friend.shield = true; else targetTile.shield = true;
        event(events, 'shield', action.x, action.y, (friend ? friend.name : '건물') + ' 보호막 전개 · 다음 피해 1회 흡수', { team: friend ? friend.team : 'neutral', unitId: friend && friend.id });
      } else if (weapon === 'acid') {
        var acidRay = ray(s, sourceX, sourceY, dx, dy), impact = acidRay.impact || { x: action.x, y: action.y };
        var acidTarget = at(s, impact.x, impact.y); cell(s, impact.x, impact.y).acid = true;
        if (acidTarget) acidTarget.acid = true;
        podAt(s, impact.x, impact.y, 'destroy', events);
        event(events, 'acid', impact.x, impact.y, '산성 부여 · 무기 피해 2배', { unitId: acidTarget && acidTarget.id, team: acidTarget && acidTarget.team, fromX: sourceX, fromY: sourceY });
      }
    }
    checkLoss(s, events); return result(s, events);
  }
  function resolveEnemyAttack(s, u, events) {
    var intent = u.intent;
    if (!alive(u) || !intent || intent.canceled || u.frozen || cell(s, u.x, u.y).smoke || u.kind === 'psion') return;
    var targets = attackTiles(s, u, intent); if (!targets.length) return;
    var target = targets[0];
    if (intent.attackKind === 'projectile') { var r = ray(s, u.x, u.y, intent.dx, intent.dy); if (!r.impact) return; target = r.impact; }
    if (intent.attackKind !== 'line2') targets = [target];
    var amount = intent.damage === undefined ? u.damage : intent.damage;
    for (var index = 0; index < targets.length && alive(u); index++) {
      target = targets[index];
      event(events, 'enemyAttack', target.x, target.y, u.order + '. ' + u.name + ' 공격', { fromX: u.x, fromY: u.y, team: 'enemy', unitId: u.id, amount: amount, kind: intent.attackKind });
      hit(s, target.x, target.y, amount, events, u.name);
    }
  }
  function resolveEnvironment(s, events) {
    var hazards = s.hazards || [];
    for (var i = 0; i < hazards.length; i++) {
      var h = hazards[i], t = cell(s, h.x, h.y); if (!t) continue;
      event(events, 'environment', h.x, h.y, h.label || ({ airstrike: '공습', storm: '폭풍', tide: '침수' })[h.kind], { kind: h.kind, amount: h.damage || 0 });
      if (h.kind === 'tide') {
        // Announced tides only convert clear land. A subsequently moved bomb still follows terrain rules.
        if (['ground','forest','sand','ice'].indexOf(t.type) >= 0) {
          podAt(s, h.x, h.y, 'destroy', events); t.type = 'water'; t.hp = 0; t.maxHp = 0; t.fire = false;
          event(events, 'terrain', h.x, h.y, '해수가 밀려와 물이 되었습니다.'); var u = at(s, h.x, h.y); if (u) applySurface(s, u, events);
        }
      } else hit(s, h.x, h.y, h.damage || (h.kind === 'airstrike' ? 2 : 1), events, h.kind === 'airstrike' ? '공습' : '폭풍');
      if (checkLoss(s, events)) return;
    }
  }
  function resolveSpawns(s, events) {
    (s.spawn || []).forEach(function (marker) {
      var t = cell(s, marker.x, marker.y), blocker = at(s, marker.x, marker.y);
      if (!t) return;
      if (blocker) {
        counter(s, 'blocks'); event(events, 'block', marker.x, marker.y, blocker.name + ' 증원 저지 · 피해 1', { team: blocker.team, unitId: blocker.id });
        damageUnit(s, blocker, 1, events, '증원 저지', true); return;
      }
      if (['ground','forest','sand','ice'].indexOf(t.type) < 0) { event(events, 'block', marker.x, marker.y, '지형이 적의 출현을 막았습니다.'); return; }
      var kind = UNIT_DEFS[marker.kind] && marker.kind !== 'bomb' ? marker.kind : 'scorpion';
      var u = addEnemy(s, kind, marker.x, marker.y, !!marker.alpha, 100 + s.enemySerial);
      if (u) { event(events, 'spawn', u.x, u.y, u.name + ' 출현', { team: 'enemy', unitId: u.id }); applySurface(s, u, events); }
    });
    s.spawn = []; refreshArmor(s);
  }
  function completeMission(s, events) {
    if (s.mission.rewardClaimed) return;
    s.spawn = []; s.hazards = []; counter(s, 'missions'); s.mission.completed = true;
    var report = C ? C.quoteReward(s) : { base: 2, perfect: s.stats.gridLost === 0 ? 1 : 0, bonus: 0, objectives: 0, pods: s.stats.pods || 0, total: 2 + (s.stats.gridLost === 0 ? 1 : 0) + (s.stats.pods || 0), gridRepair: s.missionIndex === 4 ? 0 : Math.min(s.maxGrid - s.grid, s.difficulty === 'easy' ? 2 : 1), details: [] };
    var reward = report.total; s.cores += reward; s.grid += report.gridRepair;
    s.mission.reward = reward; s.mission.perfect = s.stats.gridLost === 0; s.mission.rewardClaimed = true;
    s.mission.rewardBreakdown = copy(report); s.mission.rewardReport = copy(report);
    s.units.filter(function (u) { return u.team === 'player' && u.pilot; }).forEach(function (u) {
      var before = u.pilot.rank; u.pilot.xp += 1; u.pilot.rank = pilotRank(u.pilot.xp);
      if (u.pilot.rank > before) event(events, 'pilotRank', u.x, u.y, u.name + ' 파일럿 승급 · 계급 ' + u.pilot.rank + ' (다음 작전 적용)', { unitId: u.id, team: 'player', amount: u.pilot.rank });
    });
    s.history = s.history || [];
    s.history.push({ missionIndex: s.missionIndex, operationId: s.mission.operationId, name: s.mission.name, success: true, objectives: getObjectives(s), report: copy(report), stats: copy(s.stats), turns: s.turn, pilotXP: 1 });
    if (s.missionIndex === MISSIONS.length - 1) {
      s.phase = 'won'; event(events, 'victory', -1, -1, '폭탄 기폭 완료. 균열을 봉쇄했습니다!');
    } else {
      s.phase = 'reward';
      event(events, 'reward', -1, -1, '작전 성공 · 코어 +' + reward + (s.mission.perfect ? ' (무피해 보너스 포함)' : '') + ' · 전력망 +' + report.gridRepair, { amount: reward });
    }
  }
  function endTurn(state, options) {
    if (state.phase !== 'player') return invalid(state, '현재는 턴을 종료할 수 없습니다.');
    var s = copy(state), events = [], frames = [], frameStart = 0, tracing = !!(options && options.trace);
    function frame(label) {
      if (!tracing) return;
      var snapshot = copy(s); snapshot.log = (state.log || []).concat(events.map(function (e) { return e.text; }).filter(Boolean)).slice(-12);
      frames.push({ label: label, state: snapshot, events: copy(events.slice(frameStart)) }); frameStart = events.length;
    }
    function finish() { var r = result(s, events); if (tracing) r.frames = frames; return r; }
    event(events, 'turn', -1, -1, s.turn + '턴 · 적 공세 시작');
    living(s).slice().forEach(function (u) {
      var t = cell(s, u.x, u.y);
      if (u.fire && !u.frozen && !t.smoke && t.type !== 'water') damageUnit(s, u, 1, events, '화염', true);
    });
    var failed = checkLoss(s, events); frame('화염 판정'); if (failed) return finish();
    resolveEnvironment(s, events); frame('환경 위험 판정'); if (s.phase === 'lost') return finish();
    var attackOrder = living(s, 'enemy').slice().sort(function (a, b) { return a.order - b.order || a.id.localeCompare(b.id); });
    for (var i = 0; i < attackOrder.length; i++) {
      resolveEnemyAttack(s, attackOrder[i], events);
      failed = checkLoss(s, events); frame(attackOrder[i].order + '. ' + attackOrder[i].name); if (failed) return finish();
    }
    if (s.turn >= s.turnLimit) { completeMission(s, events); frame(s.phase === 'won' ? '균열 봉쇄' : '작전 완료'); return finish(); }
    resolveSpawns(s, events);
    failed = checkLoss(s, events); frame('적 증원'); if (failed) return finish();
    s.turn += 1;
    living(s, 'player').forEach(function (u) { u.moved = false; u.acted = false; });
    planEnemies(s, true, events); scheduleSpawns(s); scheduleHazards(s);
    event(events, 'turn', -1, -1, s.turn + '/' + s.turnLimit + '턴 · 적 공격이 예고되었습니다.');
    frame('다음 턴 공격 예고'); return finish();
  }
  function forecast(state) {
    var r = endTurn(state), gridDamage = 0, playerDamage = 0, neutralDamage = 0, enemyKills = 0, buildingHits = [], seen = {};
    r.events.forEach(function (e) {
      if (e.type === 'grid') { gridDamage += e.amount || 0; var k = e.x + ',' + e.y; if (!seen[k]) { seen[k] = true; buildingHits.push({ x: e.x, y: e.y }); } }
      if (e.type === 'damage' && e.team === 'player') playerDamage += e.amount || 0;
      if (e.type === 'damage' && e.team === 'neutral') neutralDamage += e.amount || 0;
      if (e.type === 'death' && e.team === 'enemy') enemyKills += 1;
    });
    return { state: r.state, events: r.events, error: r.error, gridDamage: gridDamage, playerDamage: playerDamage, neutralDamage: neutralDamage, enemyKills: enemyKills, buildingHits: buildingHits };
  }
  function threats(state) {
    return living(state, 'enemy').slice().sort(function (a, b) { return a.order - b.order || a.id.localeCompare(b.id); }).map(function (u) {
      var canceled = u.kind !== 'psion' && (!u.intent || !!u.intent.canceled || !!u.frozen || !!cell(state, u.x, u.y).smoke);
      var kind = u.intent ? u.intent.attackKind : 'aura';
      var reason = u.kind === 'psion' ? '' : u.frozen ? '빙결' : cell(state, u.x, u.y).smoke ? '연막' : u.intent && u.intent.canceled ? (u.intent.cancelReason || '공격 취소') : !u.intent ? '준비된 공격 없음' : '';
      return { unitId: u.id, order: u.order, kind: kind, from: { x: u.x, y: u.y }, targets: u.intent ? attackTiles(state, u, u.intent) : [],
        damage: u.intent ? (u.intent.damage === undefined ? u.damage : u.intent.damage) : 0, canceled: canceled, reason: reason,
        label: u.kind === 'psion' ? '보호 군집 · 다른 적 장갑 +1' : canceled ? '공격 취소' : kind === 'melee' ? '인접 공격' : kind === 'projectile' ? '직선 공격' : kind === 'line2' ? '전방 2칸 공격' : '곡사 공격' };
    });
  }
  function resolvedThreats(state) {
    var list = threats(state); if (state.phase !== 'player') return list;
    var f = forecast(state), events = f.events;
    return list.map(function (t) {
      if (t.kind === 'aura') return t;
      var attacks = events.filter(function (e) { return e.type === 'enemyAttack' && e.unitId === t.unitId; });
      if (attacks.length) { t.plannedTargets = t.targets; t.actualTargets = attacks.map(function (e) { return { x: e.x, y: e.y }; }); t.targets = t.actualTargets; t.resolved = true; return t; }
      t.canceled = true; t.resolved = true;
      var deathIndex = events.findIndex(function (e) { return e.type === 'death' && e.unitId === t.unitId; });
      if (deathIndex >= 0) {
        var damages = events.slice(0, deathIndex).filter(function (e) { return e.type === 'damage' && e.unitId === t.unitId; });
        var last = damages[damages.length - 1], source = last && last.source;
        t.reason = source === '화염' ? '화염으로 행동 전 제거' : source === '공습' || source === '폭풍' ? '환경 위험으로 행동 전 제거' : '앞선 판정으로 행동 전 제거';
      } else if (!t.reason) {
        var u = byId(state, t.unitId), r = u && u.intent && u.intent.attackKind === 'projectile' ? ray(state, u.x, u.y, u.intent.dx, u.intent.dy) : null;
        t.reason = f.state.phase === 'lost' ? '앞선 판정에서 작전 종료' : r && !r.impact ? '사격선에 대상 없음' : !t.targets.length ? '공격 지점이 전장 밖' : '앞선 판정에서 공격 취소';
      }
      return t;
    });
  }
  var UPGRADE_LIMITS = { damage: 2, move: 2, hp: 2 };
  var UPGRADE_COSTS = { damage: 2, move: 1, hp: 1 };
  function getUpgradeCost(state, id, stat) {
    var u = byId(state, id);
    if (!u || u.team !== 'player' || !Object.prototype.hasOwnProperty.call(UPGRADE_COSTS, stat)) return null;
    return ((u.upgrades || {})[stat] || 0) >= UPGRADE_LIMITS[stat] ? null : UPGRADE_COSTS[stat];
  }
  function upgrade(state, id, stat) {
    if (state.phase !== 'reward') return invalid(state, '강화는 작전 사이의 정비 단계에서 가능합니다.');
    var cost = getUpgradeCost(state, id, stat);
    if (cost === null) return invalid(state, '선택한 강화를 더 이상 적용할 수 없습니다.');
    if (state.cores < cost) return invalid(state, '강화에 필요한 코어가 부족합니다.');
    var s = copy(state), events = [], u = byId(s, id); s.cores -= cost;
    u.upgrades = u.upgrades || { damage: 0, move: 0, hp: 0 }; u.upgrades[stat] = (u.upgrades[stat] || 0) + 1;
    if (stat === 'hp') { u.maxHp += 2; if (u.hp > 0) u.hp = Math.min(u.maxHp, u.hp + 2); }
    else u[stat] += 1;
    event(events, 'upgrade', u.x, u.y, u.name + ' ' + ({ damage: '공격력 +1', move: '이동력 +1', hp: '최대 HP +2' })[stat] + ' · 코어 −' + cost, { team: 'player', unitId: u.id, amount: cost });
    return result(s, events);
  }
  function equipSecondary(state, id, gearId) {
    if (state.phase !== 'reward') return invalid(state, '보조 장비는 작전 사이 정비 단계에서 교체합니다.');
    var u = byId(state, id);
    if (!u || u.team !== 'player' || ['repulse','shield','acid'].indexOf(gearId) < 0) return invalid(state, '유효한 메크와 보조 장비를 선택하세요.');
    if (u.secondary && u.secondary.id === gearId) return invalid(state, '이미 장착한 보조 장비입니다.');
    if (state.cores < 2) return invalid(state, '장비 교체에는 코어 2개가 필요합니다.');
    var s = copy(state), events = [], mech = byId(s, id); s.cores -= 2; mech.secondary = { id: gearId, charges: 1, maxCharges: 1 };
    event(events, 'upgrade', mech.x, mech.y, mech.name + ' · ' + WEAPONS[gearId].name + ' 장착 · 코어 −2', { unitId: id, team: 'player', amount: 2 });
    return result(s, events);
  }
  function nextMission(state, operationId) {
    if (state.phase !== 'reward' || state.missionIndex >= MISSIONS.length - 1) return invalid(state, '진행할 다음 작전이 없습니다.');
    if (operationId && C && !getMissionChoices(state).some(function (op) { return op.id === operationId; })) return invalid(state, '제시된 다음 작전 중에서 선택하세요.');
    var s = copy(state); prepareMission(s, s.missionIndex + 1, operationId);
    return result(s, [{ type: 'mission', x: -1, y: -1, text: s.mission.name + ' · 모든 메크의 수리가 완료되었습니다.' }]);
  }

  function validateState(raw) {
    var errors = [];
    function bad(message) { if (errors.length < 40) errors.push(message); }
    function object(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
    function integer(v, min, max) { return Number.isInteger(v) && v >= min && v <= max; }
    if (!object(raw)) return { valid: false, errors: ['저장 상태가 객체가 아닙니다.'] };
    var s = raw, modern = s.schema === 2;
    if (s.schema !== 1 && s.schema !== 2) bad('지원하지 않는 저장 버전입니다.');
    if (['deploy','player','reward','won','lost'].indexOf(s.phase) < 0) bad('작전 단계가 올바르지 않습니다.');
    if (!integer(s.missionIndex, 0, 4)) bad('작전 번호가 올바르지 않습니다.');
    if (!integer(s.turnLimit, 1, 20) || !integer(s.turn, 1, s.turnLimit || 0)) bad('턴 정보가 올바르지 않습니다.');
    if (!integer(s.grid, 0, 7) || s.maxGrid !== 7) bad('전력망 값이 올바르지 않습니다.');
    if (!integer(s.cores, 0, 100000)) bad('코어 값이 올바르지 않습니다.');
    if (!integer(s.rng, 0, 4294967295)) bad('난수 상태가 없거나 손상되었습니다.');
    if (!((typeof s.seed === 'string' && s.seed.length <= 1024) || (typeof s.seed === 'number' && Number.isFinite(s.seed)))) bad('시드 값이 올바르지 않습니다.');
    if (Object.keys(SQUADS).indexOf(s.squad) < 0 || ['normal','easy'].indexOf(s.difficulty) < 0) bad('분대 또는 난이도가 올바르지 않습니다.');
    if (!object(s.mission)) bad('작전 정보가 없습니다.');
    else {
      if (['survive','bomb'].indexOf(s.mission.goal) < 0 || typeof s.mission.name !== 'string') bad('작전 목표 정보가 올바르지 않습니다.');
      if (modern && (typeof s.mission.operationId !== 'string' || !Array.isArray(s.mission.objectives) || !Array.isArray(s.mission.protectedTiles))) bad('분기 작전 정보가 없습니다.');
      if (modern && C && typeof s.mission.operationId === 'string') { var savedOperation = C.getOperation(s.mission.operationId); if (!savedOperation || savedOperation.index !== s.missionIndex) bad('선택한 분기 작전과 작전 번호가 일치하지 않습니다.'); }
      if (modern && (typeof s.mission.completed !== 'boolean' || typeof s.mission.rewardClaimed !== 'boolean')) bad('작전 보상 처리 상태가 올바르지 않습니다.');
      if (s.mission.enemyPool !== undefined && (!Array.isArray(s.mission.enemyPool) || s.mission.enemyPool.some(function (kind) { return Object.keys(UNIT_DEFS).indexOf(kind) < 0; }))) bad('작전 증원 종류가 올바르지 않습니다.');
      if (s.mission.alphaChance !== undefined && (!Number.isFinite(s.mission.alphaChance) || s.mission.alphaChance < 0 || s.mission.alphaChance > 1)) bad('강화 적 출현 확률이 올바르지 않습니다.');
      (Array.isArray(s.mission.objectives) ? s.mission.objectives : []).forEach(function (o) { if (!object(o) || ['kills','blocks','grid','protect','pod','leader'].indexOf(o.type) < 0 || !Number.isFinite(o.target) || !Number.isFinite(o.reward)) bad('보조 목표 정보가 올바르지 않습니다.'); });
      (Array.isArray(s.mission.protectedTiles) ? s.mission.protectedTiles : []).forEach(function (p) { if (!object(p) || !inside(p.x, p.y)) bad('보호 지점 좌표가 올바르지 않습니다.'); });
    }
    if (s.phase === 'won' && s.missionIndex !== 4) bad('최종 작전 이전에 승리 상태가 기록되었습니다.');
    if (s.phase === 'reward' && s.missionIndex === 4) bad('최종 작전의 완료 단계가 올바르지 않습니다.');
    if (!Array.isArray(s.tiles) || s.tiles.length !== 64) bad('전장은 64개 타일이어야 합니다.');
    else s.tiles.forEach(function (t, i) {
      if (!object(t)) { bad(i + '번 타일이 손상되었습니다.'); return; }
      if (['ground','forest','sand','water','mountain','building','chasm','ice'].indexOf(t.type) < 0) bad(i + '번 타일 종류가 올바르지 않습니다.');
      if (!integer(t.hp, 0, 100) || !integer(t.maxHp, 0, 100) || t.hp > t.maxHp) bad(i + '번 타일 내구도가 올바르지 않습니다.');
      if (['mountain','building','ice'].indexOf(t.type) >= 0 && t.hp <= 0) bad(i + '번 파괴된 지형 종류가 정리되지 않았습니다.');
      ['fire','smoke','acid','frozen','shield'].forEach(function (key) { if (t[key] !== undefined && typeof t[key] !== 'boolean') bad(i + '번 타일 상태가 올바르지 않습니다.'); });
      if (t.item !== undefined && t.item !== null && t.item !== 'pod') bad(i + '번 타일 아이템이 올바르지 않습니다.');
    });
    var ids = Object.create(null), occupied = Object.create(null), players = 0;
    if (!Array.isArray(s.units) || s.units.length > 128) bad('유닛 목록이 올바르지 않습니다.');
    else s.units.forEach(function (u) {
      if (!object(u)) { bad('유닛 정보가 손상되었습니다.'); return; }
      if (typeof u.id !== 'string' || !u.id || Object.prototype.hasOwnProperty.call(ids, u.id)) bad('유닛 식별자가 없거나 중복되었습니다.');
      ids[u.id] = true;
      if (typeof u.name !== 'string' || !integer(u.order, 0, 1000000)) bad('유닛 이름 또는 공격 순서가 올바르지 않습니다.');
      if (['player','enemy','neutral'].indexOf(u.team) < 0 || Object.keys(UNIT_DEFS).indexOf(u.kind) < 0) bad('유닛 종류 또는 소속이 올바르지 않습니다.');
      var teamKinds = u.team === 'player' ? ['combat','cannon','artillery','smoke','cryo','pull','laser'] : u.team === 'enemy' ? ['scorpion','firefly','scarab','psion','spider','volatile','leader'] : ['bomb'];
      if (teamKinds.indexOf(u.kind) < 0) bad('유닛 종류와 소속이 일치하지 않습니다.');
      if (u.weapon !== null && Object.keys(WEAPONS).indexOf(u.weapon) < 0) bad('유닛 무기가 올바르지 않습니다.');
      if (Object.prototype.hasOwnProperty.call(UNIT_DEFS, u.kind) && u.weapon !== UNIT_DEFS[u.kind].weapon) bad('유닛 종류와 주무기가 일치하지 않습니다.');
      if (!integer(u.hp, 0, 1000) || !integer(u.maxHp, 1, 1000) || u.hp > u.maxHp || !integer(u.move, 0, 16) || !integer(u.damage, 0, 100)) bad('유닛 능력치가 올바르지 않습니다.');
      if (u.hp > 0) {
        if (!inside(u.x, u.y)) bad('살아 있는 유닛 좌표가 전장 밖입니다.');
        var k = u.x + ',' + u.y; if (occupied[k]) bad('살아 있는 유닛이 같은 칸에 겹칩니다.'); occupied[k] = true;
      } else if (u.x !== -1 || u.y !== -1) bad('파괴된 유닛 좌표가 올바르지 않습니다.');
      ['moved','acted','flying','fire','frozen','shield','acid'].forEach(function (key) { if (typeof u[key] !== 'boolean') bad('유닛 상태 ' + key + ' 값이 올바르지 않습니다.'); });
      if (!(typeof u.armor === 'boolean' || integer(u.armor, 0, 100))) bad('유닛 장갑 값이 올바르지 않습니다.');
      if (u.intent !== null && u.intent !== undefined) {
        var intent = u.intent;
        if (!object(intent) || ['melee','projectile','artillery','line2'].indexOf(intent.attackKind) < 0 || !integer(intent.dx, -7, 7) || !integer(intent.dy, -7, 7) || (!intent.dx && !intent.dy) || (intent.dx && intent.dy) || !integer(intent.damage, 0, 100) || typeof intent.canceled !== 'boolean') bad('적 공격 예고가 손상되었습니다.');
        else if (intent.attackKind !== 'artillery' && Math.abs(intent.dx) + Math.abs(intent.dy) !== 1) bad('직선 공격 방향이 올바르지 않습니다.');
      }
      if (u.team === 'player') {
        players += 1;
        if (modern && (!object(u.secondary) || ['repulse','shield','acid'].indexOf(u.secondary.id) < 0 || u.secondary.maxCharges !== 1 || !integer(u.secondary.charges, 0, 1))) bad('보조 장비 정보가 올바르지 않습니다.');
        if (modern && (!object(u.pilot) || PILOT_IDS.indexOf(u.pilot.id) < 0 || !integer(u.pilot.xp, 0, 100) || u.pilot.rank !== pilotRank(u.pilot.xp))) bad('파일럿 정보가 올바르지 않습니다.');
        if (modern && object(u.pilot) && (!object(u.pilot.applied) || ['scoutMove','rankHp'].some(function (key) { return u.pilot.applied[key] !== undefined && typeof u.pilot.applied[key] !== 'boolean'; }))) bad('파일럿 특성 적용 기록이 올바르지 않습니다.');
        if (!object(u.upgrades) || ['damage','move','hp'].some(function (key) { return !integer(u.upgrades[key], 0, 2); })) bad('강화 정보가 올바르지 않습니다.');
      }
    });
    if (players !== 3) bad('플레이어 메크가 세 기여야 합니다.');
    ['stats','runStats'].forEach(function (key) {
      if (!object(s[key])) { bad('작전 통계가 없습니다.'); return; }
      var keys = modern ? Object.keys(blankStats()) : ['kills','blocks','gridLost','damageDealt','damageTaken','missions'];
      keys.forEach(function (name) { if (!integer(s[key][name], 0, 1000000)) bad('작전 통계 ' + name + ' 값이 올바르지 않습니다.'); });
    });
    if (!Array.isArray(s.log) || s.log.some(function (line) { return typeof line !== 'string'; })) bad('전투 기록이 올바르지 않습니다.');
    if (!Array.isArray(s.spawn)) bad('증원 목록이 올바르지 않습니다.');
    else {
      var spawnCells = {};
      s.spawn.forEach(function (p) {
        if (!object(p) || !inside(p.x, p.y) || ['scorpion','firefly','scarab','psion','spider','volatile','leader'].indexOf(p.kind) < 0) { bad('증원 정보가 올바르지 않습니다.'); return; }
        var key = p.x + ',' + p.y; if (spawnCells[key]) bad('증원 지점이 중복되었습니다.'); spawnCells[key] = true;
      });
    }
    if ((modern || s.hazards !== undefined) && !Array.isArray(s.hazards)) bad('환경 예고 목록이 없거나 올바르지 않습니다.');
    else (s.hazards || []).forEach(function (h) { if (!object(h) || !inside(h.x, h.y) || ['airstrike','storm','tide'].indexOf(h.kind) < 0 || !integer(h.damage, 0, 10)) bad('환경 예고가 올바르지 않습니다.'); });
    if (modern && !integer(s.enemySerial, 0, 1000000)) bad('적 식별자 순서가 올바르지 않습니다.');
    if ((modern || s.history !== undefined) && !Array.isArray(s.history)) bad('캠페인 기록이 올바르지 않습니다.');
    else (s.history || []).forEach(function (h) { if (!object(h) || !integer(h.missionIndex, 0, 4) || typeof h.name !== 'string' || typeof h.success !== 'boolean' || !object(h.stats) || !Array.isArray(h.objectives)) bad('완료 작전 기록이 올바르지 않습니다.'); });
    return { valid: errors.length === 0, errors: errors };
  }
  function migrateState(raw) {
    var checked = validateState(raw);
    if (!checked.valid) return { state: null, error: checked.errors.slice(0, 4).join(' ') };
    var s = copy(raw);
    if (s.schema === 2) return { state: s, error: null };
    s.schema = 2; s.hazards = []; s.history = [];
    s.stats = Object.assign(blankStats(), s.stats); s.runStats = Object.assign(blankStats(), s.runStats);
    if (!Number.isInteger(s.enemySerial)) s.enemySerial = s.units.reduce(function (max, u) { var match = u.id.match(/-(\d+)$/); return Math.max(max, match ? Number(match[1]) : 0); }, 0);
    s.tiles.forEach(function (t) { if (t.frozen === undefined) t.frozen = false; if (t.shield === undefined) t.shield = false; if (t.item === undefined) t.item = null; });
    var playerIndex = 0;
    s.units.forEach(function (u) {
      if (u.alpha === undefined) u.alpha = false; if (u.exploded === undefined) u.exploded = false;
      if (u.team === 'player') {
        u.secondary = { id: DEFAULT_GEAR[u.kind] || 'shield', charges: 1, maxCharges: 1 };
        // Existing runs do not receive retroactive stat changes during a live battle.
        u.pilot = { id: PILOT_IDS[playerIndex++], xp: 0, rank: 0, applied: {} };
      } else { u.secondary = null; u.pilot = null; }
    });
    var op = operationFor(s.missionIndex);
    s.mission.operationId = op ? op.id : MISSIONS[s.missionIndex].id;
    s.mission.objectives = []; s.mission.protectedTiles = []; s.mission.hazardKind = null;
    s.mission.completed = s.phase === 'reward' || s.phase === 'won'; s.mission.rewardClaimed = s.mission.completed;
    if (s.mission.completed && Number.isFinite(s.mission.reward)) {
      s.mission.rewardBreakdown = { base: 2, perfect: s.mission.perfect ? 1 : 0, bonus: 0, objectives: 0, pods: 0, total: s.mission.reward, gridRepair: 0, details: [{ label: '이전 버전 작전 보상', cores: s.mission.reward }] };
      s.mission.rewardReport = copy(s.mission.rewardBreakdown);
    }
    var finalCheck = validateState(s);
    return finalCheck.valid ? { state: s, error: null } : { state: null, error: finalCheck.errors.slice(0, 4).join(' ') };
  }

  var api = { SCHEMA: 2, SIZE: SIZE, UNIT_DEFS: UNIT_DEFS, SQUADS: SQUADS, MISSIONS: MISSIONS, WEAPONS: WEAPONS,
    createRun: createRun, deploy: deploy, getDeploymentTiles: getDeploymentTiles, beginBattle: beginBattle,
    getMoves: getMoves, getMovePath: getMovePath, getTargets: getTargets, getWeapon: getWeapon, command: command, preview: command, endTurn: endTurn, forecast: forecast, threats: threats, resolvedThreats: resolvedThreats,
    webLinks: webLinks, getWebbedBy: getWebbedBy, getEnvironmentalThreats: getEnvironmentalThreats, getObjectives: getObjectives, getMissionChoices: getMissionChoices,
    upgrade: upgrade, equipSecondary: equipSecondary, getUpgradeCost: getUpgradeCost, upgradeCosts: UPGRADE_COSTS, upgradeLimits: UPGRADE_LIMITS, nextMission: nextMission,
    validateState: validateState, migrateState: migrateState };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.BreachEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
