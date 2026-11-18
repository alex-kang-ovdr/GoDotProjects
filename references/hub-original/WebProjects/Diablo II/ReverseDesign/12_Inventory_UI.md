# 인벤토리·창고·UI

> 분석 범위: Diablo II: Lord of Destruction / Resurrected의 공통 핵심 규칙. 패치별 차이는 별도 검증 대상이며, `구현 제안`은 원작 내부 코드의 확정 사실이 아닙니다.

## 시스템 책임 및 처리 흐름

**목적:** 인벤토리·장비·UI의 사용자 경험과 런타임 규칙을 구현 가능한 단위로 정의한다.

### 1. 격자 인벤토리
아이템 크기 w×h와 위치(x,y), 회전 불가 직사각 배치. 점유 비트맵으로 충돌을 검사하고 드래그 시 임시 프리뷰를 표시.

### 2. 장비 장착
슬롯 호환 → 직업/레벨/능력치 요구 검사 → 양손/보조무기 충돌 해결 → 장비 이동 → 능력치 재계산 → UI 업데이트.

### 3. 벨트·포션
벨트 행/열과 종류별 포션을 빠른 슬롯에 배치. 소모 즉시 아이템 수량 감소 및 체력·마나 회복 이벤트 발생.

### 4. 상호작용
좌/우 클릭, Shift 이동, Ctrl 구매/판매 등은 버전·플랫폼에 따라 입력 매핑 분리. 마우스 hover tooltip과 비교창 제공.

### 5. 실패 원자성
이동·장착·거래 도중 공간 부족이나 조건 실패 시 원본 아이템이 소실되지 않도록 트랜잭션 처리.

## 권장 데이터 스키마 (구현 제안)

```json
{
  "system": "12_Inventory_UI",
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
