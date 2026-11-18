# 월드·맵·던전

> 분석 범위: Diablo II: Lord of Destruction / Resurrected의 공통 핵심 규칙. 패치별 차이는 별도 검증 대상이며, `구현 제안`은 원작 내부 코드의 확정 사실이 아닙니다.

## 시스템 책임 및 처리 흐름

**목적:** 액트·지역·절차적 던전의 사용자 경험과 런타임 규칙을 구현 가능한 단위로 정의한다.

### 1. 월드 그래프
Act → Town/Outdoor/Dungeon → Level → Room → Tile. 고정 연결 관계와 매 세션 변하는 방/타일 배치를 구분.

### 2. 생성 절차
seed → 지역 템플릿 선택 → 출입구/목표 지점 제약 → 방 그래프 생성 → 방 타일 배치 → 연결 통로 → 충돌/내비게이션 → 몬스터·상자·오브젝트 배치.

### 3. 연결 보장
시작점에서 필수 퀘스트 위치와 다음 층 입구까지 연결성 검사(BFS/DFS). 막힌 지도는 생성 재시도 또는 보정.

### 4. 지역 레벨
난이도와 지역별 area level은 몬스터 레벨 및 드롭 후보에 영향. 고정 지형·특수 지역과 무작위 던전의 생성 규칙을 구분.

### 5. 웨이포인트
발견 여부는 캐릭터에 영속 저장. 활성화 후 허브/필드 이동 시 퀘스트·난이도 잠금 검사.

### 6. 성능
방 단위 공간 인덱스와 가시영역 활성화, 오프스크린 AI 저빈도 갱신, 타일 충돌 배치, 절차 생성 시드 재현.

## 권장 데이터 스키마 (구현 제안)

```json
{
  "system": "08_World_Maps",
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
