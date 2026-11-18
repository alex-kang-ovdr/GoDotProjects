# 데이터 정의·JSON 예시

> Bloons TD 6 역기획 v2.0 | 공개 동작 분석 + 구현용 모델. 수치 예시는 원작 확정 데이터가 아닙니다.

## 데이터 작성 규칙
ID는 영문 snake_case, 단위는 초/월드 단위/현금으로 고정. 스키마 버전과 검증 함수를 둔다.

```json
{
  "id":"dart_monkey", "category":"primary", "baseCost":200,
  "footprintRadius":12, "range":90, "attackInterval":0.95,
  "targetingModes":["first","last","close","strong"],
  "attacks":[{"type":"projectile","damage":1,"pierce":2,"damageType":"sharp"}],
  "upgradePaths":[[],[],[]]
}
```
위 값은 원작 확정 수치가 아닌 구현용 샘플이다.

## 정합성
- 모든 children 참조가 BloonDefinition에 존재
- upgradePaths는 정확히 3개이며 각 5단계
- 비용 ≥ 0, 공격 주기 > 0, 사거리 ≥ 0
- 중복 ID 없음, 미정의 속성 태그 없음
- 순환 자식 스폰은 명시적 예외 없이 금지.
