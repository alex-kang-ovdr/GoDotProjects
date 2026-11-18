# global.explosion · rule

[전체 목차](README.md)

각 필드는 값·단위·근거 상태·출처를 함께 읽는다. 영문 명칭은 식별용이며 한국어 명칭은 이 자료의 번역이다.

## 폭발 피해 처리 문서 규칙 (Explosion Resolution Documentation)

- ID: `explosive_damage_algorithm_rules`
- 모드: `not_applicable`
- 버전 범위: Modern Steam; field sources distinguish stable patch history and unversioned wiki; installed 0.30.5a binary unverified

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `documented_damage_allocation_order` | nearest_epicenter_first | enum | wiki_snapshot | [V2-CMB-EXPLOSIVE-RULES](https://cosmoteer.wiki.gg/wiki/Modding/ExplosiveDamageEffectRules) |
| `total_damage_is_shared_budget` | true | boolean | wiki_snapshot | [V2-CMB-EXPLOSIVE-RULES](https://cosmoteer.wiki.gg/wiki/Modding/ExplosiveDamageEffectRules) |
| `damage_type_parameter_exists` | true | boolean | wiki_snapshot | [V2-CMB-EXPLOSIVE-RULES](https://cosmoteer.wiki.gg/wiki/Modding/ExplosiveDamageEffectRules) |
| `hit_filter_parameter_exists` | true | boolean | wiki_snapshot | [V2-CMB-EXPLOSIVE-RULES](https://cosmoteer.wiki.gg/wiki/Modding/ExplosiveDamageEffectRules) |
| `fire_probability_can_scale_with_damage` | true | boolean | wiki_snapshot | [V2-CMB-EXPLOSIVE-RULES](https://cosmoteer.wiki.gg/wiki/Modding/ExplosiveDamageEffectRules) |
| `armor_can_reduce_explosive_damage` | true | boolean | wiki_snapshot | [V2-CMB-EXPLOSIVE-RULES](https://cosmoteer.wiki.gg/wiki/Modding/ExplosiveDamageEffectRules) |
| `exact_budget_distribution_formula` | 미확정 | formula | unverified | 미확보 |
| `distance_tie_break` | 미확정 | enum | unverified | 미확보 |

### 적용 메모

- A documented modding effect type; not a claim that all effects share its defaults. Schema/build verification remains open.

## 저장 탄약 폭발 조건 (Stored Munition Explosion Triggers)

- ID: `stored_munition_explosion_rules`
- 모드: `not_applicable`
- 버전 범위: Modern Steam; field sources distinguish stable patch history and unversioned wiki; installed 0.30.5a binary unverified

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `fire_damage_random_detonation` | false | boolean | patch_confirmed | [V2-CMB-PATCH-0305](https://steamcommunity.com/app/799600/allnews/?l=english) |
| `carrier_scorched_triggers_detonation` | true | boolean | patch_confirmed | [V2-CMB-PATCH-0305](https://steamcommunity.com/app/799600/allnews/?l=english) |
| `carrier_destroyed_triggers_detonation` | true | boolean | patch_confirmed | [V2-CMB-PATCH-0305](https://steamcommunity.com/app/799600/allnews/?l=english) |
| `stored_resource_scaling_basis` | full_stacks | enum | patch_confirmed | [V2-CMB-PATCH-0305](https://steamcommunity.com/app/799600/allnews/?l=english) |
| `partial_stack_rounding` | 미확정 | enum | unverified | [V2-CMB-PATCH-0305](https://steamcommunity.com/app/799600/allnews/?l=english) |
| `launcher_scaling_counts_completed_missiles_only` | true | boolean | patch_confirmed | [V2-CMB-PATCH-0305](https://steamcommunity.com/app/799600/allnews/?l=english) |
| `launcher_partial_missile_counts` | false | boolean | patch_confirmed | [V2-CMB-PATCH-0305](https://steamcommunity.com/app/799600/allnews/?l=english) |
| `bespoke_explosion_removed_part_ids` | ["chaingun","chaingun_magazine","cannon_ammo_factory","he_missile_factory","mine_factory","thermal_canister_missile_factory","nuclear_missile_factory"] | record_id[] | patch_confirmed | [V2-CMB-PATCH-0305](https://steamcommunity.com/app/799600/allnews/?l=english) |
| `per_stack_damage_and_radius` | 미확정 | map | unverified | 미확보 |
| `same_part_destroyed_after_scorched_repeat_policy` | 미확정 | enum | unverified | 미확보 |

### 적용 메모

- 0.30.5 stable patch. This separates a fire trigger from destruction; scorched is not a universal precondition. Exact blast coefficients remain unknown.
- Applies to carriers containing explosive munitions; empty carriers do not acquire an explosive payload from this rule.

