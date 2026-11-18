# logistics · rule

[전체 목차](README.md)

각 필드는 값·단위·근거 상태·출처를 함께 읽는다. 영문 명칭은 식별용이며 한국어 명칭은 이 자료의 번역이다.

## 전지 요청과 공급원 선택 관측 (Battery request and source-selection observations)

- ID: `battery_dispatch_observations`
- 모드: `not_applicable`
- 버전 범위: Cosmoteer Modern / Steam; exact game build unknown. Wiki is unversioned; patch_confirmed applies to the cited historical patch only.

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `resupply_fetches_whole_battery_packet` | true | boolean | wiki_snapshot | [V2-SUP-BATTERIES](https://cosmoteer.wiki.gg/wiki/Batteries) |
| `source_selection_tendency` | usually_closest_source | enum | wiki_snapshot | [V2-SUP-BATTERIES](https://cosmoteer.wiki.gg/wiki/Batteries) |

### 적용 메모

- 정밀한 tie-breaker·예외·장치별 요청 임계값의 현행 빌드는 확인하지 않았다. 이 규칙으로 v4의 부분 운반을 원작과 동일하다고 표시하면 안 된다. 기존 small reactor charge-time 충돌도 해결되지 않는다.

## 저장 타일 지정과 명시적 공급 연결 (Storage designation and explicit supply chains)

- ID: `storage_supply_chain_rules`
- 모드: `not_applicable`
- 버전 범위: Cosmoteer Modern / Steam; exact game build unknown. Wiki is unversioned; patch_confirmed applies to the cited historical patch only.

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `one_resource_type_per_storage_tile` | true | boolean | wiki_snapshot | [V2-SUP-STORAGE](https://cosmoteer.wiki.gg/wiki/Storage_Bay) |
| `resource_designation_supported` | true | boolean | wiki_snapshot | [V2-SUP-STORAGE](https://cosmoteer.wiki.gg/wiki/Storage_Bay) |
| `automatic_factory_to_storage_when_designated_space_or_below_limit` | true | boolean | wiki_snapshot | [V2-SUP-STORAGE](https://cosmoteer.wiki.gg/wiki/Storage_Bay) |
| `explicit_supply_chain_excludes_unlinked_destinations` | true | boolean | wiki_snapshot | [V2-SUP-STORAGE](https://cosmoteer.wiki.gg/wiki/Storage_Bay) |

### 적용 메모

- 저장고의 Resource Collector라는 오래된 명칭은 기능 ID로 채택하지 않는다. 원작 타일별 공유 저장 공간은 현재 STARFORGE의 독립 탄약·황 버퍼와 다르다.

