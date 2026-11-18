# 멀티플레이·거래·동기화

> 분석 범위: Diablo II: Lord of Destruction / Resurrected의 공통 핵심 규칙. 패치별 차이는 별도 검증 대상이며, `구현 제안`은 원작 내부 코드의 확정 사실이 아닙니다.

## 시스템 책임 및 처리 흐름

**목적:** 파티·동기화·PvP의 사용자 경험과 런타임 규칙을 구현 가능한 단위로 정의한다.

### 1. 권위 구조
원작 온라인은 서버 권위 판정. 웹 독립 구현도 authoritative world state를 한 곳에 두고 클라이언트는 입력 제출·예측 표시만 수행하도록 확장 가능.

### 2. 동기화
플레이어 입력·스킬 발동·몬스터 상태·투사체·아이템 드롭·퀘스트 이벤트를 고유 tick과 sequence로 정렬.

### 3. 파티
경험치 분배·퀘스트 참여·파티 UI·동맹/적대 상태와 사망 처리 정책을 분리.

### 4. 전리품
공유 드롭에서는 pickup 경쟁과 소유권 결정의 원자성이 필요. 클라이언트 표시와 실제 획득 승인 결과를 일치시킨다.

### 5. 보안
아이템 생성·피해·이동속도·경험치 획득을 클라이언트가 직접 확정하지 못하도록 검증.

## 권장 데이터 스키마 (구현 제안)

```json
{
  "system": "14_Multiplayer",
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
