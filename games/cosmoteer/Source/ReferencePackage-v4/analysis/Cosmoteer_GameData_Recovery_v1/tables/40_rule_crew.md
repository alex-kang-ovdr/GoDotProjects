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

