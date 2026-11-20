# PlayHub-CDN M1 — R2 UGC 저장 MVP 구현 문서

- 브랜치 `PlayHub-CDN`, 기준 `PlayHub-Platform` 6f56080 · 2026-11-20
- 근거: `UGC_R2_Data_Auth_Server_Operations_v2_0_20261120.md`, 검토 결과는 [REVIEW_v2.0.md](REVIEW_v2.0.md)
- 상태: **PASS_LOCAL**. 로컬 S3 에뮬레이터(SigV4 실검증)에서 자동 시험을 통과했다. 실제 Cloudflare R2 계약 시험은 미수행이다(§7).

## 1. 범위

| 포함 (M1) | 제외 |
|---|---|
| 미배포 프로젝트 클라우드 저장과 버전 관리 | 휴지통·플랜 하향 정책 UI (M2) |
| presigned PUT 직접 업로드 → 서버 검증 → 불변 blob 승격 | 공개 빌드·콘텐츠 origin·CDN 게이트 (M3) |
| manifest 객체 + DB commit, 낙관적 head(409) | 독립 백업·런북 (M4), 부하·비용 실측 (M5) |
| Free/Pro 원자적 용량 예약·정산 | Workers + D1 이식 |
| 버전 목록, manifest 조회, 복원(새 commit), pin/unpin | Forge의 Drive → R2 전환 (`forge-gateway.mjs`, `forge/Tools/drive-*.cjs`) |
| 비공개 다운로드(attachment 서명), 참조 기반 GC | multipart(파일 상한 64MiB) |

Google Drive는 이 모듈의 어떤 경로에도 쓰이지 않는다.

## 2. 구성

```text
hub/server/cdn/
  sigv4.mjs         SigV4 query presign + header 서명 + 검증 (node:crypto, AWS 공식 벡터로 고정)
  object-store.mjs  S3 subset 어댑터 (quarantine/projects 역할, 키 레이아웃 화이트리스트)
  local-s3.mjs      개발·테스트용 파일시스템 S3 (서명·만료·서명 헤더 실검증, 장애 주입)
  schema.mjs        cdn_* 테이블 (CREATE IF NOT EXISTS, user_version 불변)
  quota.mjs         reserve/settle/release/charge/refund — 조건부 UPDATE
  service.mjs       save-plan, complete, commit, versions, manifest, restore, pin, download
  gc.mjs            계획 만료 → 이력 정리 → PENDING 정리 → 미참조 blob 삭제
  routes.mjs        /api/cdn/*, /api/admin/cdn/*, 설정 해석
```

`hub/server/app.mjs` 변경은 import, `createCdn` 생성, public/admin 라우트 체인 각 1줄, `close()`이다. `config.cdn.enabled !== true`이면 라우트와 테이블을 만들지 않는다.

### 객체 키 레이아웃 (클라이언트가 쓸 수 있는 것은 `q/`뿐)

| 버킷 역할 | 키 | 쓰는 주체 |
|---|---|---|
| quarantine | `q/{owner}/{uploadId}` | 브라우저(presigned PUT, 10분) |
| projects | `b/{owner}/{blobId}` | 서버(검증한 bytes만) |
| projects | `m/{owner}/{blobId}.json` | 서버(canonical manifest) |

`owner`는 `sha256("https://accounts.google.com\0" + sub)`이다. Forge 계정 키(`forge-account.mjs` `forgeAccountKey`)와 같은 값이다.

## 3. 상태와 불변 조건

### 업로드 (`cdn_uploads.state`)

| 상태 | 진입 | 예약 | quarantine 객체 | 다음 |
|---|---|---|---|---|
| UPLOADING | save-plan 생성 | 유지 | 클라이언트가 PUT | complete → VERIFYING, renew 가능 |
| VERIFYING | complete 요청(조건부 전이) | 유지 | 서버가 읽음 | VERIFIED / FAILED / 저장소 오류 시 UPLOADING. 10분 넘게 머물면 GC가 UPLOADING으로 되돌림 |
| VERIFIED | hash·크기 일치, 최종 키 기록 | 정산(used로 이동) 또는 재사용 시 반환 | 삭제 | commit 가능 |
| FAILED | 내용 불일치(422) | 즉시 반환 | 삭제 | 새 save-plan 필요 |
| EXPIRED | 계획 만료 후 GC | 반환 | GC가 삭제 | — |

### blob (`cdn_blobs.state`)

| 상태 | 의미 | quota |
|---|---|---|
| PENDING | DB에 먼저 알린 뒤 객체를 쓰는 중 | 미부과 |
| LIVE | 참조 가능. `ref_count` = 보존 commit 수, `lease_until` = save-plan 보호 | 부과 |
| DELETING | GC가 조건부로 확보했고 원격 삭제 중 | 부과(삭제 확정 시 환급) |
| DELETED | 원격 삭제 완료 | 환급됨 |
| ABANDONED | 오래된 PENDING을 GC가 확보함 | 미부과 |

