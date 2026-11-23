# Havok Physics 2025.1.1 ↔ Jolt Physics 성능·히치·메모리 비교 리포트

- **브랜치/워크트리**: `Forge-HavokPhysics` (실험 기능 브랜치 · `experimental: true`, `integrateToTrunk: false`)
- **통합 방식**: **GDExtension (`PhysicsServer3DExtension`)** — Godot 4.7.2 공식 바이너리 소스 수정 없이 `HavokPhysicsServer3D` 동적 라이브러리로 물리 서버 완전 교체
- **측정 환경**:
  - CPU: `Intel(R) Core(TM) Ultra 7 265K` (20 threads)
  - GPU: `NVIDIA GeForce RTX 4070 Ti` (Vulkan Forward+, 1440×900, VSync off)
  - 엔진: `Godot 4.7.2-stable (official)`
  - 비교 대상:
    - **Jolt Physics** (Godot 4.7.2 내장, `max_bodies=65536`, `max_body_pairs=131072`, `max_contact_constraints=131072`)
    - **Havok Physics 2025.1.1 r1** (`forge/Godot/addons/playforge_havok_physics`, 20 워커 스레드, `bodyBufferCapacity=65536`, `motionBufferCapacity=65536`)
- **시나리오**: `Forge-ISM-profile`의 결정론적 복셀 지형(`seed=1337`, `size 24/48/96/144` → `629 / 2,410 / 9,428 / 21,319` 동적 리지드바디) + 60Hz 고정 스텝 300틱 2단계 결정론적 물리 폭파(틱 30 중앙 폭파 + 틱 150 양측 2차 폭파), 크기당 2회 반복.

---

## 1. 핵심 요약

1. **엔진 커스텀 없이 GDExtension 통합 성공**: `PhysicsServer3DExtension` 구현체(`HavokPhysicsServer3D`)로 Godot 4.7.2 공식 바이너리에 Havok 2025.1.1을 20스레드 병렬 파이프라인으로 완전 통합했습니다.
2. **100% 결정론 검증 통과**: 두 엔진 모두 `size 24 ~ 144(21,319 바디)` 전 구간에서 2회 반복 실행 시 틱 60·180·300의 1cm 양자화 위치 해시가 **100% 일치**했습니다.
3. **고부하(9,428 ~ 21,319 바디)에서 Havok의 뚜렷한 우위**:
   - **물리 틱 p50**: `size=96`에서 **1.34× 빠름**(13.90 → 10.40 ms), `size=144`에서 **1.27× 빠름**(30.07 → 23.62 ms). Havok 순수 C++ 스텝(충돌+솔버)은 21,319 바디 기준 **5.16 ms**(Collide 2.44 ms + Solve 2.29 ms)에 불과합니다.
   - **프레임 히치 (`size=144`)**: Jolt는 30ms 물리 틱으로 인해 60Hz catch-up 스파이럴에 빠져 `frame_p50 = 82.76 ms`(~12 FPS), 50ms 초과 심각 히치 **67.5회**가 발생한 반면, Havok은 `frame_p50 = 1.04 ms`, `frame_p95 = 16.16 ms`, 50ms 초과 히치 **6.0회(11.3× 감소)**로 유지했습니다.
   - **메모리 프로파일**: 동일 65,536 바디 상한 조건에서 Havok은 프로세스 Private Bytes 피크가 전 구간 **58 ~ 126 MB 더 낮았으며**(size 144 기준 1,162 MB vs Jolt 1,220 MB), 씬 해제 후 누수 없이 복구(`+0.64 MB` on warm repeat)되었습니다.
4. **소규모(629 ~ 2,410 바디)**: 두 엔진 모두 60Hz 예산 내 여유롭게 동작하며 히치 0회로 대등합니다.

---

## 2. 결정론 검증 결과 (2회 반복 상태 해시 일치)

