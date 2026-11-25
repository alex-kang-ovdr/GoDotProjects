# TraceSample v1 — 성능·메모리 계측 공통 계약

- 상태: **v1 동결 (R0 spike, 2026-11-25)** — 로드맵 항목 13, 브랜치 `Forge-Profiling`
- 근거: Godot 개선 로드맵 §7(공통 계약 `TraceSample`)·§12(공통 검증 계약), 검토 결정 "새 profiler부터 만들지 않고 기존 출력을 TraceSample로 묶는다"
- 정본 파일

| 파일 | 역할 |
|---|---|
| [forge/Tools/trace/trace-sample.schema.json](../../forge/Tools/trace/trace-sample.schema.json) | JSON Schema (draft 2020-12) |
| [forge/Tools/trace/trace-sample.cjs](../../forge/Tools/trace/trace-sample.cjs) | 무의존 검증기·JSONL 입출력 (`node trace-sample.cjs <file.jsonl>`) |
| [forge/Tools/trace/build-id.cjs](../../forge/Tools/trace/build-id.cjs) | `build_id` 해석 |
| [forge/Tools/trace/adapters/](../../forge/Tools/trace/adapters/) | 기존 출력 → TraceSample 변환 (`convert.cjs`) |
| [forge/Tools/trace/summarize.cjs](../../forge/Tools/trace/summarize.cjs) | 지표별 p50/p95/p99 요약 |
| [forge/Godot/addons/playforge_trace/](../../forge/Godot/addons/playforge_trace/) | Godot 런타임 수집기 |
| [forge/Tools/trace/run-godot-collector.cjs](../../forge/Tools/trace/run-godot-collector.cjs) | 헤드리스 실행 → 검증 → 요약 |

## 1. 형식

JSONL(UTF-8), **한 줄 = 한 샘플 객체**. 한 줄에는 측정값 하나만 담는다(지표 여러 개를 한 객체에 묶지 않는다).

```json
{"schemaVersion":1,"build_id":"forge-desktop-v0.1.0-20261125-1033-forge-profiling-g74c7fc1-b0-dirty","source":"godot-runtime","device":{"os":"Windows 10.0.26300","cpu":"13th Gen Intel(R) Core(TM) i9-13900HX","gpu":"none (headless)","driver":"none (headless)"},"clock_domain":"engine_frame","frame":30,"metric":"frame.wall_ms","value":16.672,"unit":"ms","exact":true,"ts":"2026-11-25T01:31:47.933Z","tags":{"renderer":"dummy","engine":"4.7.2-stable (official)","warmup":30}}
```

## 2. 필드

| 필드 | 필수 | 타입 | 의미 |
|---|---|---|---|
| `schemaVersion` | ✔ | `1` | 계약 버전. 필드 의미가 바뀌면 2로 올리고 어댑터를 둘 다 유지한다 |
| `build_id` | ✔ | string | 측정 대상 빌드 식별자 (§4) |
| `source` | ✔ | kebab-case | 샘플을 낸 계측기. 등록값: `godot-runtime`, `ism-profile`, `havok-profile`, `daily-profile`, `desktop-shader-telemetry`(예약). 새 계측기는 이름만 추가한다 |
| `device` | ✔ | `{os,cpu,gpu,driver}` | 모두 비어 있지 않은 문자열. 모르면 `"unknown"`, GPU가 없으면 `"none (headless)"` 처럼 **이유를 적는다** |
| `clock_domain` | ✔ | `engine_frame` \| `physics_tick` \| `wall` | 값이 어느 시간축에 귀속되는지 (§3) |
| `frame` | 조건부 | 정수 ≥ 0 | 엔진 프레임 번호 (`Engine.get_process_frames()` 또는 원본의 frame 열) |
| `tick` | 조건부 | 정수 ≥ 0 | 물리 틱 번호 (`Engine.get_physics_frames()` 또는 원본의 tick 열) |
| `metric` | ✔ | `a.b_c` | 점(.)으로 구분한 lower_snake 이름 (§5) |
| `value` | ✔ | 유한 number | 값 |
| `unit` | ✔ | `ms` \| `bytes` \| `count` | 단위. 지표 이름 접미사와 일치해야 한다 (§5) |
| `exact` | ✔ | boolean | `true` = 계측기가 직접 측정한 값, `false` = 추정·대체값 (§6) |
| `ts` | ✔ | ISO-8601 (시간대 포함) | 샘플 시각. 원본에 샘플별 시각이 없으면 **실행 시작 시각**을 모든 샘플에 쓴다 |
| `tags` | 선택 | `{string: string\|number\|boolean}` | 그룹 키(케이스·모드·크기·반복·렌더러 등). 중첩 객체 금지 |

