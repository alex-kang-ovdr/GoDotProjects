# YU-NO 역기획서 (Reverse Design) 인덱스

본 디렉터리는 **『이 세상 끝에서 사랑을 노래하는 소녀 YU-NO (この世の果てで恋を唄う少女YU-NO)』**의 원작 시스템과 서사 구조를 PlayHub 구현 관점에서 완전히 해부·정규화한 역기획서 및 원작 복원 데이터(SSOT)입니다.

## 1. 핵심 설계 기둥
1. **A.D.M.S. 병렬 분기 그래프**: 세이브/로드 자체를 리플렉터 디바이스와 보옥(宝玉)이라는 유한 자원 기반의 인게임 그래프 탐색 메커니즘으로 치환한 구조 `[확인]`
2. **로컬/글로벌 플래그 추적**: 보옥 로드 시 장면·로컬 플래그는 과거 스냅샷으로 되돌리되, 인벤토리 소지·소비 상태·보옥 수집 현황·맵 탐색 기록·루트 클리어 메타 플래그는 현재 시점에서 과거로 역계승하는 비대칭 상태 머신 `[확인]`
3. **루트 간 정보·아이템 계승**: `아유미(블루 카드) → 카오리(초념석) → 미오(유적 공명) / 칸나(구명 및 서재의 열쇠) → 1일차 초기 시점(서재 괘종시계 6→3 · 보옥 6) → 켄노미사키 수렴 → 데라 그란트(이세계편)`으로 이어지는 다중 시간축 의존 그래프 `[확인]`

## 2. 문서 목차
| 번호 | 파일 | 핵심 내용 |
|---|---|---|
| 00 | [00_scope_evidence_and_glossary.md](00_scope_evidence_and_glossary.md) | 분석 범위, 버전별 스펙 비교(PC-98/SS/Win/2017), 증거 태그 규칙, 용어집 |
| 01 | [01_core_loop_and_state_machine.md](01_core_loop_and_state_machine.md) | 2부제 코어 루프(현세편 A.D.M.S. 루프 vs 이세계편 선형 탐색 루프) 및 FSM |
| 02 | [02_adms_parallel_branching_graph.md](02_adms_parallel_branching_graph.md) | A.D.M.S. 노드/엣지 타입, 보옥 8개/10개 배치·회수·점멸 예고 규칙 |
| 03 | [03_flag_tracking_and_cross_route_inheritance.md](03_flag_tracking_and_cross_route_inheritance.md) | 글로벌 vs 로컬 상태 분할표, 루트 간 계승 매트릭스, 소비 역설 및 순서 함정 분석 |
| 04 | [04_modern_to_isekai_convergence_and_routes.md](04_modern_to_isekai_convergence_and_routes.md) | 현세편 6개 히로인 루트, 서재·삼각산 수렴 조건, 데라 그란트 이세계편 진행 구조 |
| 05 | [05_characters_and_content_structure.md](05_characters_and_content_structure.md) | 정규 등장인물 20명, 사카이마치 19곳 + 데라 그란트 8곳, 9개 루트·9개 엔딩 |
| 06 | [06_ui_ux_and_save_architecture.md](06_ui_ux_and_save_architecture.md) | 포인트 앤 클릭 ADV HUD, A.D.M.S. 트리 UI, 보옥 슬롯 및 이중 세이브(시스템 vs 보옥) 설계 |
| 07 | [07_data_schemas_and_engine_architecture.md](07_data_schemas_and_engine_architecture.md) | TypeScript 인터페이스, 결정론적 그래프·플래그 평가기, PlayHub 웹/Godot 런타임 구조 |
| 08 | [08_verification_and_test_plan.md](08_verification_and_test_plan.md) | 데이터 검증기, 고정점 도달성·순서 독립성·소용돌이/패러독스 회귀 테스트 계획 |
| — | [SOURCE_REGISTER.md](SOURCE_REGISTER.md) | 교차 검증 출처 목록 |
| — | [DATA_GAPS.md](DATA_GAPS.md) | 원작 1차 스크립트 미확인 항목 및 버전 차이 갭 목록 |

## 3. 원작 복원 데이터(`verified_data/`) 현황
- `characters.json` / `characters.csv`: **20명** (현세편 12명, 이세계편 8명; 교차 등장 인물 5명 포함)
- `locations.json` / `locations.csv`: **27개소** (사카이마치 19개소 + 데라 그란트 8개소)
- `routes_and_endings.json`: **9개 루트 / 9개 엔딩** (히로인 엔드 6, 소용돌이/배드엔드 대표 2, 트루 엔드 1)
- `items_and_jewels.json`: **리플렉터 디바이스 1종, 보옥 10슬롯(PC-98 2+6=8, SS/리메이크 4+6=10), 핵심 아이템 17종(시간축 계승 14, 로컬 귀속 3)**
- `flags_and_inheritance.json`: **글로벌 플래그 11종, 로컬 플래그 12종, 루트 간 교차 계승 5개 경로**
- `adms_nodes.json`: **35개 정규화 A.D.M.S. 노드** (루트→현세편 분기→교차 관문→수렴→이세계편→트루 엔딩)
- `validate_data.mjs`: 자동화 무결성·도달성·고정점 만족성 검증 스크립트 (0 errors 통과)
