# 원문 대응표·사실 보정·산출물 검증 기록

**기준일: 2026-11-24 / 대상: Godot 개선 개발 계획 30개와 통합 로드맵**

## 1. 입력 자료와 사용 범위

| 항목 | 확인 내용 |
| --- | --- |
| 원본 파일 | 유니티 대비 고도 엔진 개선방안.pdf |
| 원본 크기 | 342,991 bytes |
| PDF 페이지 | 14쪽; 본문 1-10쪽, 참고문헌 10-14쪽 |
| 원본 SHA-256 | 043d3c4df0f646facf75dccbed5c19241053b10c939a5e48801a891ac6ce4784 |
| 사용자 추가 지시 | 개선 방안별 Markdown 파일; 멀티플레이·네트워크·데디서버·Iris는 Unreal 방식 |
| 원본 취급 | 원본 파일을 수정하지 않고 텍스트를 추출해 분석 |
| 확인 방법 | 전체 텍스트 추출, 본문 항목 검토, 핵심 개선안 7-8쪽을 이미지로 확인 |
| 결과 형식 | 개별 계획 30개 + 통합 로드맵 + 본 기록 = Markdown 32개 |

PDF는 요구사항과 문제의식의 출처다. 버전·공식 지원·성능·가격·시장 수치를 모두 독립 검증한 보고서로 취급하지 않았다. 원문 참고문헌 108개 전체를 재검증한 작업도 아니다. 계획의 판단에 필요한 기능은 공식 엔진 문서·저장소·벤더 문서로 다시 확인했다.

## 2. 원문 개선 항목별 대응표

### 2.1 렌더링·지형·자산·애니메이션

| 원문 쪽 | 개선 항목 | 대응 계획 | 처리 |
| --- | --- | --- | --- |
| 2 | GPU resident 데이터·GPU driven draw·GPU occlusion | 01 | instance data, Hi-Z, draw submission, mobile fallback와 실측 gate |
| 2·8-9 | Terrain3D 및 모바일 호환 | 02 | 선택 addon, 지형 제작·collision/nav·서버 데이터, 저사양 fallback |
| 2-3·7-8 | texture mip streaming | 03 | texture 우선, 예산·resident 상태·비동기 로드·해제 검증 |
| 2-3·7-8 | LOD mesh·scene 메모리 스트리밍 | 03 | texture 다음 선택 확장; 표시 LOD와 실제 unload 구분 |
| 3·7 | Compositor 다중 패스·buffer 접근·shader template | 04 | 제한된 기존 hook 재사용과 필요한 확장 계약 |
| 3·7-8 | Lightmap workflow·GI 품질 | 05 | bake cache·dirty tracking·시각 회귀 |
| 3·7-8 | SDFGI→HDDAGI | 05 | Draft를 상용 확정으로 보지 않는 독립 실험 gate |
| 3·7 | HWRT API·Forward+ 통합 | 06 | 기존 RT API 조사 후 수명·효과·backend 통합 |
| 3·7 | 선택 Deferred renderer | 07 | 고밀도 light 장면의 이득 검증 후 조건부 구현 |
| 3 | 애니메이션 import·retarget·bone constraint·spring bone | 08 | 기존 modifier 재사용, mapping·재임포트·검증 도구 |
| 3 | FBX/glTF 내부 subresource 접근·편집 | 08 | 원본/import 결과·override·애니메이션 데이터 계약 |

### 2.2 연산·언어·물리·진단·협업

