# v16 전투 엔진 적용 범위와 검증

`src/engine.js`는 브라우저 DOM에 의존하지 않는 JavaScript 시뮬레이션이다. 기본 게임 루프는 1/60초 간격으로 갱신하며, 같은 데이터·시드·명령 순서는 같은 결과를 낸다. `reference`는 복원 자료의 수치와 제한을 우선 적용한다는 의미다. 원작 실행 파일과 프레임 단위로 일치한다고 검증한 규칙은 아니다.

원문 후보와 출처 ID는 `data/reference_v14.json`, `data/*-components-v16.json`, `src/data.js` 및 데이터 복원 문서에 보존한다. 이 문서는 자료가 실제 동작으로 연결되는 지점과 아직 자체 구현인 지점을 설명한다.

## 규칙과 레이아웃

| 옵션 | 동작 |
|---|---|
| `ruleset: 'assisted'` | 기존 웹 게임의 시작 자금, 영웅, 3단계 간이 별 강화 유지. v16 적 행동과 복원 HP는 공통으로 적용. |
| `ruleset: 'reference'` | 원문 후보 시작 골드·사용 계열·영웅 허용·별 강화 상한·타워 개방 조건 적용. 6개 트리의 5단계 별 강화 효과 사용. |
| `layout: 'authored'` | v15 자체 설계 경로와 타워 위치. |
| `layout: 'reconstructed'` | 자료에 기록된 타워 지점을 정규화하고 화면에서 추정한 중심 경로를 사용. 데이터가 없으면 authored로 돌아가며 `ruleFallbacks`에 기록. |

원문 모드의 값이 `null`이면 0으로 바꾸지 않는다. 시작 골드와 영웅 허용 여부가 비어 있는 경우 웹 규칙의 대체값을 사용하고 `world.ruleFallbacks`에 남긴다. 원문 `starUpgradeTierCap`은 영구 별 강화 제한이며, 건물의 최대 단계 제한으로 해석하지 않는다. 건물 최대 단계는 해당 필드가 명시된 경우만 적용한다.

캠페인은 `availableTowerIdsAtStart`와 `unlockEvents`를 사용한다. Silveroak의 Rangers는 캠페인 5웨이브를 호출할 때 개방된다. 도전 모드는 캠페인 클리어 이후의 조건으로 같은 스테이지의 개방 이벤트를 사전 반영한다. 영웅 금지 시 `heroEnabled=false`; 호환을 위해 영웅 객체는 남기지만 병력 목록에 추가하거나 재등장시키지 않는다.

## 웨이브 수와 입구 배분

12개 전장 × 3개 모드의 **260개 웨이브, 797개 그룹**을 유지한다. 개체 수를 바꾸지 않고 런타임 이벤트로 변환한다.

- **325개 그룹**은 원문 입구 라벨을 실제 복원 경로에 매핑한다.
- **22개 그룹**은 보이는 경로가 하나인 전장에서 경로 0으로 추론한다.
- 위 **347개 그룹**은 `group.referencePath`를 그대로 사용한다.
- 나머지 **450개 그룹**은 입구별 분량을 복원하지 못했다. `custom_primary_route_distribution`으로 기록하고, `(그룹 순번 + 개체 순번) % 주경로 수`에 따라 자체 배분한다.

자체 배분에서 `referenceGeometry.pathSpecs`의 `entryLabels`가 `cave`로 시작하는 경로와 Silveroak의 `east_spiders` 경로는 제외한다. 미확인 웨이브가 동굴·특수 출현 지점에서 임의로 시작하지 않게 하기 위한 웹 구현 정책이다. 원문으로 확인된 `referencePath`는 이 제외 조건에 상관없이 우선한다. authored 레이아웃은 기존 `group.path`를 사용한다.

출현 간격, 그룹 간 시작 차이, 조기 호출 보너스, 자동 호출 시간은 자체 설계 값이다. 입구 배분의 복원 여부와 출현 시각의 복원 여부는 별개다. 비행 적의 독립적인 원작 비행 경로는 복원하지 않았다.

## 타워·몬스터 동작 연결

