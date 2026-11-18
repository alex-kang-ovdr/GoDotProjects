# PlayForge × Godot — 통합 검토 문서 v1

검토일: 2026-11-17 · 문서/설계 검토 · **포팅 완료본 아님**

분야별 원문은 `docs/`, 출처는 `references/Verified_Sources.md`에 있습니다. 공식 기능과 제안 구현을 구별하고 모든 런타임 수락 시험은 미실시로 기록했습니다.


---

# 00 · 도입 판단과 의사결정 요약

**검토 기준일:** 2026-11-17 · **상태:** 설계·공식 문서 검토, Godot 런타임 실증 미실시

## 결론

**Godot를 PlayForge의 실행 엔진 후보로 검증하되, PlayForge의 웹 에디터·협업·클라우드 원본·Lua 공개 API는 유지한다.** 권장 경로는 공식 확장 API를 쓰는 GDExtension이며, 엔진 내부 파일 패치는 기본적으로 금지한다. 이것은 채택 확정이나 포팅 완료 보고가 아니다.

핵심 가치는 게임 엔진 기능 수가 아니라 온라인 공동 제작, 브라우저 무설치, AI 작업의 검증·반복 개선이다. 따라서 Renderer/Audio/Input을 직접 재작성하는 비용을 줄이는 대신, 안정 ID·명령·협업·Lua 안전 경계에 개발 역량을 집중한다.

## 기준 버전과 증거 수준