정의되지 않은 필드는 거부한다(`additionalProperties: false`). 확장은 `tags`로 하고, 공통 필드가 필요하면 v2로 올린다.

## 3. 시계 도메인

| 값 | 의미 | 원시 샘플의 필수 인덱스 |
|---|---|---|
| `engine_frame` | 렌더/프로세스 프레임 단위로 반복 측정된 값 | `frame` |
| `physics_tick` | 고정 물리 틱 단위로 반복 측정된 값 | `tick` |
| `wall` | 실행·케이스당 1회 측정한 값(로드 시간, 빌드 시간, 케이스 종료 시 메모리 등) | 없음 |

- 사전 집계 지표(§5.2)는 인덱스가 없어도 된다(어느 시간축의 분포를 집계했는지만 `clock_domain`으로 남긴다).
- 30Hz/60Hz tick 예산(33.3/16.7ms) 비교는 `physics_tick` 도메인 값끼리만 한다.

## 4. `build_id`

새 형식을 만들지 않는다. [build-id.cjs](../../forge/Tools/trace/build-id.cjs)가 아래 순서로 해석한다.

1. 명시 값(`--build-id`) 또는 env `PLAYFORGE_BUILD_ID`
2. env `PLAYFORGE_BUILD_MANIFEST`가 가리키는 BuildManifest JSON의 `build_id`/`buildId` — BuildManifest 자체는 `Forge-BuildExport`(로드맵 16) 소유이며, 착지 전에는 파일이 있을 때만 읽는다
3. [tools/build-version/resolve-build-info.mjs](../../tools/build-version/resolve-build-info.mjs)의 `buildId` (`--target`·`--semver` 지정 시, 예: `forge-desktop-v0.1.0-20261125-1033-forge-profiling-g74c7fc1-b0-dirty`)
4. 폴백 `unknown-<git short sha>` (git도 없으면 `unknown-nogit`)

과거 결과물을 변환할 때(`convert.cjs`)는 현재 HEAD가 아니라 **그 결과 폴더를 마지막으로 바꾼 커밋 sha**로 `unknown-<sha>`를 만든다. daily-profile은 레코드 안의 `git.sha`를 쓴다.

## 5. 지표 이름

### 5.1 규칙

- 형식 `^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$` — 첫 마디는 영역(`frame`, `physics`, `render`, `gpu`, `mem`, `obj`, `draw`, `load`, `build`, `api`, `hitch`, `havok`, `godot`, `replay`).
- 단위 접미사: `ms` → 이름이 `_ms`로 끝남, `bytes` → `_bytes`로 끝남, `count` → `_ms`/`_bytes`로 끝나지 않음(`_count`/복수명사 권장). 검증기와 스키마가 모두 강제한다.
- MB로 기록된 원본은 `Math.round(MB × 1024²)` bytes로 바꾼다(`exact`는 원본 측정 여부를 그대로 따른다).

### 5.2 사전 집계 지표 (`.p50` `.p95` `.p99` `.mean` `.min` `.max`)

원본이 원시 샘플을 남기지 않고 집계값만 남긴 경우(HavokProfile `summary.csv`, daily-profile) 또는 **엔진이 이미 구간 집계해서 주는 값**은 이름 끝에 통계 접미사를 붙인다. `summarize.cjs`는 이 샘플을 백분위 재계산 대상에서 빼고 `preAggregated`로 따로 보인다. 원시와 집계를 같은 이름으로 섞지 않는다.

