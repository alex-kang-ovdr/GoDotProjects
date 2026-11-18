# weapon.energy · mode_override

[전체 목차](README.md)

각 필드는 값·단위·근거 상태·출처를 함께 읽는다. 영문 명칭은 식별용이며 한국어 명칭은 이 자료의 번역이다.

## 오버클럭 디스럽터 (Overclocked Disruptor)

- ID: `disruptor_overclock`
- 모드: `overclock`
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
| `range_m` | 230 | m | wiki_snapshot | [CMB-S003](https://cosmoteer.wiki.gg/wiki/Disruptor) |
| `shots_per_second` | 2 | shots/s | wiki_snapshot | [CMB-S003](https://cosmoteer.wiki.gg/wiki/Disruptor) |
| `firing_interval_s` | 미확정 | s | unverified | 미확보 |
| `damage_per_shot` | 100 | damage/shot | wiki_snapshot | [CMB-S003](https://cosmoteer.wiki.gg/wiki/Disruptor) |
| `firing_arc_deg` | 200 | degree | wiki_snapshot | [CMB-S003](https://cosmoteer.wiki.gg/wiki/Disruptor) |
| `heat_per_shot` | 300 | MJ/shot | wiki_snapshot | [CMB-S003](https://cosmoteer.wiki.gg/wiki/Disruptor) |
| `heat_per_s` | 600 | MJ/s | wiki_snapshot | [CMB-S003](https://cosmoteer.wiki.gg/wiki/Disruptor) |
| `penetration` | 10 | m | wiki_snapshot | [CMB-S003](https://cosmoteer.wiki.gg/wiki/Disruptor) |
| `shield_damage_total` | 6750 | damage total | wiki_snapshot | [CMB-S003](https://cosmoteer.wiki.gg/wiki/Disruptor) |
| `power_drain_total` | 2 | power total | wiki_snapshot | [CMB-S003](https://cosmoteer.wiki.gg/wiki/Disruptor) |
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

## 오버클럭 대형 레이저 블래스터 (Overclocked Heavy Laser Blaster)

- ID: `heavy_laser_blaster_overclock`
- 모드: `overclock`
- 버전 범위: {"edition":"Cosmoteer modern Steam","exact_game_version":null,"source_kind":"unversioned_wiki_snapshot","observed_at":"2026-11-17","latest_reference":"0.30.5a","all_fields_verified_for_latest":false}

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `size` | [2,5] | m | wiki_snapshot | [CMB-S002](https://cosmoteer.wiki.gg/wiki/Heavy_Laser_Blaster) |
| `hp` | 12000 | HP | wiki_snapshot | [CMB-S002](https://cosmoteer.wiki.gg/wiki/Heavy_Laser_Blaster) |
| `construction_resources` | [{"resource_id":"steel","quantity":96},{"resource_id":"coils","quantity":14},{"resource_id":"hyper_coils","quantity":4}] | item[] | wiki_snapshot | [CMB-S002](https://cosmoteer.wiki.gg/wiki/Heavy_Laser_Blaster) |
| `value_credits` | 미확정 | credits | unverified | 미확보 |
| `blueprint_cost_credits` | 3000 | credits | wiki_snapshot | [CMB-S002](https://cosmoteer.wiki.gg/wiki/Heavy_Laser_Blaster) |
| `power_per_shot` | 1 | game_power/shot | wiki_snapshot | [CMB-S002](https://cosmoteer.wiki.gg/wiki/Heavy_Laser_Blaster) |
| `power_use_per_s` | 미확정 | game_power/s | unverified | 미확보 |
| `ammo_per_shot` | 미확정 | ammo/shot | unverified | 미확보 |
| `range_m` | 260 | m | wiki_snapshot | [CMB-S002](https://cosmoteer.wiki.gg/wiki/Heavy_Laser_Blaster) |
| `shots_per_second` | 0.89 | shots/s | wiki_snapshot | [CMB-S002](https://cosmoteer.wiki.gg/wiki/Heavy_Laser_Blaster) |
| `firing_interval_s` | 미확정 | s | unverified | 미확보 |
| `damage_per_shot` | 1500 | damage/shot | wiki_snapshot | [CMB-S002](https://cosmoteer.wiki.gg/wiki/Heavy_Laser_Blaster) |
| `firing_arc_deg` | 190 | degree | wiki_snapshot | [CMB-S002](https://cosmoteer.wiki.gg/wiki/Heavy_Laser_Blaster) |
| `heat_per_shot` | 650 | MJ/shot | wiki_snapshot | [CMB-S002](https://cosmoteer.wiki.gg/wiki/Heavy_Laser_Blaster) |
| `heat_per_s` | 578.5 | MJ/s | wiki_snapshot | [CMB-S002](https://cosmoteer.wiki.gg/wiki/Heavy_Laser_Blaster) |
| `area_radius` | 2 | meters radius | wiki_snapshot | [CMB-S002](https://cosmoteer.wiki.gg/wiki/Heavy_Laser_Blaster) |
| `projectile_durability` | 525 | durability | wiki_snapshot | [CMB-S002](https://cosmoteer.wiki.gg/wiki/Heavy_Laser_Blaster) |
| `projectile_speed_m_per_s` | 미확정 | m/s | conflict | [CMB-S002](https://cosmoteer.wiki.gg/wiki/Heavy_Laser_Blaster), [CMB-S029](https://steamcommunity.com/app/799600/) |
| `damage_vs_shields_per_shot` | 미확정 | damage/shot | conflict | [CMB-S002](https://cosmoteer.wiki.gg/wiki/Heavy_Laser_Blaster) |
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
  },
  {
    "field": "damage_vs_shields_per_shot",
    "value": 700,
    "unit": "damage/shot",
    "source_id": "CMB-S002",
    "status": "conflicting_observation",
    "reason": "표의 700/shot이 총 실드 피해인지 추가 피해인지 불분명. 본문은 extra damage라고 설명하며 일반 피해 1500과 충돌 가능."
  }
]
```

## 오버클럭 이온 빔 방출기 (Overclocked Ion Beam Emitter)

- ID: `ion_beam_emitter_overclock`
- 모드: `overclock`
- 버전 범위: {"edition":"Cosmoteer modern Steam","exact_game_version":null,"source_kind":"unversioned_wiki_snapshot","observed_at":"2026-11-17","latest_reference":"0.30.5a","all_fields_verified_for_latest":false}

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `size` | 미확정 | m | unverified | 미확보 |
| `hp` | 미확정 | HP | unverified | 미확보 |
| `construction_resources` | 미확정 | item | unverified | 미확보 |
| `value_credits` | 미확정 | credits | unverified | 미확보 |
| `blueprint_cost_credits` | 미확정 | credits | unverified | 미확보 |
| `power_per_shot` | 미확정 | game_power/shot | unverified | 미확보 |
| `power_use_per_s` | 미확정 | game_power/s | unverified | 미확보 |
| `ammo_per_shot` | 미확정 | ammo/shot | unverified | 미확보 |
| `range_m` | 미확정 | m | unverified | 미확보 |
| `shots_per_second` | 미확정 | shots/s | unverified | 미확보 |
| `firing_interval_s` | 미확정 | s | unverified | 미확보 |
| `damage_per_shot` | 미확정 | damage/shot | unverified | 미확보 |
| `firing_arc_deg` | 미확정 | degree | unverified | 미확보 |
| `heat_per_shot` | 미확정 | MJ/shot | unverified | 미확보 |
| `heat_per_s` | 미확정 | MJ/s | unverified | 미확보 |
| `lightning_damage_vs_parts_parameter` | 150 | damage (event unit unspecified) | patch_confirmed | [CMB-S029](https://steamcommunity.com/app/799600/) |
| `lightning_damage_vs_shields_parameter` | 120 | damage (event unit unspecified) | patch_confirmed | [CMB-S029](https://steamcommunity.com/app/799600/) |
| `damage_retained_at_max_range` | 80 | % | patch_confirmed | [CMB-S029](https://steamcommunity.com/app/799600/) |

### 적용 메모

- 패치는 번개 피해 파라미터만 숫자로 명시한다. 이를 DPS 또는 발당 피해로 확대 해석하지 않았다.

## 오버클럭 소형 레이저 블래스터 (Overclocked Laser Blaster)

- ID: `laser_blaster_overclock`
- 모드: `overclock`
- 버전 범위: {"edition":"Cosmoteer modern Steam","exact_game_version":null,"source_kind":"unversioned_wiki_snapshot","observed_at":"2026-11-17","latest_reference":"0.30.5a","all_fields_verified_for_latest":false}

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `size` | [1,3] | m | wiki_snapshot | [CMB-S001](https://cosmoteer.wiki.gg/wiki/Laser_Blaster) |
| `hp` | 4000 | HP | wiki_snapshot | [CMB-S001](https://cosmoteer.wiki.gg/wiki/Laser_Blaster) |
| `construction_resources` | [{"resource_id":"steel","quantity":32},{"resource_id":"coils","quantity":12}] | item[] | wiki_snapshot | [CMB-S001](https://cosmoteer.wiki.gg/wiki/Laser_Blaster) |
| `value_credits` | 2000 | credits | wiki_snapshot | [CMB-S001](https://cosmoteer.wiki.gg/wiki/Laser_Blaster) |
| `blueprint_cost_credits` | 10000 | credits | wiki_snapshot | [CMB-S001](https://cosmoteer.wiki.gg/wiki/Laser_Blaster) |
| `power_per_shot` | 0.08 | game_power/shot | patch_confirmed | [CMB-S029](https://steamcommunity.com/app/799600/) |
| `power_use_per_s` | 미확정 | game_power/s | unverified | 미확보 |
| `ammo_per_shot` | 미확정 | ammo/shot | unverified | 미확보 |
| `range_m` | 260 | m | wiki_snapshot | [CMB-S001](https://cosmoteer.wiki.gg/wiki/Laser_Blaster) |
| `shots_per_second` | 3 | shots/s | wiki_snapshot | [CMB-S001](https://cosmoteer.wiki.gg/wiki/Laser_Blaster) |
| `firing_interval_s` | 미확정 | s | unverified | 미확보 |
| `damage_per_shot` | 200 | damage/shot | patch_confirmed | [CMB-S029](https://steamcommunity.com/app/799600/) |
| `firing_arc_deg` | 200 | degree | wiki_snapshot | [CMB-S001](https://cosmoteer.wiki.gg/wiki/Laser_Blaster) |
| `heat_per_shot` | 90 | MJ/shot | wiki_snapshot | [CMB-S001](https://cosmoteer.wiki.gg/wiki/Laser_Blaster) |
| `heat_per_s` | 270 | MJ/s | wiki_snapshot | [CMB-S001](https://cosmoteer.wiki.gg/wiki/Laser_Blaster) |
| `projectile_speed_m_per_s` | instantaneous | m/s | wiki_snapshot | [CMB-S001](https://cosmoteer.wiki.gg/wiki/Laser_Blaster) |
| `width_m` | 1 | m | wiki_snapshot | [CMB-S001](https://cosmoteer.wiki.gg/wiki/Laser_Blaster) |
| `height_m` | 3 | m | wiki_snapshot | [CMB-S001](https://cosmoteer.wiki.gg/wiki/Laser_Blaster) |

### 대조 관측값

```json
[
  {
    "field": "damage_per_shot",
    "value": 350,
    "unit": "damage/shot",
    "source_id": "CMB-S001",
    "status": "superseded_wiki_snapshot",
    "reason": "0.30.5 정식 변경 350→200."
  },
  {
    "field": "power_per_shot",
    "value": 0.14,
    "unit": "power/shot",
    "source_id": "CMB-S001",
    "status": "superseded_wiki_snapshot",
    "reason": "0.30.5 정식 변경 0.14→0.08."
  }
]
```

