# 36. 실행 가능한 성장·확률 계산기와 경계 조건

> **v4 추가 조사 안내:** 아래 본문과 개수는 해당 v2/v3 작성 당시의 범위를 설명한다. 현재 통합 자료, 추가 복원, 레벨 미기재 값의 처리와 실행 명령은 [39번 개요](39_research_reconstruction_v4_overview.md), [44번 근거 조정](44_sources_and_level_reconciliation.md), [최신 검증 보고서](reports/validation_report.md)를 기준으로 한다.

> v3.0.0 · 자료 기준: 이 패키지에 수록한 공개 자료 스냅샷 · 구현: `lab/economy.js` · 실행 검증: `tests/economy.test.cjs`
>
> 이 계산기는 공개 표에 대해 실행 가능한 분석 계약을 제공한다. 실제 계정의 거래를 실행하거나 원작 서버의 보상 추첨을 재현하지 않는다. `liveGameVerified`는 모든 계산에서 `false`다.

## 1. v2에서 v3로 발전한 부분

[26. 성장·경제 재구축](26_progression_economy_reconstruction.md)은 비용과 확률의 의미, 결측, 조건부 분포를 정의했다. 이번에는 그 정의를 **입력 검증과 실패 조건을 가진 순수 JavaScript 함수**로 구현했다. 같은 JSON 입력은 브라우저와 Node에서 같은 결과를 만들며 원본 데이터를 수정하지 않는다. 네트워크나 외부 패키지도 사용하지 않는다.

계산기는 세 가지 질문에 답한다.

| 질문 | 함수 | 답변 범위 |
|---|---|---|
| 현재 레벨에서 목표 레벨까지 비용이 얼마나 필요한가? | `planUpgrade` | 선택한 희귀도의 단계별 복제본·골드 합과 보유량 대비 부족분 |
| 이 확률표의 조건과 합이 일관적인가? | `analyzeProbabilityGroup` | 한 그룹의 조건·합·허용 오차·결측·최종 등급 가중합 |
| 확률이 일정한 독립 시행을 반복하면 한 번 이상 성공할 확률은? | `probabilityAtLeastOne` | 사용자가 준 확률에 대한 수학적 계산 |

세 함수 모두 `ok`, `complete`, `blocked`, `errors`, `issues`를 반환한다. 이 상태를 구분해야 자료 누락이 그럴듯한 숫자로 바뀌는 일을 막을 수 있다.

## 2. 반환 상태를 해석하는 계약

| 상태 | 의미 | 화면에서 처리할 일 |
|---|---|---|
| `ok: true, complete: true, blocked: false` | 요청이 유효하고 해당 계산에 필요한 수치가 모두 있음 | 조건과 출처를 붙여 결과 표시 |
| `ok: true, complete: false, blocked: true` | 요청은 유효하지만 결측 또는 불완전한 분포가 있음 | 알려진 부분합과 미확정 항목을 구분 표시 |
| `ok: false, complete: false, blocked: true` | 입력 범위, 중복, 버전, 조건 등의 충돌이 있음 | 오류를 표시하고 계산 확정 중지 |

`blocked`는 결제 실패나 계정 제재 상태가 아니다. 이 분석 도구가 완전한 계산 결과를 확정할 수 없다는 뜻이다. `affordable`는 별도 필드로, 비용이 완전하며 복제본과 골드 보유량을 모두 입력한 경우에만 `true` 또는 `false`가 된다.

### 2.1 숫자 0과 null

- `0`: 확인된 비용이 0이거나, 유효한 계산 결과가 0이다.
- `null`: 해당 값이 없거나 이 입력에서는 확정할 수 없다.
- `knownSubtotal: 0`: 알려진 항목의 합이 0이다. 전체 비용이 0이라는 뜻이 아니다.

