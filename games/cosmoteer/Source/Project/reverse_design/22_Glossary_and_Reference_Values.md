# 22. 용어·단위·분석값 사전

[전체 목차](README.md) · 문서 ID: REF-22 · 작성: 2026-11-13 · 기준: 0.30.5a 문헌

## 1. 사용 원칙

이 문서의 한국어는 분석을 위한 번역이다. 실제 게임 또는 번역 모드의 표시명과 다를 수 있으므로 영문을 함께 기록한다. 수치가 필요한 규칙은 담당 문서의 근거와 버전을 우선한다. 아래 사전은 전체 부품 가격표나 최신 밸런스 데이터베이스가 아니다.

같은 단어가 서로 다른 기능에 쓰이면 의미를 나눈다. 특히 Blueprint, power, storage, heat, control을 하나의 상태로 합치지 않는다. 원작 규칙의 출처는 각 연결 문서 말미에서 확인할 수 있다.

## 2. 설계와 함선 구조

| 영문·표현 | 이 문서의 한국어 | 뜻과 구분 | 담당 |
| --- | --- | --- | --- |
| Ship | 함선 | 여러 부품과 실행 상태의 집합 | [03](03_Modules_Connectivity_and_Ship_Splitting.md) |
| Part / Module | 부품 / 모듈 | 배치 가능한 장치·구조의 단위 | [02](02_Ship_Construction_and_Blueprints.md) |
| Tile | 타일 | 배치와 내부 공간을 설명하는 단위 | [02](02_Ship_Construction_and_Blueprints.md) |
| Ship Editor / Build Mode | 함선 편집기 / 건조 모드 | 구조를 편집하는 인터페이스 | [02](02_Ship_Construction_and_Blueprints.md) |
| Blueprint Mode | 설계 미리보기 모드 | 변경 계획을 다루는 편집 개념 | [02](02_Ship_Construction_and_Blueprints.md) |
| Blueprints / Unlock | 부품 설계 해금 | 건조할 수 있는 부품의 권한 | [16](16_Career_Missions_Fame_and_Factions.md) |
| Saved Ship Design | 저장된 함선 설계 | 배치와 설정을 재사용하는 설계 콘텐츠 | [19](19_Creative_Multiplayer_and_Modding.md) |
| Structure | 구조 부품 | 구조 연결 기능과 해당 부품군 | [03](03_Modules_Connectivity_and_Ship_Splitting.md) |
| Corridor / Door | 통로 / 문 | 승무원의 내부 통행 조건 | [04](04_Crew_Roles_and_Task_AI.md) |
| Airlock | 에어록 | 내부와 외부 이동의 접점 | [04](04_Crew_Roles_and_Task_AI.md) |
| Connectivity | 연결성 | 구조·통행·공급·열에 각각 다른 의미 | [20](20_Technical_Architecture_and_Data_Model.md) |
| Fragment / Debris | 분리 조각 / 잔해 | 파괴 후 소속·제어를 재판정할 대상 | [03](03_Modules_Connectivity_and_Ship_Splitting.md) |

## 3. 인력·물류·전력

| 영문·표현 | 한국어 | 뜻과 구분 | 담당 |
| --- | --- | --- | --- |
| Crew | 승무원 | 장치 운용과 운반 등을 수행하는 개체 | [04](04_Crew_Roles_and_Task_AI.md) |
| Crew Role | 승무원 역할 | 작업 우선순위 등을 묶은 운영 설정 | [04](04_Crew_Roles_and_Task_AI.md) |
| Job Priority | 작업 우선순위 | 가능한 작업 가운데 선택을 조절하는 값 | [04](04_Crew_Roles_and_Task_AI.md) |
| Assignment | 배정 | 인력 또는 공급의 담당 관계. 대상에 따라 의미가 다름 | [04](04_Crew_Roles_and_Task_AI.md), [05](05_Internal_Logistics_and_Supply.md) |
| Supply Chain | 공급망 지정 | 자원의 허용 출발·도착 관계 | [05](05_Internal_Logistics_and_Supply.md) |
| Logistics | 물류 | 물량·위치·운반·수요의 연결 | [05](05_Internal_Logistics_and_Supply.md) |
| Battery | 전지 / 배터리 | 장치에 전달하는 전력 자원 | [06](06_Power_Generation_and_Distribution.md) |
| Reactor | 원자로 | 전력 생성과 공급의 핵심 장치군 | [06](06_Power_Generation_and_Distribution.md) |
| Power Capacitor | 전력 축전기 | 전력 저장·분배를 다루는 부품 | [06](06_Power_Generation_and_Distribution.md) |
| Capacity | 용량 | 한 시점에 담을 수 있는 양 | [06](06_Power_Generation_and_Distribution.md) |
| Throughput | 처리율 | 시간당 전달·소비·생산하는 양 | [05](05_Internal_Logistics_and_Supply.md) |
| Buffer | 버퍼 / 비축 | 순간 수요와 지속 공급의 차이를 흡수하는 저장 | [01](01_Core_Loop_and_System_Map.md) |
| Reservation | 예약 | 재구현 모델에서 자원의 사용 권리를 미리 확보한 상태 | [20](20_Technical_Architecture_and_Data_Model.md) |

