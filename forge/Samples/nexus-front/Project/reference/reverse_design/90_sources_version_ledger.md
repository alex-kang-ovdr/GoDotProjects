# 90. 출처·버전·검증 장부

[문서 목록](00_README.md) · [용어집](91_glossary.md)

## 1. 조사 기준

| 항목 | 기준 |
| --- | --- |
| 조사일 | 2026-11-13, 사용자 한국 시간 기준 날짜 |
| 주 대상 | PC판 League of Legends, 소환사의 협곡 5대5 |
| 최신 확인 공식 본편 노트 | [26.22](https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-22-notes/), 2026-11-03 게시 |
| 예정 패치와의 구분 | 공식 [패치 일정](https://support.riotgames.com/en-us/league-of-legends/gameplay/patch-schedule-league-of-legends)의 조사일 이후 항목은 현재 규칙으로 사용하지 않음 |
| 조사 방식 | 공개 웹 문서 검색·열람과 시스템별 교차검토 |
| 실제 게임 계측 | 수행하지 않음. 검증표는 향후 실행할 수용 시나리오 |
| 내부 코드·패킷 | 비공개 구현을 확인하거나 복원한 것으로 주장하지 않음 |
| 수치의 현재성 | 개별 항목의 인용 시점·모드·지역을 따름 |

현재 확인 가능한 자료의 최신성과, 실제 실행 클라이언트의 모든 상수를 검증했다는 주장은 별개다. 본 문서군은 시스템 역기획에 필요한 사실과 해석의 추적성을 우선한다.

## 2. 사용자가 제공한 자료의 처리

제공 주소: [나무위키 — 리그 오브 레전드](https://namu.wiki/w/%EB%A6%AC%EA%B7%B8%20%EC%98%A4%EB%B8%8C%20%EB%A0%88%EC%A0%84%EB%93%9C).

이번 조사에서 해당 본문을 열지 못했다. 문서를 읽었다고 표시하거나 내용을 인용하지 않았다. 해당 URL은 사용자가 지정한 출발 자료로 보존하고, 실제 근거는 열람 가능한 공식 자료 등으로 구성했다.

## 3. 근거의 종류와 사용 원칙

| 종류 | 유효한 사용 | 제한 |
| --- | --- | --- |
| 공식 패치 노트 | 특정 패치의 도입·변경·삭제 | 이후 패치 유지 여부를 자동 보장하지 않음 |
| 공식 지원 문서 | 현재 공개된 이용 흐름·정책 | 지역·수정 시점·본문 잔존 오류 확인 필요 |
| 공식 게임 안내 | 기본 개념과 플레이 목표 | 세부 예외·현행 전체 상수의 근거로 부족 |
| 공식 개발 블로그 | 설계 의도·당시 개발 선택 | 예고가 실제 적용과 다를 수 있음 |
| 공식 기술 블로그 | 공개 당시 아키텍처 사례 | 현재 전체 구현과 동일하다고 단정 불가 |
| 공개 개발자 데이터 | 정적 콘텐츠·공개 인터페이스 | 실행 규칙·핫픽스·비공개 순서의 완전한 명세가 아님 |
| 보조 커뮤니티 문서 | 공식 설명이 부족한 용어·구성 보완 | 공식 또는 직접 실측과 구분 |
| 저자의 분석 | 규칙의 목적·의사결정·트레이드오프 | 개발자의 실제 의도라고 단정하지 않음 |
| 재현 제안 | 데이터·이벤트·절차·테스트 설계 | Riot 내부 구조로 인용하지 않음 |

패치 글과 개발 예고가 다르면 실제 적용을 설명하는 자료를 우선한다. 같은 지원 문서 안에 충돌이 있으면 문단의 값들을 임의로 조합하지 않고 채택 근거와 남은 불확실성을 기록한다.

## 4. 버전 혼입을 방지한 주요 항목

아래는 모든 패치의 변경 이력이 아니라, 이번 역기획에서 혼동하기 쉬워 확인한 항목의 장부다. 세부 사실·수치는 담당 문서에 한 번 더 명시한다.

| 항목 | 확인한 자료·시점 | 문서 처리 | 담당 |
| --- | --- | --- | --- |
| 포지션 퀘스트 | 26.1 도입, 이후 관련 변경 | 포지션별 성장·슬롯 예외와 도입 시점 구분 | [02](02_champions_draft_roles.md), [06](06_items_shop_builds.md) |
| 치명타 기본값 | 26.1 도입 | 모든 챔피언·공격의 불변 배율로 사용하지 않음 | [03](03_combat_stats_damage.md) |
| 2025 에픽 목표 요소 | 26.1 제거 안내 | 아타칸·피의 장미 등을 현행 기본 목표로 재사용하지 않음 | [11](11_jungle_epic_objectives.md) |
| 요정불빛 | 26.1 도입, 26.3 조정 | 도입값과 후속 시야 변경 구분 | [09](09_vision_fog_information.md) |
| 유충·전령 | 25.09, 26.11 관련 변경 | 스폰 계보와 보상 변경을 따로 기록 | [11](11_jungle_epic_objectives.md) |
| 미니언 어그로 | 26.10 | 과거 행동을 전부 현재 우선순위로 유지하지 않음 | [10](10_lanes_minions_structures.md) |
| 중간 시즌 보상·구조물 | [26.16](https://www.leagueoflegends.com/ko-kr/news/game-updates/league-of-legends-patch-26-16-notes/) | 도입 패치의 장화·포탑 관련 값을 현행 전수표로 취급하지 않음 | [06](06_items_shop_builds.md), [10](10_lanes_minions_structures.md) |
| 키보드 이동 | WASD 지원 FAQ | Point & Click와 입력 모드·바인딩 차이를 구분 | [13](13_controls_movement_targeting.md) |
| 리메이크 | 지원 문서 상단·하단 충돌 | 상단 표·변경 자료와 구형 FAQ의 차이 표시 | [16](16_behavior_integrity_surrender.md) |
| 고티어 듀오 | 랭크 지원의 KR 별도 항목 | 글로벌 규칙을 한국에 일괄 적용하지 않음 | [15](15_matchmaking_ranked_social.md) |
| Aegis | 개발 예고와 현행 지원 차이 | 두 시점의 조건·보상을 합치지 않음 | [15](15_matchmaking_ranked_social.md) |
| 계정 보상 경로 | BE·XP 지원 | 과거 레벨업 보상을 현재 공통 규칙으로 고정하지 않음 | [17](17_account_progression_collection.md) |
| ARAM 선택 | 모드 지원 | 과거 재주사위 설명과 챔피언 카드 흐름 구분 | [19](19_modes_practice_custom.md) |
| 신속 대전 | 모드 지원 | 같은 맵의 성장·목표 규칙을 일반 협곡과 분리 | [19](19_modes_practice_custom.md) |
| 연습 모드 | 25.S1.1·25.21 | 다인 참가와 솔로 전챔피언 사용 조건 분리 | [19](19_modes_practice_custom.md) |
| 성소·환불 | 한국어·영문 지원 | 보장 카운터 계열·지역 정책 차이 구분 | [18](18_monetization_live_service.md) |
| 과거 규칙 모드 | Classic 지원·26.22 | 별도 모드의 룬·아이템을 본편에 섞지 않음 | [19](19_modes_practice_custom.md) |
| 결정적 재생 | Riot 2017 기술 공개 | 고정 틱·전체 클라이언트 락스텝과 구분 | [20](20_network_data_architecture.md) |

## 5. 공식 문서 충돌을 처리한 사례

### 5.1 리메이크

[공식 지원](https://support.riotgames.com/en-us/league-of-legends/gameplay/remake-faq)의 시간표와 뒤쪽 설명에 서로 다른 시간 표현이 함께 남아 있다. 16번 문서는 채택한 표의 기준과 잔존 설명을 명시한다. 출처 하나에 적혀 있다는 이유만으로 상충하는 규칙 둘을 모두 현재로 적용하지 않는다.

### 5.2 지역 정책

매칭 참여 조건과 상점 정책은 지역 차이가 중요하다. 한국 자료가 별도로 설명하는 항목을 글로벌 지원 설명으로 덮어쓰지 않는다. 반대로 한국에만 있는 조건을 전체 지역의 공통 규칙으로 확대하지 않는다.

### 5.3 예고·도입·후속 변경

개발 예고는 왜 변경하려는지 설명하는 근거다. 도입 패치는 실제로 무엇을 변경했는지의 근거다. 후속 패치는 변경 후 조정을 보여 준다. 이 세 자료를 같은 날짜의 단일 규칙으로 합치지 않는다.

## 6. 확인하지 않은 내부 사항

| 항목 | 확정하지 않은 이유 | 문서에서의 처리 |
| --- | --- | --- |
| MMR 갱신 공식·매칭 가중치 | 비공개 세부 평가 | 목적·입출력·트레이드오프 분석 |
| 제재 탐지 기준·가중치 | 비공개 판단 절차 | 공개 정책과 탐지 설계 제안 분리 |
| 현재 서버 틱·패킷 형식 | 공개 근거로 현행 전수 확인 불가 | 특정 구현 상수 미제시 |
| 피해·효과의 모든 적용 순서 | 스킬·대상·패치 예외 | 제한된 검산 모델·검증 과제 |
| 치명타 난수 보정 | 정확한 현행 알고리즘 미확인 | 독립 시행은 기대값 설명용 가정 |
| 전 아이템·챔피언 수치 | 전수 데이터 추출·실측 미수행 | 시스템과 대표 사례 중심 |
| 모든 플랫폼·지역 운영 상태 | 실접속·계정 확인 미수행 | 공개 문서의 지역·모드 범위 유지 |
| 원작 봇 의사결정 코드 | 공개 구현 근거 부족 | 교육 목적 분석과 제안으로 한정 |

## 7. 재현 제안의 표기 규칙

자료구조, 상태명, 이벤트명은 문서의 논리를 설명하기 위해 작성했다. `AbilityDefinition`, `MatchEnded`, `EconomyRules`처럼 그럴듯한 이름을 사용했다고 실제 Riot 클래스·메시지명인 것은 아니다.

가상 계산은 입력과 가정을 함께 둔다. 보호막·음수 방어·시전 시점 스냅샷·대상별 예외를 생략한 계산이 실제 게임의 모든 상황을 정확히 재현한다고 주장하지 않는다.

검증표는 시행한 테스트 결과가 아니라 구현 시 확인할 수용 기준이다. “통과”나 “측정 완료”처럼 실행 사실을 뜻하는 표현으로 바꾸지 않는다.

## 8. 문서를 갱신하는 절차

1. 대상 지역·큐·모드·클라이언트 버전을 먼저 고정한다.
2. 바뀐 시스템의 공식 노트·지원 문서와 후속 수정 내용을 읽는다.
3. 규칙 값과 설계 해석을 분리해 수정한다.
4. 영향을 받는 다른 시스템과 UI·데이터·검증표를 확인한다.
5. 문서의 확인 날짜와 적용 범위를 갱신한다.
6. 이전 설명을 현재 규칙과 혼합하지 않고 필요한 경우 변경 계보로 남긴다.

## 9. 전체 출처 색인

다음 색인은 각 시스템 문서에 포함된 외부 출처를 URL 기준으로 모은 것이다. 같은 문서의 언어·지역판은 원래 URL을 유지한다. 아래 번호는 검색을 위한 전역 색인이며, 각 파일의 `[C…]`, `[W…]`, `[M…]` 등 로컬 인용 번호를 대체하지 않는다.

<!-- SOURCE_INDEX_START -->

본문 01~22에서 연결한 고유 외부 URL은 **85개**다. 아래 URL의 열람일은 모두 2026-11-13이다. 보조 자료를 검색 발췌로만 확인한 경우 해당 문서 말미의 접근 한계를 따른다.

| 색인 | 자료 | 종류 | 인용한 본문 |
| --- | --- | --- | --- |
| SRC-001 | [League of Legends How to Play](https://www.leagueoflegends.com/en-us/how-to-play/) | 공식 게임·패치·개발 | [01](01_core_match_loop.md), [02](02_champions_draft_roles.md), [04](04_abilities_status_effects.md), [05](05_economy_experience.md), [06](06_items_shop_builds.md), [07](07_runes_summoner_spells.md), [08](08_map_terrain_navigation.md), [10](10_lanes_minions_structures.md), [11](11_jungle_epic_objectives.md), [13](13_controls_movement_targeting.md) |
| SRC-002 | [League of Legends Patch 26.22 Notes](https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-22-notes/) | 공식 게임·패치·개발 | [01](01_core_match_loop.md), [06](06_items_shop_builds.md), [19](19_modes_practice_custom.md) |
| SRC-003 | [Patch Schedule – League of Legends](https://support.riotgames.com/en-us/league-of-legends/gameplay/patch-schedule-league-of-legends) | 공식 지원 | [01](01_core_match_loop.md) |
| SRC-004 | [Choosing the Right Champion](https://support-leagueoflegends.riotgames.com/hc/en-us/articles/201752864-Choosing-the-Right-Champion) | 공식 지원 | [02](02_champions_draft_roles.md) |
| SRC-005 | [Annie](https://www.leagueoflegends.com/en-us/champions/annie/) | 공식 게임·패치·개발 | [02](02_champions_draft_roles.md) |
| SRC-006 | [Lux](https://www.leagueoflegends.com/en-us/champions/lux/) | 공식 게임·패치·개발 | [02](02_champions_draft_roles.md) |
| SRC-007 | [Garen](https://www.leagueoflegends.com/en-us/champions/garen/) | 공식 게임·패치·개발 | [02](02_champions_draft_roles.md) |
| SRC-008 | [Ask Riot: Three refunds; 10 bans](https://nexus.leagueoflegends.com/en-us/2017/01/ask-riot-three-refunds-10-bans/) | 공식 게임·패치·개발 | [02](02_champions_draft_roles.md) |
| SRC-009 | [Patch 12.23 notes](https://www.leagueoflegends.com/en-us/news/game-updates/patch-12-23-notes/) | 공식 게임·패치·개발 | [02](02_champions_draft_roles.md), [07](07_runes_summoner_spells.md) |
| SRC-010 | [Patch 26.1 Notes](https://www.leagueoflegends.com/en-us/news/game-updates/patch-26-1-notes/) | 공식 게임·패치·개발 | [02](02_champions_draft_roles.md), [03](03_combat_stats_damage.md), [06](06_items_shop_builds.md), [09](09_vision_fog_information.md), [11](11_jungle_epic_objectives.md), [16](16_behavior_integrity_surrender.md) |
| SRC-011 | [26.16 패치 노트](https://www.leagueoflegends.com/ko-kr/news/game-updates/league-of-legends-patch-26-16-notes/) | 공식 게임·패치·개발 | [02](02_champions_draft_roles.md) |
| SRC-012 | [Patch 10.23 notes](https://www.leagueoflegends.com/en-au/news/game-updates/patch-10-23-notes/) | 공식 게임·패치·개발 | [03](03_combat_stats_damage.md) |
| SRC-013 | [Riot Developer Portal — League of Legends](https://developer.riotgames.com/docs/lol) | 공식 개발자 문서 | [03](03_combat_stats_damage.md), [20](20_network_data_architecture.md) |
| SRC-014 | [Crowd control](https://wiki.leagueoflegends.com/en-us/Crowd_control) | 커뮤니티 보조 | [04](04_abilities_status_effects.md) |
| SRC-015 | [Tenacity](https://wiki.leagueoflegends.com/en-us/Tenacity) | 커뮤니티 보조 | [04](04_abilities_status_effects.md) |
| SRC-016 | [Morgana](https://www.leagueoflegends.com/en-us/champions/morgana/) | 공식 게임·패치·개발 | [04](04_abilities_status_effects.md) |
| SRC-017 | [Jhin](https://www.leagueoflegends.com/en-us/champions/jhin/) | 공식 게임·패치·개발 | [04](04_abilities_status_effects.md) |
| SRC-018 | [Leona](https://www.leagueoflegends.com/en-us/champions/leona/) | 공식 게임·패치·개발 | [04](04_abilities_status_effects.md) |
| SRC-019 | [/dev: Season 2 Gameplay Changes Preview](https://www.leagueoflegends.com/en-gb/news/dev/dev-season-2-gameplay-changes-preview/) | 공식 게임·패치·개발 | [05](05_economy_experience.md) |
| SRC-020 | [Patch 25.09 Notes](https://www.leagueoflegends.com/en-us/news/game-updates/patch-25-09-notes/) | 공식 게임·패치·개발 | [05](05_economy_experience.md), [11](11_jungle_epic_objectives.md) |
| SRC-021 | [Patch 14.1 Notes](https://www.leagueoflegends.com/en-us/news/game-updates/patch-14-1-notes/) | 공식 게임·패치·개발 | [06](06_items_shop_builds.md) |
| SRC-022 | [Quick Gameplay Thoughts: Addressing Mythics](https://www.leagueoflegends.com/en-au/news/dev/quick-gameplay-thoughts-addressing-mythics/) | 공식 게임·패치·개발 | [06](06_items_shop_builds.md) |
| SRC-023 | [Item Sets](https://support.riotgames.com/en-us/league-of-legends/gameplay/item-sets) | 공식 지원 | [06](06_items_shop_builds.md) |
| SRC-024 | [Ornn](https://www.leagueoflegends.com/en-us/champions/ornn/) | 공식 게임·패치·개발 | [06](06_items_shop_builds.md) |
| SRC-025 | [Preseason Update — Runes Reforged](https://na.leagueoflegends.com/en/featured/preseason-update) | 공식 게임·패치·개발 | [07](07_runes_summoner_spells.md) |
| SRC-026 | [Runes Reforged](https://wiki.leagueoflegends.com/en-us/Runes_Reforged) | 커뮤니티 보조 | [07](07_runes_summoner_spells.md) |
| SRC-027 | [2025.S1.1 패치 노트](https://www.leagueoflegends.com/ko-kr/news/game-updates/patch-25-s1-1-notes/) | 공식 게임·패치·개발 | [07](07_runes_summoner_spells.md) |
| SRC-028 | [Summoner spell](https://wiki.leagueoflegends.com/en-us/Summoner_spell) | 커뮤니티 보조 | [07](07_runes_summoner_spells.md) |
| SRC-029 | [Flash](https://wiki.leagueoflegends.com/en-us/Flash) | 커뮤니티 보조 | [07](07_runes_summoner_spells.md) |
| SRC-030 | [Ghost](https://wiki.leagueoflegends.com/en-us/Ghost) | 커뮤니티 보조 | [07](07_runes_summoner_spells.md) |
| SRC-031 | [Heal](https://wiki.leagueoflegends.com/en-us/Heal) | 커뮤니티 보조 | [07](07_runes_summoner_spells.md) |
| SRC-032 | [Ignite](https://wiki.leagueoflegends.com/en-us/Ignite) | 커뮤니티 보조 | [07](07_runes_summoner_spells.md) |
| SRC-033 | [Patch 14.10 Notes](https://www.leagueoflegends.com/en-us/news/game-updates/patch-14-10-notes/) | 공식 게임·패치·개발 | [07](07_runes_summoner_spells.md) |
| SRC-034 | [Runes Reforged — Fleet Footwork](https://na.leagueoflegends.com/en/featured/preseason-update/8000-8021?build=02000123) | 공식 게임·패치·개발 | [07](07_runes_summoner_spells.md) |
| SRC-035 | [/dev: Season 2024 Map Changes](https://www.leagueoflegends.com/en-us/news/dev/dev-season-2024-map-changes/) | 공식 게임·패치·개발 | [08](08_map_terrain_navigation.md) |
| SRC-036 | [A Story of Fog and War](https://www.riotgames.com/en/news/story-fog-and-war) | 공식 기술·개발 | [09](09_vision_fog_information.md) |
| SRC-037 | [2017 Season Update — Assassins / Stealth Mechanics](https://na.leagueoflegends.com/en/featured/preseason-2017/assassins) | 공식 게임·패치·개발 | [09](09_vision_fog_information.md) |
| SRC-038 | [Patch 26.3 Notes](https://www.leagueoflegends.com/en-us/news/game-updates/patch-26-3-notes/) | 공식 게임·패치·개발 | [09](09_vision_fog_information.md) |
| SRC-039 | [Ask Riot: Yasuo Gets Banned](https://nexus.leagueoflegends.com/en-us/2017/06/ask-riot-yasuo-gets-banned/) | 공식 게임·패치·개발 | [09](09_vision_fog_information.md) |
| SRC-040 | [/dev: 2026 Season One Gameplay Preview](https://www.leagueoflegends.com/en-gb/news/dev/dev-2026-season-one-gameplay-preview/) | 공식 게임·패치·개발 | [10](10_lanes_minions_structures.md), [12](12_team_macro_strategy.md) |
| SRC-041 | [League of Legends Patch 26.10 Notes](https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-10-notes/) | 공식 게임·패치·개발 | [10](10_lanes_minions_structures.md) |
| SRC-042 | [/dev: 2025 Season One Gameplay Preview](https://www.leagueoflegends.com/en-gb/news/dev/dev-2025-season-one-gameplay-preview/) | 공식 게임·패치·개발 | [10](10_lanes_minions_structures.md) |
| SRC-043 | [League of Legends Patch 26.11 Notes](https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-11-notes/) | 공식 게임·패치·개발 | [11](11_jungle_epic_objectives.md) |
| SRC-044 | [Patch 9.23 Notes](https://www.leagueoflegends.com/en-us/news/game-updates/patch-9-23-notes/) | 공식 게임·패치·개발 | [11](11_jungle_epic_objectives.md) |
| SRC-045 | [Patch 14.3 Notes](https://www.leagueoflegends.com/en-us/news/game-updates/patch-14-3-notes/) | 공식 게임·패치·개발 | [11](11_jungle_epic_objectives.md) |
| SRC-046 | [Keyboard (WASD) Input FAQ](https://support.riotgames.com/en-us/league-of-legends/gameplay/league-of-legends-keyboard-wasd-input-faq) | 공식 지원 | [13](13_controls_movement_targeting.md) |
| SRC-047 | [/dev: WASD’s Ranked Release](https://www.leagueoflegends.com/en-us/news/dev/dev-wasds-ranked-release/) | 공식 게임·패치·개발 | [13](13_controls_movement_targeting.md) |
| SRC-048 | [Hotkeys (Keybindings) FAQ](https://support.riotgames.com/en-us/league-of-legends/performance/hotkeys-keybindings-faq) | 공식 지원 | [13](13_controls_movement_targeting.md) |
| SRC-049 | [Clarity in League](https://www.leagueoflegends.com/en-us/news/dev/clarity-in-league/) | 공식 게임·패치·개발 | [14](14_ui_feedback_replays.md) |
| SRC-050 | [Smart Ping](https://support.riotgames.com/zh-cn/league-of-legends/gameplay/smart-ping) | 공식 지원 | [14](14_ui_feedback_replays.md) |
| SRC-051 | [Replays FAQ & Pro-Tips](https://support.riotgames.com/en-us/league-of-legends/gameplay/replays-faq-pro-tips) | 공식 지원 | [14](14_ui_feedback_replays.md) |
| SRC-052 | [Engineering Esports: The Tech That Powers Worlds](https://www.riotgames.com/en/news/engineering-esports-tech-powers-worlds) | 공식 기술·개발 | [14](14_ui_feedback_replays.md) |
| SRC-053 | [MMR, Rank, and LP](https://support.riotgames.com/en-us/league-of-legends/gameplay/mmr-rank-and-lp) | 공식 지원 | [15](15_matchmaking_ranked_social.md) |
| SRC-054 | [Matchmaking and Autofill](https://support.riotgames.com/en-us/league-of-legends/gameplay/matchmaking-and-autofill/) | 공식 지원 | [15](15_matchmaking_ranked_social.md) |
| SRC-055 | [Ranked Tiers, Divisions, and Queues](https://support.riotgames.com/en-us/league-of-legends/gameplay/ranked-tiers-divisions-and-queues) | 공식 지원 | [15](15_matchmaking_ranked_social.md) |
| SRC-056 | [Placements, Promotions, Series, Demotions, and Decay](https://support.riotgames.com/en-us/league-of-legends/gameplay/placements-promotions-series-demotions-and-decay) | 공식 지원 | [15](15_matchmaking_ranked_social.md) |
| SRC-057 | [Parties and Voice Chat FAQ](https://support.riotgames.com/en-us/league-of-legends/gameplay/parties-and-voice-chat-faq) | 공식 지원 | [15](15_matchmaking_ranked_social.md) |
| SRC-058 | [Away From Keyboard (AFK) FAQ](https://support.riotgames.com/en-us/league-of-legends/penalties/away-from-keyboard-afk-faq/) | 공식 지원 | [16](16_behavior_integrity_surrender.md) |
| SRC-059 | [Queue Dodging](https://support.riotgames.com/en-us/league-of-legends/gameplay/queue-dodging) | 공식 지원 | [16](16_behavior_integrity_surrender.md) |
| SRC-060 | [/Remake FAQ](https://support.riotgames.com/en-us/league-of-legends/gameplay/remake-faq) | 공식 지원 | [16](16_behavior_integrity_surrender.md) |
| SRC-061 | [Disruptive Behavior Repair](https://support.riotgames.com/en-us/league-of-legends/security/disruptive-behavior-repair) | 공식 지원 | [16](16_behavior_integrity_surrender.md) |
| SRC-062 | [League of Legends Honor Guide](https://support.riotgames.com/en-us/league-of-legends/rewards/league-of-legends-honor-guide) | 공식 지원 | [16](16_behavior_integrity_surrender.md) |
| SRC-063 | [Riot Vanguard FAQ (League of Legends)](https://support.riotgames.com/en-us/league-of-legends/performance/riot-vanguard-faq-league-of-legends) | 공식 지원 | [16](16_behavior_integrity_surrender.md) |
| SRC-064 | [Chat Commands](https://support.riotgames.com/en-us/league-of-legends/gameplay/chat-commands) | 공식 지원 | [16](16_behavior_integrity_surrender.md) |
| SRC-065 | [Reward (BE/XP) System Breakdown](https://support.riotgames.com/en-us/league-of-legends/rewards/reward-bexp-system-breakdown) | 공식 지원 | [17](17_account_progression_collection.md) |
| SRC-066 | [Unlocking Game Modes](https://support.riotgames.com/en-us/league-of-legends/gameplay/unlocking-game-modes) | 공식 지원 | [17](17_account_progression_collection.md), [19](19_modes_practice_custom.md) |
| SRC-067 | [Champion Mastery Guide](https://support.riotgames.com/en-us/league-of-legends/rewards/champion-mastery-guide) | 공식 지원 | [17](17_account_progression_collection.md) |
| SRC-068 | [Challenges FAQ — League of Legends](https://support.riotgames.com/en-us/league-of-legends/gameplay/challenges-faq-league-of-legends) | 공식 지원 | [17](17_account_progression_collection.md) |
| SRC-069 | [Hextech Crafting Glossary](https://support.riotgames.com/en-us/league-of-legends/rewards/hextech-crafting-faq) | 공식 지원 | [17](17_account_progression_collection.md), [18](18_monetization_live_service.md) |
| SRC-070 | [League of Legends — Season 3: Worlds 2026](https://support.riotgames.com/en-us/league-of-legends/events/league-of-legends-season-3-worlds-2026) | 공식 지원 | [18](18_monetization_live_service.md) |
| SRC-071 | [성소](https://support.riotgames.com/ko-kr/league-of-legends/store/the-sanctum) | 공식 지원 | [18](18_monetization_live_service.md) |
| SRC-072 | [신화급 상점 및 신화 정수 FAQ](https://support.riotgames.com/ko-kr/league-of-legends/rewards/mythic-shop-and-mythic-essence-faq/) | 공식 지원 | [18](18_monetization_live_service.md) |
| SRC-073 | [Global Refund Policy](https://www.riotgames.com/en/global-refund-policy) | 공식 기술·개발 | [18](18_monetization_live_service.md) |
| SRC-074 | [Swiftplay Game Mode](https://support.riotgames.com/en-us/league-of-legends/gameplay/swiftplay-game-mode) | 공식 지원 | [19](19_modes_practice_custom.md) |
| SRC-075 | [ARAM Game Mode](https://support.riotgames.com/en-us/league-of-legends/gameplay/aram-game-mode) | 공식 지원 | [19](19_modes_practice_custom.md) |
| SRC-076 | [League of Legends — Arena Game Mode](https://support.riotgames.com/en-us/league-of-legends/gameplay/league-of-legends-arena-game-mode) | 공식 지원 | [19](19_modes_practice_custom.md) |
| SRC-077 | [Patch 25.S1.1 Notes](https://www.leagueoflegends.com/en-au/news/game-updates/patch-25-s1-1-notes/) | 공식 게임·패치·개발 | [19](19_modes_practice_custom.md) |
| SRC-078 | [Patch 25.21 Notes](https://www.leagueoflegends.com/en-us/news/game-updates/patch-25-21-notes/) | 공식 게임·패치·개발 | [19](19_modes_practice_custom.md) |
| SRC-079 | [League of Legends Classic](https://support.riotgames.com/en-us/league-of-legends/gameplay/welcome-to-league-of-legends-classic) | 공식 지원 | [19](19_modes_practice_custom.md) |
| SRC-080 | [Determinism in League of Legends: Introduction](https://www.riotgames.com/en/news/determinism-league-legends-introduction) | 공식 기술·개발 | [20](20_network_data_architecture.md) |
| SRC-081 | [Determinism in League of Legends: Implementation](https://www.riotgames.com/en/news/determinism-league-legends-implementation) | 공식 기술·개발 | [20](20_network_data_architecture.md) |
| SRC-082 | [Determinism in League of Legends: Unified Clock](https://www.riotgames.com/en/news/determinism-league-legends-unified-clock) | 공식 기술·개발 | [20](20_network_data_architecture.md) |
| SRC-083 | [/dev: Champion Balance Framework](https://www.leagueoflegends.com/en-us/news/dev/dev-champion-balance-framework/) | 공식 게임·패치·개발 | [21](21_balance_analytics_quality.md) |
| SRC-084 | [Automated Testing for League of Legends](https://www.riotgames.com/en/news/automated-testing-league-legends) | 공식 기술·개발 | [21](21_balance_analytics_quality.md) |
| SRC-085 | [Profiling: Real World Performance in League](https://www.riotgames.com/en/news/profiling-real-world-performance-league) | 공식 기술·개발 | [21](21_balance_analytics_quality.md) |

색인은 URL의 사용 위치를 찾기 위한 도구다. 각 링크가 문서의 모든 제안·가상 사례를 공식 사실로 뒷받침한다는 의미는 아니다.
