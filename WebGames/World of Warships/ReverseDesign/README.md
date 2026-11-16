# 월드 오브 워쉽 시스템별 역기획서

**World of Warships PC · Wargaming 글로벌 서비스**

- 기준일: **2026-11-13, 한국 시간**
- 기준 릴리스: **15.10**
- 구성: **22개 Markdown 문서** — 목차 1개, 분석 기준 1개, 시스템·구현 문서 19개, 용어·출처·미확인 원장 1개
- 자료: 공식 배포 공지, 공식 지원·가이드, 공식 운영 위키를 대조한 공개 자료 기반 분석
- 각 문서의 수치 예제·데이터 구조·상태도·QA는 사실과 가정·제안을 구분해 표기

처음 읽을 때는 [분석 범위와 근거 등급](00_scope_evidence_and_version.md)을 확인한다. 이 문서는 원작의 내부 소스 코드나 전체 클라이언트 데이터를 추출한 공식 설계 문서가 아니다.

## 1. 핵심 설계 해석

**[분석] 월드 오브 워쉽의 중심은 함선의 정보·위치·공격각·시간을 서로 교환하는 팀 전술이다.**

1. **탐지가 화력을 실전 성과로 바꾼다.** 사거리와 포문이 충분해도 목표를 볼 수 없거나 아군과 정보를 공유하지 못하면 공격 기회가 줄어든다. 발포와 은폐의 교환이 별도 판단을 만든다.
2. **이동은 사격과 방어를 동시에 결정한다.** 더 많은 포탑을 쓰기 위한 선회는 측면 장갑을 노출하고, 전진은 새로운 사격각과 더 긴 퇴각 시간을 함께 만든다.
3. **장갑과 탄종은 명중 뒤의 숙련을 만든다.** 단순 명중률 외에 위치·각도·구경·신관·포화·회복 가능 피해를 고려해야 한다.
4. **소모품은 서로 다른 시간창을 만든다.** 적의 피해 복구반, 레이더, 연막, 재장전 가속이 끝나는 순간이 새로운 공격 기회가 된다.
5. **승리는 피해량과 분리된 목표다.** 점수·거점·남은 시간에 따라 추격보다 생존, 발포보다 은폐, 교전보다 이동의 가치가 커진다.
6. **경제와 운영은 반복의 이유를 나눈다.** 연구·함장·장비·희소 재화·이벤트가 서로 다른 목표를 제공하지만, 임무 조건과 팀 승리 사이 충돌도 관리해야 한다.

각 해석의 근거 규칙·예외·계산 예제는 아래 시스템 문서에 연결되어 있다.

## 2. 전체 문서 목록

| 파일 | 주제 | 주요 내용 |
|---|---|---|
| [00_scope_evidence_and_version.md](00_scope_evidence_and_version.md) | 분석 범위·버전 | PC/다른 제품 구분, 근거 등급, 변경 이력, 수치 규약 |
| [01_core_loop_and_victory.md](01_core_loop_and_victory.md) | 핵심 루프·승리 | 전투 수명주기, 점수·시간·전멸, 종료 경계, 결과 확정 |
| [02_ship_classes_and_nations.md](02_ship_classes_and_nations.md) | 함종·국가·계통 | 5개 함종, 국가별 분기, 조건부 상성, 역할 구성 |
| [03_navigation_and_maneuvering.md](03_navigation_and_maneuvering.md) | 기동·조함 | 추진·조타·가감속·선회·충돌·자동 항해 |
| [04_gunnery_ballistics_and_aiming.md](04_gunnery_ballistics_and_aiming.md) | 함포·탄도·조준 | 발사각, 선행 조준, 분산·시그마, 탄종 예약, 수동 부포 |
| [05_armor_penetration_and_damage.md](05_armor_penetration_and_damage.md) | 장갑·관통·피해 | AP/HE/SAP, 도탄, 오버매치, 신관, 과관통, 포화 |
| [06_survivability_modules_and_dot.md](06_survivability_modules_and_dot.md) | 생존·모듈·지속 피해 | HP, 회복 장부, 모듈 손상, 화재·침수, 유폭 제거 |
| [07_torpedoes_and_area_denial.md](07_torpedoes_and_area_denial.md) | 어뢰·지역 통제 | 발사관·확산·신관·심도·탐지·회피·아군 차단 |
| [08_detection_vision_and_information.md](08_detection_vision_and_information.md) | 탐지·시야·정보 | 수상/항공 피탐, 발포·연막, 레이더·소나, 공유 지연 |
| [09_carriers_aircraft_and_aa.md](09_carriers_aircraft_and_aa.md) | 항모·항공·대공 | 편대·공격·기체 자원, 새 대공, 전투기, 지원 소모품 |
| [10_submarines_and_asw.md](10_submarines_and_asw.md) | 잠수함·대잠 | 수심·잠항력, 핑·유도 어뢰, 근거리 제한, 폭뢰·ASW |
| [11_consumables_and_tactical_cycles.md](11_consumables_and_tactical_cycles.md) | 소모품·전술 주기 | 횟수·시간 풀·게이지, 지속·쿨다운, 능력 조합 |
| [12_maps_modes_and_objectives.md](12_maps_modes_and_objectives.md) | 맵·모드·목표 | 점령·거점 수익, 작전, 지형·날씨, 시나리오 설계 |
| [13_matchmaking_ranked_and_clans.md](13_matchmaking_ranked_and_clans.md) | 매칭·경쟁·클랜 | 단계 범위, 편성, 신규 보호, 분대, 랭크·클랜전 |
| [14_progression_commanders_and_builds.md](14_progression_commanders_and_builds.md) | 연구·함장·빌드 | 모듈·강화, 21포인트 함장, 재훈련, 신호기, 연구처 |
| [15_economy_rewards_and_monetization.md](15_economy_rewards_and_monetization.md) | 경제·보상·수익화 | 기본/총/순수입, XP 계산, 5등급 보너스, 상품·보장 |
| [16_port_battle_ui_and_onboarding.md](16_port_battle_ui_and_onboarding.md) | UI/UX·조작·학습 | 항구 구성, HUD·미니맵, 조작, 15.10 정보 화면 |
| [17_missions_events_and_liveops.md](17_missions_events_and_liveops.md) | 임무·이벤트·운영 | 임무 집계, 캠페인·컬렉션, 패스·조선소, 운영 지표 |
| [18_balance_metrics_and_validation.md](18_balance_metrics_and_validation.md) | 밸런스·실험 | 조건부 상성, DPM, 표본·교란 요인, 실험·평가 |
| [19_implementation_architecture_and_qa.md](19_implementation_architecture_and_qa.md) | 구현 구조·통합 QA | 재현용 데이터·권한·처리 경계·개발 단계·검증 |
| [20_glossary_sources_and_open_questions.md](20_glossary_sources_and_open_questions.md) | 용어·출처·미확인 | 한영 용어, 통합 출처 원장, 충돌·검증 과제 |

