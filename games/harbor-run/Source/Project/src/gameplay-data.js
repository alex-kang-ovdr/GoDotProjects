/* Harbor Run v4 authoring data. Values are prototype proposals, NOT recovered GTA V binaries. */
'use strict';
const HarborGameplayData = (() => {
  const data = {
    schemaVersion: 4,
    revision: '4.0.0',
    classification: 'PROPOSED_TUNING_NOT_GTA_MEASURED',
    weapons: {
      pistol: { damage: 28, rpm: 320, reload: 1.6, cap: 12, pellets: 1, rangeStart: 15, rangeEnd: 50, minFactor: .50, headMultiplier: 2.4 },
      smg: { damage: 15, rpm: 780, reload: 2.0, cap: 30, pellets: 1, rangeStart: 20, rangeEnd: 65, minFactor: .40, headMultiplier: 2.4 },
      rifle: { damage: 24, rpm: 650, reload: 2.3, cap: 30, pellets: 1, rangeStart: 45, rangeEnd: 120, minFactor: .55, headMultiplier: 2.4 },
      shotgun: { damage: 9, rpm: 75, reload: 3.5, cap: 6, pellets: 8, rangeStart: 5, rangeEnd: 25, minFactor: .20, headMultiplier: 2.4 },
      marksman: { damage: 90, rpm: 45, reload: 2.8, cap: 8, pellets: 1, rangeStart: 120, rangeEnd: 300, minFactor: .70, headMultiplier: 2.4 }
    },
    recovery: { capHealth: 50, delaySeconds: 8, ratePerGameSecond: 4 },
    clock: { tickHz: 60, stallPauseSeconds: .25, maxUiFrameSeconds: .1 },
    police: { maxLevel: 3, searchSeconds: [0, 15, 25, 40], maxVehicles: [0, 2, 3, 4] },
    wheel: { worldScale: .15 },
    ability: {
      maxEnergy: 100,
      drainPerActiveSecond: 12.5,
      regenPerActiveSecond: 5,
      cooldownSeconds: 3,
      minimumActivationEnergy: 20,
      roles: {
        focus: { title: '사수', label: '집중 사격', description: '도보에서 시간을 늦추고 빠르게 대응합니다.', context: 'on_foot', worldScale: .35, actionRate: 2, outgoingScale: 1, incomingScale: 1, steeringAssist: 1 },
        driving: { title: '드라이버', label: '정밀 운전', description: '운전 중 시간을 늦춰 코너와 장애물에 대응합니다.', context: 'driver', worldScale: .35, actionRate: 1, outgoingScale: 1, incomingScale: 1, steeringAssist: 1.35 },
        assault: { title: '돌파자', label: '돌파', description: '도보에서 공격을 강화하고 받는 피해를 줄입니다.', context: 'on_foot', worldScale: 1, actionRate: 1, outgoingScale: 1.5, incomingScale: .65, steeringAssist: 1 }
      }
    },
    sources: {
      officialManual: 'https://dlassets-ssl.xboxlive.com/public/content/4f0a3089-ba2c-4f3d-9e38-102a41cbd885/GameManual/bffef18e-3f19-4190-a9b1-75402359b13b/en-GB/index.html',
      officialAbilities: 'https://www.rockstargames.com/newswire/article/ak14o88385k4a8/more-details-and-screens-from-the-grand-theft-auto-v-special-and.html',
      designData: 'GTA5_3D_TPS_ReverseDesign_v7/data/gameplay.json',
      designRules: 'GTA5_3D_TPS_ReverseDesign_v7/docs/03_TPS_Combat_Cover_and_Camera.md'
    },
    notes: [
      '공식 자료는 무기 휠과 세 특수 능력의 정성적 행동 근거입니다. 실제 GTA V 내부 수치 복구를 주장하지 않습니다.',
      'v7 기획 수치를 현 실행기에 맞게 적용했습니다. v3 저장 호환을 위해 탄창 [12,30,30,6,8]과 기존 예비탄 수는 유지합니다.',
      '샷건 damage는 펠릿당 값입니다. 총 피해 계산에서 pellets를 중복 곱하지 않습니다.',
      '체력 50 상한·8초 지연·4/초 회복과 능력 배율·지속시간은 자체 튜닝입니다.',
      '3종 역할은 한 플레이어의 시작 장비 선택입니다. 원작 3인 주인공 전환 구현이 아닙니다.'
    ]
  };
  const provenance = {};
  function markNumbers(value, prefix) {
    for (const [key, child] of Object.entries(value)) {
      const path = prefix ? prefix + '.' + key : key;
      if (typeof child === 'number') provenance[path] = {
        classification: 'PROPOSED_TUNING',
        origin: path.startsWith('weapons.') ? 'v7 authoring values adapted to v3 magazine compatibility' : 'v4 authoring proposal',
        originalMeasured: false
      };
      else if (child && typeof child === 'object' && !Array.isArray(child)) markNumbers(child, path);
    }
  }
  for (const key of ['weapons', 'recovery', 'wheel', 'ability', 'clock', 'police']) markNumbers(data[key], key);
  for (const key of ['searchSeconds','maxVehicles']) data.police[key].forEach((value,index) => {
    provenance['police.'+key+'.'+index] = {classification:'PROPOSED_TUNING', origin:key==='searchSeconds'?'v7 levels 0–3':'v3 compact-world dispatch limits',originalMeasured:false};
  });
  provenance['behavior.weaponWheel'] = { classification: 'OFFICIAL_BEHAVIOR', source: data.sources.officialManual, claim: 'Hold selection wheel, select a weapon, release to equip. Exact slowing factor is proposed.' };
  provenance['behavior.abilities'] = { classification: 'OFFICIAL_BEHAVIOR', source: data.sources.officialAbilities, claim: 'On-foot shooting focus, road-driving focus, and rage are distinct ability archetypes. Numeric tuning and names here are original.' };
  data.provenance = provenance;
  function deepFreeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const child of Object.values(value)) deepFreeze(child);
    }
    return value;
  }
  return deepFreeze(data);
})();
if (typeof window !== 'undefined') window.HarborGameplayData = HarborGameplayData;
if (typeof module !== 'undefined') module.exports = HarborGameplayData;
