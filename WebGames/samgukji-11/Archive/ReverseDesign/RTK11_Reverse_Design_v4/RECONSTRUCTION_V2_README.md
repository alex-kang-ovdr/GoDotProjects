# 삼국지 11 원작 데이터 재구축 v2

## 포함
기존 v1 시스템 문서 30개 및 빈 CSV 스키마를 보존하고 `reconstructed_data/`에 데이터 사전 12종을 추가했습니다.

## 주의: 검증 단계
- `candidate` / `NOT_VERIFIED`: 역사 소재나 자료상 후보로서 **실제 삼국지 11의 해당 이벤트 존재를 확정하지 않음**.
- `reference-derived`: 공개 공략 자료를 토대로 재구성한 수치. 공식 게임 파일 추출값이 아님.
- `original_reconstruction`: **새로 쓴 창작 대사**이며 원작 대사가 아님.
- 빈 칸: 원본 데이터 파일이나 동일 조건 반복 실측 없이는 확정 불가.
- 이 패키지에는 원본 게임의 저작권 보호 대상 대사 전체 또는 내부 게임 리소스가 들어 있지 않습니다.

## 데이터 정합성
`event_catalog.event_id` ↔ `dialogue_reconstruction.event_id` ↔ `event_conditions_template.event_id`.
`scenario_catalog.scenario_key` ↔ 추후 `scenario_initial_state.scenario_key`.
원본 PK와 일반판은 데이터베이스를 분리하여 비교하십시오.

## 실제 원작 일치도 개선을 위한 입력
사용자가 소유한 PC/PK 게임에서 추출한 데이터 파일, 세이브, 공식 매뉴얼, 이벤트 스크린샷/녹화, 수치 측정표가 있으면 값과 조건을 검증할 수 있습니다.
