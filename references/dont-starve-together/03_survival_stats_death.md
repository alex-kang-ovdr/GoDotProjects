# 03. 생존 스탯, 이중 정신력, 사망과 부활

> 상위 문서: [00. 목차](00_index.md) | 1차 출처: `scripts/components/health.lua`, `scripts/components/hunger.lua`, `scripts/components/sanity.lua`, `scripts/gamemodes.lua`, `scripts/tuning.lua`

---

## 1. 3대 생존 게이지 기준치 (Wilson 기준) (`[데이터 확인]`)

| 스탯 | 기준 상수 (`tuning.lua`) | 기본값 | 기본 감소/고갈 규칙 (`[코드 확인]`) |
|---|---|---:|---|
| **체력 (Health)** | `WILSON_HEALTH` | **150** | 자연 감소 없음. `0` 이하 시 사망(`health.lua:546`). 최대치 페널티 상한 `MAXIMUM_HEALTH_PENALTY = 0.75` (최소 25% 유지) |
| **허기 (Hunger)** | `WILSON_HUNGER` | **150** | `WILSON_HUNGER_RATE = 75 / 480 ≈ 0.15625/초` (1일 75 소비, 만복 시 2일 지속). `hunger.lua:4`에서 1초 주기 갱신(`UPDATE_PERIOD = 1`). `0` 도달 시 `STARVE_KILL_TIME = 120초` 기준 초당 `1.25` 체력 감소 |
| **정신력 (Sanity)** | `WILSON_SANITY` | **200** | 낮 자연 변화 `0`. 황혼/밤·오라·습기·유령 플레이어·의복(`dapperness`)·음식으로 증감. 최소 최대치 하한 `5` (`sanity.lua:208`) |

---

## 2. 체력(Health)과 최대 체력 페널티 (`[코드 확인]`)

`scripts/components/health.lua` (L460–649)에서 확인한 핵심 규칙:

1. **최대 체력 페널티 (`penalty`)**:
   - 유효 최대 체력: `GetMaxWithPenalty() = maxhealth - maxhealth * penalty` (`health.lua:525`).
   - 상한 클램프: `0 ~ TUNING.MAXIMUM_HEALTH_PENALTY (0.75)` (`health.lua:464`).
   - 발생 원인: 고백 심장(`telltale_heart`) 부활 `REVIVE_HEALTH_PENALTY = 0.25`, 플로리드 포스트언 부활 `PORTAL_HEALTH_PENALTY = 0.25`, 고기 우상 제작 등.
   - 해제 수단: 부스터 주사(`lifeinjector`)로 `MAX_HEALING_NORMAL = -0.25` (25%p) 회복 (`tuning.lua:2019`).
2. **체력 변동(`Health:DoDelta`) 처리 순서 (`health.lua:613–649`)**:
   - 비치사 설정 검사(`nonlethal_temperature`, `nonlethal_hunger`, `nonlethal_pct`)
   - `redirect` 훅 검사 (예: 완다의 `oldager`가 체력 피해를 노화 시간으로 리다이렉트)
   - 무적(`IsInvincible`) 및 텔레포트 중 무시
   - 음수(피해)이고 `ignore_absorb`가 아니면 자체 흡수율(`absorb`, PvP 시 `playerabsorb`) × 외부 흡수 배율(`externalabsorbmodifiers`) 적용 후 고정 경감(`externalreductionmodifiers`) 차감
   - `deltamodifierfn` 및 1회 최대 피해 상한(`maxdamagetakenperhit`) 적용
   - `SetVal` 실행 및 `"healthdelta"` 이벤트 발행

---

## 3. 허기(Hunger)와 아사 (`[코드 확인]`)

