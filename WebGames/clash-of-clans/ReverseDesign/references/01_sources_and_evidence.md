# 출처 카탈로그와 근거 사용 기준

> 기준일: 2026-11-13 KST. 공식 블로그·지원 자료의 URL, 발표일, 확인 범위와 주의점을 기록했다. 본문은 원문 번역·복제가 아니라 규칙의 재구성과 독립적인 설계 분석이다.

## 1. 출처 구성

- 중복 URL을 합친 항목: **91개**. 이 중 확인에 사용한 공식 출처 URL은 **90개**다.
- 나무위키는 사용자가 지정한 참고 대상으로 남겼으나 직접 열람에 실패하여 사실 근거로 사용하지 않았다.
- 같은 내용의 지원 페이지가 기존 support 도메인과 공식 Zendesk 경로에 각각 있는 경우 URL별로 기록했다. 따라서 URL 수는 독립적인 원전 개수나 검증된 주장 개수와 같지 않다.
- 발표일이 없는 지원 페이지는 `발표일 미표기`로 적었다. 열람일이 곧 기능 적용일이라는 뜻은 아니다.
- 검색 결과의 공식 본문 추출로 확인한 페이지와 직접 열람이 제한된 페이지는 주의점에 구분했다.
- 기획 해석·데이터 스키마·의사코드·운영 지표·QA는 원작 내부 자료가 아니라 재구현 제안이다.

## 2. 전체 목록

