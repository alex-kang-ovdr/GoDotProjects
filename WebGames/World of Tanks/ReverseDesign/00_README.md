# 월드 오브 탱크 PC판 시스템별 역기획서

> **작성 언어:** 한국어  
> **기준일:** 2026-11-13 KST  
> **대상 제품:** Wargaming World of Tanks PC판  
> **자료 범위:** 공식 가이드·지원 문서·확정 패치 노트·공식 이벤트 안내  
> **라이브 기준:** 확인 가능한 2.4.1 계열. 2026-11-05의 2.4.1_4 마이크로패치도 확인. 2.4.2 Common Test를 라이브로 취급하지 않는다.  
> **구성:** 시스템 본문 20개 + 전체 목차 + 출처·버전·용어집 = **22개 개별 Markdown**. 같은 내용을 묶은 통합본을 추가 제공한다.

## 1. 이 역기획서의 목적

월드 오브 탱크를 단순한 전차 성능표나 플레이 공략이 아니라 **서로 연결된 규칙·상태·자원·UI·데이터 시스템**으로 설명한다. 각 시스템이 무엇을 입력받아 어떤 결과를 만들며, 예외가 어디에서 발생하고, 비슷한 게임을 재구현하려면 무엇을 분리해서 설계해야 하는지 정리한다.

특히 전차의 이동·포탑·포신, 조준과 재장전, 장갑·관통·외부/내부 모듈, 탐지·위장·무전, 전투 결과와 경제 정산 사이의 연결을 상세히 다룬다. 원작의 비공개 코드나 실제 플레이 테스트를 수행한 문서가 아니므로, 확인된 규칙과 재구현 제안을 섞지 않는다.

## 2. 표기의 의미

| 표기 | 의미 | 읽는 방법 |
|---|---|---|
| **[확인]** | 연결된 공개 문서에서 확인한 사실 | 버전·권역·모드·출처 시점을 함께 읽기 |
| **[분석]** | 규칙에서 도출한 설계 해석 | 실제 개발팀의 의도라고 단정하지 않기 |
| **[제안]** | 재구현·데이터·의사코드·실험 설계 | 원작 코드와 다른 독립 제안 |
| **[검증 필요]** | 최신 적용·상수·순서·내부 알고리즘 미확정 | 구현 전에 공식 자료나 통제 실험으로 보완 |

각 파일의 `Cxx`, `Vxx`, `Qxx`, `Pxx`, `Sxx` 등 출처 ID는 **그 문서의 출처 목록**을 가리킨다. 전체 URL 목록은 [21번](21_Sources_Versions_and_Glossary.md)에 통합했다. 다른 파일에서 같은 S01을 쓰더라도 같은 자료를 뜻하는 것은 아니다.

## 3. 시스템별 파일

| 번호 | 파일 | 상세 범위 |
|---|---|---|
| 00 | [00_README.md](00_README.md) | 범위·표기·읽는 순서·목차 |
| 01 | [01_Product_Overview_and_Core_Loops.md](01_Product_Overview_and_Core_Loops.md) | 제품 구조, 전술 자원, 순간·전투·성장 루프 |
| 02 | [02_Battle_Rules_and_Lifecycle.md](02_Battle_Rules_and_Lifecycle.md) | 승리·점령·세션 상태, 종료·정산 경계 |
| 03 | [03_Vehicle_Classes_and_Mobility.md](03_Vehicle_Classes_and_Mobility.md) | 병과·역할, 가속·선회·차륜·지형·충돌 |
| 04 | [04_Aiming_Firing_and_Ammunition.md](04_Aiming_Firing_and_Ammunition.md) | 조준·분산·탄도·탄종·장전 구조 |
| 05 | [05_Armor_Penetration_and_Damage.md](05_Armor_Penetration_and_Damage.md) | 장갑·도탄·구경·관통·HP·HE 예외 |
| 06 | [06_Modules_Crew_Damage_and_Repair.md](06_Modules_Crew_Damage_and_Repair.md) | 궤도·모듈·승무원·탄약고·화재·수리 |
| 07 | [07_Artillery_and_Special_Mechanics.md](07_Artillery_and_Special_Mechanics.md) | 자주포·스턴, 열·추진·쌍열·Tier XI 기믹 |
| 08 | [08_Spotting_Concealment_and_Radio.md](08_Spotting_Concealment_and_Radio.md) | 탐지·위장·수풀·무전·표시·육감 |
| 09 | [09_Maps_Terrain_and_Destruction.md](09_Maps_Terrain_and_Destruction.md) | 이동선·사격선·관측선, 엄폐·파괴·지도 밸런스 |
| 10 | [10_Matchmaking_and_Platoons.md](10_Matchmaking_and_Platoons.md) | 티어·역할·차종 제한, 소대·대기·지도 반복 |
| 11 | [11_Controls_HUD_and_Garage_UX.md](11_Controls_HUD_and_Garage_UX.md) | 입력·카메라·HUD, 장갑 검사·차고·준비 흐름 |
| 12 | [12_Modes_Competitive_and_Events.md](12_Modes_Competitive_and_Events.md) | Onslaught·Frontline·Steel Hunter·Black Signal·Maneuvers |
| 13 | [13_Research_Progression_and_Tier_XI.md](13_Research_Progression_and_Tier_XI.md) | 연구·구매·장착, 청사진·Elite·11티어 업그레이드 |
| 14 | [14_Crew_and_Perks.md](14_Crew_and_Perks.md) | 승무원·겸직·효율·특전·재훈련·XP 이전 |
| 15 | [15_Equipment_Consumables_and_Field_Mods.md](15_Equipment_Consumables_and_Field_Mods.md) | 장비·소모품·지휘명령·현장 개량·대체 구성 |
| 16 | [16_Economy_and_Battle_Rewards.md](16_Economy_and_Battle_Rewards.md) | 재화, XP·크레딧, 비용·순수익·정산 원장 |
| 17 | [17_Missions_Monetization_and_LiveOps.md](17_Missions_Monetization_and_LiveOps.md) | 미션·Fossa·배틀 패스·프리미엄·Plus·운영 |
| 18 | [18_Social_Clans_Replays_and_Fair_Play.md](18_Social_Clans_Replays_and_Fair_Play.md) | 소통·클랜·WTR·숙련도·증표·리플레이·공정성 |
| 19 | [19_Server_and_Data_Architecture.md](19_Server_and_Data_Architecture.md) | 서버 권한·판정·정보 공개·물리/연출·데이터 제안 |
| 20 | [20_Balance_KPIs_and_Validation.md](20_Balance_KPIs_and_Validation.md) | 밸런스·통계·성능·경제 계측·통합 QA |
| 21 | [21_Sources_Versions_and_Glossary.md](21_Sources_Versions_and_Glossary.md) | 자료 신뢰도·버전 차이·미확인 항목·용어·출처 |

