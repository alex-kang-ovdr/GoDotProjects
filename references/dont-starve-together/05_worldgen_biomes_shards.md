# 05. 월드 생성, 바이옴, 타일과 다중 샤드(Shard) 구조

> 상위 문서: [00. 목차](00_index.md) | 1차 출처: `scripts/map/levels/forest.lua`, `scripts/map/tasksets/forest.lua`, `scripts/map/tasksets/caves.lua`, `scripts/map/ocean_gen_config.lua`, `scripts/tiledefs.lua`, `scripts/shardnetworking.lua`, `scripts/worldsettings_overrides.lua`

---

## 1. 월드 생성 파이프라인 개요 (`[코드 확인]`)

DST의 월드는 `scripts/map/` 아래 447개 파일(레벨 4, 태스크셋 4, 태스크 10, 룸 42, 정적 레이아웃 343개 등)로 구성된 **그래프 토폴로지 → 보로노이/노이즈 타일화 → 세트피스 배치 → 바다 생성 → 프리팹 스폰** 파이프라인으로 만들어진다.

```mermaid
flowchart LR
    A["Level 프리셋 (forest/caves)"] --> B["TaskSet 선택 (필수 Task + 무작위 Optional Task)"]
    B --> C["Task 내부 Room 그래프 연결 (Lock & Key)"]
    C --> D["2D 타일 그리드 투영 + 노이즈 경계 혼합"]
    D --> E["Set Pieces & Static Layouts 배치 (343종 풀)"]
    E --> F["Ocean Gen (지상 전용: 6해역 Perlin Noise + Gaussian Blur)"]
    F --> G["Required Prefabs 검증 + 엔티티 스폰"]
```

---

## 2. 지상 세계 (Forest Shard) 구성 (`[데이터 확인]`)

`scripts/map/tasksets/forest.lua` (`default` 태스크셋)와 `scripts/map/levels/forest.lua` (`SURVIVAL_TOGETHER`) 기준:

### 2.1 필수 태스크 (15개 = 본토 10 + 달섬 5)
- **본토 10개**: `Make a pick`(시작 태스크), `Dig that rock`, `Great Plains`(사바나/비팔로), `Squeltch`(늪지), `Beeeees!`, `Speak to the king`(돼지왕/낙엽수림), `Forest hunters`, `Badlands`(드래곤플라이 사막), `For a nice walk`, `Lightning Bluff`(오아시스 사막/번개염소).
- **달섬 5개 (해상 분리 대륙)**: `MoonIsland_IslandShards`, `MoonIsland_Beach`, `MoonIsland_Forest`, `MoonIsland_Baths`, `MoonIsland_Mine`.

### 2.2 선택 태스크 (10개 풀 중 `numoptionaltasks = 5`개 무작위 선정)
`Befriend the pigs`, `Kill the spiders`, `Killer bees!`, `Make a Beehat`, `The hunters`, `Magic meadow`, `Frogs and bugs`, `Mole Colony Deciduous`, `Mole Colony Rocks`, `MooseBreedingTask`.

### 2.3 필수 프리팹 및 주요 세트피스
- **필수 프리팹 (`required_prefabs`)**: `gravestone`, `sculpture_rook`, `sculpture_bishop`, `sculpture_knight` (그림자 기물), `terrariumchest` (테라리아 콜라보), `charlie_stage_post` (찰리 무대), `statueharp_hedgespawner`, `balatro_machine` (발라트로 콜라보 기계).
- **고정 수량 세트피스 (`set_pieces`)**:
  - `CaveEntrance`: **10개** (동굴 샤드 연결 싱크홀)
  - `WormholeGrass`: **8개** (4쌍 웜홀)
  - `MooseNest`: **9개** (봄 거인 둥지)
  - `ResurrectionStone`: **2개** (부활의 제단)
  - 달섬 전용: `MoonAltarRockGlass/Idol/Seed` 각 1개, `BathbombedHotspring` 1개, `MoonFissures` 1개.
- **레벨 추가 세트피스 (`forest.lua`)**: 필수 2개(`Sculptures_1`, `Maxwell5`) + 무작위 4개(`Sculptures_2~5`, `Chessy_1~6`, `Maxwell1~7`, `Warzone_1~3`).

---

## 3. 동굴 세계 (Caves Shard) 구성 (`[데이터 확인]`)

`scripts/map/tasksets/caves.lua` (`CAVE_DEFAULT`) 기준, 지상의 10개 동굴 입구와 1:1 매칭되는 10개의 출구 태스크를 포함해 **필수 태스크 32개 + 선택 태스크 18개 중 8개**로 구성된다.

- **일반 동굴 구역**: `MudWorld`, `MudCave`, `MudLights`, `MudPit`, `BigBatCave`, `RockyLand`, `RedForest`, `GreenForest`, `BlueForest`, `SpillagmiteCaverns`, `CaveExitTask1~10`.
- **보스·특수 구역**: `ToadStoolTask1~3` (토드스툴 3후보지), `CentipedeCaveTask` (지네 굴), `MoonCaveForest` (달 버섯 숲), `ArchiveMaze` (고대 아카이브 미로, `archive_worldgen.lua`).
- **고대 유적(Ruins) 구역**: `LichenLand`, `Residential`, `Military`, `Sacred`, `TheLabyrinth` (고대 수호자 미궁), `SacredAltar`, `AtriumMaze` (고대 연료직공 아트리움 — `tentacle_pillar_atrium` 거대 촉수로만 진입).
- **추가 세트피스**: `TentaclePillar` 10개(지하 웜홀 역할), `ResurrectionStone` 2개, `batbosscave`, 고대 금고(`vault_lobby`, `vault_vault` 등).

