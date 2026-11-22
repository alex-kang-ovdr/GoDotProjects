# 귀축왕 란스 역기획서 (Reverse Design) 인덱스

> **설계 명제**: **전략 시뮬레이션(SLG)과 캐릭터별 시나리오의 통합**
>
> 본 역기획서는 AliceSoft의 『귀축왕 란스(鬼畜王ランス, 1996, Windows 95)』를 대상으로, 웹 문헌·공략 위키 교차 검증을 통해 확인된 원작 사실(`[확인]`), 구조적 해석(`[해석]`), PlayHub 엔진 이식을 위한 재구성 설계(`[재구성안]`), 그리고 원작 실행/바이너리 대조가 추가로 필요한 공백(`[검증 필요]`)을 엄격히 구분하여 문서화한다.

---

## 문서 목차

| 번호 | 문서 | 핵심 내용 |
|---|---|---|
| 00 | [00_scope_evidence_and_glossary.md](./00_scope_evidence_and_glossary.md) | 역기획 범위, 4단계 증거 표기 규칙, 콘텐츠 안전 추상화 원칙, 한/일/영 용어 사전 |
| 01 | [01_core_loop_and_state_machine.md](./01_core_loop_and_state_machine.md) | 5단계 캠페인 페이즈 FSM, 주간(LP 년/월/주) 턴 실행 파이프라인, 즉시 종료 인터럽트 |
| 02 | [02_strategic_map_turns_and_economy.md](./02_strategic_map_turns_and_economy.md) | 29개 대륙 거점 그래프, 유형별 주간 액션 슬롯(도시·하렘·대화·징병·건설·탐색·침공·닌자 5회), 무패널티 징세 경제 |
| 03 | [03_squad_combat_classes_and_dungeons.md](./03_squad_combat_classes_and_dungeons.md) | 최대 4부대 전열/후열 전투, 최소 병수 우선 행동순, 전투역(`戦闘域`), 데미지·Snipe 공식, 미궁 탐색 |
| 04 | [04_character_scenarios_and_crisis_timers.md](./04_character_scenarios_and_crisis_timers.md) | 영토 점령 순서·달력 기한·전역 침공 타이머가 캐릭터 영입/이탈/운명/엔딩을 지배하는 이벤트 엔진 설계 |
| 05 | [05_characters_factions_and_endings.md](./05_characters_factions_and_endings.md) | 10대 세력, 33명 핵심 지휘관/인물 카탈로그, 14개 메인 엔딩 및 66인×2(132개) 행복/불행 분기 시스템 |
| 06 | [06_ui_ux_and_save_architecture.md](./06_ui_ux_and_save_architecture.md) | 대륙 전략맵·부하 관리·전투·이벤트 목록 UI 레이아웃, 세이브 스냅샷 및 리플레이 결정론 설계 |
| 07 | [07_data_schemas_and_engine_architecture.md](./07_data_schemas_and_engine_architecture.md) | TypeScript 도메인 모델, 선언적 조건식 DSL, Hybrid SLG + Scenario Event Engine 아키텍처 |
| 08 | [08_verification_and_test_plan.md](./08_verification_and_test_plan.md) | 데이터 검증기(`validate_data.mjs`), 상태 전이·전투·타이머 단위/시나리오 테스트 및 QA 게이트 |
| — | [SOURCE_REGISTER.md](./SOURCE_REGISTER.md) | 웹 교차 검증에 사용된 영/일/한 출처 등록부 및 신뢰도 평가 |
| — | [DATA_GAPS.md](./DATA_GAPS.md) | 원작 미검증 상수(52인 전수 스탯, 정확한 미세 도시 수, 전투 RNG 계수, 14엔딩 중 2개 변형 슬롯 등) 정직 기록 |

---

## 핵심 설계 통찰 (Why Kichikuou Rance Works)

1. **통합 AP 풀이 아닌 "유형별 주간 액션 슬롯"** `[확인]`
   - 후속작 『전국 란스』의 범용 행동력(2~3 AP)과 달리, 『귀축왕 란스』는 매 주(1턴)마다 **도시 1회 · 하렘(교류) 1회 · 부하 대화 1회 · 병력 증원/보충 택1 · 건설 1회 · 미궁 탐색 1회 · 닌자 공작(닌자당 5회) · 침공(점령 시 해당 턴 종료)**처럼 **역할별 슬롯**이 분리되어 있다.
   - 이 구조 덕분에 플레이어는 전쟁과 캐릭터 시나리오를 서로 배척하지 않고 매 턴 병행하되, **"이번 주에 어느 도시를 치고 누구와 대화할 것인가"**라는 순서 최적화에 집중하게 된다.

2. **소수 병력 선공 + 전투역(`戦闘域`) 캡의 전술적 역설** `[확인]`
   - 전투 중 행동권이 **현재 병수가 가장 적은 부대**에 먼저 돌아오고, 전선에 동시 투입되는 병력은 **전투역 상한**으로 제한된다.
   - 따라서 무조건 병력이 많은 대군이 유리한 것이 아니라, 소수 정예 지휘관의 선제 `Snipe`(적 지휘관 직격) · `방어` 벽 운용 · 후열 무반격 사격/마법의 조합이 승패를 가른다.

3. **전략 맵 상태가 곧 캐릭터 시나리오의 조건식** `[확인]` `[해석]`
   - 볼고 Z 점령 시점(`LP 3/08/3` 소울, `LP 4/01/3` 시일), 제스 개전 후 5주 타이머와 아담 요새/테이프 점령 순서(시즈카/나기), 라질 징세→사사호 도끼 선택(하니와 킹), 엑스 반란 진압 후 69~73주 마인군 침공, 샹그릴라 제외 전 영토 정복 후 케이브리스 격파(창조신 페이즈)까지 **모든 전략적 의사결정이 곧 시나리오 분기 그래프의 입력**이다.
