# global.shield · rule

[전체 목차](README.md)

각 필드는 값·단위·근거 상태·출처를 함께 읽는다. 영문 명칭은 식별용이며 한국어 명칭은 이 자료의 번역이다.

## 실드 호·전지 저장량 생명주기 (Shield Arc and Reserve Lifecycle)

- ID: `shield_runtime_rules`
- 모드: `not_applicable`
- 버전 범위: Modern Steam; field sources distinguish stable patch history and unversioned wiki; installed 0.30.5a binary unverified

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `barrier_shape` | arc | enum | wiki_snapshot | [V2-CMB-SHIELD](https://cosmoteer.wiki.gg/wiki/Shield) |
| `hit_depletes_generator_power` | true | boolean | wiki_snapshot | [V2-CMB-BATTERIES](https://cosmoteer.wiki.gg/wiki/Batteries) |
| `collapsed_reactivation_requires_full_reserve` | true | boolean | wiki_snapshot | [V2-CMB-SHIELD](https://cosmoteer.wiki.gg/wiki/Shield) |
| `hyperjump_fully_drains_reserve` | true | boolean | wiki_snapshot | [V2-CMB-BATTERIES](https://cosmoteer.wiki.gg/wiki/Batteries) |
| `restart_delay_s` | 미확정 | s | unverified | 미확보 |
| `damage_overflow_after_collapse` | 미확정 | enum | unverified | 미확보 |
| `overlapping_arc_hit_order` | 미확정 | enum | unverified | 미확보 |
| `arc_origin_anchor` | 미확정 | local_coordinate | unverified | 미확보 |
| `power_to_strength_formula` | 미확정 | formula | unverified | 미확보 |
| `independent_shield_hp_regeneration` | 미확정 | boolean | unverified | 미확보 |

### 적용 메모

- Reserve refill is confirmed; do not silently replace it with an independent shipwide HP regeneration rate.

