# 06. 자원, 308종 액션, 인벤토리와 제작·테크트리

> 상위 문서: [00. 목차](00_index.md) | 1차 출처: `scripts/actions.lua`, `scripts/constants.lua`, `scripts/tuning.lua`, `scripts/techtree.lua`, `scripts/recipes.lua`, `scripts/recipes_filter.lua`

---

## 1. 액션(Action) 기반 상호작용 모델 (`[코드 확인]`)

DST의 모든 게임플레이 조작은 하드코딩된 UI 버튼이 아니라 **`Entity` + `Component` + `BufferedAction`** 조합으로 동적 해석되는 **308개 `ACTIONS`** (`scripts/actions.lua`)로 구동된다.

| 도메인 | 대표 액션 ID (`actions.lua`) |
|---|---|
| **채집·작업** | `CHOP`, `MINE`, `DIG`, `HAMMER`, `PICK`, `PICKUP`, `NET`, `SHAVE`, `SCYTHE`, `TERRAFORM`, `TERRAFORM_REMOVE`, `SWEEP` |
| **전투·마법** | `ATTACK`, `CASTSPELL`, `CASTAOE`, `CAST_SPELLBOOK`, `CAST_POCKETWATCH`, `BLINK`, `BLINK_MAP`, `DASH`, `JOUST`, `UNPIN` |
| **생존·조리·농사** | `EAT`, `COOK`, `DRY`, `ADDFUEL`, `LIGHT`, `EXTINGUISH`, `SMOTHER`, `SLEEPIN`, `HEAL`, `TILL`, `PLANTSOIL`, `POUR_WATER`, `FERTILIZE`, `ASSESSPLANTHAPPINESS`, `PLANTREGISTRY_RESEARCH` |
| **항해·낚시** | `ROW`, `RAISE_SAIL`, `LOWER_SAIL`, `RAISE_ANCHOR`, `LOWER_ANCHOR`, `STEER_BOAT`, `REPAIR_LEAK`, `BOAT_CANNON_LOAD_AMMO`, `BOAT_CANNON_SHOOT`, `OCEAN_FISHING_CAST`, `OCEAN_FISHING_REEL`, `OCEAN_TRAWLER_LOWER` |
| **협동·부활·이동** | `GIVE`, `GIVETOPLAYER`, `GIVEALLTOPLAYER`, `FEEDPLAYER`, `HAUNT`, `REVIVE_CORPSE`, `REMOTERESURRECT`, `MIGRATE`, `JUMPIN`, `JUMPIN_MAP`, `ATTUNE`, `STARTVAULTORBTELEPORT` |
| **캐릭터 전용** | `APPLYMODULE`/`REMOVEMODULE`(WX-78), `ENTER_GYM`/`LIFT_DUMBBELL`(볼프강), `SING`(위그프리드), `MODSLINGSHOT`/`WOBY_PICKUP`(월터), `USE_WEREFORM_SKILL`(우디), `APPLYELIXIR`(웬디), `MUTATE_SPIDER`(웨버), `MAKEBALLOON`(웨스) |

---

## 2. 인벤토리, 장비 슬롯과 스택 한도 (`[데이터 확인]`)

### 2.1 장비 슬롯 (`constants.lua:46–52`)
```lua
EQUIPSLOTS = { HANDS = "hands", HEAD = "head", BODY = "body", BEARD = "beard" }
```
- **핵심 트레이드오프 (`[설계 해석]`)**: 가방(Backpack)과 몸통 방어구·겨울 외투가 모두 **`BODY` 슬롯 하나를 공유**한다! 즉 전투 시 방어구를 입거나 겨울에 보온 외투를 입으면 가방을 바닥에 내려놓아야 하며, 이는 "인벤토리 여유 ↔ 방어력 ↔ 보온" 사이의 핵심 기획적 갈등을 만든다.
- `BEARD` 슬롯은 윌슨(수염 저장 스킬) 등 특수 캐릭터 전용 보조 보관함으로 활용된다.

