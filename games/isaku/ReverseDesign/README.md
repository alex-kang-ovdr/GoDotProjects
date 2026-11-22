# 유작 (遺作 / Isaku) 역기획서 인덱스

> **엔진 설계 핵심 명제**: *유작*은 단순 텍스트 분기 비주얼 노벨이 아니라, **공간 그래프(Room Graph) + 도구·열쇠 인벤토리(Item Inventory) + 다층 백트래킹 퍼즐(Puzzle DAG) + 시간·행동 연동 사건 스케줄러(Incident Scheduler)**가 단일 상태 저장소 위에서 실시간 상호작용하는 **폐쇄 공간 탐색 어드벤처 엔진**이다.

## 문서 목차

| 번호 | 문서 | 핵심 내용 |
|---|---|---|
| 00 | [00_scope_evidence_and_glossary.md](./00_scope_evidence_and_glossary.md) | 분석 대상(PC-98 1995 / Win 리뉴얼 1999), 확증 태그 기준, 오기 교정, 용어집 |
| 01 | [01_core_loop_and_state_machine.md](./01_core_loop_and_state_machine.md) | 거시/미시 루프, 탐색↔퍼즐↔사건 상태 전이, 4대 하위 엔진 결합 구조 |
| 02 | [02_room_graph_and_spatial_exploration.md](./02_room_graph_and_spatial_exploration.md) | 5F→1F 하향 개방 + 시계탑 + 보건실 탈출구 29개 방 그래프와 핫스팟 변이 |
| 03 | [03_item_inventory_and_puzzle_engine.md](./03_item_inventory_and_puzzle_engine.md) | 23종 아이템, 16종 퍼즐 의존성 DAG, 백트래킹 루프, 원작 하드락→재구현 소프트락 차단 |
| 04 | [04_incident_scheduler_and_survival_branches.md](./04_incident_scheduler_and_survival_branches.md) | 행동 틱 시계, 8개 사건 트리거·구출 윈도우·연쇄 전파, 5종 엔딩 평가 우선순위 |
| 05 | [05_characters_and_content_structure.md](./05_characters_and_content_structure.md) | 11명 정본 캐스트, 역할·동선·생존 경로, 1년 전 사건과 5종 결말 구조 |
| 06 | [06_ui_ux_and_save_architecture.md](./06_ui_ux_and_save_architecture.md) | 커맨드/핫스팟 ADV HUD, 층별 미니맵·인벤토리, 분기 복구용 다중 슬롯 스냅샷 세이브 |
| 07 | [07_data_schemas_and_engine_architecture.md](./07_data_schemas_and_engine_architecture.md) | TypeScript 인터페이스, 데이터 주도 리듀서 엔진, 범용 탈출 ADV 재사용 아키텍처 |
| 08 | [08_verification_and_test_plan.md](./08_verification_and_test_plan.md) | 자동 검증(`validate_data.mjs`), 정방향 완주 증명, 엔딩 매트릭스 테스트 케이스 |
| Ref | [SOURCE_REGISTER.md](./SOURCE_REGISTER.md) | 일본어·한국어·영어 위키 및 정본 공략 출처 목록(`SRC-01`~`SRC-07`) |
| Ref | [DATA_GAPS.md](./DATA_GAPS.md) | 미확인 내부 수치(정확한 틱 상수, 비핵심 빈 교실 수, 세부 대사 선택지) 및 보강 계획 |

## 복원 데이터셋 (`verified_data/`)

| 파일 | 레코드 수 | 역할 |
|---|---:|---|
| [characters.json](./verified_data/characters.json) / [characters.csv](./verified_data/characters.csv) | 11 | 정본 등장인물 10명 + 1년 전 과거 사건 인물 1명 |
| [rooms.json](./verified_data/rooms.json) / [rooms.csv](./verified_data/rooms.csv) | 29 | 5F~1F + 시계탑 + 외부 탈출구 방 그래프(핫스팟 45개) |
| [items.json](./verified_data/items.json) / [items.csv](./verified_data/items.csv) | 23 | 열쇠·공구·단서·조합 재료·사건 지표 아이템 |
| [puzzles.json](./verified_data/puzzles.json) | 16 | 비밀번호·윤활 해정·도구 분해·연소·격리·탈출 퍼즐 DAG |
| [incidents_and_endings.json](./verified_data/incidents_and_endings.json) | 8 사건 / 5 엔딩 | 위기 윈도우, 연쇄 피해 규칙, 해피/노멀/배드 엔딩 조건 |
| [validate_data.mjs](./verified_data/validate_data.mjs) | — | JSON/CSV 일치, 참조 무결성, 그래프 연결성, DAG 비순환, 정방향 완주 검증기 |
