# 02. 시간, 달 주기, 계절, 날씨와 환경 시뮬레이션

> 상위 문서: [00. 목차](00_index.md) | 1차 출처: `scripts/tuning.lua`, `scripts/components/clock.lua`, `scripts/components/seasons.lua`, `scripts/components/worldtemperature.lua`, `scripts/components/temperature.lua`, `scripts/components/moisture.lua`, `scripts/components/weather.lua`

---

## 1. 하루(Day Cycle)와 16세그먼트 시계 (`[코드 확인]`)

`scripts/tuning.lua` (L19–29)와 `scripts/components/clock.lua` (L11–18, L322–380)에서 확인한 DST의 기본 시간 단위다.

| 항목 | 상수 / 코드 근거 | 기본값 |
|---|---|---|
| 1 세그먼트 길이 | `TUNING.SEG_TIME` (`tuning.lua:20`) | **30초** |
| 하루 세그먼트 수 | `NUM_SEGS` (`clock.lua:11`) | **16 세그먼트** |
| 하루 총 길이 | `TUNING.TOTAL_DAY_TIME = seg_time * 16` | **480초 (8분)** |
| 시간대(Phase) | `PHASE_NAMES` (`clock.lua:13–18`) | `"day"`, `"dusk"`, `"night"` |
| 자동 저장 주기 | `TUNING.AUTOSAVE_INTERVAL` (`tuning.lua:59`) | 매 1일 (`480초`) |

### 네트워크 시계 동기화 방식 (`clock.lua:322–379`)
- **세그먼트 내부**: 서버와 클라이언트가 로컬 `dt`로 독립 카운트다운(`set_local`)해 대역폭을 절약한다.
- **세그먼트 경계**: 마스터 시뮬레이션(`_ismastersim`)이 세그먼트 전환 시 `_remainingtimeinphase:set(...)`으로 동기화한다. 클라이언트는 세그먼트 끝에 도달하면 서버 패킷을 기다리며 `0.001`초에서 대기한다.
- **페이즈·일수 전환**: 오직 **마스터 샤드(`_ismastershard`)**만 다음 페이즈와 `_cycles` 증가(`ms_cyclecomplete`)를 결정하고 세컨더리 샤드(동굴)와 클라이언트로 전파한다.

---

## 2. 20일 달 주기 (Moon Phase Cycle) (`[코드 확인]`)

`scripts/components/clock.lua` (L21–61)에 정의된 달 위상은 **20일 주기**로 순환하며, 매일 아침(`_phase == 1` 진입 시) 갱신된다.

```text
MOON_PHASE_NAMES = { "new"(1), "quarter"(2), "half"(3), "threequarter"(4), "full"(5) }
MOON_PHASE_LENGTHS = { new=1, quarter=3, half=3, threequarter=3, full=1 }
```

- **차오름 (Waxing, 11일)**: `new(1일)` → `quarter(3일)` → `half(3일)` → `threequarter(3일)` → `full(1일)` (11일째 밤이 첫 보름달)
- **기울어짐 (Waning, 9일)**: `threequarter(3일)` → `half(3일)` → `quarter(3일)` → 다시 `new(1일)` (총 20일)
- **보름달(Full Moon)**: 밤에도 밝은 조명 유지, 웨어피그 변신, 글로머 꽃 개화, 문스톤 이벤트 가능.
- **그믐달(New Moon)**: 완전 암흑, 나이트메어 웨어피그/특수 이벤트 조건.
- **달 스타일 상태 (`MOON_PHASE_STYLE_NAMES`)**: `"default"`, `"alter_active"` (천상의 대변자 각성 후 영구 보름달/달 폭풍), `"glassed_default"`, `"glassed_alter_active"`.

---

## 3. 4계절 구조와 일조량 변화 (`[데이터 확인]`)

`scripts/tuning.lua` (L2228–2231)와 `scripts/components/seasons.lua` (L17–41) 기준 기본 1년은 **70일**이다.

