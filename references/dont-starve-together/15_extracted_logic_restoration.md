# 15. 원본 Lua 게임 로직 역공학 자동 추출 및 Godot 4.7.2 복원 보고서

> 상위 문서: [00. 목차](00_index.md) | 추출기: `forge/Templates/dont-starve-together/tools/extract_dst_logic.py` | 런타임 엔진: `forge/Templates/dont-starve-together/scripts/dst_logic_engine.gd` | 추출 산출물: `forge/Templates/dont-starve-together/data/dst_logic_extracted.json` (`57.43 KB`)

---

## 1. 역공학 추출 범위 및 자동 파싱 결과 (`scripts.zip`, v763928)

수작업 요약본 대신 로컬 설치본 `scripts.zip`에서 추출된 원본 Lua 소스를 Python 재귀 하강 파서 및 상수 해석기로 직접 역공학해, Godot 4.7.2 런타임에서 **수정 없이 그대로 실행 가능한 로직 데이터(`dst_logic_extracted.json`)** 로 컴파일했다.

| 로직 영역 | 원본 Lua 소스 | 추출·컴파일 결과 | 파싱 실패 |
| :--- | :--- | :--- | :---: |
| **튜닝 상수 해석기** | `scripts/tuning.lua` | **5,665개** 수치 상수 자동 해석 (`SEG_TIME`, `day_time`/`night_time`, `HEALING_*`, `CALORIES_*`, `SANITY_*`, `PERISH_*`, 보스/방어구/농사/길들이기 상수) | 0 |
| **요리 재료 & 별칭** | `scripts/cooking.lua` | `AddIngredientValues` 기반 **137종** 원물·구이(`_cooked`)·건조(`_dried`) 재료 태그 및 `aliases` 전수 추출 | 0 |
| **요리 냄비 79종 AST** | `scripts/preparedfoods.lua` (68) + `preparedfoods_warly.lua` (11) | **79/79종** `test = function(cooker, names, tags) return ... end` 술어를 휴대용 JSON AST로 100% 컴파일 | **0** |
| **14종 작물 3영양분·계절** | `scripts/prefabs/farm_plant_defs.lua` | **14종** 작물의 `[N, P, K]` 소비/복원량(`S=2, M=4, L=8`), 선호 계절, 수분 소비율, 무게 범위 전수 추출 | 0 |
| **30Hz StateGraph 타임라인** | `scripts/stategraphs/SG*.lua` (9종) | `TimeEvent(N*FRAMES)` + `FrameEvent(N)` 전수 파싱 → 30 FPS 기준 공격 선딜/히트프레임/후딜 산출 | 0 |
| **Brain AI 우선순위 트리** | `scripts/brains/*brain.lua` (7종) | 추격/리쉬 상수 및 `PriorityNode` 행동 노드 순서 추출 | 0 |
| **하운드 웨이브 에스컬레이션** | `scripts/components/hounded.lua` | 5단계 일수 티어(`intro`/`light`/`med`/`heavy`/`crazy`), 경고 시간, 마릿수, 계절 변종(`icehound`/`firehound`), `warglet` 업그레이드 확률 추출 | 0 |
| **19인 캐릭터 스탯** | `scripts/tuning.lua` | 19인 전 생존자 HP/허기/정신력 원작 상수 추출 | 0 |
| **950+ 제작 레시피 & TechTree** | `scripts/recipes.lua` | **950종** `Recipe2` (재료·64종 `TECH.*`·`builder_tag`·`builder_skill`·`numtogive`) + **150종** `DeconstructRecipe` 전수 추출 | 0 |
| **12인 스킬트리 방향성 그래프** | `scripts/prefabs/skilltree_*.lua` (12파일) | **12인 / 359노드**(`root`, `connects`, `parents`, `locks`, `group`, `tags`) 선행 의존 그래프 전수 추출 | 0 |
| **WX-78 23종 회로 모듈** | `scripts/wx78_moduledefs.lua` | **23종** 회로(`slots`, `bar`, 생물 스캔 출처) + 6슬롯 전력 예산 규칙 전수 추출 | 0 |
| **화재 전파 & 단열 열관성** | `components/propagator.lua`, `temperature.lua` | `flashpoint=100`, `prop_range=3.0`, 봄 `0.67×` 사거리 보정, `delta * SEG_TIME / (SEG_TIME + insulation)` 원작 공식 직접 검증 | 0 |
| **전리품 드랍 테이블** | `scripts/prefabs/*.lua` (`SetSharedLootTable`) | **229종** 확률 드랍 테이블 전수 추출 (`deerclops` 눈알+고기8, `krampus` 1% 가방 등) | 0 |
| **월드젠 룸 & 바이옴 가중치** | `scripts/map/rooms/**/*.lua` (`AddRoom`) | **222종** 지상·동굴·달섬 룸 타일 및 `distributeprefabs` 가중치 테이블 전수 추출 | 0 |
| **양념(316조합)·빙결·계절보간** | `spicedfoods.lua`, `freezable.lua`, `seasons.lua` | 왈리 4종 양념(`spice_chili`/`garlic`/`sugar`/`salt`), 3상태 빙결 파쇄(`NORMAL→FROZEN→THAWING`), `0.5 - sin(PI*p)*0.5` 16세그 계절 시계 보간 공식 검증 | 0 |
| **전투·다중방어구·평면압축** | `components/inventory.lua`, `planarentity.lua`, `combat.lua` | `(sqrt(damage*4+64)-8)*4` 평면 개체 물리 피해 압축, 다중 방어구 최대 흡수·비례 내구도 분산, 평면 방어구 균등 분할 차감 공식 추출·복원 | 0 |
| **부패·신선도 희석·식용 감쇠** | `components/perishable.lua`, `edible.lua` | 냉장고(`0.5×`)/얼음(`0.0×`)/소금상자(`0.25×`)/바닥(`1.5×`)/습기(`1.3×`)/겨울(`0.75×`)/여름(`1.25×`) 배수, 스택 희석 공식, 위커바텀 엄격 상함 감쇠 복원 | 0 |
| **습기 이징·이중 정신력·유령 저항** | `components/moisture.lua`, `sanity.lua`, `easing.lua` | Penner `inSine`/`inExpo` 강수·건조 공식, 광기/계몽 모드별 주야간 드레인, `min(G,3)*(1-r²)` 유령 군집 저항 공식 복원 | 0 |
| **비팔로 길들이기·수면 점감 저항** | `components/domesticatable.lua`, `sleeper.lua`, `nightmareclock.lua` | 순종도/성향 감쇠·`domestication_latch`·3대 성향(`ORNERY`/`RIDER`/`PUDGY`), 수면 점감 저항(`max(0.2, 1-0.1*r)`), 악몽 시계 세그먼트 검증 | 0 |
| **해양 어종(18종)·월드젠 태스크(140종)** | `prefabs/oceanfishdef.lua`, `map/tasks/**/*.lua`, `map/tasksets/*.lua` | **18종** 해양 물고기 무게·스태미나·낚시 AI 및 **140종** 월드젠 태스크(`CaveExitTask1..10` 동적 루프 포함) + 지상(`default` 15/15)/동굴(`cave_default` 33/33) 태스크셋 100% 추출 | 0 |

