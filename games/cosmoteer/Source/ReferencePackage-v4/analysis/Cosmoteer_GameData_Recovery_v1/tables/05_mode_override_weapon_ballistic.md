# weapon.ballistic · mode_override

[전체 목차](README.md)

각 필드는 값·단위·근거 상태·출처를 함께 읽는다. 영문 명칭은 식별용이며 한국어 명칭은 이 자료의 번역이다.

## 오버클럭 체인건 (Overclocked Chaingun)

- ID: `chaingun_overclock`
- 모드: `overclock`
- 버전 범위: {"edition":"Cosmoteer modern Steam","exact_game_version":null,"source_kind":"unversioned_wiki_snapshot","observed_at":"2026-11-17","latest_reference":"0.30.5a","all_fields_verified_for_latest":false}

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `size` | [3,6] | m | wiki_snapshot | [CMB-S007](https://cosmoteer.wiki.gg/wiki/Chaingun) |
| `hp` | 18000 | HP | wiki_snapshot | [CMB-S007](https://cosmoteer.wiki.gg/wiki/Chaingun) |
| `construction_resources` | 미확정 | item | conflict | [CMB-S007](https://cosmoteer.wiki.gg/wiki/Chaingun), [ECON-CREDITS](https://cosmoteer.wiki.gg/wiki/Credits), [ECON-R-STEEL](https://cosmoteer.wiki.gg/wiki/Steel), [ECON-R-HYPER-COILS](https://cosmoteer.wiki.gg/wiki/Hyper-Coils), [ECON-R-TRI-STEEL](https://cosmoteer.wiki.gg/wiki/Tri-Steel) |
| `value_credits` | 미확정 | credits | conflict | [CMB-S007](https://cosmoteer.wiki.gg/wiki/Chaingun), [ECON-CREDITS](https://cosmoteer.wiki.gg/wiki/Credits), [ECON-R-STEEL](https://cosmoteer.wiki.gg/wiki/Steel), [ECON-R-HYPER-COILS](https://cosmoteer.wiki.gg/wiki/Hyper-Coils), [ECON-R-TRI-STEEL](https://cosmoteer.wiki.gg/wiki/Tri-Steel) |
| `blueprint_cost_credits` | 미확정 | credits | unverified | 미확보 |
| `power_per_shot` | 미확정 | game_power/shot | unverified | 미확보 |
| `power_use_per_s` | 미확정 | game_power/s | unverified | 미확보 |
| `ammo_per_shot` | 0.25 | ammo/shot | wiki_snapshot | [CMB-S007](https://cosmoteer.wiki.gg/wiki/Chaingun) |
| `range_m` | 240 | m | wiki_snapshot | [CMB-S007](https://cosmoteer.wiki.gg/wiki/Chaingun) |
| `shots_per_second` | 미확정 | shots/s | conflict | [CMB-S007](https://cosmoteer.wiki.gg/wiki/Chaingun) |
| `firing_interval_s` | 미확정 | s | unverified | 미확보 |
| `damage_per_shot` | 1800 | damage/shot | wiki_snapshot | [CMB-S007](https://cosmoteer.wiki.gg/wiki/Chaingun) |
| `firing_arc_deg` | 220 | degree | wiki_snapshot | [CMB-S007](https://cosmoteer.wiki.gg/wiki/Chaingun) |
| `heat_per_shot` | 600 | MJ/shot | wiki_snapshot | [CMB-S007](https://cosmoteer.wiki.gg/wiki/Chaingun) |
| `heat_per_s` | 미확정 | MJ/s | conflict | [CMB-S007](https://cosmoteer.wiki.gg/wiki/Chaingun) |
| `salvo_size` | 4 | shots/salvo | wiki_snapshot | [CMB-S007](https://cosmoteer.wiki.gg/wiki/Chaingun) |
| `projectile_speed_m_per_s` | instantaneous | m/s | wiki_snapshot | [CMB-S007](https://cosmoteer.wiki.gg/wiki/Chaingun) |
| `damage_per_second` | 미확정 | damage/sec | conflict | [CMB-S007](https://cosmoteer.wiki.gg/wiki/Chaingun) |
| `width_m` | 3 | m | wiki_snapshot | [CMB-S007](https://cosmoteer.wiki.gg/wiki/Chaingun) |
| `height_m` | 6 | m | wiki_snapshot | [CMB-S007](https://cosmoteer.wiki.gg/wiki/Chaingun) |

### 대조 관측값

```json
[
  {
    "field": "shots_per_second",
    "value": [
      2.86,
      30
    ],
    "unit": "shots/sec",
    "source_id": "CMB-S007",
    "status": "conflicting_observation",
    "reason": "OC 네 발 살보와 휴지시간을 포함한 실효 발사율인지 불명. 초당 피해 최대값은 30×1800과 다르다."
  },
  {
    "field": "damage_per_second",
    "value": [
      5143,
      13500
    ],
    "unit": "damage/sec",
    "source_id": "CMB-S007",
    "status": "conflicting_observation",
    "reason": "OC 네 발 살보와 휴지시간을 포함한 실효 발사율인지 불명. 초당 피해 최대값은 30×1800과 다르다."
  },
  {
    "field": "heat_per_s",
    "value": [
      1716,
      18000
    ],
    "unit": "MJ/sec",
    "source_id": "CMB-S007",
    "status": "conflicting_observation",
    "reason": "OC 네 발 살보와 휴지시간을 포함한 실효 발사율인지 불명. 초당 피해 최대값은 30×1800과 다르다."
  },
  {
    "field": "construction_resources",
    "value": {
      "steel": 114,
      "hyper_coils": 38,
      "tri_steel": 45
    },
    "unit": "items",
    "source_id": "CMB-S007",
    "status": "conflicting_wiki_snapshot",
    "reason": "기재 재료의 기준 단가 합계가 같은 인포박스 Value와 불일치. 어느 항목이 오기인지 결정하지 않음."
  },
  {
    "field": "value_credits",
    "value": 24000,
    "unit": "credits",
    "source_id": "CMB-S007",
    "status": "conflicting_wiki_snapshot",
    "reason": "기재 재료의 기준 단가 합계와 불일치."
  },
  {
    "field": "calculated_material_value",
    "value": 23250,
    "unit": "credits",
    "source_ids": [
      "CMB-S007",
      "ECON-CREDITS",
      "ECON-R-STEEL",
      "ECON-R-HYPER-COILS",
      "ECON-R-TRI-STEEL"
    ],
    "status": "derived_cross_check",
    "formula": "sum(material quantity * resource Base Buy Price)",
    "inputs": {
      "steel": {
        "quantity": 114,
        "unit_price": 25
      },
      "hyper_coils": {
        "quantity": 38,
        "unit_price": 300
      },
      "tri_steel": {
        "quantity": 45,
        "unit_price": 200
      }
    },
    "reason": "공개 단가를 사용한 연구자 계산. 원작 Value의 대체 확정값이 아님."
  }
]
```

## 오버클럭 갑판 캐논 (Overclocked Deck Cannon)

- ID: `deck_cannon_overclock`
- 모드: `overclock`
- 버전 범위: {"edition":"Cosmoteer modern Steam","exact_game_version":null,"source_kind":"unversioned_wiki_snapshot","observed_at":"2026-11-17","latest_reference":"0.30.5a","all_fields_verified_for_latest":false}

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `size` | [4,5] | m | wiki_snapshot | [CMB-S006](https://cosmoteer.wiki.gg/wiki/Deck_Cannon) |
| `hp` | 20000 | HP | wiki_snapshot | [CMB-S006](https://cosmoteer.wiki.gg/wiki/Deck_Cannon) |
| `construction_resources` | [{"resource_id":"steel","quantity":200},{"resource_id":"hyper_coils","quantity":30},{"resource_id":"tri_steel","quantity":30}] | item[] | wiki_snapshot | [CMB-S006](https://cosmoteer.wiki.gg/wiki/Deck_Cannon) |
| `value_credits` | 20000 | credits | wiki_snapshot | [CMB-S006](https://cosmoteer.wiki.gg/wiki/Deck_Cannon) |
| `blueprint_cost_credits` | 미확정 | credits | unverified | 미확보 |
| `power_per_shot` | 미확정 | game_power/shot | unverified | 미확보 |
| `power_use_per_s` | 미확정 | game_power/s | unverified | 미확보 |
| `ammo_per_shot` | 10 | ammo/shot | wiki_snapshot | [CMB-S006](https://cosmoteer.wiki.gg/wiki/Deck_Cannon) |
| `range_m` | 380 | m | wiki_snapshot | [CMB-S006](https://cosmoteer.wiki.gg/wiki/Deck_Cannon) |
| `shots_per_second` | 0.4 | shots/s | wiki_snapshot | [CMB-S006](https://cosmoteer.wiki.gg/wiki/Deck_Cannon) |
| `firing_interval_s` | 미확정 | s | unverified | 미확보 |
| `damage_per_shot` | 10200 | damage/shot | wiki_snapshot | [CMB-S006](https://cosmoteer.wiki.gg/wiki/Deck_Cannon) |
| `firing_arc_deg` | 270 | degree | wiki_snapshot | [CMB-S006](https://cosmoteer.wiki.gg/wiki/Deck_Cannon) |
| `heat_per_shot` | 3500 | MJ/shot | wiki_snapshot | [CMB-S006](https://cosmoteer.wiki.gg/wiki/Deck_Cannon) |
| `heat_per_s` | 1400 | MJ/s | wiki_snapshot | [CMB-S006](https://cosmoteer.wiki.gg/wiki/Deck_Cannon) |
| `penetration` | until_damage_exhausted | m | wiki_snapshot | [CMB-S006](https://cosmoteer.wiki.gg/wiki/Deck_Cannon) |
| `crew_stun_time` | [0,1.5] | s | wiki_snapshot | [CMB-S006](https://cosmoteer.wiki.gg/wiki/Deck_Cannon) |
| `crew_stun_radius` | 9 | m | wiki_snapshot | [CMB-S006](https://cosmoteer.wiki.gg/wiki/Deck_Cannon) |
| `projectile_speed_m_per_s` | 미확정 | m/s | conflict | [CMB-S006](https://cosmoteer.wiki.gg/wiki/Deck_Cannon), [CMB-S029](https://steamcommunity.com/app/799600/) |
| `ammo_per_second` | 미확정 | ammo/sec | conflict | [CMB-S006](https://cosmoteer.wiki.gg/wiki/Deck_Cannon) |
| `width_m` | 4 | m | wiki_snapshot | [CMB-S006](https://cosmoteer.wiki.gg/wiki/Deck_Cannon) |
| `height_m` | 5 | m | wiki_snapshot | [CMB-S006](https://cosmoteer.wiki.gg/wiki/Deck_Cannon) |

### 대조 관측값

```json
[
  {
    "field": "projectile_speed_m_per_s",
    "value": 360,
    "unit": "meters/sec",
    "source_id": "CMB-S006",
    "status": "version_uncertain",
    "reason": "0.30.5가 대부분 발사체 속도를 1/6 낮췄지만 적용 대상·색인 반영 여부를 이 항목별로 확인하지 못함. 일괄 5/6 곱셈하지 않음."
  },
  {
    "field": "ammo_per_second",
    "value": 8,
    "unit": "ammo/sec",
    "source_id": "CMB-S006",
    "status": "conflicting_observation",
    "reason": "10 ammo/shot × 0.4 shots/sec와 불일치. 4로 임의 교정하지 않았다."
  }
]
```

## 오버클럭 대형 캐논 (Overclocked Large Cannon)

- ID: `large_cannon_overclock`
- 모드: `overclock`
- 버전 범위: {"edition":"Cosmoteer modern Steam","exact_game_version":null,"source_kind":"unversioned_wiki_snapshot","observed_at":"2026-11-17","latest_reference":"0.30.5a","all_fields_verified_for_latest":false}

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `size` | [3,3] | m | wiki_snapshot | [CMB-S005](https://cosmoteer.wiki.gg/wiki/Large_Cannon) |
| `hp` | 21000 | HP | wiki_snapshot | [CMB-S005](https://cosmoteer.wiki.gg/wiki/Large_Cannon) |
| `construction_resources` | [{"resource_id":"steel","quantity":100},{"resource_id":"coils","quantity":10},{"resource_id":"hyper_coils","quantity":5}] | item[] | wiki_snapshot | [CMB-S005](https://cosmoteer.wiki.gg/wiki/Large_Cannon) |
| `value_credits` | 5000 | credits | wiki_snapshot | [CMB-S005](https://cosmoteer.wiki.gg/wiki/Large_Cannon) |
| `blueprint_cost_credits` | 미확정 | credits | unverified | 미확보 |
| `power_per_shot` | 미확정 | game_power/shot | unverified | 미확보 |
| `power_use_per_s` | 미확정 | game_power/s | unverified | 미확보 |
| `ammo_per_shot` | 4 | ammo/shot | wiki_snapshot | [CMB-S005](https://cosmoteer.wiki.gg/wiki/Large_Cannon) |
| `range_m` | 190 | m | wiki_snapshot | [CMB-S005](https://cosmoteer.wiki.gg/wiki/Large_Cannon) |
| `shots_per_second` | 0.74 | shots/s | wiki_snapshot | [CMB-S005](https://cosmoteer.wiki.gg/wiki/Large_Cannon) |
| `firing_interval_s` | 미확정 | s | unverified | 미확보 |
| `damage_per_shot` | 미확정 | damage/shot | unverified | 미확보 |
| `firing_arc_deg` | 115 | degree | wiki_snapshot | [CMB-S005](https://cosmoteer.wiki.gg/wiki/Large_Cannon) |
| `heat_per_shot` | 1000 | MJ/shot | wiki_snapshot | [CMB-S005](https://cosmoteer.wiki.gg/wiki/Large_Cannon) |
| `heat_per_s` | 740 | MJ/s | wiki_snapshot | [CMB-S005](https://cosmoteer.wiki.gg/wiki/Large_Cannon) |
| `shrapnel_damage` | 100 | damage/shrapnel | wiki_snapshot | [CMB-S005](https://cosmoteer.wiki.gg/wiki/Large_Cannon) |
| `shrapnel_penetration` | 20 | m | wiki_snapshot | [CMB-S005](https://cosmoteer.wiki.gg/wiki/Large_Cannon) |
| `shrapnel_range` | 75 | m | wiki_snapshot | [CMB-S005](https://cosmoteer.wiki.gg/wiki/Large_Cannon) |
| `shrapnel_fire_chance` | 3 | % chance/tile | wiki_snapshot | [CMB-S005](https://cosmoteer.wiki.gg/wiki/Large_Cannon) |
| `shrapnel_count` | 미확정 | shrapnel/shot | unverified | 미확보 |
| `shrapnel_interceptable` | true | boolean | patch_confirmed | [CMB-S029](https://steamcommunity.com/app/799600/) |
| `projectile_speed_m_per_s` | 미확정 | m/s | conflict | [CMB-S005](https://cosmoteer.wiki.gg/wiki/Large_Cannon), [CMB-S029](https://steamcommunity.com/app/799600/) |
| `width_m` | 3 | m | wiki_snapshot | [CMB-S005](https://cosmoteer.wiki.gg/wiki/Large_Cannon) |
| `height_m` | 3 | m | wiki_snapshot | [CMB-S005](https://cosmoteer.wiki.gg/wiki/Large_Cannon) |

### 대조 관측값

```json
[
  {
    "field": "projectile_speed_m_per_s",
    "value": 195,
    "unit": "meters/sec",
    "source_id": "CMB-S005",
    "status": "version_uncertain",
    "reason": "0.30.5가 대부분 발사체 속도를 1/6 낮췄지만 적용 대상·색인 반영 여부를 이 항목별로 확인하지 못함. 일괄 5/6 곱셈하지 않음."
  },
  {
    "field": "shrapnel_projectile_durability",
    "value": "∞",
    "unit": "durability",
    "source_id": "CMB-S005",
    "status": "superseded_or_ambiguous",
    "reason": "0.30.5에서 파편 요격이 가능해졌으므로 무한 내구도로 최신 구현하지 않는다."
  }
]
```

## 오버클럭 레일건 발사 모듈 (Overclocked Railgun Launcher Module)

- ID: `railgun_launcher_overclock`
- 모드: `overclock`
- 버전 범위: {"edition":"Cosmoteer modern Steam","exact_game_version":null,"source_kind":"unversioned_wiki_snapshot","observed_at":"2026-11-17","latest_reference":"0.30.5a","all_fields_verified_for_latest":false}

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `size` | [2,4] | m | wiki_snapshot | [CMB-S012](https://cosmoteer.wiki.gg/wiki/Railgun_Launcher_Module) |
| `hp` | 6000 | HP | wiki_snapshot | [CMB-S012](https://cosmoteer.wiki.gg/wiki/Railgun_Launcher_Module) |
| `construction_resources` | [{"resource_id":"steel","quantity":100},{"resource_id":"hyper_coils","quantity":10},{"resource_id":"tri_steel","quantity":10}] | item[] | wiki_snapshot | [CMB-S012](https://cosmoteer.wiki.gg/wiki/Railgun_Launcher_Module) |
| `value_credits` | 7500 | credits | wiki_snapshot | [CMB-S012](https://cosmoteer.wiki.gg/wiki/Railgun_Launcher_Module) |
| `blueprint_cost_credits` | 10000 | credits | wiki_snapshot | [CMB-S012](https://cosmoteer.wiki.gg/wiki/Railgun_Launcher_Module) |
| `power_per_shot` | 0.5 | game_power/shot | wiki_snapshot | [CMB-S012](https://cosmoteer.wiki.gg/wiki/Railgun_Launcher_Module) |
| `power_use_per_s` | 미확정 | game_power/s | unverified | 미확보 |
| `ammo_per_shot` | 6 | ammo/shot | wiki_snapshot | [CMB-S012](https://cosmoteer.wiki.gg/wiki/Railgun_Launcher_Module) |
| `range_m` | 300 | m | wiki_snapshot | [CMB-S012](https://cosmoteer.wiki.gg/wiki/Railgun_Launcher_Module) |
| `shots_per_second` | 0.25 | shots/s | wiki_snapshot | [CMB-S012](https://cosmoteer.wiki.gg/wiki/Railgun_Launcher_Module) |
| `firing_interval_s` | 미확정 | s | unverified | 미확보 |
| `damage_per_shot` | 20000 | damage/shot | wiki_snapshot | [CMB-S012](https://cosmoteer.wiki.gg/wiki/Railgun_Launcher_Module) |
| `firing_arc_deg` | 미확정 | degree | unverified | 미확보 |
| `heat_per_shot` | 미확정 | MJ/shot | unverified | 미확보 |
| `heat_per_s` | 미확정 | MJ/s | unverified | 미확보 |
| `max_range` | 600 | m | wiki_snapshot | [CMB-S012](https://cosmoteer.wiki.gg/wiki/Railgun_Launcher_Module) |
| `projectile_durability` | 4500 | durability | wiki_snapshot | [CMB-S012](https://cosmoteer.wiki.gg/wiki/Railgun_Launcher_Module) |
| `heat_per_module_per_shot` | 1750 | MJ/part/shot | wiki_snapshot | [CMB-S012](https://cosmoteer.wiki.gg/wiki/Railgun_Launcher_Module) |
| `penetration` | until_damage_exhausted | m | wiki_snapshot | [CMB-S012](https://cosmoteer.wiki.gg/wiki/Railgun_Launcher_Module) |
| `charge_up_base` | 0.5 | s | wiki_snapshot | [CMB-S012](https://cosmoteer.wiki.gg/wiki/Railgun_Launcher_Module) |
| `charge_up_per_accelerator` | 0.13 | seconds/accelerator | wiki_snapshot | [CMB-S012](https://cosmoteer.wiki.gg/wiki/Railgun_Launcher_Module) |
| `projectile_speed_m_per_s` | 미확정 | m/s | conflict | [CMB-S012](https://cosmoteer.wiki.gg/wiki/Railgun_Launcher_Module), [CMB-S029](https://steamcommunity.com/app/799600/) |
| `width_m` | 2 | m | wiki_snapshot | [CMB-S012](https://cosmoteer.wiki.gg/wiki/Railgun_Launcher_Module) |
| `height_m` | 4 | m | wiki_snapshot | [CMB-S012](https://cosmoteer.wiki.gg/wiki/Railgun_Launcher_Module) |

### 대조 관측값

```json
[
  {
    "field": "projectile_speed_m_per_s",
    "value": 864,
    "unit": "meters/sec",
    "source_id": "CMB-S012",
    "status": "version_uncertain",
    "reason": "0.30.5가 대부분 발사체 속도를 1/6 낮췄지만 적용 대상·색인 반영 여부를 이 항목별로 확인하지 못함. 일괄 5/6 곱셈하지 않음."
  }
]
```

## 오버클럭 표준 캐논 (Overclocked Standard Cannon)

- ID: `standard_cannon_overclock`
- 모드: `overclock`
- 버전 범위: {"edition":"Cosmoteer modern Steam","exact_game_version":null,"source_kind":"unversioned_wiki_snapshot","observed_at":"2026-11-17","latest_reference":"0.30.5a","all_fields_verified_for_latest":false}

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `size` | [2,2] | m | wiki_snapshot | [CMB-S004](https://cosmoteer.wiki.gg/wiki/Standard_Cannon) |
| `hp` | 12000 | HP | wiki_snapshot | [CMB-S004](https://cosmoteer.wiki.gg/wiki/Standard_Cannon) |
| `construction_resources` | [{"resource_id":"steel","quantity":48},{"resource_id":"coils","quantity":8}] | item[] | wiki_snapshot | [CMB-S004](https://cosmoteer.wiki.gg/wiki/Standard_Cannon) |
| `value_credits` | 2000 | credits | wiki_snapshot | [CMB-S004](https://cosmoteer.wiki.gg/wiki/Standard_Cannon) |
| `blueprint_cost_credits` | 미확정 | credits | unverified | 미확보 |
| `power_per_shot` | 미확정 | game_power/shot | unverified | 미확보 |
| `power_use_per_s` | 미확정 | game_power/s | unverified | 미확보 |
| `ammo_per_shot` | 1 | ammo/shot | wiki_snapshot | [CMB-S004](https://cosmoteer.wiki.gg/wiki/Standard_Cannon) |
| `range_m` | 190 | m | derived | [CMB-S029](https://steamcommunity.com/app/799600/), [CMB-S004](https://cosmoteer.wiki.gg/wiki/Standard_Cannon) |
| `shots_per_second` | 1.67 | shots/s | wiki_snapshot | [CMB-S004](https://cosmoteer.wiki.gg/wiki/Standard_Cannon) |
| `firing_interval_s` | 미확정 | s | unverified | 미확보 |
| `damage_per_shot` | 750 | damage/shot | wiki_snapshot | [CMB-S004](https://cosmoteer.wiki.gg/wiki/Standard_Cannon) |
| `firing_arc_deg` | 115 | degree | wiki_snapshot | [CMB-S004](https://cosmoteer.wiki.gg/wiki/Standard_Cannon) |
| `heat_per_shot` | 350 | MJ/shot | wiki_snapshot | [CMB-S004](https://cosmoteer.wiki.gg/wiki/Standard_Cannon) |
| `heat_per_s` | 미확정 | MJ/s | conflict | [CMB-S004](https://cosmoteer.wiki.gg/wiki/Standard_Cannon) |
| `penetration` | 5 | m | wiki_snapshot | [CMB-S004](https://cosmoteer.wiki.gg/wiki/Standard_Cannon) |
| `projectile_speed_m_per_s` | 미확정 | m/s | conflict | [CMB-S004](https://cosmoteer.wiki.gg/wiki/Standard_Cannon), [CMB-S029](https://steamcommunity.com/app/799600/) |
| `projectile_speed_matches_normal` | true | boolean | patch_confirmed | [CMB-S029](https://steamcommunity.com/app/799600/) |
| `damage_per_second` | 미확정 | damage/sec | conflict | [CMB-S004](https://cosmoteer.wiki.gg/wiki/Standard_Cannon) |
| `ammo_per_second` | 미확정 | ammo/sec | conflict | [CMB-S004](https://cosmoteer.wiki.gg/wiki/Standard_Cannon) |
| `width_m` | 2 | m | wiki_snapshot | [CMB-S004](https://cosmoteer.wiki.gg/wiki/Standard_Cannon) |
| `height_m` | 2 | m | wiki_snapshot | [CMB-S004](https://cosmoteer.wiki.gg/wiki/Standard_Cannon) |

### 대조 관측값

```json
[
  {
    "field": "range_m",
    "value": 240,
    "unit": "meters",
    "source_id": "CMB-S004",
    "status": "superseded_wiki_snapshot",
    "reason": "패치에서 일반판과 동일 사거리로 변경. 190m는 일반판 위키값과 결합한 값."
  },
  {
    "field": "projectile_speed_m_per_s",
    "value": 300,
    "unit": "meters/sec",
    "source_id": "CMB-S004",
    "status": "version_uncertain",
    "reason": "0.30.5가 대부분 발사체 속도를 1/6 낮췄지만 적용 대상·색인 반영 여부를 이 항목별로 확인하지 못함. 일괄 5/6 곱셈하지 않음."
  },
  {
    "field": "damage_per_second",
    "value": 833,
    "unit": "damage/sec",
    "source_id": "CMB-S004",
    "status": "conflicting_observation",
    "reason": "동일 표의 1.67 shots/sec와 일치하지 않음. 연사/살보의 평균 여부도 불명."
  },
  {
    "field": "ammo_per_second",
    "value": 1.11,
    "unit": "ammo/sec",
    "source_id": "CMB-S004",
    "status": "conflicting_observation",
    "reason": "동일 표의 1.67 shots/sec와 일치하지 않음. 연사/살보의 평균 여부도 불명."
  },
  {
    "field": "heat_per_s",
    "value": 388.5,
    "unit": "MJ/sec",
    "source_id": "CMB-S004",
    "status": "conflicting_observation",
    "reason": "동일 표의 1.67 shots/sec와 일치하지 않음. 연사/살보의 평균 여부도 불명."
  }
]
```

