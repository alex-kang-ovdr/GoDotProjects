# weapon.energy · part

[전체 목차](README.md)

각 필드는 값·단위·근거 상태·출처를 함께 읽는다. 영문 명칭은 식별용이며 한국어 명칭은 이 자료의 번역이다.

## 디스럽터 (Disruptor)

- ID: `disruptor`
- 모드: `normal`
- 버전 범위: {"edition":"Cosmoteer modern Steam","exact_game_version":null,"source_kind":"unversioned_wiki_snapshot","observed_at":"2026-11-17","latest_reference":"0.30.5a","all_fields_verified_for_latest":false}

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `size` | [1,4] | m | wiki_snapshot | [CMB-S003](https://cosmoteer.wiki.gg/wiki/Disruptor) |
| `hp` | 5000 | HP | wiki_snapshot | [CMB-S003](https://cosmoteer.wiki.gg/wiki/Disruptor) |
| `construction_resources` | [{"resource_id":"steel","quantity":40},{"resource_id":"coils","quantity":8},{"resource_id":"hyper_coils","quantity":4}] | item[] | wiki_snapshot | [CMB-S003](https://cosmoteer.wiki.gg/wiki/Disruptor) |
| `value_credits` | 미확정 | credits | unverified | 미확보 |
| `blueprint_cost_credits` | 1500 | credits | wiki_snapshot | [CMB-S003](https://cosmoteer.wiki.gg/wiki/Disruptor) |
| `power_per_shot` | 0.25 | game_power/shot | wiki_snapshot | [CMB-S003](https://cosmoteer.wiki.gg/wiki/Disruptor) |
| `power_use_per_s` | 미확정 | game_power/s | unverified | 미확보 |
| `ammo_per_shot` | 미확정 | ammo/shot | unverified | 미확보 |
| `range_m` | 180 | m | wiki_snapshot | [CMB-S003](https://cosmoteer.wiki.gg/wiki/Disruptor) |
| `shots_per_second` | 2 | shots/s | wiki_snapshot | [CMB-S003](https://cosmoteer.wiki.gg/wiki/Disruptor) |
| `firing_interval_s` | 미확정 | s | unverified | 미확보 |
| `damage_per_shot` | 100 | damage/shot | wiki_snapshot | [CMB-S003](https://cosmoteer.wiki.gg/wiki/Disruptor) |
| `firing_arc_deg` | 200 | degree | wiki_snapshot | [CMB-S003](https://cosmoteer.wiki.gg/wiki/Disruptor) |
| `heat_per_shot` | 미확정 | MJ/shot | unverified | 미확보 |
| `heat_per_s` | 미확정 | MJ/s | unverified | 미확보 |
| `crew_required` | 1 | crew | wiki_snapshot | [CMB-S003](https://cosmoteer.wiki.gg/wiki/Disruptor) |
| `command_points` | -2 | command_point | wiki_snapshot | [CMB-S003](https://cosmoteer.wiki.gg/wiki/Disruptor) |
| `power_capacity` | 6 | game_power | wiki_snapshot | [CMB-S003](https://cosmoteer.wiki.gg/wiki/Disruptor) |
| `mass_t` | 3.48 | tonne | wiki_snapshot | [CMB-S003](https://cosmoteer.wiki.gg/wiki/Disruptor) |
| `damage_vs_shields_per_shot` | 2250 | damage/shot | wiki_snapshot | [CMB-S003](https://cosmoteer.wiki.gg/wiki/Disruptor) |
| `power_drain_per_hit` | 0.6 | game_power/shot | wiki_snapshot | [CMB-S003](https://cosmoteer.wiki.gg/wiki/Disruptor) |
| `shield_penetration` | 50 | meters equivalent | wiki_snapshot | [CMB-S003](https://cosmoteer.wiki.gg/wiki/Disruptor) |
| `projectile_speed_m_per_s` | 미확정 | m/s | conflict | [CMB-S003](https://cosmoteer.wiki.gg/wiki/Disruptor), [CMB-S029](https://steamcommunity.com/app/799600/) |
| `width_m` | 1 | m | wiki_snapshot | [CMB-S003](https://cosmoteer.wiki.gg/wiki/Disruptor) |
| `height_m` | 4 | m | wiki_snapshot | [CMB-S003](https://cosmoteer.wiki.gg/wiki/Disruptor) |

### 대조 관측값

```json
[
  {
    "field": "projectile_speed_m_per_s",
    "value": 216,
    "unit": "meters/sec",
    "source_id": "CMB-S003",
    "status": "version_uncertain",
    "reason": "0.30.5가 대부분 발사체 속도를 1/6 낮췄지만 적용 대상·색인 반영 여부를 이 항목별로 확인하지 못함. 일괄 5/6 곱셈하지 않음."
  }
]
```

## 대형 레이저 블래스터 (Heavy Laser Blaster)

- ID: `heavy_laser_blaster`
- 모드: `normal`
- 버전 범위: {"edition":"Cosmoteer modern Steam","exact_game_version":null,"source_kind":"unversioned_wiki_snapshot","observed_at":"2026-11-17","latest_reference":"0.30.5a","all_fields_verified_for_latest":false}

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `size` | [2,5] | m | wiki_snapshot | [CMB-S002](https://cosmoteer.wiki.gg/wiki/Heavy_Laser_Blaster) |
| `hp` | 12000 | HP | wiki_snapshot | [CMB-S002](https://cosmoteer.wiki.gg/wiki/Heavy_Laser_Blaster) |
| `construction_resources` | [{"resource_id":"steel","quantity":96},{"resource_id":"coils","quantity":14},{"resource_id":"hyper_coils","quantity":4}] | item[] | wiki_snapshot | [CMB-S002](https://cosmoteer.wiki.gg/wiki/Heavy_Laser_Blaster) |
| `value_credits` | 미확정 | credits | unverified | 미확보 |
| `blueprint_cost_credits` | 3000 | credits | wiki_snapshot | [CMB-S002](https://cosmoteer.wiki.gg/wiki/Heavy_Laser_Blaster) |
| `power_per_shot` | 0.5 | game_power/shot | wiki_snapshot | [CMB-S002](https://cosmoteer.wiki.gg/wiki/Heavy_Laser_Blaster) |
| `power_use_per_s` | 미확정 | game_power/s | unverified | 미확보 |
| `ammo_per_shot` | 미확정 | ammo/shot | unverified | 미확보 |
| `range_m` | 260 | m | wiki_snapshot | [CMB-S002](https://cosmoteer.wiki.gg/wiki/Heavy_Laser_Blaster) |
| `shots_per_second` | 1.78 | shots/s | wiki_snapshot | [CMB-S002](https://cosmoteer.wiki.gg/wiki/Heavy_Laser_Blaster) |
| `firing_interval_s` | 미확정 | s | unverified | 미확보 |
| `damage_per_shot` | 1000 | damage/shot | wiki_snapshot | [CMB-S002](https://cosmoteer.wiki.gg/wiki/Heavy_Laser_Blaster) |
| `firing_arc_deg` | 190 | degree | wiki_snapshot | [CMB-S002](https://cosmoteer.wiki.gg/wiki/Heavy_Laser_Blaster) |
| `heat_per_shot` | 미확정 | MJ/shot | unverified | 미확보 |
| `heat_per_s` | 미확정 | MJ/s | unverified | 미확보 |
| `crew_required` | 2 | crew | wiki_snapshot | [CMB-S002](https://cosmoteer.wiki.gg/wiki/Heavy_Laser_Blaster) |
| `command_points` | -4 | command_point | wiki_snapshot | [CMB-S002](https://cosmoteer.wiki.gg/wiki/Heavy_Laser_Blaster) |
| `power_capacity` | 10 | game_power | wiki_snapshot | [CMB-S002](https://cosmoteer.wiki.gg/wiki/Heavy_Laser_Blaster) |
| `mass_t` | 7.68 | tonne | wiki_snapshot | [CMB-S002](https://cosmoteer.wiki.gg/wiki/Heavy_Laser_Blaster) |
| `turret_speed_deg_per_s` | 45 | degree/s | wiki_snapshot | [CMB-S002](https://cosmoteer.wiki.gg/wiki/Heavy_Laser_Blaster) |
| `projectile_durability` | 300 | durability | wiki_snapshot | [CMB-S002](https://cosmoteer.wiki.gg/wiki/Heavy_Laser_Blaster) |
| `projectile_speed_m_per_s` | 미확정 | m/s | conflict | [CMB-S002](https://cosmoteer.wiki.gg/wiki/Heavy_Laser_Blaster), [CMB-S029](https://steamcommunity.com/app/799600/) |
| `width_m` | 2 | m | wiki_snapshot | [CMB-S002](https://cosmoteer.wiki.gg/wiki/Heavy_Laser_Blaster) |
| `height_m` | 5 | m | wiki_snapshot | [CMB-S002](https://cosmoteer.wiki.gg/wiki/Heavy_Laser_Blaster) |

### 대조 관측값

```json
[
  {
    "field": "projectile_speed_m_per_s",
    "value": 360,
    "unit": "meters/sec",
    "source_id": "CMB-S002",
    "status": "version_uncertain",
    "reason": "0.30.5가 대부분 발사체 속도를 1/6 낮췄지만 적용 대상·색인 반영 여부를 이 항목별로 확인하지 못함. 일괄 5/6 곱셈하지 않음."
  }
]
```

## 이온 빔 방출기 (Ion Beam Emitter)

- ID: `ion_beam_emitter`
- 모드: `normal`
- 버전 범위: {"edition":"Cosmoteer modern Steam","exact_game_version":null,"source_kind":"unversioned_wiki_snapshot","observed_at":"2026-11-17","latest_reference":"0.30.5a","all_fields_verified_for_latest":false}

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `size` | [2,5] | m | wiki_snapshot | [CMB-S009](https://cosmoteer.wiki.gg/wiki/Ion_Beam_Emitter) |
| `hp` | 8000 | HP | wiki_snapshot | [CMB-S009](https://cosmoteer.wiki.gg/wiki/Ion_Beam_Emitter) |
| `construction_resources` | [{"resource_id":"steel","quantity":60},{"resource_id":"hyper_coils","quantity":15},{"resource_id":"diamonds","quantity":1}] | item[] | wiki_snapshot | [CMB-S009](https://cosmoteer.wiki.gg/wiki/Ion_Beam_Emitter) |
| `value_credits` | 10000 | credits | wiki_snapshot | [CMB-S009](https://cosmoteer.wiki.gg/wiki/Ion_Beam_Emitter) |
| `blueprint_cost_credits` | 5000 | credits | wiki_snapshot | [CMB-S009](https://cosmoteer.wiki.gg/wiki/Ion_Beam_Emitter) |
| `power_per_shot` | 미확정 | game_power/shot | unverified | 미확보 |
| `power_use_per_s` | 1.25 | game_power/s | wiki_snapshot | [CMB-S009](https://cosmoteer.wiki.gg/wiki/Ion_Beam_Emitter) |
| `ammo_per_shot` | 미확정 | ammo/shot | unverified | 미확보 |
| `range_m` | 350 | m | wiki_snapshot | [CMB-S009](https://cosmoteer.wiki.gg/wiki/Ion_Beam_Emitter) |
| `shots_per_second` | 미확정 | shots/s | unverified | 미확보 |
| `firing_interval_s` | 미확정 | s | unverified | 미확보 |
| `damage_per_shot` | 미확정 | damage/shot | unverified | 미확보 |
| `firing_arc_deg` | 0 | degree | wiki_snapshot | [CMB-S009](https://cosmoteer.wiki.gg/wiki/Ion_Beam_Emitter) |
| `heat_per_shot` | 미확정 | MJ/shot | unverified | 미확보 |
| `heat_per_s` | 미확정 | MJ/s | unverified | 미확보 |
| `crew_required` | 2 | crew | wiki_snapshot | [CMB-S009](https://cosmoteer.wiki.gg/wiki/Ion_Beam_Emitter) |
| `command_points` | -4 | command_point | wiki_snapshot | [CMB-S009](https://cosmoteer.wiki.gg/wiki/Ion_Beam_Emitter) |
| `power_capacity` | 10 | game_power | wiki_snapshot | [CMB-S009](https://cosmoteer.wiki.gg/wiki/Ion_Beam_Emitter) |
| `mass_t` | 8 | tonne | wiki_snapshot | [CMB-S009](https://cosmoteer.wiki.gg/wiki/Ion_Beam_Emitter) |
| `damage_per_second_near` | 2500 | damage/sec | wiki_snapshot | [CMB-S009](https://cosmoteer.wiki.gg/wiki/Ion_Beam_Emitter) |
| `damage_per_second_far` | 2000 | damage/sec | wiki_snapshot | [CMB-S009](https://cosmoteer.wiki.gg/wiki/Ion_Beam_Emitter) |
| `projectile_speed_m_per_s` | instantaneous | m/s | wiki_snapshot | [CMB-S009](https://cosmoteer.wiki.gg/wiki/Ion_Beam_Emitter) |
| `width_m` | 2 | m | wiki_snapshot | [CMB-S009](https://cosmoteer.wiki.gg/wiki/Ion_Beam_Emitter) |
| `height_m` | 5 | m | wiki_snapshot | [CMB-S009](https://cosmoteer.wiki.gg/wiki/Ion_Beam_Emitter) |

## 소형 레이저 블래스터 (Laser Blaster)

- ID: `laser_blaster`
- 모드: `normal`
- 버전 범위: {"edition":"Cosmoteer modern Steam","exact_game_version":null,"source_kind":"unversioned_wiki_snapshot","observed_at":"2026-11-17","latest_reference":"0.30.5a","all_fields_verified_for_latest":false}

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `size` | [1,3] | m | wiki_snapshot | [CMB-S001](https://cosmoteer.wiki.gg/wiki/Laser_Blaster) |
| `hp` | 4000 | HP | wiki_snapshot | [CMB-S001](https://cosmoteer.wiki.gg/wiki/Laser_Blaster) |
| `construction_resources` | [{"resource_id":"steel","quantity":32},{"resource_id":"coils","quantity":12}] | item[] | wiki_snapshot | [CMB-S001](https://cosmoteer.wiki.gg/wiki/Laser_Blaster) |
| `value_credits` | 2000 | credits | wiki_snapshot | [CMB-S001](https://cosmoteer.wiki.gg/wiki/Laser_Blaster) |
| `blueprint_cost_credits` | 1000 | credits | wiki_snapshot | [CMB-S001](https://cosmoteer.wiki.gg/wiki/Laser_Blaster) |
| `power_per_shot` | 0.2 | game_power/shot | wiki_snapshot | [CMB-S001](https://cosmoteer.wiki.gg/wiki/Laser_Blaster) |
| `power_use_per_s` | 미확정 | game_power/s | unverified | 미확보 |
| `ammo_per_shot` | 미확정 | ammo/shot | unverified | 미확보 |
| `range_m` | 260 | m | wiki_snapshot | [CMB-S001](https://cosmoteer.wiki.gg/wiki/Laser_Blaster) |
| `shots_per_second` | 1.33 | shots/s | wiki_snapshot | [CMB-S001](https://cosmoteer.wiki.gg/wiki/Laser_Blaster) |
| `firing_interval_s` | 미확정 | s | unverified | 미확보 |
| `damage_per_shot` | 500 | damage/shot | wiki_snapshot | [CMB-S001](https://cosmoteer.wiki.gg/wiki/Laser_Blaster) |
| `firing_arc_deg` | 200 | degree | wiki_snapshot | [CMB-S001](https://cosmoteer.wiki.gg/wiki/Laser_Blaster) |
| `heat_per_shot` | 미확정 | MJ/shot | unverified | 미확보 |
| `heat_per_s` | 미확정 | MJ/s | unverified | 미확보 |
| `crew_required` | 1 | crew | wiki_snapshot | [CMB-S001](https://cosmoteer.wiki.gg/wiki/Laser_Blaster) |
| `command_points` | -2 | command_point | wiki_snapshot | [CMB-S001](https://cosmoteer.wiki.gg/wiki/Laser_Blaster) |
| `power_capacity` | 4 | game_power | wiki_snapshot | [CMB-S001](https://cosmoteer.wiki.gg/wiki/Laser_Blaster) |
| `mass_t` | 2.5 | tonne | wiki_snapshot | [CMB-S001](https://cosmoteer.wiki.gg/wiki/Laser_Blaster) |
| `turret_speed_deg_per_s` | 90 | degree/s | wiki_snapshot | [CMB-S001](https://cosmoteer.wiki.gg/wiki/Laser_Blaster) |
| `projectile_durability` | 125 | durability | wiki_snapshot | [CMB-S001](https://cosmoteer.wiki.gg/wiki/Laser_Blaster) |
| `projectile_speed_m_per_s` | 미확정 | m/s | conflict | [CMB-S001](https://cosmoteer.wiki.gg/wiki/Laser_Blaster), [CMB-S029](https://steamcommunity.com/app/799600/) |
| `width_m` | 1 | m | wiki_snapshot | [CMB-S001](https://cosmoteer.wiki.gg/wiki/Laser_Blaster) |
| `height_m` | 3 | m | wiki_snapshot | [CMB-S001](https://cosmoteer.wiki.gg/wiki/Laser_Blaster) |

### 대조 관측값

```json
[
  {
    "field": "projectile_speed_m_per_s",
    "value": 408,
    "unit": "meters/sec",
    "source_id": "CMB-S001",
    "status": "version_uncertain",
    "reason": "0.30.5가 대부분 발사체 속도를 1/6 낮췄지만 적용 대상·색인 반영 여부를 이 항목별로 확인하지 못함. 일괄 5/6 곱셈하지 않음."
  }
]
```

