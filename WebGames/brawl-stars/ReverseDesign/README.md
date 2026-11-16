# 브롤스타즈 시스템·게임 모드 역기획서

**한국어 Markdown 80개 — 시스템 18개, 모드·변형 56개, 공통 문서 6개**

- 조사 기준: 2026-11-13(KST)
- 최근 확인 공식 패치: 2026-11-11 갱신본
- 목적: 공개 규칙과 설계 해석을 분리한 상세 역기획
- 구성: 플레이 흐름, 상태 전이, 목표와 예외, 맵·조합·역전, UI, 데이터·의사코드, QA·KPI, 출처
- 한계: 인게임 실측·내부 코드 분석·실시간 슬롯 확인은 수행하지 않음

## 읽는 순서

1. [범위·근거·확인 수준](00_scope_evidence.md)
2. [시스템 관계도](01_system_map.md)
3. [모드별 비교 매트릭스](02_mode_comparison.md)
4. 관심 있는 시스템·모드의 상세 문서
5. [재구현 작업 분해](03_reconstruction_plan.md)
6. [출처 색인](99_sources.md)

압축을 풀고 이 README를 Markdown 뷰어에서 열면 상대 링크로 문서 사이를 이동할 수 있다.
Mermaid를 지원하는 뷰어에서는 상태·관계 다이어그램이 렌더링된다.
파일은 UTF-8이며 영어 파일명과 한국어 본문을 사용했다.

## 표기

[공식]/[확인]은 공식 근거, [보조]는 커뮤니티 근거, [해석]은 독립 설계 분석,
[제안]은 재구현 명세, [미확인]은 추가 검증 영역이다.
공개되지 않은 내부 판정이나 현재 운영을 확정된 사실처럼 쓰지 않았다.

이 묶음은 56개 주요 모드·변형을 선택해 분석한다.
모든 역사적 단기 실험·2대2 프리셋·보스 외형을 전수 복원한 목록은 아니며,
현재/과거/신규 발표/자료 제한을 개별 문서에서 구분했다.

## 1. 시스템 문서 18개

| 문서 | 핵심 범위 |
| --- | --- |
| [01. 코어 루프와 경기 생명주기](systems/01_core_loop.md) | 반복 동기·경기·라운드·런·정산 |
| [02. 조작·조준·카메라·전투 가독성](systems/02_controls_camera.md) | 이동·조준·자동 조준·좌표계·카메라 |
| [03. 전투·탄약·피해·회복·상태이상](systems/03_combat_damage.md) | 탄약·피해·회복·상태이상·사망 |
| [04. 브롤러 능력·로드아웃·가젯·기어·하이퍼차지·Buffies](systems/04_abilities_loadout.md) | 특수 공격·가젯·기어·하이퍼차지·Buffies |
| [05. 맵·지형·시야·목표 배치·맵 메이커](systems/05_maps_terrain_vision.md) | 지형·시야·파괴·맵 메이커 |
| [06. 팀 역할·조합·상성·밸런스](systems/06_team_roles_balance.md) | 클래스·역할·조합·상성·밸런스 지표 |
| [07. 네트워크·권위 판정·재접속·관전·기술 구조](systems/07_network_architecture.md) | 권위·예측·보정·재접속·관전 제안 |
| [08. 모드 데이터·규칙 구성·분석 이벤트·QA 명세](systems/08_data_rules_qa.md) | 규칙 데이터·이벤트 계약·QA |
| [09. 브롤러 수집·성장·장비·업적 역기획](systems/09_roster_progression.md) | 해금·파워·장비·Records |
| [10. 재화·확률 보상·상점·경제 순환 역기획](systems/10_economy_rewards.md) | 재화·보상·확률·정산 원자성 |
| [11. 퀘스트·Brawl Pass·Pro Pass·목표 관리 역기획](systems/11_quests_passes.md) | 퀘스트·패스·시즌·진행 |
| [12. 경쟁전·픽밴·등급·시즌 역기획](systems/12_ranked_draft.md) | 경쟁전 자격·드래프트·세트·초기화 |
| [13. 매치메이킹·트로피·Prestige·대전 품질 역기획](systems/13_matchmaking_trophies.md) | MMR·트로피·Prestige·매칭 |
| [14. 친구·파티·클럽·공동 보상 역기획](systems/14_social_clubs.md) | 친구·파티·클럽·협동 |
| [15. 라이브 운영·시즌·로테이션·기간 이벤트 역기획](systems/15_liveops_events.md) | 이벤트·변형·로테이션·운영 |
| [16. 홈·온보딩·메타 UI·결과 피드백 역기획](systems/16_ux_onboarding.md) | 온보딩·정보 구조·실패 피드백 |
| [17. 아트·애니메이션·VFX·오디오·경쟁 가독성](systems/17_art_audio_feedback.md) | 아트·VFX·소리·스킨 가독성 |
| [18. AI·소환수·중립 적·보스 패턴](systems/18_ai_pve_patterns.md) | 소환수·중립 적·보스·난도 |