### 2.2 중첩(Stack) 한도 5단계 (`tuning.lua:81–85`)
| 상수 | 최대 중첩 수 | 대표 품목 |
|---|---:|---|
| `STACK_SIZE_LARGEITEM` | **10** | 통나무(일부)·대형 아이템·돌벽/일부 구조물 키트 |
| `STACK_SIZE_MEDITEM` | **20** | 목재, 판자, 석재, 금덩이, 육류 |
| `STACK_SIZE_SMALLITEM` | **40** | 풀, 잔가지, 부싯돌, 베리, 씨앗, 악몽 연료 |
| `STACK_SIZE_TINYITEM` | **60** | 초소형 자원·특수 탄약/조각 |
| `STACK_SIZE_PELLET` | **120** | 월터 새총 탄약(Slingshot Ammo) |

- **도구 내구도 배율**: 황금 도구는 일반 도구 대비 `TUNING.GOLDENTOOLFACTOR = 4`배 내구도 (`tuning.lua:95`).

---

## 3. 제작(Crafting)과 42종 테크트리 (`[데이터 확인]`)

`scripts/recipes.lua`(1,770행)에는 **`Recipe2` 958개**, **`DeconstructRecipe` 150개**, **`PROTOTYPER_DEFS` 37종(+9개 축제 신단 별칭 = 46종)**이 등록되어 있으며, `scripts/techtree.lua`는 **42개 테크 축**을 정의한다.

### 3.1 프로토타이핑(Prototyping) vs 스테이션 전용 제작 (`is_crafting_station`)
`PROTOTYPER_DEFS` (`recipes.lua:5–59`)는 제작 시설을 두 부류로 엄격히 구분한다.

| 구분 | `is_crafting_station` | 작동 방식 (`[코드 확인]`) | 해당 시설 예시 |
|---|---|---|---|
| **프로토타이퍼 (연구형)** | `false` | 시설 옆에서 최초 1회 제작 시 레시피를 영구 학습(최초 제작 시 정신력 `+15` 보너스), 이후 어디서나 제작 가능 | 과학 기계(`researchlab`), 연금술 엔진(`researchlab2`), 요술 모자 장치(`researchlab4`), 그림자 조종기(`researchlab3`), 사색 탱크(`seafaring_prototyper`), 낚시 도구함(`tacklestation`), 테라퍼마(`turfcraftingstation`), 책장(`bookstation`) |
| **크래프팅 스테이션 (현장형)** | `true` | 학습 불가 — **반드시 해당 시설/NPC 옆에 서 있을 때만** 제작·거래 가능 | 고대 유사과학 스테이션(`ancient_altar`), 천상의 제단(`moon_altar*`), **브라이트셰이드 대장간(`lunar_forge`)**, **그림자 대장간(`shadow_forge`)**, 와그펑크 작업대(`wagpunk_workstation`), 목공소(`carpentry_station`), 지도 제작대(`cartographydesk`), 조각대(`sculptingtable`), 은둔자 상점(`hermitcrab`), 떠돌이 상인(`wanderingtrader`), 볼트 정제대(`vault_refiner_pedestal`), 휴대용 분쇄기(`portableblender`), 맥스웰의 책(`waxwelljournal`) |

### 3.2 보너스 테크 (`BONUS_TECH`, `techtree.lua:384–391`)
캐릭터 패시브(예: 위커바텀 `SCIENCE +1`)나 아이템(예: 영리함의 뇌 모자)으로 테크 레벨 가산이 허용되는 축은 오직 5개뿐이다: `SCIENCE`, `MAGIC`, `SEAFARING`, `ANCIENT`, `MASHTURFCRAFTING`.

### 3.3 26개 제작 메뉴 필터 (`scripts/recipes_filter.lua`)
`FAVORITES`, `CRAFTING_STATION`, `SPECIAL_EVENT`, `MODS`, `CHARACTER`, `TOOLS`, `LIGHT`, `PROTOTYPERS`, `REFINE`, `WEAPONS`, `ARMOUR`, `CLOTHING`, `RESTORATION`, `MAGIC`, `DECOR`, `STRUCTURES`, `CONTAINERS`, `COOKING`, `GARDENING`, `FISHING`, `SEAFARING`, `RIDING`, `WINTER`, `SUMMER`, `RAIN`, `EVERYTHING`.

- **[설계 해석]** 과거 싱글플레이 DS의 "좌측 고정 탭 10개" 구조는 레시피가 958개까지 늘어난 DST에서 완전히 개편되었다. 검색·즐겨찾기·상황별 필터(`WINTER`/`SUMMER`/`RAIN`/`SEAFARING`)와 핀(Pin) 고정 HUD가 도입되어 멀티플레이 실시간 전투/계절 대응 속도를 높였다.
