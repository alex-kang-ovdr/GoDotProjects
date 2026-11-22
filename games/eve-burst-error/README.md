# EVE burst error — 역기획서 및 원작 데이터 복원 패키지

> **핵심 아키텍처 축**: **복수 주인공의 관점 전환(Multi-Sight)과 정보 비대칭(Information Asymmetry)**

## 1. 프로젝트 개요

본 디렉터리는 C's ware(シーズウェア, 시나리오·기획: 칸노 히로유키 / 원화: 타지마 나오 / 음악: 우메모토 류)가 1995년 PC-9801로 최초 발매하고, 1997년 세가 새턴(SEGA SATURN), Windows 95, 2003년 PS2(`PLUS`), 2016년 이후 리마스터(`R`)로 이어진 추리 서스펜스 어드벤처 **《EVE burst error》**의 **역기획서(Reverse Design)** 및 **검증된 원작 데이터(Verified Data)**를 수록합니다.

모든 문서와 데이터는 원작의 성인용 묘사를 배제하고 **멀티 사이트(Multi-Sight) 시점 전환 시스템, 교차 시간축 동기화 장벽(Sync Barrier), 주인공 간 정보 비대칭 모델, 그리고 단일 진실로 수렴하는 미스터리 구조**에 초점을 맞추어 PlayHub/JavaGames 재현 엔진 설계를 위한 SSOT(Single Source of Truth)로 작성되었습니다.

## 2. 디렉터리 구조

- [ReverseDesign/README.md](file:///d:/Github/GoDotProjects-worktrees/PlayHub-JavaGames-eve-burst-error/games/eve-burst-error/ReverseDesign/README.md): 역기획서 전체 목차 및 읽기 순서
- [ReverseDesign/00_scope_evidence_and_glossary.md](file:///d:/Github/GoDotProjects-worktrees/PlayHub-JavaGames-eve-burst-error/games/eve-burst-error/ReverseDesign/00_scope_evidence_and_glossary.md): 분석 범위, 판본 비교, 증거 등급(`[확인]`/`[해석]`/`[재구성안]`/`[검증 필요]`), 용어집
- [ReverseDesign/01_core_loop_and_state_machine.md](file:///d:/Github/GoDotProjects-worktrees/PlayHub-JavaGames-eve-burst-error/games/eve-burst-error/ReverseDesign/01_core_loop_and_state_machine.md): 커맨드형 ADV 코어 루프 및 전체 게임 상태 머신
- [ReverseDesign/02_multi_sight_and_sync_barrier_engine.md](file:///d:/Github/GoDotProjects-worktrees/PlayHub-JavaGames-eve-burst-error/games/eve-burst-error/ReverseDesign/02_multi_sight_and_sync_barrier_engine.md): 멀티 사이트 전환 규칙, 동기화 장벽(Sync Barrier), 데드락 방지 알고리즘
- [ReverseDesign/03_information_asymmetry_and_knowledge_model.md](file:///d:/Github/GoDotProjects-worktrees/PlayHub-JavaGames-eve-burst-error/games/eve-burst-error/ReverseDesign/03_information_asymmetry_and_knowledge_model.md): 이중 인벤토리, 지식/단서 그래프, NPC 별칭·인지 비대칭, 극적 아이러니 설계
- [ReverseDesign/04_parallel_timeline_and_scenario_convergence.md](file:///d:/Github/GoDotProjects-worktrees/PlayHub-JavaGames-eve-burst-error/games/eve-burst-error/ReverseDesign/04_parallel_timeline_and_scenario_convergence.md): 12월 2일~8일 코지로·마리나 병렬 타임라인, 교차 인과 매트릭스, 트리스탄호 합류
- [ReverseDesign/05_characters_and_content_structure.md](file:///d:/Github/GoDotProjects-worktrees/PlayHub-JavaGames-eve-burst-error/games/eve-burst-error/ReverseDesign/05_characters_and_content_structure.md): 정규 등장인물 18인, 진영, 무대 14곳, 챕터 및 엔딩 구조
- [ReverseDesign/06_ui_ux_and_save_architecture.md](file:///d:/Github/GoDotProjects-worktrees/PlayHub-JavaGames-eve-burst-error/games/eve-burst-error/ReverseDesign/06_ui_ux_and_save_architecture.md): 커맨드 ADV UI, Sight Change HUD, 이중 상태 세이브 직렬화
- [ReverseDesign/07_data_schemas_and_engine_architecture.md](file:///d:/Github/GoDotProjects-worktrees/PlayHub-JavaGames-eve-burst-error/games/eve-burst-error/ReverseDesign/07_data_schemas_and_engine_architecture.md): PlayHub용 TypeScript/JSON 스키마 및 결정론적 멀티 사이트 엔진 아키텍처
- [ReverseDesign/08_verification_and_test_plan.md](file:///d:/Github/GoDotProjects-worktrees/PlayHub-JavaGames-eve-burst-error/games/eve-burst-error/ReverseDesign/08_verification_and_test_plan.md): 데이터·그래프·교차 인과·범인 입력 검증 및 QA 테스트 계획
- [ReverseDesign/SOURCE_REGISTER.md](file:///d:/Github/GoDotProjects-worktrees/PlayHub-JavaGames-eve-burst-error/games/eve-burst-error/ReverseDesign/SOURCE_REGISTER.md): 원작 검증 출처 대장
- [ReverseDesign/DATA_GAPS.md](file:///d:/Github/GoDotProjects-worktrees/PlayHub-JavaGames-eve-burst-error/games/eve-burst-error/ReverseDesign/DATA_GAPS.md): 미확인 항목, 판본 차이, 인명 보정 기록
- `ReverseDesign/verified_data/`: 복원된 원작 정형 데이터(JSON/CSV) 및 자동 검증기(`validate_data.mjs`)

## 3. 데이터 무결성 검증 실행

```powershell
node games/eve-burst-error/ReverseDesign/verified_data/validate_data.mjs
```

- 검증 범위: JSON/CSV 파싱 및 상호 일치, 참조 무결성(인물·장소·씬·단서·아이템 ID), 코지로/마리나 교차 동기화 장벽 그래프의 비순환성(DAG) 및 데드락 부재(초기 씬 `M_D0_01` → 최종 합류 씬 `C_D6_01` 100% 도달 가능성).
