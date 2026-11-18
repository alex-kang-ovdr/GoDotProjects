# propulsion_rule · rule

[전체 목차](README.md)

각 필드는 값·단위·근거 상태·출처를 함께 읽는다. 영문 명칭은 식별용이며 한국어 명칭은 이 자료의 번역이다.

## 모듈식 로켓 정상 가속 시간 (MRT normal ramp-up)

- ID: `mrt_ramp_up_normal`
- 모드: `normal`
- 버전 범위: Modern wiki snapshot

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `base_seconds` | 4 | s | wiki_snapshot | [SUP-MRT](https://cosmoteer.wiki.gg/wiki/Modular_Rocket_Thruster) |
| `first_extender_seconds` | 2 | s | wiki_snapshot | [SUP-MRT](https://cosmoteer.wiki.gg/wiki/Modular_Rocket_Thruster) |
| `extenders_2_to_7_seconds_each` | 1 | s/module | wiki_snapshot | [SUP-MRT](https://cosmoteer.wiki.gg/wiki/Modular_Rocket_Thruster) |
| `extenders_8_plus_seconds_each` | 0.5 | s/module | wiki_snapshot | [SUP-MRT](https://cosmoteer.wiki.gg/wiki/Modular_Rocket_Thruster) |

### 적용 메모

- x=확장 모듈 개수, 정수 >=0. 가속 시간만 복구. 확장별 추력·소모 수식은 포함하지 않음.

