# career · rule

[전체 목차](README.md)

각 필드는 값·단위·근거 상태·출처를 함께 읽는다. 영문 명칭은 식별용이며 한국어 명칭은 이 자료의 번역이다.

## 경력 임무 단계와 보상 축 (Career mission levels and reward dimensions)

- ID: `career_mission_scope`
- 모드: `career`
- 버전 범위: Cosmoteer Modern / Steam; field-specific patch or undated official wiki snapshot; exact installed build unverified

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `minimum_level` | 1 | mission_level | wiki_snapshot | [V2-ECO-08](https://cosmoteer.wiki.gg/wiki/Missions) |
| `maximum_level` | 18 | mission_level | wiki_snapshot | [V2-ECO-08](https://cosmoteer.wiki.gg/wiki/Missions) |
| `accept_via_trade_station_hail` | true | boolean | wiki_snapshot | [V2-ECO-08](https://cosmoteer.wiki.gg/wiki/Missions) |
| `reward_dimensions` | ["credits","fame","faction_reputation"] | reward_dimension[] | wiki_snapshot | [V2-ECO-08](https://cosmoteer.wiki.gg/wiki/Missions) |

### 적용 메모

- 모든 임무가 세 보상을 모두 지급한다는 뜻이 아니다. 임무별 금액·명성·평판 증가량 함수는 미확정.

## 정거장 연락 임무 (Contact station mission)

- ID: `mission_contact_station`
- 모드: `career`
- 버전 범위: Cosmoteer Modern / Steam; field-specific patch or undated official wiki snapshot; exact installed build unverified

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `completion_action` | travel_and_hail_target_station | objective | wiki_snapshot | [V2-ECO-08](https://cosmoteer.wiki.gg/wiki/Missions) |
| `claim_location` | target_station | claim_location | wiki_snapshot | [V2-ECO-08](https://cosmoteer.wiki.gg/wiki/Missions) |
| `reward_dimensions` | ["credits","faction_reputation"] | reward_dimension[] | wiki_snapshot | [V2-ECO-08](https://cosmoteer.wiki.gg/wiki/Missions) |

### 적용 메모

- 임무 표시명은 유형 설명이며 원작 내부 ID가 아니다.

## 성계 탐사 임무 (Explore system mission)

- ID: `mission_explore_system`
- 모드: `career`
- 버전 범위: Cosmoteer Modern / Steam; field-specific patch or undated official wiki snapshot; exact installed build unverified

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `objective` | reveal_points_of_interest | objective | wiki_snapshot | [V2-ECO-08](https://cosmoteer.wiki.gg/wiki/Missions) |
| `required_percentage_increases_after_completion` | true | boolean | wiki_snapshot | [V2-ECO-08](https://cosmoteer.wiki.gg/wiki/Missions) |
| `reward_dimensions` | ["credits","fame","faction_reputation"] | reward_dimension[] | wiki_snapshot | [V2-ECO-08](https://cosmoteer.wiki.gg/wiki/Missions) |

### 적용 메모

- 증가 폭과 반복 상한은 미복구.

## 정거장 구출 임무 (Rescue station mission)

- ID: `mission_rescue_station`
- 모드: `career`
- 버전 범위: Cosmoteer Modern / Steam; field-specific patch or undated official wiki snapshot; exact installed build unverified

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `completion_action` | defeat_pirate_attackers | objective | wiki_snapshot | [V2-ECO-08](https://cosmoteer.wiki.gg/wiki/Missions) |
| `target_station_destroyed_fails_mission` | true | boolean | wiki_snapshot | [V2-ECO-08](https://cosmoteer.wiki.gg/wiki/Missions) |
| `reward_dimensions` | ["credits","fame","faction_reputation"] | reward_dimension[] | wiki_snapshot | [V2-ECO-08](https://cosmoteer.wiki.gg/wiki/Missions) |

## 자원 조달 임무 (Resource procurement mission)

- ID: `mission_resource_procurement`
- 모드: `career`
- 버전 범위: Cosmoteer Modern / Steam; field-specific patch or undated official wiki snapshot; exact installed build unverified

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `historical_display_name` | Delivery | display_name | patch_confirmed | [V2-ECO-04](https://store.steampowered.com/news/posts/?appids=799600&enddate=1753322128&feed=steam_community_announcements) |
| `patch_display_name_as_written` | Procument | display_name | patch_confirmed | [V2-ECO-04](https://store.steampowered.com/news/posts/?appids=799600&enddate=1753322128&feed=steam_community_announcements) |
| `player_sources_requested_resources` | true | boolean | patch_confirmed | [V2-ECO-04](https://store.steampowered.com/news/posts/?appids=799600&enddate=1753322128&feed=steam_community_announcements) |
| `time_limit_uses_game_speed` | true | boolean | wiki_snapshot | [V2-ECO-08](https://cosmoteer.wiki.gg/wiki/Missions) |
| `reward_dimensions` | ["credits"] | reward_dimension[] | wiki_snapshot | [V2-ECO-08](https://cosmoteer.wiki.gg/wiki/Missions) |
| `hidden_when_station_cannot_store_requested_goods` | true | boolean | patch_confirmed | [V2-ECO-06](https://store.steampowered.com/news/posts/?appids=799600&enddate=1683935591&feed=steam_community_announcements) |

### 적용 메모

- name_en는 정규화된 연구용 표기. 공식 0.28.1 원문 철자 Procument는 patch_display_name_as_written에 보존했다. 이전 위키 Delivery 표와 같은 임무 유형으로 연결했다. 실게임 현행 한국어 UI 문자열은 검증하지 않았다.

