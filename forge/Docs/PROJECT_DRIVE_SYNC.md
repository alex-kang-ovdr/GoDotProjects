# Durable project-to-Drive synchronization (disabled integration)

Tools/project-drive-sync.cjs bridges the existing PlatformStore contract to DriveSnapshotStore without changing PlatformStore or server.cjs. No live network/credentials were used. It is disabled by default and requires explicit enabled:true, a private directory, and a configured Drive adapter. Never configure this directory below a publicly served folder.

## Supported workflow

- syncProject(store, accountKey, projectId) captures the current project revision; syncSnapshot accepts an explicit authenticated account/project/revision/files snapshot.
- subscribeProject listens only to that project's created/project events. It does NOT automatically backfill history; call syncProject explicitly for initial state. Return value unsubscribes. onError receives only a redacted code, project ID and revision.
- An immutable JSON manifest per account/project/revision persists the payload/hash before allocating an ID. The allocated Google file ID is atomically persisted BEFORE any upload. States: pending, reserved, uploading, committed, failed.
- A timeout or crash after upload can retry using retryVersion with the SAME persisted file ID. DriveSnapshotStore validates matching existing metadata on 409. Do not delete failed manifests or allocate replacement IDs automatically.
- listVersions/getVersion expose status metadata, not payloads or credentials. Same revision with different content fails with revision_content_conflict. Corrupt manifests fail closed rather than overwriting data.
- Existing shared projects and the 20-entry local PlatformStore history remain unchanged. This journal retains synchronized snapshots independently, without automatic eviction. All retained files consume disk/Drive capacity.

## Safety and remaining deployment requirements

Account keys must come from server-verified identity and project authorization, never a client-supplied owner ID. The passed store must already be the account-scoped store. This module is not itself a public HTTP handler or identity verifier. It neither changes Drive permissions nor exposes Drive file URLs/tokens. Its file journal contains complete project source and must remain private.

Atomic writes use exclusive temporary files, fsync and same-directory rename. Instances share per-version queues within ONE Node process only. There is NO multi-process/distributed lock, transaction across quota and manifests, or directory-fsync power-loss guarantee. Use a real transactional DB or external lock before enabling multiple workers. A crash after allocating but before persisting an ID can abandon an unused ID; it cannot have uploaded a snapshot because allocation is persisted first.

No 100 GB quota enforcement, background retry scheduler, retention cleanup, automatic restore, user sharing, HTTP authorization, secret refresh, or live Drive verification is included. Explicit retry is available; subscription failures are recorded in the journal. Restart recovery must enumerate and retry failed/pending versions under the application's own scheduling policy. Keep existing revisions until upload commit is confirmed and apply revision conflict checks before any future restore.

Test: node --test Tests/project-drive-sync.test.cjs Tests/drive-snapshot-store.test.cjs. All Drive calls use a mock adapter during tests.

## Store integration hook

attachStore(accountKey, store, {onError}) wraps that account-scoped store's emit function to capture future created/project snapshots, including newly created projects. It writes the pending payload manifest synchronously before broadcasting, then uploads asynchronously. The returned disposer restores the hook; await disposer.flush() drains in-flight tasks on shutdown. Calling attach twice for the same store/account is idempotent; attaching a different account is rejected. Existing revisions are not automatically backfilled.

A successful local save does NOT mean Drive upload succeeded. Read getVersion/listVersions for committed/failed status and surface onError. The local project save and journal are two separate filesystem operations, not an atomic cross-file transaction: if disk enqueue fails after local save, the application must report unsynced state and retry syncProject. Do not acknowledge remote persistence from the local save response.

Both subscription hooks REQUIRE an explicit onError function. Integrations must retain/surface enqueue errors even when the filesystem could not write a manifest; do not use a no-op callback in deployment.

Drive 기본 revision 보존에 의존하지 않습니다. 이 어댑터는 버전별 별도 immutable 파일을 생성합니다. 개인 Drive 100GB 이용에는 운영자 OAuth 승인·토큰 공급이 필요하며 서비스 계정 자체 저장공간으로 가정하지 않습니다. 앱별 용량 한도·보존 기간·삭제 정책은 아직 구현하지 않았습니다.
