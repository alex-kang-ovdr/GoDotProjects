# global.penetration · rule

[전체 목차](README.md)

각 필드는 값·단위·근거 상태·출처를 함께 읽는다. 영문 명칭은 식별용이며 한국어 명칭은 이 자료의 번역이다.

## 장갑 저항 적용 범위 (Armor Resistance Scope)

- ID: `armor_penetration_rules`
- 모드: `not_applicable`
- 버전 범위: Modern Steam; field sources distinguish stable patch history and unversioned wiki; installed 0.30.5a binary unverified

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `penetration_resist_scope` | tile | enum | wiki_snapshot | [V2-CMB-ARMOR](https://cosmoteer.wiki.gg/wiki/Armor) |
| `emp_resist_scope` | whole_part | enum | wiki_snapshot | [V2-CMB-ARMOR](https://cosmoteer.wiki.gg/wiki/Armor) |
| `penetration_resistance_excludes_tile_depth` | true | boolean | wiki_snapshot | [V2-CMB-ARMOR](https://cosmoteer.wiki.gg/wiki/Armor) |
| `partial_damage_reduces_penetration_resistance` | false | boolean | wiki_snapshot | [V2-CMB-ARMOR](https://cosmoteer.wiki.gg/wiki/Armor) |
| `angular_material_depth_formula` | 미확정 | formula | unverified | 미확보 |

## 관통 충돌체·이벤트 규칙 (Penetration Hitbox Events)

- ID: `penetration_hitbox_rules`
- 모드: `not_applicable`
- 버전 범위: Modern Steam; field sources distinguish stable patch history and unversioned wiki; installed 0.30.5a binary unverified

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `hitbox_classes` | ["operational","structural","shield","projectile","eva_crew"] | enum[] | wiki_snapshot | [V2-CMB-PENETRATION](https://cosmoteer.wiki.gg/wiki/Penetration) |
| `initial_resistance_on_walled_entry` | true | boolean | wiki_snapshot | [V2-CMB-PENETRATION](https://cosmoteer.wiki.gg/wiki/Penetration) |
| `continuing_resistance_on_unwalled_transition` | true | boolean | wiki_snapshot | [V2-CMB-PENETRATION](https://cosmoteer.wiki.gg/wiki/Penetration) |
| `hit_penetrating_finished_are_distinct_events` | true | boolean | wiki_snapshot | [V2-CMB-PENETRATION](https://cosmoteer.wiki.gg/wiki/Penetration) |
| `beam_structure_penetration_global_prohibition` | 미확정 | boolean | conflict | [V2-CMB-PENETRATION](https://cosmoteer.wiki.gg/wiki/Penetration), [V2-CMB-PATCH-0305](https://steamcommunity.com/app/799600/allnews/?l=english) |
| `projectile_and_eva_hits_depend_on_shot_definition` | true | boolean | wiki_snapshot | [V2-CMB-PENETRATION](https://cosmoteer.wiki.gg/wiki/Penetration) |

### 적용 메모

- The wiki is WIP. Its blanket beam limitation conflicts with the newer stable structure patch; not adopted.

