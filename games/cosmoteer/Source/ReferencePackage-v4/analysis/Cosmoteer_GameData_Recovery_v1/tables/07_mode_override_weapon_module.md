# weapon.module · mode_override

[전체 목차](README.md)

각 필드는 값·단위·근거 상태·출처를 함께 읽는다. 영문 명칭은 식별용이며 한국어 명칭은 이 자료의 번역이다.

## 오버클럭 레일건 가속 모듈 (Overclocked Railgun Accelerator Module)

- ID: `railgun_accelerator_overclock`
- 모드: `overclock`
- 버전 범위: {"edition":"Cosmoteer modern Steam","exact_game_version":null,"source_kind":"unversioned_wiki_snapshot","observed_at":"2026-11-17","latest_reference":"0.30.5a","all_fields_verified_for_latest":false}

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `size` | [2,3] | m | wiki_snapshot | [CMB-S013](https://cosmoteer.wiki.gg/wiki/Railgun_Accelerator_Module) |
| `hp` | 6000 | HP | wiki_snapshot | [CMB-S013](https://cosmoteer.wiki.gg/wiki/Railgun_Accelerator_Module) |
| `construction_resources` | 미확정 | item | conflict | [CMB-S013](https://cosmoteer.wiki.gg/wiki/Railgun_Accelerator_Module), [ECON-CREDITS](https://cosmoteer.wiki.gg/wiki/Credits), [ECON-R-STEEL](https://cosmoteer.wiki.gg/wiki/Steel), [ECON-R-HYPER-COILS](https://cosmoteer.wiki.gg/wiki/Hyper-Coils), [ECON-R-TRI-STEEL](https://cosmoteer.wiki.gg/wiki/Tri-Steel) |
| `value_credits` | 미확정 | credits | conflict | [CMB-S013](https://cosmoteer.wiki.gg/wiki/Railgun_Accelerator_Module), [ECON-CREDITS](https://cosmoteer.wiki.gg/wiki/Credits), [ECON-R-STEEL](https://cosmoteer.wiki.gg/wiki/Steel), [ECON-R-HYPER-COILS](https://cosmoteer.wiki.gg/wiki/Hyper-Coils), [ECON-R-TRI-STEEL](https://cosmoteer.wiki.gg/wiki/Tri-Steel) |
| `blueprint_cost_credits` | 미확정 | credits | unverified | 미확보 |
| `power_per_shot` | 0.5 | game_power/shot | wiki_snapshot | [CMB-S013](https://cosmoteer.wiki.gg/wiki/Railgun_Accelerator_Module) |
| `buff_formula` | 20% * X | % bonus; X = accelerator count | wiki_snapshot | [CMB-S013](https://cosmoteer.wiki.gg/wiki/Railgun_Accelerator_Module) |
| `width_m` | 2 | m | wiki_snapshot | [CMB-S013](https://cosmoteer.wiki.gg/wiki/Railgun_Accelerator_Module) |
| `height_m` | 3 | m | wiki_snapshot | [CMB-S013](https://cosmoteer.wiki.gg/wiki/Railgun_Accelerator_Module) |

### 대조 관측값

```json
[
  {
    "field": "construction_resources",
    "value": {
      "steel": 76,
      "hyper_coils": 10,
      "tri_steel": 10
    },
    "unit": "items",
    "source_id": "CMB-S013",
    "status": "conflicting_wiki_snapshot",
    "reason": "기재 재료의 기준 단가 합계가 같은 인포박스 Value와 불일치. 어느 항목이 오기인지 결정하지 않음."
  },
  {
    "field": "value_credits",
    "value": 7500,
    "unit": "credits",
    "source_id": "CMB-S013",
    "status": "conflicting_wiki_snapshot",
    "reason": "기재 재료의 기준 단가 합계와 불일치."
  },
  {
    "field": "calculated_material_value",
    "value": 6900,
    "unit": "credits",
    "source_ids": [
      "CMB-S013",
      "ECON-CREDITS",
      "ECON-R-STEEL",
      "ECON-R-HYPER-COILS",
      "ECON-R-TRI-STEEL"
    ],
    "status": "derived_cross_check",
    "formula": "sum(material quantity * resource Base Buy Price)",
    "inputs": {
      "steel": {
        "quantity": 76,
        "unit_price": 25
      },
      "hyper_coils": {
        "quantity": 10,
        "unit_price": 300
      },
      "tri_steel": {
        "quantity": 10,
        "unit_price": 200
      }
    },
    "reason": "공개 단가를 사용한 연구자 계산. 원작 Value의 대체 확정값이 아님."
  }
]
```

