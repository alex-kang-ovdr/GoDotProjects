# 귀축왕 란스 (鬼畜王ランス / Kichikuou Rance)

> **핵심 아키텍처 축**: **전략 시뮬레이션(SLG)과 캐릭터별 시나리오(Character Scenario Graph)의 통합**
>
> 원작: AliceSoft, 1996년 (Windows 95) · 지역제압형 전략 시뮬레이션 RPG

---

## 프로젝트 개요

이 디렉터리는 PlayHub 멀티게임 플랫폼에서 **귀축왕 란스(1996)**의 핵심 시스템 구조를 복원·재설계하기 위한 **역기획서(Reverse Design)** 및 **검증 데이터셋(Verified Data)**을 보관한다.

본 작품은 이후 『전국 란스』·『대악사』 등으로 이어진 AliceSoft 지역제압형 SLG의 원형이자, 단순한 영토 점령 시뮬레이션이 아니라 **주간 슬롯 기반 전략 턴 루프**, **최소 병수 우선 행동순의 4부대 전열/후열 군단전**, 그리고 **정복 순서·달력 기한·전역 위기 타이머가 캐릭터 개별 서사(66인 × 2 = 132개 행복/불행 분기)와 14개 멀티 엔딩에 직결되는 하이브리드 아키텍처**를 구현한 기념비적 작품이다.

> **콘텐츠 안전 원칙**: 본 역기획서와 데이터셋은 전략 시뮬레이션, 국가 경제, 4부대 전투 메커니즘, 병과·지휘관 시스템, 시나리오 조건 그래프 및 엔딩 분기 아키텍처에 집중하며, 원작의 성인 요소는 노골적 묘사 없이 순수하게 **시나리오 이벤트 ID·플래그·해금 조건**으로 추상화한다.

---

## 디렉터리 구조

- [ReverseDesign/README.md](./ReverseDesign/README.md) — 역기획서 전체 색인 및 문서별 요약
- [ReverseDesign/00_scope_evidence_and_glossary.md](./ReverseDesign/00_scope_evidence_and_glossary.md) — 분석 범위, 증거 등급 표기 규칙, 용어 사전
- [ReverseDesign/01_core_loop_and_state_machine.md](./ReverseDesign/01_core_loop_and_state_machine.md) — 5단계 캠페인 상태 머신 및 주간 턴 루프
- [ReverseDesign/02_strategic_map_turns_and_economy.md](./ReverseDesign/02_strategic_map_turns_and_economy.md) — 전략 맵 그래프, 주간 액션 슬롯, 무패널티 징세/건설/징병 및 닌자 공작
- [ReverseDesign/03_squad_combat_classes_and_dungeons.md](./ReverseDesign/03_squad_combat_classes_and_dungeons.md) — 4부대 전열/후열 전투, 최소 병수 행동순, 전투역, Snipe 공식, 미궁 탐색
- [ReverseDesign/04_character_scenarios_and_crisis_timers.md](./ReverseDesign/04_character_scenarios_and_crisis_timers.md) — 전략 상태 ↔ 캐릭터 시나리오 강결합 엔진, 달력 기한, 전역 위기 타이머
- [ReverseDesign/05_characters_factions_and_endings.md](./ReverseDesign/05_characters_factions_and_endings.md) — 10대 세력, 33명 핵심 인물 카탈로그, 14개 엔딩 및 132개 행복/불행 분기 매트릭스
- [ReverseDesign/06_ui_ux_and_save_architecture.md](./ReverseDesign/06_ui_ux_and_save_architecture.md) — 전략 맵·커맨드·부대 편성·전투 UI/UX 및 세이브 직렬화 구조
- [ReverseDesign/07_data_schemas_and_engine_architecture.md](./ReverseDesign/07_data_schemas_and_engine_architecture.md) — PlayHub용 TypeScript/JSON 스키마 및 SLG+시나리오 통합 엔진 설계
- [ReverseDesign/08_verification_and_test_plan.md](./ReverseDesign/08_verification_and_test_plan.md) — 데이터 무결성·상태 머신·전투·타이머 자동화 검증 계획
- [ReverseDesign/SOURCE_REGISTER.md](./ReverseDesign/SOURCE_REGISTER.md) — 원작 검증 출처 대장
- [ReverseDesign/DATA_GAPS.md](./ReverseDesign/DATA_GAPS.md) — 미검증 상수·누락 데이터 및 후속 검증 목록
- [ReverseDesign/verified_data/](./ReverseDesign/verified_data/) — JSON/CSV 원작 검증 데이터 및 Node.js 무결성 검증기(`validate_data.mjs`)

---

## 검증 데이터 요약 (`verified_data/`)

| 데이터 파일 | 건수 | 검증기 검사 항목 |
|---|---:|---|
| `factions.json` / `factions.csv` | 10개 세력 | ID 유일성, 지도자·수도 참조 무결성, CSV 동치성 |
| `territories.json` / `territories.csv` | 29개 영토 | 무방향 인접 그래프 대칭성, 리자스성 기점 100% 연결성 |
| `unit_classes.json` / `unit_classes.csv` | 14개 병종 | 공격 유형·전열/후열·반격 규칙 정합성 |
| `characters.json` / `characters.csv` | 33명 핵심 인물 | 소속 세력·병종·초기 영토 참조 무결성 |
| `scenario_events_and_timers.json` | 16개 시나리오/타이머 | 영토·캐릭터·세력·엔딩 참조 무결성 |
| `endings.json` | 14개 메인 엔딩 (+132 운명 메타) | 선행 이벤트·필수 캐릭터 참조 무결성 |

검증 실행:

```powershell
node games/kichikuou-rance/ReverseDesign/verified_data/validate_data.mjs
```
