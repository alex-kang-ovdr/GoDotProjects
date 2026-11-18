# crew · rule

[전체 목차](README.md)

각 필드는 값·단위·근거 상태·출처를 함께 읽는다. 영문 명칭은 식별용이며 한국어 명칭은 이 자료의 번역이다.

## 승무원 특성과 고용 (Crew characteristics and hiring)

- ID: `crew_characteristics`
- 모드: `not_applicable`
- 버전 범위: Cosmoteer Modern / Steam; 공개 위키 관측 스냅샷이며 정확한 게임 빌드는 미확정

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `equal_task_capability` | true | boolean | wiki_snapshot | [ECON-CREW](https://cosmoteer.wiki.gg/wiki/Crew) |
| `hiring_requires_free_beds` | true | boolean | wiki_snapshot | [ECON-CREW](https://cosmoteer.wiki.gg/wiki/Crew) |
| `hiring_is_fame_limited` | true | boolean | wiki_snapshot | [ECON-CREW](https://cosmoteer.wiki.gg/wiki/Crew) |
| `hire_cost_increases_with_crew` | true | boolean | wiki_snapshot | [ECON-CREW](https://cosmoteer.wiki.gg/wiki/Crew) |
| `hire_cost_decreases_with_fame` | true | boolean | wiki_snapshot | [ECON-CREW](https://cosmoteer.wiki.gg/wiki/Crew) |
| `hire_cost_formula` | 미확정 | formula | unverified | 미확보 |
| `base_hire_cost_credits` | 미확정 | credits/crew | unverified | 미확보 |
| `maximum_roles_per_ship` | 50 | crew_roles/ship | patch_confirmed | [V2-ECO-05](https://store.steampowered.com/news/posts/?appids=799600&enddate=1671638794&feed=steam_community_announcements) |
| `stranded_crew_count_towards_fame_cap` | true | boolean | patch_confirmed | [V2-ECO-05](https://store.steampowered.com/news/posts/?appids=799600&enddate=1671638794&feed=steam_community_announcements) |

### 적용 메모

- 외형·이름 차이는 성능 차이가 아님. 고용 비용의 방향만 확인됐으며 정확한 함수·최저 가격은 미복구.

## 승무원 이동 (Crew movement)

- ID: `crew_movement`
- 모드: `not_applicable`
- 버전 범위: Cosmoteer Modern / Steam; 공개 위키 관측 스냅샷이며 정확한 게임 빌드는 미확정

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `base_walk_speed` | 3.2 | tiles/s | wiki_snapshot | [ECON-CREW](https://cosmoteer.wiki.gg/wiki/Crew) |
| `orthogonal_only` | true | boolean | wiki_snapshot | [ECON-CREW](https://cosmoteer.wiki.gg/wiki/Crew) |
| `carrying_speed_multiplier` | 1 | ratio | wiki_snapshot | [ECON-CREW](https://cosmoteer.wiki.gg/wiki/Crew) |
| `corridor_multiplier` | 1 | ratio | wiki_snapshot | [ECON-CREW](https://cosmoteer.wiki.gg/wiki/Crew) |
| `walkway_forward_multiplier` | 2 | ratio | wiki_snapshot | [ECON-CREW](https://cosmoteer.wiki.gg/wiki/Crew) |
| `walkway_side_multiplier` | 0.75 | ratio | wiki_snapshot | [ECON-CREW](https://cosmoteer.wiki.gg/wiki/Crew) |
| `walkway_reverse_multiplier` | 0.25 | ratio | wiki_snapshot | [ECON-CREW](https://cosmoteer.wiki.gg/wiki/Crew) |
| `heat_pipe_crossing_multiplier` | 0.8 | ratio | wiki_snapshot | [ECON-CREW](https://cosmoteer.wiki.gg/wiki/Crew) |
| `other_room_multiplier` | 0.5 | ratio | wiki_snapshot | [ECON-CREW](https://cosmoteer.wiki.gg/wiki/Crew) |
| `congestion_multiplier` | 0.5 | ratio | wiki_snapshot | [ECON-CREW](https://cosmoteer.wiki.gg/wiki/Crew) |
| `congestion_floor` | 0.3 | ratio | wiki_snapshot | [ECON-CREW](https://cosmoteer.wiki.gg/wiki/Crew) |
| `fire_multiplier` | 0.2 | ratio | wiki_snapshot | [ECON-CREW](https://cosmoteer.wiki.gg/wiki/Crew) |
| `fire_floor` | 0.2 | ratio | wiki_snapshot | [ECON-CREW](https://cosmoteer.wiki.gg/wiki/Crew) |
| `scorched_multiplier` | 0.5 | ratio | wiki_snapshot | [ECON-CREW](https://cosmoteer.wiki.gg/wiki/Crew) |
| `fire_overrides_congestion` | true | boolean | wiki_snapshot | [ECON-CREW](https://cosmoteer.wiki.gg/wiki/Crew) |
| `eva_oxygen_duration_s` | 미확정 | s | unverified | 미확보 |
| `eva_speed_m_per_s` | 미확정 | m/s | unverified | 미확보 |

### 적용 메모

- 혼잡 전 계수가 0.3 미만이면 혼잡으로 더 낮추지 않음. 소실된 산소 수치나 0.30 이전 EVA 속도를 추정하지 않음.

## 승무원 역할의 고용·이동 규칙 (Crew role hiring and transfer rules)

- ID: `crew_role_hiring_rules`
- 모드: `not_applicable`
- 버전 범위: Cosmoteer Modern / Steam; exact game build unknown. Wiki is unversioned; patch_confirmed applies to the cited historical patch only.

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `hiring_priority_range` | [1,10] | priority[] | patch_confirmed | [V2-SUP-0240](https://store.steampowered.com/news/posts/?appids=799600&enddate=1696087490&feed=steam_community_announcements) |
| `higher_hiring_priority_filled_first` | true | boolean | patch_confirmed | [V2-SUP-0240](https://store.steampowered.com/news/posts/?appids=799600&enddate=1696087490&feed=steam_community_announcements) |
| `auto_fill_from_lower_priority_roles_available` | true | boolean | patch_confirmed | [V2-SUP-0240](https://store.steampowered.com/news/posts/?appids=799600&enddate=1696087490&feed=steam_community_announcements) |
| `outgoing_transfer_prefers_lower_hiring_priority` | true | boolean | patch_confirmed | [V2-SUP-0240](https://store.steampowered.com/news/posts/?appids=799600&enddate=1696087490&feed=steam_community_announcements) |

### 적용 메모

- 고용·역할 충원 축을 작업 종류별 우선순위와 혼동하지 않는다. 0.24.0에 추가된 동작의 역사적 확인이며 정밀한 동률 처리 규칙은 미확인이다.

## 세력 승무원 수송선 (Faction crew transport ships)

- ID: `crew_transport_station_supply`
- 모드: `career`
- 버전 범위: 0.28.2 released patch; historical four-faction scope

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `faction_count_covered_by_patch` | 4 | factions | patch_confirmed | [V2-ECO-04](https://store.steampowered.com/news/posts/?appids=799600&enddate=1753322128&feed=steam_community_announcements) |
| `trade_and_hiring_supported` | true | boolean | patch_confirmed | [V2-ECO-04](https://store.steampowered.com/news/posts/?appids=799600&enddate=1753322128&feed=steam_community_announcements) |
| `station_crew_refill_faster_than_trade_ships` | true | boolean | patch_confirmed | [V2-ECO-04](https://store.steampowered.com/news/posts/?appids=799600&enddate=1753322128&feed=steam_community_announcements) |

### 적용 메모

- 0.28.2 출시 당시 네 세력이라는 역사적 범위이며 이후 세력 총수를 4로 고정하지 않는다. 정확한 보충량·주기·시간 계수는 미복구.

## 승무원의 조작 작업과 운송 작업 구분 (Crew work and delivery distinctions)

- ID: `crew_work_and_delivery_rules`
- 모드: `not_applicable`
- 버전 범위: Cosmoteer Modern / Steam; exact game build unknown. Wiki is unversioned; patch_confirmed applies to the cited historical patch only.

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `documented_task_families` | ["operate_duty_station","deliver_power","move_resources","load_ammunition"] | enum[] | wiki_snapshot | [V2-SUP-CREW](https://cosmoteer.wiki.gg/wiki/Crew) |
| `operation_and_supply_priorities_are_separate` | true | boolean | wiki_snapshot | [V2-SUP-TROUBLE](https://cosmoteer.wiki.gg/wiki/Guides_Hub/Troubleshooting), [V2-SUP-0272](https://store.steampowered.com/news/posts/?appids=799600&enddate=1732681972&feed=steam_community_announcements) |
| `power_depleted_station_operator_may_fetch_battery` | true | boolean | wiki_snapshot | [V2-SUP-BATTERIES](https://cosmoteer.wiki.gg/wiki/Batteries) |

### 적용 메모

- task family 식별자는 데이터셋의 의미 분류이며 원작 내부 job ID가 아니다. 조작석 좌표·모든 장치 조작 인원·상주 중단 조건은 이 일반 규칙으로 채우지 않는다.

