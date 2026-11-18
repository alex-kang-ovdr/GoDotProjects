# 라운드 페이싱과 위협도

## 웨이브 정의
spawnGroup={startTick,intervalTicks,count,bloonId,pathId,flags}; 라운드는 다수 그룹을 포함하고 그룹은 시간상 중첩 가능. 라운드 종료는 생성 대기=0 AND 생존 적=0 조건.

## 위험도 추정(원작 공식 아님)
`threat = effectiveLayerHP * speedWeight * resistanceWeight * overlapWeight`. 속도 가중치는 경로 길이와 사거리 노출 시간에 따라 조절. 위협도는 제작 도구용 지표이며 원작 난이도를 대신하지 않는다.

## 기준 검증 라운드
- R1: 기본 풍선 처리와 타워 설치 온보딩
- R24: Camo 대응 확인
- R28: Lead 대응 확인
- R40: MOAB 대응 확인
- R63: 밀집 세라믹 대응 확인
- R80: ZOMG 대응 확인
- R90: DDT 대응 확인
- R100: BAD 대응 확인
위 라운드는 대표적인 전략 체크포인트이며 정확한 스폰 수량·시점은 별도 검증 데이터가 필요하다.

## 스폰 데이터 승인
각 라운드에 totalBloons, expectedChildrenUpperBound, peakConcurrent, totalDurationTicks 계산. 부정확한 추정 스폰은 `verified=false`로 저장한다.
