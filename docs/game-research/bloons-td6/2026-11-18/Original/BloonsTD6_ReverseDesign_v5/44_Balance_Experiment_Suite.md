# 44. 밸런스 자동 실험 명세

## 실험 단위
`Experiment={id,mapId,mode,roundRange,seed,startingCash,startingLives,towers,hero,modifiers,runCount}`.

## 실험 유형
1. 단일 타워: 동일 비용대 타워의 라운드별 유효 피해/누출 비교
2. 조합 시너지: 공격 타워 단독 vs 지원 버프 조합
3. 면역 커버리지: Lead/Camo/Purple/DDT 등 대응 여부
4. 경제 투자: 농장 투자 시점별 회수 기간과 최종 현금
5. 배치 민감도: 위치 격자 스윕으로 배치별 효율 차이
6. 성능 부하: 풍선 100/500/1000개와 투사체 100/1000개 부하

## 핵심 메트릭
- `clearRate`: 승리 횟수 / 실행 횟수
- `cashEfficiency`: 유효 피해량 / 총 지출
- `leakCount`, `livesLost`, `timeToClearTicks`
- `peakActiveBloons`, `peakProjectiles`, `simulationMsPerTick`
- `damageByType`, `damageByTower`, `immunityBlockedHits`

## 통제 변수
시드, 틱레이트, 라운드, 난이도, 경로, 입력 시점, 게임 버전을 고정한다. 시각적 배속은 논리 시뮬레이션 결과에 영향을 주면 안 된다.

## 회귀 기준 (개발 목표치)
- 동일 입력/시드: 결과 완전 동일
- JSON 스키마: 100% 검증 통과
- 알려진 기준 시나리오: 피해/수익/누출 이벤트 로그 해시 동일
- 성능 기준은 목표 기기에서 별도 측정 후 확정