| 계절 | 기본 길이(`tuning.lua`) | 기준 시계 세그먼트(`DEFAULT_CLOCK_SEGS`) | 주요 환경 압박 |
|---|---:|---|---|
| **가을 (Autumn)** | **20일** | 낮 8 / 황혼 6 / 밤 2 | 온화함, 초반 거점 구축·겨울 대비 기간 |
| **겨울 (Winter)** | **15일** | 낮 5 / 황혼 5 / 밤 6 | 저온(동사), 긴 밤(정신력·광원 압박), 펭굴·디어클롭스, 작물 성장 둔화 |
| **봄 (Spring)** | **20일** | 낮 5 / 황혼 8 / 밤 3 | 잦은 비·번개·습기, 개구리비, 비팔로 발정, 작물 성장 가속(`SPRING_GROWTH_MODIFIER = 0.75`), 불 확산/범위 축소(`SPRING_FIRE_RANGE_MOD = 0.67`), 무스/구스 |
| **여름 (Summer)** | **15일** | 낮 11 / 황혼 1 / 밤 4 | 고온(과열), 자연발화(Smoldering/Wildfire), 모래폭풍(오아시스 사막), 개미사자 조공/싱크홀, 여름 비는 온도 `-20°C` 급락(`SUMMER_RAIN_TEMP = -20`) |

- **계절 모드(`seasons.lua:26–30`)**: `"cycle"`(기본 4계절 순환), `"endless"`(초기 `ENDLESS_PRE_DAYS=10`, 램프 `10일`, 이후 10,000일 고정), `"always"`.
- **세그먼트 보간**: `seasons.lua`는 이전/현재/다음 계절의 `DEFAULT_CLOCK_SEGS` 사이를 계절 진행도에 따라 점진적으로 보간해 매일 시계 구성을 바꾼다.

---

## 4. 세계 기온과 엔티티 체온 시뮬레이션 (`[코드 확인]`)

### 4.1 세계 기온 (`worldtemperature.lua:17–29`)
- 기본 범위: `MIN_TEMPERATURE = -25°C`, `MAX_TEMPERATURE = 95°C`
- 계절 전환 기준: `WINTER_CROSSOVER_TEMPERATURE = 5°C`, `SUMMER_CROSSOVER_TEMPERATURE = 55°C`
- 시간대 보정(`PHASE_TEMPERATURES`): 낮 `+5°C`, 밤 `-6°C`
- 노이즈 변동: `TEMPERATURE_NOISE_SCALE = 0.025`, `TEMPERATURE_NOISE_MAG = 8`, 30초마다 네트워크 동기화(`NOISE_SYNC_PERIOD = 30`).

### 4.2 플레이어·엔티티 체온 (`tuning.lua:2300–2334`, `temperature.lua:311–410`)

| 항목 | 상수 | 값 |
|---|---|---:|
| 시작 체온 | `TUNING.STARTING_TEMP` | **35°C** |
| 동사(Freezing) 임계 | `< 0°C` | **0°C 미만** |
| 과열(Overheating) 임계 | `TUNING.OVERHEAT_TEMP` | **70°C 초과** |
| 엔티티 체온 클램프 | `MIN_ENTITY_TEMP` / `MAX_ENTITY_TEMP` | **-20°C ~ 90°C** |
| 동사 치사 시간 | `TUNING.FREEZING_KILL_TIME` | **120초** (윌로우 `60초`) |
| 윌로우 과열 치사 시간 | `TUNING.WILLOW_OVERHEAT_KILL_TIME` | **180초** |
| 기본 가열 속도 | `TUNING.WARM_DEGREES_PER_SEC` | **1°C/초** |
| 습기 최대 냉각 페널티 | `TUNING.MOISTURE_TEMP_PENALTY` | **최대 -30°C** |
| 젖음 상태 열 흡수 페널티 | `TUNING.WET_HEAT_FACTOR_PENALTY` | **0.75** |

**[코드 확인] 체온 목표값 계산 (`temperature.lua:363–402`)**:
1. 그늘(`sheltered_level > 1`, 나무/우산 등)에 있으면 주변 온도가 `overheattemp - 5` (`65°C`)로 상한 제한된다.
2. 기본 온도차: `delta = (ambient_temperature + totalmodifiers + GetMoisturePenalty()) - current`.
3. 장비 슬롯(`equipslots`), 인벤토리(`itemslots`), 가방(`overflow`) 안의 `heater` 컴포넌트(예: 보온석 `heatrock`)가 발열(`IsExothermic`) 또는 흡열(`IsEndothermic`) 방향이 일치할 때 `(heat - current) * carriedmult`를 `delta`에 가산한다.
4. 단열(`insulation`) 수치는 체온이 주변 온도로 수렴하는 속도를 늦추는 시간 상수 역할을 하며, 열원(모닥불/흡열 화덕)은 반경 내 `FindEntities`로 탐색해 체온을 끌어올리거나 낮춘다.

---

