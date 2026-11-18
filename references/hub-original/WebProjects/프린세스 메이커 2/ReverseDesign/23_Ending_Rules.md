# 엔딩 판정 — 데이터 기반 구현 명세

> 아래 임계값과 순서는 **원작 확정 정보가 아닌 예시 구현**이다. 원작의 엔딩 분류·우선순위는 판본별 플레이 검증이 필요하다.

## 판정 시점
- 18세 종료 시점에 단 한 번 수행한다. 이벤트 대기 중에는 엔딩으로 넘어가지 않는다.
- `endingResolved=true`를 기록하고 저장/로드 후 재평가하지 않는다.

## 우선순위 규칙
1. 특수 엔딩 후보 (`special`)
2. 결혼/관계 엔딩 후보 (`relationship`)
3. 직업 엔딩 후보 (`career`)
4. 기본 엔딩 (`fallback`)

동일 그룹에서는 `priority DESC`, `score DESC`, `id ASC`로 결정한다. 원작의 실제 우선순위를 의미하지 않는다.

## 예시 판정 테이블
| ID | 범주 | 조건 | 점수 | 우선순위 |
|---|---|---|---|---:|
| END_RULER | 직업 | 기품≥400, 지능≥300, 도덕≥250 | 기품+지능+도덕 | 80 |
| END_KNIGHT | 직업 | 전투기술≥350, 체력≥300 | 전투기술+체력 | 60 |
| END_MAGE | 직업 | 마법기술≥350, 지능≥250 | 마법기술+지능 | 60 |
| END_ARTIST | 직업 | 예술≥350, 감수성≥250 | 예술+감수성 | 50 |
| END_MERCHANT | 직업 | 자금≥1000, 지능≥180 | 자금/10+지능 | 40 |
| END_DEFAULT | 기본 | 항상 참 | 0 | 0 |

## 판정 의사코드
```ts
function resolveEnding(state, rules) {
  if (state.endingResolved) return state.endingId;
  const eligible = rules.filter(r => evaluate(r.conditions, state));
  eligible.sort((a,b) => groupRank(b.group)-groupRank(a.group) ||
    b.priority-a.priority || score(b,state)-score(a,state) || a.id.localeCompare(b.id));
  return eligible[0]?.id ?? 'END_DEFAULT';
}
```

## 검증 시나리오
- 다수 조건을 동시에 만족하는 경우 우선순위가 결정적이어야 한다.
- 정확히 임계값인 경우 `>=`로 통과한다.
- 원작 비교 테스트는 동일 세이브에서 능력치 하나만 조정해 경계값을 찾는다.
