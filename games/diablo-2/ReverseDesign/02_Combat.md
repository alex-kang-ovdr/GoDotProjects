# 전투 및 판정

> 분석 범위: Diablo II: Lord of Destruction / Resurrected의 공통 핵심 규칙. 패치별 차이는 별도 검증 대상이며, `구현 제안`은 원작 내부 코드의 확정 사실이 아닙니다.

## 시스템 책임 및 처리 흐름

**목적:** 전투 판정 파이프라인의 사용자 경험과 런타임 규칙을 구현 가능한 단위로 정의한다.

### 1. 공격 명령
입력 → 이동 가능 여부/거리/시야 → 공격 동작 시작 → 애니메이션 타격 프레임 → 목표 유효성 → 명중·방어/막기 → 피해 → 경직/사망.

### 2. 물리 명중
근접·원거리 무기 공격의 대표적 명중식: 100×AR/(AR+Defense)×2×AttackerLevel/(AttackerLevel+DefenderLevel), 통상 5~95%로 제한. 일부 스킬·대상은 예외.

### 3. 피해 구성
무기 기본 피해와 무기 내 증뎀(on-weapon ED)을 먼저 반영하고, 능력치/스킬/오라 등의 외부 증뎀(off-weapon ED)을 별도 반영. 이후 대상 물리 저항·피해 감소와 부가 원소 피해를 유형별 계산.

### 4. 원소 및 상태
화염/냉기/번개/독/마법을 구분. 저항·면역·관통·흡수·지속시간을 별도 단계로 처리. 냉기 둔화·독 지속피해는 갱신/중첩 규칙을 명시.

### 5. 프레임 이벤트
공격속도 IAS, 시전속도 FCR, 피격회복 FHR, 막기속도 FBR는 캐릭터/무기/폼에 따른 breakpoint 테이블 기반. UI 표시값이 실제 프레임 수와 1:1 선형 대응하지 않는다.

### 6. 동시성 및 예외
동일 틱에 사망과 투사체 충돌이 함께 발생할 때 이벤트 순서를 고정. 사망 후 신규 공격 시작 금지, 이미 발사된 투사체의 잔존 여부는 개별 스킬 규칙으로 결정.

## 권장 데이터 스키마 (구현 제안)

```json
{
  "system": "02_Combat",
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