| 원문 쪽 | 개선 항목 | 대응 계획 | 처리 |
| --- | --- | --- | --- |
| 3·7-9 | DOD/ECS·Flecs·RID·MultiMesh·국소 native 최적화 | 09 | hot loop별 SoA·batch·job graph, 전체 게임 ECS 강제 없음 |
| 3·7-8 | SceneTree 멀티스레딩 감사·회귀 | 09 | 주 스레드 boundary·resource 수명·측정된 경합 검증 |
| 3-4·7-8 | C# GDExtension 통합·바이너리/마샬링 | 10 | 철회 — 2026-11-25 결정: 게임 스크립트는 GDScript만 지원, Lua·C# 미지원 |
| 4·9 | C# IDE·hot reload·문서 | 11 | 철회 — 2026-11-25 결정: 게임 스크립트는 GDScript만 지원, Lua·C# 미지원 |
| 3·5·7-8 | 수동 physics step·rollback 기반 | 12 + 27 | backend capability·snapshot·journal·게임 이벤트 재실행 |
| 3 | 조인트·로프·softbody/cloth 안정성 | 12 | backend별 선택 범위와 stress fixture, 기능 자동 동등성 없음 |
| 6-8 | GDScript memory profiler·GPU/VRAM·frame 진단 | 13 | 논리 객체와 실제 할당, clock/trace 연결, 정확/추정치 구분 |
| 6-8 | 데스크톱 분리 debug symbols | 13 + 16 | build identity·symbol bundle·크래시 재현·배포 |
| 6·9 | FMOD/Wwise·적응형 음악·RTPC·공간음향 | 14 | 공통 audio API, 기존 AudioServer 활용, 선택 vendor adapter |
| 6·8-9 | Git/LFS·씬 분할·UID·병합·독점 잠금 | 15 | revision/snapshot·UID 검증·파일/씬 잠금·복원 |
| 6·8 | Perforce·Unity VCS/Plastic 통합 | 15 §13 | provider별 상세 WBS·추가 공수·lock/credential/복구 인수 |
| 6·9 | 웹 검수·실시간 협업·AI 도구 연결 | 15 | 편집 operation log, build별 review, 게임 복제와 분리 |

### 2.3 플랫폼·빌드·스토어·생태계

| 원문 쪽 | 개선 항목 | 대응 계획 | 처리 |
| --- | --- | --- | --- |
| 6-9 | headless CLI export·CI 안정성 | 16 | 버전 pin·import/export·cache·재현 빌드·오류 회수 |
| 5·9 | 커스텀 export template·모듈/용량 축소 | 16 | capability 기반 module set·ABI/arch·용량 기준 |
| 5·7·9 | 실기기 자동화 팜·Mali/Adreno·성능 | 17 | 기기 matrix·발열·crash·provider 교체·지정 예산 |
| 5·9 | IAP·AdMob/AppLovin·Firebase/analytics 등 SDK | 18 | billing 검증·원장·SDK version matrix·adapter |
| 5 | 조이스틱·온스크린 입력 | 18 | 기존 터치 버튼 기반 pointer 소유권·safe area·조이스틱 |
| 5·7-8 | WebGPU·브라우저 compute/3D | 19 | RenderingDevice backend·제한 renderer·device loss·fallback |
| 5·7-8 | C#/.NET WASM Web export | 20 | 철회 — 2026-11-25 결정: 게임 스크립트는 GDScript만 지원, Lua·C# 미지원 |
| 4·9-10 | 콘솔·W4/포팅사·버전 pin·TCO | 21 | 계약·SDK 경계·한 콘솔 slice·가격 입력형 TCO |
| 6-8 | 유료 Asset Store·결제·정산 | 22 | 자체 Hub/Forge commerce, PSP·정산 상태·복구 |
| 6-8 | 리뷰 점수·태그 탐색·유통 품질 | 22 | 검증 구매/사용 기록·review·신고·검색·품질 지표 |
| 6-8 | Global Addons·자동 업데이트·CLI 발행 | 23 | project lock·공용 cache·update preview·immutable publish |
| 6-8 | 서명·공급망·package 검증 | 23 | signature/identity와 기능 인증 분리 |
| 7-8 | vendor 공식 GDExtension·인증·노출 혜택 | 24 | 검증 등급·지원 계약·유지보수 수명·배지 |
| 1·7-8 | 기금·기업 지정 후원·상업 생태계 재원 | 24 | 자체 예산·외부 후원/파트너 제안·지표 |
| 9-10 | 2-4주 spike→1-3개월 기반→선택 최적화/출시 | 00 + 16/17/21 | 상대 일정·Go/No-Go·포크 유지비·TCO |

### 2.4 사용자 지정 Unreal 방식 네트워크

