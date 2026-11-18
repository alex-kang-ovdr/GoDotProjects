# 전투 수학·타게팅·충돌

> Bloons TD 6 역기획 v2.0 | 공개 동작 분석 + 구현용 모델. 수치 예시는 원작 확정 데이터가 아닙니다.

## 고정 스텝
시뮬레이션은 고정 Δt (권장 1/60초)로 실행하고 렌더링은 보간한다. 타워 공격 쿨다운은 시뮬레이션 시간에 따라 감소.

## 타게팅
First: 출구까지 진행도가 가장 높은 대상; Last: 진행도가 낮은 대상; Close: 타워와 거리 최소; Strong: 정의된 우선순위/내구 기반. 동률 시 안정적 instanceId 사용. 특수 타워는 독립 타게팅.

## 투사체
Projectile {position,velocity,life,pierceRemaining,damage,damageType,hitSet,aoeRadius,homing}. 한 투사체가 동일 풍선을 반복 타격할 수 있는지는 공격 정의별 설정.

## 충돌 순서
Broadphase(공간 해시) → 후보 정렬 → 정확 충돌 → 탐지/면역 확인 → damage 및 pierce 적용 → 상태 효과 → 분할 이벤트. 관통은 명중 가능 대상을 기준으로 차감할지 별도 플래그화한다.

## 피해 처리
EffectiveDamage = max(0,baseDamage + additiveBonus) × multipliers; 방어 속성은 별도 검사. 피해 증폭과 방어 타입은 서로 다른 계층. 다중 공격의 이벤트 순서를 결정론적으로 유지한다.

## 상태 효과
slow, stun, freeze, burn, poison, glue, knockback, vulnerability. stackingGroup, maxStacks, refreshPolicy, immunityTag를 정의한다.

## 성능
공간 해시, 재사용 객체 풀, 경로 거리 스칼라, 렌더 인스턴싱, 이펙트 LOD, 시뮬레이션/표시 분리.
