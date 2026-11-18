# 주문·마법 자원

> 프로젝트: Dungeons & Dragons: Shadow over Mystara (1996)
> 문서 유형: 역기획 및 재구현 명세 초안
> 구분: **관찰된 시스템** / **구현 설계 제안** / **검증 필요**

## 1. 목적과 범위
주문·마법 자원의 기능, 데이터, 상태 전이, 예외와 테스트를 독립 모듈로 명세한다.

## 2. 원작 기반 시스템 분석
Cleric/Elf/Magic-User는 주문 링을 이용한다. MP 연속 소모가 아니라 주문별 사용 횟수를 관리하는 밴스식 시스템이다.

## 3. 게임플레이 규칙 및 데이터 모델
SpellData: school, charges, targetMode, castFrames, invulnerability, effectType, radius, duration, damage, statusEffect.

## 4. 처리 흐름 및 상태 전이
선택 링에서 페이지 전환→주문 선택→사용→횟수 차감. 화면 전체 정지 연출과 다중 플레이어 동기화 정책을 분리한다.

```mermaid
flowchart LR
  A[입력 또는 이벤트] --> B[상태 및 조건 검사]
  B --> C{실행 가능?}
  C -->|Yes| D[게임 규칙 처리]
  C -->|No| E[실패 또는 대기]
  D --> F[애니메이션·UI·사운드 이벤트]
  F --> G[상태 저장 및 다음 틱]
```

## 5. 주요 예외 처리
- 피격·사망·장면 전환 중 요청이 발생하면 상태별 우선순위를 적용한다.
- 동일 프레임 중복 이벤트는 이벤트 ID와 대상 ID로 제거한다.
- 인벤토리·자원·체력은 항상 유효 범위로 제한한다.
- 멀티플레이 시 동일 시뮬레이션 틱에서 결정론적으로 처리할 수 있도록 이벤트 순서를 고정한다.

## 6. 테스트 케이스
| ID | 상황 | 기대 결과 |
|---|---|---|
| T01 | 정상 조건에서 기능 요청 | 지정된 상태로 전이 및 효과 발생 |
| T02 | 금지 상태에서 요청 | 실행 차단, 자원 변화 없음 |
| T03 | 동일 틱 중복 요청 | 중복 효과 방지 |
| T04 | 피격과 기능 실행 동시 발생 | 우선순위 표에 따른 일관된 처리 |
| T05 | 4인 협동 중 동시 이벤트 | 플레이어별 상태/자원 독립 유지 |

## 7. 원작 검증이 필요한 항목
- 프레임 수, 피해량, 판정 크기, 예외 입력, 적·보스별 특수 조건을 실기 영상으로 확인한다.
- 이 문서의 엔진 구조·변수·테스트 정책은 **원작 내부 소스의 확인 결과가 아닌 재구현 제안**이다.

## 참고 자료
- 사용자 제공: https://namu.wiki/w/던전%20앤%20드래곤%20섀도%20오버%20미스타라 (자동 열람 제한으로 직접 본문 검증하지 못함)
- https://gamefaqs.gamespot.com/arcade/563201-dungeons-and-dragons-shadow-over-mystara/faqs/11489
- https://gamefaqs.gamespot.com/arcade/563201-dungeons-and-dragons-shadow-over-mystara/faqs/1255
- https://steamcommunity.com/sharedfiles/filedetails/?id=154984901
- https://www.mobygames.com/game/63847/dungeons-dragons-shadow-over-mystara/



## 상세 확장 명세 (v2)

### 세부 동작 규칙

1. 주문은 클래스별 사용 가능 목록, 레벨, 남은 사용 횟수, 타깃 유형을 갖는다. 원작의 주문 횟수 체계는 일반적인 MP 바와 구분한다.

2. 주문 링을 열면 현재 선택 가능한 주문을 순환 선택하고 확정 입력으로 시전한다. 조작 중 게임 시간 처리 방식은 실기 검증 대상이다.

3. 시전은 준비→발동→효과→후딜레이로 분리하고, 주문별 범위 공격·투사체·버프·회복·화면 효과를 처리한다.

4. 사용 횟수 소모 시점, 시전 중 피격 취소, 보스 면역, 지속 효과 중첩을 개별 규칙으로 정의한다.

### 데이터 필드 및 구현 검증

| 필드 | 의미 | 검증 기준 |
|---|---|---|
| `SpellId` | SpellId 설정값/식별자 | 타입·범위·상태 전이 및 데이터 참조 검사 |
| `SpellLevel` | SpellLevel 설정값/식별자 | 타입·범위·상태 전이 및 데이터 참조 검사 |
| `Charges` | Charges 설정값/식별자 | 타입·범위·상태 전이 및 데이터 참조 검사 |
| `CastTicks` | CastTicks 설정값/식별자 | 타입·범위·상태 전이 및 데이터 참조 검사 |
| `TargetMode` | TargetMode 설정값/식별자 | 타입·범위·상태 전이 및 데이터 참조 검사 |
| `EffectType` | EffectType 설정값/식별자 | 타입·범위·상태 전이 및 데이터 참조 검사 |
| `InterruptPolicy` | InterruptPolicy 설정값/식별자 | 타입·범위·상태 전이 및 데이터 참조 검사 |

### 상태 및 이벤트 처리 예시

```text
for each fixedTick:
  sampleBufferedCommands()
  validateActorStateAndResources()
  advanceAnimationAndStateTicks()
  resolveMovementAndLaneCollision()
  resolveHitAndEffectEventsInStableOrder()
  commitInventoryHealthAndProgress()
  publishPresentationEvents()
```

### 예외 및 테스트 시나리오

| 시나리오 | 기대 동작 |
|---|---|
| 같은 틱에 피격과 행동 요청 | 우선순위 규칙에 따라 단일 상태 전이 |
| 자원 부족 상태에서 사용 | 효과 발생 및 자원 소모 없음 |
| 화면 전환 직전 공격 판정 | 전환 정책에 따라 이벤트 취소 또는 완료 |
| 협동 중 중복 타격 | 공격 인스턴스·대상 조합으로 중복 제어 |
| 프레임레이트 변화 | 고정 틱 기반 결과 동일 |

> **주의:** 위의 필드와 처리 순서는 재구현용 설계 제안입니다. 원작 내부 구현이나 정확한 수치로 단정하지 않습니다.
