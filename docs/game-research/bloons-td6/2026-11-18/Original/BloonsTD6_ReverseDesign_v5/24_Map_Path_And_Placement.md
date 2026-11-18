# 맵 경로 및 배치 시스템

## 데이터
MapDefinition {id,canvasSize,paths:[{id,points,spawnOffset,exitId}],zones:[{polygon,tags}],obstacles,interactables,decorations,roundPathRules}.

## 경로
풍선은 distanceAlongPath를 상태로 보유. 일정 거리 이동 후 spline 또는 polyline 샘플로 위치 계산. 갈림길은 pathId로 결정, 복수 입구·출구 지원. 회전/속도는 경로 접선과 개체 speedScale을 사용.

## 배치
타워 footprint와 허용 zone의 교집합 검사, 경로 충돌 검사, 지형·수면 태그 검사, 장애물/기존 타워와 겹침 검사. 경계선의 부동소수 오차를 피하도록 epsilon 고정.

## 가시성
사거리와 시야 차단을 별개 속성으로 관리. 타워별 장애물 무시 정책 및 높은 지형 예외를 데이터로 정의. 클릭 가능한 환경 기믹은 별도 상태 머신으로 관리.

## QA
다중 입구, 맵 확대, 좁은 코너, 수상 배치, 경계선, 화면비 16:9/20:9, 터치 드래그 중 취소.
