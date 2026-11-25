# Forge-refactoring

Godot 엔진 개선 로드맵(30개 항목)의 통합 브랜치. 검토 결과는 [REVIEW.md](REVIEW.md).

- [00_Development_Roadmap.md](00_Development_Roadmap.md) — 통합 로드맵 원문
- [90_Source_Coverage_and_Validation.md](90_Source_Coverage_and_Validation.md) — 원문 대응·검증 기록
- [REVIEW.md](REVIEW.md) — 저장소 대조 검토
- [branches.json](branches.json) — 서브 브랜치 목록(기계 판독용)

## 서브 브랜치 (착수 단계순)

| 단계 | 번호 | 브랜치 | 항목 | 우선순위 | PW |
| --- | --- | --- | --- | --- | --- |
| R0 | 13 | `Forge-refactoring-13-profiling` | [GDScript·C#·GPU·메모리 진단 및 심볼](items/13_Profiling_Memory_GPU_Symbols.md) | P0/P1 | 24-40 |
| R0 | 16 | `Forge-refactoring-16-buildExport` | [재현 가능한 빌드·헤드리스 익스포트·배포 용량](items/16_Build_Export_CI_Size.md) | P0 | 17-27 |
| R0 | 25 | `Forge-refactoring-25-gameplayAuthority` | [Unreal 방식 게임 프레임워크·서버 권한·RPC](items/25_Unreal_Gameplay_Authority_RPC.md) | P0 | 14-20 |
| R0 | 28 | `Forge-refactoring-28-dedicatedServer` | [데디케이티드 서버·PIE·운영](items/28_Dedicated_Server_Runtime_Operations.md) | P0/P1/P2 | 20-32 |
| R1 | 09 | `Forge-refactoring-09-dodEcs` | [데이터 지향 연산·ECS·멀티스레딩](items/09_DOD_ECS_Multithreading.md) | P1/P0 | 18-30 |
| R1 | 15 | `Forge-refactoring-15-collaboration` | [팀 협업·버전 관리·잠금·검수](items/15_Collaboration_VCS_Review.md) | P0/P1 | 28-46 |
| R1 | 17 | `Forge-refactoring-17-mobileQA` | [모바일 실기기 자동화·GPU 호환성·성능 회귀](items/17_Mobile_Device_QA.md) | P0 | 12-20 |
| R1 | 23 | `Forge-refactoring-23-addonPackage` | [애드온 패키지·Global Addons·CLI·서명](items/23_Addon_Package_Global_CLI.md) | P0 | 16-26 |
| R1 | 26 | `Forge-refactoring-26-replication` | [Iris 방식 상태 복제](items/26_Iris_Style_Replication.md) | P0/P1 | 26-40 |
| R1 | 27 | `Forge-refactoring-27-movementPrediction` | [이동 예측·보정·네트워크 물리](items/27_Movement_Prediction_Network_Physics.md) | P0/P1/P2 | 22-34 |
| R1 | 29 | `Forge-refactoring-29-onlineServices` | [온라인 서비스·로비·매치메이킹·릴레이](items/29_Online_Services_Sessions_Relay.md) | P0/P1 | 18-28 |
| R1 | 30 | `Forge-refactoring-30-antiCheat` | [서버 권한 검증·안티치트·UGC 격리](items/30_AntiCheat_Server_Validation.md) | P0/P1 | 14-22 |
| R2 | 01 | `Forge-refactoring-01-gpuRendering` | [GPU 주도 렌더링과 컬링](items/01_GPU_Driven_Rendering.md) | P2 | 36-56 |
| R2 | 02 | `Forge-refactoring-02-terrain` | [지형 제작·실행·서버 데이터 통합](items/02_Terrain_Integration.md) | P1 | 16-26 |
| R2 | 03 | `Forge-refactoring-03-assetStreaming` | [텍스처 중심 자산 스트리밍](items/03_Asset_Streaming.md) | P1/P2/P3 | 26-42 |
| R2 | 04 | `Forge-refactoring-04-compositor` | [Compositor·렌더 패스·셰이더 확장](items/04_Compositor_Render_Passes.md) | P2 | 26-42 |
| R2 | 05 | `Forge-refactoring-05-giLightmap` | [GI 품질·Lightmap 제작·HDDAGI 검증](items/05_GI_Lightmap_HDDAGI.md) | P1/P2/R&D | 26-41 |
| R2 | 08 | `Forge-refactoring-08-animation` | [애니메이션 임포트·리타게팅·본 제어](items/08_Animation_Import_Retargeting.md) | P1/P2 | 20-32 |
| R2 | 12 | `Forge-refactoring-12-physicsStep` | [물리 수동 스텝·상태 복구·조인트 안정성](items/12_Physics_Step_Snapshot_Stability.md) | P1/P2/R&D | 32-56 |
| R2 | 14 | `Forge-refactoring-14-audio` | [적응형 오디오 저작·FMOD/Wwise 연동](items/14_Audio_Middleware_Authoring.md) | P1/P2 | 22-36 |
| R2 | 18 | `Forge-refactoring-18-mobileSDK` | [모바일 결제·광고·분석 SDK와 터치 입력](items/18_Mobile_Live_SDK_Input.md) | P1/P0 | 18-30 |
| R2 | 22 | `Forge-refactoring-22-assetStore` | [에셋 스토어 결제·정산·평가·탐색](items/22_Asset_Store_Commerce.md) | P1 | 26-42 |
| R2 | 24 | `Forge-refactoring-24-partnership` | [벤더 인증·유지보수 파트너십·재원](items/24_Partnership_Funding_Governance.md) | P1 | 10-16 |
| R3 | 06 | `Forge-refactoring-06-hwrt` | [하드웨어 레이트레이싱 통합·확장](items/06_Hardware_Ray_Tracing.md) | R&D/P3 | 36-61 |
| R3 | 07 | `Forge-refactoring-07-deferred` | [선택적 Deferred 렌더러 연구](items/07_Deferred_Renderer.md) | R&D/P3 | 40-63 |
| R3 | 10 | `Forge-refactoring-10-csharpGDExt` | [C# GDExtension·언어 간 상호운용](items/10_CSharp_GDExtension_Interop.md) | P2/R&D | 30-52 |
| R3 | 11 | `Forge-refactoring-11-csharpDX` | [C# 개발 경험·핫리로드·IDE 통합](items/11_CSharp_DX_HotReload.md) | P2 | 14-24 |
| R3 | 19 | `Forge-refactoring-19-webgpu` | [RenderingDevice 기반 WebGPU 백엔드](items/19_WebGPU_Backend.md) | P2/R&D | 44-74 |
| R3 | 20 | `Forge-refactoring-20-csharpWeb` | [C#/.NET Web 익스포트 연구](items/20_CSharp_Web_Export.md) | P3/R&D | 30-54 |
| R3 | 21 | `Forge-refactoring-21-console` | [콘솔 포팅 경계·출시 준비·TCO](items/21_Console_Portability_TCO.md) | P3 | 12-22 |

워크트리는 착수하는 브랜치만 `D:GithubGoDotProjects-worktrees<브랜치명>`에 만든다.