> **실측으로 확인한 함정**: Godot `Performance.TIME_PROCESS`·`TIME_PHYSICS_PROCESS`는 매 프레임 값이 아니다. 엔진이 **1초마다 직전 1초 구간의 최댓값으로 갱신**한다(헤드리스 300프레임 실행에서 같은 값이 60프레임씩 반복, ISMProfile `game_ms` 열은 약 540프레임씩 반복 — 25,721행 중 25,648행이 직전 행과 같은 값). 따라서 TraceSample에서는 `frame.cpu_ms.max` / `physics.step_ms.max` (`tags.window="1s"`)로, **값이 바뀔 때만** 기록한다. 이 값을 프레임별 원시값으로 세면 p50/p95가 크게 왜곡된다(ISMProfile `game_p50_ms`가 이 영향을 받는다).

### 5.3 v1 표준 지표 (요약)

| 지표 | 단위 | 도메인 | 정의 |
|---|---|---|---|
| `frame.wall_ms` | ms | engine_frame | 연속 프레임 사이 벽시계 간격(vsync·`max_fps` 상한 포함) |
| `frame.process_ms` | ms | engine_frame | 같은 프레임에서 최우선 노드 `_process` → 최후순위 노드 `_process` 사이 실측 CPU 시간(노드 프로세스 콜백 구간만, 렌더·물리 제외) |
| `frame.cpu_ms.max` | ms | engine_frame | `TIME_PROCESS` 1초 구간 최대 |
| `frame.game_thread_ms` | ms | engine_frame | Unreal game thread 시간(Godot `frame.cpu_ms`와 같은 지표로 취급하지 않는다) |
| `physics.step_ms` / `.max` | ms | physics_tick | 물리 스텝 시간(원시: HavokProfile ticks.csv / 구간 최대: `TIME_PHYSICS_PROCESS`) |
| `render.cpu_ms` / `gpu.render_ms` | ms | engine_frame | `viewport_get_measured_render_time_cpu/gpu` |
| `mem.static_bytes` / `mem.static_max_bytes` | bytes | engine_frame/wall | `Performance.MEMORY_STATIC(_MAX)` (Godot 정적 할당기) |
| `mem.process_bytes` / `mem.private_bytes` | bytes | wall/physics_tick | OS 프로세스 working set / private bytes |
| `mem.video_bytes` | bytes | engine_frame/wall | `RENDER_VIDEO_MEM_USED` |
| `obj.count` / `obj.node_count` / `obj.orphan_node_count` / `obj.resource_count` | count | engine_frame | `Performance.OBJECT_*` |
| `draw.calls` / `draw.primitives` / `draw.objects` | count | engine_frame | `RENDER_TOTAL_*_IN_FRAME` |

메모리는 §12 기준대로 process / native(static) / managed(JS heap 등) / VRAM 이름을 섞지 않는다. 단순 peak는 `.max`, 누수 추세는 원시 시계열로 본다.

## 6. `exact` 규칙

- `true`: 계측기가 **그 실행에서 직접 측정한** 값. 단위 변환(MB→bytes)·반올림은 측정으로 본다.
- `false`: 추정·보간·대체값, 또는 **측정 장치가 없어 나온 자리 채움 값**. 대표 예: 헤드리스(`DisplayServer` = `headless`)의 더미 렌더러가 돌려주는 `draw.*`·`mem.video_bytes` = 0 → `exact:false`, `tags.renderer="dummy"`.
- 측정 불가를 0으로 기록하지 않는 것이 원칙이다. 원본이 "0 = 미가용"이라고 명시한 값(Unreal ISMProfile `gpu_ms` = 0)은 **샘플을 만들지 않고 버린다**(어댑터 `meta.skipped`에 개수 기록).
- `summarize.cjs`는 같은 지표라도 `exact` true/false를 다른 그룹으로 집계한다. 인수 판단(Go/No-Go)에는 `exact:true`만 쓴다.

## 7. 보고 방식 (로드맵 §12)

1. **원시 샘플 보존**: `trace.jsonl` 원본을 그대로 남긴다(크면 `artifacts/`(gitignore)에 두고 요약만 커밋).
2. **요약**: `node forge/Tools/trace/summarize.cjs <trace.jsonl> [--group-by case,mode] [--out summary.json]`
   - 그룹 키: `source | metric | unit | clock_domain | exact` + `--group-by`로 지정한 `tags`
   - 통계: `n, min, p50, p95, p99, max, mean, stdev(표본)`
   - 백분위 방식: **nearest-rank** — 정렬된 n개 중 `ceil(p/100·n)`번째(항상 실제 샘플 값). ISMProfile `_pct`와 같은 방식이라 ISMProfile 실데이터 12케이스 모두 p50/p95가 원본 `summary.csv`와 일치함을 테스트로 고정했다.
