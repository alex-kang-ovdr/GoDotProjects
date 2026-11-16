# Don't Starve 시스템별 상세 역기획서

> 작성일: 2026-11-13 | 문서 버전: 1.0 | 형식: UTF-8 Markdown 23개  
> 기준: PC 싱글플레이 Don't Starve 원작 + Reign of Giants의 공통·확장 규칙 분리

## 1. 문서집 소개

이 문서집은 Don't Starve의 생존 경험을 **규칙, 자원 교환, 상태 전이, 시스템 간 연결, 데이터 구조, 예외 상황, 검증 시나리오**로 나누어 분석한다. 각 파일은 독립적으로 읽을 수 있으며 관련 시스템은 상대 경로로 연결했다.

요청에 포함된 링크의 표시 문구는 This War of Mine이었으나 실제 목적지와 게임명은 Don't Starve였으므로 Don't Starve를 대상으로 작성했다. 사용자 링크: [Don't Starve — 나무위키](https://namu.wiki/w/Don%27t%20Starve).

나무위키 본문은 이번 조사 환경에서 열리지 않았다. Klei 공식 소개·지원 문서·개발자 공지와 Don't Starve Wiki의 검색 인덱스로 보완했으며, 접근 방식과 자료 충돌은 [출처 및 검증 기록](90_sources_and_verification.md)에 남겼다.

## 2. 분석 범위

| 구분 | 포함 범위 |
|---|---|
| 원작 DS | DLC를 끈 PC 싱글플레이의 핵심 규칙 |
| Reign of Giants | 계절·환경·캐릭터·생물 등의 확장 규칙을 별도 표시 |
| 2023 업데이트 | 공개된 Mega Update의 주요 관련 변경을 반영 |
| Shipwrecked·Hamlet | 별도 제품 환경·경제의 차이와 확장 분석 항목 |
| Don't Starve Together | 원작과 섞기 쉬운 규칙을 비교. 전체 DST 역기획은 아님 |
| 기술 구조 | 같은 행동을 구현하기 위한 재구성안. 원본 코드 복원 아님 |
| 대표 수치 | 제품 범위를 확인할 수 있는 일부 수치와 계산 예시 |
| 검증 | 문헌·문서 구조 검토. 실제 설치 빌드 플레이·프레임 계측·소스 대조는 미실시 |

작성 날짜가 곧 특정 플랫폼의 최신 빌드 검증일을 뜻하지는 않는다. 정확한 최신 빌드 번호를 확보하지 못했으며, 실제 제작에 사용할 때는 [20번 문서](20_balance_qa_reproduction.md)의 방식으로 빌드·DLC·설정을 고정한다.

## 3. 전체 파일 목록

| 번호 | 파일 | 주요 내용 |
|---:|---|---|
| 00 | [00_index.md](00_index.md) | 범위·목차·읽는 순서·핵심 분석 |
| 01 | [01_overview_core_loop.md](01_overview_core_loop.md) | 게임 정의, 설계 기둥, 시간 규모별 플레이 루프, 시스템 의존성 |
| 02 | [02_time_day_night.md](02_time_day_night.md) | 하루·낮·황혼·밤, 빛과 어둠, 수면, 시간 이벤트 |
| 03 | [03_survival_stats.md](03_survival_stats.md) | 체력·허기·정신력, 상태 변화, 고갈과 회복, 복합 압력 |
| 04 | [04_characters.md](04_characters.md) | 캐릭터 특성, 고유 능력, 식성, 변신·동료, 해금 |
| 05 | [05_world_generation_exploration.md](05_world_generation_exploration.md) | 월드 생성, 바이옴, 지역 연결, 탐험, 지도 정보 |
| 06 | [06_resources_tools_gathering.md](06_resources_tools_gathering.md) | 자원 분류, 도구, 작업, 재생, 유한 자원과 경제 |
| 07 | [07_inventory_equipment_durability.md](07_inventory_equipment_durability.md) | 인벤토리, 장비 슬롯, 내구도, 가방·상자, 이동과 보관 |
| 08 | [08_crafting_research_magic.md](08_crafting_research_magic.md) | 제작 조건, 연구·프로토타입, 설계도, 마법, 해금 |
| 09 | [09_building_base_fire.md](09_building_base_fire.md) | 건설·배치, 거점 운용, 광원, 화재·방재, 자산 위험 |
| 10 | [10_food_cooking_spoilage.md](10_food_cooking_spoilage.md) | 음식, 냄비 조합·우선순위, 부패, 신선도, 조리·보존 |
| 11 | [11_farming_animals_sustainability.md](11_farming_animals_sustainability.md) | 농장·이식, 꿀·새장·동물 자원, 지속 생산과 원작 농업 |
| 12 | [12_seasons_weather_temperature.md](12_seasons_weather_temperature.md) | 계절, 기온·체온, 비·젖음, 추위·과열, 환경 피해 |
| 13 | [13_combat_armor.md](13_combat_armor.md) | 공격 상태, 회피, 사거리·경직, 방어구 중첩, 피해·파손 |
| 14 | [14_creatures_ecology_ai.md](14_creatures_ecology_ai.md) | 생물 행동, 적대·추적·도주, 집단 반응, 생태계 활용 |
| 15 | [15_bosses_raids_events.md](15_bosses_raids_events.md) | 하운드 습격, 거인·보스, 경고·등장·종료, 이벤트 관리 |
| 16 | [16_caves_ruins.md](16_caves_ruins.md) | 동굴·유적, 지하 원정, 악몽 주기, 위험·보상, 재생성 |
| 17 | [17_adventure_death_progression.md](17_adventure_death_progression.md) | 모험 모드, 세계 이동, 사망·부활, 해금과 진행 손실 |
| 18 | [18_ui_controls_audio_visual.md](18_ui_controls_audio_visual.md) | UI, 액션 선택·취소, 지도, 시각·오디오 신호, 접근성 |
| 19 | [19_data_architecture_save.md](19_data_architecture_save.md) | 상태 소유권, 이벤트 처리, 재구성 데이터 모델, 저장·복원 |
| 20 | [20_balance_qa_reproduction.md](20_balance_qa_reproduction.md) | 자원 수지, 전투 총비용, 지표, 통합 QA, 재현 개발 순서 |
| 21 | [21_dlc_dst_comparison.md](21_dlc_dst_comparison.md) | DS·RoG·SW·Hamlet·DST 구분, 패치 경계, 확장 설계 관점 |
| 90 | [90_sources_and_verification.md](90_sources_and_verification.md) | 근거 수준, 출처 접근, 대표 확인 항목, 충돌·미확정 기록 |

총 23개 중 01~21은 본문, 00과 90은 목차 및 근거 부록이다. 파일명이 영어인 이유는 압축 해제·상대 링크·개발 도구 호환을 위한 것이며 내용은 한국어다.

## 4. 문서 표기 규칙

| 표기 | 읽는 방법 |
|---|---|
| **[자료 확인]** | 공개 자료에서 확인한 규칙. 공식 1차 자료인지 커뮤니티 자료인지 출처에서 구분 |
| **[설계 해석]** | 규칙이 플레이어의 선택과 경험에 미치는 영향에 대한 분석 |
| **[재구성 설계]** | 재현 구현을 위한 제안. 원작 내부 기획·클래스·코드라고 주장하지 않음 |
| **[검증 필요]** | 실측·버전 고정·추가 자료 없이는 확정하지 않은 항목 |
| **[공통]** | DS 원작과 RoG의 공통. SW·Hamlet·DST 전체 공통이라는 뜻은 아님 |
| **[DS] / [RoG]** | 각각 원작 전용 / RoG 적용 범위 |
| **[2023+]** | 2023 업데이트와 관련된 범위. 특정 미래 패치 전체를 확인했다는 뜻은 아님 |

QA 표의 사례들은 **실행 계획과 수용 기준**이다. 실제 게임에서 이미 통과시킨 테스트 결과로 읽지 않는다. 계산용 가정값은 실제 기본 수치와 구분했다.

## 5. 이 역기획에서 도출한 핵심 해석

### 5.1 생존 자원은 서로 바꿔 쓰는 예산이다

허기·체력·정신력·시간·슬롯은 독립적으로 채우면 끝나는 값이 아니다. 식량을 얻으러 가면 시간과 광원을 쓰고, 전투로 재료를 얻으면 회복과 장비 교체가 필요해진다. 실제 비용은 획득 순간보다 안전하게 돌아와 다음 행동을 할 수 있을 때 확정된다. [01](01_overview_core_loop.md), [03](03_survival_stats.md), [20](20_balance_qa_reproduction.md)

### 5.2 계절은 같은 경제를 다시 계산하게 만든다

장기 플레이에서는 기존 식량 루트·의복·작업 장소가 계속 유효하리라는 가정이 깨진다. 준비는 단순 비축량보다 다음 환경에서 무엇을 생산하고 얼마나 이동할 수 있는지의 문제다. [11](11_farming_animals_sustainability.md), [12](12_seasons_weather_temperature.md)

### 5.3 거점은 편의와 집중 위험을 함께 만든다

설비와 재고를 모으면 반복 동선이 줄지만 한 번의 사고가 여러 기능을 동시에 잃게 할 수 있다. 시설 간 거리·보급 분산·철수 경로는 장식 문제가 아니라 생존 경제의 일부다. [07](07_inventory_equipment_durability.md), [09](09_building_base_fire.md)

### 5.4 지식은 장비와 다른 형태의 성장이다

위협의 전조와 생태 관계, 레시피 조건, 귀환 경로를 이해하면 같은 재료로도 더 많은 선택을 할 수 있다. 수치 상승만으로 성장 시스템을 설명하면 탐험과 실패 학습이 빠진다. [04](04_characters.md), [10](10_food_cooking_spoilage.md), [14](14_creatures_ecology_ai.md)

### 5.5 시스템의 경계가 실제 재현 난도를 만든다

평상시 규칙보다 마지막 연료, 파손 직전 방어구, 부패와 조리의 동시 발생, 사망과 저장, 지역 이동 중 이벤트 같은 경계에서 일관성이 중요하다. 재구성안은 이런 상황의 처리 계약과 검증 항목을 명시한다. [13](13_combat_armor.md), [17](17_adventure_death_progression.md), [19](19_data_architecture_save.md)

위 다섯 항목은 작성자의 설계 분석이며 Klei가 공개한 내부 목표나 공식 KPI를 인용한 것은 아니다.

## 6. 권장 읽기 경로

| 목적 | 순서 |
|---|---|
| 전체 게임 구조 파악 | 01 → 02 → 03 → 12 → 17 |
| 생존 경제·거점 분석 | 06 → 07 → 08 → 09 → 10 → 11 → 20 |
| 액션·생태·탐험 분석 | 04 → 05 → 13 → 14 → 15 → 16 |
| 프로토타입 설계 | 01 → 19 → 02·03·06·07 → 20 |
| 구현 QA와 버전 검토 | 21 → 90 → 각 시스템의 예외·QA → 19·20 |

## 7. 대표 수치와 미확정 항목 찾기

- 시간 단위와 하루 구성: [02](02_time_day_night.md).
- Wilson 기준 상태값과 일반 허기 소비: [03](03_survival_stats.md).
- 캐릭터별 능력의 원작 적용 범위: [04](04_characters.md).
- 슬롯·중첩·내구도 구분: [07](07_inventory_equipment_durability.md).
- 대표 음식 효과와 냄비 판정: [10](10_food_cooking_spoilage.md).
- RoG 달력과 체온 경계: [12](12_seasons_weather_temperature.md).
- 원작 다중 방어구 흡수식과 적용 제외: [13](13_combat_armor.md).
- 불명확한 계절 길이·파손 처리·세부 확률: [20](20_balance_qa_reproduction.md), [90](90_sources_and_verification.md).

## 8. 사용 방법

ZIP의 폴더를 통째로 압축 해제하면 문서 간 상대 링크를 유지할 수 있다. Mermaid를 지원하는 Markdown 뷰어에서는 흐름도와 상태도를 렌더링할 수 있고, 지원하지 않는 뷰어에서도 표와 본문으로 규칙을 읽을 수 있다.

본 문서집은 전체 아이템·레시피·몬스터 수치를 덤프한 백과사전이 아니다. 대표 콘텐츠로 규칙을 설명하고, 구현에 필요한 구조와 검증 질문을 상세하게 작성한 시스템 설계 분석이다. 정확한 콘텐츠 수치표로 확대할 때는 제품·DLC·빌드별 데이터 테이블을 별도로 유지한다.
