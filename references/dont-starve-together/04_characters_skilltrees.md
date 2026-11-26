# 04. 플레이어블 캐릭터(18+1인)와 스킬트리 시스템

> 상위 문서: [00. 목차](00_index.md) | 1차 출처: `scripts/constants.lua`, `scripts/tuning.lua`, `scripts/prefabs/<char>.lua`, `scripts/skilltreedata.lua`, `scripts/prefabs/skilltree_*.lua`, `scripts/wx78_moduledefs.lua`

---

## 1. 전체 캐릭터 로스터 및 기본 스탯표 (`[데이터 확인]`)

`scripts/constants.lua`의 `DST_CHARACTERLIST`에는 플레이어블 캐릭터 **18명**과 저주 변신 전용 숨겨진 캐릭터 **`wonkey`** (`SEAMLESSSWAP_CHARACTERLIST`)까지 총 **19종**이 등록되어 있다.

| ID | 캐릭터 | 체력(HP) | 허기(Hunger) | 정신력(Sanity) | 전투/작업 계수 | 스킬트리 | 핵심 고유 기믹 (`[코드 확인]`) |
|---|---|---:|---:|---:|---|---|---|
| `wilson` | 윌슨 | 150 | 150 | 200 | 1.0× | **있음 (~33노드)** | 수염 성장(보온·수염 슬롯 저장), 횃불·연금술(자원 변환)·진영 스킬 |
| `willow` | 윌로우 | 150 | 150 | 120 | 1.0× (정신력 감소 1.1×) | **있음 (~32노드)** | 라이터(요리·불꽃 흡수), 버니(광기 시 거대화 탱킹), 화염 면역 / 동사 2배 빠름(`60s`), 과열 느림(`180s`) |
| `wolfgang` | 볼프강 | 200 *(기본)* | 200 | 200 | 0.75× / 1.0× / 2.0× (근력 단계) | **있음 (~29노드)** | 근력(Mightiness) 게이지·덤벨·체육관(`ENTER_GYM`), 어둠/괴물 정신력 감소 `1.1×` |
| `wendy` | 웬디 | 150 | 150 | 200 | **0.75×** (정신력 감소 `0.75×`) | **있음 (~25노드)** | 아비게일 소환·교감(`CASTSUMMON`), 망령의 묘약(`APPLYELIXIR`), 시스턴(Sisturn) |
| `wx78` | WX-78 | **100** *(기본)* | **100** *(기본)* | **100** *(기본)* | 1.0× (모듈 가변) | **있음 (~27노드)** | **바이오 스캔라이저 + 23종 회로 모듈**(`wx78_moduledefs.lua`, 6충전 슬롯), 빗물 피해·스파크, 기어 섭취 |
| `wickerbottom` | 위커바텀 | 125 | 150 | **250** | 1.0× | 미구현 | 과학 +1 패시브, 마법 서적 제작/독서(`BOOKCRAFT`·책장), 불면증(수면 불가), 상한 음식 페널티 증폭 |
| `woodie` | 우디 | 150 | 150 | 200 | 1.0× | **있음 (~32노드)** | 루시(무한 도끼), 3종 저주 변신(비버·거위·무스 — `MOOSE_PLANAR_DEF=15`, `MOOSE_SMASH_PLANAR_DAMAGE=80`) |
| `wes` | 웨스 | **75** | **75** | **75** | **0.75×** (작업 `0.75×`, 하운드 표적 `2.0×`) | 미구현 | 의도적 하드모드 캐릭터(`WES_LUCK = -1`, 번개 확률 `0.6`, 졸음 해독 느림 `0.75×`), 풍선술(`MAKEBALLOON`) |
| `waxwell` | 맥스웰 | **75** | 150 | 200 | 1.0× | 미구현 | 그림자 책(`SHADOW` 스테이션), 그림자 일꾼/결투사/감옥/은신, 높은 자연 정신력 회복, 최대 정신력 페널티 관리 |
| `wathgrithr` | 위그프리드 | **200** | 120 | 120 | **1.25×** (받는 피해 경감) | **있음 (~27노드)** | 육식 전용(`FOODGROUP`), 영감(Inspiration)과 전투 노래(`SING`), 전용 창/투구/방패(`WATHGRITHR_SHIELD_ABSORPTION=0.85`) |
| `webber` | 웨버 | 175 | 175 | 100 | 1.0× | 미구현 | 거미 친화·변이(`MUTATE_SPIDER`), 거미 호루라기, 비단 수염, 몬스터 고기 페널티 면역 |
| `winona` | 위노나 | 150 | 150 | 200 | 1.0× | **있음 (~33노드)** | 빠른 제작(허기 소모), 투석기·발전기·탐조등(`WINONA_CATAPULT_PLANAR_DAMAGE=30~120`), 테이프, 찰리/와그스태프 분기 |
| `warly` | 왈리 | 150 | **250** | 200 | 1.0× (허기 소비 `1.2×`) | 미구현 | 조리 음식만 섭취 + 반복 식사 체감, 휴대용 냄비/분쇄기/향신료(`FOODPROCESSING`), **전용 요리 11종** |
| `wortox` | 워톡스 | **200** | 175 | 150 | 1.0× (오라 `0.5×`) | **있음 (~34노드)** | 영혼 수집(`WORTOX_MAX_SOULS=20`), 영혼 도약(`BLINK`/`BLINK_MAP`), 광역 치유, 일반 음식 효율 50%, 선/악 스킬 분기 |
| `wormwood` | 웜우드 | 150 | 150 | 200 | 1.0× | **있음 (~27노드)** | 땅에 직접 파종, 개화(이속/허기), 음식 체력 회복 불가(퇴비/연고로 회복), 작물 상태 즉시 감지(`plantkin`), 가시 갑옷(`ARMORBRAMBLE`) |
| `wurt` | 워트 | 150 *(왕: 250)* | 200 *(왕: 250)* | 150 *(왕: 200)* | 1.0× (왕 버프/평면 버프) | **있음 (~29노드)** | 채식 전용, 늪지 이속·촉수 감지, 어인 왕국 건설(`merm_armory` 등), 젖음 면역·물고기 보너스 |
| `walter` | 월터 | 130 | 110 | 200 | 원거리 특화 | **있음 (~30노드)** | 워비(탑승·이동 상자), 새총+탄약 개조(`MODSLINGSHOT`, 최대 `68+30` 평면), **피격 시 체력 비례 정신력 감소**(`WALTER_SANITY_DAMAGE_RATE=2`), 어둠·오라 면역 |
| `wanda` | 완다 | **60 (20~80세 `oldager`)** | 175 | 200 | 연령별 가변(노년 그림자 공격 강화) | 미구현 | 체력 대신 **나이(`20~80세`, `OLDAGE_HEALTH_SCALE=60/150`)** 사용. 일반 치유 무효, 회중시계(`CAST_POCKETWATCH`)로 회귀·부활·워프·채찍(`wilson_attack × 2.4 = 81.6`) |
| `wonkey` | 웡키 *(변신)* | 125 | 175 | 100 | 기본 이속 `-0.5`, 질주 `+2.5` (`3s` 후), 질주 허기 `1.33×` | 없음 | 저주받은 장신구 10개 누적 시 강제 변신. 원숭이 섬 해적과 우호적, 바나나로 저주 해제 가능 |

