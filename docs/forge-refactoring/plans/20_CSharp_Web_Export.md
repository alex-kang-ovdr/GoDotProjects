# 20. C#/.NET Web 익스포트 연구·제품화 계획

| 항목 | 계획 |
|---|---|
| 계획 ID / 기준일 | PLAN-20 / 2026-11-24 |
| 원문 연결 | PDF 4-5, 7-8쪽: C# Web 미지원, WASM runtime·linking |
| 우선순위 / 상태 | P3 R&D, C# Web 수요 확인 시 승격 / 미구현·미검증 |
| 구현 위치 | .NET module/binding, Web template, MSBuild/exporter, CI |
| 담당 | .NET runtime 전문가, Godot binding, Web/WASM, QA |
| 예상 공수 | 30-54 PW, 1 PW = 숙련 담당자 5근무일; upstream 승인 대기 제외 |
| 선행 / 연계 | 필수: 16 재현 빌드 기준. 계약 참조·병행: 10 객체수명/ABI, 11 DX. 19 WebGPU는 독립 gate |

## 1. 목표와 범위

Godot의 기본 게임 언어는 GDScript로 유지한다. C# 기반 기존 프로젝트나 선택형 addon이 실제로 Web 출하를 요구할 때, 제한된 .NET API 집합을 안정적으로 내보내는 경로를 연구한다.

최초 범위는 single-thread, Compatibility renderer, 관리 코드 game assembly, 기본 collection·signal·async·HTTP/WebSocket이다. 모든 NuGet 패키지, native DLL, runtime code generation, 데스크톱 디버거 동등성은 초기 범위가 아니다.

## 2. 확인 사실과 불확실성

Godot stable C#·Web 문서는 현재 C# Web export를 지원하지 않는다고 설명한다. 공식 priorities에는 Web export와 표준/.NET 빌드 통합이 별도 과제로 있다. [C# 문서](https://docs.godotengine.org/en/stable/tutorials/scripting/c_sharp/), [priorities](https://godotengine.org/priorities/)

