# 데이터 적용 기록 — KNOX · LAST SIGNAL

## 적용 범위

이 웹 게임은 사용자가 제공한 **ProjectZomboid_OriginalReconstruction_v11.zip**의 선별 데이터로부터 일부 아이템·레시피 선언을 읽고, 브라우저용 전투와 생존 규칙을 별도로 적용한 프로토타입입니다. 원작 전체 게임, 원작 코드 실행, 특정 Build의 완전 복원으로 표시하지 않습니다. 원본 ZIP과 그 안의 파일은 수정하지 않았습니다.

- 입력 ZIP SHA-256: `8dc4641c96d43b2537c5aeb6d80266d1375764041331f3b0a7a1bfadbcae073a`
- 아이템 미러 커밋: `da9598a27bbc9b01b413bb7c493e00c4e0ea047d`
- 아이템의 정확한 게임 빌드: 원본 v11에서 미확인
- 원작 런타임 검증: 미실행
- 웹 실행 데이터: `dist/data.js`의 `PZData`
- 포함: 아이템 33종 / 제작 9종 / 웹 루팅 프로필 4종
- 실제 v11 선언이 있는 아이템 21종 / 이번 웹 구현에서 보완한 정의 12종

## 출처

선별 데이터의 각 아이템은 `source.url`, `source.anchor`, `raw`를 보존합니다. 이 기록은 v11의 원문 대조 결과를 이관한 것입니다. 이 웹 구현 단계에서 미러를 다시 크롤링하거나 설치본을 조사하지 않았습니다.

