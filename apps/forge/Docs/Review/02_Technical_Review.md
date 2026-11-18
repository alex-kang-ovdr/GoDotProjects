# PlayForge 기술 리뷰

검토일: 2026-11-17. 원본 파일은 수정하지 않았다. 검토 대상은 확보한 `PlayForge_Cloud_Consolidated_v17`, `PlayForge_Frontend_Preview_v16_StructureDiff`, `PlayForge_AI_Workflow_vNext`이다. 배포 서비스 전체가 아닌 해당 산출물에 한정한 리뷰다.

## 결론

**현 단계는 브라우저 에디터 프로토타입 + 런타임 설계 문서 + 독립 정책 판정 예제이다. 통합된 AI 저작 플랫폼 또는 운영 가능한 협업 서비스로 판정하면 안 된다.** vNext README도 실제 OAuth/MCP 서버/DB/DLP/모델 호출/학습/UI/Unity 비교 실험이 없다고 명시한다. 예제의 테스트 통과는 이러한 시스템의 구현 증거가 아니다.

## 우선 수정할 결함

경로 `Editor/index.html`은 `PlayForge_Frontend_v16/index.html`을 뜻한다. v17에도 같은 v16 에디터가 포함되어 있다. 파일이 압축된 한 줄 함수 형태여서 줄 번호와 함수명을 함께 기재한다.

### P1. Scene 드래그 후 Undo가 현재 프로젝트를 잃음
- 근거: `Editor/index.html:44–46`의 pointerdown은 프로젝트 객체를 snapshot으로 만들고 pointerup은 `history.push(pointerState.snapshot)`을 수행한다.
- 반면 `:16–18`의 mutate/undo/redo는 `{projectName, state}` 형태를 전제로 한다. 드래그 기록에는 두 키가 없다.
- 결과: Undo가 `projectName=undefined`로 바꾸고 이후 `cur()`를 사용하는 렌더링에서 실패한다. 최근 저장 데이터가 완전히 삭제되었다고 단정하지는 않지만 편집 세션이 깨진다.
- 검증: 원본 undo/redo 함수를 추출한 Node VM 단위 재현에서 `current project undefined` 예외를 확인했다. DOM은 최소 stub으로 대체했으므로 브라우저 E2E는 아니다.
- 수정 방향: 모든 변경 경로를 하나의 Command/History record로 통일하고 drag 완료 시에도 프로젝트 ID 및 before/after 스냅샷을 기록한다. pointercancel 시 원상복구 또는 변경 commit 규칙도 필요하다.

### P1. 프로젝트 전환 후 Undo/Redo가 잘못된 프로젝트를 기록
- 근거: `Editor/index.html:17–18`, `:134`.
- 재현: 프로젝트 A 수정 → B로 전환 → Undo → Redo. Undo가 A의 before를 복원하면서 future에는 현재 B의 스냅샷을 넣으므로 Redo는 A의 수정 상태를 복원하지 못한다.
- 검증: 원본 함수 Node VM 재현에서 A의 값은 1이 아닌 0으로 남고 선택 프로젝트는 B로 돌아갔다.
- 수정 방향: undo 대상 record의 projectName으로 after-state를 읽거나, 프로젝트별 history를 분리한다. 선택 actor와 열린 script도 전환 대상의 유효한 값으로 정규화한다.

### P2. Stop이 미리보기를 중단하지 않음
- 근거: `Editor/index.html:134`의 play handler는 playing만 toggle하고 항상 `tab='game';render()`를 실행한다. `:22`의 game 렌더링은 playing 값과 무관하게 iframe을 만든다.
- 결과: Stop은 iframe을 제거/중지하는 대신 새 iframe으로 미리보기를 재시작한다. 화면의 ‘PIE stopped’와 실제 동작 경계가 다르다.
- 수정 방향: Stop 시 iframe 제거, 명시적 runtime stop, 또는 read-only stopped 화면으로 전환한다. 탭/선택 변경 때 render가 iframe을 재생성하는 문제도 함께 분리한다.

### P2. Project Data 편집 내용이 게임 preview에 반영되지 않음
- 근거: `Editor/index.html:135`는 JSON을 `cur().settings`에 저장한다. `:22`는 기존 preview URL만 iframe src로 지정한다. 에디터에는 postMessage 호출이 없다.
- `TappyChicken/index.html:2`에는 settingsRestart/settingsLive 수신기가 있지만 현 v16 에디터에서는 호출하지 않는다. 게임은 자체 기본 gravity/speed 등으로 시작한다.
- 결과: 설정 변경 후 Play에서 기대한 동작이 나오지 않는다. Lua도 UI에 명시된 대로 실제 실행되지 않는다.
- 수정 방향: 버전이 있는 프로젝트 snapshot을 runtime adapter로 전달하고 적용 ACK를 기다린 뒤 Play를 허용한다. 편집 설정과 실행 데이터의 동일성을 테스트한다.

