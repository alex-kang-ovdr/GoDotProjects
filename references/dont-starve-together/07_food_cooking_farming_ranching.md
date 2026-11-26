# 07. 식량, 요리, 부패, 농사(Reap What You Sow)와 축산

> 상위 문서: [00. 목차](00_index.md) | 1차 출처: `scripts/cooking.lua`, `scripts/preparedfoods.lua`, `scripts/preparedfoods_warly.lua`, `scripts/spicedfoods.lua`, `scripts/components/perishable.lua`, `scripts/prefabs/farm_plant_defs.lua`, `scripts/prefabs/farm_plants.lua`, `scripts/components/farmplantstress.lua`, `scripts/tuning.lua`

---

## 1. 요리 냄비(Crock Pot) 판정 알고리즘 (`cooking.lua`) (`[코드 확인]`)

DST에는 일반 요리 **50종**(`preparedfoods.lua`), 왈리 전용 휴대용 냄비 요리 **11종**(`preparedfoods_warly.lua`), 비식용 조리물 **2종**(`preparednonfoods.lua`: `batnosehat`, `dustmeringue`), 그리고 모든 요리에 4종 향신료를 조합하는 **향신료 요리**(`spicedfoods.lua`)가 존재한다.

### 1.1 레시피 결정 순서 (`cooking.lua:238–288`)
1. 투입된 4개 재료의 이름(`ingdata.names`)과 식품 태그 합계(`ingdata.tags`: `meat`, `veggie`, `fruit`, `egg`, `sweetener`, `fish`, `monster`, `dairy`, `frozen`, `inedible` 등)를 집계한다.
2. 해당 조리기(`cooker`)에 등록된 모든 레시피의 `v.test(cooker, names, tags)`를 실행해 통과한 후보군을 모은다.
3. 후보군을 **`priority` 내림차순**으로 정렬한 뒤, **최고 `priority`와 동률인 후보들만** 남긴다(`top_candidates`).
4. 동률 후보들 사이에서 **`weight` 가중치 기반 무작위 추첨**으로 최종 요리와 `cooktime`을 결정한다.
5. 아무 레시피도 만족하지 못하면 최하위 우선순위(`priority = -10`)인 `wetgoop`(젖은 찌꺼기)가 나온다.

### 1.2 핵심 대표 요리 수치표 (`preparedfoods.lua` + `tuning.lua` 환산) (`[데이터 확인]`)
> 기준 상수: `CALORIES_SMALL=12.5`, `MED=25`, `LARGE=37.5`, `HUGE=75`, `MOREHUGE=100`, `SUPERHUGE=150` / `HEALING_SMALL=3`, `MED=20`, `MEDLARGE=30`, `LARGE=40`, `HUGE=60`, `SUPERHUGE=100` / `SANITY_TINY=5`, `SMALL=10`, `MED=15`, `MEDLARGE=20`, `LARGE=33`, `HUGE=50`.

| 요리 ID | 우선순위 | 체력 | 허기 | 정신력 | 신선도(일) | 조리시간 계수 | 실전 역할 |
|---|---:|---:|---:|---:|---:|---:|---|
| `meatballs` (미트볼) | -1 | +3 | **+62.5** | +5 | 10일 | 0.75 | 최고의 가성비 허기 주식 |
| `perogies` (피에로기) | 5 | **+40** | +37.5 | +5 | **20일** | 1.0 | 최고의 보스전 전투 회복식 |
| `baconeggs` (베이컨에그) | 10 | +20 | **+75** | +5 | **20일** | 2.0 | 장거리 원정용 고보존 주식 |
| `honeyham` (허니햄) | 2 | +30 | **+75** | +5 | 15일 | 2.0 | 체력+허기 밸런스형 주식 |
| `bonestew` (미트스튜) | 0 | +12 | **+150** | +5 | 10일 | 0.75 | 볼프강/왈리 대용량 허기 회복 |
| `dragonpie` (드래곤파이) | 1 | **+40** | **+75** | +5 | 15일 | 2.0 | 채식 최강 전투/주식(워트 포함) |
| `surfnturf` (서프앤터프) | 30 | **+60** | +37.5 | **+33** | 10일 | 1.0 | 3스탯 최고급 회복 |
| `jellybean` (젤리빈) | 12 | 지속회복 | 0 | +5 | **부패 없음** | 2.5 | 여왕벌 보상, 전투 중 지속 힐 |
| `icecream` (아이스크림) | 10 | 0 | +25 | **+50** | 3일 | 0.5 | 단기 정신력 급속 회복 + 냉각 |
| `monsterlasagna` (몬스터 라자냐) | 10 | -20 | +37.5 | -20 | 6일 | 0.5 | 몬스터 고기 2+ 함정 레시피 |
| `powcake` (파우더케이크) | 10 | -3 | 0 | 0 | 18,750일 | 0.5 | 칠면조/돼지 유인 영구 미끼 |

