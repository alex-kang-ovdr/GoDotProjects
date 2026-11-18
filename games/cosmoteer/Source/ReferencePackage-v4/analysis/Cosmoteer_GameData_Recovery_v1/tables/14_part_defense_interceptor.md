# defense.interceptor · part

[전체 목차](README.md)

각 필드는 값·단위·근거 상태·출처를 함께 읽는다. 영문 명칭은 식별용이며 한국어 명칭은 이 자료의 번역이다.

## 대공포 배열 (Flak Array)

- ID: `flak_array`
- 모드: `normal`
- 버전 범위: {"edition":"Cosmoteer modern Steam","exact_game_version":null,"source_kind":"unversioned_wiki_snapshot","observed_at":"2026-11-17","latest_reference":"0.30.5a","all_fields_verified_for_latest":false}

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `size` | [3,6] | m | wiki_snapshot | [CMB-S016](https://cosmoteer.wiki.gg/wiki/Flak_Array) |
| `hp` | 21000 | HP | wiki_snapshot | [CMB-S016](https://cosmoteer.wiki.gg/wiki/Flak_Array) |
| `construction_resources` | [{"resource_id":"steel","quantity":200},{"resource_id":"hyper_coils","quantity":30}] | item[] | wiki_snapshot | [CMB-S016](https://cosmoteer.wiki.gg/wiki/Flak_Array) |
| `value_credits` | 14000 | credits | wiki_snapshot | [CMB-S016](https://cosmoteer.wiki.gg/wiki/Flak_Array) |
| `blueprint_cost_credits` | 7000 | credits | wiki_snapshot | [CMB-S016](https://cosmoteer.wiki.gg/wiki/Flak_Array) |
| `power_per_shot` | 미확정 | game_power/shot | unverified | 미확보 |
| `power_use_per_s` | 미확정 | game_power/s | unverified | 미확보 |
| `ammo_per_shot` | 1 | ammo/shot | wiki_snapshot | [CMB-S016](https://cosmoteer.wiki.gg/wiki/Flak_Array) |
| `range_m` | 150 | m | wiki_snapshot | [CMB-S016](https://cosmoteer.wiki.gg/wiki/Flak_Array) |
| `shots_per_second` | 4 | shots/s | wiki_snapshot | [CMB-S016](https://cosmoteer.wiki.gg/wiki/Flak_Array) |
| `firing_interval_s` | 미확정 | s | unverified | 미확보 |
| `damage_per_shot` | 2250 | damage/shot | wiki_snapshot | [CMB-S016](https://cosmoteer.wiki.gg/wiki/Flak_Array) |
| `firing_arc_deg` | 50 | degree | wiki_snapshot | [CMB-S016](https://cosmoteer.wiki.gg/wiki/Flak_Array) |
| `heat_per_shot` | 미확정 | MJ/shot | unverified | 미확보 |
| `heat_per_s` | 미확정 | MJ/s | unverified | 미확보 |
| `crew_required` | 3 | crew | wiki_snapshot | [CMB-S016](https://cosmoteer.wiki.gg/wiki/Flak_Array) |
| `command_points` | -6 | command_point | wiki_snapshot | [CMB-S016](https://cosmoteer.wiki.gg/wiki/Flak_Array) |
| `ammo_capacity` | 92 | ammo | wiki_snapshot | [CMB-S016](https://cosmoteer.wiki.gg/wiki/Flak_Array) |
| `mass_t` | 16.77 | tonne | wiki_snapshot | [CMB-S016](https://cosmoteer.wiki.gg/wiki/Flak_Array) |
| `area_radius` | 4 | meters radius | wiki_snapshot | [CMB-S016](https://cosmoteer.wiki.gg/wiki/Flak_Array) |
| `projectile_speed_m_per_s` | instantaneous | m/s | wiki_snapshot | [CMB-S016](https://cosmoteer.wiki.gg/wiki/Flak_Array) |
| `damage_vs_shots_per_shot` | 미확정 | damage/shot | conflict | [CMB-S016](https://cosmoteer.wiki.gg/wiki/Flak_Array), [CMB-S030](https://store.steampowered.com/news/posts/?appids=799600&enddate=1756769273&feed=steam_community_announcements) |
| `width_m` | 3 | m | wiki_snapshot | [CMB-S016](https://cosmoteer.wiki.gg/wiki/Flak_Array) |
| `height_m` | 6 | m | wiki_snapshot | [CMB-S016](https://cosmoteer.wiki.gg/wiki/Flak_Array) |

### 대조 관측값

```json
[
  {
    "field": "damage_vs_shots_per_shot",
    "value": 2250,
    "unit": "damage/shot",
    "source_id": "CMB-S016",
    "status": "version_uncertain",
    "reason": "0.30.0 요격 피해 +20% 패치가 기록돼 있지만 표는 일반 피해와 동일값. 2700으로 자동 보정하지 않음."
  }
]
```

## 근접 방어 시스템 (Point Defense System)

- ID: `point_defense_system`
- 모드: `normal`
- 버전 범위: {"edition":"Cosmoteer modern Steam","exact_game_version":null,"source_kind":"unversioned_wiki_snapshot","observed_at":"2026-11-17","latest_reference":"0.30.5a","all_fields_verified_for_latest":false}

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `size` | [1,2] | m | wiki_snapshot | [CMB-S015](https://cosmoteer.wiki.gg/wiki/Point_Defense_System) |
| `hp` | 3000 | HP | wiki_snapshot | [CMB-S015](https://cosmoteer.wiki.gg/wiki/Point_Defense_System) |
| `construction_resources` | [{"resource_id":"steel","quantity":8},{"resource_id":"coils","quantity":8}] | item[] | wiki_snapshot | [CMB-S015](https://cosmoteer.wiki.gg/wiki/Point_Defense_System) |
| `value_credits` | 1000 | credits | wiki_snapshot | [CMB-S015](https://cosmoteer.wiki.gg/wiki/Point_Defense_System) |
| `blueprint_cost_credits` | 미확정 | credits | unverified | 미확보 |
| `power_per_shot` | 0.035 | game_power/shot | wiki_snapshot | [CMB-S015](https://cosmoteer.wiki.gg/wiki/Point_Defense_System) |
| `power_use_per_s` | 미확정 | game_power/s | unverified | 미확보 |
| `ammo_per_shot` | 미확정 | ammo/shot | unverified | 미확보 |
| `range_m` | 150 | m | wiki_snapshot | [CMB-S015](https://cosmoteer.wiki.gg/wiki/Point_Defense_System) |
| `shots_per_second` | 15 | shots/s | wiki_snapshot | [CMB-S015](https://cosmoteer.wiki.gg/wiki/Point_Defense_System) |
| `firing_interval_s` | 미확정 | s | unverified | 미확보 |
| `damage_per_shot` | 35 | damage/shot | wiki_snapshot | [CMB-S015](https://cosmoteer.wiki.gg/wiki/Point_Defense_System) |
| `firing_arc_deg` | 120 | degree | wiki_snapshot | [CMB-S015](https://cosmoteer.wiki.gg/wiki/Point_Defense_System) |
| `heat_per_shot` | 미확정 | MJ/shot | unverified | 미확보 |
| `heat_per_s` | 미확정 | MJ/s | unverified | 미확보 |
| `command_points` | -1 | command_point | wiki_snapshot | [CMB-S015](https://cosmoteer.wiki.gg/wiki/Point_Defense_System) |
| `power_capacity` | 2 | game_power | wiki_snapshot | [CMB-S015](https://cosmoteer.wiki.gg/wiki/Point_Defense_System) |
| `mass_t` | 1.2 | tonne | wiki_snapshot | [CMB-S015](https://cosmoteer.wiki.gg/wiki/Point_Defense_System) |
| `crew_required` | 0 | crew | wiki_snapshot | [CMB-S015](https://cosmoteer.wiki.gg/wiki/Point_Defense_System) |
| `damage_vs_shots_per_shot` | 미확정 | damage/shot | conflict | [CMB-S015](https://cosmoteer.wiki.gg/wiki/Point_Defense_System), [CMB-S030](https://store.steampowered.com/news/posts/?appids=799600&enddate=1756769273&feed=steam_community_announcements) |
| `projectile_speed_m_per_s` | 미확정 | m/s | conflict | [CMB-S015](https://cosmoteer.wiki.gg/wiki/Point_Defense_System), [CMB-S029](https://steamcommunity.com/app/799600/) |
| `width_m` | 1 | m | wiki_snapshot | [CMB-S015](https://cosmoteer.wiki.gg/wiki/Point_Defense_System) |
| `height_m` | 2 | m | wiki_snapshot | [CMB-S015](https://cosmoteer.wiki.gg/wiki/Point_Defense_System) |

### 대조 관측값

```json
[
  {
    "field": "damage_vs_shots_per_shot",
    "value": 150,
    "unit": "damage/shot",
    "source_id": "CMB-S015",
    "status": "version_uncertain",
    "reason": "0.30.0의 요격 피해 +20%가 반영된 값인지 확인하지 못함."
  },
  {
    "field": "projectile_speed_m_per_s",
    "value": 350,
    "unit": "meters/sec",
    "source_id": "CMB-S015",
    "status": "version_uncertain",
    "reason": "0.30.5가 대부분 발사체 속도를 1/6 낮췄지만 적용 대상·색인 반영 여부를 이 항목별로 확인하지 못함. 일괄 5/6 곱셈하지 않음."
  }
]
```

