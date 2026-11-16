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
      drones: '드론', teleporter: '텔레포터', cloaking: '은폐'
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
        description: '삼연장 레이저와 실드 관통 미사일, 서로 다른 세 종족의 균형 잡힌 승무원. 방어 드론은 필요할 때 출격시키세요.',
        spec: {
          name: '아르고', layoutId: 'argo', hull: 30, maxHull: 30, reactor: 10, shieldLayers: 1, weaponLevel: 4,
          weaponDefs: ['burst_laser', 'artemis'], crewCount: 3,
          crewTypes: ['human', 'engi', 'rock'], crewNames: ['아린', '픽스', '바위'], droneDefs: ['defense'],
          auxLevels: { drones: 2, teleporter: 1, cloaking: 0 }, auxPower: { drones: 0, teleporter: 0, cloaking: 0 }
        },
        resources: { scrap: 60, fuel: 12, missiles: 10, droneParts: 4 }
      },
      atlas: {
        id: 'atlas', name: '아틀라스', role: '드론 지원함', tagline: '작은 날개들로 길을 열다', accent: '#b6db82',
        description: '이온으로 실드를 잠그고 중형 레이저와 공격 드론을 연결하세요. 엔지 두 명이 수리를 맡지만 선내 전투는 신중해야 합니다. 드론은 부품을 사용해 직접 출격시킵니다.',
        spec: {
          name: '아틀라스', layoutId: 'atlas', hull: 28, maxHull: 28, reactor: 11, shieldLayers: 1, weaponLevel: 4,
          weaponDefs: ['ion', 'heavy_laser'], crewCount: 3,
          crewTypes: ['human', 'engi', 'engi'], crewNames: ['세라', '니모', '모스'], droneDefs: ['combat', 'defense'],
          auxLevels: { drones: 2, teleporter: 1, cloaking: 0 }, auxPower: { drones: 2, teleporter: 0, cloaking: 0 }
        },
        resources: { scrap: 50, fuel: 12, missiles: 6, droneParts: 6 }
      },
      wraith: {
        id: 'wraith', name: '레이스', role: '은폐 타격함', tagline: '보이지 않는 순간, 가장 선명한 궤적', accent: '#c1a4f2',
        description: '삼연장 레이저와 두 지점 빔으로 방을 가로지릅니다. 적 포화를 은폐로 피한 뒤 사격하세요. 자신의 발사는 은폐를 해제하므로 자동 사격과 타이밍을 조절해야 합니다.',
        spec: {
          name: '레이스', layoutId: 'wraith', hull: 26, maxHull: 26, reactor: 11, shieldLayers: 1, weaponLevel: 4,
          weaponDefs: ['burst_laser', 'beam'], crewCount: 3,
          crewTypes: ['human', 'engi', 'human'], crewNames: ['루아', '루멘', '단'], droneDefs: ['defense'],
          auxLevels: { drones: 2, teleporter: 1, cloaking: 1 }, auxPower: { drones: 0, teleporter: 0, cloaking: 1 }
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
    sectorNames: ['여명 항로', '유리 성운', '마지막 신호'],
    sectorSubtitles: ['떠나는 이들의 불빛', '아무도 답하지 않는 곳', '우리가 돌아갈 좌표'],
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
})();
