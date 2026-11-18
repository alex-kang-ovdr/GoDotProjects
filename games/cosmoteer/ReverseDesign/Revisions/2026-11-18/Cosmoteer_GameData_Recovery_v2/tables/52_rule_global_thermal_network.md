# global.thermal_network · rule

[전체 목차](README.md)

각 필드는 값·단위·근거 상태·출처를 함께 읽는다. 영문 명칭은 식별용이며 한국어 명칭은 이 자료의 번역이다.

## 열망·선체 열 분리 규칙 (Thermal Network and Hull Heat Separation)

- ID: `thermal_network_rules`
- 모드: `not_applicable`
- 버전 범위: Modern Steam; field sources distinguish stable patch history and unversioned wiki; installed 0.30.5a binary unverified

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `network_and_hull_heat_are_distinct` | true | boolean | patch_confirmed | [V2-CMB-PATCH-0300](https://store.steampowered.com/news/posts/?appids=799600&enddate=1756769273&feed=steam_community_announcements) |
| `connections_use_explicit_part_ports` | true | boolean | patch_confirmed | [V2-CMB-PATCH-0300](https://store.steampowered.com/news/posts/?appids=799600&enddate=1756769273&feed=steam_community_announcements) |
| `ports_always_equal_door_locations` | false | boolean | patch_confirmed | [V2-CMB-PATCH-0300](https://store.steampowered.com/news/posts/?appids=799600&enddate=1756769273&feed=steam_community_announcements) |
| `connected_parts_share_network_heat` | true | boolean | patch_confirmed | [V2-CMB-PATCH-0300](https://store.steampowered.com/news/posts/?appids=799600&enddate=1756769273&feed=steam_community_announcements) |
| `exchanger_adds_waste_during_transfer` | true | boolean | patch_confirmed | [V2-CMB-PATCH-0300](https://store.steampowered.com/news/posts/?appids=799600&enddate=1756769273&feed=steam_community_announcements) |
| `network_overflow_to_hull_formula` | 미확정 | formula | unverified | 미확보 |
| `network_storage_distribution_formula` | 미확정 | formula | unverified | 미확보 |
| `damaged_network_split_energy_assignment` | 미확정 | algorithm | unverified | 미확보 |
| `thermal_port_coordinates_by_part` | 미확정 | map | unverified | 미확보 |

