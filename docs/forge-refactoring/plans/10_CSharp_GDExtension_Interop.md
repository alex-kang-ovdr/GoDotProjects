# 10. C# GDExtension·언어 간 상호운용 개발 계획

## 1. 계획 요약

| 항목 | 계획 |
|---|---|
| 계획 ID / 기준일 | IMP-10 / 2026-11-24 |
| 원문 대응 | PDF 3-4쪽 C# 통합, 7-8쪽 바인딩 이전·단일 실행 파일 |
| 우선순위 | P2 / R&D. GDScript 기반 제품 출시의 필수 경로에서 분리 |
| 구현 위치 | 선택형 .NET 런타임 패키지, GDExtension 바인딩, 생성 도구 |
| 선행 과제 | 16 빌드 체계, 23 패키지 계약, 13 interop 계측 |
| 담당 | .NET 런타임 엔지니어 1명, Godot 바인딩 엔지니어 1명, 플랫폼 QA |
| 예상 공수 | 30-52 PW. 최초 타당성 조사 3-5 PW 이후 계속 여부 결정 |
| 구현 상태 | 개발 계획. 신규 바인딩·모바일 AOT 검증 미수행 |

## 2. 목표와 범위

GDScript 기본 프로젝트에서 필요한 C# 모듈을 선택적으로 사용할 수 있도록 설치·버전·상호운용 경계를 정리한다. 초기 목표는 표준판/.NET판 혼동과 반복 마샬링 비용을 줄이는 것이다. “어떤 C# 코드든 모든 플랫폼에서 단일 실행 파일로 동작”하는 목표로 확대하지 않는다.

제품 경로는 검증된 Godot .NET 배포를 유지한다. 연구 경로는 공식 `godot-dotnet`의 GDExtension 바인딩을 고정 commit으로 평가한다. 두 경로는 같은 프로젝트에서 런타임을 중복 로드하지 않으며 별도 export profile로 분리한다. 웹 .NET은 [20](20_CSharp_Web_Export.md)의 독립 연구 과제다.

## 3. 공식 확인 사실과 보정

