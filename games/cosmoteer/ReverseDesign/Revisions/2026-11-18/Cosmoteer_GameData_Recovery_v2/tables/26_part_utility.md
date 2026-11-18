# utility · part

[전체 목차](README.md)

각 필드는 값·단위·근거 상태·출처를 함께 읽는다. 영문 명칭은 식별용이며 한국어 명칭은 이 자료의 번역이다.

## 조작 빔 방사기 (Manipulator Beam Emitter)

- ID: `manipulator_beam_emitter`
- 모드: `normal`
- 버전 범위: Cosmoteer Modern / Steam; 위키 관측 스냅샷, 정확한 빌드는 미확정

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `value_credits` | 3000 | credits | wiki_snapshot | [SUP-MANIPULATOR](https://cosmoteer.wiki.gg/wiki/Manipulator_Beam_Emitter) |
| `width_m` | 2 | m | wiki_snapshot | [SUP-MANIPULATOR](https://cosmoteer.wiki.gg/wiki/Manipulator_Beam_Emitter) |
| `height_m` | 2 | m | wiki_snapshot | [SUP-MANIPULATOR](https://cosmoteer.wiki.gg/wiki/Manipulator_Beam_Emitter) |
| `mass_t` | 4 | tonne | wiki_snapshot | [SUP-MANIPULATOR](https://cosmoteer.wiki.gg/wiki/Manipulator_Beam_Emitter) |
| `hp` | 4000 | HP | wiki_snapshot | [SUP-MANIPULATOR](https://cosmoteer.wiki.gg/wiki/Manipulator_Beam_Emitter) |
| `crew_speed_multiplier` | 0.5 | ratio | wiki_snapshot | [SUP-MANIPULATOR](https://cosmoteer.wiki.gg/wiki/Manipulator_Beam_Emitter) |
| `crew_required_min` | 1 | crew | wiki_snapshot | [SUP-MANIPULATOR](https://cosmoteer.wiki.gg/wiki/Manipulator_Beam_Emitter) |
| `crew_required_max` | 4 | crew | wiki_snapshot | [SUP-MANIPULATOR](https://cosmoteer.wiki.gg/wiki/Manipulator_Beam_Emitter) |
| `command_points` | -4 | command_point | wiki_snapshot | [SUP-MANIPULATOR](https://cosmoteer.wiki.gg/wiki/Manipulator_Beam_Emitter) |
| `power_capacity` | 4 | game_power | wiki_snapshot | [SUP-MANIPULATOR](https://cosmoteer.wiki.gg/wiki/Manipulator_Beam_Emitter) |
| `power_use_per_s` | 0.04 | game_power/s | wiki_snapshot | [SUP-MANIPULATOR](https://cosmoteer.wiki.gg/wiki/Manipulator_Beam_Emitter) |
| `range_m` | 450 | m | wiki_history_resolved | [SUP-MANIPULATOR](https://cosmoteer.wiki.gg/wiki/Manipulator_Beam_Emitter) |
| `firing_arc_deg` | 360 | degree | wiki_snapshot | [SUP-MANIPULATOR](https://cosmoteer.wiki.gg/wiki/Manipulator_Beam_Emitter) |
| `turret_speed_deg_per_s` | 360 | degree/s | wiki_snapshot | [SUP-MANIPULATOR](https://cosmoteer.wiki.gg/wiki/Manipulator_Beam_Emitter) |
| `beam_count_max` | 16 | count | wiki_snapshot | [SUP-MANIPULATOR](https://cosmoteer.wiki.gg/wiki/Manipulator_Beam_Emitter) |
| `beams_per_crew` | 4 | count/crew | wiki_snapshot | [SUP-MANIPULATOR](https://cosmoteer.wiki.gg/wiki/Manipulator_Beam_Emitter) |
| `blueprint_cost_credits` | 1500 | credits | wiki_snapshot | [SUP-MANIPULATOR](https://cosmoteer.wiki.gg/wiki/Manipulator_Beam_Emitter) |
| `construction_resources` | [{"resource_id":"steel","quantity":36},{"resource_id":"hyper_coils","quantity":7}] | item[] | wiki_snapshot | [SUP-MANIPULATOR](https://cosmoteer.wiki.gg/wiki/Manipulator_Beam_Emitter) |

### 적용 메모

- 본문의 구형 200m와 표·0.27.1 이력의 450m가 충돌. 명시적 변경 이력에 따라 450m 채택.

### 대조 관측값

```json
[
  {
    "field": "range_m",
    "value": 450,
    "source_id": "SUP-MANIPULATOR",
    "location": "infobox / history 0.27.1"
  },
  {
    "field": "range_m",
    "value": 200,
    "source_id": "SUP-MANIPULATOR",
    "location": "outdated body"
  }
]
```

## 채굴 레이저 (Mining Laser)

- ID: `mining_laser`
- 모드: `normal`
- 버전 범위: Cosmoteer Modern / Steam; 위키 관측 스냅샷, 정확한 빌드는 미확정

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `value_credits` | 6000 | credits | wiki_snapshot | [SUP-MINING](https://cosmoteer.wiki.gg/wiki/Mining_Laser) |
| `width_m` | 2 | m | wiki_snapshot | [SUP-MINING](https://cosmoteer.wiki.gg/wiki/Mining_Laser) |
| `height_m` | 3 | m | wiki_snapshot | [SUP-MINING](https://cosmoteer.wiki.gg/wiki/Mining_Laser) |
| `mass_t` | 7.4 | tonne | wiki_snapshot | [SUP-MINING](https://cosmoteer.wiki.gg/wiki/Mining_Laser) |
| `hp` | 6000 | HP | wiki_snapshot | [SUP-MINING](https://cosmoteer.wiki.gg/wiki/Mining_Laser) |
| `crew_speed_multiplier` | 0.5 | ratio | wiki_snapshot | [SUP-MINING](https://cosmoteer.wiki.gg/wiki/Mining_Laser) |
| `crew_required` | 1 | crew | wiki_snapshot | [SUP-MINING](https://cosmoteer.wiki.gg/wiki/Mining_Laser) |
| `command_points` | -3 | command_point | wiki_snapshot | [SUP-MINING](https://cosmoteer.wiki.gg/wiki/Mining_Laser) |
| `power_capacity` | 10 | game_power | wiki_snapshot | [SUP-MINING](https://cosmoteer.wiki.gg/wiki/Mining_Laser) |
| `power_use_per_s` | 0.6 | game_power/s | wiki_snapshot | [SUP-MINING](https://cosmoteer.wiki.gg/wiki/Mining_Laser) |
| `range_m` | 150 | m | wiki_snapshot | [SUP-MINING](https://cosmoteer.wiki.gg/wiki/Mining_Laser) |
| `turret_speed_deg_per_s` | 20 | degree/s | wiki_snapshot | [SUP-MINING](https://cosmoteer.wiki.gg/wiki/Mining_Laser) |
| `damage_per_s` | 1000 | HP/s | wiki_history_resolved | [SUP-MINING](https://cosmoteer.wiki.gg/wiki/Mining_Laser) |
| `asteroid_damage_per_s` | 64000 | HP/s | wiki_snapshot | [SUP-MINING](https://cosmoteer.wiki.gg/wiki/Mining_Laser) |
| `junk_damage_per_s` | 9600 | HP/s | wiki_snapshot | [SUP-MINING](https://cosmoteer.wiki.gg/wiki/Mining_Laser) |
| `junk_armor_damage_per_s` | 19200 | HP/s | wiki_snapshot | [SUP-MINING](https://cosmoteer.wiki.gg/wiki/Mining_Laser) |
| `blueprint_cost_credits` | 3000 | credits | wiki_snapshot | [SUP-MINING](https://cosmoteer.wiki.gg/wiki/Mining_Laser) |
| `construction_resources` | [{"resource_id":"steel","quantity":96},{"resource_id":"coils","quantity":15},{"resource_id":"hyper_coils","quantity":7}] | item[] | wiki_snapshot | [SUP-MINING](https://cosmoteer.wiki.gg/wiki/Mining_Laser) |

### 적용 메모

- 무기 표 1,000/s와 하위 빔 표 1,200/s 충돌. 0.27.1 이력이 적 함선 피해를 1,000/s로 명시하므로 채택.
- Damage 계열은 이중 빔 합계. 빔 하나의 값으로 다시 두 배 하지 않음.

### 대조 관측값

```json
[
  {
    "field": "damage_per_s",
    "value": 1000,
    "source_id": "SUP-MINING",
    "location": "infobox / history 0.27.1"
  },
  {
    "field": "damage_per_s",
    "value": 1200,
    "source_id": "SUP-MINING",
    "location": "Double Mining Beams box"
  }
]
```

## 센서 어레이 (Sensor Array)

- ID: `sensor_array`
- 모드: `normal`
- 버전 범위: Cosmoteer Modern / Steam; 위키 관측 스냅샷, 정확한 빌드는 미확정

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `value_credits` | 20000 | credits | wiki_snapshot | [SUP-SENSOR](https://cosmoteer.wiki.gg/wiki/Sensor_Array) |
| `width_m` | 3 | m | wiki_snapshot | [SUP-SENSOR](https://cosmoteer.wiki.gg/wiki/Sensor_Array) |
| `height_m` | 3 | m | wiki_snapshot | [SUP-SENSOR](https://cosmoteer.wiki.gg/wiki/Sensor_Array) |
| `mass_t` | 11.54 | tonne | wiki_snapshot | [SUP-SENSOR](https://cosmoteer.wiki.gg/wiki/Sensor_Array) |
| `hp` | 9000 | HP | wiki_snapshot | [SUP-SENSOR](https://cosmoteer.wiki.gg/wiki/Sensor_Array) |
| `crew_speed_multiplier` | 0.5 | ratio | wiki_snapshot | [SUP-SENSOR](https://cosmoteer.wiki.gg/wiki/Sensor_Array) |
| `crew_required` | 4 | crew | wiki_snapshot | [SUP-SENSOR](https://cosmoteer.wiki.gg/wiki/Sensor_Array) |
| `command_points` | -8 | command_point | wiki_snapshot | [SUP-SENSOR](https://cosmoteer.wiki.gg/wiki/Sensor_Array) |
| `power_capacity` | 8 | game_power | wiki_snapshot | [SUP-SENSOR](https://cosmoteer.wiki.gg/wiki/Sensor_Array) |
| `power_use_per_s` | 0.2 | game_power/s | wiki_snapshot | [SUP-SENSOR](https://cosmoteer.wiki.gg/wiki/Sensor_Array) |
| `sensor_visual_m` | 800 | m | wiki_snapshot | [SUP-SENSOR](https://cosmoteer.wiki.gg/wiki/Sensor_Array) |
| `sensor_radar_m` | 2400 | m | wiki_snapshot | [SUP-SENSOR](https://cosmoteer.wiki.gg/wiki/Sensor_Array) |
| `blueprint_cost_credits` | 미확정 | credits | conflict | [SUP-SENSOR](https://cosmoteer.wiki.gg/wiki/Sensor_Array), [SUP-BLUEPRINTS](https://cosmoteer.wiki.gg/wiki/Blueprints) |
| `construction_resources` | [{"resource_id":"steel","quantity":76},{"resource_id":"hyper_coils","quantity":27},{"resource_id":"processor","quantity":4}] | item[] | wiki_snapshot | [SUP-SENSOR](https://cosmoteer.wiki.gg/wiki/Sensor_Array) |
| `default_operate_priority` | 9 | priority | patch_confirmed | [V2-SUP-0272](https://store.steampowered.com/news/posts/?appids=799600&enddate=1732681972&feed=steam_community_announcements) |
| `default_supply_battery_priority` | 8 | priority | patch_confirmed | [V2-SUP-0272](https://store.steampowered.com/news/posts/?appids=799600&enddate=1732681972&feed=steam_community_announcements) |

### 적용 메모

- Sensor Array 해금 비용 9,000/10,000 충돌. 원본 .rules 또는 현행 툴팁 확인 필요.

### 대조 관측값

```json
[
  {
    "field": "blueprint_cost_credits",
    "value": 9000,
    "source_id": "SUP-SENSOR"
  },
  {
    "field": "blueprint_cost_credits",
    "value": 10000,
    "source_id": "SUP-BLUEPRINTS"
  }
]
```

## 견인 빔 방사기 (Tractor Beam Emitter)

- ID: `tractor_beam_emitter`
- 모드: `normal`
- 버전 범위: Cosmoteer Modern / Steam; 위키 관측 스냅샷, 정확한 빌드는 미확정

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `value_credits` | 40000 | credits | wiki_snapshot | [SUP-TRACTOR](https://cosmoteer.wiki.gg/wiki/Tractor_Beam_Emitter) |
| `width_m` | 5 | m | wiki_snapshot | [SUP-TRACTOR](https://cosmoteer.wiki.gg/wiki/Tractor_Beam_Emitter) |
| `height_m` | 5 | m | wiki_snapshot | [SUP-TRACTOR](https://cosmoteer.wiki.gg/wiki/Tractor_Beam_Emitter) |
| `mass_t` | 32.07 | tonne | wiki_snapshot | [SUP-TRACTOR](https://cosmoteer.wiki.gg/wiki/Tractor_Beam_Emitter) |
| `hp` | 25000 | HP | wiki_snapshot | [SUP-TRACTOR](https://cosmoteer.wiki.gg/wiki/Tractor_Beam_Emitter) |
| `crew_speed_multiplier` | 0.5 | ratio | wiki_snapshot | [SUP-TRACTOR](https://cosmoteer.wiki.gg/wiki/Tractor_Beam_Emitter) |
| `crew_required` | 4 | crew | wiki_snapshot | [SUP-TRACTOR](https://cosmoteer.wiki.gg/wiki/Tractor_Beam_Emitter) |
| `command_points` | -8 | command_point | wiki_snapshot | [SUP-TRACTOR](https://cosmoteer.wiki.gg/wiki/Tractor_Beam_Emitter) |
| `power_capacity` | 24 | game_power | wiki_snapshot | [SUP-TRACTOR](https://cosmoteer.wiki.gg/wiki/Tractor_Beam_Emitter) |
| `power_use_per_s` | 4.5 | game_power/s | wiki_snapshot | [SUP-TRACTOR](https://cosmoteer.wiki.gg/wiki/Tractor_Beam_Emitter) |
| `range_m` | 300 | m | wiki_snapshot | [SUP-TRACTOR](https://cosmoteer.wiki.gg/wiki/Tractor_Beam_Emitter) |
| `stretch_range_m` | 600 | m | wiki_snapshot | [SUP-TRACTOR](https://cosmoteer.wiki.gg/wiki/Tractor_Beam_Emitter) |
| `firing_arc_deg` | 360 | degree | wiki_snapshot | [SUP-TRACTOR](https://cosmoteer.wiki.gg/wiki/Tractor_Beam_Emitter) |
| `turret_speed_deg_per_s` | 120 | degree/s | wiki_snapshot | [SUP-TRACTOR](https://cosmoteer.wiki.gg/wiki/Tractor_Beam_Emitter) |
| `tractor_force_kn` | 40000 | kN | wiki_snapshot | [SUP-TRACTOR](https://cosmoteer.wiki.gg/wiki/Tractor_Beam_Emitter) |
| `blueprint_cost_credits` | 미확정 | credits | conflict | [SUP-TRACTOR](https://cosmoteer.wiki.gg/wiki/Tractor_Beam_Emitter), [SUP-BLUEPRINTS](https://cosmoteer.wiki.gg/wiki/Blueprints) |
| `construction_resources` | [{"resource_id":"steel","quantity":200},{"resource_id":"hyper_coils","quantity":50},{"resource_id":"diamonds","quantity":5}] | item[] | wiki_snapshot | [SUP-TRACTOR](https://cosmoteer.wiki.gg/wiki/Tractor_Beam_Emitter) |

### 적용 메모

- Tractor Beam 해금 비용 9,000/10,000 충돌. 원본 .rules 또는 현행 툴팁 확인 필요.

### 대조 관측값

```json
[
  {
    "field": "blueprint_cost_credits",
    "value": 9000,
    "source_id": "SUP-TRACTOR"
  },
  {
    "field": "blueprint_cost_credits",
    "value": 10000,
    "source_id": "SUP-BLUEPRINTS"
  }
]
```

