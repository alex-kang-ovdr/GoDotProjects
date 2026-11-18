# 39. 공격 컴포넌트 계약 (v5)

## 설계 목표
타워 정의와 공격 행위를 분리한다. 타워는 0개 이상의 `AttackDefinition`을 소유하며 업그레이드는 정의의 필드 또는 컴포넌트 목록을 수정한다. 원작의 비공개 내부 구조가 아닌 **재현 구현 제안**이다.

## 공통 필드
| 필드 | 타입 | 의미 | 검증 |
|---|---|---|---|
| attackId | string | 타워 내 유일한 공격 ID | 중복 금지 |
| kind | enum | projectile / beam / radial / deployable / aura / income | 필수 |
| cooldownTicks | integer | 고정 틱 단위 재사용 대기 | 1 이상 |
| range | number | 게임 월드 단위 | 0 이상 |
| targetMode | enum | first/last/close/strong/manual | kind별 제약 |
| damage | integer | 타격당 계층/내구 피해 | 0 이상 |
| pierce | integer | 충돌 가능한 유효 대상 수 | 1 이상 |
| damageTags | string[] | sharp/explosive/fire/energy 등 | 상호작용 테이블 참조 |
| canSeeCamo | bool | 탐지 여부 | 기본 false |
| collisionMask | string[] | 지상/공중/대형 등 | 정의된 타입만 |

## 공격 종류별 확장
- projectile: speed, radius, lifetimeTicks, homingTurnRate, hitOncePerTarget, childProjectileOnHit
- beam: rayLength, width, tickInterval, hitRegistryScope
- radial: radius, explosionDelayTicks, falloffMode, triggerMode
- deployable: placementRule, charges, lifetimeTicks, maxActive, consumeOnHit
- aura: radius, refreshTicks, modifierIds, stackingGroup
- income: productionIntervalTicks, cashAmount, collectionMode

## 실행 순서
1. 공격 쿨다운과 타겟 유효성 검사
2. 발사 명령 생성, 공격 스냅샷 기록
3. 발사체 이동 및 swept collision 수행
4. 접촉 순서를 거리·대상 고유 ID로 안정 정렬
5. 면역, 중복 히트, pierce 차감 여부 검사
6. 피해/상태이상 이벤트 발행, 파생 공격 예약
7. 사망·분할·수익 이벤트를 정해진 순서로 적용

## 중요 예외
- `pierce`는 대상당 피해와 별개다. 면역 대상이 관통을 소비하는지는 공격 정의별 정책으로 설정한다.
- 빔과 영역 공격은 `hitRegistryScope`를 사용해 동일 틱 다중 충돌을 방지한다.
- 업그레이드로 공격이 교체되는 경우 `replaceAttackId`를 사용한다. 단순 수치 합산으로 처리하지 않는다.
- 공격 스냅샷과 실시간 버프 평가 중 어느 쪽인지 `modifierEvaluation`으로 명시한다.

## 수용 기준
동일 시드·동일 입력의 10회 실행 결과가 동일해야 한다. 1틱 안에서 다중 타겟·면역·분할이 겹치는 테스트를 필수화한다.
