# 유작 (遺作 / Isaku) — 역기획서 및 원작 데이터 복원

> **핵심 아키텍처 축**: **방(Room) · 아이템(Item) · 퍼즐(Puzzle) · 사건(Incident)을 결합하는 탐색 어드벤처 엔진**

## 개요

본 디렉터리는 엘프(elf)가 1995년 8월 25일 PC-9801용으로 출시하고 1999년 Windows 리뉴얼판으로 이식한 폐쇄 공간 탈출 어드벤처 게임 **『유작(遺作 / Isaku)』**의 역기획서와 검증된 원작 데이터를 담고 있습니다.

- **배경 설정**: 여름방학 중 정체불명의 호출 편지에 이끌려 **오우란 학원(桜蘭学園) 구교사 5층 음악실**에 모인 학생·교사 9명이 관리인 **이토 유작(伊頭 遺作)**의 함정에 의해 폐쇄된 5층 구교사에 감금되고, 5층 → 4층 → 3층 → 2층 → 1층 → 시계탑 → 1층 보건실 비밀 탈출구로 이어지는 탐색·퍼즐·구출을 거쳐 전원 생환을 목표로 하는 밀실 서바이벌 ADV입니다. `[확인]`
- **콘텐츠 안전 원칙**: 본 역기획서와 복원 데이터는 원작의 성인향·폭력적 묘사를 일절 수록하지 않으며, 모든 위기 이벤트를 게임 엔진의 상태 플래그(`safe`, `at_risk`, `rescued`, `compromised`)와 분기 판정 로직으로만 추상화합니다.

## 디렉터리 구성

- [ReverseDesign/README.md](./ReverseDesign/README.md) — 역기획서 전체 인덱스 및 문서 맵
- [ReverseDesign/00_scope_evidence_and_glossary.md](./ReverseDesign/00_scope_evidence_and_glossary.md) — 범위, 확증 등급 체계, 판본 차이, 용어집
- [ReverseDesign/01_core_loop_and_state_machine.md](./ReverseDesign/01_core_loop_and_state_machine.md) — 핵심 루프 및 4계층 결합 상태 머신
- [ReverseDesign/02_room_graph_and_spatial_exploration.md](./ReverseDesign/02_room_graph_and_spatial_exploration.md) — 5개 층 + 시계탑 + 탈출구 방 그래프(29개 방, 45개 핫스팟)
- [ReverseDesign/03_item_inventory_and_puzzle_engine.md](./ReverseDesign/03_item_inventory_and_puzzle_engine.md) — 23종 아이템 카탈로그, 16종 퍼즐 DAG, 소프트락 방지 규칙
- [ReverseDesign/04_incident_scheduler_and_survival_branches.md](./ReverseDesign/04_incident_scheduler_and_survival_branches.md) — 행동 틱 기반 사건 스케줄러, 8종 위기 윈도우, 5종 엔딩 판정기
- [ReverseDesign/05_characters_and_content_structure.md](./ReverseDesign/05_characters_and_content_structure.md) — 정본 등장인물 11명(활성 10명 + 과거 사건 1명) 및 서사·엔딩 구조
- [ReverseDesign/06_ui_ux_and_save_architecture.md](./ReverseDesign/06_ui_ux_and_save_architecture.md) — 커맨드/커서 ADV 인터페이스, 맵·인벤토리 UX, 스냅샷 세이브 구조
- [ReverseDesign/07_data_schemas_and_engine_architecture.md](./ReverseDesign/07_data_schemas_and_engine_architecture.md) — TypeScript/JSON 스키마 및 재사용 가능한 탐색 어드벤처 엔진 설계
- [ReverseDesign/08_verification_and_test_plan.md](./ReverseDesign/08_verification_and_test_plan.md) — 데이터 무결성·DAG 비순환·정방향 완주·분기 회귀 테스트 계획
- [ReverseDesign/SOURCE_REGISTER.md](./ReverseDesign/SOURCE_REGISTER.md) — 출처 등록부
- [ReverseDesign/DATA_GAPS.md](./ReverseDesign/DATA_GAPS.md) — 미확정 수치·판본 차이·추가 검증 과제
- [ReverseDesign/verified_data/](./ReverseDesign/verified_data/) — JSON/CSV 원작 복원 데이터 및 자동 검증 스크립트(`validate_data.mjs`)

## 플레이 가능한 웹 프로토타입 실행

외부 CDN 없이 `file://` 직접 열기 및 로컬 HTTP 서버 모두에서 동작합니다.

- **직접 실행**: `games/isaku/Web/index.html`을 브라우저로 바로 열기
- **데이터 번들 동기화** (`ReverseDesign/verified_data/*.json` → `Web/data/game-data.js`):
  ```powershell
  node games/isaku/Source/sync-data.mjs
  ```

### 주요 구현 기능
- **순수 결정론적 탐색 어드벤처 엔진 (`Web/engine.js`)**: 11명 정본 캐스트, 29개 방(6F 시계탑 ~ 0F 외부), 45개 핫스팟, 23종 아이템, 16개 퍼즐 DAG(금고 `3878`, 윤활 소프트락 방지, 아이템 조합, 5F 백트래킹, 2F 난로 연소, 3F 바 록 역이용), 8종 시간·트리거 기반 구출 사건 및 연쇄 가속, 5종 엔딩 판정기.
- **인터랙티브 UI (`Web/index.html`, `Web/app.js`, `Web/styles.css`)**: 층별 클릭 이동 SVG 평면도(`6F`~`0F`), 룸 탐색 SVG 스테이지 및 핫스팟 마커, 금고 키패드 모달(`3878`), 인벤토리 사용/조합 작업대, 생존자 상태 모니터·위기 경보 배너, `localStorage` 다중 슬롯 세이브/로드 + 자동 체크포인트 + 5종 엔딩 도감.

## 데이터 검증 및 자동 테스트 실행

```powershell
# 1. 원작 복원 데이터 번들 생성
node games/isaku/Source/sync-data.mjs

# 2. 데이터 무결성·DAG 비순환·정방향 완주 검증
node games/isaku/ReverseDesign/verified_data/validate_data.mjs

# 3. 헤드리스 엔진 자동 회귀 테스트 (전 퍼즐·구출·5종 엔딩·세이브/로드)
node --test games/isaku/Source/engine.test.mjs
```

정상 출력 예시:
`[isaku:validate] OK — characters=11, rooms=29, hotspots=45, items=23, puzzles=16, incidents=8, endings=5, DAG=acyclic, forwardSim=goal_reached, errors=0`
