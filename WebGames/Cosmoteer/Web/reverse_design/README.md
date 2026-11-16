# Cosmoteer 시스템별 역기획서

**Cosmoteer: Starship Architect & Commander**를 함선 구조, 인력·공급, 전투·열, 탐사·경제, 진행, UI와 확장 구조로 나누어 분석한 한국어 문서 묶음이다.

| 항목 | 내용 |
| --- | --- |
| 작성일 | 2026-11-13 |
| 문헌 기준 | 조사에서 확인한 상용판 0.30.5a까지의 공개 자료 |
| 구성 | README 1개 + 본문·부록 24개, 총 25개 Markdown |
| 핵심 목적 | 플레이 규칙을 이해하고, 비슷한 시스템을 설계·구현할 때 필요한 상태·계약·검증 조건을 정리 |
| 검증 범위 | 공개 문헌 교차 확인과 문서 구조 검수. 게임 실행·설치 데이터·원본 소스 분석은 수행하지 않음 |

## 먼저 읽을 내용

이 게임의 설계는 부품을 설치하는 단계에서 끝나지 않는다. 내부 동선, 인력 역할, 자원 위치, 공급 설정, 전력과 열, 부위 손상이 전투 성능에 함께 영향을 준다. 이 문서는 그 연결을 중심으로 작성했다. 게임의 제품 범위는 [공식 홈페이지](https://cosmoteer.net/)를, 판본 판단은 [공식 개발자 공지](https://steamcommunity.com/app/799600/allnews/)를 참고했다.

각 문서는 **[확인]**, **[해석]**, **[제안]**, **[검증 필요]**를 구분한다. 확인은 문헌 확인을 뜻하며 직접 플레이한 실험 결과를 뜻하지 않는다. 수식과 의사코드는 별도 확정 근거가 없는 한 재구현 모델이다. 전체 규약은 [00. 분석 범위와 근거 관리](00_Scope_and_Evidence.md)에 있다.

요청된 [나무위키 링크](https://namu.wiki/w/Cosmoteer)는 직접 열람할 수 없어 내용의 근거로 사용하지 않았다. 개발자 공지와 공식 Wiki를 대체 자료로 사용했으며, 접근 상태와 출처별 지원 범위는 [23](23_Sources_and_Fact_Check.md)에 기록했다.

## 1. 전체 목차

### 분석의 기준과 전체 구조

| 번호 | 문서 | 주요 내용 |
| --- | --- | --- |
| 00 | [분석 범위와 근거 관리](00_Scope_and_Evidence.md) | 버전·확인 수준·단위·규칙 소유권 |
| 01 | [코어 루프와 시스템 관계](01_Core_Loop_and_System_Map.md) | 설계→운용→전투→성장의 연결, 병목 모델 |

### 함선 설계와 운영

| 번호 | 문서 | 주요 내용 |
| --- | --- | --- |
| 02 | [함선 건조·편집·설계도](02_Ship_Construction_and_Blueprints.md) | 배치·검증·건조·설계안과 부품 해금 |
| 03 | [부품 연결·함선 분리](03_Modules_Connectivity_and_Ship_Splitting.md) | 구조·통행·제어·분리 후 상태 |
| 04 | [승무원·역할·작업 AI](04_Crew_Roles_and_Task_AI.md) | 인력 배정·우선순위·이동·작업 상태 |
| 05 | [내부 물류·공급망](05_Internal_Logistics_and_Supply.md) | 운반·예약·경로·처리율·버퍼 |
| 06 | [발전·전지·전력 분배](06_Power_Generation_and_Distribution.md) | 생성·묶음·배송·저장·지역 전력 예산 |
| 07 | [추진·기동](07_Propulsion_and_Maneuvering.md) | 추력·선회·제동·기관실·모듈 추진 |

### 전투·생존·열

| 번호 | 문서 | 주요 내용 |
| --- | --- | --- |
| 08 | [무기·사격 통제](08_Weapons_and_Fire_Control.md) | 무기 계열·사격각·자원 소비·가동률 |
| 09 | [장갑·방어막·요격](09_Defense_Shields_and_Point_Defense.md) | 방어 단계·요격 대상·방어망 병목 |
| 10 | [피해·화재·파괴](10_Damage_Fire_and_Destruction.md) | 부위 피해·연쇄 손상·진압·복구 |
| 11 | [열·냉각·오버클럭](11_Heat_and_Overclocking.md) | 선체 열·배관 열망·방열·열 저장·지속 출력 |
| 12 | [전술 전투·함대 지휘](12_Tactical_Combat_and_Fleet_Control.md) | 거리·자세·부위 표적·명령·함대 역할 |

### 탐사·자원·경제·성장

| 번호 | 문서 | 주요 내용 |
| --- | --- | --- |
| 13 | [센서·탐사·초공간 이동](13_Sensors_Exploration_and_Hyperjump.md) | 정보·관측·환경·연료·점프 조건 |
| 14 | [자원·채굴·잔해 회수](14_Resources_Mining_and_Salvage.md) | 자원 흐름·회수·인수·외부 운송 |
| 15 | [생산·저장·거래](15_Manufacturing_Storage_and_Trade.md) | 제조 사슬·목표 재고·상한·거래 원장 |
| 16 | [Career·임무·명성·진영](16_Career_Missions_Fame_and_Factions.md) | 임무·보상·고용 상한·관계·해금 |
| 17 | [성장·밸런스](17_Progression_and_Balance.md) | 성장 제약·보상·난이도·비교 지표 |

### UX·확장·재구현

| 번호 | 문서 | 주요 내용 |
| --- | --- | --- |
| 18 | [UI·UX·플레이어 피드백](18_UI_UX_and_Player_Feedback.md) | 실패 원인·오버레이·편집 흐름·학습 |
| 19 | [Creative·멀티플레이·모딩](19_Creative_Multiplayer_and_Modding.md) | 모드 정책·권한·공유·네트워크·콘텐츠 확장 |
| 20 | [아키텍처·데이터 모델](20_Technical_Architecture_and_Data_Model.md) | 엔터티·그래프·예약 원장·틱·저장·성능 |
| 21 | [제작 단계·통합 수용 기준](21_Production_Plan_and_Acceptance_Tests.md) | 수직 단면·의존성·통합 시나리오·완료 정의 |

### 참고 자료

| 번호 | 문서 | 주요 내용 |
| --- | --- | --- |
| 22 | [용어·단위·분석값 사전](22_Glossary_and_Reference_Values.md) | 한국어/영문 대응·수식 기호·값의 확정 방식 |
| 23 | [출처·판본 차이·후속 확인](23_Sources_and_Fact_Check.md) | 출처 색인·접근 상태·자료 충돌·실측 우선순위 |

## 2. 목적에 따른 읽기 순서

**게임의 핵심 설계를 이해하려면:** [01](01_Core_Loop_and_System_Map.md) → [02](02_Ship_Construction_and_Blueprints.md) → [04](04_Crew_Roles_and_Task_AI.md) → [05](05_Internal_Logistics_and_Supply.md) → [08](08_Weapons_and_Fire_Control.md) → [11](11_Heat_and_Overclocking.md) → [17](17_Progression_and_Balance.md).

**시뮬레이션을 구현하려면:** [03](03_Modules_Connectivity_and_Ship_Splitting.md) → [04](04_Crew_Roles_and_Task_AI.md) → [05](05_Internal_Logistics_and_Supply.md) → [07](07_Propulsion_and_Maneuvering.md) → [10](10_Damage_Fire_and_Destruction.md) → [11](11_Heat_and_Overclocking.md) → [20](20_Technical_Architecture_and_Data_Model.md).

**커리어와 콘텐츠를 설계하려면:** [13](13_Sensors_Exploration_and_Hyperjump.md) → [14](14_Resources_Mining_and_Salvage.md) → [15](15_Manufacturing_Storage_and_Trade.md) → [16](16_Career_Missions_Fame_and_Factions.md) → [17](17_Progression_and_Balance.md).

**개발 범위와 검증 계획을 잡으려면:** [00](00_Scope_and_Evidence.md) → [18](18_UI_UX_and_Player_Feedback.md) → [19](19_Creative_Multiplayer_and_Modding.md) → [21](21_Production_Plan_and_Acceptance_Tests.md) → [23](23_Sources_and_Fact_Check.md).

## 3. 각 시스템 문서에서 제공하는 것

- 시스템의 목적과 플레이어가 하는 선택.
- 문헌으로 확인한 규칙과 조건.
- 입력·출력·데이터 상태·다른 시스템과의 계약.
- 상태 변화·예외·취소·손상에 대한 처리 관점.
- 설계 의도, 대표 병목, 예시 시나리오.
- 재구현을 위한 데이터 모델·의사코드·분석식.
- 튜닝 지표와 향후 실행할 수용·재현 테스트.
- 직접 URL 출처와 미확정 조건.

## 4. 활용할 때 특히 구분할 것

| 구분 | 실무상 이유 |
| --- | --- |
| 함선 구조 연결 / 승무원 통행 | 붙어 있는 부품이 항상 왕래 가능한 것은 아님 |
| 발전 능력 / 장치 현지 전력 | 생산과 운반을 별도로 검토 |
| 초기 비축 / 지속 처리율 | 짧은 교전과 장기 교전 결과 분리 |
| 선체 열 / 배관 열망 / 화재 | 다른 상태와 전달 규칙을 유지 |
| 명성 / 진영 관계 / 크레딧 / 해금 | 서로 다른 성장 축을 독립 관리 |
| 문헌 사실 / 재구현 제안 | 공개 근거 없는 내부 구현을 확정하지 않음 |
| 현재 Career / 개발 중 개편 | 예정 기능을 현재 명세에 섞지 않음 |

## 5. 파일 사용법

ZIP을 풀고 이 `README.md`부터 열면 된다. 모든 문서는 같은 폴더에 있고 상대 경로로 연결되어 있다. GitHub 또는 Mermaid 지원 Markdown 뷰어에서는 관계·상태 다이어그램을 렌더링할 수 있으며, 지원하지 않는 뷰어에서도 원본 코드와 인접 설명을 읽을 수 있다.

문서 안의 JSON과 의사코드, 수식은 설명용이며 게임에 바로 설치하는 모드가 아니다. 실제 제작에 적용할 때에는 [21](21_Production_Plan_and_Acceptance_Tests.md)의 단계와 [23](23_Sources_and_Fact_Check.md)의 미확정 항목부터 확인한다.