- [무기 선언 미러](https://github.com/Niteghxst/Project-Zomboid-Media-Files/blob/da9598a27bbc9b01b413bb7c493e00c4e0ea047d/media/scripts/items_weapons.txt)
- [식품 선언 미러](https://github.com/Niteghxst/Project-Zomboid-Media-Files/blob/da9598a27bbc9b01b413bb7c493e00c4e0ea047d/media/scripts/items_food.txt)
- [일반 아이템 선언 미러](https://github.com/Niteghxst/Project-Zomboid-Media-Files/blob/da9598a27bbc9b01b413bb7c493e00c4e0ea047d/media/scripts/items.txt)
- [레시피 선언 미러](https://github.com/Niteghxst/Project-Zomboid-Media-Files/blob/da9598a27bbc9b01b413bb7c493e00c4e0ea047d/media/scripts/recipes.txt)

## 런타임 변환 규칙

| 항목 | 웹 적용 | 원작과의 관계 |
|---|---|---|
| 무기 피해 | 원시 최소·최대 피해 평균 × 32, 반올림 | HP 0–100 웹 전투 척도로 변환 |
| 무기 사거리 | 선별 원문 `MaxRange` | 웹 좌표 1타일 단위에 직접 대응한 설계 선택 |
| 공격 대기시간 | 0.4–1.0 실제 초 | 원문 `SwingTime`의 시간 단위 해석 아님 |
| 무기 내구도 | `ConditionMax × 10`, 없으면 보완값 | 웹 설계값, 원작 마모 확률 미실행 |
| 하중 | 선택 선언 `Weight`, 없으면 보완값 | 물리적 kg로 인증하지 않음 |
| 허기·수분·체력 | 웹 0–100 수치의 회복량 | 원작 영양·대사·치료 공식 미실행 |
| 통조림 사용 | 사용 버튼에서 개봉·섭취를 연속 처리 | 원문 `CantEat=true`를 그대로 실행하지 않는 접근성 단순화 |
| 제작 시간 | 데이터의 `duration` 실제 초 | 원문 `Time` 값은 `raw.Time`에 별도 보존 |
| 제작 수량 | 웹 정수 개수, 도구 보존 | 원작 Count·사용량·콜백의 전체 해석 아님 |
| 루팅 | 4개 웹 가중치 표와 미션 보장 배치 | 원작 루팅 확률 복원 아님 |
| 무전기 목표 | 배터리 2 + 전자 부품 2 + 테이프 1 | 독립 웹 시나리오 |

원작의 피로·통증·감염·좀비 감각·애니메이션 타이밍·멀티플레이 서버 로직은 이 자료만으로 검증하지 않습니다. 관련 웹 계수는 엔진에 정의된 별도 시뮬레이션입니다.

### 충돌과 누락 처리

`Base.Crowbar`의 원시 `CriticalChance`와 `CritDmgMultiplier`에는 서로 다른 값이 있습니다. `sourceConflicts`에 두 후보를 보존하고 이번 웹 규칙에서는 이를 선택하지 않습니다. 치명타 원작 수치를 임의 확정하지 않습니다.

`Base.KitchenKnife`, `Base.Plank`, `Base.PlankNail`, `Base.Bandage`, `Base.WaterBottleFull`, `Base.Battery`, `Base.ElectronicsScrap`, `Base.DuctTape`, `Base.Screwdriver`, `Base.CannedFood`는 이 v11 아이템 선별집합에 선언이 없습니다. 일부 이름이 레시피 결과나 루팅 참조에 나타나더라도 아이템 필드까지 복원된 것으로 올리지 않습니다. 실행 호환 ID로 사용하되 `prototype_adaptation`으로 표시합니다. `Base.CannedFood`는 이 게임의 범용 비상 식량 이름이며 원작 ID 존재를 주장하지 않습니다. `web.WoodenSpear`, `web.Disinfectant`는 명시적인 웹 전용 정의입니다.

## 아이템 매핑

피해 / 범위는 웹 실행값입니다. 모든 무기 쿨다운·회복량은 원본 수치와 분리해 `data.js`에서 확인할 수 있습니다.

| ID | 표시명 | 근거 | 하중 | 피해 / 범위 |
|---|---|---|---:|---:|
| `Base.BaseballBat` | 야구방망이 | v11 선언 참조 | 2 | 30 / 1.25 |
| `Base.BaseballBatNails` | 못 박은 야구방망이 | v11 선언 참조 | 2 | 40 / 1.28 |
| `Base.Axe` | 도끼 | v11 선언 참조 | 3 | 45 / 1.2 |
| `Base.Crowbar` | 쇠지렛대 | v11 선언 참조 | 2 | 28 / 1.25 |
| `Base.Hammer` | 망치 | v11 선언 참조 | 1 | 24 / 1.1 |
| `Base.HandAxe` | 손도끼 | v11 선언 참조 | 2 | 35 / 1.1 |
| `Base.KitchenKnife` | 식칼 | 웹 보완 정의 | 0.3 | 22 / 0.95 |
| `Base.PlankNail` | 못 박은 판자 | 웹 보완 정의 | 1.5 | 35 / 1.3 |
| `web.WoodenSpear` | 깎은 나무 창 | 웹 보완 정의 | 1.2 | 33 / 1.8 |
| `Base.Saw` | 톱 | v11 선언 참조 | 0.7 | — |
| `Base.TinOpener` | 통조림 따개 | v11 선언 참조 | 0.6 | — |
| `Base.Screwdriver` | 드라이버 | 웹 보완 정의 | 0.2 | — |
| `Base.Plank` | 나무판 | 웹 보완 정의 | 1.5 | — |
| `Base.Nails` | 못 | v11 선언 참조 | 0.01 | — |
| `Base.Log` | 통나무 | v11 선언 참조 | 9 | — |
| `Base.Sheet` | 침대 시트 | v11 선언 참조 | 0.8 | — |
| `Base.Thread` | 실 | v11 선언 참조 | 0.1 | — |
| `Base.Battery` | 배터리 | 웹 보완 정의 | 0.1 | — |
| `Base.ElectronicsScrap` | 전자 부품 | 웹 보완 정의 | 0.1 | — |
| `Base.DuctTape` | 덕트 테이프 | 웹 보완 정의 | 0.2 | — |
| `Base.Bandage` | 붕대 | 웹 보완 정의 | 0.1 | — |
| `Base.RippedSheets` | 천 조각 | v11 선언 참조 | 0.05 | — |
| `Base.AlcoholRippedSheets` | 소독한 천 | v11 선언 참조 | 0.05 | — |
| `web.Disinfectant` | 소독약 | 웹 보완 정의 | 0.3 | — |
| `Base.WaterBottleFull` | 생수 | 웹 보완 정의 | 0.8 | — |
| `Base.TinnedBeans` | 콩 통조림 | v11 선언 참조 | 0.8 | — |
| `Base.TunaTin` | 참치 통조림 | v11 선언 참조 | 0.3 | — |
| `Base.CannedChili` | 칠리 통조림 | v11 선언 참조 | 0.8 | — |
| `Base.CannedCorn` | 옥수수 통조림 | v11 선언 참조 | 0.8 | — |
| `Base.TinnedSoup` | 수프 통조림 | v11 선언 참조 | 0.8 | — |
| `Base.OpenBeans` | 개봉한 콩 통조림 | v11 선언 참조 | 0.8 | — |
| `Base.TunaTinOpen` | 개봉한 참치 | v11 선언 참조 | 0.3 | — |
| `Base.CannedFood` | 비상 식량 | 웹 보완 정의 | 0.5 | — |

## 제작 매핑

아래에서 도구는 소비되지 않습니다. 재료 소비와 결과 생성은 엔진의 제작 완료 시점에 함께 적용됩니다. 제작이 중단되면 엔진 규칙에 따라 재료를 보존합니다.

| 제작 | 소비 재료 | 보존 도구 | 결과 | 웹 시간 | 근거 |
|---|---|---|---|---:|---|
| 못 박은 방망이 | 야구방망이 × 1, 못 × 5 | 망치 | 못 박은 야구방망이 × 1 | 3.0초 | v11 레시피 참조 |
| 통나무 자르기 | 통나무 × 1 | 톱 | 나무판 × 3 | 4.0초 | v11 레시피 참조 |
| 못 박은 판자 | 나무판 × 1, 못 × 5 | 망치 | 못 박은 판자 × 1 | 3.0초 | v11 레시피 참조 |
| 나무 창 깎기 | 나무판 × 1 | 식칼 | 깎은 나무 창 × 1 | 4.0초 | 웹 규칙 |
| 시트 찢기 | 침대 시트 × 1 | 없음 | 천 조각 × 4 | 1.5초 | 웹 규칙 |
| 간이 붕대 만들기 | 천 조각 × 2, 실 × 1 | 없음 | 붕대 × 1 | 2.5초 | 웹 규칙 |
| 천 소독하기 | 천 조각 × 1, 소독약 × 1 | 없음 | 소독한 천 × 1 | 2.0초 | 웹 규칙 |
| 콩 통조림 개봉 | 콩 통조림 × 1 | 통조림 따개 | 개봉한 콩 통조림 × 1 | 1.0초 | v11 레시피 참조 |
| 참치 통조림 개봉 | 참치 통조림 × 1 | 없음 | 개봉한 참치 × 1 | 1.0초 | v11 레시피 참조 |

`selected_recipe_adapted` 레시피는 v11의 `ingredients_raw`, `result_raw`, `Time`, 메타데이터를 `raw`에 보존합니다. 원문 `Base.recipe.<hash>`는 v11이 만든 재구축 키이므로 원작 엔진 고유 ID라고 부르지 않습니다. 원작 Lua 콜백은 실행하지 않습니다. 시트 찢기·붕대 만들기·천 소독·나무 창 제작은 웹 독립 규칙입니다.

## 데이터 구조와 점검

`PZData.items`는 ID 사전, `recipes`는 제작 목록, `loot`는 구역별 가중치 목록입니다. 각 가중치 행은 `{id, weight, min, max}` 형태입니다. 원문 루팅 표를 정규화한 확률이 아닙니다. `provenance.counts`에 아이템/레시피/출처 구분 수를 기록합니다.

추가 아이템을 만들 때는 원문 기록 여부와 실행값을 분리해야 합니다. 선언을 찾지 못한 아이템에 임의의 `raw`를 채워 넣지 않습니다. 웹 전용 정의는 빈 `raw`와 `prototype_adaptation` 상태를 유지합니다.