---

## 2. 핵심 역공학 복원 엔진 (`DSTLogicEngine`)

### 2.4 추가 복원 엔진 (Pass 2 ~ Pass 4)
- **950종 `Recipe2` & TechTree 검증기 (`can_craft_recipe2`)**: 64종 원작 `TECH.*` 티어, 캐릭터 전용 `builder_tag`(예: 윌로우 `pyromaniac` → `lighter`), 스킬 해금 조건(`builder_skill`), 정확한 재료 수량 검증
- **12인 360노드 방향성 스킬트리 그래프 (`can_unlock_tree_node`)**: `root` 노드 선행 해금 후 `parents` 연결 노드만 해금 가능한 원작 DAG 위상 검증(예: `wilson_alchemy_1` → `wilson_alchemy_2` → `wilson_alchemy_5`)
- **WX-78 23종 회로 6슬롯 전력 예산 엔진 (`wx78_can_plug_module`, `wx78_calc_circuit_bonuses`)**: 6칸 초과 차단 및 `maxhealth2`/`movespeed2`/`nightvision`/`heat`/`cold` 스탯 합산
- **열관성 단열 & 화재 열 전파 (`calc_insulated_temp_delta`, `step_fire_propagators`)**: `DSTWorldSim` 체온 루프에 원작 `30 / (30 + insulation)` 공식을 직접 적용하고(윌슨 수염 겨울 단열 `135`), 봄철 화재 사거리 `0.67×` 축소 및 `flashpoint=100` 점화 전파를 복원
- **229종 확률 루트 & 222종 월드젠 룸 & 140종 태스크셋 (`roll_shared_loot`, `sample_worldgen_room_prefabs`, `get_worldgen_taskset_plan`)**: 원작 `SetSharedLootTable` 확률 드랍 롤러, `AddRoom` 프리팹 샘플러, 지상/동굴 `AddTaskSet` 청사진 빌더 복원
- **계절 16세그 사인 보간 & 왈리 4양념 & 3상태 빙결 파쇄 (`calc_interpolated_season_segs`, `apply_spice_to_food`, `step_freezable`)**: `DSTWorldSim.get_season_segs()`에 원작 일별 사인 보간 직접 적용
- **전투/평면압축/다중방어구 & 부패/식용 감쇠 (`resolve_combat_hit`, `calc_perish_rate_mult`, `dilute_perish_stack`, `eval_edible_with_spoilage`)**: `DSTWorldSim.eat_food()`에 원작 신선/눅눅/상함 및 위커바텀 감쇠 엔진 직접 연동
- **습기 이징·이중 정신력·비팔로 길들이기·수면 점감·해양 낚시 (`step_moisture`, `calc_sanity_rate`, `step_beefalo_domestication`, `step_sleeper_diminishing`, `step_ocean_fish_reel`)**: 18종 해양 어종 스태미나 낚시 루프 및 생존/상태이상 원작 공식 런타임 복원

