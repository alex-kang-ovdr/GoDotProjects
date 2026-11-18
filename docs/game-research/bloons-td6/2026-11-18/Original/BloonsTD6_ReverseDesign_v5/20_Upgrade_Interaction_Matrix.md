# 업그레이드 상호작용 및 교차 경로

## 원작 핵심 제약
세 경로 중 한 경로는 3~5티어까지, 다른 한 경로는 최대 2티어까지 선택 가능하며 세 번째 경로는 0. 두 경로가 모두 1~2티어일 때에는 이후 주 경로를 선택할 수 있다. 단일 타워의 티어 5 보유 제한 및 예외는 게임 모드/특수 규칙과 함께 검증한다.

## 상태 머신
initial(0,0,0) → tier1/tier2 자유 선택(최대 2개 경로) → tier3 구매 시 mainPath 잠금 → mainPath tier4/tier5 가능, secondaryPath tier2 이하 가능. 허용 예: 5-2-0, 0-2-5, 2-0-4. 불허 예: 3-3-0, 2-2-1, 5-0-3.

## 업그레이드 효과 타입
STAT_ADD, STAT_MULTIPLY, ATTACK_REPLACE, ATTACK_ADD, DAMAGE_TYPE_OVERRIDE, TARGETING_ADD, DETECTION_ADD, STATUS_ON_HIT, AURA_ADD, ABILITY_UNLOCK, PROJECTILE_BEHAVIOR_ADD, ECONOMY_ADD, SUMMON_ADD.

## 적용 순서 제안
기본 정의 → 구매한 업그레이드 순서에 독립적인 정규화 적용 → 영웅/마을 버프 → 임시 효과 → 게임 모드 변형 → 최종 공격 스냅샷. 수치 가산/곱연산 순서는 데이터 규칙으로 고정하고 QA에서 교환법칙을 확인.

## 교차 경로 테스트
0-2-3과 2-0-3이 동일 주 경로라도 투사체 속성·공격 주기가 다를 수 있다. UI에는 실제 변경값만 보여주고 상세 패널에서 피해/관통/공격주기/특수 능력 차이를 표시.
