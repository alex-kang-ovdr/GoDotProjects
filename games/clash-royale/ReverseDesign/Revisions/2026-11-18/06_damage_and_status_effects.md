# 06. 능력치·피해·방패·상태 효과

> **확장판 안내:** 초판2026-11-13에2026-11-17 공개 데이터 재구축을 추가했다. 최신 수치·충돌·미확정 값의 사용 범위는 [23번](23_data_reconstruction_overview.md)과 각 상세 데이터 문서를 함께 확인한다.

> 조사 기준일: 2026-11-13 · 주 대상: 일반 1대1 전투  
> **[확인]** 공식 공개 규칙·밸런스 사례, **[분석]** 설계 해석, **[재현 설계]** 구현 모델, **[검증 필요]** 실측해야 하는 세부 판정. 수식·자료형·처리 순서는 제안이며 원작 코드의 복원이 아니다.

## 1. 시스템의 핵심

**[분석]** 전투 결과는 HP와 DPS만으로 정해지지 않는다. 첫 공격, 공격 간격, 투사체 이동, 범위, 대상 수, 방패, 상태 효과가 특정 상호작용의 결과를 바꾼다. 밸런스의 실질적 단위는 `숫자 5%`뿐 아니라 `한 번 더 때려야 하는가`, `타워에 한 번 닿는가`, `기절로 충전이 끊기는가`다.

