# 현재 STARFORGE v4와 원작의 대응

기준 커밋: `6ca48f00f86857f821422619827b617f0de549a3`. 현재 어댑터의 개념 연결을 추출했다. 수치·형상 동등성을 뜻하지 않는다. v3 연결표와 다른 무장·추진기 연결도 v4 코드를 우선한다.

| 웹 부품 | 원작 연결 | 웹 비용 | 원작 가치 | 웹 HP | 원작 HP |
| --- | --- | ---: | ---: | ---: | ---: |
| corridor | corridor | 24 | 100 | 90 | 1000 |
| armor | armor | 58 | 200 | 230 | 4000 |
| cockpit | cockpit | 240 | 10000 | 340 | 4000 |
| reactor | small_reactor_core | 350 | 25000 | 230 | 4000 |
| reactor_medium | medium_reactor_core | 700 | 50000 | 230 | 4000 |
| reactor_large | large_reactor_core | 1050 | 75000 | 230 | 4000 |
| ammo_factory | cannon_ammo_factory | 420 | 4000 | 230 | 4000 |
| bunk | crew_quarters | 190 | 1200 | 155 | 4000 |
| storage | storage_bay_2x2 | 170 | 미확정 | 170 | 미확정 |
| laser | laser_blaster | 235 | 2000 | 190 | 4000 |
| cannon | standard_cannon | 290 | 2000 | 250 | 12000 |
| shield | small_shield_generator | 320 | 5000 | 180 | 6000 |
| thruster | small_thruster | 105 | 500 | 160 | 1000 |
| radiator | radiator | 145 | 10000 | 120 | 3000 |

현재 발전기에서 전지 팩은 6배, 발전량은 7배, 버퍼는 12.5배라는 서로 다른 조정 계수를 사용한다. 이를 보편적인 전력 단위 변환으로 일반화하지 않는다. 정확한 필드별 매핑은 [어댑터 매핑](../analysis/starforge_v4_adapter_mappings.json)에 있다.

공간·경로·실드·열·경제의 차이는 [구현 계획](../design/08_Implementation_and_Acceptance.md)에서 우선순위와 연결한다.