3. **반복 분산**: 같은 조건을 최소 3회 반복하고 `--group-by repeat`(또는 실행별 요약)로 p50/p95의 반복 간 차이를 함께 적는다.
4. **함께 적을 조건**: `device`(OS/CPU/GPU/driver), engine 버전·렌더러(`tags`), build profile(`build_id`), seed·warmup(`tags`), 측정 프레임 수.
5. "테스트가 돌아감"과 "제품 기준 통과"를 구분한다 — 헤드리스 실행은 계약·파이프라인 검증용이며 렌더 성능 근거가 아니다.

## 8. 기존 출력 매핑

### 8.1 ISMProfile (`ISMProfile/results/{godot/*, unreal/*/Profile}`) — 어댑터 `ism-profile.cjs` ✅

| 원본 | TraceSample | 비고 |
|---|---|---|
| `environment.json` `platform/cpu/gpu/driver_version` | `device.*` | Unreal은 driver 없음 → `unknown` |
| `environment.json` `timestamp_utc` | `ts` | 오프셋 없으면 UTC로 간주 |
| `samples.csv` `frame_ms` | `frame.wall_ms` (engine_frame) | 원시 |
| `game_ms` (Godot) | `frame.cpu_ms.max` (window=1s) | 값이 바뀔 때만 (§5.2) |
| `game_ms` (Unreal) | `frame.game_thread_ms` | 원시 |
| `render_ms` / `gpu_ms` | `render.cpu_ms` / `gpu.render_ms` | Unreal `gpu_ms=0` 은 버림 |
| `draw_calls` / `primitives` / `objects` | `draw.calls` / `draw.primitives` / `draw.objects` | Godot만 |
| `process_memory_mb` (Unreal 프레임별) | `mem.process_bytes` | |
| `summary.csv` `generate_ms`, `build_submit_ms`, `first_frame_ms` | `build.generate_ms`, `build.submit_ms`, `load.first_frame_ms` (wall) | 케이스당 1회 |
| `summary.csv` `process_memory_mb`, `video_mem_mb`, `static_mem_mb` | `mem.process_bytes`, `mem.video_bytes`, `mem.static_bytes` (wall) | |
| `summary.csv` `case/mode/size/repeat` | `tags.case/mode/size/repeat` | + `tags.engine/rhi/run` |
| `summary.csv` `frame_p50_ms` 등 | (생성 안 함) | 원시에서 다시 계산, 일치 검증 |

실변환: `gd-r2-vulkan` 25,720프레임·12케이스 → 154,464샘플 전부 유효, `ue-r2` → 33,161샘플 전부 유효.

### 8.2 HavokProfile (`origin/Forge-HavokPhysics:HavokProfile/results/<tag>`) — 어댑터 `havok-profile.cjs` ✅

| 원본 | TraceSample | 비고 |
|---|---|---|
| `summary.csv` `frame_{mean,p50,p95,p99,max}_ms` | `frame.wall_ms.{mean,p50,p95,p99,max}` | 사전 집계 |
| `phys_{mean,p50,p95,p99,max}_ms` | `physics.step_ms.{…}` (physics_tick) | 사전 집계, `tags.basis="time_physics_process_1s_window_max"` (§10) |
| `explosion_spike_ms` / `sync_p50_ms` | `physics.explosion_spike_ms.max` / `physics.sync_ms.p50` | |
| `hk_{step,collide,solve}_p50_ms` | `havok.{step,collide,solve}_ms.p50` | |
| `hitch_frame_gt{16,33,50}`, `hitch_phys_gt16` | `hitch.frame_over_{16,33,50}ms_count`, `hitch.physics_over_16ms_count` (wall) | |
| `build_ms` | `build.world_ms` (wall) | |
| `mem_baseline/after_build/after_cleanup_mb`, `mem_peak_mb`, `static_mem_peak_mb` | `mem.private_{baseline,after_build,after_cleanup}_bytes`, `mem.private_bytes.max`, `mem.static_bytes.max` | |
| `ticks.csv` `phys_ms` | `physics.step_ms.max` (physics_tick, window=1s, 값이 바뀔 때만) | `TIME_PHYSICS_PROCESS` 기반 (§5.2) |
| `ticks.csv` `sync_ms, hk_{step,collide,solve}_ms, mem_private_mb` | `physics.sync_ms`, `havok.{step,collide,solve}_ms`, `mem.private_bytes` (physics_tick, 원시) | `ticks.csv`는 `.gitignore` — 로컬 실행 결과가 있을 때만 |
| `frame_jitter_p99_p50_ms`, `mem_delta_*` | (생성 안 함) | 다른 열에서 파생 |
| `state_hash_*`, `result.json` determinism | (생성 안 함) | 성능 지표 아님 — 결정성 증거로 원본 유지 |