불변 조건(테스트로 고정):

1. 참조 추가는 `WHERE state='LIVE'`일 때만 성공하고, GC 확보는 `WHERE state='LIVE' AND ref_count=0 AND lease_until<now`일 때만 성공한다. 둘 다 BEGIN IMMEDIATE 트랜잭션 안의 조건부 UPDATE이므로 둘이 동시에 이길 수 없다.
2. head commit과 pin된 commit은 정리하지 않는다. 최신본은 나이 때문에 지워지지 않는다.
3. `used_bytes`는 LIVE와 DELETING blob bytes의 합과 같다(소유자 내부 dedup, 각 blob을 1회만 계산).
4. 같은 부모에서 들어온 두 commit 중 하나만 head를 바꾼다. 나머지는 `409 PROJECT_HEAD_CHANGED`를 받는다.

### 보존 정책 (기본값, `config.cdn`)

- 일반 이력은 `retentionDays`(30일)를 넘었고 **동시에** 최신 `retentionCount`(100개) 밖일 때 정리한다.
  - 원문 1565행(또는)과 1598행(·)이 모호해서 보수적인 AND를 택했다. 확정이 필요하다.
- pin 상한은 소유자당 `maxPins`(200)이다.
- save-plan(업로드 세션)은 24시간 유지하고, presigned PUT은 600초, GET은 300초다.

## 4. API (`/api/cdn/*`)

모든 요청에 Google 로그인 세션이 필요하다(게스트는 `401 GOOGLE_LOGIN_REQUIRED`). mutation에는 `X-CSRF-Token`과 허용된 Origin이 필요하다. 다른 사용자의 프로젝트는 `404`로 응답한다.

| 메서드·경로 | 본문 | 응답 |
|---|---|---|
| `GET me/storage` | – | `plan, limitBytes, usedBytes, reservedBytes, availableBytes, projects, pins, maxPins` |
| `POST projects` | `{name}` | `201 {project:{id,name,hostSlug,headCommitId}}` |
| `GET projects` | – | `{projects:[...]}` |
| `POST projects/{id}/save-plans` | `{baseCommitId, files:[{path,sha256,bytes}]}` | `201 {planId, files:[{path,action:'reuse'|'upload',uploadId}], uploads:[{uploadId,sha256,bytes,put:{method,url,headers},urlExpiresAt}]}` |
| PUT `uploads[].put.url` | 파일 bytes (`content-type` 헤더 그대로) | R2/에뮬레이터 응답 200 |
| `POST uploads/{id}/complete` | `{}` | `{state:'VERIFIED'}`, 또는 `409 UPLOAD_NOT_RECEIVED` / `422 OBJECT_VALIDATION_FAILED` |
| `POST uploads/{id}/renew` | `{}` | 새 `put` URL |
| `GET uploads/{id}` | – | 상태 |
| `POST projects/{id}/commits` | `{planId, expectedHead, message}` + `Idempotency-Key` 헤더(선택) | `201 {commit}` 또는 같은 트리면 `200 {unchanged:true}` |
| `GET projects/{id}/versions` | – | `{versions:[{id,parentId,isHead,pinned,restoredFrom,...}]}` |
| `GET projects/{id}/commits/{c}/manifest` | – | `{files:[{path,sha256,bytes}]}` (blobId 비공개), 정리된 버전은 `410` |
| `POST projects/{id}/versions/{c}/restore` | `{expectedHead}` | `201 {commit:{restoredFrom}}` |
| `POST / DELETE projects/{id}/versions/{c}/pin` | – | `{pinned}` |
| `POST projects/{id}/downloads` | `{commitId?, path}` | `{get:{url}}`. URL에 `response-content-disposition=attachment`가 서명돼 있다 |

관리자(루프백 admin 리스너, 관리자 세션 필요):

- `GET /api/admin/cdn/status`
- `POST /api/admin/cdn/gc`
- `POST /api/admin/cdn/plan {owner, plan}`

오류 코드는 기획 01장 §8과 같다. M1에서 추가한 코드는 `UPLOADS_INCOMPLETE`, `BLOB_UNAVAILABLE`, `SAVE_PLAN_EXPIRED`, `SAVE_PLAN_CLOSED`, `UPLOAD_NOT_RECEIVED`, `PIN_LIMIT_EXCEEDED`다.

### 클라이언트 저장 순서

1. 로컬 파일마다 sha256과 bytes를 계산한다.
2. `save-plans`를 호출한다. 응답에서 `action:'upload'`인 파일만 `put.url`로 PUT하고 `complete`를 호출한다.
3. `commits`에 `expectedHead`(=save-plan의 `baseCommitId`)와 `Idempotency-Key`를 보낸다.
4. 409를 받으면 최신 head 기준으로 비교·병합 UI를 띄운다. 무조건 재전송하지 않는다.