---

## 4. 바다 생성 알고리즘 (`ocean_gen_config.lua`) (`[코드 확인]`)

지상 월드 외곽과 섬들 사이는 `scripts/map/ocean_gen.lua`(792행)와 `ocean_gen_config.lua`가 생성한다.

1. **육지 경계 확장**: `shallowRadius = 4` 타일 반경으로 연안(`OCEAN_COASTAL`)을 확보하고, `ocean_prefill_setpieces_min_land_dist = 5`로 해상 특수 섬(은둔자섬 `hermitcrab_01`, 원숭이섬 `monkeyisland_01`, 소금 지대, 수몰림 `OCEAN_WATERLOG` 등)의 최소 이격 거리를 보장한다.
2. **Perlin Noise 맵**: `noise_octave_water = 6`, `noise_persistence_water = 0.5`, `noise_scale_water = 3`으로 해역 깊이 노이즈를 생성한다.
3. **고도 매핑 + Gaussian Blur (`kernelSize = 15, sigma = 3.0`)**:
   - 고도값: `OCEAN_BRINEPOOL(1.0)`, `OCEAN_COASTAL(0.9)`, `OCEAN_SWELL(0.4)`, `OCEAN_ROUGH(0.0)`, `OCEAN_HAZARDOUS(0.0)`, `IMPASSABLE(0.0)`.
   - 블러 후 최종 임계값: `> 0.45` 연안(Shallow), `> 0.05` 너울(Medium/Swell), 이하 거친 바다(Rough/Deep).

---

## 5. 타일 시스템 (`tiledefs.lua`) (`[데이터 확인]`)

`scripts/tiledefs.lua`에는 `AddTile`로 **총 78종의 `WORLD_TILES`**가 등록되어 있다.

| 분류 | 주요 타일 ID 예시 |
|---|---|
| **해양 (8종+)** | `OCEAN_COASTAL_SHORE`, `OCEAN_COASTAL`, `OCEAN_WATERLOG`, `OCEAN_BRINEPOOL`, `OCEAN_SWELL`, `OCEAN_ROUGH`, `OCEAN_HAZARDOUS`, `OCEAN_ICE` |
| **지상 자연 (13종+)** | `GRASS`, `FOREST`, `SAVANNA`, `MARSH`, `ROCKY`, `DIRT`, `DECIDUOUS`, `DESERT_DIRT`, `METEOR`, `PEBBLEBEACH`, `SHELLBEACH`, `MONKEY_GROUND`, `ROAD` |
| **동굴·유적·균열 (16종+)** | `CAVE`, `FUNGUS`, `FUNGUSRED`, `FUNGUSGREEN`, `FUNGUSMOON`, `SINKHOLE`, `UNDERROCK`, `VENT`, `MUD`, `ARCHIVE`, `VAULT`, `VAULT_CLEAN`, `BRICK`/`TILES`/`TRIM`(+`_GLOW`), `LUNAR_MARSH`, `SHADOW_MARSH`, `RIFT_MOON` |
| **인공 바닥·특수 (16종+)** | `WOODFLOOR`, `CARPET`, `CARPET2`, `CHECKER`, `SCALE`, `MOSAIC_GREY/RED/BLUE`, `BEARD_RUG`, `FARMING_SOIL`, `MONKEY_DOCK`, `ROPE_BRIDGE`, `WAGSTAFF_FLOOR`, `CHARLIE_VINE`, `COTL_BRICK/GOLD` |
| **이벤트/노이즈** | `LAVAARENA_*`, `QUAGMIRE_*`, `*_NOISE` (9종), `IMPASSABLE`, `FAKE_GROUND` |

---

## 6. 다중 샤드(Multi-Shard) 아키텍처 (`shardnetworking.lua`) (`[코드 확인]`)

DST는 지상과 동굴을 하나의 거대 맵에 합치지 않고 **별도의 서버 프로세스(Master Shard = Forest, Secondary Shard = Caves)**로 실행한다.

- **샤드 연결 (`Shard_OnShardConnected`)**: 세컨더리 샤드가 `REMOTESHARDSTATE.READY`가 되면 마스터 샤드가 `Shard_SyncWorldSettings`로 동기화 대상 월드 설정(계절, 낮밤, 난이도 등)을 `SHARD_RPC.SyncWorldSettings`로 전송한다.
- **샤드 간 동기화 RPC (`networkclientrpc.lua`)**:
  - `SyncWorldSettings` / `ResyncWorldSettings`
  - `SyncWorldStateTag` (균열 활성화 태그 등)
  - `SyncBossDefeated`, `SyncCharlieDefeated`
  - `SyncMermKingExists`, `SyncMermKingTrident/Crown/Pauldron` (어인왕 버프는 지상/동굴 전역 적용!)
  - `ShardTransactionSteps` / `PruneShardTransactionSteps` (샤드 간 플레이어/아이템 이동 트랜잭션 정합성 보장)
  - `ReskinWorldMigrator`
- **월드 설정 오버라이드 (`worldsettings_overrides.lua`)**: 보스·몬스터·자원 재생성·이벤트 등 **145개 항목**의 난이도/빈도를 세밀하게 제어 가능.

**[설계 해석]** 2-Shard 구조 덕분에 지상에 6명이 있든 동굴에 2명이 분리 탐색하든 각 프로세스가 독립 시뮬레이션 루프와 메모리를 유지할 수 있고, 플레이어가 싱크홀(`MIGRATE` 액션)을 타면 `WorldMigrator` ID를 통해 대응 출구로 안전하게 트랜잭션 이관된다.