실변환: `havok-batch` 8케이스 → 200샘플(전부 사전 집계) 유효. 커밋된 결과에는 원시 틱이 없어 §12 "raw samples" 요건은 로컬 재실행 시 `ticks.csv`로만 충족된다.

### 8.3 데일리 프로파일 (`forge/Tools/autotest-showcase-daily-profile.cjs` → `artifacts/showcase-daily/history.jsonl`, `runs/<date>/report.json`) — 어댑터 `daily-profile.cjs` ✅

| 원본(템플릿 결과) | TraceSample | 비고 |
|---|---|---|
| `web.performance.frameP50Ms/frameP95Ms/frameMaxMs` | `frame.wall_ms.p50/.p95/.max` | 브라우저 rAF 간격, 사전 집계 |
| `web.performance.samples`, `longFramesOver50ms` | `frame.sample_count`, `hitch.frame_over_50ms_count` (wall) | |
| `web.loading.*Ms`, `wasmTransferMb` | `load.{launcher,editor_iframe,wasm_transfer,wasm_boot_ready,first_cue}_ms`, `load.wasm_transfer_bytes`, `replay.wall_ms` | wall |
| `web.response.apiP50Ms/apiP95Ms/apiMaxMs` | `api.response_ms.p50/.p95/.max` | |
| `api.templateGetMs/showcaseAddonGetMs/projectCreateMs` | `api.{template_get,showcase_addon_get,project_create}_ms` | |
| `headless.prepareMs/importMs/replayMs/peakRssMb` | `godot.{prepare,import,replay}_ms`, `mem.godot_process_bytes.max` | |
| `web.memory.jsHeapPeakMb/jsHeapEndMb/wasmHeapPeakMb/serverPeakRssMb/domNodesPeak` | `mem.js_heap_bytes.max`, `mem.js_heap_end_bytes`, `mem.wasm_heap_bytes.max`, `mem.server_process_bytes.max`, `obj.dom_node_count.max` | |
| `git.sha` / `timestampKst` / `runId`·`id`·`mode` | `build_id=unknown-<sha>` / `ts` / `tags.run`·`template`·`mode` | |
| `fpsAvg`, `fpsP10`, `checks.*` | (생성 안 함) | 파생값·검증 플래그 |
| (없음) | `device.* = "unknown"` | runRecord에 장치 정보가 없다 — §10 제안 |

실변환: `PlayForge-Main/artifacts/showcase-daily/history.jsonl`(2026-11-21, 6템플릿) → 162샘플 유효.

### 8.4 데스크톱 `bridge.v1` `shader_telemetry` (docs/desktop/HUB_DESKTOP_PLAN.md §6.2) — 매핑만 확정, 어댑터 미구현

구현된 페이로드·실측 파일이 아직 없어 어댑터는 만들지 않았다. 계약 필드가 생기면 아래 매핑으로 `source="desktop-shader-telemetry"` 어댑터를 추가한다.

