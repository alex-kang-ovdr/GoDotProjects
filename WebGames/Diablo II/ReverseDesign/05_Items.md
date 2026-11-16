# 아이템·장비·옵션

> 분석 범위: Diablo II: Lord of Destruction / Resurrected의 공통 핵심 규칙. 패치별 차이는 별도 검증 대상이며, `구현 제안`은 원작 내부 코드의 확정 사실이 아닙니다.

## 시스템 책임 및 처리 흐름

**목적:** 아이템 생성·옵션·장비의 사용자 경험과 런타임 규칙을 구현 가능한 단위로 정의한다.

### 1. 품질 분류
Low Quality, Normal, Superior, Magic, Rare, Set, Unique, Crafted 등 품질별 생성 제약. Ethereal, socketed는 별도 속성.

### 2. 아이템 생성 순서
baseItem 선택 → itemLevel 결정 → 품질 결정 → 품질별 후보/옵션 추출 → 수치 롤 → 소켓·내구도·요구치 → 최종 식별 상태 및 드롭 인스턴스 생성.

### 3. 접두/접미
affixLevel, group, spawnable, frequency, allowedItemTypes, min/max roll, requiredLevel. 상호 배타 그룹과 희귀 아이템의 옵션 개수 제한을 별도 검증.

### 4. 장비 슬롯
머리/몸통/무기1·2/방패/장갑/벨트/신발/반지2/목걸이. 양손무기·직업 전용 장비·무기 교체 세트를 지원.

### 5. 룬워드
정확한 소켓 수, 허용 장비 베이스, 순서가 일치해야 활성화. 마법/레어 등 허용되지 않는 품질과 잘못된 순서를 구분해 실패 처리.

### 6. 아이템 불변성
템플릿 ID와 인스턴스 ID 분리. 옵션 롤·내구도·소켓 내용은 인스턴스에 저장하고 패치 버전 변경 시 마이그레이션 규칙을 정의.

## 권장 데이터 스키마 (구현 제안)

```json
{
  "system": "05_Items",
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
