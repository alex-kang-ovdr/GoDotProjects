# defense.shield · part

[전체 목차](README.md)

각 필드는 값·단위·근거 상태·출처를 함께 읽는다. 영문 명칭은 식별용이며 한국어 명칭은 이 자료의 번역이다.

## 대형 실드 생성기 (Large Shield Generator)

- ID: `large_shield_generator`
- 모드: `normal`
- 버전 범위: {"edition":"Cosmoteer modern Steam","exact_game_version":null,"source_kind":"unversioned_wiki_snapshot","observed_at":"2026-11-17","latest_reference":"0.30.5a","all_fields_verified_for_latest":false}

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `size` | [3,6] | m | wiki_snapshot | [CMB-S018](https://cosmoteer.wiki.gg/wiki/Large_Shield_Generator) |
| `hp` | 12000 | HP | wiki_snapshot | [CMB-S018](https://cosmoteer.wiki.gg/wiki/Large_Shield_Generator) |
| `construction_resources` | 미확정 | item | conflict | [CMB-S018](https://cosmoteer.wiki.gg/wiki/Large_Shield_Generator), [ECON-CREDITS](https://cosmoteer.wiki.gg/wiki/Credits), [ECON-R-STEEL](https://cosmoteer.wiki.gg/wiki/Steel), [ECON-R-COILS](https://cosmoteer.wiki.gg/wiki/Coils), [ECON-R-DIAMONDS](https://cosmoteer.wiki.gg/wiki/Diamonds) |
| `value_credits` | 미확정 | credits | conflict | [CMB-S018](https://cosmoteer.wiki.gg/wiki/Large_Shield_Generator), [ECON-CREDITS](https://cosmoteer.wiki.gg/wiki/Credits), [ECON-R-STEEL](https://cosmoteer.wiki.gg/wiki/Steel), [ECON-R-COILS](https://cosmoteer.wiki.gg/wiki/Coils), [ECON-R-DIAMONDS](https://cosmoteer.wiki.gg/wiki/Diamonds) |
| `blueprint_cost_credits` | 10000 | credits | wiki_snapshot | [CMB-S018](https://cosmoteer.wiki.gg/wiki/Large_Shield_Generator) |
| `power_use_per_s` | 0.2 | game_power/s | wiki_snapshot | [CMB-S018](https://cosmoteer.wiki.gg/wiki/Large_Shield_Generator) |
| `shield_strength` | 45000 | shield strength | wiki_snapshot | [CMB-S018](https://cosmoteer.wiki.gg/wiki/Large_Shield_Generator) |
| `shield_arc` | 160 | degree | wiki_snapshot | [CMB-S018](https://cosmoteer.wiki.gg/wiki/Large_Shield_Generator) |
| `shield_distance` | 11.5 | m | wiki_snapshot | [CMB-S018](https://cosmoteer.wiki.gg/wiki/Large_Shield_Generator) |
| `shield_penetration_resist` | -75 | m | wiki_snapshot | [CMB-S018](https://cosmoteer.wiki.gg/wiki/Large_Shield_Generator) |
| `heat_per_s` | 미확정 | MJ/s | unverified | 미확보 |
| `command_points` | -6 | command_point | wiki_snapshot | [CMB-S018](https://cosmoteer.wiki.gg/wiki/Large_Shield_Generator) |
| `power_capacity` | 18 | game_power | wiki_snapshot | [CMB-S018](https://cosmoteer.wiki.gg/wiki/Large_Shield_Generator) |
| `mass_t` | 12.65 | tonne | wiki_snapshot | [CMB-S018](https://cosmoteer.wiki.gg/wiki/Large_Shield_Generator) |
| `width_m` | 3 | m | wiki_snapshot | [CMB-S018](https://cosmoteer.wiki.gg/wiki/Large_Shield_Generator) |
| `height_m` | 6 | m | wiki_snapshot | [CMB-S018](https://cosmoteer.wiki.gg/wiki/Large_Shield_Generator) |
| `power_per_1000_damage` | 미확정 | game_power/1000_damage | unverified | 미확보 |
| `projection_through_nonstructure_hull` | false | boolean | wiki_snapshot | [V2-CMB-LARGE-SHIELD](https://cosmoteer.wiki.gg/wiki/Large_Shield_Generator) |
| `structure_blocks_projection` | false | boolean | wiki_snapshot | [V2-CMB-LARGE-SHIELD](https://cosmoteer.wiki.gg/wiki/Large_Shield_Generator) |
| `occlusion_reduces_effective_arc` | true | boolean | wiki_snapshot | [V2-CMB-LARGE-SHIELD](https://cosmoteer.wiki.gg/wiki/Large_Shield_Generator) |

### 적용 메모

- 크기 3×6m는 원문 Size 표기이며 실내 보행 면적이나 3×4 본체와 전방 금지구역을 분리한 값으로 바꾸지 않았다.

### 대조 관측값

```json
[
  {
    "field": "construction_resources",
    "value": {
      "steel": 120,
      "coils": 30,
      "diamonds": 2
    },
    "unit": "items",
    "source_id": "CMB-S018",
    "status": "conflicting_wiki_snapshot",
    "reason": "기재 재료의 기준 단가 합계가 같은 인포박스 Value와 불일치. 어느 항목이 오기인지 결정하지 않음."
  },
  {
    "field": "value_credits",
    "value": 20000,
    "unit": "credits",
    "source_id": "CMB-S018",
    "status": "conflicting_wiki_snapshot",
    "reason": "기재 재료의 기준 단가 합계와 불일치."
  },
  {
    "field": "calculated_material_value",
    "value": 14000,
    "unit": "credits",
    "source_ids": [
      "CMB-S018",
      "ECON-CREDITS",
      "ECON-R-STEEL",
      "ECON-R-COILS",
      "ECON-R-DIAMONDS"
    ],
    "status": "derived_cross_check",
    "formula": "sum(material quantity * resource Base Buy Price)",
    "inputs": {
      "steel": {
        "quantity": 120,
        "unit_price": 25
      },
      "coils": {
        "quantity": 30,
        "unit_price": 100
      },
      "diamonds": {
        "quantity": 2,
        "unit_price": 4000
      }
    },
    "reason": "공개 단가를 사용한 연구자 계산. 원작 Value의 대체 확정값이 아님."
  }
]
```

## 소형 실드 생성기 (Small Shield Generator)

- ID: `small_shield_generator`
- 모드: `normal`
- 버전 범위: {"edition":"Cosmoteer modern Steam","exact_game_version":null,"source_kind":"unversioned_wiki_snapshot","observed_at":"2026-11-17","latest_reference":"0.30.5a","all_fields_verified_for_latest":false}

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `size` | [2,3] | m | wiki_snapshot | [CMB-S017](https://cosmoteer.wiki.gg/wiki/Small_Shield_Generator) |
| `hp` | 6000 | HP | wiki_snapshot | [CMB-S017](https://cosmoteer.wiki.gg/wiki/Small_Shield_Generator) |
| `construction_resources` | [{"resource_id":"steel","quantity":40},{"resource_id":"coils","quantity":40}] | item[] | wiki_snapshot | [CMB-S017](https://cosmoteer.wiki.gg/wiki/Small_Shield_Generator) |
| `value_credits` | 5000 | credits | wiki_snapshot | [CMB-S017](https://cosmoteer.wiki.gg/wiki/Small_Shield_Generator) |
| `blueprint_cost_credits` | 2500 | credits | wiki_snapshot | [CMB-S017](https://cosmoteer.wiki.gg/wiki/Small_Shield_Generator) |
| `power_use_per_s` | 0.1 | game_power/s | wiki_snapshot | [CMB-S017](https://cosmoteer.wiki.gg/wiki/Small_Shield_Generator) |
| `shield_strength` | 15000 | shield strength | wiki_snapshot | [CMB-S017](https://cosmoteer.wiki.gg/wiki/Small_Shield_Generator) |
| `shield_arc` | 90 | degree | wiki_snapshot | [CMB-S017](https://cosmoteer.wiki.gg/wiki/Small_Shield_Generator) |
| `shield_distance` | 6 | m | wiki_snapshot | [CMB-S017](https://cosmoteer.wiki.gg/wiki/Small_Shield_Generator) |
| `shield_penetration_resist` | -25 | m | wiki_snapshot | [CMB-S017](https://cosmoteer.wiki.gg/wiki/Small_Shield_Generator) |
| `heat_per_s` | 미확정 | MJ/s | unverified | 미확보 |
| `command_points` | -3 | command_point | wiki_snapshot | [CMB-S017](https://cosmoteer.wiki.gg/wiki/Small_Shield_Generator) |
| `power_capacity` | 6 | game_power | wiki_snapshot | [CMB-S017](https://cosmoteer.wiki.gg/wiki/Small_Shield_Generator) |
| `mass_t` | 6 | tonne | wiki_snapshot | [CMB-S017](https://cosmoteer.wiki.gg/wiki/Small_Shield_Generator) |
| `width_m` | 2 | m | wiki_snapshot | [CMB-S017](https://cosmoteer.wiki.gg/wiki/Small_Shield_Generator) |
| `height_m` | 3 | m | wiki_snapshot | [CMB-S017](https://cosmoteer.wiki.gg/wiki/Small_Shield_Generator) |
| `power_per_1000_damage` | 0.4 | game_power/1000_damage | wiki_snapshot | [V2-CMB-BATTERIES](https://cosmoteer.wiki.gg/wiki/Batteries) |
| `projection_through_own_hull` | true | boolean | wiki_snapshot | [V2-CMB-SMALL-SHIELD](https://cosmoteer.wiki.gg/wiki/Small_Shield_Generator) |

