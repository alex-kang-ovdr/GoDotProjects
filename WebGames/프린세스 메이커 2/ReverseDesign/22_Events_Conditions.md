# 이벤트 조건 및 실행 명세

> 모든 아래 예제는 **재구현용 가상 이벤트**이며 원작 고유 이벤트의 발생 조건을 확정하는 자료가 아니다.

## 이벤트 실행 파이프라인
1. `onMonthStart` / `onSlotComplete` / `onBirthday` / `onFestival` / `onAdventureStep` 발생
2. trigger가 일치하는 이벤트 후보를 필터링
3. `once`, `cooldownMonths`, `ageMin/Max`, `requiredFlags`, `forbiddenFlags`, `statRequirements` 평가
4. 우선순위 내림차순, ID 오름차순 정렬 후 독점 그룹별 하나만 선택
5. 확률 판정은 저장된 PRNG 상태로 수행
6. 선택지 UI를 표시하고 **확정 시에만** 비용/보상/플래그를 원자적으로 반영
7. `eventInstanceId`를 기록해 중복 적용 방지

## 이벤트 표
| ID | 시점 | 조건 | 선택 | 효과 | 재발생 |
|---|---|---|---|---|---|
| EV001 | 월 시작 | 스트레스≥70 | 휴가/계속 | 휴가: 20G 지출, 스트레스 -25 | 3개월 쿨다운 |
| EV002 | 생일 | 매년 | 선물/대화 | 선물: 30G 지출, 친밀도 +8 | 연 1회 |
| EV003 | 교육 완료 | 지능≥120 | 책 구매/거절 | 구매: 40G 지출, 지능 +6 | 1회 |
| EV004 | 모험 조우 | 체력≥30 | 전투/회피 | 전투 진입 또는 지역 이동 | 조우마다 |
| EV005 | 수확제 | 해당 월 | 대회 참가/관람 | 참가 시 점수 계산 | 연 1회 |

## 이벤트 JSON 예시
```json
{
  "id":"EV003", "trigger":"onSlotComplete", "priority":30, "once":true,
  "conditions":{"all":[{"stat":"intelligence","op":">=","value":120},{"money":{"gte":40}}]},
  "choices":[{"id":"buy","cost":40,"effects":{"intelligence":6}},{"id":"skip","effects":{}}]
}
```

## 예외
- UI를 닫아도 대기 이벤트를 유지한다.
- 조건은 **발생 시점**에 검사하고 선택 시 자금 등 비용을 다시 검사한다.
- 이벤트 발생 후 같은 프레임에 엔딩으로 진입하면 엔딩 판정을 우선한다.
