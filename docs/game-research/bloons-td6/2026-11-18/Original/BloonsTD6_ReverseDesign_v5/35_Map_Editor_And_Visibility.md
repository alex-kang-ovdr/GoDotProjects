# 맵 에디터와 시야

## 레이어
terrainPolygon, pathSpline[], placementMask, waterPolygon[], obstaclePolygon[], decoration, elevation(optional), occlusionSegment[]. 배치 후보는 타워 발자국이 유효 영역에 완전히 포함되고 기존 타워·장애물과 겹치지 않아야 한다.

## 경로
스폰과 출구는 경로별로 별도 정의. 풍선은 거리 기반 파라미터로 이동하며 분할 후 같은 경로의 같은 진행 거리에서 자식 생성. 맵 변형 이벤트가 경로를 바꾸면 유효한 다음 경로 버전으로 이전한다.

## 타게팅
First/Last는 해당 풍선의 남은 경로 거리 기준, Close는 타워와 거리, Strong은 정의된 위협 순위 기준. 장애물에 의한 투사체 차단 여부는 타워별 공격 태그로 지정.

## 편집기 QA
경로의 연결성, 최소 폭, 시작/종료 위치, 물/육지 배치 마스크, 장애물 시야차단, 모든 맵에서 기본 타워 하나 이상 배치 가능 여부 검증.
