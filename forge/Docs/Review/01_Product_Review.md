# PlayForge 산출물 리뷰

검토일: 2026-11-17 · 범위: 확보한 v17 통합본, 그 안의 v16 에디터, AI Workflow vNext, 관련 최신 대화. 원본 코드는 수정하지 않았다.

## 1. 총평

**현재는 ‘사용 가능한 로컬 에디터 프로토타입 + 네이티브 엔진 설계 + 독립 정책 검증 예제’다. 온라인 협업형 AI 제작 플랫폼의 완성본은 아니다.**

가장 좋은 다음 투자는 렌더러 기능 확대가 아니라 **두 브라우저의 같은 프로젝트 공동 편집 → 실제 GDScript 실행 → 서버 검증 → AI 변경의 되돌리기**까지 이어지는 작은 수직 기능 완성이다. 현재 UI와 새 정책 코드를 단순히 같은 ZIP에 넣는 것으로 통합이 완료되지 않는다.

### 강점
- v16은 Scene/Inspector/Prefab/Variant/구조 Diff/Undo의 상호작용을 검토할 수 있는 구체적 프로토타입이다.
- v17 README가 네이티브 렌더러·실제 스크립트 런타임이 없다는 한계를 명시한다.
- vNext는 서비스 수행과 데이터 재사용을 분리하고, 출처·동의 철회·토큰 미확인을 명시한다.
- 예제 측정값과 실제 벤치마크를 구분하며, 정책 판정 코드에 자동 검사가 있다.

## 2. 현재 상태와 증거

| 영역 | 확인 상태 | 근거 |
|---|---|---|
| 웹 편집 UI | 로컬 JS/Canvas 프로토타입 | v17 `01_Editor/PlayForge_Editor_v16/index.html` |
| 저장 | 브라우저 localStorage | 같은 파일 14~15행, 키 `pf10-projects` |
| AI Changes | 모의 변경만 적용 | 같은 파일 22, 135행, `aiGenerated=true` |
| 스크립트 편집 | 텍스트 초안 편집, 실행 안 함 | 같은 파일 22행 및 v17 README |
| Tappy Chicken | 별도 JS 게임 미리보기 | iframe 사용, v17 README |
| 클라우드 협업/인증/DB | 검토한 구현에 없음 | v17 패키지 구조와 에디터 코드 |
| DX12/Vulkan/Material/Networking | 기술 명세 | `02_EngineSpecs`, README |
| 외부 AI 정책 | 순수 C++ 판정 예제 | vNext `cpp/PolicyGate.hpp` |
| OAuth/MCP 서버/모델 호출/Outbox | vNext에서 미구현 명시 | vNext README의 ‘아직 없는 기능’ |
| Unity MCP 우위 | 미입증 | 실험 결과가 아니라 제안 평가 기준 |

이 판정은 확보한 패키지에 한정한다. 다른 저장소나 로컬에서 별도 개발 중인 구현까지 없다는 뜻은 아니다.

## 3. 재현한 코드 문제

### R1. 프로젝트 전환 뒤 Undo/Redo가 원래 상태를 복원하지 못함 (P1, 로컬 데이터 무결성)

- 파일: v17 에디터 `index.html` 17~18행 `undo`, `redo`.
- `undo()`는 history에서 꺼낸 프로젝트가 아니라 **현재 선택 프로젝트** 상태를 future에 저장한다.
- 재현: A.v=1 → A.v=2 편집 → B 선택 → Undo → Redo. 결과 A.v=1로 남는다. 예상은 A.v=2.
- 이번 검토에서 원본 함수를 추출하여 Node VM으로 재현했다. 브라우저 전체 클릭 테스트는 아니다.
- 수정 권장: `h.projectName` 대상의 현재 상태를 대칭적으로 저장하거나 프로젝트별 history를 분리. Undo 후 selected actor/currentFile도 유효하게 재설정.
- 회귀 검사: A/B 교차 편집, 선택만 변경 후 undo, 연속 undo/redo, 삭제한 actor 선택, 새 편집 후 redo 제거.