| 원문/추가 요구 | 대응 계획 | 처리 |
| --- | --- | --- |
| 서버 권한·복잡한 gameplay 상태 | 25 | GameMode/GameState/PlayerState/Controller/Pawn·roles·RPC |
| 복제 확장성·Iris 기능 | 26 | bridge/fragment/schema/handle·dirty/quantization·ACK delta·필터·우선순위·dormancy |
| 예측·보정·lag compensation | 27 | 입력 기록·권위 snapshot·replay·smoothing·hit rewind |
| 물리 rollback·network physics | 12 + 27 | 수동 step뿐 아니라 snapshot·이벤트·backend capability 조건 |
| 데디케이티드 서버·2클라이언트 검증 | 28 | local player 없는 server·독립 process·전용 export·PIE 유사 실행 |
| 서버 확장·멀티세션·롤백 운영 | 28 | 한 경기/프로세스 우선·lease·drain·신규 경기 배정 전환 |
| 인증·로비·matchmaking·relay | 29 | provider 중립 인터페이스·build/region partition·개별 ticket·WebRTC |
| EAC/EOS·서버 검증·정보 노출 방지 | 30 | 행동 검증·typed parser·선택 integrity SDK·격리·증거 |

PDF의 Netfox·Monke-Net·Nakama·GodotSteam 등은 비교·선택 adapter 후보로만 다룬다. 멀티플레이의 기본 구조를 특정 Unity식 패키지나 peer-authority 구조로 고정하지 않고 사용자 요청을 우선했다.

## 3. 원문 단정에서 보정한 사항

| 주제 | 공식 확인 또는 검증 상태 | 계획의 처리 |
| --- | --- | --- |
| Godot 기준 버전 | 공식 다운로드가 4.7.2를 표시 | 초기 후보만 지정; 실제 commit·template·SDK pin은 착수 gate |
| RetargetModifier3D 부재 | 4.7 공식 클래스 문서에 존재 | 08을 신규 클래스 전면 개발보다 import/retarget workflow·회귀 개선으로 설계 |
| HWRT API 전무 | 4.7 RenderingDevice에 BLAS/TLAS·RT API와 일부 Experimental 표기 | 06은 API 노출 여부 조사 후 미충족 통합·수명·품질 개발 |
| texture streaming 출시 상태 | PR #113429가 master에 병합됨 | 병합과 선택 tag 포함·플랫폼 지원·제품 인수는 별도 확인 |
| HDDAGI 전면 교체 일정 | PR #86267은 열람 시 Draft | 제품 기본 경로의 선행이 아닌 R&D gate |
| Terrain3D 플랫폼 단정 | 공식 플랫폼 문서가 renderer/OS별 지원·제약을 구분 | Compatibility/모바일을 일괄 불가 처리하지 않고 실제 target 인증 |
| C# 바인딩 이전 | godot-dotnet 공식 저장소는 GDExtension 기반, WIP 경고 | 철회 — 2026-11-25 결정: 게임 스크립트는 GDScript만 지원, Lua·C# 미지원 |
| Hot Reload 전무 | Rider 2025.1에 Godot C# breakpoint 중 Hot Reload 안내 | 철회 — 2026-11-25 결정: 게임 스크립트는 GDScript만 지원, Lua·C# 미지원 |
| 온스크린 입력 노드 전무 | TouchScreenButton 공식 API와 multitouch 지원 존재 | 18은 joystick·safe area·입력 통합의 빈 부분을 개발 |
| Firebase Test Lab 고정 사용 | 공식 문서가 2027-09-30 종료 예정·후속 preview 표시 | 17은 provider 교체 경계와 로컬 기기 기준선 포함 |
| MIT의 소스 공개 강제 | Godot 라이선스 문서는 변경판의 비공개 배포도 허용하고 고지를 요구 | 21에서 MIT 성격과 콘솔 SDK/NDA·계약 문제를 구분 |
| MultiplayerSynchronizer는 원시 타입만 | 공식 제한은 Object/Resource·RID 등 구체 대상 | 26은 정확한 제한과 항목별 컬렉션 delta 요구를 구분 |
| Godot 서버 40 CCU 한계 | 원문에 인용된 제한된 외부 사례, 이 작업에서 재현 안 함 | 보편적 엔진 한계로 쓰지 않고 N0-N3 실험 정의 |
| 100+ CCU 및 결정론 | 구현·부하·cross-CPU 실험을 수행하지 않음 | 100인은 목표, physics backend별 능력·오차·보정 gate |
| space_step만으로 rollback | snapshot·게임 journal·수명·이벤트 재실행도 필요 | 12/27에서 입력·state·side-effect contract 분리 |
| Iris가 예측/호스팅까지 제공 | 공식 Iris와 movement/network physics 문서가 별도 책임을 설명 | 25-30으로 모듈화; Iris 명칭만으로 품질 완료 판정 금지 |
| Global Addons·스토어 유료화 | 공식 Store roadmap에 계획으로 표시 | 22/23은 자체 서비스 기능, 공식 서비스 지원은 외부 결정 |
| Cloud Run=공개 UDP 서버 | 공식 runtime은 public service URL과 private Direct VPC ingress를 구분 | 28에서 HTTP control plane과 게임 endpoint를 분리 |

