# 경제 및 밸런스 공식

## 경제 원장
모든 현금 변화는 LedgerEvent {tick,reason,sourceId,delta,balanceAfter}로 기록. 종류: POP, ROUND_END, FARM, ABILITY, PURCHASE, UPGRADE, SELL, REFUND, MODIFIER.

## 지표
투자 회수 라운드 = 최초 누적 순현금 흐름이 0 이상이 되는 라운드. 타워 효율 = 특정 테스트 시나리오에서 유효 팝 피해 / 구매비용. 누출 방지율 = 1 - (누출한 유효 위협량 / 총 위협량). DPS와 팝 수익은 동일하지 않음.

## 버프 계산 설계 예
finalInterval = baseInterval / product(attackSpeedMultipliers); finalDamage = (baseDamage + additiveDamage) × product(damageMultipliers). 이는 구현 예시이며 원작 내부 정확한 연산 순서를 주장하지 않는다.

## 난이도별 가격
baseCost × difficultyMultiplier 후 반올림 정책 적용. 구매 전 UI와 서버/시뮬레이터는 동일한 가격 계산 함수를 공유. 할인 오라와 라운드 특수 규칙 적용 순서 테스트.

## 밸런스 QA
동일 시작 현금에서 10/20/40/60/80라운드 클리어율, 타워별 픽률, 파워 스파이크, 최종 현금, 누출 수, 고밀도 라운드 프레임 타임 비교.
