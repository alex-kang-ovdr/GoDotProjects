# 28. Merge Tactics 시즌11 데이터 복원과 버전 충돌 관리

> **v4 추가 조사 안내:** 아래 본문과 개수는 해당 v2/v3 작성 당시의 범위를 설명한다. 현재 통합 자료, 추가 복원, 레벨 미기재 값의 처리와 실행 명령은 [39번 개요](39_research_reconstruction_v4_overview.md), [44번 근거 조정](44_sources_and_level_reconciliation.md), [최신 검증 보고서](reports/validation_report.md)를 기준으로 한다.

> 기준일: **2026-11-17**. 대상은 시즌11의 **2026-10-27 시작 November rotation**이다. 공식 페이지의 수치와 공식 카드풀 이미지를 재구축했다. 클라이언트 내부 테이블·상점 난수·서버 코드를 추출한 것이 아니다.

## 1. 복원한 것과 남겨 둔 것

[merge_tactics_rules.json](data/tables/merge_tactics_rules.json)은106개 레코드로 구성된다. 규칙, 시즌별 구성, 패치의 공개 수치, 공식 이미지에서 확인한 카드풀, 아직 검증하지 않은 필드를 함께 담되 근거 수준으로 분리한다. [modes_sources.json](data/sources/modes_sources.json)의 `MODES_SRC_20`~`26`에서 원문·기준일·적용 범위를 확인할 수 있다.

| 영역 | 재구축한 내용 | 완전 복원으로 주장하지 않는 부분 |
|---|---|---|
| 경기 |4인, 배치/전투 단계, 벤치·건물의 차이 |모든 동시 이벤트 우선순위 |
| 경제 |라운드 5, 합성 보상 1, 기본 판매식 |예외유닛 환급표·상점 내부 가중치 |
| 공용 풀 |2비용 8사본, 3비용 6사본 |4/5비용 사본·표시예약·반환시점 |
| 카드풀 |공식 이미지의 29종·특성 분류 |모든 카드 비용·전체 레벨/별수 스탯 |
| 성장 |공개 패치의 HP·피해·공격간격 |각 공개 수치의 기준레벨/별수 |
| 특성 |Boss/Undead 현공개값, Clan/Rider 충돌값 |상충값의 실제 클라이언트 선택 |
| 장비·Orb |단계별 보상 구성, 장비풀, 삭제 항목 |장비와유닛선택확률·장비별가중치 |
| 모드 변형 |13리그구간의26개 변형 이름 |각 경기 선택확률 |