| 크기 | 블록 수 | 지형 레이아웃 해시 | Jolt `hash_end` (rep0 / rep1) | Havok `hash_end` (rep0 / rep1) | 결정론 |
|---:|---:|---:|---|---|---|
| 24 | 629 | `711236125` | `1247904155` / `1247904155` | `2906108917` / `2906108917` | **양측 100% 일치** |
| 48 | 2,410 | `4078198733` | `3606000523` / `3606000523` | `2544036446` / `2544036446` | **양측 100% 일치** |
| 96 | 9,428 | `3827066910` | `265782276` / `265782276` | `1100377522` / `1100377522` | **양측 100% 일치** |
| 144 | 21,319 | `598475029` | `519827234` / `519827234` | `654704613` / `654704613` | **양측 100% 일치** |

---

## 3. 성능 비교 (2회 반복 평균, 낮을수록 좋음)

| 크기 | 블록 | 월드 빌드 (Jolt / Havok) | 물리 틱 p50 (Jolt / Havok) | Havok 순수 스텝 p50 (Collide + Solve) | 프레임 p50 (Jolt / Havok) | 프레임 p95 (Jolt / Havok) | 프레임 p99 (Jolt / Havok) |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 24 | 629 | 2.40 / 3.74 ms | 1.26 / 1.24 ms | 0.43 ms (0.21 + 0.19) | 0.19 / 0.19 ms | 0.33 / 0.34 ms | 1.00 / 0.87 ms |
| 48 | 2,410 | 5.37 / 3.85 ms | 3.66 / 3.13 ms | 0.93 ms (0.43 + 0.42) | 0.20 / 0.20 ms | 0.34 / 0.43 ms | 2.59 / 2.04 ms |
| 96 | 9,428 | 15.59 / 12.86 ms | 13.90 / 10.40 ms (**1.34×**) | 2.17 ms (1.04 + 0.93) | 0.25 / 0.25 ms | 0.65 / 0.62 ms | 10.26 / 6.24 ms (**1.64×**) |
| 144 | 21,319 | 33.41 / 27.58 ms (**1.21×**) | 30.07 / 23.62 ms (**1.27×**) | **5.16 ms** (2.44 + 2.29) | **82.76 / 1.04 ms** | **116.82 / 16.16 ms** (**7.2×**) | **139.75 / 43.56 ms** (**3.2×**) |

> **참고**: `물리 틱 p50`은 Godot `Performance.TIME_PHYSICS_PROCESS` 기준이며 물리 서버 스텝 + GDScript `MultiMesh` 트랜스폼 동기화(`sync_p50`: size 144 기준 Jolt 8.79 ms / Havok 8.00 ms)가 모두 포함됩니다.

---

## 4. 히치 / 스터터 프로파일 (2회 반복 평균)

| 크기 | 블록 | >16.67ms 프레임 (Jolt / Havok) | >33.33ms 프레임 (Jolt / Havok) | >50.0ms 프레임 (Jolt / Havok) | 프레임 최대 스파이크 (Jolt / Havok) | 폭파 직후 물리 스파이크 (Jolt / Havok) |
|---:|---:|---:|---:|---:|---:|---:|
| 24 | 629 | 0 / 0 | 0 / 0 | 0 / 0 | 3.49 / 3.21 ms | 3.30 / 0.86 ms |
| 48 | 2,410 | 0 / 0 | 0 / 0 | 0 / 0 | 8.79 / 6.08 ms | 10.48 / 4.82 ms |
| 96 | 9,428 | 3.5 / 1.5 | 0.5 / 0 | 0 / 0 | 34.10 / 29.21 ms | 30.06 / 31.30 ms |
| 144 | 21,319 | **81.5 / 45.0** | **79.0 / 10.0** (**7.9×**) | **67.5 / 6.0** (**11.3×**) | **139.75 / 87.72 ms** | 65.75 / 74.08 ms |

- **관찰**: 21,319개 바디가 한 틱에 동시 기상하는 1차 폭파 직후 순간 물리 스파이크는 Havok(74.1 ms)이 Jolt(65.8 ms)보다 약간 높으나, 이후 지속 시뮬레이션에서 Havok이 5.16 ms 순수 스텝으로 빠르게 수렴하면서 전체 프레임 히치(>33ms 7.9×, >50ms 11.3×)를 크게 줄였습니다.

