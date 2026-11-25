# 01. 공통 실행·관측 아키텍처

## 1. 핵심 요구

외부 AI로 제작하더라도 PlayForge 안에서 수행한 변경과 검증 결과가 누락되지 않아야 한다. 하지만 공통 실행 기록에 포함된 모든 데이터가 자동으로 공통 최적화나 학습에 사용되는 것은 아니다.

불변식은 세 가지다.

1. 실행 허용과 재사용 허용은 별개다.
2. 출처가 혼합된 결과의 허용 범위는 모든 출처의 허용 범위 교집합이다.
3. 확인되지 않은 비용·품질·인과관계를 사실로 채우지 않는다.

## 2. 하나의 명령 경로

```text
Human UI / Platform AI / Personal API / External MCP
    → Authentication + Workspace Scope
    → Typed Query / Command / Test
    → Revision + Lock + Bounds Validation
    → Canonical Workspace Change
    → Operation Journal + Required Audit + Outbox
    → Commit acknowledgement
    → Optional asynchronous analysis (purpose checked)
```

MCP는 얇은 Adapter다. 에디터·AI의 수정 경로는 같고 게임 전용 에디터 기능을 추가하지 않는다. Actor, Component, Property, Prefab, GDScript, Asset 타입은 프로젝트의 Schema에서 발견한다.

### 저장 실패 경계

- 필수 프로젝트 변경·Operation·감사 기록이 저장되지 않으면 성공 응답 금지.
- 선택적 분석 Worker나 개선 통계 적재가 실패해도 이미 승인한 프로젝트 변경은 유지.
- 원본 요청 본문은 접근 로그, APM, 오류 보고, 큐 Dead Letter에 기본 복제하지 않는다.
- 로그 분석에는 허용 목록 필드만 보내며 자유 텍스트 오류 대신 구조화된 errorCode를 우선한다.
- 학습/마케팅이 거부되었다고 요청받은 편집을 거부하지 않는다. 요청 실행 자체의 인가 실패는 거부한다.

이 패키지에는 DB/Outbox 구현은 없고 위 트랜잭션 경계가 설계 계약이다.

## 3. 최소 작업 묶음

`WorkflowRun`은 사용자 의도 하나의 실행 범위다. 외부 대화 세션 전체를 뜻하지 않는다. `ChangeSetId`, `OperationId`, `SnapshotId`, `TestReportId`는 기존 시스템을 참조한다.

일반 경로는 다음과 같다.

```text
begin → query_schema/context → apply(dry_run) → apply → validate → report
```

권장 애플리케이션 도구는 `pf_workflow_begin`, `pf_workspace_query`, `pf_workspace_apply`, `pf_validation_run`, `pf_workflow_report` 다섯 개로 시작한다. 이는 새 MCP 표준 method가 아닌 PlayForge 도구 이름이다. 필요할 때만 Snapshot/PIE 취소 도구를 별도로 노출한다.

`runId`는 현재 작업 조회·중단·이어하기에 실제 필요한 경우에만 외부에 반환한다. 내부 분석 trace ID, 동의 문서 ID, 자격증명 ID는 모델 응답에 넣지 않는다. 설명·진단은 해당 요청 수행에 필요한 최소 범위로 제한한다.

## 4. 요청과 서버 기록 분리

클라이언트는 workspace 대상, 작업 목표의 짧은 설명, 수정 명령, expected revision, idempotency key를 보낼 수 있다.

사용자 신원, 프로젝트 소유권, 요금 부담자, 학습 동의, 공급자 정책 허용값, 검증된 모델명은 서버가 결정한다. 클라이언트 JSON의 `consent=true` 또는 `model=...`은 승인 근거가 아니다. WorkflowRun JSON Schema는 서버 저장 레코드용이며 public mutation request schema가 아니다.

## 5. 공동 편집 안전성

전체 Workspace Revision만으로 모든 편집을 거부하지 않는다. Property는 property revision, GDScript 파일 patch는 document revision, 구조 변경은 구조 revision과 필요한 짧은 lease를 검사한다.

