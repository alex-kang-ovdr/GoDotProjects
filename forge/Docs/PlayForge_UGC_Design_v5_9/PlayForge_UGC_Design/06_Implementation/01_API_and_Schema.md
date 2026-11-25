# API·이벤트·데이터 계약

> PlayForge Cloud | 설계 기준 2026-11-17 | 제안 설계 (구현 완료 아님)

## HTTP API 예시

```text
GET  /api/v1/contents?type=asset&tag=low-poly
POST /api/v1/workspaces/{id}/commands
POST /api/v1/assets/{id}/versions
POST /api/v1/projects/{id}/assets:reuse
POST /api/v1/projects/{id}/pie:start
POST /api/v1/matches:find
POST /api/v1/releases:build
POST /api/v1/releases/{id}:publish
POST /api/v1/reports
GET  /api/v1/analytics/games/{id}
```

## Workspace Command

```json
{"commandId":"uuid","workspaceId":"w1","authorId":"u1","changeSetId":"cs1","expectedRevision":42,"type":"SetProperty","payload":{"actorId":"a1","property":"MoveSpeed","value":5.0}}
```

## 공통 이벤트

`asset_shared`, `asset_reused`, `pie_started`, `initial_sync_ready`, `match_assigned`, `game_play_started`, `release_published`, `report_submitted`. Analytics와 운영 로그는 목적/보존 정책을 분리한다.

## 식별자

ProjectId, GameId, AssetId, AssetVersion, ReleaseId, MatchId, RoomId, WorkspaceId, ActorGuid, NetObjectHandle, ChangeSetId. 런타임 FName Pool Index를 파일·네트워크 영구 식별자로 사용하지 않는다.

## 실패 모델

API는 `code/message/retryable/correlationId`를 공통 제공. 멱등 명령에는 CommandId/JobId, 비동기 작업에는 상태 조회와 취소를 제공한다.

## 권한

읽기/편집/배포/운영/신고 처리 권한 분리, 게임별 GDScript 권한 검증, EOS Secret 서버 보관, AI는 위임된 Command 범위만 호출.