> **[코드 확인 참고]** `scripts/prefabs/winona.lua`에서는 내부적으로 `TUNING.WENDY_HEALTH`(=150), `TUNING.WENDY_HUNGER`(=150), `TUNING.WENDY_SANITY`(=200) 상수를 공유 참조하며 `tuning.lua`의 `WINONA_HEALTH` 등도 동일 값(`150/150/200`)으로 정의된다.

---

## 2. WX-78 회로 모듈 시스템 (`wx78_moduledefs.lua`) (`[데이터 확인]`)

WX-78은 구버전 기어 영구 스탯 상승 대신 **충전 슬롯(기본 최대 6칸) + 탈착형 바이오 회로 23종**으로 리워크되었다.

| 슬롯 비용 | 등록 모듈 (`wx78_moduledefs.lua`) |
|---:|---|
| **1슬롯** | `maxhealth`, `maxsanity1`, `maxhunger1`, `radar`, `stacksize`, `light2`, `chess` |
| **2슬롯** | `maxhealth2`, `maxsanity`, `maxhunger`, `movespeed2`, `taser`, `digestion` |
| **3슬롯** | `heat`, `cold`, `light`, `music`, `bee`, `screech`, `spin` |
| **4슬롯** | `nightvision`, `shielding` |
| **6슬롯** | `movespeed` |

