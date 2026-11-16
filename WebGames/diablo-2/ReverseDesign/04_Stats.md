# 능력치 및 파생 스탯

> 분석 범위: Diablo II: Lord of Destruction / Resurrected의 공통 핵심 규칙. 패치별 차이는 별도 검증 대상이며, `구현 제안`은 원작 내부 코드의 확정 사실이 아닙니다.

## 시스템 책임 및 처리 흐름

**목적:** 능력치·파생 능력치·수정자의 사용자 경험과 런타임 규칙을 구현 가능한 단위로 정의한다.

### 1. 기본 능력치
Strength, Dexterity, Vitality, Energy 및 Level. 직업별 초기값과 레벨당 성장치, 스탯 포인트 투자에 따른 파생값을 테이블화.

### 2. 파생값
Life/Mana/Stamina, Attack Rating, Defense, Block Chance, Damage, Resistances, Faster Cast/Hit Recovery/Block, Movement Speed.

### 3. 수정자 계층
기본값 → 레벨/배분 → 장비 평면 보너스 → 스킬/오라 → 비율 수정자 → 상한/하한 적용. 원작과 동일 수치를 재현하려면 능력치별 순서를 따로 정의.

### 4. 저항 한도
기본 저항 상한은 통상 75%; 최대 저항 증가 옵션 및 난이도 페널티를 별도 처리. 표시값과 내부 누적 저항값을 구분.

### 5. 스냅샷과 동적 갱신
장비 교체·오라 진입/이탈·저주 부여·레벨업 시 의존성 그래프에 따라 파생값 재계산. HP 최대치 변경 시 현재 HP 정책 명시.

## 권장 데이터 스키마 (구현 제안)

```json
{
  "system": "04_Stats",
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
