# 엔진 패치 기록: JoltPhysics (Jolt 성능 패치 + 로드맵 항목 12)

- 관리 브랜치: godot-engine 포크 저장소(`D:/Github/godot-engine`)의 `Forge-Refactoring-JoltPhysics` (로컬 생성, 기준 `e7a83dd7` = 현재 pin). PlayHub 저장소에는 엔진 브랜치를 두지 않는다.
- 결정: 2026-11-25 사용자 결정 D4 — Jolt 변경·성능 개선과 로드맵 12(물리 수동 스텝·상태 복구·조인트 안정성)를 이 브랜치로 통합 ([SSOT.md](../SSOT.md) §5)
- 포크 이력이 직선이므로 이 브랜치는 아바타 패치 3건(`Forge-Refactoring-ForgeAvatar`) 위에 쌓여 있다.
- 출처: 실험 브랜치 Forge-HavokPhysics의 Havok 대비 Jolt 벤치마크 결과 (`docs/havok/HAVOK_VS_JOLT_BENCHMARK.md`, origin 원격에만 있음)

## 패치 목록

| 커밋 | 날짜 | 내용 | 주요 파일 |
| --- | --- | --- | --- |
| `83f5f345` | 2026-11-23 | 락프리 JobSystem, 병렬 pre_step, PlayForgePhysicsBatch 무박싱 동기화, 무분기 AABB 컬링 | `modules/jolt_physics/spaces/jolt_job_system.cpp`, `jolt_space_3d.cpp`, `modules/playforge_core/playforge_physics_batch.*`, `servers/physics_3d/physics_server_3d*`, `core/math/aabb.h` |
| `70892ae8` | 2026-11-23 | x86_64 데스크톱 AVX2/FMA/SSE4.2 SIMD 빌드 | `modules/jolt_physics/SCsub` |
| `c9050da1` | 2026-11-23 | JoltContactListener3D OnContactRemoved 락프리, Added/Persisted fast path | `modules/jolt_physics/spaces/jolt_contact_listener_3d.*` |
| `e7a83dd7` | 2026-11-23 | 경량 GSK 하이브리드 워밍업 캐시, 협역 A/B 계측 API | `thirdparty/jolt_physics/**` (GJKClosestPoint, ConvexShape, ContactConstraintManager, PhysicsSystem, PlayForgeGskExperiment.h), `jolt_physics_server_3d.*` |

## 확인 필요 사항

- **결정성 범위**: 벤치마크는 같은 기기 반복 실행에서 1cm 양자화 상태 hash 일치만 확인했다. SIMD 설정이 데스크톱 x86_64 한정이라 모바일·서버(Linux)와 결과가 갈릴 수 있다. 항목 27(네트워크 물리)은 기기 간 결정성을 가정하지 않는다.
- **third-party 수정**: `thirdparty/jolt_physics/**` 수정도 포크 커밋으로 유지되므로 평소에는 재적용하지 않는다. upstream이 Jolt 버전을 올리면(upstream master는 이미 Jolt 5.6.0) 그 merge에서 한 번 맞춘다. 시험 병합 충돌은 `PhysicsSystem.cpp`, `jolt_contact_listener_3d.*`, `physics_server_3d.cpp`, `core/math/aabb.h`.
- **코어 수정**: `core/math/aabb.h`, `servers/physics_3d/physics_server_3d*` 변경은 E3(코어)에 해당한다. 예외 사유를 아래 양식으로 채운다.
- **회귀 fixture**: HavokProfile 벤치마크(Forge-HavokPhysics)가 유일한 측정 경로다. 트렁크에 재실행 가능한 fixture가 없다(미확인). 항목 13 TraceSample 형식으로 측정을 다시 묶는다(Forge-Profiling에 HavokProfile 어댑터 있음).

## 로드맵 §13 양식 (패치별로 채울 것)

| 커밋 | 대체 불가 API | 회귀 fixture | upstream 상태 | 제거 조건 |
| --- | --- | --- | --- | --- |
| `83f5f345` | 미작성 | 미작성 | 미제안 | 미작성 |
| `70892ae8` | 빌드 설정(API 아님) | 미작성 | 미제안 | 미작성 |
| `c9050da1` | 미작성 | 미작성 | 미제안 | 미작성 |
| `e7a83dd7` | 미작성 | 미작성 | 미제안 | 실험 종료 시 A/B 계측 API 제거 |

## 항목 12의 첫 작업

Jolt·GodotPhysics 각각의 수동 step·snapshot 가능 범위를 capability 표로 만든다. 그 전에 위 4건의 회귀 fixture를 먼저 만든다. 패치가 들어간 상태가 기준선이 되기 때문이다.
