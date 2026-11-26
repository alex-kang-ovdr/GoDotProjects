# Don't Starve Together (DST) 정본 역기획서

> 작성일: 2026-11-26 | 대상 브랜치: `Forge-GameDev-DontStarveTogether` | 문서 수: 15편 (`00`~`13`, `90`)  
> 1차 분석 대상: 로컬 Steam PC 설치본 `C:\Program Files (x86)\Steam\steamapps\common\Don't Starve Together\`  
> 빌드 식별: Steam AppID `322330` · `buildid` `26797476` · Depot `322331` Manifest `55127838891314407` · `version.txt` `763928`

---

## 1. 문서집 목적과 범위

이 문서집은 Klei Entertainment의 멀티플레이어 협동 생존 게임 **Don't Starve Together (DST)**의 로컬 설치본(`data/databundles/scripts.zip` 내 4,095개 Lua 스크립트, 70개 `.ksh` 셰이더, 7,225개 KAnim 파일, 213개 FMOD 오디오 뱅크, 1,347개 UI/텍스처 아틀라스)을 정적 분석해 작성한 **코드·데이터 검증 기반 역기획서**다.

- **핵심 차이점**: 공개 위키 요약이 아니라 실제 설치본의 `scripts/tuning.lua`, `scripts/components/*.lua`, `scripts/prefabs/*.lua`, `scripts/map/*.lua`, `scripts/networkclientrpc.lua` 등의 **실제 수식·상수·상태 전이**를 직접 대조했다.
- **저작권·자산 분리 원칙**: Klei의 원본 코드·텍스처·애니메이션·사운드 파일은 저장소에 복사하거나 재배포하지 않으며, 규칙·수치 사실·구조적 설계와 재구축을 위한 청사진만 기록한다. 상세 근거는 [90. 출처·검증 기록 및 빌드 인벤토리](90_sources_and_verification.md)를 참조한다.

---

## 2. 문서 표기 규칙

`AGENTS.md` 6절 및 `game-designer` 스킬의 증거 분리 원칙에 따라 모든 서술은 아래 4가지 태그로 구분한다.

| 표기 | 의미 |
|---|---|
| **[코드 확인]** | 설치본 `scripts.zip`의 실제 Lua 로직·함수·상태 전이에서 직접 확인한 사실 |
| **[데이터 확인]** | `tuning.lua`, `preparedfoods.lua`, `farm_plant_defs.lua`, `tiledefs.lua`, `shaders.zip`, `data/` 인벤토리 등에서 추출한 수치·테이블 사실 |
| **[설계 해석]** | 확인된 규칙이 협동 생존 경제·플레이어 의사결정·난이도 곡선에 미치는 기획적 의미 분석 |
| **[재구성 설계]** | PlayForge / Godot 4.7.2 환경에서 동등한 플레이 경험을 재현하기 위한 설계 제안 (원본 C++ 엔진 내부 구현 주장이 아님) |
| **[미검증]** | C++ 네이티브 바이너리(`dontstarve_steam_x64.exe` / `dontstarve_dedicated_server_nullrenderer_x64.exe`) 내부 구현이나 런타임 실측 플레이가 필요한 영역 |

---

## 3. 전체 문서 목차 (15편)

| 번호 | 문서 | 핵심 범위 |
|---:|---|---|
| 00 | [00_index.md](00_index.md) | 빌드 식별, 표기 규칙, 전체 목차, 핵심 디자인 통찰, 읽기 경로 |
| 01 | [01_overview_core_loop.md](01_overview_core_loop.md) | 제품 정의, 협동 생존 설계 기둥, 시간 규모별 플레이 루프, 시스템 의존성 |
| 02 | [02_time_seasons_environment.md](02_time_seasons_environment.md) | 16세그먼트(480초) 하루, 20일 달 주기, 4계절(20/15/20/15), 기온·체온·습기·산성비·빛 |
| 03 | [03_survival_stats_death.md](03_survival_stats_death.md) | 체력·허기·정신력 vs 달 계몽(`SANITY_MODE_LUNACY`), 최대체력 페널티(75%), 사망·유령·부활·게임모드 |
| 04 | [04_characters_skilltrees.md](04_characters_skilltrees.md) | 18인 + `wonkey` 전수 스탯·고유 기믹(WX-78 23모듈·완다 노화 등), 12인 스킬트리(15포인트) |
| 05 | [05_worldgen_biomes_shards.md](05_worldgen_biomes_shards.md) | 지상(Forest)·동굴(Caves)·바다(Ocean) 생성 파이프라인, 78종 타일, 다중 샤드(`Master`/`Caves`) |
| 06 | [06_resources_inventory_crafting.md](06_resources_inventory_crafting.md) | 308종 액션, 4장비 슬롯·스택 한도, 42종 테크트리, 37+ 프로토타이퍼·26개 제작 필터 |
| 07 | [07_food_cooking_farming_ranching.md](07_food_cooking_farming_ranching.md) | 50+11종 요리·4종 향신료·냄비 우선순위, 부패 배율표, 14작물 영양/7대 스트레스 농사, 비팔로 길들이기 |
| 08 | [08_combat_armor_planar.md](08_combat_armor_planar.md) | 전투 피해 파이프라인, DST 다중 방어구(`max` 흡수 + 비율 분배 + 0.7× 내구도), 평면 피해/방어 비선형 감쇄식, 진영 상성 |
| 09 | [09_creatures_bosses_rifts.md](09_creatures_bosses_rifts.md) | `Brain`/`BehaviourTree`/`StateGraph` AI, 하운드·웜 습격, 거인·레이드·균열 보스 전수 스탯, 달/그림자 균열 루프 |
| 10 | [10_seafaring_caves_endgame.md](10_seafaring_caves_endgame.md) | 보트 물리·돛 체감 공식(`0.7^k`)·해양 보스, 동굴·유적·악몽 주기(12/3/5/2)·아카이브·볼트, 2축 엔드게임 |
| 11 | [11_multiplayer_network_architecture.md](11_multiplayer_network_architecture.md) | 서버 권한(`ismastersim`), 19종 `replica`·`classified`, 110종 Client RPC + Shard RPC, 이동 예측·틱 루프 |
| 12 | [12_ui_camera_audio_rendering.md](12_ui_camera_audio_rendering.md) | 2.5D `FollowCamera` 투영식, KAnim 파이프라인, 70종 `.ksh` 셰이더(3중 ColourCube), FMOD 오디오, L10N |
| 13 | [13_godot_rebuild_plan_qa.md](13_godot_rebuild_plan_qa.md) | Godot 4.7.2 / PlayForge 아키텍처 매핑, 저사양/웹 성능 예산, M0~M5 구현 로드맵, 경계 조건 QA 기준 |
| 90 | [90_sources_and_verification.md](90_sources_and_verification.md) | 스냅샷 인벤토리, 코드 출처 인덱스, 라이선스 경계, 미검증 항목 |

---

## 4. 이 역기획에서 도출한 DST 핵심 설계 통찰

1. **싱글플레이(DS)의 확장판이 아니라 "협동·장기 서비스·엔드게임 2축"으로 재설계된 별개 경제**
   - 방어구 내구도 `0.7×`(`multiplayer_armor_durability_modifier = 0.7`) 및 다중 방어구 비중첩(`max(amt)` 흡수 + 비율 내구도 분배), 보스 체력 2~10배 상향(예: 디어클롭스 4,000, 드래곤플라이 27,500, 토드스툴 52,500, 미저러블 99,999), 유령(`playerghost`)의 아군 정신력 지속 감소(`SANITY_GHOST_PLAYER_DRAIN`)와 부활 시 최대 체력 25% 페널티가 "개인 생존"을 "파티 자원 관리와 역할 분담"으로 전환한다.
2. **이중 정신력 축(Insanity vs Lunacy)과 이중 엔드게임 축(Shadow vs Lunar)**
   - 같은 수치 바가 지역/효과에 따라 **광기(`SANITY_MODE_INSANITY`, ≤15% 위험)**와 **계몽(`SANITY_MODE_LUNACY`, ≥85% 위험)**으로 반전된다.
   - 후반 균열(`riftspawner.lua`) 이후에는 일반 물리 피해를 `(sqrt(4d + 64) - 8) * 4`로 비선형 감쇄하는 **평면 개체(`planarentity`)**와 고정 방어/피해 축(**Planar Damage / Planar Defense**)이 도입되어, 초반 물리 장비 인플레이션을 억제하면서 Shadow/Lunar 진영 세트 장비와 스킬트리 진영 선택(`allegiance`)으로 자연스럽게 연결된다.
3. **데이터 주도·컴포넌트 합성 아키텍처가 1,621개 프리팹과 308개 액션을 지탱한다**
   - `EntityScript` + 835개 `components` + 264개 `stategraphs` + 199개 `brains` + 29개 `behaviours` + 42종 `techtree`가 결합되어 있어, 새로운 보스·작물·스킬·이벤트가 기존 상호작용 규칙(불, 젖음, 온도, 부패, 평면 피해, 진영 상성)과 자동으로 창발적 상호작용을 일으킨다.
4. **지상(`Master`)과 동굴(`Caves`)의 2-Shard 분산 프로세스 구조**
   - DST는 단일 거대 월드 대신 지상과 동굴을 별도 서버 프로세스(샤드)로 분리하고 `ShardNetworking`과 `SHARD_RPC`로 시간·계절·보스 처치·머름킹 상태·플레이어 마이그레이션을 동기화한다. 이 경계를 이해하는 것이 멀티플레이 재구축의 핵심이다.

---

## 5. 권장 읽기 경로

| 목적 | 권장 순서 |
|---|---|
| 게임 핵심 루프·생존 규칙 파악 | `01` → `02` → `03` → `07` → `08` |
| 캐릭터·메타 성장·엔드게임 분석 | `04` → `08` → `09` → `10` |
| 월드·콘텐츠·시스템 데이터 참조 | `05` → `06` → `07` → `09` |
| 엔진·멀티플레이·렌더링 기술 분석 | `11` → `12` → `05` → `90` |
| Godot 4.7.2 / PlayForge 구현 착수 | `01` → `11` → `12` → `13` → (세부 시스템 문서 참조) |