### 1.3 왈리 전용 요리 11종 & 향신료 4종 (`[코드 확인]`)
- **왈리 전용 11종 (`preparedfoods_warly.lua`)**: `nightmarepie`(체력↔정신력 치환), `voltgoatjelly`(공격에 전기 속성 부여 — 젖은 적 `2.5×`!), `glowberrymousse`(발광), `frogfishbowl`(방수), `dragonchilisalad`(발열), `gazpacho`(냉각), `potatosouffle`, `monstertartare`, `freshfruitcrepes`, `bonesoup`, `moqueca`.
- **향신료 4종 (`spicedfoods.lua`, 우선순위 100, 조리시간 `0.12`)**:
  - `SPICE_GARLIC` → `buff_playerabsorption` (받는 피해 33% 경감)
  - `SPICE_CHILI` → `buff_attack` (공격력 +20%, 온기 추가)
  - `SPICE_SUGAR` → `buff_workeffectiveness` (벌목/채광 등 작업 효율 2×)
  - `SPICE_SALT` → 음식 체력 회복량 +25%

---

## 2. 부패(Perishable) 시뮬레이션 (`perishable.lua`, `tuning.lua`) (`[코드 확인]`)

신선도 구간: **신선(Fresh) > 50%** (`PERISH_FRESH = 0.5`) → **상함(Stale) 20~50%** (`PERISH_STALE = 0.2`) → **부패 직전(Spoiled) < 20%** → **0% 시 썩음(Rot)**.
- Stale 섭취 시: 허기 `×0.667`, 체력 `×0.333`, 정신력 `0`.
- Spoiled 섭취 시: 허기 `×0.5`, 체력 `0`, 정신력 `-10` (일부 예외 제외).

### 부패 속도 배율 (`perishable.lua:60–124`, `tuning.lua:2077–2088`)
| 환경 / 보관 조건 | 배율 | 비고 |
|---|---:|---|
| 냉장고(`fridge`) 내부 | **0.5×** | `frozen` 태그는 **0.0×** (영구 보관) |
| 소금 상자(`saltbox`) / 버섯 조명 / 새장 | **0.25×** | 날음식/생선/작물 최강 보존 |
| 식품 보존 가방(`foodpreserver`, 보온가방) | **0.75×** | 이동 중 감속 |
| 바닥 방치(`owner == nil`) 또는 `spoiler` 소유 | **1.5×** | 동굴 산성비 시 추가 급속 부패 |
| 젖은 상태(`GetIsWet`) | **1.3×** | 타 배율과 곱연산 |
| 겨울(`ambient_temp < 0°C`) | **0.75×** | 얼음류는 `0.0×` |
| 여름(`ambient_temp > 70°C`) | **1.25×** | 불 근처 `frozen` 아이템은 **30×** |

---

## 3. DST 농사 시스템 (Reap What You Sow) (`[코드 확인]`)

구버전 단일 농장(Farm Plot)을 완전히 대체한 토양 기반 생태 농사 시스템이다 (`farm_plant_defs.lua`, `farm_plants.lua`, `farmplantstress.lua`).

### 3.1 7가지 스트레스 카테고리와 거대 작물 판정 (`farm_plants.lua:855–861`, `farmplantstress.lua:72–78`)
작물은 4번의 성장 단계 체크포인트(`MakeCheckpoint`)마다 아래 **7가지 스트레스**를 검사하며, 충족하지 못한 항목당 `+1점`이 누적된다.
1. `nutrients` (3종 토양 영양분 — 성장촉진제·퇴비·거름 중 소비 성분이 충분한지)
2. `moisture` (토양 수분 유지 여부)
3. `killjoys` (반경 내 잡초·썩은 작물·잔해 없음)
4. `family` (반경 내 같은 종 작물 **최소 4그루** 인접)
5. `overcrowding` (한 타일 내 과밀 파종 초과 여부 — 일반적으로 타일당 10그루 이하)
6. `season` (현재 계절이 `good_seasons`에 포함되는지)
7. `happiness` (단계마다 말 걸기/연주/친근한 과일파리로 돌봄 수행 여부)

