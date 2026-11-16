# 10. 방어 시설·함정·가디언·배치 설계

> 기준일: 2026-11-13 KST. TH18까지의 현행 방어 구조를 중심으로 한다. TH19의 출시 예고는 현재 사용 가능한 방어 규칙과 합치지 않는다. `[확인]`은 공식 근거, `[해석]`은 전략 분석, `[제안]`은 데이터·구현 명세, `[미확인]`은 실기 검증 대상이다.

## 1. 방어의 목적 함수

방어의 목표는 모든 유닛을 제거하는 것만이 아니다. 일반 자원 전투에서는 약탈 손실을 줄이고, 경쟁·전쟁에서는 별·파괴율·시간을 제한하는 것이 중요하다. 같은 시설과 레벨도 목표가 다르면 다른 배치가 된다. [해석]

| 배치 목표 | 주요 보호 대상 | 감수할 수 있는 손실 |
|---|---|---|
| 자원 보존 | 가치가 높은 자원 저장 구역 | 외곽 파괴율·일부 시설 |
| 회관 보호 | 회관 진입 경로 | 상대에게 외곽 정리 기회 제공 |
| 완파 방지 | 핵심 방어의 분산·마지막 구역 | 회관이나 2별을 허용할 수 있음 |
| 시간 소모 | 구획·거리·남는 건물 | 개별 시설을 빠르게 잃을 수 있음 |
| 특정 조합 대응 | 그 조합의 취약 구간 | 다른 조합에 상대적 약점 |

어떤 배치도 모든 목적을 동시에 최적화하지 못한다. 따라서 `가장 강한 배치` 대신 평가 모드와 예상 공격군을 명시해야 한다. [해석]

## 2. 방어 시설의 기능 분류

아래는 개별 레벨 도감 대신 방어 효과를 분석하는 분류다. 대표 시설의 모든 수치·사거리·대상은 현재 게임 데이터로 보완해야 한다. [해석·미확인]

| 기능 | 대표 범주 | 공격자에게 요구하는 대응 |
|---|---|---|
| 단일 대상 지속 피해 | 대포·아처 타워·석궁 계열 | 탱킹·진입 순서·집중 제거 |
| 집단 억제 | 마법사 타워·박격포·광역 방어 | 병력 분산·보호·빠른 제압 |
| 공중 경로 통제 | 대공 방어·바람 방어 | 진입 방향·마법·탱커 경로 |
| 높은 HP 대응 | 인페르노·모놀리스 계열 | 집중 사격 중단·타깃 전환 |
| 다중 대상·연쇄 | 멀티 계열·합성 방어 | 군대 밀도·소환물 관리 |
| 방향성 화력 | Firespitter | 정면과 측후방의 가치 차이 |
| 지원·수리 | 방어 장인·마법 타워 | 직접 화력 외의 지속 기여 차단 |
| 전투 경과 강화 | Revenge Tower | 제거 순서의 기회비용 |
| 이동형 방어 | 방어 영웅·Guardian | 건물만으로 설명되지 않는 전투 변수 |
| 기간 한정 구성 | Crafted Defense | 현재 단계의 특수 역할에 대응 |

