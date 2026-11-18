# 35. 실행 가능한 전투 참조 계약

> **v4 추가 조사 안내:** 아래 본문과 개수는 해당 v2/v3 작성 당시의 범위를 설명한다. 현재 통합 자료, 추가 복원, 레벨 미기재 값의 처리와 실행 명령은 [39번 개요](39_research_reconstruction_v4_overview.md), [44번 근거 조정](44_sources_and_level_reconciliation.md), [최신 검증 보고서](reports/validation_report.md)를 기준으로 한다.

> **연구 도구 v3 · 계약 모듈 1.0.0 · 기준일 2026-11-17.** 공개 규칙을 읽는 단계에서 한 걸음 더 나아가, 입력을 바꾸고 예상 결과를 확인할 수 있는 순수 JavaScript 함수를 제공한다. 실행 대상은 이 패키지의 **참조 계약**이다. 원작 클라이언트, 원작 서버, Crownfall 전투 엔진의 실행 결과가 아니다. 기존 44개 원작 관측 명세는 계속 `observed=false`, `test_status=not_run`이다.

## 1. 이번 고도화가 해결하는 문제

역기획서에 “4회 뒤 귀환”, “방패가 깨지면 본체로 전환”, “방진에서는 방어력이 증가”라고 적는 것만으로는 구현자가 같은 결과를 만들기 어렵다. 귀환을 자기 카드 사용까지 포함해 세는지, 방패 초과 피해를 버리는지, 정렬이 깨진 분대에도 감면을 적용하는지가 남기 때문이다.

이번 모듈은 **확인된 부분은 규칙으로 연결하고, 확인되지 않은 선택은 입력 또는 계산 차단으로 드러낸다.** 자료가 없는 값을 자동으로 넣어 실행시키지 않는다. 공백을 숨기지 않으면서도 기획자와 개발자가 구체적인 결과를 비교할 수 있게 하는 것이 목적이다.

| 계약 | 제공하는 계산 | 확정하지 않는 내용 |
|---|---|---|
| 카드 회전 | 8장·4장 손패 큐에서 슬롯 사용과 귀환 추적 | 원작 셔플, 첫 손패 제한, 진화·Mirror 내부 처리 |
| 경기 일정 | 0·120·180·240·300초의 구간과 배수 조회 | 승패, 서든데스, 동시 파괴, 원작 tick 우선순위 |
| 엘릭서 | 명시적 프로필 아래 생성·소비·상한 소실 보존식 | 현재 원작의 초기량·상한·기본 생성 간격 실측 |
| 방패 | `discard`와 `spill` 가정의 단일 피해 비교 | 어느 원작 카드가 어느 정책을 사용하는지 |
| 밀집보병 | 방진 감면과 돌격 공격 허용의 분대 집계 | 원작 카드 대응, 경로·충돌·개별 유닛 전투 동일성 |

관련 파일은 [계약 모듈](lab/contracts.js), [30개 데이터 시나리오](data/contracts/reference_scenarios.json), [실행 테스트](tests/contracts.test.cjs)다. 계산에는 네트워크·이미지·패키지 설치가 필요하지 않는다. UMD 형식이므로 일반 `<script>`와 Node의 `require`에서 같은 함수를 사용할 수 있다.

## 2. 근거와 실행 결과의 분리

