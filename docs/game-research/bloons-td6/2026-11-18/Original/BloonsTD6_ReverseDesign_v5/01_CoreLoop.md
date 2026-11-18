# 코어 루프와 상태 머신

> Bloons TD 6 역기획 v2.0 | 공개 동작 분석 + 구현용 모델. 수치 예시는 원작 확정 데이터가 아닙니다.

## 게임 상태
Boot → Menu → Setup → RoundReady → RoundRunning → RoundCleanup → RoundReady / Victory / Defeat. Pause는 RoundRunning의 하위 상태로 취급한다.

## 상태 전이 조건
- RoundReady: 스폰 대기열이 없고 이전 라운드의 적이 모두 처리됨
- RoundRunning: 스폰 타임라인 또는 활성 풍선이 존재
- RoundCleanup: 스폰 완료, 남은 투사체/상태효과 정리
- Victory: 모드별 목표 라운드 완료
- Defeat: 라이프 ≤ 0 (모드별 예외 규칙 가능)

## 결정 타이밍
라운드 중에도 타워 건설, 업그레이드, 판매, 액티브 스킬을 허용하는 모드가 일반적이다. 건설 비용은 즉시 차감하고 배치 실패 시 차감하지 않는다.

## 승리 조건
Standard/Hard/Impoppable/CHIMPS 등은 종료 라운드와 경제/능력 제약이 다르다. 목표 라운드는 모드 설정 데이터에서 읽는다.
