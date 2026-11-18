# 22. 출처·확인 수준·검증 원장

> 조사 기준일: 2026-11-13 · 대상: PC Final Cut 클래식 생존 및 별도 명시한 확장  
> 실제 게임 실행, 소스 코드 분석, 설치 데이터 추출, 통계 실험은 수행하지 않았다.

## 1. 조사 방식과 적용 범위

게임의 기본 구조와 확장 기능은 개발사 공식 소개·상품 설명·공식 도움말을 우선 사용했다. 설계 방향은 실제 참여 개발자의 발표와 회고를 참고했다. 구체적인 캐릭터·레시피·장소·상태 설명은 공개 커뮤니티 문서로 보완했다.

출처 문장을 길게 옮기는 방식 대신 규칙을 짧게 요약하고, 의사결정·시스템 연결·구현 계약은 별도 분석으로 작성했다. 데이터·수식·상태머신의 예제는 원작 내부 데이터라는 근거가 없으므로 재구성안으로 표시했다.

### 사용자가 제공한 나무위키

[This War of Mine · 나무위키](https://namu.wiki/w/This%20War%20of%20Mine)는 직접 열기가 실패했다. **원문 전체를 확인했거나 해당 페이지를 그대로 역기획했다고 주장하지 않는다.** 검색에서 일부 미러가 나타났으나, 현재 원본과 동일한 내용·판본임을 보장하지 못해 본문 규칙의 주된 근거로 사용하지 않았다.

### 검색 색인으로 확인한 자료

일부 Fandom 문서는 직접 열기가 제한되었지만 검색 도구가 문서의 본문·표·관련 문단을 반환했다. 그 범위에서 확인한 내용은 각 장의 출처표와 이 원장에 “검색 색인”으로 표시했다. 페이지 전체와 편집 이력까지 읽었다는 뜻은 아니다.

## 2. 근거 수준

| 수준 | 자료 | 강점 | 한계 |
|---|---|---|---|
| 공식 설명 | 개발사 홈페이지·개발사 제공 상점 설명·공식 도움말 | 기본 기능·상품·모드 범위 | 세부 확률·예외를 설명하지 않을 수 있음 |
| 개발자 직접 설명 | GDC 발표·참여 개발자 회고 | 의도·개발 과정의 1차 증언 | 개인 견해와 회사 공식 입장 구분 |
| 개발사 문서의 복제본 | Cold Crisis 모딩 PDF | 실제 공개 설정 명칭 확인 | 당시 판본·복제 출처·현행 도구 차이 |
| 커뮤니티 기록 | Fandom 등 | 실제 인물·물자·장소·행동의 상세 | 오류·구버전·모드 혼입 가능성 |
| 본 문서의 분석 | 의사결정·인과·밸런스 해석 | 시스템 간 관계를 설명 | 원작 개발진의 발언과 다름 |
| 본 문서의 재구성 | 데이터·수식·처리 순서·QA | 구현과 추가 검증에 활용 가능 | 원작 코드나 테스트 결과가 아님 |

아카이브 제목에 “Official Wiki”가 있더라도 이 문서 세트에서는 개발사가 직접 작성한 공식 매뉴얼과 같은 수준으로 취급하지 않았다. 위키의 명칭과 각 주장에 대한 근거 수준은 별개다.

## 3. 기준 판본

| 구분 | 이 문서의 처리 |
|---|---|
| PC Final Cut 클래식 | 기본 시스템 설명의 기준 |
| 정확한 현재 빌드 번호 | 미확인, 수치 일치 보장 없음 |
| The Little Ones | 아동 관련 규칙에 표시 |
| Stories | 에피소드 전용 목표·진행·종료 별도 처리 |
| Forget Celebrations | 별도 DLC와 전용 시나리오로 처리 |
| War Child Charity | 수집 콘텐츠와 후원 구조의 범위만 분석 |
| 콘솔 도움말 | 공통 구조의 근거로 제한, PC 키 배치로 전용하지 않음 |
| 모바일·콘솔 세부 수치 | PC와 완전히 같다고 가정하지 않음 |
| 모드 | 본편 고유 기능과 구분 |
| 보드게임·별도 리메이크 | 분석 범위에서 제외 |

## 4. 충돌·불확실성 처리 원장

| ID | 항목 | 자료 또는 해석의 문제 | 본 문서에서 채택한 처리 | 보완 방법 |
|---|---|---|---|---|
| V01 | 야간 시작 시각 | 20시와 21시 기록이 혼재 | 계획 전환과 현장 시작을 구분, 판본 주의 | 대상 빌드의 전환·현장 시계 촬영 |
| V02 | 캠페인 종료 | 모든 회차를 고정 일수로 일반화할 위험 | 시나리오·종료 경로를 구분 | 시나리오와 실제 종료 기록 |
| V03 | 인물 가방·습관 | 일부 인물 수치·특성 기록 충돌 | 출처가 안정된 대표값만 채택 | 동일 빌드 인물 UI 확인 |
| V04 | 수면과 회복 | 고정 수면 시간과 회복 결과의 일반화 | 상태·수면 질·중단 여부 분리 | 인물·환경을 통제한 관찰 |
| V05 | 제작 해금 | 종합표와 개별 시설표의 일부 총기 단계 차이 | 충돌하는 세부 단계 미확정 | 시설 등급별 제작 목록 대조 |
| V06 | 주간 조기 종료 | 작업별 잔여 시간 처리 불명확 | 모든 작업에 한 규칙 적용하지 않음 | 수동·대기 작업별 비교 |
| V07 | 온도와 질병 | 특정 온도의 절대 안전 보장 | 확률 0 또는 무조건 질병으로 단정하지 않음 | 상태·기간·다른 조건 분리 |
| V08 | 부상과 전투 | 부상이 명중률을 낮춘다는 추정 | 활동·회복 부담과 전투 내부 수치 분리 | 같은 조건의 전투 관찰 |
| V09 | 습격 방어 | 무기·인물·설비를 단일 배율로 환산 | 요소의 역할만 설명, 숨은 공식 미제시 | 잔류 장비·역할별 비교 |
| V10 | NPC의 도덕적 분류 | 무장·군인·적대화를 같은 개념으로 취급 | 소속·현재 행동·사건 맥락 분리 | 지역 변형별 사례 |
| V11 | 심리·엔딩 | 위키의 점수식을 공식 내부식으로 오인 | 사건·인물 차이와 후일담 구조만 채택 | 선택 이력과 결과 추적 |
| V12 | 저장 시점 | 아침 저장 설명을 모든 특수 시점에 확대 | 일반 경향과 예외 검증 분리 | 사망·귀환·종전·중단 관찰 |
| V13 | DLC 포함 범위 | Final Cut과 Stories 전체 소유 혼동 | 지역 편입과 에피소드 권한 구분 | 플랫폼별 상품·메뉴 확인 |
| V14 | 덫·재배 | 생산 주기·특성·배치의 영향이 불명확 | 생산 사슬과 기다림은 설명, 확률은 미확정 | 투입·경과·결과 기록 |
| V15 | 외부 물자 지속 | 시체·놓은 물건·세계 소실 효과 차이 | 컨테이너 종류와 사건을 구분 | 재방문·사건 전후 비교 |
| V16 | 음식 효과 | 일반 성인 규칙과 예외의 범위 차이 | 기본 설명은 04, 아동·숨은 진행도 별도 | 대상별 섭취 전후 확인 |
| V17 | NPC 내부 AI | 관찰 반응에서 특정 코드 구조를 추정 | 상태머신·비용식을 재구성안으로 표시 | 실행 로그 또는 공개 기술 자료 필요 |
| V18 | 모딩 문서 | 구판 공개 설정을 최신 내부 전부로 확대 | 공개된 이름의 존재만 확인 | 현행 설치본 도구와 대조 |

## 5. 문서 내부에서 수정한 정합성

- 종료 개요에 시나리오별 탈출 경로를 포함했다.
- 일반 성인의 음식 효과와 아동·특수 조건의 검증 범위를 구분했다.
- 피로와 수면 질을 재구성 데이터에서 별도로 보존하도록 했다.
- 시설 내부의 완성품 보관을 공용 재고와 구분했다.
- 거래는 양측 재고 사이의 이동이며 생산·소비와 같은 총량 변화가 아니라는 점을 명확히 했다.
- 같은 출처의 중복 요약을 줄이고 상세 규칙을 담당 문서로 연결했다.

이 목록은 문서 검토 결과다. 실제 게임의 버그를 발견하거나 수정했다는 의미가 아니다.

## 6. 통합 출처 목록

같은 URL에 여러 출처 ID가 붙은 경우 한 행으로 묶었다. 각 ID는 해당 시스템 문서의 인용표와 대응한다. 아래 목록은 자료 식별과 접근 수준을 위한 것이며, 각 원문 전체가 본문 모든 주장을 뒷받침한다는 뜻은 아니다.

총 **91개 고유 자료**를 출처 ID와 함께 정리했다. 나무위키는 접근 실패 기록으로 위에 별도 표기했으며 이 수에 포함하지 않았다.

| 문서 내 ID | 자료 | 접근·수준 | 인용한 장 |
|---|---|---|---|
| P01 | [11 bit studios · This War of Mine](https://11bitstudios.com/games/this-war-of-mine/) | 공식 소개 · 검색 색인 확인, 직접 열기 제한 | 01 |
| P02 | [Steam · This War of Mine](https://store.steampowered.com/app/282070/This_War_of_Mine/) | 개발사 상품 설명 · 원문/검색 색인 | 18 |
| P03, C22 | [This War of Mine: Final Cut 공식 사이트](https://finalcut.thiswarofmine.com/) | 공식 사이트 · 원문 | 19 |
| P04, N01 | [The Little Ones 공식 Xbox 도움말](https://dlassets-ssl.xboxlive.com/public/content/cdebd7f5-a913-420b-8195-ef4d90195e48/GameManual/caf4db5e-ee78-47f1-b98a-7fbbc3b78352/en-US/index.html) | 공식 콘솔 도움말 · 원문 | 10, 11, 18 |
| P05 | [GDC 2019 · Why Make Games? 발표 슬라이드](https://media.gdcvault.com/gdc2019/presentations/Drozdowski_Marszal_Why_Make_Games.pdf) | 개발진 발표 · 원문 | 01, 18 |
| P06 | [Kacper Kwiatkowski · 7 things I’ve learnt from designing This War of Mine](https://www.gamedeveloper.com/design/7-things-i-ve-learnt-from-designing-this-war-of-mine) | 참여 개발자 개인 회고 · 원문 | 01, 21 |
| P07 | [Cold Crisis Modding Instructions](https://pwrcontroller.com/wp-content/uploads/2022/04/Modding-Instructions.pdf) | 개발사 저작 · 공개 복제본 원문 | 02, 10, 16, 20 |
| W01, N02 | [Time](https://this-war-of-mine.fandom.com/wiki/Time) | 커뮤니티 · 검색 색인 | 02, 11 |
| W02, E01 | [Our Shelter](https://this-war-of-mine.fandom.com/wiki/Our_Shelter) | 커뮤니티 · 검색 색인 | 06, 07, 18 |
| W03 | [Special Events](https://this-war-of-mine.fandom.com/wiki/Special_Events) | 커뮤니티 · 검색 색인 | 16 |
| W04, N06 | [Radio](https://this-war-of-mine.fandom.com/wiki/Radio) | 커뮤니티 · 검색 색인 | 11, 16 |
| W05 | [Day log](https://this-war-of-mine.fandom.com/wiki/Day_log) | 커뮤니티 · 검색 색인 | 18 |
| W06 | [Neighbors](https://this-war-of-mine.fandom.com/wiki/Neighbors) | 커뮤니티 · 검색 색인 | 10 |
| W07 | [Keyboard Shortcuts & Mouse Controls](https://this-war-of-mine.fandom.com/wiki/Keyboard_Shortcuts_%26_Mouse_Controls) | 커뮤니티 · 검색 색인 | 18 |
| W08 | [Scavenge · Archive](https://thiswarofmine-archive.fandom.com/wiki/Scavenge) | 커뮤니티 · 검색 색인 | 02 |
| C02 | [Characters](https://this-war-of-mine.fandom.com/wiki/Characters) | 커뮤니티 · 검색 색인 | 03 |
| C03 | [Playable Characters](https://this-war-of-mine.fandom.com/wiki/Playable_Characters) | 커뮤니티 · 검색 색인 | 03 |
| C04 | [Skills](https://this-war-of-mine.fandom.com/wiki/Skills) | 커뮤니티 · 검색 색인 | 03 |
| C05 | [Livia](https://this-war-of-mine.fandom.com/wiki/Livia) | 커뮤니티 · 검색 색인 | 03 |
| C06 | [Character States](https://this-war-of-mine.fandom.com/wiki/Character_States) | 커뮤니티 · 검색 색인 | 04 |
| C07 | [Hunger](https://this-war-of-mine.fandom.com/wiki/Hunger) | 커뮤니티 · 검색 색인 | 04 |
| C08, N26 | [Injuries](https://this-war-of-mine.fandom.com/wiki/Injuries) | 커뮤니티 · 검색 색인 | 04, 14 |
| C09 | [Illness](https://this-war-of-mine.fandom.com/wiki/Illness) | 커뮤니티 · 검색 색인 | 04 |
| C10 | [Tiredness](https://this-war-of-mine.fandom.com/wiki/Tiredness) | 커뮤니티 · 검색 색인 | 04 |
| C11 | [Sleep](https://this-war-of-mine.fandom.com/wiki/Sleep) | 커뮤니티 · 검색 색인 | 04 |
| C12 | [Moods (검색에 노출된 영문 본문)](https://this-war-of-mine.fandom.com/zh/wiki/Moods) | 커뮤니티 · 검색 색인 | 05 |
| C13 | [Sympathy](https://this-war-of-mine.fandom.com/wiki/Sympathy) | 커뮤니티 · 검색 색인 | 05 |
| C14 | [Some thoughts](https://this-war-of-mine.fandom.com/wiki/Some_thoughts) | 커뮤니티 · 검색 색인 | 05 |
| C15 | [Endings](https://this-war-of-mine.fandom.com/wiki/Endings?page=2) | 커뮤니티 · 검색 색인 | 17 |
| C16 | [The Little Ones](https://store.steampowered.com/app/481090/This_War_of_Mine_The_Little_Ones/) | 개발사 상품 설명 · 원문/검색 색인 | 19 |
| C17 | [Children](https://this-war-of-mine.fandom.com/wiki/Children) | 커뮤니티 · 검색 색인 | 05, 19 |
| C18 | [Father's Promise](https://store.steampowered.com/app/750030/This_War_of_Mine_Stories__Fathers_Promise_ep1/) | 개발사 상품 설명 · 원문/검색 색인 | 17, 19 |
| C19 | [The Last Broadcast](https://store.steampowered.com/app/974610/This_War_of_Mine_Stories__The_Last_Broadcast_ep2/) | 개발사 상품 설명 · 원문/검색 색인 | 17, 19 |
| C20 | [Fading Embers](https://store.steampowered.com/app/1125630/This_War_of_Mine_Stories_Fading_Embers_ep_3/) | 개발사 상품 설명 · 원문/검색 색인 | 17, 19 |
| C21 | [Forget Celebrations](https://store.steampowered.com/app/3323700/This_War_of_Mine_Forget_Celebrations_Charity_DLC/) | 개발사 상품 설명 · 원문/검색 색인 | 19 |
| C23 | [War Child Charity](https://store.steampowered.com/app/348040/This_War_of_Mine_War_Child_Charity/) | 개발사 상품 설명 · 원문/검색 색인 | 19 |
| C24 | [Forget Celebrations Wiki](https://this-war-of-mine.fandom.com/wiki/Forget_Celebrations) | 커뮤니티 · 검색 색인 | 19 |
| C25 | [Stories Season Pass](https://store.steampowered.com/app/750031/) | 개발사 상품 설명 · 원문/검색 색인 | 19 |
| C26 | [Character Details](https://this-war-of-mine.fandom.com/wiki/Character_Details) | 커뮤니티 · 검색 색인 | 03 |
| C27 | [Morale](https://this-war-of-mine.fandom.com/wiki/Morale) | 커뮤니티 · 검색 색인 | 05 |
| C28 | [Guitar](https://this-war-of-mine.fandom.com/wiki/Guitar) | 커뮤니티 · 검색 색인 | 05 |
| C29 | [Book](https://this-war-of-mine.fandom.com/wiki/Book) | 커뮤니티 · 검색 색인 | 05 |
| C30, E24 | [All Basic Items](https://this-war-of-mine.fandom.com/wiki/All_Basic_Items) | 커뮤니티 · 검색 색인 | 05, 08, 09 |
| C31 | [All Household Items](https://this-war-of-mine.fandom.com/wiki/All_Household_Items) | 커뮤니티 · 검색 색인 | 05 |
| C32, E25 | [Herbal Meds](https://this-war-of-mine.fandom.com/wiki/Herbal_Meds) | 커뮤니티 · 검색 색인 | 04, 08 |
| C33 | [Quiet House](https://this-war-of-mine.fandom.com/wiki/Quiet_House) | 커뮤니티 · 검색 색인 | 17 |
| C34, N14 | [Supermarket](https://this-war-of-mine.fandom.com/wiki/Supermarket) | 커뮤니티 · 검색 색인 | 12, 13, 14, 17 |
| C35, N19 | [Garage](https://this-war-of-mine.fandom.com/wiki/Garage) | 커뮤니티 · 검색 색인 | 13, 17 |
| C36 | [Decrepit Squat](https://this-war-of-mine.fandom.com/wiki/Decrepit_Squat) | 커뮤니티 · 검색 색인 | 17 |
| E02 | [Crafting](https://this-war-of-mine.fandom.com/wiki/Crafting) | 커뮤니티 · 검색 색인 | 08 |
| E03 | [Workshop](https://this-war-of-mine.fandom.com/wiki/Workshop) | 커뮤니티 · 검색 색인 | 06, 08 |
| E04 | [Metal Workshop](https://this-war-of-mine.fandom.com/wiki/Metal_Workshop) | 커뮤니티 · 검색 색인 | 08 |
| E05 | [Herbal Workshop](https://this-war-of-mine.fandom.com/wiki/Herbal_Workshop) | 커뮤니티 · 검색 색인 | 08 |
| E06 | [Stove](https://this-war-of-mine.fandom.com/wiki/Stove) | 커뮤니티 · 검색 색인 | 08, 09 |
| E07 | [Garden](https://this-war-of-mine.fandom.com/wiki/Garden) | 커뮤니티 · 검색 색인 | 09 |
| E08 | [Fuel](https://this-war-of-mine.fandom.com/wiki/Fuel) | 커뮤니티 · 검색 색인 | 07, 09 |
| E09 | [Clean Water](https://this-war-of-mine.fandom.com/wiki/Clean_Water) | 커뮤니티 · 검색 색인 | 09 |
| E11 | [Trade](https://this-war-of-mine.fandom.com/wiki/Trade) | 커뮤니티 · 검색 색인 | 15 |
| E12 | [Bargaining Skills](https://this-war-of-mine.fandom.com/wiki/Bargaining_Skills) | 커뮤니티 · 검색 색인 | 15 |
| E14, N04 | [Scavenge](https://this-war-of-mine.fandom.com/wiki/Scavenge) | 커뮤니티 · 검색 색인 | 07, 12, 13, 14 |
| E15 | [Hints and Tips](https://this-war-of-mine.fandom.com/wiki/Hints_and_Tips) | 커뮤니티 · 검색 색인 | 15 |
| E16 | [Snow](https://this-war-of-mine.fandom.com/wiki/Snow) | 커뮤니티 · 검색 색인 | 09 |
| E17 | [Our Shelter — archive](https://thiswarofmine-archive.fandom.com/wiki/Our_Shelter) | 커뮤니티 · 검색 색인 | 06 |
| E18 | [Heater](https://this-war-of-mine.fandom.com/wiki/Heater) | 커뮤니티 · 검색 색인 | 09 |
| E19 | [Can I move items after placement?](https://steamcommunity.com/app/282070/discussions/0/617320628087655283/) | 검색색인 확인; 현재 규칙 확정에 사용 안 함 | 06 |
| E20 | [Moonshine Still](https://this-war-of-mine.fandom.com/wiki/Moonshine_Still) | 커뮤니티 · 검색 색인 | 08, 15 |
| E21 | [Alcohol Distiller](https://this-war-of-mine.fandom.com/wiki/Alcohol_Distiller) | 커뮤니티 · 검색 색인 | 08, 15 |
| E22 | [Filter](https://this-war-of-mine.fandom.com/wiki/Filter) | 커뮤니티 · 검색 색인 | 08 |
| E23 | [Trap for Small Animals](https://this-war-of-mine.fandom.com/wiki/Trap_for_Small_Animals) | 커뮤니티 · 검색 색인 | 08, 09 |
| E26 | [Vegetables](https://this-war-of-mine.fandom.com/wiki/Vegetables) | 커뮤니티 · 검색 색인 | 08, 09 |
| N03 | [Raids](https://this-war-of-mine.fandom.com/wiki/Raids) | 커뮤니티 · 검색 색인 | 11 |
| N05 | [Locations](https://this-war-of-mine.fandom.com/wiki/Locations) | 커뮤니티 · 검색 색인 | 12 |
| N07 | [Crowbar](https://this-war-of-mine.fandom.com/wiki/Crowbar) | 커뮤니티 · 검색 색인 | 12, 13, 14 |
| N08 | [Lock Pick](https://this-war-of-mine.fandom.com/wiki/Lock_Pick) | 커뮤니티 · 검색 색인 | 12, 13 |
| N09 | [Shovel](https://this-war-of-mine.fandom.com/wiki/Shovel) | 커뮤니티 · 검색 색인 | 12, 14 |
| N10 | [Saw Blade](https://this-war-of-mine.fandom.com/wiki/Saw_Blade) | 커뮤니티 · 검색 색인 | 12 |
| N11 | [Combat](https://this-war-of-mine.fandom.com/wiki/Combat) | 커뮤니티 · 검색 색인 | 13, 14 |
| N12 | [Arica](https://this-war-of-mine.fandom.com/wiki/Arica) | 커뮤니티 · 검색 색인 | 13 |
| N13 | [Back-stab](https://this-war-of-mine.fandom.com/wiki/Back-stab) | 커뮤니티 · 검색 색인 | 14 |
| N15 | [Hotel](https://this-war-of-mine.fandom.com/wiki/Hotel) | 커뮤니티 · 검색 색인 | 12 |
| N16 | [Shelled Cottage](https://this-war-of-mine.fandom.com/wiki/Shelled_Cottage) | 커뮤니티 · 검색 색인 | 12 |
| N17 | [Sniper Junction](https://this-war-of-mine.fandom.com/wiki/Sniper_Junction) | 커뮤니티 · 검색 색인 | 12, 14 |
| N18 | [Warehouse](https://this-war-of-mine.fandom.com/wiki/Warehouse) | 커뮤니티 · 검색 색인 | 13 |
| N20 | [Small Apartment Building](https://this-war-of-mine.fandom.com/wiki/Small_Apartment_Building) | 커뮤니티 · 검색 색인 | 13, 14 |
| N21 | [Airport](https://this-war-of-mine.fandom.com/wiki/Airport) | 커뮤니티 · 검색 색인 | 13 |
| N23 | [Military Vest](https://this-war-of-mine.fandom.com/wiki/Military_Vest) | 커뮤니티 · 검색 색인 | 14 |
| N24 | [Helmet](https://this-war-of-mine.fandom.com/wiki/Helmet) | 커뮤니티 · 검색 색인 | 14 |
| N25 | [All Weapons](https://this-war-of-mine.fandom.com/wiki/All_Weapons) | 커뮤니티 · 검색 색인 | 14 |
| N27 | [Shotgun](https://this-war-of-mine.fandom.com/wiki/Shotgun) | 커뮤니티 · 검색 색인 | 14 |
| N28 | [Assault Rifle](https://this-war-of-mine.fandom.com/wiki/Assault_Rifle) | 커뮤니티 · 검색 색인 | 14 |
| N29 | [Scoped Rifle](https://this-war-of-mine.fandom.com/wiki/Scoped_Rifle) | 커뮤니티 · 검색 색인 | 14 |


## 7. 추가 실측을 위한 우선순위

실제 구현 또는 수치 분석을 시작할 때는 **빌드와 모드 → 시간 경계 → 자원·레시피 → 상태 전이 → 위험·정서의 숨은 변수** 순서로 확인하는 것이 효율적이다. 서로 다른 버전에서 가져온 숫자를 먼저 섞으면 세부 계산이 정밀해도 결론이 틀릴 수 있다.

관찰 양식과 실험 절차는 [21번 문서](21_Balance_Validation_and_Test_Cases.md)에 있다. 새 결과는 확인 날짜·빌드·모드·조건·관찰값을 남기고, 해당 주장과 관련된 문서 및 이 원장의 상태를 함께 갱신한다.

## 8. 개정 기록

| 버전 | 날짜 | 내용 |
|---|---|---|
| 1.0 | 2026-11-13 | 시스템 21개, 출처 원장, 통합 목차 작성. 실제 기능·분석·재구성안·미확인 규칙 구분 |

[목차로 돌아가기](README.md)
