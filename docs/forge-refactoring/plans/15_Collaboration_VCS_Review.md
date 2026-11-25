# 15. 팀 협업·버전 관리·잠금·검수 개발 계획

## 1. 계획 요약

| 항목 | 계획 |
|---|---|
| 계획 ID / 기준일 | IMP-15 / 2026-11-24 |
| 원문 대응 | PDF 6·8-9쪽 VCS·LFS·씬 분할·UID·검수·자동화 |
| 우선순위 | P0 snapshot·충돌 방지 / P1 협업 편집·검수 |
| 구현 위치 | Forge 협업 서비스, 편집기 adapter, VCS adapter, CI 검증 |
| 선행 과제 | 16 빌드 identity, 23 package lock. 게임 복제 계층과 독립 |
| 담당 | 협업/backend 엔지니어 1명, 에디터 엔지니어 1명, QA |
| 예상 공수 | 28-46 PW. snapshot·Git/LFS·기본 실시간 편집 범위 |
| 구현 상태 | 계획. 저장소 연결·협업 서버·실제 다중 사용자 검증 미수행 |

## 2. 목표와 범위

여러 제작자가 같은 프로젝트를 수정할 때 데이터 유실·UID 깨짐·에셋 덮어쓰기를 막고, 특정 revision의 실행본과 검수 의견을 연결한다. 게임별 프로젝트와 데이터는 독립 관리하고 협업·빌드·분석 도구만 공유한다.

Git 연결이 없는 제작자도 프로젝트 snapshot과 이력을 이용할 수 있게 한다. Git/LFS, Perforce, Unity VCS는 외부 저장소 adapter로 취급한다. 초기 구현은 snapshot+Git/LFS에 집중하며, Perforce/Unity VCS는 지원 계약·사용 수요·시험 저장소가 확인된 뒤 13절의 조건부 구현에 착수한다. 두 adapter의 선택 공수는 본체 28-46 PW에 포함하지 않는다.

실시간 제작 협업은 편집 operation log와 revision 제어로 구현한다. 플레이어 이동·전투를 위한 Unreal식 RPC/Iris 복제와 별도 데이터·권한·서버 수명주기를 갖는다.

## 3. 확인한 기존 기능

