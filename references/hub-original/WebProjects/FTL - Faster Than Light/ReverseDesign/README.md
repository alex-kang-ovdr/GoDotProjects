# FTL: Faster Than Light — 시스템별 상세 역기획서

> **한국어 · PC판 · 본편 + Advanced Edition · 2026-11-13**  
> 구성: **Markdown 24개** — 목차 1개, 범위·시스템·설계 문서 22개, 출처·사실 점검 1개.

## 1. 문서의 목적

FTL의 함선 운영, 실시간 일시정지 전투, 승무원 관리, 항해와 이벤트, 런 단위 경제, 함선 해금을 시스템별로 분석했다. 각각의 문서는 **역할 → 입력과 출력 → 상태 → 세부 규칙 → 예외와 연동 → 설계 해석 → 재구현 제안 → 검증 사례 → 출처**를 중심으로 작성했다.

기본 게임과 Advanced Edition을 함께 다루고, AE 전용 요소를 구분했다. 함선 레이아웃, 무기군, 종족, 적 AI, 반군 기함, UI·UX, 데이터와 저장 구조까지 연결해 읽을 수 있다. 원작의 모든 콘텐츠를 복제한 데이터베이스가 아니라, 주요 시스템을 이해하고 별도 구현의 명세를 세우기 위한 문서다.

## 2. 읽을 때의 표기

| 표기 | 뜻 |
|---|---|
| **[확인]** | 공개 자료에서 확인한 게임 규칙. 전체 항목을 직접 실행 검증했다는 의미는 아님 |
| **[해석]** | 규칙의 연결에서 도출한 기획 의도와 플레이 의미 |
| **[재구성안]** | 같은 경험을 구현하기 위해 제안하는 데이터·상태·알고리즘 |
| **[검증 필요]** | 자료 충돌이나 빌드별 예외 때문에 추가 확인해야 할 항목 |

JSON, 의사코드, 내부 클래스·필드명은 원작 소스의 복원이 아닌 **재구성 예시**다. 실제 게임 실행 테스트 결과와 미실행 QA 계획을 구분한다.

## 3. 전체 파일 목록

### A. 전체 구조·항해·경제

| 번호 | 파일 | 주요 내용 |
|---|---|---|
| 00 | [00_scope_evidence_and_glossary.md](00_scope_evidence_and_glossary.md) | 분석 범위, 출처 수준, 사실·해석 구분, 공통 용어 |
| 01 | [01_core_loop_run_state.md](01_core_loop_run_state.md) | 순간·조우·런 루프, 상태 전이, 시간 축, 승패·결과 처리 |
| 02 | [02_sector_map_navigation_pursuit.md](02_sector_map_navigation_pursuit.md) | 섹터·비콘, 경로, 성운, 반군 추격, 연료 부족, 최종 섹터 |
| 03 | [03_events_quests_and_choices.md](03_events_quests_and_choices.md) | 조건 선택지, 확률 분기, 효과, 퀘스트 배치, 사건 저장 |
| 04 | [04_economy_shops_and_progression.md](04_economy_shops_and_progression.md) | 자원, 구매·판매·수리, 실제 도입 비용, 보상, 런 성장 |

### B. 함선·전력·전투 장비

| 번호 | 파일 | 주요 내용 |
|---|---|---|
| 05 | [05_ship_rooms_and_pathfinding.md](05_ship_rooms_and_pathfinding.md) | 방·타일·문, 이동과 점유, 작업 위치, 함선 구조의 전술 효과 |
| 06 | [06_power_systems_and_subsystems.md](06_power_systems_and_subsystems.md) | 반응로, 용량·전력·손상·이온 분리, 조타·엔진·서브시스템 |
| 07 | [07_combat_timing_and_damage.md](07_combat_timing_and_damage.md) | 일시정지, 충전·발사·도착 시점, 피해 채널, 방어, 종료 판정 |
| 08 | [08_weapons_shields_and_targeting.md](08_weapons_shields_and_targeting.md) | 7개 무기군, 표적·산포·빔, 일반/졸탄 실드, 대표 무기 수치 |
| 09 | [09_drones_and_augments.md](09_drones_and_augments.md) | 드론 설계도·실체·부품, 요격·수리·강습, 강화장치와 중첩 |

### C. 승무원·선내 전투·AE

| 번호 | 파일 | 주요 내용 |
|---|---|---|
| 10 | [10_crew_species_and_training.md](10_crew_species_and_training.md) | 8종족, 체력·능력, 6개 숙련, 배치·성장·손실 |
| 11 | [11_boarding_and_personal_combat.md](11_boarding_and_personal_combat.md) | 텔레포터, 강습, 방 내 전투, 문·퇴각·의료·귀환 |
| 12 | [12_atmosphere_fire_breach_repair.md](12_atmosphere_fire_breach_repair.md) | 방별 산소, 화재, 균열, 작업과 복구 순서, 환경 연쇄 |
| 13 | [13_advanced_edition_systems.md](13_advanced_edition_systems.md) | 해킹, 정신 지배, 클론실, 보조 배터리, 은폐와의 조합 |

### D. 함선 콘텐츠·적·보스

