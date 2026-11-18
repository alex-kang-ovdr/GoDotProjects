# 클래시 로얄 시스템별 역기획서

**조사 기준일: 2026-11-13 · 언어: 한국어 · 형식: 시스템별 Markdown 23개**

이 문서 묶음은 클래시 로얄의 플레이 규칙을 전투·카드·성장·경쟁·경제·소셜·운영으로 분해하고, 각 규칙의 설계 의도와 상호작용을 분석한 역기획서다. 기획 검토와 유사 전투 시스템의 프로토타입 설계에 활용할 수 있도록 상태 흐름, 계산 예시, 데이터 계약, 경계 조건, 검증 항목을 함께 작성했다.

## 1. 먼저 읽을 내용

클래시 로얄의 핵심은 **제한된 엘릭서와 순환 손패를 사용해 배치 위치·타이밍을 결정하고, 자동 전투의 결과를 다음 교환의 자산으로 연결하는 구조**다. 이 전투 루프 위에 카드 성장, 여러 경쟁 모드, 시즌 목표와 클랜 활동이 연결된다. 전체 구조는 [01. 게임 구조와 핵심 루프](01_product_structure_and_core_loops.md)에서 설명한다.

현재 규칙은 초기 출시 버전과 차이가 크다. 이번 문서는 2025~2026년의 주요 개편을 반영하고, 과거 규칙을 비교 목적으로 언급할 때는 시점을 명시한다. 특히 상자 대기열, 챔피언 회전, 특수 슬롯, 계정 성장과 시즌별 경쟁 조건을 한 시점의 규칙으로 섞지 않도록 했다. 근거와 상충 자료는 [22번 문서](22_sources_versions_and_open_questions.md)에 모았다.

## 2. 문서의 근거 수준

| 표시 | 의미 | 읽는 방법 |
|---|---|---|
| **[확인]** | 공식 지원·업데이트 등에서 확인한 공개 내용 | 해당 날짜·모드·조건과 출처를 함께 읽음 |
| **[분석]** | 규칙이 만드는 선택·경험에 대한 해석 | 개발사의 내부 의도를 직접 확인한 발언과 구분 |
| **[재현 설계]** | 유사 시스템 구현을 위한 데이터·상태·처리 제안 | 원작의 소스 코드·프로토콜로 취급하지 않음 |
| **[검증 필요]** | 공식 자료 충돌 또는 추가 관찰이 필요한 내용 | 고정 수치로 구현하기 전에 현재 빌드 확인 |
| **가상 예시** | 계산과 의사결정을 설명하는 임의 수치·카드 | 현재 실게임 카드 수치나 실측 승률이 아님 |

공식 발표를 읽었다는 의미와 실제 계정에서 해당 기능을 사용했다는 의미도 구별한다. 본 작업에는 게임 클라이언트 실측·패킷 분석·소스 코드 열람이 포함되지 않았다.

## 3. 전체 파일 목록

### A. 전체 구조와 전투

| 번호 | 파일 | 주요 내용 |
|---|---|---|
| 00 | [00_README.md](00_README.md) | 전체 목차·근거 수준·읽기 순서 |
| 01 | [01_product_structure_and_core_loops.md](01_product_structure_and_core_loops.md) | 핵심 재미, 시간 규모별 루프, 시스템 의존성 |
| 02 | [02_battle_flow_and_victory.md](02_battle_flow_and_victory.md) | 정규·연장·서든데스·크라운·타이브레이커 |
| 03 | [03_elixir_hand_and_cycle.md](03_elixir_hand_and_cycle.md) | 엘릭서, 8장 덱·4장 손패, 회전 비용·특수 예외 |
| 04 | [04_arena_and_deployment.md](04_arena_and_deployment.md) | 배치 영역, 레인·강·타워, 중앙 유도·킹 활성화 |
| 05 | [05_unit_ai_targeting_and_pathing.md](05_unit_ai_targeting_and_pathing.md) | 타겟 선택·유지·변경, 이동·장애물·경로 |
| 06 | [06_damage_and_status_effects.md](06_damage_and_status_effects.md) | 피해·보호막·타수 임계점·상태 효과·사망 처리 |

### B. 카드·성장·경쟁·경제

| 번호 | 파일 | 주요 내용 |
|---|---|---|
| 07 | [07_cards_and_deck_building.md](07_cards_and_deck_building.md) | 카드 역할, 덱 구성, 승리 수단, 비용·대응력 |
| 08 | [08_evolutions_champions_heroes_towers.md](08_evolutions_champions_heroes_towers.md) | 진화·챔피언·히어로·와일드 슬롯·타워 유닛 |
| 09 | [09_collection_and_card_progression.md](09_collection_and_card_progression.md) | 카드 해금·복제본·업그레이드·마스터리 |
| 10 | [10_player_progression_trophy_and_ranked.md](10_player_progression_trophy_and_ranked.md) | 컬렉션·킹 타워·트로피 로드·랭크·시즌 초기화 |
| 11 | [11_matchmaking_and_game_modes.md](11_matchmaking_and_game_modes.md) | 매칭·레벨 정책·도전·듀얼·Crown Series |
| 12 | [12_economy_rewards_and_monetization.md](12_economy_rewards_and_monetization.md) | 재화·상자·확률·패스·상점·지급·성장 병목 |