| 구성 요소 | v16 실행 동작 |
|---|---|
| 난이도별 HP | `hpByDifficulty`의 존재하는 값 우선. 값이 없는 보스 난이도는 기존 배율을 사용하고 `hpEvidence=custom_difficulty_fallback` 기록. |
| 적 원거리 공격 | Shadow Archer, Necromancer, Troll Champion이 사거리 안 병력을 향해 정지·발사. 직접 저지되면 근접 공격으로 전환. 원문 피해·주기·피해 타입 사용. |
| 면역 | 단일 `effect`와 복수 `effects` 정의를 모두 확인. 독, 변이, 순간이동, 숲의 분노 등에 반영. |
| 재생·치유 | 원문 단위 회복량·펄스 주기·중단 상태 적용. Shaman 치유는 근접 공격 중단 조건도 반영. |
| Necromancer | 저지되지 않았을 때 8초 주기로 최대 5마리, 원문 Skeleton/Skeleton Knight 확률, 보상0, 생존 자식35 한도. 한도의 적용 범위는 자료에 없으므로 **시전자별**로 구현. |
| Spider Matriarch | 소환 주기를 개체 생성 시 한 번 표본 추출. 최대 알3개, 알당 자식3마리. 알의 별도 실체·부화 시간은 구현하지 않고 자식을 즉시 생성. |
| Demon Lord | 최대4대상에 4회 방어 실드, 재사용6초. 지속 피해가 실드 횟수를 소모하지 않으며 즉사 공격은 실드를 무시. 대상 태그가 미확정이므로 웹에서는 `demon_` 접두어 사용. |
| Troll Chieftain | 원문 버프 기간·방어·공격·회복 수치 사용. 연속 포효의 실제 간격이 없어 한 번에 최대9대상 처리. 원문 속도 단위가 없어 +20px/s 자체 값 사용. |
| Rocket Rider | 처음 유효 피해를 입으면 원문 배율3.6, 지속2초의 가속. |
| Sorcerer 저주 | 5초간 1.25초 주기의 10피해 펄스4회, 저주 동안 방어 배율0.5. 프레임 부동소수점 오차로 마지막 펄스가 빠지지 않게 검증. |
| 사격 대상 | 타워의 `canSelectAir`·`canSelectGround` 반영. 기본은 출구까지 남은 거리가 가장 짧은 적. strongest/closest/air는 별도 웹 전술 옵션. |

원거리 적의 사거리(155/145/160), 투사체 속도330px/s, 치유·실드·격노·폭발 반경은 웹 좌표계의 자체 값이다. 피해 범위가 주어진 적 공격과 일부 능력은 범위의 평균을 사용한다. 원작의 피해 난수 분포·정수 반올림과 같다는 검증은 없다. 타워 기본 공격은 시드 기반 연속 난수를 사용한다.

보스 출현 후 행동, 공성 로봇 소환, JT의 타워 동결, Veznan의 봉인·변신은 기존 웹 패턴을 유지한다. 자료의 보스 이름과 HP가 연결되어 있어도 원작 보스 AI가 복원되었다는 뜻은 아니다.

## 30개 별 강화 적용 목록

아래 30개 ID는 `reference`에서 효과가 연결되어 있다. 일반 타워·지원군·유성에 대한 기본 기능을 구현했으며, 원작과 완전히 같다고 판정한 목록은 아니다.

| 트리 | 연결된 ID | 실행 효과 |
|---|---|---|
| 궁수 | `salvage`, `eagle_eye`, `piercing_shots`, `far_shots`, `precision` | 전투 중 판매90%, 사거리1.1×1.1, 방어10%p 무시, 기본 사격10% 확률2배. |
| 병영 | `toughness_training`, `better_armor`, `improved_deployment`, `endurance_training`, `spiked_armor` | 기본 HP에10%+10% 가산, 방어10%p, 집결1.2배·재등장8/11초, 교전 상대에게 반사 피해. |
| 마법 | `spell_reach`, `arcane_shatter`, `hermetic_study`, `empowered_magic`, `slow_curse` | 사거리1.1배, 적중 시 방어3%p 감소, 건설/단계 강화10% 할인, 기본 피해15% 증가 후 올림, 0.5초간 속도0.5배. |
| 포병 | `concentrated_fire`, `range_finder`, `field_logistic`, `industrialization`, `smart_targeting` | 기본 피해10% 증가·올림, 사거리10% 증가·올림, 건설/단계 강화10% 할인·내림, 고급 능력25% 할인·내림, 폭발 거리 감쇠 제거. |
| 유성 | `blazing_skies`, `scorched_earth`, `fast_and_furious`, `blazing_earth`, `cataclysm` | 유성5개·피해 범위, 5/10초 지속 화염, 재사용70/60초, 최종 피해150–180 및 무작위 추가 유성5개. |
| 지원군 | `well_fed`, `conscripts`, `warriors`, `legionnaires`, `spear_throw` | 원문 HP·피해·방어·재생량 단계 적용. 창 피해25–40, 주기1.4초, 최소27·최대165 사거리, 공중 공격. |

### 적용 범위가 남아 있는 항목

