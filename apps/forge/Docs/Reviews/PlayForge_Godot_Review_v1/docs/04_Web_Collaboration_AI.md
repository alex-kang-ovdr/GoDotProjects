# 04 · 무설치 웹 에디터·협업·MCP·재귀 개선

**검토 기준일:** 2026-11-17 · **상태:** 설계·공식 문서 검토, Godot 런타임 실증 미실시

## 에디터를 통째로 이식하지 않는다

React/TypeScript는 프로젝트 선택, Hierarchy, Inspector, Lua 편집, Snapshot, Changes, AI 작업을 담당한다. Godot Web Runtime은 Scene/Game 화면과 실제 실행을 담당한다. 데스크톱 Godot EditorPlugin UI가 브라우저의 React 패널이 되는 것은 아니다.

Godot의 JavaScriptBridge는 Web export와 호스트 JavaScript의 연결점이다. PlayForge에서는 이를 신뢰된 Bridge가 사용하는 제한된 채널로 감싼다. [G37](../references/Verified_Sources.md#g37)

```text
웹 UI/AI ─── Workspace Command ─── 승인 Revision
  │                                   │
  └── Local Preview (미확정)           └── Runtime Apply
                                             │
                                      Godot Scene/Game
```

Runtime Apply는 원본 저장 성공과 다르다. Godot 반영 실패가 발생하면 Source를 조용히 되돌리는 대신 Preview를 오류 상태로 두고 확정 Snapshot으로 재구성한다.

## 협업 단순화 유지

구조화된 Scene/Prefab/Property는 서버 순차 Command와 대상별 Revision을 사용한다. Lua 텍스트만 CRDT 후보로 유지한다. Presence는 별도 TTL 정보로 처리하고 영구 파일·스냅샷에 넣지 않는다.

드래그는 로컬에서 즉시 표현하고 제한 빈도의 임시 Preview를 보내며, 확정 시 하나의 Undo Group을 기록한다. 임시 값이 CDO/Prefab 정의나 다른 사용자의 확정 변경을 덮어쓰지 않도록 세션 ID·시퀀스·기준 Revision을 검사한다.

`save`는 서버가 확정한 전체 프로젝트의 체크포인트다. 자신의 변경만 내보내는 ChangeSet 기능과 다르다. 복원은 새 Workspace epoch를 발급하며, 이전 epoch의 지연 명령을 자동 적용하지 않는다.

## 브라우저 실행 격리

Editor origin과 UGC Runtime origin을 분리한다. iframe의 sandbox/CSP/권한 정책을 실제 브라우저 조합으로 검증한다. 모든 postMessage 수신은 origin, source window, session nonce, schema, sequence를 검사한다. 임의 문자열 eval은 제공하지 않는다.

Web Extension/Thread 프로필은 교차 출처 격리 조건을 검증해야 한다. 광고·외부 스크립트·cross-origin iframe의 조합이 이를 방해할 수 있으므로 보안 헤더를 임의로 완화하는 대신 실행 프로필을 분리한다. [G06](../references/Verified_Sources.md#g06)

개인 AI 자격증명·플랫폼 refresh token은 Game iframe에 넘기지 않는다. Game은 권한이 좁고 만료되는 세션 capability만 받는다.

## Scene와 Game 분리

Editor Preview는 작성 Snapshot에서 렌더 가능한 상태를 구성하며 게임 Lua는 기본 실행하지 않는다. Play를 누르면 불변 Snapshot에서 PIE 인스턴스를 만든다. 에디터 변경은 기본적으로 다음 실행에만 반영하며 Hot Apply는 허용 Property에 명시적으로 수행한다.

여러 Viewport는 화면 분할의 수단이지 서로 불신하는 UGC의 보안 경계가 아니다. 안전성이 필요한 PIE는 별도 iframe·프로세스·실행 세션으로 구분한다. Godot Viewport가 자체 World를 가질 수 있어도 모든 엔진 전역 상태가 분리되는 것은 아니다. [G15](../references/Verified_Sources.md#g15)[G22](../references/Verified_Sources.md#g22)

## AI 도구 계약

공통 API는 query/schema/apply_batch/validate/play/test/diff를 제공한다. 영구 GUID와 Property ID를 사용하고 Godot NodePath는 내부 진단용으로만 사용한다. 확인되지 않은 Node 타입·API는 미지원 오류를 반환한다.

AI가 `.tscn` 원본을 직접 수정하여 Workspace를 우회하거나, 사용자 프로젝트에 `.gdextension`을 업로드해 실행하는 통로를 만들지 않는다. 검증되지 않은 GDScript `@tool` 코드도 자동 실행하지 않는다.

## 재귀 개선 연결

각 실행은 Project Snapshot, Runtime Contract Hash, 테스트 Snapshot, 도구 관측 구간, 외부 사용량 근거를 기록한다. Godot 교체로 제작 시간이 줄어드는지는 같은 요구사항과 제공 자산에서 계측한다. 이전 Canvas mock과 실제 엔진 실행 시간을 단순 비교하여 우위를 주장하지 않는다.

프로젝트 수정 루프와 플랫폼 워크플로 실험을 분리한다. 후자는 플랫폼 예산을 사용하고 평가기·권한·요금·엔진 패치 정책을 Agent가 변경하지 못한다. 외부 AI의 전체 토큰을 모르면 null로 기록한다. 학습·마케팅 등 2차 활용에는 기존 목적별 권한 규칙을 그대로 적용한다.

## P0 E2E 완료 조건

서로 다른 두 브라우저에서 하나의 GUID를 편집하고, 충돌 없는 변경은 양쪽 Godot View에 반영된다. 동일 Property 충돌은 원문을 보존한다. AI 변경은 일반 Undo/Changes에 나타난다. Snapshot 복원 후 오래된 런타임 응답은 폐기된다. 브라우저 저장 캐시를 지워도 승인된 Source는 클라우드에서 복구된다.

현재 이 E2E는 **미실시**다. 문서 검증 통과와 구분한다.
