# thermal.transport · part

[전체 목차](README.md)

각 필드는 값·단위·근거 상태·출처를 함께 읽는다. 영문 명칭은 식별용이며 한국어 명칭은 이 자료의 번역이다.

## 열 파이프 (Heat Pipe)

- ID: `heat_pipe`
- 모드: `normal`
- 버전 범위: {"edition":"Cosmoteer modern Steam","exact_game_version":null,"source_kind":"unversioned_wiki_snapshot","observed_at":"2026-11-17","latest_reference":"0.30.5a","all_fields_verified_for_latest":false}

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `size` | [1,1] | m | wiki_snapshot | [CMB-S020](https://cosmoteer.wiki.gg/wiki/Heat_Pipe) |
| `hp` | 1000 | HP | wiki_snapshot | [CMB-S020](https://cosmoteer.wiki.gg/wiki/Heat_Pipe) |
| `construction_resources` | [{"resource_id":"steel","quantity":4},{"resource_id":"coils","quantity":2}] | item[] | wiki_snapshot | [CMB-S020](https://cosmoteer.wiki.gg/wiki/Heat_Pipe) |
| `value_credits` | 300 | credits | wiki_snapshot | [CMB-S020](https://cosmoteer.wiki.gg/wiki/Heat_Pipe) |
| `blueprint_cost_credits` | 5000 | credits | wiki_snapshot | [CMB-S020](https://cosmoteer.wiki.gg/wiki/Heat_Pipe) |
| `heat_capacity` | 미확정 | MJ | unverified | 미확보 |
| `heat_per_s` | 미확정 | MJ/s | unverified | 미확보 |
| `power_use_per_s` | 미확정 | game_power/s | unverified | 미확보 |
| `mass_t` | 1 | tonne | wiki_snapshot | [CMB-S020](https://cosmoteer.wiki.gg/wiki/Heat_Pipe) |
| `width_m` | 1 | m | wiki_snapshot | [CMB-S020](https://cosmoteer.wiki.gg/wiki/Heat_Pipe) |
| `height_m` | 1 | m | wiki_snapshot | [CMB-S020](https://cosmoteer.wiki.gg/wiki/Heat_Pipe) |
| `transfer_model` | instantaneous_connected_network | enum | wiki_snapshot | [V2-CMB-HEAT-PIPE](https://cosmoteer.wiki.gg/wiki/Heat_Pipe) |

## 열 파이프 횡단로 (Heat Pipe Crossing)

- ID: `heat_pipe_crossing`
- 모드: `normal`
- 버전 범위: {"edition":"Cosmoteer modern Steam","exact_game_version":null,"source_kind":"unversioned_wiki_snapshot","observed_at":"2026-11-17","latest_reference":"0.30.5a","all_fields_verified_for_latest":false}

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `size` | [1,1] | m | wiki_snapshot | [CMB-S021](https://cosmoteer.wiki.gg/wiki/Heat_Pipe_Crossing) |
| `hp` | 1000 | HP | wiki_snapshot | [CMB-S021](https://cosmoteer.wiki.gg/wiki/Heat_Pipe_Crossing) |
| `construction_resources` | [{"resource_id":"steel","quantity":4},{"resource_id":"coils","quantity":2}] | item[] | wiki_snapshot | [CMB-S021](https://cosmoteer.wiki.gg/wiki/Heat_Pipe_Crossing) |
| `value_credits` | 300 | credits | wiki_snapshot | [CMB-S021](https://cosmoteer.wiki.gg/wiki/Heat_Pipe_Crossing) |
| `blueprint_cost_credits` | 5000 | credits | wiki_snapshot | [CMB-S021](https://cosmoteer.wiki.gg/wiki/Heat_Pipe_Crossing) |
| `heat_capacity` | 미확정 | MJ | unverified | 미확보 |
| `heat_per_s` | 미확정 | MJ/s | unverified | 미확보 |
| `power_use_per_s` | 미확정 | game_power/s | unverified | 미확보 |
| `mass_t` | 1 | tonne | wiki_snapshot | [CMB-S021](https://cosmoteer.wiki.gg/wiki/Heat_Pipe_Crossing) |
| `crew_speed` | 80 | % | wiki_snapshot | [CMB-S021](https://cosmoteer.wiki.gg/wiki/Heat_Pipe_Crossing) |
| `width_m` | 1 | m | wiki_snapshot | [CMB-S021](https://cosmoteer.wiki.gg/wiki/Heat_Pipe_Crossing) |
| `height_m` | 1 | m | wiki_snapshot | [CMB-S021](https://cosmoteer.wiki.gg/wiki/Heat_Pipe_Crossing) |
| `automatically_connects_nearby_pipes` | false | boolean | wiki_snapshot | [V2-CMB-HEAT-CROSSING](https://cosmoteer.wiki.gg/wiki/Heat_Pipe_Crossing) |
| `crew_crossing_requires_doors` | true | boolean | wiki_snapshot | [V2-CMB-HEAT-CROSSING](https://cosmoteer.wiki.gg/wiki/Heat_Pipe_Crossing) |

## 외부 구조형 열 파이프 (Heat Pipe Structure)

- ID: `heat_pipe_structure`
- 모드: `normal`
- 버전 범위: {"edition":"Cosmoteer modern Steam","exact_game_version":null,"source_kind":"unversioned_wiki_snapshot","observed_at":"2026-11-17","latest_reference":"0.30.5a","all_fields_verified_for_latest":false}

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `size` | 미확정 | m | unverified | 미확보 |
| `hp` | 미확정 | HP | unverified | 미확보 |
| `construction_resources` | 미확정 | item | unverified | 미확보 |
| `value_credits` | 미확정 | credits | unverified | 미확보 |
| `blueprint_cost_credits` | 미확정 | credits | unverified | 미확보 |
| `heat_capacity` | 미확정 | MJ | unverified | 미확보 |
| `heat_per_s` | 미확정 | MJ/s | unverified | 미확보 |
| `power_use_per_s` | 미확정 | game_power/s | unverified | 미확보 |
| `part_exists` | true | boolean | patch_confirmed | [CMB-S030](https://store.steampowered.com/news/posts/?appids=799600&enddate=1756769273&feed=steam_community_announcements) |

### 적용 메모

- 0.30.0 공지에서 외부 구조형 변형의 존재만 확인. 일반 열 파이프의 비용·체력·게임 ID를 복사하지 않았다.

