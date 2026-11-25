# 15 · ADR·미결정 항목·기존 설명 보완

**검토 기준일:** 2026-11-17 · **상태:** 설계·공식 문서 검토, Godot 런타임 실증 미실시

## ADR 요약

| ID | 제안 결정 | 근거·영향 | 상태 |
|---|---|---|---|
| ADR-G01 | Godot를 실행 엔진 후보로, 웹 플랫폼은 유지 | 핵심 가치에 집중 | 검토 제안 |
| ADR-G02 | E1 기본·E2 승인·E3 기본 금지 | 업그레이드 비용 통제 | 채택 심사 필요 |
| ADR-G03 | PlayForge Source가 유일한 편집 원본 | 양방향 동기화 제거 | 기존 원칙 유지 |
| ADR-G04 | ~~Lua 5.4 유지~~ → **철회(2026-11-25): Lua 미지원, GDScript 기본** ([SSOT.md](../../../../../docs/godot-refactoring/SSOT.md) §5 D1) | 사용자 결정 | 철회 |
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
| 실제 물리 첫 백엔드는 무엇인가 | Box2D/Havok 기능·SDK·성능 | 엔진/제품 |
| Mip streaming을 어느 버전에서 통과시키는가 | stable/beta 별 API·GPU 메모리 시험 | 렌더/제품 |
| Godot 고수준 net를 제품에 쓰는가 | PF schema 필요성·비-Godot 경계 | 네트워크 |
| 일부 셰이더 표현 차이를 허용하는가 | 동일 씬 타겟별 화면·QA | 제품/아트 |
| 공동 runtime 바이너리를 quota에서 제외하는가 | 실제 패키지 크기·원가·표시 정책 | 제품/사업 |
| multi-room 밀도를 얼마나 올리는가 | 격리·P99·장애 전파 시험 | 서버/SRE |
| 콘솔까지 같은 확장 경로가 가능한가 | SDK와 승인된 포트 조건 | 플랫폼/계약 |

## 기존 설명에서 혼동하지 말아야 할 것

**1. GodotInstance 하나와 World 하나는 다르다.** 프로세스당 GodotInstance 제한이 있어도 Viewport/World를 여러 개 둘 수 있다. 반대로 여러 World가 완전한 엔진·보안·메모리 격리를 뜻하지 않는다. [G22](../references/Verified_Sources.md#g22)[G15](../references/Verified_Sources.md#g15)

**2. 게임 스크립트는 GDScript만 지원한다.** 커뮤니티 언어 확장을 발견했다고 지원 언어로 표기하지 않는다. [G23](../references/Verified_Sources.md#g23)

**3. 물리 확장 가능과 backend hot swap은 다르다.** PhysicsServer 확장점이 있어도 시작 후 선택 변경은 지원되지 않는다. [G16](../references/Verified_Sources.md#g16)[G18](../references/Verified_Sources.md#g18)

**4. Mipmap과 Mip Residency는 다르다.** 저해상도 샘플링만으로 실제 GPU 메모리 해제를 증명할 수 없다. 개발 채널 API는 안정판 지원으로 승격해 기록하지 않는다. [G39](../references/Verified_Sources.md#g39)[G40](../references/Verified_Sources.md#g40)

**5. 웹이 GPU를 사용한다고 WebGPU인 것은 아니다.** 현재 공식 Export는 WebGL 2 Compatibility다. [G06](../references/Verified_Sources.md#g06)

**6. C++ 표면 API가 Unreal식이어도 내부 UObject/GC/ABI가 같아지는 것은 아니다.** 전체 코어를 한 겹 더 만들지 않고 필요한 계약만 유지한다.

**7. 기존 v17은 포팅 완료 엔진이 아니다.** 이전 JavaScript 목업/설계와 이번 검토 패키지를 실제 Godot 실행 결과로 합쳐 표시하지 않는다.

**8. MIT가 모든 외부 권한을 해결하지 않는다.** Godot, 서드파티, Havok/EOS, 사용자 콘텐츠, AI 데이터, 콘솔 각각의 조건을 구분한다. [G02](../references/Verified_Sources.md#g02)[G03](../references/Verified_Sources.md#g03)[G44](../references/Verified_Sources.md#g44)

**9. GDExtension은 모든 내부 hook을 노출하지 않는다.** 공개 API로 범위를 증명하지 못한 기능은 미검증 또는 E3 위험으로 남긴다. [G04](../references/Verified_Sources.md#g04)[G05](../references/Verified_Sources.md#g05)

**10. 단일 엔진 채택으로 플랫폼이 완성되지 않는다.** 협업, AI 워크플로 평가, 계정·과금·스냅샷·신고·배포 운영은 PlayForge 서비스다.

## 의사결정 회의 순서

첫 회의는 미들웨어 브랜드 선호보다 GDScript/Web 안전한 실행과 Source/Runtime 계약부터 확인한다. 다음은 렌더 기능 차이와 패키지 크기, 다음은 게임 네트워크와 미들웨어, 마지막은 대규모 Room 밀도·고급 rendering이다. 핵심 협업 실증 전에 E3 엔진 개발로 범위를 넓히지 않는다.