```text
사용자 A: 속도 변경, property revision 7 → 8
사용자 B: 다른 오브젝트 변경
AI: revision 7 기준 속도 수정 → conflict, 자동 덮어쓰기 금지
```

테스트는 정확한 Snapshot에서 실행한다. 결과를 최신 작업 상태로 주장하려면 최신 snapshot 또는 승인된 동등성 검사가 필요하다. 다른 사용자의 후속 수정으로 통과하면 공동 결과로 기록하고 단독 AI 성과로 귀속하지 않는다.

자동 재시도는 변경을 무조건 재적용하지 않는다. 충돌 조회 → 새 dry run → 필요한 승인 순서다. Undo는 기존 조건부 보상 명령을 사용한다.

## 6. 멱등성 및 저장 원자성

편집 요청의 멱등 키는 인증된 tenant/workspace/actor와 함께 범위를 묶는다. 동일 키·동일 payload의 재요청은 이전 결과를 반환하며, 동일 키·다른 payload는 오류로 처리한다.

```text
BEGIN
  verify actor scope, expected revisions, lease/fence
  apply validated edit batch
  append operation + required minimal audit
  insert outbox event (unique event_id)
COMMIT
acknowledge
```

선택적 소비자는 event_id로 중복을 제거하고 재사용 목적을 다시 검사한다. 네트워크 전달 exactly-once를 주장하지 않는다. 중복 전달되어도 같은 이벤트가 중복 집계되지 않도록 구현한다.

## 7. 데이터 위치와 수집 수준

프로젝트 소스는 기존 프로젝트 저장소에 둔다. 개선 기록에는 Snapshot/Operation 참조를 남긴다. 학습 후보를 외부 처리기로 내보낼 때 필요한 코드·Schema·Diff만 추출한다.

기본 운영 기록: 도구명, 결과 코드, 처리시간, 변경 건수, 필요한 작업 식별자.
선택 참여 데이터: 해당 목적이 허용된 최소 코드 diff, 관련 schema, 테스트 결과.
금지 기본 항목: API key, OAuth token, 세션 쿠키, 원문 전체 대화, 비공개 내부 추론, 음성 원음, 타 프로젝트 데이터.

전체 대화를 역으로 추론하거나 자유로운 context 필드를 반복 요청해 수집 범위를 늘리지 않는다.

## 8. 인증 경계

- PlayForge MCP 인증은 PlayForge audience의 자체 OAuth 토큰을 사용한다.
- 외부 AI 서비스의 토큰을 PlayForge MCP 로그인 토큰처럼 전달하지 않는다.
- BYOK는 해당 API 계약이 허용하는 경우에만 서버 보관을 검토한다.
- 개인 구독 인증정보는 별도 조건을 적용한다. 공식 SIWC 약관상 지속 저장은 사용자 통제 로컬이어야 하므로 공통 서버 금고 정책을 적용하지 않는다.
- 사용자 전용 원격 런타임이 허용되는 경우라도 영속 인증정보 저장 조건은 별도다.
- 외부 AI 앱의 Remote MCP는 PlayForge가 외부 AI 구독 토큰을 보관하지 않아도 되는 경로다.
- 브라우저 저장이 가능하다는 사실만으로 보안·공급자 승인을 만족하지 않는다. 공식 흐름/SDK, XSS 방어, 수명 정책을 검토해야 한다.

## 9. 최소 백엔드 구조

기존 Workspace와 Snapshot을 재사용한다. 추가 테이블은 실행 요약 WorkflowRuns, 최소 이벤트 RunEvents, 목적별 정책·동의 참조 PolicyDecisions, 실험 요약 Experiments 정도로 제한한다. 별도 Kafka, 벡터DB, Feature Store, 데이터 레이크는 초기 필수가 아니다.

사용자 작업과 플랫폼 공통 실험은 Job Queue와 예산 소유자를 분리한다. 모델·프로젝트 수정·서비스 정책 업데이트의 권한을 같은 Agent에 모두 주지 않는다.