### C. 시즌·소셜·별도 모드

| 번호 | 파일 | 주요 내용 |
|---|---|---|
| 13 | [13_seasons_events_and_retention.md](13_seasons_events_and_retention.md) | 일일·시즌 목표·복귀·퍼즐·앨범·이벤트 |
| 14 | [14_clans_trading_and_social.md](14_clans_trading_and_social.md) | 클랜 권한·요청·기부·교환·친구·친선전 |
| 15 | [15_clan_wars.md](15_clan_wars.md) | 전쟁 덱·훈련일·전투일·선박전·메달·보상 |
| 16 | [16_merge_tactics.md](16_merge_tactics.md) | 라운드·상점·공용 풀·합성·룰러·특성·장비 |

### D. UX·운영·재현 구현·검증

| 번호 | 파일 | 주요 내용 |
|---|---|---|
| 17 | [17_uiux_and_onboarding.md](17_uiux_and_onboarding.md) | HUD·배치 입력·덱 편집·성장 안내·학습 설계 |
| 18 | [18_live_balance_and_analytics.md](18_live_balance_and_analytics.md) | 밸런스 단위·메타·표본 해석·지표·패치 검증 |
| 19 | [19_network_replay_and_architecture.md](19_network_replay_and_architecture.md) | 권위 판정·입력·재접속·리플레이·좌표계 제안 |
| 20 | [20_data_model_and_configuration.md](20_data_model_and_configuration.md) | 카드·형상·모드·계정·효과·거래 스키마 제안 |
| 21 | [21_qa_and_validation_plan.md](21_qa_and_validation_plan.md) | 70개 통합 검증 시나리오·실측 기록·우선순위 |
| 22 | [22_sources_versions_and_open_questions.md](22_sources_versions_and_open_questions.md) | 출처 색인·변경 이력·충돌·미확정 사항 |

## 4. 목적별 추천 읽기 순서

| 목적 | 순서 |
|---|---|
| 전체 기획 파악 | 01 → 02 → 03 → 07 → 10 → 12 |
| 전투 시스템 재현 | 02 → 03 → 04 → 05 → 06 → 08 → 19 → 20 → 21 |
| 성장·경제 기획 | 07 → 08 → 09 → 10 → 12 → 13 |
| 경쟁·커뮤니티 운영 | 10 → 11 → 14 → 15 → 18 |
| 조작·학습 개선 | 04 → 07 → 17 → 21 |
| 자동 전투 별도 모드 | 16 → 18 → 20 → 21 |
| 규칙 최신성 검토 | 22 → 필요한 시스템의 해당 출처 |

## 5. 포함한 것과 범위의 한계

각 시스템에는 목적과 주요 규칙 외에 계산·상태 전이·경계 조건·상호작용·설계 해석·재현 데이터·검증 항목을 해당 내용에 맞게 포함했다. Mermaid 다이어그램과 Markdown 표는 호환 편집기에서 직접 렌더링할 수 있다. 코드 블록은 실제 제품 코드가 아닌 의사코드·스키마·가상 계산을 구분해 표기했다.

전체 카드의 모든 레벨별 수치, 현재 모든 상점 가격, 모든 이벤트 보상표를 복제한 데이터베이스는 아니다. 자주 바뀌는 수치는 대표 사례와 원문 링크로 제공하며, 원문이 충돌하면 임의로 하나를 확정하지 않는다.

사용자가 제공한 [나무위키 문서](https://namu.wiki/w/%ED%81%B4%EB%9E%98%EC%8B%9C%20%EB%A1%9C%EC%96%84)는 이번 조회에서 본문을 가져오지 못했다. 대신 Supercell 공식 업데이트·지원 문서를 중심으로 조사했다. 나무위키 내용을 읽거나 요약한 것으로 표시하지 않았다.

## 6. 파일 사용 방법

ZIP을 풀고 `00_README.md`부터 열면 상대 링크로 각 문서로 이동할 수 있다. 파일명과 폴더 구조를 유지하면 문서 간 링크가 그대로 작동한다. 단독 파일을 이동한 경우 상대 링크의 대상 문서도 함께 두어야 한다.

추가 조사로 규칙을 갱신할 때는 해당 시스템 문서와 22번의 근거·충돌 기록을 함께 수정한다. ‘발표일’, ‘적용 예고일’, ‘직접 관측일’을 각각 남기면 다음 검토에서 구버전 혼입을 줄일 수 있다.
