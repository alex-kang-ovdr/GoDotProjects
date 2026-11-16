# 전투·콤보·피격

> 프로젝트: Dungeons & Dragons: Shadow over Mystara (1996)
> 문서 유형: 역기획 및 재구현 명세 초안
> 구분: **관찰된 시스템** / **구현 설계 제안** / **검증 필요**

## 1. 목적과 범위
전투·콤보·피격의 기능, 데이터, 상태 전이, 예외와 테스트를 독립 모듈로 명세한다.

## 2. 원작 기반 시스템 분석
연속 공격, 점프 공격, 대시 공격, 상승 공격, 메가크래시, 다운 공격, 무기별 공격 모션이 핵심.

## 3. 게임플레이 규칙 및 데이터 모델
AttackData: startup/active/recovery, damage, reachX, laneTolerance, hitStop, knockback, launch, cancelWindow, resourceCost.

## 4. 처리 흐름 및 상태 전이
상태: Idle→Startup→Active→Recovery→Idle; HitStun/Knockdown/Guard/Invincible로 인터럽트. 한 공격 인스턴스의 동일 대상 중복 타격 제한.

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

1. 기본 공격 연계는 공격 상태의 캔슬 구간에 다음 공격 입력이 도착해야 성립한다. 공격 시작·활성·후딜레이를 구분한다.

2. 전투 판정은 공격자 위치와 방향을 기준으로 X 거리, Z 레인 차이, 공중 높이를 검사한다. 가드는 정면 판정 및 상태 조건을 함께 평가한다.

3. 피격은 경직, 넉백, 띄우기, 다운, 무적 시간으로 구분한다. 잡기·메가크래시·다운 공격은 별도 판정 타입으로 모델링한다.

4. 연속 공격과 피격 중 상태 전이는 프레임 이벤트 기반으로 처리하며, 동일 공격의 다단히트 여부를 데이터로 제어한다.

### 데이터 필드 및 구현 검증

| 필드 | 의미 | 검증 기준 |
|---|---|---|
| `Startup` | Startup 설정값/식별자 | 타입·범위·상태 전이 및 데이터 참조 검사 |
| `Active` | Active 설정값/식별자 | 타입·범위·상태 전이 및 데이터 참조 검사 |
| `Recovery` | Recovery 설정값/식별자 | 타입·범위·상태 전이 및 데이터 참조 검사 |
| `CancelStart` | CancelStart 설정값/식별자 | 타입·범위·상태 전이 및 데이터 참조 검사 |
| `CancelEnd` | CancelEnd 설정값/식별자 | 타입·범위·상태 전이 및 데이터 참조 검사 |
| `Damage` | Damage 설정값/식별자 | 타입·범위·상태 전이 및 데이터 참조 검사 |
| `Hitstun` | Hitstun 설정값/식별자 | 타입·범위·상태 전이 및 데이터 참조 검사 |
| `Knockback` | Knockback 설정값/식별자 | 타입·범위·상태 전이 및 데이터 참조 검사 |
| `Hitstop` | Hitstop 설정값/식별자 | 타입·범위·상태 전이 및 데이터 참조 검사 |

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
