# 22. 출처·버전 기준·미확정 사항

> **확장판 안내:** 초판2026-11-13에2026-11-17 공개 데이터 재구축을 추가했다. 최신 수치·충돌·미확정 값의 사용 범위는 [23번](23_data_reconstruction_overview.md)과 각 상세 데이터 문서를 함께 확인한다.

> 조사 기준일: 2026-11-13. 이 문서는 패키지 전체의 근거 사용 원칙, 주요 변경 이력, 공식 자료 충돌, 추가 검증 대상을 관리한다. 최신 운영 서버의 내부 설정을 직접 추출한 자료는 아니다.

## 1. 조사 방법과 범위

사용자가 제공한 [나무위키 클래시 로얄 문서](https://namu.wiki/w/%ED%81%B4%EB%9E%98%EC%8B%9C%20%EB%A1%9C%EC%96%84)는 본문 조회가 실패해 내용 근거로 사용하지 않았다. 실제 규칙은 Supercell 공식 게임 소개·지원 문서·업데이트·밸런스 공지를 중심으로 확인했다. GDC 발표는 추가 읽기 자료로 소개 페이지까지만 확인했으며 전체 영상 내용을 열람한 것으로 인용하지 않았다.

이번 작업에서는 실제 계정 로그인, 클라이언트 실행, 영상 프레임 측정, API 원시 데이터 수집, 서버 코드·패킷 분석을 수행하지 않았다. 따라서 [확인]은 **공식 자료에서 확인했다**는 뜻이며, 단말에서 직접 실측했다는 뜻이 아니다.

### 1.1 자료를 채택하는 순서

1. 동일 항목에 대해 명시적인 변경일·적용일이 있는 공식 공지를 찾는다.
2. 현재 지원 문서와 비교하여 변경 이후 내용인지 확인한다.
3. 지원 문서의 갱신일이 없고 서로 충돌하면 한쪽이 최신이라고 자동 가정하지 않는다.
4. 공지의 일반 규칙과 특정 카드·모드의 예외는 적용 범위를 나눈다.
5. 유효한 근거가 없는 내부 알고리즘은 [재현 설계] 또는 [검증 필요]로 남긴다.

웹 검색의 ‘최근 수집’ 표시는 실제 규칙의 최근 변경일과 다르다. URL에 들어간 연도, 시즌 이름, 기사 제목만으로 적용 시점을 정하지 않고 본문을 확인한다.

## 2. 주요 변경 이력과 문서 적용

아래는 변경의 요약 색인이다. 세부 수치·예외는 연결한 시스템 문서에서 확인한다.

| 공식 자료 게시일 | 공지·변경 | 이번 패키지에서 구분한 점 | 주요 문서 |
|---|---|---|---|
| 2019-11-26 | [November Update](https://supercell.com/en/games/clashroyale/blog/release-notes/november-update/) | 표준 전투 시간 개편의 역사적 근거; 현재 지원 안내와 함께 확인 | 02·03 |
| 2025-03-31 | [April Update](https://supercell.com/en/games/clashroyale/blog/release-notes/april-update/) | 상자 대기열·타이머 제거와 이동 개선 | 05·12 |
| 2025-09-25 | [October Update 2025](https://supercell.com/en/games/clashroyale/blog/release-notes/october-update-2025/) | 챔피언 회전·Lucky Chest 개편 | 03·08·12 |
| 2025-11-21 | [December Update 2025](https://supercell.com/en/games/clashroyale/blog/release-notes/december-update-2025/) | 히어로 도입·성장 개편; 출시 당시 슬롯과 현행 슬롯 구분 | 08~12 |
| 2026-02-23 | [March Update 2026](https://supercell.com/en/games/clashroyale/blog/release-notes/march-update-2026/) | 소셜·친선 진입 및 3월에 순차 적용된 변화 | 11·17 |
| 2026-03-16 | [Mid-March Update](https://supercell.com/en/games/clashroyale/blog/news/mid-march-update/) | 특수 슬롯·히어로 선택·확률 보상 변화 | 07·08·12 |
| 2026-05-13 | [New Collection Levels & Mastery Changes](https://supercell.com/en/games/clashroyale/blog/news/new-collection-levels-and-mastery-changes/) | 본문 적용 예고는 05-26; XP·King's Journey와 신규 성장 구분 | 09·10·14 |
| 2026-07-14 | [Ranked 요구치 조정](https://supercell.com/en/games/clashroyale/blog/news/update-to-ranked-trophy-requirements/) | 11월 일정과 지원 안내 충돌을 기록 | 10 |
| 2026-08-04 | [August Balance Changes](https://supercell.com/en/games/clashroyale/blog/news/final-august-balance-changes-826/) | 능력 사용 구조 개편, 같은 페이지의 08-26 후속 변경 구분 | 03·06·08·18 |
| 2026-10-27 | [King vs. King!](https://supercell.com/en/games/clashroyale/blog/release-notes/new-season-king-vs-king/) | 11월 카드·퍼즐·마켓·덱 추천 발표와 점진 배포 | 07·08·13·17 |
| 2026-10-27 | [Merge Tactics November Changes](https://supercell.com/en/games/clashroyale/blog/release-notes/merge-tactics-season-11-november-changes/) | 본편 시즌과 다른 Season 11 운영·규칙 적용 | 16 |
| 2026-11-08 | [Crown Series!](https://supercell.com/en/games/clashroyale/blog/news/crown-series/) | 새 경쟁 구조의 공식 공지; 실제 계정 배포 여부는 미관측 | 11 |

## 3. 과거 규칙을 현행으로 오해하기 쉬운 지점

| 구식 설명 또는 지나친 일반화 | 이번 문서의 처리 |
|---|---|
| 상자 슬롯이 가득 차면 개방 시간을 기다린다 | 과거 경제와 현재 보상 객체를 분리 |
| 챔피언이 살아 있으면 3카드 회전이 된다 | 2025년 회전 개편 이후 규칙으로 구분 |
| 챔피언은 모든 덱에서 무조건 한 장이다 | 현행 특수 슬롯의 허용 조합을 확인 |
| 모든 능력은 쿨다운 후 계속 사용한다 | 2026년 변경과 개별 카드 예외를 분리 |
| 모든 주문의 크라운 피해는 공통 30%다 | 카드·효과·패치별 정책으로 기록 |
| XP를 얻으면 King's Journey로 계정 성장한다 | 2026년 컬렉션·킹 타워 성장과 구분 |
| 기존 마법 아이템을 모두 현행 강화 재료로 쓴다 | 삭제·전환된 재료를 현재 수단에서 분리 |
| 레벨 상한 모드는 모든 카드를 같은 레벨로 만든다 | 고정·상한·부스트 정책을 별도로 모델링 |
| Merge Tactics는 본편과 같은 시즌에 초기화된다 | 별도 시즌과 자원·점수 체계로 기록 |

이 표의 각 규칙 근거는 해당 시스템 문서의 가까운 문단에 연결했다. 역사적 수치가 필요한 곳에서만 과거 버전을 인용하며, 과거 글이 최근에 검색되었다고 현재 규칙으로 바꾸지 않는다.

## 4. 공식 자료가 충돌하는 항목

| ID | 항목 | 서로 다른 안내 | 문서에서의 처리 | 해소 방법 |
|---|---|---|---|---|
| V01 | Ranked 진입 요구치 | 7월 공지의 11월 일정 14,000 / 지원 13,000 | 예정 일정과 지원 문구를 병기, 실제 적용 단정하지 않음 | 현재 시즌·진입 이력별 계정 UI 확인 |
| V02 | Seasonal Trophy Road 끝단 | 6월 공지의 끝단 고정 / 지원의 추가 보상 없는 계속 진행 | 지원 설명을 잠정 사용하고 변경 시점 미상을 명시 | 끝단 도달 계정 전후 비교 |
| V03 | 최대 레벨 기부 보상 | 성장 개편 공지와 기부 지원의 골드 설명 상충 | [14번](14_clans_trading_and_social.md)에 예외·선택한 재현 정책 표시 | 카드·골드·Star Points 전후 측정 |
| V04 | 5성 진화 보상 확률 | 일부 상자 지원의 이전 표 / 3월 변경과 갱신 확률 허브 | 상자 종류·레벨·최종 별 조건을 함께 기록 | 해당 자격의 최신 공식 확률표·인게임 안내 확인 |
| V05 | Mastery 보상 | 과거 지원의 보상 구성 / 2026 성장 개편 | 날짜가 있는 개편 내용 적용 | 현재 과제 보상 UI 확인 |
| V06 | Merge Tactics 라운드 수입 | 일반 지원 4 / 10월 27일 공지 5 | 날짜가 명확한 패치 우선 | 현재 라운드 시작 잔액 확인 |
| V07 | Merge 특성 수치 | 지원 표와 날짜 있는 밸런스 내역 불일치 | 확정 수치표로 반복하지 않음 | 현재 특성 툴팁과 적용 결과 확인 |
| V08 | Ranked 레벨 상한 | 2025 공지의 2026년 5월까지 제한 | 과거 예고만으로 11월 상한 추정하지 않음 | 현재 모드 규칙과 실제 입장 레벨 확인 |

충돌이 있다고 전체 문서를 사용할 수 없는 것은 아니다. 불확실한 필드를 설정값으로 분리하고 검증 우선순위를 높이면, 확인된 시스템 구조와 함께 활용할 수 있다.

## 5. 비공개 또는 추가 실측 대상

| 범주 | 미확정 사항 | 왜 중요한가? |
|---|---|---|
| 엘릭서 | 생성의 정밀 위상, 소수 잔량, 입력 적용 시각 | 같은 표기 잔액에서 배치 가능 시점 차이 |
| 배치 | 정확한 논리 격자·미세 좌표·금지 영역 경계 | 위치별 상호작용 재현 |
| 이동 | 실제 경로 알고리즘·충돌 반경·동점 처리 | 타워 접촉 횟수와 수비 유도 |
| 공격 | 같은 시점의 피해·사망·치유·소환 순서 | 보호막·동시 파괴·후속 효과 |
| 상태 | 감속·가속·면역·재적용의 세부 조합 | 카드별 예외 재현 |
| 능력 | 신규 개체 사망 후 능력 소유권 복귀 등 | 여러 동일 카드 개체의 운용 |
| 모드 | 특정 이벤트의 고정·상한·부스트 우선순위 | 보유 레벨과 실효 레벨 구분 |
| 매칭 | 숨은 실력값·큐 확장 시간·가중치 | 공식 공개 기준 이상을 단정하지 않기 |
| 네트워크 | 서버 tick·패킷·결정성·보정 방식 | 원작 구현과 제안 구조의 구분 |
| 리플레이 | 내부 포맷·보관 기간·버전 호환 | 원본 기록 방식의 과단정 방지 |
| 보상 | 획득 시점/개방 시점 자격 스냅샷 | 보상 보류·성장 경계 악용과 지급 차이 |
| 상품 | 지역·플랫폼·계정별 가격·실험군 | 확인하지 않은 가격의 고정 방지 |
| Crown Series | 공식 `maximum 20 battles`의 UI 집계 단위 | 단판·듀얼·대회 승수 혼동 방지 |
| Merge Tactics | 상점 예약·판매·탈락 시 공용 풀 반환 시점 | 경쟁 구매 확률과 동시 처리 |

실측 방법과 70개 사례는 [21. QA·규칙 검증·실측 계획](21_qa_and_validation_plan.md)에 있다.

## 6. 출처 표기 규칙

- 각 문서의 `C`, `E`, `M`, `R` 접두사 ID는 해당 문단의 근거 링크를 식별한다.
- 같은 자료가 여러 문서에 인용될 수 있다. 아래 색인은 URL별 사용 위치를 모으되, 근거의 적용 범위는 본문 문장을 따른다.
- 지원 문서의 발행·최종 수정일이 명확하지 않은 경우 ‘2026-11-13 열람’만 표시한다.
- 공식 자료의 발행일과 제목의 시즌월은 다를 수 있다. `June Update`의 5월 게시처럼 원문 날짜를 우선한다.
- URL에 `2027`이 들어가는 [September Balance Changes](https://supercell.com/en/games/clashroyale/blog/release-notes/september-balance-changes-2027/)는 본문에 표시된 2026년 날짜와 변경 절을 사용했다.
- 긴 원문·보상표·전 카드 수치표를 그대로 옮기기보다 핵심 규칙과 독자적인 분석·가상 예시를 제공한다.

## 7. 전체 출처 색인

아래 목록은 패키지의 각 문서에 인용한 공개 URL을 모은 것이다. 같은 지원 글의 구주소와 신주소가 함께 있으면 별도 URL로 남겼다. 나무위키는 열람 실패한 요청 참고 링크이고, GDC는 소개 페이지 확인 범위라는 점을 주의한다.

| 번호 | 출처 | 문서 내 ID | 사용 문서 | 확인 범위 |
|---|---|---|---|---|
| 01 | [나무위키 클래시 로얄 문서](https://namu.wiki/w/%ED%81%B4%EB%9E%98%EC%8B%9C%20%EB%A1%9C%EC%96%84) | — | [00](00_README.md) | 요청 참고 · 본문 열람 실패 |
| 02 | [Clash Royale 공식 소개](https://supercell.com/en/games/clashroyale/) | C01, C02, C05, R01 | [01](01_product_structure_and_core_loops.md), [02](02_battle_flow_and_victory.md), [19](19_network_replay_and_architecture.md) | 공식 자료 |
| 03 | [3 tips for the Mirror Challenge!](https://supercell.com/en/games/clashroyale/blog/fun/3-tips-for-the-mirror-challenge/) | C09 | [03](03_elixir_hand_and_cycle.md) | 공식 자료 |
| 04 | [All About Drop Rates!](https://supercell.com/en/games/clashroyale/blog/news/clash-royale-chest-info-2/) | E19 | [12](12_economy_rewards_and_monetization.md) | 공식 자료 |
| 05 | [Coming in the Next Update…](https://supercell.com/en/games/clashroyale/blog/news/coming-in-the-next-update/) | E09 | [09](09_collection_and_card_progression.md) | 공식 자료 |
| 06 | [Crown Series!](https://supercell.com/en/games/clashroyale/blog/news/crown-series/) | M07 | [11](11_matchmaking_and_game_modes.md) | 공식 자료 |
| 07 | [August Balance Changes](https://supercell.com/en/games/clashroyale/blog/news/final-august-balance-changes-826/) | C08, E07, R05 | [03](03_elixir_hand_and_cycle.md), [06](06_damage_and_status_effects.md), [08](08_evolutions_champions_heroes_towers.md), [18](18_live_balance_and_analytics.md) | 공식 자료 |
| 08 | [Mid-March Update](https://supercell.com/en/games/clashroyale/blog/news/mid-march-update/) | E08 | [07](07_cards_and_deck_building.md), [08](08_evolutions_champions_heroes_towers.md), [12](12_economy_rewards_and_monetization.md) | 공식 자료 |
| 09 | [New Collection Levels & Mastery Changes](https://supercell.com/en/games/clashroyale/blog/news/new-collection-levels-and-mastery-changes/) | E13, M18, R07 | [09](09_collection_and_card_progression.md), [10](10_player_progression_trophy_and_ranked.md), [14](14_clans_trading_and_social.md), [17](17_uiux_and_onboarding.md) | 공식 자료 |
| 10 | [Update to Ranked Trophy Requirements](https://supercell.com/en/games/clashroyale/blog/news/update-to-ranked-trophy-requirements/) | E17 | [10](10_player_progression_trophy_and_ranked.md) | 공식 자료 |
| 11 | [April Update!](https://supercell.com/en/games/clashroyale/blog/release-notes/april-update/) | C22, E28 | [05](05_unit_ai_targeting_and_pathing.md), [12](12_economy_rewards_and_monetization.md) | 공식 자료 |
| 12 | [Balance Changes April 2022](https://supercell.com/en/games/clashroyale/blog/release-notes/balance-changes-april-2022/) | C14 | [04](04_arena_and_deployment.md), [06](06_damage_and_status_effects.md) | 공식 자료 |
| 13 | [December Update 2025](https://supercell.com/en/games/clashroyale/blog/release-notes/december-update-2025/) | E10 | [08](08_evolutions_champions_heroes_towers.md), [09](09_collection_and_card_progression.md), [10](10_player_progression_trophy_and_ranked.md) | 공식 자료 |
| 14 | [January Balance Changes](https://supercell.com/en/games/clashroyale/blog/release-notes/january-balance-changes-2/) | C15 | [05](05_unit_ai_targeting_and_pathing.md), [06](06_damage_and_status_effects.md) | 공식 자료 |
| 15 | [June Balance Changes](https://supercell.com/en/games/clashroyale/blog/release-notes/june-balance-changes-2026/) | C17 | [06](06_damage_and_status_effects.md) | 공식 자료 |
| 16 | [June Update 2026](https://supercell.com/en/games/clashroyale/blog/release-notes/june-update-2026/) | E25, M11 | [10](10_player_progression_trophy_and_ranked.md), [13](13_seasons_events_and_retention.md) | 공식 자료 |
| 17 | [March Update 2026](https://supercell.com/en/games/clashroyale/blog/release-notes/march-update-2026/) | R03 | [17](17_uiux_and_onboarding.md) | 공식 자료 |
| 18 | [Merge Tactics: Season 11 Balance Changes](https://supercell.com/en/games/clashroyale/blog/release-notes/merge-tactics-season-11-balance-changes/) | M29 | [16](16_merge_tactics.md) | 공식 자료 |
| 19 | [Merge Tactics: Season 11 — November Changes](https://supercell.com/en/games/clashroyale/blog/release-notes/merge-tactics-season-11-november-changes/) | M27 | [16](16_merge_tactics.md) | 공식 자료 |
| 20 | [Merge Tactics: Season 11](https://supercell.com/en/games/clashroyale/blog/release-notes/merge-tactics-season-11/) | M26 | [16](16_merge_tactics.md) | 공식 자료 |
| 21 | [New Game Mode: Merge Tactics!](https://supercell.com/en/games/clashroyale/blog/release-notes/new-game-mode-merge-tactics/) | M24 | [16](16_merge_tactics.md) | 공식 자료 |
| 22 | [New Season: King vs. King!](https://supercell.com/en/games/clashroyale/blog/release-notes/new-season-king-vs-king/) | C23, E24, M08, R06 | [03](03_elixir_hand_and_cycle.md), [07](07_cards_and_deck_building.md), [08](08_evolutions_champions_heroes_towers.md), [13](13_seasons_events_and_retention.md), [17](17_uiux_and_onboarding.md) | 공식 자료 |
| 23 | [New Season: Minion Academy!](https://supercell.com/en/games/clashroyale/blog/release-notes/new-season-minion-academy/) | C16, E29 | [05](05_unit_ai_targeting_and_pathing.md), [06](06_damage_and_status_effects.md), [10](10_player_progression_trophy_and_ranked.md) | 공식 자료 |
| 24 | [November Update](https://supercell.com/en/games/clashroyale/blog/release-notes/november-update/) | C02 | [02](02_battle_flow_and_victory.md) | 공식 자료 |
| 25 | [October Balance Changes](https://supercell.com/en/games/clashroyale/blog/release-notes/october-balance-changes/) | C13 | [04](04_arena_and_deployment.md), [06](06_damage_and_status_effects.md) | 공식 자료 |
| 26 | [October Update 2025](https://supercell.com/en/games/clashroyale/blog/release-notes/october-update-2025/) | C06, E02, R12 | [03](03_elixir_hand_and_cycle.md), [08](08_evolutions_champions_heroes_towers.md), [12](12_economy_rewards_and_monetization.md), [18](18_live_balance_and_analytics.md) | 공식 자료 |
| 27 | [New Cards, Pass Royale & Balance Changes](https://supercell.com/en/games/clashroyale/blog/release-notes/season-16/) | C12 | [04](04_arena_and_deployment.md), [05](05_unit_ai_targeting_and_pathing.md) | 공식 자료 |
| 28 | [September Balance Changes](https://supercell.com/en/games/clashroyale/blog/release-notes/september-balance-changes-2027/) | C18 | [05](05_unit_ai_targeting_and_pathing.md), [06](06_damage_and_status_effects.md) | 공식 자료 |
| 29 | [Summer Update Info!](https://supercell.com/en/games/clashroyale/blog/release-notes/summer-update-is-here-2/) | R10 | [19](19_network_replay_and_architecture.md) | 공식 자료 |
| 30 | [SEPTEMBER UPDATE!](https://supercell.com/en/games/clashroyale/blog/release-notes/the-party-button-update-2/) | C05 | [02](02_battle_flow_and_victory.md) | 공식 자료 |
| 31 | [Creating or Joining a Clan](https://support.clashroyale.com/hc/en-us/articles/49484887529371-Creating-or-Joining-a-Clan) | M13 | [14](14_clans_trading_and_social.md) | 공식 지원 · 수정일 미표기 |
| 32 | [Clan War Rewards](https://support.clashroyale.com/hc/en-us/articles/49484889742363-Clan-War-Rewards) | M22 | [15](15_clan_wars.md) | 공식 지원 · 수정일 미표기 |
| 33 | [Friendly Battles](https://support.clashroyale.com/hc/en-us/articles/49484891151259-Friendly-Battles) | M04 | [11](11_matchmaking_and_game_modes.md), [14](14_clans_trading_and_social.md) | 공식 지원 · 수정일 미표기 |
| 34 | [Resource & Magic Item Conversion Details](https://support.clashroyale.com/hc/en-us/articles/49484891791771-Resource-Magic-Item-Conversion-Details) | E22 | [09](09_collection_and_card_progression.md), [12](12_economy_rewards_and_monetization.md) | 공식 지원 · 수정일 미표기 |
| 35 | [About Clan Wars](https://support.clashroyale.com/hc/en-us/articles/49484904148891-About-Clan-Wars) | M19 | [15](15_clan_wars.md) | 공식 지원 · 수정일 미표기 |
| 36 | [War Decks](https://support.clashroyale.com/hc/en-us/articles/49484904440987-War-Decks) | M20 | [15](15_clan_wars.md) | 공식 지원 · 수정일 미표기 |
| 37 | [1v1 Battle](https://support.clashroyale.com/hc/en-us/articles/49484904683803-1v1-Battle) | C04, M01 | [02](02_battle_flow_and_victory.md), [03](03_elixir_hand_and_cycle.md), [04](04_arena_and_deployment.md), [11](11_matchmaking_and_game_modes.md) | 공식 지원 · 수정일 미표기 |
| 38 | [Seasonal Trophy Road](https://support.clashroyale.com/hc/en-us/articles/49484906823195-Seasonal-Trophy-Road) | E15 | [10](10_player_progression_trophy_and_ranked.md) | 공식 지원 · 수정일 미표기 |
| 39 | [Ranked](https://support.clashroyale.com/hc/en-us/articles/49484907381019-Ranked) | E16 | [10](10_player_progression_trophy_and_ranked.md) | 공식 지원 · 수정일 미표기 |
| 40 | [Automated Leader Rotation](https://support.clashroyale.com/hc/en-us/articles/49484911201563-Automated-Leader-Rotation) | M17 | [14](14_clans_trading_and_social.md) | 공식 지원 · 수정일 미표기 |
| 41 | [Clan War Results](https://support.clashroyale.com/hc/en-us/articles/49484912127643-Clan-War-Results) | M23 | [15](15_clan_wars.md) | 공식 지원 · 수정일 미표기 |
| 42 | [Matchmaking — Clan Wars](https://support.clashroyale.com/hc/en-us/articles/49484912438811-Matchmaking) | M02 | [11](11_matchmaking_and_game_modes.md), [15](15_clan_wars.md) | 공식 지원 · 수정일 미표기 |
| 43 | [Crowns](https://support.clashroyale.com/hc/en-us/articles/49484913891483-Crowns) | M10 | [13](13_seasons_events_and_retention.md) | 공식 지원 · 수정일 미표기 |
| 44 | [Trophy Road](https://support.clashroyale.com/hc/en-us/articles/49484914645915-Trophy-Road) | E14 | [10](10_player_progression_trophy_and_ranked.md) | 공식 지원 · 수정일 미표기 |
| 45 | [Album Event](https://support.clashroyale.com/hc/en-us/articles/49484914939163-Album-Event) | M12 | [13](13_seasons_events_and_retention.md) | 공식 지원 · 수정일 미표기 |
| 46 | [Global Tournaments](https://support.clashroyale.com/hc/en-us/articles/49484915041435-Global-Tournaments) | M06 | [11](11_matchmaking_and_game_modes.md) | 공식 지원 · 수정일 미표기 |
| 47 | [Pass Royale](https://support.clashroyale.com/hc/en-us/articles/49484915388443-Pass-Royale) | E21 | [12](12_economy_rewards_and_monetization.md) | 공식 지원 · 수정일 미표기 |
| 48 | [Champions](https://support.clashroyale.com/hc/en-us/articles/49484915467291-Champions) | E05 | [08](08_evolutions_champions_heroes_towers.md) | 공식 지원 · 수정일 미표기 |
| 49 | [Supercell Support: Seasons](https://support.clashroyale.com/hc/en-us/articles/49484919911451-Seasons) | R02 | [18](18_live_balance_and_analytics.md) | 공식 지원 · 수정일 미표기 |
| 50 | [Duels](https://support.clashroyale.com/hc/en-us/articles/49484921196699-Duels) | M05 | [11](11_matchmaking_and_game_modes.md) | 공식 지원 · 수정일 미표기 |
| 51 | [Merge Tactics](https://support.clashroyale.com/hc/en-us/articles/49484923863067-Merge-Tactics) | M25 | [16](16_merge_tactics.md) | 공식 지원 · 수정일 미표기 |
| 52 | [Card Evolution](https://support.clashroyale.com/hc/en-us/articles/49484923993883-Card-Evolution) | C10 | [03](03_elixir_hand_and_cycle.md) | 공식 지원 · 수정일 미표기 |
| 53 | [Cards & Decks](https://support.clashroyale.com/hc/en-us/articles/49484924205595-Cards-Decks) | C21, E01, R13 | [06](06_damage_and_status_effects.md), [07](07_cards_and_deck_building.md), [09](09_collection_and_card_progression.md), [17](17_uiux_and_onboarding.md) | 공식 지원 · 수정일 미표기 |
| 54 | [Supercell Support: Elixir](https://support.clashroyale.com/hc/en-us/articles/49484936933403-Elixir) | C03, R11 | [01](01_product_structure_and_core_loops.md), [02](02_battle_flow_and_victory.md), [03](03_elixir_hand_and_cycle.md) | 공식 지원 · 수정일 미표기 |
| 55 | [River Battle(s)](https://support.clashroyale.com/hc/en-us/articles/49484937752603-River-Battle-s) | M21 | [15](15_clan_wars.md) | 공식 지원 · 수정일 미표기 |
| 56 | [Trading Cards](https://support.clashroyale.com/hc/en-us/articles/49484938455835-Trading-Cards) | M16 | [14](14_clans_trading_and_social.md) | 공식 지원 · 수정일 미표기 |
| 57 | [Magic Items](https://support.clashroyale.com/hc/en-us/articles/49484940179483-Magic-Items) | E23 | [09](09_collection_and_card_progression.md), [12](12_economy_rewards_and_monetization.md) | 공식 지원 · 수정일 미표기 |
| 58 | [Clan Roles](https://support.clashroyale.com/hc/en-us/articles/49484954095771-Clan-Roles) | M14 | [14](14_clans_trading_and_social.md) | 공식 지원 · 수정일 미표기 |
| 59 | [Requesting & Donating Cards](https://support.clashroyale.com/hc/en-us/articles/49484955716891-Requesting-Donating-Cards) | M15 | [14](14_clans_trading_and_social.md) | 공식 지원 · 수정일 미표기 |
| 60 | [Classic Challenges](https://support.clashroyale.com/hc/en-us/articles/49484955959067-Classic-Challenges) | M03 | [11](11_matchmaking_and_game_modes.md) | 공식 지원 · 수정일 미표기 |
| 61 | [Daily Battle Rewards](https://support.clashroyale.com/hc/en-us/articles/49484956220443-Daily-Battle-Rewards) | M09 | [13](13_seasons_events_and_retention.md) | 공식 지원 · 수정일 미표기 |
| 62 | [Heroes](https://support.clashroyale.com/hc/en-us/articles/49484957323163-Heroes) | E04 | [07](07_cards_and_deck_building.md), [08](08_evolutions_champions_heroes_towers.md) | 공식 지원 · 수정일 미표기 |
| 63 | [Collection Level](https://support.clashroyale.com/hc/en-us/articles/50815299122459-Collection-Level) | E11 | [10](10_player_progression_trophy_and_ranked.md) | 공식 지원 · 수정일 미표기 |
| 64 | [King Tower Level](https://support.clashroyale.com/hc/en-us/articles/50815997602715-King-Tower-Level) | E12 | [10](10_player_progression_trophy_and_ranked.md) | 공식 지원 · 수정일 미표기 |
| 65 | [What's New? — Merge Tactics](https://support.clashroyale.com/hc/en-us/articles/50816352380443-What-s-New-Merge-Tactics) | M28 | [16](16_merge_tactics.md) | 공식 지원 · 수정일 미표기 |
| 66 | [What's New? – September 2026](https://support.clashroyale.com/hc/en-us/articles/54836231287963-What-s-New-September-2026) | C19 | [06](06_damage_and_status_effects.md) | 공식 지원 · 수정일 미표기 |
| 67 | [What's New? – November 2026](https://support.clashroyale.com/hc/en-us/articles/57579150651419-What-s-New-November-2026) | C11, R14 | [03](03_elixir_hand_and_cycle.md), [06](06_damage_and_status_effects.md), [17](17_uiux_and_onboarding.md) | 공식 지원 · 수정일 미표기 |
| 68 | [Card Evolution](https://support.supercell.com/clash-royale/en/articles/card-evolution-8.html) | E03 | [08](08_evolutions_champions_heroes_towers.md) | 공식 지원 · 수정일 미표기 |
| 69 | [Card Mastery](https://support.supercell.com/clash-royale/en/articles/card-mastery-4.html) | E27 | [09](09_collection_and_card_progression.md) | 공식 지원 · 수정일 미표기 |
| 70 | [Champions](https://support.supercell.com/clash-royale/en/articles/champions-10.html) | C07 | [03](03_elixir_hand_and_cycle.md) | 공식 지원 · 수정일 미표기 |
| 71 | [Daily Battle Rewards](https://support.supercell.com/clash-royale/en/articles/daily-battle-rewards-3.html) | E18 | [12](12_economy_rewards_and_monetization.md) | 공식 지원 · 수정일 미표기 |
| 72 | [Lucky Chests & Boxes](https://support.supercell.com/clash-royale/en/articles/lucky-chests-6.html) | E20 | [12](12_economy_rewards_and_monetization.md) | 공식 지원 · 수정일 미표기 |
| 73 | [Tower Troops](https://support.supercell.com/clash-royale/en/articles/tower-troops-4.html) | E06 | [07](07_cards_and_deck_building.md), [08](08_evolutions_champions_heroes_towers.md), [09](09_collection_and_card_progression.md) | 공식 지원 · 수정일 미표기 |
| 74 | [GDC 2017: Quest for the Healthy Metagame](https://www.gdcvault.com/play/1024272/Quest-for-the-Healthy-Metagame) | — | [18](18_live_balance_and_analytics.md) | 개발자 발표 소개 페이지만 확인 |

## 8. 갱신 기록 권장 양식

| 항목 | 기록 예시 형식 |
|---|---|
| 대상 | 파일·절·규칙 필드 |
| 이전 해석 | 과거 규칙과 근거 날짜 |
| 신규 근거 | 공식 URL·게시일·적용일 |
| 관찰 | 모드·버전·계정 조건·직접 실측 여부 |
| 변경 | 바꾼 문장·수치·데이터 정책 |
| 영향 | 연결된 문서·QA·리플레이 버전 |
| 불확실성 | 남은 예외와 확인 방법 |

[전체 목차](00_README.md)

## 2026-11-17 확장: 2026-11-17 재구축 출처·버전 추가

새 데이터의 출처 레코드는 [카드·패치](data/sources/card_sources.json), [전투](data/sources/combat_sources.json), [성장·경제](data/sources/economy_sources.json), [모드·소셜](data/sources/modes_sources.json)4개 파일에 있다. 71개 출처 레코드는 여러 도메인에서 같은 URL을 참조할 수 있으므로71개의 서로 다른 페이지라는 뜻은 아니다. [검증 보고서](reports/validation_report.md)에서 고유 URL수를 확인한다. 나무위키 본문은 이번에도 도구에서 열리지 않아 내용을 확인한 근거로 사용하지 않았다. 역사 자료의 원본/선별본 해시는 [스냅샷 manifest](data/snapshot_manifest.json), 현재 미확정·관측 과제는 [33번](33_observation_protocol_and_reconstruction_backlog.md)을 따른다.
