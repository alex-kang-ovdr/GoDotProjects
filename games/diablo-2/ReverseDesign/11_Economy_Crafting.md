# 경제·상점·큐브·룬워드

> 분석 범위: Diablo II: Lord of Destruction / Resurrected의 공통 핵심 규칙. 패치별 차이는 별도 검증 대상이며, `구현 제안`은 원작 내부 코드의 확정 사실이 아닙니다.

## 시스템 책임 및 처리 흐름

**목적:** 골드·상점·큐브·제작의 사용자 경험과 런타임 규칙을 구현 가능한 단위로 정의한다.

### 1. 골드 흐름
전리품 판매/드롭 → 수리·포션·도박·용병 부활·아이템 구매에 소비. 캐릭터 소지금과 보관함 금액의 한도/손실 정책 구분.

### 2. 상점
NPC별 판매 품목·수리·치료·도박·아이템 식별 서비스를 정의. 액트/난이도/캐릭터 레벨에 따른 상품 생성 테이블.

### 3. 호라드림 큐브
입력 아이템의 타입·품질·개수·소켓·보석 등 조건을 다중집합으로 검사 → 가장 구체적인 레시피 매칭 → 원자적 소비 → 결과 생성.

### 4. 제작
Crafted는 정해진 베이스·룬·보석·주얼 조합과 고정 속성 및 랜덤 접사를 결합. 결과 ilvl 계산은 레시피별 별도 규칙.

### 5. 거래
플레이어 간 거래는 양측 승인·변경 시 승인 초기화·원자적 교환이 필요. 단독 구현에서는 NPC 경제만 우선 지원.

## 권장 데이터 스키마 (구현 제안)

```json
{
  "system": "11_Economy_Crafting",
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