### R2. 일반 경로 setter의 prototype 오염 (현재 로컬 한계, 외부 데이터 연결 전 P0)

- 파일: 같은 에디터 115행 `setAt`.
- 경로를 `.`로 분리한 뒤 상속 속성을 구분하지 않고 따라가며, `__proto__`, `constructor`, `prototype`을 제한하지 않는다.
- 직접 재현: `setAt({}, '__proto__.pfReviewMarker', true)` 후 `({}).pfReviewMarker === true`.
- 이 결과는 **setter의 안전성 결함**을 입증한다. 현재 UI에서 외부 공격자가 이를 원격 악용할 수 있다는 뜻은 아니다. 실서비스/공동 편집/AI 입력을 연결할 때 반드시 막아야 하는 경계다.
- 수정 권장: 허용 Schema 기반 경로 토큰, 위험 키 거부, own-property 검사, null-prototype dictionary, 깊이/길이/배치 제한. 검증을 우회하는 다른 setter도 함께 검사.
- 회귀 검사: prototype 키, 점을 포함한 실제 속성명, 배열 인덱스, 존재하지 않는 중간 노드, 과도한 깊이. 문자열 점 경로 대신 명시적 토큰 배열도 검토.

### R3. 검증 증거 Schema의 관계 제약 부족 (P1)

- 파일: vNext `schemas/workflow-run.schema.json`.
- `status=completed`, `metrics.testEvidence=server_verified`, `snapshots.validation=null`인 기록도 Schema를 통과한다. 실제 검증 Snapshot을 추적한다는 문서 의도와 연결되지 않는다.
- 이번 검토에서 제공 합성 예제를 위처럼 바꿔 `jsonschema.validate`로 통과를 재현했다.
- 수정 권장: 서버 검증 표시는 report ID와 유효 validation snapshot을 필수로 연결. 결과 Snapshot과 검증 Snapshot이 다르면 이전 버전 검증으로 구분. FK/tenant/서명/불변 hash 검증은 Schema 외 서버 계층에서 처리.
- `completed` 자체가 항상 테스트 통과를 뜻할 필요는 없다. ‘작업 완료’와 ‘검증 성공’을 별도 상태로 설계해야 한다.

## 4. 기획·구현 사이의 주요 위험

### 4.1 핵심 목표 대비 구현 순서
최신 사용자 목표는 온라인 협업, 무설치 웹 제작, AI 재귀 개선이다. 오래된 엔진 명세를 모두 P0로 구현하면 핵심 가치 검증 전에 개발 범위가 폭증한다. 최신 대화에서는 이미 웹 협업 우선으로 재정렬했으므로 **예전 DX12/Vulkan 우선 문서를 현재 일정으로 오독하지 않도록 superseded 표시**가 필요하다.

### 4.2 vNext 정책은 보안 시스템 자체가 아님
`PolicyGate.hpp`는 신뢰된 입력을 전제한다. ActorAuthorized, TenantMatched, PolicyReviewed 등의 boolean을 참으로 만들어 전달하는 인증·정책 저장소와 최신 revision 조회는 구현하지 않는다. 테스트 38개 통과가 OAuth·tenant 격리·동시 철회·비밀 정보 차단을 증명하지 않는다.

권장 통합 경계: 인증된 command → 객체 권한/tenant 검증 → 현재 정책 revision 확인 → 변경/저널/outbox 원자 저장 → 검증 job → 결과 서명 → 재사용 시 현재 권한 재확인. 철회와 실행의 경합은 transaction/lease 등으로 정의한다.