## 2. 모드 문서 56개

| 문서 | 분석 계열 | 근거·버전 주의 |
| --- | --- | --- |
| [01. 젬 그랩](modes/01_gem_grab.md) | 핵심 목표전 | 공식 기본 규칙 |
| [02. 브롤 볼](modes/02_brawl_ball.md) | 핵심 목표전 | 공식 기본 규칙 |
| [03. 하이스트](modes/03_heist.md) | 핵심 목표전 | 개편 이력 구분 |
| [04. 바운티](modes/04_bounty.md) | 핵심 목표전 | 공식 기본 규칙 |
| [05. 핫 존](modes/05_hot_zone.md) | 핵심 목표전 | 동시 점유 규칙 주의 |
| [06. 녹아웃](modes/06_knockout.md) | 핵심 목표전 | 역사 타이브레이커 분리 |
| [07. 섬멸전](modes/07_wipeout.md) | 핵심 목표전 | 공식 기본 규칙 |
| [08. 솔로 쇼다운](modes/08_solo_showdown.md) | 생존전 | 공식 기본 규칙 |
| [09. 듀오 쇼다운](modes/09_duo_showdown.md) | 생존전 | 세부 부활 검증 |
| [10. 트리오 쇼다운](modes/10_trio_showdown.md) | 생존전 | 4팀 목표전과 구분 |
| [11. 듀얼](modes/11_duels.md) | 순차 대결 | 자원 계승 미확인 분리 |
| [12. 바스켓 브롤](modes/12_basket_brawl.md) | 스포츠 | 공식 기본 규칙 |
| [13. 5대5 젬 그랩](modes/13_gem_grab_5v5.md) | 인원 변형 | 전용 목표 확인 |
| [14. 5대5 브롤 볼](modes/14_brawl_ball_5v5.md) | 인원 변형 | 가로 필드 확인 |
| [15. 5대5 녹아웃](modes/15_knockout_5v5.md) | 인원 변형 | 강화 상세 공식 근거 제한 |
| [16. 5대5 섬멸전](modes/16_wipeout_5v5.md) | 인원 변형 | 전용 목표 확인 |
| [17. 4팀 젬 그랩](modes/17_gem_grab_four_teams.md) | 다팀 목표전 | 맵별 목표값 |
| [18. 4팀 섬멸전](modes/18_wipeout_four_teams.md) | 다팀 목표전 | 왕관 설명 충돌 |
| [19. 브롤 하키](modes/19_brawl_hockey.md) | 스포츠 | 도입값과 물리 변경 분리 |
| [20. 페인트 브롤](modes/20_paint_brawl.md) | 공간 목표 | 공식·이벤트 범위 |
| [21. 페이로드](modes/21_payload.md) | 호위 | 공식 기본 규칙 |
| [22. 트로피 탈출](modes/22_trophy_escape.md) | 탈출 | 시점별 정산 검증 |
| [23. 헌터즈](modes/23_hunters.md) | 개인 처치전 | 공식 기본 규칙 |
| [24. 시즈](modes/24_siege.md) | 공성 | 역사 모드 |
| [25. 로보 럼블](modes/25_robo_rumble.md) | 협동 PvE | 역사 시간값 구분 |
| [26. 보스전](modes/26_boss_fight.md) | 협동 PvE | 3인·4월5인·20인 언급 분리 |
| [27. 빅 게임](modes/27_big_game.md) | 비대칭 | 역사 규칙 구분 |
| [28. 슈퍼 시티 램피지](modes/28_super_city_rampage.md) | 협동 PvE | 역사 모드 |
| [29. 론 스타](modes/29_lone_star.md) | 개인 처치전 | 역사 모드 |
| [30. 테이크다운](modes/30_takedown.md) | PvPvE | 역사 모드 |
| [31. 선물 훔치기](modes/31_present_plunder.md) | 탈취·배달 | 11월 복귀 공지 |
| [32. Hold the Trophy](modes/32_hold_the_trophy.md) | 보유 목표 | 보조 자료 포함 |
| [33. 발리 브롤](modes/33_volley_brawl.md) | 스포츠 | 보조 자료 포함 |
| [34. 드럼롤](modes/34_drumroll.md) | 캐릭터 순환 | 복귀판 수치 미확인 |
| [35. 고질라 시티 스매시](modes/35_godzilla_city_smash.md) | 협업 이벤트 | 역사 협업 |
| [36. 영혼 수집가](modes/36_soul_collector.md) | 수집·처치 | 공식 이벤트 규칙 |
| [37. 혼령 전쟁](modes/37_spirit_wars.md) | 공성 | 시즈 자동 상속 금지 |
| [38. 브롤 아레나](modes/38_brawl_arena.md) | 경기 내 성장 | 전용 성장 계수 |
| [39. Loaded Showdown](modes/39_loaded_showdown.md) | 강화 생존 | 2월·11월 변경 분리 |
| [40. Mega Showdown](modes/40_mega_showdown.md) | 대규모 생존 | 11월 발표·Duo 언급 |
| [41. Counterlight](modes/41_counterlight.md) | 공수 교대 | 11월 발표 |
| [42. Super Ball](modes/42_super_ball.md) | 스포츠 변형 | 4월 이벤트 |
| [43. Super Hockey](modes/43_super_hockey.md) | 스포츠 변형 | 11월 발표·세부 제한 |
| [44. Topple the Tower](modes/44_topple_the_tower.md) | 연속 도전 | 6월 이벤트 기준 |
| [45. Jingle Brawls](modes/45_jingle_brawls.md) | 연속 도전 | 11월 발표 |
| [46. Hide & Seek](modes/46_hide_and_seek.md) | 역할 순환 | 8월 이벤트 |
| [47. Treasure Hunt](modes/47_treasure_hunt.md) | 점령·발굴 | 공식 제한·보조로 기본루프 보완 |
| [48. Knight Fight](modes/48_knight_fight.md) | 탈취·배달 | 2025 이벤트 |
| [49. Dodgebrawl](modes/49_dodgebrawl.md) | 공 마무리 | 2025 이벤트 |
| [50. Token Run](modes/50_token_run.md) | 반입·능력 | 2025 개편 |
| [51. Samurai Smash](modes/51_samurai_smash.md) | PvPvE 수집 | 목표·드롭 상세 제한 |
| [52. Shadow Smash](modes/52_shadow_smash.md) | PvPvE 변형 | 프리셋 상세 확인 필요 |
| [53. Mecha Guard](modes/53_mecha_guard.md) | 협동 이벤트 | 공식 핵심루프만 확인 |
| [54. Upside Showdown](modes/54_upside_showdown.md) | 강화 런 | 2025 이벤트 |
| [55. Hawkins Hunt](modes/55_hawkins_hunt.md) | 연속 협동 | 역사3인·현행과 분리 |
| [56. 5대5 브롤 하키](modes/56_brawl_hockey_5v5.md) | 인원 변형 | 존재 확인·세부 제한 |

