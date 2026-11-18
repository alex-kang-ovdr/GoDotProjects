# weapon.ballistic · part

[전체 목차](README.md)

각 필드는 값·단위·근거 상태·출처를 함께 읽는다. 영문 명칭은 식별용이며 한국어 명칭은 이 자료의 번역이다.

## 체인건 (Chaingun)

- ID: `chaingun`
- 모드: `normal`
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
| `shots_per_second` | [2.86,30] | shots/s | wiki_snapshot | [CMB-S007](https://cosmoteer.wiki.gg/wiki/Chaingun) |
| `firing_interval_s` | 미확정 | s | unverified | 미확보 |
| `damage_per_shot` | 600 | damage/shot | wiki_snapshot | [CMB-S007](https://cosmoteer.wiki.gg/wiki/Chaingun) |
| `firing_arc_deg` | 220 | degree | wiki_snapshot | [CMB-S007](https://cosmoteer.wiki.gg/wiki/Chaingun) |
| `heat_per_shot` | 미확정 | MJ/shot | unverified | 미확보 |
| `heat_per_s` | 미확정 | MJ/s | unverified | 미확보 |
| `crew_required` | 3 | crew | wiki_snapshot | [CMB-S007](https://cosmoteer.wiki.gg/wiki/Chaingun) |
| `command_points` | -6 | command_point | wiki_snapshot | [CMB-S007](https://cosmoteer.wiki.gg/wiki/Chaingun) |
| `ammo_capacity` | 12 | ammo | wiki_snapshot | [CMB-S007](https://cosmoteer.wiki.gg/wiki/Chaingun) |
| `mass_t` | 39.79 | tonne | wiki_snapshot | [CMB-S007](https://cosmoteer.wiki.gg/wiki/Chaingun) |
| `projectile_speed_m_per_s` | instantaneous | m/s | wiki_snapshot | [CMB-S007](https://cosmoteer.wiki.gg/wiki/Chaingun) |
| `ramp_up_time` | 10 | s | wiki_snapshot | [CMB-S007](https://cosmoteer.wiki.gg/wiki/Chaingun) |
| `closed_shell_damage_resistance` | 70 | % | wiki_snapshot | [CMB-S007](https://cosmoteer.wiki.gg/wiki/Chaingun) |
| `closed_shell_thermal_resistance` | 70 | % | patch_confirmed | [CMB-S029](https://steamcommunity.com/app/799600/) |
| `damage_vs_structure` | 150 | damage (event unit unspecified) | patch_confirmed | [CMB-S029](https://steamcommunity.com/app/799600/) |
| `width_m` | 3 | m | wiki_snapshot | [CMB-S007](https://cosmoteer.wiki.gg/wiki/Chaingun) |
| `height_m` | 6 | m | wiki_snapshot | [CMB-S007](https://cosmoteer.wiki.gg/wiki/Chaingun) |

### 대조 관측값

```json
[
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

## 갑판 캐논 (Deck Cannon)

- ID: `deck_cannon`
- 모드: `normal`
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
| `range_m` | 190 | m | wiki_snapshot | [CMB-S006](https://cosmoteer.wiki.gg/wiki/Deck_Cannon) |
| `shots_per_second` | 0.8 | shots/s | wiki_snapshot | [CMB-S006](https://cosmoteer.wiki.gg/wiki/Deck_Cannon) |
| `firing_interval_s` | 미확정 | s | unverified | 미확보 |
| `damage_per_shot` | 7500 | damage/shot | wiki_snapshot | [CMB-S006](https://cosmoteer.wiki.gg/wiki/Deck_Cannon) |
| `firing_arc_deg` | 270 | degree | wiki_snapshot | [CMB-S006](https://cosmoteer.wiki.gg/wiki/Deck_Cannon) |
| `heat_per_shot` | 미확정 | MJ/shot | unverified | 미확보 |
| `heat_per_s` | 미확정 | MJ/s | unverified | 미확보 |
| `crew_required` | 4 | crew | wiki_snapshot | [CMB-S006](https://cosmoteer.wiki.gg/wiki/Deck_Cannon) |
| `command_points` | -8 | command_point | wiki_snapshot | [CMB-S006](https://cosmoteer.wiki.gg/wiki/Deck_Cannon) |
| `ammo_capacity` | 100 | ammo | wiki_snapshot | [CMB-S006](https://cosmoteer.wiki.gg/wiki/Deck_Cannon) |
| `mass_t` | 27.07 | tonne | wiki_snapshot | [CMB-S006](https://cosmoteer.wiki.gg/wiki/Deck_Cannon) |
| `penetration` | 9 | m | wiki_snapshot | [CMB-S006](https://cosmoteer.wiki.gg/wiki/Deck_Cannon) |
| `fire_chance_per_tile` | 40 | % chance/tile | wiki_snapshot | [CMB-S006](https://cosmoteer.wiki.gg/wiki/Deck_Cannon) |
| `crew_stun_time` | [0,0.5] | s | wiki_snapshot | [CMB-S006](https://cosmoteer.wiki.gg/wiki/Deck_Cannon) |
| `crew_stun_radius` | 6 | m | wiki_snapshot | [CMB-S006](https://cosmoteer.wiki.gg/wiki/Deck_Cannon) |
| `projectile_speed_m_per_s` | 미확정 | m/s | conflict | [CMB-S006](https://cosmoteer.wiki.gg/wiki/Deck_Cannon), [CMB-S029](https://steamcommunity.com/app/799600/) |
| `width_m` | 4 | m | wiki_snapshot | [CMB-S006](https://cosmoteer.wiki.gg/wiki/Deck_Cannon) |
| `height_m` | 5 | m | wiki_snapshot | [CMB-S006](https://cosmoteer.wiki.gg/wiki/Deck_Cannon) |

### 대조 관측값

```json
[
  {
    "field": "projectile_speed_m_per_s",
    "value": 120,
    "unit": "meters/sec",
    "source_id": "CMB-S006",
    "status": "version_uncertain",
    "reason": "0.30.5가 대부분 발사체 속도를 1/6 낮췄지만 적용 대상·색인 반영 여부를 이 항목별로 확인하지 못함. 일괄 5/6 곱셈하지 않음."
  }
]
```

## 대형 캐논 (Large Cannon)

- ID: `large_cannon`
- 모드: `normal`
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
| `damage_per_shot` | 2400 | damage/shot | wiki_snapshot | [CMB-S005](https://cosmoteer.wiki.gg/wiki/Large_Cannon) |
| `firing_arc_deg` | 115 | degree | wiki_snapshot | [CMB-S005](https://cosmoteer.wiki.gg/wiki/Large_Cannon) |
| `heat_per_shot` | 미확정 | MJ/shot | unverified | 미확보 |
| `heat_per_s` | 미확정 | MJ/s | unverified | 미확보 |
| `crew_required` | 2 | crew | wiki_snapshot | [CMB-S005](https://cosmoteer.wiki.gg/wiki/Large_Cannon) |
| `command_points` | -4 | command_point | wiki_snapshot | [CMB-S005](https://cosmoteer.wiki.gg/wiki/Large_Cannon) |
| `ammo_capacity` | 64 | ammo | wiki_snapshot | [CMB-S005](https://cosmoteer.wiki.gg/wiki/Large_Cannon) |
| `mass_t` | 12.29 | tonne | wiki_snapshot | [CMB-S005](https://cosmoteer.wiki.gg/wiki/Large_Cannon) |
| `penetration` | 7 | m | wiki_snapshot | [CMB-S005](https://cosmoteer.wiki.gg/wiki/Large_Cannon) |
| `fire_chance_per_tile` | 40 | % chance/tile | wiki_snapshot | [CMB-S005](https://cosmoteer.wiki.gg/wiki/Large_Cannon) |
| `projectile_durability` | 1000 | durability | wiki_snapshot | [CMB-S005](https://cosmoteer.wiki.gg/wiki/Large_Cannon) |
| `projectile_speed_m_per_s` | 미확정 | m/s | conflict | [CMB-S005](https://cosmoteer.wiki.gg/wiki/Large_Cannon), [CMB-S029](https://steamcommunity.com/app/799600/) |
| `width_m` | 3 | m | wiki_snapshot | [CMB-S005](https://cosmoteer.wiki.gg/wiki/Large_Cannon) |
| `height_m` | 3 | m | wiki_snapshot | [CMB-S005](https://cosmoteer.wiki.gg/wiki/Large_Cannon) |

### 대조 관측값

```json
[
  {
    "field": "projectile_speed_m_per_s",
    "value": 150,
    "unit": "meters/sec",
    "source_id": "CMB-S005",
    "status": "version_uncertain",
    "reason": "0.30.5가 대부분 발사체 속도를 1/6 낮췄지만 적용 대상·색인 반영 여부를 이 항목별로 확인하지 못함. 일괄 5/6 곱셈하지 않음."
  }
]
```

## 레일건 발사 모듈 (Railgun Launcher Module)

- ID: `railgun_launcher`
- 모드: `normal`
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
| `damage_per_shot` | 10000 | damage/shot | wiki_snapshot | [CMB-S012](https://cosmoteer.wiki.gg/wiki/Railgun_Launcher_Module) |
| `firing_arc_deg` | 0 | degree | wiki_snapshot | [CMB-S011](https://cosmoteer.wiki.gg/wiki/Railgun_Loader_Module) |
| `heat_per_shot` | 미확정 | MJ/shot | unverified | 미확보 |
| `heat_per_s` | 미확정 | MJ/s | unverified | 미확보 |
| `command_points` | -1 | command_point | wiki_snapshot | [CMB-S012](https://cosmoteer.wiki.gg/wiki/Railgun_Launcher_Module) |
| `power_capacity` | 2 | game_power | wiki_snapshot | [CMB-S012](https://cosmoteer.wiki.gg/wiki/Railgun_Launcher_Module) |
| `mass_t` | 36 | tonne | wiki_snapshot | [CMB-S012](https://cosmoteer.wiki.gg/wiki/Railgun_Launcher_Module) |
| `max_range` | 600 | m | wiki_snapshot | [CMB-S012](https://cosmoteer.wiki.gg/wiki/Railgun_Launcher_Module) |
| `penetration` | 15 | m | wiki_snapshot | [CMB-S012](https://cosmoteer.wiki.gg/wiki/Railgun_Launcher_Module) |
| `width_m` | 2 | m | wiki_snapshot | [CMB-S012](https://cosmoteer.wiki.gg/wiki/Railgun_Launcher_Module) |
| `height_m` | 4 | m | wiki_snapshot | [CMB-S012](https://cosmoteer.wiki.gg/wiki/Railgun_Launcher_Module) |

### 적용 메모

- 기본탄 수치는 장전기+발사기 조합, 추가 가속기 버프 전의 값. 부품별 전력과 무기당 탄약을 구분한다.

## 표준 캐논 (Standard Cannon)

- ID: `standard_cannon`
- 모드: `normal`
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
| `range_m` | 190 | m | wiki_snapshot | [CMB-S004](https://cosmoteer.wiki.gg/wiki/Standard_Cannon) |
| `shots_per_second` | 1.11 | shots/s | wiki_snapshot | [CMB-S004](https://cosmoteer.wiki.gg/wiki/Standard_Cannon) |
| `firing_interval_s` | 미확정 | s | unverified | 미확보 |
| `damage_per_shot` | 750 | damage/shot | wiki_snapshot | [CMB-S004](https://cosmoteer.wiki.gg/wiki/Standard_Cannon) |
| `firing_arc_deg` | 115 | degree | wiki_snapshot | [CMB-S004](https://cosmoteer.wiki.gg/wiki/Standard_Cannon) |
| `heat_per_shot` | 미확정 | MJ/shot | unverified | 미확보 |
| `heat_per_s` | 미확정 | MJ/s | unverified | 미확보 |
| `crew_required` | 1 | crew | wiki_snapshot | [CMB-S004](https://cosmoteer.wiki.gg/wiki/Standard_Cannon) |
| `command_points` | -2 | command_point | wiki_snapshot | [CMB-S004](https://cosmoteer.wiki.gg/wiki/Standard_Cannon) |
| `ammo_capacity` | 16 | ammo | wiki_snapshot | [CMB-S004](https://cosmoteer.wiki.gg/wiki/Standard_Cannon) |
| `mass_t` | 4.44 | tonne | wiki_snapshot | [CMB-S004](https://cosmoteer.wiki.gg/wiki/Standard_Cannon) |
| `penetration` | 5 | m | wiki_snapshot | [CMB-S004](https://cosmoteer.wiki.gg/wiki/Standard_Cannon) |
| `fire_chance_per_tile` | 40 | % chance/tile | wiki_snapshot | [CMB-S004](https://cosmoteer.wiki.gg/wiki/Standard_Cannon) |
| `projectile_durability` | 175 | durability | wiki_snapshot | [CMB-S004](https://cosmoteer.wiki.gg/wiki/Standard_Cannon) |
| `projectile_speed_m_per_s` | 미확정 | m/s | conflict | [CMB-S004](https://cosmoteer.wiki.gg/wiki/Standard_Cannon), [CMB-S029](https://steamcommunity.com/app/799600/) |
| `width_m` | 2 | m | wiki_snapshot | [CMB-S004](https://cosmoteer.wiki.gg/wiki/Standard_Cannon) |
| `height_m` | 2 | m | wiki_snapshot | [CMB-S004](https://cosmoteer.wiki.gg/wiki/Standard_Cannon) |

### 대조 관측값

```json
[
  {
    "field": "projectile_speed_m_per_s",
    "value": 240,
    "unit": "meters/sec",
    "source_id": "CMB-S004",
    "status": "version_uncertain",
    "reason": "0.30.5가 대부분 발사체 속도를 1/6 낮췄지만 적용 대상·색인 반영 여부를 이 항목별로 확인하지 못함. 일괄 5/6 곱셈하지 않음."
  }
]
```

