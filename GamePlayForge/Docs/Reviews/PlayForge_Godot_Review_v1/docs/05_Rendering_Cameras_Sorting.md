# 05 · 렌더링·셰이더·카메라·정렬 제약

**검토 기준일:** 2026-11-17 · **상태:** 설계·공식 문서 검토, Godot 런타임 실증 미실시

## 네이티브와 웹의 계약을 따로 둔다

Godot Forward+/Mobile은 RenderingDevice 기반의 DX12/Vulkan/Metal 경로이고, 웹은 Compatibility/WebGL 2다. Godot가 지원하는 API라고 해서 모든 Renderer에서 같은 효과가 제공되는 것은 아니다. [G06](../references/Verified_Sources.md#g06)[G07](../references/Verified_Sources.md#g07)

| PlayForge 목표 | 변경 최소화 경로 | 제한 |
|---|---|---|
| Windows DX12 | Godot 드라이버/Renderer | 실제 GPU·드라이버 회귀 필요 |
| Android Vulkan | Godot Mobile | 모바일 성능·발열·메모리 검증 |
| iOS | 지원되는 Metal 프로필 | 서명·빌드 호스트 별도 |
| 웹 2D/3D | Compatibility | 네이티브 고급 효과와 동일성 미보장 |
| 자체 RHI/Render Graph | Godot 소유로 변경 제안 | 내부 완전 치환은 E3 위험 |
| 공통 HLSL 재질 | Material IR → Godot Shader 생성 | 임의 HLSL 소스의 완전 호환 아님 |

RenderingDevice를 이용한 독립 GPU 작업은 가능하지만 Compatibility/headless에서는 사용할 수 없다. Compositor 역시 Mobile/Forward+ 한정 확장점이다. 이를 엔진 전체 패스 순서 변경 API로 광고하지 않는다. [G08](../references/Verified_Sources.md#g08)[G09](../references/Verified_Sources.md#g09)

## PBR / Toon / Debug View

BaseColor·Metallic·Roughness·Normal·Emission의 공통 Material 데이터는 유지하고, 타겟별 Godot 재질로 생성한다. Godot Spatial Shader에는 PBR·Toon·Unshaded 등 관련 모드가 있지만, PlayForge의 품질 프로필과 디버그 메뉴는 별도이다. [G10](../references/Verified_Sources.md#g10)[G11](../references/Verified_Sources.md#g11)

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

Camera3D는 투영 모드를 제공하지만 한 Viewport에서 활성 3D 카메라는 하나다. 여러 카메라의 Unity식 순서 합성은 SubViewport/합성 레이어로 구현하고 추가 렌더 비용을 측정한다. [G14](../references/Verified_Sources.md#g14)[G15](../references/Verified_Sources.md#g15)

OrthoHeight의 세로 크기 의미와 Godot `size`/aspect 설정을 연결한다. Scene 편집 카메라는 소스 게임 Camera Component와 독립 저장한다. 2D/3D 모드와 Ortho/Perspective는 같은 개념으로 묶지 않는다.

## Unity식 Sorting의 실제 지원 범위

2D는 CanvasItem의 z_index·tree order·y_sort와 Canvas 계층을 활용한다. PlayForge는 영구 SortingLayer ID를 유지하고 빌드 시 유효 순서로 변환한다. SortingGroup 내부 결속, 중첩 그룹, 음수 순서, 같은 값 tie-breaker는 별도 계약 시험을 둔다. [G12](../references/Verified_Sources.md#g12)

3D Material의 `render_priority` 범위는 제한되어 있고 투명/불투명 패스 경계를 임의로 뒤집는 기능이 아니다. `next_pass`도 바로 다음 Draw를 보장하는 의미가 아니다. [G13](../references/Verified_Sources.md#g13)

따라서 `RenderQueue=1000/2000/2450/3000/4000`을 입력받는 UI는 만들 수 있어도 Godot에 숫자를 그대로 넣어 Unreal/Unity와 완전히 같은 정렬을 보장하면 안 된다. P0는 Opaque/Masked/Transparent/Overlay의 허용 정책과 제한된 Priority만 제공한다. 임의 커스텀 Queue는 요구 변경 승인 없이는 구현 완료로 간주하지 않는다.

## 셰이더 언어

Godot 재질 셰이더는 GLSL 계열 언어다. HLSL을 API 이름만 변경하는 식으로 자동 변환하지 않는다. Material IR에는 의미 있는 파라미터와 feature를 저장하고 플랫폼별 템플릿을 생성한다. 커스텀 HLSL 플러그인은 별도 호환성 프로젝트로 분리한다. [G10](../references/Verified_Sources.md#g10)

## 필수 비교

동일 씬·노출·색 공간에서 Web/Windows DX12/Android Vulkan 화면을 비교한다. 품질을 동일하게 강제할 부분과 지원되지 않는 부분을 리포트에 분리한다. alpha clipping, transparent overlap, outline, skinned normal, Ortho depth, camera composite를 포함한다. 고급 효과를 조용히 끄고 성공으로 표시하지 않는다.