| 번호 | 파일 | 주요 내용 |
|---|---|---|
| 14 | [14_ships_loadouts_and_unlocks.md](14_ships_loadouts_and_unlocks.md) | 10개 함선 계열·28개 레이아웃, 시작 구성과 A/B/C 해금 |
| 15 | [15_enemy_generation_and_ai.md](15_enemy_generation_and_ai.md) | 적 프리셋·생성, 공격·수리·강습, 자동선, 도주·항복 |
| 16 | [16_rebel_flagship.md](16_rebel_flagship.md) | 최종 지도, 기함 3단계, 지속 상태, 난이도 차이, 자동 AI 전환 |

### E. UX·밸런스·구현 설계·QA

| 번호 | 파일 | 주요 내용 |
|---|---|---|
| 17 | [17_ui_ux_input_and_feedback.md](17_ui_ux_input_and_feedback.md) | 정보 구조, 정지·명령, 선택·표적, 모달 입력, 경고·피드백 |
| 18 | [18_balance_difficulty_and_rng.md](18_balance_difficulty_and_rng.md) | 난이도, 시작 자원·점수, 성장 문턱, 무작위성과 분석 지표 |
| 19 | [19_data_architecture_and_save.md](19_data_architecture_and_save.md) | 프로필·런·표현 분리, 데이터 계약, 처리 순서, 저장·복원 |
| 20 | [20_content_authoring_and_tools.md](20_content_authoring_and_tools.md) | 이벤트·장비·함선 스키마, 제작 도구, 검증·재생·현지화 |
| 21 | [21_qa_and_acceptance_tests.md](21_qa_and_acceptance_tests.md) | 통합 QA 64개: 확인 규칙 16, 재구성 사양 36, 관찰 필요 12 |
| 90 | [90_sources_and_fact_check.md](90_sources_and_fact_check.md) | 통합 출처, 핵심 사실 대조, 충돌·미확인 항목, 문서 검증 |

## 4. 핵심 설계 관점

### 전력은 동시에 할 수 있는 일을 정한다

**[해석]** 전력 배분은 무기·방어·회복의 동시성에 제한을 둔다. 설치한 시스템 수준, 실제 공급 전력, 손상·이온으로 사용할 수 없는 부분을 나누어야 이 선택이 재현된다.

### 방 배치가 피해 대응 비용을 바꾼다

**[해석]** 같은 시설과 인원이라도 거리·문·에어록·격리 가능성이 다르면 수리 시간과 생존성이 달라진다. 함선 평면도는 장식이 아니라 게임 데이터다.

### 공격은 순서와 시간의 조합이다

**[해석]** 실드를 먼저 제거하고 빔을 도달시키거나, 적 무기를 마비시켜 다음 발사를 늦추는 식으로 가치를 만든다. 피해량 합계만으로 무기를 비교하기 어렵다.

### 사건은 보유 능력을 다른 종류의 선택으로 바꾼다

**[해석]** 종족·설비·장비는 전투와 이벤트에서 서로 다른 가치를 가진다. 조건 선택지를 열어 주는 기능과 좋은 결과를 보장하는 기능은 구분해야 한다.

### 항해는 성장할 시간을 제한한다

**[해석]** 한 번 더 방문하면 성장할 가능성이 생기지만 연료와 추격 여유를 소비한다. 그래서 전투 후의 스크랩, 선체, 소모품과 위치를 함께 판단하게 된다.

## 5. 용도별 읽는 순서

| 목적 | 추천 순서 |
|---|---|
| 전체 게임의 구조 이해 | 00 → 01 → 02 → 03 → 04 → 18 |
| 전투 프로토타입의 명세 | 05 → 06 → 07 → 08 → 10 → 11 → 12 → 09 → 13 |
| 함선·적 콘텐츠 제작 | 14 → 15 → 16 → 20 |
| UI와 입력 구현 | 01 → 07 → 17 → 19 |
| 저장·데이터·자동 검증 | 19 → 20 → 21 → 90 |

실제 재구현을 시작할 때는 특정 빌드와 AE 옵션을 고정한 뒤, 90번의 미확인 항목부터 실행 검증하는 편이 좋다. 21번의 테스트는 **계획**이며 통과 결과표가 아니다.

## 6. 자료와 완성 범위

공식 제품 설명·개발자 기록을 우선 확인하고, 세부 규칙은 커뮤니티 메커니즘 문서로 보완했다. 사용자 제공 나무위키 링크는 직접 열리지 않아 본문 근거로 사용하지 않았다. 일부 위키도 검색 색인에서 제공된 본문으로 확인했다.

문서에는 주요 상태·상호작용·대표 수치와 예외가 포함된다. 전체 무기 가격·모든 이벤트의 원문과 확률·모든 적의 원본 생성 테이블·프레임 단위 내부 구현은 확정하지 않았다. 그런 항목을 임의의 정확한 값으로 채우지 않고 추가 검증 대상으로 남겼다.

모든 파일은 UTF-8 Markdown이며 상대 링크로 연결되어 있다. ZIP을 풀어 같은 폴더 구조를 유지하면 문서 간 이동이 가능하다. Mermaid 도식은 이를 지원하는 Markdown 뷰어에서 렌더링된다.
