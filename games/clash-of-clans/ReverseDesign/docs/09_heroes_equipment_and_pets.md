# 09. 영웅·영웅 회관·장비·펫

> 기준일: 2026-11-13 KST. 본 마을 영웅을 다룬다. 장인 기지의 Battle Machine·Battle Copter는 별도 시스템이다. `[확인]`·`[해석]`·`[제안]`·`[미확인]`을 구분하며, 레벨별 전체 스탯과 미공개 효과 처리 순서는 추정해 채우지 않는다.

## 1. 시스템의 역할

영웅은 군대의 핵심 전력인 동시에 장기 성장 대상이다. 장비는 영웅이 수행할 역할을 바꾸고 펫은 특정 약점을 보완한다. 따라서 영웅을 `레벨이 높은 특수 병력` 하나로만 모델링하기보다 **본체 성장·전투 능력 구성·동행 지원·출전 상태**를 분리해야 한다. [해석]

최대 공격 슬롯보다 보유 영웅이 많으면 어떤 영웅을 제외할지가 선택이 된다. 업그레이드 중인 영웅, 공중/지상 조합, 배치의 약점, 장비 보유 상태가 이 선택에 함께 작용한다. [해석]

## 2. 기준일의 영웅과 해금

| 영웅 | Town Hall | Hero Hall | 역할 해석 |
|---|---:|---:|---|
| 바바리안 킹 | 4 | 1 | 전열 유지·외곽 정리·근접 돌파 |
| 아처 퀸 | 8 | 2 | 원거리 핵심 목표 제거·독립 구역 공략 |
| 미니언 프린스 | 9 | 3 | 공중 화력·방어 약화 |
| 그랜드 워든 | 11 | 5 | 본대의 생존·화력 지원 |
| 로얄 챔피언 | 13 | 7 | 방어 시설 제거·후반 마무리 |
| Dragon Duke | 15 | 9 | 주변 공중 병력과의 거리 관리가 중요한 공중 전력 |

