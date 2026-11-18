# 타워 빌드와 시너지

## 3경로 상태 머신
상위 경로는 최대 5, 교차 경로는 최대 2. 세 번째 경로는 업그레이드 불가. 두 경로를 선택한 뒤 제3 경로 구매는 차단. 업그레이드 효과는 기초 공격을 수정하거나 별도 공격 컴포넌트를 추가한다.

## 타워 역할군
- 단일 고내구 대응: Sniper Monkey, MOAB 계열 공격 강화
- 군집 대응: Bomb Shooter, Tack Shooter, Boomerang Monkey
- 탐지·지원: Monkey Village, 특정 영웅과 업그레이드
- 경제: Banana Farm, Merchantmen 등
- 지형 특화: Monkey Sub/Boat는 물 영역 배치

## 빌드 평가 메트릭
`effectiveDamage = sum(actualAppliedDamage)`, `leakCount`, `cashSpent`, `cashEarned`, `coveragePercent`, `targetSwitches`, `pierceWaste`, `immuneHits`. 훈련용 3개 시나리오(단일 MOAB, 밀집 일반, Camo+Lead)를 같은 seed로 실행한다.

## 버프 계산 정책(구현 제안)
버프마다 stackGroup, maxStacks, durationTicks, radius, affects, priority, add/multiply 연산 지정. 동일 stackGroup은 가장 강한 것만 적용하는 정책과 누적 정책을 데이터로 구분한다. 실제 원작의 개별 버프 중첩 규칙은 타워별 검증이 필요하다.
