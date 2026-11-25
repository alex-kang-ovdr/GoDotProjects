# 13. GDScript·C#·GPU·메모리 진단 및 심볼 개발 계획

## 1. 계획 요약

| 항목 | 계획 |
|---|---|
| 계획 ID / 기준일 | IMP-13 / 2026-11-24 |
| 원문 대응 | PDF 6-9쪽 프로파일러·VRAM·draw pass·데스크톱 심볼 |
| 우선순위 | P0 기준 계측 / P1 메모리·프레임 분석 확장 |
| 구현 위치 | EditorDebuggerPlugin, trace exporter, 최소 할당 계측 패치, CI 심볼 저장소 |
| 선행 과제 | 16 build identity. 모든 성능 과제에 공통 제공 |
| 담당 | 진단 도구 엔지니어 1명, 엔진 엔지니어 1명, 플랫폼 QA |
| 예상 공수 | 24-40 PW. 외부 profiler 재개발은 제외 |
| 구현 상태 | 개발 계획. 크래시·프레임·메모리 capture를 실제 수행하지 않음 |

## 2. 목표와 범위

하나의 실행 ID로 CPU·GDScript·C#·GPU·메모리·네트워크 tick을 연결하여 병목과 누수를 재현한다. 내장 도구로 충분한 정보는 그대로 활용하고, 외부 profiler capture와 비교 결과를 편집기에서 찾을 수 있게 한다.

1차는 trace identity·custom marker·심볼 보관·성능 baseline이다. 2차는 GDScript 논리 객체 수명/할당 attribution, C# EventPipe 연결, VRAM 자원 수명, draw pass 타임라인, snapshot diff다. 하드웨어 GPU debugger 전체를 자체 구현하는 범위는 포함하지 않는다.

## 3. 확인한 기존 기능