---

## 3. 자동화 회귀 검증 결과
- Python 추출기 크로스체크: **12/12** 원작 레시피 조합 PASS (`ast_failures == 0`)
- Godot 4.7.2 헤드리스 회귀 테스트 (`tests/dst_restore_tests.gd`): **139개 체크 전체 PASS**
  - 79종 AST 요리, 14종 작물 N/P/K·7스트레스, 외눈사슴 31f 카이팅 회피, `hounded.lua` 웨이브 에스컬레이션
  - 950종 `Recipe2` 윌로우 `pyromaniac` 태그 게이트, 12인 360노드 스킬트리 부모 선행 차단/해금, WX-78 23종 회로 6슬롯 상한, 단열 열관성 `-10 * 30/150 = -2.0`, 봄철 화재 전파 사거리(`0.67×`) 분리 검증
  - 229종 루트 테이블(`deerclops` 눈알+고기 8), 222종 월드젠 룸(`Forest` 샘플링), 16세그 계절 보간, 왈리 4양념(`perogies+salt=50HP`, `chili=1.2×`, `garlic=0.67×`), 3상태 빙결 파쇄 검증
  - 평면 개체 물리 압축(`54.16`), 다중 방어구 비례 내구도·평면방어 균등 분할(`46` 마모), 부패 다중 배수·스택 희석(`80.0`)·위커바텀 상함 감쇠, `inSine`/`inExpo` 습기·건조, 광기/계몽 유령 군집 저항(`1.5×`), 비팔로 길들이기 래치(`RIDER`), 수면 점감 하한(`0.2×`), 18종 해양 어종 낚시 스태미나 및 140종 지상/동굴 월드젠 태스크셋(15/15 · 33/33) 검증
