# Forge-Refactoring

Godot 엔진 개선 로드맵(30개 항목)의 SSOT. 엔진 소스를 바꾸는 항목은 **godot-engine 포크 저장소**(`D:/Github/godot-engine`)의 `Forge-Refactoring-*` 브랜치에서, 엔진을 바꾸지 않는 항목은 해당 영역의 Forge 계열 브랜치에서 진행한다.

- [00_Development_Roadmap.md](00_Development_Roadmap.md) — 통합 로드맵 원문
- [90_Source_Coverage_and_Validation.md](90_Source_Coverage_and_Validation.md) — 원문 대응·검증 기록
- [REVIEW.md](REVIEW.md) — 저장소 대조 검토
- [RESEARCH_INPUTS.md](RESEARCH_INPUTS.md) — 원본 계획서 30개와 첨부 ZIP 검증 기록
- [research/Forge_Godot_Extension_Case_Study_20261125.md](research/Forge_Godot_Extension_Case_Study_20261125.md) — Forge 유사 Godot 확장 사례 조사
- [SSOT.md](SSOT.md) — 중복 계획·구현의 정본 지정과 보완 사항
- [branches.json](branches.json) — 항목별 통합 대상(기계 판독용)

## 엔진 변경 → Forge-Refactoring 계열

| 단계 | 번호 | 항목 | 통합 대상 브랜치 | 비고 | 우선순위 | PW |
| --- | --- | --- | --- | --- | --- | --- |
| R2 | 01 | [GPU 주도 렌더링과 컬링](items/01_GPU_Driven_Rendering.md) | `Forge-Refactoring-01-gpuRendering` |  | P2 | 36-56 |
| R2 | 03 | [텍스처 중심 자산 스트리밍](items/03_Asset_Streaming.md) | `Forge-Refactoring-03-assetStreaming` |  | P1/P2/P3 | 26-42 |
| R2 | 04 | [Compositor·렌더 패스·셰이더 확장](items/04_Compositor_Render_Passes.md) | `Forge-Refactoring-04-compositor` |  | P2 | 26-42 |
| R2 | 05 | [GI 품질·Lightmap 제작·HDDAGI 검증](items/05_GI_Lightmap_HDDAGI.md) | `Forge-Refactoring-05-giLightmap` |  | P1/P2/R&D | 26-41 |
| R2 | 12 | [물리 수동 스텝·상태 복구·조인트 안정성](items/12_Physics_Step_Snapshot_Stability.md) | `Forge-Refactoring-12-physicsStep` | Forge-HavokPhysics와 capability 계약 공유 | P1/P2/R&D | 32-56 |
| R3 | 06 | [하드웨어 레이트레이싱 통합·확장](items/06_Hardware_Ray_Tracing.md) | `Forge-Refactoring-06-hwrt` |  | R&D/P3 | 36-61 |
| R3 | 07 | [선택적 Deferred 렌더러 연구](items/07_Deferred_Renderer.md) | `Forge-Refactoring-07-deferred` |  | R&D/P3 | 40-63 |
| R3 | 19 | [RenderingDevice 기반 WebGPU 백엔드](items/19_WebGPU_Backend.md) | `Forge-Refactoring-19-webgpu` |  | P2/R&D | 44-74 |
| 철회 | 20 | [C#/.NET Web 익스포트 연구](plans/20_CSharp_Web_Export.md) | — | SSOT D6 · GDScript만 지원 | — | — |
| R3 | 21 | [콘솔 포팅 경계·출시 준비·TCO](items/21_Console_Portability_TCO.md) | `Forge-Refactoring-21-console` | 플랫폼 포팅 레이어 | P3 | 12-22 |

## 엔진 무변경 → Forge 계열

| 단계 | 번호 | 항목 | 통합 대상 브랜치 | 비고 | 우선순위 | PW |
| --- | --- | --- | --- | --- | --- | --- |
| R0 | 13 | [GDScript·C#·GPU·메모리 진단 및 심볼](items/13_Profiling_Memory_GPU_Symbols.md) | `Forge-Profiling` | 신규 (R0 착수) | P0/P1 | 24-40 |
| R0 | 16 | [재현 가능한 빌드·헤드리스 익스포트·배포 용량](items/16_Build_Export_CI_Size.md) | `Forge-BuildExport` | 신규 (R0 착수) | P0 | 17-27 |
| R0 | 25 | [Unreal 방식 게임 프레임워크·서버 권한·RPC](items/25_Unreal_Gameplay_Authority_RPC.md) | `Forge-Multiplayer` | 신규 (R0 착수) | P0 | 14-20 |
| R0 | 28 | [데디케이티드 서버·PIE·운영](items/28_Dedicated_Server_Runtime_Operations.md) | `Forge-Multiplayer` | 신규 (R0 착수, 25와 한 스파이크) | P0/P1/P2 | 20-32 |
| R1 | 09 | [데이터 지향 연산·ECS·멀티스레딩](items/09_DOD_ECS_Multithreading.md) | `Forge-ISM-profile` | 기존 브랜치 (MultiMesh/인스턴스 벤치마크) | P1/P0 | 18-30 |
| R1 | 15 | [팀 협업·버전 관리·잠금·검수](items/15_Collaboration_VCS_Review.md) | `Forge-Collaboration` | 신규 (착수 시 생성) | P0/P1 | 28-46 |
| R1 | 17 | [모바일 실기기 자동화·GPU 호환성·성능 회귀](items/17_Mobile_Device_QA.md) | `Forge-GamerQA` | 기존 브랜치 | P0 | 12-20 |
| R1 | 23 | [애드온 패키지·Global Addons·CLI·서명](items/23_Addon_Package_Global_CLI.md) | `Forge-AssetStore` | 기존 브랜치 | P0 | 16-26 |
| R1 | 26 | [Iris 방식 상태 복제](items/26_Iris_Style_Replication.md) | `Forge-Multiplayer` | 신규 (25와 같은 브랜치) | P0/P1 | 26-40 |
| R1 | 27 | [이동 예측·보정·네트워크 물리](items/27_Movement_Prediction_Network_Physics.md) | `Forge-Multiplayer` | 신규 (25와 같은 브랜치) | P0/P1/P2 | 22-34 |
| R1 | 29 | [온라인 서비스·로비·매치메이킹·릴레이](items/29_Online_Services_Sessions_Relay.md) | `Forge-Multiplayer` | JoinTicket 계약만 — 계정·로그인은 Hub-SSO, 크로스플레이 릴레이는 Forge-Publish | P0/P1 | 18-28 |
| R1 | 30 | [서버 권한 검증·안티치트·UGC 격리](items/30_AntiCheat_Server_Validation.md) | `Forge-Multiplayer` | 게임 내 validator — 빌드/PIE 격리는 Forge-BuildExport | P0/P1 | 14-22 |
| R2 | 02 | [지형 제작·실행·서버 데이터 통합](items/02_Terrain_Integration.md) | `Forge-Terrain` | 신규 (착수 시 생성) | P1 | 16-26 |
| R2 | 08 | [애니메이션 임포트·리타게팅·본 제어](items/08_Animation_Import_Retargeting.md) | `Forge-Avatar` | 기존 브랜치 (Forge-UnrealPort·Forge-Tripo 리타게팅과 수렴) | P1/P2 | 20-32 |
| R2 | 14 | [적응형 오디오 저작·FMOD/Wwise 연동](items/14_Audio_Middleware_Authoring.md) | `Forge-Audio` | 신규 (착수 시 생성) | P1/P2 | 22-36 |
| R2 | 18 | [모바일 결제·광고·분석 SDK와 터치 입력](items/18_Mobile_Live_SDK_Input.md) | `Forge-MobileSDK` | 신규 (착수 시 생성) — 원장·IAP 서버는 Hub-Billing·Hub-IOS 소유 | P1/P0 | 18-30 |
| R2 | 22 | [에셋 스토어 결제·정산·평가·탐색](items/22_Asset_Store_Commerce.md) | `PlayHub-Store` | 기존 브랜치 (결제는 Hub-Billing) | P1 | 26-42 |
| R2 | 24 | [벤더 인증·유지보수 파트너십·재원](items/24_Partnership_Funding_Governance.md) | `Forge-Refactoring` | 문서 전용 (코드 없음) | P1 | 10-16 |
| 철회 | 10 | [C# GDExtension·언어 간 상호운용](plans/10_CSharp_GDExtension_Interop.md) | — | SSOT D6 · GDScript만 지원 | — | — |
| 철회 | 11 | [C# 개발 경험·핫리로드·IDE 통합](plans/11_CSharp_DX_HotReload.md) | — | SSOT D6 · GDScript만 지원 | — | — |

엔진 변경 브랜치는 `godot-engine` 서브모듈(엔진 포크) 체크아웃이 필요하므로 착수할 때 워크트리를 만든다. 워크트리 위치는 `D:GithubGoDotProjects-worktrees<브랜치명>`.
