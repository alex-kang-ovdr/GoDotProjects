# 구현·테스트 마일스톤

각 마일스톤은 독립 실행 가능한 test suite와 명확한 실패 기준을 가진다. 완료 표기는 실제 명령이 통과한 경우에만 한다.

## M1 — 독립 수치 코어와 테스트 진입점

- 상태: **완료** — 2026-09-15 `python tools\run_tests.py --suite all` 통과.
- 범위: `BallSimulateParams`, `BallSnapshot`, `BallBounce`, `BallSimulationCore`와 중력만 있는 고정 step 적분.
- 충돌 경계: `BallCollisionQueryWorld` 인터페이스만 선언한다. Godot physics world를 읽거나 바꾸지 않는다.
- 테스트: `smoke`, `naming-contract`, `core-unit`.
- 완료 기준: 헤드리스 Godot smoke, 명명 계약, C++ 중력/입력 검증이 모두 통과한다.

## M2 — 1-way 충돌 query 어댑터

- 범위: `GodotBallCollisionQueryWorld`가 `PhysicsDirectSpaceState3D`의 `cast_motion`/`intersect_ray`/`get_rest_info`로 정적 collider를 조회한다.
- 금지: `RigidBody3D`, `CharacterBody3D`, `Area3D`, `PhysicsServer3D` body 생성·이동·힘/충격 적용·collision layer 변경.
- 테스트: fixture query world unit tests, Godot static-wall integration, 고속 sphere sweep 관통 방지.
- 완료 기준: query는 1-way이고, 쿼리 전후 Godot physics body RID/transform/velocity가 변하지 않는다.

## M3 — 충돌 반응·스핀·구름

- 범위: 반발·마찰 임펄스, angular velocity, rolling friction, 다중 바운스, 관통 복구.
- 테스트: 단일 벽, 2평면, 1/5/10cm 벽, 30/60Hz, 스포츠 파라미터와 당구형 반복 바운스.
- 완료 기준: snapshot index/time/position과 관통·iteration 진단이 JSON으로 재현된다.

## M4 — GDExtension과 에디터 도구

- 범위: `BallSimulatorComponent3D` Node3D 바인딩, `BallSimulateParams`/`BallSnapshot`/`BallBounce` 공개 타입, `@tool` EditorPlugin.
- 테스트: extension load smoke, 공개 API naming contract, 에디터/헤드리스 결과 일치.
- 완료 기준: Godot 4.7.2에서 `.gdextension`을 설치·로드하고 demo scene이 동작한다.

## M5 — 서버 권위 동기화

- 범위: revision·input hash 명령, authoritative snapshot, 2인 bounce 이벤트 비교와 full resync.
- 테스트: 정상, 100ms/5%, 250ms/15% 전송 주입. 2인 통과 후 6인 순차 난입과 최대 3인 경합을 추가한다.
- 완료 기준: 시간 오차 외 event order/direction/position/snapshot index/revision mismatch는 모두 실패로 보고된다.

## 수동 RHI 확인

`rhi-manual`은 자동 성공 판정이 아니라 렌더링·디버그 표시를 눈으로 확인하는 진입점이다. M1에서는 독립 bootstrap scene만 보여 주며, M4 이후 실제 `BallSimulatorComponent3D` 표시로 교체한다.
