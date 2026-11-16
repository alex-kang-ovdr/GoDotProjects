# 드롭 및 파밍

> 분석 범위: Diablo II: Lord of Destruction / Resurrected의 공통 핵심 규칙. 패치별 차이는 별도 검증 대상이며, `구현 제안`은 원작 내부 코드의 확정 사실이 아닙니다.

## 시스템 책임 및 처리 흐름

**목적:** 드롭 테이블·TC·매직 파인드의 사용자 경험과 런타임 규칙을 구현 가능한 단위로 정의한다.

### 1. 드롭 파이프라인
사망 이벤트 → 몬스터/지역/난이도 컨텍스트 → TC 선택 → NoDrop 포함 반복 추첨 → 베이스 선택 → 품질 판정 → affix/unique/set 후보 검사 → 아이템 인스턴스 생성.

### 2. Treasure Class
TC는 중첩된 가중치 테이블로 모델링. NoDrop, Gold, Equipment, Good, 하위 TC 등을 데이터로 연결하고 재귀 깊이 제한을 둔다.

### 3. 레벨 게이트
몬스터 레벨(mlvl), 지역 레벨(alvl), 아이템 레벨(ilvl), 품질 레벨(qlvl), 접사 레벨(alvl; affix level)을 혼동하지 않는다.

### 4. Magic Find
MF는 품질(매직·레어·세트·유니크) 결정 확률에 관여하며 베이스 아이템 자체의 TC 선택을 직접 상향시키지 않는다. 고품질일수록 효율 체감이 다르다.

### 5. 플레이어 수
파티/게임 인원과 인접성에 따른 NoDrop 보정은 룰셋별 함수로 분리. 단독 웹 구현은 명시적 playersX 테스트 설정으로 시뮬레이션 가능.

### 6. 검증 방법
고정 시드 10만~100만 회 샘플로 품질·베이스·NoDrop 빈도 측정. 희귀 드롭은 확률 신뢰구간을 함께 보고하고 기대값을 테스트 오라클로 사용.

## 권장 데이터 스키마 (구현 제안)

```json
{
  "system": "06_Loot",
  "rulesetVersion": "d2-lod-reference",
  "definitions": [{"id": "example", "parameters": {}, "conditions": []}],
  "runtime": {"entityId": 1, "state": "active", "tick": 0}
}
```

## 처리 의사코드 (구현 제안)

```text
onCommand(command, world):
  validate(command, world.ruleset)
  context = resolveContext(command, world)
  if not context.allowed: return Rejected(context.reason)
  events = evaluateDeterministically(context, world.rng)
  for event in events: applyStateChange(event, world)
  publish(events)
  return Accepted(events)
```

## 시스템 경계 및 예외 처리

- 데이터 테이블의 정의값과 런타임 인스턴스 상태를 분리한다.
- 동일한 입력·시드·틱에서 결과가 재현되도록 이벤트 순서를 고정한다.
- 아이템/재화/경험치의 변경은 중복 호출에도 안전하게 처리한다.
- 액트·난이도·확장팩·패치 버전별 차이를 ruleset 키로 분리한다.
- UI 애니메이션 완료 여부가 실제 게임 규칙 판정의 진실 원천이 되지 않도록 한다.

## 상세 검증 시나리오

| 테스트 | 입력/상황 | 기대 결과 |
|---|---|---|
| 정상 | 유효한 조건과 충분한 자원 | 규칙에 따라 정확히 한 번 상태 변경 |
| 경계 | 최소/최대 값, 프레임 경계 | clamp 및 breakpoint 일관성 |
| 실패 | 조건 미달, 소멸한 타깃, 공간 부족 | 자원·아이템 손실 없이 거부 |
| 재현 | 동일 시드/동일 명령 순서 | 결과 해시 일치 |
| 저장 | 상태 변경 직후 저장/재로드 | 영속 상태와 파생 상태 일치 |
| 부하 | 다수 유닛/아이템/이벤트 | 누락·중복 없이 목표 틱 유지 |

## 원작 검증이 필요한 항목

- 정확한 내부 계산 순서, 반올림, 정수 오버플로 및 프레임별 처리 차이
- 직업·무기·몬스터별 애니메이션 breakpoint와 특수 예외
- TC/접사/아이템 레벨 등 버전별 데이터 테이블
- 원작 규칙과 편의상 채택한 웹 독립 구현 규칙의 차이
