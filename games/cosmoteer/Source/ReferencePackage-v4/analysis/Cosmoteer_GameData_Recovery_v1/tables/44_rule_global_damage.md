# global.damage · rule

[전체 목차](README.md)

각 필드는 값·단위·근거 상태·출처를 함께 읽는다. 영문 명칭은 식별용이며 한국어 명칭은 이 자료의 번역이다.

## 구조물 통과 피해 규칙 (Weapon Damage Through Structure)

- ID: `global_weapon_structure_damage`
- 모드: `normal`
- 버전 범위: {"edition":"Cosmoteer modern Steam","exact_game_version":null,"source_kind":"unversioned_wiki_snapshot","observed_at":"2026-11-17","latest_reference":"0.30.5a","all_fields_verified_for_latest":false}

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `first_structure_tile_damage_reduction` | 50 | % | patch_confirmed | [CMB-S029](https://steamcommunity.com/app/799600/) |
| `damage_retained_per_structure_tile` | 50 | % | patch_confirmed | [CMB-S029](https://steamcommunity.com/app/799600/) |
| `minimum_damage_retained` | 3 | % | patch_confirmed | [CMB-S029](https://steamcommunity.com/app/799600/) |

### 적용 메모

- 공지의 적용 범위는 most weapons/bullets/beams이다. 예외 목록을 확보하지 못해 모든 무기에 강제 적용할 수 없다.

