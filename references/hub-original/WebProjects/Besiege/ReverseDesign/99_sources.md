# 99. 출처·버전 근거와 조사 한계

> 조사일 **2026-11-13**. 기술적 사실은 개발사의 공식 자료를 우선했고, 미공개 연결 규칙 일부는 진단 도구 제작자의 직접 관측으로 분리했다. 일반 위키·사용자 공략을 내부 구현의 확정 근거로 사용하지 않았다.

## 1. 사용자가 지정한 자료

[나무위키 비시즈 문서](https://namu.wiki/w/%EB%B9%84%EC%8B%9C%EC%A6%88)는 열기를 시도했으나 본문을 가져오지 못했다. 해당 문서를 읽었다거나 내용을 대조했다고 주장하지 않는다. 아래 공식 자료를 대체 근거로 사용했다.

## 2. 출처를 적용한 기준

- **개발사 소개:** 현재 제공하는 콘텐츠 범위와 기능 존재를 확인한다.
- **공식 패치 노트:** 변경 시점·이전 동작·구형 저장본 예외를 확인한다.
- **공식 기술 설명:** 개발사가 실제 공개한 모델만 확인 사실로 적는다.
- **도구 제작자 직접 관측:** 관측 환경과 예외를 표시하고 현재 실행판 검증을 남긴다.
- **독립 분석:** 힘·구속·제어의 일반 원리, UX 의도, 데이터 모델은 별도로 해석·제안이라고 표시한다.

일부 Steam 개별 공지는 조회 결과에 제목·이미지만 표시되었다. 그 경우 같은 개발사 글이 실린 공식 뉴스 피드로 본문을 확인했고, 확인 경로를 함께 적었다. 같은 피드 안의 서로 다른 날짜 글을 하나의 업데이트로 합쳐 해석하지 않았다.

## 3. 중요한 버전 경계

| 시점 | 문서에 반영한 경계 | 상세 문서 |
|---|---|---|
| 2017 Multiverse 개발 일지 | 공개된 네트워크 구조는 역사적 설명 | [15](15_multiplayer_and_ugc.md) |
| 2018 고급 제작 도구 | 일반 블록 스케일과 고급 이동·회전 구분 | [03](03_advanced_building.md) |
| 2020 V1.0~V1.05 | 자동화·Build Surface 도입 자료 | [03](03_advanced_building.md), [13](13_automation_and_controls.md) |
| 2022 V1.10 | 키 대신 변수·논리 모드 | [13](13_automation_and_controls.md) |
| 2023 V1.25 | Axle·현가 감쇠·길이 감지·유연 집기 | [08](08_mechanisms_and_constraints.md) |
| 2024 V1.26 | 바퀴 변경과 구형 저장본 호환 동작 | [07](07_ground_locomotion.md) |
| 2024 V1.5~V1.65 | 물·형상 저항·추가 기구·진단 도구 | [10](10_water_and_buoyancy.md), [12](12_damage_and_destruction.md) |
| 2025 V1.70~V1.73 | 기록·시간 배율·진단·무기·계측 변경 | [11](11_weapons_and_payloads.md), [14](14_campaign_and_levels.md) |
| 2025 V1.75 | 추가 로드·자동 저장·정사영·기본 공력 변경 | [03](03_advanced_building.md) |
| 2026 V1.77 | 다중 설정·각도 기준·포 출력 변경 | [02](02_assembly_ux.md), [13](13_automation_and_controls.md) |
| 2026 V1.9~V1.91 | 우주·연료망·화염·연료 펌프 | [11](11_weapons_and_payloads.md), [19](19_space_expansion.md) |

각 행은 변경 분야의 색인이다. 정확한 원문과 제한 조건은 해당 시스템 문서의 근처 인용을 기준으로 한다. 출시 전 수치나 상점 소개와 후속 패치의 추가분이 다른 경우 그 차이를 숨기지 않았다.

## 4. 출처 목록

아래의 출처 번호는 이 문서의 찾아보기용이다. 다른 문서는 이동 가능한 직접 URL로 인용한다. 공식 뉴스 피드와 개별 기사 링크가 같은 내용을 포함하는 경우가 있다.

### S01. Update V0.6.2-7336 - Advanced Building Tools & Bug Fixes

- 분류: 개발사 공식 자료 · 시점: 2018-03-09
- [원문](https://store.steampowered.com/news/app/346010/view/5262975441859796919)
- 확인 주제: 고급 선택·복사·이동·임의각 회전·교차배치 / 일반 block scaling 기본기능 제외(도입 당시) / 고급도구 기본 비활성화 의도(도입 당시)
- [동일 공식 글의 본문 확인 경로](https://store.steampowered.com/news/posts/?appids=346010&enddate=1522940994)

### S02. New Build Surface Feature - Update V1.05

- 분류: 개발사 공식 자료 · 시점: 2020-06-09
- [원문](https://store.steampowered.com/news/app/346010/view/2198262387487265157)
- 확인 주제: 그리드 네점으로 패널 생성, 노드로 곡면 수정 / 목재·유리 재질, 주변 연결 시스템 활용 / 대칭 선택·변환·설정·삭제
- [동일 공식 글의 본문 확인 경로](https://store.steampowered.com/news/posts/?appids=346010&enddate=1652972552&feed=steam_community_announcements)

### S03. New blocks, Block Features & Bug Fixes - Update V1.25

- 분류: 개발사 공식 자료 · 시점: 2023-04-27
- [원문](https://store.steampowered.com/news/posts/?appids=346010&enddate=1712665825&feed=steam_community_announcements)
- 확인 주제: 검색·Brace 클릭배치·Surface 노드 UX 개선 / Axle의 회전 동력 전달 개념

### S04. Update V1.26: Improvements, Tons of Bug Fixes and Regional Pricing

- 분류: 개발사 공식 자료 · 시점: 2024-01-22
- [원문](https://store.steampowered.com/news/posts/?appids=346010&enddate=1714155262&feed=steam_community_announcements)
- 확인 주제: 드래그 고스트 투명도 수정 / 2차 연결·Surface 연결대상·Log 충돌·Slider 연결 관련 수정 / Vacuum 원뿔영역 개선 / Cannon/Crossbow 발사전 속도동기화

### S05. Block Update - New Blocks & Tools - V1.65

- 분류: 개발사 공식 자료 · 시점: 2024-11-27
- [원문](https://steamcommunity.com/games/346010/announcements/detail/4441207205094492419)
- 확인 주제: Joint Stress Visualizer 추가 / Cluster 표시 개선 / Drag Block/Fly Wheel/Bounce Pad/Roller Wheel 추가 / Fly Wheel inertia/power/clutch
- [동일 공식 글의 본문 확인 경로](https://store.steampowered.com/news/posts/?appgroupname=Besiege&appids=346010&enddate=1734029661&feed=steam_community_announcements)
- [동일 공식 글의 본문 확인 경로](https://store.steampowered.com/news/posts/?appgroupname=Besiege&appids=346010&enddate=1743087457&feed=steam_community_announcements)

### S06. Colliderscope - creator description by dagriefaa

- 분류: 도구 제작자 직접 관측 · 시점: 문서의 발표·조회 시점 참조
- [원문](https://steamcommunity.com/sharedfiles/filedetails/?id=1865492589)
- 확인 주제: 시각 외형과 collider/connection point 차이 / 대체로 X+ 우선, 같은 X면 배치순서 우선이라는 제작자 관측 / 기계 연결 trigger 배제·Hinge 예외 / 강성 일부 규칙은 제작자도 불명이라고 명시

### S07. Quality of Life Update V1.75 - Additive Loading, Machine Autosave and more...

- 분류: 개발사 공식 자료 · 시점: 2025-06-26
- [원문](https://steamcommunity.com/games/346010/announcements/detail/530976484112728513)
- 확인 주제: 추가 로드·선택 저장·자동저장 / Starting Block 없는 부분 저장 보충과 추가로드 처리 / 정사영 카메라 스냅 / Build Surface 공력 기본 OFF
- [동일 공식 글의 본문 확인 경로](https://store.steampowered.com/news/posts/?appgroupname=Besiege&appids=346010&enddate=1772123201&feed=steam_community_announcements)

### S08. Better Tools Update V1.77 - Multi-key Mapping, Water Tutorials and more...

- 분류: 개발사 공식 자료 · 시점: 2026-02-26
- [원문](https://steamcommunity.com/games/346010/announcements/detail/509606585808454143)
- 확인 주제: 다중블록 키매퍼 마지막 선택 기준·혼합값 ●●●·동일 설정 전파 / 옵션 드롭다운 검색 / Ctrl+MMB pick block
- [동일 공식 글의 본문 확인 경로](https://store.steampowered.com/news/posts/?appgroupname=Besiege&appids=346010&enddate=1778853723&feed=steam_community_announcements)

### S09. Besiege Steam store

- 분류: 공식 상점 · 시점: 문서의 발표·조회 시점 참조
- [원문](https://store.steampowered.com/app/346010/Besiege/)
- 확인 주제: 기본 캠페인55레벨·4섬 / 샌드박스·레벨에디터 / 기본 게임의 물리 제작·캠페인·공유 범위

### S10. Multiverse Dev Blog 3 - 05/10/2017

- 분류: 개발사 공식 자료 · 시점: 2017-10-05
- [원문](https://store.steampowered.com/news/posts/?appgroupname=Besiege&appids=346010&enddate=1512915054)
- 확인 주제: Trigger→Event 구조 / ON DESTROY→진행도 증가 / 손상 기반 팀 승리 예시

### S11. Multiverse Dev Blog 4 - 10/11/2017

- 분류: 개발사 공식 자료 · 시점: 2017-11-10
- [원문](https://store.steampowered.com/news/posts/?appids=346010&enddate=1516890446&feed=steam_community_announcements)
- 확인 주제: 레벨별 블록 금지·종류별/전체 수 제한 / 지정 기체 제한

### S12. Valfross campaign updates and Update 0.85

- 분류: 개발사 공식 자료 · 시점: 2019-07-08 (feed includes earlier Valfross posts)
- [원문](https://store.steampowered.com/news/posts/?appids=346010&enddate=1564418637&feed=steam_community_announcements)
- 확인 주제: 회수·장벽파괴·회전 구조물 유형

### S13. Major Level Editor & Quality of Life Update V1.60

- 분류: 개발사 공식 자료 · 시점: 2024-10-19
- [원문](https://steamcommunity.com/games/346010/announcements/detail/4543660921244335097)
- 확인 주제: 결승선·Zero Gravity zone·Joint오브젝트 / 수면 높이·거칠기·물환경 BuildZone 조정 / 카메라 대형 물체 관통방지 옵션 / 폭발 이벤트의 자기 재생성 호출순서 수정

### S14. 10 Year Anniversary Update V1.70

- 분류: 개발사 공식 자료 · 시점: 2025-01-30
- [원문](https://store.steampowered.com/news/posts/?appgroupname=Besiege&appids=346010&enddate=1748362018&feed=steam_community_announcements)
- 확인 주제: Time·Damage Taken·Block Total 세 지표 / 부품별 가중점수 합계, 낮을수록 좋은 score / Workshop 기체 점수 등록 제외 / 추가목표·업적

### S15. New Build Surface Feature - Update V1.05

- 분류: 개발사 공식 자료 · 시점: 2020-06-09
- [원문](https://steamcommunity.com/games/346010/announcements/detail/2198262387487265158)
- 확인 주제: Build Surface의 나무/유리 재질, 체력·파편화, 크기에 따른 반응, 기존 joint system 사용
- [동일 공식 글의 본문 확인 경로](https://store.steampowered.com/news/posts/?appids=346010&enddate=1705946583&feed=steam_community_announcements)

### S16. New blocks, Block Features & Bug Fixes - Update V1.25

- 분류: 개발사 공식 자료 · 시점: 2023-04-27
- [원문](https://steamcommunity.com/games/346010/announcements/detail/3702564861056742651)
- 확인 주제: Axle의 2축 회전과 자기축 자유 스핀 제한 / Suspension damper / Grabber flexible / Slider 사전 확장
- [동일 공식 글의 본문 확인 경로](https://store.steampowered.com/news/posts/?appids=346010&enddate=1705946583&feed=steam_community_announcements)

### S17. Update V1.26: Improvements, Tons of Bug Fixes and Regional Pricing

- 분류: 개발사 공식 자료 · 시점: 2024-01-22
- [원문](https://steamcommunity.com/games/346010/announcements/detail/6001676034307566167)
- 확인 주제: 바퀴 단일 둥근 collider로 개편; old saves 원래 구성 유지 / 가속 구현이 감속에도 영향 / Steering tension / Spinning Block free spin
- [동일 공식 글의 본문 확인 경로](https://store.steampowered.com/news/posts/?appids=346010&enddate=1715361118&feed=steam_community_announcements)

### S18. Besiege: The Splintered Sea is out now! / V1.5-21214 changelog

- 분류: 개발사 공식 자료 · 시점: 2024-05-24
- [원문](https://store.steampowered.com/news/posts/?appids=346010&enddate=1720798144&feed=steam_community_announcements)
- 확인 주제: 새 길이 조절형 부품의 길이에 맞는 질량 처리 / 질량 설정에 따른 center of mass 갱신 / damage/fire/joint health 상호작용 수정

### S19. 10 Year Anniversary Extras Update / V1.73-22995

- 분류: 개발사 공식 자료 · 시점: 2025-03-27
- [원문](https://steamcommunity.com/games/346010/announcements/detail/530968239863234715)
- 확인 주제: Joint Stress 모드의 충돌·파괴 표시 / Grenade fuse 및 continuous Collision / Cannon projectile size/chainshot
- [동일 공식 글의 본문 확인 경로](https://store.steampowered.com/news/posts/?appgroupname=Besiege&appids=346010&enddate=1750957475&feed=steam_community_announcements)

### S20. Quality of Life Update V1.75 - Additive Loading, Machine Autosave and more

- 분류: 개발사 공식 자료 · 시점: 2025-06-26
- [원문](https://store.steampowered.com/news/posts/?appgroupname=Besiege&appids=346010&enddate=1772123201&feed=steam_community_announcements)
- 확인 주제: Small Wheel spherical collider/free rolling / Build Surface aero default off

### S21. Besiege: The Broken Beyond is out now! / V1.9; Space Blocks development post

- 분류: 개발사 공식 자료 · 시점: 2026-06-22
- [원문](https://steamcommunity.com/app/346010/announcements/)
- 확인 주제: Metal Wheel DLC 추가 및 거친 지형의 접지 목적 / Flamethrower flame armor 차단 / Flamethrower 새 fuel system 사용 / V1.9 Flamethrower 연료화 및 장갑차폐

### S22. Update V0.60.0-6878

- 분류: 개발사 공식 자료 · 시점: 2018-02-12
- [원문](https://store.steampowered.com/news/posts/?appids=346010&enddate=1525436238&feed=steam_community_announcements)
- 확인 주제: 확장 Piston을 로드할 때 접히던 오류 수정

### S23. The Splintered Sea - Simulating Water | Feature Overview #1

- 분류: 개발사 공식 자료 · 시점: 2024-04-19
- [원문](https://store.steampowered.com/news/posts/?appids=346010&enddate=1715361118&feed=steam_community_announcements)
- 확인 주제: 수중 폭발의 외부 밀어냄과 기포 붕괴 시 당김

### S24. Building Guides Update V0.86

- 분류: 개발사 공식 자료 · 시점: 문서의 발표·조회 시점 참조
- [원문](https://store.steampowered.com/news/posts/?appids=346010&enddate=1642100145&feed=steam_community_announcements)
- 확인 주제: 내장 GuideBook에 기본 비행기 조립 안내 포함

### S25. Update V1.20 - Hot Air Balloon

- 분류: 개발사 공식 자료 · 시점: 문서의 발표·조회 시점 참조
- [원문](https://store.steampowered.com/news/posts/?appids=346010&enddate=1682614591&feed=steam_community_announcements)
- 확인 주제: Hot Air Balloon 추가 / 비행 중 부력 변경으로 상승·하강 조절

### S26. Mac/Linux on Steam & V0.04 Released — developer Von

- 분류: 개발사 공식 자료 · 시점: 문서의 발표·조회 시점 참조
- [원문](https://steamcommunity.com/app/346010/discussions/0/617328415070051925/)
- 확인 주제: Small Balloon controllable buoyancy / Propeller flip 지원

### S27. Block Update - New Blocks & Tools - V1.65

- 분류: 개발사 공식 자료 · 시점: 문서의 발표·조회 시점 참조
- [원문](https://store.steampowered.com/news/posts/?appids=346010&enddate=1734029661&feed=steam_community_announcements)
- 확인 주제: Drag Block 방향별 비대칭 저항 / Fly Wheel / Bounce Pad / Roller Wheel 추가 / Drag Visualizer와 Joint Stress Visualizer

### S28. Besiege: The Splintered Sea — Steam

- 분류: 개발사 공식 자료 · 시점: 문서의 발표·조회 시점 참조
- [원문](https://store.steampowered.com/app/2165710/Besiege_The_Splintered_Sea/)
- 확인 주제: 현재 설명 15레벨과8개 추가블록 / 곡선목재·선박부품 소개

### S29. The Splintered Sea - Building for Water | Feature Overview #3

- 분류: 개발사 공식 자료 · 시점: 문서의 발표·조회 시점 참조
- [원문](https://steamcommunity.com/games/346010/announcements/detail/4193490830094173260)
- 확인 주제: 객체별 부력값 / 잠긴 블록만 부력중심 계산 / 형상 의존 수중저항 / 질량·부력 시각화는 완벽한 예측값 아님

### S30. The Splintered Sea - Aquatic Blocks | Feature Overview #2

- 분류: 개발사 공식 자료 · 시점: 문서의 발표·조회 시점 참조
- [원문](https://steamcommunity.com/games/346010/announcements/detail/4176601697642985456)
- 확인 주제: Sail 젖음에 따른 추진정지 / Aquatic Screw 연속열 설정공유 및 웜기어 기능 / Paddle, Barrel, Rudder, Harpoon 기능

### S31. The Splintered Sea - Simulating Water | Feature Overview #1

- 분류: 개발사 공식 자료 · 시점: 문서의 발표·조회 시점 참조
- [원문](https://steamcommunity.com/games/346010/announcements/detail/4196867261987849000)
- 확인 주제: 파도 물리 영향 / 수면 충돌 물보라 / 수중 폭발의 팽창·수축·수면 반응

### S32. Official water developer articles body feed

- 분류: 개발사 공식 자료 · 시점: 문서의 발표·조회 시점 참조
- [원문](https://store.steampowered.com/news/posts/?appids=346010&enddate=1714752154&feed=steam_community_announcements)
- 확인 주제: FW07/FW08 원문 본문 확인 경로

### S33. Official Building for Water body feed

- 분류: 개발사 공식 자료 · 시점: 문서의 발표·조회 시점 참조
- [원문](https://store.steampowered.com/news/posts/?appids=346010&enddate=1716555565&feed=steam_community_announcements)
- 확인 주제: FW06 원문 본문 확인 경로

### S34. Update18 - V0.42 The Attractive Update

- 분류: 개발사 공식 자료 · 시점: 문서의 발표·조회 시점 참조
- [원문](https://store.steampowered.com/news/posts/?appids=346010&enddate=1491653692)
- 확인 주제: Crossbow 당시30발 소개(현행값 아님) / Vacuum 흡인기능 / 기존 Cannon/Shrapnel/Bomb 등 명칭 확인

### S35. V1.25 New blocks and features

- 분류: 개발사 공식 자료 · 시점: 문서의 발표·조회 시점 참조
- [원문](https://store.steampowered.com/news/posts/?appids=346010&enddate=1705946583&feed=steam_community_announcements)
- 확인 주제: Metal Jaw 스프링 공격 / Axle 및 damper 등

### S36. Better Tools V1.77 and 2026 news feed

- 분류: 개발사 공식 자료 · 시점: 문서의 발표·조회 시점 참조
- [원문](https://store.steampowered.com/oldnews/?appgroupname=Besiege&appids=346010&enddate=1793516400&feed=steam_community_announcements&headlines=0)
- 확인 주제: V1.77 Cannon/Water Cannon3x

### S37. Besiege: The Broken Beyond — Steam

- 분류: 개발사 공식 자료 · 시점: 문서의 발표·조회 시점 참조
- [원문](https://store.steampowered.com/app/3639470/Besiege_The_Broken_Beyond/)
- 확인 주제: 출시2026-06-22 / 상점 소개13블록11레벨(출시후 변경과 구분)

### S38. The Broken Beyond - Simulating Planets & Gravity

- 분류: 개발사 공식 자료 · 시점: 문서의 발표·조회 시점 참조
- [원문](https://store.steampowered.com/news/app/346010/view/680749709329958394)
- 확인 주제: 중력 역제곱 감쇠 / 행성중심 방향 중력과 궤도

### S39. The Broken Beyond - Simulating Atmospheres & Trajectory Prediction

- 분류: 개발사 공식 자료 · 시점: 문서의 발표·조회 시점 참조
- [원문](https://steamcommunity.com/games/346010/announcements/detail/703268342556788492)
- 확인 주제: 대기내 공력 / 축소시 궤적예측선 / 색으로 궤적위험/경향 표시

### S40. The Broken Beyond - Space Blocks

- 분류: 개발사 공식 자료 · 시점: 문서의 발표·조회 시점 참조
- [원문](https://store.steampowered.com/news/app/346010/view/715654509472251945)
- 확인 주제: Booster / Control Thruster / Inertial Steering / Rocket Fin / Grid Fin / Parachute

### S41. Coming June22 - The Broken Beyond - Fuel System & Blocks

- 분류: 개발사 공식 자료 · 시점: 문서의 발표·조회 시점 참조
- [원문](https://steamcommunity.com/games/346010/announcements/detail/671745047272620188)
- 확인 주제: 연료망 인접/Hose 공유 / Coupler와Gauge / Flamethrower/Booster/Blaster 연료 소비 / 소모시 저장장치 질량감소

### S42. The Broken Beyond - Building for Space

- 분류: 개발사 공식 자료 · 시점: 문서의 발표·조회 시점 참조
- [원문](https://steamcommunity.com/games/346010/announcements/detail/711152269082493394)
- 확인 주제: 공력 대기밀도의존·경계 연속감쇠 / 재진입 열보호 / 증기 Water Cannon 조합 / Torch 진공불안정

### S43. Broken Beyond Update V1.91

- 분류: 개발사 공식 자료 · 시점: 문서의 발표·조회 시점 참조
- [원문](https://steamcommunity.com/games/346010/announcements/detail/695398457627639930)
- 확인 주제: Fuel Pump 추가 / Zone79 추가 / 공급연료량으로 Booster 추력 제한

### S44. 10 Year Anniversary Extras Update V1.73 - 2025-03-27

- 분류: 개발사 공식 자료 · 시점: 문서의 발표·조회 시점 참조
- [원문](https://store.steampowered.com/news/posts/?appgroupname=Besiege&appids=346010&enddate=1770732142&feed=steam_community_announcements)
- 확인 주제: Cannon 탄체 크기와 Chainshot 추가는 V1.73 / Grenade 기폭지연 및 화염 도화선 시작 / Speedometer 각속도 측정 추가

### S45. Multiverse Dev Blog 1 - Physics / 2017-05-19

- 분류: 개발사 공식 자료 · 시점: 2017-05-19
- [원문](https://steamcommunity.com/games/346010/announcements/detail/2529180031911119854)
- 확인 주제: Global/Local 시뮬레이션·네트워크 클러스터의 역사적 설명
- [동일 공식 글의 본문 확인 경로](https://store.steampowered.com/news/posts/?appids=346010&enddate=1512760723)

### S46. V1.0 / V1.01 / V1.02 자동화 도입과 키 에뮬레이션

- 분류: 개발사 공식 자료 · 시점: 2020-02~03
- [원문](https://store.steampowered.com/news/posts/?appids=346010&enddate=1591733466&feed=steam_community_announcements)
- 확인 주제: 각도·속도 계측과 당시 키 에뮬레이션 시간 처리

### S47. 64Bit Support Is Here! - Update V1.10

- 분류: 개발사 공식 자료 · 시점: 2022-01-13
- [원문](https://store.steampowered.com/news/app/346010/view/3109173124150507938)
- 확인 주제: 키 대체 변수·추가 논리 모드
- [동일 공식 글의 본문 확인 경로](https://store.steampowered.com/news/posts/?appids=346010&enddate=1714752154&feed=steam_community_announcements)

### S48. Better Tools Update V1.77 공식 본문 확인 경로

- 분류: 개발사 공식 자료 · 시점: 2026-02-26
- [원문](https://store.steampowered.com/news/posts/?appgroupname=Besiege&appids=346010&enddate=1778853723&feed=steam_community_announcements)
- 확인 주제: 다중 키매퍼·각도 기준 모드·포 출력 상한

## 5. 확정하지 않은 정보

| 항목 | 처리 |
|---|---|
| 정확한 질량·관성·마찰·구동력·파단력 | 임의의 물리 단위와 수치표를 만들지 않음 |
| 내부 엔진 버전·솔버·적분법 | 재구성 모델과 실제 구현을 구분 |
| 현재 전체 물리 스텝 | 과거 키 에뮬레이션 주기로부터 확대 추론하지 않음 |
| 공력·유체의 실제 계수 | 일반식은 설명용이며 원작 공식 아님 |
| 밀폐 선체·침수 | 객체 부력과 구분, 별도 검증 항목 |
| 스프링 압축·줄 감김·관절 제동 | 부품별 검증 계획으로 유지 |
| 탄약 수·재장전·기폭 우선순위 | 과거 수치와 현행 확정을 구분 |
| 네트워크 패킷·보간·예측·롤백 | 공개되지 않은 세부를 확정하지 않음 |
| 설치본 실행 결과 | 수행하지 않았으므로 성능·성공률 수치 없음 |

## 6. 후속 업데이트 방법

1. 새 공지의 날짜·버전·대상 플랫폼을 확인한다.
2. 기능 추가, 기본값 변경, 구형 저장본 예외를 구분한다.
3. 해당 시스템 문서의 확인 사실과 검증 항목을 함께 수정한다.
4. [17 검증 계획](17_validation_experiments.md)의 최소 기체로 변경 범위를 확인한다.
5. 결과를 기록할 때는 문서 가설과 관측 결과를 별도 항목으로 남긴다.

## 관련 문서

- [00 전체 목차](00_README.md)
- [90 부품 색인](90_part_catalog.md)
- [17 실험 계획](17_validation_experiments.md)
