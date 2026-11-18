# Dark and Darker 웹 프로토타입 v15 — 원작 대응과 구현 범위

**문서·출처 확인일: 2026-11-18(KST)**  
**비교 기준: Early Access Season 11 / Hotfix #132.** 원천 데이터 일부는 HF130, 버전 미표기 또는 구버전 자료다. 각 자료의 상태를 아래에 구분했다.

## 1. 이동 조작의 기준

원작 PC 조작의 중심은 **WASD 이동 + 마우스 시점 회전**이다. `A/D`는 좌우 이동이며 회전 키가 아니다. `Shift`는 천천히 걷기, `Q/E`는 직업 스킬이다. v15는 이 구분에 맞춰 입력을 연결했다. 기본키는 이용자가 원작 설정에서 변경할 수 있으므로 아래 표는 기본 배치의 대응표다. [입력 자료: Games Lantern](https://gameslantern.com/article/dark-and-darker-beginners-guide), [보조 자료: DefKey](https://defkey.com/dark-and-darker-shortcuts).

**방향키 회전은 웹 접근성 보조 기능**이다. PC에서 설정의 방향키 시점 보조를 켰거나 브라우저가 마우스 잠금을 허용하지 않을 때 사용한다. 원작 기본 조작으로 소개하지 않는다. 모바일에서는 왼쪽 이동 패드와 오른쪽 시점 드래그를 동시에 사용한다. 터치 조작에는 마우스 잠금이 필요하지 않다.

## 2. 자료의 버전과 근거 수준

이 문서에서 “반영”은 해당 규칙 또는 수치를 웹 시뮬레이션에 연결했다는 뜻이다. 원작 클라이언트의 모든 행동·프레임·피해 결과와 같다는 뜻으로 사용하지 않는다.

| 자료 구분 | 사용 범위 | 유지하는 한계 |
| --- | --- | --- |
| 공식 패치 공지 | 공지가 명시한 변경 사항과 입력 의미 | 공지 한 편으로 전체 게임의 수치·수식을 확정하지 않는다. |
| R1 커뮤니티 스냅숏 | 개별 직업·스킬·주문·공격 시간의 선별 값 | `community_snapshot` 상태와 행별 `declared_patch`를 유지한다. |
| 구버전·버전 미확인 자료 | 비교 및 후속 조사 | HF132 검증값으로 자동 승격하지 않는다. |
| 웹 구현값 | 월드 스케일, 모션·충돌체, 단순화한 회복·경제 등 | 원작 수치로 재인용하지 않는다. |
| 자동 테스트 | 입력 상태, 규칙 분기, 소유권·정산의 프로그램 동작 | 원작과의 실측 동등성 또는 실제 기기의 성능 인증에 해당하지 않는다. |

복원 자료는 `DarkAndDarker_Original_Data_Rebuild_20261117`, 식별자 `dad-reconstruction-20261117-r1`이다. 원천 관측일은 **2026-11-17**이며, R1의 `metadata.json`은 공식 추출물·전체 게임 덤프·즉시 실행용 데이터가 아님을 명시한다. R1에 수록된 10개 직업 기본값, 55개 출처, 10개 충돌, 24개 미복원 영역은 조사 범위다. 이를 v15의 구현 완료 수나 현행 원작의 전체 직업 수로 해석하지 않는다.

기준 패치 공지는 [공식 Steam 공지 목록](https://steamcommunity.com/app/2016590/announcements/)에서 재확인했다. **Season 11은 2026-10-09, HF132는 2026-11-12 공지**를 사용한다. R1의 원래 출처 URL인 [Season 11](https://darkanddarker.com/news/223), [HF132](https://darkanddarker.com/news/230)도 보존한다. 이 문서를 추가하면서 R1의 관측일·증거 상태·미확인 필드를 변경하지 않았다.

### 버전 차이가 남아 있는 주요 항목

| 항목 | R1 상태 또는 재확인 내용 | v15 처리 |
| --- | --- | --- |
| Fighter / Ranger / Wizard 기본 HP·선별 스킬·주문 | HF132 표기의 커뮤니티 스냅숏 | 선별 반영. 자동 생성 수치와 수동 설명이 섞인 위키임을 유지한다. |
| Arming Sword / Rondel Dagger 공격 시간 | HF130 스냅숏 | 기본 공격 시간 일부를 사용하며 HF132 실측 완료로 표시하지 않는다. |
| Battle Axe / Longbow / Crossbow 자료 | HF132 표기의 스냅숏 | 확인된 필드와 웹 임의 시간을 구분한다. |
| Movement 페이지 | 재확인 시에도 HF73 자료 경고 표시 | 기본 rating과 월드 이동 변환을 현행 원작 공식으로 주장하지 않는다. |
| Healing Potion | R1 개별 행에 패치 버전 없음 | 선택한 기본 사용·회복 패턴만 반영한다. 전 희귀도·보정식을 복원하지 않는다. |
| 방패의 저항·경직 참고표 | R1에서 버전 확인 전 런타임 반입 차단 | v15 단순 방어 판정을 원작 저항 계산의 완성으로 표시하지 않는다. |

참조: R1 `data/metadata.json`, `data/sources.json`, `data/attack_timings.json`, `data/unknowns.json`, `docs/01_Analysis_Report.md`, `docs/09_Conflicts_And_Unknowns.md`. 원작 이동 자료의 경고는 [Movement](https://darkanddarker.wiki.spellsandguns.com/Movement)에서 확인했다.

## 3. PC 기본키와 모바일 대응

| 행동 | 원작 PC 기본 배치 / v15 PC | v15 모바일 | 구현상 구분 |
| --- | --- | --- | --- |
| 전후·좌우 이동 | `W/S`, `A/D` | 왼쪽 이동 패드 | 대각선 입력의 이동량을 제한한다. |
| 시점 회전 | 마우스 이동 | 오른쪽 시점 영역 드래그 | 모바일은 포인터 잠금을 요청하지 않는다. |
| 걷기 | `Shift` 유지 | 걷기 버튼 유지 | 공통 달리기 기능으로 사용하지 않는다. |
| 웅크리기 | `Ctrl` 유지 | 웅크리기 버튼 유지 | 시점 높이와 몸체 판정·이동에 반영한다. |
| 점프 | `Space` | 점프 버튼 | 원작의 전체 착지·공중 이동 공식을 복원한 것은 아니다. |
| 주 행동 | 마우스 왼쪽 버튼 | 공격 버튼 | 근접 공격, 활 당기기·놓기, 쇠뇌 발사, 선택 도구 사용으로 분기한다. |
| 보조 행동 | 마우스 오른쪽 버튼 | 방어/시전 버튼 | 장비와 선택 주문에 따라 방어 또는 주문 시전으로 분기한다. |
| 직업 스킬 1·2 | `Q / E` | 직업별 이름이 표시된 스킬 버튼 | 레인저의 백스텝을 모든 직업의 회피로 확대하지 않는다. |
| 상호작용·수색·탈출 | `F` 및 필요한 경우 유지 | 수색 버튼 및 유지 | 유지가 풀리면 진행 중 수색·탈출을 취소한다. |
| 배낭 | `Tab` | 배낭 버튼 | 기존 `I` 안내를 기본키로 사용하지 않는다. |
| 무기 세트 | `1 / 2` | 무기 1 / 무기 2 | 근접·활·마법을 전 직업 공용 모드로 제공하지 않는다. |
| 도구 슬롯 | `3 / 4` | 물약 / 횃불 선택 | v15의 도구 슬롯·잔량 모델은 축소 구현이다. |
| 무기 넣기·꺼내기 | `X` | 무기 넣기 버튼 | 한 번 누를 때마다 상태를 바꾼다. |
| 휴식 | `G` | 휴식 버튼 | 한 번 누를 때마다 앉기/일어나기를 바꾼다. |
| 장전·특수 행동 | `R` | 장전/특수 버튼 | 원거리 장전, 도끼 특수 공격, 선택 주문 해제 등 현재 장비에 따라 분기한다. |
| 메뉴 | `Esc` | 일시정지 버튼 | 오프라인 웹앱의 일시정지 기능이다. 원작 온라인 전투의 시간 정지로 해석하지 않는다. |

입력 표의 근거는 [Games Lantern의 기본키 안내](https://gameslantern.com/article/dark-and-darker-beginners-guide), [DefKey 입력 목록](https://defkey.com/dark-and-darker-shortcuts), 공식 패치의 입력 변경 사항이다. DefKey는 이번 재확인에서 직접 페이지 열기가 403으로 제한되어 보조 참고로 남겼다. 오래된 안내의 `C = 웅크리기`는 그대로 채택하지 않았다. **HF119는 기본 C 웅크리기 배치를 제거하고 C를 전투 메시지 원형 메뉴에 배치했다.** [공식 Steam 공지 피드: HF119](https://store.steampowered.com/news/posts/?enddate=1782971639&feed=steam_community_announcements).

v15의 `M` 지도 표시, `F1` 도움말/메뉴, `F2` 사진 모드, 개발자 표시 키와 배낭 안의 `R` 아이템 회전은 웹앱 편의 기능이다. 원작 기본키 일치 범위에 포함하지 않는다. 배낭 6×4 회전 배치 역시 기존 웹 프로토타입의 구조다.

### 모바일에서 지속 입력을 처리하는 방식

왼쪽 이동, 오른쪽 시점, 공격·방어·수색 버튼은 각각 다른 손가락 입력을 소유한다. 이동 중 시점을 돌리거나 방어를 유지할 수 있도록 여러 포인터를 별도로 처리한다. 버튼 밖에서 손을 떼어도 해당 입력을 끝낸다.

활은 공격 버튼을 유지해 준비한 뒤 **놓아서 발사**하고, 주문은 방어/시전 버튼을 유지해 시전을 마친 뒤 **놓아서 발동**한다. 준비가 끝나기 전에 놓으면 발사·시전을 취소한다. 화면 전환, 입력 취소, 포인터 캡처 손실, 화면 회전, 앱의 포커스 상실 시에는 입력을 정리해 이동이나 시전이 계속 붙어 있지 않게 한다. 취소 이벤트를 정상 발사로 취급하지 않는다.

터치 UI는 자동 감지하며 설정에서 켜기/끄기를 선택할 수 있다. 버튼이 보이지 않는 터치 기기에서는 터치 조작을 켜기로 지정한다. 이 항목은 **이 웹앱의 모바일 입력 지원**을 설명하며 실기기별 동작·성능 검증 범위는 배포본 테스트 보고서를 따른다. 구현 근거: `src/touch.js`, `src/app.js`.

## 4. 직업과 장비

| v15 직업 | 내부 기본 HP | 기본으로 제공하는 웹 출전 장비 | 스킬 1 / 스킬 2 |
| --- | ---: | --- | --- |
| 파이터 | 100 | 아밍 소드·라운드 실드 / 크로스보우 / 천 방어구 | 질주 / 두 번째 바람 |
| 레인저 | 91 | 롱보우 / 아밍 소드 / 천 방어구 | 백스텝 / 야전 식량 |
| 위자드 | 83.5 | 마법 지팡이 / 론델 대거 / 천 방어구 | 주문 기억 / 명상 |

기본 HP는 R1의 [Fighter](https://darkanddarker.wiki.spellsandguns.com/Fighter), [Ranger](https://darkanddarker.wiki.spellsandguns.com/Ranger), [Wizard](https://darkanddarker.wiki.spellsandguns.com/Wizard) HF132 표기 스냅숏에 근거한다. 표의 **출전 장비 구성과 스킬 조합은 웹에서 각 플레이 방식을 체험하도록 선택한 구성**이며 원작의 신규 캐릭터·Squire 지급품을 그대로 복원한 목록이 아니다.

직업별 장착 가능 목록과 무기 종류를 검사한다. 파이터·레인저에게 위자드 주문을 공통 지급하지 않으며, 무기 세트 교체 시 장비 인스턴스와 장전 상태를 유지한다. 현재는 5개 장착 슬롯과 3개 직업만 구현했다. 장신구는 수집·장착·보관 대상으로 제공하며 실제 마나나 마법 피해 보너스를 부여하지 않는다. 원작의 전체 방어구 슬롯, 모든 무기·특성 조합, Weapon Mastery 같은 장착 제한 예외, 레벨별 특성 해금, 모든 능력치 보정은 미구현이다.

## 5. 직업 스킬과 자원

| 스킬 | 선별 근거 값 | v15 동작과 남은 차이 |
| --- | --- | --- |
| 질주 | 이동 rating +50, 6초, 재사용 28초 | 파이터 Q로만 활성화한다. rating의 월드 이동 변환은 웹 스케일이다. |
| 두 번째 바람 | 최대 HP의 50%를 12초에 회복, 1회 | 파이터 E로 지속 회복한다. 일반 휴식으로 사용 횟수를 돌려주지 않는다. |
| 백스텝 | 4m, 0.2초, 재사용 12초 | 레인저 Q로 뒤로 이동한다. 웹 충돌체·월드 스케일을 사용하며 공통 무적 회피는 없다. |
| 야전 식량 | 기본 회복 40, 2회, 재사용 24초 | 레인저 E. 사용 시간 1.5초는 웹 근사이며 원작 회복 보정 전체는 적용하지 않는다. |
| 주문 기억 | 주문을 기억하여 선택하는 능력 | 위자드 Q로 선택 UI를 연다. 3종 고정 목록이며 전체 주문 장착·기억 용량 계산은 미구현이다. |
| 명상 | 지속 24초, 재사용 45초 | 위자드 E. 6초마다 부족한 주문 횟수 1회를 복원하는 웹 근사를 사용한다. |

근거: R1 `data/abilities.json`, [Fighter](https://darkanddarker.wiki.spellsandguns.com/Fighter), [Ranger](https://darkanddarker.wiki.spellsandguns.com/Ranger), [Wizard](https://darkanddarker.wiki.spellsandguns.com/Wizard). 질주 +50과 두 번째 바람 50% 변경은 [Season 11 공식 공지](https://steamcommunity.com/app/2016590/announcements/)에서도 확인한다. 지속시간·횟수·재사용 시간까지 한 공식 문서가 모두 확정하는 것은 아니다.

v15는 공용 스태미나·마나100을 제거하고 HP, 회복가능 HP, 스킬 사용 횟수·재사용 시간, 장전된 탄약·예비 탄약, 주문별 횟수를 구분한다. `rules.js`의 두 번째 바람 `cooldown: 0`은 내부에서 일반 재사용 타이머를 사용하지 않는다는 표현이다. **R1의 미확인 재사용 시간을 원작 0초로 확정한 것이 아니며**, 실제 사용은 1회 제한을 따른다.

명상의 원작 설명에는 주문 tier별 복원 비용과 복원 능력치가 존재한다. [Wizard](https://darkanddarker.wiki.spellsandguns.com/Wizard)의 tick 설명과 [Spell Restoration](https://darkanddarker.wiki.spellsandguns.com/Spell_Restoration)의 설명에도 차이가 남아 있다. v15는 이를 검증된 하나의 공식으로 합치지 않았다. 일반 휴식에 의한 주문 복원, 모닥불·다른 직업·회복 아이템을 통한 횟수 복원은 현재 구현 범위 밖이다.

## 6. 주문 선택·시전

위자드는 Q로 선택 UI를 열고 화염구·얼음 화살·전격 중 하나를 선택한다. PC는 Q를 유지하며 항목을 가리킨 뒤 놓는 방식과 항목 클릭을 지원하고, 모바일은 주문 기억 버튼과 항목 터치를 사용한다. 마법 지팡이를 든 상태에서 우클릭 또는 방어/시전 버튼을 유지하고, 준비가 끝난 뒤 놓아 사용한다. R 또는 특수 버튼으로 선택 주문을 해제하면 지팡이의 방어 행동으로 돌아갈 수 있다.

| 주문 | 기본 시전 시간 | 최대 횟수 | 반영한 기본 효과 | 근사·미구현 범위 |
| --- | ---: | ---: | --- | --- |
| 화염구 | 2초 | 4 | 직접 20, 폭발 10, 3초간 총 연소 3, 투사체 속도 12 | 폭발 반경 2.3, 모양·피격체·보정식은 웹 구현이다. |
| 얼음 화살 | 1.25초 | 5 | 직접 30, 투사체 속도 14, 1초간 이동 둔화 20% | 원작 행동속도 감소와 모든 상태 효과의 상호작용은 복원하지 않았다. |
| 전격 | 1.25초 | 5 | 직접 20, 1초간 연소 1 | 웹에서는 단순 조준선 판정·사거리 8을 사용한다. 부위·상태별 실제 결과를 보장하지 않는다. |

기본 효과 출처: R1 `data/spells.json`, [Wizard 주문 표](https://darkanddarker.wiki.spellsandguns.com/Wizard). 표의 피해는 **기본 성분**이며 장비·마법력·대상 저항까지 반영한 최종 피해가 아니다. HF132의 피해 보너스 적용 비율 변경을 모든 기본 피해의 일괄 50% 감소로 해석하지 않았으며, 완전한 원작 피해 계산기는 구현하지 않았다.

원작의 전체 주문, 기억 우선순위·용량 초과 규칙, 특성, 시전속도 곡선, 마법 반사·침묵·다양한 저항과 버프, 문 파괴 등은 미구현이다. 선택 UI의 모양과 모바일 배치는 웹에서 조작하기 위한 구성이다.

## 7. 이동·회복·전투의 정확도 경계

### 이동

걷기 배율 `0.65`는 Season 11 공지를 기준으로 반영했다. 다음 값은 **웹 이동 구현값**이다: 기본 rating 300, rating→월드 속도 `0.01`, 웅크리기 배율 `0.6`, 후진 배율 `0.6`, 서 있는 시점 높이 1.65, 웅크린 시점 높이 1.05. [공식 공지](https://steamcommunity.com/app/2016590/announcements/), [구버전 경고가 있는 Movement 자료](https://darkanddarker.wiki.spellsandguns.com/Movement).

공식 공지의 후진 패널티 변경 표현과 구버전 이동 문서를 조합해 `0.6`을 현행 원작의 정확한 후진 계수라고 단정하지 않는다. 장비 중량·장비 이동 보정·걷기·웅크리기·행동 중 감속을 적용하지만, 원작의 능력치별 곡선과 모든 중첩 순서를 구현한 것은 아니다. 물약·야전 식량 사용 중 50% 이동 감속은 웹 근사다.

### 회복

물약은 3초 사용 후 20초에 걸쳐 총 20을 회복하는 기본 패턴을 사용한다. [Potion of Healing](https://darkanddarker.wiki.spellsandguns.com/Potion_of_Healing)의 선택한 탭에 근거하며 희귀도별 지속시간·회복 보정·중첩 규칙 전체를 적용하지 않는다. 이전의 즉시 고정 회복과는 자원 사용 순서가 달라졌다.

피해의 일부를 회복가능 HP로 기록하고 G 휴식으로 실제 HP로 전환한다. [Healing](https://darkanddarker.wiki.spellsandguns.com/Healing)은 기본 휴식을 **2초마다 회복가능 HP 1 회복**으로 설명하며, 평균값 0.5HP/s의 연속 회복과 구분한다. v15의 휴식도 이 간격을 기준으로 한다. 회복가능 비율 `0.65`는 일반 피해에 대한 커뮤니티 설명을 바탕으로 단순화했으며, 피해원별 다른 변환율·회복 보너스·풀 갱신의 모든 예외는 미구현이다. [Health](https://darkanddarker.wiki.spellsandguns.com/Health), [Healing](https://darkanddarker.wiki.spellsandguns.com/Healing).

### 공격·방어

R1 공격 시간은 준비, 타격, 다음 연계 회복, 단발 종료 회복을 구분한다. 이 값들을 모두 더한 하나의 회복 시간으로 사용하지 않는다. v15는 기본 공격 연계와 종료 분기를 나누되, 원작 애니메이션·소켓·행동속도 보정을 복원하지 않았다. 특히 지팡이 근접 시간, 롱보우 당기기 1.2초·장전 2.5초, 크로스보우 장전 3.2초 등은 웹 근사다. [Attack Times](https://darkanddarker.wiki.spellsandguns.com/Attack_Times), [Arming Sword](https://darkanddarker.wiki.spellsandguns.com/Arming_Sword), [Rondel Dagger](https://darkanddarker.wiki.spellsandguns.com/Rondel_Dagger), [Battle Axe](https://darkanddarker.wiki.spellsandguns.com/Battle_Axe).

배틀 액스는 기본 1·2타와 R 특수 공격을 연결했다. R1의 별도 `secondary`·`whirlwind` 행은 일반 좌클릭 연계에 섞지 않고 미구현으로 남겼다. 아밍 소드·론델 대거는 기본 3타만 선별 반영하며, 자료에 있는 모든 특수 분기를 지원하지 않는다.

방패·무기 방어는 방향성 충돌체를 사용한다. 원작 Season 11의 양손 무기 Impact Guard 도입을 참고하여 활·쇠뇌·지팡이도 장비에 맞는 보조 행동을 갖게 했지만, **Impact Resistance / Impact Power의 전체 계산·정확한 반격 창·원본 모션은 미구현**이다. 방어 버튼을 누르면 모든 정면 피해가 무조건 막힌다는 모델로 설명하지 않는다. [Season 11 공식 공지](https://steamcommunity.com/app/2016590/announcements/).

몸체의 구·방어의 방향성 박스·무기 궤적 구간·맵 벽 충돌은 웹 시뮬레이션의 근사다. 머리·몸통·다리의 구분과 벽에 막히는 검사를 갖췄더라도 원작 메시 충돌, 손 위치, 무기 끝과 자루의 피해 차이, 서버 판정·지연 보정까지 동일한 것은 아니다. 숫자 표의 적용으로 원작 유효 사거리가 복원됐다고 주장하지 않는다.

## 8. 탈출 → 보관 → 판매 또는 재출전

v15의 영구 진행은 `src/progression.js`의 로컬 프로필이 처리한다. 전리품 가치의 자동 골드 전환을 없애고 **물품 소유권과 골드를 별도로 정산**한다. 탈출 후 상인에게 물품을 판매하는 기본 흐름은 [Games Lantern의 생환 안내](https://gameslantern.com/article/dark-and-darker-beginners-guide)를 참고했다. v15의 가격·보관 용량·지급품은 별도 웹 규칙이다.

| 시점 | v15 소유권·정산 |
| --- | --- |
| 출전 장비 선택 | 직업별 슬롯에 보관 아이템의 참조를 저장한다. 아직 아이템을 차감하지 않는다. |
| 출전 시작 | 선택한 실물 장비를 보관함에서 차감하고 진행 중 출전을 기록한다. 동일 아이템의 다른 선택도 정리한다. 빈 슬롯에는 웹 기본 지급 장비를 제공한다. |
| 탈출 성공 | 반출한 가방 아이템과 착용 장비를 보관한다. 주운 골드만 골드 잔액에 더한다. |
| 물품 판매 | 사용자가 판매를 누른 경우에만 해당 아이템을 제거하고 웹 기준 판매액을 지급한다. |
| 다음 출전 | 보관 장비를 다시 선택해 가져갈 수 있다. |
| 사망·포기 | 가져간 장비와 해당 출전의 획득물을 잃는다. 다른 보관 물품과 기존 골드는 유지한다. |
| 진행 중 새로고침·종료 후 재실행 | 진행 중 출전을 한 번만 실패 처리한다. 반출하지 못한 장비를 보관함에 되돌려 주지 않는다. |
| 훈련 | 선택한 보관 장비를 차감하지 않고 영구 물품·골드·출전 통계를 지급하지 않는다. |
| 개발자 기능 사용 출전 | 획득물·골드를 영구 보상으로 인정하지 않는다. |

아이템에는 영구 `instanceId`와 실행용 `uid`를 나누어 저장한다. 중복 결과·중복 아이템 참조를 재입금하지 않고, 로딩할 때 아이템 정의에서 능력치를 다시 구성한다. 기존 schema13 골드·출전·탈출 통계를 schema15로 이관한다. 구현 검사는 `tests/test_progression.cjs` 및 `tests/progression_results.json`에 기록한다.

기본 지급 장비는 `Supplied`, 판매 가치 0으로 보관하며 판매를 막는다. `Looted / Handled / Supplied` 상태 표시는 보존하지만, 원작 모든 퀘스트·거래·모드별 판정 전체를 구현하지 않았다. HF132의 Supplied 거래 제한은 관련 근거이나, v15의 고정 가격과 단일 판매 버튼을 공식 상인 시스템으로 간주하지 않는다. [HF132 공식 공지](https://steamcommunity.com/app/2016590/announcements/).

보관함은 이 프로토타입에서 용량 제한 없이 제공한다. 서버 계정, 캐릭터별 공식 보관함 크기, 상인별 가격, 퀘스트, 경매장, 세금·입장료·장비 점수 경제는 미구현이다. 저장은 브라우저의 로컬 저장에 의존하므로 저장 차단·데이터 삭제·다른 브라우저 또는 별도 파일 주소로 실행하면 같은 프로필의 유지가 보장되지 않는다. 저장 실패 시에는 UI 안내를 확인해야 한다.

**탄약과 물약의 활성 잔량은 아직 전량 아이템 인스턴스 방식이 아니다.** 해당 출전의 장전·예비 탄약·물약 사용 카운터를 이용하며, 사용 중인 잔량을 그대로 물품으로 반출·재출전하는 완전한 소모품 경제는 미구현이다. 가방에 남아 있는 반출 아이템과 활성 카운터는 구분한다.

## 9. 구현하지 않은 원작 영역

| 영역 | 현재 v15 상태 |
| --- | --- |
| PvP·온라인 | 싱글플레이. 서버 권위, 매칭, 파티, 다른 플레이어, 거래·채팅·음성, 재접속 복구 없음. |
| 전체 직업·빌드 | 3개 직업의 고정 스킬 조합. 다른 직업·전체 특성·레벨·모든 주문·변신·연주 없음. |
| 원작 맵 | 절차 생성 웹 던전과 자체 배치. 원작 모듈, 다층 캠페인, 모든 탈출 수단·용량·출현 조건을 복원하지 않음. |
| Dark Swarm·광원 | 원작의 단계별 영역·광원 보호·연료·마지막 단계 규칙 미구현. 4번 횃불은 선택·외형 표현이며 원작 연료 시스템이 아님. 기존 플레이어 조명과 결합됨. |
| 적·보스 | 웹에서 만든 적 상태 머신·수치·보스 패턴. R1 몬스터 전체 데이터와 원작 AI·공격 애니메이션을 이식하지 않음. |
| 정밀 충돌 | 구·박스·구간 근사. 원작 메시·소켓·hitstop·모든 관통·벽/천장 차폐와 네트워크 판정의 동등성 미검증. |
| 피해·방어·이동 공식 | 능력치, 저항, 부위, 옵션 보정, 이동 중첩 등 전체 계산 순서 미구현. |
| 경제·장비 | 웹 가격·드롭 풀·보관함. 원작 모든 희귀도·랜덤 옵션·제작·상인·퀘스트·시장·입장료·사망 복구 없음. |
| 모드 규칙 | 웹의 연습/난이도 구분. 원작 Normal Campaign / High-Roller / Arena / Custom Play의 동일 구현 아님. |
| 입장 보호 | HF132의 입장·층 이동 후 5초 보호 미구현. |
| 원본 그래픽·애니메이션·음향 | 웹의 자체 지오메트리·재질·모션·효과. 원작 에셋·모션을 복원한 결과가 아님. |

공식 공지에는 위 영역의 현재 규칙이 존재한다. 이 표는 공지의 존재와 v15의 구현 완료를 구분하기 위한 것이다. 근거: [Season 11 / HF132 공식 공지](https://steamcommunity.com/app/2016590/announcements/), R1 `docs/05_Enemies_Dungeon_Economy.md`, `docs/09_Conflicts_And_Unknowns.md`.

## 10. 검증 결과를 읽는 방법

`src/rules.js`는 적용 값과 근사 목록, `src/core.js`는 아이템·충돌 기본 자료, `src/game.js`는 시뮬레이션, `src/progression.js`는 소유권, `src/app.js`와 `src/touch.js`는 PC·모바일 입력을 담당한다. 이 문서는 이 파일들의 v15 구현 범위와 R1 근거를 대응한다.

자동 테스트가 통과하면 검사한 입력·상태 전환·정산 조건이 구현대로 동작한다는 근거가 된다. **원작 게임과 동일한 플레이감·모든 수치·모든 실제 모바일 기기 동작을 검증했다는 근거는 아니다.** 실제 실행·화면 검증 여부와 테스트 수는 배포본 테스트 보고서 및 생성된 결과 JSON을 기준으로 확인한다. 실행하지 못한 환경을 통과한 것으로 표시하지 않는다.

후속 원작 정합성 작업은 각 미복원 항목에 대해 버전이 명시된 자료와 원작 실측을 확보한 뒤 진행한다. 특히 공격 모션·유효 사거리·장전 및 시전속도·회복 tick·피해식·맵·드롭률은 실제 비교 조건을 기록해야 한다. R1의 `null`을 0으로 채우거나 한 페이지의 버전 갱신으로 데이터셋 전체를 최신 검증 완료로 바꾸지 않는다.

## 11. 출처 목록

아래 URL의 확인 기준일은 **2026-11-18(KST)**다. R1에서 이어받은 원천 관측일은 **2026-11-17**이며, 직접 조회가 제한된 자료와 구버전 자료는 별도로 표시했다.

| 출처 | URL | 용도·주의점 |
| --- | --- | --- |
| IRONMACE 공식 Steam 공지 | https://steamcommunity.com/app/2016590/announcements/ | Season 11·HF132 변경 사항. 게시일과 문서별 범위를 확인. |
| Season 11 원래 공식 URL | https://darkanddarker.com/news/223 | R1 출처 URL 보존. 본문 비교는 공식 Steam 게시물 이용. |
| HF132 원래 공식 URL | https://darkanddarker.com/news/230 | R1 출처 URL 보존. 본문 비교는 공식 Steam 게시물 이용. |
| HF119 공식 Steam 피드 | https://store.steampowered.com/news/posts/?enddate=1782971639&feed=steam_community_announcements | C 키 기본 배치와 메시지 입력 변경. |
| Games Lantern 입문 가이드 | https://gameslantern.com/article/dark-and-darker-beginners-guide | 커뮤니티 기본키·생환 흐름. 과거 모드·맵 설명은 현행 근거로 사용하지 않음. |
| DefKey 입력 목록 | https://defkey.com/dark-and-darker-shortcuts | 보조 조작 참고. 이번 직접 열기는 403 제한. |
| Fighter | https://darkanddarker.wiki.spellsandguns.com/Fighter | HF132 표기 직업 자료. 수동 설명의 최신성은 별도. |
| Ranger | https://darkanddarker.wiki.spellsandguns.com/Ranger | HF132 표기 직업 자료. |
| Wizard | https://darkanddarker.wiki.spellsandguns.com/Wizard | HP·스킬·주문. 자동 데이터·수동 설명 혼재. |
| Attack Times | https://darkanddarker.wiki.spellsandguns.com/Attack_Times | 공격 시간 필드의 의미. 원본 모션을 제공하지 않음. |
| Arming Sword | https://darkanddarker.wiki.spellsandguns.com/Arming_Sword | R1 HF130 공격 스냅숏. |
| Rondel Dagger | https://darkanddarker.wiki.spellsandguns.com/Rondel_Dagger | R1 HF130 공격 스냅숏. |
| Battle Axe | https://darkanddarker.wiki.spellsandguns.com/Battle_Axe | R1 HF132. 기본·특수·다른 공격 분기 구분 필요. |
| Movement | https://darkanddarker.wiki.spellsandguns.com/Movement | HF73 구버전 경고. 현행 전체 이동 공식으로 사용하지 않음. |
| Potion of Healing | https://darkanddarker.wiki.spellsandguns.com/Potion_of_Healing | 사용 시간·지속 회복의 선택 탭. |
| Health | https://darkanddarker.wiki.spellsandguns.com/Health | 회복가능 HP. WIP 경고가 있어 예외까지 확정하지 않음. |
| Healing | https://darkanddarker.wiki.spellsandguns.com/Healing | 2초 간격 휴식과 회복 규칙. 오래된 예시와 현행 개별 아이템 값을 구분. |
| Spell Restoration | https://darkanddarker.wiki.spellsandguns.com/Spell_Restoration | tier별 복원 모델·일반 휴식으로 회복되지 않는 횟수형 스킬. 개별 직업 페이지와 시간 설명 차이 있음. |

배포본에 보존한 원천 자료: `reference/R1/data/`와 `reference/R1/docs/`. 원래 패키지는 `DarkAndDarker_Original_Data_Rebuild_20261117`이며, 작업 중 복원 경로는 `reference/rebuild/DarkAndDarker_Original_Data_Rebuild_20261117/`였다. v15는 이 원천 자료의 증거 상태를 바꾸지 않고, 선별해 적용한 구현과 남은 차이를 본 문서에 기록한다.
