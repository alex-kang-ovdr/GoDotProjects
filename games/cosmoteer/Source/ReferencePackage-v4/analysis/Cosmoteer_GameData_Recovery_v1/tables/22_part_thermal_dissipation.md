# thermal.dissipation · part

[전체 목차](README.md)

각 필드는 값·단위·근거 상태·출처를 함께 읽는다. 영문 명칭은 식별용이며 한국어 명칭은 이 자료의 번역이다.

## 방열기 (Radiator)

- ID: `radiator`
- 모드: `normal`
- 버전 범위: {"edition":"Cosmoteer modern Steam","exact_game_version":null,"source_kind":"unversioned_wiki_snapshot","observed_at":"2026-11-17","latest_reference":"0.30.5a","all_fields_verified_for_latest":false}

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `size` | [1,4] | m | wiki_snapshot | [CMB-S022](https://cosmoteer.wiki.gg/wiki/Radiator) |
| `hp` | 3000 | HP | patch_confirmed | [CMB-S029](https://steamcommunity.com/app/799600/) |
| `construction_resources` | [{"resource_id":"steel","quantity":48},{"resource_id":"coils","quantity":52},{"resource_id":"hyper_coils","quantity":12}] | item[] | wiki_snapshot | [CMB-S022](https://cosmoteer.wiki.gg/wiki/Radiator) |
| `value_credits` | 10000 | credits | wiki_snapshot | [CMB-S022](https://cosmoteer.wiki.gg/wiki/Radiator) |
| `blueprint_cost_credits` | 5000 | credits | wiki_snapshot | [CMB-S022](https://cosmoteer.wiki.gg/wiki/Radiator) |
| `heat_capacity` | 미확정 | MJ | unverified | 미확보 |
| `heat_per_s` | -1100 | MJ/s | wiki_snapshot | [CMB-S022](https://cosmoteer.wiki.gg/wiki/Radiator) |
| `power_use_per_s` | 미확정 | game_power/s | unverified | 미확보 |
| `command_points` | -5 | command_point | wiki_snapshot | [CMB-S022](https://cosmoteer.wiki.gg/wiki/Radiator) |
| `mass_t` | 3 | tonne | wiki_snapshot | [CMB-S022](https://cosmoteer.wiki.gg/wiki/Radiator) |
| `width_m` | 1 | m | wiki_snapshot | [CMB-S022](https://cosmoteer.wiki.gg/wiki/Radiator) |
| `height_m` | 4 | m | wiki_snapshot | [CMB-S022](https://cosmoteer.wiki.gg/wiki/Radiator) |

### 적용 메모

- Heat Generation의 음수는 방열이다. 전방 폐색 시 효과가 줄어들기 때문에 항상 1100MJ/sec를 보장하는 값으로 쓰지 않는다.

### 대조 관측값

```json
[
  {
    "field": "hp",
    "value": 4000,
    "unit": "HP",
    "source_id": "CMB-S022",
    "status": "superseded_wiki_snapshot",
    "reason": "0.30.5 공식 HP 4000→3000."
  },
  {
    "field": "game_id",
    "value": "thermal_battery",
    "unit": "game identifier",
    "source_id": "CMB-S022",
    "status": "suspected_copy_error",
    "reason": "동일한 ID가 별도 Thermal Battery에도 쓰여 있어 복사 오류 가능성이 높다. 임의로 radiator라고 고치지 않았다."
  }
]
```

