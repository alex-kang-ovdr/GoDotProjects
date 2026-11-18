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

### 적용 메모

- 85%는 파괴된 플레이어 건조 부품의 자원 드롭. 임의 철거·타인 잔해 전반의 환급률로 확장하지 않음.
- 0.28.1의 7.5%는 강철·코일 수리 기준값이며 손상률·반올림을 포함한 완전한 수리 비용 함수는 미복구.

