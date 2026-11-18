# 식량·농업·조리·보관·위생 데이터 재구성

## 1. 현재 게임에서 먼저 분리할 개념

숨 4.0은 모든 수확물을 `resources.food`, 모든 조리식을 `resources.meals`로 합산한다. 재배상자는 120초 성장 후 식량1.5, 청수0.012 내부단위/s, 온도12~35°C, 산소0.12 이상을 요구한다. 조리대는 식량2+청수0.3→조리식3이며, 전력이 공급된 냉장고 하나가 전체 비축 식품의 부패를 80% 줄인다. 이는 짧은 웹 플레이를 위한 자체 규칙이다.

원작 참조로 확장하려면 식품 ID·물리질량·열량·품질·신선도·위치·보관환경을 분리해야 한다. 같은 1kg도 음식마다 kcal가 다르고, 씨앗과 조미용 작물은 그 자체를 생식 열량으로 계산할 수 없다. 이 문서의 표는 공개 수치를 재구성한 설계 입력이며 런타임 적용 결과가 아니다.

## 2. 식품 기준표

아래 값은 2026-11-18 ONIDB 공개 식품 목록의 표기다. 빌드가 고정되지 않은 제3자 DB이므로 실제 배포 빌드와의 일치 보증은 하지 않는다. 원문 설명·이미지는 재사용하지 않았다. [C03 Food database](https://onidb.wiki/foods)

| 식품 ID | 식품 | kcal/food unit | 품질 |
|---|---|---:|---:|
| meal_lice | Meal Lice | 600 | -1 |
| bristle_berry | Bristle Berry | 1,600 | 0 |
| mushroom | Mushroom | 2,400 | 0 |
| meat | Meat | 1,600 | -1 |
| fish_fillet | Fish Fillet | 1,000 | 2 |
| muckroot | Muckroot | 800 | -1 |
| liceloaf | Liceloaf | 1,700 | 0 |
| pickled_meal | Pickled Meal | 1,800 | -1 |
| gristle_berry | Gristle Berry | 2,000 | 1 |
| fried_mushroom | Fried Mushroom | 2,800 | 1 |
| frost_bun | Frost Bun | 1,200 | 2 |
| barbeque | Barbeque | 4,000 | 3 |
| omelette | Omelette | 2,800 | 2 |
| pepper_bread | Pepper Bread | 4,000 | 5 |
| berry_sludge | Berry Sludge | 4,000 | 3 |
| lettuce | Lettuce | 400 | 0 |
| sleet_wheat_grain | Sleet Wheat Grain | 0 | 0 |
| pincha_peppernut | Pincha Peppernut | 0 | 0 |

`food unit`은 표의 아이템 수량 단위다. 이 목록만 보고 모든 아이템 1개를 자동으로1kg 처리하지 않는다. 아이템 질량 미확정 필드는 데이터에 null로 남겼다. 레시피의 수량·kg·kcal는 별도 필드로 저장한다. 식량 품질과 사기 보너스는 동일 숫자가 아니므로 UI에서 혼동하지 않도록 분리한다.

## 3. 기본 작물 여섯 종

| 작물 | 재배/야생 성장주기 | 성장 온도°C | 재배 입력/주기 | 수확 |
|---|---:|---:|---|---|
| Mealwood | 3 / 12 | 10~30 | 흙10kg | Meal Lice1kg |
| Bristle Blossom | 6 / 24 | 5~30 | 물20kg, 조도200lux 이상 | Bristle Berry1kg |
| Sleet Wheat | 18 / 72 | -55~5 | 물20kg, 흙5kg | Sleet Wheat Grain18개 |
| Dusk Cap | 7.5 / 30 | 5~35 | Slime4kg, CO₂와어둠 | Mushroom1kg |
| Pincha Pepperplant | 8 / 32 | 35~85 | 오수35kg, 인광석1kg | Peppernut4개 |
| Waterweed 현재참조 | 12 / 48 | 22~65 | 염수20kg | Lettuce12kg |

각 행의 근거: [Mealwood C04](https://onidb.wiki/plants/mealwood), [Bristle C05](https://onidb.wiki/plants/bristle-blossom), [Sleet C06](https://onidb.wiki/plants/sleet-wheat), [Dusk C07](https://oxygennotincluded.wiki.gg/wiki/Dusk_Cap), [Pincha C34](https://oxygennotincluded.wiki.gg/wiki/Plant/Plant_comparison), [Waterweed C09](https://onidb.wiki/plants/waterweed).

### Waterweed의 버전 충돌

구 자료에는 염수5kg/cycle·표백석0.5kg/cycle과 부분 침수 조건이 남아 있다. 공식736649(2026-06-11)에서 모든 버전에 표백석비료 삭제·완전침수 성장 허용·급수 증가가 기록되었다. 20kg라는 수치는 현재 ONIDB 참조이고, 공식 패치 본문에 정확한 증가량은 없다. 따라서 `표백석 없음`은 공식패치 확인, `염수20kg`는 빌드미고정 DB 확인으로 필드의 증거 수준을 달리 기록했다. [C10 이전자료](https://oxygennotincluded.fandom.com/wiki/Waterweed), [C11 공식패치](https://kleiforums.com/game-updates/oni-alpha/736649-r2750)

구 수치는 `plant.waterweed_legacy`로 격리하고 현재 프로필 로딩에서 제외한다. 단순히 같은 이름의 CSV 행을 덮어쓰는 방식은 금지한다.

### 미복원 필드

자동 낙과까지의 시간은 Mealwood 위키의1주기 설명과 ONIDB의4주기 표기가 충돌한다. 이번에는 null로 처리했다. 모든 작물의 부가 수확 Plant Husk, 돌연변이, 방사선, 씨앗 확률 보정, 작물별 Farmer's Touch 적용 범위를 완전 복원하지 않았다. 기본 재배 루프와 확장 데이터를 분리해야 한다.

## 4. 수급 계산은 가동률을 포함

표준 대원 n명, 식물당 수확열량 y, 성장주기 g, 실제 성장가동률 u, 수확 대기 h주기, 폐기율 w에 대해 설계용 평균 생산량은 다음과 같다.

```text
averageKcalPerPlantCycle = y × (1-w) / (g/u + h)
requiredPlants = ceil(n × 1000 / averageKcalPerPlantCycle)
```

이 수식은 생산 계획용 자체 모델이다. 원작의 틱 코드나 농업 속성 수식을 추출한 것이 아니다. `u=1,h=0,w=0`은 이상적인 계산 기준일 뿐이다.

Mealwood의 생식 기준에서는600/3=200kcal/cycle이므로 표준 대원3명에15그루가 이론적 최솟값이다. 흙150kg/cycle도 필요하다. 가동률90%, 폐기5%, 대기0을 가정하는 계획 예시는 식물당171kcal/cycle이므로18그루다. 90%·5%는 **웹판 계획 시나리오의 입력값**이며 원작 고정값이 아니다. [C38 Mealwood](https://oxygennotincluded.wiki.gg/wiki/Mealwood)

Bristle를 생식하면1,600/6≈266.67kcal/cycle이며, 수확물을 조리하면 조리시간과 전력이 새 병목이 된다. Sleet Wheat의18개 씨앗을18×1,200kcal로 계산하면 오류다. Frost Bun은 씨앗3개가 필요하므로 한 번 수확에서6개, 7,200kcal이다. 18주기 평균400kcal/cycle이며 조리작업이 필요하다. [C06](https://onidb.wiki/plants/sleet-wheat), [C27 Frost Bun](https://onidb.wiki/foods/frost-bun)

### 필요한 예산 패널

`식량총량` 외에 `지난3주기 실제섭취`, `다음수확예상`, `수확대기`, `부패예정`, `조리예약입력`, `가축먹이로예약`을 표시한다. 식량을 다른 목적에 예약해도 총량만 보여주면 사용자는 소비 가능한 kcal를 과대평가하게 된다.

## 5. 조리 레시피

이번 재구성에서는 다음 네 개를 수량까지 확보했다.

| 출력 | 입력 | 출력 열량 | 처리 설비 |
|---|---|---:|---|
| Liceloaf1 | Meal Lice2 + 물50kg | 1,700kcal | Microbe Musher |
| Pickled Meal1 | Meal Lice3 | 1,800kcal | Electric Grill |
| Barbeque1 | Meat2 | 4,000kcal | Electric Grill |
| Frost Bun1 | Sleet Wheat Grain3 | 1,200kcal | Electric Grill |

첫 세 행은 [C28 식량 체인](https://onidb.wiki/guides/food-chain), Liceloaf 재료는 [C26 개별 문서](https://oxygennotincluded.wiki.gg/wiki/Liceloaf), 마지막 행은 [C27 레시피](https://onidb.wiki/foods/frost-bun)로 확인했다. Frost Bun의 기본 제조시간50초만 이 자료에서 확인하여 기록했고, 나머지 제조시간은 null이다.

Mealwood 문서의 Liceloaf 재료를1개로 쓴 설명은 개별 Liceloaf의1,200kcal 입력 및2개라는 DB 설명과 맞지 않는다. 레시피 전용 출처를 우선하고 충돌을 이 문서에 남긴다.

### 거래 방식

조리 작업을 시작할 때 재료를 예약하고, 실제 제조 버퍼로 운반한 후 소비한다. 완료 시 출력 아이템을 생성하고 생산 통계를 올린다. 저장 파일은 `recipeId, batchId, reservedInputs, deliveredInputs, consumedInputs, workProgress`를 보존해야 한다.

취소 정책은 아직 소비하지 않은 재료를 돌려주고 이미 소비한 중간재는 레시피별 명시 정책을 따른다. 정전·침수·작업자 교체는 진행을 멈출 뿐 무료 출력이나 초기화 반복 경험치를 만들지 않는다. 칼로리 증가는 게임 레시피상의 변환이며 화학 열량보존을 억지로 적용하지 않는다.

## 6. 위치 기반 식품 보관

v4의 전역 냉장고 효과를 제거하고 각 아이템 배치가 실제로 들어 있는 보관소와 온도·대기를 기준으로 신선도를 갱신하는 설계를 권장한다.

```text
FoodStack
  foodId, amount, temperatureC, germSpecies, germCount
  freshness, cellIndex or storageBuildingId, reservedAmount
```

일반 식품의 부패를 일괄 `재고×상수`로 처리하면 식품 종류와 보관 상태가 사라진다. 예를 들어 Pickled Meal은 기본 수명32주기, Meal Lice는8주기로 보고되며, 냉동·대기 조건에 따라 달라진다. 원작 보관 환경의 정확한 감쇠 조합을 이번에 전 식품에 확정하지 않았다. [C28](https://onidb.wiki/guides/food-chain)

Frost Bun 개별 DB는 일반·무균·오염 대기와 냉장·급속냉동을 구분한다. 이를 근거로 설계 축은 도입할 수 있지만, 하나의 음식 페이지를 모든 음식에 적용하는 공통 감쇠표로 자동 승격하면 안 된다. [C27](https://onidb.wiki/foods/frost-bun)

새 모드 검증에서는 실내에 냉장고를 하나 건설했을 때 바닥·옆방·운반 중 음식까지 보존되는지 검사해야 한다. 해당 음식이 실제 보관소에 들어갔는지, 냉각이 유지되는지, 버퍼가 차서 바닥에 놓였는지가 플레이에 영향을 줘야 한다.

## 7. 위생 순환과 질병

| 시설 | 입력 | 출력 | 현4.0 |
|---|---:|---:|---|
| Lavatory | 물5kg/use | 오수11.7kg/use | 청수2→오수2.2 내부단위 |
| Sink | 물5kg/use | 오수5kg/use | 청수0.65→오수0.65 내부단위 |

근거는 [C21 Lavatory](https://oxygennotincluded.wiki.gg/wiki/Lavatory), [C22 Sink](https://oxygennotincluded.wiki.gg/wiki/Sink)다. Lavatory의 추가6.7kg는 게임이 생성하는 생물학적 원천으로 계상한다. 한 대원이 주기당1회 이용하는 **설계 가정**을 쓰면 대원3명의 욕실 루프는20.1kg/cycle의 잉여수를 배출해야 한다. 실제 사용빈도는 방광·일정·특성으로 달라지므로 상수로고정하지 않는다.

정화와 살균은 분리한다. 물이 `water` 원소가 되어도 세균 수를 지웠다고 가정하지 않는다. 다음 설계에서는 `elementId`와 `germSpecies/germCount`를 별도로 보관하고, 세면 동선 방향과 작업물 접촉을 감염 경로에 연결한다. 원작 질병의 상세 감염 확률·증식률·사멸률은 아직 확보하지 않았으므로 해당 구현 수치를 원작으로 표시하지 않는다.

수질 UI는 물리 원소, 온도, 세균 오염을 각각 표시해야 한다. 한가지 빨간색 `더러운 물` 상태로 합치면 정화기의 역할과 음식 오염 경로를 설명하기 어렵다.

## 8. 구현 순서와 수용 기준

1. 식품 ID·열량·신선도 스택 도입, 수확·섭취·폐기 장부 정합성 확보.
2. Mealwood·Bristle·Dusk 세 종과 조리2~3종으로 수급 루프 완성.
3. 위치별 보관과 운반 예약으로 조리·냉장의 실제 비용 도입.
4. 욕실 잉여수와 오염 정보를 분리한 순환 실험.
5. 냉동 작물·조미료·고급요리를 추가하여 열·연구·사기와 연결.

수용 기준은 생산 전후 mass/kcal 로그, 이중 예약 방지, 식품 로트별 만료, 저장 직전·직후 식량 동일성, 대원10명과3종작물의100주기 예산 추적이다. 100주기는 제안 검증 길이이며 이미 통과한 테스트가 아니다.
