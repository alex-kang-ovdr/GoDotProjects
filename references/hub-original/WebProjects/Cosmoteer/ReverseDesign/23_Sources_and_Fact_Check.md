# 23. 출처 목록·판본 차이·후속 확인 항목

[전체 목차](README.md) · 문서 ID: REF-23 · 조사일: 2026-11-13

## 1. 조사 범위와 접근 상태

사용자가 제공한 [나무위키 Cosmoteer](https://namu.wiki/w/Cosmoteer)는 직접 열기를 시도했으나 내용을 가져오지 못했다. 따라서 그 문서의 문장을 읽거나 검증했다고 주장하지 않는다. 실제 규칙은 개발자 공식 공지, 공식 홈페이지, 공식 Wiki에 표시된 자료로 교차 확인했다.

공식 Wiki의 여러 직접 요청은 403을 반환했다. 해당 항목은 검색 결과가 제공한 본문·표·설명 범위에서 확인했다. 검색 수집일이 최근이라고 해서 모든 내용이 최신 패치 기준인 것은 아니므로, 수치가 충돌하면 개발자 정식 변경 기록을 우선했다.

게임을 실행하거나 설치 데이터·소스 코드를 대조하지 않았다. 특히 실제 비용 함수, AI 점수식, 물리 상수, 취소 처리 시점은 문헌에서 확인한 부분과 재구현 제안을 분리했다. 상세 원칙은 [00](00_Scope_and_Evidence.md)에 있다.

## 2. 기준선과 현재·예정 기능 구분

| 항목 | 이번 문서의 판단 | 처리 |
| --- | --- | --- |
| 0.30.5 | 정식 배포 공지 확인 | 변경된 규칙은 해당 시스템 문서에 반영 |
| 0.30.5a | 후속 수정 공지 확인 | 문헌 기준선으로 사용 |
| Meltdown 이후 열·오버클럭 | 현재 분석 범위에 포함 | [11](11_Heat_and_Overclocking.md)에서 별도 정의 |
| Career 2.0 | 개발 현황 공개 단계 | 현행 Career 규칙과 구분 |
| 후속 Career 계획 | 출시 보장이나 현재 기능으로 보지 않음 | [16](16_Career_Missions_Fame_and_Factions.md)의 계획 구분 참고 |
| Classic의 기술 설명 | 당시 구현의 공개 기록 | 현행 세부 구현에 일반화하지 않음 |

배포 공지와 개발 현황은 [개발자 공식 피드](https://steamcommunity.com/app/799600/allnews/)에서 확인했다. 문서 기준일과 사이트의 표시 날짜는 별도다. 시간대에 따라 공지 날짜가 하루 다르게 보일 수 있으므로 버전명과 공지 제목을 함께 식별한다.

## 3. 조사 중 발견한 충돌과 처리

| 항목 | 발견한 문제 | 채택한 처리 | 담당 문서 |
| --- | --- | --- | --- |
| 소형 원자로 전지 픽업 | 요약 페이지와 개별 부품의 시간이 다름 | 정확한 시간 미확정, 수식에는 기호 사용 | [06](06_Power_Generation_and_Distribution.md) |
| 오버클럭 축전기 | 과거 설명과 최신 수정이 다름 | 최신 정식 변경·설명 정정 우선 | [06](06_Power_Generation_and_Distribution.md) |
| 방열기 내구도 | 위키 수치가 최신 변경을 반영하지 않음 | 구버전 값을 기준 데이터로 재사용하지 않음 | [11](11_Heat_and_Overclocking.md) |
| 레일건 열 연결 | Loader와 다른 모듈 문서의 조건이 상충 | 실제 구성별 실측 전까지 확정하지 않음 | [08](08_Weapons_and_Fire_Control.md), [11](11_Heat_and_Overclocking.md) |
| 명성 감소 여부 | 일반 설명과 구체적 예외가 충돌 | 개발자 변경 기록에 있는 예외를 반영 | [16](16_Career_Missions_Fame_and_Factions.md) |
| 자원 회수 장비명 | 일부 표와 가이드에 교체 전 명칭 잔존 | 현행 명칭과 교체 이력을 구분 | [14](14_Resources_Mining_and_Salvage.md) |
| 자원 의뢰 명칭 | 과거 Delivery와 후속 명칭 변경 | 조달 의뢰의 의미를 명확히 함 | [16](16_Career_Missions_Fame_and_Factions.md) |
| 승무원 혼잡 | 오래된 단순화와 현재 설명 혼동 가능 | 속도 영향과 완전 통행 차단을 구분 | [04](04_Crew_Roles_and_Task_AI.md) |
| 현재와 RC의 수치 | 같은 버전명 주변에 서로 다른 값 노출 | 정식 공지와 시험판 공지를 분리 | [08](08_Weapons_and_Fire_Control.md)–[11](11_Heat_and_Overclocking.md) |
| 열과 화재 | 서로 연관된 상태를 하나로 설명하기 쉬움 | 선체 열·배관 열망·화재를 분리 | [10](10_Damage_Fire_and_Destruction.md), [11](11_Heat_and_Overclocking.md) |

위 표는 원본 문서의 내용을 길게 다시 인용하는 대신, 어떤 결정을 내렸고 어디서 상세 근거를 읽는지 안내한다.

## 4. 후속 실측 우선순위

우선순위는 재구현 결과가 크게 달라질 위험을 기준으로 정한 **[제안]**이다.

| 우선순위 | 미확정 항목 | 최소 실험 | 영향 |
| --- | --- | --- | --- |
| 높음 | 구조 연결의 경계·모서리·비정형 부품 | 접촉 방식만 바꾼 최소 설계 절단 | 함선 분리·통행·공급 전반 |
| 높음 | 운송 예약·목적지 상실 | 운반 중 목적지·출발지 제거 | 자원 유실·중복 방지 |
| 높음 | 최신 레일건 열 연결 조건 | 동일 모듈 구성에서 연결점만 변경 | 오버클럭 가능 조건 |
| 높음 | 선체 열과 열망의 교환·손실 | 독립 열원·교환기·방열기를 단계적으로 추가 | 지속 출력 계산 |
| 높음 | 저장 탄약·장치 파괴의 처리 순서 | 재고량과 화재 상태를 통제한 파괴 | 연쇄 피해와 회수량 |
| 중간 | 전지 픽업·운반 단위·오버클럭 | 공급원 종류와 작동 상태만 변경 | 인력 산정과 전력 예산 |
| 중간 | 점프 연료 차감·취소·분리 | 준비·차감·완료 직전에 상태 변경 | 이동 경제와 취소 처리 |
| 중간 | 거래 정산·운송·취소 | 일부만 운송한 상태에서 취소 | 물량·화폐 원장 |
| 중간 | 명성·평판·고용비 결합 | 한 변수를 바꾼 고용 조건 비교 | 커리어 성장 비용 |
| 중간 | 방어막 중첩·요격 우선순위 | 한 종류 공격과 일정 진입각 사용 | 방어 모델과 밸런스 |
| 중간 | 분리 후 명령·선택·승무원 소속 | 제어 가능한 조각을 여러 개 만들기 | 함대 조작·저장 복구 |
| 후속 | 협동 정보 공유·편집 권한·지역 이동 | 두 플레이어의 동시 행동 기록 | 세션 정책과 네트워크 |

실험에는 빌드·모드·설계·초기 재고·열·승무원·명령을 함께 남긴다. 단순 동영상 한 장면에서 원인을 확정하지 말고, 시작 상태와 변경 변수를 기록한다.

## 5. 재구현 제안의 독립성

이 묶음의 상태 머신, 제안 필드, 자원 원장, 점수식, 틱 처리 순서, 제작 단계는 원작 코드의 복제본이 아니다. 각 시스템의 공개 규칙을 구현 가능한 형태로 설명하기 위해 새로 작성했다. 장치·부품별 수치가 완전하게 채워진 데이터 파일도 포함하지 않았다.

따라서 실제 제작에서는 세 가지 작업을 구분한다. 먼저 참고할 게임 규칙의 범위를 결정하고, 이어 최신 데이터와 미확정 조건을 확인하며, 마지막으로 팀이 선택한 구현 정책을 테스트한다. 문헌에서 사실이라고 확인된 내용도 새 구현의 테스트를 자동으로 통과시키지는 않는다.

## 6. 출처 색인 읽는 방법

아래 색인은 각 문서의 URL을 중복 제거해 모은 것이다. 같은 공지를 가리키는 개별 페이지와 뉴스 피드, 언어 쿼리는 서로 다른 URL로 남아 있을 수 있다. 개별 문서의 `S-SC`, `B`, `C`, `P` 인용 ID는 문서 내부 식별자이며, 아래 `SRC` 번호는 탐색용 번호다.

- **공식 본문:** 공식 홈페이지·공지 피드·개발자 글에서 본문 확인.
- **공식 연결:** 개별 공지의 제목·연결을 확인하고 본문은 공식 뉴스 피드에서 확인.
- **위키 색인:** 검색에 노출된 공식 Wiki 본문 범위를 확인. 직접 페이지가 차단된 경우가 많음.
- **과거 공식 자료:** 시점이 다른 규칙 또는 기술 이력. 현행에 자동 적용하지 않음.
- **미열람:** 요청받은 참고 링크이나 내용을 가져오지 못함.

| ID | 자료 | 확인 방식 | 연결 문서 |
| --- | --- | --- | --- |
| SRC-01 | [Cosmoteer 공식 홈페이지](https://cosmoteer.net/) | 공식 본문 | [00](00_Scope_and_Evidence.md) · [01](01_Core_Loop_and_System_Map.md) · [03](03_Modules_Connectivity_and_Ship_Splitting.md) · [19](19_Creative_Multiplayer_and_Modding.md) |
| SRC-02 | [개발자 공식 Steam 공지 피드](https://steamcommunity.com/app/799600/allnews/) | 공식 본문 | [00](00_Scope_and_Evidence.md) · [05](05_Internal_Logistics_and_Supply.md) · [06](06_Power_Generation_and_Distribution.md) · [07](07_Propulsion_and_Maneuvering.md) |
| SRC-03 | [사용자 제공 나무위키](https://namu.wiki/w/Cosmoteer) | 미열람 | [00](00_Scope_and_Evidence.md) |
| SRC-04 | [Ship Editor — Official Cosmoteer Wiki](https://cosmoteer.wiki.gg/wiki/Ship_Editor) | 위키 색인 | [02](02_Ship_Construction_and_Blueprints.md) |
| SRC-05 | [Blueprints — Official Cosmoteer Wiki](https://cosmoteer.wiki.gg/wiki/Blueprints) | 위키 색인 | [02](02_Ship_Construction_and_Blueprints.md) · [16](16_Career_Missions_Fame_and_Factions.md) · [17](17_Progression_and_Balance.md) |
| SRC-06 | [Settings — Official Cosmoteer Wiki](https://cosmoteer.wiki.gg/wiki/Settings) | 위키 색인 | [02](02_Ship_Construction_and_Blueprints.md) · [12](12_Tactical_Combat_and_Fleet_Control.md) · [18](18_UI_UX_and_Player_Feedback.md) |
| SRC-07 | [Structure — Official Cosmoteer Wiki](https://cosmoteer.wiki.gg/wiki/Structure) | 위키 색인 | [03](03_Modules_Connectivity_and_Ship_Splitting.md) |
| SRC-08 | [Door — Official Cosmoteer Wiki](https://cosmoteer.wiki.gg/wiki/Door) | 위키 색인 | [03](03_Modules_Connectivity_and_Ship_Splitting.md) |
| SRC-09 | [Command Points — Official Cosmoteer Wiki](https://cosmoteer.wiki.gg/wiki/Command_Points) | 위키 색인 | [03](03_Modules_Connectivity_and_Ship_Splitting.md) |
| SRC-10 | [Crew — Official Cosmoteer Wiki](https://cosmoteer.wiki.gg/wiki/Crew) | 위키 색인 | [04](04_Crew_Roles_and_Task_AI.md) · [14](14_Resources_Mining_and_Salvage.md) · [16](16_Career_Missions_Fame_and_Factions.md) |
| SRC-11 | [0.24.0 — Official Cosmoteer Wiki](https://cosmoteer.wiki.gg/wiki/0.24.0) | 위키 색인 | [04](04_Crew_Roles_and_Task_AI.md) |
| SRC-12 | [Cosmoteer 공식 과거 변경 기록](https://cosmoteer.net/history.html) | 과거 공식 자료 | [04](04_Crew_Roles_and_Task_AI.md) |
| SRC-13 | [Storage Bay — Official Cosmoteer Wiki](https://cosmoteer.wiki.gg/wiki/Storage_Bay) | 위키 색인 | [05](05_Internal_Logistics_and_Supply.md) · [15](15_Manufacturing_Storage_and_Trade.md) |
| SRC-14 | [Batteries — Official Cosmoteer Wiki](https://cosmoteer.wiki.gg/wiki/Batteries) | 위키 색인 | [06](06_Power_Generation_and_Distribution.md) · [09](09_Defense_Shields_and_Point_Defense.md) |
| SRC-15 | [Small Reactor Core](https://cosmoteer.wiki.gg/wiki/Small_Reactor_Core) | 위키 색인 | [06](06_Power_Generation_and_Distribution.md) |
| SRC-16 | [Medium Reactor Core](https://cosmoteer.wiki.gg/wiki/Medium_Reactor_Core) | 위키 색인 | [06](06_Power_Generation_and_Distribution.md) |
| SRC-17 | [Large Reactor Core](https://cosmoteer.wiki.gg/wiki/Large_Reactor_Core) | 위키 색인 | [06](06_Power_Generation_and_Distribution.md) |
| SRC-18 | [Power Capacitor](https://cosmoteer.wiki.gg/wiki/Power_Capacitor) | 위키 색인 | [06](06_Power_Generation_and_Distribution.md) |
| SRC-19 | [Thrusters — Official Cosmoteer Wiki](https://cosmoteer.wiki.gg/wiki/Thrusters) | 위키 색인 | [07](07_Propulsion_and_Maneuvering.md) |
| SRC-20 | [Modular Rocket Thruster](https://cosmoteer.wiki.gg/wiki/Modular_Rocket_Thruster) | 위키 색인 | [07](07_Propulsion_and_Maneuvering.md) |
| SRC-21 | [Part placement blocking — Official Cosmoteer Wiki](https://cosmoteer.wiki.gg/wiki/Modding/Data_fields/Part_placement_blocking) | 위키 색인 | [07](07_Propulsion_and_Maneuvering.md) |
| SRC-22 | [Buffs — Official Cosmoteer Wiki](https://cosmoteer.wiki.gg/wiki/Buffs) | 위키 색인 | [07](07_Propulsion_and_Maneuvering.md) |
| SRC-23 | [0.26.0](https://cosmoteer.wiki.gg/wiki/0.26.0) | 위키 색인 | [07](07_Propulsion_and_Maneuvering.md) |
| SRC-24 | [0.28.0](https://cosmoteer.wiki.gg/wiki/0.28.0) | 위키 색인 | [07](07_Propulsion_and_Maneuvering.md) |
| SRC-25 | [Update 0.30.5](https://steamcommunity.com/games/799600/announcements/detail/699905228356458048) | 공식 연결·피드 본문 | [08](08_Weapons_and_Fire_Control.md) · [09](09_Defense_Shields_and_Point_Defense.md) · [10](10_Damage_Fire_and_Destruction.md) · [11](11_Heat_and_Overclocking.md) |
| SRC-26 | [Ion Beam Emitter](https://cosmoteer.wiki.gg/wiki/Ion_Beam_Emitter) | 위키 색인 | [08](08_Weapons_and_Fire_Control.md) · [11](11_Heat_and_Overclocking.md) |
| SRC-27 | [Ion Beam Prism](https://cosmoteer.wiki.gg/wiki/Prism) | 위키 색인 | [08](08_Weapons_and_Fire_Control.md) |
| SRC-28 | [Railgun Loader Module](https://cosmoteer.wiki.gg/wiki/Railgun_Loader_Module) | 위키 색인 | [08](08_Weapons_and_Fire_Control.md) |
| SRC-29 | [Deck Cannon](https://cosmoteer.wiki.gg/wiki/Deck_Cannon) | 위키 색인 | [08](08_Weapons_and_Fire_Control.md) |
| SRC-30 | [Chaingun](https://cosmoteer.wiki.gg/wiki/Chaingun) | 위키 색인 | [08](08_Weapons_and_Fire_Control.md) · [11](11_Heat_and_Overclocking.md) |
| SRC-31 | [Missile & Mine Launcher](https://cosmoteer.wiki.gg/wiki/Mines) | 위키 색인 | [08](08_Weapons_and_Fire_Control.md) |
| SRC-32 | [Thermal Resonance Lance](https://cosmoteer.wiki.gg/wiki/Thermal_Resonance_Lance) | 위키 색인 | [08](08_Weapons_and_Fire_Control.md) · [11](11_Heat_and_Overclocking.md) |
| SRC-33 | [Railgun Launcher Module](https://cosmoteer.wiki.gg/wiki/Railgun_Launcher_Module) | 위키 색인 | [08](08_Weapons_and_Fire_Control.md) |
| SRC-34 | [Railgun Accelerator Module](https://cosmoteer.wiki.gg/wiki/Railgun_Accelerator_Module) | 위키 색인 | [08](08_Weapons_and_Fire_Control.md) |
| SRC-35 | [Point Defense System](https://cosmoteer.wiki.gg/wiki/Point_Defense_System) | 위키 색인 | [09](09_Defense_Shields_and_Point_Defense.md) |
| SRC-36 | [Flak Array](https://cosmoteer.wiki.gg/wiki/Flak_Array) | 위키 색인 | [09](09_Defense_Shields_and_Point_Defense.md) |
| SRC-37 | [Small Shield Generator](https://cosmoteer.wiki.gg/wiki/Small_Shield_Generator) | 위키 색인 | [09](09_Defense_Shields_and_Point_Defense.md) |
| SRC-38 | [Armor](https://cosmoteer.wiki.gg/wiki/Armor) | 위키 색인 | [09](09_Defense_Shields_and_Point_Defense.md) · [10](10_Damage_Fire_and_Destruction.md) |
| SRC-39 | [Heat mechanics and Overclocking](https://cosmoteer.wiki.gg/wiki/Overclocking) | 위키 색인 | [09](09_Defense_Shields_and_Point_Defense.md) |
| SRC-40 | [The Meltdown Update](https://steamcommunity.com/games/799600/announcements/detail/521971821728244926) | 공식 연결·피드 본문 | [10](10_Damage_Fire_and_Destruction.md) · [11](11_Heat_and_Overclocking.md) |
| SRC-41 | [Fire Extinguisher](https://cosmoteer.wiki.gg/wiki/Fire_Extinguisher) | 위키 색인 | [10](10_Damage_Fire_and_Destruction.md) |
| SRC-42 | [Penetration modding documentation](https://cosmoteer.wiki.gg/wiki/Penetration) | 위키 색인 | [10](10_Damage_Fire_and_Destruction.md) |
| SRC-43 | [Lance Amplification Pump](https://cosmoteer.wiki.gg/wiki/Lance_Amplification_Pump) | 위키 색인 | [11](11_Heat_and_Overclocking.md) |
| SRC-44 | [Lance Dilation Pump](https://cosmoteer.wiki.gg/wiki/Lance_Dilation_Pump) | 위키 색인 | [11](11_Heat_and_Overclocking.md) |
| SRC-45 | [Heat Pipe](https://cosmoteer.wiki.gg/wiki/Heat_Pipe) | 위키 색인 | [11](11_Heat_and_Overclocking.md) |
| SRC-46 | [Heat Pipe Crossing](https://cosmoteer.wiki.gg/wiki/Heat_Pipe_Crossing) | 위키 색인 | [11](11_Heat_and_Overclocking.md) |
| SRC-47 | [Radiator](https://cosmoteer.wiki.gg/wiki/Radiator) | 위키 색인 | [11](11_Heat_and_Overclocking.md) |
| SRC-48 | [Thermal Battery](https://cosmoteer.wiki.gg/wiki/Thermal_Battery) | 위키 색인 | [11](11_Heat_and_Overclocking.md) |
| SRC-49 | [Heat Exchanger](https://cosmoteer.wiki.gg/wiki/Heat_Exchanger) | 위키 색인 | [11](11_Heat_and_Overclocking.md) |
| SRC-50 | [Ship Control](https://cosmoteer.wiki.gg/wiki/Guides_Hub/Ship_Control) | 위키 색인 | [12](12_Tactical_Combat_and_Fleet_Control.md) |
| SRC-51 | [Tractor Beam Emitter](https://cosmoteer.wiki.gg/wiki/Tractor_Beam_Emitter) | 위키 색인 | [12](12_Tactical_Combat_and_Fleet_Control.md) |
| SRC-52 | [Sensor Array — Official Cosmoteer Wiki](https://cosmoteer.wiki.gg/wiki/Sensor_Array) | 위키 색인 | [13](13_Sensors_Exploration_and_Hyperjump.md) |
| SRC-53 | [Hyperdrives — Official Cosmoteer Wiki](https://cosmoteer.wiki.gg/wiki/Hyperdrives) | 위키 색인 | [13](13_Sensors_Exploration_and_Hyperjump.md) |
| SRC-54 | [Clouds and Storms — Official Cosmoteer Wiki](https://cosmoteer.wiki.gg/wiki/Gas_clouds) | 위키 색인 | [13](13_Sensors_Exploration_and_Hyperjump.md) |
| SRC-55 | [Menu Screens — Official Cosmoteer Wiki](https://cosmoteer.wiki.gg/wiki/Guides_Hub/Menu_Screens) | 위키 색인 | [13](13_Sensors_Exploration_and_Hyperjump.md) · [17](17_Progression_and_Balance.md) · [18](18_UI_UX_and_Player_Feedback.md) · [19](19_Creative_Multiplayer_and_Modding.md) |
| SRC-56 | [Meltdown Update 0.30.0 — 개발자 공지](https://store.steampowered.com/news/posts/?appids=799600&enddate=1756769273&feed=steam_community_announcements) | 공식 본문 | [13](13_Sensors_Exploration_and_Hyperjump.md) · [14](14_Resources_Mining_and_Salvage.md) · [15](15_Manufacturing_Storage_and_Trade.md) · [16](16_Career_Missions_Fame_and_Factions.md) |
| SRC-57 | [Career 2.0 Development Update — 공식 뉴스 목록](https://steamcommunity.com/app/799600/allnews/?l=english) | 공식 본문 | [13](13_Sensors_Exploration_and_Hyperjump.md) · [15](15_Manufacturing_Storage_and_Trade.md) · [16](16_Career_Missions_Fame_and_Factions.md) |
| SRC-58 | [Resources — Official Cosmoteer Wiki](https://cosmoteer.wiki.gg/wiki/Resources) | 위키 색인 | [14](14_Resources_Mining_and_Salvage.md) |
| SRC-59 | [Hyperium — Official Cosmoteer Wiki](https://cosmoteer.wiki.gg/wiki/Hyperium) | 위키 색인 | [14](14_Resources_Mining_and_Salvage.md) |
| SRC-60 | [Mining Laser — Official Cosmoteer Wiki](https://cosmoteer.wiki.gg/wiki/Mining_Laser) | 위키 색인 | [14](14_Resources_Mining_and_Salvage.md) |
| SRC-61 | [Manipulator Beam Emitter — Official Cosmoteer Wiki](https://cosmoteer.wiki.gg/wiki/Manipulator_beams) | 위키 색인 | [14](14_Resources_Mining_and_Salvage.md) |
| SRC-62 | [0.28.0 개발자 패치 노트 — Steam 공식 뉴스](https://store.steampowered.com/news/posts/?appids=799600&enddate=1736901638&feed=steam_community_announcements) | 공식 본문 | [14](14_Resources_Mining_and_Salvage.md) · [15](15_Manufacturing_Storage_and_Trade.md) · [16](16_Career_Missions_Fame_and_Factions.md) |
| SRC-63 | [Steel Smelter](https://cosmoteer.wiki.gg/wiki/Steel_Smelter) | 위키 색인 | [15](15_Manufacturing_Storage_and_Trade.md) |
| SRC-64 | [Coil Factory](https://cosmoteer.wiki.gg/wiki/Coil_Factory) | 위키 색인 | [15](15_Manufacturing_Storage_and_Trade.md) |
| SRC-65 | [Hyper-Coil Factory](https://cosmoteer.wiki.gg/wiki/Hyper-Coil_Factory) | 위키 색인 | [15](15_Manufacturing_Storage_and_Trade.md) |
| SRC-66 | [0.23.2 변경 이력](https://cosmoteer.wiki.gg/wiki/0.23.2) | 위키 색인 | [15](15_Manufacturing_Storage_and_Trade.md) |
| SRC-67 | [Stations](https://cosmoteer.wiki.gg/wiki/Stations) | 위키 색인 | [15](15_Manufacturing_Storage_and_Trade.md) · [16](16_Career_Missions_Fame_and_Factions.md) |
| SRC-68 | [Credits](https://cosmoteer.wiki.gg/wiki/Credits) | 위키 색인 | [15](15_Manufacturing_Storage_and_Trade.md) |
| SRC-69 | [Fame](https://cosmoteer.wiki.gg/wiki/Fame) | 위키 색인 | [16](16_Career_Missions_Fame_and_Factions.md) · [17](17_Progression_and_Balance.md) |
| SRC-70 | [Reputation](https://cosmoteer.wiki.gg/wiki/Reputation) | 위키 색인 | [16](16_Career_Missions_Fame_and_Factions.md) |
| SRC-71 | [Missions](https://cosmoteer.wiki.gg/wiki/Missions) | 위키 색인 | [16](16_Career_Missions_Fame_and_Factions.md) |
| SRC-72 | [Category: Factions](https://cosmoteer.wiki.gg/wiki/Category:Factions) | 위키 색인 | [16](16_Career_Missions_Fame_and_Factions.md) |
| SRC-73 | [0.28.1 개발자 패치 노트](https://store.steampowered.com/news/posts/?appids=799600&enddate=1738900328&feed=steam_community_announcements) | 공식 본문 | [16](16_Career_Missions_Fame_and_Factions.md) |
| SRC-74 | [공식 Wiki — Game Modes](https://cosmoteer.wiki.gg/wiki/Creative_mode) | 위키 색인 | [19](19_Creative_Multiplayer_and_Modding.md) |
| SRC-75 | [개발자 블로그 — 0.13.0 Multiplayer, 2017-11-12](https://blog.cosmoteer.net/2017/11/cosmoteer-0130-multiplayer.html) | 과거 공식 자료 | [19](19_Creative_Multiplayer_and_Modding.md) · [20](20_Technical_Architecture_and_Data_Model.md) |
| SRC-76 | [공식 Wiki — mod.rules](https://cosmoteer.wiki.gg/wiki/Modding/mod.rules) | 위키 색인 | [19](19_Creative_Multiplayer_and_Modding.md) |
| SRC-77 | [공식 Wiki — Rules file format](https://cosmoteer.wiki.gg/wiki/Modding/Rules_file_format) | 위키 색인 | [19](19_Creative_Multiplayer_and_Modding.md) · [20](20_Technical_Architecture_and_Data_Model.md) |
| SRC-78 | [공식 Wiki — Example mod walkthrough](https://cosmoteer.wiki.gg/wiki/Modding/Example_mod_walkthrough) | 위키 색인 | [19](19_Creative_Multiplayer_and_Modding.md) |