**[확인]** 공식 카드 지원은 카드 레벨 증가가 HP와 공격력을 높인다고 설명한다. 별도의 Star Level은 외형에 영향을 주며 게임플레이 효과는 없다. 따라서 카드 레벨·외형 단계·특수 형태를 같은 배수로 합쳐서는 안 된다. [C21](https://support.clashroyale.com/hc/en-us/articles/49484924205595-Cards-Decks)

## 2. 능력치의 계층

| 계층 | 대표 필드 | 설명 |
| --- | --- | --- |
| 카드 기본 정의 | 비용, 희귀도, 카드 종류 | 전투 전 선택과 성장 체계 |
| 전투 개체 정의 | HP, 공격 대상, 속도, 반경 | 소환된 개체의 기본 동작 |
| 공격 정의 | 피해, 공격 간격, 첫 공격, 사거리 | 타격 방법과 시간 |
| 투사체 정의 | 속도, 유도, 관통, 범위 | 피해 도달 조건 |
| 형태 정의 | 기본·진화·히어로 | 추가 행동·효과·조건 |
| 레벨 해석 | 레벨별 수치, 모드 제한 | 현재 전투에 사용할 확정 값 |
| 일시 상태 | 감속, 기절, 분노, 보호막 등 | 전투 중 상태 변화 |

**[재현 설계]** 레벨별 HP·피해는 확정된 테이블 값으로 저장하고, 표시값과 시뮬레이션 값의 반올림 규칙을 통일한다. 모든 카드의 모든 속성이 매 레벨 동일 비율로 증가한다고 가정하면 생성 개체·방패·죽음 효과·타워 피해의 예외를 놓칠 수 있다.

## 3. 공격 시간과 피해량

### 3.1 기본 수식

**[재현 설계]** 단일 대상·방패 없음·지속 타격이라는 제한된 가정에서만 아래 근사를 사용한다.

```text
nominal_DPS = damage_per_hit / attack_interval
hits_to_kill = ceil(target_HP / damage_per_hit)
TTK ≈ first_hit_delay + (hits_to_kill - 1) × attack_interval + first_projectile_travel
```

이 식에는 이동, 타겟 전환, 기절, 범위에서 벗어남, 투사체 중첩, 실제 공격 확정 시점이 포함되지 않는다. `attack speed`라는 UI 표현이 초당 횟수인지 공격 간격인지 구분해야 하며, 내부에서는 단위를 필드 이름에 표시하는 편이 안전하다.

### 3.2 임계값의 영향

**[분석 예시: 가상 수치]** HP 301의 적을 피해 100으로 공격하면 네 번이 필요하지만 피해 101이면 세 번으로 줄어든다. 공격력이 1% 늘었는데도 필요한 타격 수는 25% 감소한다. 반대로 HP 300의 적에게 피해 100→105는 여전히 세 번이므로 그 상황에서는 처치 타격 수가 달라지지 않는다.

**[확인]** 공식 밸런스 설명에도 특정 병력을 몇 번에 처치하는지가 반복해서 사용된다. 2024년 Bomber 조정과 2026년 Spirit HP 조정은 이러한 상호작용 기준의 사례다. 수치는 해당 패치의 역사적 사례로 사용하고 현재 카드 수치표로 재활용하지 않는다. [C13](https://supercell.com/en/games/clashroyale/blog/release-notes/october-balance-changes/) [C08](https://supercell.com/en/games/clashroyale/blog/news/final-august-balance-changes-826/)

## 4. 피해 종류와 대상별 분기

| 피해 종류 | 처리 단위 | 주요 위험 |
| --- | --- | --- |
| 직접 단일 피해 | 한 공격·한 대상 | 목표 사망 후 유효성 |
| 원형 광역 피해 | 영역 내 유효 대상 집합 | 가장자리 판정·대상 중복 |
| 관통 피해 | 궤적과 교차한 대상 | 같은 대상을 여러 번 맞히는 조건 |
| 산탄·다중 투사체 | 개별 탄환 또는 합산 | 방패·한 프레임 중복 피해 |
| 연쇄 피해 | 순차 선정 대상 | 재방문 여부·연쇄 거리·타겟 사망 |
| 지속 피해 | 시간별 틱 | 첫 틱 시점·마지막 틱·영역 진입·이탈 |
| 등장 피해 | 소환과 연결된 이벤트 | 생성 위치·배치 지연·타워 배율 |
| 사망 피해 | 사망 확정 후 이벤트 | 연쇄 죽음·이중 실행·전투 종료 |
| 반사·보복 피해 | 피격을 조건으로 생성 | 재귀 루프·타워 적용 여부 |
| 충전·돌진 피해 | 상태 조건부 공격 | 충전 초기화·최대치 도달·중단 여부 |

**[확인]** 2025년 1월 공식 패치에서 진화 Bomber의 한 공격이 같은 적을 두 번 때리는 현상을 제거했다. 이는 `공격별 이미 맞은 대상 집합`과 같은 정책이 카드 동작의 일부가 될 수 있음을 보여 준다. 실제 내부 자료구조가 공개됐다는 뜻은 아니다. [C15](https://supercell.com/en/games/clashroyale/blog/release-notes/january-balance-changes-2/)

## 5. 크라운 타워 피해

### 5.1 전역 30% 규칙으로 만들면 안 되는 이유

**[확인]** 2026년 6월 공식 밸런스는 여러 주문의 크라운 타워 피해를 개별적으로 낮췄고, 9월에는 Fireball을 추가 조정했다. 카드의 병력 피해와 크라운 타워 피해를 독립적으로 다룰 수 있어야 한다. [C17](https://supercell.com/en/games/clashroyale/blog/release-notes/june-balance-changes-2026/) [C18](https://supercell.com/en/games/clashroyale/blog/release-notes/september-balance-changes-2027/)

| 공식 변경 사례 | 패치에 적힌 변화 | 문서에서의 의미 |
| --- | --- | --- |
| Fireball, 2026-06-01 | 크라운 피해 207→172 | 기본 피해와 별개 조정 가능 |
| Fireball, 2026-09-08 | 크라운 피해 172→159 | 같은 해에 재조정될 수 있음 |
| Lightning, 2026-06-01 | 크라운 피해 286→265 | 주문별 감소 비율이 같지 않음 |
| The Log, 2026-06-01 | 크라운 피해 41→35 | 과거의 공통 배율 재사용 위험 |

6월 공지는 레벨 11 기준 수치임을 명시한다. 위 표는 **변경 이력**이며 2026-11-13의 모든 레벨·형태를 보장하는 현재 스탯 목록이 아니다. 9월 문서 URL에는 `2027`이 포함되어 있지만 본문 게시일은 2026-09-23이고 해당 Fireball 변경은 9월 8일 항목에 있다.

### 5.2 재현용 피해 프로필

**[재현 설계]** 피해를 카드 전체의 하나의 배율보다 `효과별 대상 종류`로 저장한다.

```json
{
  "effectId": "example_spell_impact",
  "damageAtLevel": {"11": 600},
  "targetOverrides": {
    "crown_tower": {"11": 150},
    "ordinary_building": {"11": 600}
  },
  "roundingPolicy": "explicit_table"
}
```

예시 값은 실제 카드 값이 아니다. 등장·직접 공격·죽음 폭발·분열 개체가 서로 다른 타워 피해 규칙을 가질 수 있으므로 `card_id`만으로 크라운 배율을 고르면 예외가 누락된다.

**[분석]** 크라운 피해만 줄이면 방어 주문의 병력 제거 역할은 유지하면서 순수 주문 회전으로 끝내는 속도를 줄일 수 있다. 그러나 공격을 돕는 주문의 효율도 변하므로 수비 메타가 자동으로 해소된다고 보장할 수 없다.

## 6. 방패·체력·죽음의 분리

### 6.1 방패

**[재현 설계]** 방패 HP와 본체 HP는 별도로 저장하고, 방패 파괴 시 초과 피해가 본체로 넘어가는지를 효과별 정책으로 정의한다. 일반적인 보호막의 초과 피해 차단과 여러 발이 각각 판정되는 공격은 다른 결과를 만들 수 있다. 원작 모든 방패에 동일 규칙이 적용된다고 단정하지 않는다.

```text
DamageEvent
  → 상태상 피격 가능 여부
  → 해당 피해가 방패를 우회하는지
  → 방패 피해 및 파괴 이벤트
  → 초과 피해 전달 정책
  → 본체 피해
  → 죽음 후보 등록
```

**[확인]** Cannon Cart의 방패와 본체 HP를 분리해 조정한 공식 사례가 있다. 형태 변화 시 HP를 단순히 총합 하나로 처리하면 이 설계 차이를 표현하기 어렵다. [C15](https://supercell.com/en/games/clashroyale/blog/release-notes/january-balance-changes-2/)

### 6.2 죽음과 후속 효과

**[재현 설계]** 개체가 죽으면 즉시 삭제하는 대신 `DeathResolved` 이벤트를 한 번만 발생시키고 필요한 후속 효과를 등록한다. 죽음 폭발·소환·분열·영혼 수집·회복은 같은 죽음 사건을 서로 다르게 참조할 수 있다.

다음은 반드시 분리해야 한다.

- 본체의 HP가 0이 된 시점
- 타겟 후보에서 제외되는 시점
- 충돌 점유를 해제하는 시점
- 사망 효과가 발동하는 시점
- 시각 오브젝트가 사라지는 시점

## 7. 상태 효과 분류

| 상태 | 변경 축 | 함께 확인할 사항 |
| --- | --- | --- |
| 이동 감속 | 이동 속도 | 공격 속도까지 느려지는지 별도 |
| 공격 감속 | 공격 주기 | 이미 준비 중인 공격 타이머 처리 |
| 기절 | 이동·공격 중단 | 충전 초기화·타겟 유지·첫 공격 재시작 |
| 빙결 | 동작 정지 | 기절과 동일하게 처리되는지, 면역 예외 |
| 분노·가속 | 이동·공격 또는 기타 속도 | 적용 대상·버프 범위·중첩 방식 |
| 넉백 | 강제 위치 변경 | 무게·면역·벽·강·다리 경계 |
| 끌어당김 | 목표 방향 강제 이동 | 건물·공중·무거운 개체 적용 |
| 은신 | 타겟 가능 여부 | 범위 피해·이미 발사된 공격 |
| 무적 | 피해 허용 | 상태 효과·밀치기까지 면역인지 |
| 회복 | HP 증가 | 최대 HP 제한·죽은 개체·건물·초과 회복 |
| 반사 | 투사체/피해 재지정 | 소유자 변경·팀·마스터리 귀속 |
| 충전 | 시간·거리 기반 공격 강화 | 기절·타겟 전환·사망·이동 중 유지 |

**[확인]** 공식 2022년 패치는 Ice Spirit의 빙결과 Electro Spirit의 짧은 기절·타겟 재선정 역할을 구분하고, Ram Rider의 이동 감속을 별도로 다뤘다. 이는 단일 `slow` 상태 하나로 모든 제어 효과를 묶으면 안 된다는 역사적 근거다. 해당 공지의 지속 시간·배율을 현재 고정값으로 쓰지는 않는다. [C14](https://supercell.com/en/games/clashroyale/blog/release-notes/balance-changes-april-2022/)

## 8. 상태 예외와 최근 사례

### 8.1 대시 면역

**[확인]** 2026년 9월 공식 수정은 Bandit, Boss Bandit, Golden Knight가 대시 중 Zap·Freeze와 유사 효과로 중단되지 않도록 했다고 명시한다. 따라서 제어 효과의 적용 여부는 `유닛 종류`뿐 아니라 `현재 행동 상태`도 확인해야 한다. [C16](https://supercell.com/en/games/clashroyale/blog/release-notes/new-season-minion-academy/)

### 8.2 넉백의 개체별 차이

**[확인]** 2026년 6월 진화 Mega Knight의 무거운 병력에 대한 밀치기 거리를 별도로 낮춘 사례가 있다. `모든 유닛에 동일 거리` 또는 `무거운 유닛은 무조건 넉백 면역`이라는 두 가지 단순화 모두 맞지 않을 수 있다. [C17](https://supercell.com/en/games/clashroyale/blog/release-notes/june-balance-changes-2026/)

### 8.3 조건부 빙결과 해제

**[확인]** Hero Ice Wizard는 감속된 적을 활용해 눈사람과 빙결 효과를 만든다. 지원 문서는 시간 경과 또는 눈사람 파괴로 해제되는 동작을 설명한다. 따라서 모든 상태를 단순히 `duration`만으로 종료하는 모델로는 원인 개체 파괴에 따른 해제를 표현하기 어렵다. [C19](https://support.clashroyale.com/hc/en-us/articles/54836231287963-What-s-New-September-2026)

### 8.4 HP 임계 변형

**[확인]** 2026년 11월 진화 Giant는 HP 50%에 도달하면 이동·공격 속도가 증가하고 Rage 흔적을 남기는 형태로 소개됐다. 일반 공격 버프와 특정 HP 조건의 행동 전환을 분리할 필요가 있다. [C11](https://support.clashroyale.com/hc/en-us/articles/57579150651419-What-s-New-November-2026)

**[검증 필요]** 한 번 발동하면 회복 뒤에도 유지되는지, 같은 틱에 피해와 회복이 들어오면 어떤 순서로 임계값을 검사하는지, 여러 버프와 중첩되는지는 실제 카드별 테스트 대상이다.

## 9. 효과 중첩과 이벤트 순서

**[재현 설계]** 상태 데이터는 아래처럼 정의할 수 있다.

| 필드 | 용도 |
| --- | --- |
| `effectInstanceId` | 같은 상태의 개별 적용 식별 |
| `sourceEntityId` | 원인 개체와 해제 조건 |
| `startTime`, `endTime` | 지속 시간 |
| `stackGroup` | 같은 종류의 효과 그룹 |
| `stackPolicy` | 갱신·가산·최대값·독립 중 선택 |
| `immunityTags` | 대시·건물·특수 상태 예외 |
| `breakConditions` | 원인 파괴·행동·피격에 따른 해제 |
| `modifierChannels` | 이동·공격·피해·타겟 등 변경 축 |

감속 30%와 40%가 함께 들어오면 70%인지, 곱연산으로 58%인지, 강한 40%만 쓰는지에 따라 결과가 달라진다. **원작의 전 상태 효과 중첩표는 공개 자료만으로 확인하지 않았으므로 이 문서에서 특정 일반식을 확정하지 않는다.**

이벤트 순서도 같은 이유로 명시해야 한다. 공격과 회복, 방패 파괴와 기절, 죽음 폭발과 킹 타워 파괴가 같은 시각에 발생하면 생존 여부와 승패가 바뀔 수 있다. 재현 구현은 고정 순서로 처리하고 그 순서를 리플레이와 함께 버전 관리한다.

## 10. 검증용 상호작용 표

**[재현 설계]** 카드 전체의 평균 승률을 보기 전에 아래처럼 통제된 작은 상호작용을 축적한다.

| 시험 묶음 | 고정 조건 | 관측값 |
| --- | --- | --- |
| 주문 처치 임계 | 동일 레벨·HP·형태 | 생존 여부, 남은 HP |
| 방패 | 단일 큰 피해와 여러 작은 피해 | 방패 파괴·초과 피해 |
| 타워 피해 | 동일 주문·레벨, 일반 건물과 크라운 | 피해 차이·반올림 |
| 첫 공격 | 같은 거리·같은 배치 시점 | 첫 타격 시각 |
| 기절 | 공격 준비·발사·회복 단계별 적용 | 중단 여부·다음 공격 시각 |
| 돌진 | 임계 거리 전후, 중단 효과 | 강화 피해·초기화 |
| 범위 | 중심·가장자리·바깥쪽 | 포함 여부·중복 피해 |
| 지속 피해 | 중간 진입·이탈·재진입 | 피해 틱 수 |
| 죽음 효과 | 동시 사망·연쇄 사망 | 한 번만 발생하는지 |
| 특수 형태 | 기본·진화·히어로·미러 | 능력치와 추가 효과 구분 |

모든 케이스에 `게임 버전`, `모드`, `카드 레벨`, `타워 레벨/종류`, `카드 형태`, `배치 좌표`, `입력 시각`을 함께 저장해야 한다. 일부 정보가 빠지면 패치 이후 결과 차이의 원인을 찾기 어렵다.

## 11. QA 체크리스트

| ID | 항목 | 기대·확인 기준 |
| --- | --- | --- |
| DM-01 | 피해 0으로 HP가 바뀌는가 | 상태 효과와 피해를 분리 |
| DM-02 | 같은 공격이 한 대상을 두 번 타격 | 카드별 중복 허용 정책 |
| DM-03 | 방패 파괴와 본체 사망 | 초과 피해·다중 탄환 순서 |
| DM-04 | 타워 피해와 일반 건물 피해 | 별도 데이터 적용 |
| DM-05 | 지속 피해 마지막 틱 | 총 피해와 표시값 일치 |
| DM-06 | 기절 직후 공격 | 첫 공격·충전 타이머 실측 |
| DM-07 | 대시 중 제어 효과 | 상태별 면역 정책 |
| DM-08 | 회복과 HP 임계 발동 동시 | 처리 순서에 따른 일관성 |
| DM-09 | 원인 개체 파괴로 상태 해제 | 대상에 유령 상태가 남지 않음 |
| DM-10 | 중첩된 감속·분노·빙결 | 조합별 실측과 표시 일치 |
| DM-11 | 폭발로 연쇄 사망 | 같은 죽음 효과의 중복 발생 없음 |
| DM-12 | 킹 파괴와 죽음 폭발 동시 | 승패·리플레이·정산 결과 일치 |

## 12. 출처와 연결

- **C08** · Supercell, [August Balance Changes](https://supercell.com/en/games/clashroyale/blog/news/final-august-balance-changes-826/) · 2026-08-04, 8월 26일 추가 항목 포함
- **C11** · Supercell Support, [What's New? – November 2026](https://support.clashroyale.com/hc/en-us/articles/57579150651419-What-s-New-November-2026) · 2026년 11월
- **C13** · Supercell, [October Balance Changes](https://supercell.com/en/games/clashroyale/blog/release-notes/october-balance-changes/) · 2024-10-08
- **C14** · Supercell, [Balance Changes April 2022](https://supercell.com/en/games/clashroyale/blog/release-notes/balance-changes-april-2022/) · 2022-04-04, 추가 변경 4월 8일
- **C15** · Supercell, [January Balance Changes](https://supercell.com/en/games/clashroyale/blog/release-notes/january-balance-changes-2/) · 2025-01-07
- **C16** · Supercell, [New Season: Minion Academy!](https://supercell.com/en/games/clashroyale/blog/release-notes/new-season-minion-academy/) · 2026-09-07
- **C17** · Supercell, [June Balance Changes](https://supercell.com/en/games/clashroyale/blog/release-notes/june-balance-changes-2026/) · 2026-06-01 · 레벨 11 기준 명시
- **C18** · Supercell, [September Balance Changes](https://supercell.com/en/games/clashroyale/blog/release-notes/september-balance-changes-2027/) · 본문 게시일 2026-09-23, 변경 항목 9월 8일·16일
- **C19** · Supercell Support, [What's New? – September 2026](https://support.clashroyale.com/hc/en-us/articles/54836231287963-What-s-New-September-2026) · 2026년 9월
- **C21** · Supercell Support, [Cards & Decks](https://support.clashroyale.com/hc/en-us/articles/49484924205595-Cards-Decks) · 현행 문서 확인 2026-11-13

연결: [전투 진행·승패](02_battle_flow_and_victory.md), [엘릭서·손패·회전](03_elixir_hand_and_cycle.md), [유닛 AI](05_unit_ai_targeting_and_pathing.md).

## 13. 2026-11-17 고도화: 수치 복원과 상호작용 복원

[2026년 9월 패치](https://supercell.com/en/games/clashroyale/blog/release-notes/september-balance-changes-2027/)에서 공개한 레벨 11의 Fireball 크라운 피해 159, Wizard 첫 공격 0.5초, 진화 Wizard 방패 176은 각각 다른 의미의 필드다. 이번 데이터는 `scope=patch_snapshot_level_11`로 보존하며, 한 값을 다른 레벨로 확대하거나 다른 주문의 공통 배율로 사용하지 않는다. 현재 전체 카드 수치를 복원한 것으로 읽어서도 안 된다.

[10월 27일 상호작용 수정](https://supercell.com/en/games/clashroyale/blog/release-notes/new-season-king-vs-king/)은 대시 중 Bandit과 진화 Wizard 방패, 재돌격 준비 중 진화 Battle Ram과 Zap, 당겨지는 진화 Wall Breakers의 사망 피해, 공격 중 진화 Mega Knight와 Tornado, Hero Ice Wizard의 적중 전 사망 환불을 각각 다르게 다룬다. 단일 `invulnerable` 불리언이나 모든 능력에 공통인 환불 정책으로 합치면 이 차이가 사라진다.

방패 파괴, 본체 형태 변화, 실제 사망, 사망 소환을 별도 사건으로 나누고 초과 피해·다중 파동·같은 시각의 여러 사건을 실험한다. 공식 자료가 결과를 공개하지 않은 `CASE_SHIELD_OVERFLOW`, `CASE_SHIELD_MULTIWAVE`, `CASE_CART_TRANSITION`의 기대값은 `null`이다. 원작 관측을 해야 채울 수 있는 값이다. 타수·DPS·이상적 처치시간의 분석 수식과 가상 계산 예시는 [24번](24_combat_rules_and_interaction_lab.md), 형상과 능력 정책은 [25번](25_card_forms_and_ability_contracts.md)에 추가했다.