해금 수치는 현행 [C05 공식 Support](https://sc-clashofclans.zendesk.com/hc/en-us/articles/49529108034843-About-Heroes-Pets), 역할은 장비·영웅 기능을 바탕으로 한 분석이다. 킹의 TH4 조기 해금은 2026-05-26 변경이다. [확인: C21](https://supercell.com/en/games/clashofclans/blog/release-notes/may-update/)

**초기 사용·레벨 업·장비 관리의 해금은 동일하지 않다.** Support는 킹의 초기 사용과 TH7 이후 성장·장비 조건을 구분하며, 대장간 안내는 TH8 건설을 명시한다. 따라서 `영웅 사용 가능`, `영웅 성장 가능`, `기본 장비 접근`, `대장간 건설`을 하나의 회관 조건으로 합치지 않는다. 저레벨 기본 장비가 노출되는 정확한 UI 순서는 실기 확인 대상이다. [확인: C05, C22](https://sc-clashofclans.zendesk.com/hc/en-us/articles/49529083044123-The-Blacksmith-Hero-Equipment-Ore) [미확인: UI 순서]

## 3. 영웅 회관·공격·방어의 관계

영웅 회관은 영웅 관리와 레벨 상한의 중심이다. 공격은 최대 네 슬롯을 사용하고, 방어 영웅은 최대 네 배너에 배정된다. 이 두 선택을 각각 관리한다. [확인: C05](https://sc-clashofclans.zendesk.com/hc/en-us/articles/49529108034843-About-Heroes-Pets)

| 상태 | 저장 위치 제안 | 이유 |
|---|---|---|
| 영웅 보유·기본 레벨 | 계정 성장 데이터 | 전투가 끝나도 유지 |
| 업그레이드 시작·완료 | 성장 작업 데이터 | 서버 시간 기준 처리 |
| 공격 영웅 선택 | 군대 레시피·현재 편성 | 조합별 변경 |
| 방어 배너·위치 | 마을 배치 | 공격 선택과 독립 |
| 전투 중 HP·능력 사용 | 전투 스냅샷 | 영구 성장과 분리 |
| 장비·펫 배정 | 영웅 구성 데이터 | 레시피 복원·버전 검증 |

영웅을 바꾸었을 때 장비와 펫이 다른 영웅으로 잘못 따라가면 안 된다. `heroId`를 중심 키로 두고 공격 슬롯은 그 영웅을 참조하도록 한다. 방어 배너 위치를 바꾸는 작업이 공격 군대 순서를 바꾸지 않게 한다. [제안]

## 4. 영웅의 전투 가능 상태

2025년의 회복 시간 제거는 전투 후 재사용을 빠르게 한 변경이다. 이를 모든 업그레이드 중 사용 제한까지 영구 폐지한 것으로 해석해서는 안 된다. 업그레이드 중 사용을 허용하는 이벤트가 별도로 운영되었으며, 2026년 4월에는 친선 도전·친선전에서 업그레이드 중 영웅과 펫을 사용할 수 있도록 범위를 넓혔다. [확인: C02](https://supercell.com/en/games/clashofclans/blog/release-notes/welcome-to-clash-anytime-update/), [C23](https://supercell.com/en/games/clashofclans/blog/community/unlocking-unlimited-heroes-community-event/), [C16](https://supercell.com/en/games/clashofclans/blog/release-notes/the-sound-of-clash-update/)

### 사용 가능 여부의 구현안

```text
can_use_hero(hero, context):
    if not hero.unlocked:
        return Locked
    if not context.mode.allowsHero(hero.id):
        return ModeRestricted
    if hero.upgradeInProgress:
        if context.mode.allowsUpgradingHeroes:
            return AllowedAtCompletedLevel
        if context.eventEntitlements.allowUpgradingHero(hero.id):
            return AllowedByEvent
        return UpgradeRestricted
    return Allowed
```

이 함수는 제안이다. 공격 가능 여부, 방어 스냅샷 포함 여부, 친선전 예외를 각각 평가해야 한다. 동일 영웅의 모든 모드 상태를 `isBusy` bool 하나로 표현하면 예외가 늘 때 충돌한다. [제안]

## 5. 장비의 역할과 구성

장비는 영웅별로 두 개를 장착하며 능동·지속 효과를 갖는다. 과거 영웅 고유 능력의 일부가 장비로 분리되었고, 일반(Common)·에픽(Epic) 장비의 획득과 성장 경로가 나뉜다. [확인: C24](https://supercell.com/en/games/clashofclans/blog/news/introducing-hero-equipment/), [C22](https://sc-clashofclans.zendesk.com/hc/en-us/articles/49529083044123-The-Blacksmith-Hero-Equipment-Ore)

| 장비 효과의 층 | 예시 범주 | 모델링 목적 |
|---|---|---|
| 상시 스탯 | 추가 HP·공격력·공격 속도 | 영웅 기본 레벨과 분리 |
| 능동 효과 | 투사체·범위 파괴·소환·보호 | 사용 시점과 1회성 상태 관리 |
| 지속 능력 | 타격 회복·오라·슬로 | 장비 활성 조건·대상 관리 |
| 조건부 능력 | 배치량·주변 병력·적 상태 의존 | 전투 중 조건 계산 |
| 연출 | 모델·투사체 외형 | 게임플레이 판정과 분리 |

두 장비가 있다고 두 개의 완전히 독립된 버튼을 제공하는 구조로 가정하면 안 된다. 영웅 능력 입력과 각 장비 효과의 발동 계약을 따로 정의한다. 2026년 6월에는 장비 효과의 활성화 순서를 장착 슬롯 순서가 아닌 장비 자체의 순서로 고정한 변경이 있었다. [확인: C09](https://supercell.com/en/games/clashofclans/blog/release-notes/the-anime-fury-update-is-here/)

### 조합을 평가하는 질문

- 두 장비가 같은 순간을 강화하는가, 서로 다른 전투 구간을 담당하는가?
- 장비 하나가 다른 장비의 유효 위치·타깃·발동 시점을 바꾸는가?
- 능동 효과를 일찍 써야 하는 장비와 늦게 써야 하는 장비를 조합하면 어떤 비용이 생기는가?
- 기본 스탯만으로도 가치가 충분해 능동 기능의 위험이 사라지는가?
- 저레벨 장비와 고레벨 장비 사이의 차이가 기능 부족인지 수치 부족인지 구분되는가? [해석]

## 6. 광석 성장과 전투력의 분리

장비는 Shiny·Glowy·Starry Ore를 사용한다. 일반 장비와 에픽 장비는 필요한 광석 조합이 다르며, 광석은 전쟁·스타 보너스·영웅 여정 등 여러 경로로 유입된다. [확인: C22](https://sc-clashofclans.zendesk.com/hc/en-us/articles/49529083044123-The-Blacksmith-Hero-Equipment-Ore)

영웅 본체와 장비 성장의 분리는 같은 영웅 레벨에서도 조합·장비 투자에 따라 성능을 다르게 만든다. 이에 따라 매치 성과를 분석할 때 `영웅 레벨`만 통제하면 충분하지 않다. 장비 수준, 능력 조합, 펫 수준까지 같이 기록해야 한다. [해석]

장비 성장의 마일스톤은 특정 레벨에서 기능 수치가 크게 바뀌는지 확인해야 한다. 단순 평균 스탯 증가량으로 투자 효율을 비교하면 능력 지속 시간·소환 수·투사체 횟수의 임계값을 놓칠 수 있다. 현행 장비별 마일스톤 전체 표는 게임 데이터 추출·실기 확인 후 채우는 부록 대상으로 둔다. [해석·미확인]

## 7. 펫은 영웅의 보조 정책

펫은 TH14의 펫 하우스부터 이용하며 영웅에 배정한다. 현재 지원 문서는 치유, 벽 대응, 기절, 임시 생존, 투명화, 목표 전환 등 서로 다른 지원 기능을 안내한다. [확인: C05](https://sc-clashofclans.zendesk.com/hc/en-us/articles/49529108034843-About-Heroes-Pets)

| 지원 목적 | 대표 펫 | 조합 분석 |
|---|---|---|
| 체력 유지 | Unicorn | 장시간 독립 행동을 지원하지만 순간 피해를 막는 방식과 다름 |
| 벽·이동 보조 | Mighty Yak·L.A.S.S.I | 영웅의 실제 진입 경로와 함께 평가 |
| 방어 방해 | Diggy·Frosty | 영웅이 위험 방어에 머무는 시간을 줄임 |
| 생존 기회 | Phoenix·Spirit Fox | 사망 위험을 뒤로 미루거나 타깃을 끊음 |
| 목표 변경 | Angry Jelly | 영웅의 고유 목표 선택과 결합 |
| 별도 공격 역할 | Sneezy·Greedy Raven·Electro Owl·Poison Lizard | 본체와 다른 목표·공격 형태로 보완 |

이 표는 펫 기능을 묶은 설계 분석이며 특정 조합의 현재 최적 순위를 뜻하지 않는다. 신규 펫 Sneezy의 지원/본체 사망 후 전환은 [C02](https://supercell.com/en/games/clashofclans/blog/release-notes/welcome-to-clash-anytime-update/), Greedy Raven의 자원 건물 선호는 [C11](https://supercell.com/en/games/clashofclans/blog/release-notes/the-february-update-has-escaped/)에서 확인한다.

### 펫 연결 데이터

```yaml
HeroLoadout:
  heroId: string
  equipmentIds: [string, string]
  petId: string_or_null
  movementMode: enum_if_supported

HeroBattleState:
  heroEntityId: string
  sourceProgressRevision: string
  equipmentEffects: array
  abilityActivationState: enum
  companionEntityId: string_or_null
  revivalState: enum

PetBattleState:
  petEntityId: string
  ownerHeroEntityId: string
  ownerUnavailablePolicy: enum
  currentBehaviorPolicy: string
  oneShotAbilityState: enum
```

영웅이 쓰러졌을 때 펫이 정지·독립 전투·다른 영웅 추종·특수 발동 중 무엇을 할지는 펫별 정책이다. 모든 펫을 `owner dead → destroy pet`로 처리하면 여러 실제 기능을 표현할 수 없다. [제안]

## 8. Dragon Duke 사례: 강점에 공간 조건 부여

Dragon Duke는 주변 공중 병력이 없을 때 강화되는 고유 조건을 갖는다. 출시 당시의 함정 피해 감소 수치는 이후 조정되었으므로 2월 발표의 비율을 현행 수치로 고정하지 않는다. [확인: C11](https://supercell.com/en/games/clashofclans/blog/release-notes/the-february-update-has-escaped/), [C25](https://supercell.com/en/games/clashofclans/blog/news/july-balance-update/)

이 구조는 같은 공중 조합 안에서도 영웅을 본대에 붙일지 분리할지 결정하게 한다. 분리하면 고유 강화의 이점이 있지만 단독으로 함정·집중 사격을 받는 위험이 커진다. 펫·마법·장비가 이 위험을 얼마나 상쇄하는지가 실제 밸런스의 핵심이다. [해석]

2026년 10월 공식 분석은 TH18 대 TH18 전쟁·CWL 최근 4주 데이터를 대상으로 Fire Heart 사용과 높은 완파율의 연관을 설명했다. 이 자료는 장비 조합의 성능을 분석할 때 표본 범위를 명시하는 좋은 예다. 모든 회관·일반 파밍·모든 실력대에 같은 결론을 확대하지 않는다. [확인: C26](https://supercell.com/en/games/clashofclans/blog/news/balance-changes-incoming-october-2026/)

## 9. 영웅 여정과 성장 동기

영웅 여정은 TH7부터 누적 영웅 레벨을 보상 진행도로 연결한다. [확인: C05](https://sc-clashofclans.zendesk.com/hc/en-us/articles/49529108034843-About-Heroes-Pets)

이 구조는 영웅 업그레이드를 전투 스탯 상승 외의 즉시 보상과 연결한다. 어떤 영웅의 레벨이든 누적 진행에 기여하므로 주력 하나에 집중하는 전략과 여러 영웅을 고르게 성장시키는 전략의 비용을 비교하게 된다. 다만 보상의 분포·광석 병목·신규/복귀 보정이 강하면 성장 선택이 특정 구간으로 쏠릴 수 있다. [해석]

마이그레이션과 보상 지급 구현은 `누적 레벨 산출 → 이미 지급한 노드 제외 → 소유 장비 중복 대체 → 수령 가능 상태 저장`처럼 멱등적으로 설계한다. 임시 영웅 포션이 영구 레벨처럼 보상 진행도를 올려서는 안 된다. [제안]

## 10. 밸런스 지표와 검수

| 지표 | 핵심 구분 |
|---|---|
| 영웅 선택률 | 해금된 영웅만을 분모로 사용 |
| 영웅별 출전 불가 시간 | 업그레이드·모드 제한·이벤트 예외 |
| 장비 쌍 선택률 | 개별 장비 선택률과 별도 집계 |
| 능력 사용 전 사망률 | 숙련도·장비·피격 구간 |
| 펫별 생존·기여 | 영웅과 분리한 단독 승률 해석 금지 |
| 광석 투자 후 성과 변화 | 성장·조합·학습 효과를 분리 |
| 영웅 여정 수령률 | 노드 접근과 실제 수령 실패를 구분 |

검수 시나리오:

1. 보유 영웅 여섯을 공격 슬롯 네 개에 동시에 넣을 수 없다.
2. 공격 영웅 교체가 방어 배너를 의도치 않게 바꾸지 않는다.
3. 장비 슬롯 순서를 바꿔도 장비 고유 활성화 순서가 유지된다.
4. 일반 전투·친선전·이벤트의 업그레이드 중 출전 허용 여부가 분리된다.
5. 영웅 회복 대기 제거가 업그레이드 작업을 자동 완료하지 않는다.
6. 영웅 사망·부활·회수 후 펫의 소유 관계가 끊기거나 중복되지 않는다.
7. 일회성 장비 능력과 자동 발동 입력이 겹쳐도 두 번 적용되지 않는다.
8. 포션으로 높아진 임시 레벨이 영웅 여정의 영구 진행도를 증가시키지 않는다.
9. 장비를 이미 보유한 경우 보상 대체가 한 번만 지급된다.
10. 영웅 모델·스킨·투사체 외형 설정이 공격 판정을 바꾸지 않는다.

## 11. 연결 문서와 출처

- [05. 군대 편성](05_army_composition.md), [07. AI](07_unit_ai_and_pathfinding.md), [08. 특수 효과](08_spells_siege_and_super_troops.md), [10. 방어 배치](10_defenses_traps_and_layout.md).
- C02: [Clash Anytime, 2025-03-24](https://supercell.com/en/games/clashofclans/blog/release-notes/welcome-to-clash-anytime-update/) — 회복·Sneezy.
- C05: [About Heroes & Pets, Support](https://sc-clashofclans.zendesk.com/hc/en-us/articles/49529108034843-About-Heroes-Pets) — 현행 해금·슬롯·펫·여정.
- C09: [Anime Fury, 2026-06-15](https://supercell.com/en/games/clashofclans/blog/release-notes/the-anime-fury-update-is-here/) — 장비 순서.
- C11: [February Update, 2026-02-23](https://supercell.com/en/games/clashofclans/blog/release-notes/the-february-update-has-escaped/) — Dragon Duke·Greedy Raven.
- C16: [Sound of Clash, 2026-04-27](https://supercell.com/en/games/clashofclans/blog/release-notes/the-sound-of-clash-update/) — 친선전 출전 예외.
- C21: [May Update, 2026-05-26](https://supercell.com/en/games/clashofclans/blog/release-notes/may-update/) — 킹 조기 해금.
- C22: [The Blacksmith, Support](https://sc-clashofclans.zendesk.com/hc/en-us/articles/49529083044123-The-Blacksmith-Hero-Equipment-Ore) — 장비·광석.
- C23: [Unlimited Heroes, 2024-06-24](https://supercell.com/en/games/clashofclans/blog/community/unlocking-unlimited-heroes-community-event/) — 기간 한정 출전 예외의 역사 사례.
- C24: [Hero Equipment, 2023-12-12](https://supercell.com/en/games/clashofclans/blog/news/introducing-hero-equipment/) — 능력 분리의 도입 구조.
- C25: [July Balance Update, 2026-07-09](https://supercell.com/en/games/clashofclans/blog/news/july-balance-update/) — Dragon Duke 후속 조정.
- C26: [October Balance Changes, 2026-10-17](https://supercell.com/en/games/clashofclans/blog/news/balance-changes-incoming-october-2026/) — 장비 조합과 표본 조건.

접근일: 2026-11-13. 특정 조합을 현행 최적 조합으로 추천하는 문서가 아니라 영웅 시스템의 의존 관계와 재구현 계약을 분석한 문서다.
