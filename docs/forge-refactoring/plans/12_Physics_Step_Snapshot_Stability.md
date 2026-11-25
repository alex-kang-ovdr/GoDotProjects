# 12. 물리 수동 스텝·상태 복구·조인트 안정성 개발 계획

## 1. 계획 요약

| 항목 | 계획 |
|---|---|
| 계획 ID / 기준일 | IMP-12 / 2026-11-24 |
| 원문 대응 | PDF 3쪽 물리 안정성·조인트·의류, 5·7-8쪽 space_step·롤백 |
| 우선순위 | P1 기반 안정성 / P2 제한된 재시뮬레이션 / 고급 cloth R&D |
| 구현 위치 | PhysicsServer 확장 경계, backend adapter, 필요 시 최소 코어 패치 |
| 선행 과제 | 13 계측, 16 빌드 고정. 네트워크 적용은 25-28과 공동 설계 |
| 담당 | 물리 엔지니어 2명, 런타임·네트워크 QA 부분 투입 |
| 예상 공수 | 32-56 PW. 최초 backend 한 종류의 제한된 snapshot 제품화 기준 |
| 구현 상태 | 설계안. 수동 스텝·snapshot·결정론을 실제 검증하지 않음 |

## 2. 목표와 범위

물리 월드의 실행 주체와 시간 진행을 명확하게 만들고, 지정한 상태 범위에서 복구·재시뮬레이션할 수 있는 기반을 제공한다. 네트워크에서는 Unreal식 authoritative correction을 기본으로 삼고, 검증된 backend/객체에만 재시뮬레이션을 추가한다. Iris식 상태 복제 자체는 [26](26_Iris_Style_Replication.md), 예측과 보정 정책은 [27](27_Movement_Prediction_Network_Physics.md)의 책임이다.

포함 범위는 수동 스텝 계약, 자동 스텝 중복 방지, 상태 캡처·복구, 게임 측 변경 저널, 접촉 이벤트 재생 제어, 조인트 회귀 장면, 로프·고정 제약 어댑터다. 의류는 렌더용 soft body·cloth의 성능/안정성 실험까지 포함하며 범용 cloth 솔버 신규 개발은 별도 과제다.

## 3. 확인한 사실과 핵심 보정

