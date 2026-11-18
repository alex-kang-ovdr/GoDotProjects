# crew_housing · part

[전체 목차](README.md)

각 필드는 값·단위·근거 상태·출처를 함께 읽는다. 영문 명칭은 식별용이며 한국어 명칭은 이 자료의 번역이다.

## 승무원 병영 (Crew's Barracks)

- ID: `crew_barracks`
- 모드: `normal`
- 버전 범위: Cosmoteer Modern / Steam; 공개 위키 관측 스냅샷이며 정확한 게임 빌드는 미확정

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `value_credits` | 3600 | credits | wiki_snapshot | [ECON-CREW-BARRACKS](https://cosmoteer.wiki.gg/wiki/Crew%27s_Barracks) |
| `width_m` | 3 | m | wiki_snapshot | [ECON-CREW-BARRACKS](https://cosmoteer.wiki.gg/wiki/Crew%27s_Barracks) |
| `height_m` | 4 | m | wiki_snapshot | [ECON-CREW-BARRACKS](https://cosmoteer.wiki.gg/wiki/Crew%27s_Barracks) |
| `mass_t` | 12 | tonne | wiki_snapshot | [ECON-CREW-BARRACKS](https://cosmoteer.wiki.gg/wiki/Crew%27s_Barracks) |
| `hp` | 12000 | HP | wiki_snapshot | [ECON-CREW-BARRACKS](https://cosmoteer.wiki.gg/wiki/Crew%27s_Barracks) |
| `crew_beds` | 24 | crew | wiki_snapshot | [ECON-CREW-BARRACKS](https://cosmoteer.wiki.gg/wiki/Crew%27s_Barracks) |
| `construction_resources` | [{"resource_id":"steel","quantity":144}] | item[] | wiki_snapshot | [ECON-CREW-BARRACKS](https://cosmoteer.wiki.gg/wiki/Crew%27s_Barracks) |
| `crew_speed_multiplier` | 0.5 | ratio | wiki_snapshot | [ECON-CREW-BARRACKS](https://cosmoteer.wiki.gg/wiki/Crew%27s_Barracks) |
| `door_placement_constraint` | one_door_at_each_end | placement_rule | patch_confirmed | [V2-ECO-01](https://store.steampowered.com/news/posts/?enddate=1719859099&feed=steam_community_announcements) |

## 승무원 침실 (Crew's Bunk)

- ID: `crew_bunk`
- 모드: `normal`
- 버전 범위: Cosmoteer Modern / Steam; 공개 위키 관측 스냅샷이며 정확한 게임 빌드는 미확정

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `value_credits` | 미확정 | credits | conflict | [ECON-CREW-BUNK](https://cosmoteer.wiki.gg/wiki/Crew%27s_Bunk), [ECON-R-STEEL](https://cosmoteer.wiki.gg/wiki/Steel), [ECON-CREDITS](https://cosmoteer.wiki.gg/wiki/Credits) |
| `width_m` | 1 | m | wiki_snapshot | [ECON-CREW-BUNK](https://cosmoteer.wiki.gg/wiki/Crew%27s_Bunk) |
| `height_m` | 2 | m | wiki_snapshot | [ECON-CREW-BUNK](https://cosmoteer.wiki.gg/wiki/Crew%27s_Bunk) |
| `mass_t` | 2 | tonne | wiki_snapshot | [ECON-CREW-BUNK](https://cosmoteer.wiki.gg/wiki/Crew%27s_Bunk) |
| `hp` | 2000 | HP | wiki_snapshot | [ECON-CREW-BUNK](https://cosmoteer.wiki.gg/wiki/Crew%27s_Bunk) |
| `crew_beds` | 2 | crew | wiki_snapshot | [ECON-CREW-BUNK](https://cosmoteer.wiki.gg/wiki/Crew%27s_Bunk) |
| `construction_resources` | 미확정 | item[] | conflict | [ECON-CREW-BUNK](https://cosmoteer.wiki.gg/wiki/Crew%27s_Bunk) |
| `crew_speed_multiplier` | 0.5 | ratio | wiki_snapshot | [ECON-CREW-BUNK](https://cosmoteer.wiki.gg/wiki/Crew%27s_Bunk) |
| `maximum_doors` | 1 | doors | wiki_snapshot | [ECON-CREW-BUNK](https://cosmoteer.wiki.gg/wiki/Crew%27s_Bunk) |

### 적용 메모

- 게시된 Value2000이 강철24×단가25=600 및 부품값=구성 자원값 규칙과 맞지 않음. 600을 게임 확인값으로 채택하지 않음.
- 가격과 재료표 중 어느 쪽이 구형 또는 오기인지 판정하지 못함. 가격만 비워 둔 채 재료표로 자동 건조비를 복구하는 오류를 막기 위해 양쪽 확정값을 null로 보류.

### 대조 관측값

```json
[
  {
    "field": "value_credits",
    "value": 2000,
    "source_id": "ECON-CREW-BUNK",
    "location": "infobox Value"
  },
  {
    "field": "value_credits",
    "value": 600,
    "source_id": [
      "ECON-CREW-BUNK",
      "ECON-R-STEEL",
      "ECON-CREDITS"
    ],
    "location": "derived material value, 24 * 25, not a second quoted game value"
  },
  {
    "field": "construction_resources",
    "value": [
      {
        "resource_id": "steel",
        "quantity": 24
      }
    ],
    "source_id": "ECON-CREW-BUNK",
    "location": "published material list; conflicts with the same part value and resource price sum"
  }
]
```

## 승무원 숙소 (Crew's Quarters)

- ID: `crew_quarters`
- 모드: `normal`
- 버전 범위: Cosmoteer Modern / Steam; 공개 위키 관측 스냅샷이며 정확한 게임 빌드는 미확정

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `value_credits` | 1200 | credits | wiki_snapshot | [ECON-CREW-QUARTERS](https://cosmoteer.wiki.gg/wiki/Crew%27s_Quarters) |
| `width_m` | 2 | m | wiki_snapshot | [ECON-CREW-QUARTERS](https://cosmoteer.wiki.gg/wiki/Crew%27s_Quarters) |
| `height_m` | 2 | m | wiki_snapshot | [ECON-CREW-QUARTERS](https://cosmoteer.wiki.gg/wiki/Crew%27s_Quarters) |
| `mass_t` | 4 | tonne | wiki_snapshot | [ECON-CREW-QUARTERS](https://cosmoteer.wiki.gg/wiki/Crew%27s_Quarters) |
| `hp` | 4000 | HP | wiki_snapshot | [ECON-CREW-QUARTERS](https://cosmoteer.wiki.gg/wiki/Crew%27s_Quarters) |
| `crew_beds` | 6 | crew | wiki_snapshot | [ECON-CREW-QUARTERS](https://cosmoteer.wiki.gg/wiki/Crew%27s_Quarters) |
| `construction_resources` | [{"resource_id":"steel","quantity":48}] | item[] | wiki_snapshot | [ECON-CREW-QUARTERS](https://cosmoteer.wiki.gg/wiki/Crew%27s_Quarters) |
| `crew_speed_multiplier` | 0.5 | ratio | wiki_snapshot | [ECON-CREW](https://cosmoteer.wiki.gg/wiki/Crew) |
| `maximum_doors` | 2 | door | wiki_snapshot | [V2-SUP-QUARTERS](https://cosmoteer.wiki.gg/wiki/Crew%27s_Quarters) |