공식 배포 목록에서 2026-11-17 확인한 안정판은 **4.7.2**, 개발 채널은 **4.8 beta3**다. 검토 기준으로 안정판을 제안하며, 실제 채택에는 바이너리·소스 commit·export template 해시를 다시 고정한다. `stable`과 `latest` 문서 URL은 움직이므로 버전 고정 빌드의 실제 API와 재대조해야 한다. [G01](references/Verified_Sources.md#g01)[G24](references/Verified_Sources.md#g24)

이 문서에서 **확인**은 공식 자료가 기술한 기능, **제안**은 PlayForge 설계 판단, **미검증**은 실제 실행 결과가 없는 항목이다. 공식 API 존재가 PlayForge 구현 완료를 뜻하지 않는다.

## 우선 지킬 경계

| 유지 | 조정이 필요한 수단 |
|---|---|
| Lua 5.4 게임 코드 | Godot 기본 언어가 아니므로 안전한 바인딩을 별도 구현 |
| 범용 웹 에디터 | 전체 Godot Editor를 브라우저 UI로 복제하지 않음 |
| 안정 GUID·Prefab Override | Godot NodePath/Instance ID로 영구 ID를 대체하지 않음 |
| DX12·Vulkan 네이티브 | Godot Renderer를 사용하고 자체 RHI를 동시에 소유하지 않음 |
| 무설치 웹 PIE | Compatibility/WebGL 2의 표현 범위를 명확히 노출 |
| 단일 Authority Listen Host | 별도 로컬 Client World·Loopback을 생성하지 않음 |
| 초기 복제·충돌 준비 후 시작 | Node 생성 이벤트와 PlayReady를 분리 |
| 로컬 Mip Streaming | 안정판의 네이티브/웹 지원을 별도 채택 조건으로 유지 |

Godot 웹 Export는 현재 Compatibility/WebGL 2 경로다. WebGPU나 네이티브 Forward+와 완전히 같은 화면을 기본 지원으로 볼 수 없다. [G06](references/Verified_Sources.md#g06)[G07](references/Verified_Sources.md#g07)

## 가장 큰 제약 다섯 가지

**렌더러 제어.** RenderingDevice·Compositor는 확장 지점이지, Godot 내부 Render Graph와 전역 Draw 정렬을 전부 대체하는 플러그인 계약은 아니다. 기존 HLSL 중심 자체 RHI 설계를 그대로 보존하려면 변경 최소화 목표와 충돌한다. [G08](references/Verified_Sources.md#g08)[G09](references/Verified_Sources.md#g09)[G10](references/Verified_Sources.md#g10)

**Lua와 UGC.** 공식 기본 언어에 Lua는 없다. 별도 Lua VM을 붙일 수 있지만, 엔진 API 전체 노출·파일 접근·Native 함수 무한 실행까지 자동으로 격리되지는 않는다. [G23](references/Verified_Sources.md#g23)[G38](references/Verified_Sources.md#g38)

**다중 Room.** LibGodot의 엔진 인스턴스는 프로세스당 하나다. 여러 논리 World를 둘 수 있는 것과 각 Room이 완전히 독립적인 엔진·Tick·메모리를 갖는 것은 다르다. [G22](references/Verified_Sources.md#g22)[G15](references/Verified_Sources.md#g15)

**Texture Streaming.** 4.8 개발 과정의 Mip Streaming과 Experimental API를 안정판 제품 보증으로 계산하지 않는다. 원래 요구를 삭제하지 않고 별도 보류·승인 항목으로 둔다. [G39](references/Verified_Sources.md#g39)[G40](references/Verified_Sources.md#g40)[G41](references/Verified_Sources.md#g41)

**물리 의미 일치.** Havok/Box2D 공식 확장점은 있지만 어댑터 구현·SDK 권한·기능 일치 시험이 필요하다. Godot 기본 물리를 이름만 Havok/Box2D로 바꾸지 않는다. [G16](references/Verified_Sources.md#g16)[G17](references/Verified_Sources.md#g17)

## 추천 / 비추천

| 접근 | 판단 |
|---|---|
| PlayForge 소스 → Godot 실행 산출물 | 권장. 원본 한 곳, 생성물은 재생성 가능 |
| GDExtension으로 제한된 Lua·Runtime Bridge | 우선 검증 |
| 웹용 정적 모듈 | 공개 API로 해결 안 될 때 E2 예외 심사 |
| LibGodot를 모든 플랫폼의 필수 기반으로 사용 | 보류 |
| Godot 전체를 Unreal식 Core/ECS로 재구현 | 비권장 |
| Godot를 떼어 Renderer만 독립 엔진에 이식 | 재사용 이점이 작아 비권장 |
| 기존 JavaScript 목업을 Godot 포팅 완료로 표시 | 금지 |

## 채택 기준

1. 실제 Lua 5.4가 웹·Windows에서 같은 게임 규칙을 실행한다.
2. 두 사용자의 협업 변경을 안전하게 실행 View에 반영한다.
3. 2D와 3D 예제를 범용 UI로 편집하며 특정 게임 분기를 추가하지 않는다.
4. Dedicated/Listen·초기 복제·충돌 안전 장벽이 실제 통신에서 통과한다.
5. DX12/Android Vulkan/iOS·Linux Server의 패키지·성능·SDK 조건을 검증한다.
6. 필수 요구를 충족하지 못하면 요구 변경 승인을 받거나 Godot 채택 범위를 제한한다.

**원칙:** 협업·안전·권한은 완화하지 않는다. 표현 차이·런타임 내부 교체 범위는 명시적 제품 결정으로 조정할 수 있다.


---

# 01 · 기존 요구사항과 변경 금지 기준

**검토 기준일:** 2026-11-17 · **상태:** 설계·공식 문서 검토, Godot 런타임 실증 미실시

## 이 패키지가 보존하는 결정

기존 대화와 첨부 산출물을 기준으로 정리했다. 오래된 설계의 GitHub 필수·Rust 도입·게임 전용 에디터·런타임 CDN 다운로드를 다시 가져오지 않는다.

| 영역 | 기준 |
|---|---|
| 제품 핵심 | 실시간 온라인 협업, 무설치 웹 제작, AI 주도 재귀 개선 |
| 언어 | C++20 런타임/백엔드, Lua 5.4 게임, TypeScript 웹. Rust 제외 |
| 에디터 | Unity식 Hierarchy/Scene/Inspector/Project, 브라우저 내부 패널 |
| 게임 독립성 | Tappy Chicken은 예제 프로젝트. 전용 도구를 플랫폼에 하드코딩하지 않음 |
| UGC 로직 | Device 전용 시스템 없음. Actor/Component/Prefab/Lua 생성 |
| 플랫폼 | Windows 클라이언트/서버, Android/iOS 클라이언트 우선. Linux는 서버 중심 |
| 렌더링 | Windows DX12, Android Vulkan 우선. iOS는 검증된 네이티브 경로 |
| Material | Mobile/Desktop PBR, Toon, Debug View, Ortho/Perspective, 정렬 제어 |
| 미들웨어 | 독립 API, Havok 선택형, Box2D 2D. 지원 여부는 백엔드별 명시 |
| 협업 저장 | 서버 순차 Command, Revision, 조건부 Undo, 클라우드 Snapshot |
| GitHub | 선택 연결. 미연결 프로젝트도 저장·복원·배포 가능 |
| 공유 콘텐츠 | 구매·결제 없는 공유·검색·고정 버전 재사용 |
| 배포 아카이브 | 소스·원본·Import 설정·실행 패키지 함께 보관 |
| 스트리밍 | Cell 기반 로컬 로드, 로컬 Texture Mip Residency |
| 미지원 | Actor별 Asset Streaming, 게임 실행 중 CDN Asset 다운로드 |
| 플레이 안전 | 필수 초기 복제 + Collision + 서버 승인 후 입력/예측 활성화 |
| Listen Host | Authority World 하나와 로컬 플레이어. Host용 Client World 없음 |
| AI | 외부 AI 포함 공통 작업 기록. 2차 활용은 목적·권한·공급자 조건별 판단 |

## 요금제 / 저장 원칙

| 항목 | Free | Pro |
|---|---:|---:|
| 제작 공간, 계정 합산 | 100 MB | 1 GB |
| 소유 프로젝트 | 3개 | 제한 없음 |
| 활성 배포본 합산 | 50 MB | 100 MB |
| 플랫폼 AI | 가입 최초 1회 체험량, 수치 미정 | 주간 한도, 수치 미정 |
| 구독 가격 | 무료 | 미정 |

Godot 공통 런타임의 용량을 배포 사용량에서 제외할지는 **미확정**이다. 기술 설계가 과금 기준을 임의로 바꾸지 않는다. MB/GB의 정확한 byte convention도 출시 설정에서 명시해야 하며 이번 문서는 사용자가 지정한 표시 단위를 보존한다.

수동/주기적 버전 저장은 협업 명령의 내구성 저장과 다르다. 자동 스냅샷 옵션을 꺼도 서버가 승인한 변경 기록을 버리지 않는다. 내부 Cook 캐시와 계측 로그를 사용자 소스로 가장해 용량에 중복 차감하지 않는다.

## 확인한 기존 파일 상태

`PlayForge_Cloud_Consolidated_v17.zip`의 v16 README는 Canvas 투영 목업, 실제 C++ Reflection/Lua VM 미연동, Component 타입명 기반 식별 제한을 명시한다. 따라서 현재 전환 대상은 **이미 완성된 C++ 엔진의 바이너리 교체가 아니라, 기존 웹 프로토타입·프로젝트 규약을 실제 실행 엔진으로 연결하는 작업**이다.

`PlayForge_AI_Workflow_vNext.zip`은 정책 예제·스키마·검증 자료이며 실제 OAuth/MCP 운영 서버나 게임 엔진을 포함한 배포본이 아니다. 본 패키지에서는 기존 테스트를 재실행했다고 주장하지 않는다. 입력 ZIP의 CRC와 파일 해시만 확인했다. 정확한 식별자는 `references/input-artifacts.json`을 참조한다.

## 요구 변경은 ADR로 남긴다

가령 HLSL을 Godot Shader로 바꾸는 것은 엔진 재사용 수단의 변경이다. 반대로 Lua를 GDScript로 바꾸거나 런타임 다운로드를 추가하는 것은 사용자 요구 변경이다. 후자를 단순한 구현 편의로 승인해서는 안 된다.

각 변경안은 기존 요구, 새 의미, 사용자 영향, 실패 시 되돌리는 방법을 포함한다. 이 검토 패키지의 제안만으로 구현·채택 상태를 자동 변경하지 않는다.


---

# 02 · Godot 변경 최소화 정책과 확장 경계

**검토 기준일:** 2026-11-17 · **상태:** 설계·공식 문서 검토, Godot 런타임 실증 미실시

## 네 가지 변경 등급

| 등급 | 의미 | 기본 정책 |
|---|---|---|
| E0 | 공식 빌드·설정·리소스·프로젝트 코드·외부 웹 서비스 사용 | 허용 |
| E1 | 공개 API를 쓰는 승인된 C++ GDExtension | 기본 확장 경로 |
| E2 | 외부 디렉터리 정적 모듈·커스텀 Export Template | 별도 승인. 원본 무패치라도 빌드 책임 증가 |
| E3 | Godot core/servers/renderers 등의 내부 수정 | 기본 금지. 채택 중단 또는 예외 ADR |

**무패치와 무빌드는 다르다.** E2는 원본 엔진 파일을 덜 건드릴 수 있어도 엔진/플랫폼 템플릿을 직접 만들고 시험해야 한다. GDExtension은 공개 C ABI와 생성 API로 연결되며, 정적 모듈은 더 깊게 통합할 수 있는 대신 빌드 범위가 커진다. [G04](references/Verified_Sources.md#g04)[G05](references/Verified_Sources.md#g05)[G46](references/Verified_Sources.md#g46)

## E1의 허용 범위

Godot 객체·Resource·Server 공개 API 호출, 새 Node/Resource/ScriptLanguageExtension 등록, 허용된 물리 서버 구현, 외부 SDK 호출, 자체 배열·태그·네트워크 상태 계산은 후보가 된다. 실제 사용 API가 목표 버전에 노출되는지 `extension_api.json`과 빌드로 확인한다.

반면 내부 헤더를 직접 포함하거나, 동적 링크되지 않는 내부 함수를 강제로 연결하거나, 메모리 오프셋을 추정해 쓰는 방식은 E1이 아니다. 공개 API에서 빠진 기능을 호출하려고 디버그 기호·비공개 포인터에 의존하면 E3로 분류한다.

## E3가 필요해지기 쉬운 요구

- Godot의 전역 렌더 패스·Draw Queue·Shader Compiler를 PlayForge 정책으로 완전히 대체.
- 여러 엔진 인스턴스를 한 프로세스에서 완전 분리하여 동시에 운용.
- 모든 엔진 작업·할당·Scene 객체를 PlayForge 전용 ECS/Job/Allocator로 강제 전환.
- 지원하지 않는 브라우저 그래픽 API를 엔진 백엔드로 새로 추가.
- 엔진 내부 Import/Cook 처리 전체를 특정 스케줄러로 대체.

일부 결과는 공개 저수준 API로 별도 구현 가능하다. 그러나 **공개 API로 화면 효과를 하나 추가하는 것과, 기본 엔진 파이프라인을 완전히 치환하는 것은 다른 범위**다. [G08](references/Verified_Sources.md#g08)[G09](references/Verified_Sources.md#g09)[G20](references/Verified_Sources.md#g20)[G22](references/Verified_Sources.md#g22)

## Native 확장 공급망

일반 크리에이터는 Lua·Scene·에셋을 제출한다. 임의 DLL/so/dylib/WASM Extension을 사용자 업로드로 자동 링크하거나 실행하지 않는다. Native 확장은 플랫폼이 검토·서명·버전 고정한 집합만 사용한다.

Godot 내부 ABI를 안정된 상용 플러그인 ABI로 간주하지 않는다. `engine version + precision + extension API + toolchain + target + plugin lock`을 호환성 키로 관리한다. 공식 문서의 하위 목표 버전 호환 정책도 실제 회귀 검증을 대체하지 않는다. [G05](references/Verified_Sources.md#g05)

## 빌드 정책

Godot는 제공된 엔진 빌드 경로를 유지하고, PlayForge 모듈은 적절한 연동 빌드로 구성한다. 전체 Godot를 CMake 프로젝트로 재작성하는 일을 도입 조건에 넣지 않는다. 엔진 바이너리 재빌드와 프로젝트 Lua·에셋 반복 빌드를 분리한다.

다음 두 프로필을 먼저 비교한다.

| 프로필 | 목적 | 제한 |
|---|---|---|
| Official + E1 | 네이티브와 웹 확장으로 빠른 검증 | 웹 확장용 템플릿·격리 헤더 검사 |
| E2 Lua-static | 웹용 Lua 정적 포함 가능성 검증 | 정적 모듈이 모든 브라우저 문제를 해결한다고 가정 금지 |

어느 쪽도 실행 검증 전 운영 기본값으로 확정하지 않는다.

## 예외 승인 양식

`missing_api`, `required_behavior`, `public_api_attempt`, `affected_targets`, `upstream_diff`, `security_impact`, `upgrade_test`, `rollback`, `owner`, `expiry`를 기록한다. 단순 LOC 수보다 내부 서브시스템 변경 범위를 평가한다.

AI Agent는 예외 승인·정책·평가 기준을 바꿀 수 없다. Agent는 구현 후보와 실패 근거를 생성하고 사람이 승인한다. Godot 업스트림에 기여할 때는 제품 내부 MIT 이용 조건과 별개로 현재 기여 규칙을 따른다. [G47](references/Verified_Sources.md#g47)


---

# 03 · Runtime Bridge·Lua·객체 모델

**검토 기준일:** 2026-11-17 · **상태:** 설계·공식 문서 검토, Godot 런타임 실증 미실시

## 책임을 나누되 중복 엔진을 만들지 않는다

```text
Workspace / Project IR     ← 편집 데이터의 유일한 기준
           │ 승인된 Snapshot / Delta
           ▼
PlayForge Runtime Bridge   ← ID·권한·API·수명·명령 변환
           │ 공개 API
           ▼
Godot Runtime              ← 실행 트리·렌더·오디오·입력
           │
승인된 미들웨어 확장       ← 필요 시 Havok / Box2D / EOS
```

Bridge는 또 다른 범용 엔진 전체가 아니라 공개 기능의 좁은 계약이다. 게임에는 PlayForge Lua API를 노출하고, 구현은 가능한 한 Godot 기능을 사용한다. 문서의 API 이름은 제안 계약이며 Godot가 제공하는 PlayForge API가 아니다.

## 객체 식별자

| 식별자 | 소유 범위 | 영구 저장 |
|---|---|---|
| Actor GUID / Component GUID / Property ID | PlayForge 소스 | 가능 |
| Asset GUID + Version + Hash | 콘텐츠 버전 | 가능 |
| Godot ResourceUID | 생성된 Godot 프로젝트 | 해당 생성물과 매핑 관리 |
| Godot ObjectID / RID | 실행 프로세스 | 금지 |
| Network ID + Generation | 게임 세션 | 세션 프로토콜 전용 |

ResourceUID는 프로젝트 리소스 참조를 유지하는 기능이지 플랫폼 전역 ID가 아니다. PackedScene은 소유 노드 저장 기능이므로 `owner` 누락에 따른 저장 누락도 시험해야 한다. [G26](references/Verified_Sources.md#g26)[G27](references/Verified_Sources.md#g27)

## CDO / Prefab / Instance

PlayForge 편집 원본은 Native/Schema 기본값 → Class Defaults → Prefab/Variant → Instance Override 순서로 해석한다. Godot 실행 객체에는 해석한 값과 origin metadata를 적용한다. 런타임은 필요 없이 상속 체인 전체를 매 Tick 재해석하지 않는다.

값이 기본값과 같더라도 명시적인 Override는 남긴다. Component ID는 타입명과 분리해 같은 타입 여러 개를 구분한다. 클래스 이름·파일 경로를 바꿨다고 영구 Property ID를 다시 생성하지 않는다.

ClassDB는 엔진/GDExtension 메타데이터를 활용하는 출발점이지만 모든 script-defined class를 포괄하지 않는다. 따라서 Lua Schema와 PlayForge의 허용 속성 목록을 별도로 결합한다. 공개 가능한 최소 Schema만 생성하고 엔진 메타데이터 전체를 UGC 권한으로 간주하지 않는다. [G25](references/Verified_Sources.md#g25)

## Lua 경로

Godot 공식 언어에 Lua는 없으므로 E1 바인딩이 필요하다. 커뮤니티 `lua-gdextension`은 Lua 5.4·별도 State·라이브러리 선택의 검증 후보일 뿐 제품 채택 확정이 아니다. [G23](references/Verified_Sources.md#g23)[G38](references/Verified_Sources.md#g38)

권장 P0는 일반 Godot 객체를 무제한 조작하는 Lua보다 **LuaBehaviour + 제한 API + 안정 핸들**이다. 완전한 Lua ScriptLanguage 통합, Godot 모든 타입 자동 바인딩, 범용 디버거를 동시에 1차 요구로 잡지 않는다.

```text
Lua Move 요청
→ World/Actor 핸들 확인
→ 게임플레이 실행 권한 확인
→ 허용된 Component 명령 생성
→ Simulation 안전 시점 적용
→ 결과/오류 코드 반환
```

게임 Lua가 임의 OS·파일·동적 Native 모듈·JavaScript eval·네트워크 자격증명에 접근하지 못하게 한다. 승인된 서버 게임 로직도 Workspace 소스나 플랫폼 관리 DB에 접근하지 않는다. JavaScriptBridge는 웹 연결 수단이지만 그대로 Lua에 노출할 API는 아니다. [G37](references/Verified_Sources.md#g37)

## 상태 소유와 스레딩

| 상태 | 쓰기 주체 |
|---|---|
| 편집 Source Property | Workspace Authority |
| 실행 중 Dynamic Body | 선택된 물리 백엔드 |
| Kinematic 목표 | 권위 게임 로직 |
| 화면 보간 | 렌더 표현 상태, Gameplay에 역쓰기 금지 |
| 네트워크 Proxy | 승인된 Replication Apply |

Lua VM은 동시에 여러 스레드에서 호출하지 않는다. 순수 배열 계산은 Job으로 분리하고 SceneTree 변경은 정해진 실행 지점에 모은다. Godot의 활성 SceneTree는 일반적인 멀티스레드 수정 대상이 아니다. [G20](references/Verified_Sources.md#g20)

## Hot Reload

함수 본문 교체도 closure·coroutine·이벤트 구독이 호환될 때만 허용한다. 구조·RPC Schema·Native 타입 변경은 PIE 재시작을 기본으로 한다. 중단된 기존 coroutine을 자동으로 새 코드의 같은 줄로 이동시키지 않는다. 실패 시 이전 Snapshot으로 재시작할 수 있어야 한다.

## 타입 연결

`FName`은 필요 시 StringName에 매핑하되 내부 index를 파일·네트워크에 저장하지 않는다. `FGameplayTag`의 계층 검증은 PlayForge의 작은 레지스트리로 유지한다. `FLocText`는 key·source·format args를 보존하며 포맷 의미가 다른 경우 명시적으로 변환한다. 이름이 비슷하다는 이유로 Godot 번역 API와 ICU 메시지 문법을 동일시하지 않는다. [G33](references/Verified_Sources.md#g33)

Math는 공개 경계에서만 변환한다. 매 벡터 덧셈마다 Lua→PlayForge→Godot→Havok 왕복을 만들지 않는다. 대량 Body/Transform 요청은 일괄 처리하되 결과 동일성은 별도 시험한다.


---

# 04 · 무설치 웹 에디터·협업·MCP·재귀 개선

**검토 기준일:** 2026-11-17 · **상태:** 설계·공식 문서 검토, Godot 런타임 실증 미실시

## 에디터를 통째로 이식하지 않는다

React/TypeScript는 프로젝트 선택, Hierarchy, Inspector, Lua 편집, Snapshot, Changes, AI 작업을 담당한다. Godot Web Runtime은 Scene/Game 화면과 실제 실행을 담당한다. 데스크톱 Godot EditorPlugin UI가 브라우저의 React 패널이 되는 것은 아니다.

Godot의 JavaScriptBridge는 Web export와 호스트 JavaScript의 연결점이다. PlayForge에서는 이를 신뢰된 Bridge가 사용하는 제한된 채널로 감싼다. [G37](references/Verified_Sources.md#g37)

```text
웹 UI/AI ─── Workspace Command ─── 승인 Revision
  │                                   │
  └── Local Preview (미확정)           └── Runtime Apply
                                             │
                                      Godot Scene/Game
```

Runtime Apply는 원본 저장 성공과 다르다. Godot 반영 실패가 발생하면 Source를 조용히 되돌리는 대신 Preview를 오류 상태로 두고 확정 Snapshot으로 재구성한다.

## 협업 단순화 유지

구조화된 Scene/Prefab/Property는 서버 순차 Command와 대상별 Revision을 사용한다. Lua 텍스트만 CRDT 후보로 유지한다. Presence는 별도 TTL 정보로 처리하고 영구 파일·스냅샷에 넣지 않는다.

드래그는 로컬에서 즉시 표현하고 제한 빈도의 임시 Preview를 보내며, 확정 시 하나의 Undo Group을 기록한다. 임시 값이 CDO/Prefab 정의나 다른 사용자의 확정 변경을 덮어쓰지 않도록 세션 ID·시퀀스·기준 Revision을 검사한다.

`save`는 서버가 확정한 전체 프로젝트의 체크포인트다. 자신의 변경만 내보내는 ChangeSet 기능과 다르다. 복원은 새 Workspace epoch를 발급하며, 이전 epoch의 지연 명령을 자동 적용하지 않는다.

## 브라우저 실행 격리

Editor origin과 UGC Runtime origin을 분리한다. iframe의 sandbox/CSP/권한 정책을 실제 브라우저 조합으로 검증한다. 모든 postMessage 수신은 origin, source window, session nonce, schema, sequence를 검사한다. 임의 문자열 eval은 제공하지 않는다.

Web Extension/Thread 프로필은 교차 출처 격리 조건을 검증해야 한다. 광고·외부 스크립트·cross-origin iframe의 조합이 이를 방해할 수 있으므로 보안 헤더를 임의로 완화하는 대신 실행 프로필을 분리한다. [G06](references/Verified_Sources.md#g06)

개인 AI 자격증명·플랫폼 refresh token은 Game iframe에 넘기지 않는다. Game은 권한이 좁고 만료되는 세션 capability만 받는다.

## Scene와 Game 분리

Editor Preview는 작성 Snapshot에서 렌더 가능한 상태를 구성하며 게임 Lua는 기본 실행하지 않는다. Play를 누르면 불변 Snapshot에서 PIE 인스턴스를 만든다. 에디터 변경은 기본적으로 다음 실행에만 반영하며 Hot Apply는 허용 Property에 명시적으로 수행한다.

여러 Viewport는 화면 분할의 수단이지 서로 불신하는 UGC의 보안 경계가 아니다. 안전성이 필요한 PIE는 별도 iframe·프로세스·실행 세션으로 구분한다. Godot Viewport가 자체 World를 가질 수 있어도 모든 엔진 전역 상태가 분리되는 것은 아니다. [G15](references/Verified_Sources.md#g15)[G22](references/Verified_Sources.md#g22)

## AI 도구 계약

공통 API는 query/schema/apply_batch/validate/play/test/diff를 제공한다. 영구 GUID와 Property ID를 사용하고 Godot NodePath는 내부 진단용으로만 사용한다. 확인되지 않은 Node 타입·API는 미지원 오류를 반환한다.

AI가 `.tscn` 원본을 직접 수정하여 Workspace를 우회하거나, 사용자 프로젝트에 `.gdextension`을 업로드해 실행하는 통로를 만들지 않는다. 검증되지 않은 GDScript `@tool` 코드도 자동 실행하지 않는다.

## 재귀 개선 연결

각 실행은 Project Snapshot, Runtime Contract Hash, 테스트 Snapshot, 도구 관측 구간, 외부 사용량 근거를 기록한다. Godot 교체로 제작 시간이 줄어드는지는 같은 요구사항과 제공 자산에서 계측한다. 이전 Canvas mock과 실제 엔진 실행 시간을 단순 비교하여 우위를 주장하지 않는다.

프로젝트 수정 루프와 플랫폼 워크플로 실험을 분리한다. 후자는 플랫폼 예산을 사용하고 평가기·권한·요금·엔진 패치 정책을 Agent가 변경하지 못한다. 외부 AI의 전체 토큰을 모르면 null로 기록한다. 학습·마케팅 등 2차 활용에는 기존 목적별 권한 규칙을 그대로 적용한다.

## P0 E2E 완료 조건

서로 다른 두 브라우저에서 하나의 GUID를 편집하고, 충돌 없는 변경은 양쪽 Godot View에 반영된다. 동일 Property 충돌은 원문을 보존한다. AI 변경은 일반 Undo/Changes에 나타난다. Snapshot 복원 후 오래된 런타임 응답은 폐기된다. 브라우저 저장 캐시를 지워도 승인된 Source는 클라우드에서 복구된다.

현재 이 E2E는 **미실시**다. 문서 검증 통과와 구분한다.


---

# 05 · 렌더링·셰이더·카메라·정렬 제약

**검토 기준일:** 2026-11-17 · **상태:** 설계·공식 문서 검토, Godot 런타임 실증 미실시

## 네이티브와 웹의 계약을 따로 둔다

Godot Forward+/Mobile은 RenderingDevice 기반의 DX12/Vulkan/Metal 경로이고, 웹은 Compatibility/WebGL 2다. Godot가 지원하는 API라고 해서 모든 Renderer에서 같은 효과가 제공되는 것은 아니다. [G06](references/Verified_Sources.md#g06)[G07](references/Verified_Sources.md#g07)

| PlayForge 목표 | 변경 최소화 경로 | 제한 |
|---|---|---|
| Windows DX12 | Godot 드라이버/Renderer | 실제 GPU·드라이버 회귀 필요 |
| Android Vulkan | Godot Mobile | 모바일 성능·발열·메모리 검증 |
| iOS | 지원되는 Metal 프로필 | 서명·빌드 호스트 별도 |
| 웹 2D/3D | Compatibility | 네이티브 고급 효과와 동일성 미보장 |
| 자체 RHI/Render Graph | Godot 소유로 변경 제안 | 내부 완전 치환은 E3 위험 |
| 공통 HLSL 재질 | Material IR → Godot Shader 생성 | 임의 HLSL 소스의 완전 호환 아님 |

RenderingDevice를 이용한 독립 GPU 작업은 가능하지만 Compatibility/headless에서는 사용할 수 없다. Compositor 역시 Mobile/Forward+ 한정 확장점이다. 이를 엔진 전체 패스 순서 변경 API로 광고하지 않는다. [G08](references/Verified_Sources.md#g08)[G09](references/Verified_Sources.md#g09)

## PBR / Toon / Debug View

BaseColor·Metallic·Roughness·Normal·Emission의 공통 Material 데이터는 유지하고, 타겟별 Godot 재질로 생성한다. Godot Spatial Shader에는 PBR·Toon·Unshaded 등 관련 모드가 있지만, PlayForge의 품질 프로필과 디버그 메뉴는 별도이다. [G10](references/Verified_Sources.md#g10)[G11](references/Verified_Sources.md#g11)

| 보기 | 권장 경로 | 판정 |
|---|---|---|
| Lit / Unlit / BaseColor | 기본 재질·대체 셰이더 | E0/E1 |
| WorldNormal / Roughness / Metallic | 허용 재질의 진단 템플릿 | 지원 범위 제한 |
| Wireframe | 공식 경로+로드 전 설정 검증 | Renderer별 차이 명시 |
| Depth | 타겟별 깊이 해석 | Reverse-Z·clip convention 검사 |
| Collision / Bounds | Physics Query 기반 DebugDraw | 게임 코드 독립 |
| LOD 색상 | 선택 LOD 데이터와 오버레이 | 계측값의 출처 표시 |
| Shader Complexity | 명시적 추정 모델 | GPU 실제 비용이라고 표시 금지 |
| Quad Overdraw / 임의 GBuffer | 공개 hook 노출 확인 | 기능·Renderer별 보류 |

한 View의 진단 재질이 다른 View의 공유 Material을 수정하지 않도록 인스턴스·레이어·전용 Preview를 사용한다. 노멀 색상을 보여 주는 것과 최종 픽셀에서 사용한 모든 재질의 실제 normal buffer를 읽는 것은 다르다.

## 카메라

Camera3D는 투영 모드를 제공하지만 한 Viewport에서 활성 3D 카메라는 하나다. 여러 카메라의 Unity식 순서 합성은 SubViewport/합성 레이어로 구현하고 추가 렌더 비용을 측정한다. [G14](references/Verified_Sources.md#g14)[G15](references/Verified_Sources.md#g15)

OrthoHeight의 세로 크기 의미와 Godot `size`/aspect 설정을 연결한다. Scene 편집 카메라는 소스 게임 Camera Component와 독립 저장한다. 2D/3D 모드와 Ortho/Perspective는 같은 개념으로 묶지 않는다.

## Unity식 Sorting의 실제 지원 범위

2D는 CanvasItem의 z_index·tree order·y_sort와 Canvas 계층을 활용한다. PlayForge는 영구 SortingLayer ID를 유지하고 빌드 시 유효 순서로 변환한다. SortingGroup 내부 결속, 중첩 그룹, 음수 순서, 같은 값 tie-breaker는 별도 계약 시험을 둔다. [G12](references/Verified_Sources.md#g12)

3D Material의 `render_priority` 범위는 제한되어 있고 투명/불투명 패스 경계를 임의로 뒤집는 기능이 아니다. `next_pass`도 바로 다음 Draw를 보장하는 의미가 아니다. [G13](references/Verified_Sources.md#g13)

따라서 `RenderQueue=1000/2000/2450/3000/4000`을 입력받는 UI는 만들 수 있어도 Godot에 숫자를 그대로 넣어 Unreal/Unity와 완전히 같은 정렬을 보장하면 안 된다. P0는 Opaque/Masked/Transparent/Overlay의 허용 정책과 제한된 Priority만 제공한다. 임의 커스텀 Queue는 요구 변경 승인 없이는 구현 완료로 간주하지 않는다.

## 셰이더 언어

Godot 재질 셰이더는 GLSL 계열 언어다. HLSL을 API 이름만 변경하는 식으로 자동 변환하지 않는다. Material IR에는 의미 있는 파라미터와 feature를 저장하고 플랫폼별 템플릿을 생성한다. 커스텀 HLSL 플러그인은 별도 호환성 프로젝트로 분리한다. [G10](references/Verified_Sources.md#g10)

## 필수 비교

동일 씬·노출·색 공간에서 Web/Windows DX12/Android Vulkan 화면을 비교한다. 품질을 동일하게 강제할 부분과 지원되지 않는 부분을 리포트에 분리한다. alpha clipping, transparent overlap, outline, skinned normal, Ortho depth, camera composite를 포함한다. 고급 효과를 조용히 끄고 성공으로 표시하지 않는다.


---

# 06 · Havok·Box2D·Navigation·Animation·ECS

**검토 기준일:** 2026-11-17 · **상태:** 설계·공식 문서 검토, Godot 런타임 실증 미실시

## 물리 확장점은 존재하지만 통합은 별도 개발

Godot는 커스텀 2D/3D PhysicsServer 확장 인터페이스를 제공한다. 따라서 Havok/Box2D 연결이 원리적으로 막힌 것은 아니다. 그러나 API의 존재만으로 모든 Shape·Constraint·Query·Sleep·Collision Event가 동일하게 동작한다고 보장할 수 없다. [G16](references/Verified_Sources.md#g16)[G17](references/Verified_Sources.md#g17)

물리 서버 선택은 초기화 시점으로 제한된다. 플레이 중 Havok↔Jolt를 즉시 바꾸거나 Room마다 다른 전역 물리 서버를 선택하는 요구는 기본 매핑으로 충족하지 않는다. [G18](references/Verified_Sources.md#g18)

## 두 가지 연결안

| 안 | 장점 | 비용·주의 |
|---|---|---|
| A. PhysicsServer 확장 | Godot Body/Shape 노드와 연결 | 인터페이스 커버리지, 기능 차이, startup 고정 |
| B. 독립 C++ World + Godot 표현 | 기존 PF 미들웨어 계약을 보존하기 쉬움 | Godot Body와 중복 시뮬레이션 금지, Query/이벤트 어댑터 별도 |

A를 먼저 검토하되 Havok 고유 기능이 추상 API에 맞지 않으면 B를 별도 프로필로 시험한다. 둘을 한 객체에 동시에 켜지 않는다. 백엔드 선택과 네트워크 Schema·Cooked 데이터 해시를 Runtime Contract에 묶는다.

## 계약 시험 항목

Body/Shape 생성·파괴, 충돌 mask, Ray/Sweep/Overlap, CCD, 수면/깨움, trigger/event 순서, 질량·관성, joint local frame, 동적 teleport, 넓은 월드 좌표, 부하 시 Batch 등록을 측정한다. 허용되지 않는 기능은 명시 오류로 반환한다.

Godot 내장 Jolt도 Godot Physics와 일부 joint 의미가 다르다고 문서화한다. 이를 Havok 등 대체 엔진의 의미 동일성을 자동 추정하는 근거로 사용하지 않는다. [G19](references/Verified_Sources.md#g19)

Box2D는 별도 2D 백엔드 요구다. Godot 기본 2D 물리가 있다는 이유만으로 요구 충족 처리하지 않는다. XY 물리 단위와 2D 화면 픽셀 변환을 독립 관리하며 3D 단위·좌표 변환 코드를 그대로 재사용하지 않는다.

## Navigation

P0에서 Godot Navigation을 쓰는 대안과 Havok Navigation 요구는 구분한다. 원본 walkable geometry·agent 설정·test path를 보관해 백엔드별 데이터를 새로 생성한다. 기존 Havok cooked navmesh가 Godot에서 바로 읽힌다고 가정하지 않는다.

Godot Navigation 변경은 동기화 단계 후 유효해진다. Nav 노드를 추가하고 즉시 path query를 호출한 결과를 준비 완료로 취급하지 않는다. AI가 필요한 시작 영역은 Navigation Ready도 별도로 검사한다. [G42](references/Verified_Sources.md#g42)

Havok 고유 다중 크기 agent·동적 재빌드 의미가 중요하면 공개 Node에 강제 이식하기보다 PF Navigation Provider로 연결하는 쪽을 검토한다. 비용과 SDK 권한을 확인하기 전 지원 완료 표시를 하지 않는다.

## Animation

Godot AnimationPlayer/AnimationTree는 기본 클립·블렌딩·상태 전이 재사용 후보이다. 이것은 Havok Animation을 사용하는 것과 다르다. [G43](references/Verified_Sources.md#g43)

기존 요구를 유지하면 Havok pose evaluation → PF bone mapping → Godot Skeleton 표현 경로를 추가한다. Godot AnimationTree와 Havok이 같은 bone·Root Motion을 동시에 쓰지 않게 한다. IK와 ragdoll, 서버 gameplay pose, 압축 clip은 별도 계약으로 검증한다. root motion을 Physics에 적용하는 순서와 렌더 보간을 분리한다.

## ECS / SIMD

전체 Godot Node 체계를 Archetype ECS로 바꾸지 않는다. 대량 탄환·군중·가시성 계산은 C++ SoA/Batch로 하고 결과를 Server API/인스턴스 렌더링으로 전달한다. Godot의 저수준 Server API는 SceneTree를 우회하는 선택지를 제공하지만, 그 자체가 완성된 PlayForge Job System은 아니다. [G21](references/Verified_Sources.md#g21)

Job 입력은 불변 Snapshot 또는 소유한 배열로 제한한다. 실행 중 Node와 공유 Resource를 worker에서 임의 수정하지 않는다. Godot 스레드풀과 Havok·PF Worker가 CPU를 각각 최대치로 점유하지 않도록 프로세스 수준 병렬도 예산을 둔다. [G20](references/Verified_Sources.md#g20)

## 메모리·성능 판단

PF 모든 컨테이너를 Godot에 재구현하거나 Godot allocator를 Havok allocator로 바꾸는 것은 변경 최소화에서 제외한다. 미들웨어별 할당을 태그하고, 외부 코드에서 측정 가능한 수치를 먼저 수집한다.

1천/1만 객체, query-heavy, sleeping-heavy, constraint-heavy, animation-heavy를 분리 측정한다. Step wall time과 누적 CPU 시간은 구분한다. 성능 목표는 동일 하드웨어·compiler·physics setting으로 비교하며 비트 단위 cross-platform 결정성을 가정하지 않는다.


---

# 07 · 멀티플레이·Listen·PIE·초기 준비 장벽

**검토 기준일:** 2026-11-17 · **상태:** 설계·공식 문서 검토, Godot 런타임 실증 미실시

## 자체 네트워크 계약은 엔진 바깥에 유지 가능

Godot SceneMultiplayer는 RPC/Scene 복제를 제공하지만 프로토콜을 내부 구현으로 문서화한다. 비-Godot 서버용 영구 규약으로 사용하지 않는다. MultiplayerSynchronizer에는 Object/Resource·프로세스별 instance ID·RID 복제 제한도 있다. [G30](references/Verified_Sources.md#g30)[G31](references/Verified_Sources.md#g31)

두 경로를 비교하되 제품에서는 동일 상태에 하나만 선택한다.

| 경로 | 용도 | 주의 |
|---|---|---|
| Godot 고수준 복제 | 빠른 PoC·Godot-only 결과 검증 | 버전 고정, 별도 Ready Barrier, 향후 교체 비용 |
| PF Replication Bridge | 안정 Net ID·양자화·baseline·AOI 계약 | 직접 구현량 큼, Godot에 자동 존재하지 않음 |

Iris 소스를 이식한다는 의미가 아니라 독립적인 상태 수집·필터·양자화 설계를 구현하는 것이다. Godot는 해당 상태를 적용할 객체·표현 기반으로 사용한다.

## Listen Server 정의 보존

```text
Host Process
└── Authority Runtime / World 하나
    ├── Local Host Player + Input
    ├── Game Lua / Physics
    ├── Host Render / Audio
    └── Remote Replication → 원격 클라이언트
```

호스트에 별도 Client World나 Loopback 연결을 만들지 않는다. 입력은 서버 공통 Command 검증으로 바로 들어간다. Host UI는 상태 변경 이벤트를 사용하고 `OnRep` 실행을 기대하지 않는다. 로컬 호스트가 Native SDK 인증 인터페이스를 사용하더라도 게임 World를 일반 클라이언트로 바꾸지 않는다.

## PIE 실행과 스냅샷

Editor World와 PIE 상태는 분리한다. Dedicated PIE는 서버 1개+클라이언트 2개, Listen PIE 3인 구성은 Host 1개+Remote 2개이다. 탭은 표시 방식이지 백그라운드 정확한 tick을 보장하는 실행 격리가 아니다. 실제 부하 검증은 별도 실행 환경으로 수행한다.

브라우저 원격 클라이언트는 WebSocket/WebRTC 같은 지원 경로가 필요하다. 네이티브 UDP/ENet 패킷을 브라우저에서 그대로 보내는 것을 가정하지 않는다. 순서 보장 전송의 메시지를 일부 버리는 것이 실제 UDP 손실 환경과 같다고 표시하지 않는다. [G06](references/Verified_Sources.md#g06)

## Initial Play Barrier

필수 집합에는 Object ID+Generation, required state revision, required reference, Collision Cell ID+content hash를 기록한다. 객체 개수나 마지막 패킷 수신만으로 완료 판단하지 않는다.

```text
Connect / Auth / Contract Hash 확인
→ Required Snapshot + Cell Set
→ Object 생성 + 상태 적용 + 참조 해결
→ Collision 등록 / Query Ready
→ AppliedReady(Epoch, SnapshotId, Digest)
→ Server StartPlay 승인
→ 입력·예측·게임 규칙 활성화
```

수신 중 새 delta는 생성 상태와 순서를 보존해 적용한다. 삭제된 필수 객체는 해당 generation의 tombstone 적용으로 완료 처리한다. 버퍼 크기와 최대 대기시간을 제한하며 오버플로는 재동기화한다. 연결만 성립했다고 입력을 허용하지 않는다.

Client의 Ready 보고는 **동기화 진행 신호이지 클라이언트 무결성 증명은 아니다.** 서버 게임플레이 검증과 anti-cheat 정책을 대체하지 않는다.

## 안전한 장거리 Teleport

서버는 목적지와 주변 충돌 영역을 pin한 뒤 실제 Shape의 overlap/sweep·바닥·머리 공간을 검사한다. 등록 callback이나 `_ready()`를 Physics Query 완료로 보지 않는다. 목적지 준비 상태를 검사하는 안전 시점과 Commit 사이에 unload가 발생하지 않게 한다.

| 단계 | 서버 | 클라이언트 |
|---|---|---|
| Prepare | 목적지 pin, collision, 초기 관심 상태 전송 | 해당 로컬 Cell과 필수 복제 적용 |
| Ready | epoch·입력 자격 검사 | 준비 ACK, 이전 입력 중지 |
| Commit | 안전 위치 재검사, 새 위치·teleport epoch 확정 | Commit 상태 적용, 예측 이력 초기화 |
| Resume | 새 입력 epoch 허용 | 승인 후 입력·예측 재개 |

이 과정에서 Texture 고해상도 mip은 대기 조건이 아니다. 네트워크가 지연되면 기존 위치 유지·입력 잠금·명시적 타임아웃을 사용하고, 충돌을 꺼서 먼저 목적지로 보내는 우회는 금지한다.

## EOS 등 외부 서비스

EOS Voice/Auth/Session/EAC 요구는 별도 Provider로 유지한다. Godot 채택만으로 SDK의 브라우저·모바일·UGC 재배포 지원이 생기지 않는다. 공급자별 승인과 Native SDK 빌드를 별도 통과 조건으로 둔다. Matchmaker/Join Token은 플랫폼의 서버측 서비스이며 게임 Lua에 자격증명을 주지 않는다.

## Headless와 Room 격리

Dedicated는 headless Export Template을 사용하고 서버용 시각 리소스를 제거한다. 단순히 창만 끄고 Client 패키지를 그대로 올리는 것과는 다르다. [G32](references/Verified_Sources.md#g32)

P0 제안은 Room/신뢰경계별 프로세스다. 같은 Release의 다중 Room은 이후 성능·오염·장애 테스트를 통과한 경우만 허용한다. 하나의 GodotInstance/SceneTree에서 World별로 모든 전역 상태와 scheduling이 분리된다고 보장하지 않는다. [G22](references/Verified_Sources.md#g22)[G20](references/Verified_Sources.md#g20)


---

# 08 · World Cell·Texture Streaming·로컬 패키지

**검토 기준일:** 2026-11-17 · **상태:** 설계·공식 문서 검토, Godot 런타임 실증 미실시

## 지원 범위를 다시 고정

**지원:** Cell 단위 로컬 로드·해제, 비동기 준비, 활성화 예산, 충돌 준비 검사, 로컬 텍스처 Mip Residency.

**미지원:** Actor마다 원격 에셋을 받는 시스템, 플레이 중 CDN 에셋 다운로드, HTTP 기반 런타임 Asset Streaming. 시작 전에 게임 패키지를 설치·캐시하는 배포 작업은 이 금지와 구분한다.

## Godot로 재사용할 부분

ResourceLoader의 background request/status/get을 Cell 패키지 읽기에 사용할 수 있다. 그러나 get을 준비 전에 호출하면 블로킹될 수 있으므로 스케줄러가 완료 여부를 확인해야 한다. Resource 로드, Node 활성화, Physics 등록은 서로 다른 준비 단계다. [G29](references/Verified_Sources.md#g29)

```text
Cell Manifest
→ Local Read / Parse
→ Prepared (실행 트리 미등록)
→ Activation Budget
→ Physics 등록·동기화 확인
→ CollisionReady
→ GameplayReady
```

PlayForge는 고정 Grid·고유 Home Cell·Global Cell·Runtime 이동 객체 구분을 유지한다. ResourceLoader 자체가 World Partition 정책이나 저장 상태 복구를 제공한다고 보지 않는다.

## Cell 데이터 구성

각 Cell은 명시적으로 포함된 Actor 기록과 필요한 로컬 리소스 목록을 가진다. 빌드 시점에 버전과 완전성을 검증하고, 실행 중 임의 의존 그래프를 재귀 탐색하여 누락된 인터넷 파일을 받지 않는다.

동일 Asset은 리소스 캐시에서 공유할 수 있지만 mutable Material/Animation 상태를 Room/Instance 사이에 공유하지 않는다. Cell unload는 참조 수를 낮추는 것이며 다른 Cell의 리소스까지 파괴하는 명령이 아니다.

## Mip Streaming은 채택 차단 가능 항목

4.8 개발 노트에 Mip Streaming이 등장하고 latest API는 Experimental로 표시되어 있다. 4.7.2 기준 안정성·모든 GPU 지원을 이미 확보한 것으로 계산하지 않는다. [G39](references/Verified_Sources.md#g39)[G40](references/Verified_Sources.md#g40)[G41](references/Verified_Sources.md#g41)

| 선택 | 본체 변경 | 원래 요구 충족 판단 |
|---|---|---|
| 안정판 + 일반 Mipmap | 낮음 | **Mip Residency 요구 충족 아님** |
| 해상도별 전체 Texture 교체 | E0/E1 가능성 | I/O·GPU peak·동작 차이를 측정하고 별도 승인 |
| 4.8 시험 프로필 | 낮은 자체 패치 | prerelease 위험과 타겟 지원 검증 필요 |
| 내부 Residency 백포트 | E3 가능성 높음 | 변경 최소화와 충돌, 기본 비권장 |

일반 Mip Bias나 낮은 해상도 샘플링만으로 VRAM이 반환됐다고 판단하지 않는다. 낮은 Mip 자원으로 교체하는 대안은 실제 최고 메모리와 fence 이후 반환을 측정해야 한다.

## 예산과 적용 책임

Wanted/Resident FirstMip, CPU staging, GPU resident, pending upload, retired-but-in-flight bytes를 나누어 측정한다. 수치가 추정인지 드라이버/엔진이 제공한 측정인지 표시한다. UI 텍스처, 필수 placeholder, gameplay collision 데이터는 각각 다른 생명주기다.

고해상도 Texture 대기는 PlayReady/Teleport 조건이 아니다. 충돌 안전 조건을 기다리는 동안 화면은 low-res 또는 placeholder일 수 있지만, CollisionReady를 렌더링 ready와 혼용하지 않는다.

## 로드 중 취소·상태 변경

요청에는 WorldEpoch와 generation을 붙인다. 이전 PIE의 늦은 I/O 완료가 새 World에 적용되지 않도록 한다. 취소 시 공유 완료 리소스까지 무조건 버리지 않고 해당 요청의 소비만 중단한다. 안전 위치 계산부터 Teleport Commit까지 목적지 Cell pin을 유지한다.

## 성능 시험

카메라 정지, 경계 왕복, 고속 이동, 장거리 Teleport, 메모리 압박, texture 공유, 최소 기기 프로필을 시험한다. 정지 후 중복 요청이 계속 발생하는지, unload hysteresis가 실제 I/O를 줄이는지, 활성화·Physics 등록이 프레임 spike를 만드는지 별도로 기록한다.

Godot 선택을 이유로 Texture Streaming을 조용히 P2로 밀거나 CDN 다운로드로 대체하지 않는다. 요구를 만족하지 못하면 **요구 변경 승인 또는 해당 프로필 출시 보류**가 올바른 결과다.


---

# 09 · Import·증분 Cook·빌드·배포

**검토 기준일:** 2026-11-17 · **상태:** 설계·공식 문서 검토, Godot 런타임 실증 미실시

## 책임 경계

Godot Import/Export를 재사용하지만, 브라우저 런타임에 데스크톱 Importer 전체를 넣는 것을 요구하지 않는다. 웹에서는 썸네일·가벼운 preview·옵션 편집을 하고 신뢰 가능한 최종 처리는 격리된 클라우드 Build Worker가 담당한다.

Godot는 원본에 대한 Import 설정과 파생 데이터를 관리하며 `.godot/imported`에 결과를 둔다. 원본·설정·엔진 버전은 재현 입력이고 캐시는 삭제 후 재생성 가능한 결과다. [G28](references/Verified_Sources.md#g28)

```text
원본 업로드 / 공유 패키지 고정
→ 형식·권한·해시 검증
→ Canonical 입력·Import 설정
→ 격리된 Godot Import Worker
→ Preview/Target 파생 결과
→ Export Template + 게임 데이터
→ Release Source Bundle + 실행 패키지
```

## 증분 처리

TaskKey는 source hash, 적용 설정 hash, 실제 입력 목록, 엔진/플러그인/Importer 버전, target, renderer, precision으로 만든다. 작업에 영향 없는 입력을 넣어 무조건 cache miss를 만들지 않는다.

| 변경 | 최소 재처리 제안 |
|---|---|
| Actor Transform | Scene/Cell 생성 데이터 |
| Lua 함수 | 스크립트 검증·번들·허용된 재시작 |
| Texture 원본 | 해당 Import와 타겟 Texture |
| Material scalar | 파라미터·Scene/Material 데이터 |
| Shading model | 생성 Shader·관련 pipeline 준비 |
| Collider source | 해당 물리 Cook와 Cell 메타데이터 |
| 엔진/Plugin ABI | 관련 실행 모듈·파생 캐시·회귀 시험 |

이 표는 목표다. Godot Importer가 공개하는 세분성보다 더 미세한 invalidation을 약속하지 않는다. 같은 Input에서 clean build와 incremental build의 의미적 일치를 비교한다. 버전·환경 차이로 바뀐 파생 결과를 낡은 캐시에 붙이지 않는다.

## 파일 포함·경로 규칙

PlayForge Source를 generated Godot project로 투영한다. `.lua`, 자체 JSON/loc 데이터 등 비표준 리소스는 export 결과의 포함 목록을 검증한다. Runtime에서 실제 파일이 없는데 에디터 로컬 파일 덕분에 성공하는 상황을 테스트로 잡는다.

생성 파일의 경로보다 GUID 매핑을 우선한다. `.import` 설정과 리소스 UID가 재생성될 때 기존 Source identity를 바꾸지 않는다. 생성 산출물을 Creator의 소스 원본처럼 양방향 편집하지 않는다.

## 타겟 빌드

| 타겟 | 기본 검증 |
|---|---|
| Windows Client/Listen | DX12, 대체 Vulkan을 별도 결과로 기록 |
| Android Client | ARM64/Vulkan, 터치·발열·메모리 |
| iOS Client | macOS/Xcode 빌드와 서명, 네이티브 실행 |
| Windows/Linux Dedicated | headless·불필요한 시각 데이터 제거 |
| Web PIE | WASM·Compatibility·Lua·보안 헤더 |

iOS export는 macOS와 Xcode가 필요한 공식 경로다. 제작자가 로컬 SDK를 설치하지 않아도 된다는 제품 요구는 서버 빌드 호스트의 SDK 요구까지 없앤다는 뜻이 아니다. [G45](references/Verified_Sources.md#g45)

## Export Template과 공통 런타임

최초 설치·시작에 필요한 파일을 준비한 뒤 게임 실행을 시작한다. 공용 런타임을 캐시하는 경우에도 게임 릴리스가 요구하는 정확한 템플릿 버전을 확인한다. 캐시가 사라지거나 부족하면 PlayReady 전에 복구·오류를 처리한다.

Free 50 MB/Pro 100 MB 배포 한도에서 실제 템플릿 포함 크기를 측정한다. 압축 전 설치량·전송량·과금 집계량을 구분하며, 공통 엔진 용량 제외를 무단으로 정책화하지 않는다.

## Release 보관

배포 소스 Snapshot, 원본 에셋, 외부 패키지 고정 버전, Import 설정, Godot 생성 프로젝트, 엔진/템플릿/SDK lock, 테스트·라이선스 보고서, 플랫폼 실행 패키지를 연결한다. 비밀키·서명 인증서·SDK 재배포 금지 파일은 Source Bundle에 복사하지 않는다.

GitHub 미연결이면 Snapshot ID와 Release ID로 식별한다. 연동을 선택한 배포만 commit/tag를 연결한다. 공개 Release는 불변이고 rollback은 이전 검증된 Release로 전환하며 Save Schema의 읽기 호환성을 별도 검사한다.

## 패키징 정확성

단순히 전체 PCK를 비교하는 것만으로 증분 효율을 판단하지 않는다. Import 재실행 수, cache miss 이유, 파일 포함·제외, 시작 전 준비 시간, Native relink 횟수를 기록한다. Godot가 파생 리소스 의존성을 해석할 수 있으므로 '모든 내부 그래프가 완전히 사라진다'고 주장하지 않는다. [G28](references/Verified_Sources.md#g28)


---

# 10 · 기존 산출물 마이그레이션과 좌표·단위

**검토 기준일:** 2026-11-17 · **상태:** 설계·공식 문서 검토, Godot 런타임 실증 미실시

## 현재 전환 출발점

기존 v17 안의 v16 README와 Tappy Chicken project.json은 **브라우저 JavaScript 게임·Canvas 에디터이며 실제 Lua VM이 없다는 점**을 명시한다. 따라서 완성된 네이티브 엔진을 동일 API로 갈아끼우는 일정으로 추정하지 않는다.

Tappy 예제 Scene은 viewport 480×640, position [135, 290] 같은 값을 가지며, 설정에는 gravity 1050·flap 345가 있다. 이런 값은 별도 단위 주석 없이 1 unit=1m로 재해석하면 안 된다. 초기 마이그레이션은 pixel-domain 동작을 보존하고 PPU가 명시된 후 물리 단위 변환을 적용한다.

입력 ZIP은 본 패키지에서 읽었지만 게임 실행·시각 비교·Lua 의미 일치를 검증하지 않았다.

## 1단계: 원본 동결과 이력

원본 ZIP 해시, 선택 프로젝트 Snapshot, 기존 schemaVersion을 보관한다. 파괴적 변환은 하지 않는다. ConversionJob은 새 Snapshot을 생성하고 이전 원본은 유지한다. 재실행은 같은 매핑·입력에 대해 중복 객체를 생성하지 않아야 한다.

## 2단계: 안정 식별자 배정

타입명으로만 Component를 구분하는 레거시를 영구 GUID로 이행한다. 최초 1회 old record→new GUID 매핑을 저장하고, 이후 Rename/Reparent에서 다시 계산하지 않는다. 고유 ID는 경로 hash에만 의존하지 않는다.

| 원본 | 새 기준 | Godot 출력 |
|---|---|---|
| actor.id | 안정 Actor GUID | Node metadata·Bridge map |
| component 타입명 | Component GUID + Type ID | Node/Resource 또는 PF record |
| Property 경로 | 명시적 Property ID | 허용된 Godot property/binding |
| Asset 경로 | Asset GUID + Version | ResourceUID/생성 경로 |
| Prefab 연결 | Prefab GUID + source object ID | 해석된 Scene·origin metadata |

Godot의 UID는 프로젝트 리소스 범위다. ObjectID/RID를 저장·복원할 원본 ID로 사용하지 않는다. [G27](references/Verified_Sources.md#g27)

## 3단계: Override 보존

Class/Prefab/Variant/Instance의 명시적 override와 component add/remove tombstone을 유지한다. 값을 비교해서 override를 새로 추정하지 않는다. inherited field, explicit same-value override, component 순서, 중복 타입, nested prefab를 시험한다.

PackedScene `owner`가 빠져 저장에서 제외되는 노드를 검사한다. Node의 parent와 저장 ownership이 같은 개념이라고 가정하지 않는다. [G26](references/Verified_Sources.md#g26)

## 4단계: 3D 좌표 변환

기존 PlayForge 표준은 +Y up, +Z forward, Unity식 handedness, 미터 단위다. Godot는 오른손 Y-up 공간을 사용한다. 카메라의 앞 방향과 임포트 모델의 semantic forward는 별도 메타데이터로 관리한다. [G48](references/Verified_Sources.md#g48)[G14](references/Verified_Sources.md#g14)

**제안 규약:** PF 좌표를 Godot 좌표로 보낼 때 `B = diag(1,1,-1)`의 basis 변환을 한 경계에서 적용한다. column-vector convention이라면 다음 형태를 사용한다.

```text
p_g = B · p_pf
R_g = B · R_pf · inverse(B)
T_g = B4 · T_pf · inverse(B4)
```

이는 본 프로젝트의 선택한 규약을 설명하는 수학적 계약이다. Quaternion 원소를 추측해 부호 변경하는 shortcut보다 행렬 변환과 canonical test를 우선한다. 실제 구현의 row/column·활성/수동 회전 convention과 일치하는지 검증한다.

반사를 포함하므로 mesh winding, tangent handedness, inverse bind, root motion, inertia·joint frame을 함께 검증한다. angular velocity·torque 같은 axial vector는 위치 벡터와 동일한 부호 공식으로 처리하지 않고 선택한 회전 convention에서 유도·시험한다.

Blender → glTF 단계에서 이미 정규화된 에셋에 Blender Z-up 변환을 다시 적용하지 않는다. 원본 파일의 의미와 Import adapter 책임을 기록한다.

## 5단계: 2D 좌표 분리

Canvas 픽셀·위쪽/아래쪽 Y, Box2D XY 미터, UI anchor를 한 행렬로 섞지 않는다. `pixelsPerMeter`, 원점, Y 방향, angle sign을 프로젝트 또는 컴포넌트에 명시한다. 3D 모델의 +Z 변환을 2D Sprite에 일괄 적용하지 않는다.

## 6단계: Lua 의미 보존

Game.lua가 참조 구현인지 실제 실행 API인지 분류한다. 없는 API를 임의 보완해 성공으로 표시하지 않는다. lifecycle, fixed dt, timer, input edge, RNG seed, collision ordering을 계약 시험으로 고정한다. 화면/입력은 TS이고 게임 규칙은 Lua라는 원칙을 유지한다.

## 7단계: 원본 에셋 재임포트

기존 cooked shape/animation/navmesh를 이식 가능한 범용 소스로 취급하지 않는다. 원본과 설정에서 타겟별로 재생성한다. Physics/Animation backend 변경은 동일한 기능 API만으로 완전한 수치 일치를 보장하지 않으므로 허용 오차·게임 규칙을 별도 검증한다.

## 업그레이드·복구

엔진 후보가 실패하면 이전 Release와 생성물을 유지한다. 새로운 Source Schema를 이전 엔진이 읽지 못하는 경우 이전 Source Snapshot도 함께 복구한다. 운영 플레이어 저장 데이터는 별도 migration/backward-read 절차가 필요하다. 포맷 버전만 낮춰 강제로 로드하지 않는다.

`examples/migration-map.example.json`은 계약 예시이지 실행된 변환 결과가 아니다.


---

# 11 · INI·Console·Device Profile·진단·지역화

**검토 기준일:** 2026-11-17 · **상태:** 설계·공식 문서 검토, Godot 런타임 실증 미실시

## 표면 API 유지, 구현은 얇게 매핑

PlayForge의 Unreal식 INI/CVar/Console은 사용자 경험으로 유지할 수 있다. 다만 Godot ConfigFile은 INI형 저장 도우미이고 ProjectSettings는 설정 저장소이므로, Unreal식 배열 병합·Source priority·Cheat flag·runtime 적용 규칙은 PlayForge가 정의한다. [G34](references/Verified_Sources.md#g34)[G35](references/Verified_Sources.md#g35)

하나의 registry에 이름, 타입, 기본값, 허용 범위, 권한, target, apply mode, backend mapping을 둔다. 지원하지 않는 `r.*` 이름을 등록만 해 놓고 효과가 있는 것처럼 표시하지 않는다.

## 설정 분리

| 설정 | 성격 | 처리 |
|---|---|---|
| Renderer/API 선택 | 시작 시 | startup profile·재시작 |
| Physics backend | 시작 시 | target contract·재시작 |
| Device Profile 기본값 | 초기 설정 | capability와 병합 |
| 해상도·안전한 품질 값 | 런타임 | 공개 setter·안전 시점 |
| Cell size | 소스/Cook | 재생성 필요 |
| streaming 거리 | 런타임 정책 | 불변식 검증 후 적용 |
| CVar debug overlay | 실행 View | 개발 권한 |

물리 서버는 runtime 교체가 허용되지 않는다. `ConfigFile`에 새 값을 쓰는 것만으로 이미 초기화된 서브시스템이 변경되지 않는다. [G18](references/Verified_Sources.md#g18)[G34](references/Verified_Sources.md#g34)

## Scalability

Mobile/Desktop은 물리적으로 다른 게임 스키마가 아니라 성능·표현 프로필이다. Godot renderer/feature 태그와 연결하되 품질 값으로 사용할 수 없는 기능을 강제로 활성화하지 않는다. [G36](references/Verified_Sources.md#g36)

적용 결과는 requested/effective/source/restart_required를 구분해 Inspector와 콘솔에 표시한다. Device Profile은 기본값과 하드웨어 제한을 분리한다. 권한이 높은 Console도 지원하지 않는 기능이나 안전 한도를 우회하지 못한다.

## Console과 프로파일러

명령은 로컬 View, Runtime, Authority Server, Workspace를 명시적으로 선택한다. 게임 Lua에 문자열 `ExecuteConsole`을 무제한 노출하지 않는다. 외부 AI도 동일한 명령 권한을 따른다.

기본 지표는 Scene 생성 시간, Lua 실행, 물리 Step, Replication, Render frame, 메모리, 패키지 I/O다. 엔진 내부 단계가 공개되지 않으면 어댑터 구간만 측정하고 'Havok Solver 내부 시간'처럼 이름을 붙이지 않는다. `headless`와 GPU 측정 환경은 별도다.

Log는 category/verbosity, world/session/request ID, source location, redaction 정책을 유지한다. 멀티 Room 로그를 user-visible game log와 플랫폼 보안 로그로 분리한다. optional 상세 profiling은 실행 비용을 함께 기록한다.

## FName / GameplayTag

StringName은 interned string이므로 FName의 구현 후보지만 process-local 식별값을 저장 포맷이나 네트워크 dictionary로 내보내지 않는다. [G33](references/Verified_Sources.md#g33)

GameplayTag는 문자열 이름만 있는 Resource가 아니라 검증된 계층 ID·부모 관계·정확/상위 매칭 규약을 가진 PF 데이터로 유지한다. Content SEO tag와 공유하지 않는다. runtime dictionary hash를 handshake에 포함하고 동일 ID의 의미 변경을 금지한다.

## FLocText / AI 번역

namespace/key/source/typed arguments를 프로젝트 원본에 보관한다. Godot 표시 문자열로 변환한 값을 영구 원문으로 덮어쓰지 않는다. 표시 언어 변경은 UI 갱신 이벤트로 연결하고 게임 상태·RPC ID는 언어와 분리한다.

ICU plural/select·날짜·숫자 문법을 채택했다면 그 의미를 유지하는 formatter를 함께 검증한다. Godot 기본 번역 기능이 같은 메시지 문법을 자동 이해한다고 가정하지 않는다. 사람 검토 번역 보호, 원문 변경 stale 표시, locale별 재Cook 원칙은 그대로다.

## 에디터 UI

Project Settings, Runtime Console, Device Profile, Material Quality를 별도 새 시스템으로 만들지 않고 공통 Schema·Property View를 사용한다. 특정 게임의 중력·난이도·점수는 프로젝트가 제공하는 값이며 플랫폼 UI에 이름을 넣지 않는다.

**완료 기준:** 실제 engine mapping 없는 설정은 미지원/계획 상태로 보이고, 적용됐다는 거짓 성공 응답을 반환하지 않는다.


---

# 12 · 라이선스·UGC 보안·AI 운영

**검토 기준일:** 2026-11-17 · **상태:** 설계·공식 문서 검토, Godot 런타임 실증 미실시

## Godot 이용과 외부 권한을 분리

Godot는 MIT로 상업적 이용·수정·재배포를 허용하며 재배포 시 저작권·라이선스 고지가 필요하다. 자체 게임·플랫폼을 같은 라이선스로 공개해야 하는 조건은 아니다. 단, 포함 서드파티는 각자의 고지도 검토해야 한다. [G02](references/Verified_Sources.md#g02)[G03](references/Verified_Sources.md#g03)

따라서 PlayForge Pro 구독과 클라우드 제작 도구를 만든다는 이유만으로 Godot 엔진 사용료가 자동 발생하는 구조는 아니다. 하지만 **MIT = Havok·EOS·모델·음원·폰트·콘솔 SDK까지 자유 이용**은 아니다.

| 영역 | 출시 전 확인 |
|---|---|
| Godot/선택된 모듈 | 고정 버전의 LICENSE·COPYRIGHT·빌드 포함 목록 |
| Lua 확장 | 라이선스, 실제 종속성, 유지보수 책임 |
| Havok | 계약된 제품·플랫폼·Cloud Cook·UGC 재배포·보관 범위 |
| EOS | 서비스·SDK·실행 타겟·사용자 식별/안티치트 조건 |
| 공유 에셋 | 다운로드·수정·비공개 아카이브·재배포·AI 활용 권한 |
| AI 공급자 | 연결 경로·기록·워크플로 개선·모델 학습·마케팅의 허용 범위 |
| 콘솔 | 개발자 승인·SDK·DevKit·서명·인증·재배포 조건 |

콘솔은 공개 Godot Export Template만으로 끝나지 않는다. 승인된 개발자와 공식 SDK, 자체/서드파티 포팅 경로가 필요하다. [G44](references/Verified_Sources.md#g44)

이 문서는 기술·제품 검토이며 계약 해석의 법률 자문이 아니다. 특히 비공개 SDK 권한은 공개 웹 문서로 확정하지 않는다.

## UGC 위협 모델

공격 입력은 Lua뿐 아니라 Scene/Resource, 압축파일, 이미지·모델·오디오 파서, Shader, Import 설정, 외부 AI가 만든 변경이다. 게임 엔진을 재사용한다고 멀티테넌트 보안 경계가 자동 제공되지는 않는다.

### 클라우드 Worker

불신 원본은 권한 없는 격리 프로세스에서 처리한다. 파일 확장자만 믿지 않고 signature·압축 해제 크기·경로 탈출·참조 외부 URL·리소스 개수·실행 시간을 검사한다. 필요한 파일만 마운트하고 플랫폼 DB·GitHub token·서명키 접근을 주지 않는다.

### Native Runtime

일반 크리에이터의 Native 확장 업로드는 금지한다. 허용된 Lua API, 메모리 allocator 예산, instruction/wall-time budget, Native 호출 watchdog, 프로세스 제한을 함께 사용한다. Lua hook만으로 긴 C++ 호출을 강제 중단할 수 있다고 약속하지 않는다.

### 웹 Runtime

에디터와 게임 실행 origin을 나누고 브라우저 저장·인증 토큰 접근을 최소화한다. postMessage는 타입·대상·세션·크기를 검사한다. Godot JavaScriptBridge의 광범위 기능을 UGC에 노출하지 않고 필요한 호출만 신뢰된 어댑터가 사용한다. [G37](references/Verified_Sources.md#g37)

### 온라인

클라이언트 입력은 서버에서 재검증한다. Ready ACK, 로컬 테스트 통과, 외부 AI의 검증 주장 등은 게임플레이 권한이나 무결성 증명으로 사용하지 않는다. EAC 지원 타겟 여부와 Lua sandbox는 서로 대체 관계가 아니다.

## 데이터 수집과 AI 개선

작업 실행 기록·프로젝트 보관·워크플로 개선·모델 학습·마케팅의 목적을 구분한다. external MCP 작업도 같은 명령 이력을 쓰되 전체 외부 대화를 수집할 수 있다고 가정하지 않는다. 미확인 token은 null로 보존한다.

개인 구독은 해당 사용자의 승인 작업에만 사용하고, 플랫폼 공통 벤치마크와 데이터 학습 작업은 플랫폼 예산으로 수행한다. 최신 공급자 계약과 동의 상태를 실행·추출·재사용 시점에 검사하도록 제안한다. 본 패키지는 개별 공급자 연결 승인 또는 데이터 학습 허가를 발급하지 않는다.

Godot 업스트림 기여 규칙에는 AI 자동 PR 및 상당한 코드 생성 등에 대한 제한이 있다. 이는 MIT 제품 이용과 다른 경계다. PlayForge Agent가 Godot 본 프로젝트에 자동 제출하거나 최신 기여 조건을 무시하지 않는다. [G47](references/Verified_Sources.md#g47)

## 안전 실패 정책

미지원 클래스·API·Shader feature는 명시적으로 거부한다. 엔진 import 오류를 무시하고 빈 객체로 배포하지 않는다. source 권한 거부는 runtime 게임 플레이와 분리하고, 선택적 개선 분석 실패는 승인된 작업 저장을 손상시키지 않는다.

**통과 기준:** sandbox 탈출 시험, tenant 간 파일·token 접근 시험, 악성 패키지·과도한 메모리·무한 실행의 격리 시험을 공개 배포 전에 통과한다. 본 문서에서 이 시험을 실제로 통과했다고 주장하지 않는다.


---

# 13 · 운영·서버 리소스·패키지·요금제 영향

**검토 기준일:** 2026-11-17 · **상태:** 설계·공식 문서 검토, Godot 런타임 실증 미실시

## 재사용으로 줄어드는 개발 비용과 실행 원가는 별개

Godot의 라이선스 비용과 운영 CPU/RAM/스토리지/AI 비용은 분리해서 판단한다. 엔진 도입 후 서버 밀도가 이전 자체 엔진의 가정과 같아질 것이라고 계산하지 않는다.

| 실행 | 로컬 자원 | 서버 작업 |
|---|---|---|
| 일반 웹 편집 | UI·Scene/Godot Web preview | 협업 명령·내구성·권한 |
| Local PIE | Lua·Physics·Renderer | Snapshot 제공·선택적 검증 |
| Listen PIE | Host Authority·표현 | 인증·매칭·필요 시 연결 중계 |
| Dedicated PIE | 각 Client 표현 | 시험 서버 World·복제 |
| 자동 시각 테스트 | 테스트 브라우저 CPU/GPU | Worker 실행·아티팩트 수집 |
| 공개 Dedicated | Client 예측·화면 | 실제 Authority·저장·복제 |

브라우저 Listen은 네이티브 리슨과 같은 소켓 환경이 아니다. 브라우저 지원 전송과 연결 정책을 별도 검증한다. [G06](references/Verified_Sources.md#g06)

## P0 프로세스 정책

LibGodot를 필수로 사용하지 않고 Export Template 기반 Dedicated 프로세스로 시작한다. headless 서버는 편집기 바이너리와 불필요한 Client Resource를 제외한다. [G32](references/Verified_Sources.md#g32)

처음에는 한 Room 또는 한 신뢰 경계별 프로세스를 사용한다. 이후 동일 Release의 여러 Room을 묶을 때 전역 설정·Autoload·Resource cache·물리 서버·Lua VM 간 오염을 검증한다. 비용 절감 수치 없이 밀도를 먼저 고정하지 않는다. [G22](references/Verified_Sources.md#g22)[G20](references/Verified_Sources.md#g20)

## 측정 단위

프로세스 CPU 시간/RSS/네트워크는 직접 측정값, World별 메모리는 attributed estimate일 수 있다. 공유 리소스를 각 World에 중복 합산하지 않는다. CPU tick wall time과 모든 worker의 누적 CPU time을 나누어 기록한다.

```text
동시 세션 수 = 지역·게임·모드별 실제 점유를 반영해 집계
평균 CPU 수요 = 관측 누적 CPU seconds / 관측 wall seconds
배치 가능 Room 수 = CPU·RAM·Tick 지연·격리 조건 중 가장 작은 한도
총 자원 = 활성 Room + 프로세스 고정 비용 + 예비·관리 오버헤드
```

평균 CPU만으로 용량을 확정하지 않고 P95/P99 tick, initial replication burst, spawn/cell activation, 재접속 폭주를 포함한다. 대기열 과부하 시 시험 Pool을 줄이되 공개 게임 서버를 잠식하지 않는다.

## 패키지 용량 실험

빈 프로젝트, 2D Lua 예제, 3D 예제 각각에 대해 다음을 기록한다.

| 지표 | 의미 |
|---|---|
| template_bytes | 엔진 공통 실행 파일·WASM |
| content_bytes | 게임 전용 cooked resource·Lua |
| transfer_bytes | 압축 전송 크기 |
| install_bytes | 설치 후 디스크 크기 |
| source_archive_bytes | 원본·Import 설정·필요 파일 |
| billed_bytes | 승인된 상품 집계 규칙 결과 |

Godot 바이너리를 어느 방법으로 배포하느냐에 따라 과금 기준을 자동 바꾸지 않는다. Free 배포 50 MB·Pro 100 MB를 만족하지 못하면 모듈 제거·재사용·정책 변경 제안을 각각 구분한다. 측정 전 크기 수치를 만들지 않는다.

## 클라우드 저장

Free 제작 100 MB/3개, Pro 제작 1 GB/개수 제한 없음은 계정 소유 프로젝트 합산이다. 동일 파일 버전은 스냅샷마다 중복 차감하지 않고, 자동 저장 설정과 협업 명령의 내구성은 분리한다. Godot imported cache는 원본이 아니며 재생성 가능한 시스템 캐시로 관리한다.

Source Bundle에 필요한 원본과 외부 패키지는 버전 고정한다. 공유 Registry에서 미사용 버전을 정리하더라도 보존 중인 Release의 재구성 입력을 지우지 않는다. 과거 코드·에셋을 AI 분석 로그로 중복 장기 보존하지 않는다.

## 플랫폼 AI 비용

Free 체험권과 Pro 주간 AI 수치는 미정이다. Godot 도입 효과 평가에서 모델 호출 시간, 도구 왕복, import/cook, PIE 시작, 서버 CPU·네트워크를 모두 기록한다. 더 빠른 렌더러 때문에 도구 호출 수가 자동 감소했다고 추정하지 않는다.

## 운영 통과 조건

동일 snapshot을 Local PIE·Dedicated PIE·공개 runtime에서 실행해 기능 일치를 확인한다. 각 프로필의 실패가 다른 프로젝트의 작업 저장을 손상시키지 않아야 한다. 라이선스·보안 검증 없는 캐시 산출물을 다른 tenant가 재사용하지 못하게 한다.


---

# 14 · 단계별 PoC·완료 기준·중단 기준

**검토 기준일:** 2026-11-17 · **상태:** 설계·공식 문서 검토, Godot 런타임 실증 미실시

## 일정 대신 증거 게이트

팀 인원·기존 C++ 코드·Havok 계약·브라우저 요구 수준이 확정되지 않았으므로 보장 가능한 주 단위 개발 일정을 제시하지 않는다. 각 게이트의 실제 작업량·실패 원인을 측정하고 다음 단계의 범위를 산정한다.

| Gate | 결과물 | 반드시 확인 |
|---|---|---|
| GATE-0 | 버전·API·라이선스 lock | 원본 patch 0, target·확장 경로 |
| GATE-1 | Lua 5.4 Web/Windows 샘플 | 게임 규칙 중복 JS 구현 없음 |
| GATE-2 | 범용 웹 Scene/Inspector 연결 | GUID·Prefab·Override·2D/3D |
| GATE-3 | 실제 두 사용자+AI 협업 | 조건부 Undo·충돌·스냅샷·복원 |
| GATE-4 | Dedicated+2 Client / Listen | 초기 상태·Teleport 충돌 장벽 |
| GATE-5 | DX12/Vulkan/iOS/서버 패키지 | 셰이더·서명·메모리·배포 용량 |
| GATE-6 | Streaming/미들웨어/보안 검증 | Mip residency·Havok/Box2D·UGC 격리 |
| GATE-7 | 엔진 업그레이드와 AI 비교 | rollback·회귀·동등 과제 측정 |

이 게이트들은 병렬 연구가 가능하지만, 실패한 필수 조건을 완료로 바꾸고 다음 단계에 합치지 않는다.

## 최초 수직 시나리오

빈 프로젝트 → 일반 Actor/Component → Lua 게임 구현 → Web PIE → 두 사용자의 동시 편집 → AI Batch 변경 → 검증 실패 → 수정 → Snapshot 저장 → Native/Server Export.

Tappy Chicken은 작은 2D 입력·규칙 시험에 사용한다. 3D 테스트는 카메라·Mesh·Material·collider·animation을 별도 프로젝트로 만든다. 특정 예제의 속성 이름을 플랫폼 코드에서 찾는 자동 검사를 추가한다.

## 필수 실기기 매트릭스

Windows DX12 + Windows Vulkan, Android ARM64 Vulkan, iOS Native, Windows/Linux headless, Chromium Web, Firefox Web, Safari Web을 구분한다. 하드웨어·OS·브라우저·GPU driver·engine hash·build flags를 결과에 기록한다. 웹 프레임 성능으로 모바일 네이티브 성능을 대신하지 않는다.

iOS export는 macOS/Xcode 환경이 필요하며, 제작자 무설치 기능은 관리되는 클라우드 빌드로 제공한다. [G45](references/Verified_Sources.md#g45)

## 정확성 우선 항목

- source revision과 실행 snapshot 연결, 편집/PIE 분리.
- 동일 타입 Component 여러 개, 동일 값 explicit override, 부모 변경 전파.
- 텔레포트 중 Cell unload·Actor destroy·old epoch packet·재접속.
- Ready 이전 이동·공격 요청의 서버 거부.
- Host local player의 직접 Authority 입력, Host 복제 없음.
- Godot 객체 삭제 후 stale Lua handle 안전 실패.
- ResourceUID/NodePath rename과 PF GUID 보존.
- SDK·엔진 교체 시 source/schema/cooked artifact의 구분.

상세 실행 케이스는 `data/acceptance-tests.json`과 자동 생성한 체크리스트에 있다. 현재 모든 Runtime 케이스 상태는 `not_run`이다.

## 성능 비교 방법

실제 Godot Runtime과 대상 대안에서 같은 게임 요구·원본·해상도·Physics 설정·동작 테스트를 사용한다. cold/warm, debug/release, 브라우저/네이티브를 별도 행으로 기록한다. P50/P95/P99, 실패율, 메모리 peak, CPU/GPU, 패키지, 토큰 근거를 함께 보관한다.

Unity MCP 기준선은 정확한 Editor·MCP 구현·모델·설정과 사용량 근거가 있어야 한다. 외부 AI의 추론 전체를 모르면 해당 run으로 전체 시간·토큰 우위를 주장하지 않는다. 미공개 과제를 개선 Agent에게 노출하지 않는다.

## 채택 중단 또는 요구 재승인 조건

필수 Lua sandbox를 E1/E2 범위에서 안전하게 만들 수 없거나, 웹 표현 최소 요구를 충족하지 못하거나, 요구한 Mip streaming을 검증하지 못하거나, 서버 tick/패키지 예산을 초과하면 조건부 채택을 보류한다.

각 실패는 세 가지로만 처리한다: 공개 API 대안 시험, 제품 요구 변경 승인, 해당 프로필 제외/엔진 대안 유지. 몰래 내부 patch를 늘리거나 기능명을 유지한 채 동작을 축소하지 않는다.

## 문서 검증과 Runtime 시험의 구분

이번 ZIP의 link/JSON/schema/hash/CRC 검사는 문서 패키지의 정합성 검사다. Godot Export, Lua 실행, Havok, 브라우저 PIE, 협업 서버, 성능, 법률/SDK 승인 검증을 수행한 것이 아니다. 출력 report에도 이를 별도 boolean으로 기록한다.


---

# 15 · ADR·미결정 항목·기존 설명 보완

**검토 기준일:** 2026-11-17 · **상태:** 설계·공식 문서 검토, Godot 런타임 실증 미실시

## ADR 요약

| ID | 제안 결정 | 근거·영향 | 상태 |
|---|---|---|---|
| ADR-G01 | Godot를 실행 엔진 후보로, 웹 플랫폼은 유지 | 핵심 가치에 집중 | 검토 제안 |
| ADR-G02 | E1 기본·E2 승인·E3 기본 금지 | 업그레이드 비용 통제 | 채택 심사 필요 |
| ADR-G03 | PlayForge Source가 유일한 편집 원본 | 양방향 동기화 제거 | 기존 원칙 유지 |
| ADR-G04 | Lua 5.4 유지 | 사용자 결정, JS 이중 게임 규칙 금지 | 고정 제약 |
| ADR-G05 | RHI·렌더 루프는 Godot 소유 | 자체 Renderer 중복 제거 | 기존 수단 조정 승인 필요 |
| ADR-G06 | 웹과 네이티브 Capability 분리 | WebGL 2와 Forward+/Mobile 차이 | 검증 필요 |
| ADR-G07 | Room별 프로세스부터 | 격리·Tick·전역 상태 위험 | 초기 운영 제안 |
| ADR-G08 | PF Net Schema/Ready Barrier 유지 | 게임 안전·엔진 독립성 | 기존 요구 유지 |
| ADR-G09 | Mip Streaming 안정 지원 미확정 | Experimental API를 제품 보증하지 않음 | 채택 차단 가능 |
| ADR-G10 | 원본·Cook·Release 분리 | 복구·재임포트·AI migration | 기존 요구 유지 |
| ADR-G11 | 서드파티 Native는 승인 목록만 | UGC 보안 | 기존 요구 유지 |
| ADR-G12 | Godot 업스트림 자동 AI 제출 없음 | 현재 기여 정책 준수 | 운영 정책 제안 |

## 우선 해결할 미결정 질문

| 질문 | 필요한 증거 | 결정권 |
|---|---|---|
| 웹 Lua는 동적 E1인가 정적 E2인가 | 대상 브라우저의 실행·크기·격리 시험 | 런타임/보안 |
| 실제 물리 첫 백엔드는 무엇인가 | Box2D/Havok 기능·SDK·성능 | 엔진/제품 |
| Mip streaming을 어느 버전에서 통과시키는가 | stable/beta 별 API·GPU 메모리 시험 | 렌더/제품 |
| Godot 고수준 net를 제품에 쓰는가 | PF schema 필요성·비-Godot 경계 | 네트워크 |
| 일부 셰이더 표현 차이를 허용하는가 | 동일 씬 타겟별 화면·QA | 제품/아트 |
| 공동 runtime 바이너리를 quota에서 제외하는가 | 실제 패키지 크기·원가·표시 정책 | 제품/사업 |
| multi-room 밀도를 얼마나 올리는가 | 격리·P99·장애 전파 시험 | 서버/SRE |
| 콘솔까지 같은 확장 경로가 가능한가 | SDK와 승인된 포트 조건 | 플랫폼/계약 |

## 기존 설명에서 혼동하지 말아야 할 것

**1. GodotInstance 하나와 World 하나는 다르다.** 프로세스당 GodotInstance 제한이 있어도 Viewport/World를 여러 개 둘 수 있다. 반대로 여러 World가 완전한 엔진·보안·메모리 격리를 뜻하지 않는다. [G22](references/Verified_Sources.md#g22)[G15](references/Verified_Sources.md#g15)

**2. Lua는 채택 결정이 아니라 통합 과제다.** 커뮤니티 확장을 발견했다고 공식 기본 언어 지원으로 표기하지 않는다. [G23](references/Verified_Sources.md#g23)[G38](references/Verified_Sources.md#g38)

**3. 물리 확장 가능과 backend hot swap은 다르다.** PhysicsServer 확장점이 있어도 시작 후 선택 변경은 지원되지 않는다. [G16](references/Verified_Sources.md#g16)[G18](references/Verified_Sources.md#g18)

**4. Mipmap과 Mip Residency는 다르다.** 저해상도 샘플링만으로 실제 GPU 메모리 해제를 증명할 수 없다. 개발 채널 API는 안정판 지원으로 승격해 기록하지 않는다. [G39](references/Verified_Sources.md#g39)[G40](references/Verified_Sources.md#g40)

**5. 웹이 GPU를 사용한다고 WebGPU인 것은 아니다.** 현재 공식 Export는 WebGL 2 Compatibility다. [G06](references/Verified_Sources.md#g06)

**6. C++ 표면 API가 Unreal식이어도 내부 UObject/GC/ABI가 같아지는 것은 아니다.** 전체 코어를 한 겹 더 만들지 않고 필요한 계약만 유지한다.

**7. 기존 v17은 포팅 완료 엔진이 아니다.** 이전 JavaScript 목업/설계와 이번 검토 패키지를 실제 Godot 실행 결과로 합쳐 표시하지 않는다.

**8. MIT가 모든 외부 권한을 해결하지 않는다.** Godot, 서드파티, Havok/EOS, 사용자 콘텐츠, AI 데이터, 콘솔 각각의 조건을 구분한다. [G02](references/Verified_Sources.md#g02)[G03](references/Verified_Sources.md#g03)[G44](references/Verified_Sources.md#g44)

**9. GDExtension은 모든 내부 hook을 노출하지 않는다.** 공개 API로 범위를 증명하지 못한 기능은 미검증 또는 E3 위험으로 남긴다. [G04](references/Verified_Sources.md#g04)[G05](references/Verified_Sources.md#g05)

**10. 단일 엔진 채택으로 플랫폼이 완성되지 않는다.** 협업, AI 워크플로 평가, 계정·과금·스냅샷·신고·배포 운영은 PlayForge 서비스다.

## 의사결정 회의 순서

첫 회의는 미들웨어 브랜드 선호보다 Lua/Web 안전한 실행과 Source/Runtime 계약부터 확인한다. 다음은 렌더 기능 차이와 패키지 크기, 다음은 게임 네트워크와 미들웨어, 마지막은 대규모 Room 밀도·고급 rendering이다. 핵심 협업 실증 전에 E3 엔진 개발로 범위를 넓히지 않는다.


---

# 16 · 전체 요구사항 갭 매트릭스

**검토 기준일:** 2026-11-17 · **상태:** 설계·공식 문서 검토, Godot 런타임 실증 미실시

## 분류 기준

재사용 기반도 PlayForge 연결 시험은 필요하다. 어댑터 난이도는 상대 평가이며 실측 공수/성능이 아니다. `E3-risk`는 해당 표현을 그대로 만족시키려 할 때 내부 수정 위험이 높다는 뜻이지 공개 API로 어떤 유사 기능도 만들 수 없다는 뜻이 아니다.

| 분류 | 항목 수 |
|---|---:|
| 재사용 기반 | 5 |
| 어댑터 필요 | 26 |
| 플랫폼 별도 | 11 |
| 제약·미검증 | 12 |
| 요구 조정/포크 위험 | 9 |
| 범위 제외 | 3 |

## 플랫폼

| ID | 요구 | 판정 | 변경 등급 | 난이도 | 처리 방안 |
|---|---|---|---|---|---|
| F001 | 무설치 React 웹 에디터 | 플랫폼 별도 | External | High | React 유지, Godot는 Canvas 실행면만 연결 [G06](references/Verified_Sources.md#g06) [G37](references/Verified_Sources.md#g37) |
| F002 | 온라인 공동 Scene 편집 | 플랫폼 별도 | External | High | Workspace Authority와 Revision/Operation 유지  |
| F003 | Lua 공동 텍스트 편집 | 플랫폼 별도 | External | High | 텍스트 CRDT와 구조화 Command 경계 유지  |
| F004 | 사용자·AI Presence/커서 | 플랫폼 별도 | External | Medium | 일시 상태 별도 채널, 영구 source에 포함하지 않음  |
| F005 | 클라우드 Snapshot/수동·자동 저장 | 플랫폼 별도 | External | High | 단일 원본·불변 파일 버전·복원 epoch  |
| F006 | 조건부 Undo와 선택 ChangeSet | 플랫폼 별도 | External | High | 서버 검증, Godot 편집 Undo에 의존하지 않음  |
| F007 | GitHub 선택 연동 | 플랫폼 별도 | External | Medium | Snapshot 기본, 연결 시 commit/tag 추가  |
| F008 | 외부 MCP와 AI 재귀 개선 | 플랫폼 별도 | External | High | 공통 명령·권한·평가기·측정 근거 유지  |

## 웹

| ID | 요구 | 판정 | 변경 등급 | 난이도 | 처리 방안 |
|---|---|---|---|---|---|
| F009 | WASM 2D/3D PIE | 어댑터 필요 | E0/E1 | High | 실제 Lua 및 Runtime Bridge 추가 [G06](references/Verified_Sources.md#g06) [G37](references/Verified_Sources.md#g37) |
| F010 | 웹 WebGPU Renderer | 요구 조정/포크 위험 | E3-risk | VeryHigh | 현재 기본 경로 아님. WebGL 2 허용 또는 별도 승인 [G06](references/Verified_Sources.md#g06) |
| F011 | 웹과 DX12/Vulkan 표현 완전 동일 | 제약·미검증 | E0/E3-risk | High | Capability와 품질 차이 명시, 고급 효과 미지원 검사 [G06](references/Verified_Sources.md#g06) [G07](references/Verified_Sources.md#g07) |
| F012 | Thread/Extension 무조건 실행 | 제약·미검증 | E1/E2 | High | COOP/COEP·iframe·실기기 조합 통과 조건 [G06](references/Verified_Sources.md#g06) |
| F013 | 브라우저 Native UDP 직접 연결 | 요구 조정/포크 위험 | External | High | 지원 WebSocket/WebRTC transport로 변경 [G06](references/Verified_Sources.md#g06) |

## 렌더

| ID | 요구 | 판정 | 변경 등급 | 난이도 | 처리 방안 |
|---|---|---|---|---|---|
| F014 | Windows Direct3D 12 | 재사용 기반 | E0 | Medium | Godot Renderer/Driver 사용, 실기기 검증 [G07](references/Verified_Sources.md#g07) |
| F015 | Android Vulkan | 재사용 기반 | E0 | Medium | Mobile 프로필과 기기별 QA [G07](references/Verified_Sources.md#g07) |
| F016 | iOS 네이티브 | 어댑터 필요 | E0/E1 | High | Metal·서명·클라우드 macOS 빌드 [G07](references/Verified_Sources.md#g07) [G45](references/Verified_Sources.md#g45) |
| F017 | Mobile/Desktop PBR | 어댑터 필요 | E0/E1 | Medium | 공통 Material IR을 Godot 템플릿에 매핑 [G07](references/Verified_Sources.md#g07) [G11](references/Verified_Sources.md#g11) |
| F018 | Toon/Outline | 어댑터 필요 | E0/E1 | Medium | Toon 기초 재사용, outline·성능·투명 검증 [G11](references/Verified_Sources.md#g11) |
| F019 | 공통 HLSL 재질 직접 사용 | 요구 조정/포크 위험 | E3-risk | VeryHigh | Godot Shader 생성으로 요구 조정 또는 별도 컴파일 경로 검증 [G10](references/Verified_Sources.md#g10) |
| F020 | 자체 RHI/Render Graph 전체 유지 | 요구 조정/포크 위험 | E3-risk | VeryHigh | Godot 소유로 변경 승인, 중복 Renderer 금지 [G08](references/Verified_Sources.md#g08) [G09](references/Verified_Sources.md#g09) |
| F021 | 기본 Debug View | 어댑터 필요 | E0/E1 | Medium | 지원 DebugDraw·진단 재질, View별 분리 [G11](references/Verified_Sources.md#g11) [G15](references/Verified_Sources.md#g15) |
| F022 | 정확한 Quad Overdraw/GPU 비용 | 제약·미검증 | E1/E3-risk | High | 실측·정적 추정 구분, 공개 hook별 확인 [G08](references/Verified_Sources.md#g08) [G09](references/Verified_Sources.md#g09) |
| F023 | Orthographic/Perspective | 재사용 기반 | E0 | Low | Projection/aspect 의미를 PF 카메라에 매핑 [G14](references/Verified_Sources.md#g14) |
| F024 | 다중 카메라 순차 합성 | 어댑터 필요 | E0/E1 | Medium | SubViewport 합성과 비용 시험 [G14](references/Verified_Sources.md#g14) [G15](references/Verified_Sources.md#g15) |
| F025 | 2D Sorting Layer/Order | 어댑터 필요 | E0/E1 | Medium | 안정 Layer ID를 z/tree/y-sort 계약에 매핑 [G12](references/Verified_Sources.md#g12) |
| F026 | Unity SortingGroup 완전 동일 | 제약·미검증 | E1 | High | 중첩·외부 결속·tie-breaker 시험 후 범위 확정 [G12](references/Verified_Sources.md#g12) |
| F027 | 임의 3D RenderQueue/패스 정렬 | 요구 조정/포크 위험 | E3-risk | High | 고정 패스+제한 priority로 조정 승인 필요 [G13](references/Verified_Sources.md#g13) |

## 코어

| ID | 요구 | 판정 | 변경 등급 | 난이도 | 처리 방안 |
|---|---|---|---|---|---|
| F028 | Unreal 스타일 C++ 표면 API | 어댑터 필요 | E1 | Medium | 선별된 façade, 엔진 타입 전체 재작성 안 함 [G05](references/Verified_Sources.md#g05) |
| F029 | FName/StringName | 어댑터 필요 | E0/E1 | Low | 내부 interning 재사용, 영구 ID는 PF 소유 [G33](references/Verified_Sources.md#g33) |
| F030 | GameplayTag | 어댑터 필요 | E1 | Medium | PF dictionary·검증·네트워크 ID 유지  |
| F031 | FLocText/AI 다국어 | 어댑터 필요 | E0/E1 | Medium | key/source/args 유지, formatter 의미 검증  |
| F032 | CDO/Class/Prefab/Instance override | 어댑터 필요 | E1 | High | Source Schema resolver와 Runtime 투영 [G25](references/Verified_Sources.md#g25) [G26](references/Verified_Sources.md#g26) |
| F033 | Component GUID/Property ID | 어댑터 필요 | E1 | High | ClassDB는 메타데이터 기반, 영구 ID는 별도 [G25](references/Verified_Sources.md#g25) [G27](references/Verified_Sources.md#g27) |
| F034 | INI/CVar/Scalability/DeviceProfile | 어댑터 필요 | E0/E1 | Medium | registry·우선순위·apply mode 별도 구현 [G34](references/Verified_Sources.md#g34) [G35](references/Verified_Sources.md#g35) [G36](references/Verified_Sources.md#g36) |
| F035 | 전체 내부 Allocator/Job 시스템 대체 | 요구 조정/포크 위험 | E3-risk | VeryHigh | 미들웨어별 어댑터와 budget만, Godot 전역 교체 금지 [G20](references/Verified_Sources.md#g20) [G21](references/Verified_Sources.md#g21) |

## Lua

| ID | 요구 | 판정 | 변경 등급 | 난이도 | 처리 방안 |
|---|---|---|---|---|---|
| F036 | Lua 5.4 게임플레이 | 어댑터 필요 | E1/E2 | High | 확장 후보 검증, 플랫폼 공통 PF API 유지 [G23](references/Verified_Sources.md#g23) [G38](references/Verified_Sources.md#g38) |
| F037 | UGC Lua 샌드박스 | 어댑터 필요 | E1/External | VeryHigh | whitelist+실행 예산+프로세스 격리, 자동 안전 아님 [G37](references/Verified_Sources.md#g37) [G38](references/Verified_Sources.md#g38) |
| F038 | 코드 Hot Reload/Debug | 제약·미검증 | E1 | High | 함수·closure·coroutine·구독 규약 한정  |

## 물리

| ID | 요구 | 판정 | 변경 등급 | 난이도 | 처리 방안 |
|---|---|---|---|---|---|
| F039 | Havok Physics | 어댑터 필요 | E1/E2 | VeryHigh | PhysicsServer 또는 독립 World 어댑터·SDK 조건 [G16](references/Verified_Sources.md#g16) [G18](references/Verified_Sources.md#g18) |
| F040 | Box2D 3.x | 어댑터 필요 | E1 | High | 2D server API 매핑, 기본 물리와 별개 [G17](references/Verified_Sources.md#g17) |
| F041 | 실행 중 PhysicsServer 교체 | 요구 조정/포크 위험 | E3-risk | High | 초기 선택 후 세션 재시작 [G18](references/Verified_Sources.md#g18) |
| F042 | Havok Navigation | 제약·미검증 | E1/E2 | High | PF Provider·원본 재Cook·agent/query 의미 시험 [G42](references/Verified_Sources.md#g42) |
| F043 | Havok Animation | 제약·미검증 | E1/E2 | High | Skeleton 포즈 매핑, Godot 기본과 별도 제품 [G43](references/Verified_Sources.md#g43) |
| F044 | Godot 기본 Navigation/Animation 대안 | 재사용 기반 | E0 | Medium | 대안이며 Havok 요구 충족으로 자동 표시 금지 [G42](references/Verified_Sources.md#g42) [G43](references/Verified_Sources.md#g43) |

## 성능

| ID | 요구 | 판정 | 변경 등급 | 난이도 | 처리 방안 |
|---|---|---|---|---|---|
| F045 | 선택적 ECS/SIMD Batch | 어댑터 필요 | E1 | High | 고밀도 배열 계산과 Server API 출력 [G20](references/Verified_Sources.md#g20) [G21](references/Verified_Sources.md#g21) |
| F046 | 엔진 전체 DOTS화 | 요구 조정/포크 위험 | E3-risk | VeryHigh | 핫스팟만 최적화, 전체 Node replacement 제외 [G20](references/Verified_Sources.md#g20) [G21](references/Verified_Sources.md#g21) |

## 네트워크

| ID | 요구 | 판정 | 변경 등급 | 난이도 | 처리 방안 |
|---|---|---|---|---|---|
| F047 | 고정 PF 프로토콜/Iris식 복제 | 어댑터 필요 | E1 | VeryHigh | 독립 Network ID/Schema, Godot 고수준 복제와 중복 금지 [G30](references/Verified_Sources.md#g30) [G31](references/Verified_Sources.md#g31) |
| F048 | 초기 Replication 완료 후 시작 | 어댑터 필요 | E1 | High | 서버 required set·적용 ACK·Collision·StartPlay  |
| F049 | Listen 단일 Authority Host | 어댑터 필요 | E0/E1 | High | Host Client World/Loopback 없음  |
| F050 | Dedicated headless 실행 | 재사용 기반 | E0 | Medium | 서버 template·리소스 제거·실제 검증 [G32](references/Verified_Sources.md#g32) |
| F051 | 여러 GodotInstance를 한 프로세스에 생성 | 요구 조정/포크 위험 | E3-risk | VeryHigh | 프로세스 분리, 논리 World와 구분 [G22](references/Verified_Sources.md#g22) |
| F052 | 다중 Room 고밀도 서버 | 제약·미검증 | E1/External | VeryHigh | 동일 Release에 한해 단계적 계측·격리 [G20](references/Verified_Sources.md#g20) [G22](references/Verified_Sources.md#g22) |
| F053 | EOS Voice/EAC/Matching | 제약·미검증 | E1/External | High | 별도 SDK·계약·플랫폼 검증, 엔진 도입과 무관  |

## 월드

| ID | 요구 | 판정 | 변경 등급 | 난이도 | 처리 방안 |
|---|---|---|---|---|---|
| F054 | World Cell/Level Streaming | 어댑터 필요 | E0/E1 | High | 로컬 resource 준비와 활성화 예산 [G29](references/Verified_Sources.md#g29) |
| F055 | 장거리 Teleport 충돌 안전 | 어댑터 필요 | E1 | High | Cell pin·physics query ready·epoch·safe commit  |
| F056 | Texture Mip Residency | 제약·미검증 | E0/E3-risk | VeryHigh | 4.8 실험 채널 검증 또는 요구 재승인, 일반 mip와 구분 [G39](references/Verified_Sources.md#g39) [G40](references/Verified_Sources.md#g40) [G41](references/Verified_Sources.md#g41) |
| F057 | Actor 단위 Asset Streaming | 범위 제외 | None | None | 사용자 요구로 제외  |
| F058 | 런타임 CDN 에셋 다운로드 | 범위 제외 | None | None | 사용자 요구로 제외, 실행 전 설치만  |

## 에셋

| ID | 요구 | 판정 | 변경 등급 | 난이도 | 처리 방안 |
|---|---|---|---|---|---|
| F059 | 원본 Import/Preview | 어댑터 필요 | E0/External | Medium | 클라우드 Import, 웹 정적 미리보기 [G28](references/Verified_Sources.md#g28) |
| F060 | Pre-Cook/증분 캐시 | 어댑터 필요 | E0/External | High | Godot 버전·실제 입력 기반 task cache [G28](references/Verified_Sources.md#g28) |
| F061 | 불변 Source+Runtime Release | 플랫폼 별도 | External | High | 원본·생성 프로젝트·엔진 lock·검증 결과 보관  |
| F062 | 무료 공유/검색/버전 고정 | 플랫폼 별도 | External | Medium | 단순 공유 registry와 source closure  |

## 운영

| ID | 요구 | 판정 | 변경 등급 | 난이도 | 처리 방안 |
|---|---|---|---|---|---|
| F063 | 서버 UGC 보안 격리 | 플랫폼 별도 | External | VeryHigh | Lua만으로 경계 보장하지 않음  |
| F064 | 콘솔 미래 지원 | 제약·미검증 | E1/E2 | High | 승인 SDK와 포트 경로 별도 확인 [G44](references/Verified_Sources.md#g44) |
| F065 | 패키지 50/100 MB 한도 충족 | 제약·미검증 | E0/External | High | 실제 template+content 측정, quota 조정 자동 승인 금지  |
| F066 | AI 자동 Godot upstream PR | 범위 제외 | None | None | 업스트림 기여 정책과 내부 제품 사용 구분 [G47](references/Verified_Sources.md#g47) |