`Reservation`과 `Buffer`는 문서에서 사용하는 분석·구현 용어다. 게임 내부 클래스나 UI가 같은 이름을 쓴다고 가정하지 않는다.

## 4. 전투·열

| 영문·표현 | 한국어 | 뜻과 구분 | 담당 |
| --- | --- | --- | --- |
| Firing Arc | 사격각 | 무기가 조준·사격할 수 있는 각도 범위 | [08](08_Weapons_and_Fire_Control.md) |
| Range | 사거리 | 무기별 거리 조건. 사용자 제한과 원래 성능을 구분 | [08](08_Weapons_and_Fire_Control.md) |
| Target Part | 표적 부품 | 함선 전체 명령과 구분되는 개별 표적 | [12](12_Tactical_Combat_and_Fleet_Control.md) |
| Point Defense / Flak | 근접 방어 / 대공포 | 요격 대상과 방식이 다른 방어 장치 | [09](09_Defense_Shields_and_Point_Defense.md) |
| Shield | 방어막 | 선체 체력·장갑과 별도 판정되는 방어 | [09](09_Defense_Shields_and_Point_Defense.md) |
| Penetration | 관통 | 여러 대상·셀을 지나는 공격 처리 | [08](08_Weapons_and_Fire_Control.md), [10](10_Damage_Fire_and_Destruction.md) |
| Fire | 화재 | 발생·확산·진압과 손상을 다루는 상태 | [10](10_Damage_Fire_and_Destruction.md) |
| Scorched | 그을린 상태 | 일반 피해·열과 구분해 다룰 상태 | [10](10_Damage_Fire_and_Destruction.md) |
| Heat | 열 | 선체 열과 열 네트워크를 구분해서 읽음 | [11](11_Heat_and_Overclocking.md) |
| Overclocking | 오버클럭 | 특정 장치의 작동 특성을 바꾸는 기능 | [11](11_Heat_and_Overclocking.md) |
| Heat Pipe | 열 배관 | 열 네트워크의 연결 구성 요소 | [11](11_Heat_and_Overclocking.md) |
| Radiator | 방열기 | 열 방출을 다루는 장치 | [11](11_Heat_and_Overclocking.md) |
| Thermal Battery | 열 저장 장치 | 전력 축전기와 다른 계통의 저장 장치 | [11](11_Heat_and_Overclocking.md) |
| Alpha / Burst | 초동 / 순간 출력 | 짧은 구간의 공격 성과를 설명하는 분석 용어 | [08](08_Weapons_and_Fire_Control.md) |
| Sustained DPS | 지속 피해율 | 지정 관측 구간에서 유지한 평균 피해 | [01](01_Core_Loop_and_System_Map.md) |

## 5. 탐사·경제·진행

| 영문·표현 | 한국어 | 뜻과 구분 | 담당 |
| --- | --- | --- | --- |
| Sensor | 센서 | 탐지와 정보 확보 기능 | [13](13_Sensors_Exploration_and_Hyperjump.md) |
| Hyperdrive / Hyper-jump | 초공간 장치 / 도약 | 이동 조건과 자원 요구를 별도 관리 | [13](13_Sensors_Exploration_and_Hyperjump.md) |
| Hyperium | 하이퍼리움 | 초공간 이동 관련 자원명 | [13](13_Sensors_Exploration_and_Hyperjump.md) |
| Mining | 채굴 | 천체의 자원을 회수 가능한 상태로 바꾸는 활동 | [14](14_Resources_Mining_and_Salvage.md) |
| Salvage | 잔해 해체·회수 | 잔해와 자원의 처리 | [14](14_Resources_Mining_and_Salvage.md) |
| Claim | 인수 / 소유권 확보 | 함선 확보와 단순 자원 회수의 구분 | [14](14_Resources_Mining_and_Salvage.md) |
| Manipulator Beam | 조작 빔 | 운반·상호작용 장치의 현행 명칭을 확인할 항목 | [14](14_Resources_Mining_and_Salvage.md) |
| Credits | 크레딧 | 화폐. 물리적으로 보유한 자원과 다른 상태 | [15](15_Manufacturing_Storage_and_Trade.md) |
| Desired / Maximum | 목표 / 최대 재고 | 저장·생산 정책에서 서로 다른 설정 | [15](15_Manufacturing_Storage_and_Trade.md) |
| Fame | 명성 | 성장·고용 범위와 연결되는 진행 축 | [16](16_Career_Missions_Fame_and_Factions.md) |
| Reputation / Faction Relation | 세력 관계 | 특정 세력과의 관계. 명성과 분리 | [16](16_Career_Missions_Fame_and_Factions.md) |
| Career 2.0 | 커리어 개편 계획 | 이번 기준에서 현행 규칙과 구분하는 개발 중 범위 | [23](23_Sources_and_Fact_Check.md) |

