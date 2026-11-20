# PlayHub · PlayForge 3단계-Lite 고정 파이프라인 설계안 (Cloud Run + Turso + GCS)

- 상태: 확정 및 Step 1 구현 중 (2026-11-20)
- 대상 프로젝트: `playhub-dev-2611`, `playhub-live-2611`, `forge-dev-2611`, `forge-live-2611`
- 관련 문서: [hub-forge-integration.md](hub-forge-integration.md), [hub-forge-decoupling-plan.md](hub-forge-decoupling-plan.md), [site-operations-plan.md](site-operations-plan.md)

---

## 1. 핵심 목표와 절대 불변 조건

1. **향후 라이브 이관 작업 0회**: 실제 유저 데이터가 쌓이기 전에 DB(Turso libSQL)·파일 저장소(GCS)·컨테이너 아티팩트·승격 파이프라인을 3단계-Lite(무중단 · 무상태 · 수평 확장 가능) 구조로 먼저 고정한다.
2. **초저비용 유지 (월 \$0 ~ \$2 목표)**: Cloud Run Always Free(`us-west1`), Artifact Registry 무료 한도(0.5 GB, 최근 5개 태그 유지), GCS `us-west1` Always Free(5 GB), Turso Free(5 GB · 월 5억 행 읽기), Cloudflare 무료 CDN을 조합한다.
3. **로컬 단일클릭 테스트 100% 유지**: [Run_PlayHub_Portable.cmd](../../Run_PlayHub_Portable.cmd), [Run_AgentReplay.cmd](../../Run_AgentReplay.cmd), `tools/start-platform.ps1` 및 로컬 SQLite 실행 경로는 절대 깨뜨리지 않는다.
4. **모바일(폰) 즉시 수정·테스트 보장**:
   - **즉시 확인 (수정 후 2초)**: PC에서 로컬 실행(`Run_PlayHub_Portable.cmd` / LAN HTTPS 또는 로컬 프리뷰)으로 같은 Wi-Fi 폰에서 F5 새로고침 즉시 검증.
   - **어디서나 확인 (푸시 후 1~2분)**: `PlayHub-Platform` 브랜치 푸시 시 GitHub Actions가 Cloud Run `playhub-dev-2611`에 자동 무중단 배포 → **고정 HTTPS URL(`https://playhub-hub-....run.app`)**을 폰 북마크로 열어 LTE/5G 어디서나 즉시 확인.

---

## 2. 고정 아키텍처 (5대 계약)

```text
[사용자 브라우저 (PC / 모바일)]
          │
          ▼ (Cloudflare 무료 DNS/CDN — 추후 도메인 연결 시 96MB WASM·정적 캐시)
   ┌──────┴──────────────────────────────────────┐
   ▼                                             ▼
[Cloud Run: playhub-hub]                 [Cloud Run: playhub-forge]
  • playhub-dev-2611 / live-2611           • forge-dev-2611 / live-2611
  • 무상태(Stateless), 0 → N 스케일        • COOP/COEP/CORP 헤더 전담
  • 100% 무중단 롤링/카나리/1초 롤백       • Hub 원격 세션 검증 (P1)
  • ROLE=admin 별도 비공개 서비스(IAM)     • P0 빌드/PIE 기본 차단 (fail-closed)
   │                                             │
   ▼                                             ▼
[공유 DB: Turso (libSQL)]                [공유 파일 저장소: GCS (us-west1)]
  • 로컬: file:platform.sqlite             • 로컬: LocalFsStorage
  • 클라우드: libsql://<db>.turso.io       • 클라우드: GcsStorage (무료 5 GB)
  • 동일 SQLite SQL 95% 호환               • 프로젝트·릴리스·미디어 첫날부터 GCS 저장
```

### 계약 1. DB 계약 (Step 2에서 적용, 로컬 호환 유지)
- **드라이버 통일**: `@libsql/client` 기반 `async/await` `DbPort` 도입.
  - `PLAYHUB_DB_URL` 미설정(로컬 단일클릭): 기존 `dataDir/platform.sqlite` 로컬 SQLite 사용.
  - `PLAYHUB_DB_URL=libsql://...` + `PLAYHUB_DB_AUTH_TOKEN`(클라우드): Turso 원격 DB 사용.
- **마이그레이션 규칙**: `hub/migrations/0001_*.sql` 순차 버전 파일 + **Expand–Contract(하위 호환 추가 우선)** 강제. 무중단 배포 중 구/신 리비전이 동시에 같은 DB에 접속해도 안전하게 유지한다.

### 계약 2. 저장소 계약 (Step 3에서 적용)
- Forge 프로젝트·릴리스·배포 아카이브·L10N 미디어를 `StoragePort(put/get/list/delete)`로 추상화.
- 로컬은 `LocalFsStorage`, Cloud Run은 `GcsStorage`(`PLAYHUB_GCS_BUCKET`)를 사용해 디스크 공유(`PLAYHUB_FORGE_ACCOUNTS_DIR`) 의존성을 제거한다.

