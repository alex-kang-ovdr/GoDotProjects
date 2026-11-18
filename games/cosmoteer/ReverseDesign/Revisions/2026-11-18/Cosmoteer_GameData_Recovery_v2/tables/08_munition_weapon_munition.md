# weapon.munition · munition

[전체 목차](README.md)

각 필드는 값·단위·근거 상태·출처를 함께 읽는다. 영문 명칭은 식별용이며 한국어 명칭은 이 자료의 번역이다.

## 기뢰 (Mine)

- ID: `mine`
- 모드: `normal`
- 버전 범위: {"edition":"Cosmoteer modern Steam","exact_game_version":null,"source_kind":"unversioned_wiki_snapshot","observed_at":"2026-11-17","latest_reference":"0.30.5a","all_fields_verified_for_latest":false}

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `damage_per_shot` | 미확정 | damage/shot | unverified | 미확보 |
| `range_m` | 150 | m | wiki_snapshot | [CMB-S014](https://cosmoteer.wiki.gg/wiki/Missile) |
| `shots_per_second` | 미확정 | shots/s | conflict | [CMB-S014](https://cosmoteer.wiki.gg/wiki/Missile) |
| `firing_interval_s` | 미확정 | s | unverified | 미확보 |
| `firing_arc_deg` | 90 | degree | wiki_snapshot | [CMB-S014](https://cosmoteer.wiki.gg/wiki/Missile) |
| `projectile_durability` | 3200 | durability | wiki_snapshot | [CMB-S014](https://cosmoteer.wiki.gg/wiki/Missile) |
| `salvo_size` | 2 | mines/salvo | wiki_snapshot | [CMB-S014](https://cosmoteer.wiki.gg/wiki/Missile) |
| `shrapnel_count` | 16 | shrapnel/mine | wiki_snapshot | [CMB-S014](https://cosmoteer.wiki.gg/wiki/Missile) |
| `detonation_range` | 20 | m | wiki_snapshot | [CMB-S014](https://cosmoteer.wiki.gg/wiki/Missile) |
| `life_span` | 1 | minutes | wiki_snapshot | [CMB-S014](https://cosmoteer.wiki.gg/wiki/Missile) |

### 적용 메모

- 발사기 별개 건설 부품이 아닌 탄종 레코드. Max Damage는 모든 타일에 같은 피해가 적용된다는 뜻이 아니다.

### 대조 관측값

```json
[
  {
    "field": "shots_per_second",
    "value": 0.33,
    "unit": "shots/sec",
    "source_id": "CMB-S014",
    "status": "ambiguous_rate",
    "reason": "Salvo 2 shots (0.16/sec) 표기도 있어 평균 살보율인지 단발율인지 불명."
  }
]
```

## 기뢰 파편 (Mine Shrapnel)

- ID: `mine_shrapnel`
- 모드: `normal`
- 버전 범위: {"edition":"Cosmoteer modern Steam","exact_game_version":null,"source_kind":"unversioned_wiki_snapshot","observed_at":"2026-11-17","latest_reference":"0.30.5a","all_fields_verified_for_latest":false}

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `damage_per_shot` | 4800 | damage/shot | wiki_snapshot | [CMB-S014](https://cosmoteer.wiki.gg/wiki/Missile) |
| `range_m` | 40 | m | wiki_snapshot | [CMB-S014](https://cosmoteer.wiki.gg/wiki/Missile) |
| `projectile_speed_m_per_s` | 미확정 | m/s | unverified | 미확보 |
| `projectile_durability` | 미확정 | durability | unverified | 미확보 |
| `penetration` | 2 | m | wiki_snapshot | [CMB-S014](https://cosmoteer.wiki.gg/wiki/Missile) |
| `fire_chance_per_tile` | 40 | % chance/tile | wiki_snapshot | [CMB-S014](https://cosmoteer.wiki.gg/wiki/Missile) |
| `interceptable` | true | boolean | patch_confirmed | [CMB-S029](https://steamcommunity.com/app/799600/) |

### 대조 관측값

```json
[
  {
    "field": "projectile_durability",
    "value": "∞",
    "unit": "durability",
    "source_id": "CMB-S014",
    "status": "superseded_or_ambiguous",
    "reason": "0.30.5에서 요격 가능해졌으므로 무한 내구도를 현재값으로 채택하지 않음."
  }
]
```

## 전자기 펄스 미사일 (Electromagnetic Pulse Missile)

- ID: `missile_emp`
- 모드: `normal`
- 버전 범위: {"edition":"Cosmoteer modern Steam","exact_game_version":null,"source_kind":"unversioned_wiki_snapshot","observed_at":"2026-11-17","latest_reference":"0.30.5a","all_fields_verified_for_latest":false}

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `damage_per_shot` | 300 | damage/shot | wiki_snapshot | [CMB-S014](https://cosmoteer.wiki.gg/wiki/Missile) |
| `range_m` | 700 | m | wiki_snapshot | [CMB-S014](https://cosmoteer.wiki.gg/wiki/Missile) |
| `shots_per_second` | 미확정 | shots/s | conflict | [CMB-S014](https://cosmoteer.wiki.gg/wiki/Missile), [CMB-S031](https://store.steampowered.com/news/posts/?appids=799600&enddate=1738900328&feed=steam_community_announcements) |
| `firing_interval_s` | 4 | s | patch_confirmed | [CMB-S031](https://store.steampowered.com/news/posts/?appids=799600&enddate=1738900328&feed=steam_community_announcements) |
| `firing_arc_deg` | 360 | degree | wiki_snapshot | [CMB-S014](https://cosmoteer.wiki.gg/wiki/Missile) |
| `projectile_durability` | 3200 | durability | wiki_snapshot | [CMB-S014](https://cosmoteer.wiki.gg/wiki/Missile) |
| `assembly_parts` | 9 | EMP Missile Parts/missile | wiki_snapshot | [CMB-S014](https://cosmoteer.wiki.gg/wiki/Missile) |
| `power_drain_per_hit` | 18 | game_power/shot | wiki_snapshot | [CMB-S014](https://cosmoteer.wiki.gg/wiki/Missile) |
| `power_drain_radius` | 18 | meters radius | wiki_snapshot | [CMB-S014](https://cosmoteer.wiki.gg/wiki/Missile) |

### 적용 메모

- 발사기 별개 건설 부품이 아닌 탄종 레코드. Max Damage는 모든 타일에 같은 피해가 적용된다는 뜻이 아니다.

### 대조 관측값

```json
[
  {
    "field": "shots_per_second",
    "value": 0.167,
    "unit": "shots/sec",
    "source_id": "CMB-S014",
    "status": "superseded_wiki_snapshot",
    "reason": "0.28.1 공식 4초 발사 쿨다운과 불일치. 옛 6초 주기 표로 보인다."
  }
]
```

## 고폭 미사일 (High-Explosive Missile)

- ID: `missile_he`
- 모드: `normal`
- 버전 범위: {"edition":"Cosmoteer modern Steam","exact_game_version":null,"source_kind":"unversioned_wiki_snapshot","observed_at":"2026-11-17","latest_reference":"0.30.5a","all_fields_verified_for_latest":false}

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `damage_per_shot` | 미확정 | damage/shot | unverified | 미확보 |
| `range_m` | 450 | m | wiki_snapshot | [CMB-S014](https://cosmoteer.wiki.gg/wiki/Missile) |
| `shots_per_second` | 0.5 | shots/s | wiki_snapshot | [CMB-S014](https://cosmoteer.wiki.gg/wiki/Missile) |
| `firing_interval_s` | 미확정 | s | unverified | 미확보 |
| `firing_arc_deg` | 360 | degree | wiki_snapshot | [CMB-S014](https://cosmoteer.wiki.gg/wiki/Missile) |
| `max_damage_per_shot` | 15000 | damage/shot | wiki_snapshot | [CMB-S014](https://cosmoteer.wiki.gg/wiki/Missile) |
| `area_radius` | 4 | meters radius | wiki_snapshot | [CMB-S014](https://cosmoteer.wiki.gg/wiki/Missile) |
| `projectile_durability` | 800 | durability | wiki_snapshot | [CMB-S014](https://cosmoteer.wiki.gg/wiki/Missile) |
| `assembly_parts` | 4 | HE Missile Parts/missile | wiki_snapshot | [CMB-S014](https://cosmoteer.wiki.gg/wiki/Missile) |

### 적용 메모

- 발사기 별개 건설 부품이 아닌 탄종 레코드. Max Damage는 모든 타일에 같은 피해가 적용된다는 뜻이 아니다.

## 핵 미사일 (Nuclear Missile)

- ID: `missile_nuclear`
- 모드: `normal`
- 버전 범위: {"edition":"Cosmoteer modern Steam","exact_game_version":null,"source_kind":"unversioned_wiki_snapshot","observed_at":"2026-11-17","latest_reference":"0.30.5a","all_fields_verified_for_latest":false}

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `damage_per_shot` | 미확정 | damage/shot | unverified | 미확보 |
| `range_m` | 250 | m | wiki_snapshot | [CMB-S014](https://cosmoteer.wiki.gg/wiki/Missile) |
| `shots_per_second` | 0.1 | shots/s | wiki_snapshot | [CMB-S014](https://cosmoteer.wiki.gg/wiki/Missile) |
| `firing_interval_s` | 미확정 | s | unverified | 미확보 |
| `firing_arc_deg` | 200 | degree | wiki_snapshot | [CMB-S014](https://cosmoteer.wiki.gg/wiki/Missile) |
| `max_damage_per_shot` | 200000 | damage/shot | wiki_snapshot | [CMB-S014](https://cosmoteer.wiki.gg/wiki/Missile) |
| `area_radius` | 10 | meters radius | wiki_snapshot | [CMB-S014](https://cosmoteer.wiki.gg/wiki/Missile) |
| `projectile_durability` | 7200 | durability | wiki_snapshot | [CMB-S014](https://cosmoteer.wiki.gg/wiki/Missile) |
| `assembly_parts` | 12 | Nuclear Missile Parts/missile | wiki_snapshot | [CMB-S014](https://cosmoteer.wiki.gg/wiki/Missile) |
| `maximum_firing_arc` | 360 | degree | patch_confirmed | [CMB-S029](https://steamcommunity.com/app/799600/) |

### 적용 메모

- 발사기 별개 건설 부품이 아닌 탄종 레코드. Max Damage는 모든 타일에 같은 피해가 적용된다는 뜻이 아니다.
- firing_arc=200은 기본 표기, maximum_firing_arc=360은 0.30.5에서 허용되는 최대 설정값. 두 값은 충돌이 아니다.

## 열 캐니스터 미사일 (Thermal Canister Missile)

- ID: `missile_thermal_canister`
- 모드: `normal`
- 버전 범위: {"edition":"Cosmoteer modern Steam","exact_game_version":null,"source_kind":"unversioned_wiki_snapshot","observed_at":"2026-11-17","latest_reference":"0.30.5a","all_fields_verified_for_latest":false}

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `damage_per_shot` | 미확정 | damage/shot | unverified | 미확보 |
| `range_m` | 450 | m | wiki_snapshot | [CMB-S014](https://cosmoteer.wiki.gg/wiki/Missile) |
| `shots_per_second` | 0.5 | shots/s | wiki_snapshot | [CMB-S014](https://cosmoteer.wiki.gg/wiki/Missile) |
| `firing_interval_s` | 미확정 | s | unverified | 미확보 |
| `firing_arc_deg` | 360 | degree | wiki_snapshot | [CMB-S014](https://cosmoteer.wiki.gg/wiki/Missile) |
| `projectile_durability` | 800 | durability | wiki_snapshot | [CMB-S014](https://cosmoteer.wiki.gg/wiki/Missile) |
| `heat_capacity` | 8500 | MJ | wiki_snapshot | [CMB-S014](https://cosmoteer.wiki.gg/wiki/Missile) |
| `assembly_parts` | 5 | Thermal Canister Missile Parts/missile | wiki_snapshot | [CMB-S014](https://cosmoteer.wiki.gg/wiki/Missile) |
| `heat_spread_distance` | 3 | m | wiki_snapshot | [CMB-S014](https://cosmoteer.wiki.gg/wiki/Missile) |
| `heat_applied_per_missile` | 5000 | MJ/missile | patch_confirmed | [CMB-S029](https://steamcommunity.com/app/799600/) |

### 적용 메모

- 발사기 별개 건설 부품이 아닌 탄종 레코드. Max Damage는 모든 타일에 같은 피해가 적용된다는 뜻이 아니다.
- heat_capacity=8500MJ와 heat_applied_per_missile=5000MJ를 별개 필드로 보존했다.

