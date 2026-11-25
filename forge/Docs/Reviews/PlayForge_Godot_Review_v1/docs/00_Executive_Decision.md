# 00 · 도입 판단과 의사결정 요약

**검토 기준일:** 2026-11-17 · **상태:** 설계·공식 문서 검토, Godot 런타임 실증 미실시

## 결론

**Godot를 PlayForge의 실행 엔진 후보로 검증하되, PlayForge의 웹 에디터·협업·클라우드 원본은 유지하고, 게임 스크립트는 GDScript를 사용한다.** 권장 경로는 공식 확장 API를 쓰는 GDExtension이며, 엔진 내부 파일 패치는 기본적으로 금지한다. 이것은 채택 확정이나 포팅 완료 보고가 아니다.

핵심 가치는 게임 엔진 기능 수가 아니라 온라인 공동 제작, 브라우저 무설치, AI 작업의 검증·반복 개선이다. 따라서 Renderer/Audio/Input을 직접 재작성하는 비용을 줄이는 대신, 안정 ID·명령·협업·GDScript 안전 경계에 개발 역량을 집중한다.

## 기준 버전과 증거 수준

공식 배포 목록에서 2026-11-17 확인한 안정판은 **4.7.2**, 개발 채널은 **4.8 beta3**다. 검토 기준으로 안정판을 제안하며, 실제 채택에는 바이너리·소스 commit·export template 해시를 다시 고정한다. `stable`과 `latest` 문서 URL은 움직이므로 버전 고정 빌드의 실제 API와 재대조해야 한다. [G01](../references/Verified_Sources.md#g01)[G24](../references/Verified_Sources.md#g24)

이 문서에서 **확인**은 공식 자료가 기술한 기능, **제안**은 PlayForge 설계 판단, **미검증**은 실제 실행 결과가 없는 항목이다. 공식 API 존재가 PlayForge 구현 완료를 뜻하지 않는다.

## 우선 지킬 경계

| 유지 | 조정이 필요한 수단 |
|---|---|
| 범용 웹 에디터 | 전체 Godot Editor를 브라우저 UI로 복제하지 않음 |
| 안정 GUID·Prefab Override | Godot NodePath/Instance ID로 영구 ID를 대체하지 않음 |
| DX12·Vulkan 네이티브 | Godot Renderer를 사용하고 자체 RHI를 동시에 소유하지 않음 |
| 무설치 웹 PIE | Compatibility/WebGL 2의 표현 범위를 명확히 노출 |
| 단일 Authority Listen Host | 별도 로컬 Client World·Loopback을 생성하지 않음 |
| 초기 복제·충돌 준비 후 시작 | Node 생성 이벤트와 PlayReady를 분리 |
| 로컬 Mip Streaming | 안정판의 네이티브/웹 지원을 별도 채택 조건으로 유지 |

Godot 웹 Export는 현재 Compatibility/WebGL 2 경로다. WebGPU나 네이티브 Forward+와 완전히 같은 화면을 기본 지원으로 볼 수 없다. [G06](../references/Verified_Sources.md#g06)[G07](../references/Verified_Sources.md#g07)

## 가장 큰 제약 다섯 가지

**렌더러 제어.** RenderingDevice·Compositor는 확장 지점이지, Godot 내부 Render Graph와 전역 Draw 정렬을 전부 대체하는 플러그인 계약은 아니다. 기존 HLSL 중심 자체 RHI 설계를 그대로 보존하려면 변경 최소화 목표와 충돌한다. [G08](../references/Verified_Sources.md#g08)[G09](../references/Verified_Sources.md#g09)[G10](../references/Verified_Sources.md#g10)

**GDScript와 UGC.** GDScript는 엔진 API·파일 접근을 사용할 수 있으므로 UGC 실행이 자동으로 격리되지는 않는다. [G23](../references/Verified_Sources.md#g23)

**다중 Room.** LibGodot의 엔진 인스턴스는 프로세스당 하나다. 여러 논리 World를 둘 수 있는 것과 각 Room이 완전히 독립적인 엔진·Tick·메모리를 갖는 것은 다르다. [G22](../references/Verified_Sources.md#g22)[G15](../references/Verified_Sources.md#g15)

**Texture Streaming.** 4.8 개발 과정의 Mip Streaming과 Experimental API를 안정판 제품 보증으로 계산하지 않는다. 원래 요구를 삭제하지 않고 별도 보류·승인 항목으로 둔다. [G39](../references/Verified_Sources.md#g39)[G40](../references/Verified_Sources.md#g40)[G41](../references/Verified_Sources.md#g41)

**물리 의미 일치.** Havok/Box2D 공식 확장점은 있지만 어댑터 구현·SDK 권한·기능 일치 시험이 필요하다. Godot 기본 물리를 이름만 Havok/Box2D로 바꾸지 않는다. [G16](../references/Verified_Sources.md#g16)[G17](../references/Verified_Sources.md#g17)

## 추천 / 비추천

| 접근 | 판단 |
|---|---|
| PlayForge 소스 → Godot 실행 산출물 | 권장. 원본 한 곳, 생성물은 재생성 가능 |
| GDExtension 기반 Runtime Bridge | 우선 검증 |
| 웹용 정적 모듈 | 공개 API로 해결 안 될 때 E2 예외 심사 |
| LibGodot를 모든 플랫폼의 필수 기반으로 사용 | 보류 |
| Godot 전체를 Unreal식 Core/ECS로 재구현 | 비권장 |
| Godot를 떼어 Renderer만 독립 엔진에 이식 | 재사용 이점이 작아 비권장 |
| 기존 JavaScript 목업을 Godot 포팅 완료로 표시 | 금지 |

## 채택 기준

1. 실제 GDScript가 웹·Windows에서 같은 게임 규칙을 실행한다.
2. 두 사용자의 협업 변경을 안전하게 실행 View에 반영한다.
3. 2D와 3D 예제를 범용 UI로 편집하며 특정 게임 분기를 추가하지 않는다.
4. Dedicated/Listen·초기 복제·충돌 안전 장벽이 실제 통신에서 통과한다.
5. DX12/Android Vulkan/iOS·Linux Server의 패키지·성능·SDK 조건을 검증한다.
6. 필수 요구를 충족하지 못하면 요구 변경 승인을 받거나 Godot 채택 범위를 제한한다.

**원칙:** 협업·안전·권한은 완화하지 않는다. 표현 차이·런타임 내부 교체 범위는 명시적 제품 결정으로 조정할 수 있다.
