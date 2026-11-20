# PlayHub-CDN M2 — 프로젝트 휴지통 및 플랜 하향 초과 용량 정책 구현 문서

- 브랜치 `PlayHub-CDN`, 기준 커밋 `ffd3e7d` · 2026-11-20
- 선행 구현: [M1_IMPLEMENTATION.md](M1_IMPLEMENTATION.md)
- 상태: **PASS_LOCAL**. 로컬 S3 에뮬레이터(SigV4 실검증)에서 M1·M2 전체 자동 시험을 통과했다.

## 1. 범위

| 포함 (M2) | 비고 |
|---|---|
| 프로젝트 휴지통(Soft-delete / Restore) | `cdn_projects.trashed_at` 컬럼 및 안전 마이그레이션 |
| 휴지통 프로젝트 변경 차단 | `save-plans` / `commits` / 버전 `restore` / `pin` / 업로드 `renew`·`complete` → `409 PROJECT_TRASHED` |
| GC 휴지통 영구 정리(`trashRetentionDays`, 기본 30일) | 만료 trashed 프로젝트 제거, 미참조 blob 정리·quota 환급, 보존 기간 내 핀/헤드 규칙 유지 |
| 플랜 하향 초과 용량(`overQuota`) 정책 | `GET /api/cdn/me/storage`의 `overQuota`·`trashedProjects`, `403 QUOTA_EXCEEDED` 차단 |

`hub/server/app.mjs` 등 공용 파일은 수정하지 않았으며, 모든 변경은 `hub/server/cdn/**`, `hub/tests/cdn*.mjs`, `docs/cdn/**` 범위 안에서 이루어졌다.

## 2. 스키마 및 설정 변경

### DB 스키마 (`hub/server/cdn/schema.mjs`)

- `cdn_projects` 테이블에 `trashed_at INTEGER` 컬럼을 추가했다.
- 기존 M1 데이터베이스와의 호환을 위해 `PRAGMA user_version`은 변경하지 않고, `ensureCdnSchema(db)` 내부에서 `PRAGMA table_info(cdn_projects)`를 확인한 뒤 컬럼이 없을 때만 `ALTER TABLE cdn_projects ADD COLUMN trashed_at INTEGER`를 실행한다.
- 조회·GC 성능을 위해 `CREATE INDEX IF NOT EXISTS cdn_projects_trashed ON cdn_projects(owner, trashed_at)`를 추가했다.

### 설정 (`hub/server/cdn/routes.mjs`)

- `DEFAULTS.trashRetentionDays = 30`을 추가하고 `resolveCdnSettings`에서 양의 정수(`>= 1`) 여부를 검증한다.

## 3. 상태 전이 및 불변 조건

### 프로젝트 수명주기 (`cdn_projects.trashed_at`)

```text
  [Active: trashed_at = NULL]
       │  DELETE /api/cdn/projects/:id (soft-delete, trashed_at 기록)
       ▼
  [Trashed: trashed_at != NULL] ── POST /api/cdn/projects/:id/restore (영구 삭제 전) ──▶ [Active]
       │
       │  GC: now() - trashRetentionDays * 86400s >= trashed_at
       ▼
  [Purged: DB 행 및 하위 commit/pin/plan/upload 영구 삭제 + 미참조 blob 회수]
```

1. **휴지통 보관 중(`trashed_at IS NOT NULL`)**:
   - 일반 `GET /api/cdn/projects`의 `projects` 목록에서는 제외되며, `trashedProjects` 필드 및 `GET /api/cdn/projects?trashed=1`(또는 `trashed=true` / `trashed=only`, 전체 조회는 `trashed=all`)로 조회할 수 있다.
   - 기존 `versions`, `manifest`, `downloads` 조회·다운로드는 유지된다(복구 전 백업·확인 허용).
   - `POST .../save-plans`, `POST .../commits`, `POST .../versions/:c/restore`, `POST .../versions/:c/pin`, `POST /api/cdn/uploads/:id/renew`, `POST /api/cdn/uploads/:id/complete`는 `409 PROJECT_TRASHED`로 차단된다(트랜잭션 내부에서 `trashed_at` 재확인 포함).
   - `DELETE /api/cdn/projects/:id` 재호출은 멱등하게 처리하며 기존 `trashed_at` 시각을 유지한다(보관 만료 시점이 연장되지 않음).
   - 보존 GC(`pruneHistory`)는 휴지통 보관 기간(`trashRetentionDays` 미만) 동안에도 M1과 동일하게 `head_commit_id` 및 `cdn_pins` 커밋을 보존한다.