## 3. 목적별 읽기 순서

### 전투의 재미와 규칙을 파악하려면

[01 핵심 루프](01_core_loop_and_victory.md) → [02 함종](02_ship_classes_and_nations.md) → [03 기동](03_navigation_and_maneuvering.md) → [04 조준](04_gunnery_ballistics_and_aiming.md) → [05 피해](05_armor_penetration_and_damage.md) → [08 탐지](08_detection_vision_and_information.md) → [11 전술 주기](11_consumables_and_tactical_cycles.md).

### 물리·엔진 관점에서 재현하려면

[03 기동](03_navigation_and_maneuvering.md), [04 탄도](04_gunnery_ballistics_and_aiming.md), [05 다층 장갑](05_armor_penetration_and_damage.md), [06 모듈·회복](06_survivability_modules_and_dot.md), [07 어뢰](07_torpedoes_and_area_denial.md)를 읽고 [19 구현 구조](19_implementation_architecture_and_qa.md)로 연결한다. 게임 표시 거리와 현실 단위를 바로 혼합하지 않는 것이 중요하다.

### 메타·성장·운영을 설계하려면

[13 매칭](13_matchmaking_ranked_and_clans.md) → [14 성장](14_progression_commanders_and_builds.md) → [15 경제](15_economy_rewards_and_monetization.md) → [16 UI](16_port_battle_ui_and_onboarding.md) → [17 운영](17_missions_events_and_liveops.md) → [18 검증](18_balance_metrics_and_validation.md).

## 4. 이번 문서에서 교정한 오래된 설명

| 항목 | 현재 기준에서의 처리 | 상세 |
|---|---|---|
| 유폭 | 제거된 시스템으로 구분 | [06](06_survivability_modules_and_dot.md) |
| 모듈 영구 파괴·장전 초기화 | 14.8 손상/치명적 손상·복구·장전 일시 정지 반영 | [06](06_survivability_modules_and_dot.md) |
| 주포 발포의 항공 피탐 확대 | 14.7 이후 제거 반영 | [08](08_detection_vision_and_information.md) |
| 전투기 정찰·옛 좌우 대공 구역 | 15.0·15.7 변경 반영 | [09](09_carriers_aircraft_and_aa.md) |
| 잠수함 어뢰 근거리 피해 | 수상함 어뢰·작전 예외와 구분 | [10](10_submarines_and_asw.md) |
| 경제 보너스 네 등급 | 15.7 이후 다섯 등급 반영 | [15](15_economy_rewards_and_monetization.md) |
| 중간 티어 전용 작전·옛 TAB 화면 | 15.8·15.10 변경 반영 | [12](12_maps_modes_and_objectives.md), [16](16_port_battle_ui_and_onboarding.md) |

## 5. 근거 등급

- **[확인]**: 인용한 공개 자료에서 확인한 규칙.
- **[버전 의존]**: 함선·모드·시즌·패치별로 검증할 값.
- **[분석]**: 규칙에서 도출한 설계 해석.
- **[제안]**: 재현에 사용할 수 있는 데이터·구조·UX·QA.
- **[미확인]**: 자료가 부족하거나 충돌하는 항목.

모든 QA 표는 **실행 완료 결과가 아니라 검증 명세**다. 실제 게임의 서버 틱, 난수 분포, 전체 내부 보상 함수, 특정 경계 판정은 공개 자료만으로 확정하지 않았다.

## 6. 자료 접근과 파일 사용

사용자가 제공한 나무위키 원문은 이번 환경에서 열 수 없었다. 공식 가이드·정식 배포 공지·공식 운영 위키로 대조했으며, 위키 안에 남은 구버전 문장은 최신 변경과 구분했다.

ZIP을 풀고 이 README를 열면 시스템 문서 사이의 상대 링크를 따라갈 수 있다. 각 파일은 UTF-8 Markdown이며, Mermaid를 지원하는 뷰어에서는 상태·흐름 다이어그램이 표시된다. 지원하지 않는 뷰어에서도 다이어그램 코드와 주변 설명은 읽을 수 있다.

전체 출처와 후속 검증 목록은 [20번 문서](20_glossary_sources_and_open_questions.md)에 정리했다.