**최종 수확 등급 (`CalcFinalStressState`, `farmplantstress.lua:72–78`)**:
- **`stress <= 1`** → `NONE` (**거대 작물(Oversized) 수확!** — 단 1번의 실수까지만 허용)
- **`2 ~ 6`** → `LOW` (작물 1 + 씨앗 2)
- **`7 ~ 11`** → `MODERATE` (작물 1 + 씨앗 1)
- **`>= 12`** → `HIGH` (작물 1, 씨앗 없음)

### 3.2 14종 농작물 영양분 소비(N1/N2/N3) 및 선호 계절표 (`farm_plant_defs.lua`) (`[데이터 확인]`)
> 소비가 `0`인 영양분은 반대로 토양에 **복원(Restore)**된다(`data.nutrient_restoration[i] = (consumption[i] == 0)`). 즉 소비 합이 `0`이 되도록 조합하면 **비료 없는 영구 거대작물 윤작**이 가능하다!

| 작물 | 영양 소비 `[촉진제, 퇴비, 거름]` | 수분 소비 | 선호 계절 | 비고 |
|---|---|---|---|---|
| 당근(`carrot`) | `[M, 0, 0]` | Low | 가·겨·봄 | |
| 옥수수(`corn`) | `[0, M, 0]` | Low | 가·봄·여 | |
| 감자(`potato`) | `[0, 0, M]` | Low | 가·겨·봄 | |
| 토마토(`tomato`) | `[S, S, 0]` | High | 가·봄·여 | 감자와 1:1 영구 조합 |
| 아스파라거스(`asparagus`) | `[0, M, 0]` | Low | 겨·봄 | |
| 가지(`eggplant`) | `[0, 0, M]` | Med | 가·봄 | |
| 호박(`pumpkin`) | `[M, 0, 0]` | Med | 가·겨 | 조각 가능(`iscarvable`) |
| 수박(`watermelon`) | `[0, S, S]` | High | 봄·여 | |
| 용과(`dragonfruit`) | `[0, 0, L]` | Med | 봄·여 | **화염 면역(`fireproof=true`)** |
| 두리안(`durian`) | `[0, L, 0]` | Low | 봄 | |
| 마늘(`garlic`) | `[0, L, 0]` | Low | **사계절** | 향신료 재료 |
| 양파(`onion`) | `[L, 0, 0]` | Med | 가·봄·여 | |
| 고추(`pepper`) | `[0, 0, L]` | Low | 가·여 | 향신료 재료 |
| 석류(`pomegranate`) | `[L, 0, 0]` | Med | 봄·여 | |

- 무작위 씨앗(`randomseed`)은 `FARM_PLANT_RANDOMSEED_WEED_CHANCE = 0.20` (20%) 확률로 잡초(망각초, 따끔이, 불쐐기풀, 가시덩굴)가 자란다.

---

## 4. 축산: 비팔로(Beefalo) 길들이기 (`tuning.lua:869–939`) (`[데이터 확인]`)

- **기본 스탯**: HP `1,000` (`500 × 2`), 3일에 걸쳐 전체 체력 자연 회복, 허기 `375` (일 소비 `300`), 털 성장 `3일`.
- **순종도(Obedience, `0.0 ~ 1.0`)**:
  - 안장 장착 최소치 `0.1`, 안장 유지 최소치 `0.4`, 낙마 방지 기준 `0.5`.
  - 먹이 주기 `+0.1`, 과식 `-0.3`, 빗질 `+0.4`, 플레이어 피격/면도 `-1.0`, 아사 시 하루 `-1.0`.
- **길들임(Domestication, `0.0 ~ 1.0`)**:
  - 포만 상태 또는 탑승 유지 시 20일(`1 / (480 × 20)`) 만에 100% 도달. 빗질 시 15일로 단축.
  - 방치 시 4일당 `-1.0` 비율로 하락, 플레이어 공격 시 `-0.3`.
- **3대 성향(Tendency)**:
  - **포동이(Pudgy)**: 포만 유지(`1/(day×5)`)·과식(`+0.02`) → 주변 정신력 회복 오라.
  - **경주마(Rider)**: 탑승 유지(`1/(day×5)`) → 최고 이동 속도.
  - **전투형(Ornery)**: 공격/피격당 `+0.004` → 최고 공격력.
