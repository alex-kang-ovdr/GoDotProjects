# 90. 출처, 로컬 빌드 인벤토리 및 검증 기록

> 상위 문서: [00. 목차](00_index.md) | 조사·검증일: 2026-11-26

---

## 1. 1차 로컬 설치본 스냅샷 식별 (`[데이터 확인]`)

이 역기획서의 모든 코드·수치 사실은 아래 단일 Windows Steam 설치본에서 읽기 전용 정적 분석으로 직접 확인했다.

| 식별 항목 | 확인 값 | 출처 파일 |
|---|---|---|
| 제품명 / AppID | Don't Starve Together / `322330` | `C:\Program Files (x86)\Steam\steamapps\appmanifest_322330.acf` |
| 설치 경로 | `C:\Program Files (x86)\Steam\steamapps\common\Don't Starve Together\` | 로컬 디렉터리 |
| Steam `buildid` / `TargetBuildID` | `26797476` / `26797476` (일치) | `appmanifest_322330.acf` |
| Depot `322331` Manifest | `55127838891314407` (`SizeOnDisk: 4,525,400,962` bytes) | `appmanifest_322330.acf` |
| 게임 내부 버전 | `763928` | `version.txt` |
| 실행 바이너리 (x64) | `bin64/dontstarve_steam_x64.exe` (7,183,360 B)<br>`bin64/dontstarve_dedicated_server_nullrenderer_x64.exe` (6,537,216 B) | `bin64/` |

---

## 2. 데이터 디렉터리 및 아카이브 전수 인벤토리 (`[데이터 확인]`)

| 경로 / 번들 | 파일 수 | 크기 (MB) | 주요 포맷 / 구성 |
|---|---:|---:|---|
| `data/databundles/scripts.zip` | **4,109** | 54.76 | `.lua` 4,095, `.po` 12, `.pot` 1, `.vdf` 1 |
| └ `scripts/prefabs/` | 1,621 | — | 월드 오브젝트·캐릭터·보스·장비·스킬트리 정의 |
| └ `scripts/components/` | 835 | — | 핵심 게임플레이·생존·전투·환경·복제 컴포넌트 |
| └ `scripts/map/` | 447 | — | `levels`(4), `tasksets`(4), `tasks`(10), `rooms`(42), `static_layouts`(343) |
| └ `scripts/widgets/` & `screens/` | 274 + 136 | — | HUD·제작 UI·도감·스킬트리·로비 화면 |
| └ `scripts/stategraphs/` | 264 | — | 프레임 단위 상태 그래프 |
| └ `scripts/brains/` & `behaviours/` | 199 + 29 | — | AI 행동 트리 |
| └ `scripts/scenarios/` | 50 | — | 세트피스 함정/시나리오 |
| └ `scripts/languages/` | 15 | — | `strings.pot` + 12개 언어 `.po` (`korean.po` 포함) |
| `data/databundles/shaders.zip` | **70** | 0.09 | `.ksh` Klei 셰이더 70종 |
| `data/databundles/anim_dynamic.zip` | **3,439** | 16.55 | 동적 스킨 애니메이션 `.zip` |
| `data/databundles/images.zip` | **750** | 32.10 | `.xml` 682, `.tex` 68 |
| `data/databundles/fonts.zip` | **25** | 16.14 | 폰트 번들 |
| `data/databundles/bigportraits.zip` | **369** | 0.09 | 캐릭터 초상화 `.xml` |
| `data/anim/` | **7,225** | 1,557.89 | `.zip` 3,692 (`anim.bin`+`build.bin`+`atlas-0.tex`), `.dyn` 3,533 |
| `data/images/` | **1,347** | 1,007.23 | `.tex` 1,002, `.xml` 345 |
| `data/sound/` | **213** | 1,000.40 | FMOD `.fev` 58, `.fsb` 155 (`rifts1`~`rifts8`, `yoth_2026`, `balatro` 포함) |
| `data/bigportraits/` | **377** | 268.06 | `.tex` 373, `.xml` 4 |
| `data/movies/` | **1** | 102.83 | `.ogv` 영상 |
| `data/levels/` | **164** | 78.36 | 지형 타일 텍스처 `.tex` 136, `.xml` 27 |
| `data/minimap/` | **8** | 18.78 | 미니맵 아틀라스 `.tex` 4, `.xml` 4 |
| `data/haptics/` | **1,762** | 5.15 | 컨트롤러 햅틱 `.wav` |
| `data/fx/` | **24** | 3.37 | 이펙트 `.tex` |

---

## 3. 핵심 수치·수식별 1차 소스코드 검증 인덱스

| 검증 대상 | `scripts.zip` 내 경로 및 행 번호 |
|---|---|
| 하루 16세그(`480s`), `wilson_*`, `multiplayer_armor_durability_modifier = 0.7`, 스택 5단계 | `scripts/tuning.lua` L19–130 |
| 캐릭터 18+1인 로스터, 장비 4슬롯, 충돌 마스크, 식품/연료/재료 상수 | `scripts/constants.lua` (`DST_CHARACTERLIST`, `EQUIPSLOTS`, `COLLISION`, `FOODTYPE`, `FUELTYPE`) |
| 게임모드(`survival`, `lavaarena`, `quagmire`) 및 리셋 시간 `{120, 180}` | `scripts/gamemodes.lua` L195–318 |
| 16세그 시계 동기화, 20일 달 주기(`MOON_PHASE_CYCLES`) | `scripts/components/clock.lua` L11–96, L322–390 |
| 4계절 길이(20/15/20/15) 및 기준 세그먼트(`DEFAULT_CLOCK_SEGS`) | `scripts/tuning.lua` L2228–2231, `scripts/components/seasons.lua` L17–46 |
| 세계 기온 범위(`-25~95°C`)·시간대 보정(`+5/-6°C`), 체온 수렴식 | `scripts/components/worldtemperature.lua` L17–29, `scripts/components/temperature.lua` L311–402 |
| 습기 히스테리시스(`35`/`15`)·건조식·산성비 | `scripts/components/moisture.lua` L253–340, `scripts/tuning.lua` L483–485, L7746–7756 |
| 체력 페널티 상한(`0.75`)·`DoDelta`, 허기 1초 틱, 광기(`15%/17.5%`) vs 계몽(`85%/82.5%`) | `scripts/components/health.lua` L460–649, `hunger.lua` L4–140, `sanity.lua` L146–446 |
| WX-78 23모듈, 12인 스킬트리 및 15포인트 `SKILL_THRESHOLDS` | `scripts/wx78_moduledefs.lua`, `scripts/skilltreedata.lua` L50–90, `scripts/prefabs/skilltree_*.lua` |
| 지상/동굴 태스크셋, 바다 생성, 78종 타일, 145종 월드 설정 | `scripts/map/tasksets/{forest,caves}.lua`, `scripts/map/ocean_gen_config.lua`, `scripts/tiledefs.lua`, `scripts/worldsettings_overrides.lua` |
| 308종 액션, 42종 테크트리, 958 `Recipe2`, 150 `DeconstructRecipe`, 37+9 `PROTOTYPER_DEFS`, 26필터 | `scripts/actions.lua`, `scripts/techtree.lua`, `scripts/recipes.lua`, `scripts/recipes_filter.lua` |
| 50 일반 + 11 왈리 요리, 4향신료, 냄비 판정, 부패 배율, 14작물 7스트레스(`<=1` 거대작물) | `scripts/cooking.lua`, `preparedfoods*.lua`, `spicedfoods.lua`, `components/perishable.lua`, `prefabs/farm_plant_defs.lua`, `prefabs/farm_plants.lua`, `components/farmplantstress.lua` |
| 전투 피해식, 다중 방어구(`max` 흡수 + 비율 내구도 분배), 평면 감쇄 `(sqrt(4d+64)-8)*4` | `scripts/components/combat.lua` L570–1215, `inventory.lua` L408–460, `planarentity.lua` L901–907, `planardamage.lua`, `planardefense.lua` |
| 보스 전수 스탯, 균열 스포너, 악몽 주기(`12/3/5/2`), 보트 물리(`0.7^k`) | `scripts/tuning.lua`, `scripts/components/riftspawner.lua`, `nightmareclock.lua`, `boatphysics.lua` |
| 19종 복제 컴포넌트, 110종 RPC, 샤드 동기화, `WallUpdate`, `FollowCamera`, 3중 ColourCube | `scripts/entityreplica.lua`, `networkclientrpc.lua`, `shardnetworking.lua`, `update.lua`, `cameras/followcamera.lua`, `postprocesseffects.lua` |

---

## 4. 라이선스 및 자산 취급 원칙

- Don't Starve Together의 실행 파일·Lua 스크립트·KTEX 텍스처·KAnim 애니메이션·FMOD 오디오·로컬라이제이션 문구의 지식재산권은 Klei Entertainment에 귀속된다.
- 본 저장소에는 설치본의 원본 파일이나 추출 자산을 복사·포함하지 않았으며, 오직 정적 분석으로 도출한 **게임 규칙·수치 사실·시스템 구조 분석 및 독립 재구축 설계 문서**만 기록한다.

---

## 5. 미검증 항목 (`[미검증]`)

1. **C++ 네이티브 엔진 내부 (`dontstarve_steam_x64.exe` / `dontstarve_dedicated_server_nullrenderer_x64.exe`)**: 물리 엔진(Box2D/충돌 솔버), 네트워크 패킷 직렬화/압축(RakNet/Steam Networking), KAnim 바이너리 렌더러, KTEX 디코더의 C++ 내부 구현은 바이너리 역어셈블을 수행하지 않았다.
2. **런타임 플레이 실측**: 본 조사는 정적 스크립트·에셋 분석이며, 실제 6인 멀티플레이 부하·프레임 타임·네트워크 대역폭 실측 및 플레이테스트 검증은 수행하지 않았다.
3. **향후 Steam 패치 변동**: 설치본은 `buildid 26797476` / `v763928` 기준 스냅샷이며, 향후 업데이트 시 `tuning.lua` 및 신규 스킬트리/균열 콘텐츠가 변경될 수 있다.