기본 동작의 근거는 [Merge Tactics 지원](https://support.clashroyale.com/hc/en-us/articles/49484923863067-Merge-Tactics), 최신 경제·풀·회전의 근거는 [November Changes](https://supercell.com/en/games/clashroyale/blog/release-notes/merge-tactics-season-11-november-changes/)다. 규칙이 존재한다는 사실과 내부 구현 순서를 안다는 사실은 구분했다.

## 2. 한 시즌 안에서도 회전과 패치를 나눈다

시즌11은9월1일~12월1일이며 월간 Starsteel 초기화가 없다. Diamond 진입점은4,000이다. 그러나 유닛 풀과 변형 규칙은 월별로 달라지므로 `season_id`만 저장하면 같은 시즌의 다른 경기를 재현하지 못한다. [Season 11](https://supercell.com/en/games/clashroyale/blog/release-notes/merge-tactics-season-11/)

**[재현 설계]** 최소한 다음 세 축을 분리한다.

```text
season_id           = s11
rotation_id         = s11_november_2026_10_27
balance_patch_label = 2026-10-27
balance_effective   = null  # 개별 수치의 실제 적용일 미확정
```

패치 공지는 하나의URL에9월 8일·10월 1일·10월 27일 변경을 함께 보관한다. 그러므로 페이지 상단 발행일 하나를 모든 행의 적용일로 복제하면 안 된다. 패치 단락의 날짜는 `patch_label_date`로 보존하며, 실제 적용일을 별도로 명시하지 않은 수치는 `effective_from:null`로 둔다. 11월 공지는 회전 시작을10월27일로 직접 명시하므로 카드풀·변형 회전의 시작일만 이 근거로 유지한다. 시즌 시작·종료도 명문 날짜를 사용한다. 지원 페이지처럼 발행일이 없으면 발행일은null이며 열람일과 구별한다.

## 3. 공식 카드풀 이미지에서 복원한29종

이번에는 11월 공지의 카드풀 이미지를 직접 열어 초상과 특성 행을 확인했다. 이미지에 비용과 스탯이 없으므로 그 값을 그림에서 읽었다고 주장하지 않는다. 이미지 원본의 SHA-256과1920×1920 크기는 출처 레코드에 남겼다. 아래 29종은 본편의 카드 목록 전체나 시즌11 전체 누적 목록이 아니라 **11월 회전의 구성**이다. [공식 11월 카드풀 이미지](https://clashroyale.inbox.supercell.com/9jtsgmsiuthj/3WqyWrQdQA6jXjN5qs5RUt/0991a672512224981e006efa0e209f4c/Traits_MergeTactics_november26.jpg)

| 특성 |11월 풀에서 확인한 유닛 |수 |
|---|---|---:|
|Clan |Barbarian, Archer, Valkyrie, Archer Queen, Giant |5 |
|Noble |Knight, Musketeer, Princess, Golden Knight, Royal Giant |5 |
|Goblin |Spear Goblin, Dart Goblin, Goblin Machine, Goblin Demolisher, Goblin Cage |5 |
|Undead |Bomber, Royal Ghost, Giant Skeleton, Witch, Skeleton King |5 |
|Forest |Firecracker, Magic Archer, Bandit, Boss Bandit, Baby Dragon |5 |
|Boss |Super Mini P.E.K.K.A, Super Mega Knight |2 |
|Rider |Super Hog Rider, Super Dark Prince |2 |

**[분석]** 일반 지원의 특성 설명에 이름이 있다고 해서 현재 회전 상점에 등장하는 것은 아니다. 예를 들어 지원 문서의 Clan 목록에는Wizard가 있으나 이번 11월 풀 그림에는 없다. `trait_membership`과 `active_rotation_membership`을 같은 테이블로 덮어쓰면 시즌에 빠진 유닛을 상점에 공급할 수 있다.

Supers 4종은 별도 11월 지원 안내에서도 확인된다. 비용5는 일반 Supers 규칙으로 연결했지만 그 외 25종의 비용은 확인한 그림에 없으므로 null이다. 본편의 엘릭서를 가져오거나 출시 비용을 그대로 연결하지 않았다. [11월 변경 지원](https://support.clashroyale.com/hc/en-us/articles/50816352380443-What-s-New-Merge-Tactics) · [Supers 기본 규칙](https://support.clashroyale.com/hc/en-us/articles/49484923863067-Merge-Tactics)

## 4. 공개 스탯을 적용할 때의 필드 단위 패치

10월 1일 공지에서17종의 HP·피해 쌍을,10월 27일 공지에서 변경된 피해·공격간격·룰러 조건을 옮겼다. 이는 **패치에 표기된 수치**다. 공지는 해당 HP·피해의 기준 카드 레벨과 별수를 명시하지 않으므로 `reference_card_level:null`, `reference_star:null`을 유지했다. [시즌11 밸런스 공지](https://supercell.com/en/games/clashroyale/blog/release-notes/merge-tactics-season-11-balance-changes/)

| 사례 |앞선 공개값 |후속 변경 |데이터 해석 |
|---|---|---|---|
|Super Dark Prince |10/1 HP1,000·피해100 |10/27 피해75 |HP를0으로 초기화하지 않고 피해만 후속 패치 |
|Archer Queen |10/1 HP800·피해100 |10/27 공격간격1.67초 |체력·피해·간격의 출처 시점 분리 |
|Super Mini P.E.K.K.A |복수 pancake 발동 |10/27 라운드당1회 |평균 발동 횟수와 최대 발동 횟수 구분 |
|Battle Machine X-Bow |간격0.3초 |10/27 간격0.5초 |공격 간격 증가를 공격 속도 증가로 오독하지 않음 |

**[재현 설계]** 원본 패치 행은 변경 이력을 보존하고, 시점별 해석기는 적용일이 확인된 필드만 시점 질의에 사용한다. 공지 날짜만 있는 행은 별도의 발표 프로필로 비교한다. 일반지원페이지의 수치를 가장최근다운로드했다는 이유로 날짜있는패치를 자동취소하지 않는다. 동시에 날짜가 있는 패치의 실제 서버 반영을 실측했다고도 주장하지 않는다.

다음은 데이터 해석기의 제안 규칙이다.

1. `system=merge_tactics`만 선택한다. 본편의 같은 이름 카드를 제외한다.
2. 회전 멤버십으로 활성 유닛 집합을 만든다.
3. 실제 적용일이 확인된 패치 필드만 날짜 질의에 적용한다. 공지 날짜만 있는 값은 발표 프로필로 분리한다.
4. 기준 레벨/별수 미확정이면 완전한 전투 정의로 출력하지 않는다.
5. 충돌 그룹이 있으면 선택 정책과 대체 값을 함께 내보낸다.

`Archer`와 본편 `Archers`처럼 명칭·소환 개체수도 다를 수 있다. 이름의 유사성으로 HP·비용·개수까지 공유하는 것은 데이터 복원이 아니라 추정이므로 사용하지 않는다.

## 5. 경제와 공용 풀의 보존식

10월 27일 공지는 라운드 수입5, 2비용 유닛8사본, 3비용 유닛6사본을 발표한다. 이들 개별 규칙의 실제 적용일은 별도로 명시하지 않아 데이터에서는null로 둔다. 현 일반 지원의 라운드 수입4 문구와 충돌하므로 데이터에는 두 행을 남겼고, 재현 프로필의 우선 후보는 날짜가 있는5다. [November Changes](https://supercell.com/en/games/clashroyale/blog/release-notes/merge-tactics-season-11-november-changes/)

**[분석]** 수입은 누적 자원뿐 아니라 구매 가능한 조합의 경계를 바꾼다. 다른 수입이 없다는 가상 조건에서4비용 유닛을 산 후5수입이면1이 남고,4수입이면0이 남는다. 이 차이는 다음 합성·상점 구매 시점을 바꿀 수 있다. 이 계산을 실게임의 평균 완성 라운드나 승률 상승률로 해석하면 안 된다.

**[재현 설계]** 공용 풀은 유닛별 수량 장부로 둔다.

```text
정의 사본 = 미배정 사본 + 상점 예약 + 보유 사본 + 임시 점유
```

여기서 `상점 예약`이 실제 원작에 존재하는지는 미공개다. 위 식은 누락과 중복을 찾기 위한 회계 틀이며, 어느 항에 언제 옮길지는 실측해야 한다. 탈락자 유닛 반환, 합성 유닛 판매, 룰러 보상으로 생긴 유닛, 마지막 사본의 동시 구매를 관찰하기 전에는 단순 균등 추첨을 원작의 확률이라고 제공하지 않는다.

합성을 동일 별수2개→다음 별수1개로 모델링할 때 사본 환산량1·2·4·8은 수학적 파생값이다. `MERGE_MERGE_MODEL`은 이 전제가 붙은 재현 설계다. 룰러·장비가 별수를 올려 주는 경우까지 이 식으로 풀 차감을 하면 실제로 존재하지 않던 사본이 생길 수 있다.

## 6. 퀘스트 Orb: 보상 구성과 추첨 확률을 분리

| 단계 | 공개 구성 | 공개하지 않은 값 |
|---|---|---|
| 1 | 엘릭서3 + 장비 또는2비용2성 유닛 | 장비/유닛 분기 확률·각 항목 가중치 |
| 2 | 엘릭서6 + 장비 또는3비용2성 유닛 | 각 장비·유닛의 동일 확률 여부 |
| 3 | 팀 규모+1 +4/5비용3성 유닛 | 4/5비용 선택 확률·유닛 가중치 |

장비 풀은1단계8종, 2단계13종을 열거했고 Legendary Lance의2단계 제외를 별도 행으로 기록했다. **풀에13종이 있다는 사실로 각 확률을1/13로 설정하지 않는다.** [November Changes](https://supercell.com/en/games/clashroyale/blog/release-notes/merge-tactics-season-11-november-changes/)

반면 Grand Warden의 방패 종류 확률은 패치에 Star7%, Lava/Rage/Slowdown 각31%로 공개되어 합계100%를 검증할 수 있다. 이것은 방패 종류라는 특정 확률 공간이다. Orb나 상점 전체 추첨 확률의 대체 자료로 쓰지 않는다. [밸런스 공지](https://supercell.com/en/games/clashroyale/blog/release-notes/merge-tactics-season-11-balance-changes/)

**[재현 설계]** 보상은 `guaranteed_entries`와 `choice_groups`로 나누고, 확률이 없는 선택 그룹은 실측 완료 전까지 시뮬레이션의 사용자 정의 모드에서만 실행한다. 인벤토리 만석·팀 규모 초과·유닛 풀 소진 시 대체 보상 정책도 공개 근거가 없으면 별도로 보류한다.

## 7. 특성 수치의 충돌을 삭제하지 않는다

| 충돌 | 날짜가 있는 패치 | 일반/신규 지원 문구 | 재구축 처리 |
|---|---|---|---|
| 라운드 수입 | 10/27:5 | 일반 지원:4 | 5를 패치 우선 후보로 보존 |
| Clan 공격속도 | 9/8:15/30/60% | 일반 지원:30/50/100% | 두 프로필과 실측 필요 표시 |
| Rider 이동/공격속도 | 9/8:15/30/100/400% | 일반·신규 지원:30/60/120/400% | 두 프로필과 실측 필요 표시 |
| Boss | 10/27 체력15/30/80/200%, 공포0.5/1/2/3초 | 신규 지원과 일치 | 현재 공개 프로필로 정리 |
| Undead | 10/27 1/3/5% | 신규 지원과 일치 | 현재 공개 프로필로 정리 |

근거는 [밸런스 공지](https://supercell.com/en/games/clashroyale/blog/release-notes/merge-tactics-season-11-balance-changes/), [일반 지원](https://support.clashroyale.com/hc/en-us/articles/49484923863067-Merge-Tactics), [신규 지원](https://support.clashroyale.com/hc/en-us/articles/50816352380443-What-s-New-Merge-Tactics)다. 이전 지원 URL은 Orb6/12 문구도 보였지만 현 직접 지원 URL은3/6으로 수정되어 있다. URL과 열람 시점을 함께 기록해야 이 차이를 추적할 수 있다.

**[분석]** 상충 자료는 다음 검증의 입력이다. Clan과 Rider의 두 값을 동시에 켜거나 더 최근에 읽은 쪽으로 무조건 고르면 실측과 계산이 어긋났을 때 원인을 찾기 어렵다. `conflict_group`으로 두 프로필을 연결하면 시뮬레이터에서 차이를 비교하고, 적절한 인게임 관측으로 특정 가설을 제거할 수 있다.

## 8. 변형 규칙의 선택과 가시성

13개 리그 구간별 두 개의11월 변형 이름을 데이터로 제공한다. 변형 이름과 세부 효과 정의를 별개로 두어 회전 표를 바꿔도 효과 구현을 재사용할 수 있도록 했다. 예를 들어 `Gold IV`의 Coaching/Echo Bench와 `Diamond`의 Trait Gift/Trait Dummy를 무조건 하나의 활성 집합으로 합치지 않고 리그·회전 창을 함께 보존한다. [November Changes](https://supercell.com/en/games/clashroyale/blog/release-notes/merge-tactics-season-11-november-changes/)

**[재현 설계]** 유닛은 전장과 벤치에서 다른 가시성 정책을 쓴다. 상대 벤치의 수량은 공개하지만 종류는 숨기는 규칙이므로, 클라이언트로 완전한 유닛ID를 보낸 뒤 그림만 가리는 설계는 관전자·리플레이·디버그 화면을 통한 노출을 만들 수 있다. 실제 서버 패킷 구조는 확인하지 않았으며, 재현 서비스에서는 공개 뷰와 권위 상태를 분리하는 것을 권한다.

장비는 배치 단계에 수동 장착하며 벤치에 두면 해당 라운드에 자동 배정되지 않는다. [Season11 장비 변경](https://supercell.com/en/games/clashroyale/blog/release-notes/merge-tactics-season-11/) 재현 시에는 라운드 마감 직전 장착·판매·합성을 하나의 정렬된 명령 큐로 확정하고, 화면 애니메이션 완료를 전투 시작 조건으로 사용하지 않는 편이 안정적이다.

## 9. 검증 시나리오와 수집 로그

다음은 아직 게임 클라이언트에서 실행하지 않은 실험 계획이다.

| ID | 관찰 설계 | 기록할 값 | 해소할 공백 |
|---|---|---|---|
| MT-01 | 거래 없이 라운드 전후 잔액 비교 | 수입·룰러 보너스·변형 | 기본4/5 충돌 |
| MT-02 | 같은 유닛을 모든 플레이어가 구매 | 누적 사본·표시·구매 실패 | 비용별 풀·예약 |
| MT-03 | 합성 유닛 판매 후 재등장 추적 | 별수·반환 사본·상점 로그 | 반환 시점 |
| MT-04 | 벤치 만석에서 중복 구매 | 구매 성공·합성·환급 순서 | 공간 검증 순서 |
| MT-05 | 특성 비활성/활성의 공격 간격 비교 | 공격 타임스탬프 | Clan/Rider 수치 |
| MT-06 | 퀘스트 Orb 반복 수령 | 보상 항목·룰러·라운드·리그 | 조건부 확률 |
| MT-07 | 장비 보유 유닛이 연쇄 합성 | 장비 소유자·위치·수량 | 장비 승계 |
| MT-08 | 동시HP0인 라운드 | 처리 순서·최종 순위 | 동률 규칙 |
| MT-09 | 패치 경계 전에 시작한 경기 | 규칙revision·종료 수치 | 경기 규칙 고정 |
| MT-10 | 같은 별수에서 카드 레벨 변경 | HP·피해·공격 간격 | 레벨 스케일 함수 |

**[재현 설계]** 최소 로그 필드는 `match_id, season_id, rotation_id, balance_revision, round, phase, player, action, unit_id, stars, card_level, elixir_before, elixir_after, pool_delta, result`다. 관찰 사실과 실험자의 추정을 섞지 않고 `observed_value`, `hypothesis`, `verification_state`를 나눈다. 확률 실험은 원자료 표본수와 조건부 표본수를 함께 남겨야 한다.

## 10. 적용 순서

재현 엔진에 넣을 때는 공식 현재 규칙으로 읽을 수 있는 라운드·벤치·회전부터 적용한다. 그다음 패치 수치를 필드별로 통합하고, 기준 별수와 레벨이 없는 스탯은 실험으로 보완한다. 마지막으로 상점 확률·풀 반환·동률 순서를 검증한다. 이 순서는 근거가 없는 정밀도보다 확실한 경계를 먼저 확보하기 위한 것이다.

현재 공개 자료로는29종 구성, 수입·풀 변경, 여러 패치 수치를 재구축할 수 있지만 모든 캐릭터의 완전한 전투 테이블을 만들 수는 없다. 빈칸을 임의의 숫자로 채우지 않았으므로 데이터를 사용하는 사람이 실측이 필요한 영역을 찾을 수 있다.

관련 문서: [16 Merge Tactics](16_merge_tactics.md) · [27 모드·소셜 계약](27_modes_matchmaking_social_contracts.md) · [20 데이터 모델](20_data_model_and_configuration.md).
