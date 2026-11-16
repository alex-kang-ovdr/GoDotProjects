(function () {
  'use strict';
  const SW = globalThis.Starward ||= {};
  const DATA = SW.DATA;
  const Game = SW.Game;
  if (!Game || !DATA) throw new Error('STARWARD: data.js와 engine.js를 먼저 불러와 주세요.');

  const result = (ok, message) => ({ ok, message });
  const alive = ship => (ship.crew || []).filter(c => c.hp > 0);
  const allSystems = ship => ({ ...ship.systems, ...(ship.aux || {}) });
  const powerUsed = ship => Object.values(allSystems(ship)).reduce((n, system) => n + Math.max(0, system.power || 0), 0);
  const powerCapacity = (game, ship) => typeof game.getReactorCapacity === 'function' ? game.getReactorCapacity(ship) : ship.reactor;
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const money = value => Math.max(0, Math.floor(Number(value) || 0));

  function node(game, id) { return game.state.nodes.find(n => n.id === id); }
  function clearEncounter(game) {
    if (typeof game.clearEnvironment === 'function') game.clearEnvironment();
    else game.state.environment = null;
    game.state.enemy = null;
    game.state.projectiles = [];
    game.state.effects = [];
    game.state.paused = true;
  }
  function rememberPower(game) {
    game.state.campaign.powerPlan = Object.fromEntries(Object.entries(allSystems(game.state.player)).map(([id, system]) => [id, system.power]));
  }
  function enableAvailablePower(game, id, amount) {
    const ship = game.state.player;
    const system = ship.systems[id] || (ship.aux && ship.aux[id]);
    if (!system || id === 'bridge') return;
    const spare = Math.max(0, powerCapacity(game, ship) - powerUsed(ship));
    const delta = Math.max(0, Math.min(amount, spare, system.level - system.damage - (system.ionStacks || 0) - system.power));
    if (delta > 0) {
      if (typeof game.allocatePower === 'function') game.allocatePower(id, delta);
      else system.power += delta;
    }
  }
  function equipmentDestination(game, kind) {
    const slots = kind === 'weapon' ? 'weapons' : 'drones';
    if (game.state.player[slots].length < DATA.equipmentLimits[slots]) return 'install';
    return (game.state.cargo || []).length < DATA.equipmentLimits.cargo ? 'cargo' : null;
  }
  function equipmentName(item) {
    return (item.kind === 'weapon' ? DATA.weapons : DATA.drones)[item.defId].name;
  }
  function equipmentShopItem(game, id, kind, defId) {
    const definition = (kind === 'weapon' ? DATA.weapons : DATA.drones)[defId];
    const destination = equipmentDestination(game, kind);
    const placement = destination === 'install' ? '구매 후 빈 슬롯에 장착합니다. 시스템 용량과 전력은 따로 확보하세요.' : destination === 'cargo' ? '구매 후 화물칸에 보관합니다. 장비창에서 장착하거나 교환하세요.' : '장착 슬롯과 화물칸이 모두 찼습니다.';
    return {
      id, name: definition.name, description: `${definition.description} ${placement}`,
      cost: DATA.equipment[kind][defId].cost, equipmentKind: kind, defId,
      destination: destination || 'cargo',
      disabled: !destination || typeof game.receiveEquipment !== 'function'
    };
  }
  function makeSalvage(game, kind, defId) {
    return {
      item: { id: game._newEquipmentId(), kind, defId },
      scrapValue: DATA.equipment[kind][defId].sell,
      status: 'pending'
    };
  }
  function victorySalvage(game, first) {
    if (first) return makeSalvage(game, 'weapon', game.state.loadoutId === 'atlas' ? 'beam' : 'ion');
    const pool = Object.entries(DATA.equipment).flatMap(([kind, definitions]) => Object.keys(definitions).map(defId => ({ kind, defId })));
    const item = pool[Math.floor(game.rand() * pool.length)];
    return makeSalvage(game, item.kind, item.defId);
  }
  function refreshChoices(game) {
    const s = game.state;
    if (!s.event) return;
    s.event.choices = s.event.choices.map(choice => {
      const fresh = { ...choice, disabled: false, reason: '' };
      if (choice.costScrap && s.resources.scrap < choice.costScrap) {
        fresh.disabled = true; fresh.reason = '스크랩이 부족합니다';
      }
      if (choice.costFuel && s.resources.fuel < choice.costFuel) {
        fresh.disabled = true; fresh.reason = '연료가 부족합니다';
      }
      if (choice.costDroneParts && s.resources.droneParts < choice.costDroneParts) {
        fresh.disabled = true; fresh.reason = '드론 부품이 부족합니다';
      }
      if (choice.species && !alive(s.player).some(c => c.species === choice.species)) {
        fresh.disabled = true; fresh.reason = '해당 종족의 생존 승무원이 필요합니다';
      }
      if (choice.recruitSpecies && alive(s.player).length >= 8) {
        fresh.disabled = true; fresh.reason = '승무원 정원 8명이 모두 찼습니다';
      }
      if (choice.requiresSystem) {
        const system = allSystems(s.player)[choice.requiresSystem];
        if (!system || system.level < (choice.requiresLevel || 1)) {
          fresh.disabled = true; fresh.reason = `${DATA.systemNames[choice.requiresSystem] || '해당'} 장비가 필요합니다`;
        }
      }
      if (choice.requiresDrone && !(s.player.drones || []).some(d => d.defId === choice.requiresDrone)) {
        fresh.disabled = true; fresh.reason = `${DATA.drones[choice.requiresDrone]?.name || '해당 드론'}을 장착해야 합니다`;
      }
      if (choice.requiresWeapon && !s.player.weapons.some(w => w.defId === choice.requiresWeapon)) {
        fresh.disabled = true; fresh.reason = `${DATA.weapons[choice.requiresWeapon]?.name || '해당 무기'}를 장착해야 합니다`;
      }
      if (choice.requiresSkill && !alive(s.player).some(c => typeof game.getCrewSkillLevel === 'function' && game.getCrewSkillLevel(c, choice.requiresSkill.id) >= choice.requiresSkill.level)) {
        fresh.disabled = true; fresh.reason = `${DATA.skillNames[choice.requiresSkill.id] || '해당'} 숙련 ${choice.requiresSkill.level}단계 승무원이 필요합니다`;
      }
      if (choice.id === 'boss_patch' && s.player.hull >= s.player.maxHull) {
        fresh.disabled = true; fresh.reason = '선체가 이미 온전합니다';
      }
      return fresh;
    });
  }
  function showEvent(game, kind, title, body, choices) {
    const s = game.state;
    clearEncounter(game);
    s.mode = 'event';
    s.reward = null;
    s.campaign.activeEventId = kind;
    s.event = { title, body, choices };
    refreshChoices(game);
  }
  function award(game, title, body, gains, action = 'map') {
    const s = game.state;
    const reward = {
      title, body,
      scrap: money(gains.scrap), fuel: money(gains.fuel), missiles: money(gains.missiles), droneParts: money(gains.droneParts),
      salvage: gains.salvage || null
    };
    if (gains.hazardScrap) reward.hazardScrap = money(gains.hazardScrap);
    s.resources.scrap += reward.scrap;
    s.resources.fuel += reward.fuel;
    s.resources.missiles += reward.missiles;
    s.resources.droneParts = money(s.resources.droneParts) + reward.droneParts;
    s.stats.scrapEarned = (s.stats.scrapEarned || 0) + reward.scrap;
    if (gains.hull) {
      const previous = s.player.hull;
      s.player.hull = clamp(s.player.hull + gains.hull, 1, s.player.maxHull);
      reward.hull = s.player.hull - previous;
    }
    clearEncounter(game);
    s.event = null;
    s.reward = reward;
    s.mode = 'reward';
    s.campaign.activeEventId = null;
    s.campaign.pendingRewardAction = action;
    game.log(title + (reward.scrap ? ` · 스크랩 +${reward.scrap}` : ''), 'reward');
    return result(true, title);
  }
  function scaleEnemy(game, spec) {
    const difficulty = DATA.difficulties[game.state.difficulty] || DATA.difficulties.standard;
    if (difficulty.id === 'standard') return spec;
    const scaled = { ...spec, hull: Math.ceil(spec.hull * difficulty.enemyHullMultiplier) };
    if (spec.maxHull) scaled.maxHull = Math.ceil(spec.maxHull * difficulty.enemyHullMultiplier);
    scaled.weaponDefs = (spec.weaponDefs || []).map(raw => {
      const defId = typeof raw === 'string' ? raw : raw.defId;
      const definition = DATA.weapons[defId];
      const override = typeof raw === 'object' ? raw : {};
      return { ...override, defId, cooldown: Number(((override.cooldown || definition.cooldown) * difficulty.enemyCooldownMultiplier).toFixed(3)) };
    });
    return scaled;
  }
  function regularEnemy(game, elite = false) {
    const s = game.state;
    const late = s.sector === 3;
    const pressure = s.fleet >= 5 ? 2 : 0;
    const variants = [
      ['잔광 약탈선', '침묵의 초계함', '반군 추격함'],
      ['녹슨 송곳', '유리 칼날', '검은 전령'],
      ['분쟁구역 경비정', '성운 사냥꾼', '봉쇄 전투함']
    ];
    const index = Math.floor(game.rand() * variants.length);
    const boarding = s.sector >= 2 && (index === 1 || elite);
    const droneDefs = late && !boarding ? [index === 2 ? 'defense' : 'combat'] : [];
    let weaponDefs = late || elite ? ['burst_laser', 'heavy_laser'] : ['burst_laser'];
    if (s.sector >= 2 && index === 2 && !elite) weaponDefs = ['burst_laser', 'artemis'];
    if (s.sector >= 2 && index === 0 && !elite) weaponDefs = ['burst_laser', 'ion'];
    const aiProfile = boarding ? 'boarding' : s.sector >= 2 && index === 0 ? 'disruptor' : s.sector >= 2 && index === 2 ? 'artillery' : 'raider';
    return scaleEnemy(game, {
      id: `enemy-s${s.sector}-${s.jumpCount}`,
      name: variants[index][s.sector - 1],
      enemy: true,
      aiProfile,
      layoutId: aiProfile === 'artillery' ? 'flagship' : 'interceptor',
      hull: 10 + (s.sector - 1) * 3 + (elite ? 3 : 0) + pressure,
      shieldLayers: s.sector === 1 && !elite ? 0 : 1,
      weaponDefs,
      reactor: late ? 14 : boarding || elite ? 10 : 8,
      engineLevel: s.sector === 1 ? 1 : 2,
      crewCount: s.sector === 1 ? 2 : boarding && late ? 4 : 3,
      crewTypes: boarding ? ['human', 'engi', 'mantis', 'rock'] : ['human', 'engi', 'rock'],
      boarding,
      boarderCount: boarding ? 1 : 0,
      droneDefs,
      droneParts: 5,
      special: boarding ? { kind: 'boarding', period: 30, warning: 6 } : undefined,
      bossPhase: 0
    });
  }
  function bossEnemy(phase) {
    return [null,
      { name: '반군 기함 · 감시자의 눈', layoutId: 'flagship', aiProfile: 'boarding', hull: 20, shieldLayers: 1, weaponDefs: ['burst_laser', 'heavy_laser'], reactor: 12, crewCount: 4, crewTypes: ['human', 'engi', 'mantis', 'rock'], engineLevel: 1, boarding: true, boarderCount: 1, droneDefs: [], special: { kind: 'boarding', period: 26, warning: 6 } },
      { name: '반군 기함 · 부서진 왕관', layoutId: 'flagship', aiProfile: 'raider', hull: 22, shieldLayers: 2, weaponDefs: ['burst_laser', 'heavy_laser'], reactor: 14, crewCount: 3, engineLevel: 2, droneDefs: ['combat'], droneParts: 5, special: { kind: 'drone_surge', period: 30, warning: 6 } },
      { name: '반군 기함 · 마지막 명령', layoutId: 'flagship', aiProfile: 'artillery', hull: 22, shieldLayers: 2, weaponDefs: ['burst_laser', 'heavy_laser'], reactor: 13, crewCount: 3, engineLevel: 2, droneDefs: [], special: { kind: 'volley', period: 28, warning: 6 } }
    ][phase];
  }
  function beginBoss(game, phase) {
    const s = game.state;
    s.bossPhase = phase;
    s.campaign.bossInProgress = true;
    s.campaign.pendingRewardAction = null;
    s.event = null;
    s.reward = null;
    rememberPower(game);
    game.startCombat(scaleEnemy(game, { ...bossEnemy(phase), enemy: true, bossPhase: phase }));
    const tacticalHints = [null, '적 승무원의 침투를 6초 전에 예고합니다. 문을 닫고 방어 인원을 배치하세요.', '드론이 8초간 3배 속도로 공격합니다. 6초 예고 동안 실드와 수리 인원을 준비하세요.', '6초 예고 뒤 미사일 3발을 발사합니다. 방어 드론으로 요격하거나 적 무기실을 완전히 제압하세요.'];
    game.log(`기함 ${phase}/3단계 — ${tacticalHints[phase]}`, 'danger');
    return result(true, `기함 ${phase}단계 전투 준비`);
  }
  function buildMap(sector) {
    const prefix = `s${sector}`;
    const nodes = [{ id: `${prefix}-start`, col: 0, row: 1, type: 'combat', label: sector === 1 ? '출항 지점' : '진입 비콘', visited: true, links: [], environment: null, hazardScrap: 0 }];
    const columnTypes = {
      1: ['combat', 'event', 'repair'],
      2: ['shop', 'combat', 'shop'],
      3: ['combat', 'event', 'combat']
    };
    const labels = {
      combat: sector === 1 ? '약탈선 흔적' : sector === 2 ? '위험 신호' : '봉쇄 초계함',
      event: sector === 1 ? '희미한 구조 신호' : sector === 2 ? '성운 속 메아리' : '고향의 호출',
      shop: sector === 3 ? '전선 보급소' : '떠돌이 거래소',
      repair: '독립 정비소'
    };
    for (let col = 1; col <= 3; col++) {
      for (let row = 0; row < 3; row++) {
        const type = columnTypes[col][row];
        const kinds = ['asteroids', 'solar', 'ion_storm'];
        const environment = col === 1 && row === 0 ? kinds[sector - 1] : col === 3 && row === 2 ? kinds[sector % kinds.length] : null;
        nodes.push({ id: `${prefix}-${col}-${row}`, col, row, type, label: labels[type], visited: false, links: [], environment, hazardScrap: environment ? DATA.environments[environment].rewardScrap : 0 });
      }
    }
    nodes.push({ id: `${prefix}-exit`, col: 4, row: 1, type: sector === 3 ? 'boss' : 'exit', label: sector === 3 ? '반군 기함' : '다음 섹터', visited: false, links: [], environment: null, hazardScrap: 0 });
    for (const entry of nodes) {
      entry.links = nodes.filter(other => other.col === entry.col + 1 && (entry.col === 0 || entry.col === 3 || Math.abs(entry.row - other.row) <= 1)).map(other => other.id);
    }
    return nodes;
  }
  function distress(game) {
    showEvent(game, 'fuel_distress', '별빛 아래, 멈춘 엔진',
      '연료 탱크가 비었습니다. 구조 신호를 보내면 항로의 화물선이 도와줄 수 있습니다. 기다리는 동안 추격대는 가까워집니다.', [
        { id: 'distress_trade', label: '예비 자재로 연료를 산다', description: '스크랩 12 → 연료 3. 추격 지연 없음.', costScrap: 12 },
        { id: 'distress_wait', label: '구조 신호를 켜고 기다린다', description: '연료 2 확보. 추격 +2, 선체 최대 2 손실. 함선은 파괴되지 않습니다.' }
      ]);
  }
  function retreatEvent(game) {
    showEvent(game, 'boss_retreat', '잠깐의 정적',
      '기함의 사거리 밖으로 빠져나왔습니다. 승무원들이 끊어진 전선을 잇습니다. 항로는 기함 너머로 이어집니다.', [
        { id: 'boss_return', label: '기함에 다시 접근한다', description: `${game.state.bossPhase}단계 재교전. 새 점프 연료는 들지 않습니다.` },
        { id: 'boss_patch', label: '긴급 선체 수리', description: '스크랩 20 → 선체 8 회복.', costScrap: 20 },
        { id: 'boss_supply', label: '표류 중인 보급함을 교환한다', description: '스크랩 18 → 미사일 4 + 연료 1 + 드론 부품 1.', costScrap: 18 }
      ]);
  }
  function encounterEvent(game, entry) {
    const s = game.state;
    const index = (s.sector * 2 + entry.col + Math.floor(game.rand() * 8)) % 8;
    const events = [
      () => showEvent(game, 'relay', '아직 켜져 있는 중계기',
        '정전된 중계기에서 아이의 음성이 반복됩니다. “다음 배가 오면, 우리가 여기 있다고 전해 주세요.”', [
          { id: 'relay_repair', label: '[엔지] 중계기를 수리한다', description: '스크랩 28 + 연료 1. 항로에 구조 신호를 되살립니다.', species: 'engi' },
          { id: 'relay_expert', label: '[수리 숙련 1] 송신 회로를 안정화한다', description: '수리 숙련 1단계 이상 승무원 필요. 스크랩 34 + 연료 2.', requiresSkill: { id: 'repair', level: 1 } },
          { id: 'relay_salvage', label: '외부 저장고에서 자재를 회수한다', description: '스크랩 18. 핵심 통신기는 남겨 둡니다.' },
          { id: 'relay_fuel', label: '비상 연료를 나누어 받는다', description: '연료 3. 수리할 자재는 남겨 둡니다.' }
        ]),
      () => showEvent(game, 'refugees', '작은 불빛들의 행렬',
        '난민선 세 척이 항로를 건너고 있습니다. 엔진은 약하지만, 모두 같은 노래를 송신하고 있습니다.', [
          { id: 'refugee_escort', label: '안전한 항로까지 호위한다', description: '연료 2 사용 → 스크랩 38 + 미사일 2.', costFuel: 2 },
          { id: 'refugee_help', label: '의료 자재를 나눈다', description: '스크랩 12 사용 → 선체 5 회복, 승무원 응급 치료.', costScrap: 12 },
          { id: 'refugee_drone', label: '[방어 드론] 난민선 외곽을 엄호한다', description: '방어 드론 장착 + 부품 1 사용 → 스크랩 30 + 연료 1. 배치한 기체는 난민선에 남깁니다.', requiresDrone: 'defense', costDroneParts: 1 },
          { id: 'refugee_listen', label: '새로운 항로 정보를 교환한다', description: '연료 1 + 스크랩 8.' }
        ]),
      () => showEvent(game, 'merchant', '불 켜진 화물칸',
        '상인은 가격표보다 먼저 따뜻한 차 한 잔을 내밉니다. “살아 돌아오는 손님이 가장 좋은 손님이지.”', [
          { id: 'merchant_fuel', label: '연료를 채운다', description: '스크랩 10 → 연료 4.', costScrap: 10 },
          { id: 'merchant_ammo', label: '미사일을 구한다', description: '스크랩 12 → 미사일 5.', costScrap: 12 },
          { id: 'merchant_pass', label: '정보만 나누고 떠난다', description: '스크랩 10. 거래는 다음 기회에.' }
        ]),
      () => showEvent(game, 'wreck', '유리 조각 사이에서',
        '오래된 우편선이 파편 구름에 갇혀 있습니다. 마지막 화물은 목적지에 닿지 못한 편지들입니다.', [
          { id: 'wreck_deep', label: '파편 속 저장고를 조사한다', description: '스크랩 32 + 미사일 2. 선체 3 손실(파괴되지는 않음).' },
          { id: 'wreck_rock', label: '[록] 외벽을 따라 접근한다', description: '피해 없이 스크랩 26 + 미사일 2.', species: 'rock' },
          { id: 'wreck_cloak', label: '[은폐] 감시망 안쪽으로 접근한다', description: '은폐 장비 필요. 접근 기동 연료 1 사용 → 스크랩 30 + 드론 부품 1. 선체 손실 없음.', requiresSystem: 'cloaking', requiresLevel: 1, costFuel: 1 },
          { id: 'wreck_safe', label: '흩어진 우편함만 건져 올린다', description: '스크랩 14 + 연료 1.' }
        ]),
      () => showEvent(game, 'clinic', '고요한 의무실',
        '독립 의료선의 의사가 무전기를 켭니다. “깃발은 묻지 않겠습니다. 다친 사람부터 보여 주세요.”', [
          { id: 'clinic_treat', label: '승무원 치료를 받는다', description: '생존 승무원 완전 회복 + 선체 3 회복.' },
          { id: 'clinic_supplies', label: '출항 준비를 도와준다', description: '스크랩 20 + 미사일 2.' },
          { id: 'clinic_engi', label: '[엔지] 의료 장비를 정비한다', description: '승무원 완전 회복 + 스크랩 24.', species: 'engi' },
          { id: 'clinic_recruit', label: '지원자와 함께 출항한다', description: '인간 승무원 유나 합류. 정원에 빈자리가 필요합니다.', recruitSpecies: 'human' }
        ]),
      () => showEvent(game, 'ambush', '아무도 답하지 않는 SOS',
        '구조 신호 뒤에 무장 선박이 숨어 있습니다. 우회할 수 있지만, 상대의 보급 창고도 그대로 남게 됩니다.', [
          { id: 'ambush_fight', label: '무장 선박을 저지한다', description: '강한 적과 전투. 승리 보상에 스크랩 18 + 미사일 2 추가.' },
          { id: 'ambush_leave', label: '신호를 무시하고 항로를 지킨다', description: '인근 저장 장치에서 연료 2만 회수합니다.' }
        ]),
      () => showEvent(game, 'workshop', '반딧불 공방',
        '소행성의 작업장에 작은 드론들이 날아다닙니다. 정비사가 반짝이는 날개 하나를 들어 보입니다. “사람 대신 위험한 곳에 보낼 수 있죠.”', [
          { id: 'workshop_parts', label: '예비 부품을 나누어 받는다', description: '드론 부품 3 + 스크랩 8.' },
          { id: 'workshop_install', label: '반딧불 공격 드론을 주문한다', description: '스크랩 30 사용 → 공격 드론 회수품 + 부품 1. 보상창에서 화물칸으로 회수 후 장착하거나 스크랩 21로 분해합니다.', costScrap: 30 },
          { id: 'workshop_ion', label: '[이온 펄스] 시험용 회로를 방전한다', description: '이온 펄스 장착 필요. 정비사를 도와 스크랩 20 + 드론 부품 2를 받습니다.', requiresWeapon: 'ion' },
          { id: 'workshop_salvage', label: '오래된 기체를 분해한다', description: '스크랩 28. 다른 시스템 강화에 사용하세요.' }
        ]),
      () => showEvent(game, 'castaway', '새로운 승무원의 자리',
        '독립 연락선에서 두 지원자가 호출합니다. 정비사와 호위 전사, 둘 모두 더 긴 항로를 찾고 있습니다. 한 명을 태우거나 보급품만 교환할 수 있습니다.', [
          { id: 'castaway_engi', label: '엔지 정비사와 계약한다', description: '스크랩 12 사용 → 엔지 승무원 니모 합류.', costScrap: 12, recruitSpecies: 'engi' },
          { id: 'castaway_mantis', label: '맨티스 전사와 계약한다', description: '스크랩 14 사용 → 맨티스 승무원 케트 합류.', costScrap: 14, recruitSpecies: 'mantis' },
          { id: 'castaway_supplies', label: '보급품을 교환하고 길을 나눈다', description: '드론 부품 2 + 스크랩 14.' }
        ])
    ];
    events[index]();
  }

  Game.prototype.initCampaign = function () {
    const s = this.state;
    s.mode = 'briefing'; s.paused = true;
    const loadout = DATA.loadouts[s.loadoutId] || DATA.loadouts.argo;
    s.resources = { ...loadout.resources };
    s.sector = 1; s.jumpCount = 0; s.fleet = 0; s.bossPhase = 0;
    s.nodes = buildMap(1); s.currentNodeId = 's1-start'; s.selectedNodeId = null;
    s.event = null; s.reward = null;
    s.campaign = { firstRewardPending: true, normalVictories: 0, bossInProgress: false, pendingRewardAction: null, activeEventId: null, combatBonus: 0, powerPlan: null };
    return result(true, '새 항해를 준비했습니다.');
  };

  Game.prototype.startRun = function () {
    if (this.state.mode !== 'briefing') return result(false, '이미 항해를 시작했습니다.');
    rememberPower(this);
    this.startCombat(scaleEnemy(this, { name: '출항로의 약탈선', enemy: true, layoutId: 'interceptor', aiProfile: 'raider', hull: 10, shieldLayers: 0, weaponDefs: ['heavy_laser'], reactor: 5, crewCount: 2, engineLevel: 1 }));
    this.log('함장, 무기 하나를 선택하고 적 함선의 방을 지정하세요. Space로 시간을 흐르게 할 수 있습니다.', 'info');
    if (this.state.loadoutId === 'atlas') this.log('아틀라스: 공격 드론을 직접 출격시키세요. 이온 펄스로 실드를 잠근 뒤 중형 레이저를 연결합니다.', 'info');
    if (this.state.loadoutId === 'wraith') this.log('레이스: 빔은 적 방 두 곳을 지정합니다. 은폐를 오래 유지하려면 자동 사격을 끄고 발사 시점을 선택하세요.', 'info');
    return result(true, '출항로를 확보하세요.');
  };

  Game.prototype.recoverShip = function (healAmount = 20) {
    if (typeof this.clearEnvironment === 'function') this.clearEnvironment();
    const ship = this.state.player;
    const systems = allSystems(ship);
    for (const system of Object.values(systems)) {
      system.damage = 0; system.repair = 0;
      system.ionStacks = 0; system.ionTimer = 0;
      system.power = clamp(system.power || 0, 0, system.level);
    }
    let available = powerCapacity(this, ship);
    for (const id of ['shields', 'weapons', 'engines', 'oxygen', 'medbay', 'drones', 'teleporter', 'cloaking']) {
      const system = systems[id];
      if (!system) continue;
      system.power = Math.min(system.power, available);
      available -= system.power;
    }
    ship.systems.bridge.power = 0;
    const plan = this.state.campaign && this.state.campaign.powerPlan;
    if (plan) {
      for (const id of ['oxygen', 'shields', 'weapons', 'engines', 'medbay', 'drones', 'teleporter', 'cloaking']) {
        const system = systems[id];
        if (!system) continue;
        const missing = Math.max(0, Math.min(plan[id] || 0, system.level) - system.power);
        const restore = Math.min(missing, available);
        system.power += restore; available -= restore;
      }
    }
    for (const room of ship.rooms) {
      room.fire = 0; room.breach = 0; room.oxygen = 100;
      room.fireDamage = 0; room.breachRepair = 0;
    }
    for (const crew of alive(ship)) {
      // Combat owns recovery/loss of boarding parties before this callback.
      // Never heal or silently rescue a living crewmember on a hostile ship.
      if (crew.shipId && crew.shipId !== 'player') continue;
      crew.hp = Math.min(crew.maxHp, crew.hp + healAmount);
      crew.repairProgress = 0;
      crew.sabotageProgress = 0;
    }
    for (const door of ship.doors || []) {
      door.hp = door.maxHp;
      door.open = false;
      door.autoClose = 0;
      door.autoOpened = false;
      door.manualOpen = false;
    }
    for (const drone of ship.drones || []) {
      drone.enabled = false; drone.deployed = false; drone.powered = false;
      drone.charge = 0; drone.hp = (DATA.drones[drone.defId] || {}).hp || 1;
    }
    ship.teleportCooldown = 0;
    ship.cloakRemaining = 0; ship.cloakCooldown = 0;
    ship.venting = false;
    ship.maxShield = Math.floor(ship.systems.shields.power / 2);
    ship.shield = ship.maxShield;
    ship.shieldCharge = 0;
    return result(true, '시스템·문·산소 복구 완료. 생존 승무원을 응급 치료하고 드론을 회수했습니다.');
  };

  Game.prototype.onCombatEnd = function (won) {
    const s = this.state;
    if (!won || s.mode !== 'combat' || !s.enemy) return result(false, '이미 종료된 전투입니다.');
    const boss = s.campaign.bossInProgress && s.bossPhase > 0;
    const crewVictory = s.lastVictoryCause === 'crew';
    this.recoverShip(boss ? 40 : 24);
    if (boss && s.bossPhase === 3) {
      clearEncounter(this);
      s.mode = 'victory'; s.event = null; s.reward = null;
      s.campaign.bossInProgress = false;
      s.campaign.pendingRewardAction = null;
      this.log('신호가 도착했습니다. 먼 곳에서, 수백 개의 작은 불빛이 응답합니다.', 'reward');
      return result(true, '마지막 신호를 전했습니다.');
    }
    if (boss) {
      const next = s.bossPhase + 1;
      return award(this, `기함 ${s.bossPhase}단계 격파`,
        `외곽 포대가 부서집니다. 아군 보급선이 선체 6을 수리하고 미사일·드론 부품을 전달했습니다. 다음은 ${next}/3단계입니다. ${next === 2 ? '공격 드론이 8초간 3배 속도로 작동합니다. 실드와 수리 인원을 준비하세요.' : '6초 예고 뒤 미사일 3발을 발사합니다. 방어 드론 또는 적 무기실 완전 제압으로 대응하세요.'}`,
        { scrap: 26, fuel: 0, missiles: 4, droneParts: 2, hull: 6 }, `boss${next}`);
    }
    const first = s.campaign.firstRewardPending;
    s.campaign.firstRewardPending = false;
    s.campaign.normalVictories = Math.min(1000000, money(s.campaign.normalVictories) + 1);
    const bonus = money(s.campaign.combatBonus);
    s.campaign.combatBonus = 0;
    const location = node(this, s.currentNodeId);
    const hazard = !first && location?.environment ? DATA.environments[location.environment] : null;
    const hazardScrap = hazard ? hazard.rewardScrap : 0;
    const body = first ? '항로가 열렸습니다. 회수품을 화물칸에 싣거나 스크랩으로 분해하세요. 장비창에서 장착·교환·무기 순서를 바꿀 수 있습니다. 장비를 얻어도 시스템 용량과 전력은 따로 확보해야 합니다.' : crewVictory ? '적 선내를 장악하여 더 많은 자재와 드론 부품을 보존했습니다. 살아남은 아군 침투 인원은 안전하게 귀환했습니다.' : '잔해에서 자재를 회수했습니다. 시스템·문·산소를 복구했고 생존 승무원을 응급 치료했습니다. 파괴된 적 함선에 남은 아군은 돌아오지 못합니다.';
    const gains = { scrap: (first ? 38 : 27 + s.sector * 7 + Math.floor(this.rand() * 7)) + bonus + (crewVictory ? 10 : 0) + hazardScrap, hazardScrap, fuel: first ? 2 : 1, missiles: bonus ? 4 : first ? 3 : 2, droneParts: first || crewVictory ? 2 : 1 };
    if (s.campaign.normalVictories === 1 || s.campaign.normalVictories % 2 === 0 || crewVictory) gains.salvage = victorySalvage(this, s.campaign.normalVictories === 1);
    return award(this, first ? '출항로 확보' : crewVictory ? '선내 장악' : '전투 승리',
      body + (hazard ? ` ${hazard.name} 교전 추가 보상: 스크랩 +${hazardScrap}.` : ''),
      gains);
  };

  Game.prototype.resolveSalvage = function (choice) {
    const s = this.state;
    const offer = s.reward && s.reward.salvage;
    if (s.mode !== 'reward' || !offer || offer.status !== 'pending') return result(false, '결정할 회수품이 없습니다.');
    if (choice !== 'claim' && choice !== 'scrap') return result(false, '화물칸 회수 또는 분해를 선택하세요.');
    const name = equipmentName(offer.item);
    if (choice === 'claim') {
      if (!this.canManageEquipment() || !Array.isArray(s.cargo) || s.cargo.length >= DATA.equipmentLimits.cargo) return result(false, '화물칸이 가득 찼습니다. 장비창에서 공간을 만들거나 회수품을 분해하세요.');
      if (s.stats.salvaged >= 1000000) return result(false, '회수 기록 한도에 도달했습니다. 회수품을 분해할 수 있습니다.');
      const inInventory = [...s.cargo, ...s.player.weapons, ...s.player.drones].some(item => item.id === offer.item.id);
      if (inInventory) return result(false, '이미 보유한 회수품입니다.');
      s.cargo.push({ id: offer.item.id, kind: offer.item.kind, defId: offer.item.defId });
      offer.status = 'claimed';
      s.stats.salvaged += 1;
      this.log(`${name} 회수 · 화물칸 ${s.cargo.length}/${DATA.equipmentLimits.cargo}`, 'reward');
      return result(true, `${name} 회수 완료. 화물칸에서 장착하세요.`);
    }
    if (s.resources.scrap + offer.scrapValue > 1000000) return result(false, '스크랩 보유 한도를 초과합니다. 회수품을 화물칸에 보관할 수 있습니다.');
    s.resources.scrap += offer.scrapValue;
    s.stats.scrapEarned += offer.scrapValue;
    offer.status = 'scrapped';
    this.log(`${name} 분해 · 스크랩 +${offer.scrapValue}`, 'reward');
    return result(true, `회수품을 분해했습니다. 스크랩 +${offer.scrapValue}.`);
  };

  Game.prototype.continueReward = function () {
    const s = this.state;
    if (s.mode !== 'reward') return result(false, '확인할 보상이 없습니다.');
    if (s.reward && s.reward.salvage && s.reward.salvage.status === 'pending') return result(false, '회수품을 화물칸에 넣거나 분해한 뒤 항해를 계속하세요.');
    const action = s.campaign.pendingRewardAction;
    s.reward = null; s.campaign.pendingRewardAction = null;
    if (action === 'boss2' || action === 'boss3') return beginBoss(this, Number(action.slice(-1)));
    if (action === 'nextSector') return this.advanceSector();
    s.mode = 'map'; s.paused = true;
    return result(true, '다음 비콘을 선택하세요.');
  };

  Game.prototype.jump = function (nodeId) {
    const s = this.state;
    if (s.mode !== 'map') return result(false, '현재는 항로를 바꿀 수 없습니다.');
    const current = node(this, s.currentNodeId);
    const target = node(this, nodeId);
    if (!current || !target || !current.links.includes(nodeId) || target.visited) return result(false, '연결된 다음 비콘을 선택하세요.');
    if (s.resources.fuel < 1) { distress(this); return result(false, '연료가 없습니다. 구조 방법을 선택하세요.'); }
    s.resources.fuel -= 1;
    s.jumpCount += 1; s.stats.jumps = (s.stats.jumps || 0) + 1; s.fleet += 1;
    target.visited = true; s.currentNodeId = target.id; s.selectedNodeId = null;
    this.recoverShip(8);
    clearEncounter(this);
    this.log(`${target.label}에 도착했습니다. 연료 -1.`, 'info');
    if (s.fleet >= 5) this.log('추격대가 접근합니다. 다음 적의 선체가 강화됩니다.', 'danger');
    if (target.type === 'combat') {
      rememberPower(this);
      this.startCombat({ ...regularEnemy(this), environment: target.environment || null });
      if (target.environment) this.log(`${DATA.environments[target.environment].name} — ${DATA.environments[target.environment].description}`, 'danger');
    } else if (target.type === 'event') encounterEvent(this, target);
    else if (target.type === 'shop') { s.mode = 'shop'; s.event = null; s.reward = null; }
    else if (target.type === 'repair') {
      this.recoverShip(60);
      award(this, '친절한 정비사들', '독립 정비소가 선체 6을 수리하고 드론 부품도 챙겨 주었습니다. “멀리 가는 배가 이기는 거야.”', { scrap: 0, fuel: 1, missiles: 1, droneParts: 1, hull: 6 });
    } else if (target.type === 'boss') return beginBoss(this, 1);
    else if (target.type === 'exit') {
      showEvent(this, 'sector_exit', '다음 항로가 열립니다',
        `${DATA.sectorNames[s.sector - 1]}의 끝입니다. ${DATA.sectorNames[s.sector]}에서 더 강한 적이 기다립니다. 장거리 항해 지원분으로 연료 3·미사일 2·드론 부품 1을 받습니다.`,
        [{ id: 'enter_next_sector', label: '다음 섹터로', description: '비콘 진입 비용 외에 추가 연료는 들지 않습니다.' }]);
    }
    return result(true, `${target.label} 도착`);
  };

  Game.prototype.advanceSector = function () {
    const s = this.state;
    const current = node(this, s.currentNodeId);
    if (s.sector >= 3 || !current || current.type !== 'exit' || !current.visited) return result(false, '아직 다음 섹터로 이동할 수 없습니다.');
    s.sector += 1; s.fleet = 0; s.bossPhase = 0;
    s.resources.fuel += 3; s.resources.missiles += 2;
    s.resources.droneParts = money(s.resources.droneParts) + 1;
    s.nodes = buildMap(s.sector); s.currentNodeId = `s${s.sector}-start`; s.selectedNodeId = null;
    s.event = null; s.reward = null; s.campaign.activeEventId = null; s.campaign.pendingRewardAction = null;
    s.campaign.bossInProgress = false;
    this.recoverShip(25); clearEncounter(this); s.mode = 'map';
    this.log(`${s.sector}섹터 · ${DATA.sectorNames[s.sector - 1]}. 연료 +3, 미사일 +2, 드론 부품 +1.`, 'reward');
    return result(true, `${DATA.sectorNames[s.sector - 1]} 진입`);
  };

  Game.prototype.chooseEvent = function (choiceId) {
    const s = this.state;
    if (s.mode !== 'event' || !s.event) return result(false, '선택할 사건이 없습니다.');
    refreshChoices(this);
    const choice = s.event.choices.find(c => c.id === choiceId);
    if (!choice || choice.disabled) return result(false, choice ? choice.reason : '유효하지 않은 선택입니다.');
    if (choice.costScrap) s.resources.scrap -= choice.costScrap;
    if (choice.costFuel) s.resources.fuel -= choice.costFuel;
    if (choice.costDroneParts) s.resources.droneParts -= choice.costDroneParts;
    const gain = (title, body, gains) => award(this, title, body, gains);
    switch (choiceId) {
      case 'enter_next_sector': return this.advanceSector();
      case 'distress_trade': return gain('탱크에 다시 빛이 듭니다', '화물선이 연료를 전달했습니다. 항해를 계속할 수 있습니다.', { fuel: 3 });
      case 'distress_wait':
        s.fleet += 2; s.player.hull = Math.max(1, s.player.hull - 2);
        return gain('구조 신호에 대한 답', '오랜 기다림 끝에 화물선이 도착했습니다. 추격 +2, 선체 최대 2 손실. 연료 2를 받았습니다.', { fuel: 2 });
      case 'boss_return': return beginBoss(this, s.bossPhase);
      case 'boss_patch':
        s.player.hull = Math.min(s.player.maxHull, s.player.hull + 8); this.recoverShip(25);
        this.log('긴급 수리: 스크랩 -20, 선체 최대 +8.', 'repair'); retreatEvent(this); return result(true, '긴급 수리를 마쳤습니다.');
      case 'boss_supply':
        s.resources.missiles += 4; s.resources.fuel += 1; s.resources.droneParts = money(s.resources.droneParts) + 1;
        this.log('긴급 보급: 미사일 +4, 연료 +1, 드론 부품 +1.', 'reward'); retreatEvent(this); return result(true, '보급품을 받았습니다.');
      case 'relay_repair': return gain('신호가 멀리 퍼집니다', '엔지가 마지막 회로를 잇자, 멈췄던 구조 신호에 답장이 도착합니다.', { scrap: 28, fuel: 1 });
      case 'relay_expert': return gain('흔들리지 않는 신호', '현장에서 익힌 수리 기술로 송신기까지 안정화했습니다. 먼 항로의 화물선이 보급 좌표를 보내옵니다.', { scrap: 34, fuel: 2 });
      case 'relay_salvage': return gain('남겨 둔 불빛', '통신기는 그대로 두고 예비 자재만 회수했습니다.', { scrap: 18 });
      case 'relay_fuel': return gain('서로 다른 목적지', '중계기 관리자가 비상 연료를 건넵니다. “우리 대신, 저 신호를 전해 주세요.”', { fuel: 3 });
      case 'refugee_escort': return gain('세 척 모두 무사합니다', '난민선들이 안전한 길목에서 떠납니다. 자재와 탄약을 모아 감사를 전합니다.', { scrap: 38, missiles: 2 });
      case 'refugee_help': this.recoverShip(45); return gain('함께 고친 배', '의료 자재를 건네자 난민선의 기술자들이 우리 선체를 수리했습니다.', { hull: 5 });
      case 'refugee_drone': return gain('작은 날개 아래에서', '부품으로 조립한 방어 기체 한 대를 난민선에 남겼습니다. 호위 대가로 자재와 연료를 받았습니다.', { scrap: 30, fuel: 1 });
      case 'refugee_listen': return gain('낯익은 노래', '안전한 항로를 알려 주고 소량의 보급품을 받았습니다.', { scrap: 8, fuel: 1 });
      case 'merchant_fuel': return gain('거래 완료', '상인이 탱크를 연결하며 다음에 돌아올 항로를 알려 줍니다.', { fuel: 4 });
      case 'merchant_ammo': return gain('거래 완료', '무기고에 새로운 미사일 다섯 발을 실었습니다.', { missiles: 5 });
      case 'merchant_pass': return gain('값이 없는 정보', '상인은 항로 지도를 받고 소정의 사례를 건넸습니다.', { scrap: 10 });
      case 'wreck_deep': s.player.hull = Math.max(1, s.player.hull - 3); return gain('먼 길의 우편', '파편에 선체가 긁혔지만 화물을 회수했습니다. 선체 최대 3 손실.', { scrap: 32, missiles: 2 });
      case 'wreck_rock': return gain('단단한 손에 실린 편지', '록 승무원이 외벽을 디디며 돌아왔습니다. 마지막 우편함도 함께입니다.', { scrap: 26, missiles: 2 });
      case 'wreck_cloak': return gain('보이지 않는 우편선', '추적 감시망을 은폐로 지나 저장고에 접근했습니다. 접근 기동에 연료 1을 썼지만 선체는 무사합니다.', { scrap: 30, droneParts: 1 });
      case 'wreck_safe': return gain('작은 회수 작업', '무리하지 않고 안전한 거리의 화물을 건져 올렸습니다.', { scrap: 14, fuel: 1 });
      case 'clinic_treat': this.recoverShip(999); return gain('다시, 각자의 자리로', '생존 승무원이 모두 회복했습니다. 정비 드론이 선체 3도 수리했습니다.', { hull: 3 });
      case 'clinic_supplies': return gain('다음 배를 위한 자리', '출항 준비를 도운 대가로 자재와 탄약을 받았습니다.', { scrap: 20, missiles: 2 });
      case 'clinic_engi': this.recoverShip(999); return gain('살아 있는 기계들', '엔지가 의료 장비를 살렸습니다. 의사는 승무원 치료와 자재로 감사를 전합니다.', { scrap: 24 });
      case 'clinic_recruit':
      case 'castaway_engi':
      case 'castaway_mantis': {
        const recruits = { clinic_recruit: ['human', '유나'], castaway_engi: ['engi', '니모'], castaway_mantis: ['mantis', '케트'] };
        const [species, name] = recruits[choiceId];
        const added = typeof this.addCrew === 'function' ? this.addCrew(species, name) : result(false, '승무원 고용을 사용할 수 없습니다.');
        if (!added || added.ok === false) {
          s.resources.scrap += choice.costScrap || 0;
          s.resources.fuel += choice.costFuel || 0;
          s.resources.droneParts += choice.costDroneParts || 0;
          return added || result(false, '승무원을 고용하지 못했습니다.');
        }
        return gain('새로운 자리가 채워집니다', `${name} 승무원이 의무실에서 장비를 정리합니다. ${species === 'mantis' ? '침투와 선내 방어를 맡길 수 있습니다.' : species === 'engi' ? '두 배 빠른 수리가 함선의 버팀목이 됩니다.' : '수리·조작·선내 방어를 함께 맡을 동료가 생겼습니다.'}`, {});
      }
      case 'castaway_supplies': return gain('다음 교차로에서', '서로의 항로를 기록하고 예비 부품을 나누었습니다.', { scrap: 14, droneParts: 2 });
      case 'workshop_parts': return gain('작은 날개들을 위한 부품', '정비사가 부품 상자에 작게 적었습니다. “한 번 더 돌아올 수 있도록.”', { scrap: 8, droneParts: 3 });
      case 'workshop_salvage': return gain('오래된 기체의 마지막 비행', '분해한 자재가 다른 장비를 살릴 것입니다.', { scrap: 28 });
      case 'workshop_ion': return gain('조용해진 시험실', '이온 펄스로 과열된 시험 회로를 잠시 멈췄습니다. 정비사가 안전하게 작업을 마치고 자재와 부품을 건넵니다.', { scrap: 20, droneParts: 2 });
      case 'workshop_install': {
        return gain('반딧불이 따라옵니다', '공격 드론을 조립했습니다. 화물칸으로 회수 후 장착하세요. 분해하면 스크랩 21을 받습니다. 공격·방어 드론 동시 운용에는 제어 용량과 전력 4가 필요합니다.', { droneParts: 1, salvage: makeSalvage(this, 'drone', 'combat') });
      }
      case 'ambush_leave': return gain('항로를 지키다', '신호의 덫을 우회했습니다. 떠나기 전 작은 연료통을 회수했습니다.', { fuel: 2 });
      case 'ambush_fight':
        s.campaign.combatBonus = 18; s.event = null; s.campaign.activeEventId = null;
        rememberPower(this); this.startCombat(regularEnemy(this, true));
        this.log('매복 선박에 접근합니다. 승리하면 추가 보급품을 회수합니다.', 'danger');
        return result(true, '매복 선박과 교전합니다.');
      default: return result(false, '지원하지 않는 사건 선택입니다.');
    }
  };

  Game.prototype.shopItems = function () {
    const s = this.state, p = s.player, sys = p.systems;
    const aux = p.aux || {};
    const crewFull = alive(p).length >= 8 || typeof this.addCrew !== 'function';
    const items = [
      { id: 'repair', name: '선체 수리', description: '선체 5를 복구합니다.', cost: 18, disabled: p.hull >= p.maxHull },
      { id: 'fuel', name: '연료 팩', description: '점프 연료 3을 보급합니다.', cost: 12 },
      { id: 'missiles', name: '미사일 상자', description: '미사일 4발을 보급합니다.', cost: 16 },
      { id: 'drone_parts', name: '드론 부품 상자', description: '드론 부품 3개. 각 드론의 전투당 첫 출격에 1개씩 필요합니다.', cost: 18 },
      { id: 'hull_plating', name: '외부 장갑 보강', description: '최대 선체 +5, 현재 선체도 5 회복. 최대 40까지 보강합니다.', cost: 45 + Math.max(0, p.maxHull - 30) * 3, disabled: p.maxHull >= 40 },
      { id: 'shields', name: '실드 강화', description: '실드 용량 +2, 최대 방어층 +1. 여유 전력을 자동 연결합니다.', cost: 55 + Math.max(0, sys.shields.level - 2) * 10, disabled: sys.shields.level >= 6 },
      { id: 'reactor', name: '반응로 증설', description: '영구 전력 +1. 전력 패널에서 원하는 시스템에 배분하세요.', cost: 22 + Math.max(0, p.reactor - 10) * 4, disabled: p.reactor >= 18 },
      { id: 'weapons', name: '무기 관제 확장', description: '무기 시스템 용량 +1. 여유 전력을 자동 연결합니다.', cost: 28 + Math.max(0, sys.weapons.level - 4) * 8, disabled: sys.weapons.level >= 8 },
      { id: 'engines', name: '엔진 개량', description: '엔진 용량 +1. 전력을 더 넣으면 회피·탈출 충전이 개선됩니다.', cost: 25 + Math.max(0, sys.engines.level - 3) * 10, disabled: sys.engines.level >= 6 },
      { id: 'drone_control', name: '드론 제어 확장', description: '드론 용량 +2. 공격·방어 드론을 함께 운용하려면 전력 4가 필요합니다.', cost: 36, disabled: !aux.drones || aux.drones.level >= 4 },
      { id: 'teleporter', name: '텔레포터 개량', description: '텔레포터 2단계. 전력 2로 운용하면 재사용 대기가 12초로 단축됩니다.', cost: 30, disabled: !aux.teleporter || aux.teleporter.level >= 2 },
      { id: 'cloaking', name: aux.cloaking?.level ? '은폐 장비 개량' : '은폐 장비 설치', description: '은폐 용량 +1, 최대 3. 가동 전력 1/2/3에 6/8/10초 은폐. 재사용 대기 20초이며 아군 무기 발사는 은폐를 해제합니다.', cost: aux.cloaking?.level ? 45 : 60, disabled: !aux.cloaking || aux.cloaking.level >= 3 },
      equipmentShopItem(this, 'burst_laser', 'weapon', 'burst_laser'),
      equipmentShopItem(this, 'artemis', 'weapon', 'artemis'),
      equipmentShopItem(this, 'heavy_laser', 'weapon', 'heavy_laser'),
      equipmentShopItem(this, 'beam', 'weapon', 'beam'),
      equipmentShopItem(this, 'ion', 'weapon', 'ion'),
      equipmentShopItem(this, 'combat_drone', 'drone', 'combat'),
      equipmentShopItem(this, 'defense_drone', 'drone', 'defense'),
      { id: 'recruit_human', name: '인간 승무원 고용', description: '균형 잡힌 승무원을 의무실에 배치합니다. 생존 승무원 최대 8명.', cost: 30, disabled: crewFull },
      { id: 'recruit_engi', name: '엔지 정비사 고용', description: '수리 속도 2배, 대인 피해 0.5배. 정비와 조작을 맡길 수 있습니다.', cost: 38, disabled: crewFull },
      { id: 'recruit_mantis', name: '맨티스 전사 고용', description: '대인 피해 1.5배, 빠른 이동. 침투·선내 방어에 적합합니다.', cost: 42, disabled: crewFull },
      { id: 'crewheal', name: '승무원 집중 치료', description: '살아 있는 모든 승무원의 체력을 완전히 회복합니다.', cost: 12, disabled: alive(p).every(c => c.hp >= c.maxHp) }
    ];
    return items.map(item => ({ ...item, disabled: Boolean(item.disabled || s.resources.scrap < item.cost) }));
  };

  Game.prototype.buy = function (itemId) {
    const s = this.state;
    if (s.mode !== 'shop') return result(false, '거래소에서만 구매할 수 있습니다.');
    const item = this.shopItems().find(i => i.id === itemId);
    if (!item) return result(false, '알 수 없는 상품입니다.');
    if (s.resources.scrap < item.cost) return result(false, '스크랩이 부족합니다.');
    if (item.disabled) return result(false, item.equipmentKind ? '장착 슬롯과 화물칸의 여유 공간을 확인하세요.' : '이미 최대 상태이거나 지금 적용할 수 없는 상품입니다.');
    const p = s.player;
    if (item.equipmentKind) {
      const received = this.receiveEquipment(item.equipmentKind, item.defId, 'auto');
      if (!received || !received.ok) return received || result(false, '장비를 인도받지 못했습니다.');
      s.resources.scrap -= item.cost;
      if (received.destination === 'install' && item.equipmentKind === 'weapon') {
        const desired = p.weapons.filter(w => w.enabled).reduce((sum, weapon) => sum + weapon.power, 0);
        enableAvailablePower(this, 'weapons', Math.max(0, desired - p.systems.weapons.power));
      }
      rememberPower(this);
      this.log(`${item.name} 구매 · 스크랩 -${item.cost} · ${received.destination === 'cargo' ? '화물칸 보관' : '장착 완료'}`, 'reward');
      return { ...received, message: `${item.name} 구매 완료 · ${received.destination === 'cargo' ? '화물칸에 보관했습니다.' : '장비 슬롯에 장착했습니다.'}` };
    }
    s.resources.scrap -= item.cost;
    switch (itemId) {
      case 'repair': p.hull = Math.min(p.maxHull, p.hull + 5); break;
      case 'fuel': s.resources.fuel += 3; break;
      case 'missiles': s.resources.missiles += 4; break;
      case 'drone_parts': s.resources.droneParts = money(s.resources.droneParts) + 3; break;
      case 'hull_plating': {
        const added = Math.min(5, 40 - p.maxHull);
        p.maxHull += added; p.hull = Math.min(p.maxHull, p.hull + added); break;
      }
      case 'reactor': p.reactor += 1; break;
      case 'shields': p.systems.shields.level += 2; enableAvailablePower(this, 'shields', 2); break;
      case 'weapons': p.systems.weapons.level += 1; enableAvailablePower(this, 'weapons', 1); break;
      case 'engines': p.systems.engines.level += 1; enableAvailablePower(this, 'engines', 1); break;
      case 'drone_control': p.aux.drones.level += 2; enableAvailablePower(this, 'drones', 2); break;
      case 'teleporter': p.aux.teleporter.level += 1; enableAvailablePower(this, 'teleporter', p.aux.teleporter.level - p.aux.teleporter.power); break;
      case 'cloaking': p.aux.cloaking.level += 1; enableAvailablePower(this, 'cloaking', 1); break;
      case 'recruit_human':
      case 'recruit_engi':
      case 'recruit_mantis': {
        const added = this.addCrew(itemId.slice('recruit_'.length));
        if (!added || added.ok === false) { s.resources.scrap += item.cost; return added || result(false, '승무원을 고용하지 못했습니다.'); }
        break;
      }
      case 'crewheal': for (const c of alive(p)) c.hp = c.maxHp; break;
      default: s.resources.scrap += item.cost; return result(false, '구매할 수 없는 상품입니다.');
    }
    p.maxShield = Math.floor(p.systems.shields.power / 2);
    p.shield = p.maxShield;
    rememberPower(this);
    this.log(`${item.name} · 스크랩 -${item.cost}`, 'reward');
    return result(true, `${item.name} 구매 완료`);
  };

  Game.prototype.leaveShop = function () {
    if (this.state.mode !== 'shop') return result(false, '현재 거래소에 있지 않습니다.');
    this.state.mode = 'map'; this.state.paused = true;
    return result(true, '거래소를 떠났습니다. 다음 비콘을 선택하세요.');
  };

  Game.prototype.onEscape = function () {
    const s = this.state;
    if (s.mode !== 'combat' || s.resources.fuel < 1) return result(false, '지금은 탈출할 수 없습니다.');
    s.resources.fuel -= 1;
    s.fleet += 1; s.jumpCount += 1; s.stats.jumps = (s.stats.jumps || 0) + 1;
    s.campaign.firstRewardPending = false; s.campaign.combatBonus = 0;
    this.recoverShip(12);
    this.log('긴급 점프로 교전을 벗어났습니다. 연료 -1, 추격 +1. 전투 보상은 없습니다.', 'danger');
    if (s.campaign.bossInProgress && s.bossPhase > 0) retreatEvent(this);
    else { clearEncounter(this); s.mode = 'map'; s.reward = null; s.event = null; }
    return result(true, '긴급 탈출 완료');
  };
})();