모놀리스의 최대 HP 비례 추가 피해, 마법 타워의 선택형 지원은 [C14](https://supercell.com/en/games/clashofclans/blog/release-notes/full-release-notes-2/)에, Firespitter의 방향·투사체 특성은 [C20](https://supercell.com/en/games/clashofclans/blog/game-updates/the-town-hall-17-update-is-here-2/)에, TH18 특수 방어는 [C15](https://supercell.com/en/games/clashofclans/blog/release-notes/town-hall-18-crash-lands-update/)에 근거한다.

## 3. 사거리 중첩은 시간 문제다

방어 사거리 원이 많이 겹친다고 항상 강한 배치는 아니다. 공격 유닛이 그 영역에서 **얼마나 오래 살아 움직이는지**, 같은 시점에 어떤 방어가 활성화되는지, 마법 한 번으로 몇 시설이 무력화되는지를 함께 봐야 한다. [해석]

분석용 위협 모델의 예는 다음과 같다. [제안]

`경로 위협 ≈ 경로를 따라 누적한 유효 DPS × 노출 시간 + 함정 위험 + 상태 이상 손실`

마법을 이용해 여러 방어를 한 번에 멈출 수 있으면 밀집 배치의 장점이 줄어든다. 반대로 너무 흩어 놓으면 공격자가 각 시설을 순서대로 처리하며 회복할 시간을 얻는다. 배치의 핵심은 최대 화력보다 **공격자가 감당하기 어려운 시간 구간을 만드는 것**이다. [해석]

## 4. 벽·구획·건물 간격

| 공간 요소 | 작동 원리 | 잘못 해석하기 쉬운 점 |
|---|---|---|
| 벽 | 지상 진입을 지연·분리 | 모든 유닛에 같은 장벽이 아님 |
| 작은 구획 | 자주 목표·경로 결정을 요구 | 벽 통과·광역 제거에 약해질 수 있음 |
| 큰 구획 | 넓은 집중 화력 구간 | 한 번 진입하면 여러 시설에 접근 가능 |
| 건물 간격 | 연쇄·범위 공격의 효율 변화 | 간격을 벌리는 것만으로 모든 조합 대응 불가 |
| 빈 공간 | 이동·투입·함정 의심을 유도 | 실제 투입 가능 영역과 반드시 함께 검증 |
| 외곽 건물 | 타깃 선택·파괴율·시간에 영향 | 약한 건물도 길 정리의 기준점이 됨 |

벽 레벨의 가치는 HP 증가 자체뿐 아니라 공격자가 벽을 파괴할지 우회할지 선택하는 경계를 바꾸는 데 있다. 공중군이나 특정 통과 능력에 대해 같은 효과를 기대할 수 없으므로, 벽 강화의 효율은 예상 공격 조합에 조건부다. [해석]

레이아웃 에디터에서는 배치 가능 여부, 시설 수 제한, 회관별 해금, 겹침, 미배치 시설을 검사한다. 전투 중 실제 경로와 에디터의 건물 발자국이 일치하는지도 중요하다. [제안]

## 5. 함정: 숨겨진 정보와 임계값

함정은 배치가 공개되는 방어 건물과 달리 공격자의 완전한 계산을 어렵게 만든다. 다만 모든 함정이 숨겨져 있다고 일반화할 수 없다. TH17의 Giga Bomb은 공식 도입 설명에서 항상 보이는 함정으로 명시되었다. [확인: C20](https://supercell.com/en/games/clashofclans/blog/game-updates/the-town-hall-17-update-is-here-2/)

### 함정 데이터 제안

```yaml
TrapDefinition:
  trapId: string
  visibilityPolicy: hidden_or_visible
  triggerShape: circle_or_box
  triggerRadius: number
  triggerTargets: tags
  activationDelay: duration
  effectType: damage_or_launch_or_spawn_or_knockback
  effectRadius: number
  maxAffectedHousing: integer_or_null
  targetSelectionPolicy: enum
  canBeTriggeredBySummons: boolean
  perBattleUses: integer
```

함정 발동 범위와 피해 범위를 분리한다. 작은 유닛 하나가 발동시켰을 때 뒤따르는 병력에게 얼마나 영향을 주는지에 따라 배치 가치가 달라진다. 여러 유닛이 동시에 범위에 들어온 경우 순서와 수용량 한도를 정의한다. [제안]

2026년 10월 공식 패치는 Ruin Knight의 수용량을 20에서 18로 낮춰 Spring Trap이 날려 보낼 수 있게 조정했다. 이는 수용량이 편성 비용뿐 아니라 특수 판정의 임계값으로도 쓰인다는 구체 사례다. 당시 발표 수치와 변경 방향을 사례로 사용하며 다른 유닛의 함정 수용량을 추정하지 않는다. [확인: C26](https://supercell.com/en/games/clashofclans/blog/news/balance-changes-incoming-october-2026/)

### 함정 배치의 해석

- 주력 부대가 모이는 지점에 둔다면 발동 가치가 커지지만 작은 탐색 병력으로 먼저 소모될 수 있다.
- 핵심 방어 앞에 두면 보호 마법 사용 시점과 충돌하도록 만들 수 있다.
- 예상 이동 경로에서 조금 벗어나면 탐색을 피할 수 있지만 실제 발동률이 낮아질 수 있다.
- 같은 종류를 몰아 두면 특정 조합에 강하고, 분산하면 여러 진입 방향에 대응한다. [해석]

## 6. 회관 방어는 레벨별 규칙이 다르다

회관을 항상 `자원·별을 주는 비무장 건물`이나 항상 `파괴 시 폭발하는 방어 시설`로 취급하면 안 된다. 예를 들어 TH17 도입은 회관과 독수리 포탑 결합, 새로운 회관 무기, 기존 사망 폭탄 제거를 명시했다. TH18에는 가디언이라는 별도 방어 축이 추가된다. [확인: C20](https://supercell.com/en/games/clashofclans/blog/game-updates/the-town-hall-17-update-is-here-2/), [C15](https://supercell.com/en/games/clashofclans/blog/release-notes/town-hall-18-crash-lands-update/)

재구현에서는 `townHallLevel → weaponProfileId, deathEffectId, guardianPolicyId`를 매핑한다. 더 높은 회관의 기능을 이전 회관에 자동 상속시키면 사라진 무기·변경된 사망 효과까지 중복 적용될 수 있다. [제안]

## 7. 가디언

가디언은 TH18에서 선택하는 방어 전용 전력이며 한 번에 하나를 배정한다. 업그레이드 중에는 일반 방어에 사용할 수 없지만 Ranked·전쟁·CWL의 스냅샷 방어는 완료된 레벨을 사용한다. Ranked 도중 완료한 업그레이드도 해당 주 스냅샷에 즉시 반영되지 않는다. [확인: C27](https://sc-clashofclans.zendesk.com/hc/en-us/articles/49529107397403-Guardians)

| 유형 | 구조적 차이 | 배치 해석 |
|---|---|---|
| Smasher | 근접 중심 | 접근한 적을 상대하는 구역과 주변 방어를 결합 |
| Longshot | 원거리 중심 | 사거리·집중 화력·사망 효과의 위치를 고려 |
| Logger | 관통 투사체·밀어내기 | 이동 경로와 병력 밀도를 교란 |

초기 두 가디언은 [C15](https://supercell.com/en/games/clashofclans/blog/release-notes/town-hall-18-crash-lands-update/), Logger는 [C16](https://supercell.com/en/games/clashofclans/blog/release-notes/the-sound-of-clash-update/)에서 확인한다. Logger의 사거리·넉백은 이후 조정되어 도입 수치를 현행값으로 복사하지 않는다. [확인: C25](https://supercell.com/en/games/clashofclans/blog/news/july-balance-update/)

가디언은 영웅과 비슷한 이동 객체지만 공격 군대의 영웅 슬롯이나 펫 배정 규칙과 공유하면 안 된다. 방어 회관·선택 상태·업그레이드 상태·스냅샷 정책을 참조하는 별도 타입으로 모델링한다. [제안]

## 8. 합성 방어·전투 경과형 방어

합성 방어는 단순히 두 시설의 공격력을 더한 것이 아니라 시설 수와 공간 사용도 바꾼다. 같은 화력이라도 목표 수가 줄어들면 단일 핵심 시설 제거의 가치가 커지고, 빈 공간과 벽 구획의 의미가 바뀐다. 따라서 밸런스는 총 DPS뿐 아니라 전체 구조물 수·집계 파괴율·마법 효율을 함께 보아야 한다. [해석]

Revenge Tower처럼 주변 건물 파괴가 성능 상승으로 연결되면 공격 순서에 새로운 비용이 생긴다. 외곽을 안전하게 제거하는 행위가 중심 방어를 더 강하게 만들 수 있으므로, 공격자는 먼저 핵심 방어를 제거할지 먼저 길을 정리할지 비교한다. 정확한 발동 임계값은 패치 데이터에 두고 최초 도입값을 고정하지 않는다. [확인: C15의 강화 구조 / 해석: 선택 비용]

## 9. 제작 방어 시설과 슈퍼차지

### 9.1 Crafted Defense

제작 방어는 같은 제작소에서 유형을 바꾸고 모듈을 개별 강화하는 기간성 방어다. 기준일 지원 문서는 Hero Hunter, Hot Candle, Cake-A-Pult를 안내한다. 단계가 끝나면 기존 방어의 전환·보상·다음 단계 해금 정책이 적용된다. [확인: C28](https://sc-clashofclans.zendesk.com/hc/en-us/articles/49529139405595-Crafted-Defenses)

이를 일반 건물 레벨과 합치지 않고 `{craftingPhaseId, defenseType, moduleLevels, activeType}`로 저장한다. 시즌 전환 직전에 시작한 업그레이드의 환급, 이미 만들어진 전쟁·랭크 스냅샷의 유지 여부를 별도 처리한다. 공식 TH18 발표는 단계 종료 전에 만든 스냅샷이 이전 제작 방어를 유지할 수 있음을 설명한다. [확인: C15](https://supercell.com/en/games/clashofclans/blog/release-notes/town-hall-18-crash-lands-update/) [제안]

### 9.2 Supercharge

슈퍼차지는 최대 레벨 건물의 추가 강화이며, 새 건물 레벨이 나오면 기존 효과를 유지하는 영구 레벨과 다르게 처리한다. 현행 지원은 방어 2단계·생산기 3단계, 소멸 시 Sparky Stones 전환과 재강화 비용 조건을 안내한다. [확인: C29](https://sc-clashofclans.zendesk.com/hc/en-us/articles/49529107491739-Supercharge)

제작 방어는 단계별로 방어 유형을 바꾸는 축이고, 슈퍼차지는 개별 최대 레벨 시설의 임시 추가 능력치 축이다. 기간성이라는 공통점만으로 동일한 리셋 로직을 쓰면 조건이 섞일 수 있다. [해석]

## 10. 배치 스냅샷과 데이터 구조

```yaml
DefenseLayout:
  layoutId: string
  villageType: home
  layoutRevision: integer
  buildings: [{instanceId: string, position: vec2, orientation: number, mode: string}]
  walls: array
  traps: array
  heroBanners: array
  selectedGuardianId: string_or_null
  craftedDefenseSelection: object_or_null

DefenseSnapshot:
  snapshotId: string
  sourceLayoutRevision: integer
  capturePolicy: string
  capturedAt: timestamp
  rulesVersion: string
  resolvedLevelsAndStats: object
  reinforcements: object
  temporaryDefenseState: object
```

레이아웃은 위치와 선택을 저장하고, 스냅샷은 특정 공격 맥락에서 사용할 완료 레벨·병력·기간성 상태를 고정한다. 이를 분리하면 마을 편집 중인 플레이어의 진행 상황이 이미 배정된 경쟁 방어를 바꾸지 않는다. 어떤 모드가 언제 스냅샷을 찍는지는 해당 모드 문서의 계약을 사용한다. [제안]

## 11. 배치 검증 절차

1. 시설 보유량·회관별 수량·미배치 항목을 검사한다.
2. 타일 점유·겹침·방향 값을 검증한다.
3. 배너와 가디언·제작 방어 선택의 유효성을 확인한다.
4. 공격 투입 영역을 시각화하여 의도하지 않은 내부 투입 지점을 찾는다.
5. 대표 지상·공중·시즈 접근 경로를 비교한다.
6. 핵심 시설이 마법 한 번에 동시에 무력화되는 지점을 확인한다.
7. 시간 초과·완파 방지·자원 보존 중 목표별 결과를 평가한다.
8. 현재 모드의 스냅샷을 생성해 실제 방어 상태와 일치하는지 검토한다. [제안]

## 12. 밸런스 지표·검수 조건

| 지표 | 해석 |
|---|---|
| 방어별 유효 발사 시간 | 파괴되기 전에 실제 기여했는가 |
| 핵심 구역 도달률 | 외곽과 중심부의 위험 구간이 작동하는가 |
| 함정 발동률·제거 수용량 | 발동 자체와 가치 있는 발동을 구분 |
| 진입 방향별 완파율 | 한 방향의 명확한 약점 또는 유도 경로 |
| 마법 1회당 무력화 방어 수 | 과도한 밀집 배치 위험 |
| 시간 초과 시 잔여 구조물 분포 | 의도된 지연과 단순 모서리 낭비의 차이 |
| 가디언·제작 방어 선택률 | 특정 선택의 편중 및 조합별 가치 |

검수 조건:

1. 숨은 함정과 보이는 함정의 정보 노출 정책이 구분된다.
2. 함정 발동 범위와 실제 효과 범위를 별도로 검증한다.
3. 스프링류 수용량 판정이 소환물·영웅·시즈를 일반 병력과 혼동하지 않는다.
4. 방향성 방어의 편집 방향과 전투 판정 방향이 일치한다.
5. 합성 시 원래 시설이 남아 중복 공격하지 않는다.
6. 회관 레벨 변경으로 삭제된 사망 효과가 중복 적용되지 않는다.
7. 가디언 업그레이드 중 일반 방어와 스냅샷 방어의 가용성이 구분된다.
8. 시즌 종료가 이미 확정된 스냅샷의 제작 방어를 소급 변경하지 않는다.
9. 슈퍼차지 리셋·전환 보상이 재접속으로 중복 지급되지 않는다.
10. 같은 레이아웃의 회전·복사·공유가 방향성 방어와 배너 위치를 보존한다.

## 13. 연결 문서와 출처

- [06. 전투 결과](06_battle_rules_and_resolution.md), [07. 경로와 길 정리](07_unit_ai_and_pathfinding.md), [08. 마법·시즈](08_spells_siege_and_super_troops.md), [09. 영웅](09_heroes_equipment_and_pets.md).
- C14: [TH15 Release Notes, 2022-10-10](https://supercell.com/en/games/clashofclans/blog/release-notes/full-release-notes-2/) — 모놀리스·마법 타워의 기본 개념.
- C15: [TH18 Update, 2025-11-17](https://supercell.com/en/games/clashofclans/blog/release-notes/town-hall-18-crash-lands-update/) — 가디언·합성 방어·전투 경과 강화·제작 방어 스냅샷.
- C16: [Sound of Clash, 2026-04-27](https://supercell.com/en/games/clashofclans/blog/release-notes/the-sound-of-clash-update/) — Logger.
- C20: [TH17 Update, 2024-11-25](https://supercell.com/en/games/clashofclans/blog/game-updates/the-town-hall-17-update-is-here-2/) — 회관 무기 변경·Firespitter·보이는 Giga Bomb.
- C25: [July Balance Update, 2026-07-09](https://supercell.com/en/games/clashofclans/blog/news/july-balance-update/) — 가디언 후속 조정.
- C26: [October Balance Changes, 2026-10-17](https://supercell.com/en/games/clashofclans/blog/news/balance-changes-incoming-october-2026/) — 수용량과 스프링 함정의 상호작용.
- C27: [Guardians, Support](https://sc-clashofclans.zendesk.com/hc/en-us/articles/49529107397403-Guardians) — 현행 업그레이드·방어 정책.
- C28: [Crafted Defenses, Support](https://sc-clashofclans.zendesk.com/hc/en-us/articles/49529139405595-Crafted-Defenses) — 현행 제작 방어·모듈·단계.
- C29: [Supercharge, Support](https://sc-clashofclans.zendesk.com/hc/en-us/articles/49529107491739-Supercharge) — 추가 강화의 수명.

접근일: 2026-11-13. 현행 모든 방어의 레벨별 숫자를 나열한 도감이 아니라 배치·전투·성장·스냅샷을 연결하는 시스템 역기획이다.