## 5. 설정

`hub/config/*.json`의 `cdn` 블록 예시는 `hub/config/example.json`에 있다. 기본값은 `enabled:false`다.

```json
"cdn": {
  "enabled": true, "provider": "r2", "accountId": "<32-hex account id>",
  "buckets": {"quarantine": "ugc-quarantine-prod", "projects": "ugc-projects-prod"},
  "plans": {"free": 1000000000, "pro": 20000000000},
  "maxFileBytes": 67108864, "uploadUrlTtlSec": 600, "downloadUrlTtlSec": 300,
  "retentionDays": 30, "retentionCount": 100
}
```

- 비밀값은 환경변수로만 받는다: `PLAYHUB_R2_ACCESS_KEY_ID`, `PLAYHUB_R2_SECRET_ACCESS_KEY`. 설정 파일에 넣지 않는다.
- `provider:"local"`은 hub 데이터 폴더 아래 `cdn-local-s3/`에 에뮬레이터를 `127.0.0.1:<임의 포트>`로 띄운다.
  - `secureCookies:true`(운영)에서는 기동을 거부한다.
  - 루프백 주소라서 같은 PC 브라우저에서만 직접 업로드할 수 있다. 모바일·LAN 시험에는 r2 provider를 쓴다.

## 6. 실제 R2 연결 절차 (미수행 — 계정 작업 필요)

1. 버킷 2개(quarantine, projects)를 만든다. 공개 접근(r2.dev, custom domain)은 끈다.
2. API 토큰을 발급한다. 권한은 두 버킷에 한정한 Object Read & Write다. 발급한 값은 환경변수에 넣는다.
3. quarantine 버킷 CORS를 설정한다.
   - AllowedOrigins: 사용자 사이트 origin
   - AllowedMethods: `PUT`
   - AllowedHeaders: `content-type`
   - ExposeHeaders: `ETag`
   - MaxAge: 600
   - projects 버킷: 브라우저 다운로드용 `GET`만 허용
4. quarantine lifecycle을 둔다. 2일이 지난 객체는 삭제한다(GC가 놓친 시도에 대한 보험).
5. 계약 시험(§7)을 통과한 뒤 `enabled:true`로 바꾼다.

## 7. 검증 기록

Node 24.22.3(`tools/Gamer/runtime`)으로 실행했다. 시스템 Node v22는 hub가 기동을 거부한다.

| 시험 | 결과 |
|---|---|
| `hub/tests/cdn-sigv4.test.mjs` (AWS 공식 presign·헤더 서명 벡터, 만료·서명 헤더·경로 변조) | 4/4 PASS |
| `hub/tests/cdn-quota.test.mjs` (경계 ≤ limit, 플랜 변경, 두 연결의 stale read) | 3/3 PASS |
| `hub/tests/cdn-flow.test.mjs` (실 HTTP 직접 업로드 E2E, dedup, 무변경 저장, 422, 409 동시 commit, idempotency, 만료·renew, 복원·pin·보존 GC, lease와 GC 경합, PENDING 정리, 권한·CSRF, local provider 운영 차단) | 12/12 PASS |
| hub 전체 `node --test tests/*.mjs` | 228건 중 206 pass / 18 fail / 4 skip. CDN 연결을 뺀 기준 실행(209건)도 **같은 18건이 실패**한다 → 이번 변경으로 생긴 회귀 없음 |

- 기준 실행의 18건은 새 워크트리 환경 문제다. `hub/node_modules`(`parse5`)가 없고, `sync:webgames`가 만드는 `hub/games`도 없다. `npm install`과 `npm run sync:webgames` 뒤 다시 확인해야 한다.
- 로그 위치: `artifacts/cdn-m1/hub-test-full.log`, `artifacts/cdn-m1/hub-test-baseline.log` (gitignore 대상).

미수행 — 실제 R2 계정이 필요하다:

- presigned PUT에 서명된 `content-length`를 R2가 강제하는지(AT-023)
- presigned GET의 `response-content-disposition`·`response-content-type` override 지원 여부
- 실 버킷 CORS 동작(AT-024)
- `UNSIGNED-PAYLOAD` 서버 PUT 허용 여부
- 오류 응답 코드 매핑

## 8. 다음 단계 제안

1. R2 개발 계정에서 §7 계약 시험을 하고, 결과를 `PASS_R2`로 기록한다.
2. Forge 저장 경로를 R2로 전환한다. `DriveSnapshotStore`와 `ProjectDriveSync` 대신 이 API를 쓴다. Drive 코드는 내부 CI 용도로만 남긴다.
3. M2: 휴지통(30일), 플랜 하향 UX, 장기 한도 초과 정책.
4. M3: release 빌드, 프로젝트별 콘텐츠 origin(`hostSlug`), CDN 게이트, PSL 등록.