---

## 3. 캐릭터 스킬트리와 인사이트(Insight) 시스템 (`[코드 확인]`)

`scripts/skilltreedata.lua` (L50–90)와 `scripts/tuning.lua`의 `SKILL_THRESHOLDS`, 그리고 `scripts/prefabs/skilltree_*.lua` 12개 파일에서 확인한 메타 성장 구조다.

### 3.1 인사이트 포인트 획득 구조
- **총 포인트 상한**: **15 포인트** (`#TUNING.SKILL_THRESHOLDS = 15`).
- **경험치(일수) 구간 (`SKILL_THRESHOLDS`)**:
  ```lua
  { 3, 3, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5 }
  -- 누적: 3, 6, 10, 14, 18, 23, 28, 33, 38, 43, 48, 53, 58, 63, 68 (총 68일 플레이 시 15포인트 완성)
  ```
- **계정 귀속 & 네트워크 동기화**:
  - 포인트와 활성 스킬은 캐릭터별 프로필에 영구 저장되며, 서버 접속 시 `SetSkillActivatedState`, `AddSkillXP` RPC로 동기화된다.
  - 엔진의 32비트 비트필드(`SN_SKILLSELECTION`, `skilltreedata.lua:83`)로 타 플레이어에게 활성 스킬 구성을 전송(최대 32노드 기준).
  - 초기화(`RespecSkills`): 로비 캐릭터 선택 화면 또는 천상의 차원문(Celestial Portal)에서 무료 재배치 가능.

### 3.2 스킬트리 보유 12인 및 브랜치 구성 (`[데이터 확인]`)

| 캐릭터 | 파일 | 노드 수(약) | 주요 브랜치(Groups) |
|---|---|---:|---|
| 윌슨 | `skilltree_wilson.lua` | 33 | `torch`, `alchemy`, `beard`, `allegiance` |
| 윌로우 | `skilltree_willow.lua` | 32 | `lighter`, `bernie`, `allegiance` |
| 볼프강 | `skilltree_wolfgang.lua` | 29 | `might`, `training`, `planardamage`, `allegiance` |
| 웬디 | `skilltree_wendy.lua` | 25 | 아비게일·묘약·시스턴·진영 |
| 우디 | `skilltree_woodie.lua` | 32 | `human`, `curse`, `allegiance` |
| 위그프리드 | `skilltree_wathgrithr.lua` | 27 | `combat`, `arsenal`, `songs`, `beefalo`, `allegiance` |
| 위노나 | `skilltree_winona.lua` | 33 | `lowshelf`, `midshelf`, `charlie`, `wagstaff` |
| 웜우드 | `skilltree_wormwood.lua` | 27 | `gathering`, `crafting`, `allegiance1`, `allegiance2` |
| 워톡스 | `skilltree_wortox.lua` | 34 | `nice`, `neutral`, `naughty`, `allegiance` |
| 워트 | `skilltree_wurt.lua` | 29 | `amphibian`, `swampmaster`, `allegiance` |
| 월터 | `skilltree_walter.lua` | 30 | `camping`, `woby`, `slingshotammo`, `slingshotmods` |
| WX-78 | `skilltree_wx78.lua` | 27 | 회로·드론·방어막·`allegiance` |

### 3.3 진영 잠금 (`allegiance` 락) (`[설계 해석]`)
대부분의 스킬트리 하단에는 **그림자 친화(Shadow Allegiance — 고대 연료직공 격파 필요)**와 **달 친화(Lunar Allegiance — 천상의 대변자 격파 필요)**가 상호 배타적 분기로 배치되어 있다. 이는 단일 캐릭터가 모든 엔드게임 능력을 독점하지 못하게 막고, 파티 내 역할 분담과 리플레이 동기를 부여한다.