### 4.3 스크립트 편집과 PIE의 단절
현재 스크립트를 고쳐도 iframe의 JS 게임 로직이 바뀌지 않는다. ‘AI가 스크립트 오류를 고친 후 PIE로 성공 확인’의 검증 경로가 아직 없다. 먼저 GDScript 실행 경로와 제한된 API/테스트 runner를 연결하고 무한 루프, 메모리 사용, 파일·네트워크 접근의 격리를 검증해야 한다.

### 4.4 저장·쿼터·비용 통제는 별도 구현 필요
Pro 1 GB / 프로젝트 개수 제한 없음이 최신 사용자 결정이다. 프로젝트 수가 무제한이어도 metadata·협업·build job·PIE는 무료 자원이 아니다. 동시 편집자, build 동시성, 실행 시간, egress, snapshot 보존을 별도 측정하고 한도를 정해야 한다. 값은 아직 추정하지 말고 실측 뒤 결정한다.

버전 보관까지 용량에 포함되므로 작은 Free 공간에서 자동 저장이 금방 한도를 채울 수 있다. 해시 중복 제거, 증가분 사전 계산, soft limit UX, 삭제·복구 정책을 명세와 코드로 일치시켜야 한다.

### 4.5 외부 AI 연결과 데이터 활용을 완료 기능으로 표시하지 말 것
공식 계정 연결, 개인 API, 외부 앱의 MCP는 서로 다른 제품 경로다. 사용자 개인 구독을 서버 자동 작업용 API처럼 전제하지 않는 최신 설계 방향을 유지해야 한다. 이번 리뷰는 공급자 약관의 최신 법적 적합성을 재검증한 법률 검토가 아니다. 실제 출시 경로별 승인·저장·호출 조건을 별도 검증해야 한다.

외부 MCP에서 관측한 도구 호출과 전체 AI 토큰 비용은 다르다. 미확인을 0으로 집계하면 경쟁 비교가 왜곡된다.

## 5. 다음 작업 순서 및 완료 기준

| 우선순위 | 작업 | 완료를 인정할 증거 |
|---|---|---|
| P0 | 통합 상태표/단일 기준 문서 | 각 기능을 설계·mock·단위검증·E2E로 표시, 최신 결정 출처 연결 |
| P0 | command/tenant/revision/idempotency 저장 | 2개 클라이언트 동시 변경, stale revision 거부, 동일 요청 재전송 중복 없음 |
| P0 | 외부 입력 경로 안전화 | R2 및 prototype/경로/크기 제한 회귀 테스트 |
| P0 | 실제 GDScript PIE 최소 연결 | GDScript 1줄 변경이 실행 결과를 바꾸고 실패가 report로 수집됨 |
| P1 | history/R1 및 검증 증거/R3 | 재현 테스트 실패→수정 후 통과, snapshot/report 참조 확인 |
| P1 | AI 최소 경로 1개 | 실제 모델이 공통 command로 수정, 사용량과 사용자 수락/되돌리기 기록 |
| P1 | 협업/중단/철회 E2E | 연결 해제, 중복 전송, 취소, 권한 철회 중 job 실행 테스트 |
| P1 | Unity MCP 기준선 | 고정 task/model/version, 반복 원시 기록, 실패 포함 결과 |
| 후속 | 워크플로 자동 실험 | 제한된 예산, frozen evaluator, 별도 holdout, 수동 승격 기록 |
| 후속 | native 렌더러 및 추가 플랫폼 | 핵심 경로 실증 후 플랫폼별 실제 build/run 증거 |

## 6. 벤치마크 설계 권고