### 핵심 확인 출처

- [Godot download](https://godotengine.org/download/)
- [RetargetModifier3D 4.7](https://docs.godotengine.org/en/4.7/classes/class_retargetmodifier3d.html)
- [RenderingDevice 4.7](https://docs.godotengine.org/en/4.7/classes/class_renderingdevice.html)
- [Texture mip streaming PR #113429](https://github.com/godotengine/godot/pull/113429)
- [HDDAGI PR #86267](https://github.com/godotengine/godot/pull/86267)
- [Terrain3D platforms](https://terrain3d.readthedocs.io/en/stable/docs/platforms.html)
- [TouchScreenButton](https://docs.godotengine.org/en/stable/classes/class_touchscreenbutton.html)
- [Firebase Test Lab migration](https://firebase.google.com/docs/test-lab/migrate)
- [Godot license](https://godotengine.org/license/)
- [MultiplayerSynchronizer](https://docs.godotengine.org/en/stable/classes/class_multiplayersynchronizer.html)
- [Jolt Physics architecture](https://jrouwe.github.io/JoltPhysics/)
- [Iris introduction](https://dev.epicgames.com/documentation/unreal-engine/introduction-to-iris-in-unreal-engine)
- [Networked Physics overview](https://dev.epicgames.com/documentation/unreal-engine/networked-physics-overview)
- [Godot Asset Store roadmap](https://store.godotengine.org/roadmap/)
- [Cloud Run container runtime contract](https://docs.cloud.google.com/run/docs/container-contract)

출처는 2026-11-24에 확인했다. 각 개별 계획에도 관련 공식 링크를 넣었다. 일부 stable 문서와 Epic 문서의 표시 버전은 바뀔 수 있으므로 구현 시 고정 버전의 source/API와 다시 대조해야 한다.

## 4. 이번 작성에서 수행한 교차 검토와 보정

| 검토 항목 | 최종 처리 |
| --- | --- |
| 추가 client의 입장 ticket 재사용 | 같은 session_id에 각 identity·slot별 개별 single-use ticket |
| 프로세스 내 멀티세션과 UGC 보안 | 신뢰된 동일 tenant/배포 코드만 허용; 불신 UGC는 OS 격리 |
| rollback 때 게임 신호 처리 | 내부 simulation callback 재실행, 외부 presentation·영구 보상만 dedup/commit |
| 입력 ACK와 tick 비교 | 연속 처리 경계·권위 상태 원자 캡처·input_seq↔server_tick 매핑 |
| transport ACK와 delta baseline | 전송 ACK, 저장된 상태 ACK, 실제 게임 적용 ACK 구별 |
| 역순 snapshot·tombstone | last_applied_revision·세대·world epoch로 과거 덮어쓰기/부활 방지 |
| 작은 누수 허용 위험 | 수치 미만이어도 설명되지 않는 지속 메모리 증가면 실패 |
| UGC와 서버 credential | 장기 secret을 trusted broker에 두고 불신 실행 프로세스와 분리 |
| 28↔29 의존성 순환 | session/join/allocation 계약 먼저 동결 후 runtime와 service 병행 |
| Perforce/Unity VCS 단순 후순위 표기 | 15에 별도 작업·추가 공수·잠금·복구·검증 부록 추가 |
| 원문 깨진 span | 원문의 편집 흔적을 계획서에 복사하지 않고 정상 문장으로 재작성 |

## 5. 문서·파일 검증 결과

| 검사 | 결과 | 범위 |
| --- | --- | --- |
| 파일 구성 | 개별 계획 30개 + 공통 문서 2개 | 두 자리 계획 번호 01-30, 중복·누락 없음 |
| 텍스트 | UTF-8 읽기·손상 문자 검사 통과 | Markdown 전체 32개 |
| 문서 구조 | 최상위 제목·제목 간격·코드펜스 검사 통과 | Markdown 전체 32개 |
| 내부 링크 | 상대 링크 76개, 깨진 대상 0개 | 패키지 내 파일 경로 |
| 작업 공수 | 32개 WBS 표의 행 합계와 선언 합계 일치 | 본체 30개 + 선택 VCS adapter 2개 |
| 인용·편집 흔적 | 내부 검색 토큰·원문 깨진 span·미완성 작업 표시 없음 | 본문과 코드 블록 포함 |
| 원본 동일성 | 원본 PDF SHA-256 일치 | 위 입력 hash |
| 기술 교차 검토 | 권한·ACK·이벤트·ticket·격리·의존성 보정 반영 | 4절 내역 |
| ZIP | CRC·원본 bytes 대조 후 제공 | 정확한 검사 결과는 다운로드 안내와 패키지 manifest 참조 |

문서 구조 검사는 실제 코드/API 실행을 대신하지 않는다. Markdown 표·코드펜스·상대 링크는 파일의 일관성 검사이며 모든 Markdown viewer의 동일한 렌더링을 보장하는 시험은 아니다.

## 6. 수행하지 않은 검증

아래 항목은 이후 계획을 실행할 때 필요한 인수 시험이며 이번 문서 작성에서는 수행하지 않았다.

- 엔진 repository checkout, patch 적용, engine/export template 컴파일
- Godot 에디터·실행 파일 로드, 게임 핵심 플레이
- DS+2 clients 접속, 실제 RPC·물리 rollback·Iris식 복제 실행
- Mali/Adreno/iOS 실기기·GPU profiling·발열·store SDK 동작
- 8/32/100인 부하·24시간 soak·회선 손실 시험
- 결제·정산·광고·콘솔·EAC 벤더 승인과 실제 통합
- 외부 사이트 재배포·업스트림 PR 제출·유료 서비스 계약

본체 공수 619-1,004 PW(10·11·20 철회 반영, 원래 693-1,134 PW)는 문서상 선택 연구까지의 단순 합계이며 실행 예산이나 확정 일정이 아니다. 개별 문서에 명시한 범위 제외·선택 부록·외부 비용을 고려해야 한다. 서버 성능·호환성·안정성은 실제 시험 뒤 결과 파일로 별도 기록한다.

## 7. 패키지 구성과 무결성 확인

ZIP에는 32개 Markdown과 MANIFEST.json, SHA256SUMS.txt를 포함한다. MANIFEST에는 각 Markdown의 상대 경로·바이트 수·SHA-256·CRC32를 기록한다. SHA256SUMS는 Markdown과 MANIFEST의 원시 bytes를 대상으로 계산한다. 체크섬 파일 자신이나 ZIP 자신을 내부에 자기참조로 넣지 않는다.

ZIP은 생성 후 각 항목의 CRC 검사와 압축 해제 bytes의 SHA-256을 원본 작업 파일과 대조한다. 압축 파일 자체의 정확한 바이트 크기·SHA-256과 검사 결과는 다운로드 안내에 제공한다. 원본 PDF는 변경하지 않았으며 패키지에는 원본 사본을 중복 포함하지 않았다.
