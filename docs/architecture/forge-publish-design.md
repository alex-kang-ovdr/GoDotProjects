# Forge-Publish 배포 기능 전수 검토 및 설계서

- **상태**: Phase A 확정 · 구현 착수 (2026-11-21)
- **작업 브랜치**: `Forge-Publish` (`PlayForge-Main` `d7e0ec4` 기준 분기)
- **연계 문서**:
  - [multiplayer-deploy-billing-plan.md](multiplayer-deploy-billing-plan.md) — SinglePlay/MO/MMO 배포 프로필 및 허브 포인트 과금 설계
  - [hub-forge-internal-api-design.md](hub-forge-internal-api-design.md) — Hub ↔ Forge `/internal/v1/*` 및 `ForgeGateway` 경계
  - [hub-forge-decoupling-plan.md](hub-forge-decoupling-plan.md) — P0(빌드 격리)~P6(멀티플레이 분리) 로드맵
  - [cloud-run-pipeline-plan.md](cloud-run-pipeline-plan.md) — Cloud Run + Turso + GCS 3단계-Lite 파이프라인

---

## 1. 현행 배포 기능 검토 (As-Is)

1. **승인 이후 Publish 파이프라인 단절**: `hub/server/creator-review.mjs`가 `publicationStatus: 'unpublished'`, `packageValidation: 'not_verified'`를 하드코딩해, 관리자 승인 후에도 아티팩트 배포·카탈로그 노출·롤백이 불가능했다.
2. **정적 파일 전용 카탈로그**: `hub/server/catalog.mjs`가 `hub/catalog/games.json` + `hub/games/<id>/game.manifest.json`만 동기 읽기해 동적 UGC 게시 및 CAS 포인터 전환을 지원하지 못했다.
3. **`/play/:projectId` 결함 및 보안 문제**: `hubAuth` 모드에서는 작성자 세션 뒤에만 열려 외부 공유 불가, 열어도 Forge 동일 origin + COOP/COEP 노출, Gateway/Internal 경로 릴리스는 `previewUrl` 누락으로 `404`가 발생했다.
4. **Manifest 계약 공백**: `release.manifest.json`(`deployProfile`)과 Hub `game.manifest.json` 파생 브리지가 없었다.
5. **에디터 배포 UX 단절**: `forge/OfficialGodot/platform.js`가 `window.prompt("배포 이름")` 한 줄로만 동작해 모드 선택, 예상 허브 포인트 계산기, 메타데이터, 빌드 로그, ZIP 다운로드, Hub 제출 연동이 부재했다.
6. **저장소 3분할 및 SDK 브리지 부재**: Drive/R2/GCS로 분산되어 있었으며, `hub/web/user/app.js`는 `/games/<id>/index.html`을 하드코딩하고 `playhub:connect` 14초 핸드셰이크를 강제했다.
7. **부수 결함**: `forge/Tools/package-windows-server.ps1`의 `$requiredTools`가 신규 모듈 다수를 누락해 패키징 기동 시 실패 상태였다.

---

## 2. 확정 설계 결정 (2026-11-21 승인)

1. **Phase A E2E 범위**: `Forge-Publish`에서 Hub Publication API + Forge 4단계 Publish Drawer + Admin 게시/롤백/차단 UI까지 한 번에 E2E로 연결한다.
2. **승인 후 게시 UX**: `메타데이터 승인(approved)`과 `라이브 게시(published)` 상태를 분리 유지하되, Admin UI에 **"승인 후 즉시 게시"** 원클릭 버튼을 제공한다.
3. **클라우드 아티팩트 스토리지 기준**: 로컬 단일클릭은 `ArtifactStoragePort`의 `local-fs` 구현으로 무설정 유지하고, Phase B 클라우드 백엔드는 `cloud-run-pipeline-plan.md`와 동일하게 **GCS + Cloudflare CDN**을 1순위로 채택한다(R2 교체 가능).
4. **에디터 진입점 우선순위**: Phase A는 주력인 **웹 에디터(`OfficialGodot/` 4단계 Publish Drawer)** 를 완성하고, 설치형 Godot 도크(`playforge_platform`)는 동일 API 기반 Phase B 확장으로 진행한다.

