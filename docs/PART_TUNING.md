# 파트 튜닝 CSV

모든 플랫폼이 공유하는 파트 튜닝 원본은 [`part_tuning.csv`](../Godot/data/part_tuning.csv)다. 게임 시작 시 `Balance.module_spec()`이 CSV 행을 기존 모듈 렌더/형상 정의와 병합한다. 빌드 BAT는 Godot의 CSV 번역 import를 피하기 위해 원본에서 비임포트 런타임 사본을 생성하며, 이 사본은 Git에 저장하지 않는다. 따라서 CSV 값 하나가 PC, Android, Web 모두의 단일 원본이다.

| 열 | 역할 | 실제 반영 |
| --- | --- | --- |
| `id` | 코드 파트 식별자 | 기존 파트 종류와 일치해야 함 |
| `display_name`, `description` | 화면 이름과 툴팁/문서용 설명 | 이름은 파트 표기에 사용 |
| `hull` | 파트 최대 내구도 | 생성 시 HP와 최대 HP에 사용 |
| `mass` | 파트 질량 | 조립체 총 질량·CoM·추력 가속도에 사용 |
| `material` | 재질 식별자 | 파트 등급/내구도 튜닝과 UI 표시용 |
| `shield`, `coverage_mass` | 방어막 레이어 공급량·질량 커버 | 방어막 최대 레이어 계산에 사용 |

고급 금속 파트(`advanced_metal`)는 CSV에서 표준 파트보다 높은 `mass`와 `hull`을 직접 지정한다. 현재 `beam4`와 `plate4`가 이 규칙의 기준 샘플이며, 새 파트도 동일한 열을 추가해 질량·내구도를 개별 조정할 수 있다.
| `power` | 전력 생산(+) 또는 소비(-) | HUD `PWR` 및 조립체 전력 합계에 사용 |
| `weapon_type` | 무기 분류 | 무기 타입 메타데이터 |
| `weapon_display_name`, `weapon_display_desc` | 무기 전용 표시 이름·설명 | HUD·세계관·내러티브에서 재사용할 무기 메타데이터 |
| `thrust`, `reverse_thrust`, `rcs_thrust` | 전진·후진·RCS 추진력 | 2D 물리 힘에 사용 |
| `ammo_type`, `ammo`, `capacity` | 탄약 종류·초기 재고·용량 | 탄약고 생성/소비에 사용 |

`MODULES`의 색, 형태, 질량, 격자 점유, 구동기 종류는 코드 구조 데이터로 남긴다. 숫자 게임 밸런스와 플레이어가 읽을 이름·설명은 CSV만 수정한다. 새 파트는 CSV 행과 `MODULES`의 구조 정의를 함께 추가해야 한다.
