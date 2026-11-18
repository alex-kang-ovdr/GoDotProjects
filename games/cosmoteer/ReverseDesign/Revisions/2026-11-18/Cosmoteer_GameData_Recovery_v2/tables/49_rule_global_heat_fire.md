# global.heat_fire · rule

[전체 목차](README.md)

각 필드는 값·단위·근거 상태·출처를 함께 읽는다. 영문 명칭은 식별용이며 한국어 명칭은 이 자료의 번역이다.

## 전역 열·화재 규칙 (Global Heat / Fire Rules)

- ID: `global_heat_fire`
- 모드: `normal`
- 버전 범위: {"edition":"Cosmoteer modern Steam","exact_game_version":null,"source_kind":"unversioned_wiki_snapshot","observed_at":"2026-11-17","latest_reference":"0.30.5a","all_fields_verified_for_latest":false}

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `explosion_started_fire_strength` | [20,40] | % | patch_confirmed | [CMB-S029](https://steamcommunity.com/app/799600/) |
| `heat_diffusion_requires_contiguous_path` | true | boolean | patch_confirmed | [CMB-S029](https://steamcommunity.com/app/799600/) |
| `stored_munition_explosion_requires_scorched` | 미확정 | boolean | unverified | [V2-CMB-PATCH-0305](https://steamcommunity.com/app/799600/allnews/?l=english) |
| `scorched_disables_part` | true | boolean | patch_confirmed | [CMB-S030](https://store.steampowered.com/news/posts/?appids=799600&enddate=1756769273&feed=steam_community_announcements) |
| `hull_heat_ignition_threshold` | 미확정 | unverified native heat unit | unverified | 미확보 |
| `hull_heat_decay_per_second` | 미확정 | unverified native heat unit/sec | unverified | 미확보 |
| `fire_damage_per_second` | 미확정 | damage/sec | unverified | 미확보 |
| `fire_spread_probability` | 미확정 | probability | unverified | 미확보 |
| `scorched_damage_threshold` | 미확정 | unverified native unit | unverified | 미확보 |
| `heat_damage_amplification_formula` | 미확정 | formula | unverified | 미확보 |
| `foam_duration` | 미확정 | s | unverified | 미확보 |
| `heat_damage_resistance_debuff_base_pct` | -0.6 | % | patch_confirmed | [V2-CMB-PATCH-0304](https://store.steampowered.com/news/posts/?enddate=1776464388&feed=steam_community_announcements) |
| `heat_damage_resistance_debuff_exponent` | 0.7 | dimensionless | patch_confirmed | [V2-CMB-PATCH-0304](https://store.steampowered.com/news/posts/?enddate=1776464388&feed=steam_community_announcements) |

### 적용 메모

- MJ는 네트워크 열량에 사용된다. 선체 타일 heat 상태의 임계값·온도를 임의로 MJ 또는 섭씨에 등치하지 않았다.

