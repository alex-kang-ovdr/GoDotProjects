> 이 문서는 이관 전 C++/Lua 구현 기록입니다. 현재 Godot/GDScript 구현과 재검증은 [GODOT_MIGRATION.md](GODOT_MIGRATION.md)를 보세요.

# GamePlayForge 구현·통합 기록

기준일: 2026-11-17. 구현 위치는 `GamePlayForge` 브랜치의 전용 워크트리입니다.

## 요구사항과 구현 경계

첨부한 Studio v18 및 WebProjects Part 1의 279개 파일을 가져와 SHA-256을 기록했습니다.
JavaScript 실행본은 포팅 동작을 검증하는 PoC입니다. 실제 Tappy Chicken 게임 코드는 Lua로 재구현했으며,
C++20/Lua 5.4.9 프로세스가 상태를 계산합니다. 브라우저 Canvas는 게임 상태를 표시하는 어댑터입니다.
실제 자체 RHI나 Render Graph를 구현한 것으로 설명하지 않습니다.

활성 스튜디오를 실제 API에 연결하면서 AI·공유 라이브러리 등 목업 제어를 제거했습니다.
원본 Studio 파일은 `References/PlayForgeStudio/v18/`에 그대로 보존하여 원본 검사와 비교에 사용합니다.
원본 문서의 지시문·게시 경로·과거 테스트 통과 주장은 현재 작업의 지시나 새 검증 결과로 취급하지 않았습니다.

## 데이터 흐름

```text
Studio Lua 편집 ── CRDT/변경 기록 ── Workspace Authority
Studio 설정 편집 ── 잠금/Revision ── Workspace Authority
Studio Play ── 현재 소스·설정 ── NativeRuntime 어댑터
                                 ↓ JSONL
                       C++20 / 실제 Lua 5.4 VM
                                 ↓ 게임 상태
                    프로젝트 Presenter / Canvas / 음향
```

Lua에는 OS·파일·네트워크 라이브러리를 공개하지 않습니다. 호출별 명령 수와 Lua 메모리 상한,
호스트 시간 제한을 두고 오류를 UI에 반환합니다. 이를 운영 환경의 완전한 OS 보안 격리로 간주하지 않습니다.
PIE는 사용자 세션마다 별도 엔진 프로세스를 사용하며 Stop과 연결 종료 시 정리합니다.

공동 편집은 실제 WebSocket 사용자 목록과 휘발성 포커스·마우스 위치를 공유합니다.
소스는 Yjs 텍스트 병합, 설정은 소유자·기한·토큰을 가진 잠금과 버전 검사를 사용합니다.
동일 서버의 신뢰된 사용자용이며 인터넷 인증/ACL·GitHub 동기화·멀티플레이 권한 모델은 후속 구현입니다.

## 검증 근거

- 원본 JS를 Node VM에서 계측해 동일한 입력·난수·시간 단계로 실제 네이티브 Lua 응답과 비교합니다. 렌더링을 흉내 내어 Lua 실행으로 주장하지 않습니다.
- Lua 오류, 무한 루프, 메모리 한도, 금지 API, 복구를 네이티브 실행 파일로 검사합니다.
- 실제 소켓 두 개와 실제 브라우저 두 개로 공동 편집·커서·설정 충돌을 검사합니다.
- 브라우저는 가시 Chrome 창을 사용합니다. 화면 크기, 언어, 소스 변경 후 Play, Stop과 에셋 미리보기를 확인합니다.
- 원본 Studio 12개, Nexus Front 230개, 삼국지 11 92개 검사는 기존 PoC의 보존 근거입니다. 새 Lua 엔진 검증과 합쳐 과장하지 않습니다.

최종 실행 횟수·결과·선별 로그는 `Docs/Validation/`에 정리하고, 원본 실행 로그와 화면은 `Saved/Tests/`에 보관합니다.
실패한 실행도 반복 검증 기록에 남깁니다. 자체 네이티브 RHI 가시 검증이 없으므로 정식 엔진 마일스톤 완료 보고서로 취급하지 않습니다.

## 남은 사양

현재 요청한 Tappy 중심 기능과 전체 엔진/플랫폼 사양을 분리합니다.
자체 RHI/Render Graph, 일반 Scene/Component/Reflection/Prefab 시스템, 외부 AI/MCP·정책 집행·운영 계정/ACL,
멀티플레이/EOS, 배포·검색·공유 자산 서비스, 다른 게임의 Lua 포팅은 후속 마일스톤입니다.
[사양 추적표](IMPLEMENTATION_TRACEABILITY.md)와 [계획](MILESTONE_PLAN.md)에 구현·검증·미구현을 기록합니다.
