# PlayHub 데이터 연동 설계 — `Dev` 선택 연결 · 로컬 테스트 데이터 영구 유지 · `Live → Dev` 비식별화 복제

## 1. 핵심 원칙 (2-Hop 보안 격리)
1. **개발 빌드 ↔ `Live` 직접 연결 원천 차단 (Fail-Closed)**:
   - 로컬 개발 서버([serve-apk-download.mjs](file:///D:/Github/GoDotProjects-worktrees/Hub-AOS/tools/aos/serve-apk-download.mjs))와 Android `debug`/`dev`/`test` APK([FarmServerRegistry.kt](file:///D:/Github/GoDotProjects-worktrees/Hub-AOS/android/app/src/main/java/com/playhub/aos/config/FarmServerRegistry.kt))는 **`Local` 또는 `Dev` Farm만 선택 가능**하며, `live` 프로덕션 호스트(`live.playhub.*`, `playhub-live-*`, `playhub.example.com`)는 입력 단계에서 거부한다.
2. **로컬 테스트 데이터 영구 유지**:
   - 로컬 테스트 DB와 커스텀 테스트 게임은 `artifacts/aos-local-data`(또는 `--data-dir`)에 영구 보관되며, `--data-source=local` ↔ `--data-source=dev` 전환 및 서버 재시작 시에도 기존 게스트 계정·세이브·연령 확인 상태·로컬 게임이 그대로 유지된다.
   - `dev` 오버레이 모드에서는 `GET /api/mobile/catalog` 및 `/games/*`만 `dev` Farm에서 Read-Only 조회(+ 로컬 디스크 캐시)하고, 모든 쓰기(`POST`/`PUT`/`PATCH`/`DELETE`)는 **100% 로컬 SQLite에만 저장**한다.
3. **`Live → Dev` 단방향 비식별화 복제 (Phase 1 완료 · Phase 2 GCP 연동 설계)**:
   - `live` 데이터는 개발자 PC로 원본 반출하지 않고, GCP 경계층에서 [sanitize-snapshot.mjs](file:///D:/Github/GoDotProjects-worktrees/Hub-AOS/hub/tools/sanitize-snapshot.mjs)로 **Allowlist 기반 PII 비식별화**를 수행한 뒤 `dev` 팜으로만 단방향 복제한다.

---

## 2. 구현 완료 항목 (Phase 1)

### 2.1 로컬 개발 서버 — `Dev` 선택 연결 + 로컬 테스트 데이터 유지
```bash
# 1) 순수 로컬 모드 (기본값 — 영구 dataDir: artifacts/aos-local-data)
node tools/aos/serve-apk-download.mjs

# 2) Dev Read-Only 오버레이 모드 (기존 로컬 세이브·로컬 테스트 게임 유지 + Dev 카탈로그/에셋 병합)
node tools/aos/serve-apk-download.mjs \
  --data-source dev \
  --dev-url https://playhub-dev-2611.run.app \
  --data-dir ./artifacts/aos-local-data
```
- `--data-source live` 또는 `--dev-url https://playhub-live-2611.run.app` 입력 시 `FORBIDDEN_DATA_SOURCE` / `FORBIDDEN_LIVE_HOST`로 즉시 종료.

### 2.2 `Live → Dev` Allowlist 비식별화 + `dev`/로컬 테스트 데이터 보존 CLI
```bash
node hub/tools/sanitize-snapshot.mjs \
  --from /secure/live-snapshot/platform.sqlite \
  --out /staging/dev-sanitized.sqlite \
  --source-env live \
  --target-env dev \
  --events-days 7 \
  --target-origin https://playhub-dev-2611.run.app \
  --preserve-from /dev-current/platform.sqlite \
  --preserve-prefixes local_,dev_,qa_
```
- **Fail-Closed Schema Allowlist**: `SCHEMA_ALLOWLIST`에 미등록된 테이블/컬럼 발견 시 즉시 중단(`SANITIZE_UNKNOWN_TABLE` / `SANITIZE_UNKNOWN_COLUMN`).
- **PII 제거/가명화**:
  - 전량 삭제: `sessions`, `oauth_states`, `mobile_tokens`, `audit`, `*_idempotency`, `merge_requests`
  - 결정적 HMAC 가명화: `users.display_name` (`DevUser_<8hex>`), `identities.subject` (`devsub_<16hex>`)
  - 아동/보호자 정보: `parental_consent_logs.guardian_contact_hash` 재솔팅(`sanitized_<16hex>`), `user_age_compliance.age_tier` 유지
  - 텔레메트리 서브셋: `events`, `errors`, `play_sessions` 최근 N일만 보존
- **기존 로컬/Dev 테스트 데이터 보존 (`--preserve-from`)**:
  - `local_`, `dev_`, `qa_` 접두사 테스트 계정과 그 종속 그래프(`identities`, `save_slots`, `save_slot_versions`, `wishlist_items`, `user_preferences`, `user_age_compliance`, `parental_consent_logs`)를 원형 보존.
  - `live`에 아직 없는 `dev`/로컬 전용 `game_overrides`, `hub_publications`, `creator_submissions`를 자동 병합 보존.
- **복원기 호환**: [restore-data.mjs](file:///D:/Github/GoDotProjects-worktrees/Hub-AOS/hub/tools/restore-data.mjs)의 `OPTIONAL_TABLES`에 `mobile_tokens`, `user_age_compliance`, `parental_consent_logs`, `cdn_*` 등록 완료.

### 2.3 Android Debug/Dev/Test APK — `Live` 호스트 차단 가드
- [FarmServerRegistry.kt](file:///D:/Github/GoDotProjects-worktrees/Hub-AOS/android/app/src/main/java/com/playhub/aos/config/FarmServerRegistry.kt): `isBlockedLiveHost()` 추가로 Custom URL 입력 시 `live.playhub.*`, `playhub-live-*`, `playhub.example.com` 차단.

---

## 3. Phase 2 설계 — Cloud Run GCS 영속화 및 GitHub Actions `sync-live-to-dev`
현재 Cloud Run([cloudrun-pipeline.yml](file:///D:/Github/GoDotProjects-worktrees/Hub-AOS/.github/workflows/cloudrun-pipeline.yml))의 `PLAYHUB_DATA_DIR`은 `/tmp/playhub-data` 임시 디스크 상태이므로, GCP 프로젝트 권한이 준비되면 아래 순서로 연결한다.
1. `playhub-live-2611` / `playhub-dev-2611`에 각각 전용 GCS 버킷(`gs://playhub-live-data-2611`, `gs://playhub-dev-data-2611`) 생성 및 Litestream(또는 주기적 `backup.mjs` 업로드) 연결.
2. 전용 서비스 계정 `live-to-dev-cloner`에 최소 권한 부여 (`live` 버킷 `objectViewer` + `dev` 버킷 `objectAdmin`). 개발자 계정은 `live` 버킷 접근 불가.
3. `.github/workflows/cloudrun-pipeline.yml`의 `workflow_dispatch`에 `action: sync-live-to-dev` 잡(`environment: live` 승인 게이트) 추가:
   - `dev` 현재 DB 사전 백업(`pre-sync-<ts>.sqlite`) → `sanitize-snapshot.mjs --preserve-from <dev-current>` 실행 → `dev` 버킷 원자적 교체 → `playhub-hub`(dev) 재기동 및 `/api/health`·`/api/mobile/catalog` 스모크 검증(실패 시 자동 롤백).
