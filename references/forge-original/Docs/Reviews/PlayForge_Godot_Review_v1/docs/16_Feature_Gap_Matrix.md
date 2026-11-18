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
| F001 | 무설치 React 웹 에디터 | 플랫폼 별도 | External | High | React 유지, Godot는 Canvas 실행면만 연결 [G06](../references/Verified_Sources.md#g06) [G37](../references/Verified_Sources.md#g37) |
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
| F009 | WASM 2D/3D PIE | 어댑터 필요 | E0/E1 | High | 실제 Lua 및 Runtime Bridge 추가 [G06](../references/Verified_Sources.md#g06) [G37](../references/Verified_Sources.md#g37) |
| F010 | 웹 WebGPU Renderer | 요구 조정/포크 위험 | E3-risk | VeryHigh | 현재 기본 경로 아님. WebGL 2 허용 또는 별도 승인 [G06](../references/Verified_Sources.md#g06) |
| F011 | 웹과 DX12/Vulkan 표현 완전 동일 | 제약·미검증 | E0/E3-risk | High | Capability와 품질 차이 명시, 고급 효과 미지원 검사 [G06](../references/Verified_Sources.md#g06) [G07](../references/Verified_Sources.md#g07) |
| F012 | Thread/Extension 무조건 실행 | 제약·미검증 | E1/E2 | High | COOP/COEP·iframe·실기기 조합 통과 조건 [G06](../references/Verified_Sources.md#g06) |
| F013 | 브라우저 Native UDP 직접 연결 | 요구 조정/포크 위험 | External | High | 지원 WebSocket/WebRTC transport로 변경 [G06](../references/Verified_Sources.md#g06) |

## 렌더

| ID | 요구 | 판정 | 변경 등급 | 난이도 | 처리 방안 |
|---|---|---|---|---|---|
| F014 | Windows Direct3D 12 | 재사용 기반 | E0 | Medium | Godot Renderer/Driver 사용, 실기기 검증 [G07](../references/Verified_Sources.md#g07) |
| F015 | Android Vulkan | 재사용 기반 | E0 | Medium | Mobile 프로필과 기기별 QA [G07](../references/Verified_Sources.md#g07) |
| F016 | iOS 네이티브 | 어댑터 필요 | E0/E1 | High | Metal·서명·클라우드 macOS 빌드 [G07](../references/Verified_Sources.md#g07) [G45](../references/Verified_Sources.md#g45) |
| F017 | Mobile/Desktop PBR | 어댑터 필요 | E0/E1 | Medium | 공통 Material IR을 Godot 템플릿에 매핑 [G07](../references/Verified_Sources.md#g07) [G11](../references/Verified_Sources.md#g11) |
| F018 | Toon/Outline | 어댑터 필요 | E0/E1 | Medium | Toon 기초 재사용, outline·성능·투명 검증 [G11](../references/Verified_Sources.md#g11) |
| F019 | 공통 HLSL 재질 직접 사용 | 요구 조정/포크 위험 | E3-risk | VeryHigh | Godot Shader 생성으로 요구 조정 또는 별도 컴파일 경로 검증 [G10](../references/Verified_Sources.md#g10) |
| F020 | 자체 RHI/Render Graph 전체 유지 | 요구 조정/포크 위험 | E3-risk | VeryHigh | Godot 소유로 변경 승인, 중복 Renderer 금지 [G08](../references/Verified_Sources.md#g08) [G09](../references/Verified_Sources.md#g09) |
| F021 | 기본 Debug View | 어댑터 필요 | E0/E1 | Medium | 지원 DebugDraw·진단 재질, View별 분리 [G11](../references/Verified_Sources.md#g11) [G15](../references/Verified_Sources.md#g15) |
| F022 | 정확한 Quad Overdraw/GPU 비용 | 제약·미검증 | E1/E3-risk | High | 실측·정적 추정 구분, 공개 hook별 확인 [G08](../references/Verified_Sources.md#g08) [G09](../references/Verified_Sources.md#g09) |
| F023 | Orthographic/Perspective | 재사용 기반 | E0 | Low | Projection/aspect 의미를 PF 카메라에 매핑 [G14](../references/Verified_Sources.md#g14) |
| F024 | 다중 카메라 순차 합성 | 어댑터 필요 | E0/E1 | Medium | SubViewport 합성과 비용 시험 [G14](../references/Verified_Sources.md#g14) [G15](../references/Verified_Sources.md#g15) |
| F025 | 2D Sorting Layer/Order | 어댑터 필요 | E0/E1 | Medium | 안정 Layer ID를 z/tree/y-sort 계약에 매핑 [G12](../references/Verified_Sources.md#g12) |
| F026 | Unity SortingGroup 완전 동일 | 제약·미검증 | E1 | High | 중첩·외부 결속·tie-breaker 시험 후 범위 확정 [G12](../references/Verified_Sources.md#g12) |
| F027 | 임의 3D RenderQueue/패스 정렬 | 요구 조정/포크 위험 | E3-risk | High | 고정 패스+제한 priority로 조정 승인 필요 [G13](../references/Verified_Sources.md#g13) |

## 코어

| ID | 요구 | 판정 | 변경 등급 | 난이도 | 처리 방안 |
|---|---|---|---|---|---|
| F028 | Unreal 스타일 C++ 표면 API | 어댑터 필요 | E1 | Medium | 선별된 façade, 엔진 타입 전체 재작성 안 함 [G05](../references/Verified_Sources.md#g05) |
| F029 | FName/StringName | 어댑터 필요 | E0/E1 | Low | 내부 interning 재사용, 영구 ID는 PF 소유 [G33](../references/Verified_Sources.md#g33) |
| F030 | GameplayTag | 어댑터 필요 | E1 | Medium | PF dictionary·검증·네트워크 ID 유지  |
| F031 | FLocText/AI 다국어 | 어댑터 필요 | E0/E1 | Medium | key/source/args 유지, formatter 의미 검증  |
| F032 | CDO/Class/Prefab/Instance override | 어댑터 필요 | E1 | High | Source Schema resolver와 Runtime 투영 [G25](../references/Verified_Sources.md#g25) [G26](../references/Verified_Sources.md#g26) |
| F033 | Component GUID/Property ID | 어댑터 필요 | E1 | High | ClassDB는 메타데이터 기반, 영구 ID는 별도 [G25](../references/Verified_Sources.md#g25) [G27](../references/Verified_Sources.md#g27) |
| F034 | INI/CVar/Scalability/DeviceProfile | 어댑터 필요 | E0/E1 | Medium | registry·우선순위·apply mode 별도 구현 [G34](../references/Verified_Sources.md#g34) [G35](../references/Verified_Sources.md#g35) [G36](../references/Verified_Sources.md#g36) |
| F035 | 전체 내부 Allocator/Job 시스템 대체 | 요구 조정/포크 위험 | E3-risk | VeryHigh | 미들웨어별 어댑터와 budget만, Godot 전역 교체 금지 [G20](../references/Verified_Sources.md#g20) [G21](../references/Verified_Sources.md#g21) |

## Lua

| ID | 요구 | 판정 | 변경 등급 | 난이도 | 처리 방안 |
|---|---|---|---|---|---|
| F036 | Lua 5.4 게임플레이 | 어댑터 필요 | E1/E2 | High | 확장 후보 검증, 플랫폼 공통 PF API 유지 [G23](../references/Verified_Sources.md#g23) [G38](../references/Verified_Sources.md#g38) |
| F037 | UGC Lua 샌드박스 | 어댑터 필요 | E1/External | VeryHigh | whitelist+실행 예산+프로세스 격리, 자동 안전 아님 [G37](../references/Verified_Sources.md#g37) [G38](../references/Verified_Sources.md#g38) |
| F038 | 코드 Hot Reload/Debug | 제약·미검증 | E1 | High | 함수·closure·coroutine·구독 규약 한정  |

## 물리

| ID | 요구 | 판정 | 변경 등급 | 난이도 | 처리 방안 |
|---|---|---|---|---|---|
| F039 | Havok Physics | 어댑터 필요 | E1/E2 | VeryHigh | PhysicsServer 또는 독립 World 어댑터·SDK 조건 [G16](../references/Verified_Sources.md#g16) [G18](../references/Verified_Sources.md#g18) |
| F040 | Box2D 3.x | 어댑터 필요 | E1 | High | 2D server API 매핑, 기본 물리와 별개 [G17](../references/Verified_Sources.md#g17) |
| F041 | 실행 중 PhysicsServer 교체 | 요구 조정/포크 위험 | E3-risk | High | 초기 선택 후 세션 재시작 [G18](../references/Verified_Sources.md#g18) |
| F042 | Havok Navigation | 제약·미검증 | E1/E2 | High | PF Provider·원본 재Cook·agent/query 의미 시험 [G42](../references/Verified_Sources.md#g42) |
| F043 | Havok Animation | 제약·미검증 | E1/E2 | High | Skeleton 포즈 매핑, Godot 기본과 별도 제품 [G43](../references/Verified_Sources.md#g43) |
| F044 | Godot 기본 Navigation/Animation 대안 | 재사용 기반 | E0 | Medium | 대안이며 Havok 요구 충족으로 자동 표시 금지 [G42](../references/Verified_Sources.md#g42) [G43](../references/Verified_Sources.md#g43) |

## 성능

| ID | 요구 | 판정 | 변경 등급 | 난이도 | 처리 방안 |
|---|---|---|---|---|---|
| F045 | 선택적 ECS/SIMD Batch | 어댑터 필요 | E1 | High | 고밀도 배열 계산과 Server API 출력 [G20](../references/Verified_Sources.md#g20) [G21](../references/Verified_Sources.md#g21) |
| F046 | 엔진 전체 DOTS화 | 요구 조정/포크 위험 | E3-risk | VeryHigh | 핫스팟만 최적화, 전체 Node replacement 제외 [G20](../references/Verified_Sources.md#g20) [G21](../references/Verified_Sources.md#g21) |

## 네트워크

| ID | 요구 | 판정 | 변경 등급 | 난이도 | 처리 방안 |
|---|---|---|---|---|---|
| F047 | 고정 PF 프로토콜/Iris식 복제 | 어댑터 필요 | E1 | VeryHigh | 독립 Network ID/Schema, Godot 고수준 복제와 중복 금지 [G30](../references/Verified_Sources.md#g30) [G31](../references/Verified_Sources.md#g31) |
| F048 | 초기 Replication 완료 후 시작 | 어댑터 필요 | E1 | High | 서버 required set·적용 ACK·Collision·StartPlay  |
| F049 | Listen 단일 Authority Host | 어댑터 필요 | E0/E1 | High | Host Client World/Loopback 없음  |
| F050 | Dedicated headless 실행 | 재사용 기반 | E0 | Medium | 서버 template·리소스 제거·실제 검증 [G32](../references/Verified_Sources.md#g32) |
| F051 | 여러 GodotInstance를 한 프로세스에 생성 | 요구 조정/포크 위험 | E3-risk | VeryHigh | 프로세스 분리, 논리 World와 구분 [G22](../references/Verified_Sources.md#g22) |
| F052 | 다중 Room 고밀도 서버 | 제약·미검증 | E1/External | VeryHigh | 동일 Release에 한해 단계적 계측·격리 [G20](../references/Verified_Sources.md#g20) [G22](../references/Verified_Sources.md#g22) |
| F053 | EOS Voice/EAC/Matching | 제약·미검증 | E1/External | High | 별도 SDK·계약·플랫폼 검증, 엔진 도입과 무관  |

## 월드

| ID | 요구 | 판정 | 변경 등급 | 난이도 | 처리 방안 |
|---|---|---|---|---|---|
| F054 | World Cell/Level Streaming | 어댑터 필요 | E0/E1 | High | 로컬 resource 준비와 활성화 예산 [G29](../references/Verified_Sources.md#g29) |
| F055 | 장거리 Teleport 충돌 안전 | 어댑터 필요 | E1 | High | Cell pin·physics query ready·epoch·safe commit  |
| F056 | Texture Mip Residency | 제약·미검증 | E0/E3-risk | VeryHigh | 4.8 실험 채널 검증 또는 요구 재승인, 일반 mip와 구분 [G39](../references/Verified_Sources.md#g39) [G40](../references/Verified_Sources.md#g40) [G41](../references/Verified_Sources.md#g41) |
| F057 | Actor 단위 Asset Streaming | 범위 제외 | None | None | 사용자 요구로 제외  |
| F058 | 런타임 CDN 에셋 다운로드 | 범위 제외 | None | None | 사용자 요구로 제외, 실행 전 설치만  |

## 에셋

| ID | 요구 | 판정 | 변경 등급 | 난이도 | 처리 방안 |
|---|---|---|---|---|---|
| F059 | 원본 Import/Preview | 어댑터 필요 | E0/External | Medium | 클라우드 Import, 웹 정적 미리보기 [G28](../references/Verified_Sources.md#g28) |
| F060 | Pre-Cook/증분 캐시 | 어댑터 필요 | E0/External | High | Godot 버전·실제 입력 기반 task cache [G28](../references/Verified_Sources.md#g28) |
| F061 | 불변 Source+Runtime Release | 플랫폼 별도 | External | High | 원본·생성 프로젝트·엔진 lock·검증 결과 보관  |
| F062 | 무료 공유/검색/버전 고정 | 플랫폼 별도 | External | Medium | 단순 공유 registry와 source closure  |

## 운영

| ID | 요구 | 판정 | 변경 등급 | 난이도 | 처리 방안 |
|---|---|---|---|---|---|
| F063 | 서버 UGC 보안 격리 | 플랫폼 별도 | External | VeryHigh | Lua만으로 경계 보장하지 않음  |
| F064 | 콘솔 미래 지원 | 제약·미검증 | E1/E2 | High | 승인 SDK와 포트 경로 별도 확인 [G44](../references/Verified_Sources.md#g44) |
| F065 | 패키지 50/100 MB 한도 충족 | 제약·미검증 | E0/External | High | 실제 template+content 측정, quota 조정 자동 승인 금지  |
| F066 | AI 자동 Godot upstream PR | 범위 제외 | None | None | 업스트림 기여 정책과 내부 제품 사용 구분 [G47](../references/Verified_Sources.md#g47) |