| `shader_telemetry` | TraceSample |
|---|---|
| `authLatencyMs`, `pckMountMs`, `sceneChangeMs`, `firstFrameLatencyMs` | `load.engine_boot_ms`, `load.pck_mount_ms`, `load.scene_change_ms`, `load.first_frame_ms` (wall) |
| `frameP50Ms`, `frameP95Ms`, `frameP99Ms`, `maxFrameMs` | `frame.wall_ms.p50/.p95/.p99/.max` (engine_frame, 사전 집계) |
| `hitchCountOver50ms`, `hitchCountOver100ms` | `hitch.frame_over_50ms_count`, `hitch.frame_over_100ms_count` (wall) |
| `PIPELINE_COMPILATIONS_{CANVAS,MESH,SURFACE,DRAW,SPECIALIZATION}` | `render.pipeline_compilations_{canvas,mesh,surface,draw,specialization}` (count, wall) |
| `gpuVendor` + `gpuName` / `driverVersion` | `device.gpu` (`"<vendor> <name>"`) / `device.driver` |
| `engineVersion`, `renderer`, `coldStart`, `gameId`, `gameVersion` | `tags.engine`, `tags.renderer`, `tags.cold_start`, `tags.game_id`, `tags.game_version` |
| (빌드) | `build_id` = 데스크톱 Player 빌드의 build-version `buildId` |

셰이더 캐시 무효화 키 `(engineVersion, renderer, gpuVendor, gpuName, driverVersion)`는 TraceSample의 `device.gpu/driver + tags.engine/renderer`로 그대로 재구성된다.

## 9. Godot 수집기 (`playforge_trace`)

- `trace_collector.gd`: 오토로드 가능한 `Node`. 사용자 인자 `--trace-out=<abs.jsonl> --trace-frames=N --trace-warmup=N --trace-build-id=<id> --trace-quit`. `--trace-out`이 없으면 아무것도 하지 않는다.
- `trace_main.gd`: `project.godot`을 바꾸지 않고 메인 씬(또는 `--trace-scene=`)과 수집기를 함께 띄우는 `-s` 진입점.
- `plugin.cfg`/`plugin.gd`: 에디터에서 플러그인을 켜면 `PlayForgeTrace` 오토로드를 등록한다.
- 샘플은 **즉시 파일에 한 줄씩 기록**한다. 처음 구현처럼 메모리에 쌓아 두면 수집기 자신의 버퍼가 `mem.static_bytes`를 끌어올렸다(300프레임에 32.4→36.4MB 증가 → 스트리밍 후 28,372,972 bytes로 평탄).
- 실행: `node forge/Tools/trace/run-godot-collector.cjs --out artifacts/trace/<run> --frames 300 --warmup 30 --target forge-desktop --semver 0.1.0`
  - Godot 실행 파일은 `tools/engine/resolve-godot.cjs`로 찾되, export template 빌드(`template_debug/release`)는 `--path`를 막아 두었으므로 건너뛰고 stock `Godot_v4.7.2-stable_win64_console.exe`로 내려간다.

## 10. R0 실측 기록 (2026-11-25)

조건: `forge/Godot`(Tappy Chicken 런타임 호스트, `gl_compatibility`, bridge 미연결 → `Engine.max_fps=60`), Godot 4.7.2-stable official 콘솔 바이너리, `--headless`, warmup 30프레임 + 측정 300프레임, 3회 반복, i9-13900HX / Windows 10.0.26300. 증거: [forge/Tests/trace/results/2026-11-25-godot-headless-300f/](../../forge/Tests/trace/results/2026-11-25-godot-headless-300f/) (요약·콘솔 로그, 원시 `trace.jsonl` 1.7MB×3은 `artifacts/trace/`(gitignore)).

| 지표 | r1 | r2 | r3 |
|---|---|---|---|
| 스키마 검증 | 3,610/3,610 | 3,610/3,610 | 3,610/3,610 |
| `frame.wall_ms` p50 / p95 / p99 | 16.666 / 16.732 / 16.869 | 16.666 / 16.729 / 16.817 | 16.666 / 16.778 / 16.863 |
| `frame.process_ms` p50 / p95 / p99 | 0.003 / 0.005 / 0.010 | 0.004 / 0.005 / 0.007 | 0.004 / 0.007 / 0.009 |
| `frame.cpu_ms.max` (1초 창 5개) p50 / max | 0.624 / 0.718 | 0.545 / 6.531 | 0.631 / 0.802 |
| `physics.step_ms.max` (1초 창 5개) p50 / max | 0.136 / 6.811 | 0.177 / 7.650 | 0.164 / 6.689 |
| `mem.static_bytes` (300프레임 일정) | 28,372,972 | 28,373,008 | 28,373,008 |
| `obj.node_count` / `obj.count` | 8 / 1,530 | 8 / 1,530 | 8 / 1,530 |
| `draw.calls` | 0 (`exact:false`, dummy) | 0 (`exact:false`) | 0 (`exact:false`) |
| 실행 벽시계 | 5.83s | 5.83s | 5.83s |