## 4. 관심사별 읽는 순서

| 목적 | 권장 순서 |
|---|---|
| 게임 전체의 설계 파악 | 01 → 02 → 10 → 13 → 16 → 17 |
| 전투·물리 구현 검토 | 03 → 04 → 05 → 06 → 07 → 19 |
| 탐지·맵·전술 분석 | 08 → 09 → 10 → 12 |
| 조작·준비 UX 설계 | 11 → 14 → 15 → 16 |
| 성장·운영·수익 구조 | 13 → 14 → 15 → 16 → 17 → 18 |
| 실제 재현 프로젝트 착수 | 21 → 02 → 05 → 08 → 19 → 20 |

## 5. 최신성 때문에 특히 주의할 차이

이 항목들의 세부 근거와 적용 범위는 연결 문서에서 확인한다.

- **Tier XI:** 2.0 도입 당시 차량 수와 2026년 전체 차량 목록을 구분한다. 전용 업그레이드와 VI–X 현장 개량을 나눈다.
- **수리·구급:** 과거 소형 아이템의 단일 대상 복구 설명을 현재 전체 복구 규칙과 혼동하지 않는다.
- **HE:** 일반 전차·자주포·기관포는 피해 처리 예외가 다르다.
- **승무원:** 주 직책 특전 상한, 겸직별 보너스 특전, 효율, 재훈련·초기화 비용을 분리한다.
- **매칭:** 2.0 출시 제한에 2.3·2.4·2.4.1의 변경을 누적 적용한다.
- **모드:** 일반전 시야·점령·부활·승패·비용을 Onslaught나 Black Signal에 그대로 적용하지 않는다.
- **자료 시점:** 2.4.2 테스트 공지가 있다는 사실은 해당 버전의 라이브 적용을 뜻하지 않는다.

## 6. 문서 사용 방법

개별 Markdown은 상대 링크로 연결되어 있으므로 같은 폴더 구조를 유지하면 탐색이 쉽다. Mermaid를 지원하는 뷰어에서는 흐름도와 상태도가 렌더링된다. 지원하지 않는 뷰어에서는 코드 블록으로 보이지만 주변 표와 문장으로도 의미를 이해할 수 있도록 구성했다.

통합본은 [World_of_Tanks_Reverse_Design_KO_Complete.md](World_of_Tanks_Reverse_Design_KO_Complete.md)다. 전체 내용을 한 파일에서 검색할 때 사용한다. 개별 파일을 수정하는 작업에서는 각 시스템 파일을 기준으로 삼고 통합본은 다시 생성하는 편이 일관성을 유지하기 쉽다.

## 7. 검증 범위와 한계

제공된 나무위키 URL은 이번 조사에서 본문을 열 수 없었다. 해당 페이지를 읽거나 요약한 것처럼 인용하지 않았으며, 공식 자료를 중심으로 작성했다. 일부 공식 페이지는 직접 접속 시 보안 안내를 반환했기 때문에 검색 도구에 노출된 공식 페이지 본문과 다른 공식 문서를 교차 확인했다.

실제 클라이언트 실행·훈련방 측정·소스 코드 검사·서버 패킷 분석은 수행하지 않았다. 문서 내 QA는 **실행 결과가 아니라 검증 계획**이다. 정규화 상세 공식, 모듈 확률, 탐지 체크 주기, 경제 계수, 틱레이트 등은 근거가 부족한 상태에서 확정값을 만들어 넣지 않았다.

**이 문서 묶음에서 수행한 검토:** 공식 자료 비교, 제품·모드·버전 구분, 문서 간 규칙 대조, 링크·코드 펜스·패키지 무결성 검사. 상세 결과를 실제 게임 검증 완료로 해석해서는 안 된다.

## 8. 기준 버전의 공식 근거

- [Update History](https://worldoftanks.eu/en/content/docs/release_notes/)
- [Release Notes 2.4.1](https://worldoftanks.eu/en/content/docs/release_notes/release-notes-2-4-1/)
- [Micropatch 2.4.1_4 안내](https://worldoftanks.eu/en/news/updates/micro-patch-2-4-1_4/)
- [2.4.2 Common Test 안내](https://worldoftanks.eu/en/news/updates/2-4-2-CT/) — 테스트 환경이라는 범위 확인에만 사용.

