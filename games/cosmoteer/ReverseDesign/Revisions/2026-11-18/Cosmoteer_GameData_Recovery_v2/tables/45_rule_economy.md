# economy · rule

[전체 목차](README.md)

각 필드는 값·단위·근거 상태·출처를 함께 읽는다. 영문 명칭은 식별용이며 한국어 명칭은 이 자료의 번역이다.

## 경력 경제 규칙 (Career economy rules)

- ID: `career_economy_rules`
- 모드: `not_applicable`
- 버전 범위: Cosmoteer Modern / Steam; 공개 위키 관측 스냅샷이며 정확한 게임 빌드는 미확정

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `player_built_destroyed_resource_drop_ratio` | 0.85 | ratio | patch_confirmed | [ECON-PATCH-0280](https://store.steampowered.com/news/posts/?appids=799600&enddate=1736901638&feed=steam_community_announcements) |
| `player_built_destroyed_drop_ignores_difficulty` | true | boolean | patch_confirmed | [ECON-PATCH-0280](https://store.steampowered.com/news/posts/?appids=799600&enddate=1736901638&feed=steam_community_announcements) |
| `repair_cost_base_ratio_steel_coils` | 0.075 | ratio | patch_confirmed | [ECON-PATCH-0281](https://store.steampowered.com/news/posts/?appids=799600&enddate=1738900328&feed=steam_community_announcements) |
| `repair_cost_hp_scaling_formula` | 미확정 | formula | unverified | 미확보 |
| `part_value_equals_construction_resource_value` | true | boolean | wiki_snapshot | [ECON-CREDITS](https://cosmoteer.wiki.gg/wiki/Credits) |
| `exact_trade_rounding` | 미확정 | formula | unverified | 미확보 |
| `repair_resource_rounding` | ceil_to_whole_resource | rounding_rule | patch_confirmed | [V2-ECO-04](https://store.steampowered.com/news/posts/?appids=799600&enddate=1753322128&feed=steam_community_announcements) |

### 적용 메모

- 85%는 파괴된 플레이어 건조 부품의 자원 드롭. 임의 철거·타인 잔해 전반의 환급률로 확장하지 않음.
- 0.28.1의 7.5%는 강철·코일 수리 기준값이며 손상률·반올림을 포함한 완전한 수리 비용 함수는 미복구.

## 건조·수리 자원 예약의 경계 (Construction and repair resource claims)

- ID: `construction_resource_claim_rules`
- 모드: `career`
- 버전 범위: Cosmoteer Modern / Steam; field-specific patch or undated official wiki snapshot; exact installed build unverified

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `repair_all_allows_partial_resources` | true | boolean | patch_confirmed | [V2-ECO-01](https://store.steampowered.com/news/posts/?enddate=1719859099&feed=steam_community_announcements) |
| `canceled_prepurchase_releases_availability` | true | boolean | patch_confirmed | [V2-ECO-01](https://store.steampowered.com/news/posts/?enddate=1719859099&feed=steam_community_announcements) |
| `destroyed_station_cannot_retain_resource_claim` | true | boolean | patch_confirmed | [V2-ECO-01](https://store.steampowered.com/news/posts/?enddate=1719859099&feed=steam_community_announcements) |
| `unseen_cloud_resources_not_construction_available` | true | boolean | patch_confirmed | [V2-ECO-09](https://store.steampowered.com/news/posts/?appids=799600&enddate=1729117146&feed=steam_community_announcements) |

### 적용 메모

- 원작 버그 수정으로 확인되는 결과 불변식이다. 본 문서의 reservation ledger 스키마가 원작 코드의 복구 결과라는 뜻은 아니다.

## 자원 목표량·수량 제한 (Resource desired quantities and limits)

- ID: `resource_target_and_limit_rules`
- 모드: `career`
- 버전 범위: Cosmoteer Modern / Steam; field-specific patch or undated official wiki snapshot; exact installed build unverified

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `limit_scope` | ["collect","trade","transfer","produce"] | operation[] | patch_confirmed | [V2-ECO-03](https://store.steampowered.com/news/posts/?appids=799600&enddate=1696087490&feed=steam_community_announcements) |
| `production_target_rule` | min(desired,resource_limit) | rule | patch_confirmed | [V2-ECO-02](https://store.steampowered.com/news/posts/?enddate=1728348321&feed=steam_community_announcements) |
| `desired_used_for_trade_and_transfer` | true | boolean | patch_confirmed | [V2-ECO-02](https://store.steampowered.com/news/posts/?enddate=1728348321&feed=steam_community_announcements) |
| `crew_consolidate_undesignated_stacks` | true | boolean | patch_confirmed | [V2-ECO-02](https://store.steampowered.com/news/posts/?enddate=1728348321&feed=steam_community_announcements) |
| `factory_output_can_use_undesignated_storage` | true | boolean | patch_confirmed | [V2-ECO-03](https://store.steampowered.com/news/posts/?appids=799600&enddate=1696087490&feed=steam_community_announcements) |
| `prefer_storage_before_factory` | true | boolean | patch_confirmed | [V2-ECO-03](https://store.steampowered.com/news/posts/?appids=799600&enddate=1696087490&feed=steam_community_announcements) |

### 적용 메모

- 목표량과 상한은 물리적 저장 가능량을 새로 만드는 권한이 아니다. reserved, in_transit 포함 여부의 정확한 원작 카운터 구현은 이번 조사에서 미복구.

## 회수·거래의 소유권 변경 경계 (Salvage and trade ownership boundaries)

- ID: `salvage_and_trade_ownership_rules`
- 모드: `career`
- 버전 범위: Cosmoteer Modern / Steam; field-specific patch or undated official wiki snapshot; exact installed build unverified

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `taking_over_wreck_must_not_increase_salvage_yield` | true | boolean | patch_confirmed | [V2-ECO-05](https://store.steampowered.com/news/posts/?appids=799600&enddate=1671638794&feed=steam_community_announcements) |
| `abandon_ship_cancels_in_progress_trades` | true | boolean | patch_confirmed | [V2-ECO-05](https://store.steampowered.com/news/posts/?appids=799600&enddate=1671638794&feed=steam_community_announcements) |
| `reentering_system_must_not_restore_salvaged_wreckage` | true | boolean | patch_confirmed | [V2-ECO-01](https://store.steampowered.com/news/posts/?enddate=1719859099&feed=steam_community_announcements) |

### 적용 메모

- 철거율 또는 각 난이도의 적 잔해 수율을 이 불변식에서 역산하지 않는다.

## 정거장 재고·거래 공간·임무 게시판 (Station trade capacity and mission boards)

- ID: `station_trade_capacity_rules`
- 모드: `career`
- 버전 범위: Cosmoteer Modern / Steam; field-specific patch or undated official wiki snapshot; exact installed build unverified

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `buy_limited_by_station_stock` | true | boolean | wiki_snapshot | [V2-ECO-07](https://cosmoteer.wiki.gg/wiki/Stations) |
| `sell_limited_by_station_storage` | true | boolean | wiki_snapshot | [V2-ECO-07](https://cosmoteer.wiki.gg/wiki/Stations) |
| `separate_mission_board_per_station` | true | boolean | wiki_snapshot | [V2-ECO-07](https://cosmoteer.wiki.gg/wiki/Stations) |
| `some_rewards_require_issuing_station` | true | boolean | wiki_snapshot | [V2-ECO-07](https://cosmoteer.wiki.gg/wiki/Stations) |

### 적용 메모

- 부분체결 정책, 가격 확정 시점, 자원 운반 취소의 결제 원장 내부 구조는 미복구.

