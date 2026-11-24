# Twin Sight Paradox 역기획서 (Reverse Design) 인덱스

> **설계 핵심 명제**: *《Twin Sight Paradox》는 두 주인공이 서로 다른 진실의 절반을 쥔 채, 공유된 단일 시계 위에서 교차 인과를 일으키며 최종 수렴점으로 진입하는 **비대칭 이중 관점 추리 엔진**이다.*

## 1. 문서 목차 및 권장 열람 순서

| 번호 | 문서 | 핵심 내용 | 비고 |
| --- | --- | --- | --- |
| 00 | [00_scope_evidence_and_glossary.md](file:///d:/Github/GoDotProjects-worktrees/PlayHub-JavaGames-twin-sight-paradox/games/twin-sight-paradox/ReverseDesign/00_scope_evidence_and_glossary.md) | 범위, 5개 판본 비교, 증거 등급 규칙, 인명 보정 및 용어집 | 필독 기준서 |
| 01 | [01_core_loop_and_state_machine.md](file:///d:/Github/GoDotProjects-worktrees/PlayHub-JavaGames-twin-sight-paradox/games/twin-sight-paradox/ReverseDesign/01_core_loop_and_state_machine.md) | 커맨드형 ADV 코어 루프, 상태 전이, 즉사/게임오버 구조 | 기본 루프 |
| 02 | [02_multi_sight_and_sync_barrier_engine.md](file:///d:/Github/GoDotProjects-worktrees/PlayHub-JavaGames-twin-sight-paradox/games/twin-sight-paradox/ReverseDesign/02_multi_sight_and_sync_barrier_engine.md) | 멀티 사이트 전환 규칙, 동기화 장벽 8종, DBMS 데드락 기믹, 데드락 방지 증명 | **핵심 기둥 ①** |
| 03 | [03_information_asymmetry_and_knowledge_model.md](file:///d:/Github/GoDotProjects-worktrees/PlayHub-JavaGames-twin-sight-paradox/games/twin-sight-paradox/ReverseDesign/03_information_asymmetry_and_knowledge_model.md) | 이중 인벤토리, 지식/단서 그래프, NPC 별칭 비대칭, 극적 아이러니 패턴 | **핵심 기둥 ②** |
| 04 | [04_parallel_timeline_and_scenario_convergence.md](file:///d:/Github/GoDotProjects-worktrees/PlayHub-JavaGames-twin-sight-paradox/games/twin-sight-paradox/ReverseDesign/04_parallel_timeline_and_scenario_convergence.md) | 12월 2일~8일 병렬 타임라인(16개 핵심 씬), 교차 인과 매트릭스, 트리스탄호 수렴 | 시나리오 골격 |
| 05 | [05_characters_and_content_structure.md](file:///d:/Github/GoDotProjects-worktrees/PlayHub-JavaGames-twin-sight-paradox/games/twin-sight-paradox/ReverseDesign/05_characters_and_content_structure.md) | 정규 인물 18인, 5대 진영, 14개 로케이션, 단일 진엔딩·범인 입력 구조 | 콘텐츠 카탈로그 |
| 06 | [06_ui_ux_and_save_architecture.md](file:///d:/Github/GoDotProjects-worktrees/PlayHub-JavaGames-twin-sight-paradox/games/twin-sight-paradox/ReverseDesign/06_ui_ux_and_save_architecture.md) | 6대 커맨드 UI, Sight Change HUD, 이중 스냅샷 세이브/로드 규격 | 인터페이스·저장 |
| 07 | [07_data_schemas_and_engine_architecture.md](file:///d:/Github/GoDotProjects-worktrees/PlayHub-JavaGames-twin-sight-paradox/games/twin-sight-paradox/ReverseDesign/07_data_schemas_and_engine_architecture.md) | TypeScript 도메인 모델, 결정론적 Multi-Sight 엔진 API 및 이벤트 버스 | 구현 설계도 |
| 08 | [08_verification_and_test_plan.md](file:///d:/Github/GoDotProjects-worktrees/PlayHub-JavaGames-twin-sight-paradox/games/twin-sight-paradox/ReverseDesign/08_verification_and_test_plan.md) | 데이터 검증, 그래프 위상 정렬, 교차 플래그 테스트, 플레이스루 QA 시나리오 | 품질 보증 |
| — | [SOURCE_REGISTER.md](file:///d:/Github/GoDotProjects-worktrees/PlayHub-JavaGames-twin-sight-paradox/games/twin-sight-paradox/ReverseDesign/SOURCE_REGISTER.md) | 웹 검증 출처 목록 및 교차 검증 결과 | 출처 대장 |
| — | [DATA_GAPS.md](file:///d:/Github/GoDotProjects-worktrees/PlayHub-JavaGames-twin-sight-paradox/games/twin-sight-paradox/ReverseDesign/DATA_GAPS.md) | 원작 미확인 세부 수치, 판본 차이, 인명 혼동 정정 기록 | 공백·리스크 |

## 2. 복원 데이터 (`verified_data/`)

| 파일 | 레코드 수 | 설명 |
| --- | ---: | --- |
| `characters.json` / `characters.csv` | 18 | 정규 일본어/한국어/영어 인명, 소속, 코지로·마리나 각각이 인지하는 신분 비대칭 |
| `locations.json` / `locations.csv` | 14 | 14개 핵심 무대 및 접근 가능 주인공(`kojiro` / `marina` / `both`) |
| `timeline_chapters.json` | 16 | 12월 2일(Day 0)~12월 8일(Convergence) 코지로 7씬 + 마리나 8씬 + 합류 1씬 |
| `sync_barriers.json` | 8 | 교차 주인공 동기화 장벽 및 해제 이벤트·교차 인과 효과 |
| `clues_and_asymmetry.json` | 12 | 양측의 인지 의미(`perceived_meaning`)와 진실(`true_meaning`)이 갈리는 핵심 단서 |
| `items_and_endings.json` | 12 아이템 + 4 결말/종료 상태 | 주인공별 핵심 아이템과 단일 진엔딩·범인 입력·게임오버 조건 |
| `validate_data.mjs` | — | JSON/CSV 일치성, 참조 무결성, 동기화 장벽 DAG/도달성 자동 검증기 |

## 3. 증거 표기 규칙 요약

- **`[확인]`**: 복수의 원작 자료(일본어 Wikipedia, 일본 공략 차트, 리마스터 공식 소개 등)로 교차 검증된 사실.
- **`[해석]`**: 확인된 원작 사실로부터 게임 디자인·시스템 구조적 의미를 도출한 분석.
- **`[재구성안]`**: 원작 소스가 공개되지 않아 PlayHub 재현 엔진을 위해 정형화·설계한 스키마, 상태 머신, 수치 모델.
- **`[검증 필요]`**: 세부 대사 횟수, 특정 판본의 예외 분기 등 원작 ROM/스크립트 직접 덤프 없이는 단정할 수 없는 항목(`DATA_GAPS.md`에 동시 기록).