대표 사례는 Epic 6→7의 골드다. 공식 발표의 새 표에서 해당 칸이 비어 있으므로 수록 데이터가 `null`이다. 계산기는 `totals.gold: null`과 `knownSubtotal.gold: 0`을 함께 반환한다. 골드를 많이 보유했다고 입력해도 `affordable`은 `null`로 남는다. 과거 표의 400을 가져와 보충하지 않는다. [공식 업그레이드 개편 발표](https://supercell.com/en/games/clashroyale/blog/news/coming-in-the-next-update/)

## 3. 성장 비용 계산

### 3.1 API

```js
const result = RoyaleEconomy.planUpgrade(progressionRows, {
  rarity: 'common',
  fromLevel: 11,
  toLevel: 16,
  ownedCopies: 1000,
  ownedGold: 50000
});
```

`progressionRows`는 [progression_rules.json](data/tables/progression_rules.json)의 배열이다. `rarity`는 `common`, `rare`, `epic`, `legendary`, `champion` 중 하나다. 레벨은 1 이상의 안전한 정수, 선택 입력인 보유량은 0 이상의 안전한 정수여야 한다. 문자열 `"11"`, 빈 문자열, `null`, `NaN`, 무한대, 음수는 숫자로 자동 변환하지 않는다. HTML 입력값을 문자열에서 숫자로 바꾸는 일은 UI 계층에서 명시적으로 처리한다.

이미 `fromLevel`까지 획득·성장한 카드가 전제다. 함수는 `fromLevel + 1`부터 `toLevel`까지의 `transaction_kind: upgrade` 레시피만 선택한다. 최초 해금 복제본은 합에 다시 넣지 않는다. 최저·최고 레벨은 해당 희귀도에 대해 전달받은 표의 하한과 레시피 상한으로 검증한다.

현재와 목표 레벨이 같으면 유효한 변경 없음 요청이다. 단계 목록은 비고 총비용은 복제본 0, 골드 0이다. 반대로 목표가 현재보다 낮으면 강화의 반대 거래를 발명하지 않고 오류로 반환한다.

### 3.2 반환의 핵심 필드

| 필드 | 의미 |
|---|---|
| `recipes` | 실제 선택한 단계별 비용, 원본 레코드 ID, 출처, 필드별 근거 |
| `totals.copies`, `totals.gold` | 완전한 필드의 총비용. 해당 필드에 결측이 있으면 null |
| `knownSubtotal` | 알려진 비용만 합친 부분합 |
| `deficits` | 보유량이 입력되고 총비용이 확정됐을 때의 부족분 |
| `balancesProvided` | 복제본과 골드 보유량을 모두 입력했는지 |
| `affordable` | 두 자원을 모두 충족하는지. 필요한 정보가 없으면 null |
| `recordIds`, `sourceIds` | 계산에 사용한 표의 행과 근거 |
| `versionNotes`, `effectiveFrom`, `effectiveTo` | 선택한 입력의 버전·적용일 정보 |
| `scope` | `supplied_versioned_table_only` |

단계가 누락되면 누락 지점의 `recipes` 항목은 `missing: true`와 비용 null을 갖는다. 나머지 알려진 비용은 부분합에 남지만 전체 경로를 완성했다고 표시하지 않는다. 동일 목표 레벨에 레시피가 둘 이상 있거나 전 단계 연결이 잘못됐으면 임의로 첫 번째 레코드를 선택하지 않는다.

다른 버전 메모 또는 적용 구간을 가진 레시피가 한 요청에 섞이면 실패한다. 사용자가 복수 버전을 비교하려면 각 버전의 배열로 별도 호출하고 결과를 나란히 비교해야 한다. 이 모듈은 표의 시점을 자동으로 “현재”로 바꾸지 않는다.

### 3.3 레벨 11→16의 재계산 결과

수록된 2025년 11월 개편 발표 스냅샷의 레시피를 합산한 결과는 다음과 같다. 이것은 레벨 11 카드를 이미 보유했을 때의 추가 비용이다. 해당 발표는 2025년 11월 24일 개편을 안내한다. [공식 비용표](https://supercell.com/en/games/clashroyale/blog/news/coming-in-the-next-update/)

| 희귀도 | 복제본 합 | 골드 합 |
|---|---:|---:|
| 일반 | 20,500 | 335,000 |
| 희귀 | 4,100 | 335,000 |
| 영웅 | 530 | 335,000 |
| 전설 | 61 | 335,000 |
| 챔피언 | 41 | 335,000 |

일반 카드에서 사용 가능한 복제본 1,000장과 골드 50,000을 입력하면 부족분은 복제본 19,500장, 골드 285,000이다. 복제본을 20,550장 보유했다고 입력하면 복제본 부족분은 0이 된다. 초과 50장을 다른 카드나 재화로 변환하는 절차는 이 계산에 포함하지 않는다.

### 3.4 보유량과 미래 수입의 경계

`ownedCopies`는 **선택한 카드에 지금 사용할 수 있는 미소비 복제본**이다. 전체 희귀도 카드 수, 아직 받을지 모르는 상자 보상, 다른 카드용 복제본을 입력하면 의미가 달라진다. 와일드 카드는 자동 배분하지 않는다. 사용자가 그 카드에 사용하기로 정한 와일드의 수량을 별도 계획에서 확정한 뒤 사용 가능량에 포함할 수 있지만, 그 결정 자체는 이 함수가 수행하지 않는다.

이 함수의 부족분으로 성장 완료 날짜를 바로 계산할 수는 없다. 완료 기간에는 목표 카드별 수입 분포, 골드 수입, 계정 해금, 일회성 보상 수령 여부, 자원의 다른 사용 계획이 필요하다. 복제본과 골드 가운데 어느 하나라도 부족하면 자원별 부족분을 남긴다. 둘을 임의 환율로 합쳐 하나의 비용으로 바꾸지 않는다.

## 4. 조건부 확률표 분석

### 4.1 API와 선택 범위

```js
const result = RoyaleEconomy.analyzeProbabilityGroup(
  probabilityRows,
  'magic__final_stars_given_start_1'
);
```

`probabilityRows`는 [reward_probability_tables.json](data/tables/reward_probability_tables.json)의 배열이다. 함수는 `probability_group` 문자열이 **정확히 일치**하는 행만 선택한다. 출발 1성 Magic 상자의 표와 보장 5성 상자의 표를 같은 분포에 넣지 않는다. Magic·Standard, 출발 등급·최종 등급, 상자 레벨 조건도 각각 유지한다. 수록 확률의 원 출처는 [공식 확률 허브](https://supercell.com/en/games/clashroyale/blog/news/clash-royale-chest-info-2/)다.

선택한 그룹 내부에서는 다음 조건이 같아야 한다.

- `conditional_on`: 상자 가족, 출발/최종 등급, 레벨 또는 이벤트 조건.
- 버전 메모와 적용 구간.
- `exhaustive_group`: 전체 결과를 빠짐없이 포함하는지.
- `probability_sum_tolerance`: 표시 반올림에 대한 합 검증 허용 오차.

객체의 키 순서만 다르고 내용이 같으면 같은 조건으로 취급한다. 조건 값이 하나라도 달라지면 합계를 내어 확정하지 않는다. 동일 결과가 중복되거나 레코드 ID가 중복되면 두 번 더하지 않고 오류로 반환한다. 최상위 `probability`와 `value.probability`가 다르면 데이터 충돌이다.

### 4.2 표시 확률을 보존하는 계산

공식 표의 표시 수치를 그대로 더하면 일부 그룹의 합은 99.99% 또는 100.01%가 된다. 해당 데이터에는 0.0002의 합 허용 오차가 있다. 2026년 10월 앨범 그룹은 합 99.9%와 별도 허용 오차 0.002를 보존했다. 함수는 이 메타데이터를 사용해 검증하며 원본 확률을 수정하지 않는다. [공식 확률표](https://supercell.com/en/games/clashroyale/blog/news/clash-royale-chest-info-2/)

`normalization`은 항상 `none`이다. 합이 1.0001이라는 이유로 각 행을 1.0001로 나누거나 마지막 행에서 0.0001을 빼지 않는다. `roundedInputApproximation`은 부동소수점 덧셈 수준을 넘는 합 차이가 있는지 알린다. 프로그래밍 언어의 아주 작은 덧셈 오차를 허용하는 epsilon과 원문의 표시 반올림 허용 오차는 구분한다.

확률이 null인 행이 있으면 `publishedSum`은 null, `knownSubtotal`은 알려진 확률만 더한 값이다. 합을 1로 맞추기 위해 미확정 행에 남은 확률을 배정하지 않는다. 전체 결과가 아닌 그룹이면 `complete: false`이며 기대 등급도 반환하지 않는다.

### 4.3 최종 등급의 가중합

모든 결과가 `final_stars` 하나만 가진 명시적 숫자 결과이고, 분포가 완전하며 합 검사를 통과한 경우에만 다음을 계산한다.

```text
expectedFinalStars = Σ (publishedProbability × finalStars)
```

Magic 출발 1성의 수록 표는 다음 계산으로 1.9976을 낸다.

```text
0.3164 × 1 + 0.4304 × 2 + 0.2025 × 3 + 0.0406 × 4 + 0.0101 × 5
= 1.9976
```

이는 **공개 표시 확률로 계산한 최종 등급 평균**이다. 실제 상자가 1.9976성으로 지급된다는 뜻도, 보상의 골드 가치가 1.9976배라는 뜻도 아니다. 결과 분포가 반올림돼 있으면 이 가중합도 그 표시 정밀도에 의존한다. 따라서 `expectationKind`는 `weighted_sum_of_published_probabilities`다.

`reward_type`이나 `rarity`처럼 숫자가 아닌 범주에는 임의 숫자를 매기지 않는다. 골드와 카드, 진화, 감정표현을 하나의 현금 가치로 바꾸지 않으며 기대 최종 등급을 구할 수 없는 그룹의 `expectedFinalStars`는 null이다.

### 4.4 무엇을 자동으로 연결하지 않는가

완성 진화 보상 확률은 원하는 특정 진화를 새로 얻을 확률과 다르다. 최종 등급 분포, 해당 등급의 보상 종류 분포, 구체적인 카드 선택 분포, 중복 소유 시 변환이 각각 필요하다. 이 계산기는 선택한 **한 조건부 그룹**만 분석한다. 여러 표를 자동으로 연결하지 않으므로 다음 오류를 구조적으로 피한다.

- 보장 5성 상자에 5성 도달 확률을 다시 곱함.
- Chest Level 13+ 보상 분포를 12 이하에 적용함.
- Standard의 큰 보상 분류와 세부 희귀도 분류를 같은 표에 더함.
- 옛 Hero Fragment Box 확률을 현재 Hero Coins 획득 모델로 재사용함.

옛 Hero Fragment 또는 시즌 전용 표는 `historicalOnly: true`를 반환한다. 이 필드는 수록 데이터의 버전 메모에서 식별한 것이며 현재 적용 여부를 실시간으로 조회한 결과가 아니다. Hero Coins로의 전환 설명은 [공식 3월 중순 업데이트](https://supercell.com/en/games/clashroyale/blog/news/mid-march-update/)와 [26번 문서](26_progression_economy_reconstruction.md)를 함께 참고한다.

## 5. 반복 시행의 이론 확률

### 5.1 API와 식

```js
const result = RoyaleEconomy.probabilityAtLeastOne(0.01, 100);
// result.probability ≈ 0.6339676587
// result.independence_assumed === true
```

동일한 성공 확률 `p`를 가진 독립 시행을 `n`번 반복할 때 한 번 이상 성공할 확률은 `1 - (1 - p)^n`이다. 이 함수는 작은 확률에서도 수치 손실을 줄이기 위해 `-expm1(n * log1p(-p))`를 사용한다. 이는 수학적 계산이며 원작 RNG 알고리즘의 복원이나 시뮬레이션 실행 결과가 아니다.

`p`는 0~1의 유한한 숫자, `n`은 0 이상의 안전한 정수다. 0회 시행의 성공 확률은 입력 확률이 1이어도 0이다. `p = 0`이면 0, `p = 1`이고 한 번 이상 시행하면 1이다. “1%”를 뜻하려면 0.01을 입력해야 하며 문자열 `"1%"`를 넘기면 실패한다.

### 5.2 적용 전제

반환값에는 다음 전제가 들어 있다.

1. 모든 시행의 입력 확률이 같다.
2. 각 시행이 독립이다.
3. 천장·보장 보상·자격 변화·인벤토리 전환·이벤트 만료는 모델에 없다.

100회에서 약 63.4%라는 결과는 100번째에 반드시 얻는다는 보장이 아니다. 원하는 카드의 개별 확률이 알려지지 않았는데 완성 진화 보상 종류 확률을 입력하면, 계산은 그 종류에 대한 가정일 뿐 원하는 진화의 획득 확률이 되지 않는다. 함수에는 source ID가 없는 대신 `scope: user_supplied_probability_only`가 명시된다.

## 6. 실행과 통합

### 6.1 브라우저

전통적인 script 방식으로 읽으면 `globalThis.RoyaleEconomy`에 API가 등록된다. DOM을 참조하지 않으므로 프레임워크와 독립적이다. 전체 오프라인 연구 화면에서는 번들 안에 포함된다.

```html
<script src="lab/economy.js"></script>
```

단독 모듈은 데이터를 자동으로 다운로드하지 않는다. 호출자가 JSON 배열을 전달한다. 따라서 인터넷이 끊겼거나 로컬 HTML을 직접 열어도, 화면에 데이터가 포함돼 있으면 계산할 수 있다.

### 6.2 Node

```js
const fs = require('node:fs');
const economy = require('./lab/economy.js');
const rows = JSON.parse(fs.readFileSync('data/tables/progression_rules.json', 'utf8'));
console.log(economy.planUpgrade(rows, {
  rarity: 'common', fromLevel: 11, toLevel: 16
}));
```

검증 실행은 프로젝트 루트에서 다음과 같다.

```bash
node --test tests/economy.test.cjs
```

반환 객체는 호출자가 화면 표시에 맞게 다룰 수 있지만 입력 배열과 원본 JSON은 변경하지 않는다. 반환한 `recipes[*].sourceIds` 또는 확률 결과의 `outcome`을 수정해도 원본 데이터로 전파되지 않는다.

## 7. 검증한 범위와 남은 범위

21개 자동 검증은 다섯 희귀도의 실제 수록 비용 합, Epic 골드 결측, 자원별 부족분, 동일 레벨 요청, 유효 범위, 누락·중복·버전 충돌, 조건부 확률 분리, 표시 반올림, 미확정 확률, 부분 분포, 과거 자료 표시, 반복 확률의 경계, 입력 불변성, DOM 없는 UMD 로드를 확인한다. 이 숫자는 **계산 도구의 자동 검증 수**다. 원작 거래나 보상 추첨을 21회 실행했다는 뜻이 아니다.

이번 구현은 다음 경계를 의도적으로 남긴다.

| 남은 과제 | 먼저 필요한 자료 또는 계약 |
|---|---|
| 실제 성장 완료 시간 | 목표 카드·자원별 일일 수입 분포와 일회성 수입 분리 |
| 상자 결과의 계정별 기대량 | 개별 카드 선택·중복·해금·초과 전환의 모든 조건 |
| 와일드 카드 최적 배분 | 계정 전체 목표, 희귀도별 잔액, 기회비용 |
| 여러 보상의 거래 정산 | 원자적 소비·지급, idempotency, 원본 영수증 |
| 실제 RNG 동등성 | 직접 관측 가능한 입력·결과와 반복 실험, 표 정밀도 |
| 최신성 자동 판단 | 동일 버전의 추가 근거, 적용 시작·종료 시점의 확인 |

이 경계를 해결할 때는 기존 `null`을 예시 숫자로 덮어쓰기보다 별도 근거 또는 명시적 가정 프로필을 추가한다. 계산 가능성과 실제 원작에서 확인됐다는 상태를 계속 구분해야 후속 구현에서 결과를 신뢰할 수 있다.

## 8. 관련 파일

- [26. 성장·경제 데이터 해석](26_progression_economy_reconstruction.md)
- [32. 데이터 재구축·검증 파이프라인](32_data_pipeline_and_validation.md)
- [33. 원작 관측 프로토콜](33_observation_protocol_and_reconstruction_backlog.md)
- [경제 계산 모듈](lab/economy.js)
- [경제 계산 자동 검증](tests/economy.test.cjs)
- [성장 규칙 JSON](data/tables/progression_rules.json)
- [조건부 확률 JSON](data/tables/reward_probability_tables.json)