## 5. 습기(Moisture)와 산성비(Acid Rain) (`[코드 확인]`)

`scripts/components/moisture.lua` (L253–340)와 `scripts/tuning.lua` (L87–88, L483–485, L7746–7756)에서 확인한 규칙이다.

| 항목 | 상수 | 값 / 규칙 |
|---|---|---|
| 습기 범위 | `0` ~ `TUNING.MAX_WETNESS` | **0 ~ 100** |
| 젖음 판정 히스테리시스 | `MOISTURE_WET_THRESHOLD` / `MOISTURE_DRY_THRESHOLD` | **35 이상**에서 젖음(`wet`), **15 이하**에서 건조 |
| 바다 입수 초기 습기 | `TUNING.OCEAN_WETNESS` | **75** |
| 최대 정신력 페널티 | `TUNING.MOISTURE_SANITY_PENALTY_MAX` | `-100 / (day_time * 6)` (약 **-3.33/분**, 100% 젖음 시) |
| 젖은 연료 효율 | `TUNING.WET_FUEL_PENALTY` | **0.75** (연소 시간 25% 감소) |
| 젖은 음식 부패 배율 | `TUNING.PERISH_WET_MULT` | **1.3×** |
| 건조 조건 | `Moisture:GetDryingRate` | **비가 오지 않을 때만** 건조 진행 (`baseDryingRate + 열원 보너스 + 지역 온도 보너스 + 현재 습기 지수항`) |

### 동굴 산성비 (`tuning.lua:7746–7756`, `perishable.lua:98–104`)
- 그림자 균열(`SHADOW_RIFTS_ACTIVE`) 활성화 이후 동굴에 산성비가 내린다(`TheWorld.state.isacidraining`).
- **플레이어 피해**: `ACIDRAIN_DAMAGE_TIME = 1.5초` 주기로 초당 `2.0` 피해(`ACIDRAIN_DAMAGE_PER_SECOND = 2.0`), 연료/내구도 장비 부식 가속(`ACIDRAIN_DAMAGE_FUELED_SCALER = 2.0`).
- **바닥 음식 급속 부패**: 바닥에 놓인 `perishable` 아이템은 강수율 × `0.007 × dt` 비율로 추가 부패.
- **생태 변이**: 산성비에 노출된 박쥐는 속도 `1.25×`·피해 `1.5×`, 돌가재는 크기가 줄어들며 초석(Nitre)을 자라게 함.

---

## 6. 빛과 어둠 (찰리 / Grue) (`[데이터 확인]`)

- `TUNING.DARK_CUTOFF = 0`, `TUNING.DARK_SPAWNCUTOFF = 0.1` (`tuning.lua:105–106`).
- 정신력 계산용 조도 경계: `SANITY_HIGH_LIGHT = 0.6`, `SANITY_LOW_LIGHT = 0.1` (`tuning.lua:2180–2181`).
  - 밤/동굴에서 조도가 `0.1` 미만이면 `SANITY_NIGHT_DARK = -100 / (night_time * 2)`의 급격한 정신력 감소가 발생하고, `grue` 컴포넌트가 경고 후 어둠의 존재(찰리) 공격을 트리거한다.
  - 반면 달 계몽 모드(`SANITY_MODE_LUNACY`)에서는 `SANITY_LUNACY_NIGHT_LIGHT = 0`, `SANITY_LUNACY_NIGHT_DARK = -100 / (night_time * 10)`으로 빛이 정신력 대신 계몽치를 낮추지 않으며, 낮에는 오히려 `SANITY_LUNACY_DAY_GAIN = +100 / (day_time * 32)`만큼 계몽치가 오른다 (`tuning.lua:2197–2200`).

---

## 7. 설계 해석 및 경계 조건

- **[설계 해석]** DST의 환경 시스템은 **히스테리시스(이력 현상)**를 적극적으로 사용한다. 습기(`35` 진입 / `15` 해제), 정신력(`15%` 진입 / `17.5%` 해제), 계몽(`85%` 진입 / `82.5%` 해제) 모두 경계값 떨림(flickering)으로 UI·사운드·스폰이 요동치는 것을 방지한다.
- **[재구성 설계]** Godot 재구축 시 `Clock`과 `Seasons`는 서버 권위 싱글톤으로 두고, 클라이언트에는 `(phase, segs, remaining_time_in_phase, season, elapsed_days, world_temp_noise_time)`만 저빈도 동기화해 대역폭을 최소화한다.