- PhysicsServer3D는 space/body/shape/joint 등 저수준 객체를 제공한다. 이 문서의 `manual_step`·`capture_snapshot`은 새 제안이며 기존 API로 간주하지 않는다. 착수 시 고정 버전 API와 소스를 확인해 최소 확장 지점을 정한다. [공식 PhysicsServer3D](https://docs.godotengine.org/en/stable/classes/class_physicsserver3d.html)
- Godot 공식 문서는 Jolt와 Godot Physics 사이의 조인트 속성·충돌 margin 등 동작 차이를 설명한다. 공통 인터페이스가 같은 수치 결과를 보장하지 않는다. [Using Jolt Physics](https://docs.godotengine.org/en/stable/tutorials/physics/using_jolt_physics.html)
- Jolt 자체에는 상태 저장/복구 기능이 있으나 게임이 변경한 속성·객체 생성과 삭제는 별도로 복원해야 하며 결정론에도 설정·호출 순서 조건이 있다. 이를 Godot 노출 완료나 모든 기기 간 동일성의 근거로 사용하지 않는다. [Jolt 공식 아키텍처](https://jrouwe.github.io/JoltPhysics/)

수동 스텝 API만 추가해서 물리 롤백이 완성되지는 않는다. 아래 설계·수치·공수는 자체 제안이며 cross-backend 결정론은 목표에서 제외한다.

## 4. backend 지원 등급

| 등급 | 요구 능력 | 허용되는 제품 기능 |
|---|---|---|
| C0 | 고정 틱·조회·상태 적용 | 서버 시뮬레이션 + 클라이언트 보간/보정 |
| C1 | 독립 월드 수동 스텝·이벤트 통제 | 테스트 월드와 제한된 예측 실험 |
| C2 | 검증된 상태 저장/복구·변경 저널 | 지원 객체 집합의 제한된 재시뮬레이션 |
| C3 | 지정 CPU/빌드 조합에서 재현 시험 통과 | 해당 조합에서만 결정적 재실행 기능 선언 |

Jolt/GodotPhysics/Box2D/Havok는 모두 이 표에 개별 결과를 기입한다. 이름만으로 C2/C3를 부여하지 않는다. 외부 middleware는 사용 권한·타깃 바이너리·배포 계약을 확보한 경우에만 adapter를 활성화한다. 2D와 3D 스냅샷 형식도 분리한다.

## 5. 시간·수명·snapshot 설계

`PhysicsWorldController`가 월드별 자동 또는 수동 모드의 유일한 owner다. 모드 전환은 tick boundary에서 수행한다. 수동 모드 월드를 엔진의 일반 tick 루프가 다시 진행하지 못하도록 guard를 둔다. scene callback과 physics 결과 적용 시점도 계약에 포함한다.

```text
PhysicsWorldKey = {project_id, build_id, session_id, world_id}
PhysicsSnapshot = {
  tick, backend_id, backend_revision, settings_hash, snapshot_version,
  static_content_hash, body_id_map, backend_blob, game_state_blob,
  command_journal_cursor, confirmed_event_cursor
}
PhysicsWorldController.manual_step(world, fixed_dt, input_batch) -> StepResult
PhysicsWorldController.capture_snapshot(world) -> SnapshotHandle
PhysicsWorldController.restore_snapshot(world, snapshot) -> RestoreResult
```

위 인터페이스는 신규 설계다. snapshot에는 transform·속도뿐 아니라 sleep 상태, 제약·contact warm-start 관련 backend 내부 상태, RNG, collision filtering, kinematic target 및 게임 측 상태의 복구 범위를 명시한다. 포함할 수 없는 상태는 unsupported로 표시한다.

body/shape/joint 생성·삭제, mass·friction 변경은 stable ID와 tick을 갖는 저널에 기록한다. 복구 시 snapshot 당시 객체 집합을 먼저 맞춘 뒤 backend 상태를 적용한다. 리소스와 collision content의 hash가 다르면 복구를 거절한다.

## 6. 재실행과 부작용 처리

접촉 이벤트는 `(tick, pair_id, event_type, sequence)`로 식별한다. 재시뮬레이션 중 damage·보상·오디오·파티클을 그대로 다시 실행하지 않는다. simulation event와 presentation event를 분리하고 확정 구간에서만 영구 게임 효과를 commit한다. 예측 효과는 취소·중복 제거가 가능해야 한다.

계획 기본값은 30 Hz 서버 프로파일과 최대 250 ms 보관 창으로 시작한다. 이 값은 실제 게임의 RTT·메모리·재실행 비용에 따라 조정한다. 보관 창 밖의 입력, 과도한 재실행 요청, 지원하지 않는 객체 상태는 서버 상태로 보정한다. 전 월드 무제한 rewind는 허용하지 않는다.

Character 이동 예측이 전체 rigid-body 재실행을 기다리지 않도록 kinematic movement 경로를 별도로 개발한다. cloth·ragdoll은 초기에는 서버의 gameplay collider와 클라이언트 시각 시뮬레이션을 분리한다.

## 7. 작업분해와 공수

| 작업 ID | 작업 | PW | 산출물 |
|---|---|---:|---|
| PHY-01 | backend/API·결정론 조건·실패 장면 감사 | 3-5 | capability matrix·ADR |
| PHY-02 | 월드 owner·고정 스텝·callback 순서·중복 방지 | 5-9 | step adapter·코어 패치 큐 |
| PHY-03 | snapshot·stable ID·설정 hash·수명 저널 | 8-14 | save/restore 구현·호환성 검사 |
| PHY-04 | 접촉 이벤트·재실행·네트워크 보정 연결 | 6-10 | replay·dedup·지원 범위 명세 |
| PHY-05 | joint·rope/fixed adapter·cloth 제한 실험 | 5-9 | 장면 corpus·품질/성능 기록 |
| PHY-06 | 크로스플랫폼·장시간·회귀·패키징 | 5-9 | 검증 보고·rollback 가이드 |
| 합계 | 첫 backend 제품화 및 다른 backend gap 평가 | **32-56** | 추가 backend C2 구현은 별도 산정 |

## 8. 도입 게이트

G0에서는 쌓기·깊은 침투·sleep/wake·캐릭터 밀기·raycast filtering·joint chain을 재현한다. G1에서 수동 스텝을 완성하고 동일 tick 두 번 진행을 금지한다. G2에서는 객체 집합이 고정된 작은 월드부터 복원한다. G3에서 생성·삭제·설정 변경과 이벤트 저널을 추가한다.

G4에서 네트워크 보정과 결합한다. 단계가 실패하면 더 낮은 capability로 출시하며 state correction과 interpolation을 유지한다. upstream 제출 여부와 제품용 패치 유지 여부는 별도 결정한다.

## 9. 완료 기준·검증 조건

| 시험 | 조건 | 계획용 통과 기준 |
|---|---|---|
| 시간 진행 | auto/manual 전환·pause·resume 1만 회 | 중복 tick·누락 tick 0건 |
| 동일 환경 복원 | 고정 seed 10만 틱, 임의 시점 1천 회 복원 | 지원 범위 state hash 또는 정의된 수치 오차 통과 |
| 객체 수명 | 매 틱 생성/삭제·material 변경 | 저널 replay 후 객체 집합·속성 일치 |
| 이벤트 | 충돌·보상·오디오를 포함한 replay | 영구 부작용 중복 0건 |
| 안정성 | 1천 rigid bodies·joint grid·ragdoll corpus | NaN·발산·무한 wake 발생 시 실패, 허용 오차는 장면별 고정 |
| 비용 | snapshot on/off 및 1/4/8 tick replay | p95 tick 예산과 메모리 상한 만족, 초과 시 C2 비활성화 |
| 플랫폼 | Windows/Linux x64·Android/iOS ARM64 | 지원 조합별 결과 공개, 다른 backend 결과를 동일시하지 않음 |

각 결과에는 엔진·backend commit, solver iteration, timestep, worker 수, compiler·FP 옵션, collision content hash를 포함한다. 비교 실험은 60초 warmup·10분 샘플·5회 반복을 기본으로 p50/p95/p99를 기록한다.

## 10. 위험·대안·산출물

backend 내부 상태를 안정적으로 복원할 수 없으면 transform만 저장한 것을 완전 snapshot이라 부르지 않는다. 해당 경로는 C0/C1로 제한하고 서버 authoritative correction을 사용한다. cloth 품질이 목표에 못 미치면 전용 승인 addon이나 사전 제작 애니메이션으로 대체한다.

산출물은 capability 명세, 수동 스텝 adapter, snapshot format, 변경·이벤트 저널, 안정성 장면 corpus, 실행 재현 스크립트, 실패 시 자동 fallback 및 최소 코어 패치 목록이다.

## 11. 출처

2026-11-24 열람: [PhysicsServer3D](https://docs.godotengine.org/en/stable/classes/class_physicsserver3d.html), [Using Jolt Physics](https://docs.godotengine.org/en/stable/tutorials/physics/using_jolt_physics.html), [Jolt Architecture - Deterministic Simulation / Rolling Back](https://jrouwe.github.io/JoltPhysics/). 공식 문서 조건을 계획에 반영했으며 실제 backend 인증은 수행하지 않았다.
