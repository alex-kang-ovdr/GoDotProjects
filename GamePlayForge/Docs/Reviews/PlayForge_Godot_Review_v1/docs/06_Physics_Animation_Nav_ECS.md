# 06 · Havok·Box2D·Navigation·Animation·ECS

**검토 기준일:** 2026-11-17 · **상태:** 설계·공식 문서 검토, Godot 런타임 실증 미실시

## 물리 확장점은 존재하지만 통합은 별도 개발

Godot는 커스텀 2D/3D PhysicsServer 확장 인터페이스를 제공한다. 따라서 Havok/Box2D 연결이 원리적으로 막힌 것은 아니다. 그러나 API의 존재만으로 모든 Shape·Constraint·Query·Sleep·Collision Event가 동일하게 동작한다고 보장할 수 없다. [G16](../references/Verified_Sources.md#g16)[G17](../references/Verified_Sources.md#g17)

물리 서버 선택은 초기화 시점으로 제한된다. 플레이 중 Havok↔Jolt를 즉시 바꾸거나 Room마다 다른 전역 물리 서버를 선택하는 요구는 기본 매핑으로 충족하지 않는다. [G18](../references/Verified_Sources.md#g18)

## 두 가지 연결안

| 안 | 장점 | 비용·주의 |
|---|---|---|
| A. PhysicsServer 확장 | Godot Body/Shape 노드와 연결 | 인터페이스 커버리지, 기능 차이, startup 고정 |
| B. 독립 C++ World + Godot 표현 | 기존 PF 미들웨어 계약을 보존하기 쉬움 | Godot Body와 중복 시뮬레이션 금지, Query/이벤트 어댑터 별도 |

A를 먼저 검토하되 Havok 고유 기능이 추상 API에 맞지 않으면 B를 별도 프로필로 시험한다. 둘을 한 객체에 동시에 켜지 않는다. 백엔드 선택과 네트워크 Schema·Cooked 데이터 해시를 Runtime Contract에 묶는다.

## 계약 시험 항목

Body/Shape 생성·파괴, 충돌 mask, Ray/Sweep/Overlap, CCD, 수면/깨움, trigger/event 순서, 질량·관성, joint local frame, 동적 teleport, 넓은 월드 좌표, 부하 시 Batch 등록을 측정한다. 허용되지 않는 기능은 명시 오류로 반환한다.

Godot 내장 Jolt도 Godot Physics와 일부 joint 의미가 다르다고 문서화한다. 이를 Havok 등 대체 엔진의 의미 동일성을 자동 추정하는 근거로 사용하지 않는다. [G19](../references/Verified_Sources.md#g19)

Box2D는 별도 2D 백엔드 요구다. Godot 기본 2D 물리가 있다는 이유만으로 요구 충족 처리하지 않는다. XY 물리 단위와 2D 화면 픽셀 변환을 독립 관리하며 3D 단위·좌표 변환 코드를 그대로 재사용하지 않는다.

## Navigation

P0에서 Godot Navigation을 쓰는 대안과 Havok Navigation 요구는 구분한다. 원본 walkable geometry·agent 설정·test path를 보관해 백엔드별 데이터를 새로 생성한다. 기존 Havok cooked navmesh가 Godot에서 바로 읽힌다고 가정하지 않는다.

Godot Navigation 변경은 동기화 단계 후 유효해진다. Nav 노드를 추가하고 즉시 path query를 호출한 결과를 준비 완료로 취급하지 않는다. AI가 필요한 시작 영역은 Navigation Ready도 별도로 검사한다. [G42](../references/Verified_Sources.md#g42)

Havok 고유 다중 크기 agent·동적 재빌드 의미가 중요하면 공개 Node에 강제 이식하기보다 PF Navigation Provider로 연결하는 쪽을 검토한다. 비용과 SDK 권한을 확인하기 전 지원 완료 표시를 하지 않는다.

## Animation

Godot AnimationPlayer/AnimationTree는 기본 클립·블렌딩·상태 전이 재사용 후보이다. 이것은 Havok Animation을 사용하는 것과 다르다. [G43](../references/Verified_Sources.md#g43)

기존 요구를 유지하면 Havok pose evaluation → PF bone mapping → Godot Skeleton 표현 경로를 추가한다. Godot AnimationTree와 Havok이 같은 bone·Root Motion을 동시에 쓰지 않게 한다. IK와 ragdoll, 서버 gameplay pose, 압축 clip은 별도 계약으로 검증한다. root motion을 Physics에 적용하는 순서와 렌더 보간을 분리한다.

## ECS / SIMD

전체 Godot Node 체계를 Archetype ECS로 바꾸지 않는다. 대량 탄환·군중·가시성 계산은 C++ SoA/Batch로 하고 결과를 Server API/인스턴스 렌더링으로 전달한다. Godot의 저수준 Server API는 SceneTree를 우회하는 선택지를 제공하지만, 그 자체가 완성된 PlayForge Job System은 아니다. [G21](../references/Verified_Sources.md#g21)

Job 입력은 불변 Snapshot 또는 소유한 배열로 제한한다. 실행 중 Node와 공유 Resource를 worker에서 임의 수정하지 않는다. Godot 스레드풀과 Havok·PF Worker가 CPU를 각각 최대치로 점유하지 않도록 프로세스 수준 병렬도 예산을 둔다. [G20](../references/Verified_Sources.md#g20)

## 메모리·성능 판단

PF 모든 컨테이너를 Godot에 재구현하거나 Godot allocator를 Havok allocator로 바꾸는 것은 변경 최소화에서 제외한다. 미들웨어별 할당을 태그하고, 외부 코드에서 측정 가능한 수치를 먼저 수집한다.

1천/1만 객체, query-heavy, sleeping-heavy, constraint-heavy, animation-heavy를 분리 측정한다. Step wall time과 누적 CPU 시간은 구분한다. 성능 목표는 동일 하드웨어·compiler·physics setting으로 비교하며 비트 단위 cross-platform 결정성을 가정하지 않는다.
