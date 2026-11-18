# 3경로 업그레이드 규칙

> Bloons TD 6 역기획 v2.0 | 공개 동작 분석 + 구현용 모델. 수치 예시는 원작 확정 데이터가 아닙니다.

## 규칙
각 타워의 세 경로는 0~5 티어. 하나의 경로에서 티어 3 이상을 구매하면 다른 경로 중 하나만 최대 티어 2까지 선택 가능하고 나머지는 0으로 유지한다. 허용 빌드 예: 5-2-0, 0-2-5, 2-5-0.

## 검증 알고리즘
구매 후 후보 tiers를 생성하여 (a) 각 티어 0..5 (b) 3 이상 경로 수 ≤1 (c) 0 초과 경로 수 ≤2 (d) 주 경로 외 경로 티어 ≤2를 검사한다. 경로 티어는 순차 구매해야 한다.

## 업그레이드 효과
statModifier(합/곱), addAttack, replaceAttack, applyStatus, grantDetection, grantAbility, economyModifier, aura, summon, transform. 변경은 원본 정의와 인스턴스의 계산된 스탯을 분리하여 누적한다.

## 능력
Ability {cooldown,charges,activationCondition,targetSelection,effect,duration}; 발동 중복, 쿨다운 초기화, 일시정지 시계 처리, 매도 후 취소를 테스트한다.

## 예시
Dart Monkey 상단은 관통/발사 패턴 강화, 중단은 공격 속도 및 액티브 능력, 하단은 사거리·탐지 및 고유 투사체 패턴으로 역할 분화. 정확한 효과와 수치는 버전별 검증이 필요하다.