## 6. 수치를 채택하는 방식

| 값의 종류 | 허용하는 표기 | 실제 사용 전 확인 |
| --- | --- | --- |
| 정식 패치가 명시한 변경 | 버전·출처와 함께 정확한 값 | 그 이후 변경 여부 |
| 위키에만 있는 현재 값 | 문헌 값이라고 명시 | 최신 패치·실제 툴팁·게임 데이터 |
| 서로 다른 자료가 충돌 | 양쪽 주장과 미확정 범위 | 동일 조건의 실측 |
| 원작 공식으로 확인하지 못한 수식 | 분석식 또는 제안식 | 어떤 조건에서 근사하는지 |
| 구현 예제의 상수 | `[가정 예시]` | 실제 부품 값으로 복사하지 않기 |
| 시간·프레임·전지의 단위 변환 | 단위와 변환 기준 병기 | 게임 배속·팩당 양·틱 빈도 |

무기 사거리, 부품 가격, 승무원 상한처럼 변경 가능성이 큰 수치의 전체 표를 임의로 채우지 않았다. 중요한 현재 값과 충돌 사항은 해당 시스템 문서에 필요한 만큼만 넣었다.

## 7. 분석 모델의 기호 [제안]

| 기호 | 단위 | 의미 |
| --- | --- | --- |
| `n` | 명 | 특정 운반 작업에 실제 투입 가능한 인원 |
| `q` | 자원 단위/회 | 한 번의 운반량 |
| `T_trip` | 게임 초/회 | 왕복·대기·인수·인계 전체 시간 |
| `R_supply` | 자원 단위/게임 초 | 실제 공급 처리율 |
| `R_demand` | 자원 단위/게임 초 | 장치의 소비 요구 |
| `B` | 자원 단위 | 사용 가능한 비축 |
| `T_test` | 게임 초 | 성능을 측정한 관측 구간 |
| `D_total` | 피해 단위 | 해당 구간에 실제 해석된 피해 합 |

단순 정상상태 운반 모델은 `R_supply ≈ n × q / T_trip`이다. 공급보다 수요가 큰 일정 구간에서 소진까지의 근사는 `T_deplete ≈ B / (R_demand - R_supply)`이며, 분모가 0 이하라면 이 식을 사용하지 않는다. 모든 변수가 해당 구간에서 거의 일정하다는 가정이 필요하다.

관측 유효 DPS는 `D_total / T_test`다. 장갑·방어막·명중·사격 기회가 다른 구간을 같은 조건의 DPS처럼 비교하지 않는다. 원작의 공격 처리식을 대체하는 공식이 아니라 실험 결과를 요약하는 값이다.

## 8. 데이터 추출·확정 양식 [제안]

| 필드 | 기록 내용 |
| --- | --- |
| RuleId | 문서와 실험에서 공통으로 쓰는 규칙 ID |
| GameBuild | 정확한 실행 빌드 |
| DefinitionId | 해당 부품·자원·설정의 실제 식별자 |
| Field / Unit | 필드 이름과 단위 |
| Base / Mode | 기본 상태인지 오버클럭 등 변형인지 |
| Source / Evidence | 패치·툴팁·공개 데이터·실측 기록 |
| Confidence | 확정·부분확정·충돌·미확인 |
| OwnerDocument | 규칙을 소유한 문서 |

게임에서 확인한 식별자는 직접 복사하고, 번역된 이름이나 위키의 추정 ID로 다시 만들지 않는다. 수치가 수정되면 계산 예제뿐 아니라 연결 문서의 가정·테스트 조건도 함께 확인한다.

## 관련 문서

범위와 근거 표기는 [00](00_Scope_and_Evidence.md), 구현 데이터는 [20](20_Technical_Architecture_and_Data_Model.md), 개별 출처와 아직 해결되지 않은 충돌은 [23](23_Sources_and_Fact_Check.md)에 모았다.
