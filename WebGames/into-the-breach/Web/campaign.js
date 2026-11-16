(function (root) {
  'use strict';

  // Campaign data and read-only projections. Combat, purchases and settlement
  // remain engine transitions; previews must never consume the engine RNG.
  var SIZE = 8;
  var OPS = {
    coast: {
      id: 'coast', index: 0, mapIndex: 0, name: '해안 방어선', subtitle: 'ARCHIVE COAST',
      briefing: '네 번의 공세 동안 전력망을 지키세요. 공격 예고를 읽고 적을 밀어내면 피해 없이도 공격을 막을 수 있습니다. 전력 손실을 1 이하로 억제하면 추가 코어를 받습니다.',
      risk: 'low', baseReward: 2, bonusCores: 0,
      objectives: [{ id: 'coast_grid', type: 'grid', name: '도시 피해 최소화', description: '작전 종료까지 전력 손실을 1 이하로 유지하세요.', target: 1, reward: 1 }],
      protectedTiles: [], pod: null, hazardKind: null, extraEnemies: [], tileEdits: []
    },
    forest_relay: {
      id: 'forest_relay', index: 1, mapIndex: 1, name: '숲의 송전소', subtitle: 'VERDANT RELAY',
      briefing: '전방의 송전소를 지키세요. 표시된 건물이 남아 있으면 보조 목표를 달성합니다. 적의 곡사 공격과 불붙는 숲에 주의하세요.',
      risk: 'low', baseReward: 2, bonusCores: 0,
      objectives: [{ id: 'relay_intact', type: 'protect', name: '송전소 보호', description: '표시된 송전소가 파괴되지 않은 채 작전을 마치세요. 일부 피해는 허용됩니다.', target: 1, reward: 1 }],
      protectedTiles: [{ x: 2, y: 3 }], pod: null, hazardKind: null,
      extraEnemies: [], tileEdits: []
    },
    forest_salvage: {
      id: 'forest_salvage', index: 1, mapIndex: 1, name: '침수 지대 회수', subtitle: 'FLOODED SALVAGE',
      briefing: '북쪽 보급 포드로 메크를 이동시켜 코어를 회수하세요. 매 턴 예고된 지면 두 칸이 물로 바뀝니다. 추가 적과 침수를 감수하는 대신 작전 완료 보너스 코어 1개를 받습니다.',
      risk: 'medium', baseReward: 2, bonusCores: 1,
      objectives: [{ id: 'forest_pod', type: 'pod', name: '보급 포드 회수', description: '메크로 포드가 있는 칸에 도착하세요. 회수한 포드는 작전 완료 시 코어 1개가 됩니다.', target: 1, reward: 0 }],
      protectedTiles: [], pod: { x: 4, y: 2 }, hazardKind: 'tide',
      extraEnemies: [{ kind: 'scorpion', x: 1, y: 3 }], tileEdits: []
    },
    desert_containment: {
      id: 'desert_containment', index: 2, mapIndex: 2, name: '사막 봉쇄선', subtitle: 'DUST CONTAINMENT',
      briefing: '출현 표식을 두 번 차단하세요. 메크로 막거나 적을 표식 위로 밀어도 됩니다. 보호 사이온이 살아 있는 동안 다른 적에게 장갑이 생깁니다.',
      risk: 'medium', baseReward: 2, bonusCores: 0,
      objectives: [{ id: 'desert_blocks', type: 'blocks', name: '출현 경로 봉쇄', description: '유닛이 출현 표식을 점유한 상태로 적의 출현을 총 2회 차단하세요.', target: 2, reward: 1 }],
      protectedTiles: [], pod: null, hazardKind: null, extraEnemies: [], tileEdits: []
    },
    desert_airstrike: {
      id: 'desert_airstrike', index: 2, mapIndex: 2, name: '공습 유도 작전', subtitle: 'CROSSFIRE CORRIDOR',
      briefing: '매 턴 두 칸에 피해 2의 공습이 떨어집니다. 아군을 피신시키고 적을 예고 지점으로 유도하세요. 추가 적을 포함해 적 5기를 제거하면 보조 목표를 달성합니다.',
      risk: 'high', baseReward: 2, bonusCores: 1,
      objectives: [{ id: 'desert_kills', type: 'kills', name: '적 공세 분쇄', description: '직접 공격, 밀치기, 환경 효과를 합쳐 적 5기를 제거하세요.', target: 5, reward: 1 }],
      protectedTiles: [], pod: null, hazardKind: 'airstrike',
      extraEnemies: [{ kind: 'scarab', x: 6, y: 1 }], tileEdits: []
    },
    ice_shelter: {
      id: 'ice_shelter', index: 3, mapIndex: 3, name: '빙하 대피소', subtitle: 'FROZEN SHELTER',
      briefing: '중앙 대피소를 지키세요. 얼음은 피해를 받으면 물로 바뀝니다. 지상 적을 얼음 위에 두고 공격하면 침수로 제거할 수 있습니다.',
      risk: 'medium', baseReward: 2, bonusCores: 0,
      objectives: [{ id: 'shelter_intact', type: 'protect', name: '대피소 보호', description: '표시된 대피소가 파괴되지 않은 채 작전을 마치세요. 일부 피해는 허용됩니다.', target: 1, reward: 1 }],
      protectedTiles: [{ x: 3, y: 4 }], pod: null, hazardKind: null,
      extraEnemies: [], tileEdits: [{ x: 4, y: 2, type: 'ice' }]
    },
    ice_extraction: {
      id: 'ice_extraction', index: 3, mapIndex: 3, name: '폭풍 속 회수', subtitle: 'STORM EXTRACTION',
      briefing: '강화된 적이 보급 포드 근처를 지키고 있습니다. 매 턴 세 칸에 피해 1의 전기 폭풍이 발생합니다. 포드를 회수하고 살아남으면 위험 보너스와 회수 코어를 함께 받습니다.',
      risk: 'high', baseReward: 2, bonusCores: 1,
      objectives: [{ id: 'ice_pod', type: 'pod', name: '보급 포드 회수', description: '메크로 포드가 있는 칸에 도착하세요. 회수한 포드는 작전 완료 시 코어 1개가 됩니다.', target: 1, reward: 0 }],
      protectedTiles: [], pod: { x: 4, y: 2 }, hazardKind: 'storm',
      extraEnemies: [{ kind: 'firefly', x: 6, y: 2, alpha: true }],
      tileEdits: [{ x: 4, y: 3, type: 'ice' }]
    },
    hive: {
      id: 'hive', index: 4, mapIndex: 4, name: '최후의 균열', subtitle: 'THE LAST BREACH',
      briefing: '열핵 폭탄과 전력망을 다섯 번의 공세 동안 지키세요. 지휘 개체는 전방 두 칸을 공격합니다. 지휘 개체 제거는 보조 목표이며, 폭탄을 지키는 것이 작전의 핵심입니다.',
      risk: 'high', baseReward: 2, bonusCores: 0,
      objectives: [{ id: 'hive_leader', type: 'leader', name: '지휘 개체 제거', description: '강한 직선 공격을 사용하는 지휘 개체를 제거하세요.', target: 1, reward: 1 }],
      protectedTiles: [], pod: null, hazardKind: null,
      extraEnemies: [{ kind: 'leader', x: 4, y: 0 }], tileEdits: []
    }
  };

  var PILOTS = {
    vanguard: {
      id: 'vanguard', name: '하린', role: '선봉', trait: '방호',
      description: '계급 1부터 임무 시작 시 보호막을 얻습니다. 보호막은 피해 1회를 막습니다. 계급 2에서는 최대 체력도 1 증가합니다.'
    },
    engineer: {
      id: 'engineer', name: '태오', role: '정비', trait: '정밀 수리',
      description: '계급 1부터 수리 행동의 회복량이 1 증가합니다. 계급 2에서는 최대 체력도 1 증가합니다.'
    },
    scout: {
      id: 'scout', name: '서윤', role: '정찰', trait: '기동',
      description: '계급 1부터 이동력이 1 증가합니다. 계급 2에서는 최대 체력도 1 증가합니다.'
    }
  };

  var GEAR = {
    repulse: {
      id: 'repulse', name: '충격파 발생기', cost: 2, maxCharges: 1, range: 0, targeting: 'self',
      description: '작전당 1회. 자신의 상하좌우에 인접한 유닛을 바깥으로 한 칸 밀어냅니다. 직접 피해는 없지만 충돌 피해가 발생할 수 있습니다. 공격·수리와 같은 행동 1회를 사용합니다.'
    },
    shield: {
      id: 'shield', name: '보호막 투사기', cost: 2, maxCharges: 1, range: 3, targeting: 'friendly',
      description: '작전당 1회. 가로·세로 이동 거리 합이 3 이하인 아군 메크·열핵 폭탄 또는 건물에 보호막을 부여합니다. 보호막은 피해 1회를 막으며 중첩되지 않습니다. 공격·수리와 같은 행동 1회를 사용합니다.'
    },
    acid: {
      id: 'acid', name: '산성 투사기', cost: 2, maxCharges: 1, range: 7, targeting: 'line',
      description: '작전당 1회. 직선상의 첫 대상과 그 지면에 산성을 부여합니다. 대상이 없으면 선택한 칸에 산성 지면을 남깁니다. 직접 피해는 0이며 산성 유닛의 일반 피해는 2배로 계산한 뒤 장갑을 차감합니다. 충돌·화염·출현 차단 피해는 증폭하지 않습니다. 유닛·건물·산이 사선을 막고 공격·수리와 같은 행동 1회를 사용합니다.'
    }
  };

  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function freeze(value) {
    Object.keys(value).forEach(function (key) {
      if (value[key] && typeof value[key] === 'object') freeze(value[key]);
    });
    return Object.freeze(value);
  }
  function own(object, key) { return Object.prototype.hasOwnProperty.call(object, key); }
  function count(value, fallback) {
    return Number.isFinite(value) && value >= 0 ? Math.floor(value) : (fallback || 0);
  }
  function inside(x, y) { return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && x < SIZE && y >= 0 && y < SIZE; }
  function operationAt(index) {
    if (!Number.isInteger(index)) return null;
    var id = Object.keys(OPS).find(function (key) { return OPS[key].index === index; });
    return id ? OPS[id] : null;
  }
  function operationFor(state) {
    var mission = state.mission || {};
    return own(OPS, mission.operationId) ? OPS[mission.operationId] : operationAt(state.missionIndex);
  }
  function getOperation(id) { return own(OPS, id) ? copy(OPS[id]) : null; }
  function defaultOperation(index) { var op = operationAt(index); return op ? copy(op) : null; }
  function getChoices(state) {
    var current = state && Number.isInteger(state.missionIndex) ? state.missionIndex : -1;
    return Object.keys(OPS).filter(function (id) { return OPS[id].index === current + 1; }).map(function (id) { return copy(OPS[id]); });
  }

  function evaluateObjectives(state) {
    state = state || {};
    var mission = state.mission || {}, stats = state.stats || {}, op = operationFor(state);
    var objectives = Array.isArray(mission.objectives) ? mission.objectives : (op ? op.objectives : []);
    var protectedTiles = Array.isArray(mission.protectedTiles) ? mission.protectedTiles : (op ? op.protectedTiles : []);
    // A last player turn is still in progress. The engine marks completed only
    // after fire, hazards and enemy attacks have actually resolved.
    var completed = mission.completed === true || mission.settled === true || state.phase === 'reward' || state.phase === 'won';
    var ended = completed || state.phase === 'lost';
    return objectives.map(function (objective) {
      var type = objective.type, target = count(objective.target, type === 'grid' ? 0 : 1);
      var current = 0, status = 'active';
      if (type === 'protect') {
        current = protectedTiles.filter(function (position) {
          var tile = inside(position.x, position.y) && state.tiles && state.tiles[position.y * SIZE + position.x];
          return tile && tile.type === 'building' && tile.hp > 0;
        }).length;
        if (current < target || state.phase === 'lost') status = 'failed';
        else if (completed) status = 'complete';
      } else if (type === 'grid') {
        current = count(stats.gridLost);
        if (current > target || state.phase === 'lost') status = 'failed';
        else if (completed) status = 'complete';
      } else {
        var field = { kills: 'kills', blocks: 'blocks', pod: 'pods', leader: 'leaderKills' }[type];
        current = field ? count(stats[field]) : 0;
        if (field && current >= target) status = 'complete';
        else if (ended) status = 'failed';
      }
      return {
        id: objective.id, type: type, name: objective.name || objective.id,
        description: objective.description || '', reward: count(objective.reward),
        current: current, target: target, status: status, success: status === 'complete'
      };
    });
  }

  function quoteReward(state) {
    state = state || {};
    var op = operationFor(state), stats = state.stats || {};
    var failed = state.phase === 'lost';
    var base = failed ? 0 : count(op && op.baseReward, 2);
    var perfect = !failed && count(stats.gridLost) === 0 ? 1 : 0;
    var bonus = failed ? 0 : count(op && op.bonusCores);
    var objectives = 0, pods = failed ? 0 : count(stats.pods), details = [];
    function detail(label, cores) { if (cores > 0) details.push({ label: label, cores: cores }); }
    detail('작전 완료', base);
    detail('전력 무손실', perfect);
    detail('위험 작전 보너스', bonus);
    if (!failed) evaluateObjectives(state).forEach(function (objective) {
      if (!objective.success) return;
      objectives += objective.reward;
      detail(objective.name, objective.reward);
    });
    detail('보급 포드 회수', pods);
    var missingGrid = Math.max(0, count(state.maxGrid) - count(state.grid));
    var finalBattle = (op && op.index === 4) || state.missionIndex === 4;
    var gridRepair = failed || finalBattle ? 0 : Math.min(missingGrid, state.difficulty === 'easy' ? 2 : 1);
    return {
      base: base, perfect: perfect, bonus: bonus, objectives: objectives, pods: pods,
      total: base + perfect + bonus + objectives + pods, gridRepair: gridRepair, details: details
    };
  }

  function hashSeed(seed) {
    var h = 2166136261;
    String(seed).split('').forEach(function (character) { h = Math.imul(h ^ character.charCodeAt(0), 16777619); });
    return h >>> 0;
  }
  function hazardPlan(state) {
    state = state || {};
    var mission = state.mission || {}, op = operationFor(state);
    var kind = own(mission, 'hazardKind') ? mission.hazardKind : (op && op.hazardKind);
    var definition = {
      airstrike: { count: 2, damage: 2, label: '공습 · 피해 2' },
      tide: { count: 2, damage: 0, label: '침수 · 지면이 물로 전환' },
      storm: { count: 3, damage: 1, label: '전기 폭풍 · 피해 1' }
    }[kind];
    if (!definition || !Array.isArray(state.tiles)) return [];
    var index = Number.isInteger(state.missionIndex) ? state.missionIndex : (op ? op.index : 0);
    var seed = hashSeed(String(state.seed === undefined ? 0 : state.seed) + '|' + index + '|' + count(state.turn, 1));
    var positions = Array.from({ length: SIZE * SIZE }, function (_, i) { return i; });
    // Shuffle the complete board before filtering: only seed, stage and turn
    // determine its ordering. Moving ordinary units never rerolls a warning.
    for (var i = positions.length - 1; i > 0; i--) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      var j = Math.floor(seed / 4294967296 * (i + 1)), swap = positions[i];
      positions[i] = positions[j]; positions[j] = swap;
    }
    var bombs = (state.units || []).filter(function (unit) { return unit.kind === 'bomb' && unit.hp > 0; });
    return positions.filter(function (position) {
      var tile = state.tiles[position], x = position % SIZE, y = Math.floor(position / SIZE);
      if (!tile || tile.type === 'building' || tile.type === 'mountain' || tile.type === 'water' || tile.type === 'chasm' || tile.item === 'pod') return false;
      if (bombs.some(function (bomb) { return bomb.x === x && bomb.y === y; })) return false;
      return kind !== 'tide' || tile.type === 'ground';
    }).slice(0, definition.count).map(function (position) {
      return { x: position % SIZE, y: Math.floor(position / SIZE), kind: kind, damage: definition.damage, label: definition.label };
    });
  }

  freeze(OPS); freeze(PILOTS); freeze(GEAR);
  var api = {
    OPS: OPS, PILOTS: PILOTS, GEAR: GEAR,
    getChoices: getChoices, getOperation: getOperation, defaultOperation: defaultOperation,
    evaluateObjectives: evaluateObjectives, quoteReward: quoteReward, hazardPlan: hazardPlan
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.BreachCampaign = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
