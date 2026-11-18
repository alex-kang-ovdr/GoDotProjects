# crew_access · rule

[전체 목차](README.md)

각 필드는 값·단위·근거 상태·출처를 함께 읽는다. 영문 명칭은 식별용이며 한국어 명칭은 이 자료의 번역이다.

## 부품 경계의 승무원 통행 규칙 (Crew crossing between part boundaries)

- ID: `crew_boundary_access_rules`
- 모드: `not_applicable`
- 버전 범위: Cosmoteer Modern / Steam; exact game build unknown. Wiki is unversioned; patch_confirmed applies to the cited historical patch only.

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `enclosed_room_boundary_requires_legal_door` | true | boolean | wiki_snapshot | [V2-SUP-CREW](https://cosmoteer.wiki.gg/wiki/Crew), [V2-SUP-DOOR-LOC](https://cosmoteer.wiki.gg/wiki/Door_Locations) |
| `unwalled_nonexternal_neighbors_allow_direct_access` | true | boolean | wiki_snapshot | [V2-SUP-PART-FIELDS](https://cosmoteer.wiki.gg/wiki/Modding/Data_fields) |
| `door_permission_is_separate_from_physical_adjacency` | true | boolean | wiki_snapshot | [V2-SUP-DOOR-LOC](https://cosmoteer.wiki.gg/wiki/Door_Locations), [V2-SUP-TROUBLE](https://cosmoteer.wiki.gg/wiki/Guides_Hub/Troubleshooting) |

### 적용 메모

- unwalled 규칙은 모딩 문서에서 IsExternal=false인 일반 통로류에 적용되는 예외로 한정한다. 구조 접속·문 통행·열 연결을 동일 그래프로 취급하지 않는다.