---

## 5. 메모리 프로파일

| 크기 | 블록 | OS Private 피크 (Jolt / Havok) | 빌드 직후 증분 rep1 (Jolt / Havok) | 피크 증분 rep1 (Jolt / Havok) | Godot Static 피크 (Jolt / Havok) |
|---:|---:|---:|---:|---:|---:|
| 24 | 629 | 1,164.0 / 1,038.1 MB | +68.3 / +10.0 MB | +72.0 / +14.6 MB | 124.0 / 88.8 MB |
| 48 | 2,410 | 1,167.9 / 1,057.3 MB | +69.3 / +9.3 MB | +70.9 / +11.0 MB | 126.6 / 89.5 MB |
| 96 | 9,428 | 1,195.2 / 1,098.9 MB | +79.3 / +17.9 MB | +80.2 / +17.9 MB | 136.5 / 91.6 MB |
| 144 | 21,319 | **1,220.0 / 1,162.3 MB** | **+104.5 / +10.2 MB** | **+104.5 / +10.4 MB** | **153.1 / 95.1 MB** |

- Jolt는 `max_bodies=65536` 설정 시 스페이스당 고정 풀을 크게 선할당(약 68~104 MB)하고 해제 시 반납합니다.
- Havok은 `hkDynamicBlockStreamAllocator(16 MiB KEEP_BLOCKS)` + 자체 힙을 사용하며, 워밍업 이후(rep1) 추가 메모리 증분이 10~18 MB 수준으로 안정적이고, `size=144` 종료 후 잔여 증분이 `+0.64 MB`로 누수가 없습니다.

---

## 6. 1단계 최적화 적용 결과 — C++ 배치 동기화 브리지 (`--batch-sync`)

엔진 코어 타입(ABI)을 전혀 변경하지 않고, `playforge_havok_physics` GDExtension에 **`HavokPhysicsStats.sync_multimesh_from_bodies(multimesh_rid, body_rids, custom_data)`** 배치 동기화 API를 추가해 Jolt Physics와 Havok Physics 양쪽 모두에서 패치 전/후 효과를 실측했습니다.

- **Havok 경로**: `m_fast_bodies[rid]` O(1) 플랫 테이블 → `hknpWorld::getBodyTransform()` 직접 읽기 → 재사용 `PackedFloat32Array` 버퍼 연속 기록 → `RenderingServer::multimesh_set_buffer()` (Variant/가상함수/GDScript 루프 0회)
- **Jolt 경로**: C++ 타이트 루프에서 `PhysicsServer3D::body_get_state()` ptrcall 일괄 호출 → 재사용 `PackedFloat32Array` 기록 → `RenderingServer::multimesh_set_buffer()` (GDScript 루프·프로퍼티 조회 제거, 단 GDExtension 경계 `Variant` 박싱은 잔존)
- **결정론 & 시각 동일성 검증**: 패치 전·후 Jolt/Havok 전 구간(24/48/96/144) 상태 해시 **100% 동일**, `size=48` 틱 55 증거 스크린샷(`shot-*-batch-size48-t055.png`) 픽셀 수준 일치 확인.

### 6.1 동기화 시간 (`sync_p50_ms`, 2회 평균)

| 크기 | 블록 | Jolt 패치 전 → 후 | Jolt 개선 | Havok 패치 전 → 후 | Havok 개선 |
|---:|---:|---:|---:|---:|---:|
| 24 | 629 | 0.288 → **0.195 ms** | **1.48×** | 0.242 → **0.046 ms** | **5.3×** |
| 48 | 2,410 | 1.038 → **0.659 ms** | **1.58×** | 0.874 → **0.135 ms** | **6.5×** |
| 96 | 9,428 | 3.931 → **2.438 ms** | **1.61×** | 3.533 → **0.475 ms** | **7.4×** |
| 144 | 21,319 | 8.790 → **4.987 ms** | **1.76×** | 8.002 → **1.038 ms** | **7.7×** |