| ID | 자료 | 발표일 | 확인 범위 | 주의점 |
|---|---|---|---|---|
| S001 | [June Update - Bugs & Fixes](https://supercell.com/en/games/clashofclans/blog/news/june-update-bugs-fixes/) | 2019-06-19 | 연습모드의 개인군대·업적 누출 오류사례 | 역사적 오류 사례; 당시 랭크 규칙을 현행으로 쓰지 않음 |
| S002 | [Spring Update Full Release Notes](https://supercell.com/en/games/clashofclans/blog/news/the-spring-update-is-here-2/) | 2020-03-30 | 지원 AI·재타깃 변경 이력; 벽 파괴 후 AI 수정 | 슈퍼 유닛 최초 7일·1종·쿨다운 및 훈련 비용은 구 규칙. 내부 AI 알고리즘을 공개한 문서가 아님. |
| S003 | [Super Troops Changes & New Magic Item!](https://supercell.com/en/games/clashofclans/blog/game-updates/new-super-potion/) | 2020-11-23 | 슈퍼 유닛 7일→3일·1종→2종의 변경 이력 | 당시 포션 상점 가격·이벤트 특례는 현행값으로 쓰지 않음. |
| S004 | [Full Patch Notes - TH14 Update](https://supercell.com/en/games/clashofclans/blog/release-notes/full-patch-notes-th14-update/) | 2021-04-11 | 연구소 건물 업그레이드 중 진행 연구 지속; 새 연구 시작 제한; 연습TH레벨해제·XP분리 | 2021 정식 패치. 현재 후속 변경이 없는지 구현 전 재검증.; 역사적 변경근거; 당시 다른 수치는 현행 아님 |
| S005 | [Home Village Changes](https://supercell.com/en/games/clashofclans/blog/news/home-village-changes-2/) | 2022-06-26 | 병력·마법·시즈 훈련 자원 비용 제거; 본마을 훈련 재화 비용 제거 | 당시 남아 있던 훈련 시간은 2025년에 제거됨.; 훈련 시간은 당시 유지됐지만 2025 패치에서 제거됐으므로 당시 시간 설명은 현행으로 쓰지 않음. |
| S006 | [Full Release Notes — Town Hall 15](https://supercell.com/en/games/clashofclans/blog/release-notes/full-release-notes-2/) | 2022-10-10 | Recall 개념·상태 보존; 모놀리스 HP 비례 피해; 마법 타워 기본 구조 | Recall 우선순위는 2026-04 영웅 우선으로 변경. 훈련 시간·당시 최고 레벨 제외. |
| S007 | [Builder Base 2.0: Layouts, Troop Levels and B.O.B!](https://supercell.com/en/games/clashofclans/blog/news/builder-base-2-0-layouts-troop-levels-and-bob/) | 2023-05-03 | 2단계 설계·새 병력의 최소해제레벨 | 2023마이그레이션 배치 초기화는 역사적 사례 |
| S008 | [Attacking and Defending in Builder Base 2.0!](https://supercell.com/en/games/clashofclans/blog/news/attacking-and-defending-in-builder-base-2-0/) | 2023-05-13 | 동별·은별·최대6별200%·구3승 보너스 개편 | 개편 당시 수치와 현재 Support를 교차 확인 |
| S009 | [Full Patch Notes: Town Hall 16](https://supercell.com/en/games/clashofclans/blog/release-notes/full-patch-notes-th16/) | 2023-12-12 | 자신의본마을·장인기지 친선도전 도입 | 당시 병력훈련시간은 현행에 적용하지 않음 |
| S010 | [Hero Equipment](https://supercell.com/en/games/clashofclans/blog/news/introducing-hero-equipment/) | 2023-12-12 | 영웅 고유 능력 분리; 장비 능동·지속 효과; 장비 2슬롯 | 2023 광석 보상·건설 비용·최고 레벨을 현행으로 복사하지 않음. |
| S011 | [February 2024 Update — Patch Notes](https://supercell.com/en/games/clashofclans/blog/release-notes/february-2024-update-patch-notes/) | 2024-02-27 | Overgrowth 기능·예외; 전투 중 장식·장애물 통과와 수도 예외 | 당시 마법 제조 시간과 레벨 수치는 현행값으로 사용하지 않음. |
| S012 | [Unlocking Unlimited Heroes — Community Event](https://supercell.com/en/games/clashofclans/blog/community/unlocking-unlimited-heroes-community-event/) | 2024-06-24 | 업그레이드 중 영웅 출전의 기간성 예외 사례 | 당시 영웅 회복 관련 문구는 2025 개편 이전. 이벤트를 상시 규칙으로 사용하지 않음. |
| S013 | [THE TOWN HALL 17 UPDATE IS HERE!](https://supercell.com/en/games/clashofclans/blog/game-updates/the-town-hall-17-update-is-here-2/) | 2024-11-25 | 회관 무기·사망 폭탄 변경; 항상 보이는 Giga Bomb; 방향성 Firespitter; Hero Hall 도입 | 당시 영웅 5종 설명은 현행 6종과 구분. 영웅 회관 초기 회관 조건도 이후 변경. |
| S014 | [A new Update is here!](https://supercell.com/en/games/clashofclans/blog/news/get-geared-up-for-the-latest-update--3/) | 2025-02-10 | Revive와 Phoenix 상호작용 수정 | 과거 Hard Mode·Starter Pass 설명은 전투 현행 규칙으로 가져오지 않음. |
| S015 | [Welcome to Clash Anytime Update!](https://supercell.com/en/games/clashofclans/blog/release-notes/welcome-to-clash-anytime-update/) | 2025-03-24 | 훈련 시간·영웅 회복 제거; Army Recipes; 당시 복제 기지 설명; 기부 비용; 훈련·영웅 회복 시간 제거; 군대 레시피; Sneezy; 훈련 준비 시간 제거; 영웅 회복 제거; 복제 마을 공급; 지원 시 엘릭서·다크엘릭서 비용과 요청 간격 10분 변경 | 공지일과 기능 적용 시점 구분. 트로피 설명은 이후 Ranked 개편 전 이력.; 발표의 옛 트로피·매치메이킹 수치는 현행 경쟁 구조에 복사하지 않음.; 발표와 실제 기능 활성화 시점 구분. 당시 리그 설명은 이후 2025-2026 개편으로 대체됨.; 병력 본인 훈련 무료와 클랜 지원 비용을 구분 |
| S016 | [Welcome to Let’s Get Crafty Update!](https://supercell.com/en/games/clashofclans/blog/release-notes/welcome-to-lets-get-crafty-update/) | 2025-06-16 | Cookbook 추천 레시피; Ice Block; 제작 방어 도입 | 첫 제작 단계의 시설·3개월 설명은 현재 단계와 구분. |
| S017 | [Battle and Ranked Modes Are Coming To Clash!](https://supercell.com/en/games/clashofclans/blog/news/battle-and-ranked-modes-are-coming-to-clash-/) | 2025-09-02 | 일반/경쟁 분리의 공식 설계 배경; TH 중심 일반 매칭 방향 | 도입 예고. 실제 적용은 2025-10-06 릴리스로 확인. |
| S018 | [Get Ready for Ranked! - Update](https://supercell.com/en/games/clashofclans/blog/release-notes/get-ready-for-ranked-update/) | 2025-10-06 | 일반/랭크 분리; Magic Shield; 복수 12시간과 Shadow Base; 구규칙 교체 | 이후 패치로 바뀐 항목은 현행 Support·2026 공지와 교차 확인. |
| S019 | [TOWN HALL 18 Crash Lands! — Update](https://supercell.com/en/games/clashofclans/blog/release-notes/town-hall-18-crash-lands-update/) | 2025-11-17 | TH18·가디언; Totem; Revenge Tower; Super Wizard Tower; 제작 방어 스냅샷 유지 | Revenge Tower 초기 발동 임계값·옛 리그 구조는 후속 패치로 변경됨. |
| S020 | [A Frost Age Has Come](https://supercell.com/en/games/clashofclans/blog/news/a-frost-age-has-come/) | 2025-12-01 | 해당 시즌 개인상한10000·추가보상4000 | 이 공지만으로10000을 영구규칙으로 단정하지 않음 |
| S021 | [Big Changes are coming to Gold Pass!](https://supercell.com/en/games/clashofclans/blog/news/big-changes-are-coming-to-gold-pass/) | 2026-02-16 | 2026-03 패스 개편; 누적 카드; 선택 노드; 시즌 시작 레벨로 보상 고정 | 과거 연속 구매 보너스 제거 문장을 현행 추가 카드 혜택 부재로 확대하지 않음. |
| S022 | [The February Update has escaped!](https://supercell.com/en/games/clashofclans/blog/release-notes/the-february-update-has-escaped/) | 2026-02-23 | Dragon Duke; Greedy Raven; Ranked 직전 전투 완료 요구; CWL5v5 도입·무승부 보상75% 변경 | Dragon Duke 최초 함정 피해 감소 비율은 후속 조정. 당시 리그 공격 횟수는 현행표에 복사하지 않음.; CWL 리그별 허용 규모와 5인 첫 배치 공식은 미확인 |
| S023 | [Big changes are coming to Ranked this April](https://supercell.com/en/games/clashofclans/blog/news/big-changes-are-coming-to-ranked-this-april/) | 2026-04-16 | 레전드 분리 설계 의도; Battle Modifiers와 경쟁 층 | 예고 자료이며 정식 적용은 4월27일 공지로 확인. |
| S024 | [THE SOUND OF CLASH UPDATE](https://supercell.com/en/games/clashofclans/blog/release-notes/the-sound-of-clash-update/) | 2026-04-27 | Legend III/II 주간·I 4주; 주간 전투 시작 UTC17시; 배치 적용 시점; 모든 광석 표현; CWL 확장; Sky Wagon; Logger; 업그레이드 중 영웅·펫 친선 사용; Recall 영웅 우선; Star Bonus의 all Ore types 표현; 지원문서와 적용 시점 비교; CWL Titan·Legend 확장; 업그레이드 영웅·펫의 친선 사용 | 세부 밸런스 계수는 이후 변경 가능. 배치·광석 설명은 다른 현행 Support와 충돌 기록.; Logger 초기 사거리·넉백은 7월 조정. 리그 관련 내용은 root 문서에서 별도 검증.; 광석별 TH·리그 지급량은 이 문서에서 수집하지 않음. 11월 예고와 혼합하지 않음.; 난이도 연결은2026-08패치로 다시 갱신됨 |
| S025 | [May Update](https://supercell.com/en/games/clashofclans/blog/release-notes/may-update/) | 2026-05-26 | 바바리안 킹 TH4 조기 해금 | 별도 지원 문서의 업그레이드·장비 해금 조건과 함께 읽어야 함. |
| S026 | [THE ANIME FURY UPDATE IS HERE](https://supercell.com/en/games/clashofclans/blog/release-notes/the-anime-fury-update-is-here/) | 2026-06-15 | 일부 전투 Live Fast Forward; 시간 도메인 분리의 공개 동작 근거; 파멸 마녀 잔해 타깃; Angry Spell 목표 정책; 장비 활성화 순서; 120초 후 Live Fast Forward; Hero Journey; 영웅 누적 성장 보상; 마이그레이션; 광석 경제 보정과 실험 | 시뮬레이션 아키텍처는 원작 내부 구조가 아니라 재구현 제안.; 파멸 마녀 도입 8기 상한은 8월 10기로 변경. Fast Forward는 일부 전투 유형. 기타 긴 원문 내용을 복제하지 않음.; 발표 당시 가격 실험이 기준일에도 동일하게 진행 중이라고 단정하지 않음. |
| S027 | [July Balance Update](https://supercell.com/en/games/clashofclans/blog/news/july-balance-update/) | 2026-07-09 | TH18 조합 집중과 대응 수단에 대한 개발팀 설명; Dragon Duke 함정 피해 감소 후속 조정; Logger 조정; 조합 집중도 기반 밸런스 해석 | 표본과 시점이 한정된 분석. 전체 게임 성공률로 일반화하지 않음.; 본문이 모든 최종 수치를 제시하지 않으므로 수치 추정 금지. |
| S028 | [August Update](https://supercell.com/en/games/clashofclans/blog/release-notes/august-update-3/) | 2026-08-30 | 파멸 기사 시간 HP 손실 제거·소환 10기; 토템 수용량 집계 수정; 회수 후 벽 끼임 수정; Revive 입력 개선; TH3 패스 테스트 배포; 장벽 링 유휴 장인 요구 제거; 전투 결과 화면; 장비 퀘스트 대체; CWL Titan I/II/III modifier 변경 | 신규 플레이어 대상 일부 기능은 단계적 테스트라고 원문에서 명시.; 9월 테스트 롤아웃 문구를 전 계정 적용 완료로 확대하지 않음.; 상세 modifier 수치는 해당 프로필과 현재 규칙을 함께 확인 |
| S029 | [We’ve revamped the Clash of Clans User Interface](https://supercell.com/en/games/clashofclans/blog/news/weve-revamped-the-clash-of-clans-user-interface/) | 2026-10-08 | Battle·Build UI 구조; 성장 탭; 문맥적 재화 표시; 잠금 안내 | 실제 단말을 직접 측정하지 않음. 필터 세션 유지 등 후속 개선은 빌드별 확인. |
| S030 | [Balance Changes Incoming: October 2026](https://supercell.com/en/games/clashofclans/blog/news/balance-changes-incoming-october-2026/) | 2026-10-17 | 밸런스 분석 대상 TH18대TH18 전쟁·CWL 최근4주; 선택률·성공률을 활용하는 설명 방식; TH18 대 TH18 전쟁·CWL 표본 조건; Fire Heart 성능 조정; Ruin Knight 수용량 20→18·스프링 대응; TH18 대 TH18 클랜전·CWL 표본; 장비 사용률·3별률 밸런스 근거 | 제목은 변경 예고. 발표된 계수를 적용 시점 확인 없이 현행 확정값으로 확대하지 않음.; 일반전·다른 회관·모든 실력대에 통계를 확대하지 않음.; 표본 제한·선택 편향을 감안하며 게임 전체 승률로 일반화하지 않음. |
| S031 | [Clash of Titans Is Hot Off The Press](https://supercell.com/en/games/clashofclans/blog/news/clash-of-titans-is-hot-off-the-press/) | 2026-11-01 | TH19 이달 중순 출시 예고; 2026년11월 시즌 범위; TH19 이달 중순 예고; 11월 시즌; 11월 도전 콘텐츠와 이벤트 일정 | TH19를 현행으로 단정하지 않음. 상세 이벤트 종료시각은 개별 공지를 우선.; 달력 날짜보다 개별 이벤트의 정확한 종료 시각을 우선.; 날짜별 예고와 현재 활성상태 분리 |
| S032 | [Hammer Jam Is Here: Backup Has Arrived!](https://supercell.com/en/games/clashofclans/blog/news/hammer-jam-is-here-backup-has-arrived/) | 2026-11-01 | 이벤트 비용·시간50%; Supercharge·Crafted Defenses 제외; 11월16일08UTC 종료 안내; 한시 할인·생산 강화; 대상 제외; 11월16일08UTC 종료 | 기간 한정 본마을 이벤트. 영구 비용표로 사용하지 않음.; 이벤트 수치를 평상시 경제에 적용하지 않음. 패스와 중첩 공식 미확인. |
| S033 | [Stars, Snacks and Showing Off](https://supercell.com/en/games/clashofclans/blog/news/stars-snacks-and-showing-off/) | 2026-11-10 | TH 연동 별 보너스·Snack Packs 예고; Ranked Medals·Prestige Shop·Emotes 예고; 11월16일주 획득·23일 첫 지급 예정 | 본문 말미 later this month. 기준일 현재 적용된 규칙으로 확정하지 않음. |
| S034 | [About Clan Games](https://support.supercell.com/clash-of-clans/en/articles/clan-games.html) | 발표일 미표기 | TH6·참가50인·첫과제등록·클랜이동잠금 | 등록과 최초 완료에 따른 보상자격을 구분 |
| S035 | [About Clan War Leagues](https://support.supercell.com/clash-of-clans/en/articles/about-cwl-3.html) | 발표일 미표기 | 시즌 로스터·클랜전과CWL 구분 | 15/30만 열거하는 부분은2026-02의5v5 도입보다 오래된 설명 |
| S036 | [About Heroes & Pets — Supercell Support](https://sc-clashofclans.zendesk.com/hc/en-us/articles/49529108034843-About-Heroes-Pets) | 발표일 미표기 | 영웅 6종·해금 회관; 공격 4슬롯·방어 배너; Hero Hall; 펫 역할; Hero Journey; Hero Journey 진행·보상 | 킹 TH7 장비 접근과 대장간 TH8 건설을 별도 조건으로 취급. 지원 페이지 갱신일 미표시.; 영웅 상세 전투 규칙은 다른 담당 문서에서 별도 검증. |
| S037 | [About Super Troops — Supercell Support](https://sc-clashofclans.zendesk.com/hc/en-us/articles/49529095172251-About-Super-Troops) | 발표일 미표기 | TH11 직접 활성·3일·2종; 이벤트 추가 슬롯; 만료·취소 시 군대 제거·미환급; 일반형 병행 | 지원 페이지는 활성화 다크 엘릭서의 숫자 가격을 명시하지 않아 현행 가격 고정 안 함. |
| S038 | [Battle vs Ranked Battle - What's the Difference?](https://support.supercell.com/clash-of-clans/en/articles/battle-vs-ranked-battle-whats-the-difference.html) | 발표일 미표기 | 무제한 일반 전투와 제한 경쟁 전투 | 현재 검색 추출 본문 확인. 직접 open에서는 readable lines 0. |
| S039 | [Battle vs Ranked Battle — What’s the Difference?](https://sc-clashofclans.zendesk.com/hc/en-us/articles/49529096972059-Battle-vs-Ranked-Battle-What-s-the-Difference) | 발표일 미표기 | 일반 전투와 경쟁 전투의 분리 | 구체 리그별 공격 횟수는 별도 최신 표 필요. |
| S040 | [Builder Base Heroes & Troops](https://support.supercell.com/clash-of-clans/en/articles/builder-base-heroes-troops.html) | 발표일 미표기 | 능력 유형·충전영웅·증원·초기레벨 | 유닛 전수수치도감으로 사용하지 않음 |
| S041 | [Builder Base Leagues](https://support.supercell.com/clash-of-clans/en/articles/builder-base-leagues.html) | 발표일 미표기 | 장인기지 트로피·리그·별보너스 | 본마을 Ranked 리그와 별개 |
| S042 | [Builder Battles](https://support.supercell.com/clash-of-clans/en/articles/builder-base-versus-battles-3-2.html) | 발표일 미표기 | 비동기매칭·60초준비·2단계·회복·능력전이·공격골드/방어엘릭서 | 정확한 치유식·방어 대기열 내부 구현은 미공개 |
| S043 | [Builders & Builder's Huts](https://support.supercell.com/clash-of-clans/en/articles/builders-4.html) | 발표일 미표기 | 장인 오두막 비용; B.O.B 해금; 장인과 방어 오두막 | 지원문서는 발행일 미표시. 검색 추출 본문 확인, 직접 열기는 readable lines 0. |
| S044 | [Building the Capital](https://sc-clashofclans.zendesk.com/hc/en-us/articles/49529090979227-Building-the-Capital) | 발표일 미표기 | 누적기부 즉시완료·우선목표·배치권한 | 동시 초과기부 처리 내부 방식 미공개 |
| S045 | [Canceling an Upgrade](https://support.supercell.com/clash-of-clans/en/articles/canceling-an-upgrade.html) | 발표일 미표기 | 취소 시 50% 자원 환급; 보석 환급 아님; 자원 은닉 방지라는 공식 설계 이유 | 이벤트 할인·특수 보상과의 상세 상호작용은 추가 검증 필요. |
| S046 | [Clan Capital Frequently Asked Questions](https://support.supercell.com/clash-of-clans/en/articles/frequently-asked-questions.html) | 발표일 미표기 | 개인기본5회+보너스1회·50인참가·클랜이동잠금 | 5는 상대클랜 수가 아닌 개인 공격권 |
| S047 | [Clan Capital Rewards](https://support.supercell.com/clash-of-clans/en/articles/rewards-2.html) | 발표일 미표기 | 캐피탈골드·메달·트로피·명성·생존인구보너스·동일메달 | 메달 내부배분함수와 계수 미공개 |
| S048 | [Clan Castle Troops & Spells](https://support.supercell.com/clash-of-clans/en/articles/clan-castle-troops-and-spells-2.html) | 발표일 미표기 | 지원 요청 유형·수용량·최고 레벨 옵션 | 잠금 해제 설명을 모든 지원 유형의 공통 TH 조건으로 확대하지 않음 |
| S049 | [Clan Games Challenges and Points](https://sc-clashofclans.zendesk.com/hc/en-us/articles/49529033821723-Clan-Games-Challenges-and-Points) | 발표일 미표기 | 모드한정과제·완료점수·만료과제부활·포기 | 개인상한 초과 통계반영은 추가검증 |
| S050 | [Clan Games Rewards](https://sc-clashofclans.zendesk.com/hc/en-us/articles/49529078545691-Clan-Games-Rewards) | 발표일 미표기 | 단계별선택·최소1과제완료·보상수령7일·공간부족 | 개인최대점수=추가보상이라는 설명은 시즌 변경과 교차 필요 |
| S051 | [Clan Perks](https://support.supercell.com/clash-of-clans/en/articles/clan-perks-3.html) | 발표일 미표기 | 클랜 특전·지원 레벨 상한·전쟁 중 적용 시점 | 개별 레벨별 특전 수치는 라이브 데이터 확인 필요 |
| S052 | [Clan Roles](https://support.supercell.com/clash-of-clans/en/articles/clan-roles-3.html) | 발표일 미표기 | 클랜 최대 50명과 역할·권한·대표 부재 승계 | 세부 권한은 작업별로 확인; 일반 순위 비교로 모두 구현하지 않음 |
| S053 | [Clan War League Results](https://support.supercell.com/clash-of-clans/en/articles/clan-war-leagues-promotion-demotion.html) | 발표일 미표기 | 시즌 순위·승강·상위 클랜 순위 | 리그별 승강 숫자와 완전 동률은 시즌 설정을 확인 |
| S054 | [Clan War Leagues Rewards](https://support.supercell.com/clash-of-clans/en/articles/clan-war-leagues-rewards-2.html) | 발표일 미표기 | 0별20%·8별 전체 메달·후보와 탈퇴자 자격·21일 보너스 배분 | 중간 개인비율·반올림·규모별 메달 테이블은 미확인 |
| S055 | [Clan War Matchmaking](https://support.supercell.com/clash-of-clans/en/articles/clan-wars-matchmaking.html) | 발표일 미표기 | 일반 클랜전 성장·전적 매칭, 트로피 제외 | 정확한 가중치·대기시간 함수는 미공개 |
| S056 | [Clan War Results — Supercell Support](https://sc-clashofclans.zendesk.com/hc/en-us/articles/49529080382363-Clan-War-Results) | 발표일 미표기 | 50%·회관·100%의 3별 조건; 별과 파괴율·적 기지별 최고 기록·동률 | 기지당 최대 두 공격자·타이브레이커 관련 모호한 문구는 채택하지 않음.; 본문의 적 기지 최대 두 공격자 문구 및 최고 파괴율 경계는 미확인으로 남김 |
| S057 | [Clan War Rewards](https://support.supercell.com/clash-of-clans/en/articles/clan-war-rewards-2.html) | 발표일 미표기 | 승리100%·무승부75%·패배50% 전쟁 보너스 | 자원 초과 보관과 광석은 종류별 검증 필요 |
| S058 | [Clash of Clans official Google Play listing](https://play.google.com/store/apps/details?id=com.supercell.clashofclans) | 발표일 미표기 | 싱글플레이·연습·친선·이벤트의 공식 기능 구분 | 앱 소개는 세부수치 근거로 사용하지 않음 |
| S059 | [Crafted Defenses — Supercell Support](https://sc-clashofclans.zendesk.com/hc/en-us/articles/49529139405595-Crafted-Defenses) | 발표일 미표기 | 선택형 제작 방어·개별 모듈; 현재 Hero Hunter·Hot Candle·Cake-A-Pult; 단계 수명 | 현재 단계 종료일·차기 단계 세부 수치는 별도 확인. |
| S060 | [Defending the Capital](https://support.supercell.com/clash-of-clans/en/articles/defending-the-capital-2.html) | 발표일 미표기 | 지형·확대배치·방어배치반영시점 | 함정소모상태의 모든예외는 별도검증 |
| S061 | [Friendly Challenges](https://support.supercell.com/clash-of-clans/en/articles/friendly-challenges-3.html) | 발표일 미표기 | 친선배치·지원군·관전·난이도·경제손실 없음 | 자기마을친선과업그레이드영웅은 최신패치로 보완 |
| S062 | [Gold Pass](https://sc-clashofclans.zendesk.com/hc/en-us/articles/49529123544091-Gold-Pass) | 발표일 미표기 | 시즌 혜택; 중도 구매 소급; 보상 미수령; 연속 구매 추가 카드 | 가격·스토어·계정별 상품 조건 미확인. |
| S063 | [Guardians — Supercell Support](https://sc-clashofclans.zendesk.com/hc/en-us/articles/49529107397403-Guardians) | 발표일 미표기 | 방어 전용·TH18·1기 선택; 업그레이드 중 일반 방어와 경쟁 스냅샷 예외 | TH19 향후 변경을 현재 규칙에 합치지 않음. |
| S064 | [Helpers & The Helper Hut](https://sc-clashofclans.zendesk.com/hc/en-us/articles/49529140074139-Helpers-The-Helper-Hut) | 발표일 미표기 | 조력자 종류; 장인 도제와 연구 조수의 가속; 통합 23시간 작업일; Alchemist와 Prospector | 공식 Support의 Zendesk 제공 본문. 현재 지원문서의 모든 필드가 계정별 배포상태와 동일하다는 단정은 피함. |
| S065 | [Hoggy Bank](https://sc-clashofclans.zendesk.com/hc/en-us/articles/55600634183451-Hoggy-Bank) | 발표일 미표기 | 전리품 별도 누적; 적재 가능량과 엘릭서 수레 예외; 시즌 종료 초과 저장; 전투 중 시즌 경계 | 은행 크기와 레벨별 수치는 본 문서에서 고정하지 않음. |
| S066 | [Intro to Clan Wars](https://support.supercell.com/clash-of-clans/en/articles/about-clan-wars-2.html) | 발표일 미표기 | 준비일·개인 두 공격·전쟁 방어군·배치 잠금 | 특수 이벤트 규칙은 별도 설정 |
| S067 | [Intro to Legend League](https://support.supercell.com/clash-of-clans/en/articles/legend-league-4.html) | 발표일 미표기 | Legend III/II/I 구분; I의 8공격·8방어·손실 점수; 주간 잔류 및 4주 리셋; 배치 다음 League Day 적용 | 지원 문서의 month 표현은 상세 4-week 설명과 구분. |
| S068 | [Loot and Star Bonus](https://support.supercell.com/clash-of-clans/en/articles/about-multiplayer-and-trophies-3.html) | 발표일 미표기 | 생산시설·창고 약탈; 전체 자원 약탈 불가; 별 보너스의 공개 안내 | Star Bonus 모든 광석 표현·랭크 기반 설명이 다른 시점 문서와 충돌. 11월 예고를 현재 지급표로 확정하지 않음. |
| S069 | [Magic Items & The Trader](https://sc-clashofclans.zendesk.com/hc/en-us/articles/49529083243291-Magic-Items-The-Trader) | 발표일 미표기 | 마법 아이템 기능; 장인·연구 물약 가속; 책·룬·망치; Trader | 일부 UI 이동 경로·훈련 관련 문구는 2025-2026 업데이트와 함께 확인해야 함. |
| S070 | [Matchmaking & Groups](https://support.supercell.com/clash-of-clans/en/articles/cwl-matchmaking-and-groups.html) | 발표일 미표기 | CWL 리그 매칭·8클랜 표준/6클랜 예외 | 15/30인 초기 배치 문구가 최신5v5 패치와 불일치 |
| S071 | [Raid Weekends](https://sc-clashofclans.zendesk.com/hc/en-us/articles/49529095020443-Raid-Weekends) | 발표일 미표기 | 주말참가·공유병력·누적피해·두공격마법·신규가입 제한 | 기간 중 합류 제한은 역할과클랜유형 조건 확인 필요 |
| S072 | [Ranked Battles & Trophy Calculation](https://support.supercell.com/clash-of-clans/en/articles/trophy-matchmaking-and-calculation-in-multiplayer-2.html) | 발표일 미표기 | TH 범위와 리그 배치 매칭; 별별 트로피 범위; 주간형 방어 보완점 | 현재 검색 추출 본문 확인. Legend I 방어 손실과 구분. 세부 파괴율 곡선 미공개. |
| S073 | [Ranked Leagues](https://support.supercell.com/clash-of-clans/en/articles/ranked-leagues-4.html) | 발표일 미표기 | TH7 참가; 리그별 공격 예산; 비활동·리그 하한; 랭크 배치 스냅샷 | 검색 본문 확인. Legend 전체 월간 설명은 상세 패치와 충돌. 배치 잠금 시점도 4월 공지와 차이. |
| S074 | [Ranked Leagues — Supercell Support](https://sc-clashofclans.zendesk.com/hc/en-us/articles/49529109982875-Ranked-Leagues) | 발표일 미표기 | Ranked 임시 유닛 제외; 모드별 레시피 | Legend 전체 monthly라는 요약은 2026-04 상세 릴리스와 차이가 있어 전투 문서에서는 사용하지 않음. |
| S075 | [Recruiting Clan Members & Clan Notices](https://support.supercell.com/clash-of-clans/en/articles/recruiting-clan-members-3.html) | 발표일 미표기 | 가입 정책·조건·모집 공고 | 공고 추천 순위 내부 알고리즘은 미공개 |
| S076 | [Season Tasks](https://sc-clashofclans.zendesk.com/hc/en-us/articles/49529097715611-Season-Tasks) | 발표일 미표기 | 카드·과제·스티커 조건; 시즌 보상 스케일; 미수령 자동처리 | 기본 카드 상한과 로열티 추가 카드 관계, 계정별 롤아웃은 실기기 검증 필요. |
| S077 | [Sending Builders to Home Village](https://support.supercell.com/clash-of-clans/en/articles/builder-base-getting-master-builder-to-home-village-3.html) | 발표일 미표기 | O.T.T.O·B.O.B 과제·B.O.T.O 존재 | B.O.T.O 구매/젬/레벨 세부조건 모호해 추가 검증으로 분류 |
| S078 | [Shields](https://support.supercell.com/clash-of-clans/en/articles/multiplayer-attacking-defending-2.html) | 발표일 미표기 | Magic Shield 30% 약탈·8시간; 공격으로 시간 감소 없음; 복수 활성 조건 | 검색 추출 본문 확인. 직접 open은 지원 포털로 이동. 혼합 화폐의 경계 계산은 미확인. |
| S079 | [Siege Machines — Supercell Support](https://sc-clashofclans.zendesk.com/hc/en-us/articles/49529091698587-Siege-Machines) | 발표일 미표기 | TH12 제작·TH10 지원; 시즈 별도 용량; 자기 시즈와 지원 시즈 선택; 파괴·수동 방출 | 일반 시즈의 방어 참여를 암시하는 모호한 문장은 채택하지 않음. |
| S080 | [Single Player Attacks](https://sc-clashofclans.zendesk.com/hc/en-us/articles/49529122807323-Single-Player-Attacks) | 발표일 미표기 | 90레벨·1별해제·무제한시간·트로피와보호막 분리 | 레벨별 잔여약탈 데이터는 실제UI 검증 필요 |
| S081 | [Starting a Clan War](https://support.supercell.com/clash-of-clans/en/articles/starting-a-clan-war-2.html) | 발표일 미표기 | 대표·공동대표 시작 권한과 최소 5명 | 규모별 전체 허용 목록은 이 문장만으로 확정 불가 |
| S082 | [Supercharge — Supercell Support](https://sc-clashofclans.zendesk.com/hc/en-us/articles/49529107491739-Supercharge) | 발표일 미표기 | 최대 레벨 추가 강화; 방어 2단계·생산기 3단계; 새 건물 레벨 시 소멸·보상 전환; 최대 레벨 추가 성장; 신규 레벨 도입 시 해제; 누적 업적과 전환 보상 | 2024 도입의 모든 건물 최대 3회 설명과 구분. 강화 가능 시설 목록은 패치 데이터 필요.; 시설별 현행 최대 수치표는 수집하지 않음. |
| S083 | [The Blacksmith: Hero Equipment & Ore](https://support.supercell.com/clash-of-clans/en/articles/hero-equipment-ore-5.html) | 발표일 미표기 | 광석 종류; 장비 성장; 광석 공급처 표현 비교 | Starry Ore 획득처 나열과 Loot/4월 패치의 all Ore 표현 사이에 적용시점 확인 필요. |
| S084 | [The Blacksmith: Hero Equipment & Ore — Supercell Support](https://sc-clashofclans.zendesk.com/hc/en-us/articles/49529083044123-The-Blacksmith-Hero-Equipment-Ore) | 발표일 미표기 | 대장간 TH8; 영웅별 장비 2개; Common·Epic; 광석 성장 | 킹 초기 기본 장비 접근과 대장간 건설은 별도 검증 필요. 전체 장비 레벨별 가격표를 제공하지 않음. |
| S085 | [The Fancy Shop](https://support.supercell.com/clash-of-clans/en/articles/the-fancy-shop.html) | 발표일 미표기 | Sparky Stones; 최종 성장과 외형 보상 연결 | 현행 외형별 상품가격 도감은 범위 밖. |
| S086 | [The Forge](https://support.supercell.com/clash-of-clans/en/articles/the-forge.html) | 발표일 미표기 | 자원변환·무료슬롯·장인점유 | 자동제작 등 패스 특전은 성장경제 파트와 연계 |
| S087 | [The Week of Wars](https://support.supercell.com/clash-of-clans/en/articles/cwl-week-of-wars.html) | 발표일 미표기 | 23시간 준비·24시간 전투·일별 출전·개인 1공격 | 그룹 6개일 때 라운드 수가 표준과 다름 |
| S088 | [Tournaments & Matchmaking in Legend League](https://sc-clashofclans.zendesk.com/hc/en-us/articles/49529122458779-Tournaments-Matchmaking-in-Legend-League) | 발표일 미표기 | Legend I 트로피 중심 매칭; 일일 배치 스냅샷; Ranked 복수 불가 | 직접 본문 확인. 일반 주간 랭크의 TH·리그 매칭과 구분. |
| S089 | [What Is the Clan Capital?](https://sc-clashofclans.zendesk.com/hc/en-us/articles/49529136842779-What-Is-the-Clan-Capital) | 발표일 미표기 | TH6·클랜레벨2 해제·공동성장·다음수도 | 개인 전투성장과 수도 공유 전력 분리 |
| S090 | [Work for Hire Event](https://sc-clashofclans.zendesk.com/hc/en-us/articles/49529091450779-Work-for-Hire-Event) | 발표일 미표기 | 추가 고블린 작업 슬롯; 이벤트 종료 뒤 진행 작업 지속; 고블린 연구자 추가 연구 | 한시 이벤트의 작동 규칙이며 기준일에 이벤트가 활성화됐다는 의미가 아님. |
| S091 | [사용자 지정 나무위키: 클래시 오브 클랜](https://namu.wiki/w/%ED%81%B4%EB%9E%98%EC%8B%9C%20%EC%98%A4%EB%B8%8C%20%ED%81%B4%EB%9E%9C) | 발표일 미표기 | 사용자 지정 링크, 근거로 미사용 | 직접 열람 실패. 본문 근거로 사용하지 않음. |

## 3. 문서별 출처 찾기

각 시스템 문서의 규칙 문장·표 가까이에 직접 URL을 붙였으며, 말미에도 관련 근거 또는 연결 문서를 두었다. 전체 출처의 원래 조사 ID, 사용 문서, 확인 범위는 [sources.json](sources.json)에 함께 제공한다.

출처가 서로 다르게 설명하는 항목은 [충돌·검증 목록](03_uncertainties_and_validation.md)에 있다. 날짜가 있는 정식 패치와 지원 문서가 충돌할 때, 문맥에 맞는 근거를 선택하거나 미확인으로 남겼다.

## 4. 자료를 갱신할 때

새 패치가 나오면 URL과 발표일뿐 아니라 실제 적용일, 영향을 받는 문서, 대체되는 규칙을 함께 기록한다. [예고]로 보관된 규칙은 출시를 확인한 뒤에만 현행으로 승격한다. 과거 자료의 능력치·기간·최고 레벨을 현재 기본값으로 가져오지 않는다.
