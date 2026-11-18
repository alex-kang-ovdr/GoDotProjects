# power_packet · resource

[전체 목차](README.md)

각 필드는 값·단위·근거 상태·출처를 함께 읽는다. 영문 명칭은 식별용이며 한국어 명칭은 이 자료의 번역이다.

## 전지 (Battery)

- ID: `battery`
- 모드: `not_applicable`
- 버전 범위: Cosmoteer Modern / Steam; 공개 위키 관측 스냅샷이며 정확한 게임 빌드는 미확정

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `base_price_credits` | 미확정 | credits/item | unverified | 미확보 |
| `dropped_stack_size` | 미확정 | items/world_pile | unverified | 미확보 |
| `storage_stack_size` | 미확정 | items/storage_tile | unverified | 미확보 |
| `mass_t_per_item` | 미확정 | tonne/item | unverified | 미확보 |
| `storable_in_storage_bay` | false | boolean | wiki_snapshot | [ECON-STORAGE](https://cosmoteer.wiki.gg/wiki/Storage_Bay) |
| `packet_sizes` | [1,2,3] | game_power/battery | wiki_snapshot | [ECON-BATTERIES](https://cosmoteer.wiki.gg/wiki/Battery) |

### 적용 메모

- 일반 창고에 보관할 수 없는 전력 운반체. 가격·질량·일반 저장량을 0으로 간주하지 않음.

