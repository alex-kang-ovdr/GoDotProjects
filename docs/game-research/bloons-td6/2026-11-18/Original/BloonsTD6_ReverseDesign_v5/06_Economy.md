# 현금·수익·판매·농장

> Bloons TD 6 역기획 v2.0 | 공개 동작 분석 + 구현용 모델. 수치 예시는 원작 확정 데이터가 아닙니다.

## 통화
Cash는 매치 내 자원; Monkey Money는 메타 진행 통화로 분리한다. 난이도별 가격 계수와 모드별 수익 제약을 독립적으로 설정.

## 거래
Purchase: 현금 충분, 유효 위치, 모드 허용 → 차감. Upgrade: 선행 티어/경로 규칙/현금 검사. Sell: 환급률 적용 후 타워 제거, 지속 오라/스폰물 정리.

## 수익 이벤트
풍선 계층 파괴, 라운드 종료 보너스, Banana Farm 생산, 특수 타워 수익, 능력 수익. 각 이벤트에 sourceId와 uniqueEventId를 부여하여 중복 지급 방지.

## 밸런스 수식(재현용)
ROI_rounds = totalInvestment / expectedNetIncomePerRound. DPS_per_Cash = effectiveDamagePerSecond / totalCost. 단순 DPS가 아닌 속성 커버리지와 경로 지형 가치를 함께 고려.

## 모드 예외
CHIMPS의 추가 수입 제한, 판매 금지 등은 rule-set 데이터에서 강제. 원작의 정확한 예외 및 금액은 게임 버전 확인 대상.
