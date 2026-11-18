# 기능별 인수 테스트

> Bloons TD 6 역기획 v2.0 | 공개 동작 분석 + 구현용 모델. 수치 예시는 원작 확정 데이터가 아닙니다.

## AT-001 배치
Given 충분한 현금, When 유효 영역 클릭, Then 타워 생성 및 비용 1회 차감. 잘못된 영역은 생성/차감 없음.

## AT-002 타게팅
Given 사거리 내 진행도가 다른 풍선 2개, When First, Then 출구 진행도 높은 풍선 선택.

## AT-003 면역
Given lead와 sharp 공격, When 충돌, Then 피해 0; 대응 타입 공격은 정상 피해.

## AT-004 분할
Given MOAB의 HP가 0, When 피해 적용, Then 정의된 자식 수만큼 생성하고 부모 제거.

## AT-005 업그레이드
Given 3-2-0, When 하단 경로 1 구매, Then 거부; Given 2-2-0, When 상단 3 구매, Then 허용.

## AT-006 라운드
Given 마지막 스폰 완료 및 활성 풍선 0, Then 라운드 종료 보너스 1회 지급.

## AT-007 재현성
Given 같은 seed/input log, Then 틱별 현금/라이프/풍선 수/결과 해시 동일.
