# 교육·아르바이트 정량 규칙 — 재구현 기준안

> **중요:** 다음 가격, 성장치, 해금 및 수식은 원작 실측치가 아닌 **독립 구현용 예시 밸런스**다. 원작과 동일한 값으로 인용하면 안 된다. 과목·직업 명칭도 판본별 대조가 필요하다.

## 1. 공통 실행
- 한 달을 상순·중순·하순의 세 슬롯으로 나누고 슬롯마다 하나의 행동을 배정한다.
- 교육은 슬롯 시작에 비용 차감, 일 단위 결과를 10회 집계한다. 자금 부족 시 시작하지 않고 편성 화면으로 돌아간다.
- 아르바이트는 완료된 일수에 대해 급여를 지급한다. 질병이나 이벤트로 중단된 일수는 미지급한다.
- 능력치 성장 = `round(baseGain * completedDays/10 * conditionMultiplier * aptitudeMultiplier)`; conditionMultiplier는 피로 80 이상 0.6, 50 이상 0.8, 그 외 1.0; aptitudeMultiplier는 0.9~1.1로 제한한다.
- 성장치는 정수로 반영하며 0~999 범위로 제한한다. 스트레스와 피로는 0~100 범위다.

## 2. 교육 예시 데이터

| id | 과목 | 계열 | 주 능력치 | 슬롯 비용(G) | 기본 성장 | 피로 증가 |
|---|---|---|---|---:|---:|---:|
| martial | 무술 | combat | strength | 18 | 3 | 5 |
| fencing | 검술 | combat | combatSkill | 22 | 4 | 6 |
| magic | 마법 | magic | magicSkill | 25 | 4 | 6 |
| science | 과학 | intellect | intelligence | 20 | 3 | 5 |
| poetry | 시문 | culture | art | 18 | 2 | 4 |
| painting | 회화 | culture | art | 20 | 3 | 5 |
| dance | 무용 | social | elegance | 24 | 3 | 5 |
| etiquette | 예절 | social | elegance | 22 | 2 | 4 |
| theology | 신학 | faith | faith | 18 | 2 | 4 |

## 3. 아르바이트 예시 데이터

| id | 직업 | 주 능력치 | 일급(G) | 기본 성장/슬롯 | 스트레스 증가 |
|---|---|---|---:|---:|---:|
| farm | 농장 | strength | 14 | 1 | 3 |
| housework | 가사 | domestic | 12 | 1 | 2 |
| inn | 여관 | service | 16 | 2 | 3 |
| church | 교회 | faith | 12 | 1 | 1 |
| tutor | 가정교사 | intelligence | 22 | 2 | 2 |
| bar | 주점 | charm | 25 | 3 | 5 |
| construction | 목수 | strength | 23 | 2 | 5 |
| maid | 메이드 | elegance | 18 | 2 | 3 |

## 4. 숙련도·해금
- 교육 숙련도는 과목별 `completedDays`로 누적; 30일/90일에서 성장 보너스 +5%/+10% (합산하지 않음).
- 일자리 해금은 데이터 조건식으로 구성한다. 예: 가정교사는 지능 100 이상, 주점은 나이 14 이상. 실제 원작 조건이 아니다.
- 스케줄 검증 시 `locked`, `insufficientFunds`, `ill`, `endingReached` 오류 코드를 반환한다.

## 5. 예제
마법 수업 10일, 기본 성장 4, 피로 55, 적성 1.0 → round(4×1×0.8×1)=3; 비용 25G, 피로 +6.

## 6. 검증 항목
- 각 슬롯의 원작 수업 전후 능력치·자금·피로를 최소 20회 관찰하고 평균과 분산을 기록한다.
- 나이, 숙련도, 계절, 장비, 질병, 업보 등 교란변수를 통제한다.