### 계약 3. 컨테이너 아티팩트 계약 (Step 1에서 고정 완료)
- **Hub 이미지**: [deploy/cloudrun/hub/Dockerfile](../../deploy/cloudrun/hub/Dockerfile) + [deploy/cloudrun/hub/entrypoint.mjs](../../deploy/cloudrun/hub/entrypoint.mjs)
  - Node 24 비루트(`playhub`) 경량 이미지.
  - `ROLE=public`(기본): 정적 UI + 동적 `/config.js`(`apiBaseUrl: location.origin`) + `/api/*` 내부 프록시 + `/internal/*`·`/api/admin*` **404 차단** + 선택적 `/forge/*` 프록시.
  - `ROLE=admin`: 별도 비공개 Cloud Run 서비스(`Require authentication` + IAM)로 배포해 공용 인터넷과 완전 격리.
  - 기존 `hub/server/*`, `Run_PlayHub_Portable.cmd`, `tools/start-platform.ps1` 수정 없이 동작한다.
- **Forge 이미지**: [deploy/cloudrun/forge/Dockerfile](../../deploy/cloudrun/forge/Dockerfile)
  - Node 24 비루트 이미지, `OfficialGodot`(96 MB WASM)·`Studio`·`Templates`·`Tools`·`ws`/`yjs` 포함.
  - `PLAYHUB_FORGE_AUTH_MODE=hub` + `PLAYHUB_FORGE_EXECUTION_ALLOWLIST` 미설정(P0 fail-closed) 기본 적용.

### 계약 4. 불변 승격 파이프라인 (`Dev → QA → Live`, Step 1에서 고정 완료)
워크플로우: [.github/workflows/cloudrun-pipeline.yml](../../.github/workflows/cloudrun-pipeline.yml)

1. **Gate (자동)**: `check-ownership.mjs` + Hub/Forge 테스트 + Cloud Run 엔트리포인트 스모크 검증.
2. **Build (1회 불변 빌드)**: `hub:<sha>` · `forge:<sha>` 이미지를 **1회만 빌드**해 `us-west1-docker.pkg.dev/playhub-dev-2611/playhub-containers/`에 푸시하고 **이미지 다이제스트(`@sha256:...`)**를 확정한다.
3. **Dev 자동 배포**: `PlayHub-Platform` 푸시 시 확정 다이제스트를 `playhub-dev-2611` / `forge-dev-2611` Cloud Run에 무중단 배포 → **고정 HTTPS URL로 폰에서 즉시 새로고침 테스트**.
4. **QA 승격 (`workflow_dispatch: promote-qa`)**: 재빌드 없이 **동일 다이제스트**를 `--no-traffic --tag qa`로 배포 → 전용 QA URL(`https://qa---...run.app`) 생성 및 헬스·보안 헤더 자동 검증.
5. **Live 승격 (`workflow_dispatch: promote-live`)**: GitHub Environment `live` 수동 승인 후 QA 통과한 **동일 다이제스트**를 `playhub-live-2611` / `forge-live-2611`에 카나리(`10% → 50% → 100%`) 무중단 배포.
6. **1초 롤백 (`workflow_dispatch: rollback`)**: 재빌드 없이 지정 이전 리비전으로 트래픽 100% 즉시 복귀.

### 계약 5. 비용 · 보안 안전장치
- 4개 프로젝트 통합 예산 알림(`playhub-forge-cap-alert`, ₩1,000) + `stop-billing-killswitch` Cloud Run Function(**Active**) 상시 유지.
- Artifact Registry에 **최근 5개 이미지 태그만 유지**하는 정리 정책을 적용해 무료 한도(0.5 GB) 초과를 방지한다.
- GitHub Actions 인증은 장기 JSON 키 대신 **GCP Workload Identity Federation(WIF)**만 사용한다.
- 기존 임시 VM(`playhub-dev-vm`)은 Cloud Run 파이프라인 안정화 확인 후 중지/정리해 관리 대상을 단일화한다.

---

## 3. 단계별 실행 로드맵

- [x] **Step 0 (완료)**: GCP 4개 `-2611` 프로젝트, 무료 체험판, ₩1,000 예산 알림 + `stop-billing-killswitch`, 로컬 OAuth 설정
- [x] **Step 1 (이번 단계)**: 설계서 확정 + Hub/Forge `Dockerfile`·`entrypoint.mjs` + GitHub Actions 불변 승격 파이프라인 + `us-west1` Artifact Registry(`playhub-containers`) 준비 + 로컬 엔트리포인트 스모크 검증
- [ ] **Step 2**: `hub/server/db.mjs` 비동기 `DbPort` 전환 (로컬 SQLite 기본 유지 + Turso libSQL 어댑터 추가) + 회귀 테스트 통과
- [ ] **Step 3**: `ForgeGateway` 원격 HTTP 구현(`S4`) + `StoragePort` GCS 어댑터(`P3`) + `ROLE=admin` 비공개 Cloud Run 배포
- [ ] **Step 4**: GitHub WIF 연결 + `Dev → QA(--tag qa) → 1초 롤백` 3회 리허설 완료 → `playhub-live-2611` / `forge-live-2611` 승격 경로 확정 및 임시 `playhub-dev-vm` 정리
