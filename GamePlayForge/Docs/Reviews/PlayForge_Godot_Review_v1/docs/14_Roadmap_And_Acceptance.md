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

iOS export는 macOS/Xcode 환경이 필요하며, 제작자 무설치 기능은 관리되는 클라우드 빌드로 제공한다. [G45](../references/Verified_Sources.md#g45)

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
