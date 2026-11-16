# 몬스터·AI·챔피언

> 분석 범위: Diablo II: Lord of Destruction / Resurrected의 공통 핵심 규칙. 패치별 차이는 별도 검증 대상이며, `구현 제안`은 원작 내부 코드의 확정 사실이 아닙니다.

## 시스템 책임 및 처리 흐름

**목적:** 몬스터 행동·속성·엘리트의 사용자 경험과 런타임 규칙을 구현 가능한 단위로 정의한다.

### 1. 상태 머신
Idle → AcquireTarget → Chase → Attack/Windup → Recover → Chase. 피격 시 HitReact/Flee, HP 0이면 Dying → Corpse → Cleanup.

### 2. 지각과 추적
감지 반경, line-of-sight, 마지막 목격 위치, 경로 재탐색 간격, 공격 사거리, 접근 불가 시 타깃 포기 시간.

### 3. 공격 선택
근접/원거리/주문/소환/도주를 몬스터별 가중치와 조건으로 평가. 쿨다운, 거리, 시야, 대상 상태를 점수화.

### 4. 몬스터 등급
일반, 챔피언, 유니크, 슈퍼유니크, 액트 보스. 체력·경험치·드롭·속성 수정자·AI 능력을 분리.

### 5. 특수 속성
Extra Fast, Extra Strong, Cursed, Aura Enchanted, Fire/Cold/Lightning Enchanted 등은 modifier component로 조합. 버전별 불가능 조합을 데이터로 제한.

### 6. 소환체와 시체
소환 유닛은 ownerId와 생존 정책을 보유. 시체는 전리품 생성 후에도 시체 활용 스킬을 위해 일정 기간 남을 수 있다.

## 권장 데이터 스키마 (구현 제안)

```json
{
  "system": "07_Monsters_AI",
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
