# 데이터 사전 v4

## 상태 라벨
- `historical_reference_not_verified_in_game`: 역사상 인물 이름 및 생몰 연도 참고. 삼국지 11 원작 수치/등장 여부 검증 전.
- `NOT_VERIFIED_AGAINST_RTK11`: 도시 후보. 원작 전체 도시 목록이 아님.
- `NEWLY_WRITTEN_NOT_ORIGINAL_GAME`: 저작권 보호를 위해 새로 작성한 시연 대사. 원문이 아님.
- `prototype_only`: 재구현 실험 이벤트. 실제 원작 이벤트/트리거가 아님.

## 테이블 관계
- `officers_reference.officer_id` → 향후 `scenario_officers.officer_id`.
- `settlements_candidates.candidate_id` → 향후 원작 도시 ID 매핑 후 `scenario_cities.city_id`.
- `dialogue_original_prototype.line_id` → `events_prototype.dialogue_ids[]`.
- `events_prototype.conditions` → `GameState` 경로 조건.

## 데이터 검증 정책
1. 역사적 사실과 게임 내 수치를 분리한다.
2. 원작 스크린샷/세이브/공식 문서에서 검증하지 않은 값은 비워 둔다.
3. PK 여부와 플랫폼 버전을 기록한다.
4. 이벤트 조건은 단일 테스트가 아니라 긍정·부정·경계 테스트를 기록한다.
5. 원작 저작권 대사는 포함하지 않고 출처와 길이 제한을 지킨다.