- Godot 내장 profiler는 GDScript/엔진 시간 분석을 제공하지만 C# script profiling은 별도 도구 경로를 안내한다. [The Profiler](https://docs.godotengine.org/en/stable/tutorials/scripting/debug/the_profiler.html)
- `EditorDebuggerPlugin`은 디버거 세션·탭·메시지 연결을 확장할 수 있다. 이를 통합 UI의 기반으로 사용한다. [공식 API](https://docs.godotengine.org/en/stable/classes/class_editordebuggerplugin.html)
- .NET EventPipe는 trace·counter·managed heap 도구와 연결할 수 있다. 플랫폼별 가용성을 점검한 후 C# bridge를 제공한다. [Microsoft EventPipe](https://learn.microsoft.com/en-us/dotnet/core/diagnostics/eventpipe)

현재 공식 심볼 배포 범위를 일반화하지 않고, 우리 빌드의 심볼을 재현 가능하게 보관하는 것을 목표로 한다. 아래 모듈·예산·게이트는 자체 제안이다.

## 4. 수집·표시 구조

| 계층 | 책임 | 설계 |
|---|---|---|
| CaptureRegistry | 실행·세션·build·장치 식별 | 다른 build의 trace/symbol 혼합 방지 |
| CPU/GDScriptCollector | function span·작업·스크립트 위치 | sampling과 instrumented 모드를 구분 |
| AllocationTracker | logical object·buffer·owner·callsite | 공유/풀/복사-on-write를 분리 기록 |
| DotNetBridge | GC·managed alloc·sample trace | 런타임 diagnostic 권한 범위에서 연결 |
| RenderResourceTracker | resource 생성/파괴·예산·pass marker | 측정값과 추정 VRAM 값을 구분 |
| ExternalCaptureAdapter | RenderDoc/Perfetto/Instruments 결과 연결 | 도구별 원본 capture를 보존 |
| SymbolResolver | crash address→module→symbol | build identity가 일치할 때만 해석 |
| AnalysisPanel | 프레임·snapshot diff·위치 탐색 | 원시 데이터와 집계값을 모두 내려받기 |

서버·클라이언트·편집기 프로세스는 공통 `run_id` 아래 별도 `process_id`를 가진다. CPU monotonic clock과 GPU timestamp는 clock calibration 메타데이터로 연결하고, 동기화 오차를 UI에 표시한다. 네트워크에서는 wall-clock보다 `server_tick`과 input sequence를 우선 비교한다.

## 5. 제안 데이터 계약

```text
TraceHeader = {
  run_id, process_id, project_id, build_id, engine_commit,
  platform, device_profile, clock_domain, timestamp_unit, schema_version
}
TraceEvent = {time, thread_id, category, event_id, parent_id, fields}
MemoryEntry = {
  allocation_id, object_type, logical_owner, physical_bytes,
  shared_group, creation_callsite, lifetime_state, confidence
}
SymbolIndex = {module_hash, build_id, symbol_kind, symbol_identity, artifact_hash}
```

이는 신규 trace schema다. GDScript 변수의 논리 크기와 실제 native allocation 크기를 동일하게 표시하지 않는다. 하나의 공유 Texture가 여러 Node에 참조되면 전체 VRAM 합산은 한 번만 하고 각 참조는 retain graph로 표시한다. 수집할 수 없는 리소스의 메모리는 `unknown`으로 남긴다.

콜스택·객체 목록은 capture level에 따라 제한한다. 과도한 label cardinality와 대용량 문자열을 줄이며 수집 버퍼가 가득 차면 drop count를 기록한다. 샘플 누락을 0으로 숨기지 않는다.

## 6. 심볼·크래시 파이프라인

빌드 작업은 실행 파일과 심볼을 같은 job에서 생성한다. Linux는 build-id와 분리 DWARF, Windows는 PE/PDB의 일치 식별자, Apple은 Mach-O/dSYM UUID에 대응하는 index를 만든다. 각 방식의 실제 파일 형식·생성 명령은 고정 toolchain으로 검증한다.

배포 패키지에는 필요한 runtime 파일만 포함하고 상세 심볼은 접근이 제한된 진단 저장소에 보관한다. crash record에는 build ID·module list·최소 stack 정보를 담으며 메모리 dump 전체 수집은 별도 설정으로 둔다. source map·경로에서 로컬 사용자명이나 비밀값이 불필요하게 노출되지 않도록 path remapping을 적용한다.

retention은 지원 중인 release와 rollback 가능 release를 모두 포함한다. 심볼 없는 바이너리만 출시되는 것을 CI가 차단한다. 특정 commit의 실행 파일로 의도적 crash를 발생시켜 소스 위치 해석까지 검증한다.

## 7. 작업분해와 공수

| 작업 ID | 작업 | PW | 산출물 |
|---|---|---:|---|
| PRF-01 | trace schema·build/run identity·기준 측정 | 3-5 | 공통 기록 규격·baseline |
| PRF-02 | GDScript allocation·수명·retain graph 계측 | 6-10 | memory collector·snapshot diff |
| PRF-03 | C# EventPipe·외부 profiler 연결 | 3-5 | managed trace adapter |
| PRF-04 | GPU pass·VRAM resource·외부 capture 연계 | 5-8 | frame panel·resource attribution |
| PRF-05 | 심볼 index·크래시 수집·source resolve | 4-7 | 심볼 CI·의도적 crash 검증 |
| PRF-06 | 성능 gate·장시간 누수·문서·패키지 | 3-5 | 회귀 dashboard·운영 문서 |
| 합계 | 도구 통합 및 필요한 계측 패치 | **24-40** | 고급 GPU debugger 재개발 제외 |

## 8. 도입 단계와 의존성

G0는 공통 marker와 빌드 ID부터 제공하여 다른 과제의 비교 실험을 가능하게 한다. G1에서 외부 capture와 심볼 해석을 먼저 제품화한다. G2에서는 논리 객체 수명부터 메모리 진단을 확장하고, 정확한 할당 attribution이 필요한 부분만 엔진 hook을 추가한다.

G3는 [04](04_Compositor_Render_Passes.md)의 render-pass 식별자와 [26](26_Iris_Style_Replication.md)의 복제 비용 분류를 연결한다. 내부 구조가 바뀌면 trace schema의 major version을 올리고 과거 trace reader는 유지한다.

## 9. 완료 기준과 재현 시험

| 시험 | 조건 | 계획용 통과 기준 |
|---|---|---|
| attribution | 의도적으로 만든 객체·buffer·signal 누수 10종 | 소유자·생성 위치·증가량을 찾을 수 있음 |
| 공유 메모리 | 1개 리소스를 1천 Node가 참조 | 물리 메모리 중복 합산 없음 |
| observer 비용 | 동일 장면, capture off/sampling/full | sampling CPU p95 추가 5% 이하 목표, full은 오버헤드 명시 |
| trace 정확성 | 알려진 marker 순서·drop 유발 | 순서/시간 도메인 일관, 누락 수치 표시 |
| 심볼 | 플랫폼별 의도적 native/managed crash | 올바른 build의 함수·가능한 소스 위치 복원 |
| 누수 | scene load/unload 1천 회, 2시간 soak | baseline 밖의 지속 증가 탐지·원인 연결 |
| release | shipping 설정과 비활성 collector | 개발용 capture endpoint 비활성, 기능 동작 일치 |

장치·전력·OS·GPU driver·renderer·해상도·build profile을 고정한다. 프레임 p50/p95/p99와 peak/resident/allocated를 구분한다. CPU frame과 GPU frame을 더해 전체 frame이라고 표현하지 않는다.

## 10. 위험·대안·산출물

기존 엔진 allocator에 스크립트 소유권을 정확히 연결할 수 없으면 추정치임을 표시하고 먼저 객체 수명 추적을 출시한다. 계측 비용이 큰 경우 frame window·sampling·종류 필터를 제공한다. GPU driver가 정보를 노출하지 않으면 지원하지 않는 값은 비워 둔다.

산출물은 trace schema/reader, EditorDebuggerPlugin, memory diff 도구, 외부 capture adapter, 플랫폼 심볼 CI, 재현 프로젝트, 성능 기준 보고서와 누수 조사 절차다. capture 파일은 게임 데이터와 같은 project 권한으로 격리한다.

## 11. 출처

2026-11-24 열람: [Godot Profiler](https://docs.godotengine.org/en/stable/tutorials/scripting/debug/the_profiler.html), [EditorDebuggerPlugin](https://docs.godotengine.org/en/stable/classes/class_editordebuggerplugin.html), [.NET EventPipe](https://learn.microsoft.com/en-us/dotnet/core/diagnostics/eventpipe), [Rider Godot profiling](https://www.jetbrains.com/help/rider/Godot.html). 설계 범위와 실제 제공 도구를 구분했으며 구현·실행 검증은 하지 않았다.