2. **휴지통 만료 영구 제거(`gc.mjs` `purgeTrashedProjects`)**:
   - 실행 순서: `expirePlans` → `purgeTrashedProjects` → `pruneHistory` → `cleanPending` → `sweep`.
   - `trashed_at <= now() - trashRetentionDays * 86400_000`인 프로젝트를 대상으로 아직 `pruned_at IS NULL`인 커밋의 manifest를 읽고(헤드 커밋은 마지막에 처리), `BEGIN IMMEDIATE` 트랜잭션 안에서 `trashed_at` 만료 상태를 재확인한 뒤 `pruned_at` 기록·`cdn_pins` 삭제·`cdn_blobs.ref_count` 감소를 수행한다.
   - 모든 미정리 커밋이 처리된 뒤 미완료 `OPEN` save-plan 예약(`reserved_bytes`)을 반환하고, 외래 키 순서(`cdn_pins` → `cdn_uploads` → `cdn_save_plans` → `cdn_commits` → `cdn_projects`)로 행을 제거하며 quarantine 잔여 객체를 삭제한다.
   - 이후 `sweep` 단계가 `ref_count = 0 AND lease_until < now AND state_at < now - gcGraceMs` 조건을 만족하는 미참조 blob을 원격 저장소에서 삭제하고 `quota.refund`로 `used_bytes`를 환급한다. 다른 프로젝트가 dedup으로 참조 중인 blob(`ref_count >= 1`)은 유지된다.
   - 영구 제거 완료 후 `POST /api/cdn/projects/:id/restore`는 `404 PROJECT_NOT_FOUND`를 반환한다.

### 플랜 하향 초과 용량 정책 (`overQuota`)

- 판정 기준: `overQuota = usedBytes > limitBytes` (`usedBytes === limitBytes`는 정상 경계로 허용).
- 플랜 하향(`POST /api/admin/cdn/plan`) 시 기존 저장 데이터나 blob은 즉시 삭제하지 않고 한도(`limitBytes`)만 변경된다.
- `overQuota === true`일 때의 동작:
  - **차단(`403 QUOTA_EXCEEDED`)**: `POST /api/cdn/projects/:id/save-plans`(신규 파일 및 0바이트/재사용 save-plan 모두 포함), `POST /api/cdn/projects/:id/commits`(하향 이전에 생성된 open plan 커밋 포함). 트랜잭션 내부에서도 재검사한다.
  - **허용(`200`)**: `GET /api/cdn/me/storage`, `GET /api/cdn/projects`, `GET .../versions`, `GET .../commits/:c/manifest`, `POST .../downloads`, `DELETE /api/cdn/projects/:id`(휴지통 이동), `POST /api/cdn/projects/:id/restore`(신규 용량 미증가).
- 휴지통 프로젝트 영구 정리로 `usedBytes <= limitBytes`가 되거나 플랜을 다시 상향하면 `overQuota`가 `false`로 전환되어 업로드가 재개된다.
- `usedBytes <= limitBytes` 상태에서 단일 요청이 남은 용량을 초과할 때는 기존 M1과 동일하게 `422 STORAGE_LIMIT_EXCEEDED`를 반환한다.

## 4. API 변경 사항 (`/api/cdn/*`, `/api/admin/cdn/*`)

