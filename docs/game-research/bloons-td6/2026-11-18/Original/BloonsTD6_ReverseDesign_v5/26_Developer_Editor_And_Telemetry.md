# 개발자 실시간 편집 및 자동 계측

## 실시간 패널
타워 선택 → 기본/최종 스탯 병렬 표시 → 숫자 변경 → 현재 인스턴스만 적용 또는 정의 전체 적용 → 되돌리기. 현금 무제한, Lives 고정, 풍선 스폰, 라운드 이동, 배속(0.25/0.5/1/2/4), 공격 범위·충돌 디버그 렌더링.

## 로그
CombatEvent {tick,source,target,eventType,damage,layerRemoved,pierceRemaining}; EconomyEvent; RoundEvent. 수집 샘플링을 제공해 대규모 전투에서 로그 자체가 병목이 되지 않게 한다.

## 리플레이
맵 ID, 시드, 난이도, 초기 설정, 입력 커맨드(tick,action,payload), 데이터 버전을 기록. 같은 데이터·시드에서 체크섬이 동일해야 한다.

## 성능 지표
frameMs p50/p95/p99, simulationMs, renderMs, activeBloons, activeProjectiles, collisionChecks, allocationsPerTick, GC pauses, memoryMB.

## QA 자동화
스폰 100/1000/5000개, 다중 투사체 10000개, 파편/분할 폭증, 4배속, 중단/재개, 저장/로드, 고정 시드 반복 검증.