### 6.2 `size=144` (21,319 동적 바디) 체감 프레임·히치 전/후 비교 (2회 평균)

| 지표 | Jolt 패치 전 | **Jolt + Batch** | Jolt 개선 | Havok 패치 전 | **Havok + Batch** | Havok 개선 |
|---|---:|---:|---:|---:|---:|---:|
| `frame_mean_ms` | 80.56 ms | **20.42 ms** | **3.94× 빠름** | 5.09 ms | **0.63 ms** | **8.1× 빠름** |
| `frame_p50_ms` | 82.76 ms | **8.75 ms** | **9.46× 빠름** | 1.04 ms | **0.36 ms** | **2.9× 빠름** |
| `frame_p95_ms` | 116.82 ms | **89.01 ms** | **-23.8%** | 16.16 ms | **0.74 ms** | **21.8× 빠름** |
| `frame_p99_ms` | 139.75 ms | **116.57 ms** | **-16.6%** | 43.56 ms | **7.47 ms** | **5.8× 빠름** |
| `hitch > 16.67ms` | 81.5회 | 89.0회 | catch-up 완화 | 45.0회 | **6.5회** | **6.9× 감소** |
| `hitch > 33.33ms` | 79.0회 | **60.5회** | **-23.4%** | 10.0회 | **2.0회** | **5.0× 감소** |
| `hitch > 50.0ms` | 67.5회 | **40.5회** | **-40.0%** | 6.0회 | **1.0회** | **6.0× 감소** |

> **Jolt 추가 개선 시사점**: 현재 GDExtension 경계에서는 Jolt도 `body_get_state()` C++ 배치 호출만으로 `frame_mean` **3.94×**, `frame_p50` **9.46×**, 50ms 초과 히치 **40% 감소** 효과를 얻었습니다. 동일한 배치 함수를 커스텀 포크의 `modules/playforge_core/`에 직접 배치해 `PhysicsServer3D` 내부 트랜스폼을 `Variant` 박싱 없이 직접 읽은 결과는 아래 7절에서 확인합니다.

---

## 7. 2단계 최적화 적용 결과 — 커스텀 Godot 포크 코어 패치 (`jolt-custom-batch` / `havok-custom-batch`)

커스텀 Godot 포크(`d:\Github\GoDotProjects\godot-engine`, 브랜치 `Forge-godot-engine`)에 **ABI 불변(Variant·Vector3·Transform3D 메모리 레이아웃 변경 없음)·멀티플랫폼 호환** 코어 패치 4종을 적용하고 `template_release` 바이너리를 빌드해 **Jolt Physics가 커스텀 엔진에서 얼마나 개선되는지**, 그리고 **Havok Physics 2025.1.1과 비교해 어떤 위치에 도달하는지** 동일 결정론 시나리오(`seed=1337`, 300틱, 2회 반복)로 검증했습니다.

### 7.1 적용한 커스텀 엔진 패치 4종

1. **Jolt 네이티브 락프리 `JPH::JobSystemThreadPool` 전환** (`modules/jolt_physics/jolt_physics_server_3d.{h,cpp}`, `spaces/jolt_job_system.cpp`)
   - 데스크톱/모바일(`!defined(WEB_ENABLED)`)에서 Godot `WorkerThreadPool` 래퍼와 전역 `SpinLock`(`timings_lock`) 경합을 우회하고 Jolt 고유의 락프리 work-stealing 큐(`JPH::JobSystemThreadPool`)를 직접 구동합니다. (웹/WASM은 기존 `JoltJobSystem` 유지, 디버그 타이밍 락은 `EngineDebugger::is_profiling("servers")` 활성화 시에만 기록)