## 3. 문서에서 깊게 다루는 질문

- 젬 그랩에서 운반자와 교전 담당을 나누는 이유는 무엇인가.
- 같은 처치라도 바운티·섬멸전·녹아웃에서 가치가 어떻게 다른가.
- 하이스트의 시설 피해와 보호막 구간은 공격 타이밍을 어떻게 바꾸는가.
- 핫 존의 누적 점유와 Counterlight의 공수 시간 기록은 무엇이 다른가.
- 공·퍽·충전 슛·골키퍼는 입력과 판정에 어떤 별도 상태를 요구하는가.
- 팀 쇼다운에서 마지막 생존자는 왜 팀 전체의 자산인가.
- 인원 증가와 4팀 구조가 광역기·시야·책임 분담을 어떻게 바꾸는가.
- 타워의 브롤러 소모와 Upside의 강화 축적은 어떤 다른 장기 판단을 만드는가.
- 경기 결과를 계정 보상에 안전하게 연결하려면 무엇을 분리해야 하는가.

## 4. 자료 제한을 먼저 볼 문서

Treasure Hunt, 5대5 녹아웃, 4팀 섬멸전, Hold the Trophy, 발리 브롤, Mecha Guard,
5대5 하키, 11월 신규 모드는 일부 규칙 또는 전체 현행 설정의 확인 범위가 제한된다.
해당 문서의 공식·보조·제안 구역을 함께 읽는다.
특히 수치가 없다는 이유로 다른 모드의 값을 그대로 넣지 않는다.

## 5. 활용

게임 이해에는 시스템 관계도와 모드 비교를,
기획 리뷰에는 단계별 판단·역전 구조·KPI를,
프로토타입에는 데이터 계약·상태 전이·QA를 활용할 수 있다.
실제 제작에서 선택한 규칙은 원작 확인값과 구분해 별도 버전으로 기록한다.

[자료 기준으로 돌아가기](00_scope_evidence.md)
