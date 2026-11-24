# 동급생 2 (同級生2) 역기획서 목차

본 역기획서는 **《동급생 2》(elf, 1995 원작 PC-98 / DOS / Win95 / SS / PS 및 2024 리메이크)**의 공개 검증 자료를 바탕으로, PlayHub 웹 게임 엔진에서 재현 가능한 **데이터 기반 NPC 일정·동선·시간 진행·관계 이벤트 아키텍처**를 정의합니다.

## 증거 등급 표기 규칙

모든 문서와 JSON/CSV 데이터는 다음 4단계 증거 등급을 엄격히 구분합니다.

- `[확인]`: 공개된 원작/리메이크 정보, 위키백과, 검증된 공략 데이터베이스에서 교차 확인된 사실
- `[해석]`: 원작 플레이 구조 및 다수 공략 플로우차트에서 도출한 시스템 설계 해석
- `[재구성안]`: PlayHub 웹 엔진(TypeScript/JavaScript) 구현을 위해 제안하는 데이터 스키마·알고리즘
- `[검증 필요]`: 원작 바이너리/공식 매뉴얼 없이 공개 자료만으로 확정할 수 없거나 이식판 간 차이가 보고된 항목 (`DATA_GAPS.md`에 전수 기록)

## 문서 색인

| 번호 | 문서 | 핵심 내용 |
|---|---|---|
| 00 | [00_scope_evidence_and_glossary.md](./00_scope_evidence_and_glossary.md) | 분석 범위, 기종별 버전 차이(PC-98/Win95/SS/PS/2024 리메이크), 증거 기준, 용어집 |
| 01 | [01_core_loop_and_state_machine.md](./01_core_loop_and_state_machine.md) | 17일 마크로 루프, 1일 마이크로 루프, FSM 상태 전이도 |
| 02 | [02_time_calendar_and_npc_schedule_engine.md](./02_time_calendar_and_npc_schedule_engine.md) | 5분 양자 시계, 12/22~1/7 캘린더, NPC 3대 출현 패턴 및 스케줄 리졸버 |
| 03 | [03_town_map_and_navigation_graph.md](./03_town_map_and_navigation_graph.md) | 야소하치 마을·학원·키사라기 마을·동지온천 4존 41장소 그래프 및 이동 시간 비용 |
| 04 | [04_relationship_flags_and_event_chains.md](./04_relationship_flags_and_event_chains.md) | 60개 플래그·51개 이벤트 DAG, 12/28 동지온천 분기, 상호 배타·요코 우선권 트랩 |
| 05 | [05_characters_and_content_structure.md](./05_characters_and_content_structure.md) | 15인 히로인·주인공·6인 핵심 NPC 프로필, 루트 위상, 19종 엔딩 판정표 |
| 06 | [06_ui_ux_and_save_architecture.md](./06_ui_ux_and_save_architecture.md) | 클래식/이지(리메이크) UI 모드, 맵·시계·전화 HUD, 세이브 스냅샷 직렬화 |
| 07 | [07_data_schemas_and_engine_architecture.md](./07_data_schemas_and_engine_architecture.md) | TypeScript 인터페이스, 결정론적 시뮬레이션 엔진 계약, 데이터 로딩 파이프라인 |
| 08 | [08_verification_and_test_plan.md](./08_verification_and_test_plan.md) | 정합성 검증기, 15인 히로인 완주 시뮬레이션 테스트, 회귀 검증 매트릭스 |
| 부록 A | [SOURCE_REGISTER.md](./SOURCE_REGISTER.md) | 웹 리서치로 교차 검증한 출처 목록과 판본별 적용 범위 |
| 부록 B | [DATA_GAPS.md](./DATA_GAPS.md) | 미확인 내부 수치, 기종 간 상충 사항, 추후 리테일 바이너리/매뉴얼 검증 항목 |

## 복원 데이터셋 (`verified_data/`)

- `characters.json` / `characters.csv` (22명: 15인 히로인 + 주인공 + 6인 조연/라이벌)
- `locations.json` / `locations.csv` (4존 41장소 및 가중치 이동 그래프)
- `calendar_days.json` (12/22 ~ 1/7 17일 캘린더 + 7개 시간대 슬롯)
- `npc_schedules.json` (57개 데이터 기반 스케줄 슬롯, 15인 히로인 전원 커버)
- `events_and_flags.json` (60개 플래그, 51개 비순환 DAG 이벤트, 3개 상호 배타 그룹)
- `endings.json` (19종 엔딩 및 우선순위 판정 규칙)
- `validate_data.mjs` (스키마·CSV 일치·참조 무결성·5분 양자·DAG 비순환 자동 검증기)
