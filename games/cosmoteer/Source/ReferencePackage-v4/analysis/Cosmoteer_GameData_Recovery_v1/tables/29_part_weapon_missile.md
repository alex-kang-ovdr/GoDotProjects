# weapon.missile · part

[전체 목차](README.md)

각 필드는 값·단위·근거 상태·출처를 함께 읽는다. 영문 명칭은 식별용이며 한국어 명칭은 이 자료의 번역이다.

## 미사일·기뢰 발사기 (Missile & Mine Launcher)

- ID: `missile_mine_launcher`
- 모드: `normal`
- 버전 범위: {"edition":"Cosmoteer modern Steam","exact_game_version":null,"source_kind":"unversioned_wiki_snapshot","observed_at":"2026-11-17","latest_reference":"0.30.5a","all_fields_verified_for_latest":false}

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `size` | [2,4] | m | wiki_snapshot | [CMB-S014](https://cosmoteer.wiki.gg/wiki/Missile) |
| `hp` | 6000 | HP | wiki_snapshot | [CMB-S014](https://cosmoteer.wiki.gg/wiki/Missile) |
| `construction_resources` | [{"resource_id":"steel","quantity":60},{"resource_id":"hyper_coils","quantity":20},{"resource_id":"processor","quantity":1}] | item[] | wiki_snapshot | [CMB-S014](https://cosmoteer.wiki.gg/wiki/Missile) |
| `value_credits` | 10000 | credits | wiki_snapshot | [CMB-S014](https://cosmoteer.wiki.gg/wiki/Missile) |
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
| `crew_required` | 2 | crew | wiki_snapshot | [CMB-S014](https://cosmoteer.wiki.gg/wiki/Missile) |
| `command_points` | -5 | command_point | wiki_snapshot | [CMB-S014](https://cosmoteer.wiki.gg/wiki/Missile) |
| `mass_t` | 8 | tonne | wiki_snapshot | [CMB-S014](https://cosmoteer.wiki.gg/wiki/Missile) |
| `ammo_capacity` | {"HE":3,"EMP":1,"nuclear":1,"mine":6,"thermal_canister":2} | assembled munitions | wiki_snapshot | [CMB-S014](https://cosmoteer.wiki.gg/wiki/Missile) |
| `width_m` | 2 | m | wiki_snapshot | [CMB-S014](https://cosmoteer.wiki.gg/wiki/Missile) |
| `height_m` | 4 | m | wiki_snapshot | [CMB-S014](https://cosmoteer.wiki.gg/wiki/Missile) |

### 적용 메모

- 탄종별 피해·발사율·사거리는 munition 레코드에 분리했다. 탄약 보유량은 완성 탄체 단위이다.