- `precision`의 Bolin shotgun, `arcane_shatter`의 Elora/Magnus, `slow_curse`의 Magnus 적용은 원작 영웅이 구현되어 있지 않아 제외한다. 원작 영웅을 웹 전용 영웅 아렌으로 대체했다고 해석하지 않는다.
- `spiked_armor`는 **실제로 감소한 병사 HP의 10%를 올림**하여 교전 적에게 준다. 방어 계산 전후 어느 피해가 원작 반사 기준인지는 미실측이다. Elemental·지원군·영웅에는 적용하지 않는다.
- `smart_targeting` 이전의 폭발 감쇠는 중심100%에서 가장자리50%까지 선형으로 감소하는 자체 함수다. 강화 시 이를 제거한다. 자료의 Tesla 정책이 `null`이므로 Tesla 연쇄의 기존 감쇠를 임의로 확정하지 않는다.
- 포병 범위와 모든 타워 사거리의 원작 좌표 단위는 미확정이다. source 효과 배율과 보고된 반올림을 웹 좌표의 기존 사거리에 적용한다.
- `piercing_shots` 등의 복합 능력 적용 범위, 다단 공격 적중 판정, 저주 갱신 순간의 펄스 정책은 원작 빌드 실측을 마치지 않았다.

기본 유성(3회, 피해30–60, 재사용80초, 반경72), 기본 지원군(HP30·피해1–2·재생3), 지원군 존속23초·근접 주기0.9초, 유성 낙하 간격·산포·무작위 추가 유성 위치는 자료 공백을 채우는 웹 값이다. 업그레이드 이후 복원 수치를 적용한다고 해서 기본 값까지 원문으로 확인된 것은 아니다.

## 특수 시설과 선배치

Silveroak의 엘프 훈련소와 Stormcloud의 Sunray 지점은 별도 시설로 표시하고 일반 타워 건설을 거부한다. 능력·고용·발사 규칙은 아직 플레이 기능으로 구현하지 않았다.

Silveroak E7의 선배치 `archer_3`는 화면의 0/15웨이브·700골드·20생명 조건과 일치하는 **campaign**에만 생성한다. Heroic/Iron에는 자동 생성하지 않는다. 구매 골드를 차감하지 않으며 판매 기준 투자액은 누적 건설 가격340으로 두었다. 이 시설의 원작 판매액을 별도로 실측한 것은 아니다. 일반 타워와 마찬가지로 첫 웨이브 전 판매100%는 웹 편의 규칙이다.

## 공개 API와 검사 정보

`towerCost(defId)`, `abilityCost(towerId, skillId, rankIndex?)`, `refundFraction(tower?)`, `rallyRange(tower?)`, `meteorRadius()`를 UI 가격·범위 표시에 사용한다. `abilityCost`의 선택 인자는 0부터 시작하는 다음 구매 단계 인덱스다.

`getAvailability(defId)`는 `{ok,message}`를 반환하고, `isTowerUnlocked(defId)`는 개방 여부만 반환한다. `setTargetMode(towerId, mode)`의 mode는 `first`, `strongest`, `closest`, `air`다.

적 원거리 투사체는 `hostile:true`, `targetUnitId`, `enemyId`, `kind:arrow|bolt|axe`, `type`을 갖는다. 출현 적의 `sourceWave`, `sourceEntryLabel`, `routingStatus`로 적용된 경로의 성격을 확인할 수 있다. 결과에는 `ruleset`, `layout`, `killsByEnemy`, `damageByType`, `goldEarned`, `unitLosses`가 포함된다. 타워의 `damage`, `kills`, `shots`도 누적한다.

## 검증 결과

명령: `node tests/engine.test.js`

**34개 테스트 통과.** 잘못된 구매의 원자성, 18개 고급 능력 구매, 260개 웨이브 수 보존, 347개 경로 매핑과450개 자체 배분의 특수 경로 제외, 동일 시드 재현, 난이도 HP, 영웅 금지, 개방 조건, 할인·환불, 원거리/근접 전환, true 피해, 면역, 소환 한도, 재생, 실드, 저주 펄스, 최종 별 강화, 특수 지점과 모드별 선배치, 실제 승패를 포함한다.

| 복원 Southport, 보통, 시드42 | 배치와 명령 | 결과 |
|---|---|---|
| assisted, 별 강화0 | B5 궁수1, C3 마법1, B3 병영1. 추가 구매·스킬·조기 호출 없음. | 174.40초, 생명20/20, 56킬, 3별, 치트 없음. |
| reference, 별 강화0, 영웅 없음 | 위3개를 시작265골드로 배치. 골드100이 되면 E3 마법1 추가. 스킬·조기 호출 없음. | 173.98초, 생명19/20, 55킬, 3별, 치트 없음. |

이 결과는 v16 복원 지형과 해당 명령의 플레이 가능성을 확인한다. 36개 전장·모드 조합 전체의 난이도 균형, 모든 별 강화 조합, 원작의 클리어 시간과 일치를 보증하는 테스트는 아니다. 기존 authored Southport 검증은 v15 계열 회귀 비교용으로 별도 유지한다.
