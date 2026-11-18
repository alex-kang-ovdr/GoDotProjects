# 맵·경로·지형·배치

> Bloons TD 6 역기획 v2.0 | 공개 동작 분석 + 구현용 모델. 수치 예시는 원작 확정 데이터가 아닙니다.

## 맵 구조
MapDefinition {bounds,paths:[{id,waypoints,spawnGroups,exitId}],terrainZones,placementZones,obstacles,interactiveObjects,visualLayers}.

## 경로 이동
풍선은 경로 호길이 distance를 따라 이동한다. 선형 구간/스플라인 구간별 누적 길이 테이블을 미리 계산하여 빠르게 좌표화한다.

## 복수 경로
웨이브의 spawnGroup이 pathId를 선택한다. 서로 다른 출구와 동시 스폰 가능. First/Last 타게팅은 출구까지의 정규화 진행도를 사용하도록 규칙을 명시한다.

## 배치
타워 footprint vs path/obstacle 충돌, waterOnly, landOnly, elevated, blockedLineOfSight 등의 규칙 분리. 맵 인터랙션은 비용과 효과를 데이터로 정의.

## 검증
타워 배치로 경로를 막을 수 없어야 함; 경계/장애물 중첩 불가; 다중 경로 풍선 타게팅 안정성.
