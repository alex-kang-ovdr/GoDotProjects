# 클래시 로얄 시스템별 역기획서

**조사·재구축판 v4.0.0 · 조사 기준일: 2026-11-17 · 시스템·분석 Markdown 46개 · 데이터 22종(JSON/CSV)**

이 문서 묶음은 클래시 로얄의 플레이 규칙을 전투·카드·성장·경쟁·경제·소셜·운영으로 분해하고, 각 규칙의 설계 의도와 상호작용을 분석한 역기획서다. 기획 검토와 유사 전투 시스템의 프로토타입 설계에 활용할 수 있도록 상태 흐름, 계산 예시, 데이터 계약, 경계 조건, 검증 항목을 함께 작성했다.

## v4: 추가 조사와 실제 데이터 복원

**[ROYALE_DATA_LAB.html](ROYALE_DATA_LAB.html)을 더블 클릭하면 설치 없이 실행된다.** v4에는 22종 표·7,668행과 출처 레코드 107개(고유 URL 78개)가 포함된다. 행 수에는 파생 조회본·참조·자체 구현이 함께 들어 있으므로 독립 원작 사실 수나 재현율을 뜻하지 않는다.

| 추가 문서 | 이번 재구축 내용 |
|---|---|
| [39. v4 개요](39_research_reconstruction_v4_overview.md) | 추가 범위, 실제 증가량, 새 조회 계약, 재생성 순서 |
| [40. 5~8월 공식 패치](40_official_patch_reconstruction_2026.md) | 140개 변경 추가; 총 201개 원장, 191개 부분 필드 |
| [41. 경제 추가 조사](41_economy_evidence_reconciliation.md) | 47행: 신규 구조화 38, 재확인 4, 미해결 5 |
| [42. 모드·시즌·충돌](42_modes_rotation_and_conflicts_research.md) | 40행: 신규 31, 미해결 4, 충돌 5 |
| [43. 역사 행동 복원](43_historical_behavior_recovery.md) | 113개 개체의 행동 필드, 추가 명시 참조 37개 |
| [44. 출처·레벨 조정](44_sources_and_level_reconciliation.md) | 기준 레벨 미기재와 후속 변경, 원장 연속성 감사 |
| [45. 카드 행동](45_card_behavior_and_version_boundaries.md) | 32행: 신규 24, 재확인 3, 미해결 5; 발표 시점 분리 |

기준 레벨을 밝히지 않은 패치 40개 필드는 선택 레벨 수치에 대입하지 않고 별도 표시한다. Hero Tombstone처럼 뒤에 레벨 미기재 변경이 있는 이전 확인값에는 경고를 붙인다. 과거 카드 수치를 현재 빈칸으로 자동 복사하지 않는다.

검증과 복원 범위: [릴리스 검사](reports/release_validation.md) · [데이터 정합성](reports/validation_report.md) · [품질 보고서](reports/quality_report.md) · [추가 조사 감사](reports/research_reconstruction_v4.md).

```bash
python scripts/reconstruct_extensions.py
python scripts/rebuild.py
python scripts/reconcile_research.py
python scripts/analyze_quality.py
python scripts/validate.py
python scripts/build_lab.py
python scripts/verify_package.py
```

아래 v2·v3 설명의 숫자는 각 버전 당시 범위다. 현재 통합 수치와 조회 동작은 v4 문서와 생성 보고서를 따른다. 원작 클라이언트 44개 관측 명세는 모두 미실행이며, 기존 Crownfall v4.4.0 게임은 이번 데이터 조사로 변경하지 않았다.

## v3 이력: 더블 클릭으로 실행하는 연구 도구

**[ROYALE_DATA_LAB.html](ROYALE_DATA_LAB.html)을 열면 별도 설치 없이 카드·규칙·경제·참조 계약을 탐색할 수 있다.** 데이터와 JavaScript가 HTML에 포함되어 있어 서버 없이 실행된다. 출처 링크를 여는 경우에만 외부 사이트로 이동한다.

| 추가 문서 | 고도화 내용 |
|---|---|
| [34. 오프라인 연구 도구](34_offline_research_lab.md) | 카드 검색·개체 연결·패치 이력·근거 보기·JSON/CSV 내보내기 |
| [35. 실행 가능한 전투 계약](35_executable_combat_contracts.md) | 손패·시간·엘릭서·보호막·자체 방진 모델과 참조 시나리오 30개 |
| [36. 성장·확률 계산](36_economy_calculators_and_boundaries.md) | 단계별 업그레이드 비용, 결측 차단, 조건부 분포, 독립 반복 가정 |
| [37. 범위와 구현 게이트](37_coverage_and_implementation_gates.md) | 카드 키 128개 자료 범위, 출처 감사, 선행 관계를 가진 후속 과제 16개 |
| [38. 인계·수용 기준](38_versioned_handoff_and_acceptance.md) | 원작·연구·자체 게임 버전 분리, 자동 검사와 실제 관측 구분 |

