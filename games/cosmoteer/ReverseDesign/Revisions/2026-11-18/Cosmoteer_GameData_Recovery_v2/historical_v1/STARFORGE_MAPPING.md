# STARFORGE와 원작 데이터의 대응

이 표는 기능과 명칭에 따른 연결 후보다. 원작의 파일 ID를 구현 ID로 바꾼 표나 배율 변환표가 아니다. 원작의 미확정 값은 비워두며 현재 게임 수치를 변경하지 않는다.

| 구현 부품 | 원작 연결 | 구현 비용 | 원작 가치(C) | 구현 HP | 원작 HP | 연결 근거 |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| part.corridor | corridor | 24 | 100 | 90 | 1000 | 통로의 통행 개념 |
| part.armor | armor | 58 | 200 | 230 | 4000 | 외부 방호 개념 |
| part.cockpit | cockpit | 240 | 10000 | 340 | 4000 | 함선 지휘 장치 |
| part.reactor | small_reactor_core | 350 | 25000 | 230 | 4000 | 발전·배터리 공급 개념 |
| part.bunk | crew_quarters | 190 | 1200 | 155 | 4000 | 6인 승무원실이라는 용도 대응 |
| part.storage | storage_bay_2x2 | 170 | 미확정 | 170 | 미확정 | 저장 공간 개념. 구현은 탄약 전용 |
| part.laser | laser_blaster | 235 | 2000 | 190 | 4000 | 에너지 무장 개념 |
| part.cannon | large_cannon | 290 | 5000 | 250 | 21000 | 중포의 용도 대응 |
| part.shield | small_shield_generator | 320 | 5000 | 180 | 6000 | 실드 방어 개념. 구현은 전방위 |
| part.thruster | standard_thruster | 105 | 1500 | 160 | 2000 | 추진 장치의 용도 대응 |
| part.radiator | radiator | 145 | 10000 | 120 | 3000 | 열 방출 개념 |

원작 값의 근거 상태와 출처는 `cosmoteer_original.json`의 같은 ID에서 확인한다. 원작 위키 관측값과 패치 명시값을 같은 확인 수준으로 해석하지 않는다.

## 수치 이식 전에 필요한 결정

- 공간: STARFORGE 부품은 기본 한 칸이며 원작 부품은 다중 m/타일 공간을 사용한다.
- 경제: STARFORGE는 단일 credits 가격 중심이다. 원작은 건조 재료와 청사진 해금 비용이 구분된다.
- 전력: 원작은 배터리 크기·수급 단위가 명시되어 있다. 구현의 숫자를 원작 power 값으로 그대로 대체하지 않는다.
- 사격각: 구현은 radians, 원작 표는 degrees를 사용한다. 수치 변환뿐 아니라 포탑·선체 가림 규칙도 함께 검토한다.
- 저장: 구현 탄약고와 원작 일반 저장고는 수용 자원·타일 적재량이 다르다.
- 열: 구현의 0~100 중심 열 상태·수리 재고와 원작의 열 네트워크·원료 경제를 별도 설계해야 한다.

## 기존 코드 데이터

| 분류 | 레코드 수 |
| --- | ---: |
| `parts` | 11 |
| `simulation` | 5 |
| `construction` | 6 |
| `economy` | 6 |
| `manufacturing` | 2 |
| `upgrade_families` | 3 |
| `upgrades` | 9 |
| `contracts` | 3 |
| `missions` | 9 |
| `fleet` | 10 |
| `presets` | 3 |
| `fleet_rules` | 2 |
| `missions_rules` | 1 |
| `crew` | 2 |
| `logistics` | 7 |
| `service_policies` | 3 |
| `service` | 4 |
| `fire` | 5 |
| `power` | 2 |
| `thermal` | 2 |
| `combat` | 5 |
| `tactics` | 4 |
| `propulsion` | 4 |
| `persistence` | 1 |
