# propulsion_mode · mode_override

[전체 목차](README.md)

각 필드는 값·단위·근거 상태·출처를 함께 읽는다. 영문 명칭은 식별용이며 한국어 명칭은 이 자료의 번역이다.

## 부스트 추진기 / 오버클럭 (Boost Thruster / Overclock)

- ID: `boost_thruster_overclock`
- 모드: `overclock`
- 버전 범위: 0.30.5 정식 패치에서 명시한 변경 필드만 포함

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `heat_not_boosting_per_s` | 675 | game_heat/s | patch_confirmed | [SUP-PATCH-0305](https://steamcommunity.com/app/799600/allnews/?l=english) |
| `boost_thrust_kn` | 미확정 | kN | conflict | [SUP-PATCH-0305](https://steamcommunity.com/app/799600/allnews/?l=english) |

### 적용 메모

- 불완전한 모드 차이표. 명시되지 않은 성능을 일반 모드와 동일하다고 가정하지 말 것.
- 공지의 14kN 표기가 기본 부스트 9,600kN과 단위 규모가 맞지 않음. 14,000kN로 추정 변환하지 않고 null로 보존.

### 대조 관측값

```json
[
  {
    "field": "boost_thrust_kn",
    "value": "14kN",
    "source_id": "SUP-PATCH-0305",
    "location": "24kN->14kN"
  }
]
```

## 2방향 소형 추진기 / 오버클럭 (2-Way Small Thruster / Overclock)

- ID: `small_thruster_2way_overclock`
- 모드: `overclock`
- 버전 범위: 0.30.5 정식 패치에서 명시한 변경 필드만 포함

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `heat_while_thrusting_per_s` | 200 | game_heat/s | patch_confirmed | [SUP-PATCH-0305](https://steamcommunity.com/app/799600/allnews/?l=english) |
| `heat_while_generating_per_s` | 125 | game_heat/s | patch_confirmed | [SUP-PATCH-0305](https://steamcommunity.com/app/799600/allnews/?l=english) |
| `power_generation_while_thrusting_per_s` | 0 | game_power/s | patch_confirmed | [SUP-PATCH-0305](https://steamcommunity.com/app/799600/allnews/?l=english) |

### 적용 메모

- 불완전한 모드 차이표. 명시되지 않은 성능을 일반 모드와 동일하다고 가정하지 말 것.

## 3방향 소형 추진기 / 오버클럭 (3-Way Small Thruster / Overclock)

- ID: `small_thruster_3way_overclock`
- 모드: `overclock`
- 버전 범위: 0.30.5 정식 패치에서 명시한 변경 필드만 포함

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `heat_while_thrusting_per_s` | 200 | game_heat/s | patch_confirmed | [SUP-PATCH-0305](https://steamcommunity.com/app/799600/allnews/?l=english) |
| `heat_while_generating_per_s` | 125 | game_heat/s | patch_confirmed | [SUP-PATCH-0305](https://steamcommunity.com/app/799600/allnews/?l=english) |
| `power_generation_while_thrusting_per_s` | 0 | game_power/s | patch_confirmed | [SUP-PATCH-0305](https://steamcommunity.com/app/799600/allnews/?l=english) |

### 적용 메모

- 불완전한 모드 차이표. 명시되지 않은 성능을 일반 모드와 동일하다고 가정하지 말 것.

## 소형 추진기 / 오버클럭 (Small Thruster / Overclock)

- ID: `small_thruster_overclock`
- 모드: `overclock`
- 버전 범위: 0.30.5 정식 패치에서 명시한 변경 필드만 포함

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `heat_while_thrusting_per_s` | 200 | game_heat/s | patch_confirmed | [SUP-PATCH-0305](https://steamcommunity.com/app/799600/allnews/?l=english) |
| `heat_while_generating_per_s` | 125 | game_heat/s | patch_confirmed | [SUP-PATCH-0305](https://steamcommunity.com/app/799600/allnews/?l=english) |
| `power_generation_while_thrusting_per_s` | 0 | game_power/s | patch_confirmed | [SUP-PATCH-0305](https://steamcommunity.com/app/799600/allnews/?l=english) |

### 적용 메모

- 불완전한 모드 차이표. 명시되지 않은 성능을 일반 모드와 동일하다고 가정하지 말 것.