원표는 16종·7,128행으로 유지했다. 추가 분석 뷰와 참조 시나리오를 새로운 원작 수치로 합산하지 않는다. **40개 카드 키의 60개 부분 패치 필드**는 수록 원장 안의 마지막 확인값이며, 완전한 현재 카드 프로필로 표시하지 않는다. 실제 원작 관측 44개는 모두 미실행이다.

확인 결과: [품질 보고서](reports/quality_report.md) · [릴리스 검증](reports/release_validation.md). 기존 Crownfall 게임 소스·배포는 v4.4.0을 유지하며, 연구 도구는 별도 산출물이다.

## v2에서 재구축한 자료

원작의 공개 규칙을 **출처·시점·레벨·형상·확실성이 구분된 데이터**로 재구축했다. [23. 재구축 개요](23_data_reconstruction_overview.md)에서 복원 범위와 한계를 먼저 확인할 수 있다. 총16개 표에는7,128개 레코드가 있으며 정규화·참조·조회본과 자체 구현 대조가 함께 포함된다.

| 추가 문서 | 내용 |
|---|---|
| [23. 재구축 개요](23_data_reconstruction_overview.md) | 근거 층, 결측, 버전 경계, 전체 분량 |
| [24. 전투 실험실](24_combat_rules_and_interaction_lab.md) | 63개 전투 규칙과44개 미실행 실험 명세 |
| [25. 형상·능력](25_card_forms_and_ability_contracts.md) | 진화·Hero·Champion·타워 슬롯과 능력 정책 |
| [26. 성장·경제](26_progression_economy_reconstruction.md) | 업그레이드·전환·보상량·조건부 확률·정산 |
| [27. 모드·소셜](27_modes_matchmaking_social_contracts.md) | 입장·매칭·상한·클랜·전쟁의 실행 계약 |
| [28. Merge Tactics](28_merge_tactics_reconstructed_tables.md) | 시즌 카드풀·특성·합성·장비·변형·충돌 자료 |
| [29. 카드·개체·레벨 사전](29_card_entity_level_dictionary.md) | 역사 카탈로그120행, 정의532행, 레벨 수치4,956행 |
| [30. 패치·버전 경계](30_patch_history_and_version_boundaries.md) | 공식61개 수치 변경과60개 최신 필드 조회 |
| [31. 구현 차이](31_implementation_gap_matrix.md) | Crownfall19개 자체 카드 대조, 밀집보병 분리 |
| [32. 재구축·검증 도구](32_data_pipeline_and_validation.md) | 오프라인 재생성·조회·무결성 검사 |
| [33. 실측 계획](33_observation_protocol_and_reconstruction_backlog.md) | 실제 원작 관측 프로토콜과 후속 복원 우선순위 |

**2023 공개 카드 아카이브와2026 공식 패치 필드는 별도 자료다.** 두 자료를 합쳐 현재 전체 카드 수치를 복원했다고 표시하지 않는다. 값이 없거나 공식 문서가 충돌하면 null·조건·충돌 그룹으로 남긴다. 밀집보병은 원작 카드가 아닌 자체 구현이며, 기존 웹게임 v4.4.0은 이번 문서 작업으로 변경하지 않았다.

데이터 도구는 Python 표준 라이브러리를 사용한다. v3의 HTML 실행에는 설치가 필요 없으며, 참조 코드·UI 흐름의 개발자 검증에는 Node.js를 함께 사용한다.

```bash
python scripts/rebuild.py
python scripts/validate.py
python scripts/query_data.py card fireball --level 11
```

검사 결과: [검증 보고서](reports/validation_report.md) · [기계 판독 보고서](reports/validation_report.json) · [데이터 manifest](data/dataset_manifest.json).

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

확장판은 역사 카드의 레벨별 수치와 공개 성장·경제·모드 표를 기계 판독 가능한 데이터로 제공한다. 현재 원작 전체 카드의 모든 형상·레벨 수치, 계정별 상점 가격, 모든 이벤트 보상을 완전히 확보한 데이터베이스는 아니다. 세부 범위·결측·충돌과 재구축 방법은 현재 39~45번 문서를 먼저 읽고 23~38번의 버전별 설계를 참고한다.

사용자가 제공한 [나무위키 문서](https://namu.wiki/w/%ED%81%B4%EB%9E%98%EC%8B%9C%20%EB%A1%9C%EC%96%84)는 이번 조회에서 본문을 가져오지 못했다. 대신 Supercell 공식 업데이트·지원 문서를 중심으로 조사했다. 나무위키 내용을 읽거나 요약한 것으로 표시하지 않았다.

## 6. 파일 사용 방법

ZIP을 풀고 `00_README.md`부터 열면 상대 링크로 각 문서로 이동할 수 있다. 파일명과 폴더 구조를 유지하면 문서 간 링크가 그대로 작동한다. 단독 파일을 이동한 경우 상대 링크의 대상 문서도 함께 두어야 한다.

추가 조사로 규칙을 갱신할 때는 해당 시스템 문서와 22번의 근거·충돌 기록을 함께 수정한다. ‘발표일’, ‘적용 예고일’, ‘직접 관측일’을 각각 남기면 다음 검토에서 구버전 혼입을 줄일 수 있다.
