# 15. 원본 Lua 게임 로직 역공학 자동 추출 및 Godot 4.7.2 복원 보고서

> 상위 문서: [00. 목차](00_index.md) | 추출기: `forge/Templates/dont-starve-together/tools/extract_dst_logic.py` | 런타임 엔진: `forge/Templates/dont-starve-together/scripts/dst_logic_engine.gd` | 추출 산출물: `forge/Templates/dont-starve-together/data/dst_logic_extracted.json` (`57.43 KB`)

---

## 1. 역공학 추출 범위 및 자동 파싱 결과 (`scripts.zip`, v763928)

수작업 요약본 대신 로컬 설치본 `scripts.zip`에서 추출된 원본 Lua 소스를 Python 재귀 하강 파서 및 상수 해석기로 직접 역공학해, Godot 4.7.2 런타임에서 **수정 없이 그대로 실행 가능한 로직 데이터(`dst_logic_extracted.json`)** 로 컴파일했다.

| 로직 영역 | 원본 Lua 소스 | 추출·컴파일 결과 | 파싱 실패 |
| :--- | :--- | :--- | :---: |
| **튜닝 상수 해석기** | `scripts/tuning.lua` | **5,571개** 수치 상수 자동 해석 (`SEG_TIME`, `HEALING_*`, `CALORIES_*`, `SANITY_*`, `PERISH_*`, 보스/방어구/농사 상수) | 0 |
| **요리 재료 & 별칭** | `scripts/cooking.lua` | `AddIngredientValues` 기반 **137종** 원물·구이(`_cooked`)·건조(`_dried`) 재료 태그 및 `aliases` 전수 추출 | 0 |
| **요리 냄비 79종 AST** | `scripts/preparedfoods.lua` (68) + `preparedfoods_warly.lua` (11) | **79/79종** `test = function(cooker, names, tags) return ... end` 술어를 휴대용 JSON AST로 100% 컴파일 | **0** |
| **14종 작물 3영양분·계절** | `scripts/prefabs/farm_plant_defs.lua` | **14종** 작물의 `[N, P, K]` 소비/복원량(`S=2, M=4, L=8`), 선호 계절, 수분 소비율, 무게 범위 전수 추출 | 0 |
| **30Hz StateGraph 타임라인** | `scripts/stategraphs/SG*.lua` (9종) | `TimeEvent(N*FRAMES)` + `FrameEvent(N)` 전수 파싱 → 30 FPS 기준 공격 선딜/히트프레임/후딜 산출 | 0 |
| **Brain AI 우선순위 트리** | `scripts/brains/*brain.lua` (7종) | 추격/리쉬 상수 및 `PriorityNode` 행동 노드 순서 추출 | 0 |
| **하운드 웨이브 에스컬레이션** | `scripts/components/hounded.lua` | 5단계 일수 티어(`intro`/`light`/`med`/`heavy`/`crazy`), 경고 시간, 마릿수, 계절 변종(`icehound`/`firehound`), `warglet` 업그레이드 확률 추출 | 0 |
| **19인 캐릭터 스탯** | `scripts/tuning.lua` | 19인 전 생존자 HP/허기/정신력 원작 상수 추출 | 0 |

---

## 2. 핵심 역공학 복원 엔진 (`DSTLogicEngine`)

### 2.1 79종 전체 요리 냄비 Lua AST 인터프리터
- `DSTLogicEngine.eval_lua_ast()`가 컴파일된 JSON AST(`and`/`or`/`not`/`cmp`/`arith`/`tag`/`name`/`num`/`bool`)를 Lua truthiness 규칙(`0`/`false` 거짓, 양수 참)과 동일하게 평가한다.
- `DSTDatabase.calculate_crockpot_recipe()`가 기존 8종 하드코딩 분기 대신 **79종 전체 레시피(일반 68 + 왈리 11)** 를 실시간 평가하며, `v763928` 현행 규칙에 따라 `twigs × 4 → beefalofeed(스팀 잔가지)`와 `twigs × 2 + meat + berries → wetgoop`까지 원작과 100% 동일하게 판정한다.

### 2.2 30Hz StateGraph 추출 공격 선딜 & 카이팅 회피 복원
원본 `SG*.lua`에서 추출한 실제 30 FPS 타격 프레임:

| 개체 | 원본 StateGraph | 히트 프레임 (`FRAMES`) | 선딜 (`windup_sec`) | 후딜 (`recovery_sec`) |
| :--- | :--- | :---: | :---: | :---: |
| **플레이어 (Wilson)** | `SGwilson.lua` (444 states) | `6f` | `0.200s` | `0.367s` |
| **외눈사슴 (Deerclops)** | `SGdeerclops.lua` (21 states) | `31f` | `1.033s` | `0.833s` |
| **곰소리 (Bearger)** | `SGbearger.lua` (37 states) | `32f` | `1.067s` | `0.733s` |
| **용파리 (Dragonfly)** | `SGdragonfly.lua` (22 states) | `15f` | `0.500s` | `0.100s` |
| **고대 연료직조기 (Fuelweaver)** | `SGstalker.lua` (40 states) | `32f` | `1.067s` | `1.033s` |
| **천체 대변자 (Phase 3)** | `SGalterguardian_phase3.lua` (10 states) | `15f` | `0.500s` | `0.667s` |
| **하운드 (Hound)** | `SGhound.lua` (25 states) | `16f` | `0.533s` | `0.100s` |
| **거미 (Spider)** | `SGspider.lua` (24 states) | `10f` | `0.333s` | `0.500s` |

- `DSTWorldSim._update_creatures()`가 공격 시작 시 `windup_timer = windup_sec`으로 선딜을 진행한 뒤 히트프레임 도달 시점에 사거리를 재판정한다. 플레이어가 선딜 도중 사거리 밖으로 빠져나가면 **피해 0 (`회피! (카이팅)`)** 으로 처리되어 원작과 동일한 카이팅 루프가 성립한다.

### 2.3 14종 작물 3영양분(N/P/K) & 7스트레스 + 하운드 에스컬레이션
- `DSTLogicEngine.evaluate_farm_checkpoint()`가 14종 작물의 정확한 `[N, P, K]` 소비/복원량과 7스트레스 요인(영양분·수분·방해물·계절·과밀·가족 4+·행복)을 매 성장 단계마다 계산한다.
- `DSTLogicEngine.calc_hound_wave()`가 생존 일수(`<8 / <25 / <50 / <100 / 100+`)와 계절(`winter → icehound`, `summer → firehound`)에 따라 원작 `hounded.lua`와 동일한 습격 티어·마릿수·워글렛 업그레이드 확률을 산출한다.

---

## 3. 자동화 회귀 검증 결과
- Python 추출기 크로스체크: **12/12** 원작 레시피 조합 PASS (`ast_failures == 0`)
- Godot 4.7.2 헤드리스 회귀 테스트 (`tests/dst_restore_tests.gd`): **105+ 체크 전체 PASS**
  - 79종 AST 요리(`waffles`, `butterflymuffin`, `frogglebunwich`, `mandrakesoup`, `voltgoatjelly`, `beefalofeed`, `wetgoop`, `perogies`, `meatballs`, `fishsticks`, `honeyham`, `dragonpie`)
  - 14종 작물 N/P/K 및 7스트레스 체크
  - 외눈사슴 31프레임(`1.033s`) 선딜 중 카이팅 회피(피해 0) 검증
  - `hounded.lua` 3일차/60일차 겨울/120일차 여름 웨이브 에스컬레이션 검증