해석:
- `frame.wall_ms` ≈ 16.67ms는 60fps 상한이다(성능 여유를 뜻하지 않는다). 실제 CPU 비용은 `frame.process_ms`(수 μs)와 1초 창 최대값으로 본다 — 이 씬은 거의 일이 없다.
- `physics.step_ms.max`의 6~7ms는 매 실행 첫 창(시작 직후)에서만 나온다 → 워밍업 30프레임(0.5s)이 1초 창보다 짧아서 생긴 것. 성능 기준선 측정에는 warmup ≥ 60프레임(1초 창 이상)을 권장한다. r2의 `frame.cpu_ms.max` 6.531ms는 마지막 창(frame 293)에서 한 번 나온 스파이크로, 1초 창 최대값만으로는 어느 프레임인지 특정할 수 없다(프레임별 엔진 CPU 시간 계측이 필요한 이유, §11).
- HavokProfile `main.gd`도 `phys_ms`를 틱마다 `TIME_PHYSICS_PROCESS`로 읽는다(origin/Forge-HavokPhysics `HavokProfile/godot/main.gd` 562행) → `phys_p50/p95/p99`는 1초 창 최대값 분포다.
- 헤드리스 결과는 계약·파이프라인 검증 근거이며, GPU·렌더 성능 근거가 아니다.

## 11. 남은 일과 제안 (다른 소유 경로)

| 대상 | 제안 | 소유 |
|---|---|---|
| `ISMProfile/godot/main.gd` | `game_ms`를 `TIME_PROCESS`가 아니라 프레임별 실측(`frame.process_ms` 방식 또는 `EngineProfiler`)으로 바꾸거나 열 이름을 `game_window_max_ms`로 바꾼다. 현 `game_p50_ms`는 1초 창 최대값의 프레임 가중 중앙값이다 | ISMProfile 소유 브랜치 |
| `HavokProfile/godot/main.gd` | `phys_*` 통계가 `TIME_PHYSICS_PROCESS`(1초 창 최대) 기반이라 같은 왜곡이 있다 — 틱별 직접 계측(`Time.get_ticks_usec` 구간)으로 바꾸고, `ticks.csv`를 TraceSample JSONL로 직접 내도록 전환 | Forge-HavokPhysics |
| `forge/Tools/autotest-showcase-daily-profile.cjs` | runRecord에 `device{os,cpu,gpu,driver}`와 build-version `buildId`를 추가하고, `frameDeltas` 원시 배열을 TraceSample JSONL로 함께 저장 | PlayForge-Main |
| BuildManifest | `build_id` 필드명을 TraceSample과 같게(`build_id`) 두면 env `PLAYFORGE_BUILD_MANIFEST`만으로 연결된다 | Forge-BuildExport |
| 데스크톱 `shader_telemetry` | §8.4 매핑을 bridge.v1 스키마에 주석으로 연결 | Hub-Desktop |
| 프레임별 엔진 CPU 시간 | Godot `EngineProfiler._tick(frame_time, process_time, physics_time, physics_frame_time)`는 디버거 활성 시에만 호출된다 — 비디버그 실행에서 프레임별 process/physics 시간을 얻으려면 `[GD-Ext]` 훅 또는 `[GD-Core]` 패치 검토 | Forge-GodotEngine |
| `tools/qa/test-catalog.json` | 이 브랜치 작업과 무관한 미등록 테스트 4건이 트렁크에 있다(`deploy/cloudrun/forge/web-origin-config.test.mjs`, `deploy/cloudrun/prune-ar-images.test.mjs`, `deploy/vm/vm-config.test.mjs`, `forge/Tests/guest-firebase-session-cookie.test.cjs`) — `contract.gate-hygiene` TC-6.1 실패 원인 | 각 소유 브랜치 |