---

## 3. 목표 아키텍처 (3-Plane 분리)

- **Forge Plane (제작 · 빌드 · 불변 릴리스)**:
  - `forge/Tools/release-manifest.cjs`: 불변 `release.manifest.json`(`deployProfile` + `gameMetadata` + `artifacts.clientWeb`) 생성·검증·Hub `game.manifest.json` 파생 및 허브 포인트 예상 계산기 단일 소스.
  - `forge/Tools/playhub-godot-shell.js`: Godot Web Export `index.html` 자동 주입 브리지(PlayHub iframe `playhub:connect`/`MessageChannel`/`ready` 핸드셰이크 + 세이브/로케일 훅, 단독 실행 시 패스스루).
  - `forge/Tools/internal-api.cjs`: `GET /internal/v1/accounts/:key/projects/:pid/releases/:rid/package`로 검증된 `PlayForge-Web.zip` + `X-Artifact-Sha256` 제공.
  - `forge/OfficialGodot/publish-panel.js` + `publish-panel.css`: 4단계 Publish Drawer UX.
- **Hub Plane (신원 · 검증 · 심사 · Publication Pointer)**:
  - `hub/server/artifact-storage.mjs`: `ArtifactStoragePort`(`local-fs` 기본, `gcs`/`r2` 확장 seam) + 자체 엄격 ZIP 검증·안전 전개(Forge 모듈 직접 참조 금지 경계 준수).
  - `hub/server/ugc-publish.mjs`: `hub_publications` / `hub_publication_history` 테이블, CAS 원자 전환(`publish`, `rollback`, `status` Kill-Switch), 비공개/언리스티드 미리보기 생성(`POST /api/creator/publications/preview`), 합성 카탈로그 공급 및 `/play-ugc/<hostSlug>/<releaseId>/*` 쿠키 격리 서빙.
  - `hub/server/creator-review.mjs`: 확장 메타데이터(`gameSlug`, `visibility`, `deployMode`, `gameMetadata`), Forge 패키지 실측 검증(`packageValidation: 'verified'`), 실제 `publicationStatus` 연동.
  - `hub/server/catalog.mjs`: 정적 카탈로그(`games/`) + 동적 UGC 카탈로그(`hub_publications`) 합성(정적 ID 보호).
- **Delivery Plane (격리 서빙 · Phase B/C 확장)**:
  - `hub/web/user/app.js`: 하드코딩 제거, `POST /api/play-sessions`의 `entryUrl` 직접 사용.
  - 로컬: `/play-ugc/<hostSlug>/<releaseId>/index.html`(인증 쿠키 미전송, `nosniff`, `frame-ancestors 'self'`, `sandbox="allow-scripts"`).
  - 운영(Phase B): `*.usercontent.<domain>` + 60초 `LaunchGrant` JWT.
  - 멀티플레이(Phase C): `deployProfile` 기반 MO/MMO 실행 풀 및 허브 포인트 원장 연동.

---

## 4. 구현 단계

- **Phase A (M1 — SinglePlay E2E Publish 완성)**: 매니페스트 계약, SDK 브리지 주입, 4단계 Publish Drawer, Hub Publication Engine(로컬 StoragePort + 동적 카탈로그 + Admin 게시/롤백/Kill-Switch UI), `previewUrl` 및 `package-windows-server.ps1` 결함 수정, E2E 자동화 테스트.
- **Phase B (M2 — 클라우드 StoragePort · 격리 Origin · 자동 QA · 바이너리 에셋)**: GCS/R2 어댑터, `*.usercontent.<domain>` + `LaunchGrant`, 제출 시 GamerQA 자동 트리거, 컨테이너 빌드 워커(P0).
- **Phase C (M3 — MO/MMO 서버 배포 & 허브 포인트 원장)**: `multiplayer-deploy-billing-plan.md` Phase 1~3 연계.