- Godot는 텍스트 기반 파일·VCS 플러그인·Git LFS 사용 방법을 안내한다. 문서에 쓰인 특정 시점의 plugin 목록을 현재 모든 생태계 지원 현황으로 일반화하지 않는다. [Version control systems](https://docs.godotengine.org/en/stable/tutorials/best_practices/version_control_systems.html)
- `EditorVCSInterface`는 VCS별 구현을 제공하는 확장 지점이다. 기존 editor UI에 상태·diff·commit 기능을 연결할 때 사용한다. [공식 API](https://docs.godotengine.org/en/stable/classes/class_editorvcsinterface.html)
- Git LFS에는 파일 잠금 API가 있지만 서버 구현·권한·push 시 검증을 함께 확인해야 한다. 로컬 읽기 전용 설정만으로 전체 저장소의 독점 편집을 보장하지 않는다. [Git LFS Locking API](https://github.com/git-lfs/git-lfs/blob/main/docs/api/locking.md)

아래 서버 구조·locking lease·협업 API·수치는 자체 제안이다.

## 4. 데이터 소유권과 아키텍처

| 모듈 | 역할 | 일관성 규칙 |
|---|---|---|
| ProjectRevisionService | snapshot·revision·build 관계 | 승인된 revision을 immutable로 보관 |
| OperationService | 편집 명령 검증·순서·중복 제거 | project별 순서, base revision 검증 |
| LockService | binary/scene 하드락·object/property 소프트락 | owner·lease generation·만료 정책 |
| PresenceService | 커서·선택·편집 위치 | 유실 가능한 ephemeral 데이터 |
| VcsAdapter | Git/LFS·조건부 Perforce/Unity VCS 연결 | 외부 revision과 내부 snapshot 매핑 |
| SceneValidator | UID·resource·dependency·문법 검사 | 저장·merge·build 전 검증 |
| ReviewService | 실행본·화면·의견·해결 상태 | build ID·scene/object ID·revision 고정 |

프로젝트 저장은 임시 snapshot 생성 → schema·asset 검사 → content hash 확정 → revision 게시 순서로 수행한다. 빌드 중 계속 편집해도 빌드 입력은 확정된 snapshot을 유지한다. 외부 저장소 push가 실패하면 내부 저장 성공과 외부 동기화 실패를 따로 보여준다.

하나의 프로젝트는 한 canonical revision 흐름을 갖는다. Git과 cloud snapshot 양쪽이 동시에 독립적으로 최신값을 덮어쓰는 구조를 만들지 않는다. 연결 모드별 source of truth를 ADR과 UI에서 명시한다.

## 5. 제안 operation 계약

```json
{
  "project_id": "<project>",
  "operation_id": "<unique-id>",
  "base_revision": 120,
  "author_id": "<verified-user>",
  "target": {"scene_id": "<stable-id>", "node_id": "<editor-stable-id>"},
  "kind": "set_property",
  "path": "transform.position",
  "expected_value_hash": "<hash>",
  "new_value": [1, 2, 3],
  "lock_generation": 7
}
```

이 계약은 새 서비스 API다. Godot Resource UID와 편집용 Node stable ID를 혼동하지 않는다. Node ID는 도구가 별도로 보존하며 rename/reparent에서도 유지한다. 같은 operation ID는 한 번만 적용한다. stale base를 받으면 자동 last-write-wins로 덮지 않고 rebase 가능 여부와 충돌을 반환한다.

undo는 역연산과 precondition을 갖는 새 operation이다. 다른 사람의 후속 편집이 있는 경우 취소 범위를 확인할 수 있게 충돌을 표시한다. 대형 binary와 복잡한 scene 구조 변경은 hard lock을 요구하고, transform 드래그는 소프트락과 확정 operation을 구분한다.

## 6. VCS·UID·잠금 정책

작은 scene 조합과 외부 Resource 참조를 기본으로 한다. `.uid`와 참조 파일 이동을 하나의 변경으로 처리하며 import cache는 원본과 분리한다. 텍스트 파일은 구조를 이해한 diff를 우선하지만 자동 merge 결과는 실제 엔진 import·scene load로 검증한다.

LFS 잠금과 자체 lease는 같은 것으로 취급하지 않는다. adapter는 외부 잠금의 실제 소유자·해제 결과를 확인한다. 네트워크 단절이나 lease 만료 후에는 새 revision 쓰기를 잠시 거절하고 재획득·재검증한다. 관리자 강제 해제는 이유와 이전 소유자를 기록한다.

offline 변경은 별도 branch/snapshot으로 보존하고 재접속 시 충돌을 검토한다. 잠금이 실패했다고 저장되지 않은 작업을 버리지 않는다. 바이너리는 자동 병합 대신 양쪽 버전을 보존한다.

## 7. 검수·AI 도구 연결

브라우저 검수 화면은 build ID로 고정한 플레이 뷰와 별도 리뷰 패널을 제공한다. 편집 도구 UI를 게임 viewport 위에 섞지 않는다. 의견은 scene/object ID·해상도·카메라·revision과 함께 저장하고 수정 후 해당 조건에서 다시 검수한다.

AI 도구는 사람과 같은 operation API·project 권한·revision precondition을 사용한다. 임의 파일 덮어쓰기로 협업 상태를 우회하지 않는다. 변경 제안과 실제 반영 기록을 연결하며, 분석 도구가 다른 프로젝트의 데이터를 혼합하지 못하도록 project 경계를 검증한다.

## 8. 작업분해와 공수

| 작업 ID | 작업 | PW | 산출물 |
|---|---|---:|---|
| COL-01 | 저장 모드·revision·scene/UID 계약 | 3-5 | ADR·schema·migration |
| COL-02 | immutable snapshot·Git/LFS adapter·빌드 연결 | 4-6 | 이력·동기화·restore |
| COL-03 | operation log·권한·중복·충돌·undo | 6-10 | 협업 서비스·검증기 |
| COL-04 | hard/soft lock·presence·editor 연결 | 6-10 | 동시 편집·장애 복구 |
| COL-05 | 구조 diff·UID 검사·web review·AI adapter | 4-7 | 리뷰·검증·도구 API |
| COL-06 | 3/10/30인 부하·offline·restore·운영 | 5-8 | 결과·runbook·지원 표 |
| 합계 | snapshot·Git/LFS·기본 실시간 편집 | **28-46** | 13절 선택 adapter 공수 제외 |

## 9. 도입 단계

G0에서는 snapshot과 복원부터 안정화한다. G1은 binary/scene hard lock과 외부 VCS 상태를 연결한다. G2는 서로 다른 Node/property의 안전한 동시 편집만 허용한다. 같은 계층을 동시에 구조 변경하는 고급 merge는 검증 이후 추가한다.

G3에서 공동 undo·연결 단절 복구·AI 명령을 결합한다. G4에서 10인 이상 팀에 적용한다. 실시간 협업이 실패하면 파일/scene 단위 잠금 모드로 전환하여 제작을 계속할 수 있어야 한다.

## 10. 완료 기준·재현 실험

| 시험 | 조건 | 계획용 통과 기준 |
|---|---|---|
| 동시 수정 | 3명이 서로 다른/같은 property·reparent 수정 | 수렴하거나 명시적 충돌, 묵시적 데이터 유실 0건 |
| operation 재전송 | 중복·순서 변경·연결 중단 1만 건 | 한 번만 적용, 최종 revision 일치 |
| 잠금 | owner 종료·만료·재획득·관리 해제 | 서로 다른 owner의 동시 독점 승인 0건 |
| UID/merge | rename·move·merge·resource 삭제 100개 | 깨진 참조를 build 전에 검출 |
| 복원 | 과거 snapshot 100개·대형 LFS asset | hash 일치, 해당 엔진으로 import/load 성공 |
| 응답 | 10인, RTT 80 ms·jitter 20 ms·1% loss | 단순 편집 확인 p95 300 ms 목표, 큰 asset 업로드 별도 |
| 권한 | 다른 project·권한 철회·stale token | 읽기·쓰기·review attachment 경계 유지 |

30인은 stress profile이며 사전 성능 보장이 아니다. 테스트에는 server instance·DB revision·engine commit·asset 크기·작업 유형·응답 p50/p95/p99를 기록한다. 동시 편집 게임과 멀티플레이 게임의 CCU를 같은 지표로 합치지 않는다.

## 11. 위험·대안·산출물

자동 scene merge가 안정적이지 않으면 작은 scene 구성과 독점 잠금으로 범위를 제한한다. Git 제공자의 lock API가 부족하면 자체 잠금 서비스와 서버측 검증을 사용하되 외부 도구로 우회 가능한 범위를 문서화한다. 모든 게임의 데이터 구조를 하나의 공동 scene schema로 강제하지 않는다.

산출물은 revision/operation API, snapshot 복원기, Git/LFS adapter, 잠금·presence editor addon, UID/scene 검사기, web review 연결, 충돌 해결 가이드, 장애 runbook이다.

## 12. 출처

2026-11-24 열람: [Godot Version control systems](https://docs.godotengine.org/en/stable/tutorials/best_practices/version_control_systems.html), [EditorVCSInterface](https://docs.godotengine.org/en/stable/classes/class_editorvcsinterface.html), [Git LFS Locking API](https://github.com/git-lfs/git-lfs/blob/main/docs/api/locking.md), [Rider UID 이동 지원 기록](https://www.jetbrains.com/rider/whatsnew/2025-1/). 직접 확인한 공개 기능을 토대로 계획했으며 실제 저장소·팀 권한 변경은 수행하지 않았다.

## 13. 조건부 구현 부록: Perforce·Unity VCS

### 13.1 착수 조건과 공통 adapter 계약

실제 사용 팀, vendor 지원 범위·계약, 접근 가능한 시험 서버와 두 개의 독립 workspace, 대상 CLI/server 버전을 확정한 뒤 adapter별 착수 여부를 결정한다. 아래 공수는 본체의 revision·snapshot·권한·LockService가 준비되어 있다는 가정의 추가 개발 추정이다. 서버 구축·라이선스·운영 비용, 기존 저장소 전체 이관, 모든 vendor 배포 형태 지원은 포함하지 않는다. 담당은 VCS 통합 엔지니어와 편집기·QA 지원으로 구성한다.

아래 이름은 새로 설계할 자체 API이며 Godot 또는 vendor의 기존 API 이름이 아니다. 구현은 vendor 공식 CLI를 격리된 실행 계층으로 호출하고 지원하는 구조화 출력·오류 코드를 파싱한다. 명령 인자는 배열로 전달하며 경로·메시지를 shell 문자열로 합치지 않는다.

```text
VcsAdapter.capabilities() -> {provider, version, workspace_mode, lock_scope}
VcsAdapter.sync_to_revision(workspace, revision, preserve_dirty=true) -> SyncResult
VcsAdapter.checkout(paths, expected_revision, lock_policy, lease_generation) -> PathResults
VcsAdapter.submit(change_set, operation_id, expected_parent_revision) -> SubmitResult
VcsAdapter.query_locks(paths) -> ProviderLock[]
VcsAdapter.reconcile_lease(local_lease, provider_lock) -> ReconcileResult
VcsAdapter.restore_checkpoint(checkpoint_id, expected_workspace_state) -> RestoreResult
```

`ProviderLock`은 provider·repository·path·owner·workspace·branch_scope·state·조회 시각을 보존한다. `SubmitResult`는 외부 changelist/changeset ID와 내부 immutable revision을 연결한다. `PathResults`에는 성공·충돌·권한 거절·상태 불명과 경로별 잠금 결과를 포함하여 일부 checkout 성공을 전체 성공으로 표시하지 않는다. checkout의 원자성은 vendor별 capability로 표현하고 부분 성공이면 새로 획득한 잠금만 안전하게 정리하거나 사용자에게 유지 여부를 제시한다.

stale lease·연결 단절·인증 만료 시 편집기의 새 공유 revision 게시와 submit을 막되 미저장 작업은 로컬 checkpoint로 보존한다. 재접속 후 외부 잠금·최신 revision·workspace 소유자를 조회하고 일치할 때만 내부 lease generation을 갱신한다. 자체 lease 만료를 이유로 vendor 잠금을 자동 강제 해제하지 않는다. 관리자 해제 이후 옛 generation의 요청은 거절하고 이전 소유자·사유·새 소유자를 감사 기록에 남긴다.

credential은 OS 보안 저장소 또는 vendor의 지원 인증 저장 경로를 참조하며 프로젝트 파일·snapshot·로그에는 비밀 값 대신 참조 ID만 둔다. submit 응답이 유실되면 operation ID와 연결된 pending/submitted 상태를 조회하여 결과를 조정하고 무조건 재전송하지 않는다. provider에서 결과를 확인할 수 없으면 `outcome_unknown`을 유지하여 사람이 확인할 수 있게 한다.

### 13.2 선택 A: Perforce adapter — 추가 8-14 PW

확인한 사실: Perforce의 `p4 lock`은 다른 사용자의 submit을 제한하지만 edit 자체를 막지 않는다. 바이너리 독점 checkout에는 `+l` 파일 유형과 필요 시 관리자의 `p4 typemap` 설정을 사용한다. adapter는 이를 서로 다른 잠금 능력으로 표시한다. [공식 exclusive-open 설명](https://help.perforce.com/helix-core/server-apps/cmdref/current/Content/P4Guide/resolve.lock.exclusive.html)

`p4 edit`로 연 파일은 submit 전까지 depot 변경이 아니며, submit은 changelist를 게시한다. 인증 ticket은 만료·logout을 고려해야 한다. 아래 작업은 이 동작을 협업 서비스의 snapshot·revision 계약과 연결하는 제안이다. [p4 edit](https://help.perforce.com/helix-core/server-apps/cmdref/current/Content/CmdRef/p4_edit.html), [p4 submit](https://help.perforce.com/helix-core/server-apps/cmdref/current/Content/CmdRef/p4_submit.html), [p4 login](https://help.perforce.com/helix-core/server-apps/cmdref/current/Content/CmdRef/p4_login.html)

| 작업 ID | 구현 작업 | 추가 PW | 산출물·완료 조건 |
|---|---|---:|---|
| P4-01 | client/workspace·depot view·revision 매핑, 상태 조회, ticket 참조·만료 처리 | 2-3 | 지원 버전 표, 연결 진단, 접근 범위 밖 파일 차단 |
| P4-02 | sync·edit/add/delete·pending changelist·submit, 사전 checkpoint와 결과 복구 | 3-5 | 내부 operation과 changelist 매핑, 응답 유실 후 중복 submit 방지 |
| P4-03 | binary `+l` 규칙 점검, provider 잠금과 lease 조정, 소유자·해제 UI | 2-4 | 독점 checkout 시험, stale generation 거절, 관리자 해제 감사 |
| P4-04 | 두 workspace 장애 시험, revert/복원, 편집기 통합·운영 가이드 | 1-2 | 13.4절 회귀 결과와 제한 목록 |
| 합계 | Perforce 조건부 adapter | **8-14** | 본체 28-46 PW에 미포함 |

sync는 작업 파일·have revision·pending changelist를 먼저 기록하고 dirty 파일의 덮어쓰기를 차단한다. 통합 `checkout`은 Perforce edit와 대응시키되 바이너리에서는 서버 `+l` 규칙과 실제 획득 결과를 함께 확인한다. submit 직전에 base와 열린 파일 목록을 다시 검사하고 다른 외부 도구의 변경이 있으면 resolve 대상으로 돌린다.

rollback은 로컬 checkpoint 복원과 게시된 변경의 되돌림을 구분한다. `p4 revert` 호출 전 대상 목록과 checkpoint를 확정한다. 이미 게시한 변경은 검토 가능한 새 changelist로 되돌리며 기존 history를 삭제하지 않는다. [p4 revert 공식 동작](https://help.perforce.com/helix-core/server-apps/cmdref/current/Content/CmdRef/p4_revert.html)

위험은 workspace/view 설정 차이와 외부 편집기의 잠금 상태 변경이다. 처음에는 단일 중앙 서버·고정 workspace 구성만 지원하고 분산 replica·복잡한 stream 이관은 별도 설계로 둔다. 잠금 규칙을 설정할 권한이 없으면 binary 독점 편집 기능을 비활성화하고 read-only 연결 또는 snapshot 기반 수동 반영을 제공한다.

### 13.3 선택 B: Unity VCS adapter — 추가 6-10 PW

확인한 사실: Unity VCS CLI는 `cm checkout`과 기계 판독 출력 옵션을 제공하며 서버의 lock rule에 해당하는 파일은 독점 checkout 대상이다. 잠금 실패를 건너뛰는 `--ignorefailed`를 전체 성공으로 해석하지 않는다. [공식 checkout CLI](https://docs.unity.com/en-us/unity-version-control/uvcs-cli/checkout)

Smart Locks는 destination branch 범위와 `Locked`/`Retained` 상태를 구분한다. 다른 branch에서 checkin된 파일은 retained 상태가 될 수 있으며 최신 revision에서 다시 checkout할 수 있다. 이를 만료된 잠금이나 임의의 옛 revision을 편집해도 되는 상태로 표현하지 않는다. replica 간 전역 잠금은 보장 대상으로 두지 않는다. [공식 Smart Locks 설명](https://docs.unity.com/en-us/unity-version-control/smart-locks)

| 작업 ID | 구현 작업 | 추가 PW | 산출물·완료 조건 |
|---|---|---:|---|
| UVCS-01 | repository·workspace·selector·changeset 매핑, 인증 참조·상태 조회 | 2-3 | 지원 모드/버전 표, 저장소·branch 범위 검사 |
| UVCS-02 | update·checkout·checkin 연결, checkpoint·응답 유실 복구 | 2-3 | 내부 revision과 changeset 매핑, dirty 파일 보존 |
| UVCS-03 | Smart Locks rule·destination branch·retained 상태와 lease 조정 | 1-2 | 잠금 상태 UI, 최신 revision 검사, stale generation 거절 |
| UVCS-04 | 두 workspace·branch 장애 시험, rollback·편집기 통합 가이드 | 1-2 | 13.4절 회귀 결과와 Gluon 지원 여부 결정 |
| 합계 | Unity VCS 조건부 adapter | **6-10** | 본체 28-46 PW에 미포함 |

첫 지원 모드는 full workspace다. 통합 `sync_to_revision`은 workspace update, `submit`은 checkin으로 매핑한다. branch/selector를 고정한 뒤 update하고 실행 전후 changeset·dirty 상태를 확인한다. Gluon partial workspace는 capability에서 구분하고 별도 시험을 통과한 명령만 허용한다. 이 공수에서 Gluon 전체 workflow 지원을 약속하지 않는다. [공식 update](https://docs.unity.com/en-us/unity-version-control/uvcs-cli/update), [공식 checkin](https://docs.unity.com/en-us/unity-version-control/uvcs-cli/checkin), [Gluon checkin](https://docs.unity.com/unity-version-control/gluon/check-in-changes)

rollback은 변경 파일 checkpoint와 selector·changeset을 보존한 뒤 working copy를 복원한다. 게시한 변경을 되돌릴 때는 새 changeset을 만들고 원본 changeset과 검수 기록을 유지한다. retained 상태는 현재 최신 revision과 destination branch에 맞춰 재검증하며 adapter의 lease 만료만으로 제거하지 않는다.

위험은 branch별 잠금 의미와 full/partial workspace 혼용이다. 지원하지 않는 workspace 모드는 명시적으로 차단한다. Smart Locks를 시험 환경에서 검증하지 못하면 읽기·diff·검수 연결까지만 제공하고 독점 편집 지원으로 표시하지 않는다.

### 13.4 재현 가능한 추가 인수 시험과 합계

각 vendor에서 서로 다른 사용자·workspace A/B, 텍스트 10개와 병합 불가능한 binary 20개, 고정한 10개 revision을 준비한다. CLI/server 버전·workspace 설정·lock rule·branch·fixture hash·장애 주입 seed를 결과에 기록한다. 아래는 개발 후 수행할 계획용 기준이며 이번 문서 작성에서 실행한 결과가 아니다.

| 시험 | 재현 절차 | 계획용 통과 기준 |
|---|---|---|
| sync/update·checkout·submit | clean workspace에서 10개 revision을 차례로 sync/update하고 한 파일씩 checkout→수정→submit/checkin | 지정 revision 파일 hash와 외부/내부 revision 매핑 일치, A 게시 후 B가 같은 결과 수신 |
| dirty sync와 부분 checkout | 로컬 미게시 수정을 남긴 상태에서 update, 한 경로만 권한 거절 후 다중 파일 checkout | 작업 유실 0건, 부분 성공을 경로별 보고, 기존 잠금은 보상 처리로 해제하지 않음 |
| binary 독점 잠금 | 동일 lock scope에서 A/B가 같은 binary를 동시에 checkout하는 시험 100회 | 한 번에 독점 편집 승인 1개 이하, 실패한 사용자는 쓰기 게시 차단; P4 `+l`/UVCS rule 증거 보관 |
| stale lease·관리 해제 | A 잠금 후 연결 차단·내부 lease 만료, 관리 해제와 B 재획득 후 A 재접속 | 옛 generation의 submit 거절, A 작업 checkpoint 보존, 실제 provider 소유자와 UI 일치 |
| credential 만료·철회 | 인증 ticket/token 만료 또는 권한 철회 후 조회·checkout·submit을 각 10회 실행 | 미인가 변경 0건, 인증 갱신 경로 명확, 로그·snapshot·오류 화면의 비밀 값 노출 0건 |
| submit 응답 유실 | 서버가 게시를 마친 뒤 응답 연결을 끊고 같은 operation ID로 복구 요청 | provider 결과 확인 후 동일 revision 반환; 확인 불가 시 상태 불명 표시, 묵시적 중복 게시 0건 |
| rollback | dirty sync 직전 checkpoint와 게시 후 이전 revision 복원을 각각 실행 | 로컬 hash 복원, 게시 이력은 보존, 되돌림은 새 변경으로 추적, 타인의 후속 변경은 충돌로 표시 |
| UVCS retained·모드 | 다른 branch에서 binary checkin 후 최신/옛 revision checkout, full/partial workspace 접속 | retained 상태와 destination 범위 표시, 옛 revision 쓰기 차단, 미지원 모드 실행 차단 |

기본 계획은 **28-46 PW**다. Perforce만 선택하면 **36-60 PW**, Unity VCS만 선택하면 **34-56 PW**, 둘 다 선택하면 추가 **14-24 PW**, 본체 포함 **42-70 PW**다. 병렬 인력 투입으로 달력 기간이 같은 비율로 줄어든다고 가정하지 않는다. adapter별 시험을 통과한 구성만 지원 표에 등록하고 미통과 구성은 실험 지원 또는 지원 제외로 남긴다.

이 부록의 vendor 문서는 2026-11-24에 확인했다. 실제 credential 발급, vendor 서버 연결, 저장소 변경, adapter 구현과 인수 시험은 수행하지 않았다.
