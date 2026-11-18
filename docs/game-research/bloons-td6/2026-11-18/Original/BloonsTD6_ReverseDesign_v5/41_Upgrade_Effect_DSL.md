# 41. 업그레이드 효과 DSL

## 목적
업그레이드 3경로 × 5단계의 **정의 슬롯 15개/타워**와 실제 구매 가능한 빌드 조합을 구분한다. 슬롯 수가 곧 15개의 독립 완성 빌드를 뜻하지 않는다.

## 효과 연산
| op | 필드 | 처리 |
|---|---|---|
| addStat | target, stat, value | 수치 더하기 |
| multiplyStat | target, stat, factor | 배율 적용 |
| setStat | target, stat, value | 명시적 덮어쓰기 |
| addAttack | attack | 신규 공격 컴포넌트 추가 |
| replaceAttack | oldId, attack | 기존 공격 교체 |
| addModifier | modifierId | 상태/버프 추가 |
| grantDetection | tag | 탐지 속성 추가 |
| addAbility | abilityId | 액티브 능력 추가 |
| alterTargeting | modes | 타게팅 선택지 변경 |

## 구매 규칙
- 하나의 경로만 Tier 3~5까지 진행 가능
- 보조 경로는 최대 Tier 2
- 세 번째 경로는 0
- 상위 단계 구매는 해당 경로 직전 단계 구매를 요구
- 가격은 난이도·할인·특수 모드에 의해 최종 계산

## 효과 적용 순서
기본 스펙 → 경로 업그레이드 순서 → 영구 지식/모드 → 타워별 버프 → 실시간 상태이상. 서로 다른 modifier의 합산/곱연산 순서는 별도 우선순위 필드로 고정한다.

## 예제
```json
{"towerId":"dart_monkey","path":"top","tier":1,"effects":[{"op":"addStat","target":"main","stat":"pierce","value":1}],"sourceStatus":"assumed"}
```
위 값은 **설명용 가정**이며 원작 수치로 사용하지 않는다.

## QA
경로 제한 0-3-3, 3-3-0, 5-2-1 거부. 5-2-0 허용. 판매/재배치 후 버프 잔존 금지. 효과 역적용은 누적 뺄셈 대신 스펙 재계산을 권장한다.
