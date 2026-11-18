# 개발자 시뮬레이터와 QA

## 조작
라운드 점프, 스폰 중지, 일시정지, 0.25/0.5/1/2/4배(테스트 전용), 무한 현금, 무적, 타워 업그레이드 강제 적용, 풍선 태그 토글, 단일 타워 격리, DPS 계측.

## 측정
simulationTick, simMs, renderMs, activeBloons, activeProjectiles, collisionCandidates, successfulHits, immunityRejectedHits, leakedBloons, cashDelta, peakMemory. 동일 seed로 배치 저장 후 반복 100회 비교.

## 자동 회귀
1. 스키마 검증 → 2. 규칙 단위 테스트 → 3. 1000틱 결정론 테스트 → 4. 10개 대표 웨이브 → 5. 저장/불러오기 재현 → 6. 브라우저 프레임 성능 측정.

## 수용 기준(제안)
규칙 테스트 100% 통과, 같은 seed+입력 로그로 최종 해시 일치, 라운드 진행 중 음수 현금/중복 분할 0, 1000풍선 부하에서 논리 틱 누락 0(하드웨어 목표 별도 정의).
