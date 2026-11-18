# modding_documentation · rule

[전체 목차](README.md)

각 필드는 값·단위·근거 상태·출처를 함께 읽는다. 영문 명칭은 식별용이며 한국어 명칭은 이 자료의 번역이다.

## 공개 모딩 문서의 기하·금지영역 필드 (Documented geometry and exclusion fields)

- ID: `modding_geometry_documentation`
- 모드: `not_applicable`
- 버전 범위: Cosmoteer Modern / Steam; exact game build unknown. Wiki is unversioned; patch_confirmed applies to the cited historical patch only.

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `door_location_field` | AllowedDoorLocations | field_name | wiki_snapshot | [V2-SUP-DOOR-LOC](https://cosmoteer.wiki.gg/wiki/Door_Locations) |
| `door_coordinate_origin` | top_left_cell_of_unrotated_part | enum | wiki_snapshot | [V2-SUP-DOOR-LOC](https://cosmoteer.wiki.gg/wiki/Door_Locations) |
| `positive_coordinate_axes` | ["right","down"] | enum[] | wiki_snapshot | [V2-SUP-DOOR-LOC](https://cosmoteer.wiki.gg/wiki/Door_Locations) |
| `door_locations_can_address_adjacent_outside_cells` | true | boolean | wiki_snapshot | [V2-SUP-DOOR-LOC](https://cosmoteer.wiki.gg/wiki/Door_Locations) |
| `omitted_door_locations_default` | all_edges | enum | wiki_snapshot | [V2-SUP-DOOR-LOC](https://cosmoteer.wiki.gg/wiki/Door_Locations) |
| `documented_exclusion_fields` | ["Prohibits","ProhibitedBy","ProhibitLeft","ProhibitRight","ProhibitAbove","ProhibitBelow","ProhibitRects"] | field_name[] | wiki_snapshot | [V2-SUP-BLOCKING](https://cosmoteer.wiki.gg/wiki/Modding/Data_fields/Part_placement_blocking) |
| `documented_exclusion_layers` | ["default","tall"] | enum[] | wiki_snapshot | [V2-SUP-BLOCKING](https://cosmoteer.wiki.gg/wiki/Modding/Data_fields/Part_placement_blocking) |

### 적용 메모

- 이는 공개 문서에 나타난 정의 방식의 복원이며 개별 원작 모듈의 좌표 목록이 아니다. 누락된 위키 자료를 .rules의 필드 생략으로 간주하면 안 된다. 배기 거리·금지 사각형·collision mask는 여전히 미확인이다.

