# 정규화 데이터 사전

`normalized_schema.csv`는 역기획에 필요한 논리 스키마이며 원작의 바이너리 구조를 의미하지 않습니다.

## 참조 무결성
- officer.force_id → forces.force_id (재야/미등장 예외 허용)
- officer.city_id → cities.city_id (출진/포로/미등장 예외)
- unit.leader_id → officers.officer_id
- event.event_id → event_conditions.event_id / dialogue.event_id
- scenario assignments → officers, forces, cities의 복합 초기 스냅샷

## 수치 처리 원칙
- 수치형 필드와 미검증 필드를 혼합하지 말 것
- `null`은 미확인, `0`은 확인된 영값
- 전투 공식은 아직 확정되지 않아 임의 계수를 사용하지 않음
- 시나리오마다 도시 소유권과 장수 소속이 달라짐
- Base/PK 버전 필드를 별도로 유지
