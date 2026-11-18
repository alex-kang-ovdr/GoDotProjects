(function () {
  'use strict';
  const SW = globalThis.Starward ||= {};
  SW.DATA = {
    rooms: [
      { id: 'engines', name: '기관실', x: 0, y: 1, w: 2, h: 2 },
      { id: 'shields', name: '실드실', x: 2, y: 0, w: 2, h: 2 },
      { id: 'weapons', name: '무기실', x: 4, y: 0, w: 2, h: 2 },
      { id: 'bridge', name: '함교', x: 6, y: 1, w: 1, h: 2 },
      { id: 'oxygen', name: '산소실', x: 2, y: 2, w: 2, h: 2 },
      { id: 'medbay', name: '의무실', x: 4, y: 2, w: 2, h: 2 }
    ],
    adjacency: {
      engines: ['shields', 'oxygen'],
      shields: ['engines', 'weapons', 'oxygen'],
      weapons: ['shields', 'bridge', 'medbay'],
      bridge: ['weapons', 'medbay'],
      oxygen: ['engines', 'shields', 'medbay'],
      medbay: ['oxygen', 'weapons', 'bridge']
    },
    doors: [
      { id: 'door-engines-shields', a: 'engines', b: 'shields', x: 2, y: 1.5, orientation: 'vertical', airlock: false },
      { id: 'door-engines-oxygen', a: 'engines', b: 'oxygen', x: 2, y: 2.5, orientation: 'vertical', airlock: false },
      { id: 'door-shields-weapons', a: 'shields', b: 'weapons', x: 4, y: 1, orientation: 'vertical', airlock: false },
      { id: 'door-shields-oxygen', a: 'shields', b: 'oxygen', x: 3, y: 2, orientation: 'horizontal', airlock: false },
      { id: 'door-weapons-bridge', a: 'weapons', b: 'bridge', x: 6, y: 1.5, orientation: 'vertical', airlock: false },
      { id: 'door-weapons-medbay', a: 'weapons', b: 'medbay', x: 5, y: 2, orientation: 'horizontal', airlock: false },
      { id: 'door-bridge-medbay', a: 'bridge', b: 'medbay', x: 6, y: 2.5, orientation: 'vertical', airlock: false },
      { id: 'door-oxygen-medbay', a: 'oxygen', b: 'medbay', x: 4, y: 3, orientation: 'vertical', airlock: false },
      { id: 'airlock-engines', a: 'engines', b: null, x: 0, y: 2, orientation: 'vertical', airlock: true },
      { id: 'airlock-medbay', a: 'medbay', b: null, x: 5, y: 4, orientation: 'horizontal', airlock: true }
    ],
    systemNames: {
      engines: '엔진', shields: '실드', weapons: '무기',
      bridge: '함교', oxygen: '산소', medbay: '의료',
      drones: '드론', teleporter: '텔레포터', cloaking: '은폐', hacking: '해킹', mind: '정신 제어', battery: '비상 배터리'
    },
    weapons: {
      burst_laser: { defId: 'burst_laser', name: '삼연장 레이저', type: 'laser', power: 2, cooldown: 10, damage: 1, shots: 3, description: '3발을 연속 발사합니다. 실드 한 겹이 한 발을 막습니다.' },
      artemis: { defId: 'artemis', name: '아르테미스', type: 'missile', power: 1, cooldown: 13, damage: 2, shots: 1, description: '일반 실드를 관통하는 미사일. 발사할 때 탄약 1을 소비합니다.' },
      heavy_laser: { defId: 'heavy_laser', name: '중형 레이저', type: 'laser', power: 1, cooldown: 11, damage: 2, shots: 1, description: '한 발에 피해 2. 다른 무기로 실드를 벗긴 뒤 사용하세요.' },
      beam: { defId: 'beam', name: '아크 빔', type: 'beam', power: 2, cooldown: 15, damage: 3, shots: 1, beamLength: 4, description: '두 방 사이를 가로지르는 정밀 빔. 통과한 방마다 피해를 주며 남은 실드 겹수만큼 감소합니다.' },
      ion: { defId: 'ion', name: '이온 펄스', type: 'ion', power: 1, cooldown: 7, damage: 0, shots: 1, ionDamage: 1, ionDuration: 5, description: '선체 피해 없이 시스템 전력 1을 5초간 잠급니다. 실드가 남아 있으면 실드 제어를 잠그며, 연속 명중은 잠금과 시간(최대 15초)을 누적합니다.' }
    },
    drones: {
      combat: { defId: 'combat', name: '반딧불 공격 드론', type: 'combat', power: 2, cooldown: 6, damage: 1, hp: 1, description: '6초마다 레이저를 발사합니다. 전투당 첫 출격에 드론 부품 1을 사용합니다.' },
      defense: { defId: 'defense', name: '파수꾼 방어 드론', type: 'defense', power: 2, cooldown: 3, hp: 1, description: '접근하는 미사일을 요격합니다. 재요격 대기 3초, 전투당 첫 출격에 부품 1을 사용합니다.' }
    },
    equipment: {
      weapon: {
        burst_laser: { cost: 60, sell: 30 }, artemis: { cost: 40, sell: 20 },
        heavy_laser: { cost: 45, sell: 22 }, beam: { cost: 65, sell: 32 }, ion: { cost: 45, sell: 22 }
      },
      drone: { combat: { cost: 42, sell: 21 }, defense: { cost: 40, sell: 20 } }
    },
    equipmentLimits: { weapons: 4, drones: 2, cargo: 6 },
    enemyProfiles: {
      raider: {
        id: 'raider', name: '습격형', accent: '#efb47d',
        description: '무기실을 우선 압박하고 엔진·실드로 표적을 분산합니다. 자신의 무기와 방어를 먼저 복구합니다.',
        targetWeights: { weapons: 7, shields: 3, engines: 3, bridge: 2, oxygen: 1, medbay: 1 },
        repairWeights: { weapons: 8, shields: 5, oxygen: 4, bridge: 4, engines: 3, medbay: 2, drones: 3, teleporter: 1, cloaking: 1 },
        powerOrder: ['weapons', 'shields', 'oxygen', 'engines', 'drones', 'medbay', 'teleporter', 'cloaking']
      },
      disruptor: {
        id: 'disruptor', name: '교란형', accent: '#a995ef',
        description: '이온으로 실드를 잠그고 선체 무기를 연결합니다. 실드 전력이 사라지면 무기·엔진으로 이온 표적을 옮깁니다.',
        targetWeights: { shields: 8, weapons: 5, engines: 4, bridge: 1, oxygen: 1, medbay: 1 },
        repairWeights: { weapons: 8, shields: 7, oxygen: 4, engines: 3, bridge: 3, drones: 3, medbay: 2, teleporter: 1, cloaking: 1 },
        powerOrder: ['weapons', 'shields', 'drones', 'oxygen', 'engines', 'medbay', 'teleporter', 'cloaking']
      },
      boarding: {
        id: 'boarding', name: '강습형', accent: '#ee858d',
        description: '산소·의료·무기실을 압박해 강습 인원을 지원합니다. 자신의 침투 인원이 있는 방은 가능한 한 포격하지 않습니다.',
        targetWeights: { oxygen: 7, medbay: 6, weapons: 4, engines: 1, shields: 1, bridge: 1 },
        repairWeights: { teleporter: 9, oxygen: 8, medbay: 7, weapons: 6, shields: 4, bridge: 4, engines: 3, drones: 2, cloaking: 1 },
        powerOrder: ['weapons', 'teleporter', 'oxygen', 'medbay', 'shields', 'engines', 'drones', 'cloaking']
      },
      artillery: {
        id: 'artillery', name: '포격형', accent: '#e6cd7e',
        description: '미사일로 엔진·실드·무기실을 압박합니다. 회피와 방어 드론, 적 무기실 제압으로 대응할 수 있습니다.',
        targetWeights: { engines: 7, shields: 5, weapons: 5, bridge: 2, oxygen: 1, medbay: 1 },
        repairWeights: { weapons: 9, shields: 7, engines: 6, drones: 5, oxygen: 4, bridge: 4, medbay: 2, teleporter: 1, cloaking: 1 },
        powerOrder: ['weapons', 'shields', 'engines', 'oxygen', 'drones', 'medbay', 'teleporter', 'cloaking']
      }
    },
    crewTypes: {
      human: { name: '인간', maxHp: 100, hp: 100, moveSpeed: 1.35, repairMultiplier: 1, repairSpeed: 1, combatMultiplier: 1, fireImmune: false, description: '이동·수리·선내 전투에 균형 잡힌 승무원입니다.' },
      engi: { name: '엔지', maxHp: 100, hp: 100, moveSpeed: 1.2, repairMultiplier: 2, repairSpeed: 2, combatMultiplier: 0.5, fireImmune: false, description: '수리는 두 배 빠르지만 대인 공격은 절반입니다.' },
      rock: { name: '록', maxHp: 150, hp: 150, moveSpeed: 0.75, repairMultiplier: 1, repairSpeed: 1, combatMultiplier: 1, fireImmune: true, description: '체력이 높고 화재 피해에 면역입니다. 산소는 필요합니다.' },
      mantis: { name: '맨티스', maxHp: 100, hp: 100, moveSpeed: 1.45, repairMultiplier: 0.5, repairSpeed: 0.5, combatMultiplier: 1.5, fireImmune: false, description: '빠르게 이동하며 대인 피해가 1.5배입니다. 수리 속도는 절반입니다.' }
    },
    skillNames: {
      piloting: '조종', engines: '기관', weapons: '무기', shields: '실드', repair: '수리', combat: '선내 전투'
    },
    skillRules: { thresholds: [0, 40, 120], maxXp: 120 },
    loadouts: {
      argo: {
        id: 'argo', name: '아르고', role: '다목적 순항함', tagline: '마지막 신호를 싣는 첫 번째 선택', accent: '#66d5ed',
        description: '삼연장 레이저와 실드 관통 미사일, 세 종족의 균형 잡힌 승무원. 비상 배터리는 30초간 임시 전력 2를 공급합니다. 방어 드론은 필요할 때 출격시키세요.',
        spec: {
          name: '아르고', layoutId: 'argo', hull: 30, maxHull: 30, reactor: 10, shieldLayers: 1, weaponLevel: 4,
          weaponDefs: ['burst_laser', 'artemis'], crewCount: 3,
          crewTypes: ['human', 'engi', 'rock'], crewNames: ['아린', '픽스', '바위'], droneDefs: ['defense'],
          auxLevels: { drones: 2, teleporter: 1, cloaking: 0, hacking: 0, mind: 0, battery: 1 }, auxPower: { drones: 0, teleporter: 0, cloaking: 0, hacking: 0, mind: 0, battery: 0 }
        },
        resources: { scrap: 60, fuel: 12, missiles: 10, droneParts: 4 }
      },
      atlas: {
        id: 'atlas', name: '아틀라스', role: '드론 지원함', tagline: '작은 날개들로 길을 열다', accent: '#b6db82',
        description: '이온과 공격 드론을 연결하고 해킹으로 적 설비를 교란하세요. 해킹 장비에 전력 1을 옮긴 뒤 부품을 사용해 드론을 보냅니다. 엔지 두 명이 수리를 맡습니다.',
        spec: {
          name: '아틀라스', layoutId: 'atlas', hull: 28, maxHull: 28, reactor: 11, shieldLayers: 1, weaponLevel: 4,
          weaponDefs: ['ion', 'heavy_laser'], crewCount: 3,
          crewTypes: ['human', 'engi', 'engi'], crewNames: ['세라', '니모', '모스'], droneDefs: ['combat', 'defense'],
          auxLevels: { drones: 2, teleporter: 1, cloaking: 0, hacking: 1, mind: 0, battery: 0 }, auxPower: { drones: 2, teleporter: 0, cloaking: 0, hacking: 0, mind: 0, battery: 0 }
        },
        resources: { scrap: 50, fuel: 12, missiles: 6, droneParts: 6 }
      },
      wraith: {
        id: 'wraith', name: '레이스', role: '은폐 타격함', tagline: '보이지 않는 순간, 가장 선명한 궤적', accent: '#c1a4f2',
        description: '삼연장 레이저와 두 지점 빔으로 방을 가로지릅니다. 은폐 중 적 무기 충전이 멈추며 회피가 증가합니다. 일반 무기 발사는 은폐 시간을 줄이고 빔은 유지합니다.',
        spec: {
          name: '레이스', layoutId: 'wraith', hull: 26, maxHull: 26, reactor: 11, shieldLayers: 1, weaponLevel: 4,
          weaponDefs: ['burst_laser', 'beam'], crewCount: 3,
          crewTypes: ['human', 'engi', 'human'], crewNames: ['루아', '루멘', '단'], droneDefs: ['defense'],
          auxLevels: { drones: 2, teleporter: 1, cloaking: 1, hacking: 0, mind: 0, battery: 0 }, auxPower: { drones: 0, teleporter: 0, cloaking: 1, hacking: 0, mind: 0, battery: 0 }
        },
        resources: { scrap: 45, fuel: 12, missiles: 6, droneParts: 3 }
      }
    },
    difficulties: {
      standard: { id: 'standard', name: '표준', description: '기존 전투 균형. 장비와 승무원을 성장시키며 마지막 신호를 전하세요.', enemyHullMultiplier: 1, enemyCooldownMultiplier: 1 },
      veteran: { id: 'veteran', name: '베테랑', description: '적 최대 선체 20% 증가, 적 일반 무기 재충전 시간 10% 감소. 보상과 플레이어 시작 장비는 표준과 같습니다.', enemyHullMultiplier: 1.2, enemyCooldownMultiplier: 0.9 }
    },
    environments: {
      asteroids: { kind: 'asteroids', name: '소행성 지대', icon: '☄', description: '8초마다 양측에 피해 1의 파편이 접근합니다. 실드가 막을 수 있으며 2초 전에 경고합니다. 교전 승리 시 스크랩 +8.', period: 8, warning: 2, rewardScrap: 8 },
      solar: { kind: 'solar', name: '태양 근접 지대', icon: '☀', description: '22초마다 양측 한 방에 화재 0.8이 발생합니다. 그 순간 실드가 없으면 선체 피해 1도 받습니다. 5초 전 경고, 승리 시 스크랩 +8.', period: 22, warning: 5, rewardScrap: 8 },
      ion_storm: { kind: 'ion_storm', name: '이온 폭풍', icon: 'ϟ', description: '전투 동안 사용 가능한 반응로 전력이 65%(내림, 최소 2)로 제한됩니다. 장비 사이의 전력을 옮기세요. 승리 시 스크랩 +8.', period: 0, warning: 0, rewardScrap: 8 }
    },
    sectorNames: ['여명 항로', '갈림길의 불빛', '잊힌 항구', '유리의 경계', '긴 그림자', '봉쇄 너머', '마지막 도약', '마지막 신호'],
    sectorSubtitles: ['떠나는 이들의 불빛', '세 갈래의 신호', '다시 만날 수 있을까', '누군가 기다리는 곳', '우리의 이름을 남기다', '추격대보다 한 걸음 먼저', '우리가 돌아갈 좌표', '기지를 지켜라'],
    campaignName: 'STARWARD · 마지막 신호'
  };

  const D = SW.DATA;
  const roomNames = Object.fromEntries(D.rooms.map(room => [room.id, room.name]));
  function layout(id, name, description, width, height, roomSpecs, connections, airlocks, outline) {
    const rooms = roomSpecs.map(([roomId, x, y, w, h]) => ({ id: roomId, name: roomNames[roomId], x, y, w, h }));
    const byId = Object.fromEntries(rooms.map(room => [room.id, room]));
    const doors = connections.map(([a, b]) => {
      const first = byId[a], second = byId[b];
      const yMin = Math.max(first.y, second.y), yMax = Math.min(first.y + first.h, second.y + second.h);
      const xMin = Math.max(first.x, second.x), xMax = Math.min(first.x + first.w, second.x + second.w);
      if (yMax > yMin && (first.x + first.w === second.x || second.x + second.w === first.x)) {
        return { id: `door-${a}-${b}`, a, b, x: first.x + first.w === second.x ? second.x : first.x, y: (yMin + yMax) / 2, orientation: 'vertical', airlock: false };
      }
      if (xMax > xMin && (first.y + first.h === second.y || second.y + second.h === first.y)) {
        return { id: `door-${a}-${b}`, a, b, x: (xMin + xMax) / 2, y: first.y + first.h === second.y ? second.y : first.y, orientation: 'horizontal', airlock: false };
      }
      throw new Error(`STARWARD: ${id}의 ${a}–${b} 사이에 공유 벽이 없습니다.`);
    });
    for (const [a, x, y, orientation] of airlocks) doors.push({ id: `airlock-${a}`, a, b: null, x, y, orientation, airlock: true });
    return { id, name, description, width, height, rooms, doors, outline };
  }
  const argoOutline = [[-0.35,0.8],[1.8,-0.35],[6.15,-0.35],[7.4,0.85],[7.65,2],[7.4,3.15],[6.15,4.35],[1.8,4.35],[-0.35,3.2]];
  // These legacy aliases remain unchanged for old saves and old migration steps.
  D.layouts = {
    legacy: {
      id: 'legacy', name: '기존 항해 배치',
      description: '이전 항해의 6실 배치와 문, 이동 위치를 그대로 보존합니다. 상하 우회로와 기관실·의무실 외부문을 사용할 수 있습니다.',
      width: 7, height: 4, rooms: D.rooms, doors: D.doors, outline: argoOutline
    },
    argo: {
      id: 'argo', name: '아르고 · 균형 배치',
      description: '상하 우회로가 있어 여러 방향으로 수리 인원을 보낼 수 있습니다. 기관실과 의무실 외부문으로 연결된 구획을 나누어 환기하세요.',
      width: 7, height: 4, rooms: D.rooms, doors: D.doors, outline: argoOutline
    },
    atlas: layout('atlas', '아틀라스 · 정비 허브',
      '중앙 무기실과 의무실을 중심으로 가까운 설비를 오갑니다. 후방 기관실·산소실에 외부문이 있어 뒤쪽 구획을 따로 환기할 수 있습니다.',
      6, 4,
      [['engines',0,0,2,2],['oxygen',0,2,2,2],['weapons',2,0,2,2],['medbay',2,2,2,2],['shields',4,0,2,2],['bridge',4,2,2,2]],
      [['engines','weapons'],['engines','oxygen'],['oxygen','medbay'],['weapons','medbay'],['weapons','shields'],['medbay','bridge'],['shields','bridge']],
      [['engines',0,1,'vertical'],['oxygen',0,3,'vertical']],
      [[-0.35,-0.3],[6.1,-0.3],[6.65,0.7],[6.85,2],[6.65,3.3],[6.1,4.3],[-0.35,4.3],[-0.55,3.2],[-0.55,0.8]]),
    wraith: layout('wraith', '레이스 · 긴 통로',
      '전방 함교와 후방 기관실은 각각 하나의 진입로로 연결됩니다. 기관실에서 무기실, 함교에서 의무실까지 세 문을 지나므로 대응 인원을 미리 배치하세요.',
      8, 4,
      [['engines',0,2,2,2],['medbay',2,2,2,2],['shields',2,0,2,2],['oxygen',4,2,2,2],['weapons',4,0,2,2],['bridge',6,0,2,2]],
      [['engines','medbay'],['medbay','shields'],['medbay','oxygen'],['shields','weapons'],['oxygen','weapons'],['weapons','bridge']],
      [['engines',0,3,'vertical'],['oxygen',5,4,'horizontal']],
      [[-0.35,1.8],[1.8,-0.35],[7.9,-0.35],[8.65,0.65],[8.65,1.35],[6.25,4.35],[-0.35,4.35],[-0.65,3.35],[-0.65,2.65]]),
    interceptor: layout('interceptor', '요격함 · 순환 통로',
      '여섯 방이 둘레를 따라 이어집니다. 중앙 실드실과 의무실 사이에는 직접 문이 없어 이동과 수리를 우회해야 합니다.',
      6, 4,
      [['engines',0,0,2,2],['oxygen',0,2,2,2],['shields',2,0,2,2],['medbay',2,2,2,2],['bridge',4,0,2,2],['weapons',4,2,2,2]],
      [['engines','shields'],['shields','bridge'],['bridge','weapons'],['weapons','medbay'],['medbay','oxygen'],['oxygen','engines']],
      [['engines',0,1,'vertical'],['weapons',5,4,'horizontal']],
      [[-0.25,-0.3],[5.85,-0.3],[7,2],[5.85,4.3],[-0.25,4.3],[-0.6,3.45],[-0.4,2],[-0.6,0.55]]),
    flagship: layout('flagship', '중전투함 · 넓은 선체',
      '넓은 후방 기관실과 전방 함교를 갖춘 배치입니다. 함교 진입은 무기실을 거치며, 기관실에서 함교까지 긴 구간은 빔의 최대 길이를 확인해야 합니다.',
      8, 4,
      [['engines',0,0,2,4],['shields',2,0,2,2],['oxygen',2,2,2,2],['weapons',4,0,2,2],['medbay',4,2,2,2],['bridge',6,0,2,2]],
      [['engines','shields'],['engines','oxygen'],['shields','oxygen'],['shields','weapons'],['oxygen','medbay'],['weapons','medbay'],['weapons','bridge']],
      [['oxygen',3,4,'horizontal'],['medbay',5,4,'horizontal']],
      [[-0.45,-0.35],[8.2,-0.35],[8.7,0.6],[8.7,1.45],[6.25,4.4],[-0.45,4.4],[-0.7,3.4],[-0.7,0.6]])
  };

  D.systemCatalog = {
    drones: { cost: 36, upgradeCost: 36, maxLevel: 4, step: 2 },
    teleporter: { cost: 30, upgradeCost: 30, maxLevel: 3, step: 1 },
    cloaking: { cost: 60, upgradeCost: 45, maxLevel: 3, step: 1 },
    hacking: { cost: 55, upgradeCost: 40, maxLevel: 3, step: 1 },
    mind: { cost: 50, upgradeCost: 40, maxLevel: 3, step: 1 },
    battery: { cost: 35, upgradeCost: 30, maxLevel: 2, step: 1 }
  };
  // New hulls have real, separately targetable bays. Older definitions above
  // remain byte-for-byte geometrically compatible with saved voyages.
  for (const baseId of ['argo', 'atlas', 'wraith', 'interceptor', 'flagship']) {
    const base = D.layouts[baseId], id = baseId + '_v7';
    const rooms = base.rooms.map(room => ({ ...room }));
    const doors = base.doors.map(door => ({ ...door }));
    const slots = [];
    for (let index = 0; index < 6; index++) {
      const roomId = 'bay' + (index + 1), x = index % 3 * 2, y = 4 + Math.floor(index / 3) * 2;
      rooms.push({ id: roomId, name: '확장실 ' + (index + 1), x, y, w: 2, h: 2 });
      slots.push({ id: roomId, roomId, unlocked: index < 4, expansionCost: index < 4 ? 0 : index === 4 ? 40 : 60 });
    }
    const connect = (a, b, x, y, orientation) => doors.push({ id: `door-${a}-${b}`, a, b, x, y, orientation, airlock: false });
    for (let row = 0; row < 2; row++) for (let col = 0; col < 2; col++) {
      connect('bay' + (row * 3 + col + 1), 'bay' + (row * 3 + col + 2), (col + 1) * 2, 4.5 + row * 2, 'vertical');
    }
    for (let col = 0; col < 3; col++) connect('bay' + (col + 1), 'bay' + (col + 4), col * 2 + 0.5, 6, 'horizontal');
    for (const room of base.rooms) for (let col = 0; col < 3; col++) {
      const left = Math.max(room.x, col * 2), right = Math.min(room.x + room.w, col * 2 + 2);
      if (room.y + room.h === 4 && right > left) connect(room.id, 'bay' + (col + 1), left + 0.5, 4, 'horizontal');
    }
    const tiles = rooms.flatMap(room => Array.from({ length: room.w * room.h }, (_, index) => ({
      roomId: room.id, x: room.x + index % room.w, y: room.y + Math.floor(index / room.w)
    })));
    for (const door of doors) {
      if (door.airlock && door.orientation === 'horizontal' && door.y === 4 && door.x < 6) {
        door.a = 'bay' + (4 + Math.min(2, Math.floor(door.x / 2)));
        door.id = 'airlock-' + door.a; door.y = 8;
      }
      const first = tiles.filter(tile => tile.roomId === door.a), second = tiles.filter(tile => tile.roomId === door.b);
      if (!door.airlock) {
        const pairs = first.flatMap(a => second.filter(b => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1).map(b => ({ a, b,
          distance: Math.hypot((a.x + b.x + 1) / 2 - door.x, (a.y + b.y + 1) / 2 - door.y) })));
        pairs.sort((a, b) => a.distance - b.distance || a.a.y - b.a.y || a.a.x - b.a.x);
        if (!pairs.length) throw new Error('No cardinal doorway: ' + id + '/' + door.id);
        const pair = pairs[0];
        door.tileA = { x: pair.a.x, y: pair.a.y }; door.tileB = { x: pair.b.x, y: pair.b.y };
        door.x = (pair.a.x + pair.b.x + 1) / 2; door.y = (pair.a.y + pair.b.y + 1) / 2;
      } else {
        const candidates = first.filter(tile => door.orientation === 'vertical'
          ? Math.abs(tile.x + 0.5 - door.x) === 0.5 : Math.abs(tile.y + 0.5 - door.y) === 0.5);
        candidates.sort((a, b) => Math.hypot(a.x + 0.5 - door.x, a.y + 0.5 - door.y) - Math.hypot(b.x + 0.5 - door.x, b.y + 0.5 - door.y));
        door.tileA = { x: candidates[0].x, y: candidates[0].y }; door.tileB = null;
        if (door.orientation === 'vertical') door.y = candidates[0].y + 0.5; else door.x = candidates[0].x + 0.5;
      }
    }
    D.layouts[id] = { id, name: base.name + ' · 모듈형', description: '독립 시스템 확장실 6개. 4개 마운트는 출항 시 사용 가능하며 나머지는 증설할 수 있습니다.',
      width: base.width, height: 8, rooms, doors, slots, tileMovement: true,
      outline: [[-0.35,-0.35],[base.width+0.35,-0.35],[base.width+0.65,2],[6.35,8.35],[-0.35,8.35],[-0.65,3]] };
  }
  for (const loadout of Object.values(D.loadouts)) loadout.spec.layoutId = loadout.id + '_v7';

  D.legacySectorNames = ['여명 항로', '유리 성운', '마지막 신호'];
  D.campaignRules = { totalSectors: 8, localColumns: 6, fleetAdvance: 0.75, fleetStart: -2, baseMaxTurns: 3, maxQuests: 12, maxQuestHistory: 12, maxVisits: 1000000 };
  D.sectorTypes = {
    civilian: { id: 'civilian', name: '민간 거주 구역', category: 'friendly', color: '#91c9a8', description: '구조 신호와 교역소가 많습니다. 주민의 부탁은 다른 비콘으로 이어집니다.', eventPool: ['relay','refugees','merchant','clinic','castaway','observatory','quarantine'], enemyProfiles: ['raider','raider','disruptor'] },
    industrial: { id: 'industrial', name: '독립 산업 구역', category: 'friendly', color: '#dfc78b', description: '공방과 폐선에서 장비를 구할 수 있습니다. 부품을 쓸지 회수할지 선택하세요.', eventPool: ['workshop','wreck','merchant','reactor','observatory','relay','blueprint'], enemyProfiles: ['raider','disruptor','artillery'] },
    raider: { id: 'raider', name: '약탈선 접경', category: 'hostile', color: '#db9c80', description: '매복과 검문이 이어집니다. 위험을 감수하면 더 많은 전리품을 얻습니다.', eventPool: ['ambush','wreck','checkpoint','castaway','smuggler','refugees','blueprint'], enemyProfiles: ['raider','artillery','raider'] },
    mantis: { id: 'mantis', name: '강습 함대 항로', category: 'hostile', color: '#d8899d', description: '강습선과 포로 수송선이 활동합니다. 선내 방어와 의료 설비를 준비하세요.', eventPool: ['refugees','castaway','ambush','quarantine','checkpoint','clinic','wreck'], enemyProfiles: ['boarding','boarding','raider'] },
    nebula: { id: 'nebula', name: '유리 성운', category: 'nebula', color: '#b4a2e1', description: '성운 비콘에서는 추격이 느려집니다. 이온 폭풍과 길 잃은 신호가 기다립니다.', eventPool: ['relay','observatory','blueprint','wreck','smuggler','reactor','ambush'], enemyProfiles: ['disruptor','boarding','disruptor'] },
    rebel: { id: 'rebel', name: '반군 봉쇄 구역', category: 'hostile', color: '#df8e75', description: '포격함과 검문소가 많습니다. 추격 전선을 살피며 출구를 확보하세요.', eventPool: ['checkpoint','ambush','refugees','smuggler','relay','reactor','blueprint'], enemyProfiles: ['artillery','artillery','disruptor'] },
    final: { id: 'final', name: '연방 최후 방어선', category: 'final', color: '#eadcb7', description: '반군 기함을 추격하고 연방 기지를 지키세요. 기함이 기지에서 세 지도 턴을 버티면 항해가 끝납니다.', eventPool: [], enemyProfiles: ['artillery'] }
  };
  D.questDefinitions = {
    relay: { id: 'relay', name: '묵음 중계망', summary: '우회 중계기를 되살리고 다음 섹터의 연락선에 좌표를 전달하세요.', stages: ['우회 중계기 복구','다음 섹터 연락선 접촉'], deadline: 16 },
    escort: { id: 'escort', name: '작은 불빛들의 호송', summary: '난민선을 매복 지점에서 구하고 인근 대피소까지 인도하세요.', stages: ['호송선과 합류','대피소 도착'], deadline: 9 },
    blueprint: { id: 'blueprint', name: '잃어버린 설계도', summary: '폐쇄 연구선에서 기록을 찾고 다음 섹터 연구 거점에 전달하세요.', stages: ['연구선 기록 회수','다음 섹터 연구 거점 방문'], deadline: 16 }
  };
  D.shopStock = { fuel: 4, missiles: 4, drone_parts: 4, burst_laser: 1, artemis: 1, heavy_laser: 1, beam: 1, ion: 1, combat_drone: 1, defense_drone: 1, recruit_human: 1, recruit_engi: 1, recruit_mantis: 1 };
  const C = (id, label, description, effect = {}, requirements = [], costs = {}) => ({ id, label, description, style: requirements.length ? 'blue' : 'normal', requirements, costs, effect });
  const crew = species => ({ kind: 'crew', species });
  const system = (id, level = 1) => ({ kind: 'system', id, level, operational: true });
  const weapon = defId => ({ kind: 'weapon', defId });
  const drone = defId => ({ kind: 'drone', defId });
  D.events = {
    relay: { id: 'relay', title: '아직 켜져 있는 중계기', body: '끊어진 중계기에서 아이의 음성이 반복됩니다. 다음 항로에 응답을 전할 연락선이 있다고 합니다.', choices: [
      C('relay_quest','중계망 복구를 맡는다','퀘스트 시작. 이 섹터의 우회 중계기, 다음 섹터의 연락선까지 이어집니다.',{ questStart:'relay' }),
      C('relay_repair','[엔지] 현장 수리를 한다','스크랩 24 + 연료 1. 장거리 임무는 맡지 않습니다.',{scrap:24,fuel:1},[crew('engi')]),
      C('relay_expert','[수리 숙련 1] 송신 출력을 안정화한다','스크랩 28 + 연료 2.',{scrap:28,fuel:2},[{kind:'skill',id:'repair',level:1}]),
      C('relay_salvage','예비 자재만 회수한다','스크랩 14. 통신기는 남겨 둡니다.',{scrap:14})
    ] },
    refugees: { id:'refugees',title:'작은 불빛들의 행렬',body:'난민선 세 척이 같은 노래를 송신합니다. 대피소 좌표는 있지만, 그 사이에서 함선들이 사라지고 있습니다.',choices:[
      C('refugee_quest','대피소까지 호위를 약속한다','연료 1 사용. 두 목적지를 잇는 호송 퀘스트를 시작합니다.',{questStart:'escort'},[],{fuel:1}),
      C('refugee_drone','[방어 드론] 예비 기체를 남긴다','부품 1 → 스크랩 27 + 연료 1. 장착한 설계도는 유지됩니다.',{scrap:27,fuel:1},[drone('defense')],{droneParts:1}),
      C('refugee_help','의료 물자를 교환한다','스크랩 10 → 선체 4, 승무원 체력 30 회복.',{hull:4,crewHeal:30},[],{scrap:10}),
      C('refugee_listen','항로 정보를 나누고 떠난다','연료 1 + 스크랩 8.',{fuel:1,scrap:8})
    ] },
    merchant:{id:'merchant',title:'불 켜진 화물칸',body:'상인은 차부터 내밉니다. “살아 돌아오는 손님이 좋은 손님이지.” 이번 거래는 하나만 고를 수 있습니다.',choices:[
      C('merchant_fuel','연료를 산다','스크랩 10 → 연료 4.',{fuel:4},[],{scrap:10}),
      C('merchant_ammo','탄약을 산다','스크랩 12 → 미사일 5.',{missiles:5},[],{scrap:12}),
      C('merchant_delay','가짜 항로 정보를 퍼뜨려 달라고 한다','스크랩 16 → 이후 반군 전진 1.5열 상쇄.',{fleetDelay:1.5},[],{scrap:16}),
      C('merchant_pass','무사 항해를 빌고 떠난다','추가 비용과 보상이 없습니다.',{})
    ]},
    wreck:{id:'wreck',title:'유리 조각 사이에서',body:'우편선이 파편 구름에 갇혀 있습니다. 봉인된 안쪽 화물칸은 상태를 알 수 없습니다.',choices:[
      C('wreck_deep','봉인된 화물칸을 연다','성공 시 스크랩 30 + 미사일 2. 파편 충돌 시 선체 3 손실과 스크랩 18. 함선은 파괴되지 않습니다.',{outcomes:[{weight:3,effect:{scrap:30,missiles:2}},{weight:2,effect:{scrap:18,hull:-3}}]}),
      C('wreck_rock','[록] 외벽을 따라 회수한다','선체 손실 없이 스크랩 24 + 미사일 2.',{scrap:24,missiles:2},[crew('rock')]),
      C('wreck_cloak','[은폐] 감시망을 피해 접근한다','연료 1 → 스크랩 28 + 드론 부품 1.',{scrap:28,droneParts:1},[system('cloaking')],{fuel:1}),
      C('wreck_safe','흩어진 우편함만 회수한다','스크랩 12 + 연료 1.',{scrap:12,fuel:1})
    ]},
    clinic:{id:'clinic',title:'고요한 의무실',body:'의료선의 의사가 호출합니다. “깃발은 묻지 않겠습니다. 다친 사람부터 보여 주세요.”',choices:[
      C('clinic_treat','생존 승무원 치료를 받는다','생존 승무원 완전 회복 + 선체 3 회복.',{crewHeal:999,hull:3}),
      C('clinic_engi','[엔지] 의료 장비를 정비한다','승무원 완전 회복 + 스크랩 22.',{crewHeal:999,scrap:22},[crew('engi')]),
      C('clinic_recruit','지원자 유나와 함께 출항한다','인간 승무원 1명. 정원 8명에 빈자리가 필요합니다.',{recruit:{species:'human',name:'유나'}}),
      C('clinic_supplies','출항 준비를 돕는다','스크랩 16 + 미사일 2.',{scrap:16,missiles:2})
    ]},
    ambush:{id:'ambush',title:'아무도 답하지 않는 SOS',body:'구조 신호 뒤에 무장 선박이 숨어 있습니다. 보급 창고로 이어지는 암호화 송신도 잡힙니다.',choices:[
      C('ambush_fight','매복 선박을 공격한다','강한 적과 교전. 승리 시 스크랩 14 추가.',{combat:'elite',combatBonus:14}),
      C('ambush_hack','[해킹] 창고 좌표만 빼낸다','드론 부품 1 → 교전 없이 스크랩 20 + 연료 2.',{scrap:20,fuel:2},[system('hacking')],{droneParts:1}),
      C('ambush_leave','신호를 무시한다','전투와 보상 없이 항해를 계속합니다.',{})
    ]},
    workshop:{id:'workshop',title:'반딧불 공방',body:'작은 드론들이 작업장 천장을 날아다닙니다. 정비사가 새 날개와 오래된 부품 상자를 번갈아 가리킵니다.',choices:[
      C('workshop_parts','예비 부품을 나누어 받는다','드론 부품 3 + 스크랩 6.',{droneParts:3,scrap:6}),
      C('workshop_install','공격 드론을 주문한다','스크랩 30 → 공격 드론 회수품 + 부품 1. 화물칸 회수 후 장착하거나 스크랩 21로 분해합니다.',{salvage:{kind:'drone',defId:'combat'},droneParts:1},[],{scrap:30}),
      C('workshop_ion','[이온 펄스] 시험 회로를 방전한다','스크랩 20 + 드론 부품 2.',{scrap:20,droneParts:2},[weapon('ion')]),
      C('workshop_salvage','오래된 기체를 분해한다','스크랩 22.',{scrap:22})
    ]},
    castaway:{id:'castaway',title:'새로운 승무원의 자리',body:'연락선에서 정비사와 호위 전사가 호출합니다. 한 사람과 계약하거나 보급품만 교환할 수 있습니다.',choices:[
      C('castaway_engi','엔지 정비사 니모와 계약한다','스크랩 16 → 엔지 승무원 1명.',{recruit:{species:'engi',name:'니모'}},[],{scrap:16}),
      C('castaway_mantis','맨티스 전사 케트와 계약한다','스크랩 18 → 맨티스 승무원 1명.',{recruit:{species:'mantis',name:'케트'}},[],{scrap:18}),
      C('castaway_supplies','보급품을 나눈다','드론 부품 2 + 스크랩 10.',{droneParts:2,scrap:10})
    ]},
    observatory:{id:'observatory',title:'별을 세던 사람들',body:'관측소의 렌즈는 적 함대의 이동을 기록했습니다. 운영자는 어느 쪽 정보를 가져갈지 묻습니다.',choices:[
      C('observatory_chart','주변 비콘 정보를 받는다','현재 섹터의 모든 비콘 종류와 환경을 공개합니다.',{reveal:true}),
      C('observatory_hack','[해킹] 반군 통신망에 거짓 좌표를 넣는다','부품 1 → 추격 2열 지연 + 스크랩 12.',{fleetDelay:2,scrap:12},[system('hacking')],{droneParts:1}),
      C('observatory_battery','[배터리] 관측소 전력을 보충한다','스크랩 18 + 연료 2.',{scrap:18,fuel:2},[system('battery')]),
      C('observatory_pass','관측 기록을 사양한다','보상 없이 떠납니다.',{})
    ]},
    quarantine:{id:'quarantine',title:'잠긴 격리 구역',body:'연구 정거장에서 구조 요청이 옵니다. 승무원이 두려움에 문을 잠갔고, 의료 장치의 전력이 끊겼습니다.',choices:[
      C('quarantine_medical','[의료 2] 원격 치료 계획을 전한다','스크랩 26 + 연료 2. 의료 설비 정상 용량 2 필요.',{scrap:26,fuel:2},[system('medbay',2)]),
      C('quarantine_mind','[정신 제어] 공포에 빠진 경비를 진정시킨다','스크랩 22 + 드론 부품 2. 인명 손실 없이 문을 엽니다.',{scrap:22,droneParts:2},[system('mind')]),
      C('quarantine_supplies','비상 물품만 전송한다','연료 1 → 스크랩 16. 정거장 안으로 들어가지 않습니다.',{scrap:16},[],{fuel:1}),
      C('quarantine_leave','구조 좌표를 방송하고 떠난다','보상 없이 떠납니다.',{})
    ]},
    checkpoint:{id:'checkpoint',title:'서류 없는 검문소',body:'반군 검문소가 항로를 막습니다. 통행세는 스크랩 18. 송신 담당자가 신분 확인을 기다립니다.',choices:[
      C('checkpoint_pay','통행세를 낸다','스크랩 18 소비. 전투를 피합니다.',{},[],{scrap:18}),
      C('checkpoint_mind','[정신 제어] 통과 승인을 얻는다','연료 2 + 추격 0.75열 지연.',{fuel:2,fleetDelay:0.75},[system('mind')]),
      C('checkpoint_fight','검문 함선과 싸운다','일반 적과 전투. 승리 시 스크랩 8 추가.',{combat:'normal',combatBonus:8}),
      C('checkpoint_detour','우회 경로로 빠져나간다','연료 1 소비. 선체와 승무원 손실 없음.',{},[],{fuel:1})
    ]},
    smuggler:{id:'smuggler',title:'이름을 묻지 않는 화물',body:'밀수선이 봉인된 상자를 내밉니다. 거래를 받아들이기 전에 화물의 상태를 확인할 수 있습니다.',choices:[
      C('smuggler_inspect','상자를 검사한다','검사 후 다음 선택으로 이어집니다. 지금은 비용이 없습니다.',{nextEvent:'smuggler_offer'}),
      C('smuggler_cloak','[은폐] 뒤따르는 감시선을 따돌린다','스크랩 24 + 연료 1.',{scrap:24,fuel:1},[system('cloaking')]),
      C('smuggler_leave','거절한다','보상과 비용 없이 떠납니다.',{})
    ]},
    smuggler_offer:{id:'smuggler_offer',title:'봉인이 풀린 상자',body:'상자에는 연료와 드론 부품이 있습니다. 반군의 추적 표지도 붙어 있습니다. 표지를 제거하면 거래할 수 있습니다.',choices:[
      C('smuggler_buy','추적 표지를 떼고 산다','스크랩 20 → 연료 4 + 드론 부품 2. 추격 0.75열 추가.',{fuel:4,droneParts:2,fleetAdvance:0.75},[],{scrap:20}),
      C('smuggler_ion','[이온 펄스] 표지를 무력화하고 산다','스크랩 15 → 연료 4 + 드론 부품 2. 추격 추가 없음.',{fuel:4,droneParts:2},[weapon('ion')],{scrap:15}),
      C('smuggler_decline','다시 봉인해 돌려준다','아무것도 지불하지 않습니다.',{})
    ]},
    reactor:{id:'reactor',title:'꺼지기 전의 마지막 불빛',body:'작업선의 보조 전원만 남았습니다. 본체가 식기 전에 사람을 꺼내거나 저장고를 회수할 수 있습니다.',choices:[
      C('reactor_teleport','[텔레포터] 작업자를 구한다','연료 1 → 스크랩 24 + 추격 0.75열 지연.',{scrap:24,fleetDelay:0.75},[system('teleporter')],{fuel:1}),
      C('reactor_battery','[배터리] 비상 회로에 전원을 댄다','선체 4 회복 + 드론 부품 2.',{hull:4,droneParts:2},[system('battery')]),
      C('reactor_risk','저장고까지 접근한다','스크랩 28. 선체 최대 3 손실. 함선은 파괴되지 않습니다.',{scrap:28,hull:-3}),
      C('reactor_safe','외부 연료통만 회수한다','연료 2.',{fuel:2})
    ]},
    blueprint:{id:'blueprint',title:'아직 쓰이지 않은 설계도',body:'우편 봉투에 폐쇄 연구선과 다음 섹터 연구 거점의 좌표가 적혀 있습니다. 수신인은 오래전에 사라졌습니다.',choices:[
      C('blueprint_quest','기록을 찾아 전달한다','두 섹터에 걸친 설계도 퀘스트를 시작합니다.',{questStart:'blueprint'}),
      C('blueprint_engi','[엔지] 남은 도면을 정리한다','장거리 임무 대신 스크랩 24 + 드론 부품 1.',{scrap:24,droneParts:1},[crew('engi')]),
      C('blueprint_leave','좌표를 다른 함선에 전달한다','연료 1 + 스크랩 10.',{fuel:1,scrap:10})
    ]}
  };
})();