2. **`JoltSpace3D::_pre_step` 활성 바디 루프 병렬화** (`modules/jolt_physics/spaces/jolt_space_3d.cpp`)
   - 매 물리 틱 단일 스레드로 순회하던 활성 바디 전처리(`_pre_step`)를 활성 리지드바디 512개 이상일 때 256바디 청크 단위로 `WorkerThreadPool::add_group_task` 병렬 실행합니다.
3. **`PhysicsServer3D::batch_fill_multimesh_buffer` + `PhysicsServer3DWrapMT` 포워딩 + `PlayForgePhysicsBatch` 무박싱 동기화** (`servers/physics_3d/physics_server_3d.{h,cpp}`, `physics_server_3d_wrap_mt.h`, `modules/jolt_physics/jolt_physics_server_3d.cpp`, `modules/playforge_core/playforge_physics_batch.{h,cpp}`)
   - `JoltPhysicsServer3D::batch_fill_multimesh_buffer()`가 `Variant`/`Transform3D` 박싱과 가상함수 디스패치 없이 `JPH::Body::GetWorldTransform()`에서 `MultiMesh` 16-float 스트라이드 버퍼로 직접 기록하며, 2,048바디 이상일 때 512바디 청크로 멀티스레드 병렬 패킹합니다.
   - `PhysicsServer3DWrapMT` 래퍼가 해당 가상함수를 내부 `physics_server_3d`로 직접 포워딩하도록 연결했습니다.
4. **무분기(branchless) `AABB::intersects_convex_shape` / `inside_convex_shape`** (`core/math/aabb.h`)
   - 절두체 평면마다 3축 분기로 `min/max` 꼭짓점을 고르던 루프를 `center·normal + half_extents·|normal|` 무분기 내적으로 치환했습니다.

### 7.2 6종 구성 전 구간 동기화 시간 (`sync_p50_ms`, 2회 평균)

| 크기 | 블록 | Jolt 기본 | Jolt + GDExt Batch | **Jolt + 커스텀 포크 (2단계)** | Havok 기본 | Havok + GDExt Batch | **Havok + 커스텀 포크 (2단계)** |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 24 | 629 | 0.288 ms | 0.195 ms | **0.090 ms (3.2×)** | 0.242 ms | 0.046 ms | **0.046 ms (5.3×)** |
| 48 | 2,410 | 1.038 ms | 0.659 ms | **0.226 ms (4.6×)** | 0.874 ms | 0.135 ms | **0.130 ms (6.7×)** |
| 96 | 9,428 | 3.931 ms | 2.438 ms | **0.577 ms (6.8×)** | 3.533 ms | 0.475 ms | **0.430 ms (8.2×)** |
| 144 | 21,319 | 8.790 ms | 4.987 ms | **1.098 ms (8.0×)** | 8.002 ms | 1.038 ms | **0.943 ms (8.5×)** |

### 7.3 `size=96` (9,428 동적 바디) 6종 구성 종합 비교 (2회 평균)

| 지표 (`size=96`, 9,428 바디) | Jolt 기본 | Jolt + 1단계 | **Jolt + 2단계 커스텀** | Havok 기본 | Havok + 1단계 | **Havok + 2단계 커스텀** |
|---|---:|---:|---:|---:|---:|---:|
| `build_ms` | 15.59 ms | 15.64 ms | **12.14 ms (-22%)** | 12.86 ms | 12.80 ms | **11.08 ms** |
| `sync_p50_ms` | 3.931 ms | 2.438 ms | **0.577 ms (6.8×)** | 3.533 ms | 0.475 ms | **0.430 ms (8.2×)** |
| `phys_p50_ms` | 13.90 ms | 11.79 ms | **10.88 ms (-22%)** | 10.40 ms | 6.24 ms | **8.73 ms** |
| `phys_p95_ms` (폭파 피크) | 30.06 ms | 29.26 ms | **23.41 ms (-22%)** | 31.30 ms | 32.43 ms | **28.38 ms** |
| `frame_p99_ms` | 10.26 ms | 8.52 ms | **5.87 ms (1.75×)** | 6.24 ms | 2.98 ms | **3.55 ms** |
| `frame_max_ms` | 34.10 ms | 26.96 ms | **12.96 ms (2.63×)** | 29.21 ms | 26.45 ms | **11.26 ms (2.59×)** |
| `hitch > 16.67ms` | 3.5회 | 2.5회 | **0회 (히치 완전 제거)** | 1.5회 | 1.5회 | **0회 (히치 완전 제거)** |
| `mem_delta_peak_mb` | 83.36 MB | 82.06 MB | **57.33 MB (-31%)** | 28.21 MB | 33.47 MB | **17.30 MB (rep1: 4.47)** |
| 결정론 해시 (`state_hash_end`) | `265782276` | `265782276` | **`265782276` (100% 일치)** | `1100377522` | `1100377522` | **`1100377522` (100% 일치)** |