`scripts/components/hunger.lua` (L4–140):
- 매 `1초`(`UPDATE_PERIOD = 1`)마다 `DoDec(1)` 호출.
- 실제 소비율: `hungerrate * burnratemodifiers:Get()` (`SourceModifierList`로 곰가죽 조끼 `0.75×`, 슬러퍼 허리띠 `0.6×`, 캐릭터 보정 등을 곱연산 합성).
- `current <= 0` 진입 시 `"startstarving"` 이벤트 발행, 회복 시 `"stopstarving"` 발행.
- 아사 시 `overridestarvefn`이 없으면 `hurtrate`(= `maxhealth / STARVE_KILL_TIME`, 기본 `150 / 120 = 1.25 HP/s`)만큼 체력 차감.

---

## 4. 이중 정신력 시스템: 광기(Insanity) vs 달 계몽(Lunacy) (`[코드 확인]`)

DST의 독자적 핵심 메카닉 중 하나로, `scripts/components/sanity.lua` (L146–446)가 **단일 게이지(`0 ~ max`)를 두 가지 모드**로 해석한다.

| 구분 | 광기 모드 (`SANITY_MODE_INSANITY = 0`) | 달 계몽 모드 (`SANITY_MODE_LUNACY = 1`) |
|---|---|---|
| **활성 조건** | 기본(본토·동굴·일반 바다) | `_lunacy_sources` 활성 시 (달섬, 달 동굴 숲, 달 폭풍, 계몽 왕관 등) |
| **위험(비정상) 진입 임계** | `<= 30/200` (**15% 이하**) → `goinsane` | `>= 170/200` (**85% 이상**) → `goenlightened` |
| **정상 복귀 임계** | `>= 35/200` (**17.5% 이상**) → `gosane` | `<= 165/200` (**82.5% 이하**) → `gosane` |
| **주간 자연 변화** | `SANITY_DAY_GAIN = 0` | `SANITY_LUNACY_DAY_GAIN = +100 / (day_time * 32)` (계몽 상승) |
| **야간 어둠 변화** | `-100 / (night_time * 2)` (급감) | `-100 / (night_time * 10)` (완만 감소) |
| **위험 상태 스폰** | 그림자 괴물(Crawling Horror, Terrorbeak) 공격 | 게슈탈트(Gestalt / Greater Gestalt) 출현 및 공격·수면 유도 |
| **포스트프로세스** | 화면 왜곡·비네트·그림자 음악 | `postprocess_lunacy.ksh` 백색 광채·오버레이 블렌드 |

### 정신력 변화 주요 상수 (`tuning.lua:2193–2221`)
- **의복/장비 회복 (`DAPPERNESS_*`)**:
  - `TINY` (+10.7/일), `SMALL` (+16.0/일), `MED` (+26.7/일), `MED_LARGE` (+35.5/일), `LARGE` (+53.3/일), `HUGE` (+160/일), `SUPERHUGE` (+320/일).
- **오라 탐색 범위**: `SANITY_EFFECT_RANGE = 10`, `SANITY_AURA_SEACH_RANGE = 20`.
- **유령 플레이어 페널티**: 살아있는 동료 1인당 `SANITY_GHOST_PLAYER_DRAIN = -100 / (night_time * 30)` (`tuning.lua:2202`, `ghost_sanity_drain = true`일 때).
- **최대 정신력 페널티**: 맥스웰의 그림자 분신 등(`AddSanityPenalty`), 단 최대 정신력은 `5` 미만으로 내려가지 않는다 (`sanity.lua:208`).

---

## 5. 사망, 유령화(`playerghost`), 부활과 게임 모드 (`[코드 확인]`)

### 5.1 게임 모드별 사망 규칙 (`scripts/gamemodes.lua:195–318`)