| 메서드·경로 | 변경 내용 | 응답 |
|---|---|---|
| `GET /api/cdn/me/storage` | `overQuota: usedBytes > limitBytes`, `trashedProjects` 추가 (`projects`는 active 수) | `200 { plan, limitBytes, usedBytes, reservedBytes, availableBytes, overQuota, projects, trashedProjects, pins, maxPins }` |
| `GET /api/cdn/projects` | active `projects`만 기본 반환, `trashedProjects` 함께 반환. `?trashed=1` / `true` / `only`는 휴지통만, `?trashed=all`은 전체 반환(잘못된 값은 `400 INVALID_QUERY`) | `200 { projects, trashedProjects }` |
| `DELETE /api/cdn/projects/:id` | 소유자 확인 및 CSRF 검증 후 soft-delete (`trashed_at` 기록) | `200 { project }` (`trashedAt` ISO 문자열 포함) |
| `POST /api/cdn/projects/:id/restore` | 영구 삭제 전 휴지통 프로젝트 복구 (`trashed_at = NULL`) | `200 { project }`, 영구 삭제 후 `404 PROJECT_NOT_FOUND` |
| `POST /api/cdn/projects/:id/save-plans` | 휴지통 차단(`409 PROJECT_TRASHED`), 초과 용량 차단(`403 QUOTA_EXCEEDED`) | `201` 또는 `409` / `403` |
| `POST /api/cdn/projects/:id/commits` | 휴지통 차단(`409 PROJECT_TRASHED`), 초과 용량 차단(`403 QUOTA_EXCEEDED`) | `201`/`200` 또는 `409` / `403` |
| `POST /api/cdn/projects/:id/versions/:c/restore` | 휴지통 차단(`409 PROJECT_TRASHED`) | `201`/`200` 또는 `409` |
| `GET /api/admin/cdn/status` | `projects: { active, trashed }` 집계 추가 | `200` |
| `POST /api/admin/cdn/plan` | 응답 `storage`에 `overQuota` 등 최신 storage 뷰 반환 | `200 { owner, storage }` |

오류 코드 추가: `PROJECT_TRASHED` (409), `QUOTA_EXCEEDED` (403), `INVALID_QUERY` (400).

## 5. 검증 결과

Node v24 (`C:\Users\taru0\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe`)로 전체 CDN 테스트 4개 파일을 실행했다.

```text
node.exe --test hub/tests/cdn-sigv4.test.mjs hub/tests/cdn-quota.test.mjs hub/tests/cdn-flow.test.mjs hub/tests/cdn-m2-trash-quota.test.mjs
```

| 테스트 파일 | 결과 | 검증 범위 |
|---|---|---|
| `hub/tests/cdn-sigv4.test.mjs` | 4/4 PASS | AWS 공식 SigV4 presign·헤더 서명, 만료·변조 거부 |
| `hub/tests/cdn-quota.test.mjs` | 3/3 PASS | 용량 경계, 플랜 업/다운그레이드, 동시 연결 stale read 방지 |
| `hub/tests/cdn-flow.test.mjs` | 12/12 PASS | M1 E2E 직접 업로드·검증·dedup·optimistic head·idempotency·GC·보안 |
| `hub/tests/cdn-m2-trash-quota.test.mjs` | 8/8 PASS | M1→M2 스키마 마이그레이션(`trashed_at`), soft-delete/목록 필터/차단(`409 PROJECT_TRASHED`)/복구, 소유권·CSRF·멱등성, `trashRetentionDays` GC 영구 삭제·공유 blob 유지·핀/헤드 보존·quota 환급, open plan 포함 조기 영구 삭제 정리, 플랜 하향 `overQuota` 차단(`403 QUOTA_EXCEEDED`)·조회/다운로드/휴지통 이동 허용·GC 후 재개, `usedBytes === limitBytes` 경계(`422 STORAGE_LIMIT_EXCEEDED`)·상향 복구, `trashRetentionDays` 설정 검증 |
| **합계** | **27/27 PASS (0 fail)** | 기존 19개 + 신규 8개 |