### P2. 확장 전 미리보기 보안 경계 필요
- 근거: `Editor/index.html:22` iframe에 sandbox가 없고, `TappyChicken/index.html:2` message listener는 `data.source` 문자열만 검사한다. 실제 `event.origin` 및 `event.source` 검증이 없다. telemetry는 targetOrigin `'*'`로 보낸다.
- 현재 고정 로컬 샘플에서 원격 침해가 재현된 것은 아니다. 그러나 외부 UGC·협업 프로젝트를 같은 origin에서 실행하는 구조로 확장하면 편집기 저장소 접근 및 메시지 위조 위험이 생긴다.
- 수정 방향: 격리된 runtime origin, 최소 iframe sandbox, 발신 창/허용 origin 검증, 세션 nonce와 메시지 schema를 적용한다. file:// 데모의 null origin을 운영 정책으로 가져오지 않는다.

### P3. Export 버전 표기가 v15로 남음
- 근거: `Editor/index.html:136`은 `editorVersion:15`, 화면과 로그는 v16이다.
- 수정 방향: 공통 버전/스키마 상수를 사용하고 export/import migration 테스트를 추가한다.

## 정책 예제 평가

`cpp/PolicyGate.hpp`는 기본 deny, tenant 확인, 출처 lineage 교집합, 동의 철회 및 계정 비용 분리, 검증된 토큰 증거와 고정 평가기 요구를 명확히 표현한다. 좋은 정책 reference이지만 boolean을 클라이언트가 제공하면 안전한 인가가 아니다. README가 이 제한을 올바르게 명시한다.

운영 통합 시 추가 검증 항목:
- `EvaluateSpend`에는 금액/잔여 quota/동시 실행 예약/정산이 없다. 허용 판정과 실제 비용 debit의 원자성을 별도 구현한다.
- 실행 시점의 정책 revision·철회·tenant 정보를 신뢰된 저장소에서 재확인하고 판정과 commit 사이의 변경을 방어한다.
- Schema는 기록 형태 검사이지 비밀 탐지/인가/진실성 증명기가 아니다. 자유 문자열의 credential 검출, 데이터 보존·삭제, 감사 접근 통제가 별도 필요하다.
- 외부 모델 이름·토큰·시간이 미확인일 때는 비교 승리로 바꾸지 않는다. 현재 테스트는 합성 정책 사례이며 실제 Unity MCP 성능 비교가 아니다.

## 이번에 직접 수행한 검사

| 검사 | 결과 | 범위/제한 |
|---|---|---|
| g++ C++20, -Wall -Wextra -Werror -pedantic | 통과 | PolicyGateTests.cpp 직접 빌드 |
| 정책 단위 검사 | 38/38 통과 | 기존 합성 사례 재실행 |
| JSON Schema 검사 | 8/8 통과 | validate_examples.py 재실행 |
| AddressSanitizer/UndefinedBehaviorSanitizer | 38/38 통과 | detect_leaks=0. LeakSanitizer 기본 실행은 환경 ptrace 제한으로 실패하여 누수 검증 제외 |
| v16 에디터/샘플 인라인 JS 문법 | 2/2 통과 | node --check; UI 동작 검사가 아님 |
| Undo 추가 회귀 재현 | 결함 2개 확인 | 원본 함수 추출 + Node VM 상태 테스트 |
| CMake/CTest | 미실행 | 현재 환경에 cmake 실행 파일 없음; 직접 g++ 빌드로 대체 |
| 브라우저 E2E/실서비스/협업/부하/외부 AI 연결 | 미실행 | 본 검토로 통과 주장하지 않음 |

## 권장 완료 기준

1. 위 Undo/Redo/Stop/설정 전달을 수정하고 실제 브라우저 회귀 테스트를 고정한다.
2. 한 프로젝트에서 “편집 → 저장 → 재열기 → Play → Export/Import”의 데이터 일치를 검증한다.
3. 격리된 실행 환경과 서버 권한·quota·버전 기반 Command API를 연결한다.
4. 이후 두 사용자 충돌, 취소/재시도/중복 요청, 데이터 철회, 비용 상한을 검증한다.
5. 마지막으로 동일 과제·모델·예산·평가기와 holdout을 사용해 Unity MCP 대비 실험한다.

부록 재현 스크립트는 `editor_regressions.js`이다. 원본을 수정하지 않고 결함을 재현하기 위한 검사이며 production 테스트 runner가 아니다.
