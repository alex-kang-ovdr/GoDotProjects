# 구현 아키텍처·저장·결정론

## 모듈
GameSession, RoundScheduler, BloonSystem, TowerSystem, TargetingSystem, ProjectileSystem, DamageResolver, StatusSystem, EconomyLedger, AbilitySystem, MapSystem, RenderAdapter, SaveManager, Telemetry.

## 실행 순서
fixedTick: 입력 명령 → 라운드 스폰 → 상태효과 갱신 → 풍선 이동 → 타겟 획득 → 발사 → 투사체 이동/충돌 → 피해·분할 큐 → 경제 → 종료 판정 → 스냅샷. 렌더링은 이전/현재 스냅샷 보간.

## 저장
{schemaVersion,contentVersion,mapId,mode,seed,tick,round,roundTime,cash,lives,towers,bloons,projectiles,abilities,ledgerSummary}. 저장은 틱 경계에서 수행. migration 함수를 버전별 제공.

## 성능
경로 위치는 거리 스칼라로 보관, 투사체 object pooling, 충돌 spatial hash, 타겟 탐색 캐시, 동일 이펙트 instancing, HUD 업데이트 throttle. WebGL/Canvas 렌더러 교체 가능.

## 안전성
데이터 파일 검증(JSON schema), NaN/음수 피해 방지, 중복 이벤트 ID 차단, 저장 불일치 탐지, 외부 입력 정규화.
