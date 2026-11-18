# JavaScript/TypeScript 아키텍처

> Bloons TD 6 역기획 v2.0 | 공개 동작 분석 + 구현용 모델. 수치 예시는 원작 확정 데이터가 아닙니다.

## 모듈
GameLoop, RuleSet, RoundDirector, BloonSystem, TowerSystem, TargetingSystem, ProjectileSystem, DamageSystem, EconomySystem, MapSystem, AbilitySystem, SaveSystem, Renderer, UI.

## 틱 순서
1 Commands 적용 → 2 Spawn → 3 Movement → 4 Target acquisition → 5 Attack → 6 Projectile movement/collision → 7 Damage/children → 8 Income → 9 Cleanup → 10 Victory check.

## 이벤트
BloonSpawned, BloonDamaged, BloonSplit, BloonLeaked, TowerPlaced, UpgradePurchased, AbilityActivated, RoundCompleted, CashChanged. 이벤트 핸들러는 재진입 방지를 위해 큐 처리.

## 저장
SaveGame {schemaVersion,seed,mode,map,round,cash,lives,towers,hero,abilities,stats}. 버전별 migration 제공.

## 재현성
시드 RNG, 고정 틱, 정렬된 충돌 순서, 입력 커맨드 로그로 리플레이 및 자동 검증. 렌더 프레임 레이트와 무관한 시뮬레이션.