공식 엔진 저장소에는 정적 Mono WASM embedding을 다루는 Web export PR이 있다. 제안·논의의 존재는 production 지원의 증거가 아니며, 본 계획은 해당 작업의 최신 상태와 라이선스를 확인해 재사용 여부부터 평가한다. [PR #106125](https://github.com/godotengine/godot/pull/106125)

원문이 설명한 main module 충돌을 영구적 불가능으로 취급하지 않는다. 동시에 단일 실험 성공을 일반 NuGet·브라우저 지원으로 확장하지 않는다. 아래 API·수치·공수는 자체 설계 제안이다.

## 3. 검토할 접근법

| 경로 | 장점 | 비용·gate |
|---|---|---|
| upstream 기능이 지원 버전에 포함된 경우 | 유지 비용과 export 표준화 | 실제 tag·기능 제한·회귀 검증 |
| Godot template에 .NET runtime 정적 결합 | 진입점·memory 소유권 통제 | template 재빌드·ABI·payload 증가 |
| .NET host와 Godot embedding bridge | runtime lifecycle 명확화 가능 | 렌더링 loop·callback·build 구조 재검증 |
| C# 필수 로직만 GDScript로 전환 | 기본 Web 경로 활용 | 프로젝트별 포팅·동작 동일성 비용 |

주 경로는 upstream와 정적 결합의 작은 비교 실험으로 선택한다. 두 runtime을 단순히 두 WASM 파일로 함께 로드하는 방식은 메모리·호출·수명 관리 문제를 자동 해결하지 않는다.

## 4. 실행·빌드 아키텍처

`ManagedWebBootstrap`이 runtime 준비와 Godot initialization 순서를 통제하고 `ManagedBridge`가 object lifetime·signal·exception 경계를 담당한다. UI frame loop를 막는 blocking wait를 제거하고 browser event loop와 Task continuation 정책을 정의한다.

Engine template, .NET runtime pack, Emscripten, Godot.NET.Sdk, game assemblies, generated binding, linker roots를 한 compatibility lock으로 고정한다. 임의 조합은 export에서 오류로 종료한다.

AOT/interpreter/jiterpreter 여부와 trimming은 별도 profile로 다룬다. 최초 안정화에서는 공격적인 trimming을 끄고, reflection·signal callback·generic을 보존하는 roots와 실험을 마련한 후 활성화한다.

## 5. 제안 export manifest

```yaml
# 신규 exporter 계약 예시; 공식 Godot export 설정이 아님
managed_web:
  profile: single_thread_compatibility_v1
  engine_commit: resolved-engine-commit
  runtime_pack: resolved-version-and-digest
  managed_payload_hash: resolved-digest
  bridge_abi: 1
  trimming: conservative
  globalization: selected_cultures
  supported_apis: [signals, collections, http, websocket]
  unsupported_native_dependencies: []
```

`validate_managed_web_dependencies()`는 native library, unsupported runtime API, reflection roots 누락을 진단한다. 가능하다고 선언한 기능은 각자 실행 fixture와 지원 브라우저 결과를 연결한다.

실행 중 예외는 managed stack과 Godot 오류 위치를 연결한다. 무한 재시작을 피하고 오류 세션에서 저장 데이터·결제 요청을 재실행하지 않는다.

## 6. 필수 연구 항목

- Godot object 해제와 managed GC handle의 수명·순환 참조.
- Signal과 delegate 등록/해제, scene 재로드 후 callback 잔류.
- UTF-8·culture·timezone·ICU 데이터 축소의 실제 영향.
- HTTP/WebSocket·cryptographic random·browser permission의 지원 범위.
- `Task` continuation과 single-thread 대기; blocking 동기 API의 진단.
- Exception propagation, reflection·generic·serialization과 trimming.
- 초기 다운로드·WASM compilation·managed initialization·첫 scene 시간을 분해 측정.

멀티스레드 export는 cross-origin isolation·기존 addon ABI·.NET thread runtime이 모두 통과한 후 별도 단계로 연다. Single-thread 성공만으로 thread 지원을 표시하지 않는다.

## 7. 작업 분해

| 작업 | 내용 | PW | 산출물 |
|---|---|---:|---|
| C20-1 | upstream 상태·접근법·수요 spike | 4-6 | ABI 설계, 진행/중단 결정 |
| C20-2 | runtime bootstrap·embedding bridge | 6-12 | 최소 C# scene 실행 경로 |
| C20-3 | publish/export/template lock 통합 | 6-10 | 관리 payload 생성·검증 |
| C20-4 | GC·signal·exception·async·문자 처리 | 5-9 | 기능 fixture와 지원표 |
| C20-5 | browser·size·startup·장시간 회귀 | 5-10 | 성능·안정성 증거 |
| C20-6 | 문서·마이그레이션·release package | 4-7 | 기능 제한 진단·배포 안내 |
| 합계 | 멀티스레드·모든 NuGet 호환 제외 | **30-54** | 제한된 C# Web 지원 |

## 8. 도입 gate

10번의 객체수명·ABI 계약을 참조하되, 신규 GDExtension binding 전환 완료를 이 연구의 필수 선행으로 두지 않는다. 기존 GodotSharp 또는 정적 Mono embedding 경로로 Web 연구를 먼저 진행할 수 있다. 11번 Hot Reload/DX 전체 구현도 필수 선행이 아니며, 필요한 최소 오류 진단만 본 과제의 exporter·fixture와 병행한다. 공통 객체수명·ABI 계약의 변경은 양쪽 담당자가 검토하고 각 경로의 검증 기록을 유지한다.

G0은 C# node 생성·signal·scene unload를 브라우저 2종에서 실행한다. G1은 core API fixture, G2는 기존 C# 프로젝트 1개의 수직 slice, G3는 크기·장시간·비정상 종료 검증이다.

C# Web와 WebGPU의 교차조합은 두 독립 gate를 통과한 뒤 추가 검증한다. 도입 완료 선언에 필요한 조합은 `GDScript/WebGL`, `GDScript/WebGPU`, `C#/WebGL`, `C#/WebGPU`로 나눈다.

## 9. 완료 기준

| 검증 | 시험 | 계획 목표 |
|---|---|---|
| 핵심 API | signal·object lifetime·collection 등 50개 fixture | 지원 목록 전부 통과 |
| scene 수명 | load/unload 100회 | dangling callback 0, 미해제 handle 증가 0 |
| GC/메모리 | 30분 반복 workload, 강제 GC 비교 | 안정 구간 heap 증가 10% 이내 |
| trimming | off/on 동일 golden scenario | 결과·reflection 대상 차이 0 |
| startup | 고정 20 Mbps·50 ms RTT, cold cache 10회 | 첫 playable 10초 이내 후보 목표; 초과 시 범위/콘텐츠 재설계 |
| 배포 | 빈 worker에서 10회 export | 수동 JS 편집 없이 10회 성공 |
| 의존성 | 미지원 native package 추가 | export에서 위치·대안 포함하여 차단 |

숫자는 제품 예산을 논의할 출발점이다. 10초 목표는 콘텐츠 크기와 장치를 고정한 시험에만 적용하고 일반 웹 사용자의 성능 보장으로 표시하지 않는다.

## 10. 위험과 중단 기준

G0에서 6 PW 내 안정적인 runtime 소유권·GC 경계를 확보하지 못하면 연구를 중지하고 GDScript Web 경로를 유지한다. 기능 구현이 가능해도 초기 payload·유지 비용이 사업상 한도를 넘으면 C# 지원을 native로 제한한다.

이 계획의 patch는 production 기본 branch와 분리하고 engine/runtime 업그레이드마다 전체 fixture를 반복한다. 자동 변환으로 임의 게임의 C# 의미가 보존된다고 약속하지 않는다.

## 11. 제출 산출물·출처

산출물: ABI/부팅 설계, template·exporter 코드, lock schema, API support matrix, fixture 프로젝트, browser별 결과, 크기·시작시간 보고서, 미지원 API 가이드.

확인일: 2026-11-24.

- [Godot C# 지원 범위](https://docs.godotengine.org/en/stable/tutorials/scripting/c_sharp/)
- [Godot Web export](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html)
- [Godot priorities](https://godotengine.org/priorities/)
- [공식 저장소의 Web export PR](https://github.com/godotengine/godot/pull/106125)
