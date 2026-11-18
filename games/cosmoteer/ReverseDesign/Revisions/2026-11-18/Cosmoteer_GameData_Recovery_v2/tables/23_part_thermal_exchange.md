# thermal.exchange · part

[전체 목차](README.md)

각 필드는 값·단위·근거 상태·출처를 함께 읽는다. 영문 명칭은 식별용이며 한국어 명칭은 이 자료의 번역이다.

## 열교환기 (Heat Exchanger)

- ID: `heat_exchanger`
- 모드: `normal`
- 버전 범위: {"edition":"Cosmoteer modern Steam","exact_game_version":null,"source_kind":"unversioned_wiki_snapshot","observed_at":"2026-11-17","latest_reference":"0.30.5a","all_fields_verified_for_latest":false}

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `size` | [1,1] | m | wiki_snapshot | [CMB-S024](https://cosmoteer.wiki.gg/wiki/Heat_Exchanger) |
| `hp` | 1000 | HP | wiki_snapshot | [CMB-S024](https://cosmoteer.wiki.gg/wiki/Heat_Exchanger) |
| `construction_resources` | [{"resource_id":"steel","quantity":8},{"resource_id":"coils","quantity":3}] | item[] | wiki_snapshot | [CMB-S024](https://cosmoteer.wiki.gg/wiki/Heat_Exchanger) |
| `value_credits` | 500 | credits | wiki_snapshot | [CMB-S024](https://cosmoteer.wiki.gg/wiki/Heat_Exchanger) |
| `blueprint_cost_credits` | 5000 | credits | wiki_snapshot | [CMB-S024](https://cosmoteer.wiki.gg/wiki/Heat_Exchanger) |
| `heat_capacity` | 미확정 | MJ | unverified | 미확보 |
| `heat_per_s` | 미확정 | MJ/s | unverified | 미확보 |
| `power_use_per_s` | 미확정 | game_power/s | unverified | 미확보 |
| `mass_t` | 1 | tonne | wiki_snapshot | [CMB-S024](https://cosmoteer.wiki.gg/wiki/Heat_Exchanger) |
| `maximum_hull_heat_absorption` | 900 | MJ/s | wiki_snapshot | [CMB-S024](https://cosmoteer.wiki.gg/wiki/Heat_Exchanger) |
| `absorption_radius` | 미확정 | m | unverified | 미확보 |
| `waste_heat_multiplier` | 미확정 | ratio | unverified | 미확보 |
| `width_m` | 1 | m | wiki_snapshot | [CMB-S024](https://cosmoteer.wiki.gg/wiki/Heat_Exchanger) |
| `height_m` | 1 | m | wiki_snapshot | [CMB-S024](https://cosmoteer.wiki.gg/wiki/Heat_Exchanger) |
| `absorption_target` | hull_tiles_in_radius | enum | wiki_snapshot | [V2-CMB-EXCHANGER](https://cosmoteer.wiki.gg/wiki/Heat_Exchanger) |
| `partial_part_coverage_leaves_fire_risk` | true | boolean | wiki_snapshot | [V2-CMB-EXCHANGER](https://cosmoteer.wiki.gg/wiki/Heat_Exchanger) |