| 모드 | `spawn_mode` | `ghost_enabled` | `ghost_sanity_drain` | `portal_rez` | `reset_time` | 비고 |
|---|---|---|---|---|---|---|
| **Survival (기본)** | `fixed` | `true` | `true` | `false` | `{120s, loading 180s}` | 전원 유령화 후 120초 뒤 월드 리셋 |
| **Endless (프리셋/설정)** | `fixed` | `true` | `false` | `true` | `nil` (리셋 없음) | 플로리드 포스트언에서 자가 부활 가능 |
| **Wilderness (프리셋/설정)** | `scatter` | `false` | `false` | `false` | `nil` | 사망 시 새 캐릭터로 랜덤 위치 리스폰, 고기우상 비활성 |
| **Lava Arena / Quagmire** | `fixed` | `false` | `false` | `false/true` | `nil` | 내부 이벤트 모드(`revivable_corpse = true`, 제작/허기/정신력 비활성) |

> **[코드 확인]** 최신 DST(`gamemodes.lua:211–240`)에서는 과거 별도 모드였던 `wilderness`와 `endless`가 `GAME_MODES` 테이블에서 주석 처리되고, `survival`을 단일 베이스로 두고 **월드 설정(`worldsettings`)의 플레이스타일 프리셋**으로 `ghost_sanity_drain`, `portal_rez`, `reset_time`, `spawn_mode`를 오버라이드하는 구조로 통합되었다.

### 5.2 유령 상태와 부활 경제 (`tuning.lua:2167–2178`)
- 사망한 플레이어는 소지품을 바닥에 드롭하고 유령(`playerghost`)이 된다.
- 유령은 채집/전투/제작이 불가능하지만 **빙의(`HAUNT`)**로 물체에 상호작용(불 붙이기, 몹 자극, 터치스톤 작동 등)이 가능하다.
- **부활 수단과 대가**:
  1. **고백 심장(Telltale Heart)**: 제작자 체력 `40` 소모, 피부활자는 `REVIVE_HEALTH_PENALTY = 0.25` (최대체력 -25%), 시전자는 정신력 보너스(`REVIVE_OTHER_SANITY_BONUS = +80`, `tuning.lua:2177`).
  2. **고기 우상(Meat Effigy)**: `EFFIGY_HEALTH_PENALTY = 40` (유지 중 최대체력 감소), 원격 부활(`REMOTERESURRECT`) 가능.
  3. **부활의 제단(Touch Stone)**: 월드당 지상 2개·동굴 2개 기본 배치(`ResurrectionStone`), 유령이 직접 `HAUNT`로 부활.
  4. **생명의 부적(Life Giving Amulet)**: 착용 사망 시 즉시 부활 또는 유령이 바닥 부적에 빙의.
  5. **플로리드 포스트언(Endless 설정)**: `PORTAL_HEALTH_PENALTY = 0.25`.
  6. **완다의 두 번째 기회 시계(Second Chance Watch)**: 쿨다운 `0.5일` (`POCKETWATCH_REVIVE_COOLDOWN`), 최대체력 페널티 없이 동료 부활.

---

## 6. 주요 상태이상 요약 (`[코드 확인]`)

- **결빙(`components/freezable.lua`)**: 누적 냉기가 저항치를 넘으면 행동 불가(얼음 블록), 피격 시 깨지며 해제.
- **연소(`components/burnable.lua`)**: 불이 붙은 엔티티는 초당 최대 `MAX_FIRE_DAMAGE_PER_SECOND = 120` 제한 하에 화염 피해 및 주변 전파.
- **졸음/기절(`components/grogginess.lua`)**: 베어거·게슈탈트·수면 다트·천상의 대변자 함정 등에 의해 이동속도 둔화 후 수면 상태 전이.
- **익사(`components/drownable.lua`)**: 보트 침몰·바다 추락 시 인근 해안으로 강제 복귀되며 습기 `OCEAN_WETNESS(75)`, 체력·최대체력 페널티 및 일부 소지품 분실(캐릭터·구명조끼 예외).
- **원숭이 저주(`scripts/curse_monkey_util.lua`)**: 저주받은 장신구 누적 시 외형 변화 후 10개 도달 시 숨겨진 캐릭터 **`wonkey`**로 `SEAMLESSSWAP` 전환.
