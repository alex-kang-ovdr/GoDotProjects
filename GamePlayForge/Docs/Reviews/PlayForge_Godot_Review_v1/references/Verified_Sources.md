# 공식 자료·근거 목록

확인일: **2026-11-17**. 공식/원저자 자료 48건. `stable`/`latest`는 변경되는 URL이며 재현 빌드는 별도 commit/바이너리 해시 고정이 필요합니다.

문서의 `[Gnn]`는 이 목록으로 연결됩니다. 링크를 확인한 사실과 실제 엔진 실행 검증은 다릅니다. 아래 자료는 기능 근거이며, 독점 SDK의 계약 승인이나 PlayForge 런타임 통과 증거가 아닙니다.

원문 전체·스크린샷·엔진 바이너리·SDK·폰트 파일은 이 패키지에 포함하지 않았습니다. 공식 문서를 요약해 독립적인 검토·설계 판단에 연결했습니다.

<a id="g01"></a>
## G01 · Godot download archive
- 원문: [Godot download archive](https://godotengine.org/download/archive/)
- 문서 채널: `release` · 확인일: 2026-11-17
- 사용 범위: 4.7.2 stable / 4.8 beta3를 확인. 출시 상태이며 PlayForge 호환성 검증 결과가 아님.

<a id="g02"></a>
## G02 · Godot license
- 원문: [Godot license](https://godotengine.org/license/)
- 문서 채널: `official` · 확인일: 2026-11-17
- 사용 범위: MIT 상업적 이용·수정·재배포와 고지 조건. 외부 SDK와 사용자 콘텐츠 권한은 별도.

<a id="g03"></a>
## G03 · Complying with licenses
- 원문: [Complying with licenses](https://docs.godotengine.org/en/stable/about/complying_with_licenses.html)
- 문서 채널: `stable` · 확인일: 2026-11-17
- 사용 범위: 엔진 및 포함 서드파티 라이선스 고지. 법률 자문을 대체하지 않음.

<a id="g04"></a>
## G04 · What is GDExtension?
- 원문: [What is GDExtension?](https://docs.godotengine.org/en/stable/engine_details/engine_api/gdextension/what_is_gdextension.html)
- 문서 채널: `stable` · 확인일: 2026-11-17
- 사용 범위: 공개 C ABI·extension_api.json 기반 확장. 전체 엔진 내부 접근 보장을 뜻하지 않음.

<a id="g05"></a>
## G05 · About godot-cpp
- 원문: [About godot-cpp](https://docs.godotengine.org/en/stable/tutorials/scripting/cpp/about_godot_cpp.html)
- 문서 채널: `stable` · 확인일: 2026-11-17
- 사용 범위: GDExtension/정적 모듈 차이, 버전·정밀도 호환 조건.

<a id="g06"></a>
## G06 · Exporting for the Web
- 원문: [Exporting for the Web](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html)
- 문서 채널: `stable` · 확인일: 2026-11-17
- 사용 범위: WebGL 2 Compatibility, 단일 스레드, 스레드·확장의 교차 출처 격리 요구, 웹 네트워크·오디오 제한.

<a id="g07"></a>
## G07 · Overview of renderers
- 원문: [Overview of renderers](https://docs.godotengine.org/en/stable/tutorials/rendering/renderers.html)
- 문서 채널: `stable` · 확인일: 2026-11-17
- 사용 범위: Forward+/Mobile/Compatibility와 DX12/Vulkan/Metal/GL의 구분.

<a id="g08"></a>
## G08 · RenderingDevice
- 원문: [RenderingDevice](https://docs.godotengine.org/en/stable/classes/class_renderingdevice.html)
- 문서 채널: `stable` · 확인일: 2026-11-17
- 사용 범위: 저수준 GPU 접근. Compatibility·headless에서는 사용 불가.

<a id="g09"></a>
## G09 · The Compositor
- 원문: [The Compositor](https://docs.godotengine.org/en/stable/tutorials/rendering/compositor.html)
- 문서 채널: `stable` · 확인일: 2026-11-17
- 사용 범위: Compositor 기능은 Mobile·Forward+ 범위. 완전한 사용자 Render Graph와 다름.

<a id="g10"></a>
## G10 · Shading language
- 원문: [Shading language](https://docs.godotengine.org/en/stable/tutorials/shaders/shader_reference/shading_language.html)
- 문서 채널: `stable` · 확인일: 2026-11-17
- 사용 범위: GLSL 계열 Godot 재질 셰이더 언어.

<a id="g11"></a>
## G11 · Spatial shaders
- 원문: [Spatial shaders](https://docs.godotengine.org/en/stable/tutorials/shaders/shader_reference/spatial_shader.html)
- 문서 채널: `stable` · 확인일: 2026-11-17
- 사용 범위: PBR/Toon/Unshaded/Wireframe 및 렌더 모드.

<a id="g12"></a>
## G12 · CanvasItem
- 원문: [CanvasItem](https://docs.godotengine.org/en/stable/classes/class_canvasitem.html)
- 문서 채널: `stable` · 확인일: 2026-11-17
- 사용 범위: 2D tree order, z_index, y_sort 등. Unity SortingGroup의 완전한 대응을 보장하지 않음.

<a id="g13"></a>
## G13 · Material
- 원문: [Material](https://docs.godotengine.org/en/stable/classes/class_material.html)
- 문서 채널: `stable` · 확인일: 2026-11-17
- 사용 범위: render_priority·next_pass와 정렬 제약.

<a id="g14"></a>
## G14 · Camera3D
- 원문: [Camera3D](https://docs.godotengine.org/en/stable/classes/class_camera3d.html)
- 문서 채널: `stable` · 확인일: 2026-11-17
- 사용 범위: Perspective/Orthographic, Viewport당 활성 3D 카메라 제약.

<a id="g15"></a>
## G15 · Viewport
- 원문: [Viewport](https://docs.godotengine.org/en/stable/classes/class_viewport.html)
- 문서 채널: `stable` · 확인일: 2026-11-17
- 사용 범위: 서브뷰·자체 World·DebugDraw. 독립 엔진 인스턴스와 다름.

<a id="g16"></a>
## G16 · PhysicsServer3DExtension
- 원문: [PhysicsServer3DExtension](https://docs.godotengine.org/en/stable/classes/class_physicsserver3dextension.html)
- 문서 채널: `stable` · 확인일: 2026-11-17
- 사용 범위: 커스텀 3D 물리 서버를 구현하는 공식 확장점.

<a id="g17"></a>
## G17 · PhysicsServer2DExtension
- 원문: [PhysicsServer2DExtension](https://docs.godotengine.org/en/stable/classes/class_physicsserver2dextension.html)
- 문서 채널: `stable` · 확인일: 2026-11-17
- 사용 범위: 커스텀 2D 물리 서버를 구현하는 공식 확장점.

<a id="g18"></a>
## G18 · PhysicsServer3DManager
- 원문: [PhysicsServer3DManager](https://docs.godotengine.org/en/stable/classes/class_physicsserver3dmanager.html)
- 문서 채널: `stable` · 확인일: 2026-11-17
- 사용 범위: 물리 서버 등록·선택은 초기화 단계. 실행 중 교체 불가.

<a id="g19"></a>
## G19 · Using Jolt Physics
- 원문: [Using Jolt Physics](https://docs.godotengine.org/en/stable/tutorials/physics/using_jolt_physics.html)
- 문서 채널: `stable` · 확인일: 2026-11-17
- 사용 범위: 내장 Jolt와 Godot Physics의 Joint·충돌 등 차이.

<a id="g20"></a>
## G20 · Thread-safe APIs
- 원문: [Thread-safe APIs](https://docs.godotengine.org/en/stable/tutorials/performance/thread_safe_apis.html)
- 문서 채널: `stable` · 확인일: 2026-11-17
- 사용 범위: 활성 SceneTree·공유 Resource·GPU 작업의 스레드 제약.

<a id="g21"></a>
## G21 · Optimization using Servers
- 원문: [Optimization using Servers](https://docs.godotengine.org/en/stable/tutorials/performance/using_servers.html)
- 문서 채널: `stable` · 확인일: 2026-11-17
- 사용 범위: SceneTree 우회·저수준 서버·RID 수명 관리.

<a id="g22"></a>
## G22 · GodotInstance
- 원문: [GodotInstance](https://docs.godotengine.org/en/stable/classes/class_godotinstance.html)
- 문서 채널: `stable` · 확인일: 2026-11-17
- 사용 범위: LibGodot GodotInstance는 프로세스당 하나.

<a id="g23"></a>
## G23 · Frequently asked questions
- 원문: [Frequently asked questions](https://docs.godotengine.org/en/stable/about/faq.html)
- 문서 채널: `stable` · 확인일: 2026-11-17
- 사용 범위: 공식 언어, LibGodot 실험적 데스크톱 지원과 플랫폼 범위.

<a id="g24"></a>
## G24 · Release policy
- 원문: [Release policy](https://docs.godotengine.org/en/stable/about/release_policy.html)
- 문서 채널: `stable` · 확인일: 2026-11-17
- 사용 범위: 마이너·패치 버전 정책과 업그레이드 회귀 검증 필요성.

<a id="g25"></a>
## G25 · ClassDB
- 원문: [ClassDB](https://docs.godotengine.org/en/stable/classes/class_classdb.html)
- 문서 채널: `stable` · 확인일: 2026-11-17
- 사용 범위: 엔진/GDExtension 타입 메타데이터. 모든 스크립트 타입이 포함되는 것은 아님.

<a id="g26"></a>
## G26 · PackedScene
- 원문: [PackedScene](https://docs.godotengine.org/en/stable/classes/class_packedscene.html)
- 문서 채널: `stable` · 확인일: 2026-11-17
- 사용 범위: Scene 직렬화와 owner 관계. 클라우드 버전관리나 CDO가 아님.

<a id="g27"></a>
## G27 · ResourceUID
- 원문: [ResourceUID](https://docs.godotengine.org/en/stable/classes/class_resourceuid.html)
- 문서 채널: `stable` · 확인일: 2026-11-17
- 사용 범위: 프로젝트 내 리소스 식별. 플랫폼 Asset GUID와 범위가 다름.

<a id="g28"></a>
## G28 · Import process
- 원문: [Import process](https://docs.godotengine.org/en/stable/tutorials/assets_pipeline/import_process.html)
- 문서 채널: `stable` · 확인일: 2026-11-17
- 사용 범위: 원본·Import 설정·.godot/imported 파생 데이터 분리.

<a id="g29"></a>
## G29 · Background loading
- 원문: [Background loading](https://docs.godotengine.org/en/stable/tutorials/io/background_loading.html)
- 문서 채널: `stable` · 확인일: 2026-11-17
- 사용 범위: load_threaded_request/get_status/get. 조기 get은 차단 가능.

<a id="g30"></a>
## G30 · SceneMultiplayer
- 원문: [SceneMultiplayer](https://docs.godotengine.org/en/stable/classes/class_scenemultiplayer.html)
- 문서 채널: `stable` · 확인일: 2026-11-17
- 사용 범위: 고수준 RPC/Scene 복제. 프로토콜은 내부 구현이며 비-Godot 서버용 안정 규약 아님.

<a id="g31"></a>
## G31 · MultiplayerSynchronizer
- 원문: [MultiplayerSynchronizer](https://docs.godotengine.org/en/stable/classes/class_multiplayersynchronizer.html)
- 문서 채널: `stable` · 확인일: 2026-11-17
- 사용 범위: Property 동기화와 visibility. Object/Resource·RID·instance ID 동기화 제한.

<a id="g32"></a>
## G32 · Exporting for dedicated servers
- 원문: [Exporting for dedicated servers](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_dedicated_servers.html)
- 문서 채널: `stable` · 확인일: 2026-11-17
- 사용 범위: headless, export template, 시각 리소스 제거 경로.

<a id="g33"></a>
## G33 · StringName
- 원문: [StringName](https://docs.godotengine.org/en/stable/classes/class_stringname.html)
- 문서 채널: `stable` · 확인일: 2026-11-17
- 사용 범위: 문자열 interning. 영구 파일·네트워크 ID를 뜻하지 않음.

<a id="g34"></a>
## G34 · ConfigFile
- 원문: [ConfigFile](https://docs.godotengine.org/en/stable/classes/class_configfile.html)
- 문서 채널: `stable` · 확인일: 2026-11-17
- 사용 범위: INI 형태 저장. Unreal INI 병합·CVar 의미론은 별도.

<a id="g35"></a>
## G35 · ProjectSettings
- 원문: [ProjectSettings](https://docs.godotengine.org/en/stable/classes/class_projectsettings.html)
- 문서 채널: `stable` · 확인일: 2026-11-17
- 사용 범위: 프로젝트 설정·feature override. 모든 값이 즉시 runtime 적용되는 것은 아님.

<a id="g36"></a>
## G36 · Feature tags
- 원문: [Feature tags](https://docs.godotengine.org/en/stable/tutorials/export/feature_tags.html)
- 문서 채널: `stable` · 확인일: 2026-11-17
- 사용 범위: 플랫폼·아키텍처·빌드 feature 조건.

<a id="g37"></a>
## G37 · JavaScriptBridge
- 원문: [JavaScriptBridge](https://docs.godotengine.org/en/stable/classes/class_javascriptbridge.html)
- 문서 채널: `stable` · 확인일: 2026-11-17
- 사용 범위: Web export의 JS 연결. 기본 공개 API를 UGC에 무제한 노출하면 안 됨.

<a id="g38"></a>
## G38 · Lua GDExtension — maintainer repository
- 원문: [Lua GDExtension — maintainer repository](https://github.com/gilzoide/lua-gdextension)
- 문서 채널: `community-primary` · 확인일: 2026-11-17
- 사용 범위: Lua 5.4 후보. 공식 Godot 기본 언어가 아니며 저장소 상태와 커밋 고정 필요.

<a id="g39"></a>
## G39 · Godot 4.8 dev5 release note
- 원문: [Godot 4.8 dev5 release note](https://godotengine.org/article/dev-snapshot-godot-4-8-dev-5/)
- 문서 채널: `development` · 확인일: 2026-11-17
- 사용 범위: Mip streaming 도입 개발 노트. 안정판 지원 보증으로 사용하지 않음.

<a id="g40"></a>
## G40 · TextureStreaming
- 원문: [TextureStreaming](https://docs.godotengine.org/en/latest/classes/class_texturestreaming.html)
- 문서 채널: `latest-experimental` · 확인일: 2026-11-17
- 사용 범위: latest/Experimental API. 목표 플랫폼별 실제 지원·메모리 반환 검증 필요.

<a id="g41"></a>
## G41 · StreamedTexture2D
- 원문: [StreamedTexture2D](https://docs.godotengine.org/en/latest/classes/class_streamedtexture2d.html)
- 문서 채널: `latest-experimental` · 확인일: 2026-11-17
- 사용 범위: latest/Experimental 리소스. 일반 Mipmap/CompressedTexture2D와 혼동 금지.

<a id="g42"></a>
## G42 · Using NavigationServer
- 원문: [Using NavigationServer](https://docs.godotengine.org/en/stable/tutorials/navigation/navigation_using_navigationservers.html)
- 문서 채널: `stable` · 확인일: 2026-11-17
- 사용 범위: Navigation 동기화 단계. 노드 생성 완료가 쿼리 준비 완료를 의미하지 않음.

<a id="g43"></a>
## G43 · Using AnimationTree
- 원문: [Using AnimationTree](https://docs.godotengine.org/en/stable/tutorials/animation/animation_tree.html)
- 문서 채널: `stable` · 확인일: 2026-11-17
- 사용 범위: 2D/3D AnimationPlayer·AnimationTree 조합. Havok Animation과 동일 제품이 아님.

<a id="g44"></a>
## G44 · Godot console support
- 원문: [Godot console support](https://godotengine.org/consoles/)
- 문서 채널: `official` · 확인일: 2026-11-17
- 사용 범위: 플랫폼 승인·비공개 SDK·서드파티/자체 포팅 필요.

<a id="g45"></a>
## G45 · Exporting for iOS
- 원문: [Exporting for iOS](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_ios.html)
- 문서 채널: `stable` · 확인일: 2026-11-17
- 사용 범위: macOS/Xcode export 요구. 클라우드 제작자 무설치와 빌드 호스트 요구는 구분.

<a id="g46"></a>
## G46 · Custom modules in C++
- 원문: [Custom modules in C++](https://docs.godotengine.org/en/stable/engine_details/engine_api/custom_modules_in_cpp.html)
- 문서 채널: `stable` · 확인일: 2026-11-17
- 사용 범위: 정적 모듈과 엔진/템플릿 빌드. GDExtension과 배포 경로 구별.

<a id="g47"></a>
## G47 · Rules for contributions
- 원문: [Rules for contributions](https://contributing.godotengine.org/en/latest/development/contribution_rules.html)
- 문서 채널: `official-policy` · 확인일: 2026-11-17
- 사용 범위: Godot 업스트림 기여의 AI 사용 규칙. MIT 제품 이용 조건과 구분.

<a id="g48"></a>
## G48 · Introduction to 3D
- 원문: [Introduction to 3D](https://docs.godotengine.org/en/stable/tutorials/3d/introduction_to_3d.html)
- 문서 채널: `stable` · 확인일: 2026-11-17
- 사용 범위: Godot Y-up 오른손 공간과 미터 단위. 모델 앞 방향과 카메라 방향 구별.