### 7.4 `size=144` (21,319 동적 바디) 6종 구성 종합 비교 (2회 평균)

| 지표 (`size=144`, 21,319 바디) | Jolt 기본 | Jolt + 1단계 | **Jolt + 2단계 커스텀** | Havok 기본 | Havok + 1단계 | **Havok + 2단계 커스텀** |
|---|---:|---:|---:|---:|---:|---:|
| `build_ms` | 33.41 ms | 32.49 ms | **28.01 ms (-16%)** | 27.58 ms | 29.14 ms | **25.06 ms** |
| `sync_p50_ms` | 8.790 ms | 4.987 ms | **1.098 ms (8.0×)** | 8.002 ms | 1.038 ms | **0.943 ms (8.5×)** |
| `phys_p50_ms` | 30.07 ms | 33.99 ms | **26.92 ms (-10.5%)** | 23.62 ms | 20.29 ms | **20.11 ms** |
| `phys_p95_ms` (폭파 피크) | 65.75 ms | 63.38 ms | **54.24 ms (-17.5%)** | 74.08 ms | 75.93 ms | **73.64 ms** |
| `frame_mean_ms` | 80.56 ms | 20.42 ms | **1.46 ms (55.2×)** | 5.09 ms | 0.63 ms | **0.77 ms** |
| `frame_p50_ms` | 82.76 ms | 8.75 ms | **0.40 ms (206.9×)** | 1.04 ms | 0.36 ms | **0.40 ms** |
| `frame_p95_ms` | 116.82 ms | 89.01 ms | **9.31 ms (12.5×)** | 16.16 ms | 0.74 ms | **1.04 ms** |
| `frame_p99_ms` | 139.75 ms | 116.57 ms | **17.39 ms (8.0×)** | 43.56 ms | 7.47 ms | **8.55 ms** |
| `hitch > 16.67ms` | 81.5회 | 89.0회 | **38.5회 (-52.8%)** | 45.0회 | 6.5회 | **7.0회** |
| `hitch > 33.33ms` | 79.0회 | 60.5회 | **19.5회 (4.1× 감소)** | 10.0회 | 2.0회 | **2.0회** |
| `hitch > 50.0ms` | 67.5회 | 40.5회 | **9.0회 (7.5× 감소)** | 6.0회 | 1.0회 | **1.0회** |
| `mem_delta_peak_mb` | 102.20 MB | 97.15 MB | **71.05 MB (-30.5%)** | 38.20 MB | 49.85 MB | **33.64 MB (rep1: 10.04)** |
| 결정론 해시 (`state_hash_end`) | `519827234` | `519827234` | **`519827234` (100% 일치)** | `654704613` | `654704613` | **`654704613` (100% 일치)** |

### 7.5 결론 및 아키텍처 권장사항