공식 지원 문서는 카드를 사용한 뒤 다른 카드 네 번을 사용해야 돌아온다고 설명한다. 2025년 Champion 개편 공지는 Champion도 일반 카드와 같은 순환을 사용한다고 명시한다. 이번 큐는 그 두 공개 동작에 맞춘 재현 설계다. 4장 손패라는 구현 기준과 첫 손패 생성 방식의 증거 상태는 별도로 남긴다. [공식 카드 순환](https://support.clashroyale.com/hc/en-us/articles/49484904683803-1v1-Battle) · [Champion 개편](https://supercell.com/en/games/clashroyale/blog/release-notes/october-update-2025/)

공식 엘릭서 안내는 정규전 1~2분 1배, 3분 2배, 연장 4분 2배, 5분 3배를 설명한다. 2019년 공지는 연장 2분 구조를 확인하는 역사 자료다. 이 문서의 시간 적분은 그 일정을 연속 함수로 표현한 제안이며 원작의 내부 연산 방식을 추출한 결과가 아니다. [공식 엘릭서 안내](https://support.clashroyale.com/hc/en-us/articles/49484936933403-Elixir) · [시간 구조 변경](https://supercell.com/en/games/clashroyale/blog/release-notes/november-update/)

| 데이터 또는 결과 | 근거 상태 | 이 모듈의 처리 |
|---|---|---|
| 일반 카드 4회 추가 사용 뒤 귀환 | 기존 표 `official_confirmed` | 큐의 목표 동작으로 사용 |
| Champion의 일반 순환 | 기존 표 `official_confirmed` | 생존 여부에 따른 별도 큐 없음 |
| 1·2·3배 일정 | 기존 표 `official_confirmed` | 시간 구간 상수로 사용 |
| 초기량·상한·기본 생성 간격 | 기존 표 `unverified`, 값 `null` | 명시적 프로필이 없으면 차단 |
| 방패 초과 피해 정책 | 관측 명세의 정답 `null` | `unknown`이면 차단, 가정 선택 후 계산 |
| 밀집보병 | `custom_only` | 원작 ID를 `null`로 유지 |
| 참조 함수의 테스트 통과 | 자체 계산의 구현 검사 | 원작 관측 통과로 승격하지 않음 |

출처 ID는 기존 [전투 출처](data/sources/combat_sources.json)의 `COMBAT_SRC_01`, `02`, `07`, `08`, `19`와 자체 구현 참조의 `LOCAL_CROWNFALL_44`를 사용한다. 원작 사실의 범위는 [24번](24_combat_rules_and_interaction_lab.md), 형상·능력은 [25번](25_card_forms_and_ability_contracts.md), 실제 관측 절차는 [33번](33_observation_protocol_and_reconstruction_backlog.md)을 따른다.

## 3. 공통 반환 계약과 입력 정책

성공과 실패 모두 다음 문맥을 반환한다.

```json
{
  "ok": true,
  "blocked": false,
  "contractVersion": "1.0.0",
  "evidenceStatus": "reproduction_design",
  "originalClientObserved": false,
  "sourceIds": [],
  "assumptions": []
}
```

`evidenceStatus`는 함수 계산의 성격이다. 근거 문서가 공식 자료여도 계산 결과를 `official_confirmed`라고 표시하지 않는다. 밀집보병만 `custom_only`를 사용한다. `sourceIds`는 계산에 참고한 근거이며, 반환된 모든 수치가 그 문서에 실렸다는 뜻이 아니다. 실제 가정은 `assumptions`에 따로 담긴다.

실패에는 두 종류가 있다. `blocked=true`는 필요한 근거 또는 프로필이 아직 선택되지 않았다는 뜻이다. 예를 들어 엘릭서 프로필 누락과 방패 정책 `unknown`이 이에 해당한다. `blocked=false`, `ok=false`는 음수 시간·잘못된 카드 수·문자열 비용처럼 입력 자체가 유효하지 않다는 뜻이다. 두 경우 모두 `error.code`, 한국어 설명, 관련 `fields`를 제공한다. 차단된 결과에는 계산을 한 것처럼 보이는 `bodyDamage`나 `finalAmount`를 넣지 않는다.

숫자는 유한한 JavaScript `number`를 받는다. 문자열 `"10"`을 10으로 조용히 바꾸지 않으며 `NaN`, 무한대, 음수 비용도 거절한다. UI는 사용자가 입력한 문자열을 숫자로 파싱한 뒤 오류를 표시해야 한다. 비용 0과 HP 0은 유효한 경계값이다. 참조 함수를 호출해도 입력 배열·객체를 변경하지 않으므로 수정 전후를 나란히 비교하거나 취소할 수 있다.

## 4. 손패 큐: 반환 시점과 보존 조건

### 4.1 함수

```javascript
const C = require('./lab/contracts.js');
const start = C.createCycle(['A','B','C','D','E','F','G','H']);
const played = C.playCycle(start.state, 0);
// played.played === 'A'
// played.drawn === 'E'
// played.state.hand === ['E','B','C','D']
// played.state.queue === ['F','G','H','A']
```

`createCycle(deck)`은 서로 다른 ID 8개를 받아 앞 4개를 손패, 뒤 4개를 대기열로 둔다. 입력 순서는 사용자가 정한 실험 조건이다. 자동 셔플은 없다. `playCycle(state, slot)`의 슬롯은 0부터 3까지다. 사용한 카드를 큐 뒤로 보내고 큐 앞 카드를 같은 손패 슬롯에 넣는다. `state.plays`는 승인한 카드 사용 횟수다.

| 사용 순서 | 사용 카드 | 손패 | 다음 카드 |
|---:|---|---|---|
| 0 | 시작 | A, B, C, D | E |
| 1 | A | E, B, C, D | F |
| 2 | B | E, F, C, D | G |
| 3 | C | E, F, G, D | H |
| 4 | D | E, F, G, H | A |
| 5 | E | A, F, G, H | B |

4번째 줄에서 A는 다음 카드이며 아직 손패가 아니다. 5번째 줄에서 A가 손패로 돌아온다. 즉 A를 사용한 **이후** B·C·D·E 네 번을 세어야 한다. `runCycle(deck, slots)`는 이 과정을 여러 번 실행하고 매 단계의 손패·대기열·입출력 카드를 `history`에 담는다.

### 4.2 불변 조건

손패 4장과 큐 4장을 합치면 초기 8장이 정확히 한 번씩 존재해야 한다. 사용 횟수는 매번 1 증가한다. 잘못된 슬롯이나 중복 ID는 새로운 상태를 만들지 않는다. Champion이라는 이름의 ID도 같은 연산을 통과하며 생존 중 제외하는 분기를 만들지 않는다.

능력 발동, 진화 카운터, Mirror의 복제 원본, 덱 편집은 이 함수의 입력이 아니다. 이들 동작을 표현하려고 `playCycle`을 호출하면 카드 사용으로 오계산할 수 있다. 상위 엔진은 실제 카드 사용 승인 사건에만 이 계약을 연결해야 한다. 같은 카드 이름을 가진 복수 전장 개체와 덱의 카드 ID는 별개다.

## 5. 경기 일정과 엘릭서 보존식

### 5.1 일정 조회의 의미

`phaseAt(elapsedSeconds)`는 시간만 보고 정규전·연장·일정 종료를 분류한다. 이미 승자가 결정되었는지 알 수 없으므로 `winner=null`, `winnerEvaluated=false`를 반환한다. 180초 이후의 결과는 미결착으로 경기가 계속되었다는 조건을 필요로 한다.

| 조회 시각 | `phase` | `multiplier` | 해석 |
|---|---|---:|---|
| `0 ≤ t < 120` | `regular` | 1 | 정규전 초반 |
| `120 ≤ t < 180` | `regular` | 2 | 정규전 후반 |
| `180 ≤ t < 240` | `overtime` | 2 | 계속된 경기의 연장 전반 |
| `240 ≤ t < 300` | `overtime` | 3 | 계속된 경기의 연장 후반 |
| `t ≥ 300` | `tiebreak_pending` | 0 | 이 생성 일정은 종료; 승패 계산은 없음 |

여기서 300초 이후의 0은 원작 타이브레이커의 실제 자원 표시를 실측했다는 뜻이 아니다. 이 참조 일정에 더 이상 생성 구간이 없음을 표현한다. 연장 중 타워가 파괴되면 경기 종료를 처리해야 하는 별도 모듈이 적분 종료 시각을 줄여야 한다.

### 5.2 프로필의 명시적 선택

```javascript
C.simulateElixir({ fromSeconds: 0, toSeconds: 10 });
// ok: false, blocked: true, error.code: 'MISSING_PROFILE'

C.simulateElixir({
  fromSeconds: 119,
  toSeconds: 121,
  startAmount: 0,
  profile: {
    initialAmount: 0,
    capacity: 100,
    baseIntervalSeconds: 2
  }
});
// 위 값은 가상 실험 입력: 119~120초 0.5 + 120~121초 1 = 총 1.5
```

필수 프로필은 시작량 `initialAmount`, 상한 `capacity`, 1배에서 1 엘릭서를 만드는 시간 `baseIntervalSeconds`다. 표에 `reference_value`로 들어 있는 5·10·2.8을 숨은 기본값으로 사용하지 않는다. 예제의 0·100·2 역시 현재 원작 수치가 아닌 계산 설명용 가상 값이다.

0초부터 계산할 때 시작 보유량을 생략하면 사용자가 명시한 `profile.initialAmount`를 사용한다. 0초 이후부터 시작하면 그 시점의 `startAmount`가 필요하다. 시간만으로 이전 소비 내역을 복원할 수 없기 때문이다. 구간은 0~300초 안이어야 하며, 종료가 시작보다 빨라서는 안 된다.

### 5.3 구간 적분과 소비

배수 `m`, 기본 간격 `b`, 길이 `Δt`인 구간의 생성량은 `Δt × m / b`다. 120·240초를 넘는 계산은 배수별로 나누어 더한다. 180초는 정규전/연장 경계지만 생성 배수가 같으므로 적분량의 불연속은 없다. 이미 상한에 도달했다면 그 뒤의 생산 기회는 `overflow`로 남긴다.

```javascript
C.simulateElixir({
  fromSeconds: 0,
  toSeconds: 4,
  profile: { initialAmount: 9, capacity: 10, baseIntervalSeconds: 1 },
  spends: [{ atSeconds: 2, cost: 5 }]
});
// 생성 4, 소비 5, 상한 소실 1, 종료 보유량 7
```

이 가상 예제에서는 처음 2초 동안 2가 생산되지만 1만 보유할 수 있다. 2초 시점에 비용 5를 지불해 5가 남고, 그 뒤 2가 생성되어 7로 끝난다. 최종 보유량만 계산하면 놓치기 쉬운 낭비량을 별도 출력한다.

`spends`는 시각 오름차순이어야 한다. 같은 시각의 입력은 배열 순서대로 처리한다. 각 시각까지 생성한 뒤 소비를 판단하는 순서가 이 계약의 명시적 정책이다. 자원이 모자란 입력은 `requestedCost`를 기록하지만 `committedCost=0`이며 소비 합계에 포함하지 않는다. 한 계산의 종료 시각에 놓인 소비도 포함하므로, 계산을 여러 구간으로 나눌 때 경계 소비 사건을 양쪽에 중복 전달하면 안 된다.

```text
종료 보유량 = 시작 보유량 + 생성량 − 승인 소비량 − 상한 소실량
```

반환된 `conservationResidual`은 위 식의 부동소수점 잔차다. 정확한 생성 경계에서 IEEE-754 표현 오차로 가능한 소비가 거절되지 않도록 보유량과 요청 비용 규모의 작은 상대 오차를 허용한다. 상한 크기를 허용 오차로 쓰지 않는다. 따라서 상한만 매우 크게 설정해 자원 없는 소비를 승인하게 만들 수 없다. 계산 범위를 넘는 극단 입력은 `NUMERICAL_RANGE` 오류로 반환한다.

이 모델은 서버 tick, 시작 생성 지연, 정수 HUD, 비용 환불, 배치 취소, 숨은 자원 정밀도를 추출한 것이 아니다. 그 조건을 비교하려면 [33번 관측 프로토콜](33_observation_protocol_and_reconstruction_backlog.md)의 실제 영상과 시각 오차를 추가해야 한다.

## 6. 방패: 미확정 정책을 계산에 숨기지 않기

```javascript
C.resolveShield({
  bodyHp: 500, shieldHp: 50, damage: 120,
  overflowPolicy: 'unknown'
});
// 차단: bodyDamage 등의 계산 결과가 없음
```

원작의 `CASE_SHIELD_OVERFLOW`는 기대값을 아직 확정하지 않았다. 도구도 기본 상태를 `unknown`으로 유지한다. 사용자나 관측 자료가 정책을 지정한 뒤에만 다음 가정을 비교한다.

| 가정 | 방패 50에 피해 120 | 반환 |
|---|---|---|
| `discard` | 방패 50 소모, 초과 70 소멸 | 본체 500, `discarded=70` |
| `spill` | 방패 50 소모, 초과 70 본체 전달 | 본체 430, `bodyDamage=70` |

두 결과의 `policyEvidence`는 모두 `user_assumption`이다. 어느 결과가 더 그럴듯하다는 이유로 기존 표의 상태를 바꾸지 않는다. 방패가 처음부터 0이면 `discard`라도 본체 피해를 막지 않는다. 본체가 이미 0인 개체는 이 모델에서 죽은 대상으로 보며 입력 피해를 `ignoredDamage`로 기록한다. 본체를 넘는 피해는 `overkill`로 남겨 피해량 보존을 검사한다.

파동이 여러 번이면 함수를 파동별로 호출해야 한다. 가상 방패 50·본체 500에 120 한 번을 `discard`로 적용하면 본체는 그대로지만, 40씩 세 번 적용하면 세 번째 파동은 본체에 40을 준다. 같은 총 피해라도 사건 경계가 결과를 바꿀 수 있음을 보이는 분석 예제다. 실제 Arrows의 현행 피해·방패 상호작용을 실측한 예제는 아니다.

피해 감소, 무적, 피해 타입, 변형 시 회복, 사망 소환, 반사, 타겟 재선택은 이 함수 밖의 사건이다. 방패 계산을 넣었다는 이유로 관련 카드의 전투 재현이 완료되었다고 판정하지 않는다.

## 7. 밀집보병: 자체 확장 규칙의 분리

밀집보병은 사용자가 요청한 Crownfall의 자체 카드다. 원작 Royal Recruits 등의 ID를 붙이지 않는다. 기본 참조는 [Crownfall v4.4 카드 자료](implementation_reference/crownfall_4_4_cards.json)와 [구현 차이](31_implementation_gap_matrix.md)이며, 방진 감면 70%와 공격 금지·돌격 공격을 결정표로 표현한다.

```javascript
C.phalanx({
  state: 'guard',
  aliveCount: 6,
  aligned: true,
  deployed: true,
  stunned: false,
  incomingDamage: 100
});
// defenseActive: true, damageReduction: 0.7
// receivedDamage: 약 30, canAttack: false
```

| 상태·조건 | 방진 감면 | 공격 허용 |
|---|---|---|
| `guard`, 생존 3명 이상, 모두 정렬·배치 완료, 기절 없음 | 70% | 아니오 |
| `guard`, 생존 2명 이하 | 없음 | 아니오 |
| `guard`, 정렬 이탈 또는 배치 미완료 또는 기절 | 없음 | 아니오 |
| `forming` 또는 `regroup` | 없음 | 아니오 |
| `charge`, 생존자가 있고 배치 완료·기절 없음 | 없음 | 예 |
| 생존자 0명 | 피해를 적용할 대상 없음 | 아니오 |

`aligned`는 모든 생존자가 목표 슬롯에 정렬되었다는 집계 입력이고, `deployed`는 모두 활성화·배치 완료 상태라는 뜻이다. `stunned=true`는 한 명 이상이 기절한 경우다. 이 함수는 분대 전체의 준비 조건으로 공격 허용을 보수적으로 판정한다. 실제 엔진에서 일부 병사가 기절하고 나머지는 개별 공격하는 상황을 모두 재현하는 API가 아니다. 이 차이는 `evaluationScope=aggregate_reference_decision_not_runtime_equivalence`와 가정 목록에 남긴다.

위치·슬롯 오차·정렬 복구 시간·이동 속도·돌격 지속·능력 비용·쿨다운·충돌을 시간에 따라 계산하지 않는다. 개발자 테스트 모드에서 변경한 감면 수치를 자동으로 읽지도 않는다. 따라서 이 참조 판정은 기본 기획 규칙을 검토하는 데 사용하고, 배포 게임과의 일치 판정은 별도 엔진 테스트로 수행해야 한다.

## 8. 데이터 시나리오와 실행 검증

[reference_scenarios.json](data/contracts/reference_scenarios.json)은 30개 참조 시나리오를 담는다. 각 행에는 호출할 `operation`, 인수 배열 `args`, 결과 경로별 `assertions`, 관련 원작 관측 명세 ID와 예상 범위가 있다. `expected_scope`는 항상 `local_reference_contract_only`다.

테스트 파일은 시나리오 30개와 추가 검증 15개를 실행한다. 추가 검증은 카드 보존·긴 순환·입력 불변성·모든 시간 경계·잘못된 타입·구간 분할 불변성·자원 보존·방패 피해 보존·분대 조건 조합·브라우저 전역 로드를 확인한다. 예를 들어 120초 경계를 한 번에 적분하든 앞뒤로 나누어 적분하든 소비가 없는 동일 조건에서는 결과가 같아야 한다. 이런 검사는 단순히 함수가 호출되는지를 넘어서 구현의 오류 가능성을 좁힌다.

```bash
node --test tests/contracts.test.cjs
```

이 작성 시점의 실제 실행 결과는 **45개 통과, 0개 실패, 0개 건너뜀**이다. 브라우저 전역 로드는 Node의 격리 JavaScript 환경에서 `window`/DOM/네트워크 의존성이 없는지를 검사한 것이다. 실제 브라우저 화면·터치·GPU 테스트로 표시하지 않는다. 테스트에는 Node 18 이상이 필요하고, 참조 함수를 웹에서 사용하는 데 Node는 필요하지 않다.

원작 관측 44개를 실행한 결과와 새 참조 테스트 45개를 합쳐 “원작 89개 검증 완료”라고 집계하면 안 된다. 두 집합은 목적과 실행 대상이 다르며 일부 질문도 겹친다. 기존 관측 파일에는 어떤 `passed`도 기록하지 않았다.

## 9. 구현에 연결하는 순서와 완료 기준

첫 단계는 화면 또는 엔진이 명시적 입력을 만들고 차단 이유를 그대로 표시하는 것이다. 두 번째는 게임 설정을 수정하지 않은 상태에서 같은 입력을 참조 함수와 엔진에 넣어 차이를 관찰하는 것이다. 세 번째는 실제 원작의 동일 조건 관측을 얻었을 때 버전·모드·레벨·오차를 갖춘 새 기록을 추가하는 것이다.

확인한 원작 자료가 프로필을 완성하면 기존 `null`을 조용히 덮기보다 근거와 적용 범위를 추가해 새 데이터 버전을 만들고, 소비 순서·방패 정책처럼 결과를 바꾸는 선택에는 계약 버전을 부여해야 한다. 과거 테스트가 새 규칙에 우연히 통과했다고 같은 의미라고 단정하지 않는다.

이 장의 완료 범위는 **작동하는 참조 함수, 재현 가능한 예제, 유효성 검사, 명시적 미확정 처리**다. 원작 전체 전투 복원이나 Crownfall 배포 변경은 이 범위에 포함되지 않는다. 후속 작업자는 먼저 입력·근거·결과를 나란히 읽고, 어떤 가정을 바꿨을 때 어떤 결과가 달라졌는지를 설명할 수 있어야 한다.
