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
    if (!system || id === 'bridge' || id === 'battery') return;
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
    for (const id of ['scrap','fuel','missiles','droneParts']) reward[id] = Math.min(reward[id], Math.max(0, 1000000 - money(s.resources[id])));
    if (gains.hazardScrap) reward.hazardScrap = Math.min(reward.scrap, money(gains.hazardScrap));
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
      layoutId: aiProfile === 'artillery' ? 'flagship_v7' : 'interceptor_v7',
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
      { name: '반군 기함 · 감시자의 눈', layoutId: 'flagship_v7', aiProfile: 'boarding', hull: 20, shieldLayers: 1, weaponDefs: ['burst_laser', 'heavy_laser'], reactor: 12, crewCount: 4, crewTypes: ['human', 'engi', 'mantis', 'rock'], engineLevel: 1, boarding: true, boarderCount: 1, droneDefs: [], special: { kind: 'boarding', period: 26, warning: 6 } },
      { name: '반군 기함 · 부서진 왕관', layoutId: 'flagship_v7', aiProfile: 'raider', hull: 22, shieldLayers: 2, weaponDefs: ['burst_laser', 'heavy_laser'], reactor: 14, crewCount: 3, engineLevel: 2, droneDefs: ['combat'], droneParts: 5, special: { kind: 'drone_surge', period: 30, warning: 6 } },
      { name: '반군 기함 · 마지막 명령', layoutId: 'flagship_v7', aiProfile: 'artillery', hull: 22, shieldLayers: 2, weaponDefs: ['burst_laser', 'heavy_laser'], reactor: 13, crewCount: 3, engineLevel: 2, droneDefs: [], special: { kind: 'volley', period: 28, warning: 6 } }
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
    this.startCombat(scaleEnemy(this, { name: '출항로의 약탈선', enemy: true, layoutId: 'interceptor_v7', aiProfile: 'raider', hull: 10, shieldLayers: 0, weaponDefs: ['heavy_laser'], reactor: 5, crewCount: 2, engineLevel: 1 }));
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
    if (typeof this._resetAbilities === 'function') this._resetAbilities(ship);
    if (systems.battery) { systems.battery.power = 0; systems.battery.desiredPower = 0; }
    let available = powerCapacity(this, ship);
    for (const id of ['shields', 'weapons', 'engines', 'oxygen', 'medbay', 'drones', 'teleporter', 'cloaking', 'hacking', 'mind']) {
      const system = systems[id];
      if (!system) continue;
      system.power = Math.min(system.power, available);
      available -= system.power;
    }
    ship.systems.bridge.power = 0;
    const plan = this.state.campaign && this.state.campaign.powerPlan;
    if (plan) {
      for (const id of ['oxygen', 'shields', 'weapons', 'engines', 'medbay', 'drones', 'teleporter', 'cloaking', 'hacking', 'mind']) {
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
      { id: 'teleporter', name: '텔레포터 개량', description: '텔레포터 용량 +1, 최대 3. 가동 전력 1/2/3에서 재사용 대기 20/15/10초. 전송 전에 실제 텔레포터 확장실에 승무원을 집결하세요.', cost: 30, disabled: !aux.teleporter || aux.teleporter.level >= 3 },
      { id: 'cloaking', name: aux.cloaking?.level ? '은폐 장비 개량' : '은폐 장비 설치', description: '은폐 용량 +1, 최대 3. 전력 1/2/3에서 5/10/15초, 종료 후 대기 20초. 일반 무기 발사는 최대 지속 시간의 20%를 줄이며 빔은 예외입니다.', cost: aux.cloaking?.level ? 45 : 60, disabled: !aux.cloaking || aux.cloaking.level >= 3 },
      { id: 'hacking', name: aux.hacking?.level ? '해킹 장비 개량' : '해킹 장비 설치', description: '해킹 용량 +1, 최대 3. 부품 1로 표적 시스템에 드론을 부착한 뒤 4/7/10초 동안 교란합니다.', cost: aux.hacking?.level ? 40 : 55, disabled: !aux.hacking || aux.hacking.level >= 3 },
      { id: 'mind', name: aux.mind?.level ? '정신 제어 개량' : '정신 제어 설치', description: '정신 제어 용량 +1, 최대 3. 보이는 적 승무원 하나를 14/20/28초 동안 전향시킵니다.', cost: aux.mind?.level ? 40 : 50, disabled: !aux.mind || aux.mind.level >= 3 },
      { id: 'battery', name: aux.battery?.level ? '비상 배터리 개량' : '비상 배터리 설치', description: '배터리 용량 +1, 최대 2. 전력 소비 없이 30초간 반응로 용량 +2/+4. 종료 후 대기 20초.', cost: aux.battery?.level ? 30 : 35, disabled: !aux.battery || aux.battery.level >= 2 },
      { id: 'medbay', name: '의료 설비 개량', description: '의료 용량 +1, 최대 3. 치료와 의료 조건 선택지에 사용합니다.', cost: 28, disabled: sys.medbay.level >= 3 },
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
    return items.map(item => {
      const systemId=item.id==='drone_control'?'drones':item.id;
      if(DATA.systemCatalog[systemId]){
        const slot=this.getSystemSlots().find(candidate=>candidate.unlocked&&!candidate.systemId);
        const status=aux[systemId].level>0?this.getSystemUpgradeStatus(systemId):this.getSystemInstallStatus(slot?.id,systemId);
        return {...item,cost:status.cost,disabled:!status.ok,reason:status.message,systemId,slotId:slot?.id||null};
      }
      return {...item,disabled:Boolean(item.disabled||s.resources.scrap<item.cost)};
    });
  };

  Game.prototype.buy = function (itemId) {
    const s = this.state;
    if (s.mode !== 'shop') return result(false, '거래소에서만 구매할 수 있습니다.');
    const item = this.shopItems().find(i => i.id === itemId);
    if (!item) return result(false, '알 수 없는 상품입니다.');
    if (s.resources.scrap < item.cost) return result(false, '스크랩이 부족합니다.');
    if (item.disabled) return result(false, item.equipmentKind ? '장착 슬롯과 화물칸의 여유 공간을 확인하세요.' : '이미 최대 상태이거나 지금 적용할 수 없는 상품입니다.');
    const p = s.player;
    if(item.systemId){
      const upgraded=p.aux[item.systemId].level>0;
      const changed=upgraded?this.upgradeSystem(item.systemId):this.installSystem(item.slotId,item.systemId);
      if(changed.ok){rememberPower(this);this.log(item.name+' 구매 완료 · 전력을 확인하세요.','reward');}
      return changed;
    }
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
      case 'medbay': p.systems.medbay.level += 1; enableAvailablePower(this, 'medbay', 1); break;
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

  // The legacy flow remains available to genuine pre-v6 voyages. New voyages
  // use the persisted world/beacon/quest state below; opening a view never rolls RNG.
  const legacy = Object.fromEntries(['initCampaign','startRun','onCombatEnd','continueReward','jump','advanceSector','chooseEvent','shopItems','buy','onEscape'].map(name => [name, Game.prototype[name]]));
  const expanded = game => game.state.campaign?.routeMode === 'expanded';
  const copy = value => JSON.parse(JSON.stringify(value));
  const safeId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,90}$/.test(value);
  const plain = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const boundedInt = (value, max = 1000000) => Number.isInteger(value) && value >= 0 && value <= max;
  const region = game => game.state.campaign.world.nodes.find(n => n.id === game.state.campaign.world.currentId);
  const regionKind = game => DATA.sectorTypes[region(game)?.kind] || DATA.sectorTypes.civilian;
  function syncLegacy(game) {
    const s=game.state,c=s.campaign;
    if(c.routeMode!=='legacy')return;
    c.mapTurns=s.jumpCount;c.world.currentId=`legacy-${s.sector}`;
    c.world.route=c.world.nodes.filter(n=>n.depth<=s.sector).map(n=>n.id);
    for(const entry of c.world.nodes)entry.visited=entry.depth<=s.sector;
    for(const entry of s.nodes){
      for(const [key,value]of Object.entries(completeNodeFields(entry)))if(entry[key]===undefined)entry[key]=value;
      entry.visits=entry.visited?Math.max(1,entry.visits):0;
    }
  }

  function makeWorld(game) {
    const nodes = [], kinds = ['civilian','industrial','raider','mantis','nebula','rebel'];
    for (let depth = 1; depth <= 8; depth++) {
      const count = depth === 1 || depth === 8 ? 1 : 3;
      const offset = Math.floor(game.rand() * kinds.length);
      for (let lane = 0; lane < count; lane++) {
        const kind = depth === 1 ? 'civilian' : depth === 8 ? 'final' : kinds[(offset + lane * 2 + depth) % kinds.length];
        const definition = DATA.sectorTypes[kind];
        nodes.push({ id: `w${depth}-${lane}`, depth, lane, kind, name: depth === 1 || depth === 8 ? DATA.sectorNames[depth-1] : `${DATA.sectorNames[depth-1]} · ${definition.name}`, description: definition.description, category: definition.category, color: definition.color, links: [], visited: depth === 1 });
      }
    }
    for (const entry of nodes) entry.links = nodes.filter(n => n.depth === entry.depth + 1 && (entry.depth === 1 || entry.depth === 7 || Math.abs(entry.lane - n.lane) <= 1)).map(n => n.id);
    return { currentId: 'w1-0', route: ['w1-0'], nodes };
  }
  function completeNodeFields(entry) {
    return { ...entry, visits: entry.visited ? 1 : 0, resolved: Boolean(entry.visited), occupied: false, discovered: Boolean(entry.visited || entry.type === 'exit' || entry.type === 'boss'), nebula: false, eventId: null, questId: null, store: null, clearedVisit: 0 };
  }
  function makeLocalMap(game) {
    const s = game.state, prefix = `s${s.sector}`, kind = regionKind(game), final = s.sector === 8;
    const entries = [completeNodeFields({id:`${prefix}-start`,col:0,row:1,type:'start',label:'진입 비콘',visited:true,links:[],environment:null,hazardScrap:0})];
    const layout = {1:['combat','event','repair'],2:['shop','combat','shop'],3:['event','event','combat'],4:['combat','event','event'],5:['event','combat','event'],6:['combat','event','combat']};
    for (let col = 1; col <= 6; col++) for (let row = 0; row < 3; row++) {
      let type = layout[col][row];
      if (final) type = (col === 2 && row === 0) || (col === 5 && row === 2) ? 'repair' : col === 3 && row === 1 ? 'base' : (col + row) % 3 === 0 ? 'combat' : 'empty';
      const eventId = !final && type === 'event' ? kind.eventPool[Math.floor(game.rand() * kind.eventPool.length)] : null;
      const nebula = !final && (kind.id === 'nebula' ? (col + row) % 4 !== 0 : (col === 3 && row === 2) || (col === 5 && row === 0));
      const hazardList = ['asteroids','solar','ion_storm'];
      const environment = !final && type === 'combat' && ((col === 1 && row === 0) || (col === 3 && row === 2)) ? (nebula ? 'ion_storm' : hazardList[(s.sector + row - 1) % 3]) : null;
      const labels = {combat:'미확인 무장 신호',event:'미확인 신호',shop:'떠돌이 거래소',repair:final?'연방 수리 거점':'독립 정비소',base:'연방 기지',empty:'조용한 비콘'};
      entries.push({...completeNodeFields({id:`${prefix}-${col}-${row}`,col,row,type,label:labels[type],visited:false,links:[],environment,hazardScrap:environment?8:0}),eventId,nebula});
    }
    entries.push(completeNodeFields({id:`${prefix}-exit`,col:7,row:1,type:final?'repair':'exit',label:final?'외곽 보급 거점':'섹터 출구',visited:false,links:[],environment:null,hazardScrap:0}));
    for (const entry of entries) entry.links = entries.filter(other => other.id !== entry.id && ((Math.abs(other.col-entry.col) === 1 && (entry.col===0 || other.col===0 || entry.col===7 || other.col===7 || Math.abs(other.row-entry.row)<=1)) || (other.col===entry.col && Math.abs(other.row-entry.row)===1))).map(other => other.id);
    if (!final && s.sector <= 3) entries.find(n => n.col===1 && n.row===1).eventId = ['relay','refugees','blueprint'][s.sector-1];
    entries[0].resolved = s.sector !== 1;
    return entries;
  }
  function revealNeighbors(game) {
    const s = game.state, current = node(game,s.currentNodeId);
    for (const entry of s.nodes) if (entry.id === current?.id || current?.links.includes(entry.id) || entry.type==='exit' || entry.type==='base' || entry.questId || entry.visited) entry.discovered = true;
  }
  function questHistory(game, quest, text) {
    quest.history.push({text,turn:game.state.campaign.mapTurns});
    if (quest.history.length > DATA.campaignRules.maxQuestHistory) quest.history.shift();
  }
  function finishQuest(game, quest, status, text) {
    if (!quest || quest.status !== 'active') return;
    quest.status = status;
    for (const entry of game.state.nodes) if (entry.questId===quest.id) entry.questId=null;
    questHistory(game,quest,text);
    game.log(`${DATA.questDefinitions[quest.definitionId].name} · ${text}`, status==='completed'?'reward':'warning');
  }
  function checkQuestExpiry(game) {
    const s=game.state;
    for (const quest of s.campaign.quests) {
      if (quest.status!=='active') continue;
      if (quest.deadlineTurn!==null && s.campaign.mapTurns>quest.deadlineTurn) finishQuest(game,quest,'failed','연락 기한이 지나 임무가 종료되었습니다.');
      else if (quest.targetSectorId===s.campaign.world.currentId && node(game,quest.targetNodeId)?.occupied) finishQuest(game,quest,'failed','목적지가 반군에게 점령되었습니다.');
    }
  }
  function advanceFront(game, amount) {
    const s=game.state,c=s.campaign;
    const absorbed=Math.min(c.fleetDelay,Math.max(0,amount));
    c.fleetDelay-=absorbed;s.fleet=Math.min(1000000,s.fleet+Math.max(0,amount-absorbed));
    const front=DATA.campaignRules.fleetStart+s.fleet;
    for(const entry of s.nodes) if(entry.col<=front) entry.occupied=true;
    checkQuestExpiry(game);
  }
  function finalTurn(game, destinationId) {
    const s=game.state, stand=s.campaign.finalStand;
    if (!stand) return;
    stand.turn+=1;
    if (destinationId===stand.bossNodeId) return;
    const route=[`s8-6-1`,`s8-5-1`,`s8-4-1`,stand.baseNodeId];
    if(stand.bossNodeId!==stand.baseNodeId && stand.turn%2===0) {
      stand.routeIndex=Math.min(route.length-1,stand.routeIndex+1);stand.bossNodeId=route[stand.routeIndex];
      game.log(`반군 기함 이동 · ${node(game,stand.bossNodeId)?.label||'연방 기지 접근'}`, 'warning');
    }
    if(destinationId===stand.bossNodeId) return;
    if(stand.bossNodeId===stand.baseNodeId) {
      stand.baseTurns+=1;
      if(stand.baseTurns>=3) {
        clearEncounter(game);s.mode='defeat';s.combatResolved=true;s.event=null;s.reward=null;
        game.log('반군 기함이 연방 기지를 파괴했습니다. 마지막 신호가 끊겼습니다.','danger');
      } else game.log(`기지가 공격받고 있습니다. ${3-stand.baseTurns}번의 지도 행동 안에 기함을 저지하세요.`, 'danger');
    }
  }
  function mapTurn(game,target,extra=0) {
    const s=game.state;s.campaign.mapTurns+=1;
    if(s.campaign.finalStand) finalTurn(game,target?.id||null);
    else {
      const factor=target?.nebula?(regionKind(game).id==='nebula'?0.8:0.5):1;
      advanceFront(game,DATA.campaignRules.fleetAdvance*factor+extra);
    }
    checkQuestExpiry(game);
  }
  function expandedEnemy(game, elite=false, fleet=false) {
    const s=game.state,depth=s.sector,kind=regionKind(game);
    const profile=fleet?'artillery':kind.enemyProfiles[Math.floor(game.rand()*kind.enemyProfiles.length)];
    let weapons=depth<=2?['burst_laser']:depth<=4?['burst_laser','heavy_laser']:['burst_laser','heavy_laser','ion'];
    if(profile==='disruptor' && depth>=2) weapons=['burst_laser','ion',...(depth>=5?['heavy_laser']:[])];
    if(profile==='artillery') weapons=depth<=2?['heavy_laser','artemis']:['burst_laser','artemis',...(depth>=6?['heavy_laser']:[])];
    const boarding=profile==='boarding'&&depth>=2;
    const hacking=!fleet&&depth>=5&&profile==='disruptor'?1:0,mind=!fleet&&depth>=6&&profile==='boarding'?1:0;
    return scaleEnemy(game,{name:fleet?'반군 점령지 초계함':`${kind.name} · ${DATA.enemyProfiles[profile].name}`,enemy:true,aiProfile:profile,layoutId:profile==='artillery'?'flagship_v7':'interceptor_v7',hull:10+depth*2+(elite?3:0)+(fleet?3:0),shieldLayers:depth===1&&!elite?0:depth<=3?1:depth<=6?2:3,weaponDefs:weapons,weaponLevel:Math.max(4,weapons.reduce((n,id)=>n+DATA.weapons[id].power,0)),reactor:depth>=5?18:depth>=3?14:10,engineLevel:depth<=2?1:depth<=5?2:3,crewCount:boarding?4:depth<=2?2:3,crewTypes:boarding?['human','engi','mantis','rock']:['human','engi','rock'],boarding,boarderCount:boarding?1:0,droneDefs:depth>=5?[profile==='artillery'?'defense':'combat']:[],droneParts:6,auxLevels:{hacking,mind},auxPower:{hacking,mind},special:boarding?{kind:'boarding',period:32,warning:6}:undefined,bossPhase:0});
  }
  function startExpandedCombat(game,spec,context) {
    const s=game.state;
    s.campaign.encounter={kind:'normal',nodeId:s.currentNodeId,questId:null,questAction:null,...context};
    s.campaign.activeEventId=null;s.event=null;s.reward=null;
    rememberPower(game);game.startCombat(spec);
  }
  function startFinalBoss(game) {
    const s=game.state,phase=s.campaign.finalStand.phase;
    const spec={...bossEnemy(phase),hull:[0,28,30,32][phase],shieldLayers:phase===1?2:3,reactor:20,weaponDefs:['burst_laser','heavy_laser',...(phase===3?['artemis']:[])],enemy:true,bossPhase:phase};
    s.bossPhase=phase;s.campaign.bossInProgress=true;
    startExpandedCombat(game,scaleEnemy(game,spec),{kind:'boss'});
    game.log(`반군 기함 ${phase}/3단계와 접촉했습니다.`, 'danger');
    return result(true,`기함 ${phase}단계 전투 준비`);
  }
  function enterBeacon(game,target) {
    const s=game.state,c=s.campaign;
    if(c.finalStand && target.id===c.finalStand.bossNodeId) return startFinalBoss(game);
    if(target.occupied) {
      startExpandedCombat(game,{...expandedEnemy(game,true,true),environment:target.environment},{kind:'fleet'});
      return result(true,'반군 점령 비콘에 도착했습니다. 승리 보상은 탈출 연료 1뿐입니다.');
    }
    const quest=c.quests.find(q=>q.id===target.questId&&q.status==='active');
    if(quest) return showQuestEvent(game,quest);
    if(target.type==='exit') {c.pendingSectorChoice=true;s.mode='map';return result(true,'다음 섹터의 항로를 선택하세요.');}
    if(target.type==='shop') {
      if(!target.store) target.store={stock:{...DATA.shopStock}};
      s.mode='shop';s.event=null;s.reward=null;return result(true,'교역소에 도착했습니다. 재고는 재방문해도 유지됩니다.');
    }
    if(target.resolved) {s.mode='map';return result(true,'이미 조사한 비콘입니다. 연료와 추격 비용은 적용됩니다.');}
    if(target.type==='combat') {
      startExpandedCombat(game,{...expandedEnemy(game),environment:target.environment},{kind:'normal'});
      if(target.environment)game.log(DATA.environments[target.environment].description,'warning');
    } else if(target.type==='event') showDefinition(game,target.eventId||'relay');
    else if(target.type==='repair') {
      target.resolved=true;
      if(c.finalStand)c.finalStand.repairUsed.push(target.id);
      return award(game,'한 번 더 도약할 수 있도록','정비소에서 선체와 보급품을 지원했습니다. 이 비콘의 지원은 한 번뿐입니다.',{hull:c.finalStand?7:5,fuel:2,missiles:2,droneParts:1});
    } else {target.resolved=true;s.mode='map';game.log(target.type==='base'?'연방 기지가 마지막 신호를 기다립니다.':'아무도 없는 비콘입니다.','info');}
    return result(true,`${target.label} 도착`);
  }
  function moveToBeacon(game,target,escape=false) {
    const s=game.state,c=s.campaign;
    s.resources.fuel-=1;s.jumpCount+=1;s.stats.jumps+=1;c.pendingSectorChoice=false;
    s.currentNodeId=target.id;s.selectedNodeId=null;target.visited=true;target.visits=Math.min(1000000,target.visits+1);
    game.recoverShip(0);clearEncounter(game);s.event=null;s.reward=null;c.activeEventId=null;c.encounter=null;c.bossInProgress=false;c.combatBonus=0;
    mapTurn(game,target);revealNeighbors(game);
    if(s.mode==='defeat')return result(true,'연방 기지가 함락되었습니다.');
    s.mode='map';game.log(`${escape?'긴급 탈출 → ':''}${target.label} · 연료 -1`,escape?'warning':'info');
    return enterBeacon(game,target);
  }

  Game.prototype.initCampaign=function(){
    legacy.initCampaign.call(this);const s=this.state,c=s.campaign;
    Object.assign(c,{routeMode:'expanded',totalSectors:8,world:makeWorld(this),fleetDelay:0,mapTurns:0,quests:[],flags:{},encounter:null,finalStand:null,pendingSectorChoice:false});
    s.nodes=makeLocalMap(this);s.currentNodeId='s1-start';revealNeighbors(this);return result(true,'여덟 섹터의 항로를 준비했습니다.');
  };
  Game.prototype.startRun=function(){
    const answer=legacy.startRun.call(this);
    if(answer.ok&&expanded(this))this.state.campaign.encounter={kind:'normal',nodeId:this.state.currentNodeId,questId:null,questAction:null};
    return answer;
  };
  Game.prototype.getWorldMap=function(){
    const s=this.state,c=s.campaign,w=c.world,current=w.nodes.find(n=>n.id===w.currentId);
    return {currentId:w.currentId,currentDepth:s.sector,totalSectors:c.totalSectors,nodes:copy(w.nodes),availableIds:(current?.links||[]).slice(),route:w.route.slice()};
  };
  Game.prototype.getFleetInfo=function(nodeId){
    const s=this.state,c=s.campaign,destination=nodeId?node(this,nodeId):node(this,s.currentNodeId),factor=destination?.nebula?(regionKind(this).id==='nebula'?0.8:0.5):1;
    return {frontCol:expanded(this)?DATA.campaignRules.fleetStart+s.fleet:-2+s.fleet*.75,nextAdvance:c.finalStand?0:Math.max(0,DATA.campaignRules.fleetAdvance*factor-(c.fleetDelay||0)),delay:c.fleetDelay||0,occupiedNodeIds:s.nodes.filter(n=>n.occupied).map(n=>n.id)};
  };
  Game.prototype.getJumpStatus=function(nodeId,options={}){
    const s=this.state,current=node(this,s.currentNodeId),target=node(this,nodeId);
    const answer={ok:false,message:'연결된 비콘을 선택하세요.',fuelCost:1,revisit:Boolean(target?.visited),occupied:Boolean(target?.occupied),environment:target?.environment||null};
    if(expanded(this)&&s.mode==='map'&&target?.id===current?.id&&s.campaign.finalStand?.bossNodeId===current.id)return {...answer,ok:true,message:'현재 비콘의 반군 기함과 교전합니다. 이동과 연료 소비는 없습니다.',fuelCost:0};
    if(!current||!target||target.id===current.id||!current.links.includes(target.id))return answer;
    if(expanded(this)&&!s.campaign.finalStand){const forecast=this.getFleetInfo(target.id);answer.occupied=answer.occupied||target.col<=forecast.frontCol+forecast.nextAdvance;}
    if(!expanded(this)&&target.visited)return {...answer,message:'이전 항해에서는 미방문 비콘으로 이동합니다.'};
    if(s.mode==='combat'||options.escape){const status=this.getEscapeStatus?.();if(!status?.ok)return {...answer,message:status?.message||'탈출 준비가 완료되지 않았습니다.'};}
    else if(s.mode!=='map')return {...answer,message:'현재 사건이나 보상을 먼저 마무리하세요.'};
    if(s.resources.fuel<1)return {...answer,message:'연료가 없습니다. 구조 신호를 보내세요.'};
    return {...answer,ok:true,message:answer.occupied?'도착 시 반군 점령지입니다. 강한 적과 교전합니다.':target.visited?'재방문 · 연료 1과 추격 1턴을 사용합니다.':'연료 1을 사용해 도약합니다.'};
  };
  Game.prototype.jump=function(nodeId){
    if(!expanded(this)){const answer=legacy.jump.call(this,nodeId);syncLegacy(this);return answer;}
    if(this.state.mode!=='map')return result(false,'지도에서 도약하거나 전투 중 탈출 목적지를 선택하세요.');
    const status=this.getJumpStatus(nodeId);
    if(!status.ok){if(this.state.resources.fuel===0&&node(this,this.state.currentNodeId)?.links.includes(nodeId))this.waitForFuel();return result(false,status.message);}
    if(status.fuelCost===0)return this.engageFlagship();
    return moveToBeacon(this,node(this,nodeId));
  };
  Game.prototype.engageFlagship=function(){
    const s=this.state;
    if(!expanded(this)||s.mode!=='map'||!s.campaign.finalStand||s.campaign.finalStand.bossNodeId!==s.currentNodeId)return result(false,'현재 비콘에 교전할 기함이 없습니다.');
    return startFinalBoss(this);
  };
  Game.prototype.waitAtBeacon=function(){
    const s=this.state;
    if(!expanded(this)||s.mode!=='map'||!s.campaign.finalStand)return result(false,'최종 방어선의 지도에서만 현 위치 대기를 할 수 있습니다.');
    if(s.campaign.finalStand.bossNodeId===s.currentNodeId)return startFinalBoss(this);
    mapTurn(this,node(this,s.currentNodeId));
    if(s.mode==='defeat')return result(true,'대기 중 연방 기지가 함락되었습니다.');
    if(s.campaign.finalStand.bossNodeId===s.currentNodeId)return startFinalBoss(this);
    this.log('현 비콘에서 기함의 이동을 기다렸습니다. 연료를 쓰지 않고 지도 1턴이 지났습니다.','info');
    return result(true,'지도 1턴 대기. 기함 위치와 기지의 남은 시간을 확인하세요.');
  };
  Game.prototype.escapeTo=function(nodeId){
    if(!expanded(this))return result(false,'이전 항해에서는 기존 긴급 탈출을 사용하세요.');
    const status=this.getJumpStatus(nodeId,{escape:true});
    if(this.state.mode!=='combat'||!status.ok)return result(false,status.message);
    const context=this.state.campaign.encounter;
    if(typeof this._executeEscape!=='function')return result(false,'긴급 탈출을 실행하지 못했습니다.');
    const escaped=this._executeEscape();
    if(!escaped||escaped.ok===false)return result(false,escaped?.message||'긴급 탈출을 실행하지 못했습니다.');
    if(context?.questId)finishQuest(this,this.state.campaign.quests.find(q=>q.id===context.questId),'failed','목적지 교전에서 철수하여 임무가 종료되었습니다.');
    this.state.campaign.firstRewardPending=false;
    return moveToBeacon(this,node(this,nodeId),true);
  };
  Game.prototype.advanceSector=function(worldNodeId){
    if(!expanded(this)){const answer=legacy.advanceSector.call(this);syncLegacy(this);return answer;}
    const s=this.state,c=s.campaign,current=node(this,s.currentNodeId),world=c.world,from=world.nodes.find(n=>n.id===world.currentId),target=world.nodes.find(n=>n.id===worldNodeId);
    if(s.mode!=='map'||!c.pendingSectorChoice||current?.type!=='exit'||!target||!from.links.includes(target.id)||s.sector>=8)return result(false,'출구에서 연결된 다음 섹터를 선택하세요.');
    if(s.resources.fuel<1){this.waitForFuel();return result(false,'장거리 도약 연료 1이 필요합니다.');}
    for(const quest of c.quests)if(quest.status==='active'&&quest.targetSectorId===world.currentId)finishQuest(this,quest,'abandoned','목적지를 방문하지 않고 섹터를 떠났습니다.');
    s.resources.fuel-=1;s.jumpCount+=1;s.stats.jumps+=1;c.mapTurns+=1;
    s.sector=target.depth;s.fleet=0;c.fleetDelay=0;s.bossPhase=0;target.visited=true;world.currentId=target.id;world.route.push(target.id);
    c.pendingSectorChoice=false;c.bossInProgress=false;c.encounter=null;c.activeEventId=null;c.pendingRewardAction=null;
    c.finalStand=s.sector===8?{baseNodeId:'s8-3-1',bossNodeId:'s8-6-1',phase:1,routeIndex:0,baseTurns:0,turn:0,repairUsed:[]}:null;
    s.nodes=makeLocalMap(this);s.currentNodeId=`s${s.sector}-start`;s.selectedNodeId=null;s.event=null;s.reward=null;
    this.recoverShip(0);clearEncounter(this);s.mode='map';
    for(const quest of c.quests)if(quest.status==='active'&&!quest.targetNodeId)placeQuest(this,quest);
    checkQuestExpiry(this);revealNeighbors(this);
    this.log(`${s.sector}/8섹터 · ${target.name} 진입. 연료 -1.`, 'info');
    return result(true,`${target.name}에 진입했습니다.`);
  };
  Game.prototype.continueReward=function(){
    if(!expanded(this))return legacy.continueReward.call(this);
    const s=this.state;
    if(s.mode!=='reward')return result(false,'확인할 보상이 없습니다.');
    if(s.reward?.salvage?.status==='pending')return result(false,'회수품을 회수하거나 분해하세요.');
    s.reward=null;s.campaign.pendingRewardAction=null;s.mode='map';s.paused=true;
    const current=node(this,s.currentNodeId);
    if(current?.type==='exit'&&s.sector<8)s.campaign.pendingSectorChoice=true;
    return result(true,'항로를 선택하세요.');
  };

  function choiceDef(id,label,description,effect={},requirements=[],costs={}) {
    return {id,label,description,effect,requirements,costs,style:requirements.length?'blue':'normal'};
  }
  function choiceProblem(game,choice) {
    const s=game.state,ship=s.player;
    for(const [id,cost] of Object.entries(choice.costs||{}))if(!boundedInt(cost)||!Object.hasOwn(s.resources,id)||s.resources[id]<cost)return `${({scrap:'스크랩',fuel:'연료',missiles:'미사일',droneParts:'드론 부품'})[id]||'자원'}이 부족합니다.`;
    for(const condition of choice.requirements||[]) {
      const home=alive(ship).filter(c=>(c.shipId||'player')==='player');
      if(condition.kind==='crew'&&!home.some(c=>c.species===condition.species))return `${DATA.crewTypes[condition.species]?.name||'해당 종족'} 생존 승무원이 본함에 필요합니다.`;
      if(condition.kind==='skill'&&!home.some(c=>game.getCrewSkillLevel?.(c,condition.id)>=condition.level))return `${DATA.skillNames[condition.id]} 숙련 ${condition.level}단계가 필요합니다.`;
      if(condition.kind==='system') {
        const system=allSystems(ship)[condition.id];
        if(!system||(system.level-(condition.operational?system.damage+(system.ionStacks||0):0))<condition.level)return `${DATA.systemNames[condition.id]} 정상 용량 ${condition.level}이 필요합니다.`;
      }
      if(condition.kind==='weapon'&&!ship.weapons.some(w=>w.defId===condition.defId))return `${DATA.weapons[condition.defId]?.name} 장착이 필요합니다.`;
      if(condition.kind==='drone'&&!ship.drones.some(d=>d.defId===condition.defId))return `${DATA.drones[condition.defId]?.name} 장착이 필요합니다.`;
      if(condition.kind==='flag'&&s.campaign.flags[condition.id]!==condition.value)return '이전 사건의 조건을 충족하지 못했습니다.';
    }
    const effect=choice.effect||{};
    if(effect.recruit&&alive(ship).length>=8)return '승무원 정원 8명이 모두 찼습니다.';
    if(effect.questStart) {
      if(s.campaign.quests.some(q=>q.definitionId===effect.questStart))return '이미 맡았거나 종료한 임무입니다.';
      if(s.campaign.quests.length>=DATA.campaignRules.maxQuests)return '퀘스트 기록이 가득 찼습니다.';
      if(s.sector>=8||(s.sector>=7&&effect.questStart!=='escort'))return '남은 일반 섹터가 부족해 이 임무를 완료할 수 없습니다.';
    }
    const possible=effect.outcomes?effect.outcomes.map(x=>({...effect,...x.effect})): [effect];
    for(const e of possible)for(const id of ['scrap','fuel','missiles','droneParts'])if(s.resources[id]-(choice.costs?.[id]||0)+(e[id]||0)+(id==='scrap'&&e.installMind&&(ship.aux.mind.level>0||!game.getSystemSlots().some(slot=>slot.unlocked&&!slot.systemId))?35:0)>1000000)return '보급품 보유 한도를 초과합니다.';
    return '';
  }
  function setExpandedEvent(game,definition,kind='event',questId=null) {
    const s=game.state;
    clearEncounter(game);s.mode='event';s.reward=null;s.campaign.encounter=null;s.campaign.activeEventId=`v6_${definition.id}`;
    s.event={instanceId:game._id('event'),definitionId:definition.id,stepId:definition.stepId||'main',kind,questId,title:definition.title,body:definition.body,choices:definition.choices.map(choice=>{
      const reason=choiceProblem(game,choice);
      return {id:choice.id,label:choice.label,description:choice.description,style:choice.style||'normal',requirements:copy(choice.requirements||[]),costs:{...(choice.costs||{})},disabled:Boolean(reason),reason};
    })};
    return result(true,definition.title);
  }
  function showDefinition(game,id) {
    const definition=DATA.events[id];
    if(!definition)return result(false,'사건 데이터를 찾을 수 없습니다.');
    return setExpandedEvent(game,definition);
  }
  function placeQuest(game,quest) {
    const s=game.state,c=s.campaign,current=node(game,s.currentNodeId);
    if(quest.status!=='active')return false;
    if(s.sector>=8){finishQuest(game,quest,'failed','최종 방어선에는 일반 임무 목적지를 만들 수 없습니다.');return false;}
    if(quest.targetDepth>s.sector)return false;
    const candidates=s.nodes.filter(n=>!n.visited&&!n.resolved&&!n.occupied&&!n.questId&&['event','empty','combat'].includes(n.type)&&n.col>current.col&&n.col<=Math.min(6,current.col+3));
    candidates.sort((a,b)=>Math.abs(a.col-(current.col+2))-Math.abs(b.col-(current.col+2))||Number(a.type==='combat')-Number(b.type==='combat')||Math.abs(a.row-current.row)-Math.abs(b.row-current.row)||a.id.localeCompare(b.id));
    if(!candidates.length) {
      if(s.sector>=7){finishQuest(game,quest,'failed','임무 목적지를 확보할 수 없고 더 이상 일반 섹터가 남아 있지 않습니다.');return false;}
      quest.targetDepth=s.sector+1;quest.targetSectorId=null;quest.targetNodeId=null;
      questHistory(game,quest,'안전한 목적지가 없어 다음 섹터로 약속을 옮겼습니다.');return false;
    }
    const target=candidates[0];target.questId=quest.id;target.discovered=true;
    quest.targetDepth=s.sector;quest.targetSectorId=c.world.currentId;quest.targetNodeId=target.id;
    questHistory(game,quest,`${s.sector}섹터 ${target.col}-${target.row+1} 비콘에 목적지가 표시되었습니다.`);
    return true;
  }
  function startQuest(game,definitionId) {
    const s=game.state,c=s.campaign,definition=DATA.questDefinitions[definitionId];
    const quest={id:game._id('quest'),definitionId,stage:0,status:'active',originSectorId:c.world.currentId,targetDepth:s.sector,targetSectorId:null,targetNodeId:null,deadlineTurn:c.mapTurns+definition.deadline,rewardClaimed:false,history:[]};
    c.quests.push(quest);questHistory(game,quest,'의뢰를 수락했습니다.');placeQuest(game,quest);
    game.log(`${definition.name} · 항해 일지에 목적지를 기록했습니다.`, 'info');return quest;
  }
  function advanceQuest(game,quest) {
    if(!quest||quest.status!=='active')return;
    const s=game.state,c=s.campaign;
    const previous=node(game,quest.targetNodeId);if(previous){previous.questId=null;previous.resolved=true;}
    quest.stage+=1;questHistory(game,quest,'첫 번째 목적지의 임무를 마쳤습니다.');
    quest.targetNodeId=null;quest.targetSectorId=null;
    quest.deadlineTurn=c.mapTurns+DATA.questDefinitions[quest.definitionId].deadline;
    if(quest.definitionId==='escort'){quest.targetDepth=s.sector;placeQuest(game,quest);}
    else if(s.sector>=7)finishQuest(game,quest,'failed','기록은 회수했지만 전달할 일반 섹터가 남아 있지 않습니다.');
    else {quest.targetDepth=s.sector+1;questHistory(game,quest,'다음 섹터에 진입하면 최종 목적지가 표시됩니다.');}
  }
  function questDefinition(game,quest) {
    const stage=quest.stage,kind=quest.definitionId;
    const R=(id,label,description,effect={},requirements=[],costs={})=>choiceDef(id,label,description,{...effect,questId:quest.id},requirements,costs);
    const giveUp=R('quest_abandon','임무에서 철수한다','퀘스트가 포기로 기록됩니다. 추가 비용은 없습니다.',{questAbandon:true});
    if(kind==='relay'&&stage===0)return {id:'quest_relay_0',title:'답장 없는 중계기',body:'우회 중계기는 반군 감시선 아래에 있습니다. 기기를 복구하거나 감시선을 제거해야 합니다.',choices:[
      R('quest_relay_engi','[엔지] 송신 회로를 복구한다','첫 단계 완료. 다음 섹터 연락선의 좌표를 확보합니다.',{questAdvance:true,scrap:10},[{kind:'crew',species:'engi'}]),
      R('quest_relay_ion','[이온 펄스] 감시 회로를 잠근다','연료 1 사용. 첫 단계 완료, 다음 섹터로 이어집니다.',{questAdvance:true,scrap:14},[{kind:'weapon',defId:'ion'}],{fuel:1}),
      R('quest_relay_fight','감시선을 격파한다','일반 전투 승리 시 첫 단계 완료. 탈출하면 임무 실패.',{combat:'normal',questAction:'advance',combatBonus:8}),giveUp]};
    if(kind==='relay')return {id:'quest_relay_1',title:'멀리서 온 답장',body:'연락선은 복구된 좌표를 기다리고 있었습니다. 손으로 쓴 답장과 함께 다른 배들의 항로가 전송됩니다.',choices:[
      R('quest_relay_deliver','좌표를 전달하고 연료를 받는다','퀘스트 완료. 스크랩 32 + 연료 4 + 추격 1.5열 지연.',{questComplete:true,scrap:32,fuel:4,fleetDelay:1.5}),
      R('quest_relay_hacking','[해킹] 감시망의 빈틈까지 전달한다','부품 1 → 완료 보상 스크랩 28 + 이온 회수품 + 추격 2열 지연.',{questComplete:true,scrap:28,salvage:{kind:'weapon',defId:'ion'},fleetDelay:2},[{kind:'system',id:'hacking',level:1,operational:true}],{droneParts:1}),giveUp]};
    if(kind==='escort'&&stage===0)return {id:'quest_escort_0',title:'호송선의 교차로',body:'난민선이 도착했지만 약탈선도 뒤따랐습니다. 대피소까지 남은 길을 열어야 합니다.',choices:[
      R('quest_escort_fight','약탈선을 저지한다','승리 시 호송 1단계 완료. 철수하면 호송 실패.',{combat:'normal',questAction:'advance',combatBonus:10}),
      R('quest_escort_cloak','[은폐] 난민선을 그림자 항로로 인도한다','연료 1 사용. 전투 없이 첫 단계 완료.',{questAdvance:true},[{kind:'system',id:'cloaking',level:1,operational:true}],{fuel:1}),
      R('quest_escort_pay','통행권을 산다','스크랩 22 소비. 전투 없이 첫 단계 완료.',{questAdvance:true},[],{scrap:22}),giveUp]};
    if(kind==='escort')return {id:'quest_escort_1',title:'같은 노래가 들리는 항구',body:'난민선들이 대피소에 도착했습니다. 항구 사람들은 보급품을 모으고, 정비사 한 명이 동행을 자청합니다.',choices:[
      R('quest_escort_supplies','함선을 정비하고 작별한다','퀘스트 완료. 선체 6 + 스크랩 35 + 연료 3.',{questComplete:true,hull:6,scrap:35,fuel:3}),
      R('quest_escort_recruit','엔지 정비사를 태운다','퀘스트 완료. 엔지 라온 합류 + 선체 4. 정원이 가득 차면 다른 보상을 고르세요.',{questComplete:true,hull:4,recruit:{species:'engi',name:'라온'}}),giveUp]};
    if(kind==='blueprint'&&stage===0)return {id:'quest_blueprint_0',title:'폐쇄된 연구선',body:'연구 기록은 부서진 내부 구획에 남았습니다. 선체를 대거나 전송 장비로 회수할 수 있습니다.',choices:[
      R('quest_blueprint_teleport','[텔레포터] 기록을 회수한다','연료 1 사용. 첫 단계 완료, 다음 섹터 연구 거점으로 이어집니다.',{questAdvance:true,droneParts:1},[{kind:'system',id:'teleporter',level:1,operational:true}],{fuel:1}),
      R('quest_blueprint_rock','[록] 무너진 구획을 통과한다','손실 없이 첫 단계 완료.',{questAdvance:true},[{kind:'crew',species:'rock'}]),
      R('quest_blueprint_dock','연구선에 직접 접안한다','선체 최대 3 손실. 함선은 파괴되지 않으며 첫 단계 완료.',{questAdvance:true,hull:-3}),giveUp]};
    return {id:'quest_blueprint_1',title:'다시 쓰이는 설계도',body:'연구진이 기록을 복원했습니다. 완성된 장비 하나 또는 새로운 제어 기술을 제공하겠다고 합니다.',choices:[
      R('quest_blueprint_beam','빔 설계도를 받는다','퀘스트 완료. 아크 빔 회수품 + 스크랩 24.',{questComplete:true,salvage:{kind:'weapon',defId:'beam'},scrap:24}),
      R('quest_blueprint_mind','[엔지] 정신 제어 설비를 설치한다','퀘스트 완료. 빈 마운트에 정신 제어 1단계·전력 0으로 설치. 빈 마운트가 없거나 이미 설치했으면 스크랩 35를 대신 받습니다.',{questComplete:true,installMind:true},[{kind:'crew',species:'engi'}]),
      R('quest_blueprint_drone','공격 드론 설계도를 받는다','퀘스트 완료. 공격 드론 회수품 + 부품 4.',{questComplete:true,salvage:{kind:'drone',defId:'combat'},droneParts:4}),giveUp]};
  }
  function showQuestEvent(game,quest){return setExpandedEvent(game,questDefinition(game,quest),'quest',quest.id);}
  function distressDefinition(){return {id:'fuel_distress_v6',title:'별빛 아래, 멈춘 엔진',body:'연료 탱크가 비었습니다. 물자를 거래하거나 구조 신호를 켜고 기다릴 수 있습니다. 창을 여는 것만으로 시간은 흐르지 않습니다.',choices:[
    choiceDef('distress_trade','예비 자재로 연료를 산다','스크랩 12 → 연료 3. 기다리지 않습니다.',{fuel:3},[],{scrap:12}),
    choiceDef('distress_wait','구조 신호를 켜고 기다린다','지도 1턴과 추가 추격 0.75열. 선체 최대 2 손실, 연료 2 확보. 연료 부족만으로 갇히지 않습니다.',{fuel:2,hull:-2,wait:true})
  ]};}
  Game.prototype.waitForFuel=function(){
    if(this.state.mode!=='map'||this.state.resources.fuel>0)return result(false,'연료가 없는 지도 상태에서 구조 신호를 보낼 수 있습니다.');
    if(!expanded(this)){distress(this);return result(true,'구조 방법을 선택하세요.');}
    return setExpandedEvent(this,distressDefinition(),'distress');
  };
  Game.prototype.getQuestLog=function(){
    const s=this.state;
    return (s.campaign.quests||[]).map(q=>{
      const def=DATA.questDefinitions[q.definitionId],target=q.targetSectorId===s.campaign.world.currentId?node(this,q.targetNodeId):null;
      return {id:q.id,definitionId:q.definitionId,title:def.name,objective:def.stages[q.stage]||'임무 종료',description:def.summary,stage:q.stage,stageLabel:`${Math.min(2,q.stage+1)}/2 · ${def.stages[q.stage]||'임무 종료'}`,status:q.status,targetSector:q.targetDepth||null,targetSectorId:q.targetSectorId,targetNodeId:q.targetNodeId,targetLabel:target?`${s.sector}섹터 ${target.col}-${target.row+1} · ${target.label}`:q.status==='active'?'다음 섹터에서 좌표 확정':'종료된 임무',deadlineTurn:q.deadlineTurn,turnsRemaining:q.deadlineTurn===null?null:Math.max(0,q.deadlineTurn-s.campaign.mapTurns),history:copy(q.history)};
    });
  };
  Game.prototype.chooseEvent=function(choiceId){
    if(!expanded(this)){const answer=legacy.chooseEvent.call(this,choiceId);syncLegacy(this);return answer;}
    const s=this.state,c=s.campaign,event=s.event;
    if(s.mode!=='event'||!event)return result(false,'선택할 사건이 없습니다.');
    const quest=event.kind==='quest'?c.quests.find(q=>q.id===event.questId&&q.status==='active'):null;
    const definition=event.kind==='quest'?(quest?questDefinition(this,quest):null):event.kind==='distress'?distressDefinition():DATA.events[event.definitionId];
    const choice=definition?.choices.find(x=>x.id===choiceId);
    if(!choice)return result(false,'현재 사건에 해당하는 선택지가 아닙니다.');
    const problem=choiceProblem(this,choice);
    if(problem){const shown=event.choices.find(x=>x.id===choiceId);if(shown){shown.disabled=true;shown.reason=problem;}return result(false,problem);}
    let effect={...choice.effect};
    if(effect.outcomes){const total=effect.outcomes.reduce((sum,o)=>sum+o.weight,0);let roll=this.rand()*total;let picked=effect.outcomes.at(-1);for(const option of effect.outcomes){roll-=option.weight;if(roll<0){picked=option;break;}}effect={...effect,...picked.effect};delete effect.outcomes;}
    // Mutation starts only after every dynamic requirement has been checked.
    for(const [id,cost] of Object.entries(choice.costs||{}))s.resources[id]-=cost;
    if(effect.recruit){const added=this.addCrew(effect.recruit.species,effect.recruit.name);if(!added?.ok){for(const [id,cost]of Object.entries(choice.costs||{}))s.resources[id]+=cost;return added||result(false,'승무원을 태우지 못했습니다.');}}
    if(effect.nextEvent)return showDefinition(this,effect.nextEvent);
    const location=node(this,s.currentNodeId);
    if(location&&event.kind!=='distress')location.resolved=true;
    if(effect.questStart)startQuest(this,effect.questStart);
    if(effect.questAbandon)finishQuest(this,quest,'abandoned','함장의 결정으로 임무를 포기했습니다.');
    if(effect.questAdvance)advanceQuest(this,quest);
    if(effect.questComplete){finishQuest(this,quest,'completed','약속한 임무를 완료했습니다.');quest.rewardClaimed=true;c.flags[`${quest.definitionId}Complete`]=true;}
    if(effect.combat){c.combatBonus=effect.combatBonus||0;startExpandedCombat(this,expandedEnemy(this,effect.combat==='elite'),{kind:quest?'quest':'normal',questId:quest?.id||null,questAction:effect.questAction||null});return result(true,'교전 준비. 표적과 전력을 확인하세요.');}
    if(effect.crewHeal)for(const member of alive(s.player))if(member.shipId==='player')member.hp=Math.min(member.maxHp,member.hp+effect.crewHeal);
    if(effect.fleetDelay)c.fleetDelay=Math.min(100,c.fleetDelay+effect.fleetDelay);
    if(effect.fleetAdvance&&!c.finalStand)advanceFront(this,effect.fleetAdvance);
    if(effect.reveal)for(const entry of s.nodes)entry.discovered=true;
    if(effect.wait){mapTurn(this,location,0.75);if(s.mode==='defeat')return result(true,'기지 방어 시간이 끝났습니다.');}
    if(effect.installMind){
      const slot=this.getSystemSlots().find(candidate=>candidate.unlocked&&!candidate.systemId);
      if(s.player.aux.mind.level===0&&slot){this._mountSystem(slot.id,'mind');rememberPower(this);this.log('설계도 보상 · '+slot.id+'에 정신 제어 설치. 전력을 배분하세요.','success');}
      else{effect.scrap=(effect.scrap||0)+35;this.log('설계도 보상 · 설치할 빈 마운트가 없거나 장비가 이미 있어 스크랩 35로 교환했습니다.','success');}
    }
    const gains={scrap:effect.scrap||0,fuel:effect.fuel||0,missiles:effect.missiles||0,droneParts:effect.droneParts||0,hull:effect.hull||0};
    if(effect.salvage)gains.salvage=makeSalvage(this,effect.salvage.kind,effect.salvage.defId);
    const note=effect.questStart?'임무가 항해 일지에 기록되었습니다. 지도에서 퀘스트 목적지를 확인하세요.':effect.questAdvance?'이 단계의 임무를 마쳤습니다. 항해 일지에 다음 목적지가 표시됩니다.':effect.questComplete?'약속을 지켰습니다. 아래 보급품과 회수품을 확인하세요.':effect.questAbandon?'임무를 포기했습니다. 이 결정은 항해 일지에 남습니다.':effect.wait?'구조선이 도착했습니다. 기다리는 동안 추격이 진행되었습니다.':'선택한 작업을 마쳤습니다. 이 비콘의 결과는 다시 지급되지 않습니다.';
    return award(this,definition.title,note,gains);
  };

  Game.prototype.onCombatEnd=function(won){
    if(!expanded(this))return legacy.onCombatEnd.call(this,won);
    const s=this.state,c=s.campaign,ctx=c.encounter;
    if(!won||s.mode!=='combat'||!s.enemy||!ctx)return result(false,'이미 종료된 전투입니다.');
    const current=node(this,ctx.nodeId);if(current){current.resolved=true;current.clearedVisit=current.visits;}
    this.recoverShip(ctx.kind==='boss'?30:20);
    if(ctx.kind==='boss') {
      const stand=c.finalStand,phase=stand.phase;
      if(phase===3){clearEncounter(this);s.mode='victory';s.event=null;s.reward=null;c.bossInProgress=false;c.encounter=null;c.pendingRewardAction=null;this.log('기함의 마지막 신호가 꺼지고, 연방 기지에서 응답이 도착합니다. 여덟 섹터의 항해를 마쳤습니다.','reward');return result(true,'마지막 신호를 전했습니다.');}
      stand.phase+=1;s.bossPhase=stand.phase;stand.baseTurns=0;stand.turn=0;stand.bossNodeId=stand.phase===2?'s8-5-1':stand.baseNodeId;
      if(stand.bossNodeId===s.currentNodeId)stand.bossNodeId='s8-4-1';
      stand.routeIndex=['s8-6-1','s8-5-1','s8-4-1',stand.baseNodeId].indexOf(stand.bossNodeId);c.bossInProgress=false;c.encounter=null;
      return award(this,`기함 ${phase}단계 격파`,`기함이 ${stand.bossNodeId===stand.baseNodeId?'연방 기지':'다른 항로'}로 이동했습니다. 지도에서 추격하거나 수리 거점을 방문하세요.`,{scrap:20,hull:5,fuel:2,missiles:4,droneParts:2});
    }
    if(ctx.kind==='fleet'){c.encounter=null;return award(this,'점령지 돌파','반군 지원군이 접근합니다. 적선에서 탈출 연료 1만 회수했습니다. 이 전투는 스크랩이나 장비를 지급하지 않습니다.',{fuel:1});}
    if(ctx.questId){const quest=c.quests.find(q=>q.id===ctx.questId);if(ctx.questAction==='advance')advanceQuest(this,quest);}
    const first=c.firstRewardPending,crewVictory=s.lastVictoryCause==='crew';
    c.firstRewardPending=false;c.normalVictories=Math.min(1000000,c.normalVictories+1);
    const hazard=current?.environment?DATA.environments[current.environment].rewardScrap:0;
    const gains={scrap:(first?38:12+s.sector*3+Math.floor(this.rand()*6))+(c.combatBonus||0)+(crewVictory?8:0)+hazard,fuel:first?3:1,missiles:first?3:2,droneParts:first||crewVictory?2:1,hazardScrap:hazard};
    c.combatBonus=0;c.encounter=null;
    if(c.normalVictories===1||c.normalVictories%2===0||crewVictory)gains.salvage=victorySalvage(this,c.normalVictories===1);
    return award(this,first?'출항로 확보':crewVictory?'선내 장악':'전투 승리',first?'여덟 섹터의 항로가 열렸습니다. 비콘을 재방문할 수 있지만 연료와 추격 비용이 들고 이미 받은 보상은 반복되지 않습니다.':ctx.questId?'교전에서 승리했습니다. 임무의 다음 목적지를 항해 일지에서 확인하세요.':'적선에서 보급품을 회수했습니다. 방문 기록과 반군 전선을 확인하고 항해를 계속하세요.',gains);
  };
  Game.prototype.shopItems=function(){
    const items=legacy.shopItems.call(this);
    if(!expanded(this))return items.map(item=>({...item,stock:null,soldOut:false,reason:item.disabled?'자금 또는 적용 조건을 확인하세요.':''}));
    const current=node(this,this.state.currentNodeId),stock=current?.store?.stock||{};
    return items.map(item=>{
      const count=Object.hasOwn(DATA.shopStock,item.id)?stock[item.id]??0:null,soldOut=count===0;
      const reason=current?.occupied?'반군이 점령한 상점입니다.':soldOut?'이 교역소의 재고가 소진되었습니다.':this.state.resources.scrap<item.cost?'스크랩이 부족합니다.':item.disabled?(item.reason||'정원·장착 공간·설비 상한을 확인하세요.') : '';
      return {...item,stock:count,soldOut,disabled:Boolean(reason),reason};
    });
  };
  Game.prototype.buy=function(itemId){
    if(!expanded(this))return legacy.buy.call(this,itemId);
    if(this.state.mode!=='shop')return result(false,'교역소에서만 구매할 수 있습니다.');
    const item=this.shopItems().find(i=>i.id===itemId);
    if(!item||item.disabled)return result(false,item?.reason||'알 수 없는 상품입니다.');
    const consumables={fuel:['fuel',3],missiles:['missiles',4],drone_parts:['droneParts',3]},supply=consumables[itemId];
    if(supply&&this.state.resources[supply[0]]+supply[1]>1000000)return result(false,'보급품 보유 한도를 초과합니다.');
    const answer=legacy.buy.call(this,itemId);
    if(answer?.ok&&item.stock!==null)node(this,this.state.currentNodeId).store.stock[itemId]-=1;
    return answer;
  };
  Game.prototype.onEscape=function(){
    if(expanded(this))return result(false,'탈출할 인접 비콘을 선택하세요.');
    const answer=legacy.onEscape.call(this);syncLegacy(this);return answer;
  };

  Game.prototype.migrateCampaignV6=function(state){
    if(!plain(state)||!plain(state.campaign)||!Array.isArray(state.nodes))return null;
    const c=state.campaign;
    const worlds=[1,2,3].map(depth=>({id:`legacy-${depth}`,depth,lane:0,kind:depth===3?'final':depth===2?'nebula':'civilian',name:DATA.legacySectorNames[depth-1],description:'이전 버전에서 시작한 세 섹터 항해입니다. 현재 비콘과 전투를 보존합니다.',category:depth===3?'final':'friendly',color:'#91c9a8',links:depth<3?[`legacy-${depth+1}`]:[],visited:depth<=state.sector}));
    Object.assign(c,{routeMode:'legacy',totalSectors:3,world:{currentId:`legacy-${state.sector}`,route:worlds.filter(n=>n.depth<=state.sector).map(n=>n.id),nodes:worlds},fleetDelay:0,mapTurns:state.jumpCount||0,quests:[],flags:{},encounter:null,finalStand:null,pendingSectorChoice:false});
    for(const entry of state.nodes){entry.visits=entry.visited?1:0;entry.resolved=Boolean(entry.visited);entry.occupied=false;entry.discovered=Boolean(entry.visited||entry.type==='exit'||entry.type==='boss');entry.nebula=false;entry.eventId=null;entry.questId=null;entry.store=null;entry.clearedVisit=0;}
    if(state.event)for(const choice of state.event.choices||[])if(choice.style===undefined)choice.style=choice.species||choice.requiresSystem||choice.requiresDrone||choice.requiresWeapon||choice.requiresSkill?'blue':'normal';
    return state;
  };
  Game.prototype.validateCampaignV6=function(state){
    try {
      if(!plain(state)||!plain(state.campaign))return false;
      const c=state.campaign,w=c.world;
      if(!['legacy','expanded'].includes(c.routeMode)||c.totalSectors!==(c.routeMode==='expanded'?8:3)||!boundedInt(state.sector,c.totalSectors)||state.sector<1)return false;
      if(!Number.isFinite(c.fleetDelay)||c.fleetDelay<0||c.fleetDelay>100||!boundedInt(c.mapTurns)||typeof c.pendingSectorChoice!=='boolean')return false;
      if(!plain(w)||!safeId(w.currentId)||!Array.isArray(w.nodes)||w.nodes.length!==(c.routeMode==='expanded'?20:3)||!Array.isArray(w.route)||w.route.length!==state.sector)return false;
      const worldIds=new Set(w.nodes.map(n=>n?.id));if(worldIds.size!==w.nodes.length)return false;
      for(const entry of w.nodes) {
        if(!plain(entry)||!safeId(entry.id)||!boundedInt(entry.depth,c.totalSectors)||entry.depth<1||!boundedInt(entry.lane,2)||!Object.hasOwn(DATA.sectorTypes,entry.kind)||typeof entry.name!=='string'||entry.name.length>200||typeof entry.description!=='string'||entry.description.length>1500||typeof entry.visited!=='boolean'||!Array.isArray(entry.links)||entry.links.length>3||new Set(entry.links).size!==entry.links.length)return false;
        if(!entry.links.every(id=>worldIds.has(id)&&w.nodes.find(n=>n.id===id).depth===entry.depth+1))return false;
        if(entry.depth<c.totalSectors&&entry.links.length===0)return false;
      }
      if(!worldIds.has(w.currentId)||w.route.at(-1)!==w.currentId||new Set(w.route).size!==w.route.length)return false;
      for(let i=0;i<w.route.length;i++){const entry=w.nodes.find(n=>n.id===w.route[i]);if(!entry||entry.depth!==i+1||!entry.visited||(i>0&&!w.nodes.find(n=>n.id===w.route[i-1]).links.includes(entry.id)))return false;}
      if(c.routeMode==='expanded')for(let depth=1;depth<=8;depth++)if(w.nodes.filter(n=>n.depth===depth).length!==((depth===1||depth===8)?1:3))return false;
      if(!plain(c.flags)||Object.keys(c.flags).length>64||Object.entries(c.flags).some(([id,value])=>!safeId(id)||!(typeof value==='boolean'||boundedInt(value)||typeof value==='string'&&value.length<=120)))return false;
      if(!Array.isArray(c.quests)||c.quests.length>DATA.campaignRules.maxQuests||new Set(c.quests.map(q=>q?.id)).size!==c.quests.length||new Set(c.quests.map(q=>q?.definitionId)).size!==c.quests.length)return false;
      const localIds=new Set(state.nodes.map(n=>n.id)),questIds=new Set(c.quests.map(q=>q.id));
      if(c.routeMode==='expanded'&&state.nodes.length!==20)return false;
      for(const entry of state.nodes) {
        if(!safeId(entry.id)||!['start','combat','event','shop','repair','exit','boss','base','empty'].includes(entry.type)||!boundedInt(entry.visits)||!boundedInt(entry.clearedVisit)||entry.clearedVisit>entry.visits||typeof entry.visited!=='boolean'||entry.visited!==(entry.visits>0)||typeof entry.resolved!=='boolean'||typeof entry.occupied!=='boolean'||typeof entry.discovered!=='boolean'||typeof entry.nebula!=='boolean'||!(entry.eventId===null||Object.hasOwn(DATA.events,entry.eventId))||!(entry.questId===null||questIds.has(entry.questId)))return false;
        if(c.routeMode==='expanded'&&(!boundedInt(entry.col,7)||!boundedInt(entry.row,2)||new Set(entry.links).size!==entry.links.length||entry.links.includes(entry.id)||!entry.links.every(id=>localIds.has(id)&&state.nodes.find(n=>n.id===id).links.includes(entry.id))))return false;
        if(entry.store!==null) {
          if(entry.type!=='shop'||!plain(entry.store)||!plain(entry.store.stock)||Object.keys(entry.store.stock).length!==Object.keys(DATA.shopStock).length)return false;
          if(Object.entries(DATA.shopStock).some(([id,max])=>!boundedInt(entry.store.stock[id],max)))return false;
        }
      }
      for(const q of c.quests) {
        if(!plain(q)||!safeId(q.id)||!Object.hasOwn(DATA.questDefinitions,q.definitionId)||!boundedInt(q.stage,1)||!['active','completed','failed','abandoned'].includes(q.status)||!worldIds.has(q.originSectorId)||!boundedInt(q.targetDepth,8)||q.targetDepth<1||!(q.targetSectorId===null||worldIds.has(q.targetSectorId))||!(q.targetNodeId===null||safeId(q.targetNodeId))||!(q.deadlineTurn===null||boundedInt(q.deadlineTurn))||typeof q.rewardClaimed!=='boolean'||!Array.isArray(q.history)||q.history.length>DATA.campaignRules.maxQuestHistory)return false;
        if(q.history.some(h=>!plain(h)||typeof h.text!=='string'||h.text.length>500||!boundedInt(h.turn)||h.turn>c.mapTurns))return false;
        if(q.rewardClaimed!==(q.status==='completed'))return false;
        if(q.status==='active'&&q.targetSectorId===w.currentId&&(!localIds.has(q.targetNodeId)||state.nodes.find(n=>n.id===q.targetNodeId).questId!==q.id))return false;
        if(q.status==='active'&&q.targetNodeId===null&&q.targetDepth<=state.sector)return false;
      }
      for(const entry of state.nodes)if(entry.questId){const q=c.quests.find(q=>q.id===entry.questId);if(!q||q.status!=='active'||q.targetNodeId!==entry.id||q.targetSectorId!==w.currentId)return false;}
      if(c.encounter!==null) {
        const e=c.encounter;
        if(!plain(e)||!['normal','fleet','quest','boss'].includes(e.kind)||!localIds.has(e.nodeId)||!(e.questId===null||questIds.has(e.questId))||![null,'advance'].includes(e.questAction))return false;
        if(e.kind==='quest'&&!e.questId)return false;
      }
      if(c.routeMode==='expanded'&&state.mode==='combat'&&!c.encounter)return false;
      if(c.finalStand!==null) {
        const f=c.finalStand;
        if(c.routeMode!=='expanded'||state.sector!==8||!plain(f)||!localIds.has(f.baseNodeId)||!localIds.has(f.bossNodeId)||!boundedInt(f.phase,3)||f.phase<1||!boundedInt(f.routeIndex,3)||!boundedInt(f.baseTurns,3)||!boundedInt(f.turn)||!Array.isArray(f.repairUsed)||f.repairUsed.length>20||new Set(f.repairUsed).size!==f.repairUsed.length||!f.repairUsed.every(id=>localIds.has(id)&&state.nodes.find(n=>n.id===id).type==='repair'))return false;
      } else if(c.routeMode==='expanded'&&state.sector===8)return false;
      if(c.pendingSectorChoice&&(c.routeMode!=='expanded'||state.sector>=8||state.nodes.find(n=>n.id===state.currentNodeId)?.type!=='exit'||!['map','event','reward'].includes(state.mode)))return false;
      if(c.routeMode==='expanded'&&state.event!==null) {
        const event=state.event;
        if(!safeId(event.instanceId)||!safeId(event.definitionId)||!safeId(event.stepId)||!['event','quest','distress'].includes(event.kind)||!Array.isArray(event.choices)||event.choices.length<1||event.choices.length>8||new Set(event.choices.map(x=>x.id)).size!==event.choices.length)return false;
        const q=event.kind==='quest'?c.quests.find(q=>q.id===event.questId&&q.status==='active'):null;
        if(event.kind==='quest'&&!q||event.kind==='event'&&!Object.hasOwn(DATA.events,event.definitionId)||event.kind==='distress'&&event.definitionId!=='fuel_distress_v6')return false;
        const definition=event.kind==='quest'?questDefinition({state},q):event.kind==='distress'?distressDefinition():DATA.events[event.definitionId];
        if(event.definitionId!==definition.id||event.choices.length!==definition.choices.length)return false;
        if(!event.choices.every(choice=>definition.choices.some(d=>d.id===choice.id)&&['normal','blue'].includes(choice.style)&&typeof choice.disabled==='boolean'&&typeof choice.reason==='string'&&choice.reason.length<=500))return false;
      }
      return true;
    } catch { return false; }
  };
})();