1. **커스텀 포크 패치로 Jolt Physics가 극적으로 개선됨**:
   - **9,428 동적 바디(`size=96`)**: Jolt의 프레임 최대 시간이 `34.10 ms → 12.96 ms`로 줄어 **16.67ms 초과 히치가 0회**가 되었으며, 폭파 직후 물리 스파이크(`23.41 ms`)는 오히려 Havok(`28.38 ms`)보다 낮습니다.
   - **21,319 동적 바디(`size=144`)**: 기본 Jolt에서 발생하던 60Hz catch-up 스파이럴(`frame_p50 = 82.76 ms`)이 완전히 해소되어 **`frame_p50 = 0.40 ms`(207× 개선), `frame_p95 = 9.31 ms`(12.5× 개선), 50ms 초과 심각 히치 7.5× 감소(67.5 → 9.0회), 메모리 피크 증분 30.5% 감소(102.2 → 71.1 MB)**를 달성했습니다.
   - **결정론 100% 보존**: 락프리 `JobSystemThreadPool`과 병렬 `_pre_step`, 병렬 배치 동기화를 적용한 뒤에도 전 구간(24/48/96/144) 상태 해시가 기존 Jolt와 비트 단위로 동일합니다.
2. **Havok Physics vs 패치된 Jolt Physics의 역할 분담**:
   - **웹(WASM) · 모바일(Android/iOS) · 일반 3D 게임(~1만 동적 바디 이하)**: 추가 바이너리 용량 **0 MB**, MIT 오픈소스, 멀티플랫폼 호환을 유지하면서 히치 0회(`size=96`)를 달성한 **2단계 커스텀 엔진 Jolt Physics + `PlayForgePhysicsBatch`**가 최적의 기본 엔진입니다.
   - **PC/콘솔 초대규모 파괴 시뮬레이션(2만+ 동적 충돌 바디 지속 활성)**: 21,319 바디에서도 `frame_p95 = 1.04 ms`, `hitch > 50ms = 1.0회`, 순수 물리 스텝 `5.68 ms`를 유지하는 **Havok Physics 2025.1.1 GDExtension 플러그인**이 여전히 가장 높은 상한선을 제공합니다.

---

## 8. 재현 방법

```powershell
# 1) Havok Physics 2025.1.1 GDExtension DLL 빌드 (VS2022 x64 Release)
powershell -NoProfile -ExecutionPolicy Bypass -File forge\Godot\addons\playforge_havok_physics\build.ps1

# 2) 커스텀 Godot 포크(d:\Github\GoDotProjects\godot-engine) template_release 빌드
C:\Users\taru0\AppData\Local\Programs\Python\Python313\python.exe -m SCons -C d:\Github\GoDotProjects\godot-engine platform=windows target=template_release arch=x86_64 profile=d:\Github\GoDotProjects-worktrees\Forge-HavokPhysics\tools\desktop\custom.py accesskit=no d3d12=no lto=none disable_path_overrides=no -j20

# 3) 기본(공식 Godot 4.7.2 + GDScript 동기화) Jolt vs Havok 벤치마크
powershell -NoProfile -ExecutionPolicy Bypass -File HavokProfile\run_benchmark.ps1 -Sizes "24,48,96,144" -Repeats 2 -Ticks 300 -Seed 1337

# 4) 1단계 최적화(공식 Godot 4.7.2 + GDExtension C++ 배치 동기화) Jolt vs Havok 벤치마크
powershell -NoProfile -ExecutionPolicy Bypass -File HavokProfile\run_benchmark.ps1 -Sizes "24,48,96,144" -Repeats 2 -Ticks 300 -Seed 1337 -BatchSync

# 5) 2단계 최적화(커스텀 Godot 포크 + PlayForgePhysicsBatch / Havok 배치 동기화) Jolt vs Havok 벤치마크
powershell -NoProfile -ExecutionPolicy Bypass -File HavokProfile\run_benchmark.ps1 -GodotExe "d:\Github\GoDotProjects\godot-engine\bin\godot.windows.template_release.x86_64.console.exe" -Sizes "24,48,96,144" -Repeats 2 -Ticks 300 -Seed 1337 -BatchSync -TagSuffix "-custom"
```

- 원자료: `HavokProfile/results/{jolt,havok,jolt-batch,havok-batch,jolt-custom-batch,havok-custom-batch}/summary.csv`, `result.json`
- 시각 증거(폭파 전/중/후 스크린샷 20장): `HavokProfile/results/evidence/`