1. ‘같은 게임’ 전체만 비교하지 말고 생성/기능 추가/버그 수정/리팩터/협업 충돌 과제로 나눈다.
2. 모델·추론 설정·도구 버전·에셋·캐시·기기·예산·최대 시간을 고정하고 실험 순서를 무작위화한다.
3. 시간은 사용자 요청부터 검증 완료까지 측정하고 모델/도구/빌드/큐 대기 시간을 분리한다.
4. 공급자가 확인한 input/output/cache token과 비용, 빌드 CPU, PIE 시간, 메모리, egress를 별도 보관한다.
5. 품질은 동작 테스트와 시각/조작 평가로 나누고 실패·타임아웃을 제외하지 않는다.
6. 개선용 과제와 최종 holdout을 분리하고 후보 반복 선택에 따른 과적합을 점검한다.
7. 전 지표 우위 주장과 안전한 workflow release 판정은 다르게 둔다. 정책 함수의 `EvaluatePromotion` 이름이 이 둘을 혼동시키지 않도록 ‘경쟁 우위 검토 자격’임을 API명/문서로 드러내는 편이 좋다.

## 7. 이번 검증 결과

- 직접 재실행: g++ C++20로 `PolicyGateTests.cpp` 빌드 성공, **38/38 통과**.
- 직접 재실행: `tests/validate_examples.py`, **8/8 통과**.
- 추가 검사: R1/R2 원본 함수 Node VM 재현, R3 JSON Schema 반례 재현.
- CMake/CTest: 현재 검토 환경에 cmake가 없어 미실행. 기존 패키지 reports는 과거 실행 기록이며 이번 재실행과 구분한다.
- 브라우저 UI 전체 클릭, 실제 멀티유저 서버, 스크립트 런타임, OAuth/MCP, 공급자 호출, Unity 비교: 미실시 또는 현재 패키지 미구현.
- 수정/배포/외부 서비스 변경: 없음.

## 8. 최신 결정의 출처

- [사용자 핵심 3요소](https://chatgpt.com/c/6afb2023-9c68-83ec-9ba6-db7a6b0b67ff?messageId=bbb218b1-11ed-4e07-a1de-fc98b7143c67)
- [Unity MCP 대비 반복 평가 요구](https://chatgpt.com/c/6afb2023-9c68-83ec-9ba6-db7a6b0b67ff?messageId=bbb218f3-3e8b-4419-a600-86d215c95a1f)
- [Pro 1 GB 및 프로젝트 제한 없음 수정](https://chatgpt.com/c/6afb2023-9c68-83ec-9ba6-db7a6b0b67ff?messageId=41e72a7c-ae1e-43c4-98a8-905a7a36f3b9)
- [AI Workflow vNext와 구현 한계](https://chatgpt.com/c/6afb2023-9c68-83ec-9ba6-db7a6b0b67ff?messageId=05c91a68-cf27-4bb1-b627-ff9bbfaeb54e)

문서의 우선순위·수정 방안은 이번 리뷰의 제안이다. 사용자가 이미 승인한 신규 구현 또는 성능 달성 결과로 해석하지 않는다.

## 9. 병렬 기술 리뷰에서 확인된 추가 사항

함께 제공되는 `playforge_tech_review.md`에 상세 재현과 증거가 있다.

- **P1: Scene 드래그 후 Undo가 편집 세션을 깨뜨림.** pointerup이 raw snapshot을 history에 넣지만 undo는 `{projectName,state}`를 기대한다. 두 프로젝트 문제보다 먼저 수정할 수 있다.
- **P2: Stop이 runtime 중단 대신 iframe을 다시 생성함.** playing 상태와 iframe 생성을 일치시켜야 한다.
- **P2: Project Data 설정이 미리보기로 전달되지 않음.** 수정한 설정과 실행한 설정의 동일성이 보장되지 않는다.
- **외부 UGC 연결 전 보안 경계:** iframe sandbox/origin 격리 및 postMessage 발신 창/출처 검증 필요.
- **P3: Export의 editorVersion이 15로 남음.** UI v16과 다르므로 버전 상수와 migration 정책 통일 필요.

따라서 첫 회귀 테스트 묶음은 ‘드래그 Undo, 프로젝트 교차 Undo/Redo, Stop, 설정 전달, 다시 열기/Export’로 구성하는 것이 좋다. 설계 확대 전에 기존 프로토타입의 데이터 신뢰성을 먼저 고친다.