- 공식 `godot-dotnet` 저장소는 GDExtension API 기반 .NET 바인딩을 제공하지만 README에서 작업 진행 중이며 첫 안정 릴리스 전 API 변경 가능성을 명시한다. 저장소 존재를 production 전환 완료로 해석하지 않는다. [공식 저장소](https://github.com/godotengine/godot-dotnet)
- 현재 C# 컬렉션 경계에는 마샬링 비용이 있고 .NET↔Godot 컬렉션 변환은 요소 복사를 수반할 수 있다. GDExtension 이전만으로 모든 변환 비용이 사라지지는 않는다. [C# collections](https://docs.godotengine.org/en/stable/tutorials/scripting/c_sharp/c_sharp_collections.html)
- Godot 4 C# 웹 익스포트 및 모바일 지원 조건은 플랫폼별 제약이 있다. 본 계획은 각 타깃에서 런타임·AOT·링커 조합을 검증한 뒤 지원을 선언한다. [C# basics](https://docs.godotengine.org/en/stable/tutorials/scripting/c_sharp/c_sharp_basics.html)

이하 모듈·수치·일정은 자체 설계 제안이다. 원문 0-6개월 완료 기간은 재단의 확정 약속이나 본 팀의 납기로 사용하지 않는다.

## 4. 통합 아키텍처

| 계층 | 책임 | 개발 원칙 |
|---|---|---|
| RuntimeResolver | 플랫폼·프로젝트별 .NET 패키지 선택 | engine/API/runtime hash 일치 검사 |
| BindingGenerator | API descriptor→타입·호출 stub·진단 코드 | 생성물과 생성기 버전 함께 고정 |
| ManagedObjectBridge | managed/native 생존·해제·signal 관리 | 명시적 owner, generation, main-thread 규칙 |
| InteropBatchAPI | 대량 속성 읽기·쓰기와 packed buffer 전달 | 객체별 호출보다 배치 경계 제공 |
| EditorIntegration | 타입 등록, Inspector, export 설정 | 실행 코드와 편집기 코드를 분리 |
| CompatibilityHarness | 기존 GodotSharp 프로젝트 비교 | 타입·signal·직렬화 회귀를 자동 탐지 |

단일화는 먼저 “하나의 설치/패키지 관리 경험”으로 달성한다. 런타임이 필요한 타깃은 런타임 파일을 포함하고 필요 없는 GDScript 타깃에는 포함하지 않는다. 물리적 단일 바이너리는 플랫폼별 가치와 제약을 검증한 후 별도 최적화로 취급한다.

데스크톱의 .NET hosting 경로와 iOS 등의 AOT 경로는 구분한다. JIT가 필요한 경로를 AOT 플랫폼에 강제로 이식하지 않는다. 승인되지 않은 UGC가 .NET/native 호스트 권한을 획득하지 않도록 지원 패키지와 실행 환경을 [23](23_Addon_Package_Global_CLI.md), [30](30_AntiCheat_Server_Validation.md)의 정책에 연결한다.

## 5. 제안 계약

아래는 신규 프로젝트 패키지 스키마 예시이며 Godot가 이미 제공하는 설정 키가 아니다.

```json
{
  "language_runtime": "dotnet_optional",
  "engine_api_hash": "<pinned-api-hash>",
  "binding_revision": "<pinned-commit>",
  "runtime_profile": "desktop_jit_or_mobile_aot",
  "assemblies": [{"name": "Simulation", "content_hash": "<hash>"}],
  "interop_schema_version": 1,
  "required_capabilities": ["signals", "packed_batch"]
}
```

`ObjectHandle(index,generation)`는 유효성 검증을 거쳐 native 객체에 연결한다. `Dispose` 이후 callback을 금지하고 reverse callback은 엔진 스레드에 전달한다. 예외는 언어 경계 밖으로 그대로 전파하지 않고 error code와 진단 정보로 변환한다. unmanaged 메모리 대여는 수명·쓰기 권한·핀 해제 규칙이 명확한 경우에만 제공한다.

`GetTransformsBatch`/`ApplyTransformsBatch`는 제안 API다. 최초 버전은 안전한 복사 방식으로 구현하고, zero-copy는 지원되는 blittable 타입·한정된 생존 범위에서만 별도 capability로 노출한다. 게임 네트워크 스키마는 managed 타입명에 직접 묶지 않는다.

## 6. 작업분해와 공수

| 작업 ID | 구현 작업 | PW | 산출물 |
|---|---|---:|---|
| CSB-01 | 공식 바인딩·GodotSharp·플랫폼 제약 비교 | 3-5 | ADR, API gap·중단 기준 |
| CSB-02 | 버전 잠금·런타임 resolver·생성기 연결 | 5-9 | 재현 가능한 빌드·패키지 |
| CSB-03 | 객체 수명·signal·예외·타입 등록 | 6-10 | 상호운용 계층과 회귀 코퍼스 |
| CSB-04 | packed 배치·컬렉션 변환 비용 최적화 | 6-10 | benchmark, 메모리 안전성 기록 |
| CSB-05 | Inspector·직렬화·기존 프로젝트 마이그레이션 | 6-10 | 호환성 도구·전환 안내 |
| CSB-06 | 데스크톱·모바일 export·AOT·롤백 | 4-8 | 지원 매트릭스·릴리즈 가이드 |
| 합계 | 웹 .NET 및 임의 모듈 자동 변환 제외 | **30-52** | 외부 업스트림 대기 별도 |

## 7. 단계별 도입

G0에서 작은 C# 모듈 하나가 GDScript에서 호출되고 signal을 반환하는 경로를 확인한다. G1에서 object lifetime과 export가 통과할 때만 배치 성능 실험을 진행한다. 런타임을 로드하는 데 성공한 것만으로 C# 프로젝트 마이그레이션 성공을 선언하지 않는다.

G2는 기존 GodotSharp 프로젝트와 연구 바인딩을 각각 실행해 Inspector 저장, scene reload, resource 재import, generic 컬렉션, callback 취소를 비교한다. G3에서는 타깃별 cold start·패키지 크기·AOT 실패를 정리하고 허용 플랫폼만 출시한다.

공식 바인딩이 요구를 충족하면 자체 fork를 줄이고 upstream 버전을 채택한다. upstream 납기가 불명확하면 기존 .NET판을 계속 제공한다. C# 미사용 게임의 빌드와 실행에는 이 과제가 의존성으로 들어가지 않는다.

## 8. 완료 기준과 검증

| 시험 | 입력·조건 | 계획용 통과 기준 |
|---|---|---|
| API 호환 | 선택 API 100개, 값/참조/nullable/signal/오류 유형 | 기대 결과 일치, 실패 원인 코드 제공 |
| 수명 | 10만 객체 생성·해제, scene reload 100회 | stale callback·이중 해제·고아 handle 0건 |
| interop 비용 | 1만 transform, 객체별 vs 배치, 5회 반복 | 해당 경계 p95 비용 30% 감소 목표, 전체 프레임 퇴행 5% 이내 |
| GC | 10분 안정 구간, warmup과 JIT 구간 분리 | 배치 핫패스에 의도하지 않은 per-frame managed 할당 없음 |
| 호환성 실패 | API hash/runtime/schema 불일치 | 실행 전 거절, 올바른 패키지로 복귀 가능 |
| 모바일 | Android/iOS 승인 타깃의 release/AOT 실기기 | 시작·signal·장시간·중단 복원 시나리오 통과 |

장치·OS·compiler·engine/API hash·.NET SDK/runtime·binding commit을 결과에 기록한다. 평균·p50·p95·p99 및 allocations/frame을 보존한다. 수치는 측정 결과가 아니라 개발 종료 게이트다.

## 9. 위험과 대안

언어 간 수명 모델이 맞지 않으면 복잡한 객체 직접 노출을 줄이고 POD/직렬화 메시지 경계를 사용한다. AOT에서 reflection·동적 코드 생성이 막히면 source generator와 명시적 타입 등록을 사용하거나 해당 모듈을 타깃 지원에서 제외한다.

기존 프로젝트의 데이터 호환성을 유지할 수 없거나 바인딩 API 변경이 반복되면 production 이전을 중단한다. 그동안 사용할 배치 API·진단 도구는 기존 GodotSharp 경로에서도 재사용할 수 있게 설계한다.

## 10. 제출 산출물

- 지원 타깃·기능 매트릭스, 선택형 런타임 패키지, 버전 lock 및 호환성 검사기.
- API 생성기, 수명 관리 문서, packed batch API, 벤치마크 입력과 원시 결과.
- 기존 .NET판으로 복귀하는 절차, 데이터 마이그레이션 도구, 코드 예제.

## 11. 출처

2026-11-24 확인: [Godot .NET 공식 저장소](https://github.com/godotengine/godot-dotnet), [C# GDExtension 로드맵 논의](https://github.com/godotengine/godot-proposals/issues/7895), [C# collections](https://docs.godotengine.org/en/stable/tutorials/scripting/c_sharp/c_sharp_collections.html), [C# basics](https://docs.godotengine.org/en/stable/tutorials/scripting/c_sharp/c_sharp_basics.html). 문서 열람으로 확인한 기능 범위이며 실제 플랫폼 지원 인증을 대신하지 않는다.
